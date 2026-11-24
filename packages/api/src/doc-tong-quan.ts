/**
 * **Trang Tổng quan** — SPEC mục 11 d.315–320, trong **một** lượt gọi.
 *
 * ## Vì sao một đường, không sáu
 *
 * Năm khối của d.317–321 không phải năm danh sách rời: ba trong số chúng là
 * **kết luận nghiệp vụ** có luật riêng và có ngưỡng thời gian —
 *
 *   * chỉ báo sức sống của dự án (mục 2 d.71–74),
 *   * trạng thái agent (mục 3 d.98–103),
 *   * "Cần chú ý" (sáu nguồn của d.321, mỗi nguồn một luật: ngưỡng đứng của mục
 *     6, hạn phản hồi của mục 5, cờ "không ai cầm" của 19.1, `failed` của mục 7,
 *     mốc 24 giờ của d.321).
 *
 * Để giao diện tự ghép từ sáu đường rời thì năm luật đó sống trong component —
 * không có test nào đo được chúng, và web/CLI/MCP mỗi bên sẽ có một bản. Nên
 * chúng ở đây, mỗi luật gọi **đúng một** hàm thuần đã có: `sucSongDuAn`,
 * `trangThaiAgent`/`trangThaiAgentTuPhien`, `laKhongPhanHoi`,
 * `trangThaiPhienDanXuat`. File này **không** viết lại luật nào.
 *
 * ## Chỉ chủ
 *
 * Tổng quan là màn hình của **chủ**: nó gộp mọi dự án, mọi agent, mọi mục Cần
 * Chủ. Cổng nằm **trong hàm** `tongQuan`, không chỉ ở route — một đường HTTP thứ
 * hai trỏ vào cùng dữ liệu sẽ không vô tình mở cửa. Agent gọi → `FORBIDDEN`/403,
 * cùng nếp `GET /v1/toi` (mục 15 d.416: "Agent chỉ dùng token, không đăng nhập
 * web"). Không `NOT_FOUND`: đường này không phải một **đối tượng** nào để che sự
 * tồn tại (mục 13), nó là một màn hình, và `/v1/toi` đã chọn 403 cho đúng tình
 * huống này.
 *
 * ## Số truy vấn là O(1) theo số dự án và số agent
 *
 * Mốc nghiệm thu là 200 dự án + 200.000 ticket (`quyet-dinh.md` 01/10) và
 * "Tổng quan < 1 giây". Nên **không** có vòng `for` nào gọi DB: mỗi khối là một
 * (hoặc một vài) câu gộp, rồi gom trong bộ nhớ. Cụ thể, một lần mở Tổng quan là
 * một số **cố định** câu truy vấn, không phụ thuộc số dự án hay số agent — có ca
 * test đếm số lần `prepare` và ghim trần.
 *
 * Lượt đọc "mọi phiên còn mở" (`phienMoTrongWorkspace`) chạy **một lần** và được
 * ba khối dùng lại (sức sống dự án, Cần chú ý, Đội agent): ba lượt đọc riêng là
 * ba ảnh chụp có thể lệch nhau ngay trong một màn hình.
 *
 * Mọi câu SQL ràng cả `workspace_id` (`quyet-dinh.md`, luật áp cho mọi bảng).
 *
 * ## Đợt 3 (14/10): Tổng quan là màn hình QUẢN LÝ CÔNG VIỆC, không hộp thư
 *
 * Chủ chốt 14/10 và SPEC mục 11 được viết lại: **Cần Chủ không còn là khối 1**.
 * Năm khối của d.316–321 nay là Dự án → Việc đang chạy → Agent đang làm gì → Vừa
 * xong → Cần chú ý, và Cần Chủ chỉ còn một **ô gọn** (`can_chu`, vẫn đúng ba con
 * số của huy hiệu d.248). Bốn thứ mới mà **máy chủ** phải tính, vì d.410 bắt
 * "một lượt gọi, một ảnh chụp" và trang không được tự kết luận:
 *
 *   1. **Thanh tiến độ xong/tổng + bốn con số** của mỗi dự án, và **việc đang
 *      làm nổi bật nhất** (`viec_noi_bat`) — xem `khoiDuAn`.
 *   2. **Việc đang chạy**: thẻ việc của **mọi** dự án ở `in_progress` +
 *      `verifying`, mỗi thẻ kèm **tên** agent đang cầm và mốc "đã cầm từ lúc
 *      nào" — xem `khoiViecDangChay`. Thẻ là **đúng** `TheDanhSachRa` của bảng
 *      việc (d.403), không một hình thứ hai.
 *   3. **Hai cửa sổ của "Vừa xong"** (24 giờ và 7 ngày) trả **cùng một lượt**:
 *      nút đổi cửa sổ của d.320 không được sinh một query thứ hai (d.410).
 *   4. **"Cần chú ý" gom theo ticket**: mỗi ticket đúng **một** dòng, các lý do
 *      thành **nhãn** trên dòng đó — xem `gomTheoTicket`. Và một bằng chứng
 *      trượt đã được một bằng chứng **cùng loại** kết luận Đạt **sau đó** thì
 *      không báo nữa (`nguonBangChungTruot`).
 */

import {
  BatonError,
  GIOI_HAN_WIP_MAC_DINH,
  trangThaiWip,
  type TrangThaiWip,
  NHAN_NGUON_BAO_CAO,
  NHAN_NGUON_REVIEW,
  NHAN_NGUON_XAC_MINH,
  SO_LAN_GUI_TOI_DA,
  hashRutGon,
  laKhongPhanHoi,
  laNguonBaoCao,
  laNguonReview,
  laNguonXacMinhMerged,
  nhan,
  quaHan,
  trangThaiTheoNhom,
  type AiGoi,
  type DatBoi,
  type NguonBaoCao,
  type NguonReview,
  type NguonXacMinhMerged,
  type MucCanChu as MucDoKhan,
  type SucSong,
  type TrangThaiAgent,
  type TrangThaiPhien,
  type TacGia,
  type XacMinhBangChung,
} from '@baton/shared';
import { huyHieuCanChu, type HuyHieuCanChu } from './doc-can-chu.js';
import { docDatBoi, lietKeAgent, lietKeDuAn } from './doc-du-an.js';
import { tenAgentTheoId, themCuaThe, type TheDanhSachRa } from './doc-man-hinh-ticket.js';
import { chiaLoThamSo, dauHoi } from './chia-lo-tham-so.js';
import { phienMoTrongWorkspace, type PhienMoRa } from './doc-phien.js';
import { CUA_SO_VUA_XONG_MS, SO_LIEU_RONG, soLieuDuAn } from './doc-suc-song.js';
import { lietKeTicket } from './doc-ticket.js';
import { sqlLoaiBangChung } from './loai-bang-chung.js';

/* ------------------------------------------------------------------ *
 * Hằng số và trần
 * ------------------------------------------------------------------ */

/** "**3 mục** gấp nhất" — vế "Cần Chủ đọc trước" của báo cáo sáng, d.326. */
export const SO_MUC_GAP_NHAT = 3;

/**
 * "ticket **Chờ kiểm chứng quá 24 giờ**" — d.321. Cùng độ dài cửa sổ với "Vừa
 * xong" của d.320 nhưng là **một luật khác**, nên một hằng riêng: phiên spec đổi
 * một trong hai thì không được kéo cái kia theo.
 */
export const HAN_CHO_KIEM_CHUNG_MS = 24 * 60 * 60 * 1000;

/**
 * **Cửa sổ dài của "Vừa xong"** — d.320 ("chọn cửa sổ 24 giờ hoặc **7 ngày**").
 * Cửa sổ ngắn là `CUA_SO_VUA_XONG_MS` của `doc-suc-song.ts`.
 */
export const CUA_SO_VUA_XONG_7N_MS = 7 * 24 * 60 * 60 * 1000;

/** Trần dòng của mỗi khối — Tổng quan không cuộn, nó là một bản tóm. */
export const TRAN_DU_AN = 200;
/**
 * Trần **khối lớn** của cả workspace trong một lượt Tổng quan (SPEC 20.3–20.4):
 * 200 dự án × 25 khối. `khoi_lon` tối đa 99 nhưng một dự án thật chia vài khối;
 * trần chỉ chặn một lượt đọc vô hạn (`cau-hoi-spec.md` #192).
 */
export const TRAN_KHOI_LON = 5000;
/** Trần "danh sách mở ra" của ô Cần Chủ (SPEC 20.5) — `cau-hoi-spec.md` #192. */
export const TRAN_O_CAN_CHU = 50;
export const TRAN_AGENT = 200;
export const TRAN_CAN_CHU_Y_MOI_NGUON = 50;

/**
 * Trạng thái ticket **đã đóng** (nhóm `closed` của bảng 0.1: done, canceled,
 * duplicate). Ticket đóng không phải "cần chú ý" và không phải rủi ro báo cáo.
 * MỘT hằng cho Tổng quan lẫn báo cáo (`ruiRoCuaBaoCao`).
 */
export const TRANG_THAI_DA_DONG: readonly string[] = trangThaiTheoNhom('closed');

/** Mảnh SQL `t.trang_thai NOT IN (...)` — hằng nội bộ, không có đầu vào người dùng. */
const SQL_TICKET_CHUA_DONG = `t.trang_thai NOT IN (${TRANG_THAI_DA_DONG.map((x) => `'${x}'`).join(', ')})`;

/** Dòng gắn ticket đã đóng thì bỏ; dòng không gắn ticket (tin trượt) giữ. */
function dongConCanChuY(d: DongCanChuY): boolean {
  return d.ticket === null || !TRANG_THAI_DA_DONG.includes(d.ticket.trang_thai);
}
export const TRAN_VUA_XONG = 50;
export const TRAN_TICKET_DANG_CAM = 500;
/**
 * Trần của khối "Việc đang chạy" (d.318) — **mỗi trạng thái**, vì nó là hai lượt
 * `lietKeTicket` (`in_progress`, `verifying`). 200 là trần trang tối đa của
 * `kiemLimit`; cao hơn thì chính `lietKeTicket` cắt.
 */
export const TRAN_VIEC_DANG_CHAY = 200;

/* ------------------------------------------------------------------ *
 * Hình của thân phản hồi
 * ------------------------------------------------------------------ */

/** Một ticket được trỏ tới từ Tổng quan — đủ để vẽ link, không hơn. */
export interface TicketTroTa {
  id: string;
  /** `<MÃ DỰ ÁN>-<số>` — hình mã ticket của SPEC mục 4, và đường `/t/<MÃ>` d.398. */
  ma: string;
  tieu_de: string;
  project_id: string;
  trang_thai: string;
  nhan_trang_thai: string;
}

/** Một mục Chờ "gấp nhất" của d.326 — bản tóm, không phải thẻ đầy đủ của d.250. */
export interface MucGapNhat {
  id: string;
  ma: string;
  muc: MucDoKhan;
  nhan_muc: string;
  loai: string;
  tieu_de: string;
  project_id: string | null;
  han_luc: number | null;
  qua_han: boolean;
  tao_luc: number;
}

/**
 * Một mục Chờ của **danh sách mở ra** trong ô Cần Chủ — SPEC 20.5. Cùng hình
 * `MucGapNhat`, cộng cờ "dự án của mục đang đẩy" để trang xếp mục của dự án
 * `dang_day` lên đầu và gắn nhãn "· đang đẩy".
 */
