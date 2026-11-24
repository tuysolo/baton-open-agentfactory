/**
 * **BAT-58** — không lộ sự tồn tại của id **ticket / bình luận / bằng chứng** qua
 * các đường GHI (19.12 câu 15 gạch 3: "Với agent ngoài phạm vi, **cả hai ca phải
 * ra phản hồi giống hệt nhau**"). Tiếp đúng khuôn BAT-57 (id lượt/phiên).
 *
 * Người gọi **không thấy** được đối tượng (ticket của nó nằm ngoài dự án người gọi
 * được vào — đúng bộ lọc `locPhamViTicket` mà `layTicket` dùng) ⇒ **cùng dòng
 * `throw NOT_FOUND`** với id bịa: so trực tiếp status, content-type, thân; và ảnh
 * DB trước/sau như nhau (không Lịch sử, không Nhật ký, không thông báo, không
 * nhích tín hiệu phiên, không "lần cuối lên tiếng"). Người gọi **thấy** được mà
 * không có quyền ⇒ vẫn 403. Phạm vi kiểm **trước** mọi luật nghiệp vụ (thông điệp
 * của `INVALID_INPUT`/`PROJECT_NOT_ACCEPTING`… cũng kể trạng thái đối tượng).
 * Chọn 404 (không 403) cùng lý do #175 — `cau-hoi-spec.md` #176.
 *
 * Bảng route đã rà (agent ngoài phạm vi, id THẬT; trước → sau):
 *   PATCH /v1/ticket/:id (sửa trường)                      403 → 404
 *   PATCH /v1/ticket/:id { khong_code } (agent)            403 cả hai (chỉ chủ, kiểm trước khi tra) — đúng sẵn
 *   POST  /v1/ticket/:id/trang-thai                        403 → 404 (kể cả ticket đã Xong)
 *   POST  /v1/ticket/:id/trang-thai duplicate, ticket_goc_id ngoài phạm vi (thân)
 *                                                          200 (ghi id gốc!) → INVALID_DUPLICATE_TARGET giống id bịa
 *   POST  /v1/ticket/:id/toi-lam                           403 cả hai (chỉ chủ) — đúng sẵn
 *   POST  /v1/ticket/:id/nhan (nhãn)                       403 → 404
 *   POST  /v1/ticket/:id/lien-ket (đầu nguồn, đường dẫn)   403 → 404
 *   POST  /v1/ticket/:id/lien-ket (đầu đích, thân)         403 → 404
 *   POST  /v1/ticket/:id/lien-ket dieu_phoi, vai sai       403 cả hai (vai kiểm trước khi tra) — đúng sẵn
 *   POST  /v1/ticket/:id/lien-ket dieu_phoi, coordinator ngoài 403 → 404
 *   POST  /v1/ticket/:id/xoa, /khoi-phuc                   403 cả hai (chỉ chủ) — đúng sẵn
 *   POST  /v1/ticket { ticket_cha_id } (thân)              403 → 404
 *   POST  /v1/ticket/:id/luot-giao (assign)                404 — đúng sẵn từ BAT-57
 *   POST  /v1/ticket/:id/binh-luan                         403 → 404
 *   PATCH /v1/binh-luan/:id                                403 → 404
 *   POST  /v1/binh-luan/:id/xoa                            403 cả hai (agent không bao giờ xoá) — đúng sẵn
 *   POST  /v1/ticket/:id/bang-chung                        403 → 404
 *   POST  /v1/bang-chung/:id/rut                           403 → 404
 *   POST  /v1/can-chu { ticket_lien_quan } (thân)          403 → 404
 *   POST  /v1/nhat-ky { can_cu: [{ loai: 'ticket' }] }     403 → 404
 *   POST  /v1/trong-tam { muc: [{ ticket_id }] }           201 (ghi!) → 404
 *   lệnh `doi_tieu_de` (không có route HTTP; qua cửa ghi)  NOT_FOUND khác/không lọc → NOT_FOUND giống hệt
 *
 * Không có route đổi trạng thái **hàng loạt** ở máy chủ (web gọi từng ticket), nên
 * không có dòng riêng cho nó.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { BatonError } from '@baton/shared';
import { goiLenh } from '../src/workspace-gate.js';
import {
  TOKEN_CHU,
  WS,
  aiAgent,
  dungAgentCoToken,
  dungBangChung,
  dungBinhLuan,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/** Token **giả**. */
