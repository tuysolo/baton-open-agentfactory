/**
 * Đường **ĐỌC** về lượt giao — SPEC mục 5 ("thấy cả chuỗi việc được chuyền"),
 * 19.1 (người đang cầm).
 *
 * Hai việc:
 *   1. **Chuỗi lượt giao của một ticket**, sắp theo `so_luot` (mục 5, mục 14
 *      "chuỗi lượt giao dạng dòng thời gian").
 *   2. **Bối cảnh người đang cầm** (`BoiCanhNguoiCam` của `@baton/shared`): ba
 *      bậc đầu của SPEC 19.1 lấy dữ liệu từ bảng `luot_giao`. Luật vẫn nằm trọn
 *      trong `nguoiDangCam`; file này chỉ là nguồn dữ liệu.
 *
 * Phạm vi đọc không kiểm ở đây: tầng gọi (`layTicket`) đã quyết ticket nào agent
 * đọc được, và ngoài phạm vi thì trả `NOT_FOUND` (SPEC mục 13). Lượt giao không
 * có phạm vi riêng khác ticket của nó.
 */

import {
  MUC_BAO_CAO,
  laKhongPhanHoi,
  nhan,
  tiLeDatLanDau,
  type BaoCaoNop,
  type BoiCanhNguoiCam,
  type KetQuaNop,
  type LoaiLuotGiao,
  type LuotChoTiLe,
  type TacGia,
  type TiLeDatLanDau,
  type TrangThaiLuotGiao,
} from '@baton/shared';
import { chiaLoThamSo, dauHoi } from './chia-lo-tham-so.js';

/* ------------------------------------------------------------------ *
 * Bối cảnh người đang cầm — SPEC 19.1 bậc 1–3
 * ------------------------------------------------------------------ */

interface DongNguoiCam {
  ticket_id: string;
  loai: LoaiLuotGiao;
  trang_thai: TrangThaiLuotGiao;
  so_luot: number;
  nguoi_giao_loai: string;
  nguoi_giao_agent_id: string | null;
  nguoi_nhan_agent_id: string;
}

function tacGiaNguoiGiao(d: DongNguoiCam): TacGia {
  return d.nguoi_giao_loai === 'agent' && d.nguoi_giao_agent_id !== null
    ? { loai: 'agent', agentId: d.nguoi_giao_agent_id }
    : { loai: 'owner' };
}

/**
 * Bối cảnh người đang cầm cho **nhiều ticket một lần** — danh sách ticket (SPEC
 * mục 13 `baton list`, mục 14) phải tránh N+1 ở mốc 200.000 ticket, nên một câu
 * truy vấn cho cả trang.
 *
 * Chỉ lấy ba trạng thái mà SPEC 19.1 cần: hai trạng thái **mở** (`pending`,
 * `in_progress`) cho bậc 1–2, và `submitted` cho bậc 3 ("chờ … nghiệm thu").
 * Nhiều lượt `submitted` thì lấy lượt **mới nhất** theo `so_luot`.
 */
