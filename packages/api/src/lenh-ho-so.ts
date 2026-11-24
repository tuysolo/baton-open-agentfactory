/**
 * Lệnh ghi về **hồ sơ dự án** và **Luật chung** — SPEC mục 9 d.294–303.
 *
 * Ba lệnh:
 *   * `sua_ho_so_du_an` — sửa các mục markdown của d.296–298, **chụp một phiên
 *     bản** của bản cũ trước khi ghi (d.303).
 *   * `them_loi_da_gap` — thêm một mục vào danh sách **chỉ thêm** của d.299.
 *   * `sua_luat_chung` — trang "Luật chung" của workspace (d.301).
 *
 * ## Ai được ghi: SPEC IM LẶNG, và đây là đề xuất tạm (`cau-hoi-spec.md` #113)
 *
 * Mục 9 không nói ai sửa hồ sơ, và bảng quyền mục 3 **không có hàng nào** cho
 * việc này. Theo nếp 19.12 câu 13 và câu 37, **không mượn** một hàng khác của
 * bảng quyền — mượn là âm thầm đổi nghĩa hàng đó. Đề xuất tạm, theo hướng chặt
 * (nới dễ hơn siết):
 *
 *   * **Sửa hồ sơ và Luật chung: chỉ chủ.** Hồ sơ là trang "đọc trước" mà agent
 *     **đọc** (d.294, d.301 "Agent đọc được qua CLI hoặc MCP"); không câu nào
 *     cho agent **ghi** nó. Một agent sửa được danh sách cấm riêng của dự án là
 *     agent sửa được chính luật ràng nó.
 *   * **Thêm "Lỗi đã gặp": chủ, hoặc agent được vào dự án.** d.299 gọi nó là một
 *     danh sách **chỉ thêm** — khuôn của một sổ bài học, và người biết một lỗi
 *     vừa xảy ra là agent vừa gặp nó. Chỉ thêm (trigger của 0018) nên một agent
 *     không xoá được bài học của ai.
 */

