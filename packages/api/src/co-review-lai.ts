/**
 * **Cờ "cần review lại" — phần tra D1 và dựng câu lệnh.**
 * SPEC 19.3 d.494–496, 19.6 d.522, 19.11 d.555, mục 7 d.222.
 *
 * Phân vai đúng như `cong-bang-chung.ts`:
 *   * `@baton/shared/co-review-lai.ts` giữ **luật thuần** (`tinhCanReviewLai`):
 *     trạng thái ticket + danh sách bằng chứng + tập người làm → cờ phải là gì.
 *     Không I/O, không `Date.now()`.
 *   * File này chỉ **tra D1** đúng những gì luật cần, gọi luật, rồi dịch kết quả
 *     thành **câu lệnh ghi + dòng lịch sử**. Không một câu `if` nào về SPEC.
 *
 * ## RÀNG BUỘC: CHỈ ĐỌC D1, KHÔNG GỌI MẠNG
 *
 * Cùng ràng buộc và cùng lý do với `cong-bang-chung.ts`: mọi lời gọi của file này
 * chạy **bên trong Durable Object cửa ghi** (`workspace-gate.ts`), mà DO chạy **đơn
 * luồng** — một lần `fetch()` ở đây treo **toàn bộ hàng đợi ghi của cả workspace**
 * trong suốt thời gian chờ mạng. Việc xác minh bằng chứng (d.219–221) nằm ở tầng
 * Worker, ngoài DO; cờ này chỉ **đọc** kết luận đã có trong `evidence.xac_minh`.
 *
 * ## Vì sao cờ được TÍNH LẠI TỪ ĐẦU mỗi lượt ghi
 *
 * Xem ghi chú của `tinhCanReviewLai`. Hệ quả cho file này: nó **không** nhận "sự
 * kiện gì vừa xảy ra", chỉ nhận "trạng thái ticket **sau** lệnh" và `dieu_chinh`
 * bảng `evidence`. Nên mọi đường ghi nối vào đúng một hàm, và một đường ghi mới
 * không cần biết luật 19.3 nói gì.
 *
 * ## Mốc `can_review_lai_luc` — chỉ đặt khi TẮT → BẬT
 *
 * Migration 0011 định nghĩa cột là "lúc cờ **chuyển từ tắt sang bật**". Cờ còn bật
 * qua nhiều lượt ghi thì mốc **không nhích**: nếu nhích, đồng hồ 24 giờ của 19.6
 * d.522 ("có cờ 'cần review lại' **quá 24 giờ**") bị đặt lại mỗi lần một bằng chứng
 * mới tới, nên ngưỡng 🟡 **không bao giờ chạm được** — đúng cái bệnh mà ghi chú "gia
 * hạn đồng hồ 7 ngày" của 0010 đã nêu. Cờ tắt → mốc về NULL.
 *
 * Hai trigger của 0011 (`tg_ticket_can_review_lai_them` / `…_sua`) ABORT nếu cờ và
 * mốc không cùng có hoặc cùng không, nên một lỗi ở đây làm **đổ cả lượt ghi** thay
 * vì để lại một dòng mà d.522 không tính được.
 */

import {
  tinhCanReviewLai,
  type QuyetDinhCanReviewLai,
  type TrangThaiTicket,
} from '@baton/shared';
import { bangChungChoCong, nguoiLamCuaTicket, type DieuChinhBangChung } from './cong-bang-chung.js';
import type { YeuCauGhiLichSu } from './lenh-khung.js';

/** Hai cột mà cờ này ghi — 0001 (cờ) + 0011 (mốc). */
interface CoTrongDb {
  co_can_review_lai: number;
  can_review_lai_luc: number | null;
}

/** Cùng giá trị `TAT` của luật thuần, dựng lại cho đường thoát sớm. */
const TAT: QuyetDinhCanReviewLai = { co: false, ly_do: null, ve_cho_kiem_chung: false };

/**
 * Ticket này có **một bằng chứng `review` chưa rút** nào không — một truy vấn
 * `LIMIT 1`, đi theo `ix_evidence_ticket` (0009).
 *
 * Dùng cho **đường thoát sớm** của `coReviewLaiCua`. Vì sao đúng: nhánh thứ hai của
 * `tinhCanReviewLai` trả `TAT` ngay khi tập review còn hiệu lực **rỗng** ("chưa có
 * review nào thì không có gì *lại*"), nên với một ticket không có review nào thì cờ
 * **phải tắt**, bất kể còn bao nhiêu commit / deploy / người làm. Cộng thêm ba điều
 * kiện ở chỗ gọi (không bằng chứng mới, cờ **đang tắt**, mốc **đang NULL**) thì không
 * có câu lệnh nào để ghi và không có nhánh kéo trạng thái nào để chạy.
 *
 * Giá: **1** lần đọc thay vì **3** (`bangChungChoCong` đọc **mọi** dòng `evidence` của
 * ticket, `nguoiLamCuaTicket` đọc `DISTINCT` trên `luot_giao`).
 */
