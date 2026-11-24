/**
 * **BAT-39 việc 2 — "Có bản mới — tải lại trang".** SPEC mục 14 gạch "Có bản
 * mới": tab chạy bản web cũ sau deploy thì hiện một dòng; bấm thì tải lại;
 * **không bao giờ tự tải lại**. Mã bản build: `src/vo/ban-moi.tsx`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  BaoBanMoi,
  CHU_KY_KIEM_BAN_MS,
  DUONG_BAN_BUILD,
  MA_BAN_DANG_CHAY,
  docMaBanDeploy,
} from '../src/vo/ban-moi';
import { specDoiCoBanMoi } from './doc-spec';

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface GoiFetch {
  duong: string;
  init: RequestInit | undefined;
}

/** Máy chủ giả cho `/ban-build.json`: trả `tra()` mỗi lần gọi, ghi lại lượt gọi. */
function mayBan(tra: () => Promise<Response>): GoiFetch[] {
  const goi: GoiFetch[] = [];
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    goi.push({ duong, init });
    return tra();
  }) as typeof globalThis.fetch;
  return goi;
}
const json = (v: unknown, status = 200): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } }));

const dong = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-o="ban-moi"]');

/** Tab quay lại hiện, rồi chờ các promise của lượt kiểm. */
async function quayLaiTab(): Promise<void> {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1);
  });
}

describe('BAT-39 việc 2: báo "Có bản mới — tải lại trang"', () => {
  it('SPEC mục 14 (chữ của SPEC): có dòng "Có bản mới — tải lại trang", không bao giờ tự tải lại', () => {
    expect(specDoiCoBanMoi()).toEqual({ co_dong: true, khong_tu_tai_lai: true });
  });

  it('bộ test không có `define` ⇒ mã đang chạy rỗng ⇒ không kiểm (0 fetch), không hiện', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    expect(MA_BAN_DANG_CHAY).toBe('');
    const goi = mayBan(() => json({ ma: 'moi' }));
    render(<BaoBanMoi />);
    await quayLaiTab();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_KIEM_BAN_MS * 2);
    });
    expect(goi).toEqual([]);
    expect(dong()).toBeNull();
  });

  it('mã KHÁC (tab quay lại) ⇒ hiện dòng role=status; fetch đúng đường, cache no-store; KHÔNG tự tải lại', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const goi = mayBan(() => json({ ma: 'ban-moi' }));
    const taiLai = vi.fn();
    render(<BaoBanMoi ma_dang_chay="ban-cu" taiLai={taiLai} />);
    expect(dong()).toBeNull();
    await quayLaiTab();
    expect(dong()).not.toBeNull();
    expect(dong()!.getAttribute('role')).toBe('status');
    expect(dong()!.textContent).toBe('Có bản mới — tải lại trang');
    expect(goi[0]?.duong).toBe(DUONG_BAN_BUILD);
    expect(goi[0]?.init?.cache).toBe('no-store');
    // Đứng yên rất lâu: không tự tải lại, và đã thấy bản mới thì thôi kiểm.
    const n = goi.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_KIEM_BAN_MS * 3);
    });
    expect(taiLai).not.toHaveBeenCalled();
    expect(goi.length).toBe(n);
  });

  it('bấm "tải lại trang" ⇒ gọi tải lại đúng một lần', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mayBan(() => json({ ma: 'ban-moi' }));
    const taiLai = vi.fn();
    render(<BaoBanMoi ma_dang_chay="ban-cu" taiLai={taiLai} />);
    await quayLaiTab();
    fireEvent.click(document.querySelector('[data-nut="tai-lai"]')!);
    expect(taiLai).toHaveBeenCalledTimes(1);
  });

  it('mã GIỐNG ⇒ không hiện (cả lúc quay lại tab, focus cửa sổ, nhịp định kỳ)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const goi = mayBan(() => json({ ma: 'ban-cu' }));
    render(<BaoBanMoi ma_dang_chay="ban-cu" taiLai={vi.fn()} />);
    await quayLaiTab();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(CHU_KY_KIEM_BAN_MS + 10);
    });
    expect(goi.length).toBeGreaterThanOrEqual(3);
    expect(dong()).toBeNull();
  });

  it('nhịp định kỳ (~5 phút) cũng kiểm: mã đổi giữa chừng ⇒ hiện sau một chu kỳ', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let ma = 'ban-cu';
    const goi = mayBan(() => json({ ma }));
    render(<BaoBanMoi ma_dang_chay="ban-cu" taiLai={vi.fn()} />);
    expect(CHU_KY_KIEM_BAN_MS).toBe(5 * 60_000);
    ma = 'ban-moi';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_KIEM_BAN_MS - 1000);
    });
    expect(dong()).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(goi.length).toBe(1);
    expect(dong()).not.toBeNull();
  });

  it('unmount ⇒ gỡ listener focus/visibilitychange và nhịp định kỳ: sau đó 0 lần fetch thêm', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const goi = mayBan(() => json({ ma: 'ban-cu' }));
    const { unmount } = render(<BaoBanMoi ma_dang_chay="ban-cu" taiLai={vi.fn()} />);
    // Còn gắn: mỗi sự kiện đều kiểm (đối chứng — listener có thật).
    await quayLaiTab();
    expect(goi.length).toBe(1);
    unmount();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(CHU_KY_KIEM_BAN_MS * 2 + 10);
    });
    expect(goi.length).toBe(1);
  });

  it('lỗi mạng / HTTP lỗi / thân không phải JSON (vite dev trả index.html) / thiếu `ma` ⇒ im lặng, không hiện', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cac_ca: (() => Promise<Response>)[] = [
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => json({ ma: 'ban-moi' }, 503),
      () => Promise.resolve(new Response('<!doctype html><html></html>', { status: 200 })),
      () => json({ khac: 1 }),
      () => json({ ma: '' }),
    ];
    for (const tra of cac_ca) {
      mayBan(tra);
      expect(await docMaBanDeploy()).toBeNull();
      const { unmount } = render(<BaoBanMoi ma_dang_chay="ban-cu" taiLai={vi.fn()} />);
      await quayLaiTab();
      expect(dong()).toBeNull();
      unmount();
    }
  });
});
