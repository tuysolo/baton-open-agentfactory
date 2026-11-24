/**
 * CLI `baton export <file>` — SPEC mục 15 d.429 (xuất toàn bộ dữ liệu ra JSON, **chỉ
 * chủ**), mục 13 d.380 (mã thoát, `--json`), d.382 (không in token). BAT-8.
 *
 * Đường thật như mọi `cli*.test.ts`: `chayCli` → `fetch` vào Worker thật trong
 * Miniflare (`SELF`) → D1. **Không đụng đĩa**: `ghiFile` là một bản giả giữ nội
 * dung trong bộ nhớ (cùng nếp `docFile` của các ca `plan`/`submit`), nên không có file
 * tạm nào sinh ra trong repo hay ở đâu khác.
 */

import { SELF } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { MA_THOAT } from '@baton/shared';
import {
  GHI_CHU_EXPORT,
  chayCli,
  dongTroGiup,
  goiCongCu,
  noiDay,
  type MoiTruongCli,
  type TienTrinhNode,
} from '@baton/cli';
import { TOKEN_CHU, dungAgentCoToken, dungDuAn, dungTicket, dungWorkspace } from './giup.js';
import { BANG_XUAT, type BanXuat } from '../src/xuat-du-lieu.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ (BAT-53, xem `caQuaSo`): ca hết giờ không để
// lệnh CLI còn dở bắn request vào lúc pool pop storage cô lập.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const URL_API = 'https://baton.test';
const TOKEN_AG = 'bt_token_gia_CLI_XUAT_coordinator_z7';
const FILE = '/thu-muc-gia/baton-xuat.json';

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
  /** File đã "ghi" — đường dẫn → nội dung. */
  da_ghi: Map<string, string>;
}

function ban(token: string, tuy_chon: { ghi_loi?: boolean; khong_ghi?: boolean } = {}): BanChay {
  const ra: string[] = [];
  const loi: string[] = [];
  const da_ghi = new Map<string, string>();
  const mt: MoiTruongCli = {
    env: { BATON_URL: URL_API, BATON_TOKEN: token },
    viet: (d) => void ra.push(d),
    vietLoi: (d) => void loi.push(d),
    fetch: (u, i) => SELF.fetch(u, i),
  };
  if (tuy_chon.khong_ghi !== true) {
    mt.ghiFile = async (duong, noi_dung) => {
      if (tuy_chon.ghi_loi === true || da_ghi.has(duong)) {
        throw new Error('EEXIST: file already exists');
      }
      da_ghi.set(duong, noi_dung);
      await Promise.resolve();
    };
  }
  return { mt, ra, loi, da_ghi };
}

beforeEach(async () => {
  await dungWorkspace();
  const pj = await dungDuAn('SAI', 'Sample');
  await dungTicket(pj, 1, 'Việc trong bản xuất CLI');
  await dungAgentCoToken({
    id: 'ag-coord',
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: TOKEN_AG,
    vao_tat_ca_du_an: true,
  });
});

