/**
 * **Command menu `Cmd/Ctrl+K`** — BAT-34. SPEC mục 14 d.414 ("mở command menu: tìm
 * mã, tiêu đề, T-số, chạy lệnh"), 19.12 câu 8 (phạm vi tìm — phía máy chủ, xem
 * `packages/api/test/tim.test.ts`), d.416 (bảng `?`), d.418 (lỗi nguyên văn).
 *
 * Dựng cả vỏ (`App`) như `phim-vo.test.tsx`: phím đi qua listener thật của vỏ.
 * Máy chủ giả: đường đã khai thì trả; đường chưa khai thì treo.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { App } from '../src/App';
import type { DuAnSidebar, KetQuaTim } from '../src/api';
import { onlineManager } from '@tanstack/react-query';
import {
  CAU_DANG_TIM,
  CAU_KHONG_CO_KET_QUA,
  CAU_MAT_MANG_TIM,
  DO_TRE_TIM_MS,
  LENH_DIEU_HUONG,
  NHAN_COMMAND_MENU,
  NHAN_NHOM_CAN_CHU,
  NHAN_NHOM_LENH,
  NHAN_NHOM_TICKET,
  locLenh,
} from '../src/vo/command-menu';
import { MUC_SIDEBAR } from '../src/vo/muc-sidebar';
import { NHAN_BANG_PHIM, PHIM_TAT } from '../src/vo/phim-vo';
import { NHAN_NUT_TIM } from '../src/vo/sidebar';
import { NHAN_HOP_TAO_VIEC } from '../src/vo/tao-viec';
import { NHAN_NUT_GIAO_VIEC } from '../src/vo/giao-viec';
import { NHAN_MO_MENU } from '../src/vo/thanh-tren';
import { TOI_CHU, dung } from './giup';
import { doiAgent } from './than-agent';
import { THAN_AGENT, manHinhTicket, ticketDayDu } from './than-ticket';
import { DA_XU_LY_RONG, manHinh, the as theCanChu } from './than-can-chu';

const DU_AN: DuAnSidebar[] = [{ id: 'id-SAI', ma: 'SAI', ten: 'Sample', trang_thai: 'active', nhom: null }];

interface Goi {
  method: string;
  duong: string;
}

function json(than: unknown, status = 200): Response {
  return new Response(JSON.stringify(than), { status, headers: { 'content-type': 'application/json' } });
}

type TraTim = KetQuaTim | { loi: { error: string; message: string }; http: number } | Promise<Response>;

/** Gắn `fetch` giả; `tim(q)` trả thân cho `GET /v1/tim?q=…`. */
function may(tim: (q: string) => TraTim = () => RONG, man_can_chu = manHinh()): Goi[] {
  const da_goi: Goi[] = [];
  const bang: Record<string, unknown> = {
    'GET /v1/toi': TOI_CHU,
    'GET /v1/du-an?limit=200': { items: DU_AN, cursor_sau: null },
    'GET /v1/can-chu': man_can_chu,
    'GET /v1/can-chu/da-xu-ly': DA_XU_LY_RONG,
    'GET /v1/man-hinh-agent': doiAgent([]),
    'GET /v1/agent': THAN_AGENT,
  };
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    da_goi.push({ method, duong });
    const k = `${method} ${duong}`;
    if (k in bang) return Promise.resolve(json(bang[k]));
    if (method === 'GET' && duong.startsWith('/v1/tim?q=')) {
      const q = decodeURIComponent(duong.slice('/v1/tim?q='.length));
      const tl = tim(q);
      if (tl instanceof Promise) return tl;
      if ('loi' in tl) return Promise.resolve(json(tl.loi, tl.http));
      return Promise.resolve(json(tl));
    }
    const ma = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
    if (method === 'GET' && ma !== undefined) {
      return Promise.resolve(json(manHinhTicket(ticketDayDu({ ma: decodeURIComponent(ma) }))));
    }
    return new Promise<Response>(() => undefined);
  }) as typeof globalThis.fetch;
  return da_goi;
}

const RONG: KetQuaTim = { ticket: [], can_chu: [] };

