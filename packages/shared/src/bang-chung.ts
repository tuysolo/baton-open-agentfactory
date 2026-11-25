/**
 * **Bằng chứng** — kiểu dữ liệu và kiểm hợp lệ. SPEC mục 7 (bảng "Loại bằng
 * chứng" d.204–211, "Xác minh" d.219–223), 19.3, 19.7, 19.11, 19.12 câu 5.
 *
 * Module này **thuần**: không I/O, không `Date.now()`, không chạm DB, **không gọi
 * mạng**. Việc gọi GitHub API (d.206) và gọi URL deploy (d.207) là lượt sau; ở
 * đây chỉ có luật về **hình dạng** dữ liệu gửi lên — mà phần lớn luật d.207 lại
 * chính là luật hình dạng, vì nó là một luật **bảo mật**:
 *
 *   "Chỉ nhận `https://`, **không nhận IP nội bộ hay localhost**."
 *
 * Vì sao chặt: cái gọi URL đó là **server Baton**. Một URL `http://169.254.169.254/…`
 * hay `https://10.0.0.5/…` biến lệnh "gửi bằng chứng deploy" thành "bắt Baton gọi
 * vào mạng nội bộ của chính nó rồi kể lại kết quả" (SSRF) — và `169.254.0.0/16`
 * là đúng dải chứa máy chủ metadata của nhà cung cấp cloud, tức chỗ cấp
 * credential. Nên luật này phải chặn ở **nơi duy nhất** mọi đường vào đều đi qua,
 * và phải có test cho **từng dải** một ca.
 */

import { BatonError } from './loi.js';
import {
  laMaHopLe,
  type KetLuanReview,
  type LoaiBangChung,
  type XacMinhBangChung,
} from './ma-nhan.js';

/* ------------------------------------------------------------------ *
 * Kiểu dữ liệu: union có nhãn theo `loai` — SPEC d.204–211
 * ------------------------------------------------------------------ *
 * Cùng nếp với `SuKienTrangThai` của `luat-trang-thai.ts`: nhãn là một trường
 * chuỗi (`loai`), nên TypeScript thu hẹp được kiểu và không có dòng nào mang
 * trường của loại khác.
 */

/** Ai gửi (hoặc ai rút) một bằng chứng — SPEC d.208 ("khác người làm"), d.222. */
export interface NguoiGuiBangChung {
  loai: 'owner' | 'agent';
  /** Bắt buộc khi `loai = 'agent'`, và chỉ khi đó. */
  agent_id?: string | null;
}

/** `commit` — hash (≥7 ký tự) + repo (lấy từ hồ sơ dự án nếu không ghi). d.206. */
export interface BangChungCommit {
  loai: 'commit';
  commit_hash: string;
  repo: string;
  /**
   * **Người gửi khai: commit này là tổ tiên của nhánh mặc định NGAY TRONG REPO
   * CỤC BỘ** (`git merge-base --is-ancestor`).
   *
   * Vì sao trường này tồn tại: d.206 kiểm "qua **GitHub API**", nên một repo
   * ff-merge vào nhánh mặc định **trên máy** và chưa push thì GitHub không biết
   * commit đó — kết luận mãi là "không tìm thấy", cổng d.214 **không bao giờ**
   * mở. Đó là chỗ chặn thật ngày 13/10.
   *
   * Nó là **lời khai**, không một kết luận: GitHub vẫn là nguồn ưu tiên, và
   * server chỉ dựa vào lời khai này khi GitHub **không biết** commit đó. Khi đó
   * kết luận được ghi kèm nguồn `local`, và nguồn ấy **hiện ra** ở mọi đường đọc
   * (xem migration 0022).
   */
  merged_cuc_bo: boolean;
}

/** `deploy` — URL + **mã phiên bản tuỳ chọn**. d.207, 19.12 câu 5. */
export interface BangChungDeploy {
  loai: 'deploy';
  url: string;
  /**
   * Mã phiên bản (vd `e91efbeb`). **Chỉ lưu và hiện, server KHÔNG kiểm** — chốt
   * của chủ, SPEC 19.12 câu 5. Không có hàm kiểm nào cho trường này là **chủ ý**.
   */
  ma_phien_ban: string | null;
}

/** `review` — kết luận ĐẠT / KHÔNG ĐẠT + ghi chú. d.208, 19.11. */
export interface BangChungReview {
  loai: 'review';
  ket_luan: KetLuanReview;
  ghi_chu: string | null;
  /**
   * **Đường dẫn báo cáo của reviewer độc lập** — bắt buộc khi người gửi là một
   * agent `manager`, tuỳ chọn với mọi người gửi khác.
   *
   * Vì sao có: reviewer thật của hệ này là sub-agent do Manager gọi (`claude -p`)
   * và **không có token Baton**, nên không ai gửi được `review` ĐẠT và điều kiện
   * phụ của cổng (d.215) không bao giờ mở. Cho `manager` ghi thay, nhưng **chỉ
   * khi trỏ được tới báo cáo của reviewer** — không thì nó chỉ còn là lời tự
   * khai của người giao việc.
   *
   * Luật "bắt buộc khi là `manager`" cần biết **vai trò người gửi**, nên nó nằm ở
   * `handlerGuiBangChung`, không ở module thuần này.
   */
  duong_dan_bao_cao: string | null;
}

/**
 * **Nguồn của một kết luận `merged`** — xem migration 0022 khối A.
 *   * `github` — tra được qua GitHub API (d.206, nguồn ưu tiên).
 *   * `local`  — GitHub không biết commit đó; dựa vào lời khai `merged_cuc_bo`.
 */
export const NHAN_NGUON_XAC_MINH = {
  github: 'kiểm qua GitHub',
  local: 'kiểm cục bộ (repo chưa push)',
} as const;
export type NguonXacMinhMerged = keyof typeof NHAN_NGUON_XAC_MINH;