export async function boiCanhNguoiCamNhieu(
  db: D1Database,
  workspace_id: string,
  ticket_ids: readonly string[],
): Promise<Map<string, BoiCanhNguoiCam>> {
  const ra = new Map<string, BoiCanhNguoiCam>();

  /*
   * **Chia lô** (`chia-lo-tham-so.ts`, bỏ trùng ở đó). D1 giới hạn số tham số
   * bind của một câu lệnh (100); một trang danh sách ticket lấy tối đa
   * `LIMIT_TRANG_TOI_DA` = 200 dòng, nên một câu `IN (?, ?, …)` cho cả trang sẽ
   * vỡ với `too many SQL variables`. 1 tham số khác (`workspace_id`).
   *
   * `ORDER BY so_luot` là toàn cục trong **một** lô, nhưng vòng gom dưới chỉ cần
   * thứ tự `so_luot` **trong một ticket** (dòng sau ghi đè dòng trước), và mỗi
   * ticket nằm trọn một lô ⇒ nối các lô theo thứ tự lô giữ đúng nghĩa.
   */
  const results: DongNguoiCam[] = [];
  for (const lo of chiaLoThamSo(ticket_ids, 1)) {
    const cho = dauHoi(lo);
    const r = await db
      .prepare(
        `SELECT ticket_id, loai, trang_thai, so_luot,
                nguoi_giao_loai, nguoi_giao_agent_id, nguoi_nhan_agent_id
           FROM luot_giao
          WHERE workspace_id = ? AND ticket_id IN (${cho})
            AND trang_thai IN ('pending', 'in_progress', 'submitted')
          ORDER BY so_luot`,
      )
      .bind(workspace_id, ...lo)
      .all<DongNguoiCam>();
    results.push(...r.results);
  }

  for (const d of results) {
    const hien = ra.get(d.ticket_id) ?? {};
    if (d.trang_thai === 'submitted') {
      // Sắp theo `so_luot` tăng dần nên dòng sau ghi đè dòng trước = lượt mới nhất.
      hien.nguoi_giao_luot_submitted = tacGiaNguoiGiao(d);
    } else if (d.loai === 'review') {
      hien.luot_review_mo = { loai: 'agent', agentId: d.nguoi_nhan_agent_id };
    } else {
      hien.luot_worker_mo = { loai: 'agent', agentId: d.nguoi_nhan_agent_id };
    }
    ra.set(d.ticket_id, hien);
  }
  return ra;
}

/* ------------------------------------------------------------------ *
 * Vế SQL "người đang cầm LÀ ai" — SPEC 19.1, bộ lọc của mục 14 d.396
 * ------------------------------------------------------------------ */

/**
 * `AiCam`: giá trị mà bộ lọc "**người đang cầm**" của d.396 nhận — chủ, hoặc một
 * agent cụ thể.
 */
export type AiCam = { loai: 'owner' } | { loai: 'agent'; agent_id: string };

/**
 * **Vế `WHERE` cho "người đang cầm ticket này là `ai`"** — SPEC 19.1, dùng bởi bộ
 * lọc danh sách của mục 14 d.396.
 *
 * ## Vì sao vế này phải nằm trong SQL, và vì sao nó nằm ở ĐÂY
 *
 * `nguoi_dang_cam` là một giá trị **dẫn xuất** (mục 4: "tự tính từ mục 5, không
 * sửa tay"), không một cột. Lọc nó **sau** truy vấn thì phân trang keyset vỡ: một
 * trang 50 dòng có thể còn 0 dòng sau khi lọc, và giao diện sẽ thấy "hết ticket"
 * trong khi còn 199.950 dòng chưa xét (mốc 200.000 của 19.12 câu 1). Nên nó phải
 * là một vế SQL.
 *
 * Vế đó là **bản dịch của `nguoiDangCam`**, tức một bản luật thứ hai — điều dự án
 * này vẫn tránh. Hai thứ giữ cho nó không trôi:
 *
 *   1. Nó nằm **cạnh** `boiCanhNguoiCamNhieu`, chỗ duy nhất khác đã dịch 19.1
 *      sang SQL, nên hai bản dịch ở trong tầm mắt của nhau.
 *   2. `test/nguoi-cam.test.ts` có ca **đối chiếu**: với một tập ticket phủ cả
 *      năm bậc, tập mà bộ lọc trả về phải **trùng khít** tập mà trường
 *      `nguoi_dang_cam` (do `nguoiDangCam` tính) nói là của người đó. Lệch một
 *      bậc ⇒ đỏ.
 *
 * ## Dùng truy vấn con "lượt mới nhất", không `EXISTS`
 *
 * `boiCanhNguoiCamNhieu` sắp theo `so_luot` **tăng** rồi để dòng sau ghi đè dòng
 * trước, nghĩa là **lượt `so_luot` lớn nhất thắng** trong mỗi bậc. Một
 * `EXISTS(... nguoi_nhan_agent_id = ?)` sẽ nói "đúng" cho **cả hai** agent khi một
 * ticket có hai lượt worker mở — và lúc đó bộ lọc trả một ticket mà trường
 * `nguoi_dang_cam` của chính nó nói là của người khác.
 */
