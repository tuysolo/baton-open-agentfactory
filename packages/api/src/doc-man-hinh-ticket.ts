/**
 * **Màn hình chi tiết ticket** — SPEC mục 14 d.398–401, trong **một** lượt gọi.
 *
 * | Vế của d.398–401 | Trường của thân |
 * |---|---|
 * | tiêu đề và mô tả (sửa tại chỗ) | `ticket.tieu_de`, `ticket.mo_ta` |
 * | brief 8 mục gập được | `ticket` (8 trường của `TRUONG_BRIEF`) |
 * | ticket con | `ticket_con` |
 * | chuỗi lượt giao dạng dòng thời gian | `luot_giao` |
 * | bằng chứng | `bang_chung` |
 * | bình luận xen lịch sử (lịch sử thu gọn) | `binh_luan`, `lich_su` |
 * | thuộc tính | `ticket` |
 * | ticket liên quan, kể cả ticket điều phối | `ticket.lien_ket`, `ticket.la_dieu_phoi` |
 * | mục Cần Chủ liên quan | `can_chu` |
 *
 * ## Vì sao MỘT đường, không bảy
 *
 * d.408 đòi "sau lần tải đầu, chuyển trang **không có màn hình chờ toàn trang**",
 * và d.410 đòi thay đổi của agent hiện trong 3 giây. Bảy đường nghĩa là bảy lần
 * đi-về cho một lần mở ticket và bảy lần hỏi vòng cho mỗi chu kỳ làm mới — trên
 * một kết nối điện thoại (d.411) đó là một trang nhấp nháy từng khối. Quan trọng
 * hơn: **một mốc `bay_gio` duy nhất**. Bảy phản hồi là bảy đồng hồ, và "chờ 3 giờ"
 * ở dòng thời gian sẽ lệch với "2 giờ trước" ở bình luận cho cùng một mốc.
 *
 * ## `bay_gio` trong thân, bắt buộc
 *
 * Cùng nếp `manHinhCanChu` và `tongQuan`: mốc tương đối của d.412 phải đếm từ
 * **đồng hồ máy chủ**, đúng cái đã tính `khong_phan_hoi` của lượt giao và
 * `qua_han` của mục Cần Chủ trong cùng thân này. Giao diện không được dựng một
 * `Date.now()` thứ hai (xem `packages/web/src/thoi-gian.ts`).
 *
 * ## Không một dẫn xuất nào tính ở giao diện
 *
 * `nguoi_dang_cam` và `bac_nguoi_cam` (19.1), `cho_nghiem_thu`, `con_chua_ket`
 * (19.11), `la_dieu_phoi` (19.4), `khong_phan_hoi` của từng lượt (mục 5), mọi
 * `nhan_*` tiếng Việt (d.381), `hash` 7 ký tự (d.320): **đã tính** ở đây.
 */

import { BatonError, type AiGoi, type TacGia, type TrangKetQua } from '@baton/shared';
import {
  binhLuanCuaTicket,
  layTicketTheoMa,
  lichSuTicket,
  lietKeTicket,
  type BinhLuanRa,
  type DongLichSuRa,
  type LienKetRa,
  type TicketDanhSachRa,
  type TicketRa,
  type YeuCauLietKeTicket,
} from './doc-ticket.js';
import { luotGiaoCuaTicket, type LuotGiaoRa } from './doc-luot-giao.js';
import { bangChungCuaTicket, type BangChungRutGon } from './doc-tong-quan.js';
import { canChuCuaTicket, type TheCanChu } from './doc-can-chu.js';
import { chayTheoLo } from './chia-lo-tham-so.js';

/**
 * **Số dòng lịch sử** màn hình lấy về.
 *
 * d.400 nói bình luận "xen lịch sử (**lịch sử thu gọn**)" — tức lịch sử là nền
 * cho dòng bình luận, không phải nội dung chính. SPEC **không** chốt con số
 * (`spec-questions.md` #110); 50 là đề xuất tạm, và nó là một hằng có tên nên một
 * lần chốt khác chỉ sửa đúng dòng này.
 */
