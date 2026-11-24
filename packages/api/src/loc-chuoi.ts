/**
 * **Lọc một chuỗi trước khi nó đi vào log, DB hay UI** — SPEC mục 15 d.417, danh
 * sách cấm `CLAUDE.md` mục 5.
 *
 * ## Vì sao hàm này có một file riêng
 *
 * Nó sinh ra ở `nguon-telegram.ts` (phần 7 lượt 1) vì Telegram đặt bot token
 * **trong đường dẫn** (`/bot<token>/sendMessage`), nên một chuỗi lỗi mang URL là
 * một lần rò secret. Nhưng từ phần 7 việc B có **hai** nơi cần nó, và nơi thứ hai
 * **không được** nhập `nguon-telegram.ts`:
 *
 *   * `cron-thong-bao.ts` — log lỗi của một lượt gửi (nó *là* chặng gọi mạng);
 *   * `cron-bao-cao.ts` — log lỗi của một lượt sinh báo cáo. File đó **không gọi
 *     mạng** và phải nằm trong hàng rào `no-restricted-syntax` của `eslint.config.js`
 *     ("cửa ghi và mọi file không phải chặng gọi mạng thì không được nhập
 *     `nguon-*.ts`"). Nhập `nguon-telegram.ts` chỉ để lấy một hàm thuần sẽ buộc
 *     phải mở một ngoại lệ lint cho nó — và ngoại lệ đó tắt luôn vế cấm `fetch`,
 *     tức đổi một hàng rào thật lấy một dòng `import`.
 *
 * Nên hàm **thuần** này ở một file trung lập, không phụ thuộc gì. `nguon-telegram.ts`
 * xuất lại nó để chỗ gọi cũ (và test của lượt 1) không phải đổi.
 */

/** Trần độ dài của một chuỗi đi vào log, DB hay UI. */
export const TRAN_LY_DO = 200;

/**
 * Cắt ngắn và **bỏ mọi đoạn trông như một bot token** khỏi một chuỗi.
 *
 * Bot token của Telegram có dạng `<số>:<35 ký tự chữ-số-gạch>`. Mẫu dưới đây bắt
 * đúng hình đó (và rộng hơn một chút: từ 20 ký tự sau dấu hai chấm). Đây là hàng
 * rào **thứ hai**: hàng rào thứ nhất là không bao giờ đưa URL hay thân phản hồi
 * thô vào chuỗi nào. Giữ cả hai vì chuỗi ở đây tới từ bên ngoài, không từ ta, nên
 * ta không khai được nó chứa gì.
 */
export function locChuoiAnToan(s: string): string {
  const da_loc = s.replace(/\d{5,}:[A-Za-z0-9_-]{20,}/g, '(đã lọc)');
  return da_loc.length > TRAN_LY_DO ? `${da_loc.slice(0, TRAN_LY_DO)}…` : da_loc;
}
