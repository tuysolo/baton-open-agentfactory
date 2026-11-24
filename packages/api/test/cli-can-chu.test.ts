/**
 * CLI `baton` — **Cần Chủ và Nhật ký** (SPEC mục 13): `ask` (d.375), `result`
 * (d.376 + 19.9 d.543), `decision` (d.377). Lượt cuối của bảng lệnh mục 13.
 *
 * **Mọi ca đi đường thật**, đúng nếp `cli.test.ts` / `cli-vong-doi.test.ts` /
 * `cli-ticket.test.ts`: `chayCli` nhận chuỗi tham số như trên dòng lệnh, tự phân
 * tích, tự đọc biến môi trường, gọi **Worker thật** trong Miniflare với **token
 * thật của một agent thật** trong D1. Không ca nào gọi thẳng hàm nội bộ của một
 * lệnh rồi khai là "lệnh chạy được".
 *
 * **Mã thoát 4** (19.9 d.543) phát ở đây lần đầu, và cũng qua đường thật: một mục
 * còn `open`, `baton result T-x --wait 1`, máy chủ chờ đủ rồi trả `het_gio`. Ca
 * đối chứng **mã 0** nằm ngay cạnh nó: cùng lệnh, cùng cờ, chủ xử lý mục giữa lúc
 * chờ.
 *
 * `docFile` của môi trường là một **bảng file trong bộ nhớ** — không ca nào chạm
 * đĩa (không tạo, không xoá file nào).
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { MA_THOAT, NHAN_PHUONG_AN, nhan } from '@baton/shared';
import {
  CHE,
  chayCli,
  loaiCanCuTuChu,
  phanTich,
  tachDeXuat,
  tachNhanPhuongAn,
  type MoiTruongCli,
} from '@baton/cli';
import { cuaGhiCua, type WorkspaceGate } from '../src/workspace-gate.js';
import { caQuaSo, choToi, soRequestBay } from './cho-toi.js';
import {
  TOKEN_CHU,
  WS,
  canCuCua,
  canChuTrongDb,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  goiApi,
  nhatKyTheoThuTu,
  nhatKyTrongDb,
  phuongAnCua,
} from './giup.js';

const URL_API = 'https://baton.test';

/** Token **giả** của manager (tạo mục, ghi Nhật ký) và của worker (không được). */
const TOKEN_QL = 'bt_token_gia_manager_tk61';
const TOKEN_WK = 'bt_token_gia_worker_tk61';

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
  /** Số request HTTP lệnh đã bắn — để chứng minh "chặn **tại CLI**". */
  so_request: () => number;
}

function ban(token = TOKEN_QL, file: Record<string, string> = {}): BanChay {
  const ra: string[] = [];
  const loi: string[] = [];
  let n = 0;
  return {
    mt: {
      env: { BATON_URL: URL_API, BATON_TOKEN: token },
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void loi.push(d),
      fetch: (u, i) => {
        n += 1;
        return SELF.fetch(u, i);
      },
      docFile: async (duong) => {
        const chu = file[duong];
        // Giống `readFile` của Node: file không có thì **ném**.
        if (chu === undefined) throw new Error(`ENOENT: no such file or directory, open '${duong}'`);
        return await Promise.resolve(chu);
      },
    },
    ra,
    loi,
    so_request: () => n,
  };
}

function tatCa(b: BanChay): string {
  return [...b.ra, ...b.loi].join('\n');
}

function loiJson(b: BanChay): { loi: string | null; thong_diep: string } {
  return JSON.parse(b.loi.join('\n')) as { loi: string | null; thong_diep: string };
}

function raJson<T>(b: BanChay): T {
  return JSON.parse(b.ra.join('\n')) as T;
}

/** Một dự án `SAI`, một manager (tạo mục / ghi Nhật ký được), một worker, một ticket. */
async function duLieuMau(): Promise<void> {
  await dungWorkspace();
  await dungAgentCoToken({ id: 'ag-ql', ten: 'M', vai_tro: 'manager', token: TOKEN_QL });
  const pj = await dungDuAn('SAI', 'Sample', 'active', 'ag-ql');
  await choVaoDuAn('ag-ql', pj);
  await dungAgentCoToken({ id: 'ag-1', ten: 'W', vai_tro: 'worker', token: TOKEN_WK, du_an: [pj] });
  await dungTicket(pj, 1, 'Việc có sẵn');
  await dungTicket(pj, 2, 'Việc thứ hai');
}

/** Tạo một mục Cần Chủ **qua chính `baton ask`** và trả `{ id, ma }`. */
async function taoMuc(ds: readonly string[]): Promise<{ id: string; ma: string }> {
  const b = ban(TOKEN_QL);
  const code = await chayCli([...ds, '--json'], b.mt);
  if (code !== MA_THOAT.xong) throw new Error(`baton ask hỏng: ${tatCa(b)}`);
  return raJson<{ id: string; ma: string }>(b);
}

/*
 * **Sổ các lệnh CLI còn đang bay** (BAT-13, mẫu `cho-dai.test.ts`): `result --wait 30`
 * mà assert ở giữa đỏ thì request bị bỏ rơi còn sống và đọc D1/DO sau khi pool đã pop
 * storage cô lập của ca. `afterEach` chờ hết.
 */
const bay = soRequestBay();

afterEach(async () => {
  await bay.doiHet();
  // Trần đủ cho một lệnh chờ 30 giây bị bỏ rơi tự hết hạn.
}, 45_000);

