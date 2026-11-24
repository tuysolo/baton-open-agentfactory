/**
 * Cửa ghi `WorkspaceGate`.
 *
 * Luật được kiểm:
 *   * SPEC mục 1, 4 — số ticket **tăng dần trong dự án, không tái dùng**: hai
 *     lệnh ghi song song không được cấp trùng số (đây là lý do tồn tại của DO,
 *     vì D1 không có giao dịch tương tác).
 *   * SPEC mục 4 — mọi thay đổi ghi 1 dòng lịch sử (ai, lúc nào, trường, cũ → mới).
 *   * SPEC mục 13 — lỗi nghiệp vụ từ DO về đúng mã, 404 cho đối tượng ngoài phạm vi.
 *   * SPEC mục 13, 8 — chỗ cắm đánh thức lệnh chờ dài.
 */

import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { BatonError } from '@baton/shared';
import { cuaGhiCua, goiLenh, type WorkspaceGate } from '../src/workspace-gate.js';
import { caQuaSo, choRoiNem, soRequestBay } from './cho-toi.js';
import { CHU, WS, aiAgent, dungAgent, dungDuAn, dungTicket, dungWorkspace } from './giup.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

describe('cửa ghi tuần tự hoá đọc-kiểm-ghi', () => {
  let duAn = '';
  beforeEach(async () => {
    await dungWorkspace();
    duAn = await dungDuAn('SAI');
  });

  it('cấp số ticket tuần tự khi gọi lần lượt', async () => {
    const so: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const kq = await goiLenh(env, {
        loai: 'cap_so_ticket',
        workspace_id: WS,
        ai: CHU,
        project_id: duAn,
      });
      so.push(kq.so);
    }
    expect(so).toEqual([1, 2, 3]);
  });

  it('20 lệnh ghi SONG SONG vẫn cấp 20 số khác nhau, không tái dùng', async () => {
    const kq = await Promise.all(
      Array.from({ length: 20 }, () =>
        goiLenh(env, {
          loai: 'cap_so_ticket',
          workspace_id: WS,
          ai: CHU,
          project_id: duAn,
        }),
      ),
    );
    const so = kq.map((k) => k.so).sort((a, b) => a - b);
    expect(so).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(so).size).toBe(20);

    const dong = await env.DB.prepare(
      "SELECT gia_tri FROM bo_dem WHERE workspace_id = ? AND pham_vi = 'project' AND khoa = ?",
    )
      .bind(WS, duAn)
      .first<{ gia_tri: number }>();
    expect(dong?.gia_tri).toBe(20);
  });

  it('bộ đếm của hai dự án độc lập nhau', async () => {
    const duAn2 = await dungDuAn('COS', 'CoS');
    const [a, b] = await Promise.all([
      goiLenh(env, {
        loai: 'cap_so_ticket',
        workspace_id: WS,
        ai: CHU,
        project_id: duAn,
      }),
      goiLenh(env, {
        loai: 'cap_so_ticket',
        workspace_id: WS,
        ai: CHU,
        project_id: duAn2,
      }),
    ]);
    expect(a.so).toBe(1);
    expect(b.so).toBe(1);
  });

  it('bộ đếm T toàn workspace tăng dần (SPEC mục 8)', async () => {
    const kq = await Promise.all(
      Array.from({ length: 5 }, () =>
        goiLenh(env, { loai: 'cap_so_can_chu', workspace_id: WS, ai: CHU }),
      ),
    );
    expect(kq.map((k) => k.so).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('cửa ghi tự ghi lịch sử trong cùng batch (SPEC mục 4)', () => {
  let ticket = '';
  beforeEach(async () => {
    await dungWorkspace();
    await dungAgent('ag-1');
    const duAn = await dungDuAn('SAI');
    ticket = await dungTicket(duAn, 1, 'Tiêu đề cũ');
  });

  it('một thay đổi sinh đúng một dòng lịch sử: ai, lúc nào, trường, cũ → mới', async () => {
    const truoc = Date.now() - 1;
    await goiLenh(env, {
      loai: 'doi_tieu_de',
      workspace_id: WS,
      ai: aiAgent('coordinator', { agent_id: 'ag-1', vao_tat_ca_du_an: true }),
      ticket_id: ticket,
      tieu_de: 'Tiêu đề mới',
    });

    const { results } = await env.DB.prepare(
      'SELECT tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi FROM ticket_history WHERE ticket_id = ?',
    )
      .bind(ticket)
      .all<{
        tac_gia_loai: string;
        tac_gia_agent_id: string | null;
        luc: number;
        truong: string;
        gia_tri_cu: string;
        gia_tri_moi: string;
      }>();

    expect(results).toHaveLength(1);
    const d = results[0]!;
    expect(d.tac_gia_loai).toBe('agent');
    expect(d.tac_gia_agent_id).toBe('ag-1');
    expect(d.truong).toBe('tieu_de');
    expect(d.gia_tri_cu).toBe('Tiêu đề cũ');
    expect(d.gia_tri_moi).toBe('Tiêu đề mới');
    expect(d.luc).toBeGreaterThanOrEqual(truoc);

    const tk = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
      .bind(ticket)
      .first<{ tieu_de: string }>();
    expect(tk?.tieu_de).toBe('Tiêu đề mới');
  });

  it('tác giả là chủ thì lịch sử ghi owner, không có agent_id', async () => {
    await goiLenh(env, {
      loai: 'doi_tieu_de',
      workspace_id: WS,
      ai: CHU,
      ticket_id: ticket,
      tieu_de: 'Chủ đổi',
    });
    const d = await env.DB.prepare(
      'SELECT tac_gia_loai, tac_gia_agent_id FROM ticket_history WHERE ticket_id = ?',
    )
      .bind(ticket)
      .first<{ tac_gia_loai: string; tac_gia_agent_id: string | null }>();
    expect(d).toEqual({ tac_gia_loai: 'owner', tac_gia_agent_id: null });
  });

  it('lệnh hỏng thì KHÔNG để lại nửa vời: không đổi dữ liệu, không ghi lịch sử', async () => {
    await expect(
      goiLenh(env, {
        loai: 'doi_tieu_de',
        workspace_id: WS,
        ai: CHU,
        ticket_id: 'tk-khong-ton-tai',
        tieu_de: 'Không được ghi',
      }),
    ).rejects.toThrowError(BatonError);

    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket_history').first<{ n: number }>();
    expect(n?.n).toBe(0);
    const tk = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
      .bind(ticket)
      .first<{ tieu_de: string }>();
    expect(tk?.tieu_de).toBe('Tiêu đề cũ');
  });
});

describe('lỗi từ cửa ghi về đúng dạng SPEC mục 13', () => {
  beforeEach(async () => {
    await dungWorkspace();
    const duAn = await dungDuAn('SAI');
    await dungTicket(duAn, 1);
  });

  it('ticket của workspace khác trả NOT_FOUND, không lộ sự tồn tại', async () => {
    const loi = await goiLenh(env, {
      loai: 'doi_tieu_de',
      workspace_id: 'ws-khac',
      ai: CHU,
      ticket_id: 'tk-pj-SAI-1',
      tieu_de: 'x',
    }).catch((e: unknown) => e);

    expect(BatonError.la(loi)).toBe(true);
    expect((loi as BatonError).ma).toBe('NOT_FOUND');
    expect((loi as BatonError).http).toBe(404);
  });

  it('lệnh không có tên trong sổ đăng ký trả INVALID_INPUT', async () => {
    const res = await cuaGhiCua(env, WS).fetch('https://cua-ghi/lenh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loai: 'khong_co_lenh_nay', workspace_id: WS, tac_gia: CHU }),
    });
    expect(await res.json()).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
  });

  it('một lệnh hỏng không làm hỏng các lệnh sau trên cùng hàng đợi', async () => {
    const duAn = 'pj-SAI';
    const kq = await Promise.allSettled([
      goiLenh(env, {
        loai: 'doi_tieu_de',
        workspace_id: WS,
        ai: CHU,
        ticket_id: 'khong-co',
        tieu_de: 'x',
      }),
      goiLenh(env, { loai: 'cap_so_ticket', workspace_id: WS, ai: CHU, project_id: duAn }),
      goiLenh(env, { loai: 'cap_so_ticket', workspace_id: WS, ai: CHU, project_id: duAn }),
    ]);
    expect(kq[0].status).toBe('rejected');
    expect(kq[1].status).toBe('fulfilled');
    expect(kq[2].status).toBe('fulfilled');
  });
});

describe('chỗ cắm đánh thức lệnh chờ dài (SPEC mục 13 --wait, mục 8 ≤ 3 giây)', () => {
  it('cho() được danhThuc() gọi dậy', async () => {
    const stub = cuaGhiCua(env, WS);
    const duoc = await runInDurableObject(stub, async (gate: WorkspaceGate) => {
      const cho = gate.cho('tasks:ag-1', 10_000);
      // Chờ một nhịp để waiter kịp vào sổ.
      await Promise.resolve();
      try {
        expect(gate.soDangCho()).toBe(1);
        expect(gate.danhThuc('tasks:ag-1')).toBe(1);
      } catch (e) {
        // Assert đỏ: gọi dậy để `cho` (10 giây) không bị bỏ treo, giữ nguyên lỗi gốc.
        gate.danhThuc('tasks:ag-1');
        return choRoiNem(e, cho);
      }
      return cho;
    });
    expect(duoc).toBe(true);
  });

  it('hết thời gian chờ thì trả false (CLI thoát mã 4 — SPEC 19.9)', async () => {
    const stub = cuaGhiCua(env, WS);
    const duoc = await runInDurableObject(stub, (gate: WorkspaceGate) => gate.cho('khong-ai-goi', 5));
    expect(duoc).toBe(false);
  });

  it('đánh thức chủ đề khác thì không gọi dậy', async () => {
    const stub = cuaGhiCua(env, WS);
    const duoc = await runInDurableObject(stub, async (gate: WorkspaceGate) => {
      const cho = gate.cho('chu-de-A', 30);
      await Promise.resolve();
      expect(gate.danhThuc('chu-de-B')).toBe(0);
      return cho;
    });
    expect(duoc).toBe(false);
  });

  it('sổ waiter sạch sau khi được gọi dậy', async () => {
    const stub = cuaGhiCua(env, WS);
    await runInDurableObject(stub, async (gate: WorkspaceGate) => {
      const cho = gate.cho('chu-de', 1_000);
      await Promise.resolve();
      gate.danhThuc('chu-de');
      await cho;
      expect(gate.soDangCho()).toBe(0);
    });
  });
});
