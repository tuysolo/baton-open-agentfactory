/**
 * **BAT-35 việc 1 — hạn chờ cho mọi `fetch` của `src/api.ts`.**
 *
 * Máy chủ treo (không trả, không đóng kết nối) không được giữ giao diện mãi: sau
 * `HAN_CHO_API_MS` lời gọi ném `LoiApi(HET_HAN_CHO, …, 0)`, hộp đang gửi mở lại
 * được, và **không** có lần gửi lại tự động nào (lệnh ghi có thể đã tới máy chủ).
 * Hai đường tải file dùng hạn dài `HAN_CHO_TAI_FILE_MS`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import {
  HAN_CHO_API_MS,
  HAN_CHO_TAI_FILE_MS,
  LoiApi,
  MA_HET_HAN_CHO,
  cauHetHanCho,
  goiApi,
  taiBanXuat,
} from '../src/api';
import { HopGiaoViec } from '../src/vo/giao-viec';
import { MayChuGia, dung } from './giup';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** `fetch` treo mãi; ghi lại `signal` của từng lần gọi. */
function fetchTreo(): { tin_hieu: AbortSignal[]; so_lan: () => number } {
  const tin_hieu: AbortSignal[] = [];
  globalThis.fetch = ((_d: string, init?: RequestInit) => {
    if (init?.signal) tin_hieu.push(init.signal);
    return new Promise<Response>(() => undefined);
  }) as typeof globalThis.fetch;
  return { tin_hieu, so_lan: () => tin_hieu.length };
}

/** Đọc chữ của một `Blob` (jsdom không có `Blob.text()`). */
function docBlob(b: Blob): Promise<string> {
  return new Promise((xong, hong) => {
    const fr = new FileReader();
    fr.onload = () => xong(typeof fr.result === 'string' ? fr.result : '');
    fr.onerror = () => hong(new Error('FileReader lỗi'));
    fr.readAsText(b);
  });
}

/** Bắt kết quả của một promise mà không để nó thành "unhandled". */
function theoDoi<T>(p: Promise<T>): { kq: () => { xong: boolean; loi: unknown; gia_tri: T | undefined } } {
  const s = { xong: false, loi: undefined as unknown, gia_tri: undefined as T | undefined };
  void p.then(
    (v) => {
      s.xong = true;
      s.gia_tri = v;
    },
    (e: unknown) => {
      s.xong = true;
      s.loi = e;
    },
  );
  return { kq: () => s };
}

