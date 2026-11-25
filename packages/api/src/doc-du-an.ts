/**
 * Đường **ĐỌC** về dự án và agent — SPEC mục 2, 3, 13, 14.
 *
 * Lệnh đọc **không** qua cửa ghi (Durable Object): đi thẳng D1, để không nghẽn
 * mọi lượt đọc vào một đối tượng đơn luồng.
 *
 * Hai luật chi phối mọi truy vấn ở đây:
 *
 *  1. **Không lộ sự tồn tại.** Đối tượng ngoài phạm vi agent trả `NOT_FOUND`/404,
 *     không phải `FORBIDDEN`/403 — SPEC mục 13 ("404 … cũng dùng khi đối tượng
 *     ngoài phạm vi, để không lộ sự tồn tại") và nghiệm thu 17.7 ("Token agent
 *     không có quyền dự án `INC` đọc ticket INC: `NOT_FOUND`"). Điều kiện phạm vi
 *     nằm **trong câu SQL**, không phải một lần `if` sau khi đã đọc: như vậy
 *     không có đường nào trả về dòng mà agent không được thấy.
 *
 *  2. **Phân trang keyset, không `OFFSET`.** Mốc 200 dự án + 200.000 ticket
 *     (`decisions.md` 01/10). Thứ tự chuẩn là `(ten, id)` — có `id` nên là thứ
 *     tự **toàn phần**, hai dự án trùng tên vẫn có thứ tự xác định và cursor
 *     không bỏ sót, không trả trùng.
 */

import {
  BatonError,
  goiCursor,
  kiemLimit,
  moCursor,
  nhan,
  trangThaiAgentTuPhien,
  trangThaiWip,
  type AiGoi,
  type DatBoi,
  type SucSong,
  type TacGia,
  type TrangThaiWip,
  type TiLeDatLanDau,
  type TrangKetQua,
  type TrangThaiAgent,
  type TrangThaiPhien,
  type YeuCauTrang,
} from '@baton/shared';
import { tiLeDatLanDauCuaAgent, veNguoiDangCamLa, type AiCam } from './doc-luot-giao.js';
import { SO_LIEU_RONG, soLieuDuAn, type SoLieuDuAn } from './doc-suc-song.js';
import { phienCuaAgent, trangThaiPhienTheoAgent, type PhienRa } from './doc-phien.js';
import { TRUONG_DAT_BOI, demDangDay, gioiHanWip } from './lenh-du-an.js';

/* ------------------------------------------------------------------ *
 * Mảnh SQL dùng chung: "dự án agent được thấy"
 * ------------------------------------------------------------------ */

/**
 * Điều kiện phạm vi dự án, ghép thẳng vào `WHERE`.
 *
 * Chủ thấy mọi dự án. Agent có cờ "tất cả" (SPEC mục 3) cũng vậy. Agent còn lại
 * chỉ thấy dự án có trong `agent_project`.
 *
 * Trả về cả mảnh SQL và tham số, để chỗ gọi không bao giờ ghép chuỗi có dữ liệu.
 */
function loc_pham_vi_du_an(ai: AiGoi, cot_project_id: string): { sql: string; bind: string[] } {
  if (ai.loai === 'chu' || ai.vao_tat_ca_du_an) return { sql: '', bind: [] };
  return {
    sql: ` AND ${cot_project_id} IN (SELECT project_id FROM agent_project WHERE agent_id = ?)`,
    bind: [ai.agent_id],
  };
}

/* ------------------------------------------------------------------ *
 * Dự án
 * ------------------------------------------------------------------ */

export interface DuAnRa {
  id: string;
  ma: string;
  ten: string;
  mo_ta: string | null;
  mau: string | null;
  trang_thai: string;
  nhan_trang_thai: string;
  quan_ly_agent_id: string | null;
  nhom: string | null;
  khong_code: boolean;
  bat_buoc_review: boolean;
  /**
   * Ngưỡng đứng **riêng của dự án** — SPEC mục 6 d.189. `null` = không đặt riêng.
   * Phải đọc lại được: chủ đặt một giá trị rồi không xem lại được là một cấu hình
   * chỉ ghi, không ai kiểm chứng được. Ngưỡng **đang áp** cho một phiên cụ thể
   * nằm ở `PhienRa.nguong_dung_phut`.
   */
  nguong_dung_phut: number | null;
  /** Ưu tiên dự án 1–5 (5 = quan trọng nhất), mặc định 3 — SPEC 20.1. */
  uu_tien: number;
  /** Dự án "đang đẩy mạnh" — SPEC 20.1. */
  dang_day: boolean;
  /** Việc duy trì dài hạn (PARA "Area") — SPEC 20.1. */
  duy_tri: boolean;
  /** Tên ngắn; `null` = dùng tên đầy đủ — SPEC 20.1. */
  ten_ngan: string | null;
  /**
   * **Chỉ báo sức sống** — SPEC mục 2 d.71–74, "hiện ở sidebar và Tổng quan".
   *
   * Tính ở **đường API**, không ở giao diện: nó cần trạng thái phiên đã dẫn xuất
   * của mọi ticket Đang làm trong dự án, tức một luật nghiệp vụ có ngưỡng đứng —
   * để giao diện tự ghép thì web, CLI và MCP mỗi bên một bản. Luật nằm ở hàm
   * thuần `sucSongDuAn`; nguồn dữ liệu ở `doc-suc-song.ts`.
   */
  suc_song: SucSong;
  tao_luc: number;
  cap_nhat_luc: number;
}