const TOKEN = {
  wk: 'bt_token_gia_bat58_wk',
  wk2: 'bt_token_gia_bat58_wk2',
  mgr: 'bt_token_gia_bat58_mgr',
  hai: 'bt_token_gia_bat58_hai',
  ngoai_mgr: 'bt_token_gia_bat58_ngoai_mgr',
  ngoai_wk: 'bt_token_gia_bat58_ngoai_wk',
  ngoai_coord: 'bt_token_gia_bat58_ngoai_coord',
  tat_ca: 'bt_token_gia_bat58_tat_ca',
} as const;

let P = '';
let P_NGOAI = '';
let TK1 = '';
let TK2 = '';
let TK3 = '';
let TK_NGOAI = '';
const CM1 = 'cm-bat58-1';
const EV1 = 'ev-bat58-1';

async function nen(): Promise<void> {
  await dungWorkspace();
  P = await dungDuAn('SAI', 'Sample');
  P_NGOAI = await dungDuAn('OUT', 'Dự án khác');
  await dungAgentCoToken({ id: 'ag-wk', ten: 'W-builder', vai_tro: 'worker', token: TOKEN.wk, du_an: [P] });
  await dungAgentCoToken({ id: 'ag-wk2', ten: 'W-builder-2', vai_tro: 'worker', token: TOKEN.wk2, du_an: [P] });
  await dungAgentCoToken({ id: 'ag-mgr', ten: 'M-Sample', vai_tro: 'manager', token: TOKEN.mgr, du_an: [P] });
  await dungAgentCoToken({
    id: 'ag-hai',
    ten: 'M-hai-du-an',
    vai_tro: 'manager',
    token: TOKEN.hai,
    du_an: [P, P_NGOAI],
  });
  await dungAgentCoToken({
    id: 'ag-ngoai-mgr',
    ten: 'M-ngoai',
    vai_tro: 'manager',
    token: TOKEN.ngoai_mgr,
    du_an: [P_NGOAI],
  });
  await dungAgentCoToken({
    id: 'ag-ngoai-wk',
    ten: 'W-ngoai',
    vai_tro: 'worker',
    token: TOKEN.ngoai_wk,
    du_an: [P_NGOAI],
  });
  await dungAgentCoToken({
    id: 'ag-ngoai-coord',
    ten: 'C-ngoai',
    vai_tro: 'coordinator',
    token: TOKEN.ngoai_coord,
    du_an: [P_NGOAI],
  });
  await dungAgentCoToken({
    id: 'ag-tat-ca',
    ten: 'M-tat-ca',
    vai_tro: 'manager',
    token: TOKEN.tat_ca,
    vao_tat_ca_du_an: true,
  });

  TK1 = await dungTicket(P, 1, 'Việc một', { trang_thai: 'in_progress' });
  TK2 = await dungTicket(P, 2, 'Việc hai', { trang_thai: 'todo' });
  TK3 = await dungTicket(P, 3, 'Việc ba đã xong', { trang_thai: 'done' });
  TK_NGOAI = await dungTicket(P_NGOAI, 1, 'Việc dự án khác', { trang_thai: 'todo' });
  const tk_ngoai_2 = await dungTicket(P_NGOAI, 2, 'Việc khác 2', { trang_thai: 'in_progress' });
  const tk_ngoai_3 = await dungTicket(P_NGOAI, 3, 'Việc khác 3', { trang_thai: 'in_progress' });
  const tk_4 = await dungTicket(P, 4, 'Việc bốn', { trang_thai: 'in_progress' });

  // TK1 là ticket của lượt ag-wk (worker) — để có ca "thấy được mà không quyền".
  await dungLuotGiao('lg-wk', TK1, 'ag-wk', { trang_thai: 'in_progress', nguoi_giao_agent_id: 'ag-mgr' });

  /*
   * Mỗi người gọi có **đúng 1** phiên mở: một lệnh chung thành công sẽ nhích tín
   * hiệu của nó (BAT-57). Ảnh DB chứa tín hiệu này, nên ca "không nhích phiên"
   * là ca thật, không xanh oan.
   */
  await dungLuotGiao('lg-ngoai-wk', TK_NGOAI, 'ag-ngoai-wk', { trang_thai: 'in_progress' });
  await dungPhien('ph-ngoai-wk', 'lg-ngoai-wk', { tin_hieu_cuoi_luc: 1 });
  await dungLuotGiao('lg-ngoai-mgr', tk_ngoai_2, 'ag-ngoai-mgr', { trang_thai: 'in_progress' });
  await dungPhien('ph-ngoai-mgr', 'lg-ngoai-mgr', { tin_hieu_cuoi_luc: 1 });
  await dungLuotGiao('lg-ngoai-coord', tk_ngoai_3, 'ag-ngoai-coord', { trang_thai: 'in_progress' });
  await dungPhien('ph-ngoai-coord', 'lg-ngoai-coord', { tin_hieu_cuoi_luc: 1 });
  await dungLuotGiao('lg-mgr', tk_4, 'ag-mgr', { trang_thai: 'in_progress' });
  await dungPhien('ph-mgr', 'lg-mgr', { tin_hieu_cuoi_luc: 1 });

  await dungBinhLuan(CM1, TK1, 'Bình luận của W-builder', 'ag-wk');
  await dungBangChung(EV1, TK1, 'note', { nguoi_gui_agent_id: 'ag-wk', noi_dung: 'ghi chú' });
}

