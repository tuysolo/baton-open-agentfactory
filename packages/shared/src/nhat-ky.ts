/**
 * **Luật thuần của Nhật ký quyết định** — SPEC mục 10 (d.305–312), mục 8 d.279,
 * 19.9 (d.541–542), 19.12 câu 4 ("Chung" là trường dự án để **rỗng**).
 *
 * Để ở `@baton/shared` và **không chạm DB**, cùng nếp `can-chu.ts`,
 * `bang-chung.ts`, `luat-trang-thai.ts`: mọi luật của mục 10 nằm **một chỗ**,
 * test được không cần Miniflare, và API lẫn CLI (`baton decision`, mục 13 d.377)
 * lẫn web (phần 6) đọc cùng một bản.
 */

import { BatonError } from './loi.js';
import { MUI_GIO_CHU_PHUT } from './can-chu.js';

/* ------------------------------------------------------------------ *
 * 1. Kiểm nội dung một dòng — d.306, d.308
 * ------------------------------------------------------------------ */

/** Giới hạn độ dài của `quyet_dinh` và `vi_sao` — khớp CHECK của 0014. */
export const DAI_TOI_DA_NHAT_KY = 20_000;

/**
 * **Quyết định** — d.308 liệt kê nó là một trường của dòng. Bắt buộc, không
 * rỗng sau khi cắt khoảng trắng.
 */
export function kiemQuyetDinh(quyet_dinh: unknown): string {
  const t = typeof quyet_dinh === 'string' ? quyet_dinh.trim() : '';
  if (t.length < 1) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Dòng Nhật ký bắt buộc có nội dung quyết định (SPEC mục 10).',
    });
  }
  if (t.length > DAI_TOI_DA_NHAT_KY) {
    throw new BatonError('INVALID_INPUT', {
      message: `Quyết định tối đa ${String(DAI_TOI_DA_NHAT_KY)} ký tự.`,
    });
  }
  return t;
}

/**
 * **Vì sao** — d.306: mục 10 tồn tại để trả lời "ai đã quyết cái này, **vì
 * sao**, lúc nào"; d.308 liệt kê nó là một trường của dòng.
 *
 * **Bắt buộc, không rỗng.** SPEC không nói tường minh nó có bắt buộc hay không
 * (`baton decision` ở mục 13 d.377 ghi `--why "…"` **không** trong ngoặc vuông,
 * tức bắt buộc, nhưng đó là chữ của bảng lệnh chứ không của mục 10) — xem
 * `cau-hoi-spec.md` **#71**. Hướng tạm là **chặt**: một dòng Nhật ký không có
 * "vì sao" làm hỏng đúng cái câu mà cả mục 10 hứa trả lời, và nới ra về sau dễ
 * hơn siết vào (dữ liệu đã ghi thì **không sửa được** — d.309).
 */
export function kiemViSao(vi_sao: unknown): string {
  const t = typeof vi_sao === 'string' ? vi_sao.trim() : '';
  if (t.length < 1) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Dòng Nhật ký bắt buộc có "vì sao" (SPEC mục 10 d.306).',
    });
  }
  if (t.length > DAI_TOI_DA_NHAT_KY) {
    throw new BatonError('INVALID_INPUT', {
      message: `"Vì sao" tối đa ${String(DAI_TOI_DA_NHAT_KY)} ký tự.`,
    });
  }
  return t;
}

/* ------------------------------------------------------------------ *
 * 2. Luật dữ liệu — d.312. **CẢNH BÁO, KHÔNG CHẶN.**
 * ------------------------------------------------------------------ */

/**
 * d.312 nguyên văn: "trường 'quyết định' có **cảnh báo** khi phát hiện mẫu
 * giống số CCCD, số tài khoản, lương (**dãy 9–12 số**, cụm **'lương'**). **Chỉ
 * cảnh báo, không chặn.** Mục đích là nhắc không đưa dữ liệu nhân sự vào."
 *
 * Ba chữ "chỉ cảnh báo, không chặn" là nửa dễ mất nhất của câu này, nên nó được
 * khoá bằng kiểu: hàm này trả một **danh sách** `CanhBaoDuLieu[]` (rỗng khi
 * không có gì để nhắc), **không ném** `BatonError` ở bất kỳ nhánh nào, và
 * handler đưa danh sách ra `ket_qua.canh_bao`.
 */
export const SO_CHU_SO_TOI_THIEU_CANH_BAO = 9;
export const SO_CHU_SO_TOI_DA_CANH_BAO = 12;

