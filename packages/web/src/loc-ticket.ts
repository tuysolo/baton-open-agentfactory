/**
 * **Luật thuần của danh sách / bảng ticket** — SPEC mục 14 d.395–397, d.409.
 *
 * Mọi thứ trong file này là hàm thuần hoặc hằng, cố ý: bộ lọc trên URL, cách gom
 * theo trạng thái, cách làm phẳng danh sách cho bộ ảo hoá, và hai phép sửa cache
 * của cập nhật lạc quan đều **test được không cần DOM**. Component chỉ còn việc
 * vẽ và nối sự kiện.
 *
 * | Vế SPEC | Ở đâu |
 * |---|---|
 * | d.396 chín bộ lọc, **ghi trên URL** | `KHOA_LOC_TICKET`, `locTuUrl`, `urlTuLoc` |
 * | d.396 **lưu thành view riêng** | `docView`, `luuView`, `boView` |
 * | d.396 hai kiểu xem (danh sách gom / bảng) | `KIEU_XEM`, `kieuXemTuUrl` |
 * | d.396 danh sách **gom theo trạng thái** | `gomTheoTrangThai`, `lamPhang` |
 * | d.396 bảng: cột là trạng thái | `COT_BANG` |
 * | d.396 kéo vào Xong thiếu bằng chứng ⇒ **bật về chỗ cũ** | `doiTrangThaiTrongTrang` |
 * | d.409 5.000 ticket cuộn mượt | `lamPhang` (một mảng phẳng cho bộ ảo hoá) |
 */

import type { ManHinhDanhSach, TicketDong, TrangThaiTicket, UuTien } from './api';
import { doc as docKho, ghi as ghiKho } from './kho-cuc-bo';

/* ================================================================== *
 * 0. Nhãn của bảng 0.1 — một chỗ, cắt đối chiếu trong test
 * ================================================================== *
 * Cùng nếp `NHAN_LOAI` của `trang/can-chu.tsx`: nhãn gõ ở đây, và
 * `test/doc-spec.ts` cắt **bản gốc từ `SPEC.md`** rồi so với đúng các hằng này.
 * Sửa một nhãn ở đây mà SPEC không đổi ⇒ đỏ, và ngược lại.
 *
 * Vì sao không lấy nhãn từ máy chủ như mọi chỗ khác: cột của **bảng** (d.396) và
 * lựa chọn của **ô lọc** phải hiện đủ bảy trạng thái **kể cả khi không có ticket
 * nào** ở trạng thái đó — một cột Xong chỉ xuất hiện khi đã có ticket Xong là một
 * bảng không kéo được gì vào Xong. Nhãn theo từng **dòng** vẫn đọc từ
 * `nhan_trang_thai` của máy chủ.
 */

/** Bảy trạng thái, **đúng thứ tự bảng 0.1** — cũng là thứ tự cột của bảng d.396. */
export const TRANG_THAI_THEO_THU_TU: readonly TrangThaiTicket[] = [
  'backlog',
  'todo',
  'in_progress',
  'verifying',
  'done',
  'canceled',
  'duplicate',
];

export const NHAN_TRANG_THAI: Record<TrangThaiTicket, string> = {
  backlog: 'Backlog',
  todo: 'Cần làm',
  in_progress: 'Đang làm',
  verifying: 'Chờ kiểm chứng',
  done: 'Xong',
  canceled: 'Huỷ',
  duplicate: 'Trùng',
};

export const UU_TIEN_THEO_THU_TU: readonly UuTien[] = ['urgent', 'high', 'medium', 'low', 'none'];

export const NHAN_UU_TIEN: Record<UuTien, string> = {
  urgent: 'Khẩn',
  high: 'Cao',
  medium: 'Vừa',
  low: 'Thấp',
  none: 'Không',
};

/** Cột của **bảng** d.396 — đúng bảy trạng thái, đúng thứ tự trên. */
export const COT_BANG = TRANG_THAI_THEO_THU_TU;

/**
 * **Sáu cột của bảng** — SPEC mục 14 (Chủ chốt T-111 = A, 29/10; BAT-64):
 * Backlog · Cần làm · Đang làm · Chờ kiểm chứng · Xong · Huỷ. Đây là **cột thật**
 * của `BangKeo`, không chỉ một thuộc tính đánh dấu.
 *
 * Chúng **không** phải `nhom_trang_thai` của máy chủ (`planned`/`active`/`closed`
 * — ba nhóm). Bảy trạng thái của bảng 0.1 vào sáu cột thế nào (`spec-questions.md`
 * #131, #137):
 *
 *   * `backlog` — **có cột riêng, đứng đầu bên trái** (T-111 A). *Lịch sử:* từ
 *     BAT-6 đợt 2 tới BAT-63 bảng chỉ có năm cột, Backlog không có cột (đường
 *     tới nó là nút lọc nhanh **Backlog** và nhóm Backlog của kiểu Danh sách —
 *     cả hai vẫn còn).
 *   * `duplicate` — **gộp hiển thị vào cột Huỷ** (cùng nhóm `closed`, cùng nghĩa
 *     "không làm nữa"). Thẻ `duplicate` trong cột ấy vẫn hiện
 *     `nhan_trang_thai` **của máy chủ** nên nhìn ra được là Trùng.
 *
 * Không trạng thái nào mất đường tới: ô trạng thái của panel (d.404) giữ đủ
 * **bảy** giá trị (`COT_BANG`). Và kéo thả vào cột Huỷ đặt `canceled`, **không bao giờ**
 * `duplicate` — `duplicate` cần một ticket gốc hợp lệ (`INVALID_DUPLICATE_TARGET`
 * của mục 13), thứ một cử chỉ kéo không nói được.
 *
 * Một mảng, một chỗ: chốt khác là sửa đúng mảng này và `TRANG_THAI_TRONG_COT`.
 */