export const SO_LICH_SU_MAN_HINH = 50;

/** Số bình luận màn hình lấy về — nhiều hơn `baton show`, vì đây là màn hình đọc. */
export const SO_BINH_LUAN_MAN_HINH = 50;

/** Một ticket con của d.399 — dựng từ liên kết `parent`, không một truy vấn mới. */
export interface TicketConRa {
  id: string;
  ma: string;
  tieu_de: string;
  trang_thai: string;
  nhan_trang_thai: string;
}

export interface ManHinhTicketRa {
  /** Mốc mà **mọi** dẫn xuất của thân này được tính tại — d.412. */
  bay_gio: number;
  ticket: TicketRa;
  /** d.399 "ticket con" — liên kết `parent` **xuôi** (ticket này là cha). */
  ticket_con: TicketConRa[];
  /** d.399 "chuỗi lượt giao dạng dòng thời gian", sắp theo `so_luot`. */
  luot_giao: LuotGiaoRa[];
  /** d.400 "bằng chứng" — đã rút thì không ra (d.222). */
  bang_chung: BangChungRutGon[];
  /** d.400 "bình luận xen lịch sử" — mới nhất trước. */
  binh_luan: BinhLuanRa[];
  /** d.400 "lịch sử thu gọn" — mới nhất trước. */
  lich_su: DongLichSuRa[];
  /** d.401 "mục Cần Chủ liên quan" — thẻ đầy đủ của d.250. */
  can_chu: TheCanChu[];
}

/* ------------------------------------------------------------------ *
 * Màn hình DANH SÁCH — d.395–397
 * ------------------------------------------------------------------ */

/**
 * **Một thẻ việc của màn hình danh sách** — `TicketDanhSachRa` cộng đúng bốn thứ
 * mà thẻ của d.396 hiện mà dòng CLI không cần.
 *
 * ## Vì sao bốn trường này ở ĐÂY, không ở `lietKeTicket`
 *
 * Thân của `lietKeTicket` **cũng là đầu ra `baton list --json`** (mục 13). Bốn
 * trường dưới đây là bốn lượt truy vấn phụ cho mỗi trang, và `baton list` không
 * vẽ thẻ nào — trả thêm chúng ở đó là bắt mọi lần gọi CLI trả tiền cho một màn
 * hình nó không có. Nên đường **đọc màn hình** giàu hơn, đường CLI giữ nguyên.
 *
 * ## Vì sao `con_tong` + `con_chua_ket`, không `con_xong`
 *
 * "Số việc con xong/tổng" của thẻ = `con_tong − con_chua_ket`. `con_chua_ket` là
 * **đúng** dẫn xuất 19.11 mà `layTicket` đã tính (con **không** thuộc
 * `done`/`canceled`/`duplicate`), nên "xong" ở đây là "đã kết" — một định nghĩa
 * cho cả hai màn hình, không hai. Xem `spec-questions.md` #134.
 */