describe('baton export — chủ (TOKEN_CHU)', () => {
  it('ghi file JSON đúng định dạng, in đường dẫn + số dòng mỗi bảng, mã thoát 0', async () => {
    const b = ban(TOKEN_CHU);
    expect(await chayCli(['export', FILE], b.mt)).toBe(MA_THOAT.xong);

    const noi_dung = b.da_ghi.get(FILE);
    expect(noi_dung).toBeDefined();
    const bx = JSON.parse(noi_dung ?? '{}') as BanXuat;
    expect(bx.schema_version).toBe(1);
    expect(Object.keys(bx.bang)).toEqual(Object.keys(BANG_XUAT));
    expect(bx.bang['ticket']?.[0]).toMatchObject({ tieu_de: 'Việc trong bản xuất CLI' });

    const ra = b.ra.join('\n');
    expect(ra).toContain(`Đã ghi: ${FILE}`);
    expect(ra).toContain('  ticket: 1');
    expect(ra).toContain('  project: 1');
    expect(ra).toContain('  agent: 1');
    // Không bao giờ in token (d.382).
    expect([...b.ra, ...b.loi].join('\n')).not.toContain(TOKEN_CHU);
  });

  it('--json: chỉ in TÓM TẮT (file, so_dong), không đổ cả bản xuất ra stdout', async () => {
    const b = ban(TOKEN_CHU);
    expect(await chayCli(['export', FILE, '--json'], b.mt)).toBe(MA_THOAT.xong);
    const kq = JSON.parse(b.ra.join('\n')) as {
      file: string;
      schema_version: number;
      so_dong: Record<string, number>;
      tong_so_dong: number;
    };
    expect(kq.file).toBe(FILE);
    expect(kq.schema_version).toBe(1);
    expect(kq.so_dong['ticket']).toBe(1);
    expect(Object.keys(kq.so_dong)).toEqual(Object.keys(BANG_XUAT));
    expect(b.ra.join('\n')).not.toContain('Việc trong bản xuất CLI');
  });

  it('file đã có → INVALID_INPUT (không ghi đè), mã thoát 1, nêu đường dẫn', async () => {
    const b = ban(TOKEN_CHU, { ghi_loi: true });
    expect(await chayCli(['export', FILE], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('INVALID_INPUT');
    expect(b.loi.join('\n')).toContain(FILE);
  });

  it('môi trường không ghi được file → INVALID_INPUT, mã thoát 1', async () => {
    const b = ban(TOKEN_CHU, { khong_ghi: true });
    expect(await chayCli(['export', FILE], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('không ghi được file');
  });

  it('thiếu tham số file → INVALID_INPUT kèm cách dùng', async () => {
    const b = ban(TOKEN_CHU);
    expect(await chayCli(['export'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('Cách dùng: baton export <file>');
  });
});

describe('baton export — token agent → FORBIDDEN (d.429 "chỉ chủ")', () => {
  it('coordinator: in FORBIDDEN, mã thoát khác 0 (1), KHÔNG tạo file nào', async () => {
    const b = ban(TOKEN_AG);
    const ma = await chayCli(['export', FILE], b.mt);
    expect(ma).toBe(MA_THOAT.loi_nghiep_vu);
    expect(ma).not.toBe(MA_THOAT.xong);
    expect(b.loi.join('\n')).toContain('FORBIDDEN');
    expect(b.da_ghi.size).toBe(0);
  });

  it('KHÔNG có đường MCP: `export` là lệnh chỉ-CLI → INVALID_INPUT, không ghi file (kể cả TOKEN_CHU)', async () => {
    for (const token of [TOKEN_AG, TOKEN_CHU]) {
      const b = ban(token);
      const kq = await goiCongCu(b.mt, 'export', { file: FILE });
      expect(kq.structuredContent.loi).toBe('INVALID_INPUT');
      expect(b.da_ghi.size).toBe(0);
    }
  });
});

describe('baton export — trợ giúp nói rõ: chỉ chạy với TOKEN_CHU', () => {
  it('`baton export --help` có ghi chú TOKEN_CHU', async () => {
    const b = ban(TOKEN_CHU);
    expect(await chayCli(['export', '--help'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Cách dùng: baton export <file>');
    expect(b.ra.join('\n')).toContain(GHI_CHU_EXPORT);
    expect(GHI_CHU_EXPORT).toContain('TOKEN_CHU');
  });

  it('trợ giúp chung liệt kê `export` và nói TOKEN_CHU', () => {
    const chu = dongTroGiup().join('\n');
    expect(chu).toContain('export');
    expect(chu).toContain('TOKEN_CHU');
  });

  it('dây nối noiDay chuyển `ghiFile` của bin.ts vào lệnh', async () => {
    const da_ghi: string[] = [];
    const ra: string[] = [];
    const tt: TienTrinhNode = {
      argv: ['node', 'baton', 'export', FILE],
      env: { BATON_URL: URL_API, BATON_TOKEN: TOKEN_CHU },
      stdout: { write: (c: string) => ra.push(c) },
      stderr: { write: (c: string) => ra.push(c) },
      exitCode: -1,
    };
    // `noiDay` không nhận `fetch`; dựng lại môi trường qua `chayCli` thì mất chính
    // dây nối cần kiểm, nên gắn `fetch` toàn cục của ca này vào Worker thật.
    const goc = globalThis.fetch;
    globalThis.fetch = (u: RequestInfo | URL, i?: RequestInit) => SELF.fetch(u, i);
    try {
      await noiDay(tt, undefined, undefined, async (duong) => {
        da_ghi.push(duong);
        await Promise.resolve();
      });
    } finally {
      globalThis.fetch = goc;
    }
    expect(tt.exitCode).toBe(MA_THOAT.xong);
    expect(da_ghi).toEqual([FILE]);
  });
});
