/**
 * Đường **ĐỌC** của báo cáo sáng và handoff tối — SPEC mục 11 d.322–336.
 *
 * Lệnh đọc **không** qua cửa ghi (Durable Object): đi thẳng D1, nếp của
 * `doc-tong-quan.ts`, `doc-nhat-ky.ts`. Hình của dữ liệu và **chữ** của báo cáo
 * sống ở `@baton/shared` → `bao-cao.ts` (hàm thuần, có test riêng); file này chỉ
 * gom dữ liệu và **chuyển** sang hình đó.
 *
 * ## Báo cáo là của CHỦ — đường đọc chỉ chủ
 *
 * Mục 11 nằm trong mục 14 ("Giao diện web **của chủ**"), và `tongQuan()` — nguồn
 * của bốn trong mười vế dưới đây — đã là "chỉ chủ" từ phần 6. Nên mọi hàm ở đây
 * nhận `ai: AiGoi` và đi qua `batBuocLaChu`, không qua một bộ lọc phạm vi dự án:
 * một báo cáo **lọc theo phạm vi** sẽ là một báo cáo khác cho mỗi người đọc, tức
 * không còn là "báo cáo của ngày 06/10" mà `bao_cao` lưu một bản duy nhất.
 *
 * Hệ quả khai thẳng: **agent không đọc được báo cáo**, kể cả `coordinator` — kẻ
 * duy nhất SPEC cho **ghi** trọng tâm (d.324). Đó là hướng chặt (nới dễ hơn
 * siết), và SPEC không có câu nào cho agent quyền đọc mục 11.
 *
 * ## "Hôm qua" KHÁC "24 giờ qua", và lẫn hai thứ đó là một lỗi thật
 *
 * d.325 nói "**Hôm qua** đã xong" — một **ngày dương lịch** trên tường của chủ,
 * nửa đêm tới nửa đêm (`nuaDemCuaNgay` của `@baton/shared`, tức qua
 * `MUI_GIO_CHU_PHUT`, 19.12 câu 60). Trang Tổng quan thì dùng một cửa sổ **trượt
 * 24 giờ** (d.317, d.320), và nó đúng ở đó vì Tổng quan là một màn hình mở lúc
 * nào cũng được.
 *
 * Một báo cáo sáng 07:30 mà nói "hôm qua" bằng cửa sổ trượt sẽ **bỏ sót** việc
 * xong lúc 07:00 hôm qua (đã quá 24 giờ) và **đếm thêm** việc xong lúc 00:30 hôm
 * nay (chưa tới 24 giờ) — tức một dòng "Hôm qua đã xong" kể cả việc của hôm nay
 * và bỏ nửa giờ cuối của hôm qua. Nên hai vế của d.325 và d.328 đi qua
 * `khoangNgay` dưới đây, **không** qua `CUA_SO_VUA_XONG_MS` của Tổng quan. Cách
 * đọc này là một đề xuất tạm — `spec-questions.md` **#118**.
 *
 * ## Trần: báo cáo thừa hưởng trần của Tổng quan
 *
 * `tongQuan()` có trần riêng cho từng khối (`TRAN_DU_AN` 200, `TRAN_AGENT` 200,
 * `TRAN_CAN_CHU_Y_MOI_NGUON` 50, `TRAN_VUA_XONG` 50, `SO_MUC_GAP_NHAT` 3), và
 * **báo cáo thừa hưởng nguyên** chúng: vế "Cần Chủ" (d.323) chỉ có 3 mục gấp
 * nhất, vế "Rủi ro và lệch" (d.327) tối đa 50 dòng **mỗi nguồn**, vế "Trạng thái
 * từng dự án" (d.332) tối đa 200 dự án. Các câu mới của file này có trần riêng
 * khai dưới đây. Hệ quả: một báo cáo **không bao giờ** là một bản kết xuất đầy đủ
 * của DB — nó là một bản tóm, và trần là chỗ nó dừng.
 */

import {
  BatonError,
  NHAN_BAO_CAO,
  NHAN_SUC_SONG,
  SO_DONG_CHI_TIET_TIN,
  kiemLimit,
  laLoaiBaoCao,
  maCanChu,
  moCursor,
  ngayDiaPhuong,
  nhan,
  nuaDemCuaNgay,
  trongTamDat,
  type AiGoi,
  type DongChuYBaoCao,
  type DuAnBaoCao,
  type DuLieuBaoCao,
  type DuLieuBaoCaoSang,
  type DuLieuBaoCaoToi,
  type LoaiBaoCao,
  type MucGapNhatBaoCao,
  type MucTrongTamBaoCao,
  type QuyetDinhBaoCao,
  type TrangKetQua,
  type ViecBaoCao,
  type ViecDangChayBaoCao,
  type YeuCauTrang,
} from '@baton/shared';
import { batBuocLaChu } from './lenh-khung.js';
import { batBuocGhiDuocTrongTam } from './lenh-bao-cao.js';
import { dungTrang } from './doc-du-an.js';
import {
  cauGapNhat,
  tongQuan,
  TRANG_THAI_DA_DONG,
  type DongCanChuY,
  type HangDuAn,
  type NhomCanChuY,
} from './doc-tong-quan.js';

