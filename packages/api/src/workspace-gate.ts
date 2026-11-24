/**
 * `WorkspaceGate` — **cửa ghi duy nhất** của một workspace.
 *
 * Một Durable Object cho mỗi workspace, id dẫn xuất từ `workspace_id`.
 *
 * Vì sao phải qua đây: D1 **không có giao dịch tương tác**. Không mở được một
 * transaction rồi đọc, quyết định, rồi ghi trong cùng giao dịch — chỉ có
 * `batch()`, một nhóm câu lệnh biết trước, cùng thành hoặc cùng hỏng. Mà mọi
 * luật của SPEC đều là đọc-kiểm-ghi (số ticket không tái dùng mục 4, cổng bằng
 * chứng mục 7, "tối đa 1 lượt mở" mục 19.1, `T-số` mục 8). Làm thẳng trên D1 thì
 * hai request song song cùng đọc rồi cùng ghi và dữ liệu sai.
 *
 * DO giải việc đó: mọi lệnh GHI vào đây, được xếp hàng tuần tự (xem `hangDoi`),
 * phần quyết định chạy một mình, phần ghi gom vào đúng một `batch()`.
 * Lệnh ĐỌC **không** qua DO, đi thẳng D1 để không nghẽn ở một đối tượng.
 *
 * DO cũng là **chỗ đánh thức** các lệnh chờ dài: `baton tasks --wait 60`,
 * `baton result T-x --wait` (SPEC mục 13), và yêu cầu "agent nhận kết quả trong
 * vòng 3 giây sau khi chủ bấm Gửi" (SPEC mục 8). Sổ `waiter` dưới đây giữ các
 * lệnh đang treo; `danhThuc(chu_de)` gọi chúng dậy ngay khi dữ liệu đổi.
 */

import {
  BatonError,
  CHO_THU_LAI_MS,
  HAN_XAC_NHAN_DUNG_MS,
  SO_LAN_GUI_TOI_DA,
  THEO_DOI_COMMIT_MS,
  canNhacDo,
  canhBaoDung,
  LOAI_TIN_BAO_CAO,
  maCanChu,
  mocThuLaiGui,
  quyetDinhBaoChuaMerge,
  quyetDinhThuLai,
  tinBiTat,
  type LoaiBaoCao,
  type MaLoi,
  type NguonXacMinhMerged,
  type TacGia,
  type TrangThaiTicket,
} from '@baton/shared';
import type { Env } from './moi-truong.js';
import { congBangChungCua } from './cong-bang-chung.js';
import { sqlLoaiBangChung } from './loai-bang-chung.js';
import { boSinhMucXacNhan, cauDongMucXacNhanKhiXong } from './muc-xac-nhan.js';
import { apSuKienLenTicket } from './lenh-trang-thai.js';
import { ticketBatBuoc } from './lenh-ticket.js';
import { boiCanhNguoiCamCua } from './doc-luot-giao.js';
import { danXuat, phienLuuCua, phienTheoId } from './doc-phien.js';
import {
  KENH_CHO_GUI,
  LOAI_TIN_CAN_CHU_DO,
  tinCanhBaoPhien,
  tinChuaMergeSau7Ngay,
  tinNhacCanChuDo,
  type TinCanhBaoPhien,
  type TinChuaMerge,
} from './thong-bao.js';
import type { KetQuaXacMinh } from './xac-minh-bang-chung.js';
import { congTacDangTat } from './cai-dat-thong-bao.js';
import { batonErrorTuLoiD1 } from './loi-d1.js';
import { dinhDanhDeLog, ghiDongLoi, loaiBangChungDeLog, moTaLoi } from './nhat-ky-loi.js';
import {
  SO_DANG_KY_HANDLER,
  laLoaiLenh,
  tacGiaCua,
  type BoiCanhLenh,
  type KetQuaCuaLenh,
  type Lenh,
  type YeuCauGhiLichSu,
} from './lenh.js';
import {
  CHO_DAI_TOI_DA_GIAY,
  aiGoiCua,
  chuDeKeoViec,
  phienMoMinhGiao,
  viecCuaToi,
  type AiKeoViec,
  type ViecCuaToi,
  type ViecCuaToiRa,
} from './doc-viec.js';
import { chuDeChoCanChu, layMucCanChu, type MucCanChuRa } from './doc-can-chu.js';
import { agentTheoToken } from './xac-thuc.js';
import {
  chamPhienChu,
  dangNhapChu,
  dangXuatChu,
  datLaiTotpChu,
  doiMatKhauChu,
  moKhoaChu,
  thietLapChu,
  type KetQuaDangNhapChu,
  type KetQuaDangXuatChu,
  type KetQuaDatLaiTotpChu,
  type KetQuaDoiMatKhauChu,
  type KetQuaMoKhoaChu,
  type KetQuaThietLapChu,
  type YeuCauChamPhienChu,
  type YeuCauDangNhapChu,
  type YeuCauDangXuatChu,
  type YeuCauDatLaiTotpChu,
  type YeuCauDoiMatKhauChu,
  type YeuCauMoKhoaChu,
  type YeuCauThietLapChu,
} from './chu-dang-nhap.js';

/**
 * Tác giả của thay đổi do **hệ thống** — SPEC mục 7 d.221: "tự sang Xong, lịch sử
 * ghi người làm là **'hệ thống'**". Cùng giá trị với `HE_THONG` của
 * `lenh-trang-thai.ts`; `ticket_history.tac_gia_loai` nhận `system` từ 0001.
 */
const HE_THONG: TacGia = { loai: 'system' };

/**
 * Thân phản hồi của DO.
 *
 * `retry_after` để `RATE_LIMITED` của hạn mức chống dò mật khẩu (mục 15, xem
 * `chu-dang-nhap.ts`) mang được số giây chờ ra tới header `Retry-After` của SPEC
 * mục 13. Không có nó thì một 429 dựng lại từ thân sẽ **mất** con số, và client
 * phải đoán.
 */
export type PhanHoiLenh<T> =
  | { ok: true; ket_qua: T }
  | { ok: false; error: MaLoi; message: string; retry_after?: number | undefined };

/**
 * Yêu cầu chờ dài của đường kéo việc (SPEC mục 13 d.352).
 *
 * `ai` tới từ danh tính **đã xác thực** ở middleware, không từ query của client:
 * không có đường nào để một agent xin chờ việc của agent khác. `workspace_id`
 * cũng vậy, và nó còn là **id của chính DO này**, nên chờ xuyên workspace không
 * có đường tồn tại.
 */
export interface YeuCauChoViec {
  workspace_id: string;
  ai: AiKeoViec;
  han_ms: number;
}

/**
 * Yêu cầu chờ dài của `baton result T-<số> --wait` — SPEC mục 8 d.267 ("nhận kết
 * quả **trong vòng 3 giây** sau khi chủ bấm Gửi"), mục 13 d.376, 19.9 d.543.
 *
 * `ma_hoac_id` là chuỗi **thô** của client (`T-18`, hay một id). Nó **không** đi
 * thẳng vào chủ đề đánh thức: `choCanChu` tra mục qua `layMucCanChu` (tức qua cửa
 * tầm nhìn) rồi lấy `ma` của **dòng đọc được** — xem `chuDeChoCanChu`.
 */
export interface YeuCauChoCanChu {
  workspace_id: string;
  ai: AiKeoViec;
  ma_hoac_id: string;
  han_ms: number;
}

/**
 * Một mục Cần Chủ cộng kết luận của lần chờ — thân phản hồi của `baton result`.
 *
 * `het_gio` là **một cờ tường minh**, không một thứ CLI phải suy từ `trang_thai`:
 * 19.9 d.543 nói `baton result --wait` hết thời gian mà mục chưa xử lý thì in
 * "chưa xử lý" và thoát **mã 4** ("hết thời gian chờ"), còn một lần gọi **không**
 * `--wait` trên cùng một mục `open` là chuyện bình thường, thoát **mã 0**. Hai ca
 * có cùng `trang_thai: 'open'` và khác hẳn mã thoát, nên tầng API phải nói ra
 * điều phân biệt chúng chứ không để phần 5 đoán.
 */
export interface KetQuaCanChuRa extends MucCanChuRa {
  /** Đã chờ hết hạn mà mục vẫn `open` — CLI thoát **mã 4** (19.9 d.543). */
  het_gio: boolean;
  /** Số ms đã chờ thực tế (0 khi không dùng `--wait`). */
  da_cho_ms: number;
  /** Trần chờ dài của server, giây — để client thấy mình có bị kẹp không. */
  cho_toi_da_giay: number;
}

/**
 * **Chặng nào** đang ghi kết luận. Một trường, ba giá trị — không ba đường ghi:
 * luật đếm lần thử (d.220) và trạng thái nguồn hợp lệ khác nhau theo chặng, và để
 * người gọi tự ghi `so_lan_thu` là mở đúng cái cửa mà `ghiXacMinh` tồn tại để
 * đóng.
 *
 *   * `gui`      — lần chạy **ngay khi gửi** (d.219). Dòng phải đang `pending`;
 *                  `so_lan_thu` **không** nhích (xem `quyet-dinh.md`).
 *   * `thu_lai`  — một lần **thử lại** của Cron (d.220). Dòng phải đang `pending`;
 *                  `so_lan_thu` nhích, hết 3 lần thì `failed` kèm lý do.
 *   * `theo_doi` — một lần **kiểm lại commit `pushed`** (d.221 + 19.7). Dòng phải
 *                  đang `pushed`; chỉ ghi khi có kết luận **dứt điểm**.
 */
export type NguonGhiXacMinh = 'gui' | 'thu_lai' | 'theo_doi';

/**
 * Yêu cầu ghi kết luận xác minh — chặng 3, xem `WorkspaceGate.ghiXacMinh`.
 * Chỉ Worker dựng được (binding DO không ra ngoài Internet).
 */
export interface YeuCauGhiXacMinh {
  workspace_id: string;
  bang_chung_id: string;
  nguon: NguonGhiXacMinh;
  ket_qua: KetQuaXacMinh;
}

export interface KetQuaGhiXacMinh {
  /**
   * `false` = dòng không ở trạng thái mà chặng này được ghi (đã kết luận khác, đã
   * rút, hoặc lần kiểm lại không có gì mới) nên **không ghi gì**.
   */
  da_ghi: boolean;
  /** Trạng thái xác minh **sau cùng** của dòng. */
  xac_minh: string | null;
  ly_do: string | null;
  /** Mốc thử lại (d.220), `null` khi đã có kết luận. */
  thu_lai_luc: number | null;
  /** Số lần **thử lại** đã ghi — d.220 "tối đa 3 lần". */
  so_lan_thu: number;
  /**
   * Ticket đã **tự lên Xong** ở lượt ghi này chưa — d.221 + 19.2. `false` cho mọi
   * ca khác, kể cả ca cổng đủ mà ticket không ở Chờ kiểm chứng.
   */
  tu_len_xong: boolean;
  /** Trạng thái ticket **sau** lượt ghi này; `null` khi không ghi gì. */
  ticket_trang_thai: TrangThaiTicket | null;
  /**
   * **Nguồn** của kết luận `merged`/`pushed` — `github` hay `local` (migration
   * 0022 khối A). `null` ở mọi ca khác. Trả ra để CLI và web đọc được nguồn qua
   * đúng đường HTTP, không phải dò DB.
   */
  nguon_xac_minh: NguonXacMinhMerged | null;
}

/**
 * Yêu cầu **dừng theo dõi** một commit `pushed` đã quá 7 ngày — 19.7.
 * Không có chặng gọi mạng nào cho việc này: nó chỉ so hai con số.
 */
export interface YeuCauDungTheoDoi {
  workspace_id: string;
  bang_chung_id: string;
}

export interface KetQuaDungTheoDoi {
  /** `false` = dòng không còn ở ca "pushed + quá hạn" nên bỏ qua. */
  da_ghi: boolean;
  /** 19.7 "Bằng chứng mang nhãn 'chưa merge sau 7 ngày'". */
  mang_nhan: boolean;
  /** 19.7 "Telegram báo **1 lần**": tin **vừa** dựng ở lượt này, hoặc `null`. */
  tin: TinChuaMerge | null;
  /** Kênh gửi — `cho_cron`: tin chờ cron gửi (xem `KENH_CHO_GUI`). */
  kenh: string | null;
}

/**
 * Yêu cầu **ghi mốc cảnh báo + chèn tin vào kho** cho một phiên — SPEC mục 6 d.196,
 * 19.12 câu 46. Xem `WorkspaceGate.ghiMocCanhBao`.
 *
 * **Chỉ có `phien_id`, và đó là điểm chính.** Người gọi (Cron) **không** gửi vào
 * đây kết luận "phiên này cần bắn" hay mốc cần ghi: cả hai được tính **lại** bên
 * trong cửa ghi từ dòng đọc lại. Xem `#ghiMotMocCanhBao`.
 */
export interface YeuCauGhiMocCanhBao {
  workspace_id: string;
  phien_id: string;
}

export interface KetQuaGhiMocCanhBao {
  /**
   * `false` = **không ghi gì**: phiên không còn ở `stalled`/`error` lúc ghi, hoặc
   * mốc của lần chuyển sang này đã được bắn rồi (d.196 "bắn **1** thông báo").
   */
  da_ghi: boolean;
  /** Tin **vừa** dựng và **vừa vào kho** ở lượt ghi này, hoặc `null`. */
  tin: TinCanhBaoPhien | null;
  /** `id` dòng `thong_bao` vừa chèn — `null` khi không ghi gì. */
  thong_bao_id: string | null;
  /** Giá trị vừa ghi vào `phien.canh_bao_tin_hieu_luc`; `null` khi không ghi gì. */
  moc_moi: number | null;
  /** Kênh gửi ra ngoài — `cho_cron`: tin chờ cron gửi (xem `KENH_CHO_GUI`). */
  kenh: string | null;
}

/* ------------------------------------------------------------------ *
 * Hai đường ghi của phần 7 — SPEC mục 12, mục 8 d.283
 * ------------------------------------------------------------------ */

/**
 * Yêu cầu **ghi kết quả một lần gửi ra kênh ngoài** — SPEC mục 12, 19.12 câu 6.
 *
 * Chỉ có `thong_bao_id` và **kết quả của lần gửi**, không có mốc nào: mốc
 * `gui_telegram_luc` và mốc thử lại được tính **bên trong** cửa ghi, từ dòng đọc
 * lại. Xem `#ghiMotMocGui`.
 */
export interface YeuCauGhiMocGui {
  workspace_id: string;
  thong_bao_id: string;
  /**
   * `ly_do` chỉ có khi trượt, và nó là **câu tiếng Việt đã lọc** (không secret).
   *
   * `{ tat: true }` (BAT-16, d.348): cron thấy chủ đã **tắt** loại tin này — cửa
   * ghi kiểm **lại** công tắc rồi đặt mốc `bo_qua_gui_luc` (tin rời hàng chờ,
   * vẫn ở chuông). Không gửi gì ra ngoài.
   */
  ket_qua: { da_gui: true } | { da_gui: false; ly_do: string } | { tat: true };
}

export interface KetQuaGhiMocGui {
  /** `false` = không ghi gì: tin đã có mốc gửi, hoặc không còn ở trạng thái đó. */
  da_ghi: boolean;
  /** Mốc vừa ghi vào `gui_telegram_luc`; `null` khi lần gửi này trượt. */
  gui_luc: number | null;
  /** Số lần đã thử **sau** lượt ghi này — 19.12 câu 6. */
  so_lan_thu: number;
  /** Mốc thử lại kế tiếp; `null` = đã gửi xong, hoặc hết 3 lần. */
  thu_lai_luc: number | null;
}

/**
 * Yêu cầu **nhắc một mục 🔴 chưa xử lý sau 2 giờ** — SPEC mục 8 d.283, mục 12
 * d.341.
 *
 * Chỉ có `can_chu_id`, cùng lý do của `YeuCauGhiMocCanhBao`: kết luận "mục này
 * cần nhắc" được tính **lại** trong cửa ghi, không nhận từ Worker.
 */
export interface YeuCauNhacCanChuDo {
  workspace_id: string;
  can_chu_id: string;
}