interface DongDuAn {
  id: string;
  ma: string;
  ten: string;
  mo_ta: string | null;
  mau: string | null;
  trang_thai: string;
  quan_ly_agent_id: string | null;
  nhom: string | null;
  khong_code: number;
  bat_buoc_review: number;
  nguong_dung_phut: number | null;
  uu_tien: number;
  dang_day: number;
  duy_tri: number;
  ten_ngan: string | null;
  tao_luc: number;
  cap_nhat_luc: number;
}

const COT_DU_AN = `id, ma, ten, mo_ta, mau, trang_thai, quan_ly_agent_id, nhom,
                   khong_code, bat_buoc_review, nguong_dung_phut,
                   uu_tien, dang_day, duy_tri, ten_ngan, tao_luc, cap_nhat_luc`;

function raDuAn(d: DongDuAn, suc_song: SucSong): DuAnRa {
  return {
    suc_song,
    id: d.id,
    ma: d.ma,
    ten: d.ten,
    mo_ta: d.mo_ta,
    mau: d.mau,
    trang_thai: d.trang_thai,
    // Mã máy tiếng Anh + nhãn tiếng Việt kèm theo — SPEC mục 0.1.
    nhan_trang_thai: nhan('trang_thai_du_an', d.trang_thai),
    quan_ly_agent_id: d.quan_ly_agent_id,
    nhom: d.nhom,
    khong_code: d.khong_code === 1,
    bat_buoc_review: d.bat_buoc_review === 1,
    nguong_dung_phut: d.nguong_dung_phut,
    uu_tien: d.uu_tien,
    dang_day: d.dang_day === 1,
    duy_tri: d.duy_tri === 1,
    ten_ngan: d.ten_ngan,
    tao_luc: d.tao_luc,
    cap_nhat_luc: d.cap_nhat_luc,
  };
}

/* ------------------------------------------------------------------ *
 * Lịch sử trường dự án và Cài đặt workspace — SPEC 20.1 (migration 0029)
 * ------------------------------------------------------------------ */

export interface DongLichSuDuAnRa {
  id: string;
  tac_gia: TacGia;
  luc: number;
  truong: string;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
}

/**
 * Lịch sử các trường Bản đồ (và `nhom`) của **một** dự án, mới nhất trước,
 * keyset `(luc DESC, id DESC)` trên `ix_project_history_du_an`. Phạm vi kiểm bằng
 * `layDuAn` **trước** (ngoài phạm vi ⇒ `NOT_FOUND`, không lộ sự tồn tại).
 */
export async function lichSuDuAn(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  project_id: string,
  yeu_cau: YeuCauTrang = {},
): Promise<TrangKetQua<DongLichSuDuAnRa>> {
  await layDuAn(db, ai, workspace_id, project_id);
  return await trangLichSu(db, workspace_id, project_id, yeu_cau);
}

/**
 * Lịch sử **giới hạn WIP** của workspace — `GET /v1/cai-dat/workspace/lich-su`,
 * **chỉ chủ** (cùng cổng `docCaiDatWorkspace`; agent ⇒ `FORBIDDEN`). Dòng là các
 * dòng `project_history` có `project_id` NULL (0029: cài đặt workspace ghi cùng
 * bảng). Mới nhất trước, keyset `(luc DESC, id DESC)`.
 */
export async function lichSuCaiDatWorkspace(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauTrang = {},
): Promise<TrangKetQua<DongLichSuDuAnRa>> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: 'Chỉ chủ xem được lịch sử cài đặt workspace.' });
  }
  return await trangLichSu(db, workspace_id, null, yeu_cau);
}

/** Một trang `project_history` của một dự án, hoặc của workspace (`project_id` NULL). */
async function trangLichSu(
  db: D1Database,
  workspace_id: string,
  project_id: string | null,
  yeu_cau: YeuCauTrang,
): Promise<TrangKetQua<DongLichSuDuAnRa>> {
  const limit = kiemLimit(yeu_cau.limit);
  // `IS ?` khớp cả NULL (dòng cấp workspace) lẫn một id — SQLite so `IS` như `=` cho giá trị khác NULL.
  const dieu_kien = ['project_id IS ?', 'workspace_id = ?'];
  const bind: (string | number | null)[] = [project_id, workspace_id];
  if (yeu_cau.cursor !== undefined) {
    const [luc, id] = moCursor(yeu_cau.cursor, 2);
    dieu_kien.push('(luc, id) < (?, ?)');
    bind.push(Number(luc), String(id));
  }
  const { results } = await db
    .prepare(
      `SELECT id, tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi
         FROM project_history WHERE ${dieu_kien.join(' AND ')}
        ORDER BY luc DESC, id DESC LIMIT ?`,
    )
    .bind(...bind, limit + 1)
    .all<{
      id: string;
      tac_gia_loai: string;
      tac_gia_agent_id: string | null;
      luc: number;
      truong: string;
      gia_tri_cu: string | null;
      gia_tri_moi: string | null;
    }>();
  return dungTrang(
    results,
    limit,
    (d) => ({
      id: d.id,
      tac_gia:
        d.tac_gia_loai === 'agent' && d.tac_gia_agent_id !== null
          ? { loai: 'agent', agentId: d.tac_gia_agent_id }
          : { loai: d.tac_gia_loai as TacGia['loai'] },
      luc: d.luc,
      truong: d.truong,
      gia_tri_cu: d.gia_tri_cu,
      gia_tri_moi: d.gia_tri_moi,
    }),
    (d) => [d.luc, d.id],
  );
}

