/**
 * **Sổ đăng ký lệnh ghi.** Chỉ lắp ghép: khung ở `lenh-khung.ts`, handler ở
 * `lenh-du-an.ts`, `lenh-agent.ts`, `lenh-ticket.ts`.
 *
 * Thêm một lệnh ghi mới = thêm một dòng trong `BanDoLenh` và một dòng trong
 * `SO_DANG_KY_HANDLER`. TypeScript bắt lỗi nếu thiếu một trong hai.
 */

import {
  handlerSuaCaiDatWorkspace,
  handlerSuaDuAn,
  handlerTaoDuAn,
  type KetQuaSuaCaiDatWorkspace,
  type KetQuaSuaDuAn,
  type KetQuaTaoDuAn,
  type LenhSuaCaiDatWorkspace,
  type LenhSuaDuAn,
  type LenhTaoDuAn,
} from './lenh-du-an.js';
import {
  handlerDatQuyen,
  handlerSuaAgent,
  handlerTaoAgent,
  handlerTaoLaiToken,
  handlerThuHoiToken,
  type KetQuaTaoAgent,
  type KetQuaTaoLaiToken,
  type LenhDatQuyen,
  type LenhSuaAgent,
  type LenhTaoAgent,
  type LenhTaoLaiToken,
  type LenhThuHoiToken,
} from './lenh-agent.js';
import {
  handlerCapSoCanChu,
  handlerCapSoTicket,
  handlerDatNhan,
  handlerDoiTieuDe,
  handlerKhoiPhucTicket,
  handlerNoiTicket,
  handlerSuaTicket,
  handlerTaoTicket,
  handlerXoaTicket,
  type KetQuaSuaTicket,
  type KetQuaTaoTicket,
  type LenhCapSoCanChu,
  type LenhCapSoTicket,
  type LenhDatNhan,
  type LenhDoiTieuDe,
  type LenhKhoiPhucTicket,
  type LenhNoiTicket,
  type LenhSuaTicket,
  type LenhTaoTicket,
  type LenhXoaTicket,
} from './lenh-ticket.js';
import {
  handlerChuTuLam,
  handlerDoiTrangThai,
  type KetQuaDoiTrangThai,
  type LenhChuTuLam,
  type LenhDoiTrangThai,
} from './lenh-trang-thai.js';
import {
  handlerSuaBinhLuan,
  handlerThemBinhLuan,
  handlerXoaBinhLuan,
  type KetQuaThemBinhLuan,
  type LenhSuaBinhLuan,
  type LenhThemBinhLuan,
  type LenhXoaBinhLuan,
} from './lenh-binh-luan.js';
import {
  handlerNhanLuotGiao,
  handlerTaoLuotGiao,
  type KetQuaNhanLuotGiao,
  type KetQuaTaoLuotGiao,
  type LenhNhanLuotGiao,
  type LenhTaoLuotGiao,
} from './lenh-luot-giao.js';
import {
  handlerHuyLuot,
  handlerNghiemThu,
  handlerNopBaoCao,
  handlerTaoTicketViecPhatSinh,
  type KetQuaHuyLuot,
  type KetQuaLenhNghiemThu,
  type KetQuaNopBaoCao,
  type KetQuaTaoTicketViecPhatSinh,
  type LenhHuyLuot,
  type LenhNghiemThu,
  type LenhNopBaoCao,
  type LenhTaoTicketViecPhatSinh,
} from './lenh-nop-nghiem-thu.js';
import {
  handlerDungPhien,
  handlerHeartbeat,
  type KetQuaDungPhien,
  type KetQuaHeartbeat,
  type LenhDungPhien,
  type LenhHeartbeat,
} from './lenh-phien.js';
import {
  handlerDatKeHoach,
  handlerGuiHoatDong,
  handlerTraLoiCauHoi,
  type KetQuaDatKeHoach,
  type KetQuaGuiHoatDong,
  type KetQuaTraLoiCauHoi,
  type LenhDatKeHoach,
  type LenhGuiHoatDong,
  type LenhTraLoiCauHoi,
} from './lenh-hoat-dong.js';
import {
  handlerGuiBangChung,
  handlerRutBangChung,
  type KetQuaGuiBangChung,
  type KetQuaRutBangChung,
  type LenhGuiBangChung,
  type LenhRutBangChung,
} from './lenh-bang-chung.js';
import {
  handlerTaoCanChu,
  type KetQuaTaoCanChu,
  type LenhTaoCanChu,
} from './lenh-can-chu.js';
import {
  handlerBoQuaCanChu,
  handlerMoLaiCanChu,
  handlerXuLyCanChu,
  type KetQuaBoQuaCanChu,
  type KetQuaMoLaiCanChu,
  type KetQuaXuLyCanChu,
  type LenhBoQuaCanChu,
  type LenhMoLaiCanChu,
  type LenhXuLyCanChu,
} from './lenh-xu-ly-can-chu.js';
import {
  handlerGhiNhatKy,
  type KetQuaGhiNhatKy,
  type LenhGhiNhatKy,
} from './lenh-nhat-ky.js';
import {
  handlerSuaHoSoDuAn,
  handlerSuaLuatChung,
  handlerThemLoiDaGap,
  type KetQuaSuaHoSoDuAn,
  type KetQuaThemLoiDaGap,
  type LenhSuaHoSoDuAn,
  type LenhSuaLuatChung,
  type LenhThemLoiDaGap,
} from './lenh-ho-so.js';
import {
  handlerGhiTrongTam,
  type KetQuaGhiTrongTam,
  type LenhGhiTrongTam,
} from './lenh-bao-cao.js';
import {
  handlerDatCongTacThongBao,
  type KetQuaDatCongTacThongBao,
  type LenhDatCongTacThongBao,
} from './cai-dat-thong-bao.js';
import type { BoiCanhLenh, KetQuaHandler } from './lenh-khung.js';

