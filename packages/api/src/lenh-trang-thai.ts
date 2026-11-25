/**
 * **Đổi trạng thái ticket** — SPEC mục 4 (dòng 133–139), 19.2, 19.4, 19.10, 19.11.
 *
 * Phân vai rõ ràng:
 *   * `@baton/shared/luat-trang-thai.ts` giữ **luật thuần** (trạng thái + sự kiện
 *     → trạng thái mới hoặc lỗi). Không I/O, không giờ hệ thống.
 *   * File này chỉ **tra dữ liệu** mà luật cần (ticket điều phối? còn mấy con
 *     chưa kết? cổng bằng chứng nói gì?), gọi luật, rồi dịch kết quả thành câu
 *     lệnh ghi + dòng lịch sử cho cửa ghi.
 *
 * Nhờ vậy từng luật của SPEC có test đơn vị riêng, **và** có test qua HTTP cho
 * những ca đi được end-to-end ở lượt này (reviewer lượt 2 đã bắt một lỗ vì chỉ
 * có test đơn vị).
 */

import {
  apDungLuat,
  batBuocQuyen,
  kiemCo,
  kiemChuTuyChon,
  kiemTrangThaiTicket,
  nhomTrangThai,
  ticketGocHopLe,
  trangThaiDieuPhoiTheo,
  BatonError,
  type AiGoi,
  type BoiCanhLuat,
  type BoiCanhNguoiCam,
  type CongBangChung,
  type KetQuaLuat,
  type QuyetDinhCanReviewLai,
  type SuKienTrangThai,
  type TacGia,
  type TrangThaiTicket,
} from '@baton/shared';
import { TRANG_THAI_TICKET_DONG_PHIEN } from '@baton/shared';
import { coReviewLaiCua } from './co-review-lai.js';
import { cauLenhDongPhienTheoTicket } from './lenh-phien.js';
import type { DieuChinhBangChung } from './cong-bang-chung.js';
import {
  batBuocKhongLuuTru,
  batBuocLaChu,
  duAnBatBuoc,
  phamViLuotGiao,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
  type YeuCauGhiLichSu,
} from './lenh-khung.js';
import {
  cauLenhNguoiCam,
  laTicketDieuPhoi,
  soConChuaKet,
  ticketBatBuoc,
  type DongTicketGhi,
} from './lenh-ticket.js';
import { boiCanhNguoiCamCua } from './doc-luot-giao.js';
import { locPhamViTicket } from './pham-vi-doc.js';

/** Tác giả của thay đổi do hệ thống — SPEC mục 7 ("lịch sử ghi người làm là hệ thống"). */
const HE_THONG: TacGia = { loai: 'system' };

/**
 * **Việc đã xong ⇒ đóng phiên** — SPEC mục 6 d.181.
 *
 * Một hàm, hai chỗ gọi (`apSuKienLenTicket` cho các sự kiện của lượt giao, và
 * `handlerDoiTrangThai` cho `baton status` / kéo thả của chủ): hai bản chép sẽ
 * lệch nhau ngay lần sửa đầu, và hệ quả của lệch là đúng cái lỗi d.181 tồn tại
 * để chặn — một việc đã Xong còn hiện "phiên đứng" ở "Cần chú ý".
 *
 * Đọc **trạng thái cuối** (sau cả nhánh cờ "cần review lại" của 19.3 d.494), không
 * trạng thái của sự kiện gốc: d.494 có thể kéo ticket **về** Chờ kiểm chứng — vẫn
 * là một trong hai trạng thái của d.181 — hoặc ngược lại kéo khỏi Xong.
 */
function cauLenhDongPhienNeuViecXong(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  trang_thai_cu: TrangThaiTicket,
  trang_thai: TrangThaiTicket,
  bay_gio: number,
): D1PreparedStatement[] {
  // d.181 nói "SANG Chờ kiểm chứng hoặc Xong": chỉ đóng lúc trạng thái thật sự đổi.
  // Ticket đã ở `verifying` từ trước mà bị ghi lại `verifying` không đóng gì.
  if (trang_thai_cu === trang_thai || !TRANG_THAI_TICKET_DONG_PHIEN.includes(trang_thai)) {
    return [];
  }
  // Sang `verifying`: lượt `review` vừa được giao để kiểm chứng, giữ phiên của nó.
  return cauLenhDongPhienTheoTicket(
    db,
    workspace_id,
    ticket_id,
    bay_gio,
    undefined,
    trang_thai === 'verifying',
  );
}

/* ------------------------------------------------------------------ *
 * Dịch kết quả luật thành câu lệnh ghi
 * ------------------------------------------------------------------ */

interface ThayDoiCot {
  cot: string;
  gia_tri: string | number | null;
}

/**
 * Các mốc thời gian và trường phụ thuộc trạng thái — SPEC mục 4 ("các mốc thời
 * gian (tạo, cập nhật, **bắt đầu**, **xong**)").
 *
 *   * `bat_dau_luc`: đặt **lần đầu** ticket vào nhóm `active`. Không đặt lại mỗi
 *     lần quay lại Đang làm — "bắt đầu" là một mốc, không phải lần gần nhất.
 *   * `xong_luc`: đặt khi vào Xong; **xoá** khi rời Xong (chủ mở lại), nếu không
 *     "Vừa xong 24 giờ qua" (mục 11) sẽ hiện ticket đã bị mở lại.
 *   * `ly_do_huy`, `trung_voi_ticket_id`: chỉ có nghĩa ở Huỷ / Trùng; rời trạng
 *     thái đó thì xoá.
 *   * `chu_tu_lam`: chủ thôi cầm khi ticket không còn ở nhóm `active` (SPEC 19.10
 *     gắn "Tôi làm" với Đang làm).
 */
function cotPhuThuocTrangThai(
  cu: DongTicketGhi,
  moi: TrangThaiTicket,
  kq: KetQuaLuat,
  trung_voi: string | null,
  bay_gio: number,
): ThayDoiCot[] {
  const dat: ThayDoiCot[] = [{ cot: 'trang_thai', gia_tri: moi }];

  if (nhomTrangThai(moi) === 'active' && cu.bat_dau_luc === null) {
    dat.push({ cot: 'bat_dau_luc', gia_tri: bay_gio });
  }
  if (moi === 'done') dat.push({ cot: 'xong_luc', gia_tri: bay_gio });
  else if (cu.xong_luc !== null) dat.push({ cot: 'xong_luc', gia_tri: null });

  dat.push({ cot: 'ly_do_huy', gia_tri: moi === 'canceled' ? (kq.ly_do_huy ?? cu.ly_do_huy) : null });
  dat.push({ cot: 'trung_voi_ticket_id', gia_tri: moi === 'duplicate' ? trung_voi : null });

  // Nhãn hệ thống "xong không bằng chứng" — SPEC mục 7 (chủ ép Xong).
  dat.push({
    cot: 'co_xong_khong_bang_chung',
    gia_tri: moi === 'done' && kq.xong_khong_bang_chung === true ? 1 : 0,
  });

  if (nhomTrangThai(moi) !== 'active' && cu.chu_tu_lam === 1) {
    dat.push({ cot: 'chu_tu_lam', gia_tri: 0 });
  }

  return dat;
}

