/**
 * **Ghi một sự kiện bảo mật tài khoản chủ** — 19.12 câu 3 d.594 ("mọi lần đặt
 * lại (TOTP hoặc mật khẩu) ghi một dòng Lịch sử và bắn một thông báo Telegram"),
 * BAT-16, migration 0026.
 *
 * Trả **câu lệnh**, không tự ghi: người gọi gộp chúng vào **cùng `batch()`** với
 * thay đổi thật (đổi mật khẩu, huỷ phiên, đặt lại TOTP, nhích bộ đếm sai) — cùng
 * thành, cùng hỏng. Không bao giờ có "mật khẩu đã đổi mà không dòng Nhật ký nào".
 *
 * ## Hai dòng, hai bảng sẵn có
 *
 *   * **Nhật ký quyết định** (`nhat_ky`, 0014) với `nguoi_loai = 'chu'`, dự án
 *     trống ("Chung", 19.12 câu 4). "Lịch sử" của mục 4 là `ticket_history`, mà
 *     cột `ticket_id` ở đó `NOT NULL` — một sự kiện tài khoản không thuộc ticket
 *     nào (`cau-hoi-spec.md` #148). `nhat_ky` là bảng chỉ-thêm (trigger của 0014,
 *     "kể cả chủ"), trả lời đúng câu "ai, lúc nào, vì sao" — nên không cần bảng mới.
 *   * **Kho thông báo** (`thong_bao`) với `loai = 'can_chu_do'`, `uu_tien = 'khan'`,
 *     `bao_mat = <sự kiện>` (xem đầu 0026). Từ đó cron mỗi phút gửi Telegram bằng
 *     **đúng** đường sẵn có: thử lại 3 lần, giữ trong chuông, "Cần chú ý" khi hết
 *     lượt (19.12 câu 6), và xuyên giờ yên lặng vì `khan` (d.350). Gửi trượt chỉ
 *     chạm dòng `thong_bao`, không chạm thao tác đã xong (d.606).
 *
 * Không mật khẩu, băm, muối, secret TOTP, token hay cookie nào đi vào đây — kiểu
 * `BoiCanhSuKienBaoMat` không có chỗ cho chúng.
 */

import {
  noiDungSuKienBaoMat,
  type BoiCanhSuKienBaoMat,
  type SuKienBaoMat,
} from '@baton/shared';

/** Điều kiện SQL chặn cả hai câu (vd "phiên hiện tại còn sống") + tham số của nó. */
export interface DieuKienGhi {
  sql: string;
  tham_so: readonly unknown[];
}

const LUON_DUNG: DieuKienGhi = { sql: '1', tham_so: [] };

export function cauLenhSuKienBaoMat(
  db: D1Database,
  workspace_id: string,
  su_kien: SuKienBaoMat,
  boi_canh: BoiCanhSuKienBaoMat,
  dieu_kien: DieuKienGhi = LUON_DUNG,
): D1PreparedStatement[] {
  const nd = noiDungSuKienBaoMat(su_kien, boi_canh);
  return [
    db
      .prepare(
        `INSERT INTO nhat_ky
           (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
         SELECT ?, ?, ?, 'chu', NULL, NULL, ?, ? WHERE ${dieu_kien.sql}`,
      )
      .bind(
        crypto.randomUUID(),
        workspace_id,
        boi_canh.luc,
        nd.quyet_dinh,
        nd.vi_sao,
        ...dieu_kien.tham_so,
      ),
    /*
     * **`loai = 'can_chu_do'` là MƯỢN, không phải "đây là một mục Cần Chủ 🔴"**
     * (BAT-17, phương án B). Một mã `loai` riêng cần sửa `CHECK` của 0012 và
     * trigger `tg_thong_bao_bao_mat_them` của 0026 (ép `loai = 'can_chu_do'`) —
     * tức một migration dựng lại bảng có dữ liệu. Mượn mã 🔴 cho tin này đúng đường gửi/thử lại/giờ yên lặng
     * của tin khẩn. Hệ quả cho **mọi chỗ đọc**: phân loại hay dán nhãn một tin
     * phải xét `bao_mat` **trước** `loai` (`congTacCuaTin`, `quyetDinhGuiTin` đã
     * làm vậy); chỗ nào dịch `loai` thành nhãn "Cần Chủ 🔴" mà bỏ qua `bao_mat`
     * là sai. Hôm nay không chỗ nào hiển thị dịch `thong_bao.loai` (web chỉ thấy
     * tin ở "Cần chú ý", nhãn của nguồn gửi trượt) — test BAT-17 ghim điều đó.
     */
    db
      .prepare(
        `INSERT INTO thong_bao (id, workspace_id, loai, uu_tien, noi_dung, bao_mat, tao_luc)
         SELECT ?, ?, 'can_chu_do', 'khan', ?, ?, ? WHERE ${dieu_kien.sql}`,
      )
      .bind(
        crypto.randomUUID(),
        workspace_id,
        nd.tin,
        su_kien,
        boi_canh.luc,
        ...dieu_kien.tham_so,
      ),
  ];
}
