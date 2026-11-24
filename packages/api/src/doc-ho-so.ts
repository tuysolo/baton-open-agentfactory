/**
 * Đường **ĐỌC** hồ sơ dự án, Luật chung, và **trang Bản đồ** — SPEC mục 9
 * d.294–303, mục 14 d.392.
 *
 * | Vế SPEC | Hàm |
 * |---|---|
 * | d.296–300 các mục của hồ sơ, hai cờ | `layHoSo` |
 * | d.299 "Lỗi đã gặp" (chỉ thêm) | `layHoSo` → `loi_da_gap` |
 * | d.301 trang "Luật chung" của workspace | `layLuatChung` |
 * | d.302 **trang Bản đồ**: bảng mọi dự án | `manHinhBanDo` |
 * | d.303 lịch sử phiên bản | `layHoSo` → `lich_su_ban` |
 *
 * ## Bảng d.302 có đúng sáu cột mà SPEC kể
 *
 * "tên, agent quản lý, thư mục, số ticket Đang làm, chỉ báo sức sống, cập nhật
 * cuối". Năm trong sáu cột đã có nguồn: `project` (tên, agent quản lý, cập nhật
 * cuối), `doc-suc-song.ts` (số Đang làm, sức sống — **cùng** nguồn với sidebar
 * d.393 và Tổng quan d.317, không một bản tính thứ hai). Cột **thư mục** là cột
 * duy nhất cần hồ sơ, nên câu truy vấn `LEFT JOIN` hồ sơ — `LEFT`, vì rất nhiều
 * dự án chưa có hồ sơ nào và một `JOIN` thường sẽ làm chúng **biến khỏi bản đồ**.
 *
 * ## Dự án lưu trữ CÓ trên Bản đồ
 *
 * d.302 nói "bảng **mọi** dự án". Mục 2 nói `archived` "ẩn khỏi **sidebar**" —
 * một câu về sidebar, không về bản đồ; và 19.12 câu 27 chốt rằng đường đọc
 * **danh sách** ẩn `archived` mặc định nhưng "không dữ liệu nào bị khoá tầm
 * nhìn". Bản đồ là trang để thấy toàn cảnh, nên nó gọi `lietKeDuAn` với
 * `gom_luu_tru: true` — nếu không, một dự án lưu trữ sẽ không có đường nào để
 * xem hồ sơ của nó nữa.
 */

import {
  BatonError,
  type AiGoi,
  type DatBoi,
  type SucSong,
} from '@baton/shared';
import { MUC_HO_SO, type MucHoSo } from './lenh-ho-so.js';
import { docDatBoi, layDuAn, lietKeDuAn, type DuAnRa } from './doc-du-an.js';
import { SO_LIEU_RONG, soLieuDuAn } from './doc-suc-song.js';

export const CAU_CHI_CHU_BAN_DO = 'Màn hình này chỉ dành cho chủ.';

/* ------------------------------------------------------------------ *
 * Hồ sơ của một dự án
 * ------------------------------------------------------------------ */

/** Một mục "Lỗi đã gặp" — d.299 (ngày, lỗi, cách tránh). */
export interface LoiDaGapRa {
  id: string;
  ngay: string;
  loi: string;
  cach_tranh: string | null;
  ghi_boi_loai: string;
  ghi_boi_agent_id: string | null;
  tao_luc: number;
}

/** Một phiên bản cũ của hồ sơ — d.303. */
export interface BanHoSoRa {
  id: string;
  phien_ban: number;
  luc: number;
  sua_boi_loai: string;
  sua_boi_agent_id: string | null;
  /** Nội dung **của bản cũ**, đã mở từ JSON. */
  muc: Record<string, string | null>;
}

