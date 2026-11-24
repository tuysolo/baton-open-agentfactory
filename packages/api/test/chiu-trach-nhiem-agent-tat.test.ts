/**
 * BAT-49 — **người chịu trách nhiệm** (SPEC mục 4) không đặt được là agent đã
 * tắt (Chủ chốt T-58 = A, 22/10). Cùng khuôn với người nhận lượt giao
 * (`nguoiNhanBatBuoc`): không thấy ⇒ `NOT_FOUND`; thấy mà tắt ⇒ `FORBIDDEN`;
 * rồi mới tới vai trò (`INVALID_INPUT`).
 *
 * Ticket gán trước khi agent bị tắt **giữ nguyên**: sửa trường khác, hay gửi lại
 * đúng người chịu trách nhiệm đang ghi, vẫn thành công. Người chịu trách nhiệm
 * mặc định rơi về chủ khi agent quản lý của dự án đã tắt (`cau-hoi-spec.md` #173).
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  TOKEN_CHU,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const P_NGOAI = 'pj-OUT';
const TK = 'tk-pj-SAI-1';

const MGR = 'ag-mgr';
const TOKEN_MGR = 'bt_tat_mgr';
/** Coordinator chung `pj-SAI` với `ag-mgr`, còn bật. */
const COORD = 'ag-coord';
/** Manager chung `pj-SAI`, đã tắt — `ag-mgr` thấy được. */
const TAT = 'ag-tat';
/** Coordinator đã tắt, chỉ ở `pj-OUT` — ngoài phạm vi `ag-mgr`. */
const X_TAT = 'ag-x-tat';
/** Manager còn bật, chỉ ở `pj-OUT`. */
const X_MGR = 'ag-x-mgr';
/**
 * Coordinator vào tất cả dự án (không có dòng `agent_project`). Coordinator vì
 * bảng quyền mục 3: `create_ticket` = mọi dự án được vào; manager chỉ dự án mình
 * quản lý.
 */
const ALL = 'ag-all';
const TOKEN_ALL = 'bt_tat_all';
const KHONG_CO = 'ag-khong-co-that';

beforeEach(async () => {
  await dungWorkspace();
  await dungAgentCoToken({ id: MGR, ten: 'M-Sample', vai_tro: 'manager', token: TOKEN_MGR });
  await dungDuAn('SAI', 'Sample', 'active', MGR);
  await dungDuAn('OUT', 'Dự án ngoài phạm vi', 'active');
  await choVaoDuAn(MGR, P);
  await dungAgentCoToken({ id: COORD, ten: 'CoS', vai_tro: 'coordinator', token: 'bt_tat_c', du_an: [P] });
  await dungAgentCoToken({
    id: TAT,
    ten: 'M-tat',
    vai_tro: 'manager',
    token: 'bt_tat_t',
    disabled: true,
    du_an: [P],
  });
  await dungAgentCoToken({
    id: X_TAT,
    ten: 'C-x-tat',
    vai_tro: 'coordinator',
    token: 'bt_tat_xt',
    disabled: true,
    du_an: [P_NGOAI],
  });
  await dungAgentCoToken({ id: X_MGR, ten: 'M-x', vai_tro: 'manager', token: 'bt_tat_xm', du_an: [P_NGOAI] });
  await dungAgentCoToken({
    id: ALL,
    ten: 'C-all',
    vai_tro: 'coordinator',
    token: TOKEN_ALL,
    vao_tat_ca_du_an: true,
  });

  await dungTicket(P, 1, 'Việc có sẵn', { trang_thai: 'todo', chiu_trach_nhiem_agent_id: COORD });
});

function taoTicket(token: string, agent_id: string, project_id = P): Promise<Response> {
  return goiApi('/v1/ticket', token, {
    method: 'POST',
    than: {
      project_id,
      tieu_de: 'Việc mới',
      chiu_trach_nhiem_loai: 'agent',
      chiu_trach_nhiem_agent_id: agent_id,
    },
  });
}

function suaTicket(token: string, than: Record<string, unknown>): Promise<Response> {
  return goiApi(`/v1/ticket/${TK}`, token, { method: 'PATCH', than });
}

function suaChiuTrachNhiem(token: string, agent_id: string): Promise<Response> {
  return suaTicket(token, { chiu_trach_nhiem_loai: 'agent', chiu_trach_nhiem_agent_id: agent_id });
}

