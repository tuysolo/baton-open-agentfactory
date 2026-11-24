/**
 * **Luật thuần của mục Cần Chủ** — SPEC mục 8 (d.226–291), 19.8 (d.531–535),
 * 19.12 câu 4 (Chung là rỗng), câu 18 (cấp `T-số` qua ô "Tạo mục Cần Chủ"),
 * câu 19 (`OPTIONS_REQUIRED` / `COMMAND_REQUIRED` là 422).
 *
 * Để ở `@baton/shared` và **không chạm DB**, cùng nếp `luot-giao.ts`,
 * `bang-chung.ts`, `luat-trang-thai.ts`, `co-review-lai.ts`: mọi luật của mục 8
 * nằm **một chỗ**, test được không cần Miniflare, và cả API lẫn CLI (phần 5) lẫn
 * web (phần 6) đọc cùng một bản.
 *
 * Lượt này là đường **TẠO**. Luật của đường **xử lý** (19.9: kết quả, bỏ qua, mở
 * lại) là lượt 2 và **chưa** ở đây.
 */

import { BatonError } from './loi.js';
import { laMaHopLe, type LoaiCanChu, type MucCanChu } from './ma-nhan.js';

/* ------------------------------------------------------------------ *
 * 1. Múi giờ của chủ — CÂU HỎI SPEC #68
 * ------------------------------------------------------------------ */

/**
 * **Múi giờ của chủ, tính bằng phút lệch so với UTC.**
 *
 * 19.8 nói hạn mặc định của 🟡 là "20:00", và ranh giới là "18:00" — hai **giờ
 * đồng hồ trên tường**, nên chúng chỉ có nghĩa trong một múi giờ. SPEC **không
 * nói múi giờ nào** cho tính toán phía server: chỗ duy nhất SPEC nhắc giờ Việt
 * Nam là mục 0 nguyên tắc 8, và câu đó nói về **giao diện** ("Giao diện tiếng
 * Việt mặc định …, giờ Việt Nam (UTC+7), nền sáng") — tức hiển thị, không phải
 * một hằng của nghiệp vụ. Xem `cau-hoi-spec.md` **#68**.
 *
 * Hướng an toàn đã chọn: lấy đúng **UTC+7** của nguyên tắc 8 và khai nó ở **một
 * chỗ duy nhất** — chính hằng này. Mọi giờ-trên-tường của Baton đi qua
 * `gioDiaPhuong` và `mocGioDiaPhuong` dưới đây, nên nếu phiên spec chốt "múi giờ
 * là một cài đặt của workspace" thì việc phải làm là **một dòng**: đổi hằng này
 * thành một tham số đọc từ `workspace`, và hai hàm kia đã nhận nó qua đối số.
 *
 * Cùng khung giờ này còn chờ ba luật nữa (lịch nhắc phiên duyệt 08:00/20:00 của
 * mục 8 d.276, handoff tối 20:00 của mục 11 d.330, giờ yên lặng 23:00–07:00 của
 * mục 12 d.347) — nên một chỗ duy nhất là điều kiện để bốn luật không lệch nhau.
 */
export const MUI_GIO_CHU_PHUT = 420;

const MOT_PHUT_MS = 60_000;
const MOT_GIO_MS = 60 * MOT_PHUT_MS;
const MOT_NGAY_MS = 24 * MOT_GIO_MS;

/**
 * Giờ **trên tường** (0–23) của một mốc epoch, theo múi giờ chủ.
 *
 * Cộng độ lệch rồi đọc bằng getter **UTC**: `Date` của Workers chạy ở UTC, nên
 * `getHours()` sẽ trả đúng UTC và luật 18:00 sẽ sai 7 giờ. Không dùng
 * `Intl.DateTimeFormat`: nó mang theo cả cơ sở dữ liệu múi giờ và lịch sử đổi
 * giờ, mà Việt Nam không có giờ mùa hè — một độ lệch cố định là mô hình đúng, và
 * nó kiểm chứng được bằng số học.
 */
export function gioDiaPhuong(moc: number, lech_phut = MUI_GIO_CHU_PHUT): number {
  return new Date(moc + lech_phut * MOT_PHUT_MS).getUTCHours();
}

/**
 * Mốc epoch của **nửa đêm địa phương** của ngày chứa `moc`.
 *
 * `Math.floor` chứ không phép chia thường: mốc trước epoch (1970) cho ra số âm,
 * và `floor` vẫn lùi về nửa đêm đúng ngày, còn phép cắt phần thập phân thì nhảy
 * sang ngày sau. Baton không có dữ liệu trước 1970, nhưng một hàm thời gian sai
 * ở nửa trục số là một hàm không tin được.
 */
export function nuaDemDiaPhuong(moc: number, lech_phut = MUI_GIO_CHU_PHUT): number {
  const lech_ms = lech_phut * MOT_PHUT_MS;
  return Math.floor((moc + lech_ms) / MOT_NGAY_MS) * MOT_NGAY_MS - lech_ms;
}

/* ------------------------------------------------------------------ *
 * 2. Hạn mặc định — 19.8 (d.533)
 * ------------------------------------------------------------------ */

