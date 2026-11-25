/**
 * **UI BAT-69** — khép đợt UI theo `DESIGN.md`. Không ca nào ở đây kiểm hành vi
 * SPEC mới: hành vi không đổi (phân tích markdown, `hinhCuaDiaChi`, chống XSS vẫn
 * do `markdown.test.tsx` canh). Ca ở đây ghim **quy tắc trình bày**:
 *
 *   1. Markdown: mã nội dòng / khối code là token (`bg-nen-noi` + viền mờ +
 *      `text-chu`), không `bg-neutral-*`; liên kết màu liên kết + gạch chân thường
 *      trực; liên kết không an toàn vẫn không `<a href>`, chữ `chu-mo`. Hai chế độ:
 *      cặp chữ–nền mới đo từ `kieu.css` ≥ 4.5:1 ở cả tối lẫn sáng;
 *   2. tiêu đề bảng phím `?` và hộp Giao việc = `LOP_TIEU_DE_MUC`;
 *   3. chấm agent sidebar: không `title` lặp trên vỏ, đúng một `aria-label`;
 *   4. chip trạng thái phiên `error` = `LOP_CHIP_LOI`, mã khác = `LOP_CHIP`;
 *   5. bảy hộp nổi dùng lớp phủ token `bg-lop-phu` (đen 50% cả hai chế độ).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  LOP_MD_CODE,
  LOP_MD_KHONG_AN_TOAN,
  LOP_MD_LIEN,
  LOP_MD_MA,
  Markdown,
} from '../src/markdown';
import { BangPhim, NHAN_DONG_BANG_PHIM_NGOAI } from '../src/vo/phim-vo';
import { HopGiaoViec } from '../src/vo/giao-viec';
import { Sidebar } from '../src/vo/sidebar';
import {
  NHAN_TRANG_THAI_PHIEN,
  TEN_KHOI_PHIEN,
  TrangPhien,
  lopChipTrangThaiPhien,
} from '../src/trang/phien';
import { LOP_CHIP, LOP_CHIP_LOI, LOP_LIEN_KET, LOP_TIEU_DE_MUC } from '../src/vo/lop-nut';
import { MayChuGia, TOI_CHU, datKhoGia, dung } from './giup';
import { agentDong, doiAgent, manHinhPhien, phienDong } from './than-agent';

/* ================================================================== *
 * Giúp (cùng nếp `ui-bat68.test.tsx`)
 * ================================================================== */

const NGUON = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });

async function docMot(duoi: string): Promise<string> {
  for (const [duong, doc] of Object.entries(NGUON)) {
    if (duong.endsWith(duoi)) return (await doc()) as string;
  }
  throw new Error(`không thấy ${duoi}`);
}