export const NHOM_COT_CHU: readonly TrangThaiTicket[] = [
  'backlog',
  'todo',
  'in_progress',
  'verifying',
  'done',
  'canceled',
];

/**
 * Trạng thái nào hiện trong cột nào. Mọi cột là một-một, **trừ** `canceled` —
 * xem ghi chú `NHOM_COT_CHU`.
 */
export const TRANG_THAI_TRONG_COT: Record<string, readonly TrangThaiTicket[]> = {
  backlog: ['backlog'],
  todo: ['todo'],
  in_progress: ['in_progress'],
  verifying: ['verifying'],
  done: ['done'],
  canceled: ['canceled', 'duplicate'],
};

/** Cột này có thuộc sáu cột của bảng không — dùng cho `data-nhom-chu`. */
export function laNhomChu(tt: TrangThaiTicket): boolean {
  return NHOM_COT_CHU.includes(tt);
}

/** Một cột của bảng: mã cột (= trạng thái đích khi kéo vào), nhãn, và thẻ. */
export interface NhomCot {
  /** **Cũng là id vùng thả**, nên nó phải là một trạng thái thật. */
  cot: TrangThaiTicket;
  nhan: string;
  items: TicketDong[];
}

/**
 * **Gom theo sáu cột của bảng** — kiểu xem bảng (T-111 A, 29/10; BAT-64).
 *
 * Khác `gomTheoTrangThai` (bảy nhóm, cho kiểu xem danh sách) ở một điều, và nó
 * cố ý: cột Huỷ **gộp** `duplicate`. Ticket `backlog` ra **cột Backlog** (đầu
 * bên trái). *Lịch sử:* trước BAT-64 ticket `backlog` không ra cột nào.
 *
 * Sáu cột **luôn có mặt**, kể cả cột rỗng: chỉ hiện cột có thẻ thì bảng nhảy
 * thứ tự theo dữ liệu, và kéo vào một cột không tồn tại thì không kéo được.
 */
export function gomTheoCotChu(ds: readonly TicketDong[]): NhomCot[] {
  return NHOM_COT_CHU.map((cot) => {
    const trong = TRANG_THAI_TRONG_COT[cot] ?? [cot];
    return {
      cot,
      nhan: NHAN_TRANG_THAI[cot],
      // Giữ nguyên thứ tự máy chủ trả về — xem `gomTheoTrangThai`.
      items: ds.filter((t) => trong.includes(t.trang_thai)),
    };
  });
}

export const TEN_TRANG_DANH_SACH = 'Danh sách ticket';
/** Nhãn của lựa chọn "tất cả" trong ô lọc dự án — d.395 ("Tất cả dự án"). */
export const NHAN_TAT_CA_DU_AN = 'Tất cả dự án';

/* ================================================================== *
 * 1. Bộ lọc — d.396, **ghi trên URL** (d.397)
 * ================================================================== */

/**
 * Chín khoá lọc của d.396 **cộng** `xem` (kiểu xem) và `view` (tên view đang mở).
 *
 * Tên khoá URL = tên tham số truy vấn của máy chủ, **trừ** `du_an`: URL dùng
 * `du_an` cho cùng lý do trang Cần Chủ đã dùng (`KHOA_LOC` ở `can-chu.tsx`) —
 * đường và khoá URL là thứ chủ đọc, nên chúng không dấu nhưng tiếng Việt. Bảng
 * dịch nằm **đúng một chỗ**: `locTuUrl`.
 */
export const KHOA_LOC_TICKET = {
  du_an: 'du_an',
  trang_thai: 'trang_thai',
  uu_tien: 'uu_tien',
  chiu_trach_nhiem: 'chiu_trach_nhiem',
  nguoi_dang_cam: 'nguoi_dang_cam',
  nhan: 'nhan',
  co_co: 'co_co',
  can_chu: 'can_chu',
  xong_khong_bang_chung: 'xong_khong_bang_chung',
} as const;

/** Khoá URL **không** phải bộ lọc: kiểu xem, tên view, lọc nhanh, thẻ đang mở. */
export const KHOA_XEM = 'xem';
export const KHOA_VIEW = 'view';
/** Bộ lọc nhanh kiểu Linear — ghi trên URL, cùng kỷ luật d.397. */
export const KHOA_NHANH = 'nhanh';
/** Mã ticket đang mở ở panel bên phải — cũng trên URL, nên dán link được. */
export const KHOA_THE = 'the';

/** Ba cờ của d.396 nhận đúng một giá trị bật: `co` (cùng quy ước máy chủ). */
export const GIA_TRI_BAT = 'co';

