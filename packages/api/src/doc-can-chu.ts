/**
 * **Đường ĐỌC của mục Cần Chủ** — SPEC mục 8, mục 13 d.376, 19.9 d.543.
 *
 * Lượt 3a dùng file này cho hai việc:
 *
 *   1. `baton result T-<số>` — mục 13 d.376: in trạng thái và kết quả của một
 *      mục. `layMucCanChu` là phần đọc thuần của nó; phần `--wait` nằm trong
 *      `WorkspaceGate.choCanChu` (cửa ghi là chỗ duy nhất nhận khoá đánh thức).
 *   2. `resolved_asks` — mục 8 d.268: "Agent **không** đang chờ thì nhận kết quả
 *      ở lần gọi kế tiếp (`heartbeat`, `tasks` hay bất kỳ lệnh nào), trong trường
 *      `resolved_asks`." Xem `asksVuaXuLy` và `cau-hoi-spec.md` **#76**.
 *
 * Lượt 3b (màn hình 3 khối + bảng "Đã xử lý" của mục 8) dùng **cùng** `COT_MUC`,
 * `locPhamViCanChu` và `raMuc` của file này — một bản dịch dòng `can_chu` sang
 * JSON, không hai.
 *
 * ## Ba nếp đã thành luật của dự án, áp ở đây
 *
 *   * **Phạm vi nằm TRONG câu SQL**, không là một `if` sau khi đã đọc
 *     (`quyet-dinh.md`). Nhờ vậy "ngoài tầm nhìn" và "không có thật" là **cùng
 *     một** đường mã, tức cùng một phản hồi — 19.12 **câu 15** đòi đúng thế
 *     ("quyền phải kiểm trước khi tra đối tượng… cả hai ca phải ra phản hồi
 *     giống hệt nhau"). Không có chỗ nào trong file này đọc dòng rồi mới hỏi
 *     "người này được xem không", nên không có máy dò sự tồn tại nào.
 *   * **Lớp "Chung" gọi `pham-vi-chung.ts`**, không tự dựng điều kiện: 19.12
 *     **câu 61** nói luật đó phải nằm ở **một chỗ duy nhất**.
 *   * **Mọi câu SQL ràng cả `workspace_id`** (`quyet-dinh.md`).
 *
 * ## Dự án `archived` — 19.12 câu 25
 *
 * Câu 25 chỉ chặn lệnh **ghi**; "chỉ đọc thì phải đọc được" (câu 27 nói đúng
 * chữ đó cho dự án). Nên file này **không** có lớp lọc nào theo `project.trang_thai`:
 * một mục của dự án đã lưu trữ vẫn đọc được, và `baton result T-x` trên nó vẫn in
 * đúng kết quả. Có ca test ghim.
 */

import {
  BatonError,
  MUC_THEO_DO_KHAN,
  gioQuaHan,
  khoangNgay,
  kiemLimit,
  laMaHopLe,
  maCanChu,
  maSoTuChu,
  moCursor,
  mucCaoNhat,
  ngayDiaPhuong,
  quaHan,
  sqlDongChung,
  tamNhinDongChung,
  type AiGoi,
  type KetLuanReviewMuc,
  type LoaiCanChu,
  type MucCanChu as MucDoKhan,
  type TrangKetQua,
  type TrangThaiCanChu,
} from '@baton/shared';
import { dungTrang } from './doc-du-an.js';
import { chayTheoLo } from './chia-lo-tham-so.js';
import { LOC_CHUNG } from './doc-nhat-ky.js';

/* ------------------------------------------------------------------ *
 * Phạm vi
 * ------------------------------------------------------------------ */

/**
 * Điều kiện phạm vi của bảng `can_chu`, ghép thẳng vào `WHERE`. Hai lớp mục,
 * hai luật khác nhau — **cùng cấu trúc** với `locPhamViNhatKy` của mục 10, vì
 * 19.12 câu 61 chốt một luật cho **cả hai** mục có lớp "Chung":
 *
 *   * mục **có dự án**: nếp chung của Baton — chủ và agent có cờ "tất cả dự án"
 *     thấy hết, agent còn lại chỉ thấy dự án có trong `agent_project`.
 *   * mục **Chung** (`project_id IS NULL`): `pham-vi-chung.ts`, câu 61. Cửa dự
 *     án không có gì để kiểm ở lớp này nên nó cần luật riêng, và luật đó rẽ theo
 *     **vai**, không theo cờ dự án.
 *
 * `sql` rỗng = **không giới hạn gì**. Mảnh trả về **không** mang sẵn `AND`.
 *
 * Tên cột mang tiền tố `ct.` vì mọi câu đọc của file này đặt bí danh `can_chu ct`
 * (nó `LEFT JOIN` bảng phương án, nên tên cột trần sẽ nhập nhằng).
 */
export function locPhamViCanChu(ai: AiGoi): { sql: string; bind: string[] } {
  // Lớp mục **Chung** — một chỗ duy nhất, `@baton/shared` → `pham-vi-chung.ts`.
  const ve_chung = sqlDongChung(ai, { du_an: 'ct.project_id', agent: 'ct.tao_boi_agent_id' });

  // Lớp mục **có dự án** — nếp chung của Baton, không phải luật câu 61.
  const thay_moi_du_an = ai.loai === 'chu' || ai.vao_tat_ca_du_an;

  if (thay_moi_du_an && tamNhinDongChung(ai) === 'moi_dong') {
    return { sql: '', bind: [] };
  }

  const ve_du_an = thay_moi_du_an
    ? { sql: 'ct.project_id IS NOT NULL', bind: [] as string[] }
    : {
        sql: 'ct.project_id IN (SELECT project_id FROM agent_project WHERE agent_id = ?)',
        bind: [ai.loai === 'agent' ? ai.agent_id : ''],
      };

  const ve = ve_chung === null ? [ve_du_an] : [ve_du_an, ve_chung];
  return {
    sql: `(${ve.map((v) => v.sql).join(' OR ')})`,
    bind: ve.flatMap((v) => v.bind),
  };
}

/* ------------------------------------------------------------------ *
 * Một mục, dạng ra
 * ------------------------------------------------------------------ */

/** Phương án **đã chọn** của một mục `decision` — mục 8 d.244, 19.9 d.538. */
export interface PhuongAnDaChonRa {
  id: string;
  nhan: string;
  noi_dung: string;
}

/**
 * Một mục Cần Chủ, dạng JSON — đủ cho `baton result T-x` của d.376 ("in **trạng
 * thái** và **kết quả** của mục").
 *
 * `da_xu_ly` là **dẫn xuất**, và nó là thứ `--wait` dừng lại trên: mục 8 d.244
 * cho `Chờ` hai đường ra — `Đã xử lý` **và** `Bỏ qua` — nên "đã có kết quả" là
 * "**rời `open`**", không phải "`resolved`". Xem `WorkspaceGate.choCanChu`.
 */
export interface MucCanChuRa {
  id: string;
  /** `T-<số>` — mục 8 ("Mã `T-số`"). */
  ma: string;
  trang_thai: TrangThaiCanChu;
  /** Đã rời `open` (`resolved` **hoặc** `skipped`) — xem khối trên. */
  da_xu_ly: boolean;
  muc: MucDoKhan;
  loai: LoaiCanChu;
  /** `null` = mục **Chung** — 19.12 câu 4. */
  project_id: string | null;
  tieu_de: string;
  boi_canh: string | null;
  /**
   * Lệnh cần chạy — **mọi loại** có thể có (d.250 "lệnh có nút Copy";
   * `cau-hoi-spec.md` #130). `null` = mục không mang lệnh nào. `run_command`
   * **luôn** có (d.237, `COMMAND_REQUIRED`).
   */
  lenh: string | null;
  can_tty: boolean;
  han_luc: number | null;
  tao_luc: number;
  /** `null` = **chủ** tự tạo để ghi nhớ — mục 8 d.229. */
  tao_boi_agent_id: string | null;