/**
 * Dãy **9–12 chữ số** đứng riêng (không dính chữ số nào ở hai đầu).
 *
 * `(?<!\d)` / `(?!\d)` thay vì `\b`: `\b` coi dấu `_` là ký tự từ và coi mọi
 * chữ cái là biên, nên `"abc123456789"` sẽ **không** khớp với `\b` mà vẫn là
 * một dãy 9 số cần nhắc.
 *
 * **Hệ quả có chủ ý: một dãy 13 chữ số trở lên KHÔNG cảnh báo.** `(?!\d)` chặn
 * đúng vậy. Căn cứ là chữ SPEC — d.312 viết **"dãy 9–12 số"**, một khoảng có
 * hai đầu, không "từ 9 số trở lên". Và nó đúng nghiệp vụ: 9 số là số tài khoản,
 * 12 số là CCCD, còn một dãy 13+ số thường là mốc thời gian epoch hoặc một mã
 * máy — hai thứ có mặt khắp Baton (`luc`, `tao_luc`), nên cảnh báo chúng là dạy
 * chủ bỏ qua cảnh báo. Có ca test riêng cho cả 8, 9, 12 và 13 chữ số.
 */
const MAU_DAY_SO = /(?<!\d)\d{9,12}(?!\d)/;

/**
 * Cụm "lương" — **có dấu lẫn không dấu**, không phân biệt hoa/thường.
 *
 * Giới hạn khai rõ: bộ chữ nhận được là `lương`, `Lương`, `LƯƠNG`, `luong`,
 * `Luong`, `LUONG` và các tổ hợp hoa/thường khác, kể cả khi `ươ` được gõ ở dạng
 * **tổ hợp** (`u + ◌̛`, NFD) — chuỗi được `normalize('NFC')` trước khi so.
 *
 * **Không** bắt "lượng" (khác nghĩa hoàn toàn: khối lượng, số lượng) — đó là
 * một chữ khác, và cảnh báo nó sẽ nổ ở gần như mọi dòng Nhật ký kỹ thuật.
 */
const MAU_LUONG = /l[uư][oơ]ng/;

/** Một cảnh báo của d.312. Mã máy để UI và CLI không phải so chuỗi tiếng Việt. */
export interface CanhBaoDuLieu {
  ma: 'day_so' | 'luong';
  message: string;
}

/**
 * **Cảnh báo dữ liệu nhân sự** — d.312. Không bao giờ ném, không bao giờ chặn.
 *
 * Trả danh sách rỗng khi không có gì đáng nhắc.
 */
export function canhBaoDuLieuNhanSu(quyet_dinh: string): CanhBaoDuLieu[] {
  const ra: CanhBaoDuLieu[] = [];
  const chuan = quyet_dinh.normalize('NFC').toLowerCase();

  if (MAU_DAY_SO.test(quyet_dinh)) {
    ra.push({
      ma: 'day_so',
      message: `Có một dãy ${String(SO_CHU_SO_TOI_THIEU_CANH_BAO)}–${String(
        SO_CHU_SO_TOI_DA_CANH_BAO,
      )} chữ số, trông giống số CCCD hoặc số tài khoản. Nhật ký không nên chứa dữ liệu nhân sự (SPEC mục 10). Dòng vẫn được ghi.`,
    });
  }
  if (MAU_LUONG.test(chuan)) {
    ra.push({
      ma: 'luong',
      message:
        'Có cụm "lương". Nhật ký không nên chứa dữ liệu nhân sự (SPEC mục 10). Dòng vẫn được ghi.',
    });
  }
  return ra;
}

/* ------------------------------------------------------------------ *
 * 3. Tìm theo chữ — d.311
 * ------------------------------------------------------------------ */

/**
 * Khoá so của phép "tìm theo chữ" (d.311).
 *
 * Cắt khoảng trắng, rồi hạ **đúng 26 chữ ASCII** `A`–`Z`. Không
 * `toLocaleLowerCase('vi')`: hàm này phải là **bản sao đúng** của `lower()`
 * trong câu truy vấn của `doc-nhat-ky.ts`, và `lower()` của SQLite chỉ biết
 * ASCII. Hai bên lệch nhau thì một bên thành mã chết — đúng lỗi mà lượt 1 của
 * phần 4 đã mắc với `chuanHoaTieuDe` (xem `cau-hoi-spec.md` #70).
 *
 * Giới hạn kéo theo, khai rõ: tìm `"CHỌN"` **không** khớp `"chọn"`; tìm
 * `"CHON"` **có** khớp `"chon"`.
 */
