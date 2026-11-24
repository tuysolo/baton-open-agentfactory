/**
 * Lệnh ghi của mục 11 — **3 việc trọng tâm hôm nay** (SPEC d.324).
 *
 * d.324 nguyên văn: "Đề xuất **3 việc trọng tâm hôm nay**. Agent `coordinator`
 * **ghi qua API**; nếu chưa ghi thì để trống kèm chữ 'chưa có đề xuất'."
 *
 * ## Ai được ghi: kiểm DANH TÍNH, không mượn một hàng nào của bảng quyền
 *
 * Bảng quyền mục 3 **không có hàng nào** cho việc này, và d.324 gọi tên một **vai
 * trò** (`coordinator`) chứ không một ô của bảng đó. Theo nếp đã chốt hai lần
 * (19.12 câu 13 và câu 37; `cau-hoi-spec.md` #113, #22): **không mượn** một hàng
 * nào — mượn là âm thầm đổi nghĩa hàng đó, và một `manager` có "Ghi Nhật ký" sẽ
 * bất ngờ ghi được cả trọng tâm.
 *
 * Nên luật là: **chủ, hoặc agent có vai trò `coordinator`**. Sai ⇒ `FORBIDDEN`/403
 * (đường **ghi**, 19.12 câu 15 — không 404).
 *
 * Hệ quả khai thẳng: **chủ không chỉnh được** ai ghi trọng tâm (không có ô trong
 * Cài đặt), và `manager` **không** ghi được. Cả hai là chỗ SPEC im lặng —
 * `cau-hoi-spec.md` **#117**. Hướng chọn là hướng **chặt** (nới dễ hơn siết): nếu
 * chủ chốt cho `manager` ghi, việc phải làm là thêm một mã vào `VAI_GHI_TRONG_TAM`
 * dưới đây, một dòng.
 *
 * ## Một lệnh = một ĐỀ XUẤT HOÀN CHỈNH, không một dòng
 *
 * d.324 nói "**3** việc", nên lệnh nhận cả bộ và ghi **thay** bộ của cùng ngày
 * (một `DELETE` + tối đa ba `INSERT` trong **cùng một** `batch()` của cửa ghi).
 * Ghi từng dòng sẽ cho những trạng thái trung gian mà SPEC không có: một ngày với
 * đúng một trọng tâm, hay một bộ 3 trộn giữa hai lần đề xuất.
 *
 * **Đây là ghi đè một ĐỀ XUẤT, không xoá một DẤU VẾT** — và phân biệt đó là lý do
 * `trong_tam` không có trigger bất biến trong khi `thong_bao` (0012/0019) và
 * `bao_cao` (0020) đều có. Một đề xuất sửa lại được; một báo cáo đã gửi cho chủ thì
 * không. Câu `DELETE` ở đây **chỉ** chạm dòng `trong_tam` của **đúng một ngày của
 * đúng một workspace**, nên nó cũng không phải "xoá file" của danh sách cấm
 * `CLAUDE.md` mục 4.
 */

import {
  BatonError,
  SO_TRONG_TAM,
  ngayDiaPhuong,
  type AiGoi,
  type VaiTroAgent,
} from '@baton/shared';
import type { BoiCanhLenh, KetQuaHandler, LenhChung } from './lenh-khung.js';
import { ticketBatBuoc } from './lenh-ticket.js';

/**
 * Vai trò được **ghi** trọng tâm — d.324 gọi tên đúng một vai.
 *
 * Một mảng có tên, không một `if (ai.vai_tro === 'coordinator')` rải trong handler:
 * đây là chỗ duy nhất phải sửa nếu chủ chốt khác (#117), và nó đọc được từ test.
 */
export const VAI_GHI_TRONG_TAM: readonly VaiTroAgent[] = ['coordinator'];

/** Trần độ dài của một ghi chú trọng tâm. SPEC không nói; cùng bậc với `ly_do`. */
export const TRAN_GHI_CHU_TRONG_TAM = 500;

/**
 * **Chủ, hoặc agent có vai trò trong `VAI_GHI_TRONG_TAM`** — xem đầu file.
 *
 * Agent `disabled` bị từ chối **trước** phép kiểm vai trò: mục 3 nói agent đã tắt
 * thì "gọi API sẽ bị từ chối", và ca test "mọi lệnh ghi trong `SO_DANG_KY_HANDLER`
 * đều từ chối agent `disabled`" đi qua đúng chỗ này.
 */
