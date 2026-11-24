/**
 * **Đăng nhập của chủ** — SPEC mục 15 d.415–d.418.
 *
 * d.415: "Chủ đăng nhập bằng mật khẩu cộng mã TOTP (2 lớp). Passkey để sau.
 * Phiên đăng nhập **30 ngày**, có nút **đăng xuất mọi nơi**."
 *
 * File này là **phần quyết định** của đường đó. Nó chạy **trong cửa ghi**
 * (`WorkspaceGate`), không ở Worker, và đó không phải chuyện nếp:
 *
 *   * **Chống dùng lại mã TOTP là một phép đọc-kiểm-ghi.** Đọc `totp_buoc_cuoi`,
 *     so với bước của mã, rồi ghi bước mới. Chạy thẳng trên D1 thì hai request
 *     mang **cùng một mã** cùng đọc `totp_buoc_cuoi` cũ và cùng thành công — tức
 *     luật "một mã một lần" biến mất đúng trong ca nó tồn tại để chặn.
 *   * **Bộ đếm thử sai** cũng vậy: hai lần thử song song mà cùng đọc `so_lan_sai`
 *     thì bộ đếm chỉ nhích một, và một bài dò song song đi qua mọi hạn mức.
 *
 * ## Không phải một lệnh của `BanDoLenh`, và đó là điểm chính
 *
 * Mọi lệnh của `BanDoLenh` mang một `ai: AiGoi` **đã xác thực** và đi qua
 * `batBuocQuyen`. Đường đăng nhập thì **chưa có** danh tính nào — nó là đường
 * *dựng ra* danh tính. Đưa nó vào `BanDoLenh` sẽ phải bịa một `ai` cho nó, và
 * một lệnh có tên nghĩa là một dòng trong whitelist tầng HTTP đứng giữa một
 * agent và câu "tôi là chủ". Nên nó là một đường **riêng của DO**, cùng khuôn
 * `ghiXacMinh` và `ghiMocCanhBao`.
 */

import {
  BatonError,
  MAT_KHAU_DAI_TOI_DA,
  MAT_KHAU_DAI_TOI_THIEU,
  PHIEN_CHU_MS,
  SO_VONG_PBKDF2,
  bamIdPhien,
  buocTotp,
  canCanhBaoSai,
  datMatKhau,
  kiemMatKhau,
  kiemTotp,
  laHinhMaTotp,
  laHinhMatKhau,
  sinhIdPhien,
  sinhSecretTotp,
  uriOtpauth,
  type MatKhauDaBam,
} from '@baton/shared';
import type { Env } from './moi-truong.js';
import { cauLenhSuKienBaoMat } from './su-kien-bao-mat.js';

/* ------------------------------------------------------------------ *
 * Hạn mức chống dò mật khẩu — SPEC IM LẶNG
 * ------------------------------------------------------------------ */

/**
 * Số lần sai **liên tiếp** được tha trước khi khoá.
 *
 * **SPEC không nói gì về số lần thử** — xem `cau-hoi-spec.md`. Đây là hướng tạm,
 * và nó phải có: không có hạn mức nào thì 600 request/phút của d.387 là 600 lần
 * đoán mật khẩu mỗi phút, mãi mãi.
 */
export const NGUONG_KHOA_SAI = 5;

/** Khoá tối thiểu khi vượt ngưỡng, ms. */
export const KHOA_DAU_MS = 30_000;

/** Trần khoá, ms. 15 phút: đủ để một bài dò vô nghĩa, chưa đủ để chủ bỏ đi. */
export const KHOA_TOI_DA_MS = 15 * 60_000;

/**
 * Khoá tăng dần theo số lần sai: 30s, 1p, 2p, 4p, 8p, rồi chặn ở 15p.
 *
 * Tăng dần (không một con số cố định) vì hai nhóm người dùng khác nhau: chủ gõ
 * sai một lần thì không bị phạt gì, còn một máy dò thì sau mươi lần chỉ còn vài
 * lần thử mỗi giờ.
 *
 * **Trần `KHOA_TOI_DA_MS` là thứ giữ hàm này hữu hạn.** `2 ** (so_lan_sai − 6)`
 * vượt `Number.MAX_SAFE_INTEGER` ở quãng lần sai thứ 60 và thành `Infinity` ở
 * quãng thứ 1030 — mà một máy dò chạy cả tháng **tới được** những con số đó.
 * `Math.min` đứng ngoài nên mọi đầu vào lớn đều ra đúng 15 phút, không ra
 * `Infinity` (một `khoa_den_luc = Infinity` ghi vào D1 là một khoá **vĩnh viễn**,
 * tức đúng cái hỏng mà lượt này đi sửa). Có ca unit đo cả ba mốc.
 */
export function khoaBaoLauMs(so_lan_sai: number): number {
  if (so_lan_sai <= NGUONG_KHOA_SAI) return 0;
  const nhan = 2 ** (so_lan_sai - NGUONG_KHOA_SAI - 1);
  return Math.min(KHOA_TOI_DA_MS, KHOA_DAU_MS * nhan);
}

/* ------------------------------------------------------------------ *
 * Một câu trả lời duy nhất cho mọi lần đăng nhập trượt
 * ------------------------------------------------------------------ */

/**
 * **Sai mật khẩu, sai mã TOTP, chưa thiết lập tài khoản — cùng một lỗi.**
 *
 * Nói sai cái nào là cho người dò biết **mật khẩu đã đúng**, tức biến bài toán
 * "đoán mật khẩu **và** có máy TOTP" thành "đoán mật khẩu" (và lúc đó phản hồi
 * của máy chủ chính là cái oracle xác nhận). Cùng lý lẽ `FORBIDDEN` vs
 * `NOT_FOUND` của `quyet-dinh.md` (mã lỗi không được là một máy dò).
 *
 * Mã là `INVALID_TOKEN`/401, không một mã mới: đây đúng là "giấy tờ không hợp
 * lệ", và thêm một mã vào bảng mục 13 cần một dòng `cau-hoi-spec.md` cho một
 * thứ không thêm thông tin nào cho người gọi.
 */
export function loiDangNhapSai(): BatonError {
  return new BatonError('INVALID_TOKEN', {
    message: 'Mật khẩu hoặc mã xác thực không đúng.',
  });
}

/* ------------------------------------------------------------------ *
 * Kiểu yêu cầu / kết quả của ba đường ghi
 * ------------------------------------------------------------------ */

export interface YeuCauThietLapChu {
  workspace_id: string;
  mat_khau: string;
  /** Tên hiện trong ứng dụng xác thực; để trống thì lấy `workspace.ten_chu`. */
  ten?: string | undefined;
}

export interface KetQuaThietLapChu {
  /**
   * URI `otpauth://…` — **lần duy nhất** secret TOTP ra khỏi máy chủ, đúng nếp
   * "token hiện một lần" của agent (mục 3). Lượt giao diện vẽ nó thành QR.
   */
  otpauth: string;
  tao_luc: number;
}

export interface YeuCauDangNhapChu {
  workspace_id: string;
  mat_khau: unknown;
  ma_totp: unknown;
  /** User-Agent, để làm dấu vết (d.418). */
  ua?: string | undefined;
}

export interface KetQuaDangNhapChu {
  /** Id phiên **thô** — chỉ đi vào cookie, không vào thân phản hồi. */
  id_phien: string;
  het_luc: number;
}

export interface YeuCauDatLaiTotpChu {
  workspace_id: string;
  /** Tên hiện trong ứng dụng xác thực; để trống thì lấy `workspace.ten_chu`. */
  ten?: string | undefined;
  /** User-Agent của request — chỉ để rút **nhãn** thiết bị cho dòng Nhật ký (BAT-16). */
  ua?: string | undefined;
}