/** Toàn bộ phản hồi người gọi thấy: status, kiểu nội dung, thân. */
async function phanHoi(res: Response): Promise<{ status: number; kieu: string | null; than: unknown }> {
  return { status: res.status, kieu: res.headers.get('content-type'), than: await res.json() };
}

/** Ảnh **dữ liệu** mà một lệnh ghi trên ticket/bình luận/bằng chứng có thể chạm. */
async function anhDuLieu(): Promise<unknown> {
  const ticket = await env.DB.prepare(
    `SELECT id, tieu_de, trang_thai, khong_code, trung_voi_ticket_id, chu_tu_lam, xoa_luc, cap_nhat_luc
       FROM ticket WHERE workspace_id = ? ORDER BY id`,
  )
    .bind(WS)
    .all();
  const binh_luan = await env.DB.prepare(
    'SELECT id, noi_dung, da_sua, xoa_luc FROM comment WHERE workspace_id = ? ORDER BY id',
  )
    .bind(WS)
    .all();
  const bang_chung = await env.DB.prepare(
    'SELECT id, rut_luc, rut_ly_do FROM evidence WHERE workspace_id = ? ORDER BY id',
  )
    .bind(WS)
    .all();
  const dem = await env.DB.prepare(
    `SELECT (SELECT count(*) FROM ticket WHERE workspace_id = ?1) AS ticket,
            (SELECT count(*) FROM comment WHERE workspace_id = ?1) AS comment,
            (SELECT count(*) FROM evidence WHERE workspace_id = ?1) AS evidence,
            (SELECT count(*) FROM ticket_history WHERE workspace_id = ?1) AS lich_su,
            (SELECT count(*) FROM ticket_link WHERE workspace_id = ?1) AS lien_ket,
            (SELECT count(*) FROM ticket_label WHERE workspace_id = ?1) AS nhan,
            (SELECT count(*) FROM luot_giao WHERE workspace_id = ?1) AS luot,
            (SELECT count(*) FROM can_chu WHERE workspace_id = ?1) AS can_chu,
            (SELECT count(*) FROM can_chu_ticket WHERE workspace_id = ?1) AS can_chu_ticket,
            (SELECT count(*) FROM nhat_ky WHERE workspace_id = ?1) AS nhat_ky,
            (SELECT count(*) FROM trong_tam WHERE workspace_id = ?1) AS trong_tam,
            (SELECT count(*) FROM thong_bao WHERE workspace_id = ?1) AS thong_bao`,
  )
    .bind(WS)
    .first();
  const bo_dem = await env.DB.prepare(
    'SELECT pham_vi, khoa, gia_tri FROM bo_dem WHERE workspace_id = ? ORDER BY pham_vi, khoa',
  )
    .bind(WS)
    .all();
  return {
    ticket: ticket.results,
    binh_luan: binh_luan.results,
    bang_chung: bang_chung.results,
    dem,
    bo_dem: bo_dem.results,
  };
}

