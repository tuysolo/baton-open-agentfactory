/**
 * **Chọn nhiều thẻ và áp một phím cho nhiều ticket** — SPEC mục 14 d.416 ("`X`
 * chọn; áp một phím cho nhiều ticket"), BAT-35. Hàm thuần + hàng chờ giới hạn;
 * trạng thái chọn và listener phím ở `trang/danh-sach-ticket.tsx`.
 *
 * Phần SPEC không nói (`spec-questions.md` #156–#158):
 *   * `L` nhiều thẻ — `dichNhanLo`: mọi thẻ đã có nhãn ⇒ bỏ ở tất cả; ngược lại
 *     ⇒ gắn cho các thẻ chưa có (thẻ đã có không gửi request).
 *   * Sau khi áp: bỏ chọn thẻ thành công, **giữ đúng thẻ lỗi** để sửa và thử lại.
 *   * Đổi bộ lọc / tab / view ⇒ tập chọn rỗng (chọn theo id, chỉ trong bộ lọc lúc chọn).
 */

import type { TicketDong } from './api';
import { dichNhan, type ViecNhan } from './loc-ticket';

/**
 * Số request S/P/L của một lượt nhiều thẻ được bay **cùng lúc**. Giao diện vẫn
 * hiện lạc quan **mọi** thẻ ngay (d.418) vì `onMutate` chạy ngay; chỉ phần gọi máy
 * chủ xếp hàng. 4: nhanh gần như song song cho một lượt chọn thường (vài thẻ), mà
 * 50 thẻ không thành 50 request dồn vào Worker cùng một lúc.
 */
export const GIOI_HAN_SONG_SONG = 4;

/** Câu tóm tắt dài tối đa bao nhiêu ký tự cho **mỗi** câu máy chủ. */
export const DO_DAI_CAU_TOI_DA = 120;

export interface HangGioiHan {
  /** Chạy `f` khi còn chỗ (tối đa `n` cùng lúc); trả đúng kết quả/lỗi của `f`. */
  chay: <T>(f: () => Promise<T>) => Promise<T>;
}

/** Hàng chờ giới hạn `n` việc cùng lúc, theo thứ tự vào. */
export function taoHangGioiHan(n: number): HangGioiHan {
  let dang = 0;
  const cho: (() => void)[] = [];
  const nha = (): void => {
    dang -= 1;
    const tiep = cho.shift();
    if (tiep !== undefined) tiep();
  };
  return {
    chay: <T>(f: () => Promise<T>): Promise<T> =>
      new Promise<T>((xong, loi) => {
        const bat = (): void => {
          dang += 1;
          let p: Promise<T>;
          try {
            p = f();
          } catch (e) {
            p = Promise.reject(e instanceof Error ? e : new Error(String(e)));
          }
          void p.then(xong, loi).finally(nha);
        };
        if (dang < n) bat();
        else cho.push(bat);
      }),
  };
}

/** Cắt gọn một câu dài (giữ nguyên văn phần đầu, thêm `…`). */
export function catGon(cau: string, toi_da = DO_DAI_CAU_TOI_DA): string {
  const c = cau.trim();
  return c.length <= toi_da ? c : `${c.slice(0, toi_da - 1).trimEnd()}…`;
}

export interface LoiMotThe {
  ma: string;
  cau: string;
}

/**
 * **Một** toast cho cả lượt: `"2/5 thẻ lỗi: BAT-3 — <câu>; BAT-7 — <câu>"`. Câu là
 * câu **nguyên văn** của máy chủ (d.418), cắt gọn nếu dài.
 */
export function tomTatLoiLo(tong: number, loi: readonly LoiMotThe[]): string {
  const phan = loi.map((l) => `${l.ma} — ${catGon(l.cau)}`).join('; ');
  return `${String(loi.length)}/${String(tong)} thẻ lỗi: ${phan}`;
}

/**
 * **Luật `L` cho nhiều thẻ** (SPEC không nói — `spec-questions.md` #156): mọi thẻ đã
 * có nhãn ⇒ **bỏ** ở tất cả; ngược lại ⇒ **gắn** cho các thẻ chưa có, thẻ đã có
 * thì không gửi gì. Trả một mục cho **mỗi** thẻ, cùng thứ tự: `null` = không gửi.
 * Nhãn trống ⇒ toàn `null`. Cắt khoảng trắng như `dichNhan`.
 */
