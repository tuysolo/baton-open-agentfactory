/**
 * Hình dữ liệu **CLI đọc** từ API — chỉ những trường CLI thật sự in ra.
 *
 * Vì sao không nhập kiểu từ `@baton/api`: `@baton/api` đã phụ thuộc
 * `@baton/client`, nên `@baton/cli` nhập lại nó là một vòng phụ thuộc giữa các
 * package; và CLI là **client** của một API HTTP — nó chỉ được dựa vào *hợp đồng
 * JSON*, không vào kiểu nội bộ của server. Khai hẹp (chỉ trường được in) là chủ ý:
 * trường server thêm vào về sau đi nguyên vào `--json` mà không cần sửa file này.
 *
 * `--json` **in nguyên thân phản hồi của API**, không in object dựng lại từ các
 * kiểu dưới đây — nên một trường mới của server không bao giờ bị CLI cắt mất.
 */

import type { NguonBaoCao, NguonReview, NguonXacMinhMerged } from '@baton/shared';

export interface TacGiaRa {
  loai: string;
  agentId?: string | null;
}

export interface TrangRa<T> {
  items: T[];
  cursor_sau: string | null;
}

export interface WhoamiRa {
  loai: string;
  workspace_id: string;
  agent_id?: string;
  vai_tro?: string;
  nhan_vai_tro?: string;
  vao_tat_ca_du_an?: boolean;
  du_an_duoc_vao?: string[];
  du_an_minh_quan_ly?: string[];
}

/**
 * Một hàng của `GET /v1/agent` — chỉ hai trường `baton assign` dùng để đổi
 * **tên hoặc ID** người gõ thành id (BAT-47, T-55 = A).
 */
export interface AgentDongRa {
  id: string;
  ten: string;
}

export interface DuAnRa {
  id: string;
  ma: string;
  ten: string;
  mo_ta: string | null;
  trang_thai: string;
  nhan_trang_thai: string;
  nhom: string | null;
  quan_ly_agent_id: string | null;
  khong_code: boolean;
  bat_buoc_review: boolean;
  /** SPEC 20.1 — ưu tiên dự án 1–5 (5 = quan trọng nhất). */
  uu_tien: number;
  /** SPEC 20.1 — dự án "đang đẩy mạnh". */
  dang_day: boolean;
  /** SPEC 20.1 — việc duy trì dài hạn. */
  duy_tri: boolean;
  /** SPEC 20.1 — tên ngắn; `null` = dùng tên đầy đủ. */
  ten_ngan: string | null;
}

/** Đồng hồ WIP "Đang đẩy n/<giới hạn>" — SPEC 20.1, 20.2. */
export interface WipRa {
  dang_day: number;
  gioi_han: number;
  vuot: boolean;
}

/** Thân `PATCH /v1/du-an/:id` — `baton project set` (SPEC 20.1). */
export interface SuaDuAnRa {
  id: string;
  da_doi: string[];
  /** Có khi lệnh mang `dang_day`/`duy_tri`. */
  wip?: WipRa;
}

/** Thân `PATCH /v1/ticket/:id` — `baton ticket set` (SPEC 20.1). */
export interface SuaTicketRa {
  id: string;
  da_doi: string[];
}

/**
 * `GET /v1/du-an/:id/ho-so` — **hồ sơ dự án** của SPEC mục 9 d.294–303.
 *
 * Hình gõ lại theo `packages/api/src/doc-ho-so.ts` (`HoSoRa`), cùng kỷ luật với
 * các hình khác của file này.
 */
export interface LoiDaGapRa {
  id: string;
  ngay: string;
  loi: string;
  cach_tranh: string | null;
  ghi_boi_loai: string;
  ghi_boi_agent_id: string | null;
  tao_luc: number;
}

