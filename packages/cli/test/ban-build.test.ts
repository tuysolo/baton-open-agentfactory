/**
 * **Cổng kiểm bản build chạy thật** — `dist/` có chạy được bằng `node` không.
 *
 * SPEC mục 13 d.351: "Ba đường, cùng một bộ quyền: CLI `baton`, MCP server,
 * HTTP API". Hai đường đầu chạy bằng `node` trên máy của chủ, qua `bin` trong
 * `packages/cli/package.json`. Mọi test khác của CLI chạy trong Miniflare, nơi
 * esbuild bundle TypeScript — nên chúng **không** thấy được một `exports` sai,
 * một đuôi `.js` thiếu, hay một file không có trong `dist/`. Hai ca dưới đây đi
 * đúng đường chủ đi: sinh tiến trình con, nói với nó qua stdio, xem mã thoát.
 *
 * Chạy sau `npm run build` (xem script `kiem-ban-build` ở root). Không nhập một
 * dòng nào của `src/`: nếu nhập thì lại là bundler đọc hộ, và cổng này mất nghĩa.
 */

import { spawn, type TienTrinhCon } from 'node:child_process';
import { describe, expect, it } from 'vitest';

declare const process: {
  readonly execPath: string;
};

const DIST = `${import.meta.dirname}/../dist`;

/**
 * Môi trường **tối giản** cho tiến trình con: không mang `process.env` của test
 * đi theo. Hai lý do — không có đường nào để một secret thật trong môi trường
 * lẫn vào (CLAUDE.md mục 5), và `BATON_URL` trỏ vào một cổng không ai nghe nên
 * không lời gọi mạng nào ra được khỏi máy (mục 3, 6).
 */
const TOKEN_GIA = 'bt_gia_cho_test';
const MOI_TRUONG = { BATON_URL: 'http://127.0.0.1:1', BATON_TOKEN: TOKEN_GIA };

interface KetThuc {
  readonly ma: number | null;
  readonly ra: string;
  readonly loi: string;
}

/**
 * Chạy `node <dist/...>` tới lúc nó tự thoát, gom stdout/stderr.
 *
 * Chờ `'close'` chứ không `'exit'` (xem `node-tien-trinh.d.ts`): chỉ khi
 * `'close'` nổ thì stdio mới chắc đã đóng, nên `ra`/`loi` mới đọc được đủ.
 * `setTimeout → SIGKILL` là lưới cuối, y như ca MCP: `testTimeout` của vitest
 * làm test đỏ nhưng **không** giết tiến trình con, nên một `bin.js` treo sẽ
 * sống sót qua cả lượt chạy.
 */
async function chay(duong: string, doi_so: readonly string[]): Promise<KetThuc> {
  const tt = spawn(process.execPath, [duong, ...doi_so], { env: MOI_TRUONG });
  let ra = '';
  let loi = '';
  tt.stdout.setEncoding('utf8');
  tt.stderr.setEncoding('utf8');
  tt.stdout.on('data', (manh) => {
    ra += manh;
  });
  tt.stderr.on('data', (manh) => {
    loi += manh;
  });
  const het_gio = setTimeout(() => tt.kill('SIGKILL'), 20_000);
  return await new Promise<KetThuc>((xong, hong) => {
    tt.on('error', hong);
    tt.on('close', (ma) => {
      clearTimeout(het_gio);
      xong({ ma, ra, loi });
    });
  });
}

/**
 * **d.382: "không bao giờ in token".** Ba ca dưới đây bơm `BATON_TOKEN` giả vào
 * tiến trình con, nên đây là lần duy nhất luật ấy được kiểm trên **binary
 * thật** — không phải trên hàm tạo thông điệp. Nếu một bản sau in môi trường ra
 * để "cho dễ gỡ lỗi" thì chỗ này đỏ.
 */
function khong_in_token(ra: string, loi: string): void {
  expect({ ra_co_token: ra.includes(TOKEN_GIA), loi_co_token: loi.includes(TOKEN_GIA) }).toEqual({
    ra_co_token: false,
    loi_co_token: false,
  });
}