export interface MucCanChuO extends MucGapNhat {
  /** Dự án của mục đang `dang_day` (không lưu trữ). Mục "Chung" ⇒ `false`. */
  du_an_dang_day: boolean;
}

/** Ô Cần Chủ — d.322, cộng vế đọc-trước của d.326. */
export interface KhoiCanChuTongQuan {
  so_theo_muc: Record<MucDoKhan, number>;
  so_cho: number;
  muc_cao_nhat: MucDoKhan | null;
  /** **3** mục gấp nhất — xem `cauGapNhat` cho thứ tự. */
  gap_nhat: MucGapNhat[];
  /**
   * **Danh sách mở ra** của ô gọn (SPEC 20.5) — tối đa `TRAN_O_CAN_CHU` mục Chờ,
   * **cùng thứ tự** `cauGapNhat` (mức → hạn → lúc tạo). Trang xếp mục của dự án
   * đang đẩy lên đầu, giữ thứ tự này trong mỗi phần. `gap_nhat` là 3 dòng đầu
   * của **cùng** lượt đọc (một câu, không hai).
   */
  ds_cho: MucCanChuO[];
}

/**
 * Một **khối việc lớn** — ticket có `khoi_lon` (SPEC 20.1), bỏ Huỷ/Trùng. Đủ để
 * vẽ vòng ngoài khi phóng vào dự án (20.3), Hill Chart và "Mốc tới" (20.4).
 */
export interface KhoiLonRa {
  id: string;
  ma: string;
  tieu_de: string;
  khoi_lon: number;
  trang_thai: string;
  nhan_trang_thai: string;
  /** Vị trí trên đồi 0–100; `null` = chưa đặt (không vẽ chấm). */
  doi: number | null;
}

/** Mục Cần Chủ **Chờ mới nhất** của một dự án — "Chờ Chủ" của thẻ (20.4). */
export interface MucChoCuaDuAn {
  id: string;
  /** `T-số` — đường `/can-chu?the=<T-số>` mở đúng mục. */
  ma: string;
  tieu_de: string;
}

/** Phần **cấp workspace** của Bản đồ dự án — SPEC 20.2, 20.3. */
export interface BanDoTongQuan {
  /** Tâm của cây tròn (20.3) và "người cầm" khi dự án không có agent quản lý (20.4). */
  ten_chu: string;
  /**
   * Đồng hồ WIP "Đang đẩy n/<giới hạn>" (20.2) — đếm **như L1** (`demDangDay`):
   * dự án `dang_day`, không tính dự án lưu trữ (#186). Đỏ khi `vuot` (n > giới hạn).
   */
  wip: TrangThaiWip;
}

/** Một hàng của **khối 1** — d.317 (dự án). */
export interface HangDuAn {
  id: string;
  ma: string;
  ten: string;
  nhom: string | null;
  trang_thai: string;
  nhan_trang_thai: string;
  suc_song: SucSong;
  so_dang_lam: number;
  so_cho_kiem_chung: number;
  /** "số … Cần làm" — d.317, mã `todo` của bảng 0.1. */
  so_can_lam: number;
  /** Tử số của thanh tiến độ d.317. */
  so_xong: number;
  /** Mẫu số của thanh tiến độ d.317 — xem `NGOAI_TONG` ở `doc-suc-song.ts`. */
  so_tong: number;
  so_xong_24h: number;
  /**
   * "**việc đang làm nổi bật nhất** của dự án" — d.317.
   *
   * Chọn **ticket `in_progress` đầu tiên theo đúng thứ tự xếp của bảng việc**
   * (ưu tiên cao nhất trước, rồi mới tạo trước): thứ tự ấy là thứ tự chủ đã
   * thấy ở d.403, nên "nổi bật nhất" ở đây **là** dòng đầu của chính danh sách
   * ấy, không một thứ tự thứ hai. `null` khi dự án không có ticket Đang làm nào
   * (lúc đó dự án là ⚪ và dòng nói "Dự án không chạy"). SPEC không định nghĩa
   * "nổi bật" — `cau-hoi-spec.md` #139.
   */
  viec_noi_bat: TicketTroTa | null;

  /* ---------------- Bản đồ dự án — SPEC 20.1–20.4 ---------------- */

  /** Ưu tiên 1–5 (5 = quan trọng nhất) — cỡ bong bóng (20.3). */
  uu_tien: number;
  dang_day: boolean;
  duy_tri: boolean;
  /** `null` ⇒ dùng `ten`. */
  ten_ngan: string | null;
  /** **Tên** agent quản lý (d.404, không id); `null` ⇒ thẻ hiện tên chủ (20.4). */
  quan_ly_ten: string | null;
  /** Khối lớn, sắp theo `khoi_lon` rồi mã (#183); bỏ Huỷ/Trùng. */
  khoi_lon: KhoiLonRa[];
  /** "Xong/Tổng" khối (20.1): Xong / tổng không Huỷ, không Trùng. */
  khoi_xong: number;
  khoi_tong: number;
  /** "Mốc tới" (20.4): khối lớn số nhỏ nhất chưa Xong. */
  moc_toi: KhoiLonRa | null;
  /** Có ít nhất một mục Cần Chủ Chờ — bong bóng vàng (20.3), chấm vàng ở dải duy trì (20.2). */
  co_can_chu_cho: boolean;
  /** Mục Chờ **mới nhất** của dự án — "Chờ Chủ" của thẻ (20.4). */
  can_chu_cho_moi_nhat: MucChoCuaDuAn | null;
  /** "Đặt bởi <tên> · <thời gian>" của thanh công cụ (20.8); `null` = chưa ai đổi. */
  dat_boi: DatBoi | null;
}

/**
 * Một thẻ của **khối 2** — d.318 ("Việc đang chạy").
 *
 * `the` là **đúng** thẻ việc của bảng d.403 (`TheDanhSachRa`), nên hai màn hình
 * vẽ cùng một component với cùng một hình dữ liệu. Hai trường quanh nó là đúng
 * hai thứ d.318 đòi thêm: "**ai** đang cầm" và "**đã cầm bao lâu**".
 */
export interface TheViecDangChay {
  the: TheDanhSachRa;
  /**
   * **Tên** agent đang cầm — d.404 ("mọi chỗ hiện người làm đều hiện tên agent,
   * không bao giờ id"). `null` khi người cầm là **chủ** hoặc không ai cầm:
   * `the.nguoi_dang_cam` đã nói đủ hai ca đó, và một cái tên bịa ở đây sẽ che
   * mất ca "không ai cầm".
   */
  nguoi_cam_ten: string | null;
  /**
   * "**đã cầm bao lâu**" — d.318, dưới dạng mốc **bắt đầu cầm**: `nhan_luc` của
   * lượt giao đang mở, rơi về `tao_luc` khi lượt còn `pending`. Trả mốc, không
   * trả một khoảng đã trừ: d.412 bắt mọi mốc đếm từ `bay_gio` **của thân**, và
   * một con số "2 giờ" đóng băng ngay khi thân rời máy chủ.
   */
  cam_tu_luc: number | null;
}

/** Một dòng của **khối 3** — d.319 ("Agent đang làm gì"). */
export interface TheAgent {
  id: string;
  ten: string;
  vai_tro: string;
  nhan_vai_tro: string;
  trang_thai: TrangThaiAgent;
  nhan_trang_thai: string;
  ticket_dang_cam: TicketTroTa[];
  /** "thời gian từ tín hiệu cuối" — d.318. `null` = chưa bao giờ lên tiếng. */
  tin_hieu_cuoi_luc: number | null;
}

/** Sáu nguồn của d.321, mã máy để giao diện phân biệt mà không đọc chữ. */
export type LoaiCanChuY =
  | 'phien_dung_hoac_loi'
  | 'luot_giao_khong_phan_hoi'
  | 'ticket_khong_ai_cam'
  | 'bang_chung_truot'
  | 'ticket_cho_kiem_chung_qua_24h'
  /**
   * **Nguồn thứ sáu, thêm ở phần 7** — 19.12 câu 6 + mục 12: một tin đã thử gửi
   * **3 lần** và đều trượt thì "tin **giữ trong chuông**", và chủ phải thấy nó ở
   * đây. Không có dòng này thì một Telegram hỏng (token sai, bot bị chặn) là một
   * lỗi **im lặng tuyệt đối**: chủ không nhận tin, và cũng không nhận tin về việc
   * không nhận được tin.
   */
  | 'thong_bao_gui_truot';

/**
 * **Một lý do** của khối 5 (d.321). Từ đợt 3 nó không còn là một dòng trên màn
 * hình: nhiều lý do của **cùng một ticket** gom vào một `NhomCanChuY`.
 */
export interface DongCanChuY {
  loai: LoaiCanChuY;
  nhan_loai: string;
  /**
   * Mốc mà dòng này "bắt đầu đáng chú ý" — tín hiệu cuối của phiên đứng, hạn
   * phản hồi đã qua, lúc ticket rơi vào trạng thái đó… Một trường, vì mọi dòng
   * đều cần trả lời đúng một câu: **từ lúc nào**.
   */
  luc: number;
  ticket: TicketTroTa | null;
  luot_giao: { id: string; loai: string; nguoi_nhan_agent_id: string } | null;
  phien: { id: string; agent_id: string; trang_thai: TrangThaiPhien; nhan_trang_thai: string } | null;
  bang_chung: { id: string; loai: string; ly_do: string | null } | null;
  /** Tin không gửi được — nguồn thứ sáu (phần 7). `ly_do` đã lọc, không secret. */
  thong_bao: { id: string; loai: string; ly_do: string | null } | null;
}

/**
 * **Một dòng của khối 5** — d.321: "gom theo ticket: mỗi ticket đúng MỘT dòng,
 * các lý do hiện thành **nhãn** trên dòng đó".
 *
 * `khoa` là khoá React/`data-*` của dòng, do **máy chủ** cấp: giao diện không
 * dựng được một khoá ổn định từ dữ liệu (một dòng không gắn ticket không có id
 * nào chung cho cả nhóm), và một `index` làm khoá thì mỗi lượt làm mới (2 giây)
 * là một lần React dựng lại cả khối.
 */
export interface NhomCanChuY {
  khoa: string;
  ticket: TicketTroTa | null;
  /** Mốc **sớm nhất** trong nhóm — "đáng chú ý từ lúc nào", theo lý do cũ nhất. */
  luc: number;
  /** Một hoặc nhiều lý do; mỗi lý do là một nhãn trên dòng. */
  ly_do: DongCanChuY[];
}