/**
 * **Nguồn của một bằng chứng `review`** — xem migration 0022 khối B. Phải hiện ra
 * ở mọi đường đọc: một review do `manager` ghi thay **không** được đọc lẫn với
 * review do chính agent `reviewer` gửi.
 */
export const NHAN_NGUON_REVIEW = {
  reviewer: 'agent reviewer gửi',
  manager: 'manager ghi, kèm báo cáo reviewer',
  coordinator: 'coordinator ký (cấp trên giám sát)',
} as const;
export type NguonReview = keyof typeof NHAN_NGUON_REVIEW;

export function laNguonXacMinhMerged(v: unknown): v is NguonXacMinhMerged {
  return v === 'github' || v === 'local';
}

export function laNguonReview(v: unknown): v is NguonReview {
  return v === 'reviewer' || v === 'manager' || v === 'coordinator';
}

/** `test` — tóm tắt (vd "42 passed, 0 failed") + cờ đạt. d.209. */
export interface BangChungTest {
  loai: 'test';
  tom_tat: string;
  dat: boolean;
}

/** `file` — đường dẫn hoặc link (vd link `file://` trên máy chủ). d.210. */
export interface BangChungFile {
  loai: 'file';
  duong_dan: string;
}

/** `note` — chữ. d.211. */
export interface BangChungNote {
  loai: 'note';
  noi_dung: string;
}

/**
 * `bao_cao` — **Báo cáo** để đóng ticket **không code** (T-31 câu 3.4 A,
 * `spec-questions.md` #161). Không có trong bảng d.204–211.
 *
 * Giá trị: đường dẫn báo cáo **và/hoặc** nội dung báo cáo (ít nhất một). Người ký
 * = người gửi, và **quyền ký giống hệt `review`** (d.210 + bảng quyền mục 3):
 * agent `reviewer` khác người làm, agent `manager` **kèm đường dẫn báo cáo của
 * reviewer độc lập** (`duong_dan_bao_cao`), agent `coordinator`, hoặc chủ. Luật
 * vai trò cần biết người gửi nên nằm ở `handlerGuiBangChung`, không ở đây.
 */
export interface BangChungBaoCao {
  loai: 'bao_cao';
  duong_dan: string | null;
  noi_dung: string | null;
  /** Đường dẫn báo cáo của reviewer độc lập — bắt buộc khi người gửi là `manager`. */
  duong_dan_bao_cao: string | null;
}

/** Phần **nội dung** của một bằng chứng: sáu dòng bảng d.204–211 + `bao_cao` (#161). */
export type NoiDungBangChung =
  | BangChungCommit
  | BangChungDeploy
  | BangChungReview
  | BangChungTest
  | BangChungFile
  | BangChungNote
  | BangChungBaoCao;

/**
 * **Nguồn ký của một `bao_cao`** — cột `evidence.bao_cao_nguon` (migration 0027).
 * Khác `NguonReview` đúng một mã: `owner`. Cột này **cũng là dấu "đây là báo cáo"**
 * (NULL = không phải báo cáo), nên báo cáo do chủ gửi cũng phải có giá trị.
 */
export const NHAN_NGUON_BAO_CAO = {
  reviewer: 'agent reviewer ký',
  manager: 'manager ký, kèm báo cáo reviewer',
  coordinator: 'coordinator ký (cấp trên giám sát)',
  owner: 'chủ ký',
} as const;
export type NguonBaoCao = keyof typeof NHAN_NGUON_BAO_CAO;

export function laNguonBaoCao(v: unknown): v is NguonBaoCao {
  return v === 'reviewer' || v === 'manager' || v === 'coordinator' || v === 'owner';
}

/** Sáu mã mà CHECK cấp cột `evidence.loai` của 0009 nhận. */
export type LoaiLuuTrongDb = Exclude<LoaiBangChung, 'bao_cao'>;

/**
 * **Mã `loai` ghi vào DB** — chiều ghi của cách "mượn mã" ở migration 0027.
 *
 * `evidence.loai` có CHECK cấp cột không sửa được nếu không dựng lại bảng, nên một
 * `bao_cao` mượn `note` khi có nội dung (CHECK `note ⇒ noi_dung NOT NULL`), hoặc
 * `file` khi chỉ có đường dẫn (CHECK `file ⇒ duong_dan NOT NULL`); dấu "đây là báo
 * cáo" là cột `bao_cao_nguon`. Chiều **đọc** (`bao_cao_nguon IS NOT NULL` ⇒
 * `bao_cao`) nằm ở `api/src/loai-bang-chung.ts`.
 */
export function loaiLuuTrongDb(nd: NoiDungBangChung): LoaiLuuTrongDb {
  if (nd.loai !== 'bao_cao') return nd.loai;
  return nd.noi_dung !== null ? 'note' : 'file';
}

/**
 * Một bằng chứng như hệ thống lưu — khớp bảng `evidence` của migration 0009.
 *
 * `xac_minh` **không bao giờ** là `withdrawn`: việc rút lại nằm ở `rut_luc`
 * (xem `xacMinhHienThi`).
 */
export interface BangChung {
  id: string;
  ticket_id: string;
  nguoi_gui: NguoiGuiBangChung;
  /** Thời điểm gửi — **bắt buộc**, vì 19.3 là một luật về thứ tự thời gian. */
  gui_luc: number;
  xac_minh: Exclude<XacMinhBangChung, 'withdrawn'>;
  /** Lúc rút lại; `null` = chưa rút. Bằng chứng đã rút **không được tính** (d.222). */
  rut_luc: number | null;
  noi_dung: NoiDungBangChung;
}

/* ------------------------------------------------------------------ *
 * Trạng thái hiển thị — SPEC 0.1 (`withdrawn` Đã rút)
 * ------------------------------------------------------------------ */

/**
 * Mã xác minh để **hiển thị**: `withdrawn` nếu đã rút, còn lại là `xac_minh` đã
 * lưu. Một hàm, một nguồn sự thật — nên UI không tự suy ra mỗi chỗ một kiểu.
 */