/** 🔴 "luôn là **4 giờ** kể từ lúc tạo" — 19.8. */
export const HAN_MAC_DINH_GAP_GIO = 4;

/** Giờ ranh giới của 🟡: "tạo **trước 18:00** … **từ 18:00 trở đi**" — 19.8. */
export const GIO_RANH_GIOI_TRONG_NGAY = 18;

/** Giờ hạn của 🟡: "hạn là **20:00**" — 19.8. */
export const GIO_HAN_TRONG_NGAY = 20;

/**
 * **Hạn mặc định** của một mục, theo đúng chữ 19.8:
 *   * `urgent` 🔴: `tao_luc + 4 giờ`.
 *   * `today` 🟡: tạo **trước** 18:00 giờ địa phương → **20:00 cùng ngày**; từ
 *     **18:00 trở đi** → **20:00 hôm sau**.
 *   * `later` ⚪: **không có hạn mặc định** → `null`.
 *
 * Mốc **bằng đúng** 18:00 thuộc nhánh "hôm sau": SPEC viết "tạo **trước** 18:00"
 * cho nhánh cùng ngày và "**từ 18:00 trở đi**" cho nhánh hôm sau, nên 18:00:00.000
 * nằm ở nhánh sau theo đúng chữ. (Cùng nếp đọc ranh giới của `cau-hoi-spec.md`
 * #61: một ranh giới không chốt là một ranh giới hai lượt sau cài hai kiểu.)
 */
export function hanMacDinh(
  muc: MucCanChu,
  tao_luc: number,
  lech_phut = MUI_GIO_CHU_PHUT,
): number | null {
  if (muc === 'later') return null;
  if (muc === 'urgent') return tao_luc + HAN_MAC_DINH_GAP_GIO * MOT_GIO_MS;

  // 🟡 — giờ **trên tường** quyết định "cùng ngày" hay "hôm sau".
  const gio = gioDiaPhuong(tao_luc, lech_phut);
  const sang_hom_sau = gio >= GIO_RANH_GIOI_TRONG_NGAY ? MOT_NGAY_MS : 0;

  return (
    nuaDemDiaPhuong(tao_luc, lech_phut) + GIO_HAN_TRONG_NGAY * MOT_GIO_MS + sang_hom_sau
  );
}

/**
 * **Quá hạn** — 19.8 ("Quá hạn: **không đổi mức**").
 *
 * Là một **dẫn xuất**, không một cột trong DB: cùng nếp `stalled` (19.12 câu 42)
 * và `nguoiDangCam` (19.1). Mức của mục **không** đổi theo nó; nó chỉ quyết định
 * viền đỏ, chữ "quá hạn X giờ", và việc thẻ được đưa lên đầu **khối của nó**.
 */
export function quaHan(han_luc: number | null, bay_gio: number): boolean {
  return han_luc !== null && han_luc < bay_gio;
}

/**
 * **"quá hạn X giờ"** — con số `X` của mục 8 d.249 (19.8 viết "chữ 'quá hạn X'").
 *
 * Tính ở **server**, không ở phần 6: nếu hai tầng cùng tính thì đó là **hai**
 * luật, và chúng sẽ lệch nhau ở đúng chỗ khó thấy nhất (làm tròn). Cùng lý lẽ đã
 * dùng cho `stalled` và `nguoiDangCam`.
 *
 * `null` khi **chưa** quá hạn (gồm cả mục không có hạn) — không `0`: một thẻ hiện
 * "quá hạn 0 giờ" là một thẻ nói sai.
 *
 * **Làm tròn LÊN**, và SPEC không nói làm tròn thế nào (`cau-hoi-spec.md` #77):
 * `Math.floor` cho ra "quá hạn 0 giờ" trong suốt giờ đầu — đúng cái câu không
 * được phép hiện. Làm tròn lên thì một mục quá hạn 5 phút hiện "quá hạn 1 giờ",
 * tức nói **quá** chứ không nói **thiếu**; với một màn hình mà việc của nó là đẩy
 * mục gấp lên trước, nói quá là hướng sai an toàn hơn.
 */
export function gioQuaHan(han_luc: number | null, bay_gio: number): number | null {
  if (!quaHan(han_luc, bay_gio)) return null;
  return Math.ceil((bay_gio - (han_luc as number)) / MOT_GIO_MS);
}

/* ------------------------------------------------------------------ *
 * 2b. Thứ tự ba mức, và "mức cao nhất" — mục 8 d.248–249
 * ------------------------------------------------------------------ */

/**
 * Ba mức theo **độ khẩn giảm dần** — đúng thứ tự ba khối của mục 8 d.249
 * ("3 khối 🔴 Gấp · 🟡 Trong ngày · ⚪ Không gấp") và đúng thứ tự phiên duyệt của
 * d.274 ("theo thứ tự 🔴 → 🟡 → ⚪").
 *
 * Một mảng có thứ tự, không một `Record` số: thứ tự **là** dữ liệu ở đây, và cả
 * ba đường dùng nó (ba khối, huy hiệu, phiên duyệt) phải đọc **cùng một** thứ tự.
 */
