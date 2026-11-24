/**
 * **Thanh công cụ dự án** — SPEC 20.8 (Chủ chốt 04/11/2026, T-131).
 *
 *   A. Quyền: từng hàng × cột của bảng "Ai đổi được" (Ưu tiên / Trạng thái bản đồ
 *      / Nhóm), kể cả `dang_day`/`duy_tri` trực tiếp, lẫn trường ⇒ cả lệnh FORBIDDEN.
 *   B. `trang_thai_ban_do`: bốn giá trị ghi đúng ba trường (đọc lại DB), cùng một
 *      lệnh, chỉ trường đổi; lịch sử; lưu trữ; giá trị sai; mơ hồ; vượt WIP.
 *   C. "Đặt bởi": agent đổi ⇒ tên agent; chủ đè ⇒ tên chủ; ở Tổng quan, chi tiết
 *      dự án và hồ sơ; Tổng quan không tăng số câu theo số dự án.
 *   D. CLI `--trang-thai` và MCP.
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  GHI_TRANG_THAI_BAN_DO,
  LOI_TRANG_THAI_BAN_DO,
  MA_THOAT,
  TRANG_THAI_BAN_DO,
  kiemTrangThaiBanDo,
  quyenSuaTrangThaiBanDo,
  suyTrangThaiBanDo,
} from '@baton/shared';
import { chayCli, xuLyDong, type MoiTruongCli, type ThongDiepRpc } from '@baton/cli';
import { tongQuan } from '../src/doc-tong-quan.js';
import { CHU, TOKEN_CHU, WS, aiAgent, choVaoDuAn, dungAgentCoToken, dungDuAn, dungWorkspace, goiApi } from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const TOKEN = {
  coord: 'bt_token_gia_coord_tcc',
  coord_hep: 'bt_token_gia_coord_hep_tcc',
  mgr: 'bt_token_gia_mgr_tcc',
  mgr_khac: 'bt_token_gia_mgr_khac_tcc',
  mgr_ngoai: 'bt_token_gia_mgr_ngoai_tcc',
  worker: 'bt_token_gia_worker_tcc',
  reviewer: 'bt_token_gia_reviewer_tcc',
} as const;

const ID = {
  coord: 'ag-coord',
  coord_hep: 'ag-coord-hep',
  mgr: 'ag-mgr',
  mgr_khac: 'ag-mgr-khac',
  mgr_ngoai: 'ag-mgr-ngoai',
  worker: 'ag-worker',
  reviewer: 'ag-reviewer',
} as const;

const P = 'pj-SAI';
const P_INC = 'pj-INC';

/**
 * `SAI` (quản lý `M-Sai`) và `INC` (quản lý `M-Inc`). `M-Inc` **được vào** `SAI` mà
 * không quản lý nó — ca "manager dự án khác". `M-Ngoai` không vào `SAI` (ngoài phạm
 * vi). `coord_hep` chỉ vào `INC`.
 */
async function duLieuMau(): Promise<void> {
  await dungWorkspace('Chủ');
  await dungAgentCoToken({ id: ID.coord, ten: 'CoS', vai_tro: 'coordinator', token: TOKEN.coord, vao_tat_ca_du_an: true });
  await dungAgentCoToken({ id: ID.coord_hep, ten: 'CoS-hep', vai_tro: 'coordinator', token: TOKEN.coord_hep });
  await dungAgentCoToken({ id: ID.mgr, ten: 'M-Sai', vai_tro: 'manager', token: TOKEN.mgr });
  await dungAgentCoToken({ id: ID.mgr_khac, ten: 'M-Inc', vai_tro: 'manager', token: TOKEN.mgr_khac });
  await dungAgentCoToken({ id: ID.mgr_ngoai, ten: 'M-Ngoai', vai_tro: 'manager', token: TOKEN.mgr_ngoai });
  await dungAgentCoToken({ id: ID.worker, ten: 'W', vai_tro: 'worker', token: TOKEN.worker });
  await dungAgentCoToken({ id: ID.reviewer, ten: 'R', vai_tro: 'reviewer', token: TOKEN.reviewer });
  await dungDuAn('SAI', 'Sample', 'active', ID.mgr);
  await dungDuAn('INC', 'Incubator', 'active', ID.mgr_khac);
  for (const a of [ID.mgr, ID.mgr_khac, ID.worker, ID.reviewer]) await choVaoDuAn(a, P);
  await choVaoDuAn(ID.mgr_khac, P_INC);
  await choVaoDuAn(ID.coord_hep, P_INC);
}

