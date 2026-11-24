/**
 * **Bộ đo mốc hiệu năng** — SPEC 19.12 câu 1 (và 17.10 mục 10):
 * 200 dự án + 200.000 ticket, danh sách ticket và Tổng quan mở **dưới 1 giây**
 * sau lần tải đầu; thiết kế còn phải chịu thêm 300 dự án không đổi kiến trúc.
 *
 * Đây là **món nợ của phần 1**: index và khoá keyset đã thiết kế theo mốc này
 * (xem `migrations/0002_workspace_khop_va_index.sql` và `0003`), nhưng trước
 * lượt này chưa ai đo thật.
 *
 * Luật của bộ đo, để số đo không tự lừa mình:
 *
 *  1. **Đi đúng đường thật.** Danh sách ticket gọi `lietKeTicket` của
 *     `src/doc-ticket.ts`; câu SQL để `EXPLAIN` lấy từ `thamSoLietKeTicket` +
 *     `cauLenhDanhSachTicket` — cùng một hàm mà đường HTTP dùng. Không có chỗ
 *     nào trong file này viết lại SQL danh sách.
 *  2. **Làm nóng rồi mới đo.** Lần đầu phải nạp trang index từ đĩa; SPEC nói
 *     "sau lần tải đầu", nên lần đầu không tính vào p50/p95.
 *  3. **p50 và p95**, không phải trung bình: một lần chậm bị trung bình làm
 *     loãng, còn p95 thì không.
 *
 * Chạy bằng `npm run do-hieu-nang`. **Không** nằm trong `npm test`: tên file
 * không có `.test.`, nên glob mặc định của vitest không nhặt.
 *
 * **BAT-72 — vế "chịu thêm 300 dự án"** (SPEC dòng 478 = 17.10, dòng 599 = 19.12
 * câu 1): cùng file này chạy với `hieu-nang/vitest-500.config.ts` (binding
 * `SO_DU_AN_DO = '500'`; `npm run do-hieu-nang-500`). 300 dự án thêm **không kèm
 * ticket thêm** — SPEC nói "mọi tổ hợp nhỏ hơn 200.000 ticket" — nên tổng ticket
 * giữ 200.000 và chỉ số dự án đổi. Mọi phép đo, `LAM_NONG`, `SO_LAN_DO` và ngưỡng
 * giữ nguyên; tiêu đề, phép kiểm số dự án và tên d2 đọc số dự án thực.
 */

import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { TRANG_THAI_TICKET, type AiGoi, type TrangThaiTicket } from '@baton/shared';
// `lietKeDuAn` và bộ dựng câu danh sách ticket ở `doc-du-an.ts`; `lietKeTicket`
// ở `doc-ticket.ts`. Cả hai đều là **mã thật** của đường HTTP.
import { cauLenhDanhSachTicket, lietKeDuAn } from '../../src/doc-du-an.js';
import {
  SQL_TICKET_CAN_BAT_CO,
  lietKeTicket,
  thamSoLietKeTicket,
  ticketDangCanBatCo,
  type YeuCauLietKeTicket,
} from '../../src/doc-ticket.js';
import { tongQuan } from '../../src/doc-tong-quan.js';
import { manHinhDanhSachTicket } from '../../src/doc-man-hinh-ticket.js';
import {
  MOC_BAY_GIO,
  NGUONG_MS,
  SO_TICKET,
  WS,
  sinhDuLieu,
  soDuAnDo,
  type KetQuaSinh,
} from './sinh-du-lieu.js';

/** Số dự án của lần chạy này: 200 (config cũ) hoặc 500 (`vitest-500.config.ts`). */
const SO_DU_AN = soDuAnDo();

/** Trần `LIMIT_TRANG_TOI_DA` mà `kiemLimit` áp cho mọi danh sách (200). */
const LIMIT_TOI_DA = 200;

/** Chủ — mọi phép đo chạy dưới quyền chủ (thấy toàn bộ dữ liệu, ca nặng nhất). */
const CHU: AiGoi = { loai: 'chu' };

/** Một trang danh sách = 50 dòng (mặc định của `kiemLimit`). */
const TRANG = 50;

const LAM_NONG = 1;