/** Bằng chứng **rút gọn** của d.320: "hash 7 ký tự, URL, mã phiên bản". */
export interface BangChungRutGon {
  id: string;
  loai: string;
  nhan_loai: string;
  /** 7 ký tự — `hashRutGon`. `null` với loại không phải `commit`. */
  hash: string | null;
  repo: string | null;
  url: string | null;
  ma_phien_ban: string | null;
  xac_minh: XacMinhBangChung;
  nhan_xac_minh: string;
  /**
   * **Nguồn của kết luận `merged`/`pushed`** — `github` hay `local` (migration
   * 0022 khối A). `null` cho loại khác và cho các kết luận khác.
   *
   * Phải ra tới đây: một `merged` dựa vào lời khai cục bộ (repo chưa push) **không
   * được** đọc lẫn với một `merged` đã tra qua GitHub API.
   */
  nguon_xac_minh: NguonXacMinhMerged | null;
  nhan_nguon_xac_minh: string | null;
  /**
   * **Nguồn của một `review`** — `reviewer` hay `manager` (migration 0022 khối
   * B). `null` cho loại khác và cho review do chủ gửi. Cùng lý do: "manager ghi,
   * kèm báo cáo reviewer" không được đọc lẫn với "agent reviewer gửi".
   */
  review_nguon: NguonReview | null;
  nhan_review_nguon: string | null;
  /** Đường dẫn báo cáo reviewer của một review do `manager` gửi. */
  review_bao_cao: string | null;
  /**
   * **Nguồn ký của một `bao_cao`** (migration 0027, T-31) — `reviewer`/`manager`/
   * `coordinator`/`owner`. `null` cho loại khác.
   */
  bao_cao_nguon: NguonBaoCao | null;
  nhan_bao_cao_nguon: string | null;
  /** Đường dẫn báo cáo (nếu có) — chỉ điền cho `loai = 'bao_cao'`. */
  bao_cao_duong_dan: string | null;
  /** Nội dung báo cáo (nếu có) — chỉ điền cho `loai = 'bao_cao'`. */
  bao_cao_noi_dung: string | null;
  /** Đường dẫn báo cáo reviewer độc lập của một báo cáo do `manager` ký. */
  bao_cao_reviewer: string | null;
}

/** Một dòng của **khối 4** — d.320. */
export interface DongVuaXong {
  ticket: TicketTroTa;
  xong_luc: number;
  bang_chung: BangChungRutGon[];
}

/** Thân của `GET /v1/tong-quan` — một khoá cho mỗi khối của d.317–321. */
export interface TongQuanRa {
  /** Mốc "bây giờ" mà mọi dẫn xuất trong thân này được tính tại. */
  bay_gio: number;
  /** Khối 1 — d.317. */
  du_an: HangDuAn[];
  /** Khối 2 — d.318. */
  viec_dang_chay: TheViecDangChay[];
  /** Khối 3 — d.319, **chỉ** agent đang làm. */
  agent: TheAgent[];
  /** "Agent rảnh gom **một dòng** đếm số" — d.319. Máy chủ đếm, trang chỉ vẽ. */
  agent_ranh_so: number;
  /** Khối 4 — d.320, **cả hai** cửa sổ trong một lượt gọi (xem đầu file). */
  vua_xong_24h: DongVuaXong[];
  vua_xong_7n: DongVuaXong[];
  /** Khối 5 — d.321, đã **gom theo ticket**. */
  can_chu_y: NhomCanChuY[];
  /** Ô gọn ở thanh bên phải — d.322, **không** còn là khối đầu trang. */
  can_chu: KhoiCanChuTongQuan;
  /** Phần cấp workspace của Bản đồ dự án (SPEC 20.2–20.3): tâm cây + đồng hồ WIP. */
  ban_do: BanDoTongQuan;
}

/** Nhãn tiếng Việt của năm nguồn — SPEC mục 0.1 (mã máy + nhãn hiển thị). */
export const NHAN_CAN_CHU_Y: Record<LoaiCanChuY, string> = {
  phien_dung_hoac_loi: 'Phiên đứng hoặc lỗi',
  luot_giao_khong_phan_hoi: 'Lượt giao không phản hồi',
  ticket_khong_ai_cam: 'Đang làm mà không ai cầm',
  bang_chung_truot: 'Bằng chứng trượt',
  ticket_cho_kiem_chung_qua_24h: 'Chờ kiểm chứng quá 24 giờ',
  thong_bao_gui_truot: 'Không gửi được thông báo Telegram',
};

/* ------------------------------------------------------------------ *
 * Cả màn hình
 * ------------------------------------------------------------------ */

function maTicket(du_an_ma: string, so: number): string {
  return `${du_an_ma}-${String(so)}`;
}

function troTa(d: {
  id: string;
  so: number;
  tieu_de: string;
  project_id: string;
  du_an_ma: string;
  trang_thai: string;
}): TicketTroTa {
  return {
    id: d.id,
    ma: maTicket(d.du_an_ma, d.so),
    tieu_de: d.tieu_de,
    project_id: d.project_id,
    trang_thai: d.trang_thai,
    nhan_trang_thai: nhan('trang_thai_ticket', d.trang_thai),
  };
}

/**
 * **Trang Tổng quan** — d.315–320, năm khối, một lượt gọi.
 *
 * `bay_gio` qua **tham số**, như mọi chỗ phụ thuộc thời gian của dự án này
 * (`quyet-dinh.md` 01/10): ba mốc của màn hình này (ngưỡng đứng của mục 6, hạn
 * phản hồi của mục 5, hai cửa sổ 24 giờ của d.319–320) phải ghim được bằng một
 * con số, không bằng cách chờ thật.
 */
export async function tongQuan(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<TongQuanRa> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', {
      message: 'Tổng quan là màn hình của chủ; agent dùng token và /v1/tasks.',
    });
  }

  // Một lượt đọc phiên mở cho **ba** khối — xem khối ghi chú đầu file.
  const phien_mo = await phienMoTrongWorkspace(db, workspace_id, bay_gio);

  /*
   * `cam` (lượt giao đang mở) đọc **một lần** và được **hai** khối dùng: khối
   * agent ("ticket đang cầm") và khối việc đang chạy ("ai cầm, từ lúc nào"). Hai
   * lượt đọc riêng là hai ảnh chụp lệch nhau ngay trong một màn hình — cùng lý lẽ
   * với `phien_mo`.
   */
  const [can_chu, du_an_va_viec, ds_agent, cam, can_chu_y, vua_xong, ban_do] = await Promise.all([
    khoiCanChu(db, ai, workspace_id, bay_gio),
    duAnVaViecDangChay(db, ai, workspace_id, bay_gio, phien_mo),
    lietKeAgent(db, ai, workspace_id, { limit: TRAN_AGENT }, bay_gio),
    camDangMo(db, workspace_id),
    khoiCanChuY(db, workspace_id, bay_gio, phien_mo),
    khoiVuaXong(db, workspace_id, bay_gio),
    docBanDo(db, workspace_id),
  ]);

  const ten_agent = new Map(ds_agent.items.map((a) => [a.id, a.ten]));
  const { agent, agent_ranh_so } = khoiAgent(ds_agent.items, cam.theo_agent);

  return {
    bay_gio,
    du_an: du_an_va_viec.du_an.map(({ quan_ly_agent_id, ...h }) =>
      ghepBanDo(h, quan_ly_agent_id, ban_do, ten_agent),
    ),
    viec_dang_chay: du_an_va_viec.viec_dang_chay.map((t) => theViecDangChay(t, cam, ten_agent)),
    agent,
    agent_ranh_so,
    vua_xong_24h: vua_xong.filter((d) => d.xong_luc >= bay_gio - CUA_SO_VUA_XONG_MS),
    vua_xong_7n: vua_xong,
    can_chu_y: gomTheoTicket(can_chu_y.filter(dongConCanChuY)),
    can_chu: {
      ...can_chu,
      ds_cho: can_chu.ds_cho.map((m) => ({
        ...m,
        du_an_dang_day: m.project_id !== null && ban_do.dang_day_ids.has(m.project_id),
      })),
    },
    ban_do: {
      ten_chu: ban_do.ten_chu,
      wip: trangThaiWip(ban_do.dang_day_ids.size, ban_do.gioi_han_wip),
    },
  };
}

/* ================================================================== *
 * Bản đồ dự án — SPEC 20.1–20.5
 * ================================================================== */

/** Mọi thứ cấp workspace mà bản đồ cần — đọc bằng **bốn** câu cố định, không N+1. */
interface DocBanDo {
  ten_chu: string;
  gioi_han_wip: number;
  /** Dự án `dang_day` và **không** lưu trữ — nguồn của đồng hồ WIP và nhãn 20.5. */
  dang_day_ids: Set<string>;
  khoi_theo_du_an: Map<string, KhoiLonRa[]>;
  cho_theo_du_an: Map<string, MucChoCuaDuAn>;
  /** "Đặt bởi" (20.8) của mọi dự án — **một** câu cửa sổ (`cauDatBoi`). */
  dat_boi_theo_du_an: Map<string, DatBoi>;
}

/** Trạng thái ticket **ngoài** tổng khối (20.1: "không Huỷ, không Trùng"). */
const TRANG_THAI_NGOAI_KHOI = ['canceled', 'duplicate'] as const;

/**
 * Câu **khối lớn** của cả workspace — tách ra để test đọc chính câu sản phẩm.
 *
 * Lọc `khoi_lon IS NOT NULL` không có index riêng (0029 không thêm): câu đi
 * `ix_ticket_du_an (workspace_id, …)` rồi lọc. Đo ở `test/hieu-nang/do-200k.ts`
 * (c5) — 200.000 ticket vẫn dưới 1 giây; không thêm migration ở lượt này.
 */
export function cauKhoiLon(workspace_id: string): { sql: string; bind: (string | number)[] } {
  return {
    sql: `SELECT t.id AS id, t.so AS so, t.tieu_de AS tieu_de, t.project_id AS project_id,
                 t.trang_thai AS trang_thai, t.khoi_lon AS khoi_lon, t.doi AS doi,
                 pr.ma AS du_an_ma
            FROM ticket t
            JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
           WHERE t.workspace_id = ? AND t.khoi_lon IS NOT NULL AND t.xoa_luc IS NULL
             AND t.trang_thai NOT IN (${TRANG_THAI_NGOAI_KHOI.map((x) => `'${x}'`).join(', ')})
             AND pr.trang_thai <> 'archived'
           ORDER BY t.project_id, t.khoi_lon, t.so
           LIMIT ?`,
    bind: [workspace_id, TRAN_KHOI_LON],
  };
}

/**
 * Câu **mục Chờ mới nhất của mỗi dự án** (20.4 "Chờ Chủ") — một câu cửa sổ, không
 * một câu cho mỗi dự án. Mới nhất = `tao_luc` lớn nhất, `id` chốt thứ tự toàn phần.
 */
export function cauChoMoiNhat(workspace_id: string): { sql: string; bind: string[] } {
  return {
    sql: `SELECT id, ma_so, tieu_de, project_id FROM (
            SELECT ct.id AS id, ct.ma_so AS ma_so, ct.tieu_de AS tieu_de, ct.project_id AS project_id,
                   ROW_NUMBER() OVER (PARTITION BY ct.project_id ORDER BY ct.tao_luc DESC, ct.id DESC) AS hang
              FROM can_chu ct
             WHERE ct.workspace_id = ? AND ct.trang_thai = 'open' AND ct.project_id IS NOT NULL
          ) WHERE hang = 1`,
    bind: [workspace_id],
  };
}