describe('bản build chạy bằng node thật (d.351)', () => {
  /*
   * Ca này là ca đã **bắt được lỗi thật**: `exports` của `@baton/shared` và
   * `@baton/client` trỏ vào `./src/index.ts`, nên `node` được giao mã nguồn
   * TypeScript và chết ở dòng `export * from './ma-nhan.js'` với
   * `ERR_MODULE_NOT_FOUND`. `npm test` lúc đó xanh 2326 ca.
   */
  it('`baton --help` ra mã 0 và in danh sách lệnh', async () => {
    const kq = await chay(`${DIST}/bin.js`, ['--help']);

    // Khai `loi` trong thông điệp: khi đỏ, `ERR_MODULE_NOT_FOUND` phải đọc được
    // ngay từ dòng kết quả, không phải đi tìm.
    expect({ ma: kq.ma, loi: kq.loi }).toEqual({ ma: 0, loi: '' });
    expect(kq.ra).toContain('baton — nói chuyện với Baton từ dòng lệnh');
    expect(kq.ra).toContain('Lệnh:');
    // Vài lệnh trụ của mục 13; đủ để biết `SO_LENH` đã nạp, không ghim cả bảng
    // (bảng còn dài ra ở các lượt sau).
    for (const ten of ['tasks', 'show', 'submit']) expect(kq.ra).toContain(ten);
    khong_in_token(kq.ra, kq.loi);
  });

  it('`baton --help --json` ra JSON đọc được, mã 0', async () => {
    const kq = await chay(`${DIST}/bin.js`, ['--help', '--json']);

    expect({ ma: kq.ma, loi: kq.loi }).toEqual({ ma: 0, loi: '' });
    const than: unknown = JSON.parse(kq.ra);
    expect(Array.isArray((than as { lenh: unknown }).lenh)).toBe(true);
    khong_in_token(kq.ra, kq.loi);
  });

  /*
   * `baton-mcp` không nhận tham số và không tự thoát: nó đọc stdio tới lúc
   * stdin đóng. Nên ca này nói đúng giao thức — `initialize`, rồi `tools/list`
   * (JSON phân cách bằng xuống dòng, xem `mcp/may-chu.ts`) — và **chốt** bằng
   * `stdin.end()` để tiến trình tự thoát. `kill` chỉ là lưới cuối.
   */
  it('`baton-mcp` trả lời initialize và tools/list qua stdio', async () => {
    const tt: TienTrinhCon = spawn(process.execPath, [`${DIST}/bin-mcp.js`], { env: MOI_TRUONG });
    let ra = '';
    let loi = '';
    tt.stdout.setEncoding('utf8');
    tt.stderr.setEncoding('utf8');
    tt.stdout.on('data', (manh) => {
      ra += manh;
    });
    tt.stderr.on('data', (manh) => {
      loi += manh;
    });

    const het_gio = setTimeout(() => tt.kill('SIGKILL'), 20_000);
    const xong_han = new Promise<number | null>((xong, hong) => {
      tt.on('error', hong);
      // `'close'`, không `'exit'`: hai dòng JSON trả lời phải đọc đủ ở `ra`.
      tt.on('close', (ma) => {
        clearTimeout(het_gio);
        xong(ma);
      });
    });

    tt.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test' } },
      })}\n`,
    );
    tt.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    tt.stdin.end();

    const ma = await xong_han;

    expect({ ma, loi }).toEqual({ ma: 0, loi: '' });

    const dong = ra.split('\n').filter((d) => d.trim() !== '');
    expect(dong).toHaveLength(2);

    const d1 = JSON.parse(dong[0]!) as {
      id: number;
      result?: { protocolVersion?: string; serverInfo?: { name?: string } };
    };
    expect(d1.id).toBe(1);
    expect(d1.result?.protocolVersion).toBe('2025-06-18');
    expect(d1.result?.serverInfo?.name).toBe('baton');

    const d2 = JSON.parse(dong[1]!) as {
      id: number;
      result?: { tools?: { name: string }[] };
    };
    expect(d2.id).toBe(2);
    const ten_cong_cu = (d2.result?.tools ?? []).map((c) => c.name);
    // d.355: "MCP có công cụ tương đương, cùng tên" — cùng bảng với CLI.
    expect(ten_cong_cu.length).toBeGreaterThan(0);
    for (const ten of ['tasks', 'show', 'submit']) expect(ten_cong_cu).toContain(ten);
    khong_in_token(ra, loi);
  });
});
