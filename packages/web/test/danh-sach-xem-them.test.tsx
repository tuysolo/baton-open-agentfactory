/**
 * **"Xem thêm" của danh sách ticket** — BAT-18, SPEC mục 14 d.409 (mốc 5.000
 * ticket). Nối trang theo `cursor_sau`, giữ bộ lọc, lỗi trang sau không làm mất
 * trang đã có, và cập nhật lạc quan vẫn đúng trên cache nhiều trang.
 *
 * Dùng kiểu Bảng (mặc định) để thẻ `[data-the-ticket]` không bị ảo hoá che.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NHAN_DANG_TAI_THEM, TrangDanhSachTicket } from '../src/trang/danh-sach-ticket';
import { doiTrangThaiTrongCache } from '../src/loc-ticket';
import { CHU_KY_LAM_MOI_MS, NGUONG_HIEN_DAU_LAM_MOI_MS } from '../src/hang-so';
import { dung } from './giup';
import {
  THAN_AGENT,
  THAN_DU_AN,
  dong,
  manHinhDanhSach,
  manHinhTicket,
  ticketDayDu,
} from './than-ticket';

interface Goi {
  duong: string;
  method: string;
}

/** Máy chủ giả theo cursor: không cursor = trang 1; `c1` = trang 2; `c2` = trang 3. */
function mayTheoCursor(opts: { loi_trang_2?: { dang: boolean } } = {}): { goi: Goi[] } {
  const goi: Goi[] = [];
  const trang1 = manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })], { cursor_sau: 'c1' });
  const trang2 = manHinhDanhSach([dong({ ma: 'SAI-3' })], { cursor_sau: 'c2' });
  const trang3 = manHinhDanhSach([dong({ ma: 'SAI-4' })]);
  const dap = (than: unknown, http = 200): Response =>
    new Response(JSON.stringify(than), {
      status: http,
      headers: { 'content-type': 'application/json' },
    });
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    goi.push({ duong, method: init?.method ?? 'GET' });
    if (duong.startsWith('/v1/du-an')) return Promise.resolve(dap(THAN_DU_AN));
    if (duong.startsWith('/v1/agent')) return Promise.resolve(dap(THAN_AGENT));
    if (duong.startsWith('/v1/man-hinh-ticket')) {
      if (duong.includes('cursor=c1')) {
        if (opts.loi_trang_2?.dang === true) {
          return Promise.resolve(dap({ error: 'INTERNAL', message: 'Máy chủ lỗi' }, 500));
        }
        return Promise.resolve(dap(trang2));
      }
      if (duong.includes('cursor=c2')) return Promise.resolve(dap(trang3));
      return Promise.resolve(dap(trang1));
    }
    return Promise.reject(new Error(`Đường không giả lập: ${duong}`));
  }) as typeof globalThis.fetch;
  return { goi };
}

const the = (ma: string): Element | null => document.querySelector(`[data-the-ticket="${ma}"]`);