export function xacMinhHienThi(bc: Pick<BangChung, 'xac_minh' | 'rut_luc'>): XacMinhBangChung {
  return bc.rut_luc === null ? bc.xac_minh : 'withdrawn';
}

/**
 * Bằng chứng này **còn hiệu lực** để cổng tính hay không — SPEC d.222 ("bằng
 * chứng đã rút **không được tính**").
 */
export function conHieuLuc(bc: Pick<BangChung, 'rut_luc'>): boolean {
  return bc.rut_luc === null;
}

/* ------------------------------------------------------------------ *
 * Hằng số của SPEC
 * ------------------------------------------------------------------ */

/** Hash commit: **≥ 7 ký tự** — SPEC d.206. */
export const DAI_HASH_COMMIT_TOI_THIEU = 7;
/**
 * **Hash rút gọn của "Vừa xong"** — SPEC mục 11 d.320: "bằng chứng rút gọn
 * (**hash 7 ký tự**, URL, mã phiên bản)".
 *
 * Cùng con số 7 với `DAI_HASH_COMMIT_TOI_THIEU`, và khai bằng **chính** hằng đó
 * chứ không gõ lại `7`: hai dòng của SPEC nói về cùng một độ dài (d.206 nhận
 * "≥7 ký tự", d.320 hiện "7 ký tự"), nên nếu phiên spec đổi một dòng thì chỗ
 * phải sửa là một chỗ.
 */
export const DAI_HASH_RUT_GON = DAI_HASH_COMMIT_TOI_THIEU;

/**
 * Hash commit cắt còn `DAI_HASH_RUT_GON` ký tự — d.320.
 *
 * Cắt ở **server**, không để giao diện cắt: cùng lý lẽ với `tieuDeNgan` của mục 8
 * — hai bản cắt là hai luật, và chúng lệch nhau ở đúng chỗ khó thấy nhất. Hash
 * ngắn hơn 7 ký tự thì trả nguyên văn (không có chuyện đệm thêm): đường gửi đã
 * chặn hash ngắn (`kiemBangChungCommit`), nên ca đó chỉ tới từ dữ liệu nhập của
 * mục 16, và nói thật một hash ngắn vẫn tốt hơn bịa ra ký tự.
 */
export function hashRutGon(hash: string | null | undefined): string | null {
  if (typeof hash !== 'string' || hash.trim() === '') return null;
  return hash.trim().slice(0, DAI_HASH_RUT_GON);
}

/** Hash commit đầy đủ của Git là 40 ký tự hex (SHA-1); SHA-256 là 64. */
export const DAI_HASH_COMMIT_TOI_DA = 64;
/** Hình dạng hash: **chỉ chữ hex**. */
export const MAU_HASH_COMMIT = /^[0-9a-fA-F]+$/;

/**
 * **Trần 10 giây** của một lần xác minh — SPEC d.219 ("chạy ngay khi gửi, **trả
 * kết quả trong tối đa 10 giây**"). Đây là lời hứa với agent: `baton evidence`
 * (mục 13 d.364) "chờ xác minh tối đa 10 giây rồi in kết quả".
 */
export const TRAN_XAC_MINH_MS = 10_000;

/**
 * Hạn **cứng** cho phần gọi mạng của một lần xác minh — **dưới** trần 10 giây,
 * không bằng.
 *
 * Phải chừa lại biên: sau lần gọi mạng còn một lượt ghi nữa vào cửa ghi (ghi kết
 * luận vào `evidence`), và lượt ghi đó có thể phải xếp hàng sau một lệnh khác.
 * Đặt hạn mạng đúng 10 giây là hứa 10 giây rồi trả lời ở giây thứ 11.
 */
export const HAN_GOI_MANG_MS = 7_000;

/** Thử lại xác minh sau **5 phút**, **tối đa 3 lần** — SPEC d.220. */
export const CHO_THU_LAI_MS = 5 * 60 * 1000;
export const SO_LAN_THU_TOI_DA = 3;
/** Theo dõi commit `pushed` trong **7 ngày** — SPEC 19.7. */
export const THEO_DOI_COMMIT_MS = 7 * 24 * 60 * 60 * 1000;
/** Kiểm lại commit `pushed` **mỗi 10 phút** — SPEC d.221. */
export const CHU_KY_KIEM_LAI_COMMIT_MS = 10 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Thử lại xác minh — SPEC d.220 (luật thuần)
 * ------------------------------------------------------------------ */

/**
 * Một lần thử lại của Cron đã xảy ra, và nó **vẫn chưa kết luận được** (lỗi mạng
 * hoặc token GitHub). d.220: "tự thử lại sau 5 phút, **tối đa 3 lần**, rồi thành
 * `failed` **với lý do**."
 *
 * Luật thuần, nhận `bay_gio` qua tham số: trần 3 lần là một luật của SPEC, nên nó
 * phải test được mà không dựng DB, không chờ 5 phút thật. Cửa ghi chỉ dịch kết quả
 * này thành một câu `UPDATE`.
 *
 * `so_lan_thu_truoc` là số **lần thử lại** đã ghi trước lần này. Lần chạy ngay khi
 * gửi (d.219) **không** tính là một lần thử lại — xem `decisions.md` — nên một
 * bằng chứng đi tối đa: 1 lần lúc gửi + 3 lần Cron = 4 lần gọi mạng.
 */
export interface QuyetDinhThuLai {
  /** `so_lan_thu` mới, kẹp trong `0..SO_LAN_THU_TOI_DA` (CHECK của 0009). */
  so_lan_thu: number;
  /** Còn lượt thử → ở lại `pending`. Hết lượt → `failed` (d.220). */
  con_luot: boolean;
  /** Mốc thử lại mới; `null` khi đã hết lượt (dòng rời `ix_evidence_thu_lai`). */
  thu_lai_luc: number | null;
  /** **Luôn khác rỗng** — d.220 đòi `failed` phải *có lý do*. */
  ly_do: string;
}

