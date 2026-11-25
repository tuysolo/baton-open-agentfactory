/**
 * **Ranh giới `/v1/*` ↔ SPA** — một Worker phục vụ cả API và giao diện chủ.
 *
 * `decisions.md` 05/10 (CoS chốt): giao diện là một SPA React, phục vụ bằng
 * **Workers Static Assets** cùng Worker Hono này. `/v1/*` là API, **mọi đường
 * khác trả SPA**.
 *
 * ## Ai thật sự phục vụ SPA: HAI TẦNG, và tầng này là tầng thứ hai
 *
 * **Sửa một lời khai sai của lượt trước.** Bản đầu của file này khẳng định
 * `phucVuSpa` là lớp *duy nhất* làm việc được, vì `canFetch` của Asset Worker tự
 * hạ `not_found_handling` xuống `"none"`. Phép đọc mã đó **đúng nhưng thiếu một
 * điều kiện**, và reviewer bắt được:
 *
 * ```
 * // miniflare/dist/src/workers/assets/assets.worker.js, nhánh canFetch
 * configuration.has_static_routing || (… && Sec-Fetch-Mode === 'navigate')
 *   || (configuration = { ...configuration, not_found_handling: 'none' })
 * ```
 *
 * Nó chỉ hạ khi **`!has_static_routing`**. Và `has_static_routing` bật từ
 * `routerConfig.static_routing` (`miniflare/dist/src/index.js:52462`), thứ mà
 * `wrangler` dựng từ **chính dòng `run_worker_first = ["/v1/*"]`** ta tự thêm vào
 * `wrangler.toml` (`wrangler/wrangler-dist/cli.js:160750` →
 * `parseStaticRouting`). Nên ở production, thứ tự thật là:
 *
 *   1. `static_routing.user_worker` khớp `/v1/*` → **Worker** (Hono). Đây là lớp
 *      chắn cứng cho API, và nó đứng trước cả phép hỏi asset.
 *   2. Còn lại → `canFetch`, lúc này **giữ** `not_found_handling`, nên
 *      `/t/BAT-12` khớp `index.html` → **Asset Worker** trả SPA.
 *
 * Tức **ở production `phucVuSpa` gần như không bao giờ chạy.** Nó vẫn được giữ,
 * có chủ ý, vì hai việc nó làm mà cấu hình không làm được:
 *
 *   * **Lớp phòng vệ.** Ba trạng thái làm tầng 1 biến mất mà không ai thấy: một
 *     lượt sau đổi `run_worker_first` thành `true`/bỏ hẳn (mất static routing ⇒
 *     `canFetch` hạ `not_found_handling` ⇒ đường lạ rơi xuống Worker **thật**),
 *     một bản deploy quên build `packages/web` (không có `index.html` ⇒ asset
 *     không khớp gì), và `wrangler dev` với cấu hình khác. Ở cả ba, không có
 *     `phucVuSpa` thì chủ tải lại trang ở `/t/BAT-12` nhận **401 JSON** của cổng
 *     `xacThuc` — xem `## Vì sao không phải app.notFound` dưới đây.
 *   * **Lớp duy nhất test được.** Hai khoá trong `wrangler.toml` không có ca test
 *     nào: `wrangler` bị chặn trong môi trường này, nên không ai chạy được một
 *     lần nào để xem chúng có tác dụng thật. Luật "`/v1/*` không ra HTML, đường
 *     lạ ra SPA" vì vậy được canh ở **mã**, nơi `npm test` chạm tới được.
 *
 * ## Vì sao không phải `app.notFound`
 *
 * Cổng xác thực là `app.use('*', xacThuc)` và nó gắn cho **mọi** đường, chỉ bỏ
 * qua danh sách đóng `DUONG_CONG_KHAI`. Nên một đường như `/t/BAT-12` ăn **401**
 * ở cổng đó và **không bao giờ** tới `app.notFound`. Chia đường phải xảy ra
 * **trước** Hono — và nó xảy ra ở `fetch` của `src/index.ts`.
 *
 * ## Luật, viết thẳng
 *
 *   * `/v1` và `/v1/...` → **Hono**. Luôn. Không bao giờ ra HTML.
 *   * Mọi đường khác, `GET`/`HEAD` → **SPA** (`index.html`), 200.
 *   * Mọi đường khác, phương thức khác → **404 JSON** của mục 13. Một `POST` tới
 *     `/khong-co-trang-nay` không phải một lần chủ mở trang; trả `index.html` cho
 *     nó là nói "ok" với một request không có nghĩa.
 *   * Không có binding `ASSETS` (bản deploy chưa gắn asset, hoặc bộ test của tầng
 *     máy chủ) → **404 JSON**, không ném. Fail-closed và không sập.
 */

import { BatonError } from '@baton/shared';
import type { Env } from './moi-truong.js';

/**
 * Tiền tố của API. **Không** `'/v1'` trần: `startsWith('/v1')` cũng khớp
 * `/v1abc`, và một đường như vậy phải là SPA, không phải API.
 */
export const TIEN_TO_API = '/v1/';