/**
 * 50 lượt đo mỗi truy vấn (SPEC 19.12 không nói số; brief đòi ≥20).
 *
 * Lấy nhiều hơn mức tối thiểu vì `Date.now()` chỉ có độ phân giải **1 ms**: ở
 * mức 0–1 ms mỗi lượt, p50/p95 gần như chỉ nói "nhanh hơn 1 ms". Trung bình
 * trên 50 lượt (`tb` dưới đây) mới đủ mịn để so trang 1 với trang 200 — mà đó
 * mới là câu hỏi thật của keyset.
 */
const SO_LAN_DO = 50;

/* ------------------------------------------------------------------ *
 * Đo
 * ------------------------------------------------------------------ */

interface Dong {
  ten: string;
  p50: number;
  p95: number;
  /**
   * Trung bình trên `SO_LAN_DO` lượt, **mịn hơn 1 ms**.
   *
   * Hợp lệ vì trong workerd đồng hồ chỉ nhảy sau mỗi lần I/O: tổng các hiệu
   * từng lượt đúng bằng thời gian cả khối, nên chia cho số lượt cho độ phân
   * giải 1/`SO_LAN_DO` mili giây.
   */
  tb: number;
  dat: boolean;
  /** Dòng `EXPLAIN QUERY PLAN` đáng kể nhất. */
  ke_hoach: string;
  /** Số dòng trả về — để thấy ngay nếu một phép đo chạy trên tập rỗng. */
  so_dong: number;
  ghi_chu?: string;
  /**
   * Phép đo **không chạy được** (hàm ném) — chỉ các dòng `doManHinh` (BAT-9).
   * Có lỗi thì `dat = false`, p50/p95 = -1, và lỗi in nguyên văn trong bảng.
   */
  loi?: string;
}

const bang: Dong[] = [];

function phanVi(ds: number[], p: number): number {
  const s = [...ds].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[Math.max(0, i)]!;
}

/**
 * Chạy `chay` một lần làm nóng + `SO_LAN_DO` lần đo, ghi p50/p95 vào bảng.
 *
 * `Date.now()` trong workerd chỉ nhảy sau mỗi lần I/O; truy vấn D1 **là** I/O,
 * nên hiệu hai mốc quanh một `await` chính là thời gian của truy vấn đó.
 */
async function do_(
  ten: string,
  chay: () => Promise<number>,
  ke_hoach: string,
  ghi_chu?: string,
): Promise<Dong> {
  for (let i = 0; i < LAM_NONG; i += 1) await chay();

  const ms: number[] = [];
  let so_dong = 0;
  for (let i = 0; i < SO_LAN_DO; i += 1) {
    const t = Date.now();
    so_dong = await chay();
    ms.push(Date.now() - t);
  }

  const d: Dong = {
    ten,
    p50: phanVi(ms, 50),
    p95: phanVi(ms, 95),
    tb: ms.reduce((s, v) => s + v, 0) / ms.length,
    dat: phanVi(ms, 95) < NGUONG_MS,
    ke_hoach,
    so_dong,
    ...(ghi_chu === undefined ? {} : { ghi_chu }),
  };
  bang.push(d);
  return d;
}

/**
 * **Đo một hàm MÀN HÌNH thật** (BAT-9 — nghiệm thu SPEC mục 17 bước 10).
 *
 * Khác `do_`: hàm màn hình **ném** thì không đổ cả bộ đo mà ghi một dòng
 * `KHÔNG ĐẠT` kèm lỗi nguyên văn, để bảng vẫn in đủ các số đo còn lại. Lỗi đó là
 * một kết quả đo (màn hình không mở được), không phải một sự cố của bộ đo.
 */
async function doManHinh(
  ten: string,
  chay: () => Promise<number>,
  ghi_chu: string,
): Promise<Dong> {
  try {
    return await do_(ten, chay, '(nhiều câu — hàm màn hình thật)', ghi_chu);
  } catch (e) {
    const d: Dong = {
      ten,
      p50: -1,
      p95: -1,
      tb: -1,
      dat: false,
      ke_hoach: '(không chạy được)',
      so_dong: 0,
      ghi_chu,
      loi: e instanceof Error ? e.message : String(e),
    };
    bang.push(d);
    return d;
  }
}