function ticketTim(ma: string, tieu_de = `Việc ${ma}`): KetQuaTim['ticket'][number] {
  return {
    id: `tk-${ma}`,
    ma,
    tieu_de,
    trang_thai: 'todo',
    nhan_trang_thai: 'Cần làm',
    ma_cu: null,
    project_id: 'id-SAI',
    ma_du_an: 'SAI',
  };
}

function mucTim(ma: string, tieu_de = `Hỏi ${ma}`): KetQuaTim['can_chu'][number] {
  return { id: `ct-${ma}`, ma, tieu_de, trang_thai: 'open', nhan_trang_thai: 'Chờ', project_id: null };
}

function DoDuong(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return (
    <>
      <output data-o="duong-hien-tai">{pathname}</output>
      <output data-o="tim-hien-tai">{search}</output>
    </>
  );
}

const duong = (): string | null => document.querySelector('[data-o="duong-hien-tai"]')?.textContent ?? null;
const timHienTai = (): string | null => document.querySelector('[data-o="tim-hien-tai"]')?.textContent ?? null;

async function vaoVo(duong_dau = '/khong-co'): Promise<void> {
  dung(
    <>
      <App />
      <DoDuong />
    </>,
    duong_dau,
  );
  await screen.findByRole('navigation', { name: 'Điều hướng chính' });
}

const menu = (): HTMLElement | null => screen.queryByRole('dialog', { name: NHAN_COMMAND_MENU });
const oTim = (): HTMLInputElement => menu()!.querySelector<HTMLInputElement>('[data-nhap="tim-nhanh"]')!;
const soGoiTim = (g: Goi[]): Goi[] => g.filter((x) => x.duong.startsWith('/v1/tim'));
const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function focusVeBody(): void {
  const dang = document.activeElement;
  if (dang instanceof HTMLElement) dang.blur();
}

function cmdK(dich: Element = document.body, them: Partial<KeyboardEventInit> & { keyCode?: number } = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true, ...them });
  if (them.keyCode !== undefined) Object.defineProperty(e, 'keyCode', { value: them.keyCode });
  act(() => {
    dich.dispatchEvent(e);
  });
  return e;
}

/** Mở menu, gõ, chờ hết độ trễ + kết quả về. */
async function moVaGo(chu: string): Promise<void> {
  cmdK();
  await waitFor(() => {
    expect(menu()).not.toBeNull();
  });
  await userEvent.type(oTim(), chu);
}

const muc = (): string[] => [...menu()!.querySelectorAll('[role="option"]')].map((e) => e.getAttribute('data-muc') ?? '');
const dangChon = (): string | null => menu()!.querySelector('[role="option"][aria-selected="true"]')?.getAttribute('data-muc') ?? null;

afterEach(() => {
  document.body.style.overflow = '';
  vi.useRealTimers();
});

/* ================================================================== */

describe('hàm thuần: lệnh điều hướng', () => {
  it('chỉ đúng các trang sidebar đang có (không lệnh ghi nào)', () => {
    expect(LENH_DIEU_HUONG.map((l) => l.duong)).toEqual(MUC_SIDEBAR.map((m) => m.duong));
    expect(LENH_DIEU_HUONG.map((l) => l.nhan)).toEqual([
      'Tổng quan',
      'Cần Chủ',
      'Tất cả việc',
      'Báo cáo',
      'Nhật ký quyết định',
      'Đội agent',
      'Cài đặt',
    ]);
  });

  it('lọc theo chuỗi con, không phân biệt hoa thường (cả chữ có dấu); rỗng ⇒ tất cả', () => {
    expect(locLenh('').length).toBe(LENH_DIEU_HUONG.length);
    expect(locLenh('NHẬT').map((l) => l.duong)).toEqual(['/nhat-ky']);
    expect(locLenh('việc').map((l) => l.duong)).toEqual(['/ticket']);
    expect(locLenh('zzz')).toEqual([]);
  });
});

