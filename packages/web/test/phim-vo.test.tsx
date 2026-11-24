/**
 * **Phím toàn cục của vỏ** — BAT-23. SPEC mục 14 d.413 (`G` rồi `T`/`O`/`N`) và
 * d.416 (`?` hiện bảng phím). Listener ở `src/vo/phim-vo.tsx`.
 *
 * Máy chủ giả ở đây: đường đã khai thì trả thân; đường chưa khai thì **treo**
 * (promise không bao giờ xong) — trang đích của một lượt điều hướng chỉ ở trạng
 * thái "đang tải", ca đo **đường** chứ không đo trang.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { App } from '../src/App';
import { MUC_CHINH } from '../src/vo/muc-sidebar';
import {
  DICH_CHUOI_G,
  GHI_CHU_TICKET_DANG_CHON,
  NHAN_BANG_PHIM,
  NHAN_DONG_BANG_PHIM,
  PHIM_TAT,
  THOI_HAN_CHUOI_G_MS,
} from '../src/vo/phim-vo';
import { NHAN_HOP_TAO_VIEC } from '../src/vo/tao-viec';
import { NHAN_MO_MENU } from '../src/vo/thanh-tren';
import type { DuAnSidebar } from '../src/api';
import { TOI_CHU, dung } from './giup';
import { doiAgent } from './than-agent';
import { dong, manHinhDanhSach, manHinhTicket, ticketDayDu, THAN_AGENT } from './than-ticket';
import { DA_XU_LY_RONG, manHinh, the } from './than-can-chu';
import { specChuoiG, specDoiBangPhim } from './doc-spec';

const DU_AN: DuAnSidebar[] = [
  { id: 'id-SPX', ma: 'SPX', ten: 'Sample', trang_thai: 'active', nhom: null },
];

interface Goi {
  method: string;
  duong: string;
}

function json(than: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(than), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

/** Gắn `fetch` giả. Trả danh sách lượt gọi. */
function may(them: Record<string, unknown> = {}, danh_sach = false): Goi[] {
  const da_goi: Goi[] = [];
  const bang: Record<string, unknown> = {
    'GET /v1/toi': TOI_CHU,
    'GET /v1/du-an?limit=200': { items: DU_AN, cursor_sau: null },
    'GET /v1/can-chu': manHinh(),
    'GET /v1/can-chu/da-xu-ly': DA_XU_LY_RONG,
    'GET /v1/man-hinh-agent': doiAgent([]),
    'GET /v1/agent': THAN_AGENT,
    ...them,
  };
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    da_goi.push({ method, duong });
    const k = `${method} ${duong}`;
    if (k in bang) return json(bang[k]);
    if (danh_sach && method === 'GET') {
      const ma = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
      if (ma !== undefined) return json(manHinhTicket(ticketDayDu({ ma: decodeURIComponent(ma) })));
      if (duong.startsWith('/v1/man-hinh-ticket')) {
        return json(manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })]));
      }
    }
    return new Promise<Response>(() => undefined);
  }) as typeof globalThis.fetch;
  return da_goi;
}

function DoDuong(): React.JSX.Element {
  const { pathname } = useLocation();
  return <output data-o="duong-hien-tai">{pathname}</output>;
}

function duong(): string | null {
  return document.querySelector('[data-o="duong-hien-tai"]')?.textContent ?? null;
}

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

function bang(): HTMLElement | null {
  return screen.queryByRole('dialog', { name: NHAN_BANG_PHIM });
}

function focusVeBody(): void {
  const dang = document.activeElement;
  if (dang instanceof HTMLElement) dang.blur();
  expect(document.activeElement).toBe(document.body);
}

function phim(dich: Element, key: string, them: Partial<KeyboardEventInit> & { keyCode?: number } = {}): void {
  fireEvent.keyDown(dich, { key, ...them });
}

afterEach(() => {
  vi.useRealTimers();
  document.body.style.overflow = '';
});

/* ================================================================== */