export * from './lenh-khung.js';

/** Bản đồ loại lệnh → kiểu lệnh và kiểu kết quả. */
export interface BanDoLenh {
  /* Dự án — SPEC mục 2 */
  tao_du_an: { lenh: LenhTaoDuAn; ket_qua: KetQuaTaoDuAn };
  sua_du_an: { lenh: LenhSuaDuAn; ket_qua: KetQuaSuaDuAn };

  /* Cài đặt workspace — SPEC 20.1 (giới hạn WIP, chỉ chủ). */
  sua_cai_dat_workspace: { lenh: LenhSuaCaiDatWorkspace; ket_qua: KetQuaSuaCaiDatWorkspace };

  /* Hồ sơ dự án và Luật chung — SPEC mục 9 */
  sua_ho_so_du_an: { lenh: LenhSuaHoSoDuAn; ket_qua: KetQuaSuaHoSoDuAn };
  them_loi_da_gap: { lenh: LenhThemLoiDaGap; ket_qua: KetQuaThemLoiDaGap };
  sua_luat_chung: {
    lenh: LenhSuaLuatChung;
    ket_qua: { workspace_id: string; da_doi: string[] };
  };

  /* Agent, token, quyền — SPEC mục 3, 15 */
  tao_agent: { lenh: LenhTaoAgent; ket_qua: KetQuaTaoAgent };
  sua_agent: { lenh: LenhSuaAgent; ket_qua: { id: string; da_doi: string[] } };
  tao_lai_token: { lenh: LenhTaoLaiToken; ket_qua: KetQuaTaoLaiToken };
  thu_hoi_token: { lenh: LenhThuHoiToken; ket_qua: { agent_id: string; da_thu_hoi: true } };
  dat_quyen: {
    lenh: LenhDatQuyen;
    ket_qua: { agent_id: string; viec: string; cho_phep: boolean | null };
  };

  /* Ticket và bộ đếm — SPEC mục 1, 4, 8 */
  tao_ticket: { lenh: LenhTaoTicket; ket_qua: KetQuaTaoTicket };
  doi_tieu_de: { lenh: LenhDoiTieuDe; ket_qua: { tieu_de: string } };
  sua_ticket: { lenh: LenhSuaTicket; ket_qua: KetQuaSuaTicket };
  dat_nhan: { lenh: LenhDatNhan; ket_qua: { nhan: string; gan: boolean } };
  noi_ticket: {
    lenh: LenhNoiTicket;
    ket_qua: { tu_ticket_id: string; den_ticket_id: string; loai_lien_ket: string };
  };
  xoa_ticket: { lenh: LenhXoaTicket; ket_qua: { id: string; xoa_luc: number } };
  khoi_phuc_ticket: { lenh: LenhKhoiPhucTicket; ket_qua: { id: string } };
  cap_so_ticket: { lenh: LenhCapSoTicket; ket_qua: { so: number } };
  cap_so_can_chu: { lenh: LenhCapSoCanChu; ket_qua: { so: number } };

