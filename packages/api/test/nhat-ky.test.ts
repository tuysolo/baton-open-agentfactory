/**
 * **Nhật ký quyết định** — SPEC mục 10 (d.305–312), mục 3 (hàng "Ghi Nhật ký
 * quyết định"), mục 8 d.279 + 19.9 (câu của dòng tự sinh), 19.12 câu 4 ("Chung"
 * là dự án **rỗng**), câu 15 (đường ghi → 403).
 *
 * Mỗi luật của SPEC mà lượt này chạm tới có **một ca**, và những luật có ranh
 * giới thì có cả **ca đối chứng** (8 / 9 / 12 / 13 chữ số; bốn ô của bảng quyền;
 * ba mức tầm nhìn của dòng Chung).
 *
 * **Vì sao `beforeEach` KHÔNG `DELETE FROM nhat_ky`:** vì không xoá được — đó
 * chính là luật d.309 ("Chỉ thêm. Không sửa, không xoá, **kể cả chủ**"), và
 * trigger `tg_nhat_ky_khong_xoa` của 0014 chặn cả fixture. Test dựa vào
 * `isolatedStorage: true` của `vitest.config.ts`, vốn hoàn tác kho dữ liệu sau
 * **mỗi** ca. Một ca riêng ở khối B khẳng định đúng chuyện đó.
 *
 * Đường **xử lý** mục Cần Chủ (19.9: resolve / skip / reopen) là lượt sau —
 * không có ca nào ở đây; ba hàm dựng câu thì có (khối H).
 */

import { afterEach, describe, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  canhBaoDuLieuNhanSu,
  cauNhatKyBoQua,
  cauNhatKyKetQua,
  cauNhatKyMoLai,
  chuanHoaTimChu,
  docDuocDongChung,
  kiemQuyetDinh,
  kiemViSao,
  ngayDiaPhuong,
  quyen,
  sqlDongChung,
  tamNhinDongChung,
  thoatLike,
} from '@baton/shared';
import {
  TOKEN_CHU,
  WS,
  aiAgent,
  canCuCua,
  choVaoDuAn,
  dungAgentCoToken,
  dungCanCu,
  dungCanChu,
  dungDuAn,
  dungNhatKy,
  dungTicket,
  dungWorkspace,
  goiApi,
  nhatKyTrongDb,
} from './giup.js';
import './ap-migration.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/* ------------------------------------------------------------------ *
 * Dựng nền
 * ------------------------------------------------------------------ */

const T_COORD = 'bt_test_coordinator';
const T_MANAGER = 'bt_test_manager';
const T_MANAGER_2 = 'bt_test_manager_hai';
const T_WORKER = 'bt_test_worker';
const T_REVIEWER = 'bt_test_reviewer';

let PJ = '';
let PJ_KHAC = '';
let PJ_LUU = '';

type Than = Record<string, unknown>;

function than(r: Response): Promise<Than> {
  return r.json<Than>();
}

