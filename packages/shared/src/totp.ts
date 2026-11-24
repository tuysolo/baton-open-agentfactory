/**
 * **TOTP** — lớp thứ hai của đường đăng nhập chủ (SPEC mục 15 d.415: "mật khẩu
 * cộng mã TOTP (2 lớp)").
 *
 * Theo RFC 6238 (TOTP) trên RFC 4226 (HOTP), đúng bộ tham số mà mọi ứng dụng
 * xác thực phổ thông dùng:
 *
 *   * HMAC-**SHA1** — không phải SHA-256. Đây **không** là một lựa chọn bảo mật
 *     mà là một ràng buộc tương thích: `otpauth://` có tham số `algorithm`,
 *     nhưng phần lớn ứng dụng xác thực bỏ qua nó và luôn tính SHA1. Chọn
 *     SHA-256 nghĩa là chủ quét QR rồi đọc một mã **không bao giờ** khớp, và
 *     không có cách nào để chủ thấy vì sao. Rủi ro của SHA1 ở đây là rủi ro
 *     **va chạm**, mà HMAC không dựa vào tính chống va chạm; và secret là 20
 *     byte ngẫu nhiên, không phải thứ dò từ điển được.
 *   * **6 số**, bước **30 giây**.
 *   * Cửa sổ **±1 bước** cho lệch đồng hồ (RFC 6238 mục 5.2 nói nên cho một độ
 *     trễ truyền tin; một bước mỗi phía là mức thường dùng). Không rộng hơn:
 *     mỗi bước nới ra là nhân đôi số mã hợp lệ cùng lúc.
 *
 * Secret lưu dạng **Base32** (RFC 4648, **không** padding `=`): đó là dạng duy
 * nhất mà `otpauth://` mang được, nên lưu dạng khác là tự thêm một phép đổi
 * dạng ở mỗi đầu.
 *
 * **Secret TOTP không bao giờ ra API hay UI** sau lần thiết lập (nếp của SPEC
 * mục 15 d.417 cho token GitHub/Telegram, áp cho cả secret này) — luật đó sống
 * ở tầng API; ở đây chỉ có phép tính.
 */

import { bangNhauAnToan } from './token.js';

/** Số chữ số của một mã — RFC 6238 mặc định, và là thứ mọi ứng dụng hiện. */
export const TOTP_SO_CHU_SO = 6;

/** Độ dài một bước thời gian, giây — RFC 6238 mặc định. */
export const TOTP_BUOC_GIAY = 30;

/**
 * Số bước lệch được chấp nhận mỗi phía. `1` = nhận mã của bước trước, bước này
 * và bước sau (3 mã hợp lệ cùng lúc).
 */
export const TOTP_CUA_SO_BUOC = 1;

/**
 * Số byte của secret mới. RFC 4226 mục 4 đòi **ít nhất** 128 bit và **khuyên**
 * 160 bit; 20 byte là 160 bit, và cũng là độ dài khối của SHA1.
 */
export const TOTP_SO_BYTE_SECRET = 20;

const BANG_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/* ------------------------------------------------------------------ *
 * Base32 (RFC 4648, không padding)
 * ------------------------------------------------------------------ */