async function docBanDo(db: D1Database, workspace_id: string): Promise<DocBanDo> {
  const khoi = cauKhoiLon(workspace_id);
  const cho = cauChoMoiNhat(workspace_id);
  const [ws, ds_khoi, ds_cho, dat_boi_theo_du_an] = await Promise.all([
    /*
     * Tâm cây + giới hạn WIP + tập dự án đang đẩy trong **một** câu. Điều kiện đếm
     * **giống hệt** `demDangDay` của `lenh-du-an.ts` (đồng hồ của lệnh và của
     * màn hình không được nói hai số): `dang_day = 1`, không lưu trữ (#186).
     */
    db
      .prepare(
        `SELECT w.ten_chu AS ten_chu, w.gioi_han_wip AS gioi_han_wip,
                (SELECT json_group_array(p.id) FROM project p
                  WHERE p.workspace_id = w.id AND p.dang_day = 1
                    AND p.trang_thai <> 'archived') AS dang_day_ids
           FROM workspace w WHERE w.id = ?`,
      )
      .bind(workspace_id)
      .first<{ ten_chu: string; gioi_han_wip: number; dang_day_ids: string }>(),
    db
      .prepare(khoi.sql)
      .bind(...khoi.bind)
      .all<{
        id: string;
        so: number;
        tieu_de: string;
        project_id: string;
        trang_thai: string;
        khoi_lon: number;
        doi: number | null;
        du_an_ma: string;
      }>(),
    db
      .prepare(cho.sql)
      .bind(...cho.bind)
      .all<{ id: string; ma_so: number; tieu_de: string; project_id: string }>(),
    docDatBoi(db, workspace_id),
  ]);

  const khoi_theo_du_an = new Map<string, KhoiLonRa[]>();
  for (const r of ds_khoi.results) {
    const ds = khoi_theo_du_an.get(r.project_id) ?? [];
    ds.push({
      id: r.id,
      ma: maTicket(r.du_an_ma, r.so),
      tieu_de: r.tieu_de,
      khoi_lon: r.khoi_lon,
      trang_thai: r.trang_thai,
      nhan_trang_thai: nhan('trang_thai_ticket', r.trang_thai),
      doi: r.doi,
    });
    khoi_theo_du_an.set(r.project_id, ds);
  }

  const cho_theo_du_an = new Map<string, MucChoCuaDuAn>();
  for (const r of ds_cho.results) {
    cho_theo_du_an.set(r.project_id, { id: r.id, ma: `T-${String(r.ma_so)}`, tieu_de: r.tieu_de });
  }

  let ids: string[] = [];
  try {
    const p: unknown = JSON.parse(ws?.dang_day_ids ?? '[]');
    if (Array.isArray(p)) ids = p.filter((x): x is string => typeof x === 'string');
  } catch {
    ids = [];
  }

  return {
    ten_chu: ws?.ten_chu ?? '',
    gioi_han_wip: ws?.gioi_han_wip ?? GIOI_HAN_WIP_MAC_DINH,
    dang_day_ids: new Set(ids),
    khoi_theo_du_an,
    cho_theo_du_an,
    dat_boi_theo_du_an,
  };
}

/** Ghép phần Bản đồ (20.1–20.4) vào một hàng dự án. Hàm thuần trên dữ liệu đã đọc. */
function ghepBanDo(
  h: Omit<HangDuAnTam, 'quan_ly_agent_id'>,
  quan_ly_agent_id: string | null,
  bd: DocBanDo,
  ten_agent: ReadonlyMap<string, string>,
): HangDuAn {
  const khoi = bd.khoi_theo_du_an.get(h.id) ?? [];
  const cho = bd.cho_theo_du_an.get(h.id) ?? null;
  return {
    ...h,
    quan_ly_ten: quan_ly_agent_id === null ? null : (ten_agent.get(quan_ly_agent_id) ?? null),
    khoi_lon: khoi,
    khoi_xong: khoi.filter((k) => k.trang_thai === 'done').length,
    khoi_tong: khoi.length,
    // Danh sách đã sắp theo `khoi_lon` rồi số ticket ⇒ khối chưa Xong đầu tiên.
    moc_toi: khoi.find((k) => k.trang_thai !== 'done') ?? null,
    co_can_chu_cho: cho !== null,
    can_chu_cho_moi_nhat: cho,
    dat_boi: bd.dat_boi_theo_du_an.get(h.id) ?? null,
  };
}

/* ================================================================== *
 * Ô Cần Chủ (d.322) — và vế "Cần Chủ đọc trước" của báo cáo sáng (d.326)
 * ------------------------------------------------------------------
 * Từ đợt 3 nó **không** còn là khối 1 của Tổng quan: trang chỉ vẽ ba con số, một
 * link và một nút. `gap_nhat` vẫn được tính vì **báo cáo sáng** (d.326) đọc đúng
 * khối này qua `duLieuBaoCaoSang`.
 * ================================================================== */

/**
 * Câu của "**3 mục Chờ gấp nhất**" — tách ra để test đo chính câu sản phẩm bằng
 * `EXPLAIN QUERY PLAN` (nếp `quyet-dinh.md`).
 *
 * **Thứ tự: mức → hạn → lúc tạo**, và nó không phải một lựa chọn tuỳ ý:
 *   1. **mức** (🔴 → 🟡 → ⚪) vì d.316 gọi chúng là "mục **gấp nhất**" và mục 8
 *      định nghĩa độ gấp bằng chính ba mức đó (`MUC_THEO_DO_KHAN`, cùng thứ tự
 *      mà phiên duyệt d.274 đi);
 *   2. **hạn sớm trước** rồi **lúc tạo**, đúng chữ d.249 ("trong khối sắp theo
 *      hạn, rồi theo lúc tạo") — ba mục gấp nhất phải là ba mục **đầu** của màn
 *      hình Cần Chủ, nếu không thì chủ bấm "Bắt đầu phiên duyệt" và gặp một thứ
 *      tự khác thứ tự vừa xem.
 *   3. `id` chốt lại thành thứ tự **toàn phần** (nếp keyset của `trang.ts`).
 *
 * `ct.han_luc IS NULL` trong `ORDER BY` đẩy mục **không hẹn hạn** xuống cuối
 * (SQLite xếp NULL lên đầu) — cùng kết luận với `cauKhoiCho` của màn hình Cần
 * Chủ, nơi lý lẽ đầy đủ và `cau-hoi-spec.md` #77 đã ghi.
 *
 * **Khai thẳng: câu này KHÔNG đi `ORDER BY` theo index.** `CASE` trên `muc` và
 * `han_luc IS NULL` không phải tiền tố của `ix_can_chu_khoi`, nên SQLite sắp
 * bằng một B-tree tạm. Chấp nhận, và nó có giới hạn thật: tập dòng là **mục
 * `Chờ`** của một workspace một người chủ — thứ chủ dọn mỗi ngày trong phiên
 * duyệt (d.274), không phải 200.000 dòng. Đổi lại là một câu duy nhất cho một
 * thứ tự đúng; ba câu đi index (một cho mỗi mức) sẽ nhanh hơn nhưng là ba lần
 * đọc cho ba dòng.
 */
export function cauGapNhat(
  workspace_id: string,
  gioi_han = SO_MUC_GAP_NHAT,
): {
  sql: string;
  bind: (string | number)[];
} {
  return {
    sql: `SELECT ct.id AS id, ct.ma_so AS ma_so, ct.muc AS muc, ct.loai AS loai,
                 ct.tieu_de AS tieu_de, ct.project_id AS project_id,
                 ct.han_luc AS han_luc, ct.tao_luc AS tao_luc
            FROM can_chu ct
           WHERE ct.workspace_id = ? AND ct.trang_thai = 'open'
           ORDER BY CASE ct.muc WHEN 'urgent' THEN 0 WHEN 'today' THEN 1 ELSE 2 END,
                    ct.han_luc IS NULL, ct.han_luc, ct.tao_luc, ct.id
           LIMIT ?`,
    bind: [workspace_id, gioi_han],
  };
}