describe('SPEC vẫn đòi đúng các câu mà phím vỏ dựa vào', () => {
  it('d.413 — G rồi T/O/N tới Cần Chủ / Tổng quan / Nhật ký', () => {
    expect(specChuoiG()).toEqual({ T: 'Cần Chủ', O: 'Tổng quan', N: 'Nhật ký' });
  });

  it('d.416 — "`?` hiện bảng phím"', () => {
    expect(specDoiBangPhim()).toBe(true);
  });

  it('DICH_CHUOI_G trỏ đúng đường của mục sidebar mang tên SPEC', () => {
    const spec = specChuoiG();
    for (const [k, ten] of Object.entries(spec)) {
      const muc = MUC_CHINH.find((m) => m.nhan.startsWith(ten));
      expect(muc, ten).toBeDefined();
      expect(DICH_CHUOI_G[k.toLowerCase()]).toBe(muc?.duong);
    }
    expect(DICH_CHUOI_G).toEqual({ t: '/can-chu', o: '/', n: '/nhat-ky' });
  });
});

describe('d.413 — chuỗi G', () => {
  it('G rồi T → /can-chu; G rồi O → /; G rồi N → /nhat-ky', async () => {
    may();
    await vaoVo();
    expect(duong()).toBe('/khong-co');
    await userEvent.keyboard('gt');
    expect(duong()).toBe('/can-chu');
    await userEvent.keyboard('gn');
    // BAT-26: `/nhat-ky` là trang lazy — React Router điều hướng trong transition,
    // URL đổi khi chunk nạp xong.
    await vi.waitFor(() => {
      expect(duong()).toBe('/nhat-ky');
    });
    await userEvent.keyboard('go');
    expect(duong()).toBe('/');
  });

  it('chữ hoa (Shift) cũng được; phím Shift đứng riêng giữa hai phím không huỷ chuỗi', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('{Shift>}G{/Shift}{Shift>}T{/Shift}');
    expect(duong()).toBe('/can-chu');
  });

  it('T/O/N KHÔNG có G trước ⇒ không đi đâu', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('tonTON');
    expect(duong()).toBe('/khong-co');
  });

  it('G trơn KHÔNG bị preventDefault; phím thứ hai T bị chặn và không tới listener bubble', async () => {
    may();
    await vaoVo();
    const trang = vi.fn();
    window.addEventListener('keydown', trang);
    try {
      const g = new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true });
      document.body.dispatchEvent(g);
      expect(g.defaultPrevented).toBe(false);
      expect(trang).toHaveBeenCalledTimes(1);
      const t = new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true });
      act(() => {
        document.body.dispatchEvent(t);
      });
      expect(t.defaultPrevented).toBe(true);
      expect(trang).toHaveBeenCalledTimes(1);
      expect(duong()).toBe('/can-chu');
    } finally {
      window.removeEventListener('keydown', trang);
    }
  });

  it('G rồi phím khác ⇒ huỷ chuỗi, phím khác VẪN tới trang; T sau đó không đi', async () => {
    may();
    await vaoVo();
    const trang = vi.fn();
    window.addEventListener('keydown', trang);
    try {
      await userEvent.keyboard('gj');
      const nhan = trang.mock.calls.map(([e]) => (e as KeyboardEvent).key);
      expect(nhan).toEqual(['g', 'j']);
      expect((trang.mock.calls[1]?.[0] as KeyboardEvent).defaultPrevented).toBe(false);
      await userEvent.keyboard('t');
      expect(duong()).toBe('/khong-co');
    } finally {
      window.removeEventListener('keydown', trang);
    }
  });

  it('G rồi C ⇒ chuỗi huỷ và C mở hộp tạo việc như thường', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('gc');
    expect(await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeTruthy();
    expect(duong()).toBe('/khong-co');
  });

  it('G rồi hết hạn ⇒ T không đi; trong hạn thì đi (đối chứng)', async () => {
    may();
    await vaoVo();
    vi.useFakeTimers({ toFake: ['Date'] });
    phim(document.body, 'g');
    vi.advanceTimersByTime(THOI_HAN_CHUOI_G_MS + 1);
    phim(document.body, 't');
    expect(duong()).toBe('/khong-co');

    phim(document.body, 'g');
    vi.advanceTimersByTime(THOI_HAN_CHUOI_G_MS - 100);
    phim(document.body, 't');
    expect(duong()).toBe('/can-chu');
  });
});

