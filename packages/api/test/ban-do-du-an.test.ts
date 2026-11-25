/**
 * **Bản đồ dự án — lượt 1: dữ liệu** (SPEC mục 20.1; Chủ chốt T-127 = A, 04/11/2026).
 *
 *   A. Migration 0029: mặc định của dữ liệu cũ, CHECK/trigger chặn giá trị sai,
 *      áp từ 0001→0029 trên DB thử, rollback áp được.
 *   B. Dự án (`PATCH /v1/du-an/:id`): khoảng giá trị, quyền theo vai trò, luật
 *      `duy_tri`/`dang_day`, đồng hồ WIP, lịch sử, đường đọc.
 *   C. Giới hạn WIP (`/v1/cai-dat/workspace`): khoảng, chỉ chủ, lịch sử.
 *   D. Ticket (`PATCH /v1/ticket/:id`): `khoi_lon`/`doi`, quyền, lịch sử, đường đọc.
 *   E. CLI `project set` / `ticket set` và MCP.
 *
 * Mọi câu hỏi SPEC im lặng đã chốt tạm (a)–(f) ở `spec-questions.md` có ca riêng.
 */

import { SELF, applyD1Migrations, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  LOI_DOI_KHONG_KHOI_LON,
  LOI_DUY_TRI_KHONG_DAY,
  MA_THOAT,
  kiemDoi,
  kiemKhoiLon,
  kiemTenNgan,
  kiemUuTienDuAn,
  quyenSuaBanDoDuAn,
  quyenSuaKhoiTicket,
} from '@baton/shared';
import { chayCli, xuLyDong, type MoiTruongCli, type ThongDiepRpc } from '@baton/cli';
import { manHinhBanDo } from '../src/doc-ho-so.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  aiAgent,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungLuotGiao,
  dungTicket,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { boChuThichDongKieuD1, tachCauLenh } from './tien-xu-ly-d1.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const TOKEN = {
  coord: 'bt_token_gia_coord_bando',
  coord_hep: 'bt_token_gia_coord_hep_bando',
  mgr: 'bt_token_gia_mgr_bando',
  mgr_khac: 'bt_token_gia_mgr_khac_bando',
  worker: 'bt_token_gia_worker_bando',
  reviewer: 'bt_token_gia_reviewer_bando',
} as const;

const ID = {
  coord: 'ag-coord',
  coord_hep: 'ag-coord-hep',
  mgr: 'ag-mgr',
  mgr_khac: 'ag-mgr-khac',
  worker: 'ag-worker',
  reviewer: 'ag-reviewer',
} as const;

const P = 'pj-SAI';
const P_INC = 'pj-INC';
const TK = `tk-${P}-1`;

/**
 * Hai dự án: `SAI` (quản lý: `ag-mgr`) và `INC` (quản lý: `ag-mgr-khac`). Mọi
 * agent được vào `SAI` trừ `coord_hep` (chỉ vào `INC`) — nên `mgr_khac` **được vào**
 * `SAI` mà không quản lý nó: đúng ca "manager dự án KHÁC".
 */
async function duLieuMau(): Promise<void> {
  await dungWorkspace();
  await dungAgentCoToken({ id: ID.coord, ten: 'CoS', vai_tro: 'coordinator', token: TOKEN.coord, vao_tat_ca_du_an: true });
  await dungAgentCoToken({ id: ID.coord_hep, ten: 'CoS-hep', vai_tro: 'coordinator', token: TOKEN.coord_hep });
  await dungAgentCoToken({ id: ID.mgr, ten: 'M-Sai', vai_tro: 'manager', token: TOKEN.mgr });
  await dungAgentCoToken({ id: ID.mgr_khac, ten: 'M-Inc', vai_tro: 'manager', token: TOKEN.mgr_khac });
  await dungAgentCoToken({ id: ID.worker, ten: 'W', vai_tro: 'worker', token: TOKEN.worker });
  await dungAgentCoToken({ id: ID.reviewer, ten: 'R', vai_tro: 'reviewer', token: TOKEN.reviewer });
  await dungDuAn('SAI', 'Sample', 'active', ID.mgr);
  await dungDuAn('INC', 'Incubator', 'active', ID.mgr_khac);
  for (const a of [ID.mgr, ID.mgr_khac, ID.worker, ID.reviewer]) await choVaoDuAn(a, P);
  await choVaoDuAn(ID.mgr_khac, P_INC);
  await choVaoDuAn(ID.coord_hep, P_INC);
  await dungTicket(P, 1, 'Khối lớn đầu tiên');
}

async function patchDuAn(token: string, than: unknown, id = P): Promise<Response> {
  return await goiApi(`/v1/du-an/${id}`, token, { method: 'PATCH', than });
}

async function patchTicket(token: string, than: unknown, id = TK): Promise<Response> {
  return await goiApi(`/v1/ticket/${id}`, token, { method: 'PATCH', than });
}

async function dongDuAn(id = P): Promise<Record<string, unknown>> {
  return (await env.DB.prepare(
    'SELECT uu_tien, dang_day, duy_tri, ten_ngan, nhom FROM project WHERE id = ?',
  )
    .bind(id)
    .first())!;
}

async function dongTicket(id = TK): Promise<{ khoi_lon: number | null; doi: number | null }> {
  return (await env.DB.prepare('SELECT khoi_lon, doi FROM ticket WHERE id = ?')
    .bind(id)
    .first<{ khoi_lon: number | null; doi: number | null }>())!;
}

interface DongLs {
  truong: string;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
  tac_gia_loai: string;
  tac_gia_agent_id: string | null;
}

async function lichSuDuAnDb(id: string | null = P): Promise<DongLs[]> {
  const { results } = await env.DB.prepare(
    `SELECT truong, gia_tri_cu, gia_tri_moi, tac_gia_loai, tac_gia_agent_id
       FROM project_history WHERE project_id IS ? ORDER BY truong, luc, gia_tri_cu`,
  )
    .bind(id)
    .all<DongLs>();
  return results;
}

async function lichSuTicketDb(truong: string[], id = TK): Promise<DongLs[]> {
  const { results } = await env.DB.prepare(
    `SELECT truong, gia_tri_cu, gia_tri_moi, tac_gia_loai, tac_gia_agent_id
       FROM ticket_history WHERE ticket_id = ? AND truong IN (${truong.map(() => '?').join(', ')})
      ORDER BY truong, luc, gia_tri_cu`,
  )
    .bind(id, ...truong)
    .all<DongLs>();
  return results;
}