export interface TheDanhSachRa extends TicketDanhSachRa {
  /** Nhãn của ticket (mục 4) — thẻ hiện nhãn màu. Sắp theo chữ. */
  nhan: string[];
  /** Tổng số ticket con (liên kết `parent` **xuôi**, con chưa xoá). */
  con_tong: number;
  /** 19.11 — số con **chưa kết**; "xong" của thẻ là `con_tong − con_chua_ket`. */
  con_chua_ket: number;
  /** Số mục Cần Chủ **đang Chờ** nối với ticket này — cùng định nghĩa bộ lọc `can_chu`. */
  can_chu_so: number;
  /**
   * **Mốc ticket vào Xong** (`ticket.xong_luc`), hoặc `null`.
   *
   * Cần cho vế "ẩn/hiện **Xong cũ**" của brief: `cap_nhat_luc` nhích vì **mọi**
   * lần sửa, nên một ticket Xong từ 100 ngày trước bị thêm một nhãn sẽ thành
   * "mới" lại — cùng họ lỗi mà `spec-questions.md` #104 đã phải sửa cho đồng hồ 24
   * giờ. Trường này ở `TheDanhSachRa`, **không** ở `TicketDanhSachRa`: thêm vào
   * kia là đổi đầu ra `baton list --json` (mục 13).
   */
  xong_luc: number | null;
  /**
   * **Tên** agent đang cầm — SPEC mục 14 d.404: "Mọi chỗ hiện người làm đều hiện
   * **tên agent**, không bao giờ id."
   *
   * `null` khi người cầm là **chủ** hoặc không ai cầm: `nguoi_dang_cam` đã nói đủ
   * hai ca đó, và một cái tên bịa ở đây sẽ che mất ca "không ai cầm". Trường này
   * ở `TheDanhSachRa`, **không** ở `TicketDanhSachRa`: thêm vào kia là đổi đầu ra
   * `baton list --json` (mục 13), nơi id là thứ agent cần.
   */
  nguoi_cam_ten: string | null;
  /** Cùng d.404 cho **người chịu trách nhiệm** — `null` khi là chủ hoặc trống. */
  chiu_trach_nhiem_ten: string | null;
}

/** Thân `GET /v1/man-hinh-ticket` — một trang danh sách kèm mốc máy chủ. */
export interface ManHinhDanhSachRa extends TrangKetQua<TheDanhSachRa> {
  /** Mốc của d.412 — xem `ManHinhTicketRa.bay_gio`. */
  bay_gio: number;
}

/**
 * **Màn hình danh sách ticket** của d.395–397.
 *
 * `lietKeTicket` cộng `bay_gio` cộng cổng "chỉ chủ", cộng bốn trường của thẻ
 * (xem `TheDanhSachRa`). Một đường riêng (thay vì thêm `bay_gio` vào
 * `GET /v1/ticket`) vì thân của đường kia **cũng là đầu ra `baton list --json`**
 * của mục 13: một mốc đổi theo từng lần gọi làm đầu ra CLI không so lại được
 * giữa hai lần chạy.
 *
 * Ba lượt truy vấn phụ là **ba câu cho cả trang**, không ba câu cho mỗi dòng:
 * mốc của 19.12 là 200.000 ticket, và N+1 ở đây là 600 câu cho một trang 200.
 */
export async function manHinhDanhSachTicket(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauLietKeTicket,
  bay_gio: number,
): Promise<ManHinhDanhSachRa> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: CAU_CHI_CHU });
  }
  const trang = await lietKeTicket(db, ai, workspace_id, yeu_cau);
  const them = await themCuaThe(
    db,
    workspace_id,
    trang.items.map((t) => t.id),
  );
  /*
   * d.404 — **tên** agent, không id. Một câu cho **cả trang** (xem `tenAgentTheoId`),
   * cùng kỷ luật ba câu phụ của `themCuaThe`: hỏi tên từng dòng một là N+1 ở mốc
   * 200 dòng mỗi trang.
   */
  const ten = await tenAgentTheoId(
    db,
    workspace_id,
    trang.items.flatMap((t) => [t.nguoi_dang_cam, t.chiu_trach_nhiem]),
  );
  return {
    ...trang,
    items: trang.items.map((t) => ({
      ...t,
      nhan: them.nhan.get(t.id) ?? [],
      con_tong: them.con.get(t.id)?.tong ?? 0,
      con_chua_ket: them.con.get(t.id)?.chua_ket ?? 0,
      can_chu_so: them.can_chu.get(t.id) ?? 0,
      xong_luc: them.xong_luc.get(t.id) ?? null,
      nguoi_cam_ten: tenCua(t.nguoi_dang_cam, ten),
      chiu_trach_nhiem_ten: tenCua(t.chiu_trach_nhiem, ten),
    })),
    bay_gio,
  };
}

