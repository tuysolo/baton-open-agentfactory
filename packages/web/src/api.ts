/**
 * Một cửa duy nhất để giao diện gọi `/v1/*` — SPEC mục 13.
 *
 * ## Vì sao không dùng `@baton/client`
 *
 * `packages/client` là client HTTP của **CLI**: nó mang token agent trong
 * `Authorization: Bearer`, đọc `BATON_URL` / `BATON_TOKEN` từ biến môi trường, và
 * chạy trên `node`. Giao diện chủ thì **không có token nào** — nó mang cookie
 * `HttpOnly` của phiên (mục 15 d.415), và JavaScript của trang **không đọc được**
 * cookie đó, nên không có gì để chuyển cho một client kiểu Bearer. Dùng lại nó ở
 * đây sẽ là mượn một đường xác thực sai.
 *
 * ## Hai điều file này giữ
 *
 * 1. **Đường tương đối.** Không một `BASE_URL` nào: SPA được chính Worker phục vụ
 *    (`[assets]` trong `wrangler.toml`), nên `/v1/...` là cùng gốc. Cùng gốc là
 *    điều kiện để cookie `SameSite=Lax` được gửi.
 * 2. **Lỗi của máy chủ đi nguyên văn ra màn hình.** SPEC mục 13 d.379 bắt mọi lỗi
 *    trả `{ error, message }` với `message` **tiếng Việt**. Nên giao diện
 *    **không** tự dịch mã lỗi thành câu — chép bảng câu lần thứ hai là cách chắc
 *    chắn nhất để web và CLI nói hai thứ khác nhau về cùng một lỗi.
 */

/** Lỗi nghiệp vụ của máy chủ: mã máy + câu tiếng Việt của chính máy chủ. */
export class LoiApi extends Error {
  readonly ma: string;
  readonly http: number;

  constructor(ma: string, message: string, http: number) {
    super(message);
    this.name = 'LoiApi';
    this.ma = ma;
    this.http = http;
  }
}

export interface TuyChonGoi {
  // `PUT` chỉ có một chỗ dùng: `PUT /v1/luat-chung` (mục 9 d.301) — trang Luật
  // chung là **một** tài nguyên duy nhất của workspace, không một danh sách.
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  than?: unknown;
  /**
   * Hạn chờ riêng (ms) — BAT-35. Vắng ⇒ `HAN_CHO_API_MS`. Đường nào máy chủ được
   * phép giữ lâu (long-poll, chờ có chủ ý) phải đặt hạn **dài hơn** mức chờ của
   * máy chủ; hôm nay web không có đường nào như thế.
   */
  hanChoMs?: number;
}

/**
 * **Hạn chờ của mọi lượt gọi** (BAT-35). Không có hạn thì một máy chủ treo (không
 * trả, không đóng kết nối) giữ hộp "Đang gửi…" mãi mãi: khoá `useMotLan` không
 * nhả, Esc/Huỷ không dùng được, và chủ không có cách nào ngoài tải lại trang.
 *
 * 20 giây: mọi đường `/v1/*` của web là một lần đọc/ghi D1 cỡ mili-giây (Worker có
 * trần CPU riêng), nên 20 giây là gấp hàng trăm lần thời gian bình thường — chỉ
 * kích khi mạng/máy chủ thật sự hỏng, không cắt một lượt chậm hợp lệ.
 */
export const HAN_CHO_API_MS = 20_000;

/**
 * Hạn chờ của hai đường **tải file** (`/v1/xuat`, `/v1/sao-luu/<ngày>`): thân là
 * toàn bộ dữ liệu workspace, đi qua mạng của chủ — có thể vài chục MB trên 3G. 5
 * phút: đủ cho một bản lớn trên mạng chậm, vẫn có điểm dừng.
 */
export const HAN_CHO_TAI_FILE_MS = 300_000;

/** Mã máy của lỗi hết hạn chờ — **không** phải mã của máy chủ (`http` = 0). */
export const MA_HET_HAN_CHO = 'HET_HAN_CHO';

function docThoiLuong(ms: number): string {
  return ms >= 60_000 && ms % 60_000 === 0
    ? `${String(ms / 60_000)} phút`
    : `${String(Math.round(ms / 1000))} giây`;
}

/**
 * Câu của lỗi hết hạn. Lệnh **ghi** (POST/PATCH/PUT) nói thêm điều quan trọng
 * nhất: request có thể **đã tới** máy chủ và đã được làm — thử lại mù là có thể
 * làm hai lần. Nên câu bảo tải lại để kiểm trước. Web không tự thử lại lệnh ghi
 * (mutation của TanStack `retry` mặc định 0, `src/query.ts` không đổi nó).
 */
export function cauHetHanCho(ms: number, method: string): string {
  const dau = `Máy chủ không trả lời sau ${docThoiLuong(ms)}.`;
  return method === 'GET'
    ? `${dau} Kiểm tra mạng rồi thử lại.`
    : `${dau} Thao tác có thể đã tới máy chủ — tải lại để kiểm trước khi thử lại.`;
}

/**
 * Chạy `lam` (fetch **và** đọc thân) với hạn chờ `ms`. Hết hạn ⇒ `abort()` (trình
 * duyệt cắt kết nối) **và** ném `LoiApi(HET_HAN_CHO, …, 0)` ngay — không trông
 * vào việc `fetch` tôn trọng `signal` (một `fetch` không tôn trọng vẫn không treo
 * được lời gọi). Hẹn giờ luôn được dọn trong `finally`, cả khi thành công.
 *
 * `setTimeout`, không `AbortSignal.timeout`: test đo được bằng fake timers.
 */
async function voiHanCho<T>(
  ms: number,
  method: string,
  lam: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ac = new AbortController();
  let hen: ReturnType<typeof setTimeout> | undefined;
  const het = new Promise<never>((_, tuChoi) => {
    hen = setTimeout(() => {
      ac.abort();
      tuChoi(new LoiApi(MA_HET_HAN_CHO, cauHetHanCho(ms, method), 0));
    }, ms);
  });
  try {
    return await Promise.race([lam(ac.signal), het]);
  } finally {
    clearTimeout(hen);
  }
}

/**
 * Câu dự phòng khi máy chủ **không** trả được thân `{ error, message }` — ví dụ
 * một 502 của hạ tầng, hay mạng đứt. Đây là chỗ duy nhất giao diện tự viết câu
 * lỗi, và nó nói đúng điều biết được: không nhận được câu trả lời hiểu được.
 */
export const CAU_LOI_KHONG_RO = 'Không gọi được máy chủ. Thử lại sau.';

/**
 * Câu hiện cho chủ: của máy chủ nếu có, còn lại là câu dự phòng duy nhất.
 *
 * Nằm ở tầng chung này, cạnh `LoiApi` và `CAU_LOI_KHONG_RO`, vì trang **và** vỏ
 * đều dùng (trang đăng nhập, `/cai-dat`, hộp xác nhận đăng xuất) — vỏ không nhập
 * từ một trang.
 */
export function cauLoi(loi: unknown): string {
  return loi instanceof LoiApi ? loi.message : CAU_LOI_KHONG_RO;
}

export async function goiApi<T>(duong: string, tc: TuyChonGoi = {}): Promise<T> {
  const method = tc.method ?? 'GET';
  const init: RequestInit = {
    method,
    // Cookie phiên là `HttpOnly`; `same-origin` để nó được gửi kèm.
    credentials: 'same-origin',
    headers: tc.than === undefined ? {} : { 'content-type': 'application/json' },
  };
  if (tc.than !== undefined) init.body = JSON.stringify(tc.than);

  // Hạn chờ phủ cả lúc đọc thân: máy chủ gửi đầu rồi treo giữa thân cũng là treo.
  const { r, van } = await voiHanCho(tc.hanChoMs ?? HAN_CHO_API_MS, method, async (signal) => {
    const r = await fetch(duong, { ...init, signal });
    return { r, van: await r.text() };
  });
  const than: unknown = van === '' ? null : docJson(van);

  if (!r.ok) {
    const loi = than as { error?: unknown; message?: unknown } | null;
    const ma = typeof loi?.error === 'string' ? loi.error : 'INTERNAL';
    const cau = typeof loi?.message === 'string' ? loi.message : CAU_LOI_KHONG_RO;
    throw new LoiApi(ma, cau, r.status);
  }
  return than as T;
}