export function veNguoiDangCamLa(ai: AiCam): { sql: string; bind: (string | number)[] } {
  const con = (cot: string, them: string): string =>
    `(SELECT lg.${cot} FROM luot_giao lg
        WHERE lg.workspace_id = ticket.workspace_id AND lg.ticket_id = ticket.id ${them}
        ORDER BY lg.so_luot DESC LIMIT 1)`;

  const MO = "lg.trang_thai IN ('pending', 'in_progress')";
  // Bậc 1–3 của 19.1, đúng ba truy vấn con.
  const review = con('nguoi_nhan_agent_id', `AND ${MO} AND lg.loai = 'review'`);
  const worker = con('nguoi_nhan_agent_id', `AND ${MO} AND lg.loai <> 'review'`);
  const nop_loai = con('nguoi_giao_loai', "AND lg.trang_thai = 'submitted'");
  const nop_agent = con('nguoi_giao_agent_id', "AND lg.trang_thai = 'submitted'");

  if (ai.loai === 'agent') {
    return {
      sql:
        `(${review} = ?` +
        ` OR (${review} IS NULL AND ${worker} = ?)` +
        ` OR (${review} IS NULL AND ${worker} IS NULL` +
        `     AND ${nop_loai} = 'agent' AND ${nop_agent} = ?))`,
      bind: [ai.agent_id, ai.agent_id, ai.agent_id],
    };
  }

  /*
   * Chủ cầm ở **hai** ca: bậc 3 khi lượt `submitted` mới nhất do **chủ** giao, và
   * bậc 4 khi chủ bấm "Tôi làm" mà không có lượt nào. Bậc 4 **phải** đứng sau bậc
   * 3 (`nop_loai IS NULL`): một ticket chủ tự làm rồi giao cho agent và agent đã
   * nộp thì người cầm là người giao của lượt đó, không phải "chủ vì `chu_tu_lam`".
   */
  return {
    sql:
      `(${review} IS NULL AND ${worker} IS NULL` +
      ` AND (${nop_loai} = 'owner' OR (${nop_loai} IS NULL AND ticket.chu_tu_lam = 1)))`,
    bind: [],
  };
}

/** Bối cảnh người đang cầm của **một** ticket — SPEC 19.1. */
export async function boiCanhNguoiCamCua(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
): Promise<BoiCanhNguoiCam> {
  const bang = await boiCanhNguoiCamNhieu(db, workspace_id, [ticket_id]);
  return bang.get(ticket_id) ?? {};
}

/* ------------------------------------------------------------------ *
 * Chuỗi lượt giao của một ticket — SPEC mục 5, 14
 * ------------------------------------------------------------------ */