/** `EXPLAIN QUERY PLAN` **nguyên văn**, gộp thành một dòng. */
async function keHoach(sql: string, bind: (string | number)[]): Promise<string> {
  const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bind)
    .all<{ detail: string }>();
  return results.map((r) => r.detail).join(' | ');
}

/** Kế hoạch của **đúng** câu danh sách ticket mà `lietKeTicket` sẽ chạy. */
async function keHoachDanhSach(yeu_cau: YeuCauLietKeTicket): Promise<string> {
  const tham_so = thamSoLietKeTicket(CHU, WS, yeu_cau, TRANG + 1);
  const { sql, bind } = cauLenhDanhSachTicket(tham_so);
  return keHoach(sql, bind);
}

/** Đo một truy vấn SQL thô (các truy vấn **dự phóng** của Tổng quan). */
async function doSql(ten: string, sql: string, bind: (string | number)[], ghi_chu: string): Promise<Dong> {
  const kh = await keHoach(sql, bind);
  return do_(
    ten,
    async () => {
      const { results } = await env.DB.prepare(sql)
        .bind(...bind)
        .all();
      return results.length;
    },
    kh,
    ghi_chu,
  );
}

/** Đi theo cursor tới trang thứ `trang`, rồi đo **chính trang đó**. */
async function doTrangSau(ten: string, trang: number): Promise<Dong> {
  let cursor: string | null = null;
  for (let i = 1; i < trang; i += 1) {
    const t: { cursor_sau: string | null } = await lietKeTicket(env.DB, CHU, WS, {
      limit: TRANG,
      ...(cursor === null ? {} : { cursor }),
    });
    cursor = t.cursor_sau;
    if (cursor === null) throw new Error(`Hết dữ liệu trước trang ${String(trang)}.`);
  }
  const cuoi = cursor;
  if (cuoi === null) throw new Error('Không dựng được cursor trang sâu.');

  const kh = await keHoachDanhSach({ limit: TRANG, cursor: cuoi });
  return do_(
    ten,
    async () => {
      const t = await lietKeTicket(env.DB, CHU, WS, { limit: TRANG, cursor: cuoi });
      return t.items.length;
    },
    kh,
  );
}

/* ------------------------------------------------------------------ *
 * In bảng
 * ------------------------------------------------------------------ */

function inBang(sinh: KetQuaSinh): void {
  const co_db =
    sinh.co_db_byte < 0
      ? 'không đo được (D1 chặn PRAGMA — SQLITE_AUTH)'
      : `${(sinh.co_db_byte / (1024 * 1024)).toFixed(1)} MB (${String(sinh.co_db_byte)} byte)`;
  const giay = (sinh.ms / 1000).toFixed(1);

  const d: string[] = [];
  d.push('');
  d.push('='.repeat(100));
  d.push(
    `ĐO MỐC HIỆU NĂNG — SPEC 19.12 câu 1 (${String(SO_DU_AN)} dự án + ` +
      `${String(SO_TICKET)} ticket, < 1 giây)`,
  );
  d.push('='.repeat(100));
  d.push(`Dữ liệu : ${String(sinh.so_du_an)} dự án, ${String(sinh.so_ticket)} ticket`);
  d.push(`Sinh    : ${giay} giây`);
  d.push(`Cỡ DB   : ${co_db}`);
  d.push(`ANALYZE : ${sinh.da_analyze ? 'đã chạy' : 'D1 chặn — kế hoạch dựa trên ước lượng mặc định'}`);
  d.push(
    `Dự án to nhất: ${sinh.du_an_to_nhat} — ${String(sinh.so_ticket_du_an_to_nhat)} ticket`,
  );
  d.push(
    'Trạng thái: ' +
      Object.entries(sinh.theo_trang_thai)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', '),
  );
  d.push(
    `Lượt giao: ${String(sinh.so_luot_giao)} dòng — ` +
      Object.entries(sinh.luot_theo_trang_thai)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', '),
  );
  d.push('-'.repeat(100));
  d.push(
    'Truy vấn'.padEnd(46) +
      'p50'.padStart(7) +
      'p95'.padStart(7) +
      'tb'.padStart(10) +
      'dòng'.padStart(8) +
      '  kết luận',
  );
  d.push('-'.repeat(100));
  for (const r of bang) {
    if (r.loi !== undefined) {
      d.push(`${r.ten.padEnd(46)}${'—'.padStart(7)}${'—'.padStart(7)}${'—'.padStart(10)}${'—'.padStart(8)}  KHÔNG ĐẠT (ném lỗi)`);
      d.push(`      lỗi: ${r.loi}`);
      continue;
    }
    d.push(
      r.ten.padEnd(46) +
        `${String(r.p50)}ms`.padStart(7) +
        `${String(r.p95)}ms`.padStart(7) +
        `${r.tb.toFixed(2)}ms`.padStart(10) +
        String(r.so_dong).padStart(8) +
        `  ${r.dat ? 'ĐẠT' : 'KHÔNG ĐẠT'} (cách ngưỡng ${String(NGUONG_MS - r.p95)}ms)`,
    );
  }
  d.push('-'.repeat(100));
  d.push('EXPLAIN QUERY PLAN (nguyên văn):');
  for (const r of bang) {
    d.push(`  • ${r.ten}`);
    d.push(`      ${r.ke_hoach}`);
    if (r.ghi_chu !== undefined) d.push(`      ghi chú: ${r.ghi_chu}`);
  }
  d.push('='.repeat(100));
  d.push('');

  console.log(d.join('\n'));
}