  /* Trạng thái ticket — SPEC mục 4, 19.1, 19.2, 19.4, 19.10, 19.11 */
  doi_trang_thai: { lenh: LenhDoiTrangThai; ket_qua: KetQuaDoiTrangThai };
  chu_tu_lam: {
    lenh: LenhChuTuLam;
    ket_qua: { id: string; trang_thai: string; chu_tu_lam: boolean };
  };

  /* Lượt giao — SPEC mục 5, 19.1, 19.3, 19.5 */
  tao_luot_giao: { lenh: LenhTaoLuotGiao; ket_qua: KetQuaTaoLuotGiao };
  nhan_luot_giao: { lenh: LenhNhanLuotGiao; ket_qua: KetQuaNhanLuotGiao };

  /* Nộp, nghiệm thu, huỷ, việc phát sinh — SPEC mục 5, 19.2, 19.3, 19.5, 19.11 */
  nop_bao_cao: { lenh: LenhNopBaoCao; ket_qua: KetQuaNopBaoCao };
  nghiem_thu: { lenh: LenhNghiemThu; ket_qua: KetQuaLenhNghiemThu };
  huy_luot: { lenh: LenhHuyLuot; ket_qua: KetQuaHuyLuot };
  tao_ticket_viec_phat_sinh: {
    lenh: LenhTaoTicketViecPhatSinh;
    ket_qua: KetQuaTaoTicketViecPhatSinh;
  };

  /* Phiên và nhịp tim — SPEC mục 6, 19.6 */
  heartbeat: { lenh: LenhHeartbeat; ket_qua: KetQuaHeartbeat };
  dung_phien: { lenh: LenhDungPhien; ket_qua: KetQuaDungPhien };

  /* Dòng hoạt động, kế hoạch, trả lời — SPEC mục 6 d.190, d.191, 19.6, 19.12 câu 2.
     Cảnh báo d.196 **không** có lệnh nào ở đây: 19.12 câu 46 chốt rằng nó là một
     Cron Trigger mỗi 5 phút, và cửa ghi nhận nó qua một đường riêng của DO
     (`WorkspaceGate.ghiMocCanhBao`), không qua `BanDoLenh`. */
  gui_hoat_dong: { lenh: LenhGuiHoatDong; ket_qua: KetQuaGuiHoatDong };
  dat_ke_hoach: { lenh: LenhDatKeHoach; ket_qua: KetQuaDatKeHoach };
  tra_loi_cau_hoi: { lenh: LenhTraLoiCauHoi; ket_qua: KetQuaTraLoiCauHoi };

  /* Bằng chứng — SPEC mục 7 (d.204–211, d.219, d.222), 19.3 */
  gui_bang_chung: { lenh: LenhGuiBangChung; ket_qua: KetQuaGuiBangChung };
  rut_bang_chung: { lenh: LenhRutBangChung; ket_qua: KetQuaRutBangChung };

  /* Cần Chủ — SPEC mục 8, 19.8, 19.9, 19.10, 19.11, 19.12 câu 4, 18.
     Ba lệnh xử lý là **đúng ba nhánh** của d.244 + d.246, và cả ba đi qua ô
     "Quyết mục Cần Chủ" — hàng **không bao giờ** của bảng quyền mục 3, nên
     không vai agent nào gọi được. */
  tao_can_chu: { lenh: LenhTaoCanChu; ket_qua: KetQuaTaoCanChu };
  xu_ly_can_chu: { lenh: LenhXuLyCanChu; ket_qua: KetQuaXuLyCanChu };
  bo_qua_can_chu: { lenh: LenhBoQuaCanChu; ket_qua: KetQuaBoQuaCanChu };
  mo_lai_can_chu: { lenh: LenhMoLaiCanChu; ket_qua: KetQuaMoLaiCanChu };

  /* Nhật ký quyết định — SPEC mục 10 (d.305–312), 19.12 câu 4.
     **Chỉ thêm** (d.309): không có `sua_nhat_ky` và không có `xoa_nhat_ky` ở
     đây, và sẽ không bao giờ có — hàng rào thật là trigger của migration 0014. */
  ghi_nhat_ky: { lenh: LenhGhiNhatKy; ket_qua: KetQuaGhiNhatKy };

  /* Báo cáo — SPEC mục 11 (d.322–336).
     **Chỉ một** lệnh ghi ở đây: ghi 3 việc trọng tâm (d.324). Việc *sinh* một báo
     cáo **không** là một loại lệnh của `BanDoLenh` vì **không ai gõ nó** — người
     gọi duy nhất là Cron 07:30/20:00 qua binding DO, cùng hình với
     `WorkspaceGate.ghiMocCanhBao` và `nhacCanChuDo`. Xem `WorkspaceGate.sinhBaoCao`. */
  ghi_trong_tam: { lenh: LenhGhiTrongTam; ket_qua: KetQuaGhiTrongTam };

