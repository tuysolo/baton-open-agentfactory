/**
 * **Luật thuần của việc GỬI thông báo ra kênh ngoài** — SPEC mục 12 (d.339–348),
 * 19.8 (d.535), 19.12 câu 6 và câu 60.
 *
 * Để ở `@baton/shared` và **không chạm DB**, cùng nếp `can-chu.ts`,
 * `bang-chung.ts`, `suc-song.ts`: câu "gửi bây giờ / hoãn tới mốc X / không gửi"
 * là một **hàm thuần**, nên nó có test riêng không cần Miniflare, và API (cron
 * gửi), CLI và web đọc **cùng một** bản khi cần.
 *
 * ## Mọi giờ-trên-tường đi qua `MUI_GIO_CHU_PHUT`
 *
 * 19.12 câu 60 chốt: "18:00", "20:00", "08:00", "23:00–07:00" là giờ đồng hồ trên
 * tường, khai ở **đúng một chỗ**, và **bốn luật phải dùng cùng một múi giờ**. Nên
 * giờ yên lặng ở đây dùng `gioDiaPhuong` / `nuaDemDiaPhuong` của `can-chu.ts` và
 * **không** khai một độ lệch thứ hai. Nếu một lượt sau muốn múi giờ là cài đặt
 * của workspace thì việc phải làm vẫn là **một chỗ** (hằng kia), và `lech_phut`
 * đã là tham số của mọi hàm dưới đây.
 */

import { MUI_GIO_CHU_PHUT, gioDiaPhuong, nuaDemDiaPhuong } from './can-chu.js';

const MOT_PHUT_MS = 60_000;
const MOT_GIO_MS = 60 * MOT_PHUT_MS;
const MOT_NGAY_MS = 24 * MOT_GIO_MS;

/* ------------------------------------------------------------------ *
 * 1. Giờ yên lặng — mục 12 d.347, 19.8 d.535
 * ------------------------------------------------------------------ */

/** "Giờ yên lặng (mặc định **23:00**–07:00)" — mục 12 d.347. */
export const GIO_YEN_LANG_BAT_DAU = 23;

/** "Giờ yên lặng (mặc định 23:00–**07:00**)" — mục 12 d.347. */
export const GIO_YEN_LANG_KET_THUC = 7;

/**
 * Mốc này có nằm trong khung yên lặng không — **giờ trên tường** của chủ.
 *
 * Khung **vắt qua nửa đêm** nên điều kiện là `HOẶC`, không `VÀ`: `23 <= gio` hoặc
 * `gio < 7`. Viết thành `23 <= gio && gio < 7` là một điều kiện **không bao giờ
 * đúng**, tức giờ yên lặng thành mã chết — đúng loại lỗi mà một ca test ở biên
 * 23:00 và 06:59 phải bắt.
 *
 * Biên: 23:00:00.000 **thuộc** khung (SPEC viết "23:00–07:00", tức từ 23:00),
 * 07:00:00.000 **không** thuộc (giờ yên lặng kết thúc đúng lúc đó, và
 * `cuoiGioYenLang` trả về chính mốc ấy — hai hàm phải khớp nhau, nếu không một
 * tin hoãn tới 07:00 lại bị xét là "vẫn trong giờ yên lặng" và hoãn thêm 24 giờ).
 */
export function trongGioYenLang(moc: number, lech_phut = MUI_GIO_CHU_PHUT): boolean {
  const gio = gioDiaPhuong(moc, lech_phut);
  return gio >= GIO_YEN_LANG_BAT_DAU || gio < GIO_YEN_LANG_KET_THUC;
}

/**
 * **Cuối giờ yên lặng** kể từ `moc`: mốc epoch của 07:00 giờ chủ sắp tới.
 *
 * 19.8 d.535: "Lời nhắc sau 2 giờ mà rơi vào giờ yên lặng thì **hoãn tới cuối giờ
 * yên lặng**" — tức tin **không bị bỏ**, nó chỉ đợi. Hàm này là cái mốc đợi đó.
 *
 * Hai nhánh, vì khung vắt qua nửa đêm:
 *   * `moc` ở 23:00–23:59 → 07:00 **hôm sau**;
 *   * `moc` ở 00:00–06:59 → 07:00 **cùng ngày**.
 * Ngoài khung thì không có gì để đợi — trả `moc` (gửi ngay). Trả `null` ở ca đó
 * sẽ buộc mọi người gọi phải tự nhớ một nhánh nữa.
 */
