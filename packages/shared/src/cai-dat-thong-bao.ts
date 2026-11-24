/**
 * **Công tắc từng loại thông báo + tin bảo mật tài khoản** — SPEC mục 12 d.348
 * ("Tắt từng loại trong Cài đặt"), 19.12 câu 3 d.594 ("Mọi lần đặt lại (TOTP hoặc
 * mật khẩu) ghi một dòng Lịch sử và bắn một thông báo Telegram"), 19.12 câu 6
 * d.604–606, mục 12 d.350 (giờ yên lặng). BAT-16, migration 0026.
 *
 * Hàm thuần, không chạm DB — cùng nếp `thong-bao.ts`: API (cron gửi, cửa ghi,
 * route Cài đặt) đọc **cùng một** bản luật.
 *
 * ## Công tắc KHÔNG trùng một-một với `thong_bao.loai`, và đó là chủ ý
 *
 *   * `can_chu_do` là **một** mã `loai` cho **hai** tin khác nhau (🔴 mới và lời
 *     nhắc 🔴 sau 2 giờ — 0019 đã khai). Hai tin đó khác nhau ở `uu_tien` (mới =
 *     `khan`, nhắc = `thuong`), một phân loại **bất biến** lúc sinh ra. Nên tách
 *     được thành hai công tắc mà không cần thêm cột nào: `can_chu_do_moi` và
 *     `can_chu_do_nhac`.
 *   * Tin **bảo mật tài khoản** (BAT-16) mang cột `bao_mat` khác NULL. Nó có một
 *     "công tắc" `bao_mat_tai_khoan` chỉ để **hiện ra và khoá**: không tắt được, ở
 *     cả ba tầng (hàm này, lệnh ghi, CHECK của bảng `cai_dat_thong_bao` không nhận
 *     mã này, và trigger của 0026 cấm đánh dấu bỏ gửi một tin bảo mật).
 *
 * ## "Tắt" = KHÔNG gửi Telegram, VẪN vào chuông
 *
 * Tắt một loại chỉ chặn **chặng ra kênh ngoài**. Dòng `thong_bao` vẫn được ghi
 * như cũ (chuông trong app, d.339) — không mất dấu vết nào, và d.348 nói "tắt
 * từng loại" ở mục **Thông báo**, mà mục đó có **hai** kênh: tắt ồn ào ngoài điện
 * thoại là việc chủ muốn, xoá luôn bản ghi trong app thì không ai đòi.
 */

import { MUI_GIO_CHU_PHUT } from './can-chu.js';

/* ------------------------------------------------------------------ *
 * 1. Các công tắc
 * ------------------------------------------------------------------ */

/**
 * **Mọi công tắc tắt được**, theo đúng thứ tự hiện trên trang Cài đặt.
 *
 * Phủ **mọi** mã `loai` trong CHECK của 0012 (có ca test đối chiếu từng mã), cộng
 * phần tách đôi của `can_chu_do`. Danh sách này cũng là CHECK của cột
 * `cai_dat_thong_bao.cong_tac` (0026) — đổi một bên là ca test đỏ.
 */
export const CONG_TAC_THONG_BAO = [
  'can_chu_do_moi',
  'can_chu_do_nhac',
  'phien_dung',
  'phien_loi',
  'luot_khong_phan_hoi',
  'bang_chung_truot',
  'chua_merge_7_ngay',
  'ticket_xong',
  'bao_cao_sang',
  'bao_cao_toi',
] as const;
export type CongTacThongBao = (typeof CONG_TAC_THONG_BAO)[number];

/** Công tắc **khoá** của tin bảo mật — hiện ra, không tắt được. */
export const CONG_TAC_BAO_MAT = 'bao_mat_tai_khoan';
export type CongTacBaoMat = typeof CONG_TAC_BAO_MAT;

export type MaCongTac = CongTacThongBao | CongTacBaoMat;

export function laCongTacThongBao(x: unknown): x is CongTacThongBao {
  return typeof x === 'string' && (CONG_TAC_THONG_BAO as readonly string[]).includes(x);
}