export function quyetDinhThuLai(
  so_lan_thu_truoc: number,
  ly_do_lan_nay: string | null,
  bay_gio: number,
): QuyetDinhThuLai {
  const so_lan_thu = Math.min(Math.max(0, so_lan_thu_truoc) + 1, SO_LAN_THU_TOI_DA);
  const con_luot = so_lan_thu < SO_LAN_THU_TOI_DA;

  /*
   * Lý do gốc có thể rỗng (một nguồn trả `{ loi: '' }`), nhưng cột `ly_do` của một
   * dòng `failed` **không được** rỗng: d.220 nói "thành `failed` **với lý do**", và
   * một chuỗi rỗng là đúng cái làm chủ mở trang ticket ra rồi không biết vì sao
   * bằng chứng trượt. Nên luôn có một câu nền.
   */
  const goc =
    ly_do_lan_nay !== null && ly_do_lan_nay.trim().length > 0
      ? ly_do_lan_nay.trim()
      : 'không rõ nguyên nhân (nguồn xác minh không trả lý do)';

  const ly_do = con_luot
    ? `Chưa xác minh được, lần thử lại ${String(so_lan_thu)}/${String(SO_LAN_THU_TOI_DA)}: ${goc}. Sẽ thử lại sau 5 phút (SPEC mục 7 d.220).`
    : `Trượt sau ${String(SO_LAN_THU_TOI_DA)} lần thử lại mà vẫn không xác minh được: ${goc} (SPEC mục 7 d.220).`;

  return {
    so_lan_thu,
    con_luot,
    thu_lai_luc: con_luot ? bay_gio + CHO_THU_LAI_MS : null,
    ly_do,
  };
}

/* ------------------------------------------------------------------ *
 * "Chưa merge sau 7 ngày" — SPEC 19.7 (luật thuần)
 * ------------------------------------------------------------------ */

/**
 * Nhãn của 19.7, **đúng chữ SPEC**. Khai thành hằng để test assert được chính chữ
 * đó, và để UI (phần 6) không tự gõ lại một biến thể.
 */
export const NHAN_CHUA_MERGE_7_NGAY = 'chưa merge sau 7 ngày';

/**
 * Có cần bắn tin "chưa merge sau 7 ngày" cho dòng này không — 19.7 "Telegram báo
 * **1 lần**".
 *
 * **Mốc, không cờ** — cùng nếp `canhBaoDung` của `phien.ts` (SPEC mục 6 d.196,
 * `spec-questions.md` #46). Mốc là `theo_doi_den_luc` của **cửa sổ theo dõi vừa hết
 * hạn**, tức "lần chuyển sang" của luật này. Lý do đầy đủ ở đầu migration 0010.
 */
export interface QuyetDinhBaoChuaMerge {
  can_ban: boolean;
  /** Giá trị cần ghi vào `chua_merge_bao_moc` sau khi bắn; `null` = không ghi. */
  moc_moi: number | null;
}

export function quyetDinhBaoChuaMerge(dong: {
  /** Mốc 7 ngày của cửa sổ đang xét. `null` = không theo dõi, không có gì để báo. */
  theo_doi_den_luc: number | null;
  /** Mốc mà tin gần nhất đã bắn cho. */
  chua_merge_bao_moc: number | null;
}): QuyetDinhBaoChuaMerge {
  const moc = dong.theo_doi_den_luc;
  if (moc === null) return { can_ban: false, moc_moi: null };
  if (dong.chua_merge_bao_moc === moc) return { can_ban: false, moc_moi: null };
  return { can_ban: true, moc_moi: moc };
}

/* ------------------------------------------------------------------ *
 * `commit` — SPEC d.206
 * ------------------------------------------------------------------ */

/** Hash commit có đúng hình dạng không: hex, 7–64 ký tự. */
export function laHashCommitHopLe(hash: unknown): hash is string {
  if (typeof hash !== 'string') return false;
  const h = hash.trim();
  return (
    h.length >= DAI_HASH_COMMIT_TOI_THIEU &&
    h.length <= DAI_HASH_COMMIT_TOI_DA &&
    MAU_HASH_COMMIT.test(h)
  );
}

/**
 * Kiểm một bằng chứng `commit`.
 *
 * `repo_mac_dinh` là repo của **hồ sơ dự án** (SPEC mục 9) — d.206: repo "lấy từ
 * hồ sơ dự án **nếu không ghi**". Bảng hồ sơ dự án là phần 4, nên repo mặc định
 * vào đây bằng **tham số**, không tra DB ở module thuần này. Cả hai đều rỗng →
 * `INVALID_INPUT`: một bằng chứng commit không có repo là một bằng chứng không
 * kiểm được, nên nhận nó vào là nhận một dòng mãi mãi `pending`.
 */
export function kiemBangChungCommit(
  nguon: { commit_hash?: unknown; repo?: unknown; merged_cuc_bo?: unknown },
  repo_mac_dinh: string | null | undefined,
): BangChungCommit {
  const hash = typeof nguon.commit_hash === 'string' ? nguon.commit_hash.trim() : '';
  if (hash.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Bằng chứng commit bắt buộc có hash.' });
  }
  if (hash.length < DAI_HASH_COMMIT_TOI_THIEU) {
    throw new BatonError('INVALID_INPUT', {
      message: `Hash commit phải có ít nhất ${String(DAI_HASH_COMMIT_TOI_THIEU)} ký tự.`,
    });
  }
  if (!laHashCommitHopLe(hash)) {
    throw new BatonError('INVALID_INPUT', {
      message: `Hash commit chỉ gồm chữ hex (0–9, a–f), tối đa ${String(DAI_HASH_COMMIT_TOI_DA)} ký tự.`,
    });
  }

  const ghi = typeof nguon.repo === 'string' ? nguon.repo.trim() : '';
  const mac_dinh = typeof repo_mac_dinh === 'string' ? repo_mac_dinh.trim() : '';
  const repo = ghi.length > 0 ? ghi : mac_dinh;
  if (repo.length === 0) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Không có repo: hồ sơ dự án chưa ghi repo GitHub, nên bằng chứng phải ghi repo.',
    });
  }

  /*
   * **Chỉ `true` tường minh mới là một lời khai.** Mọi giá trị khác (thiếu,
   * `null`, `"1"`, `0`) là **không khai** — hướng đóng: một lời khai mở được cổng
   * Xong (qua nguồn `local`) thì nó không được sinh ra từ một giá trị mà client
   * gửi tình cờ.
   */
  const merged_cuc_bo = nguon.merged_cuc_bo === true;

  return { loai: 'commit', commit_hash: hash, repo, merged_cuc_bo };
}

