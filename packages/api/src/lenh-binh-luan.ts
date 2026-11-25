/**
 * **Bình luận ticket** — SPEC mục 4.
 *
 * Luật được cài ở đây:
 *   * Markdown; tác giả là **chủ hoặc agent**.
 *   * **Tác giả tự sửa được**, và bình luận đã sửa mang cờ "đã sửa" (`da_sua`).
 *   * Người khác sửa bình luận của tác giả khác → `FORBIDDEN`. **Kể cả chủ**:
 *     SPEC viết "**Tác giả** tự sửa được", không viết "chủ sửa được mọi bình
 *     luận", và một bình luận của agent bị chủ sửa thì lịch sử hội thoại không
 *     còn đáng tin.
 *   * **Agent không xoá được** — hàng "Xoá bất cứ thứ gì = không bao giờ" của
 *     bảng quyền SPEC mục 3 là **tuyệt đối**. Module quyền chặn (`delete_anything`).
 *   * Chủ xoá được: SPEC chỉ nói "Agent không xoá được" nên không nói về chủ —
 *     `spec-questions.md` #23 chốt tạm "chủ xoá được, xoá **mềm**".
 */

import {
  batBuocQuyen,
  kiemNoiDungBinhLuan,
  BatonError,
  type AiGoi,
  type TacGia,
} from '@baton/shared';
import { locThayDongConGhi } from './pham-vi-doc.js';
import {
  batBuocKhongLuuTru,
  batBuocVaoDuocDuAn,
  duAnBatBuoc,
  tacGiaCua,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';
import { ticketBatBuoc } from './lenh-ticket.js';

/* ------------------------------------------------------------------ *
 * Thêm bình luận
 * ------------------------------------------------------------------ */

export interface LenhThemBinhLuan extends LenhChung {
  loai: 'them_binh_luan';
  ticket_id: string;
  noi_dung: string;
}

export interface KetQuaThemBinhLuan {
  id: string;
  ticket_id: string;
  tao_luc: number;
}

export async function handlerThemBinhLuan(
  lenh: LenhThemBinhLuan,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaThemBinhLuan>> {
  const noi_dung = kiemNoiDungBinhLuan(lenh.noi_dung);

  // Ticket người gọi không thấy ⇒ `NOT_FOUND` giống hệt id bịa (BAT-58, 19.12 câu 15).
  const ticket = await ticketBatBuoc(db, lenh.workspace_id, lenh.ticket_id, false, lenh.ai);

  // Bảng quyền SPEC mục 3 không có hàng cho bình luận; điều kiện là "được vào dự
  // án" (xem `batBuocVaoDuocDuAn` và `spec-questions.md` #22).
  batBuocVaoDuocDuAn(lenh.ai, ticket.project_id, 'bình luận');
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id));

  const id = crypto.randomUUID();

  return {
    cau_lenh: cauLenhThemBinhLuan(db, {
      id,
      workspace_id: lenh.workspace_id,
      ticket_id: lenh.ticket_id,
      tac_gia: tacGiaCua(lenh.ai),
      noi_dung,
      luc: bay_gio,
    }),
    danh_thuc: [`ticket:${lenh.ticket_id}`, `binh_luan:${lenh.ticket_id}`],
    ket_qua: { id, ticket_id: lenh.ticket_id, tao_luc: bay_gio },
  };
}

/* ------------------------------------------------------------------ *
 * Dựng câu lệnh — dùng lại được
 * ------------------------------------------------------------------ */

/** Một bình luận **đã kiểm xong**, sẵn sàng ghi. */
export interface BinhLuanDeGhi {
  id: string;
  workspace_id: string;
  ticket_id: string;
  tac_gia: TacGia;
  noi_dung: string;
  luc: number;
}

/**
 * Câu lệnh chèn **một** bình luận.
 *
 * Tách khỏi handler để đường **xử lý mục Cần Chủ** nối vào **cùng batch**: mục
 * 8 d.278–281 nói việc xử lý một mục *vừa* đổi mục, *vừa* ghi một dòng Nhật ký,
 * *vừa* thêm bình luận vào **mọi** ticket liên quan — ba việc đó phải cùng
 * thành hoặc cùng hỏng. Cùng lý do và cùng khuôn với `cauLenhGhiNhatKy` của
 * `lenh-nhat-ky.ts`.
 *
 * Đường tự động **không** đi qua `handlerThemBinhLuan`: handler đó kiểm "được
 * vào dự án" và "dự án chưa lưu trữ" cho một **người** đang gõ một bình luận,
 * còn bình luận của d.280 là do **Baton** tự thêm sau khi chủ đã quyết — nó
 * không có người gọi nào để kiểm phạm vi, và chặn nó vì dự án đã lưu trữ sẽ làm
 * hỏng nguyên tử của ba việc (xem `lenh-xu-ly-can-chu.ts`). Nhưng **câu lệnh**
 * thì chỉ có một bản, ở đây.
 *
 * Khai thẳng hệ quả, để một lượt sau không đọc nhầm là sót: bảng `comment` có
 * **hai** đường ghi với **hai** luật khác nhau về dự án `archived` —
 * `handlerThemBinhLuan` áp `batBuocKhongLuuTru` (dòng trên), còn đường tự động
 * của d.280 đi qua đây nên **không** áp; đó là cùng một lệch có chủ ý đang chờ
 * chủ chốt ở `spec-questions.md` **#75**.
 */
