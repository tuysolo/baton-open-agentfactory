/**
 * Khung của "lệnh ghi" — phần không phụ thuộc vào nghiệp vụ nào.
 *
 * **Vì sao có tầng này.** D1 không có giao dịch tương tác: không mở được một
 * transaction rồi đọc, quyết định, rồi ghi trong cùng giao dịch. Chỉ có
 * `batch()` — một nhóm câu lệnh biết trước, cùng thành hoặc cùng hỏng.
 * Mà gần như mọi luật trong SPEC đều là đọc-kiểm-ghi (cấp số ticket không tái
 * dùng — mục 4; cổng bằng chứng trước khi vào Xong — mục 7; "mỗi ticket tối đa
 * 1 lượt `worker` mở" — mục 19.1; cấp `T-số` — mục 8).
 *
 * Nên mọi lệnh GHI đi qua **một Durable Object cho mỗi workspace**
 * (`WorkspaceGate`). DO chạy đơn luồng nên các lệnh tự xếp hàng; handler đọc và
 * quyết định bên trong DO, rồi trả về danh sách câu lệnh để DO gom vào đúng một
 * `env.DB.batch()`. Lệnh ĐỌC **không** qua DO, đi thẳng D1.
 *
 * Handler không tự gọi `batch()` và không tự ghi lịch sử — nó chỉ *khai* mình
 * muốn ghi gì. Nhờ vậy lịch sử (SPEC mục 4: ai, lúc nào, trường, cũ → mới) luôn
 * nằm trong cùng batch với thay đổi, không bao giờ lệch.
 *
 * **Luật chung của mọi handler ghi** (reviewer lượt 1 nêu, sau lỗi `doi_tieu_de`
 * ghi thẳng tiêu đề `"   "` vào DB):
 *   1. **Kiểm nhập ngay trong handler**, bằng các hàm `kiem*` của
 *      `@baton/shared`. Không tin dữ liệu client, và cũng không tin tầng HTTP đã
 *      kiểm hộ: cửa ghi là chặng cuối trước DB, nên luật của SPEC phải đứng ở
 *      đây mới không có đường lách (CLI, MCP, API đều đi qua cùng chỗ này).
 *   2. **Kiểm quyền bằng `batBuocQuyen`** của module quyền duy nhất, không tự
 *      viết điều kiện vai trò.
 *   3. Ghi **giá trị đã kiểm** (vd tiêu đề đã cắt khoảng trắng), không ghi lại
 *      giá trị thô từ client.
 */

import {
  BatonError,
  vaoDuocDuAn,
  type AiGoi,
  type CongBangChung,
  type MaLoi,
  type TacGia,
} from '@baton/shared';
import type { Env } from './moi-truong.js';
import { chayTheoLo } from './chia-lo-tham-so.js';
import { locPhamViTicket } from './pham-vi-doc.js';

/* ------------------------------------------------------------------ *
 * Lịch sử ticket — SPEC mục 4 (chỉ thêm, không sửa không xoá)
 * ------------------------------------------------------------------ */
export interface YeuCauGhiLichSu {
  ticket_id: string;
  truong: string;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
  /**
   * Người làm, nếu **khác** người ra lệnh. Dùng cho thay đổi do hệ thống: tự lên
   * Xong (SPEC mục 7), ticket điều phối tự theo ticket dự án (19.4), cờ (19.1).
   * Để trống thì lấy người ra lệnh (`lenh.ai`).
   */
  tac_gia?: TacGia;
}

/* ------------------------------------------------------------------ *
 * Phần chung của mọi lệnh ghi
 * ------------------------------------------------------------------ */

export interface LenhChung {
  /** v0.1 chỉ có 1 workspace, nhưng lệnh luôn mang workspace_id (SPEC mục 1). */
  workspace_id: string;
  /**
   * Ai ra lệnh. Mang cả `AiGoi` (không chỉ `TacGia`) vì handler cần vai trò, dự
   * án được vào và các ô quyền để gọi `quyen()` **bên trong** cửa ghi.
   * `TacGia` dùng để ghi lịch sử được **dẫn xuất** từ đây (`tacGiaCua`), nên hai
   * thứ không bao giờ lệch nhau.
   */
  ai: AiGoi;
}

/** `TacGia` để ghi lịch sử, dẫn xuất từ `AiGoi` — SPEC mục 4. */
export function tacGiaCua(ai: AiGoi): TacGia {
  return ai.loai === 'chu' ? { loai: 'owner' } : { loai: 'agent', agentId: ai.agent_id };
}

