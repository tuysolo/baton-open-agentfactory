/**
 * **Mật khẩu chủ** — lớp thứ nhất của đường đăng nhập (SPEC mục 15 d.415).
 *
 * Băm bằng **PBKDF2-SHA256**, đã chốt ở `decisions.md` 01/10 (Q6 A): Workers
 * không chạy được argon2id (không có WASM nào trong danh sách cấm-phụ-thuộc, và
 * CPU của một request Worker không chịu nổi bộ nhớ của argon2id), còn PBKDF2 thì
 * nằm ngay trong WebCrypto.
 *
 * **Số vòng mặc định 100.000** — xem `SO_VONG_PBKDF2` dưới đây: đó là **trần của
 * Workers**, không một lựa chọn an ninh tự do.
 * Số vòng là **một cột của bảng**, không một hằng đọc lúc kiểm: nâng số vòng về sau
 * phải làm được mà **không** mất mật khẩu đã đặt. Nên `kiemMatKhau` luôn băm lại
 * bằng `so_vong` **lưu trong dòng**, và chỉ lúc *đặt* mật khẩu mới thì số vòng
 * hiện hành được dùng.
 *
 * Khác hẳn token agent, vốn băm SHA-256 một lần (xem `token.ts`): token là 190
 * bit ngẫu nhiên do máy sinh, mật khẩu là thứ người đặt và dò từ điển được.
 *
 * **Băm, muối và số vòng không bao giờ ra API hay UI** — nếp của SPEC mục 15
 * d.417. Luật đó sống ở tầng API; ở đây chỉ có phép tính.
 */

import { bangNhauAnToan } from './token.js';

/**
 * Số vòng PBKDF2-SHA256 cho mật khẩu **mới đặt** — hằng của **sản phẩm**.
 *
 * **100.000 là TRẦN CỦA NỀN TẢNG, không một lựa chọn an ninh tự do.**
 * Cloudflare Workers từ chối `crypto.subtle.deriveBits` với PBKDF2
 * `iterations > 100000`. Đây là lỗi **thật đã gặp**: lúc deploy 06/10, hằng này
 * còn là 600.000 và `POST /v1/khoi-tao` trả **500** trên
 * `baton-api.*.workers.dev`; bản đang chạy sống được chỉ vì chủ đặt tay secret
 * `PBKDF2_SO_VONG=100000`. Workers là nền tảng đã chốt (`decisions.md` 01/10
 * Q2), nên trần ấy là trần của Baton.
 *
 * **Nên NÂNG hằng này lên là làm hỏng bản thật** — mọi đường đặt mật khẩu sẽ
 * trả 500 trở lại. Vì vậy test ghim **trần trên** (`toBeLessThanOrEqual`), ngược
 * hướng với ca cũ vốn ghim **sàn** 600.000: xem `test/totp-mat-khau.test.ts`.
 *
 * **Nói thẳng chỗ không đạt:** mức khuyến nghị của OWASP cho PBKDF2-SHA256 cao
 * hơn 100.000 vòng, và Baton **không đạt** mức đó. Cái bù lại, không phải cái
 * xoá đi:
 * - **Yếu tố thứ hai là TOTP** (SPEC mục 15) — mật khẩu một mình không vào được.
 * - **Khoá sau n lần sai** (`so_lan_sai`, `khoa_den_luc`; migration 0017), nên dò
 *   trực tuyến bị chặn; chỉ bài dò **ngoại tuyến** (khi băm đã lộ) mới ăn trần này.
 * - Chỉ có **một** tài khoản chủ, không một bảng người dùng để dò hàng loạt.
 *
 * Test hạ số vòng qua tham số `so_vong` của `datMatKhau` (binding
 * `PBKDF2_SO_VONG` ở tầng API), **không** hạ hằng này: một hằng sản phẩm bị hạ
 * cho test nhanh là một hệ thống thật yếu đi mà không ai thấy trong diff.
 */
export const SO_VONG_PBKDF2 = 100_000;