/**
 * Áp một `KetQuaLuat` lên một ticket: câu lệnh `UPDATE` + **một dòng lịch sử cho
 * mỗi trường đổi** (SPEC mục 4), cộng việc tính lại mốc "không ai cầm" (19.1).
 *
 * `cap_nhat_luc` và `trong_tay_tu_luc` **không** ghi lịch sử: cái đầu là mốc "cập
 * nhật cuối" chứ không phải một trường của ticket, cái sau là mốc nội bộ để tính
 * cờ của 19.1. Ghi chúng vào lịch sử chỉ làm dòng thời gian của chủ nhiễu.
 */
function apDungLenTicket(
  db: D1Database,
  cu: DongTicketGhi,
  kq: KetQuaLuat,
  bay_gio: number,
  trung_voi: string | null = null,
  /**
   * Dữ liệu lượt giao của ticket (SPEC 19.1 bậc 1–3). Phải truyền vào: thiếu nó
   * thì một ticket đang có lượt giao mở bị tính là "không ai cầm", và cờ 24 giờ
   * của 19.1 bật sai.
   */
  boi_canh_cam: BoiCanhNguoiCam = {},
): { cau_lenh: D1PreparedStatement[]; lich_su: YeuCauGhiLichSu[] } {
  const moi = kq.trang_thai;
  const nguyen = cu as unknown as Record<string, string | number | null>;

  const thay_doi = cotPhuThuocTrangThai(cu, moi, kq, trung_voi, bay_gio).filter(
    (d) => nguyen[d.cot] !== d.gia_tri,
  );

  /*
   * Mốc "không ai cầm" (19.1) tính **độc lập** với việc có cột trạng thái nào
   * đổi hay không: chủ bấm "Tôi làm" trên một ticket **đang** ở Đang làm thì
   * không cột nào đổi, nhưng người đang cầm vừa từ "trống" thành "chủ", nên mốc
   * phải được xoá. Để câu lệnh này sau một `return` sớm là bỏ đúng ca đó — và
   * hệ quả chỉ lộ ra sau khi chủ thôi cầm: đồng hồ 24 giờ không chạy lại từ lúc
   * thả mà vẫn đếm từ mốc cũ, nên cờ bật ngay.
   */
  const cau_lenh_nguoi_cam = cauLenhNguoiCam(db, cu, moi, bay_gio, boi_canh_cam);

  if (thay_doi.length === 0) return { cau_lenh: cau_lenh_nguoi_cam, lich_su: [] };

  const gan = thay_doi.map((d) => `${d.cot} = ?`).join(', ');
  const cau_lenh = [
    db
      .prepare(`UPDATE ticket SET ${gan}, cap_nhat_luc = ? WHERE id = ?`)
      .bind(...thay_doi.map((d) => d.gia_tri), bay_gio, cu.id),
    ...cau_lenh_nguoi_cam,
  ];

  const lich_su: YeuCauGhiLichSu[] = thay_doi.map((d) => ({
    ticket_id: cu.id,
    truong: d.cot,
    gia_tri_cu: nguyen[d.cot] === null || nguyen[d.cot] === undefined ? null : String(nguyen[d.cot]),
    gia_tri_moi: d.gia_tri === null ? null : String(d.gia_tri),
    ...(kq.he_thong === true ? { tac_gia: HE_THONG } : {}),
  }));

  return { cau_lenh, lich_su };
}

/* ------------------------------------------------------------------ *
 * Bối cảnh luật: tra đúng những gì luật cần
 * ------------------------------------------------------------------ */

async function boiCanhLuatCua(
  db: D1Database,
  ticket: DongTicketGhi,
  la_chu: boolean,
  cong: CongBangChung,
): Promise<BoiCanhLuat> {
  const la_dieu_phoi = await laTicketDieuPhoi(db, ticket.id);
  return {
    trang_thai: ticket.trang_thai,
    la_chu,
    la_dieu_phoi,
    con_chua_ket: await soConChuaKet(db, ticket.id),
    // Ticket điều phối **không qua cổng bằng chứng** (SPEC 19.4), nên không gọi
    // cổng cho nó: gọi rồi bỏ qua kết quả là mời người sau hiểu sai.
    cong: la_dieu_phoi ? { du: false, ly_do: '' } : await cong(ticket.id),
  };
}

/* ------------------------------------------------------------------ *
 * Lan toả: ticket điều phối tự theo ticket dự án — SPEC 19.4, 19.11
 * ------------------------------------------------------------------ */

/**
 * Sau khi một **ticket dự án** đổi trạng thái, các **ticket điều phối** nối với
 * nó bằng liên kết `dieu_phoi` tự theo (SPEC 19.4).
 *
 * Chỉ lan **một chiều**, từ ticket dự án lên ticket điều phối. "Chủ ép trạng thái
 * ticket điều phối thì **chỉ ticket đó đổi, không lan** sang ticket dự án" (19.4)
 * — nên không có đường ngược, và đó là lý do không có đường ngược ở đây.
 *
 * Trạng thái mới của ticket vừa đổi **chưa có trong DB** (batch chạy sau), nên
 * phải thay thế bằng tay khi tính — đó là việc của `dieu_chinh`.
 */

/**
 * Thay đổi mà lệnh đang chạy **sắp** làm với tập ticket dự án của một ticket điều
 * phối. Câu lệnh ghi của lệnh đó còn nằm trong batch chưa chạy, nên truy vấn
 * dưới đây đọc ra **tập cũ**; `dieu_chinh` sửa tập cũ thành tập sau lệnh.
 *
 * Ba hình huống, đúng ba đường ghi có thật:
 *   * `doi_trang_thai` — ticket vẫn trong tập, chỉ đổi trạng thái.
 *   * `xoa` — ticket **rời** tập: ticket xoá mềm **không tính** (SPEC 19.12 câu
 *     17). DB còn `xoa_luc IS NULL` lúc này nên phải lọc bằng tay.
 *   * `khoi_phuc` — ticket **vào lại** tập. DB còn `xoa_luc` khác NULL nên truy
 *     vấn bỏ nó ra; phải thêm bằng tay.
 */
export type DieuChinhTapDieuPhoi =
  | { loai: 'doi_trang_thai'; ticket_id: string; trang_thai: TrangThaiTicket }
  | { loai: 'xoa'; ticket_id: string }
  | { loai: 'khoi_phuc'; ticket_id: string; trang_thai: TrangThaiTicket };

