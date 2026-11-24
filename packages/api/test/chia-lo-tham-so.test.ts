/**
 * **Chia lô tham số bind** (`src/chia-lo-tham-so.ts`, BAT-42) — D1 chặn 100 tham
 * số trên một câu; vượt là `too many SQL variables` ⇒ 500.
 *
 * Hai tầng:
 *   1. hàm thuần `chiaLoThamSo` — biên 89/90/91 với 1 và 2 tham số khác, rỗng,
 *      trùng, tham số khác ≥ trần;
 *   2. **mỗi chỗ `IN (...)` động** của `src/` chạy qua > 90 giá trị trên D1 của
 *      Miniflare (cùng giới hạn 100 tham số như D1 thật), và giá trị nằm ở **lô
 *      sau** vẫn ra đúng — chứng minh gộp lô đúng nghĩa, không chỉ "không ném".
 *
 * Ca bước 10 của SPEC mục 17 (Tổng quan, danh sách web) ở `nghiem-thu-17.test.ts`.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  TRAN_THAM_SO_MOI_CAU,
  chayTheoLo,
  chiaLoThamSo,
  dauHoi,
} from '../src/chia-lo-tham-so.js';
import { tenAgentTheoId, themCuaThe } from '../src/doc-man-hinh-ticket.js';
import { bangChungCuaTicket } from '../src/doc-tong-quan.js';
import { trangThaiPhienTheoAgent } from '../src/doc-phien.js';
import { boiCanhNguoiCamNhieu } from '../src/doc-luot-giao.js';
import { lietKeNhatKy } from '../src/doc-nhat-ky.js';
import { khoiCho } from '../src/doc-can-chu.js';
import { phamViLuotGiao } from '../src/lenh-khung.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  aiAgent,
  dungAgent,
  dungBangChung,
  dungCanCu,
  dungCanChu,
  dungDuAn,
  dungLienKet,
  dungLuotGiao,
  dungNhan,
  dungNhatKy,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
  noiCanChuTicket,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/* ================================================================== *
 * 1. Hàm thuần
 * ================================================================== */

/** `[0, 1, …, n-1]` dưới dạng chuỗi — giá trị giả cho hàm thuần. */
function day(n: number, dau = 'x'): string[] {
  return Array.from({ length: n }, (_, i) => `${dau}${String(i)}`);
}

