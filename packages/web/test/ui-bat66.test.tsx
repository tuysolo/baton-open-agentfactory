/**
 * **UI BAT-66** — Tổng quan, Đội agent và trang một agent đưa về ngôn ngữ
 * `THIET-KE.md` như bốn màn BAT-60. Không ca nào ở đây kiểm hành vi SPEC mới:
 * hành vi không đổi, các ca hành vi vẫn ở `tong-quan.test.tsx` và
 * `doi-agent.test.tsx`. Ca ở đây ghim **quy tắc trình bày** đã ghi vào
 * `THIET-KE.md`:
 *
 *   1. `ChamTrangThaiAgent` — năm trạng thái agent của bảng 0.1, năm **hình**
 *      khác nhau, màu token, luật ARIA của `IconTrangThai`;
 *   2. chấm có mặt **trước tên** agent ở ba chỗ, và **chữ** trạng thái vẫn còn;
 *   3. icon Xong ở dòng Vừa xong; chip cảnh báo không tô nền; Dự án được vào là
 *      chip; một dáng đầu khối.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrangThaiAgent } from '../src/api';
import { TEN_KHOI, TrangTongQuan } from '../src/trang/tong-quan';
import { TEN_KHOI_AGENT, TrangAgent, TrangDoiAgent } from '../src/trang/doi-agent';
import { ChamTrangThaiAgent } from '../src/vo/icon';
import { LOP_TRANG_THAI_AGENT } from '../src/vo/mau-the';
import {
  LOP_CHIP,
  LOP_CHIP_CANH,
  LOP_CHIP_LOI,
  LOP_DAU_KHOI,
  LOP_THE,
  LOP_NHAN_SO_LIEU,
  LOP_TIEU_DE_MUC,
} from '../src/vo/lop-nut';
import { MayChuGia, datKhoGia, dung } from './giup';
import {
  GIO,
  PHUT,
  TONG_QUAN_RONG,
  dongCanChuY,
  hangDuAn,
  nhomCanChuY,
  theAgent,
  ticketTroTa,
} from './than-tong-quan';
import { agentDong, doiAgent, manHinhAgent, phienDong } from './than-agent';

const NAM: readonly TrangThaiAgent[] = ['busy', 'waiting_owner', 'stalled', 'idle', 'disabled'];

const NGUON = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });

async function docMot(duoi: string): Promise<string> {
  for (const [duong, doc] of Object.entries(NGUON)) {
    if (duong.endsWith(duoi)) return (await doc()) as string;
  }
  throw new Error(`không thấy ${duoi}`);
}

/** Bỏ ghi chú khối và dòng: ghi chú **nói về** class cũ để giải thích. */
function boGhiChu(ma: string): string {
  return ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function lop(e: Element | null | undefined): string[] {
  return (e?.getAttribute('class') ?? '').split(/\s+/).filter((x) => x !== '');
}

/** `a` đứng TRƯỚC `b` trong DOM. */
function truoc(a: Element | null | undefined, b: Element | null | undefined): boolean {
  if (a == null || b == null) return false;
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

beforeEach(() => {
  datKhoGia();
});

/* ================================================================== *
 * 1. ChamTrangThaiAgent
 * ================================================================== */

describe('ChamTrangThaiAgent — năm trạng thái agent, năm hình', () => {
  function ve(t: TrangThaiAgent, nhan?: string): SVGElement {
    const { container } = render(
      nhan === undefined ? <ChamTrangThaiAgent trang_thai={t} /> : <ChamTrangThaiAgent trang_thai={t} nhan={nhan} />,
    );
    const svg = container.querySelector('svg');
    if (svg === null) throw new Error('không vẽ ra svg');
    return svg;
  }

  it('mỗi trạng thái: đúng `data-cham-agent` và đúng lớp màu token của `LOP_TRANG_THAI_AGENT`', () => {
    expect(Object.keys(LOP_TRANG_THAI_AGENT).sort()).toEqual([...NAM].sort());
    for (const t of NAM) {
      const svg = ve(t);
      expect(svg.getAttribute('data-cham-agent')).toBe(t);
      expect(lop(svg)).toContain(LOP_TRANG_THAI_AGENT[t]);
      // Không mang `data-trang-thai`: các ca đọc chữ trạng thái chọn theo thuộc tính đó.
      expect(svg.hasAttribute('data-trang-thai')).toBe(false);
    }
  });

  it('màu chỉ là token (không mã màu Tailwind cứng)', () => {
    for (const m of Object.values(LOP_TRANG_THAI_AGENT)) {
      expect(m).toMatch(/^text-(?:tot|canh|loi|chu-mo|tt-huy)$/);
    }
  });

  it('năm HÌNH khác nhau — màu không là thông tin duy nhất', () => {
    const hinh = NAM.map((t) => ve(t).innerHTML);
    expect(new Set(hinh).size).toBe(5);
    // Rảnh là vòng RỖNG; Đang làm là chấm ĐẦY.
    expect(ve('idle').querySelector('circle')?.getAttribute('fill')).toBe('none');
    expect(ve('busy').querySelector('circle')?.getAttribute('fill')).toBe('currentColor');
    // Đã tắt có gạch chéo; Đứng không tròn.
    expect(ve('disabled').querySelector('path')).not.toBeNull();
    expect(ve('stalled').querySelector('circle')).toBeNull();
  });

  it('không nhãn ⇒ `aria-hidden`; có nhãn ⇒ `role="img"` mang đúng nhãn', () => {
    const an = ve('busy');
    expect(an.getAttribute('aria-hidden')).toBe('true');
    expect(an.getAttribute('role')).toBeNull();

    const co = ve('stalled', 'Đứng');
    expect(co.getAttribute('role')).toBe('img');
    expect(co.getAttribute('aria-label')).toBe('Đứng');
    expect(co.getAttribute('aria-hidden')).toBeNull();
  });
});

/* ================================================================== *
 * 2. Tổng quan
 * ================================================================== */

function mayTongQuan(than: typeof TONG_QUAN_RONG): MayChuGia {
  return new MayChuGia().dat('GET /v1/tong-quan', { than }).gan();
}

describe('Tổng quan — chấm agent, icon Xong, chip cảnh báo, dòng Dự án, đầu khối', () => {
  const ticket = ticketTroTa('SAI-1');

  const than = {
    ...TONG_QUAN_RONG,
    du_an: [hangDuAn({ ma: 'SAI', so_dang_lam: 2, so_xong: 1, so_tong: 3 })],
    agent: [
      theAgent({ id: 'ag-1', ten: 'W-builder', trang_thai: 'busy', nhan_trang_thai: 'Đang làm' }),
      theAgent({ id: 'ag-2', ten: 'M-Baton', trang_thai: 'stalled', nhan_trang_thai: 'Đứng' }),
    ],
    vua_xong_24h: [{ ticket: ticketTroTa('SAI-9'), xong_luc: GIO - PHUT, bang_chung: [] }],
    can_chu_y: [
      nhomCanChuY(
        [dongCanChuY({ loai: 'ticket_khong_ai_cam', nhan_loai: 'Không ai cầm', ticket })],
        ticket,
      ),
    ],
  };

  it('dòng "Agent đang làm gì": chấm `aria-hidden` TRƯỚC tên, chữ trạng thái vẫn còn', async () => {
    mayTongQuan(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    for (const [id, t, ten, nhan] of [
      ['ag-1', 'busy', 'W-builder', 'Đang làm'],
      ['ag-2', 'stalled', 'M-Baton', 'Đứng'],
    ] as const) {
      const dong = khoi.querySelector(`[data-agent="${id}"]`);
      const cham = dong?.querySelector(`svg[data-cham-agent="${t}"]`);
      expect(cham, id).not.toBeNull();
      expect(cham?.getAttribute('aria-hidden')).toBe('true');
      const o_ten = [...(dong?.querySelectorAll('span') ?? [])].find((s) => s.textContent === ten);
      expect(truoc(cham, o_ten), id).toBe(true);
      // Tên ở cột bề rộng cố định từ `sm`, cắt `…`, `title` giữ tên đầy đủ.
      expect(lop(o_ten)).toEqual(expect.arrayContaining(['truncate', 'sm:w-32']));
      expect(o_ten?.getAttribute('title')).toBe(ten);
      expect(dong?.querySelector('[data-trang-thai]')?.textContent).toBe(nhan);
    }
  });

  it('d.411 — dòng agent không tràn 375px: `flex-wrap`, bề rộng cố định CHỈ dưới tiền tố `sm:`, chữ trạng thái không cắt', async () => {
    /*
     * jsdom không có layout, nên 375px chỉ canh được bằng **lớp** (giới hạn
     * `cau-hoi-spec.md` #109). Lỗi reviewer bắt ở BAT-66: tên `w-32 shrink-0` +
     * trạng thái `w-16 shrink-0` trên một dòng không `flex-wrap` để lại ~13px cho
     * việc đang cầm và đẩy mốc tràn ngang.
     */
    mayTongQuan(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    const dong = [...khoi.querySelectorAll('li[data-agent]')];
    expect(dong.length).toBe(2);
    for (const d of dong) {
      expect(lop(d)).toContain('flex-wrap');
      // Không phần tử con nào có bề rộng cố định KHÔNG tiền tố (`w-32`, `min-w-16`…);
      // `min-w-0` (cho phép co) thì được.
      for (const con of [...d.children]) {
        const co_dinh = lop(con).filter((c) => /^(?:w|min-w)-(?!0$)/.test(c));
        expect(co_dinh, con.outerHTML).toEqual([]);
      }
      // Tên phải CO được ở khổ hẹp: `shrink-0` chỉ từ `sm`.
      const ten = d.querySelector('span[title]');
      expect(lop(ten)).not.toContain('shrink-0');
      expect(lop(ten)).toEqual(expect.arrayContaining(['min-w-0', 'sm:w-32', 'sm:shrink-0']));
      const tt = d.querySelector('[data-trang-thai]');
      expect(lop(tt)).not.toContain('truncate');
      expect(lop(tt)).toContain('sm:min-w-16');
      // Việc đang cầm có cơ sở bề rộng ⇒ xuống hàng thay vì bị ép về 0.
      expect(lop(d.querySelector('[data-ds="dang-cam"]'))).toContain('basis-40');
    }
  });

  it('dòng Vừa xong: icon Xong (`aria-hidden`, không nhãn) đứng trước mã ticket', async () => {
    mayTongQuan(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });
    const dong = khoi.querySelector('[data-vua-xong="SAI-9"]');
    const icon = dong?.querySelector('svg[data-icon-trang-thai="done"]');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('role')).toBeNull();
    expect(truoc(icon, dong?.querySelector('a[href="/t/SAI-9"]'))).toBe(true);
  });

  it('Cần chú ý: nhãn lý do là chip cảnh báo — viền mờ, chữ `canh`, KHÔNG tô nền', async () => {
    mayTongQuan(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.can_chu_y });
    const nhan = khoi.querySelector('[data-ly-do="ticket_khong_ai_cam"]');
    expect(nhan?.textContent).toBe('Không ai cầm');
    expect(nhan?.getAttribute('class')).toBe(LOP_CHIP_CANH);
    expect(lop(nhan)).not.toContain('bg-canh-nen');
    expect(lop(nhan).filter((c) => c.startsWith('bg-'))).toEqual([]);
    expect(lop(nhan)).toEqual(expect.arrayContaining(['border', 'border-vien', 'rounded', 'text-xs', 'text-canh']));
  });

  it('Dự án (SPEC 20.4): mỗi dự án là một THẺ lớp nổi `LOP_THE`; ưu tiên là chữ phụ', async () => {
    // BAT-66 ghim dòng `LOP_DONG_XEP_DOC`; SPEC 20.2 (04/11) thay khối bằng bản đồ + thẻ.
    mayTongQuan(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    const the = khoi.querySelector('article[data-du-an="SAI"]');
    expect(lop(the)).toEqual(expect.arrayContaining(LOP_THE.split(' ')));
    expect(lop(the?.querySelector('[data-o="uu-tien"]'))).toEqual(
      expect.arrayContaining(['text-xs', 'text-chu-mo']),
    );
  });

  it('năm khối cùng một dáng đầu khối: `header` `LOP_DAU_KHOI` chứa `h2` `LOP_TIEU_DE_MUC`', async () => {
    mayTongQuan(than);
    dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });
    const khoi = [...document.querySelectorAll('section[data-khoi]')];
    expect(khoi.length).toBe(5);
    for (const k of khoi) {
      const dau = k.firstElementChild;
      expect(dau?.tagName).toBe('HEADER');
      expect(dau?.getAttribute('class')).toBe(LOP_DAU_KHOI);
      expect(dau?.querySelector('h2')?.getAttribute('class')).toBe(LOP_TIEU_DE_MUC);
    }
  });

  it('ô Cần Chủ vẫn dùng nhãn ô số liệu (không đổi)', async () => {
    mayTongQuan(than);
    dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });
    const o = document.querySelector('[data-ds="so-theo-muc"] [data-muc="urgent"]');
    expect(o?.children[1]?.getAttribute('class')).toContain(LOP_NHAN_SO_LIEU);
  });
});

