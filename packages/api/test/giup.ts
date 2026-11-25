/** Dữ liệu giả cho test. Không có dữ liệu thật, không gọi mạng. */

import { SELF, env } from 'cloudflare:test';
import {
  bamToken,
  bonKyTuCuoi,
  xacMinhBanDau,
  type AiGoi,
  type CongBangChung,
  type KetQuaCong,
  type LoaiBangChung,
  type VaiTroAgent,
  type XacMinhLuuDuoc,
} from '@baton/shared';
import { SO_DANG_KY_HANDLER, type Lenh, type LoaiLenh } from '../src/lenh.js';
import { nguonGiaLap, tiemNguonXacMinh } from '../src/xac-minh-bang-chung.js';
import {
  nguonTelegramGiaLap,
  tiemNguonTelegram,
  type CaiDatGiaLapTelegram,
  type NguonTelegramGiaLap,
} from '../src/nguon-telegram.js';

export const WS = 'ws-test';

/** Token chủ giả, khớp binding `TOKEN_CHU` trong `vitest.config.ts`. */
export const TOKEN_CHU = 'bt_test_token_chu_gia';

/** Chủ, dạng `AiGoi` — dùng cho lệnh gọi trực tiếp cửa ghi. */
export const CHU: AiGoi = { loai: 'chu' };

export async function dungWorkspace(ten_chu = 'Chủ'): Promise<string> {
  const t = Date.now();
  await env.DB.prepare(
    'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
  )
    .bind(WS, ten_chu, t, t)
    .run();
  return WS;
}