beforeEach(async () => {
  /*
   * `nhat_ky` và `nhat_ky_can_cu` **không** có trong danh sách: chúng không xoá
   * được (d.309). Xem ghi chú ở đầu file.
   */
  for (const b of [
    'can_chu_ticket',
    'can_chu_file',
    'can_chu_phuong_an',
    'phien',
    'luot_giao',
    'can_chu',
    'ticket_label',
    'ticket_link',
    'ticket_history',
    'comment',
    'ticket',
    'bo_dem',
    'agent_project',
    'agent_permission',
    'agent',
    'project',
    'workspace',
  ]) {
    await env.DB.prepare(`DELETE FROM ${b}`).run();
  }

  await dungWorkspace();
  PJ = await dungDuAn('SAI', 'Sample');
  PJ_KHAC = await dungDuAn('OTH', 'Dự án khác');
  PJ_LUU = await dungDuAn('ARC', 'Dự án đã lưu trữ', 'archived');

  await dungAgentCoToken({
    id: 'ag-coord',
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: T_COORD,
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({
    id: 'ag-man',
    ten: 'M-Baton',
    vai_tro: 'manager',
    token: T_MANAGER,
    du_an: [PJ, PJ_LUU],
  });
  await dungAgentCoToken({
    id: 'ag-man-2',
    ten: 'M-khac',
    vai_tro: 'manager',
    token: T_MANAGER_2,
    du_an: [PJ_KHAC],
  });
  await dungAgentCoToken({
    id: 'ag-work',
    ten: 'W-builder',
    vai_tro: 'worker',
    token: T_WORKER,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: 'ag-rev',
    ten: 'W-reviewer',
    vai_tro: 'reviewer',
    token: T_REVIEWER,
    du_an: [PJ],
  });
});

/** Ghi một dòng qua **đường HTTP thật**, tức qua cửa ghi. */
function ghi(token: string, body: Than): Promise<Response> {
  return goiApi('/v1/nhat-ky', token, { method: 'POST', than: body });
}

const DONG: Than = {
  quyet_dinh: 'Dùng D1 cho v0.1',
  vi_sao: 'Đã có sẵn trong Workers, không thêm hạ tầng',
};

/* ================================================================== *
 * A. Dòng Nhật ký: sáu trường của d.308
 * ================================================================== */

describe('mục 10 d.308 — dòng có lúc, ai, dự án, quyết định, vì sao, căn cứ', () => {
  it('chủ ghi một dòng: `nguoi_loai = chu`, không agent, đủ trường', async () => {
    const r = await ghi(TOKEN_CHU, { ...DONG, project_id: PJ });
    expect(r.status).toBe(201);
    const t = await than(r);

    expect(t['nguoi_loai']).toBe('chu');
    expect(t['agent_id']).toBeNull();
    expect(typeof t['luc']).toBe('number');

    const d = await nhatKyTrongDb(t['id'] as string);
    expect(d?.nguoi_loai).toBe('chu');
    expect(d?.agent_id).toBeNull();
    expect(d?.project_id).toBe(PJ);
    expect(d?.quyet_dinh).toBe('Dùng D1 cho v0.1');
    expect(d?.vi_sao).toBe('Đã có sẵn trong Workers, không thêm hạ tầng');
    expect(d?.luc).toBeGreaterThan(0);
  });

  it('agent ghi: `nguoi_loai = agent` và đúng `agent_id` của người gọi', async () => {
    const r = await ghi(T_MANAGER, { ...DONG, project_id: PJ });
    expect(r.status).toBe(201);

    const d = await nhatKyTrongDb((await than(r))['id'] as string);
    expect(d?.nguoi_loai).toBe('agent');
    expect(d?.agent_id).toBe('ag-man');
  });

  it('**căn cứ** ba loại — T-số, mã ticket, dòng cũ (d.308)', async () => {
    const tk = await dungTicket(PJ, 1, 'Việc có thật');
    await dungCanChu('ct-1', { project_id: PJ, ma_so: 7 });
    const cu = await dungNhatKy('nk-cu', { project_id: PJ });

    const r = await ghi(TOKEN_CHU, {
      ...DONG,
      project_id: PJ,
      can_cu: [
        { loai: 'ask', id: 'ct-1' },
        { loai: 'ticket', id: tk },
        { loai: 'dong_cu', id: cu },
      ],
    });
    expect(r.status).toBe(201);
    const t = await than(r);
    expect(t['so_can_cu']).toBe(3);

    const cc = await canCuCua(t['id'] as string);
    expect(cc.map((c) => c.loai)).toEqual(['ask', 'ticket', 'dong_cu']);
    expect(cc[0]?.can_chu_id).toBe('ct-1');
    expect(cc[1]?.ticket_id).toBe(tk);
    expect(cc[2]?.dong_cu_id).toBe(cu);
  });

  it('căn cứ trỏ tới thứ không có thật → NOT_FOUND, và không ghi dòng nào', async () => {
    const r = await ghi(TOKEN_CHU, {
      ...DONG,
      project_id: PJ,
      can_cu: [{ loai: 'ask', id: 'khong-co-that' }],
    });
    expect(r.status).toBe(404);
    expect((await than(r))['error']).toBe('NOT_FOUND');

    const dem = await env.DB.prepare('SELECT count(*) AS n FROM nhat_ky').first<{ n: number }>();
    expect(dem?.n).toBe(0);
  });

  it('`vi_sao` bắt buộc (d.306) — thiếu thì INVALID_INPUT', async () => {
    const r = await ghi(TOKEN_CHU, { quyet_dinh: 'Dùng D1', project_id: PJ });
    expect(r.status).toBe(422);
    expect((await than(r))['error']).toBe('INVALID_INPUT');
  });

  it('`quyet_dinh` bắt buộc — khoảng trắng không tính là nội dung', async () => {
    const r = await ghi(TOKEN_CHU, { quyet_dinh: '   ', vi_sao: 'có lý do', project_id: PJ });
    expect(r.status).toBe(422);
    expect(() => kiemQuyetDinh('   ')).toThrow();
    expect(() => kiemViSao('')).toThrow();
    expect(kiemQuyetDinh('  Dùng D1  ')).toBe('Dùng D1');
  });
});

/* ================================================================== *
 * B. "CHỈ THÊM" — d.309, ép ở tầng DB, **kể cả chủ**
 * ================================================================== */

describe('mục 10 d.309 — chỉ thêm: không sửa, không xoá, kể cả chủ', () => {
  it('UPDATE thẳng vào DB (quyền cao nhất có thể có) bị RAISE(ABORT)', async () => {
    await dungNhatKy('nk-1', { project_id: PJ, quyet_dinh: 'Bản gốc' });

    await expect(
      env.DB.prepare('UPDATE nhat_ky SET quyet_dinh = ? WHERE id = ?')
        .bind('Bản bị sửa lén', 'nk-1')
        .run(),
    ).rejects.toThrow(/FORBIDDEN/);

    // Và dữ liệu **không đổi** — hàng rào là `BEFORE`, nên không ghi nửa chừng.
    expect((await nhatKyTrongDb('nk-1'))?.quyet_dinh).toBe('Bản gốc');
  });

  it('DELETE thẳng vào DB bị RAISE(ABORT), dòng vẫn còn', async () => {
    await dungNhatKy('nk-2', { project_id: PJ });

    await expect(
      env.DB.prepare('DELETE FROM nhat_ky WHERE id = ?').bind('nk-2').run(),
    ).rejects.toThrow(/FORBIDDEN/);
    expect(await nhatKyTrongDb('nk-2')).not.toBeNull();
  });

  it('`DELETE FROM nhat_ky` không điều kiện cũng bị chặn (không có cửa hậu quét bảng)', async () => {
    await dungNhatKy('nk-3', { project_id: PJ });
    await expect(env.DB.prepare('DELETE FROM nhat_ky').run()).rejects.toThrow(/FORBIDDEN/);
    expect(await nhatKyTrongDb('nk-3')).not.toBeNull();
  });

  it('bảng con cũng chỉ thêm: sửa hay xoá một căn cứ đều bị chặn', async () => {
    await dungNhatKy('nk-4', { project_id: PJ });
    const tk = await dungTicket(PJ, 2);
    await dungCanCu('cc-1', 'nk-4', 'ticket', tk);

    await expect(
      env.DB.prepare('UPDATE nhat_ky_can_cu SET thu_tu = 9 WHERE id = ?').bind('cc-1').run(),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      env.DB.prepare('DELETE FROM nhat_ky_can_cu WHERE id = ?').bind('cc-1').run(),
    ).rejects.toThrow(/FORBIDDEN/);
    expect(await canCuCua('nk-4')).toHaveLength(1);
  });

  /*
   * **Đường vòng nguy hiểm nhất của d.309.** `INSERT OR REPLACE` thay một dòng
   * trùng khoá bằng cách **xoá rồi chèn**, mà phép xoá đó **không** bắn
   * `BEFORE DELETE` khi `PRAGMA recursive_triggers` tắt — mặc định của SQLite,
   * và D1 không cho bật chắc chắn. Nên hai ca dưới đây là bằng chứng duy nhất
   * rằng `tg_nhat_ky_khong_de` / `tg_nhat_ky_can_cu_khong_de` (0014) thật sự
   * bịt được đường đó. Cả hai so **nội dung** dòng cũ, không chỉ đếm dòng: một
   * phép ghi đè thành công giữ nguyên số dòng.
   */
  it('`INSERT OR REPLACE` không ghi đè được một dòng đã có (lỗ hổng của BEFORE DELETE)', async () => {
    await dungNhatKy('nk-or', {
      project_id: PJ,
      luc: 1_700_000_000_000,
      quyet_dinh: 'Bản gốc',
      vi_sao: 'Lý do gốc',
    });

    await expect(
      env.DB.prepare(
        `INSERT OR REPLACE INTO nhat_ky
           (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         VALUES ('nk-or', ?, ?, 'chu', NULL, ?, 'Bản ghi đè lén', 'Lý do bịa')`,
      )
        .bind(WS, 1_900_000_000_000, PJ)
        .run(),
    ).rejects.toThrow(/FORBIDDEN/);

    // `INSERT OR IGNORE` cũng không âm thầm nuốt — cùng một trigger.
    await expect(
      env.DB.prepare(
        `INSERT OR IGNORE INTO nhat_ky
           (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         VALUES ('nk-or', ?, ?, 'chu', NULL, ?, 'Bản khác', 'Lý do khác')`,
      )
        .bind(WS, 1_900_000_000_000, PJ)
        .run(),
    ).rejects.toThrow(/FORBIDDEN/);

    // Dòng cũ **còn nguyên**, từng trường một.
    expect(await nhatKyTrongDb('nk-or')).toEqual({
      luc: 1_700_000_000_000,
      nguoi_loai: 'chu',
      agent_id: null,
      project_id: PJ,
      quyet_dinh: 'Bản gốc',
      vi_sao: 'Lý do gốc',
    });
    const dem = await env.DB.prepare('SELECT count(*) AS n FROM nhat_ky').first<{ n: number }>();
    expect(dem?.n).toBe(1);
  });

  it('`INSERT OR REPLACE` cũng không ghi đè được một **căn cứ** đã có', async () => {
    await dungNhatKy('nk-or2', { project_id: PJ });
    const tk = await dungTicket(PJ, 7);
    const tk2 = await dungTicket(PJ, 8);
    await dungCanCu('cc-or', 'nk-or2', 'ticket', tk, 1);

    await expect(
      env.DB.prepare(
        `INSERT OR REPLACE INTO nhat_ky_can_cu
           (id, workspace_id, nhat_ky_id, loai, can_chu_id, ticket_id, dong_cu_id, thu_tu, tao_luc)
         VALUES ('cc-or', ?, 'nk-or2', 'ticket', NULL, ?, NULL, 9, ?)`,
      )
        .bind(WS, tk2, Date.now())
        .run(),
    ).rejects.toThrow(/FORBIDDEN/);

    expect(await canCuCua('nk-or2')).toEqual([
      { loai: 'ticket', can_chu_id: null, ticket_id: tk, dong_cu_id: null, thu_tu: 1 },
    ]);
  });

  it('CHECK `dong_cu_id <> nhat_ky_id`: một dòng không tự thay thế chính nó', async () => {
    await dungNhatKy('nk-tu', { project_id: PJ });

    await expect(
      env.DB.prepare(
        `INSERT INTO nhat_ky_can_cu
           (id, workspace_id, nhat_ky_id, loai, can_chu_id, ticket_id, dong_cu_id, thu_tu, tao_luc)
         VALUES ('cc-tu', ?, 'nk-tu', 'dong_cu', NULL, NULL, 'nk-tu', 1, ?)`,
      )
        .bind(WS, Date.now())
        .run(),
    ).rejects.toThrow(/CHECK|constraint/i);

    // Không bật được cờ "đã có quyết định mới" trỏ về chính mình.
    expect(await canCuCua('nk-tu')).toEqual([]);
  });

  it('API không có đường sửa và không có đường xoá — PATCH và POST .../xoa là 404', async () => {
    await dungNhatKy('nk-5', { project_id: PJ });

    const sua = await goiApi('/v1/nhat-ky/nk-5', TOKEN_CHU, {
      method: 'PATCH',
      than: { quyet_dinh: 'khác' },
    });
    expect(sua.status).toBe(404);

    const xoa = await goiApi('/v1/nhat-ky/nk-5/xoa', TOKEN_CHU, { method: 'POST', than: {} });
    expect(xoa.status).toBe(404);
  });

  it('kho dữ liệu của test tự hoàn tác, nên các ca không dính dòng của nhau', async () => {
    // Ca trên đã ghi `nk-5`; ca này phải thấy bảng rỗng. Đây là ca canh cho lời
    // khai ở đầu file ("không DELETE được, dựa vào isolatedStorage").
    const dem = await env.DB.prepare('SELECT count(*) AS n FROM nhat_ky').first<{ n: number }>();
    expect(dem?.n).toBe(0);
  });
});

/* ================================================================== *
 * C. Ai được ghi — d.310 + bảng quyền mục 3 (ô `write_decision`)
 * ================================================================== */

describe('mục 3 + mục 10 d.310 — bốn ô của hàng "Ghi Nhật ký quyết định"', () => {
  it('bảng quyền thuần: coordinator và manager "có"; worker và reviewer "—"', () => {
    expect(quyen(aiAgent('coordinator'), 'write_decision').cho_phep).toBe(true);
    expect(quyen(aiAgent('manager'), 'write_decision').cho_phep).toBe(true);
    expect(quyen(aiAgent('worker'), 'write_decision').cho_phep).toBe(false);
    expect(quyen(aiAgent('reviewer'), 'write_decision').cho_phep).toBe(false);
  });

  it('`coordinator` ghi được → 201', async () => {
    expect((await ghi(T_COORD, { ...DONG, project_id: PJ })).status).toBe(201);
  });

  it('`manager` ghi được trong dự án mình được vào → 201', async () => {
    expect((await ghi(T_MANAGER, { ...DONG, project_id: PJ })).status).toBe(201);
  });

  it('`worker` → 403 FORBIDDEN', async () => {
    const r = await ghi(T_WORKER, { ...DONG, project_id: PJ });
    expect(r.status).toBe(403);
    expect((await than(r))['error']).toBe('FORBIDDEN');
  });

  it('`reviewer` → 403 FORBIDDEN', async () => {
    const r = await ghi(T_REVIEWER, { ...DONG, project_id: PJ });
    expect(r.status).toBe(403);
    expect((await than(r))['error']).toBe('FORBIDDEN');
  });

  it('19.12 câu 15 — quyền kiểm TRƯỚC khi tra dự án: `worker` gửi dự án không có thật vẫn 403', async () => {
    const r = await ghi(T_WORKER, { ...DONG, project_id: 'pj-khong-co-that' });
    expect(r.status).toBe(403);
  });

  it('agent ngoài phạm vi dự án → 403, không 404 (đường ghi)', async () => {
    const r = await ghi(T_MANAGER_2, { ...DONG, project_id: PJ });
    expect(r.status).toBe(403);
  });

  it('dự án không có thật (người gọi có quyền) → 404', async () => {
    const r = await ghi(TOKEN_CHU, { ...DONG, project_id: 'pj-khong-co-that' });
    expect(r.status).toBe(404);
  });

  it('dự án `archived` là chỉ đọc → PROJECT_NOT_ACCEPTING/409', async () => {
    const r = await ghi(T_MANAGER, { ...DONG, project_id: PJ_LUU });
    expect(r.status).toBe(409);
    expect((await than(r))['error']).toBe('PROJECT_NOT_ACCEPTING');
  });
});

/* ================================================================== *
 * D. Dòng "chủ quyết" — d.310
 * ================================================================== */

describe('mục 10 d.310 — agent KHÔNG ghi được một dòng "chủ quyết"', () => {
  it('agent gửi `nguoi_loai: "chu"` thì trường bị bỏ, dòng vẫn ghi tên agent', async () => {
    const r = await ghi(T_COORD, { ...DONG, project_id: PJ, nguoi_loai: 'chu' });
    expect(r.status).toBe(201);
    const t = await than(r);

    // Whitelist của tầng HTTP báo lại đúng trường đã bỏ.
    expect(t['bo_qua']).toEqual(['nguoi_loai']);
    expect(t['nguoi_loai']).toBe('agent');

    const d = await nhatKyTrongDb(t['id'] as string);
    expect(d?.nguoi_loai).toBe('agent');
    expect(d?.agent_id).toBe('ag-coord');
  });

  it('agent cũng không khai được `agent_id` của người khác, và không khai được `luc`', async () => {
    const r = await ghi(T_MANAGER, {
      ...DONG,
      project_id: PJ,
      agent_id: 'ag-coord',
      luc: 1,
    });
    expect(r.status).toBe(201);
    const t = await than(r);
    expect(t['bo_qua']).toEqual(expect.arrayContaining(['agent_id', 'luc']));

    const d = await nhatKyTrongDb(t['id'] as string);
    expect(d?.agent_id).toBe('ag-man');
    expect(d?.luc).toBeGreaterThan(1);
  });

  it('CHECK của DB: `chu` không mang `agent_id`, `agent` thì phải có', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         VALUES ('nk-x', ?, 1, 'chu', 'ag-man', NULL, 'q', 'v')`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         VALUES ('nk-y', ?, 1, 'agent', NULL, NULL, 'q', 'v')`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();
  });
});

/* ================================================================== *
 * E. "Chung" là dự án RỖNG — 19.12 câu 4, và tầm nhìn của nó (#69)
 * ================================================================== */

describe('19.12 câu 4 — dòng Chung để trống trường dự án', () => {
  it('không gửi dự án → `project_id` là NULL, không có dòng `project` nào tên "Chung"', async () => {
    const r = await ghi(T_COORD, DONG);
    expect(r.status).toBe(201);
    const t = await than(r);
    expect(t['project_id']).toBeNull();
    expect((await nhatKyTrongDb(t['id'] as string))?.project_id).toBeNull();

    const chung = await env.DB.prepare("SELECT count(*) AS n FROM project WHERE ten = 'Chung'")
      .first<{ n: number }>();
    expect(chung?.n).toBe(0);
  });

  it('gửi dự án là chuỗi rỗng cũng là Chung (không phải một mã dự án)', async () => {
    const r = await ghi(T_COORD, { ...DONG, project_id: '' });
    expect(r.status).toBe(201);
    expect((await than(r))['project_id']).toBeNull();
  });

  it('`manager` ghi được dòng Chung — cùng hướng MỞ của đường tạo Cần Chủ (#69)', async () => {
    expect((await ghi(T_MANAGER, DONG)).status).toBe(201);
  });
});

describe('#69 — tầm nhìn của dòng Chung (đề xuất tạm, đổi ở MỘT chỗ)', () => {
  it('luật thuần: chủ và coordinator thấy mọi dòng; manager chỉ dòng của mình; vai khác không thấy', () => {
    expect(tamNhinDongChung({ loai: 'chu' })).toBe('moi_dong');
    expect(tamNhinDongChung(aiAgent('coordinator'))).toBe('moi_dong');
    expect(tamNhinDongChung(aiAgent('manager'))).toBe('chi_cua_minh');
    expect(tamNhinDongChung(aiAgent('worker'))).toBe('khong');
    expect(tamNhinDongChung(aiAgent('reviewer'))).toBe('khong');

    const man = aiAgent('manager', { agent_id: 'ag-man' });
    expect(docDuocDongChung(man, 'ag-man')).toBe(true);
    expect(docDuocDongChung(man, 'ag-man-2')).toBe(false);
    // Dòng Chung **của chủ** cũng không phải "dòng của chính mình".
    expect(docDuocDongChung(man, null)).toBe(false);
    expect(docDuocDongChung({ loai: 'chu' }, 'ag-man')).toBe(true);
  });

  it('một nguồn sự thật: `sqlDongChung` rẽ theo đúng `tamNhinDongChung`, và theo VAI', () => {
    const cot = { du_an: 'project_id', agent: 'agent_id' };
    expect(sqlDongChung({ loai: 'chu' }, cot)).toEqual({ sql: 'project_id IS NULL', bind: [] });

    // `coordinator` **không** bật cờ "mọi dự án" vẫn đọc được mọi dòng Chung —
    // luật #69 theo vai, không theo cờ.
    expect(sqlDongChung(aiAgent('coordinator', { vao_tat_ca_du_an: false }), cot)).toEqual({
      sql: 'project_id IS NULL',
      bind: [],
    });
    // Và bật cờ cũng không làm `manager` rộng ra.
    expect(
      sqlDongChung(aiAgent('manager', { agent_id: 'ag-man', vao_tat_ca_du_an: true }), cot),
    ).toEqual({ sql: '(project_id IS NULL AND agent_id = ?)', bind: ['ag-man'] });

    expect(sqlDongChung(aiAgent('worker'), cot)).toBeNull();
    expect(sqlDongChung(aiAgent('coordinator', { disabled: true }), cot)).toBeNull();

    // Tên cột đổi được — đường đọc Cần Chủ (lượt 2b) dùng `tao_boi_agent_id`.
    expect(
      sqlDongChung(aiAgent('manager', { agent_id: 'ag-man' }), {
        du_an: 'project_id',
        agent: 'tao_boi_agent_id',
      }),
    ).toEqual({ sql: '(project_id IS NULL AND tao_boi_agent_id = ?)', bind: ['ag-man'] });
  });

  it('qua HTTP: coordinator đọc được dòng Chung của người khác, manager thì không', async () => {
    await dungNhatKy('nk-chung-coord', { agent_id: 'ag-coord', quyet_dinh: 'Chung của CoS' });
    await dungNhatKy('nk-chung-man', { agent_id: 'ag-man', quyet_dinh: 'Chung của M-Baton' });

    const coord = await goiApi('/v1/nhat-ky', T_COORD);
    const ds_coord = (await than(coord))['items'] as { id: string }[];
    expect(ds_coord.map((d) => d.id).sort()).toEqual(['nk-chung-coord', 'nk-chung-man']);

    const man = await goiApi('/v1/nhat-ky', T_MANAGER);
    const ds_man = (await than(man))['items'] as { id: string }[];
    expect(ds_man.map((d) => d.id)).toEqual(['nk-chung-man']);

    // Một dòng cụ thể ngoài tầm nhìn → **NOT_FOUND**, không 403 (mục 13).
    const mot = await goiApi('/v1/nhat-ky/nk-chung-coord', T_MANAGER);
    expect(mot.status).toBe(404);
    expect((await than(mot))['error']).toBe('NOT_FOUND');
  });

  /*
   * Luật #69 rẽ theo **VAI**, không theo cờ `vao_tat_ca_du_an` — hai điều kiện
   * khác nhau, và chỉ ca này tách được chúng ra. Một `coordinator` **không** bật
   * cờ: lớp dòng **Chung** không thuộc dự án nào nên cờ dự án không nói gì về
   * nó (thấy hết), còn lớp dòng **có dự án** vẫn theo `agent_project` (chỉ thấy
   * dự án trong phạm vi).
   */
  it('`coordinator` KHÔNG bật cờ "mọi dự án": vẫn thấy mọi dòng Chung, nhưng dòng dự án thì theo phạm vi', async () => {
    await dungAgentCoToken({
      id: 'ag-coord-hep',
      ten: 'CoS hẹp',
      vai_tro: 'coordinator',
      token: 'bt_test_coord_hep',
      du_an: [PJ],
    });
    await dungNhatKy('nk-chung-nguoi-khac', { agent_id: 'ag-man' });
    await dungNhatKy('nk-chung-cua-chu');
    await dungNhatKy('nk-pj-trong', { agent_id: 'ag-man', project_id: PJ });
    await dungNhatKy('nk-pj-ngoai', { agent_id: 'ag-man-2', project_id: PJ_KHAC });

    const r = await goiApi('/v1/nhat-ky', 'bt_test_coord_hep');
    const ds = (await than(r))['items'] as { id: string }[];
    expect(ds.map((d) => d.id).sort()).toEqual([
      'nk-chung-cua-chu',
      'nk-chung-nguoi-khac',
      'nk-pj-trong',
    ]);
    expect((await goiApi('/v1/nhat-ky/nk-pj-ngoai', 'bt_test_coord_hep')).status).toBe(404);
  });

  it('dòng Chung **do chủ ghi**: `manager` không thấy, qua HTTP cũng vậy', async () => {
    await dungNhatKy('nk-chung-chu', { quyet_dinh: 'Chung của chủ' });
    await dungNhatKy('nk-chung-cua-man', { agent_id: 'ag-man' });

    const ds = (await than(await goiApi('/v1/nhat-ky', T_MANAGER)))['items'] as { id: string }[];
    expect(ds.map((d) => d.id)).toEqual(['nk-chung-cua-man']);

    const mot = await goiApi('/v1/nhat-ky/nk-chung-chu', T_MANAGER);
    expect(mot.status).toBe(404);
    expect((await than(mot))['error']).toBe('NOT_FOUND');

    // Chủ thì thấy cả hai — ca đối chứng, để 404 ở trên là **phạm vi** chứ
    // không phải dòng không tồn tại.
    const cua_chu = (await than(await goiApi('/v1/nhat-ky', TOKEN_CHU)))['items'] as {
      id: string;
    }[];
    expect(cua_chu.map((d) => d.id).sort()).toEqual(['nk-chung-chu', 'nk-chung-cua-man']);
  });

  it('`worker` không thấy dòng Chung nào, nhưng vẫn thấy dòng của dự án mình được vào', async () => {
    await dungNhatKy('nk-chung', { agent_id: 'ag-coord' });
    await dungNhatKy('nk-du-an', { agent_id: 'ag-coord', project_id: PJ });

    const r = await goiApi('/v1/nhat-ky', T_WORKER);
    const ds = (await than(r))['items'] as { id: string }[];
    expect(ds.map((d) => d.id)).toEqual(['nk-du-an']);

    expect((await goiApi('/v1/nhat-ky/nk-chung', T_WORKER)).status).toBe(404);
  });

  it('dòng của dự án ngoài phạm vi agent → không hiện, và NOT_FOUND khi đọc thẳng', async () => {
    await dungNhatKy('nk-khac', { agent_id: 'ag-coord', project_id: PJ_KHAC });

    const r = await goiApi('/v1/nhat-ky', T_WORKER);
    expect((await than(r))['items']).toEqual([]);
    expect((await goiApi('/v1/nhat-ky/nk-khac', T_WORKER)).status).toBe(404);
  });
});

/* ================================================================== *
 * F. Luật dữ liệu d.312 — CẢNH BÁO, KHÔNG CHẶN
 * ================================================================== */

describe('mục 10 d.312 — cảnh báo mẫu giống dữ liệu nhân sự, không chặn', () => {
  it('8 chữ số: **không** cảnh báo (dưới ngưỡng 9)', () => {
    expect(canhBaoDuLieuNhanSu('mã build 12345678')).toEqual([]);
  });

  it('9 chữ số: cảnh báo (số tài khoản)', () => {
    const cb = canhBaoDuLieuNhanSu('chuyển về 123456789');
    expect(cb.map((c) => c.ma)).toEqual(['day_so']);
  });

  it('12 chữ số: cảnh báo (CCCD)', () => {
    expect(canhBaoDuLieuNhanSu('CCCD 012345678901').map((c) => c.ma)).toEqual(['day_so']);
  });

  it('13 chữ số: **không** cảnh báo — SPEC viết "dãy 9–12 số", một khoảng có hai đầu', () => {
    // 13 số là hình dạng của một mốc epoch milliseconds, thứ có mặt khắp Baton
    // (`luc`, `tao_luc`). Cảnh báo nó là dạy chủ bỏ qua cảnh báo.
    expect(canhBaoDuLieuNhanSu(`mốc ${String(1_767_225_600_000)}`)).toEqual([]);
  });

  it('cụm "lương" — có dấu, không dấu, hoa thường đều bắt', () => {
    for (const chu of ['lương tháng 10', 'LƯƠNG', 'bảng luong', 'Luong cứng']) {
      expect(canhBaoDuLieuNhanSu(chu).map((c) => c.ma)).toEqual(['luong']);
    }
    // "lượng" là chữ khác (khối lượng, số lượng) — không cảnh báo.
    expect(canhBaoDuLieuNhanSu('giảm khối lượng công việc')).toEqual([]);
  });

  it('hai mẫu cùng lúc → hai cảnh báo', () => {
    expect(canhBaoDuLieuNhanSu('lương 123456789').map((c) => c.ma)).toEqual(['day_so', 'luong']);
  });

  it('qua HTTP: **vẫn ghi** (201), cảnh báo nằm trong kết quả trả về', async () => {
    const r = await ghi(TOKEN_CHU, {
      quyet_dinh: 'Chốt lương tháng 10 cho tài khoản 123456789',
      vi_sao: 'Đã duyệt',
      project_id: PJ,
    });
    expect(r.status).toBe(201);
    const t = await than(r);

    const cb = t['canh_bao'] as { ma: string }[];
    expect(cb.map((c) => c.ma)).toEqual(['day_so', 'luong']);
    // Và dòng **có thật** trong DB — "chỉ cảnh báo, không chặn".
    expect(await nhatKyTrongDb(t['id'] as string)).not.toBeNull();
  });

  it('không có mẫu nào → danh sách cảnh báo rỗng', async () => {
    const t = await than(await ghi(TOKEN_CHU, { ...DONG, project_id: PJ }));
    expect(t['canh_bao']).toEqual([]);
  });
});

/* ================================================================== *
 * G. Màn hình — d.311 (gom theo ngày, 2 bộ lọc, tìm chữ) + d.309 (cờ)
 * ================================================================== */

describe('mục 10 d.311 — gom theo ngày, lọc theo dự án và theo ai, tìm theo chữ', () => {
  /** 10/03/2026 12:00 và 11/03/2026 12:00 **giờ địa phương** (UTC+7). */
  const NGAY_1 = Date.UTC(2026, 2, 10, 5, 0, 0);
  const NGAY_2 = Date.UTC(2026, 2, 11, 5, 0, 0);

  beforeEach(async () => {
    await dungNhatKy('nk-a', {
      luc: NGAY_1,
      agent_id: 'ag-coord',
      project_id: PJ,
      quyet_dinh: 'Chọn D1 làm cơ sở dữ liệu',
    });
    await dungNhatKy('nk-b', {
      luc: NGAY_1 + 1000,
      agent_id: 'ag-man',
      project_id: PJ,
      quyet_dinh: 'Hoãn phần 7 sang v0.2',
    });
    await dungNhatKy('nk-c', {
      luc: NGAY_2,
      project_id: PJ_KHAC,
      quyet_dinh: 'Đổi tên dự án',
    });
  });

  it('gom theo ngày: nhóm theo **giờ địa phương**, thứ tự mới nhất trước', async () => {
    const t = await than(await goiApi('/v1/nhat-ky', TOKEN_CHU));
    expect((t['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-c', 'nk-b', 'nk-a']);
    expect(t['nhom_theo_ngay']).toEqual([
      { ngay: '2026-03-11', so_dong: 1 },
      { ngay: '2026-03-10', so_dong: 2 },
    ]);
  });

  it('`ngayDiaPhuong` dùng múi giờ chủ, không UTC (23:30 giờ VN vẫn là ngày đó)', () => {
    // 2026-03-10 23:30 giờ VN = 2026-03-10 16:30 UTC.
    expect(ngayDiaPhuong(Date.UTC(2026, 2, 10, 16, 30))).toBe('2026-03-10');
    // 2026-03-11 00:30 giờ VN = 2026-03-10 17:30 UTC — đã sang ngày sau.
    expect(ngayDiaPhuong(Date.UTC(2026, 2, 10, 17, 30))).toBe('2026-03-11');
  });

  it('lọc theo **dự án**', async () => {
    const t = await than(await goiApi(`/v1/nhat-ky?project_id=${PJ}`, TOKEN_CHU));
    expect((t['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-b', 'nk-a']);
  });

  it('lọc theo dự án = **Chung** (19.12 câu 4: một lựa chọn riêng của bộ lọc)', async () => {
    await dungNhatKy('nk-chung', { luc: NGAY_2 + 5, agent_id: 'ag-coord' });
    const t = await than(await goiApi('/v1/nhat-ky?project_id=chung', TOKEN_CHU));
    expect((t['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-chung']);
  });

  it('lọc theo **ai**: một agent, và riêng chủ', async () => {
    const theo_agent = await than(await goiApi('/v1/nhat-ky?ai=ag-man', TOKEN_CHU));
    expect((theo_agent['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-b']);

    const theo_chu = await than(await goiApi('/v1/nhat-ky?ai=chu', TOKEN_CHU));
    expect((theo_chu['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-c']);
  });

  /*
   * **Ca biên của hai chuỗi phép thuật** (`LOC_CHUNG = 'chung'`, `ai = 'chu'`).
   * Khoá **hành vi hiện tại**, không đổi thiết kế: đánh đổi đã khai ở
   * `doc-nhat-ky.ts`. Nếu lượt sau đổi sang một tham số riêng
   * (`?du_an_chung=1` / `?ai_loai=chu`) thì hai ca này đỏ chứ không âm thầm.
   */
  it('biên: một dự án có `id` đúng bằng `"chung"` bị bộ lọc hiểu là "Chung"', async () => {
    const t = Date.now();
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
       VALUES ('chung', ?, 'Dự án tên hiểm', 'CHG', 'active', ?, ?)`,
    )
      .bind(WS, t, t)
      .run();
    await dungNhatKy('nk-pj-chung', { luc: NGAY_2 + 7, project_id: 'chung' });
    await dungNhatKy('nk-that-su-chung', { luc: NGAY_2 + 8, agent_id: 'ag-coord' });

    const r = await than(await goiApi('/v1/nhat-ky?project_id=chung', TOKEN_CHU));
    // Trả dòng **Chung thật**, không trả dòng của dự án `chung`.
    expect((r['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-that-su-chung']);
  });

  it('biên: một agent có `id` đúng bằng `"chu"` bị bộ lọc "ai" hiểu là chủ', async () => {
    await dungAgentCoToken({ id: 'chu', ten: 'Agent tên hiểm', vai_tro: 'manager', token: 'bt_x' });
    await dungNhatKy('nk-ag-chu', { luc: NGAY_2 + 9, agent_id: 'chu', project_id: PJ });

    const r = await than(await goiApi('/v1/nhat-ky?ai=chu', TOKEN_CHU));
    // `nk-c` là dòng của **chủ thật**; dòng của agent `chu` không lọt vào.
    expect((r['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-c']);
  });

  it('**tìm theo chữ**: chuỗi con, không phân biệt hoa/thường ASCII', async () => {
    const t = await than(await goiApi('/v1/nhat-ky?tim=co%20so%20du%20lieu', TOKEN_CHU));
    expect((t['items'] as { id: string }[]).map((d) => d.id)).toEqual([]);

    const hoa = await than(await goiApi('/v1/nhat-ky?tim=CHON%20D1', TOKEN_CHU));
    expect((hoa['items'] as { id: string }[]).map((d) => d.id)).toEqual([]);

    const dung = await than(await goiApi('/v1/nhat-ky?tim=HO%C3%83N', TOKEN_CHU));
    // `lower()` của SQLite chỉ biết ASCII, nên "HOÃN" không khớp "Hoãn" — giới
    // hạn đã khai ở 0014 và `chuanHoaTimChu`, giống hệt #70 của mục 8.
    expect((dung['items'] as { id: string }[]).map((d) => d.id)).toEqual([]);

    const ascii = await than(await goiApi('/v1/nhat-ky?tim=D1', TOKEN_CHU));
    expect((ascii['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-a']);
  });

  it('`%` và `_` người dùng gõ là **chữ thường**, không phải ký tự đại diện', async () => {
    expect(thoatLike('100%_a')).toBe('100\\%\\_a');
    const t = await than(await goiApi('/v1/nhat-ky?tim=%25', TOKEN_CHU));
    expect(t['items']).toEqual([]);
    expect(chuanHoaTimChu('  Chon DB ')).toBe('chon db');
  });

  it('hai bộ lọc chồng nhau vẫn đúng (dự án + ai)', async () => {
    const t = await than(await goiApi(`/v1/nhat-ky?project_id=${PJ}&ai=ag-coord`, TOKEN_CHU));
    expect((t['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-a']);
  });

  it('phân trang keyset: hai trang không bỏ sót, không trả trùng', async () => {
    const t1 = await than(await goiApi('/v1/nhat-ky?limit=2', TOKEN_CHU));
    const ds1 = (t1['items'] as { id: string }[]).map((d) => d.id);
    expect(ds1).toEqual(['nk-c', 'nk-b']);
    expect(t1['cursor_sau']).not.toBeNull();

    const t2 = await than(
      await goiApi(`/v1/nhat-ky?limit=2&cursor=${String(t1['cursor_sau'])}`, TOKEN_CHU),
    );
    expect((t2['items'] as { id: string }[]).map((d) => d.id)).toEqual(['nk-a']);
    expect(t2['cursor_sau']).toBeNull();
  });

  it('d.309 — cờ "đã có quyết định mới" là **dẫn xuất**, không một cột', async () => {
    const truoc = await than(await goiApi('/v1/nhat-ky/nk-a', TOKEN_CHU));
    expect(truoc['da_co_quyet_dinh_moi']).toBe(false);

    // Dòng mới trỏ về dòng cũ bằng căn cứ `dong_cu` — không `UPDATE` dòng cũ.
    const moi = await ghi(TOKEN_CHU, {
      quyet_dinh: 'Đổi sang Postgres',
      vi_sao: 'D1 không đủ cho tìm toàn văn',
      project_id: PJ,
      can_cu: [{ loai: 'dong_cu', id: 'nk-a' }],
    });
    expect(moi.status).toBe(201);

    const sau = await than(await goiApi('/v1/nhat-ky/nk-a', TOKEN_CHU));
    expect(sau['da_co_quyet_dinh_moi']).toBe(true);
    // Dòng cũ **không bị sửa** — d.309.
    expect(sau['quyet_dinh']).toBe('Chọn D1 làm cơ sở dữ liệu');

    // Dòng mới thì chưa ai thay thế.
    const t_moi = await than(await goiApi(`/v1/nhat-ky/${String((await than(moi))['id'])}`, TOKEN_CHU));
    expect(t_moi['da_co_quyet_dinh_moi']).toBe(false);
  });

  it('căn cứ `ask` trả kèm `T-số` để phần 6 dựng link', async () => {
    await dungCanChu('ct-9', { project_id: PJ, ma_so: 9 });
    const r = await ghi(TOKEN_CHU, {
      ...DONG,
      project_id: PJ,
      can_cu: [{ loai: 'ask', id: 'ct-9' }],
    });
    const t = await than(await goiApi(`/v1/nhat-ky/${String((await than(r))['id'])}`, TOKEN_CHU));
    expect(t['can_cu']).toEqual([{ loai: 'ask', id: 'ct-9', ma_can_chu: 'T-9' }]);
  });
});

/* ================================================================== *
 * H. Câu của dòng tự sinh từ Cần Chủ — mục 8 d.279, 19.9
 * ================================================================== *
 * **Chưa nối** vào đường xử lý (lượt sau). Ở đây chỉ khoá đúng chữ của SPEC, để
 * lượt đó không phải nghĩ lại và không viết lệch.
 */

describe('19.9 + mục 8 d.279 — câu của ba dòng Nhật ký tự sinh', () => {
  it('bỏ qua: "T-x bỏ qua: <lý do>"', () => {
    expect(cauNhatKyBoQua('T-18', '  không còn cần nữa  ')).toBe('T-18 bỏ qua: không còn cần nữa');
  });

  it('mở lại: "T-x mở lại"', () => {
    expect(cauNhatKyMoLai('T-18')).toBe('T-18 mở lại');
  });

  it('đã xử lý: nội dung **là kết quả** (mã nằm ở căn cứ, không lặp vào nội dung)', () => {
    expect(cauNhatKyKetQua('  Chọn phương án A  ')).toBe('Chọn phương án A');
    // Kết quả rỗng không tới được đây: 19.9 đã có mặc định cho từng loại.
    expect(() => cauNhatKyKetQua('   ')).toThrow();
  });
});

/* ================================================================== *
 * I. Workspace khớp — SPEC mục 1, 18
 * ================================================================== */

describe('mục 1, 18 — dữ liệu workspace khác không lọt, khoá ngoài phải cùng workspace', () => {
  const WS_Z = 'ws-zz-khac';

  beforeEach(async () => {
    const t = Date.now();
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind(WS_Z, 'Người khác', t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
       VALUES ('pj-z', ?, 'Dự án của người khác', 'ZZZ', 'active', ?, ?)`,
    )
      .bind(WS_Z, t, t)
      .run();
  });

  it('dòng của workspace khác không hiện trong danh sách của chủ này', async () => {
    await env.DB.prepare(
      `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
       VALUES ('nk-z', ?, ?, 'chu', NULL, 'pj-z', 'Quyết định của người khác', 'lý do')`,
    )
      .bind(WS_Z, Date.now())
      .run();

    const t = await than(await goiApi('/v1/nhat-ky', TOKEN_CHU));
    expect(t['items']).toEqual([]);
    expect((await goiApi('/v1/nhat-ky/nk-z', TOKEN_CHU)).status).toBe(404);
  });

  it('dòng không mang được dự án của workspace khác (trigger `tg_nhat_ky_ws_them`)', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         VALUES ('nk-lech', ?, ?, 'chu', NULL, 'pj-z', 'q', 'v')`,
      )
        .bind(WS, Date.now())
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  /*
   * Bẫy `<>` vs `IS NOT`: khi đối tượng được trỏ tới **không tồn tại**,
   * `(SELECT workspace_id FROM … )` trả NULL, và `'ws-test' <> NULL` cho NULL —
   * `WHEN` không bật, dòng lọt. Hai ca dưới đây khoá đúng chỗ đó cho **bảng
   * cha** (bảng con đã có ca riêng ở trên). Phải đi SQL thô vì đường ghi đã
   * chặn trước bằng một lần tra dự án.
   */
  it('dòng không mang được một `project_id` **không tồn tại** (bẫy `<>` với NULL)', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         VALUES ('nk-ma', ?, ?, 'chu', NULL, 'pj-khong-co-that', 'q', 'v')`,
      )
        .bind(WS, Date.now())
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
    expect(await nhatKyTrongDb('nk-ma')).toBeNull();
  });

  it('dòng không mang được một `agent_id` **không tồn tại** (bẫy `<>` với NULL)', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         VALUES ('nk-ma2', ?, ?, 'agent', 'ag-khong-co-that', NULL, 'q', 'v')`,
      )
        .bind(WS, Date.now())
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
    expect(await nhatKyTrongDb('nk-ma2')).toBeNull();
  });

  it('căn cứ không trỏ được sang workspace khác (trigger `tg_nhat_ky_can_cu_ws_them`)', async () => {
    await dungNhatKy('nk-w', { project_id: PJ });
    await env.DB.prepare(
      `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
       VALUES ('nk-z2', ?, ?, 'chu', NULL, 'pj-z', 'q', 'v')`,
    )
      .bind(WS_Z, Date.now())
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO nhat_ky_can_cu
           (id, workspace_id, nhat_ky_id, loai, can_chu_id, ticket_id, dong_cu_id, thu_tu, tao_luc)
         VALUES ('cc-z', ?, 'nk-w', 'dong_cu', NULL, NULL, 'nk-z2', 1, ?)`,
      )
        .bind(WS, Date.now())
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  // BAT-58 (19.12 câu 15, `spec-questions.md` #176): trước là 403; nay ticket người
  // gọi không thấy ra 404 GIỐNG HỆT id bịa.
  it('căn cứ trỏ tới một ticket của dự án agent không được vào → 404 giống hệt id bịa (BAT-58)', async () => {
    const tk = await dungTicket(PJ_KHAC, 1, 'Việc của dự án khác');
    const r = await ghi(T_MANAGER, { ...DONG, project_id: PJ, can_cu: [{ loai: 'ticket', id: tk }] });
    const bia = await ghi(T_MANAGER, {
      ...DONG,
      project_id: PJ,
      can_cu: [{ loai: 'ticket', id: 'tk-khong-co' }],
    });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual(await bia.json());

    // Cho vào dự án đó thì đi lọt — luật là phạm vi, không phải một chặn cứng.
    await choVaoDuAn('ag-man', PJ_KHAC);
    const r2 = await ghi(T_MANAGER, {
      ...DONG,
      project_id: PJ,
      can_cu: [{ loai: 'ticket', id: tk }],
    });
    expect(r2.status).toBe(201);
  });
});
