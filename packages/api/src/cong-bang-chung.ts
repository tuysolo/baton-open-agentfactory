/**
 * **Cổng bằng chứng** — SPEC mục 7 d.213–217, 19.3, 19.10, 19.11.
 *
 * Phân vai như mọi chỗ khác trong dự án này:
 *   * `@baton/shared/cong-xong.ts` giữ **luật thuần** (danh sách bằng chứng + hai
 *     cờ hồ sơ dự án → đủ hay chưa, thiếu gì). Không I/O.
 *   * File này chỉ **tra D1** đúng những gì luật cần, rồi gọi luật.
 *
 * ## RÀNG BUỘC: cổng CHỈ ĐỌC D1, KHÔNG GỌI MẠNG
 *
 * Cổng chạy **bên trong Durable Object cửa ghi** (`workspace-gate.ts`, nơi dựng
 * `BoiCanhLenh.cong`). DO chạy **đơn luồng**, nên một lần `fetch()` ở đây treo
 * **toàn bộ hàng đợi ghi của cả workspace** trong suốt thời gian chờ mạng — mọi
 * lệnh tạo ticket, nộp báo cáo, nhịp tim của mọi agent đứng lại vì một lần gọi
 * GitHub chậm.
 *
 * Nên **việc xác minh (d.219–221) KHÔNG nằm ở đây**. Nó là:
 *   * một lần gọi **lúc gửi bằng chứng** (lượt 2), và
 *   * Cron thử lại / kiểm lại commit `pushed` (lượt 3),
 * cả hai ghi kết luận vào `evidence.xac_minh`. Cổng chỉ **đọc** kết luận đó.
 * Đó cũng là lý do bảng `evidence` có cột `xac_minh` thay vì tính lúc kiểm.
 *
 * ## Dự án không code: mục xác nhận TỰ SINH — ĐÃ CÀI (19.12 câu 57)
 *
 * d.217: dự án không code cần 1 `file` hoặc `note` **cộng chủ xác nhận**, tức
 * "một mục Cần Chủ loại Review tự sinh".
 *
 * Câu hỏi "mục đó sinh **lúc nào**, do **đường nào**" (`spec-questions.md` #59) đã
 * được chủ chốt ngày 04/10 thành **19.12 câu 57**: sinh **lúc cổng được kiểm** và
 * cổng thiếu đúng phần chủ xác nhận, **mọi** đường kiểm cổng kể cả đường tự lên
 * Xong định kỳ (d.221); **một** mục cho mỗi ticket; mục đã **Bỏ qua** chỉ dựng
 * lại khi có bằng chứng `file`/`note` **mới hơn** lần bỏ qua.
 *
 * Nên `chuDaXacNhan` **không còn là một chỗ cắm**. Nó đọc dòng `can_chu` mang mốc
 * `xac_nhan_ticket_id` của ticket (cột + index UNIQUE của migration 0016), và cổng
 * dưới đây gọi **bộ sinh** khi còn thiếu phần xác nhận. Cả hai nằm ở
 * `muc-xac-nhan.ts`, nơi ba gạch của câu 57 được chép nguyên văn.
 *
 * **Cổng vẫn KHÔNG ghi.** Bộ sinh chỉ **thu câu lệnh**; lệnh đang chạy đưa chúng
 * vào **cùng `db.batch()`** của nó. Ràng buộc "chỉ đọc D1" ở trên **không** bị
 * phá, và lý lẽ đầy đủ (gồm khảo sát mọi chỗ gọi cổng) ở đầu `muc-xac-nhan.ts`.
 *
 * Hệ quả hôm nay, khác hẳn lượt trước: ticket của dự án không code **vào được
 * Xong** — sau khi chủ bấm **Đạt** trên mục xác nhận. Chủ bấm **Bỏ qua** thì ticket
 * ở lại Chờ kiểm chứng (đúng chữ 19.10), và đường ép Xong kèm lý do (d.216) vẫn
 * còn nguyên.
 */