async function tatAgent(id: string): Promise<void> {
  await env.DB.prepare('UPDATE agent SET disabled = 1 WHERE id = ?').bind(id).run();
}

async function ticketTrongDb(id: string): Promise<{
  tieu_de: string;
  uu_tien: string;
  chiu_trach_nhiem_loai: string;
  chiu_trach_nhiem_agent_id: string | null;
}> {
  const d = await env.DB.prepare(
    'SELECT tieu_de, uu_tien, chiu_trach_nhiem_loai, chiu_trach_nhiem_agent_id FROM ticket WHERE id = ?',
  )
    .bind(id)
    .first<{
      tieu_de: string;
      uu_tien: string;
      chiu_trach_nhiem_loai: string;
      chiu_trach_nhiem_agent_id: string | null;
    }>();
  if (d === null) throw new Error(`không có ticket ${id}`);
  return d;
}

async function phanHoi(res: Response): Promise<{ status: number; kieu: string | null; than: unknown }> {
  return { status: res.status, kieu: res.headers.get('content-type'), than: await res.json() };
}

const THONG_DIEP_TAT = 'Không đặt agent đã bị tắt làm người chịu trách nhiệm.';
const THONG_DIEP_VAI_TRO =
  'Người chịu trách nhiệm chỉ là chủ hoặc agent manager/coordinator (SPEC mục 4).';

async function doiVaiTro(id: string, vai_tro: string): Promise<void> {
  await env.DB.prepare('UPDATE agent SET vai_tro = ? WHERE id = ?').bind(vai_tro, id).run();
}