function docJson(van: string): unknown {
  try {
    return JSON.parse(van);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Hình của những thân mà lượt này đọc
 * ------------------------------------------------------------------ */

/** `GET /v1/toi` — xem `packages/api/src/index.ts`. */
export interface Toi {
  loai: 'chu';
  workspace_id: string;
  phien_het_luc: number | null;
}

/** Một dự án trong `GET /v1/du-an` (phần dùng ở sidebar). */
export interface DuAnSidebar {
  id: string;
  ma: string;
  ten: string;
  trang_thai: 'active' | 'paused' | 'archived';
  nhom: string | null;
  /**
   * Chỉ báo sức sống của mục 2 d.71–74 — **máy chủ tính**, không giao diện.
   *
   * `GET /v1/du-an` trả trường này từ lượt 3 (`doc-suc-song.ts` ở tầng API, luật
   * ở hàm thuần `sucSongDuAn`): nó cần trạng thái phiên đã dẫn xuất của mọi
   * ticket Đang làm, tức một luật nghiệp vụ có ngưỡng đứng, nên nó không được
   * sống trong component.
   *
   * **Vẫn tuỳ chọn, và đó là chủ ý**: một phản hồi thiếu trường (bản API cũ, một
   * proxy cắt bớt) phải vẽ ra trạng thái "chưa tính" chứ không được rơi về ⚪ —
   * nói "Dự án không chạy" khi chưa ai tính là nói sai với chủ. Xem
   * `ChamSucSong`; cả hai vế có ca test.
   */
  suc_song?: SucSong;
}

/** Ba giá trị của mục 2 d.71–74 — mã máy của máy chủ (`@baton/shared`). */
export type SucSong = 'xanh' | 'vang' | 'trang';

export interface HuyHieuCanChu {
  so_cho: number;
  muc_cao_nhat: 'urgent' | 'today' | 'later' | null;
  so_theo_muc: { urgent: number; today: number; later: number };
}

/* ------------------------------------------------------------------ *
 * Màn hình Cần Chủ — SPEC mục 8 d.248–252
 * ------------------------------------------------------------------ *
 * Hình thân gõ lại theo `packages/api/src/doc-can-chu.ts` (`TheCanChu`,
 * `KhoiCanChu`, `DongDaXuLy`), cùng lý lẽ với khối `TongQuan` ở dưới: giao diện
 * không nhập kiểu từ `@baton/shared`, nhưng **mọi tên trường khớp từng chữ**.
 *
 * **Không một dẫn xuất nào được tính lại ở đây.** `qua_han`, `qua_han_gio`
 * ("quá hạn X giờ" của d.249), thứ tự trong khối (hạn rồi lúc tạo),
 * `tieu_de_ngan` và `ngay` của bảng Đã xử lý, `muc_cao_nhat` của huy hiệu — tất
 * cả tới **đã tính** từ máy chủ. Hai bản tính là hai luật, và chúng lệch nhau ở
 * đúng chỗ khó thấy nhất (làm tròn, múi giờ).
 */

export type MucDoKhan = 'urgent' | 'today' | 'later';
export type LoaiCanChu = 'decision' | 'run_command' | 'review' | 'fyi';
export type TrangThaiCanChu = 'open' | 'resolved' | 'skipped';
export type KetLuanReviewMuc = 'dat' | 'can_sua';

/** Một phương án trên thẻ — d.250 ("phương án thành nút"). */
export interface PhuongAnThe {
  id: string;
  /** Nhãn A, B, C… — d.236. */
  nhan: string;
  noi_dung: string;
  thu_tu: number;
  /** d.250: phương án đề xuất có nhãn "Đề xuất". */
  de_xuat: boolean;
}

/** Một file hoặc link của mục `review` — d.238, d.250. */
export interface FileThe {
  loai: 'file' | 'link';
  dia_chi: string;
  thu_tu: number;
}

export interface TicketThe {
  id: string;
  ma: string;
  tieu_de: string;
}

export interface DuAnThe {
  id: string;
  ten: string;
  ma: string;
}

/** Một thẻ của d.250 — mọi vế của câu đó. */
export interface TheCanChu {
  id: string;
  ma: string;
  trang_thai: TrangThaiCanChu;
  da_xu_ly: boolean;
  muc: MucDoKhan;
  loai: LoaiCanChu;
  project_id: string | null;
  tieu_de: string;
  /** Markdown — d.240. Xem `src/markdown.tsx`; **không** `innerHTML`. */
  boi_canh: string | null;
  /**
   * Lệnh của thẻ — **mọi loại** có thể có (d.250 "lệnh có nút Copy", viết chung
   * cho mọi thẻ; `cau-hoi-spec.md` #130). `null` = thẻ không mang lệnh nào.
   */
  lenh: string | null;
  /** d.237: agent đánh dấu cần TTY ⇒ ghi chú "chạy ở terminal thật". */
  can_tty: boolean;
  han_luc: number | null;
  tao_luc: number;
  tao_boi_agent_id: string | null;
  ket_qua: string | null;
  phuong_an_da_chon: { id: string; nhan: string; noi_dung: string } | null;
  ket_luan_review: KetLuanReviewMuc | null;
  ly_do_bo_qua: string | null;
  xu_ly_luc: number | null;
  mo_lai_lan: number;
  du_an: DuAnThe | null;
  /** 19.8 — **máy chủ tính**. */
  qua_han: boolean;
  /** Số giờ của "quá hạn X giờ" (d.249); `null` khi chưa quá hạn. */
  qua_han_gio: number | null;
  phuong_an: PhuongAnThe[];
  phuong_an_de_xuat_id: string | null;
  file: FileThe[];
  ticket_lien_quan: TicketThe[];
}

export interface KhoiCanChu {
  muc: MucDoKhan;
  items: TheCanChu[];
  cursor_sau: string | null;
}

/**
 * Thân `GET /v1/can-chu` — huy hiệu (d.248) **và** ba khối (d.249) trong một
 * lượt gọi.
 *
 * Sidebar chỉ cần nửa đầu, nên nó đọc qua `HuyHieuRa` (hình **hẹp hơn**, cùng
 * một đường): một kiểu rộng với `khoi` **tuỳ chọn** sẽ buộc trang Cần Chủ viết
 * một nhánh `khoi === undefined` cho một ca máy chủ không bao giờ trả — và nhánh
 * đó là chỗ một màn hình rỗng trông như "không có mục nào".
 */
export interface HuyHieuRa {
  huy_hieu: HuyHieuCanChu;
}

export interface ManHinhCanChu extends HuyHieuRa {
  /** **Đúng ba** khối, đúng thứ tự 🔴 → 🟡 → ⚪ của d.249. */
  khoi: KhoiCanChu[];
  /**
   * Mốc "bây giờ" **của máy chủ**, mili-giây — mốc để tính chữ tương đối của
   * d.412 ("trong 2 giờ"). Cùng đồng hồ đã tính `qua_han` / `qua_han_gio` của
   * từng thẻ, nên hai chữ không thể nói trái nhau như khi đếm từ `Date.now()`
   * của trình duyệt.
   */
  bay_gio: number;
}

/** Một dòng của bảng "Đã xử lý" — d.251. */
export interface DongDaXuLy {
  id: string;
  ma: string;
  /** Ngày **trên tường** `YYYY-MM-DD` — máy chủ đổi, không giao diện. */
  ngay: string;
  xu_ly_luc: number;
  tieu_de: string;
  tieu_de_ngan: string;
  ket_qua: string;
  trang_thai: TrangThaiCanChu;
  loai: LoaiCanChu;
  project_id: string | null;
  ket_luan_review: KetLuanReviewMuc | null;
}

/**
 * Thân `GET /v1/can-chu/da-xu-ly` — một trang của bảng d.251 kèm **mốc máy chủ**.
 *
 * Bảng này ở **cùng** màn hình Cần Chủ, nên d.412 áp cho ô thời gian của nó y như
 * cho hạn trên thẻ: chữ tương đối phải đếm từ `bay_gio` của máy chủ, không từ
 * `Date.now()` của trình duyệt. Cùng tên trường với `ManHinhCanChu.bay_gio`.
 */
export interface BangDaXuLyRa extends TrangKetQua<DongDaXuLy> {
  bay_gio: number;
}

/**
 * **Bộ lọc của màn hình** — d.252 (dự án, loại) và d.251 (khoảng ngày).
 *
 * Tên khoá là tên **tham số truy vấn của máy chủ** (`project_id`, `loai`,
 * `tu_ngay`, `den_ngay`), không một tên thứ hai: một bảng dịch tên ở giữa là một
 * chỗ nữa để lệch. Giá trị rỗng/`undefined` **không** được gửi, vì máy chủ coi
 * `loai=''` là "không lọc" và một chuỗi lạ là `INVALID_INPUT`.
 */
export interface LocCanChu {
  project_id?: string | undefined;
  loai?: string | undefined;
  tu_ngay?: string | undefined;
  den_ngay?: string | undefined;
}

export function chuoiTruyVan(loc: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(loc)) {
    if (v !== undefined && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

export const layManHinhCanChu = (loc: LocCanChu = {}): Promise<ManHinhCanChu> =>
  goiApi<ManHinhCanChu>(
    `/v1/can-chu${chuoiTruyVan({ project_id: loc.project_id, loai: loc.loai })}`,
  );

export const layDaXuLy = (loc: LocCanChu = {}): Promise<BangDaXuLyRa> =>
  goiApi<BangDaXuLyRa>(
    `/v1/can-chu/da-xu-ly${chuoiTruyVan({
      project_id: loc.project_id,
      loai: loc.loai,
      tu_ngay: loc.tu_ngay,
      den_ngay: loc.den_ngay,
    })}`,
  );

/**
 * **Thân của `POST /v1/can-chu/:id/xu-ly`** — đúng tên trường mà
 * `LenhXuLyCanChu` nhận (`phuong_an` là **nhãn** A–E, không id phương án).
 *
 * Không có trường nào cho `trang_thai`, `ket_qua` thô hay `xu_ly_luc`: cả ba là
 * **kết luận của máy chủ** (xem ghi chú ở `lenh-xu-ly-can-chu.ts`), nên giao
 * diện không có cách nào đặt chúng — kể cả vô tình.
 */
export interface ThanXuLyMuc {
  phuong_an?: string | undefined;
  ghi_them?: string | undefined;
  ket_luan?: KetLuanReviewMuc | undefined;
}

export const xuLyMuc = (id: string, than: ThanXuLyMuc): Promise<unknown> =>
  goiApi<unknown>(`/v1/can-chu/${encodeURIComponent(id)}/xu-ly`, { method: 'POST', than });

export const boQuaMuc = (id: string, ly_do: string): Promise<unknown> =>
  goiApi<unknown>(`/v1/can-chu/${encodeURIComponent(id)}/bo-qua`, {
    method: 'POST',
    than: { ly_do },
  });

export const layToi = (): Promise<Toi> => goiApi<Toi>('/v1/toi');

/** Hình phân trang keyset của `TrangKetQua<T>` (`packages/shared/src/kieu.ts`). */
export interface TrangKetQua<T> {
  items: T[];
  cursor_sau: string | null;
}

/**
 * Cỡ trang mỗi lượt gọi `GET /v1/du-an` của `layDuAn` — bằng
 * `LIMIT_TRANG_TOI_DA` của `packages/shared/src/kieu.ts` (máy chủ kẹp mọi
 * `limit` lớn hơn về đúng số này ở `kiemLimit`). Gõ lại, không nhập: giao diện
 * không kéo `@baton/shared` (xem ghi chú khối `TongQuan` dưới).
 */
export const LIMIT_TRANG_DU_AN = 200;

/**
 * **Trần số trang** của một lần `layDuAn` — chốt chặn vòng lặp, không phải trần
 * nghiệp vụ. 100 trang × 200 = 20.000 dự án: gấp 40 lần mốc 500 dự án của BAT-72,
 * nên một workspace thật không chạm tới; chạm tới thì gần như chắc là máy chủ trả
 * `cursor_sau` hỏng (không bao giờ về `null`), và đi tiếp là treo trình duyệt.
 */
export const TRAN_SO_TRANG_DU_AN = 100;

/**
 * Mã máy của lỗi "phân trang hỏng" (cursor lặp lại / vượt `TRAN_SO_TRANG_DU_AN`)
 * — **không** phải mã của máy chủ (`http` = 0), cùng nếp `MA_HET_HAN_CHO`. Câu
 * hiện cho chủ là `CAU_LOI_KHONG_RO`: không đặt chữ mới.
 */
export const MA_PHAN_TRANG_HONG = 'PHAN_TRANG_HONG';

/**
 * **Mọi** dự án (mặc định máy chủ: ẩn dự án lưu trữ) — đi hết các trang theo
 * `cursor_sau` tới `null`, gộp `items` theo đúng thứ tự máy chủ trả (BAT-73).
 *
 * Trước BAT-73 hàm này gọi một trang không `limit` ⇒ chỉ 50 dự án đầu
 * (`LIMIT_TRANG_MAC_DINH`): dự án thứ 51 trở đi vắng khỏi sidebar, hộp Tạo việc,
 * bộ lọc — và `/du-an/<MÃ>` của nó rơi vào nhánh "không tìm thấy dự án" của
 * `danh-sach-ticket.tsx` dù dự án có thật.
 *
 * Trả cùng hình `TrangKetQua` với `cursor_sau: null` để mọi nơi dùng (cùng
 * `queryKey` `['du-an']`) không phải đổi.
 *
 * **Lỗi ở bất kỳ trang nào ⇒ ném**, không trả phần đã gom: một danh sách thiếu
 * mà trông như đủ là đúng cái lỗi của nhánh "không tìm thấy dự án" ở trên, chỉ
 * khác chỗ. Ném thì react-query giữ nguyên `data` đầy đủ của lần trước (một lần
 * lấy lại lỗi không xoá cache), còn lần tải đầu thì `data` vẫn `undefined` — mọi
 * nơi dùng đều đã coi `undefined` là "chưa có" (`?? []`, nhánh `!== undefined`).
 */
export async function layDuAn(): Promise<TrangKetQua<DuAnSidebar>> {
  const items: DuAnSidebar[] = [];
  const da_thay = new Set<string>();
  let cursor: string | undefined;
  for (let so_trang = 1; ; so_trang += 1) {
    if (so_trang > TRAN_SO_TRANG_DU_AN) {
      throw new LoiApi(MA_PHAN_TRANG_HONG, CAU_LOI_KHONG_RO, 0);
    }
    const trang = await goiApi<Partial<TrangKetQua<DuAnSidebar>> | null>(
      `/v1/du-an${chuoiTruyVan({ limit: String(LIMIT_TRANG_DU_AN), cursor })}`,
    );
    items.push(...(trang?.items ?? []));
    const sau = trang?.cursor_sau;
    // Hết trang: `null`, vắng, hay bất cứ thứ gì không phải chuỗi khác rỗng.
    if (typeof sau !== 'string' || sau === '') return { items, cursor_sau: null };
    // Cursor đã gặp ⇒ máy chủ đang quay vòng; đi tiếp là lặp vô hạn.
    if (da_thay.has(sau)) throw new LoiApi(MA_PHAN_TRANG_HONG, CAU_LOI_KHONG_RO, 0);
    da_thay.add(sau);
    cursor = sau;
  }
}

/* ------------------------------------------------------------------ *
 * `GET /v1/tong-quan` — SPEC mục 11 d.315–320
 * ------------------------------------------------------------------ *
 * Hình thân gõ lại ở đây theo `packages/api/src/doc-tong-quan.ts`. Không nhập
 * kiểu từ `@baton/shared`: giao diện chạy trong trình duyệt và `shared` kéo theo
 * cả module thời gian/mật khẩu của máy chủ — nhưng mọi tên trường phải khớp từng
 * chữ, và ca test của `tong-quan.tsx` dựng thân bằng đúng hình này.
 */

/** Một ticket được Tổng quan trỏ tới — đủ để vẽ link `/t/<MÃ>` (d.398). */
export interface TicketTroTa {
  id: string;
  ma: string;
  tieu_de: string;
  project_id: string;
  trang_thai: string;
  nhan_trang_thai: string;
}

export interface MucGapNhat {
  id: string;
  ma: string;
  muc: 'urgent' | 'today' | 'later';
  nhan_muc: string;
  loai: string;
  tieu_de: string;
  project_id: string | null;
  han_luc: number | null;
  qua_han: boolean;
  tao_luc: number;
}

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
  /** "số … Cần làm" của d.317 — mã `todo`. */
  so_can_lam: number;
  /** Tử số của thanh tiến độ d.317 — **máy chủ** đếm. */
  so_xong: number;
  /** Mẫu số của thanh tiến độ d.317. */
  so_tong: number;
  so_xong_24h: number;
  /** "việc đang làm **nổi bật nhất**" của d.317 — máy chủ chọn, trang chỉ vẽ. */
  viec_noi_bat: TicketTroTa | null;

  /* ---- Bản đồ dự án — SPEC 20.1–20.4 (máy chủ tính, trang chỉ vẽ) ---- */

  /** Ưu tiên 1–5 (5 = quan trọng nhất) — cỡ bong bóng. */
  uu_tien: number;
  dang_day: boolean;
  duy_tri: boolean;
  /** `null` ⇒ dùng `ten`. */
  ten_ngan: string | null;
  /** Tên agent quản lý; `null` ⇒ thẻ hiện tên chủ (20.4). */
  quan_ly_ten: string | null;
  /** Khối lớn đã sắp theo `khoi_lon` rồi mã; không có Huỷ/Trùng. */
  khoi_lon: KhoiLon[];
  khoi_xong: number;
  khoi_tong: number;
  /** "Mốc tới" — khối số nhỏ nhất chưa Xong. */
  moc_toi: KhoiLon | null;
  co_can_chu_cho: boolean;
  can_chu_cho_moi_nhat: { id: string; ma: string; tieu_de: string } | null;
  /** "Đặt bởi <tên> · <thời gian>" (20.8); `null` = chưa ai đổi. */
  dat_boi: DatBoi | null;
}

/** "Đặt bởi" của thanh công cụ dự án — SPEC 20.8 (hình `DatBoi` của `@baton/shared`). */
export interface DatBoi {
  loai: 'chu' | 'agent';
  ten: string;
  luc: number;
}

/** Bốn giá trị ô "Trạng thái bản đồ" — SPEC 20.8. */
export type TrangThaiBanDo = 'dang_day' | 'hang_cho' | 'tam_dung' | 'duy_tri';

/** Thân `PATCH /v1/du-an/:id` mà thanh công cụ (20.8) gửi. */
export interface ThanSuaDuAn {
  uu_tien?: number;
  trang_thai_ban_do?: TrangThaiBanDo;
  nhom?: string | null;
}

export interface KetQuaSuaDuAn {
  id: string;
  da_doi: string[];
  wip?: { dang_day: number; gioi_han: number; vuot: boolean };
}

/** `GET /v1/du-an/:id` — phần mà thanh công cụ ở đầu bảng việc (20.8) dùng. */
export interface DuAnChiTiet {
  id: string;
  ma: string;
  ten: string;
  trang_thai: string;
  nhan_trang_thai: string;
  uu_tien: number;
  dang_day: boolean;
  duy_tri: boolean;
  nhom: string | null;
  dat_boi: DatBoi | null;
  bay_gio: number;
}

export const layDuAnChiTiet = (project_id: string): Promise<DuAnChiTiet> =>
  goiApi<DuAnChiTiet>(`/v1/du-an/${encodeURIComponent(project_id)}`);

export const suaDuAn = (project_id: string, than: ThanSuaDuAn): Promise<KetQuaSuaDuAn> =>
  goiApi<KetQuaSuaDuAn>(`/v1/du-an/${encodeURIComponent(project_id)}`, { method: 'PATCH', than });

/** Một khối việc lớn (ticket có `khoi_lon`) — SPEC 20.1. */
export interface KhoiLon {
  id: string;
  ma: string;
  tieu_de: string;
  khoi_lon: number;
  trang_thai: string;
  nhan_trang_thai: string;
  /** Vị trí trên đồi 0–100; `null` ⇒ không vẽ chấm (20.4). */
  doi: number | null;
}

/** Một mục của danh sách mở ra trong ô Cần Chủ — SPEC 20.5. */
export interface MucCanChuO extends MucGapNhat {
  du_an_dang_day: boolean;
}

/**
 * Một thẻ của khối "Việc đang chạy" (d.318).
 *
 * `the` là **đúng** `TicketDong` của bảng việc, nên trang vẽ nó bằng **cùng**
 * component thẻ việc kiểu Linear — xem `NoiDungThe` ở `trang/danh-sach-ticket.tsx`.
 */
export interface TheViecDangChay {
  the: TicketDong;
  /** **Tên** agent đang cầm (d.404: không bao giờ id). `null` = chủ hoặc trống. */
  nguoi_cam_ten: string | null;
  /** Mốc bắt đầu cầm — "đã cầm bao lâu" đếm từ `bay_gio` của thân (d.412). */
  cam_tu_luc: number | null;
}

/**
 * **Năm mã trạng thái agent** của mục 3 d.100–105 — union, không `string`.
 *
 * Máy chủ đã là union (`TrangThaiAgent` của `@baton/shared`); để `string` ở đây
 * là bỏ lưới kiểu ở đúng chỗ dễ trôi nhất — một lượt sau so `=== 'dang_lam'`
 * (mã tiếng Việt không có trong bảng 0.1) sẽ biên dịch sạch và chỉ sai lúc chạy.
 */
export type TrangThaiAgent = 'busy' | 'waiting_owner' | 'stalled' | 'idle' | 'disabled';

export interface TheAgent {
  id: string;
  ten: string;
  vai_tro: string;
  nhan_vai_tro: string;
  trang_thai: TrangThaiAgent;
  nhan_trang_thai: string;
  ticket_dang_cam: TicketTroTa[];
  tin_hieu_cuoi_luc: number | null;
}

export type LoaiCanChuY =
  | 'phien_dung_hoac_loi'
  | 'luot_giao_khong_phan_hoi'
  | 'ticket_khong_ai_cam'
  | 'bang_chung_truot'
  | 'ticket_cho_kiem_chung_qua_24h'
  /** Tin Telegram đã thử 3 lần và đều trượt — 19.12 câu 6, phần 7. */
  | 'thong_bao_gui_truot';

export interface DongCanChuY {
  loai: LoaiCanChuY;
  nhan_loai: string;
  luc: number;
  ticket: TicketTroTa | null;
  luot_giao: { id: string; loai: string; nguoi_nhan_agent_id: string } | null;
  phien: { id: string; agent_id: string; trang_thai: string; nhan_trang_thai: string } | null;
  bang_chung: { id: string; loai: string; ly_do: string | null } | null;
  thong_bao: { id: string; loai: string; ly_do: string | null } | null;
}

export interface BangChungRutGon {
  id: string;
  loai: string;
  nhan_loai: string;
  /** Hash **7 ký tự** — d.320. Máy chủ đã cắt; giao diện không cắt lại. */
  hash: string | null;
  repo: string | null;
  url: string | null;
  ma_phien_ban: string | null;
  xac_minh: string;
  nhan_xac_minh: string;
  /**
   * **Nguồn của kết luận `merged`/`pushed`** — `github` hay `local` (migration
   * 0022). Phải hiện trên thẻ: một `merged` chỉ dựa vào lời khai cục bộ (repo
   * chưa push) không được nhìn giống một `merged` đã tra qua GitHub.
   */
  nguon_xac_minh: string | null;
  nhan_nguon_xac_minh: string | null;
  /** Nguồn của một `review` — `reviewer` hay `manager` (kèm báo cáo reviewer). */
  review_nguon: string | null;
  nhan_review_nguon: string | null;
  review_bao_cao: string | null;
  /**
   * Bằng chứng **Báo cáo** (`loai = 'bao_cao'`, migration 0027, T-31): nguồn ký
   * (`reviewer`/`manager`/`coordinator`/`owner`) + nhãn, đường dẫn và/hoặc nội
   * dung, và báo cáo reviewer của manager. `null` cho loại khác.
   */
  bao_cao_nguon: string | null;
  nhan_bao_cao_nguon: string | null;
  bao_cao_duong_dan: string | null;
  bao_cao_noi_dung: string | null;
  bao_cao_reviewer: string | null;
}

export interface DongVuaXong {
  ticket: TicketTroTa;
  xong_luc: number;
  bang_chung: BangChungRutGon[];
}

/**
 * Một dòng của khối "Cần chú ý" — d.321: **gom theo ticket**, mỗi ticket đúng
 * MỘT dòng, các lý do thành **nhãn** trên dòng đó. Máy chủ gom (`gomTheoTicket`);
 * trang không gom lại.
 */
export interface NhomCanChuY {
  /** Khoá ổn định do máy chủ cấp — dùng cho `key` của React và `data-*`. */
  khoa: string;
  ticket: TicketTroTa | null;
  luc: number;
  ly_do: DongCanChuY[];
}

export interface TongQuan {
  /** Mốc mà máy chủ đã tính mọi dẫn xuất của thân này — xem `tong-quan.tsx`. */
  bay_gio: number;
  du_an: HangDuAn[];
  viec_dang_chay: TheViecDangChay[];
  /** **Chỉ** agent đang làm — d.319. Máy chủ lọc. */
  agent: TheAgent[];
  /** Số agent rảnh, cho dòng gom của d.319. */
  agent_ranh_so: number;
  /** Hai cửa sổ của d.320, **cùng một lượt gọi** (d.410). */
  vua_xong_24h: DongVuaXong[];
  vua_xong_7n: DongVuaXong[];
  can_chu_y: NhomCanChuY[];
  /** Ô gọn ở thanh bên phải — d.322. */
  can_chu: {
    so_theo_muc: { urgent: number; today: number; later: number };
    so_cho: number;
    muc_cao_nhat: 'urgent' | 'today' | 'later' | null;
    gap_nhat: MucGapNhat[];
    /** Danh sách mở ra (20.5), thứ tự gấp nhất; tối đa 50 mục. */
    ds_cho: MucCanChuO[];
  };
  /** Bản đồ dự án cấp workspace — SPEC 20.2–20.3. */
  ban_do: {
    /** Tâm cây; "người cầm" khi dự án không có agent quản lý. */
    ten_chu: string;
    /** Đồng hồ "Đang đẩy n/<giới hạn>" — đỏ khi `vuot` (n > giới hạn). */
    wip: { dang_day: number; gioi_han: number; vuot: boolean };
  };
}

export const layTongQuan = (): Promise<TongQuan> => goiApi<TongQuan>('/v1/tong-quan');

export const layHuyHieuCanChu = (): Promise<HuyHieuRa> => goiApi<HuyHieuRa>('/v1/can-chu');

/* ------------------------------------------------------------------ *
 * Danh sách ticket — SPEC mục 14 d.395–397
 * ------------------------------------------------------------------ *
 * Hình thân gõ lại theo `packages/api/src/doc-ticket.ts` (`TicketDanhSachRa`) và
 * `doc-man-hinh-ticket.ts` (`ManHinhDanhSachRa`), cùng lý lẽ với hai khối trên:
 * giao diện không nhập kiểu từ `@baton/shared`, nhưng **mọi tên trường khớp từng
 * chữ**.
 */

/** Bảy trạng thái của bảng 0.1 — union, không `string` (xem `TrangThaiAgent`). */
export type TrangThaiTicket =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'verifying'
  | 'done'
  | 'canceled'
  | 'duplicate';

export type UuTien = 'urgent' | 'high' | 'medium' | 'low' | 'none';

/** `TacGia` của `@baton/shared` — chủ, agent, hoặc hệ thống. */
export interface TacGiaRa {
  loai: string;
  agentId?: string;
}

export interface TicketDong {
  id: string;
  ma: string;
  project_id: string;
  so: number;
  tieu_de: string;
  trang_thai: TrangThaiTicket;
  /** Nhãn tiếng Việt — **máy chủ** đổi (d.381), giao diện chỉ vẽ. */
  nhan_trang_thai: string;
  nhom_trang_thai: string;
  uu_tien: UuTien;
  nhan_uu_tien: string;
  chiu_trach_nhiem: TacGiaRa | null;
  /** Dẫn xuất 5 bậc của 19.1 — **máy chủ tính**. */
  nguoi_dang_cam: TacGiaRa | null;
  han_luc: number | null;
  tao_luc: number;
  cap_nhat_luc: number;
  co_co: boolean;
  /*
   * Bốn trường **của thẻ** — `TheDanhSachRa` của
   * `packages/api/src/doc-man-hinh-ticket.ts`. Chúng chỉ có trên đường **đọc màn
   * hình**, không trên `GET /v1/ticket` (đầu ra `baton list --json`).
   */
  /** Nhãn của ticket (mục 4) — thẻ vẽ nhãn màu; **máy chủ** sắp theo chữ. */
  nhan: string[];
  /** Tổng số ticket con. Thẻ hiện "xong/tổng" = `con_tong - con_chua_ket`. */
  con_tong: number;
  /** 19.11 — số con **chưa kết**; xem `cau-hoi-spec.md` #134. */
  con_chua_ket: number;
  /** Số mục Cần Chủ **đang Chờ** nối với ticket này. */
  can_chu_so: number;
  /** Mốc vào Xong — mốc của "Xong cũ"; `cap_nhat_luc` nhích vì mọi lần sửa. */
  xong_luc: number | null;
  /**
   * **Tên** agent đang cầm — d.404 ("mọi chỗ hiện người làm đều hiện tên agent,
   * không bao giờ id"). `null` khi người cầm là **chủ** hoặc không ai cầm.
   */
  nguoi_cam_ten: string | null;
  /** Cùng d.404 cho người chịu trách nhiệm. */
  chiu_trach_nhiem_ten: string | null;
}

/** Thân `GET /v1/man-hinh-ticket` — một trang kèm **mốc máy chủ** (d.412). */
export interface ManHinhDanhSach extends TrangKetQua<TicketDong> {
  bay_gio: number;
}

/**
 * **Chín bộ lọc của d.396**, tên khoá = **tên tham số truy vấn của máy chủ**.
 *
 * Cùng kỷ luật với `LocCanChu`: không một bảng dịch tên nào ở giữa. `nguoi_dang_cam`
 * và `chiu_trach_nhiem` nhận `owner` cho chủ, còn lại là id agent — đúng quy ước
 * của `thamSoLietKeTicket`.
 */
export interface LocTicket {
  project_id?: string | undefined;
  trang_thai?: string | undefined;
  uu_tien?: string | undefined;
  chiu_trach_nhiem?: string | undefined;
  nguoi_dang_cam?: string | undefined;
  nhan?: string | undefined;
  co_co?: string | undefined;
  can_chu?: string | undefined;
  xong_khong_bang_chung?: string | undefined;
}

/** Trần một trang — `kiemLimit` của máy chủ chặn ở 200. */
export const LIMIT_TRANG_TICKET = 200;

export const layManHinhDanhSach = (
  loc: LocTicket = {},
  cursor?: string,
): Promise<ManHinhDanhSach> =>
  goiApi<ManHinhDanhSach>(
    `/v1/man-hinh-ticket${chuoiTruyVan({
      ...loc,
      cursor,
      limit: String(LIMIT_TRANG_TICKET),
    })}`,
  );

/* ------------------------------------------------------------------ *
 * Chi tiết ticket — SPEC mục 14 d.398–401
 * ------------------------------------------------------------------ */

export interface LienKet {
  loai: string;
  nhan_loai: string;
  ticket_id: string;
  ma: string;
  tieu_de: string;
  trang_thai: TrangThaiTicket;
  nhan_trang_thai: string;
  /** `true` = liên kết trỏ **tới** ticket này. */
  nguoc: boolean;
}

export interface BinhLuan {
  id: string;
  tac_gia: TacGiaRa | null;
  noi_dung: string;
  da_sua: boolean;
  tao_luc: number;
  cap_nhat_luc: number;
}

export interface DongLichSu {
  id: string;
  tac_gia: TacGiaRa | null;
  luc: number;
  truong: string;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
}

/** Báo cáo nộp của một lượt — SPEC mục 5. */
export interface BaoCaoLuot {
  ket_qua: string;
  nhan_ket_qua: string;
  nop_luc: number | null;
  [muc: string]: string | number | null;
}

export interface LuotGiao {
  id: string;
  so_luot: number;
  loai: string;
  nhan_loai: string;
  trang_thai: string;
  nhan_trang_thai: string;
  dang_mo: boolean;
  /** Dẫn xuất của mục 5 — **máy chủ tính** từ `bay_gio` của chính thân này. */
  khong_phan_hoi: boolean;
  nguoi_giao: TacGiaRa;
  nguoi_nhan: TacGiaRa;
  brief: Record<string, string | null>;
  bao_cao: BaoCaoLuot | null;
  han_phan_hoi_luc: number | null;
  /** Lý do trả lại / huỷ — vế "nghiệm thu" của d.399. */
  ly_do: string | null;
  tao_luc: number;
  nhan_luc: number | null;
  nop_luc: number | null;
  dong_luc: number | null;
}

/** `BangChungRutGon` của `doc-tong-quan.ts` — cùng hình với khối 5 Tổng quan. */
export type BangChungTicket = BangChungRutGon;

/** **Tám mục brief** của d.399, đúng tên cột và đúng thứ tự của `TRUONG_BRIEF`. */
export const MUC_BRIEF = [
  'muc_tieu',
  'boi_canh',
  'pham_vi',
  'file_va_nguon',
  'dieu_cam',
  'xong_la_gi',
  'cach_kiem_chung',
  'nop_lai',
] as const;

export type MucBrief = (typeof MUC_BRIEF)[number];

export interface TicketDayDu extends Record<MucBrief, string | null> {
  id: string;
  ma: string;
  project_id: string;
  so: number;
  tieu_de: string;
  mo_ta: string | null;
  trang_thai: TrangThaiTicket;
  nhan_trang_thai: string;
  nhom_trang_thai: string;
  uu_tien: UuTien;
  nhan_uu_tien: string;
  nhan: string[];
  chiu_trach_nhiem: TacGiaRa | null;
  nguoi_dang_cam: TacGiaRa | null;
  bac_nguoi_cam: number;
  /** 19.1 bậc 3 — màn hình hiện "chờ … nghiệm thu". */
  cho_nghiem_thu: boolean;
  han_luc: number | null;
  nguoi_tao: TacGiaRa | null;
  tao_luc: number;
  cap_nhat_luc: number;
  bat_dau_luc: number | null;
  xong_luc: number | null;
  chu_tu_lam: boolean;
  trung_voi_ticket_id: string | null;
  ly_do_huy: string | null;
  /** 19.4 — ticket điều phối. */
  la_dieu_phoi: boolean;
  co: {
    xong_khong_bang_chung: boolean;
    nhap_khong_bang_chung: boolean;
    khong_ai_cam: boolean;
    can_review_lai: boolean;
  };
  /** 19.11 — "chờ N ticket con". */
  con_chua_ket: number;
  ma_cu: string | null;
  xoa_luc: number | null;
  /** Cờ "ticket không code" (0027, T-31) — chỉ chủ bật/tắt. */
  khong_code: boolean;
  /** Cờ "dự án không code" của hồ sơ dự án — chỉ hiện, sửa ở dự án. */
  du_an_khong_code: boolean;
  lien_ket: LienKet[];
  binh_luan_cuoi: BinhLuan[];
}

export interface TicketCon {
  id: string;
  ma: string;
  tieu_de: string;
  trang_thai: TrangThaiTicket;
  nhan_trang_thai: string;
}

/** Thân `GET /v1/man-hinh-ticket/ma/:ma` — d.398–401 trong một lượt gọi. */
export interface ManHinhTicket {
  /** **Một** mốc cho cả thân — d.412. */
  bay_gio: number;
  ticket: TicketDayDu;
  ticket_con: TicketCon[];
  luot_giao: LuotGiao[];
  bang_chung: BangChungTicket[];
  binh_luan: BinhLuan[];
  lich_su: DongLichSu[];
  /** Thẻ đầy đủ của d.250 — dùng lại component `The` của trang Cần Chủ. */
  can_chu: TheCanChu[];
}

export const layManHinhTicket = (ma: string): Promise<ManHinhTicket> =>
  goiApi<ManHinhTicket>(`/v1/man-hinh-ticket/ma/${encodeURIComponent(ma)}`);

/**
 * **Đổi trạng thái** — `POST /v1/ticket/:id/trang-thai`, SPEC mục 4 + cổng Xong
 * của mục 7.
 *
 * Giao diện **không** kiểm trước điều kiện vào Xong. Cổng là một luật nghiệp vụ ở
 * máy chủ (`congXong` + `cong-bang-chung.ts`): một bản kiểm thứ hai ở đây sẽ
 * hoặc chặn một lần chuyển hợp lệ, hoặc cho qua một lần chuyển mà máy chủ từ chối
 * — và cả hai đều hiện ra thành một màn hình nói sai. Nên thẻ **cứ bay**, rồi lý
 * do từ chối đi nguyên văn từ `message` của máy chủ ra toast (d.396, d.407).
 */
export const doiTrangThai = (
  ticket_id: string,
  trang_thai: TrangThaiTicket,
): Promise<unknown> =>
  goiApi<unknown>(`/v1/ticket/${encodeURIComponent(ticket_id)}/trang-thai`, {
    method: 'POST',
    than: { trang_thai },
  });

/** Sửa **tại chỗ** tiêu đề / mô tả — d.398. */
export const suaTicket = (
  ticket_id: string,
  than: { tieu_de?: string; mo_ta?: string; uu_tien?: UuTien; khong_code?: boolean },
): Promise<unknown> =>
  goiApi<unknown>(`/v1/ticket/${encodeURIComponent(ticket_id)}`, { method: 'PATCH', than });

/**
 * **Gắn / bỏ một nhãn** — `POST /v1/ticket/:id/nhan` (lệnh `dat_nhan`, SPEC mục 4;
 * phím `L` của mục 14 d.415). Luật hợp lệ của nhãn (độ dài…) là của máy chủ
 * (`kiemNhanTicket`); câu từ chối đi nguyên văn ra toast.
 */
export const datNhanTicket = (
  ticket_id: string,
  nhan: string,
  gan: boolean,
): Promise<unknown> =>
  goiApi<unknown>(`/v1/ticket/${encodeURIComponent(ticket_id)}/nhan`, {
    method: 'POST',
    than: { nhan, gan },
  });

/**
 * **Tạo ticket** — `POST /v1/ticket` (lệnh `tao_ticket`, SPEC mục 4; phím `C` của
 * mục 14 d.413). Tên trường khớp từng chữ `LenhTaoTicket` của máy chủ.
 *
 * `ticket_cha_id` là **id**, không mã: giao diện tra mã → id qua
 * `layTicketTheoMa` trước, cùng nếp `baton create --parent MÃ` của CLI. Gửi mã thô
 * vào trường này là một `NOT_FOUND` khó hiểu.
 *
 * Luật tiêu đề (1–200 ký tự sau khi cắt), ưu tiên hợp lệ, dự án lưu trữ… là của
 * **máy chủ**; giao diện chỉ chặn trước hai ô bắt buộc để chủ khỏi đi-về một lượt.
 */
export interface ThanTaoTicket {
  project_id: string;
  tieu_de: string;
  mo_ta?: string;
  uu_tien?: UuTien;
  ticket_cha_id?: string;
  /**
   * Trạng thái ban đầu — SPEC mục 4 "Trạng thái khi tạo" (T-108 = B, BAT-63): máy
   * chủ chỉ nhận `todo` / `backlog`; không gửi ⇒ Cần làm.
   */
  trang_thai?: Extract<TrangThaiTicket, 'todo' | 'backlog'>;
}

export interface KetQuaTaoTicket {
  id: string;
  ma: string;
  so: number;
  tieu_de: string;
  trang_thai: TrangThaiTicket;
}

export const taoTicket = (than: ThanTaoTicket): Promise<KetQuaTaoTicket> =>
  goiApi<KetQuaTaoTicket>('/v1/ticket', { method: 'POST', than });

/** Phần dùng tới của `GET /v1/ticket/ma/:ma` (`TicketRa` của `doc-ticket.ts`). */
export interface TicketTheoMa {
  id: string;
  ma: string;
  tieu_de: string;
}

/**
 * **Giao việc** — `POST /v1/ticket/:id/luot-giao` (lệnh `tao_luot_giao`, SPEC mục 5;
 * phím `A` của mục 14 d.415). Tên trường khớp từng chữ `LenhTaoLuotGiao`.
 *
 * Tám trường brief là **ghi đè cho lượt này**: trường vắng mặt ⇒ máy chủ lấy brief
 * của ticket; trường có mặt mà rỗng/`null` ⇒ máy chủ ghi `null` (`kiemChuTuyChon`)
 * — tức **xoá** mục đó khỏi brief của lượt. Nên thân chỉ mang trường chủ đã thật sự
 * nhập (`thanGiaoViec` của `vo/giao-viec.tsx`). Không gửi `loai_luot` (mặc định
 * `work`) và `han_phan_hoi_phut` (mặc định 15 phút của máy chủ).
 */
export type ThanGiaoViec = { nguoi_nhan_agent_id: string } & Partial<Record<MucBrief, string>>;

/** `KetQuaTaoLuotGiao` của `packages/api/src/lenh-luot-giao.ts`. */
export interface KetQuaGiaoViec {
  id: string;
  ticket_id: string;
  so_luot: number;
  loai: string;
  trang_thai: string;
  nguoi_nhan_agent_id: string;
  han_phan_hoi_luc: number | null;
  ticket_trang_thai: string;
}

export const giaoViec = (ticket_id: string, than: ThanGiaoViec): Promise<KetQuaGiaoViec> =>
  goiApi<KetQuaGiaoViec>(`/v1/ticket/${encodeURIComponent(ticket_id)}/luot-giao`, {
    method: 'POST',
    than,
  });

export const layTicketTheoMa = (ma: string): Promise<TicketTheoMa> =>
  goiApi<TicketTheoMa>(`/v1/ticket/ma/${encodeURIComponent(ma)}`);

/* ------------------------------------------------------------------ *
 * Command menu `Cmd/Ctrl+K` — `GET /v1/tim` (SPEC mục 14 d.414, 19.12 câu 8)
 * ------------------------------------------------------------------ */

/** Một ticket trong kết quả tìm — xem `packages/api/src/doc-tim.ts`. */
export interface TicketTim {
  id: string;
  ma: string;
  tieu_de: string;
  trang_thai: string;
  nhan_trang_thai: string;
  ma_cu: string | null;
  project_id: string;
  ma_du_an: string;
}

/** Một mục Cần Chủ trong kết quả tìm. */
export interface MucTim {
  id: string;
  /** `T-<số>`. */
  ma: string;
  tieu_de: string;
  trang_thai: string;
  nhan_trang_thai: string;
  project_id: string | null;
}

export interface KetQuaTim {
  ticket: TicketTim[];
  can_chu: MucTim[];
}

/** `encodeURIComponent`, không `URLSearchParams`: khoảng trắng đi là `%20`, không `+`. */
export const timNhanh = (q: string): Promise<KetQuaTim> =>
  goiApi<KetQuaTim>(`/v1/tim?q=${encodeURIComponent(q)}`);

/** Danh sách agent — nuôi hai ô chọn người của bộ lọc d.396 và ô "giao" d.403. */
export interface AgentChon {
  id: string;
  ten: string;
  vai_tro: string;
  nhan_vai_tro: string;
  /**
   * `AgentRa.disabled` của máy chủ (`lietKeAgent` luôn trả). Hộp giao việc (BAT-33)
   * dùng nó để **không cho chọn** agent đã tắt (SPEC mục 5); khai tuỳ chọn vì các
   * chỗ dùng cũ không đọc nó.
   */
  disabled?: boolean;
}

export const layAgent = (): Promise<TrangKetQua<AgentChon>> =>
  goiApi<TrangKetQua<AgentChon>>('/v1/agent');

/* ------------------------------------------------------------------ *
 * Đội agent, trang agent, chi tiết phiên — SPEC mục 3, mục 6, mục 14
 * ------------------------------------------------------------------ *
 * Hình thân gõ lại theo `packages/api/src/doc-man-hinh-agent.ts` (`AgentRa`,
 * `PhienRa`, `HoatDongRa`, `KeHoachRa`), cùng kỷ luật với các khối trên: giao
 * diện không nhập kiểu từ `@baton/shared`, nhưng **mọi tên trường khớp từng chữ**.
 *
 * **Không một trường nào mang token.** `token_bon_cuoi` là 4 ký tự cuối mà mục 3
 * d.83 đòi hiện; không có trường cho token thô hay băm token (mục 3 d.83 "server
 * chỉ lưu token dạng băm"; cùng tinh thần mục 15 d.427), và
 * ca test ở tầng API ghim điều đó trên thân thật.
 */

/** Một agent trong `GET /v1/man-hinh-agent` — `AgentRa` của máy chủ. */
export interface AgentDong {
  id: string;
  ten: string;
  vai_tro: string;
  nhan_vai_tro: string;
  model: string | null;
  mo_ta: string | null;
  disabled: boolean;
  vao_tat_ca_du_an: boolean;
  /** 19.12 câu 23: **mọi lệnh ghi thành công**, có gắn phiên hay không. */
  len_tieng_luc: number | null;
  nguong_dung_phut: number | null;
  trang_thai: TrangThaiAgent;
  nhan_trang_thai: string;
  /** **4 ký tự cuối** — mục 3 d.83. Không bao giờ là token. */
  token_bon_cuoi: string | null;
  token_tao_luc: number | null;
  token_thu_hoi_luc: number | null;
  tao_luc: number;
  cap_nhat_luc: number;
}

export interface ManHinhDoiAgent {
  bay_gio: number;
  agent: AgentDong[];
  cursor_sau: string | null;
}

/** Một phiên — `PhienRa` của `doc-phien.ts`, trạng thái **đã dẫn xuất**. */
export interface PhienDong {
  id: string;
  luot_giao_id: string;
  ticket_id: string;
  agent_id: string;
  trang_thai: string;
  nhan_trang_thai: string;
  trang_thai_luu: string;
  dang_mo: boolean;
  /** Phiên đang bị tính **đứng** — mục 6 d.184. Máy chủ tính, không giao diện. */
  dung: boolean;
  tin_hieu_cuoi_luc: number;
  im_lang_ms: number;
  nguong_dung_phut: number;
  ghi_chu_cuoi: string | null;
  can_chu_id: string | null;
  stopping_luc: number | null;
  waiting_assigner_luc: number | null;
  cho_nguoi_giao_ms: number | null;
  cho_nguoi_giao_qua_han: boolean;
  /** Tín hiệu agent sẽ nhận ở lần gọi kế tiếp — mục 0.1, d.193. */
  tin_hieu: string[];
  mo_luc: number;
  dong_luc: number | null;
  ly_do_dong: string | null;
}

export interface HangQuyen {
  viec: string;
  nhan_viec: string;
  pham_vi: string;
  nhan_pham_vi: string;
}

export interface LuotGiaoCuaAgent extends LuotGiao {
  ticket_ma: string;
  ticket_tieu_de: string;
}

/** 19.5 — `ti_le` là `null` khi mẫu số 0 (không có tỉ lệ, **không** phải 0%). */
export interface TiLeDatLanDau {
  dat: number;
  da_nop: number;
  ti_le: number | null;
}

export interface DuAnCuaAgent {
  id: string;
  ma: string;
  ten: string;
  quan_ly: boolean;
}

export interface ManHinhAgent {
  bay_gio: number;
  agent: AgentDong;
  bang_quyen: HangQuyen[];
  phien_dang_mo: PhienDong[];
  luot_giao: LuotGiaoCuaAgent[];
  ti_le_dat_lan_dau: TiLeDatLanDau;
  du_an: DuAnCuaAgent[];
}

export interface HoatDongDong {
  id: string;
  phien_id: string;
  loai: string | null;
  nhan_loai: string;
  tac_gia_loai: string;
  tac_gia_agent_id: string | null;
  noi_dung: string;
  ten_thao_tac: string | null;
  tham_so: string | null;
  ket_qua_thao_tac: string | null;
  tam_thoi: boolean;
  da_bi_thay_cho: boolean;
  la_tra_loi: boolean;
  thu_tu: number;
  gui_luc: number;
}

export interface BuocKeHoach {
  thu_tu: number;
  noi_dung: string;
  trang_thai: string;
  nhan_trang_thai: string;
}

export interface KeHoachPhien {
  phien_id: string;
  /** `0` = agent chưa gửi kế hoạch nào. */
  phien_ban: number;
  gui_luc: number | null;
  buoc: BuocKeHoach[];
}

export interface ManHinhPhien {
  bay_gio: number;
  phien: PhienDong;
  hoat_dong: HoatDongDong[];
  ke_hoach: KeHoachPhien;
  ticket: { id: string; ma: string; tieu_de: string; trang_thai: string; nhan_trang_thai: string };
  agent: { id: string; ten: string; vai_tro: string; nhan_vai_tro: string };
}

export const layManHinhDoiAgent = (): Promise<ManHinhDoiAgent> =>
  goiApi<ManHinhDoiAgent>('/v1/man-hinh-agent');

export const layManHinhAgent = (id: string): Promise<ManHinhAgent> =>
  goiApi<ManHinhAgent>(`/v1/man-hinh-agent/${encodeURIComponent(id)}`);

export const layManHinhPhien = (id: string): Promise<ManHinhPhien> =>
  goiApi<ManHinhPhien>(`/v1/man-hinh-phien/${encodeURIComponent(id)}`);

/**
 * **Nút "Dừng"** — `POST /v1/phien/:id/dung`, SPEC mục 6 d.193, mục 14 d.402.
 *
 * Giao diện **không** cài lại luật nào của việc dừng: "chỉ chủ" (19.12 câu 44),
 * phiên sang `stopping`, 10 phút không xác nhận thì tự đóng (d.194), tín hiệu
 * `STOP` cho lần gọi kế tiếp của agent — tất cả nằm ở lệnh `dung_phien` của cửa
 * ghi từ phần 2. Đây chỉ là một lượt gọi.
 */
export const dungPhien = (phien_id: string): Promise<unknown> =>
  goiApi<unknown>(`/v1/phien/${encodeURIComponent(phien_id)}/dung`, { method: 'POST' });

/**
 * **Token mới của một agent** — thân của `POST /v1/agent/:id/token` (lệnh
 * `tao_lai_token`, SPEC mục 3 d.83).
 *
 * Đây là **kiểu duy nhất** trong file mang token thô (ghi chú "không một trường
 * nào mang token" ở khối trên nói về thân **đọc**). Kỷ luật đi kèm, giữ ở
 * `trang/token-agent.tsx`: hàm này được gọi **thẳng**, không qua `useQuery` /
 * `useMutation`, nên token không bao giờ vào cache của TanStack Query; nó chỉ sống
 * trong state cục bộ của hộp hiện token và mất khi hộp đóng.
 */
export interface TokenMoi {
  agent_id: string;
  token: string;
  token_bon_cuoi: string;
}

/** Tạo lại token — token cũ hết hiệu lực ngay (mục 3 d.83). */
export const taoLaiToken = (agent_id: string): Promise<TokenMoi> =>
  goiApi<TokenMoi>(`/v1/agent/${encodeURIComponent(agent_id)}/token`, { method: 'POST' });

/** Thu hồi token (mục 3 d.83). `POST .../token/thu-hoi`, không `DELETE`. */
export const thuHoiToken = (agent_id: string): Promise<unknown> =>
  goiApi<unknown>(`/v1/agent/${encodeURIComponent(agent_id)}/token/thu-hoi`, { method: 'POST' });

/* ------------------------------------------------------------------ *
 * Nhật ký quyết định — SPEC mục 10 d.306–312
 * ------------------------------------------------------------------ *
 * Hình thân gõ lại theo `packages/api/src/doc-nhat-ky.ts` (`DongNhatKyRa`,
 * `NhomNgay`), cùng kỷ luật với các khối trên.
 *
 * **Không một dẫn xuất nào tính lại ở giao diện**: `ngay` (khoá gom của d.311,
 * đổi theo múi giờ nghiệp vụ của 19.12 câu 60), `nhom_theo_ngay`,
 * `da_co_quyet_dinh_moi` (d.309), `ma_can_chu` của căn cứ — tất cả **đã tính** từ
 * máy chủ.
 */

export interface CanCu {
  loai: string;
  id: string;
  /** `T-số` khi căn cứ là một mục Cần Chủ; `null` với hai loại kia. */
  ma_can_chu: string | null;
}

export interface DongNhatKy {
  id: string;
  luc: number;
  /** Ngày **địa phương** `YYYY-MM-DD` — máy chủ đổi, không giao diện. */
  ngay: string;
  nguoi_loai: string;
  agent_id: string | null;
  /** `null` = **Chung** — 19.12 câu 4 (trường dự án **rỗng**). */
  project_id: string | null;
  quyet_dinh: string;
  /** d.306 + 19.12 câu 62 — **không bao giờ rỗng**. */
  vi_sao: string;
  /** d.309 — "dòng cũ hiện chữ *đã có quyết định mới*". Máy chủ dẫn xuất. */
  da_co_quyet_dinh_moi: boolean;
  can_cu: CanCu[];
}

export interface NhomNgay {
  ngay: string;
  so_dong: number;
}

export interface ManHinhNhatKy extends TrangKetQua<DongNhatKy> {
  nhom_theo_ngay: NhomNgay[];
  bay_gio: number;
}

/**
 * Bộ lọc của d.311 — tên khoá = **tên tham số truy vấn của máy chủ**.
 *
 * `project_id` nhận `chung` cho lớp dòng Chung (19.12 câu 4); `ai` nhận `chu`
 * hoặc một `agent_id`. Cùng kỷ luật `LocCanChu`: không một bảng dịch tên nào ở
 * giữa.
 */
export interface LocNhatKy {
  project_id?: string | undefined;
  ai?: string | undefined;
  tim?: string | undefined;
}

export const layManHinhNhatKy = (loc: LocNhatKy = {}): Promise<ManHinhNhatKy> =>
  goiApi<ManHinhNhatKy>(
    `/v1/man-hinh-nhat-ky${chuoiTruyVan({
      project_id: loc.project_id,
      ai: loc.ai,
      tim: loc.tim,
    })}`,
  );

/**
 * **Chủ tự ghi một dòng** — `POST /v1/nhat-ky`, mục 10 d.310.
 *
 * `vi_sao` **bắt buộc** (19.12 câu 62): luật áp ở cả ba tầng (CLI, API, ràng buộc
 * DB), nên giao diện không là tầng duy nhất — nó chỉ làm nút Gửi mờ để chủ không
 * phải đi-về một lượt mới biết.
 *
 * `project_id` để trống = **Chung** (19.12 câu 4: "Chung" không phải một dự án, nó
 * là trường dự án để rỗng).
 */
export interface ThanGhiNhatKy {
  quyet_dinh: string;
  vi_sao: string;
  project_id?: string | null;
}

/** d.312 — cảnh báo mẫu dữ liệu nhân sự. **Chỉ cảnh báo, không chặn.** */
export interface KetQuaGhiNhatKy {
  id: string;
  luc: number;
  canh_bao: { ma: string; message: string }[];
}

export const ghiNhatKy = (than: ThanGhiNhatKy): Promise<KetQuaGhiNhatKy> =>
  goiApi<KetQuaGhiNhatKy>('/v1/nhat-ky', { method: 'POST', than });

/* ------------------------------------------------------------------ *
 * Hồ sơ dự án, Luật chung, trang Bản đồ — SPEC mục 9 d.294–303
 * ------------------------------------------------------------------ *
 * Hình thân gõ lại theo `packages/api/src/doc-ho-so.ts` (`HoSoRa`, `LuatChungRa`,
 * `HangBanDo`, `ManHinhBanDoRa`), cùng kỷ luật với các khối trên.
 *
 * **Không một dẫn xuất nào tính lại ở giao diện**: `suc_song` và `so_dang_lam`
 * của d.302, `cap_nhat_luc` (mốc muộn hơn giữa dự án và hồ sơ), `phien_ban` của
 * d.303, `ngay` của mỗi mục "Lỗi đã gặp" (d.299, múi giờ nghiệp vụ của 19.12 câu
 * 60) — tất cả **đã tính** từ máy chủ.
 */

/** Chín mục markdown của d.296–298 — tên khoá = tên cột của máy chủ. */
export interface MucHoSo {
  la_gi: string | null;
  thu_muc: string | null;
  repo_chu_so_huu: string | null;
  repo_ten: string | null;
  repo_nhanh_mac_dinh: string | null;
  stack: string | null;
  doc_truoc: string | null;
  cach_deploy: string | null;
  danh_sach_cam: string | null;
}

/** Một mục "Lỗi đã gặp" — d.299 (ngày, lỗi, cách tránh). */
export interface LoiDaGap {
  id: string;
  /** Ngày **địa phương** `YYYY-MM-DD` — máy chủ đổi, không giao diện. */
  ngay: string;
  loi: string;
  cach_tranh: string | null;
  ghi_boi_loai: string;
  ghi_boi_agent_id: string | null;
  tao_luc: number;
}

/** Một phiên bản cũ của hồ sơ — d.303. */
export interface BanHoSo {
  id: string;
  phien_ban: number;
  luc: number;
  sua_boi_loai: string;
  sua_boi_agent_id: string | null;
  /** Nội dung **của bản cũ** (khoá = mục của d.296–298). */
  muc: Record<string, string | null>;
}

export interface HoSo extends MucHoSo {
  project_id: string;
  /** Mốc mà mọi dẫn xuất thời gian của thân này được đọc tại — d.412. */
  bay_gio: number;
  /** `0` = **chưa có hồ sơ nào**, khác "hồ sơ rỗng" — xem `doc-ho-so.ts`. */
  phien_ban: number;
  cap_nhat_luc: number | null;
  /** Hai cờ của d.300 — nguồn là dự án, hồ sơ **không** nhân bản chúng. */
  khong_code: boolean;
  bat_buoc_review: boolean;
  du_an: {
    id: string;
    ma: string;
    ten: string;
    quan_ly_agent_id: string | null;
    /** **Tên** agent quản lý — cùng vế mà d.302 gọi "agent quản lý". */
    quan_ly_agent_ten: string | null;
    /* Thanh công cụ đầu trang dự án — SPEC 20.8. */
    trang_thai: string;
    uu_tien: number;
    dang_day: boolean;
    duy_tri: boolean;
    nhom: string | null;
    dat_boi: DatBoi | null;
  };
  loi_da_gap: LoiDaGap[];
  lich_su_ban: BanHoSo[];
}

export interface LuatChung {
  danh_sach_cam: string | null;
  checklist: string | null;
  cap_nhat_luc: number | null;
}

/** Một hàng của bảng d.302. */
export interface HangBanDo {
  id: string;
  ma: string;
  ten: string;
  nhom: string | null;
  trang_thai: string;
  nhan_trang_thai: string;
  quan_ly_agent_id: string | null;
  quan_ly_agent_ten: string | null;
  thu_muc: string | null;
  so_dang_lam: number;
  suc_song: SucSong;
  cap_nhat_luc: number;
  khong_code: boolean;
  bat_buoc_review: boolean;
  co_ho_so: boolean;
  /** Bốn cột thêm của mục 9 (SPEC 20.1): Nhóm (`nhom` ở trên), Ưu tiên, Đang đẩy, Duy trì. */
  uu_tien: number;
  dang_day: boolean;
  duy_tri: boolean;
  ten_ngan: string | null;
}

export interface ManHinhBanDo {
  bay_gio: number;
  du_an: HangBanDo[];
  luat_chung: LuatChung;
  /** Số dự án bị trần của một lượt gọi cắt đi — `0` là đã đủ. Xem `doc-ho-so.ts`. */
  so_con_lai: number;
}

export const layManHinhBanDo = (): Promise<ManHinhBanDo> =>
  goiApi<ManHinhBanDo>('/v1/man-hinh-ban-do');

export const layHoSo = (project_id: string): Promise<HoSo> =>
  goiApi<HoSo>(`/v1/du-an/${encodeURIComponent(project_id)}/ho-so`);

/**
 * Sửa hồ sơ — `PATCH`, **chỉ những mục được gửi** đổi (d.296–298), và máy chủ
 * chụp một phiên bản của bản cũ (d.303).
 */
export const suaHoSo = (project_id: string, than: Partial<MucHoSo>): Promise<unknown> =>
  goiApi<unknown>(`/v1/du-an/${encodeURIComponent(project_id)}/ho-so`, {
    method: 'PATCH',
    than,
  });

/**
 * Thêm một mục "Lỗi đã gặp" — d.299, danh sách **chỉ thêm**.
 *
 * `api.ts` **không có** hàm sửa hay xoá một mục, và máy chủ không có route cho
 * hai việc đó (khoá ở trigger của migration 0018). Sự vắng mặt đó là **nội
 * dung** của d.299, không phải thiếu sót.
 */
export const themLoiDaGap = (
  project_id: string,
  than: { loi: string; cach_tranh?: string | null },
): Promise<{ id: string; ngay: string }> =>
  goiApi<{ id: string; ngay: string }>(
    `/v1/du-an/${encodeURIComponent(project_id)}/loi-da-gap`,
    { method: 'POST', than },
  );

export const layLuatChung = (): Promise<LuatChung> => goiApi<LuatChung>('/v1/luat-chung');

export const suaLuatChung = (than: {
  danh_sach_cam?: string | null;
  checklist?: string | null;
}): Promise<unknown> => goiApi<unknown>('/v1/luat-chung', { method: 'PUT', than });

/* ------------------------------------------------------------------ *
 * Báo cáo sáng / handoff tối — SPEC mục 11 d.322–336, mục 14 d.392
 * ------------------------------------------------------------------ *
 * Hình thân gõ lại theo `packages/api/src/doc-bao-cao.ts` (`HangBaoCao`,
 * `BaoCaoRa`) và `@baton/shared/bao-cao.ts` (`DuLieuBaoCaoSang`,
 * `DuLieuBaoCaoToi`), cùng kỷ luật với các khối trên: **không** nhập kiểu từ
 * `@baton/shared`, nhưng **mọi tên trường khớp từng chữ**.
 *
 * **Không một dẫn xuất nào tính lại ở giao diện**: `ngay` (múi giờ nghiệp vụ của
 * 19.12 câu 60), `dat` của mỗi trọng tâm (d.331 đọc từ `ticket.trang_thai`),
 * `nhan_trang_thai` / `nhan_muc` / `nhan_suc_song`, và **cả chữ markdown**
 * (`noi_dung_md`) — tất cả **đã tính** từ máy chủ. Trang `/bao-cao` chỉ vẽ.
 */

/** Hai loại báo cáo của mục 11 — mã máy của máy chủ. */
export type LoaiBaoCao = 'sang' | 'toi';

export interface HangBaoCao {
  /** `YYYY-MM-DD` trên tường của chủ — máy chủ đổi, không giao diện. */
  ngay: string;
  loai: LoaiBaoCao;
  /** Nhãn tiếng Việt ("Báo cáo sáng" / "Handoff tối") — mục 0.1. */
  nhan_loai: string;
  tao_luc: number;
}

export interface MucGapNhatBaoCao {
  ma: string;
  tieu_de: string;
  nhan_muc: string;
}

export interface ViecBaoCao {
  ma: string;
  tieu_de: string;
  nhan_trang_thai: string;
}

export interface ViecDangChayBaoCao extends ViecBaoCao {
  /** `null` = ticket Đang làm mà **không ai cầm** (cờ của 19.1). */
  agent_id: string | null;
}

export interface MucTrongTamBaoCao {
  thu_tu: number;
  ma: string;
  tieu_de: string;
  nhan_trang_thai: string;
  /** d.331 — "đạt hay chưa", **máy chủ dẫn xuất** từ `ticket.trang_thai`. */
  dat: boolean;
  ghi_chu: string | null;
}

export interface DongChuYBaoCao {
  nhan_loai: string;
  chi_tiet: string;
}

export interface QuyetDinhBaoCao {
  nguoi: string;
  quyet_dinh: string;
  vi_sao: string;
}

export interface DuAnBaoCao {
  ma: string;
  ten: string;
  nhan_suc_song: string;
  so_dang_lam: number;
  so_cho_kiem_chung: number;
  so_xong_24h: number;
}

/** Sáu vế của d.322–328. */
export interface DuLieuBaoCaoSang {
  ngay: string;
  tao_luc: number;
  can_chu: { so_cho: number; so_theo_muc: Record<string, number>; gap_nhat: MucGapNhatBaoCao[] };
  trong_tam: MucTrongTamBaoCao[];
  hom_qua: { ngay: string; viec: ViecBaoCao[] };
  dang_chay: ViecDangChayBaoCao[];
  rui_ro_va_lech: DongChuYBaoCao[];
  quyet_dinh_moi: QuyetDinhBaoCao[];
}

/** Bốn vế của d.330–334. */
export interface DuLieuBaoCaoToi {
  ngay: string;
  tao_luc: number;
  trong_tam: MucTrongTamBaoCao[];
  du_an: DuAnBaoCao[];
  chuyen_sang_mai: ViecBaoCao[];
  can_chu_moi: MucGapNhatBaoCao[];
}

export interface BaoCao {
  ngay: string;
  loai: LoaiBaoCao;
  nhan_loai: string;
  tao_luc: number;
  /** Vế "**xuất ra markdown được**" của d.336 — chữ **đã lưu**, không dựng lại. */
  noi_dung_md: string;
  /** `null` khi `du_lieu_json` của một dòng cũ không phân tích được. */
  du_lieu: DuLieuBaoCaoSang | DuLieuBaoCaoToi | null;
}

/** `GET /v1/bao-cao` — d.336 ("xem lại được"), mới nhất trước. */
export const layDanhSachBaoCao = (cursor?: string): Promise<TrangKetQua<HangBaoCao>> =>
  goiApi<TrangKetQua<HangBaoCao>>(
    cursor === undefined ? '/v1/bao-cao' : `/v1/bao-cao?cursor=${encodeURIComponent(cursor)}`,
  );

/** `GET /v1/bao-cao/:ngay/:loai` — một báo cáo. */
export const layBaoCao = (ngay: string, loai: LoaiBaoCao): Promise<BaoCao> =>
  goiApi<BaoCao>(`/v1/bao-cao/${encodeURIComponent(ngay)}/${encodeURIComponent(loai)}`);

/** Một dòng của bộ trọng tâm **hiện hành** — `GET /v1/trong-tam` (BAT-11, #147). */
export interface MucTrongTamSong {
  thu_tu: number;
  ticket_id: string;
  ma: string;
  tieu_de: string;
  ghi_chu: string | null;
  agent_id: string | null;
  nguoi_ghi: string | null;
  tao_luc: number;
}

export interface TrongTamSong {
  /** Ngày trên tường của chủ — máy chủ suy, giao diện không tính. */
  ngay: string;
  muc: MucTrongTamSong[];
}

/** `GET /v1/trong-tam` — bộ trọng tâm của HÔM NAY, đọc sống. */
export const layTrongTamSong = (): Promise<TrongTamSong> =>
  goiApi<TrongTamSong>('/v1/trong-tam');

/** `POST /v1/trong-tam` — thay cả bộ của hôm nay; `[]` = bỏ đề xuất. Không gửi ngày. */
export const ghiTrongTam = (
  muc: { ticket_id: string; ghi_chu?: string }[],
): Promise<unknown> => goiApi<unknown>('/v1/trong-tam', { method: 'POST', than: { muc } });

/* ------------------------------------------------------------------ *
 * Xuất dữ liệu — SPEC mục 15 d.429 (BAT-8)
 * ------------------------------------------------------------------ */

/** Tên file khi máy chủ không gửi `content-disposition` (không xảy ra với API thật). */
export const TEN_FILE_XUAT_DU_PHONG = 'baton.json';

/** Tên file trong `content-disposition: attachment; filename="…"`, hoặc `null`. */
export function tenFileTuHeader(h: string | null): string | null {
  if (h === null) return null;
  const m = /filename="([^"]+)"/.exec(h);
  return m?.[1] ?? null;
}

export interface BanXuatTai {
  blob: Blob;
  ten_file: string;
}

/**
 * `GET /v1/xuat` — **toàn bộ dữ liệu** ra một file JSON (chỉ chủ). Không đi qua
 * `goiApi` vì thân không được **phân tích**: nó đi nguyên khối vào một `Blob` để
 * trình duyệt tải về — phân tích rồi `stringify` lại một bản có thể rất lớn là tốn
 * gấp đôi bộ nhớ mà không được gì. Lỗi thì vẫn đi đúng đường của `goiApi`: câu
 * `message` của máy chủ nguyên văn.
 */
export const taiBanXuat = (): Promise<BanXuatTai> => taiBlob('/v1/xuat');

/** Một bản sao lưu trên R2 — `GET /v1/sao-luu` (BAT-10). */
export interface BanSaoLuu {
  ngay: string;
  khoa: string;
  /** Byte. */
  kich_thuoc: number;
  tao_luc: number;
}

export interface DanhSachSaoLuu {
  /** `false` ⇒ sao lưu tự động chưa bật (chưa gắn R2). */
  bat: boolean;
  items: BanSaoLuu[];
}

export const laySaoLuu = (): Promise<DanhSachSaoLuu> => goiApi<DanhSachSaoLuu>('/v1/sao-luu');

/** `GET /v1/sao-luu/<ngay>` — tải một bản về (cùng nếp `taiBanXuat`). */
export const taiBanSaoLuu = (ngay: string): Promise<BanXuatTai> =>
  taiBlob(`/v1/sao-luu/${encodeURIComponent(ngay)}`);

/** Hạn chờ dài `HAN_CHO_TAI_FILE_MS` (BAT-35), phủ cả lúc đọc thân (`blob()`). */
async function taiBlob(duong: string): Promise<BanXuatTai> {
  return voiHanCho(HAN_CHO_TAI_FILE_MS, 'GET', async (signal) => {
    const r = await fetch(duong, { method: 'GET', credentials: 'same-origin', signal });
    if (!r.ok) {
      const loi = docJson(await r.text()) as { error?: unknown; message?: unknown } | null;
      const ma = typeof loi?.error === 'string' ? loi.error : 'INTERNAL';
      const cau = typeof loi?.message === 'string' ? loi.message : CAU_LOI_KHONG_RO;
      throw new LoiApi(ma, cau, r.status);
    }
    return {
      blob: await r.blob(),
      ten_file: tenFileTuHeader(r.headers.get('content-disposition')) ?? TEN_FILE_XUAT_DU_PHONG,
    };
  });
}

export const dangNhap = (mat_khau: string, ma_totp: string): Promise<{ het_luc: number }> =>
  goiApi<{ het_luc: number }>('/v1/dang-nhap', {
    method: 'POST',
    than: { mat_khau, ma_totp },
  });

export const dangXuat = (moi_noi: boolean): Promise<unknown> =>
  goiApi<unknown>(moi_noi ? '/v1/dang-xuat-moi-noi' : '/v1/dang-xuat', { method: 'POST' });

/**
 * Một phiên đăng nhập đang mở — `GET /v1/chu/phien-dang-nhap` (BAT-11). Máy chủ
 * **không** trả băm hay id nào của phiên (d.427), nên ở đây cũng không có.
 */
export interface PhienDangNhap {
  tao_luc: number;
  het_luc: number;
  dung_cuoi_luc: number | null;
  thiet_bi: string | null;
  ua: string | null;
  hien_tai: boolean;
}

export interface DanhSachPhienDangNhap {
  /** Mốc của máy chủ — để đếm "x phút trước" từ cùng đồng hồ. */
  bay_gio: number;
  items: PhienDangNhap[];
}

export const layPhienDangNhap = (): Promise<DanhSachPhienDangNhap> =>
  goiApi<DanhSachPhienDangNhap>('/v1/chu/phien-dang-nhap');

export interface KetQuaDoiMatKhau {
  so_phien_khac_da_huy: number;
  doi_luc: number;
}

/**
 * Luật độ dài mật khẩu — **bản chép** của `MAT_KHAU_DAI_TOI_THIEU`/`TOI_DA` ở
 * `packages/shared/src/mat-khau.ts`, chỉ để **hiện** luật bên ô nhập (BAT-11).
 * Giao diện không nhập từ `@baton/shared` (xem ghi chú ở mục Tổng quan trên), nên
 * chép — và `test/cai-dat.test.tsx` ghim hai số này **bằng đúng** hằng của
 * `shared`: đổi một bên mà quên bên kia là ca đỏ. Người phán quyết vẫn là máy
 * chủ (422 kèm câu của chính nó); trang không tự chặn theo độ dài.
 */
export const MAT_KHAU_DAI_TOI_THIEU = 12;
export const MAT_KHAU_DAI_TOI_DA = 256;

/**
 * Một công tắc thông báo — `GET /v1/cai-dat/thong-bao` (BAT-16, mục 12 d.348).
 * Nhãn và câu giải thích là của **máy chủ** (`@baton/shared`), giao diện in nguyên văn.
 */
export interface CongTacThongBao {
  cong_tac: string;
  nhan: string;
  bat: boolean;
  /** `true` = không tắt được (tin bảo mật tài khoản). */
  khoa: boolean;
  ly_do_khoa: string | null;
}

export const layCaiDatThongBao = (): Promise<{ items: CongTacThongBao[] }> =>
  goiApi<{ items: CongTacThongBao[] }>('/v1/cai-dat/thong-bao');

/** `PUT /v1/cai-dat/thong-bao/<cong_tac>` — chỉ chủ; tắt tin bảo mật bị 403. */
export const datCongTacThongBao = (
  cong_tac: string,
  bat: boolean,
): Promise<{ cong_tac: string; bat: boolean }> =>
  goiApi<{ cong_tac: string; bat: boolean }>(
    `/v1/cai-dat/thong-bao/${encodeURIComponent(cong_tac)}`,
    { method: 'PUT', than: { bat } },
  );

/** `POST /v1/chu/doi-mat-khau` — chỉ từ phiên cookie (BAT-11). */
export const doiMatKhau = (than: {
  mat_khau_cu: string;
  ma_totp: string;
  mat_khau_moi: string;
}): Promise<KetQuaDoiMatKhau> =>
  goiApi<KetQuaDoiMatKhau>('/v1/chu/doi-mat-khau', { method: 'POST', than });