async function choThe(ma: string): Promise<void> {
  await vi.waitFor(() => {
    expect(the(ma)).not.toBeNull();
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('d.409 — "Xem thêm" nối trang theo cursor_sau', () => {
  it('trang 1 còn cursor ⇒ có nút; bấm ⇒ nối trang 2 với ĐÚNG cursor và ĐÚNG bộ lọc; trang cuối ⇒ nút ẩn', async () => {
    const { goi } = mayTheoCursor();
    dung(<TrangDanhSachTicket />, '/ticket?uu_tien=high');
    await choThe('SAI-2');
    expect(the('SAI-3')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await choThe('SAI-3');
    // Trang 1 vẫn còn, trang 2 nối sau.
    expect(the('SAI-1')).not.toBeNull();
    const t2 = goi.filter((g) => g.duong.includes('cursor=c1'));
    expect(t2).toHaveLength(1);
    expect(t2[0]?.duong).toContain('uu_tien=high');

    // Còn trang 3 ⇒ nút còn; bấm ⇒ trang cuối ⇒ nút ẩn.
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await choThe('SAI-4');
    const t3 = goi.filter((g) => g.duong.includes('cursor=c2'));
    expect(t3[0]?.duong).toContain('uu_tien=high');
    expect(document.querySelector('[data-nut="xem-them"]')).toBeNull();
    expect(document.querySelector('[data-o="con-trang-sau"]')).toBeNull();
  });

  it('lỗi tải trang 2 ⇒ trang 1 còn nguyên + nút Thử lại; Thử lại thành công thì nối', async () => {
    const co = { dang: true };
    mayTheoCursor({ loi_trang_2: co });
    dung(<TrangDanhSachTicket />, '/ticket');
    await choThe('SAI-1');

    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nut="thu-lai-xem-them"]')).not.toBeNull();
    });
    expect(the('SAI-1')).not.toBeNull();
    expect(the('SAI-2')).not.toBeNull();
    expect(the('SAI-3')).toBeNull();

    co.dang = false;
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="thu-lai-xem-them"]')!);
    await choThe('SAI-3');
    expect(the('SAI-1')).not.toBeNull();
    expect(document.querySelector('[data-nut="thu-lai-xem-them"]')).toBeNull();
  });

  it('trang 1 và trang 2 cùng chứa một ticket ⇒ chỉ hiện một lần', async () => {
    globalThis.fetch = ((duong: string) => {
      const dap = (than: unknown): Response =>
        new Response(JSON.stringify(than), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (duong.startsWith('/v1/du-an')) return Promise.resolve(dap(THAN_DU_AN));
      if (duong.startsWith('/v1/agent')) return Promise.resolve(dap(THAN_AGENT));
      if (duong.startsWith('/v1/man-hinh-ticket')) {
        if (duong.includes('cursor=c1')) {
          return Promise.resolve(dap(manHinhDanhSach([dong({ ma: 'SAI-2' }), dong({ ma: 'SAI-3' })])));
        }
        return Promise.resolve(
          dap(manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })], { cursor_sau: 'c1' })),
        );
      }
      return Promise.reject(new Error(`Đường không giả lập: ${duong}`));
    }) as typeof globalThis.fetch;
    dung(<TrangDanhSachTicket />, '/ticket');
    await choThe('SAI-2');
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await choThe('SAI-3');
    expect(document.querySelectorAll('[data-the-ticket="SAI-2"]')).toHaveLength(1);
  });
});

describe('cập nhật lạc quan trên cache nhiều trang', () => {
  it('doiTrangThaiTrongCache đổi đúng ticket ở MỌI trang, giữ pageParams và không sửa bản gốc', () => {
    const goc = {
      pages: [
        manHinhDanhSach([dong({ ma: 'SAI-1' })], { cursor_sau: 'c1' }),
        manHinhDanhSach([dong({ ma: 'SAI-3' })]),
      ],
      pageParams: [undefined, 'c1'],
    };
    const moi = doiTrangThaiTrongCache(goc, 'tk-SAI-3', 'done');
    expect(moi.pages[1]?.items[0]?.trang_thai).toBe('done');
    expect(moi.pages[0]?.items[0]?.trang_thai).toBe('todo');
    expect(moi.pages[0]?.cursor_sau).toBe('c1');
    expect(moi.pageParams).toEqual([undefined, 'c1']);
    expect(goc.pages[1]?.items[0]?.trang_thai).toBe('todo');
  });
});

/* ================================================================== *
 * BAT-19 — máy chủ giả có thể chỉnh giữa chừng
 * ================================================================== */

const json = (than: unknown, http = 200): Response =>
  new Response(JSON.stringify(than), {
    status: http,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Ba trang như `mayTheoCursor`, nhưng: trang đầu đổi được (`kho.dau`), trang 2 có thể
 * treo (`kho.cho_trang_2`), lượt đọc danh sách có thể treo hẳn (`kho.treo_doc`), và
 * `POST .../trang-thai` trả `kho.loi_ghi` nếu có. Đường chi tiết của panel trả thân
 * đầy đủ.
 */
function mayNhieuTrang(): {
  goi: string[];
  kho: {
    dau: ReturnType<typeof dong>[];
    cho_trang_2: Promise<void> | null;
    treo_doc: boolean;
    loi_ghi: { error: string; message: string } | null;
  };
} {
  const goi: string[] = [];
  const kho = {
    dau: [dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })],
    cho_trang_2: null as Promise<void> | null,
    treo_doc: false,
    loi_ghi: null as { error: string; message: string } | null,
  };
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    const ma_ct = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
    if (ma_ct !== undefined) {
      return Promise.resolve(
        json(manHinhTicket(ticketDayDu({ ma: decodeURIComponent(ma_ct), tieu_de: 'Thân panel' }))),
      );
    }
    if (duong.startsWith('/v1/du-an')) return Promise.resolve(json(THAN_DU_AN));
    if (duong.startsWith('/v1/agent')) return Promise.resolve(json(THAN_AGENT));
    if (duong.includes('/trang-thai') && init?.method === 'POST') {
      return Promise.resolve(kho.loi_ghi === null ? json({ ok: true }) : json(kho.loi_ghi, 422));
    }
    if (duong.startsWith('/v1/man-hinh-ticket')) {
      goi.push(duong);
      if (kho.treo_doc) return new Promise<Response>(() => undefined);
      if (duong.includes('cursor=c1')) {
        const tra = (): Response =>
          json(manHinhDanhSach([dong({ ma: 'SAI-3' })], { cursor_sau: 'c2' }));
        return kho.cho_trang_2 === null ? Promise.resolve(tra()) : kho.cho_trang_2.then(tra);
      }
      if (duong.includes('cursor=c2')) {
        return Promise.resolve(json(manHinhDanhSach([dong({ ma: 'SAI-4' })])));
      }
      return Promise.resolve(json(manHinhDanhSach(kho.dau, { cursor_sau: 'c1' })));
    }
    return Promise.reject(new Error(`Đường không giả lập: ${duong}`));
  }) as typeof globalThis.fetch;
  return { goi, kho };
}