export const MUC_THEO_DO_KHAN: readonly MucCanChu[] = ['urgent', 'today', 'later'];

/**
 * **Mức cao nhất** trong một tập mức — con số màu của huy hiệu đếm ở d.248
 * ("huy hiệu đếm số `Chờ` **màu theo mức cao nhất**").
 *
 * Tập rỗng → `null`, tức **không còn mục `Chờ` nào**, tức huy hiệu không hiện.
 * Trả `'later'` cho tập rỗng sẽ cho phần 6 một huy hiệu ⚪ với số 0.
 */
export function mucCaoNhat(ds: readonly MucCanChu[]): MucCanChu | null {
  for (const m of MUC_THEO_DO_KHAN) {
    if (ds.includes(m)) return m;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 2c. Khoảng NGÀY trên tường — mục 8 d.251, 19.12 câu 60
 * ------------------------------------------------------------------ */

/** Một ngày trên tường, dạng `YYYY-MM-DD` — khớp `ngayDiaPhuong` của `nhat-ky.ts`. */
const DANG_NGAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Mốc epoch của **nửa đêm địa phương** của một ngày viết bằng chữ.
 *
 * Phép nghịch của `ngayDiaPhuong`, và ở cùng khung giờ `MUI_GIO_CHU_PHUT` —
 * 19.12 **câu 60** đòi mọi giờ-trên-tường đi qua **đúng một chỗ**. Bộ lọc "theo
 * khoảng ngày" của d.251 là một giờ-trên-tường (chủ gõ "02/10 → 04/10" theo đồng
 * hồ của chủ), nên nó đi qua đây chứ không tự nhân 86 400 000.
 *
 * `Date.UTC` rồi trừ độ lệch, **không** `new Date('2026-10-04')`: hàm phân tích
 * chuỗi có nhiều nhánh theo môi trường, còn `Date.UTC` là số học thuần.
 *
 * Chuỗi sai dạng → `null`; người gọi quyết định đó là `INVALID_INPUT` hay không.
 */
export function nuaDemCuaNgay(ngay: string, lech_phut = MUI_GIO_CHU_PHUT): number | null {
  const khop = DANG_NGAY.exec(ngay.trim());
  if (khop === null) return null;
  const nam = Number(khop[1]);
  const thang = Number(khop[2]);
  const ngay_so = Number(khop[3]);
  if (thang < 1 || thang > 12 || ngay_so < 1 || ngay_so > 31) return null;

  const utc = Date.UTC(nam, thang - 1, ngay_so);
  // `Date.UTC` tự "tràn" ngày sai (31/02 → 03/03). Kiểm lại để một ngày không có
  // thật bị từ chối, chứ không âm thầm thành một ngày khác.
  const d = new Date(utc);
  if (d.getUTCMonth() !== thang - 1 || d.getUTCDate() !== ngay_so) return null;

  return utc - lech_phut * MOT_PHUT_MS;
}

/**
 * Khoảng **nửa mở** `[tu, den)` theo epoch của một khoảng ngày trên tường.
 *
 * Nửa mở, không `[tu, den]`: `den_ngay` là **cả ngày đó**, nên biên phải là nửa
 * đêm của **ngày kế tiếp**. Lấy `den = nuaDem(den_ngay) + 1 ngày` thì một mục xử
 * lý lúc 23:59 ngày cuối vẫn nằm trong khoảng — còn `<= nuaDem(den_ngay)` thì
 * **mất gần trọn một ngày** dữ liệu, loại lỗi lệch-một không ai thấy.
 */
export function khoangNgay(
  tu_ngay: string | null,
  den_ngay: string | null,
  lech_phut = MUI_GIO_CHU_PHUT,
): { tu: number | null; den: number | null } {
  const tu = tu_ngay === null ? null : nuaDemCuaNgay(tu_ngay, lech_phut);
  const nua_dem_den = den_ngay === null ? null : nuaDemCuaNgay(den_ngay, lech_phut);
  if ((tu_ngay !== null && tu === null) || (den_ngay !== null && nua_dem_den === null)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Khoảng ngày phải có dạng YYYY-MM-DD.',
    });
  }
  return { tu, den: nua_dem_den === null ? null : nua_dem_den + MOT_NGAY_MS };
}

/* ------------------------------------------------------------------ *
 * 3. `fyi` tối đa 🟡 — 19.8 (d.534)
 * ------------------------------------------------------------------ */

/** Mức cao nhất mà loại `Chỉ để biết` được mang — 19.8. */
export const MUC_TOI_DA_CUA_FYI: MucCanChu = 'today';

/** Kết quả của việc hạ mức, để handler **báo lại cho agent** — 19.8. */
export interface KetQuaHaMuc {
  /** Mức **thật sự** được ghi. */
  muc: MucCanChu;
  /** Server đã hạ mức so với thứ agent gửi lên? */
  da_ha: boolean;
  /** Câu tiếng Việt để trả về cho agent; `null` khi không hạ gì. */
  ghi_chu: string | null;
}

