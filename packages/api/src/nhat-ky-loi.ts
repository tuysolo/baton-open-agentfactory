/**
 * **Dòng log có cấu trúc cho lỗi không lường trước** (BAT-65).
 *
 * Bối cảnh: trên live, `baton evidence … review pass "…"` gửi ngay sau một
 * `evidence … deploy` từng ra `INTERNAL`/500, gửi lại 1–2 phút sau thì được. Log
 * cũ (`console.error('Lỗi không lường trước:', err)`) không có đường dẫn, ticket,
 * loại bằng chứng, cờ `retryable`/`overloaded` của lỗi Durable Object, hay mã tra
 * log — nên không có cách nào chẩn đoán từ `wrangler tail`/Workers Logs. File này
 * dựng phần chung của hai dòng log (`loi_internal` ở `middleware-loi.ts`,
 * `loi_cua_ghi` ở `WorkspaceGate.#chayMotLenh`) để hai chỗ không lệch nhau.
 *
 * **Không bao giờ log**: header `authorization`/`cookie`, token, thân request,
 * `ghi_chu`/`noi_dung` hay bất kỳ trường nội dung nào của bằng chứng (SPEC mục
 * 15). Chỉ những trường liệt kê dưới đây, mỗi trường đã cắt độ dài.
 *
 * **Một dòng = một chuỗi JSON** (`JSON.stringify`), không phải object: Workers
 * Logs tách được trường từ dòng JSON, `wrangler tail` in đúng một dòng grep được,
 * và người đọc log/test chỉ phải xử một hình dạng.
 */

/** Trần độ dài của `loi_thong_diep`. */
export const TRAN_THONG_DIEP_LOG = 300;

/** Trần độ dài của phần stack (đã bỏ dòng đầu là thông điệp). */
const TRAN_STACK_LOG = 600;

/** Số khung stack tối đa giữ lại. */
const SO_KHUNG_STACK_LOG = 6;

/** Trần độ dài của một định danh (id ticket, đường dẫn) đưa vào log. */
const TRAN_DINH_DANH_LOG = 200;

/**
 * Loại bằng chứng chỉ vào log khi là một chuỗi **ngắn, chữ thường và `_`**: đó là
 * hình dạng của mọi loại hợp lệ (`commit`, `deploy`, `review`, …). Giá trị khác
 * do client gửi thì không ai bảo đảm được nó không mang nội dung, nên bỏ.
 */
const MAU_LOAI_BANG_CHUNG_LOG = /^[a-z_]{1,20}$/;

export function loaiBangChungDeLog(v: unknown): string | null {
  return typeof v === 'string' && MAU_LOAI_BANG_CHUNG_LOG.test(v) ? v : null;
}

/** Cắt một chuỗi định danh cho log; không phải chuỗi thì `null`. */
export function dinhDanhDeLog(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, TRAN_DINH_DANH_LOG) : null;
}

/**
 * `cf-ray` chỉ được nối vào thông điệp trả client (và vào log) khi chỉ gồm chữ,
 * số, gạch ngang và ≤ 64 ký tự — hình dạng thật của nó là `8abc123def456-SIN`.
 * Một header lạ thì bỏ, để thân response không phản chiếu chuỗi tuỳ ý của client.
 */
const MAU_CF_RAY = /^[A-Za-z0-9-]{1,64}$/;

export function cfRayHopLe(v: string | null | undefined): string | null {
  return typeof v === 'string' && MAU_CF_RAY.test(v) ? v : null;
}

/** Đọc một cờ boolean trên lỗi (vd `retryable` của lỗi Durable Object); khác thì `null`. */
function coBoolean(err: unknown, ten: string): boolean | null {
  if (typeof err !== 'object' || err === null) return null;
  const v: unknown = (err as Record<string, unknown>)[ten];
  return typeof v === 'boolean' ? v : null;
}

/** Vài khung stack đầu, bỏ dòng thông điệp (đã có ở `loi_thong_diep`). */
function stackNgan(err: unknown): string | null {
  if (!(err instanceof Error) || typeof err.stack !== 'string') return null;
  const khung = err.stack
    .split('\n')
    .map((d) => d.trim())
    .filter((d) => d.startsWith('at '))
    .slice(0, SO_KHUNG_STACK_LOG);
  if (khung.length === 0) return null;
  return khung.join(' | ').slice(0, TRAN_STACK_LOG);
}

/** Phần mô tả lỗi dùng chung của mọi dòng log lỗi. */
export interface MoTaLoi {
  loi_ten: string;
  loi_thong_diep: string;
  loi_stack: string | null;
  /** Cờ của lỗi Durable Object / runtime Workers — `null` khi lỗi không mang. */
  remote: boolean | null;
  retryable: boolean | null;
  overloaded: boolean | null;
}

export function moTaLoi(err: unknown): MoTaLoi {
  let loi_ten: string = typeof err;
  let thong_diep = '';
  if (err instanceof Error) {
    loi_ten = err.name !== '' ? err.name : err.constructor.name;
    thong_diep = err.message;
  } else if (typeof err === 'string') {
    thong_diep = err;
  }
  return {
    loi_ten: String(loi_ten).slice(0, 100),
    loi_thong_diep: thong_diep.slice(0, TRAN_THONG_DIEP_LOG),
    loi_stack: stackNgan(err),
    remote: coBoolean(err, 'remote'),
    retryable: coBoolean(err, 'retryable'),
    overloaded: coBoolean(err, 'overloaded'),
  };
}

/** Ghi **một** dòng log lỗi: một chuỗi JSON, một đối số. */
export function ghiDongLoi(dong: Record<string, unknown>): void {
  let chu: string;
  try {
    chu = JSON.stringify(dong);
  } catch {
    // `chi_tiet` lạ (vòng tham chiếu, BigInt) không được làm mất cả dòng log.
    chu = JSON.stringify({ ...dong, chi_tiet: '(không tuần tự hoá được)' });
  }
  console.error(chu);
}
