/**
 * **`localStorage` an toàn** — một cửa duy nhất cho mọi thứ "nhớ trên máy này".
 *
 * `localStorage` có thể **không tồn tại** hoặc **ném ngay khi đọc thuộc tính**:
 * `iframe` sandbox, chế độ chặn cookie của Safari, WebView rút gọn, và môi
 * trường test (jsdom in `localStorage is not available`). Chạm thẳng vào nó
 * trong thân một component nghĩa là **cả trang trắng** vì một tiện ích nhớ lựa
 * chọn.
 *
 * Nên mọi lần dùng đi qua đây, và thiếu kho thì phần mềm **im lặng không nhớ
 * gì** — không ném, không báo lỗi với chủ: mất một tiện ích thì chỉ mất tiện
 * ích đó.
 *
 * Lý lẽ này đã được viết một lần ở `loc-ticket.ts` cho view đã lưu; file này là
 * chỗ chung để lượt sau không chép nó lần thứ ba.
 */

/** Phần `Storage` mà mã này cần — hẹp nhất có thể, nên thay được bằng kho rỗng. */
export type KhoCucBo = Pick<Storage, 'getItem' | 'setItem'>;

/** Kho **không nhớ gì**: dùng khi môi trường không có `localStorage`. */
export const KHO_RONG: KhoCucBo = {
  getItem: () => null,
  setItem: () => undefined,
};

export function khoCucBo(): KhoCucBo {
  try {
    const k: Storage | undefined = globalThis.localStorage;
    // `typeof` chứ không `!= null`: một đối tượng lạ không có `getItem` cũng loại.
    return typeof k?.getItem === 'function' && typeof k.setItem === 'function' ? k : KHO_RONG;
  } catch {
    return KHO_RONG;
  }
}

/**
 * Đọc một khoá. **Mọi lần ném đều thành `null`**, không chỉ lúc lấy kho: Safari
 * ném ở *chính lời gọi* `getItem` khi quota/chính sách đổi giữa phiên.
 */
export function doc(khoa: string, kho: KhoCucBo = khoCucBo()): string | null {
  try {
    return kho.getItem(khoa);
  } catch {
    return null;
  }
}

/** Ghi một khoá. Ném (hết quota, chế độ riêng tư) ⇒ **bỏ qua**, không vỡ trang. */
export function ghi(khoa: string, gia_tri: string, kho: KhoCucBo = khoCucBo()): void {
  try {
    kho.setItem(khoa, gia_tri);
  } catch {
    /* không nhớ được thì thôi — xem khối ghi chú đầu file. */
  }
}