export interface HoSoRa {
  project_id: string;
  bay_gio: number;
  /** `0` = **chưa soạn hồ sơ nào** (khác "hồ sơ rỗng"). */
  phien_ban: number;
  cap_nhat_luc: number | null;
  la_gi: string | null;
  thu_muc: string | null;
  repo_chu_so_huu: string | null;
  repo_ten: string | null;
  repo_nhanh_mac_dinh: string | null;
  stack: string | null;
  doc_truoc: string | null;
  cach_deploy: string | null;
  danh_sach_cam: string | null;
  khong_code: boolean;
  bat_buoc_review: boolean;
  du_an: {
    id: string;
    ma: string;
    ten: string;
    quan_ly_agent_id: string | null;
    quan_ly_agent_ten: string | null;
  };
  loi_da_gap: LoiDaGapRa[];
  lich_su_ban: { id: string; phien_ban: number; luc: number }[];
}

/** `GET /v1/luat-chung` — trang "Luật chung" của workspace, mục 9 d.301. */
export interface LuatChungRa {
  danh_sach_cam: string | null;
  checklist: string | null;
  cap_nhat_luc: number | null;
}

/**
 * Thân `GET /v1/xuat` — `BanXuat` của `packages/api/src/xuat-du-lieu.ts` (SPEC mục
 * 15 d.429, BAT-8). CLI không đọc từng dòng; nó ghi nguyên thân ra file và đếm dòng.
 */
export interface BanXuatRa {
  schema_version: number;
  xuat_luc: string;
  xuat_luc_ms: number;
  workspace_id: string;
  migration_cuoi: string;
  bang: Record<string, unknown[]>;
}

export interface BinhLuanRa {
  id: string;
  tac_gia: TacGiaRa | null;
  noi_dung: string;
  da_sua: boolean;
  tao_luc: number;
}

export interface LienKetRa {
  loai: string;
  nhan_loai: string;
  ma: string;
  tieu_de: string;
  nguoc: boolean;
}

export interface TicketDongRa {
  id: string;
  ma: string;
  so: number;
  project_id: string;
  tieu_de: string;
  trang_thai: string;
  nhan_trang_thai: string;
  uu_tien: string;
  nhan_uu_tien: string;
  nguoi_dang_cam: TacGiaRa | null;
  /** SPEC 20.1 — số thứ tự khối việc lớn; `null` = không phải khối lớn. */
  khoi_lon?: number | null;
  /** SPEC 20.1 — vị trí trên đồi 0–100. */
  doi?: number | null;
}

export interface TicketRa extends TicketDongRa {
  mo_ta: string | null;
  /**
   * Đường đọc **một** ticket cố ý trả cả ticket đã xoá mềm (mục 4, khôi phục 30
   * ngày); trường này nói rõ. `baton assign` đọc nó để biết `NOT_FOUND` của cửa
   * ghi là vì ticket hay vì người nhận (BAT-47).
   */
  xoa_luc?: number | null;
  nhan: string[];
  lien_ket: LienKetRa[];
  /** 10 bình luận cuối — SPEC mục 13 d.372. */
  binh_luan_cuoi: BinhLuanRa[];
}

export interface LuotGiaoRa {
  id: string;
  so_luot: number;
  loai: string;
  nhan_loai: string;
  trang_thai: string;
  nhan_trang_thai: string;
  dang_mo: boolean;
  nguoi_giao: TacGiaRa;
  nguoi_nhan: TacGiaRa;
  ly_do: string | null;
}

/* ------------------------------------------------------------------ *
 * Vòng đời lượt giao — SPEC mục 13 d.360–370, mục 6
 * ------------------------------------------------------------------ */

/** Lượt giao đầy đủ (có brief) — `GET /v1/tasks`, `GET /v1/ticket/:id/luot-giao`. */
export interface LuotGiaoDayDuRa extends LuotGiaoRa {
  ticket_id: string;
  /** 8 trường brief của mục 4; trường để trống là `null`. */
  brief: Record<string, string | null>;
  khong_phan_hoi: boolean;
  han_phan_hoi_luc: number | null;
}