export interface CaiDatWorkspaceRa {
  /** Giới hạn WIP 1–10 (mặc định 3) — SPEC 20.1. */
  gioi_han_wip: number;
  /** Đồng hồ WIP "Đang đẩy n/<giới hạn>" (20.2), dự án lưu trữ không đếm. */
  wip: TrangThaiWip;
}

/**
 * `GET /v1/cai-dat/workspace` — **chỉ chủ** (20.1 "Cài đặt workspace … chủ";
 * agent ⇒ `FORBIDDEN`, cùng nếp `docCaiDatThongBao`). Agent biết đồng hồ WIP qua
 * kết quả của lệnh bật `dang_day`.
 */
export async function docCaiDatWorkspace(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
): Promise<CaiDatWorkspaceRa> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: 'Chỉ chủ xem được cài đặt workspace.' });
  }
  const gioi_han = await gioiHanWip(db, workspace_id);
  return { gioi_han_wip: gioi_han, wip: trangThaiWip(await demDangDay(db, workspace_id), gioi_han) };
}

/**
 * Một dự án. Ngoài phạm vi agent → `NOT_FOUND` (SPEC mục 13, 17.7).
 *
 * Phạm vi nằm trong `WHERE`, nên "không có dự án này" và "có nhưng anh không
 * được vào" ra **cùng một** kết quả rỗng: không có cách nào phân biệt từ ngoài.
 */
export async function layDuAn(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  project_id: string,
  bay_gio: number = Date.now(),
): Promise<DuAnRa> {
  const loc = loc_pham_vi_du_an(ai, 'id');
  const d = await db
    .prepare(
      `SELECT ${COT_DU_AN} FROM project
        WHERE workspace_id = ? AND id = ?${loc.sql}`,
    )
    .bind(workspace_id, project_id, ...loc.bind)
    .first<DongDuAn>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy dự án.' });

  // Sức sống đi qua **cùng một** nguồn với danh sách và với Tổng quan (d.71–74).
  const so_lieu = await soLieuDuAn(db, workspace_id, bay_gio);
  return raDuAn(d, (so_lieu.get(d.id) ?? SO_LIEU_RONG).suc_song);
}

/* ------------------------------------------------------------------ *
 * "Đặt bởi" — SPEC 20.8
 * ------------------------------------------------------------------ */

/**
 * Câu "**Đặt bởi**" (20.8): mỗi dự án lấy dòng `project_history` **mới nhất** trong
 * năm trường của thanh công cụ (`TRUONG_DAT_BOI`), kèm tên chủ (workspace) và tên
 * agent. Một câu cửa sổ cho **mọi** dự án (Tổng quan, không N+1) hoặc lọc một dự
 * án (chi tiết). Cùng `luc` ⇒ dòng chèn sau thắng (`rowid` — các dòng của một
 * lệnh chèn theo thứ tự, 0029 là bảng rowid).
 *
 * Bỏ dòng `system`: lệnh sửa dự án không ghi tác giả hệ thống, và "Đặt bởi" chỉ có
 * hai loại (chủ / agent).
 */
export function cauDatBoi(
  workspace_id: string,
  project_id: string | null = null,
): { sql: string; bind: (string | null)[] } {
  const truong = TRUONG_DAT_BOI.map((t) => `'${t}'`).join(', ');
  const loc_mot = project_id === null ? '' : ' AND h.project_id = ?';
  return {
    sql: `SELECT project_id, tac_gia_loai, ten, luc FROM (
            SELECT h.project_id AS project_id, h.tac_gia_loai AS tac_gia_loai, h.luc AS luc,
                   CASE WHEN h.tac_gia_loai = 'agent' THEN a.ten ELSE w.ten_chu END AS ten,
                   ROW_NUMBER() OVER (PARTITION BY h.project_id ORDER BY h.luc DESC, h.rowid DESC) AS hang
              FROM project_history h
              JOIN workspace w ON w.id = h.workspace_id
              LEFT JOIN agent a ON a.id = h.tac_gia_agent_id AND a.workspace_id = h.workspace_id
             WHERE h.workspace_id = ? AND h.project_id IS NOT NULL
               AND h.tac_gia_loai IN ('owner', 'agent')
               AND h.truong IN (${truong})${loc_mot}
          ) WHERE hang = 1`,
    bind: project_id === null ? [workspace_id] : [workspace_id, project_id],
  };
}