/**
 * **19.8: "Loại `Chỉ để biết` tối đa là 🟡. Gửi 🔴 thì server tự hạ về 🟡 và báo
 * lại cho agent trong kết quả trả về."**
 *
 * Hai nửa của câu đó, và nửa thứ hai mới là nửa dễ mất: **không được im lặng.**
 * Một mục bị hạ mức mà agent không biết là một agent tưởng mình đã báo động 🔴 và
 * sẽ chờ phản hồi trong 4 giờ, trong khi mục thật nằm ở khối 🟡 với hạn 20:00.
 * Nên hàm này trả về cả `da_ha` và một câu tiếng Việt, và handler đưa cả hai ra
 * kết quả của lệnh — không ghi vào log.
 *
 * Không ném lỗi: SPEC nói "**tự hạ**", tức mục **vẫn được tạo**.
 */
export function haMucNeuCan(loai: LoaiCanChu, muc: MucCanChu): KetQuaHaMuc {
  if (loai !== 'fyi' || muc !== 'urgent') return { muc, da_ha: false, ghi_chu: null };
  return {
    muc: MUC_TOI_DA_CUA_FYI,
    da_ha: true,
    ghi_chu:
      'Loại "Chỉ để biết" tối đa là 🟡 Trong ngày (SPEC 19.8), nên mức 🔴 Gấp đã được hạ về 🟡 Trong ngày.',
  };
}

/* ------------------------------------------------------------------ *
 * 4. Kiểm nhập theo LOẠI — mục 8 d.236–239
 * ------------------------------------------------------------------ */

/** Số phương án của loại `Quyết định`: **2–5** — mục 8 d.236. */
export const SO_PHUONG_AN_TOI_THIEU = 2;
export const SO_PHUONG_AN_TOI_DA = 5;

/** Số dòng của **mỗi** phương án: **1–3** — mục 8 d.236. */
export const SO_DONG_PHUONG_AN_TOI_DA = 3;

/**
 * Nhãn **A, B, C…** của phương án — mục 8 d.236. Đúng 5 chữ, vì trần là 5 phương
 * án; khớp CHECK của `can_chu_phuong_an.nhan` (migration 0013).
 *
 * Nhãn do **server gán theo thứ tự**, không nhận từ client: nhãn là thứ ô "Trả
 * lời hàng loạt" của mục 8 khớp theo ("khớp phương án nếu có chữ cái đầu hợp
 * lệ") và là thứ phím tắt `1`–`5` trỏ tới, nên để client tự đặt là mở đường cho
 * một mục có nhãn `A`, `A`, `C`.
 */
export const NHAN_PHUONG_AN = ['A', 'B', 'C', 'D', 'E'] as const;
export type NhanPhuongAn = (typeof NHAN_PHUONG_AN)[number];

/** Một phương án **đã kiểm**, sẵn sàng ghi vào `can_chu_phuong_an`. */
export interface PhuongAnDaKiem {
  nhan: NhanPhuongAn;
  thu_tu: number;
  noi_dung: string;
  de_xuat: boolean;
}

/** Một file hoặc link **đã kiểm**, sẵn sàng ghi vào `can_chu_file`. */
export interface FileReviewDaKiem {
  loai: 'file' | 'link';
  dia_chi: string;
  thu_tu: number;
}

/**
 * **Lệnh kèm** — trường **chung của mọi loại** (`cau-hoi-spec.md` #130).
 *
 * d.250 viết chung cho mọi thẻ ("Mỗi thẻ hiện đủ: … **lệnh có nút Copy** …"), và
 * d.237 chỉ nói `run_command` **bắt buộc** có lệnh, không nói loại khác không
 * được có. Trước lượt này server **bỏ im lặng** lệnh của ba loại kia — lỗi thật
 * chủ gặp 13/10. `null` = mục không mang lệnh nào.
 */
export interface LenhKemDaKiem {
  lenh: string | null;
  can_tty: boolean;
}

/**
 * **Nội dung đã kiểm** của một mục, theo loại. Mỗi nhánh chỉ mang đúng trường
 * **bắt buộc theo loại** của nó — nên handler không thể ghi một `phuong_an` vào
 * một mục `review`. `lenh` / `can_tty` thì **không** theo loại: chúng là trường
 * chung (xem `LenhKemDaKiem`), chỉ riêng `run_command` có `lenh` **khác null**
 * chắc chắn ở mức kiểu, vì d.237 bắt buộc nó.
 */
export type NoiDungCanChuDaKiem =
  | ({ loai: 'decision'; phuong_an: PhuongAnDaKiem[]; ly_do_de_xuat: string } & LenhKemDaKiem)
  | { loai: 'run_command'; lenh: string; can_tty: boolean }
  | ({ loai: 'review'; file: FileReviewDaKiem[] } & LenhKemDaKiem)
  | ({ loai: 'fyi' } & LenhKemDaKiem);

/** Loại mục: **đúng 1 trong 4** — mục 8 d.235. */
export function kiemLoaiCanChu(loai: unknown): LoaiCanChu {
  if (!laMaHopLe('loai_can_chu', loai)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Loại mục Cần Chủ phải là một trong: decision, run_command, review, fyi.',
    });
  }
  return loai;
}