const bamXemThem = (): void => {
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="xem-them"]')!);
};

const troiThoiGian = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('BAT-19 việc 1 — đã nối >1 trang thì nhịp chỉ tải lại TRANG ĐẦU', () => {
  it('3 trang đã nối, qua nhiều nhịp ⇒ không lượt gọi nào mang cursor; trang đầu mới hiện, trang 2–3 còn nguyên', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { goi, kho } = mayNhieuTrang();
    dung(<TrangDanhSachTicket />, '/ticket');
    await choThe('SAI-2');
    bamXemThem();
    await choThe('SAI-3');
    bamXemThem();
    await choThe('SAI-4');
    // Để mọi lượt đang bay (nếu có) xong, rồi mốc đếm.
    await troiThoiGian(50);
    const moc = goi.length;

    // Agent thêm một ticket ở ĐẦU danh sách.
    kho.dau = [dong({ ma: 'SAI-9' }), dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })];
    await troiThoiGian(CHU_KY_LAM_MOI_MS * 3 + 50);

    const sau = goi.slice(moc);    expect(sau.length).toBeGreaterThanOrEqual(2);
    for (const d of sau) expect(d).not.toContain('cursor=');
    await choThe('SAI-9');
    for (const ma of ['SAI-1', 'SAI-2', 'SAI-3', 'SAI-4']) expect(the(ma)).not.toBeNull();
    expect(document.querySelectorAll('[data-the-ticket="SAI-9"]')).toHaveLength(1);
  });

  it('chỉ 1 trang ⇒ nhịp cũ của query vẫn chạy', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { goi, kho } = mayNhieuTrang();
    dung(<TrangDanhSachTicket />, '/ticket');
    await choThe('SAI-2');
    await troiThoiGian(50);
    const moc = goi.length;

    kho.dau = [dong({ ma: 'SAI-9' }), dong({ ma: 'SAI-1' })];
    await troiThoiGian(CHU_KY_LAM_MOI_MS * 2 + 50);

    expect(goi.length - moc).toBeGreaterThanOrEqual(2);
    await choThe('SAI-9');
    expect(the('SAI-2')).toBeNull();
  });
});

describe('BAT-19 việc 2 — "đang tải thêm" chỉ hiện ở nút, không bật dấu làm mới', () => {
  it('trang sau đang tải ⇒ nút đổi chữ + aria-busy + disabled; dấu làm mới KHÔNG hiện kể cả quá ngưỡng', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { kho } = mayNhieuTrang();
    let mo: () => void = () => undefined;
    kho.cho_trang_2 = new Promise<void>((res) => {
      mo = res;
    });
    dung(<TrangDanhSachTicket />, '/ticket');
    await choThe('SAI-2');
    bamXemThem();

    const nut = await vi.waitFor(() => {
      const n = document.querySelector<HTMLButtonElement>('[data-nut="xem-them"]');
      expect(n?.textContent).toBe(NHAN_DANG_TAI_THEM);
      return n!;
    });
    expect(nut.getAttribute('aria-busy')).toBe('true');
    expect(nut.disabled).toBe(true);

    await troiThoiGian(NGUONG_HIEN_DAU_LAM_MOI_MS + 50);
    expect(document.querySelector('[data-dau-lam-moi]')?.getAttribute('data-dau-lam-moi')).toBe(
      'khong',
    );
    expect(nut.textContent).toBe(NHAN_DANG_TAI_THEM);

    await act(async () => {
      mo();
      await vi.advanceTimersByTimeAsync(10);
    });
    await choThe('SAI-3');
  });
});