/** Tên của một `TacGia` theo bảng tra; `null` cho chủ, hệ thống, hoặc trống. */
function tenCua(ai: TacGia | null, ten: ReadonlyMap<string, string>): string | null {
  if (ai === null || ai.loai !== 'agent' || ai.agentId === undefined) return null;
  return ten.get(ai.agentId) ?? null;
}

/**
 * **`agent_id` → tên**, một câu cho mỗi lô 89 id (không một câu mỗi dòng) — SPEC
 * mục 14 d.404.
 *
 * Nhận thẳng danh sách `TacGia` (lẫn `null`, lẫn chủ) vì đó là thứ người gọi đang
 * có; hàm tự lọc ra các id agent và **bỏ trùng**. Danh sách rỗng ⇒ **không câu
 * nào**: `IN ()` không phải SQL hợp lệ, và một trang toàn ticket chưa ai cầm là ca
 * thật.
 *
 * Tên **không** đọc được là `null`, không một chuỗi thay thế: agent đã bị xoá khỏi
 * bảng thì giao diện phải nói "—", không in id ra (d.404).
 */
export async function tenAgentTheoId(
  db: D1Database,
  workspace_id: string,
  ai: readonly (TacGia | null)[],
): Promise<Map<string, string>> {
  const ten = new Map<string, string>();
  const ids = [
    ...new Set(
      ai.flatMap((a) =>
        a !== null && a.loai === 'agent' && a.agentId !== undefined ? [a.agentId] : [],
      ),
    ),
  ];
  if (ids.length === 0) return ten;

  /*
   * Chia lô (`chia-lo-tham-so.ts`): 1 tham số khác (`workspace_id`). Kết quả là
   * một bảng tra theo `id`, không thứ tự — gộp các lô không đổi nghĩa.
   */
  const results = await chayTheoLo(ids, 1, async (lo, cho) => {
    const r = await db
      .prepare(`SELECT id, ten FROM agent WHERE workspace_id = ? AND id IN (${cho})`)
      .bind(workspace_id, ...lo)
      .all<{ id: string; ten: string }>();
    return r.results;
  });
  for (const d of results) ten.set(d.id, d.ten);
  return ten;
}

/**
 * Bốn trường của thẻ cho **cả một trang**, trong bốn câu truy vấn cho mỗi lô
 * (≤ 89 id một lô — `chia-lo-tham-so.ts`), không bốn câu cho mỗi dòng.
 *
 * Trang rỗng ⇒ **không câu nào**: `IN ()` không phải SQL hợp lệ, và một trang
 * rỗng là ca thật (mọi bộ lọc không khớp gì).
 *
 * **Xuất ra** vì khối "Việc đang chạy" của Tổng quan (d.318) vẽ **đúng** thẻ
 * việc này: nếu nó tự dựng bốn trường kia thì hai màn hình sẽ có hai định nghĩa
 * cho "việc con xong/tổng" và cho "số Cần Chủ liên quan".
 */