/** Nhãn tiếng Việt của từng công tắc (mục 0.1: UI hiển thị nhãn Việt). */
export const NHAN_CONG_TAC: Readonly<Record<MaCongTac, string>> = {
  can_chu_do_moi: 'Cần Chủ 🔴 mới',
  can_chu_do_nhac: 'Nhắc Cần Chủ 🔴 chưa xử lý sau 2 giờ',
  phien_dung: 'Phiên đứng',
  phien_loi: 'Phiên lỗi',
  luot_khong_phan_hoi: 'Lượt giao không phản hồi',
  bang_chung_truot: 'Bằng chứng trượt',
  chua_merge_7_ngay: 'Commit chưa merge sau 7 ngày',
  ticket_xong: 'Ticket Xong (gom 15 phút)',
  bao_cao_sang: 'Báo cáo sáng',
  bao_cao_toi: 'Handoff tối',
  bao_mat_tai_khoan: 'Bảo mật tài khoản',
};

/** Câu giải thích cạnh công tắc khoá — trang Cài đặt in nguyên văn. */
export const LY_DO_KHOA_BAO_MAT =
  'Luôn bật: tin đổi mật khẩu, đăng xuất mọi nơi, đặt lại mã xác thực và nhập sai ' +
  'liên tiếp được gửi cả trong giờ yên lặng, để anh biết ngay nếu có người khác ' +
  'đang dùng tài khoản.';

/** Một tin như luật công tắc cần biết — các cột bất biến của `thong_bao`. */
export interface TinTheoCongTac {
  loai: string;
  uu_tien: string;
  /** `thong_bao.bao_mat` (0026) — khác `null` ⇒ tin bảo mật tài khoản. */
  bao_mat?: string | null;
}

/**
 * Công tắc **quản** một tin, hoặc `null` = không công tắc nào quản (luôn gửi).
 *
 * Tin bảo mật xét **trước** `loai`: nó mượn `loai = 'can_chu_do'` (xem đầu 0026),
 * nên xét `loai` trước thì công tắc "Cần Chủ 🔴 mới" tắt luôn được tin bảo mật.
 *
 * Mã `loai` lạ (một loại thêm ở lượt sau mà quên khai ở đây) ⇒ `null` ⇒ **gửi**:
 * hướng sai an toàn của một hệ báo việc gấp là báo thừa, không im lặng.
 */
export function congTacCuaTin(tin: TinTheoCongTac): MaCongTac | null {
  if ((tin.bao_mat ?? null) !== null) return CONG_TAC_BAO_MAT;
  if (tin.loai === 'can_chu_do') {
    return tin.uu_tien === 'khan' ? 'can_chu_do_moi' : 'can_chu_do_nhac';
  }
  return laCongTacThongBao(tin.loai) ? tin.loai : null;
}

/**
 * Tin này có bị **tắt gửi Telegram** không, với tập công tắc đang tắt `tat`.
 *
 * Tin bảo mật **không bao giờ** bị tắt, kể cả khi `tat` (vì một dòng DB hỏng hay
 * một lượt sau viết sai) có chứa mã của nó.
 */
export function tinBiTat(tin: TinTheoCongTac, tat: ReadonlySet<string>): boolean {
  const ma = congTacCuaTin(tin);
  if (ma === null || ma === CONG_TAC_BAO_MAT) return false;
  return tat.has(ma);
}

/* ------------------------------------------------------------------ *
 * 2. Sự kiện bảo mật tài khoản chủ — 19.12 câu 3 d.594
 * ------------------------------------------------------------------ */

/**
 * Các sự kiện ghi Nhật ký + bắn tin. Cũng là CHECK của `thong_bao.bao_mat` (0026).
 *   * `doi_mat_khau` — đổi mật khẩu **thành công** ("đặt lại mật khẩu" của d.594);
 *   * `dat_lai_totp` — đặt lại TOTP qua token máy chủ ("đặt lại TOTP" của d.594);
 *   * `dang_xuat_moi_noi` — "đăng xuất mọi nơi" (d.425), theo brief BAT-16;
 *   * `sai_lien_tiep` — nhập sai liên tiếp ở đường đổi mật khẩu (BAT-16).
 */
