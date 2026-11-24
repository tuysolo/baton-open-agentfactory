/**
 * **Nội dung của mọi tin (SPEC mục 12), một chỗ duy nhất.**
 *
 * **CẬP NHẬT phần 7 lượt 1.** File này giờ dựng **chữ** của tin và **link** của
 * tin (d.347); việc *gửi* ở `nguon-telegram.ts` (kênh) + `cron-thong-bao.ts`
 * (luật thời điểm, thử lại, chống bắn lặp). Hàm `guiThongBao` của lượt trước
 * **đã bỏ** — xem `KENH_CHO_GUI` ở cuối file cho lý do: không còn đường nào gửi
 * ra ngoài từ bên trong cửa ghi.
 *
 * Lượt này chỉ cần đúng một chỗ: luật d.196 ("phiên chuyển sang `stalled` hoặc
 * `error` thì bắn **1** thông báo") đã quyết *có cần bắn hay không* (hàm thuần
 * `canhBaoDung`) và đã ghi mốc chống bắn lặp. Việc *gửi* là mục 12.
 *
 * **Kho thông báo trong app đã có** (bảng `thong_bao`, migration 0012) — 19.12 câu
 * 46: "Thông báo **ghi vào kho thông báo trong app**; **gửi Telegram thật là phần
 * 7**." Nên một tin cảnh báo đi hai chặng, và chỉ chặng đầu có thật ở lượt này:
 *   1. **vào kho** — một dòng `thong_bao`, ghi trong cùng lượt ghi với mốc chống
 *      bắn lặp (`WorkspaceGate.ghiMocCanhBao`);
 *   2. **ra kênh ngoài** — `guiThongBao`, chưa cài.
 *
 * **Lượt này KHÔNG gửi gì ra ngoài.** Mục 12 (Telegram) nằm trong phần 7, và
 * `CLAUDE.md` của thư mục có danh sách cấm: "**không gửi Telegram/email thật tới
 * ai** (test dùng giả lập)". Nên hàm dưới đây chỉ dựng **nội dung tin** và trả
 * `da_gui: false`; không có `fetch`, không có token, không có mạng.
 *
 * Phần 7 thay **thân** hàm này, không thay chữ ký: mọi chỗ cần bắn tin đã gọi
 * đúng một tên, nên không có đường thứ hai ra ngoài.
 */

import {
  LOAI_TIN_BAO_CAO,
  NHAN_CHUA_MERGE_7_NGAY,
  nhan,
  type TrangThaiPhien,
} from '@baton/shared';

/**
 * **Lý do cảnh báo → mã `loai` của kho thông báo** (bảng `thong_bao`, migration
 * 0012; SPEC mục 12 d.342, d.348).
 *
 * Hai mã, không một: xem ghi chú của cột `loai` trong 0012 — và d.348 ("Tắt từng
 * loại trong Cài đặt") lọc theo đúng cột này, nên chủ phải tắt được "agent im" mà
 * vẫn giữ "agent báo lỗi".
 */
export const LOAI_TIN_CANH_BAO = {
  stalled: 'phien_dung',
  error: 'phien_loi',
} as const satisfies Record<Extract<TrangThaiPhien, 'stalled' | 'error'>, string>;

export interface TinCanhBaoPhien {
  phien_id: string;
  ticket_id: string;
  agent_id: string;
  /** `stalled` hay `error` — SPEC mục 6 d.196. */
  ly_do: Extract<TrangThaiPhien, 'stalled' | 'error'>;
  /** Mã `thong_bao.loai` của tin này — xem `LOAI_TIN_CANH_BAO`. */
  loai: (typeof LOAI_TIN_CANH_BAO)[keyof typeof LOAI_TIN_CANH_BAO];
  /** Nhãn tiếng Việt của lý do (mục 0.1: thông báo hiển thị nhãn Việt). */
  nhan_ly_do: string;
  noi_dung: string;
  luc: number;
}

/** Nội dung tin cảnh báo, tiếng Việt — SPEC mục 0.1, mục 12. */
export function tinCanhBaoPhien(nguon: {
  phien_id: string;
  ticket_id: string;
  agent_id: string;
  ly_do: Extract<TrangThaiPhien, 'stalled' | 'error'>;
  luc: number;
  /** Tên hiển thị agent / mã ticket (`SAI-12`); thiếu thì rơi về id. */
  agent_ten?: string | null;
  ticket_ma?: string | null;
}): TinCanhBaoPhien {
  const { agent_ten, ticket_ma, ...goc } = nguon;
  const nhan_ly_do = nhan('trang_thai_phien', nguon.ly_do);
  return {
    ...goc,
    loai: LOAI_TIN_CANH_BAO[nguon.ly_do],
    nhan_ly_do,
    noi_dung: `${agent_ten ?? nguon.agent_id} · ${ticket_ma ?? nguon.ticket_id}: phiên ${nhan_ly_do.toLowerCase()}`,
  };
}

/* ------------------------------------------------------------------ *
 * "Chưa merge sau 7 ngày" — SPEC 19.7
 * ------------------------------------------------------------------ */