/**
 * `cong` chỉ để **truyền tiếp** cho `apCoReviewLai` (19.3) — lan toả không kiểm cổng
 * lần nào: ticket điều phối **không qua cổng bằng chứng** (19.4), và trạng thái mới
 * của nó do `trangThaiDieuPhoiTheo` quyết. Xem ghi chú ở chỗ gọi.
 */
export async function lanToiTicketDieuPhoi(
  db: D1Database,
  workspace_id: string,
  dieu_chinh: DieuChinhTapDieuPhoi,
  bay_gio: number,
  cong: CongBangChung,
): Promise<{ cau_lenh: D1PreparedStatement[]; lich_su: YeuCauGhiLichSu[]; danh_thuc: string[] }> {
  const ticket_du_an_id = dieu_chinh.ticket_id;

  /*
   * Không lọc `xoa_luc` của đầu **con** (`den_ticket_id`): ticket đang được
   * **khôi phục** vẫn còn `xoa_luc` khác NULL, mà liên kết của nó thì không bị
   * xoá theo. Lọc ở đó là bỏ hẳn đường `khoi_phuc`.
   *
   * **Nhưng lọc `xoa_luc` của đầu `cha`** (ticket điều phối) — `spec-questions.md`
   * #54, cài theo đề xuất tạm (chủ **chưa** chốt):
   *
   *   Ticket điều phối **đã xoá mềm thì BỎ QUA**: không tính trạng thái mới cho
   *   nó, không ném lỗi, không ghi dòng lịch sử nào.
   *
   * Vì sao: trước đây tập cha không lọc gì, nên một ticket điều phối đã xoá vẫn
   * đi tới `ticketBatBuoc(db, workspace_id, dp.id)` — hàm đó lọc
   * `xoa_luc IS NULL` nên ném `NOT_FOUND`/404 và **làm đổ cả lệnh**. Hệ quả:
   * một ticket dự án **còn sống** không đổi trạng thái / không xoá / không khôi
   * phục được, chỉ vì một ticket điều phối đã bỏ còn trỏ tới nó — lấy cái đã bỏ
   * chặn cái đang dùng. Lọc ở đây (chứ không bắt lỗi ở dưới) cũng rẻ hơn: khỏi
   * chạy luôn truy vấn tập con cho một ticket điều phối không ai đọc nữa.
   *
   * Cùng tinh thần SPEC 19.12 câu 17 ("ticket xoá mềm **không tính** vào tập
   * điều phối"), chỉ là áp luật đó cho đầu **cha** thay vì đầu con.
   *
   * `workspace_id` trong điều kiện là **phòng thủ theo SPEC mục 1** (dữ liệu tách
   * theo workspace), không phải sửa lỗi: đường ghi liên kết đã bắt hai đầu cùng
   * workspace (trigger `tg_ticket_link_ws_*`, migration 0002).
   */
  const { results: cha } = await db
    .prepare(
      `SELECT l.tu_ticket_id AS id
         FROM ticket_link l JOIN ticket dp ON dp.id = l.tu_ticket_id
        WHERE l.den_ticket_id = ? AND l.loai = 'dieu_phoi' AND l.workspace_id = ?
          AND dp.xoa_luc IS NULL`,
    )
    .bind(ticket_du_an_id, workspace_id)
    .all<{ id: string }>();

  const cau_lenh: D1PreparedStatement[] = [];
  const lich_su: YeuCauGhiLichSu[] = [];
  const danh_thuc: string[] = [];

  for (const dp of cha) {
    const { results: con } = await db
      .prepare(
        `SELECT t.id AS id, t.trang_thai AS trang_thai
           FROM ticket_link l JOIN ticket t ON t.id = l.den_ticket_id
          WHERE l.tu_ticket_id = ? AND l.loai = 'dieu_phoi' AND t.xoa_luc IS NULL`,
      )
      .bind(dp.id)
      .all<{ id: string; trang_thai: TrangThaiTicket }>();

    const khac = con.filter((c) => c.id !== ticket_du_an_id).map((c) => c.trang_thai);
    const ds: TrangThaiTicket[] =
      dieu_chinh.loai === 'xoa' ? khac : [...khac, dieu_chinh.trang_thai];

    /*
     * `trangThaiDieuPhoiTheo([])` trả `{ doi: false }` — đó chính là luật "xoá
     * ticket dự án **cuối cùng** thì ticket điều phối **giữ nguyên**" của SPEC
     * 19.12 câu 17, cùng tinh thần 19.11. Không có nhánh riêng cho ca đó ở đây:
     * một nhánh riêng sẽ là bản thứ hai của cùng một luật.
     */
    const theo = trangThaiDieuPhoiTheo(ds);
    if (!theo.doi) continue;

    const ticket_dp = await ticketBatBuoc(db, workspace_id, dp.id);
    if (ticket_dp.trang_thai === theo.trang_thai) continue;

    const boi_canh_cam = await boiCanhNguoiCamCua(db, workspace_id, ticket_dp.id);
    const ap = apDungLenTicket(
      db,
      ticket_dp,
      {
        trang_thai: theo.trang_thai,
        he_thong: true,
        ...(theo.ly_do_huy === undefined ? {} : { ly_do_huy: theo.ly_do_huy }),
      },
      bay_gio,
      null,
      boi_canh_cam,
    );
    cau_lenh.push(...ap.cau_lenh);
    lich_su.push(...ap.lich_su);
    danh_thuc.push(`ticket:${ticket_dp.id}`);

    /*
     * **Cờ "cần review lại" của chính ticket điều phối** — 19.3 d.495.
     *
     * Đường này đưa một ticket **khác** (ticket điều phối) vào hoặc rời nhóm
     * `closed`, nên nó phải tính lại cờ cho ticket đó — xem bất biến ở
     * `apCoReviewLai`. Không có lời gọi này thì một ticket điều phối từng mang cờ và
     * vừa tự sang Xong / Huỷ sẽ **giữ cờ vĩnh viễn**: `doc-du-an.ts` lọc "có cờ"
     * trong SQL, nên không đường nào tính lại cho nó, và sau 24 giờ nó ghim dự án ở
     * 🟡 (19.6 d.522) mà không ai sửa được bằng một lệnh nào.
     *
     * Gọi **ở đây**, bên trong lan toả, chứ không ở sáu chỗ gọi lan toả: `baton
     * status`, nộp, nghiệm thu, huỷ lượt, xoá mềm và khôi phục đều đi qua đây, và
     * một danh sách sáu chỗ là đúng cái đã sót lượt này.
     *
     * **Không `dieu_chinh`** (lan toả không chạm bảng `evidence`), nên đây là lượt
     * **chỉ bật/tắt cờ** và nó không gọi lại `lanToiTicketDieuPhoi` — xem ghi chú
     * đệ quy ở `apCoReviewLai`.
     */
    const co = await apCoReviewLai(db, workspace_id, ticket_dp, theo.trang_thai, {
      bay_gio,
      cong,
      boi_canh_cam,
    });
    cau_lenh.push(...co.cau_lenh);
    lich_su.push(...co.lich_su);
  }

  return { cau_lenh, lich_su, danh_thuc };
}