/* ================================================================== *
 * 3. Đội agent + trang một agent
 * ================================================================== */

const D_AGENT = '/v1/man-hinh-agent';

describe('Đội agent — dòng có chấm trước tên', () => {
  it('mỗi dòng: chấm `aria-hidden` TRƯỚC link tên; chip trạng thái vẫn mang đúng chữ; vai trò chữ phụ', async () => {
    new MayChuGia()
      .dat(`GET ${D_AGENT}`, {
        than: doiAgent(
          NAM.map((t, i) =>
            agentDong({ id: `ag-${String(i)}`, ten: `Agent số ${String(i)}`, trang_thai: t, nhan_trang_thai: `Nhãn ${String(i)}` }),
          ),
        ),
      })
      .gan();
    dung(<TrangDoiAgent />, '/doi-agent');
    await screen.findByText('Agent số 0');

    for (const [i, t] of NAM.entries()) {
      const dong = document.querySelector(`[data-agent="ag-${String(i)}"]`);
      const cham = dong?.querySelector(`svg[data-cham-agent="${t}"]`);
      expect(cham, t).not.toBeNull();
      expect(cham?.getAttribute('aria-hidden')).toBe('true');
      const ten = dong?.querySelector('a');
      expect(truoc(cham, ten), t).toBe(true);
      expect(lop(ten)).toEqual(expect.arrayContaining(['truncate', 'shrink-0']));
      expect(dong?.querySelector('[data-trang-thai]')?.textContent).toBe(`Nhãn ${String(i)}`);
      expect(dong?.querySelector('[data-o="vai-tro"]')?.getAttribute('class')).toBe('text-xs text-chu-mo');
    }
  });
});