describe('BAT-49 — agent đã tắt không làm người chịu trách nhiệm được', () => {
  it('tạo ticket (chủ gọi): chịu trách nhiệm = manager/coordinator đã tắt → 403 FORBIDDEN', async () => {
    for (const id of [TAT, X_TAT]) {
      const res = await taoTicket(TOKEN_CHU, id);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN', message: THONG_DIEP_TAT });
    }
  });

  it('tắt kiểm trước vai trò: worker đã tắt → 403, không phải 422', async () => {
    await dungAgentCoToken({
      id: 'ag-wk-tat',
      ten: 'W-tat',
      vai_tro: 'worker',
      token: 'bt_tat_w',
      disabled: true,
      du_an: [P],
    });
    const res = await taoTicket(TOKEN_CHU, 'ag-wk-tat');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('sửa ticket đổi sang agent đã tắt → 403 FORBIDDEN, ticket không đổi', async () => {
    const truoc = await ticketTrongDb(TK);
    for (const [token, id] of [
      [TOKEN_CHU, TAT],
      [TOKEN_MGR, TAT],
    ] as const) {
      const res = await suaChiuTrachNhiem(token, id);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN', message: THONG_DIEP_TAT });
    }
    expect(await ticketTrongDb(TK)).toEqual(truoc);
    expect(truoc.chiu_trach_nhiem_agent_id).toBe(COORD);
  });

  it('ticket cũ gán agent nay đã tắt: giữ nguyên; sửa trường khác và gửi lại đúng người đều được', async () => {
    await tatAgent(COORD);
    expect((await ticketTrongDb(TK)).chiu_trach_nhiem_agent_id).toBe(COORD);

    expect((await suaTicket(TOKEN_CHU, { tieu_de: 'Đổi tiêu đề' })).status).toBe(200);
    expect((await suaTicket(TOKEN_MGR, { uu_tien: 'high' })).status).toBe(200);

    // Web/CLI có thể gửi lại nguyên trường — không đổi người thì không chặn.
    expect((await suaChiuTrachNhiem(TOKEN_CHU, COORD)).status).toBe(200);
    expect(
      (
        await suaTicket(TOKEN_MGR, {
          tieu_de: 'Lần nữa',
          chiu_trach_nhiem_loai: 'agent',
          chiu_trach_nhiem_agent_id: COORD,
        })
      ).status,
    ).toBe(200);

    const sau = await ticketTrongDb(TK);
    expect(sau).toMatchObject({
      tieu_de: 'Lần nữa',
      uu_tien: 'high',
      chiu_trach_nhiem_loai: 'agent',
      chiu_trach_nhiem_agent_id: COORD,
    });

    // Đổi đi rồi đổi lại sang agent đã tắt thì bị chặn — giờ là đổi người thật.
    expect((await suaTicket(TOKEN_CHU, { chiu_trach_nhiem_loai: 'owner' })).status).toBe(200);
    const res = await suaChiuTrachNhiem(TOKEN_CHU, COORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN', message: THONG_DIEP_TAT });
    expect((await ticketTrongDb(TK)).chiu_trach_nhiem_loai).toBe('owner');
  });

  it('agent ngoài phạm vi đã tắt → vẫn 404 GIỐNG HỆT id bịa (không lộ tồn tại lẫn trạng thái tắt)', async () => {
    const tao_ngoai = await phanHoi(await taoTicket(TOKEN_MGR, X_TAT));
    const tao_khong_co = await phanHoi(await taoTicket(TOKEN_MGR, KHONG_CO));
    expect(tao_ngoai.status).toBe(404);
    expect(tao_ngoai.than).toMatchObject({ error: 'NOT_FOUND' });
    expect(tao_ngoai).toEqual(tao_khong_co);

    const sua_ngoai = await phanHoi(await suaChiuTrachNhiem(TOKEN_MGR, X_TAT));
    const sua_khong_co = await phanHoi(await suaChiuTrachNhiem(TOKEN_MGR, KHONG_CO));
    expect(sua_ngoai.status).toBe(404);
    expect(sua_ngoai).toEqual(sua_khong_co);
  });

  it('agent vào tất cả dự án làm người gọi: hợp lệ → được; đã tắt → 403; id bịa → 404', async () => {
    // Thấy mọi agent: manager chỉ ở dự án khác vẫn đặt được, ở dự án bất kỳ.
    expect((await taoTicket(TOKEN_ALL, X_MGR)).status).toBe(201);
    expect((await taoTicket(TOKEN_ALL, COORD, P_NGOAI)).status).toBe(201);
    expect((await suaChiuTrachNhiem(TOKEN_ALL, X_MGR)).status).toBe(200);

    // Thấy được nên agent tắt ra FORBIDDEN, không phải NOT_FOUND.
    for (const id of [TAT, X_TAT]) {
      const tao = await taoTicket(TOKEN_ALL, id);
      expect(tao.status).toBe(403);
      expect(await tao.json()).toMatchObject({ error: 'FORBIDDEN', message: THONG_DIEP_TAT });
      const sua = await suaChiuTrachNhiem(TOKEN_ALL, id);
      expect(sua.status).toBe(403);
    }

    const bia = await taoTicket(TOKEN_ALL, KHONG_CO);
    expect(bia.status).toBe(404);
    expect(await bia.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect((await suaChiuTrachNhiem(TOKEN_ALL, KHONG_CO)).status).toBe(404);
  });

  it('dự án có agent quản lý đã tắt: tạo ticket không chỉ định → chịu trách nhiệm = chủ', async () => {
    await dungDuAn('TAT', 'Dự án quản lý đã tắt', 'active', TAT);
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-TAT', tieu_de: 'Không chỉ định' },
    });
    expect(res.status).toBe(201);
    const d = await env.DB.prepare(
      "SELECT chiu_trach_nhiem_loai, chiu_trach_nhiem_agent_id FROM ticket WHERE project_id = 'pj-TAT'",
    ).first<{ chiu_trach_nhiem_loai: string; chiu_trach_nhiem_agent_id: string | null }>();
    expect(d).toEqual({ chiu_trach_nhiem_loai: 'owner', chiu_trach_nhiem_agent_id: null });
  });

  it('đối chứng: dự án có agent quản lý còn bật → mặc định là agent đó', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: P, tieu_de: 'Không chỉ định' },
    });
    expect(res.status).toBe(201);
    const d = await env.DB.prepare(
      "SELECT chiu_trach_nhiem_agent_id FROM ticket WHERE project_id = ? AND tieu_de = 'Không chỉ định'",
    )
      .bind(P)
      .first<{ chiu_trach_nhiem_agent_id: string | null }>();
    expect(d?.chiu_trach_nhiem_agent_id).toBe(MGR);
  });
});

