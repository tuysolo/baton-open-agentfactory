/**
 * Lỗi của **chính CLI** (không phải lỗi API) và việc chọn mã thoát — SPEC mục 13
 * d.380 + 19.9 d.543.
 *
 * Bảng "mã lỗi API → mã thoát" **không** nằm ở đây: nó ở `@baton/shared`
 * (`maThoatCuaLoi`), đúng một chỗ, và file này chỉ gọi nó.
 */

import { BatonError, MA_THOAT, maThoatCuaLoi, type MaThoat } from '@baton/shared';

export class LoiCli extends Error {
  readonly ma_thoat: MaThoat;

  constructor(message: string, ma_thoat: MaThoat) {
    super(message);
    this.name = 'LoiCli';
    this.ma_thoat = ma_thoat;
  }

  /** Thiếu / sai xác thực, hoặc không gọi được máy chủ → **mã 2**. */
  static xacThuc(message: string): LoiCli {
    return new LoiCli(message, MA_THOAT.loi_xac_thuc_hoac_mang);
  }

  static la(e: unknown): e is LoiCli {
    return e instanceof LoiCli;
  }
}

/**
 * Một ngoại lệ bất kỳ → (dòng in cho người, mã thoát).
 *
 * Ba nhánh:
 *   * `BatonError` (lỗi API): in **mã lỗi** kèm thông điệp tiếng Việt — d.380
 *     "1 là lỗi nghiệp vụ (**in mã lỗi**)" và d.381 "thông điệp lỗi hiển thị nhãn
 *     tiếng Việt"; mã thoát lấy từ bảng duy nhất trong `@baton/shared`.
 *   * `LoiCli`: mã thoát CLI tự đặt (thiếu biến môi trường…).
 *   * Còn lại (`TypeError` của `fetch` khi mạng hỏng, máy chủ không trả lời):
 *     **mã 2** "lỗi xác thực hoặc **mạng**".
 */
export function doiNgoaiLe(e: unknown): { dong: string; ma_thoat: MaThoat } {
  if (BatonError.la(e)) {
    return { dong: `${e.ma}: ${e.message}`, ma_thoat: maThoatCuaLoi(e.ma) };
  }
  if (LoiCli.la(e)) {
    return { dong: e.message, ma_thoat: e.ma_thoat };
  }
  const chi_tiet = e instanceof Error ? e.message : String(e);
  return {
    dong: `Không gọi được Baton (lỗi mạng hoặc máy chủ không trả lời): ${chi_tiet}`,
    ma_thoat: MA_THOAT.loi_xac_thuc_hoac_mang,
  };
}