/* ------------------------------------------------------------------ *
 * Bộ lọc nhanh "Active / Backlog / All" — ngoài SPEC (#133)
 * ------------------------------------------------------------------ */

/**
 * **Ba tab nhanh**, đúng thứ tự d.407: "các **tab nhanh** (Đang chạy · Backlog ·
 * Tất cả)".
 *
 * Mã máy giữ nguyên (`active`/`backlog`/`all`) vì chúng đã nằm trên URL của chủ
 * (`?nhanh=`) và một lần đổi mã là làm chết link đã dán. **Nhãn** thì theo chữ
 * của SPEC: đợt 2 để nguyên tiếng Anh của Linear ("Active/Backlog/All") khi d.407
 * chưa có; nay SPEC viết ra từng chữ, nên nhãn đi theo SPEC và có
 * `tabNhanhTuSpec` cắt ra từ `SPEC.md` để so (test/doc-spec.ts).
 */
export const LOC_NHANH = ['active', 'backlog', 'all'] as const;
export type LocNhanh = (typeof LOC_NHANH)[number];

/** Nhãn ba tab nhanh — **đúng chữ d.407**, đối chiếu với SPEC trong test. */
export const NHAN_LOC_NHANH: Record<LocNhanh, string> = {
  active: 'Đang chạy',
  backlog: 'Backlog',
  all: 'Tất cả',
};

/**
 * **Nhóm trạng thái của máy chủ** mà mỗi nút lọc nhanh nhận — `null` là "không
 * lọc".
 *
 * Giá trị bên phải là **`nhom_trang_thai` máy chủ trả cho từng dòng**
 * (`NHOM_CUA_TRANG_THAI_TICKET` của mục 0.1), nên đây **không** là một bảng ánh
 * xạ trạng thái thứ hai ở client: web không gõ lại "in_progress và verifying là
 * active" ở bất cứ đâu. Xem `spec-questions.md` #133.
 */
export const NHOM_CUA_LOC_NHANH: Record<LocNhanh, string | null> = {
  active: 'active',
  backlog: 'planned',
  all: null,
};

/** Lọc nhanh đang chọn. Giá trị lạ (hoặc thiếu) ⇒ `all`, không trang trắng. */
export function nhanhTuUrl(sp: URLSearchParams): LocNhanh {
  const v = sp.get(KHOA_NHANH);
  return (LOC_NHANH as readonly string[]).includes(v ?? '') ? (v as LocNhanh) : 'all';
}

/**
 * Áp lọc nhanh **trên trang đã tải**.
 *
 * Hệ quả đã khai (`spec-questions.md` #133): đường đọc chỉ nhận **một** mã trạng
 * thái, nên một nhóm nhiều trạng thái không lọc được ở máy chủ mà không thêm
 * tham số truy vấn mới. Dòng "Còn trang sau" của trang vẫn nói thật, nên chủ
 * không bị một màn hình im lặng nói "hết rồi".
 */
export function locNhanh(ds: readonly TicketDong[], nhanh: LocNhanh): TicketDong[] {
  const nhom = NHOM_CUA_LOC_NHANH[nhanh];
  return nhom === null ? [...ds] : ds.filter((t) => t.nhom_trang_thai === nhom);
}

/* ------------------------------------------------------------------ *
 * Ẩn/hiện "Xong cũ" — ngoài SPEC (#132)
 * ------------------------------------------------------------------ */

/**
 * **"Xong cũ" = đã kết, và vào Xong cách đây hơn 14 ngày.**
 *
 * SPEC không nói "cũ" là bao lâu (`spec-questions.md` #132); 14 ngày là đề xuất
 * tạm, và nó là một hằng có tên nên một lần chốt khác chỉ sửa đúng dòng này.
 *
 * Mốc là **`xong_luc`** (đường đọc màn hình trả — `TheDanhSachRa`), **không**
 * `cap_nhat_luc`: `cap_nhat_luc` nhích vì **mọi** lần sửa, nên một ticket Xong
 * từ 100 ngày trước bị thêm một nhãn sẽ thành "mới" lại — luật sẽ không bao giờ
 * chạy đúng ca duy nhất nó cần chạy (cùng họ lỗi `spec-questions.md` #104).
 *
 * `xong_luc` **rỗng** (ticket `canceled`/`duplicate` chưa từng vào Xong, hoặc
 * dữ liệu nhập của mục 16) ⇒ rơi về `cap_nhat_luc`: đó là mốc duy nhất còn lại,
 * và một ticket đã kết không có mốc nào thì không bao giờ bị ẩn mới là nói sai.
 */
export const NGAY_XONG_CU = 14;
const NGAY_MS = 24 * 60 * 60 * 1000;

export const KHOA_AN_XONG_CU = 'baton.an-xong-cu';
export const NHAN_AN_XONG_CU = 'Ẩn Xong cũ';

/** `nhom_trang_thai` của máy chủ cho nhóm "kết" (mục 0.1) — không tự suy từ mã. */
const NHOM_KET = 'closed';