// Cả thân mỗi ca/`beforeEach` cũng đi qua sổ đó (BAT-53, xem `caQuaSo`): ca hết giờ
// không để các lệnh CLI còn lại của thân bắn request vào lúc pool pop storage.
const { it, beforeEach } = caQuaSo(bay);

/**
 * Chờ tới khi sổ waiter của cửa ghi có đúng `n` lệnh chờ, thay cho `nghi(250)`.
 * Không nới assert: hết `han_ms` mà sổ chưa có `n` thì `expect` đỏ.
 */
async function choVaoSo(n: number, han_ms = 10_000): Promise<void> {
  const dem = (): Promise<number> =>
    runInDurableObject(cuaGhiCua(env, WS), (g: WorkspaceGate) => g.soDangCho());
  await choToi(async () => (await dem()) === n, han_ms);
  expect(await dem(), `sổ waiter phải có ${n} lệnh chờ`).toBe(n);
}

/* ================================================================== *
 * `baton ask` — SPEC mục 13 d.375, mục 8
 * ================================================================== */

describe('baton ask — d.375 "Tạo mục Cần Chủ, in `T-số`"', () => {
  beforeEach(duLieuMau);

  it('đường thường: in `T-số`, ghi đúng mức/loại/tiêu đề vào DB, mã thoát 0', async () => {
    const b = ban(TOKEN_QL);
    expect(
      await chayCli(['ask', '--level', 'today', '--type', 'fyi', 'Đã dựng xong phần 5'], b.mt),
    ).toBe(MA_THOAT.xong);

    const chu = b.ra.join('\n');
    expect(chu).toMatch(/\bT-\d+\b/);
    expect(chu).toContain('Trong ngày'); // nhãn tiếng Việt — d.381
    expect(chu).toContain('Chỉ để biết');

    const { id } = await taoMuc(['ask', '--level', 'later', '--type', 'fyi', 'Mục thứ hai']);
    const dong = await canChuTrongDb(id);
    expect(dong?.muc).toBe('later');
    expect(dong?.loai).toBe('fyi');
    expect(dong?.tieu_de).toBe('Mục thứ hai');
    expect(dong?.trang_thai).toBe('open');
    expect(dong?.tao_boi_agent_id).toBe('ag-ql');
  });

  it('`--option` LẶP: ba lần gõ thành ba phương án A·B·C, `--recommend B` đặt đúng cờ', async () => {
    const { id } = await taoMuc([
      'ask',
      '--level',
      'urgent',
      '--type',
      'decision',
      'Chọn thư viện',
      '--option',
      'A: Dùng Hono',
      '--option',
      'B: Dùng itty-router',
      '--option',
      'C: Tự viết',
      '--recommend',
      'B: nhẹ hơn và đã có trong node_modules',
    ]);

    expect(await phuongAnCua(id)).toEqual([
      { nhan: 'A', noi_dung: 'Dùng Hono', de_xuat: 0, thu_tu: 1 },
      { nhan: 'B', noi_dung: 'Dùng itty-router', de_xuat: 1, thu_tu: 2 },
      { nhan: 'C', noi_dung: 'Tự viết', de_xuat: 0, thu_tu: 3 },
    ]);
    expect((await canChuTrongDb(id))?.ly_do_de_xuat).toBe(
      'nhẹ hơn và đã có trong node_modules',
    );
  });

  it('`--option` KHÔNG tiền tố nhãn cũng được (nhãn vốn do vị trí quyết)', async () => {
    const { id } = await taoMuc([
      'ask',
      '--level',
      'later',
      '--type',
      'decision',
      'Chọn ngưỡng',
      '--option',
      'Ngưỡng 300',
      '--option',
      'Ngưỡng 500',
      '--recommend',
      'B: số liệu tuần trước',
    ]);
    expect((await phuongAnCua(id)).map((p) => [p.nhan, p.noi_dung, p.de_xuat])).toEqual([
      ['A', 'Ngưỡng 300', 0],
      ['B', 'Ngưỡng 500', 1],
    ]);
  });

  it('`--command` và `--file` đi đúng trường của loại mình', async () => {
    const { id: id_lenh } = await taoMuc([
      'ask',
      '--level',
      'today',
      '--type',
      'run_command',
      'Chạy migration',
      '--command',
      'npm run migrate',
    ]);
    expect((await canChuTrongDb(id_lenh))?.lenh).toBe('npm run migrate');

    const { id: id_rv } = await taoMuc([
      'ask',
      '--level',
      'today',
      '--type',
      'review',
      'Đọc giúp bản nháp',
      '--file',
      '/tmp/nhap.md',
      '--file',
      'https://example.com/pr/1',
    ]);
    const { results } = await env.DB.prepare(
      'SELECT loai, dia_chi FROM can_chu_file WHERE can_chu_id = ? ORDER BY thu_tu',
    )
      .bind(id_rv)
      .all<{ loai: string; dia_chi: string }>();
    expect(results).toEqual([
      { loai: 'file', dia_chi: '/tmp/nhap.md' },
      { loai: 'link', dia_chi: 'https://example.com/pr/1' },
    ]);
  });

  /**
   * **`--command` đi được với MỌI `--type`** — mục 8 d.250 ("lệnh có nút Copy",
   * chung cho mọi thẻ) vs d.237; `cau-hoi-spec.md` #130.
   *
   * Lỗi thật 13/10: `baton ask --type decision … --command "…"` chạy xong, mã
   * thoát 0, mà lệnh **mất không dấu vết**. Ca này đi đường thật từ dòng lệnh tới
   * DB, rồi đọc lại bằng chính `baton show` (`GET /v1/can-chu/:id`).
   */
  it('`--command` đi qua với `--type decision`: thân request có `lenh`, DB giữ, đọc lại thấy', async () => {
    const b = ban(TOKEN_QL);
    let than_gui: unknown = null;
    const mt: MoiTruongCli = {
      ...b.mt,
      fetch: async (u, i) => {
        if (typeof i?.body === 'string' && String(u).endsWith('/v1/can-chu')) {
          than_gui = JSON.parse(i.body);
        }
        return await SELF.fetch(u, i);
      },
    };

    expect(
      await chayCli(
        [
          'ask',
          '--level',
          'today',
          '--type',
          'decision',
          'Có nên deploy bây giờ',
          '--option',
          'A: Deploy luôn',
          '--option',
          'B: Chờ sáng mai',
          '--recommend',
          'A: cổng đã xanh',
          '--command',
          'npm run deploy',
          '--json',
        ],
        mt,
      ),
    ).toBe(MA_THOAT.xong);

    // 1. Thân request: `lenh` đi cùng một mục `decision` (route đổi → `lenh_chay`).
    expect(than_gui).toMatchObject({ loai: 'decision', lenh: 'npm run deploy' });

    // 2. DB giữ lệnh đó (cột `lenh_kem` của 0023 — `lenh` vẫn của `run_command`).
    const { id, ma } = raJson<{ id: string; ma: string }>(b);
    const dong = await canChuTrongDb(id);
    expect(dong?.loai).toBe('decision');
    expect(dong?.lenh_kem).toBe('npm run deploy');
    expect(dong?.lenh).toBeNull();

    // 3. Đọc lại bằng chính CLI: `baton result T-x` trả lệnh ở trường `lenh`.
    const d = ban(TOKEN_QL);
    expect(await chayCli(['result', ma, '--json'], d.mt)).toBe(MA_THOAT.xong);
    expect(raJson<{ lenh: string | null }>(d).lenh).toBe('npm run deploy');
  });

  it('`--ticket` LẶP: hai mã ticket thành hai dòng `can_chu_ticket`', async () => {
    const { id } = await taoMuc([
      'ask',
      '--level',
      'today',
      '--type',
      'fyi',
      'Hai ticket cùng vướng',
      '--ticket',
      'SAI-1',
      '--ticket',
      'SAI-2',
    ]);
    const { results } = await env.DB.prepare(
      `SELECT t.so AS so FROM can_chu_ticket ct JOIN ticket t ON t.id = ct.ticket_id
        WHERE ct.can_chu_id = ? ORDER BY t.so`,
    )
      .bind(id)
      .all<{ so: number }>();
    expect(results.map((r) => r.so)).toEqual([1, 2]);
  });

  it('`--context f.md` đi vào bối cảnh; file hỏng → INVALID_INPUT kèm đường dẫn, 0 request', async () => {
    const ok = ban(TOKEN_QL, { 'boi-canh.md': '# Nền\nHai dòng bối cảnh.' });
    expect(
      await chayCli(
        ['ask', '--level', 'later', '--type', 'fyi', 'Có bối cảnh', '--context', 'boi-canh.md', '--json'],
        ok.mt,
      ),
    ).toBe(MA_THOAT.xong);
    const { id } = raJson<{ id: string }>(ok);
    expect((await canChuTrongDb(id))?.boi_canh).toBe('# Nền\nHai dòng bối cảnh.');

    const hong = ban(TOKEN_QL);
    expect(
      await chayCli(
        ['ask', '--level', 'later', '--type', 'fyi', 'x', '--context', 'khong-co.md', '--json'],
        hong.mt,
      ),
    ).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(hong).loi).toBe('INVALID_INPUT');
    expect(loiJson(hong).thong_diep).toContain('khong-co.md');
    expect(hong.so_request()).toBe(0);
  });

  it('19.8: `fyi` 🔴 bị máy chủ hạ về 🟡 và CLI NÓI RA (không nuốt)', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['ask', '--level', 'urgent', '--type', 'fyi', 'Chỉ để biết thôi'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    const chu = b.ra.join('\n');
    expect(chu).toContain('Lưu ý:');
    expect(chu).toContain(nhan('muc_can_chu', 'today'));
  });

  /**
   * **Chặn tại CLI** — mỗi ca assert đúng **mã lỗi của SPEC** (không chỉ mã thoát
   * 1) và **0 request**: đó là thứ phân biệt "CLI chặn" với "máy chủ chặn".
   */
  it('trường bắt buộc theo loại bị chặn TẠI CLI, đúng mã lỗi của mục 8, 0 request', async () => {
    const ca: [string[], string][] = [
      [['ask', '--level', 'today', '--type', 'decision', 'Thiếu phương án'], 'OPTIONS_REQUIRED'],
      [
        ['ask', '--level', 'today', '--type', 'decision', 'Thiếu đề xuất', '--option', 'A: x', '--option', 'B: y'],
        'OPTIONS_REQUIRED',
      ],
      [['ask', '--level', 'today', '--type', 'run_command', 'Thiếu lệnh'], 'COMMAND_REQUIRED'],
      [['ask', '--level', 'today', '--type', 'review', 'Thiếu file'], 'INVALID_INPUT'],
    ];
    /*
     * Khoá tập loại: **ba** loại **có trường bắt buộc** của mục 8 d.236–238 đều
     * phải có mặt. `fyi` cố ý vắng — d.239 nói nó "không cần làm gì", nên nó
     * không có gì để chặn; ca đi qua của nó nằm ở phép đối chứng ngay dưới.
     */
    expect(new Set(ca.map(([ds]) => ds[4]))).toEqual(
      new Set(['decision', 'run_command', 'review']),
    );

    const sai_ma: string[] = [];
    const sai_loi: string[] = [];
    const co_request: string[] = [];
    for (const [ds, ma_loi] of ca) {
      const b = ban(TOKEN_QL);
      if ((await chayCli([...ds, '--json'], b.mt)) !== MA_THOAT.loi_nghiep_vu) {
        sai_ma.push(ds.join(' '));
      }
      if (loiJson(b).loi !== ma_loi) sai_loi.push(`${ds.join(' ')} → ${String(loiJson(b).loi)}`);
      if (b.so_request() !== 0) co_request.push(ds.join(' '));
    }
    expect(sai_ma).toEqual([]);
    expect(sai_loi).toEqual([]);
    expect(co_request).toEqual([]);
  });

  it('ĐỐI CHỨNG: đủ trường thì cả bốn loại đi qua được (mã thoát 0)', async () => {
    const ca: string[][] = [
      ['ask', '--level', 'today', '--type', 'decision', 'Đủ', '--option', 'A: x', '--option', 'B: y', '--recommend', 'A: vì x rẻ'],
      ['ask', '--level', 'today', '--type', 'run_command', 'Đủ', '--command', 'npm test'],
      ['ask', '--level', 'today', '--type', 'review', 'Đủ', '--file', '/tmp/a.md'],
      ['ask', '--level', 'today', '--type', 'fyi', 'Đủ'],
    ];
    expect(new Set(ca.map((ds) => ds[4]))).toEqual(
      new Set(['decision', 'run_command', 'review', 'fyi']),
    );
    const hong: string[] = [];
    for (const ds of ca) {
      const b = ban(TOKEN_QL);
      if ((await chayCli(ds, b.mt)) !== MA_THOAT.xong) hong.push(`${ds.join(' ')} → ${tatCa(b)}`);
    }
    expect(hong).toEqual([]);
  });

  it('d.381: `--level` / `--type` nhận MÃ tiếng Anh; mã lạ bị chặn tại CLI kèm nhãn tiếng Việt', async () => {
    const ca: [string[], string][] = [
      [['ask', '--level', 'gap', '--type', 'fyi', 'x'], 'urgent (🔴 Gấp)'],
      [['ask', '--level', 'urgent', '--type', 'quyet_dinh', 'x'], 'decision (Quyết định)'],
      [['ask', '--type', 'fyi', 'x'], 'Thiếu --level'],
      [['ask', '--level', 'urgent', 'x'], 'Thiếu --type'],
    ];
    const sai_ma: string[] = [];
    const sai_chu: string[] = [];
    const co_request: string[] = [];
    for (const [ds, doan] of ca) {
      const b = ban(TOKEN_QL);
      if ((await chayCli([...ds, '--json'], b.mt)) !== MA_THOAT.loi_nghiep_vu) {
        sai_ma.push(ds.join(' '));
      }
      const than = loiJson(b);
      if (than.loi !== 'INVALID_INPUT' || !than.thong_diep.includes(doan)) {
        sai_chu.push(`${ds.join(' ')} → ${than.thong_diep}`);
      }
      if (b.so_request() !== 0) co_request.push(ds.join(' '));
    }
    expect(sai_ma).toEqual([]);
    expect(sai_chu).toEqual([]);
    expect(co_request).toEqual([]);
  });

  it('nhãn tiền tố LỆCH vị trí → INVALID_INPUT tại CLI (không im lặng đổi tên)', async () => {
    const b = ban(TOKEN_QL);
    expect(
      await chayCli(
        ['ask', '--level', 'today', '--type', 'decision', 'x', '--option', 'B: hai', '--option', 'A: một', '--recommend', 'A: lý do', '--json'],
        b.mt,
      ),
    ).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(loiJson(b).thong_diep).toContain('"A"');
    expect(b.so_request()).toBe(0);
  });

  it('`--recommend` trỏ một nhãn KHÔNG có phương án → OPTIONS_REQUIRED tại CLI', async () => {
    const b = ban(TOKEN_QL);
    expect(
      await chayCli(
        ['ask', '--level', 'today', '--type', 'decision', 'x', '--option', 'A: một', '--option', 'B: hai', '--recommend', 'D: lý do', '--json'],
        b.mt,
      ),
    ).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('OPTIONS_REQUIRED');
    expect(b.so_request()).toBe(0);
  });

  it('mục 8: agent `worker` tạo mục → FORBIDDEN (mã thoát 1)', async () => {
    const b = ban(TOKEN_WK);
    expect(await chayCli(['ask', '--level', 'today', '--type', 'fyi', 'Tôi không được', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('FORBIDDEN');
  });
});

/* ================================================================== *
 * `baton result` — d.376 và **mã thoát 4** (19.9 d.543)
 * ================================================================== */

describe('baton result — d.376 "in trạng thái và kết quả", 19.9 d.543 mã thoát 4', () => {
  beforeEach(duLieuMau);

  it('không `--wait`, mục còn Chờ → in "Chưa xử lý." và mã thoát **0** (không phải 4)', async () => {
    const { ma } = await taoMuc(['ask', '--level', 'today', '--type', 'fyi', 'Mục chờ']);
    const b = ban(TOKEN_QL);
    expect(await chayCli(['result', ma], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Chưa xử lý.');
    expect(chu).toContain(nhan('trang_thai_can_chu', 'open'));
    // Không chờ thì không có dòng "hết giờ".
    expect(chu).not.toContain('mã thoát 4');
  });

  it(
    '**MÃ THOÁT 4**: `--wait 1` hết giờ mà mục vẫn chưa xử lý (19.9 d.543)',
    async () => {
      const { ma } = await taoMuc(['ask', '--level', 'today', '--type', 'fyi', 'Không ai xử lý']);
      const b = ban(TOKEN_QL);

      expect(await chayCli(['result', ma, '--wait', '1'], b.mt)).toBe(
        MA_THOAT.het_thoi_gian_cho,
      );
      const chu = b.ra.join('\n');
      expect(chu).toContain('Chưa xử lý.'); // đúng chữ d.543 đòi
      expect(chu).toContain('mã thoát 4');
      // Mục vẫn `open` trong DB: lệnh ĐỌC không đổi gì.
      expect((await canChuTrongDb((await taoMucTheoMa(ma)).id))?.trang_thai).toBe('open');

      // `--json` cũng phải ra mã 4, và thân mang `het_gio`.
      const j = ban(TOKEN_QL);
      expect(await chayCli(['result', ma, '--wait', '1', '--json'], j.mt)).toBe(
        MA_THOAT.het_thoi_gian_cho,
      );
      expect(raJson<{ het_gio: boolean; da_xu_ly: boolean }>(j)).toMatchObject({
        het_gio: true,
        da_xu_ly: false,
      });
    },
    15_000,
  );

  it(
    'ĐỐI CHỨNG mã **0**: cùng lệnh, cùng `--wait`, chủ xử lý mục giữa lúc chờ',
    async () => {
      const { id, ma } = await taoMuc([
        'ask',
        '--level',
        'urgent',
        '--type',
        'decision',
        'Chọn ngưỡng',
        '--option',
        'A: 300',
        '--option',
        'B: 500',
        '--recommend',
        'B: số liệu tuần trước',
      ]);

      const b = ban(TOKEN_QL);
      const dang_cho = bay.theoDoi(chayCli(['result', ma, '--wait', '30'], b.mt));
      await choVaoSo(1);

      const xu_ly = await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, {
        method: 'POST',
        than: { phuong_an: 'B', ghi_them: 'ngưỡng 500' },
      });
      expect(xu_ly.status).toBe(200);

      expect(await dang_cho).toBe(MA_THOAT.xong);
      const chu = b.ra.join('\n');
      expect(chu).toContain(nhan('trang_thai_can_chu', 'resolved'));
      expect(chu).toContain('Phương án đã chọn: B');
      expect(chu).toContain('Phương án đã chọn: B — 500');
      /*
       * **Nửa thứ hai của d.376** — "in trạng thái **và kết quả**". `ket_qua` là
       * **chữ** của mục 8 d.244 ("phương án đã chọn và/hoặc **chữ tự do**"), và
       * `"A, ngưỡng 500"` là chính ví dụ SPEC viết ra; ở đây phương án là B nên
       * máy chủ dựng `"B, ngưỡng 500"` (`cauKetQuaDecision`). Nó là một trường
       * **khác** `phuong_an_da_chon` — bỏ dòng in nó thì agent mất phần "ngưỡng
       * 500", tức mất đúng thứ chủ đã quyết.
       */
      expect(chu).toContain('Kết quả: B, ngưỡng 500');
      expect(chu).not.toContain('Chưa xử lý.');
      expect(chu).not.toContain('mã thoát 4');
    },
    15_000,
  );

  /**
   * **d.376 nửa "kết quả", cho ba loại còn lại.** 19.9 d.540: loại khác
   * `decision` thì chữ là **tuỳ chọn**, để trống thì Baton tự điền "đã chạy" /
   * "đã xem" / "đã đọc". Nên với `run_command` và `fyi`, dòng `Kết quả:` là
   * **thứ duy nhất** nói cho agent biết chủ đã làm gì — không có phương án nào
   * để in thay. Và `review` còn một trường riêng nữa: `ket_luan_review`
   * (mục 8 d.261, hai nút "Đạt"/"Cần sửa"), khác hẳn chữ kết quả.
   */
  it('d.376 "và KẾT QUẢ": `run_command`, `review`, `fyi` in đúng chữ của 19.9 d.540', async () => {
    const ca: [string[], Record<string, unknown>, string[]][] = [
      // Chữ tự do do chủ gõ — đường của d.244 "vd 'đã chạy'".
      [
        ['ask', '--level', 'today', '--type', 'run_command', 'Chạy migration', '--command', 'npm run migrate'],
        { ghi_them: 'đã chạy, phiên bản 0012' },
        ['Kết quả: đã chạy, phiên bản 0012'],
      ],
      // Chữ để TRỐNG → mặc định của 19.9 d.540, cộng kết luận review của d.261.
      [
        ['ask', '--level', 'today', '--type', 'review', 'Đọc giúp', '--file', '/tmp/a.md'],
        { ket_luan: 'dat' },
        ['Kết luận review: dat', 'Kết quả: đã xem'],
      ],
      [
        ['ask', '--level', 'later', '--type', 'fyi', 'Chỉ để biết'],
        {},
        ['Kết quả: đã đọc'],
      ],
    ];
    // Khoá tập loại: đúng ba loại **không** phải `decision` (ca kia đã phủ).
    expect(new Set(ca.map(([ds]) => ds[4]))).toEqual(new Set(['run_command', 'review', 'fyi']));

    const thieu: string[] = [];
    for (const [ds, than, mong] of ca) {
      const { id, ma } = await taoMuc(ds);
      const xu_ly = await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, { method: 'POST', than });
      if (xu_ly.status !== 200) {
        thieu.push(`${ma}: xử lý hỏng (${String(xu_ly.status)})`);
        continue;
      }
      const b = ban(TOKEN_QL);
      if ((await chayCli(['result', ma], b.mt)) !== MA_THOAT.xong) {
        thieu.push(`${ma}: mã thoát khác 0`);
        continue;
      }
      const chu = b.ra.join('\n');
      for (const d of mong) if (!chu.includes(d)) thieu.push(`${ma}: thiếu "${d}"`);
    }
    expect(thieu).toEqual([]);
  });

  /**
   * **#121 — `baton result` hiện rõ một câu trả lời TỰ DO.**
   *
   * Chủ trả lời một mục `decision` bằng chữ, không chọn A/B. Lúc đó
   * `phuong_an_da_chon` là `null`, nên dòng `Phương án đã chọn:` **không in** —
   * và dòng `Kết quả:` là **thứ duy nhất** nói cho agent biết chủ đã quyết gì.
   * Bỏ dòng đó (hoặc gắn nó vào nhánh "có phương án") là một agent chờ xong rồi
   * **không biết** chủ nói gì.
   */
  it('d.376 + #121: `decision` trả lời tự do in `Kết quả:` đúng chữ, KHÔNG in dòng phương án', async () => {
    const { id, ma } = await taoMuc([
      'ask',
      '--level',
      'today',
      '--type',
      'decision',
      'Chọn ngưỡng',
      '--option',
      'A: 300',
      '--option',
      'B: 500',
      '--recommend',
      'B: số liệu tuần trước',
    ]);

    const xu_ly = await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { ghi_them: 'làm trước tính năng, chưa cần đo gì' },
    });
    expect(xu_ly.status, await xu_ly.clone().text()).toBe(200);

    const b = ban(TOKEN_QL);
    expect(await chayCli(['result', ma], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain(nhan('trang_thai_can_chu', 'resolved'));
    expect(chu).toContain('Kết quả: làm trước tính năng, chưa cần đo gì');
    expect(chu).not.toContain('Phương án đã chọn');
    expect(chu).not.toContain('Chưa xử lý.');
  });

  /** Mục 8 d.246: mở lại được, **có ghi lịch sử** — `baton result` phải nói ra. */
  it('d.376 + mục 8 d.246: mục đã mở lại rồi xử lý lại in "Đã mở lại N lần"', async () => {
    const { id, ma } = await taoMuc(['ask', '--level', 'later', '--type', 'fyi', 'Mở lại xem']);
    for (const duong of ['xu-ly', 'mo-lai', 'xu-ly']) {
      const res = await goiApi(`/v1/can-chu/${id}/${duong}`, TOKEN_CHU, {
        method: 'POST',
        than: duong === 'mo-lai' ? {} : { ghi_them: 'lần này mới chắc' },
      });
      expect(res.status).toBe(200);
    }

    const b = ban(TOKEN_QL);
    expect(await chayCli(['result', ma], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Đã mở lại 1 lần');
    expect(chu).toContain('Kết quả: lần này mới chắc');
  });

  it('mục đã **Bỏ qua** cũng là "đã xử lý": in lý do, mã thoát 0 (mục 8 d.244)', async () => {
    const { id, ma } = await taoMuc(['ask', '--level', 'later', '--type', 'fyi', 'Thôi khỏi']);
    expect(
      (
        await goiApi(`/v1/can-chu/${id}/bo-qua`, TOKEN_CHU, {
          method: 'POST',
          than: { ly_do: 'không còn cần nữa' },
        })
      ).status,
    ).toBe(200);

    const b = ban(TOKEN_QL);
    expect(await chayCli(['result', ma, '--wait', '30'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Lý do bỏ qua: không còn cần nữa');
  });

  it('`T-số` không có → NOT_FOUND (mã thoát 1), không phải mã 4', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['result', 'T-9999', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('NOT_FOUND');
  });

  it('`--wait` không phải số giây nguyên → INVALID_INPUT tại CLI, 0 request', async () => {
    const sai: string[] = [];
    for (const w of ['-1', '1.5', '60s', 'abc']) {
      const b = ban(TOKEN_QL);
      const ma = await chayCli(['result', 'T-1', '--wait', w, '--json'], b.mt);
      if (ma !== MA_THOAT.loi_nghiep_vu || loiJson(b).loi !== 'INVALID_INPUT' || b.so_request() !== 0) {
        sai.push(w);
      }
    }
    expect(sai).toEqual([]);
  });
});

/** Id của một mục theo `T-số` (đọc thẳng DB — kiểm chứng độc lập với API). */
async function taoMucTheoMa(ma: string): Promise<{ id: string }> {
  const so = Number(ma.slice(2));
  const d = await env.DB.prepare('SELECT id FROM can_chu WHERE ma_so = ?')
    .bind(so)
    .first<{ id: string }>();
  return { id: d?.id ?? '(không có)' };
}

/* ================================================================== *
 * `baton decision` — d.377, mục 10
 * ================================================================== */

describe('baton decision — d.377 "Ghi Nhật ký"', () => {
  beforeEach(duLieuMau);

  it('đường thường: ghi đúng một dòng với dự án, quyết định, vì sao; mã thoát 0', async () => {
    const b = ban(TOKEN_QL);
    expect(
      await chayCli(
        ['decision', 'SAI', 'Dùng Hono cho router', '--why', 'đã có trong node_modules', '--json'],
        b.mt,
      ),
    ).toBe(MA_THOAT.xong);

    const { id } = raJson<{ id: string }>(b);
    const dong = await nhatKyTrongDb(id);
    expect(dong?.quyet_dinh).toBe('Dùng Hono cho router');
    expect(dong?.vi_sao).toBe('đã có trong node_modules');
    expect(dong?.project_id).toBe('pj-SAI');
    // d.310: "ai" là kết luận của **máy chủ** — agent không tự khai được là chủ.
    expect(dong?.nguoi_loai).toBe('agent');
    expect(dong?.agent_id).toBe('ag-ql');
    expect(await nhatKyTheoThuTu()).toHaveLength(1);
  });

  it('thiếu `--why` → INVALID_INPUT tại CLI, 0 request (d.377 viết nó ngoài ngoặc vuông)', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['decision', 'SAI', 'Quyết gì đó', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(loiJson(b).thong_diep).toContain('--why');
    expect(b.so_request()).toBe(0);
    expect(await nhatKyTheoThuTu()).toEqual([]);
  });

  it('`--ref` LẶP: `T-số` thành căn cứ `ask`, mã ticket thành `ticket`, còn lại là `dong_cu`', async () => {
    const { id: id_muc, ma } = await taoMuc(['ask', '--level', 'later', '--type', 'fyi', 'Căn cứ']);

    const dau = ban(TOKEN_QL);
    expect(
      await chayCli(['decision', 'SAI', 'Dòng thứ nhất', '--why', 'để làm căn cứ', '--json'], dau.mt),
    ).toBe(MA_THOAT.xong);
    const { id: id_cu } = raJson<{ id: string }>(dau);

    const b = ban(TOKEN_QL);
    expect(
      await chayCli(
        ['decision', 'SAI', 'Đổi lại', '--why', 'có dữ liệu mới', '--ref', ma, '--ref', 'SAI-1', '--ref', id_cu, '--json'],
        b.mt,
      ),
    ).toBe(MA_THOAT.xong);

    const { id } = raJson<{ id: string }>(b);
    const cc = await canCuCua(id);
    expect(cc.map((c) => c.loai)).toEqual(['ask', 'ticket', 'dong_cu']);
    expect(cc[0]?.can_chu_id).toBe(id_muc);
    expect(cc[1]?.ticket_id).not.toBeNull();
    expect(cc[2]?.dong_cu_id).toBe(id_cu);
  });

  it('luật thuần `loaiCanCuTuChu`: ba hình chữ của d.308', () => {
    expect(loaiCanCuTuChu('T-18')).toBe('ask');
    expect(loaiCanCuTuChu('SAI-7')).toBe('ticket');
    expect(loaiCanCuTuChu('9f1c2b4e-0000-4000-8000-000000000000')).toBe('dong_cu');
  });

  it('d.312: cảnh báo dãy số dài — CLI in ra, nhưng dòng VẪN được ghi (không chặn)', async () => {
    const b = ban(TOKEN_QL);
    expect(
      await chayCli(['decision', 'SAI', 'Chốt mã số 0123456789', '--why', 'để tra lại'], b.mt),
    ).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Cảnh báo dữ liệu');
    expect(await nhatKyTheoThuTu()).toHaveLength(1);
  });

  it('ĐỐI CHỨNG d.312: quyết định bình thường thì KHÔNG có dòng cảnh báo nào', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['decision', 'SAI', 'Dùng Hono', '--why', 'nhẹ'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).not.toContain('Cảnh báo dữ liệu');
  });

  it('mục 10 d.310: agent `worker` ghi Nhật ký → FORBIDDEN (mã thoát 1), không dòng nào được ghi', async () => {
    const b = ban(TOKEN_WK);
    expect(await chayCli(['decision', 'SAI', 'Tôi quyết', '--why', 'tôi thích', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('FORBIDDEN');
    expect(await nhatKyTheoThuTu()).toEqual([]);
  });

  it('mã dự án sai hình → INVALID_INPUT tại CLI, 0 request', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['decision', 'sai-project', 'x', '--why', 'y', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(b.so_request()).toBe(0);
  });
});

/* ================================================================== *
 * Bộ phân tích: cờ **lặp** (`nhieu_gia_tri`)
 * ================================================================== */

describe('phanTich: kiểu cờ `nhieu_gia_tri`', () => {
  const KHAI = {
    ten: 'thu',
    vi_tri: [] as const,
    co: { option: 'nhieu_gia_tri', one: 'gia_tri' } as const,
  };

  it('cờ lặp giữ ĐỦ và ĐÚNG THỨ TỰ gõ; cả dạng `--x=y`', () => {
    const ts = phanTich(KHAI, ['--option', 'a', '--option=b', '--option', 'c']);
    expect(ts.nhieu['option']).toEqual(['a', 'b', 'c']);
  });

  it('cờ lặp không gõ lần nào → mảng RỖNG (không phải undefined)', () => {
    expect(phanTich(KHAI, []).nhieu['option']).toEqual([]);
  });

  it('ĐỐI CHỨNG: cờ `gia_tri` gõ hai lần vẫn GHI ĐÈ (hành vi cũ, không đổi)', () => {
    const ts = phanTich(KHAI, ['--one', 'x', '--one', 'y']);
    expect(ts.gia_tri['one']).toBe('y');
    expect(ts.nhieu['one']).toBeUndefined();
  });

  it('cách dùng in `...` sau cờ lặp — đúng cách d.375 viết `[--option "A: ..."]...`', async () => {
    const b = ban(TOKEN_QL);
    await chayCli(['ask', '--help'], b.mt);
    expect(b.ra.join('\n')).toContain('[--option <giá trị>]...');
    expect(b.ra.join('\n')).toContain('[--recommend <giá trị>]');
  });

  it('luật thuần `tachNhanPhuongAn` / `tachDeXuat`', () => {
    expect(tachNhanPhuongAn('A: Dùng Hono')).toEqual({ nhan: 'A', noi_dung: 'Dùng Hono' });
    expect(tachNhanPhuongAn('Dùng Hono')).toEqual({ nhan: null, noi_dung: 'Dùng Hono' });
    expect(tachDeXuat('b')).toEqual({ nhan: 'B', ly_do: null });
    expect(tachDeXuat('A: vì rẻ')).toEqual({ nhan: 'A', ly_do: 'vì rẻ' });
    expect(() => tachDeXuat('phương án đầu')).toThrowError(/nhãn phương án/);
    // Nhãn tối đa là E — 5 phương án (mục 8 d.236).
    expect(NHAN_PHUONG_AN).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

/* ================================================================== *
 * Nền chung cho BA lệnh mới — d.380 (`--json`), d.382 (không in token)
 * ================================================================== */

describe('ba lệnh mới: --json, trợ giúp, không in token (d.380, d.382)', () => {
  beforeEach(duLieuMau);

  const TEN_LENH = ['ask', 'result', 'decision'] as const;

  it('cả ba lệnh có trong trợ giúp chung và có --help riêng kèm [--json]', async () => {
    const chung = ban();
    expect(await chayCli(['--help'], chung.mt)).toBe(MA_THOAT.xong);
    const thieu_trong_bang: string[] = [];
    const thieu_json: string[] = [];
    for (const ten of TEN_LENH) {
      if (!chung.ra.join('\n').includes(ten)) thieu_trong_bang.push(ten);
      const b = ban();
      await chayCli([ten, '--help'], b.mt);
      const chu = b.ra.join('\n');
      if (!chu.includes(`Cách dùng: baton ${ten}`) || !chu.includes('[--json]')) {
        thieu_json.push(ten);
      }
    }
    expect(thieu_trong_bang).toEqual([]);
    expect(thieu_json).toEqual([]);
  });

  it('đường thành công của cả BA lệnh: mã thoát 0, và không lệnh nào in token', async () => {
    const { ma } = await taoMuc(['ask', '--level', 'later', '--type', 'fyi', 'Mục để đọc']);
    const chay: string[][] = [
      ['ask', '--level', 'today', '--type', 'fyi', 'Mục mới'],
      ['result', ma],
      ['decision', 'SAI', 'Chốt A', '--why', 'rẻ hơn'],
    ];
    expect(new Set(chay.map((ds) => ds[0]))).toEqual(new Set(TEN_LENH));

    const hong: string[] = [];
    const lot_token: string[] = [];
    for (const ds of chay) {
      const b = ban(TOKEN_QL);
      if ((await chayCli(ds, b.mt)) !== MA_THOAT.xong) hong.push(`${ds.join(' ')} → ${tatCa(b)}`);
      if (tatCa(b).includes(TOKEN_QL)) lot_token.push(ds.join(' '));
    }
    expect(hong).toEqual([]);
    expect(lot_token).toEqual([]);
  });

  /**
   * **Đường LỖI của cả ba lệnh** — `--json` phân tích được, và **lưới chắn token
   * là thật**: token **thật sự có mặt** trong thứ sắp in ra nếu lưới hỏng.
   *   * `ask --context <token>.md`: chính tham số người gõ mang token, và CLI đưa
   *     đường dẫn vào thông điệp lỗi — ca này không đi mạng lần nào;
   *   * hai lệnh kia: máy chủ dội lại token trong thông điệp lỗi của mình.
   */
  it('đường LỖI của cả ba lệnh: --json phân tích được, token bị CHE (không lọt)', async () => {
    const chay: [string[], boolean][] = [
      [['ask', '--level', 'today', '--type', 'fyi', 'x', '--context', `${TOKEN_QL}.md`, '--json'], false],
      [['result', 'T-1', '--json'], true],
      [['decision', 'SAI', 'x', '--why', 'y', '--json'], true],
    ];
    expect(new Set(chay.map(([ds]) => ds[0]))).toEqual(new Set(TEN_LENH));

    const lot_token: string[] = [];
    const thieu_che: string[] = [];
    const sai_ma: string[] = [];
    const json_hong: string[] = [];

    for (const [ds, qua_mang] of chay) {
      const b = ban(TOKEN_QL);
      if (qua_mang) {
        b.mt.fetch = async () =>
          await Promise.resolve(
            Response.json(
              { error: 'INVALID_TOKEN', message: `Token "${TOKEN_QL}" không hợp lệ.` },
              { status: 401 },
            ),
          );
      }
      const ma = await chayCli(ds, b.mt);
      if (ma !== MA_THOAT.loi_nghiep_vu && ma !== MA_THOAT.loi_xac_thuc_hoac_mang) {
        sai_ma.push(`${ds.join(' ')} → mã ${String(ma)}`);
      }
      // `--json` ở đường lỗi: phải phân tích được. Gom lỗi như ba kiểm tra kia —
      // `expect` giữa vòng sẽ ném và che mọi lệnh còn lại của danh sách.
      try {
        if (typeof loiJson(b).thong_diep !== 'string') json_hong.push(ds.join(' '));
      } catch {
        json_hong.push(`${ds.join(' ')} (không phân tích được JSON)`);
      }
      if (tatCa(b).includes(TOKEN_QL)) lot_token.push(ds.join(' '));
      if (!tatCa(b).includes(CHE)) thieu_che.push(ds.join(' '));
    }

    expect(json_hong).toEqual([]);
    expect(sai_ma).toEqual([]);
    expect(lot_token).toEqual([]);
    expect(thieu_che).toEqual([]);
  });
});