export interface KetQuaNhacCanChuDo {
  /** `false` = **không ghi gì**: mục đã xử lý, chưa tới 2 giờ, hoặc đã nhắc rồi. */
  da_ghi: boolean;
  /** `id` dòng `thong_bao` vừa chèn — `null` khi không ghi gì. */
  thong_bao_id: string | null;
  /** Nội dung tin nhắc vừa dựng — `null` khi không ghi gì. */
  noi_dung: string | null;
  /** Mốc vừa ghi vào `can_chu.nhac_do_luc` — mốc chống nhắc lặp (d.291). */
  nhac_luc: number | null;
  /** Kênh gửi ra ngoài — `cho_cron` (xem `KENH_CHO_GUI`). */
  kenh: string | null;
}

/* ------------------------------------------------------------------ *
 * Sinh một báo cáo — SPEC mục 11 d.322–336, mục 12 d.346
 * ------------------------------------------------------------------ */

/**
 * Yêu cầu **ghi một báo cáo đã dựng xong + một tin vào kho** — mục 11 d.336, mục
 * 12 d.346. Xem `WorkspaceGate.sinhBaoCao`.
 *
 * Khác ba đường ghi kia của Cron (`ghiMocCanhBao`, `ghiMocGui`, `nhacCanChuDo`),
 * yêu cầu này **mang theo nội dung**: markdown, JSON và chữ của tin được dựng ở
 * Worker, ngoài cửa ghi. Đó **không** phải "nhận kết luận của Worker" theo nghĩa
 * mà ba đường kia cấm — kết luận ở đây là câu *"ngày này đã có báo cáo chưa"*, và
 * nó vẫn được quyết **bên trong** cửa ghi, bằng khoá chính của `bao_cao`.
 *
 * Vì sao nội dung dựng ngoài: dựng nó cần `tongQuan()` (năm khối, nhiều câu đọc,
 * trần tới 200 dòng mỗi khối) cộng năm câu đọc nữa. Chạy chúng **trong** DO sẽ
 * giữ hàng đợi ghi của cả workspace suốt thời gian đó — cùng ràng buộc mà
 * `cron-thong-bao.ts` và `cron-bang-chung.ts` đã khai cho chặng gọi mạng, và một
 * lượt đọc nặng là cùng loại vấn đề.
 */
export interface YeuCauSinhBaoCao {
  workspace_id: string;
  /** `YYYY-MM-DD` trên tường — `ngayDiaPhuong`, tức qua `MUI_GIO_CHU_PHUT`. */
  ngay: string;
  loai: LoaiBaoCao;
  noi_dung_md: string;
  du_lieu_json: string;
  /** Chữ của tin Telegram — một dòng tóm, không cả báo cáo (xem `tinBaoCao`). */
  noi_dung_tin: string;
}

export interface KetQuaSinhBaoCao {
  /**
   * `false` = **không ghi gì**: ngày này đã có báo cáo loại này rồi. Đó là ca của
   * một nhịp Cron chạy hai lần, và nó là ca **bình thường**, không một lỗi.
   */
  da_ghi: boolean;
  /** `id` dòng `thong_bao` vừa chèn — `null` khi không ghi gì. */
  thong_bao_id: string | null;
  /** Kênh gửi ra ngoài — `cho_cron` (xem `KENH_CHO_GUI`). */
  kenh: string | null;
}

interface Waiter {
  /**
   * Các chủ đề waiter này nghe. **Nhiều** chủ đề, không một: một lệnh
   * `baton tasks --wait` phải tỉnh vì lượt giao mới cho mình (`luot:<tôi>`) **hoặc**
   * vì một agent mình giao việc vừa hỏi (`cau_hoi:<phiên>`, SPEC 19.6), mà khoá thứ
   * hai mang id phiên nên có bao nhiêu phiên là bấy nhiêu chủ đề.
   */
  chu_de: ReadonlySet<string>;
  danh_thuc: () => void;
}

/** Một lệnh chờ đã đăng ký: kết quả, và cách **huỷ** để không để lại waiter treo. */
interface DangKyCho {
  /** `true` = được đánh thức, `false` = hết hạn / bị huỷ / client ngắt. */
  ket_qua: Promise<boolean>;
  huy: () => void;
}

export class WorkspaceGate implements DurableObject {
  readonly #env: Env;

  /**
   * Hàng đợi tuần tự. DO chạy đơn luồng, nhưng mỗi `await` là một chỗ nhường
   * lượt — hai lệnh song song vẫn xen nhau được giữa lúc ĐỌC và lúc GHI. Nối
   * các lệnh ghi vào một chuỗi promise nên tại mỗi thời điểm chỉ có một lệnh
   * chạy trọn đọc-kiểm-ghi.
   */
  #hangDoi: Promise<unknown> = Promise.resolve();

  /** Các lệnh chờ dài đang treo trên DO này. Chỉ nằm trong bộ nhớ. */
  readonly #waiters = new Set<Waiter>();

  constructor(_state: DurableObjectState, env: Env) {
    this.#env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/lenh') {
      const lenh = await request.json<Lenh>();
      // Lỗi nghiệp vụ nằm trong thân (`ok: false`), không dùng mã HTTP: mã HTTP
      // của SPEC mục 13 là của API ra ngoài, không phải của chặng nội bộ này.
      return Response.json(await this.chayLenh(lenh));
    }

    /*
     * Chặng 3 của gửi bằng chứng (SPEC mục 7 d.219–221) — xem `ghiXacMinh`.
     * **Đi qua `#hangDoi`** như mọi lệnh ghi; cái **không** đi qua DO là chặng
     * gọi mạng, và nó nằm ở Worker.
     */
    if (request.method === 'POST' && url.pathname === '/xac-minh') {
      const yc = await request.json<YeuCauGhiXacMinh>();
      return Response.json({ ok: true, ket_qua: await this.ghiXacMinh(yc) });
    }

    /*
     * **Dừng theo dõi** một commit `pushed` quá 7 ngày (19.7). Cùng lý do và cùng
     * hàng đợi với `/xac-minh`; đường riêng vì nó **không có chặng gọi mạng** nào
     * (nó chỉ so `theo_doi_den_luc` với hiện tại), nên gộp vào `/xac-minh` sẽ phải
     * nhận một `KetQuaXacMinh` giả mà không ai tính.
     */
    if (request.method === 'POST' && url.pathname === '/dung-theo-doi') {
      const yc = await request.json<YeuCauDungTheoDoi>();
      return Response.json({ ok: true, ket_qua: await this.dungTheoDoi(yc) });
    }

    /*
     * **Ghi mốc cảnh báo phiên + chèn tin vào kho** (mục 6 d.196, 19.12 câu 46).
     * Cùng hàng đợi, cùng lý do: nó là một lượt đọc-kiểm-ghi. Đường riêng, không
     * một loại lệnh của `BanDoLenh`, vì **không ai gõ nó** — người gọi duy nhất là
     * Cron qua binding DO; xem `ghiMocCanhBao`.
     */
    if (request.method === 'POST' && url.pathname === '/ghi-moc-canh-bao') {
      const yc = await request.json<YeuCauGhiMocCanhBao>();
      return Response.json({ ok: true, ket_qua: await this.ghiMocCanhBao(yc) });
    }

    /*
     * **Ghi kết quả một lần gửi ra kênh ngoài** (mục 12, 19.12 câu 6). Cùng hàng
     * đợi, cùng lý do: đọc-kiểm-ghi. Chặng **gọi mạng** không ở đây — nó chạy ở
     * Worker (`cron-thong-bao.ts`), và đó là cùng ràng buộc kiến trúc mà
     * `cron-bang-chung.ts` đã khai cho GitHub.
     */
    if (request.method === 'POST' && url.pathname === '/ghi-moc-gui') {
      const yc = await request.json<YeuCauGhiMocGui>();
      return Response.json({ ok: true, ket_qua: await this.ghiMocGui(yc) });
    }

    /*
     * **Nhắc một mục 🔴 sau 2 giờ** (mục 8 d.283). Đường riêng, không một loại
     * lệnh của `BanDoLenh`, vì **không ai gõ nó**: người gọi duy nhất là Cron mỗi
     * phút qua binding DO. Xem `nhacCanChuDo`.
     */
    /*
     * **Sinh một báo cáo** (mục 11 d.336 + mục 12 d.346). Đường riêng, không một
     * loại lệnh của `BanDoLenh`, vì **không ai gõ nó**: người gọi duy nhất là Cron
     * 07:30 / 20:00 qua binding DO. Xem `sinhBaoCao`.
     */
    if (request.method === 'POST' && url.pathname === '/sinh-bao-cao') {
      const yc = await request.json<YeuCauSinhBaoCao>();
      return Response.json({ ok: true, ket_qua: await this.sinhBaoCao(yc) });
    }

    if (request.method === 'POST' && url.pathname === '/nhac-can-chu-do') {
      const yc = await request.json<YeuCauNhacCanChuDo>();
      return Response.json({ ok: true, ket_qua: await this.nhacCanChuDo(yc) });
    }

    /*
     * **Đăng nhập của chủ** — SPEC mục 15 d.415. Ba đường, cùng một lý do phải
     * nằm trong cửa ghi: cả ba là đọc-kiểm-ghi (chống dùng lại mã TOTP, bộ đếm
     * thử sai, huỷ phiên), và D1 không có giao dịch tương tác. Lý lẽ đầy đủ ở
     * đầu `chu-dang-nhap.ts`, kể cả vì sao chúng **không** là lệnh của `BanDoLenh`.
     *
     * Lỗi nghiệp vụ đi trong **thân** (`ok: false`), như `/cho-viec`: ở đây đó là
     * bắt buộc chứ không chỉ cho gọn — `INVALID_TOKEN` của một lần đăng nhập sai
     * và `RATE_LIMITED` của hạn mức chống dò phải tới được client đúng mã, mà một
     * lỗi ném ra khỏi `fetch` của DO chỉ thành `INTERNAL`/500.
     */
    if (request.method === 'POST' && url.pathname === '/chu/thiet-lap') {
      const yc = await request.json<YeuCauThietLapChu>();
      return Response.json(
        await this.#thanChu(() => this.#xepHang(() => thietLapChu(this.#env, yc, Date.now()))),
      );
    }

    if (request.method === 'POST' && url.pathname === '/chu/dang-nhap') {
      const yc = await request.json<YeuCauDangNhapChu>();
      return Response.json(
        await this.#thanChu(() => this.#xepHang(() => dangNhapChu(this.#env, yc, Date.now()))),
      );
    }

    /*
     * **Mở khoá** — cùng cửa ghi vì nó ghi đúng hai cột mà đường đăng nhập đang
     * đọc-kiểm-ghi (`so_lan_sai`, `khoa_den_luc`). Ghi thẳng D1 thì một lần mở
     * khoá chạy song song với một lần thử sai có thể bị lần thử đó ghi đè khoá
     * lại — tức cửa thoát hỏng đúng lúc cần.
     */
    if (request.method === 'POST' && url.pathname === '/chu/mo-khoa') {
      const yc = await request.json<YeuCauMoKhoaChu>();
      return Response.json(
        await this.#thanChu(() => this.#xepHang(() => moKhoaChu(this.#env, yc, Date.now()))),
      );
    }

    /*
     * **Đặt lại TOTP** — cùng cửa ghi, và ở đây là bắt buộc: nó ghi `totp_secret`
     * và `totp_buoc_cuoi`, đúng hai cột mà `/chu/dang-nhap` đang đọc-kiểm-ghi.
     * Ghi thẳng D1 thì một lần đặt lại chạy song song với một lần đăng nhập có
     * thể bị lần đăng nhập đó ghi lại `totp_buoc_cuoi` của secret **cũ** — tức
     * chặn ngay những mã đầu của secret mới.
     */
    if (request.method === 'POST' && url.pathname === '/chu/dat-lai-totp') {
      const yc = await request.json<YeuCauDatLaiTotpChu>();
      return Response.json(
        await this.#thanChu(() => this.#xepHang(() => datLaiTotpChu(this.#env, yc, Date.now()))),
      );
    }

    if (request.method === 'POST' && url.pathname === '/chu/dang-xuat') {
      const yc = await request.json<YeuCauDangXuatChu>();
      return Response.json(
        await this.#thanChu(() => this.#xepHang(() => dangXuatChu(this.#env, yc, Date.now()))),
      );
    }

    /*
     * **Đổi mật khẩu** (BAT-11) — bắt buộc trong cửa ghi, cùng lý do với
     * `/chu/dang-nhap`: nó đọc-kiểm-ghi đúng `totp_buoc_cuoi` (chống dùng lại mã)
     * và `so_lan_sai`/`khoa_den_luc` (bộ đếm dùng chung với đăng nhập). Ngoài cửa
     * ghi thì một lần đổi và một lần đăng nhập song song cùng tiêu được một mã.
     */
    if (request.method === 'POST' && url.pathname === '/chu/doi-mat-khau') {
      const yc = await request.json<YeuCauDoiMatKhauChu>();
      return Response.json(
        await this.#thanChu(() => this.#xepHang(() => doiMatKhauChu(this.#env, yc, Date.now()))),
      );
    }

    /*
     * **Ghi lần dùng cuối theo nhịp** (BAT-11) — một `UPDATE` lên `chu_phien`,
     * nên đi qua cửa ghi như mọi đường ghi khác lên bảng đó (đăng xuất, đổi mật
     * khẩu đặt `huy_luc` trên cùng các dòng). Người gọi duy nhất là middleware
     * `chamPhienChuTheoNhip`, tối đa một lần mỗi giờ cho mỗi phiên.
     */
    if (request.method === 'POST' && url.pathname === '/chu/cham-phien') {
      const yc = await request.json<YeuCauChamPhienChu>();
      return Response.json(
        await this.#thanChu(() => this.#xepHang(() => chamPhienChu(this.#env, yc, Date.now()))),
      );
    }

    /*
     * Chờ dài của đường kéo việc (SPEC mục 13 d.352). **Không** đi qua `#hangDoi`:
     * một request treo 60 giây trong hàng đợi ghi sẽ đóng băng cửa ghi của cả
     * workspace. Chờ chỉ giữ một waiter trong bộ nhớ, các lệnh ghi vẫn chạy —
     * và chính chúng là thứ gọi nó dậy.
     */
    if (request.method === 'POST' && url.pathname === '/cho-viec') {
      const yc = await request.json<YeuCauChoViec>();
      try {
        // `request.signal` tắt khi client ngắt: waiter được dọn, không đánh thức xác.
        return Response.json({ ok: true, ket_qua: await this.choViec(yc, request.signal) });
      } catch (e) {
        if (BatonError.la(e)) return Response.json({ ok: false, error: e.ma, message: e.message });
        throw e;
      }
    }

    /*
     * Chờ dài của `baton result T-x --wait` (SPEC mục 8 d.267, mục 13 d.376).
     * Cùng lý do và cùng cách với `/cho-viec`: **không** đi qua `#hangDoi`, và
     * `request.signal` để client ngắt thì waiter được dọn.
     */
    if (request.method === 'POST' && url.pathname === '/cho-can-chu') {
      const yc = await request.json<YeuCauChoCanChu>();
      try {
        return Response.json({ ok: true, ket_qua: await this.choCanChu(yc, request.signal) });
      } catch (e) {
        if (BatonError.la(e)) return Response.json({ ok: false, error: e.ma, message: e.message });
        throw e;
      }
    }

