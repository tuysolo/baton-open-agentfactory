/**
 * Lệnh ghi về **agent**, **token** và **bảng quyền** — SPEC mục 3, 15.
 *
 * Luật được cài ở đây:
 *   * **Tạo agent: chỉ chủ.** Tên **duy nhất**, vai trò (**đúng 1 trong 4**),
 *     model (chữ tự do), mô tả, danh sách dự án được vào **hoặc "tất cả"**, quyền.
 *   * **Token:** sinh khi tạo, trả về **đúng một lần**. `tao_lai_token` làm token
 *     cũ **hết hiệu lực ngay**; `thu_hoi_token` bỏ hẳn. Chỉ chủ.
 *     Server **chỉ lưu dạng băm** (SPEC mục 3, 15).
 *   * Bật/tắt agent (`disabled`): agent bị tắt gọi API bị từ chối (ở `xac-thuc.ts`).
 *   * Quyền: mặc định theo vai trò nằm trong `@baton/shared/quyen`; bảng
 *     `agent_permission` chỉ chứa **ô chủ đã chỉnh**. Hai hàng "không bao giờ"
 *     không nhận ghi đè ở cả ba tầng: code ở đây, module quyền, và CHECK của DB.
 */

import {
  BatonError,
  VIEC_KHONG_BAO_GIO,
  bamToken,
  bonKyTuCuoi,
  kiemChuTuyChon,
  kiemCo,
  kiemNguongDungPhut,
  kiemTenAgent,
  kiemVaiTroAgent,
  laPhamViQuyen,
  laViecGhiDeDuoc,
  laViecQuyen,
  sinhToken,
  type PhamViQuyen,
  type VaiTroAgent,
  type ViecGhiDeDuoc,
} from '@baton/shared';
import {
  batBuocLaChu,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';
import { chayTheoLo } from './chia-lo-tham-so.js';

/* ------------------------------------------------------------------ *
 * Giúp việc
 * ------------------------------------------------------------------ */

/** Danh sách dự án được vào: mọi dự án phải có thật trong cùng workspace. */
async function kiemDanhSachDuAn(
  db: D1Database,
  workspace_id: string,
  du_an: unknown,
): Promise<string[]> {
  if (du_an === undefined || du_an === null) return [];
  if (!Array.isArray(du_an) || du_an.some((x) => typeof x !== 'string')) {
    throw new BatonError('INVALID_INPUT', {
      message: 'du_an_duoc_vao phải là danh sách id dự án.',
    });
  }
  const ids = [...new Set(du_an as string[])];
  if (ids.length === 0) return [];

  /*
   * Chia lô (`chia-lo-tham-so.ts`): 1 tham số khác (`workspace_id`). `ids` đã bỏ
   * trùng nên mỗi id ở đúng một lô; so **tổng** số dòng của mọi lô với số id —
   * so từng lô riêng thì vẫn đúng, nhưng một chỗ so là một định nghĩa.
   */
  const results = await chayTheoLo(ids, 1, async (lo, cho) => {
    const r = await db
      .prepare(`SELECT id FROM project WHERE workspace_id = ? AND id IN (${cho})`)
      .bind(workspace_id, ...lo)
      .all<{ id: string }>();
    return r.results;
  });

  if (results.length !== ids.length) {
    throw new BatonError('NOT_FOUND', { message: 'Có dự án trong danh sách không tồn tại.' });
  }
  return ids;
}

/** Tra agent trong đúng workspace; ngoài phạm vi → `NOT_FOUND` (SPEC mục 13). */
async function agentBatBuoc(
  db: D1Database,
  workspace_id: string,
  agent_id: string,
): Promise<{ id: string; ten: string; vai_tro: string; disabled: number }> {
  const d = await db
    .prepare('SELECT id, ten, vai_tro, disabled FROM agent WHERE id = ? AND workspace_id = ?')
    .bind(agent_id, workspace_id)
    .first<{ id: string; ten: string; vai_tro: string; disabled: number }>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy agent.' });
  return d;
}

/**
 * Tên agent **duy nhất** trong workspace — SPEC mục 3.
 * Kiểm trong cửa ghi nên không có đua; `ux_agent_ten` là hàng rào cuối.
 */
async function batBuocTenChuaDung(
  db: D1Database,
  workspace_id: string,
  ten: string,
  tru_agent_id?: string,
): Promise<void> {
  const d = await db
    .prepare('SELECT id FROM agent WHERE workspace_id = ? AND ten = ?')
    .bind(workspace_id, ten)
    .first<{ id: string }>();
  if (d !== null && d.id !== tru_agent_id) {
    throw new BatonError('INVALID_INPUT', { message: `Tên agent "${ten}" đã có.` });
  }
}

/* ------------------------------------------------------------------ *
 * Tạo agent — SPEC mục 3
 * ------------------------------------------------------------------ */

export interface LenhTaoAgent extends LenhChung {
  loai: 'tao_agent';
  ten: string;
  vai_tro: string;
  model?: string | null;
  mo_ta?: string | null;
  /** Danh sách dự án được vào; bỏ qua khi `vao_tat_ca_du_an`. */
  du_an_duoc_vao?: string[];
  /** Cờ "tất cả" — SPEC mục 3. */
  vao_tat_ca_du_an?: boolean;
}

export interface KetQuaTaoAgent {
  id: string;
  ten: string;
  vai_tro: VaiTroAgent;
  /**
   * Token thô, **hiện đúng một lần duy nhất** (SPEC mục 3). Không bao giờ đọc
   * lại được: server chỉ giữ bản băm.
   */
  token: string;
  token_bon_cuoi: string;
}

export async function handlerTaoAgent(
  lenh: LenhTaoAgent,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaTaoAgent>> {
  batBuocLaChu(lenh.ai, 'tạo được agent');

  const ten = kiemTenAgent(lenh.ten);
  const vai_tro = kiemVaiTroAgent(lenh.vai_tro);
  const model = kiemChuTuyChon(lenh.model, 'Model', 120);
  const mo_ta = kiemChuTuyChon(lenh.mo_ta, 'Mô tả agent');
  const vao_tat_ca =
    lenh.vao_tat_ca_du_an === undefined ? false : kiemCo(lenh.vao_tat_ca_du_an, 'vao_tat_ca_du_an');
  const du_an = vao_tat_ca
    ? []
    : await kiemDanhSachDuAn(db, lenh.workspace_id, lenh.du_an_duoc_vao);

  await batBuocTenChuaDung(db, lenh.workspace_id, ten);

  const id = crypto.randomUUID();
  const token = sinhToken();
  const bam = await bamToken(token);

  const cau_lenh = [
    db
      .prepare(
        `INSERT INTO agent
           (id, workspace_id, ten, vai_tro, model, mo_ta, disabled, vao_tat_ca_du_an,
            token_bam, token_bon_cuoi, token_tao_luc, tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        lenh.workspace_id,
        ten,
        vai_tro,
        model,
        mo_ta,
        vao_tat_ca ? 1 : 0,
        bam,
        bonKyTuCuoi(token),
        bay_gio,
        bay_gio,
        bay_gio,
      ),
    ...du_an.map((project_id) =>
      db
        .prepare(
          `INSERT INTO agent_project (workspace_id, agent_id, project_id, tao_luc)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(lenh.workspace_id, id, project_id, bay_gio),
    ),
  ];

  return {
    cau_lenh,
    danh_thuc: [`agent:${lenh.workspace_id}`],
    ket_qua: { id, ten, vai_tro, token, token_bon_cuoi: bonKyTuCuoi(token) },
  };
}

/* ------------------------------------------------------------------ *
 * Sửa agent (gồm bật/tắt) — SPEC mục 3
 * ------------------------------------------------------------------ */

export interface LenhSuaAgent extends LenhChung {
  loai: 'sua_agent';
  agent_id: string;
  ten?: string;
  vai_tro?: string;
  model?: string | null;
  mo_ta?: string | null;
  disabled?: boolean;
  du_an_duoc_vao?: string[];
  vao_tat_ca_du_an?: boolean;
  /**
   * **Ngưỡng đứng theo agent** — SPEC mục 6 dòng 189 (5–1440 phút).
   * `null` = bỏ đặt riêng, rơi về ngưỡng của dự án rồi về mặc định 30 phút
   * (thứ tự ở `nguongDungPhut` của `@baton/shared`).
   */
  nguong_dung_phut?: number | null;
}

export async function handlerSuaAgent(
  lenh: LenhSuaAgent,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ id: string; da_doi: string[] }>> {
  batBuocLaChu(lenh.ai, 'sửa được agent');
  const cu = await agentBatBuoc(db, lenh.workspace_id, lenh.agent_id);

  const dat: { cot: string; gia_tri: string | number | null }[] = [];
  const da_doi: string[] = [];

  if (lenh.ten !== undefined) {
    const ten = kiemTenAgent(lenh.ten);
    await batBuocTenChuaDung(db, lenh.workspace_id, ten, lenh.agent_id);
    dat.push({ cot: 'ten', gia_tri: ten });
  }
  let doi_vai_tro = false;
  if (lenh.vai_tro !== undefined) {
    const vai_tro = kiemVaiTroAgent(lenh.vai_tro);
    doi_vai_tro = vai_tro !== cu.vai_tro;
    dat.push({ cot: 'vai_tro', gia_tri: vai_tro });
  }
  if (lenh.model !== undefined) {
    dat.push({ cot: 'model', gia_tri: kiemChuTuyChon(lenh.model, 'Model', 120) });
  }
  if (lenh.mo_ta !== undefined) {
    dat.push({ cot: 'mo_ta', gia_tri: kiemChuTuyChon(lenh.mo_ta, 'Mô tả agent') });
  }
  if (lenh.disabled !== undefined) {
    dat.push({ cot: 'disabled', gia_tri: kiemCo(lenh.disabled, 'disabled') ? 1 : 0 });
  }
  if (lenh.vao_tat_ca_du_an !== undefined) {
    dat.push({
      cot: 'vao_tat_ca_du_an',
      gia_tri: kiemCo(lenh.vao_tat_ca_du_an, 'vao_tat_ca_du_an') ? 1 : 0,
    });
  }
  // Ngưỡng đứng của agent — SPEC mục 6 d.189 (5–1440 phút, `null` = bỏ).
  if (lenh.nguong_dung_phut !== undefined) {
    dat.push({ cot: 'nguong_dung_phut', gia_tri: kiemNguongDungPhut(lenh.nguong_dung_phut) });
  }

  const cau_lenh: D1PreparedStatement[] = [];

  /*
   * **Đổi vai trò thì dọn sạch ô ghi đè quyền.**
   *
   * SPEC mục 3 nói quyền là "theo vai trò (mặc định; chủ chỉnh được từng
   * agent)" — ô ghi đè là chỉnh **so với một vai trò cụ thể**. Giữ nguyên ô cũ
   * khi vai trò đổi thì ý nghĩa của nó đổi theo, âm thầm:
   * một `worker` được nới `create_ticket` thành "mọi dự án được vào", đổi thành
   * `coordinator` thì ô đó vẫn còn và chẳng nới gì (trùng mặc định); ngược lại
   * một ô **siết** của `coordinator` sẽ theo sang `worker` và siết tiếp một ô
   * vốn đã hẹp hơn. Cả hai đều là quyền không ai chủ ý đặt.
   *
   * Nên đổi vai trò = quyền về **mặc định của vai trò mới**; chủ muốn chỉnh thì
   * chỉnh lại, tường minh. Xoá ở đây là xoá **ô cấu hình**, không phải dữ liệu
   * nghiệp vụ, nên không thuộc hàng "Xoá bất cứ thứ gì" của bảng quyền.
   */
  if (doi_vai_tro) {
    cau_lenh.push(
      db.prepare('DELETE FROM agent_permission WHERE agent_id = ?').bind(lenh.agent_id),
    );
    da_doi.push('quyen_ve_mac_dinh_vai_tro');
  }

  // Danh sách dự án được vào: thay **toàn bộ** (đặt lại cả danh sách), không gộp
  // thêm. Client gửi danh sách đầy đủ, như `baton` CLI vẫn làm với kế hoạch phiên
  // (SPEC mục 6 "agent gửi lại toàn bộ danh sách mỗi lần cập nhật").
  if (lenh.du_an_duoc_vao !== undefined) {
    const du_an = await kiemDanhSachDuAn(db, lenh.workspace_id, lenh.du_an_duoc_vao);
    cau_lenh.push(
      db.prepare('DELETE FROM agent_project WHERE agent_id = ?').bind(lenh.agent_id),
      ...du_an.map((project_id) =>
        db
          .prepare(
            `INSERT INTO agent_project (workspace_id, agent_id, project_id, tao_luc)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(lenh.workspace_id, lenh.agent_id, project_id, bay_gio),
      ),
    );
    da_doi.push('du_an_duoc_vao');
  }

  if (dat.length === 0 && cau_lenh.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Không có trường nào để sửa.' });
  }

  if (dat.length > 0) {
    const gan = dat.map((d) => `${d.cot} = ?`).join(', ');
    cau_lenh.unshift(
      db
        .prepare(`UPDATE agent SET ${gan}, cap_nhat_luc = ? WHERE id = ?`)
        .bind(...dat.map((d) => d.gia_tri), bay_gio, lenh.agent_id),
    );
    da_doi.unshift(...dat.map((d) => d.cot));
  }

  return {
    cau_lenh,
    danh_thuc: [`agent:${lenh.workspace_id}`, `agent:${lenh.agent_id}`],
    ket_qua: { id: cu.id, da_doi },
  };
}

/* ------------------------------------------------------------------ *
 * Token — SPEC mục 3, 15
 * ------------------------------------------------------------------ */

export interface LenhTaoLaiToken extends LenhChung {
  loai: 'tao_lai_token';
  agent_id: string;
}

export interface KetQuaTaoLaiToken {
  agent_id: string;
  /** Hiện **đúng một lần** (SPEC mục 3). */
  token: string;
  token_bon_cuoi: string;
}

/**
 * Tạo lại token: **token cũ hết hiệu lực ngay** (SPEC mục 3).
 *
 * Cách làm: ghi đè `token_bam` bằng băm mới trong cùng một `UPDATE`. Băm cũ biến
 * mất khỏi bảng, nên `agentTheoToken` không tra ra nó nữa — không có khoảng thời
 * gian nào hai token cùng sống, và không cần dọn dẹp về sau.
 */
export async function handlerTaoLaiToken(
  lenh: LenhTaoLaiToken,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaTaoLaiToken>> {
  batBuocLaChu(lenh.ai, 'tạo lại được token');
  await agentBatBuoc(db, lenh.workspace_id, lenh.agent_id);

  const token = sinhToken();
  const bam = await bamToken(token);

  return {
    cau_lenh: [
      db
        .prepare(
          `UPDATE agent
              SET token_bam = ?, token_bon_cuoi = ?, token_tao_luc = ?,
                  token_thu_hoi_luc = NULL, cap_nhat_luc = ?
            WHERE id = ?`,
        )
        .bind(bam, bonKyTuCuoi(token), bay_gio, bay_gio, lenh.agent_id),
    ],
    danh_thuc: [`agent:${lenh.agent_id}`],
    ket_qua: { agent_id: lenh.agent_id, token, token_bon_cuoi: bonKyTuCuoi(token) },
  };
}

export interface LenhThuHoiToken extends LenhChung {
  loai: 'thu_hoi_token';
  agent_id: string;
}

/**
 * Thu hồi token — SPEC mục 3.
 *
 * Đặt `token_thu_hoi_luc` **và** bỏ `token_bam` về NULL. Giữ `token_bon_cuoi`
 * để UI còn hiện được "token đã thu hồi, …abcd", đúng như SPEC mục 3 nói "sau đó
 * chỉ hiện 4 ký tự cuối". Bỏ `token_bam` để không còn dòng nào tra ra được, kể
 * cả khi một truy vấn sau này quên điều kiện `token_thu_hoi_luc IS NULL`.
 */
export async function handlerThuHoiToken(
  lenh: LenhThuHoiToken,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ agent_id: string; da_thu_hoi: true }>> {
  batBuocLaChu(lenh.ai, 'thu hồi được token');
  await agentBatBuoc(db, lenh.workspace_id, lenh.agent_id);

  return {
    cau_lenh: [
      db
        .prepare(
          `UPDATE agent
              SET token_bam = NULL, token_thu_hoi_luc = ?, cap_nhat_luc = ?
            WHERE id = ?`,
        )
        .bind(bay_gio, bay_gio, lenh.agent_id),
    ],
    danh_thuc: [`agent:${lenh.agent_id}`],
    ket_qua: { agent_id: lenh.agent_id, da_thu_hoi: true },
  };
}

/* ------------------------------------------------------------------ *
 * Ghi đè một ô của bảng quyền — SPEC mục 3
 * ------------------------------------------------------------------ */

export interface LenhDatQuyen extends LenhChung {
  loai: 'dat_quyen';
  agent_id: string;
  /** Hàng trong bảng quyền (SPEC mục 3). */
  viec: string;
  /** `null` = **bỏ ghi đè**, trả ô về mặc định của vai trò. */
  cho_phep: boolean | null;
  /** Phạm vi của ô; để trống thì giữ phạm vi mặc định của vai trò. */
  pham_vi?: string | null;
}

export async function handlerDatQuyen(
  lenh: LenhDatQuyen,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ agent_id: string; viec: string; cho_phep: boolean | null }>> {
  batBuocLaChu(lenh.ai, 'chỉnh được quyền của agent');
  await agentBatBuoc(db, lenh.workspace_id, lenh.agent_id);

  if (!laViecQuyen(lenh.viec)) {
    throw new BatonError('INVALID_INPUT', { message: 'Việc không có trong bảng quyền.' });
  }

  // Hai hàng "không bao giờ" — SPEC mục 3. **Chủ cũng không ghi đè được.**
  // Đây là hàng rào thứ nhất (code); module quyền là hàng rào thứ hai; CHECK của
  // `agent_permission` trong migration 0001 là hàng rào thứ ba.
  if ((VIEC_KHONG_BAO_GIO as readonly string[]).includes(lenh.viec)) {
    throw new BatonError('FORBIDDEN', {
      message: `"${lenh.viec}" là việc agent không bao giờ được làm; không ghi đè được.`,
    });
  }
  if (!laViecGhiDeDuoc(lenh.viec)) {
    throw new BatonError('FORBIDDEN', { message: 'Ô này không ghi đè được.' });
  }
  const viec: ViecGhiDeDuoc = lenh.viec;

  // Bỏ ghi đè: xoá dòng để ô trở về mặc định của vai trò. Đây là xoá **một ô
  // cấu hình**, không phải xoá dữ liệu nghiệp vụ, nên không rơi vào hàng "Xoá
  // bất cứ thứ gì" của bảng quyền (hàng đó nói về ticket, bằng chứng, lịch sử).
  if (lenh.cho_phep === null) {
    return {
      cau_lenh: [
        db
          .prepare('DELETE FROM agent_permission WHERE agent_id = ? AND viec = ?')
          .bind(lenh.agent_id, viec),
      ],
      danh_thuc: [`agent:${lenh.agent_id}`],
      ket_qua: { agent_id: lenh.agent_id, viec, cho_phep: null },
    };
  }

  const cho_phep = kiemCo(lenh.cho_phep, 'cho_phep');

  let pham_vi: PhamViQuyen | null = null;
  if (lenh.pham_vi !== undefined && lenh.pham_vi !== null) {
    if (!laPhamViQuyen(lenh.pham_vi)) {
      throw new BatonError('INVALID_INPUT', { message: 'Phạm vi quyền không hợp lệ.' });
    }
    if (lenh.pham_vi === 'khong_bao_gio') {
      throw new BatonError('INVALID_INPUT', {
        message: 'Phạm vi "khong_bao_gio" chỉ thuộc hai hàng tuyệt đối, không đặt tay được.',
      });
    }
    pham_vi = lenh.pham_vi;
  }

  return {
    cau_lenh: [
      db
        .prepare(
          `INSERT INTO agent_permission (workspace_id, agent_id, viec, cho_phep, pham_vi, cap_nhat_luc)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (agent_id, viec) DO UPDATE SET
             cho_phep = excluded.cho_phep,
             pham_vi = excluded.pham_vi,
             cap_nhat_luc = excluded.cap_nhat_luc`,
        )
        .bind(lenh.workspace_id, lenh.agent_id, viec, cho_phep ? 1 : 0, pham_vi, bay_gio),
    ],
    danh_thuc: [`agent:${lenh.agent_id}`],
    ket_qua: { agent_id: lenh.agent_id, viec, cho_phep },
  };
}