export async function themCuaThe(
  db: D1Database,
  workspace_id: string,
  ids: readonly string[],
): Promise<{
  nhan: Map<string, string[]>;
  con: Map<string, { tong: number; chua_ket: number }>;
  can_chu: Map<string, number>;
  xong_luc: Map<string, number>;
}> {
  const nhan = new Map<string, string[]>();
  const con = new Map<string, { tong: number; chua_ket: number }>();
  const can_chu = new Map<string, number>();
  const xong_luc = new Map<string, number>();
  if (ids.length === 0) return { nhan, con, can_chu, xong_luc };

  /*
   * **Chia lô** (`chia-lo-tham-so.ts`) — D1 chặn 100 tham số bind; một trang
   * 200 dòng, hay 400 thẻ "Việc đang chạy" của Tổng quan, vượt xa. Cả bốn câu có
   * đúng **1** tham số khác (`workspace_id`). Mỗi id nằm **đúng một** lô (hàm
   * chia bỏ trùng), nên gộp kết quả các lô giữ nguyên nghĩa của bản một câu:
   *   * `nhan` — `ORDER BY ticket_id, nhan` chỉ cần đúng **trong một ticket**
   *     (bảng tra theo ticket), và mọi nhãn của một ticket về cùng một lô ⇒ thứ
   *     tự nhãn giữ nguyên;
   *   * `con` — `GROUP BY l.tu_ticket_id`: một cha chỉ ở một lô ⇒ một dòng cho
   *     mỗi cha, không phải cộng dồn giữa các lô;
   *   * `can_chu` — `GROUP BY ctt.ticket_id`: cùng lý lẽ;
   *   * `xong_luc` — một dòng mỗi `id`.
   * Thứ tự **giữa** các ticket không ai đọc: người gọi tra theo id.
   */
  const [ds_nhan, ds_con, ds_can_chu, ds_xong] = await Promise.all([
    chayTheoLo(ids, 1, async (lo, cho) => {
      const r = await db
        .prepare(
          `SELECT ticket_id, nhan FROM ticket_label
            WHERE workspace_id = ? AND ticket_id IN (${cho}) ORDER BY ticket_id, nhan`,
        )
        .bind(workspace_id, ...lo)
        .all<{ ticket_id: string; nhan: string }>();
      return r.results;
    }),
    /*
     * Cùng điều kiện với `con_chua_ket` của `layTicket`: `parent` **xuôi**, con
     * chưa xoá, và "chưa kết" là `NOT IN ('done','canceled','duplicate')`. Gõ lại
     * điều kiện thứ hai ở đây sẽ là hai định nghĩa cho một con số — nên nó đi
     * cùng một hình: `count(*)` cho tổng, `sum(...)` cho phần chưa kết.
     */
    chayTheoLo(ids, 1, async (lo, cho) => {
      const r = await db
        .prepare(
          `SELECT l.tu_ticket_id AS cha, count(*) AS tong,
                  sum(CASE WHEN c.trang_thai NOT IN ('done', 'canceled', 'duplicate')
                           THEN 1 ELSE 0 END) AS chua_ket
             FROM ticket_link l JOIN ticket c ON c.id = l.den_ticket_id
            WHERE l.workspace_id = ? AND l.loai = 'parent' AND c.xoa_luc IS NULL
              AND l.tu_ticket_id IN (${cho})
            GROUP BY l.tu_ticket_id`,
        )
        .bind(workspace_id, ...lo)
        .all<{ cha: string; tong: number; chua_ket: number }>();
      return r.results;
    }),
    /*
     * "Cần Chủ liên quan" = mục **đang Chờ** (`trang_thai = 'open'`) — cùng điều
     * kiện mà bộ lọc `can_chu` của d.396 và huy hiệu d.248 dùng, không một định
     * nghĩa thứ ba.
     */
    chayTheoLo(ids, 1, async (lo, cho) => {
      const r = await db
        .prepare(
          `SELECT ctt.ticket_id AS ticket_id, count(*) AS so
             FROM can_chu_ticket ctt
             JOIN can_chu ct ON ct.id = ctt.can_chu_id AND ct.workspace_id = ctt.workspace_id
            WHERE ctt.workspace_id = ? AND ct.trang_thai = 'open'
              AND ctt.ticket_id IN (${cho})
            GROUP BY ctt.ticket_id`,
        )
        .bind(workspace_id, ...lo)
        .all<{ ticket_id: string; so: number }>();
      return r.results;
    }),
    /*
     * `xong_luc` **không** nằm trong `COT_DANH_SACH` (đường CLI không cần nó),
     * nên một câu thứ tư — vẫn một câu cho **cả trang**, cùng khuôn ba câu trên.
     */
    chayTheoLo(ids, 1, async (lo, cho) => {
      const r = await db
        .prepare(
          `SELECT id, xong_luc FROM ticket
            WHERE workspace_id = ? AND id IN (${cho}) AND xong_luc IS NOT NULL`,
        )
        .bind(workspace_id, ...lo)
        .all<{ id: string; xong_luc: number }>();
      return r.results;
    }),
  ]);

  for (const d of ds_nhan) nhan.set(d.ticket_id, [...(nhan.get(d.ticket_id) ?? []), d.nhan]);
  for (const d of ds_con) con.set(d.cha, { tong: d.tong, chua_ket: d.chua_ket });
  for (const d of ds_can_chu) can_chu.set(d.ticket_id, d.so);
  for (const d of ds_xong) xong_luc.set(d.id, d.xong_luc);
  return { nhan, con, can_chu, xong_luc };
}