/* ------------------------------------------------------------------ *
 * Cờ phạm vi quyền — CHỈ server dựng được
 * ------------------------------------------------------------------ */

/**
 * Các cờ phạm vi của bảng quyền SPEC mục 3 phụ thuộc **lượt giao**:
 * "ticket của lượt mình" và "ticket con của lượt mình đang làm".
 *
 * **Những cờ này không bao giờ được đọc từ thân request.** Chúng cố tình **không
 * nằm** trong kiểu của bất kỳ lệnh nào (xem `BanDoLenh`), nên client không có
 * chỗ nào để khai chúng, và `lenhTu()` ở tầng HTTP cũng không có trường nào để
 * chép sang. Chỉ handler bên trong cửa ghi dựng được, qua `phamViLuotGiao`.
 *
 * Vì sao phải chặt thế: nếu client khai được `ticket_cua_luot_minh: true` thì
 * một agent `worker` sửa được **mọi** ticket trong dự án nó được vào, trong khi
 * SPEC chỉ cho "ticket của lượt mình" — tức bảng quyền mất hiệu lực hoàn toàn.
 */
export interface PhamViLuotGiao {
  /** Ticket đích thuộc một lượt giao đang mở của chính agent gọi. */
  ticketCuaLuotMinh: (ticket_id: string) => boolean;
  /** Ticket cha đích là ticket của lượt agent gọi **đang làm**. */
  ticketChaCuaLuotMinh: (ticket_cha_id: string) => boolean;
}

/**
 * **Chỗ cắm của phần 2 — nay đã nối với bảng `luot_giao` thật.**
 *
 * Trả lời đúng một câu cho mỗi ticket được hỏi: *agent đang gọi có một lượt giao
 * **mở** trên ticket này không* — SPEC 19.1 định nghĩa lượt mở là `pending` hoặc
 * `in_progress` (`submitted` **không** còn mở, mà đang chờ nghiệm thu).
 *
 * Hỏi theo **lô ticket biết trước** thay vì trả về một predicate tự tra: predicate
 * phải đồng bộ (module quyền `quyen()` trả kết luận ngay), mà tra DB thì bất đồng
 * bộ. Mỗi lệnh ghi chỉ chạm 1–2 ticket nên một câu truy vấn là đủ, và nó nằm trọn
 * trong index `ix_luot_giao_nguoi_nhan` của migration 0004.
 *
 * Không có ticket nào để hỏi, hoặc người gọi là chủ → **từ chối mọi ô** (chủ
 * không đi qua các ô phạm vi này: module quyền cho chủ qua từ trước đó).
 *
 * Ô "ticket **con** của lượt mình **đang làm**" (SPEC mục 3) dùng cùng định nghĩa
 * "mở", tức gồm cả lượt `pending` chưa nhận. SPEC không nói rõ chữ "đang làm" ở
 * đây có loại lượt `pending` ra hay không; chọn cùng định nghĩa với 19.1 để chỉ
 * có **một** khái niệm "lượt của mình" trong cả hệ (câu hỏi SPEC gửi M-Baton).
 */
export async function phamViLuotGiao(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  ticket_ids: readonly (string | null | undefined)[],
): Promise<PhamViLuotGiao> {
  const tu_choi: PhamViLuotGiao = {
    ticketCuaLuotMinh: () => false,
    ticketChaCuaLuotMinh: () => false,
  };
  if (ai.loai !== 'agent') return tu_choi;

  const ds = [...new Set(ticket_ids.filter((t): t is string => typeof t === 'string'))];
  if (ds.length === 0) return tu_choi;

  /*
   * Chia lô (`chia-lo-tham-so.ts`): **2** tham số khác (`workspace_id`,
   * `nguoi_nhan_agent_id`). Mỗi lệnh ghi hôm nay chỉ hỏi 1–2 ticket, nhưng hàm
   * nhận một danh sách bất kỳ. Kết quả là một tập — hợp các lô không đổi nghĩa.
   */
  const agent_id = ai.agent_id;
  const results = await chayTheoLo(ds, 2, async (lo, cho) => {
    const r = await db
      .prepare(
        `SELECT DISTINCT ticket_id FROM luot_giao
          WHERE workspace_id = ? AND nguoi_nhan_agent_id = ?
            AND trang_thai IN ('pending', 'in_progress')
            AND ticket_id IN (${cho})`,
      )
      .bind(workspace_id, agent_id, ...lo)
      .all<{ ticket_id: string }>();
    return r.results;
  });

  const cua_minh = new Set(results.map((r) => r.ticket_id));
  return {
    ticketCuaLuotMinh: (ticket_id) => cua_minh.has(ticket_id),
    ticketChaCuaLuotMinh: (ticket_cha_id) => cua_minh.has(ticket_cha_id),
  };
}