describe('Trang một agent — hàng chip, Dự án được vào, chip "Đứng"', () => {
  function may(p: Parameters<typeof manHinhAgent>[0]): void {
    new MayChuGia().dat(`GET ${D_AGENT}/${p.agent.id}`, { than: manHinhAgent(p) }).gan();
  }

  it('chip trạng thái có chấm (aria-hidden) trước chữ; chữ trạng thái giữ nguyên; vai trò cũng là chip', async () => {
    may({ agent: agentDong({ id: 'ag-1', ten: 'W-builder', trang_thai: 'waiting_owner', nhan_trang_thai: 'Chờ Chủ' }) });
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    await screen.findByRole('heading', { name: 'W-builder' });

    const chip = document.querySelector('[data-o="trang-agent"] [data-trang-thai]');
    expect(chip?.getAttribute('class')).toBe(LOP_CHIP);
    expect(chip?.textContent).toBe('Chờ Chủ');
    const cham = chip?.querySelector('svg[data-cham-agent="waiting_owner"]');
    expect(cham?.getAttribute('aria-hidden')).toBe('true');
    expect(chip?.firstElementChild).toBe(cham);

    expect(document.querySelector('[data-o="vai-tro"]')?.getAttribute('class')).toBe(LOP_CHIP);
  });

  it('"Đã tắt" cùng dáng chip, chữ lỗi, không tô nền', async () => {
    may({ agent: agentDong({ id: 'ag-1', disabled: true, trang_thai: 'disabled', nhan_trang_thai: 'Đã tắt' }) });
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    const o = await screen.findByText('Đã tắt', { selector: '[data-o="disabled"]' });
    expect(o.getAttribute('class')).toBe(LOP_CHIP_LOI);
    expect(lop(o).filter((c) => c.startsWith('bg-'))).toEqual([]);
  });

  it('"Dự án được vào": mỗi dự án là một `LOP_CHIP`, nhãn "quản lý" vẫn còn', async () => {
    may({
      agent: agentDong({ id: 'ag-1' }),
      du_an: [
        { id: 'pj-1', ma: 'SAI', ten: 'Sample', quan_ly: true },
        { id: 'pj-2', ma: 'INC', ten: 'Inc', quan_ly: false },
      ],
    });
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    const khoi = await screen.findByRole('region', { name: TEN_KHOI_AGENT.du_an });
    const li = [...khoi.querySelectorAll('[data-du-an]')];
    expect(li.map((e) => e.getAttribute('class'))).toEqual([LOP_CHIP, LOP_CHIP]);
    expect(li[0]?.querySelector('[data-o="quan-ly"]')?.textContent).toBe('quản lý');
    expect(li[1]?.querySelector('[data-o="quan-ly"]')).toBeNull();
  });

  it('phiên đứng: nhãn "Đứng" là chip cảnh báo (cùng kiểu Cần chú ý)', async () => {
    may({
      agent: agentDong({ id: 'ag-1' }),
      phien_dang_mo: [phienDong({ id: 'ph-1', trang_thai: 'stalled', nhan_trang_thai: 'Đứng', dung: true })],
    });
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    const khoi = await screen.findByRole('region', { name: TEN_KHOI_AGENT.phien });
    expect(khoi.querySelector('[data-o="dung"]')?.getAttribute('class')).toBe(LOP_CHIP_CANH);
  });

  it('bốn khối cùng một dáng đầu khối với Tổng quan', async () => {
    may({ agent: agentDong({ id: 'ag-1' }) });
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    await screen.findByRole('region', { name: TEN_KHOI_AGENT.quyen });
    const khoi = [...document.querySelectorAll('section[data-khoi]')];
    expect(khoi.length).toBe(4);
    for (const k of khoi) {
      expect(k.firstElementChild?.getAttribute('class')).toBe(LOP_DAU_KHOI);
      expect(k.querySelector('h2')?.getAttribute('class')).toBe(LOP_TIEU_DE_MUC);
    }
  });
});