export interface KetQuaDatLaiTotpChu {
  /** URI `otpauth://…` của secret **MỚI** — lần duy nhất nó ra khỏi máy chủ. */
  otpauth: string;
  /** Số phiên web bị đá ra (xem `datLaiTotpChu` cho lý do đá). */
  so_phien_da_huy: number;
  dat_lai_luc: number;
}

export interface YeuCauMoKhoaChu {
  workspace_id: string;
}

export interface KetQuaMoKhoaChu {
  /** Có đang bị khoá lúc gọi hay không (để chủ biết mình vừa mở cái gì). */
  dang_bi_khoa: boolean;
  so_lan_sai_truoc: number;
}

export interface YeuCauDangXuatChu {
  workspace_id: string;
  /**
   * Băm của phiên **đã xác thực** request này (`phien_chu` của middleware);
   * `null` khi request không vào bằng cookie phiên — kể cả khi header còn mang
   * một cookie chết (BAT-17).
   */
  bam: string | null;
  /**
   * Request vào bằng `TOKEN_CHU` (cờ `qua_token_chu` của middleware) — nguồn ghi
   * vào Nhật ký. Lấy từ **cách xác thực thật**, không suy từ `bam` (BAT-17).
   */
  qua_token_chu: boolean;
  /** `true` = **mọi** phiên của chủ (d.415 "đăng xuất mọi nơi"). */
  moi_noi: boolean;
  /** User-Agent của request — chỉ để rút **nhãn** thiết bị cho dòng Nhật ký (BAT-16). */
  ua?: string | undefined;
}

export interface KetQuaDangXuatChu {
  so_phien_da_huy: number;
}

/* ------------------------------------------------------------------ *
 * Số vòng PBKDF2 hiện hành
 * ------------------------------------------------------------------ */

/**
 * Số vòng dùng khi **đặt** mật khẩu mới.
 *
 * Mặc định là hằng sản phẩm `SO_VONG_PBKDF2` (100.000 — **trần của Workers**,
 * xem chú thích của hằng). Binding `PBKDF2_SO_VONG` chỉ để **test** hạ con số
 * xuống: 100.000 vòng vẫn mất hàng chục ms mỗi lần băm, và bộ test đăng nhập băm
 * hàng chục lần, nên không hạ thì `npm test` dài thêm đáng kể — tức một cổng
 * nghiệm thu người ta bắt đầu bỏ qua (cùng lý lẽ đã ghi cho bộ đo 200k).
 *
 * Binding này **không còn cần** cho một bản deploy sạch: mặc định đã bằng trần.
 * Đặt nó **cao hơn** 100.000 trên bản thật là tự tay dựng lại lỗi 500 của 06/10.
 *
 * Giá trị lạ hoặc dưới trần dưới của DB (1.000) bị **bỏ qua**, rơi về mức sản
 * phẩm: một binding gõ sai **không được** làm yếu mật khẩu chủ của một bản
 * deploy thật.
 */
export function soVongHienHanh(env: Env): number {
  const tho = env.PBKDF2_SO_VONG;
  if (tho === undefined) return SO_VONG_PBKDF2;
  const n = Number(tho);
  if (!Number.isInteger(n) || n < 1000) return SO_VONG_PBKDF2;
  return n;
}

/* ------------------------------------------------------------------ *
 * Dòng tài khoản
 * ------------------------------------------------------------------ */

export interface DongTaiKhoanChu extends MatKhauDaBam {
  workspace_id: string;
  totp_secret: string;
  totp_buoc_cuoi: number | null;
  so_lan_sai: number;
  khoa_den_luc: number | null;
}

export function taiKhoanChu(
  db: D1Database,
  workspace_id: string,
): Promise<DongTaiKhoanChu | null> {
  return db
    .prepare(
      `SELECT workspace_id, mat_khau_bam, muoi, so_vong, totp_secret, totp_buoc_cuoi,
              so_lan_sai, khoa_den_luc
         FROM chu_tai_khoan WHERE workspace_id = ?`,
    )
    .bind(workspace_id)
    .first<DongTaiKhoanChu>();
}

/* ------------------------------------------------------------------ *
 * Thiết lập lần đầu
 * ------------------------------------------------------------------ */

/**
 * **Thiết lập tài khoản chủ lần đầu** — `cau-hoi-spec.md` #3 đã chốt "một lệnh
 * khởi tạo chạy trên máy chủ, chạy được **đúng một lần** khi chưa có chủ".
 *
 * Ở Baton nó phải là một **đường HTTP**, không một lệnh `wrangler`: `wrangler`
 * bị chặn trong môi trường này, nên chủ không `wrangler secret put` được một băm
 * mật khẩu. Đường đó được canh bằng `TOKEN_CHU` (xem route ở `index.ts`), và
 * `TOKEN_CHU` rỗng = **không đường nào vào** (fail-closed, đúng nếp phần 1).
 *
 * Gọi lần thứ hai bị chặn: đã có tài khoản thì đây không còn là "thiết lập", và
 * một đường đặt lại mật khẩu **không cần mật khẩu cũ** là một cửa hậu đi quanh
 * cả hai lớp của d.415. Đổi mật khẩu là việc của lượt sau, và nó sẽ đòi mật khẩu
 * cũ.
 */
export async function thietLapChu(
  env: Env,
  yc: YeuCauThietLapChu,
  bay_gio: number,
): Promise<KetQuaThietLapChu> {
  const db = env.DB;

  if (!laHinhMatKhau(yc.mat_khau)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Mật khẩu phải dài từ 12 tới 256 ký tự.',
    });
  }

  const ws = await db
    .prepare('SELECT ten_chu FROM workspace WHERE id = ?')
    .bind(yc.workspace_id)
    .first<{ ten_chu: string }>();
  if (ws === null) throw new BatonError('NOT_FOUND', { message: 'Không có workspace này.' });

  const da_co = await taiKhoanChu(db, yc.workspace_id);
  if (da_co !== null) {
    throw new BatonError('FORBIDDEN', {
      message: 'Tài khoản chủ đã được thiết lập. Đổi mật khẩu phải nhập mật khẩu cũ.',
    });
  }

  const bam = await datMatKhau(yc.mat_khau, soVongHienHanh(env));
  const totp_secret = sinhSecretTotp();

  await db
    .prepare(
      `INSERT INTO chu_tai_khoan
         (workspace_id, mat_khau_bam, muoi, so_vong, totp_secret, totp_buoc_cuoi,
          so_lan_sai, sai_cuoi_luc, khoa_den_luc, tao_luc, cap_nhat_luc, dang_nhap_cuoi_luc)
       VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, NULL, ?, ?, NULL)`,
    )
    .bind(
      yc.workspace_id,
      bam.mat_khau_bam,
      bam.muoi,
      bam.so_vong,
      totp_secret,
      bay_gio,
      bay_gio,
    )
    .run();

  return {
    otpauth: uriOtpauth({ secret_base32: totp_secret, ten: yc.ten ?? ws.ten_chu }),
    tao_luc: bay_gio,
  };
}

/* ------------------------------------------------------------------ *
 * Đặt lại TOTP — đường cứu khi mất ứng dụng xác thực
 * ------------------------------------------------------------------ */