describe('không bắt phím khi', () => {
  it('đang gõ trong input / textarea; chữ vẫn vào ô', async () => {
    may();
    await vaoVo();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    document.body.append(input, textarea);
    try {
      await userEvent.click(input);
      await userEvent.keyboard('gt?');
      expect(input.value).toBe('gt?');
      await userEvent.click(textarea);
      await userEvent.keyboard('gn');
      expect(textarea.value).toBe('gn');
      expect(duong()).toBe('/khong-co');
      expect(bang()).toBeNull();
    } finally {
      input.remove();
      textarea.remove();
    }
  });

  it('đích là PHẦN TỬ CON của vùng contenteditable', async () => {
    may();
    await vaoVo();
    const vung = document.createElement('div');
    vung.setAttribute('contenteditable', 'true');
    const con = document.createElement('span');
    vung.append(con);
    document.body.append(vung);
    try {
      phim(con, 'g');
      phim(con, 't');
      phim(con, '?');
      expect(duong()).toBe('/khong-co');
      expect(bang()).toBeNull();
    } finally {
      vung.remove();
    }
  });

  it('đang soạn IME (isComposing, keyCode 229)', async () => {
    may();
    await vaoVo();
    phim(document.body, 'g', { isComposing: true });
    phim(document.body, 't');
    expect(duong()).toBe('/khong-co');
    phim(document.body, 'g');
    phim(document.body, 't', { keyCode: 229 });
    expect(duong()).toBe('/khong-co');
    phim(document.body, '?', { isComposing: true });
    phim(document.body, '?', { keyCode: 229 });
    expect(bang()).toBeNull();
  });

  it('có Meta / Ctrl / Alt', async () => {
    may();
    await vaoVo();
    phim(document.body, 'g', { metaKey: true });
    phim(document.body, 't');
    phim(document.body, 'g');
    phim(document.body, 't', { ctrlKey: true });
    phim(document.body, 'g');
    phim(document.body, 't', { altKey: true });
    expect(duong()).toBe('/khong-co');
    phim(document.body, '?', { metaKey: true });
    phim(document.body, '?', { ctrlKey: true });
    phim(document.body, '?', { altKey: true });
    expect(bang()).toBeNull();
    // Shift thì được: `?` là Shift+/.
    phim(document.body, '?', { shiftKey: true });
    expect(bang()).not.toBeNull();
  });

  it('hộp tạo việc đang mở: G T và ? là chữ của hộp (kể cả focus ở khung hộp / body)', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('c');
    const h = await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
    phim(h, 'g');
    phim(h, 't');
    phim(h, '?');
    focusVeBody();
    phim(document.body, 'g');
    phim(document.body, 'o');
    phim(document.body, '?');
    expect(duong()).toBe('/khong-co');
    expect(bang()).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('một hộp aria-modal đang mở (menu trượt 375px)', async () => {
    may();
    await vaoVo();
    await userEvent.click(screen.getByLabelText(NHAN_MO_MENU));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await userEvent.keyboard('gt?');
    expect(duong()).toBe('/khong-co');
    expect(bang()).toBeNull();
  });

  it('bảng ? đang mở: G T không đi, C không mở hộp tạo việc', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('?');
    const b = bang();
    expect(b).not.toBeNull();
    await userEvent.keyboard('gtc');
    focusVeBody();
    await userEvent.keyboard('gnc');
    expect(duong()).toBe('/khong-co');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
    expect(bang()).toBe(b);
  });
});