/**
 * Tin của 19.7: "Commit `pushed` quá 7 ngày chưa merge: dừng theo dõi. Bằng chứng
 * mang nhãn 'chưa merge sau 7 ngày'; hiện ở 'Cần chú ý'; **Telegram báo 1 lần**."
 *
 * "1 lần" là việc của mốc `chua_merge_bao_moc` (migration 0010 +
 * `quyetDinhBaoChuaMerge`), **không** của hàm này: hàm này chỉ dựng chữ, và nó được
 * gọi đúng khi mốc nói là cần bắn.
 */
export interface TinChuaMerge {
  bang_chung_id: string;
  ticket_id: string;
  commit_hash: string | null;
  repo: string | null;
  /** Nhãn của 19.7, đúng chữ SPEC. */
  nhan: string;
  noi_dung: string;
  luc: number;
}

export function tinChuaMergeSau7Ngay(nguon: {
  bang_chung_id: string;
  ticket_id: string;
  commit_hash: string | null;
  repo: string | null;
  luc: number;
  /** Mã ticket (`SAI-12`); thiếu thì rơi về id. */
  ticket_ma?: string | null;
}): TinChuaMerge {
  const { ticket_ma, ...goc } = nguon;
  const o = nguon.repo === null ? '' : ` trong repo ${nguon.repo}`;
  const h = nguon.commit_hash === null ? '(không rõ hash)' : nguon.commit_hash;
  return {
    ...goc,
    nhan: NHAN_CHUA_MERGE_7_NGAY,
    noi_dung: `Commit ${h}${o} của ticket ${ticket_ma ?? nguon.ticket_id}: ${NHAN_CHUA_MERGE_7_NGAY}. Baton đã dừng theo dõi; gửi lại cùng commit để theo dõi thêm 7 ngày (SPEC 19.7).`,
    luc: nguon.luc,
  };
}

/* ------------------------------------------------------------------ *
 * Hai chặng của một tin, sau phần 7
 * ------------------------------------------------------------------ */

/**
 * **Kênh của một tin VỪA VÀO KHO: nó đang đợi cron gửi.**
 *
 * Phần 7 đổi hình của chặng hai: thay vì "một lần gửi ngay tại chỗ ghi" (hướng mà
 * `guiThongBao` của lượt trước gợi ra), việc gửi là **một lượt quét riêng** ở
 * `cron-thong-bao.ts`, đi theo mốc `thong_bao.gui_telegram_luc`. Ba lý do, và cả
 * ba là lý do kiến trúc chứ không gọn gàng:
 *
 *   1. **Chặng gọi mạng không được nằm trong cửa ghi.** Một `fetch` tới Telegram
 *      trong `WorkspaceGate` giữ hàng đợi ghi của cả workspace suốt thời gian chờ
 *      mạng — cùng ràng buộc mà `cron-bang-chung.ts` đã khai cho GitHub.
 *   2. **Giờ yên lặng và luật gộp 15 phút là luật về THỜI ĐIỂM** (d.345, d.347):
 *      một tin sinh lúc 02:00 phải đi lúc 07:00. Không có chỗ nào trong một lệnh
 *      ghi để "gửi 5 giờ nữa"; chỉ một mốc + cron làm được.
 *   3. **Thử lại 3 lần giãn 10 giây / 60 giây / 5 phút** (19.12 câu 6) — cùng lý
 *      do: mốc, không `setTimeout`.
 *
 * Nên **mọi** chỗ ghi tin chỉ làm đúng một việc: đặt một dòng vào kho. Kênh ra
 * ngoài của nó, tại thời điểm đó, là "đang đợi cron" — và đó là thứ hằng này nói.
 * Không còn hàm `guiThongBao` nào gọi được từ trong cửa ghi; đó là **có chủ ý**,
 * để không có đường thứ hai ra ngoài.
 */
export const KENH_CHO_GUI = 'cho_cron';

/* ------------------------------------------------------------------ *
 * Tin của mục Cần Chủ 🔴 — SPEC mục 8 d.283, mục 12 d.341
 * ------------------------------------------------------------------ */

/**
 * `thong_bao.loai` của cả hai tin 🔴 (mục mới và lời nhắc) — 0012.
 *
 * Tin **bảo mật tài khoản** (0026) cũng mang mã này — mượn, không phải mục 🔴
 * (BAT-17, xem `su-kien-bao-mat.ts`). Dòng có `bao_mat` khác `null` không được
 * đọc như một tin Cần Chủ.
 */
export const LOAI_TIN_CAN_CHU_DO = 'can_chu_do';

/**
 * Nội dung tin **"🔴 mới"** — mục 8 d.283 ("mục 🔴 mới thì bắn ngay"), mục 12
 * d.341.
 *
 * Mang `T-số` trong chữ: mục 13 gọi mục bằng `T-số` ở mọi lệnh, nên một tin nói
 * "T-18" là một tin chủ trả lời được ngay bằng `baton result T-18` mà không phải
 * mở trang nào.
 */