async function coReviewConHieuLuc(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
): Promise<boolean> {
  const d = await db
    .prepare(
      `SELECT 1 AS co FROM evidence
        WHERE workspace_id = ? AND ticket_id = ? AND loai = 'review' AND rut_luc IS NULL
        LIMIT 1`,
    )
    .bind(workspace_id, ticket_id)
    .first<{ co: number }>();
  return d !== null;
}

export interface KetQuaCoReviewLai {
  /** Kết luận của luật thuần — gồm cả `ve_cho_kiem_chung` của d.494. */
  quyet_dinh: QuyetDinhCanReviewLai;
  /**
   * Câu lệnh cập nhật hai cột cờ. **Rỗng khi không có gì đổi** — không ghi lại một
   * giá trị y nguyên: `UPDATE` đó sẽ nhích `cap_nhat_luc` của ticket (mục 11 "Vừa
   * xong 24 giờ qua" và mọi danh sách sắp theo cập nhật cuối đọc nó) cho một lượt
   * ghi không đổi gì, và nó ghi một dòng lịch sử rỗng.
   *
   * Người gọi **phải gộp vào cùng `batch()`** với lệnh đang chạy. Tách ra là mở một
   * cửa sổ mà DB có bằng chứng mới nhưng cờ còn giá trị cũ.
   */
  cau_lenh: D1PreparedStatement[];
  /** Dòng lịch sử cho lần đổi cờ, tác giả **hệ thống**. Rỗng khi cờ không đổi. */
  lich_su: YeuCauGhiLichSu[];
  /** Giá trị cờ **trước** lượt ghi này — để test và người gọi biết có đổi hay không. */
  co_truoc: boolean;
}

/**
 * Cờ "cần review lại" **phải** là gì sau lệnh đang chạy, và câu lệnh để ghi nó.
 *
 * `trang_thai_sau` là trạng thái ticket **sau** lệnh, không phải trạng thái trong
 * DB: một ticket vừa tự lên Xong trong cùng batch phải được xét như **đã Xong**
 * (d.495 "Ticket đã Xong không bị hạ"), nếu không cờ sẽ được bật lên một ticket vừa
 * kết và nằm đó mãi — `doc-du-an.ts` lọc "có cờ" **trong SQL** nên không ai tính
 * lại cho nó.
 *
 * `dieu_chinh` cũng vậy, cho bảng `evidence`: câu lệnh của lệnh đang chạy còn trong
 * batch chưa chạy nên truy vấn đọc ra **dữ liệu cũ**. Xem `DieuChinhBangChung`.
 *
 * ## Đường thoát sớm, và một ca mà ba điều kiện "hiển nhiên" KHÔNG phủ
 *
 * Điều kiện thoát sớm là `dieu_chinh === null` **và** cờ đang tắt **và** mốc đang NULL
 * **và** ticket **chưa có review nào** còn hiệu lực.
 *
 * Điều kiện thứ tư là bắt buộc, và đây là lý do — nó là một ca thật, không phải lo xa:
 * ba điều kiện đầu **không** bảo đảm cờ phải tắt. Một ticket có thể **đã có** một
 * `review fail` trong DB trong khi `co_can_review_lai` vẫn là `0` — mọi ticket như vậy
 * trong một DB đang chạy **trước** lượt này đều thế, và `evidence` còn hai đường ghi
 * **không qua cửa ghi** (migration, nhập dữ liệu của mục 16) mà `cong-xong.ts` và
 * `cron-bang-chung.ts` đã nêu làm lý do cho các lớp phòng thủ của chúng. Thoát sớm
 * theo ba điều kiện đầu sẽ **bỏ mất** đúng tính chất tự chữa mà ghi chú "tính lại từ
 * đầu" của `tinhCanReviewLai` khai: lượt ghi không-bằng-chứng đầu tiên phải **bật** cờ
 * cho ticket đó, không phải bỏ qua nó.
 *
 * Ngược lại, điều kiện "trạng thái sau không thuộc nhóm `closed`" là **không cần**:
 * nhóm `closed` ⇒ luật trả `TAT`, mà cờ đang tắt và mốc đang NULL thì `TAT` **không có
 * gì để ghi**. Bỏ nó ra tiết kiệm đúng một lần đọc cho các lệnh đóng ticket.
 */