export async function dungDuAn(
  ma = 'SAI',
  ten = 'Sample',
  trang_thai = 'active',
  quan_ly_agent_id: string | null = null,
): Promise<string> {
  const t = Date.now();
  const id = `pj-${ma}`;
  await env.DB.prepare(
    `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, quan_ly_agent_id, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, WS, ten, ma, trang_thai, quan_ly_agent_id, t, t)
    .run();
  return id;
}

export async function dungAgent(
  id = 'ag-1',
  ten = 'W-builder',
  vai_tro = 'worker',
): Promise<string> {
  const t = Date.now();
  await env.DB.prepare(
    `INSERT INTO agent (id, workspace_id, ten, vai_tro, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, WS, ten, vai_tro, t, t)
    .run();
  return id;
}

/**
 * Dựng một agent **có token dùng được qua HTTP**. Token là chuỗi giả do test
 * đặt, chỉ bản băm vào DB — đúng như đường thật (SPEC mục 3, 15).
 */
export async function dungAgentCoToken(opts: {
  id: string;
  ten: string;
  vai_tro: VaiTroAgent;
  token: string;
  disabled?: boolean;
  vao_tat_ca_du_an?: boolean;
  du_an?: string[];
}): Promise<string> {
  const t = Date.now();
  const bam = await bamToken(opts.token);
  await env.DB.prepare(
    `INSERT INTO agent
       (id, workspace_id, ten, vai_tro, disabled, vao_tat_ca_du_an,
        token_bam, token_bon_cuoi, token_tao_luc, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      opts.id,
      WS,
      opts.ten,
      opts.vai_tro,
      opts.disabled === true ? 1 : 0,
      opts.vao_tat_ca_du_an === true ? 1 : 0,
      bam,
      bonKyTuCuoi(opts.token),
      t,
      t,
      t,
    )
    .run();

  for (const project_id of opts.du_an ?? []) {
    await env.DB.prepare(
      'INSERT INTO agent_project (workspace_id, agent_id, project_id, tao_luc) VALUES (?, ?, ?, ?)',
    )
      .bind(WS, opts.id, project_id, t)
      .run();
  }
  return opts.id;
}

/**
 * Dựng một ticket trực tiếp trong DB.
 *
 * **Đẩy luôn `bo_dem` của dự án lên `so`.** Không làm vậy thì fixture để lại một
 * trạng thái không thể có trong đời thật: ticket số 1 đã tồn tại mà bộ đếm vẫn
 * 0, nên lệnh tạo ticket kế tiếp cấp lại số 1 và vỡ `ux_ticket_so`. Đời thật
 * không có trạng thái đó vì mọi ticket đều sinh qua cửa ghi, nơi cấp số và chèn
 * ticket nằm trong **cùng một batch**.
 */
export interface TuyChonDungTicket {
  trang_thai?: string;
  uu_tien?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  chu_tu_lam?: boolean;
  tao_luc?: number;
  trong_tay_tu_luc?: number | null;
  chiu_trach_nhiem_agent_id?: string | null;
}

const HANG: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export async function dungTicket(
  project_id: string,
  so: number,
  tieu_de = 'Việc giả để test',
  tuy_chon: TuyChonDungTicket = {},
): Promise<string> {
  const t = tuy_chon.tao_luc ?? Date.now();
  const id = `tk-${project_id}-${String(so)}`;
  const uu_tien = tuy_chon.uu_tien ?? 'none';
  const ctn = tuy_chon.chiu_trach_nhiem_agent_id ?? null;
  await env.DB.prepare(
    `INSERT INTO ticket
       (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
        chiu_trach_nhiem_loai, chiu_trach_nhiem_agent_id,
        chu_tu_lam, trong_tay_tu_luc, nguoi_tao_loai, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner', ?, ?)`,
  )
    .bind(
      id,
      WS,
      project_id,
      so,
      tieu_de,
      tuy_chon.trang_thai ?? 'todo',
      uu_tien,
      HANG[uu_tien]!,
      ctn === null ? 'owner' : 'agent',
      ctn,
      tuy_chon.chu_tu_lam === true ? 1 : 0,
      tuy_chon.trong_tay_tu_luc ?? null,
      t,
      t,
    )
    .run();

  // Bộ đếm chỉ tăng (trigger `tg_bo_dem_chi_tang`), nên dùng `max`.
  await env.DB.prepare(
    `INSERT INTO bo_dem (workspace_id, pham_vi, khoa, gia_tri) VALUES (?, 'project', ?, ?)
     ON CONFLICT (workspace_id, pham_vi, khoa)
       DO UPDATE SET gia_tri = max(gia_tri, excluded.gia_tri)`,
  )
    .bind(WS, project_id, so)
    .run();
  return id;
}

/**
 * Một **workspace khác** với một dự án và một ticket trong đó.
 *
 * Dùng để kiểm những luật có chữ "cùng workspace" (SPEC mục 1: dữ liệu tách theo
 * workspace từ đầu) — ví dụ "ticket gốc để đánh Trùng phải cùng workspace". Không
 * có workspace thứ hai thì luật đó không có cách nào đỏ.
 *
 * Trả `id` của ticket ở workspace kia.
 */
/*
 * Id **sắp sau** `ws-test`: `workspaceDuyNhat` (đường tạm của chủ ở phần 1) lấy
 * `ORDER BY id LIMIT 1`, nên một workspace có id nhỏ hơn sẽ âm thầm chiếm chỗ
 * workspace của test.
 */
export const WS_KHAC = 'ws-zz-khac';

export async function dungTicketWorkspaceKhac(): Promise<string> {
  const t = Date.now();
  await env.DB.prepare(
    'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
  )
    .bind(WS_KHAC, 'Người khác', t, t)
    .run();
  await env.DB.prepare(
    `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  )
    .bind('pj-khac', WS_KHAC, 'Dự án của người khác', 'OTH', t, t)
    .run();
  const id = 'tk-khac-1';
  await env.DB.prepare(
    `INSERT INTO ticket
       (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
        chiu_trach_nhiem_loai, nguoi_tao_loai, tao_luc, cap_nhat_luc)
     VALUES (?, ?, 'pj-khac', 1, 'Việc của workspace khác', 'todo', 'none', 4,
             'owner', 'owner', ?, ?)`,
  )
    .bind(id, WS_KHAC, t, t)
    .run();
  return id;
}

/**
 * **Xoá mềm** một ticket trực tiếp trong DB (fixture) — SPEC mục 4 (khôi phục
 * trong 30 ngày).
 *
 * Đặt cột thẳng chứ không gọi `POST /v1/ticket/:id/xoa`: đường thật đòi quyền
 * của **chủ**, còn ca cần nó là một ca của CLI chạy bằng token **agent** — mục
 * đích là dựng *trạng thái* "đã xoá mềm", không phải kiểm lệnh xoá.
 */
export async function xoaMemTicket(ticket_id: string, xoa_luc = Date.now()): Promise<void> {
  await env.DB.prepare('UPDATE ticket SET xoa_luc = ? WHERE id = ? AND workspace_id = ?')
    .bind(xoa_luc, ticket_id, WS)
    .run();
}

/** Nối hai ticket trực tiếp trong DB (dùng cho fixture). */
export async function dungLienKet(
  tu_ticket_id: string,
  den_ticket_id: string,
  loai: 'parent' | 'related' | 'blocks' | 'dieu_phoi',
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(WS, tu_ticket_id, den_ticket_id, loai, Date.now())
    .run();
}

/**
 * Thêm một bình luận trực tiếp trong DB (fixture).
 *
 * `tac_gia_agent_id` để trống = bình luận **của chủ**. Dùng cho test hàng "Xoá
 * bất cứ thứ gì" của bảng quyền (SPEC mục 3): cần một bình luận có thật để lệnh
 * xoá đi tới được chặng kiểm quyền.
 */
export async function dungBinhLuan(
  id: string,
  ticket_id: string,
  noi_dung = 'Bình luận giả để test',
  tac_gia_agent_id: string | null = null,
  tao_luc?: number,
): Promise<string> {
  /*
   * `tao_luc` **nhận được từ ngoài**: mặc định `Date.now()` làm **mọi** bình luận
   * dựng trong một ca có **cùng** mốc, nên không ca nào phân biệt được "10 bình
   * luận cuối" của SPEC mục 13 d.372 — đột biến `ORDER BY tao_luc DESC` → `ASC`
   * không làm ca nào đỏ. Ca cần ghim thứ tự thì truyền mốc **tách nhau**.
   */
  const t = tao_luc ?? Date.now();
  await env.DB.prepare(
    `INSERT INTO comment
       (id, workspace_id, ticket_id, tac_gia_loai, tac_gia_agent_id, noi_dung, da_sua, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      id,
      WS,
      ticket_id,
      tac_gia_agent_id === null ? 'owner' : 'agent',
      tac_gia_agent_id,
      noi_dung,
      t,
      t,
    )
    .run();
  return id;
}

/**
 * Dựng một **lượt giao** trực tiếp trong DB (fixture) — SPEC mục 5.
 *
 * `so_luot` mặc định là số kế tiếp của ticket, như cửa ghi vẫn cấp (SPEC 19.5).
 * Người giao mặc định là **chủ**, để fixture không phải dựng thêm agent.
 */
export interface TuyChonDungLuotGiao {
  loai?: 'work' | 'review';
  trang_thai?: 'pending' | 'in_progress' | 'submitted' | 'accepted' | 'returned' | 'canceled';
  so_luot?: number;
  nguoi_giao_agent_id?: string | null;
  han_phan_hoi_luc?: number | null;
  ly_do?: string | null;
  tao_luc?: number;
  /**
   * Mốc người nhận **đã nhận** lượt (migration 0004) — mốc "đã cầm bao lâu" của
   * khối "Việc đang chạy" (SPEC mục 11 d.318).
   */
  nhan_luc?: number | null;
  /* Báo cáo nộp — migration 0005, SPEC mục 5. */
  ket_qua?: 'done' | 'partial' | 'blocked' | null;
  bc_viec_phat_sinh?: string | null;
  nop_luc?: number | null;
  muc_tieu?: string | null;
}

export async function dungLuotGiao(
  id: string,
  ticket_id: string,
  nguoi_nhan_agent_id: string,
  tuy_chon: TuyChonDungLuotGiao = {},
): Promise<string> {
  const t = tuy_chon.tao_luc ?? Date.now();
  const nguoi_giao = tuy_chon.nguoi_giao_agent_id ?? null;

  const ke_tiep = await env.DB.prepare(
    'SELECT coalesce(max(so_luot), 0) + 1 AS n FROM luot_giao WHERE ticket_id = ?',
  )
    .bind(ticket_id)
    .first<{ n: number }>();

  await env.DB.prepare(
    `INSERT INTO luot_giao
       (id, workspace_id, ticket_id, so_luot, loai,
        nguoi_giao_loai, nguoi_giao_agent_id, nguoi_nhan_agent_id, trang_thai,
        han_phan_hoi_luc, ly_do, muc_tieu,
        ket_qua, bc_viec_phat_sinh, nop_luc, nhan_luc, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      WS,
      ticket_id,
      tuy_chon.so_luot ?? ke_tiep?.n ?? 1,
      tuy_chon.loai ?? 'work',
      nguoi_giao === null ? 'owner' : 'agent',
      nguoi_giao,
      nguoi_nhan_agent_id,
      tuy_chon.trang_thai ?? 'pending',
      tuy_chon.han_phan_hoi_luc ?? null,
      tuy_chon.ly_do ?? null,
      tuy_chon.muc_tieu ?? null,
      tuy_chon.ket_qua ?? null,
      tuy_chon.bc_viec_phat_sinh ?? null,
      tuy_chon.nop_luc ?? null,
      tuy_chon.nhan_luc ?? null,
      t,
      t,
    )
    .run();
  return id;
}

/**
 * Dựng một **phiên** trực tiếp trong DB (fixture) — SPEC mục 6.
 *
 * `ticket_id` và `agent_id` phải khớp lượt giao (trigger `tg_phien_khop_luot_*`
 * của 0006), nên fixture lấy chúng **từ lượt** thay vì để người gọi nhập lại.
 */
export interface TuyChonDungPhien {
  trang_thai?:
    | 'running'
    | 'waiting_owner'
    | 'waiting_assigner'
    | 'stalled'
    | 'error'
    | 'stopping'
    | 'closed';
  tin_hieu_cuoi_luc?: number;
  stopping_luc?: number | null;
  can_chu_id?: string | null;
  mo_luc?: number;
  dong_luc?: number | null;
  ly_do_dong?: string | null;
}

/**
 * Dựng một **mục Cần Chủ** trực tiếp trong DB (fixture) — SPEC mục 8, migration
 * 0013.
 *
 * `project_id` để trống = **"Chung"** (`project_id IS NULL`) — 19.12 câu 4.
 *
 * `ma_so` mặc định là số kế tiếp của workspace, và fixture **đẩy luôn `bo_dem`**
 * lên số đó — cùng lý do `dungTicket` phải làm vậy: không đẩy thì fixture để lại
 * một trạng thái không thể có trong đời thật (mục `T-1` đã tồn tại mà bộ đếm vẫn
 * 0), nên lệnh tạo kế tiếp cấp lại `T-1` và vỡ `ux_can_chu_ma_so`.
 */
export interface TuyChonDungCanChu {
  ma_so?: number;
  tieu_de?: string;
  project_id?: string | null;
  muc?: 'urgent' | 'today' | 'later';
  loai?: 'decision' | 'run_command' | 'review' | 'fyi';
  trang_thai?: 'open' | 'resolved' | 'skipped';
  han_luc?: number | null;
  tao_luc?: number;
  tao_boi_agent_id?: string | null;
  /** Số lần đã mở lại — migration 0015, SPEC mục 8 d.246. */
  mo_lai_lan?: number;
}

export async function dungCanChu(id: string, tuy_chon: TuyChonDungCanChu = {}): Promise<string> {
  const t = tuy_chon.tao_luc ?? Date.now();
  const loai = tuy_chon.loai ?? 'fyi';
  const muc_gui = tuy_chon.muc ?? 'today';
  // CHECK của 0013: `fyi` không bao giờ mang 🔴 (19.8). Fixture tôn trọng luật
  // đó thay vì đi cửa hậu — ca "hạ mức" phải đi qua cửa ghi mới có nghĩa.
  const muc = loai === 'fyi' && muc_gui === 'urgent' ? 'today' : muc_gui;

  const ke_tiep = await env.DB.prepare(
    'SELECT coalesce(max(ma_so), 0) + 1 AS n FROM can_chu WHERE workspace_id = ?',
  )
    .bind(WS)
    .first<{ n: number }>();
  const ma_so = tuy_chon.ma_so ?? ke_tiep?.n ?? 1;

  /*
   * Trạng thái kết (`resolved` / `skipped`) kéo theo các cột của **0015**, và
   * cặp trigger `tg_can_chu_xu_ly_*` ép chúng khớp nhau: `resolved` ⇔ có
   * `ket_qua`, `skipped` ⇔ có `ly_do_bo_qua`, và `open` ⇔ `xu_ly_luc` rỗng.
   * Fixture **tôn trọng luật đó** thay vì đi cửa hậu — cùng lý lẽ đã dùng cho
   * "fyi không bao giờ mang 🔴" ở trên.
   *
   * Một mục `resolved` loại `decision` hoặc `review` còn phải có phương án đã
   * chọn / kết luận review, mà cả hai cần dữ liệu bảng con — nên fixture **chỉ**
   * dựng mục kết cho hai loại còn lại; một ca cần mục `decision` đã xử lý thì
   * phải đi **qua cửa ghi** (`POST /v1/can-chu/:id/xu-ly`), và đó là hướng đúng.
   */
  const trang_thai = tuy_chon.trang_thai ?? 'open';
  if (trang_thai === 'resolved' && (loai === 'decision' || loai === 'review')) {
    throw new Error(
      `fixture: mục ${loai} đã resolved phải đi qua cửa ghi (cần phương án / kết luận review).`,
    );
  }

  await env.DB.prepare(
    `INSERT INTO can_chu
       (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
        boi_canh, han_luc, ly_do_de_xuat, lenh, can_tty,
        trung_voi_can_chu_id, tao_luc, cap_nhat_luc, tao_boi_agent_id,
        ket_qua, ly_do_bo_qua, xu_ly_luc, mo_lai_lan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      WS,
      ma_so,
      tuy_chon.tieu_de ?? 'Mục Cần Chủ giả để test',
      tuy_chon.project_id ?? null,
      muc,
      loai,
      trang_thai,
      tuy_chon.han_luc ?? null,
      // CHECK của 0013: `decision` **phải** có lý do đề xuất, loại khác thì không.
      loai === 'decision' ? 'Vì nó rẻ nhất' : null,
      // CHECK của 0013: `run_command` **phải** có lệnh, loại khác thì không.
      loai === 'run_command' ? 'npm test' : null,
      t,
      t,
      tuy_chon.tao_boi_agent_id ?? null,
      trang_thai === 'resolved' ? 'đã xong (fixture)' : null,
      trang_thai === 'skipped' ? 'không còn cần (fixture)' : null,
      trang_thai === 'open' ? null : t,
      tuy_chon.mo_lai_lan ?? 0,
    )
    .run();

  // Bộ đếm chỉ tăng (`tg_bo_dem_chi_tang` của 0001), nên dùng `max`.
  await env.DB.prepare(
    `INSERT INTO bo_dem (workspace_id, pham_vi, khoa, gia_tri) VALUES (?, 'workspace', 'ask', ?)
     ON CONFLICT (workspace_id, pham_vi, khoa)
       DO UPDATE SET gia_tri = max(gia_tri, excluded.gia_tri)`,
  )
    .bind(WS, ma_so)
    .run();
  return id;
}

/** Các phương án của một mục (fixture đọc) — bảng `can_chu_phuong_an` của 0013. */
export async function phuongAnCua(can_chu_id: string): Promise<
  { nhan: string; noi_dung: string; de_xuat: number; thu_tu: number }[]
> {
  const { results } = await env.DB.prepare(
    `SELECT nhan, noi_dung, de_xuat, thu_tu FROM can_chu_phuong_an
      WHERE can_chu_id = ? ORDER BY thu_tu`,
  )
    .bind(can_chu_id)
    .all<{ nhan: string; noi_dung: string; de_xuat: number; thu_tu: number }>();
  return results;
}

/** Dòng `can_chu` **thô** trong DB — để test đọc đúng thứ đã ghi. */
export async function canChuTrongDb(id: string): Promise<{
  ma_so: number;
  tieu_de: string;
  project_id: string | null;
  muc: string;
  loai: string;
  trang_thai: string;
  boi_canh: string | null;
  han_luc: number | null;
  ly_do_de_xuat: string | null;
  lenh: string | null;
  can_tty: number;
  /* Cột của **0023** — lệnh của loại **khác** `run_command` (`spec-questions.md` #130). */
  lenh_kem: string | null;
  can_tty_kem: number;
  trung_voi_can_chu_id: string | null;
  tao_luc: number;
  tao_boi_agent_id: string | null;
  /* Cột của **0015** — đường xử lý (SPEC mục 8 d.243–246, 19.9). */
  ket_qua: string | null;
  phuong_an_da_chon_id: string | null;
  ket_luan_review: string | null;
  ly_do_bo_qua: string | null;
  xu_ly_luc: number | null;
  mo_lai_lan: number;
} | null> {
  return env.DB.prepare(
    `SELECT ma_so, tieu_de, project_id, muc, loai, trang_thai, boi_canh, han_luc,
            ly_do_de_xuat, lenh, can_tty, lenh_kem, can_tty_kem,
            trung_voi_can_chu_id, tao_luc, tao_boi_agent_id,
            ket_qua, phuong_an_da_chon_id, ket_luan_review, ly_do_bo_qua,
            xu_ly_luc, mo_lai_lan
       FROM can_chu WHERE id = ? AND workspace_id = ?`,
  )
    .bind(id, WS)
    .first();
}

/** Mọi dòng Nhật ký của workspace, cũ → mới (fixture đọc) — SPEC mục 10. */
export async function nhatKyTheoThuTu(): Promise<
  { id: string; luc: number; nguoi_loai: string; project_id: string | null; quyet_dinh: string; vi_sao: string }[]
> {
  const { results } = await env.DB.prepare(
    `SELECT id, luc, nguoi_loai, project_id, quyet_dinh, vi_sao FROM nhat_ky
      WHERE workspace_id = ? ORDER BY luc, id`,
  )
    .bind(WS)
    .all<{
      id: string;
      luc: number;
      nguoi_loai: string;
      project_id: string | null;
      quyet_dinh: string;
      vi_sao: string;
    }>();
  return results;
}

/** Bình luận của một ticket, cũ → mới (fixture đọc) — SPEC mục 4, mục 8 d.280. */
export async function binhLuanCuaTicket(
  ticket_id: string,
): Promise<{ noi_dung: string; tac_gia_loai: string; tac_gia_agent_id: string | null }[]> {
  const { results } = await env.DB.prepare(
    `SELECT noi_dung, tac_gia_loai, tac_gia_agent_id FROM comment
      WHERE workspace_id = ? AND ticket_id = ? AND xoa_luc IS NULL
      ORDER BY tao_luc, id`,
  )
    .bind(WS, ticket_id)
    .all<{ noi_dung: string; tac_gia_loai: string; tac_gia_agent_id: string | null }>();
  return results;
}

/** `phien.can_chu_id` — mối nối của cặp vào–ra (mục 8 d.240, 19.6 d.516). */
export async function canChuCuaPhien(phien_id: string): Promise<string | null> {
  const d = await env.DB.prepare(
    'SELECT can_chu_id FROM phien WHERE id = ? AND workspace_id = ?',
  )
    .bind(phien_id, WS)
    .first<{ can_chu_id: string | null }>();
  return d?.can_chu_id ?? null;
}

export async function dungPhien(
  id: string,
  luot_giao_id: string,
  tuy_chon: TuyChonDungPhien = {},
): Promise<string> {
  /*
   * `can_chu_id` phải trỏ tới một mục **có thật, cùng workspace** —
   * `tg_phien_can_chu_them` của 0013 (chỗ cắm mà 0006 để lại, nay đã trả nợ).
   * Trước 0013 cột đó nhận được chuỗi bất kỳ, nên các fixture cũ truyền `'T-1'`;
   * nay fixture **tự dựng** mục đó nếu chưa có, để test cũ vẫn nói đúng điều nó
   * muốn nói ("phiên `waiting_owner` thì có một mục Cần Chủ") mà không phải đi
   * cửa hậu nào ở tầng DB.
   */
  if (tuy_chon.can_chu_id !== undefined && tuy_chon.can_chu_id !== null) {
    /*
     * Lọc **cả `workspace_id`**: `dungCanChu` chỉ dựng mục trong `WS`, nên một
     * fixture đa-workspace ở lượt sau mà hỏi "mục này có chưa?" không lọc
     * workspace sẽ thấy mục của workspace **khác**, bỏ qua bước dựng, rồi để
     * `tg_phien_can_chu_them` chặn — một ca đỏ nói sai lý do.
     */
    const da_co = await env.DB.prepare(
      'SELECT 1 AS co FROM can_chu WHERE id = ? AND workspace_id = ?',
    )
      .bind(tuy_chon.can_chu_id, WS)
      .first<{ co: number }>();
    if (da_co === null) await dungCanChu(tuy_chon.can_chu_id);
  }

  const luot = await env.DB.prepare(
    'SELECT ticket_id, nguoi_nhan_agent_id FROM luot_giao WHERE id = ? AND workspace_id = ?',
  )
    .bind(luot_giao_id, WS)
    .first<{ ticket_id: string; nguoi_nhan_agent_id: string }>();
  if (luot === null) throw new Error(`fixture: không có lượt giao ${luot_giao_id}`);

  const t = tuy_chon.mo_luc ?? Date.now();
  const trang_thai = tuy_chon.trang_thai ?? 'running';
  await env.DB.prepare(
    `INSERT INTO phien
       (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
        tin_hieu_cuoi_luc, can_chu_id, stopping_luc, mo_luc, dong_luc, ly_do_dong, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      WS,
      luot_giao_id,
      luot.ticket_id,
      luot.nguoi_nhan_agent_id,
      trang_thai,
      tuy_chon.tin_hieu_cuoi_luc ?? t,
      tuy_chon.can_chu_id ?? null,
      // CHECK của 0006: `stopping` phải có mốc bấm Dừng.
      tuy_chon.stopping_luc ?? (trang_thai === 'stopping' ? t : null),
      t,
      // CHECK của 0006: `closed` **đúng khi** có `dong_luc`.
      tuy_chon.dong_luc ?? (trang_thai === 'closed' ? t : null),
      tuy_chon.ly_do_dong ?? null,
      t,
    )
    .run();
  return id;
}

/** Dòng `phien` thô trong DB — để test đọc đúng thứ đã ghi, không qua dẫn xuất. */
export async function phienTrongDb(id: string): Promise<{
  trang_thai: string;
  tin_hieu_cuoi_luc: number;
  stopping_luc: number | null;
  dong_luc: number | null;
  ly_do_dong: string | null;
  ghi_chu_cuoi: string | null;
  waiting_assigner_luc: number | null;
  canh_bao_tin_hieu_luc: number | null;
  tra_loi_doc_luc: number | null;
  error_luc: number | null;
} | null> {
  return env.DB.prepare(
    `SELECT trang_thai, tin_hieu_cuoi_luc, stopping_luc, dong_luc, ly_do_dong, ghi_chu_cuoi,
            waiting_assigner_luc, canh_bao_tin_hieu_luc, tra_loi_doc_luc, error_luc
       FROM phien WHERE id = ? AND workspace_id = ?`,
  )
    .bind(id, WS)
    .first();
}

/**
 * Đặt tay các mốc của `phien` (migration 0007) — fixture.
 *
 * Dùng cho mốc 60 phút của 19.6 và mốc cảnh báo của d.196: cả hai cần một giá
 * trị **cũ hơn** `Date.now()`, mà đường ghi thật chỉ đặt được "bây giờ".
 */
export async function datMocPhien(
  id: string,
  moc: {
    tin_hieu_cuoi_luc?: number;
    waiting_assigner_luc?: number | null;
    canh_bao_tin_hieu_luc?: number | null;
    tra_loi_doc_luc?: number | null;
    /** Lúc vào `error` — migration 0008. */
    error_luc?: number | null;
  },
): Promise<void> {
  for (const [cot, gia_tri] of Object.entries(moc)) {
    if (gia_tri === undefined) continue;
    await env.DB.prepare(
      `UPDATE phien SET ${cot} = ? WHERE id = ? AND workspace_id = ?`,
    )
      .bind(gia_tri, id, WS)
      .run();
  }
}

/**
 * Thêm một mục vào dòng hoạt động **trực tiếp trong DB** (fixture) — SPEC mục 6
 * d.190. `ticket_id` lấy **từ phiên** (trigger `tg_hoat_dong_khop_phien` của 0007).
 */
export async function dungHoatDong(
  id: string,
  phien_id: string,
  tuy_chon: {
    loai?: 'thought' | 'action' | 'question' | 'result' | 'error' | null;
    noi_dung?: string;
    tam_thoi?: boolean;
    tra_loi_cho_id?: string | null;
    tac_gia_agent_id?: string | null;
    gui_luc?: number;
  } = {},
): Promise<string> {
  const phien = await env.DB.prepare(
    'SELECT ticket_id, agent_id FROM phien WHERE id = ? AND workspace_id = ?',
  )
    .bind(phien_id, WS)
    .first<{ ticket_id: string; agent_id: string }>();
  if (phien === null) throw new Error(`fixture: không có phiên ${phien_id}`);

  const ke_tiep = await env.DB.prepare(
    'SELECT coalesce(max(thu_tu), 0) + 1 AS n FROM phien_hoat_dong WHERE phien_id = ?',
  )
    .bind(phien_id)
    .first<{ n: number }>();

  const tra_loi_cho_id = tuy_chon.tra_loi_cho_id ?? null;
  // CHECK của 0007: `loai` rỗng **đúng khi** đây là một câu trả lời.
  const loai =
    tra_loi_cho_id !== null ? null : (tuy_chon.loai ?? 'thought');
  const tac_gia_agent_id =
    tuy_chon.tac_gia_agent_id === undefined
      ? tra_loi_cho_id === null
        ? phien.agent_id
        : null
      : tuy_chon.tac_gia_agent_id;

  await env.DB.prepare(
    `INSERT INTO phien_hoat_dong
       (id, workspace_id, phien_id, ticket_id, loai, tac_gia_loai, tac_gia_agent_id,
        noi_dung, tam_thoi, tra_loi_cho_id, thu_tu, gui_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      WS,
      phien_id,
      phien.ticket_id,
      loai,
      tac_gia_agent_id === null ? 'owner' : 'agent',
      tac_gia_agent_id,
      tuy_chon.noi_dung ?? 'Mục giả để test',
      tuy_chon.tam_thoi === true ? 1 : 0,
      tra_loi_cho_id,
      ke_tiep?.n ?? 1,
      tuy_chon.gui_luc ?? Date.now(),
    )
    .run();
  return id;
}

/**
 * Thêm một **bằng chứng** trực tiếp trong DB (fixture) — SPEC mục 7, migration
 * 0009.
 *
 * Lệnh gửi bằng chứng là **lượt 2** của phần 3, nên fixture này là cách duy nhất
 * để đưa cổng Xong (`cong-bang-chung.ts`) tới một trạng thái dữ liệu thật. Mọi
 * CHECK của 0009 vẫn áp — fixture không đi cửa hậu nào ở tầng DB.
 *
 * `xac_minh` để trống thì lấy mặc định đúng loại (`xacMinhBanDau`), nên ca thường
 * gặp nhất ("gửi một `note`") không phải nhớ mã nào.
 */
export interface TuyChonDungBangChung {
  xac_minh?: XacMinhLuuDuoc;
  gui_luc?: number;
  nguoi_gui_agent_id?: string | null;
  /** `commit` */
  commit_hash?: string;
  repo?: string;
  /** `deploy` */
  url?: string;
  ma_phien_ban?: string | null;
  /** `review` */
  ket_luan?: 'pass' | 'fail';
  ghi_chu?: string | null;
  /** `test` */
  tom_tat?: string;
  test_dat?: boolean;
  /** `file` */
  duong_dan?: string;
  /** `note` */
  noi_dung?: string;
  /** Rút lại — SPEC d.222. Đặt mốc thì fixture tự điền lý do và người rút. */
  rut_luc?: number | null;
  ly_do?: string | null;
  so_lan_thu?: number;
  thu_lai_luc?: number | null;
  theo_doi_den_luc?: number | null;
  /** "Chưa merge sau 7 ngày" — 19.7, migration 0010. */
  chua_merge_luc?: number | null;
  chua_merge_bao_moc?: number | null;
}

export async function dungBangChung(
  id: string,
  ticket_id: string,
  loai: LoaiBangChung,
  tuy_chon: TuyChonDungBangChung = {},
): Promise<string> {
  await cauDungBangChung(id, ticket_id, loai, tuy_chon).run();
  return id;
}

/**
 * Câu `INSERT` của `dungBangChung`, **chưa chạy** — để ca cần gieo hàng trăm dòng
 * gửi cả lô bằng MỘT `env.DB.batch(...)` thay vì hàng trăm lượt đi về D1 (BAT-51:
 * ca "TRẦN 100 dòng" của `cron-bang-chung.test.ts` từng đỏ vì hết 5 giây khi cả bộ
 * chạy song song; gieo một lô hạ ca đó từ ~3,9 s xuống ~2,3 s). Cùng một câu,
 * cùng giá trị mặc định với `dungBangChung`: hai đường không thể lệch nhau.
 */
export function cauDungBangChung(
  id: string,
  ticket_id: string,
  loai: LoaiBangChung,
  tuy_chon: TuyChonDungBangChung = {},
): D1PreparedStatement {
  const t = tuy_chon.gui_luc ?? Date.now();
  const agent = tuy_chon.nguoi_gui_agent_id ?? null;
  const rut_luc = tuy_chon.rut_luc ?? null;

  return env.DB.prepare(
    `INSERT INTO evidence
       (id, workspace_id, ticket_id, loai, nguoi_gui_loai, nguoi_gui_agent_id, gui_luc,
        xac_minh, ly_do, so_lan_thu, thu_lai_luc, theo_doi_den_luc,
        chua_merge_luc, chua_merge_bao_moc,
        commit_hash, repo, url, ma_phien_ban, ket_luan, ghi_chu,
        tom_tat, test_dat, duong_dan, noi_dung,
        rut_luc, rut_ly_do, rut_boi_loai, rut_boi_agent_id, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      WS,
      ticket_id,
      loai,
      agent === null ? 'owner' : 'agent',
      agent,
      t,
      tuy_chon.xac_minh ?? xacMinhBanDau(loai),
      tuy_chon.ly_do ?? null,
      tuy_chon.so_lan_thu ?? 0,
      tuy_chon.thu_lai_luc ?? null,
      tuy_chon.theo_doi_den_luc ?? null,
      tuy_chon.chua_merge_luc ?? null,
      tuy_chon.chua_merge_bao_moc ?? null,
      loai === 'commit' ? (tuy_chon.commit_hash ?? 'a1b2c3d4e5f6') : null,
      loai === 'commit' ? (tuy_chon.repo ?? 'chu/baton') : null,
      loai === 'deploy' ? (tuy_chon.url ?? 'https://baton.example.com/') : null,
      loai === 'deploy' ? (tuy_chon.ma_phien_ban ?? null) : null,
      loai === 'review' ? (tuy_chon.ket_luan ?? 'pass') : null,
      loai === 'review' ? (tuy_chon.ghi_chu ?? null) : null,
      loai === 'test' ? (tuy_chon.tom_tat ?? '42 passed, 0 failed') : null,
      loai === 'test' ? ((tuy_chon.test_dat ?? true) ? 1 : 0) : null,
      loai === 'file' ? (tuy_chon.duong_dan ?? 'file:///srv/bao-cao.md') : null,
      loai === 'note' ? (tuy_chon.noi_dung ?? 'Đã làm xong, không có mã.') : null,
      rut_luc,
      rut_luc === null ? null : 'Gửi nhầm ticket',
      rut_luc === null ? null : 'owner',
      null,
      t,
      t,
    );
}

/**
 * Dòng `evidence` **thô** trong DB — để test đọc đúng thứ đã ghi, không qua dẫn
 * xuất nào.
 */
export async function bangChungTrongDb(id: string): Promise<{
  loai: string;
  xac_minh: string;
  ly_do: string | null;
  ma_http: number | null;
  xac_minh_luc: number | null;
  so_lan_thu: number;
  thu_lai_luc: number | null;
  theo_doi_den_luc: number | null;
  chua_merge_luc: number | null;
  chua_merge_bao_moc: number | null;
  /** Bốn cột của migration 0022 — nguồn của kết luận và nguồn của review. */
  merged_cuc_bo: number;
  nguon_xac_minh: string | null;
  review_nguon: string | null;
  review_bao_cao: string | null;
  commit_hash: string | null;
  repo: string | null;
  url: string | null;
  ma_phien_ban: string | null;
  ket_luan: string | null;
  noi_dung: string | null;
  duong_dan: string | null;
  tom_tat: string | null;
  nguoi_gui_loai: string;
  nguoi_gui_agent_id: string | null;
  gui_luc: number;
  rut_luc: number | null;
  rut_ly_do: string | null;
  rut_boi_loai: string | null;
  rut_boi_agent_id: string | null;
} | null> {
  return env.DB.prepare(
    `SELECT loai, xac_minh, ly_do, ma_http, xac_minh_luc, so_lan_thu, thu_lai_luc,
            theo_doi_den_luc, chua_merge_luc, chua_merge_bao_moc,
            merged_cuc_bo, nguon_xac_minh, review_nguon, review_bao_cao,
            commit_hash, repo, url, ma_phien_ban,
            ket_luan, noi_dung, duong_dan, tom_tat,
            nguoi_gui_loai, nguoi_gui_agent_id, gui_luc,
            rut_luc, rut_ly_do, rut_boi_loai, rut_boi_agent_id
       FROM evidence WHERE id = ? AND workspace_id = ?`,
  )
    .bind(id, WS)
    .first();
}

/**
 * Đặt **bảng nguồn xác minh giả lập** (SPEC mục 7 d.206, d.207) cho các request
 * tiếp theo.
 *
 * Đây là chỗ cắm đã khai trong `Env.NGUON_GIA_LAP`, **không** phải một cửa hậu:
 * nó chỉ có hiệu lực khi `CHO_DUONG_TEST` cũng bật (chỉ Miniflare bật), và chính
 * `xac-minh-bang-chung.ts` kiểm cả hai điều kiện. Nhờ nó, test đi **đường HTTP
 * thật** qua cửa ghi mà **không gọi mạng** lần nào — danh sách cấm CLAUDE.md.
 */
export function datNguonGiaLap(cai_dat: {
  /*
   * `'khong_thay_repo'` là ca **GitHub chưa trả lời về commit** (repo sai hình
   * dạng, hoặc `GET /repos/<repo>` trả 404) — khác `'khong_thay'`, nơi GitHub đã
   * tra tới commit. Chỉ ca thứ hai cho một lời khai `merged_cuc_bo` được dùng.
   * Xem `nguon-github.ts`.
   */
  commit?: Record<
    string,
    'merged' | 'pushed' | 'khong_thay' | 'khong_thay_repo' | { loi: string }
  >;
  deploy?: Record<string, number | { loi: string }>;
  cham_ms?: number;
}): void {
  tiemNguonXacMinh(nguonGiaLap(cai_dat));
}

/** Bỏ nguồn giả lập (về nguồn thật). Dùng cho ca "thiếu token GitHub". */
export function boNguonGiaLap(): void {
  tiemNguonXacMinh(null);
}

/** Cho một agent vào một dự án (bảng `agent_project`) — fixture. */
export async function choVaoDuAn(agent_id: string, project_id: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO agent_project (workspace_id, agent_id, project_id, tao_luc) VALUES (?, ?, ?, ?)',
  )
    .bind(WS, agent_id, project_id, Date.now())
    .run();
}

/** Thêm một nhãn trực tiếp trong DB (fixture). */
export async function dungNhan(ticket_id: string, nhan: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO ticket_label (workspace_id, ticket_id, nhan, tao_luc) VALUES (?, ?, ?, ?)',
  )
    .bind(WS, ticket_id, nhan, Date.now())
    .run();
}

/**
 * Nối một mục Cần Chủ với một ticket (fixture) — bảng `can_chu_ticket` của 0013.
 *
 * Cần cho hai luật của mục 14: bộ lọc "cần Chủ" của d.396 và khối "mục Cần Chủ
 * liên quan" của d.401. Cả hai đọc **chiều ngược** (`ticket_id` → mục), nên không
 * có fixture này thì không ca nào dựng được dữ liệu để chúng đỏ.
 */
export async function noiCanChuTicket(can_chu_id: string, ticket_id: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO can_chu_ticket (workspace_id, can_chu_id, ticket_id, tao_luc)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(WS, can_chu_id, ticket_id, Date.now())
    .run();
}

/** Trạng thái hiện tại của một ticket. */
export async function trangThaiCua(ticket_id: string): Promise<string> {
  const d = await env.DB.prepare('SELECT trang_thai FROM ticket WHERE id = ?')
    .bind(ticket_id)
    .first<{ trang_thai: string }>();
  return d?.trang_thai ?? '(không có ticket)';
}

/**
 * Dựng `AiGoi` của một agent **bằng tay**, không qua DB.
 *
 * Dùng cho test bảng quyền: 36 ô của SPEC mục 3 là luật **thuần**, không cần
 * dữ liệu. Dựng tay cũng là cách duy nhất để kiểm những ô phụ thuộc lượt giao
 * (phần 2 chưa có bảng lượt giao).
 */
export function aiAgent(
  vai_tro: VaiTroAgent,
  them: Partial<Omit<Extract<AiGoi, { loai: 'agent' }>, 'loai' | 'vai_tro'>> = {},
): Extract<AiGoi, { loai: 'agent' }> {
  return {
    loai: 'agent',
    agent_id: 'ag-test',
    vai_tro,
    disabled: false,
    vao_tat_ca_du_an: false,
    du_an_duoc_vao: [],
    du_an_minh_quan_ly: [],
    ghi_de: {},
    ...them,
  };
}

/* ------------------------------------------------------------------ *
 * Chạy một lệnh ghi với **cổng bằng chứng tiêm vào** — SPEC mục 7
 * ------------------------------------------------------------------ */

/** Cổng "đủ bằng chứng" giả. Phần 3 cài cổng thật (`cong-bang-chung.ts`). */
export const CONG_DU_GIA: KetQuaCong = { du: true, ly_do: '' };

/**
 * Chạy một handler ghi **ngoài** `WorkspaceGate`, chỉ để **tiêm cổng bằng
 * chứng** (`BoiCanhLenh.cong`).
 *
 * Vì sao cần: cổng thật là phần 3; `congBangChungCua` hiện luôn trả "chưa đủ",
 * nên đường "cổng **đủ** → ticket vào Xong" của SPEC 19.2 (hàng "Nộp `done`" và
 * hàng "Nghiệm thu `accepted`") không có cách nào đi qua HTTP. Không test được
 * thì nhánh đó là **mã chết**: gỡ nó đi cũng không ca nào đỏ.
 *
 * Đây **không phải cửa hậu trong mã sản phẩm**: `cong-bang-chung.ts` vốn thiết
 * kế cổng là một hàm chèn được, và helper này dùng đúng chỗ cắm đó. Phần không
 * chạy ở đây là lịch sử và `len_tieng_luc` của cửa ghi — chúng đã có test riêng,
 * và mọi ca đi qua HTTP trong file test này vẫn chạy qua cửa ghi thật.
 */
export async function chayLenhVoiCong<K extends LoaiLenh>(
  lenh: Extract<Lenh, { loai: K }>,
  cong_ra: KetQuaCong,
  bay_gio: number = Date.now(),
): Promise<{ ket_qua: unknown; loi: { ma: string; message: string } | null }> {
  const cong: CongBangChung = () => Promise.resolve(cong_ra);
  const handler = SO_DANG_KY_HANDLER[lenh.loai] as (
    l: never,
    bc: unknown,
  ) => Promise<{
    cau_lenh: D1PreparedStatement[];
    loi_sau_ghi?: { ma: string; message: string };
    ket_qua: unknown;
  }>;

  const ket = await handler(lenh as never, {
    env,
    db: env.DB,
    bay_gio,
    danhThuc: () => undefined,
    cong,
  });

  if (ket.cau_lenh.length > 0) await env.DB.batch(ket.cau_lenh);
  return { ket_qua: ket.ket_qua, loi: ket.loi_sau_ghi ?? null };
}

/* ------------------------------------------------------------------ *
 * Nhật ký quyết định — SPEC mục 10, migration 0014
 * ------------------------------------------------------------------ */

/**
 * Dựng một **dòng Nhật ký** trực tiếp trong DB (fixture).
 *
 * `project_id` để trống = **"Chung"** (`project_id IS NULL`) — 19.12 câu 4.
 * `agent_id` để trống = dòng của **chủ** (`nguoi_loai = 'chu'`) — d.308, và
 * CHECK của 0014 buộc cặp hai cột khớp nhau, nên fixture suy một cột từ cột kia
 * thay vì để người gọi nhập cả hai rồi lệch.
 *
 * **Không có fixture nào sửa hay xoá dòng Nhật ký** — d.309, và trigger
 * `tg_nhat_ky_khong_sua` / `_khong_xoa` của 0014 chặn cả fixture.
 */
export interface TuyChonDungNhatKy {
  luc?: number;
  agent_id?: string | null;
  project_id?: string | null;
  quyet_dinh?: string;
  vi_sao?: string;
}

export async function dungNhatKy(
  id: string,
  tuy_chon: TuyChonDungNhatKy = {},
): Promise<string> {
  const agent_id = tuy_chon.agent_id ?? null;
  await env.DB.prepare(
    `INSERT INTO nhat_ky
       (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      WS,
      tuy_chon.luc ?? Date.now(),
      agent_id === null ? 'chu' : 'agent',
      agent_id,
      tuy_chon.project_id ?? null,
      tuy_chon.quyet_dinh ?? 'Quyết định giả để test',
      tuy_chon.vi_sao ?? 'Vì đây là test',
    )
    .run();
  return id;
}

/** Thêm một **căn cứ** cho một dòng Nhật ký (fixture) — d.308, bảng con 0014. */
export async function dungCanCu(
  id: string,
  nhat_ky_id: string,
  loai: 'ask' | 'ticket' | 'dong_cu',
  tro_toi: string,
  thu_tu = 1,
): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO nhat_ky_can_cu
       (id, workspace_id, nhat_ky_id, loai, can_chu_id, ticket_id, dong_cu_id, thu_tu, tao_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      WS,
      nhat_ky_id,
      loai,
      loai === 'ask' ? tro_toi : null,
      loai === 'ticket' ? tro_toi : null,
      loai === 'dong_cu' ? tro_toi : null,
      thu_tu,
      Date.now(),
    )
    .run();
  return id;
}

/** Dòng `nhat_ky` **thô** trong DB — để test đọc đúng thứ đã ghi. */
export async function nhatKyTrongDb(id: string): Promise<{
  luc: number;
  nguoi_loai: string;
  agent_id: string | null;
  project_id: string | null;
  quyet_dinh: string;
  vi_sao: string;
} | null> {
  return env.DB.prepare(
    `SELECT luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao
       FROM nhat_ky WHERE id = ? AND workspace_id = ?`,
  )
    .bind(id, WS)
    .first();
}

/** Căn cứ của một dòng (fixture đọc) — bảng `nhat_ky_can_cu` của 0014. */
export async function canCuCua(nhat_ky_id: string): Promise<
  { loai: string; can_chu_id: string | null; ticket_id: string | null; dong_cu_id: string | null; thu_tu: number }[]
> {
  const { results } = await env.DB.prepare(
    `SELECT loai, can_chu_id, ticket_id, dong_cu_id, thu_tu FROM nhat_ky_can_cu
      WHERE nhat_ky_id = ? ORDER BY thu_tu`,
  )
    .bind(nhat_ky_id)
    .all<{
      loai: string;
      can_chu_id: string | null;
      ticket_id: string | null;
      dong_cu_id: string | null;
      thu_tu: number;
    }>();
  return results;
}

/* ------------------------------------------------------------------ *
 * Thông báo — SPEC mục 12, migration 0012 + 0019
 * ------------------------------------------------------------------ */

/**
 * Đặt **kênh Telegram giả lập** cho các lượt gửi tiếp theo.
 *
 * Đây là chỗ cắm đã khai ở `nguon-telegram.ts`, **không** một cửa hậu: nó chỉ có
 * hiệu lực khi `CHO_DUONG_TEST` cũng bật (chỉ Miniflare bật), và chính
 * `nguonTelegramCua` kiểm cả hai điều kiện. Nhờ nó, test đi **đường gửi thật** qua
 * cron và cửa ghi mà **không gọi mạng** lần nào — danh sách cấm CLAUDE.md mục 3.
 */
export function datNguonTelegram(cai_dat: CaiDatGiaLapTelegram = {}): NguonTelegramGiaLap {
  const nguon = nguonTelegramGiaLap(cai_dat);
  tiemNguonTelegram(nguon);
  return nguon;
}

/** Bỏ kênh giả lập (về "chưa cấu hình", vì test không đặt secret Telegram nào). */
export function boNguonTelegram(): void {
  tiemNguonTelegram(null);
}

/** Một dòng `thong_bao` dựng trực tiếp trong DB (fixture) — 0012 + 0019. */
export interface TuyChonDungTin {
  loai?: string;
  uu_tien?: 'thuong' | 'khan';
  noi_dung?: string;
  tao_luc?: number;
  can_chu_id?: string | null;
  ticket_id?: string | null;
  phien_id?: string | null;
  agent_id?: string | null;
  gui_telegram_luc?: number | null;
  gui_so_lan_thu?: number;
  gui_thu_lai_luc?: number | null;
  gui_loi_ly_do?: string | null;
}

export async function dungTin(id: string, tuy_chon: TuyChonDungTin = {}): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO thong_bao
       (id, workspace_id, loai, uu_tien, noi_dung, phien_id, ticket_id, agent_id,
        can_chu_id, tao_luc, gui_telegram_luc, gui_so_lan_thu, gui_thu_lai_luc, gui_loi_ly_do)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      WS,
      tuy_chon.loai ?? 'phien_dung',
      tuy_chon.uu_tien ?? 'thuong',
      tuy_chon.noi_dung ?? 'Tin giả để test',
      tuy_chon.phien_id ?? null,
      tuy_chon.ticket_id ?? null,
      tuy_chon.agent_id ?? null,
      tuy_chon.can_chu_id ?? null,
      tuy_chon.tao_luc ?? Date.now(),
      tuy_chon.gui_telegram_luc ?? null,
      tuy_chon.gui_so_lan_thu ?? 0,
      tuy_chon.gui_thu_lai_luc ?? null,
      tuy_chon.gui_loi_ly_do ?? null,
    )
    .run();
  return id;
}

/** Dòng `thong_bao` **thô** trong DB — để test đọc đúng thứ đã ghi. */
export async function tinTrongDb(id: string): Promise<{
  loai: string;
  uu_tien: string;
  noi_dung: string;
  can_chu_id: string | null;
  ticket_id: string | null;
  phien_id: string | null;
  agent_id: string | null;
  tao_luc: number;
  doc_luc: number | null;
  gui_telegram_luc: number | null;
  gui_so_lan_thu: number;
  gui_thu_lai_luc: number | null;
  gui_loi_ly_do: string | null;
} | null> {
  return env.DB.prepare(
    `SELECT loai, uu_tien, noi_dung, can_chu_id, ticket_id, phien_id, agent_id, tao_luc,
            doc_luc, gui_telegram_luc, gui_so_lan_thu, gui_thu_lai_luc, gui_loi_ly_do
       FROM thong_bao WHERE id = ? AND workspace_id = ?`,
  )
    .bind(id, WS)
    .first();
}

/** Mọi tin của workspace, cũ → mới (fixture đọc) — chuông của d.339. */
export async function tinTheoThuTu(): Promise<
  { id: string; loai: string; uu_tien: string; noi_dung: string; can_chu_id: string | null; gui_telegram_luc: number | null }[]
> {
  const { results } = await env.DB.prepare(
    `SELECT id, loai, uu_tien, noi_dung, can_chu_id, gui_telegram_luc FROM thong_bao
      WHERE workspace_id = ? ORDER BY tao_luc, id`,
  )
    .bind(WS)
    .all<{
      id: string;
      loai: string;
      uu_tien: string;
      noi_dung: string;
      can_chu_id: string | null;
      gui_telegram_luc: number | null;
    }>();
  return results;
}

/** `can_chu.nhac_do_luc` — mốc chống nhắc lặp của d.283/d.291 (0019). */
export async function mocNhacDoCua(can_chu_id: string): Promise<number | null> {
  const d = await env.DB.prepare(
    'SELECT nhac_do_luc FROM can_chu WHERE id = ? AND workspace_id = ?',
  )
    .bind(can_chu_id, WS)
    .first<{ nhac_do_luc: number | null }>();
  return d?.nhac_do_luc ?? null;
}

/** Gọi API với một token, như CLI vẫn làm (SPEC mục 13). */
export function goiApi(
  duong: string,
  token: string,
  tuy_chon: { method?: string; than?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (tuy_chon.than !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(tuy_chon.than);
  }
  return SELF.fetch(`https://baton.test${duong}`, {
    method: tuy_chon.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  });
}