describe('d.416 — bảng phím `?`', () => {
  it('? mở hộp aria-modal có tiêu đề, focus vào hộp; Esc đóng và TRẢ focus về chỗ cũ', async () => {
    may();
    await vaoVo();
    const nut = screen.getByLabelText(NHAN_MO_MENU);
    nut.focus();
    await userEvent.keyboard('?');
    const b = bang();
    expect(b).not.toBeNull();
    expect(b?.getAttribute('aria-modal')).toBe('true');
    expect(within(b as HTMLElement).getByRole('heading', { name: NHAN_BANG_PHIM })).toBeTruthy();
    expect(b?.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(bang()).toBeNull();
    expect(document.activeElement).toBe(nut);
  });

  it('nút đóng đóng hộp', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('?');
    await userEvent.click(screen.getByRole('button', { name: NHAN_DONG_BANG_PHIM }));
    expect(bang()).toBeNull();
  });

  it('Esc lúc soạn IME KHÔNG đóng (trong hộp và từ body); Esc thường từ body đóng', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('?');
    const b = bang() as HTMLElement;
    phim(b, 'Escape', { isComposing: true });
    phim(b, 'Escape', { keyCode: 229 });
    expect(bang()).toBe(b);
    focusVeBody();
    phim(document.body, 'Escape', { isComposing: true });
    expect(bang()).toBe(b);
    phim(document.body, 'Escape');
    expect(bang()).toBeNull();
  });

  it('Tab / Shift+Tab vòng trong hộp; Tab từ body đi vào hộp', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('?');
    const b = bang() as HTMLElement;
    for (let i = 0; i < 4; i += 1) {
      await userEvent.tab();
      expect(b.contains(document.activeElement)).toBe(true);
    }
    await userEvent.tab({ shift: true });
    expect(b.contains(document.activeElement)).toBe(true);
    focusVeBody();
    await userEvent.tab();
    expect(b.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(b);
  });

  it('phím ngoài hộp (focus ở body) và trong hộp KHÔNG tới listener bubble của trang', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('?');
    const trang = vi.fn();
    window.addEventListener('keydown', trang);
    try {
      await userEvent.keyboard('jks1{Control>}{Enter}{/Control}');
      focusVeBody();
      await userEvent.keyboard('jkdsp{Control>}{Enter}{/Control}');
      expect(trang).not.toHaveBeenCalled();
      expect(bang()).not.toBeNull();
    } finally {
      window.removeEventListener('keydown', trang);
    }
  });

  it('hộp liệt kê đủ mọi dòng của PHIM_TAT; bề ngang theo rem/max-w, không px cứng (375px)', async () => {
    may();
    await vaoVo();
    await userEvent.keyboard('?');
    const b = bang() as HTMLElement;
    const dong_ds = [...b.querySelectorAll('[data-phim]')].map((e) => e.getAttribute('data-phim'));
    expect(dong_ds).toEqual(PHIM_TAT.map((d) => d.phim.join(' ')));
    for (const d of PHIM_TAT) expect(b.textContent).toContain(d.viec);
    expect(b.className).toContain('w-full');
    expect(b.className).toMatch(/max-w-(md|lg|sm|xl)/);
    expect(b.className).not.toMatch(/\[\d+px\]/);
  });
});

describe('hằng bảng phím', () => {
  it('đủ các phím ĐANG CÓ (kể cả Cmd/Ctrl+K từ BAT-34, X từ BAT-35)', () => {
    expect(PHIM_TAT.map((d) => d.phim.join(' '))).toEqual([
      'Cmd/Ctrl+K',
      'C',
      'G T',
      'G O',
      'G N',
      'J K',
      'S',
      'P',
      'L',
      'A',
      'X',
      'Esc',
      '?',
    ]);
    // BAT-35: X ghi rõ "S/P/L/A áp cho các thẻ đã chọn"; Esc nói cả vế bỏ chọn.
    expect(PHIM_TAT.find((d) => d.phim[0] === 'X')?.ghi_chu).toMatch(/S\/P\/L\/A áp cho các thẻ đã chọn/);
    expect(PHIM_TAT.find((d) => d.phim[0] === 'Esc')?.viec).toMatch(/Bỏ chọn hết/);
    const chuoi = PHIM_TAT.filter((d) => d.kieu === 'chuoi').map((d) => d.phim[1]?.toLowerCase());
    expect(chuoi.sort()).toEqual(Object.keys(DICH_CHUOI_G).sort());
    expect(PHIM_TAT.find((d) => d.phim[0] === 'S')?.ghi_chu).toBe(GHI_CHU_TICKET_DANG_CHON);
    expect(PHIM_TAT.find((d) => d.phim[0] === 'P')?.ghi_chu).toBe(GHI_CHU_TICKET_DANG_CHON);
    expect(PHIM_TAT.find((d) => d.phim[0] === 'L')?.ghi_chu).toBe(GHI_CHU_TICKET_DANG_CHON);
    expect(PHIM_TAT.find((d) => d.phim[0] === 'A')?.ghi_chu).toBe(GHI_CHU_TICKET_DANG_CHON);
  });
});