export async function coReviewLaiCua(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  trang_thai_sau: TrangThaiTicket,
  bay_gio: number,
  dieu_chinh: DieuChinhBangChung | null = null,
): Promise<KetQuaCoReviewLai> {
  const cu = await db
    .prepare(
      `SELECT co_can_review_lai, can_review_lai_luc FROM ticket
        WHERE id = ? AND workspace_id = ?`,
    )
    .bind(ticket_id, workspace_id)
    .first<CoTrongDb>();

  const co_truoc = cu?.co_can_review_lai === 1;
  const moc_truoc = cu?.can_review_lai_luc ?? null;

  /*
   * **THOÁT SỚM** — xem `coReviewConHieuLuc`. Giữ bất biến "mọi đường ghi gọi cùng một
   * hàm" mà không trả giá 3 lần đọc D1 trong cửa ghi cho những lệnh **không thể** đổi
   * cờ (mở lượt giao, "Tôi làm", và mọi lần `baton status` không đụng nhóm `closed`).
   */
  if (dieu_chinh === null && !co_truoc && moc_truoc === null) {
    if (!(await coReviewConHieuLuc(db, workspace_id, ticket_id))) {
      return { quyet_dinh: TAT, cau_lenh: [], lich_su: [], co_truoc };
    }
  }

  const quyet_dinh = tinhCanReviewLai({
    trang_thai: trang_thai_sau,
    bang_chung: await bangChungChoCong(db, workspace_id, ticket_id, dieu_chinh),
    /*
     * Tập "người làm" — 19.3 d.496, cần để **không tính** một review ĐẠT do chính
     * người làm gửi. Tra **vô điều kiện**, khác cổng (cổng tra có điều kiện để tiết
     * kiệm một truy vấn): ở đây điều kiện "có review ĐẠT còn hiệu lực" không đủ —
     * luật còn phải phân biệt ca "chỉ có review ĐẠT **của người làm**" (không bật
     * cờ, vì chưa có lần review nào được tính) với ca "review ĐẠT hết hiệu lực"
     * (bật cờ). Hai ca đó chỉ tách được **sau khi** đã lọc theo `nguoi_lam`.
     */
    nguoi_lam: await nguoiLamCuaTicket(db, workspace_id, ticket_id),
  });

  /*
   * Mốc: **chỉ đặt khi tắt → bật** (xem đầu file). `?? bay_gio` là đường chữa cho
   * một dòng cờ bật mà mốc NULL — chỉ tới được bằng một đường ghi ngoài cửa ghi
   * (migration, nhập tay của mục 16) vì trigger 0011 chặn đường trong. Trả về NULL
   * trong ca đó sẽ làm chính trigger ấy ABORT cả lượt ghi, tức một dòng dữ liệu bẩn
   * khoá vĩnh viễn mọi lệnh trên ticket đó.
   */
  const moc_sau = quyet_dinh.co ? (co_truoc ? (moc_truoc ?? bay_gio) : bay_gio) : null;

  if (quyet_dinh.co === co_truoc && moc_sau === moc_truoc) {
    return { quyet_dinh, cau_lenh: [], lich_su: [], co_truoc };
  }

  return {
    quyet_dinh,
    cau_lenh: [
      db
        .prepare(
          `UPDATE ticket SET co_can_review_lai = ?, can_review_lai_luc = ?, cap_nhat_luc = ?
            WHERE id = ? AND workspace_id = ?`,
        )
        .bind(quyet_dinh.co ? 1 : 0, moc_sau, bay_gio, ticket_id, workspace_id),
    ],
    /*
     * Một dòng lịch sử, theo đúng nếp `apDungLenTicket`: `truong` là **tên cột**,
     * giá trị là chuỗi của `0`/`1`. Mốc `can_review_lai_luc` **không** vào lịch sử —
     * cùng lý do `trong_tay_tu_luc` của 19.1 không vào: nó là mốc nội bộ để tính một
     * chỉ báo, không phải một trường của ticket mà chủ đọc trên dòng thời gian.
     *
     * `ly_do` (`review_het_hieu_luc` / `review_khong_dat`) cũng **không** được lưu:
     * nó suy ra được từ chính tập bằng chứng bất kỳ lúc nào (`tinhCanReviewLai`), và
     * lưu một bản thứ hai là mời nó lệch với tập bằng chứng. Người gọi nhận nó trong
     * `quyet_dinh` để trả ra API / dựng câu cho màn hình "Cần chú ý" (phần 6).
     *
     * Tác giả là **hệ thống**: không ai gõ lệnh "bật cờ", server tự tính — cùng nếp
     * d.221 ("lịch sử ghi người làm là hệ thống"). Người gọi đặt `tac_gia`.
     */
    lich_su: [
      {
        ticket_id,
        truong: 'co_can_review_lai',
        gia_tri_cu: co_truoc ? '1' : '0',
        gia_tri_moi: quyet_dinh.co ? '1' : '0',
        tac_gia: { loai: 'system' },
      },
    ],
    co_truoc,
  };
}