export interface HoSoRa extends Record<MucHoSo, string | null> {
  project_id: string;
  /**
   * Mốc mà **mọi** dẫn xuất thời gian của thân này được đọc tại — d.412.
   *
   * Giao diện đếm "3 phút trước" từ mốc **của máy chủ**, không từ `Date.now()`
   * của trình duyệt: đồng hồ máy chủ và máy chủ lệch nhau vài giây là đủ để một
   * mục vừa ghi hiện thành "trong 2 giây nữa".
   */
  bay_gio: number;
  /** `0` = **chưa có hồ sơ nào** (khác "hồ sơ rỗng"), xem `layHoSo`. */
  phien_ban: number;
  cap_nhat_luc: number | null;
  /** Hai cờ của d.300 — nguồn là `project`, **không** nhân bản ở bảng hồ sơ. */
  khong_code: boolean;
  bat_buoc_review: boolean;
  /**
   * Tên và mã dự án, để trang hồ sơ không phải gọi thêm một đường.
   *
   * `quan_ly_agent_ten` là **một cái tên đọc được** — cùng vế mà d.302 gọi là
   * "agent quản lý" trên Bản đồ. Hai trang nói hai thứ khác nhau (một trang id,
   * một trang tên) về cùng một agent là một trang nói sai.
   */
  du_an: {
    id: string;
    ma: string;
    ten: string;
    quan_ly_agent_id: string | null;
    quan_ly_agent_ten: string | null;
    /*
     * Thanh công cụ ở **đầu trang dự án** (20.8): ưu tiên, ô Trạng thái (suy từ
     * `trang_thai` + `dang_day` + `duy_tri`), nhóm, và "Đặt bởi".
     */
    trang_thai: string;
    uu_tien: number;
    dang_day: boolean;
    duy_tri: boolean;
    nhom: string | null;
    dat_boi: DatBoi | null;
  };
  loi_da_gap: LoiDaGapRa[];
  lich_su_ban: BanHoSoRa[];
}

/** Trần dòng của hai danh sách con. Cả hai là sổ đọc, không phải dòng thời gian. */
export const TRAN_LOI_DA_GAP = 200;
export const TRAN_BAN_HO_SO = 50;

/**
 * Hồ sơ của một dự án — một lượt gọi cho cả d.296–300, d.299 và d.303.
 *
 * **Phạm vi đi qua `layDuAn`**, không một điều kiện thứ hai: dự án ngoài phạm vi
 * agent đã ném `NOT_FOUND` ở đó (mục 13, 17.7), nên không có đường nào trả hồ sơ
 * của một dự án mà người gọi không được thấy.
 *
 * **Chưa có hồ sơ ⇒ `phien_ban: 0` và mọi mục `null`**, không phải `NOT_FOUND`:
 * mục 9 nói mỗi dự án **có** một trang hồ sơ, nên một dự án chưa soạn hồ sơ phải
 * mở ra được một trang trống để chủ bắt đầu điền — một 404 ở đó là một trang
 * chủ không vào được để tạo nội dung.
 */
