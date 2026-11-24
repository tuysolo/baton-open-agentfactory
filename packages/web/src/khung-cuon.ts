/**
 * **Đo khung cuộn cho bộ ảo hoá** — mảnh đỡ của SPEC mục 14 d.409 ("danh sách
 * 5.000 ticket cuộn mượt").
 *
 * ## Vấn đề thật mà file này giải
 *
 * TanStack Virtual quyết vẽ bao nhiêu dòng từ **chiều cao đo được** của khung
 * cuộn. Chiều cao đó là `0` ở hai lúc có thật:
 *
 *   1. **Lần vẽ đầu tiên**, trước khi trình duyệt xong layout — khung đã có trong
 *      DOM nhưng chưa có kích thước.
 *   2. **Trong jsdom**, luôn luôn: `getBoundingClientRect` trả 0 cho mọi thứ.
 *
 * Với chiều cao `0`, bộ ảo hoá vẽ **0 dòng**. Ở ca (1) đó là một nháy trắng; ở ca
 * (2) đó là một bộ test không đo được gì — mọi ca "danh sách hiện ticket" sẽ đỏ,
 * và (tệ hơn) một ca viết tránh nó sẽ xanh mà không chứng minh gì.
 *
 * Nên `doKhung` trả **bệ đỡ** khi chiều cao đo được là 0, và chỉ khi đó. Đây
 * không phải một mẹo cho test: nó là câu trả lời đúng cho "chưa đo được thì vẽ
 * theo giả định nào" — và giả định một màn hình cao `CHIEU_CAO_BE_DO` px là giả
 * định rẻ nhất (vẽ thừa vài dòng ở lần đầu, rồi lần đo thật sửa lại ngay).
 */

/** Chiều cao giả định khi **chưa đo được** — xấp xỉ một màn hình laptop. */
export const CHIEU_CAO_BE_DO = 720;

/**
 * Chiều cao **ước lượng** của một thẻ việc, px — bộ ảo hoá cần một số **trước**
 * khi đo.
 *
 * ## Vì sao con số này không còn là một pitch cứng
 *
 * Bản đầu dùng `56` làm **pitch cứng** (`estimateSize` trả nó cho mọi dòng và
 * không đo lại). Khi thẻ việc của BAT-6 đợt 2 thành ba hàng (mã + tiêu đề hai
 * dòng + hàng nhãn/thời gian), chiều cao thật là ~110–150px, nên mỗi dòng được
 * đặt cách nhau 56px và **các thẻ đè lên nhau**; tổng chiều cao khung cũng sai,
 * tức thanh cuộn nói sai — trái d.409.
 *
 * jsdom không có layout nên **không ca test nào** thấy được chuyện đó. Nên lời
 * đáp là **đo thật trên trình duyệt** (`measureElement`) cộng một **bệ đỡ** đúng
 * nếp `doKhung`: chưa đo được thì dùng ước lượng. Và vì phép đo không kiểm
 * chứng được trong jsdom, phần kiểm chứng rơi vào `tuyChonDanhSachAo` — một hàm
 * thuần dựng **chính** bộ tuỳ chọn mà component truyền vào, nên ca test ghim
 * được "có truyền `measureElement`" và "ước lượng của tiêu đề nhóm khác ước
 * lượng của thẻ".
 */
export const CHIEU_CAO_DONG = 112;

/** Ước lượng chiều cao một **tiêu đề nhóm** (một hàng chữ), px. */
export const CHIEU_CAO_NHOM = 36;

/** Số dòng vẽ thêm ngoài vùng thấy, để cuộn không thấy khoảng trắng. */
export const DEM_VE_THEM = 8;

export interface KhungDo {
  width: number;
  height: number;
}

/**
 * Chiều cao dùng được từ một phép đo. `0` (và mọi giá trị không hợp lệ) ⇒ bệ đỡ.
 *
 * Hàm thuần, nên luật "0 thì dùng bệ đỡ, khác 0 thì dùng số đo thật" có ca test
 * riêng — không phải suy ra từ việc một danh sách có hiện hay không.
 */
export function chieuCaoDungDuoc(do_duoc: number): number {
  return Number.isFinite(do_duoc) && do_duoc > 0 ? do_duoc : CHIEU_CAO_BE_DO;
}