async function patchDuAn(token: string, than: unknown, id = P): Promise<Response> {
  return await goiApi(`/v1/du-an/${id}`, token, { method: 'PATCH', than });
}

async function loi(res: Response): Promise<{ status: number; error: string; message: string }> {
  const than = await res.json<{ error: string; message: string }>();
  return { status: res.status, ...than };
}

async function dongDuAn(id = P): Promise<{
  trang_thai: string;
  dang_day: number;
  duy_tri: number;
  uu_tien: number;
  nhom: string | null;
}> {
  return (await env.DB.prepare('SELECT trang_thai, dang_day, duy_tri, uu_tien, nhom FROM project WHERE id = ?')
    .bind(id)
    .first<{ trang_thai: string; dang_day: number; duy_tri: number; uu_tien: number; nhom: string | null }>())!;
}

interface DongLs {
  truong: string;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
  tac_gia_loai: string;
  tac_gia_agent_id: string | null;
  luc: number;
}

async function lichSu(id = P): Promise<DongLs[]> {
  const { results } = await env.DB.prepare(
    `SELECT truong, gia_tri_cu, gia_tri_moi, tac_gia_loai, tac_gia_agent_id, luc
       FROM project_history WHERE project_id = ? ORDER BY rowid`,
  )
    .bind(id)
    .all<DongLs>();
  return results;
}

/* ================================================================== *
 * A. Quyền — bảng "Ai đổi được" của 20.8
 * ================================================================== */