export interface LuotGiaoRa {
  id: string;
  ticket_id: string;
  so_luot: number;
  loai: LoaiLuotGiao;
  nhan_loai: string;
  trang_thai: TrangThaiLuotGiao;
  nhan_trang_thai: string;
  /** Lượt còn **mở** (`pending`/`in_progress`) — SPEC 19.1. */
  dang_mo: boolean;
  /**
   * "Không phản hồi" — SPEC mục 5: quá hạn phản hồi mà chưa nhận. **Giá trị tính
   * được**, không phải trạng thái thứ 7, và lượt **không tự huỷ**.
   */
  khong_phan_hoi: boolean;
  nguoi_giao: TacGia;
  nguoi_nhan: TacGia;
  brief: Record<string, string | null>;
  /**
   * **Báo cáo nộp** — SPEC mục 5. `null` khi lượt chưa nộp.
   *
   * Phải có ở đường đọc này: mục 5 nói người dùng "thấy cả chuỗi… kèm brief gì,
   * **kết quả ra sao**", và mục 14 vẽ chuỗi đó thành dòng thời gian. Chuỗi mà
   * chỉ có trạng thái thì không ai đọc được việc đã làm tới đâu.
   */
  bao_cao: (BaoCaoNop & { ket_qua: KetQuaNop; nhan_ket_qua: string; nop_luc: number | null }) | null;
  han_phan_hoi_luc: number | null;
  /**
   * **Kết quả nghiệm thu**: lý do trả lại (SPEC mục 5 "bắt buộc có lý do"), hoặc
   * lý do huỷ. Trạng thái `accepted`/`returned`/`canceled` nằm ở `trang_thai`.
   */
  ly_do: string | null;
  luot_truoc_id: string | null;
  tao_luc: number;
  nhan_luc: number | null;
  nop_luc: number | null;
  dong_luc: number | null;
  cap_nhat_luc: number;
}

const TRUONG_BRIEF_LUOT = [
  'muc_tieu',
  'boi_canh',
  'pham_vi',
  'file_va_nguon',
  'dieu_cam',
  'xong_la_gi',
  'cach_kiem_chung',
  'nop_lai',
] as const;

export const COT_LUOT_GIAO = `id, ticket_id, so_luot, loai, trang_thai,
   nguoi_giao_loai, nguoi_giao_agent_id, nguoi_nhan_agent_id,
   ${TRUONG_BRIEF_LUOT.join(', ')},
   ket_qua, ${MUC_BAO_CAO.map((m) => `bc_${m}`).join(', ')},
   han_phan_hoi_luc, ly_do, luot_truoc_id,
   tao_luc, nhan_luc, nop_luc, dong_luc, cap_nhat_luc`;

/**
 * `COT_LUOT_GIAO` **có tiền tố bảng**, cho các câu có `JOIN`.
 *
 * Bắt buộc, không phải trang trí: `ticket` và `project` cũng có `trang_thai`,
 * `tao_luc`, `cap_nhat_luc`, `ma` — nên một danh sách cột **không** tiền tố trong
 * câu ba bảng là `ambiguous column name` của SQLite. Sinh từ **chính**
 * `COT_LUOT_GIAO` thay vì gõ lại: thêm một cột vào bảng `luot_giao` ở lượt sau mà
 * quên danh sách thứ hai là một bảng lịch sử thiếu cột, âm thầm.
 */
export const COT_LUOT_GIAO_QUA = (bang: string): string =>
  COT_LUOT_GIAO.split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '')
    .map((c) => `${bang}.${c} AS ${c}`)
    .join(', ');

export type DongLuotGiao = DongNguoiCam & {
  id: string;
  ket_qua: KetQuaNop | null;
  han_phan_hoi_luc: number | null;
  ly_do: string | null;
  luot_truoc_id: string | null;
  tao_luc: number;
  nhan_luc: number | null;
  nop_luc: number | null;
  dong_luc: number | null;
  cap_nhat_luc: number;
} & Record<(typeof TRUONG_BRIEF_LUOT)[number], string | null> &
  Record<`bc_${(typeof MUC_BAO_CAO)[number]}`, string | null>;