describe('BAT-20 — kết quả trang đầu về muộn hơn một lần cập nhật mới hơn thì bỏ', () => {
  /**
   * Bọc máy chủ giả: (a) lượt đọc trang đầu KẾ TIẾP (không cursor) bị giữ lại, trả bản
   * chụp lúc gửi (ticket SAI-1 còn `todo`) khi `tha()`; (b) POST trạng thái ghi thật
   * vào `kho.dau` để các lượt đọc sau thấy `in_progress`.
   */
  function giuTrangDau(kho: ReturnType<typeof mayNhieuTrang>['kho']): {
    giu: () => void;
    tha: () => void;
    da_giu: () => boolean;
  } {
    const that = globalThis.fetch;
    let dang_giu = false;
    let da_giu = false;
    let mo: () => void = () => undefined;
    const cho = new Promise<void>((res) => {
      mo = res;
    });
    globalThis.fetch = ((duong: string, init?: RequestInit) => {
      if (duong.includes('/trang-thai') && init?.method === 'POST') {
        kho.dau = kho.dau.map((d) =>
          d.id === 'tk-SAI-1' ? dong({ ma: 'SAI-1', trang_thai: 'in_progress' }) : d,
        );
      }
      if (
        dang_giu &&
        duong.startsWith('/v1/man-hinh-ticket') &&
        !duong.includes('/ma/') &&
        !duong.includes('cursor=')
      ) {
        dang_giu = false;
        da_giu = true;
        const cu = manHinhDanhSach(kho.dau, { cursor_sau: 'c1' });
        return cho.then(() => json(cu));
      }
      return that(duong, init);
    }) as typeof globalThis.fetch;
    return {
      giu: () => {
        dang_giu = true;
      },
      tha: mo,
      da_giu: () => da_giu,
    };
  }

  const cotCuaSai1 = (): string | null =>
    document.querySelector('[data-the-ticket="SAI-1"]')?.closest('[data-cot]')?.getAttribute('data-cot') ??
    null;

  it('lượt trang đầu gửi trước thao tác của chủ, về sau khi danh sách đã tải lại ⇒ bị bỏ, ticket giữ trạng thái mới', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { kho } = mayNhieuTrang();
    const m = giuTrangDau(kho);
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choThe('SAI-2');
    bamXemThem();
    await choThe('SAI-3');
    await troiThoiGian(50);
    expect(cotCuaSai1()).toBe('todo');

    // Nhịp kế gửi lượt trang đầu, máy chủ giữ lại (dữ liệu cũ: SAI-1 ở todo).
    m.giu();
    await troiThoiGian(CHU_KY_LAM_MOI_MS + 50);
    expect(m.da_giu()).toBe(true);

    // Chủ đổi SAI-1 sang in_progress; máy chủ nhận, danh sách tải lại xong.
    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-1' }));
    const o = await vi.waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>('[data-trang-thai-panel="SAI-1"]');
      expect(el).not.toBeNull();
      return el!;
    });
    await userEvent.selectOptions(o, 'in_progress');
    await troiThoiGian(100);
    await vi.waitFor(() => {
      expect(cotCuaSai1()).toBe('in_progress');
    });

    // Giờ mới thả phản hồi cũ: không được ghi đè.
    await act(async () => {
      m.tha();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(cotCuaSai1()).toBe('in_progress');
    for (const ma of ['SAI-2', 'SAI-3']) expect(the(ma)).not.toBeNull();
  });
});

describe('BAT-19 việc 3 — đổi trạng thái ticket ở trang 2, máy chủ báo lỗi', () => {
  it('ticket về cột cũ, cả 2 trang còn nguyên, toast mang đúng message máy chủ', async () => {
    const LY_DO = 'Thiếu bằng chứng: cần ít nhất một commit đã merge.';
    const { kho } = mayNhieuTrang();
    kho.loi_ghi = { error: 'EVIDENCE_REQUIRED', message: LY_DO };
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choThe('SAI-2');
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await choThe('SAI-3');
    expect(document.querySelector('[data-cot="todo"] [data-the-ticket="SAI-3"]')).not.toBeNull();

    // Đóng cửa lượt đọc: chỉ phép hoàn ảnh chụp của onError mới đưa thẻ về cột cũ.
    kho.treo_doc = true;

    // Jsdom không kéo chuột được và thẻ không còn ô "Chuyển cột" (d.404): dùng ô
    // trạng thái của panel — cùng mutation, cùng cập nhật lạc quan, cùng toast.
    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-3' }));
    const o = await vi.waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>('[data-trang-thai-panel="SAI-3"]');
      expect(el).not.toBeNull();
      return el!;
    });
    await userEvent.selectOptions(o, 'done');

    await vi.waitFor(() => {
      expect(screen.getByText(LY_DO)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-cot="todo"] [data-the-ticket="SAI-3"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-cot="done"] [data-the-ticket="SAI-3"]')).toBeNull();
    for (const ma of ['SAI-1', 'SAI-2', 'SAI-3']) expect(the(ma)).not.toBeNull();
  });
});