/**
 * Ô **"ticket con của lượt mình đang làm"** (SPEC mục 3, vai trò `worker`) có
 * **hai** điều kiện, và cả hai phải đúng:
 *   1. Lệnh thật sự tạo một ticket **con** — tức có `ticket_cha_id`. Không có cha
 *      thì đây không phải ticket con, nên ô đó không áp được, kể cả khi phần 2 đã
 *      nối nguồn dữ liệu lượt giao.
 *   2. Ticket cha đó là ticket của lượt agent **đang làm**.
 *
 * Tách thành hàm riêng để điều kiện (1) có **test canh**: `phamViLuotGiao` hiện
 * luôn trả `false`, nên nếu để điều kiện này nằm trong `handlerTaoTicket` thì gỡ
 * nó đi cũng không làm đỏ test nào cho tới phần 2 (reviewer lượt 2 nêu đúng chỗ
 * này). Test tiêm một `PhamViLuotGiao` trả `true` và gọi thẳng hàm này.
 */
export function phamViTaoTicketCon(
  ticket_cha_id: string | null,
  pham_vi: PhamViLuotGiao,
): boolean {
  return ticket_cha_id !== null && pham_vi.ticketChaCuaLuotMinh(ticket_cha_id);
}

/* ------------------------------------------------------------------ *
 * Bối cảnh và kết quả của handler
 * ------------------------------------------------------------------ */

export interface BoiCanhLenh {
  env: Env;
  db: D1Database;
  /** Một mốc thời gian duy nhất cho cả lệnh, epoch milliseconds. */
  bay_gio: number;
  /**
   * Đánh thức các lệnh chờ dài đang treo trên DO này (SPEC mục 13 `--wait`,
   * mục 8 "agent nhận kết quả trong 3 giây"). Chỉ chạy **sau khi** batch ghi
   * thành công.
   */
  danhThuc: (chu_de: string) => void;
  /**
   * **Cổng bằng chứng** (SPEC mục 7), dạng hàm chèn được — xem
   * `cong-bang-chung.ts`. Lượt này luôn trả "chưa đủ"; phần 3 cài thật.
   */
  cong: CongBangChung;
}

export interface KetQuaHandler<T> {
  /** Các câu lệnh ghi; DO gom chung vào một `batch()`, cùng thành cùng hỏng. */
  cau_lenh: D1PreparedStatement[];
  /** Dòng lịch sử cần ghi; DO tự dựng câu lệnh và nối vào cùng batch. */
  lich_su?: YeuCauGhiLichSu[];
  /** Chủ đề cần đánh thức sau khi ghi xong. */
  danh_thuc?: string[];
  /**
   * **Ghi xong rồi mới báo lỗi.**
   *
   * Chỉ dùng cho những luật của SPEC đòi *vừa* từ chối *vừa* đổi dữ liệu: vào
   * Xong thiếu bằng chứng thì "bị từ chối với lỗi `EVIDENCE_REQUIRED`, **và**
   * ticket được đưa sang Chờ kiểm chứng" (SPEC mục 4, 19.2). Ném lỗi trong
   * handler thì batch không chạy và nửa luật sau không bao giờ xảy ra.
   *
   * Cửa ghi chạy `batch()` trước, rồi trả lỗi này. Nên thay đổi và lịch sử vẫn
   * nằm trong **cùng một** batch (cùng thành, cùng hỏng), còn người gọi vẫn nhận
   * đúng mã lỗi của SPEC.
   */
  loi_sau_ghi?: { ma: MaLoi; message: string };
  /**
   * **Lượt giao mà lệnh này gắn rõ** — BAT-57, thu hẹp 19.12 câu 41 cho ca nhiều
   * phiên (`cau-hoi-spec.md`). Khai thì cửa ghi nhích tín hiệu **chỉ** phiên của
   * lượt này (và chỉ khi đó là phiên của chính agent gọi). Bỏ trống = lệnh
   * **chung** (bình luận, sửa ticket…): cửa ghi chỉ nhích khi agent có đúng 1
   * phiên mở. Xem `WorkspaceGate.#cauLenhTinHieuPhien`.
   *
   * Khai **cả** trên nhánh `loi_sau_ghi` (`SESSION_CLOSED`): bỏ trống ở đó là rơi
   * về nhánh "lệnh chung" và nhích nhầm phiên còn lại của agent.
   */
  luot_tin_hieu?: string;
  ket_qua: T;
}