/**
 * **Chuẩn hoá đường TRƯỚC khi quyết định API hay SPA.**
 *
 * So chuỗi trần (`duong.startsWith('/v1/')`) neo chặt theo **chữ**, và ba dạng
 * dưới đây là những request **nhằm gọi API** nhưng viết khác đi một chút:
 *
 *   * `/V1/ticket`    — đường URL phân biệt chữ hoa/thường, nên Hono không khớp;
 *   * `//v1/ticket`   — `new URL(...).pathname` giữ nguyên hai gạch chéo;
 *   * `/v1%2fticket`  — `URL` **không** giải mã `%2f` trong `pathname`.
 *
 * Cả ba đều không khớp một handler nào, nên chúng **không** là một lỗ bảo mật
 * (không có đường nào bị đi vòng). Nhưng nếu không chuẩn hoá thì cả ba rơi xuống
 * nhánh SPA và nhận **HTML 200** — đúng cái mà luật 1 của `ranh-gioi-spa.test.ts`
 * tồn tại để chặn: "một API trả HTML cho đường sai là một API mà CLI không phân
 * biệt được *đường tôi gõ sai* với *máy chủ hỏng*". Một người viết script gõ sai
 * hoa/thường sẽ đi dò một trang HTML thay vì đọc `{"error":"NOT_FOUND"}`.
 *
 * Nên luật là: **cả không gian tên `/v1` thuộc API, ở mọi cách viết.** Hệ quả
 * phía SPA bằng không — không một đường giao diện nào của mục 14 nằm trong
 * `/v1`, và `laDuongApi` chỉ trả về một `boolean`: request chuyển cho Hono
 * **nguyên văn**, không bị viết lại, nên Hono vẫn trả 404/401 đúng như nó nên.
 */
export function chuanHoaDuongApi(duong: string): string {
  // Gộp gạch chéo đầu: `//v1/x` → `/v1/x`.
  let d = duong.replace(/^\/+/, '/');
  try {
    d = decodeURIComponent(d);
  } catch {
    // Dãy `%` hỏng thì giữ nguyên — một đường không giải mã được vẫn không
    // được phép lọt sang SPA chỉ vì nó hỏng.
  }
  // Giải mã có thể vừa sinh ra gạch chéo mới (`/%2Fv1/x` → `//v1/x`).
  d = d.replace(/^\/+/, '/');
  return d.toLowerCase();
}

/** Đường này thuộc API (Hono) chứ không phải SPA? */
export function laDuongApi(duong: string): boolean {
  const chuan = chuanHoaDuongApi(duong);
  return chuan === '/v1' || chuan.startsWith(TIEN_TO_API);
}

/** Đường vào `index.html` của bản build web — một hằng, để test ghim đúng nó. */
export const DUONG_SPA = '/index.html';

/**
 * Trả SPA cho một đường không thuộc API.
 *
 * Gọi asset **hai chặng**, và chặng thứ hai không phải cho đẹp: chặng một chuyển
 * nguyên request (để một file thật như `/favicon.ico` hay `/assets/x-123.js` vẫn
 * ra đúng file nếu nó tới được tận đây); chỉ khi chặng một nói "không có"
 * (404) mới trả `index.html`. Nhờ vậy hành vi **không** phụ thuộc khoá
 * `not_found_handling` trong `wrangler.toml` — khoá đó chỉ còn là một lớp thứ hai,
 * và nó là thứ duy nhất trong lượt này **không xác minh được** trong phòng sạch
 * (không chạy `wrangler` được).
 */
export async function phucVuSpa(request: Request, env: Env): Promise<Response> {
  const assets = env.ASSETS;
  if (assets === undefined) return khongTimThayJson();

  if (request.method !== 'GET' && request.method !== 'HEAD') return khongTimThayJson();

  const thu = await assets.fetch(request);
  if (thu.status !== 404) return thu;

  const url = new URL(request.url);
  url.pathname = DUONG_SPA;
  url.search = '';
  return assets.fetch(new Request(url, { method: request.method, headers: request.headers }));
}

/**
 * **Asset ĐÚNG đường, KHÔNG có bước rơi về `index.html`** — dành riêng cho việc
 * kiểm một URL deploy trỏ vào chính Baton (SPEC mục 7 d.207, xem
 * `tuyen-noi-bo.ts`).
 *
 * Vì sao phải có một hàm thứ hai cạnh `phucVuSpa` thay vì dùng lại nó: chặng 2 của
 * `phucVuSpa` trả `index.html` cho **mọi** đường không khớp file nào — đúng cho một
 * SPA (chủ tải lại trang ở `/t/BAT-12` phải thấy ứng dụng), và **sai hẳn** cho một
 * phép kiểm sống. Nếu đường nội bộ đi qua nó thì `deploy https://<host-baton>/bat-ky-duong-nao`
 * luôn nhận **200**, tức mở được cổng Xong mà không chứng minh được một đường nào
 * của Baton còn sống. Reviewer bắt đúng chỗ này (13/10): ca test cũ chỉ "đúng" vì
 * bộ test không gắn binding `ASSETS` nào.
 *
 * Nên ở đây: hỏi asset **đúng đường đã gửi**, trả nguyên mã của nó. Một file thật
 * (`/`, `/index.html`, `/assets/x-123.js`) vẫn ra 200; một đường không có ra 404 và
 * bằng chứng deploy **trượt** — đúng ý nghĩa của cổng.
 */
export async function assetDungDuong(request: Request, env: Env): Promise<Response> {
  const assets = env.ASSETS;
  if (assets === undefined) return khongTimThayJson();
  return await assets.fetch(request);
}

/** 404 đúng dạng thân lỗi của SPEC mục 13 — cùng hình với `khongTimThay`. */
function khongTimThayJson(): Response {
  const loi = new BatonError('NOT_FOUND');
  return new Response(JSON.stringify(loi.than()), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