/* ------------------------------------------------------------------ *
 * `deploy` — SPEC d.207: chỉ `https://`, không IP nội bộ hay localhost
 * ------------------------------------------------------------------ */

/**
 * Các dải địa chỉ **không được** gọi tới. Mỗi dòng là một dải có thật, và mỗi
 * dòng có một ca test riêng — một hàm chặn 8 dải mà chỉ có 1 ca test thì 7 dải
 * còn lại là lời khẳng định không ai kiểm.
 */
export const DAI_CHAN_IPV4: readonly {
  ten: string;
  trong: (o: readonly number[]) => boolean;
}[] = [
  { ten: '0.0.0.0/8 (địa chỉ "this host")', trong: (o) => o[0] === 0 },
  { ten: '127.0.0.0/8 (loopback)', trong: (o) => o[0] === 127 },
  { ten: '10.0.0.0/8 (mạng riêng)', trong: (o) => o[0] === 10 },
  {
    ten: '172.16.0.0/12 (mạng riêng)',
    trong: (o) => o[0] === 172 && o[1]! >= 16 && o[1]! <= 31,
  },
  { ten: '192.168.0.0/16 (mạng riêng)', trong: (o) => o[0] === 192 && o[1] === 168 },
  {
    ten: '169.254.0.0/16 (link-local, chứa metadata của nhà cung cấp cloud)',
    trong: (o) => o[0] === 169 && o[1] === 254,
  },
  /*
   * Năm dải dưới đây **thêm ở lượt 2** (reviewer lượt 1 nêu). Cả năm đều là
   * đường đi tới hạ tầng chứ không tới một máy chủ công khai nào:
   */
  {
    // Dải nhà mạng dùng cho NAT nhiều lớp (RFC 6598). Trong một VPC hay một
    // mạng Tailscale/WireGuard nó là **địa chỉ nội bộ thật**, và nó không nằm
    // trong bất kỳ dải riêng cổ điển nào ở trên — tức lỗ rõ nhất còn lại.
    ten: '100.64.0.0/10 (CGNAT, RFC 6598)',
    trong: (o) => o[0] === 100 && o[1]! >= 64 && o[1]! <= 127,
  },
  {
    // Broadcast của mạng hiện tại. Không phải một máy chủ, nên một "deploy" ở
    // đây chỉ có thể là một lần dò mạng.
    ten: '255.255.255.255 (broadcast)',
    trong: (o) => o.every((n) => n === 255),
  },
  {
    ten: '198.18.0.0/15 (dải đo hiệu năng, RFC 2544)',
    trong: (o) => o[0] === 198 && (o[1] === 18 || o[1] === 19),
  },
  {
    // Multicast: gửi tới **nhiều** máy trong mạng nội bộ cùng lúc.
    ten: '224.0.0.0/4 (multicast)',
    trong: (o) => o[0]! >= 224 && o[0]! <= 239,
  },
];

/**
 * Tiền tố **NAT64 well-known** `64:ff9b::/96` (RFC 6052) — thêm ở lượt 2.
 *
 * Vì sao phải có riêng: `64:ff9b::7f00:1` **không** phải IPv4-mapped
 * (`::ffff:…`), nên nhánh IPv4-nhúng ở dưới không bắt nó; nhưng qua một cổng
 * NAT64 nó đi tới đúng `127.0.0.1`. Chặn **cả tiền tố**, không chỉ các IPv4 nội
 * bộ nhúng trong đó: một địa chỉ NAT64 chỉ có nghĩa khi mạng có cổng NAT64, và
 * lúc đó mọi địa chỉ trong tiền tố đều là "đi qua hạ tầng của mạng này" — không
 * phải một URL deploy công khai mà ai cũng mở được.
 */
const NAT64_WELL_KNOWN = [0x0064, 0xff9b, 0, 0, 0, 0] as const;

/** Tên miền luôn trỏ về chính máy, chặn theo tên chứ không chờ DNS. */
const TEN_MIEN_CHAN = ['localhost', 'ip6-localhost', 'ip6-loopback'] as const;

/**
 * **Hậu tố tên miền chỉ-nội-bộ** — thêm ở lượt 2 sửa review, xem
 * `spec-questions.md` #58.
 *
 * Vì sao phải có: `TEN_MIEN_CHAN` chặn **đúng tên** `localhost`, và nhánh "tên
 * miền không có dấu chấm" ở cuối `laHostBiChan` chặn nhãn đơn như `router`. Cả
 * hai **cho qua** `metadata.google.internal` — một tên có dấu chấm, không phải
 * IP, không phải `localhost`, đúng cú pháp một tên miền công khai, và nó phân
 * giải ra đúng `169.254.169.254`, tức **chính** máy chủ metadata mà d.207 sinh
 * ra để chặn. Cùng lỗ: `router.local` (mDNS), `*.home.arpa` (RFC 8375, mạng gia
 * đình), `*.localhost` (RFC 6761, bắt buộc là loopback).
 *
 * Bốn hậu tố này **không bao giờ** là một URL deploy công khai mà ai cũng mở
 * được, nên hướng **ĐÓNG**, cùng tinh thần `TEN_MIEN_CHAN`. Hệ quả được chấp
 * nhận và khai thẳng ở #58: một dịch vụ thật đặt ở tên miền `.internal` nội bộ
 * thì **không** gửi được bằng chứng deploy.
 */
const HAU_TO_TEN_MIEN_CHAN = ['internal', 'local', 'home.arpa', 'localhost'] as const;

