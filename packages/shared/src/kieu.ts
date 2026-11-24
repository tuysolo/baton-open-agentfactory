/**
 * Kiểu dữ liệu dùng chung (API, CLI, MCP, web).
 *
 * Mọi thời điểm là **epoch milliseconds** (số nguyên). Hiển thị giờ Việt Nam
 * (UTC+7) là việc của tầng UI — SPEC mục 0 nguyên tắc 8, mục 14.
 */

import type {
  LoaiLienKetTicket,
  TrangThaiDuAn,
  TrangThaiTicket,
  UuTien,
  VaiTroAgent,
} from './ma-nhan.js';

/** Thời điểm: epoch milliseconds. */
export type Epoch = number;

/** Ai làm một việc: chủ, một agent, hoặc hệ thống (SPEC mục 7 "tự lên Xong"). */
export type LoaiTacGia = 'owner' | 'agent' | 'system';

export interface TacGia {
  loai: LoaiTacGia;
  /** Có khi `loai === 'agent'`. */
  agentId?: string;
}

/* ------------------------------------------------------------------ *
 * Workspace — SPEC mục 1
 * ------------------------------------------------------------------ */
export interface Workspace {
  id: string;
  /** Tên hiển thị của chủ; mặc định "Chủ". Mục "Cần Chủ" dùng tên này. */
  ten_chu: string;
  /** Giới hạn WIP (Cài đặt workspace) 1–10, mặc định 3 — SPEC 20.1. */
  gioi_han_wip: number;
  tao_luc: Epoch;
  cap_nhat_luc: Epoch;
}

/** Tên chủ mặc định — SPEC mục 1. */
export const TEN_CHU_MAC_DINH = 'Chủ';

/* ------------------------------------------------------------------ *
 * Dự án — SPEC mục 2, 9
 * ------------------------------------------------------------------ */
export interface DuAn {
  id: string;
  workspace_id: string;
  ten: string;
  /** 2–6 chữ A–Z, duy nhất trong workspace, **không đổi được sau khi tạo**. */
  ma: string;
  mo_ta: string | null;
  mau: string | null;
  trang_thai: TrangThaiDuAn;
  /** Agent `manager` quản lý dự án (tuỳ chọn). */
  quan_ly_agent_id: string | null;
  /** Nhóm dự án: chỉ để xếp sidebar (SPEC mục 2). */
  nhom: string | null;
  /** Cờ "dự án không code" — đổi cổng bằng chứng (SPEC mục 7, 9). */
  khong_code: boolean;
  /** Cờ "bắt buộc review" — **mặc định bật** (SPEC mục 7, 9). */
  bat_buoc_review: boolean;
  /** Ưu tiên dự án 1–5 (5 = quan trọng nhất), mặc định 3 — SPEC 20.1. */
  uu_tien: number;
  /** Dự án "đang đẩy mạnh" — SPEC 20.1. */
  dang_day: boolean;
  /** Việc duy trì dài hạn, không có đích — SPEC 20.1. `true` ⇒ `dang_day` luôn `false`. */
  duy_tri: boolean;
  /** Tên ngắn 0–24 ký tự; `null` = dùng tên đầy đủ — SPEC 20.1. */
  ten_ngan: string | null;
  tao_luc: Epoch;
  cap_nhat_luc: Epoch;
}

/**
 * "**Đặt bởi** <tên> · <thời gian>" của thanh công cụ dự án — SPEC 20.8: lần đổi
 * cuối của ưu tiên / trạng thái / đang đẩy / duy trì / nhóm (dòng
 * `project_history` mới nhất của năm trường đó). `null` = chưa ai đổi.
 */
export interface DatBoi {
  loai: 'chu' | 'agent';
  /** Chủ ⇒ tên chủ workspace; agent ⇒ tên agent. */
  ten: string;
  luc: Epoch;
}

/* ------------------------------------------------------------------ *
 * Agent — SPEC mục 3, 15
 * ------------------------------------------------------------------ */