export const SU_KIEN_BAO_MAT = [
  'doi_mat_khau',
  'dat_lai_totp',
  'dang_xuat_moi_noi',
  'sai_lien_tiep',
] as const;
export type SuKienBaoMat = (typeof SU_KIEN_BAO_MAT)[number];

/**
 * **Ngưỡng cảnh báo nhập sai liên tiếp** ở đường đổi mật khẩu — BAT-16.
 *
 * Đếm bằng **chính bộ đếm `so_lan_sai`** của #98 (dùng chung với đăng nhập), không
 * một bộ đếm thứ hai. Xem `canCanhBaoSai` cho chính sách chống spam.
 */
export const NGUONG_CANH_BAO_SAI = 3;

/**
 * Lần sai **này** (bộ đếm sau khi nhích = `so_lan_sai`) có bắn cảnh báo không.
 *
 * ## Chính sách: báo ở MỌI lần sai từ lần thứ 3 trở đi — và vì sao không spam
 *
 * Phương án "chỉ báo một lần mỗi chuỗi" cần một trạng thái thứ hai ("chuỗi này đã
 * báo chưa") cạnh bộ đếm, và nó **im** đúng ca nguy hiểm nhất: kẻ cầm cookie trộm
 * đoán tiếp cả buổi mà chủ chỉ nhận một tin lúc đầu. Phương án "báo ở lần 3, 13,
 * 23…" lọt ca bộ đếm đã vượt 3 vì đăng nhập sai (bộ đếm dùng chung) rồi mới tới
 * đường đổi mật khẩu.
 *
 * Báo mọi lần từ lần thứ 3 thì **không lọt ca nào**, và số tin bị chặn trên bởi
 * chính hạn mức của #98: từ lần sai thứ 6 tài khoản bị khoá (30 giây, nhân đôi,
 * trần 15 phút), và lần thử lúc đang khoá ra 429 **không** nhích bộ đếm nên
 * **không** bắn tin. Tức tối đa 4 tin dồn (lần 3–6), rồi một tin mỗi chu kỳ khoá —
 * khoảng 4 tin/giờ khi bị dò liên tục. Và đường này đòi một **cookie phiên chủ còn
 * sống**: mỗi tin là một tín hiệu thật, không phải nhiễu của internet công khai.
 */
export function canCanhBaoSai(so_lan_sai: number): boolean {
  return so_lan_sai >= NGUONG_CANH_BAO_SAI;
}

/** Câu bắt buộc của mọi tin bảo mật (brief BAT-16). */
export const CAU_NEU_KHONG_PHAI_ANH = 'Nếu không phải anh làm, đổi mật khẩu ngay';

/** Nhãn thay khi không rút được thiết bị nào từ User-Agent. */
export const NHAN_KHONG_RO_THIET_BI = 'không rõ thiết bị';

/** "14:05 ngày 17/10/2026" — giờ trên tường của chủ (`MUI_GIO_CHU_PHUT`, 19.12 câu 60). */
export function gioPhutDiaPhuong(moc: number, lech_phut = MUI_GIO_CHU_PHUT): string {
  const d = new Date(moc + lech_phut * 60_000);
  const hai = (n: number): string => String(n).padStart(2, '0');
  return (
    `${hai(d.getUTCHours())}:${hai(d.getUTCMinutes())} ngày ` +
    `${hai(d.getUTCDate())}/${hai(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear())}`
  );
}

/**
 * Bối cảnh của một sự kiện — **chỉ** những thứ không bí mật. Hàm dựng chữ không
 * nhận mật khẩu, băm, muối, secret TOTP, token hay cookie nào **ở kiểu**, nên
 * không có đường nào để chúng lọt vào tin hay vào dòng Nhật ký.
 */