/**
 * Host kết thúc bằng một `HAU_TO_TEN_MIEN_CHAN` — so theo **nhãn**, không theo
 * chuỗi con.
 *
 * So chuỗi (`host.endsWith('internal')`) thì **chặn oan** `notinternal.com` và
 * `myinternal.example.com`, tức từ chối một URL deploy thật vì nó tình cờ chứa
 * mấy chữ ấy. Tách theo dấu chấm rồi so **đuôi nhãn** là cách duy nhất khớp đúng
 * cái DNS gọi là hậu tố.
 *
 * Gọi **sau** khi đã bỏ dấu chấm cuối, nên `metadata.google.internal.` cũng bị
 * chặn.
 */
function laHauToTenMienChan(host: string): boolean {
  const nhan = host.split('.');
  return HAU_TO_TEN_MIEN_CHAN.some((hau_to) => {
    const nhan_hau_to = hau_to.split('.');
    if (nhan.length < nhan_hau_to.length) return false;
    const duoi = nhan.slice(nhan.length - nhan_hau_to.length);
    return nhan_hau_to.every((n, i) => duoi[i] === n);
  });
}

/**
 * Bốn số của một IPv4 viết **ở mọi dạng `inet_aton` chấp nhận**, hoặc `null` nếu
 * host không phải IPv4 viết lách.
 *
 * Vì sao phải cố gắng tới mức này: `http://2130706433/`, `http://0x7f000001/` và
 * `http://0177.0.0.1/` đều **là** `127.0.0.1` với phần lớn thư viện phân giải tên
 * (và với `fetch`), nhưng không khớp mẫu bốn số thập phân nào. Chặn `127.0.0.1`
 * mà bỏ ba dạng trên là chặn đúng một cách viết và mở ba cách còn lại.
 *
 * Nhận: 1, 2, 3 hoặc 4 phần; mỗi phần thập phân, bát phân (`0…`) hoặc hex (`0x…`);
 * phần cuối trải ra các byte còn lại — đúng luật của `inet_aton`.
 */
export function bonSoIpv4(host: string): number[] | null {
  const phan = host.split('.');
  if (phan.length === 0 || phan.length > 4) return null;

  const so: number[] = [];
  for (const p of phan) {
    let n: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(p)) n = Number.parseInt(p.slice(2), 16);
    else if (/^0[0-7]+$/.test(p)) n = Number.parseInt(p.slice(1), 8);
    else if (/^(0|[1-9][0-9]*)$/.test(p)) n = Number.parseInt(p, 10);
    else return null;
    if (!Number.isSafeInteger(n) || n < 0) return null;
    so.push(n);
  }

  // Các phần đầu phải là một byte; phần cuối trải ra số byte còn lại.
  const dau = so.slice(0, -1);
  if (dau.some((n) => n > 255)) return null;
  const cuoi = so[so.length - 1]!;
  const con_lai = 4 - dau.length;
  if (cuoi >= 2 ** (8 * con_lai)) return null;

  const ra = [...dau];
  for (let i = con_lai - 1; i >= 0; i -= 1) ra.push((cuoi >>> (8 * i)) & 0xff);
  return ra;
}

/**
 * Tám nhóm 16 bit của một IPv6, hoặc `null` nếu không đọc được.
 *
 * Phải tự giải chứ không khớp mẫu chuỗi: `URL` **chuẩn hoá** IPv6, nên
 * `::ffff:127.0.0.1` ra `::ffff:7f00:1` — một chuỗi không còn dấu chấm nào, tức
 * một cách kiểm "có dấu chấm thì là IPv4 nhúng" sẽ trượt đúng ca nguy hiểm nhất.
 */