describe('A. 20.8 quyền: hàng × cột (Ưu tiên / Trạng thái bản đồ / Nhóm)', () => {
  beforeEach(duLieuMau);

  it('Chủ: ưu tiên được, trạng thái được, nhóm được', async () => {
    expect((await patchDuAn(TOKEN_CHU, { uu_tien: 5 })).status).toBe(200);
    expect((await patchDuAn(TOKEN_CHU, { trang_thai_ban_do: 'tam_dung' })).status).toBe(200);
    expect((await patchDuAn(TOKEN_CHU, { nhom: 'Sample' })).status).toBe(200);
    expect(await dongDuAn()).toMatchObject({ uu_tien: 5, trang_thai: 'paused', nhom: 'Sample' });
  });

  it('coordinator: ưu tiên được, trạng thái được; nhóm ⇒ FORBIDDEN', async () => {
    expect((await patchDuAn(TOKEN.coord, { uu_tien: 4 })).status).toBe(200);
    expect((await patchDuAn(TOKEN.coord, { trang_thai_ban_do: 'dang_day' })).status).toBe(200);
    expect(await loi(await patchDuAn(TOKEN.coord, { nhom: 'X' }))).toMatchObject({ status: 403, error: 'FORBIDDEN' });
    expect(
      await loi(await patchDuAn(TOKEN.coord, { trang_thai_ban_do: 'hang_cho', nhom: 'X' })),
    ).toMatchObject({ status: 403, error: 'FORBIDDEN' });
    expect(await dongDuAn()).toMatchObject({ uu_tien: 4, dang_day: 1, nhom: null });
  });

  it('manager CỦA dự án: trạng thái được (cả dang_day/duy_tri trực tiếp); ưu tiên, nhóm ⇒ FORBIDDEN', async () => {
    expect((await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'dang_day' })).status).toBe(200);
    expect(await dongDuAn()).toMatchObject({ trang_thai: 'active', dang_day: 1, duy_tri: 0 });
    expect((await patchDuAn(TOKEN.mgr, { dang_day: false })).status).toBe(200);
    expect((await patchDuAn(TOKEN.mgr, { duy_tri: true })).status).toBe(200);
    expect(await dongDuAn()).toMatchObject({ dang_day: 0, duy_tri: 1 });

    for (const than of [{ uu_tien: 2 }, { nhom: 'X' }, { ten_ngan: 'S' }, { trang_thai: 'paused' }]) {
      const l = await loi(await patchDuAn(TOKEN.mgr, than));
      expect(l, JSON.stringify(than)).toMatchObject({ status: 403, error: 'FORBIDDEN' });
    }
    // Lẫn một trường không được phép ⇒ FORBIDDEN CẢ lệnh, không ghi gì.
    const l = await loi(await patchDuAn(TOKEN.mgr, { uu_tien: 2, trang_thai_ban_do: 'tam_dung' }));
    expect(l).toMatchObject({ status: 403, error: 'FORBIDDEN' });
    expect(l.message).toContain('SPEC 20.1, 20.8');
    expect(await dongDuAn()).toMatchObject({ trang_thai: 'active', uu_tien: 3, duy_tri: 1 });
  });

  it('manager dự án KHÁC (kể cả được vào), worker, reviewer ⇒ FORBIDDEN mọi cột; không đổi gì', async () => {
    for (const token of [TOKEN.mgr_khac, TOKEN.worker, TOKEN.reviewer]) {
      for (const than of [
        { uu_tien: 1 },
        { trang_thai_ban_do: 'tam_dung' },
        { dang_day: true },
        { duy_tri: true },
        { nhom: 'X' },
      ]) {
        const l = await loi(await patchDuAn(token, than));
        expect(l, `${token} ${JSON.stringify(than)}`).toMatchObject({ status: 403, error: 'FORBIDDEN' });
      }
    }
    const l = await loi(await patchDuAn(TOKEN.mgr_khac, { trang_thai_ban_do: 'tam_dung' }));
    expect(l.message).toContain('SPEC 20.8');
    expect(await dongDuAn()).toMatchObject({ trang_thai: 'active', dang_day: 0, duy_tri: 0, uu_tien: 3, nhom: null });
    expect(await lichSu()).toEqual([]);
  });

  it('không kênh dò: manager khác ra CÙNG FORBIDDEN cho id thật và id bịa; coordinator ngoài phạm vi ⇒ NOT_FOUND như id bịa', async () => {
    const that = await loi(await patchDuAn(TOKEN.mgr_ngoai, { trang_thai_ban_do: 'tam_dung' }));
    const bia = await loi(await patchDuAn(TOKEN.mgr_ngoai, { trang_thai_ban_do: 'tam_dung' }, 'pj-BIA'));
    expect(that).toEqual(bia);
    expect(that.status).toBe(403);

    const hep = await loi(await patchDuAn(TOKEN.coord_hep, { trang_thai_ban_do: 'tam_dung' }));
    const hep_bia = await loi(await patchDuAn(TOKEN.coord_hep, { trang_thai_ban_do: 'tam_dung' }, 'pj-BIA'));
    expect(hep).toEqual(hep_bia);
    expect(hep.status).toBe(404);
    expect((await patchDuAn(TOKEN.coord_hep, { trang_thai_ban_do: 'tam_dung' }, P_INC)).status).toBe(200);
  });

  it('agent bị tắt ⇒ FORBIDDEN; hàm quyền thuần khớp bảng 20.8', async () => {
    await env.DB.prepare('UPDATE agent SET disabled = 1 WHERE id = ?').bind(ID.mgr).run();
    expect(await loi(await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'tam_dung' }))).toMatchObject({ status: 403 });

    const mgr = aiAgent('manager', { du_an_duoc_vao: [P], du_an_minh_quan_ly: [P] });
    const mgr_khac = aiAgent('manager', { du_an_duoc_vao: [P], du_an_minh_quan_ly: [P_INC] });
    expect(quyenSuaTrangThaiBanDo(CHU, P).cho_phep).toBe(true);
    expect(quyenSuaTrangThaiBanDo(aiAgent('coordinator', { vao_tat_ca_du_an: true }), P).cho_phep).toBe(true);
    expect(quyenSuaTrangThaiBanDo(mgr, P).cho_phep).toBe(true);
    expect(quyenSuaTrangThaiBanDo(mgr_khac, P).cho_phep).toBe(false);
    expect(quyenSuaTrangThaiBanDo(aiAgent('worker', { du_an_duoc_vao: [P] }), P).cho_phep).toBe(false);
    expect(quyenSuaTrangThaiBanDo(aiAgent('reviewer', { du_an_duoc_vao: [P] }), P).cho_phep).toBe(false);
    expect(quyenSuaTrangThaiBanDo({ ...mgr, disabled: true }, P).cho_phep).toBe(false);
  });
});

