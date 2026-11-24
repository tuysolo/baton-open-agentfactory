/**
 * Sinh dữ liệu **giả** cho mốc hiệu năng của SPEC 19.12 câu 1 (và 17.10 mục 10):
 * **200 dự án + 200.000 ticket**; và (BAT-72) vế "chịu thêm 300 dự án" của cùng
 * câu: **500 dự án + 200.000 ticket** — xem `SO_DU_AN_MAC_DINH` / `soDuAnDo`.
 *
 * Danh sách cấm của CLAUDE.md: mọi thứ ở đây là chuỗi sinh bằng máy — không có
 * dữ liệu nhân sự, không secret, không kết nối DB thật. DB là SQLite trong bộ
 * nhớ của Miniflare, mất khi tiến trình vitest kết thúc.
 *
 * Ba điều quyết định chất lượng của số đo, nên cố định ở đây:
 *
 *  1. **Sinh xác định.** PRNG `mulberry32` với hạt giống cố định, **không**
 *     `Math.random()`. Chạy lại ra đúng cùng bộ dữ liệu, nên hai lần đo so được
 *     với nhau (vd trước/sau khi thêm index).
 *
 *  2. **`tao_luc` rải trên 2 năm.** Nếu mọi ticket cùng `tao_luc` thì khoá keyset
 *     `(hang_uu_tien, tao_luc DESC, id DESC)` suy biến còn `(hang_uu_tien, id)`:
 *     trang sâu vẫn nhanh nhưng vì lý do sai, và số đo không nói gì về đời thật.
 *
 *  3. **Số ticket mỗi dự án lệch nhau** (≈200–3.000, trung bình 1.000). Chia đều
 *     tuyệt đối giấu mất ca xấu "một dự án khổng lồ" — đúng ca mà bộ lọc
 *     `project_id` phải chịu.
 */

import { env } from 'cloudflare:test';
import { HANG_UU_TIEN, TRANG_THAI_TICKET, type TrangThaiTicket, type UuTien } from '@baton/shared';

/* ------------------------------------------------------------------ *
 * Mốc của SPEC 19.12 câu 1
 * ------------------------------------------------------------------ */

/**
 * Số dự án **mặc định** = mốc 200 của SPEC 19.12 câu 1.
 *
 * BAT-72 — vế thứ hai của cùng câu (SPEC dòng 478 = 17.10, dòng 599 = 19.12):
 * "chịu được tiếp **300 dự án** (và mọi tổ hợp nhỏ hơn 200.000 ticket)". 300 dự
 * án đó là **thêm dự án, không thêm ticket** — tổng ticket vẫn là 200.000 — nên
 * cấu hình đo vế này là **500 dự án + 200.000 ticket** (`vitest-500.config.ts`
 * đặt binding `SO_DU_AN_DO = '500'`). Không có binding thì giữ 200: cùng hạt
 * giống, cùng dãy số, nên bộ dữ liệu 200 dự án **không đổi** so với trước BAT-72.
 */
export const SO_DU_AN_MAC_DINH = 200;

/** Trần của id `pj-NNN` / mã `PNNN` (ba chữ số, `soBu(i, 3)`). */
const SO_DU_AN_TOI_DA = 999;

/** Số dự án của lần đo này — đọc binding `SO_DU_AN_DO`, vắng thì 200. */
export function soDuAnDo(): number {
  const tho = env.SO_DU_AN_DO;
  if (tho === undefined || tho === '') return SO_DU_AN_MAC_DINH;
  const n = Number(tho);
  if (!Number.isInteger(n) || n < 1 || n > SO_DU_AN_TOI_DA) {
    throw new Error(`SO_DU_AN_DO = '${tho}' không hợp lệ (cần số nguyên 1–${String(SO_DU_AN_TOI_DA)}).`);
  }
  return n;
}

export const SO_TICKET = 200_000;

/** Ngưỡng "mở dưới 1 giây" — SPEC 19.12 câu 1. */
export const NGUONG_MS = 1000;

export const WS = 'ws-do';

/** Số agent giả, để cột `chiu_trach_nhiem_agent_id` có dữ liệu thật sự lệch. */
const SO_AGENT = 20;

