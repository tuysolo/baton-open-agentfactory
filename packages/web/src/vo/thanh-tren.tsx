/**
 * Thanh trên của vỏ: nút mở menu (375px), breadcrumb, nút sáng/tối.
 *
 * **Hai nút đăng xuất KHÔNG còn ở đây** — SPEC mục 14 d.401: "Tên workspace mở
 * một menu chứa **Đăng xuất** và **Đăng xuất mọi nơi** (mục 15); hai nút này
 * **không nằm trần trên thanh trên**." Chúng đã sang `vo/sidebar.tsx`
 * (`MenuWorkspace`), **mang theo nguyên** cả hai đường của d.415 và cả `onSettled`
 * (bỏ mọi query trừ `['toi']`, rồi `invalidate` đúng `['toi']`) — lý lẽ đầy đủ
 * của `onSettled` nay ở khối ghi chú của `MenuWorkspace`, và `DuongDan` dưới đây
 * vẫn phụ thuộc nó (xem ghi chú `enabled: false`).
 */

import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { layDuAn } from '../api';
import { DAU_CHANG, duongDanTuUrl } from './duong-dan';
import { IconMenu } from './icon';
import { NutTheme } from './nut-theme';

export const NHAN_MO_MENU = 'Mở menu';
/** Nhãn của breadcrumb — ca test gọi ra bằng vai ARIA, không bằng class. */
export const NHAN_DUONG_DAN = 'Đường dẫn trang';
/** Chỗ của nút hành động bên phải thanh trên (vỏ đặt nút sáng/tối ở cuối). */
export const CHON_O_HANH_DONG_THANH_TREN = '[data-o="thanh-tren-hanh-dong"]';

export function ThanhTren({
  onMoMenu,
  /*
   * Vỏ giữ một `ref` tới nút này để **trả focus về đây** khi menu trượt đóng
   * (xem khối ghi chú của `Vo` trong `App.tsx`). Không có nó thì sau khi đóng
   * menu, con trỏ bàn phím rơi về đầu tài liệu.
   */
  nut_menu_ref,
  menu_dang_mo = false,
}: {
  onMoMenu?: () => void;
  nut_menu_ref?: React.Ref<HTMLButtonElement>;
  /** Trạng thái menu trượt — nút mở menu nói ra bằng `aria-expanded`. */
  menu_dang_mo?: boolean;
} = {}): React.JSX.Element {
  return (
    /*
     * Thanh mảnh (40px từ `md`) theo hệ thiết kế 29/10 (`THIET-KE.md`), hai vùng
     * từ trái sang phải:
     *   1. breadcrumb (Dự án › Ticket) — co lại và cắt chữ khi hẹp;
     *   2. **nút hành động bên phải** (`data-o="thanh-tren-hanh-dong"`) — vỏ đặt
     *      nút sáng/tối ở cuối.
     *
     * Bộ lọc dạng tab-pill **không** nằm ở đây: nó ở hàng tiêu đề của chính
     * trang (danh sách ticket: lọc nhanh + kiểu xem). BAT-61 gỡ chỗ trống
     * `thanh-tren-loc` của BAT-60 — đưa bộ lọc lên thanh trên cần portal hoặc
     * context từ trang lên vỏ, đổi thứ tự Tab và chỗ của phím lọc, tức đổi hành
     * vi; một chỗ để trống mãi thì chỉ là mã chết.
     */
    <header className="flex min-h-10 shrink-0 items-center gap-3 border-b border-vien px-3 text-sm">
      {/*
       * Nút mở menu — **chỉ dưới `md`** (d.411: điện thoại 375px dùng tốt). Ở
       * khổ lớn sidebar nằm thường trú nên nút này không có việc gì làm; để nó
       * hiện ở mọi khổ là hai đường vào cùng một thứ.
       */}
      <button
        ref={nut_menu_ref}
        type="button"
        aria-label={NHAN_MO_MENU}
        aria-expanded={menu_dang_mo}
        onClick={onMoMenu}
        className="-ml-2 flex size-11 items-center justify-center rounded text-chu-mo hover:bg-nen-lop hover:text-chu md:hidden"
      >
        <IconMenu />
      </button>

      <DuongDan />

      <div data-o="thanh-tren-hanh-dong" className="ml-auto flex shrink-0 items-center gap-2">
        {/*
         * Nút sáng/tối ở **góc trên phải** — một chỗ duy nhất trong cả giao diện
         * (xem `quyet-dinh.md` và khối ghi chú đầu `vo/nut-theme.tsx`).
         */}
        <NutTheme />
      </div>
    </header>
  );
}

/**
 * **Tiêu đề trang dạng breadcrumb** — "Sample › Việc".
 *
 * Tên dự án tra từ **cùng `queryKey` `['du-an']` mà sidebar dùng**, và với
 * `enabled: false`: breadcrumb **chỉ đọc** cache, sidebar là chỗ đi hỏi.
 *
 * Không phải để tiết kiệm một request (TanStack Query vốn gộp hai người dùng một
 * khoá). Lý do thật: một observer **đang hỏi** cho khoá này sẽ **tự tạo lại
 * query ngay sau khi nó bị xoá** — và `removeQueries` lúc đăng xuất (xem
 * `ra.onSettled` ở trên) là một lệnh xoá. Hệ quả: dữ liệu dự án của chủ quay lại
 * cache ngay trong lượt đăng xuất, tức đúng vế d.415 mà `onSettled` tồn tại để
 * giữ. Đã thấy thật: ca "dữ liệu của chủ bị bỏ khỏi cache khi đăng xuất" đỏ.
 * `enabled: false` thì observer này không hỏi gì, nhưng vẫn **nhận cập nhật**
 * khi sidebar hỏi xong — breadcrumb vẫn đổi từ mã sang tên dự án.
 *
 * Luật "đường nào ra chặng nào" nằm ở `duong-dan.ts` (hàm thuần, có ca test);
 * ở đây chỉ còn việc vẽ.
 */
function DuongDan(): React.JSX.Element {
  const { pathname } = useLocation();
  const du_an = useQuery({ queryKey: ['du-an'], queryFn: layDuAn, enabled: false });
  const chang = duongDanTuUrl(pathname, (ma) =>
    du_an.data?.items.find((d) => d.ma === ma || d.id === ma)?.ten,
  );

  return (
    <nav aria-label={NHAN_DUONG_DAN} className="flex min-w-0 items-center gap-1.5">
      {chang.map((c, i) => (
        <span key={`${String(i)}-${c}`} className="flex min-w-0 items-center gap-1.5">
          {i > 0 ? (
            <span aria-hidden className="text-chu-mo-hon">
              {DAU_CHANG}
            </span>
          ) : null}
          <span
            data-chang={i === chang.length - 1 ? 'cuoi' : 'giua'}
            className={
              i === chang.length - 1 ? 'truncate font-medium text-chu' : 'truncate text-chu-mo'
            }
          >
            {c}
          </span>
        </span>
      ))}
    </nav>
  );
}
