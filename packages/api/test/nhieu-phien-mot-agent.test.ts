/**
 * **BAT-56 — một agent, nhiều phiên mở** (`spec-questions.md` #83) và **huỷ lượt
 * treo** từ CLI.
 *
 * Lỗi thật: một Manager chạy song song 2–3 lượt (mỗi lượt một phiên); khi có ≥2
 * phiên mở thì `heartbeat`/`log`/`plan` (CLI và MCP) đều ra `INVALID_INPUT` mà
 * không có lối chỉ phiên. Phương án: cờ `--luot <lượt>` (MCP: tham số `luot`),
 * không có cờ thì biến `BATON_LUOT`; **cờ thắng biến**. Kèm `baton cancel <lượt>
 * --reason` để người giao đóng lượt treo (mục 5 `canceled`, 19.6, 19.12 câu 37).
 *
 * Ba khối:
 *   1. CLI/MCP chọn phiên — mọi ca đi đường thật (`chayCli`/`goiCongCu` → Worker
 *      trong Miniflare). `fetch` của môi trường **ghi lại** mọi request, để ghim
 *      "không gửi request ghi nào" bằng dữ liệu chứ không bằng suy luận.
 *   2. **Máy chủ** tự chặn chéo agent — đừng chỉ tin CLI: token agent A gọi
 *      heartbeat / hoạt động / kế hoạch trên lượt/phiên của agent B bị từ chối
 *      và **không ghi gì**.
 *   3. `baton cancel` — người giao huỷ lượt treo; người khác bị từ chối; thiếu
 *      `--reason` bị chặn ở CLI.
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { MA_THOAT } from '@baton/shared';
import { chayCli, danhSachCongCu, goiCongCu, type MoiTruongCli } from '@baton/cli';
import { hoatDongCuaPhien, keHoachCuaPhien } from '../src/doc-phien.js';
import {
  WS,
  dungAgentCoToken,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
  phienTrongDb,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const URL_API = 'https://baton.test';

/** Token **giả**. */
const TOKEN_A = 'bt_token_gia_bat56_agent_a';
const TOKEN_B = 'bt_token_gia_bat56_agent_b';
const TOKEN_QL = 'bt_token_gia_bat56_manager';
const TOKEN_QL2 = 'bt_token_gia_bat56_manager_2';

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
  /** Mọi request CLI/MCP đã gửi: `METHOD đường`. */
  goi: string[];
}

function ban(
  token = TOKEN_A,
  tuy_chon: { luot_env?: string; file?: Record<string, string> } = {},
): BanChay {
  const ra: string[] = [];
  const loi: string[] = [];
  const goi: string[] = [];
  const file = tuy_chon.file ?? {};
  return {
    mt: {
      env: {
        BATON_URL: URL_API,
        BATON_TOKEN: token,
        ...(tuy_chon.luot_env === undefined ? {} : { BATON_LUOT: tuy_chon.luot_env }),
      },
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void loi.push(d),
      fetch: (u, i) => {
        goi.push(`${i?.method ?? 'GET'} ${new URL(String(u)).pathname}`);
        return SELF.fetch(u, i);
      },
      docFile: async (duong) => {
        const chu = file[duong];
        if (chu === undefined) throw new Error(`ENOENT: no such file or directory, open '${duong}'`);
        return await Promise.resolve(chu);
      },
    },
    ra,
    loi,
    goi,
  };
}

/** Request **ghi** (mọi method khác GET) đã gửi. */
function ghi(b: BanChay): string[] {
  return b.goi.filter((g) => !g.startsWith('GET '));
}

/**
 * Một dự án; agent A (worker) có **hai** lượt đang làm, mỗi lượt một phiên mở
 * (`lg-1`/`ph-1`, `lg-2`/`ph-2`); agent B (worker) có lượt `lg-b`/`ph-b`. Người
 * giao của cả ba là manager `ag-ql`; `ag-ql2` là một manager khác cùng dự án.
 */