export interface Agent {
  id: string;
  workspace_id: string;
  /** Duy nhất trong workspace. */
  ten: string;
  vai_tro: VaiTroAgent;
  /** Chữ tự do (SPEC mục 1). */
  model: string | null;
  mo_ta: string | null;
  /** Chủ đã tắt agent: gọi API bị từ chối (SPEC mục 3). */
  disabled: boolean;
  /** Lần cuối lên tiếng (tín hiệu ghi gần nhất). */
  len_tieng_luc: Epoch | null;
  tao_luc: Epoch;
  cap_nhat_luc: Epoch;
}

/**
 * Token agent. Server **chỉ lưu dạng băm** (SPEC mục 3, 15); chuỗi token gốc
 * hiện đúng một lần khi tạo. `bon_ky_tu_cuoi` để UI hiện lại về sau.
 */
export interface TokenAgent {
  bam: string;
  bon_ky_tu_cuoi: string;
  tao_luc: Epoch;
  /** Có giá trị = token đã bị thu hồi, không còn hiệu lực. */
  thu_hoi_luc: Epoch | null;
}

/* ------------------------------------------------------------------ *
 * Ticket — SPEC mục 4
 * ------------------------------------------------------------------ */

/** 8 trường brief có cấu trúc — SPEC mục 4. */
export interface Brief {
  muc_tieu: string | null;
  boi_canh: string | null;
  pham_vi: string | null;
  file_va_nguon: string | null;
  dieu_cam: string | null;
  xong_la_gi: string | null;
  cach_kiem_chung: string | null;
  nop_lai: string | null;
}

/** Tên 8 trường brief theo đúng thứ tự hiển thị của SPEC mục 4. */
export const TRUONG_BRIEF = [
  'muc_tieu',
  'boi_canh',
  'pham_vi',
  'file_va_nguon',
  'dieu_cam',
  'xong_la_gi',
  'cach_kiem_chung',
  'nop_lai',
] as const satisfies readonly (keyof Brief)[];

/** Nhãn tiếng Việt của 8 trường brief. */
export const NHAN_TRUONG_BRIEF = {
  muc_tieu: 'Mục tiêu',
  boi_canh: 'Bối cảnh',
  pham_vi: 'Phạm vi',
  file_va_nguon: 'File và nguồn liên quan',
  dieu_cam: 'Điều cấm',
  xong_la_gi: 'Xong là gì',
  cach_kiem_chung: 'Cách kiểm chứng',
  nop_lai: 'Nộp lại',
} as const satisfies Record<keyof Brief, string>;

export interface Ticket extends Brief {
  id: string;
  workspace_id: string;
  project_id: string;
  /** Số tăng dần trong dự án, **không tái dùng** (SPEC mục 1, 4). */
  so: number;
  tieu_de: string;
  mo_ta: string | null;
  trang_thai: TrangThaiTicket;
  uu_tien: UuTien;
  /** Hạng số của ưu tiên, để sắp xếp trong SQL (0 = Khẩn). */
  hang_uu_tien: number;
  /** Người chịu trách nhiệm: chủ hoặc agent `manager`/`coordinator`. */
  chiu_trach_nhiem: TacGia | null;
  han_luc: Epoch | null;
  nguoi_tao: TacGia;
  tao_luc: Epoch;
  cap_nhat_luc: Epoch;
  bat_dau_luc: Epoch | null;
  xong_luc: Epoch | null;
  /** Mã cũ khi nhập từ công cụ khác — SPEC mục 16, tìm được. */
  ma_cu: string | null;
  /** Xoá mềm: khôi phục trong 30 ngày, mã không bao giờ dùng lại (mục 4). */
  xoa_luc: Epoch | null;
  /** Số thứ tự khối việc lớn 1–99; `null` = không phải khối lớn — SPEC 20.1. */
  khoi_lon: number | null;
  /** Vị trí trên đồi 0–100, chỉ có khi có `khoi_lon` — SPEC 20.1. */
  doi: number | null;
}

