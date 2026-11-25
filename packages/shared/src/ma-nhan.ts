/**
 * Bảng mã máy (tiếng Anh) ↔ nhãn hiển thị (tiếng Việt) — SPEC mục 0.1.
 *
 * Luật: mọi mã trong API, CLI, MCP, cơ sở dữ liệu và log dùng **tiếng Anh**;
 * giao diện, thông báo và thông điệp lỗi hiển thị **nhãn tiếng Việt**.
 *
 * Không dùng `enum` của TypeScript (const object + union type để giữ mã là
 * chuỗi thật, đi thẳng vào SQL và JSON mà không cần ánh xạ số).
 */

/* ------------------------------------------------------------------ *
 * Vai trò agent — SPEC 0.1, 1, 3
 * ------------------------------------------------------------------ */
export const VAI_TRO_AGENT = {
  coordinator: 'Điều phối',
  manager: 'Quản lý',
  worker: 'Người làm',
  reviewer: 'Người duyệt',
} as const;
export type VaiTroAgent = keyof typeof VAI_TRO_AGENT;

/* ------------------------------------------------------------------ *
 * Trạng thái dự án — SPEC 0.1, 2
 * ------------------------------------------------------------------ */
export const TRANG_THAI_DU_AN = {
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  archived: 'Lưu trữ',
} as const;
export type TrangThaiDuAn = keyof typeof TRANG_THAI_DU_AN;

/* ------------------------------------------------------------------ *
 * Trạng thái agent (tự tính) — SPEC 0.1, 3
 * ------------------------------------------------------------------ */
export const TRANG_THAI_AGENT = {
  busy: 'Đang làm',
  waiting_owner: 'Chờ Chủ',
  stalled: 'Đứng',
  idle: 'Rảnh',
  disabled: 'Đã tắt',
} as const;
export type TrangThaiAgent = keyof typeof TRANG_THAI_AGENT;

/* ------------------------------------------------------------------ *
 * Trạng thái ticket (7 mã, cố định ở v0.1) — SPEC 0.1, 4
 * ------------------------------------------------------------------ */
export const TRANG_THAI_TICKET = {
  backlog: 'Backlog',
  todo: 'Cần làm',
  in_progress: 'Đang làm',
  verifying: 'Chờ kiểm chứng',
  done: 'Xong',
  canceled: 'Huỷ',
  duplicate: 'Trùng',
} as const;
export type TrangThaiTicket = keyof typeof TRANG_THAI_TICKET;

/**
 * Trạng thái **đặt được lúc tạo** ticket — SPEC mục 4 "Trạng thái khi tạo" (Chủ
 * chốt T-108 = B, 29/10; BAT-63; `spec-questions.md` #179): mặc định Cần làm, người
 * tạo được chọn Backlog. Năm trạng thái còn lại đều có luật vào riêng (lượt giao,
 * cổng bằng chứng, lý do, ticket gốc) mà một ticket vừa tạo không thoả, nên không
 * đặt được lúc tạo (`INVALID_INPUT`). Phần tử đầu là mặc định.
 */
export const TRANG_THAI_TICKET_KHI_TAO = [
  'todo',
  'backlog',
] as const satisfies readonly TrangThaiTicket[];
export type TrangThaiTicketKhiTao = (typeof TRANG_THAI_TICKET_KHI_TAO)[number];

/**
 * Trạng thái mặc định khi tạo ticket — SPEC mục 4 ("Cần làm"). Suy từ phần tử
 * đầu của `TRANG_THAI_TICKET_KHI_TAO` (một nguồn duy nhất; kiểu literal `'todo'`).
 */
export const TRANG_THAI_TICKET_MAC_DINH = TRANG_THAI_TICKET_KHI_TAO[0];

/* ------------------------------------------------------------------ *
 * Nhóm trạng thái ticket — SPEC 0.1, 4
 * ------------------------------------------------------------------ */
export const NHOM_TRANG_THAI_TICKET = {
  planned: 'chờ',
  active: 'chạy',
  closed: 'kết',
} as const;
export type NhomTrangThaiTicket = keyof typeof NHOM_TRANG_THAI_TICKET;

/** Ánh xạ trạng thái ticket → nhóm. */
export const NHOM_CUA_TRANG_THAI_TICKET = {
  backlog: 'planned',
  todo: 'planned',
  in_progress: 'active',
  verifying: 'active',
  done: 'closed',
  canceled: 'closed',
  duplicate: 'closed',
} as const satisfies Record<TrangThaiTicket, NhomTrangThaiTicket>;

/** Nhóm của một trạng thái ticket. */
export function nhomTrangThai(ma: TrangThaiTicket): NhomTrangThaiTicket {
  return NHOM_CUA_TRANG_THAI_TICKET[ma];
}

