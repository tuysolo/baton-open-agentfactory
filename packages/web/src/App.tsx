/**
 * **Cổng vào của giao diện**: `/v1/toi` quyết định vẽ trang đăng nhập hay vỏ.
 *
 * Luật là SPEC mục 15 d.415–416, và nó chỉ có **một** chỗ cài: không có phiên thì
 * **không một mảnh nào** của vỏ được dựng. Không phải chuyện thẩm mỹ — mỗi
 * component của vỏ tự gọi API (sidebar gọi `/v1/du-an` và `/v1/can-chu`), nên
 * dựng vỏ rồi mới che bằng một lớp phủ sẽ là một màn hình đã bắn một loạt request
 * cho một người chưa đăng nhập.
 *
 * Câu hỏi "còn phiên không" **không** được trả lời ở trang: `/v1/toi` trả 401 cho
 * cả ba ca (không có, đã huỷ, hết hạn), và cổng xác thực của Worker đã quyết định
 * trước khi handler chạy. Trang chỉ đọc kết quả.
 *
 * `retry: false` cho query này: 401 là một **câu trả lời**, không một lần trượt —
 * thử lại ba lần là ba request vô ích và một màn hình chờ dài ba nhịp.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { layToi } from './api';
import { IconDong } from './vo/icon';
import { LOP_CAU_CHO } from './vo/lop-nut';
import { DinhTuyen } from './dinh-tuyen';
import { TrangDangNhap } from './trang/dang-nhap';
import { Sidebar } from './vo/sidebar';
import { BangPhim, usePhimVo } from './vo/phim-vo';
import { CommandMenu, useCommandMenu } from './vo/command-menu';
import { HopTaoViec, useHopTaoViec } from './vo/tao-viec';
import { MoTaoViecContext } from './vo/mo-tao-viec';
import { ThanhTren } from './vo/thanh-tren';
import { KhuToast } from './vo/toast';
import { BaoBanMoi } from './vo/ban-moi';

export const CAU_DANG_TAI = 'Đang tải…';

export function App(): React.JSX.Element {
  const toi = useQuery({ queryKey: ['toi'], queryFn: layToi, retry: false });

  if (toi.isPending) {
    return (
      <p role="status" className={`p-6 ${LOP_CAU_CHO}`}>
        {CAU_DANG_TAI}
      </p>
    );
  }

  /*
   * **Mọi** lỗi ở đây dẫn tới trang đăng nhập, không chỉ 401.
   *
   * 403 là ca d.416 (một token agent gọi đường này) và cũng là "không phải chủ,
   * không vào vỏ". Một lỗi mạng thì không có dữ liệu để vẽ vỏ. Vỏ chỉ được dựng
   * khi có một thân `{ loai: 'chu' }` **đọc được** — fail-closed, cùng nếp
   * `TOKEN_CHU` rỗng của tầng máy chủ.
   *
   * **`toi.isError` là DƯ THỪA hôm nay, và giữ lại có chủ ý.** Khi query lỗi thì
   * `toi.data` là `undefined`, nên `data?.loai !== 'chu'` đã đúng — bỏ vế
   * `isError` đi thì **không ca nào đỏ** (đã đo bằng đột biến; khai thẳng thay vì
   * khai nó là chỗ cài luật). Giữ vì nó là vế duy nhất còn đúng nếu một lượt sau
   * đặt `placeholderData`/`initialData` cho query này — lúc đó `data` có giá trị
   * **trong khi** query đang lỗi, và không có `isError` thì vỏ được dựng cho một
   * người không có phiên.
   *
   * Vế `data?.loai !== 'chu'` thì **không** dư: nó canh ca 200-mà-thân-lạ (máy
   * chủ đổi hình thân, một proxy chen vào, một bản API cũ) — có ca riêng.
   */
  if (toi.isError || toi.data?.loai !== 'chu') return <TrangDangNhap />;

  return <Vo />;
}

export const NHAN_DONG_MENU = 'Đóng menu';
/**
 * Lớp mờ cũng đóng được menu, nhưng mang **nhãn khác** nút ✕: hai phần tử cùng
 * một nhãn làm mọi phép tìm theo nhãn thấy hai cái, và trình đọc màn hình đọc
 * "Đóng menu" hai lần liền.
 */
export const NHAN_DONG_MENU_NGOAI = 'Đóng menu (bấm ra ngoài)';
/** Nhãn của menu trượt trên điện thoại — ca test gọi ra bằng nhãn này. */
export const NHAN_MENU_TRUOT = 'Menu điều hướng';