/**
 * **Con cuối cùng kết thì cha tự kiểm cổng lại** — SPEC 19.11.
 *
 * Chỉ chạy khi ticket vừa vào nhóm `closed`, và chỉ với ticket cha đang ở Chờ
 * kiểm chứng (luật `kiem_cong_lai` của module luật cũng tự chặn ca khác, nhưng
 * tra ít hơn thì rẻ hơn).
 */
async function kiemLaiCongCuaCha(
  db: D1Database,
  workspace_id: string,
  ticket_con_id: string,
  trang_thai_con_moi: TrangThaiTicket,
  cong: CongBangChung,
  bay_gio: number,
): Promise<{ cau_lenh: D1PreparedStatement[]; lich_su: YeuCauGhiLichSu[]; danh_thuc: string[] }> {
  const rong = { cau_lenh: [], lich_su: [], danh_thuc: [] };
  if (nhomTrangThai(trang_thai_con_moi) !== 'closed') return rong;

  const { results: cha } = await db
    .prepare("SELECT tu_ticket_id AS id FROM ticket_link WHERE den_ticket_id = ? AND loai = 'parent'")
    .bind(ticket_con_id)
    .all<{ id: string }>();

  const cau_lenh: D1PreparedStatement[] = [];
  const lich_su: YeuCauGhiLichSu[] = [];
  const danh_thuc: string[] = [];

  for (const c of cha) {
    const ticket_cha = await ticketBatBuoc(db, workspace_id, c.id);
    if (ticket_cha.trang_thai !== 'verifying') continue;

    // Trạng thái mới của con chưa vào DB, nên trừ nó ra khi đếm con chưa kết.
    const con_chua_ket = Math.max(0, (await soConChuaKet(db, c.id)) - 1);
    const la_dieu_phoi = await laTicketDieuPhoi(db, c.id);

    const kq = apDungLuat(
      { loai: 'kiem_cong_lai' },
      {
        trang_thai: ticket_cha.trang_thai,
        la_chu: false,
        la_dieu_phoi,
        con_chua_ket,
        cong: la_dieu_phoi ? { du: false, ly_do: '' } : await cong(c.id),
      },
    );
    if (kq.trang_thai === ticket_cha.trang_thai) continue;

    const boi_canh_cam = await boiCanhNguoiCamCua(db, workspace_id, ticket_cha.id);
    const ap = apDungLenTicket(db, ticket_cha, kq, bay_gio, null, boi_canh_cam);
    cau_lenh.push(...ap.cau_lenh);
    lich_su.push(...ap.lich_su);
    danh_thuc.push(`ticket:${ticket_cha.id}`);

    /*
     * **Cờ "cần review lại" của ticket CHA** — 19.3 d.495.
     *
     * Đường này đưa ticket cha từ Chờ kiểm chứng sang **Xong**, tức vào nhóm
     * `closed`, nên cờ phải tắt và mốc phải về NULL (xem bất biến ở `apCoReviewLai`).
     * Ca thật, reviewer dựng: dự án `bat_buoc_review = 0`, cha có `commit merged` gửi
     * **sau** một `review pass` ⇒ cổng **đủ** nhưng luật cờ nói **bật**; con cuối
     * cùng kết ⇒ cha sang Xong mà cờ vẫn `1`. Trigger 0011 không bắt (cờ và mốc vẫn
     * khớp nhau), nên nó hỏng **im lặng**: ticket đã Xong hiện mãi ở "Cần chú ý" và
     * sau 24 giờ ghim dự án ở 🟡 vĩnh viễn (19.6 d.522).
     *
     * Không `dieu_chinh`: đường này không chạm bảng `evidence`.
     */
    const co = await apCoReviewLai(db, workspace_id, ticket_cha, kq.trang_thai, {
      bay_gio,
      cong,
      boi_canh_cam,
    });
    cau_lenh.push(...co.cau_lenh);
    lich_su.push(...co.lich_su);
  }

  return { cau_lenh, lich_su, danh_thuc };
}

/* ------------------------------------------------------------------ *
 * Cờ "cần review lại" — SPEC 19.3 d.494–495, 19.6 d.522, 19.11 d.555
 * ------------------------------------------------------------------ */

export interface KetQuaApCoReviewLai {
  quyet_dinh: QuyetDinhCanReviewLai;
  cau_lenh: D1PreparedStatement[];
  lich_su: YeuCauGhiLichSu[];
  danh_thuc: string[];
  /**
   * Trạng thái ticket **sau cả** lệnh gốc và nhánh này. Khác `trang_thai_sau` truyền
   * vào đúng khi d.494 kéo ticket **về** Chờ kiểm chứng.
   */
  trang_thai: TrangThaiTicket;
}