/** Các trạng thái thuộc một nhóm, theo thứ tự khai báo. */
export function trangThaiTheoNhom(nhom: NhomTrangThaiTicket): TrangThaiTicket[] {
  return (Object.keys(TRANG_THAI_TICKET) as TrangThaiTicket[]).filter(
    (ma) => NHOM_CUA_TRANG_THAI_TICKET[ma] === nhom,
  );
}

/* ------------------------------------------------------------------ *
 * Ưu tiên — SPEC 0.1, 4 (5 mức, thứ tự cố định, mặc định `none`)
 * ------------------------------------------------------------------ */
export const UU_TIEN = {
  urgent: 'Khẩn',
  high: 'Cao',
  medium: 'Vừa',
  low: 'Thấp',
  none: 'Không',
} as const;
export type UuTien = keyof typeof UU_TIEN;

/** Thứ tự ưu tiên cố định: Khẩn → Cao → Vừa → Thấp → Không. */
export const THU_TU_UU_TIEN = ['urgent', 'high', 'medium', 'low', 'none'] as const satisfies readonly UuTien[];

/** Hạng số của một mức ưu tiên (0 = Khẩn). Dùng cho cột sắp xếp trong SQL. */
export const HANG_UU_TIEN = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
} as const satisfies Record<UuTien, number>;

export const UU_TIEN_MAC_DINH: UuTien = 'none';

/* ------------------------------------------------------------------ *
 * Lượt giao — SPEC 0.1, 5, 19.1
 * ------------------------------------------------------------------ */
export const LOAI_LUOT_GIAO = {
  work: 'Làm',
  review: 'Review',
} as const;
export type LoaiLuotGiao = keyof typeof LOAI_LUOT_GIAO;

export const TRANG_THAI_LUOT_GIAO = {
  pending: 'Chờ nhận',
  in_progress: 'Đang làm',
  submitted: 'Đã nộp',
  accepted: 'Đạt',
  returned: 'Trả lại',
  canceled: 'Đã huỷ',
} as const;
export type TrangThaiLuotGiao = keyof typeof TRANG_THAI_LUOT_GIAO;

/** Lượt "mở" = `pending` hoặc `in_progress` — SPEC 19.1. */
export const TRANG_THAI_LUOT_GIAO_MO = ['pending', 'in_progress'] as const satisfies readonly TrangThaiLuotGiao[];

/* ------------------------------------------------------------------ *
 * Kết quả nộp — SPEC 0.1, 5, 19.2
 * ------------------------------------------------------------------ */
export const KET_QUA_NOP = {
  done: 'Xong',
  partial: 'Xong một phần',
  blocked: 'Không làm được',
} as const;
export type KetQuaNop = keyof typeof KET_QUA_NOP;

/* ------------------------------------------------------------------ *
 * Phiên — SPEC 0.1, 6, 19.6
 * ------------------------------------------------------------------ */
export const TRANG_THAI_PHIEN = {
  running: 'Đang chạy',
  waiting_owner: 'Chờ Chủ',
  waiting_assigner: 'Chờ người giao',
  stalled: 'Đứng',
  error: 'Lỗi',
  stopping: 'Đang dừng',
  closed: 'Đã đóng',
} as const;
export type TrangThaiPhien = keyof typeof TRANG_THAI_PHIEN;

/* ------------------------------------------------------------------ *
 * Dòng hoạt động của phiên — SPEC 0.1, 6
 * ------------------------------------------------------------------ */
export const LOAI_HOAT_DONG = {
  thought: 'Suy nghĩ',
  action: 'Thao tác',
  question: 'Hỏi',
  result: 'Kết quả',
  error: 'Lỗi',
} as const;
export type LoaiHoatDong = keyof typeof LOAI_HOAT_DONG;

/* ------------------------------------------------------------------ *
 * Trạng thái một bước trong **kế hoạch của phiên** — SPEC mục 6 d.191
 * ------------------------------------------------------------------ *
 * "Kế hoạch của phiên: danh sách bước, mỗi bước có trạng thái **chờ**, **đang
 * làm**, **xong** hoặc **huỷ**."
 *
 * SPEC mục 6 cho bốn **nhãn** tiếng Việt nhưng bảng mã máy mục **0.1 không có
 * nhóm này** — chỗ SPEC thiếu, câu hỏi gửi M-Baton. Mã lấy theo đúng khuôn các
 * nhóm đã có của 0.1, để không sinh thêm một phương ngữ thứ hai:
 *   * `pending` / `in_progress` trùng mã **và** trùng nhãn với `trang_thai_luot_giao`
 *     ("Chờ nhận" ở lượt giao là "Chờ" ở đây — nhãn của mục 6).
 *   * `done` / `canceled` trùng mã và nhãn với `trang_thai_ticket`.
 *
 * Tiền lệ cho một nhóm **ngoài** bảng 0.1: `loai_lien_ket_ticket` (mục 4, 19.4).
 */