/**
 * **Sinh lại secret TOTP cho chủ**, giữ nguyên mật khẩu.
 *
 * ## Vì sao đường này phải tồn tại
 *
 * `otpauth://` ra khỏi máy chủ **đúng một lần** (lúc `thietLapChu`). Mất điện
 * thoại, đổi điện thoại, hay xoá nhầm mục trong ứng dụng xác thực là **mất hẳn
 * một trong hai yếu tố của d.415** — và không có đường nào cấp lại:
 * `thietLapChu` gọi lần hai trả `FORBIDDEN` (cố ý: nó không phải đường đặt lại
 * mật khẩu).
 *
 * Đường "cứu" mà `TRIEN-KHAI.md` từng ghi là `DELETE FROM chu_tai_khoan` rồi
 * chạy lại khởi tạo. Nó **không chạy được**, và lượt này sửa chính lỗi đó:
 * `chu_phien.workspace_id` khai `REFERENCES chu_tai_khoan(workspace_id)` **không
 * có `ON DELETE`** (migration 0017 dòng 124), và 0017 khai rõ chính sách "không
 * xoá dòng `chu_phien` khi đăng xuất" (dòng 138–140). Nên ngay sau lần đăng nhập
 * **đầu tiên**, bảng `chu_phien` có một dòng trỏ tới tài khoản, và D1 ép khoá
 * ngoài ⇒ câu `DELETE` kia trả `FOREIGN KEY constraint failed`. Hệ quả thật: chủ
 * mất ứng dụng xác thực sau tuần đầu là **bị khoá vĩnh viễn khỏi web**.
 *
 * ## Nó KHÔNG phải cửa hậu
 *
 * Canh bằng **`TOKEN_CHU`** và chỉ `TOKEN_CHU` (route ở `index.ts`, cờ
 * `qua_token_chu`, cùng nếp `/v1/chu/thiet-lap` và `/v1/chu/mo-khoa`);
 * `TOKEN_CHU` rỗng = **không đường nào vào** (fail-closed). Một cookie phiên
 * không vào được.
 *
 * Nó **không chạm** `mat_khau_bam`, `muoi`, `so_vong`: yếu tố "cái mình biết"
 * giữ nguyên, nên ai nắm `TOKEN_CHU` mà **không** biết mật khẩu vẫn không đăng
 * nhập được. Đây là điều làm nó khác một đường đặt lại mật khẩu — và là lý do nó
 * được phép tồn tại trong khi đường kia không.
 *
 * ## Vì sao nó ĐÁ MỌI PHIÊN ĐANG MỞ
 *
 * Lý do gọi đường này là "yếu tố thứ hai đã rời khỏi tay tôi". Nếu nó rời khỏi
 * tay tôi vì có người khác lấy được, thì mọi phiên web **đang mở** là những phiên
 * mà người đó có thể đang dùng, và chúng sống tới 30 ngày. Đặt lại secret mà để
 * các phiên đó sống là đổi khoá cửa trước trong khi người kia đã ở trong nhà. Nên
 * nó đặt `huy_luc` cho mọi phiên chưa huỷ — **không xoá dòng** (dấu vết d.418,
 * và `DELETE` thuộc danh sách cấm `CLAUDE.md` mục 4), đúng cơ chế
 * `dangXuatChu({ moi_noi: true })`.
 *
 * Giá phải trả là chủ phải đăng nhập lại ngay trên máy đang dùng — bằng mật khẩu
 * cũ (vẫn đúng) và secret vừa quét. Đó là một lần gõ lại, đổi lấy việc không để
 * một phiên lạ sống thêm 30 ngày.
 *
 * ## `totp_buoc_cuoi` KHÔNG bị chạm — và đó là chỗ tôi đã sai một lần
 *
 * Bản đầu của hàm này đặt `totp_buoc_cuoi = NULL`, với lý lẽ "mốc đó là của
 * secret cũ, mang sang một secret mới thì vô nghĩa". Lý lẽ đó **sai**, và
 * trigger `tg_chu_tai_khoan_totp_buoc_chi_tang` (0017 dòng 265) chặn câu lệnh
 * đó ngay — chú thích của chính trigger ấy đã đoán trước đúng lỗi này: "đó đúng
 * là một câu mà một đường ghi mới ở lượt sau có thể viết vì tưởng đang *đặt lại
 * cho sạch*".
 *
 * Vì sao nó sai: bước TOTP là `floor(mốc / 30s)` — nó dẫn xuất từ **đồng hồ**,
 * không từ secret. Nên `totp_buoc_cuoi` luôn ≤ bước hiện tại, và mã *bây giờ*
 * của secret mới vẫn qua được. Thứ duy nhất bị loại là mã của một bước **đã
 * tiêu** — đúng cái mốc ấy sinh ra để loại. Đặt nó về NULL không "làm sạch" gì;
 * nó mở lại cửa sổ dùng lại mã cho mọi mã trong vùng đó.
 *
 * Giá duy nhất: chủ vừa đăng nhập trong cùng cửa sổ 30 giây rồi gọi đường này
 * ngay thì mã của đúng cửa sổ đó bị loại — chờ 30 giây là xong.
 */
export async function datLaiTotpChu(
  env: Env,
  yc: YeuCauDatLaiTotpChu,
  bay_gio: number,
): Promise<KetQuaDatLaiTotpChu> {
  const db = env.DB;

  const ws = await db
    .prepare('SELECT ten_chu FROM workspace WHERE id = ?')
    .bind(yc.workspace_id)
    .first<{ ten_chu: string }>();
  if (ws === null) throw new BatonError('NOT_FOUND', { message: 'Không có workspace này.' });

  const dong = await taiKhoanChu(db, yc.workspace_id);
  if (dong === null) {
    throw new BatonError('NOT_FOUND', {
      message: 'Chưa thiết lập tài khoản chủ — dùng đường khởi tạo, không phải đường này.',
    });
  }

  const totp_secret = sinhSecretTotp();

  /*
   * **BAT-16 (d.594): đặt lại TOTP ghi một dòng Nhật ký + một tin Telegram**, trong
   * **cùng batch** với secret mới và lượt huỷ phiên. Số phiên sắp huỷ đếm trước
   * (cùng điều kiện với câu `UPDATE`) — trong cửa ghi nên không lệnh nào chen vào.
   */
  const so_phien = await demPhienChuaHuy(db, yc.workspace_id, null);

  const [, huy] = await db.batch([
    db
      .prepare(
        // `totp_buoc_cuoi` **không có trong SET** — xem khối ghi chú ở trên.
        `UPDATE chu_tai_khoan
            SET totp_secret = ?, cap_nhat_luc = ?
          WHERE workspace_id = ?`,
      )
      .bind(totp_secret, bay_gio, yc.workspace_id),
    db
      .prepare('UPDATE chu_phien SET huy_luc = ? WHERE workspace_id = ? AND huy_luc IS NULL')
      .bind(bay_gio, yc.workspace_id),
    ...cauLenhSuKienBaoMat(db, yc.workspace_id, 'dat_lai_totp', {
      luc: bay_gio,
      thiet_bi: nhanThietBi(yc.ua ?? null),
      qua_token_chu: true,
      so_phien,
    }),
  ]);

  return {
    otpauth: uriOtpauth({ secret_base32: totp_secret, ten: yc.ten ?? ws.ten_chu }),
    so_phien_da_huy: huy?.meta.changes ?? 0,
    dat_lai_luc: bay_gio,
  };
}

/**
 * Số phiên **chưa huỷ** của chủ (trừ `bam_tru` nếu có) — đúng tập mà các câu huỷ
 * phiên đặt `huy_luc` (kể cả phiên đã hết hạn mà chưa huỷ). Dùng để chữ của tin
 * bảo mật nói đúng con số, khi câu `UPDATE` nằm trong cùng batch với dòng tin.
 */