describe('goiApi — hết hạn chờ', () => {
  it(`POST treo ⇒ đúng ${String(HAN_CHO_API_MS)} ms thì ném LoiApi HET_HAN_CHO, http 0, câu nói "có thể đã tới máy chủ"; signal bị abort`, async () => {
    vi.useFakeTimers();
    const f = fetchTreo();
    const t = theoDoi(goiApi('/v1/ticket/tk-1/trang-thai', { method: 'POST', than: { trang_thai: 'done' } }));
    await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS - 1);
    expect(t.kq().xong).toBe(false);
    expect(f.tin_hieu[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.kq().xong).toBe(true);
    const loi = t.kq().loi;
    expect(loi).toBeInstanceOf(LoiApi);
    expect((loi as LoiApi).ma).toBe(MA_HET_HAN_CHO);
    expect((loi as LoiApi).http).toBe(0);
    expect((loi as LoiApi).message).toBe(cauHetHanCho(HAN_CHO_API_MS, 'POST'));
    expect((loi as LoiApi).message).toBe(
      'Máy chủ không trả lời sau 20 giây. Thao tác có thể đã tới máy chủ — tải lại để kiểm trước khi thử lại.',
    );
    expect(f.tin_hieu[0]?.aborted).toBe(true);
    // Một lần gọi, không tự thử lại.
    await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS * 3);
    expect(f.so_lan()).toBe(1);
  });

  it('GET treo ⇒ câu riêng cho lệnh đọc (không nói "thao tác có thể đã tới")', async () => {
    vi.useFakeTimers();
    fetchTreo();
    const t = theoDoi(goiApi('/v1/du-an'));
    await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS);
    expect((t.kq().loi as LoiApi).message).toBe('Máy chủ không trả lời sau 20 giây. Kiểm tra mạng rồi thử lại.');
  });

  it('hạn chờ phủ cả lúc ĐỌC THÂN: đầu trả về, thân treo ⇒ vẫn hết hạn', async () => {
    vi.useFakeTimers();
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => new Promise<string>(() => undefined),
      } as unknown as Response));
    const t = theoDoi(goiApi('/v1/du-an'));
    await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS);
    expect((t.kq().loi as LoiApi).ma).toBe(MA_HET_HAN_CHO);
  });

  it('thành công ⇒ trả thân, hẹn giờ ĐÃ DỌN (không còn timer nào treo)', async () => {
    vi.useFakeTimers();
    new MayChuGia().dat('GET /v1/du-an', { than: { items: [] } }).gan();
    const kq = await goiApi<{ items: unknown[] }>('/v1/du-an');
    expect(kq).toEqual({ items: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lỗi máy chủ ⇒ hẹn giờ cũng đã dọn, lỗi giữ nguyên mã/câu/http của máy chủ', async () => {
    vi.useFakeTimers();
    new MayChuGia().dat('POST /v1/x', { loi: { error: 'FORBIDDEN', message: 'Không có quyền.' }, http: 403 }).gan();
    const t = theoDoi(goiApi('/v1/x', { method: 'POST', than: {} }));
    await vi.advanceTimersByTimeAsync(0);
    const loi = t.kq().loi as LoiApi;
    expect([loi.ma, loi.message, loi.http]).toEqual(['FORBIDDEN', 'Không có quyền.', 403]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fetch ném (mạng đứt) ⇒ giữ hành vi cũ: chính lỗi đó, không đổi thành HET_HAN_CHO', async () => {
    const goc = new TypeError('Failed to fetch');
    globalThis.fetch = () => Promise.reject(goc);
    await expect(goiApi('/v1/du-an')).rejects.toBe(goc);
  });

  it('`hanChoMs` riêng ⇒ dùng hạn đó (30 giây), không cắt ở 20 giây', async () => {
    vi.useFakeTimers();
    fetchTreo();
    const t = theoDoi(goiApi('/v1/du-an', { hanChoMs: 30_000 }));
    await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS);
    expect(t.kq().xong).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((t.kq().loi as LoiApi).message).toBe('Máy chủ không trả lời sau 30 giây. Kiểm tra mạng rồi thử lại.');
  });
});

describe('taiBlob (xuất / sao lưu) — hạn chờ DÀI', () => {
  it(`taiBanXuat treo ⇒ còn chờ sau 20 giây; hết hạn đúng ${String(HAN_CHO_TAI_FILE_MS)} ms ("5 phút")`, async () => {
    vi.useFakeTimers();
    const f = fetchTreo();
    const t = theoDoi(taiBanXuat());
    await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS * 2);
    expect(t.kq().xong).toBe(false);
    await vi.advanceTimersByTimeAsync(HAN_CHO_TAI_FILE_MS - HAN_CHO_API_MS * 2);
    const loi = t.kq().loi as LoiApi;
    expect(loi.ma).toBe(MA_HET_HAN_CHO);
    expect(loi.http).toBe(0);
    expect(loi.message).toBe('Máy chủ không trả lời sau 5 phút. Kiểm tra mạng rồi thử lại.');
    expect(f.tin_hieu[0]?.aborted).toBe(true);
  });

  it('taiBanXuat thành công ⇒ hẹn giờ đã dọn', async () => {
    vi.useFakeTimers();
    globalThis.fetch = (() =>
      Promise.resolve(new Response('{"a":1}', { status: 200 })));
    const kq = await taiBanXuat();
    expect(vi.getTimerCount()).toBe(0);
    // `Blob` của jsdom không có `text()` ⇒ đọc qua `FileReader`, bằng đồng hồ thật.
    vi.useRealTimers();
    expect(await docBlob(kq.blob)).toBe('{"a":1}');
  });
});