/** Câu hỏi đang chờ **tôi** trả lời — SPEC 19.6. */
export interface CauHoiRa {
  hoat_dong_id: string;
  phien_id: string;
  luot_giao_id: string;
  ticket_id: string;
  agent_id: string;
  noi_dung: string;
  gui_luc: number;
  cho_ms: number;
  qua_han: boolean;
}

/** Phiên của mình — SPEC mục 6. */
export interface PhienCuaToiRa {
  id: string;
  luot_giao_id: string;
  ticket_id: string;
  trang_thai: string;
  nhan_trang_thai: string;
  dang_mo: boolean;
  tin_hieu: string[];
}

/** Một mục Cần Chủ vừa được xử lý — SPEC mục 8 d.268 (`resolved_asks`). */
export interface MucCanChuGonRa {
  id: string;
  ma: string;
  tieu_de: string;
  trang_thai: string;
  ket_qua: string | null;
  ly_do_bo_qua: string | null;
}

/** Thân của `GET /v1/tasks` — SPEC mục 13 d.360. */
export interface ViecCuaToiRa {
  luot_giao: LuotGiaoDayDuRa[];
  cau_hoi: CauHoiRa[];
  tin_hieu: string[];
  phien: PhienCuaToiRa[];
  resolved_asks: MucCanChuGonRa[];
  co_viec: boolean;
  het_gio: boolean;
  da_cho_ms: number;
  cho_toi_da_giay: number;
}

/** Thân của `POST /v1/luot-giao/:id/nhan` — SPEC mục 13 d.361. */
export interface NhanLuotGiaoRa {
  id: string;
  ticket_id: string;
  trang_thai: string;
  nhan_luc: number;
  qua_han_phan_hoi: boolean;
  phien_id: string;
}

/** Thân của `POST /v1/luot-giao/:id/heartbeat` — SPEC mục 13 d.362. */
export interface HeartbeatRa {
  phien_id: string;
  luot_giao_id: string;
  ticket_id: string;
  trang_thai: string;
  tin_hieu_luc: number;
  tin_hieu: string[];
  resolved_asks: MucCanChuGonRa[];
  tra_loi_moi: {
    id: string;
    noi_dung: string;
    tac_gia_loai: string;
    tac_gia_agent_id: string | null;
    gui_luc: number;
  }[];
}

/** Thân của `POST /v1/phien/:id/hoat-dong` — SPEC mục 13 d.363. */
export interface HoatDongRa {
  id: string;
  phien_id: string;
  loai: string;
  thu_tu: number;
  gui_luc: number;
  tam_thoi: boolean;
  trang_thai_phien: string;
  da_xac_nhan_dung: boolean;
}

/** Thân của `PUT /v1/phien/:id/ke-hoach` — SPEC mục 13 d.364. */
export interface KeHoachRa {
  phien_id: string;
  phien_ban: number;
  so_buoc: number;
  buoc: { noi_dung: string; trang_thai: string }[];
  gui_luc: number;
}

/** Thân của `POST /v1/luot-giao/:id/nop` — SPEC mục 13 d.366. */
export interface NopBaoCaoRa {
  id: string;
  ticket_id: string;
  trang_thai: string;
  ket_qua: string;
  nop_luc: number;
  ticket_trang_thai: string;
  tu_accepted: boolean;
  phien_da_dong: boolean;
}

/** Thân của `POST /v1/luot-giao/:id/nghiem-thu` — SPEC mục 13 d.369. */
export interface NghiemThuRa {
  id: string;
  ticket_id: string;
  trang_thai: string;
  ticket_trang_thai: string;
  luot_moi: {
    id: string;
    so_luot: number;
    trang_thai: string;
    nguoi_nhan_agent_id: string;
    han_phan_hoi_luc: number | null;
  } | null;
}

/** Thân của `POST /v1/luot-giao/:id/huy` — SPEC mục 5 (`canceled`), 19.2, 19.6 (BAT-56). */
export interface HuyLuotRa {
  id: string;
  ticket_id: string;
  trang_thai: string;
  ticket_trang_thai: string;
  con_luot_mo: boolean;
  /** Phiên của lượt đã sang `stopping` (19.6: huỷ = xử lý như bấm Dừng). */
  phien_dang_dung: boolean;
}