export function sangBase32(bytes: Uint8Array): string {
  let bit = 0;
  let gia_tri = 0;
  let ra = '';
  for (const b of bytes) {
    gia_tri = (gia_tri << 8) | b;
    bit += 8;
    while (bit >= 5) {
      ra += BANG_BASE32[(gia_tri >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  // Nhóm 5 bit cuối còn thiếu thì **đệm bit 0 ở bên phải** — RFC 4648 mục 6.
  if (bit > 0) ra += BANG_BASE32[(gia_tri << (5 - bit)) & 31];
  return ra;
}

/**
 * Đọc một chuỗi Base32 về bytes.
 *
 * Nhận cả chữ thường và khoảng trắng (chủ gõ tay thường chép theo nhóm 4 ký
 * tự), nhận cả `=` đệm; ký tự **ngoài bảng** thì ném — một secret gõ sai mà bị
 * **bỏ qua ký tự lạ** sẽ cho ra một secret khác, và lỗi hiện ra thành "mã TOTP
 * luôn sai" không ai lần được.
 */
export function tuBase32(chu: string): Uint8Array {
  const sach = chu.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  let bit = 0;
  let gia_tri = 0;
  const ra: number[] = [];
  for (const ky_tu of sach) {
    const i = BANG_BASE32.indexOf(ky_tu);
    if (i < 0) throw new Error(`Base32 có ký tự không thuộc bảng: ${JSON.stringify(ky_tu)}`);
    gia_tri = (gia_tri << 5) | i;
    bit += 5;
    if (bit >= 8) {
      ra.push((gia_tri >>> (bit - 8)) & 0xff);
      bit -= 8;
    }
  }
  return new Uint8Array(ra);
}

/** Sinh một secret TOTP mới (Base32, 160 bit). Chỉ hiện **một lần** khi thiết lập. */
export function sinhSecretTotp(): string {
  const bytes = new Uint8Array(TOTP_SO_BYTE_SECRET);
  crypto.getRandomValues(bytes);
  return sangBase32(bytes);
}

/* ------------------------------------------------------------------ *
 * HOTP / TOTP
 * ------------------------------------------------------------------ */

/**
 * HOTP của một bộ đếm — RFC 4226 mục 5.3 ("dynamic truncation").
 *
 * Bộ đếm là **8 byte big-endian**. Dùng `BigInt` cho phép dịch bit: bước thời
 * gian của năm 2026 vừa trong 32 bit, nhưng `<<` của JavaScript làm việc trên
 * **số 32 bit có dấu**, nên một phép dịch viết bằng `Number` sẽ sai **im lặng**
 * ở bước thời gian năm 2038 — đúng loại lỗi không ai thấy tới ngày nó nổ.
 */
async function hotp(secret: Uint8Array, bo_dem: number): Promise<string> {
  const khoi = new Uint8Array(8);
  let n = BigInt(bo_dem);
  for (let i = 7; i >= 0; i -= 1) {
    khoi[i] = Number(n & 0xffn);
    n >>= 8n;
  }

  const khoa = await crypto.subtle.importKey(
    'raw',
    // `Uint8Array` của Workers là một `ArrayBufferView`; truyền `.buffer` thì một
    // mảng con (`subarray`) sẽ mang theo cả bộ đệm gốc. Truyền nguyên view.
    secret,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', khoa, khoi));

  // `offset` = 4 bit thấp của byte cuối; lấy 31 bit từ đó (bỏ bit dấu).
  const lech = mac[mac.length - 1]! & 0x0f;
  const so =
    ((mac[lech]! & 0x7f) << 24) |
    (mac[lech + 1]! << 16) |
    (mac[lech + 2]! << 8) |
    mac[lech + 3]!;

  return String(so % 10 ** TOTP_SO_CHU_SO).padStart(TOTP_SO_CHU_SO, '0');
}

/** Bước thời gian của một mốc epoch **milliseconds** — RFC 6238 mục 4.2. */
export function buocTotp(bay_gio_ms: number): number {
  return Math.floor(bay_gio_ms / 1000 / TOTP_BUOC_GIAY);
}

/** Mã TOTP của một bước thời gian cụ thể. */
export function maTotpCuaBuoc(secret_base32: string, buoc: number): Promise<string> {
  return hotp(tuBase32(secret_base32), buoc);
}

/** Mã TOTP tại một mốc thời gian. */
export function maTotp(secret_base32: string, bay_gio_ms: number): Promise<string> {
  return maTotpCuaBuoc(secret_base32, buocTotp(bay_gio_ms));
}

/**
 * Kết quả kiểm một mã TOTP.
 *
 * `buoc` là **bước đã khớp**, và nó là thứ chống dùng lại mã: người gọi lưu nó
 * lại và từ chối mọi mã có `buoc <= buoc_da_dung`. Không có nó thì cùng một mã
 * 6 số đăng nhập được 30–90 giây liền — tức một mã đọc lén được trên vai là một
 * lần đăng nhập thứ hai.
 */
export interface KetQuaKiemTotp {
  dung: boolean;
  /** Bước khớp; `null` khi không khớp bước nào. */
  buoc: number | null;
}

/**
 * Kiểm một mã TOTP trong cửa sổ ±`TOTP_CUA_SO_BUOC`.
 *
 * **Chống dùng lại:** truyền `buoc_da_dung` (bước của lần đăng nhập thành công
 * trước). Mọi bước `<=` giá trị đó bị loại, nên một mã đã dùng không vào lần
 * thứ hai, và một mã **cũ hơn** mã đã dùng cũng không.
 *
 * **Không rò rỉ thời gian:**
 *   * so từng mã bằng `bangNhauAnToan`;
 *   * **luôn** quét trọn cửa sổ, không `break` ở bước khớp. Dừng sớm làm thời
 *     gian trả lời nói ra *mã của bạn khớp bước nào*, tức một kênh đo lệch đồng
 *     hồ của máy chủ.
 */
export async function kiemTotp(
  secret_base32: string,
  ma: string,
  bay_gio_ms: number,
  buoc_da_dung: number | null = null,
): Promise<KetQuaKiemTotp> {
  const giua = buocTotp(bay_gio_ms);
  let khop: number | null = null;

  for (let d = -TOTP_CUA_SO_BUOC; d <= TOTP_CUA_SO_BUOC; d += 1) {
    const buoc = giua + d;
    const cho_phep = buoc_da_dung === null || buoc > buoc_da_dung;
    const dung = bangNhauAnToan(await maTotpCuaBuoc(secret_base32, buoc), ma);
    if (dung && cho_phep && khop === null) khop = buoc;
  }

  return { dung: khop !== null, buoc: khop };
}

/**
 * Hình dạng của mã TOTP mà người gõ vào: đúng 6 **chữ số**.
 *
 * Kiểm hình dạng **trước** khi tính HMAC để một chuỗi rác không tốn ba phép
 * HMAC; nhưng nó **không** được là một lỗi riêng ở tầng API — "mã sai hình
 * dạng" và "mã sai" phải ra cùng một câu trả lời (xem `chu-dang-nhap.ts`).
 */
export function laHinhMaTotp(ma: unknown): ma is string {
  return typeof ma === 'string' && new RegExp(`^[0-9]{${String(TOTP_SO_CHU_SO)}}$`).test(ma);
}

/* ------------------------------------------------------------------ *
 * URI `otpauth://` — để lượt giao diện hiện QR
 * ------------------------------------------------------------------ */

/**
 * Dựng URI `otpauth://totp/...` mà ứng dụng xác thực đọc được (và là thứ lượt
 * giao diện vẽ thành QR).
 *
 * `issuer` nằm **cả hai chỗ** (trong nhãn và trong tham số): nhãn dạng
 * `Issuer:tên` là quy ước cũ mà các ứng dụng cũ đọc, tham số `issuer` là dạng
 * mới. Khai cả hai là cách duy nhất hiện đúng tên trên mọi ứng dụng.
 *
 * Mọi tham số đi qua `encodeURIComponent`: tên chủ là chữ tiếng Việt có dấu và
 * có thể có khoảng trắng hay dấu `:`, mà `:` là đúng ký tự phân tách nhãn.
 */
export function uriOtpauth(opts: {
  secret_base32: string;
  /** Tên hiện trong ứng dụng xác thực — thường là tên chủ. */
  ten: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer ?? 'Baton';
  const nhan = `${encodeURIComponent(issuer)}:${encodeURIComponent(opts.ten)}`;
  const tham_so = new URLSearchParams({
    secret: opts.secret_base32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_SO_CHU_SO),
    period: String(TOTP_BUOC_GIAY),
  });
  return `otpauth://totp/${nhan}?${tham_so.toString()}`;
}