async function demPhienChuaHuy(
  db: D1Database,
  workspace_id: string,
  bam_tru: string | null,
): Promise<number> {
  const d = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM chu_phien
        WHERE workspace_id = ? AND huy_luc IS NULL AND (? IS NULL OR bam <> ?)`,
    )
    .bind(workspace_id, bam_tru, bam_tru)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

/* ------------------------------------------------------------------ *
 * Đăng nhập — một bước, hai yếu tố
 * ------------------------------------------------------------------ */

/**
 * Muối và secret **giả** để làm việc vô ích khi không có tài khoản.
 *
 * Không có chúng thì "chưa thiết lập" trả lời nhanh hơn "sai mật khẩu" đúng bằng
 * một lượt PBKDF2 — tức một kênh nói ra *máy chủ này đã có chủ hay chưa*, và với
 * đường thiết lập ở trên thì đó là thông tin đáng giá. Không phải bí mật, nên
 * khai thẳng ở đây.
 */
const MUOI_GIA = '00000000000000000000000000000000';
const SECRET_GIA = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/**
 * **Đăng nhập: mật khẩu + mã TOTP trong MỘT request.**
 *
 * Hai lớp vẫn là hai yếu tố (d.415 "2 lớp"): chữ "2 lớp" nói về *hai thứ phải
 * có*, không về *hai request*. Làm một bước thì không sinh ra một "token giữa
 * chừng" (đã qua mật khẩu, chưa qua TOTP) — mà một token như vậy là một bí mật
 * mới phải bảo vệ, có hạn riêng, và là đúng chỗ mà hai lớp bị rút thành một nếu
 * cài sai. SPEC **không** đòi hai bước ở đâu; xem `cau-hoi-spec.md`.
 *
 * ## Thời gian trả lời: hai ca sai làm CÙNG LƯỢNG VIỆC
 *
 * Mã TOTP **luôn** được kiểm, kể cả khi mật khẩu đã sai; và mật khẩu **luôn**
 * được băm, kể cả khi mã TOTP sai hình dạng. Kết luận chỉ được hợp lại ở cuối.
 * Thoát sớm ở nhánh mật khẩu sai sẽ làm "mật khẩu đúng, mã sai" chậm hơn hẳn
 * "mật khẩu sai" — và chênh lệch đó là một oracle nói ra mật khẩu đã đúng, đúng
 * cái điều mà một thông điệp lỗi duy nhất tồn tại để che.
 */
export async function dangNhapChu(
  env: Env,
  yc: YeuCauDangNhapChu,
  bay_gio: number,
): Promise<KetQuaDangNhapChu> {
  const db = env.DB;
  const { buoc } = await quaHaiLop(env, yc.workspace_id, yc.mat_khau, yc.ma_totp, bay_gio, () =>
    'Quá nhiều lần đăng nhập sai. Thử lại sau.',
  );

  const id_phien = sinhIdPhien();
  const bam = await bamIdPhien(id_phien);
  const het_luc = bay_gio + PHIEN_CHU_MS;

  /*
   * Một `batch()`: phiên mới, mốc bước TOTP, và bộ đếm sai về 0 — **cùng thành
   * hoặc cùng hỏng**. Tách ra thì có hai trạng thái sai không sửa được: phiên đã
   * phát mà `totp_buoc_cuoi` chưa nhích (cùng mã đó đăng nhập lần nữa được — đúng
   * luật chống dùng lại vừa cài), hay mốc đã nhích mà phiên không ghi (chủ nhập
   * đúng mà vẫn bị từ chối, và phải chờ 30 giây cho mã sau).
   */
  await db.batch([
    db
      .prepare(
        `INSERT INTO chu_phien
           (bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua)
         VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(
        bam,
        yc.workspace_id,
        bay_gio,
        het_luc,
        bay_gio,
        // Cắt ngắn theo CHECK của 0017; thiếu header thì NULL.
        yc.ua === undefined || yc.ua === '' ? null : yc.ua.slice(0, 300),
      ),
    db
      .prepare(
        `UPDATE chu_tai_khoan
            SET totp_buoc_cuoi = ?, so_lan_sai = 0, khoa_den_luc = NULL,
                dang_nhap_cuoi_luc = ?, cap_nhat_luc = ?
          WHERE workspace_id = ?`,
      )
      .bind(buoc, bay_gio, bay_gio, yc.workspace_id),
  ]);

  return { id_phien, het_luc };
}

/**
 * **Hai lớp của d.415 + hạn mức chống dò** — phần chung của đăng nhập và đổi mật
 * khẩu (BAT-11).
 *
 * Tách ra từ `dangNhapChu` để đường đổi mật khẩu dùng **đúng** cùng một lượt
 * kiểm và **đúng** cùng một bộ đếm (`so_lan_sai`, `khoa_den_luc`, `khoaBaoLauMs`),
 * không một bản chép: hai bản của cùng một luật là hai chỗ để lệch, và một bản
 * lệch ở đường đổi mật khẩu là một cửa dò mật khẩu đi vòng qua hạn mức.
 *
 * Trả về khi **cả hai lớp đúng**, kèm bước TOTP vừa dùng (người gọi phải ghi nó
 * vào `totp_buoc_cuoi` trong cùng batch ghi kết quả). Còn lại ném:
 *   * đang khoá → `RATE_LIMITED` kèm `retryAfter` (câu do người gọi dựng);
 *   * sai bất kỳ lớp nào, hoặc chưa có tài khoản → nhích bộ đếm rồi
 *     `loiDangNhapSai()` — **một** lỗi cho mọi ca sai.
 */
async function quaHaiLop(
  env: Env,
  workspace_id: string,
  mat_khau_tho: unknown,
  ma_totp_tho: unknown,
  bay_gio: number,
  cauKhoa: (giay_cho: number) => string,
  /**
   * Câu lệnh **thêm** vào cùng batch với lần nhích bộ đếm, theo giá trị bộ đếm
   * **sau** khi nhích (BAT-16: cảnh báo nhập sai liên tiếp ở đường đổi mật khẩu).
   * Đăng nhập không truyền gì — hành vi của nó giữ nguyên.
   */
  khiSai: (so_lan_sai: number) => D1PreparedStatement[] = () => [],
): Promise<{ dong: DongTaiKhoanChu; buoc: number }> {
  const db = env.DB;
  const dong = await taiKhoanChu(db, workspace_id);

  /* **Đang khoá** — hạn mức chống dò. Trả 429 kèm `Retry-After`, không 401: đây
   * không phải "giấy tờ sai", và nói "chờ bao lâu" không hé ra gì về mật khẩu. */
  if (dong !== null && dong.khoa_den_luc !== null && dong.khoa_den_luc > bay_gio) {
    const giay = Math.ceil((dong.khoa_den_luc - bay_gio) / 1000);
    throw new BatonError('RATE_LIMITED', { retryAfter: giay, message: cauKhoa(giay) });
  }

  const mat_khau = typeof mat_khau_tho === 'string' ? mat_khau_tho : '';
  const ma_totp = laHinhMaTotp(ma_totp_tho) ? ma_totp_tho : '';

  // Cả hai phép kiểm **luôn** chạy — xem khối ghi chú trên.
  const nguon: MatKhauDaBam = dong ?? {
    mat_khau_bam: '',
    muoi: MUOI_GIA,
    so_vong: soVongHienHanh(env),
  };
  const mat_khau_dung = await kiemMatKhau(mat_khau, nguon);
  const totp = await kiemTotp(
    dong?.totp_secret ?? SECRET_GIA,
    ma_totp,
    bay_gio,
    dong?.totp_buoc_cuoi ?? null,
  );

  const buoc = totp.buoc;
  const dat = dong !== null && mat_khau_dung && totp.dung && buoc !== null;

  if (!dat) {
    /* **Bộ đếm nhích cho CẢ HAI lớp sai — đã cân nhắc và GIỮ NGUYÊN.**
     *
     * Hướng kia (chỉ mật khẩu sai mới nhích, mã TOTP sai thì không) làm hạn mức
     * bớt dễ bị một kẻ lạ dùng để khoá chủ ra ngoài. Nhưng nó **mâu thuẫn trực
     * tiếp** với luật mạnh hơn của d.415: hai lớp phải không phân biệt được từ
     * ngoài. Bộ đếm **quan sát được từ ngoài** — nó quyết định lần thử thứ 6 ra
     * 401 hay 429 — nên "mã sai không nhích bộ đếm" biến chính bộ đếm thành một
     * oracle: gửi 6 lần cùng một mật khẩu đoán với mã TOTP bất kỳ, thấy 429 là
     * mật khẩu **sai**, không thấy 429 là mật khẩu **đúng**. Đó đúng là thứ mà
     * một thông điệp lỗi duy nhất và hai nhánh cùng-lượng-việc tồn tại để che,
     * và nó rò ra **mật khẩu** — thứ đắt hơn hẳn một lần bị khoá 15 phút.
     *
     * Che oracle đó thì phải giả một bộ đếm thứ hai y như thật, tức là có hai bộ
     * đếm mà một cái vô nghĩa. Nên: giữ nguyên, và trả tiền ở chỗ khác — đường
     * `moKhoaChu` qua `TOKEN_CHU` là cửa thoát khi bị khoá, và `cau-hoi-spec.md`
     * #98 khai thẳng xung đột này cho Chủ chốt.
     *
     * Ghi một lần sai: bộ đếm nhích, và khoá được đặt khi vượt ngưỡng.
     * Không có tài khoản thì không có dòng nào để ghi — và không tạo dòng nào:
     * một bảng tự mọc dòng theo request của người lạ là một đường bơm dữ liệu. */
    if (dong !== null) {
      const sai = dong.so_lan_sai + 1;
      const khoa = khoaBaoLauMs(sai);
      await db.batch([
        db
          .prepare(
            `UPDATE chu_tai_khoan
                SET so_lan_sai = ?, sai_cuoi_luc = ?, khoa_den_luc = ?, cap_nhat_luc = ?
              WHERE workspace_id = ?`,
          )
          .bind(sai, bay_gio, khoa === 0 ? null : bay_gio + khoa, bay_gio, workspace_id),
        ...khiSai(sai),
      ]);
    }
    throw loiDangNhapSai();
  }

  return { dong, buoc };
}