export const TRANG_THAI_BUOC = {
  pending: 'Chờ',
  in_progress: 'Đang làm',
  done: 'Xong',
  canceled: 'Huỷ',
} as const;
export type TrangThaiBuoc = keyof typeof TRANG_THAI_BUOC;

/** Trạng thái mặc định của một bước mới gửi lên — "chờ" (SPEC mục 6 d.191). */
export const TRANG_THAI_BUOC_MAC_DINH: TrangThaiBuoc = 'pending';

/* ------------------------------------------------------------------ *
 * Tín hiệu gửi agent — SPEC 0.1, 6
 * ------------------------------------------------------------------ */
export const TIN_HIEU = {
  STOP: 'Dừng',
} as const;
export type TinHieu = keyof typeof TIN_HIEU;

/* ------------------------------------------------------------------ *
 * Bằng chứng — SPEC 0.1, 7
 * ------------------------------------------------------------------ */
export const LOAI_BANG_CHUNG = {
  commit: 'commit',
  deploy: 'deploy',
  review: 'review',
  test: 'test',
  file: 'file',
  note: 'Ghi chú',
  /*
   * **`bao_cao` là mã Baton thêm**, không có trong bảng 0.1 / mục 7 — chủ chốt
   * T-31 câu 3.4 A (19/10), `spec-questions.md` #161. Dùng để đóng ticket **không
   * code** (cờ dự án hoặc cờ ticket) mà không cần chủ xác nhận từng cái; ticket
   * có code thì nó **không mở gì** (xem `congXong`). Trong DB nó mượn `note`/`file`
   * + cột `bao_cao_nguon` (migration 0027); mọi đường đọc thấy `bao_cao`.
   */
  bao_cao: 'Báo cáo',
} as const;
export type LoaiBangChung = keyof typeof LOAI_BANG_CHUNG;

/**
 * Xác minh bằng chứng — SPEC 0.1, 7.
 * `pushed` và `merged` chỉ áp cho bằng chứng loại `commit`.
 *
 * **`not_required` là mã Baton thêm**, không có trong bảng 0.1 —
 * `spec-questions.md` #55. SPEC d.209–211 ghi cột Xác minh của `test`, `file`,
 * `note` là "Không xác minh" mà 0.1 không cho mã nào cho trạng thái đó. Nhét
 * chúng vào `passed` thì "không cần xác minh" và "đã xác minh **đạt**" thành một
 * giá trị, và cổng Xong (d.214) mất khả năng phân biệt — `passed` của `deploy`
 * **mở cổng**, còn `note` thì không.
 *
 * `withdrawn` **không** được lưu vào cột `xac_minh`: đó là mã **hiển thị**, suy
 * ra từ `rut_luc` (xem `xacMinhHienThi` trong `bang-chung.ts` và ghi chú B của
 * migration 0009). Ghi đè `xac_minh` thành `withdrawn` là sửa chính thứ d.222
 * cấm sửa, và mất thông tin "commit này đã `merged` rồi mới bị rút".
 */
export const XAC_MINH_BANG_CHUNG = {
  pending: 'Đang kiểm',
  passed: 'Đạt',
  failed: 'Trượt',
  withdrawn: 'Đã rút',
  not_required: 'Không cần xác minh',
  pushed: 'pushed',
  merged: 'merged',
} as const;
export type XacMinhBangChung = keyof typeof XAC_MINH_BANG_CHUNG;

/** Các mã xác minh chỉ dùng cho bằng chứng `commit`. */
export const XAC_MINH_CHI_CHO_COMMIT = ['pushed', 'merged'] as const satisfies readonly XacMinhBangChung[];

/**
 * Các mã xác minh **lưu được** vào cột `evidence.xac_minh` (migration 0009).
 * `withdrawn` không nằm trong đây — xem ghi chú ở `XAC_MINH_BANG_CHUNG`.
 */
export const XAC_MINH_LUU_DUOC = [
  'pending',
  'passed',
  'failed',
  'not_required',
  'pushed',
  'merged',
] as const satisfies readonly XacMinhBangChung[];
export type XacMinhLuuDuoc = (typeof XAC_MINH_LUU_DUOC)[number];

/* ------------------------------------------------------------------ *
 * Kết luận review — SPEC 0.1, 7, 19.3
 * ------------------------------------------------------------------ */
export const KET_LUAN_REVIEW = {
  pass: 'Đạt',
  fail: 'Không đạt',
} as const;
export type KetLuanReview = keyof typeof KET_LUAN_REVIEW;

