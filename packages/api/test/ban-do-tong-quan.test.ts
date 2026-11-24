/**
 * **Bản đồ dự án — lượt 2: đường đọc Tổng quan** (SPEC 20.2–20.5; Chủ chốt T-127
 * = A, 04/11/2026), cộng ba điểm nhẹ reviewer L1.
 *
 *   A. `ban_do` cấp workspace: tên chủ (tâm cây) + đồng hồ WIP (đếm như L1).
 *   B. Mỗi hàng dự án: trường 20.1, tên agent quản lý, khối lớn (bỏ Huỷ/Trùng),
 *      Xong/Tổng, Mốc tới, mục Cần Chủ Chờ mới nhất.
 *   C. Ô Cần Chủ: danh sách mở ra mang cờ "dự án đang đẩy" (20.5).
 *   D. Số truy vấn không tăng theo số dự án/khối; tách workspace.
 *   E. Điểm nhẹ (a): `PATCH` dự án không trường 20.1 từ agent ⇒ `FORBIDDEN`.
 *   F. Điểm nhẹ (b): `GET /v1/cai-dat/workspace/lich-su` — chỉ chủ.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  TRAN_O_CAN_CHU,
  cauChoMoiNhat,
  cauKhoiLon,
  tongQuan,
} from '../src/doc-tong-quan.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  WS_KHAC,
  choVaoDuAn,
  dungAgent,
  dungAgentCoToken,
  dungCanChu,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  goiApi,
  xoaMemTicket,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const GIO = 1_760_000_000_000;
const P = 'pj-SAI';
const P_INC = 'pj-INC';

const TOKEN_COORD = 'bt_token_gia_coord_bando_l2';
const TOKEN_WORKER = 'bt_token_gia_worker_bando_l2';

async function datDuAn(id: string, cot: Record<string, string | number | null>): Promise<void> {
  const ten = Object.keys(cot);
  await env.DB.prepare(`UPDATE project SET ${ten.map((t) => `${t} = ?`).join(', ')} WHERE id = ?`)
    .bind(...ten.map((t) => cot[t] ?? null), id)
    .run();
}

async function datKhoi(ticket_id: string, khoi_lon: number, doi: number | null = null): Promise<void> {
  await env.DB.prepare('UPDATE ticket SET khoi_lon = ?, doi = ? WHERE id = ?')
    .bind(khoi_lon, doi, ticket_id)
    .run();
}

beforeEach(async () => {
  await dungWorkspace('Chủ Nguyễn');
  await dungAgent('ag-mgr', 'M-Sample', 'manager');
  await dungDuAn('SAI', 'Sample', 'active', 'ag-mgr');
  await dungDuAn('INC', 'Incubator');
});

/* ================================================================== *
 * A. Cấp workspace
 * ================================================================== */

describe('A. ban_do: tâm cây + đồng hồ WIP (20.2, 20.3)', () => {
  it('thân Tổng quan có `ban_do` với tên chủ và WIP mặc định 0/3', async () => {
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.ban_do).toEqual({
      ten_chu: 'Chủ Nguyễn',
      wip: { dang_day: 0, gioi_han: 3, vuot: false },
    });
  });

  it('đếm như L1: dang_day không lưu trữ; dự án duy trì/lưu trữ không đếm (#186)', async () => {
    await datDuAn(P, { dang_day: 1 });
    await datDuAn(P_INC, { dang_day: 1 });
    await dungDuAn('OLD', 'Cũ', 'archived');
    await datDuAn('pj-OLD', { dang_day: 1 });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.ban_do.wip).toEqual({ dang_day: 2, gioi_han: 3, vuot: false });
  });

  it('n BẰNG giới hạn ⇒ không vượt; n > giới hạn ⇒ vượt (20.2 "đỏ khi n > giới hạn")', async () => {
    await env.DB.prepare('UPDATE workspace SET gioi_han_wip = 2 WHERE id = ?').bind(WS).run();
    await datDuAn(P, { dang_day: 1 });
    await datDuAn(P_INC, { dang_day: 1 });
    expect((await tongQuan(env.DB, CHU, WS, GIO)).ban_do.wip).toEqual({
      dang_day: 2,
      gioi_han: 2,
      vuot: false,
    });
    await dungDuAn('THU', 'Thứ ba');
    await datDuAn('pj-THU', { dang_day: 1 });
    expect((await tongQuan(env.DB, CHU, WS, GIO)).ban_do.wip).toEqual({
      dang_day: 3,
      gioi_han: 2,
      vuot: true,
    });
  });

  it('đồng hồ của Tổng quan trùng số với GET /v1/cai-dat/workspace (một luật đếm)', async () => {
    await datDuAn(P, { dang_day: 1 });
    const cd = await (await goiApi('/v1/cai-dat/workspace', TOKEN_CHU)).json<{ wip: unknown }>();
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.ban_do.wip).toEqual(cd.wip);
  });
});