describe('một lần bấm không làm hai việc trên trang có phím riêng', () => {
  it('Cần Chủ có thẻ đang chọn: G rồi D ⇒ D tới trang (gửi); G rồi T ⇒ không gửi gì, không tới trang', async () => {
    const goi = may({
      'GET /v1/can-chu': manHinh({ urgent: [the({ ma: 'T-1', loai: 'fyi' })] }),
      'POST /v1/can-chu/ct-T-1/xu-ly': { ok: true },
    });
    await vaoVo('/can-chu');
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).not.toBeNull();
    });
    await userEvent.keyboard('j');
    expect(document.querySelector('[data-the="T-1"]')?.getAttribute('data-dang-chon')).toBe('co');

    const trang = vi.fn();
    window.addEventListener('keydown', trang);
    try {
      await userEvent.keyboard('gt');
      expect(trang.mock.calls.map(([e]) => (e as KeyboardEvent).key)).toEqual(['g']);
      expect(goi.filter((g) => g.method === 'POST')).toHaveLength(0);
      expect(duong()).toBe('/can-chu');
    } finally {
      window.removeEventListener('keydown', trang);
    }

    // Đối chứng: phím khác sau G vẫn là phím của trang.
    await userEvent.keyboard('gd');
    await waitFor(() => {
      expect(goi.filter((g) => g.method === 'POST' && g.duong === '/v1/can-chu/ct-T-1/xu-ly')).toHaveLength(1);
    });
  });

  it('danh sách có panel mở: G rồi J ⇒ J đổi thẻ; G rồi Esc ⇒ đóng panel; G rồi N ⇒ chỉ điều hướng', async () => {
    may({}, true);
    await vaoVo('/ticket?xem=danh-sach');
    const panel = (): string | null =>
      document.querySelector('[data-trang-thai-panel]')?.getAttribute('data-trang-thai-panel') ?? null;
    await waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });
    focusVeBody();
    await userEvent.keyboard('j');
    await waitFor(() => {
      expect(panel()).toBe('SAI-1');
    });
    focusVeBody();
    await userEvent.keyboard('gj');
    await waitFor(() => {
      expect(panel()).toBe('SAI-2');
    });

    const trang = vi.fn();
    window.addEventListener('keydown', trang);
    try {
      focusVeBody();
      await userEvent.keyboard('gn');
      expect(trang.mock.calls.map(([e]) => (e as KeyboardEvent).key)).toEqual(['g']);
      expect(duong()).toBe('/nhat-ky');
    } finally {
      window.removeEventListener('keydown', trang);
    }
  });

  it('danh sách: G rồi Esc ⇒ Esc vẫn đóng panel', async () => {
    may({}, true);
    await vaoVo('/ticket?xem=danh-sach');
    const panel = (): string | null =>
      document.querySelector('[data-trang-thai-panel]')?.getAttribute('data-trang-thai-panel') ?? null;
    await waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });
    focusVeBody();
    await userEvent.keyboard('j');
    await waitFor(() => {
      expect(panel()).toBe('SAI-1');
    });
    focusVeBody();
    await userEvent.keyboard('g{Escape}');
    await waitFor(() => {
      expect(panel()).toBeNull();
    });
  });
});
