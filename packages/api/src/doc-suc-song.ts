/**
 * **Số liệu một hàng dự án** — SPEC mục 11 d.317 ("mỗi dự án một hàng: chỉ báo
 * sức sống, số ticket Đang làm, Chờ kiểm chứng, và việc xong 24 giờ qua") và mục
 * 2 d.71–74 (chỉ báo sức sống).
 *
 * File này là **nguồn dữ liệu**, không phải luật: luật sức sống nằm trọn trong
 * hàm thuần `sucSongDuAn` của `@baton/shared`, và trạng thái phiên vào đây đã
 * **dẫn xuất** (`phienMoTrongWorkspace`). Nhờ vậy sidebar (`GET /v1/du-an`,
 * d.393) và Tổng quan (`GET /v1/tong-quan`, d.317) đọc **cùng một** kết luận —
 * không có bản tính thứ hai để lệch.
 *
 * ## Vì sao gom cả workspace, không lọc theo danh sách project_id
 *
 * Cách hiển nhiên là `... AND project_id IN (?, ?, …)` theo đúng trang dự án đang
 * vẽ. Hai lý do không làm vậy:
 *
 *   1. **Giới hạn tham số bind của D1.** 200 dự án (mốc nghiệm thu, `decisions.md`
 *      01/10) là 200 dấu `?`, vượt trần; đường ra là chia lô 90 như
 *      `trangThaiPhienTheoAgent` — tức **nhiều** truy vấn, đúng thứ cần tránh.
 *   2. **`GROUP BY project_id` không đắt hơn.** Cả ba câu dưới đây bị chặn bởi
 *      một tập **nhỏ tự nhiên**, không bởi 200.000 ticket: ticket đang
 *      `in_progress`/`verifying`, và ticket Xong trong 24 giờ. Mỗi câu đi đúng
 *      một index riêng phần (xem từng hàm).
 *
 * Nên **số truy vấn là O(1) theo số dự án**: đúng ba câu, dù workspace có 1 hay
 * 300 dự án. Có ca test đếm số lần `prepare`.
 *
 * ## Không lọc theo phạm vi agent — và không có lỗ nào
 *
 * Map trả về có khoá cho **mọi** dự án của workspace. Nó không phải một đường
 * đọc: chỗ gọi chỉ tra những `project_id` mà **câu liệt kê của nó** (đã qua
 * `loc_pham_vi_du_an`) đã trả về, nên không có dự án nào ngoài phạm vi lọt ra
 * ngoài API. Dồn điều kiện phạm vi vào đây sẽ phải chép `loc_pham_vi_du_an` lần
 * thứ hai vào ba câu, và một bản chép là một chỗ để lệch.
 */

import { sucSongDuAn, type SucSong, type TrangThaiPhien } from '@baton/shared';
import { phienMoTrongWorkspace, type PhienMoRa } from './doc-phien.js';

/** "việc xong **24 giờ qua**" — d.317, d.320. Một hằng cho cả hai khối. */
export const CUA_SO_VUA_XONG_MS = 24 * 60 * 60 * 1000;

/**
 * **Trạng thái KHÔNG tính vào "tổng" của thanh tiến độ** — d.317 ("thanh tiến độ
 * xong/tổng").
 *
 * SPEC không nói tổng gồm những trạng thái nào (`spec-questions.md` #138). Đang
 * cài: tổng = mọi ticket chưa xoá **trừ** `canceled` và `duplicate` — hai trạng
 * thái nghĩa là "không làm nữa", nên để chúng trong tổng thì một dự án càng huỷ
 * nhiều càng trông càng ít xong. `backlog` **có** trong tổng: nó là việc còn
 * phải làm, và bỏ nó ra làm thanh nhảy lùi mỗi lần một ý tưởng được lên kế hoạch.
 */
const NGOAI_TONG = ['canceled', 'duplicate'] as const;

/** Một hàng dự án của d.317, phần số liệu. */
export interface SoLieuDuAn {
  /** SPEC mục 2 d.71–74, qua hàm thuần `sucSongDuAn`. */
  suc_song: SucSong;
  so_dang_lam: number;
  so_cho_kiem_chung: number;
  /** "số … **Cần làm**" của d.317 — đúng mã `todo` của bảng 0.1, không `backlog`. */
  so_can_lam: number;
  /** Tử số của thanh tiến độ d.317 — ticket `done`. */
  so_xong: number;
  /** Mẫu số của thanh tiến độ d.317 — xem `NGOAI_TONG`. */
  so_tong: number;
  so_xong_24h: number;
}

export const SO_LIEU_RONG: SoLieuDuAn = {
  suc_song: 'trang',
  so_dang_lam: 0,
  so_cho_kiem_chung: 0,
  so_can_lam: 0,
  so_xong: 0,
  so_tong: 0,
  so_xong_24h: 0,
};

/**
 * Số liệu của **mọi** dự án trong workspace, bằng **ba** truy vấn.
 *
 * `phien_mo` truyền vào được: Tổng quan đã đọc danh sách phiên mở cho khối "Cần
 * chú ý" và khối "Đội agent", nên nó không đọc lần thứ hai. Để trống thì hàm tự
 * đọc (đường của sidebar, nơi không có khối nào khác).
 */