async function loi(res: Response): Promise<{ status: number; error: string; message: string }> {
  const than = await res.json<{ error: string; message: string }>();
  return { status: res.status, ...than };
}

/* ================================================================== *
 * A. Migration 0029
 * ================================================================== */

describe('A. migration 0029 — mặc định, CHECK, trigger, rollback', () => {
  beforeEach(duLieuMau);

  it('dữ liệu cũ nhận mặc định: uu_tien 3, không đẩy, không duy trì, tên ngắn trống, khối/đồi trống, WIP 3', async () => {
    expect(await dongDuAn()).toEqual({ uu_tien: 3, dang_day: 0, duy_tri: 0, ten_ngan: null, nhom: null });
    expect(await dongTicket()).toEqual({ khoi_lon: null, doi: null });
    const ws = await env.DB.prepare('SELECT gioi_han_wip FROM workspace WHERE id = ?').bind(WS).first();
    expect(ws).toEqual({ gioi_han_wip: 3 });
    // Không dự án nào tự thành "đang đẩy" hay "duy trì" (20.1 "Dữ liệu cũ").
    const n = await env.DB.prepare(
      'SELECT count(*) AS n FROM project WHERE dang_day = 1 OR duy_tri = 1',
    ).first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('CHECK chặn giá trị ngoài khoảng ở tầng DB', async () => {
    const sai = [
      'UPDATE project SET uu_tien = 0 WHERE id = ?',
      'UPDATE project SET uu_tien = 6 WHERE id = ?',
      'UPDATE project SET dang_day = 2 WHERE id = ?',
      'UPDATE project SET duy_tri = -1 WHERE id = ?',
      `UPDATE project SET ten_ngan = '${'x'.repeat(25)}' WHERE id = ?`,
    ];
    for (const sql of sai) {
      expect(await env.DB.prepare(sql).bind(P).run().catch(String), sql).toMatch(/CHECK/);
    }
    const sai_tk = [
      'UPDATE ticket SET khoi_lon = 0 WHERE id = ?',
      'UPDATE ticket SET khoi_lon = 100 WHERE id = ?',
      'UPDATE ticket SET khoi_lon = 1, doi = -1 WHERE id = ?',
      'UPDATE ticket SET khoi_lon = 1, doi = 101 WHERE id = ?',
    ];
    for (const sql of sai_tk) {
      expect(await env.DB.prepare(sql).bind(TK).run().catch(String), sql).toMatch(/CHECK/);
    }
    for (const v of [0, 11]) {
      expect(
        await env.DB.prepare('UPDATE workspace SET gioi_han_wip = ? WHERE id = ?').bind(v, WS).run().catch(String),
      ).toMatch(/CHECK/);
    }
    // STRICT: số thực không vào cột INTEGER.
    expect(
      await env.DB.prepare('UPDATE project SET uu_tien = 2.5 WHERE id = ?').bind(P).run().catch(String),
    ).toMatch(/REAL|INTEGER/);
    // Đối chứng: biên trong khoảng thì qua.
    await env.DB.prepare(`UPDATE project SET uu_tien = 5, ten_ngan = '${'x'.repeat(24)}' WHERE id = ?`).bind(P).run();
    await env.DB.prepare('UPDATE ticket SET khoi_lon = 99, doi = 100 WHERE id = ?').bind(TK).run();
    await env.DB.prepare('UPDATE ticket SET khoi_lon = 1, doi = 0 WHERE id = ?').bind(TK).run();
    await env.DB.prepare('UPDATE workspace SET gioi_han_wip = 10 WHERE id = ?').bind(WS).run();
  });

  it('trigger: duy_tri = 1 ⇒ dang_day = 0; doi cần khoi_lon (INSERT và UPDATE)', async () => {
    expect(
      await env.DB.prepare('UPDATE project SET duy_tri = 1, dang_day = 1 WHERE id = ?').bind(P).run().catch(String),
    ).toMatch(/du an duy tri khong dang day duoc/);
    await env.DB.prepare('UPDATE project SET dang_day = 1 WHERE id = ?').bind(P).run();
    expect(
      await env.DB.prepare('UPDATE project SET duy_tri = 1 WHERE id = ?').bind(P).run().catch(String),
    ).toMatch(/du an duy tri khong dang day duoc/);
    expect(
      await env.DB.prepare(
        `INSERT INTO project (id, workspace_id, ten, ma, dang_day, duy_tri, tao_luc, cap_nhat_luc)
         VALUES ('pj-X', ?, 'X', 'XX', 1, 1, 1, 1)`,
      )
        .bind(WS)
        .run()
        .catch(String),
    ).toMatch(/du an duy tri khong dang day duoc/);

    expect(
      await env.DB.prepare('UPDATE ticket SET doi = 10 WHERE id = ?').bind(TK).run().catch(String),
    ).toMatch(/doi chi dat duoc cho ticket co khoi_lon/);
    await env.DB.prepare('UPDATE ticket SET khoi_lon = 2, doi = 10 WHERE id = ?').bind(TK).run();
    expect(
      await env.DB.prepare('UPDATE ticket SET khoi_lon = NULL WHERE id = ?').bind(TK).run().catch(String),
    ).toMatch(/doi chi dat duoc cho ticket co khoi_lon/);
    expect(
      await env.DB.prepare(
        `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
           chiu_trach_nhiem_loai, nguoi_tao_loai, tao_luc, cap_nhat_luc, doi)
         VALUES ('tk-x', ?, ?, 9, 'X', 'todo', 'none', 4, 'owner', 'owner', 1, 1, 5)`,
      )
        .bind(WS, P)
        .run()
        .catch(String),
    ).toMatch(/doi chi dat duoc cho ticket co khoi_lon/);
  });

  it('project_history: chỉ thêm (không sửa, không xoá), khớp workspace, NULL dự án chỉ cho gioi_han_wip', async () => {
    const chen = (id: string, project_id: string | null, truong: string, ws = WS): Promise<string | null> =>
      env.DB.prepare(
        `INSERT INTO project_history (id, workspace_id, project_id, tac_gia_loai, luc, truong, gia_tri_cu, gia_tri_moi)
         VALUES (?, ?, ?, 'owner', 1, ?, '1', '2')`,
      )
        .bind(id, ws, project_id, truong)
        .run()
        .then(() => null)
        .catch(String);
    expect(await chen('h1', P, 'uu_tien')).toBeNull();
    expect(await chen('h2', null, 'gioi_han_wip')).toBeNull();
    expect(await chen('h3', null, 'uu_tien')).toMatch(/CHECK/);
    expect(await chen('h4', P, 'gioi_han_wip')).toMatch(/CHECK/);
    expect(
      await env.DB.prepare("UPDATE project_history SET gia_tri_moi = '5' WHERE id = 'h1'").run().catch(String),
    ).toMatch(/chi them, khong sua/);
    expect(await env.DB.prepare("DELETE FROM project_history WHERE id = 'h1'").run().catch(String)).toMatch(
      /chi them, khong xoa/,
    );
    await env.DB.prepare(
      "INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES ('ws-zz-khac', 'K', 1, 1)",
    ).run();
    expect(await chen('h5', P, 'uu_tien', 'ws-zz-khac')).toMatch(/cung workspace voi du an/);
  });

  it('áp 0001→0028 rồi 0029 trên DB thử: dữ liệu cũ còn nguyên và nhận mặc định; rollback áp được', async () => {
    const db = env.DB_TIEN_XU_LY;
    const truoc = env.TEST_MIGRATIONS.filter((m) => m.name < '0029');
    const m29 = env.TEST_MIGRATIONS.filter((m) => m.name.startsWith('0029_'));
    expect(m29).toHaveLength(1);
    await applyD1Migrations(db, truoc);
    await db.batch([
      db.prepare("INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES ('w', 'T', 1, 1)"),
      db.prepare(
        "INSERT INTO project (id, workspace_id, ten, ma, trang_thai, nhom, tao_luc, cap_nhat_luc) VALUES ('p', 'w', 'S', 'SAI', 'active', 'INC', 1, 1)",
      ),
      db.prepare(
        `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
           chiu_trach_nhiem_loai, nguoi_tao_loai, tao_luc, cap_nhat_luc)
         VALUES ('t', 'w', 'p', 1, 'Cũ', 'in_progress', 'high', 1, 'owner', 'owner', 1, 1)`,
      ),
    ]);

    await applyD1Migrations(db, m29);
    expect(
      await db.prepare("SELECT ten, nhom, uu_tien, dang_day, duy_tri, ten_ngan FROM project WHERE id = 'p'").first(),
    ).toEqual({ ten: 'S', nhom: 'INC', uu_tien: 3, dang_day: 0, duy_tri: 0, ten_ngan: null });
    expect(
      await db.prepare("SELECT tieu_de, trang_thai, uu_tien, khoi_lon, doi FROM ticket WHERE id = 't'").first(),
    ).toEqual({ tieu_de: 'Cũ', trang_thai: 'in_progress', uu_tien: 'high', khoi_lon: null, doi: null });
    expect(await db.prepare("SELECT gioi_han_wip FROM workspace WHERE id = 'w'").first()).toEqual({
      gioi_han_wip: 3,
    });

    const rb = env.TEST_VAN_BAN_ROLLBACK.find((f) => f.ten === '0029_ban_do_du_an.rollback.sql');
    expect(rb).toBeDefined();
    expect(env.TEST_MIGRATIONS.map((m) => m.name)).not.toContain(rb!.ten);
    const cau = tachCauLenh(boChuThichDongKieuD1(rb!.noi_dung));
    expect(cau.length).toBeGreaterThan(0);
    for (const c of cau) await db.prepare(c).run();
    const cot_pj = await db.prepare('PRAGMA table_info(project)').all<{ name: string }>();
    for (const cot of ['uu_tien', 'dang_day', 'duy_tri', 'ten_ngan']) {
      expect(cot_pj.results.map((c) => c.name)).not.toContain(cot);
    }
    const cot_tk = await db.prepare('PRAGMA table_info(ticket)').all<{ name: string }>();
    expect(cot_tk.results.map((c) => c.name)).not.toContain('khoi_lon');
    expect(await db.prepare("SELECT ten, nhom FROM project WHERE id = 'p'").first()).toEqual({ ten: 'S', nhom: 'INC' });
  });
});

/* ================================================================== *
 * B. Dự án — PATCH /v1/du-an/:id
 * ================================================================== */

describe('B. dự án: uu_tien, dang_day, duy_tri, ten_ngan (20.1)', () => {
  beforeEach(duLieuMau);

  it('hàm kiểm thuần: biên 0/1/5/6, -1, không nguyên, chuỗi số ⇒ INVALID_INPUT kèm khoảng "1–5"', () => {
    expect(kiemUuTienDuAn(1)).toBe(1);
    expect(kiemUuTienDuAn(5)).toBe(5);
    for (const v of [0, 6, -1, 2.5, '3', null, Number.NaN]) {
      expect(() => kiemUuTienDuAn(v), String(v)).toThrow(/uu_tien phải là số nguyên 1–5/);
    }
    expect(kiemTenNgan('x'.repeat(24))).toBe('x'.repeat(24));
    expect(() => kiemTenNgan('x'.repeat(25))).toThrow(/0–24 ký tự/);
    expect(kiemTenNgan('')).toBeNull();
    expect(kiemTenNgan('   ')).toBeNull();
    // Đếm như SQLite (điểm mã): 24 emoji là 24 ký tự, không 48.
    expect(kiemTenNgan('😀'.repeat(24))).toBe('😀'.repeat(24));
  });

  it('chủ đặt uu_tien biên 1 và 5 qua HTTP; 0, 6, -1, 2.5 ⇒ 422 INVALID_INPUT kèm "1–5"', async () => {
    for (const v of [1, 5]) {
      const res = await patchDuAn(TOKEN_CHU, { uu_tien: v });
      expect(res.status, String(v)).toBe(200);
      expect((await dongDuAn())['uu_tien']).toBe(v);
    }
    for (const v of [0, 6, -1, 2.5, 'cao']) {
      const l = await loi(await patchDuAn(TOKEN_CHU, { uu_tien: v }));
      expect(l, String(v)).toMatchObject({ status: 422, error: 'INVALID_INPUT' });
      expect(l.message).toContain('1–5');
    }
    expect((await dongDuAn())['uu_tien']).toBe(5);
  });

  it('ten_ngan: 24 ký tự lưu; 25 ⇒ INVALID_INPUT "0–24 ký tự"; chuỗi rỗng ⇒ NULL (dùng tên đầy đủ)', async () => {
    expect((await patchDuAn(TOKEN_CHU, { ten_ngan: 'a'.repeat(24) })).status).toBe(200);
    expect((await dongDuAn())['ten_ngan']).toBe('a'.repeat(24));
    const l = await loi(await patchDuAn(TOKEN_CHU, { ten_ngan: 'a'.repeat(25) }));
    expect(l).toMatchObject({ status: 422, error: 'INVALID_INPUT' });
    expect(l.message).toContain('0–24 ký tự');
    expect((await patchDuAn(TOKEN_CHU, { ten_ngan: '' })).status).toBe(200);
    expect((await dongDuAn())['ten_ngan']).toBeNull();
  });

  it('dang_day/duy_tri phải là true/false ⇒ khác thì INVALID_INPUT', async () => {
    for (const than of [{ dang_day: 'on' }, { duy_tri: 1 }, { dang_day: null }]) {
      expect(await loi(await patchDuAn(TOKEN_CHU, than))).toMatchObject({ error: 'INVALID_INPUT' });
    }
  });

  /*
   * 20.8 (T-131, 04/11) mở `dang_day`/`duy_tri` cho **manager của dự án** — ca này
   * trước đó ghim manager của dự án FORBIDDEN cả bốn trường; nay chỉ còn
   * `uu_tien`/`ten_ngan` (chi tiết đủ hàng × cột ở `thanh-cong-cu-du-an.test.ts`).
   */
  it('quyền: chủ và coordinator ĐƯỢC; manager của dự án chỉ dang_day/duy_tri (20.8); manager khác, worker, reviewer ⇒ FORBIDDEN', async () => {
    expect((await patchDuAn(TOKEN_CHU, { uu_tien: 4 })).status).toBe(200);
    expect((await patchDuAn(TOKEN.coord, { uu_tien: 2, dang_day: true, ten_ngan: 'Sai' })).status).toBe(200);
    expect(await dongDuAn()).toMatchObject({ uu_tien: 2, dang_day: 1, ten_ngan: 'Sai' });

    for (const than of [{ uu_tien: 1 }, { ten_ngan: 'x' }]) {
      const l = await loi(await patchDuAn(TOKEN.mgr, than));
      expect(l, `mgr ${JSON.stringify(than)}`).toMatchObject({ status: 403, error: 'FORBIDDEN' });
    }
    for (const token of [TOKEN.mgr_khac, TOKEN.worker, TOKEN.reviewer]) {
      for (const than of [{ uu_tien: 1 }, { dang_day: false }, { duy_tri: true }, { ten_ngan: 'x' }]) {
        const l = await loi(await patchDuAn(token, than));
        expect(l, `${token} ${JSON.stringify(than)}`).toMatchObject({ status: 403, error: 'FORBIDDEN' });
      }
    }
    expect(await dongDuAn()).toMatchObject({ uu_tien: 2, dang_day: 1, duy_tri: 0, ten_ngan: 'Sai' });
  });

  it('coordinator ngoài phạm vi ⇒ NOT_FOUND giống id bịa; coordinator gửi nhom/ten ⇒ FORBIDDEN (chỉ chủ)', async () => {
    expect(await loi(await patchDuAn(TOKEN.coord_hep, { uu_tien: 1 }))).toMatchObject({ status: 404 });
    expect(await loi(await patchDuAn(TOKEN.coord_hep, { uu_tien: 1 }, 'pj-BIA'))).toMatchObject({ status: 404 });
    expect((await patchDuAn(TOKEN.coord_hep, { uu_tien: 1 }, P_INC)).status).toBe(200);

    expect(await loi(await patchDuAn(TOKEN.coord, { nhom: 'Sample' }))).toMatchObject({ status: 403 });
    expect(await loi(await patchDuAn(TOKEN.coord, { uu_tien: 1, ten: 'Đổi' }))).toMatchObject({ status: 403 });
    expect((await dongDuAn())['uu_tien']).toBe(3);

    // Chủ đặt nhóm (mảng của bản đồ) được, và có lịch sử.
    expect((await patchDuAn(TOKEN_CHU, { nhom: 'Sample' })).status).toBe(200);
    expect(await lichSuDuAnDb()).toEqual([
      { truong: 'nhom', gia_tri_cu: null, gia_tri_moi: 'Sample', tac_gia_loai: 'owner', tac_gia_agent_id: null },
    ]);
  });

  it('bật duy_tri ⇒ cùng lúc tắt dang_day, lịch sử ghi CẢ HAI (kể cả dang_day bị tự tắt)', async () => {
    expect((await patchDuAn(TOKEN.coord, { dang_day: true })).status).toBe(200);
    const res = await patchDuAn(TOKEN.coord, { duy_tri: true });
    expect(res.status).toBe(200);
    const kq = await res.json<{ da_doi: string[]; wip: { dang_day: number } }>();
    expect(kq.da_doi.sort()).toEqual(['dang_day', 'duy_tri']);
    expect(kq.wip.dang_day).toBe(0);
    expect(await dongDuAn()).toMatchObject({ dang_day: 0, duy_tri: 1 });
    const dong = (await lichSuDuAnDb()).filter((d) => d.truong !== 'nhom');
    expect(dong).toEqual([
      { truong: 'dang_day', gia_tri_cu: '0', gia_tri_moi: '1', tac_gia_loai: 'agent', tac_gia_agent_id: ID.coord },
      { truong: 'dang_day', gia_tri_cu: '1', gia_tri_moi: '0', tac_gia_loai: 'agent', tac_gia_agent_id: ID.coord },
      { truong: 'duy_tri', gia_tri_cu: '0', gia_tri_moi: '1', tac_gia_loai: 'agent', tac_gia_agent_id: ID.coord },
    ]);
  });

  it('(a) bật dang_day cho dự án duy trì ⇒ INVALID_INPUT, không đổi gì; bật cả hai cùng lúc cũng vậy', async () => {
    expect(await loi(await patchDuAn(TOKEN_CHU, { dang_day: true, duy_tri: true }))).toMatchObject({
      status: 422,
      error: 'INVALID_INPUT',
      message: LOI_DUY_TRI_KHONG_DAY,
    });
    expect((await patchDuAn(TOKEN_CHU, { duy_tri: true })).status).toBe(200);
    expect(await loi(await patchDuAn(TOKEN_CHU, { dang_day: true }))).toMatchObject({
      message: LOI_DUY_TRI_KHONG_DAY,
    });
    expect(await dongDuAn()).toMatchObject({ dang_day: 0, duy_tri: 1 });
    // Tắt duy_tri và bật dang_day trong CÙNG lệnh thì cho.
    expect((await patchDuAn(TOKEN_CHU, { duy_tri: false, dang_day: true })).status).toBe(200);
    expect(await dongDuAn()).toMatchObject({ dang_day: 1, duy_tri: 0 });
  });

  it('vượt giới hạn WIP vẫn cho, trả wip.vuot; dự án lưu trữ không đếm (e)', async () => {
    expect((await goiApi('/v1/cai-dat/workspace', TOKEN_CHU, { method: 'PUT', than: { gioi_han_wip: 1 } })).status).toBe(200);
    // Một dự án lưu trữ đang đẩy: không đếm.
    await dungDuAn('OLD', 'Cũ', 'archived');
    await env.DB.prepare("UPDATE project SET dang_day = 1 WHERE id = 'pj-OLD'").run();

    const r1 = await (await patchDuAn(TOKEN.coord, { dang_day: true })).json<{ wip: unknown }>();
    expect(r1.wip).toEqual({ dang_day: 1, gioi_han: 1, vuot: false });
    const res = await patchDuAn(TOKEN.coord, { dang_day: true }, P_INC);
    expect(res.status).toBe(200);
    expect((await res.json<{ wip: unknown }>()).wip).toEqual({ dang_day: 2, gioi_han: 1, vuot: true });
    expect((await dongDuAn(P_INC))['dang_day']).toBe(1);
  });

  it('không đổi giá trị ⇒ da_doi rỗng và KHÔNG ghi dòng lịch sử', async () => {
    const res = await patchDuAn(TOKEN_CHU, { uu_tien: 3, dang_day: false, duy_tri: false, ten_ngan: null });
    expect(res.status).toBe(200);
    expect((await res.json<{ da_doi: string[] }>()).da_doi).toEqual([]);
    expect(await lichSuDuAnDb()).toEqual([]);
  });

  it('lịch sử đủ ai/lúc/trường/cũ→mới, đọc được qua GET /v1/du-an/:id/lich-su (ngoài phạm vi ⇒ 404)', async () => {
    await patchDuAn(TOKEN_CHU, { uu_tien: 5, ten_ngan: 'SP' });
    expect(await lichSuDuAnDb()).toEqual([
      { truong: 'ten_ngan', gia_tri_cu: null, gia_tri_moi: 'SP', tac_gia_loai: 'owner', tac_gia_agent_id: null },
      { truong: 'uu_tien', gia_tri_cu: '3', gia_tri_moi: '5', tac_gia_loai: 'owner', tac_gia_agent_id: null },
    ]);
    const res = await goiApi(`/v1/du-an/${P}/lich-su`, TOKEN.coord);
    expect(res.status).toBe(200);
    const trang = await res.json<{ items: { truong: string; luc: number; tac_gia: { loai: string } }[] }>();
    expect(trang.items.map((d) => d.truong).sort()).toEqual(['ten_ngan', 'uu_tien']);
    expect(trang.items[0]?.luc).toBeGreaterThan(0);
    expect(trang.items[0]?.tac_gia.loai).toBe('owner');
    expect((await goiApi(`/v1/du-an/${P}/lich-su`, TOKEN.coord_hep)).status).toBe(404);
  });

  it('(e) dự án lưu trữ: đặt trường Bản đồ vẫn cho; trường khác vẫn bị chặn như cũ', async () => {
    await env.DB.prepare("UPDATE project SET trang_thai = 'archived' WHERE id = ?").bind(P).run();
    expect((await patchDuAn(TOKEN.coord, { uu_tien: 1 })).status).toBe(200);
    expect(await loi(await patchDuAn(TOKEN_CHU, { uu_tien: 2, mo_ta: 'x' }))).toMatchObject({
      error: 'PROJECT_NOT_ACCEPTING',
    });
    expect((await dongDuAn())['uu_tien']).toBe(1);
  });

  it('đường đọc trả trường mới: danh sách, chi tiết, trang Bản đồ (mục 9)', async () => {
    await patchDuAn(TOKEN_CHU, { uu_tien: 5, dang_day: true, ten_ngan: 'SP' });
    const ds = await (await goiApi('/v1/du-an', TOKEN.coord)).json<{
      items: { id: string; uu_tien: number; dang_day: boolean; duy_tri: boolean; ten_ngan: string | null }[];
    }>();
    expect(ds.items.find((d) => d.id === P)).toMatchObject({ uu_tien: 5, dang_day: true, duy_tri: false, ten_ngan: 'SP' });
    expect(ds.items.find((d) => d.id === P_INC)).toMatchObject({ uu_tien: 3, dang_day: false, duy_tri: false, ten_ngan: null });
    const mot = await (await goiApi(`/v1/du-an/${P}`, TOKEN.coord)).json();
    expect(mot).toMatchObject({ uu_tien: 5, dang_day: true, duy_tri: false, ten_ngan: 'SP' });
    const bd = await manHinhBanDo(env.DB, CHU, WS, Date.now());
    expect(bd.du_an.find((d) => d.id === P)).toMatchObject({ uu_tien: 5, dang_day: true, duy_tri: false, ten_ngan: 'SP' });
  });
});

/* ================================================================== *
 * C. Giới hạn WIP — /v1/cai-dat/workspace
 * ================================================================== */

describe('C. giới hạn WIP (Cài đặt workspace, chỉ chủ)', () => {
  beforeEach(duLieuMau);

  const put = (token: string, than: unknown): Promise<Response> =>
    goiApi('/v1/cai-dat/workspace', token, { method: 'PUT', than });

  it('mặc định 3; chủ đọc được, agent ⇒ FORBIDDEN', async () => {
    const res = await goiApi('/v1/cai-dat/workspace', TOKEN_CHU);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gioi_han_wip: 3, wip: { dang_day: 0, gioi_han: 3, vuot: false } });
    expect((await goiApi('/v1/cai-dat/workspace', TOKEN.coord)).status).toBe(403);
  });

  it('biên 1 và 10 được; 0, 11, -1, 2.5 ⇒ INVALID_INPUT kèm "1–10"', async () => {
    for (const v of [1, 10]) {
      expect((await put(TOKEN_CHU, { gioi_han_wip: v })).status, String(v)).toBe(200);
    }
    for (const v of [0, 11, -1, 2.5, '5']) {
      const l = await loi(await put(TOKEN_CHU, { gioi_han_wip: v }));
      expect(l, String(v)).toMatchObject({ status: 422, error: 'INVALID_INPUT' });
      expect(l.message).toContain('1–10');
    }
    expect(await env.DB.prepare('SELECT gioi_han_wip FROM workspace WHERE id = ?').bind(WS).first()).toEqual({
      gioi_han_wip: 10,
    });
  });

  it('mọi vai agent ghi ⇒ FORBIDDEN (kể cả coordinator), không đổi gì', async () => {
    for (const token of Object.values(TOKEN)) {
      expect(await loi(await put(token, { gioi_han_wip: 5 })), token).toMatchObject({ status: 403 });
    }
    expect(await env.DB.prepare('SELECT gioi_han_wip FROM workspace WHERE id = ?').bind(WS).first()).toEqual({
      gioi_han_wip: 3,
    });
  });

  it('lịch sử: một dòng project_id NULL khi đổi; đặt lại cùng giá trị thì không ghi', async () => {
    await put(TOKEN_CHU, { gioi_han_wip: 4 });
    await put(TOKEN_CHU, { gioi_han_wip: 4 });
    expect(await lichSuDuAnDb(null)).toEqual([
      { truong: 'gioi_han_wip', gia_tri_cu: '3', gia_tri_moi: '4', tac_gia_loai: 'owner', tac_gia_agent_id: null },
    ]);
  });
});