export function raLuotGiao(d: DongLuotGiao, bay_gio: number): LuotGiaoRa {
  const brief: Record<string, string | null> = {};
  for (const t of TRUONG_BRIEF_LUOT) brief[t] = d[t];

  /*
   * Báo cáo chỉ tồn tại khi đã nộp. Mốc là `ket_qua`, không phải `trang_thai`:
   * `ket_qua` là trường duy nhất **bắt buộc** của báo cáo (SPEC mục 5), nên nó
   * khác `null` đúng khi và chỉ khi lượt này đã đi qua lệnh nộp.
   */
  let bao_cao: LuotGiaoRa['bao_cao'] = null;
  if (d.ket_qua !== null) {
    const muc = {} as BaoCaoNop;
    for (const m of MUC_BAO_CAO) muc[m] = d[`bc_${m}`];
    bao_cao = {
      ...muc,
      ket_qua: d.ket_qua,
      nhan_ket_qua: nhan('ket_qua_nop', d.ket_qua),
      nop_luc: d.nop_luc,
    };
  }

  return {
    id: d.id,
    ticket_id: d.ticket_id,
    so_luot: d.so_luot,
    loai: d.loai,
    nhan_loai: nhan('loai_luot_giao', d.loai),
    trang_thai: d.trang_thai,
    nhan_trang_thai: nhan('trang_thai_luot_giao', d.trang_thai),
    dang_mo: d.trang_thai === 'pending' || d.trang_thai === 'in_progress',
    khong_phan_hoi: laKhongPhanHoi(
      { trang_thai: d.trang_thai, han_phan_hoi_luc: d.han_phan_hoi_luc },
      bay_gio,
    ),
    nguoi_giao: tacGiaNguoiGiao(d),
    nguoi_nhan: { loai: 'agent', agentId: d.nguoi_nhan_agent_id },
    brief,
    bao_cao,
    han_phan_hoi_luc: d.han_phan_hoi_luc,
    ly_do: d.ly_do,
    luot_truoc_id: d.luot_truoc_id,
    tao_luc: d.tao_luc,
    nhan_luc: d.nhan_luc,
    nop_luc: d.nop_luc,
    dong_luc: d.dong_luc,
    cap_nhat_luc: d.cap_nhat_luc,
  };
}

/**
 * **Chuỗi lượt giao của một ticket**, sắp theo `so_luot` — SPEC mục 5.
 *
 * Không phân trang: số lượt trên một ticket là vài cái, không phải vài nghìn, và
 * mục 14 vẽ cả chuỗi thành một dòng thời gian nên cắt trang chỉ làm hỏng nó.
 *
 * `bay_gio` vào qua tham số để "Không phản hồi" test được bằng giờ tiêm vào.
 */