import {
  baoCaoDuocTinh,
  congXong,
  type BangChungChoCong,
  type CongBangChung,
  type KetLuanReview,
  type KetQuaCong,
  type LoaiBangChung,
  type XacMinhBangChung,
} from '@baton/shared';
import { sqlLoaiBangChung } from './loai-bang-chung.js';
import type { Env } from './moi-truong.js';
import { chuDaXacNhan, mucXacNhanCua, type BoSinhMucXacNhan } from './muc-xac-nhan.js';

/** Hai cờ của hồ sơ dự án mà cổng đọc — SPEC mục 7, 9 (migration 0001). */
interface CoDuAn {
  /** Của ticket, không của dự án — cần để truy vấn `evidence` đi trọn index. */
  workspace_id: string;
  khong_code: number;
  bat_buoc_review: number;
}

interface DongBangChung {
  id: string;
  loai: LoaiBangChung;
  gui_luc: number;
  xac_minh: Exclude<XacMinhBangChung, 'withdrawn'>;
  rut_luc: number | null;
  ket_luan: KetLuanReview | null;
  nguoi_gui_loai: 'owner' | 'agent';
  nguoi_gui_agent_id: string | null;
}

/**
 * **Người làm của ticket** — `agent_id` của người nhận **mọi** lượt `work`, kể cả
 * lượt đã kết. SPEC 19.3 d.496: "agent gửi review không phải người nhận của
 * **bất kỳ** lượt `worker` nào trên ticket đó" — chữ "bất kỳ" nên không lọc theo
 * trạng thái lượt.
 *
 * Lượt `review` **không** vào đây: người nhận một lượt review chính là reviewer.
 *
 * `nguoi_nhan_agent_id IS NOT NULL` trong `WHERE` là **phòng thủ tầng hai, không
 * có test mới** (lượt 2 sửa review): cột đó **nullable được** (lượt giao cho chủ),
 * nên không có điều kiện này thì mảng trả về có thể chứa `null` trong khi kiểu
 * khai là `string[]` — tức kiểu **nói sai sự thật**. Vô hại hôm nay vì `congXong`
 * đã chặn `id === null` ở tầng luật, và chính vì thế **không dựng được ca test nào
 * làm đổi kết quả**: thêm một lượt giao cho chủ rồi kiểm cổng thì hai bản (có và
 * không có điều kiện) cho cùng một kết luận. Ghi rõ ra đây thay vì để một lời khai
 * nửa vời.
 */