    return Response.json(
      { ok: false, error: 'NOT_FOUND', message: 'Cửa ghi không có đường này.' },
      { status: 404 },
    );
  }

  /**
   * Xếp một việc ghi vào hàng đợi tuần tự và chờ kết quả.
   *
   * Dùng cho **mọi** đường ghi của DO này, không riêng `/lenh`: hai đường ghi mà
   * chỉ một đường xếp hàng thì cái đọc-kiểm-ghi của đường kia chạy xen vào giữa
   * đường này, tức mất đúng lý do DO tồn tại.
   */
  #xepHang<T>(viec: () => Promise<T>): Promise<T> {
    const ketTiep = this.#hangDoi.then(viec, viec);
    // Giữ chuỗi không bao giờ bị reject, nếu không mọi lệnh sau sẽ hỏng theo.
    this.#hangDoi = ketTiep.catch(() => undefined);
    return ketTiep;
  }

  /**
   * Chạy một việc của đường **đăng nhập chủ** và bọc kết quả thành thân phản hồi.
   *
   * Khác `#chayMotLenh`: ở đây lỗi nghiệp vụ là **lẽ thường** (đăng nhập sai,
   * đang bị khoá), không phải một ca ngoại lệ, nên nó phải đi trong thân kèm cả
   * `retry_after`. Lỗi **không** phải `BatonError` vẫn được ném lên như mọi chỗ
   * khác: nó là bug, và nuốt nó ở đây là biến một bug thành "đăng nhập sai".
   */
  async #thanChu<T>(viec: () => Promise<T>): Promise<PhanHoiLenh<T>> {
    try {
      return { ok: true, ket_qua: await viec() };
    } catch (e) {
      if (BatonError.la(e)) {
        return { ok: false, error: e.ma, message: e.message, retry_after: e.retryAfter };
      }
      throw e;
    }
  }

  /** Xếp một lệnh ghi vào hàng đợi và chờ kết quả. */
  chayLenh(lenh: Lenh): Promise<PhanHoiLenh<unknown>> {
    return this.#xepHang(() => this.#chayMotLenh(lenh));
  }

  /* ---------------------------------------------------------------- *
   * Ghi kết luận xác minh — SPEC mục 7 d.206, d.207, d.219–221, 19.7
   * ---------------------------------------------------------------- */

  /**
   * **Chặng 3** của việc gửi bằng chứng: ghi kết luận xác minh vào dòng
   * `evidence`. Chặng 1 (chèn dòng) và chặng 3 là lệnh ghi trong DO; chặng 2
   * (**gọi mạng**) chạy ở Worker — xem đầu `xac-minh-bang-chung.ts`.
   *
   * **Không phải một lệnh của `BanDoLenh`, và đó là điểm chính.** Đường này ghi
   * được `xac_minh = 'merged'`, tức **mở cổng Xong** (d.206, d.214). Nếu nó là
   * một loại lệnh có tên thì nó nằm trong `SO_DANG_KY_HANDLER` và chỉ còn một
   * whitelist ở tầng HTTP đứng giữa một agent và câu "commit của tôi đã merged".
   * Là một đường **riêng của DO** thì nó không có route nào, không có tên trong
   * `BanDoLenh`, và chỉ Worker gọi được qua binding — client không có chỗ nào để
   * gõ vào.
   *
   * Vì cùng lý do đó, hàm này **không nhận** `xac_minh` nào từ người gọi mà không
   * kiểm: nó chỉ nhận `KetQuaXacMinh` (một kiểu hẹp do
   * `xacMinhMotBangChung` dựng), và nó chỉ ghi lên dòng **đang `pending` và chưa
   * rút** — nên không có đường nào dùng nó để sửa một kết luận đã có (d.222
   * "bằng chứng không sửa").
   */
  ghiXacMinh(yc: YeuCauGhiXacMinh): Promise<KetQuaGhiXacMinh> {
    return this.#xepHang(() => this.#ghiMotXacMinh(yc));
  }

  /** **Dừng theo dõi** commit `pushed` quá 7 ngày — 19.7. Xem `#dungMotTheoDoi`. */
  dungTheoDoi(yc: YeuCauDungTheoDoi): Promise<KetQuaDungTheoDoi> {
    return this.#xepHang(() => this.#dungMotTheoDoi(yc));
  }

  /** Dòng `evidence` mà hai đường ghi của Cron cần đọc. */
  async #dongBangChung(yc: { workspace_id: string; bang_chung_id: string }): Promise<{
    ticket_id: string;
    loai: string;
    xac_minh: string;
    so_lan_thu: number;
    rut_luc: number | null;
    thu_lai_luc: number | null;
    theo_doi_den_luc: number | null;
    chua_merge_bao_moc: number | null;
    commit_hash: string | null;
    repo: string | null;
    ticket_ma: string | null;
  } | null> {
    return this.#env.DB.prepare(
      `SELECT e.ticket_id AS ticket_id, ${sqlLoaiBangChung('e')} AS loai, e.xac_minh AS xac_minh,
              e.so_lan_thu AS so_lan_thu, e.rut_luc AS rut_luc, e.thu_lai_luc AS thu_lai_luc,
              e.theo_doi_den_luc AS theo_doi_den_luc, e.chua_merge_bao_moc AS chua_merge_bao_moc,
              e.commit_hash AS commit_hash, e.repo AS repo,
              CASE WHEN t.id IS NULL THEN NULL
                   ELSE pr.ma || '-' || CAST(t.so AS TEXT) END AS ticket_ma
         FROM evidence e
         LEFT JOIN ticket t   ON t.id = e.ticket_id AND t.workspace_id = e.workspace_id
         LEFT JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE e.id = ? AND e.workspace_id = ?`,
    )
      .bind(yc.bang_chung_id, yc.workspace_id)
      .first();
  }

  async #ghiMotXacMinh(yc: YeuCauGhiXacMinh): Promise<KetQuaGhiXacMinh> {
    const db = this.#env.DB;
    const bay_gio = Date.now();

    const dong = await this.#dongBangChung(yc);

    const bo_qua = (): KetQuaGhiXacMinh => ({
      da_ghi: false,
      xac_minh: dong?.xac_minh ?? null,
      ly_do: null,
      thu_lai_luc: null,
      so_lan_thu: dong?.so_lan_thu ?? 0,
      tu_len_xong: false,
      ticket_trang_thai: null,
      nguon_xac_minh: null,
    });

    /*
     * Dòng đã bị **rút** trong lúc chờ mạng: **bỏ qua**, không ghi gì. Ghi đè ở
     * đây là sửa một kết luận trên một bằng chứng đã rút — đúng thứ d.222 cấm.
     *
     * Lớp này **có test** từ lượt 2 sửa review: `test/gui-bang-chung.test.ts`,
     * "d.222: RÚT trong lúc đang xác minh" (+ ca đối chứng ngay cạnh).
     */
    if (dong === null || dong.rut_luc !== null) return bo_qua();

    /*
     * **Trạng thái nguồn hợp lệ của từng chặng.** `gui`/`thu_lai` chỉ ghi lên một
     * dòng đang `pending`; `theo_doi` chỉ ghi lên một dòng đang `pushed` (d.221).
     * Dòng đã có kết luận khác thì bỏ qua: Cron và lần chạy lúc gửi có thể gặp
     * nhau, và cái tới sau **không** được sửa kết luận của cái tới trước (d.222).
     */
    const trang_thai_nguon = yc.nguon === 'theo_doi' ? 'pushed' : 'pending';
    if (dong.xac_minh !== trang_thai_nguon) return bo_qua();

    /*
     * **Chặng `thu_lai`: mốc thử lại phải CÒN ĐẾN HẠN ngay lúc ghi.** Đây là lớp
     * kiểm **lần hai**, trong cửa ghi — cùng nếp mà `#dungMotTheoDoi` đã làm với
     * `theo_doi_den_luc`; nhánh thử lại chỉ là quên.
     *
     * Vì sao cần nó dù câu quét đã lọc `thu_lai_luc <= ?`: nhịp cron là **một
     * phút**, còn một lượt quét đầy trần (6 song song × 100 dòng × tới 10 giây) có
     * thể lâu hơn 60 giây, nên cron **chồng chính nó**. Hai lượt A và B cùng đọc một
     * dòng `so_lan_thu = 0`; A ghi `pending, so_lan_thu = 1, thu_lai_luc = +5 phút`;
     * B tới sau, chỉ kiểm `xac_minh === 'pending'` nên ghi tiếp `so_lan_thu = 2`.
     * Kết quả: **3 lượt thử của d.220 bị tiêu trong hai phút thay vì 15 phút** —
     * mốc "thử lại sau 5 phút" mất nghĩa. Kiểm lại ở đây thì lượt B thấy mốc đã bị
     * A đẩy sang tương lai và **bỏ qua**.
     *
     * `thu_lai_luc IS NULL` cũng bỏ qua: một dòng `pending` không có mốc thử lại nào
     * thì không ở trong vòng thử lại của d.220, nên chặng này không có việc gì trên
     * nó.
     */
    if (yc.nguon === 'thu_lai' && (dong.thu_lai_luc === null || dong.thu_lai_luc > bay_gio)) {
      return bo_qua();
    }

    const kq = yc.ket_qua;
    let xac_minh = kq.xac_minh;
    let ly_do = kq.ly_do;
    let so_lan_thu = dong.so_lan_thu;
    let thu_lai_luc: number | null = null;

    if (yc.nguon === 'theo_doi') {
      /*
       * **Kiểm lại một commit `pushed`** (d.221 + 19.7).
       *
       * Hai ca **không ghi gì**, có chủ ý:
       *   * `pending` — lỗi mạng ở lần kiểm lại. Dòng ở lại `pushed`, và lần quét
       *     10 phút sau thử lại. Hạ nó về `pending` là mất kết luận `pushed` đã
       *     có (d.222) và kéo nó sang nhầm vòng thử lại của d.220.
       *   * `pushed` — vẫn chưa merge. Phải **không ghi**, chứ không phải "ghi lại
       *     `pushed`": ghi lại sẽ đặt `theo_doi_den_luc` mới, tức **gia hạn** đồng
       *     hồ 7 ngày mỗi 10 phút và luật 19.7 không bao giờ chạm được tới.
       */
      if (kq.xac_minh === 'pending' || kq.xac_minh === 'pushed') return bo_qua();
    } else {
      /*
       * d.220 đếm "tự thử **lại**", nên **mọi** lần thử của Cron đều nhích
       * `so_lan_thu`, kể cả lần kết luận được: con số đó là "đã thử lại bao nhiêu
       * lần", không phải "đã thất bại bao nhiêu lần". Lần chạy **ngay khi gửi**
       * (`nguon = 'gui'`) thì không nhích — nó không phải một lần thử *lại*. Xem
       * `quyet-dinh.md`.
       */
      const qd =
        yc.nguon === 'thu_lai' ? quyetDinhThuLai(dong.so_lan_thu, kq.ly_do, bay_gio) : null;
      if (qd !== null) so_lan_thu = qd.so_lan_thu;

      if (kq.xac_minh === 'pending') {
        if (qd !== null) {
          // Hết 3 lần thử lại → `failed` **với lý do** (luật thuần ở `@baton/shared`,
          // nên trần 3 lần test được không cần DB).
          ly_do = qd.ly_do;
          thu_lai_luc = qd.thu_lai_luc;
          if (!qd.con_luot) xac_minh = 'failed';
        } else {
          // Chặng lúc gửi: ở lại `pending`, đặt mốc thử lại 5 phút.
          thu_lai_luc = bay_gio + CHO_THU_LAI_MS;
        }
      }
    }

    /*
     * `pushed` → **mốc theo dõi 7 ngày** (19.7 + d.221). Đặt cho cả chặng `gui` và
     * `thu_lai`: một commit xác minh được ở lần thử lại thứ hai cũng phải được
     * theo dõi đủ 7 ngày. CHECK của 0009 chỉ cho cột này có giá trị khi
     * `loai = 'commit' AND xac_minh = 'pushed'`.
     */
    const theo_doi_den_luc =
      xac_minh === 'pushed' ? bay_gio + THEO_DOI_COMMIT_MS : null;

    // CHECK của 0009: `ly_do` chỉ có nghĩa ở `pending` và `failed`.
    const ly_do_ghi = xac_minh === 'pending' || xac_minh === 'failed' ? ly_do : null;

    // Nguồn của kết luận — migration 0022 khối A. Xem chỗ `bind` dưới.
    const nguon_ghi: NguonXacMinhMerged | null =
      xac_minh === 'merged' || xac_minh === 'pushed' ? kq.nguon_xac_minh : null;

    const cau_lenh: D1PreparedStatement[] = [
      /*
       * `AND xac_minh = ? AND rut_luc IS NULL` trong `WHERE` là **phòng thủ tầng
       * hai, KHÔNG có test** — ghi ra chứ không khai nửa vời (lượt 2 sửa review đã
       * thử bằng mutation: bỏ hai điều kiện này thì toàn bộ test vẫn xanh).
       *
       * Vì sao **không dựng được** ca test: câu `SELECT` ở trên và câu `UPDATE` này
       * nằm trong **cùng một** việc của `#xepHang` trên một DO đơn luồng, nên không
       * có trạng thái quan sát được nào mà hai câu `if` ở trên bỏ sót còn `WHERE`
       * này bắt. Giữ lại vì nó là thứ duy nhất còn đúng nếu một lượt sau tách hai
       * câu ra hai việc khác nhau, hoặc cho một đường ngoài DO ghi vào bảng này.
       */
      db
        .prepare(
          `UPDATE evidence
              SET xac_minh = ?, ly_do = ?, ma_http = ?, xac_minh_luc = ?,
                  nguon_xac_minh = ?,
                  so_lan_thu = ?, thu_lai_luc = ?, theo_doi_den_luc = ?, cap_nhat_luc = ?
            WHERE id = ? AND workspace_id = ? AND xac_minh = ? AND rut_luc IS NULL`,
        )
        .bind(
          xac_minh,
          ly_do_ghi,
          kq.ma_http,
          bay_gio,
          /*
           * **Nguồn của kết luận** (migration 0022 khối A). Cùng **một** câu
           * `UPDATE` với `xac_minh`: hai câu rời nhau mở ra một cửa sổ có `merged`
           * mà chưa có nguồn, và trong cửa sổ đó mọi đường đọc nói "kiểm qua
           * GitHub" cho một kết luận chỉ dựa vào lời khai cục bộ.
           *
           * Chỉ ghi cho hai kết luận của commit; mọi ca khác đặt `NULL` để không
           * giữ lại nguồn của một lượt trước.
           */
          nguon_ghi,
          so_lan_thu,
          thu_lai_luc,
          theo_doi_den_luc,
          bay_gio,
          yc.bang_chung_id,
          yc.workspace_id,
          trang_thai_nguon,
        ),
    ];

    /*
     * **Tự lên Xong** — d.221 ("ticket ở Chờ kiểm chứng mà vừa đủ điều kiện cổng…
     * thì tự sang Xong, lịch sử ghi người làm là **hệ thống**") + 19.2 ("Tự lên
     * Xong **chỉ** áp cho ticket ở Chờ kiểm chứng").
     *
     * Chạy khi và chỉ khi lượt ghi này vừa đặt một kết luận **mở cổng được**
     * (`merged` cho commit — d.206; `passed` cho deploy — d.207). Các kết luận khác
     * không thể làm cổng *mới* đủ, nên không tra lại cổng cho chúng: cổng là mấy
     * truy vấn D1 trong cửa ghi.
     *
     * **Không có luật trạng thái nào ở đây.** Đi đúng `apSuKienLenTicket` với sự
     * kiện `kiem_cong_lai` — cùng đường mà `baton status`, nộp báo cáo và "con cuối
     * cùng kết" đã đi. Nên ba luật dưới đây là **cùng một bản**, không phải bản thứ
     * hai cho đường tự động:
     *   * chỉ `verifying` mới lên Xong (19.2),
     *   * `CHILDREN_OPEN` vẫn áp (mục 4),
     *   * lan toả lên ticket điều phối (19.4) chạy như mọi đường đổi trạng thái.
     */
    let tu_len_xong = false;
    let ticket_trang_thai: TrangThaiTicket | null = null;
    const danh_thuc: string[] = [];
    // Lịch sử của lượt này — nguồn của câu tự đóng mục xác nhận (#163).
    let lich_su: YeuCauGhiLichSu[] = [];

    /*
     * **Bộ sinh mục xác nhận** — 19.12 câu 57 gạch 1 nói câu 57 áp cho "**mọi**
     * đường kiểm cổng, **kể cả đường tự lên Xong định kỳ (d.221), nơi không có ai
     * gõ lệnh nào**". Đây **là** đường đó, nên nó phải có bộ sinh — không phải chỉ
     * `#chayMotLenh`.
     *
     * Câu lệnh của bộ sinh đi vào **cùng** `cau_lenh` của lượt này, tức cùng
     * `db.batch()` ở dưới: cùng thành, cùng hỏng. Xem `muc-xac-nhan.ts`.
     */
    const bo_sinh = boSinhMucXacNhan(db, bay_gio);

    if (xac_minh === 'merged' || xac_minh === 'passed') {
      const ticket = await ticketBatBuoc(db, yc.workspace_id, dong.ticket_id);

      /*
       * **Lọc trước theo `verifying`** — 19.2. Đây là một **lọc cho rẻ**, KHÔNG phải
       * nơi giữ luật: luật nằm trong `apDungLuat` (`case 'kiem_cong_lai'`) và có
       * test đơn vị riêng ở `test/trang-thai.test.ts`. Lọc ở đây để (a) không chạy
       * mấy truy vấn của cổng trong cửa ghi cho một ticket không thể đổi, và (b)
       * không ghi `bat_dau_luc` cho một ticket `in_progress` chỉ vì Cron chạm vào
       * nó — 19.2 nói ca đó là "**chưa có gì xảy ra**", nên đúng là **không một
       * dòng nào** được ghi.
       */
      if (ticket.trang_thai !== 'verifying') {
        // Lọc này chạy **trước** khi cổng được kiểm lần nào, nên bộ sinh còn rỗng:
        // không có "lần kiểm cổng" nào ở nhánh này, nên câu 57 không áp. Vẫn gộp
        // `cauLenh()` cho đúng một đường ra duy nhất, thay vì một nhánh nhớ gộp và
        // một nhánh nhớ bỏ.
        await db.batch([...cau_lenh, ...bo_sinh.cauLenh()]);
        return {
          da_ghi: true,
          xac_minh,
          ly_do: ly_do_ghi,
          thu_lai_luc,
          so_lan_thu,
          tu_len_xong: false,
          ticket_trang_thai: ticket.trang_thai,
          nguon_xac_minh: nguon_ghi,
        };
      }

      const ap = await apSuKienLenTicket(
        db,
        yc.workspace_id,
        ticket,
        { loai: 'kiem_cong_lai' },
        {
          bay_gio,
          /*
           * Cổng phải thấy kết luận **sắp ghi** của chính lượt này: câu `UPDATE` ở
           * trên còn nằm trong `cau_lenh`, chưa chạy. Xem `DieuChinhBangChung`.
           */
          cong: congBangChungCua(
            this.#env,
            db,
            { loai: 'xac_minh', bang_chung_id: yc.bang_chung_id, xac_minh },
            bo_sinh,
          ),
          /*
           * **Cờ "cần review lại" KHÔNG nhận `dieu_chinh` ở đây — có chủ ý.**
           * `tinhCanReviewLai` không đọc `xac_minh` một lần nào (mốc "commit/deploy
           * cuối cùng" của d.494 tính trên `gui_luc`, và `reviewDatDuocTinh` đọc
           * `ket_luan`), nên một lượt ghi chỉ đổi `xac_minh` **không thể** đổi giá trị
           * cờ. Truyền `dieu_chinh` vào đây sẽ không sửa được gì mà lại **bật nhánh
           * kéo trạng thái** của d.494 trên một đường không có bằng chứng nào mới —
           * xem ranh giới ở `apCoReviewLai`. Cờ vẫn được tính lại (theo trạng thái
           * **sau** lệnh), và đó là nửa cần cho d.495 lúc ticket tự lên Xong.
           */
          // Hệ thống **không** là chủ: `la_chu` chỉ mở đường ép Xong và mở lại
          // ticket đã kết (mục 4, mục 7). Cron không được có hai quyền đó.
          la_chu: false,
          boi_canh_cam: await boiCanhNguoiCamCua(db, yc.workspace_id, ticket.id),
        },
      );
      cau_lenh.push(...ap.cau_lenh);
      cau_lenh.push(...this.#cauLenhLichSu(db, yc.workspace_id, HE_THONG, ap.lich_su, bay_gio));
      lich_su = ap.lich_su;
      danh_thuc.push(...ap.danh_thuc);
      // `ap.trang_thai`, **không** `ap.kq.trang_thai`: cờ "cần review lại" (19.3
      // d.494) chạy sau sự kiện gốc và có thể đổi trạng thái lần nữa.
      ticket_trang_thai = ap.trang_thai;
      // Lọc trên đã bảo đảm ticket đang `verifying`, nên "sang `done`" là đủ.
      tu_len_xong = ap.trang_thai === 'done';
    }

    // Một `batch()`: kết luận xác minh, thay đổi ticket, lịch sử **và mục xác nhận
    // tự sinh** cùng thành hoặc cùng hỏng. Không bao giờ có ticket Xong mà thiếu
    // dòng lịch sử, và không bao giờ có ticket bị cổng chặn vì "thiếu chủ xác
    // nhận" mà **không có** mục để chủ bấm. Cuối cùng: ticket vừa tự lên Xong ⇒
    // mục xác nhận tự sinh còn `Chờ` tự đóng (#163, BAT-40).
    const dong_muc = cauDongMucXacNhanKhiXong(db, yc.workspace_id, lich_su, bay_gio);
    await db.batch([...cau_lenh, ...bo_sinh.cauLenh(), ...dong_muc]);
    const thuc_dong = dong_muc.length > 0 ? ['can_chu'] : [];
    for (const chu_de of [...danh_thuc, ...bo_sinh.danhThuc(), ...thuc_dong]) this.danhThuc(chu_de);

    return {
      da_ghi: true,
      xac_minh,
      ly_do: ly_do_ghi,
      thu_lai_luc,
      so_lan_thu,
      tu_len_xong,
      ticket_trang_thai,
      nguon_xac_minh: nguon_ghi,
    };
  }

  /**
   * **Dừng theo dõi một commit `pushed` quá 7 ngày** — SPEC 19.7: "dừng theo dõi.
   * Bằng chứng mang nhãn 'chưa merge sau 7 ngày'; hiện ở 'Cần chú ý'; Telegram báo
   * **1 lần**."
   *
   * Ba việc, một lượt ghi:
   *   1. `theo_doi_den_luc = NULL` → dòng rời `ix_evidence_theo_doi`, Cron không
   *      thấy nó nữa. Đó **là** nghĩa của "dừng theo dõi".
   *   2. `chua_merge_luc` → nhãn (migration 0010). "Hiện ở Cần chú ý" là phần 6.
   *   3. `chua_merge_bao_moc` → mốc chống bắn lặp của "báo **1 lần**". Mốc, không
   *      cờ — `quyetDinhBaoChuaMerge`, cùng nếp `canhBaoDung` của mục 6 d.196.
   *
   * **Không gửi gì ra ngoài từ trong cửa ghi** — chặng gọi mạng là lượt quét của
   * `cron-thong-bao.ts` (xem `KENH_CHO_GUI`). Khai thẳng một nợ: tin 19.7 này
   * **chưa** được đặt vào bảng `thong_bao`, nên cron gửi không thấy nó; xem mục
   * "Việc phát sinh" của báo cáo phần 7 lượt 1.
   *
   * `xac_minh` **không đổi**: commit đó vẫn đúng là `pushed` (d.206). 19.7 nói
   * "dừng theo dõi", không nói "trượt" — và `failed` ở đây sẽ là một lời nói sai về
   * một commit có thật trong repo.
   */
  async #dungMotTheoDoi(yc: YeuCauDungTheoDoi): Promise<KetQuaDungTheoDoi> {
    const db = this.#env.DB;
    const bay_gio = Date.now();

    const dong = await this.#dongBangChung(yc);
    const bo_qua: KetQuaDungTheoDoi = { da_ghi: false, mang_nhan: false, tin: null, kenh: null };

    // Đã rút, đã đổi kết luận (vd vừa `merged` ở một lượt khác), hay đã dừng theo
    // dõi rồi: bỏ qua. Cùng lý do với `#ghiMotXacMinh`.
    if (dong === null || dong.rut_luc !== null) return bo_qua;
    if (dong.xac_minh !== 'pushed' || dong.theo_doi_den_luc === null) return bo_qua;
    // **Chưa quá hạn thì không dừng.** Kiểm lại trong cửa ghi, không tin mốc mà
    // Worker đã đọc: giữa lúc Cron chọn dòng và lúc ghi, một lượt khác có thể đã
    // đặt mốc mới.
    //
    // **Biên bằng-đúng (`>` so với `>=`) ở lớp này KHÔNG canh được bằng test — có
    // chủ ý.** `bay_gio` là `Date.now()` bên trong DO, test không chen vào được, nên
    // không dựng được ca phân biệt `theo_doi_den_luc === bay_gio`. Chấp nhận: luật
    // thật ("`pushed` quá 7 ngày thì dừng theo dõi", SPEC 19.7) đã được canh ở **lớp
    // một** — `quetTheoDoiPushed` trong `cron-bang-chung.ts`, ca #61 — nơi `bay_gio`
    // là tham số nên biên đo được. Lớp này là phòng thủ tầng hai cho đua ghi.
    //
    // **Đừng "sửa" thành nhận `bay_gio` từ người gọi để test được.** Hướng đó đã
    // được xét và **bác**: nó phá đúng lý do tồn tại của lớp kiểm này. Ba dòng trên
    // nói rõ là *không tin mốc mà Worker đã đọc*; nhận `bay_gio` của Worker là tin
    // lại con số vừa quyết định không tin — một lượt Cron đọc lúc T rồi ghi lúc
    // T+10 phút sẽ được xét theo T, và lớp phòng thủ thành hình thức. Đổi một lỗ
    // hổng thật để lấy một ca test cho biên 1 ms trên một đồng hồ 7 ngày là lỗ xấu.
    if (dong.theo_doi_den_luc > bay_gio) return bo_qua;

    const quyet = quyetDinhBaoChuaMerge(dong);
    const tin = quyet.can_ban
      ? tinChuaMergeSau7Ngay({
          bang_chung_id: yc.bang_chung_id,
          ticket_id: dong.ticket_id,
          commit_hash: dong.commit_hash,
          repo: dong.repo,
          luc: bay_gio,
          ticket_ma: dong.ticket_ma,
        })
      : null;

    await db
      .prepare(
        `UPDATE evidence
            SET theo_doi_den_luc = NULL, chua_merge_luc = ?, chua_merge_bao_moc = ?,
                cap_nhat_luc = ?
          WHERE id = ? AND workspace_id = ? AND xac_minh = 'pushed' AND rut_luc IS NULL`,
      )
      .bind(
        bay_gio,
        // Mốc chỉ nhích khi **vừa** bắn; đã bắn cho mốc này rồi thì giữ nguyên giá
        // trị cũ, nên lần quét sau vẫn thấy "đã bắn" và không bắn lại.
        quyet.moc_moi ?? dong.chua_merge_bao_moc,
        bay_gio,
        yc.bang_chung_id,
        yc.workspace_id,
      )
      .run();

    this.danhThuc(`ticket:${dong.ticket_id}`);

    return {
      da_ghi: true,
      mang_nhan: true,
      tin,
      kenh: tin === null ? null : KENH_CHO_GUI,
    };
  }

  /* ---------------------------------------------------------------- *
   * Cảnh báo phiên đứng / lỗi — SPEC mục 6 d.196, 19.12 câu 46
   * ---------------------------------------------------------------- */

  /**
   * **Ghi mốc chống bắn lặp và chèn tin vào kho thông báo** cho một phiên —
   * SPEC mục 6 d.196 ("phiên chuyển sang `stalled` hoặc `error` thì bắn **1** thông
   * báo; hồi lại rồi đứng lần nữa thì bắn **lại**"), 19.12 câu 46.
   *
   * Người gọi duy nhất là Cron 5 phút (`cron-canh-bao-phien.ts`). Xem `ghiXacMinh`
   * cho lý do đầy đủ của việc **không** làm nó thành một loại lệnh có tên: nó không
   * có route nào, không có tên trong `BanDoLenh`, nên không có chỗ nào để client gõ
   * vào một lần bắn tin cho chủ.
   *
   * ## Hàm này tự kiểm LẠI luật, không tin kết luận Worker gửi vào
   *
   * Cron đã chạy `canhBaoDung` một lần ở Worker (để biết dòng nào cần gọi tới đây),
   * nhưng kết luận đó **không** đi vào yêu cầu: `YeuCauGhiMocCanhBao` chỉ có
   * `phien_id`. Ở đây dòng phiên được **đọc lại** và `canhBaoDung` chạy **lần hai**
   * trên dữ liệu vừa đọc trong DO.
   *
   * Đó là thứ duy nhất làm được "bắn đúng **1** tin" khi **hai lượt cron chồng
   * nhau** — nhịp 5 phút không bảo đảm lượt trước đã xong (một lượt đầy trần gọi
   * cửa ghi tới `TRAN_DONG_MOI_LUOT` lần). Hai lượt A và B cùng đọc một phiên
   * `stalled` chưa bắn; A vào cửa ghi, ghi mốc và chèn tin; B tới sau, nếu tin kết
   * luận của chính nó thì chèn **tin thứ hai** cho cùng một lần đứng. Đọc lại ở đây
   * thì B thấy `canh_bao_tin_hieu_luc` đã bằng mốc và `canhBaoDung` trả
   * `can_ban: false` — **không ghi gì**. Cùng nếp mà `#ghiMotXacMinh` dùng cho
   * `thu_lai_luc` và `#dungMotTheoDoi` dùng cho `theo_doi_den_luc`.
   *
   * ## Một lượt ghi, không hai
   *
   * Mốc và dòng tin nằm trong **cùng một** `batch()`: cùng thành hoặc cùng hỏng.
   * Tách ra hai lượt thì có hai trạng thái sai không sửa được — ghi mốc mà tin hỏng
   * (lần đứng đó **im lặng mãi mãi**, vì mốc đã nói "đã bắn"), hay chèn tin mà mốc
   * hỏng (chuông đầy tin lặp của cùng một lần đứng, mỗi 5 phút một tin).
   *
   * **Không gửi gì ra ngoài từ đây.** Tin vào kho; cron gửi đưa nó ra kênh ngoài
   * theo đúng luật thời điểm của mục 12 — xem `KENH_CHO_GUI`.
   */
  ghiMocCanhBao(yc: YeuCauGhiMocCanhBao): Promise<KetQuaGhiMocCanhBao> {
    return this.#xepHang(() => this.#ghiMotMocCanhBao(yc));
  }

  async #ghiMotMocCanhBao(yc: YeuCauGhiMocCanhBao): Promise<KetQuaGhiMocCanhBao> {
    const db = this.#env.DB;
    const bay_gio = Date.now();
    const bo_qua: KetQuaGhiMocCanhBao = {
      da_ghi: false,
      tin: null,
      thong_bao_id: null,
      moc_moi: null,
      kenh: null,
    };

    const dong = await phienTheoId(db, yc.workspace_id, yc.phien_id);
    if (dong === null) return bo_qua;

    /*
     * **Luật chạy lại ở đây** — xem khối ghi chú trên. `danXuat` lấy ngưỡng đứng
     * **hiện hành** của agent và của dự án (19.12 câu 49: đổi ngưỡng áp ngay cho
     * phiên đang chạy), nên một phiên vừa được chủ nới ngưỡng sẽ không bị bắn.
     */
    const quyet = canhBaoDung(phienLuuCua(dong), danXuat(dong, bay_gio).trang_thai);
    if (!quyet.can_ban || quyet.ly_do === null || quyet.moc_moi === null) return bo_qua;

    const tin = tinCanhBaoPhien({
      phien_id: dong.id,
      ticket_id: dong.ticket_id,
      agent_id: dong.agent_id,
      ly_do: quyet.ly_do,
      luc: bay_gio,
      agent_ten: dong.agent_ten,
      ticket_ma: dong.ticket_ma,
    });
    const thong_bao_id = crypto.randomUUID();

    /*
     * **Phòng thủ tầng hai, và CẢ HAI câu cùng chịu một điều kiện.**
     *
     * `AND trang_thai <> 'closed' AND canh_bao_tin_hieu_luc IS NOT ?` là cùng nếp
     * (và cùng lời khai thẳng) với `#ghiMotXacMinh`: hai câu `if` ở trên đã bắt mọi
     * trạng thái quan sát được, vì `SELECT` và hai câu ghi này nằm trong **cùng
     * một** việc của `#xepHang` trên một DO đơn luồng.
     *
     * Nhưng một guard chỉ bọc câu `UPDATE` thì **không đủ** cho đúng cái ca nó tồn
     * tại để chịu (một lượt sau tách hai câu, hay một đường ngoài DO ghi vào bảng
     * `phien`): guard bật mà `INSERT` vẫn chạy thì ta được **một tin không có mốc**
     * — tức chuông nhận một tin mới mỗi 5 phút, mãi mãi, cho cùng một lần đứng. Nên
     * `INSERT` viết dạng `INSERT … SELECT … WHERE <đúng điều kiện ấy>`: cả hai câu
     * cùng chạy hoặc cùng không.
     *
     * Thứ tự trong `batch` vì vậy là **INSERT trước, UPDATE sau**, và không đổi được:
     * các câu của một `batch` chạy tuần tự trong cùng giao dịch, nên `UPDATE` đi
     * trước sẽ đặt `canh_bao_tin_hieu_luc = moc_moi` và làm chính guard của `INSERT`
     * tắt — không tin nào vào kho. `batch` vẫn cùng thành hoặc cùng hỏng, nên thứ tự
     * không mở ra trạng thái trung gian nào quan sát được.
     */
    const GUARD = `id = ? AND workspace_id = ? AND trang_thai <> 'closed'
              AND canh_bao_tin_hieu_luc IS NOT ?`;

    const ket = await db.batch([
      /*
       * Tin **vào kho** (19.12 câu 46, bảng `thong_bao` của 0012). `agent_id` và
       * `ticket_id` đi theo để d.347 ("mỗi tin có link thẳng tới đúng thẻ hoặc
       * ticket") dựng được link ở phần 6. `gui_telegram_luc` để NULL: phần 7.
       */
      db
        .prepare(
          `INSERT INTO thong_bao
             (id, workspace_id, loai, noi_dung, phien_id, ticket_id, agent_id, tao_luc)
           SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM phien WHERE ${GUARD}`,
        )
        .bind(
          thong_bao_id,
          yc.workspace_id,
          tin.loai,
          tin.noi_dung,
          dong.id,
          dong.ticket_id,
          dong.agent_id,
          bay_gio,
          dong.id,
          yc.workspace_id,
          quyet.moc_moi,
        ),

      db
        .prepare(
          `UPDATE phien SET canh_bao_tin_hieu_luc = ?, cap_nhat_luc = ?
            WHERE ${GUARD}`,
        )
        .bind(quyet.moc_moi, bay_gio, dong.id, yc.workspace_id, quyet.moc_moi),
    ]);

    /*
     * **Trả về theo số dòng THẬT đã ghi, không theo "đã gọi `batch` xong".**
     *
     * Guard ở trên là tầng hai: đúng trong cái ca nó tồn tại để chịu, cả hai câu ghi
     * **0 dòng**. Nếu ở đó ta vẫn trả `da_ghi: true` kèm `tin` thì Cron đếm `so_tin`
     * cho một tin **không có trong kho**, và phần 7 sẽ gửi ra ngoài một tin không tồn
     * tại. Nên đọc `meta.changes` của câu **thứ nhất** (`INSERT … SELECT … WHERE
     * GUARD`) — đúng câu đặt tin vào kho, tức đúng thứ `tin`/`thong_bao_id` khai là
     * đã có. Thứ tự INSERT-trước-UPDATE giữ nguyên (xem khối ghi chú trên); hai câu
     * cùng một `WHERE` nên `changes` của chúng luôn bằng nhau.
     *
     * Guard không khớp → cùng nếp "bỏ qua" của hai câu `if` phía trên.
     */
    if ((ket[0]?.meta.changes ?? 0) === 0) return bo_qua;

    this.danhThuc(`phien:${dong.id}`);

    return {
      da_ghi: true,
      tin,
      thong_bao_id,
      moc_moi: quyet.moc_moi,
      // Tin đã vào kho; chặng ra kênh ngoài do cron gửi làm — xem `KENH_CHO_GUI`.
      kenh: KENH_CHO_GUI,
    };
  }

  /* ---------------------------------------------------------------- *
   * Gửi ra kênh ngoài — SPEC mục 12, 19.12 câu 6
   * ---------------------------------------------------------------- */

  /**
   * **Ghi kết quả một lần gửi ra kênh ngoài.**
   *
   * ## Phép kiểm "đã gửi chưa" được kiểm LẠI ở đây, và đó là điểm chính
   *
   * Câu quét của `cron-thong-bao.ts` đã lọc `gui_telegram_luc IS NULL`, nhưng kết
   * luận đó **không** đi vào yêu cầu: `YeuCauGhiMocGui` chỉ mang `thong_bao_id` và
   * kết quả của lần gửi. Dòng được **đọc lại** ở đây, và mốc chỉ được đặt khi nó
   * còn NULL.
   *
   * Đó là thứ duy nhất làm được "**đúng 1 tin** ra ngoài" khi **hai lượt cron chồng
   * nhau** — nhịp một phút không bảo đảm lượt trước đã xong (một lượt đầy trần có
   * tới `TRAN_TIN_MOI_LUOT` lần gọi mạng, mỗi lần tới 10 giây). Hai lượt A và B
   * cùng đọc một tin chưa gửi; cả hai gọi Telegram; A vào cửa ghi trước và đặt
   * mốc; B tới sau, nếu nó tin kết luận của chính nó thì nó **ghi mốc lần hai** và
   * chuông khai một tin đã gửi hai lần. (Lần gửi thừa của B đã ra ngoài — đó là
   * ca mà nhịp cron và trần song song phải tránh, và cửa ghi không sửa được. Cái
   * cửa ghi bảo đảm là **sổ sách không nói sai**, và lượt sau không gửi lần ba.)
   *
   * Lớp thứ ba, ở tầng **cấu trúc**, là trigger `tg_thong_bao_gui_moc_mot_lan` của
   * 0019: mốc không đổi và không xoá được, kể cả bằng SQL thô.
   *
   * ## Thất bại gửi KHÔNG BAO GIỜ chặn gì
   *
   * Nhánh trượt chỉ nhích `gui_so_lan_thu`, đặt mốc thử lại (10 giây / 60 giây / 5
   * phút — `mocThuLaiGui`) và ghi `gui_loi_ly_do`. Không trạng thái nào khác đổi,
   * không lỗi nào ném ra. Hết ba lần thì mốc thử lại là `NULL`, tin **giữ trong
   * chuông**, và nó hiện ở "Cần chú ý" (`doc-tong-quan.ts`, nguồn thứ sáu).
   */
  ghiMocGui(yc: YeuCauGhiMocGui): Promise<KetQuaGhiMocGui> {
    return this.#xepHang(() => this.#ghiMotMocGui(yc));
  }

  async #ghiMotMocGui(yc: YeuCauGhiMocGui): Promise<KetQuaGhiMocGui> {
    const db = this.#env.DB;
    const bay_gio = Date.now();
    const bo_qua: KetQuaGhiMocGui = {
      da_ghi: false,
      gui_luc: null,
      so_lan_thu: 0,
      thu_lai_luc: null,
    };

    const dong = await db
      .prepare(
        `SELECT gui_telegram_luc, gui_so_lan_thu FROM thong_bao
          WHERE id = ? AND workspace_id = ?`,
      )
      .bind(yc.thong_bao_id, yc.workspace_id)
      .first<{ gui_telegram_luc: number | null; gui_so_lan_thu: number }>();
    if (dong === null) return bo_qua;

    // **Phép kiểm lần hai** — xem khối ghi chú trên. Đã có mốc thì không ghi gì.
    if (dong.gui_telegram_luc !== null) {
      return { ...bo_qua, so_lan_thu: dong.gui_so_lan_thu };
    }

    /*
     * **Tắt theo công tắc (BAT-16, d.348).** Không tin kết luận của cron: đọc lại
     * các cột bất biến của tin và công tắc **ngay trong cửa ghi**. Chủ vừa bật lại
     * giữa chừng, hay đây là tin bảo mật ⇒ không ghi gì, lượt cron sau gửi bình
     * thường. Trigger `tg_thong_bao_bo_qua_hop_le` (0026) là lớp thứ ba.
     */
    if ('tat' in yc.ket_qua) {
      const tin = await db
        .prepare('SELECT loai, uu_tien, bao_mat FROM thong_bao WHERE id = ? AND workspace_id = ?')
        .bind(yc.thong_bao_id, yc.workspace_id)
        .first<{ loai: string; uu_tien: string; bao_mat: string | null }>();
      if (tin === null || !tinBiTat(tin, await congTacDangTat(db, yc.workspace_id))) {
        return { ...bo_qua, so_lan_thu: dong.gui_so_lan_thu };
      }
      const ket = await db
        .prepare(
          `UPDATE thong_bao SET bo_qua_gui_luc = ?
            WHERE id = ? AND workspace_id = ? AND gui_telegram_luc IS NULL
              AND bo_qua_gui_luc IS NULL AND bao_mat IS NULL`,
        )
        .bind(bay_gio, yc.thong_bao_id, yc.workspace_id)
        .run();
      return {
        ...bo_qua,
        da_ghi: (ket.meta.changes ?? 0) > 0,
        so_lan_thu: dong.gui_so_lan_thu,
      };
    }

    if (yc.ket_qua.da_gui) {
      const ket = await db
        .prepare(
          `UPDATE thong_bao
              SET gui_telegram_luc = ?, gui_thu_lai_luc = NULL, gui_loi_ly_do = NULL
            WHERE id = ? AND workspace_id = ? AND gui_telegram_luc IS NULL`,
        )
        .bind(bay_gio, yc.thong_bao_id, yc.workspace_id)
        .run();
      if ((ket.meta.changes ?? 0) === 0) return { ...bo_qua, so_lan_thu: dong.gui_so_lan_thu };
      return {
        da_ghi: true,
        gui_luc: bay_gio,
        so_lan_thu: dong.gui_so_lan_thu,
        thu_lai_luc: null,
      };
    }

    const so_lan_thu = Math.min(dong.gui_so_lan_thu + 1, SO_LAN_GUI_TOI_DA);
    const thu_lai_luc = mocThuLaiGui(dong.gui_so_lan_thu, bay_gio);

    const ket = await db
      .prepare(
        `UPDATE thong_bao
            SET gui_so_lan_thu = ?, gui_thu_lai_luc = ?, gui_loi_ly_do = ?
          WHERE id = ? AND workspace_id = ? AND gui_telegram_luc IS NULL`,
      )
      .bind(so_lan_thu, thu_lai_luc, yc.ket_qua.ly_do, yc.thong_bao_id, yc.workspace_id)
      .run();
    if ((ket.meta.changes ?? 0) === 0) return { ...bo_qua, so_lan_thu: dong.gui_so_lan_thu };

    return { da_ghi: true, gui_luc: null, so_lan_thu, thu_lai_luc };
  }

  /* ---------------------------------------------------------------- *
   * Nhắc 🔴 sau 2 giờ — SPEC mục 8 d.283, d.291; mục 12 d.341
   * ---------------------------------------------------------------- */

  /**
   * **Chèn tin nhắc 🔴 vào kho và ghi mốc chống nhắc lặp** — mục 8 d.283 ("🔴 chưa
   * xử lý sau 2 giờ thì nhắc **1 lần**"), d.291 ("**KHÔNG làm:** nhắc lặp nhiều
   * lần").
   *
   * Cùng hình với `ghiMocCanhBao`, và vì cùng một lý do ba lần:
   *   1. **Luật chạy LẠI ở đây** (`canNhacDo` trên dòng đọc lại trong DO), không
   *      nhận kết luận của Worker — nên hai lượt cron chồng nhau cho đúng **một**
   *      lời nhắc.
   *   2. **Một lượt ghi, không hai**: tin và mốc nằm trong cùng `batch()`. Tách ra
   *      thì có hai trạng thái sai không sửa được — mốc mà không tin (mục đó im
   *      lặng **mãi mãi**), hay tin mà không mốc (một lời nhắc **mỗi phút**, đúng
   *      thứ d.291 cấm).
   *   3. `INSERT … SELECT … WHERE <guard>` để **cả hai câu cùng chịu một điều
   *      kiện**, và thứ tự là **INSERT trước, UPDATE sau** (UPDATE đi trước sẽ đặt
   *      `nhac_do_luc` và làm chính guard của INSERT tắt).
   *
   * **Lời nhắc này KHÔNG mang `uu_tien = 'khan'`** — 19.8 d.535 nói rõ hai luật
   * khác nhau cho cùng mức 🔴: "🔴 **mới** vẫn gửi ngay", còn "lời nhắc sau 2 giờ
   * mà rơi vào giờ yên lặng thì **hoãn** tới cuối giờ yên lặng". Nên tin này là
   * `thuong`, và cron gửi hoãn nó tới 07:00 — đừng "sửa" thành `khan` cho nhất
   * quán với tin 🔴 mới; hai câu SPEC cố tình khác nhau.
   */
  nhacCanChuDo(yc: YeuCauNhacCanChuDo): Promise<KetQuaNhacCanChuDo> {
    return this.#xepHang(() => this.#nhacMotCanChuDo(yc));
  }

  async #nhacMotCanChuDo(yc: YeuCauNhacCanChuDo): Promise<KetQuaNhacCanChuDo> {
    const db = this.#env.DB;
    const bay_gio = Date.now();
    const bo_qua: KetQuaNhacCanChuDo = {
      da_ghi: false,
      thong_bao_id: null,
      noi_dung: null,
      nhac_luc: null,
      kenh: null,
    };

    const dong = await db
      .prepare(
        `SELECT id, ma_so, tieu_de, muc, trang_thai, tao_luc, nhac_do_luc
           FROM can_chu WHERE id = ? AND workspace_id = ?`,
      )
      .bind(yc.can_chu_id, yc.workspace_id)
      .first<{
        id: string;
        ma_so: number;
        tieu_de: string;
        muc: string;
        trang_thai: string;
        tao_luc: number;
        nhac_do_luc: number | null;
      }>();
    if (dong === null) return bo_qua;

    // **Luật chạy lại trong cửa ghi** — xem khối ghi chú trên.
    if (!canNhacDo(dong, bay_gio)) return bo_qua;

    const noi_dung = tinNhacCanChuDo({
      ma: maCanChu(dong.ma_so),
      tieu_de: dong.tieu_de,
      tao_luc: dong.tao_luc,
      luc: bay_gio,
    });
    const thong_bao_id = crypto.randomUUID();

    const GUARD = `id = ? AND workspace_id = ? AND trang_thai = 'open'
              AND muc = 'urgent' AND nhac_do_luc IS NULL`;

    const ket = await db.batch([
      db
        .prepare(
          `INSERT INTO thong_bao
             (id, workspace_id, loai, uu_tien, noi_dung, can_chu_id, tao_luc)
           SELECT ?, ?, ?, 'thuong', ?, ?, ? FROM can_chu WHERE ${GUARD}`,
        )
        .bind(
          thong_bao_id,
          yc.workspace_id,
          LOAI_TIN_CAN_CHU_DO,
          noi_dung,
          dong.id,
          bay_gio,
          dong.id,
          yc.workspace_id,
        ),

      db
        .prepare(`UPDATE can_chu SET nhac_do_luc = ? WHERE ${GUARD}`)
        .bind(bay_gio, dong.id, yc.workspace_id),
    ]);

    // Theo **số dòng thật** đã chèn, không theo "đã gọi batch xong" — cùng lý lẽ
    // của `#ghiMotMocCanhBao`: khai một tin không có trong kho thì cron gửi đi
    // tìm một dòng không tồn tại.
    if ((ket[0]?.meta.changes ?? 0) === 0) return bo_qua;

    this.danhThuc(`can_chu:${dong.id}`);
    this.danhThuc('can_chu');

    return {
      da_ghi: true,
      thong_bao_id,
      noi_dung,
      nhac_luc: bay_gio,
      kenh: KENH_CHO_GUI,
    };
  }

  /* ---------------------------------------------------------------- *
   * Sinh một báo cáo — SPEC mục 11 d.336, mục 12 d.346
   * ---------------------------------------------------------------- */

  /**
   * **Ghi một báo cáo + một tin vào kho, NGUYÊN Ý (idempotent).**
   *
   * ## Cửa sổ đua được đóng bằng gì — hai lớp, và cả hai cần
   *
   * Một Cron Trigger **có thể chạy hơn một lần** cho cùng một nhịp (Cloudflare
   * không bảo đảm đúng-một-lần). Hai lượt chạy phải cho **một** dòng `bao_cao` và
   * **một** dòng `thong_bao`, không hai — nếu không chủ nhận hai tin Telegram giống
   * nhau lúc 07:30.
   *
   *   1. **Cửa ghi là một DO đơn luồng cho mỗi workspace**, và `#xepHang` bắt mọi
   *      đường ghi xếp hàng. Nên hai lượt cron chồng nhau **không** chạy xen nhau ở
   *      đây: lượt B chỉ bắt đầu khi lượt A đã chạy trọn `batch()`. Đó là thứ làm
   *      cho `meta.changes` đọc được **một cách tin được**.
   *   2. **Khoá chính `(workspace_id, ngay, loai)` của `bao_cao`** (migration 0020)
   *      là hàng rào cấu trúc: nó còn đúng khi một lượt sau thêm một đường ghi thứ
   *      hai, hoặc khi ai đó chạy `wrangler d1 execute` bằng tay.
   *
   * **Không** `SELECT` rồi `INSERT`: giữa hai câu đó là một cửa sổ đua, và lớp (1)
   * chỉ che được những lượt đi qua **chính** DO này. Thay vào đó:
   *
   *   * câu **thứ nhất** chèn `thong_bao`, guard là `NOT EXISTS (SELECT 1 FROM
   *     bao_cao WHERE <khoá>)`;
   *   * câu **thứ hai** chèn `bao_cao` với `ON CONFLICT DO NOTHING`.
   *
   * Thứ tự là **INSERT tin trước, INSERT báo cáo sau** — y như `#nhacMotCanChuDo`,
   * và vì cùng lý do: đảo lại thì câu thứ hai đã đặt dòng `bao_cao` và làm **chính
   * guard** của câu thứ nhất tắt, nên tin không bao giờ được chèn. Cả hai nằm trong
   * **một** `batch()` nên không có trạng thái sai nào sống được: báo cáo mà không
   * tin (chủ không bao giờ biết có báo cáo) hay tin mà không báo cáo (một link trỏ
   * vào một ngày trống).
   *
   * Kết luận "đã ghi hay chưa" đọc từ `meta.changes` của câu **thứ nhất** — đúng
   * câu đặt tin vào kho, tức đúng thứ `thong_bao_id` khai là đã có. Cùng lý lẽ của
   * `#ghiMotMocCanhBao`: khai một tin không có trong kho thì cron gửi đi tìm một
   * dòng không tồn tại.
   */
  sinhBaoCao(yc: YeuCauSinhBaoCao): Promise<KetQuaSinhBaoCao> {
    return this.#xepHang(() => this.#sinhMotBaoCao(yc));
  }

  async #sinhMotBaoCao(yc: YeuCauSinhBaoCao): Promise<KetQuaSinhBaoCao> {
    const db = this.#env.DB;
    const bay_gio = Date.now();
    const bo_qua: KetQuaSinhBaoCao = { da_ghi: false, thong_bao_id: null, kenh: null };

    const thong_bao_id = crypto.randomUUID();

    const ket = await db.batch([
      db
        .prepare(
          `INSERT INTO thong_bao (id, workspace_id, loai, uu_tien, noi_dung, tao_luc)
           SELECT ?, ?, ?, 'thuong', ?, ?
             FROM workspace w
            WHERE w.id = ?
              AND NOT EXISTS (
                SELECT 1 FROM bao_cao
                 WHERE workspace_id = ? AND ngay = ? AND loai = ?
              )`,
        )
        .bind(
          thong_bao_id,
          yc.workspace_id,
          LOAI_TIN_BAO_CAO[yc.loai],
          yc.noi_dung_tin,
          bay_gio,
          yc.workspace_id,
          yc.workspace_id,
          yc.ngay,
          yc.loai,
        ),

      db
        .prepare(
          `INSERT INTO bao_cao
             (workspace_id, ngay, loai, noi_dung_md, du_lieu_json, tao_luc)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
        )
        .bind(
          yc.workspace_id,
          yc.ngay,
          yc.loai,
          yc.noi_dung_md,
          yc.du_lieu_json,
          bay_gio,
        ),
    ]);

    if ((ket[0]?.meta.changes ?? 0) === 0) return bo_qua;

    this.danhThuc(`bao_cao:${yc.ngay}`);
    this.danhThuc('bao_cao');

    return {
      da_ghi: true,
      thong_bao_id,
      // Tin đã vào kho; chặng ra Telegram do cron gửi mỗi phút làm — `KENH_CHO_GUI`.
      kenh: KENH_CHO_GUI,
    };
  }

  async #chayMotLenh(lenh: Lenh): Promise<PhanHoiLenh<unknown>> {
    // Lệnh tới từ dây (JSON), nên loại phải kiểm lúc chạy, không tin kiểu tĩnh.
    const loai: unknown = (lenh as { loai?: unknown } | null)?.loai;
    if (!laLoaiLenh(loai)) {
      return {
        ok: false,
        error: 'INVALID_INPUT',
        message: `Không có lệnh tên "${String(loai)}".`,
      };
    }

    const db = this.#env.DB;
    const bay_gio = Date.now();
    /*
     * **Bộ sinh mục xác nhận** — 19.12 câu 57, "mọi đường kiểm cổng". Nó **thu**
     * câu lệnh thay vì ghi, và `cau_lenh` dưới đây gộp chúng vào **cùng**
     * `db.batch()` với thay đổi của handler. Xem `muc-xac-nhan.ts`.
     */
    const bo_sinh = boSinhMucXacNhan(db, bay_gio);
    const boi_canh: BoiCanhLenh = {
      env: this.#env,
      db,
      bay_gio,
      danhThuc: (chu_de) => this.danhThuc(chu_de),
      // Cổng bằng chứng (SPEC mục 7) — xem `cong-bang-chung.ts`.
      cong: congBangChungCua(this.#env, db, null, bo_sinh),
    };

    try {
      // `as never` chỉ để TypeScript khớp lệnh với handler của đúng loại đó;
      // `laLoaiLenh` ở trên đã bảo đảm cặp này khớp lúc chạy.
      const handler = SO_DANG_KY_HANDLER[loai] as (
        l: never,
        bc: BoiCanhLenh,
      ) => Promise<{
        cau_lenh: D1PreparedStatement[];
        lich_su?: YeuCauGhiLichSu[];
        danh_thuc?: string[];
        loi_sau_ghi?: { ma: MaLoi; message: string };
        luot_tin_hieu?: string;
        ket_qua: unknown;
      }>;

      const ket = await handler(lenh as never, boi_canh);

      const dong_muc = cauDongMucXacNhanKhiXong(db, lenh.workspace_id, ket.lich_su ?? [], bay_gio);
      const cau_lenh = [
        ...ket.cau_lenh,
        // Lịch sử nằm trong **cùng batch** với thay đổi: cùng thành, cùng hỏng,
        // không bao giờ có thay đổi mà thiếu dòng lịch sử (SPEC mục 4).
        ...this.#cauLenhLichSu(
          db,
          lenh.workspace_id,
          tacGiaCua(lenh.ai),
          ket.lich_su ?? [],
          bay_gio,
        ),
        ...this.#cauLenhLenTieng(db, lenh, bay_gio),
        ...this.#cauLenhTinHieuPhien(db, lenh, bay_gio, ket.luot_tin_hieu),
        /*
         * Mục xác nhận tự sinh của **lần kiểm cổng** trong lệnh này — cùng batch,
         * cùng thành, cùng hỏng (19.12 câu 57; lý lẽ nguyên tử ở
         * `muc-xac-nhan.ts`). Handler **không** biết gì về nó: cổng là một hàm, và
         * phần ghi của nó đi ra ở đây, nên không handler nào phải nhớ gộp.
         */
        ...bo_sinh.cauLenh(),
        /*
         * Ticket vừa sang Xong ⇒ mục xác nhận tự sinh còn `Chờ` tự đóng (#163,
         * BAT-40). **Cuối cùng**, sau cả bộ sinh: xem `cauDongMucXacNhanKhiXong`.
         */
        ...dong_muc,
      ];

      if (cau_lenh.length > 0) await db.batch(cau_lenh);

      // Đánh thức chỉ sau khi ghi thành công. Có câu tự đóng ⇒ màn hình Cần Chủ
      // có thể đã đổi (chủ đề chung `can_chu`, cùng nếp bộ sinh).
      const thuc_dong = dong_muc.length > 0 ? ['can_chu'] : [];
      for (const chu_de of [...(ket.danh_thuc ?? []), ...bo_sinh.danhThuc(), ...thuc_dong]) {
        this.danhThuc(chu_de);
      }

      /*
       * **Ghi xong rồi mới báo lỗi** — xem `KetQuaHandler.loi_sau_ghi`.
       * SPEC mục 4 và 19.2 có luật *vừa* từ chối *vừa* đổi dữ liệu: vào Xong
       * thiếu bằng chứng thì trả `EVIDENCE_REQUIRED` **và** ticket sang Chờ kiểm
       * chứng. Lỗi phải nằm sau `batch()`, nếu không nửa luật sau mất.
       */
      if (ket.loi_sau_ghi !== undefined) {
        return { ok: false, error: ket.loi_sau_ghi.ma, message: ket.loi_sau_ghi.message };
      }

      return { ok: true, ket_qua: ket.ket_qua };
    } catch (e) {
      if (BatonError.la(e)) return { ok: false, error: e.ma, message: e.message };

      /*
       * **Lỗi ràng buộc của D1 → mã nghiệp vụ**, không phải `INTERNAL`/500.
       * Các trigger của migration 0001/0002 phát `RAISE(ABORT, 'MÃ: …')` đúng để
       * tách ở đây; thiếu chặng này thì nối ticket xuyên workspace hay vỡ
       * `ux_ticket_so` đều ra 500, lệch SPEC mục 13. Xem `loi-d1.ts`.
       */
      const tu_d1 = batonErrorTuLoiD1(e);
      if (tu_d1 !== null) {
        // Chi tiết thô chỉ vào log, không vào thân response (SPEC mục 15).
        console.error('Lỗi ràng buộc D1:', tu_d1.chiTiet);
        return { ok: false, error: tu_d1.ma, message: tu_d1.message };
      }

      /*
       * **Lỗi lạ trong cửa ghi** (BAT-65): D1 tạm thời, bug… Ghi một dòng có cấu
       * trúc trước khi ném, để biết lỗi xảy ra **trong** DO (và ở lệnh nào), chứ
       * không phải ở chặng gọi DO. Chỉ loại lệnh, id ticket, loại bằng chứng —
       * không `ai`, không nội dung lệnh. Không thử lại: lệnh ghi không idempotent.
       */
      const tho = lenh as unknown as Record<string, unknown>;
      ghiDongLoi({
        su_kien: 'loi_cua_ghi',
        loai_lenh: loai,
        ticket_id: dinhDanhDeLog(tho['ticket_id']),
        loai_bang_chung: loaiBangChungDeLog(tho['loai_bang_chung']),
        ...moTaLoi(e),
      });
      throw e;
    }
  }

  /**
   * Câu lệnh chèn lịch sử ticket.
   *
   * Nhận `tac_gia_mac_dinh` thay vì một `Lenh`: đường **tự lên Xong** của d.221
   * không có lệnh nào (không ai gõ nó), nhưng vẫn phải ghi lịch sử — và ghi với
   * **đúng một** bản mã, không một bản thứ hai cho đường tự động.
   */
  #cauLenhLichSu(
    db: D1Database,
    workspace_id: string,
    tac_gia_mac_dinh: TacGia,
    dong: YeuCauGhiLichSu[],
    luc: number,
  ): D1PreparedStatement[] {
    const cau = db.prepare(
      `INSERT INTO ticket_history
         (id, workspace_id, ticket_id, tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    return dong.map((d) => {
      // Thay đổi do **hệ thống** (tự lên Xong — SPEC mục 7; ticket điều phối tự
      // theo — 19.4) mang tác giả riêng; còn lại là người ra lệnh.
      const tac_gia = d.tac_gia ?? tac_gia_mac_dinh;
      return cau.bind(
        crypto.randomUUID(),
        workspace_id,
        d.ticket_id,
        tac_gia.loai,
        tac_gia.agentId ?? null,
        luc,
        d.truong,
        d.gia_tri_cu,
        d.gia_tri_moi,
      );
    });
  }

  /**
   * "**Lần cuối lên tiếng**" của agent — SPEC mục 3 (hiện ở trang agent và trên
   * Tổng quan: "thời gian từ tín hiệu cuối").
   *
   * Đặt ở đây, không ở từng handler, vì đây là chỗ duy nhất biết "lệnh ghi đã
   * thành công": câu lệnh nằm trong **cùng batch** với thay đổi, nên không bao
   * giờ có chuyện ghi được dữ liệu mà mốc lên tiếng không nhích, hay ngược lại
   * nhích mốc cho một lệnh bị từ chối.
   *
   * **Chỉ lệnh GHI tính.** Lệnh đọc không đi qua cửa ghi nên tự nhiên không
   * tính, đúng tinh thần SPEC mục 6 ("Lệnh đọc không tính"). Phân biệt mốc này
   * với "tín hiệu phiên" của mục 6 (phần 2) — xem `cau-hoi-spec.md` #13.
   *
   * Chỉ nhích về sau (`max`): các lệnh trong một batch có thể về không đúng thứ
   * tự thời gian, và mốc "lần cuối" không bao giờ được chạy lùi.
   */
  #cauLenhLenTieng(db: D1Database, lenh: Lenh, luc: number): D1PreparedStatement[] {
    if (lenh.ai.loai !== 'agent') return [];
    return [
      db
        .prepare(
          `UPDATE agent SET len_tieng_luc = max(coalesce(len_tieng_luc, 0), ?)
            WHERE id = ? AND workspace_id = ?`,
        )
        .bind(luc, lenh.ai.agent_id, lenh.workspace_id),
    ];
  }

  /**
   * "**Tín hiệu**" của phiên — SPEC mục 6 dòng 188: "Tín hiệu = **mọi lệnh ghi
   * của agent trên phiên đó** (nhịp tim, hoạt động, bằng chứng, bình luận, nộp).
   * **Lệnh đọc không tính**."
   *
   * Đặt ở **đây**, ngay cạnh `#cauLenhLenTieng`, và **không** rắc một hàm
   * `capNhatTinHieu()` vào từng handler. Ba lý do, cùng ba lý do của mốc "lần
   * cuối lên tiếng":
   *   1. Cửa ghi là chỗ **duy nhất** biết "lệnh ghi đã thành công", và câu lệnh
   *      này nằm trong **cùng batch** với thay đổi — không bao giờ có chuyện ghi
   *      được dữ liệu mà tín hiệu không nhích, hay tín hiệu nhích cho một lệnh bị
   *      từ chối.
   *   2. Lệnh **đọc** không đi qua cửa ghi, nên "lệnh đọc không tính" là đúng
   *      **tự nhiên**, không phải một luật ai đó phải nhớ.
   *   3. Lệnh ghi **thêm về sau** tự có tín hiệu. Rắc tay thì một lệnh mới quên
   *      gọi là phiên bị tính đứng trong khi agent đang làm — và nó **im lặng**:
   *      không test nào của lệnh mới đó đỏ, chỉ có một cảnh báo sai lúc 3 giờ sáng.
   *
   * **Phiên nào được nhích?** (BAT-57 — CoS/Chủ giao, **thu hẹp** 19.12 câu 41
   * cho ca nhiều phiên; `cau-hoi-spec.md` mục BAT-57, chờ Chủ chốt sửa câu 41.)
   * Câu 41 chữ nguyên: "nhích tín hiệu của **mọi** phiên còn mở của chính agent
   * gọi lệnh". Hệ quả thật: agent có lượt A (đã chết) và lượt B (đang chạy) thì
   * mọi lệnh ghi của B làm A "sống" mãi, và cron d.196 **không bao giờ** báo A
   * đứng — tức che đúng thứ mục 6 sinh ra để thấy. Nay:
   *   1. Lệnh **gắn rõ một lượt giao** — handler khai `luot_tin_hieu` trong kết
   *      quả (`KetQuaHandler`): nhịp tim, hoạt động, kế hoạch, nộp báo cáo (nhóm
   *      bị `SESSION_CLOSED` chặn theo câu 45), cộng "nhận" (mở phiên của chính
   *      lượt đó) ⇒ chỉ nhích **phiên của đúng lượt đó**, và chỉ khi đó là phiên
   *      của chính agent gọi (`agent_id = ?`).
   *   2. Lệnh **không gắn lượt** (bình luận, sửa/tạo ticket, bằng chứng — #67 xếp
   *      bằng chứng vào nhóm chung —, giao việc, nghiệm thu, huỷ, trả lời câu hỏi
   *      của người khác…) ⇒ nhích **chỉ khi agent có đúng 1 phiên mở** (giữ hành
   *      vi cũ cho ca phổ biến). Có **≥2** phiên mở ⇒ **không nhích phiên nào**:
   *      không quy được về phiên nào, và thà báo đứng oan một phiên còn hơn che
   *      một phiên chết. Agent nhiều phiên phải nhịp tim từng lượt (`--luot` /
   *      `BATON_LUOT`, BAT-56).
   *
   * Vì sao khai ở **kết quả handler**, không đọc `luot_giao_id` trong lệnh: cùng
   * trường đó có trong lệnh của **người giao** (`nghiem_thu`, `huy_luot`,
   * `tra_loi_cau_hoi`) — lượt của người khác, không phải phiên nào của người gọi.
   * Và handler mới là chỗ biết lượt **thật** (heartbeat/hoạt động tra ra phiên từ
   * id). **Mặc định an toàn**: lệnh thêm về sau không khai gì ⇒ rơi vào nhánh 2 —
   * không bao giờ nhích nhầm một phiên chết khi agent có ≥2 phiên.
   *
   * "Phiên mở" ở nhánh 2 = chưa `closed` trong DB **và** không phải `stopping` đã
   * quá 10 phút (d.194: "closed" về mặt luật, dù DB chưa ghi) — một phiên đã tự
   * đóng theo luật không được làm agent thành "nhiều phiên".
   *
   * Phép đếm **tính cả phiên vừa đóng trong chính lệnh này** (`dong_luc = luc` —
   * mọi đường đóng phiên trong handler ghi `dong_luc = bay_gio`, và `luc` ở đây
   * chính là `bay_gio` đó): câu này chạy **sau** câu lệnh của handler trong cùng
   * batch, nên một lệnh chung đóng phiên B (vd `status TK2 review`, bằng chứng
   * làm ticket tự lên Xong — `cauLenhDongPhienTheoTicket`) sẽ bị đếm như "chỉ còn
   * A" và nhích A. Lệnh đó là bằng chứng về B, không về A (sửa theo reviewer
   * BAT-57). Lệch duy nhất: một phiên đóng ở lệnh **khác** cùng đúng mili-giây —
   * khi đó không nhích, tức nghiêng về phía an toàn.
   *
   * Chỉ nhích về sau (`max`) và chỉ phiên chưa đóng: một phiên đã đóng không nhận
   * tín hiệu nào nữa (d.195), và trigger `tg_phien_dong_la_vinh_vien` của 0006
   * sẽ chặn nếu câu này vô tình đụng tới nó. Mốc chống bắn lặp của câu 46
   * (`canh_bao_tin_hieu_luc`) không đổi gì ở đây.
   */
  #cauLenhTinHieuPhien(
    db: D1Database,
    lenh: Lenh,
    luc: number,
    luot_tin_hieu: string | undefined,
  ): D1PreparedStatement[] {
    if (lenh.ai.loai !== 'agent') return [];
    const dat = `UPDATE phien
              SET tin_hieu_cuoi_luc = max(tin_hieu_cuoi_luc, ?),
                  cap_nhat_luc = max(cap_nhat_luc, ?)`;

    // Nhánh 1 — lệnh gắn một lượt: đúng phiên của lượt đó, của chính agent gọi.
    if (luot_tin_hieu !== undefined) {
      return [
        db
          .prepare(
            `${dat}
              WHERE workspace_id = ? AND agent_id = ? AND luot_giao_id = ?
                AND trang_thai <> 'closed'`,
          )
          .bind(luc, luc, lenh.workspace_id, lenh.ai.agent_id, luot_tin_hieu),
      ];
    }

    // Nhánh 2 — lệnh chung: chỉ khi agent có ĐÚNG 1 phiên mở (theo luật).
    const mo = `trang_thai <> 'closed'
                AND NOT (trang_thai = 'stopping' AND stopping_luc <= ?)`;
    const het_han_dung = luc - HAN_XAC_NHAN_DUNG_MS;
    return [
      db
        .prepare(
          `${dat}
            WHERE workspace_id = ? AND agent_id = ? AND ${mo}
              AND (SELECT count(*) FROM phien p2
                    WHERE p2.workspace_id = ? AND p2.agent_id = ?
                      AND ((p2.trang_thai <> 'closed'
                            AND NOT (p2.trang_thai = 'stopping' AND p2.stopping_luc <= ?))
                           OR (p2.trang_thai = 'closed' AND p2.dong_luc = ?))) = 1`,
        )
        .bind(
          luc,
          luc,
          lenh.workspace_id,
          lenh.ai.agent_id,
          het_han_dung,
          lenh.workspace_id,
          lenh.ai.agent_id,
          het_han_dung,
          luc,
        ),
    ];
  }

  /* ---------------------------------------------------------------- *
   * Chỗ cắm cho lệnh chờ dài (SPEC mục 13 `--wait`, mục 8 "≤ 3 giây")
   * ---------------------------------------------------------------- */

  /**
   * **Đăng ký** một lệnh chờ và trả về ngay (đồng bộ), kèm cách huỷ.
   *
   * Tách khỏi `cho()` vì đường kéo việc phải **đăng ký trước, đọc sau**: đọc
   * trước rồi mới đăng ký là một cửa sổ đua — một lệnh ghi rơi đúng vào khoảng
   * giữa thì khoá đánh thức bay vào chỗ không có ai nghe, và agent nằm chờ hết 60
   * giây dù việc đã có. Đăng ký trước thì khoá đó luôn có người nhận; đọc xong
   * thấy có việc thì `huy()` ngay, không để lại waiter nào.
   *
   * Mọi đường ra đều dọn sổ `#waiters` (đánh thức, hết hạn, huỷ, client ngắt) —
   * SPEC mục 15 không nói gì về chuyện này, nhưng một waiter treo là một lần đánh
   * thức xác và một chỗ rò bộ nhớ trong một DO sống rất lâu.
   */
  #dangKyCho(
    chu_de: readonly string[],
    han_ms: number,
    tin_hieu_ngat?: AbortSignal,
  ): DangKyCho {
    let ket_thuc: (duoc: boolean) => void = () => undefined;
    const ket_qua = new Promise<boolean>((resolve) => {
      ket_thuc = resolve;
    });

    let xong = false;
    const waiter: Waiter = {
      chu_de: new Set(chu_de),
      danh_thuc: () => ra(true),
    };

    const ra = (duoc: boolean): void => {
      if (xong) return;
      xong = true;
      clearTimeout(dong_ho);
      tin_hieu_ngat?.removeEventListener('abort', khiNgat);
      this.#waiters.delete(waiter);
      ket_thuc(duoc);
    };
    const khiNgat = (): void => ra(false);

    const dong_ho = setTimeout(() => ra(false), Math.max(0, han_ms));

    // Client đã ngắt trước khi ta kịp đăng ký: không treo gì cả.
    if (tin_hieu_ngat?.aborted === true) {
      clearTimeout(dong_ho);
      return { ket_qua: Promise.resolve(false), huy: () => undefined };
    }
    tin_hieu_ngat?.addEventListener('abort', khiNgat);

    this.#waiters.add(waiter);
    return { ket_qua, huy: () => ra(false) };
  }

  /**
   * Treo tới khi có ai gọi `danhThuc(chu_de)`, hoặc hết `han_ms`, hoặc client ngắt.
   * Trả `true` = được đánh thức, `false` = hết thời gian chờ (CLI thoát mã 4,
   * SPEC mục 19.9).
   */
  cho(
    chu_de: string | readonly string[],
    han_ms: number,
    tin_hieu_ngat?: AbortSignal,
  ): Promise<boolean> {
    const ds = typeof chu_de === 'string' ? [chu_de] : chu_de;
    return this.#dangKyCho(ds, han_ms, tin_hieu_ngat).ket_qua;
  }

  /** Gọi dậy mọi lệnh đang chờ một chủ đề. Trả số lệnh đã đánh thức. */
  danhThuc(chu_de: string): number {
    let n = 0;
    for (const w of [...this.#waiters]) {
      if (w.chu_de.has(chu_de)) {
        w.danh_thuc();
        n += 1;
      }
    }
    return n;
  }

  /* ---------------------------------------------------------------- *
   * `baton tasks --wait` — SPEC mục 13 d.352, d.387
   * ---------------------------------------------------------------- */

  /**
   * **Chờ dài cho đường kéo việc.** SPEC mục 13 d.352: "Có chế độ chờ dài tới 60
   * giây; **có việc mới hoặc tín hiệu mới thì trả về ngay**."
   *
   * Vòng lặp nằm **trong DO**, không ở Worker, vì chỉ ở đây mới làm được
   * "đăng-ký-trước-đọc-sau" (xem `#dangKyCho`): Worker không có cách nào chen một
   * lần đọc D1 vào giữa lúc waiter đã vào sổ. Giá phải trả là đường **đọc** này đi
   * qua DO, trái nếp "lệnh đọc đi thẳng D1" — chỉ đúng với nhánh `--wait`, còn
   * `wait=0` thì Worker đọc thẳng và không chạm DO (xem `index.ts`).
   *
   * **d.387 "Lệnh chờ dài tính 1 request"**: bộ đếm 600/phút nằm ở middleware
   * `xacThuc`, đếm đúng một lần lúc request vào. Vòng lặp dưới đây **không** gọi
   * `demMotRequest` lần nào — mỗi lần tỉnh không tốn thêm đơn vị hạn mức nào.
   *
   * Tỉnh rồi mà đọc lại vẫn chưa có gì (khoá đánh thức tới từ một thay đổi không
   * liên quan tới mình) thì **chờ tiếp phần thời gian còn lại**, không trả rỗng
   * sớm: d.352 hứa "tới 60 giây".
   */
  async choViec(yc: YeuCauChoViec, tin_hieu_ngat?: AbortSignal): Promise<ViecCuaToiRa> {
    const db = this.#env.DB;
    const bat_dau = Date.now();
    const het_han = bat_dau + this.hanChoHieuLucMs(yc.han_ms);

    for (;;) {
      // 1. Đăng ký nghe TRƯỚC khi đọc (xem `#dangKyCho`).
      const phien_minh_giao = await phienMoMinhGiao(db, yc.workspace_id, yc.ai);
      const con_lai = het_han - Date.now();
      const dang_ky = this.#dangKyCho(
        chuDeKeoViec(yc.ai, phien_minh_giao),
        Math.max(0, con_lai),
        tin_hieu_ngat,
      );

      /*
       * `finally` chứ không phải `huy()` ở từng đường ra: `viecCuaToi` và
       * `phienMoMinhGiao` đọc D1, và một lỗi D1 ở đây mà không dọn sổ thì waiter
       * nằm trong `#waiters` tới hết `han_ms` (≤60 giây) — `soDangCho()` sai và
       * một `danhThuc` về sau gọi dậy một cái xác. Mọi đường thoát, **kể cả ném
       * lỗi**, phải huỷ đăng ký.
       */
      let duoc_goi: boolean;
      try {
        // 2. Đọc. Có việc thì trả NGAY và dọn waiter.
        const viec = await viecCuaToi(db, yc.workspace_id, yc.ai, Date.now());
        if (viec.co_viec || con_lai <= 0) {
          return this.#ra(viec, bat_dau, !viec.co_viec);
        }

        // 3. Treo.
        duoc_goi = await dang_ky.ket_qua;
      } finally {
        dang_ky.huy();
      }

      /*
       * 4. **Token còn hiệu lực không.** SPEC không nói ca "token bị thu hồi / agent
       * bị tắt giữa lúc đang chờ" (`cau-hoi-spec.md` #51). Chốt tạm hướng đóng: mỗi
       * lần tỉnh thì kiểm lại, mất hiệu lực thì cắt ngay. Hướng mở (chờ tiếp vì đã
       * xác thực lúc vào) để một token đã thu hồi còn đọc được dữ liệu tới 60 giây.
       *
       * Chạy **trước** cả hai đường ra dưới đây, không riêng đường tỉnh: token có
       * thể mất hiệu lực bằng đường **không phát khoá** `agent:<tôi>` (sửa DB tay,
       * hay DO khởi động lại làm mất sổ waiter), lúc đó waiter hết hạn chứ không
       * được gọi dậy — mà đường hết hạn cũng **trả dữ liệu** (đọc một lần cuối).
       * Kiểm ở một chỗ cho cả hai đường, không hai bản.
       */
      await this.#kiemTokenConHieuLuc(db, yc.workspace_id, yc.ai);

      if (!duoc_goi) {
        // Hết hạn (hoặc client ngắt): đọc một lần cuối cho chắc rồi trả rỗng.
        return this.#ra(await viecCuaToi(db, yc.workspace_id, yc.ai, Date.now()), bat_dau, true);
      }
    }
  }

  /**
   * Kiểm lại token của người gọi một lệnh chờ dài. Ném `INVALID_TOKEN`/401 nếu
   * token không còn trỏ tới agent nào của workspace này, `FORBIDDEN`/403 nếu
   * agent đã bị tắt. Chủ (`loai !== 'agent'`) đi qua phiên đăng nhập, không có
   * token băm để kiểm — không đụng tới.
   *
   * **Một bản cho cả hai lệnh chờ dài** (`choViec` và `choCanChu`): nhận ba thứ
   * nó thật cần thay vì một `YeuCauChoViec`, nên lệnh chờ thứ ba thêm về sau cũng
   * dùng đúng bản này, không một bản thứ hai lệch đi một điều kiện.
   */
  async #kiemTokenConHieuLuc(
    db: D1Database,
    workspace_id: string,
    ai: AiKeoViec,
  ): Promise<void> {
    if (ai.loai !== 'agent' || ai.token_bam === null) return;
    const tra = await agentTheoToken(db, ai.token_bam);
    if (tra === null || tra.workspace_id !== workspace_id) {
      throw new BatonError('INVALID_TOKEN');
    }
    if (tra.ai.disabled) {
      throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt, không gọi API được.' });
    }
  }

  #ra(viec: ViecCuaToi, bat_dau: number, het_gio: boolean): ViecCuaToiRa {
    return {
      ...viec,
      het_gio: het_gio && !viec.co_viec,
      da_cho_ms: Date.now() - bat_dau,
      cho_toi_da_giay: CHO_DAI_TOI_DA_GIAY,
    };
  }

  /* ---------------------------------------------------------------- *
   * `baton result T-x --wait` — SPEC mục 8 d.267, mục 13 d.376, 19.9 d.543
   * ---------------------------------------------------------------- */

  /**
   * **Chờ dài cho một mục Cần Chủ.** SPEC mục 8 d.267: "Agent đang chờ bằng
   * `baton result T-x --wait` … nhận kết quả **trong vòng 3 giây** sau khi chủ
   * bấm Gửi."
   *
   * Song hình với `choViec`, và cố ý **giống từng bước** — mọi lý lẽ ở đó áp ở
   * đây: vòng lặp nằm trong DO vì chỉ ở đây mới chen được một lần đọc D1 vào sau
   * khi waiter đã vào sổ; `finally` dọn sổ ở **mọi** đường thoát kể cả ném lỗi;
   * token được kiểm lại mỗi lần tỉnh (`cau-hoi-spec.md` #51); d.387 "lệnh chờ dài
   * tính 1 request" nên vòng lặp không gọi `demMotRequest` lần nào.
   *
   * ## Ba điểm riêng của đường này
   *
   * **1. Mục được tra MỘT LẦN trước vòng lặp, để lấy chủ đề.** Chủ đề nghe là
   * `can_chu_ma:<T-số>` của **dòng đọc được qua cửa tầm nhìn**, không của chuỗi
   * client gửi. Tra trước vòng lặp là an toàn vì `ma_so` của một mục **không bao
   * giờ đổi** — và từ migration **0016** đó là một luật của **DB**, không chỉ "không
   * có đường ghi nào sửa nó". **Hai** trigger, vì một mình không đủ:
   * `tg_can_chu_ma_so_bat_bien` chặn mọi `UPDATE` đổi cột đó, và
   * `tg_can_chu_khong_ghi_de` chặn `INSERT OR REPLACE` lên một `id` đã có — đường
   * **không** đi qua `BEFORE UPDATE` nào (cùng lỗ đã tìm ra thật ở lượt 2a và đã
   * bịt cho `nhat_ky` ở 0014). Cả hai có ca SQL thô. Lượt 3a khai bảo đảm này mà
   * chỗ dựa **chỉ** là sự vắng mặt của mã — reviewer bắt đúng, và nếp của dự án là
   * **siết cấu trúc**, không hạ lời khai. Thứ đổi được là `trang_thai`, và
   * nó được đọc **lại** bên trong vòng lặp, sau khi đã đăng ký waiter. Ngoài tầm
   * nhìn hay không có thật → `NOT_FOUND`, giống hệt nhau (19.12 câu 15).
   *
   * **2. "Có kết quả" = mục rời `open`.** `resolved` **hoặc** `skipped`: mục 8
   * d.244 cho `Chờ` đúng hai đường ra, và 19.9 d.540 nói "agent nhận trạng thái
   * `skipped`". Chờ riêng `resolved` thì một mục bị bỏ qua làm agent chờ hết 60
   * giây rồi chờ lại, vô hạn, cho một mục **sẽ không bao giờ** `resolved`.
   *
   * **3. Đây là lệnh ĐỌC** — 19.12 **câu 53**. Nó không đi qua `#chayMotLenh`,
   * nên `#cauLenhLenTieng` và `#cauLenhTinHieuPhien` không chạy: "lệnh đọc không
   * tính" là đúng **tự nhiên**, không một luật ai phải nhớ. Có ca test khẳng định
   * cả hai mốc không nhích sau một lệnh chờ dài.
   *
   * @param truocKhiDoc Chỗ cắm **chỉ để test**, cùng nếp `soDangCho()` và
   *   `hanChoHieuLucMs()`: được gọi **ngay sau khi waiter vào sổ và ngay trước**
   *   lần đọc trạng thái. Ca test "chủ bấm Gửi vào đúng khe giữa hai bước" cần
   *   đúng khe này; không có nó thì thứ tự "đăng ký trước, đọc sau" chỉ là một
   *   lời khai, không một hành vi đo được (xem `test/ket-qua-can-chu.test.ts`).
   */
  async choCanChu(
    yc: YeuCauChoCanChu,
    tin_hieu_ngat?: AbortSignal,
    truocKhiDoc?: () => Promise<void>,
  ): Promise<KetQuaCanChuRa> {
    const db = this.#env.DB;
    const bat_dau = Date.now();
    const het_han = bat_dau + this.hanChoHieuLucMs(yc.han_ms);
    const ai_goi = aiGoiCua(yc.ai);

    // Tra một lần để có **mã đã qua cửa tầm nhìn** (điểm 1 ở trên).
    const dau = await layMucCanChu(db, ai_goi, yc.workspace_id, yc.ma_hoac_id);
    const chu_de = chuDeChoCanChu(dau.ma, yc.ai.loai === 'agent' ? yc.ai.ai.agent_id : null);
    if (dau.da_xu_ly) return this.#raMuc(dau, bat_dau, false);

    for (;;) {
      // 1. Đăng ký nghe TRƯỚC khi đọc (xem `#dangKyCho`).
      const con_lai = het_han - Date.now();
      const dang_ky = this.#dangKyCho(chu_de, Math.max(0, con_lai), tin_hieu_ngat);

      let duoc_goi: boolean;
      try {
        // Khe đua của ca test — xem `@param truocKhiDoc`.
        if (truocKhiDoc !== undefined) await truocKhiDoc();

        // 2. Đọc. Đã có kết quả thì trả NGAY và dọn waiter.
        const muc = await layMucCanChu(db, ai_goi, yc.workspace_id, dau.id);
        if (muc.da_xu_ly || con_lai <= 0) {
          return this.#raMuc(muc, bat_dau, !muc.da_xu_ly);
        }

        // 3. Treo.
        duoc_goi = await dang_ky.ket_qua;
      } finally {
        dang_ky.huy();
      }

      // 4. Token còn hiệu lực không — cùng lý do với `choViec`, cùng một bản mã.
      await this.#kiemTokenConHieuLuc(db, yc.workspace_id, yc.ai);

      if (!duoc_goi) {
        // Hết hạn (hoặc client ngắt): đọc một lần cuối cho chắc rồi trả.
        const cuoi = await layMucCanChu(db, ai_goi, yc.workspace_id, dau.id);
        return this.#raMuc(cuoi, bat_dau, !cuoi.da_xu_ly);
      }
    }
  }

  #raMuc(muc: MucCanChuRa, bat_dau: number, het_gio: boolean): KetQuaCanChuRa {
    return {
      ...muc,
      het_gio: het_gio && !muc.da_xu_ly,
      da_cho_ms: Date.now() - bat_dau,
      cho_toi_da_giay: CHO_DAI_TOI_DA_GIAY,
    };
  }

  /**
   * **Kẹp tầng DO** cho hạn chờ dài (SPEC mục 13 d.352 "tới 60 giây").
   *
   * `msChoDai` đã kẹp ở Worker; đây là **tầng thứ hai** và nó cố ý không tin
   * tầng trước: DO là cái giữ request và waiter thật, nên trần tài nguyên phải
   * được canh ở đây — một đường gọi mới (RPC nội bộ, test, một route khác) quên
   * kẹp thì DO vẫn không treo quá 60 giây. Để **public** để test đo được đúng
   * tầng này mà không phải chờ 60 giây thật (xem `soDangCho`, cùng lý do).
   */
  hanChoHieuLucMs(han_ms: number): number {
    return Math.min(Math.max(0, han_ms), CHO_DAI_TOI_DA_GIAY * 1000);
  }

  /** Số lệnh đang chờ — chỉ để test và quan sát. */
  soDangCho(): number {
    return this.#waiters.size;
  }
}

