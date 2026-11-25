/**
 * Lệnh ghi về **Nhật ký quyết định** — SPEC mục 10 (d.305–312), mục 3 (hàng
 * "Ghi Nhật ký quyết định"), 19.12 câu 4 ("Chung" là dự án **rỗng**), câu 15
 * (quyền kiểm **trước** khi tra đối tượng).
 *
 * Luật được cài ở đây:
 *   * **Chỉ thêm** (d.309). Không có lệnh sửa và không có lệnh xoá nào trong
 *     file này, và sẽ không bao giờ có: hàng rào thật nằm ở **tầng DB**
 *     (`tg_nhat_ky_khong_sua` / `_khong_xoa` của 0014), vì d.309 nói "kể cả
 *     chủ" và "chủ" là nhánh được mọi `quyen()` cho qua.
 *   * **Ai được ghi** (d.310): chủ, `coordinator`, `manager` — ô `write_decision`
 *     của bảng quyền mục 3. `worker`/`reviewer` → `FORBIDDEN`/403.
 *   * **Riêng dòng "chủ quyết"** (d.310): `nguoi_loai` là **kết luận của
 *     server**, suy từ danh tính người gọi. Nó **không** là một trường của lệnh,
 *     nên không có chỗ nào để một agent khai mình là chủ.
 *   * **Dự án tuỳ chọn**, rỗng = "Chung" (19.12 câu 4).
 *   * **Căn cứ** (d.308): `T-số`, mã ticket, hoặc dòng cũ — bảng con
 *     `nhat_ky_can_cu`, khoá thật, cùng workspace.
 *   * **Luật dữ liệu d.312**: cảnh báo mẫu giống dữ liệu nhân sự, **không
 *     chặn**; cảnh báo đi ra `ket_qua.canh_bao`.
 *
 * Mọi luật **thuần** sống ở `@baton/shared` → `nhat-ky.ts`, nên CLI của phần 5
 * (`baton decision`, mục 13 d.377) và web của phần 6 đọc cùng một bản.
 *
 * **Chưa làm ở lượt này, có chủ ý:** nối vào đường **xử lý** mục Cần Chủ (d.279,
 * 19.9 — dòng tự sinh khi chủ xử lý, bỏ qua, mở lại). Các câu của ba dòng đó đã
 * có sẵn ở `@baton/shared` (`cauNhatKyKetQua`, `cauNhatKyBoQua`,
 * `cauNhatKyMoLai`), nên lượt sau chỉ phải gọi `cauLenhGhiNhatKy` dưới đây và
 * nối vào cùng batch của nó — không phải nghĩ lại luật nào.
 */