/** Mức: **đúng 1 trong 3** — mục 8 d.234. */
export function kiemMucCanChu(muc: unknown): MucCanChu {
  if (!laMaHopLe('muc_can_chu', muc)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Mức mục Cần Chủ phải là một trong: urgent, today, later.',
    });
  }
  return muc;
}

/** Tiêu đề mục: bắt buộc, 1–200 ký tự sau khi cắt khoảng trắng (khớp CHECK 0013). */
export function kiemTieuDeCanChu(tieu_de: unknown): string {
  const t = typeof tieu_de === 'string' ? tieu_de.trim() : '';
  if (t.length < 1 || t.length > 200) {
    throw new BatonError('INVALID_INPUT', { message: 'Tiêu đề mục Cần Chủ phải có 1–200 ký tự.' });
  }
  return t;
}

/** Số dòng **thật** của một chuỗi, sau khi cắt khoảng trắng hai đầu. */
function soDong(s: string): number {
  return s.split('\n').length;
}

/**
 * Phương án của loại `Quyết định` — mục 8 d.236.
 *
 * `OPTIONS_REQUIRED` (422 theo 19.12 câu 19) cho **mọi** vế của cùng một câu
 * SPEC: thiếu hẳn phương án, số phương án ngoài 2–5, và thiếu phương án đề xuất
 * hoặc lý do. Căn cứ: d.236 là **một** câu ("bắt buộc 2–5 phương án …, **cộng**
 * phương án đề xuất và lý do") và mục 8 phần Lỗi gắn đúng một mã cho nó ("Loại
 * `Quyết định` mà **thiếu phương án**: `OPTIONS_REQUIRED`"). Dùng `INVALID_INPUT`
 * cho một nửa câu thì agent nhận hai mã khác nhau cho cùng một việc phải sửa.
 *
 * `INVALID_INPUT` chỉ dành cho lỗi **hình dạng dữ liệu** mà SPEC không nói tới:
 * `phuong_an` không phải danh sách, một phần tử không phải chữ/đối tượng, hoặc
 * một phương án quá 3 dòng (d.236 nêu "1–3 dòng" như một giới hạn kích thước,
 * không như điều kiện "có phương án hay không").
 */
export function kiemPhuongAn(
  nguon: unknown,
  ly_do_de_xuat_tho: unknown,
): { phuong_an: PhuongAnDaKiem[]; ly_do_de_xuat: string } {
  if (nguon === undefined || nguon === null) {
    throw new BatonError('OPTIONS_REQUIRED');
  }
  if (!Array.isArray(nguon)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'phuong_an phải là một danh sách 2–5 phương án.',
    });
  }
  if (nguon.length < SO_PHUONG_AN_TOI_THIEU || nguon.length > SO_PHUONG_AN_TOI_DA) {
    throw new BatonError('OPTIONS_REQUIRED', {
      message: `Mục loại Quyết định bắt buộc có ${String(SO_PHUONG_AN_TOI_THIEU)}–${String(
        SO_PHUONG_AN_TOI_DA,
      )} phương án; đã gửi ${String(nguon.length)}.`,
    });
  }

  const phuong_an: PhuongAnDaKiem[] = [];
  let so_de_xuat = 0;

  for (let i = 0; i < nguon.length; i++) {
    const tho = nguon[i] as unknown;
    // Nhận cả chuỗi trần (`["A thì…", "B thì…"]`) và đối tượng có cờ `de_xuat`:
    // CLI của phần 5 sẽ gửi dạng chuỗi, web của phần 6 gửi dạng đối tượng.
    const doi_tuong =
      typeof tho === 'string'
        ? { noi_dung: tho, de_xuat: false }
        : typeof tho === 'object' && tho !== null
          ? (tho as { noi_dung?: unknown; de_xuat?: unknown })
          : null;
    if (doi_tuong === null) {
      throw new BatonError('INVALID_INPUT', {
        message: `Phương án thứ ${String(i + 1)} phải là chữ hoặc một đối tượng có nội dung.`,
      });
    }

    const noi_dung = typeof doi_tuong.noi_dung === 'string' ? doi_tuong.noi_dung.trim() : '';
    if (noi_dung.length < 1) {
      throw new BatonError('OPTIONS_REQUIRED', {
        message: `Phương án thứ ${String(i + 1)} không có nội dung.`,
      });
    }
    if (noi_dung.length > 2000) {
      throw new BatonError('INVALID_INPUT', {
        message: `Phương án thứ ${String(i + 1)} tối đa 2000 ký tự.`,
      });
    }
    if (soDong(noi_dung) > SO_DONG_PHUONG_AN_TOI_DA) {
      throw new BatonError('INVALID_INPUT', {
        message: `Mỗi phương án tối đa ${String(SO_DONG_PHUONG_AN_TOI_DA)} dòng (SPEC mục 8); phương án thứ ${String(
          i + 1,
        )} có ${String(soDong(noi_dung))} dòng.`,
      });
    }

    const de_xuat = doi_tuong.de_xuat === true;
    if (de_xuat) so_de_xuat++;

    // Nhãn do **server** gán theo thứ tự gửi lên — xem `NHAN_PHUONG_AN`.
    phuong_an.push({ nhan: NHAN_PHUONG_AN[i]!, thu_tu: i + 1, noi_dung, de_xuat });
  }

  if (so_de_xuat === 0) {
    throw new BatonError('OPTIONS_REQUIRED', {
      message:
        'Mục loại Quyết định bắt buộc có một phương án đề xuất (đặt de_xuat = true cho đúng một phương án) — SPEC mục 8.',
    });
  }
  if (so_de_xuat > 1) {
    throw new BatonError('OPTIONS_REQUIRED', {
      message: `Chỉ được một phương án đề xuất; đã gửi ${String(so_de_xuat)}.`,
    });
  }

  const ly_do =
    typeof ly_do_de_xuat_tho === 'string' ? ly_do_de_xuat_tho.trim() : '';
  if (ly_do.length < 1) {
    throw new BatonError('OPTIONS_REQUIRED', {
      message: 'Mục loại Quyết định bắt buộc có lý do cho phương án đề xuất — SPEC mục 8.',
    });
  }
  if (ly_do.length > 20_000) {
    throw new BatonError('INVALID_INPUT', { message: 'Lý do đề xuất tối đa 20.000 ký tự.' });
  }

  return { phuong_an, ly_do_de_xuat: ly_do };
}

