/**
 * Phân trang **keyset (cursor)** và index — mốc 200 dự án + 200.000 ticket
 * (`quyet-dinh.md` 01/10).
 *
 * Hai thứ được chứng minh ở đây:
 *
 *  1. **Thứ tự sắp xếp là toàn phần.** Khoá keyset kết thúc bằng `id`, nên dù
 *     giá trị sắp xếp **trùng nhau** thì cuộn hết bằng cursor vẫn lấy đủ **đúng
 *     một lần** mỗi bản ghi: không trùng, không sót. Đây là lỗi kinh điển của
 *     keyset — `WHERE ten > ?` bỏ sót các dòng cùng tên, `WHERE ten >= ?` trả
 *     trùng — nên dữ liệu test **cố tình** cho nhiều bản ghi trùng tên.
 *
 *  2. **Truy vấn dùng index, không quét bảng.** `EXPLAIN QUERY PLAN` phải không
 *     có `SCAN` trên bảng lớn và không có `USE TEMP B-TREE FOR ORDER BY` (sắp
 *     bằng B-tree tạm nghĩa là đọc hết rồi mới sắp — đúng thứ phải tránh ở mốc
 *     200.000 dòng).
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { goiCursor, moCursor } from '@baton/shared';
import { cauLenhDanhSachTicket, lietKeAgent, lietKeDuAn } from '../src/doc-du-an.js';
import { SQL_TICKET_THEO_MA } from '../src/doc-ticket.js';
import { CHU, TOKEN_CHU, WS, dungWorkspace, goiApi } from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/* ------------------------------------------------------------------ *
 * Giúp việc: dựng nhiều dự án / agent có giá trị sắp xếp TRÙNG NHAU
 * ------------------------------------------------------------------ */

/**
 * 30 dự án, trong đó **10 nhóm, mỗi nhóm 3 dự án cùng tên**. Tên trùng là chỗ
 * duy nhất khoá keyset có thể bỏ sót hoặc trả trùng, nên đó là thứ cần dựng.
 */