export function nhomIpv6(host: string): number[] | null {
  const tach = host.split('::');
  if (tach.length > 2) return null;

  function doc(phan: string): number[] | null {
    if (phan.length === 0) return [];
    const ra: number[] = [];
    const nhom = phan.split(':');
    for (let i = 0; i < nhom.length; i += 1) {
      const p = nhom[i]!;
      // Phần cuối viết dạng IPv4 (`::ffff:127.0.0.1`) chiếm **hai** nhóm 16 bit.
      if (p.includes('.')) {
        if (i !== nhom.length - 1) return null;
        const o = bonSoIpv4(p);
        if (o === null) return null;
        ra.push((o[0]! << 8) | o[1]!, (o[2]! << 8) | o[3]!);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
      ra.push(Number.parseInt(p, 16));
    }
    return ra;
  }

  const dau = doc(tach[0] ?? '');
  if (dau === null) return null;
  if (tach.length === 1) return dau.length === 8 ? dau : null;

  const cuoi = doc(tach[1] ?? '');
  if (cuoi === null) return null;
  const thieu = 8 - dau.length - cuoi.length;
  if (thieu < 0) return null;
  return [...dau, ...Array.from({ length: thieu }, () => 0), ...cuoi];
}

/** Host là một địa chỉ bị chặn (hoặc một cách viết lách của nó). */
export function laHostBiChan(host_tho: string): boolean {
  // `URL.hostname` của IPv6 giữ cặp ngoặc vuông; bỏ ra để so.
  const tho = host_tho.toLowerCase().replace(/^\[|\]$/g, '');

  /*
   * **Dấu chấm cuối là hợp lệ, không phải dấu hiệu tấn công** (sửa ở lượt 2,
   * reviewer lượt 1 nêu): `baton.example.com.` là một FQDN tuyệt đối đúng cú
   * pháp, và chặn nó là **chặn oan** một URL deploy thật.
   *
   * Nên bỏ **một** dấu chấm cuối rồi kiểm tiếp, chứ không từ chối. Hai điều
   * quan trọng: (1) bỏ **sau** đó mới kiểm, nên `127.0.0.1.` vẫn bị chặn như
   * `127.0.0.1` — nếu không thì "thêm một dấu chấm" là cách lách cả hàm này;
   * (2) chỉ bỏ một dấu, nên `example.com..` (không hợp lệ) vẫn rơi vào câu kiểm
   * `endsWith('.')` ở cuối hàm.
   */
  const host = tho.endsWith('.') ? tho.slice(0, -1) : tho;
  if (host.length === 0) return true;
  if ((TEN_MIEN_CHAN as readonly string[]).includes(host)) return true;
  // Hậu tố chỉ-nội-bộ (`.internal`, `.local`, `.home.arpa`, `.localhost`) — #58.
  // Đặt cạnh `TEN_MIEN_CHAN` và **trước** hai nhánh IP: nhãn của một IPv4 toàn
  // số và một IPv6 không có nhãn nào, nên không ca IP nào khớp oan ở đây.
  if (laHauToTenMienChan(host)) return true;

  // --- IPv6 ---
  if (host.includes(':')) {
    const g = nhomIpv6(host);
    // Không đọc được một địa chỉ có dấu `:` thì **chặn**: thà từ chối một URL lạ
    // còn hơn gọi vào một địa chỉ mình không hiểu.
    if (g === null) return true;

    // `::1` loopback và `::` (địa chỉ không xác định), ở mọi cách viết.
    if (g.slice(0, 7).every((n) => n === 0) && (g[7] === 1 || g[7] === 0)) return true;

    // NAT64 well-known `64:ff9b::/96` — xem `NAT64_WELL_KNOWN`.
    if (NAT64_WELL_KNOWN.every((n, i) => g[i] === n)) return true;

    /*
     * **IPv4 nhúng trong IPv6**: `::ffff:127.0.0.1` (IPv4-mapped, `::ffff:0:0/96`)
     * và `::127.0.0.1` (IPv4-compatible) đi tới **đúng** địa chỉ IPv4 đó. Lấy hai
     * nhóm cuối ra làm bốn byte rồi kiểm lại bằng luật IPv4.
     */
    const sau_dau = g.slice(0, 5).every((n) => n === 0);
    if (sau_dau && (g[5] === 0xffff || g[5] === 0)) {
      const o = [g[6]! >>> 8, g[6]! & 0xff, g[7]! >>> 8, g[7]! & 0xff];
      return DAI_CHAN_IPV4.some((d) => d.trong(o));
    }

    // Link-local (`fe80::/10`) và unique-local (`fc00::/7`) của IPv6 — cùng vai
    // với 169.254/16 và 10/8 của IPv4.
    const dau = g[0]!;
    if ((dau & 0xffc0) === 0xfe80) return true;
    if ((dau & 0xfe00) === 0xfc00) return true;
    return false;
  }

  // --- IPv4, mọi cách viết ---
  const o = bonSoIpv4(host);
  if (o !== null) return DAI_CHAN_IPV4.some((d) => d.trong(o));

  /*
   * Còn lại là **tên miền**. "Tên miền rỗng / không có dấu chấm" bị chặn: một
   * nhãn đơn như `intranet` hay `router` phân giải theo hậu tố tìm kiếm của mạng
   * nội bộ, nên nó là một đường vào mạng nội bộ đội lốt tên miền.
   */
  return !host.includes('.') || host.startsWith('.') || host.endsWith('.');
}

/**
 * Kiểm một bằng chứng `deploy` — SPEC d.207.
 *
 * Mã phiên bản **không bị kiểm gì** ngoài độ dài: SPEC 19.12 câu 5 chốt "chỉ lưu
 * và hiện, server KHÔNG kiểm". Đừng thêm một lần kiểm ở đây về sau.
 */
export function kiemBangChungDeploy(nguon: {
  url?: unknown;
  ma_phien_ban?: unknown;
}): BangChungDeploy {
  const tho = typeof nguon.url === 'string' ? nguon.url.trim() : '';
  if (tho.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Bằng chứng deploy bắt buộc có URL.' });
  }

  let u: URL;
  try {
    u = new URL(tho);
  } catch {
    throw new BatonError('INVALID_INPUT', { message: 'URL deploy không đọc được.' });
  }

  // "Chỉ nhận `https://`" — d.207. `http:`, `file:`, `gopher:`, `data:` đều trượt.
  if (u.protocol !== 'https:') {
    throw new BatonError('INVALID_INPUT', { message: 'URL deploy phải bắt đầu bằng https://.' });
  }
  /*
   * **Không nhận user-info trong URL** (`https://ten:mat_khau@host/`).
   *
   * Hai lý do, cả hai đều của SPEC:
   *   1. `https://evil.com@127.0.0.1/` đọc như một URL tới `evil.com` với mắt
   *      người, nhưng host thật là `127.0.0.1`. Host đã bị `laHostBiChan` chặn
   *      đúng, nhưng dạng viết này còn một ca nữa: `https://evil.com@thatsu.com/`
   *      vào DB và hiện trên trang ticket như bằng chứng của `evil.com`.
   *   2. Phần `mat_khau` là một **credential**, và nó sẽ nằm trong cột `url` của
   *      bảng `evidence` — tức một secret được commit vào dữ liệu (danh sách cấm
   *      CLAUDE.md mục 5). Bằng chứng **không sửa, không xoá** (d.222) nên không
   *      có cách nào dọn nó ra.
   */
  if (u.username.length > 0 || u.password.length > 0) {
    throw new BatonError('INVALID_INPUT', {
      message: 'URL deploy không được mang tên đăng nhập hay mật khẩu (phần trước dấu @).',
    });
  }
  if (laHostBiChan(u.hostname)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'URL deploy không được trỏ tới localhost hay IP nội bộ.',
    });
  }

  const ma =
    typeof nguon.ma_phien_ban === 'string' && nguon.ma_phien_ban.trim().length > 0
      ? nguon.ma_phien_ban.trim()
      : null;
  if (ma !== null && ma.length > 200) {
    throw new BatonError('INVALID_INPUT', { message: 'Mã phiên bản tối đa 200 ký tự.' });
  }

  return { loai: 'deploy', url: u.toString(), ma_phien_ban: ma };
}