/* ------------------------------------------------------------------ *
 * Kịch bản
 * ------------------------------------------------------------------ */

describe(`Mốc ${String(SO_DU_AN)} dự án + 200.000 ticket — SPEC 19.12 câu 1`, () => {
  it('đo danh sách ticket, trang sâu, Tổng quan và danh sách dự án', async () => {
    const sinh = await sinhDuLieu();
    expect(sinh.so_du_an).toBe(SO_DU_AN);
    expect(sinh.so_ticket).toBe(SO_TICKET);

    const du_an = sinh.du_an_to_nhat;
    const mot_trang_thai: TrangThaiTicket = 'in_progress';
    expect(Object.keys(TRANG_THAI_TICKET)).toContain(mot_trang_thai);

    /* --- a. Danh sách ticket, trang đầu --------------------------- */

    const ds = async (yeu_cau: YeuCauLietKeTicket): Promise<number> => {
      const t = await lietKeTicket(env.DB, CHU, WS, yeu_cau);
      return t.items.length;
    };

    await do_(
      'a1 danh sách, trang 1, mọi dự án',
      () => ds({ limit: TRANG }),
      await keHoachDanhSach({ limit: TRANG }),
    );
    await do_(
      'a2 danh sách, trang 1, lọc 1 dự án',
      () => ds({ limit: TRANG, project_id: du_an }),
      await keHoachDanhSach({ limit: TRANG, project_id: du_an }),
      `dự án to nhất (${String(sinh.so_ticket_du_an_to_nhat)} ticket)`,
    );
    await do_(
      'a3 danh sách, trang 1, lọc trạng thái',
      () => ds({ limit: TRANG, trang_thai: mot_trang_thai }),
      await keHoachDanhSach({ limit: TRANG, trang_thai: mot_trang_thai }),
    );
    await do_(
      'a4 danh sách, trang 1, lọc dự án + trạng thái',
      () => ds({ limit: TRANG, project_id: du_an, trang_thai: mot_trang_thai }),
      await keHoachDanhSach({ limit: TRANG, project_id: du_an, trang_thai: mot_trang_thai }),
    );

    /*
     * a5 — **`lietKeTicket` trọn vẹn với trang lớn.**
     *
     * Bốn phép đo trên cũng gọi `lietKeTicket`, nhưng với `limit = 50` thì câu
     * tra "người đang cầm cho cả trang" (SPEC 19.1) chỉ chạy **một lô**. D1 chặn
     * ở 100 tham số bind nên `boiCanhNguoiCamNhieu` chia lô qua `chiaLoThamSo`
     * (tổng ≤ 90 tham số/câu ⇒ 89 id + `workspace_id`); `limit = 100`
     * là trang nhỏ nhất đi qua **hai** lô, tức đo đúng đường mà bộ đo lần trước
     * đã bắt lỗi `too many SQL variables`.
     */
    await do_(
      'a5 danh sách, trang 1, limit 100 (hai lô người cầm)',
      () => ds({ limit: 100 }),
      await keHoachDanhSach({ limit: 100 }),
      'gồm cả câu tra người đang cầm (chia lô ≤ 90 tham số) của SPEC 19.1',
    );

    /*
     * a6, a7 — **màn hình danh sách THẬT của web** (BAT-9, mục 17 bước 10).
     *
     * a1–a5 đo `lietKeTicket` (đường của `baton list` / `GET /v1/ticket`). Trang
     * "Tất cả việc" của web lại gọi `GET /v1/man-hinh-ticket`, tức
     * `manHinhDanhSachTicket` = `lietKeTicket` + `themCuaThe` + tên agent, với
     * `limit = LIMIT_TRANG_TICKET` (200) của `packages/web/src/api.ts`. a6 đo trang
     * mặc định 50 dòng, a7 đo đúng cỡ trang web xin.
     */
    await doManHinh(
      'a6 màn hình danh sách web, limit 50',
      async () => (await manHinhDanhSachTicket(env.DB, CHU, WS, { limit: TRANG }, MOC_BAY_GIO)).items.length,
      'mã thật của GET /v1/man-hinh-ticket (trang mặc định 50)',
    );
    await doManHinh(
      'a7 màn hình danh sách web, limit 200 (= web)',
      async () => (await manHinhDanhSachTicket(env.DB, CHU, WS, { limit: 200 }, MOC_BAY_GIO)).items.length,
      'mã thật của GET /v1/man-hinh-ticket với LIMIT_TRANG_TICKET = 200 của web',
    );

    /* --- b. Trang sâu (keyset) ------------------------------------ */

    const t1 = bang.find((r) => r.ten.startsWith('a1'))!;
    const t50 = await doTrangSau('b1 danh sách, trang 50 (keyset)', 50);
    const t200 = await doTrangSau('b2 danh sách, trang 200 (keyset)', 200);

    /* --- c. Tổng quan (DỰ PHÓNG — xem ghi chú) -------------------- */

    /*
     * **Phần 1 chưa có truy vấn Tổng quan thật.** Tổng quan là SPEC mục 11 và
     * thuộc phần 6; trong `packages/api/src` lượt này chỉ có một truy vấn phục
     * vụ Tổng quan là `ticketDangCanBatCo` (cờ "Đang làm mà không ai cầm" —
     * SPEC mục 11 ô "Cần chú ý"). Hai truy vấn gom nhóm dưới đây là **đo dự
     * phóng**: chúng là thứ Tổng quan chắc chắn cần (mục 11 ô "Dự án": mỗi dự
     * án một hàng với số ticket theo trạng thái, và chỉ báo 🟢/🟡/⚪ của 19.6
     * dựa trên "có ticket nhóm `active` hay không"), nhưng **không phải** mã
     * đang có. Số của chúng là mốc cho phần 6, không phải nghiệm thu phần 1.
     */
    const DU_PHONG = 'ĐO DỰ PHÓNG — phần 1 chưa có mã Tổng quan (SPEC mục 11 thuộc phần 6)';

    await doSql(
      'c1 Tổng quan: đếm ticket theo dự án × trạng thái',
      `SELECT project_id, trang_thai, count(*) AS n FROM ticket
        WHERE workspace_id = ? AND xoa_luc IS NULL
        GROUP BY project_id, trang_thai`,
      [WS],
      DU_PHONG,
    );
    await doSql(
      'c2 Tổng quan: đếm ticket nhóm active mỗi dự án',
      `SELECT project_id, count(*) AS n FROM ticket
        WHERE workspace_id = ? AND xoa_luc IS NULL AND trang_thai IN ('in_progress', 'verifying')
        GROUP BY project_id`,
      [WS],
      `${DU_PHONG}; chỉ báo 🟢/⚪ của SPEC 19.6`,
    );
    await doSql(
      'c3 Tổng quan: "Vừa xong" 24 giờ qua',
      `SELECT id, so, project_id, tieu_de, xong_luc FROM ticket
        WHERE workspace_id = ? AND xoa_luc IS NULL AND xong_luc IS NOT NULL AND xong_luc >= ?
        ORDER BY xong_luc DESC LIMIT 50`,
      [WS, MOC_BAY_GIO - 24 * 60 * 60 * 1000],
      `${DU_PHONG}; SPEC mục 11 ô "Vừa xong"`,
    );

    // Truy vấn Tổng quan **thật** duy nhất của phần 1.
    await do_(
      'c4 ticketDangCanBatCo (mã thật, SPEC 19.1)',
      async () => (await ticketDangCanBatCo(env.DB, WS, MOC_BAY_GIO)).length,
      // **Chính câu** của `ticketDangCanBatCo` (hằng số `SQL_TICKET_CAN_BAT_CO`
      // trong `src/doc-ticket.ts`), không phải một bản chép. Chép lại là cách
      // chắc chắn nhất để `EXPLAIN` in ra một kế hoạch không phải kế hoạch thật
      // — trước lượt này bản chép đã lệch một mệnh đề `workspace_id`.
      await keHoach(SQL_TICKET_CAN_BAT_CO, [WS]),
      'mã thật trong src/doc-ticket.ts; SPEC mục 11 ô "Cần chú ý"',
    );

    /*
     * c5 — **Tổng quan THẬT** (BAT-9, nghiệm thu SPEC mục 17 bước 10).
     *
     * c1–c3 ở trên là đo dự phóng từ phần 1; từ phần 6 đã có `tongQuan` của
     * `src/doc-tong-quan.ts` — **đúng hàm** mà `GET /v1/tong-quan` gọi (năm khối +
     * ô Cần Chủ, một lượt). Đo nó dưới quyền chủ trên cùng bộ 200 dự án + 200.000
     * ticket, sau một lần làm nóng (= "sau lần tải đầu" của mục 17 bước 10).
     * Không có `EXPLAIN` một dòng vì hàm chạy nhiều câu song song.
     */
    await doManHinh(
      'c5 Tổng quan THẬT (tongQuan, năm khối)',
      async () => {
        const tq = await tongQuan(env.DB, CHU, WS, MOC_BAY_GIO);
        return tq.du_an.length;
      },
      'mã thật của GET /v1/tong-quan; SPEC mục 11 + mục 17 bước 10',
    );

    /* --- d. Danh sách dự án --------------------------------------- */

    await do_(
      'd1 danh sách dự án, trang 1 (keyset ten,id)',
      async () => (await lietKeDuAn(env.DB, CHU, WS, { limit: TRANG })).items.length,
      await keHoach(
        `SELECT id, ma, ten FROM project WHERE workspace_id = ? AND trang_thai <> 'archived'
          ORDER BY ten, id LIMIT ?`,
        [WS, TRANG + 1],
      ),
    );
    /*
     * d2 — một trang ở trần `kiemLimit` (200). Với 200 dự án đó là toàn bộ danh
     * sách; với 500 dự án (BAT-72) chỉ là trang 1 trong 3, nên tên dòng nói rõ.
     */
    const so_trang_du_an = Math.ceil(SO_DU_AN / LIMIT_TOI_DA);
    await do_(
      SO_DU_AN <= LIMIT_TOI_DA
        ? `d2 danh sách dự án, toàn bộ ${String(SO_DU_AN)} dòng`
        : `d2 danh sách dự án, limit ${String(LIMIT_TOI_DA)} (trang 1/${String(so_trang_du_an)})`,
      async () => (await lietKeDuAn(env.DB, CHU, WS, { limit: LIMIT_TOI_DA })).items.length,
      await keHoach(
        `SELECT id, ma, ten FROM project WHERE workspace_id = ? AND trang_thai <> 'archived'
          ORDER BY ten, id LIMIT ?`,
        [WS, LIMIT_TOI_DA + 1],
      ),
    );

    /*
     * d3 — **đi hết mọi trang** theo cursor, limit 200 (BAT-72).
     *
     * `kiemLimit` chặn limit ở 200, nên với 500 dự án không có một lời gọi nào
     * trả đủ danh sách: muốn có cả 500 dòng thì phải đi 3 trang. Một lần đo = cả
     * lượt đi trang (mọi lời gọi `lietKeDuAn` nối tiếp nhau). Phép đo kiểm luôn
     * tổng số dòng gom được = số dự án, để không đo nhầm trên một lượt đi cụt.
     * Kế hoạch in ra là của câu **có cursor** `(ten, id) > (?, ?)` — trang 2 trở đi.
     */
    const di_het_trang = async (): Promise<number> => {
      let tong = 0;
      let cursor: string | null = null;
      do {
        const t: { items: unknown[]; cursor_sau: string | null } = await lietKeDuAn(env.DB, CHU, WS, {
          limit: LIMIT_TOI_DA,
          ...(cursor === null ? {} : { cursor }),
        });
        tong += t.items.length;
        cursor = t.cursor_sau;
      } while (cursor !== null);
      return tong;
    };
    expect(await di_het_trang()).toBe(SO_DU_AN);
    await do_(
      `d3 danh sách dự án, đi hết ${String(so_trang_du_an)} trang (limit ${String(LIMIT_TOI_DA)}, cursor)`,
      di_het_trang,
      await keHoach(
        `SELECT id, ma, ten FROM project WHERE workspace_id = ? AND trang_thai <> 'archived'
          AND (ten, id) > (?, ?) ORDER BY ten, id LIMIT ?`,
        [WS, 'Du an 199', 'pj-199', LIMIT_TOI_DA + 1],
      ),
      'một lần đo = cả lượt đi trang; số dòng = tổng gom được, phải bằng số dự án',
    );

    inBang(sinh);

    /* --- Kết luận ------------------------------------------------- */

    /*
     * Dòng **ném lỗi** của `doManHinh` (màn hình không mở được) làm bộ đo **đỏ**.
     * Lần nghiệm thu BAT-9 có miễn trừ cho đúng lỗi `too many SQL variables` của
     * bước 10; BAT-42 đã sửa lỗi đó (chia lô tham số, `src/chia-lo-tham-so.ts`)
     * nên miễn trừ đã **bỏ** — mọi lỗi giờ là hồi quy.
     */
    for (const r of bang) {
      expect(r.loi, `${r.ten}: màn hình ném lỗi`).toBeUndefined();
      expect(
        r.dat,
        `${r.ten}: p95 = ${String(r.p95)}ms ≥ ngưỡng ${String(NGUONG_MS)}ms. Kế hoạch: ${r.ke_hoach}`,
      ).toBe(true);
    }

    /*
     * **Keyset phải phẳng**: trang 200 không được chậm theo độ sâu.
     *
     * So trên `tb` (trung bình mịn), không trên p95: ở mức dưới 1 ms thì p95 của
     * cả ba trang đều là "1ms" và phép so sẽ xanh kể cả khi keyset đã hỏng.
     * Trần = gấp 3 lần trang 1, có sàn 0,5 ms cho nhiễu đo — cái cần bắt là hành
     * vi O(độ sâu) của `OFFSET` (trang 200 sẽ chậm cỡ **200 lần**), không phải
     * vài phần mười mili giây.
     */
    const tran = Math.max(0.5, t1.tb * 3);
    expect(
      t200.tb <= tran,
      `Keyset KHÔNG phẳng: trang 1 tb = ${t1.tb.toFixed(2)}ms, trang 50 tb = ${t50.tb.toFixed(2)}ms,` +
        ` trang 200 tb = ${t200.tb.toFixed(2)}ms (trần ${tran.toFixed(2)}ms). Keyset đang hỏng.`,
    ).toBe(true);

    // Không câu nào được sắp lại trong bộ nhớ: ở mốc 200.000 dòng thì
    // `USE TEMP B-TREE FOR ORDER BY` là hỏng kiến trúc, không phải chậm chút ít.
    for (const r of bang) {
      if (r.ten.startsWith('c')) continue; // gom nhóm thì B-tree tạm là bình thường
      expect(r.ke_hoach, `${r.ten} phải đi theo index, không sắp lại trong bộ nhớ`).not.toContain(
        'TEMP B-TREE FOR ORDER BY',
      );
    }
  });
});