/* ------------------------------------------------------------------ *
 * Cần Chủ — SPEC 0.1, 8, 19.8, 19.9
 * ------------------------------------------------------------------ */
export const MUC_CAN_CHU = {
  urgent: '🔴 Gấp',
  today: '🟡 Trong ngày',
  later: '⚪ Không gấp',
} as const;
export type MucCanChu = keyof typeof MUC_CAN_CHU;

/** Thứ tự phiên duyệt: 🔴 → 🟡 → ⚪ (SPEC mục 8). */
export const THU_TU_MUC_CAN_CHU = ['urgent', 'today', 'later'] as const satisfies readonly MucCanChu[];

export const LOAI_CAN_CHU = {
  decision: 'Quyết định',
  run_command: 'Chủ chạy lệnh',
  review: 'Chủ review',
  fyi: 'Chỉ để biết',
} as const;
export type LoaiCanChu = keyof typeof LOAI_CAN_CHU;

export const TRANG_THAI_CAN_CHU = {
  open: 'Chờ',
  resolved: 'Đã xử lý',
  skipped: 'Bỏ qua',
} as const;
export type TrangThaiCanChu = keyof typeof TRANG_THAI_CAN_CHU;

/* ------------------------------------------------------------------ *
 * Loại liên kết ticket — SPEC 4 + 19.4
 * "điều phối" (`dieu_phoi`) là loại RIÊNG, khác "liên quan" (`related`).
 * ------------------------------------------------------------------ */
export const LOAI_LIEN_KET_TICKET = {
  parent: 'Ticket cha',
  related: 'Liên quan',
  blocks: 'Chặn',
  dieu_phoi: 'Điều phối',
} as const;
export type LoaiLienKetTicket = keyof typeof LOAI_LIEN_KET_TICKET;

/* ------------------------------------------------------------------ *
 * Sổ tra nhãn chung
 * ------------------------------------------------------------------ */

/** Mọi nhóm mã của SPEC mục 0.1 (cộng loại liên kết ticket ở mục 4/19.4). */
export const BANG_MA = {
  vai_tro_agent: VAI_TRO_AGENT,
  trang_thai_du_an: TRANG_THAI_DU_AN,
  trang_thai_agent: TRANG_THAI_AGENT,
  trang_thai_ticket: TRANG_THAI_TICKET,
  nhom_trang_thai_ticket: NHOM_TRANG_THAI_TICKET,
  uu_tien: UU_TIEN,
  loai_luot_giao: LOAI_LUOT_GIAO,
  trang_thai_luot_giao: TRANG_THAI_LUOT_GIAO,
  ket_qua_nop: KET_QUA_NOP,
  trang_thai_phien: TRANG_THAI_PHIEN,
  loai_hoat_dong: LOAI_HOAT_DONG,
  trang_thai_buoc: TRANG_THAI_BUOC,
  tin_hieu: TIN_HIEU,
  loai_bang_chung: LOAI_BANG_CHUNG,
  xac_minh_bang_chung: XAC_MINH_BANG_CHUNG,
  ket_luan_review: KET_LUAN_REVIEW,
  muc_can_chu: MUC_CAN_CHU,
  loai_can_chu: LOAI_CAN_CHU,
  trang_thai_can_chu: TRANG_THAI_CAN_CHU,
  loai_lien_ket_ticket: LOAI_LIEN_KET_TICKET,
} as const;

export type TenNhomMa = keyof typeof BANG_MA;
export type MaTrongNhom<N extends TenNhomMa> = keyof (typeof BANG_MA)[N] & string;

/**
 * Nhãn tiếng Việt của một mã. Mã không có trong nhóm → trả lại chính mã đó
 * (UI không được vỡ chỉ vì dữ liệu cũ mang mã lạ).
 */
export function nhan<N extends TenNhomMa>(nhom: N, ma: MaTrongNhom<N> | string): string {
  const bang = BANG_MA[nhom] as Record<string, string | undefined>;
  return bang[ma] ?? ma;
}

/** Mã trong một nhóm có hợp lệ không. */
export function laMaHopLe<N extends TenNhomMa>(nhom: N, ma: unknown): ma is MaTrongNhom<N> {
  return typeof ma === 'string' && Object.prototype.hasOwnProperty.call(BANG_MA[nhom], ma);
}

/** Danh sách mã của một nhóm, theo thứ tự khai báo (thứ tự có nghĩa với ưu tiên và mức Cần Chủ). */
export function danhSachMa<N extends TenNhomMa>(nhom: N): MaTrongNhom<N>[] {
  return Object.keys(BANG_MA[nhom]) as MaTrongNhom<N>[];
}
