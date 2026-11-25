/**
 * **Phạm vi đọc: agent thấy ticket nào** — một bản luật duy nhất (SPEC mục 3,
 * 13 d.386, 17.7; 19.12 câu 15).
 *
 * Tách thành module riêng, **không import gì ngoài kiểu**, vì nó được dùng ở cả
 * đường đọc (`doc-ticket.ts`, `doc-phien.ts`, `doc-tim.ts`) lẫn đường ghi
 * (`lenh-*.ts`) — đặt trong `doc-ticket.ts` thì `doc-phien.ts` phải import nó, và
 * `doc-ticket → doc-du-an → doc-phien → doc-ticket` thành vòng.
 */

import type { AiGoi } from '@baton/shared';

/**
 * `undefined` = thấy mọi dự án (chủ, hoặc agent có cờ "tất cả dự án").
 *
 * Export cho `doc-tim.ts` (Cmd/Ctrl+K, BAT-34): nhóm ticket của lượt tìm dùng
 * **đúng** cửa phạm vi này của `lietKeTicket`, không một bản luật thứ hai.
 */
export function agentHepPhamVi(ai: AiGoi): string | undefined {
  if (ai.loai === 'chu' || ai.vao_tat_ca_du_an) return undefined;
  return ai.agent_id;
}

/**
 * **Đoạn lọc phạm vi đọc ticket** — dùng chung cho `layTicket` (đường đọc) và các
 * đường **ghi** nhận id lượt/phiên (BAT-57, 19.12 câu 15) và id ticket (BAT-58:
 * sửa, đổi trạng thái, ticket gốc của Trùng, nhãn, liên kết cả hai đầu, ticket
 * cha, bình luận, bằng chứng, ticket liên quan của Cần Chủ, căn cứ Nhật ký,
 * trọng tâm — qua `ticketBatBuoc(…, ai)`). `cot_project_id` là
 * biểu thức SQL cho dự án của dòng đang lọc (vd `t.project_id`). Chủ và agent
 * "tất cả dự án" → chuỗi rỗng.
 */
export function locPhamViTicket(
  ai: AiGoi,
  cot_project_id: string,
): { sql: string; bind: string[] } {
  const agent_hep = agentHepPhamVi(ai);
  if (agent_hep === undefined) return { sql: '', bind: [] };
  return {
    sql: ` AND ${cot_project_id} IN (SELECT project_id FROM agent_project WHERE agent_id = ?)`,
    bind: [agent_hep],
  };
}

/**
 * **Đoạn lọc phạm vi đọc một lượt giao** (BAT-57): lượt thấy được ⇔ ticket của
 * lượt thấy được (`locPhamViTicket`). Viết cho câu `FROM luot_giao` **không
 * alias** (cột trần `luot_giao.ticket_id`).
 *
 * (Sửa theo reviewer: cộng thêm ca "người gọi là người nhận/người giao của lượt"
 * — xem thân hàm.)
 *
 * Dùng ở các đường ghi nhận id lượt (nhận, nộp, nghiệm thu, huỷ, trả lời, việc
 * phát sinh): người gọi **không thấy** lượt thì câu tra trả rỗng và đi qua **cùng
 * dòng `throw NOT_FOUND`** với id không có — 19.12 câu 15 "cả hai ca phải ra phản
 * hồi giống hệt nhau". Trước BAT-57 các đường này tra cả workspace rồi mới kiểm
 * danh tính, nên id thật ngoài phạm vi ra 403 còn id bịa ra 404 — một máy dò.
 */