export function laXongCu(t: TicketDong, bay_gio: number): boolean {
  const moc = t.xong_luc ?? t.cap_nhat_luc;
  return t.nhom_trang_thai === NHOM_KET && bay_gio - moc > NGAY_XONG_CU * NGAY_MS;
}

export function locXongCu(
  ds: readonly TicketDong[],
  bay_gio: number,
  an: boolean,
): TicketDong[] {
  return an ? ds.filter((t) => !laXongCu(t, bay_gio)) : [...ds];
}

/**
 * Đọc lựa chọn "ẩn Xong cũ". **Mặc định `false`** (hiện hết): ẩn sẵn là một màn
 * hình tự bỏ bớt dữ liệu mà chủ chưa xin — xem `spec-questions.md` #132.
 */
export function docAnXongCu(): boolean {
  return docKho(KHOA_AN_XONG_CU) === GIA_TRI_BAT;
}

export function ghiAnXongCu(an: boolean): void {
  ghiKho(KHOA_AN_XONG_CU, an ? GIA_TRI_BAT : '');
}

export const KIEU_XEM = ['danh-sach', 'bang'] as const;
export type KieuXem = (typeof KIEU_XEM)[number];

/** Nhãn hai nút chuyển kiểu xem — hai vế của d.396. */
export const NHAN_KIEU_XEM: Record<KieuXem, string> = {
  'danh-sach': 'Danh sách',
  bang: 'Bảng',
};

/**
 * **Kiểu mặc định của trang việc: BẢNG** — d.403: "Trang việc của **một dự án**
 * mặc định là kiểu **Bảng**; Danh sách là kiểu xem phụ", và d.397 nói "Tất cả
 * việc" cũng "mở ở **kiểu Bảng**".
 *
 * Đợt 2 mặc định Danh sách, với lý lẽ d.411 ("bảng kéo thả không bắt buộc trên
 * điện thoại"). Lý lẽ ấy không mất, nhưng nó không nói về **mặc định**: bảng ở
 * 375px cuộn ngang và vẫn đọc được, còn nút "Danh sách" luôn ở ngay đầu trang. Và
 * chỗ cần Danh sách thật — **nút tìm** của sidebar — nay mở thẳng
 * `?xem=danh-sach`.
 */
export const KIEU_XEM_MAC_DINH: KieuXem = 'bang';

/** Khoá nhớ kiểu xem của chủ trên máy này — cùng cửa `kho-cuc-bo.ts`. */
export const KHOA_KIEU_XEM = 'baton.kieu-xem';

/**
 * Kiểu xem đang mở, theo **ba bậc**, ưu tiên từ trên xuống:
 *
 *   1. **URL** (`?xem=`) — d.397 đặt bộ lọc và kiểu xem trên URL, nên một link
 *      dán vào phải mở đúng kiểu nó nói, bất kể máy này nhớ gì.
 *   2. **Lựa chọn chủ đã bấm**, nhớ trên máy (`kho-cuc-bo.ts`): chủ đổi sang
 *      Danh sách rồi sang trang khác mà bị kéo về Bảng là một lựa chọn bị quên.
 *   3. **Mặc định của SPEC** (`KIEU_XEM_MAC_DINH`).
 *
 * Giá trị lạ ở bậc 1 và 2 đều rơi xuống bậc dưới, không "trang trắng".
 */
export function kieuXemTuUrl(sp: URLSearchParams, mac_dinh?: KieuXem): KieuXem {
  const v = sp.get(KHOA_XEM);
  if ((KIEU_XEM as readonly string[]).includes(v ?? '')) return v as KieuXem;
  return mac_dinh ?? docKieuXem() ?? KIEU_XEM_MAC_DINH;
}

/** Kiểu xem chủ đã bấm lần cuối, hoặc `null` nếu chưa bấm / kho bị chặn. */
export function docKieuXem(): KieuXem | null {
  const v = docKho(KHOA_KIEU_XEM);
  return (KIEU_XEM as readonly string[]).includes(v ?? '') ? (v as KieuXem) : null;
}

export function ghiKieuXem(k: KieuXem): void {
  ghiKho(KHOA_KIEU_XEM, k);
}

/**
 * **URL → bộ lọc gửi máy chủ.** Khoá rỗng/thiếu ⇒ `undefined`, nên
 * `chuoiTruyVan` không gửi chúng: máy chủ coi `trang_thai=''` là `INVALID_INPUT`.
 *
 * Ba cờ chỉ gửi khi đúng bằng `co`: một `co_co=khong` trên URL phải nghĩa là
 * "không lọc", không phải "lọc ngược" — máy chủ không có vế nào cho "lọc ngược",
 * nên gửi nó đi là xin một lỗi.
 */
export function locTuUrl(sp: URLSearchParams): Record<string, string | undefined> {
  const lay = (k: string): string | undefined => {
    const v = sp.get(k);
    return v === null || v === '' ? undefined : v;
  };
  const co = (k: string): string | undefined => (sp.get(k) === GIA_TRI_BAT ? GIA_TRI_BAT : undefined);
  return {
    project_id: lay(KHOA_LOC_TICKET.du_an),
    trang_thai: lay(KHOA_LOC_TICKET.trang_thai),
    uu_tien: lay(KHOA_LOC_TICKET.uu_tien),
    chiu_trach_nhiem: lay(KHOA_LOC_TICKET.chiu_trach_nhiem),
    nguoi_dang_cam: lay(KHOA_LOC_TICKET.nguoi_dang_cam),
    nhan: lay(KHOA_LOC_TICKET.nhan),
    co_co: co(KHOA_LOC_TICKET.co_co),
    can_chu: co(KHOA_LOC_TICKET.can_chu),
    xong_khong_bang_chung: co(KHOA_LOC_TICKET.xong_khong_bang_chung),
  };
}

