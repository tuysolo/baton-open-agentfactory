/**
 * **Icon trạng thái ticket + chấm mức gấp** — hệ thiết kế 29/10 (`DESIGN.md`,
 * lượt UI-A). Không một mục SPEC: SPEC định nghĩa trạng thái (bảng 0.1) và mức
 * gấp (mục Cần Chủ), còn hình vẽ là trình bày. Ca ở đây canh ba điều mà phần B
 * sẽ dựa vào:
 *   1. đủ bảy trạng thái của bảng 0.1, mỗi cái đúng một màu token;
 *   2. **hình khác nhau** giữa năm nhóm (màu không là thông tin duy nhất);
 *   3. luật ARIA: không nhãn ⇒ `aria-hidden` (chữ trạng thái đứng cạnh là thứ
 *      được đọc); có nhãn ⇒ `role="img"` mang đúng nhãn máy chủ gửi.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { MucDoKhan, TrangThaiTicket } from '../src/api';
import { ChamMucGap, IconTrangThai } from '../src/vo/icon';
import { LOP_MUC_GAP, LOP_TRANG_THAI } from '../src/vo/mau-the';

const BAY: readonly TrangThaiTicket[] = [
  'backlog',
  'todo',
  'in_progress',
  'verifying',
  'done',
  'canceled',
  'duplicate',
];

function ve(t: TrangThaiTicket, nhan?: string): SVGElement {
  const { container } = render(
    nhan === undefined ? <IconTrangThai trang_thai={t} /> : <IconTrangThai trang_thai={t} nhan={nhan} />,
  );
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('không vẽ ra svg');
  return svg;
}

describe('IconTrangThai — bảy trạng thái, năm hình', () => {
  it('mỗi trạng thái: đúng thuộc tính `data-icon-trang-thai` và đúng lớp màu token', () => {
    for (const t of BAY) {
      const svg = ve(t);
      expect(svg.getAttribute('data-icon-trang-thai')).toBe(t);
      expect(svg.getAttribute('class')).toContain(LOP_TRANG_THAI[t]);
      expect(svg.getAttribute('width')).toBe('16');
    }
  });

  it('năm nhóm (Cần làm, Đang làm, Chờ kiểm chứng, Xong, Huỷ) có HÌNH khác nhau; backlog khác todo', () => {
    const hinh = (t: TrangThaiTicket): string => ve(t).innerHTML;
    const nam = ['todo', 'in_progress', 'verifying', 'done', 'canceled'] as const;
    expect(new Set(nam.map(hinh)).size).toBe(5);
    expect(hinh('backlog')).not.toBe(hinh('todo'));
    // `duplicate` đi chung hình với Huỷ — nhưng vẫn mang mã của chính nó.
    expect(hinh('duplicate')).toBe(hinh('canceled'));
  });

  it('không nhãn ⇒ `aria-hidden` (không đọc hai lần chữ trạng thái đứng cạnh)', () => {
    const svg = ve('in_progress');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('có nhãn ⇒ `role="img"` mang ĐÚNG nhãn truyền vào (nhãn tiếng Việt của máy chủ)', () => {
    const svg = ve('verifying', 'Chờ kiểm chứng');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Chờ kiểm chứng');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('ChamMucGap — ba mức gấp Cần Chủ', () => {
  const BA: readonly MucDoKhan[] = ['urgent', 'today', 'later'];

  it('mỗi mức: đúng lớp màu token; "để sau" là chấm RỖNG, hai mức gấp là chấm đầy', () => {
    for (const m of BA) {
      const { container } = render(<ChamMucGap muc={m} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('data-muc-gap')).toBe(m);
      expect(svg?.getAttribute('class')).toContain(LOP_MUC_GAP[m]);
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      const tron = svg?.querySelector('circle');
      expect(tron?.getAttribute('fill')).toBe(m === 'later' ? 'none' : 'currentColor');
    }
  });

  it('có nhãn ⇒ `role="img"` mang đúng nhãn', () => {
    const { container } = render(<ChamMucGap muc="urgent" nhan="Khẩn" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Khẩn');
  });
});