describe('chiaLoThamSo — hàm thuần', () => {
  it('trần là 90 tổng tham số (D1 chặn 100)', () => {
    expect(TRAN_THAM_SO_MOI_CAU).toBe(90);
  });

  it('rỗng ⇒ không lô nào (không chạy câu nào)', () => {
    expect(chiaLoThamSo([], 1)).toEqual([]);
    expect(chiaLoThamSo([], 2)).toEqual([]);
  });

  it('1 giá trị ⇒ 1 lô', () => {
    expect(chiaLoThamSo(['a'], 1)).toEqual([['a']]);
  });

  it.each([
    // [số giá trị, số tham số khác, cỡ các lô]
    [89, 1, [89]],
    [90, 1, [89, 1]],
    [91, 1, [89, 2]],
    [89, 2, [88, 1]],
    [90, 2, [88, 2]],
    [91, 2, [88, 3]],
    [88, 2, [88]],
    [200, 1, [89, 89, 22]],
    [400, 1, [89, 89, 89, 89, 44]],
  ])('%i giá trị, %i tham số khác ⇒ lô %j; mọi câu ≤ 90 tham số, đủ giá trị, đúng thứ tự', (n, khac, co) => {
    const ds = day(n);
    const lo = chiaLoThamSo(ds, khac);
    expect(lo.map((l) => l.length)).toEqual(co);
    for (const l of lo) expect(l.length + khac).toBeLessThanOrEqual(TRAN_THAM_SO_MOI_CAU);
    expect(lo.flat()).toEqual(ds);
  });

  it('bỏ trùng TRƯỚC khi chia (giữ lần đầu): một giá trị không bao giờ ở hai lô', () => {
    const ds = [...day(89), 'x0', 'x88', 'moi'];
    const lo = chiaLoThamSo(ds, 1);
    expect(lo.map((l) => l.length)).toEqual([89, 1]);
    expect(lo.flat()).toEqual([...day(89), 'moi']);
    expect(new Set(lo.flat()).size).toBe(lo.flat().length);
  });

  it('số cũng chia được (kiểu tổng quát)', () => {
    expect(chiaLoThamSo([3, 3, 1], 1)).toEqual([[3, 1]]);
  });

  it.each([90, 91, 100])('tham số khác = %i (≥ trần) ⇒ ném lỗi lập trình rõ ràng', (khac) => {
    expect(() => chiaLoThamSo(['a'], khac)).toThrow(/không còn chỗ cho IN/);
    // Kể cả khi danh sách rỗng: lỗi là của CÂU, không của dữ liệu.
    expect(() => chiaLoThamSo([], khac)).toThrow(/không còn chỗ cho IN/);
  });

  it.each([-1, 1.5, Number.NaN])('tham số khác = %d (không phải số nguyên ≥ 0) ⇒ ném', (khac) => {
    expect(() => chiaLoThamSo(['a'], khac)).toThrow(/số nguyên ≥ 0/);
  });

  it('89 tham số khác ⇒ mỗi lô 1 giá trị', () => {
    expect(chiaLoThamSo(['a', 'b'], 89)).toEqual([['a'], ['b']]);
  });

  it('dauHoi: đúng số dấu hỏi, không giá trị', () => {
    expect(dauHoi(['a', 'b', 'c'])).toBe('?, ?, ?');
    expect(dauHoi(["'; DROP TABLE x; --"])).toBe('?');
  });

  it('chayTheoLo: rỗng ⇒ không gọi; nhiều lô ⇒ nối kết quả theo thứ tự lô', async () => {
    let goi = 0;
    expect(
      await chayTheoLo([], 1, async () => {
        goi += 1;
        return await Promise.resolve([1]);
      }),
    ).toEqual([]);
    expect(goi).toBe(0);

    const ds = day(200);
    const ra = await chayTheoLo(ds, 1, async (lo, cho) => {
      goi += 1;
      expect(cho.split('?').length - 1).toBe(lo.length);
      return await Promise.resolve(lo);
    });
    expect(goi).toBe(3);
    expect(ra).toEqual(ds);
  });
});

/* ================================================================== *
 * 2. Mọi chỗ IN động của src/ — > 90 giá trị trên D1 thật của Miniflare
 * ================================================================== */

const P = 'pj-SAI';

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn();
});

/**
 * `n` ticket `SAI-1..n` dựng **một batch** (nhanh hơn 2n câu lẻ). Cùng hình cột
 * với `dungTicket`; bộ đếm của dự án đẩy lên `n` ở cuối.
 */
async function nhieuTicket(n: number, trang_thai = 'in_progress', dau = 1): Promise<string[]> {
  const t = Date.now();
  const ids: string[] = [];
  const cau = [];
  for (let so = dau; so < dau + n; so += 1) {
    const id = `tk-${P}-${String(so)}`;
    ids.push(id);
    cau.push(
      env.DB.prepare(
        `INSERT INTO ticket
           (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
            chiu_trach_nhiem_loai, chu_tu_lam, nguoi_tao_loai, tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, ?, ?, ?, 'none', 4, 'owner', 0, 'owner', ?, ?)`,
      ).bind(id, WS, P, so, `Việc ${String(so)}`, trang_thai, t + so, t + so),
    );
  }
  cau.push(
    env.DB.prepare(
      `INSERT INTO bo_dem (workspace_id, pham_vi, khoa, gia_tri) VALUES (?, 'project', ?, ?)
       ON CONFLICT (workspace_id, pham_vi, khoa) DO UPDATE SET gia_tri = max(gia_tri, excluded.gia_tri)`,
    ).bind(WS, P, dau + n - 1),
  );
  await env.DB.batch(cau);
  return ids;
}