/* ================================================================== *
 * B. Hàng dự án
 * ================================================================== */

describe('B. hàng dự án: trường 20.1, khối lớn, Cần Chủ Chờ (20.3, 20.4)', () => {
  it('mang uu_tien, dang_day, duy_tri, ten_ngan, nhom và TÊN agent quản lý (không có ⇒ null)', async () => {
    await datDuAn(P, { uu_tien: 5, dang_day: 1, ten_ngan: 'SP', nhom: 'Sample' });
    await datDuAn(P_INC, { duy_tri: 1 });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const sai = tq.du_an.find((d) => d.id === P);
    const inc = tq.du_an.find((d) => d.id === P_INC);
    expect(sai).toMatchObject({
      uu_tien: 5,
      dang_day: true,
      duy_tri: false,
      ten_ngan: 'SP',
      nhom: 'Sample',
      quan_ly_ten: 'M-Sample',
    });
    expect(inc).toMatchObject({ uu_tien: 3, dang_day: false, duy_tri: true, ten_ngan: null, quan_ly_ten: null });
    // Không lộ id agent ra hàng (d.404).
    expect(Object.keys(sai ?? {})).not.toContain('quan_ly_agent_id');
  });

  it('khối lớn: chỉ ticket có khoi_lon, sắp theo khoi_lon rồi số (#183), bỏ Huỷ/Trùng/xoá mềm', async () => {
    const t1 = await dungTicket(P, 1, 'Khối ba', { trang_thai: 'todo' });
    const t2 = await dungTicket(P, 2, 'Khối một', { trang_thai: 'done' });
    const t3 = await dungTicket(P, 3, 'Khối hai đang làm', { trang_thai: 'in_progress' });
    const t4 = await dungTicket(P, 4, 'Khối hai trùng số', { trang_thai: 'verifying' });
    const t5 = await dungTicket(P, 5, 'Khối huỷ', { trang_thai: 'canceled' });
    const t6 = await dungTicket(P, 6, 'Khối trùng', { trang_thai: 'duplicate' });
    const t7 = await dungTicket(P, 7, 'Khối đã xoá', { trang_thai: 'todo' });
    await dungTicket(P, 8, 'Việc nhỏ, không khối');
    await datKhoi(t1, 3);
    await datKhoi(t2, 1);
    await datKhoi(t3, 2, 30);
    await datKhoi(t4, 2, 70);
    await datKhoi(t5, 4);
    await datKhoi(t6, 5);
    await datKhoi(t7, 6);
    await xoaMemTicket(t7);

    const sai = (await tongQuan(env.DB, CHU, WS, GIO)).du_an.find((d) => d.id === P);
    expect(sai?.khoi_lon.map((k) => [k.ma, k.khoi_lon, k.trang_thai, k.doi])).toEqual([
      ['SAI-2', 1, 'done', null],
      ['SAI-3', 2, 'in_progress', 30],
      ['SAI-4', 2, 'verifying', 70],
      ['SAI-1', 3, 'todo', null],
    ]);
    // Xong / tổng không Huỷ, không Trùng (20.1).
    expect([sai?.khoi_xong, sai?.khoi_tong]).toEqual([1, 4]);
    // Mốc tới = khối số nhỏ nhất chưa Xong (20.4).
    expect(sai?.moc_toi?.ma).toBe('SAI-3');
    expect(sai?.khoi_lon[1]?.nhan_trang_thai).toBe('Đang làm');
  });

  it('dự án không khối lớn ⇒ danh sách rỗng, 0/0, Mốc tới null; hết khối chưa xong ⇒ Mốc tới null', async () => {
    const t = await dungTicket(P_INC, 1, 'Xong rồi', { trang_thai: 'done' });
    await datKhoi(t, 1);
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const sai = tq.du_an.find((d) => d.id === P);
    const inc = tq.du_an.find((d) => d.id === P_INC);
    expect([sai?.khoi_lon, sai?.khoi_xong, sai?.khoi_tong, sai?.moc_toi]).toEqual([[], 0, 0, null]);
    expect([inc?.khoi_xong, inc?.khoi_tong, inc?.moc_toi]).toEqual([1, 1, null]);
  });

  it('Cần Chủ Chờ: cờ + mục MỚI NHẤT; mục đã xử lý/bỏ qua và mục Chung không tính', async () => {
    await dungCanChu('ct-cu', { project_id: P, tieu_de: 'Cũ', tao_luc: GIO - 3000 });
    await dungCanChu('ct-moi', { project_id: P, tieu_de: 'Mới nhất', tao_luc: GIO - 1000 });
    await dungCanChu('ct-xong', { project_id: P_INC, tieu_de: 'Đã xong', trang_thai: 'resolved', tao_luc: GIO });
    await dungCanChu('ct-bo', { project_id: P_INC, tieu_de: 'Bỏ qua', trang_thai: 'skipped', tao_luc: GIO });
    await dungCanChu('ct-chung', { project_id: null, tieu_de: 'Chung', tao_luc: GIO });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const sai = tq.du_an.find((d) => d.id === P);
    const inc = tq.du_an.find((d) => d.id === P_INC);
    expect(sai?.co_can_chu_cho).toBe(true);
    expect(sai?.can_chu_cho_moi_nhat).toMatchObject({ id: 'ct-moi', tieu_de: 'Mới nhất' });
    expect(sai?.can_chu_cho_moi_nhat?.ma).toMatch(/^T-\d+$/);
    expect([inc?.co_can_chu_cho, inc?.can_chu_cho_moi_nhat]).toEqual([false, null]);
  });

  it('câu khối lớn và câu Chờ mới nhất ràng workspace_id, lọc Huỷ/Trùng ngay trong SQL', () => {
    const k = cauKhoiLon(WS);
    expect(k.sql).toContain('t.workspace_id = ?');
    expect(k.sql).toContain("NOT IN ('canceled', 'duplicate')");
    expect(k.sql).toContain('t.khoi_lon IS NOT NULL');
    expect(k.bind[0]).toBe(WS);
    const c = cauChoMoiNhat(WS);
    expect(c.sql).toContain("ct.trang_thai = 'open'");
    expect(c.bind).toEqual([WS]);
  });
});

