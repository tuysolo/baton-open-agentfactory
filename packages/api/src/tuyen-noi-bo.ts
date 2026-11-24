/**
 * **Đường nội bộ: khi URL deploy trỏ vào CHÍNH Baton** — SPEC mục 7 d.207
 * ("Server gọi URL; mã 2xx hoặc 3xx là đạt").
 *
 * ## Nguyên nhân thật của lỗi 13/10, viết ra để không ai sửa sai chỗ
 *
 * Chủ gửi `baton evidence BAT-4 deploy "https://baton-api.<...>.workers.dev/health"`
 * và nhận **"URL deploy trả mã HTTP 404"**, trong khi `curl` cùng URL **từ ngoài**
 * trả 200. Hai điều phải đúng cùng lúc mới ra được chuyện đó:
 *
 *   1. **Không có route `/health`.** Đường kiểm tra sống của Baton là
 *      **`/v1/health`** (`index.ts`). `/health` không thuộc `/v1/*`, nên nó rơi vào
 *      nhánh SPA (`phuc-vu-spa.ts`): từ ngoài, Asset Worker trả `index.html` →
 *      **200**. Tức 200 của `curl` **không** nói "/health sống", nó nói "trang SPA
 *      có". Đó là lý do cùng lệnh với `https://sample.com/` thì Đạt.
 *   2. **Subrequest của một Worker tới chính hostname của nó KHÔNG được chính
 *      Worker đó phục vụ.** Lần `fetch` ở chặng 2 (`nguon-deploy.ts`) đi ra từ
 *      trong Worker tới `https://baton-api.<...>.workers.dev/health`; request đó
 *      **không** đi lại qua `fetch` handler của Baton và **không** đi qua lớp
 *      static-asset phía trước nó, nên không ai trả `index.html` cho nó — kết quả
 *      là **404**.
 *
 * Bằng chứng cho (2) nằm ngay trong mã: không một nhánh nào của `index.ts` hay
 * `phuc-vu-spa.ts` trả 404 cho `GET /health` **khi có binding `ASSETS`** (chặng 1
 * của `phucVuSpa` trả 404 thì chặng 2 trả `index.html`, và chỉ khi **không có**
 * binding mới ra 404 JSON). Nên mã 404 mà chặng 2 đọc được **không do mã của
 * Baton sinh ra**: request chưa bao giờ tới mã của Baton.
 *
 * ## Cách sửa đã chọn, và vì sao chọn nó
 *
 * Host của URL deploy **trùng host công khai của chính Baton**
 * (`BATON_URL_CONG_KHAI`) ⇒ **không gọi mạng**, mà **định tuyến request vào chính
 * router của app trong tiến trình** và lấy mã HTTP thật từ đó.
 *
 * Vì sao hướng này chứ không phải một hướng khác:
 *   * **"Gọi mạng nhưng thêm header rồi chịu 404"** — không sửa được gì: cái 404
 *     ấy không do mã của Baton sinh, nên không có header nào đổi được nó.
 *   * **"Coi 404 của chính mình là đạt"** — là bỏ hẳn luật d.207 cho đúng cái URL
 *     mà chủ dùng nhiều nhất.
 *   * **"Một binding `service` trỏ về chính Worker"** — cần `wrangler` và một lần
 *     deploy để kiểm, mà `wrangler` bị chặn trong phòng sạch; nó cũng không test
 *     được bằng `npm test`.
 * Đường trong tiến trình thì **đo được bằng test**, không cần mạng, và trả **mã
 * HTTP thật của chính Baton** — tức đúng câu mà d.207 hỏi.
 *
 * ## Nó KHÔNG phải cửa lách lớp chặn host của d.207
 *
 * Bốn hàng rào, cần đủ cả bốn:
 *   1. Chỉ áp dụng khi host của URL **bằng đúng** host của `BATON_URL_CONG_KHAI`
 *      (so sánh host đã chuẩn hoá, không so tiền tố, không so hậu tố).
 *   2. `laHostBiChan` + "chỉ `https:`" vẫn chạy **trước** (xem `nguon-deploy.ts`),
 *      nên một `BATON_URL_CONG_KHAI` trỏ vào localhost cũng không mở được đường
 *      này.
 *   3. `BATON_URL_CONG_KHAI` **không** đặt ⇒ không có đường nội bộ nào, hành vi
 *      **y như cũ** (fetch ra ngoài).
 *   4. Request nội bộ đi **đúng cổng xác thực** của app (`app.use('*', xacThuc)`):
 *      nó không mang token nào, nên nó chỉ đọc được những đường công khai — nó
 *      **không** đọc được dữ liệu của workspace nào.
 *
 * Không có vòng lặp vô hạn: request nội bộ luôn là `GET`, còn đường gửi bằng chứng
 * là `POST`, nên không `GET` nào dựng được một lần xác minh thứ hai.
 */