/* ------------------------------------------------------------------ *
 * Đổi mật khẩu — BAT-11, chủ đang đăng nhập web
 * ------------------------------------------------------------------ */

export interface YeuCauDoiMatKhauChu {
  workspace_id: string;
  /**
   * Băm cookie của **phiên đang gọi** — phiên duy nhất được giữ lại. Route chỉ
   * điền nó từ nhánh cookie của `xacThuc`; không có cookie thì không tới được đây.
   */
  bam_hien_tai: string;
  mat_khau_cu: unknown;
  ma_totp: unknown;
  mat_khau_moi: unknown;
  /** User-Agent của request — chỉ để rút **nhãn** thiết bị cho dòng Nhật ký (BAT-16). */
  ua?: string | undefined;
}

/** Câu 422 khi mật khẩu mới trùng mật khẩu hiện tại (CoS chốt 17/10, #148). */
export const CAU_MAT_KHAU_TRUNG = 'Mật khẩu mới phải khác mật khẩu hiện tại.';

export interface KetQuaDoiMatKhauChu {
  /** Số phiên **khác** phiên hiện tại vừa bị huỷ. */
  so_phien_khac_da_huy: number;
  doi_luc: number;
}

/** Câu 429 của đường đổi mật khẩu — nói **bao lâu**, để giao diện in thẳng ra. */
export function cauKhoaDoiMatKhau(giay_cho: number): string {
  return `Quá nhiều lần nhập sai mật khẩu hoặc mã xác thực. Thử lại sau ${String(giay_cho)} giây.`;
}

/**
 * **Đổi mật khẩu của chủ** — đòi mật khẩu cũ **và** mã TOTP (đủ hai lớp d.425),
 * rồi đặt mật khẩu mới và **huỷ mọi phiên khác**.
 *
 * ## Thứ tự: luật độ dài TRƯỚC hai lớp
 *
 * Phán quyết "mật khẩu mới không hợp lệ" chỉ phụ thuộc **thứ người gọi tự gửi**
 * (độ dài của chính chuỗi họ gõ) và luật công khai `laHinhMatKhau` — nên trả nó
 * trước không hé ra gì về bí mật nào. Làm ngược lại (hai lớp trước, độ dài sau)
 * thì `422` chỉ ra được khi mật khẩu cũ **và** mã đều đúng: một oracle "đã đoán
 * đúng" **không để lại dấu gì** (không phiên nào bị huỷ, mật khẩu không đổi),
 * khác hẳn một lần thành công thật. Thêm một lợi ích cho chủ: gõ sai độ dài
 * không tiêu mất mã TOTP của cửa sổ đó và không nhích bộ đếm.
 *
 * ## Hai lớp: đúng cùng một hàm, cùng một bộ đếm với đăng nhập
 *
 * `quaHaiLop` — mật khẩu cũ **luôn** băm, TOTP **luôn** kiểm, một thông điệp lỗi
 * (`loiDangNhapSai`) cho mọi ca sai, bộ đếm `so_lan_sai`/`khoa_den_luc` **dùng
 * chung** với `/v1/dang-nhap` (`cau-hoi-spec.md` #98). Nên sai ở đây cũng làm đăng
 * nhập bị khoá, và ngược lại: tách hai bộ đếm là cho người giữ một cookie trộm
 * thêm 5 lần đoán mỗi chu kỳ khoá.
 *
 * ## Một batch
 *
 * Mật khẩu mới (muối mới, số vòng hiện hành), mốc TOTP vừa dùng, bộ đếm về 0, và
 * `huy_luc` cho mọi phiên **khác** — cùng thành hoặc cùng hỏng. Tách ra thì có
 * trạng thái "mật khẩu đã đổi mà phiên lạ vẫn sống" — đúng thứ chủ đổi mật khẩu
 * để cắt.
 *
 * `so_vong` = `max(số vòng của dòng, soVongHienHanh)`: trigger
 * `tg_chu_tai_khoan_so_vong_chi_tang` chặn mọi lần hạ, nên một dòng đặt ở mức
 * cao hơn mức hiện hành (binding đổi giữa chừng) sẽ làm cả batch nổ thành 500.
 * Bình thường hai số bằng nhau và đó là `soVongHienHanh`.
 *
 * ## Nhật ký + tin Telegram (19.12 câu 3, d.594) — BAT-16, `cau-hoi-spec.md` #148
 *
 *   * **Thành công** → một dòng `nhat_ky` + một tin bảo mật trong **cùng batch**
 *     (`cauLenhSuKienBaoMat`), cùng điều kiện "phiên còn sống".
 *   * **Sai** (mật khẩu cũ hoặc mã) khi bộ đếm `so_lan_sai` **sau khi nhích** ≥ 3
 *     → một dòng `nhat_ky` + một tin cảnh báo, cùng batch với lần nhích bộ đếm.
 *     Chính sách chống spam ở `canCanhBaoSai` (`@baton/shared`).
 *
 * ## Mật khẩu mới trùng mật khẩu hiện tại → 422 (CoS chốt 17/10)
 *
 * Kiểm **sau** hai lớp: chỉ ai đã chứng minh biết mật khẩu hiện tại mới được biết
 * "mật khẩu mới trùng" — kiểm trước thì nó là một oracle đoán mật khẩu không qua
 * hạn mức. So bằng `kiemMatKhau` (PBKDF2 + so sánh hằng thời gian của
 * `@baton/shared`) với băm đang lưu — không giữ, không so chuỗi rõ nào. Từ chối
 * thì **không đổi mật khẩu, không huỷ phiên, không ghi Nhật ký/tin** — nhưng
 * (BAT-17) ghi đúng hệ quả của một lần qua hai lớp: bộ đếm `so_lan_sai` về 0,
 * bỏ khoá, và **tiêu** bước TOTP vừa dùng (`totp_buoc_cuoi`) để mã đó không
 * dùng lại được trong cửa sổ của nó. Chủ thử lại thì dùng mã của bước sau.
 */