/** Câu của cổng "chỉ chủ" — một chuỗi cho cả hai màn hình của lượt này. */
const CAU_CHI_CHU = 'Màn hình này chỉ dành cho chủ.';

/**
 * Chỉ **chủ**: đây là màn hình web của chủ (mục 14), và agent đọc ticket bằng
 * `baton show` (`GET /v1/ticket/ma/:ma`). Cổng nằm **trong** hàm này, không ở
 * route — cùng nếp `tongQuan` và `manHinhCanChu`: một route thứ hai trỏ vào cùng
 * dữ liệu sẽ không vô tình mở cửa.
 *
 * Ticket không có / ngoài phạm vi → `NOT_FOUND` của `layTicketTheoMa`, không một
 * câu thứ hai (d.386: 404 cũng dùng cho ngoài phạm vi, để không lộ sự tồn tại).
 */
export async function manHinhTicket(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  ma: string,
  bay_gio: number,
): Promise<ManHinhTicketRa> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: CAU_CHI_CHU });
  }

  const ticket = await layTicketTheoMa(db, ai, workspace_id, ma);

  const [luot_giao, bang_chung, binh_luan, lich_su, can_chu] = await Promise.all([
    luotGiaoCuaTicket(db, workspace_id, ticket.id, bay_gio),
    bangChungCuaTicket(db, workspace_id, [ticket.id]),
    binhLuanCuaTicket(db, workspace_id, ticket.id, { limit: SO_BINH_LUAN_MAN_HINH }),
    lichSuTicket(db, workspace_id, ticket.id, { limit: SO_LICH_SU_MAN_HINH }),
    canChuCuaTicket(db, ai, workspace_id, ticket.id, bay_gio),
  ]);

  return {
    bay_gio,
    ticket,
    ticket_con: ticketCon(ticket.lien_ket),
    luot_giao,
    bang_chung: bang_chung.get(ticket.id) ?? [],
    binh_luan: binh_luan.items,
    lich_su: lich_su.items,
    can_chu,
  };
}

/**
 * **Ticket con** = liên kết `parent` theo chiều **xuôi** (`nguoc === false`).
 *
 * `lienKetCua` của `doc-ticket.ts` lưu mỗi quan hệ **một** dòng và trả cả hai
 * chiều, với `nguoc` nói chiều nào. `parent` xuôi nghĩa là "ticket này là cha của
 * ticket kia" — đúng khuôn mà `layTicket` dùng để đếm `con_chua_ket` (`l.loai =
 * 'parent' AND l.tu_ticket_id = ?`). Lấy cả hai chiều ở đây sẽ đặt **cha** vào
 * danh sách "ticket con", và hai con số trên cùng màn hình (`con_chua_ket` và số
 * dòng con) sẽ nói trái nhau.
 */
export function ticketCon(lien_ket: readonly LienKetRa[]): TicketConRa[] {
  return lien_ket
    .filter((l) => l.loai === 'parent' && !l.nguoc)
    .map((l) => ({
      id: l.ticket_id,
      ma: l.ma,
      tieu_de: l.tieu_de,
      trang_thai: l.trang_thai,
      nhan_trang_thai: l.nhan_trang_thai,
    }));
}