import type { Env } from './moi-truong.js';

/**
 * Đường kiểm nội bộ: nhận một `GET` và trả mã HTTP **của một route thật** của
 * Baton.
 *
 * **Không** phải hàm `fetch` của Worker (siết sau review 13/10): nhánh SPA của nó
 * rơi về `index.html` cho **mọi** đường không khớp file nào, nên một URL deploy trỏ
 * tới bất kỳ đường nào trên host Baton cũng sẽ nhận **200** — tức mở được cổng Xong
 * mà không chứng minh được đường nào còn sống. Hàm đăng ký ở `index.ts` vì vậy chia
 * `/v1/*` → Hono, còn lại → asset **đúng đường** (không có bước rơi về
 * `index.html`), nên một đường không tồn tại ra 404 và bằng chứng **trượt**.
 */
export type TuyenNoiBo = (request: Request, env: Env) => Promise<Response>;

/**
 * Hàm phục vụ của chính Worker này, do `index.ts` đăng ký **một lần khi nạp
 * module**.
 *
 * Vì sao một biến mức module thay vì `import` thẳng `index.ts`: `index.ts` đã nhập
 * `xac-minh-bang-chung.ts` (chặng 2), nên nhập ngược lại là một vòng nhập giữa hai
 * module mà thứ tự khởi tạo của nó phụ thuộc bundler. Một chỗ đăng ký thì chiều
 * phụ thuộc chỉ còn một hướng.
 *
 * `null` = chưa đăng ký (vd một bộ test chỉ nhập module này) ⇒ không có đường nội
 * bộ, mọi URL đi đường `fetch` như cũ.
 */
let tuyen: TuyenNoiBo | null = null;

/** Đăng ký đường phục vụ của chính Worker. Chỗ gọi duy nhất: `src/index.ts`. */
export function datTuyenNoiBo(t: TuyenNoiBo | null): void {
  tuyen = t;
}

/** Đường nội bộ hiện hành, hoặc `null` khi chưa đăng ký. */
export function tuyenNoiBo(): TuyenNoiBo | null {
  return tuyen;
}

/**
 * Host công khai của chính Baton, đã chuẩn hoá (chữ thường, bỏ một dấu chấm
 * cuối), hoặc `null` khi `BATON_URL_CONG_KHAI` thiếu / không đọc được.
 *
 * Không nổ khi cấu hình sai: một giá trị rác ⇒ `null` ⇒ hành vi như cũ.
 */
export function hostCongKhaiCuaBaton(env: Env): string | null {
  const tho = env.BATON_URL_CONG_KHAI;
  if (typeof tho !== 'string' || tho.trim().length === 0) return null;
  try {
    return chuanHoaHost(new URL(tho.trim()).hostname);
  } catch {
    return null;
  }
}

/** Host để **so sánh**: chữ thường, bỏ ngoặc vuông của IPv6 và một dấu chấm cuối. */
export function chuanHoaHost(host: string): string {
  const t = host.toLowerCase().replace(/^\[|\]$/g, '');
  return t.endsWith('.') ? t.slice(0, -1) : t;
}