/** Phép đo một phần tử, đã áp bệ đỡ. */
export function doKhung(el: Element | null): KhungDo {
  if (el === null) return { width: 0, height: CHIEU_CAO_BE_DO };
  const r = el.getBoundingClientRect();
  return { width: r.width, height: chieuCaoDungDuoc(r.height) };
}

/**
 * `observeElementRect` cho `useVirtualizer` — bản của TanStack cộng bệ đỡ.
 *
 * Vẫn **theo dõi tiếp** bằng `ResizeObserver` khi có (trình duyệt thật): một lần
 * đổi khổ cửa sổ phải đổi số dòng vẽ. Không có `ResizeObserver` (jsdom) thì đo
 * một lần là đủ — ở đó không có gì đổi khổ.
 */
export function theoDoiKhung(
  el: Element | null,
  cb: (r: KhungDo) => void,
): (() => void) | undefined {
  cb(doKhung(el));
  if (el === null || typeof ResizeObserver === 'undefined') return undefined;
  const ob = new ResizeObserver(() => {
    cb(doKhung(el));
  });
  ob.observe(el);
  return () => {
    ob.disconnect();
  };
}

/* ================================================================== *
 * Bộ tuỳ chọn của danh sách ảo hoá — một hàm thuần, để ghim được
 * ================================================================== */

/**
 * Ước lượng một dòng: tiêu đề nhóm thấp, thẻ việc cao.
 *
 * Một ước lượng **chung cho cả hai** loại dòng là lý do cũ làm thanh cuộn nhảy:
 * bảy tiêu đề nhóm cao 36px bị tính là 112px mỗi cái.
 */
export function uocChieuCaoDong(la_nhom: boolean): number {
  return la_nhom ? CHIEU_CAO_NHOM : CHIEU_CAO_DONG;
}

/**
 * Chiều cao **đo được** của một dòng, đã áp bệ đỡ: `0` (chưa layout, hoặc jsdom)
 * ⇒ dùng ước lượng. Cùng luật `chieuCaoDungDuoc`, nhưng bệ đỡ là **ước lượng của
 * chính dòng đó**, không phải chiều cao một màn hình.
 */
export function doChieuCaoDong(el: Element, uoc: number): number {
  const h = el.getBoundingClientRect().height;
  return Number.isFinite(h) && h > 0 ? h : uoc;
}

/** Bộ tuỳ chọn truyền thẳng vào `useVirtualizer`. */
export interface TuyChonAo {
  count: number;
  getScrollElement: () => HTMLDivElement | null;
  estimateSize: (i: number) => number;
  /** **Có mặt là bắt buộc**: không có nó thì mọi dòng dùng ước lượng và đè nhau. */
  measureElement: (el: Element) => number;
  overscan: number;
  observeElementRect: (
    inst: { scrollElement: Element | null },
    cb: (r: KhungDo) => void,
  ) => (() => void) | undefined;
}

/**
 * **Bộ tuỳ chọn của danh sách ticket ảo hoá** — d.409.
 *
 * Hàm thuần và xuất ra, không một object literal trong thân component: jsdom
 * không đo được layout, nên cách duy nhất để một ca test chứng minh "có đo thật"
 * là đọc **chính** bộ tuỳ chọn. Bỏ `measureElement` đi là một ca đỏ.
 *
 * `measureElement` đọc **`data-index`** của phần tử (quy ước của TanStack
 * Virtual, cũng là cách nó tra ngược từ phần tử ra chỉ số), nên `<li>` phải mang
 * thuộc tính đó — có ca test ghim.
 */
export function tuyChonDanhSachAo(
  so_dong: number,
  laNhom: (i: number) => boolean,
  layKhung: () => HTMLDivElement | null,
): TuyChonAo {
  return {
    count: so_dong,
    getScrollElement: layKhung,
    estimateSize: (i) => uocChieuCaoDong(laNhom(i)),
    measureElement: (el) =>
      doChieuCaoDong(el, uocChieuCaoDong(laNhom(Number(el.getAttribute('data-index'))))),
    overscan: DEM_VE_THEM,
    observeElementRect: (inst, cb) => theoDoiKhung(inst.scrollElement, cb),
  };
}
