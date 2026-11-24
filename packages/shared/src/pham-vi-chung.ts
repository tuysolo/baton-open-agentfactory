/**
 * **Tầm nhìn của dòng "Chung"** (trường dự án **rỗng** — 19.12 câu 4).
 *
 * ## Vì sao có một module riêng cho đúng một luật
 *
 * "Chung" là một lớp dòng mà **cửa dự án của `quyen()` không có gì để kiểm**:
 * cửa đó lọc theo `project_id`, mà ở đây `project_id IS NULL`. Lớp đó xuất hiện
 * ở **hai** chỗ của SPEC — mục Cần Chủ (mục 8, 19.12 câu 4) và dòng Nhật ký
 * quyết định (mục 10; câu 4 nói rõ "dòng Nhật ký tự sinh từ một mục Chung để
 * **trống** trường dự án"). Và **SPEC không nói lớp đó hiện cho ai** — xem
 * `cau-hoi-spec.md` **#69**.
 *
 * Nên luật này là một **đề xuất tạm chờ chủ chốt**, và điều kiện bắt buộc của
 * một đề xuất tạm là: đổi được ở **đúng một chỗ**. Đó là file này. Hai đường
 * đọc (Cần Chủ ở lượt sau, Nhật ký ở lượt này) đều đi qua đây, nên khi chủ chốt
 * khác thì việc phải làm là sửa hai hằng dưới đây, không phải đi tìm điều kiện
 * rải trong hai module truy vấn.
 *
 * ## Ba hàm, một luật — dùng hàm nào
 *
 *   * `tamNhinDongChung` là **luật gốc**: ba mức tầm nhìn. Hai hàm kia chỉ dịch
 *     kết luận của nó sang hai hình dạng mà hai đường đọc cần.
 *   * `sqlDongChung` — dịch sang một mảnh `WHERE`, cho đường đọc **danh sách**
 *     (lọc phải nằm trong SQL, không là một lần `if` sau khi đã đọc). Đây là
 *     hàm mà `doc-nhat-ky.ts` dùng.
 *   * `docDuocDongChung` — dịch sang một câu hỏi **trên một dòng đã đọc**, cho
 *     chỗ đã cầm dòng trong tay. Đường đọc Nhật ký **không** gọi nó (nó lọc hẳn
 *     trong SQL, kể cả khi đọc một dòng theo id — xem `layNhatKy`); người dùng
 *     của nó là **đường đọc Cần Chủ ở lượt 2b**, nơi ba khối của mục 8 và
 *     `baton result T-x` cầm sẵn mục rồi mới hỏi "người này đọc được không".
 *     Tới lúc đó, cả hai hàm vẫn rẽ theo đúng một `tamNhinDongChung`, nên hai
 *     đường không lệch được.
 *
 * ## Đề xuất tạm đang áp (CoS đã đưa chủ duyệt, câu #69)
 *
 *   * **chủ** và agent vai **`coordinator`**: đọc được **mọi** dòng Chung.
 *   * agent vai **`manager`**: chỉ đọc dòng Chung **do chính mình ghi**.
 *   * vai khác (`worker`, `reviewer`): **không** đọc dòng Chung nào.
 *   * Ngoài phạm vi → **`NOT_FOUND`**, không `FORBIDDEN` — nếp "không lộ sự tồn
 *     tại" của mục 13, áp cho mọi đường ĐỌC của Baton.
 *
 * Hướng này **chặt hơn** đường **TẠO** (vốn đã mở cho cả `manager` — #69, cột
 * "đề xuất tạm"), và chặt hơn là đúng chiều: một `manager` phải **hỏi** được
 * chủ về chuyện ngoài dự án mình, nhưng không vì thế mà **đọc** được câu hỏi
 * của một `manager` khác. Nới ra về sau dễ hơn thu lại.
 */

import type { AiGoi } from './quyen.js';
import type { VaiTroAgent } from './ma-nhan.js';