async function duLieuMau(): Promise<void> {
  await dungWorkspace();
  const pj = await dungDuAn('SAI', 'Sample');
  await dungAgentCoToken({ id: 'ag-a', ten: 'W-a', vai_tro: 'worker', token: TOKEN_A, du_an: [pj] });
  await dungAgentCoToken({ id: 'ag-b', ten: 'W-b', vai_tro: 'worker', token: TOKEN_B, du_an: [pj] });
  await dungAgentCoToken({ id: 'ag-ql', ten: 'M', vai_tro: 'manager', token: TOKEN_QL, du_an: [pj] });
  await dungAgentCoToken({
    id: 'ag-ql2',
    ten: 'M2',
    vai_tro: 'manager',
    token: TOKEN_QL2,
    du_an: [pj],
  });
  const tk1 = await dungTicket(pj, 1, 'Việc một', { trang_thai: 'in_progress' });
  const tk2 = await dungTicket(pj, 2, 'Việc hai', { trang_thai: 'in_progress' });
  const tk3 = await dungTicket(pj, 3, 'Việc của B', { trang_thai: 'in_progress' });
  const giao = { trang_thai: 'in_progress', nguoi_giao_agent_id: 'ag-ql' } as const;
  await dungLuotGiao('lg-1', tk1, 'ag-a', giao);
  await dungLuotGiao('lg-2', tk2, 'ag-a', giao);
  await dungLuotGiao('lg-b', tk3, 'ag-b', giao);
  await dungPhien('ph-1', 'lg-1', { tin_hieu_cuoi_luc: 1 });
  await dungPhien('ph-2', 'lg-2', { tin_hieu_cuoi_luc: 1 });
  await dungPhien('ph-b', 'lg-b', { tin_hieu_cuoi_luc: 1 });
}

/** Chỉ một phiên mở: đóng `ph-2` (fixture). */
async function chiConPh1(): Promise<void> {
  const t = Date.now();
  await env.DB.prepare(
    "UPDATE phien SET trang_thai = 'closed', dong_luc = ?, ly_do_dong = 'test' WHERE id = 'ph-2' AND workspace_id = ?",
  )
    .bind(t, WS)
    .run();
}

async function luotTrongDb(id: string): Promise<{ trang_thai: string; ly_do: string | null } | null> {
  return env.DB.prepare('SELECT trang_thai, ly_do FROM luot_giao WHERE id = ? AND workspace_id = ?')
    .bind(id, WS)
    .first();
}

/* ================================================================== *
 * 1. Chọn phiên — CLI và MCP
 * ================================================================== */

