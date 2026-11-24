/**
 * **Cổng vào Xong** — luật thuần. SPEC mục 7 d.213–217, 19.3, 19.10, 19.11.
 *
 * Module này **thuần**: vào là danh sách bằng chứng đã tra sẵn + hai cờ của hồ sơ
 * dự án; ra là `KetQuaCong`. Không I/O, không `Date.now()`, **không gọi mạng**.
 * Nhờ vậy từng gạch của d.213–217 có test riêng mà không phải dựng D1, và phần
 * tra dữ liệu (`api/src/cong-bang-chung.ts`) không chứa luật nào.
 *
 * Bốn luật dễ gộp nhầm, cố định ở đây:
 *
 *  1. **`pushed` không mở cổng, chỉ `merged`** (d.206, d.214). Nguyên tắc sản
 *     phẩm số 3: "Xong nghĩa là **đã merge** hoặc đã live".
 *  2. **Bằng chứng đã rút không được tính** (d.222), và `pending`/`failed` cũng
 *     không: cổng chỉ đọc kết luận đã có, không đoán trước kết quả xác minh.
 *  3. **Review phải gửi SAU bằng chứng commit/deploy cuối cùng** (19.3). Đây là
 *     một luật về **thứ tự thời gian**, không phải "có hay không có review".
 *  4. **Review KHÔNG ĐẠT không mở cổng** (19.11) — nhưng lượt review của nó vẫn
 *     tự `accepted`; hai chuyện khác nhau.
 */

import type { KetLuanReview, LoaiBangChung, XacMinhBangChung } from './ma-nhan.js';
import type { KetQuaCong } from './luat-trang-thai.js';
import type { NguoiGuiBangChung } from './bang-chung.js';

/** Một bằng chứng, rút gọn còn đúng những gì cổng cần đọc. */
export interface BangChungChoCong {
  loai: LoaiBangChung;
  /** Thời điểm gửi — 19.3 so thứ tự trên chính trường này. */
  gui_luc: number;
  xac_minh: Exclude<XacMinhBangChung, 'withdrawn'>;
  /** `null` = chưa rút. Đã rút thì **không được tính** (d.222). */
  rut_luc: number | null;
  /** Chỉ có nghĩa với `loai = 'review'` — d.208. */
  ket_luan?: KetLuanReview | null;
  /**
   * **Ai gửi** — d.208 ("do agent `reviewer` **khác** người làm gửi"), 19.3
   * d.496. Cổng cần trường này để kiểm **lại** danh tính người gửi review, xem
   * `BoiCanhCong.nguoi_lam`. Reviewer lượt 1 của phần 3 nêu đúng chỗ thiếu này:
   * không có nó thì cổng tin một dòng `evidence` mà không đọc được ai ký.
   */
  nguoi_gui?: NguoiGuiBangChung | null;
}

export interface BoiCanhCong {
  /**
   * Ticket "không code" — `project.khong_code = 1` (d.217) **HOẶC**
   * `ticket.khong_code = 1` (cờ mức ticket, T-31 câu 3.4 A, migration 0027). Đọc
   * **mỗi lần kiểm** (19.10).
   */
  khong_code: boolean;
  /** Cờ "bắt buộc review", **mặc định bật** — d.215. */
  bat_buoc_review: boolean;
  /**
   * Chủ đã xác nhận mục Cần Chủ loại Review **tự sinh** chưa — d.217.
   *
   * **Đã nối thật** từ phần 4 lượt 3b: câu hỏi "mục đó sinh lúc nào, do đường
   * nào" (`cau-hoi-spec.md` #59) được chủ chốt thành **19.12 câu 57** — sinh lúc
   * **kiểm cổng**, một mục mỗi ticket, dựng lại chỉ khi có bằng chứng `file`/`note`
   * mới hơn lần bỏ qua. Trường này nay đọc từ dòng `can_chu` mang mốc
   * `xac_nhan_ticket_id`: `true` **đúng khi** mục đó `resolved` **và** kết luận
   * review là `dat` (xem `api/src/muc-xac-nhan.ts` → `chuDaXacNhan`; "Cần sửa" là
   * chủ nói **chưa được**, nên nó không mở cổng — `cau-hoi-spec.md` #78).
   */
  chu_xac_nhan: boolean;
  /** Mọi bằng chứng của ticket, **kể cả đã rút** (cổng tự lọc). */
  bang_chung: readonly BangChungChoCong[];
  /**
   * **Người làm của ticket** — `agent_id` của người nhận **mọi** lượt `work`
   * trên ticket này (SPEC 19.3 d.496 định nghĩa "khác người làm" đúng như vậy).
   *
   * Cổng dùng nó để **không tính** một `review` ĐẠT do chính người làm gửi.
   *
   * Đây là **lớp thứ hai**: lớp thứ nhất là lệnh gửi bằng chứng, từ chối thẳng
   * bằng `REVIEWER_IS_WORKER` (d.496). Vẫn cần lớp này vì bảng `evidence` có
   * đường vào **không qua cửa ghi** — migration và nhập dữ liệu của mục 16 — và
   * vì danh tính người làm **đổi sau khi review đã gửi** được: một agent gửi
   * review lúc chưa có lượt nào của mình, rồi được giao lượt `work` trên đúng
   * ticket đó. Lúc đó lớp thứ nhất đã chạy xong và không bao giờ chạy lại, còn
   * cổng thì chạy **mỗi lần** ticket định vào Xong.
   *
   * Trường **bắt buộc**, không tuỳ chọn: để trống được thì một người gọi quên nó
   * sẽ âm thầm mất cả lớp bảo vệ, và không test nào đỏ.
   */
  nguoi_lam: readonly string[];
}