/* ================================================================== *
 * 4. Nguồn: không tô nền chip, không `outline-none`, tiêu đề mục/hộp
 * ================================================================== */

describe('nguồn của các màn BAT-66', () => {
  it('Tổng quan và Đội agent: không `bg-canh-nen`/`bg-loi-nen`, không `outline-none`, không `Khoi` tự viết', async () => {
    for (const f of ['trang/tong-quan.tsx', 'trang/doi-agent.tsx']) {
      const ma = boGhiChu(await docMot(f));
      expect(ma, f).not.toMatch(/bg-(?:canh|loi)-nen/);
      expect(ma, f).not.toContain('outline-none');
      expect(ma, f).not.toMatch(/function Khoi\b/);
      expect(ma, f).toMatch(/from '\.\.\/vo\/khoi'/);
    }
  });

  it('`vo/khoi.tsx` là module lá (chỉ nhập `lop-nut`) — không vòng nhập giữa hai trang', async () => {
    const ma = await docMot('vo/khoi.tsx');
    const nhap = [...ma.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(nhap).toEqual(['./lop-nut']);
  });

  it('đầu nhóm ngày của Nhật ký và tiêu đề hộp Tạo việc ở bậc `LOP_TIEU_DE_MUC`', async () => {
    const nhat_ky = boGhiChu(await docMot('trang/nhat-ky.tsx'));
    expect(nhat_ky).not.toContain('text-sm font-semibold text-chu');
    expect(nhat_ky).toMatch(/<h2 className=\{`flex items-center gap-2 \$\{LOP_TIEU_DE_MUC\}`\}>/);
    const tao = boGhiChu(await docMot('vo/tao-viec.tsx'));
    expect(tao).not.toContain('text-base font-semibold');
    expect(tao).toMatch(/<h2 className=\{`mb-3 \$\{LOP_TIEU_DE_MUC\}`\}>/);
  });
});