/** Chạy `cauDatBoi` ⇒ bản đồ `project_id → DatBoi`. */
export async function docDatBoi(
  db: D1Database,
  workspace_id: string,
  project_id: string | null = null,
): Promise<Map<string, DatBoi>> {
  const cau = cauDatBoi(workspace_id, project_id);
  const { results } = await db
    .prepare(cau.sql)
    .bind(...cau.bind)
    .all<{ project_id: string; tac_gia_loai: string; ten: string | null; luc: number }>();
  const ra = new Map<string, DatBoi>();
  for (const r of results) {
    ra.set(r.project_id, {
      loai: r.tac_gia_loai === 'agent' ? 'agent' : 'chu',
      ten: r.ten ?? '',
      luc: r.luc,
    });
  }
  return ra;
}

/** Chi tiết một dự án (`GET /v1/du-an/:id`) — `DuAnRa` + "Đặt bởi" (20.8). */
export interface DuAnChiTietRa extends DuAnRa {
  dat_boi: DatBoi | null;
  /** Mốc của máy chủ — giao diện đếm "5 phút trước" của "Đặt bởi" từ đây (d.412). */
  bay_gio: number;
}

export async function layDuAnChiTiet(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  project_id: string,
  bay_gio: number = Date.now(),
): Promise<DuAnChiTietRa> {
  // Phạm vi kiểm ở `layDuAn` **trước** (ngoài phạm vi ⇒ NOT_FOUND, không đọc lịch sử).
  const du_an = await layDuAn(db, ai, workspace_id, project_id, bay_gio);
  const dat_boi = await docDatBoi(db, workspace_id, du_an.id);
  return { ...du_an, dat_boi: dat_boi.get(du_an.id) ?? null, bay_gio };
}

export interface YeuCauLietKeDuAn extends YeuCauTrang {
  /** Lọc theo **một** trạng thái; để trống thì theo luật `gom_luu_tru` dưới đây. */
  trang_thai?: string | undefined;
  /**
   * Lấy cả dự án `archived`. **Mặc định là không.**
   *
   * SPEC mục 2 nói `archived` là "**ẩn** khỏi sidebar, chỉ đọc", nhưng không nói
   * rõ việc ẩn đó là của **API đọc** hay chỉ của UI. Chốt tạm: API ẩn mặc định
   * (`spec-questions.md` #17), vì nếu để UI tự lọc thì mọi client — web, CLI, MCP —
   * phải nhớ lọc, và `baton list` sẽ hiện dự án lưu trữ trong khi sidebar thì
   * không. Lọc ở API thì "ẩn" là một luật, không phải ba lần cài giống nhau.
   *
   * Đặt `trang_thai: 'archived'` vẫn lấy được đúng nhóm đó, nên không có dữ liệu
   * nào bị khoá khỏi tầm nhìn.
   */
  gom_luu_tru?: boolean | undefined;
}

/**
 * Liệt kê dự án, **phân trang keyset** theo `(ten, id)`.
 *
 * `(ten, id) > (?, ?)` là so **bộ giá trị** của SQLite: nó so theo thứ tự từ
 * điển trên cặp cột, và SQLite dùng được index `ix_project_ten` cho cả điều kiện
 * này lẫn `ORDER BY` (xem test `EXPLAIN QUERY PLAN`). Viết tay thành
 * `ten > ? OR (ten = ? AND id > ?)` thì SQLite thường không nhận ra là một dải
 * liên tục trong index và phải quét.
 *
 * Lấy `limit + 1` dòng để biết **có trang sau hay không** mà không cần `COUNT(*)`
 * (đếm toàn bộ bảng là đúng thứ phải tránh ở mốc 200.000 dòng).
 */