export function cuoiGioYenLang(moc: number, lech_phut = MUI_GIO_CHU_PHUT): number {
  if (!trongGioYenLang(moc, lech_phut)) return moc;
  const sang_hom_sau = gioDiaPhuong(moc, lech_phut) >= GIO_YEN_LANG_BAT_DAU ? MOT_NGAY_MS : 0;
  return (
    nuaDemDiaPhuong(moc, lech_phut) + sang_hom_sau + GIO_YEN_LANG_KET_THUC * MOT_GIO_MS
  );
}

/* ------------------------------------------------------------------ *
 * 2. Mức ưu tiên của một tin — mục 12 d.347, 19.8 d.535
 * ------------------------------------------------------------------ */

/**
 * **Hai mức ưu tiên gửi**, và chúng là thuộc tính **bất biến** của một tin, cùng
 * hạng với `loai`:
 *   * `khan` — "chỉ 🔴 được gửi trong khung này" (d.347) + "🔴 **mới** vẫn gửi
 *     ngay" (19.8 d.535). Tin mang mức này **xuyên qua** giờ yên lặng.
 *   * `thuong` — mọi tin khác: trong giờ yên lặng thì **hoãn**, không bỏ.
 *
 * ## Vì sao không suy từ `loai`
 *
 * 19.8 d.535 cho **hai luật khác nhau trên cùng một mức 🔴**: mục 🔴 **mới** gửi
 * ngay, còn **lời nhắc sau 2 giờ** của đúng mục đó thì **hoãn tới cuối giờ yên
 * lặng**. Hai tin ấy cùng `loai = 'can_chu_do'` (mã duy nhất mà `CHECK` của
 * migration 0012 có cho d.341), nên `loai` **không** phân biệt được chúng. Nếu
 * suy mức từ `loai` thì một trong hai câu của d.535 chắc chắn sai.
 *
 * Đây **không** phải "cờ thay cho mốc" (nếp đã chốt bốn lần trong `quyet-dinh.md`):
 * nếp đó nói về trạng thái **đổi theo thời gian** (đã bắn chưa, đã gửi chưa) —
 * những thứ ấy ở đây vẫn là mốc (`gui_telegram_luc`, `nhac_do_luc`). Mức ưu tiên
 * là một **phân loại lúc sinh ra**, không bao giờ đổi, và trigger
 * `tg_thong_bao_noi_dung_bat_bien` của 0019 ép nó bất biến y như `loai`.
 */
export const UU_TIEN_TIN = ['thuong', 'khan'] as const;
export type UuTienTin = (typeof UU_TIEN_TIN)[number];

export function laUuTienTin(x: unknown): x is UuTienTin {
  return typeof x === 'string' && (UU_TIEN_TIN as readonly string[]).includes(x);
}

/* ------------------------------------------------------------------ *
 * 3. Gộp tin "Ticket Xong" — mục 12 d.345
 * ------------------------------------------------------------------ */

/** "Ticket Xong: gom, **tối đa 1 tin mỗi 15 phút**" — mục 12 d.345. */
export const GOP_TICKET_XONG_PHUT = 15;
export const GOP_TICKET_XONG_MS = GOP_TICKET_XONG_PHUT * MOT_PHUT_MS;

/** `loai` của bảng `thong_bao` (0012) mà luật gộp d.345 áp cho. */
export const LOAI_TIN_GOP = 'ticket_xong';

/* ------------------------------------------------------------------ *
 * 4. Thử lại khi gửi trượt — 19.12 câu 6
 * ------------------------------------------------------------------ */