  /* Kết quả — mục 8 d.244–245, 19.9 d.538–540. */
  /** Chữ kết quả (phương án đã chọn và/hoặc chữ tự do) — d.244. */
  ket_qua: string | null;
  phuong_an_da_chon: PhuongAnDaChonRa | null;
  /** `review`: `dat` / `can_sua` — mục 8 d.261. */
  ket_luan_review: KetLuanReviewMuc | null;
  /** `Bỏ qua` thì **bắt buộc** có lý do — mục 8 d.244, 19.9 d.540. */
  ly_do_bo_qua: string | null;
  xu_ly_luc: number | null;
  /** Số lần mục đã được mở lại — mục 8 d.246. */
  mo_lai_lan: number;
}

/** Dòng thô — hình dạng của `COT_MUC`. */
interface DongTho {
  id: string;
  ma_so: number;
  trang_thai: TrangThaiCanChu;
  muc: MucDoKhan;
  loai: LoaiCanChu;
  project_id: string | null;
  tieu_de: string;
  boi_canh: string | null;
  lenh: string | null;
  can_tty: number;
  han_luc: number | null;
  tao_luc: number;
  tao_boi_agent_id: string | null;
  ket_qua: string | null;
  ket_luan_review: KetLuanReviewMuc | null;
  ly_do_bo_qua: string | null;
  xu_ly_luc: number | null;
  mo_lai_lan: number;
  pa_id: string | null;
  pa_nhan: string | null;
  pa_noi_dung: string | null;
}

/**
 * `SELECT` dùng chung cho **mọi** đường đọc của mục 8.
 *
 * **`lenh` của mọi loại đi qua một `COALESCE`** — d.250 ("mỗi thẻ hiện đủ: …
 * lệnh có nút Copy", chung cho mọi thẻ; `cau-hoi-spec.md` #130). Lệnh **bắt
 * buộc** của `run_command` nằm ở `ct.lenh` (0013), lệnh **tuỳ chọn** của ba loại
 * kia nằm ở `ct.lenh_kem` (0023, vì SQLite không gỡ được CHECK mức bảng của
 * 0013). Mỗi dòng chỉ một chỗ có giá trị — trigger `tg_can_chu_lenh_kem_*` ép
 * điều đó — nên `COALESCE` không bao giờ phải chọn giữa hai lệnh khác nhau, và
 * mọi đường đọc vẫn thấy **một** trường `lenh` như trước.
 *
 * Phương án đã chọn đi bằng `LEFT JOIN`, không một truy vấn thứ hai: một mục có
 * **tối đa một** phương án đã chọn (`phuong_an_da_chon_id` là một khoá đơn), nên
 * join không nhân dòng. `pa.workspace_id = ct.workspace_id` trong điều kiện join
 * là nếp "mọi câu ràng cả `workspace_id`".
 */
export const COT_MUC = `ct.id AS id, ct.ma_so AS ma_so, ct.trang_thai AS trang_thai,
       ct.muc AS muc, ct.loai AS loai, ct.project_id AS project_id,
       ct.tieu_de AS tieu_de, ct.boi_canh AS boi_canh,
       COALESCE(ct.lenh, ct.lenh_kem) AS lenh,
       CASE WHEN ct.lenh IS NOT NULL THEN ct.can_tty ELSE ct.can_tty_kem END AS can_tty,
       ct.han_luc AS han_luc, ct.tao_luc AS tao_luc,
       ct.tao_boi_agent_id AS tao_boi_agent_id, ct.ket_qua AS ket_qua,
       ct.ket_luan_review AS ket_luan_review, ct.ly_do_bo_qua AS ly_do_bo_qua,
       ct.xu_ly_luc AS xu_ly_luc, ct.mo_lai_lan AS mo_lai_lan,
       pa.id AS pa_id, pa.nhan AS pa_nhan, pa.noi_dung AS pa_noi_dung`;

/** `FROM` dùng chung — xem `COT_MUC`. */
export const TU_MUC = `FROM can_chu ct
       LEFT JOIN can_chu_phuong_an pa
              ON pa.id = ct.phuong_an_da_chon_id AND pa.workspace_id = ct.workspace_id`;

export function raMuc(d: DongTho): MucCanChuRa {
  return {
    id: d.id,
    ma: maCanChu(d.ma_so),
    trang_thai: d.trang_thai,
    da_xu_ly: d.trang_thai !== 'open',
    muc: d.muc,
    loai: d.loai,
    project_id: d.project_id,
    tieu_de: d.tieu_de,
    boi_canh: d.boi_canh,
    lenh: d.lenh,
    can_tty: d.can_tty === 1,
    han_luc: d.han_luc,
    tao_luc: d.tao_luc,
    tao_boi_agent_id: d.tao_boi_agent_id,
    ket_qua: d.ket_qua,
    phuong_an_da_chon:
      d.pa_id === null || d.pa_nhan === null || d.pa_noi_dung === null
        ? null
        : { id: d.pa_id, nhan: d.pa_nhan, noi_dung: d.pa_noi_dung },
    ket_luan_review: d.ket_luan_review,
    ly_do_bo_qua: d.ly_do_bo_qua,
    xu_ly_luc: d.xu_ly_luc,
    mo_lai_lan: d.mo_lai_lan,
  };
}

/* ------------------------------------------------------------------ *
 * `baton result T-x` — mục 13 d.376
 * ------------------------------------------------------------------ */

/**
 * Một mục theo **`T-số`** hoặc theo **id**. Không có, hoặc ngoài tầm nhìn →
 * `NOT_FOUND`/404 (19.12 câu 15 + câu 61 "không lộ sự tồn tại").
 *
 * Hai ca ra cùng một chỗ, **cùng một câu SQL**, nên không phân biệt được từ
 * ngoài — đúng câu 15 ("cả hai ca phải ra phản hồi giống hệt nhau"). Ca test
 * `T-404` của một agent không có tầm nhìn so với một mục **có thật** ngoài tầm
 * nhìn ghim điều này.
 */
export async function layMucCanChu(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  ma_hoac_id: unknown,
): Promise<MucCanChuRa> {
  if (typeof ma_hoac_id !== 'string' || ma_hoac_id.trim() === '') {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu mã mục Cần Chủ.' });
  }

  const pham_vi = locPhamViCanChu(ai);
  const ma_so = maSoTuChu(ma_hoac_id);
  const d = await db
    .prepare(
      `SELECT ${COT_MUC} ${TU_MUC}
        WHERE ct.workspace_id = ? AND ${ma_so === null ? 'ct.id = ?' : 'ct.ma_so = ?'}
          ${pham_vi.sql === '' ? '' : `AND ${pham_vi.sql}`}`,
    )
    .bind(workspace_id, ma_so ?? ma_hoac_id, ...pham_vi.bind)
    .first<DongTho>();

  if (d === null) {
    throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy mục Cần Chủ.' });
  }
  return raMuc(d);
}

/* ------------------------------------------------------------------ *
 * `resolved_asks` — mục 8 d.268
 * ------------------------------------------------------------------ */

/**
 * **Cửa sổ thời gian** của `resolved_asks` — xem `asksVuaXuLy`. 24 giờ.
 *
 * Một hằng có tên, không một số rải trong câu SQL, vì nó là **chỗ cắm** của câu
 * hỏi `cau-hoi-spec.md` #76: phiên spec chốt khác thì sửa đúng dòng này.
 */
export const CUA_SO_RESOLVED_ASKS_MS = 24 * 60 * 60 * 1000;