export async function lietKeDuAn(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauLietKeDuAn = {},
  bay_gio: number = Date.now(),
  /**
   * Số liệu dự án **tính sẵn**. Chỉ Tổng quan truyền vào: nó đã cần cả bốn con số
   * của d.317 cho chính danh sách này, nên tính lại ở đây là ba truy vấn lặp cho
   * cùng một kết quả. Để trống thì hàm tự tính (đường của sidebar và CLI).
   */
  so_lieu_san?: Map<string, SoLieuDuAn>,
): Promise<TrangKetQua<DuAnRa>> {
  const limit = kiemLimit(yeu_cau.limit);
  const loc = loc_pham_vi_du_an(ai, 'id');

  const dieu_kien: string[] = ['workspace_id = ?'];
  const bind: (string | number)[] = [workspace_id];

  if (yeu_cau.trang_thai !== undefined) {
    dieu_kien.push('trang_thai = ?');
    bind.push(yeu_cau.trang_thai);
  } else if (yeu_cau.gom_luu_tru !== true) {
    // `archived` ẩn khỏi danh sách mặc định — SPEC mục 2, xem `gom_luu_tru`.
    dieu_kien.push("trang_thai <> 'archived'");
  }

  if (yeu_cau.cursor !== undefined) {
    const [ten, id] = moCursor(yeu_cau.cursor, 2);
    dieu_kien.push('(ten, id) > (?, ?)');
    bind.push(ten!, id!);
  }

  const sql =
    `SELECT ${COT_DU_AN} FROM project WHERE ${dieu_kien.join(' AND ')}${loc.sql}` +
    ` ORDER BY ten, id LIMIT ?`;

  const { results } = await db
    .prepare(sql)
    .bind(...bind, ...loc.bind, limit + 1)
    .all<DongDuAn>();

  /*
   * **Sức sống của cả trang bằng BA truy vấn, không ba truy vấn cho mỗi hàng.**
   * Sidebar vẽ một chấm cho **từng** dự án (d.393), nên một lượt đọc cho mỗi
   * hàng là N+1 — đúng thứ mốc 200 dự án của `decisions.md` cấm. Xem đầu
   * `doc-suc-song.ts` cho lý lẽ của việc gom cả workspace.
   */
  const so_lieu = so_lieu_san ?? (await soLieuDuAn(db, workspace_id, bay_gio));

  return dungTrang(
    results,
    limit,
    (d) => raDuAn(d, (so_lieu.get(d.id) ?? SO_LIEU_RONG).suc_song),
    (d) => [d.ten, d.id],
  );
}

/* ------------------------------------------------------------------ *
 * Agent
 * ------------------------------------------------------------------ */

export interface AgentRa {
  id: string;
  ten: string;
  vai_tro: string;
  nhan_vai_tro: string;
  model: string | null;
  mo_ta: string | null;
  disabled: boolean;
  vao_tat_ca_du_an: boolean;
  /** Lần cuối lên tiếng — SPEC mục 3. */
  len_tieng_luc: number | null;
  /** Ngưỡng đứng **riêng của agent** — SPEC mục 6 d.189. `null` = không đặt riêng. */
  nguong_dung_phut: number | null;
  /** Trạng thái tự tính, suy ra từ phiên — SPEC mục 3 d.98–103, mục 6. */
  trang_thai: TrangThaiAgent;
  nhan_trang_thai: string;
  /** 4 ký tự cuối của token — SPEC mục 3. **Không bao giờ** có token thô. */
  token_bon_cuoi: string | null;
  token_tao_luc: number | null;
  token_thu_hoi_luc: number | null;
  tao_luc: number;
  cap_nhat_luc: number;
}

interface DongAgent {
  id: string;
  ten: string;
  vai_tro: string;
  model: string | null;
  mo_ta: string | null;
  disabled: number;
  vao_tat_ca_du_an: number;
  len_tieng_luc: number | null;
  nguong_dung_phut: number | null;
  token_bon_cuoi: string | null;
  token_tao_luc: number | null;
  token_thu_hoi_luc: number | null;
  tao_luc: number;
  cap_nhat_luc: number;
}

/**
 * Cột được trả ra cho agent. **`token_bam` không có trong danh sách này** — và
 * đó là chủ ý, không phải sơ suất: `SELECT *` sẽ kéo cả bản băm ra ngoài API
 * (SPEC mục 15 "không bao giờ trả ra API hay UI").
 */
const COT_AGENT = `id, ten, vai_tro, model, mo_ta, disabled, vao_tat_ca_du_an, len_tieng_luc,
                   nguong_dung_phut,
                   token_bon_cuoi, token_tao_luc, token_thu_hoi_luc, tao_luc, cap_nhat_luc`;

/**
 * **Trạng thái agent tự tính** — SPEC mục 3 d.98–103, suy ra **từ phiên** của
 * agent (mục 6).
 *
 * Luật nằm trong hàm thuần `trangThaiAgentTuPhien` của `@baton/shared`; đây chỉ
 * là chỗ gọi. Vào là trạng thái **đã dẫn xuất** của các phiên còn mở
 * (`trangThaiPhienTheoAgent` của `doc-phien.ts`): một phiên `running` quá ngưỡng
 * đã là `stalled`, một phiên `stopping` quá 10 phút đã là `closed`.
 */
export function trangThaiAgent(d: {
  disabled: boolean;
  trang_thai_phien?: readonly TrangThaiPhien[];
}): TrangThaiAgent {
  return trangThaiAgentTuPhien(d.disabled, d.trang_thai_phien ?? []);
}

function raAgent(d: DongAgent, trang_thai_phien: readonly TrangThaiPhien[] = []): AgentRa {
  const disabled = d.disabled === 1;
  const trang_thai = trangThaiAgent({ disabled, trang_thai_phien });
  return {
    id: d.id,
    ten: d.ten,
    vai_tro: d.vai_tro,
    nhan_vai_tro: nhan('vai_tro_agent', d.vai_tro),
    model: d.model,
    mo_ta: d.mo_ta,
    disabled,
    vao_tat_ca_du_an: d.vao_tat_ca_du_an === 1,
    len_tieng_luc: d.len_tieng_luc,
    nguong_dung_phut: d.nguong_dung_phut,
    trang_thai,
    nhan_trang_thai: nhan('trang_thai_agent', trang_thai),
    token_bon_cuoi: d.token_bon_cuoi,
    token_tao_luc: d.token_tao_luc,
    token_thu_hoi_luc: d.token_thu_hoi_luc,
    tao_luc: d.tao_luc,
    cap_nhat_luc: d.cap_nhat_luc,
  };
}