/* ------------------------------------------------------------------ *
 * Hộp đang gửi + máy chủ treo
 * ------------------------------------------------------------------ */

const THAN_AGENT = {
  items: [{ id: 'ag-a', ten: 'W-builder', vai_tro: 'worker', nhan_vai_tro: 'Worker', disabled: false }],
  cursor_sau: null,
};
const DUONG_POST = '/v1/ticket/tk-SAI-1/luot-giao';

const hop = (): HTMLElement => document.querySelector<HTMLElement>('[data-o="hop-giao-viec"]')!;
const nutGui = (): HTMLButtonElement => hop().querySelector<HTMLButtonElement>('[data-nut="gui-giao"]')!;
const cauToast = (): string[] =>
  [...document.querySelectorAll('[data-toast="loi"] span')].map((e) => e.textContent ?? '');

describe('hộp Giao việc: máy chủ treo mãi ⇒ sau hạn chờ hộp mở lại, không gửi trùng', () => {
  it('Gửi ⇒ khoá; hết 20 giây ⇒ toast câu hết hạn, nút Gửi + Huỷ bật lại, hộp còn mở, đúng 1 POST; bấm lại ⇒ đúng 2; Esc đóng được', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const m = new MayChuGia()
      .dat('GET /v1/agent', { than: THAN_AGENT })
      .dat(`POST ${DUONG_POST}`, { than: {}, cho: new Promise(() => undefined) })
      .gan();
    const dong = vi.fn();
    dung(<HopGiaoViec ticket={{ id: 'tk-SAI-1', ma: 'SAI-1' }} dong={dong} />);
    await waitFor(() => {
      expect(hop().querySelector<HTMLSelectElement>('[data-nhap="agent"]')!.options.length).toBe(2);
    });
    fireEvent.change(hop().querySelector('[data-nhap="agent"]')!, { target: { value: 'ag-a' } });
    fireEvent.submit(hop().querySelector('form')!);
    await waitFor(() => {
      expect(nutGui().disabled).toBe(true);
    });
    expect(m.soLan('POST', DUONG_POST)).toBe(1);
    // Esc lúc request đang bay thật ⇒ chưa đóng (nếp BAT-34).
    fireEvent.keyDown(hop(), { key: 'Escape' });
    expect(dong).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS + 10);
    });
    await waitFor(() => {
      expect(cauToast()).toContain(cauHetHanCho(HAN_CHO_API_MS, 'POST'));
    });
    expect(nutGui().disabled).toBe(false);
    expect(hop().querySelector<HTMLButtonElement>('[data-nut="huy-giao"]')!.disabled).toBe(false);
    expect(hop().querySelector('[data-loi="may-chu"]')?.textContent).toBe(cauHetHanCho(HAN_CHO_API_MS, 'POST'));
    // Không tự thử lại POST.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS * 2);
    });
    expect(m.soLan('POST', DUONG_POST)).toBe(1);

    // Gửi lại được (khoá `useMotLan` đã nhả) — đúng một POST nữa.
    fireEvent.submit(hop().querySelector('form')!);
    fireEvent.submit(hop().querySelector('form')!);
    await waitFor(() => {
      expect(m.soLan('POST', DUONG_POST)).toBe(2);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS + 10);
    });
    await waitFor(() => {
      expect(nutGui().disabled).toBe(false);
    });
    expect(m.soLan('POST', DUONG_POST)).toBe(2);
    fireEvent.keyDown(hop(), { key: 'Escape' });
    expect(dong).toHaveBeenCalledTimes(1);
  });
});