const MOT_NGAY_MS = 24 * 60 * 60 * 1000;

/** Nhãn của chủ trong báo cáo — cùng chữ mà trang Nhật ký của phần 6 dùng. */
export const NHAN_CHU = 'Chủ';

/** Trần dòng của các câu **mới** trong file này. Xem khối ghi chú đầu file. */
export const TRAN_VIEC_XONG_NGAY = 100;
export const TRAN_DANG_CHAY = 100;
export const TRAN_CHUYEN_SANG_MAI = 100;
export const TRAN_CAN_CHU_MOI = 50;
export const TRAN_QUYET_DINH_MOI = 50;

/**
 * **Người đọc của một lượt Cron.**
 *
 * Cron sinh báo cáo không có token nào và không có request nào, nhưng các câu đọc
 * ở đây (và `tongQuan`) đòi một `AiGoi` để kiểm "chỉ chủ". Hằng này là **chủ**, và
 * nó không phải một cửa hậu: không có đường HTTP nào dựng được một `AiGoi` như vậy
 * (xác thực luôn đi qua `xac-thuc.ts`), và một báo cáo là **của chủ** nên đọc với
 * tư cách chủ là đúng nghĩa, không một phép nới quyền.
 */
export const AI_CHU_CRON: AiGoi = { loai: 'chu' };

/**
 * Khoảng **nửa mở** `[tu, den)` theo epoch của một ngày trên tường `YYYY-MM-DD`.
 *
 * Nửa mở, không `[tu, den]`: lấy `den = tu + 1 ngày` thì một việc xong lúc
 * 23:59:59.999 vẫn thuộc ngày đó, còn `<= nửa đêm cuối ngày` thì **mất gần trọn
 * một ngày** dữ liệu — cùng lỗi lệch-một mà `khoangNgayXuLy` của mục 8 đã khai.
 *
 * Ngày sai dạng → `null` (người gọi quyết `INVALID_INPUT`), cùng nếp
 * `nuaDemCuaNgay`.
 */
export function khoangNgay(ngay: string): { tu: number; den: number } | null {
  const tu = nuaDemCuaNgay(ngay);
  return tu === null ? null : { tu, den: tu + MOT_NGAY_MS };
}

/** Ngày trên tường **hôm trước** của một ngày `YYYY-MM-DD`. */
export function ngayHomQua(ngay: string): string | null {
  const nua_dem = nuaDemCuaNgay(ngay);
  return nua_dem === null ? null : ngayDiaPhuong(nua_dem - MOT_NGAY_MS);
}

/* ================================================================== *
 * 1. Trọng tâm của một ngày — d.324 (đề xuất) + d.331 ("đạt hay chưa")
 * ================================================================== */

/**
 * Ba trọng tâm của một ngày, **kèm trạng thái ticket của chúng**.
 *
 * d.331 đọc "đạt hay chưa" từ `ticket.trang_thai`, nên câu này `JOIN ticket` chứ
 * không đọc một cột "đạt" nào — không có cột ấy, và sẽ không có (xem khối ghi chú
 * của bảng `trong_tam`, migration 0020).
 *
 * Ticket **đã xoá mềm** (`xoa_luc IS NOT NULL`) vẫn ra, có chủ ý: nó vẫn là một
 * trọng tâm đã được đề xuất, và im lặng bỏ nó đi làm bộ 3 thành bộ 2 mà không ai
 * biết vì sao. Nhãn trạng thái của nó nói đủ.
 *
 * Đi trọn trong khoá chính `(workspace_id, ngay, thu_tu)` của `trong_tam`, nên
 * không cần trần: `CHECK (thu_tu BETWEEN 1 AND 3)` đã là trần 3 dòng.
 */
export async function trongTamCuaNgay(
  db: D1Database,
  workspace_id: string,
  ngay: string,
): Promise<MucTrongTamBaoCao[]> {
  const { results } = await db
    .prepare(
      `SELECT tt.thu_tu AS thu_tu, tt.ghi_chu AS ghi_chu,
              t.so AS so, t.tieu_de AS tieu_de, t.trang_thai AS trang_thai,
              pr.ma AS du_an_ma
         FROM trong_tam tt
         JOIN ticket t   ON t.id = tt.ticket_id AND t.workspace_id = tt.workspace_id
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE tt.workspace_id = ? AND tt.ngay = ?
        ORDER BY tt.thu_tu`,
    )
    .bind(workspace_id, ngay)
    .all<{
      thu_tu: number;
      ghi_chu: string | null;
      so: number;
      tieu_de: string;
      trang_thai: string;
      du_an_ma: string;
    }>();

  return results.map((r) => ({
    thu_tu: r.thu_tu,
    ma: `${r.du_an_ma}-${String(r.so)}`,
    tieu_de: r.tieu_de,
    nhan_trang_thai: nhan('trang_thai_ticket', r.trang_thai),
    // **Luật của d.331 nằm trong một hàm thuần**, không trong câu SQL: `trang_thai
    // = 'done'` viết trong `WHERE` thì không test được riêng, và nó sẽ bị gõ lại ở
    // đường đọc thứ hai.
    dat: trongTamDat(r.trang_thai),
    ghi_chu: r.ghi_chu,
  }));
}