/**
 * Tính lại cờ "cần review lại" sau một lượt ghi, và — **chỉ trên đường bằng chứng** —
 * áp nửa thứ hai của 19.3 d.494: "ticket ở hoặc **về** Chờ kiểm chứng".
 *
 * ## KHI NÀO PHẢI GỌI HÀM NÀY (bất biến, không phải một danh sách)
 *
 * Cờ chỉ phụ thuộc **hai** thứ: (1) trạng thái sau lệnh có thuộc nhóm `closed` hay
 * không (d.495), (2) tập bằng chứng của ticket. Nên luật gọi là:
 *
 *   > Gọi `apCoReviewLai` ở **mọi** chỗ mà trạng thái **sau** có thể **vào hoặc rời
 *   > nhóm `closed`**, hoặc bảng `evidence` đổi.
 *
 * Một **danh sách** người gọi thay cho bất biến trên là đúng cái đã làm lượt này sót
 * `kiemLaiCongCuaCha` (19.11) và `lanToiTicketDieuPhoi` (19.4) — hai đường đưa một
 * ticket **khác** vào nhóm `closed`, mà không đường nào nằm trong danh sách lệnh.
 * Nên hai đường đó gọi hàm này **bên trong chính chúng**: mọi người gọi của chúng
 * (`baton status`, nộp, nghiệm thu, huỷ lượt, Cron, xoá mềm, khôi phục) được phủ mà
 * không phải biết gì về 19.3.
 *
 * ## RANH GIỚI của nửa "về Chờ kiểm chứng" — `dieu_chinh` có hay không
 *
 * d.494 gắn "ở hoặc **về** Chờ kiểm chứng" vào **sự kiện** "có commit hoặc deploy
 * mới sau review", **không** vào mọi lượt ghi trên một ticket đang mang cờ. Nên
 * nhánh kéo trạng thái chỉ chạy khi lượt ghi **thật sự thêm hoặc đổi bằng chứng** —
 * tức khi có `dieu_chinh`. Các đường khác chỉ **bật/tắt cờ**.
 *
 * Vì sao ranh giới phải vậy (đây là một lỗi reviewer đã bắt): không có nó thì chủ
 * **không bao giờ** đưa được một ticket mang cờ về Đang làm để đi sửa mã — mỗi lần
 * `baton status in_progress` lại bị kéo thẳng về Chờ kiểm chứng, đúng việc mà d.555
 * giả định người giao phải làm. Và nó làm `baton status` cư xử **ngược** với
 * `handlerChuTuLam` trên **cùng một** chuyển trạng thái `planned → Đang làm`, nơi đã
 * chốt rằng kéo sang Chờ kiểm chứng là "nói rằng việc đã xong — trái hẳn ý chủ".
 * Hai đường không được khác nhau. SPEC không nói thẳng ranh giới này:
 * `spec-questions.md` **#66**.
 *
 * **Không viết tay một `UPDATE ticket SET trang_thai` nào ở đây**: nửa "về Chờ kiểm
 * chứng" đi qua đúng `apDungLuat` với sự kiện `can_review_lai`, rồi `apDungLenTicket`
 * — cùng đường mà `baton status` và nộp báo cáo đã đi. Nên luật "ticket đã kết không
 * bị hạ" (d.495), mốc `bat_dau_luc`, mốc "không ai cầm" (19.1), dòng lịch sử cho
 * từng trường đổi (mục 4) và lan toả lên ticket điều phối (19.4) đều là **một bản**.
 *
 * `{ ...ticket, trang_thai: trang_thai_sau }`: lệnh gốc đã quyết trạng thái mới
 * nhưng câu lệnh của nó còn trong batch, nên DB và `ticket` còn giá trị cũ. Không
 * thay bằng tay thì `apDungLenTicket` so với trạng thái cũ và ghi **hai** dòng lịch
 * sử cho cùng một lần đổi, và `lanToiTicketDieuPhoi` tính tập con theo trạng thái cũ.
 *
 * **Đệ quy lẫn nhau với `lanToiTicketDieuPhoi` — có hạn, chứng minh được:** hàm này
 * gọi `lanToiTicketDieuPhoi` **chỉ** trong nhánh kéo trạng thái, còn
 * `lanToiTicketDieuPhoi` gọi lại hàm này **không có `dieu_chinh`**, nên lượt trong
 * không bao giờ vào nhánh kéo. Độ sâu tối đa là 2.
 */
export async function apCoReviewLai(
  db: D1Database,
  workspace_id: string,
  ticket: DongTicketGhi,
  trang_thai_sau: TrangThaiTicket,
  tuy_chon: {
    bay_gio: number;
    cong: CongBangChung;
    /**
     * Thay đổi bảng `evidence` mà lệnh đang chạy **sắp** làm. **Có mặt hay không
     * chính là ranh giới của nửa "về Chờ kiểm chứng"** — xem ghi chú trên.
     */
    dieu_chinh?: DieuChinhBangChung | null;
    /** Bối cảnh người đang cầm **sau** lệnh (19.1) — xem `apSuKienLenTicket`. */
    boi_canh_cam?: BoiCanhNguoiCam;
  },
): Promise<KetQuaApCoReviewLai> {
  const { bay_gio, cong } = tuy_chon;
  const dieu_chinh = tuy_chon.dieu_chinh ?? null;

  const co = await coReviewLaiCua(
    db,
    workspace_id,
    ticket.id,
    trang_thai_sau,
    bay_gio,
    dieu_chinh,
  );

  const cau_lenh = [...co.cau_lenh];
  const lich_su = [...co.lich_su];
  const danh_thuc: string[] = [];

  // Ranh giới của d.494: chỉ lượt ghi **đổi bằng chứng** mới kéo trạng thái.
  if (!co.quyet_dinh.ve_cho_kiem_chung || dieu_chinh === null) {
    return { ...co, cau_lenh, lich_su, danh_thuc, trang_thai: trang_thai_sau };
  }

  const cu: DongTicketGhi = { ...ticket, trang_thai: trang_thai_sau };
  const kq = apDungLuat(
    { loai: 'can_review_lai', ve_cho_kiem_chung: true },
    await boiCanhLuatCua(db, cu, false, cong),
  );

  const ap = apDungLenTicket(
    db,
    cu,
    kq,
    bay_gio,
    null,
    tuy_chon.boi_canh_cam ?? (await boiCanhNguoiCamCua(db, workspace_id, ticket.id)),
  );
  cau_lenh.push(...ap.cau_lenh);
  lich_su.push(...ap.lich_su);

  if (kq.trang_thai !== trang_thai_sau) {
    // 19.4: ticket điều phối tự theo. Không có lời gọi `kiemLaiCongCuaCha` ở đây:
    // nhánh này chỉ đưa ticket **vào** nhóm `active`, mà `kiemLaiCongCuaCha` chỉ
    // chạy khi một ticket con vừa vào nhóm `closed`.
    const dp = await lanToiTicketDieuPhoi(
      db,
      workspace_id,
      { loai: 'doi_trang_thai', ticket_id: ticket.id, trang_thai: kq.trang_thai },
      bay_gio,
      cong,
    );
    cau_lenh.push(...dp.cau_lenh);
    lich_su.push(...dp.lich_su);
    danh_thuc.push(...dp.danh_thuc);
  }

  return { ...co, cau_lenh, lich_su, danh_thuc, trang_thai: kq.trang_thai };
}

/* ------------------------------------------------------------------ *
 * Một sự kiện → ticket: dùng chung cho mọi lệnh của phần 2
 * ------------------------------------------------------------------ */

export interface KetQuaApSuKien {
  /** Kết luận của module luật thuần cho **sự kiện gốc** (gồm cả `loi` nếu có). */
  kq: KetQuaLuat;
  cau_lenh: D1PreparedStatement[];
  lich_su: YeuCauGhiLichSu[];
  danh_thuc: string[];
  /** Cờ "cần review lại" sau lượt ghi này — 19.3 d.494, 19.11 d.555. */
  co_review_lai: KetQuaApCoReviewLai;
  /**
   * Trạng thái ticket **sau cả** sự kiện gốc **và** nhánh cờ "cần review lại". Khác
   * `kq.trang_thai` đúng khi d.494 kéo ticket **về** Chờ kiểm chứng — người gọi phải
   * báo ra con số này, không `kq.trang_thai`, nếu không API nói một trạng thái mà DB
   * không có.
   */
  trang_thai: TrangThaiTicket;
}