/**
 * Đặt **một** khoá trên URL, giữ nguyên các khoá khác — d.397 ("bộ lọc ghi trên
 * URL").
 *
 * Giá trị rỗng = **xoá khoá**, không ghi `?trang_thai=`: một khoá rỗng trên URL
 * là một link mà người nhận không đọc được ý ("lọc gì?"), và nó làm hai URL cùng
 * nghĩa khác chuỗi — tức hai `queryKey` khác nhau cho cùng một màn hình, tức hai
 * lần tải.
 */
export function datKhoa(sp: URLSearchParams, khoa: string, gia_tri: string): URLSearchParams {
  const moi = new URLSearchParams(sp);
  if (gia_tri === '') moi.delete(khoa);
  else moi.set(khoa, gia_tri);
  /*
   * Đổi bộ lọc thì **rời view đang mở**: URL không còn là view đã lưu, và giữ
   * `?view=Gấp` ở đó sẽ nói sai với chủ (thanh view sáng tên "Gấp" trong khi bộ
   * lọc đã khác). Đổi **kiểu xem** thì không rời: kiểu xem không phải bộ lọc.
   */
  // `the` (thẻ đang mở ở panel) cũng **không** phải bộ lọc: chọn một thẻ không
  // được làm chủ rời view đang mở.
  if (khoa !== KHOA_XEM && khoa !== KHOA_VIEW && khoa !== KHOA_THE) moi.delete(KHOA_VIEW);
  return moi;
}

/** Số bộ lọc d.396 đang bật — để thanh lọc nói được "đang lọc gì". */
export function soLocDangBat(sp: URLSearchParams): number {
  return Object.values(KHOA_LOC_TICKET).filter((k) => {
    const v = sp.get(k);
    return v !== null && v !== '';
  }).length;
}

/* ================================================================== *
 * 2. View riêng — d.396 "Lưu thành view riêng"
 * ================================================================== */

/**
 * Một view đã lưu: một cái tên và **chuỗi truy vấn** của nó.
 *
 * Lưu chuỗi truy vấn thô, không một đối tượng bộ lọc đã phân tích: URL là định
 * nghĩa của view (d.397 đã chốt bộ lọc nằm trên URL), nên một view là "một URL có
 * tên". Nhờ vậy thêm một bộ lọc ở lượt sau **không** làm các view đã lưu mất
 * nghĩa.
 */
export interface ViewDaLuu {
  ten: string;
  /** Không có `?` ở đầu. */
  truy_van: string;
}

/**
 * Khoá `localStorage`. **SPEC không nói view lưu ở đâu** — `spec-questions.md` #110;
 * đề xuất tạm là máy khách, vì nó không cần một migration và không cần một đường
 * API nào ở lượt này. Hệ quả đã khai: view không theo chủ sang máy khác.
 */
export const KHOA_VIEW_DA_LUU = 'baton.view-ticket';

/** Trần số view — một cái chặn để `localStorage` không phình vô hạn. */
export const TRAN_VIEW = 20;

/** Phần `Storage` mà view cần — hẹp nhất có thể, nên thay được bằng kho rỗng. */
export type KhoView = Pick<Storage, 'getItem' | 'setItem'>;

/** Kho **không nhớ gì**: dùng khi môi trường không có `localStorage`. */
const KHO_RONG: KhoView = {
  getItem: () => null,
  setItem: () => undefined,
};

/**
 * **`localStorage` có thể KHÔNG TỒN TẠI.**
 *
 * Không chỉ là ca test: một `iframe` sandbox, chế độ chặn cookie của Safari, hay
 * một WebView rút gọn đều cho `window.localStorage` là `undefined` hoặc **ném
 * ngay khi đọc thuộc tính**. Chạm thẳng vào nó trong thân component nghĩa là cả
 * trang danh sách ticket trắng ở những môi trường đó — vì một tiện ích đặt tên
 * cho bộ lọc.
 *
 * Nên mọi lần dùng đi qua đây, và thiếu kho thì view **im lặng không nhớ gì**:
 * bộ lọc thật vẫn nằm trên URL (d.397), nên chủ không mất chức năng nào.
 */
export function khoView(): KhoView {
  try {
    const k: Storage | undefined = globalThis.localStorage;
    // `typeof` chứ không `!= null`: một đối tượng lạ không có `getItem` cũng loại.
    return typeof k?.getItem === 'function' && typeof k.setItem === 'function' ? k : KHO_RONG;
  } catch {
    return KHO_RONG;
  }
}