describe('themCuaThe — 150 ticket (2 lô): thẻ ở lô sau đủ 4 trường, đúng nghĩa', () => {
  it('nhãn giữ thứ tự, con tổng/chưa kết không cộng dồn, Cần Chủ đếm đúng, xong_luc', async () => {
    const ids = await nhieuTicket(150);
    const sau = ids[120]!; // lô 2 (vị trí > 89)
    const dau = ids[3]!; // lô 1

    await dungNhan(sau, 'zeta');
    await dungNhan(sau, 'alpha');
    await dungNhan(dau, 'beta');
    // Con của `sau`: một con xong, hai con chưa kết, một con đã xoá (không tính).
    const c1 = await dungTicket(P, 501, 'con 1', { trang_thai: 'done' });
    const c2 = await dungTicket(P, 502, 'con 2', { trang_thai: 'todo' });
    const c3 = await dungTicket(P, 503, 'con 3', { trang_thai: 'in_progress' });
    for (const c of [c1, c2, c3]) await dungLienKet(sau, c, 'parent');
    // Hai mục Cần Chủ đang Chờ + một mục đã xử lý (không tính).
    await dungCanChu('ct-1');
    await dungCanChu('ct-2');
    await dungCanChu('ct-3', { trang_thai: 'skipped' });
    for (const ct of ['ct-1', 'ct-2', 'ct-3']) await noiCanChuTicket(ct, sau);
    await env.DB.prepare('UPDATE ticket SET xong_luc = ? WHERE id = ?').bind(1234, sau).run();

    // Đưa thêm trùng id vào: bản chia lô bỏ trùng nên không nhân đôi nhãn.
    const them = await themCuaThe(env.DB, WS, [...ids, sau, dau]);

    expect(them.nhan.get(sau)).toEqual(['alpha', 'zeta']);
    expect(them.nhan.get(dau)).toEqual(['beta']);
    expect(them.con.get(sau)).toEqual({ tong: 3, chua_ket: 2 });
    expect(them.can_chu.get(sau)).toBe(2);
    expect(them.xong_luc.get(sau)).toBe(1234);
    expect(them.nhan.has(ids[0]!)).toBe(false);
  });

  it('rỗng ⇒ bốn bảng tra rỗng, không câu nào', async () => {
    const them = await themCuaThe(env.DB, WS, []);
    expect([them.nhan.size, them.con.size, them.can_chu.size, them.xong_luc.size]).toEqual([0, 0, 0, 0]);
  });
});

describe('tenAgentTheoId — 120 agent (2 lô)', () => {
  it('tên của agent ở lô sau ra đúng; chủ/null bị bỏ qua', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 120; i += 1) ids.push(await dungAgent(`ag-${String(i)}`, `Agent ${String(i)}`));
    const ten = await tenAgentTheoId(env.DB, WS, [
      null,
      { loai: 'owner' },
      ...ids.map((id) => ({ loai: 'agent' as const, agentId: id })),
    ]);
    expect(ten.size).toBe(120);
    expect(ten.get('ag-119')).toBe('Agent 119');
    expect(ten.get('ag-0')).toBe('Agent 0');
  });
});

