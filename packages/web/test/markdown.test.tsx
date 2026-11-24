/**
 * **Bối cảnh markdown của thẻ Cần Chủ** — SPEC mục 8 d.240 ("markdown, có link
 * `file://` và link ticket").
 *
 * Hai thứ file này canh, và chỉ hai:
 *   1. **Không có đường nào từ chữ của agent tới mã chạy trong trang.** Ca phủ
 *      định dựng đúng chuỗi xấu (`javascript:`, `//evil.com`) và đo rằng **không
 *      có `<a href>`** nào ra, chứ không chỉ đo "có chữ trên màn hình".
 *   2. Bộ con cú pháp đang cài **đúng như khai** — một ca cho mỗi hình.
 */

import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import {
  Markdown,
  SCHEME_CHO_PHEP,
  hinhCuaDiaChi,
  phanTichDong,
  phanTichMarkdown,
} from '../src/markdown';

function ve(van: string): void {
  render(
    <MemoryRouter>
      <Markdown van={van} />
    </MemoryRouter>,
  );
}

describe('scheme — fail-closed, chỉ danh sách cho phép', () => {
  it('danh sách cho phép đúng bốn scheme, và `file:` có trong đó (d.240 ĐÒI nó)', () => {
    expect([...SCHEME_CHO_PHEP]).toEqual(['https:', 'http:', 'file:', 'mailto:']);
  });

  it('`javascript:` KHÔNG thành link, nhưng chữ vẫn hiện', () => {
    expect(hinhCuaDiaChi('javascript:alert(1)')).toEqual({ hinh: 'khong' });
    ve('[Bấm đi](javascript:alert(1))');
    expect(document.querySelector('a')).toBeNull();
    expect(document.querySelector('[data-lien="khong-an-toan"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Bấm đi');
  });

  it('`data:` cũng không, và một chuỗi không đọc được thành URL cũng không', () => {
    expect(hinhCuaDiaChi('data:text/html,<script>')).toEqual({ hinh: 'khong' });
    expect(hinhCuaDiaChi('cái gì đó')).toEqual({ hinh: 'khong' });
    expect(hinhCuaDiaChi('')).toEqual({ hinh: 'khong' });
  });

  it('`file://` thành link thật — đúng vế d.240', () => {
    ve('[hồ sơ](file:///Users/chu/ghi-chu.md)');
    const a = document.querySelector('a[data-lien="ngoai"]');
    expect(a?.getAttribute('href')).toBe('file:///Users/chu/ghi-chu.md');
  });

  it('`https://` thành link thật (ca đối chứng của hai ca chặn trên)', () => {
    ve('[tài liệu](https://example.com/a)');
    expect(document.querySelector('a[data-lien="ngoai"]')?.getAttribute('href')).toBe(
      'https://example.com/a',
    );
  });

  it('link ticket `/t/BAT-12` là đường TRONG ứng dụng (d.240 "link ticket")', () => {
    expect(hinhCuaDiaChi('/t/BAT-12')).toEqual({ hinh: 'trong', duong: '/t/BAT-12' });
    ve('[BAT-12](/t/BAT-12)');
    expect(document.querySelector('a[data-lien="trong"]')?.getAttribute('href')).toBe(
      '/t/BAT-12',
    );
  });

  it('`//evil.com` KHÔNG được coi là đường nội bộ (URL giao thức-tương-đối)', () => {
    // Ca phủ định thật: `startsWith('/')` một mình sẽ cho chuỗi này thành một
    // link ra ngoài đội lốt đường nội bộ.
    expect(hinhCuaDiaChi('//evil.com/x')).toEqual({ hinh: 'khong' });
  });
});

describe('bộ con cú pháp — đúng như đã khai ở đầu `markdown.tsx`', () => {
  it('đậm, nghiêng, mã trong dòng', () => {
    expect(phanTichDong('a **b** c *d* e `f`')).toEqual([
      { loai: 'chu', van: 'a ' },
      { loai: 'dam', van: 'b' },
      { loai: 'chu', van: ' c ' },
      { loai: 'nghieng', van: 'd' },
      { loai: 'chu', van: ' e ' },
      { loai: 'ma', van: 'f' },
    ]);
  });

  it('`**` thắng `*` (nếu không, `**a**` cắt thành hai dấu sao rỗng)', () => {
    expect(phanTichDong('**a**')).toEqual([{ loai: 'dam', van: 'a' }]);
  });

  it('đoạn, danh sách, khối code tách đúng ba khối', () => {
    const k = phanTichMarkdown('Mở đầu\n\n- một\n- hai\n\n```\nnpm test\n```');
    expect(k.map((x) => x.loai)).toEqual(['doan', 'danh_sach', 'code']);
    expect(k[2]).toEqual({ loai: 'code', van: 'npm test' });
  });

  it('khối code KHÔNG đóng vẫn giữ trọn phần còn lại (không mất chữ)', () => {
    const k = phanTichMarkdown('```\nmột\nhai');
    expect(k).toEqual([{ loai: 'code', van: 'một\nhai' }]);
  });

  it('vẽ ra đúng thẻ HTML: `<pre>`, `<ul>`, `<strong>` — và KHÔNG innerHTML', () => {
    ve('Mở **đậm**\n\n- một\n\n```\nnpm test\n```');
    expect(document.querySelector('[data-khoi-md="code"]')?.textContent).toBe('npm test');
    expect(document.querySelectorAll('[data-khoi-md="danh-sach"] li').length).toBe(1);
    expect(document.querySelector('strong')?.textContent).toBe('đậm');
    // Một `<script>` trong bối cảnh phải ra **chữ**, không thành phần tử.
    ve('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
  });
});