/**
 * Đọc danh sách view đã lưu. **Dữ liệu hỏng ⇒ danh sách rỗng, không ném.**
 *
 * `localStorage` là dữ liệu ngoài tầm kiểm soát của mã này (người dùng sửa được,
 * một bản cũ ghi hình khác được). Ném ở đây nghĩa là một chuỗi rác làm **trắng cả
 * trang danh sách ticket** — mất một tiện ích thì chỉ mất tiện ích đó.
 */
export function docView(kho: Pick<Storage, 'getItem'> = khoView()): ViewDaLuu[] {
  const van = kho.getItem(KHOA_VIEW_DA_LUU);
  if (van === null) return [];
  try {
    const doc: unknown = JSON.parse(van);
    if (!Array.isArray(doc)) return [];
    return doc.filter(
      (v): v is ViewDaLuu =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as ViewDaLuu).ten === 'string' &&
        typeof (v as ViewDaLuu).truy_van === 'string' &&
        (v as ViewDaLuu).ten !== '',
    );
  } catch {
    return [];
  }
}

/**
 * Thêm hoặc **ghi đè** một view. Trùng tên là ghi đè, không tạo bản thứ hai: hai
 * view cùng tên khác bộ lọc là một danh sách không chọn được.
 *
 * Tên bị cắt khoảng trắng hai đầu; tên rỗng thì **không lưu gì** (trả nguyên danh
 * sách cũ) — một view không tên không bấm lại được.
 */
export function luuView(ds: readonly ViewDaLuu[], ten: string, truy_van: string): ViewDaLuu[] {
  const t = ten.trim();
  if (t === '') return [...ds];
  const con_lai = ds.filter((v) => v.ten !== t);
  return [...con_lai, { ten: t, truy_van }].slice(-TRAN_VIEW);
}

export function boView(ds: readonly ViewDaLuu[], ten: string): ViewDaLuu[] {
  return ds.filter((v) => v.ten !== ten);
}

/* ================================================================== *
 * 3. Gom theo trạng thái, và làm phẳng cho bộ ảo hoá — d.396, d.409
 * ================================================================== */

export interface NhomTrangThai {
  trang_thai: TrangThaiTicket;
  nhan: string;
  items: TicketDong[];
}

/**
 * **Gom theo trạng thái** — kiểu xem thứ nhất của d.396.
 *
 * **Đủ bảy nhóm, luôn luôn**, kể cả nhóm rỗng, và đúng thứ tự bảng 0.1. Chỉ hiện
 * nhóm có ticket thì danh sách sẽ nhảy thứ tự theo dữ liệu — và chủ mất đúng
 * thông tin "không còn gì ở Chờ kiểm chứng", thứ đáng thấy nhất.
 *
 * Trong nhóm, **giữ nguyên thứ tự máy chủ trả về**
 * (`hang_uu_tien, tao_luc DESC, id DESC` — `cauLenhDanhSachTicket`). Sắp lại ở
 * đây là một thứ tự thứ hai, và nó sẽ lệch với thứ tự mà cursor keyset đi theo:
 * trang 2 nối vào sau trang 1 sẽ không còn liền mạch.
 */
export function gomTheoTrangThai(ds: readonly TicketDong[]): NhomTrangThai[] {
  return TRANG_THAI_THEO_THU_TU.map((tt) => ({
    trang_thai: tt,
    nhan: NHAN_TRANG_THAI[tt],
    items: ds.filter((t) => t.trang_thai === tt),
  }));
}

/** Một dòng của danh sách đã làm phẳng — tiêu đề nhóm hoặc một ticket. */
export type DongPhang =
  | { loai: 'nhom'; trang_thai: TrangThaiTicket; nhan: string; so: number }
  | { loai: 'ticket'; the: TicketDong };

/**
 * **Làm phẳng** danh sách gom thành **một** mảng dòng — điều kiện để d.409
 * ("danh sách 5.000 ticket cuộn mượt") làm được bằng TanStack Virtual.
 *
 * Bộ ảo hoá tính vị trí theo **chỉ số trong một mảng**; bảy danh sách lồng nhau
 * nghĩa là bảy bộ ảo hoá, và lúc đó không bộ nào biết tổng chiều cao nên thanh
 * cuộn nhảy mỗi lần một nhóm được vẽ. Một mảng phẳng có `n` dòng thì chiều cao
 * tổng là một phép nhân.
 *
 * Tiêu đề nhóm **vẫn là một dòng** trong mảng đó (không `position: sticky` giả):
 * như vậy nó cũng được ảo hoá, và không có dòng nào nằm ngoài phép tính.
 *
 * **Nhóm RỖNG bị ẩn** — d.405: "cột rỗng thu hẹp nhưng vẫn hiện tiêu đề và số 0;
 * **nhóm rỗng ở Danh sách thì ẩn**". Hai kiểu xem, hai luật khác nhau, và cả hai
 * là chữ của SPEC: ở **Bảng** cột rỗng phải còn để kéo thẻ **vào**, còn ở **Danh
 * sách** không ai thả gì vào một tiêu đề, nên bảy tiêu đề cho hai nhóm có dữ liệu
 * chỉ là bảy dòng chủ phải cuộn qua. `gomTheoTrangThai` vẫn trả **đủ bảy** nhóm:
 * nó cũng là nguồn thứ tự đi của `J`/`K` (d.406).
 */