/** Thân của `POST /v1/luot-giao/:id/tra-loi` — SPEC 19.12 câu 2. */
export interface TraLoiRa {
  id: string;
  phien_id: string;
  ticket_id: string;
  luot_giao_id: string;
  tra_loi_cho_id: string;
  comment_id: string;
  trang_thai_phien: string;
  gui_luc: number;
}

/* ------------------------------------------------------------------ *
 * Ticket và bằng chứng — SPEC mục 13 d.365, d.367, d.368, d.371, d.374
 * ------------------------------------------------------------------ */

/** Thân của `POST /v1/ticket` — SPEC mục 13 d.367. */
export interface TaoTicketRa {
  id: string;
  ma: string;
  so: number;
  tieu_de: string;
  trang_thai: string;
}

/** Thân của `POST /v1/ticket/:id/luot-giao` — SPEC mục 13 d.368. */
export interface TaoLuotGiaoRa {
  id: string;
  ticket_id: string;
  so_luot: number;
  loai: string;
  trang_thai: string;
  nguoi_nhan_agent_id: string;
  han_phan_hoi_luc: number | null;
  ticket_trang_thai: string;
}

/** Thân của `POST /v1/ticket/:id/lien-ket` — `baton link` (mục 4, 19.4; BAT-43). */
export interface NoiTicketRa {
  tu_ticket_id: string;
  den_ticket_id: string;
  loai_lien_ket: string;
}

/** Thân của `POST /v1/ticket/:id/trang-thai` — SPEC mục 13 d.371. */
export interface DoiTrangThaiRa {
  id: string;
  trang_thai: string;
  trang_thai_cu: string;
}

/** Thân của `POST /v1/ticket/:id/binh-luan` — SPEC mục 13 d.374. */
export interface ThemBinhLuanRa {
  id: string;
  ticket_id: string;
  tao_luc: number;
}

/**
 * Thân của `POST /v1/ticket/:id/bang-chung` — SPEC mục 13 d.365, mục 7.
 *
 * `ly_do` và `ma_http` chỉ có mặt ở các loại **có** bước xác minh (`commit`,
 * `deploy`), nên khai là tuỳ chọn — bốn loại còn lại dừng ở chặng 1 (`index.ts`).
 */
export interface GuiBangChungRa {
  id: string;
  ticket_id: string;
  loai: string;
  gui_luc: number;
  xac_minh: string;
  ly_do?: string | null;
  ma_http?: number | null;
  thu_lai_luc: number | null;
  sau_khi_xong: boolean;
  can_review_lai: boolean;
  can_review_lai_ly_do: string | null;
  /**
   * **Nguồn của kết luận** `merged`/`pushed` — `github` hay `local` (migration
   * 0022 khối A). Tuỳ chọn trong kiểu vì chỉ đường xác minh commit trả nó.
   */
  nguon_xac_minh?: NguonXacMinhMerged | null;
  /** **Nguồn của một `review`** — `reviewer` hay `manager` (khối B). */
  review_nguon?: NguonReview | null;
  /** **Nguồn ký của một `bao_cao`** (migration 0027) — kể cả `owner`. */
  bao_cao_nguon?: NguonBaoCao | null;
  ticket_trang_thai: string;
}

/* ------------------------------------------------------------------ *
 * Cần Chủ và Nhật ký — SPEC mục 13 d.375, d.376, d.377
 * ------------------------------------------------------------------ */