/**
 * Lệnh của loại `Chủ chạy lệnh` — mục 8 d.237, mã lỗi `COMMAND_REQUIRED`
 * (422 theo 19.12 câu 19).
 */
export function kiemLenhChay(lenh_tho: unknown, can_tty_tho: unknown): { lenh: string; can_tty: boolean } {
  const lenh = typeof lenh_tho === 'string' ? lenh_tho.trim() : '';
  if (lenh.length < 1) throw new BatonError('COMMAND_REQUIRED');
  if (lenh.length > 20_000) {
    throw new BatonError('INVALID_INPUT', { message: 'Lệnh tối đa 20.000 ký tự.' });
  }
  if (can_tty_tho !== undefined && can_tty_tho !== null && typeof can_tty_tho !== 'boolean') {
    throw new BatonError('INVALID_INPUT', { message: 'can_tty phải là true hoặc false.' });
  }
  return { lenh, can_tty: can_tty_tho === true };
}

/**
 * Lệnh **tuỳ chọn** của ba loại còn lại (`decision`, `review`, `fyi`) — d.250
 * ("lệnh có nút Copy", viết chung cho **mọi** thẻ); `cau-hoi-spec.md` #130.
 *
 * Khác `kiemLenhChay` đúng một vế: **không** có lệnh thì **không** phải lỗi
 * (`COMMAND_REQUIRED` là luật của riêng `run_command` — d.287). Mọi giới hạn còn
 * lại dùng chung chính `kiemLenhChay`, nên hai đường không lệch nhau một ký tự
 * nào về độ dài tối đa hay kiểu của `can_tty`.
 *
 * Một chuỗi toàn khoảng trắng tính là **không có lệnh**, không phải một lệnh
 * rỗng: cùng cách `kiemLenhChay` cắt khoảng trắng trước khi đếm.
 */
export function kiemLenhKem(lenh_tho: unknown, can_tty_tho: unknown): LenhKemDaKiem {
  const co_lenh = typeof lenh_tho === 'string' && lenh_tho.trim().length > 0;
  if (!co_lenh) {
    if (can_tty_tho !== undefined && can_tty_tho !== null && typeof can_tty_tho !== 'boolean') {
      throw new BatonError('INVALID_INPUT', { message: 'can_tty phải là true hoặc false.' });
    }
    /*
     * `can_tty` **không** có lệnh nào để gắn vào ⇒ về 0. Trigger
     * `tg_can_chu_lenh_kem_*` (0023) ép đúng luật này ở tầng DB, nên một đường
     * ghi mới ở lượt sau mà quên thì vỡ ngay chứ không lặng lẽ ghi một cờ treo.
     */
    return { lenh: null, can_tty: false };
  }
  return kiemLenhChay(lenh_tho, can_tty_tho);
}

/**
 * File hoặc link của loại `Chủ review` — mục 8 d.238 ("bắt buộc có **ít nhất 1
 * file hoặc link** để xem").
 *
 * SPEC **không** nêu mã lỗi riêng cho ca này (phần Lỗi của mục 8 chỉ có
 * `OPTIONS_REQUIRED` và `COMMAND_REQUIRED`), nên dùng `INVALID_INPUT`/422 — mã
 * chung của "dữ liệu nghiệp vụ chưa đạt" theo 19.12 câu 19. **Không** mượn
 * `OPTIONS_REQUIRED`: thông điệp của nó nói về phương án, nên agent sẽ đi sửa
 * sai chỗ.
 *
 * `loai` là **khoá** (`file` hay `link`), quyết định tại đây theo tiền tố, không
 * để tầng hiển thị đoán — xem ghi chú của bảng `can_chu_file` (0013).
 */