export function lamPhang(nhom: readonly NhomTrangThai[]): DongPhang[] {
  const ra: DongPhang[] = [];
  for (const n of nhom) {
    if (n.items.length === 0) continue;
    ra.push({ loai: 'nhom', trang_thai: n.trang_thai, nhan: n.nhan, so: n.items.length });
    for (const t of n.items) ra.push({ loai: 'ticket', the: t });
  }
  return ra;
}

/* ================================================================== *
 * 4. Cập nhật lạc quan của một lần kéo — d.396, d.407
 * ================================================================== */

/**
 * **Đổi trạng thái một ticket NGAY trong trang đã tải** — nửa "hiện ngay" của
 * d.407, và cũng là thứ làm thẻ "bật về chỗ cũ" khả thi: bật về chỗ cũ chỉ là đặt
 * lại **ảnh chụp** trước khi đổi.
 *
 * Hàm thuần trên thân đã tải. `nhan_trang_thai` cũng đổi theo bảng 0.1 ở trên —
 * không đổi thì thẻ nằm ở cột Xong mà vẫn in chữ "Đang làm" trong khoảng chờ máy
 * chủ trả lời. Lần `invalidateQueries` ngay sau đó trả lại bản của máy chủ (nơi
 * cả `nhom_trang_thai` và mọi dẫn xuất khác được tính lại).
 *
 * `bay_gio` đi nguyên: mốc của máy chủ không đổi vì một thẻ sang cột khác.
 */
export function doiTrangThaiTrongTrang(
  trang: ManHinhDanhSach,
  ticket_id: string,
  sang: TrangThaiTicket,
): ManHinhDanhSach {
  return {
    ...trang,
    items: trang.items.map((t) =>
      t.id === ticket_id
        ? { ...t, trang_thai: sang, nhan_trang_thai: NHAN_TRANG_THAI[sang] }
        : t,
    ),
  };
}

/**
 * Như `doiTrangThaiTrongTrang` nhưng cho **cache nhiều trang** (`{ pages,
 * pageParams }` của `useInfiniteQuery`): đổi trên mọi trang đã nối, giữ nguyên
 * `pageParams` — để "Xem thêm" không làm hỏng cập nhật lạc quan, và ảnh chụp
 * để hoàn là chính object cache cũ.
 */
export function doiTrangThaiTrongCache<P>(
  cache: { pages: ManHinhDanhSach[]; pageParams: P[] },
  ticket_id: string,
  sang: TrangThaiTicket,
): { pages: ManHinhDanhSach[]; pageParams: P[] } {
  return {
    ...cache,
    pages: cache.pages.map((p) => doiTrangThaiTrongTrang(p, ticket_id, sang)),
  };
}

/**
 * Đổi `uu_tien` (và `nhan_uu_tien` cục bộ, theo `NHAN_UU_TIEN`) của một thẻ trên
 * mọi trang đã nối của cache — phím `P` (d.415), cập nhật lạc quan.
 */
export function doiUuTienTrongCache<P>(
  cache: { pages: ManHinhDanhSach[]; pageParams: P[] },
  ticket_id: string,
  sang: UuTien,
): { pages: ManHinhDanhSach[]; pageParams: P[] } {
  return {
    ...cache,
    pages: cache.pages.map((p) => ({
      ...p,
      items: p.items.map((t) =>
        t.id === ticket_id ? { ...t, uu_tien: sang, nhan_uu_tien: NHAN_UU_TIEN[sang] } : t,
      ),
    })),
  };
}

/**
 * **Phép ngược của `doiUuTienTrongCache`** (BAT-24): đặt `uu_tien` của đúng một
 * thẻ về `ve` — **chỉ khi** giá trị hiện có còn là `da_dat` (giá trị mà chính
 * thao tác lỗi đã đặt). Đã có thao tác khác chồng lên (giá trị khác) thì để yên.
 */
export function hoanUuTienTrongCache<P>(
  cache: { pages: ManHinhDanhSach[]; pageParams: P[] },
  ticket_id: string,
  da_dat: UuTien,
  ve: UuTien,
): { pages: ManHinhDanhSach[]; pageParams: P[] } {
  return {
    ...cache,
    pages: cache.pages.map((p) => ({
      ...p,
      items: p.items.map((t) =>
        t.id === ticket_id && t.uu_tien === da_dat
          ? { ...t, uu_tien: ve, nhan_uu_tien: NHAN_UU_TIEN[ve] }
          : t,
      ),
    })),
  };
}

/** Phép ngược của `doiTrangThaiTrongCache` — cùng luật với `hoanUuTienTrongCache`. */
export function hoanTrangThaiTrongCache<P>(
  cache: { pages: ManHinhDanhSach[]; pageParams: P[] },
  ticket_id: string,
  da_dat: TrangThaiTicket,
  ve: TrangThaiTicket,
): { pages: ManHinhDanhSach[]; pageParams: P[] } {
  return {
    ...cache,
    pages: cache.pages.map((p) => ({
      ...p,
      items: p.items.map((t) =>
        t.id === ticket_id && t.trang_thai === da_dat
          ? { ...t, trang_thai: ve, nhan_trang_thai: NHAN_TRANG_THAI[ve] }
          : t,
      ),
    })),
  };
}