describe('BAT-56 — heartbeat/log/plan chọn phiên khi agent có nhiều phiên mở (#83)', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('1 phiên mở, không chỉ định → dùng đúng phiên đó (hành vi cũ)', async () => {
    await chiConPh1();
    const b = ban();
    expect(await chayCli(['heartbeat', 'một phiên'], b.mt)).toBe(MA_THOAT.xong);
    expect(ghi(b)).toEqual(['POST /v1/luot-giao/lg-1/heartbeat']);
    expect((await phienTrongDb('ph-1'))?.ghi_chu_cuoi).toBe('một phiên');
  });

  it('2 phiên mở, không chỉ định → INVALID_INPUT chỉ cách dùng --luot/BATON_LUOT, KHÔNG gửi request ghi nào (cả 3 lệnh)', async () => {
    const cac_lenh: string[][] = [
      ['heartbeat'],
      ['log', 'thought', 'nghĩ'],
      ['plan', 'kh.json'],
    ];
    for (const doi_so of cac_lenh) {
      const b = ban(TOKEN_A, { file: { 'kh.json': '["bước"]' } });
      expect(await chayCli(doi_so, b.mt), doi_so.join(' ')).toBe(MA_THOAT.loi_nghiep_vu);
      const chu = b.loi.join('\n');
      expect(chu).toContain('INVALID_INPUT');
      expect(chu).toContain('2 phiên mở');
      expect(chu).toContain('--luot');
      expect(chu).toContain('BATON_LUOT');
      // Câu cũ "SPEC mục 13 chưa cho tham số…" đã bỏ.
      expect(chu).not.toContain('chưa cho tham số');
      expect(ghi(b), doi_so.join(' ')).toEqual([]);
    }
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(1);
    expect((await phienTrongDb('ph-2'))?.tin_hieu_cuoi_luc).toBe(1);
  });

  it('2 phiên mở, --luot → heartbeat gửi đúng lượt được chỉ, phiên kia không bị chạm', async () => {
    const b = ban();
    expect(await chayCli(['heartbeat', 'lượt hai', '--luot', 'lg-2'], b.mt)).toBe(MA_THOAT.xong);
    expect(ghi(b)).toEqual(['POST /v1/luot-giao/lg-2/heartbeat']);
    expect((await phienTrongDb('ph-2'))?.ghi_chu_cuoi).toBe('lượt hai');
    // Ghi chú chỉ vào phiên được chỉ — và từ BAT-57 cả tín hiệu cũng vậy: nhịp tim
    // gắn lượt 2 không nhích ph-1 (thu hẹp câu 41, `#cauLenhTinHieuPhien`).
    expect((await phienTrongDb('ph-1'))?.ghi_chu_cuoi).toBeNull();
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(1);
    expect((await phienTrongDb('ph-2'))?.tin_hieu_cuoi_luc).toBeGreaterThan(1);
  });

  it('2 phiên mở, --luot → log và plan gửi lên đúng phiên của lượt được chỉ', async () => {
    const lg = ban();
    expect(await chayCli(['log', 'action', 'làm lượt một', '--luot=lg-1', '--json'], lg.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(ghi(lg)).toEqual(['POST /v1/phien/ph-1/hoat-dong']);
    expect((JSON.parse(lg.ra.join('\n')) as { phien_id: string }).phien_id).toBe('ph-1');

    const pl = ban(TOKEN_A, { file: { 'kh.json': '["bước một"]' } });
    expect(await chayCli(['plan', 'kh.json', '--luot', 'lg-2', '--json'], pl.mt)).toBe(MA_THOAT.xong);
    expect(ghi(pl)).toEqual(['PUT /v1/phien/ph-2/ke-hoach']);
    expect((await keHoachCuaPhien(env.DB, WS, 'ph-2')).phien_ban).toBe(1);
    expect((await keHoachCuaPhien(env.DB, WS, 'ph-1')).phien_ban).toBe(0);
  });

  it('2 phiên mở, BATON_LUOT (không cờ) → đúng phiên của lượt trong biến', async () => {
    const b = ban(TOKEN_A, { luot_env: 'lg-2' });
    expect(await chayCli(['log', 'thought', 'theo biến', '--json'], b.mt)).toBe(MA_THOAT.xong);
    expect(ghi(b)).toEqual(['POST /v1/phien/ph-2/hoat-dong']);
    expect(await hoatDongCuaPhien(env.DB, WS, 'ph-1')).toHaveLength(0);
  });

  it('cờ --luot THẮNG biến BATON_LUOT', async () => {
    const b = ban(TOKEN_A, { luot_env: 'lg-2' });
    expect(await chayCli(['heartbeat', 'cờ thắng', '--luot', 'lg-1'], b.mt)).toBe(MA_THOAT.xong);
    expect(ghi(b)).toEqual(['POST /v1/luot-giao/lg-1/heartbeat']);
    expect((await phienTrongDb('ph-1'))?.ghi_chu_cuoi).toBe('cờ thắng');
    expect((await phienTrongDb('ph-2'))?.ghi_chu_cuoi).toBeNull();
  });

  it('BATON_LUOT rỗng = không chỉ định (2 phiên → INVALID_INPUT); --luot rỗng → INVALID_INPUT; cả hai không gửi request nào', async () => {
    const rong_env = ban(TOKEN_A, { luot_env: '' });
    expect(await chayCli(['heartbeat'], rong_env.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(rong_env.loi.join('\n')).toContain('2 phiên mở');
    expect(ghi(rong_env)).toEqual([]);

    const rong_co = ban();
    expect(await chayCli(['heartbeat', '--luot='], rong_co.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(rong_co.loi.join('\n')).toContain('INVALID_INPUT');
    expect(rong_co.goi).toEqual([]);
  });

  it('chỉ định lượt của AGENT KHÁC → NOT_FOUND ở CLI, cùng thông điệp với lượt không tồn tại, KHÔNG request ghi', async () => {
    const cua_b = ban();
    expect(await chayCli(['heartbeat', '--luot', 'lg-b'], cua_b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(ghi(cua_b)).toEqual([]);

    const khong_co = ban();
    expect(await chayCli(['heartbeat', '--luot', 'lg-khong-co'], khong_co.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(ghi(khong_co)).toEqual([]);

    // 404-không-lộ (SPEC mục 13): khác nhau đúng ở id người gõ, còn lại y hệt.
    const chu_b = cua_b.loi.join('\n');
    expect(chu_b).toContain('NOT_FOUND');
    expect(chu_b.replace('lg-b', 'X')).toBe(khong_co.loi.join('\n').replace('lg-khong-co', 'X'));

    // log/plan qua BATON_LUOT trỏ vào lượt của B: cũng NOT_FOUND, không ghi.
    for (const doi_so of [['log', 'thought', 'x'], ['plan', 'kh.json']]) {
      const b = ban(TOKEN_A, { luot_env: 'lg-b', file: { 'kh.json': '["x"]' } });
      expect(await chayCli(doi_so, b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
      expect(b.loi.join('\n')).toContain('NOT_FOUND');
      expect(ghi(b)).toEqual([]);
    }
    const pb = await phienTrongDb('ph-b');
    expect(pb?.tin_hieu_cuoi_luc).toBe(1);
    expect(pb?.ghi_chu_cuoi).toBeNull();
    expect(await hoatDongCuaPhien(env.DB, WS, 'ph-b')).toHaveLength(0);
  });

  it('--luot trỏ lượt CỦA CHÍNH MÌNH mà phiên đã đóng → NOT_FOUND (cùng thông điệp), KHÔNG request ghi, không rơi về phiên còn lại', async () => {
    await chiConPh1(); // ph-2 (lượt lg-2 của chính agent A) đã đóng; chỉ còn ph-1 mở.
    const b = ban();
    expect(await chayCli(['heartbeat', 'nhầm', '--luot', 'lg-2'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('NOT_FOUND');
    expect(ghi(b)).toEqual([]);
    // Không "rơi về phiên duy nhất": ph-1 không bị ghi.
    expect((await phienTrongDb('ph-1'))?.ghi_chu_cuoi).toBeNull();
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(1);
  });

  it('MCP: heartbeat/log/plan có tham số tuỳ chọn "luot" trong schema', () => {
    const ds = danhSachCongCu();
    for (const ten of ['heartbeat', 'log', 'plan']) {
      const cc = ds.find((c) => c.name === ten);
      expect(cc?.inputSchema.properties['luot'], ten).toMatchObject({ type: 'string' });
      expect(cc?.inputSchema.required ?? [], ten).not.toContain('luot');
    }
  });

  it('MCP: 2 phiên mở — tham số luot chọn đúng phiên; thiếu thì rơi về BATON_LUOT; thiếu cả hai → INVALID_INPUT không ghi', async () => {
    const co_tham_so = ban(TOKEN_A, { luot_env: 'lg-1' });
    const kq1 = await goiCongCu(co_tham_so.mt, 'heartbeat', { ghi_chu: 'qua mcp', luot: 'lg-2' });
    expect(kq1.isError).toBe(false);
    expect(ghi(co_tham_so)).toEqual(['POST /v1/luot-giao/lg-2/heartbeat']);

    const theo_bien = ban(TOKEN_A, { luot_env: 'lg-1' });
    const kq2 = await goiCongCu(theo_bien.mt, 'log', { type: 'thought', noi_dung: 'biến' });
    expect(kq2.isError).toBe(false);
    expect(ghi(theo_bien)).toEqual(['POST /v1/phien/ph-1/hoat-dong']);

    const khong = ban();
    const kq3 = await goiCongCu(khong.mt, 'plan', { file_json: 'kh.json' });
    expect(kq3.isError).toBe(true);
    expect(kq3.structuredContent['loi']).toBe('INVALID_INPUT');
    expect(ghi(khong)).toEqual([]);
  });
});

/* ================================================================== *
 * 2. Máy chủ chặn chéo agent — không chỉ tin CLI
 * ================================================================== */

describe('BAT-56 — máy chủ: token agent A trên lượt/phiên của agent B bị từ chối, không ghi gì', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('POST /v1/luot-giao/:id/heartbeat bằng token A trên lượt của B → 403, phiên B không đổi', async () => {
    const res = await goiApi('/v1/luot-giao/lg-b/heartbeat', TOKEN_A, {
      method: 'POST',
      than: { ghi_chu: 'giả B' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    const pb = await phienTrongDb('ph-b');
    expect(pb?.ghi_chu_cuoi).toBeNull();
    expect(pb?.tin_hieu_cuoi_luc).toBe(1);
  });

  it('POST /v1/phien/:id/hoat-dong bằng token A trên phiên của B → 403, không thêm mục nào', async () => {
    const res = await goiApi('/v1/phien/ph-b/hoat-dong', TOKEN_A, {
      method: 'POST',
      than: { loai: 'result', noi_dung: 'giả B xong' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(await hoatDongCuaPhien(env.DB, WS, 'ph-b', { gom_tam_thoi: true })).toHaveLength(0);
    const pb = await phienTrongDb('ph-b');
    expect(pb?.trang_thai).toBe('running');
    expect(pb?.tin_hieu_cuoi_luc).toBe(1);
  });

  it('PUT /v1/phien/:id/ke-hoach bằng token A trên phiên của B → 403, không ghi phiên bản kế hoạch nào', async () => {
    const res = await goiApi('/v1/phien/ph-b/ke-hoach', TOKEN_A, {
      method: 'PUT',
      than: { buoc: ['giả'] },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect((await keHoachCuaPhien(env.DB, WS, 'ph-b')).phien_ban).toBe(0);
    expect((await phienTrongDb('ph-b'))?.tin_hieu_cuoi_luc).toBe(1);
  });

  it('ĐỐI CHỨNG: chính agent B gọi được cả ba trên lượt/phiên của mình', async () => {
    expect(
      (await goiApi('/v1/luot-giao/lg-b/heartbeat', TOKEN_B, { method: 'POST', than: {} })).status,
    ).toBe(200);
    expect(
      (
        await goiApi('/v1/phien/ph-b/hoat-dong', TOKEN_B, {
          method: 'POST',
          than: { loai: 'thought', noi_dung: 'x' },
        })
      ).status,
    ).toBe(201);
    expect(
      (await goiApi('/v1/phien/ph-b/ke-hoach', TOKEN_B, { method: 'PUT', than: { buoc: ['x'] } }))
        .status,
    ).toBe(200);
  });
});

/* ================================================================== *
 * 3. baton cancel — người giao đóng lượt treo
 * ================================================================== */

describe('BAT-56 — baton cancel <lượt> --reason (mục 5 `canceled`, 19.6, 19.12 câu 37)', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('người giao huỷ lượt treo có phiên mở → lượt canceled, lý do lưu, phiên sang stopping, assign mới KHÔNG còn ASSIGNMENT_OPEN', async () => {
    // ĐỐI CHỨNG: trước khi huỷ, lượt treo chặn assign mới.
    const truoc = ban(TOKEN_QL);
    expect(await chayCli(['assign', 'SAI-1', 'ag-a'], truoc.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(truoc.loi.join('\n')).toContain('ASSIGNMENT_OPEN');

    const b = ban(TOKEN_QL);
    expect(
      await chayCli(['cancel', 'lg-1', '--reason', 'Manager chết giữa chừng', '--json'], b.mt),
    ).toBe(MA_THOAT.xong);
    expect(ghi(b)).toEqual(['POST /v1/luot-giao/lg-1/huy']);
    const d = JSON.parse(b.ra.join('\n')) as { trang_thai: string; phien_dang_dung: boolean };
    expect(d.trang_thai).toBe('canceled');
    expect(d.phien_dang_dung).toBe(true);

    expect(await luotTrongDb('lg-1')).toEqual({
      trang_thai: 'canceled',
      ly_do: 'Manager chết giữa chừng',
    });
    // SPEC 19.6: huỷ lượt có phiên đang chạy → phiên `stopping` (như bấm Dừng), không còn `running`.
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('stopping');

    // Lý do đọc lại được qua API (hiện ở `baton show`).
    const show = ban(TOKEN_QL);
    expect(await chayCli(['show', 'SAI-1', '--json'], show.mt)).toBe(MA_THOAT.xong);
    expect(show.ra.join('\n')).toContain('Manager chết giữa chừng');

    const sau = ban(TOKEN_QL);
    expect(await chayCli(['assign', 'SAI-1', 'ag-a'], sau.mt)).toBe(MA_THOAT.xong);
    expect(sau.loi.join('\n')).not.toContain('ASSIGNMENT_OPEN');
  });

  it('người KHÁC người giao huỷ → FORBIDDEN (người nhận, manager khác), lượt và phiên giữ nguyên', async () => {
    for (const token of [TOKEN_A, TOKEN_QL2]) {
      const b = ban(token);
      expect(await chayCli(['cancel', 'lg-1', '--reason', 'không có quyền'], b.mt)).toBe(
        MA_THOAT.loi_nghiep_vu,
      );
      expect(b.loi.join('\n')).toContain('FORBIDDEN');
    }
    expect(await luotTrongDb('lg-1')).toEqual({ trang_thai: 'in_progress', ly_do: null });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');
  });

  it('sau cancel, agent nhận chạy `heartbeat --luot <lượt đã huỷ>` trên phiên stopping → STOP, mã thoát 3 (SPEC 19.6, mục 6)', async () => {
    const huy = ban(TOKEN_QL);
    expect(await chayCli(['cancel', 'lg-1', '--reason', 'đổi hướng'], huy.mt)).toBe(MA_THOAT.xong);

    const b = ban();
    expect(await chayCli(['heartbeat', '--luot', 'lg-1', '--json'], b.mt)).toBe(MA_THOAT.nhan_stop);
    expect(ghi(b)).toEqual(['POST /v1/luot-giao/lg-1/heartbeat']);
    const d = JSON.parse(b.ra.join('\n')) as { tin_hieu: string[]; trang_thai: string };
    expect(d.tin_hieu).toEqual(['STOP']);
    expect(d.trang_thai).toBe('stopping');
  });

  /*
   * BAT-57 đổi ca này từ FORBIDDEN sang NOT_FOUND (19.12 câu 15): agent ngoài dự án
   * **không thấy** lượt, nên phải nhận phản hồi giống hệt lượt không tồn tại. Ca so
   * sánh trực tiếp body/status ở `bat57-phien-dung-va-lo-id.test.ts`.
   */
  it('agent NGOÀI dự án gọi cancel → NOT_FOUND (không lộ lượt có thật — BAT-57), lượt và phiên giữ nguyên', async () => {
    const TOKEN_NGOAI = 'bt_token_gia_bat56_ngoai_du_an';
    await dungAgentCoToken({ id: 'ag-ngoai', ten: 'M-ngoai', vai_tro: 'manager', token: TOKEN_NGOAI });
    const b = ban(TOKEN_NGOAI);
    expect(await chayCli(['cancel', 'lg-1', '--reason', 'không thuộc dự án'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(b.loi.join('\n')).toContain('NOT_FOUND');
    expect(b.loi.join('\n')).not.toContain('FORBIDDEN');
    expect(await luotTrongDb('lg-1')).toEqual({ trang_thai: 'in_progress', ly_do: null });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');
  });

  it('thiếu --reason (hoặc --reason trống) → REASON_REQUIRED ở CLI, mã 1, KHÔNG gửi request nào', async () => {
    for (const doi_so of [['cancel', 'lg-1'], ['cancel', 'lg-1', '--reason', '   ']]) {
      const b = ban(TOKEN_QL);
      expect(await chayCli(doi_so, b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
      expect(b.loi.join('\n')).toContain('REASON_REQUIRED');
      expect(b.loi.join('\n')).toContain('Cách dùng: baton cancel');
      expect(b.goi).toEqual([]);
    }
    expect((await luotTrongDb('lg-1'))?.trang_thai).toBe('in_progress');
  });

  it('MCP có công cụ cancel cùng luật: thiếu reason → REASON_REQUIRED, không request', async () => {
    expect(danhSachCongCu().map((c) => c.name)).toContain('cancel');
    const b = ban(TOKEN_QL);
    const kq = await goiCongCu(b.mt, 'cancel', { luot: 'lg-1' });
    expect(kq.isError).toBe(true);
    expect(kq.structuredContent['loi']).toBe('REASON_REQUIRED');
    expect(b.goi).toEqual([]);
  });
});