/* ================================================================== *
 * C. Ô Cần Chủ — 20.5
 * ================================================================== */

describe('C. ô Cần Chủ: danh sách mở ra biết dự án nào đang đẩy (20.5)', () => {
  it('`du_an_dang_day` đúng theo dự án của mục; mục Chung ⇒ false; thứ tự = thứ tự gấp nhất', async () => {
    await datDuAn(P_INC, { dang_day: 1 });
    await dungCanChu('ct-1', { project_id: P, muc: 'urgent', loai: 'decision' });
    await dungCanChu('ct-2', { project_id: P_INC, muc: 'today' });
    await dungCanChu('ct-3', { project_id: null, muc: 'later' });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu.ds_cho.map((m) => [m.id, m.du_an_dang_day])).toEqual([
      ['ct-1', false],
      ['ct-2', true],
      ['ct-3', false],
    ]);
    // `gap_nhat` (d.316) vẫn là 3 dòng đầu của cùng thứ tự.
    expect(tq.can_chu.gap_nhat.map((m) => m.id)).toEqual(['ct-1', 'ct-2', 'ct-3']);
  });

  it('dự án lưu trữ có cờ dang_day KHÔNG tính là đang đẩy (#186)', async () => {
    await dungDuAn('OLD', 'Cũ', 'archived');
    await datDuAn('pj-OLD', { dang_day: 1 });
    await dungCanChu('ct-old', { project_id: 'pj-OLD' });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu.ds_cho.find((m) => m.id === 'ct-old')?.du_an_dang_day).toBe(false);
  });

  it(`trần ${String(TRAN_O_CAN_CHU)} mục; gap_nhat vẫn đúng 3`, async () => {
    for (let i = 0; i < TRAN_O_CAN_CHU + 3; i += 1) {
      await dungCanChu(`ct-${String(i).padStart(3, '0')}`, { project_id: P, tao_luc: GIO - 10_000 + i });
    }
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu.ds_cho.length).toBe(TRAN_O_CAN_CHU);
    expect(tq.can_chu.gap_nhat.length).toBe(3);
    expect(tq.can_chu.so_cho).toBe(TRAN_O_CAN_CHU + 3);
  });
});