async function khoiCanChu(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<Omit<KhoiCanChuTongQuan, 'ds_cho'> & { ds_cho: MucGapNhat[] }> {
  /*
   * Huy hiệu đi qua **đúng** `huyHieuCanChu` của mục 8 (d.248), không một câu
   * `count(*)` thứ hai: "số mục Chờ theo mức" của d.316 và huy hiệu sidebar của
   * d.248 là **cùng một** con số, và hai câu đếm sẽ lệch nhau (một bên quên lớp
   * "Chung", một bên quên `trang_thai = 'open'`).
   */
  const huy_hieu: HuyHieuCanChu = await huyHieuCanChu(db, ai, workspace_id);

  /*
   * **Một** câu cho cả "3 gấp nhất" (d.316) lẫn danh sách mở ra của 20.5: cùng
   * thứ tự, nên 3 gấp nhất **là** 3 dòng đầu của danh sách — không một câu thứ
   * hai có thể nói khác.
   */
  const cau = cauGapNhat(workspace_id, TRAN_O_CAN_CHU);
  const { results } = await db
    .prepare(cau.sql)
    .bind(...cau.bind)
    .all<{
      id: string;
      ma_so: number;
      muc: MucDoKhan;
      loai: string;
      tieu_de: string;
      project_id: string | null;
      han_luc: number | null;
      tao_luc: number;
    }>();

  const ds: MucGapNhat[] = results.map((d) => ({
      id: d.id,
      ma: `T-${String(d.ma_so)}`,
      muc: d.muc,
      nhan_muc: nhan('muc_can_chu', d.muc),
      loai: d.loai,
      tieu_de: d.tieu_de,
      project_id: d.project_id,
      han_luc: d.han_luc,
      // Dẫn xuất ở server, qua `quaHan` của `@baton/shared` — cùng bản mà màn
      // hình Cần Chủ dùng (19.8), nên hai màn hình không nói khác nhau.
      qua_han: quaHan(d.han_luc, bay_gio),
      tao_luc: d.tao_luc,
    }));

  return {
    so_theo_muc: huy_hieu.so_theo_muc,
    so_cho: huy_hieu.so_cho,
    muc_cao_nhat: huy_hieu.muc_cao_nhat,
    gap_nhat: ds.slice(0, SO_MUC_GAP_NHAT),
    ds_cho: ds,
  };
}

/* ================================================================== *
 * Khối 1 và 2 — Dự án (d.317) và Việc đang chạy (d.318)
 * ================================================================== */

/**
 * Hai khối **cùng một hàm**, và đó không phải sự tiện tay: "việc đang làm nổi
 * bật nhất" của d.317 **là** một dòng của chính danh sách việc đang chạy của
 * d.318. Tính nó bằng một câu riêng là một câu thứ hai nói về cùng tập ticket —
 * và hai câu có thể nói hai ticket khác nhau trong cùng một màn hình.
 *
 * Danh sách việc đang chạy đi qua **`lietKeTicket`**, tức qua đúng cửa mà bảng
 * việc của d.403 đi (thứ tự `(hang_uu_tien, tao_luc DESC, id DESC)`, người đang
 * cầm của 19.1, cờ hệ thống), cộng `themCuaThe` cho bốn trường của thẻ. Hai lượt
 * gọi vì bộ lọc `trang_thai` của `lietKeTicket` nhận **một** mã, và "đang chạy"
 * là hai mã (`in_progress` + `verifying`, nhóm `active` của bảng 0.1).
 */
async function duAnVaViecDangChay(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
  phien_mo: readonly PhienMoRa[],
): Promise<{ du_an: HangDuAnTam[]; viec_dang_chay: TheDanhSachRa[] }> {
  // `so_lieu` tính **một lần** rồi đưa vào `lietKeDuAn`: nó cũng là nguồn
  // `suc_song` của danh sách, nên không có lượt đọc thứ hai cho cùng con số.
  const [so_lieu, dang_lam, cho_kiem] = await Promise.all([
    soLieuDuAn(db, workspace_id, bay_gio, phien_mo),
    lietKeTicket(db, ai, workspace_id, {
      trang_thai: 'in_progress',
      limit: TRAN_VIEC_DANG_CHAY,
    }),
    lietKeTicket(db, ai, workspace_id, {
      trang_thai: 'verifying',
      limit: TRAN_VIEC_DANG_CHAY,
    }),
  ]);
  const trang = await lietKeDuAn(db, ai, workspace_id, { limit: TRAN_DU_AN }, bay_gio, so_lieu);

  /*
   * "Nổi bật nhất" = **dòng đầu** của dự án đó trong danh sách `in_progress` —
   * danh sách đã sắp theo thứ tự của d.403, nên `Map.set` chỉ-lần-đầu là đúng
   * phép chọn. Xem ghi chú của `HangDuAn.viec_noi_bat`.
   */
  const noi_bat = new Map<string, TicketTroTa>();
  for (const t of dang_lam.items) {
    if (noi_bat.has(t.project_id)) continue;
    noi_bat.set(t.project_id, {
      id: t.id,
      ma: t.ma,
      tieu_de: t.tieu_de,
      project_id: t.project_id,
      trang_thai: t.trang_thai,
      nhan_trang_thai: t.nhan_trang_thai,
    });
  }

  const viec = [...dang_lam.items, ...cho_kiem.items];
  const them = await themCuaThe(
    db,
    workspace_id,
    viec.map((t) => t.id),
  );
  /*
   * Hai trường **tên** của `TheDanhSachRa` (d.404). Khối 2 cũng có
   * `nguoi_cam_ten` riêng (d.318 đòi "ai đang cầm" theo **lượt giao đang mở**, một
   * dẫn xuất khác), nên hai chỗ **không** trùng nghĩa: trường ở thẻ là tên của
   * `nguoi_dang_cam` 19.1, trường của khối là tên agent của lượt đang mở.
   */
  const ten_the = await tenAgentTheoId(
    db,
    workspace_id,
    viec.flatMap((t) => [t.nguoi_dang_cam, t.chiu_trach_nhiem]),
  );
  const tenCua = (ai: TacGia | null): string | null =>
    ai === null || ai.loai !== 'agent' || ai.agentId === undefined
      ? null
      : (ten_the.get(ai.agentId) ?? null);

  return {
    du_an: trang.items.map((d) => {
      const s = so_lieu.get(d.id) ?? SO_LIEU_RONG;
      return {
        id: d.id,
        ma: d.ma,
        ten: d.ten,
        nhom: d.nhom,
        trang_thai: d.trang_thai,
        nhan_trang_thai: d.nhan_trang_thai,
        suc_song: d.suc_song,
        so_dang_lam: s.so_dang_lam,
        so_cho_kiem_chung: s.so_cho_kiem_chung,
        so_can_lam: s.so_can_lam,
        so_xong: s.so_xong,
        so_tong: s.so_tong,
        so_xong_24h: s.so_xong_24h,
        viec_noi_bat: noi_bat.get(d.id) ?? null,
        uu_tien: d.uu_tien,
        dang_day: d.dang_day,
        duy_tri: d.duy_tri,
        ten_ngan: d.ten_ngan,
        quan_ly_agent_id: d.quan_ly_agent_id,
      };
    }),
    viec_dang_chay: viec.map((t) => ({
      ...t,
      nhan: them.nhan.get(t.id) ?? [],
      con_tong: them.con.get(t.id)?.tong ?? 0,
      con_chua_ket: them.con.get(t.id)?.chua_ket ?? 0,
      can_chu_so: them.can_chu.get(t.id) ?? 0,
      xong_luc: them.xong_luc.get(t.id) ?? null,
      nguoi_cam_ten: tenCua(t.nguoi_dang_cam),
      chiu_trach_nhiem_ten: tenCua(t.chiu_trach_nhiem),
    })),
  };
}

/**
 * Hàng dự án **trước khi** ghép phần Bản đồ (`ghepBanDo`): còn mang
 * `quan_ly_agent_id` để tra tên từ danh sách agent của cùng lượt gọi.
 */
type HangDuAnTam = Omit<
  HangDuAn,
  | 'quan_ly_ten'
  | 'khoi_lon'
  | 'khoi_xong'
  | 'khoi_tong'
  | 'moc_toi'
  | 'co_can_chu_cho'
  | 'can_chu_cho_moi_nhat'
  | 'dat_boi'
> & { quan_ly_agent_id: string | null };

/** Ghép một thẻ việc với **tên** người cầm và mốc "đã cầm từ lúc nào" (d.318). */
function theViecDangChay(
  the: TheDanhSachRa,
  cam: CamDangMo,
  ten_agent: ReadonlyMap<string, string>,
): TheViecDangChay {
  const c = cam.theo_ticket.get(the.id);
  return {
    the,
    /*
     * Tên tra từ **danh sách agent của chính lượt gọi này**, không một câu JOIN
     * thứ hai: khối agent đã đọc đủ 200 agent của workspace. Agent không có
     * trong bảng tra (bị xoá khỏi danh sách, hay quá trần) ⇒ `null`, **không**
     * rơi về id: d.404 cấm id lọt lên màn hình, và một `null` làm thẻ nói
     * "không rõ" thay vì nói sai.
     */
    nguoi_cam_ten: c === undefined ? null : (ten_agent.get(c.agent_id) ?? null),
    cam_tu_luc: c?.tu_luc ?? null,
  };
}

/* ================================================================== *
 * Khối 3 — Agent đang làm gì (d.319)
 * ================================================================== */

/**
 * **Trạng thái agent được coi là "đang làm"** — d.319 ("chỉ agent **đang làm**").
 *
 * `busy` là nghĩa hiển nhiên. `stalled` và `waiting_owner` vào danh sách **khi
 * agent còn cầm việc**: cả hai vẫn là một agent **giữ gậy** (mục 3 d.100–101 —
 * phiên chờ Cần Chủ, phiên bị đứng), nên bỏ chúng đi là làm biến mất đúng những
 * agent chủ cần nhìn nhất. `idle` đếm vào một dòng gom; `disabled` **không** ở
 * cả hai chỗ — một agent đã tắt không đang làm và cũng không rảnh.
 */
const DANG_LAM_CAN_VIEC: readonly TrangThaiAgent[] = ['stalled', 'waiting_owner'];

function khoiAgent(
  ds: readonly {
    id: string;
    ten: string;
    vai_tro: string;
    nhan_vai_tro: string;
    trang_thai: TrangThaiAgent;
    nhan_trang_thai: string;
    len_tieng_luc: number | null;
  }[],
  dang_cam: ReadonlyMap<string, TicketTroTa[]>,
): { agent: TheAgent[]; agent_ranh_so: number } {
  const agent: TheAgent[] = [];
  let agent_ranh_so = 0;

  for (const a of ds) {
    const ticket_dang_cam = dang_cam.get(a.id) ?? [];
    if (a.trang_thai === 'idle') {
      agent_ranh_so += 1;
      continue;
    }
    const dang_lam =
      a.trang_thai === 'busy' ||
      (DANG_LAM_CAN_VIEC.includes(a.trang_thai) && ticket_dang_cam.length > 0);
    if (!dang_lam) continue;

    agent.push({
      id: a.id,
      ten: a.ten,
      vai_tro: a.vai_tro,
      nhan_vai_tro: a.nhan_vai_tro,
      trang_thai: a.trang_thai,
      nhan_trang_thai: a.nhan_trang_thai,
      ticket_dang_cam,
      tin_hieu_cuoi_luc: a.len_tieng_luc,
    });
  }
  return { agent, agent_ranh_so };
}

/** Lượt giao **đang mở**, tra được theo agent và theo ticket. */
interface CamDangMo {
  theo_agent: Map<string, TicketTroTa[]>;
  /** `hang` là hạng của 19.1 — chỉ dùng để chọn lượt thắng, xem `camDangMo`. */
  theo_ticket: Map<string, { agent_id: string; tu_luc: number; hang: number }>;
}

/**
 * **Lượt giao đang mở** của cả workspace — một câu, hai bảng tra.
 *
 * Định nghĩa "đang cầm" lấy từ mục 4 ("Người đang cầm: agent đang cầm **lượt
 * giao mở**") và 19.1 (lượt mở = `pending` hoặc `in_progress`). Đây là chiều
 * **ngược** của `nguoiDangCam`: hàm thuần kia trả lời "ticket này ai cầm", còn
 * dòng agent hỏi "agent này cầm những ticket nào" — cùng một quan hệ, nên điều
 * kiện lượt mở phải giống hệt. Chỉ bậc 1–2 của 19.1 (lượt `review`/`work` mở) có
 * mặt ở đây: bậc 3 là **người giao** chờ nghiệm thu và bậc 4 là chủ, không phải
 * "agent đang cầm" — và `the.nguoi_dang_cam` (do `nguoiDangCam` tính) vẫn nói
 * đúng hai bậc đó trên thẻ.
 *
 * `theo_ticket` áp **đúng** thứ tự ưu tiên của 19.1 bằng một phép **so hạng**
 * (`review` thắng `work`, `so_luot` lớn thắng), **không** bằng "dòng sau ghi đè"
 * như `boiCanhNguoiCamNhieu`: ở đây `ORDER BY` phải xếp theo `agent_id` trước
 * (để gom `theo_agent`), nên dòng cuối của một ticket là dòng của agent có id
 * lớn nhất, không phải dòng của lượt ưu tiên cao nhất. Một ticket có lượt `work`
 * của agent "A" và lượt `review` của agent "B" là đúng ca mà hai cách cho hai
 * câu trả lời khác nhau.
 *
 * Index: `ix_luot_giao_nguoi_nhan` có `(workspace_id, nguoi_nhan_agent_id,
 * trang_thai, …)`; câu này không ghim `nguoi_nhan_agent_id` nên nó quét theo
 * `workspace_id` rồi lọc — trên tập **lượt đang mở**, bị chặn bởi số agent.
 */
async function camDangMo(db: D1Database, workspace_id: string): Promise<CamDangMo> {
  const { results } = await db
    .prepare(
      `SELECT lg.nguoi_nhan_agent_id AS agent_id, lg.loai AS loai, lg.so_luot AS so_luot,
              coalesce(lg.nhan_luc, lg.tao_luc) AS tu_luc,
              t.id AS id, t.so AS so, t.tieu_de AS tieu_de,
              t.project_id AS project_id, t.trang_thai AS trang_thai,
              pr.ma AS du_an_ma
         FROM luot_giao lg
         JOIN ticket t  ON t.id = lg.ticket_id AND t.workspace_id = lg.workspace_id
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE lg.workspace_id = ? AND lg.trang_thai IN ('pending', 'in_progress')
          AND t.xoa_luc IS NULL
        ORDER BY lg.nguoi_nhan_agent_id, t.so,
                 CASE lg.loai WHEN 'review' THEN 1 ELSE 0 END, lg.so_luot
        LIMIT ?`,
    )
    .bind(workspace_id, TRAN_TICKET_DANG_CAM)
    .all<{
      agent_id: string;
      loai: string;
      so_luot: number;
      tu_luc: number;
      id: string;
      so: number;
      tieu_de: string;
      project_id: string;
      trang_thai: string;
      du_an_ma: string;
    }>();

  const theo_agent = new Map<string, TicketTroTa[]>();
  const theo_ticket = new Map<string, { agent_id: string; tu_luc: number; hang: number }>();
  for (const r of results) {
    const ds = theo_agent.get(r.agent_id) ?? [];
    // Một agent có thể giữ **hai** lượt mở trên cùng ticket (work và review của
    // chính nó) — dòng agent vẫn chỉ kể ticket đó **một** lần.
    if (!ds.some((t) => t.id === r.id)) ds.push(troTa(r));
    theo_agent.set(r.agent_id, ds);

    const hang = (r.loai === 'review' ? 1_000_000 : 0) + r.so_luot;
    const cu = theo_ticket.get(r.id);
    if (cu === undefined || hang > cu.hang) {
      theo_ticket.set(r.id, { agent_id: r.agent_id, tu_luc: r.tu_luc, hang });
    }
  }
  return { theo_agent, theo_ticket };
}

/* ================================================================== *
 * Khối 5 — Cần chú ý (d.321)
 * ================================================================== */

/**
 * **Gom theo ticket: mỗi ticket đúng MỘT dòng** — d.321.
 *
 * Thứ tự: **theo lần xuất hiện đầu tiên** trong danh sách phẳng, tức vẫn đúng
 * thứ tự sáu nguồn mà `khoiCanChuY` dựng (và trong mỗi nguồn vẫn là "chờ lâu
 * nhất trước"). Gom lại **không** được phép đổi thứ tự: chủ đọc khối này từ trên
 * xuống, và một ticket đã nằm đầu vì phiên của nó đứng 3 ngày thì nó phải ở đầu
 * kể cả khi lý do thứ hai của nó vừa mới sinh ra.
 *
 * Dòng **không gắn ticket nào** (nguồn thứ sáu: một tin Telegram không gửi được)
 * đứng **riêng từng dòng**, không gom chung: chúng không có gì chung ngoài việc
 * cùng không có ticket, và gộp chúng là bịa ra một thực thể không tồn tại.
 *
 * `luc` của nhóm là mốc **nhỏ nhất** — nhóm "đáng chú ý từ" lúc lý do cũ nhất
 * của nó bắt đầu.
 */
export function gomTheoTicket(ds: readonly DongCanChuY[]): NhomCanChuY[] {
  const ra: NhomCanChuY[] = [];
  const theo_ticket = new Map<string, NhomCanChuY>();

  for (const d of ds) {
    if (d.ticket === null) {
      ra.push({ khoa: `le:${d.loai}:${String(ra.length)}`, ticket: null, luc: d.luc, ly_do: [d] });
      continue;
    }
    const cu = theo_ticket.get(d.ticket.id);
    if (cu === undefined) {
      const nhom: NhomCanChuY = {
        khoa: `tk:${d.ticket.id}`,
        ticket: d.ticket,
        luc: d.luc,
        ly_do: [d],
      };
      theo_ticket.set(d.ticket.id, nhom);
      ra.push(nhom);
      continue;
    }
    cu.ly_do.push(d);
    cu.luc = Math.min(cu.luc, d.luc);
  }
  return ra;
}

/**
 * Sáu nguồn của d.321, **theo đúng thứ tự câu đó liệt kê**, mỗi nguồn sắp theo
 * `luc` **tăng dần** (cái chờ lâu nhất lên trước).
 *
 * SPEC không nói thứ tự giữa năm nguồn hay trong một nguồn (`cau-hoi-spec.md`
 * #103). Chọn thứ tự của chính d.319 vì nó là thứ duy nhất SPEC viết ra, và
 * "chờ lâu nhất trước" vì mục đích của khối là bắt chủ chú ý tới thứ đã bị bỏ
 * lâu nhất.
 *
 * ## Luật chung cho cả năm nguồn: KHOÁ SẮP TRÙNG KHOÁ LỌC trước khi cắt
 *
 * Mỗi nguồn có một trần (`TRAN_CAN_CHU_Y_MOI_NGUON`, và nguồn (1) còn ăn theo
 * `TRAN_PHIEN_MO`). Một trần chỉ an toàn khi **mọi** điều kiện lọc đã áp xong
 * trước lúc cắt, hoặc khi thứ tự sắp đúng là thứ tự mà điều kiện lọc đọc — nếu
 * không thì một dòng **thật sự đáng chú ý** bị một dòng không đáng chú ý chen
 * trước và mất im lặng. Nguồn (5) từng mắc đúng lỗi đó; xem khối ghi chú của
 * `cauChoKiemChungQuaHan`. Bốn nguồn còn lại **không** mắc, và mỗi nguồn vì một
 * lý do cụ thể, không vì may:
 *
 *   * **(1) phiên đứng hoặc lỗi** — lọc ở JavaScript (`stalled` là dẫn xuất, không
 *     có `WHERE` nào đúng được), nhưng `phienMoTrongWorkspace` sắp theo
 *     `tin_hieu_cuoi_luc` **tăng dần**, tức **chính** đại lượng quyết định
 *     `stalled` (im lâu nhất ⇒ chắc chắn đứng ⇒ lên đầu). Nên trần 500 chỉ bỏ
 *     được những phiên **mới có tín hiệu nhất**, tức những phiên không thể đứng.
 *     `.slice` đặt **sau** `.filter`, nên trần 50 cũng chỉ cắt dòng đã lọc.
 *   * **(2) lượt không phản hồi** — `han_phan_hoi_luc < bay_gio` nằm **trong**
 *     `WHERE`, và `ORDER BY han_phan_hoi_luc` là cùng cột đó.
 *   * **(3) không ai cầm** — lọc là cờ `co_khong_ai_cam = 1` trong `WHERE`; mọi
 *     dòng trả về đều đã đủ điều kiện, nên trần chỉ là trần.
 *   * **(4) bằng chứng trượt** — lọc `xac_minh = 'failed' AND rut_luc IS NULL`
 *     trong `WHERE`; như (3).
 */
async function khoiCanChuY(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
  phien_mo: readonly PhienMoRa[],
): Promise<DongCanChuY[]> {
  const [khong_phan_hoi, khong_ai_cam, bang_chung, cho_kiem_chung, tin_truot] =
    await Promise.all([
      nguonKhongPhanHoi(db, workspace_id, bay_gio),
      nguonKhongAiCam(db, workspace_id),
      nguonBangChungTruot(db, workspace_id),
      nguonChoKiemChungQuaHan(db, workspace_id, bay_gio),
      nguonTinGuiTruot(db, workspace_id),
    ]);

  const theo_luc = (ds: DongCanChuY[]): DongCanChuY[] =>
    [...ds].sort((a, b) => a.luc - b.luc);

  return [
    ...theo_luc(nguonPhienDungHoacLoi(phien_mo)),
    ...theo_luc(khong_phan_hoi),
    ...theo_luc(khong_ai_cam),
    ...theo_luc(bang_chung),
    ...theo_luc(cho_kiem_chung),
    ...theo_luc(tin_truot),
  ];
}

/**
 * (6) "**Không gửi được thông báo Telegram (lý do)**" — 19.12 câu 6 ("thử lại 3
 * lần"; vẫn trượt thì tin **giữ trong chuông**) + mục 12.
 *
 * Lọc là `gui_telegram_luc IS NULL AND gui_so_lan_thu >= SO_LAN_GUI_TOI_DA` (4 = 1
 * lần đầu + 3 lần thử lại của 19.12 câu 6) — tức **đã hết lượt
 * thử**, không phải "đang chờ thử lại": một tin vừa trượt lần đầu sẽ đi lại sau 10
 * giây, và đưa nó lên đây là làm khối này nhiễu đúng những lúc mạng chớp.
 *
 * `ly_do` là `gui_loi_ly_do`, một **câu tiếng Việt do Baton dựng và đã lọc**
 * (`locChuoiAnToan` của `nguon-telegram.ts`) — bot token **không bao giờ** đi vào
 * cột này, nên nó hiện lên UI được (danh sách cấm `CLAUDE.md` mục 5).
 *
 * Mọi điều kiện lọc nằm **trong** `WHERE`, và `ORDER BY tao_luc` là cột của chính
 * nó, nên trần ở đây chỉ là trần (xem luật chung ở trên).
 */
async function nguonTinGuiTruot(
  db: D1Database,
  workspace_id: string,
): Promise<DongCanChuY[]> {
  const { results } = await db
    .prepare(
      `SELECT id, loai, noi_dung, gui_loi_ly_do, tao_luc
         FROM thong_bao
        WHERE workspace_id = ? AND gui_telegram_luc IS NULL
          AND gui_so_lan_thu >= ${String(SO_LAN_GUI_TOI_DA)}
        ORDER BY tao_luc
        LIMIT ?`,
    )
    .bind(workspace_id, TRAN_CAN_CHU_Y_MOI_NGUON)
    .all<{
      id: string;
      loai: string;
      noi_dung: string;
      gui_loi_ly_do: string | null;
      tao_luc: number;
    }>();

  return results.map((r) =>
    dong('thong_bao_gui_truot', r.tao_luc, {
      thong_bao: { id: r.id, loai: r.loai, ly_do: r.gui_loi_ly_do },
    }),
  );
}

function dong(loai: LoaiCanChuY, luc: number, them: Partial<DongCanChuY> = {}): DongCanChuY {
  return {
    loai,
    nhan_loai: NHAN_CAN_CHU_Y[loai],
    luc,
    ticket: them.ticket ?? null,
    luot_giao: them.luot_giao ?? null,
    phien: them.phien ?? null,
    bang_chung: them.bang_chung ?? null,
    thong_bao: them.thong_bao ?? null,
  };
}

/**
 * (1) "**phiên đứng hoặc lỗi**" — d.321.
 *
 * Không một câu SQL riêng: `stalled` là **dẫn xuất, không ghi DB** (mục 6 d.184,
 * 19.12 câu 42), nên không có `WHERE trang_thai = 'stalled'` nào đúng được. Lọc
 * từ danh sách phiên mở đã dẫn xuất — cùng nguồn mà sức sống dự án đọc.
 *
 * `luc` là **tín hiệu cuối**: đó là mốc "đứng từ lúc nào", và cũng đúng mốc mà
 * `canhBaoDung` của d.196 dùng để chống bắn lặp.
 */
function nguonPhienDungHoacLoi(phien_mo: readonly PhienMoRa[]): DongCanChuY[] {
  return phien_mo
    .filter((p) => p.trang_thai === 'stalled' || p.trang_thai === 'error')
    // Lọc ticket đóng TRƯỚC `.slice` để trần 50 không bị dòng đã đóng chiếm chỗ.
    .filter((p) => !TRANG_THAI_DA_DONG.includes(p.ticket_trang_thai))
    .slice(0, TRAN_CAN_CHU_Y_MOI_NGUON)
    .map((p) =>
      dong('phien_dung_hoac_loi', p.tin_hieu_cuoi_luc, {
        phien: {
          id: p.phien_id,
          agent_id: p.agent_id,
          trang_thai: p.trang_thai,
          nhan_trang_thai: p.nhan_trang_thai,
        },
        ticket: troTa({
          id: p.ticket_id,
          so: p.ticket_so,
          tieu_de: p.ticket_tieu_de,
          project_id: p.project_id,
          du_an_ma: p.du_an_ma,
          trang_thai: p.ticket_trang_thai,
        }),
      }),
    );
}

/**
 * (2) "**lượt giao không phản hồi**" — d.321, định nghĩa ở **mục 5**: "quá hạn
 * phản hồi mà chưa nhận thì lượt hiện *Không phản hồi* ở Tổng quan (lượt **không
 * tự huỷ**)". Luật thuần là `laKhongPhanHoi`, và nó được gọi **lại** trên từng
 * dòng ở đây, không chỉ tin vào câu `WHERE`: câu SQL là **lọc cho rẻ** (nó đi
 * `ix_luot_giao_han_phan_hoi`, index riêng phần của đúng điều kiện này), còn
 * quyết định là của hàm thuần — cùng nếp `LOC_CAN_CANH_BAO` / `canhBaoDung`.
 *
 * **Khai thẳng: lớp hàm thuần ở đây là phòng thủ tầng hai, KHÔNG có test** — đo
 * bằng đột biến ở lượt này: bỏ câu `if` gọi `laKhongPhanHoi` thì **không ca nào
 * đỏ**. Lý do là hôm nay hai vế trùng nhau từng ca (`han < bay_gio` của SQL và
 * `bay_gio > han` của hàm thuần không có ca nào lệch, kể cả ở đúng mốc). Giữ lại
 * vì nó là thứ duy nhất còn đúng nếu một lượt sau nới câu `WHERE` (thêm một
 * trạng thái, đổi `<` thành `<=`) hoặc nếu mục 5 thêm một điều kiện cho "không
 * phản hồi" — lúc đó luật nằm ở **một** hàm, không ở hai câu SQL.
 *
 * `luc` là **hạn phản hồi**, không phải lúc tạo lượt: câu hỏi của khối này là
 * "quá hạn từ lúc nào".
 */
async function nguonKhongPhanHoi(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
): Promise<DongCanChuY[]> {
  const { results } = await db
    .prepare(
      `SELECT lg.id AS id, lg.loai AS loai, lg.trang_thai AS trang_thai,
              lg.nguoi_nhan_agent_id AS nguoi_nhan_agent_id,
              lg.han_phan_hoi_luc AS han_phan_hoi_luc,
              t.id AS ticket_id, t.so AS so, t.tieu_de AS tieu_de,
              t.project_id AS project_id, t.trang_thai AS ticket_trang_thai,
              pr.ma AS du_an_ma
         FROM luot_giao lg
         JOIN ticket t  ON t.id = lg.ticket_id AND t.workspace_id = lg.workspace_id
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE lg.workspace_id = ? AND lg.trang_thai = 'pending'
          AND lg.han_phan_hoi_luc IS NOT NULL AND lg.han_phan_hoi_luc < ?
          AND t.xoa_luc IS NULL AND ${SQL_TICKET_CHUA_DONG}
        ORDER BY lg.han_phan_hoi_luc
        LIMIT ?`,
    )
    .bind(workspace_id, bay_gio, TRAN_CAN_CHU_Y_MOI_NGUON)
    .all<{
      id: string;
      loai: string;
      trang_thai: 'pending';
      nguoi_nhan_agent_id: string;
      han_phan_hoi_luc: number;
      ticket_id: string;
      so: number;
      tieu_de: string;
      project_id: string;
      ticket_trang_thai: string;
      du_an_ma: string;
    }>();

  const ra: DongCanChuY[] = [];
  for (const r of results) {
    if (!laKhongPhanHoi({ trang_thai: r.trang_thai, han_phan_hoi_luc: r.han_phan_hoi_luc }, bay_gio)) {
      continue;
    }
    ra.push(
      dong('luot_giao_khong_phan_hoi', r.han_phan_hoi_luc, {
        luot_giao: { id: r.id, loai: r.loai, nguoi_nhan_agent_id: r.nguoi_nhan_agent_id },
        ticket: troTa({
          id: r.ticket_id,
          so: r.so,
          tieu_de: r.tieu_de,
          project_id: r.project_id,
          du_an_ma: r.du_an_ma,
          trang_thai: r.ticket_trang_thai,
        }),
      }),
    );
  }
  return ra;
}

/**
 * (3) ticket "**Đang làm mà không ai cầm**" — d.321.
 *
 * Đọc **cờ** `co_khong_ai_cam` của ticket, không tính lại: cờ đó do 19.1 bật
 * (24 giờ không ai cầm) và nó là cột duy nhất có index cho câu này
 * (`ix_ticket_co_co`). Tính lại ở đây là một bản thứ hai của luật 19.1, và nó sẽ
 * nói khác cái cờ mà màn hình ticket đang hiện.
 *
 * `luc` là `trong_tay_tu_luc` — mốc "không ai cầm từ lúc nào" của 19.1; rơi về
 * `cap_nhat_luc` cho dòng không có mốc đó.
 */
async function nguonKhongAiCam(db: D1Database, workspace_id: string): Promise<DongCanChuY[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id AS id, t.so AS so, t.tieu_de AS tieu_de, t.project_id AS project_id,
              t.trang_thai AS trang_thai, t.trong_tay_tu_luc AS trong_tay_tu_luc,
              t.cap_nhat_luc AS cap_nhat_luc, pr.ma AS du_an_ma
         FROM ticket t
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE t.workspace_id = ? AND t.xoa_luc IS NULL AND t.co_khong_ai_cam = 1
          AND ${SQL_TICKET_CHUA_DONG}
        ORDER BY coalesce(t.trong_tay_tu_luc, t.cap_nhat_luc)
        LIMIT ?`,
    )
    .bind(workspace_id, TRAN_CAN_CHU_Y_MOI_NGUON)
    .all<{
      id: string;
      so: number;
      tieu_de: string;
      project_id: string;
      trang_thai: string;
      trong_tay_tu_luc: number | null;
      cap_nhat_luc: number;
      du_an_ma: string;
    }>();

  return results.map((r) =>
    dong('ticket_khong_ai_cam', r.trong_tay_tu_luc ?? r.cap_nhat_luc, { ticket: troTa(r) }),
  );
}

/**
 * **Kết luận "Đạt" của một bằng chứng** — bảng 0.1 (`passed` Đạt; riêng `commit`
 * thì trạng thái tốt cuối cùng là `merged`).
 *
 * `pushed` **không** ở đây: nó nghĩa là "đã push, chưa merge" (19.7), tức chưa
 * kết luận gì — và lấy nó làm "Đạt" sẽ im lặng xoá một bằng chứng trượt thật.
 */
const XAC_MINH_DAT = ['passed', 'merged'] as const;

/**
 * (4) "**bằng chứng trượt**" — d.321, tức `xac_minh = 'failed'` (mục 7 d.220).
 *
 * Bằng chứng **đã rút** không tính (`rut_luc IS NULL` — d.222 "bằng chứng đã rút
 * không được tính"): để nó lại thì một dòng chủ đã dọn vẫn nằm mãi trong *Cần
 * chú ý*.
 *
 * ## "Trượt rồi Đạt lại" thì KHÔNG báo nữa — d.321, đợt 3
 *
 * d.321 (và 19.7: "`failed` **không chặn vĩnh viễn**: gửi bằng chứng mới là
 * được") đòi: một bằng chứng trượt mà **sau đó** đã có bằng chứng **cùng loại**
 * kết luận Đạt trên **cùng ticket** thì không báo nữa. Không có vế này, một
 * commit gõ sai rồi gửi lại đúng vẫn nằm mãi trong *Cần chú ý* — và một khối
 * toàn dòng đã xử lý là một khối chủ học cách bỏ qua.
 *
 * Ba lựa chọn trong vế `NOT EXISTS`, mỗi cái có lý do:
 *   * **cùng `loai`** — một `deploy` đạt không nói gì về một `commit` trượt;
 *   * **mốc muộn hơn** (`>`, trên cùng biểu thức `coalesce(xac_minh_luc,
 *     gui_luc)` mà cột `luc` của dòng dùng) — một bằng chứng đạt **trước** đó
 *     là thứ mà commit mới đã làm hết hiệu lực (19.3), không phải một lời cải
 *     chính;
 *   * **`rut_luc IS NULL`** cho cả bằng chứng đạt: một "Đạt" đã bị rút không
 *     che được một "Trượt" (d.222).
 *
 * Vế nằm **trong** `WHERE`, nên trần `TRAN_CAN_CHU_Y_MOI_NGUON` vẫn chỉ cắt
 * những dòng **đã lọc** — xem luật chung ở `khoiCanChuY`.
 */
async function nguonBangChungTruot(
  db: D1Database,
  workspace_id: string,
): Promise<DongCanChuY[]> {
  const dat = XAC_MINH_DAT.map((x) => `'${x}'`).join(', ');
  const { results } = await db
    .prepare(
      `SELECT e.id AS id, ${sqlLoaiBangChung('e')} AS loai, e.ly_do AS ly_do,
              coalesce(e.xac_minh_luc, e.gui_luc) AS luc,
              t.id AS ticket_id, t.so AS so, t.tieu_de AS tieu_de,
              t.project_id AS project_id, t.trang_thai AS trang_thai,
              pr.ma AS du_an_ma
         FROM evidence e
         JOIN ticket t  ON t.id = e.ticket_id AND t.workspace_id = e.workspace_id
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE e.workspace_id = ? AND e.xac_minh = 'failed' AND e.rut_luc IS NULL
          AND t.xoa_luc IS NULL AND ${SQL_TICKET_CHUA_DONG}
          AND NOT EXISTS (
            SELECT 1 FROM evidence e2
             WHERE e2.workspace_id = e.workspace_id AND e2.ticket_id = e.ticket_id
               AND e2.loai = e.loai AND e2.rut_luc IS NULL
               AND e2.xac_minh IN (${dat})
               AND coalesce(e2.xac_minh_luc, e2.gui_luc) > coalesce(e.xac_minh_luc, e.gui_luc)
          )
        ORDER BY luc
        LIMIT ?`,
    )
    .bind(workspace_id, TRAN_CAN_CHU_Y_MOI_NGUON)
    .all<{
      id: string;
      loai: string;
      ly_do: string | null;
      luc: number;
      ticket_id: string;
      so: number;
      tieu_de: string;
      project_id: string;
      trang_thai: string;
      du_an_ma: string;
    }>();

  return results.map((r) =>
    dong('bang_chung_truot', r.luc, {
      bang_chung: { id: r.id, loai: r.loai, ly_do: r.ly_do },
      ticket: troTa({
        id: r.ticket_id,
        so: r.so,
        tieu_de: r.tieu_de,
        project_id: r.project_id,
        du_an_ma: r.du_an_ma,
        trang_thai: r.trang_thai,
      }),
    }),
  );
}

/**
 * (5) "ticket **Chờ kiểm chứng quá 24 giờ**" — d.321.
 *
 * **Quá 24 giờ kể từ lúc nào?** SPEC không nói, và không có cột nào ghi "vào
 * `verifying` lúc nào" (`cau-hoi-spec.md` #104). Ba nguồn có thật:
 *   * `cap_nhat_luc` — **sai**: nó nhích vì mọi lần sửa, nên thêm một nhãn cho
 *     một ticket đã chờ ba ngày sẽ đặt lại đồng hồ về 0, tức luật này **không
 *     bao giờ** chạy đúng ca duy nhất nó cần chạy;
 *   * `bat_dau_luc` — là lúc vào **Đang làm**, không phải vào Chờ kiểm chứng;
 *   * **`ticket_history`** — dòng `truong = 'trang_thai'`,
 *     `gia_tri_moi = 'verifying'` **gần nhất**. Đó là bản ghi duy nhất nói đúng
 *     điều cần, và nó là bảng **chỉ thêm** (mục 4 Lịch sử), nên mốc không bị sửa
 *     lén.
 *
 * Ticket không có dòng lịch sử nào (dữ liệu nhập của mục 16, hay fixture) rơi về
 * `cap_nhat_luc` — thà đếm một mốc gần đúng còn hơn bỏ hẳn ticket khỏi khối này.
 *
 * ## KHOÁ SẮP PHẢI TRÙNG KHOÁ LỌC — lỗi của lượt trước, reviewer bắt
 *
 * Bản đầu làm hai chặng: lấy `LIMIT 50` ticket `verifying` **xếp theo
 * `cap_nhat_luc`**, rồi mới lọc quá-24-giờ bằng mốc lịch sử ở phía JavaScript.
 * Hai khoá khác nhau, và hệ quả là một lỗ **mất dòng**: workspace có hơn 50
 * ticket `verifying` thì một ticket đã chờ ba ngày nhưng vừa bị sửa một nhãn
 * (⇒ `cap_nhat_luc` mới nhất) rơi khỏi 50 dòng đầu và **mất hẳn** khỏi *Cần chú
 * ý* — đúng cái mà d.319 tồn tại để chủ không bỏ sót. Và nó mất **im lặng**: số
 * dòng trả về vẫn trông hợp lý.
 *
 * Nên bây giờ **lọc và sắp nằm trọn trong SQL, trên cùng một biểu thức**
 * `vao_luc`: không có cách nào để `LIMIT` cắt một dòng quá hạn trước một dòng
 * chưa quá hạn. Cắt chỉ còn nghĩa "quá 50 dòng quá hạn", và khi đó nó cắt các
 * dòng **mới nhất**, giữ lại dòng chờ lâu nhất — hướng đúng.
 *
 * Giá phải trả, khai thẳng: `vao_luc` là một **truy vấn con tương quan**, nên
 * SQLite chạy nó một lần cho mỗi ticket `verifying` của workspace. Chấp nhận
 * được vì (a) tập đó bị chặn bởi số việc đang chờ chủ kiểm, không bởi 200.000
 * ticket, và (b) mỗi lần chạy là **một** lần tìm trong `ix_ticket_history_ticket`
 * (`ticket_id, luc DESC`), không một lần quét. Đổi lại là một luật không còn chỗ
 * mất dòng, và **một** câu thay vì hai.
 *
 * Bọc trong một `SELECT … FROM (…)` thay vì dùng bí danh `vao_luc` thẳng trong
 * `WHERE`: SQLite cho làm thế như một phần mở rộng, nhưng đó là cú pháp không
 * chuẩn và nó sẽ âm thầm đổi nghĩa nếu lớp D1 bên dưới đổi.
 */
export function cauChoKiemChungQuaHan(
  workspace_id: string,
  bay_gio: number,
): { sql: string; bind: (string | number)[] } {
  return {
    sql: `SELECT * FROM (
            SELECT t.id AS id, t.so AS so, t.tieu_de AS tieu_de,
                   t.project_id AS project_id, t.trang_thai AS trang_thai,
                   pr.ma AS du_an_ma,
                   coalesce(
                     (SELECT max(h.luc) FROM ticket_history h
                       WHERE h.workspace_id = t.workspace_id AND h.ticket_id = t.id
                         AND h.truong = 'trang_thai' AND h.gia_tri_moi = 'verifying'),
                     t.cap_nhat_luc
                   ) AS vao_luc
              FROM ticket t
              JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
             WHERE t.workspace_id = ? AND t.xoa_luc IS NULL AND t.trang_thai = 'verifying'
          )
          WHERE vao_luc <= ?
          ORDER BY vao_luc, id
          LIMIT ?`,
    /*
     * `vao_luc <= bay_gio - HAN` **là** `bay_gio - vao_luc >= HAN`, tức đúng mốc
     * `>=` (không `>`) mà `trangThaiPhienDanXuat` đã chốt cho "im 30 phút" của
     * nghiệm thu 17.3: ở đúng giờ thứ 24 đã là quá hạn. Có ca test ghim biên.
     */
    bind: [workspace_id, bay_gio - HAN_CHO_KIEM_CHUNG_MS, TRAN_CAN_CHU_Y_MOI_NGUON],
  };
}

async function nguonChoKiemChungQuaHan(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
): Promise<DongCanChuY[]> {
  const cau = cauChoKiemChungQuaHan(workspace_id, bay_gio);
  const { results } = await db
    .prepare(cau.sql)
    .bind(...cau.bind)
    .all<{
      id: string;
      so: number;
      tieu_de: string;
      project_id: string;
      trang_thai: string;
      du_an_ma: string;
      vao_luc: number;
    }>();

  return results.map((r) =>
    dong('ticket_cho_kiem_chung_qua_24h', r.vao_luc, { ticket: troTa(r) }),
  );
}

/* ================================================================== *
 * Khối 4 — Vừa xong (d.320)
 * ================================================================== */

/**
 * "ticket **Xong**, chọn cửa sổ **24 giờ** hoặc **7 ngày**, kèm **bằng chứng rút
 * gọn** (hash 7 ký tự, URL, mã phiên bản)" — d.320.
 *
 * Hàm đọc **cửa sổ dài** (7 ngày) một lần; `tongQuan` cắt tập 24 giờ ra từ chính
 * danh sách ấy. Hai câu cho hai cửa sổ là hai ảnh chụp, và một query thứ hai mỗi
 * lần chủ bấm đổi nút là đúng thứ d.410 cấm ("một đường đọc duy nhất").
 *
 * Hai câu: ticket (đi `ix_ticket_xong_luc`, index riêng phần của đúng điều kiện
 * `xong_luc IS NOT NULL`), rồi **một** câu bằng chứng cho cả danh sách. Không
 * `1 + n`.
 *
 * **Trần là trần của cửa sổ 7 ngày**, khai thẳng: một workspace xong hơn
 * `TRAN_VUA_XONG` việc trong 7 ngày thì tập 24 giờ vẫn **đủ** (danh sách sắp
 * `xong_luc DESC`, nên trần cắt từ phía cũ), nhưng danh sách 7 ngày bị cắt bớt
 * phần cũ nhất.
 */
async function khoiVuaXong(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
): Promise<DongVuaXong[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id AS id, t.so AS so, t.tieu_de AS tieu_de, t.project_id AS project_id,
              t.trang_thai AS trang_thai, t.xong_luc AS xong_luc, pr.ma AS du_an_ma
         FROM ticket t
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE t.workspace_id = ? AND t.xoa_luc IS NULL AND t.trang_thai = 'done'
          AND t.xong_luc IS NOT NULL AND t.xong_luc >= ?
        ORDER BY t.xong_luc DESC, t.id DESC
        LIMIT ?`,
    )
    .bind(workspace_id, bay_gio - CUA_SO_VUA_XONG_7N_MS, TRAN_VUA_XONG)
    .all<{
      id: string;
      so: number;
      tieu_de: string;
      project_id: string;
      trang_thai: string;
      xong_luc: number;
      du_an_ma: string;
    }>();
  if (results.length === 0) return [];

  const bc = await bangChungCuaTicket(
    db,
    workspace_id,
    results.map((r) => r.id),
  );

  return results.map((r) => ({
    ticket: troTa(r),
    xong_luc: r.xong_luc,
    bang_chung: bc.get(r.id) ?? [],
  }));
}