/* ------------------------------------------------------------------ *
 * Giúp việc dùng chung cho handler
 * ------------------------------------------------------------------ */

/** Chỉ chủ làm được việc này — SPEC mục 2 ("chủ tạo"), mục 3 (tạo agent, token). */
export function batBuocLaChu(ai: AiGoi, viec: string): void {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: `Chỉ chủ ${viec}.` });
  }
}

/**
 * Agent phải **được vào dự án** mới ghi được gì trong đó — SPEC mục 3, 17.7.
 *
 * Dùng cho những việc bảng quyền SPEC mục 3 **không có hàng riêng**, mà SPEC vẫn
 * cho agent làm: bình luận (mục 4 "của chủ hoặc agent", mục 6 tính bình luận là
 * tín hiệu của phiên). Xem `cau-hoi-spec.md` #22. Không mượn một hàng khác của
 * bảng quyền: mượn là âm thầm đổi nghĩa của hàng đó.
 */
export function batBuocVaoDuocDuAn(ai: AiGoi, project_id: string, viec: string): void {
  if (ai.loai === 'chu') return;
  if (ai.disabled) throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt.' });
  if (!vaoDuocDuAn(ai, project_id)) {
    throw new BatonError('FORBIDDEN', { message: `Agent không được vào dự án này để ${viec}.` });
  }
}

/** Một dự án như cửa ghi cần biết để kiểm luật trạng thái. */
export interface DongDuAnNgan {
  id: string;
  ma: string;
  trang_thai: string;
}

/**
 * Tra dự án trong đúng workspace của lệnh.
 * Không có, hoặc thuộc workspace khác → `NOT_FOUND` (SPEC mục 13: 404 cũng dùng
 * khi đối tượng ngoài phạm vi, để **không lộ sự tồn tại**).
 */
export async function duAnBatBuoc(
  db: D1Database,
  workspace_id: string,
  project_id: string,
  /**
   * Có thì chỉ tìm dự án **người gọi thấy được** (luật của `layDuAn`: chủ và
   * agent "tất cả dự án" thấy mọi dự án, agent khác chỉ dự án trong
   * `agent_project`): ngoài phạm vi ra **cùng dòng `throw`** với id bịa (BAT-59,
   * 19.12 câu 15, cùng khuôn `ticketBatBuoc(…, ai)` của BAT-58). Bỏ trống =
   * hành vi cũ (không lọc phạm vi) — dùng khi dự án đã suy ra từ một đối tượng
   * đã qua cửa phạm vi, hoặc quyền đã kiểm trước.
   */
  ai?: AiGoi,
): Promise<DongDuAnNgan> {
  const loc = ai === undefined ? { sql: '', bind: [] } : locPhamViTicket(ai, 'id');
  const d = await db
    .prepare(`SELECT id, ma, trang_thai FROM project WHERE id = ? AND workspace_id = ?${loc.sql}`)
    .bind(project_id, workspace_id, ...loc.bind)
    .first<DongDuAnNgan>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy dự án.' });
  return d;
}

/**
 * Dự án `archived` là **chỉ đọc** (SPEC mục 2): mọi lệnh ghi lên nó bị từ chối.
 *
 * Một ngoại lệ bắt buộc: chủ đổi chính `trang_thai` để **mở lại** dự án. Không
 * có ngoại lệ đó thì lưu trữ là cửa một chiều, không gỡ được — SPEC mục 2 nói
 * `archived` chỉ là một trong ba trạng thái, không nói nó vĩnh viễn.
 */
export function batBuocKhongLuuTru(du_an: DongDuAnNgan): void {
  if (du_an.trang_thai === 'archived') {
    throw new BatonError('PROJECT_NOT_ACCEPTING', {
      message: `Dự án ${du_an.ma} đã lưu trữ, chỉ đọc.`,
    });
  }
}

/**
 * Dự án có nhận **việc mới** không — SPEC mục 2, 4.
 * `paused`: "agent không nhận việc mới trong dự án". `archived`: chỉ đọc.
 * Cả hai đều trả `PROJECT_NOT_ACCEPTING` (SPEC mục 4 nêu đúng mã này).
 */
export function batBuocNhanViecMoi(du_an: DongDuAnNgan): void {
  if (du_an.trang_thai !== 'active') {
    throw new BatonError('PROJECT_NOT_ACCEPTING', {
      message:
        du_an.trang_thai === 'paused'
          ? `Dự án ${du_an.ma} đang tạm dừng, không nhận việc mới.`
          : `Dự án ${du_an.ma} đã lưu trữ, chỉ đọc.`,
    });
  }
}