/** Ảnh **đầy đủ**: dữ liệu + tín hiệu phiên + "lần cuối lên tiếng" của mọi agent. */
async function anhDayDu(): Promise<unknown> {
  const phien = await env.DB.prepare(
    'SELECT id, trang_thai, tin_hieu_cuoi_luc, cap_nhat_luc FROM phien WHERE workspace_id = ? ORDER BY id',
  )
    .bind(WS)
    .all();
  const agent = await env.DB.prepare(
    'SELECT id, len_tieng_luc FROM agent WHERE workspace_id = ? ORDER BY id',
  )
    .bind(WS)
    .all();
  return { du_lieu: await anhDuLieu(), phien: phien.results, agent: agent.results };
}

interface Duong {
  ten: string;
  method: string;
  /** Đường với id thật hoặc bịa thay vào `:id` (id nằm trong thân thì bỏ qua đối số). */
  duong: (id: string) => string;
  id_that: () => string;
  id_bia: string;
  than?: () => unknown;
  /** Thân phụ thuộc id (id nằm trong thân — vd `den_ticket_id`, `ticket_cha_id`). */
  than_theo_id?: (id: string) => unknown;
  token: string;
  /** Mong đợi: 404 NOT_FOUND (mặc định), 403 FORBIDDEN, hoặc một mã lỗi khác. */
  mong?: { status: number; error: string };
  /**
   * `du_lieu`: chỉ so ảnh dữ liệu — cho ca mà **cả hai** lời gọi (thật và bịa) đều
   * qua được tới batch của cửa ghi (lỗi "vừa ghi vừa báo" — `loi_sau_ghi`), nên
   * "lần cuối lên tiếng" nhích như nhau ở cả hai ca. Mặc định `day_du`.
   */
  anh?: 'day_du' | 'du_lieu';
  /** `sửa` (BAT-58 đổi) hoặc `đúng sẵn`. */
  ghi_chu: 'sửa' | 'đúng sẵn';
}

const KHONG_TIM_THAY = { status: 404, error: 'NOT_FOUND' };
const CAM = { status: 403, error: 'FORBIDDEN' };