/* ================================================================== *
 * B. trang_thai_ban_do — bảng 20.8
 * ================================================================== */

describe('B. 20.8 ô Trạng thái: bốn giá trị ⇒ ba trường', () => {
  beforeEach(duLieuMau);

  it('hàm thuần: bảng 20.8 hai chiều; giá trị sai ⇒ INVALID_INPUT kèm danh sách đúng', () => {
    expect(GHI_TRANG_THAI_BAN_DO).toEqual({
      dang_day: { trang_thai: 'active', dang_day: true, duy_tri: false },
      hang_cho: { trang_thai: 'active', dang_day: false, duy_tri: false },
      tam_dung: { trang_thai: 'paused', dang_day: false, duy_tri: false },
      duy_tri: { trang_thai: 'active', dang_day: false, duy_tri: true },
    });
    for (const t of TRANG_THAI_BAN_DO) expect(suyTrangThaiBanDo(GHI_TRANG_THAI_BAN_DO[t])).toBe(t);
    expect(suyTrangThaiBanDo({ trang_thai: 'archived', dang_day: false, duy_tri: false })).toBeNull();
    for (const v of ['dang-day', 'archived', 'luu_tru', '', null, 1]) {
      expect(() => kiemTrangThaiBanDo(v), String(v)).toThrow(LOI_TRANG_THAI_BAN_DO);
    }
    expect(LOI_TRANG_THAI_BAN_DO).toContain('dang_day, hang_cho, tam_dung, duy_tri');
  });

  it('từng giá trị ghi đúng trang_thai/dang_day/duy_tri (đọc lại DB), chỉ trường thật sự đổi', async () => {
    const ca: [string, { trang_thai: string; dang_day: number; duy_tri: number }, string[]][] = [
      ['dang_day', { trang_thai: 'active', dang_day: 1, duy_tri: 0 }, ['dang_day']],
      ['tam_dung', { trang_thai: 'paused', dang_day: 0, duy_tri: 0 }, ['trang_thai', 'dang_day']],
      ['duy_tri', { trang_thai: 'active', dang_day: 0, duy_tri: 1 }, ['trang_thai', 'duy_tri']],
      ['hang_cho', { trang_thai: 'active', dang_day: 0, duy_tri: 0 }, ['duy_tri']],
      ['hang_cho', { trang_thai: 'active', dang_day: 0, duy_tri: 0 }, []],
      ['tam_dung', { trang_thai: 'paused', dang_day: 0, duy_tri: 0 }, ['trang_thai']],
      ['dang_day', { trang_thai: 'active', dang_day: 1, duy_tri: 0 }, ['trang_thai', 'dang_day']],
      ['duy_tri', { trang_thai: 'active', dang_day: 0, duy_tri: 1 }, ['duy_tri', 'dang_day']],
    ];
    for (const [gt, mong, da_doi] of ca) {
      const res = await patchDuAn(TOKEN.coord, { trang_thai_ban_do: gt });
      expect(res.status, gt).toBe(200);
      const kq = await res.json<{ da_doi: string[]; wip: { dang_day: number } }>();
      expect(kq.da_doi.sort(), gt).toEqual([...da_doi].sort());
      expect(await dongDuAn(), gt).toMatchObject(mong);
      // Kết quả luôn mang đồng hồ WIP (ô chạm dang_day/duy_tri).
      expect(kq.wip.dang_day, gt).toBe(mong.dang_day);
    }
  });

  it('cùng một lệnh: các dòng lịch sử của một lần chọn chung một `luc`, đúng ai và cũ → mới (kể cả trang_thai)', async () => {
    await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'dang_day' });
    await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'tam_dung' });
    const ls = await lichSu();
    expect(ls.map(({ luc: _l, ...d }) => d)).toEqual([
      { truong: 'dang_day', gia_tri_cu: '0', gia_tri_moi: '1', tac_gia_loai: 'agent', tac_gia_agent_id: ID.mgr },
      { truong: 'trang_thai', gia_tri_cu: 'active', gia_tri_moi: 'paused', tac_gia_loai: 'agent', tac_gia_agent_id: ID.mgr },
      { truong: 'dang_day', gia_tri_cu: '1', gia_tri_moi: '0', tac_gia_loai: 'agent', tac_gia_agent_id: ID.mgr },
    ]);
    expect(ls[1]!.luc).toBe(ls[2]!.luc);
  });

  it('chủ đổi trang_thai qua trường cũ cũng ghi lịch sử (20.8 cần cho "Đặt bởi")', async () => {
    expect((await patchDuAn(TOKEN_CHU, { trang_thai: 'paused' })).status).toBe(200);
    expect((await lichSu()).map(({ luc: _l, ...d }) => d)).toEqual([
      { truong: 'trang_thai', gia_tri_cu: 'active', gia_tri_moi: 'paused', tac_gia_loai: 'owner', tac_gia_agent_id: null },
    ]);
  });

  it('dự án lưu trữ ⇒ PROJECT_NOT_ACCEPTING cho MỌI người gọi (cả chủ), không đổi gì', async () => {
    await env.DB.prepare("UPDATE project SET trang_thai = 'archived' WHERE id = ?").bind(P).run();
    for (const token of [TOKEN_CHU, TOKEN.coord, TOKEN.mgr]) {
      for (const gt of TRANG_THAI_BAN_DO) {
        expect(await loi(await patchDuAn(token, { trang_thai_ban_do: gt })), `${token} ${gt}`).toMatchObject({
          status: 409,
          error: 'PROJECT_NOT_ACCEPTING',
        });
      }
    }
    expect(await dongDuAn()).toMatchObject({ trang_thai: 'archived', dang_day: 0, duy_tri: 0 });
    // Mở lại lưu trữ vẫn là chủ dùng `trang_thai` ở chỗ cũ.
    expect((await patchDuAn(TOKEN_CHU, { trang_thai: 'active' })).status).toBe(200);
  });

  it('giá trị sai ⇒ INVALID_INPUT kèm danh sách đúng; gửi cùng trang_thai/dang_day/duy_tri ⇒ INVALID_INPUT (mơ hồ)', async () => {
    for (const v of ['dang-day', 'archived', 'active', '', 3, null]) {
      const l = await loi(await patchDuAn(TOKEN_CHU, { trang_thai_ban_do: v }));
      expect(l, String(v)).toMatchObject({ status: 422, error: 'INVALID_INPUT', message: LOI_TRANG_THAI_BAN_DO });
    }
    for (const kem of [{ trang_thai: 'active' }, { dang_day: true }, { duy_tri: false }]) {
      const l = await loi(await patchDuAn(TOKEN_CHU, { trang_thai_ban_do: 'hang_cho', ...kem }));
      expect(l, JSON.stringify(kem)).toMatchObject({ status: 422, error: 'INVALID_INPUT' });
      expect(l.message).toContain('SPEC 20.8');
    }
    // Manager của dự án gửi cùng dang_day: lỗi nhập, vẫn không ghi gì.
    expect(await loi(await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'hang_cho', dang_day: true }))).toMatchObject({
      status: 422,
    });
    expect(await dongDuAn()).toMatchObject({ trang_thai: 'active', dang_day: 0, duy_tri: 0 });
    expect(await lichSu()).toEqual([]);
  });

  it('chọn "Đang đẩy" khi đã đủ WIP vẫn cho, kết quả mang wip.vuot (20.1)', async () => {
    await goiApi('/v1/cai-dat/workspace', TOKEN_CHU, { method: 'PUT', than: { gioi_han_wip: 1 } });
    expect((await patchDuAn(TOKEN.coord, { trang_thai_ban_do: 'dang_day' }, P_INC)).status).toBe(200);
    const res = await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'dang_day' });
    expect(res.status).toBe(200);
    expect((await res.json<{ wip: unknown }>()).wip).toEqual({ dang_day: 2, gioi_han: 1, vuot: true });
    expect(await dongDuAn()).toMatchObject({ dang_day: 1 });
  });

  it('dự án Tạm dừng chọn "Đang đẩy" ⇒ active + dang_day; dự án duy trì chọn "Đang đẩy" ⇒ tắt duy_tri cùng lệnh', async () => {
    await patchDuAn(TOKEN_CHU, { trang_thai: 'paused' });
    await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'dang_day' });
    expect(await dongDuAn()).toMatchObject({ trang_thai: 'active', dang_day: 1, duy_tri: 0 });
    await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'duy_tri' });
    expect(await dongDuAn()).toMatchObject({ dang_day: 0, duy_tri: 1 });
    await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'dang_day' });
    expect(await dongDuAn()).toMatchObject({ dang_day: 1, duy_tri: 0 });
  });

  it('đặt dang_day=có cho dự án paused qua trường cũ: giữ hành vi cũ (cho, trạng thái vẫn paused)', async () => {
    await patchDuAn(TOKEN_CHU, { trang_thai: 'paused' });
    expect((await patchDuAn(TOKEN.mgr, { dang_day: true })).status).toBe(200);
    expect(await dongDuAn()).toMatchObject({ trang_thai: 'paused', dang_day: 1 });
  });
});

