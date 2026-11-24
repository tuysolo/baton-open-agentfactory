/**
 * Token agent — SPEC mục 3, 15.
 *
 * Server **chỉ lưu dạng băm**; chuỗi token gốc hiện đúng một lần khi tạo.
 *
 * Băm bằng **SHA-256**, không dùng KDF chậm: token là chuỗi ngẫu nhiên do server
 * sinh, không phải mật khẩu người đặt, nên không có gì để dò từ điển.
 * PBKDF2-SHA256 chỉ dành cho **mật khẩu chủ** (mục 15, phần 6). SHA-256 còn cho
 * phép tra token bằng đúng một truy vấn theo khoá băm — KDF chậm thì mỗi request
 * phải quét toàn bảng agent.
 *
 * **Entropy thật là ~190 bit**, không phải 256: token là 32 **ký tự** lấy từ bảng
 * 62 ký tự, nên 32 × log2(62) ≈ 190,6 bit. (Dòng ghi "256 bit" ở lượt 1 là sai:
 * 32 byte ngẫu nhiên bị *ánh xạ xuống* 32 ký tự, mất entropy.) Lấy ký tự bằng
 * cách gạt mẫu không chia hết cho 62 nên **không có lệch modulo**. 190 bit vượt
 * xa mọi nhu cầu dò ngẫu nhiên.
 */

const TIEN_TO_TOKEN = 'bt_';
/** Số **ký tự** ngẫu nhiên trong token (không tính tiền tố). */
const SO_KY_TU_TOKEN = 32;

const BANG_CHU = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Mẫu byte lớn nhất chia hết cho 62; byte ≥ ngưỡng này bị gạt đi. */
const NGUONG_GAT = 256 - (256 % BANG_CHU.length);

/**
 * Sinh token mới (chuỗi ngẫu nhiên ~190 bit). Trả chuỗi gốc, **chỉ hiện 1 lần**
 * (SPEC mục 3). Gạt byte ≥ `NGUONG_GAT` để mọi ký tự có xác suất bằng nhau.
 */
export function sinhToken(): string {
  let s = '';
  while (s.length < SO_KY_TU_TOKEN) {
    const bytes = new Uint8Array(SO_KY_TU_TOKEN);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= NGUONG_GAT) continue;
      s += BANG_CHU[b % BANG_CHU.length];
      if (s.length === SO_KY_TU_TOKEN) break;
    }
  }
  return TIEN_TO_TOKEN + s;
}

/** Băm token bằng SHA-256, trả chuỗi hex 64 ký tự. */
export async function bamToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 4 ký tự cuối của token, để UI hiện lại về sau — SPEC mục 3. */
export function bonKyTuCuoi(token: string): string {
  return token.slice(-4);
}

/**
 * So hai chuỗi bí mật **không rò rỉ thời gian**: luôn chạy qua đủ số ký tự, nên
 * thời gian không phụ thuộc vào vị trí ký tự đầu khác nhau.
 *
 * Dùng cho token chủ (so trực tiếp chuỗi với chuỗi). Token agent không cần hàm
 * này: nó được **băm** rồi tra khoá, kẻ tấn công không điều khiển được giá trị so.
 */
export function bangNhauAnToan(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  // Độ dài khác nhau vẫn phải quét hết: gộp chênh lệch độ dài vào kết quả.
  let khac = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) khac |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return khac === 0;
}