/** Vai trò đọc được **mọi** dòng Chung — đề xuất tạm #69. */
export const VAI_TRO_DOC_MOI_DONG_CHUNG = [
  'coordinator',
] as const satisfies readonly VaiTroAgent[];

/** Vai trò chỉ đọc được dòng Chung **do chính mình ghi** — đề xuất tạm #69. */
export const VAI_TRO_DOC_DONG_CHUNG_CUA_MINH = [
  'manager',
] as const satisfies readonly VaiTroAgent[];

/** Ba mức tầm nhìn có thể có với lớp dòng Chung. */
export type TamNhinChung = 'moi_dong' | 'chi_cua_minh' | 'khong';

/** Tầm nhìn của người gọi với lớp dòng Chung — xem đầu file. */
export function tamNhinDongChung(ai: AiGoi): TamNhinChung {
  if (ai.loai === 'chu') return 'moi_dong';
  // Agent bị tắt không đọc được gì (SPEC mục 3) — tầng xác thực đã chặn trước,
  // nhưng hàm này không được dựa vào chuyện đó để kết luận rộng hơn.
  if (ai.disabled) return 'khong';
  if ((VAI_TRO_DOC_MOI_DONG_CHUNG as readonly VaiTroAgent[]).includes(ai.vai_tro)) {
    return 'moi_dong';
  }
  if ((VAI_TRO_DOC_DONG_CHUNG_CUA_MINH as readonly VaiTroAgent[]).includes(ai.vai_tro)) {
    return 'chi_cua_minh';
  }
  return 'khong';
}

/** Một mảnh `WHERE` kèm tham số — chỗ gọi không bao giờ ghép chuỗi có dữ liệu. */
export interface ManhDieuKien {
  sql: string;
  bind: string[];
}

/**
 * **Điều kiện SQL** của lớp dòng Chung — cùng một luật `tamNhinDongChung`, viết
 * sang hình dạng mà một câu `WHERE` dùng được. `null` = người gọi **không** đọc
 * được dòng Chung nào, tức chỗ gọi đừng thêm nhánh nào cho lớp này.
 *
 * Tên cột truyền vào vì hai bảng đặt tên khác nhau: `nhat_ky` có
 * `(project_id, agent_id)`, còn `can_chu` của lượt 2b có
 * `(project_id, tao_boi_agent_id)`. Cả hai bảng đều dùng quy ước **cột agent
 * rỗng = do chủ**, nên `cot_agent = ?` đã hàm ý "dòng do một agent ghi".
 *
 * Chỉ nhận **tên cột**, không nhận dữ liệu người dùng: không có đường nào để
 * một giá trị đi vào chuỗi SQL.
 */
export function sqlDongChung(
  ai: AiGoi,
  cot: { du_an: string; agent: string },
): ManhDieuKien | null {
  switch (tamNhinDongChung(ai)) {
    case 'moi_dong':
      return { sql: `${cot.du_an} IS NULL`, bind: [] };
    case 'chi_cua_minh':
      // `chi_cua_minh` chỉ có nghĩa với một agent; `tamNhinDongChung` không bao
      // giờ trả mức này cho chủ, nhưng hàm này không dựa vào chuyện đó.
      if (ai.loai !== 'agent') return null;
      return {
        sql: `(${cot.du_an} IS NULL AND ${cot.agent} = ?)`,
        bind: [ai.agent_id],
      };
    case 'khong':
      return null;
  }
}

/**
 * Người gọi có đọc được **một** dòng Chung cụ thể không.
 *
 * `nguoi_ghi_agent_id` là `null` khi dòng do **chủ** ghi — và một dòng Chung của
 * chủ thì không `manager` nào đọc được, vì nó không phải "dòng của chính mình".
 */
export function docDuocDongChung(ai: AiGoi, nguoi_ghi_agent_id: string | null): boolean {
  switch (tamNhinDongChung(ai)) {
    case 'moi_dong':
      return true;
    case 'chi_cua_minh':
      return ai.loai === 'agent' && nguoi_ghi_agent_id === ai.agent_id;
    case 'khong':
      return false;
  }
}