export async function doiMatKhauChu(
  env: Env,
  yc: YeuCauDoiMatKhauChu,
  bay_gio: number,
): Promise<KetQuaDoiMatKhauChu> {
  const db = env.DB;

  if (typeof yc.bam_hien_tai !== 'string' || yc.bam_hien_tai.length !== 64) {
    // Route không bao giờ gửi tới đây mà thiếu phiên; còn tới thì là bug, chặn kín.
    throw new BatonError('FORBIDDEN', {
      message: 'Đổi mật khẩu chỉ làm được từ một phiên đăng nhập web.',
    });
  }

  if (!laHinhMatKhau(yc.mat_khau_moi)) {
    throw new BatonError('INVALID_INPUT', {
      message: `Mật khẩu mới phải dài từ ${String(MAT_KHAU_DAI_TOI_THIEU)} tới ${String(MAT_KHAU_DAI_TOI_DA)} ký tự.`,
    });
  }
  const mat_khau_moi = yc.mat_khau_moi;

  /*
   * **Phiên đang gọi phải còn sống — kiểm TRONG cửa ghi, TRƯỚC hai lớp.**
   *
   * Middleware đã tra cookie ở Worker, nhưng giữa lúc đó và lúc lệnh này tới lượt
   * trong hàng đợi của DO, một lệnh "đăng xuất mọi nơi" (hay đặt lại TOTP) có thể
   * đã chạy trước. Không kiểm lại thì một cookie **vừa bị huỷ** vẫn đổi được mật
   * khẩu và — tệ hơn — được giữ lại làm "phiên hiện tại" duy nhất.
   *
   * Kiểm **trước** `quaHaiLop`: phiên chết thì không băm mật khẩu, không tiêu
   * bước TOTP, không nhích bộ đếm. Trả đúng 401 và đúng câu của middleware cho
   * cookie chết — không phân biệt "đã huỷ" với "hết hạn" (xem `phienChuConSong`).
   *
   * Vì sao một lần kiểm ở đây là đủ: **mọi** đường ghi lên `chu_phien` (đăng nhập,
   * đăng xuất, đặt lại TOTP, chạm phiên, đổi mật khẩu) đều đi qua `#xepHang` của
   * cùng một DO, nên không lệnh nào chen được giữa lần kiểm này và batch dưới.
   * Batch vẫn mang điều kiện `EXISTS` cùng nội dung (`DIEU_KIEN_PHIEN_SONG`) —
   * phòng một đường ghi tương lai quên đi qua cửa ghi: khi đó batch thành không
   * làm gì thay vì đổi mật khẩu cho một phiên chết.
   */
  if (!(await phienConSongTrongWs(db, yc.bam_hien_tai, yc.workspace_id, bay_gio))) {
    throw loiPhienChet();
  }

  const thiet_bi = nhanThietBi(yc.ua ?? null);

  const { dong, buoc } = await quaHaiLop(
    env,
    yc.workspace_id,
    yc.mat_khau_cu,
    yc.ma_totp,
    bay_gio,
    cauKhoaDoiMatKhau,
    (sai) =>
      canCanhBaoSai(sai)
        ? cauLenhSuKienBaoMat(db, yc.workspace_id, 'sai_lien_tiep', {
            luc: bay_gio,
            thiet_bi,
            so_lan_sai: sai,
          })
        : [],
  );

  if (await kiemMatKhau(mat_khau_moi, dong)) {
    /*
     * BAT-17: người gọi **đã qua đủ hai lớp** — nên đây là một lần chứng minh
     * đúng, không phải một lần sai. Ghi đúng hai việc mà một lần qua hai lớp
     * luôn ghi (y như đăng nhập), và **chỉ** hai việc đó:
     *
     *   * `so_lan_sai = 0, khoa_den_luc = NULL` — không reset thì vài lần gõ
     *     nhầm trước đó còn treo trên bộ đếm, và một lần gõ nhầm *sau* lại bắn
     *     cảnh báo "3 lần sai liên tiếp" cho một chuỗi mà chủ đã cắt bằng một
     *     lần đúng.
     *   * `totp_buoc_cuoi = buoc` — **tiêu** mã vừa dùng. Mã đã được chứng minh
     *     đúng; để nó sống thì cùng một mã (nhìn trộm, chặn được) còn dùng lại
     *     được trong cửa sổ của nó — đúng thứ mốc này sinh ra để loại. Giá: chủ
     *     thử lại với mật khẩu mới khác phải chờ mã của bước sau (≤ 30 giây),
     *     y như sau một lần đăng nhập.
     *
     * Không đổi mật khẩu, không huỷ phiên nào, không ghi Nhật ký/tin: chưa có
     * gì đổi để mà báo. Cùng `DIEU_KIEN_PHIEN_SONG` như batch chính — phiên đã
     * chết giữa chừng thì không ghi gì và trả 401 như batch chính.
     */
    const ghi = await db
      .prepare(
        `UPDATE chu_tai_khoan
            SET totp_buoc_cuoi = ?, so_lan_sai = 0, khoa_den_luc = NULL, cap_nhat_luc = ?
          WHERE workspace_id = ? AND ${DIEU_KIEN_PHIEN_SONG}`,
      )
      .bind(buoc, bay_gio, yc.workspace_id, yc.bam_hien_tai, yc.workspace_id, bay_gio)
      .run();
    if (ghi.meta.changes === 0) throw loiPhienChet();
    throw new BatonError('INVALID_INPUT', { message: CAU_MAT_KHAU_TRUNG });
  }

  const so_phien_khac = await demPhienChuaHuy(db, yc.workspace_id, yc.bam_hien_tai);
  const moi = await datMatKhau(mat_khau_moi, Math.max(dong.so_vong, soVongHienHanh(env)));

  /*
   * Hai câu cùng mang `DIEU_KIEN_PHIEN_SONG` của phiên hiện tại. Câu thứ hai chỉ
   * chạm các phiên **khác** (`bam <> ?`), nên nó không đổi kết quả của điều kiện
   * cho câu thứ nhất: hai câu cùng chạy hoặc cùng không làm gì.
   */
  const ds_song = [yc.bam_hien_tai, yc.workspace_id, bay_gio] as const;
  const [doi, huy] = await db.batch([
    db
      .prepare(
        `UPDATE chu_tai_khoan
            SET mat_khau_bam = ?, muoi = ?, so_vong = ?, totp_buoc_cuoi = ?,
                so_lan_sai = 0, khoa_den_luc = NULL, cap_nhat_luc = ?
          WHERE workspace_id = ? AND ${DIEU_KIEN_PHIEN_SONG}`,
      )
      .bind(moi.mat_khau_bam, moi.muoi, moi.so_vong, buoc, bay_gio, yc.workspace_id, ...ds_song),
    db
      .prepare(
        `UPDATE chu_phien SET huy_luc = ?
          WHERE workspace_id = ? AND huy_luc IS NULL AND bam <> ? AND ${DIEU_KIEN_PHIEN_SONG}`,
      )
      .bind(bay_gio, yc.workspace_id, yc.bam_hien_tai, ...ds_song),
    // BAT-16: Nhật ký + tin bảo mật, cùng điều kiện "phiên hiện tại còn sống" —
    // batch không đổi gì thì cũng không ghi sự kiện nào.
    ...cauLenhSuKienBaoMat(
      db,
      yc.workspace_id,
      'doi_mat_khau',
      { luc: bay_gio, thiet_bi, so_phien: so_phien_khac },
      { sql: DIEU_KIEN_PHIEN_SONG, tham_so: ds_song },
    ),
  ]);

  if ((doi?.meta.changes ?? 0) === 0) throw loiPhienChet();

  return { so_phien_khac_da_huy: huy?.meta.changes ?? 0, doi_luc: bay_gio };
}