/**
 * Bằng chứng **rút gọn** của nhiều ticket — d.320.
 *
 * Bằng chứng đã **rút** không ra (d.222). Hash cắt bằng `hashRutGon` của
 * `@baton/shared`, không `slice(0, 7)` viết tại chỗ: con số 7 là của SPEC và nó
 * phải nằm một chỗ.
 */
export async function bangChungCuaTicket(
  db: D1Database,
  workspace_id: string,
  ticket_ids: readonly string[],
): Promise<Map<string, BangChungRutGon[]>> {
  const ra = new Map<string, BangChungRutGon[]>();
  /*
   * Chia lô (`chia-lo-tham-so.ts`): 1 tham số khác (`workspace_id`). Bản cũ cắt
   * 90 id + 1 = 91 tham số — đếm thiếu. `ORDER BY ticket_id, gui_luc, id` chỉ cần
   * đúng **trong một ticket** (kết quả là bảng tra theo ticket), và mỗi ticket
   * nằm trọn một lô (hàm chia bỏ trùng) ⇒ thứ tự bằng chứng của từng ticket giữ
   * nguyên. Các lô chạy lần lượt như bản cũ.
   */
  for (const lo of chiaLoThamSo(ticket_ids, 1)) {
    const cho = dauHoi(lo);
    const { results } = await db
      .prepare(
        `SELECT id, ticket_id, ${sqlLoaiBangChung()} AS loai, commit_hash, repo, url,
                ma_phien_ban, xac_minh,
                nguon_xac_minh, review_nguon, review_bao_cao,
                bao_cao_nguon, bao_cao_reviewer, duong_dan, noi_dung,
                gui_luc
           FROM evidence
          WHERE workspace_id = ? AND ticket_id IN (${cho}) AND rut_luc IS NULL
          ORDER BY ticket_id, gui_luc, id`,
      )
      .bind(workspace_id, ...lo)
      .all<{
        id: string;
        ticket_id: string;
        loai: string;
        commit_hash: string | null;
        repo: string | null;
        url: string | null;
        ma_phien_ban: string | null;
        xac_minh: XacMinhBangChung;
        nguon_xac_minh: string | null;
        review_nguon: string | null;
        review_bao_cao: string | null;
        bao_cao_nguon: string | null;
        bao_cao_reviewer: string | null;
        duong_dan: string | null;
        noi_dung: string | null;
        gui_luc: number;
      }>();

    for (const r of results) {
      const ds = ra.get(r.ticket_id) ?? [];
      ds.push({
        id: r.id,
        loai: r.loai,
        nhan_loai: nhan('loai_bang_chung', r.loai),
        hash: hashRutGon(r.commit_hash),
        repo: r.repo,
        url: r.url,
        ma_phien_ban: r.ma_phien_ban,
        xac_minh: r.xac_minh,
        nhan_xac_minh: nhan('xac_minh_bang_chung', r.xac_minh),
        /*
         * Hai nguồn của migration 0022. Kiểm lại vốn giá trị khi **đọc**, không
         * tin cột: dữ liệu nhập của mục 16 ghi thẳng vào bảng, và một chuỗi lạ ở
         * đây sẽ thành một nhãn lạ trên màn hình của chủ.
         */
        nguon_xac_minh: laNguonXacMinhMerged(r.nguon_xac_minh) ? r.nguon_xac_minh : null,
        nhan_nguon_xac_minh: laNguonXacMinhMerged(r.nguon_xac_minh)
          ? NHAN_NGUON_XAC_MINH[r.nguon_xac_minh]
          : null,
        review_nguon: laNguonReview(r.review_nguon) ? r.review_nguon : null,
        nhan_review_nguon: laNguonReview(r.review_nguon)
          ? NHAN_NGUON_REVIEW[r.review_nguon]
          : null,
        review_bao_cao: r.review_bao_cao,
        /*
         * Bằng chứng `bao_cao` (migration 0027, #161): nguồn ký + đường dẫn/nội
         * dung + báo cáo reviewer. Chỉ điền cho dòng báo cáo — `duong_dan`/`noi_dung`
         * của `file`/`note` thường không vào khối rút gọn này (giữ hình cũ).
         */
        bao_cao_nguon: laNguonBaoCao(r.bao_cao_nguon) ? r.bao_cao_nguon : null,
        nhan_bao_cao_nguon: laNguonBaoCao(r.bao_cao_nguon)
          ? NHAN_NGUON_BAO_CAO[r.bao_cao_nguon]
          : null,
        bao_cao_duong_dan: r.loai === 'bao_cao' ? r.duong_dan : null,
        bao_cao_noi_dung: r.loai === 'bao_cao' ? r.noi_dung : null,
        bao_cao_reviewer: r.loai === 'bao_cao' ? r.bao_cao_reviewer : null,
      });
      ra.set(r.ticket_id, ds);
    }
  }
  return ra;
}

