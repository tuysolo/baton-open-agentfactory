/**
 * **Sổ tra duy nhất: nhãn sidebar ↔ đường URL ↔ trang** — SPEC mục 14 d.391–394.
 *
 * d.391–392 liệt kê **đúng sáu** mục đầu, theo **đúng thứ tự** đó, với Cần Chủ
 * mang huy hiệu; d.394 đặt Cài đặt **dưới cùng**. Thứ tự ấy là nội dung của
 * SPEC, không phải sở thích, nên nó nằm trong một mảng có thứ tự, không trong
 * sáu dòng JSX rải rác.
 *
 * ## Đường URL: SPEC chỉ chốt MỘT đường
 *
 * d.398 chốt `/t/<MÃ>` cho chi tiết ticket. **Mọi đường khác dưới đây là đề xuất
 * tạm** — xem `spec-questions.md` #101. Chúng gom về một chỗ đúng vì thế: khi chủ
 * chốt, đổi là đổi mảng này, không phải đi tìm chuỗi `'/bao-cao'` trong mười file.
 *
 * ## Vì sao bảng này không làm test thành tautology
 *
 * Ca test **không** so sidebar với mảng này. Nó đọc `SPEC.md`, cắt ra đúng ba
 * dòng d.391–394, rút danh sách nhãn từ **chữ của SPEC**, rồi so với những gì
 * sidebar **vẽ ra DOM**. Nên bỏ một mục ở đây là một ca đỏ, và đổi một nhãn ở đây
 * cũng là một ca đỏ — mảng này không tự xác nhận chính nó.
 */

export interface MucSidebar {
  /** Nhãn tiếng Việt, đúng chữ của SPEC mục 14. */
  nhan: string;
  duong: string;
  /** Mục này mang huy hiệu số (d.391: "**Cần Chủ** (huy hiệu)"). */
  huy_hieu?: true;
}

/**
 * **Nhãn của mục "Tất cả việc"** — d.392, và cũng là **tiêu đề trang** của danh
 * sách ticket mọi dự án (xem `trang/danh-sach-ticket.tsx`).
 *
 * Một hằng cho cả hai chỗ: ca "mỗi mục sidebar có một trang, tiêu đề đúng nhãn"
 * (`test/dinh-tuyen.test.tsx`) so **nhãn cắt từ SPEC** với **tiêu đề trang**, nên
 * hai bản chép sẽ lệch ngay lần sửa đầu.
 */
export const NHAN_TAT_CA_VIEC = 'Tất cả việc';

/**
 * Sáu mục đầu của d.392, đúng thứ tự SPEC.
 *
 * **"Bản đồ dự án" KHÔNG còn ở đây** — d.398: "Bản đồ dự án không có mục riêng ở
 * sidebar; trang vẫn còn và vào từ một dự án." Đường `/ban-do-du-an` và trang
 * `trang/ban-do.tsx` **giữ nguyên**; đường vào là mục con của mỗi dự án
 * (`MotDuAn` ở `sidebar.tsx`) và nút trên hồ sơ dự án.
 *
 * **"Tất cả việc" thay cho "Việc của tôi"** — mục ngoài SPEC của đợt 1 trùng
 * nghĩa với "Cần Chủ"; d.392 nay có một mục thật, và d.397 định nghĩa nó: "danh
 * sách ticket của **mọi dự án**, mở ở **kiểu Bảng**". Nên nó **không** là một
 * trang mới: nó là `/ticket` — đúng đường mà danh sách "Tất cả dự án" đã có.
 */
export const MUC_CHINH: readonly MucSidebar[] = [
  { nhan: 'Tổng quan', duong: '/' },
  { nhan: 'Cần Chủ', duong: '/can-chu', huy_hieu: true },
  { nhan: NHAN_TAT_CA_VIEC, duong: '/ticket' },
  { nhan: 'Báo cáo', duong: '/bao-cao' },
  { nhan: 'Nhật ký quyết định', duong: '/nhat-ky' },
  { nhan: 'Đội agent', duong: '/doi-agent' },
];

/** d.394: "Dưới cùng: Cài đặt." */
export const MUC_CUOI: MucSidebar = { nhan: 'Cài đặt', duong: '/cai-dat' };

/** Thứ tự chủ thấy từ trên xuống dưới: sáu mục, rồi dự án, rồi Cài đặt. */
export const MUC_SIDEBAR: readonly MucSidebar[] = [...MUC_CHINH, MUC_CUOI];

/** Nhóm cho dự án **không** được gán nhóm (d.76: nhóm là tuỳ chọn). */
export const NHOM_KHONG_TEN = 'Chưa có nhóm';

/**
 * **Bản đồ dự án** — d.398: không có mục riêng ở sidebar, **trang vẫn còn** và
 * vào từ một dự án. Nhãn và đường ở lại đây (một sổ tra) vì hai chỗ dùng chúng:
 * mục con của mỗi dự án trong sidebar, và nút trên trang hồ sơ dự án.
 */
export const NHAN_BAN_DO = 'Bản đồ dự án';
export const DUONG_BAN_DO = '/ban-do-du-an';

/** Đường của danh sách ticket một dự án (d.395). Đề xuất tạm, xem #101. */
export const duongDuAn = (ma: string): string => `/du-an/${ma}`;

/** Hồ sơ một dự án — tra theo **id**, không mã (mục 9 d.294). */
export const duongHoSoDuAn = (id: string): string => `/du-an/${id}/ho-so`;

/**
 * **"Việc của tôi" đã BỎ** — mục ngoài SPEC của BAT-6 đợt 1
 * (`spec-questions.md` #127), bỏ ở đợt 3 phần B theo bản soát UI mà chủ duyệt.
 *
 * Hai lý do, cả hai là lý do của chủ: nó **trùng nghĩa** với "Cần Chủ" (nó chỉ là
 * `/ticket?can_chu=co`, tức cùng tập mà huy hiệu đỏ đếm), và d.392 nay có một mục
 * thật cho chỗ ấy — **"Tất cả việc"** (xem `MUC_CHINH`). Khối ghi chú này ở lại
 * để lượt sau không dựng lại nó như một "mục ngoài SPEC" lần thứ hai.
 */

/** Đường của bộ lọc "cần Chủ" trên danh sách — d.396, vẫn dùng được khi cần. */
export const DUONG_TICKET_CAN_CHU = '/ticket?can_chu=co';

/** Đường chi tiết ticket — **d.398 chốt đúng dạng này**, không phải đề xuất tạm. */
export const duongTicket = (ma: string): string => `/t/${ma}`;

/**
 * Khoá URL "mục Cần Chủ cần mở" trên trang Cần Chủ — `/can-chu?the=<T-số>`
 * (`spec-questions.md` #154, chốt 19/10 T-31, BAT-37). Cùng khuôn `?the=<mã>` mà
 * danh sách việc đã dùng cho "thẻ đang mở" (`KHOA_THE` ở `loc-ticket.ts`), nên
 * không thêm route mới. Nằm ở sổ tra này (không ở `trang/can-chu.tsx`) vì
 * command menu cần nó, và `can-chu.tsx` đã nhập từ `command-menu.tsx` — đặt ở
 * đó là một vòng nhập.
 */
export const KHOA_THE_CAN_CHU = 'the';

/** Đường tới **đúng một** mục Cần Chủ — #154. */
export const duongMucCanChu = (ma: string): string =>
  `/can-chu?${KHOA_THE_CAN_CHU}=${encodeURIComponent(ma)}`;