describe('Cmd/Ctrl+K mở menu', () => {
  it('Cmd+K mở: dialog aria-modal có nhãn, focus ở ô tìm, preventDefault; Ctrl+K cũng mở', async () => {
    may();
    await vaoVo();
    const e = cmdK();
    expect(e.defaultPrevented).toBe(true);
    const m = menu();
    expect(m).not.toBeNull();
    expect(m?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(oTim());
    await userEvent.keyboard('{Escape}');
    expect(menu()).toBeNull();

    cmdK(document.body, { metaKey: false, ctrlKey: true });
    expect(menu()).not.toBeNull();
  });

  it('Cmd+K bằng userEvent (Meta giữ) và chữ hoa K cũng mở', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(menu()).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    cmdK(document.body, { key: 'K' });
    expect(menu()).not.toBeNull();
  });

  it('mở được cả khi đang gõ trong một ô nhập ngoài hộp (Cmd+K không phải ký tự gõ)', async () => {
    may();
    await vaoVo();
    const input = document.createElement('input');
    document.body.append(input);
    try {
      await userEvent.click(input);
      await userEvent.keyboard('ab');
      // `act` CÓ await: lần dựng này có thể chạm một thành phần đang treo (Suspense)
      // — `act` đồng bộ của `cmdK` sẽ cảnh báo "suspended inside an act scope".
      const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true });
      await act(async () => {
        input.dispatchEvent(e);
        await Promise.resolve();
      });
      expect(e.defaultPrevented).toBe(true);
      expect(menu()).not.toBeNull();
      expect(input.value).toBe('ab');
    } finally {
      input.remove();
    }
  });

  it('KHÔNG mở khi: soạn IME, có Alt hoặc Shift, phím đã bị chặn ở chỗ khác', async () => {
    may();
    await vaoVo();
    cmdK(document.body, { isComposing: true });
    cmdK(document.body, { keyCode: 229 });
    cmdK(document.body, { altKey: true });
    cmdK(document.body, { shiftKey: true });
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true });
    e.preventDefault();
    act(() => {
      document.body.dispatchEvent(e);
    });
    expect(menu()).toBeNull();
    // `k` trơn cũng không.
    await userEvent.keyboard('k');
    expect(menu()).toBeNull();
  });

  it('Cmd+K khi menu ĐANG mở ⇒ không làm gì (vẫn một hộp, vẫn mở, chữ đang gõ còn nguyên)', async () => {
    may();
    await vaoVo();
    await moVaGo('abc');
    const truoc = menu();
    const e = cmdK(oTim());
    expect(e.defaultPrevented).toBe(true);
    expect(menu()).toBe(truoc);
    expect(oTim().value).toBe('abc');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('KHÔNG mở khi một hộp khác đang mở', () => {
  it('hộp tạo việc', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('c');
    const h = await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
    const e = cmdK(h.querySelector('input') ?? h);
    expect(e.defaultPrevented).toBe(false);
    focusVeBody();
    cmdK();
    expect(menu()).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('bảng phím `?`', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('?');
    expect(screen.getByRole('dialog', { name: NHAN_BANG_PHIM })).toBeTruthy();
    cmdK();
    expect(menu()).toBeNull();
  });

  it('menu trượt 375px (aria-modal)', async () => {
    may();
    await vaoVo();
    await userEvent.click(screen.getByLabelText(NHAN_MO_MENU));
    cmdK();
    expect(menu()).toBeNull();
  });

  it('hộp Giao việc trên chi tiết ticket', async () => {
    may();
    await vaoVo('/t/SAI-1');
    await userEvent.click(await screen.findByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
    await waitFor(() => {
      expect(document.querySelector('[data-o="hop-giao-viec"]')).not.toBeNull();
    });
    cmdK();
    expect(menu()).toBeNull();
  });

  it('mọi hộp aria-modal khác (vd xác nhận đăng xuất)', async () => {
    may();
    await vaoVo();
    const h = document.createElement('div');
    h.setAttribute('role', 'dialog');
    h.setAttribute('aria-modal', 'true');
    document.body.append(h);
    try {
      cmdK();
      expect(menu()).toBeNull();
    } finally {
      h.remove();
    }
    // Đối chứng: tháo hộp kia thì mở được.
    cmdK();
    expect(menu()).not.toBeNull();
  });
});

describe('đóng: Esc, trả focus, Tab vòng', () => {
  it('Esc đóng và trả focus về phần tử trước đó; Esc lúc IME không đóng', async () => {
    may();
    await vaoVo();
    const nut = screen.getByLabelText(NHAN_MO_MENU);
    nut.focus();
    cmdK(nut);
    expect(menu()).not.toBeNull();
    fireEvent.keyDown(oTim(), { key: 'Escape', isComposing: true });
    expect(menu()).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(nut);
  });

  it('Esc từ body (focus rơi khỏi hộp) cũng đóng; Tab không thoát hộp', async () => {
    may();
    await vaoVo();
    cmdK();
    const m = menu()!;
    for (let i = 0; i < 3; i++) {
      await userEvent.tab();
      expect(m.contains(document.activeElement)).toBe(true);
    }
    focusVeBody();
    await userEvent.tab();
    expect(m.contains(document.activeElement)).toBe(true);
    focusVeBody();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(menu()).toBeNull();
  });

  it('bấm nền đóng', async () => {
    may();
    await vaoVo();
    cmdK();
    await userEvent.click(screen.getByLabelText('Đóng tìm nhanh (bấm ra ngoài)'));
    expect(menu()).toBeNull();
  });
});

describe('gõ có độ trễ — một lần gọi cho một chuỗi gõ liền tay', () => {
  it(`gõ nhanh nhiều ký tự ⇒ đúng MỘT lần GET /v1/tim (chuỗi cuối), sau ${String(DO_TRE_TIM_MS)} ms`, async () => {
    const g = may(() => ({ ticket: [ticketTim('SAI-12')], can_chu: [] }));
    await vaoVo();
    await moVaGo('SAI-12');
    // Chưa hết độ trễ: chưa gọi, đang hiện "Đang tìm…".
    expect(soGoiTim(g)).toHaveLength(0);
    expect(menu()!.textContent).toContain(CAU_DANG_TIM);
    await waitFor(() => {
      expect(muc()).toContain('ticket:tk-SAI-12');
    });
    await doi(DO_TRE_TIM_MS * 2);
    expect(soGoiTim(g).map((x) => x.duong)).toEqual(['/v1/tim?q=SAI-12']);
    expect(menu()!.textContent).not.toContain(CAU_DANG_TIM);
  });

  it('chuỗi chỉ khoảng trắng ⇒ không gọi; chỉ hiện lệnh', async () => {
    const g = may();
    await vaoVo();
    await moVaGo('   ');
    await doi(DO_TRE_TIM_MS * 2);
    expect(soGoiTim(g)).toHaveLength(0);
    expect(muc().every((m) => m.startsWith('lenh:'))).toBe(true);
    expect(muc()).toHaveLength(LENH_DIEU_HUONG.length);
  });
});

describe('chọn và mở', () => {
  it('↓/↑ đổi mục chọn (aria-activedescendant), Enter mở ticket ⇒ /t/<MÃ>, hộp đóng', async () => {
    may(() => ({ ticket: [ticketTim('SAI-12'), ticketTim('SAI-120')], can_chu: [mucTim('T-3')] }));
    await vaoVo();
    await moVaGo('SAI-12');
    await waitFor(() => {
      expect(muc()).toEqual(['ticket:tk-SAI-12', 'ticket:tk-SAI-120', 'can_chu:ct-T-3']);
    });
    expect(dangChon()).toBe('ticket:tk-SAI-12');
    const act_id = (): string | null => oTim().getAttribute('aria-activedescendant');
    expect(document.getElementById(act_id()!)?.getAttribute('data-muc')).toBe('ticket:tk-SAI-12');
    await userEvent.keyboard('{ArrowDown}');
    expect(dangChon()).toBe('ticket:tk-SAI-120');
    expect(document.getElementById(act_id()!)?.getAttribute('data-muc')).toBe('ticket:tk-SAI-120');
    await userEvent.keyboard('{ArrowUp}');
    expect(dangChon()).toBe('ticket:tk-SAI-12');
    await userEvent.keyboard('{ArrowUp}');
    // Vòng lên cuối danh sách.
    expect(dangChon()).toBe('can_chu:ct-T-3');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(dangChon()).toBe('ticket:tk-SAI-120');
    await userEvent.keyboard('{Enter}');
    expect(menu()).toBeNull();
    await waitFor(() => {
      expect(duong()).toBe('/t/SAI-120');
    });
  });

  it('có tiêu đề nhóm: Lệnh, Ticket, Cần Chủ', async () => {
    may(() => ({ ticket: [ticketTim('SAI-1', 'Báo cáo tuần')], can_chu: [mucTim('T-1', 'Báo cáo lỗi')] }));
    await vaoVo();
    await moVaGo('báo cáo');
    await waitFor(() => {
      expect(muc()).toEqual(['lenh:/bao-cao', 'ticket:tk-SAI-1', 'can_chu:ct-T-1']);
    });
    const m = menu()!;
    for (const [nhom, nhan] of [
      ['lenh', NHAN_NHOM_LENH],
      ['ticket', NHAN_NHOM_TICKET],
      ['can_chu', NHAN_NHOM_CAN_CHU],
    ] as const) {
      const g = m.querySelector<HTMLElement>(`[data-nhom="${nhom}"]`)!;
      expect(within(g).getByText(nhan)).toBeTruthy();
      expect(g.getAttribute('role')).toBe('group');
    }
  });

  it('bấm chuột vào một ticket cũng mở', async () => {
    may(() => ({ ticket: [ticketTim('SAI-7')], can_chu: [] }));
    await vaoVo();
    await moVaGo('SAI-7');
    const o = await waitFor(() => {
      const x = menu()!.querySelector<HTMLElement>('[data-muc="ticket:tk-SAI-7"]');
      expect(x).not.toBeNull();
      return x!;
    });
    await userEvent.click(o);
    expect(menu()).toBeNull();
    await waitFor(() => {
      expect(duong()).toBe('/t/SAI-7');
    });
  });

  it('chọn mục Cần Chủ ⇒ tới /can-chu?the=T-xx của đúng mục đó (#154, BAT-37)', async () => {
    may(() => ({ ticket: [], can_chu: [mucTim('T-9'), mucTim('T-91')] }));
    await vaoVo();
    await moVaGo('T-9');
    await waitFor(() => {
      expect(muc()).toEqual(['can_chu:ct-T-9', 'can_chu:ct-T-91']);
    });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(menu()).toBeNull();
    expect(duong()).toBe('/can-chu');
    expect(timHienTai()).toBe('?the=T-91');
  });

  it('chọn mục Cần Chủ ⇒ trang Cần Chủ thật chọn + focus + làm nổi đúng thẻ đó', async () => {
    may(
      () => ({ ticket: [], can_chu: [mucTim('T-9')] }),
      manHinh({ urgent: [theCanChu({ ma: 'T-8' }), theCanChu({ ma: 'T-9' })] }),
    );
    await vaoVo();
    await moVaGo('T-9');
    await waitFor(() => {
      expect(muc()).toEqual(['can_chu:ct-T-9']);
    });
    await userEvent.keyboard('{Enter}');
    const t9 = await waitFor(() => {
      const e = document.querySelector<HTMLElement>('[data-the="T-9"]');
      expect(e?.getAttribute('data-noi')).toBe('co');
      return e!;
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(t9);
    });
    expect(t9.getAttribute('data-dang-chon')).toBe('co');
    expect(document.querySelector('[data-the="T-8"]')?.getAttribute('data-noi')).toBeNull();
  });

  it('lệnh điều hướng: gõ "nhật" ⇒ lệnh Nhật ký đứng đầu, Enter ⇒ /nhat-ky', async () => {
    may();
    await vaoVo();
    await moVaGo('nhật');
    expect(muc()[0]).toBe('lenh:/nhat-ky');
    await userEvent.keyboard('{Enter}');
    expect(menu()).toBeNull();
    await vi.waitFor(() => {
      expect(duong()).toBe('/nhat-ky');
    });
  });
});

describe('trạng thái: không có kết quả, lỗi, kết quả muộn', () => {
  it('không khớp gì (cả lệnh) ⇒ "Không có kết quả"', async () => {
    may(() => RONG);
    await vaoVo();
    await moVaGo('zzzz');
    await waitFor(() => {
      expect(menu()!.querySelector('[data-o="khong-co-ket-qua"]')?.textContent).toBe(CAU_KHONG_CO_KET_QUA);
    });
    expect(muc()).toEqual([]);
  });

  it('lỗi máy chủ ⇒ câu NGUYÊN VĂN, không "Không có kết quả"', async () => {
    may(() => ({ loi: { error: 'INVALID_INPUT', message: 'Chuỗi tìm tối đa 200 ký tự.' }, http: 422 }));
    await vaoVo();
    await moVaGo('xyz');
    await waitFor(() => {
      expect(menu()!.querySelector('[data-loi="tim"]')?.textContent).toBe('Chuỗi tìm tối đa 200 ký tự.');
    });
    expect(menu()!.querySelector('[data-o="khong-co-ket-qua"]')).toBeNull();
  });

  it('kết quả về MUỘN của chuỗi cũ không đè kết quả chuỗi mới', async () => {
    let tha_cu = (): void => undefined;
    const cu = new Promise<Response>((r) => {
      tha_cu = () => {
        r(json({ ticket: [ticketTim('SAI-1', 'cũ')], can_chu: [] }));
      };
    });
    may((q) => (q === 'abc' ? cu : { ticket: [ticketTim('SAI-2', 'mới')], can_chu: [] }));
    await vaoVo();
    await moVaGo('abc');
    await doi(DO_TRE_TIM_MS + 50); // lượt gọi "abc" đã bay, đang treo
    await userEvent.type(oTim(), 'd');
    await waitFor(() => {
      expect(muc()).toEqual(['ticket:tk-SAI-2']);
    });
    act(() => {
      tha_cu();
    });
    await doi(50);
    expect(muc()).toEqual(['ticket:tk-SAI-2']);
  });
});

describe('Enter khi kết quả của chuỗi đang gõ CHƯA về', () => {
  it('gõ "SAI-12" rồi Enter NGAY (còn trong độ trễ) ⇒ tìm ngay (không chờ hết trễ), kết quả về ⇒ mở mục đầu', async () => {
    const g = may((q) => (q === 'SAI-12' ? { ticket: [ticketTim('SAI-12')], can_chu: [] } : RONG));
    await vaoVo();
    await moVaGo('SAI-12');
    expect(soGoiTim(g)).toHaveLength(0);
    await userEvent.keyboard('{Enter}');
    await doi(20);
    // Đã bỏ trễ: lượt gọi đi ngay, chưa tới DO_TRE_TIM_MS.
    expect(soGoiTim(g).map((x) => x.duong)).toEqual(['/v1/tim?q=SAI-12']);
    await waitFor(() => {
      expect(duong()).toBe('/t/SAI-12');
    });
    expect(menu()).toBeNull();
  });

  it('kết quả CŨ đang hiện không dùng cho Enter khi chuỗi đã đổi: chuỗi mới không có gì ⇒ không mở gì', async () => {
    may((q) => (q === 'abc' ? { ticket: [ticketTim('SAI-1')], can_chu: [] } : RONG));
    await vaoVo();
    await moVaGo('abc');
    await waitFor(() => {
      expect(muc()).toEqual(['ticket:tk-SAI-1']);
    });
    await userEvent.type(oTim(), 'd');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(menu()!.querySelector('[data-o="khong-co-ket-qua"]')).not.toBeNull();
    });
    await doi(DO_TRE_TIM_MS + 50);
    expect(menu()).not.toBeNull();
    expect(duong()).toBe('/khong-co');
  });

  it('kết quả CŨ không dùng: chuỗi mới có kết quả ⇒ mở mục của chuỗi MỚI', async () => {
    may((q) => ({ ticket: [ticketTim(q === 'abc' ? 'SAI-1' : 'SAI-2')], can_chu: [] }));
    await vaoVo();
    await moVaGo('abc');
    await waitFor(() => {
      expect(muc()).toEqual(['ticket:tk-SAI-1']);
    });
    await userEvent.type(oTim(), 'd');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(duong()).toBe('/t/SAI-2');
    });
  });

  it('Enter rồi gõ tiếp trước khi kết quả về ⇒ bỏ chờ: kết quả về sau không tự mở gì', async () => {
    let tha = (): void => undefined;
    const treo = new Promise<Response>((r) => {
      tha = () => {
        r(json({ ticket: [ticketTim('SAI-1')], can_chu: [] }));
      };
    });
    may((q) => (q === 'SAI-1' ? treo : { ticket: [ticketTim('SAI-12')], can_chu: [] }));
    await vaoVo();
    await moVaGo('SAI-1');
    await userEvent.keyboard('{Enter}');
    await userEvent.type(oTim(), '2');
    act(() => {
      tha();
    });
    await waitFor(() => {
      expect(muc()).toEqual(['ticket:tk-SAI-12']);
    });
    await doi(50);
    expect(menu()).not.toBeNull();
    expect(duong()).toBe('/khong-co');
  });
});

