/**
 * **Lịch sử ticket** — SPEC mục 4: "mọi thay đổi ghi 1 dòng (ai, lúc nào,
 * trường, cũ → mới). **Không sửa hay xoá được**."
 *
 * Hai nửa của luật, hai nhóm test:
 *   1. Mỗi loại thay đổi sinh **đúng** dòng lịch sử, với đủ bốn thông tin.
 *   2. **Không có đường nào** ghi lại lịch sử: không route, không lệnh trong sổ
 *      đăng ký cửa ghi, và DB chặn thêm một lớp bằng trigger.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { SO_DANG_KY_HANDLER } from '../src/lenh.js';
import { TRUONG_CLIENT } from '../src/index.js';
import {
  TOKEN_CHU,
  WS,
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

const TOKEN_COORD = 'bt_token_coord_lich_su';

interface DongLichSu {
  tac_gia_loai: string;
  tac_gia_agent_id: string | null;
  luc: number;
  truong: string;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
}

async function lichSu(ticket_id = 'tk-pj-SAI-1'): Promise<DongLichSu[]> {
  const { results } = await env.DB.prepare(
    `SELECT tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi
       FROM ticket_history WHERE ticket_id = ? ORDER BY luc, truong`,
  )
    .bind(ticket_id)
    .all<DongLichSu>();
  return results;
}

function dongCua(ds: DongLichSu[], truong: string): DongLichSu[] {
  return ds.filter((d) => d.truong === truong);
}

/* ================================================================== *
 * Luật 13a — mỗi thay đổi một dòng, đủ "ai · lúc nào · trường · cũ → mới"
 * ================================================================== */