export async function luotGiaoCuaTicket(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  bay_gio: number,
): Promise<LuotGiaoRa[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COT_LUOT_GIAO} FROM luot_giao
        WHERE workspace_id = ? AND ticket_id = ? ORDER BY so_luot`,
    )
    .bind(workspace_id, ticket_id)
    .all<DongLuotGiao>();

  return results.map((d) => raLuotGiao(d, bay_gio));
}

/* ------------------------------------------------------------------ *
 * Lịch sử lượt giao của một AGENT — SPEC mục 3 d.104 ("dạng bảng")
 * ------------------------------------------------------------------ */

/**
 * Một dòng của bảng lịch sử lượt giao trên trang agent.
 *
 * Mang theo **mã và tiêu đề ticket**, vì một bảng chỉ có `ticket_id` thì không
 * đọc được: d.104 đòi "lịch sử lượt giao (dạng bảng)" cho **người** đọc, và mã
 * ticket là thứ chủ gọi tên việc (mục 4). Một lượt đọc thứ hai cho mỗi dòng là
 * N+1 ở đúng bảng ghi nóng nhất của phần 2, nên mã lấy bằng `JOIN`.
 */
export interface LuotGiaoCuaAgentRa extends LuotGiaoRa {
  ticket_ma: string;
  ticket_tieu_de: string;
}

/**
 * **Trần số dòng** của bảng lịch sử. Không phân trang ở lượt này: d.104 vẽ một
 * bảng trên một trang, và số lượt một agent từng nhận là hàng nghìn, không hàng
 * trăm nghìn. Trần là hàng rào chống một màn hình treo, và nó có tên nên một lần
 * thêm phân trang chỉ sửa đúng chỗ này.
 */
export const TRAN_LUOT_GIAO_AGENT = 100;

/**
 * Lịch sử lượt giao của một agent — **mới nhất trước**.
 *
 * Thứ tự `(tao_luc DESC, id DESC)` là thứ tự **toàn phần**: hai lượt tạo cùng
 * mili-giây (fixture, hoặc một lô ghi trong cùng batch) vẫn có thứ tự xác định,
 * nên một ca ghim thứ tự không nháy theo lần chạy (bài học `phan-trang.test.ts`).
 *
 * Gồm **cả** lượt `review`: d.104 nói "lịch sử lượt giao", không chừa loại nào,
 * và một reviewer sẽ có bảng rỗng nếu lọc `loai = 'work'`. Tỉ lệ đạt lần đầu thì
 * **chỉ** `work`, đúng chữ 19.5 — hai luật khác nhau, hai câu truy vấn.
 */
export async function luotGiaoCuaAgent(
  db: D1Database,
  workspace_id: string,
  agent_id: string,
  bay_gio: number,
  tran: number = TRAN_LUOT_GIAO_AGENT,
): Promise<LuotGiaoCuaAgentRa[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COT_LUOT_GIAO_QUA('lg')},
              pr.ma || '-' || t.so AS ticket_ma, t.tieu_de AS ticket_tieu_de
         FROM luot_giao lg
         JOIN ticket t ON t.id = lg.ticket_id AND t.workspace_id = lg.workspace_id
         JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = lg.workspace_id
        WHERE lg.workspace_id = ? AND lg.nguoi_nhan_agent_id = ?
        ORDER BY lg.tao_luc DESC, lg.id DESC
        LIMIT ?`,
    )
    .bind(workspace_id, agent_id, Math.trunc(tran))
    .all<DongLuotGiao & { ticket_ma: string; ticket_tieu_de: string }>();

  return results.map((d) => ({
    ...raLuotGiao(d, bay_gio),
    ticket_ma: d.ticket_ma,
    ticket_tieu_de: d.ticket_tieu_de,
  }));
}

/* ------------------------------------------------------------------ *
 * Tỉ lệ đạt lần đầu — SPEC 19.5 (hiện ở trang agent, mục 3)
 * ------------------------------------------------------------------ */

/**
 * **Tỉ lệ đạt lần đầu** của một agent, 30 ngày gần nhất — SPEC 19.5.
 *
 * Luật nằm trọn trong hàm thuần `tiLeDatLanDau` của `@baton/shared` (`bay_gio`
 * qua tham số, không `Date.now()`); ở đây chỉ là nguồn dữ liệu.
 *
 * Truy vấn lọc theo `(workspace_id, nguoi_nhan_agent_id)` nên nằm trong tiền tố
 * của `ix_luot_giao_nguoi_nhan` (0004); `nop_luc IS NOT NULL` lọc sau khi tìm.
 * **Không thêm index** cho nó: số lượt một agent từng nhận là hàng nghìn, không
 * phải hàng trăm nghìn, và `luot_giao` là bảng ghi nóng nhất của phần 2.
 *
 * Cửa sổ 30 ngày **không** lọc trong SQL mà để hàm thuần lọc: mẫu số của 19.5
 * là "số **ticket** đã nộp", nên phải thấy đủ các lượt của một ticket (kể cả
 * lượt đầu đã cũ hơn 30 ngày) mới biết "lượt đầu có `accepted` không".
 */
export async function tiLeDatLanDauCuaAgent(
  db: D1Database,
  workspace_id: string,
  agent_id: string,
  bay_gio: number,
): Promise<TiLeDatLanDau> {
  const { results } = await db
    .prepare(
      `SELECT ticket_id, loai, trang_thai, so_luot, nop_luc
         FROM luot_giao
        WHERE workspace_id = ? AND nguoi_nhan_agent_id = ? AND loai = 'work'`,
    )
    .bind(workspace_id, agent_id)
    .all<LuotChoTiLe>();

  return tiLeDatLanDau(results, bay_gio);
}