/* ================================================================== *
 * C. "Đặt bởi"
 * ================================================================== */

interface DatBoiRa {
  loai: string;
  ten: string;
  luc: number;
}

async function datBoiChiTiet(id = P): Promise<DatBoiRa | null> {
  return (await (await goiApi(`/v1/du-an/${id}`, TOKEN_CHU)).json<{ dat_boi: DatBoiRa | null }>()).dat_boi;
}

async function datBoiHoSo(id = P): Promise<DatBoiRa | null> {
  return (await (await goiApi(`/v1/du-an/${id}/ho-so`, TOKEN_CHU)).json<{ du_an: { dat_boi: DatBoiRa | null } }>())
    .du_an.dat_boi;
}

async function datBoiTongQuan(id = P): Promise<DatBoiRa | null | undefined> {
  const tq = await tongQuan(env.DB, CHU, WS, Date.now());
  return tq.du_an.find((d) => d.id === id)?.dat_boi;
}

describe('C. 20.8 "Đặt bởi" — lần đổi cuối của ưu tiên/trạng thái/đang đẩy/duy trì/nhóm', () => {
  beforeEach(duLieuMau);

  it('GET /v1/du-an/:id mang bay_gio của máy chủ (thời gian tương đối của "Đặt bởi" ở bảng việc)', async () => {
    const truoc = Date.now();
    const d = await (await goiApi(`/v1/du-an/${P}`, TOKEN_CHU)).json<{ bay_gio: number }>();
    expect(d.bay_gio).toBeGreaterThanOrEqual(truoc);
  });

  it('chưa ai đổi ⇒ null ở Tổng quan, chi tiết dự án, hồ sơ', async () => {
    expect(await datBoiTongQuan()).toBeNull();
    expect(await datBoiChiTiet()).toBeNull();
    expect(await datBoiHoSo()).toBeNull();
  });

  it('agent đổi ⇒ tên agent; chủ đè lại ⇒ tên chủ — ở cả ba đường đọc', async () => {
    await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'tam_dung' });
    for (const d of [await datBoiTongQuan(), await datBoiChiTiet(), await datBoiHoSo()]) {
      expect(d).toMatchObject({ loai: 'agent', ten: 'M-Sai' });
      expect(d?.luc).toBeGreaterThan(0);
    }
    // Chủ đè lên giá trị agent vừa đặt (20.8 "Chủ là cấp cao nhất").
    expect((await patchDuAn(TOKEN_CHU, { trang_thai_ban_do: 'dang_day' })).status).toBe(200);
    for (const d of [await datBoiTongQuan(), await datBoiChiTiet(), await datBoiHoSo()]) {
      expect(d).toMatchObject({ loai: 'chu', ten: 'Chủ' });
    }
    // Agent đổi lại giá trị chủ đã đặt: được, và "Đặt bởi" về agent.
    expect((await patchDuAn(TOKEN.coord, { uu_tien: 5 })).status).toBe(200);
    expect(await datBoiChiTiet()).toMatchObject({ loai: 'agent', ten: 'CoS' });
  });

  it('chỉ năm trường: đổi ten_ngan không đổi "Đặt bởi"; dự án khác không lẫn', async () => {
    await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'dang_day' });
    await patchDuAn(TOKEN_CHU, { ten_ngan: 'SP' });
    expect(await datBoiChiTiet()).toMatchObject({ loai: 'agent', ten: 'M-Sai' });
    await patchDuAn(TOKEN_CHU, { nhom: 'Sample' });
    expect(await datBoiChiTiet()).toMatchObject({ loai: 'chu', ten: 'Chủ' });
    expect(await datBoiChiTiet(P_INC)).toBeNull();
    expect(await datBoiTongQuan(P_INC)).toBeNull();
  });

  it('cùng `luc` ⇒ dòng chèn sau thắng', async () => {
    const luc = 1_000;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO project_history (id, workspace_id, project_id, tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi)
         VALUES ('h-z', ?, ?, 'agent', ?, ?, 'uu_tien', '3', '4')`,
      ).bind(WS, P, ID.coord, luc),
      env.DB.prepare(
        `INSERT INTO project_history (id, workspace_id, project_id, tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi)
         VALUES ('h-a', ?, ?, 'owner', NULL, ?, 'uu_tien', '4', '5')`,
      ).bind(WS, P, luc),
    ]);
    expect(await datBoiChiTiet()).toEqual({ loai: 'chu', ten: 'Chủ', luc });
  });

  it('Tổng quan: số câu truy vấn KHÔNG tăng theo số dự án có lịch sử', async () => {
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
    await patchDuAn(TOKEN.mgr, { trang_thai_ban_do: 'dang_day' });
    const d1 = demPrepare();
    const nho = await tongQuan(d1.db, CHU, WS, Date.now());
    expect(nho.du_an.filter((d) => d.dat_boi !== null).length).toBe(1);
    const n1 = d1.so();

    for (let i = 0; i < 10; i += 1) {
      const pj = await dungDuAn(`K${String.fromCharCode(65 + i)}`, `Dự án ${String(i)}`);
      await patchDuAn(TOKEN_CHU, { uu_tien: i % 2 === 0 ? 5 : 1 }, pj);
    }
    const d2 = demPrepare();
    const lon = await tongQuan(d2.db, CHU, WS, Date.now());
    expect(lon.du_an.filter((d) => d.dat_boi !== null).length).toBe(11);
    expect(d2.so()).toBe(n1);
  });
});

/* ================================================================== *
 * D. CLI `baton project set --trang-thai` và MCP
 * ================================================================== */

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
  than: unknown[];
  so_request: () => number;
}

function ban(token: string): BanChay {
  const ra: string[] = [];
  const loi_ra: string[] = [];
  const than: unknown[] = [];
  let n = 0;
  return {
    mt: {
      env: { BATON_URL: 'https://baton.test', BATON_TOKEN: token },
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void loi_ra.push(d),
      fetch: async (u, i) => {
        n += 1;
        if (i?.method === 'PATCH' && typeof i.body === 'string') than.push(JSON.parse(i.body));
        return await SELF.fetch(u, i);
      },
      docFile: () => Promise.reject(new Error('không đọc file')),
    },
    ra,
    loi: loi_ra,
    than,
    so_request: () => n,
  };
}

describe('D. CLI --trang-thai (20.8) và MCP', () => {
  beforeEach(duLieuMau);

  it('bốn giá trị gạch ngang ⇒ thân PATCH gạch dưới, DB đúng bảng 20.8', async () => {
    const ca: [string, string, { trang_thai: string; dang_day: number; duy_tri: number }][] = [
      ['dang-day', 'dang_day', { trang_thai: 'active', dang_day: 1, duy_tri: 0 }],
      ['hang-cho', 'hang_cho', { trang_thai: 'active', dang_day: 0, duy_tri: 0 }],
      ['tam-dung', 'tam_dung', { trang_thai: 'paused', dang_day: 0, duy_tri: 0 }],
      ['duy-tri', 'duy_tri', { trang_thai: 'active', dang_day: 0, duy_tri: 1 }],
    ];
    for (const [co, api, mong] of ca) {
      const b = ban(TOKEN.mgr);
      const ma = await chayCli(['project', 'set', 'SAI', '--trang-thai', co], b.mt);
      expect(ma, [...b.ra, ...b.loi].join('\n')).toBe(MA_THOAT.xong);
      expect(b.than).toEqual([{ trang_thai_ban_do: api }]);
      expect(await dongDuAn(), co).toMatchObject(mong);
      expect(b.ra.join('\n')).toContain('Đang đẩy');
    }
  });

  it('giá trị sai ⇒ mã 1, liệt kê bốn giá trị, KHÔNG request nào', async () => {
    for (const v of ['dang_day', 'luu-tru', 'DANG-DAY', '']) {
      const b = ban(TOKEN_CHU);
      expect(await chayCli(['project', 'set', 'SAI', '--trang-thai', v, '--json'], b.mt), v).toBe(
        MA_THOAT.loi_nghiep_vu,
      );
      const than = JSON.parse(b.loi.join('\n')) as { loi: string; thong_diep: string };
      expect(than.loi).toBe('INVALID_INPUT');
      expect(than.thong_diep).toContain('dang-day, hang-cho, tam-dung, duy-tri');
      expect(b.so_request(), v).toBe(0);
    }
  });

  it('vượt WIP: vẫn mã 0 và in cảnh báo như --dang-day on', async () => {
    await goiApi('/v1/cai-dat/workspace', TOKEN_CHU, { method: 'PUT', than: { gioi_han_wip: 1 } });
    await chayCli(['project', 'set', 'INC', '--trang-thai', 'dang-day'], ban(TOKEN.coord).mt);
    const b = ban(TOKEN.mgr);
    expect(await chayCli(['project', 'set', 'SAI', '--trang-thai', 'dang-day'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Cảnh báo: vượt giới hạn WIP (2 > 1)');
  });

  it('thông điệp "Cần ít nhất một cờ" và --help nhắc --trang-thai', async () => {
    const b = ban(TOKEN_CHU);
    await chayCli(['project', 'set', 'SAI', '--json'], b.mt);
    expect((JSON.parse(b.loi.join('\n')) as { thong_diep: string }).thong_diep).toContain('--trang-thai');
    const h = ban(TOKEN_CHU);
    await chayCli(['project', '--help'], h.mt);
    expect(h.ra.join('\n')).toContain('--trang-thai dang-day|hang-cho|tam-dung|duy-tri');
  });

  it('MCP: công cụ `project` nhận tham số trang_thai (tự sinh từ cờ CLI)', async () => {
    const b = ban(TOKEN.mgr);
    const goi = async (args: Record<string, unknown>): Promise<{ ma_thoat: number; loi?: string | null }> => {
      const tra = (await xuLyDong(
        b.mt,
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'project', arguments: args } }),
      )) as ThongDiepRpc;
      return (tra.result as { structuredContent: { ma_thoat: number; loi?: string | null } }).structuredContent;
    };
    const ds = (await xuLyDong(b.mt, JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))) as ThongDiepRpc;
    const cong_cu = (ds.result as { tools: { name: string; inputSchema: { properties: Record<string, unknown> } }[] }).tools.find(
      (t) => t.name === 'project',
    );
    expect(Object.keys(cong_cu?.inputSchema.properties ?? {})).toContain('trang_thai');

    expect(await goi({ thao_tac: 'set', ma: 'SAI', trang_thai: 'tam-dung' })).toMatchObject({ ma_thoat: 0 });
    expect(await dongDuAn()).toMatchObject({ trang_thai: 'paused' });
    expect(await goi({ thao_tac: 'set', ma: 'SAI', trang_thai: 'luu-tru' })).toMatchObject({
      ma_thoat: 1,
      loi: 'INVALID_INPUT',
    });
  });
});