/* ------------------------------------------------------------------ *
 * Phía gọi: mọi lệnh GHI của API đi qua hàm này
 * ------------------------------------------------------------------ */

/** DO id dẫn xuất từ `workspace_id`: một cửa ghi cho mỗi workspace. */
export function cuaGhiCua(env: Env, workspace_id: string): DurableObjectStub {
  return env.WORKSPACE_GATE.get(env.WORKSPACE_GATE.idFromName(`workspace:${workspace_id}`));
}

/**
 * Gửi một lệnh GHI tới cửa ghi của workspace. Lỗi nghiệp vụ được dựng lại thành
 * `BatonError` để middleware trả đúng `{ error, message }` cùng mã HTTP.
 */
export async function goiLenh<L extends Lenh>(
  env: Env,
  lenh: L,
): Promise<KetQuaCuaLenh<L>> {
  const res = await cuaGhiCua(env, lenh.workspace_id).fetch('https://cua-ghi/lenh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(lenh),
  });

  // Cửa ghi trả lỗi nghiệp vụ trong **thân** với 200; mã HTTP khác 200 nghĩa là
  // chặng nội bộ hỏng (lỗi SQLite, bug). Không để nó rơi vào `res.json()` rồi
  // thành lỗi phân tích JSON khó hiểu — trả `INTERNAL`/500, là mã CLI hiểu là
  // "thử lại hoặc báo người" (mã thoát 2), không phải "sửa dữ liệu" (mã 1).
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }

  const than = await res.json<PhanHoiLenh<KetQuaCuaLenh<L>>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}