describe('SPEC mục 4 — mọi thay đổi ghi 1 dòng lịch sử', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungTicket('pj-SAI', 1, 'Tiêu đề gốc', { trang_thai: 'todo', uu_tien: 'none' });
    await dungTicket('pj-SAI', 2, 'Ticket thứ hai');
  });

  it('đổi TRẠNG THÁI: đúng 1 dòng `trang_thai` với cũ → mới, kèm ai và lúc nào', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'backlog' },
    });
    expect(res.status).toBe(200);

    const dong = dongCua(await lichSu(), 'trang_thai');
    expect(dong).toHaveLength(1);
    expect(dong[0]).toMatchObject({
      tac_gia_loai: 'owner',
      tac_gia_agent_id: null,
      truong: 'trang_thai',
      gia_tri_cu: 'todo',
      gia_tri_moi: 'backlog',
    });
    expect(dong[0]!.luc).toBeGreaterThan(0);
  });

  it('đổi TIÊU ĐỀ: 1 dòng `tieu_de`, cũ → mới', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU, {
      method: 'PATCH',
      than: { tieu_de: 'Tiêu đề mới' },
    });
    const dong = dongCua(await lichSu(), 'tieu_de');
    expect(dong).toHaveLength(1);
    expect(dong[0]).toMatchObject({ gia_tri_cu: 'Tiêu đề gốc', gia_tri_moi: 'Tiêu đề mới' });
  });

  it('đổi ƯU TIÊN: 1 dòng `uu_tien`, cũ → mới', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU, {
      method: 'PATCH',
      than: { uu_tien: 'urgent' },
    });
    const dong = dongCua(await lichSu(), 'uu_tien');
    expect(dong).toHaveLength(1);
    expect(dong[0]).toMatchObject({ gia_tri_cu: 'none', gia_tri_moi: 'urgent' });
  });

  it('GẮN rồi BỎ nhãn: hai dòng `nhan`, hướng cũ → mới ngược nhau', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/nhan', TOKEN_CHU, {
      method: 'POST',
      than: { nhan: 'ha-tang', gan: true },
    });
    await goiApi('/v1/ticket/tk-pj-SAI-1/nhan', TOKEN_CHU, {
      method: 'POST',
      than: { nhan: 'ha-tang', gan: false },
    });

    const dong = dongCua(await lichSu(), 'nhan');
    expect(dong).toHaveLength(2);
    expect(dong.map((d) => [d.gia_tri_cu, d.gia_tri_moi])).toEqual(
      expect.arrayContaining([
        [null, 'ha-tang'],
        ['ha-tang', null],
      ]),
    );
  });

  it('gắn lại nhãn ĐÃ CÓ: không đổi gì thì KHÔNG ghi dòng nào', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/nhan', TOKEN_CHU, {
      method: 'POST',
      than: { nhan: 'ha-tang', gan: true },
    });
    await goiApi('/v1/ticket/tk-pj-SAI-1/nhan', TOKEN_CHU, {
      method: 'POST',
      than: { nhan: 'ha-tang', gan: true },
    });
    // Lịch sử ghi **thay đổi**, không ghi lệnh.
    expect(dongCua(await lichSu(), 'nhan')).toHaveLength(1);
  });

  it('NỐI LIÊN KẾT: ghi dòng ở CẢ HAI ticket (chiều xuôi và chiều ngược)', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/lien-ket', TOKEN_CHU, {
      method: 'POST',
      than: { den_ticket_id: 'tk-pj-SAI-2', loai_lien_ket: 'related' },
    });
    expect(res.status).toBe(200);

    expect(dongCua(await lichSu('tk-pj-SAI-1'), 'lien_ket:related')).toMatchObject([
      { gia_tri_cu: null, gia_tri_moi: 'tk-pj-SAI-2' },
    ]);
    expect(dongCua(await lichSu('tk-pj-SAI-2'), 'lien_ket_nguoc:related')).toMatchObject([
      { gia_tri_cu: null, gia_tri_moi: 'tk-pj-SAI-1' },
    ]);
  });

  it('AI làm được ghi đúng: agent để lại `agent` + id của mình', async () => {
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
    await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_COORD, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    const dong = dongCua(await lichSu(), 'trang_thai');
    expect(dong[0]).toMatchObject({ tac_gia_loai: 'agent', tac_gia_agent_id: 'ag-coord' });
  });

  it('thay đổi do HỆ THỐNG (ticket điều phối tự theo — 19.4) ghi tác giả `system`', async () => {
    await dungDuAn('COS', 'Điều phối');
    await dungTicket('pj-COS', 1, '[Giao M-Sample] Việc', { trang_thai: 'todo' });
    await env.DB.prepare(
      `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
       VALUES (?, 'tk-pj-COS-1', 'tk-pj-SAI-1', 'dieu_phoi', ?)`,
    )
      .bind(WS, Date.now())
      .run();

    await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });

    const dong = dongCua(await lichSu('tk-pj-COS-1'), 'trang_thai');
    expect(dong).toHaveLength(1);
    expect(dong[0]).toMatchObject({
      tac_gia_loai: 'system',
      tac_gia_agent_id: null,
      gia_tri_cu: 'todo',
      gia_tri_moi: 'in_progress',
    });
  });

  it('đổi nhiều trường trong MỘT lệnh → nhiều dòng, **cùng một mốc thời gian**', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU, {
      method: 'PATCH',
      than: { tieu_de: 'Tiêu đề mới', uu_tien: 'high', mo_ta: 'Mô tả mới' },
    });
    const ds = await lichSu();
    const truong = ds.map((d) => d.truong).sort();
    expect(truong).toEqual(['hang_uu_tien', 'mo_ta', 'tieu_de', 'uu_tien']);
    // Lịch sử nằm trong **cùng batch** với thay đổi, nên cùng `luc`.
    expect(new Set(ds.map((d) => d.luc)).size).toBe(1);
  });

  it('lệnh BỊ TỪ CHỐI không để lại dòng lịch sử nào', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'canceled' },
    });
    expect(res.status).toBe(422);
    expect(await lichSu()).toEqual([]);
  });

  it('nhưng luật "vừa từ chối vừa đổi" VẪN ghi lịch sử của phần đã đổi (19.2)', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(422);

    const dong = dongCua(await lichSu(), 'trang_thai');
    expect(dong.map((d) => [d.gia_tri_cu, d.gia_tri_moi])).toEqual([
      ['todo', 'in_progress'],
      ['in_progress', 'verifying'],
    ]);
  });

  it('đường ĐỌC lịch sử trả đủ bốn thông tin và áp đúng phạm vi', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'backlog' },
    });
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/lich-su', TOKEN_CHU);
    expect(res.status).toBe(200);
    const { items } = await res.json<{ items: Record<string, unknown>[] }>();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tac_gia: { loai: 'owner' },
      truong: 'trang_thai',
      gia_tri_cu: 'todo',
      gia_tri_moi: 'backlog',
    });
    expect(typeof items[0]!['luc']).toBe('number');

    // Ticket không tồn tại → 404 (không lộ sự tồn tại — SPEC mục 13).
    expect((await goiApi('/v1/ticket/tk-khong-co/lich-su', TOKEN_CHU)).status).toBe(404);
  });
});