/**
 * Vỏ: sidebar bên trái (d.391–394), nội dung bên phải.
 *
 * `KhuToast` bọc **cả vỏ**, không từng trang: d.408 nói về "mọi thao tác sửa",
 * nên chỗ báo lỗi phải là một, và nó phải sống **qua** việc chuyển trang — một
 * toast nằm trong trang sẽ biến mất đúng lúc chủ bấm sang trang khác.
 *
 * ## 375px: sidebar thành menu trượt (d.411)
 *
 * Dưới `md`, sidebar thường trú bị ẩn (`hidden md:block`) và thay bằng một lớp
 * phủ chỉ dựng khi chủ bấm nút menu. **Dựng khi mở, không `hidden` suốt**: hai
 * `<nav aria-label="Điều hướng chính">` cùng nằm trong cây sẽ làm mọi phép tìm
 * theo vai ARIA thấy hai phần tử (và trình đọc màn hình đọc hai lần) — thứ chỉ
 * phát hiện được khi một ca test đỏ vì "found multiple elements".
 *
 * Bấm một mục trong menu thì **menu đóng**: trên điện thoại menu che cả trang,
 * nên để nó mở sau khi chuyển trang là che đúng cái chủ vừa bấm để xem.
 *
 * ## Một `role="dialog"` phải cư xử như một dialog
 *
 * Bản đầu chỉ có vai ARIA, nên nó **nói** là dialog mà không **làm**: trang dưới
 * vẫn cuộn, `Escape` không đóng, và trình đọc màn hình vẫn đọc cả nội dung phía
 * sau lớp mờ. Ba thứ đã thêm:
 *
 *   * `aria-modal="true"` — phần còn lại của trang là nền, không nội dung;
 *   * **khoá cuộn `body`** khi mở, trả lại **đúng giá trị cũ** khi đóng (không
 *     gán cứng `''`: một lượt sau đặt `overflow` cho `body` vì lý do khác sẽ bị
 *     chỗ này xoá);
 *   * `Escape` đóng, và **`onKeyDown` đặt trên chính dialog**, KHÔNG một
 *     listener `window`: listener `window` duy nhất của vỏ là phím toàn cục
 *     `C` / `G` rồi `T`/`O`/`N` / `?` (BAT-22, BAT-23, `vo/phim-vo.tsx`), và nó
 *     chỉ chạm đúng các phím đó — một listener vỏ nghe rộng hơn sẽ ăn phím
 *     trước phím tắt trong trang của d.270. Vì sự kiện bàn phím chỉ bọt lên từ phần tử **đang focus**, dialog
 *     tự lấy focus khi mở (`tabIndex={-1}` + `focus()`), và khi đóng thì focus
 *     **trả về nút "Mở menu"** — nếu không, con trỏ bàn phím rơi về đầu trang.
 *
 * Bẫy focus đầy đủ (Tab vòng trong dialog) thì **chưa làm**, khai thẳng: nó cần
 * một vòng quét phần tử focus được và không có ca test nào ở đợt này đo được nó.
 *
 * ## Hộp tạo việc (BAT-22, d.413)
 *
 * Một hộp cho cả vỏ, mở bằng nút "Tạo việc" của sidebar **hoặc** phím `C`
 * (`useHopTaoViec`), hoặc (BAT-62) nút `+` ở đầu cột Cần làm của bảng, hoặc
 * (BAT-63) nút `+` ở đầu nhóm Backlog của kiểu Danh sách — hai nút sau qua
 * `MoTaoViecContext`; nút Backlog mở với Backlog chọn sẵn. Nằm **trong** `KhuToast` (lỗi máy chủ cũng ra toast) và
 * **trong** vỏ, nên nó không bao giờ có ở trang đăng nhập. Bấm "Tạo việc" từ menu
 * trượt thì menu đóng trước: hai hộp `aria-modal` chồng nhau là hai lớp nền.
 */