/**
 * 19.12 câu 6: "**Gửi Telegram thất bại (mục 12).** Thử lại **3 lần** giãn cách:
 * **10 giây, 60 giây, 5 phút**."
 *
 * Ba con số, **theo thứ tự**, và độ dài mảng **là** con số 3 — không khai "3" ở
 * một chỗ và ba khoảng giãn ở chỗ khác, vì hai nơi sẽ lệch.
 */
export const GIAN_THU_LAI_GUI_MS: readonly number[] = [10_000, 60_000, 5 * MOT_PHUT_MS];

/** "Thử lại **3 lần**" — 19.12 câu 6. Số lần **thử lại**, không tính lần đầu. */
export const SO_LAN_THU_LAI_TOI_DA = GIAN_THU_LAI_GUI_MS.length;

/**
 * **Tổng số lần gửi** của một tin: lần đầu **cộng** 3 lần thử lại = **4**.
 *
 * Hai con số, không một, và lẫn chúng là một lỗi đã xảy ra ở lượt này rồi: đọc
 * "thử lại 3 lần" thành "tổng 3 lần gửi" làm lần thử lại **thứ ba** (sau 5 phút)
 * không bao giờ chạy — câu quét loại dòng ra trước khi mốc 5 phút tới. Nên cột
 * `thong_bao.gui_so_lan_thu` đếm **số lần đã trượt**, và hằng này là chỗ dừng.
 */
export const SO_LAN_GUI_TOI_DA = SO_LAN_THU_LAI_TOI_DA + 1;

/**
 * Mốc của lần thử **kế tiếp** sau một lần gửi trượt, hoặc `null` = **hết lượt**.
 *
 * `so_lan_da_thu` là số lần đã trượt **trước** lần vừa trượt (tức giá trị cột
 * `thong_bao.gui_so_lan_thu` lúc đọc dòng ra). Lần trượt đầu tiên
 * (`so_lan_da_thu = 0`) hẹn lại sau **10 giây**; lần thứ hai sau **60 giây**; lần
 * thứ ba sau **5 phút**; lần trượt **thứ tư** → `null`: ba lần thử lại của 19.12
 * câu 6 đã dùng hết, tin **giữ trong chuông** và hiện ở "Cần chú ý", không mất.
 *
 * Giãn cách bằng **mốc + cron**, không `setTimeout` trong một lần `scheduled`:
 * cùng nếp `evidence.thu_lai_luc` của d.220 (`cron-bang-chung.ts`). Một
 * `setTimeout` 5 phút trong một lần `scheduled` là 5 phút giữ một lượt cron sống,
 * và runtime cắt nó giữa chừng thì **không ai biết** tin nào đã gửi.
 */
export function mocThuLaiGui(so_lan_da_thu: number, bay_gio: number): number | null {
  const gian = GIAN_THU_LAI_GUI_MS[so_lan_da_thu];
  return gian === undefined ? null : bay_gio + gian;
}

/* ------------------------------------------------------------------ *
 * 5. Nhắc 🔴 sau 2 giờ — mục 8 d.283, mục 12 d.341
 * ------------------------------------------------------------------ */

/** "🔴 **quá 2 giờ**" (mục 12 d.341) = "🔴 chưa xử lý sau **2 giờ**" (d.283). */
export const NHAC_DO_SAU_GIO = 2;
export const NHAC_DO_SAU_MS = NHAC_DO_SAU_GIO * MOT_GIO_MS;

/** Một mục Cần Chủ như luật nhắc 🔴 cần biết. */
export interface MucDeNhacDo {
  muc: string;
  trang_thai: string;
  tao_luc: number;
  /** Mốc "đã nhắc lúc nào"; `null` = chưa nhắc. Mốc, không cờ. */
  nhac_do_luc: number | null;
}