/* ------------------------------------------------------------------ *
 * Lý do từ chối — chữ agent đọc để biết phải làm gì tiếp
 * ------------------------------------------------------------------ *
 * Mỗi ca thiếu một thứ **khác nhau** thì phải có một câu khác nhau: một câu
 * chung cho mọi ca thì agent nhận "chưa đủ bằng chứng" rồi gửi lại đúng thứ nó
 * vừa gửi. Khai thành hằng số để test assert được **chính chữ đó**, chứ không
 * chỉ assert `du: false` — một luật chỉ khoá bằng cờ boolean thì đảo hai nhánh
 * `if` lại vẫn xanh.
 */

export const LY_DO_THIEU_COMMIT_HOAC_DEPLOY =
  'Chưa có bằng chứng commit đã merged hoặc deploy đạt (SPEC mục 7). Commit mới pushed chưa mở cổng.';

export const LY_DO_THIEU_REVIEW_DAT =
  'Dự án bắt buộc review: cần thêm 1 bằng chứng review ĐẠT (SPEC mục 7, 19.11).';

export const LY_DO_REVIEW_HET_HIEU_LUC =
  'Review đã hết hiệu lực vì có bằng chứng commit hoặc deploy mới hơn. Cần review lại (SPEC 19.3).';

export const LY_DO_KHONG_CODE_THIEU_FILE_NOTE =
  'Ticket không code (cờ dự án hoặc cờ ticket): cần 1 bằng chứng bao_cao do người khác người làm ký, ' +
  'hoặc ít nhất 1 bằng chứng file/note cộng chủ xác nhận (SPEC mục 7, T-31).';

/**
 * Ticket không code có `bao_cao` còn hiệu lực, nhưng **mọi** báo cáo đó đều do
 * chính người làm ký — cùng lý lẽ `LY_DO_REVIEW_CUA_NGUOI_LAM` (lớp thứ hai).
 */
export const LY_DO_BAO_CAO_CUA_NGUOI_LAM =
  'Báo cáo duy nhất do chính người làm của ticket ký, nên không được tính. Cần reviewer, manager (kèm báo cáo reviewer), coordinator khác người làm, hoặc chủ ký (T-31).';

export const LY_DO_REVIEW_CUA_NGUOI_LAM =
  'Review ĐẠT duy nhất do chính người làm của ticket gửi, nên không được tính. Cần một agent reviewer khác người làm (SPEC mục 7 d.208, 19.3).';

export const LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN =
  'Ticket không code: đang chờ chủ xác nhận (mục Cần Chủ loại Review tự sinh — SPEC mục 7, 19.10), ' +
  'hoặc gửi 1 bằng chứng bao_cao do người khác người làm ký (T-31).';

/* ------------------------------------------------------------------ *
 * Luật
 * ------------------------------------------------------------------ */

const DU: KetQuaCong = { du: true, ly_do: '' };

function tuChoi(ly_do: string): KetQuaCong {
  return { du: false, ly_do };
}

/** Bằng chứng còn hiệu lực = **chưa rút** (SPEC d.222). */
function conHieuLuc(b: BangChungChoCong): boolean {
  return b.rut_luc === null;
}

/**
 * Bằng chứng này **tự mở cổng** chưa — d.214.
 *   * `commit` **chỉ khi `merged`**; `pushed` thì không (d.206).
 *   * `deploy` khi `passed` (d.207: mã 2xx hoặc 3xx là đạt).
 * `pending` và `failed` đều không: cổng đọc kết luận đã có, không đoán.
 */