export function batBuocGhiDuocTrongTam(ai: AiGoi): void {
  if (ai.loai === 'chu') return;
  if (ai.disabled) throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt.' });
  if (!VAI_GHI_TRONG_TAM.includes(ai.vai_tro)) {
    throw new BatonError('FORBIDDEN', {
      message: `Chỉ chủ hoặc agent ${VAI_GHI_TRONG_TAM.join(', ')} ghi được 3 việc trọng tâm (mục 11 d.324).`,
    });
  }
}

/** Một trọng tâm **đã kiểm**, sẵn sàng ghi. */
export interface TrongTamDaKiem {
  thu_tu: number;
  ticket_id: string;
  ghi_chu: string | null;
}

export interface LenhGhiTrongTam extends LenhChung {
  loai: 'ghi_trong_tam';
  /**
   * Danh sách `{ ticket_id, ghi_chu? }`, **tối đa 3** (d.324). Thứ tự gửi lên **là**
   * `thu_tu` — SPEC gọi chúng là "3 việc trọng tâm", một danh sách có thứ tự.
   *
   * Mảng **rỗng** là hợp lệ và có nghĩa: nó **bỏ** đề xuất của hôm nay, và báo cáo
   * quay về "chưa có đề xuất" (chữ của d.324). Không có đường nào khác để sửa một
   * đề xuất gửi sai.
   */
  muc: unknown;
  /*
   * KHÔNG có trường `ngay`, và đó là điểm chính: d.324 nói "trọng tâm **hôm
   * nay**". `ngay` là **kết luận của server**, suy từ `bay_gio` qua
   * `ngayDiaPhuong` (tức qua `MUI_GIO_CHU_PHUT`, 19.12 câu 60). Ai khai được nó
   * thì ghi được trọng tâm cho một ngày đã qua — tức sửa lại căn cứ của một
   * handoff tối **đã gửi cho chủ**.
   *
   * Cũng không có `agent_id` và `tao_luc`: cùng lý lẽ `LenhGhiNhatKy`.
   */
}

export interface KetQuaGhiTrongTam {
  /** Ngày trên tường mà bộ 3 này thuộc về — **server suy**. */
  ngay: string;
  /** Số dòng vừa ghi (0–3). */
  so_muc: number;
  muc: TrongTamDaKiem[];
  /** `null` = chủ tự ghi — mục 15 (dấu vết). */
  agent_id: string | null;
}