/** Trần số mục trả về một lượt — cùng nếp `LIMIT 200` của các đường kéo việc. */
const TRAN_RESOLVED_ASKS = 50;

/**
 * **Mục do CHÍNH agent này tạo, đã rời `open` trong cửa sổ gần đây** — mục 8
 * d.268.
 *
 * ## Vì sao KHÔNG có trạng thái "đã giao kết quả cho agent"
 *
 * d.268 nói "lần gọi **kế tiếp**" nhưng SPEC **không nói** Baton biết bằng cách
 * nào là agent **đã nhận rồi**: không có lệnh xác nhận nào trong bảng lệnh mục
 * 13, và không có cột mốc nào cho việc đó trong mục 8. Chỗ im lặng này được ghi
 * thành `cau-hoi-spec.md` **#76**; đề xuất tạm đang cài là hướng **không trạng
 * thái, dẫn xuất**:
 *
 *   * Hướng kia (một cột kiểu `da_giao_luc`) đòi một lệnh **GHI trên đường
 *     ĐỌC**. Nó phá nếp "lệnh đọc đi thẳng D1, không chạm cửa ghi" và biến
 *     `baton tasks` thành một lệnh ghi — tức đụng luôn 19.12 **câu 53** ("lệnh
 *     chờ dài là lệnh đọc, không nhích tín hiệu").
 *   * Hướng này giữ đường đọc là đọc thuần, và nó **idempotent cho agent**: nhận
 *     lại một kết quả đã biết là vô hại, còn **không** nhận một kết quả thì agent
 *     kẹt chờ mãi một mục sẽ không bao giờ đổi nữa.
 *
 * **Đánh đổi đã biết, khai thẳng:** cùng một mục **ra nhiều lần** trong suốt cửa
 * sổ `CUA_SO_RESOLVED_ASKS_MS`. Đó là giá của việc không có trạng thái, và nó
 * không gây vòng lặp nào, vì `resolved_asks` **không** tính vào `co_viec` (xem
 * `ViecCuaToi.co_viec` — một mục đã xử lý nằm trong cửa sổ là trạng thái **tồn
 * tại dai**, tính nó vào thì `baton tasks --wait` không bao giờ chờ nữa).
 *
 * ## `skipped` cũng ra
 *
 * `trang_thai <> 'open'`, không `= 'resolved'`: `Bỏ qua` là một kết quả agent
 * phải nhận (19.9 d.540 nói thẳng "agent nhận trạng thái `skipped`"), nếu không
 * thì agent chờ một mục sẽ không bao giờ `resolved`.
 *
 * ## Tầm nhìn
 *
 * `tao_boi_agent_id = <tôi>` là điều kiện **cộng thêm**, không thay thế:
 * `locPhamViCanChu` vẫn áp, nên một agent đã bị bỏ khỏi dự án không còn thấy mục
 * cũ của mình, và luật câu 61 vẫn là luật duy nhất cho lớp Chung.
 *
 * **Chủ không có `resolved_asks`.** d.268 nói về "**agent** không đang chờ"; chủ
 * là người bấm Gửi, nên không có ai phải báo lại cho chủ.
 */