export function dichNhanLo(
  ds: readonly Pick<TicketDong, 'id' | 'ma' | 'nhan'>[],
  nhan: string,
): (ViecNhan | null)[] {
  const n = nhan.trim();
  if (n === '' || ds.length === 0) return ds.map(() => null);
  const moi_the_co = ds.every((t) => t.nhan.includes(n));
  return ds.map((t) => dichNhan(t, n, !moi_the_co));
}

/**
 * **Câu nói rõ lượt `L` này là GẮN hay BỎ** — dòng mô tả của hộp "Áp cho N thẻ?"
 * (BAT-38, sửa theo reviewer; SPEC 19.12 câu 67, 70). Tính từ **chính** `dichNhanLo`
 * trên đúng tập lượt áp sẽ xét, nên câu và request gửi đi không thể lệch nhau.
 *   * mọi thẻ đã có ⇒ `Bỏ nhãn "x" khỏi N thẻ`;
 *   * ngược lại ⇒ `Gắn nhãn "x" cho k thẻ` (+ `m thẻ đã có, không đổi` nếu m > 0).
 */
export function moTaNhanLo(
  ds: readonly Pick<TicketDong, 'id' | 'ma' | 'nhan'>[],
  nhan: string,
): string {
  const n = nhan.trim();
  const viec = dichNhanLo(ds, n).filter((v): v is ViecNhan => v !== null);
  const so_gui = String(viec.length);
  if (viec.length > 0 && viec.every((v) => !v.gan)) {
    return `Bỏ nhãn "${n}" khỏi ${so_gui} thẻ`;
  }
  const da_co = ds.length - viec.length;
  const duoi = da_co > 0 ? ` (${String(da_co)} thẻ đã có, không đổi)` : '';
  return `Gắn nhãn "${n}" cho ${so_gui} thẻ${duoi}`;
}

/** Chữ của thanh chọn nhiều. */
export const nhanSoChon = (n: number): string => `${String(n)} thẻ đã chọn · Esc bỏ chọn`;
export const nhanChonThe = (ma: string): string => `Chọn ${ma}`;
export const NHAN_LO_TRANG_THAI = 'Trạng thái cho các thẻ đã chọn';
export const NHAN_LO_UU_TIEN = 'Ưu tiên cho các thẻ đã chọn';
export const NHAN_LO_NHAN = 'Nhãn cho các thẻ đã chọn (nút Áp: gắn; mọi thẻ đã có thì bỏ)';
export const NHAN_LO_GIAO = 'Giao việc các thẻ đã chọn';
export const NHAN_BO_CHON = 'Bỏ chọn';
/**
 * Nút xác nhận cạnh mỗi ô của thanh — **đường duy nhất** gửi request (BAT-39,
 * `spec-questions.md` #164). Ô chỉ đặt giá trị chờ: đổi bằng chuột, mũi tên, Space,
 * gõ chữ hay `Enter` đều không áp.
 */
export const NHAN_NUT_AP = 'Áp';
export const NHAN_AP_TRANG_THAI = 'Áp trạng thái cho các thẻ đã chọn';
export const NHAN_AP_UU_TIEN = 'Áp ưu tiên cho các thẻ đã chọn';
export const NHAN_AP_NHAN = 'Áp nhãn cho các thẻ đã chọn';
export const NHAN_DANG_AP = 'Đang áp…';

/**
 * **Ngưỡng hỏi lại trước khi áp cho nhiều thẻ** — `spec-questions.md` #159, Chủ chốt
 * T-38 = A (19/10), SPEC mục 14. Áp `S`/`P`/`L` từ thanh chọn nhiều cho **N ≥ 10**
 * thẻ ⇒ hộp "Áp cho N thẻ?" trước; N < 10 ⇒ áp luôn (nút "Áp" là đủ — BAT-39).
 * N = số thẻ đã chọn **đang hiện** (đúng tập mà lượt áp sẽ gửi). `A` không qua đây:
 * hộp "Giao N thẻ" đã có nút gửi tường minh.
 */
export const NGUONG_HOI_AP = 10;
export const canHoiAp = (n: number): boolean => n >= NGUONG_HOI_AP;
export const cauHoiAp = (n: number): string => `Áp cho ${String(n)} thẻ?`;
export const nhanXacNhanAp = (n: number): string => `Áp cho ${String(n)} thẻ`;
export const NHAN_HUY_AP = 'Huỷ';
export const NHAN_DONG_HOP_AP_NGOAI = 'Đóng hộp xác nhận áp';