export async function layHoSo(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  project_id: string,
  bay_gio: number = Date.now(),
): Promise<HoSoRa> {
  const du_an = await layDuAn(db, ai, workspace_id, project_id, bay_gio);

  const cot = MUC_HO_SO.join(', ');
  const [ho_so, loi, ban, quan_ly, dat_boi] = await Promise.all([
    db
      .prepare(
        `SELECT ${cot}, phien_ban, cap_nhat_luc
           FROM project_ho_so WHERE project_id = ? AND workspace_id = ?`,
      )
      .bind(project_id, workspace_id)
      .first<Record<string, string | number | null>>(),
    db
      .prepare(
        `SELECT id, ngay, loi, cach_tranh, ghi_boi_loai, ghi_boi_agent_id, tao_luc
           FROM project_loi_da_gap
          WHERE workspace_id = ? AND project_id = ?
          ORDER BY tao_luc DESC, id DESC LIMIT ?`,
      )
      .bind(workspace_id, project_id, TRAN_LOI_DA_GAP)
      .all<LoiDaGapRa>(),
    db
      .prepare(
        `SELECT id, phien_ban, anh_json, sua_boi_loai, sua_boi_agent_id, luc
           FROM project_ho_so_ban
          WHERE workspace_id = ? AND project_id = ?
          ORDER BY phien_ban DESC LIMIT ?`,
      )
      .bind(workspace_id, project_id, TRAN_BAN_HO_SO)
      .all<{
        id: string;
        phien_ban: number;
        anh_json: string;
        sua_boi_loai: string;
        sua_boi_agent_id: string | null;
        luc: number;
      }>(),
    /*
     * Tên agent quản lý. `workspace_id` ràng ở đây **cũng** cần, dù
     * `project.quan_ly_agent_id` đã là agent cùng workspace: một đường đọc không
     * ràng workspace là một đường chờ bug của tầng trên (nếp mục 1, mục 18).
     */
    du_an.quan_ly_agent_id === null
      ? Promise.resolve(null)
      : db
          .prepare('SELECT ten FROM agent WHERE id = ? AND workspace_id = ?')
          .bind(du_an.quan_ly_agent_id, workspace_id)
          .first<{ ten: string }>(),
    docDatBoi(db, workspace_id, du_an.id),
  ]);

  const muc = {} as Record<MucHoSo, string | null>;
  for (const m of MUC_HO_SO) {
    const v = ho_so?.[m];
    muc[m] = typeof v === 'string' ? v : null;
  }

  return {
    ...muc,
    project_id,
    bay_gio,
    phien_ban: typeof ho_so?.['phien_ban'] === 'number' ? ho_so['phien_ban'] : 0,
    cap_nhat_luc: typeof ho_so?.['cap_nhat_luc'] === 'number' ? ho_so['cap_nhat_luc'] : null,
    khong_code: du_an.khong_code,
    bat_buoc_review: du_an.bat_buoc_review,
    du_an: {
      id: du_an.id,
      ma: du_an.ma,
      ten: du_an.ten,
      quan_ly_agent_id: du_an.quan_ly_agent_id,
      quan_ly_agent_ten: quan_ly?.ten ?? null,
      trang_thai: du_an.trang_thai,
      uu_tien: du_an.uu_tien,
      dang_day: du_an.dang_day,
      duy_tri: du_an.duy_tri,
      nhom: du_an.nhom,
      dat_boi: dat_boi.get(du_an.id) ?? null,
    },
    loi_da_gap: loi.results,
    lich_su_ban: ban.results.map((b) => ({
      id: b.id,
      phien_ban: b.phien_ban,
      luc: b.luc,
      sua_boi_loai: b.sua_boi_loai,
      sua_boi_agent_id: b.sua_boi_agent_id,
      muc: docAnh(b.anh_json),
    })),
  };
}

/**
 * Mở ảnh chụp JSON của một phiên bản cũ.
 *
 * **Dữ liệu hỏng ⇒ object rỗng, không ném.** Một hàng lịch sử lỗi JSON (bản API
 * cũ, một lần nhập dữ liệu) không được làm **cả trang hồ sơ** 500: trang đó là
 * thứ agent đọc trước khi làm việc.
 */