export function tinCanChuDoMoi(nguon: { ma: string; tieu_de: string }): string {
  return `🔴 Cần Chủ mới — ${nguon.ma}: ${nguon.tieu_de}`;
}

/**
 * Nội dung **lời nhắc** "🔴 chưa xử lý sau 2 giờ" — mục 8 d.283, mục 12 d.341.
 *
 * Chữ khác hẳn tin "🔴 mới", có chủ ý: hai tin cùng `loai` và cùng mục, nên nếu
 * chúng nói giống nhau thì chủ thấy một tin lặp trong chuông và không biết mục đã
 * chờ bao lâu. Con số giờ tính ở **server** (cùng nếp `gioQuaHan` của mục 8), làm
 * tròn **lên**, nên một mục chờ 2 giờ 1 phút nói "3 giờ" chứ không nói "2".
 */
export function tinNhacCanChuDo(nguon: {
  ma: string;
  tieu_de: string;
  tao_luc: number;
  luc: number;
}): string {
  const gio = Math.max(1, Math.ceil((nguon.luc - nguon.tao_luc) / 3_600_000));
  return `🔴 Vẫn chờ Chủ sau ${String(gio)} giờ — ${nguon.ma}: ${nguon.tieu_de}`;
}

/* ------------------------------------------------------------------ *
 * Link của một tin — SPEC mục 12 d.347
 * ------------------------------------------------------------------ */

/** Các khoá của một dòng `thong_bao` mà link đọc tới. */
export interface KhoaTinDeDungLink {
  /**
   * `thong_bao.loai` (0012). Cần ở đây vì **tin báo cáo không có khoá nào**: một
   * báo cáo sáng không gắn vào một ticket, một phiên hay một mục Cần Chủ — nó gắn
   * vào **một ngày**. Nên `loai` là thứ duy nhất dựng được link của nó.
   */
  loai: string;
  can_chu_id: string | null;
  /** Mã ticket dạng `SAI-12` (đã ghép ở câu đọc), `null` nếu tin không về ticket. */
  ticket_ma: string | null;
  phien_id: string | null;
  /**
   * `thong_bao.bao_mat` (0026, BAT-16). Tin bảo mật không gắn khoá nào; link của
   * nó là trang **Cài đặt** — nơi có danh sách phiên, "Đăng xuất mọi nơi" và đổi
   * mật khẩu, tức đúng chỗ chủ cần tới sau câu "Nếu không phải anh làm…".
   */
  bao_mat?: string | null;
}

/**
 * **"Mỗi tin có link thẳng tới đúng thẻ hoặc ticket"** — mục 12 d.347.
 *
 * `goc` là `Env.BATON_URL_CONG_KHAI`; **thiếu nó ⇒ `null`**, và tin vẫn gửi (xem
 * ghi chú của binding đó). Một tin không link vẫn báo được việc gấp.
 *
 * Thứ tự ưu tiên là thứ tự **cụ thể dần**, vì một tin có thể mang nhiều khoá (lời
 * nhắc 🔴 của một mục nối vào một ticket có cả hai): mục Cần Chủ → ticket → phiên.
 * Mục Cần Chủ đi trước vì tin 🔴 tồn tại để chủ **quyết một mục**, không để chủ
 * đọc một ticket.
 *
 * **Giới hạn khai thẳng:** đường của một **thẻ** Cần Chủ cụ thể chưa có trong
 * phần 6 (`/can-chu` là cả màn hình; thẻ chỉ có `data-the="T-x"`, không id DOM),
 * nên link của tin 🔴 trỏ tới màn hình Cần Chủ, không tới đúng thẻ. Đó là một nửa
 * của `cau-hoi-spec.md` **#116**.
 */
export function linkCuaTin(khoa: KhoaTinDeDungLink, goc: string | undefined): string | null {
  const g = (goc ?? '').trim().replace(/\/+$/, '');
  if (g.length === 0) return null;
  /*
   * **Tin báo cáo đi trước mọi khoá** (mục 11 d.322 "xem trên web", d.336 "xem lại
   * được"): một báo cáo không có khoá nào để trỏ tới, nên nếu không xét `loai`
   * trước thì link của nó rơi về gốc `g` — tức chủ bấm vào và ra trang Tổng quan,
   * không ra báo cáo vừa được báo. Đường `/bao-cao` là mục sidebar của d.392
   * (`cau-hoi-spec.md` #101).
   */
  if ((khoa.bao_mat ?? null) !== null) return `${g}/cai-dat`;
  if (Object.values(LOAI_TIN_BAO_CAO).includes(khoa.loai)) return `${g}/bao-cao`;
  if (khoa.can_chu_id !== null) return `${g}/can-chu`;
  if (khoa.ticket_ma !== null) return `${g}/t/${encodeURIComponent(khoa.ticket_ma)}`;
  if (khoa.phien_id !== null) return `${g}/phien/${encodeURIComponent(khoa.phien_id)}`;
  return g;
}