/* ================================================================== *
 * 2. Xong trong MỘT NGÀY dương lịch — d.325
 * ================================================================== */

/**
 * Ticket **Xong trong đúng một ngày trên tường** — d.325 ("Hôm qua đã xong").
 *
 * Đi theo `ix_ticket_xong_luc` (index riêng phần `WHERE xong_luc IS NOT NULL` của
 * 0009-trở-lên, cùng index mà `khoiVuaXong` của Tổng quan dùng): điều kiện
 * `xong_luc >= ? AND xong_luc < ?` khớp đúng cột dẫn đầu, nên nó là một `SEARCH`.
 *
 * Khác `khoiVuaXong` **chỉ ở hai biên** — và đó là cả nội dung của khối ghi chú
 * "Hôm qua KHÁC 24 giờ qua" ở đầu file. Không gọi lại `khoiVuaXong` với một mốc
 * khác: hàm đó chỉ nhận `bay_gio` và tự trừ 24 giờ, nên nó **không** biểu diễn
 * được một khoảng nửa mở.
 *
 * Không lấy bằng chứng rút gọn (d.320 đòi, nhưng cho khối "Vừa xong" của **Tổng
 * quan**, không cho d.325): một báo cáo kể "hôm qua xong gì", và chuỗi bằng chứng
 * nằm trên trang ticket.
 */
export async function viecXongTrongNgay(
  db: D1Database,
  workspace_id: string,
  ngay: string,
  tran = TRAN_VIEC_XONG_NGAY,
): Promise<ViecBaoCao[]> {
  const khoang = khoangNgay(ngay);
  if (khoang === null) return [];

  const { results } = await db
    .prepare(
      `SELECT t.so AS so, t.tieu_de AS tieu_de, t.trang_thai AS trang_thai, pr.ma AS du_an_ma
         FROM ticket t
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE t.workspace_id = ? AND t.xoa_luc IS NULL AND t.trang_thai = 'done'
          AND t.xong_luc IS NOT NULL AND t.xong_luc >= ? AND t.xong_luc < ?
        ORDER BY t.xong_luc, t.id
        LIMIT ?`,
    )
    .bind(workspace_id, khoang.tu, khoang.den, tran)
    .all<{ so: number; tieu_de: string; trang_thai: string; du_an_ma: string }>();

  return results.map(viecCua);
}

function viecCua(r: {
  so: number;
  tieu_de: string;
  trang_thai: string;
  du_an_ma: string;
}): ViecBaoCao {
  return {
    ma: `${r.du_an_ma}-${String(r.so)}`,
    tieu_de: r.tieu_de,
    nhan_trang_thai: nhan('trang_thai_ticket', r.trang_thai),
  };
}

/* ================================================================== *
 * 3. Đang chạy — d.326
 * ================================================================== */

/**
 * Ticket **Đang làm**, kèm **ai đang cầm** — d.326 ("Đang chạy").
 *
 * Một câu riêng chứ không gom từ `tongQuan().agent`: thẻ agent của d.318 trả lời
 * câu **ngược** ("agent này cầm gì"), nên một ticket Đang làm mà **không ai cầm**
 * (cờ `co_khong_ai_cam` của 19.1) sẽ không có thẻ nào kể nó — và đó đúng là ticket
 * mà một dòng "Đang chạy" phải nêu trước nhất. `LEFT JOIN` ở đây giữ nó lại với
 * `agent_id = null`.
 *
 * "Đang cầm" dùng **cùng** định nghĩa của mục 4 + 19.1 (lượt giao mở = `pending`
 * hoặc `in_progress`), giống hệt `ticketDangCam` của Tổng quan — một khái niệm,
 * không hai.
 *
 * Một ticket có thể có nhiều lượt mở (lượt `work` + lượt `review`), nên
 * `GROUP BY` và lấy `min(nguoi_nhan_agent_id)` sẽ chọn bừa. Dùng
 * `group_concat` theo thứ tự xác định thì chữ dài; chọn **một dòng cho mỗi lượt
 * mở** và để `dungBaoCaoSangMd` in từng dòng — chủ cần biết **cả hai** người đang
 * dính vào một ticket, đó không phải nhiễu.
 */
export async function viecDangChay(
  db: D1Database,
  workspace_id: string,
  tran = TRAN_DANG_CHAY,
): Promise<ViecDangChayBaoCao[]> {
  const { results } = await db
    .prepare(
      `SELECT t.so AS so, t.tieu_de AS tieu_de, t.trang_thai AS trang_thai,
              pr.ma AS du_an_ma, lg.nguoi_nhan_agent_id AS agent_id
         FROM ticket t
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
         LEFT JOIN luot_giao lg
                ON lg.ticket_id = t.id AND lg.workspace_id = t.workspace_id
               AND lg.trang_thai IN ('pending', 'in_progress')
        WHERE t.workspace_id = ? AND t.xoa_luc IS NULL AND t.trang_thai = 'in_progress'
        ORDER BY t.so, lg.nguoi_nhan_agent_id
        LIMIT ?`,
    )
    .bind(workspace_id, tran)
    .all<{
      so: number;
      tieu_de: string;
      trang_thai: string;
      du_an_ma: string;
      agent_id: string | null;
    }>();

  return results.map((r) => ({ ...viecCua(r), agent_id: r.agent_id }));
}