/* ================================================================== *
 * D. Không N+1, tách workspace
 * ================================================================== */

describe('D. số truy vấn cố định; dữ liệu tách theo workspace', () => {
  function demPrepare(): { db: D1Database; so: () => number } {
    let n = 0;
    const that = env.DB;
    const db = new Proxy(that, {
      get(t, k, r): unknown {
        if (k === 'prepare') {
          return (sql: string): D1PreparedStatement => {
            n += 1;
            return t.prepare(sql);
          };
        }
        return Reflect.get(t, k, r) as unknown;
      },
    });
    return { db, so: () => n };
  }

  async function dungDuAnCoKhoi(tu: number, den: number): Promise<void> {
    for (let i = tu; i < den; i += 1) {
      const pj = await dungDuAn(`K${String(i)}`, `Dự án ${String(i)}`);
      await datDuAn(pj, { dang_day: i % 2, nhom: `Nhóm ${String(i % 3)}` });
      for (let k = 1; k <= 3; k += 1) {
        const t = await dungTicket(pj, k, `Khối ${String(k)}`, { trang_thai: k === 1 ? 'done' : 'in_progress' });
        await datKhoi(t, k, k * 20);
      }
      await dungCanChu(`ct-k-${String(i)}`, { project_id: pj });
    }
  }

  it('2 dự án có khối và 12 dự án có khối: CÙNG một số truy vấn', async () => {
    await dungDuAnCoKhoi(0, 2);
    const d1 = demPrepare();
    const nho = await tongQuan(d1.db, CHU, WS, GIO);
    const n1 = d1.so();
    expect(nho.du_an.filter((d) => d.khoi_tong === 3).length).toBe(2);

    await dungDuAnCoKhoi(2, 12);
    const d2 = demPrepare();
    const lon = await tongQuan(d2.db, CHU, WS, GIO);
    expect(lon.du_an.filter((d) => d.khoi_tong === 3).length).toBe(12);
    expect(lon.du_an.filter((d) => d.co_can_chu_cho).length).toBe(12);
    expect(d2.so()).toBe(n1);
  });

  it('khối lớn, Cần Chủ, dang_day của workspace KHÁC không lọt vào', async () => {
    const t = Date.now();
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind(WS_KHAC, 'Chủ khác', t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, dang_day, tao_luc, cap_nhat_luc)
       VALUES ('pj-oth', ?, 'Khác', 'OTH', 'active', 1, ?, ?)`,
    )
      .bind(WS_KHAC, t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
                           chiu_trach_nhiem_loai, nguoi_tao_loai, khoi_lon, tao_luc, cap_nhat_luc)
       VALUES ('tk-oth', ?, 'pj-oth', 1, 'Khối khác', 'todo', 'none', 4, 'owner', 'owner', 1, ?, ?)`,
    )
      .bind(WS_KHAC, t, t)
      .run();

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.ban_do).toEqual({ ten_chu: 'Chủ Nguyễn', wip: { dang_day: 0, gioi_han: 3, vuot: false } });
    expect(tq.du_an.flatMap((d) => d.khoi_lon)).toEqual([]);
    expect(JSON.stringify(tq)).not.toContain('oth');
  });
});

/* ================================================================== *
 * E. Điểm nhẹ (a) — hành vi cũ của PATCH dự án
 * ================================================================== */