describe('BAT-50 — không đổi người thì không kiểm lại (agent nay đã đổi vai trò)', () => {
  it('ticket gán coordinator nay thành worker: sửa trường khác và gửi lại đúng người đều 200, giữ nguyên', async () => {
    await doiVaiTro(COORD, 'worker');

    // (a) Sửa trường khác.
    expect((await suaTicket(TOKEN_CHU, { tieu_de: 'Đổi tiêu đề' })).status).toBe(200);
    expect((await suaTicket(TOKEN_MGR, { uu_tien: 'high' })).status).toBe(200);

    // (b) Gửi lại đúng agent đang ghi — kể cả kèm trường khác.
    expect((await suaChiuTrachNhiem(TOKEN_CHU, COORD)).status).toBe(200);
    expect(
      (
        await suaTicket(TOKEN_MGR, {
          tieu_de: 'Lần nữa',
          chiu_trach_nhiem_loai: 'agent',
          chiu_trach_nhiem_agent_id: COORD,
        })
      ).status,
    ).toBe(200);
    expect(await ticketTrongDb(TK)).toMatchObject({
      tieu_de: 'Lần nữa',
      uu_tien: 'high',
      chiu_trach_nhiem_loai: 'agent',
      chiu_trach_nhiem_agent_id: COORD,
    });
  });

  it('đổi sang chủ rồi đổi lại agent nay sai vai trò → 422 INVALID_INPUT, ticket giữ chủ', async () => {
    await doiVaiTro(COORD, 'worker');
    expect((await suaTicket(TOKEN_CHU, { chiu_trach_nhiem_loai: 'owner' })).status).toBe(200);
    expect(await ticketTrongDb(TK)).toMatchObject({
      chiu_trach_nhiem_loai: 'owner',
      chiu_trach_nhiem_agent_id: null,
    });

    // Ticket đang gán chủ: không có agent hiện tại để miễn — kiểm vai trò như thường.
    const res = await suaChiuTrachNhiem(TOKEN_CHU, COORD);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT', message: THONG_DIEP_VAI_TRO });
    expect(await ticketTrongDb(TK)).toMatchObject({
      chiu_trach_nhiem_loai: 'owner',
      chiu_trach_nhiem_agent_id: null,
    });
  });

  it('ticket khác (gán agent khác) đổi sang agent sai vai trò → 422, ticket không đổi', async () => {
    const tk2 = await dungTicket(P, 2, 'Việc thứ hai', {
      trang_thai: 'todo',
      chiu_trach_nhiem_agent_id: MGR,
    });
    await doiVaiTro(COORD, 'worker');
    const truoc = await ticketTrongDb(tk2);

    const res = await goiApi(`/v1/ticket/${tk2}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { chiu_trach_nhiem_loai: 'agent', chiu_trach_nhiem_agent_id: COORD },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT', message: THONG_DIEP_VAI_TRO });
    expect(await ticketTrongDb(tk2)).toEqual(truoc);
    expect(truoc.chiu_trach_nhiem_agent_id).toBe(MGR);
  });

  it('agent vừa tắt vừa đổi vai trò, gửi lại đúng người → 200; đổi đi rồi đổi lại → 403 (tắt kiểm trước vai trò)', async () => {
    await tatAgent(COORD);
    await doiVaiTro(COORD, 'reviewer');

    expect((await suaChiuTrachNhiem(TOKEN_CHU, COORD)).status).toBe(200);
    expect((await ticketTrongDb(TK)).chiu_trach_nhiem_agent_id).toBe(COORD);

    expect((await suaTicket(TOKEN_CHU, { chiu_trach_nhiem_loai: 'owner' })).status).toBe(200);
    const res = await suaChiuTrachNhiem(TOKEN_CHU, COORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN', message: THONG_DIEP_TAT });
  });

  it('miễn trừ không mở rộng sang phạm vi: id ngoài phạm vi vẫn 404 dù ticket đang gán id đó', async () => {
    // Ticket gán X_MGR (chỉ ở pj-OUT) — MGR không thấy X_MGR.
    await env.DB.prepare('UPDATE ticket SET chiu_trach_nhiem_agent_id = ? WHERE id = ?')
      .bind(X_MGR, TK)
      .run();
    const ngoai = await phanHoi(await suaChiuTrachNhiem(TOKEN_MGR, X_MGR));
    const khong_co = await phanHoi(await suaChiuTrachNhiem(TOKEN_MGR, KHONG_CO));
    expect(ngoai.status).toBe(404);
    expect(ngoai).toEqual(khong_co);
    // Chủ thấy được: gửi lại đúng người thì 200.
    expect((await suaChiuTrachNhiem(TOKEN_CHU, X_MGR)).status).toBe(200);
  });
});