import {
  BatonError,
  kiemChuTuyChon,
  ngayDiaPhuong,
  type TacGia,
} from '@baton/shared';
import {
  batBuocKhongLuuTru,
  batBuocLaChu,
  batBuocVaoDuocDuAn,
  duAnBatBuoc,
  tacGiaCua,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';

/* ------------------------------------------------------------------ *
 * Các mục của hồ sơ — một danh sách duy nhất
 * ------------------------------------------------------------------ */

/**
 * **Chín mục của d.296–298**, khai **một chỗ**.
 *
 * Mọi thứ khác đi theo danh sách này: kiểm nhập, câu `UPDATE`, ảnh chụp phiên
 * bản, và đường đọc. Thêm một mục vào mục 9 ở lượt sau = thêm một dòng ở đây
 * cộng một cột ở migration — **không** phải sửa bốn chỗ rồi quên một chỗ.
 */
export const MUC_HO_SO = [
  'la_gi',
  'thu_muc',
  'repo_chu_so_huu',
  'repo_ten',
  'repo_nhanh_mac_dinh',
  'stack',
  'doc_truoc',
  'cach_deploy',
  'danh_sach_cam',
] as const;

export type MucHoSo = (typeof MUC_HO_SO)[number];

/** Nhãn dùng trong thông điệp lỗi của `kiemChuTuyChon`. */
const NHAN_MUC: Record<MucHoSo, string> = {
  la_gi: 'Là gì',
  thu_muc: 'Thư mục hoặc nguồn',
  repo_chu_so_huu: 'Chủ sở hữu repo',
  repo_ten: 'Tên repo',
  repo_nhanh_mac_dinh: 'Nhánh mặc định',
  stack: 'Stack',
  doc_truoc: 'Đọc trước',
  cach_deploy: 'Cách deploy và ai chạy',
  danh_sach_cam: 'Danh sách cấm riêng',
};

/** Trần độ dài của một mục markdown. Dài hơn là một file, không phải một mục. */
const DAI_MUC_TOI_DA = 20_000;

/* ------------------------------------------------------------------ *
 * Sửa hồ sơ — d.296–298 + d.303
 * ------------------------------------------------------------------ */

export interface LenhSuaHoSoDuAn extends LenhChung {
  loai: 'sua_ho_so_du_an';
  project_id: string;
  /** Chỉ những mục **có mặt** mới được đổi; `null` = xoá nội dung mục đó. */
  la_gi?: string | null;
  thu_muc?: string | null;
  repo_chu_so_huu?: string | null;
  repo_ten?: string | null;
  repo_nhanh_mac_dinh?: string | null;
  stack?: string | null;
  doc_truoc?: string | null;
  cach_deploy?: string | null;
  danh_sach_cam?: string | null;
}

export interface KetQuaSuaHoSoDuAn {
  project_id: string;
  /** Phiên bản **mới** sau lần sửa này (d.303). */
  phien_ban: number;
  da_doi: string[];
}

interface DongHoSo extends Record<MucHoSo, string | null> {
  project_id: string;
  phien_ban: number;
  tao_luc: number;
}

export async function handlerSuaHoSoDuAn(
  lenh: LenhSuaHoSoDuAn,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaSuaHoSoDuAn>> {
  // Đề xuất tạm #113(a): chỉ chủ. Xem khối ghi chú ở đầu file.
  batBuocLaChu(lenh.ai, 'sửa được hồ sơ dự án');

  /*
   * Kiểm nhập **trước** khi tra dự án (luật chung của mọi handler ghi): một mục
   * quá dài phải ra `INVALID_INPUT` dù dự án có tồn tại hay không. Tra trước thì
   * lỗi nhập bị `NOT_FOUND` che.
   */
  const dat: { cot: MucHoSo; gia_tri: string | null }[] = [];
  for (const m of MUC_HO_SO) {
    const v = lenh[m];
    if (v === undefined) continue;
    dat.push({ cot: m, gia_tri: kiemChuTuyChon(v, NHAN_MUC[m], DAI_MUC_TOI_DA) });
  }
  if (dat.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Không có mục nào để sửa.' });
  }

  const du_an = await duAnBatBuoc(db, lenh.workspace_id, lenh.project_id);
  // Dự án `archived` là **chỉ đọc** (mục 2, 19.12 câu 25) — hồ sơ cũng vậy.
  batBuocKhongLuuTru(du_an);

  const cot = MUC_HO_SO.join(', ');
  const cu = await db
    .prepare(
      `SELECT project_id, ${cot}, phien_ban, tao_luc
         FROM project_ho_so WHERE project_id = ? AND workspace_id = ?`,
    )
    .bind(lenh.project_id, lenh.workspace_id)
    .first<DongHoSo>();

  const tac_gia = tacGiaCua(lenh.ai);
  const cau_lenh: D1PreparedStatement[] = [];

  if (cu === null) {
    /*
     * **Chưa có hồ sơ ⇒ bản 1, và KHÔNG chụp ảnh nào.** d.303 nói "mỗi lần
     * **sửa** hồ sơ ghi lịch sử phiên bản"; lần tạo đầu không sửa gì, nên một
     * ảnh chụp "bản rỗng" chỉ là một dòng lịch sử không nói gì.
     */
    const gia_tri = MUC_HO_SO.map((m) => dat.find((d) => d.cot === m)?.gia_tri ?? null);
    cau_lenh.push(
      db
        .prepare(
          `INSERT INTO project_ho_so
             (project_id, workspace_id, ${cot}, phien_ban, tao_luc, cap_nhat_luc)
           VALUES (?, ?, ${MUC_HO_SO.map(() => '?').join(', ')}, 1, ?, ?)`,
        )
        .bind(lenh.project_id, lenh.workspace_id, ...gia_tri, bay_gio, bay_gio),
    );
    return {
      cau_lenh,
      danh_thuc: [`du_an:${lenh.project_id}`],
      ket_qua: { project_id: lenh.project_id, phien_ban: 1, da_doi: dat.map((d) => d.cot) },
    };
  }

  // Chỉ ghi những mục **thật sự đổi giá trị**, để `da_doi` phản ánh đúng.
  const thay_doi = dat.filter((d) => cu[d.cot] !== d.gia_tri);
  if (thay_doi.length === 0) {
    return {
      cau_lenh: [],
      ket_qua: { project_id: lenh.project_id, phien_ban: cu.phien_ban, da_doi: [] },
    };
  }

  /*
   * **d.303 — chụp bản CŨ trước khi ghi bản mới.** Ảnh chụp mang số phiên bản
   * của chính bản cũ, nên chuỗi phiên bản đọc lại được từ 1 đến hiện tại mà
   * không có khoảng trống.
   */
  const anh: Record<string, string | null> = {};
  for (const m of MUC_HO_SO) anh[m] = cu[m];

  cau_lenh.push(
    db
      .prepare(
        `INSERT INTO project_ho_so_ban
           (id, workspace_id, project_id, phien_ban, anh_json,
            sua_boi_loai, sua_boi_agent_id, luc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        lenh.workspace_id,
        lenh.project_id,
        cu.phien_ban,
        JSON.stringify(anh),
        tac_gia.loai === 'agent' ? 'agent' : 'owner',
        tac_gia.loai === 'agent' ? (tac_gia.agentId ?? null) : null,
        bay_gio,
      ),
  );

  const gan = thay_doi.map((d) => `${d.cot} = ?`).join(', ');
  cau_lenh.push(
    db
      .prepare(
        `UPDATE project_ho_so
            SET ${gan}, phien_ban = phien_ban + 1, cap_nhat_luc = ?
          WHERE project_id = ? AND workspace_id = ?`,
      )
      .bind(...thay_doi.map((d) => d.gia_tri), bay_gio, lenh.project_id, lenh.workspace_id),
  );

  return {
    cau_lenh,
    danh_thuc: [`du_an:${lenh.project_id}`],
    ket_qua: {
      project_id: lenh.project_id,
      phien_ban: cu.phien_ban + 1,
      da_doi: thay_doi.map((d) => d.cot),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Thêm một "Lỗi đã gặp" — d.299, chỉ thêm
 * ------------------------------------------------------------------ */

export interface LenhThemLoiDaGap extends LenhChung {
  loai: 'them_loi_da_gap';
  project_id: string;
  loi: unknown;
  cach_tranh?: string | null;
}

export interface KetQuaThemLoiDaGap {
  id: string;
  project_id: string;
  ngay: string;
}

export async function handlerThemLoiDaGap(
  lenh: LenhThemLoiDaGap,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaThemLoiDaGap>> {
  const loi = typeof lenh.loi === 'string' ? lenh.loi.trim() : '';
  if (loi === '' || loi.length > DAI_MUC_TOI_DA) {
    throw new BatonError('INVALID_INPUT', {
      message: `Mục "Lỗi đã gặp" phải có 1–${String(DAI_MUC_TOI_DA)} ký tự.`,
    });
  }
  const cach_tranh = kiemChuTuyChon(lenh.cach_tranh, 'Cách tránh', DAI_MUC_TOI_DA);

  /*
   * **Tra dự án TRONG phạm vi đọc của người gọi** (BAT-59, 19.12 câu 15; cùng
   * khuôn #175/#176): agent không thấy dự án (ngoài `agent_project`, luật của
   * `layDuAn`) đi qua **cùng dòng `throw NOT_FOUND`** với id bịa — cùng mã,
   * thông điệp, status, thân — và không ghi gì. Trước BAT-59 câu tra cả
   * workspace rồi mới kiểm `batBuocVaoDuocDuAn`, nên id thật ngoài phạm vi ra 403
   * còn id bịa ra 404: một máy dò dự án.
   */
  const du_an = await duAnBatBuoc(db, lenh.workspace_id, lenh.project_id, lenh.ai);

  /*
   * **Cổng phạm vi chạy TRƯỚC cổng `archived`** — mục 13 d.385: "404 cũng dùng
   * khi đối tượng **ngoài phạm vi**, để không lộ sự tồn tại". (Từ BAT-59 nhánh
   * "ngoài phạm vi" đã rơi ở câu tra trên; dòng dưới còn giữ cho ca **thấy được**
   * mà không được ghi — agent bị tắt — ra `FORBIDDEN`.)
   *
   * Thứ tự ngược lại (archived trước) rò hai thứ cho một agent **không** được
   * vào dự án: một dự án ngoài phạm vi mà đang `archived` sẽ trả
   * `PROJECT_NOT_ACCEPTING`/409 thay vì 404, nên agent biết **dự án đó tồn tại**
   * và biết luôn **trạng thái** của nó. Nếp đúng đã có ở `lenh-binh-luan.ts`:
   * `batBuocVaoDuocDuAn` trước, `batBuocKhongLuuTru` sau.
   *
   * Đề xuất tạm #113(b): chủ, hoặc agent **được vào dự án**. Không mượn hàng nào
   * của bảng quyền mục 3 (nếp 19.12 câu 13).
   */
  batBuocVaoDuocDuAn(lenh.ai, lenh.project_id, 'ghi một mục "Lỗi đã gặp"');
  // Dự án `archived` là **chỉ đọc** (mục 2, 19.12 câu 25).
  batBuocKhongLuuTru(du_an);

  const tac_gia: TacGia = tacGiaCua(lenh.ai);
  const id = crypto.randomUUID();
  /*
   * **Ngày trên tường theo múi giờ nghiệp vụ** — 19.12 câu 60. `ngayDiaPhuong`
   * là đúng một hàm cho cả hệ (Nhật ký cũng dùng nó), nên "ngày" của d.299 và
   * "ngày" của d.311 không bao giờ lệch nhau một ngày.
   */
  const ngay = ngayDiaPhuong(bay_gio);

  return {
    cau_lenh: [
      db
        .prepare(
          `INSERT INTO project_loi_da_gap
             (id, workspace_id, project_id, ngay, loi, cach_tranh,
              ghi_boi_loai, ghi_boi_agent_id, tao_luc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          lenh.workspace_id,
          lenh.project_id,
          ngay,
          loi,
          cach_tranh,
          tac_gia.loai === 'agent' ? 'agent' : 'owner',
          tac_gia.loai === 'agent' ? (tac_gia.agentId ?? null) : null,
          bay_gio,
        ),
    ],
    danh_thuc: [`du_an:${lenh.project_id}`],
    ket_qua: { id, project_id: lenh.project_id, ngay },
  };
}

/* ------------------------------------------------------------------ *
 * Luật chung của workspace — d.301
 * ------------------------------------------------------------------ */

export interface LenhSuaLuatChung extends LenhChung {
  loai: 'sua_luat_chung';
  danh_sach_cam?: string | null;
  checklist?: string | null;
}

/**
 * **Không `async`** — và đó là một lựa chọn, không một sơ sót: khác hai handler
 * trên, lệnh này **không tra gì** (Luật chung là một hàng duy nhất của workspace,
 * không có dự án nào để tra phạm vi). Một `async` không `await` ở đây chỉ che mất
 * sự thật đó.
 */
export function handlerSuaLuatChung(
  lenh: LenhSuaLuatChung,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ workspace_id: string; da_doi: string[] }>> {
  batBuocLaChu(lenh.ai, 'sửa được trang Luật chung');

  const dat: { cot: 'danh_sach_cam' | 'checklist'; gia_tri: string | null }[] = [];
  if (lenh.danh_sach_cam !== undefined) {
    dat.push({
      cot: 'danh_sach_cam',
      gia_tri: kiemChuTuyChon(lenh.danh_sach_cam, 'Danh sách cấm chung', DAI_MUC_TOI_DA),
    });
  }
  if (lenh.checklist !== undefined) {
    dat.push({
      cot: 'checklist',
      gia_tri: kiemChuTuyChon(lenh.checklist, 'Checklist trước khi giao', DAI_MUC_TOI_DA),
    });
  }
  if (dat.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Không có mục nào để sửa.' });
  }

  /*
   * `INSERT … ON CONFLICT DO UPDATE`: một workspace chưa có hàng Luật chung là
   * trạng thái thường gặp (chưa ai soạn), và hai lệnh (`INSERT` rồi `UPDATE`)
   * cho cùng một ý là một chỗ để đua. Chỉ đặt **những cột được gửi**, nên sửa
   * `checklist` không xoá `danh_sach_cam`.
   */
  const cot = dat.map((d) => d.cot);
  const gan = cot.map((c) => `${c} = excluded.${c}`).join(', ');
  return Promise.resolve({
    cau_lenh: [
      db
        .prepare(
          `INSERT INTO luat_chung (workspace_id, ${cot.join(', ')}, cap_nhat_luc)
           VALUES (?, ${cot.map(() => '?').join(', ')}, ?)
           ON CONFLICT (workspace_id)
             DO UPDATE SET ${gan}, cap_nhat_luc = excluded.cap_nhat_luc`,
        )
        .bind(lenh.workspace_id, ...dat.map((d) => d.gia_tri), bay_gio),
    ],
    danh_thuc: [`du_an:${lenh.workspace_id}`],
    ket_qua: { workspace_id: lenh.workspace_id, da_doi: cot },
  });
}