export interface BoiCanhSuKienBaoMat {
  luc: number;
  /**
   * Nhãn thiết bị rút gọn từ User-Agent (`nhanThietBi`, vd "Chrome · macOS"),
   * hoặc `null`. **Không** User-Agent thô, **không** IP.
   */
  thiet_bi: string | null;
  /** `true` khi lệnh tới bằng token máy chủ (`TOKEN_CHU`), không phải phiên web. */
  qua_token_chu?: boolean;
  /** Số phiên vừa bị đăng xuất (đổi mật khẩu, đăng xuất mọi nơi, đặt lại TOTP). */
  so_phien?: number;
  /** Bộ đếm sai **sau** khi nhích (`sai_lien_tiep`). */
  so_lan_sai?: number;
}

export interface NoiDungSuKienBaoMat {
  /** `nhat_ky.quyet_dinh` — 1..20000 ký tự (0014). */
  quyet_dinh: string;
  /** `nhat_ky.vi_sao` — 1..20000 ký tự (0014). */
  vi_sao: string;
  /** `thong_bao.noi_dung` — chữ của tin Telegram. */
  tin: string;
}

function nguonCua(b: BoiCanhSuKienBaoMat): string {
  if (b.qua_token_chu === true) return 'token máy chủ';
  return `phiên web ${b.thiet_bi ?? NHAN_KHONG_RO_THIET_BI}`;
}

/** Chữ của dòng Nhật ký + tin Telegram cho một sự kiện bảo mật. */
export function noiDungSuKienBaoMat(
  su_kien: SuKienBaoMat,
  b: BoiCanhSuKienBaoMat,
  lech_phut = MUI_GIO_CHU_PHUT,
): NoiDungSuKienBaoMat {
  const gio = gioPhutDiaPhuong(b.luc, lech_phut);
  const nguon = nguonCua(b);
  const n = String(b.so_phien ?? 0);
  const goc = 'Sự kiện bảo mật tài khoản chủ, hệ thống tự ghi (SPEC 19.12 câu 3).';

  switch (su_kien) {
    case 'doi_mat_khau':
      return {
        quyet_dinh: 'Đổi mật khẩu tài khoản chủ.',
        vi_sao: `${goc} Làm từ ${nguon} lúc ${gio}; đã đăng xuất ${n} phiên khác.`,
        tin: `🔐 Baton: mật khẩu tài khoản chủ vừa được đổi lúc ${gio} (${nguon}); đã đăng xuất ${n} phiên khác. ${CAU_NEU_KHONG_PHAI_ANH}.`,
      };
    case 'dat_lai_totp':
      return {
        quyet_dinh: 'Đặt lại mã xác thực 2 lớp (TOTP) của tài khoản chủ.',
        vi_sao: `${goc} Làm từ ${nguon} lúc ${gio}; đã đăng xuất ${n} phiên web.`,
        tin: `🔐 Baton: mã xác thực 2 lớp (TOTP) của tài khoản chủ vừa được đặt lại lúc ${gio} (${nguon}); đã đăng xuất ${n} phiên web. ${CAU_NEU_KHONG_PHAI_ANH}.`,
      };
    case 'dang_xuat_moi_noi':
      return {
        quyet_dinh: 'Đăng xuất mọi nơi khỏi tài khoản chủ.',
        vi_sao: `${goc} Làm từ ${nguon} lúc ${gio}; ${n} phiên bị đăng xuất.`,
        tin: `🔐 Baton: vừa "đăng xuất mọi nơi" lúc ${gio} (${nguon}); ${n} phiên bị đăng xuất. ${CAU_NEU_KHONG_PHAI_ANH}.`,
      };
    case 'sai_lien_tiep': {
      const k = String(b.so_lan_sai ?? NGUONG_CANH_BAO_SAI);
      return {
        quyet_dinh: `Cảnh báo: ${k} lần nhập sai liên tiếp khi đổi mật khẩu tài khoản chủ.`,
        vi_sao: `${goc} Lần sai gần nhất từ ${nguon} lúc ${gio} (sai mật khẩu hiện tại hoặc mã xác thực).`,
        tin: `⚠️ Baton: ${k} lần nhập sai liên tiếp (mật khẩu hiện tại hoặc mã xác thực) khi đổi mật khẩu, lần gần nhất lúc ${gio} (${nguon}). ${CAU_NEU_KHONG_PHAI_ANH} và đăng xuất mọi nơi.`,
      };
    }
  }
}