/**
 * Áp **một sự kiện** của SPEC 19.2 (`nop`, `nghiem_thu`, `luot_huy`,
 * `kiem_cong_lai`) lên một ticket, trọn gói: tra bối cảnh luật → gọi
 * `apDungLuat` → dựng câu lệnh + lịch sử → **lan sang ticket điều phối** (19.4)
 * → **kiểm lại cổng của ticket cha** (19.11).
 *
 * Tồn tại để các lệnh của lượt giao (nộp báo cáo, nghiệm thu, huỷ lượt) đi đúng
 * con đường mà `baton status` đã đi, thay vì mỗi lệnh tự ghép lại bốn bước trên
 * và quên mất một bước. **Không có luật trạng thái nào ở đây**: luật nằm trọn
 * trong `apDungLuat` của `@baton/shared`.
 */
export async function apSuKienLenTicket(
  db: D1Database,
  workspace_id: string,
  ticket: DongTicketGhi,
  su_kien: SuKienTrangThai,
  tuy_chon: {
    bay_gio: number;
    cong: CongBangChung;
    la_chu: boolean;
    /**
     * Bối cảnh người đang cầm **sau** lệnh (SPEC 19.1). Người gọi phải tự sửa
     * theo thay đổi lượt giao của chính lệnh mình: dòng `luot_giao` mới chưa có
     * trong DB lúc này (batch chạy sau), nên đọc thẳng DB sẽ ra bối cảnh cũ.
     */
    boi_canh_cam: BoiCanhNguoiCam;
  },
): Promise<KetQuaApSuKien> {
  const { bay_gio, cong, la_chu, boi_canh_cam } = tuy_chon;

  const kq = apDungLuat(su_kien, await boiCanhLuatCua(db, ticket, la_chu, cong));

  const ap = apDungLenTicket(db, ticket, kq, bay_gio, null, boi_canh_cam);
  const cau_lenh = [...ap.cau_lenh];
  const lich_su = [...ap.lich_su];
  const danh_thuc = [`ticket:${ticket.id}`, `ticket:${ticket.project_id}`];

  if (kq.trang_thai !== ticket.trang_thai) {
    const dp = await lanToiTicketDieuPhoi(
      db,
      workspace_id,
      { loai: 'doi_trang_thai', ticket_id: ticket.id, trang_thai: kq.trang_thai },
      bay_gio,
      cong,
    );
    cau_lenh.push(...dp.cau_lenh);
    lich_su.push(...dp.lich_su);
    danh_thuc.push(...dp.danh_thuc);

    const cha = await kiemLaiCongCuaCha(db, workspace_id, ticket.id, kq.trang_thai, cong, bay_gio);
    cau_lenh.push(...cha.cau_lenh);
    lich_su.push(...cha.lich_su);
    danh_thuc.push(...cha.danh_thuc);
  }

  /*
   * **Cờ "cần review lại"** — 19.3 d.494–495, 19.11 d.555. Đứng **cuối**, sau khi
   * trạng thái mới đã được quyết: cờ được tính theo trạng thái **sau** lệnh (một
   * ticket vừa lên Xong thì cờ phải **tắt** — d.495), và nửa "về Chờ kiểm chứng" của
   * d.494 chỉ có nghĩa sau khi biết lệnh gốc đã đưa ticket đi đâu.
   */
  const co = await apCoReviewLai(db, workspace_id, ticket, kq.trang_thai, {
    bay_gio,
    cong,
    boi_canh_cam,
  });
  cau_lenh.push(...co.cau_lenh);
  lich_su.push(...co.lich_su);
  danh_thuc.push(...co.danh_thuc);

  // d.181 — xem `cauLenhDongPhienNeuViecXong`.
  cau_lenh.push(
    ...cauLenhDongPhienNeuViecXong(
      db,
      workspace_id,
      ticket.id,
      ticket.trang_thai,
      co.trang_thai,
      bay_gio,
    ),
  );

  return { kq, cau_lenh, lich_su, danh_thuc, co_review_lai: co, trang_thai: co.trang_thai };
}

/* ------------------------------------------------------------------ *
 * Ticket gốc để đánh Trùng — SPEC mục 4 (`INVALID_DUPLICATE_TARGET`)
 * ------------------------------------------------------------------ */

/**
 * Tra ticket gốc và kiểm "hợp lệ" theo định nghĩa trong
 * `ticketGocHopLe` (tồn tại, cùng workspace, không phải chính nó, không tạo chuỗi
 * trùng vòng). SPEC nêu mã lỗi nhưng không định nghĩa hợp lệ —
 * `spec-questions.md` #19.
 */
async function tiketGocHopLeTrongDb(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  ticket_goc_id: string | null | undefined,
  /**
   * Người gọi — ticket gốc phải là ticket **họ thấy được** (`locPhamViTicket`,
   * BAT-58, 19.12 câu 15). Gốc thật ngoài phạm vi ⇒ coi như không có ⇒ cùng
   * `INVALID_DUPLICATE_TARGET` với id bịa. Trước BAT-58 câu tra cả workspace, nên
   * gốc thật ở dự án khác ra **thành công** (và ghi id đó lên ticket) còn id bịa
   * ra lỗi — một máy dò sự tồn tại ticket ngoài phạm vi. `spec-questions.md` #176.
   */
  ai: AiGoi,
): Promise<{ hop_le: boolean; id: string | null }> {
  if (ticket_goc_id === null || ticket_goc_id === undefined) return { hop_le: false, id: null };

  const loc = locPhamViTicket(ai, 'project_id');
  const goc = await db
    .prepare(
      `SELECT id, trung_voi_ticket_id FROM ticket
        WHERE id = ? AND workspace_id = ? AND xoa_luc IS NULL${loc.sql}`,
    )
    .bind(ticket_goc_id, workspace_id, ...loc.bind)
    .first<{ id: string; trung_voi_ticket_id: string | null }>();

  // Chuỗi `trung_voi` của cả workspace: ở mốc 200.000 ticket thì số ticket mang
  // `trung_voi_ticket_id` khác NULL rất nhỏ (chỉ ticket đã đánh Trùng), và index
  // riêng phần không có nên quét đúng cột đó là rẻ nhất; đổi được về sau nếu cần.
  const { results } = await db
    .prepare(
      `SELECT id, trung_voi_ticket_id FROM ticket
        WHERE workspace_id = ? AND trung_voi_ticket_id IS NOT NULL`,
    )
    .bind(workspace_id)
    .all<{ id: string; trung_voi_ticket_id: string | null }>();

  const chuoi = new Map(results.map((r) => [r.id, r.trung_voi_ticket_id]));
  const hop_le = ticketGocHopLe(ticket_id, goc, chuoi);
  return { hop_le, id: hop_le && goc !== null ? goc.id : null };
}

/* ------------------------------------------------------------------ *
 * Lệnh: đổi trạng thái tay (`baton status`) — SPEC mục 4, 13
 * ------------------------------------------------------------------ */

export interface LenhDoiTrangThai extends LenhChung {
  loai: 'doi_trang_thai';
  ticket_id: string;
  trang_thai: string;
  /** Bắt buộc khi vào Huỷ (SPEC mục 4) và khi chủ ép Xong (mục 7). */
  ly_do?: string | null;
  /** Bắt buộc khi vào Trùng (SPEC mục 4). */
  ticket_goc_id?: string | null;
  /** Chủ ép Xong không cần bằng chứng — SPEC mục 7. */
  ep?: boolean;
}

