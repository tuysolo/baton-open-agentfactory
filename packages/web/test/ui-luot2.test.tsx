/**
 * **UI lượt 2 (BAT-61)** — các trang còn lại theo `THIET-KE.md`, và bốn góp ý
 * reviewer của BAT-60. Không ca nào ở đây kiểm hành vi SPEC: hành vi không đổi,
 * các ca hành vi của từng trang vẫn ở file test của trang ấy. Ca ở đây ghim
 * **quy tắc trình bày** đã ghi vào `THIET-KE.md`, để một lượt sau gõ lại
 * `text-xl` hay một vòng nhập là một ca đỏ.
 *
 * Nguồn đọc qua `import.meta.glob(..., '?raw')` — cùng nếp lưới "không mã màu
 * cứng" của `vo-linear.test.tsx`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar, TEN_WORKSPACE } from '../src/vo/sidebar';
import { ChamSucSong } from '../src/vo/cham-suc-song';
import { TrangGiuCho } from '../src/trang/giu-cho';
import { CHON_COMMAND_MENU, commandMenuDangMo } from '../src/vo/command-menu';
import * as hop_dang_mo from '../src/vo/hop-dang-mo';
import {
  LOP_CAU_CHO,
  LOP_CAU_LOI,
  LOP_TIEU_DE_MUC,
  LOP_TIEU_DE_TRANG,
} from '../src/vo/lop-nut';
import { MayChuGia, TOI_CHU, datKhoGia, dung } from './giup';
import { doiAgent } from './than-agent';

const NGUON = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });

async function docNguon(): Promise<[string, string][]> {
  const ra: [string, string][] = [];
  for (const [duong, doc] of Object.entries(NGUON)) ra.push([duong, (await doc()) as string]);
  return ra;
}

async function docMot(duoi: string): Promise<string> {
  const f = (await docNguon()).find(([d]) => d.endsWith(duoi));
  if (f === undefined) throw new Error(`không thấy ${duoi}`);
  return f[1];
}

/** Bỏ ghi chú khối và dòng: ghi chú **nói về** class cũ để giải thích. */
function boGhiChu(ma: string): string {
  return ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

beforeEach(() => {
  datKhoGia();
});

describe('THIET-KE "Chữ" — một thang tiêu đề cho mọi trang', () => {
  it('lưới của chính ca dưới: đọc được nguồn thật', async () => {
    const ds = await docNguon();
    expect(ds.length).toBeGreaterThan(20);
    expect(ds.some(([d]) => d.endsWith('trang/tong-quan.tsx'))).toBe(true);
  });

  it('không còn `text-xl` / `text-lg` / `text-2xl` nào trong `packages/web/src`', async () => {
    const xau: string[] = [];
    for (const [duong, van] of await docNguon()) {
      const ma = boGhiChu(van);
      for (const m of ma.matchAll(/(?:^|[\s"'`:])(text-(?:lg|xl|[2-9]xl))(?=[\s"'`]|$)/gm)) {
        xau.push(`${duong}: ${m[1] ?? ''}`);
      }
    }
    expect(xau).toEqual([]);
  });

  it('MỌI `<h1` trong `src` dùng `LOP_TIEU_DE_TRANG`, và có ít nhất 12 chỗ dùng', async () => {
    const xau: string[] = [];
    let so = 0;
    for (const [duong, van] of await docNguon()) {
      for (const m of boGhiChu(van).matchAll(/<h1\b[^>]*>/g)) {
        so += 1;
        if (!m[0].includes('className={LOP_TIEU_DE_TRANG}')) xau.push(`${duong}: ${m[0]}`);
      }
    }
    expect(xau).toEqual([]);
    expect(so).toBeGreaterThanOrEqual(12);
  });

  it('hằng tiêu đề đúng thang: trang 16px đậm 600 chữ chính; mục 13px đậm 600', () => {
    expect(LOP_TIEU_DE_TRANG.split(' ').sort()).toEqual(['font-semibold', 'text-base', 'text-chu']);
    expect(LOP_TIEU_DE_MUC.split(' ').sort()).toEqual(['font-semibold', 'text-chu', 'text-sm']);
  });

  it('trên DOM: trang giữ chỗ vẽ `h1` với đúng lớp của hằng', () => {
    render(<TrangGiuCho ten="Thử" muc="SPEC mục 0" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Thử' }).getAttribute('class')).toBe(
      LOP_TIEU_DE_TRANG,
    );
  });
});

describe('THIET-KE "Trạng thái rỗng / lỗi / đang tải" — một kiểu', () => {
  it('câu chờ là chữ phụ 13px, câu lỗi dùng token `text-loi`', () => {
    expect(LOP_CAU_CHO).toBe('text-sm text-chu-mo');
    expect(LOP_CAU_LOI).toBe('text-sm text-loi');
  });

  it('mọi `role="status"` / `role="alert"` của câu tải/lỗi không còn tự khai `text-neutral-500`', async () => {
    const xau: string[] = [];
    for (const [duong, van] of await docNguon()) {
      for (const m of boGhiChu(van).matchAll(/role="(?:status|alert)"[^>]*className="[^"]*text-neutral-500[^"]*"/g)) {
        xau.push(`${duong}: ${m[0]}`);
      }
    }
    expect(xau).toEqual([]);
  });
});

describe('góp ý reviewer BAT-60', () => {
  it('(a) chỗ trống tab-pill `thanh-tren-loc` đã gỡ khỏi thanh trên', async () => {
    const ma = boGhiChu(await docMot('vo/thanh-tren.tsx'));
    expect(ma).not.toContain('thanh-tren-loc');
    expect(ma).not.toContain('CHON_O_LOC_THANH_TREN');
    // Chỗ nút hành động bên phải vẫn còn.
    expect(ma).toContain('data-o="thanh-tren-hanh-dong"');
  });

  it('(b) không còn vòng nhập `phim-vo.tsx` ↔ `command-menu.tsx`; câu "hộp đang mở" ở module lá', async () => {
    const phim = await docMot('vo/phim-vo.tsx');
    expect(phim).not.toMatch(/from '\.\/command-menu'/);
    expect(phim).toMatch(/from '\.\/hop-dang-mo'/);
    // Module lá: không nhập gì.
    const la = await docMot('vo/hop-dang-mo.ts');
    expect(la).not.toMatch(/^\s*import\s/m);
    // `command-menu.tsx` xuất lại CHÍNH hàm của module lá — mọi chỗ cũ vẫn dùng được.
    expect(commandMenuDangMo).toBe(hop_dang_mo.commandMenuDangMo);
    expect(CHON_COMMAND_MENU).toBe('[data-o="command-menu"]');
  });

  it('(b) hành vi giữ nguyên: `commandMenuDangMo` theo DOM', () => {
    expect(commandMenuDangMo()).toBe(false);
    const d = document.createElement('div');
    d.setAttribute('data-o', 'command-menu');
    document.body.appendChild(d);
    try {
      expect(commandMenuDangMo()).toBe(true);
    } finally {
      d.remove();
    }
  });

  it('(c) nút menu workspace có mũi tên xuống nhỏ, xám, ẩn với trình đọc màn hình', async () => {
    new MayChuGia()
      .dat('GET /v1/toi', { than: TOI_CHU })
      .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/can-chu', { than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null } } })
      .dat('GET /v1/man-hinh-agent', { than: doiAgent([]) })
      .gan();
    dung(<Sidebar />);
    const nut = await screen.findByRole('button', { name: TEN_WORKSPACE });
    const mui = nut.querySelector('svg[data-icon="chevron-xuong"]');
    expect(mui).not.toBeNull();
    expect(mui?.getAttribute('aria-hidden')).toBe('true');
    const boc = nut.querySelector('[data-o="chevron-workspace"]');
    expect((boc?.getAttribute('class') ?? '').split(/\s+/)).toContain('text-chu-mo-hon');
  });

  it('(d) chấm sức sống 🟡 dùng token `bg-canh`, nguồn không còn `amber`', async () => {
    expect(boGhiChu(await docMot('vo/cham-suc-song.tsx'))).not.toContain('amber');
    render(<ChamSucSong suc_song="vang" />);
    const cham = document.querySelector('[data-suc-song="vang"]');
    expect((cham?.getAttribute('class') ?? '').split(/\s+/)).toContain('bg-canh');
  });
});
