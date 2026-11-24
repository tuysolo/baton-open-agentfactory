/**
 * **Nhóm sidebar thu gọn được, và NHỚ trạng thái thu gọn.**
 *
 * Thứ được lưu là **danh sách khoá đang KHÁC MẶC ĐỊNH**, không một đối tượng
 * `{khoá: bool}` cho mọi nhóm. Hai mặc định khác nhau, và đó là chủ ý:
 *
 *   * hai nhóm lớn (Dự án, Đội agent) **mở sẵn** — chúng là đường điều hướng
 *     chính;
 *   * một dự án mở ra ba đường con thì **đóng sẵn** — mở hết mọi dự án biến
 *     sidebar thành một danh sách dài gấp bốn ngay lần đầu chủ đăng nhập.
 *
 * Lưu "khác mặc định" thay vì lưu trạng thái tuyệt đối để một dự án **mới** xuất
 * hiện ở lượt sau nhận đúng mặc định, không phụ thuộc có mặt trong bản ghi cũ
 * hay không.
 *
 * Khoá: `'du-an'`, `'doi-agent'` cho hai nhóm lớn, và `'du-an:<MÃ>'` cho một dự
 * án mở ra ba đường con. Chuỗi, không enum: `<MÃ>` là dữ liệu.
 *
 * `localStorage` ném thì **im lặng không nhớ** — lý lẽ đầy đủ ở `kho-cuc-bo.ts`.
 * Dữ liệu hỏng (ai đó sửa tay, một bản cũ ghi hình khác) ⇒ coi như chưa thu gọn
 * gì, **không ném**: mất một tiện ích thì chỉ mất tiện ích đó, không trắng cả
 * sidebar — tức mất cả đường điều hướng.
 */

import { doc, ghi, type KhoCucBo } from '../kho-cuc-bo';

export const KHOA_THU_GON = 'baton.sidebar-thu-gon';

/** Khoá nhóm "Dự án" và nhóm "Đội agent". */
export const NHOM_DU_AN = 'du-an';
export const NHOM_DOI_AGENT = 'doi-agent';
/** Khoá của một dự án mở ra các đường con. */
export const khoaDuAn = (ma: string): string => `du-an:${ma}`;

export function docThuGon(kho?: KhoCucBo): Set<string> {
  const van = doc(KHOA_THU_GON, kho);
  if (van === null) return new Set();
  try {
    const d: unknown = JSON.parse(van);
    if (!Array.isArray(d)) return new Set();
    return new Set(d.filter((x): x is string => typeof x === 'string' && x !== ''));
  } catch {
    return new Set();
  }
}

export function luuThuGon(ds: ReadonlySet<string>, kho?: KhoCucBo): void {
  ghi(KHOA_THU_GON, JSON.stringify([...ds]), kho);
}

/** Hai nhóm lớn mở sẵn; một dự án đóng sẵn. */
export const MAC_DINH_MO: Record<string, boolean> = {
  [NHOM_DU_AN]: true,
  [NHOM_DOI_AGENT]: true,
};

/** Mặc định của một khoá — khoá dự án (`du-an:<MÃ>`) mặc định **đóng**. */
export function macDinhMo(khoa: string): boolean {
  return MAC_DINH_MO[khoa] ?? false;
}

/** Khoá này đang mở không, tính cả mặc định và cả bản ghi "khác mặc định". */
export function dangMo(ds: ReadonlySet<string>, khoa: string): boolean {
  return ds.has(khoa) ? !macDinhMo(khoa) : macDinhMo(khoa);
}

/** Bật/tắt một khoá, trả về **tập mới** (không sửa tập cũ). */
export function daoThuGon(ds: ReadonlySet<string>, khoa: string): Set<string> {
  const moi = new Set(ds);
  if (moi.has(khoa)) moi.delete(khoa);
  else moi.add(khoa);
  return moi;
}
