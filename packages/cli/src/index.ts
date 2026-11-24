/**
 * `@baton/cli` — CLI `baton` (SPEC mục 13). Nền + bốn lệnh **đọc** của lượt 1
 * phần 5 (`whoami`, `show`, `list`, `profile`) + vòng đời lượt giao của lượt 4
 * (`tasks`, `claim`, `heartbeat`, `log`, `plan`, `submit`, `verdict`, `reply`)
 * + ticket và bằng chứng của lượt 5 (`create`, `assign`, `status`, `comment`,
 * `evidence`) + Cần Chủ và Nhật ký của lượt 6 (`ask`, `result`, `decision`).
 *
 * Lượt 7 thêm **đường thứ hai** của d.351: máy chủ **MCP** (`mcp/`), dùng
 * **chính** `SO_LENH` — công cụ sinh ra từ sổ lệnh, cùng tên, cùng bộ quyền.
 *
 * Điểm vào cho tiến trình thật là `bin.ts` (CLI) và `bin-mcp.ts` (MCP); mọi thứ
 * khác thuần và chèn được, nên test chạy đúng đường thật mà không cần tiến
 * trình con.
 */

export * from './bao-cao-md.js';
export * from './brief-md.js';
export * from './chay.js';
export * from './che-token.js';
// Kiểm "đã merge cục bộ" cho bằng chứng `commit` — mục 7 d.206.
export * from './git-cuc-bo.js';
export * from './in-ra.js';
export * from './kieu-api.js';
export * from './lenh.js';
export * from './loi-cli.js';
export * from './moi-truong.js';
export * from './noi-day.js';
export * from './phan-tich.js';
export * from './phien-hien-tai.js';
export * from './tin-hieu.js';
export * from './tra-ma.js';
export * from './mcp/cong-cu.js';
export * from './mcp/tham-so.js';
export * from './mcp/ket-qua.js';
export * from './mcp/may-chu.js';
export * from './mcp/vao-ra.js';
export * from './mcp/cat-dong.js';
export * from './mcp/noi-day-mcp.js';
export { DONG_BANG_CHUNG_CHUA_CO } from './lenh/show.js';
export { DONG_BRIEF_KHONG_TRA_DUOC } from './lenh/claim.js';
/*
 * Hồ sơ dự án và Luật chung — mục 9 d.294–303. Ba dòng "chưa có" của phần 5
 * (`DONG_HO_SO_CHUA_CO`, `DONG_LOI_DA_GAP_CHUA_CO`, `DONG_LUAT_CHUNG_CHUA_CO`)
 * **không còn**: ba vế đó đã có đường API thật từ lượt này.
 */
export * from './ho-so-md.js';
export { kiemWait } from './lenh/tasks.js';
export { kiemLoaiHoatDongCli } from './lenh/log.js';
export { docKeHoach } from './lenh/plan.js';
export { DANG_NGHIEM_THU, kiemKetQuaNghiemThu } from './lenh/verdict.js';
export { kiemTrangThaiTaoCli, kiemUuTienCli } from './lenh/create.js';
export { kiemTimeout, thongDiepKhongThayAgent } from './lenh/assign.js';
export { LOAI_LINK_CLI, LOAI_LINK_MAC_DINH, kiemLoaiLinkCli } from './lenh/link.js';
export { kiemTrangThaiCli } from './lenh/status.js';
export {
  HAN_CHO_CLI_MS,
  HINH_GIA_TRI,
  hanChoCliMs,
  thanBangChung,
  tiemHanChoCli,
} from './lenh/evidence.js';
export {
  kiemLoaiCli,
  kiemMucCli,
  phuongAnTuCo,
  tachDeXuat,
  tachNhanPhuongAn,
} from './lenh/ask.js';
export { loaiCanCuTuChu } from './lenh/decision.js';
export { GHI_CHU_EXPORT } from './lenh/export.js';
export { kiemLyDoHuy } from './lenh/cancel.js';