/**
 * **"🔴 chưa xử lý sau 2 giờ thì nhắc 1 lần"** — mục 8 d.283, và "**KHÔNG làm:**
 * nhắc lặp nhiều lần" (d.291).
 *
 * Bốn điều kiện, cả bốn phải đúng:
 *   1. mức là 🔴 (`urgent`) — 🟡 và ⚪ "chỉ vào tóm tắt sáng và tối" (d.283);
 *   2. còn `Chờ` (`open`) — "**chưa xử lý**";
 *   3. đã quá 2 giờ kể từ lúc tạo;
 *   4. **chưa nhắc lần nào** (`nhac_do_luc IS NULL`) — đó là cả nghĩa của "1 lần".
 *
 * Mốc **bằng đúng** `tao_luc + 2 giờ` đã là "sau 2 giờ" (`>=`): SPEC viết "quá 2
 * giờ" và "sau 2 giờ" mà không nói biên; chọn `>=` vì hướng sai an toàn của một
 * lời nhắc là nhắc **sớm hơn một millisecond**, không phải im thêm một nhịp cron.
 */
export function canNhacDo(muc: MucDeNhacDo, bay_gio: number): boolean {
  if (muc.muc !== 'urgent') return false;
  if (muc.trang_thai !== 'open') return false;
  if (muc.nhac_do_luc !== null) return false;
  return bay_gio - muc.tao_luc >= NHAC_DO_SAU_MS;
}

/* ------------------------------------------------------------------ *
 * 6. Luật "gửi bây giờ / hoãn / không gửi" — một cửa duy nhất
 * ------------------------------------------------------------------ */

/** Một dòng `thong_bao` như luật gửi cần biết. */
export interface TinDeGui {
  /**
   * `thong_bao.loai` (0012) — d.348 "Tắt từng loại trong Cài đặt" lọc theo cột này.
   *
   * **Tin bảo mật mượn `'can_chu_do'`** (0026, BAT-17 phương án B: mã riêng cần
   * migration sửa CHECK + trigger). Nên `loai` một mình **không** nói "đây là
   * mục Cần Chủ 🔴": mọi chỗ phân loại/dán nhãn phải xét `bao_mat` **trước**.
   */
  loai: string;
  uu_tien: UuTienTin;
  /** Mốc "đã ra kênh ngoài lúc nào"; không `null` ⇒ **không gửi lại**. */
  gui_telegram_luc: number | null;
  /** Số lần gửi đã trượt — 19.12 câu 6. */
  gui_so_lan_thu: number;
  /** Mốc được phép thử lại; `null` = chưa trượt lần nào. */
  gui_thu_lai_luc: number | null;
  /**
   * `thong_bao.bao_mat` (0026) — khác `null` ⇒ tin **bảo mật tài khoản**: không
   * công tắc nào tắt được (BAT-16). Tuỳ chọn để mọi chỗ gọi cũ giữ nguyên.
   */
  bao_mat?: string | null;
}

export type QuyetDinhGui =
  | { hanh_dong: 'gui' }
  /** Chưa tới lúc — **tin vẫn còn nợ**, lượt cron sau xét lại. */
  | { hanh_dong: 'hoan'; moc: number; ly_do: string }
  /** Không bao giờ gửi tin này nữa (đã gửi, hoặc hết 3 lần thử). */
  | { hanh_dong: 'khong'; ly_do: string }
  /**
   * Chủ đã **tắt** loại tin này trong Cài đặt (d.348, BAT-16): không gửi Telegram,
   * tin **vẫn ở trong chuông**. Người gọi ghi mốc `bo_qua_gui_luc` để tin rời hàng
   * chờ gửi — bật lại công tắc **không** gửi bù tin cũ.
   */
  | { hanh_dong: 'tat'; ly_do: string };