  /* Cài đặt thông báo — SPEC mục 12 d.348 (BAT-16). Chỉ chủ; tin bảo mật không tắt được. */
  dat_cong_tac_thong_bao: { lenh: LenhDatCongTacThongBao; ket_qua: KetQuaDatCongTacThongBao };

  /* Bình luận — SPEC mục 4 */
  them_binh_luan: { lenh: LenhThemBinhLuan; ket_qua: KetQuaThemBinhLuan };
  sua_binh_luan: { lenh: LenhSuaBinhLuan; ket_qua: { id: string; da_sua: true } };
  xoa_binh_luan: { lenh: LenhXoaBinhLuan; ket_qua: { id: string; xoa_luc: number } };
}

export type LoaiLenh = keyof BanDoLenh;
export type Lenh = BanDoLenh[LoaiLenh]['lenh'];
export type KetQuaCuaLenh<L extends Lenh> = BanDoLenh[L['loai']]['ket_qua'];

export type Handler<K extends LoaiLenh> = (
  lenh: BanDoLenh[K]['lenh'],
  boi_canh: BoiCanhLenh,
) => Promise<KetQuaHandler<BanDoLenh[K]['ket_qua']>>;

/** Sổ đăng ký handler. Thêm lệnh mới = thêm một dòng ở đây. */
export const SO_DANG_KY_HANDLER: { [K in LoaiLenh]: Handler<K> } = {
  tao_du_an: handlerTaoDuAn,
  sua_du_an: handlerSuaDuAn,
  sua_cai_dat_workspace: handlerSuaCaiDatWorkspace,

  sua_ho_so_du_an: handlerSuaHoSoDuAn,
  them_loi_da_gap: handlerThemLoiDaGap,
  sua_luat_chung: handlerSuaLuatChung,

  tao_agent: handlerTaoAgent,
  sua_agent: handlerSuaAgent,
  tao_lai_token: handlerTaoLaiToken,
  thu_hoi_token: handlerThuHoiToken,
  dat_quyen: handlerDatQuyen,

  tao_ticket: handlerTaoTicket,
  doi_tieu_de: handlerDoiTieuDe,
  sua_ticket: handlerSuaTicket,
  dat_nhan: handlerDatNhan,
  noi_ticket: handlerNoiTicket,
  xoa_ticket: handlerXoaTicket,
  khoi_phuc_ticket: handlerKhoiPhucTicket,
  cap_so_ticket: handlerCapSoTicket,
  cap_so_can_chu: handlerCapSoCanChu,

  doi_trang_thai: handlerDoiTrangThai,
  chu_tu_lam: handlerChuTuLam,

  tao_luot_giao: handlerTaoLuotGiao,
  nhan_luot_giao: handlerNhanLuotGiao,
  nop_bao_cao: handlerNopBaoCao,
  nghiem_thu: handlerNghiemThu,
  huy_luot: handlerHuyLuot,
  tao_ticket_viec_phat_sinh: handlerTaoTicketViecPhatSinh,

  heartbeat: handlerHeartbeat,
  dung_phien: handlerDungPhien,

  gui_hoat_dong: handlerGuiHoatDong,
  dat_ke_hoach: handlerDatKeHoach,
  tra_loi_cau_hoi: handlerTraLoiCauHoi,

  gui_bang_chung: handlerGuiBangChung,
  rut_bang_chung: handlerRutBangChung,

  tao_can_chu: handlerTaoCanChu,
  xu_ly_can_chu: handlerXuLyCanChu,
  bo_qua_can_chu: handlerBoQuaCanChu,
  mo_lai_can_chu: handlerMoLaiCanChu,

  ghi_nhat_ky: handlerGhiNhatKy,

  ghi_trong_tam: handlerGhiTrongTam,

  dat_cong_tac_thong_bao: handlerDatCongTacThongBao,

  them_binh_luan: handlerThemBinhLuan,
  sua_binh_luan: handlerSuaBinhLuan,
  xoa_binh_luan: handlerXoaBinhLuan,
};

export function laLoaiLenh(loai: unknown): loai is LoaiLenh {
  return typeof loai === 'string' && Object.prototype.hasOwnProperty.call(SO_DANG_KY_HANDLER, loai);
}