import {
  BatonError,
  batBuocQuyen,
  canhBaoDuLieuNhanSu,
  kiemQuyetDinh,
  kiemViSao,
  vaoDuocDuAn,
  type AiGoi,
  type CanhBaoDuLieu,
} from '@baton/shared';
import {
  batBuocKhongLuuTru,
  duAnBatBuoc,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';
import { ticketBatBuoc } from './lenh-ticket.js';

/* ------------------------------------------------------------------ *
 * Căn cứ — d.308
 * ------------------------------------------------------------------ */

/** Ba loại căn cứ của d.308, khớp CHECK của `nhat_ky_can_cu` (0014). */
export const LOAI_CAN_CU = ['ask', 'ticket', 'dong_cu'] as const;
export type LoaiCanCu = (typeof LOAI_CAN_CU)[number];

/** Một căn cứ **đã kiểm**, sẵn sàng ghi. */
export interface CanCuDaKiem {
  loai: LoaiCanCu;
  /** Id của đối tượng được trỏ tới; cột nào nhận nó thì do `loai` quyết. */
  id: string;
  thu_tu: number;
}

/* ------------------------------------------------------------------ *
 * Ghi một dòng — SPEC mục 10
 * ------------------------------------------------------------------ */

export interface LenhGhiNhatKy extends LenhChung {
  loai: 'ghi_nhat_ky';
  /** **Quyết định** — d.308, bắt buộc. */
  quyet_dinh: unknown;
  /** **Vì sao** — d.306, d.308, bắt buộc (xem `kiemViSao` và #71). */
  vi_sao: unknown;
  /**
   * Dự án. **Để trống là "Chung"** — 19.12 câu 4. Không có mã đặc biệt nào cho
   * Chung, y như `LenhTaoCanChu`.
   */
  project_id?: string | null;
  /**
   * **Căn cứ** — d.308. Danh sách `{ loai, id }`; `loai` là một trong
   * `LOAI_CAN_CU`.
   */
  can_cu?: unknown;
  /*
   * KHÔNG có trường nào cho `nguoi_loai`, `agent_id` hay `luc`. Cả ba là **kết
   * luận của server**:
   *   * `nguoi_loai` — d.310 ("riêng dòng 'chủ quyết' chỉ sinh từ Cần Chủ hoặc
   *     do chủ tự ghi"): ai khai được nó thì một agent `manager` tự ghi được
   *     một dòng mang chữ "chủ đã quyết", tức giả mạo đúng thứ mà cả mục 10
   *     tồn tại để bảo vệ.
   *   * `luc` — d.306 ("…, lúc nào"): khai được mốc là viết lại lịch sử.
   */
}

export interface KetQuaGhiNhatKy {
  id: string;
  luc: number;
  /** `'chu'` hoặc `'agent'` — **server suy**, xem ghi chú trên. */
  nguoi_loai: 'chu' | 'agent';
  agent_id: string | null;
  /** `null` = **Chung** — 19.12 câu 4. */
  project_id: string | null;
  quyet_dinh: string;
  vi_sao: string;
  so_can_cu: number;
  /**
   * **d.312 — "chỉ cảnh báo, không chặn".** Đây chính là cái "cảnh báo" đó: nó
   * đi ra **kết quả của lệnh**, không vào log, nên người ghi nhìn thấy ngay.
   * Dòng **vẫn được ghi** trong cùng lệnh này.
   */
  canh_bao: CanhBaoDuLieu[];
}

export async function handlerGhiNhatKy(
  lenh: LenhGhiNhatKy,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaGhiNhatKy>> {
  /*
   * 1. **Kiểm nhập trước khi làm gì khác** (luật chung của mọi handler ghi —
   *    `lenh-khung.ts`): một `quyet_dinh` rỗng phải ra `INVALID_INPUT` dù dự án
   *    có tồn tại hay không. Tra dự án trước thì lỗi nhập bị `NOT_FOUND` che.
   */
  const quyet_dinh = kiemQuyetDinh(lenh.quyet_dinh);
  const vi_sao = kiemViSao(lenh.vi_sao);

  const project_id =
    lenh.project_id === undefined || lenh.project_id === null || lenh.project_id === ''
      ? null
      : lenh.project_id;

  /*
   * 2. **Quyền, TRƯỚC khi tra dự án** — 19.12 câu 15 ("Quyền phải kiểm trước khi
   *    tra đối tượng … với agent ngoài phạm vi, cả hai ca phải ra phản hồi giống
   *    hệt nhau"), và đường GHI trả **`FORBIDDEN`/403**, không 404.
   *
   *    Ô của bảng quyền là **"Ghi Nhật ký quyết định"** (`write_decision`,
   *    d.310): `coordinator` và `manager` có "có", `worker`/`reviewer` có `—`
   *    nên bị từ chối ở bước 4 của `quyen()`. Chủ qua ở bước 2 của `quyen()`.
   *
   *    Có `project_id` thì truyền vào bối cảnh ⇒ **cửa dự án** của `quyen()` áp:
   *    agent ngoài phạm vi dự án nhận 403 dù dự án có thật hay không.
   *
   *    Dòng **Chung** không truyền `project_id`, nên ô `write_decision` là luật
   *    **duy nhất** áp cho việc **ghi** nó — cùng hướng MỞ mà `handlerTaoCanChu`
   *    đã chọn cho mục Chung, và cùng căn cứ: SPEC chỉ im lặng về **tầm nhìn**
   *    (ai **đọc** được), không về quyền ghi. Tầm nhìn nằm ở `doc-nhat-ky.ts`,
   *    qua `pham-vi-chung.ts` — xem `spec-questions.md` #69.
   */
  batBuocQuyen(lenh.ai, 'write_decision', project_id === null ? {} : { project_id });

  /*
   * 3. Dự án (chỉ khi có). `archived` là **chỉ đọc** (mục 2, 19.12 câu 25) ⇒
   *    `PROJECT_NOT_ACCEPTING`/409.
   *
   *    `paused` thì **vẫn ghi được**, cùng lựa chọn và cùng lý lẽ như mục Cần
   *    Chủ: 19.12 câu 26 đọc `paused` là "agent không nhận **việc mới** / không
   *    tạo được **ticket**", còn một dòng Nhật ký không phải việc của ai — nó là
   *    một **ghi nhận đã xảy ra**, và "vì sao chúng ta tạm dừng dự án này" là
   *    đúng loại dòng cần ghi vào lúc đó.
   */
  if (project_id !== null) {
    batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, project_id));
  }

  // 4. **Căn cứ** — d.308. Mỗi căn cứ phải trỏ tới một đối tượng **có thật,
  //    cùng workspace**, và agent phải được vào dự án của nó.
  const can_cu = await kiemCanCu(db, lenh.workspace_id, lenh.ai, lenh.can_cu);

  /*
   * 5. **"Ai" là kết luận của server** — d.310. Không có đường nào khác để đặt
   *    `nguoi_loai`: nó không nằm trong kiểu lệnh, nên whitelist của tầng HTTP
   *    cũng không có trường nào để chép sang (`TRUONG_CLIENT` ở `index.ts`).
   */
  const nguoi_loai: 'chu' | 'agent' = lenh.ai.loai === 'chu' ? 'chu' : 'agent';
  const agent_id = lenh.ai.loai === 'agent' ? lenh.ai.agent_id : null;

  const id = crypto.randomUUID();

  return {
    cau_lenh: cauLenhGhiNhatKy(db, {
      id,
      workspace_id: lenh.workspace_id,
      luc: bay_gio,
      nguoi_loai,
      agent_id,
      project_id,
      quyet_dinh,
      vi_sao,
      can_cu,
    }),
    /*
     * Đánh thức theo chính dòng và theo chủ đề chung của Nhật ký. Lượt này chưa
     * có lệnh chờ nào treo trên hai chủ đề đó, nhưng đặt tên ngay từ đường ghi
     * thì lượt sau chỉ phải nối bên nghe — cùng cách `handlerTaoCanChu` đã làm.
     */
    danh_thuc: [`nhat_ky:${id}`, 'nhat_ky'],
    ket_qua: {
      id,
      luc: bay_gio,
      nguoi_loai,
      agent_id,
      project_id,
      quyet_dinh,
      vi_sao,
      so_can_cu: can_cu.length,
      // **d.312 — cảnh báo, không chặn.** Dòng đã nằm trong `cau_lenh` ở trên.
      canh_bao: canhBaoDuLieuNhanSu(quyet_dinh),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Dựng câu lệnh — dùng lại được
 * ------------------------------------------------------------------ */

/** Một dòng Nhật ký **đã kiểm xong**, sẵn sàng ghi. */
export interface DongNhatKyDeGhi {
  id: string;
  workspace_id: string;
  luc: number;
  nguoi_loai: 'chu' | 'agent';
  agent_id: string | null;
  project_id: string | null;
  quyet_dinh: string;
  vi_sao: string;
  can_cu: readonly CanCuDaKiem[];
}

/**
 * Câu lệnh ghi một dòng Nhật ký + các căn cứ của nó.
 *
 * Tách khỏi handler để **lượt sau nối đường xử lý Cần Chủ vào cùng batch**: mục
 * 8 d.279 nói rõ việc xử lý một mục **vừa** đổi mục **vừa** ghi một dòng Nhật
 * ký, nên hai việc đó phải cùng thành hoặc cùng hỏng — tức cùng một `batch()`
 * của cửa ghi, không hai lệnh nối tiếp.
 */
export function cauLenhGhiNhatKy(
  db: D1Database,
  dong: DongNhatKyDeGhi,
): D1PreparedStatement[] {
  const cau_lenh = [
    db
      .prepare(
        `INSERT INTO nhat_ky
           (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        dong.id,
        dong.workspace_id,
        dong.luc,
        dong.nguoi_loai,
        dong.agent_id,
        dong.project_id,
        dong.quyet_dinh,
        dong.vi_sao,
      ),
  ];

  for (const cc of dong.can_cu) {
    cau_lenh.push(
      db
        .prepare(
          `INSERT INTO nhat_ky_can_cu
             (id, workspace_id, nhat_ky_id, loai, can_chu_id, ticket_id, dong_cu_id, thu_tu, tao_luc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          dong.workspace_id,
          dong.id,
          cc.loai,
          cc.loai === 'ask' ? cc.id : null,
          cc.loai === 'ticket' ? cc.id : null,
          cc.loai === 'dong_cu' ? cc.id : null,
          cc.thu_tu,
          dong.luc,
        ),
    );
  }
  return cau_lenh;
}

/* ------------------------------------------------------------------ *
 * Giúp việc
 * ------------------------------------------------------------------ */

function laLoaiCanCu(v: unknown): v is LoaiCanCu {
  return typeof v === 'string' && (LOAI_CAN_CU as readonly string[]).includes(v);
}

/**
 * **Căn cứ** — d.308 ("link T-số, mã ticket, dòng cũ").
 *
 * Mỗi căn cứ phải trỏ tới một đối tượng **có thật trong cùng workspace**
 * (`NOT_FOUND`), và với ticket thì phải nằm **trong phạm vi người gọi thấy được**
 * (ngoài phạm vi ⇒ `NOT_FOUND` giống hệt id bịa — BAT-58, 19.12 câu 15): gắn một ticket vào một dòng Nhật ký
 * là đặt dòng đó lên trang chi tiết của ticket, nên nó là ghi lên cả hai phía.
 *
 * Bỏ trùng, giữ thứ tự gửi lên — cùng nếp `kiemTicketLienQuan` của
 * `lenh-can-chu.ts`.
 */
async function kiemCanCu(
  db: D1Database,
  workspace_id: string,
  ai: AiGoi,
  nguon: unknown,
): Promise<CanCuDaKiem[]> {
  if (nguon === undefined || nguon === null) return [];
  if (!Array.isArray(nguon)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'can_cu phải là một danh sách { loai, id }.',
    });
  }

  const ra: CanCuDaKiem[] = [];
  for (const tho of nguon) {
    if (typeof tho !== 'object' || tho === null) {
      throw new BatonError('INVALID_INPUT', {
        message: 'Mỗi căn cứ phải là một đối tượng { loai, id }.',
      });
    }
    const { loai, id } = tho as { loai?: unknown; id?: unknown };
    if (!laLoaiCanCu(loai)) {
      throw new BatonError('INVALID_INPUT', {
        message: `Loại căn cứ phải là một trong: ${LOAI_CAN_CU.join(', ')}.`,
      });
    }
    if (typeof id !== 'string' || id.length === 0) {
      throw new BatonError('INVALID_INPUT', { message: 'id của căn cứ phải là chữ.' });
    }
    if (ra.some((c) => c.loai === loai && c.id === id)) continue;

    if (loai === 'ticket') {
      // Ticket người gọi không thấy ⇒ `NOT_FOUND` giống hệt id bịa (BAT-58, 19.12
      // câu 15); trước đó id thật ra 403 dưới đây còn id bịa ra 404.
      const ticket = await ticketBatBuoc(db, workspace_id, id, false, ai);
      if (!vaoDuocDuAn(ai, ticket.project_id)) {
        throw new BatonError('FORBIDDEN', {
          message: 'Agent không được vào dự án của một ticket dùng làm căn cứ.',
        });
      }
    } else {
      /*
       * Mục Cần Chủ và dòng Nhật ký cũ: chỉ kiểm **tồn tại trong cùng
       * workspace**. Không kiểm phạm vi dự án của chúng, có chủ ý — cả hai có
       * thể là **Chung** (`project_id IS NULL`, 19.12 câu 4), nên không có dự án
       * nào để kiểm, và tầm nhìn của lớp dòng đó là một câu hỏi chưa chốt
       * (`spec-questions.md` #69) sống ở **đường đọc** (`pham-vi-chung.ts`). Đặt
       * nửa luật ở đây nữa là hai nguồn sự thật cho cùng một câu hỏi.
       */
      const bang = loai === 'ask' ? 'can_chu' : 'nhat_ky';
      const co = await db
        .prepare(`SELECT 1 AS co FROM ${bang} WHERE id = ? AND workspace_id = ?`)
        .bind(id, workspace_id)
        .first<{ co: number }>();
      if (co === null) {
        throw new BatonError('NOT_FOUND', {
          message:
            loai === 'ask'
              ? 'Không tìm thấy mục Cần Chủ dùng làm căn cứ.'
              : 'Không tìm thấy dòng Nhật ký cũ dùng làm căn cứ.',
        });
      }
    }

    ra.push({ loai, id, thu_tu: ra.length + 1 });
  }
  return ra;
}