export function kiemFileReview(nguon: unknown): FileReviewDaKiem[] {
  const ds = nguon === undefined || nguon === null ? [] : nguon;
  if (!Array.isArray(ds)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'file_hoac_link phải là một danh sách đường dẫn hoặc link.',
    });
  }
  if (ds.length === 0) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Mục loại Chủ review bắt buộc có ít nhất 1 file hoặc link để xem (SPEC mục 8).',
    });
  }

  const ra: FileReviewDaKiem[] = [];
  for (let i = 0; i < ds.length; i++) {
    const t = typeof ds[i] === 'string' ? (ds[i] as string).trim() : '';
    if (t.length < 1) {
      throw new BatonError('INVALID_INPUT', {
        message: `File hoặc link thứ ${String(i + 1)} rỗng.`,
      });
    }
    if (t.length > 2000) {
      throw new BatonError('INVALID_INPUT', {
        message: `File hoặc link thứ ${String(i + 1)} tối đa 2000 ký tự.`,
      });
    }
    ra.push({ loai: loaiCuaDiaChi(t, i), dia_chi: t, thu_tu: i + 1 });
  }
  return ra;
}

/**
 * `file` hay `link`. **Danh sách khoá, không chữ tự do**: chỉ nhận `file://`,
 * đường dẫn tuyệt đối (`/…`), `http://`, `https://`. Mọi thứ khác bị từ chối —
 * một chuỗi không mở được thì cái nút "mở file hoặc link" của mục 8 không có
 * việc gì để làm, và một mục `review` không xem được là một mục chủ không quyết
 * được.
 */
function loaiCuaDiaChi(dia_chi: string, i: number): 'file' | 'link' {
  if (dia_chi.startsWith('file://') || dia_chi.startsWith('/')) return 'file';
  if (dia_chi.startsWith('http://') || dia_chi.startsWith('https://')) return 'link';
  throw new BatonError('INVALID_INPUT', {
    message: `File hoặc link thứ ${String(
      i + 1,
    )} phải bắt đầu bằng file://, / (đường dẫn tuyệt đối), http:// hoặc https://.`,
  });
}

/**
 * **Một cửa duy nhất** cho "nội dung bắt buộc theo loại" — mục 8 d.236–239.
 *
 * `fyi` "không cần làm gì, chỉ cần xác nhận đã đọc" (d.239) ⇒ không kiểm gì.
 *
 * Gom bốn nhánh vào một hàm để handler **không có nhánh nào bỏ sót**: kiểu trả
 * về là union theo `loai`, nên TypeScript buộc chỗ ghi phải xử lý đủ bốn loại.
 *
 * `lenh` / `can_tty` **không** thuộc nhóm "theo loại": d.250 cho **mọi** thẻ có
 * "lệnh có nút Copy", nên cả bốn nhánh đều mang chúng — bắt buộc với
 * `run_command` (d.237 ⇒ `kiemLenhChay`, `COMMAND_REQUIRED`), tuỳ chọn với ba
 * loại kia (`kiemLenhKem`). Xem `cau-hoi-spec.md` #130.
 */
export function kiemNoiDungCanChu(
  loai: LoaiCanChu,
  nguon: {
    phuong_an?: unknown;
    ly_do_de_xuat?: unknown;
    lenh?: unknown;
    can_tty?: unknown;
    file_hoac_link?: unknown;
  },
): NoiDungCanChuDaKiem {
  switch (loai) {
    case 'decision': {
      const { phuong_an, ly_do_de_xuat } = kiemPhuongAn(nguon.phuong_an, nguon.ly_do_de_xuat);
      return { loai, phuong_an, ly_do_de_xuat, ...kiemLenhKem(nguon.lenh, nguon.can_tty) };
    }
    case 'run_command': {
      const { lenh, can_tty } = kiemLenhChay(nguon.lenh, nguon.can_tty);
      return { loai, lenh, can_tty };
    }
    case 'review':
      return {
        loai,
        file: kiemFileReview(nguon.file_hoac_link),
        ...kiemLenhKem(nguon.lenh, nguon.can_tty),
      };
    case 'fyi':
      return { loai, ...kiemLenhKem(nguon.lenh, nguon.can_tty) };
  }
}

/* ------------------------------------------------------------------ *
 * 5. Cờ "có thể trùng T-x" — mục 8, phần Lỗi
 * ------------------------------------------------------------------ */

/** Cửa sổ của luật "có thể trùng": **24 giờ** — mục 8, phần Lỗi. */
export const CUA_SO_TRUNG_GIO = 24;
export const CUA_SO_TRUNG_MS = CUA_SO_TRUNG_GIO * MOT_GIO_MS;

/** Một mục đang `Chờ` như luật "có thể trùng" cần biết. */
export interface MucChoDeSoTrung {
  id: string;
  ma_so: number;
  tieu_de: string;
  /** `null` = "Chung" — 19.12 câu 4. */
  project_id: string | null;
  tao_luc: number;
}