/** Thân của `POST /v1/can-chu` — SPEC mục 13 d.375 (`baton ask`). */
export interface TaoCanChuRa {
  id: string;
  /** `T-<số>` — thứ d.375 đòi in ra. */
  ma: string;
  tieu_de: string;
  /** `null` = mục **Chung** (19.12 câu 4). */
  project_id: string | null;
  muc: string;
  loai_can_chu: string;
  trang_thai: string;
  han_luc: number | null;
  han_mac_dinh: boolean;
  /** 19.8: `fyi` 🔴 bị hạ về 🟡 — máy chủ **báo lại cho agent** qua hai trường này. */
  muc_da_ha: boolean;
  ghi_chu_muc: string | null;
  /** Cờ "có thể trùng T-x" (mục 8, phần Lỗi); `null` = không trùng gì. */
  co_the_trung_ma: string | null;
  so_ticket_lien_quan: number;
}

/** Phương án đã chọn của một mục `decision` — mục 8 d.244. */
export interface PhuongAnDaChonRa {
  id: string;
  nhan: string;
  noi_dung: string;
}

/**
 * Thân của `GET /v1/can-chu/:id` — SPEC mục 13 d.376 (`baton result`).
 *
 * `da_xu_ly` là "**đã rời `open`**" (`resolved` **hoặc** `skipped`), không phải
 * "`resolved`": mục 8 d.244 cho `Chờ` hai đường ra. Đó cũng là thứ `--wait` dừng
 * lại trên, nên nó là thứ quyết định mã thoát 4 của 19.9 d.543.
 */
export interface KetQuaCanChuRa {
  id: string;
  ma: string;
  trang_thai: string;
  da_xu_ly: boolean;
  muc: string;
  loai: string;
  project_id: string | null;
  tieu_de: string;
  ket_qua: string | null;
  phuong_an_da_chon: PhuongAnDaChonRa | null;
  ket_luan_review: string | null;
  ly_do_bo_qua: string | null;
  xu_ly_luc: number | null;
  mo_lai_lan: number;
  /** Đã chờ hết `--wait` mà mục vẫn chưa xử lý — 19.9 d.543 → **mã thoát 4**. */
  het_gio: boolean;
  da_cho_ms: number;
  /** Trần chờ của máy chủ, tính bằng giây (d.353 "tới 60 giây"). */
  cho_toi_da_giay: number;
}

/** Một cảnh báo dữ liệu nhân sự — SPEC mục 10 d.312 ("chỉ cảnh báo, không chặn"). */
export interface CanhBaoDuLieuRa {
  ma: string;
  message: string;
}

/** Thân của `POST /v1/nhat-ky` — SPEC mục 13 d.377 (`baton decision`). */
export interface GhiNhatKyRa {
  id: string;
  luc: number;
  nguoi_loai: string;
  agent_id: string | null;
  project_id: string | null;
  quyet_dinh: string;
  vi_sao: string;
  so_can_cu: number;
  canh_bao: CanhBaoDuLieuRa[];
}

/**
 * Nhãn **tiếng Việt** của ba loại tác giả — SPEC mục 13 d.381 ("UI và thông điệp
 * lỗi hiển thị nhãn tiếng Việt").
 *
 * `LoaiTacGia` của server có đúng ba giá trị: `owner` · `agent` · `system`.
 * Bảng mục 0.1 **không có hàng nào** cho loại tác giả, nên nhãn ở đây là một
 * chọn tạm — đã ghi `cau-hoi-spec.md` #82. Để nó thành một bảng thay vì một
 * chuỗi `if`: thêm một loại ở server mà quên nhãn thì ra `(loại lạ: x)`, thấy
 * ngay, chứ không in lặng chữ Anh.
 */
export const NHAN_LOAI_TAC_GIA: Readonly<Record<string, string>> = {
  owner: 'chủ',
  agent: 'agent',
  system: 'hệ thống',
};

/** Tên người cho đầu ra người đọc: chủ, mã agent, hoặc "hệ thống". */
export function tenNguoi(t: TacGiaRa | null | undefined): string {
  if (t === null || t === undefined) return '(không ai)';
  if (t.loai === 'agent' && typeof t.agentId === 'string') return t.agentId;
  return NHAN_LOAI_TAC_GIA[t.loai] ?? `(loại lạ: ${t.loai})`;
}