export function moDuocCong(b: BangChungChoCong): boolean {
  if (!conHieuLuc(b)) return false;
  if (b.loai === 'commit') return b.xac_minh === 'merged';
  if (b.loai === 'deploy') return b.xac_minh === 'passed';
  return false;
}

/**
 * **Mốc "bằng chứng `commit` hoặc `deploy` cuối cùng"** — 19.3 d.494.
 *
 * Tính trên **MỌI** bằng chứng commit/deploy của ticket, **kể cả đã rút và kể cả
 * `failed`** — không chỉ các bằng chứng còn hiệu lực.
 *
 * SPEC không nói rõ tập nào (`cau-hoi-spec.md` #56); đây là hướng **an toàn hơn**,
 * tức hướng làm cổng **đóng nhiều hơn**. Lý do: mốc này trả lời câu "mã đã đổi sau
 * lần review chưa". Một bằng chứng commit được gửi rồi rút vẫn là một lần có người
 * nói "mã vừa đổi"; bỏ nó ra khỏi mốc thì rút lại một bằng chứng commit trở thành
 * cách **làm sống lại** một review đã hết hiệu lực — tức một đường vòng qua 19.3
 * bằng đúng cái lệnh SPEC dựng ra để sửa nhầm lẫn.
 *
 * Mốc tính trên `gui_luc`, **không** trên trạng thái xác minh: "commit mới" của
 * d.494 là một lần **gửi**, và một commit còn `pushed` vẫn là mã đã đổi. Hệ quả có
 * chủ ý: một commit chuyển `pushed` → `merged` **không** làm mốc nhích, vì nó không
 * phải một commit mới.
 *
 * `Number.NEGATIVE_INFINITY` khi ticket chưa có commit/deploy nào, nên mọi review
 * đều "gửi sau mốc".
 *
 * Dùng ở **hai** chỗ — cổng (`congXong`) và cờ "cần review lại"
 * (`tinhCanReviewLai`). Hai bản sao của cùng định nghĩa này sẽ lệch nhau im lặng:
 * cổng nói review hết hiệu lực mà cờ không bật, hoặc ngược lại.
 */
export function mocCodeCuoi(bang_chung: readonly BangChungChoCong[]): number {
  return bang_chung
    .filter((b) => b.loai === 'commit' || b.loai === 'deploy')
    .reduce((max, b) => Math.max(max, b.gui_luc), Number.NEGATIVE_INFINITY);
}

/**
 * Các bằng chứng `review` **ĐẠT và được tính**: chưa rút, `ket_luan = 'pass'`, và
 * **khác người làm** — d.208, 19.3 d.496. Xem `BoiCanhCong.nguoi_lam` về vì sao
 * luật này được kiểm lại ở tầng luật dù lệnh gửi đã kiểm.
 *
 * Bằng chứng **không mang `nguoi_gui`** thì vẫn được tính: trường đó tuỳ chọn
 * trong `BangChungChoCong` (chủ gửi review thì `nguoi_gui.loai = 'owner'`, và chủ
 * không bao giờ là người nhận một lượt giao). Chỉ loại ra đúng ca **đọc được** là
 * một agent nằm trong `nguoi_lam`.
 *
 * **Chưa xét thứ tự thời gian** — đó là việc của `mocCodeCuoi` ở người gọi.
 */
export function reviewDatDuocTinh(
  bang_chung: readonly BangChungChoCong[],
  nguoi_lam: readonly string[],
): BangChungChoCong[] {
  return bang_chung.filter(
    (b) =>
      b.loai === 'review' && conHieuLuc(b) && b.ket_luan === 'pass' && !laCuaNguoiLam(b, nguoi_lam),
  );
}

/**
 * Bằng chứng này **đọc được** là do một agent trong `nguoi_lam` gửi. Không mang
 * `nguoi_gui`, hoặc người gửi là chủ ⇒ `false` (xem `reviewDatDuocTinh`).
 */
function laCuaNguoiLam(b: BangChungChoCong, nguoi_lam: readonly string[]): boolean {
  const ng = b.nguoi_gui;
  if (ng === undefined || ng === null || ng.loai !== 'agent') return false;
  const id = ng.agent_id;
  return id !== undefined && id !== null && nguoi_lam.includes(id);
}

/**
 * Các `bao_cao` **được tính** cho ticket không code (T-31 câu 3.4 A, #161): chưa
 * rút và **khác người làm** — lớp thứ hai, cùng lý lẽ `reviewDatDuocTinh` (lớp thứ
 * nhất là lệnh gửi: quyền ký giống `review`, `REVIEWER_IS_WORKER`).
 *
 * `loai` ở đây là loại **đã map** (`bao_cao`), không phải mã mượn `note`/`file`
 * trong DB — nên một báo cáo **không** bao giờ bị đếm như `file`/`note` của nhánh
 * cũ, và ngược lại.
 */