/**
 * **Mục 8, phần Lỗi:** "Trùng tiêu đề với một mục `Chờ` **cùng dự án** trong **24
 * giờ**: **vẫn tạo**, nhưng gắn cờ 'có thể trùng T-x'."
 *
 * Bốn điều kiện, và cả bốn phải đúng — ba ca đối chứng (quá 24 giờ, khác dự án,
 * mục kia đã xử lý) đều phải **không** gắn cờ. Điều kiện "đang `Chờ`" do câu truy
 * vấn lọc (`trang_thai = 'open'`, index `ix_can_chu_trung`), nên hàm này nhận vào
 * một tập **đã** chỉ gồm mục Chờ.
 *
 * "Cùng dự án" áp **cả cho Chung**: hai mục Chung cùng tiêu đề trong 24 giờ là
 * trùng nhau, vì 19.12 câu 4 nói Chung là **một giá trị** của trường dự án (rỗng),
 * nên `null === null` là "cùng dự án". Một mục Chung và một mục của dự án SAI thì
 * **không** trùng.
 *
 * "Trùng tiêu đề" so **sau khi cắt khoảng trắng, không phân biệt chữ hoa/thường
 * của ASCII**: `"Chon DB"` và `"chon db  "` là cùng một câu hỏi với chủ, và cờ này
 * chỉ là một lời nhắc chứ không chặn gì (SPEC nói rõ "**vẫn tạo**"), nên hướng
 * rộng hơn ở đây không làm mất mục nào. SPEC không nói rõ cách so — xem
 * `cau-hoi-spec.md` **#70**.
 *
 * Phép so sống ở **hai** chỗ và hai chỗ đó phải nói **cùng một thứ**: câu truy vấn
 * lọc `lower(tieu_de) = lower(?)` (đi index biểu thức `ix_can_chu_trung` của
 * 0013), còn hàm này so `chuanHoaTieuDe`. `lower()` của SQLite **chỉ biết ASCII**,
 * nên `chuanHoaTieuDe` cũng chỉ hạ ASCII — cố tình: nếu nó hạ cả tiếng Việt
 * (`toLocaleLowerCase('vi')`) thì nó rộng hơn câu SQL, tức một phép so **không
 * bao giờ chạy tới** vì SQL đã lọc chặt hơn. Giới hạn còn lại được khai đúng ở
 * #70: hai tiêu đề chỉ khác hoa/thường ở một chữ **có dấu** (`"CHỌN"` vs `"chọn"`)
 * **không** được gắn cờ.
 *
 * Trả mục **mới nhất** nếu có nhiều mục thoả: cờ chỉ trỏ tới **một** `T-x`, và
 * mục gần nhất là mục chủ dễ nhớ nhất.
 */
export function mucCoTheTrung(
  moi: { tieu_de: string; project_id: string | null },
  dang_cho: readonly MucChoDeSoTrung[],
  bay_gio: number,
): MucChoDeSoTrung | null {
  const khoa = chuanHoaTieuDe(moi.tieu_de);
  let ra: MucChoDeSoTrung | null = null;

  for (const m of dang_cho) {
    if (chuanHoaTieuDe(m.tieu_de) !== khoa) continue;
    if (m.project_id !== moi.project_id) continue;
    if (bay_gio - m.tao_luc > CUA_SO_TRUNG_MS) continue;
    if (ra === null || m.tao_luc > ra.tao_luc) ra = m;
  }
  return ra;
}

/**
 * Khoá so trùng tiêu đề — xem `mucCoTheTrung`.
 *
 * Cắt khoảng trắng hai đầu, rồi hạ **đúng 26 chữ ASCII** `A`–`Z`. Không
 * `toLocaleLowerCase('vi')`: hàm này phải là **bản sao** của `lower()` trong câu
 * truy vấn `mucChoGanDay`, và `lower()` của SQLite chỉ biết ASCII. Hai bên lệch
 * nhau thì một bên thành mã chết (xem ghi chú của `mucCoTheTrung`).
 */
export function chuanHoaTieuDe(tieu_de: string): string {
  return tieu_de.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** `T-số` thành chữ — mục 8 ("Mã `T-số`"), mục 13 (`baton result T-x`). */
export function maCanChu(ma_so: number): string {
  return `T-${String(ma_so)}`;
}

/**
 * `"T-18"` → `18`; mọi thứ khác → `null` (tức là một **id**).
 *
 * **Phép nghịch của `maCanChu`, và ở cùng một chỗ với nó — có chủ ý.** Mục 13 gọi
 * mục bằng `T-số` ở mọi lệnh (`baton result T-x`, ô "Trả lời hàng loạt" d.264),
 * còn web gọi bằng id, nên **mọi** đường — ghi (`lenh-xu-ly-can-chu.ts`) và đọc
 * (`doc-can-chu.ts`) — phải dịch y hệt nhau. Hai bản dịch lệch nhau một chữ là
 * hai bộ mã nhận được hai tập mục khác nhau.
 */
export function maSoTuChu(chu: string): number | null {
  const khop = /^[Tt]-(\d{1,9})$/.exec(chu.trim());
  if (khop === null) return null;
  return Number(khop[1]);
}