/**
 * "Phiên `bam` còn sống trong workspace này" — dạng điều kiện SQL, ba tham số
 * theo thứ tự `bam`, `workspace_id`, `bay_gio`. Cùng nội dung với
 * `CAU_TRA_PHIEN_CHU` (cộng điều kiện workspace).
 */
const DIEU_KIEN_PHIEN_SONG = `EXISTS (SELECT 1 FROM chu_phien p
   WHERE p.bam = ? AND p.workspace_id = ? AND p.huy_luc IS NULL AND p.het_luc > ?)`;

async function phienConSongTrongWs(
  db: D1Database,
  bam: string,
  workspace_id: string,
  bay_gio: number,
): Promise<boolean> {
  const d = await db
    .prepare(`SELECT ${DIEU_KIEN_PHIEN_SONG} AS song`)
    .bind(bam, workspace_id, bay_gio)
    .first<{ song: number }>();
  return d?.song === 1;
}

/** Cùng mã, cùng câu với middleware khi cookie đã chết (`xac-thuc.ts`). */
function loiPhienChet(): BatonError {
  return new BatonError('INVALID_TOKEN', {
    message: 'Phiên đăng nhập không còn hiệu lực. Đăng nhập lại.',
  });
}

/* ------------------------------------------------------------------ *
 * Lần dùng cuối của một phiên — ghi THEO NHỊP (BAT-11)
 * ------------------------------------------------------------------ */

/** Ghi `dung_cuoi_luc` tối đa một lần mỗi khoảng này cho mỗi phiên. */
export const NHIP_GHI_DUNG_CUOI_MS = 60 * 60_000;

/**
 * Có cần ghi lại `dung_cuoi_luc` không: chưa có mốc, hoặc mốc **cũ hơn** một nhịp.
 * Hàm thuần — middleware gọi nó với giá trị vừa đọc ở lượt tra phiên (không thêm
 * truy vấn nào), nên request bình thường **không** đi tới cửa ghi.
 */
export function canGhiDungCuoi(dung_cuoi_luc: number | null, bay_gio: number): boolean {
  return dung_cuoi_luc === null || bay_gio - dung_cuoi_luc > NHIP_GHI_DUNG_CUOI_MS;
}

export interface YeuCauChamPhienChu {
  workspace_id: string;
  bam: string;
}

/**
 * Ghi `dung_cuoi_luc = bây giờ` cho một phiên **còn sống**, nếu mốc cũ hơn một
 * nhịp. Điều kiện nhịp được kiểm **lại trong câu `UPDATE`**: hai request song
 * song cùng thấy mốc cũ thì lượt thứ hai không ghi gì (0 dòng), không phải hai
 * lần ghi. Phiên đã huỷ/hết hạn không bị chạm — `huy_luc` một chiều, và một phiên
 * chết không có "lần dùng" nào.
 */
export async function chamPhienChu(
  env: Env,
  yc: YeuCauChamPhienChu,
  bay_gio: number,
): Promise<{ da_ghi: boolean }> {
  const kq = await env.DB.prepare(
    `UPDATE chu_phien SET dung_cuoi_luc = ?
      WHERE bam = ? AND workspace_id = ? AND huy_luc IS NULL AND het_luc > ?
        AND (dung_cuoi_luc IS NULL OR dung_cuoi_luc < ?)`,
  )
    .bind(bay_gio, yc.bam, yc.workspace_id, bay_gio, bay_gio - NHIP_GHI_DUNG_CUOI_MS)
    .run();
  return { da_ghi: kq.meta.changes > 0 };
}

/* ------------------------------------------------------------------ *
 * Mở khoá — đường thoát của chủ khi bị khoá ra ngoài
 * ------------------------------------------------------------------ */

/**
 * **Đặt lại bộ đếm thử sai và bỏ khoá.** Đường thoát duy nhất của chủ.
 *
 * ## Vì sao nó buộc phải có
 *
 * `/v1/dang-nhap` là đường **công khai** và **không** đi qua bộ đếm 600 req/phút
 * (`xac-thuc.ts` đã khai). `so_lan_sai` thì tăng **không trần**: khoá hết hạn,
 * một request sai nữa là khoá lại 15 phút. Nên một kẻ **không biết mật khẩu**,
 * chỉ cần lặp mãi một mật khẩu sai, giữ được tài khoản trong trạng thái khoá
 * **vô hạn** — tức khoá chính chủ ra ngoài vĩnh viễn. Hạn mức chống dò, không có
 * cửa thoát, chính là một đường từ chối dịch vụ nhắm vào **một** người dùng duy
 * nhất của hệ (`cau-hoi-spec.md` #98 có hệ quả này).
 *
 * ## Vì sao nó không phải một cửa hậu
 *
 * Canh bằng **`TOKEN_CHU`** và chỉ `TOKEN_CHU` (route ở `index.ts`, cùng nếp
 * `/v1/chu/thiet-lap`), `TOKEN_CHU` rỗng = **không đường nào vào** (fail-closed).
 * Và nó **không chạm** `mat_khau_bam`, `muoi`, `so_vong`, `totp_secret`,
 * `totp_buoc_cuoi`: sau khi mở khoá, chủ vẫn phải đi qua **đủ hai lớp** của
 * d.415. Nó chỉ gỡ cái đồng hồ, không gỡ một yếu tố nào. Một cookie phiên
 * **không** vào được — ai đang có phiên thì không bị khoá ra ngoài, nên nhánh đó
 * chỉ thêm bề mặt mà không cứu ai.
 */
export async function moKhoaChu(
  env: Env,
  yc: YeuCauMoKhoaChu,
  bay_gio: number,
): Promise<KetQuaMoKhoaChu> {
  const db = env.DB;
  const dong = await taiKhoanChu(db, yc.workspace_id);
  if (dong === null) {
    throw new BatonError('NOT_FOUND', { message: 'Chưa thiết lập tài khoản chủ.' });
  }

  await db
    .prepare(
      `UPDATE chu_tai_khoan
          SET so_lan_sai = 0, khoa_den_luc = NULL, cap_nhat_luc = ?
        WHERE workspace_id = ?`,
    )
    .bind(bay_gio, yc.workspace_id)
    .run();

  return {
    dang_bi_khoa: dong.khoa_den_luc !== null && dong.khoa_den_luc > bay_gio,
    so_lan_sai_truoc: dong.so_lan_sai,
  };
}

/* ------------------------------------------------------------------ *
 * Đăng xuất — một phiên, hoặc mọi nơi (d.415)
 * ------------------------------------------------------------------ */

/**
 * Huỷ phiên hiện tại, hoặc **mọi** phiên của chủ (d.415 "nút đăng xuất mọi nơi").
 *
 * Đặt `huy_luc`, **không xoá dòng**: dấu vết (d.418), và `DELETE` thuộc danh sách
 * cấm `CLAUDE.md` mục 4. `huy_luc IS NULL` trong `WHERE` để một phiên đã huỷ
 * không bị ghi lại mốc mới — trigger `tg_chu_phien_huy_mot_chieu` của 0017 chặn
 * nó ở tầng DB, và câu `WHERE` này giữ cho lệnh không nổ vì chuyện đó.
 */