/* ================================================================== *
 * BAT-26 — hai cổng đọc SỔ ĐẾM S/P/L: "quay lại tab" và nhịp trang đầu
 * ================================================================== */

describe('BAT-26 — thao tác S đang bay: quay lại tab và nhịp trang đầu không đè giá trị lạc quan', () => {
  /** `POST .../trang-thai` bị giữ đến khi `mo()` — thao tác S treo giữa chừng. */
  function giuGhiTrangThai(): { mo: () => void } {
    const that = globalThis.fetch;
    let mo: () => void = () => undefined;
    const cho = new Promise<void>((res) => {
      mo = res;
    });
    globalThis.fetch = ((duong: string, init?: RequestInit) => {
      if (duong.includes('/trang-thai') && init?.method === 'POST') {
        return cho.then(() => that(duong, init));
      }
      return that(duong, init);
    }) as typeof globalThis.fetch;
    return { mo };
  }

  const cotCua = (ma: string): string | null =>
    document.querySelector(`[data-the-ticket="${ma}"]`)?.closest('[data-cot]')?.getAttribute('data-cot') ??
    null;
  const docDanhSach = (goi: string[]): number =>
    goi.filter((d) => !d.includes('/ma/') && !d.includes('cursor=')).length;

  async function doiSangDangLam(ma: string): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: `Mở ${ma}` }));
    const o = await vi.waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>(`[data-trang-thai-panel="${ma}"]`);
      expect(el).not.toBeNull();
      return el!;
    });
    await userEvent.selectOptions(o, 'in_progress');
    await vi.waitFor(() => {
      expect(cotCua(ma)).toBe('in_progress');
    });
  }

  it('(a) `S` treo, tab ẩn rồi hiện lại ⇒ KHÔNG có GET danh sách mới, giá trị lạc quan còn nguyên', async () => {
    const { goi } = mayNhieuTrang();
    const g = giuGhiTrangThai();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choThe('SAI-2');
    await doiSangDangLam('SAI-1');

    const truoc = goi.length;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(goi.length).toBe(truoc);
    expect(cotCua('SAI-1')).toBe('in_progress');
    g.mo();
  });

  it('(b) không có thao tác bay ⇒ quay lại tab vẫn làm mới danh sách như cũ', async () => {
    const { goi } = mayNhieuTrang();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choThe('SAI-2');
    await new Promise((r) => setTimeout(r, 50));
    const truoc = docDanhSach(goi);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await vi.waitFor(() => {
      expect(docDanhSach(goi)).toBeGreaterThan(truoc);
    });
  });

  it('nhiều trang, `S` treo, nhịp trang đầu tới ⇒ pages[0] KHÔNG bị thay (giá trị lạc quan giữ); thả ⇒ làm mới', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { goi, kho } = mayNhieuTrang();
    const g = giuGhiTrangThai();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choThe('SAI-2');
    bamXemThem();
    await choThe('SAI-3');
    await troiThoiGian(50);
    await doiSangDangLam('SAI-1');

    // Máy chủ chưa nhận S; agent thêm SAI-9 ở đầu.
    kho.dau = [dong({ ma: 'SAI-9' }), dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })];
    const moc = docDanhSach(goi);
    await troiThoiGian(CHU_KY_LAM_MOI_MS * 3 + 50);
    // Nhịp có chạy (lượt GET trang đầu đã bay) mà kết quả bị bỏ.
    expect(docDanhSach(goi)).toBeGreaterThan(moc);
    expect(the('SAI-9')).toBeNull();
    expect(cotCua('SAI-1')).toBe('in_progress');

    await act(async () => {
      g.mo();
      await vi.advanceTimersByTimeAsync(100);
    });
    await choThe('SAI-9');
  });
});