/* ================================================================== *
 * 4. Chuyển sang mai — d.333
 * ================================================================== */

/**
 * **"Chuyển sang mai"** — d.333.
 *
 * SPEC **không định nghĩa** vế này: nó cho đúng bốn chữ ấy và không nói "chuyển"
 * là gì. Đề xuất tạm (`spec-questions.md` **#119**): **ticket còn trong nhóm trạng
 * thái `chạy`** lúc sinh handoff, tức `in_progress` + `verifying` (bảng
 * `NHOM_CUA_TRANG_THAI_TICKET` của mục 0.1) — đó là tập việc **đã mở và chưa
 * kết** lúc hết ngày, nên nó là tập việc sang mai phải tiếp.
 *
 * Vì sao **không** lấy cả `backlog`/`todo`: chúng thuộc nhóm `chờ`, tức việc chưa
 * ai bắt đầu. Một handoff kể cả backlog là một handoff kể cả tồn đọng của sáu
 * tháng trước, và nó sẽ dài tới mức không ai đọc — tức mất luôn vế này.
 *
 * Vì sao **không** suy từ "trọng tâm chưa đạt": một trọng tâm chưa đạt đã có vế
 * riêng ở d.331, và việc sang mai thì nhiều hơn ba.
 */
export async function chuyenSangMai(
  db: D1Database,
  workspace_id: string,
  tran = TRAN_CHUYEN_SANG_MAI,
): Promise<ViecBaoCao[]> {
  const { results } = await db
    .prepare(
      `SELECT t.so AS so, t.tieu_de AS tieu_de, t.trang_thai AS trang_thai, pr.ma AS du_an_ma
         FROM ticket t
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE t.workspace_id = ? AND t.xoa_luc IS NULL
          AND t.trang_thai IN ('in_progress', 'verifying')
        ORDER BY t.hang_uu_tien, t.so
        LIMIT ?`,
    )
    .bind(workspace_id, tran)
    .all<{ so: number; tieu_de: string; trang_thai: string; du_an_ma: string }>();

  return results.map(viecCua);
}

/* ================================================================== *
 * 5. Cần Chủ MỚI PHÁT SINH trong ngày — d.334
 * ================================================================== */

/**
 * **"Cần Chủ mới phát sinh"** — d.334, và chữ **"mới phát sinh"** là cả luật:
 * mục **tạo trong ngày** đó, **không** mọi mục đang chờ.
 *
 * Khác hẳn vế 1 của báo cáo sáng (d.323 "Cần Chủ (đọc trước)", tức **mọi** mục
 * `Chờ`): handoff tối trả lời "hôm nay có thêm việc gì cần Chủ quyết", nên một mục
 * đã chờ ba ngày **không** thuộc đây — nó đã vào báo cáo sáng ba lần rồi.
 *
 * Lấy mọi mục tạo trong ngày **bất kể trạng thái hiện tại**: một mục tạo lúc 10:00
 * và chủ đã xử lý lúc 11:00 vẫn là một mục "mới phát sinh hôm nay", và một handoff
 * im về nó sẽ khai hôm nay không có gì phát sinh. Nhãn mức đi kèm, nên chủ phân
 * biệt được 🔴 với ⚪.
 *
 * Đi theo `ix_can_chu_khoi`/`tao_luc` của 0013; điều kiện là một khoảng trên
 * `tao_luc`, tức một `SEARCH` chứ không một `SCAN`.
 */
export async function canChuMoiTrongNgay(
  db: D1Database,
  workspace_id: string,
  ngay: string,
  tran = TRAN_CAN_CHU_MOI,
): Promise<MucGapNhatBaoCao[]> {
  const khoang = khoangNgay(ngay);
  if (khoang === null) return [];

  const { results } = await db
    .prepare(
      `SELECT ma_so, tieu_de, muc FROM can_chu
        WHERE workspace_id = ? AND tao_luc >= ? AND tao_luc < ?
        ORDER BY tao_luc, id
        LIMIT ?`,
    )
    .bind(workspace_id, khoang.tu, khoang.den, tran)
    .all<{ ma_so: number; tieu_de: string; muc: string }>();

  return results.map((r) => ({
    ma: maCanChu(r.ma_so),
    tieu_de: r.tieu_de,
    nhan_muc: nhan('muc_can_chu', r.muc),
  }));
}

/* ================================================================== *
 * 6. Quyết định mới trong Nhật ký — d.328
 * ================================================================== */

