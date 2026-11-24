/**
 * **Tín hiệu `STOP` → mã thoát 3** — SPEC mục 13 d.380 ("3 là nhận tín hiệu
 * `STOP`"), mục 6 d.193 ("Lần gọi kế tiếp của agent nhận về tín hiệu `STOP`;
 * agent phải ngưng việc và gửi một mục `result` hoặc `error`").
 *
 * **Một chỗ duy nhất quyết mã 3.** Hai đường API mang trường `tin_hieu`:
 * `GET /v1/tasks` (mục 13 d.360) và `POST /v1/luot-giao/:id/heartbeat` (d.362
 * "Nhịp tim; **trả về tín hiệu nếu có** (`STOP`…)"). Lệnh nào đọc một thân có
 * `tin_hieu` thì gọi `maThoatCuaTinHieu` trên đúng thân đó; lệnh nào không có
 * trường ấy thì **không** tự phát mã 3 — `STOP` chỉ ra từ chỗ server nói ra.
 *
 * Mã `STOP` lấy từ bảng mục 0.1 của `@baton/shared` (`tin_hieu`), không chép một
 * chuỗi thứ hai: thêm một tín hiệu ở SPEC mà quên chỗ này là **lỗi biên dịch**.
 */

import { MA_THOAT, nhan, type MaThoat, type TinHieu } from '@baton/shared';

/**
 * Mã tín hiệu `STOP` của bảng 0.1 — d.381 ("nhận mã tiếng Anh").
 *
 * Kiểu khai là **`TinHieu`** (`keyof typeof TIN_HIEU` của `ma-nhan.ts`), không
 * phải `string`: đó là thứ làm lời khai ở đầu file thành sự thật — đổi tên mã
 * trong bảng 0.1 mà quên dòng này là **lỗi biên dịch**, không phải một chuỗi
 * lệch im lặng.
 */
export const TIN_HIEU_STOP: TinHieu = 'STOP';

/**
 * Mã thoát **3** nếu thân phản hồi mang `STOP`, không thì `undefined` (để lệnh
 * giữ mã 0).
 */
export function maThoatCuaTinHieu(tin_hieu: readonly string[] | undefined): MaThoat | undefined {
  return tin_hieu !== undefined && tin_hieu.includes(TIN_HIEU_STOP)
    ? MA_THOAT.nhan_stop
    : undefined;
}

/**
 * Dòng người-đọc cho các tín hiệu nhận được. Nhãn tiếng Việt **kèm mã tiếng
 * Anh** — d.381, cùng nếp với mọi dòng khác của CLI.
 */
export function dongTinHieu(tin_hieu: readonly string[]): string[] {
  if (tin_hieu.length === 0) return [];
  const ds = tin_hieu.map((t) => `${nhan('tin_hieu', t)} (${t})`).join(', ');
  return [
    `Tín hiệu: ${ds}`,
    tin_hieu.includes(TIN_HIEU_STOP)
      ? 'Phải ngưng việc ngay và gửi một mục result hoặc error (SPEC mục 6).'
      : '',
  ].filter((d) => d !== '');
}