/**
 * Gửi kết luận xác minh (chặng 3) tới cửa ghi — SPEC mục 7 d.219–221.
 *
 * Người gọi duy nhất là route gửi bằng chứng ở `index.ts`, **sau** khi đã gọi
 * mạng xong ở Worker. Tách thành hàm riêng (không gộp vào `goiLenh`) vì đây
 * không phải một loại lệnh của `BanDoLenh` — xem `WorkspaceGate.ghiXacMinh`.
 */
export async function goiGhiXacMinh(
  env: Env,
  yc: YeuCauGhiXacMinh,
): Promise<KetQuaGhiXacMinh> {
  const res = await cuaGhiCua(env, yc.workspace_id).fetch('https://cua-ghi/xac-minh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<KetQuaGhiXacMinh>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}

/**
 * **Dừng theo dõi** một commit `pushed` quá 7 ngày — SPEC 19.7. Người gọi duy nhất
 * là Cron ở `cron-bang-chung.ts`. Xem `WorkspaceGate.dungTheoDoi`.
 */
export async function goiDungTheoDoi(
  env: Env,
  yc: YeuCauDungTheoDoi,
): Promise<KetQuaDungTheoDoi> {
  const res = await cuaGhiCua(env, yc.workspace_id).fetch('https://cua-ghi/dung-theo-doi', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<KetQuaDungTheoDoi>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}

/**
 * **Ghi mốc cảnh báo + chèn tin vào kho** cho một phiên — SPEC mục 6 d.196, 19.12
 * câu 46. Người gọi duy nhất là Cron 5 phút ở `cron-canh-bao-phien.ts`.
 * Xem `WorkspaceGate.ghiMocCanhBao`.
 */
export async function goiGhiMocCanhBao(
  env: Env,
  yc: YeuCauGhiMocCanhBao,
): Promise<KetQuaGhiMocCanhBao> {
  const res = await cuaGhiCua(env, yc.workspace_id).fetch('https://cua-ghi/ghi-moc-canh-bao', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<KetQuaGhiMocCanhBao>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}

/**
 * **Ghi kết quả một lần gửi ra kênh ngoài** — SPEC mục 12, 19.12 câu 6. Người gọi
 * duy nhất là Cron mỗi phút ở `cron-thong-bao.ts`, **sau** khi đã gọi Telegram
 * xong ở Worker. Xem `WorkspaceGate.ghiMocGui`.
 */
export async function goiGhiMocGui(env: Env, yc: YeuCauGhiMocGui): Promise<KetQuaGhiMocGui> {
  const res = await cuaGhiCua(env, yc.workspace_id).fetch('https://cua-ghi/ghi-moc-gui', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<KetQuaGhiMocGui>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}

/**
 * **Nhắc một mục 🔴 chưa xử lý sau 2 giờ** — SPEC mục 8 d.283. Người gọi duy nhất
 * là Cron mỗi phút ở `cron-thong-bao.ts`. Xem `WorkspaceGate.nhacCanChuDo`.
 */
export async function goiNhacCanChuDo(
  env: Env,
  yc: YeuCauNhacCanChuDo,
): Promise<KetQuaNhacCanChuDo> {
  const res = await cuaGhiCua(env, yc.workspace_id).fetch('https://cua-ghi/nhac-can-chu-do', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<KetQuaNhacCanChuDo>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}

/**
 * **Sinh một báo cáo** (mục 11 d.336 + mục 12 d.346). Người gọi duy nhất là Cron
 * 07:30 / 20:00 ở `cron-bao-cao.ts`, **sau** khi đã dựng dữ liệu và markdown ở
 * Worker. Xem `WorkspaceGate.sinhBaoCao`.
 */
export async function goiSinhBaoCao(
  env: Env,
  yc: YeuCauSinhBaoCao,
): Promise<KetQuaSinhBaoCao> {
  const res = await cuaGhiCua(env, yc.workspace_id).fetch('https://cua-ghi/sinh-bao-cao', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<KetQuaSinhBaoCao>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}

/* ------------------------------------------------------------------ *
 * Đăng nhập của chủ — SPEC mục 15 d.415
 * ------------------------------------------------------------------ */

/**
 * Gọi một trong ba đường đăng nhập của chủ.
 *
 * Một hàm cho cả ba (chỉ khác đường dẫn): phần bóc thân là **y hệt** nhau, và
 * nó có một việc mà các `goi*` khác không có — dựng lại `retryAfter` để 429 của
 * hạn mức chống dò mang được header `Retry-After` của SPEC mục 13.
 */
async function goiChu<T>(env: Env, workspace_id: string, duong: string, yc: unknown): Promise<T> {
  const res = await cuaGhiCua(env, workspace_id).fetch(`https://cua-ghi/chu/${duong}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<T>>();
  if (!than.ok) {
    throw new BatonError(than.error, {
      message: than.message,
      ...(than.retry_after === undefined ? {} : { retryAfter: than.retry_after }),
    });
  }
  return than.ket_qua;
}

/** **Thiết lập tài khoản chủ lần đầu** — xem `thietLapChu`. */
export function goiThietLapChu(
  env: Env,
  yc: YeuCauThietLapChu,
): Promise<KetQuaThietLapChu> {
  return goiChu(env, yc.workspace_id, 'thiet-lap', yc);
}

/** **Đăng nhập** (mật khẩu + TOTP, một request) — xem `dangNhapChu`. */
export function goiDangNhapChu(
  env: Env,
  yc: YeuCauDangNhapChu,
): Promise<KetQuaDangNhapChu> {
  return goiChu(env, yc.workspace_id, 'dang-nhap', yc);
}

/** **Đặt lại TOTP** (đường cứu qua `TOKEN_CHU`) — xem `datLaiTotpChu`. */
export function goiDatLaiTotpChu(
  env: Env,
  yc: YeuCauDatLaiTotpChu,
): Promise<KetQuaDatLaiTotpChu> {
  return goiChu(env, yc.workspace_id, 'dat-lai-totp', yc);
}

/** **Mở khoá** bộ đếm thử sai (đường thoát qua `TOKEN_CHU`) — xem `moKhoaChu`. */
export function goiMoKhoaChu(env: Env, yc: YeuCauMoKhoaChu): Promise<KetQuaMoKhoaChu> {
  return goiChu(env, yc.workspace_id, 'mo-khoa', yc);
}

/** **Đăng xuất** một phiên hoặc mọi nơi (d.415) — xem `dangXuatChu`. */
export function goiDangXuatChu(
  env: Env,
  yc: YeuCauDangXuatChu,
): Promise<KetQuaDangXuatChu> {
  return goiChu(env, yc.workspace_id, 'dang-xuat', yc);
}

/** **Đổi mật khẩu** (BAT-11, chỉ từ phiên cookie) — xem `doiMatKhauChu`. */
export function goiDoiMatKhauChu(
  env: Env,
  yc: YeuCauDoiMatKhauChu,
): Promise<KetQuaDoiMatKhauChu> {
  return goiChu(env, yc.workspace_id, 'doi-mat-khau', yc);
}

/** **Ghi lần dùng cuối** của một phiên, theo nhịp (BAT-11) — xem `chamPhienChu`. */
export function goiChamPhienChu(env: Env, yc: YeuCauChamPhienChu): Promise<{ da_ghi: boolean }> {
  return goiChu(env, yc.workspace_id, 'cham-phien', yc);
}

/**
 * Gửi một lệnh **chờ dài** của đường kéo việc tới DO của workspace.
 *
 * Cùng cách bóc lỗi với `goiLenh`: lỗi nghiệp vụ trong thân, mã HTTP khác 200 là
 * chặng nội bộ hỏng → `INTERNAL`/500.
 */
export async function goiChoViec(env: Env, yc: YeuCauChoViec): Promise<ViecCuaToiRa> {
  const res = await cuaGhiCua(env, yc.workspace_id).fetch('https://cua-ghi/cho-viec', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<ViecCuaToiRa>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}

/**
 * Gửi một lệnh **chờ dài** của `baton result T-x --wait` tới DO của workspace.
 * Cùng cách bóc lỗi với `goiChoViec`; `NOT_FOUND` của cửa tầm nhìn đi trong thân
 * rồi được dựng lại thành `BatonError`, nên route ở `index.ts` vẫn trả 404.
 */
export async function goiChoCanChu(
  env: Env,
  yc: YeuCauChoCanChu,
): Promise<KetQuaCanChuRa> {
  const res = await cuaGhiCua(env, yc.workspace_id).fetch('https://cua-ghi/cho-can-chu', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(yc),
  });
  if (!res.ok) {
    throw new BatonError('INTERNAL', { chiTiet: { trang_thai_cua_ghi: res.status } });
  }
  const than = await res.json<PhanHoiLenh<KetQuaCanChuRa>>();
  if (!than.ok) throw new BatonError(than.error, { message: than.message });
  return than.ket_qua;
}