describe('mất mạng', () => {
  afterEach(() => {
    act(() => {
      onlineManager.setOnline(true);
    });
  });

  it('query tìm tạm dừng ⇒ "Mất mạng — sẽ tìm khi có mạng lại.", không "Đang tìm…" mãi, không "Không có kết quả"; có mạng ⇒ tìm', async () => {
    const g = may(() => ({ ticket: [ticketTim('SAI-3')], can_chu: [] }));
    await vaoVo();
    act(() => {
      onlineManager.setOnline(false);
    });
    await moVaGo('xyz');
    // Enter NGAY (còn trong độ trễ) lúc mất mạng: bỏ trễ ⇒ query tạm dừng ⇒ bỏ chờ —
    // không "hẹn" mở ngầm khi có mạng lại.
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(menu()!.querySelector('[data-o="mat-mang-tim"]')?.textContent).toBe(CAU_MAT_MANG_TIM);
    });
    expect(menu()!.textContent).not.toContain(CAU_DANG_TIM);
    expect(menu()!.querySelector('[data-o="khong-co-ket-qua"]')).toBeNull();
    expect(menu()!.querySelector('[data-o="mat-mang-tim"]')?.closest('[aria-live]')).not.toBeNull();
    await doi(DO_TRE_TIM_MS + 50);
    expect(menu()!.querySelector('[data-o="mat-mang-tim"]')).not.toBeNull();
    expect(soGoiTim(g)).toHaveLength(0);
    await userEvent.keyboard('{Enter}');
    act(() => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => {
      expect(muc()).toEqual(['ticket:tk-SAI-3']);
    });
    expect(menu()!.querySelector('[data-o="mat-mang-tim"]')).toBeNull();
    expect(menu()).not.toBeNull();
    expect(duong()).toBe('/khong-co');
  });
});

