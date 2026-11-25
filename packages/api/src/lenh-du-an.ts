/**
 * Lệnh ghi về **dự án** — SPEC mục 2.
 *
 * Luật được cài ở đây:
 *   * **Tạo: chỉ chủ** ("chủ tạo (UI hoặc CLI)"). Tên và mã bắt buộc.
 *   * Mã duy nhất trong workspace → `"Mã dự án đã có"`; sai định dạng →
 *     `"Mã chỉ gồm 2–6 chữ A–Z"` (đúng chữ SPEC mục 2).
 *   * Mã **không đổi được** sau khi tạo; tên đổi được.
 *   * Trạng thái `active` · `paused` · `archived`; `archived` là **chỉ đọc**.
 */

import {
  BatonError,
  GHI_TRANG_THAI_BAN_DO,
  LOI_DUY_TRI_KHONG_DAY,
  LOI_MA_DU_AN_TRUNG,
  batBuocKetQuaQuyen,
  kiemChuTuyChon,
  kiemCo,
  kiemGioiHanWip,
  kiemMaDuAn,
  kiemNguongDungPhut,
  kiemTenDuAn,
  kiemTenNgan,
  kiemTrangThaiBanDo,
  kiemTrangThaiDuAn,
  kiemUuTienDuAn,
  quyenSuaBanDoDuAn,
  quyenSuaTrangThaiBanDo,
  trangThaiWip,
  type TacGia,
  type TrangThaiDuAn,
  type TrangThaiWip,
} from '@baton/shared';
import {
  batBuocLaChu,
  tacGiaCua,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';
import { locPhamViTicket } from './pham-vi-doc.js';

/* ------------------------------------------------------------------ *
 * Tạo dự án — SPEC mục 2
 * ------------------------------------------------------------------ */

export interface LenhTaoDuAn extends LenhChung {
  loai: 'tao_du_an';
  ten: string;
  ma: string;
  mo_ta?: string | null;
  mau?: string | null;
  nhom?: string | null;
  quan_ly_agent_id?: string | null;
  khong_code?: boolean;
  bat_buoc_review?: boolean;
}

export interface KetQuaTaoDuAn {
  id: string;
  ma: string;
  ten: string;
  trang_thai: TrangThaiDuAn;
}

/**
 * Agent quản lý phải tồn tại trong cùng workspace. Không kiểm vai trò phải là
 * `manager`: SPEC mục 2 chỉ nói "agent quản lý", mục 3 không cấm vai trò khác
 * (một `coordinator` quản lý dự án điều phối là hợp lý).
 */
async function kiemQuanLyAgent(
  db: D1Database,
  workspace_id: string,
  agent_id: string | null | undefined,
): Promise<string | null> {
  if (agent_id === null || agent_id === undefined) return null;
  const d = await db
    .prepare('SELECT id FROM agent WHERE id = ? AND workspace_id = ?')
    .bind(agent_id, workspace_id)
    .first<{ id: string }>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy agent quản lý.' });
  return d.id;
}

export async function handlerTaoDuAn(
  lenh: LenhTaoDuAn,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaTaoDuAn>> {
  batBuocLaChu(lenh.ai, 'tạo được dự án');

  // Kiểm nhập ở cửa ghi, không tin client (xem `lenh-khung.ts`).
  const ten = kiemTenDuAn(lenh.ten);
  const ma = kiemMaDuAn(lenh.ma);
  const mo_ta = kiemChuTuyChon(lenh.mo_ta, 'Mô tả dự án');
  const mau = kiemChuTuyChon(lenh.mau, 'Màu', 32);
  const nhom = kiemChuTuyChon(lenh.nhom, 'Nhóm dự án', 80);
  const quan_ly = await kiemQuanLyAgent(db, lenh.workspace_id, lenh.quan_ly_agent_id);
  const khong_code = lenh.khong_code === undefined ? false : kiemCo(lenh.khong_code, 'khong_code');
  // Cờ "bắt buộc review" **mặc định bật** — SPEC mục 7.
  const bat_buoc_review =
    lenh.bat_buoc_review === undefined ? true : kiemCo(lenh.bat_buoc_review, 'bat_buoc_review');

  // Mã duy nhất trong workspace — SPEC mục 2. Kiểm ở đây (trong cửa ghi, nên
  // không có đua) để trả đúng thông điệp của SPEC thay vì lỗi UNIQUE của SQLite.
  const trung = await db
    .prepare('SELECT id FROM project WHERE workspace_id = ? AND ma = ?')
    .bind(lenh.workspace_id, ma)
    .first<{ id: string }>();
  if (trung !== null) throw new BatonError('INVALID_INPUT', { message: LOI_MA_DU_AN_TRUNG });

  const id = crypto.randomUUID();
  return {
    cau_lenh: [
      db
        .prepare(
          `INSERT INTO project
             (id, workspace_id, ten, ma, mo_ta, mau, trang_thai, quan_ly_agent_id, nhom,
              khong_code, bat_buoc_review, tao_luc, cap_nhat_luc)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          lenh.workspace_id,
          ten,
          ma,
          mo_ta,
          mau,
          quan_ly,
          nhom,
          khong_code ? 1 : 0,
          bat_buoc_review ? 1 : 0,
          bay_gio,
          bay_gio,
        ),
    ],
    danh_thuc: [`du_an:${lenh.workspace_id}`],
    ket_qua: { id, ma, ten, trang_thai: 'active' },
  };
}

/* ------------------------------------------------------------------ *
 * Sửa dự án — SPEC mục 2
 * ------------------------------------------------------------------ */

export interface LenhSuaDuAn extends LenhChung {
  loai: 'sua_du_an';
  project_id: string;
  /** Chỉ những trường có mặt mới được đổi. */
  ten?: string;
  mo_ta?: string | null;
  mau?: string | null;
  nhom?: string | null;
  trang_thai?: string;
  quan_ly_agent_id?: string | null;
  khong_code?: boolean;
  bat_buoc_review?: boolean;
  /**
   * **Ngưỡng đứng theo dự án** — SPEC mục 6 dòng 189 ("chỉnh theo dự án hoặc theo
   * agent, 5–1440 phút"). `null` = bỏ đặt riêng, về mặc định 30 phút.
   */
  nguong_dung_phut?: number | null;
  /*
   * **Bốn trường của Bản đồ dự án** — SPEC 20.1. Chủ **và `coordinator`** sửa
   * được (các trường trên vẫn chỉ chủ). `unknown`: cửa ghi kiểm kiểu, không tin
   * client.
   */
  /** 1–5, 5 = quan trọng nhất. */
  uu_tien?: unknown;
  /** Bật khi đã đủ giới hạn WIP vẫn cho (20.1); kết quả mang `wip`. */
  dang_day?: unknown;
  /** Bật ⇒ cùng batch tự tắt `dang_day` (20.1). */
  duy_tri?: unknown;
  /** 0–24 ký tự; rỗng/`null` ⇒ lưu NULL (dùng tên đầy đủ). */
  ten_ngan?: unknown;
  /**
   * Ô "**Trạng thái bản đồ**" — SPEC 20.8: `dang_day | hang_cho | tam_dung |
   * duy_tri`, ghi xuống `trang_thai` + `dang_day` + `duy_tri` theo bảng 20.8 trong
   * **một** `UPDATE`. Chủ, `coordinator`, `manager` của dự án.
   */
  trang_thai_ban_do?: unknown;
  /** Có mặt là **bị từ chối**: mã không đổi được sau khi tạo (SPEC mục 2). */
  ma?: string;
}

export interface KetQuaSuaDuAn {
  id: string;
  da_doi: string[];
  /**
   * Đồng hồ WIP **sau** lệnh — có khi lệnh mang `dang_day` hoặc `duy_tri` (20.1:
   * "Bật `dang_day` khi đã đủ giới hạn WIP: vẫn cho … đồng hồ WIP chuyển đỏ").
   * CLI in cảnh báo khi `vuot`.
   */
  wip?: TrangThaiWip;
}

/**
 * Bốn trường của Bản đồ dự án (20.1) — **chủ và `coordinator`** sửa được. Mọi
 * trường khác của `sua_du_an` (kể cả `nhom`) giữ luật cũ: **chỉ chủ**.
 */
export const TRUONG_BAN_DO_DU_AN = ['uu_tien', 'dang_day', 'duy_tri', 'ten_ngan', 'trang_thai_ban_do'] as const;

/**
 * Trong các trường Bản đồ, nhóm **trạng thái bản đồ** (20.8): chủ, `coordinator`
 * **và `manager` của dự án** đổi được. Phần còn lại (`uu_tien`, `ten_ngan`) giữ
 * chủ + `coordinator`.
 */
const TRUONG_TRANG_THAI_BAN_DO = ['dang_day', 'duy_tri', 'trang_thai_ban_do'] as const;

/**
 * Trường của `sua_du_an` mà một thay đổi phải ghi **lịch sử dự án**
 * (`project_history`, 20.1 "Mọi thay đổi các trường trên ghi Lịch sử"). `nhom`
 * có ở đây vì 20.1 dùng nó làm "mảng" của bản đồ và `baton project set --nhom`
 * sửa nó. **`trang_thai`** từ 20.8 (mọi đường, kể cả chủ đổi qua trường cũ): ô
 * Trạng thái ghi xuống nó và "Đặt bởi" cần thấy lần đổi đó. Trường cũ khác (tên,
 * mô tả…) giữ hành vi cũ: không ghi.
 */
const TRUONG_GHI_LICH_SU_DU_AN = new Set<string>([
  'nhom',
  'trang_thai',
  'uu_tien',
  'dang_day',
  'duy_tri',
  'ten_ngan',
]);

/**
 * Năm trường mà "**Đặt bởi**" (20.8) nhìn: lần đổi cuối của một trong số này là
 * dòng "Đặt bởi <tên> · <thời gian>" của thẻ. `ten_ngan` không thuộc thanh công cụ.
 */
export const TRUONG_DAT_BOI = ['uu_tien', 'trang_thai', 'dang_day', 'duy_tri', 'nhom'] as const;

/**
 * Số dự án **đang đẩy** của workspace, **không tính** dự án lưu trữ (câu hỏi SPEC
 * (e): dự án lưu trữ không hiện ở bản đồ) và **không tính** `bo_qua_id` — người
 * gọi cộng trạng thái **sau lệnh** của dự án đó.
 *
 * Không index riêng: lọc `workspace_id` đi `ix_project_trang_thai` của 0001, trên
 * vài trăm dòng (mốc 200 dự án) — xem chú thích 0029.
 */
export async function demDangDay(
  db: D1Database,
  workspace_id: string,
  bo_qua_id: string | null = null,
): Promise<number> {
  const d = await db
    .prepare(
      `SELECT count(*) AS n FROM project
        WHERE workspace_id = ? AND dang_day = 1 AND trang_thai <> 'archived' AND id IS NOT ?`,
    )
    .bind(workspace_id, bo_qua_id)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

/** Giới hạn WIP của workspace (0029, mặc định 3). */
export async function gioiHanWip(db: D1Database, workspace_id: string): Promise<number> {
  const d = await db
    .prepare('SELECT gioi_han_wip FROM workspace WHERE id = ?')
    .bind(workspace_id)
    .first<{ gioi_han_wip: number }>();
  return d?.gioi_han_wip ?? 3;
}

/** Một câu chèn `project_history` (0029) — ai, lúc, trường, cũ → mới. */
export function cauLichSuDuAn(
  db: D1Database,
  workspace_id: string,
  project_id: string | null,
  tac_gia: TacGia,
  luc: number,
  truong: string,
  gia_tri_cu: string | number | null | undefined,
  gia_tri_moi: string | number | null,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO project_history
         (id, workspace_id, project_id, tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      workspace_id,
      project_id,
      tac_gia.loai,
      tac_gia.agentId ?? null,
      luc,
      truong,
      gia_tri_cu === null || gia_tri_cu === undefined ? null : String(gia_tri_cu),
      gia_tri_moi === null ? null : String(gia_tri_moi),
    );
}

/**
 * Các trường `sua_du_an` sửa được. Khai một chỗ để luật "dự án lưu trữ chỉ sửa
 * được `trang_thai`" không bị bỏ sót khi thêm trường mới: thêm trường vào
 * `LenhSuaDuAn` mà quên danh sách này là **lỗi biên dịch**.
 */
const TRUONG_SUA_DU_AN = [
  'ten',
  'mo_ta',
  'mau',
  'nhom',
  'trang_thai',
  'quan_ly_agent_id',
  'khong_code',
  'bat_buoc_review',
  'nguong_dung_phut',
  ...TRUONG_BAN_DO_DU_AN,
] as const satisfies readonly Exclude<keyof LenhSuaDuAn, 'loai' | 'workspace_id' | 'ai' | 'project_id' | 'ma'>[];

function laTruongBanDo(t: string): boolean {
  return (TRUONG_BAN_DO_DU_AN as readonly string[]).includes(t);
}

export async function handlerSuaDuAn(
  lenh: LenhSuaDuAn,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaSuaDuAn>> {
  /*
   * **Quyền, trước mọi thứ khác** (kể cả tra dự án — BAT-59: agent không dò được
   * dự án qua đường này). Lệnh chỉ mang trường của Bản đồ (20.1) ⇒ chủ hoặc
   * `coordinator`; mang **bất kỳ** trường nào khác (kể cả `ma`, `nhom`) ⇒ chỉ chủ,
   * đúng luật cũ — không có cách đính một trường chỉ-chủ vào một lệnh của
   * `coordinator` để lọt qua.
   */
  const co_truong_chi_chu =
    lenh.ma !== undefined ||
    TRUONG_SUA_DU_AN.some((t) => !laTruongBanDo(t) && lenh[t] !== undefined);
  /*
   * Lệnh **không mang trường Bản đồ nào** (thân rỗng, hoặc chỉ trường cũ) đi đúng
   * cửa cũ "chỉ chủ" — SPEC 20.1 "Hành vi cũ không đổi": trước L1 agent gửi thân
   * rỗng nhận `FORBIDDEN`, không `INVALID_INPUT`/`NOT_FOUND` (điểm nhẹ reviewer L1).
   */
  const co_truong_ban_do = TRUONG_BAN_DO_DU_AN.some((t) => lenh[t] !== undefined);
  if (co_truong_chi_chu || !co_truong_ban_do) batBuocLaChu(lenh.ai, 'sửa được dự án');
  else {
    /*
     * 20.8: lệnh chỉ mang trường Bản đồ. Mỗi nhóm có mặt phải được phép — lẫn một
     * trường không được phép ⇒ `FORBIDDEN` **cả lệnh** (manager gửi `uu_tien` +
     * `trang_thai_ban_do` ⇒ FORBIDDEN). Kiểm **trước khi tra dự án** và chỉ đọc
     * `ai` (không DB): id bịa và id thật mà manager không quản lý ra **cùng**
     * `FORBIDDEN` — không kênh dò (BAT-59).
     */
    const co_uu_tien_ten_ngan = lenh.uu_tien !== undefined || lenh.ten_ngan !== undefined;
    const co_trang_thai_bd = TRUONG_TRANG_THAI_BAN_DO.some((t) => lenh[t] !== undefined);
    if (co_uu_tien_ten_ngan) batBuocKetQuaQuyen(quyenSuaBanDoDuAn(lenh.ai));
    if (co_trang_thai_bd) batBuocKetQuaQuyen(quyenSuaTrangThaiBanDo(lenh.ai, lenh.project_id));
  }

  // Mã **không đổi được sau khi tạo** — SPEC mục 2. Chặn ngay ở cửa ghi thay vì
  // để trigger `tg_project_ma_bat_bien` của DB bắn: như vậy ra đúng thân lỗi
  // `{ error, message }` của SPEC mục 13 chứ không phải lỗi SQLite thô.
  if (lenh.ma !== undefined) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Mã dự án không đổi được sau khi tạo.',
    });
  }

  // Kiểm nhập bốn trường Bản đồ **trước** khi tra dự án (nếp `handlerSuaTicket`):
  // giá trị sai ra `INVALID_INPUT` kèm khoảng dù dự án có hay không.
  const uu_tien = lenh.uu_tien === undefined ? undefined : kiemUuTienDuAn(lenh.uu_tien);
  let dang_day = lenh.dang_day === undefined ? undefined : kiemCo(lenh.dang_day, 'dang_day');
  let duy_tri = lenh.duy_tri === undefined ? undefined : kiemCo(lenh.duy_tri, 'duy_tri');
  const ten_ngan = lenh.ten_ngan === undefined ? undefined : kiemTenNgan(lenh.ten_ngan);
  /*
   * Ô "Trạng thái bản đồ" (20.8) ⇒ ba trường theo bảng 20.8. Gửi kèm một trong ba
   * trường đó là **mơ hồ** (hai nguồn cho cùng một cột) ⇒ `INVALID_INPUT`.
   */
  const trang_thai_ban_do =
    lenh.trang_thai_ban_do === undefined ? undefined : kiemTrangThaiBanDo(lenh.trang_thai_ban_do);
  let trang_thai_tu_o: 'active' | 'paused' | undefined;
  if (trang_thai_ban_do !== undefined) {
    if (lenh.trang_thai !== undefined || lenh.dang_day !== undefined || lenh.duy_tri !== undefined) {
      throw new BatonError('INVALID_INPUT', {
        message:
          'trang_thai_ban_do không gửi cùng trang_thai, dang_day hay duy_tri (SPEC 20.8: ô Trạng thái ghi cả ba).',
      });
    }
    const ghi = GHI_TRANG_THAI_BAN_DO[trang_thai_ban_do];
    trang_thai_tu_o = ghi.trang_thai;
    dang_day = ghi.dang_day;
    duy_tri = ghi.duy_tri;
  }

  /*
   * `coordinator` chỉ thấy dự án nó được vào (luật của `layDuAn`): ngoài phạm vi
   * ra **cùng** `NOT_FOUND` với id bịa (BAT-59, 19.12 câu 15). Chủ không lọc.
   */
  const loc = locPhamViTicket(lenh.ai, 'id');
  const cu = await db
    .prepare(
      `SELECT id, ma, ten, mo_ta, mau, trang_thai, quan_ly_agent_id, nhom,
              khong_code, bat_buoc_review, nguong_dung_phut,
              uu_tien, dang_day, duy_tri, ten_ngan
         FROM project WHERE id = ? AND workspace_id = ?${loc.sql}`,
    )
    .bind(lenh.project_id, lenh.workspace_id, ...loc.bind)
    .first<Record<string, string | number | null>>();
  if (cu === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy dự án.' });

  /*
   * Dự án lưu trữ là **chỉ đọc** (SPEC mục 2). Ngoại lệ duy nhất là chủ đổi
   * `trang_thai` để mở lại, nếu không thì lưu trữ là cửa một chiều
   * (`spec-questions.md` #15 chỉ xin ngoại lệ cho **riêng** trường đó).
   *
   * Nên lệnh sửa một dự án `archived` chỉ được mang **đúng** `trang_thai`. Chỉ
   * kiểm "có đổi trạng thái không" là không đủ: gửi kèm `trang_thai` cùng một
   * đống trường khác thì mọi trường kia cũng được ghi, tức lách được "chỉ đọc"
   * bằng cách đính thêm một trường vào request.
   */
  if (cu['trang_thai'] === 'archived') {
    /*
     * 20.8: Lưu trữ **không** nằm trong ô Trạng thái — chọn một giá trị của ô trên
     * dự án lưu trữ là một cách mở lại lưu trữ ngoài cửa của chủ ⇒ từ chối cho mọi
     * người gọi (`spec-questions.md`). Mở lại vẫn là chủ dùng `trang_thai` (mục 2).
     */
    if (trang_thai_ban_do !== undefined) {
      throw new BatonError('PROJECT_NOT_ACCEPTING', {
        message: `Dự án ${String(cu['ma'])} đã lưu trữ — ô Trạng thái không áp cho dự án lưu trữ; chủ mở lại lưu trữ trước (SPEC 20.8).`,
      });
    }
    /*
     * **Ngoại lệ thứ hai: bốn trường Bản đồ (20.1)** — câu hỏi SPEC (e), Manager
     * chốt tạm 04/11: "đặt cờ trên dự án lưu trữ vẫn cho theo quyền". Chúng là dữ
     * liệu xếp bản đồ, không đổi việc của dự án; dự án lưu trữ không lên bản đồ và
     * không đếm vào WIP (`demDangDay`). Mọi trường khác vẫn bị chặn như cũ.
     */
    const truong_khac = TRUONG_SUA_DU_AN.filter(
      (t) => t !== 'trang_thai' && !laTruongBanDo(t) && lenh[t] !== undefined,
    );
    const co_ban_do = TRUONG_BAN_DO_DU_AN.some((t) => lenh[t] !== undefined);
    if ((lenh.trang_thai === undefined && !co_ban_do) || truong_khac.length > 0) {
      throw new BatonError('PROJECT_NOT_ACCEPTING', {
        message: `Dự án ${String(cu['ma'])} đã lưu trữ, chỉ đọc. Đổi trạng thái trước khi sửa trường khác.`,
      });
    }
  }

  const dat: { cot: string; gia_tri: string | number | null }[] = [];

  if (lenh.ten !== undefined) dat.push({ cot: 'ten', gia_tri: kiemTenDuAn(lenh.ten) });
  if (lenh.mo_ta !== undefined) {
    dat.push({ cot: 'mo_ta', gia_tri: kiemChuTuyChon(lenh.mo_ta, 'Mô tả dự án') });
  }
  if (lenh.mau !== undefined) {
    dat.push({ cot: 'mau', gia_tri: kiemChuTuyChon(lenh.mau, 'Màu', 32) });
  }
  if (lenh.nhom !== undefined) {
    dat.push({ cot: 'nhom', gia_tri: kiemChuTuyChon(lenh.nhom, 'Nhóm dự án', 80) });
  }
  if (lenh.trang_thai !== undefined) {
    dat.push({ cot: 'trang_thai', gia_tri: kiemTrangThaiDuAn(lenh.trang_thai) });
  }
  // Ô Trạng thái (20.8) — cùng `UPDATE` với `dang_day`/`duy_tri` ở dưới.
  if (trang_thai_tu_o !== undefined) dat.push({ cot: 'trang_thai', gia_tri: trang_thai_tu_o });
  if (lenh.quan_ly_agent_id !== undefined) {
    dat.push({
      cot: 'quan_ly_agent_id',
      gia_tri: await kiemQuanLyAgent(db, lenh.workspace_id, lenh.quan_ly_agent_id),
    });
  }
  if (lenh.khong_code !== undefined) {
    dat.push({ cot: 'khong_code', gia_tri: kiemCo(lenh.khong_code, 'khong_code') ? 1 : 0 });
  }
  if (lenh.bat_buoc_review !== undefined) {
    dat.push({
      cot: 'bat_buoc_review',
      gia_tri: kiemCo(lenh.bat_buoc_review, 'bat_buoc_review') ? 1 : 0,
    });
  }
  // Ngưỡng đứng của dự án — SPEC mục 6 d.189. Khoảng 5–1440 kiểm ở hàm thuần
  // `kiemNguongDungPhut`; CHECK của migration 0006 là hàng rào cuối.
  if (lenh.nguong_dung_phut !== undefined) {
    dat.push({ cot: 'nguong_dung_phut', gia_tri: kiemNguongDungPhut(lenh.nguong_dung_phut) });
  }

  /*
   * **Bốn trường Bản đồ — SPEC 20.1.**
   *
   * `duy_tri` của dự án **sau** lệnh quyết hai luật:
   *   * Bật `dang_day` cho dự án duy trì (đang duy trì, hoặc lệnh cũng bật duy
   *     trì) ⇒ `INVALID_INPUT` — câu hỏi SPEC (a), chốt tạm 04/11: báo thẳng,
   *     không lặng lẽ đổi `duy_tri` hộ người gọi. Tắt `duy_tri` cùng lệnh thì cho.
   *   * Bật `duy_tri` ⇒ `dang_day = 0` **cùng batch** (20.1 "tự tắt"), ghi lịch sử
   *     như một thay đổi thường. Trigger `tg_project_duy_tri_*` (0029) là hàng rào
   *     cuối.
   */
  const duy_tri_sau = duy_tri === undefined ? cu['duy_tri'] === 1 : duy_tri;
  if (dang_day === true && duy_tri_sau) {
    throw new BatonError('INVALID_INPUT', { message: LOI_DUY_TRI_KHONG_DAY });
  }
  if (uu_tien !== undefined) dat.push({ cot: 'uu_tien', gia_tri: uu_tien });
  if (duy_tri !== undefined) dat.push({ cot: 'duy_tri', gia_tri: duy_tri ? 1 : 0 });
  if (duy_tri === true) dat.push({ cot: 'dang_day', gia_tri: 0 });
  else if (dang_day !== undefined) dat.push({ cot: 'dang_day', gia_tri: dang_day ? 1 : 0 });
  if (ten_ngan !== undefined) dat.push({ cot: 'ten_ngan', gia_tri: ten_ngan });

  if (dat.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Không có trường nào để sửa.' });
  }

  /*
   * **Đồng hồ WIP sau lệnh** (20.1, 20.2) — chỉ khi lệnh chạm `dang_day`/`duy_tri`.
   * Vượt giới hạn **vẫn cho** (20.7: không chặn cứng); kết quả mang `vuot` để CLI
   * cảnh báo. Dự án này đếm theo trạng thái **sau** lệnh (cả `trang_thai` nếu
   * chủ đổi cùng lúc); dự án lưu trữ không đếm (câu hỏi SPEC (e)).
   */
  let wip: TrangThaiWip | undefined;
  if (dang_day !== undefined || duy_tri !== undefined) {
    const gia_tri_sau = (cot: string): string | number | null => {
      const d = dat.find((x) => x.cot === cot);
      return d === undefined ? (cu[cot] ?? null) : d.gia_tri;
    };
    const minh_dang_day = gia_tri_sau('dang_day') === 1 && gia_tri_sau('trang_thai') !== 'archived';
    const n = (await demDangDay(db, lenh.workspace_id, lenh.project_id)) + (minh_dang_day ? 1 : 0);
    wip = trangThaiWip(n, await gioiHanWip(db, lenh.workspace_id));
  }
  const kem_wip = wip === undefined ? {} : { wip };

  // Chỉ ghi những trường **thật sự đổi giá trị**, để `da_doi` phản ánh đúng.
  const thay_doi = dat.filter((d) => cu[d.cot] !== d.gia_tri);

  if (thay_doi.length === 0) {
    return { cau_lenh: [], ket_qua: { id: lenh.project_id, da_doi: [], ...kem_wip } };
  }

  /*
   * **Lịch sử dự án** (20.1 → mục 4: ai, lúc, trường, cũ → mới) — **cùng batch**
   * với thay đổi, chỉ cho trường thật sự đổi (không đổi thì không ghi dòng). Kể cả
   * `dang_day` bị tự tắt vì bật `duy_tri`: tác giả là người ra lệnh, vì chính lệnh
   * đó gây ra thay đổi.
   */
  const tac_gia = tacGiaCua(lenh.ai);
  const lich_su = thay_doi
    .filter((d) => TRUONG_GHI_LICH_SU_DU_AN.has(d.cot))
    .map((d) =>
      cauLichSuDuAn(db, lenh.workspace_id, lenh.project_id, tac_gia, bay_gio, d.cot, cu[d.cot], d.gia_tri),
    );

  const gan = thay_doi.map((d) => `${d.cot} = ?`).join(', ');
  return {
    cau_lenh: [
      db
        .prepare(`UPDATE project SET ${gan}, cap_nhat_luc = ? WHERE id = ?`)
        .bind(...thay_doi.map((d) => d.gia_tri), bay_gio, lenh.project_id),
      ...lich_su,
    ],
    danh_thuc: [`du_an:${lenh.workspace_id}`, `du_an:${lenh.project_id}`],
    ket_qua: { id: lenh.project_id, da_doi: thay_doi.map((d) => d.cot), ...kem_wip },
  };
}

/* ------------------------------------------------------------------ *
 * Cài đặt workspace: giới hạn WIP — SPEC 20.1
 * ------------------------------------------------------------------ */

export interface LenhSuaCaiDatWorkspace extends LenhChung {
  loai: 'sua_cai_dat_workspace';
  /** 1–10, mặc định 3 (0029). */
  gioi_han_wip?: unknown;
}

export interface KetQuaSuaCaiDatWorkspace {
  gioi_han_wip: number;
  da_doi: string[];
  wip: TrangThaiWip;
}

/**
 * Đặt giới hạn WIP — **chỉ chủ** (20.1 cột "Ai sửa"); agent ⇒ `FORBIDDEN` trước
 * cả kiểm nhập (không kênh dò). Ghi lịch sử vào `project_history` với
 * `project_id` NULL (0029). Hạ giới hạn xuống dưới số đang đẩy vẫn cho: 20.7 không
 * chặn cứng; đồng hồ trả về `vuot`.
 */
export async function handlerSuaCaiDatWorkspace(
  lenh: LenhSuaCaiDatWorkspace,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaSuaCaiDatWorkspace>> {
  batBuocLaChu(lenh.ai, 'đổi được cài đặt workspace');
  if (lenh.gioi_han_wip === undefined) {
    throw new BatonError('INVALID_INPUT', { message: 'Không có trường nào để sửa.' });
  }
  const moi = kiemGioiHanWip(lenh.gioi_han_wip);
  const cu = await gioiHanWip(db, lenh.workspace_id);
  const wip = trangThaiWip(await demDangDay(db, lenh.workspace_id), moi);
  if (cu === moi) return { cau_lenh: [], ket_qua: { gioi_han_wip: moi, da_doi: [], wip } };

  return {
    cau_lenh: [
      db
        .prepare('UPDATE workspace SET gioi_han_wip = ?, cap_nhat_luc = ? WHERE id = ?')
        .bind(moi, bay_gio, lenh.workspace_id),
      cauLichSuDuAn(db, lenh.workspace_id, null, tacGiaCua(lenh.ai), bay_gio, 'gioi_han_wip', cu, moi),
    ],
    danh_thuc: [`du_an:${lenh.workspace_id}`],
    ket_qua: { gioi_han_wip: moi, da_doi: ['gioi_han_wip'], wip },
  };
}