function Vo(): React.JSX.Element {
  const [mo_menu, datMoMenu] = useState(false);
  const tao_viec = useHopTaoViec();
  const tim_nhanh = useCommandMenu();
  // Listener phím DUY NHẤT của vỏ: `Cmd/Ctrl+K`, `C`, `G` rồi `T`/`O`/`N`, `?` (BAT-23, BAT-34).
  const bang_phim = usePhimVo(tao_viec.moHop, tim_nhanh.moMenu);
  const o_dialog = useRef<HTMLDivElement | null>(null);
  const o_nut_menu = useRef<HTMLButtonElement | null>(null);

  const dongMenu = useCallback(() => {
    datMoMenu(false);
    o_nut_menu.current?.focus();
  }, []);

  useEffect(() => {
    if (!mo_menu) return undefined;
    o_dialog.current?.focus();
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
    };
  }, [mo_menu]);

  return (
    <KhuToast>
      <div className="flex min-h-screen bg-nen text-chu">
        {/*
         * `sticky top-0 h-screen self-start`: aside CAO ĐÚNG MỘT MÀN HÌNH và dính
         * đầu cửa sổ. Lỗi BAT-11 việc 3: không có chiều cao chặn, aside giãn
         * theo cả trang nội dung nên `nav h-full` không có đáy cửa sổ và "Cài đặt"
         * (d.394, dưới cùng) trôi xuống đáy CẢ TRANG. Có nó, khối dự án cuộn bên
         * trong và Cài đặt luôn ở đáy cửa sổ.
         */}
        <aside className="sticky top-0 hidden h-screen shrink-0 self-start border-r border-vien md:block">
          <Sidebar onTaoViec={tao_viec.moHop} onTimNhanh={tim_nhanh.moMenu} />
        </aside>

        {mo_menu ? (
          <div
            ref={o_dialog}
            role="dialog"
            aria-modal="true"
            aria-label={NHAN_MENU_TRUOT}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') dongMenu();
            }}
            /*
             * Không tắt outline (THIET-KE "Bàn phím trước", BAT-67). Khung phủ cả
             * màn hình và bị con che kín (lớp mờ, tấm sidebar), nên vòng của chính
             * khung không nhìn thấy được dù offset âm hay dương. Vòng được vẽ lên
             * **tấm sidebar** — phần nhìn thấy của hộp — qua `group-focus-visible:`:
             * cùng nét 2px màu nhấn của vòng chung, offset âm (tấm sát mép trái,
             * trên, dưới).
             */
            className="group fixed inset-0 z-40 flex"
          >
            {/* Lớp mờ: bấm ra ngoài là đóng — cử chỉ chủ nào cũng thử trước. */}
            <button
              type="button"
              aria-label={NHAN_DONG_MENU_NGOAI}
              onClick={dongMenu}
              /*
               * Token `lop-phu` (đen 50% ở **cả hai** chế độ, BAT-69), **không**
               * `bg-neutral-950/50`: thang `neutral` là thang tương phản đảo
               * chiều (xem `kieu.css`), nên ở chế độ tối `neutral-950` là màu
               * **gần trắng** — một lớp phủ trắng.
               */
              className="absolute inset-0 bg-lop-phu"
            />
            <div
              data-o="tam-menu-truot"
              className="relative z-10 h-full border-r border-vien bg-nen shadow-lg group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-nhan-manh"
            >
              <Sidebar
                onDieuHuong={dongMenu}
                onTaoViec={() => {
                  dongMenu();
                  tao_viec.moHop();
                }}
                onTimNhanh={() => {
                  dongMenu();
                  tim_nhanh.moMenu();
                }}
              />
            </div>
            <button
              type="button"
              aria-label={NHAN_DONG_MENU}
              onClick={dongMenu}
              className="relative z-10 m-2 flex size-11 items-center justify-center self-start rounded-lg border border-vien bg-nen-lop text-chu-mo hover:text-chu"
            >
              <IconDong />
            </button>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <ThanhTren
            nut_menu_ref={o_nut_menu}
            menu_dang_mo={mo_menu}
            onMoMenu={() => {
              datMoMenu(true);
            }}
          />
          {/* BAT-39: tab chạy bản cũ sau deploy ⇒ một dòng "Có bản mới — tải lại trang". */}
          <BaoBanMoi />
          <main className="min-w-0 flex-1">
            {/*
             * BAT-62/63: trang mở **chính** hộp này (nút `+` ở cột Cần làm của
             * bảng, ở nhóm Backlog của danh sách) qua context lá
             * `vo/mo-tao-viec.ts` — không hộp thứ hai.
             */}
            <MoTaoViecContext.Provider value={tao_viec.moHop}>
              <DinhTuyen />
            </MoTaoViecContext.Provider>
          </main>
        </div>
      </div>
      {tao_viec.mo ? (
        <HopTaoViec dong={tao_viec.dongHop} trang_thai_dau={tao_viec.trang_thai_dau} />
      ) : null}
      {bang_phim.mo ? <BangPhim dong={bang_phim.dong} /> : null}
      {tim_nhanh.mo ? <CommandMenu dong={tim_nhanh.dongMenu} /> : null}
    </KhuToast>
  );
}