function docAnh(van: string): Record<string, string | null> {
  try {
    const doc: unknown = JSON.parse(van);
    if (typeof doc !== 'object' || doc === null) return {};
    const ra: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
      ra[k] = typeof v === 'string' ? v : null;
    }
    return ra;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Luật chung của workspace — d.301
 * ------------------------------------------------------------------ */

export interface LuatChungRa {
  danh_sach_cam: string | null;
  checklist: string | null;
  cap_nhat_luc: number | null;
}

/**
 * Trang "Luật chung" — d.301, **agent đọc được** ("Agent đọc được qua CLI hoặc
 * MCP"), nên hàm này **không** có cổng "chỉ chủ".
 *
 * Chưa soạn ⇒ ba trường `null`, không `NOT_FOUND`: cùng lý lẽ với hồ sơ chưa có.
 */
export async function layLuatChung(
  db: D1Database,
  workspace_id: string,
): Promise<LuatChungRa> {
  const d = await db
    .prepare(
      'SELECT danh_sach_cam, checklist, cap_nhat_luc FROM luat_chung WHERE workspace_id = ?',
    )
    .bind(workspace_id)
    .first<LuatChungRa>();
  return d ?? { danh_sach_cam: null, checklist: null, cap_nhat_luc: null };
}

/* ------------------------------------------------------------------ *
 * Trang Bản đồ — d.302
 * ------------------------------------------------------------------ */

/** Một hàng của bảng d.302 — **đúng sáu cột** SPEC kể, cộng mã để vẽ link. */
export interface HangBanDo {
  id: string;
  ma: string;
  ten: string;
  nhom: string | null;
  trang_thai: string;
  nhan_trang_thai: string;
  quan_ly_agent_id: string | null;
  /** Tên agent quản lý — d.302 kể "agent quản lý", tức một cái tên đọc được. */
  quan_ly_agent_ten: string | null;
  /** Cột duy nhất cần hồ sơ (d.297). `null` = chưa soạn. */
  thu_muc: string | null;
  so_dang_lam: number;
  suc_song: SucSong;
  /** "cập nhật cuối" của d.302 — mốc **muộn hơn** giữa dự án và hồ sơ của nó. */
  cap_nhat_luc: number;
  /** Hai cờ của d.300 — chủ thấy ngay dự án nào "không code". */
  khong_code: boolean;
  bat_buoc_review: boolean;
  /** Dự án đã có hồ sơ chưa (d.294: agent mới chỉ cần đọc trang này). */
  co_ho_so: boolean;
  /**
   * Bốn trường của SPEC 20.1 — mục 9 (sửa 04/11) thêm cột Ưu tiên, Đang đẩy, Duy
   * trì cho trang này; lượt 1 chỉ trả dữ liệu, giao diện là lượt 2.
   */
  uu_tien: number;
  dang_day: boolean;
  duy_tri: boolean;
  ten_ngan: string | null;
}

export interface ManHinhBanDoRa {
  /** Mốc mà **mọi** dẫn xuất của thân này được tính tại — d.412. */
  bay_gio: number;
  du_an: HangBanDo[];
  /** d.301 — trang "Luật chung" nằm cùng màn hình Bản đồ. */
  luat_chung: LuatChungRa;
  /**
   * **Bao nhiêu dự án KHÔNG nằm trong `du_an` ở trên** — `0` là "đã đủ".
   *
   * d.302 nói "bảng **mọi** dự án", nhưng một lượt gọi vẫn phải có trần
   * (`TRAN_BAN_DO`). Trần mà **im lặng** là trần tệ nhất: dự án thứ 201 biến khỏi
   * bản đồ và không có gì trên màn hình nói rằng nó bị cắt. Nên con số bị cắt đi
   * ra cùng thân, và giao diện nói thẳng ra.
   */
  so_con_lai: number;
}

/**
 * Trần dòng của một lượt gọi Bản đồ.
 *
 * Phân trang đầy đủ cho d.302 là việc của lượt sau (một workspace 200 dự án là
 * một workspace rất khác workspace của chủ hôm nay); việc **bắt buộc** ở lượt này
 * là không để trần nào im lặng — xem `so_con_lai`.
 */
export const TRAN_BAN_DO = 200;

/**
 * **Trang Bản đồ** — d.302, một lượt gọi.
 *
 * Chỉ **chủ**: đây là giao diện web của chủ (mục 14). Agent đọc hồ sơ bằng
 * `baton profile` (`GET /v1/du-an/:id/ho-so`) và Luật chung bằng
 * `GET /v1/luat-chung` — hai đường **không** bị cổng này siết.
 */
export async function manHinhBanDo(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<ManHinhBanDoRa> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: CAU_CHI_CHU_BAN_DO });
  }

  const so_lieu = await soLieuDuAn(db, workspace_id, bay_gio);
  // `gom_luu_tru: true` — "bảng **mọi** dự án" của d.302; xem ghi chú đầu file.
  const trang = await lietKeDuAn(
    db,
    ai,
    workspace_id,
    { gom_luu_tru: true, limit: String(TRAN_BAN_DO) },
    bay_gio,
    so_lieu,
  );

  const [ho_so, agent, luat_chung, tong] = await Promise.all([
    /*
     * `workspace_id` ở hai câu dưới đây là **phòng sâu**, không phải vòng chắn
     * duy nhất — và một ca test **không bắt được** nếu nó bị bỏ. Lý do: cả hai
     * kết quả đi vào một `Map` khoá bằng `project_id` / `agent_id`, mà
     * `project.id` và `agent.id` là khoá chính **toàn cục**; nên một hàng của
     * workspace khác không bao giờ trùng khoá với một hàng của workspace này, và
     * nó rơi ra ở bước `.get()`.
     *
     * Giữ `WHERE` ở đây vì hai lẽ thật: nó chặn một lần đọc cả bảng của mọi
     * workspace (mục 18), và nó giữ đúng nếp "mọi câu đọc ràng workspace" để
     * không ai phải tự hỏi câu nào là ngoại lệ. Ghi rõ ra đây để lượt sau không
     * ai đi tìm một ca test canh nó — ca cần canh là ba ca ở
     * `test/ho-so-du-an.test.ts` mục 6, canh `lietKeDuAn`, `layHoSo` và
     * `layLuatChung`, là ba chỗ **thật sự** quyết định phạm vi.
     */
    db
      .prepare(
        'SELECT project_id, thu_muc, cap_nhat_luc FROM project_ho_so WHERE workspace_id = ?',
      )
      .bind(workspace_id)
      .all<{ project_id: string; thu_muc: string | null; cap_nhat_luc: number }>(),
    db
      .prepare('SELECT id, ten FROM agent WHERE workspace_id = ?')
      .bind(workspace_id)
      .all<{ id: string; ten: string }>(),
    layLuatChung(db, workspace_id),
    /*
     * Đếm **mọi** dự án của workspace, kể cả `archived` — cùng tập mà
     * `lietKeDuAn` lấy ở trên (`gom_luu_tru: true`), nên `so_con_lai` là một
     * hiệu đúng, không một con số lệch tập.
     */
    db
      .prepare('SELECT count(*) AS n FROM project WHERE workspace_id = ?')
      .bind(workspace_id)
      .first<{ n: number }>(),
  ]);

  const bang_ho_so = new Map(ho_so.results.map((h) => [h.project_id, h]));
  const ten_agent = new Map(agent.results.map((a) => [a.id, a.ten]));

  return {
    bay_gio,
    luat_chung,
    so_con_lai: Math.max(0, (tong?.n ?? 0) - trang.items.length),
    du_an: trang.items.map((d: DuAnRa): HangBanDo => {
      const h = bang_ho_so.get(d.id);
      return {
        id: d.id,
        ma: d.ma,
        ten: d.ten,
        nhom: d.nhom,
        trang_thai: d.trang_thai,
        nhan_trang_thai: d.nhan_trang_thai,
        quan_ly_agent_id: d.quan_ly_agent_id,
        quan_ly_agent_ten:
          d.quan_ly_agent_id === null ? null : (ten_agent.get(d.quan_ly_agent_id) ?? null),
        thu_muc: h?.thu_muc ?? null,
        so_dang_lam: (so_lieu.get(d.id) ?? SO_LIEU_RONG).so_dang_lam,
        suc_song: d.suc_song,
        /*
         * "**cập nhật cuối**" của d.302 là mốc muộn hơn giữa hai nguồn: sửa dự
         * án (tên, trạng thái) và sửa hồ sơ. Chỉ lấy `project.cap_nhat_luc` thì
         * một lần soạn lại cả hồ sơ không làm cột này nhích — tức cột nói sai
         * đúng điều nó tồn tại để nói.
         */
        cap_nhat_luc: Math.max(d.cap_nhat_luc, h?.cap_nhat_luc ?? 0),
        khong_code: d.khong_code,
        bat_buoc_review: d.bat_buoc_review,
        co_ho_so: h !== undefined,
        uu_tien: d.uu_tien,
        dang_day: d.dang_day,
        duy_tri: d.duy_tri,
        ten_ngan: d.ten_ngan,
      };
    }),
  };
}