/**
 * **Nguồn duy nhất** của lớp ký tự mã dự án: 2–6 chữ A–Z — SPEC mục 2
 * ("Mã chỉ gồm 2–6 chữ A–Z").
 *
 * Để ở đây, không ở `hop-le.ts`, vì mã **ticket** (`MÃ-số`) chứa nó và `hop-le.ts`
 * nhập `kieu.ts` (chiều ngược lại là một vòng). `MAU_MA_DU_AN` của `hop-le.ts`
 * dựng từ đúng chuỗi này, nên lớp ký tự chỉ viết một lần.
 */
export const NGUON_MA_DU_AN = '[A-Z]{2,6}';

/**
 * Mã hiển thị của ticket: `MÃ-số` (SPEC mục 1, 4) — **chiều dựng**.
 *
 * Chiều ngược (`tachMaTicket`) nằm ngay dưới. Hai chiều phải ở cạnh nhau và
 * dùng chung `NGUON_MA_DU_AN`: một mã ticket có **đúng một** định nghĩa, nên
 * không có đường nào để bên dựng và bên đọc lệch nhau.
 */
export function maTicket(maDuAn: string, so: number): string {
  return `${maDuAn}-${so}`;
}

/** Mẫu mã ticket hiển thị — **chiều đọc** của `maTicket`. */
export const MAU_MA_TICKET = new RegExp(`^(${NGUON_MA_DU_AN})-([1-9][0-9]*)$`);

/**
 * Tách `MÃ-số` thành mã dự án + số. Không đúng dạng → `null`.
 *
 * Số không nhận `0` ở đầu (`SAI-01`) và không nhận `SAI-0`: số ticket đếm từ 1
 * (SPEC mục 4), nên `SAI-01` là một mã **gõ sai**, không phải một cách viết khác
 * của `SAI-1` — nhận nó là tạo hai chuỗi chỉ cùng một ticket.
 */
export function tachMaTicket(ma: string): { ma_du_an: string; so: number } | null {
  const khop = MAU_MA_TICKET.exec(ma);
  if (khop === null) return null;
  return { ma_du_an: khop[1] ?? '', so: Number(khop[2]) };
}

/** Số ngày khôi phục ticket đã xoá — SPEC mục 4. */
export const SO_NGAY_KHOI_PHUC_TICKET = 30;

export interface LienKetTicket {
  workspace_id: string;
  tu_ticket_id: string;
  den_ticket_id: string;
  loai: LoaiLienKetTicket;
  tao_luc: Epoch;
}

/** Một dòng lịch sử: chỉ thêm, không sửa không xoá (SPEC mục 4). */
export interface DongLichSuTicket {
  id: string;
  workspace_id: string;
  ticket_id: string;
  tac_gia: TacGia;
  luc: Epoch;
  truong: string;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
}

export interface BinhLuan {
  id: string;
  workspace_id: string;
  ticket_id: string;
  tac_gia: TacGia;
  /** Markdown. */
  noi_dung: string;
  /** Tác giả tự sửa được; sửa rồi thì hiện "đã sửa" (SPEC mục 4). */
  da_sua: boolean;
  tao_luc: Epoch;
  cap_nhat_luc: Epoch;
}

/* ------------------------------------------------------------------ *
 * Phân trang keyset (cursor) — mốc 200.000 ticket, không dùng OFFSET lớn
 * ------------------------------------------------------------------ */
export interface YeuCauTrang {
  /** Con trỏ mờ, lấy từ `TrangKetQua.cursor_sau` của trang trước. */
  cursor?: string | undefined;
  /**
   * Số bản ghi mỗi trang. Nhận cả chuỗi vì tham số này tới từ query string;
   * `kiemLimit` chuyển và kẹp vào khoảng cho phép.
   */
  limit?: number | string | undefined;
}

export interface TrangKetQua<T> {
  items: T[];
  /** `null` = hết dữ liệu. */
  cursor_sau: string | null;
}

export const LIMIT_TRANG_MAC_DINH = 50;
export const LIMIT_TRANG_TOI_DA = 200;