export function baoCaoDuocTinh(
  bang_chung: readonly BangChungChoCong[],
  nguoi_lam: readonly string[],
): BangChungChoCong[] {
  return bang_chung.filter(
    (b) => b.loai === 'bao_cao' && conHieuLuc(b) && !laCuaNguoiLam(b, nguoi_lam),
  );
}

/**
 * **Cổng vào Xong** — SPEC d.213–217.
 *
 * Ticket điều phối **không đi qua đây** (19.4): `boiCanhLuatCua` trong
 * `api/src/lenh-trang-thai.ts` không gọi cổng cho nó. Chủ **ép Xong** cũng không
 * đi qua đây (d.216) — đó là một nhánh riêng của `apDungLuat`.
 */
export function congXong(bc: BoiCanhCong): KetQuaCong {
  /*
   * **Dự án không code** — d.217: "cổng **đổi thành** cần 1 `file` hoặc `note`
   * cộng **chủ xác nhận**". Chữ "đổi thành" nên nhánh này **thay** cả hai gạch
   * trên: không đòi commit/deploy, và không đòi review.
   *
   * 19.10 nói cổng áp theo cờ "có code hay không" **tại thời điểm kiểm** — nên
   * cờ vào đây bằng tham số và được đọc lại mỗi lần gọi, không nhớ lại cờ lúc
   * tạo ticket.
   */
  if (bc.khong_code) {
    /*
     * **Đường thứ hai (T-31 câu 3.4 A, #161): một `bao_cao` hợp lệ là đủ** — không
     * cần chủ xác nhận. "Hợp lệ" = chưa rút + người ký khác người làm
     * (`baoCaoDuocTinh`). Nhánh này CHỈ nằm trong `khong_code`: ticket có code
     * thì `bao_cao` không mở gì (nó không phải commit/deploy, không phải review).
     */
    if (baoCaoDuocTinh(bc.bang_chung, bc.nguoi_lam).length > 0) return DU;

    const co_file_hoac_note = bc.bang_chung.some(
      (b) => conHieuLuc(b) && (b.loai === 'file' || b.loai === 'note'),
    );
    if (!co_file_hoac_note) {
      const co_bao_cao = bc.bang_chung.some((b) => b.loai === 'bao_cao' && conHieuLuc(b));
      return tuChoi(co_bao_cao ? LY_DO_BAO_CAO_CUA_NGUOI_LAM : LY_DO_KHONG_CODE_THIEU_FILE_NOTE);
    }
    if (!bc.chu_xac_nhan) return tuChoi(LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN);
    return DU;
  }

  // Gạch 1 (d.214): **ít nhất 1** commit `merged` **hoặc** deploy đạt.
  if (!bc.bang_chung.some(moDuocCong)) return tuChoi(LY_DO_THIEU_COMMIT_HOAC_DEPLOY);

  // Gạch 2 (d.215 + 19.3 + 19.11): review ĐẠT gửi **sau** commit/deploy cuối cùng.
  if (!bc.bat_buoc_review) return DU;

  // "Bằng chứng `commit` hoặc `deploy` **cuối cùng**" — xem `mocCodeCuoi`.
  const moc_code = mocCodeCuoi(bc.bang_chung);

  const review_pass = bc.bang_chung.filter(
    (b) => b.loai === 'review' && conHieuLuc(b) && b.ket_luan === 'pass',
  );

  // **"Khác người làm"** — d.208, 19.3 d.496. Xem `reviewDatDuocTinh`.
  const review_dat = reviewDatDuocTinh(bc.bang_chung, bc.nguoi_lam);

  // 19.11: review KHÔNG ĐẠT **không** mở cổng — nó bị lọc ngay ở trên, nên ca
  // "chỉ có review `fail`" rơi đúng vào câu "thiếu review ĐẠT". Còn ca "có
  // review ĐẠT nhưng của chính người làm" phải có câu **riêng**: hai ca này đòi
  // agent làm hai việc khác nhau.
  if (review_dat.length === 0) {
    return tuChoi(
      review_pass.length > 0 ? LY_DO_REVIEW_CUA_NGUOI_LAM : LY_DO_THIEU_REVIEW_DAT,
    );
  }

  // "Gửi **sau**" là so chặt: hai bằng chứng cùng một millisecond thì không ai
  // nói được cái nào trước, nên cổng đóng — lại là hướng an toàn hơn.
  if (!review_dat.some((b) => b.gui_luc > moc_code)) return tuChoi(LY_DO_REVIEW_HET_HIEU_LUC);

  return DU;
}