export function chuanHoaTimChu(chu: string): string {
  return chu.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** Độ dài tối đa của chuỗi tìm — chặn một câu `LIKE` vô nghĩa dài vài KB. */
export const DAI_TOI_DA_TIM_CHU = 200;

/** Kiểm chuỗi tìm. Rỗng (hoặc không gửi) = **không lọc**, trả `null`. */
export function kiemTimChu(tim: unknown): string | null {
  if (tim === undefined || tim === null) return null;
  if (typeof tim !== 'string') {
    throw new BatonError('INVALID_INPUT', { message: 'Chuỗi tìm phải là chữ.' });
  }
  const t = chuanHoaTimChu(tim);
  if (t.length === 0) return null;
  if (t.length > DAI_TOI_DA_TIM_CHU) {
    throw new BatonError('INVALID_INPUT', {
      message: `Chuỗi tìm tối đa ${String(DAI_TOI_DA_TIM_CHU)} ký tự.`,
    });
  }
  return t;
}

/**
 * Thoát ba ký tự đặc biệt của `LIKE` trong SQLite (`%`, `_`, và chính ký tự
 * thoát). Không có nó thì chủ gõ `%` là quét toàn bộ, và gõ `_` là khớp bừa.
 * Câu truy vấn đi kèm phải khai `ESCAPE '\'`.
 */
export function thoatLike(chu: string): string {
  return chu.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* ------------------------------------------------------------------ *
 * 4. Gom theo ngày — d.311
 * ------------------------------------------------------------------ */

const MOT_PHUT_MS = 60_000;

/**
 * **Ngày địa phương** của một mốc, dạng `YYYY-MM-DD` — khoá gom của d.311
 * ("gom theo ngày").
 *
 * Là một **dẫn xuất**, không một cột trong DB: xem ghi chú của 0014. Múi giờ đi
 * qua đúng một hằng, `MUI_GIO_CHU_PHUT` của `can-chu.ts` (`cau-hoi-spec.md`
 * #68), nên khi chủ chốt "múi giờ là một cài đặt của workspace" thì chỉ một chỗ
 * phải đổi.
 *
 * Đọc bằng getter **UTC** sau khi cộng độ lệch: `Date` của Workers chạy ở UTC,
 * nên `getFullYear()` sẽ trả ngày UTC và một quyết định ghi lúc 23:30 giờ Việt
 * Nam sẽ bị gom vào ngày hôm trước.
 */
export function ngayDiaPhuong(moc: number, lech_phut = MUI_GIO_CHU_PHUT): string {
  const d = new Date(moc + lech_phut * MOT_PHUT_MS);
  const hai = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getUTCFullYear())}-${hai(d.getUTCMonth() + 1)}-${hai(d.getUTCDate())}`;
}

/* ------------------------------------------------------------------ *
 * 5. Câu của dòng Nhật ký **tự sinh từ Cần Chủ** — mục 8 d.279, 19.9
 * ------------------------------------------------------------------ */

/**
 * Ba câu dưới đây là **chữ của SPEC**, không chữ tự do, nên chúng sống ở đây —
 * một chỗ, có test — thay vì nằm rải trong handler của lượt sau.
 *
 * **Lượt này chỉ có hàm và test; đường xử lý Cần Chủ CHƯA gọi chúng** (đó là
 * lượt 2b của phần 4). Viết trước có chủ ý: lượt 2b chỉ phải nối, không phải
 * nghĩ lại cách viết câu, nên hai nửa của cùng một luật không có cơ hội lệch.
 *
 * Người của cả ba dòng là **chủ** (d.279: "người là chủ"), dự án **cùng dự án
 * với mục** — và mục Chung thì để **trống** (19.12 câu 4), căn cứ là **`T-số`**.
 */

/** `"T-x bỏ qua: <lý do>"` — 19.9 d.541 ("Bỏ qua: bắt buộc lý do"). */
export function cauNhatKyBoQua(ma: string, ly_do: string): string {
  return `${ma} bỏ qua: ${ly_do.trim()}`;
}

/** `"T-x mở lại"` — 19.9 d.542. */
export function cauNhatKyMoLai(ma: string): string {
  return `${ma} mở lại`;
}

/**
 * Dòng của mục **đã xử lý** — mục 8 d.279: "Tự ghi 1 dòng vào Nhật ký quyết
 * định (mục 10): người là chủ, cùng dự án, **nội dung là kết quả**, căn cứ là
 * `T-số`."
 *
 * "Nội dung **là kết quả**" đọc đúng chữ: nội dung dòng là chính câu kết quả chủ
 * đã ghi, không một câu bọc quanh nó. `ma` không vào nội dung vì SPEC đã đặt nó
 * ở **căn cứ** — để cả hai chỗ thì màn hình của mục 10 hiện `T-18` hai lần.
 *
 * Kết quả rỗng không tới được đây: 19.9 d.539 chốt rằng để trống thì Baton tự
 * điền ("đã chạy" / "đã xem" / "đã đọc"), nên hàm này **ném** — một dòng Nhật ký
 * rỗng là một dòng không sửa được và không xoá được (d.309).
 */
export function cauNhatKyKetQua(ket_qua: string): string {
  const t = ket_qua.trim();
  if (t.length < 1) {
    throw new BatonError('INVALID_INPUT', {
      message:
        'Kết quả của mục Cần Chủ phải có nội dung trước khi ghi vào Nhật ký (SPEC 19.9 đã có mặc định cho từng loại).',
    });
  }
  return t;
}
