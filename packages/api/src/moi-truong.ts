/** Binding của Worker — khai trong `wrangler.toml`. */
export interface Env {
  /** D1: cơ sở dữ liệu chính. Lệnh ĐỌC đi thẳng vào đây. */
  DB: D1Database;
  /** Durable Object cửa ghi, một cái cho mỗi workspace. */
  WORKSPACE_GATE: DurableObjectNamespace;
  /**
   * Durable Object đếm request cho mỗi token — SPEC mục 13 (600 req/phút mỗi
   * token). Phải là DO, **không** đếm trong bộ nhớ Worker: một Worker chạy trên
   * rất nhiều isolate, mỗi isolate một bộ đếm riêng, nên giới hạn thật sẽ là
   * 600 × số isolate.
   */
  GIOI_HAN_TOKEN: DurableObjectNamespace;

  /**
   * **Đường tạm cho xác thực chủ ở phần 1.** SPEC mục 15 nói chủ đăng nhập bằng
   * mật khẩu + TOTP; đó là **phần 6**. Phần 1 cần một cách đủ để test các luật
   * "chỉ chủ làm được", nên dùng một token chủ trong secret binding.
   *
   * Không đặt trong `wrangler.toml` và không commit (danh sách cấm CLAUDE.md
   * mục 5): chủ tự đặt bằng `wrangler secret put TOKEN_CHU`. Để trống thì
   * **không có đường nào vào với tư cách chủ** (fail-closed).
   */
  TOKEN_CHU?: string | undefined;

  /**
   * **Token GitHub** để xác minh bằng chứng `commit` — SPEC mục 7 d.206, d.220.
   *
   * Secret, chủ tự đặt bằng `wrangler secret put GITHUB_TOKEN`; **không** nằm
   * trong `wrangler.toml`, **không** commit, **không** bao giờ được in ra
   * (danh sách cấm CLAUDE.md mục 5). Để trống thì xác minh commit đi đường
   * `pending` của d.220 ("token GitHub có vấn đề") thay vì nổ — xem
   * `nguon-github.ts`.
   */
  GITHUB_TOKEN?: string | undefined;

  /**
   * **Bot token Telegram** — SPEC mục 12 d.339 ("bot token và chat id **cấu hình
   * phía server**").
   *
   * Secret, chủ tự đặt bằng `wrangler secret put TELEGRAM_BOT_TOKEN`; **không**
   * nằm trong `wrangler.toml`, **không** commit, **không** bao giờ được in ra
   * (danh sách cấm CLAUDE.md mục 5). Telegram đặt token **trong đường dẫn** của
   * API, nên một lần log URL là một lần rò secret — xem `nguon-telegram.ts`.
   *
   * **Thiếu nó (hoặc thiếu `TELEGRAM_CHAT_ID`) thì Baton KHÔNG gửi và KHÔNG
   * lỗi**: tin vẫn vào kho `thong_bao` (chuông trong app, d.339),
   * `gui_telegram_luc` để NULL, và luồng chính vẫn thành công. Đây là hành vi
   * **bắt buộc**, không một tiện nghi: một lệnh ghi của agent không bao giờ được
   * trượt vì chủ chưa đặt secret.
   */
  TELEGRAM_BOT_TOKEN?: string | undefined;

  /**
   * **Chat id của chủ** — SPEC mục 12 d.339 ("**1 chat** của chủ"). Một chat, nên
   * một giá trị; không danh sách. Thiếu nó thì như thiếu token — xem trên.
   */
  TELEGRAM_CHAT_ID?: string | undefined;

  /**
   * **URL công khai của chính Baton** — chỗ dựng link của SPEC mục 12 d.347
   * ("mỗi tin có **link thẳng** tới đúng thẻ hoặc ticket").
   *
   * Baton **không biết** tên miền của chính nó trong một lượt `scheduled`: Cron
   * Trigger không có `Request` nào, nên không có `Host` để suy ra. Nên nó phải là
   * cấu hình. **Không** secret (một URL công khai không phải secret), nhưng vẫn
   * tuỳ chọn: **thiếu nó thì tin vẫn gửi, chỉ không có link**. Một tin không có
   * link vẫn báo được việc gấp; một tin không gửi thì không.
   *
   * SPEC không chốt tên hay dạng của cấu hình này — `cau-hoi-spec.md` **#116**.
   */
  BATON_URL_CONG_KHAI?: string | undefined;

  /**
   * **Số vòng PBKDF2 khi ĐẶT mật khẩu chủ** — SPEC mục 15 d.415,
   * `quyet-dinh.md` 01/10 Q6 (băm PBKDF2-SHA256).
   *
   * Để trống thì dùng hằng sản phẩm `SO_VONG_PBKDF2` = **100.000** — đó là
   * **trần của Cloudflare Workers** cho PBKDF2 `iterations` (vượt trần thì
   * `deriveBits` ném và `POST /v1/khoi-tao` trả 500, lỗi thật gặp lúc deploy
   * 06/10). Binding này tồn tại để **test** hạ con số xuống (bộ test đăng nhập
   * băm hàng chục lần); hằng của sản phẩm **không** bị hạ. Giá trị lạ hoặc dưới
   * 1.000 bị bỏ qua, rơi về mức sản phẩm — xem `soVongHienHanh`. Trên bản deploy
   * thật, binding này **không cần đặt**, và đặt cao hơn 100.000 là dựng lại lỗi 500.
   */
  PBKDF2_SO_VONG?: string | undefined;

  /**
   * **Workers Static Assets** — bản build của `packages/web` (SPEC mục 14).
   *
   * Khai bằng `[assets] binding = "ASSETS"` trong `wrangler.toml`. `/v1/*` đi vào
   * Hono; mọi đường khác trả SPA qua binding này — xem `phuc-vu-spa.ts`.
   *
   * **Tuỳ chọn, và cố ý tuỳ chọn.** Bộ test tầng máy chủ chạy Worker mà không
   * dựng thư mục asset nào (test ở đó không được phụ thuộc `vite build` đã chạy
   * chưa), và một bản deploy cũ có thể chưa gắn asset. Không có binding thì đường
   * lạ trả **404 JSON**, không ném.
   */
  ASSETS?: Fetcher | undefined;

  /**
   * **R2 — sao lưu tự động hằng ngày, giữ 14 bản** (SPEC mục 15 d.429, 19.12 câu 7
   * "đặt ở nơi lưu trữ khác DB chính"). Khai bằng `[[r2_buckets]] binding =
   * "SAO_LUU"` trong `wrangler.toml`; xem `sao-luu.ts`.
   *
   * **Tuỳ chọn, cố ý:** thiếu binding thì nhịp sao lưu **bỏ qua và ghi log**, không
   * ném — các việc cron khác vẫn chạy — và báo cáo sáng/tối có **một dòng** nói sao
   * lưu chưa bật (chọn hướng an toàn: chủ phải biết mình không có bản sao lưu nào).
   */
  SAO_LUU?: R2Bucket | undefined;

  /**
   * Cờ mở các đường chỉ dành cho test (vd `/v1/_loi/:ma`). Chỉ bật trong
   * Miniflare khi chạy test; **deploy thật để trống** nên đường test là 404.
   */
  CHO_DUONG_TEST?: string | undefined;
}

/** Đường chỉ dành cho test có được mở không. */
export function choDuongTest(env: Env): boolean {
  return env.CHO_DUONG_TEST === 'co';
}