export interface KetQuaDoiTrangThai {
  id: string;
  trang_thai: TrangThaiTicket;
  /** Trạng thái trước lệnh, để client biết có đổi hay không. */
  trang_thai_cu: TrangThaiTicket;
}

export async function handlerDoiTrangThai(
  lenh: LenhDoiTrangThai,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaDoiTrangThai>> {
  // Kiểm nhập trước: trạng thái lạ phải ra `INVALID_INPUT` dù ticket có hay không.
  const dich = kiemTrangThaiTicket(lenh.trang_thai);
  const ly_do = kiemChuTuyChon(lenh.ly_do, 'Lý do', 2000);
  const ep = lenh.ep === undefined ? false : kiemCo(lenh.ep, 'ep');

  // Ticket người gọi không thấy ⇒ `NOT_FOUND` giống hệt id bịa (BAT-58, 19.12 câu
  // 15) — **trước** quyền và trước mọi luật trạng thái (`CHILDREN_OPEN`,
  // `EVIDENCE_REQUIRED`, `INVALID_INPUT` vì đã kết…), vì thông điệp của các luật
  // đó cũng kể trạng thái của ticket.
  const cu = await ticketBatBuoc(db, lenh.workspace_id, lenh.ticket_id, false, lenh.ai);

  batBuocQuyen(lenh.ai, 'change_status', {
    project_id: cu.project_id,
    ticket_id: cu.id,
    ticket_cua_luot_minh: (
      await phamViLuotGiao(db, lenh.ai, lenh.workspace_id, [cu.id])
    ).ticketCuaLuotMinh(cu.id),
  });
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, cu.project_id));

  const goc =
    dich === 'duplicate'
      ? await tiketGocHopLeTrongDb(db, lenh.workspace_id, cu.id, lenh.ticket_goc_id, lenh.ai)
      : { hop_le: false, id: null };

  const bc = await boiCanhLuatCua(db, cu, lenh.ai.loai === 'chu', cong);

  const su_kien: SuKienTrangThai = {
    loai: 'doi_tay',
    dich,
    ly_do,
    ticket_goc_hop_le: goc.hop_le,
    ep_xong: ep,
  };
  const kq = apDungLuat(su_kien, bc);

  // Hoist: dùng cho **cả** `apDungLenTicket` và nhánh cờ ở dưới. Hai lần tra là hai
  // lần đọc D1 trong cửa ghi cho cùng một câu trả lời.
  const boi_canh_cam = await boiCanhNguoiCamCua(db, lenh.workspace_id, cu.id);

  const ap = apDungLenTicket(db, cu, kq, bay_gio, goc.id, boi_canh_cam);

  const cau_lenh = [...ap.cau_lenh];
  const lich_su = [...ap.lich_su];
  const danh_thuc = [`ticket:${cu.id}`, `ticket:${cu.project_id}`];

  // Lan toả chỉ khi trạng thái thật sự đổi.
  if (kq.trang_thai !== cu.trang_thai) {
    const dp = await lanToiTicketDieuPhoi(
      db,
      lenh.workspace_id,
      { loai: 'doi_trang_thai', ticket_id: cu.id, trang_thai: kq.trang_thai },
      bay_gio,
      cong,
    );
    cau_lenh.push(...dp.cau_lenh);
    lich_su.push(...dp.lich_su);
    danh_thuc.push(...dp.danh_thuc);

    const cha = await kiemLaiCongCuaCha(
      db,
      lenh.workspace_id,
      cu.id,
      kq.trang_thai,
      cong,
      bay_gio,
    );
    cau_lenh.push(...cha.cau_lenh);
    lich_su.push(...cha.lich_su);
    danh_thuc.push(...cha.danh_thuc);
  }

  /*
   * Cờ "cần review lại" — xem `apCoReviewLai`. `baton status` là đường đổi trạng thái
   * **tay**, nên nó cũng phải tính lại cờ: chủ mở lại một ticket Xong mà review đã hết
   * hiệu lực thì cờ phải bật (d.494), và chủ ép Xong thì cờ phải tắt (d.495).
   *
   * **Không truyền `dieu_chinh`**: lệnh này không chạm bảng `evidence`, nên nó **chỉ
   * bật/tắt cờ** và **không** kéo ticket về Chờ kiểm chứng. Đó là ranh giới của d.494
   * (`spec-questions.md` #66) — nếu không, chủ không bao giờ đưa được một ticket mang cờ
   * về Đang làm để đi sửa mã, và lệnh này sẽ cư xử **ngược** với `handlerChuTuLam` trên
   * cùng một chuyển trạng thái `planned → Đang làm`.
   *
   * `boi_canh_cam` truyền vào là **MÃ CHẾT hôm nay, KHÔNG có test** — nói đúng thế chứ
   * không gọi nó là một cái lợi: fallback `boi_canh_cam ?? boiCanhNguoiCamCua(...)` nằm
   * **bên trong** nhánh kéo trạng thái của `apCoReviewLai`, mà nhánh đó cần
   * `dieu_chinh`, nên với đường này nó **không bao giờ** được đọc — tiết kiệm **0** lần
   * đọc D1, không phải một lần. Giữ lại vì nó là thứ còn đúng nếu một lượt sau cho
   * đường này mang `dieu_chinh`. Đã thử bằng mutation: bỏ nó ra thì **không** test nào
   * đỏ. (Phần **hoist** biến `boi_canh_cam` thì có lợi thật, nhưng là cho
   * `apDungLenTicket` ở trên, không cho lời gọi này.)
   */
  const co = await apCoReviewLai(db, lenh.workspace_id, cu, kq.trang_thai, {
    bay_gio,
    cong,
    boi_canh_cam,
  });
  cau_lenh.push(...co.cau_lenh);
  lich_su.push(...co.lich_su);
  danh_thuc.push(...co.danh_thuc);

  // d.181 — xem `cauLenhDongPhienNeuViecXong`. Đây là đường **kéo thả** của d.404
  // và `baton status`: chủ đưa một việc sang Xong thì phiên của nó phải đóng, kể
  // cả khi phiên đang `stalled` hay `error`.
  cau_lenh.push(
    ...cauLenhDongPhienNeuViecXong(
      db,
      lenh.workspace_id,
      cu.id,
      cu.trang_thai,
      co.trang_thai,
      bay_gio,
    ),
  );

  return {
    cau_lenh,
    lich_su,
    danh_thuc,
    // **Vừa ghi vừa báo lỗi** (SPEC mục 4: `EVIDENCE_REQUIRED` + ticket sang Chờ
    // kiểm chứng). Xem `KetQuaHandler.loi_sau_ghi`.
    ...(kq.loi === undefined ? {} : { loi_sau_ghi: kq.loi }),
    ket_qua: { id: cu.id, trang_thai: co.trang_thai, trang_thai_cu: cu.trang_thai },
  };
}