export async function soLieuDuAn(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
  phien_mo?: readonly PhienMoRa[],
): Promise<Map<string, SoLieuDuAn>> {
  const [dem, xong, phien] = await Promise.all([
    demTheoTrangThai(db, workspace_id),
    demXong24h(db, workspace_id, bay_gio),
    phien_mo === undefined
      ? phienMoTrongWorkspace(db, workspace_id, bay_gio)
      : Promise.resolve(phien_mo),
  ]);

  /*
   * Phiên của ticket **Đang làm** thôi: d.72 và d.73 đều mở đầu bằng "có ticket
   * Đang làm". Một phiên còn mở trên một ticket đã sang `verifying` không làm dự
   * án 🟢 — ticket đó không còn Đang làm.
   */
  const phien_theo_du_an = new Map<string, TrangThaiPhien[]>();
  for (const p of phien) {
    if (p.ticket_trang_thai !== 'in_progress') continue;
    const ds = phien_theo_du_an.get(p.project_id) ?? [];
    ds.push(p.trang_thai);
    phien_theo_du_an.set(p.project_id, ds);
  }

  const ra = new Map<string, SoLieuDuAn>();
  const moi_du_an = new Set([...dem.keys(), ...xong.keys(), ...phien_theo_du_an.keys()]);
  for (const project_id of moi_du_an) {
    const d = dem.get(project_id);
    const so_dang_lam = d?.['in_progress'] ?? 0;
    let so_tong = 0;
    for (const [tt, so] of Object.entries(d ?? {})) {
      if ((NGOAI_TONG as readonly string[]).includes(tt)) continue;
      so_tong += so;
    }
    ra.set(project_id, {
      so_dang_lam,
      so_cho_kiem_chung: d?.['verifying'] ?? 0,
      so_can_lam: d?.['todo'] ?? 0,
      so_xong: d?.['done'] ?? 0,
      so_tong,
      so_xong_24h: xong.get(project_id) ?? 0,
      suc_song: sucSongDuAn({
        so_ticket_dang_lam: so_dang_lam,
        trang_thai_phien: phien_theo_du_an.get(project_id) ?? [],
      }),
    });
  }
  return ra;
}

/**
 * Đếm ticket **theo từng trạng thái** của mỗi dự án — **một** câu cho cả năm con
 * số của d.317 (Đang làm · Chờ kiểm chứng · Cần làm · xong · tổng).
 *
 * Đi `ix_ticket_ws_trang_thai` (`WHERE xoa_luc IS NULL`, tiền tố
 * `(workspace_id, trang_thai)`): một lần quét **trong index** theo tiền tố
 * workspace, rồi một lần nhóm trong bộ nhớ vì `project_id` không nằm trong
 * index.
 *
 * **Giá phải trả, khai thẳng:** từ lượt này câu **không còn** vế
 * `trang_thai IN ('in_progress','verifying')`, nên tập dòng nó đọc là **mọi**
 * ticket của workspace (mốc 200.000 của 19.12 câu 1), không còn là "ticket đang
 * chạy". Đó là **giá của chính d.317**: thanh tiến độ "xong/tổng" là một con số
 * trên toàn bộ ticket, nên không có câu nào rẻ hơn nói được nó. Hai thứ giữ nó
 * chịu được: đây vẫn là **một** câu (không phải một câu cho mỗi dự án — ca test
 * đếm `prepare` vẫn ghim), và nó đọc **chỉ index**, không chạm bảng. Nếu một
 * lượt sau thấy chậm thật ở 200.000 ticket thì đường ra là một bảng đếm nuôi
 * bằng trigger, không phải bỏ con số.
 */
async function demTheoTrangThai(
  db: D1Database,
  workspace_id: string,
): Promise<Map<string, Record<string, number>>> {
  const { results } = await db
    .prepare(
      `SELECT project_id, trang_thai, count(*) AS so FROM ticket
        WHERE workspace_id = ? AND xoa_luc IS NULL
        GROUP BY trang_thai, project_id`,
    )
    .bind(workspace_id)
    .all<{ project_id: string; trang_thai: string; so: number }>();

  const ra = new Map<string, Record<string, number>>();
  for (const r of results) {
    const cu = ra.get(r.project_id) ?? {};
    cu[r.trang_thai] = (cu[r.trang_thai] ?? 0) + r.so;
    ra.set(r.project_id, cu);
  }
  return ra;
}

/**
 * "việc **xong 24 giờ qua**" theo dự án — d.317.
 *
 * Lọc bằng `xong_luc`, không bằng `cap_nhat_luc`: `cap_nhat_luc` nhích vì **mọi**
 * lần sửa, nên một ticket xong từ tháng trước mà hôm nay ai đó thêm một nhãn sẽ
 * đếm vào "vừa xong". Index là `ix_ticket_xong_luc` (riêng phần
 * `xong_luc IS NOT NULL`, nên vế `IS NOT NULL` phải có mặt để SQLite dùng được
 * nó — cùng cái bẫy mà `cauAsksVuaXuLy` đã ghi lại).
 *
 * `trang_thai = 'done'` là một vế **thêm**, không dư: một ticket Xong rồi bị mở
 * lại (`in_progress`) vẫn còn `xong_luc` cũ, và nó không phải "việc xong".
 */
async function demXong24h(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT project_id, count(*) AS so FROM ticket
        WHERE workspace_id = ? AND xoa_luc IS NULL
          AND xong_luc IS NOT NULL AND xong_luc >= ? AND trang_thai = 'done'
        GROUP BY project_id`,
    )
    .bind(workspace_id, bay_gio - CUA_SO_VUA_XONG_MS)
    .all<{ project_id: string; so: number }>();

  const ra = new Map<string, number>();
  for (const r of results) ra.set(r.project_id, r.so);
  return ra;
}