/**
 * Dòng Nhật ký ghi **trong một ngày trên tường** — d.328 ("Quyết định **mới**
 * trong Nhật ký").
 *
 * Một câu riêng chứ không `lietKeNhatKy`: hàm đó lọc theo dự án / theo ai / theo
 * chữ và phân trang keyset, nhưng **không** có bộ lọc khoảng ngày — và thêm một
 * tham số vào nó chỉ để phục vụ chỗ này sẽ nới một đường đọc của mục 10 vì một
 * nhu cầu của mục 11.
 *
 * Không có bộ lọc phạm vi dự án (`locPhamViNhatKy`): đường này **chỉ chủ** (xem
 * đầu file), và với chủ thì mảnh SQL đó rỗng — gọi nó ở đây chỉ để nó không làm gì
 * là một lời khai sai về việc ai đọc được báo cáo.
 *
 * "Mới" = **ngày hôm qua** khi báo cáo sáng gọi nó (cùng khung với d.325, xem khối
 * đầu file và `spec-questions.md` #118) — người gọi truyền ngày, hàm này không đoán.
 */
export async function quyetDinhTrongNgay(
  db: D1Database,
  workspace_id: string,
  ngay: string,
  tran = TRAN_QUYET_DINH_MOI,
): Promise<QuyetDinhBaoCao[]> {
  const khoang = khoangNgay(ngay);
  if (khoang === null) return [];

  const { results } = await db
    .prepare(
      `SELECT nguoi_loai, agent_id, quyet_dinh, vi_sao FROM nhat_ky
        WHERE workspace_id = ? AND luc >= ? AND luc < ?
        ORDER BY luc, id
        LIMIT ?`,
    )
    .bind(workspace_id, khoang.tu, khoang.den, tran)
    .all<{
      nguoi_loai: string;
      agent_id: string | null;
      quyet_dinh: string;
      vi_sao: string;
    }>();

  return results.map((r) => ({
    // d.308 gọi trường này là "ai". `nguoi_loai = 'chu'` ⇒ chủ; nếu không thì
    // `agent_id`. Không bao giờ để trống: một quyết định không có người là một dòng
    // không ai chịu trách nhiệm.
    nguoi: r.nguoi_loai === 'chu' || r.agent_id === null ? NHAN_CHU : r.agent_id,
    quyet_dinh: r.quyet_dinh,
    vi_sao: r.vi_sao,
  }));
}

/* ================================================================== *
 * 7. Chuyển từ hình của Tổng quan sang hình của báo cáo
 * ================================================================== */

/**
 * Một dòng "Cần chú ý" (d.319) → một dòng của vế "Rủi ro và lệch" (d.327).
 *
 * `chi_tiet` là một **câu tiếng Việt do máy chủ dựng**, không một object: nó đi
 * vào markdown của `bao_cao.noi_dung_md`, tức một chuỗi bất biến, nên hình của nó
 * không được phụ thuộc vào thứ giao diện sẽ vẽ ở lượt sau.
 *
 * Mỗi nguồn nói thứ cụ thể nhất nó có — nếp 19.12 câu 42 ("gộp cái cụ thể vào cái
 * mơ hồ là che thông tin"): có ticket thì nêu mã ticket, có phiên thì nêu agent và
 * nhãn trạng thái phiên, có lý do (bằng chứng trượt, tin không gửi được) thì nêu
 * lý do — và lý do của tin **đã lọc** nên không mang secret (mục 15 d.417).
 */
export function dongChuYCuaBaoCao(d: DongCanChuY): DongChuYBaoCao {
  const phan: string[] = [];
  if (d.ticket !== null) phan.push(`${d.ticket.ma} ${d.ticket.tieu_de}`);
  if (d.phien !== null) phan.push(`agent ${d.phien.agent_id}: ${d.phien.nhan_trang_thai}`);
  if (d.luot_giao !== null) phan.push(`lượt giao của ${d.luot_giao.nguoi_nhan_agent_id}`);
  if (d.bang_chung !== null && d.bang_chung.ly_do !== null) phan.push(d.bang_chung.ly_do);
  if (d.thong_bao !== null && d.thong_bao.ly_do !== null) phan.push(d.thong_bao.ly_do);

  return {
    nhan_loai: d.nhan_loai,
    chi_tiet: phan.length === 0 ? d.nhan_loai : phan.join(' — '),
    ma_ticket: d.ticket?.ma ?? null,
  };
}

/**
 * Trải phẳng "Cần chú ý" thành dòng rủi ro, bỏ dòng của ticket đã đóng
 * (Xong/Huỷ/Trùng — hằng chung `TRANG_THAI_DA_DONG`; Trùng không phải rủi ro).
 */
export function ruiRoCuaBaoCao(nhom: readonly NhomCanChuY[]): DongChuYBaoCao[] {
  return nhom
    .flatMap((n) => n.ly_do)
    .filter((d) => d.ticket === null || !TRANG_THAI_DA_DONG.includes(d.ticket.trang_thai))
    .map(dongChuYCuaBaoCao);
}