describe('bangChungCuaTicket — 150 ticket (2 lô), trước đây 90 id + 1 = 91 tham số', () => {
  it('bằng chứng ở lô sau giữ thứ tự gui_luc; id trùng không nhân đôi', async () => {
    const ids = await nhieuTicket(150);
    const sau = ids[140]!;
    await dungBangChung('ev-2', sau, 'note', { gui_luc: 2000, noi_dung: 'hai' });
    await dungBangChung('ev-1', sau, 'note', { gui_luc: 1000, noi_dung: 'một' });
    await dungBangChung('ev-r', sau, 'note', { gui_luc: 1500, rut_luc: 1600 });
    const dau = ids[2]!;
    await dungBangChung('ev-dau', dau, 'note', { gui_luc: 500 });

    // `dau` lặp lại ở cuối (vị trí 150 ⇒ lô 2 nếu không bỏ trùng) — bằng chứng
    // của nó không được ra hai lần.
    const bc = await bangChungCuaTicket(env.DB, WS, [...ids, dau]);
    expect(bc.get(sau)?.map((b) => b.id)).toEqual(['ev-1', 'ev-2']);
    expect(bc.get(dau)?.map((b) => b.id)).toEqual(['ev-dau']);
  });
});

describe('trangThaiPhienTheoAgent — 100 agent (2 lô)', () => {
  it('phiên mở của agent ở lô sau được đếm', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 100; i += 1) ids.push(await dungAgent(`ag-${String(i)}`, `Agent ${String(i)}`));
    const [tk] = await nhieuTicket(1);
    await dungLuotGiao('lg-1', tk!, 'ag-99', { trang_thai: 'in_progress' });
    const bay_gio = Date.now();
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'running', tin_hieu_cuoi_luc: bay_gio });

    const ra = await trangThaiPhienTheoAgent(env.DB, WS, ids, bay_gio);
    expect(ra.get('ag-99')).toEqual(['running']);
    expect(ra.size).toBe(1);
  });
});

describe('boiCanhNguoiCamNhieu — 150 ticket (2 lô)', () => {
  it('lượt mở + lượt submitted mới nhất của ticket ở lô sau', async () => {
    await dungAgent('ag-a', 'A');
    await dungAgent('ag-b', 'B');
    const ids = await nhieuTicket(150);
    const sau = ids[130]!;
    await dungLuotGiao('lg-1', sau, 'ag-a', { trang_thai: 'submitted', so_luot: 1 });
    await dungLuotGiao('lg-2', sau, 'ag-b', { trang_thai: 'submitted', so_luot: 2, nguoi_giao_agent_id: 'ag-a' });
    await dungLuotGiao('lg-3', sau, 'ag-b', { trang_thai: 'in_progress', so_luot: 3 });

    const ra = await boiCanhNguoiCamNhieu(env.DB, WS, ids);
    expect(ra.get(sau)).toEqual({
      nguoi_giao_luot_submitted: { loai: 'agent', agentId: 'ag-a' },
      luot_worker_mo: { loai: 'agent', agentId: 'ag-b' },
    });
  });
});

describe('lietKeNhatKy — trang 150 dòng (2 lô căn cứ)', () => {
  it('dòng ở lô sau giữ căn cứ theo thu_tu', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 150; i += 1) {
      ids.push(await dungNhatKy(`nk-${String(i).padStart(3, '0')}`, { luc: 1_000_000 + i }));
    }
    // Trang sắp `luc DESC` ⇒ nk-000 ở cuối trang (vị trí 149, lô 2).
    const [tk] = await nhieuTicket(1);
    await dungCanCu('cc-2', 'nk-000', 'ticket', tk!, 2);
    await dungCanChu('ct-1');
    await dungCanCu('cc-1', 'nk-000', 'ask', 'ct-1', 1);

    const trang = await lietKeNhatKy(env.DB, CHU, WS, { limit: 200 });
    expect(trang.items).toHaveLength(150);
    const cuoi = trang.items.at(-1)!;
    expect(cuoi.id).toBe('nk-000');
    expect(cuoi.can_cu.map((c) => c.loai)).toEqual(['ask', 'ticket']);
    expect(cuoi.can_cu[0]?.ma_can_chu).toBe('T-1');
  });
});