/* ================================================================== *
 * D. Ticket — khoi_lon, doi
 * ================================================================== */

describe('D. ticket: khoi_lon, doi (20.1)', () => {
  beforeEach(duLieuMau);

  it('hàm kiểm thuần: khoi_lon 1/99 được, 0/100/-1/1.5 ⇒ "1–99"; doi 0/100 được, -1/101 ⇒ "0–100"', () => {
    expect(kiemKhoiLon(1)).toBe(1);
    expect(kiemKhoiLon(99)).toBe(99);
    expect(kiemKhoiLon(null)).toBeNull();
    for (const v of [0, 100, -1, 1.5, '3']) expect(() => kiemKhoiLon(v), String(v)).toThrow(/1–99/);
    expect(kiemDoi(0)).toBe(0);
    expect(kiemDoi(100)).toBe(100);
    expect(kiemDoi(null)).toBeNull();
    for (const v of [-1, 101, 50.5, '50']) expect(() => kiemDoi(v), String(v)).toThrow(/0–100/);
  });

  it('chủ đặt khoi_lon + doi biên qua HTTP; ngoài khoảng ⇒ 422 kèm khoảng', async () => {
    expect((await patchTicket(TOKEN_CHU, { khoi_lon: 99, doi: 100 })).status).toBe(200);
    expect(await dongTicket()).toEqual({ khoi_lon: 99, doi: 100 });
    expect((await patchTicket(TOKEN_CHU, { khoi_lon: 1, doi: 0 })).status).toBe(200);
    expect(await dongTicket()).toEqual({ khoi_lon: 1, doi: 0 });
    for (const [than, khoang] of [
      [{ khoi_lon: 0 }, '1–99'],
      [{ khoi_lon: 100 }, '1–99'],
      [{ doi: -1 }, '0–100'],
      [{ doi: 101 }, '0–100'],
    ] as const) {
      const l = await loi(await patchTicket(TOKEN_CHU, than));
      expect(l, JSON.stringify(than)).toMatchObject({ status: 422, error: 'INVALID_INPUT' });
      expect(l.message).toContain(khoang);
    }
    expect(await dongTicket()).toEqual({ khoi_lon: 1, doi: 0 });
  });

  it('doi cho ticket không có khoi_lon (sau khi áp cả lệnh) ⇒ INVALID_INPUT', async () => {
    expect(await loi(await patchTicket(TOKEN_CHU, { doi: 30 }))).toMatchObject({
      status: 422,
      error: 'INVALID_INPUT',
      message: LOI_DOI_KHONG_KHOI_LON,
    });
    await patchTicket(TOKEN_CHU, { khoi_lon: 2 });
    expect(await loi(await patchTicket(TOKEN_CHU, { khoi_lon: null, doi: 30 }))).toMatchObject({
      message: LOI_DOI_KHONG_KHOI_LON,
    });
    expect(await dongTicket()).toEqual({ khoi_lon: 2, doi: null });
    // Đặt khối và đồi cùng lệnh trên ticket chưa có khối thì được.
    await dungTicket(P, 2, 'Khối hai');
    expect((await patchTicket(TOKEN_CHU, { khoi_lon: 3, doi: 30 }, `tk-${P}-2`)).status).toBe(200);
  });

  it('(c) tắt khoi_lon trên ticket có doi ⇒ doi về NULL cùng lúc, lịch sử ghi cả hai; (d) doi: null được', async () => {
    await patchTicket(TOKEN_CHU, { khoi_lon: 4, doi: 60 });
    expect((await patchTicket(TOKEN_CHU, { doi: null })).status).toBe(200);
    expect(await dongTicket()).toEqual({ khoi_lon: 4, doi: null });
    await patchTicket(TOKEN_CHU, { doi: 70 });

    const res = await patchTicket(TOKEN.coord, { khoi_lon: null });
    expect(res.status).toBe(200);
    expect((await res.json<{ da_doi: string[] }>()).da_doi.sort()).toEqual(['doi', 'khoi_lon']);
    expect(await dongTicket()).toEqual({ khoi_lon: null, doi: null });
    const cuoi = (await lichSuTicketDb(['khoi_lon', 'doi'])).filter((d) => d.tac_gia_loai === 'agent');
    expect(cuoi).toEqual([
      { truong: 'doi', gia_tri_cu: '70', gia_tri_moi: null, tac_gia_loai: 'agent', tac_gia_agent_id: ID.coord },
      { truong: 'khoi_lon', gia_tri_cu: '4', gia_tri_moi: null, tac_gia_loai: 'agent', tac_gia_agent_id: ID.coord },
    ]);
  });

  it('quyền: chủ, coordinator, manager CỦA dự án được; manager dự án khác, worker (kể cả lượt của mình), reviewer ⇒ FORBIDDEN', async () => {
    await dungLuotGiao('lg-wk', TK, ID.worker);
    expect((await patchTicket(TOKEN_CHU, { khoi_lon: 1 })).status).toBe(200);
    expect((await patchTicket(TOKEN.coord, { khoi_lon: 2 })).status).toBe(200);
    expect((await patchTicket(TOKEN.mgr, { khoi_lon: 3, doi: 10 })).status).toBe(200);
    expect(await dongTicket()).toEqual({ khoi_lon: 3, doi: 10 });

    for (const token of [TOKEN.mgr_khac, TOKEN.worker, TOKEN.reviewer]) {
      for (const than of [{ khoi_lon: 5 }, { doi: 20 }, { khoi_lon: null }]) {
        expect(await loi(await patchTicket(token, than)), `${token} ${JSON.stringify(than)}`).toMatchObject({
          status: 403,
          error: 'FORBIDDEN',
        });
      }
    }
    expect(await dongTicket()).toEqual({ khoi_lon: 3, doi: 10 });
    // Coordinator ngoài phạm vi ⇒ NOT_FOUND (không lộ sự tồn tại).
    expect((await patchTicket(TOKEN.coord_hep, { khoi_lon: 5 })).status).toBe(404);
  });

  it('hàm quyền thuần khớp cột "Ai sửa" của 20.1', () => {
    const mgr = aiAgent('manager', { du_an_duoc_vao: [P], du_an_minh_quan_ly: [P] });
    const mgr_khac = aiAgent('manager', { du_an_duoc_vao: [P], du_an_minh_quan_ly: [P_INC] });
    expect(quyenSuaKhoiTicket(CHU, P).cho_phep).toBe(true);
    expect(quyenSuaKhoiTicket(aiAgent('coordinator', { vao_tat_ca_du_an: true }), P).cho_phep).toBe(true);
    expect(quyenSuaKhoiTicket(mgr, P).cho_phep).toBe(true);
    expect(quyenSuaKhoiTicket(mgr_khac, P).cho_phep).toBe(false);
    expect(quyenSuaKhoiTicket(aiAgent('worker', { du_an_duoc_vao: [P] }), P).cho_phep).toBe(false);
    expect(quyenSuaKhoiTicket(aiAgent('reviewer', { du_an_duoc_vao: [P] }), P).cho_phep).toBe(false);
    expect(quyenSuaKhoiTicket({ ...mgr, disabled: true }, P).cho_phep).toBe(false);

    expect(quyenSuaBanDoDuAn(CHU).cho_phep).toBe(true);
    expect(quyenSuaBanDoDuAn(aiAgent('coordinator')).cho_phep).toBe(true);
    for (const vai of ['manager', 'worker', 'reviewer'] as const) {
      expect(quyenSuaBanDoDuAn(aiAgent(vai)).cho_phep, vai).toBe(false);
    }
    expect(quyenSuaBanDoDuAn(aiAgent('coordinator', { disabled: true })).cho_phep).toBe(false);
  });

  it('không đổi giá trị ⇒ không ghi lịch sử; đổi ⇒ một dòng mỗi trường', async () => {
    await patchTicket(TOKEN_CHU, { khoi_lon: 7 });
    await patchTicket(TOKEN_CHU, { khoi_lon: 7 });
    expect(await lichSuTicketDb(['khoi_lon', 'doi'])).toEqual([
      { truong: 'khoi_lon', gia_tri_cu: null, gia_tri_moi: '7', tac_gia_loai: 'owner', tac_gia_agent_id: null },
    ]);
  });

  it('đường đọc ticket (chi tiết + danh sách) trả khoi_lon, doi', async () => {
    await patchTicket(TOKEN_CHU, { khoi_lon: 2, doi: 45 });
    await dungTicket(P, 2, 'Việc nhỏ');
    const mot = await (await goiApi(`/v1/ticket/${TK}`, TOKEN.coord)).json();
    expect(mot).toMatchObject({ khoi_lon: 2, doi: 45 });
    const ds = await (await goiApi(`/v1/ticket?project_id=${P}`, TOKEN.coord)).json<{
      items: { id: string; khoi_lon: number | null; doi: number | null }[];
    }>();
    expect(ds.items.find((t) => t.id === TK)).toMatchObject({ khoi_lon: 2, doi: 45 });
    expect(ds.items.find((t) => t.id === `tk-${P}-2`)).toMatchObject({ khoi_lon: null, doi: null });
  });
});