/* ================================================================== *
 * Luật 13b — lịch sử KHÔNG sửa, KHÔNG xoá được
 * ================================================================== */

describe('SPEC mục 4 — lịch sử không sửa, không xoá được', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungTicket('pj-SAI', 1, 'Việc');
    await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'backlog' },
    });
  });

  it('SỔ ĐĂNG KÝ cửa ghi không có lệnh nào sửa hay xoá lịch sử', () => {
    // Cửa ghi là **đường ghi duy nhất**; không có lệnh nào thì không có đường nào.
    const loai = Object.keys(SO_DANG_KY_HANDLER);
    expect(loai.filter((l) => /lich_su|history/.test(l))).toEqual([]);

    // Và không lệnh nào nhận trường nào của bảng lịch sử từ client.
    const truong_client = Object.values(TRUONG_CLIENT).flat() as string[];
    for (const t of ['gia_tri_cu', 'gia_tri_moi', 'truong', 'luc', 'tac_gia_loai']) {
      expect(truong_client, t).not.toContain(t);
    }
  });

  it('đường HTTP của lịch sử chỉ có GET: PATCH/POST/PUT đều 404', async () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/lich-su', TOKEN_CHU, {
        method,
        than: { truong: 'trang_thai', gia_tri_moi: 'done' },
      });
      expect(res.status, method).toBe(404);
    }
    expect((await goiApi('/v1/ticket/tk-pj-SAI-1/lich-su', TOKEN_CHU)).status).toBe(200);
  });

  it('DB chặn thêm một lớp: UPDATE thẳng vào `ticket_history` bị trigger từ chối', async () => {
    await expect(
      env.DB.prepare("UPDATE ticket_history SET gia_tri_moi = 'done' WHERE ticket_id = ?")
        .bind('tk-pj-SAI-1')
        .run(),
    ).rejects.toThrow(/lich su chi them, khong sua/);

    const d = await env.DB.prepare(
      'SELECT gia_tri_moi FROM ticket_history WHERE ticket_id = ?',
    )
      .bind('tk-pj-SAI-1')
      .first<{ gia_tri_moi: string | null }>();
    expect(d?.gia_tri_moi).toBe('backlog');
  });

  it('DB chặn thêm một lớp: DELETE thẳng vào `ticket_history` bị trigger từ chối', async () => {
    await expect(
      env.DB.prepare('DELETE FROM ticket_history WHERE ticket_id = ?')
        .bind('tk-pj-SAI-1')
        .run(),
    ).rejects.toThrow(/lich su chi them, khong xoa/);

    const n = await env.DB.prepare(
      'SELECT count(*) AS n FROM ticket_history WHERE ticket_id = ?',
    )
      .bind('tk-pj-SAI-1')
      .first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('XOÁ ticket cũng không xoá lịch sử: dòng cũ còn, thêm 1 dòng `xoa_luc`', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/xoa', TOKEN_CHU, { method: 'POST' });
    const { results } = await env.DB.prepare(
      'SELECT truong FROM ticket_history WHERE ticket_id = ? ORDER BY truong',
    )
      .bind('tk-pj-SAI-1')
      .all<{ truong: string }>();
    expect(results.map((d) => d.truong)).toEqual(['trang_thai', 'xoa_luc']);
  });
});