export async function dangXuatChu(
  env: Env,
  yc: YeuCauDangXuatChu,
  bay_gio: number,
): Promise<KetQuaDangXuatChu> {
  const db = env.DB;

  if (yc.moi_noi) {
    /*
     * BAT-16: "đăng xuất mọi nơi" ghi một dòng Nhật ký + một tin bảo mật, **cùng
     * batch** với lượt huỷ — kể cả khi không còn phiên nào để huỷ: lệnh vẫn là một
     * hành động của chủ (hoặc của ai đó đang cầm phiên/token của chủ), và đó đúng là
     * thứ chủ cần biết. Nguồn ghi theo `qua_token_chu` — cờ của **cách xác thực
     * thật** do middleware đặt — không suy từ `bam` (BAT-17).
     */
    const so_phien = await demPhienChuaHuy(db, yc.workspace_id, null);
    const [kq] = await db.batch([
      db
        .prepare(
          `UPDATE chu_phien SET huy_luc = ?
            WHERE workspace_id = ? AND huy_luc IS NULL`,
        )
        .bind(bay_gio, yc.workspace_id),
      ...cauLenhSuKienBaoMat(db, yc.workspace_id, 'dang_xuat_moi_noi', {
        luc: bay_gio,
        thiet_bi: nhanThietBi(yc.ua ?? null),
        qua_token_chu: yc.qua_token_chu,
        so_phien,
      }),
    ]);
    return { so_phien_da_huy: kq?.meta.changes ?? 0 };
  }

  if (yc.bam === null) return { so_phien_da_huy: 0 };

  const kq = await db
    .prepare(
      `UPDATE chu_phien SET huy_luc = ?
        WHERE bam = ? AND workspace_id = ? AND huy_luc IS NULL`,
    )
    .bind(bay_gio, yc.bam, yc.workspace_id)
    .run();
  return { so_phien_da_huy: kq.meta.changes };
}

/* ------------------------------------------------------------------ *
 * Tra một phiên — đường ĐỌC, chạy ở Worker trong mọi request
 * ------------------------------------------------------------------ */

/**
 * Câu tra phiên theo băm cookie. **Đúng một lần tra khoá**: `bam` là khoá chính
 * của `chu_phien`, và hai điều kiện còn lại (`huy_luc`, `het_luc`) nằm trong
 * cùng câu, trên đúng dòng đó.
 *
 * Để riêng thành hằng (chứ không viết thẳng trong hàm) để ca test
 * `EXPLAIN QUERY PLAN` đo **đúng câu mà sản phẩm chạy** — nếp đã chốt ở
 * `quyet-dinh.md` cho `cauLenhDanhSachTicket`.
 */
export const CAU_TRA_PHIEN_CHU = `SELECT workspace_id, het_luc, dung_cuoi_luc FROM chu_phien
   WHERE bam = ? AND huy_luc IS NULL AND het_luc > ?`;

/** Một dòng phiên còn sống, đúng các cột của `CAU_TRA_PHIEN_CHU`. */
export interface PhienChuSong {
  workspace_id: string;
  het_luc: number;
  /** Đọc **kèm** trong cùng lượt tra (không thêm truy vấn) để quyết định ghi theo nhịp. */
  dung_cuoi_luc: number | null;
}

/**
 * Phiên đăng nhập còn sống của một băm cookie, hoặc `null`.
 *
 * `null` cho **cả ba** ca (không có, đã huỷ, đã hết hạn) và người gọi trả 401 cho
 * cả ba: phân biệt chúng là nói cho người giữ một cookie cũ biết nó *từng* đúng.
 *
 * **Hàm này vẫn chỉ ĐỌC.** Cookie tới trong *mọi* request của web, nên một
 * `UPDATE` tại đây là một lượt ghi cho **mỗi** lần tải trang. Từ BAT-11 lần dùng
 * cuối được ghi **theo nhịp** ở middleware `chamPhienChuTheoNhip`
 * (`cham-phien-chu.ts`): nó đọc `dung_cuoi_luc` mà câu này trả **kèm**, và chỉ
 * đi tới cửa ghi khi mốc cũ hơn `NHIP_GHI_DUNG_CUOI_MS`.
 */
export async function phienChuConSong(
  db: D1Database,
  bam: string,
  bay_gio: number,
): Promise<PhienChuSong | null> {
  return db.prepare(CAU_TRA_PHIEN_CHU).bind(bam, bay_gio).first<PhienChuSong>();
}

/* ------------------------------------------------------------------ *
 * Danh sách phiên đang mở — BAT-11, trang Cài đặt
 * ------------------------------------------------------------------ */

/**
 * Một phiên đang mở, **như nó ra API**.
 *
 * **Không có `bam`, không có id nào** (d.427): `bam` là khoá chính của dòng và
 * là SHA-256 của cookie — không dùng được *như* cookie, nhưng nó là danh tính duy
 * nhất của dòng, và 0017 đã chốt "chỗ nào lỡ trả id ra API là chỗ ấy phát một
 * thứ gần-như-cookie". Màn hình không cần trỏ vào từng phiên (không có nút "đăng
 * xuất phiên này" ở lượt này), nên không có lý do gì để mang nó ra.
 */
export interface PhienChuRa {
  tao_luc: number;
  het_luc: number;
  dung_cuoi_luc: number | null;
  /** Nhãn ngắn rút từ User-Agent (vd "Chrome · macOS"); `null` khi không có UA. */
  thiet_bi: string | null;
  /** Chuỗi User-Agent đã lưu (≤ 300 ký tự, 0017) — để chủ đọc khi nhãn không đủ. */
  ua: string | null;
  /** Đây có phải phiên của chính request này không. */
  hien_tai: boolean;
}

/**
 * Nhãn "trình duyệt · hệ điều hành" từ một chuỗi User-Agent. Rút gọn **thô**, có
 * chủ ý: đây là nhãn để chủ nhận ra máy của mình, không phải một bộ phân tích UA.
 * Thứ tự dò quan trọng — UA của Edge chứa "Chrome", UA của Chrome chứa "Safari".
 */
export function nhanThietBi(ua: string | null): string | null {
  if (ua === null || ua === '') return null;
  const trinh_duyet = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  const he = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  const phan = [trinh_duyet, he].filter((x): x is string => x !== null);
  return phan.length === 0 ? 'Không rõ thiết bị' : phan.join(' · ');
}

/**
 * Các phiên **còn sống** của chủ (`huy_luc IS NULL AND het_luc > bây giờ`), mới
 * nhất trước. Đường đọc, chạy thẳng D1 (nếp "đọc không qua cửa ghi").
 *
 * Không phân trang: số phiên sống bị chặn bởi số lần đăng nhập **thành công**
 * trong 30 ngày, mà mỗi lần cần đủ hai lớp và một bước TOTP chưa tiêu.
 *
 * `bam_hien_tai` chỉ dùng để **so** — nó không bao giờ đi ra thân.
 */
export async function lietKePhienChu(
  db: D1Database,
  workspace_id: string,
  bam_hien_tai: string | null,
  bay_gio: number,
): Promise<PhienChuRa[]> {
  const { results } = await db
    .prepare(
      `SELECT bam, tao_luc, het_luc, dung_cuoi_luc, tao_tu_ua FROM chu_phien
        WHERE workspace_id = ? AND huy_luc IS NULL AND het_luc > ?
        ORDER BY tao_luc DESC`,
    )
    .bind(workspace_id, bay_gio)
    .all<{
      bam: string;
      tao_luc: number;
      het_luc: number;
      dung_cuoi_luc: number | null;
      tao_tu_ua: string | null;
    }>();
  // Dựng từng trường một — **không** spread dòng: spread là cách `bam` lọt ra.
  return results.map((d) => ({
    tao_luc: d.tao_luc,
    het_luc: d.het_luc,
    dung_cuoi_luc: d.dung_cuoi_luc,
    thiet_bi: nhanThietBi(d.tao_tu_ua),
    ua: d.tao_tu_ua,
    hien_tai: bam_hien_tai !== null && d.bam === bam_hien_tai,
  }));
}

/** Bước TOTP của một mốc — tiện cho test và cho đường chẩn đoán. */
export { buocTotp };
