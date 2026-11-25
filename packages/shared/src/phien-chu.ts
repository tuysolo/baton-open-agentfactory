/**
 * **Phiên đăng nhập của chủ** — SPEC mục 15 d.415: "Phiên đăng nhập **30 ngày**,
 * có nút **đăng xuất mọi nơi**".
 *
 * Khác hẳn `phien.ts`: *phiên* ở đó là phiên **làm việc của một agent** (mục 6).
 * Ở đây là phiên **đăng nhập web của chủ**, và hai thứ không có liên hệ nào —
 * agent **không đăng nhập web** (d.416).
 *
 * ## Id phiên lưu dạng BĂM, và băm là SHA-256
 *
 * Id phiên là 32 byte ngẫu nhiên do máy chủ sinh, y hình với token agent, nên
 * lý lẽ của `decisions.md` 01/10 ("băm token agent bằng SHA-256, không KDF
 * chậm") áp **nguyên vẹn** ở đây, và đó là điều đã kiểm lại chứ không chép:
 *
 *   * **Không có gì để dò từ điển.** Giá trị là ngẫu nhiên 256 bit do máy sinh,
 *     không phải thứ người đặt. KDF chậm bảo vệ *mật khẩu*; ở đây nó chỉ làm
 *     mỗi request chậm đi.
 *   * **Một lần tra khoá.** Cookie tới trong **mọi** request của web, nên phép
 *     tra phải là một `SEARCH` trên khoá chính (`chu_phien.bam`). KDF chậm thì
 *     muối phải nằm cùng dòng, tức phải **quét** bảng phiên để tìm dòng nào
 *     khớp.
 *   * **Vì sao vẫn phải băm chứ không lưu thẳng:** một bản sao lưu D1 hay một
 *     lần đọc lộ bảng `chu_phien` sẽ là một tập cookie **dùng được ngay**. Băm
 *     thì không đảo được, nên dữ liệu nghỉ không chứa thứ đăng nhập được.
 *
 * Hệ quả cố ý: giá trị thô **chỉ** tồn tại trong cookie của chủ. Máy chủ không
 * có đường nào in nó ra (nếp d.417).
 */

/** Số byte ngẫu nhiên của một id phiên. 32 byte = 256 bit. */
export const SO_BYTE_ID_PHIEN = 32;

/** Hạn một phiên đăng nhập — **30 ngày**, d.415. */
export const PHIEN_CHU_MS = 30 * 24 * 60 * 60 * 1000;

/** Tên cookie mang id phiên. */
export const COOKIE_PHIEN_CHU = 'baton_phien';

/**
 * Sinh id phiên mới. Trả chuỗi **hex**, không base64url: cookie value có một
 * danh sách ký tự cấm (`,` `;` `=` khoảng trắng), và hex thì không bao giờ chạm
 * vào đó nên không cần mã hoá thêm một lớp.
 */
export function sinhIdPhien(): string {
  const bytes = new Uint8Array(SO_BYTE_ID_PHIEN);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Băm id phiên bằng SHA-256 → hex 64 ký tự. Xem đầu file cho lý lẽ. */
export async function bamIdPhien(id: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Giá trị header `Set-Cookie` cho một phiên vừa đăng nhập.
 *
 * Từng cờ, và vì sao:
 *   * `HttpOnly` — JavaScript của trang **không** đọc được. Một lỗ XSS ở phần 6
 *     thì vẫn không lấy được phiên đi.
 *   * `Secure` — chỉ gửi qua HTTPS, nên cookie không đi qua một chặng HTTP trần.
 *   * `SameSite=Lax` — request **từ site khác** bằng POST không mang cookie, tức
 *     không có CSRF trên các đường ghi. `Strict` thì mọi liên kết từ ngoài vào
 *     Baton đều hiện ra như chưa đăng nhập; `Lax` giữ GET điều hướng còn đăng
 *     nhập, và các đường ghi của Baton đều không phải GET.
 *   * `Path=/` — cả web lẫn `/v1/*` cùng một phiên.
 *   * `Max-Age` 30 ngày — d.415, cùng con số với `het_luc` trong DB. Cookie là
 *     thứ **gợi ý** cho trình duyệt; hạn thật nằm ở cột `het_luc`, nên một
 *     cookie bị sửa hạn cũng không sống thêm được một giây.
 */
export function cookiePhienChu(id: string, max_age_ms: number = PHIEN_CHU_MS): string {
  const giay = Math.floor(max_age_ms / 1000);
  return (
    `${COOKIE_PHIEN_CHU}=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; ` +
    `Max-Age=${String(giay)}`
  );
}

/** Cookie **xoá** phiên — gửi kèm mọi lần đăng xuất. */
export function cookieXoaPhienChu(): string {
  return `${COOKIE_PHIEN_CHU}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Đọc id phiên từ header `Cookie`.
 *
 * Tự tách chuỗi thay vì dùng một thư viện: luật tách là `;` rồi `=` đầu tiên, và
 * một phụ thuộc mới cho hai dòng là một phụ thuộc phải nuôi.
 *
 * Cookie **trùng tên** (trình duyệt gửi được nhiều) thì lấy cái **đầu tiên** và
 * không thử cái sau: thử lần lượt là một đường để kẻ tấn công nhồi thêm một
 * cookie và ép máy chủ đoán.
 */
export function idPhienTuCookie(header: string | null | undefined): string | null {
  if (header === null || header === undefined) return null;
  for (const phan of header.split(';')) {
    const dau = phan.indexOf('=');
    if (dau < 0) continue;
    if (phan.slice(0, dau).trim() !== COOKIE_PHIEN_CHU) continue;
    const gia_tri = phan.slice(dau + 1).trim();
    return gia_tri === '' ? null : gia_tri;
  }
  return null;
}