/** 5 mục Cần Chủ đang chờ đầu tiên, cùng thứ tự "gấp nhất" của Tổng quan. */
async function canChuChoDau(db: D1Database, workspace_id: string): Promise<MucGapNhatBaoCao[]> {
  const cau = cauGapNhat(workspace_id, SO_DONG_CHI_TIET_TIN);
  const { results } = await db
    .prepare(cau.sql)
    .bind(...cau.bind)
    .all<{ ma_so: number; muc: string; tieu_de: string }>();
  return results.map((r) => ({
    ma: `T-${String(r.ma_so)}`,
    tieu_de: r.tieu_de,
    nhan_muc: nhan('muc_can_chu', r.muc),
  }));
}

/** Một hàng dự án của d.317 → một dòng của vế "Trạng thái từng dự án" (d.332). */
export function duAnCuaBaoCao(h: HangDuAn): DuAnBaoCao {
  return {
    ma: h.ma,
    ten: h.ten,
    // ⚪ nói **đúng câu** của d.74 vì `NHAN_SUC_SONG.trang` **là**
    // `CAU_DU_AN_KHONG_CHAY` — một bảng nhãn, không hai, không một `if` ở đây.
    nhan_suc_song: NHAN_SUC_SONG[h.suc_song],
    so_dang_lam: h.so_dang_lam,
    so_cho_kiem_chung: h.so_cho_kiem_chung,
    so_xong_24h: h.so_xong_24h,
  };
}

/* ================================================================== *
 * 8. Hai báo cáo — một lượt gọi mỗi cái
 * ================================================================== */

/**
 * **Dữ liệu của báo cáo sáng** — sáu vế của d.322–328.
 *
 * `bay_gio` qua **tham số**, như mọi chỗ phụ thuộc thời gian của dự án này
 * (`decisions.md` 01/10): ba khoảng ngày của báo cáo này phải ghim được bằng một
 * con số, không bằng cách chờ tới 07:30 thật.
 *
 * `ngay` là ngày trên tường của `bay_gio` (`ngayDiaPhuong`, tức qua
 * `MUI_GIO_CHU_PHUT` — 19.12 câu 60), nên một lượt cron 00:30 UTC sinh báo cáo của
 * **ngày Việt Nam đang diễn ra**, không của ngày UTC.
 */