export function locPhamViLuot(ai: AiGoi): { sql: string; bind: string[] } {
  /*
   * **"Thấy được" một lượt trên đường ghi** (sửa theo reviewer BAT-57; 19.12 câu
   * 37, 44 — lệnh của người nhận/người giao kiểm theo **danh tính**, không qua
   * bảng quyền; 19.6 — lượt bị huỷ, agent vẫn phải gửi được result/error):
   * ticket của lượt trong phạm vi đọc **HOẶC** người gọi là người nhận / người
   * giao của chính lượt đó. Người nhận hay người giao bị gỡ khỏi dự án vẫn làm
   * tiếp lệnh trên lượt **của mình** như trước BAT-57 (`luotGiaoCuaToi` vẫn liệt
   * kê lượt đó cho họ — nên id không phải bí mật với họ). Người ngoài (không thấy
   * dự án, không phải hai bên của lượt) vẫn ra `NOT_FOUND` giống hệt id bịa.
   */
  const agent_hep = agentHepPhamVi(ai);
  if (agent_hep === undefined) return { sql: '', bind: [] };
  return {
    sql: ` AND ((SELECT lt.project_id FROM ticket lt
                  WHERE lt.id = luot_giao.ticket_id AND lt.workspace_id = luot_giao.workspace_id)
                IN (SELECT project_id FROM agent_project WHERE agent_id = ?)
              OR luot_giao.nguoi_nhan_agent_id = ?
              OR luot_giao.nguoi_giao_agent_id = ?)`,
    bind: [agent_hep, agent_hep, agent_hep],
  };
}

/**
 * **Đoạn lọc "thấy được" một dòng con của ticket trên đường GHI** — bình luận
 * (`comment`) hoặc bằng chứng (`evidence`) — BAT-58, 19.12 câu 15.
 *
 * Viết cho câu `FROM comment` / `FROM evidence` **không alias** (cột trần
 * `<bang>.ticket_id`). Thấy được ⇔ ticket của dòng trong phạm vi đọc
 * (`locPhamViTicket`, luật của `layTicket`) **HOẶC** người gọi là tác giả của
 * chính dòng đó (tác giả bình luận / người gửi bằng chứng). Vế sau cùng lý lẽ
 * với `locPhamViLuot`: người tự viết dòng đó biết id của nó, nên id không phải
 * bí mật với họ, và lệnh của họ trên dòng của mình (rút bằng chứng d.222 — "người
 * gửi hoặc chủ"; sửa bình luận — "tác giả") kiểm theo **danh tính** như trước
 * BAT-58. Người ngoài ⇒ câu tra rỗng ⇒ **cùng dòng `throw NOT_FOUND`** với id bịa.
 */
export function locThayDongConGhi(
  ai: AiGoi,
  bang: 'comment' | 'evidence',
): { sql: string; bind: string[] } {
  const agent_hep = agentHepPhamVi(ai);
  if (agent_hep === undefined) return { sql: '', bind: [] };
  const tac_gia =
    bang === 'comment'
      ? `(comment.tac_gia_loai = 'agent' AND comment.tac_gia_agent_id = ?)`
      : `(evidence.nguoi_gui_loai = 'agent' AND evidence.nguoi_gui_agent_id = ?)`;
  return {
    sql: ` AND ((SELECT ct.project_id FROM ticket ct
                  WHERE ct.id = ${bang}.ticket_id AND ct.workspace_id = ${bang}.workspace_id)
                IN (SELECT project_id FROM agent_project WHERE agent_id = ?)
              OR ${tac_gia})`,
    bind: [agent_hep, agent_hep],
  };
}

/**
 * **Đoạn lọc "thấy được" một phiên trên đường GHI** (sửa theo reviewer BAT-57).
 * Viết cho câu có alias `p` (phiên) và `t` (ticket của phiên) — `CHON_PHIEN` của
 * `doc-phien.ts`. Thấy được ⇔ ticket trong phạm vi đọc **HOẶC** `p.agent_id` là
 * người gọi **HOẶC** người gọi là người giao của lượt của phiên. Cùng lý lẽ với
 * `locPhamViLuot`. Đường **đọc** (`GET /v1/phien/:id`…) không dùng hàm này —
 * vẫn đúng luật đọc của `layTicket` như trước BAT-57 (`spec-questions.md` #175).
 */
export function locThayPhienGhi(ai: AiGoi): { sql: string; bind: string[] } {
  const agent_hep = agentHepPhamVi(ai);
  if (agent_hep === undefined) return { sql: '', bind: [] };
  return {
    sql: ` AND (t.project_id IN (SELECT project_id FROM agent_project WHERE agent_id = ?)
              OR p.agent_id = ?
              OR EXISTS (SELECT 1 FROM luot_giao lgp
                          WHERE lgp.id = p.luot_giao_id AND lgp.workspace_id = p.workspace_id
                            AND lgp.nguoi_giao_agent_id = ?))`,
    bind: [agent_hep, agent_hep, agent_hep],
  };
}