export async function handlerGhiTrongTam(
  lenh: LenhGhiTrongTam,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaGhiTrongTam>> {
  /*
   * 1. **Quyền trước, nhập sau?** Không — ngược lại, và có chủ ý khác
   *    `handlerGhiNhatKy`: ở đây phép kiểm quyền chỉ đọc **danh tính** (không tra
   *    DB, không cần `project_id`), nên nó không thể bị một `NOT_FOUND` che. Đặt nó
   *    **trước** phép kiểm nhập để một agent `worker` nhận `FORBIDDEN` thay vì một
   *    `INVALID_INPUT` kể cho nó biết hình của lệnh (19.12 câu 15).
   */
  batBuocGhiDuocTrongTam(lenh.ai);

  const tho = kiemDanhSachMuc(lenh.muc);

  // 2. **Ngày là kết luận của server** — xem ghi chú của `LenhGhiTrongTam`.
  const ngay = ngayDiaPhuong(bay_gio);
  const agent_id = lenh.ai.loai === 'agent' ? lenh.ai.agent_id : null;

  /*
   * 3. Mỗi ticket phải **có thật trong cùng workspace** (`ticketBatBuoc` →
   *    `NOT_FOUND`). Không có phép kiểm *quyền* "agent được vào dự án của ticket":
   *    một trọng tâm là một lời đề xuất **cho chủ đọc**, không một thao tác ghi lên
   *    ticket. Nhưng ticket phải nằm **trong phạm vi người gọi thấy được**
   *    (BAT-58, 19.12 câu 15): trước BAT-58 id thật ngoài phạm vi ra **thành công**
   *    còn id bịa ra `NOT_FOUND` — một máy dò sự tồn tại. Nay ngoài phạm vi ⇒ cùng
   *    `NOT_FOUND` với id bịa. Agent "tất cả dự án" (vai điều phối toàn hệ thường
   *    mang cờ này) không đổi gì. `cau-hoi-spec.md` #176.
   *
   *    Trùng ticket ⇒ `INVALID_INPUT` **tường minh**, không âm thầm bỏ bớt: d.324
   *    nói **3 việc**, nên một bộ gửi lên 3 dòng mà ghi được 2 là một đề xuất khác
   *    thứ người gửi nghĩ. (`UNIQUE (workspace_id, ngay, ticket_id)` của 0020 là
   *    hàng rào thứ hai, ở tầng cấu trúc.)
   */
  const muc: TrongTamDaKiem[] = [];
  for (const m of tho) {
    if (muc.some((x) => x.ticket_id === m.ticket_id)) {
      throw new BatonError('INVALID_INPUT', {
        message: 'Một ticket không được chiếm hai trong ba ô trọng tâm.',
      });
    }
    await ticketBatBuoc(db, lenh.workspace_id, m.ticket_id, false, lenh.ai);
    muc.push({ thu_tu: muc.length + 1, ticket_id: m.ticket_id, ghi_chu: m.ghi_chu });
  }

  /*
   * 4. **Thay cả bộ, trong MỘT batch.** `DELETE` đi trước `INSERT`: ngược lại thì
   *    `INSERT` đụng khoá chính `(workspace_id, ngay, thu_tu)` của bộ cũ. Cả hai
   *    nằm trong cùng `batch()` của cửa ghi (`KetQuaHandler.cau_lenh`), nên không
   *    có trạng thái trung gian "đã xoá bộ cũ, chưa ghi bộ mới" — mà một trạng thái
   *    như vậy đọc ra đúng chữ "chưa có đề xuất" của d.324, tức một lời nói sai.
   */
  const cau_lenh = [
    db
      .prepare('DELETE FROM trong_tam WHERE workspace_id = ? AND ngay = ?')
      .bind(lenh.workspace_id, ngay),
    ...muc.map((m) =>
      db
        .prepare(
          `INSERT INTO trong_tam
             (workspace_id, ngay, thu_tu, ticket_id, ghi_chu, agent_id, tao_luc)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(lenh.workspace_id, ngay, m.thu_tu, m.ticket_id, m.ghi_chu, agent_id, bay_gio),
    ),
  ];

  return {
    cau_lenh,
    /*
     * **Không** ghi `ticket_history`: lịch sử của mục 4 là lịch sử **của một
     * ticket** (trường, cũ → mới), và "được chọn làm trọng tâm hôm nay" không phải
     * một trường của ticket. Dấu vết của việc này là chính dòng `trong_tam` (cột
     * `agent_id` + `tao_luc`) — mục 15.
     */
    danh_thuc: [`trong_tam:${ngay}`, 'trong_tam'],
    ket_qua: { ngay, so_muc: muc.length, muc, agent_id },
  };
}

/* ------------------------------------------------------------------ *
 * Kiểm nhập
 * ------------------------------------------------------------------ */

/** `{ ticket_id, ghi_chu }` thô sau khi kiểm — thứ tự giữ nguyên thứ tự gửi lên. */
interface MucTho {
  ticket_id: string;
  ghi_chu: string | null;
}

function kiemDanhSachMuc(nguon: unknown): MucTho[] {
  if (nguon === undefined || nguon === null) return [];
  if (!Array.isArray(nguon)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'muc phải là một danh sách { ticket_id, ghi_chu }.',
    });
  }
  // d.324 — **3** việc. Con số ở `@baton/shared` (`SO_TRONG_TAM`) và trong `CHECK`
  // của 0020; ba chỗ, một nguồn.
  if (nguon.length > SO_TRONG_TAM) {
    throw new BatonError('INVALID_INPUT', {
      message: `Tối đa ${String(SO_TRONG_TAM)} việc trọng tâm mỗi ngày (mục 11 d.324).`,
    });
  }

  return nguon.map((x) => {
    if (typeof x !== 'object' || x === null) {
      throw new BatonError('INVALID_INPUT', {
        message: 'Mỗi trọng tâm phải là một đối tượng { ticket_id, ghi_chu }.',
      });
    }
    const { ticket_id, ghi_chu } = x as { ticket_id?: unknown; ghi_chu?: unknown };
    if (typeof ticket_id !== 'string' || ticket_id.trim() === '') {
      throw new BatonError('INVALID_INPUT', { message: 'ticket_id của trọng tâm phải là chữ.' });
    }
    if (ghi_chu !== undefined && ghi_chu !== null && typeof ghi_chu !== 'string') {
      throw new BatonError('INVALID_INPUT', { message: 'ghi_chu của trọng tâm phải là chữ.' });
    }
    const cat = typeof ghi_chu === 'string' ? ghi_chu.trim() : '';
    if (cat.length > TRAN_GHI_CHU_TRONG_TAM) {
      throw new BatonError('INVALID_INPUT', {
        message: `ghi_chu tối đa ${String(TRAN_GHI_CHU_TRONG_TAM)} ký tự.`,
      });
    }
    // Ghi **giá trị đã cắt khoảng trắng**, và rỗng ⇒ `null`: luật chung của mọi
    // handler ghi (`lenh-khung.ts`) — không ghi lại giá trị thô từ client.
    return { ticket_id: ticket_id.trim(), ghi_chu: cat === '' ? null : cat };
  });
}