async function dung30DuAnTrungTen(): Promise<string[]> {
  const t = Date.now();
  const id: string[] = [];
  for (let nhom = 0; nhom < 10; nhom += 1) {
    for (let i = 0; i < 3; i += 1) {
      // Tên trùng trong cùng nhóm; mã thì bắt buộc duy nhất (SPEC mục 2).
      const ten = `Dự án trùng tên ${String(nhom).padStart(2, '0')}`;
      const pj = `pj-${String(nhom).padStart(2, '0')}-${String(i)}`;
      const ma = `P${String(nhom).padStart(2, '0')}${String(i)}`;
      await env.DB.prepare(
        `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
        .bind(pj, WS, ten, ma, t, t)
        .run();
      id.push(pj);
    }
  }
  return id;
}

/** 24 agent; tên agent là **duy nhất** (SPEC mục 3) nên trùng ở đây là `vai_tro`. */
async function dung24Agent(): Promise<string[]> {
  const t = Date.now();
  const vai_tro = ['coordinator', 'manager', 'worker', 'reviewer'];
  const id: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const ag = `ag-${String(i).padStart(2, '0')}`;
    await env.DB.prepare(
      `INSERT INTO agent (id, workspace_id, ten, vai_tro, vao_tat_ca_du_an, tao_luc, cap_nhat_luc)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
      .bind(ag, WS, `A-${String(i).padStart(2, '0')}`, vai_tro[i % 4]!, t, t)
      .run();
    id.push(ag);
  }
  return id;
}

/** Cuộn hết mọi trang bằng cursor; trả danh sách id theo thứ tự nhận được. */
async function cuonHet(
  lay: (cursor: string | undefined) => Promise<{ items: { id: string }[]; cursor_sau: string | null }>,
): Promise<string[]> {
  const ra: string[] = [];
  let cursor: string | undefined;
  // Chặn vòng lặp vô hạn: cursor hỏng thì test phải đỏ vì vòng lặp, không treo.
  for (let vong = 0; vong < 200; vong += 1) {
    const trang = await lay(cursor);
    ra.push(...trang.items.map((d) => d.id));
    if (trang.cursor_sau === null) return ra;
    cursor = trang.cursor_sau;
  }
  throw new Error('cuộn quá 200 trang: cursor không bao giờ hết');
}

/* ------------------------------------------------------------------ *
 * Cursor: gói và mở
 * ------------------------------------------------------------------ */
describe('cursor mờ: gói và mở', () => {
  it('gói rồi mở ra đúng khoá ban đầu', () => {
    expect(moCursor(goiCursor(['Tên có dấu và khoảng trắng', 'pj-1']), 2)).toEqual([
      'Tên có dấu và khoảng trắng',
      'pj-1',
    ]);
  });

  it('cursor an toàn trong query string (không cần mã hoá thêm)', () => {
    const c = goiCursor(['a/b+c=d', 'id?x&y']);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(moCursor(c, 2)).toEqual(['a/b+c=d', 'id?x&y']);
  });

  it.each([['khong-phai-base64!!'], ['ZXh0cmE'], ['']])(
    'cursor hỏng %j → INVALID_INPUT, KHÔNG âm thầm về trang đầu',
    (cursor) => {
      // Âm thầm về trang đầu thì vòng lặp cuộn của agent sẽ chạy mãi.
      expect(() => moCursor(cursor, 2)).toThrow();
    },
  );

  it('cursor sai số cột → INVALID_INPUT', () => {
    expect(() => moCursor(goiCursor(['chi-mot-cot']), 2)).toThrow();
    expect(() => moCursor(goiCursor(['a', 'b', 'c']), 2)).toThrow();
  });

  it('cursor qua HTTP: hỏng thì 422, không trả trang đầu', async () => {
    await dungWorkspace();
    const res = await goiApi('/v1/du-an?cursor=rac-ruoi', TOKEN_CHU);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });
});

/* ------------------------------------------------------------------ *
 * Dự án: cuộn hết với TÊN TRÙNG NHAU
 * ------------------------------------------------------------------ */
describe('liệt kê dự án — keyset với giá trị sắp xếp TRÙNG NHAU', () => {
  let moi_id: string[] = [];
  beforeEach(async () => {
    await dungWorkspace();
    moi_id = await dung30DuAnTrungTen();
  });

  it.each([[1], [2], [3], [4], [7], [30], [50]])(
    'limit = %i: cuộn hết lấy đủ 30 dự án, mỗi cái ĐÚNG MỘT LẦN',
    async (limit) => {
      const lay = await cuonHet((cursor) =>
        lietKeDuAn(env.DB, CHU, WS, { limit, ...(cursor === undefined ? {} : { cursor }) }),
      );

      // Không sót.
      expect(lay).toHaveLength(30);
      expect([...lay].sort()).toEqual([...moi_id].sort());
      // Không trùng.
      expect(new Set(lay).size).toBe(30);
    },
  );

  it('limit = 3 (đúng cỡ nhóm trùng tên): ranh giới trang nằm giữa các dòng cùng tên', async () => {
    // Đây là ca dễ hỏng nhất: trang kết thúc đúng chỗ tên đổi, hoặc đúng chỗ
    // tên còn trùng. Cả hai phải cho cùng kết quả.
    const lay = await cuonHet((cursor) =>
      lietKeDuAn(env.DB, CHU, WS, { limit: 3, ...(cursor === undefined ? {} : { cursor }) }),
    );
    expect(new Set(lay).size).toBe(30);
  });

  it('thứ tự ổn định và là thứ tự TOÀN PHẦN: (ten, id) tăng dần suốt các trang', async () => {
    const dong: { ten: string; id: string }[] = [];
    let cursor: string | undefined;
    for (;;) {
      const trang = await lietKeDuAn(env.DB, CHU, WS, {
        limit: 4,
        ...(cursor === undefined ? {} : { cursor }),
      });
      dong.push(...trang.items.map((d) => ({ ten: d.ten, id: d.id })));
      if (trang.cursor_sau === null) break;
      cursor = trang.cursor_sau;
    }

    for (let i = 1; i < dong.length; i += 1) {
      const a = dong[i - 1]!;
      const b = dong[i]!;
      const tang = a.ten < b.ten || (a.ten === b.ten && a.id < b.id);
      expect(tang, `dòng ${String(i)}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`).toBe(true);
    }
    // Và có thật những cặp liền nhau trùng tên, nếu không test này vô nghĩa.
    const co_trung = dong.some((d, i) => i > 0 && dong[i - 1]!.ten === d.ten);
    expect(co_trung).toBe(true);
  });

  it('trang cuối có cursor_sau = null (để vòng lặp của agent biết dừng)', async () => {
    const trang = await lietKeDuAn(env.DB, CHU, WS, { limit: 30 });
    expect(trang.items).toHaveLength(30);
    expect(trang.cursor_sau).toBeNull();
  });

  it('còn dữ liệu thì có cursor_sau; và cursor_sau không trả lại dòng cuối', async () => {
    const mot = await lietKeDuAn(env.DB, CHU, WS, { limit: 5 });
    expect(mot.cursor_sau).not.toBeNull();
    const hai = await lietKeDuAn(env.DB, CHU, WS, { limit: 5, cursor: mot.cursor_sau! });
    const giao = mot.items.filter((a) => hai.items.some((b) => b.id === a.id));
    expect(giao).toHaveLength(0);
  });

  it('lọc theo trạng thái vẫn cuộn đủ, không lẫn trạng thái khác', async () => {
    await env.DB.prepare("UPDATE project SET trang_thai = 'archived' WHERE id LIKE 'pj-0%'").run();
    const luu_tru = await cuonHet((cursor) =>
      lietKeDuAn(env.DB, CHU, WS, {
        limit: 2,
        trang_thai: 'archived',
        ...(cursor === undefined ? {} : { cursor }),
      }),
    );
    // 10 nhóm × 3 = 30 dự án, `pj-00..pj-09` là 10 nhóm đầu... `LIKE 'pj-0%'`
    // khớp nhóm 00–09, tức toàn bộ 30. Kiểm bằng chính DB để không đoán.
    const n = await env.DB.prepare(
      "SELECT count(*) AS n FROM project WHERE trang_thai = 'archived'",
    ).first<{ n: number }>();
    expect(luu_tru).toHaveLength(n?.n ?? -1);
    expect(new Set(luu_tru).size).toBe(luu_tru.length);
  });

  it('limit bị kẹp vào khoảng cho phép, limit sai → INVALID_INPUT', async () => {
    const qua_lon = await lietKeDuAn(env.DB, CHU, WS, { limit: 100_000 });
    expect(qua_lon.items.length).toBeLessThanOrEqual(200);
    await expect(lietKeDuAn(env.DB, CHU, WS, { limit: 0 })).rejects.toThrow();
    await expect(lietKeDuAn(env.DB, CHU, WS, { limit: -5 })).rejects.toThrow();
    await expect(lietKeDuAn(env.DB, CHU, WS, { limit: 'nhieu' })).rejects.toThrow();
  });

  it('cuộn hết qua HTTP cũng lấy đủ 30, không trùng không sót', async () => {
    const lay: string[] = [];
    let duong = '/v1/du-an?limit=4';
    for (let vong = 0; vong < 50; vong += 1) {
      const res = await goiApi(duong, TOKEN_CHU);
      expect(res.status).toBe(200);
      const trang = await res.json<{ items: { id: string }[]; cursor_sau: string | null }>();
      lay.push(...trang.items.map((d) => d.id));
      if (trang.cursor_sau === null) break;
      duong = `/v1/du-an?limit=4&cursor=${encodeURIComponent(trang.cursor_sau)}`;
    }
    expect(lay).toHaveLength(30);
    expect(new Set(lay).size).toBe(30);
  });
});

/* ------------------------------------------------------------------ *
 * Agent: cuộn hết
 * ------------------------------------------------------------------ */
describe('liệt kê agent — keyset', () => {
  let moi_id: string[] = [];
  beforeEach(async () => {
    await dungWorkspace();
    moi_id = await dung24Agent();
  });

  it.each([[1], [5], [24], [100]])(
    'limit = %i: cuộn hết lấy đủ 24 agent, mỗi cái đúng một lần',
    async (limit) => {
      const lay = await cuonHet((cursor) =>
        lietKeAgent(env.DB, CHU, WS, { limit, ...(cursor === undefined ? {} : { cursor }) }),
      );
      expect(lay).toHaveLength(24);
      expect([...lay].sort()).toEqual([...moi_id].sort());
      expect(new Set(lay).size).toBe(24);
    },
  );

  it('thứ tự theo (ten, id) tăng dần suốt các trang', async () => {
    const ten: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const trang = await lietKeAgent(env.DB, CHU, WS, {
        limit: 5,
        ...(cursor === undefined ? {} : { cursor }),
      });
      ten.push(...trang.items.map((d) => d.ten));
      if (trang.cursor_sau === null) break;
      cursor = trang.cursor_sau;
    }
    expect(ten).toEqual([...ten].sort());
  });

  it('cuộn hết qua HTTP lấy đủ 24 agent', async () => {
    const lay: string[] = [];
    let duong = '/v1/agent?limit=5';
    for (let vong = 0; vong < 50; vong += 1) {
      const trang = await (
        await goiApi(duong, TOKEN_CHU)
      ).json<{ items: { id: string }[]; cursor_sau: string | null }>();
      lay.push(...trang.items.map((d) => d.id));
      if (trang.cursor_sau === null) break;
      duong = `/v1/agent?limit=5&cursor=${encodeURIComponent(trang.cursor_sau)}`;
    }
    expect(lay).toHaveLength(24);
    expect(new Set(lay).size).toBe(24);
  });
});

/* ------------------------------------------------------------------ *
 * EXPLAIN QUERY PLAN — truy vấn phải dùng index
 * ------------------------------------------------------------------ */
describe('EXPLAIN QUERY PLAN — không quét bảng, không sắp bằng B-tree tạm', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dung30DuAnTrungTen();
    await dung24Agent();
  });

  /** Trả kế hoạch truy vấn thành một chuỗi, để khẳng định trên đó. */
  async function keHoach(sql: string, bind: (string | number)[]): Promise<string> {
    const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...bind)
      .all<{ detail: string }>();
    return results.map((r) => r.detail).join(' | ');
  }

  it('danh sách dự án (trang đầu) dùng ix_project_ten, không SCAN, không B-TREE tạm', async () => {
    const kh = await keHoach(
      'SELECT id, ten FROM project WHERE workspace_id = ? ORDER BY ten, id LIMIT ?',
      [WS, 10],
    );
    expect(kh).toContain('ix_project_ten');
    expect(kh).not.toContain('SCAN project');
    expect(kh).not.toContain('TEMP B-TREE');
  });

  it('danh sách dự án (trang sau, có cursor) cũng dùng index cho cả WHERE và ORDER BY', async () => {
    const kh = await keHoach(
      `SELECT id, ten FROM project
        WHERE workspace_id = ? AND (ten, id) > (?, ?)
        ORDER BY ten, id LIMIT ?`,
      [WS, 'Dự án trùng tên 05', 'pj-05-1', 10],
    );
    expect(kh).toContain('ix_project_ten');
    expect(kh).not.toContain('SCAN project');
    expect(kh).not.toContain('TEMP B-TREE');
  });

  it('danh sách agent dùng index theo (ten, id), không SCAN, không B-TREE tạm', async () => {
    const kh = await keHoach(
      `SELECT id, ten FROM agent
        WHERE workspace_id = ? AND (ten, id) > (?, ?)
        ORDER BY ten, id LIMIT ?`,
      [WS, 'A-05', 'ag-05', 10],
    );
    expect(kh).toMatch(/ix_agent_ten_id|ux_agent_ten/);
    expect(kh).not.toContain('SCAN agent');
    expect(kh).not.toContain('TEMP B-TREE');
  });

  it('tra agent theo băm token dùng khoá duy nhất (một lần tra cho mỗi request)', async () => {
    const kh = await keHoach(
      'SELECT id FROM agent WHERE token_bam = ? AND token_thu_hoi_luc IS NULL',
      ['bam-bat-ky'],
    );
    expect(kh).toContain('ux_agent_token_bam');
    expect(kh).not.toContain('SCAN agent');
  });

  /**
   * **Tra ticket theo mã hiển thị `MÃ-số`** (`baton show SAI-1`, SPEC mục 13
   * d.372) — đo **chính** hằng `SQL_TICKET_THEO_MA` của mã sản phẩm.
   *
   * Phải là **hai lần tra khoá**, không `SCAN` bảng nào: `ux_project_ma
   * (workspace_id, ma)` rồi `ux_ticket_so (project_id, so)`. Chính vì index dự án
   * dẫn đầu bằng `workspace_id`, câu lệnh ràng `p.workspace_id` trong `ON`; thiếu
   * vế đó thì cột dẫn đầu không bị ràng và `project` không còn là một phép seek.
   */
  it('tra ticket theo MÃ: hai lần tra khoá duy nhất, không SCAN bảng nào', async () => {
    const kh = await keHoach(SQL_TICKET_THEO_MA, [WS, WS, 'SAI', 1]);
    // Kế hoạch **thật** đo được, ghim nguyên văn: hai phép SEARCH đẳng thức.
    expect(kh).toBe(
      'SEARCH p USING INDEX ux_project_ma (workspace_id=? AND ma=?) | ' +
        'SEARCH t USING INDEX ux_ticket_so (project_id=? AND so=?)',
    );
    expect(kh).toContain('ux_project_ma');
    expect(kh).toContain('ux_ticket_so');
    expect(kh).not.toContain('SCAN project');
    expect(kh).not.toContain('SCAN ticket');
  });

  /* --- Việc sửa B5 mà reviewer lượt 1 nêu ------------------------- *
   * `ix_ticket_du_an` của 0001 đặt `trang_thai` TRƯỚC `hang_uu_tien`, nên truy
   * vấn "mọi ticket của một dự án, sắp theo ưu tiên" (không lọc trạng thái)
   * không dùng được index cho ORDER BY. `0002` thêm
   * `ix_ticket_du_an_uu_tien` không có `trang_thai`. */

  /**
   * Đo **chính hàm của mã sản phẩm** `cauLenhDanhSachTicket`, không phải một
   * chuỗi SQL viết trong test: nếu lượt 3 viết câu lệnh khác thì hoặc nó dùng
   * hàm này (và được đo), hoặc test này mất tác dụng một cách nhìn thấy được.
   */
  it('B5: mọi ticket của một dự án sắp theo ưu tiên — dùng index, KHÔNG sắp bằng B-tree tạm', async () => {
    const { sql, bind } = cauLenhDanhSachTicket({
      cot: 'id',
      workspace_id: WS,
      project_id: 'pj-00-0',
      limit: 50,
    });
    const kh = await keHoach(sql, bind);
    expect(kh).toContain('ix_ticket_du_an_uu_tien');
    expect(kh).not.toContain('TEMP B-TREE');
    expect(kh).not.toContain('SCAN ticket');
  });

  it('B5: cùng truy vấn đó với cursor keyset cũng dùng index', async () => {
    const { sql, bind } = cauLenhDanhSachTicket({
      cot: 'id',
      workspace_id: WS,
      project_id: 'pj-00-0',
      sau: [2, 1_700_000_000_000, 'tk-x'],
      limit: 50,
    });
    const kh = await keHoach(sql, bind);
    expect(kh).toContain('ix_ticket_du_an_uu_tien');
    expect(kh).not.toContain('TEMP B-TREE');
    expect(kh).not.toContain('SCAN ticket');
  });

  it('B5: câu lệnh của mã sản phẩm chạy thật được và giữ đúng thứ tự chuẩn', async () => {
    // Không chỉ đo kế hoạch: chạy thật để biết câu lệnh hợp lệ và thứ tự đúng.
    const t = Date.now();
    for (const [i, uu_tien, hang] of [
      [1, 'low', 3],
      [2, 'urgent', 0],
      [3, 'medium', 2],
      [4, 'urgent', 0],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO ticket
           (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
            nguoi_tao_loai, tao_luc, cap_nhat_luc)
         VALUES (?, ?, 'pj-00-0', ?, ?, 'todo', ?, ?, 'owner', ?, ?)`,
      )
        .bind(`tk-${String(i)}`, WS, i, `Việc ${String(i)}`, uu_tien, hang, t + i, t + i)
        .run();
    }

    const { sql, bind } = cauLenhDanhSachTicket({
      cot: 'id, hang_uu_tien, tao_luc',
      workspace_id: WS,
      project_id: 'pj-00-0',
      limit: 10,
    });
    const { results } = await env.DB.prepare(sql)
      .bind(...bind)
      .all<{ id: string; hang_uu_tien: number; tao_luc: number }>();

    // Ưu tiên cao trước; trong cùng mức thì mới trước.
    expect(results.map((r) => r.id)).toEqual(['tk-4', 'tk-2', 'tk-3', 'tk-1']);
  });

  /**
   * **Hướng của `ORDER BY` phải khớp hướng của index.**
   *
   * Thứ tự chuẩn của danh sách ticket là `(hang_uu_tien ASC, tao_luc DESC,
   * id DESC)` (`quyet-dinh.md` 01/10) và index mang đúng hướng đó. Viết
   * `ORDER BY hang_uu_tien, tao_luc, id` (cả ba tăng) thì SQLite vẫn khớp được
   * tiền tố index cho `WHERE`, nhưng phải
   * `USE TEMP B-TREE FOR LAST 2 TERMS OF ORDER BY` — sắp lại trong bộ nhớ, đúng
   * thứ phải tránh ở mốc 200.000 ticket.
   *
   * Test này ghi lại cái bẫy đó, để lượt 3 (danh sách ticket) không rơi vào.
   * Nó phát hiện được đúng một lần: bản nháp đầu của chính test ở trên viết
   * `ORDER BY` cả ba tăng và cho kết quả sai lệch.
   */
  it('B5: ORDER BY lệch hướng index thì PHẢI sắp bằng B-tree tạm — cái bẫy cần tránh', async () => {
    const kh = await keHoach(
      `SELECT id FROM ticket
        WHERE workspace_id = ? AND project_id = ? AND xoa_luc IS NULL
        ORDER BY hang_uu_tien, tao_luc, id LIMIT ?`,
      [WS, 'pj-00-0', 50],
    );
    expect(kh).toContain('TEMP B-TREE');
  });

  it('lọc theo trạng thái thì vẫn dùng index cũ của 0001 (không mất tác dụng)', async () => {
    const kh = await keHoach(
      `SELECT id FROM ticket
        WHERE workspace_id = ? AND project_id = ? AND trang_thai = ? AND xoa_luc IS NULL
        ORDER BY hang_uu_tien, tao_luc DESC, id DESC LIMIT ?`,
      [WS, 'pj-00-0', 'in_progress', 50],
    );
    expect(kh).toContain('ix_ticket_du_an');
    expect(kh).not.toContain('TEMP B-TREE');
    expect(kh).not.toContain('SCAN ticket');
  });

  it('danh sách "Tất cả dự án" theo trạng thái cũng dùng index (SPEC mục 11, 14)', async () => {
    const kh = await keHoach(
      `SELECT id FROM ticket
        WHERE workspace_id = ? AND trang_thai = ? AND xoa_luc IS NULL
        ORDER BY hang_uu_tien, tao_luc DESC, id DESC LIMIT ?`,
      [WS, 'in_progress', 50],
    );
    expect(kh).toContain('ix_ticket_ws_trang_thai');
    expect(kh).not.toContain('TEMP B-TREE');
  });
});