function boGhiChu(ma: string): string {
  return ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function lop(e: Element | null | undefined): string[] {
  return (e?.getAttribute('class') ?? '').split(/\s+/).filter((x) => x !== '');
}

/** `kieu.css` đọc bằng `node:fs` — cùng lý do ghi ở `vo-linear.test.tsx` (`?raw` rỗng dưới vitest). */
function docKieuCss(): string {
  const duong = expect.getState().testPath;
  if (duong === undefined) throw new Error('Không biết đường của file test');
  return readFileSync(join(dirname(duong), '..', 'src', 'kieu.css'), 'utf8');
}

function khoiSau(van: string, moc: string): string {
  const i = van.indexOf(moc);
  if (i < 0) return '';
  const j = van.indexOf('{', i);
  return van.slice(j, van.indexOf('}', j));
}

function bang(khoi: string): Map<string, string> {
  const b = new Map<string, string>();
  for (const m of khoi.matchAll(/(--t-[a-z0-9-]+)\s*:\s*([^;]+);/g)) b.set(m[1] ?? '', (m[2] ?? '').trim());
  return b;
}

const HAI_CHE_DO = (): Record<'sang' | 'toi', Map<string, string>> => ({
  sang: bang(khoiSau(docKieuCss(), '\n:root {')),
  toi: bang(khoiSau(docKieuCss(), "\n:root[data-theme='toi']")),
});

function sangTuongDoi(hex: string): number {
  const k = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (k[0] ?? 0) + 0.7152 * (k[1] ?? 0) + 0.0722 * (k[2] ?? 0);
}

function tiLe(a: string, b: string): number {
  const [x, y] = [sangTuongDoi(a), sangTuongDoi(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
}

function datCheDo(che: 'toi' | 'sang'): void {
  document.documentElement.setAttribute('data-theme', che);
}

const VAN_MD = [
  'Xem `baton ask` và [SAI-1](/t/SAI-1), [tài liệu](https://vi-du.local/a), [xấu](javascript:alert(1)).',
  '',
  '- một `mã` trong danh sách',
  '',
  '```',
  'npm run test',
  '```',
].join('\n');

beforeEach(() => {
  datKhoGia();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.style.overflow = '';
});

/* ================================================================== *
 * 1. Markdown — hai chế độ
 * ================================================================== */

describe('Markdown — mã, khối code, liên kết là token (cả chế độ tối và sáng)', () => {
  for (const che of ['toi', 'sang'] as const) {
    it(`chế độ ${che}: mã / khối code \`bg-nen-noi\` + viền mờ + \`text-chu\`, không \`bg-neutral-*\``, () => {
      datCheDo(che);
      const { container } = dung(<Markdown van={VAN_MD} />);
      const ma = [...container.querySelectorAll('code')];
      expect(ma.length).toBe(2);
      for (const c of ma) {
        expect(c.getAttribute('class')).toBe(LOP_MD_MA);
        expect(lop(c)).toEqual(expect.arrayContaining(['bg-nen-noi', 'border', 'border-vien', 'text-chu']));
        expect(lop(c).filter((x) => /neutral-/.test(x))).toEqual([]);
      }
      const pre = container.querySelector('pre[data-khoi-md="code"]');
      expect(pre?.textContent).toBe('npm run test');
      expect(pre?.getAttribute('class')).toBe(LOP_MD_CODE);
      expect(lop(pre)).toEqual(expect.arrayContaining(['bg-nen-noi', 'border', 'border-vien', 'text-chu', 'overflow-x-auto']));
      expect(lop(pre).filter((x) => /neutral-/.test(x))).toEqual([]);
    });

    it(`chế độ ${che}: liên kết trong/ngoài mang màu liên kết \`LOP_LIEN_KET\` + gạch chân thường trực`, () => {
      datCheDo(che);
      const { container } = dung(<Markdown van={VAN_MD} />);
      const trong = container.querySelector('[data-lien="trong"]');
      const ngoai = container.querySelector('[data-lien="ngoai"]');
      expect(trong?.getAttribute('href')).toBe('/t/SAI-1');
      expect(ngoai?.getAttribute('href')).toBe('https://vi-du.local/a');
      for (const a of [trong, ngoai]) {
        expect(a?.getAttribute('class')).toBe(LOP_MD_LIEN);
        expect(lop(a)).toEqual(expect.arrayContaining([...LOP_LIEN_KET.split(' '), 'underline']));
        expect(lop(a)).toContain('text-nhan-manh-chu');
      }
    });

    it(`chế độ ${che}: liên kết không an toàn vẫn KHÔNG \`<a href>\`, chữ \`chu-mo\` token`, () => {
      datCheDo(che);
      const { container } = dung(<Markdown van={VAN_MD} />);
      const xau = container.querySelector('[data-lien="khong-an-toan"]');
      expect(xau?.tagName).toBe('SPAN');
      expect(xau?.textContent).toContain('javascript:alert(1)');
      expect(xau?.getAttribute('class')).toBe(LOP_MD_KHONG_AN_TOAN);
      expect(lop(xau)).toContain('text-chu-mo');
      expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
        '/t/SAI-1',
        'https://vi-du.local/a',
      ]);
    });
  }

  it('cặp chữ–nền của mã / khối code (`chu` trên `nen-noi`) ≥ 4.5:1 ở CẢ HAI chế độ', () => {
    for (const [che, b] of Object.entries(HAI_CHE_DO())) {
      const nen = b.get('--t-nen-noi');
      const chu = b.get('--t-chu');
      expect(nen, che).toMatch(/^#[0-9a-f]{6}$/i);
      expect(chu, che).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tiLe(nen ?? '', chu ?? '')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('liên kết (`nhan-manh-chu`) và chữ không an toàn (`chu-mo`) ≥ 4.5:1 trên `nen` và `nen-lop` ở cả hai chế độ', () => {
    for (const b of Object.values(HAI_CHE_DO())) {
      for (const nen of ['--t-nen', '--t-nen-lop']) {
        for (const chu of ['--t-nhan-manh-chu', '--t-chu-mo']) {
          expect({ nen, chu, r: tiLe(b.get(nen) ?? '', b.get(chu) ?? '') >= 4.5 }).toEqual({ nen, chu, r: true });
        }
      }
    }
  });

  it('nguồn: `markdown.tsx` không còn `bg-neutral-*` / `text-neutral-*` nào', async () => {
    const ma = boGhiChu(await docMot('src/markdown.tsx'));
    expect(ma).not.toMatch(/(?:bg|text)-neutral-/);
  });
});

/* ================================================================== *
 * 2. Tiêu đề hộp: bảng phím `?`, Giao việc
 * ================================================================== */

describe('tiêu đề hộp nổi = `LOP_TIEU_DE_MUC`', () => {
  it('bảng phím `?`: `h2` mang đúng `LOP_TIEU_DE_MUC`, không `text-[15px]`', () => {
    dung(<BangPhim dong={() => undefined} />);
    const h2 = document.getElementById('bang-phim-tieu-de');
    expect(h2?.tagName).toBe('H2');
    expect(h2?.getAttribute('class')).toBe(LOP_TIEU_DE_MUC);
  });

  it('hộp Giao việc: `h2` mang `LOP_TIEU_DE_MUC` (+ `mb-3`), không `text-base`', () => {
    globalThis.fetch = () => new Promise<Response>(() => undefined);
    dung(<HopGiaoViec ticket={{ id: 'tk-1', ma: 'SAI-1' }} dong={() => undefined} />);
    const h2 = document.getElementById('giao-viec-tieu-de');
    expect(h2?.tagName).toBe('H2');
    expect(lop(h2)).toEqual(expect.arrayContaining(LOP_TIEU_DE_MUC.split(' ')));
    expect(lop(h2)).not.toContain('text-base');
    expect(lop(h2).filter((c) => c !== 'mb-3')).toEqual(LOP_TIEU_DE_MUC.split(' '));
  });
});

/* ================================================================== *
 * 3. Chấm agent sidebar — một nguồn nhãn
 * ================================================================== */

describe('chấm agent sidebar: không `title` lặp, đúng một `aria-label`', () => {
  it('vỏ `data-trang-thai-agent` không `title`; trong vỏ đúng một phần tử có `aria-label` = nhãn máy chủ', async () => {
    new MayChuGia()
      .dat('GET /v1/toi', { than: TOI_CHU })
      .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/can-chu', { than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null } } })
      .dat('GET /v1/man-hinh-agent', {
        than: doiAgent([
          agentDong({ id: 'ag-1', ten: 'W-builder', trang_thai: 'busy', nhan_trang_thai: 'Đang làm' }),
          agentDong({ id: 'ag-2', ten: 'W-reviewer', trang_thai: 'stalled', nhan_trang_thai: 'Đứng' }),
        ]),
      })
      .gan();
    dung(<Sidebar />);
    await screen.findByText('W-builder');
    for (const [t, nhan] of [
      ['busy', 'Đang làm'],
      ['stalled', 'Đứng'],
    ] as const) {
      const vo = document.querySelector(`[data-trang-thai-agent="${t}"]`);
      expect(vo, t).not.toBeNull();
      expect(vo?.hasAttribute('title')).toBe(false);
      const co_nhan = [vo, ...(vo?.querySelectorAll('*') ?? [])].filter((e) => e?.hasAttribute('aria-label'));
      expect(co_nhan.length).toBe(1);
      expect(co_nhan[0]?.getAttribute('aria-label')).toBe(nhan);
      expect(co_nhan[0]?.getAttribute('role')).toBe('img');
    }
  });
});

/* ================================================================== *
 * 4. Chip trạng thái phiên `error`
 * ================================================================== */

describe('chip trạng thái phiên: `error` = `LOP_CHIP_LOI`, mã khác = `LOP_CHIP`', () => {
  it('luật thuần trên đủ bảy mã của bảng 0.1', () => {
    for (const ma of Object.keys(NHAN_TRANG_THAI_PHIEN)) {
      expect(lopChipTrangThaiPhien(ma), ma).toBe(ma === 'error' ? LOP_CHIP_LOI : LOP_CHIP);
    }
    expect(Object.keys(NHAN_TRANG_THAI_PHIEN)).toContain('error');
  });

  it('Chi tiết phiên `error`: chip `LOP_CHIP_LOI`, không nền, không hình, chữ = nhãn máy chủ', async () => {
    const than = manHinhPhien({
      phien: phienDong({ id: 'ph-9', trang_thai: 'error', nhan_trang_thai: 'Lỗi' }),
    });
    new MayChuGia().dat('GET /v1/man-hinh-phien/ph-9', { than }).gan();
    dung(<TrangPhien id="ph-9" />, '/phien/ph-9');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });
    const chip = document.querySelector('[data-o="trang-phien"] [data-trang-thai="error"]');
    expect(chip?.getAttribute('class')).toBe(LOP_CHIP_LOI);
    expect(chip?.textContent).toBe('Lỗi');
    expect(lop(chip).filter((c) => c.startsWith('bg-'))).toEqual([]);
    expect(chip?.querySelector('svg')).toBeNull();
  });

  it('Chi tiết phiên `running`: chip vẫn `LOP_CHIP`', async () => {
    const than = manHinhPhien({
      phien: phienDong({ id: 'ph-8', trang_thai: 'running', nhan_trang_thai: 'Đang chạy' }),
    });
    new MayChuGia().dat('GET /v1/man-hinh-phien/ph-8', { than }).gan();
    dung(<TrangPhien id="ph-8" />, '/phien/ph-8');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });
    const chip = document.querySelector('[data-o="trang-phien"] [data-trang-thai="running"]');
    expect(chip?.getAttribute('class')).toBe(LOP_CHIP);
  });

  it('nguồn: mọi CHIP trạng thái phiên đi qua `lopChipTrangThaiPhien` (không chip `data-trang-thai={p.trang_thai}` nào khai lớp trực tiếp)', async () => {
    const xau: string[] = [];
    let co = 0;
    for (const [duong, doc] of Object.entries(NGUON)) {
      const ma = boGhiChu((await doc()) as string);
      for (const m of ma.matchAll(/data-trang-thai=\{p\.trang_thai\}\s+className=\{([^}]*)\}/g)) {
        co += 1;
        if (!(m[1] ?? '').startsWith('lopChipTrangThaiPhien(')) xau.push(`${duong}: ${m[1] ?? ''}`);
      }
    }
    expect(co).toBeGreaterThan(0);
    expect(xau).toEqual([]);
  });
});