/* ================================================================== *
 * E. CLI `project set` / `ticket set` và MCP
 * ================================================================== */

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
  so_request: () => number;
}

function ban(token: string): BanChay {
  const ra: string[] = [];
  const loi_ra: string[] = [];
  let n = 0;
  return {
    mt: {
      env: { BATON_URL: 'https://baton.test', BATON_TOKEN: token },
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void loi_ra.push(d),
      fetch: (u, i) => {
        n += 1;
        return SELF.fetch(u, i);
      },
      docFile: () => Promise.reject(new Error('không đọc file')),
    },
    ra,
    loi: loi_ra,
    so_request: () => n,
  };
}

describe('E. CLI project set / ticket set (20.1) và MCP', () => {
  beforeEach(duLieuMau);

  it('project set: chủ đặt đủ năm cờ; in ra trường đã đổi', async () => {
    const b = ban(TOKEN_CHU);
    const ma = await chayCli(
      ['project', 'set', 'SAI', '--nhom', 'Sample', '--uu-tien', '5', '--dang-day', 'on', '--ten-ngan', 'SP'],
      b.mt,
    );
    expect(ma, [...b.ra, ...b.loi].join('\n')).toBe(MA_THOAT.xong);
    expect(await dongDuAn()).toEqual({ uu_tien: 5, dang_day: 1, duy_tri: 0, ten_ngan: 'SP', nhom: 'Sample' });
    expect(b.ra.join('\n')).toContain('Dự án SAI: đã đổi');
    expect(b.ra.join('\n')).toContain('Đang đẩy 1/3');
  });

  it('project set --duy-tri on tự tắt dang_day và nói ra; --dang-day off', async () => {
    await chayCli(['project', 'set', 'SAI', '--dang-day', 'on'], ban(TOKEN.coord).mt);
    const b = ban(TOKEN.coord);
    expect(await chayCli(['project', 'set', 'SAI', '--duy-tri', 'on'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('đã tự tắt dang_day');
    expect(await dongDuAn()).toMatchObject({ dang_day: 0, duy_tri: 1 });
  });

  it('project set vượt WIP: vẫn mã 0 và in cảnh báo', async () => {
    await goiApi('/v1/cai-dat/workspace', TOKEN_CHU, { method: 'PUT', than: { gioi_han_wip: 1 } });
    await chayCli(['project', 'set', 'INC', '--dang-day', 'on'], ban(TOKEN.coord).mt);
    const b = ban(TOKEN.coord);
    expect(await chayCli(['project', 'set', 'SAI', '--dang-day', 'on'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Cảnh báo: vượt giới hạn WIP (2 > 1)');
  });

  it('project set dùng sai ⇒ mã 1, KHÔNG request nào: không cờ, on|off sai, uu-tien ngoài khoảng, thao tác lạ', async () => {
    const sai: [string[], RegExp][] = [
      [['project', 'set', 'SAI', '--json'], /Cần ít nhất một cờ/],
      [['project', 'set', 'SAI', '--dang-day', 'yes', '--json'], /--dang-day chỉ nhận on hoặc off/],
      [['project', 'set', 'SAI', '--duy-tri', 'ON', '--json'], /--duy-tri chỉ nhận on hoặc off/],
      [['project', 'set', 'SAI', '--uu-tien', '6', '--json'], /1–5/],
      [['project', 'set', 'SAI', '--uu-tien', '0', '--json'], /1–5/],
      [['project', 'set', 'SAI', '--uu-tien', '2.5', '--json'], /1–5/],
      [['project', 'get', 'SAI', '--uu-tien', '2', '--json'], /chỉ có thao tác "set"/],
      [['project', 'set', '--json'], /cần 2 tham số/],
    ];
    for (const [ds, mau] of sai) {
      const b = ban(TOKEN_CHU);
      expect(await chayCli(ds, b.mt), ds.join(' ')).toBe(MA_THOAT.loi_nghiep_vu);
      const than = JSON.parse(b.loi.join('\n')) as { loi: string; thong_diep: string };
      expect(than.loi, ds.join(' ')).toBe('INVALID_INPUT');
      expect(than.thong_diep, ds.join(' ')).toMatch(mau);
      expect(b.so_request(), ds.join(' ')).toBe(0);
    }
  });

  it('project set: worker ⇒ FORBIDDEN mã 1 (máy chủ quyết)', async () => {
    const b = ban(TOKEN.worker);
    expect(await chayCli(['project', 'set', 'SAI', '--uu-tien', '4', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect((JSON.parse(b.loi.join('\n')) as { loi: string }).loi).toBe('FORBIDDEN');
  });

  it('ticket set: --khoi-lon 3 --doi 40, rồi --khoi-lon off xoá cả doi', async () => {
    const b = ban(TOKEN.mgr);
    expect(await chayCli(['ticket', 'set', 'SAI-1', '--khoi-lon', '3', '--doi', '40'], b.mt), b.loi.join('\n')).toBe(
      MA_THOAT.xong,
    );
    expect(await dongTicket()).toEqual({ khoi_lon: 3, doi: 40 });
    const tat = ban(TOKEN.mgr);
    expect(await chayCli(['ticket', 'set', 'SAI-1', '--khoi-lon', 'off'], tat.mt)).toBe(MA_THOAT.xong);
    expect(tat.ra.join('\n')).toContain('vị trí trên đồi cũng được xoá');
    expect(await dongTicket()).toEqual({ khoi_lon: null, doi: null });
  });

  it('ticket set dùng sai ⇒ mã 1, KHÔNG request nào', async () => {
    const sai: [string[], RegExp][] = [
      [['ticket', 'set', 'SAI-1', '--json'], /Cần ít nhất một cờ/],
      [['ticket', 'set', 'SAI-1', '--khoi-lon', '0', '--json'], /1–99/],
      [['ticket', 'set', 'SAI-1', '--khoi-lon', 'tat', '--json'], /1–99/],
      [['ticket', 'set', 'SAI-1', '--doi', '101', '--json'], /0–100/],
      [['ticket', 'set', 'SAI-1', '--doi', '-1', '--json'], /0–100/],
      [['ticket', 'show', 'SAI-1', '--doi', '5', '--json'], /chỉ có thao tác "set"/],
    ];
    for (const [ds, mau] of sai) {
      const b = ban(TOKEN_CHU);
      expect(await chayCli(ds, b.mt), ds.join(' ')).toBe(MA_THOAT.loi_nghiep_vu);
      expect((JSON.parse(b.loi.join('\n')) as { thong_diep: string }).thong_diep, ds.join(' ')).toMatch(mau);
      expect(b.so_request(), ds.join(' ')).toBe(0);
    }
  });

  it('ticket set --doi trên ticket không có khối lớn ⇒ INVALID_INPUT của máy chủ', async () => {
    const b = ban(TOKEN_CHU);
    expect(await chayCli(['ticket', 'set', 'SAI-1', '--doi', '20', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    // CLI in lỗi máy chủ dạng "MÃ: thông điệp" (nếp sẵn có, vd cli-ticket.test.ts `NOT_FOUND: …`).
    expect(JSON.parse(b.loi.join('\n'))).toMatchObject({
      loi: 'INVALID_INPUT',
      thong_diep: `INVALID_INPUT: ${LOI_DOI_KHONG_KHOI_LON}`,
    });
  });

  it('--help của hai lệnh in cú pháp 20.1', async () => {
    const p = ban(TOKEN_CHU);
    await chayCli(['project', '--help'], p.mt);
    expect(p.ra.join('\n')).toContain('Cách dùng: baton project <thao tác> <MÃ>');
    expect(p.ra.join('\n')).toContain('--uu-tien');
    const t = ban(TOKEN_CHU);
    await chayCli(['ticket', '--help'], t.mt);
    expect(t.ra.join('\n')).toContain('--khoi-lon');
  });

  it('MCP: công cụ `project` và `ticket` gọi được, cùng luật với CLI', async () => {
    const b = ban(TOKEN.coord);
    const goi = async (name: string, args: Record<string, unknown>): Promise<{ ma_thoat: number; loi?: string | null }> => {
      const tra = (await xuLyDong(
        b.mt,
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      )) as ThongDiepRpc;
      return (tra.result as { structuredContent: { ma_thoat: number; loi?: string | null } }).structuredContent;
    };
    expect(await goi('project', { thao_tac: 'set', ma: 'SAI', uu_tien: 4, dang_day: 'on' })).toMatchObject({
      ma_thoat: 0,
    });
    expect(await dongDuAn()).toMatchObject({ uu_tien: 4, dang_day: 1 });
    expect(await goi('ticket', { thao_tac: 'set', ma: 'SAI-1', khoi_lon: '2', doi: 50 })).toMatchObject({
      ma_thoat: 0,
    });
    expect(await dongTicket()).toEqual({ khoi_lon: 2, doi: 50 });
    expect(await goi('project', { thao_tac: 'set', ma: 'SAI', uu_tien: 9 })).toMatchObject({
      ma_thoat: 1,
      loi: 'INVALID_INPUT',
    });
  });
});