export async function duLieuBaoCaoSang(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<DuLieuBaoCaoSang> {
  batBuocLaChu(ai, 'xem báo cáo');

  const ngay = ngayDiaPhuong(bay_gio);
  const hom_qua = ngayHomQua(ngay) ?? ngay;

  const [tq, ds_cho, trong_tam, xong_hom_qua, dang_chay, quyet_dinh_moi] = await Promise.all([
    tongQuan(db, ai, workspace_id, bay_gio),
    canChuChoDau(db, workspace_id),
    trongTamCuaNgay(db, workspace_id, ngay),
    viecXongTrongNgay(db, workspace_id, hom_qua),
    viecDangChay(db, workspace_id),
    quyetDinhTrongNgay(db, workspace_id, hom_qua),
  ]);

  return {
    ngay,
    tao_luc: bay_gio,
    can_chu: {
      so_cho: tq.can_chu.so_cho,
      so_theo_muc: { ...tq.can_chu.so_theo_muc },
      gap_nhat: tq.can_chu.gap_nhat.map((m) => ({
        ma: m.ma,
        tieu_de: m.tieu_de,
        nhan_muc: m.nhan_muc,
      })),
      ds_cho,
    },
    trong_tam,
    hom_qua: { ngay: hom_qua, viec: xong_hom_qua },
    dang_chay,
    // d.327 nói thẳng vế này **là** mục "Cần chú ý" của Tổng quan, nên nó dùng lại
    // nguyên khối đó — không một bộ luật thứ hai về "rủi ro".
    /*
     * `can_chu_y` của Tổng quan đã **gom theo ticket** từ BAT-6 đợt 3 (d.321),
     * nhưng "Rủi ro và lệch" của d.329 là một **danh sách câu** trong markdown —
     * một dòng cho mỗi **lý do**, không một dòng mang nhiều nhãn. Nên trải phẳng
     * lại ở đây, giữ đúng thứ tự nhóm → lý do trong nhóm.
     */
    rui_ro_va_lech: ruiRoCuaBaoCao(tq.can_chu_y),
    quyet_dinh_moi,
  };
}

/** **Dữ liệu của handoff tối** — bốn vế của d.330–334. */
export async function duLieuBaoCaoToi(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<DuLieuBaoCaoToi> {
  batBuocLaChu(ai, 'xem báo cáo');

  const ngay = ngayDiaPhuong(bay_gio);

  const [tq, ds_cho, trong_tam, sang_mai, can_chu_moi] = await Promise.all([
    tongQuan(db, ai, workspace_id, bay_gio),
    canChuChoDau(db, workspace_id),
    // d.331 — "**3 trọng tâm HÔM NAY**", tức cùng ngày với chính handoff này.
    trongTamCuaNgay(db, workspace_id, ngay),
    chuyenSangMai(db, workspace_id),
    canChuMoiTrongNgay(db, workspace_id, ngay),
  ]);

  return {
    ngay,
    tao_luc: bay_gio,
    trong_tam,
    du_an: tq.du_an.map(duAnCuaBaoCao),
    chuyen_sang_mai: sang_mai,
    can_chu_moi,
    so_can_chu_cho: tq.can_chu.so_cho,
    ds_can_chu_cho: ds_cho,
    rui_ro_va_lech: ruiRoCuaBaoCao(tq.can_chu_y),
  };
}

/** Dữ liệu của một báo cáo theo loại — một cửa duy nhất cho cron và cho test. */
export function duLieuBaoCao(
  loai: LoaiBaoCao,
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<DuLieuBaoCao> {
  return loai === 'sang'
    ? duLieuBaoCaoSang(db, ai, workspace_id, bay_gio)
    : duLieuBaoCaoToi(db, ai, workspace_id, bay_gio);
}

/* ================================================================== *
 * 9. Xem lại báo cáo đã lưu — d.336
 * ================================================================== */

/**
 * Một báo cáo **đã lưu** như đường đọc trả ra — d.336 ("lưu theo ngày, **xem lại
 * được**, **xuất ra markdown được**").
 *
 * `noi_dung_md` là chữ **đã chốt lúc sinh**, không dựng lại: xem khối "Xuất ra
 * markdown không cần một bộ chuyển đổi thứ hai" ở đầu `@baton/shared/bao-cao.ts`.
 * `du_lieu` là `du_lieu_json` đã phân tích, để trang web vẽ từng vế.
 */
export interface BaoCaoRa {
  ngay: string;
  loai: LoaiBaoCao;
  /** Nhãn tiếng Việt của loại — mục 0.1. */
  nhan_loai: string;
  tao_luc: number;
  noi_dung_md: string;
  /**
   * `null` khi `du_lieu_json` của một dòng cũ không phân tích được. Không ném lỗi:
   * một báo cáo vẫn **xem lại được** qua `noi_dung_md` (vế chính của d.336), và để
   * một dòng hỏng chặn cả đường đọc là biến một lỗi dữ liệu thành một trang trắng.
   */
  du_lieu: DuLieuBaoCao | null;
}

/** Một ngày đã có báo cáo — hàng của danh sách d.336 ("xem lại được"). */
export interface HangBaoCao {
  ngay: string;
  loai: LoaiBaoCao;
  nhan_loai: string;
  tao_luc: number;
}

export type TrangBaoCao = TrangKetQua<HangBaoCao>;

function docDuLieu(json: string): DuLieuBaoCao | null {
  try {
    return JSON.parse(json) as DuLieuBaoCao;
  } catch {
    return null;
  }
}

/**
 * **Danh sách ngày đã có báo cáo** — d.336 ("xem lại được"), mới nhất trước.
 *
 * Phân trang **keyset**, không `OFFSET` (nếp đã chốt, `@baton/shared/trang.ts`):
 * khoá là `(ngay, loai)` **giảm dần**, và đó đã là một thứ tự **toàn phần** vì
 * `(workspace_id, ngay, loai)` là khoá chính của bảng — nên không cần nối thêm
 * `id` như các danh sách khác (bảng này **không có** cột `id`).
 *
 * Đi theo `ix_bao_cao_ngay` của 0020, đúng chiều `DESC` của index.
 */
export async function lietKeBaoCao(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauTrang = {},
): Promise<TrangBaoCao> {
  batBuocLaChu(ai, 'xem báo cáo');

  const limit = kiemLimit(yeu_cau.limit);
  const bind: (string | number)[] = [workspace_id];
  let moc = '';

  if (yeu_cau.cursor !== undefined && yeu_cau.cursor !== '') {
    const khoa = moCursor(yeu_cau.cursor, 2);
    // So **cặp** `(ngay, loai)` chứ không hai điều kiện rời: `ngay < ? OR (ngay = ?
    // AND loai < ?)` là đúng phép so từ điển mà `ORDER BY ngay DESC, loai DESC`
    // dùng. Chỉ so `ngay <` sẽ **bỏ sót** báo cáo thứ hai của chính ngày ở biên.
    moc = ' AND (ba.ngay < ? OR (ba.ngay = ? AND ba.loai < ?))';
    bind.push(String(khoa[0]), String(khoa[0]), String(khoa[1]));
  }

  const { results } = await db
    .prepare(
      `SELECT ngay, loai, tao_luc FROM bao_cao ba
        WHERE ba.workspace_id = ?${moc}
        ORDER BY ba.ngay DESC, ba.loai DESC
        LIMIT ?`,
    )
    .bind(...bind, limit + 1)
    .all<{ ngay: string; loai: string; tao_luc: number }>();

  return dungTrang(
    results,
    limit,
    (r): HangBaoCao => {
      /*
       * Kiểu hẹp lại **ở biên**: `loai` tới từ DB (một `CHECK` giữ nó), nhưng một
       * giá trị lạ không được âm thầm đi tiếp dưới dạng `LoaiBaoCao` — cùng nếp
       * `laUuTienTin` ở `tinCanGui` của `cron-thong-bao.ts`.
       */
      const loai: LoaiBaoCao = laLoaiBaoCao(r.loai) ? r.loai : 'sang';
      return { ngay: r.ngay, loai, nhan_loai: NHAN_BAO_CAO[loai], tao_luc: r.tao_luc };
    },
    (r) => [r.ngay, r.loai],
  );
}

/**
 * **Một báo cáo** — d.336 ("xem lại được", "xuất ra markdown được").
 *
 * Không có ⇒ `NOT_FOUND`/404, cùng nếp mọi đường đọc của Baton. `loai` sai dạng
 * cũng là `NOT_FOUND`, **không** `INVALID_INPUT`: nó tới từ **đường dẫn**
 * (`/v1/bao-cao/:ngay/:loai`), và một đoạn đường dẫn không hợp lệ là một đường
 * không tồn tại.
 */
export async function layBaoCao(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  ngay: string,
  loai: string,
): Promise<BaoCaoRa> {
  batBuocLaChu(ai, 'xem báo cáo');

  const khong_thay = (): never => {
    throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy báo cáo của ngày này.' });
  };
  if (!laLoaiBaoCao(loai)) return khong_thay();
  if (nuaDemCuaNgay(ngay) === null) return khong_thay();

  const d = await db
    .prepare(
      `SELECT ngay, loai, tao_luc, noi_dung_md, du_lieu_json FROM bao_cao
        WHERE workspace_id = ? AND ngay = ? AND loai = ?`,
    )
    .bind(workspace_id, ngay, loai)
    .first<{
      ngay: string;
      loai: string;
      tao_luc: number;
      noi_dung_md: string;
      du_lieu_json: string;
    }>();
  if (d === null) return khong_thay();

  return {
    ngay: d.ngay,
    loai,
    nhan_loai: NHAN_BAO_CAO[loai],
    tao_luc: d.tao_luc,
    noi_dung_md: d.noi_dung_md,
    du_lieu: docDuLieu(d.du_lieu_json),
  };
}

/* ================================================================== *
 * Trọng tâm hiện hành — đọc SỐNG (BAT-11, cau-hoi-spec #147)
 * ================================================================== */

/** Một dòng của bộ trọng tâm hiện hành. */
export interface MucTrongTamSong {
  thu_tu: number;
  /** Id nội bộ của ticket — để ô ghi gửi lại đúng thứ đã đọc. */
  ticket_id: string;
  ma: string;
  tieu_de: string;
  ghi_chu: string | null;
  /** `null` = chủ tự ghi. */
  agent_id: string | null;
  /** Tên agent đã ghi; `null` khi chủ ghi (hoặc agent không còn). */
  nguoi_ghi: string | null;
  tao_luc: number;
}

export interface TrongTamSongRa {
  /** Ngày trên tường — **server suy**, không nhận tham số. */
  ngay: string;
  muc: MucTrongTamSong[];
}

/**
 * `GET /v1/trong-tam` — bộ trọng tâm **hôm nay**, đọc thẳng bảng `trong_tam`.
 *
 * Báo cáo sáng là bản chụp bất biến lúc 07:30; bộ ghi sau đó chỉ thấy được ở đây.
 * Quyền = quyền ghi (`batBuocGhiDuocTrongTam`). Không nhận ngày: không có đường
 * nào đọc trọng tâm của ngày khác ngoài báo cáo đã lưu.
 */
export async function layTrongTamSong(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<TrongTamSongRa> {
  batBuocGhiDuocTrongTam(ai);
  const ngay = ngayDiaPhuong(bay_gio);
  const { results } = await db
    .prepare(
      `SELECT tt.thu_tu AS thu_tu, tt.ticket_id AS ticket_id, tt.ghi_chu AS ghi_chu,
              tt.agent_id AS agent_id, tt.tao_luc AS tao_luc, ag.ten AS nguoi_ghi,
              t.so AS so, t.tieu_de AS tieu_de, pr.ma AS du_an_ma
         FROM trong_tam tt
         JOIN ticket t   ON t.id = tt.ticket_id AND t.workspace_id = tt.workspace_id
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
         LEFT JOIN agent ag ON ag.id = tt.agent_id AND ag.workspace_id = tt.workspace_id
        WHERE tt.workspace_id = ? AND tt.ngay = ?
        ORDER BY tt.thu_tu`,
    )
    .bind(workspace_id, ngay)
    .all<{
      thu_tu: number;
      ticket_id: string;
      ghi_chu: string | null;
      agent_id: string | null;
      tao_luc: number;
      nguoi_ghi: string | null;
      so: number;
      tieu_de: string;
      du_an_ma: string;
    }>();
  return {
    ngay,
    muc: results.map((r) => ({
      thu_tu: r.thu_tu,
      ticket_id: r.ticket_id,
      ma: `${r.du_an_ma}-${String(r.so)}`,
      tieu_de: r.tieu_de,
      ghi_chu: r.ghi_chu,
      agent_id: r.agent_id,
      nguoi_ghi: r.nguoi_ghi,
      tao_luc: r.tao_luc,
    })),
  };
}