/* ================================================================== *
 * 5. Lớp phủ hộp nổi — token `lop-phu`
 * ================================================================== */

const BAY_HOP = [
  'vo/phim-vo.tsx',
  'vo/tao-viec.tsx',
  'vo/giao-viec.tsx',
  'vo/command-menu.tsx',
  'App.tsx',
  'trang/danh-sach-ticket.tsx',
  'trang/token-agent.tsx',
] as const;

describe('lớp phủ bảy hộp nổi = `bg-lop-phu`', () => {
  it('kieu.css: token `lop-phu` có ở CẢ HAI chế độ, cùng giá trị đen 50% (không đảo)', () => {
    const css = docKieuCss();
    expect(css).toContain('--color-lop-phu: var(--t-lop-phu);');
    const { sang, toi } = HAI_CHE_DO();
    expect(sang.get('--t-lop-phu')).toBe('rgb(0 0 0 / 0.5)');
    expect(toi.get('--t-lop-phu')).toBe('rgb(0 0 0 / 0.5)');
  });

  it('nguồn: mỗi hộp đúng một `absolute inset-0 bg-lop-phu`; không còn `bg-black/50` nào trong `src`', async () => {
    for (const f of BAY_HOP) {
      const ma = boGhiChu(await docMot(f));
      expect({ f, n: ma.split('absolute inset-0 bg-lop-phu').length - 1 }).toEqual({ f, n: 1 });
    }
    const con: string[] = [];
    for (const [duong, doc] of Object.entries(NGUON)) {
      if (boGhiChu((await doc()) as string).includes('bg-black/')) con.push(duong);
    }
    expect(con).toEqual([]);
    // Đúng bảy chỗ dùng — thêm một hộp mới thì thêm vào danh sách này.
    let tong = 0;
    for (const doc of Object.values(NGUON)) {
      tong += boGhiChu((await doc()) as string).split('bg-lop-phu').length - 1;
    }
    expect(tong).toBe(BAY_HOP.length);
  });

  it('bảng phím `?` dựng thật: nút lớp phủ mang `bg-lop-phu`', () => {
    dung(<BangPhim dong={() => undefined} />);
    const phu = screen.getByRole('button', { name: NHAN_DONG_BANG_PHIM_NGOAI });
    expect(lop(phu)).toEqual(['absolute', 'inset-0', 'bg-lop-phu']);
  });
});