export async function asksVuaXuLy(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<MucCanChuRa[]> {
  if (ai.loai !== 'agent') return [];

  const cau = cauAsksVuaXuLy(ai, workspace_id, bay_gio);
  const { results } = await db
    .prepare(cau.sql)
    .bind(...cau.bind)
    .all<DongTho>();
  return results.map(raMuc);
}

/**
 * Câu SQL của `asksVuaXuLy`, tách ra để test đo **chính câu sản phẩm** bằng
 * `EXPLAIN QUERY PLAN` — nếp đã chốt ở `quyet-dinh.md` (một chuỗi SQL viết lại
 * trong test là một câu khác, và nó vẫn xanh sau khi câu thật đã hỏng).
 *
 * ## Hai chi tiết của câu này là **điều kiện để nó đi index**, đừng sửa rời
 *
 *   * **`xu_ly_luc IS NOT NULL` phải có mặt**, dù `trang_thai <> 'open'` đã hàm ý
 *     nó: `ix_can_chu_asks` (0016) là index **riêng phần** `WHERE xu_ly_luc IS NOT
 *     NULL`, và SQLite chỉ dùng được một index riêng phần khi câu truy vấn mang
 *     **đúng** vế đó. Bỏ nó ra thì câu này quay về **quét toàn bộ mục của
 *     workspace** ở mọi lần `tasks`/`heartbeat` — đúng chỗ reviewer lượt 3a bắt.
 *   * **`ORDER BY … DESC, ct.id DESC`** — cả hai cột cùng đảo chiều so với index
 *     `(workspace_id, tao_boi_agent_id, xu_ly_luc, id)`, nên SQLite đi index theo
 *     chiều ngược và **không** cần `TEMP B-TREE`. Đảo một cột thôi là mất nó.
 */
export function cauAsksVuaXuLy(
  ai: Extract<AiGoi, { loai: 'agent' }>,
  workspace_id: string,
  bay_gio: number,
): { sql: string; bind: (string | number)[] } {
  const pham_vi = locPhamViCanChu(ai);
  return {
    sql: `SELECT ${COT_MUC} ${TU_MUC}
        WHERE ct.workspace_id = ? AND ct.tao_boi_agent_id = ?
          AND ct.trang_thai <> 'open'
          AND ct.xu_ly_luc IS NOT NULL AND ct.xu_ly_luc >= ?
          ${pham_vi.sql === '' ? '' : `AND ${pham_vi.sql}`}
        ORDER BY ct.xu_ly_luc DESC, ct.id DESC
        LIMIT ?`,
    bind: [
      workspace_id,
      ai.agent_id,
      bay_gio - CUA_SO_RESOLVED_ASKS_MS,
      ...pham_vi.bind,
      TRAN_RESOLVED_ASKS,
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Chủ đề đánh thức của `baton result T-x --wait`
 * ------------------------------------------------------------------ */

/**
 * Chủ đề mà một `baton result T-x --wait` nghe.
 *
 * `can_chu_ma:<T-số>` là chỗ ba lệnh xử lý của mục 8 **phát** (xem
 * `chuDeDanhThuc` trong `lenh-xu-ly-can-chu.ts`, đặt sẵn từ lượt 2b). Mã truyền
 * vào đây là `MucCanChuRa.ma` — tức mã của một mục **đã qua cửa tầm nhìn**, không
 * phải chuỗi client gửi thô: nếu không thì một agent gõ `baton result T-9` cho
 * một mục nó không được đọc vẫn treo được một waiter lên khoá của mục đó, và biết
 * được *lúc nào* mục đó bị xử lý.
 *
 * `agent:<tôi>` đi kèm với đúng lý do của `chuDeKeoViec`: token bị thu hồi hay
 * agent bị tắt giữa lúc chờ thì waiter phải **tỉnh để kiểm lại rồi cắt**
 * (`cau-hoi-spec.md` #51). Để nó ngủ tiếp thì một token đã thu hồi còn đọc được
 * dữ liệu tới 60 giây nữa.
 */
export function chuDeChoCanChu(ma: string, agent_id: string | null): string[] {
  const ra = [`can_chu_ma:${ma}`];
  if (agent_id !== null) ra.push(`agent:${agent_id}`);
  return ra;
}

/* ================================================================== *
 * MÀN HÌNH CẦN CHỦ — mục 8 d.248–252
 * ================================================================== *
 *
 * **Phần 4 làm tầng API, KHÔNG làm giao diện** (giao diện là phần 6,
 * `viec-v0.1.md`). Nên mục tiêu của khối này là: trả **đủ dữ liệu** để phần 6
 * dựng được từng chữ của d.248–252 mà **không phải tính lại một luật nào**.
 *
 * Cụ thể, ba thứ **dẫn xuất** được tính ở đây và không để phần 6 tự tính:
 *   * `qua_han` / `qua_han_gio` — "quá hạn X giờ" của d.249 (`quaHan`, `gioQuaHan`
 *     của `@baton/shared`, cùng nếp `stalled`). Hai bản tính là **hai luật**, và
 *     chúng sẽ lệch nhau ở đúng chỗ khó thấy nhất (làm tròn, múi giờ).
 *   * `muc_cao_nhat` của huy hiệu d.248 (`mucCaoNhat`).
 *   * `ngay` của bảng "Đã xử lý" d.251 (`ngayDiaPhuong`) và biên của bộ lọc
 *     "khoảng ngày" (`khoangNgay`) — cả hai là giờ-**trên tường**, nên cả hai đi
 *     qua `MUI_GIO_CHU_PHUT`, đúng một chỗ, theo 19.12 **câu 60**.
 *
 * Tầm nhìn: **`locPhamViCanChu`** ở trên, tức `pham-vi-chung.ts` cho lớp Chung —
 * 19.12 **câu 61** ("luật này phải nằm ở một chỗ duy nhất"). Không có điều kiện
 * tầm nhìn nào viết lại trong khối này.
 */

/**
 * **Bộ lọc của màn hình** — d.252 ("Lọc theo dự án, theo loại") và d.251 (bảng
 * "Đã xử lý" lọc "theo dự án và theo khoảng ngày").
 *
 * `project_id` nhận `LOC_CHUNG` (`'chung'`) để lọc lấy **mục Chung**
 * (`project_id IS NULL`) — cùng khoá và cùng giới hạn đã khai ở `doc-nhat-ky.ts`,
 * vì 19.12 câu 4 cho **cả hai** mục một bộ lọc dự án có lựa chọn "Chung".
 */
export interface LocManHinhCanChu {
  project_id?: string | undefined;
  loai?: string | undefined;
}

/** Bộ lọc của bảng "Đã xử lý" — d.251. Khoảng ngày là ngày **trên tường**. */
export interface LocDaXuLy extends LocManHinhCanChu {
  /** `YYYY-MM-DD`, bao gồm cả ngày này. */
  tu_ngay?: string | undefined;
  /** `YYYY-MM-DD`, bao gồm **trọn** ngày này — xem `khoangNgay`. */
  den_ngay?: string | undefined;
  cursor?: string | undefined;
  limit?: unknown;
}

/** Bộ lọc + phân trang của **một khối** (d.249). */
export interface YeuCauKhoiCanChu extends LocManHinhCanChu {
  cursor?: string | undefined;
  limit?: unknown;
}

/**
 * Hai vế lọc dùng chung cho **cả ba** đường đọc của màn hình (ba khối, huy hiệu,
 * bảng Đã xử lý) — một bản, nên "lọc theo dự án" không thể có nghĩa khác nhau ở
 * khối trên và ở bảng dưới.
 *
 * Hai cột này **không** nằm trong index nào của `can_chu`, và đó là lựa chọn của
 * 0013 (ghi chú của `ix_can_chu_trung`: `project_id` cho phép NULL nên đưa vào
 * khoá chỉ làm index phình). Chúng là điều kiện **lọc sau khi index đã chọn
 * dòng** — chấp nhận được vì index đã kẹp tập dòng xuống "mục `Chờ` của một mức"
 * hoặc "mục đã xử lý trong một khoảng ngày", cả hai đều nhỏ.
 */
function veLoc(loc: LocManHinhCanChu): { sql: string[]; bind: (string | number)[] } {
  const sql: string[] = [];
  const bind: (string | number)[] = [];

  if (loc.project_id !== undefined && loc.project_id !== '') {
    if (loc.project_id === LOC_CHUNG) {
      sql.push('ct.project_id IS NULL');
    } else {
      sql.push('ct.project_id = ?');
      bind.push(loc.project_id);
    }
  }

  if (loc.loai !== undefined && loc.loai !== '') {
    // Khoá thật, không chữ tự do: một `loai` lạ phải là `INVALID_INPUT`, không
    // phải "không có mục nào" — một bộ lọc im lặng trả rỗng là một bộ lọc mà
    // người dùng tưởng mình đã lọc đúng.
    if (!laMaHopLe('loai_can_chu', loc.loai)) {
      throw new BatonError('INVALID_INPUT', {
        message: 'Lọc theo loại phải là một trong: decision, run_command, review, fyi.',
      });
    }
    sql.push('ct.loai = ?');
    bind.push(loc.loai);
  }

  return { sql, bind };
}

/* ------------------------------------------------------------------ *
 * (a) Một khối — d.249
 * ------------------------------------------------------------------ */

/**
 * Câu SQL của **một khối**, cho một trong hai pha (xem dưới). Tách ra để test đo
 * **chính câu sản phẩm** bằng `EXPLAIN QUERY PLAN`.
 *
 * ## Vì sao HAI pha, không một câu
 *
 * d.249: "Trong khối sắp theo **hạn**, rồi theo **lúc tạo**." Nhưng hạn là **tuỳ
 * chọn** (d.241: ⚪ không có hạn mặc định), nên trong một khối có thể lẫn mục
 * `han_luc IS NULL`. `ORDER BY han_luc` của SQLite xếp NULL lên **đầu**, tức một
 * mục **không hẹn hạn** sẽ đứng **trên** một mục đã quá hạn — ngược hẳn 19.8 ("mục
 * quá hạn được đưa lên **đầu** khối của nó").
 *
 * `ORDER BY han_luc ASC NULLS LAST` sửa được thứ tự nhưng **mất index**: SQLite đi
 * index cho `ORDER BY` chỉ khi hướng NULL khớp index (NULL trước, với ASC), nên
 * `NULLS LAST` kéo theo một `TEMP B-TREE` — và `ix_can_chu_khoi` của 0013 có đúng
 * tiền tố cần, bỏ nó đi là tự tạo một lần sắp cả khối trong bộ nhớ.
 *
 * Nên: **pha 1** đọc mục **có hạn** (`han_luc IS NOT NULL`), **pha 2** đọc mục
 * **không hạn**. Cả hai đi `ix_can_chu_khoi`: `IS NULL` / `IS NOT NULL` trên cột
 * thứ tư là một điều kiện index dùng được, và `ORDER BY` còn lại là đúng hậu tố
 * của index. Nối hai pha lại là **đúng** thứ tự "hạn trước, rồi không hạn".
 *
 * SPEC **không nói** mục không đặt hạn nằm đâu trong thứ tự của d.249 — xem
 * `cau-hoi-spec.md` **#77**. Hướng tạm: **cuối khối**.
 */
export function cauKhoiCho(
  ai: AiGoi,
  workspace_id: string,
  muc: MucDoKhan,
  loc: LocManHinhCanChu,
  pha: 'co_han' | 'khong_han',
  sau: readonly (string | number)[] | null,
  limit: number,
): { sql: string; bind: (string | number)[] } {
  const pham_vi = locPhamViCanChu(ai);
  const them = veLoc(loc);

  const dieu_kien = [
    'ct.workspace_id = ?',
    "ct.trang_thai = 'open'",
    'ct.muc = ?',
    pha === 'co_han' ? 'ct.han_luc IS NOT NULL' : 'ct.han_luc IS NULL',
  ];
  const bind: (string | number)[] = [workspace_id, muc];

  if (pham_vi.sql !== '') {
    dieu_kien.push(pham_vi.sql);
    bind.push(...pham_vi.bind);
  }
  dieu_kien.push(...them.sql);
  bind.push(...them.bind);

  if (sau !== null) {
    // Khoá keyset = **đúng** các cột của `ORDER BY`, cùng thứ tự (`trang.ts`).
    if (pha === 'co_han') {
      dieu_kien.push('(ct.han_luc, ct.tao_luc, ct.id) > (?, ?, ?)');
      bind.push(Number(sau[0]), Number(sau[1]), String(sau[2]));
    } else {
      dieu_kien.push('(ct.tao_luc, ct.id) > (?, ?)');
      bind.push(Number(sau[0]), String(sau[1]));
    }
  }

  const thu_tu = pha === 'co_han' ? 'ct.han_luc, ct.tao_luc, ct.id' : 'ct.tao_luc, ct.id';
  bind.push(limit);
  return {
    sql: `SELECT ${COT_MUC} ${TU_MUC}
        WHERE ${dieu_kien.join(' AND ')}
        ORDER BY ${thu_tu} LIMIT ?`,
    bind,
  };
}

/** Khoá cursor của một khối: pha ở ô đầu, rồi đúng các cột của `ORDER BY`. */
function khoaKhoi(d: DongTho): (string | number)[] {
  return d.han_luc === null ? [0, d.tao_luc, d.id] : [1, d.han_luc, d.tao_luc, d.id];
}

/**
 * **Một khối của d.249** — mục `Chờ` của một mức, "sắp theo hạn, rồi theo lúc
 * tạo", mục quá hạn ở đầu khối (19.8).
 *
 * Thẻ mang **đủ** các vế của d.250 (mã, dự án, loại, tiêu đề, bối cảnh, phương án
 * + phương án nào là đề xuất, lệnh, file, ticket liên quan) — xem `TheCanChu`.
 */
export async function khoiCho(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  muc: MucDoKhan,
  bay_gio: number,
  yeu_cau: YeuCauKhoiCanChu = {},
): Promise<TrangKetQua<TheCanChu>> {
  const limit = kiemLimit(yeu_cau.limit);

  /*
   * Cursor mang **pha** ở ô đầu, nên một trang có thể bắt đầu ở giữa pha 1 hoặc ở
   * giữa pha 2. `0` = pha "không hạn" (pha sau), `1` = pha "có hạn" (pha trước) —
   * số, không chữ, vì `moCursor` chỉ nhận chữ và số.
   */
  let pha: 'co_han' | 'khong_han' = 'co_han';
  let sau: readonly (string | number)[] | null = null;
  if (yeu_cau.cursor !== undefined) {
    const khoa = moCursorKhoi(yeu_cau.cursor);
    pha = khoa.pha;
    sau = khoa.sau;
  }

  const dong: DongTho[] = [];

  if (pha === 'co_han') {
    const cau = cauKhoiCho(ai, workspace_id, muc, yeu_cau, 'co_han', sau, limit + 1);
    const { results } = await db
      .prepare(cau.sql)
      .bind(...cau.bind)
      .all<DongTho>();
    dong.push(...results);
    // Pha 1 chưa đủ một trang ⇒ nối tiếp bằng pha 2 **từ đầu**. Đó là lý do khoá
    // cursor phải mang pha: không mang thì trang sau không biết mình đang ở đâu.
    if (dong.length <= limit) {
      sau = null;
      pha = 'khong_han';
    }
  }

  if (pha === 'khong_han' && dong.length <= limit) {
    const con = limit + 1 - dong.length;
    const cau = cauKhoiCho(ai, workspace_id, muc, yeu_cau, 'khong_han', sau, con);
    const { results } = await db
      .prepare(cau.sql)
      .bind(...cau.bind)
      .all<DongTho>();
    dong.push(...results);
  }

  const trang = dungTrang(dong, limit, (d) => d, khoaKhoi);
  const the = await theCuaCacDong(db, workspace_id, trang.items, bay_gio);
  return { items: the, cursor_sau: trang.cursor_sau };
}

/** Mở cursor của một khối — hai hình khoá (4 ô cho pha "có hạn", 3 ô cho pha kia). */
function moCursorKhoi(cursor: string): {
  pha: 'co_han' | 'khong_han';
  sau: readonly (string | number)[];
} {
  // Thử hình 4 ô trước; sai số ô thì `moCursor` ném `INVALID_INPUT`, nên thử hình
  // 3 ô. Không "đoán" bằng cách đọc ô đầu: cursor hỏng phải ra `INVALID_INPUT`,
  // không âm thầm thành trang đầu (`trang.ts`).
  try {
    const khoa = moCursor(cursor, 4);
    if (khoa[0] === 1) return { pha: 'co_han', sau: khoa.slice(1) };
  } catch {
    /* rơi xuống hình 3 ô */
  }
  const khoa = moCursor(cursor, 3);
  if (khoa[0] !== 0) {
    throw new BatonError('INVALID_INPUT', { message: 'cursor không hợp lệ.' });
  }
  return { pha: 'khong_han', sau: khoa.slice(1) };
}

/* ------------------------------------------------------------------ *
 * (b) Huy hiệu đếm — d.248
 * ------------------------------------------------------------------ */

/**
 * **Huy hiệu đếm số `Chờ`, màu theo mức cao nhất** — d.248 nguyên văn: "luôn ở đầu
 * sidebar, huy hiệu đếm số `Chờ` màu theo mức cao nhất".
 *
 * `muc_cao_nhat` là `null` khi **không còn mục `Chờ` nào** — tức huy hiệu không
 * hiện. Không trả `'later'` cho tập rỗng: phần 6 sẽ dựng một huy hiệu ⚪ số 0.
 *
 * `so_theo_muc` có **đủ ba** khoá (kể cả khoá bằng 0), nên phần 6 dựng được tiêu
 * đề của cả ba khối mà không phải đoán khoá thiếu là 0 hay là "chưa tải".
 */
export interface HuyHieuCanChu {
  so_cho: number;
  muc_cao_nhat: MucDoKhan | null;
  so_theo_muc: Record<MucDoKhan, number>;
}

/**
 * Câu đếm của huy hiệu — tách ra để test `EXPLAIN QUERY PLAN` đo chính nó.
 *
 * `GROUP BY ct.muc` đi đúng tiền tố `(workspace_id, trang_thai, muc)` của
 * `ix_can_chu_khoi`, nên nhóm chạy **trên thứ tự của index**, không qua B-tree
 * tạm. Đếm bằng **một** câu, không ba: ba câu là ba lần đọc cho một con số, và
 * chúng có thể thấy ba trạng thái khác nhau của bảng.
 */
export function cauHuyHieu(
  ai: AiGoi,
  workspace_id: string,
  loc: LocManHinhCanChu,
): { sql: string; bind: (string | number)[] } {
  const pham_vi = locPhamViCanChu(ai);
  const them = veLoc(loc);

  const dieu_kien = ['ct.workspace_id = ?', "ct.trang_thai = 'open'"];
  const bind: (string | number)[] = [workspace_id];
  if (pham_vi.sql !== '') {
    dieu_kien.push(pham_vi.sql);
    bind.push(...pham_vi.bind);
  }
  dieu_kien.push(...them.sql);
  bind.push(...them.bind);

  return {
    sql: `SELECT ct.muc AS muc, count(*) AS so FROM can_chu ct
        WHERE ${dieu_kien.join(' AND ')}
        GROUP BY ct.muc`,
    bind,
  };
}

export async function huyHieuCanChu(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  loc: LocManHinhCanChu = {},
): Promise<HuyHieuCanChu> {
  const cau = cauHuyHieu(ai, workspace_id, loc);
  const { results } = await db
    .prepare(cau.sql)
    .bind(...cau.bind)
    .all<{ muc: MucDoKhan; so: number }>();

  const so_theo_muc: Record<MucDoKhan, number> = { urgent: 0, today: 0, later: 0 };
  let so_cho = 0;
  for (const r of results) {
    so_theo_muc[r.muc] = r.so;
    so_cho += r.so;
  }

  // Mức cao nhất **đang có mục**, qua `mucCaoNhat` của `@baton/shared` — cùng bản
  // mà thứ tự ba khối và phiên duyệt (d.274) đọc.
  const co = MUC_THEO_DO_KHAN.filter((m) => so_theo_muc[m] > 0);
  return { so_cho, muc_cao_nhat: mucCaoNhat(co), so_theo_muc };
}

/* ------------------------------------------------------------------ *
 * (c) Bảng "Đã xử lý" — d.251
 * ------------------------------------------------------------------ */

/**
 * **Độ dài của "tiêu đề ngắn"** (d.251) — 80 ký tự, rồi `…`.
 *
 * SPEC nói "tiêu đề **ngắn**" mà **không cho con số** (`cau-hoi-spec.md` #77).
 * Cắt ở **server** chứ không để phần 6 cắt, cùng lý lẽ với `qua_han_gio`: hai bản
 * cắt là hai luật. Tiêu đề đầy đủ vẫn ra ở `tieu_de`, nên phần 6 dùng được nó cho
 * tooltip mà không phải gọi lại.
 */
export const DAI_TIEU_DE_NGAN = 80;

/** Một dòng của bảng "Đã xử lý" — d.251: "ngày, mã, tiêu đề ngắn, kết quả". */
export interface DongDaXuLy {
  id: string;
  /** `T-<số>`. */
  ma: string;
  /** Ngày **trên tường** (UTC+7, 19.12 câu 60), dạng `YYYY-MM-DD`. */
  ngay: string;
  xu_ly_luc: number;
  tieu_de: string;
  tieu_de_ngan: string;
  /**
   * **Kết quả** của d.251. Một mục `Bỏ qua` không có `ket_qua` (trigger 0015), nên
   * ô này lấy `ly_do_bo_qua` — 19.9 d.540–541 xếp `skipped` là **một kết quả** mà
   * agent phải nhận, và một bảng "Đã xử lý" bỏ trống ô kết quả cho mọi mục bị bỏ
   * qua là một bảng chủ không đọc được. `trang_thai` đi kèm nên phần 6 phân biệt
   * được hai ca mà không phải đoán từ chữ.
   */
  ket_qua: string;
  trang_thai: TrangThaiCanChu;
  loai: LoaiCanChu;
  /** `null` = mục **Chung** — 19.12 câu 4. */
  project_id: string | null;
  ket_luan_review: KetLuanReviewMuc | null;
}

interface DongDaXuLyTho {
  id: string;
  ma_so: number;
  tieu_de: string;
  trang_thai: TrangThaiCanChu;
  loai: LoaiCanChu;
  project_id: string | null;
  ket_qua: string | null;
  ly_do_bo_qua: string | null;
  ket_luan_review: KetLuanReviewMuc | null;
  xu_ly_luc: number;
}

/**
 * Câu SQL của bảng "Đã xử lý" — tách ra để test `EXPLAIN QUERY PLAN` đo chính nó.
 *
 * ## `xu_ly_luc IS NOT NULL` là điều kiện của **cả ba** việc, không một vế dư
 *
 *   1. Nó **là** định nghĩa "đã xử lý": mệnh đề 3 của `tg_can_chu_xu_ly_*` (0015)
 *      ép `(trang_thai = 'open') <> (xu_ly_luc IS NULL)`, nên "rời `open`" và "có
 *      `xu_ly_luc`" là **cùng một** tập dòng — ép tại DB, không một quy ước.
 *   2. Nó là vế mà index **riêng phần** `ix_can_chu_da_xu_ly` (0016) đòi phải có
 *      mặt mới dùng được.
 *   3. Nó cho `ORDER BY xu_ly_luc DESC, id DESC` một cột **không NULL**, nên không
 *      có ca "NULL xếp đâu" như ở ba khối.
 *
 * Bảng này gồm **cả `skipped`**, không chỉ `resolved`: d.265 nói thẻ "chuyển ngay
 * xuống Đã xử lý" sau khi chủ bấm Gửi, và d.264 cho mọi thẻ một link "Bỏ qua" —
 * nên một mục bị bỏ qua phải xuống đúng chỗ đó, nếu không nó **mất khỏi cả hai**
 * nửa màn hình. `trang_thai` ra ngoài để phần 6 vẫn phân biệt được.
 */
export function cauDaXuLy(
  ai: AiGoi,
  workspace_id: string,
  loc: LocDaXuLy,
  khoang: { tu: number | null; den: number | null },
  sau: readonly (string | number)[] | null,
  limit: number,
): { sql: string; bind: (string | number)[] } {
  const pham_vi = locPhamViCanChu(ai);
  const them = veLoc(loc);

  const dieu_kien = ['ct.workspace_id = ?', 'ct.xu_ly_luc IS NOT NULL'];
  const bind: (string | number)[] = [workspace_id];

  if (khoang.tu !== null) {
    dieu_kien.push('ct.xu_ly_luc >= ?');
    bind.push(khoang.tu);
  }
  if (khoang.den !== null) {
    // `<` (nửa mở), không `<=`: `khoangNgay` đã đẩy biên sang nửa đêm hôm sau.
    dieu_kien.push('ct.xu_ly_luc < ?');
    bind.push(khoang.den);
  }
  if (pham_vi.sql !== '') {
    dieu_kien.push(pham_vi.sql);
    bind.push(...pham_vi.bind);
  }
  dieu_kien.push(...them.sql);
  bind.push(...them.bind);

  if (sau !== null) {
    dieu_kien.push('(ct.xu_ly_luc, ct.id) < (?, ?)');
    bind.push(Number(sau[0]), String(sau[1]));
  }

  bind.push(limit);
  return {
    sql: `SELECT ct.id AS id, ct.ma_so AS ma_so, ct.tieu_de AS tieu_de,
              ct.trang_thai AS trang_thai, ct.loai AS loai, ct.project_id AS project_id,
              ct.ket_qua AS ket_qua, ct.ly_do_bo_qua AS ly_do_bo_qua,
              ct.ket_luan_review AS ket_luan_review, ct.xu_ly_luc AS xu_ly_luc
         FROM can_chu ct
        WHERE ${dieu_kien.join(' AND ')}
        ORDER BY ct.xu_ly_luc DESC, ct.id DESC LIMIT ?`,
    bind,
  };
}

/**
 * Thân của `GET /v1/can-chu/da-xu-ly` — một trang của bảng d.251, kèm mốc "bây
 * giờ" **của máy chủ**.
 *
 * `bay_gio` có mặt vì **mục 14 d.412** cũng áp cho bảng này: nó là một phần của
 * chính màn hình Cần Chủ (d.251), nên ô thời gian của nó phải hiện chữ **tương
 * đối** ("12 phút trước") đếm từ **một** mốc. Mốc đó là mốc máy chủ, cùng trường
 * và cùng tên với `ManHinhCanChu.bay_gio` / `TongQuan.bay_gio`: để giao diện tự
 * đọc `Date.now()` là đặt một đồng hồ thứ hai cạnh ba khối ở trên, và một máy
 * lệch giờ sẽ viết "2 giờ trước" cho một mục máy chủ vừa xử lý xong.
 */
export interface BangDaXuLyRa extends TrangKetQua<DongDaXuLy> {
  bay_gio: number;
}

export async function bangDaXuLy(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
  yeu_cau: LocDaXuLy = {},
): Promise<BangDaXuLyRa> {
  const limit = kiemLimit(yeu_cau.limit);
  // Khoảng **ngày trên tường** → mốc epoch, qua đúng một chỗ (19.12 câu 60).
  const khoang = khoangNgay(yeu_cau.tu_ngay ?? null, yeu_cau.den_ngay ?? null);

  let sau: readonly (string | number)[] | null = null;
  if (yeu_cau.cursor !== undefined) sau = moCursor(yeu_cau.cursor, 2);

  const cau = cauDaXuLy(ai, workspace_id, yeu_cau, khoang, sau, limit + 1);
  const { results } = await db
    .prepare(cau.sql)
    .bind(...cau.bind)
    .all<DongDaXuLyTho>();

  const trang = dungTrang(
    results,
    limit,
    (d) => ({
      id: d.id,
      ma: maCanChu(d.ma_so),
      ngay: ngayDiaPhuong(d.xu_ly_luc),
      xu_ly_luc: d.xu_ly_luc,
      tieu_de: d.tieu_de,
      tieu_de_ngan: tieuDeNgan(d.tieu_de),
      ket_qua: d.ket_qua ?? d.ly_do_bo_qua ?? '',
      trang_thai: d.trang_thai,
      loai: d.loai,
      project_id: d.project_id,
      ket_luan_review: d.ket_luan_review,
    }),
    (d) => [d.xu_ly_luc, d.id],
  );
  // `bay_gio` là mốc **truyền vào**, không một `Date.now()` ẩn trong thân hàm.
  return { ...trang, bay_gio };
}

/** Xem `DAI_TIEU_DE_NGAN`. Cắt theo **ký tự**, không byte. */
export function tieuDeNgan(tieu_de: string): string {
  const chu = [...tieu_de];
  if (chu.length <= DAI_TIEU_DE_NGAN) return tieu_de;
  return `${chu.slice(0, DAI_TIEU_DE_NGAN).join('')}…`;
}

/* ------------------------------------------------------------------ *
 * (d) Một thẻ đầy đủ — d.250
 * ------------------------------------------------------------------ */

/** Một phương án trên thẻ — d.250 ("phương án thành nút, phương án đề xuất có nhãn"). */
export interface PhuongAnTheRa extends PhuongAnDaChonRa {
  nhan: string;
  thu_tu: number;
  /** d.250: "phương án **đề xuất** có nhãn 'Đề xuất'". */
  de_xuat: boolean;
}

/** Một file hoặc link của mục `review` — d.238, d.250 ("file có link"). */
export interface FileTheRa {
  loai: 'file' | 'link';
  dia_chi: string;
  thu_tu: number;
}

/** Một ticket liên quan — d.240, d.250. */
export interface TicketTheRa {
  id: string;
  /** `<MÃ DỰ ÁN>-<số>`, đúng hình mã ticket của SPEC mục 4. */
  ma: string;
  tieu_de: string;
}

/** Dự án của thẻ — d.250 ("mỗi thẻ hiện đủ: mã, **dự án**, …"). */
export interface DuAnTheRa {
  id: string;
  ten: string;
  ma: string;
}

/**
 * **Một thẻ của d.250** — mọi vế của câu đó, không thiếu vế nào:
 * mã (`ma`), dự án (`du_an`), loại (`loai`), tiêu đề (`tieu_de`), bối cảnh
 * (`boi_canh`), phương án + phương án nào là đề xuất (`phuong_an`, cờ `de_xuat` và
 * `phuong_an_de_xuat_id`), lệnh (`lenh`, `can_tty`), file (`file`), ticket liên
 * quan (`ticket_lien_quan`).
 *
 * "Bối cảnh **mặc định gập sau 6 dòng**" của d.250 là một luật **hiển thị** (phần
 * 6): server trả nguyên văn, không cắt, vì gập là thứ mở lại được còn cắt thì
 * không.
 */
export interface TheCanChu extends MucCanChuRa {
  du_an: DuAnTheRa | null;
  /** 19.8 — dẫn xuất, xem `quaHan`. */
  qua_han: boolean;
  /** "quá hạn **X giờ**" của d.249; `null` khi chưa quá hạn — xem `gioQuaHan`. */
  qua_han_gio: number | null;
  phuong_an: PhuongAnTheRa[];
  /** Phương án **đề xuất**; `null` với mục không phải `decision`. */
  phuong_an_de_xuat_id: string | null;
  file: FileTheRa[];
  ticket_lien_quan: TicketTheRa[];
}

/**
 * Dựng thẻ cho **cả một trang**: bốn câu truy vấn cho `n` thẻ, không `4n`.
 *
 * `IN (…)` trên đúng các id của trang — cùng nếp `canCuCuaCacDong` của mục 10.
 * Một vòng `for` gọi bốn truy vấn cho mỗi thẻ là 4 × 50 = 200 lần đọc D1 cho một
 * lần mở màn hình.
 */
async function theCuaCacDong(
  db: D1Database,
  workspace_id: string,
  dong: readonly DongTho[],
  bay_gio: number,
): Promise<TheCanChu[]> {
  if (dong.length === 0) return [];
  const ids = dong.map((d) => d.id);

  /*
   * Chia lô (`chia-lo-tham-so.ts`): trang Cần Chủ lấy tới 200 mục
   * (`LIMIT_TRANG_TOI_DA`), vượt trần 100 tham số của D1. Cả ba câu có 1 tham số
   * khác (`workspace_id`). Mỗi câu sắp `ORDER BY can_chu_id, …` và được `gom`
   * theo `can_chu_id` — thứ tự chỉ cần đúng **trong một mục**, và mỗi mục nằm
   * trọn một lô ⇒ gộp các lô giữ nguyên thứ tự phương án / file / ticket.
   */
  const [pa, file, tk, du_an] = await Promise.all([
    chayTheoLo(ids, 1, async (lo, cho) => {
      const r = await db
        .prepare(
          `SELECT can_chu_id, id, nhan, noi_dung, de_xuat, thu_tu FROM can_chu_phuong_an
            WHERE workspace_id = ? AND can_chu_id IN (${cho}) ORDER BY can_chu_id, thu_tu`,
        )
        .bind(workspace_id, ...lo)
        .all<{
          can_chu_id: string;
          id: string;
          nhan: string;
          noi_dung: string;
          de_xuat: number;
          thu_tu: number;
        }>();
      return r.results;
    }),
    chayTheoLo(ids, 1, async (lo, cho) => {
      const r = await db
        .prepare(
          `SELECT can_chu_id, loai, dia_chi, thu_tu FROM can_chu_file
            WHERE workspace_id = ? AND can_chu_id IN (${cho}) ORDER BY can_chu_id, thu_tu`,
        )
        .bind(workspace_id, ...lo)
        .all<{ can_chu_id: string; loai: 'file' | 'link'; dia_chi: string; thu_tu: number }>();
      return r.results;
    }),
    chayTheoLo(ids, 1, async (lo, cho) => {
      const r = await db
        .prepare(
          `SELECT ctt.can_chu_id AS can_chu_id, t.id AS id, t.so AS so, t.tieu_de AS tieu_de,
                  p.ma AS du_an_ma
             FROM can_chu_ticket ctt
             JOIN ticket t  ON t.id = ctt.ticket_id AND t.workspace_id = ctt.workspace_id
             JOIN project p ON p.id = t.project_id  AND p.workspace_id = t.workspace_id
            WHERE ctt.workspace_id = ? AND ctt.can_chu_id IN (${cho})
            ORDER BY ctt.can_chu_id, t.so`,
        )
        .bind(workspace_id, ...lo)
        .all<{ can_chu_id: string; id: string; so: number; tieu_de: string; du_an_ma: string }>();
      return r.results;
    }),
    duAnCuaCacMuc(db, workspace_id, dong),
  ]);

  const gom = <T extends { can_chu_id: string }>(ds: readonly T[]): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of ds) {
      const ds_cu = m.get(r.can_chu_id) ?? [];
      ds_cu.push(r);
      m.set(r.can_chu_id, ds_cu);
    }
    return m;
  };
  const m_pa = gom(pa);
  const m_file = gom(file);
  const m_tk = gom(tk);

  return dong.map((d) => {
    const phuong_an: PhuongAnTheRa[] = (m_pa.get(d.id) ?? []).map((r) => ({
      id: r.id,
      nhan: r.nhan,
      noi_dung: r.noi_dung,
      thu_tu: r.thu_tu,
      de_xuat: r.de_xuat === 1,
    }));
    return {
      ...raMuc(d),
      du_an: d.project_id === null ? null : (du_an.get(d.project_id) ?? null),
      qua_han: quaHan(d.han_luc, bay_gio),
      qua_han_gio: gioQuaHan(d.han_luc, bay_gio),
      phuong_an,
      phuong_an_de_xuat_id: phuong_an.find((p) => p.de_xuat)?.id ?? null,
      file: (m_file.get(d.id) ?? []).map((r) => ({
        loai: r.loai,
        dia_chi: r.dia_chi,
        thu_tu: r.thu_tu,
      })),
      ticket_lien_quan: (m_tk.get(d.id) ?? []).map((r) => ({
        id: r.id,
        ma: `${r.du_an_ma}-${String(r.so)}`,
        tieu_de: r.tieu_de,
      })),
    };
  });
}

/** Dự án của các mục **có** dự án — một câu, và bỏ qua hẳn nếu cả trang là Chung. */
async function duAnCuaCacMuc(
  db: D1Database,
  workspace_id: string,
  dong: readonly DongTho[],
): Promise<Map<string, DuAnTheRa>> {
  const ra = new Map<string, DuAnTheRa>();
  const ids = [...new Set(dong.map((d) => d.project_id).filter((p): p is string => p !== null))];
  if (ids.length === 0) return ra;

  // Chia lô (`chia-lo-tham-so.ts`): 1 tham số khác (`workspace_id`); bảng tra theo id.
  const results = await chayTheoLo(ids, 1, async (lo, cho) => {
    const r = await db
      .prepare(`SELECT id, ten, ma FROM project WHERE workspace_id = ? AND id IN (${cho})`)
      .bind(workspace_id, ...lo)
      .all<DuAnTheRa>();
    return r.results;
  });
  for (const r of results) ra.set(r.id, r);
  return ra;
}

/* ------------------------------------------------------------------ *
 * (d2) Mục Cần Chủ LIÊN QUAN MỘT TICKET — d.401
 * ------------------------------------------------------------------ */

/**
 * **"Mục Cần Chủ liên quan"** của chi tiết ticket — SPEC mục 14 d.401.
 *
 * Trả về **thẻ đầy đủ** (`TheCanChu`), không một bản rút gọn: d.401 đặt mục này
 * trên chính màn hình mà d.250 đã chốt hình một thẻ, và giao diện dùng lại đúng
 * component `The` của trang Cần Chủ — một hình thứ hai ở đây sẽ buộc component đó
 * nhận hai kiểu, tức hai nhánh vẽ cho một thẻ.
 *
 * Chỉ mục **đang Chờ** (`open`): một mục đã xử lý xong không còn "cần Chủ", và
 * lịch sử của nó đã nằm trong bình luận ticket (mục 8 d.266 — xử lý mục thì tự
 * bình luận vào ticket liên quan).
 *
 * Thứ tự: mức khẩn (🔴 → 🟡 → ⚪) rồi hạn rồi lúc tạo — **cùng** thứ tự d.249 của
 * ba khối, để hai màn hình không xếp cùng một tập mục theo hai kiểu.
 *
 * Phạm vi đi qua `locPhamViCanChu` như mọi đường đọc khác của mục 8; phạm vi
 * **ticket** đã do `layTicket` quyết trước đó ở tầng gọi.
 */
export async function canChuCuaTicket(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  ticket_id: string,
  bay_gio: number,
): Promise<TheCanChu[]> {
  const pham_vi = locPhamViCanChu(ai);
  const { results } = await db
    .prepare(
      `SELECT ${COT_MUC} ${TU_MUC}
        WHERE ct.workspace_id = ? AND ct.trang_thai = 'open'
          AND EXISTS (SELECT 1 FROM can_chu_ticket ctt
                       WHERE ctt.workspace_id = ct.workspace_id AND ctt.can_chu_id = ct.id
                         AND ctt.ticket_id = ?)
          ${pham_vi.sql === '' ? '' : `AND ${pham_vi.sql}`}
        ORDER BY CASE ct.muc WHEN 'urgent' THEN 0 WHEN 'today' THEN 1 ELSE 2 END,
                 ct.han_luc IS NULL, ct.han_luc, ct.tao_luc, ct.id`,
    )
    .bind(workspace_id, ticket_id, ...pham_vi.bind)
    .all<DongTho>();

  return await theCuaCacDong(db, workspace_id, results, bay_gio);
}

/* ------------------------------------------------------------------ *
 * (e) Cả màn hình — d.248–252
 * ------------------------------------------------------------------ */

/** Một khối của d.249, kèm mức của nó. */
export interface KhoiCanChu extends TrangKetQua<TheCanChu> {
  muc: MucDoKhan;
}

/** Màn hình Cần Chủ — d.248–252. */
export interface ManHinhCanChu {
  huy_hieu: HuyHieuCanChu;
  /** **Đúng ba** khối, đúng thứ tự 🔴 → 🟡 → ⚪ của d.249 (`MUC_THEO_DO_KHAN`). */
  khoi: KhoiCanChu[];
  /**
   * Mốc "bây giờ" **của máy chủ**, mili-giây.
   *
   * d.412 đòi thời gian hiện dạng **tương đối** ("12 phút trước"), rê chuột thấy
   * giờ đầy đủ. Vế tương đối phải đo từ **một** mốc, và mốc đó là mốc máy chủ đã
   * dùng để tính `qua_han` / `qua_han_gio` của từng thẻ — nếu giao diện tự lấy
   * `Date.now()` của **máy khách** thì một đồng hồ lệch sẽ cho ra "còn 2 giờ"
   * cạnh một thẻ máy chủ đã đánh dấu quá hạn. Cùng trường, cùng tên với
   * `TongQuan.bay_gio`.
   */
  bay_gio: number;
}

/**
 * **Màn hình Cần Chủ** của d.248–252 trong một lần gọi: huy hiệu + ba khối.
 *
 * Bảng "Đã xử lý" (d.251) **không** nằm trong đây, có chủ ý: nó có bộ lọc riêng
 * (khoảng ngày) và phân trang riêng, nên gộp vào sẽ buộc mọi lần cuộn ba khối
 * phải tải lại nó. Đường riêng là `bangDaXuLy`.
 */
export async function manHinhCanChu(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
  yeu_cau: YeuCauKhoiCanChu = {},
): Promise<ManHinhCanChu> {
  // Bộ lọc kiểm **một lần, trước mọi truy vấn**: một `loai` lạ phải ra
  // `INVALID_INPUT` chứ không "huy hiệu xanh, ba khối rỗng".
  veLoc(yeu_cau);

  const huy_hieu = await huyHieuCanChu(db, ai, workspace_id, yeu_cau);
  const trang = await Promise.all(
    MUC_THEO_DO_KHAN.map((m) => khoiCho(db, ai, workspace_id, m, bay_gio, yeu_cau)),
  );

  return {
    huy_hieu,
    khoi: MUC_THEO_DO_KHAN.map((m, i) => ({ muc: m, ...trang[i]! })),
    bay_gio,
  };
}