describe('phím trơn của phím tắt khác KHÔNG chạy khi menu mở', () => {
  it('C, G T, ? (trong ô và từ body) không làm gì; J/K/S không tới listener của trang', async () => {
    may();
    await vaoVo();
    cmdK();
    await userEvent.type(oTim(), 'cgt?');
    expect(oTim().value).toBe('cgt?');
    focusVeBody();
    const trang = vi.fn();
    window.addEventListener('keydown', trang);
    try {
      await userEvent.keyboard('cgt?jksplag');
      expect(trang).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', trang);
    }
    expect(duong()).toBe('/khong-co');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(menu()).not.toBeNull();
  });
});

describe('lối vào khác và bảng phím', () => {
  it('nút Tìm ở sidebar mở menu', async () => {
    may();
    await vaoVo();
    await userEvent.click(screen.getByLabelText(NHAN_NUT_TIM));
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(oTim());
  });

  it('nút Tìm trong menu trượt 375px: menu trượt đóng, command menu mở (không chồng hai hộp)', async () => {
    may();
    await vaoVo();
    await userEvent.click(screen.getByLabelText(NHAN_MO_MENU));
    const truot = screen.getByRole('dialog', { name: 'Menu điều hướng' });
    await userEvent.click(within(truot).getByLabelText(NHAN_NUT_TIM));
    expect(menu()).not.toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('bảng `?` có dòng Cmd/Ctrl+K', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('?');
    const b = screen.getByRole('dialog', { name: NHAN_BANG_PHIM });
    expect(b.querySelector('[data-phim="Cmd/Ctrl+K"]')).not.toBeNull();
    expect(PHIM_TAT.some((d) => d.phim.join(' ') === 'Cmd/Ctrl+K')).toBe(true);
  });
});