/**
 * Trang agent — SPEC mục 3 (thông tin + lần cuối lên tiếng).
 *
 * Phiên đang mở, lịch sử lượt giao, tỉ lệ nộp lại đạt review là **phần 2**; ở
 * đây chỉ để chỗ cắm (`AgentRa` thêm trường, không đổi đường API).
 *
 * Ai đọc được: chủ thấy mọi agent. Agent đọc được **chính mình** và các agent
 * dùng chung dự án với nó — SPEC mục 3 nói mục đích là "biết đội mình có ai", mà
 * mục 13 lại đòi không lộ thứ ngoài phạm vi; xem `spec-questions.md` #14.
 */
/**
 * Một agent, kèm **tỉ lệ đạt lần đầu** 30 ngày gần nhất — SPEC mục 3 ("trang
 * agent: … tỉ lệ nộp lại đạt review") + 19.5 (định nghĩa chính xác của tỉ lệ).
 *
 * `bay_gio` qua tham số, như mọi chỗ phụ thuộc thời gian trong dự án này: cửa sổ
 * 30 ngày của 19.5 phải test được bằng giờ tiêm vào.
 */
export async function layAgent(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  agent_id: string,
  bay_gio: number = Date.now(),
): Promise<
  AgentRa & {
    du_an_duoc_vao: string[];
    ti_le_dat_lan_dau: TiLeDatLanDau;
    /** "Trang agent: … **phiên đang mở**" — SPEC mục 3 d.104. */
    phien_dang_mo: PhienRa[];
  }
> {
  const loc = locPhamViAgent(ai);
  const d = await db
    .prepare(`SELECT ${COT_AGENT} FROM agent WHERE workspace_id = ? AND id = ?${loc.sql}`)
    .bind(workspace_id, agent_id, ...loc.bind)
    .first<DongAgent>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy agent.' });

  const { results } = await db
    .prepare('SELECT project_id FROM agent_project WHERE agent_id = ? ORDER BY project_id')
    .bind(agent_id)
    .all<{ project_id: string }>();

  // Trạng thái agent suy ra từ phiên — SPEC mục 3, mục 6.
  const tt_phien = await trangThaiPhienTheoAgent(db, workspace_id, [agent_id], bay_gio);

  return {
    ...raAgent(d, tt_phien.get(agent_id) ?? []),
    du_an_duoc_vao: results.map((r) => r.project_id),
    ti_le_dat_lan_dau: await tiLeDatLanDauCuaAgent(db, workspace_id, agent_id, bay_gio),
    phien_dang_mo: await phienCuaAgent(db, workspace_id, agent_id, bay_gio, true),
  };
}

/**
 * Điều kiện "agent nào được thấy" (xem `layAgent`).
 *
 * **Một định nghĩa** cho mọi chỗ: đọc (`layAgent`, `lietKeAgent`) và các cửa ghi
 * nhận một agent_id do người gọi gửi (`nguoiNhanBatBuoc` của lượt giao,
 * `kiemChiuTrachNhiem` của ticket — BAT-48). Đoạn SQL viết **cột trần** (`id`,
 * `vao_tat_ca_du_an`) của bảng `agent`, nên câu dùng nó phải `FROM agent`
 * **không alias** (hoặc alias mà không có bảng nào khác cùng tên cột ở mức đó).
 */
export function locPhamViAgent(ai: AiGoi): { sql: string; bind: string[] } {
  if (ai.loai === 'chu' || ai.vao_tat_ca_du_an) return { sql: '', bind: [] };
  return {
    sql:
      ` AND (id = ? OR id IN (
           SELECT ap.agent_id FROM agent_project ap
            WHERE ap.project_id IN (SELECT project_id FROM agent_project WHERE agent_id = ?)
         ) OR vao_tat_ca_du_an = 1)`,
    bind: [ai.agent_id, ai.agent_id],
  };
}