describe('E. (a) PATCH dự án không mang trường 20.1 ⇒ FORBIDDEN cho agent như trước L1', () => {
  beforeEach(async () => {
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
    await dungAgentCoToken({ id: 'ag-worker', ten: 'W', vai_tro: 'worker', token: TOKEN_WORKER });
    await choVaoDuAn('ag-worker', P);
  });

  const patch = (token: string, than: unknown, id = P): Promise<Response> =>
    goiApi(`/v1/du-an/${id}`, token, { method: 'PATCH', than });

  it('coordinator thân rỗng ⇒ 403 FORBIDDEN (không 422, không 404) — kể cả id bịa', async () => {
    for (const id of [P, 'pj-BIA']) {
      const r = await patch(TOKEN_COORD, {}, id);
      expect(r.status, id).toBe(403);
      expect((await r.json<{ error: string }>()).error).toBe('FORBIDDEN');
    }
  });

  it('coordinator chỉ trường cũ (khong_code) ⇒ 403; worker thân rỗng ⇒ 403', async () => {
    expect((await patch(TOKEN_COORD, { khong_code: true })).status).toBe(403);
    expect((await patch(TOKEN_WORKER, {})).status).toBe(403);
  });

  it('chủ thân rỗng vẫn ⇒ 422 INVALID_INPUT "Không có trường nào để sửa." như cũ', async () => {
    const r = await patch(TOKEN_CHU, {});
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: 'INVALID_INPUT', message: 'Không có trường nào để sửa.' });
  });

  it('ca đối chứng: coordinator có trường 20.1 vẫn ĐƯỢC', async () => {
    expect((await patch(TOKEN_COORD, { uu_tien: 4 })).status).toBe(200);
  });
});

/* ================================================================== *
 * F. Điểm nhẹ (b) — lịch sử giới hạn WIP
 * ================================================================== */

describe('F. (b) GET /v1/cai-dat/workspace/lich-su — chỉ chủ', () => {
  beforeEach(async () => {
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
  });

  const put = (v: number): Promise<Response> =>
    goiApi('/v1/cai-dat/workspace', TOKEN_CHU, { method: 'PUT', than: { gioi_han_wip: v } });

  it('chủ đọc được các lần đổi, mới nhất trước; không lẫn lịch sử dự án', async () => {
    expect((await put(4)).status).toBe(200);
    expect((await put(2)).status).toBe(200);
    // Một dòng lịch sử DỰ ÁN — không được lọt vào lịch sử workspace.
    expect((await goiApi(`/v1/du-an/${P}`, TOKEN_CHU, { method: 'PATCH', than: { uu_tien: 5 } })).status).toBe(200);

    const r = await goiApi('/v1/cai-dat/workspace/lich-su', TOKEN_CHU);
    expect(r.status).toBe(200);
    const trang = await r.json<{
      items: { truong: string; gia_tri_cu: string; gia_tri_moi: string; tac_gia: { loai: string } }[];
      cursor_sau: string | null;
    }>();
    expect(trang.items.map((d) => [d.truong, d.gia_tri_cu, d.gia_tri_moi]).sort()).toEqual([
      ['gioi_han_wip', '3', '4'],
      ['gioi_han_wip', '4', '2'],
    ]);
    expect(trang.items.every((d) => d.tac_gia.loai === 'owner')).toBe(true);
    expect(trang.cursor_sau).toBeNull();
  });

  it('phân trang keyset: limit=1 đi hết hai trang', async () => {
    await put(4);
    await put(5);
    const t1 = await (await goiApi('/v1/cai-dat/workspace/lich-su?limit=1', TOKEN_CHU)).json<{
      items: unknown[];
      cursor_sau: string | null;
    }>();
    expect(t1.items.length).toBe(1);
    expect(t1.cursor_sau).not.toBeNull();
    const t2 = await (
      await goiApi(`/v1/cai-dat/workspace/lich-su?limit=1&cursor=${encodeURIComponent(t1.cursor_sau ?? '')}`, TOKEN_CHU)
    ).json<{ items: unknown[] }>();
    expect(t2.items.length).toBe(1);
    expect(t2.items).not.toEqual(t1.items);
  });

  it('agent (kể cả coordinator) ⇒ 403 FORBIDDEN', async () => {
    await put(4);
    const r = await goiApi('/v1/cai-dat/workspace/lich-su', TOKEN_COORD);
    expect(r.status).toBe(403);
    expect((await r.json<{ error: string }>()).error).toBe('FORBIDDEN');
  });
});