export async function nguoiLamCuaTicket(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT nguoi_nhan_agent_id AS id FROM luot_giao
        WHERE workspace_id = ? AND ticket_id = ? AND loai = 'work'
          AND nguoi_nhan_agent_id IS NOT NULL`,
    )
    .bind(workspace_id, ticket_id)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/*
 * `chuDaXacNhan` **không còn ở file này**. Nó ở `muc-xac-nhan.ts`, cạnh đường
 * **sinh** mục xác nhận — hai nửa của 19.12 câu 57, nên chúng ở một chỗ và không
 * có cách nào sửa một nửa mà quên nửa kia.
 */

/**
 * Thay đổi mà lệnh đang chạy **sắp** làm với bảng `evidence`, nhưng câu lệnh của nó
 * còn nằm trong `batch()` chưa chạy — nên truy vấn dưới đây đọc ra **dữ liệu cũ**.
 *
 * Cùng hình và cùng lý do với `DieuChinhTapDieuPhoi` của `lenh-trang-thai.ts`.
 * Người dùng đầu tiên là đường **tự lên Xong** của d.221: Cron vừa kết luận một
 * commit là `merged`, và chính kết luận đó là thứ mở cổng — kiểm cổng bằng dữ liệu
 * cũ thì cổng luôn trả "chưa đủ" và luật d.221 **không bao giờ chạy**.
 *
 * Hướng khác đã xét và bỏ: ghi `evidence` bằng một `.run()` riêng **trước** khi
 * kiểm cổng. Nó làm một lượt ghi thành hai giao dịch, nên một lần hỏng ở giữa để
 * lại bằng chứng `merged` với ticket còn ở Chờ kiểm chứng — và **không có ai**
 * kiểm lại cổng cho nó nữa (dòng đã rời cả hai index riêng phần của Cron).
 *
 * **Ba hình, đúng ba đường ghi có thật** — cùng nếp `DieuChinhTapDieuPhoi`:
 *   * `xac_minh` — chặng 3 của xác minh (d.219–221) sắp đổi kết luận một dòng.
 *   * `rut`      — lệnh `rut_bang_chung` (d.222) sắp đặt `rut_luc` cho một dòng.
 *   * `them`     — lệnh `gui_bang_chung` sắp **chèn** một dòng chưa có trong DB.
 *
 * Vì sao `rut` và `them` tồn tại dù **cổng** chưa cần tới chúng: cờ "cần review
 * lại" (19.3 d.494, 19.11 d.555) phải được tính **sau** lệnh đang chạy, và hai
 * lệnh bằng chứng là hai đường ghi đổi đúng tập dữ liệu mà cờ đọc. Gộp vào đây
 * thay vì dựng một nếp thứ hai: hai bản "dữ liệu sau lệnh" sẽ lệch nhau im lặng,
 * và lúc đó cổng với cờ nói hai chuyện khác nhau về cùng một ticket.
 */
export type DieuChinhBangChung =
  | { loai: 'xac_minh'; bang_chung_id: string; xac_minh: XacMinhBangChung }
  | { loai: 'rut'; bang_chung_id: string; rut_luc: number }
  | { loai: 'them'; bang_chung: BangChungChoCong };

/**
 * **Mọi bằng chứng của một ticket**, đã áp `dieu_chinh` của lệnh đang chạy, ở đúng
 * hình mà luật thuần đọc (`BangChungChoCong`).
 *
 * Một bản duy nhất cho cả cổng (`congXong`) và cờ "cần review lại"
 * (`tinhCanReviewLai`): hai luật đó phải nói **cùng một chuyện** về "review còn
 * hiệu lực", nên chúng phải đọc **cùng một tập dữ liệu**, không hai câu truy vấn.
 *
 * Lấy cả bằng chứng **đã rút**: luật 19.3 tính mốc "commit/deploy cuối cùng" trên
 * cả chúng (xem `cong-xong.ts` và `spec-questions.md` #56), nên lọc ở SQL là bỏ mất
 * dữ kiện của luật.
 *
 * `workspace_id` trong `WHERE` là **bắt buộc về hiệu năng**, không chỉ là phòng thủ
 * theo SPEC mục 1: `ix_evidence_ticket` dẫn đầu bằng `workspace_id`, nên bỏ nó ra
 * thì SQLite quét toàn index rồi sắp bằng B-tree tạm (`test/bang-chung.test.ts` đo
 * bằng `EXPLAIN QUERY PLAN`) — và truy vấn này chạy mỗi lần một ticket định vào
 * Xong.
 */
export async function bangChungChoCong(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  dieu_chinh: DieuChinhBangChung | null = null,
): Promise<BangChungChoCong[]> {
  const { results } = await db
    .prepare(
      // `loai` ĐÃ MAP (`bao_cao` cho dòng mượn `note`/`file`, migration 0027) — luật
      // cổng không bao giờ thấy mã mượn.
      `SELECT id, ${sqlLoaiBangChung()} AS loai, gui_luc, xac_minh, rut_luc, ket_luan,
              nguoi_gui_loai, nguoi_gui_agent_id
         FROM evidence WHERE workspace_id = ? AND ticket_id = ? ORDER BY gui_luc, id`,
    )
    .bind(workspace_id, ticket_id)
    .all<DongBangChung>();

  const ds: BangChungChoCong[] = results.map((r) => ({
    loai: r.loai,
    gui_luc: r.gui_luc,
    /*
     * Kết luận / lần rút **sắp** ghi của lệnh đang chạy thay cho giá trị trong DB —
     * xem `DieuChinhBangChung`. Chỉ đúng một dòng, và chỉ đúng trường mà lệnh đó
     * sửa: `gui_luc` và `ket_luan` là nội dung **bất biến** (trigger
     * `tg_evidence_noi_dung_bat_bien` của 0009), không lệnh nào đang sửa.
     */
    xac_minh:
      dieu_chinh?.loai === 'xac_minh' && dieu_chinh.bang_chung_id === r.id
        ? (dieu_chinh.xac_minh as DongBangChung['xac_minh'])
        : r.xac_minh,
    rut_luc:
      dieu_chinh?.loai === 'rut' && dieu_chinh.bang_chung_id === r.id
        ? dieu_chinh.rut_luc
        : r.rut_luc,
    ket_luan: r.ket_luan,
    nguoi_gui: { loai: r.nguoi_gui_loai, agent_id: r.nguoi_gui_agent_id },
  }));

  // Dòng **sắp chèn** của `gui_bang_chung`: thêm vào rồi sắp lại theo `gui_luc` để
  // tập này giống hệt tập mà lượt đọc kế tiếp (sau `batch()`) sẽ thấy.
  if (dieu_chinh?.loai === 'them') {
    ds.push(dieu_chinh.bang_chung);
    ds.sort((a, b) => a.gui_luc - b.gui_luc);
  }

  return ds;
}

/**
 * Cổng bằng chứng hiện hành của một workspace.
 *
 * `env` nhận vào nhưng chưa dùng: chữ ký giữ nguyên từ lượt trước để
 * `workspace-gate.ts` không phải đổi. Cổng **không** cần secret GitHub — xem ràng
 * buộc "không gọi mạng" ở đầu file.
 *
 * `bo_sinh` là **tuỳ chọn** và đó là một lựa chọn an toàn, không một sự lỏng tay:
 * chỉ hai chỗ gọi cổng (cả hai trong `workspace-gate.ts`, cả hai có `db.batch()`)
 * truyền nó. Một chỗ gọi mới ở lượt sau mà **không** truyền thì cổng ở đó chỉ
 * **đọc** — thiếu sót về hành vi, nhưng không có đường nào ghi mồ côi. Khảo sát
 * đầy đủ ở đầu `muc-xac-nhan.ts`.
 */
export function congBangChungCua(
  _env: Env,
  db: D1Database,
  dieu_chinh: DieuChinhBangChung | null = null,
  bo_sinh: BoSinhMucXacNhan | null = null,
): CongBangChung {
  return async (ticket_id: string): Promise<KetQuaCong> => {
    /*
     * Hai cờ lấy từ dự án của ticket, tra **mỗi lần kiểm** — SPEC 19.10: "Cổng áp
     * theo cờ 'có code hay không' **tại thời điểm kiểm**". Nên không có chỗ nào
     * nhớ lại cờ lúc tạo ticket, và chủ bật/tắt cờ giữa hai lần kiểm thì lần kiểm
     * sau đi theo cờ mới.
     */
    const co = await db
      .prepare(
        /*
       * "Không code" = cờ **dự án** (d.217) HOẶC cờ **ticket** (T-31 câu 3.4 A,
       * migration 0027) — cả hai đọc tại thời điểm kiểm (19.10).
       */
      `SELECT t.workspace_id AS workspace_id,
                CASE WHEN p.khong_code = 1 OR t.khong_code = 1 THEN 1 ELSE 0 END AS khong_code,
                p.bat_buoc_review AS bat_buoc_review
           FROM ticket t JOIN project p ON p.id = t.project_id
          WHERE t.id = ?`,
      )
      .bind(ticket_id)
      .first<CoDuAn>();

    /*
     * Không có ticket (hoặc không có dự án) thì cổng **đóng**, không ném lỗi:
     * người gọi cổng là luật trạng thái, và nó đã tra ticket trước đó rồi. Ném ở
     * đây chỉ biến một ca không thể xảy ra thành một 500.
     */
    if (co === null) {
      return { du: false, ly_do: 'Không tra được hồ sơ dự án của ticket để kiểm cổng.' };
    }

    // Mọi bằng chứng của ticket, **theo thứ tự thời gian**, đã áp `dieu_chinh` —
    // xem `bangChungChoCong`.
    const bang_chung = await bangChungChoCong(db, co.workspace_id, ticket_id, dieu_chinh);

    /*
     * Tập "người làm" chỉ cần cho luật "review **khác người làm**", tức chỉ khi
     * có một `review` ĐẠT còn hiệu lực trong tay — và chỉ khi dự án bắt buộc
     * review. Tra có điều kiện để không thêm một truy vấn vào cửa ghi cho những
     * ticket không có review nào (phần lớn các lần kiểm cổng).
     */
    const can_nguoi_lam =
      (co.khong_code !== 1 &&
        co.bat_buoc_review === 1 &&
        bang_chung.some((b) => b.loai === 'review' && b.rut_luc === null && b.ket_luan === 'pass')) ||
      // Ticket không code có `bao_cao` còn hiệu lực ⇒ cần "khác người làm" (#161).
      (co.khong_code === 1 && bang_chung.some((b) => b.loai === 'bao_cao' && b.rut_luc === null));
    const nguoi_lam = can_nguoi_lam
      ? await nguoiLamCuaTicket(db, co.workspace_id, ticket_id)
      : [];

    /*
     * **Mục xác nhận của dự án không code** — d.217, 19.12 câu 57.
     *
     * Chỉ tra khi thật cần: nhánh "dự án không code" là nhánh **duy nhất** đọc cờ
     * này, và nó là một truy vấn nữa trong cửa ghi.
     */
    let chu_xac_nhan = false;
    /*
     * Cổng đã đủ nhờ một `bao_cao` hợp lệ (T-31 câu 3.4 A) thì phần "chủ xác nhận"
     * không còn thiếu — nên **không** tra và **không** sinh mục xác nhận: gạch 1
     * của câu 57 chỉ sinh khi cổng thiếu đúng phần đó.
     */
    const du_nho_bao_cao = co.khong_code === 1 && baoCaoDuocTinh(bang_chung, nguoi_lam).length > 0;
    if (co.khong_code === 1 && !du_nho_bao_cao) {
      const muc = await mucXacNhanCua(db, co.workspace_id, ticket_id);
      chu_xac_nhan = chuDaXacNhan(muc);

      /*
       * **Gạch 1 của câu 57, nguyên văn: "Sinh lúc cổng được kiểm và cổng thiếu
       * đúng phần chủ xác nhận — đó là chỗ duy nhất biết được điều đó."**
       *
       * Nên điều kiện ở đây phải là **đúng** chữ đó, không rộng hơn: chỉ gọi bộ
       * sinh khi `chu_xac_nhan` là `false`, tức khi phần còn thiếu **là** phần
       * xác nhận. Vế bằng chứng (`file`/`note`) thiếu hay không thì bộ sinh tự
       * kiểm (d.238 đòi mục review có cái để xem) — xem `muc-xac-nhan.ts`.
       *
       * Bộ sinh **không ghi**: nó thu câu lệnh, cửa ghi đưa vào cùng `batch()`.
       */
      if (!chu_xac_nhan && bo_sinh !== null) {
        await bo_sinh.can(co.workspace_id, ticket_id, muc);
      }
    }

    return congXong({
      khong_code: co.khong_code === 1,
      bat_buoc_review: co.bat_buoc_review === 1,
      chu_xac_nhan,
      bang_chung,
      nguoi_lam,
    });
  };
}
