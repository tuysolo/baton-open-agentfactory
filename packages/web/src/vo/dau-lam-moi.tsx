/**
 * **Dấu "đang làm mới"** — ô dành sẵn, chiều cao cố định.
 *
 * Hai điều component này giữ, và cả hai là lý do nó tồn tại thay vì một
 * `{isFetching ? <p/> : null}` rải trong từng trang:
 *
 *   * **Ô luôn có mặt trong DOM.** Hiện hay không hiện chỉ đổi *nội dung* ô, nên
 *     nội dung bên dưới không bị đẩy xuống rồi kéo lên. Một `null` có điều kiện
 *     thì ngược lại: mỗi lượt refetch là một lần cả trang nhảy một dòng — đúng
 *     thứ chủ báo "giao diện xô lệch liên tục".
 *   * **Chỉ hiện khi lượt tải chậm quá ngưỡng** (`useNhipLamMoi` quyết định, xem
 *     `src/lam-moi.ts`). Component này không tự đọc `isFetching`.
 *
 * `aria-live="polite"` chứ không `role="status"` đặt theo điều kiện: vùng phải
 * tồn tại **trước** khi chữ xuất hiện để trình đọc màn hình thông báo được phần
 * đổi; một vùng `aria-live` vừa mọc ra cùng chữ thì nhiều trình đọc bỏ qua.
 */

/** Chữ của dấu. Hằng có tên để ca test ghim **đúng câu**, không một chuỗi gõ lại. */
export const CAU_DANG_LAM_MOI = 'Đang làm mới…';

export function DauLamMoi({ hien }: { hien: boolean }): React.JSX.Element {
  return (
    <div
      data-dau-lam-moi={hien ? 'co' : 'khong'}
      aria-live="polite"
      /*
       * `h-4` = đúng chiều cao một dòng `text-xs`. Chiều cao **cố định**, không
       * `min-h`: một `min-h` vẫn cho ô cao lên nếu câu dài hơn một dòng.
       */
      className="h-4 text-xs leading-4 text-neutral-400"
    >
      {hien ? CAU_DANG_LAM_MOI : null}
    </div>
  );
}