/* ------------------------------------------------------------------ *
 * Lệnh: chủ bấm "Tôi làm" — SPEC 19.10, 19.1 bậc 4
 * ------------------------------------------------------------------ */

export interface LenhChuTuLam extends LenhChung {
  loai: 'chu_tu_lam';
  ticket_id: string;
  /** `true` = bấm "Tôi làm"; `false` = thôi cầm. */
  bat: boolean;
}

/**
 * "Nút **Tôi làm** chuyển ticket sang Đang làm, người đang cầm là chủ, không có
 * nhịp tim" — SPEC 19.10. Người đang cầm vẫn **tự tính** (SPEC mục 4): lệnh này
 * chỉ đặt cờ `chu_tu_lam`, còn `nguoiDangCam` đọc cờ đó ở bậc 4 của 19.1.
 *
 * "Vào Xong vẫn qua cổng; chủ ép được" (19.10) — nên lệnh này **không** chạm cổng.
 */
export async function handlerChuTuLam(
  lenh: LenhChuTuLam,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<{ id: string; trang_thai: TrangThaiTicket; chu_tu_lam: boolean }>> {
  batBuocLaChu(lenh.ai, 'bấm được "Tôi làm"');
  const bat = kiemCo(lenh.bat, 'bat');

  const cu = await ticketBatBuoc(db, lenh.workspace_id, lenh.ticket_id);
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, cu.project_id));

  if (nhomTrangThai(cu.trang_thai) === 'closed') {
    throw new BatonError('INVALID_INPUT', {
      message: 'Ticket đã kết; mở lại trước khi tự làm.',
    });
  }

  const cau_lenh: D1PreparedStatement[] = [];
  const lich_su: YeuCauGhiLichSu[] = [];
  const danh_thuc = [`ticket:${cu.id}`];

  if (cu.chu_tu_lam !== (bat ? 1 : 0)) {
    cau_lenh.push(
      db
        .prepare('UPDATE ticket SET chu_tu_lam = ?, cap_nhat_luc = ? WHERE id = ?')
        .bind(bat ? 1 : 0, bay_gio, cu.id),
    );
    lich_su.push({
      ticket_id: cu.id,
      truong: 'chu_tu_lam',
      gia_tri_cu: String(cu.chu_tu_lam),
      gia_tri_moi: bat ? '1' : '0',
    });
  }

  // "Tôi làm" kéo ticket nhóm `planned` sang Đang làm — cùng luật với mở một lượt
  // giao (SPEC mục 4 dòng 134), nên dùng đúng sự kiện đó của module luật.
  let trang_thai = cu.trang_thai;
  if (bat) {
    const kq = apDungLuat(
      { loai: 'mo_luot_giao' },
      await boiCanhLuatCua(db, cu, true, cong),
    );
    trang_thai = kq.trang_thai;
    const boi_canh_cam = await boiCanhNguoiCamCua(db, lenh.workspace_id, cu.id);
    const ap = apDungLenTicket(db, { ...cu, chu_tu_lam: 1 }, kq, bay_gio, null, boi_canh_cam);
    cau_lenh.push(...ap.cau_lenh);
    lich_su.push(...ap.lich_su);

    /*
     * **Cờ "cần review lại"** — 19.3. Lệnh này không chạm bảng `evidence`, nên nó
     * **chỉ bật/tắt cờ** và không kéo trạng thái: kéo một ticket sang Chờ kiểm chứng
     * ngay lúc chủ vừa bấm "Tôi làm" là nói rằng việc đã xong, trái hẳn ý chủ.
     *
     * **Hôm nay lời gọi này là một no-op chứng minh được**, và nói thẳng ra chứ không
     * để người sau tưởng nó đang canh gì: giá trị cờ chỉ phụ thuộc nhóm `closed` của
     * trạng thái và tập bằng chứng (xem bất biến ở `apCoReviewLai`), mà chuyển trạng
     * thái duy nhất của lệnh này là `planned → Đang làm` — hai bên **đều** ngoài nhóm
     * `closed`. Giữ lời gọi vì bất biến ấy phải đúng ở **mọi** đường đổi trạng thái:
     * một danh sách "đường nào cần, đường nào không" là đúng cái đã sót
     * `kiemLaiCongCuaCha` và `lanToiTicketDieuPhoi` ở lượt này. Và nó **rẻ**: đường
     * thoát sớm của `coReviewLaiCua` chặn nó lại ở 2 lần đọc `LIMIT 1` với một ticket
     * không có review nào.
     *
     * `boi_canh_cam` ở đây là **mã chết hôm nay**, cùng lý do đã ghi ở
     * `handlerDoiTrangThai`: nhánh dùng tới nó cần `dieu_chinh`.
     */
    const co = await apCoReviewLai(db, lenh.workspace_id, cu, kq.trang_thai, {
      bay_gio,
      cong,
      boi_canh_cam,
    });
    cau_lenh.push(...co.cau_lenh);
    lich_su.push(...co.lich_su);

    /*
     * **"Tôi làm" cũng phải lan lên ticket điều phối** — SPEC 19.4.
     *
     * Reviewer lượt 3 bắt đúng chỗ này: lệnh này kéo ticket dự án từ nhóm
     * `planned` sang Đang làm, nên nó là một lần "ticket dự án đổi trạng thái"
     * y như `baton status`. Thiếu lời gọi dưới đây thì ticket dự án là Đang làm
     * mà ticket điều phối vẫn Cần làm, trái 19.4 ("≥1 ticket dự án nhóm `active`
     * → ticket điều phối là Đang làm"), và sai lan tiếp vào chỉ báo sức sống của
     * dự án (19.6).
     */
    if (kq.trang_thai !== cu.trang_thai) {
      const dp = await lanToiTicketDieuPhoi(
        db,
        lenh.workspace_id,
        { loai: 'doi_trang_thai', ticket_id: cu.id, trang_thai: kq.trang_thai },
        bay_gio,
        cong,
      );
      cau_lenh.push(...dp.cau_lenh);
      lich_su.push(...dp.lich_su);
      danh_thuc.push(...dp.danh_thuc);
    }
  } else {
    // Thôi cầm: chỉ cập nhật mốc "không ai cầm" (19.1), trạng thái không đổi.
    cau_lenh.push(
      ...cauLenhNguoiCam(
        db,
        { ...cu, chu_tu_lam: 0 },
        cu.trang_thai,
        bay_gio,
        await boiCanhNguoiCamCua(db, lenh.workspace_id, cu.id),
      ),
    );
  }

  return {
    cau_lenh,
    lich_su,
    danh_thuc,
    ket_qua: { id: cu.id, trang_thai, chu_tu_lam: bat },
  };
}