/* ------------------------------------------------------------------ *
 * `review`, `test`, `file`, `note` — SPEC d.208–211
 * ------------------------------------------------------------------ */

const DAI_CHU_TOI_DA = 100_000;

function chuBatBuoc(gia_tri: unknown, ten: string): string {
  const t = typeof gia_tri === 'string' ? gia_tri.trim() : '';
  if (t.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: `${ten} không được để trống.` });
  }
  if (t.length > DAI_CHU_TOI_DA) {
    throw new BatonError('INVALID_INPUT', {
      message: `${ten} tối đa ${String(DAI_CHU_TOI_DA)} ký tự.`,
    });
  }
  return t;
}

function chuTuyChon(gia_tri: unknown, ten: string): string | null {
  if (gia_tri === undefined || gia_tri === null) return null;
  const t = typeof gia_tri === 'string' ? gia_tri.trim() : '';
  if (t.length === 0) return null;
  if (t.length > DAI_CHU_TOI_DA) {
    throw new BatonError('INVALID_INPUT', {
      message: `${ten} tối đa ${String(DAI_CHU_TOI_DA)} ký tự.`,
    });
  }
  return t;
}

export function kiemBangChungReview(nguon: {
  ket_luan?: unknown;
  ghi_chu?: unknown;
  duong_dan_bao_cao?: unknown;
}): BangChungReview {
  if (!laMaHopLe('ket_luan_review', nguon.ket_luan)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Kết luận review phải là `pass` (Đạt) hoặc `fail` (Không đạt).',
    });
  }
  return {
    loai: 'review',
    ket_luan: nguon.ket_luan,
    ghi_chu: chuTuyChon(nguon.ghi_chu, 'Ghi chú'),
    // "Bắt buộc **khi người gửi là `manager`**" cần vai trò người gửi, nên luật
    // đó ở `handlerGuiBangChung`; ở đây chỉ là hình dạng.
    duong_dan_bao_cao: chuTuyChon(nguon.duong_dan_bao_cao, 'Đường dẫn báo cáo reviewer'),
  };
}

export function kiemBangChungTest(nguon: { tom_tat?: unknown; dat?: unknown }): BangChungTest {
  const tom_tat = chuBatBuoc(nguon.tom_tat, 'Tóm tắt test');
  if (typeof nguon.dat !== 'boolean') {
    throw new BatonError('INVALID_INPUT', { message: 'Cờ đạt của test phải là true hoặc false.' });
  }
  return { loai: 'test', tom_tat, dat: nguon.dat };
}

export function kiemBangChungFile(nguon: { duong_dan?: unknown }): BangChungFile {
  return { loai: 'file', duong_dan: chuBatBuoc(nguon.duong_dan, 'Đường dẫn hoặc link') };
}

export function kiemBangChungNote(nguon: { noi_dung?: unknown }): BangChungNote {
  return { loai: 'note', noi_dung: chuBatBuoc(nguon.noi_dung, 'Nội dung ghi chú') };
}

/**
 * Kiểm một `bao_cao` (#161): đường dẫn và/hoặc nội dung, **ít nhất một**. Luật
 * "manager bắt buộc kèm báo cáo reviewer" ở `handlerGuiBangChung` (cần vai trò).
 */
export function kiemBangChungBaoCao(nguon: {
  duong_dan?: unknown;
  noi_dung?: unknown;
  duong_dan_bao_cao?: unknown;
}): BangChungBaoCao {
  const duong_dan = chuTuyChon(nguon.duong_dan, 'Đường dẫn báo cáo');
  const noi_dung = chuTuyChon(nguon.noi_dung, 'Nội dung báo cáo');
  if (duong_dan === null && noi_dung === null) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Bằng chứng báo cáo cần đường dẫn hoặc nội dung báo cáo (ít nhất một).',
    });
  }
  return {
    loai: 'bao_cao',
    duong_dan,
    noi_dung,
    duong_dan_bao_cao: chuTuyChon(nguon.duong_dan_bao_cao, 'Đường dẫn báo cáo reviewer'),
  };
}

/* ------------------------------------------------------------------ *
 * Một cửa cho cả sáu loại
 * ------------------------------------------------------------------ */

/**
 * Kiểm nội dung bằng chứng theo `loai`. **Một** cửa cho cả sáu loại, nên không có
 * đường nào vào bảng `evidence` mà bỏ qua luật của loại đó.
 */
export function kiemNoiDungBangChung(
  nguon: Record<string, unknown>,
  tuy_chon: { repo_mac_dinh?: string | null } = {},
): NoiDungBangChung {
  if (!laMaHopLe('loai_bang_chung', nguon.loai)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        'Loại bằng chứng phải là một trong: commit, deploy, review, test, file, note, bao_cao.',
    });
  }
  const loai: LoaiBangChung = nguon.loai;
  switch (loai) {
    case 'commit':
      return kiemBangChungCommit(nguon, tuy_chon.repo_mac_dinh);
    case 'deploy':
      return kiemBangChungDeploy(nguon);
    case 'review':
      return kiemBangChungReview(nguon);
    case 'test':
      return kiemBangChungTest(nguon);
    case 'file':
      return kiemBangChungFile(nguon);
    case 'note':
      return kiemBangChungNote(nguon);
    case 'bao_cao':
      return kiemBangChungBaoCao(nguon);
  }
}

/**
 * Trạng thái xác minh **lúc vừa gửi**, theo loại — SPEC d.206, d.207, d.209–211.
 *
 * `commit` và `deploy` vào `pending` (d.219: "chạy ngay khi gửi, trả kết quả
 * trong tối đa 10 giây"; lỗi mạng thì ở lại `pending` và thử lại). Bốn loại còn
 * lại **không có bước xác minh nào**, nên `not_required` — không phải `passed`,
 * xem ghi chú ở `XAC_MINH_BANG_CHUNG`.
 */
export function xacMinhBanDau(loai: LoaiBangChung): 'pending' | 'not_required' {
  return loai === 'commit' || loai === 'deploy' ? 'pending' : 'not_required';
}
