/**
 * **Màu và viết tắt của một thẻ việc** — BAT-6 đợt 2, phần ngoài SPEC của brief
 * (`spec-questions.md` #135, #136).
 *
 * Ba hàm thuần, không một dòng JSX: màu của một nhãn, màu của một mức ưu tiên, và
 * chữ viết tắt của người đang cầm. Để ở đây vì cả ba **phải test được không cần
 * DOM**, và vì lưới tương phản của `test/vo-linear.test.tsx` đọc đúng hai mảng
 * dưới đây — mỗi cặp nền–chữ của nhãn và mỗi màu icon ưu tiên đều **có người đo**.
 *
 * ## Vì sao class viết SẴN THÀNH CHUỖI, không ghép `bg-nhan${i}-nen`
 *
 * Tailwind quét **văn bản mã nguồn** để biết sinh class nào. Một tên class ghép
 * lúc chạy không có trong văn bản, nên CSS của nó **không tồn tại** — nhãn sẽ ra
 * không màu trên bản thật mà mọi ca test jsdom vẫn xanh (jsdom không nạp CSS).
 * Nên sáu cặp là sáu chuỗi viết sẵn, và lưới tương phản cũng nhờ đó thấy chúng.
 */

import type { MucDoKhan, TacGiaRa, TrangThaiAgent, TrangThaiTicket, UuTien } from '../api';

/**
 * **Sáu cặp màu nhãn.** Mỗi phần tử là **một** đoạn class mang **cả** nền và
 * chữ — xem khối ghi chú đầu `kieu.css`: tách hai thang ra là mở lại họ lỗi
 * "nền đổi mà chữ không".
 */
export const LOP_NHAN: readonly string[] = [
  'bg-nhan1-nen text-nhan1-chu',
  'bg-nhan2-nen text-nhan2-chu',
  'bg-nhan3-nen text-nhan3-chu',
  'bg-nhan4-nen text-nhan4-chu',
  'bg-nhan5-nen text-nhan5-chu',
  'bg-nhan6-nen text-nhan6-chu',
];

/**
 * Băm một nhãn sang **một trong sáu** cặp màu.
 *
 * Ổn định (cùng chữ ⇒ cùng màu, mọi màn hình, mọi lần tải) và **không lưu gì**:
 * không có bảng màu nhãn nào trong SPEC, và một màu random mỗi lần vẽ sẽ làm
 * nhãn nhảy màu giữa hai lần làm mới của d.410.
 *
 * `>>> 0` để băm không âm: `%` của số âm trong JS trả số âm, tức một chỉ số
 * ngoài mảng và một nhãn **không màu**.
 */
export function mauNhan(nhan: string): string {
  let h = 0;
  for (const c of nhan) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return LOP_NHAN[h % LOP_NHAN.length] ?? LOP_NHAN[0]!;
}

/**
 * **Màu icon ưu tiên** — năm mức của bảng 0.1, năm token.
 *
 * Icon tô bằng `currentColor` (xem `vo/icon.tsx`), nên "màu icon" là `text-*`.
 * Không cặp nào có nền riêng: icon nằm trên nền thẻ. Lưới tương phản đo từng màu
 * này với **cả ba** nền (`nen`, `nen-lop`, `nen-noi`) ở cả hai chế độ.
 *
 * Màu **không** là thông tin duy nhất: hình của năm mức đã khác nhau, và nhãn
 * tiếng Việt của máy chủ đi vào `aria-label` (d.381).
 */
export const LOP_UU_TIEN: Record<UuTien, string> = {
  urgent: 'text-loi',
  high: 'text-canh',
  medium: 'text-neutral-700',
  low: 'text-neutral-600',
  none: 'text-neutral-500',
};

/**
 * **Màu icon trạng thái ticket** — bảy trạng thái của bảng 0.1, năm màu của hệ
 * thiết kế (`DESIGN.md`): Cần làm (gồm `backlog`) xám, Đang làm vàng, Chờ
 * kiểm chứng xanh dương, Xong tím (màu nhấn), Huỷ (gồm `duplicate`) xám.
 *
 * Như `LOP_UU_TIEN`: icon tô bằng `currentColor`, nên màu là `text-*`; lưới
 * tương phản đo từng màu với cả ba nền ở cả hai chế độ (mức 3:1 — thành phần
 * giao diện, và hình của từng trạng thái đã khác nhau nên màu không là thông tin
 * duy nhất).
 */
export const LOP_TRANG_THAI: Record<TrangThaiTicket, string> = {
  backlog: 'text-tt-cho',
  todo: 'text-tt-cho',
  in_progress: 'text-tt-dang-lam',
  verifying: 'text-tt-kiem-chung',
  done: 'text-tt-xong',
  canceled: 'text-tt-huy',
  duplicate: 'text-tt-huy',
};

/**
 * **Màu chấm trạng thái agent** — năm trạng thái của bảng 0.1 (`DESIGN.md`,
 * BAT-66): Đang làm xanh (`tot`), Chờ Chủ vàng (`canh`), Đứng đỏ (`loi` — cùng
 * nghĩa với chấm agent của sidebar), Rảnh xám, Đã tắt xám tắt (`tt-huy`).
 *
 * Như `LOP_TRANG_THAI`: chấm tô bằng `currentColor`, nên màu là `text-*`; lưới
 * tương phản đo từng màu với cả ba nền ở cả hai chế độ (mức 3:1). Hình của năm
 * trạng thái khác nhau (`ChamTrangThaiAgent`), nên màu không là thông tin duy nhất.
 */
export const LOP_TRANG_THAI_AGENT: Record<TrangThaiAgent, string> = {
  busy: 'text-tot',
  waiting_owner: 'text-canh',
  stalled: 'text-loi',
  idle: 'text-chu-mo',
  disabled: 'text-tt-huy',
};

/** **Màu mức gấp Cần Chủ** — đỏ / vàng / xám (`DESIGN.md`). */
export const LOP_MUC_GAP: Record<MucDoKhan, string> = {
  urgent: 'text-gap-khan',
  today: 'text-gap-hom-nay',
  later: 'text-gap-sau',
};

/**
 * **Viết tắt của người đang cầm** — hai ký tự, cho ô tròn avatar trên thẻ.
 *
 * Không có ảnh đại diện nào trong SPEC (mục 3 không có cột ảnh), nên avatar là
 * chữ. Trống (bậc 5 của 19.1, "không ai cầm") ⇒ `—`: một ô tròn rỗng nhìn giống
 * "đang tải", còn một dấu gạch nói đúng điều chủ cần thấy.
 */
export function vietTat(nguoi: TacGiaRa | null, nhan_chu: string): string {
  if (nguoi === null) return '—';
  const ten = nguoi.loai === 'agent' ? (nguoi.agentId ?? 'agent') : nhan_chu;
  /*
   * Lấy chữ đầu của **hai từ đầu** (`W-builder` → `WB`, `Chủ (chủ)` → `TC`). Một
   * `slice(0, 2)` thô sẽ cho `W-` cho mọi agent có tiền tố `W-`, tức mọi worker
   * trùng viết tắt.
   */
  const tu = ten
    // Bỏ dấu câu trước khi tách: `Chủ (chủ)` phải ra `TC`, không `T(`.
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, '')
    .split(/[\s\-_.]+/)
    .filter((t) => t !== '');
  if (tu.length === 0) return '—';
  if (tu.length === 1) return (tu[0] ?? '').slice(0, 2).toUpperCase();
  return `${(tu[0] ?? '').slice(0, 1)}${(tu[1] ?? '').slice(0, 1)}`.toUpperCase();
}