describe('BAT-58 — agent ngoài phạm vi: id ticket/bình luận/bằng chứng THẬT ≡ id bịa, không ghi gì', () => {
  beforeEach(nen);

  const DUONG: Duong[] = [
    { ten: 'sửa trường ticket', method: 'PATCH', duong: (id) => `/v1/ticket/${id}`, id_that: () => TK1, id_bia: 'tk-khong-co', than: () => ({ tieu_de: 'Đổi xuyên phạm vi' }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'agent bật cờ khong_code (chỉ chủ)', method: 'PATCH', duong: (id) => `/v1/ticket/${id}`, id_that: () => TK1, id_bia: 'tk-khong-co', than: () => ({ khong_code: true }), token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'đổi trạng thái', method: 'POST', duong: (id) => `/v1/ticket/${id}/trang-thai`, id_that: () => TK2, id_bia: 'tk-khong-co', than: () => ({ trang_thai: 'in_progress' }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'đổi trạng thái ticket ĐÃ XONG (luật nghiệp vụ không chen trước phạm vi)', method: 'POST', duong: (id) => `/v1/ticket/${id}/trang-thai`, id_that: () => TK3, id_bia: 'tk-khong-co', than: () => ({ trang_thai: 'todo' }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'đánh Trùng với ticket_goc_id ngoài phạm vi (thân)', method: 'POST', duong: () => `/v1/ticket/${TK2}/trang-thai`, id_that: () => TK_NGOAI, id_bia: 'tk-khong-co', than_theo_id: (id) => ({ trang_thai: 'duplicate', ticket_goc_id: id }), token: TOKEN.mgr, mong: { status: 422, error: 'INVALID_DUPLICATE_TARGET' }, anh: 'du_lieu', ghi_chu: 'sửa' },
    { ten: '"Tôi làm" (chỉ chủ)', method: 'POST', duong: (id) => `/v1/ticket/${id}/toi-lam`, id_that: () => TK2, id_bia: 'tk-khong-co', than: () => ({ bat: true }), token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'gắn nhãn', method: 'POST', duong: (id) => `/v1/ticket/${id}/nhan`, id_that: () => TK1, id_bia: 'tk-khong-co', than: () => ({ nhan: 'gap', gan: true }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'liên kết — đầu NGUỒN ngoài phạm vi (đường dẫn)', method: 'POST', duong: (id) => `/v1/ticket/${id}/lien-ket`, id_that: () => TK1, id_bia: 'tk-khong-co', than: () => ({ den_ticket_id: TK_NGOAI, loai_lien_ket: 'related' }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'liên kết — đầu ĐÍCH ngoài phạm vi (thân)', method: 'POST', duong: () => `/v1/ticket/${TK1}/lien-ket`, id_that: () => TK_NGOAI, id_bia: 'tk-khong-co', than_theo_id: (id) => ({ den_ticket_id: id, loai_lien_ket: 'blocks' }), token: TOKEN.mgr, ghi_chu: 'sửa' },
    { ten: 'liên kết dieu_phoi, vai sai (vai kiểm trước khi tra)', method: 'POST', duong: (id) => `/v1/ticket/${id}/lien-ket`, id_that: () => TK1, id_bia: 'tk-khong-co', than: () => ({ den_ticket_id: TK2, loai_lien_ket: 'dieu_phoi' }), token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'liên kết dieu_phoi, coordinator ngoài dự án', method: 'POST', duong: (id) => `/v1/ticket/${id}/lien-ket`, id_that: () => TK1, id_bia: 'tk-khong-co', than: () => ({ den_ticket_id: TK2, loai_lien_ket: 'dieu_phoi' }), token: TOKEN.ngoai_coord, ghi_chu: 'sửa' },
    { ten: 'xoá ticket (chỉ chủ)', method: 'POST', duong: (id) => `/v1/ticket/${id}/xoa`, id_that: () => TK1, id_bia: 'tk-khong-co', token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'khôi phục ticket (chỉ chủ)', method: 'POST', duong: (id) => `/v1/ticket/${id}/khoi-phuc`, id_that: () => TK1, id_bia: 'tk-khong-co', token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'tạo ticket con với ticket_cha_id ngoài phạm vi (thân)', method: 'POST', duong: () => '/v1/ticket', id_that: () => TK1, id_bia: 'tk-khong-co', than_theo_id: (id) => ({ project_id: P_NGOAI, tieu_de: 'Con', ticket_cha_id: id }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'giao việc (assign)', method: 'POST', duong: (id) => `/v1/ticket/${id}/luot-giao`, id_that: () => TK2, id_bia: 'tk-khong-co', than: () => ({ nguoi_nhan_agent_id: 'ag-ngoai-wk' }), token: TOKEN.ngoai_mgr, ghi_chu: 'đúng sẵn' },
    { ten: 'thêm bình luận', method: 'POST', duong: (id) => `/v1/ticket/${id}/binh-luan`, id_that: () => TK1, id_bia: 'tk-khong-co', than: () => ({ noi_dung: 'xuyên phạm vi' }), token: TOKEN.ngoai_wk, ghi_chu: 'sửa' },
    { ten: 'sửa bình luận (id bình luận)', method: 'PATCH', duong: (id) => `/v1/binh-luan/${id}`, id_that: () => CM1, id_bia: 'cm-khong-co', than: () => ({ noi_dung: 'sửa hộ' }), token: TOKEN.ngoai_wk, ghi_chu: 'sửa' },
    { ten: 'xoá bình luận (agent không bao giờ)', method: 'POST', duong: (id) => `/v1/binh-luan/${id}/xoa`, id_that: () => CM1, id_bia: 'cm-khong-co', token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'gửi bằng chứng', method: 'POST', duong: (id) => `/v1/ticket/${id}/bang-chung`, id_that: () => TK1, id_bia: 'tk-khong-co', than: () => ({ loai_bang_chung: 'note', noi_dung: 'x' }), token: TOKEN.ngoai_wk, ghi_chu: 'sửa' },
    { ten: 'rút bằng chứng (id bằng chứng)', method: 'POST', duong: (id) => `/v1/bang-chung/${id}/rut`, id_that: () => EV1, id_bia: 'ev-khong-co', than: () => ({ ly_do: 'rút hộ' }), token: TOKEN.ngoai_wk, ghi_chu: 'sửa' },
    { ten: 'tạo mục Cần Chủ với ticket_lien_quan (thân)', method: 'POST', duong: () => '/v1/can-chu', id_that: () => TK1, id_bia: 'tk-khong-co', than_theo_id: (id) => ({ tieu_de: 'Hỏi chủ', muc: 'urgent', loai: 'fyi', ticket_lien_quan: [id] }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'ghi Nhật ký với căn cứ ticket (thân)', method: 'POST', duong: () => '/v1/nhat-ky', id_that: () => TK1, id_bia: 'tk-khong-co', than_theo_id: (id) => ({ quyet_dinh: 'Q', vi_sao: 'V', can_cu: [{ loai: 'ticket', id }] }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'ghi 3 việc trọng tâm (thân)', method: 'POST', duong: () => '/v1/trong-tam', id_that: () => TK1, id_bia: 'tk-khong-co', than_theo_id: (id) => ({ muc: [{ ticket_id: id }] }), token: TOKEN.ngoai_coord, ghi_chu: 'sửa' },
  ];

  for (const d of DUONG) {
    it(`${d.method} ${d.ten} [${d.ghi_chu}]: id thật ≡ id bịa (status + content-type + thân), DB không đổi`, async () => {
      const anh = d.anh === 'du_lieu' ? anhDuLieu : anhDayDu;
      const truoc = await anh();
      const goi = async (id: string): Promise<Response> => {
        const than = d.than_theo_id === undefined ? d.than?.() : d.than_theo_id(id);
        return goiApi(d.duong(id), d.token, {
          method: d.method,
          ...(than === undefined ? {} : { than }),
        });
      };

      const that = await phanHoi(await goi(d.id_that()));
      const bia = await phanHoi(await goi(d.id_bia));

      expect(that).toEqual(bia);
      const mong = d.mong ?? KHONG_TIM_THAY;
      expect(that.status, JSON.stringify(that.than)).toBe(mong.status);
      expect(that.than).toMatchObject({ error: mong.error });
      expect(await anh()).toEqual(truoc);
    });
  }

  it('lệnh `doi_tieu_de` (không có route HTTP, đi thẳng cửa ghi): ticket ngoài phạm vi ≡ id bịa', async () => {
    const ai = aiAgent('manager', { agent_id: 'ag-ngoai-mgr', du_an_duoc_vao: [P_NGOAI] });
    const loi = async (ticket_id: string): Promise<{ ma: string; message: string }> => {
      try {
        await goiLenh(env, { loai: 'doi_tieu_de', workspace_id: WS, ai, ticket_id, tieu_de: 'X' });
      } catch (e) {
        if (BatonError.la(e)) return { ma: e.ma, message: e.message };
        throw e;
      }
      throw new Error('lệnh phải bị từ chối');
    };
    const truoc = await anhDuLieu();
    const that = await loi(TK1);
    expect(that).toEqual(await loi('tk-khong-co'));
    expect(that.ma).toBe('NOT_FOUND');
    expect(await anhDuLieu()).toEqual(truoc);
  });

  it('liên kết: cả hai đầu ngoài phạm vi, đích bịa ≡ nguồn bịa (không phép kiểm nào chen giữa hai lần tra)', async () => {
    const a = await phanHoi(
      await goiApi(`/v1/ticket/${TK1}/lien-ket`, TOKEN.ngoai_mgr, {
        method: 'POST',
        than: { den_ticket_id: 'tk-khong-co', loai_lien_ket: 'related' },
      }),
    );
    const b = await phanHoi(
      await goiApi('/v1/ticket/tk-khong-co/lien-ket', TOKEN.ngoai_mgr, {
        method: 'POST',
        than: { den_ticket_id: TK2, loai_lien_ket: 'related' },
      }),
    );
    expect(a).toEqual(b);
    expect(a.status).toBe(404);
  });
});

/* ================================================================== *
 * Thấy được mà không có quyền ⇒ vẫn 403 (không đổi)
 * ================================================================== */

describe('BAT-58 — người gọi THẤY được ticket/bình luận/bằng chứng nhưng không có quyền: vẫn 403', () => {
  beforeEach(nen);

  async function forbidden(res: Response): Promise<void> {
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  }

  it('sửa ticket: worker cùng dự án sửa ticket không phải lượt mình → 403; manager bật khong_code → 403', async () => {
    await forbidden(
      await goiApi(`/v1/ticket/${TK1}`, TOKEN.wk2, { method: 'PATCH', than: { tieu_de: 'Sửa hộ' } }),
    );
    await forbidden(
      await goiApi(`/v1/ticket/${TK1}`, TOKEN.mgr, { method: 'PATCH', than: { khong_code: true } }),
    );
  });

  it('trạng thái + nhãn: worker cùng dự án trên ticket không phải lượt mình → 403', async () => {
    await forbidden(
      await goiApi(`/v1/ticket/${TK1}/trang-thai`, TOKEN.wk2, {
        method: 'POST',
        than: { trang_thai: 'verifying' },
      }),
    );
    await forbidden(
      await goiApi(`/v1/ticket/${TK1}/nhan`, TOKEN.wk2, { method: 'POST', than: { nhan: 'x', gan: true } }),
    );
  });

  it('liên kết: worker cùng dự án nối related → 403; manager nối dieu_phoi → 403', async () => {
    await forbidden(
      await goiApi(`/v1/ticket/${TK1}/lien-ket`, TOKEN.wk2, {
        method: 'POST',
        than: { den_ticket_id: TK2, loai_lien_ket: 'related' },
      }),
    );
    await forbidden(
      await goiApi(`/v1/ticket/${TK1}/lien-ket`, TOKEN.mgr, {
        method: 'POST',
        than: { den_ticket_id: TK2, loai_lien_ket: 'dieu_phoi' },
      }),
    );
  });

  it('ticket cha: worker cùng dự án tạo con của ticket không phải lượt mình → 403', async () => {
    await forbidden(
      await goiApi('/v1/ticket', TOKEN.wk2, {
        method: 'POST',
        than: { project_id: P, tieu_de: 'Con', ticket_cha_id: TK1 },
      }),
    );
  });

  it('bình luận: worker cùng dự án sửa bình luận của người khác → 403; manager xoá bình luận → 403', async () => {
    await forbidden(
      await goiApi(`/v1/binh-luan/${CM1}`, TOKEN.wk2, { method: 'PATCH', than: { noi_dung: 'sửa hộ' } }),
    );
    await forbidden(await goiApi(`/v1/binh-luan/${CM1}/xoa`, TOKEN.mgr, { method: 'POST' }));
  });

  it('bằng chứng: worker gửi `review` → 403; worker cùng dự án rút bằng chứng của người khác → 403', async () => {
    await forbidden(
      await goiApi(`/v1/ticket/${TK2}/bang-chung`, TOKEN.wk2, {
        method: 'POST',
        than: { loai_bang_chung: 'review', ket_luan: 'pass' },
      }),
    );
    await forbidden(
      await goiApi(`/v1/bang-chung/${EV1}/rut`, TOKEN.wk2, { method: 'POST', than: { ly_do: 'x' } }),
    );
  });

  it('Cần Chủ / Nhật ký / trọng tâm: vai không được ghi (ticket thấy được) → 403', async () => {
    await forbidden(
      await goiApi('/v1/can-chu', TOKEN.wk, {
        method: 'POST',
        than: { tieu_de: 'Hỏi', muc: 'today', loai: 'fyi', ticket_lien_quan: [TK1] },
      }),
    );
    await forbidden(
      await goiApi('/v1/nhat-ky', TOKEN.wk, {
        method: 'POST',
        than: { quyet_dinh: 'Q', vi_sao: 'V', can_cu: [{ loai: 'ticket', id: TK1 }] },
      }),
    );
    await forbidden(
      await goiApi('/v1/trong-tam', TOKEN.mgr, { method: 'POST', than: { muc: [{ ticket_id: TK1 }] } }),
    );
  });
});

/* ================================================================== *
 * Người trong phạm vi: không đổi hành vi
 * ================================================================== */

describe('BAT-58 — người thấy được làm như cũ (chủ, "tất cả dự án", agent vào cả hai dự án, tác giả bị gỡ)', () => {
  beforeEach(nen);

  it('agent "tất cả dự án" sửa ticket bất kỳ và nối liên kết khác dự án → 200', async () => {
    const sua = await goiApi(`/v1/ticket/${TK1}`, TOKEN.tat_ca, { method: 'PATCH', than: { tieu_de: 'Đổi' } });
    expect(sua.status, JSON.stringify(await sua.clone().json())).toBe(200);
    const noi = await goiApi(`/v1/ticket/${TK1}/lien-ket`, TOKEN.tat_ca, {
      method: 'POST',
      than: { den_ticket_id: TK_NGOAI, loai_lien_ket: 'related' },
    });
    expect(noi.status, JSON.stringify(await noi.clone().json())).toBe(200);
  });

  it('agent vào CẢ HAI dự án: nối khác dự án và đánh Trùng với ticket gốc dự án kia → 200 ("được khác dự án" giữ nguyên)', async () => {
    const noi = await goiApi(`/v1/ticket/${TK2}/lien-ket`, TOKEN.hai, {
      method: 'POST',
      than: { den_ticket_id: TK_NGOAI, loai_lien_ket: 'related' },
    });
    expect(noi.status, JSON.stringify(await noi.clone().json())).toBe(200);
    const trung = await goiApi(`/v1/ticket/${TK2}/trang-thai`, TOKEN.hai, {
      method: 'POST',
      than: { trang_thai: 'duplicate', ticket_goc_id: TK_NGOAI },
    });
    expect(trung.status, JSON.stringify(await trung.clone().json())).toBe(200);
    expect(
      await env.DB.prepare('SELECT trung_voi_ticket_id FROM ticket WHERE id = ?').bind(TK2).first('trung_voi_ticket_id'),
    ).toBe(TK_NGOAI);
  });

  it('chủ: trọng tâm và Cần Chủ với ticket bất kỳ → 201', async () => {
    const tt = await goiApi('/v1/trong-tam', TOKEN_CHU, {
      method: 'POST',
      than: { muc: [{ ticket_id: TK_NGOAI }, { ticket_id: TK1 }] },
    });
    expect(tt.status, JSON.stringify(await tt.clone().json())).toBe(201);
    const ct = await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: { tieu_de: 'Hỏi', muc: 'today', loai: 'fyi', ticket_lien_quan: [TK_NGOAI, TK1] },
    });
    expect(ct.status, JSON.stringify(await ct.clone().json())).toBe(201);
  });

  it('người GỬI bằng chứng bị gỡ khỏi dự án vẫn rút được bằng chứng của chính mình (d.222 theo danh tính, như trước)', async () => {
    await env.DB.prepare('DELETE FROM agent_project WHERE agent_id = ?').bind('ag-wk').run();
    const res = await goiApi(`/v1/bang-chung/${EV1}/rut`, TOKEN.wk, { method: 'POST', than: { ly_do: 'sai' } });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
  });

  it('TÁC GIẢ bình luận bị gỡ khỏi dự án: sửa bình luận của mình vẫn 403 như trước (không thành 404)', async () => {
    await env.DB.prepare('DELETE FROM agent_project WHERE agent_id = ?').bind('ag-wk').run();
    const res = await goiApi(`/v1/binh-luan/${CM1}`, TOKEN.wk, { method: 'PATCH', than: { noi_dung: 'sửa' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });
});