/** Liệt kê agent, **phân trang keyset** theo `(ten, id)` — cùng kiểu với dự án. */
export async function lietKeAgent(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauTrang = {},
  bay_gio: number = Date.now(),
): Promise<TrangKetQua<AgentRa>> {
  const limit = kiemLimit(yeu_cau.limit);
  const loc = locPhamViAgent(ai);

  const dieu_kien: string[] = ['workspace_id = ?'];
  const bind: (string | number)[] = [workspace_id];

  if (yeu_cau.cursor !== undefined) {
    const [ten, id] = moCursor(yeu_cau.cursor, 2);
    dieu_kien.push('(ten, id) > (?, ?)');
    bind.push(ten!, id!);
  }

  const sql =
    `SELECT ${COT_AGENT} FROM agent WHERE ${dieu_kien.join(' AND ')}${loc.sql}` +
    ` ORDER BY ten, id LIMIT ?`;

  const { results } = await db
    .prepare(sql)
    .bind(...bind, ...loc.bind, limit + 1)
    .all<DongAgent>();

  /*
   * Trạng thái agent của **cả trang** bằng một câu truy vấn (SPEC mục 3, mục 11
   * ý 3 "Đội agent: mỗi agent một thẻ: trạng thái…"). Một truy vấn cho mỗi hàng
   * là N+1 — mốc hiệu năng của 19.12 câu 1 áp cho Tổng quan, và Tổng quan vẽ
   * đúng danh sách này.
   */
  const tt_phien = await trangThaiPhienTheoAgent(
    db,
    workspace_id,
    results.map((d) => d.id),
    bay_gio,
  );

  return dungTrang(
    results,
    limit,
    (d) => raAgent(d, tt_phien.get(d.id) ?? []),
    (d) => [d.ten, d.id],
  );
}

/* ------------------------------------------------------------------ *
 * Câu lệnh danh sách ticket — dùng cho lượt 3
 * ------------------------------------------------------------------ */

/**
 * Vế phạm vi dự án của agent trên bảng `ticket` (một `?` = `agent_id`). Một chuỗi
 * cho danh sách ticket **và** lượt tìm Cmd/Ctrl+K (`doc-tim.ts`, BAT-34): hai bản
 * chép là hai luật phạm vi.
 */
export const VE_DU_AN_CUA_AGENT =
  'project_id IN (SELECT project_id FROM agent_project WHERE agent_id = ?)';

/**
 * Dựng câu lệnh **danh sách ticket** theo thứ tự chuẩn của SPEC:
 * `(hang_uu_tien ASC, tao_luc DESC, id DESC)` (`decisions.md` 01/10).
 *
 * Đặt ở đây, trong mã sản phẩm, thay vì để lượt 3 tự viết: test
 * `EXPLAIN QUERY PLAN` đo **chính hàm này**, nên không có chuyện test xanh trên
 * một chuỗi SQL viết trong test còn mã thật lại viết khác và quét bảng.
 *
 * Hai điểm dễ sai, đã cố định ở đây:
 *   * **Hướng `ORDER BY` khớp hướng index.** Lệch hướng thì SQLite vẫn khớp tiền
 *     tố index cho `WHERE` nhưng phải `USE TEMP B-TREE FOR ... ORDER BY`, tức
 *     sắp lại trong bộ nhớ — ở mốc 200.000 ticket là không chấp nhận được.
 *   * **Keyset hướng trộn** (`hang_uu_tien` tăng, `tao_luc`/`id` giảm) viết thành
 *     hai nhánh OR; một lần so bộ giá trị không diễn tả được hướng trộn.
 *
 * Lượt 3 bọc hàm này lại thành `lietKeTicket` (lọc theo nhãn, người cầm, cờ…).
 */