describe('khoiCho (màn hình Cần Chủ) — trang 150 mục (2 lô)', () => {
  it('mục ở lô sau có ticket liên quan và dự án', async () => {
    const [tk] = await nhieuTicket(1);
    for (let i = 1; i <= 150; i += 1) {
      await dungCanChu(`ct-${String(i).padStart(3, '0')}`, { tao_luc: 1_000_000 + i, project_id: P });
    }
    await noiCanChuTicket('ct-150', tk!);

    const trang = await khoiCho(env.DB, CHU, WS, 'today', Date.now(), { limit: 200 });
    expect(trang.items).toHaveLength(150);
    const vi_tri = trang.items.findIndex((t) => t.id === 'ct-150');
    expect(vi_tri).toBeGreaterThanOrEqual(89);
    const the = trang.items[vi_tri]!;
    expect(the.ticket_lien_quan.map((t) => t.ma)).toEqual(['SAI-1']);
    expect(the.du_an?.ma).toBe('SAI');
  });

  it('100 dự án KHÁC NHAU (duAnCuaCacMuc 2 lô): mục có dự án ở lô sau ra đúng tên/mã', async () => {
    for (let i = 0; i < 100; i += 1) {
      const so = String(i).padStart(3, '0');
      const pj = await dungDuAn(`Q${so}`, `Dự án ${so}`);
      await dungCanChu(`cq-${so}`, { tao_luc: 1_000_000 + i, project_id: pj });
    }

    const trang = await khoiCho(env.DB, CHU, WS, 'today', Date.now(), { limit: 200 });
    expect(trang.items).toHaveLength(100);
    // Mỗi mục mang đúng dự án của nó — kiểm cả 100, gồm các dự án ở lô thứ hai.
    for (const t of trang.items) {
      const so = t.id.slice('cq-'.length);
      expect(t.du_an).toMatchObject({ ma: `Q${so}`, ten: `Dự án ${so}` });
    }
    const cuoi = trang.items.find((t) => t.id === 'cq-099');
    expect(cuoi?.du_an).toMatchObject({ id: 'pj-Q099', ma: 'Q099', ten: 'Dự án 099' });
  });
});

describe('kiemDanhSachDuAn (POST /v1/agent) — 100 dự án (2 lô)', () => {
  async function nhieuDuAn(n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) ids.push(await dungDuAn(`P${String(i).padStart(3, '0')}`, `Dự án ${String(i)}`));
    return ids;
  }

  it('đủ 100 dự án có thật ⇒ 201', async () => {
    const ds = await nhieuDuAn(100);
    const r = await goiApi('/v1/agent', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'W-nhieu', vai_tro: 'worker', model: 'm', du_an_duoc_vao: ds },
    });
    expect(r.status).toBe(201);
  });

  it('99 có thật + 1 không có (ở lô sau) ⇒ 404 — so TỔNG các lô', async () => {
    const ds = await nhieuDuAn(99);
    const r = await goiApi('/v1/agent', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'W-nhieu', vai_tro: 'worker', model: 'm', du_an_duoc_vao: [...ds, 'pj-khong-co'] },
    });
    expect(r.status).toBe(404);
  });
});

describe('phamViLuotGiao — 120 ticket (2 tham số khác ⇒ lô 88)', () => {
  it('ticket ở lô sau có lượt mở của mình ⇒ true; còn lại false', async () => {
    await dungAgent('ag-test', 'W');
    const ids = await nhieuTicket(120);
    await dungLuotGiao('lg-1', ids[110]!, 'ag-test', { trang_thai: 'in_progress' });

    const pv = await phamViLuotGiao(env.DB, aiAgent('worker'), WS, ids);
    expect(pv.ticketCuaLuotMinh(ids[110]!)).toBe(true);
    expect(pv.ticketCuaLuotMinh(ids[0]!)).toBe(false);
    expect(pv.ticketChaCuaLuotMinh(ids[110]!)).toBe(true);
  });
});