export function cauLenhThemBinhLuan(
  db: D1Database,
  bl: BinhLuanDeGhi,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO comment
           (id, workspace_id, ticket_id, tac_gia_loai, tac_gia_agent_id, noi_dung,
            da_sua, tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        bl.id,
        bl.workspace_id,
        bl.ticket_id,
        bl.tac_gia.loai,
        bl.tac_gia.agentId ?? null,
        bl.noi_dung,
        bl.luc,
        bl.luc,
      ),
  ];
}

/* ------------------------------------------------------------------ *
 * Tra bình luận + so tác giả
 * ------------------------------------------------------------------ */

interface DongBinhLuan {
  id: string;
  ticket_id: string;
  tac_gia_loai: string;
  tac_gia_agent_id: string | null;
  noi_dung: string;
  da_sua: number;
  xoa_luc: number | null;
}

/**
 * Tra một bình luận **người gọi thấy được** (BAT-58, 19.12 câu 15): ticket của nó
 * trong phạm vi đọc, **hoặc** người gọi là tác giả (`locThayDongConGhi`). Người
 * ngoài ⇒ **cùng dòng `throw NOT_FOUND`** với id bịa. Trước BAT-58 câu tra cả
 * workspace rồi mới so tác giả, nên id thật của bình luận dự án khác ra 403 còn
 * id bịa ra 404 — một máy dò.
 */
async function binhLuanBatBuoc(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  comment_id: string,
): Promise<DongBinhLuan> {
  const loc = locThayDongConGhi(ai, 'comment');
  const d = await db
    .prepare(
      `SELECT id, ticket_id, tac_gia_loai, tac_gia_agent_id, noi_dung, da_sua, xoa_luc
         FROM comment WHERE id = ? AND workspace_id = ? AND xoa_luc IS NULL${loc.sql}`,
    )
    .bind(comment_id, workspace_id, ...loc.bind)
    .first<DongBinhLuan>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy bình luận.' });
  return d;
}

/** Người gọi có đúng là tác giả của bình luận này không. */
function laTacGia(dong: DongBinhLuan, tac_gia: TacGia): boolean {
  if (dong.tac_gia_loai !== tac_gia.loai) return false;
  if (tac_gia.loai !== 'agent') return true;
  return dong.tac_gia_agent_id === tac_gia.agentId;
}

/* ------------------------------------------------------------------ *
 * Sửa bình luận — **chỉ tác giả** (SPEC mục 4)
 * ------------------------------------------------------------------ */

export interface LenhSuaBinhLuan extends LenhChung {
  loai: 'sua_binh_luan';
  comment_id: string;
  noi_dung: string;
}

export async function handlerSuaBinhLuan(
  lenh: LenhSuaBinhLuan,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ id: string; da_sua: true }>> {
  const noi_dung = kiemNoiDungBinhLuan(lenh.noi_dung);

  const cu = await binhLuanBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.comment_id);

  // "**Tác giả** tự sửa được" — SPEC mục 4. Ai khác, kể cả chủ, là `FORBIDDEN`.
  if (!laTacGia(cu, tacGiaCua(lenh.ai))) {
    throw new BatonError('FORBIDDEN', { message: 'Chỉ tác giả sửa được bình luận của mình.' });
  }

  const ticket = await ticketBatBuoc(db, lenh.workspace_id, cu.ticket_id);
  batBuocVaoDuocDuAn(lenh.ai, ticket.project_id, 'sửa bình luận');
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id));

  return {
    cau_lenh: [
      db
        .prepare('UPDATE comment SET noi_dung = ?, da_sua = 1, cap_nhat_luc = ? WHERE id = ?')
        .bind(noi_dung, bay_gio, lenh.comment_id),
    ],
    danh_thuc: [`binh_luan:${cu.ticket_id}`],
    // Cờ "đã sửa" bật và **không bao giờ tắt lại** (SPEC mục 4: "có ghi 'đã sửa'").
    ket_qua: { id: lenh.comment_id, da_sua: true },
  };
}

/* ------------------------------------------------------------------ *
 * Xoá bình luận — agent **không bao giờ** (SPEC mục 3)
 * ------------------------------------------------------------------ */

export interface LenhXoaBinhLuan extends LenhChung {
  loai: 'xoa_binh_luan';
  comment_id: string;
}

export async function handlerXoaBinhLuan(
  lenh: LenhXoaBinhLuan,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<{ id: string; xoa_luc: number }>> {
  /*
   * Hàng "Xoá bất cứ thứ gì" của bảng quyền SPEC mục 3 là **tuyệt đối với
   * agent**: chủ cũng không ghi đè được (`VIEC_KHONG_BAO_GIO` trong `quyen.ts`,
   * cộng CHECK của `agent_permission` trong migration 0001). Gọi module quyền chứ
   * không tự viết `if (ai.loai === 'agent')`: luật nằm một chỗ duy nhất.
   */
  batBuocQuyen(lenh.ai, 'delete_anything', {});

  // Chỉ chủ tới được dòng này (agent đã bị chặn ở trên), nên lọc phạm vi là no-op.
  const cu = await binhLuanBatBuoc(db, lenh.ai, lenh.workspace_id, lenh.comment_id);
  const ticket = await ticketBatBuoc(db, lenh.workspace_id, cu.ticket_id);
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id));

  return {
    cau_lenh: [
      db
        .prepare('UPDATE comment SET xoa_luc = ?, cap_nhat_luc = ? WHERE id = ?')
        .bind(bay_gio, bay_gio, lenh.comment_id),
    ],
    danh_thuc: [`binh_luan:${cu.ticket_id}`],
    ket_qua: { id: lenh.comment_id, xoa_luc: bay_gio },
  };
}