/**
 * **Một cửa duy nhất** cho câu "tin này gửi bây giờ, hoãn tới mốc X, hay không
 * gửi" — mục 12 d.345, d.347; 19.8 d.535; 19.12 câu 6.
 *
 * Thứ tự xét **là** luật, không phải chuyện gọn gàng:
 *   1. **đã ra kênh ngoài** (`gui_telegram_luc`) → `khong`. Phép kiểm chống bắn
 *      lặp đi **trước mọi thứ**, vì mọi luật sau nó chỉ nói về *thời điểm*.
 *   2. **hết 3 lần thử** (19.12 câu 6) → `khong`; tin giữ trong chuông và hiện ở
 *      "Cần chú ý".
 *   2b. **chủ đã tắt loại tin này** (d.348, `tuy_chon.tat`) → `tat`. Xét **sau**
 *      hai phép trên (một tin đã gửi hay đã hết lượt thì không có gì để tắt) và
 *      **trước** mọi luật thời điểm: một tin bị tắt thì không có lúc nào để đợi.
 *      Tin **bảo mật** (`bao_mat` khác `null`) bỏ qua cờ này — lớp thứ hai sau
 *      `tinBiTat` của người gọi (BAT-16).
 *   3. **chưa tới mốc thử lại** → `hoan`.
 *   4. **giờ yên lặng** và tin không `khan` → `hoan` tới `cuoiGioYenLang`. Xét
 *      **trước** luật gộp 15 phút: một tin "Ticket Xong" lúc 02:00 phải đợi tới
 *      07:00 bất kể lần gửi gộp cuối là khi nào.
 *   5. **gộp "Ticket Xong" 15 phút** (d.345) → `hoan` tới `moc_gop + 15 phút`.
 *      Mốc, không cờ: `moc_ticket_xong_cuoi` là `max(gui_telegram_luc)` của các
 *      tin `ticket_xong` **đã gửi** của cùng workspace.
 *   6. còn lại → `gui`.
 *
 * `moc_ticket_xong_cuoi` là tham số, không một lần đọc DB bên trong: hàm này phải
 * thuần để test được không cần Miniflare.
 */
export function quyetDinhGuiTin(
  tin: TinDeGui,
  bay_gio: number,
  tuy_chon: { moc_ticket_xong_cuoi?: number | null; lech_phut?: number; tat?: boolean } = {},
): QuyetDinhGui {
  const lech_phut = tuy_chon.lech_phut ?? MUI_GIO_CHU_PHUT;

  if (tin.gui_telegram_luc !== null) {
    return { hanh_dong: 'khong', ly_do: 'Tin này đã ra kênh ngoài rồi.' };
  }
  if (tin.gui_so_lan_thu >= SO_LAN_GUI_TOI_DA) {
    return {
      hanh_dong: 'khong',
      ly_do: `Đã gửi ${String(SO_LAN_GUI_TOI_DA)} lần (1 lần đầu + ${String(
        SO_LAN_THU_LAI_TOI_DA,
      )} lần thử lại) và đều trượt — 19.12 câu 6.`,
    };
  }
  if (tuy_chon.tat === true && (tin.bao_mat ?? null) === null) {
    return {
      hanh_dong: 'tat',
      ly_do: 'Chủ đã tắt loại tin này trong Cài đặt (mục 12 d.348); tin vẫn ở trong chuông.',
    };
  }
  if (tin.gui_thu_lai_luc !== null && tin.gui_thu_lai_luc > bay_gio) {
    return {
      hanh_dong: 'hoan',
      moc: tin.gui_thu_lai_luc,
      ly_do: 'Chưa tới mốc thử lại sau một lần gửi trượt.',
    };
  }

  if (tin.uu_tien !== 'khan' && trongGioYenLang(bay_gio, lech_phut)) {
    return {
      hanh_dong: 'hoan',
      moc: cuoiGioYenLang(bay_gio, lech_phut),
      ly_do: 'Đang trong giờ yên lặng; tin không phải 🔴 nên hoãn tới cuối giờ yên lặng.',
    };
  }

  if (tin.loai === LOAI_TIN_GOP) {
    const cuoi = tuy_chon.moc_ticket_xong_cuoi ?? null;
    if (cuoi !== null && bay_gio - cuoi < GOP_TICKET_XONG_MS) {
      return {
        hanh_dong: 'hoan',
        moc: cuoi + GOP_TICKET_XONG_MS,
        ly_do: `Tin "Ticket Xong" tối đa 1 tin mỗi ${String(GOP_TICKET_XONG_PHUT)} phút (mục 12 d.345).`,
      };
    }
  }

  return { hanh_dong: 'gui' };
}