/** Chọn ưu tiên có đáng gọi máy chủ không:`null` khi giá trị lạ hoặc trùng giá trị đang có. */
export function dichUuTien(
  the: Pick<TicketDong, 'id' | 'uu_tien'>,
  sang: string | null,
): { ticket_id: string; uu_tien: UuTien } | null {
  if (sang === null) return null;
  if (!(UU_TIEN_THEO_THU_TU as readonly string[]).includes(sang)) return null;
  const u = sang as UuTien;
  if (u === the.uu_tien) return null;
  return { ticket_id: the.id, uu_tien: u };
}

/** Một lần gắn (`gan: true`) hoặc bỏ (`gan: false`) một nhãn — phím `L` (d.415). */
export interface ViecNhan {
  ticket_id: string;
  /** Mã ticket — để làm mới khoá chi tiết `['ticket', 'chi-tiet', ma]` của panel. */
  ma: string;
  nhan: string;
  gan: boolean;
}

/**
 * **Một lần gắn/bỏ nhãn có đáng gọi máy chủ không** — `null` là không gọi.
 *
 * Chỉ **cắt khoảng trắng hai đầu**, vì máy chủ cũng cắt đúng như vậy
 * (`kiemNhanTicket` của `@baton/shared`): không cắt thì `" sos"` được coi là
 * "chưa có" ở đây trong khi máy chủ coi là `sos` đã có, và thẻ hiện một nhãn
 * lạc quan thừa. Mọi luật khác (độ dài…) là của máy chủ, không chép lại ở đây.
 *
 * `null` khi: ô trống / chỉ khoảng trắng, gắn một nhãn đã có, bỏ một nhãn không có.
 */
export function dichNhan(
  the: Pick<TicketDong, 'id' | 'ma' | 'nhan'>,
  nhan: string,
  gan: boolean,
): ViecNhan | null {
  const n = nhan.trim();
  if (n === '') return null;
  if (the.nhan.includes(n) === gan) return null;
  return { ticket_id: the.id, ma: the.ma, nhan: n, gan };
}

/**
 * Gắn/bỏ **một** nhãn của một thẻ trên mọi trang đã nối của cache — cập nhật lạc
 * quan của phím `L`, và cũng là **phép ngược** để hoàn lại khi máy chủ từ chối.
 *
 * Hoàn bằng phép ngược trên đúng nhãn ấy (không đặt lại ảnh chụp cả cache): hai
 * thao tác nhãn liên tiếp trên cùng thẻ, thao tác 1 lỗi thì ảnh chụp của nó
 * **không có** kết quả lạc quan của thao tác 2 — đặt lại ảnh sẽ xoá mất thao tác 2.
 *
 * `vi_tri` (khi gắn): chỗ chèn — để bỏ-rồi-hoàn trả nhãn về **đúng chỗ cũ**;
 * thiếu hoặc vượt thì nối cuối. Gắn nhãn đã có / bỏ nhãn không có ⇒ thẻ không đổi.
 */
export function datNhanTrongCache<P>(
  cache: { pages: ManHinhDanhSach[]; pageParams: P[] },
  ticket_id: string,
  nhan: string,
  gan: boolean,
  vi_tri?: number,
): { pages: ManHinhDanhSach[]; pageParams: P[] } {
  const doi = (ds: string[]): string[] => {
    if (!gan) return ds.filter((n) => n !== nhan);
    if (ds.includes(nhan)) return ds;
    const i = vi_tri === undefined || vi_tri < 0 || vi_tri > ds.length ? ds.length : vi_tri;
    return [...ds.slice(0, i), nhan, ...ds.slice(i)];
  };
  return {
    ...cache,
    pages: cache.pages.map((p) => ({
      ...p,
      items: p.items.map((t) => (t.id === ticket_id ? { ...t, nhan: doi(t.nhan) } : t)),
    })),
  };
}

/**
 * **Một lần kéo có đáng gọi máy chủ không** — d.396.
 *
 * `null` nghĩa là không làm gì: thả ra ngoài mọi cột (`sang === null`), thả lại
 * đúng cột đang ở, hoặc thả vào một chuỗi không phải trạng thái nào. Ca thứ ba là
 * ca thật: `over.id` của dnd-kit là một chuỗi bất kỳ do mã này đặt, nên một lần
 * đổi id vùng thả mà quên sửa chỗ khác phải thành "không làm gì", **không** thành
 * một `POST` mang `trang_thai` rác (máy chủ trả `INVALID_INPUT`, và chủ thấy một
 * toast vô nghĩa cho một cử chỉ hợp lệ).
 */
export function dichKeo(
  the: Pick<TicketDong, 'id' | 'trang_thai'>,
  sang: string | null,
): { ticket_id: string; trang_thai: TrangThaiTicket } | null {
  if (sang === null) return null;
  if (!(TRANG_THAI_THEO_THU_TU as readonly string[]).includes(sang)) return null;
  const tt = sang as TrangThaiTicket;
  if (tt === the.trang_thai) return null;
  return { ticket_id: the.id, trang_thai: tt };
}
