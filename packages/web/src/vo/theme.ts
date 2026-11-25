/**
 * **Chế độ sáng / tối / theo máy** — luật thuần, không JSX.
 *
 * SPEC mục 14 **không nói gì về chế độ tối** (`spec-questions.md` #125): yêu cầu
 * đến từ chủ qua brief. Ba lựa chọn, nhớ lại lần sau. Mặc định cho người chưa
 * chọn: **tối** (Chủ chốt 29/10, hệ thiết kế kiểu Linear — `DESIGN.md`);
 * trước 29/10 là "theo máy".
 *
 * ## Ba chữ, và vì sao `may` không được lưu thành `toi`
 *
 * Giải "theo máy" ra rồi lưu kết quả sẽ **đóng băng** lựa chọn: chủ đổi chế độ
 * của máy buổi tối thì Baton vẫn sáng. Nên thứ được lưu là **lựa chọn**
 * (`sang` | `toi` | `may`), còn thứ đặt lên `<html data-theme>` là **kết quả đã
 * giải** (`sang` | `toi`) — CSS chỉ cần biết kết quả.
 *
 * ## Vì sao hàm `apTheme` nhận cả `Document`
 *
 * Để ca test gọi được trên một tài liệu thật của jsdom mà không phải dựng React,
 * và để `index.html` và React dùng **cùng một** phép đặt (cùng tên thuộc tính,
 * cùng ba chữ). Hai bản chép tay sẽ lệch, và lệch ở đây = nhoáng sai màu.
 */

import { doc, ghi, type KhoCucBo } from '../kho-cuc-bo';

export const KHOA_THEME = 'baton.theme';

export const CHON_THEME = ['sang', 'toi', 'may'] as const;
export type ChonTheme = (typeof CHON_THEME)[number];

/** Kết quả đã giải — thứ duy nhất CSS đọc (`<html data-theme>`). */
export type ThemeThat = 'sang' | 'toi';

export const NHAN_THEME: Record<ChonTheme, string> = {
  sang: 'Sáng',
  toi: 'Tối',
  may: 'Theo máy',
};

/**
 * Mặc định: **tối** — chế độ chính của hệ thiết kế từ 29/10 (`DESIGN.md`).
 * Ba chỗ phải khớp chữ này: hằng này, script nội tuyến của `index.html`, và
 * khối fallback `:root:not([data-theme])` của `kieu.css` (chưa có JS ⇒ tối).
 */
export const THEME_MAC_DINH: ChonTheme = 'toi';

export const THUOC_TINH_THEME = 'data-theme';
/** Thuộc tính phụ giữ **lựa chọn** (kể cả `may`) để React dựng đúng nút đang bật. */
export const THUOC_TINH_CHON = 'data-theme-chon';

function laChon(v: unknown): v is ChonTheme {
  return typeof v === 'string' && (CHON_THEME as readonly string[]).includes(v);
}

/** Đọc lựa chọn đã nhớ. Không có / rác / không có `localStorage` ⇒ mặc định. */
export function docChonTheme(kho?: KhoCucBo): ChonTheme {
  const v = doc(KHOA_THEME, kho);
  return laChon(v) ? v : THEME_MAC_DINH;
}

export function luuChonTheme(c: ChonTheme, kho?: KhoCucBo): void {
  ghi(KHOA_THEME, c, kho);
}

/**
 * Máy đang xin chế độ tối không? **Không có `matchMedia` ⇒ `false`** (jsdom cũ,
 * WebView rút gọn): thiếu câu trả lời thì coi như sáng, không đoán.
 */
export function mayXinToi(w: { matchMedia?: typeof window.matchMedia } = globalThis): boolean {
  try {
    return w.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  } catch {
    return false;
  }
}

/** Lựa chọn → chế độ thật. `may` là lượt duy nhất phải hỏi máy. */
export function giaiTheme(c: ChonTheme, xin_toi: boolean = mayXinToi()): ThemeThat {
  if (c === 'sang') return 'sang';
  if (c === 'toi') return 'toi';
  return xin_toi ? 'toi' : 'sang';
}

/** Đặt chế độ lên `<html>`. Hai thuộc tính: kết quả cho CSS, lựa chọn cho UI. */
export function apTheme(c: ChonTheme, tai_lieu: Document = document): void {
  const goc = tai_lieu.documentElement;
  goc.setAttribute(THUOC_TINH_THEME, giaiTheme(c));
  goc.setAttribute(THUOC_TINH_CHON, c);
}

/**
 * Lựa chọn mà `<html>` đang mang — đọc **từ DOM**, không từ `localStorage`.
 *
 * Script nội tuyến của `index.html` đã đặt nó trước khi React vẽ, nên đây là
 * nguồn duy nhất không gây nhoáng: đọc lại `localStorage` ở lần render đầu rồi
 * `useEffect` đặt lại là đúng cái nhoáng mà script kia tồn tại để tránh.
 */
export function chonTrenDom(tai_lieu: Document = document): ChonTheme {
  const v = tai_lieu.documentElement.getAttribute(THUOC_TINH_CHON);
  return laChon(v) ? v : docChonTheme();
}