/** Khoảng thời gian `tao_luc` rải ra: 2 năm, kết thúc ở `MOC_BAY_GIO`. */
export const MOC_BAY_GIO = Date.UTC(2026, 9, 1, 0, 0, 0);
const HAI_NAM_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * PRNG xác định
 * ------------------------------------------------------------------ */

/** `mulberry32` — nhỏ, không phụ thuộc, cùng hạt giống thì cùng dãy số. */
function prng(hat: number): () => number {
  let a = hat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hạt giống cố định — đổi số này là đổi bộ dữ liệu, nên đừng đổi tuỳ tiện. */
const HAT_GIONG = 20_261_001;

/** Chọn một mã theo bảng trọng số (tổng trọng số không cần bằng 1). */
function theoTrongSo<T extends string>(r: number, bang: readonly (readonly [T, number])[]): T {
  const tong = bang.reduce((s, [, w]) => s + w, 0);
  let moc = r * tong;
  for (const [ma, w] of bang) {
    moc -= w;
    if (moc <= 0) return ma;
  }
  return bang[bang.length - 1]![0];
}

/* ------------------------------------------------------------------ *
 * Phân bố
 * ------------------------------------------------------------------ */

/**
 * **7 trạng thái của SPEC mục 4**, đọc mã thẳng từ `TRANG_THAI_TICKET` của
 * `@baton/shared` — không gõ lại chuỗi, nên không có cách nào đặt ra một mã
 * không tồn tại.
 *
 * Phần lớn ở `done` (dự án chạy lâu thì việc xong chiếm đa số), một phần
 * `todo`/`in_progress`/`backlog`, ít `verifying`/`canceled`/`duplicate`.
 */
const PHAN_BO_TRANG_THAI: readonly (readonly [TrangThaiTicket, number])[] = [
  ['done', 50],
  ['todo', 14],
  ['in_progress', 12],
  ['backlog', 12],
  ['verifying', 6],
  ['canceled', 4],
  ['duplicate', 2],
];

/** 5 mức ưu tiên, lệch về `medium`/`none` — SPEC mục 4. */
const PHAN_BO_UU_TIEN: readonly (readonly [UuTien, number])[] = [
  ['none', 35],
  ['medium', 30],
  ['low', 18],
  ['high', 12],
  ['urgent', 5],
];

// Kiểm ngay lúc nạp module: bảng trên phải phủ **đủ 7 mã**, không thiếu không thừa.
{
  const co = new Set(PHAN_BO_TRANG_THAI.map(([m]) => m));
  const can = Object.keys(TRANG_THAI_TICKET);
  if (co.size !== can.length || !can.every((m) => co.has(m as TrangThaiTicket))) {
    throw new Error('Phân bố trạng thái không khớp 7 mã của SPEC mục 4.');
  }
}

/**
 * Số ticket của từng dự án: lệch nhau, nhưng **tổng đúng bằng `SO_TICKET`**.
 *
 * Cách làm: bốc trọng số thô trong [200, 3000], chuẩn hoá về tổng mong muốn, rồi
 * rải phần dư từng-một cho tới khi tổng khớp tuyệt đối. Không có bước cuối thì
 * làm tròn sẽ lệch vài chục ticket và con số "200.000" trong báo cáo thành sai.
 *
 * Với 500 dự án (BAT-72) trung bình còn 400 ticket/dự án — cùng 200.000 tổng,
 * cùng cách rải lệch, sàn 50 ticket/dự án giữ nguyên.
 */
export function soTicketMoiDuAn(so_du_an: number = soDuAnDo()): number[] {
  const r = prng(HAT_GIONG);
  const tho = Array.from({ length: so_du_an }, () => 200 + Math.floor(r() * 2800));
  const tong_tho = tho.reduce((s, v) => s + v, 0);
  const n = tho.map((v) => Math.max(50, Math.round((v * SO_TICKET) / tong_tho)));

  let du = SO_TICKET - n.reduce((s, v) => s + v, 0);
  for (let i = 0; du !== 0; i = (i + 1) % so_du_an) {
    if (du > 0) {
      n[i]! += 1;
      du -= 1;
    } else if (n[i]! > 50) {
      n[i]! -= 1;
      du += 1;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Ghi vào DB
 * ------------------------------------------------------------------ */

/** Nháy đơn cho literal SQL. Dữ liệu đều do máy sinh, nhưng vẫn thoát cho chắc. */
function nhay(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function soBu(n: number, rong: number): string {
  return String(n).padStart(rong, '0');
}

/**
 * Cỡ DB tính bằng byte = `page_count` × `page_size`.
 *
 * D1 **chặn `PRAGMA`** (`SQLITE_AUTH`), nên không hỏi thẳng được. Hai đường
 * vòng còn lại, thử theo thứ tự:
 *   1. **Hàm bảng** `pragma_page_count()` / `pragma_page_size()` — là `SELECT`,
 *      nên qua được bộ kiểm quyền của D1 ở một số bản.
 *   2. `dbstat` (bảng ảo, chỉ có khi SQLite biên dịch kèm `SQLITE_ENABLE_DBSTAT`).
 * Không đường nào chạy thì trả `-1` và bộ đo **nói thẳng là không đo được**,
 * chứ không in một con số bịa.
 */
async function coDb(db: D1Database): Promise<number> {
  try {
    const a = await db
      .prepare('SELECT * FROM pragma_page_count()')
      .first<Record<string, number>>();
    const b = await db.prepare('SELECT * FROM pragma_page_size()').first<Record<string, number>>();
    const n = a === null ? 0 : Object.values(a)[0];
    const s = b === null ? 0 : Object.values(b)[0];
    if (typeof n === 'number' && typeof s === 'number' && n > 0 && s > 0) return n * s;
  } catch {
    /* thử đường kế tiếp */
  }
  try {
    const d = await db.prepare('SELECT sum(pgsize) AS n FROM dbstat').first<{ n: number }>();
    if (d !== null && d.n > 0) return d.n;
  } catch {
    /* không đo được */
  }
  return -1;
}

export interface KetQuaSinh {
  /** Mili giây để sinh toàn bộ dữ liệu. */
  ms: number;
  /** Cỡ DB tính bằng byte; `-1` = D1 không cho hỏi (xem `coDb`). */
  co_db_byte: number;
  so_du_an: number;
  so_ticket: number;
  /** `project_id` của dự án **nhiều ticket nhất** — ca xấu cho bộ lọc dự án. */
  du_an_to_nhat: string;
  so_ticket_du_an_to_nhat: number;
  /** Số ticket theo trạng thái, đếm lại từ DB (không phải từ bộ sinh). */
  theo_trang_thai: Record<string, number>;
  /** Số dòng `luot_giao` (SPEC mục 5), đếm lại từ DB. */
  so_luot_giao: number;
  /** Số lượt theo trạng thái — để thấy ngay nếu bảng lượt giao rỗng khi đo. */
  luot_theo_trang_thai: Record<string, number>;
  /** `ANALYZE` đã chạy được chưa (D1 có thể chặn). */
  da_analyze: boolean;
}

/**
 * Sinh toàn bộ: 1 workspace, 20 agent, `soDuAnDo()` dự án (200 hoặc 500),
 * 200.000 ticket.
 *
 * Chèn theo **lô lớn**: mỗi câu lệnh `INSERT` mang 500 dòng, và 20 câu lệnh đi
 * chung một `db.batch()` (D1 chạy batch trong một giao dịch). 200.000 lần
 * `prepare().run()` riêng lẻ là cách chắc chắn làm bộ đo chạy hàng chục phút.
 */
export async function sinhDuLieu(): Promise<KetQuaSinh> {
  const bat_dau = Date.now();
  const db = env.DB;
  const r = prng(HAT_GIONG + 1);
  /*
   * PRNG **riêng** cho lượt giao, không dùng chung `r`.
   *
   * Dùng chung thì mỗi lần bốc thêm cho lượt giao sẽ đẩy lệch cả dãy số của
   * ticket, nên bộ dữ liệu ticket đổi theo và hai lần đo trước/sau không còn so
   * được với nhau — đúng điều mục 1 của file này cấm.
   */
  const rl = prng(HAT_GIONG + 2);
  const t0 = MOC_BAY_GIO - HAI_NAM_MS;

  await db
    .prepare('INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)')
    .bind(WS, 'Chu gia', t0, t0)
    .run();

  const agent_id: string[] = [];
  const dong_agent: string[] = [];
  for (let i = 0; i < SO_AGENT; i += 1) {
    const id = `ag-${soBu(i, 3)}`;
    agent_id.push(id);
    dong_agent.push(
      `(${nhay(id)}, ${nhay(WS)}, ${nhay(`Agent ${soBu(i, 3)}`)}, 'worker', ${String(t0)}, ${String(t0)})`,
    );
  }
  await db
    .prepare(
      'INSERT INTO agent (id, workspace_id, ten, vai_tro, tao_luc, cap_nhat_luc) VALUES ' +
        dong_agent.join(','),
    )
    .run();

  const so_du_an_sinh = soDuAnDo();
  const dem = soTicketMoiDuAn(so_du_an_sinh);
  const du_an_id = Array.from({ length: so_du_an_sinh }, (_, i) => `pj-${soBu(i, 3)}`);

  const dong_du_an = du_an_id.map(
    (id, i) =>
      `(${nhay(id)}, ${nhay(WS)}, ${nhay(`Du an ${soBu(i, 3)}`)}, ${nhay(`P${soBu(i, 3)}`)},` +
      ` 'active', ${String(t0)}, ${String(t0)})`,
  );
  await db
    .prepare(
      'INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc) VALUES ' +
        dong_du_an.join(','),
    )
    .run();

  // Bộ đếm số ticket của mỗi dự án — cùng lý do như `dungTicket` trong
  // `test/giup.ts`: bộ đếm phải đứng ở `so` lớn nhất đã cấp, nếu không thì DB ở
  // một trạng thái đời thật không thể có.
  const dong_bo_dem = du_an_id.map(
    (id, i) => `(${nhay(WS)}, 'project', ${nhay(id)}, ${String(dem[i]!)})`,
  );
  await db
    .prepare(
      'INSERT INTO bo_dem (workspace_id, pham_vi, khoa, gia_tri) VALUES ' + dong_bo_dem.join(','),
    )
    .run();

  /* --- Ticket ------------------------------------------------------ */

  const CO_MOT_LO = 500;
  const LO_MOT_BATCH = 20;

  let lo: string[] = [];
  let batch: D1PreparedStatement[] = [];

  /*
   * **Lượt giao** (SPEC mục 5) sinh cùng lúc với ticket.
   *
   * Vì sao phải có trong bộ đo: `ticketDangCanBatCo` (c4) lọc bằng
   * `NOT EXISTS (… luot_giao …)` và danh sách ticket tra người đang cầm (19.1)
   * theo lô. Đo trên một bảng `luot_giao` **rỗng** thì hai đường đó không nói gì
   * về giá thật.
   *
   * Quy ước giữ dữ liệu **nhất quán với đời thật**:
   *   * Ticket có `trong_tay_tu_luc` nghĩa là "không ai cầm" (19.1) → **không**
   *     có lượt mở hay lượt `submitted` nào. Mâu thuẫn chỗ này là tự làm hỏng
   *     chính phép đo c4.
   *   * Ticket nhóm `active` còn lại: phần lớn có một lượt đang mở hoặc đã nộp.
   *   * Ticket đã kết: một phần có lượt `accepted` — lượt đóng, không ảnh hưởng
   *     bậc nào của 19.1, nhưng làm bảng to đúng cỡ đời thật.
   */
  let lo_luot: string[] = [];

  const xaLoLuot = (): void => {
    if (lo_luot.length === 0) return;
    batch.push(
      db.prepare(
        `INSERT INTO luot_giao
           (id, workspace_id, ticket_id, so_luot, loai,
            nguoi_giao_loai, nguoi_giao_agent_id, nguoi_nhan_agent_id, trang_thai,
            han_phan_hoi_luc, tao_luc, cap_nhat_luc)
         VALUES ` + lo_luot.join(','),
      ),
    );
    lo_luot = [];
  };

  const xaLo = (): void => {
    if (lo.length === 0) return;
    batch.push(
      db.prepare(
        `INSERT INTO ticket
           (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
            chiu_trach_nhiem_loai, chiu_trach_nhiem_agent_id, nguoi_tao_loai,
            tao_luc, cap_nhat_luc, bat_dau_luc, xong_luc, chu_tu_lam, trong_tay_tu_luc,
            co_khong_ai_cam, co_can_review_lai, can_review_lai_luc)
         VALUES ` + lo.join(','),
      ),
    );
    lo = [];
  };

  const xaBatch = async (): Promise<void> => {
    if (batch.length === 0) return;
    await db.batch(batch);
    batch = [];
  };

  for (let i = 0; i < so_du_an_sinh; i += 1) {
    const pid = du_an_id[i]!;
    for (let so = 1; so <= dem[i]!; so += 1) {
      const trang_thai = theoTrongSo(r(), PHAN_BO_TRANG_THAI);
      const uu_tien = theoTrongSo(r(), PHAN_BO_UU_TIEN);
      const tao_luc = t0 + Math.floor(r() * HAI_NAM_MS);
      const cap_nhat_luc = tao_luc + Math.floor(r() * (MOC_BAY_GIO - tao_luc));

      const nhom_active = trang_thai === 'in_progress' || trang_thai === 'verifying';
      const nhom_closed =
        trang_thai === 'done' || trang_thai === 'canceled' || trang_thai === 'duplicate';

      const bat_dau_luc = nhom_active || nhom_closed ? tao_luc + Math.floor(r() * 60_000) : null;
      const xong_luc = trang_thai === 'done' ? cap_nhat_luc : null;

      // 55% ticket giao cho một agent, còn lại chủ chịu trách nhiệm.
      const ctn = r() < 0.55 ? agent_id[Math.floor(r() * SO_AGENT)]! : null;

      // "Đang làm mà không ai cầm" (SPEC 19.1): chỉ ticket nhóm `active` mới có
      // mốc này, và chỉ một phần nhỏ — đúng như đời thật.
      const trong_tay = nhom_active && r() < 0.15 ? cap_nhat_luc : null;

      const co_khong_ai_cam = trong_tay !== null && r() < 0.2 ? 1 : 0;
      const co_can_review_lai = nhom_active && r() < 0.02 ? 1 : 0;
      /*
       * Mốc của cờ (migration 0011): **cờ và mốc phải cùng có hoặc cùng không**, hai
       * trigger `tg_ticket_can_review_lai_*` ABORT nếu lệch. Nên dữ liệu giả phải
       * tôn trọng đúng luật đó — nếu không cả lượt sinh dữ liệu đổ.
       */
      const can_review_lai_luc = co_can_review_lai === 1 ? cap_nhat_luc : null;

      lo.push(
        `(${nhay(`tk-${soBu(i, 3)}-${soBu(so, 6)}`)}, ${nhay(WS)}, ${nhay(pid)}, ${String(so)},` +
          ` ${nhay(`Viec gia ${soBu(i, 3)}-${soBu(so, 6)}`)},` +
          ` ${nhay(trang_thai)}, ${nhay(uu_tien)}, ${String(HANG_UU_TIEN[uu_tien])},` +
          ` ${ctn === null ? "'owner', NULL" : `'agent', ${nhay(ctn)}`}, 'owner',` +
          ` ${String(tao_luc)}, ${String(cap_nhat_luc)},` +
          ` ${bat_dau_luc === null ? 'NULL' : String(bat_dau_luc)},` +
          ` ${xong_luc === null ? 'NULL' : String(xong_luc)}, 0,` +
          ` ${trong_tay === null ? 'NULL' : String(trong_tay)},` +
          ` ${String(co_khong_ai_cam)}, ${String(co_can_review_lai)},` +
          ` ${can_review_lai_luc === null ? 'NULL' : String(can_review_lai_luc)})`,
      );

      const tk_id = `tk-${soBu(i, 3)}-${soBu(so, 6)}`;

      /* --- Lượt giao của ticket này (SPEC mục 5) ------------------- */
      const nhan_agent = agent_id[Math.floor(rl() * SO_AGENT)]!;
      const giao_agent = agent_id[Math.floor(rl() * SO_AGENT)]!;
      const boc = rl();
      let trang_thai_luot: string | null = null;

      if (nhom_active && trong_tay === null) {
        // 85% ticket active đang thật sự ở tay ai đó.
        if (boc < 0.6) trang_thai_luot = 'in_progress';
        else if (boc < 0.72) trang_thai_luot = 'pending';
        else if (boc < 0.85) trang_thai_luot = 'submitted';
      } else if (nhom_closed && boc < 0.3) {
        trang_thai_luot = 'accepted';
      }

      if (trang_thai_luot !== null) {
        const han =
          trang_thai_luot === 'pending' ? cap_nhat_luc + 15 * 60_000 : null;
        lo_luot.push(
          `(${nhay(`lg-${soBu(i, 3)}-${soBu(so, 6)}`)}, ${nhay(WS)}, ${nhay(tk_id)}, 1, 'work',` +
            ` 'agent', ${nhay(giao_agent)}, ${nhay(nhan_agent)}, ${nhay(trang_thai_luot)},` +
            ` ${han === null ? 'NULL' : String(han)}, ${String(cap_nhat_luc)}, ${String(cap_nhat_luc)})`,
        );
      }

      if (lo.length >= CO_MOT_LO) {
        // Ticket **trước**, lượt giao **sau**: khoá ngoài và trigger khớp
        // workspace của 0004 đọc dòng `ticket` ngay lúc chèn.
        xaLo();
        xaLoLuot();
      }
      if (batch.length >= LO_MOT_BATCH) await xaBatch();
    }
  }
  xaLo();
  xaLoLuot();
  await xaBatch();

  // SQLite không tự cập nhật thống kê; thiếu `ANALYZE` thì bộ chọn kế hoạch đoán
  // mò và `EXPLAIN QUERY PLAN` ở đây có thể khác hệ thật sau vài tháng chạy.
  // D1 có thể chặn lệnh này (`SQLITE_AUTH`); chặn thì bỏ qua và ghi lại, chứ
  // không giả vờ là đã chạy.
  let da_analyze = true;
  try {
    await db.prepare('ANALYZE').run();
  } catch {
    da_analyze = false;
  }

  const ms = Date.now() - bat_dau;

  const co_db_byte = await coDb(db);

  const { results: tt } = await db
    .prepare(
      'SELECT trang_thai, count(*) AS n FROM ticket WHERE workspace_id = ? GROUP BY trang_thai',
    )
    .bind(WS)
    .all<{ trang_thai: string; n: number }>();
  const theo_trang_thai: Record<string, number> = {};
  for (const d of tt) theo_trang_thai[d.trang_thai] = d.n;

  const { results: lt } = await db
    .prepare(
      'SELECT trang_thai, count(*) AS n FROM luot_giao WHERE workspace_id = ? GROUP BY trang_thai',
    )
    .bind(WS)
    .all<{ trang_thai: string; n: number }>();
  const luot_theo_trang_thai: Record<string, number> = {};
  let so_luot_giao = 0;
  for (const d of lt) {
    luot_theo_trang_thai[d.trang_thai] = d.n;
    so_luot_giao += d.n;
  }

  const to = await db
    .prepare(
      `SELECT project_id, count(*) AS n FROM ticket WHERE workspace_id = ?
        GROUP BY project_id ORDER BY n DESC LIMIT 1`,
    )
    .bind(WS)
    .first<{ project_id: string; n: number }>();

  const tong = await db
    .prepare('SELECT count(*) AS n FROM ticket WHERE workspace_id = ?')
    .bind(WS)
    .first<{ n: number }>();
  const so_du_an = await db
    .prepare('SELECT count(*) AS n FROM project WHERE workspace_id = ?')
    .bind(WS)
    .first<{ n: number }>();

  return {
    ms,
    co_db_byte,
    so_du_an: so_du_an?.n ?? 0,
    so_ticket: tong?.n ?? 0,
    du_an_to_nhat: to?.project_id ?? '',
    so_ticket_du_an_to_nhat: to?.n ?? 0,
    theo_trang_thai,
    so_luot_giao,
    luot_theo_trang_thai,
    da_analyze,
  };
}