export function cauLenhDanhSachTicket(tham_so: {
  cot?: string;
  workspace_id: string;
  project_id?: string | undefined;
  trang_thai?: string | undefined;
  /**
   * Lọc theo ưu tiên. Lọc trên **`hang_uu_tien`**, không trên `uu_tien`: đó là
   * cột nằm trong mọi index danh sách, nên điều kiện `=` của nó là tiền tố index
   * và `ORDER BY` phía sau vẫn đi theo index (không `USE TEMP B-TREE`).
   */
  hang_uu_tien?: number | undefined;
  /** Lọc theo người chịu trách nhiệm là một agent (SPEC mục 14). */
  chiu_trach_nhiem_agent_id?: string | undefined;
  /** Lọc theo người chịu trách nhiệm là **chủ**. */
  chiu_trach_nhiem_chu?: boolean | undefined;
  /** Lọc theo **nhãn** (SPEC mục 14). */
  nhan?: string | undefined;
  /** Lọc "**có cờ**" (SPEC mục 14): mang ít nhất một cờ hệ thống. */
  co_co?: boolean | undefined;
  /**
   * Lọc "**người đang cầm**" — SPEC mục 14 d.396. Vế SQL do `veNguoiDangCamLa`
   * dựng (SPEC 19.1), không viết lại ở đây.
   */
  nguoi_dang_cam?: AiCam | undefined;
  /** Lọc "**cần Chủ**" (d.396): có ít nhất một mục Cần Chủ đang `open`. */
  can_chu?: boolean | undefined;
  /** Lọc "**xong không bằng chứng**" (d.396) — cờ của mục 7, 19.10. */
  xong_khong_bang_chung?: boolean | undefined;
  /** Chỉ dự án agent được vào; `undefined` = chủ hoặc agent "tất cả dự án". */
  chi_du_an_cua_agent?: string | undefined;
  /** Khoá keyset của trang trước: `[hang_uu_tien, tao_luc, id]`. */
  sau?: readonly [number, number, string] | undefined;
  limit: number;
}): { sql: string; bind: (string | number)[] } {
  const dieu_kien: string[] = ['workspace_id = ?', 'xoa_luc IS NULL'];
  const bind: (string | number)[] = [tham_so.workspace_id];

  if (tham_so.project_id !== undefined) {
    dieu_kien.push('project_id = ?');
    bind.push(tham_so.project_id);
  }
  if (tham_so.trang_thai !== undefined) {
    dieu_kien.push('trang_thai = ?');
    bind.push(tham_so.trang_thai);
  }
  if (tham_so.hang_uu_tien !== undefined) {
    dieu_kien.push('hang_uu_tien = ?');
    bind.push(tham_so.hang_uu_tien);
  }
  if (tham_so.chiu_trach_nhiem_agent_id !== undefined) {
    dieu_kien.push('chiu_trach_nhiem_agent_id = ?');
    bind.push(tham_so.chiu_trach_nhiem_agent_id);
  }
  if (tham_so.chiu_trach_nhiem_chu === true) {
    dieu_kien.push("chiu_trach_nhiem_loai = 'owner'");
  }
  if (tham_so.nhan !== undefined) {
    // `EXISTS` thay vì `JOIN`: join làm SQLite phải chọn bảng dẫn, và nếu nó chọn
    // `ticket_label` thì thứ tự `ORDER BY` của `ticket` không còn đi theo index.
    dieu_kien.push(
      'EXISTS (SELECT 1 FROM ticket_label tl WHERE tl.ticket_id = ticket.id AND tl.nhan = ?)',
    );
    bind.push(tham_so.nhan);
  }
  if (tham_so.co_co === true) {
    // Khớp đúng điều kiện của index riêng phần `ix_ticket_co_co` (migration 0003).
    dieu_kien.push(
      '(co_khong_ai_cam = 1 OR co_can_review_lai = 1' +
        ' OR co_xong_khong_bang_chung = 1 OR co_nhap_khong_bang_chung = 1)',
    );
  }
  if (tham_so.nguoi_dang_cam !== undefined) {
    const ve = veNguoiDangCamLa(tham_so.nguoi_dang_cam);
    dieu_kien.push(ve.sql);
    bind.push(...ve.bind);
  }
  if (tham_so.can_chu === true) {
    /*
     * "cần Chủ" của d.396 = ticket có mục Cần Chủ **đang Chờ**. Mục đã xử lý hoặc
     * đã bỏ qua không còn cần gì của chủ, nên `trang_thai = 'open'` — cùng điều
     * kiện mà huy hiệu d.248 đếm, không một định nghĩa thứ hai.
     */
    dieu_kien.push(
      `EXISTS (SELECT 1 FROM can_chu_ticket ctt
                 JOIN can_chu ct ON ct.id = ctt.can_chu_id AND ct.workspace_id = ctt.workspace_id
                WHERE ctt.workspace_id = ticket.workspace_id AND ctt.ticket_id = ticket.id
                  AND ct.trang_thai = 'open')`,
    );
  }
  if (tham_so.xong_khong_bang_chung === true) {
    dieu_kien.push('co_xong_khong_bang_chung = 1');
  }
  if (tham_so.chi_du_an_cua_agent !== undefined) {
    // Phạm vi nằm **trong câu SQL**: không có đường nào trả về ticket của dự án
    // agent không được vào (SPEC mục 13, 17.7 — `NOT_FOUND`, không `FORBIDDEN`).
    dieu_kien.push(VE_DU_AN_CUA_AGENT);
    bind.push(tham_so.chi_du_an_cua_agent);
  }
  if (tham_so.sau !== undefined) {
    const [hang, tao_luc, id] = tham_so.sau;
    dieu_kien.push('(hang_uu_tien > ? OR (hang_uu_tien = ? AND (tao_luc, id) < (?, ?)))');
    bind.push(hang, hang, tao_luc, id);
  }

  bind.push(tham_so.limit);
  return {
    sql:
      `SELECT ${tham_so.cot ?? 'id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien, tao_luc'}` +
      ` FROM ticket WHERE ${dieu_kien.join(' AND ')}` +

      ' ORDER BY hang_uu_tien, tao_luc DESC, id DESC LIMIT ?',
    bind,
  };
}

/* ------------------------------------------------------------------ *
 * Dựng một trang kết quả
 * ------------------------------------------------------------------ */

/**
 * Cắt dòng thứ `limit + 1` (chỉ dùng để biết "còn trang sau") và dựng cursor từ
 * **dòng cuối được trả về**.
 *
 * Hết dữ liệu thì `cursor_sau` là `null`, không phải cursor của dòng cuối: nếu
 * trả cursor thì vòng lặp cuộn của agent không có cách nào biết khi nào dừng.
 */
export function dungTrang<D, R>(
  dong: D[],
  limit: number,
  doi: (d: D) => R,
  khoa: (d: D) => (string | number)[],
): TrangKetQua<R> {
  const con_trang_sau = dong.length > limit;
  const lay = con_trang_sau ? dong.slice(0, limit) : dong;
  const cuoi = lay.at(-1);
  return {
    items: lay.map(doi),
    cursor_sau: con_trang_sau && cuoi !== undefined ? goiCursor(khoa(cuoi)) : null,
  };
}