/** Số byte muối. 16 byte = 128 bit, quá đủ để muối không bao giờ trùng. */
export const SO_BYTE_MUOI = 16;

/** Số byte của khoá dẫn xuất — bằng độ dài khối ra của SHA-256. */
const SO_BYTE_BAM = 32;

/** Độ dài mật khẩu cho phép. Xem `spec-questions.md`: SPEC không nêu luật mật khẩu. */
export const MAT_KHAU_DAI_TOI_THIEU = 12;
export const MAT_KHAU_DAI_TOI_DA = 256;

export function sangHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function tuHex(chu: string): Uint8Array {
  if (chu.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(chu)) {
    throw new Error('Chuỗi hex không hợp lệ.');
  }
  const ra = new Uint8Array(chu.length / 2);
  for (let i = 0; i < ra.length; i += 1) ra[i] = Number.parseInt(chu.slice(i * 2, i * 2 + 2), 16);
  return ra;
}

/** Sinh một muối mới (hex). */
export function sinhMuoi(): string {
  const bytes = new Uint8Array(SO_BYTE_MUOI);
  crypto.getRandomValues(bytes);
  return sangHex(bytes);
}

/** Băm một mật khẩu với muối và số vòng cho trước. Trả hex. */
export async function bamMatKhau(
  mat_khau: string,
  muoi_hex: string,
  so_vong: number,
): Promise<string> {
  if (!Number.isInteger(so_vong) || so_vong < 1) {
    throw new Error('Số vòng PBKDF2 phải là số nguyên dương.');
  }
  const khoa = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(mat_khau),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: tuHex(muoi_hex), iterations: so_vong },
    khoa,
    SO_BYTE_BAM * 8,
  );
  return sangHex(new Uint8Array(bits));
}

/** Một mật khẩu đã băm, đúng ba cột của bảng `chu_tai_khoan`. */
export interface MatKhauDaBam {
  mat_khau_bam: string;
  muoi: string;
  so_vong: number;
}

/** Đặt một mật khẩu: sinh muối mới và băm. `so_vong` để trống = mức hiện hành. */
export async function datMatKhau(
  mat_khau: string,
  so_vong: number = SO_VONG_PBKDF2,
): Promise<MatKhauDaBam> {
  const muoi = sinhMuoi();
  return { mat_khau_bam: await bamMatKhau(mat_khau, muoi, so_vong), muoi, so_vong };
}

/**
 * So một mật khẩu với dòng đã lưu — **không rò rỉ thời gian**.
 *
 * Băm lại bằng đúng `so_vong` và `muoi` **của dòng**, rồi so bằng
 * `bangNhauAnToan`. So bằng `===` trên hai chuỗi hex là một kênh đo: thời gian
 * của phép so phụ thuộc ký tự đầu khác nhau, nên kẻ dò đọc được **từng byte**
 * của băm đúng (và băm đúng cộng muối đã lộ là một bài dò ngoại tuyến rẻ hơn).
 */
export async function kiemMatKhau(mat_khau: string, dong: MatKhauDaBam): Promise<boolean> {
  const bam = await bamMatKhau(mat_khau, dong.muoi, dong.so_vong);
  return bangNhauAnToan(bam, dong.mat_khau_bam);
}

/**
 * Hình dạng mật khẩu nhận được.
 *
 * **SPEC không nêu luật mật khẩu nào** (`spec-questions.md`) — đây là hướng tạm:
 * chỉ chặn độ dài, không đòi "một chữ hoa một ký tự đặc biệt". Lý do: luật ký tự
 * đẩy người ta về những mật khẩu ngắn khó nhớ, còn độ dài tối thiểu 12 là ràng
 * buộc duy nhất có sức thật khi đã có PBKDF2 100.000 vòng (trần của Workers) và
 * TOTP ở sau.
 */
export function laHinhMatKhau(mat_khau: unknown): mat_khau is string {
  return (
    typeof mat_khau === 'string' &&
    mat_khau.length >= MAT_KHAU_DAI_TOI_THIEU &&
    mat_khau.length <= MAT_KHAU_DAI_TOI_DA
  );
}
