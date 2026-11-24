/**
 * **BAT-35 việc 2 — `X` chọn nhiều, áp S/P/L/A cho nhiều ticket.** SPEC mục 14
 * d.415 (S/P/L/A trên ticket đang chọn), d.416 ("`X` chọn; áp một phím cho nhiều
 * ticket; `?` hiện bảng phím"), d.418 (lạc quan; máy chủ từ chối ⇒ hoàn + toast lý
 * do). Phần SPEC không nói: `cau-hoi-spec.md` #156–#158.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { TrangDanhSachTicket } from '../src/trang/danh-sach-ticket';
import { HAN_CHO_API_MS, cauHetHanCho, type TicketDong, type TrangThaiTicket, type UuTien } from '../src/api';
import {
  NGUONG_HOI_AP,
  NHAN_AP_NHAN,
  canHoiAp,
  catGon,
  cauHoiAp,
  dichNhanLo,
  moTaNhanLo,
  nhanSoChon,
  taoHangGioiHan,
  tomTatLoiLo,
} from '../src/chon-nhieu';
import { CAU_DA_HUY_GIAO } from '../src/huy-gui';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import { TRUY_VAN_HEP } from '../src/vo/kho-man-hinh';
import { MayChuGia, dung } from './giup';
import { specDoiChiNutApChonNhieu } from './doc-spec';
import { THAN_DU_AN, dong, manHinhDanhSach, manHinhTicket, ticketDayDu } from './than-ticket';

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true);
  });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const THAN_AGENT_GIAO = {
  items: [
    { id: 'ag-a', ten: 'W-builder', vai_tro: 'worker', nhan_vai_tro: 'Worker', disabled: false },
    { id: 'ag-b', ten: 'M-baton', vai_tro: 'manager', nhan_vai_tro: 'Manager', disabled: false },
  ],
  cursor_sau: null,
};

interface TraVe {
  loi?: { error: string; message: string };
  cho?: Promise<unknown>;
  /** Treo mãi — dựng ca hết hạn chờ. */
  treo?: boolean;
}

interface Goi {
  duong: string;
  method: string;
  than: unknown;
  /** Loại lệnh ghi: `trang-thai` / `sua` (PATCH ưu tiên) / `nhan` / `luot-giao`. */
  loai: string;
  id: string;
}

function cuaTreo(): { cho: Promise<void>; mo: () => void } {
  let mo = (): void => undefined;
  const cho = new Promise<void>((r) => {
    mo = () => r();
  });
  return { cho, mo };
}

/**
 * Máy chủ giả: danh sách (`kho.trang`, đổi theo mọi lệnh ghi đã nhận), chi tiết
 * panel, bốn lệnh ghi. `kho.tra` đặt câu trả lời theo `"<loại> <id>"`; `kho.cho`
 * giữ MỌI lệnh ghi; `kho.choGet` giữ lượt đọc danh sách.
 */
function may(items: TicketDong[]): {
  kho: {
    trang: ReturnType<typeof manHinhDanhSach>;
    tra: Map<string, TraVe>;
    cho: Promise<unknown> | null;
    choGet: Promise<unknown> | null;
  };
  ghi: Goi[];
  soGetDs: () => number;
} {
  const kho = {
    trang: manHinhDanhSach(items),
    tra: new Map<string, TraVe>(),
    cho: null as Promise<unknown> | null,
    choGet: null as Promise<unknown> | null,
  };
  const ghi: Goi[] = [];
  let so_get_ds = 0;
  new MayChuGia().dat('GET /v1/du-an?limit=200', { than: THAN_DU_AN }).dat('GET /v1/agent', { than: THAN_AGENT_GIAO }).gan();
  const goc = globalThis.fetch;
  const json = (v: unknown, status = 200): Response =>
    new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  const apDung = (id: string, loai: string, than: Record<string, unknown>): void => {
    kho.trang = {
      ...kho.trang,
      items: kho.trang.items.map((t) => {
        if (t.id !== id) return t;
        if (loai === 'trang-thai') return { ...t, trang_thai: than.trang_thai as TrangThaiTicket };
        if (loai === 'sua') return { ...t, uu_tien: than.uu_tien as UuTien };
        if (loai === 'nhan') {
          const n = than.nhan as string;
          return { ...t, nhan: than.gan === true ? [...t.nhan, n] : t.nhan.filter((x) => x !== n) };
        }
        return t;
      }),
    };
  };
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const than: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const ma_ct = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
    if (ma_ct !== undefined) {
      return Promise.resolve(json(manHinhTicket(ticketDayDu({ ma: decodeURIComponent(ma_ct) }))));
    }
    if (duong.startsWith('/v1/man-hinh-ticket')) {
      so_get_ds += 1;
      const d = (): Response => json(kho.trang);
      return kho.choGet === null ? Promise.resolve(d()) : kho.choGet.then(d);
    }
    const w = /^\/v1\/ticket\/([^/]+)(?:\/(trang-thai|nhan|luot-giao))?$/.exec(duong);
    if (w !== null && method !== 'GET') {
      const id = decodeURIComponent(w[1] ?? '');
      const loai = w[2] ?? 'sua';
      ghi.push({ duong, method, than, loai, id });
      const tv = kho.tra.get(`${loai} ${id}`) ?? {};
      if (tv.treo === true) return new Promise<Response>(() => undefined);
      const dap = (): Response => {
        if (tv.loi !== undefined) return json(tv.loi, 422);
        apDung(id, loai, than as Record<string, unknown>);
        return loai === 'luot-giao' ? json({ id: `lg-${id}` }, 201) : json({ ok: true });
      };
      const cho = tv.cho ?? kho.cho;
      return cho === null ? Promise.resolve(dap()) : cho.then(dap);
    }
    return goc(duong, init);
  }) as typeof globalThis.fetch;
  return { kho, ghi, soGetDs: () => so_get_ds };
}

const ba = (): TicketDong[] => [dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' }), dong({ ma: 'SAI-3' })];

const the = (ma: string): HTMLElement => {
  const t = document.querySelector<HTMLElement>(`[data-the-ticket="${ma}"]`);
  expect(t, ma).not.toBeNull();
  return t!;
};
const trangThai = (ma: string): string | null => the(ma).getAttribute('data-trang-thai');
const uuTien = (ma: string): string =>
  the(ma).querySelector('[data-o="uu-tien"]')?.getAttribute('data-uu-tien') ?? 'none';
const nhan = (ma: string): string[] =>
  [...the(ma).querySelectorAll('[data-nhan]')].map((e) => e.getAttribute('data-nhan') ?? '');
const soChon = (): string | null => document.querySelector('[data-o="so-chon"]')?.textContent ?? null;
const daChon = (): string[] =>
  [...document.querySelectorAll<HTMLInputElement>('[data-chon-the]')]
    .filter((o) => o.checked)
    .map((o) => o.getAttribute('data-chon-the') ?? '');
const cauToast = (): string[] =>
  [...document.querySelectorAll('[data-toast="loi"] span')].map((e) => e.textContent ?? '');
const phim = (key: string, them: Record<string, unknown> = {}): boolean =>
  fireEvent.keyDown(document.body, { key, ...them });
const oLo = <T extends HTMLElement>(o: string): T =>
  document.querySelector<T>(`[data-lo="${o}"]`)!;
/**
 * Đổi ô của thanh chọn nhiều rồi **bấm nút "Áp"** cạnh ô — đường duy nhất gửi
 * request (BAT-39, #164). `change` / `Enter` trên ô không áp.
 */
function chonVaAp(o: 'trang-thai' | 'uu-tien' | 'nhan', v: string): void {
  fireEvent.change(oLo(o), { target: { value: v } });
  bamAp(o);
}
const bamAp = (o: 'trang-thai' | 'uu-tien' | 'nhan'): void => {
  fireEvent.click(document.querySelector(`[data-nut="ap-${o}"]`)!);
};
const ghiCua = (g: Goi[], loai: string): string[] => g.filter((x) => x.loai === loai).map((x) => x.id);
const hop = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-o="hop-giao-viec"]');

async function moTrang(
  items: TicketDong[] = ba(),
  xem: 'bang' | 'danh-sach' = 'bang',
): Promise<ReturnType<typeof may>> {
  const r = may(items);
  dung(<TrangDanhSachTicket />, `/ticket?xem=${xem}&the=${items[0]?.ma ?? ''}`);
  await waitFor(() => {
    expect(
      document.querySelector(`[${xem === 'bang' ? 'data-the-ticket' : 'data-ticket'}="${items[0]?.ma ?? ''}"]`),
    ).not.toBeNull();
  });
  return r;
}

/** `X`, rồi (`J`, `X`) × (n − 1): chọn n thẻ đầu. */
function chonDau(n: number): void {
  phim('x');
  for (let i = 1; i < n; i++) {
    phim('j');
    phim('x');
  }
}

/** Chặn lượt đọc danh sách để đo hoàn lại ĐÚNG của mã (không nhờ lượt tải lại). */
function chanGet(kho: ReturnType<typeof may>['kho']): () => void {
  const c = cuaTreo();
  kho.choGet = c.cho;
  return () => {
    kho.choGet = null;
    c.mo();
  };
}

/* ================================================================== *
 * 0. Hàm thuần
 * ================================================================== */

describe('hàm thuần của chọn nhiều', () => {
  it('tomTatLoiLo: "k/n thẻ lỗi: MÃ — câu; MÃ — câu", câu dài bị cắt gọn', () => {
    expect(tomTatLoiLo(5, [{ ma: 'BAT-3', cau: 'A.' }, { ma: 'BAT-7', cau: 'B.' }])).toBe(
      '2/5 thẻ lỗi: BAT-3 — A.; BAT-7 — B.',
    );
    const dai = 'x'.repeat(300);
    expect(catGon(dai).length).toBe(120);
    expect(catGon(dai).endsWith('…')).toBe(true);
    expect(catGon('ngắn')).toBe('ngắn');
  });

  it('dichNhanLo: mọi thẻ đã có ⇒ bỏ ở tất cả; ngược lại ⇒ gắn cho thẻ chưa có, thẻ đã có không gửi', () => {
    const a = { id: 'a', ma: 'A-1', nhan: ['ui'] };
    const b = { id: 'b', ma: 'A-2', nhan: [] as string[] };
    expect(dichNhanLo([a, b], ' ui ')).toEqual([null, { ticket_id: 'b', ma: 'A-2', nhan: 'ui', gan: true }]);
    expect(dichNhanLo([a, { ...b, nhan: ['ui'] }], 'ui')).toEqual([
      { ticket_id: 'a', ma: 'A-1', nhan: 'ui', gan: false },
      { ticket_id: 'b', ma: 'A-2', nhan: 'ui', gan: false },
    ]);
    expect(dichNhanLo([a, b], '  ')).toEqual([null, null]);
  });

  it('moTaNhanLo: nói rõ GẮN hay BỎ, cùng luật dichNhanLo (câu 67, 70)', () => {
    const a = { id: 'a', ma: 'A-1', nhan: ['ui'] };
    const b = { id: 'b', ma: 'A-2', nhan: [] as string[] };
    expect(moTaNhanLo([a, { ...b, nhan: ['ui'] }], ' ui ')).toBe('Bỏ nhãn "ui" khỏi 2 thẻ');
    expect(moTaNhanLo([a, b], 'ui')).toBe('Gắn nhãn "ui" cho 1 thẻ (1 thẻ đã có, không đổi)');
    expect(moTaNhanLo([b, { ...b, id: 'c', ma: 'A-3' }], 'ui')).toBe('Gắn nhãn "ui" cho 2 thẻ');
  });

  it('taoHangGioiHan(2): tối đa 2 việc cùng lúc, việc thứ 3 chờ chỗ trống', async () => {
    const h = taoHangGioiHan(2);
    const cua = [cuaTreo(), cuaTreo(), cuaTreo()];
    let dang = 0;
    let dinh = 0;
    const p = cua.map((c) =>
      h.chay(async () => {
        dang += 1;
        dinh = Math.max(dinh, dang);
        await c.cho;
        dang -= 1;
      }),
    );
    await doi(0);
    expect(dang).toBe(2);
    cua[0]?.mo();
    await doi(0);
    expect(dang).toBe(2);
    cua[1]?.mo();
    cua[2]?.mo();
    await Promise.all(p);
    expect(dinh).toBe(2);
  });
});

/* ================================================================== *
 * 1. Phím X, Esc, số đếm, dấu chọn
 * ================================================================== */

describe('`X` chọn / bỏ chọn, `Esc` bỏ hết (d.416)', () => {
  it('X bật/tắt thẻ đang focus; số đếm đúng; thẻ có dấu + checkbox có nhãn; Esc bỏ hết rồi Esc nữa mới đóng panel', async () => {
    await moTrang();
    expect(soChon()).toBeNull();
    expect(phim('x')).toBe(false);
    expect(soChon()).toBe(nhanSoChon(1));
    expect(the('SAI-1').getAttribute('data-da-chon')).toBe('co');
    const o = document.querySelector<HTMLInputElement>('[data-chon-the="SAI-1"]')!;
    expect(o.checked).toBe(true);
    expect(o.getAttribute('aria-label')).toBe('Chọn SAI-1');
    phim('j');
    phim('x');
    expect(soChon()).toBe('2 thẻ đã chọn · Esc bỏ chọn');
    expect(daChon()).toEqual(['SAI-1', 'SAI-2']);
    // X lần hai trên cùng thẻ ⇒ bỏ chọn.
    phim('x');
    expect(daChon()).toEqual(['SAI-1']);
    expect(the('SAI-2').getAttribute('data-da-chon')).toBe('khong');
    phim('x');
    phim('j');
    phim('x');
    expect(daChon()).toEqual(['SAI-1', 'SAI-2', 'SAI-3']);

    expect(phim('Escape')).toBe(false);
    expect(soChon()).toBeNull();
    expect(daChon()).toEqual([]);
    // Panel vẫn mở: Esc đầu là "bỏ chọn", Esc sau mới đóng panel.
    expect(document.querySelector('[data-o="panel-the"]')).not.toBeNull();
    phim('Escape');
    expect(document.querySelector('[data-o="panel-the"]')).toBeNull();
  });

  it('bấm checkbox cũng chọn được (chuột)', async () => {
    await moTrang();
    fireEvent.click(document.querySelector('[data-chon-the="SAI-3"]')!);
    expect(daChon()).toEqual(['SAI-3']);
  });

  it('KHÔNG bắt X: đang gõ (input/textarea/contenteditable), IME, phím bổ trợ, hộp/menu khác đang mở', async () => {
    await moTrang();
    const o = document.createElement('input');
    const vb = document.createElement('textarea');
    const vung = document.createElement('div');
    vung.setAttribute('contenteditable', 'true');
    document.body.append(o, vb, vung);
    try {
      expect(fireEvent.keyDown(o, { key: 'x' })).toBe(true);
      expect(fireEvent.keyDown(vb, { key: 'x' })).toBe(true);
      expect(fireEvent.keyDown(vung, { key: 'x' })).toBe(true);
    } finally {
      o.remove();
      vb.remove();
      vung.remove();
    }
    expect(phim('x', { isComposing: true })).toBe(true);
    expect(phim('x', { keyCode: 229 })).toBe(true);
    expect(phim('x', { ctrlKey: true })).toBe(true);
    expect(phim('x', { metaKey: true })).toBe(true);
    expect(phim('x', { altKey: true })).toBe(true);
    for (const d of ['hop-tao-viec', 'bang-phim', 'hop-giao-viec', 'command-menu']) {
      const gia = document.createElement('div');
      gia.setAttribute('data-o', d);
      document.body.appendChild(gia);
      try {
        expect(phim('x'), d).toBe(true);
      } finally {
        gia.remove();
      }
    }
    expect(soChon()).toBeNull();
    // Đối chứng: X trần thì có chọn.
    expect(phim('x')).toBe(false);
    expect(soChon()).toBe(nhanSoChon(1));
  });

  it('đổi bộ lọc (tab nhanh) ⇒ tập chọn rỗng; quay lại tab cũ ⇒ KHÔNG sống lại', async () => {
    await moTrang();
    chonDau(2);
    expect(soChon()).toBe(nhanSoChon(2));
    fireEvent.click(document.querySelector('[data-nhanh="active"]')!);
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    fireEvent.click(document.querySelector('[data-nhanh="all"]')!);
    await waitFor(() => {
      expect(document.querySelector('[data-the-ticket="SAI-1"]')).not.toBeNull();
    });
    expect(soChon()).toBeNull();
    expect(daChon()).toEqual([]);
  });

  it('không có thẻ chọn ⇒ S hành vi cũ: mở panel thẻ đang focus, focus ô trạng thái của panel', async () => {
    await moTrang();
    phim('s');
    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-trang-thai-panel="SAI-1"]'));
    });
    expect(document.querySelector('[data-o="thanh-chon-nhieu"]')).toBeNull();
  });
});

/* ================================================================== *
 * 2. S / P / L cho nhiều thẻ — lạc quan từng thẻ, hoàn đúng thẻ lỗi
 * ================================================================== */

describe('S nhiều thẻ: lạc quan từng thẻ, máy chủ từ chối thẻ giữa ⇒ hoàn ĐÚNG thẻ đó', () => {
  it('3 thẻ, SAI-2 bị từ chối ⇒ SAI-2 về todo, SAI-1/3 giữ in_progress; một toast "1/3 thẻ lỗi"; còn chọn đúng SAI-2', async () => {
    const { kho, ghi } = await moTrang();
    kho.tra.set('trang-thai tk-SAI-2', { loi: { error: 'EVIDENCE_REQUIRED', message: 'Thiếu bằng chứng.' } });
    const c = cuaTreo();
    kho.cho = c.cho;
    chonDau(3);
    phim('s');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('trang-thai'));
    });
    chonVaAp('trang-thai', 'in_progress');
    // Hiện NGAY trên cả ba thẻ, trước khi máy chủ trả lời (d.418).
    await waitFor(() => {
      expect(['SAI-1', 'SAI-2', 'SAI-3'].map(trangThai)).toEqual(['in_progress', 'in_progress', 'in_progress']);
    });
    const mo_get = chanGet(kho);
    c.mo();
    await waitFor(() => {
      expect(cauToast()).toEqual(['1/3 thẻ lỗi: SAI-2 — Thiếu bằng chứng.']);
    });
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(trangThai)).toEqual(['in_progress', 'todo', 'in_progress']);
    expect(daChon()).toEqual(['SAI-2']);
    expect(soChon()).toBe(nhanSoChon(1));
    expect(ghiCua(ghi, 'trang-thai')).toEqual(['tk-SAI-1', 'tk-SAI-2', 'tk-SAI-3']);
    expect(ghi.every((g) => (g.than as { trang_thai: string }).trang_thai === 'in_progress')).toBe(true);
    mo_get();
  });

  it('tất cả thành công ⇒ không toast, tập chọn rỗng, thanh chọn biến mất', async () => {
    const { ghi } = await moTrang();
    chonDau(3);
    phim('s');
    chonVaAp('trang-thai', 'done');
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(cauToast()).toEqual([]);
    expect(ghiCua(ghi, 'trang-thai')).toHaveLength(3);
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(trangThai)).toEqual(['done', 'done', 'done']);
  });

  it('thẻ đã ở trạng thái đích ⇒ không gửi cho thẻ đó (tính là xong)', async () => {
    const { ghi } = await moTrang([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2', trang_thai: 'in_progress' })]);
    chonDau(2);
    phim('s');
    chonVaAp('trang-thai', 'in_progress');
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(ghiCua(ghi, 'trang-thai')).toEqual(['tk-SAI-1']);
  });

  it('một thẻ HẾT HẠN CHỜ ⇒ tính là lỗi của thẻ đó: hoàn đúng thẻ, toast có câu hết hạn', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { kho, ghi } = await moTrang();
    kho.tra.set('trang-thai tk-SAI-3', { treo: true });
    chonDau(3);
    phim('s');
    chonVaAp('trang-thai', 'in_progress');
    await waitFor(() => {
      expect(trangThai('SAI-3')).toBe('in_progress');
    });
    const mo_get = chanGet(kho);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HAN_CHO_API_MS + 10);
    });
    await waitFor(() => {
      expect(cauToast()).toEqual([`1/3 thẻ lỗi: SAI-3 — ${cauHetHanCho(HAN_CHO_API_MS, 'POST')}`]);
    });
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(trangThai)).toEqual(['in_progress', 'in_progress', 'todo']);
    expect(daChon()).toEqual(['SAI-3']);
    // Thanh mở lại: lượt sau gửi được — khoá một lượt (`useMotLan`) đã nhả, không chỉ ô bật lại.
    expect(oLo<HTMLSelectElement>('trang-thai').disabled).toBe(false);
    kho.tra.delete('trang-thai tk-SAI-3');
    chonVaAp('trang-thai', 'done');
    await waitFor(() => {
      expect(ghiCua(ghi, 'trang-thai')).toEqual(['tk-SAI-1', 'tk-SAI-2', 'tk-SAI-3', 'tk-SAI-3']);
    });
    mo_get();
  });
});

describe('P nhiều thẻ', () => {
  it('3 thẻ → Cao, SAI-3 bị từ chối ⇒ SAI-3 về "none", hai thẻ kia giữ "high"; toast 1/3; còn chọn SAI-3', async () => {
    const { kho, ghi } = await moTrang();
    kho.tra.set('sua tk-SAI-3', { loi: { error: 'INVALID_INPUT', message: 'Ưu tiên không hợp lệ.' } });
    const c = cuaTreo();
    kho.cho = c.cho;
    chonDau(3);
    phim('p');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('uu-tien'));
    });
    chonVaAp('uu-tien', 'high');
    await waitFor(() => {
      expect(['SAI-1', 'SAI-2', 'SAI-3'].map(uuTien)).toEqual(['high', 'high', 'high']);
    });
    const mo_get = chanGet(kho);
    c.mo();
    await waitFor(() => {
      expect(cauToast()).toEqual(['1/3 thẻ lỗi: SAI-3 — Ưu tiên không hợp lệ.']);
    });
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(uuTien)).toEqual(['high', 'high', 'none']);
    expect(daChon()).toEqual(['SAI-3']);
    expect(ghi.filter((g) => g.method === 'PATCH').map((g) => [g.id, g.than])).toEqual([
      ['tk-SAI-1', { uu_tien: 'high' }],
      ['tk-SAI-2', { uu_tien: 'high' }],
      ['tk-SAI-3', { uu_tien: 'high' }],
    ]);
    mo_get();
  });
});

describe('L nhiều thẻ — luật gắn/bỏ (#156)', () => {
  it('chưa phải mọi thẻ có nhãn ⇒ GẮN cho thẻ chưa có (thẻ đã có: 0 request); SAI-3 lỗi ⇒ hoàn đúng SAI-3', async () => {
    const { kho, ghi } = await moTrang([
      dong({ ma: 'SAI-1', nhan: ['ui'] }),
      dong({ ma: 'SAI-2' }),
      dong({ ma: 'SAI-3' }),
    ]);
    kho.tra.set('nhan tk-SAI-3', { loi: { error: 'INVALID_INPUT', message: 'Nhãn quá dài.' } });
    const c = cuaTreo();
    kho.cho = c.cho;
    chonDau(3);
    phim('l');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('nhan'));
    });
    chonVaAp('nhan', 'ui');
    await waitFor(() => {
      expect(['SAI-1', 'SAI-2', 'SAI-3'].map(nhan)).toEqual([['ui'], ['ui'], ['ui']]);
    });
    const mo_get = chanGet(kho);
    c.mo();
    await waitFor(() => {
      expect(cauToast()).toEqual(['1/3 thẻ lỗi: SAI-3 — Nhãn quá dài.']);
    });
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(nhan)).toEqual([['ui'], ['ui'], []]);
    expect(ghi.filter((g) => g.loai === 'nhan').map((g) => [g.id, g.than])).toEqual([
      ['tk-SAI-2', { nhan: 'ui', gan: true }],
      ['tk-SAI-3', { nhan: 'ui', gan: true }],
    ]);
    expect(daChon()).toEqual(['SAI-3']);
    mo_get();
  });

  it('mọi thẻ đã có nhãn ⇒ BỎ ở tất cả (3 request gan:false), xong hết ⇒ bỏ chọn', async () => {
    const { ghi } = await moTrang([
      dong({ ma: 'SAI-1', nhan: ['ui'] }),
      dong({ ma: 'SAI-2', nhan: ['ui', 'be'] }),
      dong({ ma: 'SAI-3', nhan: ['ui'] }),
    ]);
    chonDau(3);
    phim('l');
    chonVaAp('nhan', 'ui');
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(ghi.filter((g) => g.loai === 'nhan').map((g) => [g.id, g.than])).toEqual([
      ['tk-SAI-1', { nhan: 'ui', gan: false }],
      ['tk-SAI-2', { nhan: 'ui', gan: false }],
      ['tk-SAI-3', { nhan: 'ui', gan: false }],
    ]);
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(nhan)).toEqual([[], ['be'], []]);
    expect(cauToast()).toEqual([]);
  });
});

/* ================================================================== *
 * 3. Không gửi trùng, id trong biến, giới hạn song song, làm mới nền
 * ================================================================== */

describe('một lượt — không gửi trùng, id chụp lúc bấm', () => {
  it('đổi ô trạng thái HAI lần liền khi lượt đầu còn bay ⇒ mỗi thẻ đúng 1 request (của lần đầu)', async () => {
    const { kho, ghi } = await moTrang();
    const c = cuaTreo();
    kho.cho = c.cho;
    chonDau(3);
    phim('s');
    chonVaAp('trang-thai', 'in_progress');
    chonVaAp('trang-thai', 'done');
    await doi(20);
    c.mo();
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    await doi(20);
    expect(ghiCua(ghi, 'trang-thai')).toEqual(['tk-SAI-1', 'tk-SAI-2', 'tk-SAI-3']);
    expect(ghi.map((g) => (g.than as { trang_thai: string }).trang_thai)).toEqual([
      'in_progress',
      'in_progress',
      'in_progress',
    ]);
  });

  it('bấm "Áp" nhãn hai lần (cùng nhịp) ⇒ mỗi thẻ đúng 1 request', async () => {
    const { kho, ghi } = await moTrang();
    const c = cuaTreo();
    kho.cho = c.cho;
    chonDau(3);
    phim('l');
    chonVaAp('nhan', 'ui');
    fireEvent.change(oLo('nhan'), { target: { value: 'be' } });
    // Nút đã khoá khi lượt đầu còn bay; gọi click thẳng vẫn không gửi lượt hai.
    bamAp('nhan');
    c.mo();
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    await doi(20);
    expect(ghi.filter((g) => g.loai === 'nhan').map((g) => [g.id, (g.than as { nhan: string }).nhan])).toEqual([
      ['tk-SAI-1', 'ui'],
      ['tk-SAI-2', 'ui'],
      ['tk-SAI-3', 'ui'],
    ]);
  });

  it('5 thẻ: tối đa 4 request cùng lúc; đổi focus + đổi tập chọn trong lúc bay ⇒ request vẫn đúng 5 id đã chọn lúc bấm', async () => {
    const items = [1, 2, 3, 4, 5, 6].map((i) => dong({ ma: `SAI-${String(i)}` }));
    const { kho, ghi } = await moTrang(items);
    const c = cuaTreo();
    kho.cho = c.cho;
    chonDau(5);
    phim('s');
    chonVaAp('trang-thai', 'in_progress');
    await waitFor(() => {
      expect(ghiCua(ghi, 'trang-thai')).toHaveLength(4);
    });
    await doi(20);
    expect(ghiCua(ghi, 'trang-thai')).toHaveLength(4);
    // Trong lúc bay: rời ô, bỏ chọn hết, đổi focus (K), chọn SAI-6 (chuột).
    (document.activeElement as HTMLElement).blur();
    phim('Escape');
    expect(soChon()).toBeNull();
    phim('k');
    fireEvent.click(document.querySelector('[data-chon-the="SAI-6"]')!);
    expect(daChon()).toEqual(['SAI-6']);
    c.mo();
    await waitFor(() => {
      expect(ghiCua(ghi, 'trang-thai')).toHaveLength(5);
    });
    await doi(20);
    expect(ghiCua(ghi, 'trang-thai')).toEqual(['tk-SAI-1', 'tk-SAI-2', 'tk-SAI-3', 'tk-SAI-4', 'tk-SAI-5']);
    // Thẻ chọn sau (SAI-6) không bị áp, vẫn còn chọn.
    expect(trangThai('SAI-6')).toBe('todo');
    expect(daChon()).toEqual(['SAI-6']);
  });

  it('nhịp làm mới + quay lại tab trong lúc S nhiều thẻ còn bay ⇒ KHÔNG GET danh sách, giá trị lạc quan không bị đè', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { kho, soGetDs } = await moTrang();
    const c = cuaTreo();
    kho.cho = c.cho;
    chonDau(3);
    phim('s');
    chonVaAp('trang-thai', 'in_progress');
    await waitFor(() => {
      expect(['SAI-1', 'SAI-2', 'SAI-3'].map(trangThai)).toEqual(['in_progress', 'in_progress', 'in_progress']);
    });
    const n = soGetDs();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS * 3 + 50);
    });
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(soGetDs()).toBe(n);
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(trangThai)).toEqual(['in_progress', 'in_progress', 'in_progress']);
    c.mo();
    await waitFor(() => {
      expect(soGetDs()).toBeGreaterThan(n);
    });
  });
});

/* ================================================================== *
 * 3b. Thanh chọn nhiều: xác nhận mới áp, Esc, focus, checkbox, aria-live
 * ================================================================== */

describe('thanh chọn nhiều — xác nhận, Esc, focus, ô tick, aria-live (sửa theo reviewer)', () => {
  it('đổi ô chọn (change — như ↑/↓ trên ô đóng) mà CHƯA bấm Áp ⇒ 0 request, thẻ không đổi; nút "Áp" mới áp, chỉ ô đó; focus về danh sách', async () => {
    const { ghi } = await moTrang();
    chonDau(3);
    expect(document.querySelector<HTMLButtonElement>('[data-nut="ap-trang-thai"]')!.disabled).toBe(true);
    phim('s');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('trang-thai'));
    });
    fireEvent.keyDown(oLo('trang-thai'), { key: 'ArrowDown' });
    fireEvent.change(oLo('trang-thai'), { target: { value: 'in_progress' } });
    fireEvent.change(oLo('trang-thai'), { target: { value: 'done' } });
    fireEvent.change(oLo('uu-tien'), { target: { value: 'high' } });
    await doi(30);
    expect(ghi).toEqual([]);
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(trangThai)).toEqual(['todo', 'todo', 'todo']);
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(uuTien)).toEqual(['none', 'none', 'none']);
    expect(oLo<HTMLSelectElement>('trang-thai').value).toBe('done');
    expect(document.querySelector<HTMLButtonElement>('[data-nut="ap-trang-thai"]')!.disabled).toBe(false);
    // Bấm "Áp" của ô trạng thái: áp đúng giá trị chờ cuối; ô ưu tiên (chưa bấm Áp) không gửi.
    bamAp('trang-thai');
    // Focus về danh sách ngay (nút "Mở" của thẻ đang focus), không rơi về body.
    expect(document.activeElement).toBe(document.querySelector('[data-mo-the="SAI-3"]'));
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(ghiCua(ghi, 'trang-thai')).toEqual(['tk-SAI-1', 'tk-SAI-2', 'tk-SAI-3']);
    expect(ghi.every((g) => (g.than as { trang_thai: string }).trang_thai === 'done')).toBe(true);
    expect(ghiCua(ghi, 'sua')).toEqual([]);
  });

  it('Esc khi focus ở ô của thanh (nhãn, trạng thái) ⇒ bỏ chọn hết, focus về danh sách, panel còn mở, 0 request', async () => {
    const { ghi } = await moTrang();
    chonDau(2);
    phim('l');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('nhan'));
    });
    fireEvent.change(oLo('nhan'), { target: { value: 'ui' } });
    expect(fireEvent.keyDown(oLo('nhan'), { key: 'Escape' })).toBe(false);
    expect(soChon()).toBeNull();
    expect(daChon()).toEqual([]);
    expect(document.activeElement).toBe(document.querySelector('[data-mo-the="SAI-2"]'));
    expect(document.querySelector('[data-o="panel-the"]')).not.toBeNull();
    // Từ ô trạng thái (giá trị chờ chưa xác nhận) cũng vậy.
    phim('x');
    phim('s');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('trang-thai'));
    });
    fireEvent.change(oLo('trang-thai'), { target: { value: 'done' } });
    fireEvent.keyDown(oLo('trang-thai'), { key: 'Escape' });
    expect(soChon()).toBeNull();
    await doi(20);
    expect(ghi).toEqual([]);
  });

  it('focus ở checkbox chọn thẻ (sau khi bấm chuột) ⇒ phím danh sách vẫn chạy: X, S, Esc', async () => {
    await moTrang();
    const o = document.querySelector<HTMLInputElement>('[data-chon-the="SAI-2"]')!;
    fireEvent.click(o);
    o.focus();
    expect(daChon()).toEqual(['SAI-2']);
    // BAT-36: bấm ô tick đã đặt SAI-2 làm thẻ focus ⇒ X trên checkbox tắt SAI-2.
    expect(fireEvent.keyDown(o, { key: 'x' })).toBe(false);
    expect(daChon()).toEqual([]);
    expect(fireEvent.keyDown(o, { key: 'x' })).toBe(false);
    expect(daChon()).toEqual(['SAI-2']);
    // J sang SAI-3 rồi X: bật thêm SAI-3.
    fireEvent.keyDown(o, { key: 'j' });
    fireEvent.keyDown(o, { key: 'x' });
    expect(daChon()).toEqual(['SAI-2', 'SAI-3']);
    fireEvent.keyDown(o, { key: 'k' });
    fireEvent.keyDown(o, { key: 'x' });
    expect(daChon()).toEqual(['SAI-3']);
    fireEvent.keyDown(o, { key: 'k' });
    fireEvent.keyDown(o, { key: 'x' });
    expect(daChon()).toEqual(['SAI-1', 'SAI-3']);
    fireEvent.keyDown(o, { key: 's' });
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('trang-thai'));
    });
    o.focus();
    expect(fireEvent.keyDown(o, { key: 'Escape' })).toBe(false);
    expect(soChon()).toBeNull();
    expect(daChon()).toEqual([]);
  });

  for (const [xem, thuoc_tinh] of [
    ['bang', 'data-the-ticket'],
    ['danh-sach', 'data-ticket'],
  ] as const) {
    it(`BAT-36 xem=${xem}: focus ở SAI-1, bấm chuột ô tick SAI-2 ⇒ SAI-2 là thẻ focus (có dấu focus, SAI-1 mất); X kế tiếp tác động SAI-2, không phải SAI-1`, async () => {
      await moTrang(ba(), xem);
      const dauFocus = (): string[] =>
        [...document.querySelectorAll(`[${thuoc_tinh}][data-chon="co"]`)].map(
          (e) => e.getAttribute(thuoc_tinh) ?? '',
        );
      expect(dauFocus()).toEqual(['SAI-1']);
      const o = document.querySelector<HTMLInputElement>('[data-chon-the="SAI-2"]')!;
      fireEvent.click(o);
      o.focus();
      expect(dauFocus()).toEqual(['SAI-2']);
      expect(daChon()).toEqual(['SAI-2']);
      // X: tác động thẻ vừa bấm (tắt SAI-2), SAI-1 không bị chọn.
      phim('x');
      expect(daChon()).toEqual([]);
      phim('x');
      expect(daChon()).toEqual(['SAI-2']);
      // Bấm ô tick SAI-3 rồi tắt bằng chuột lần nữa: vẫn là thẻ focus.
      fireEvent.click(document.querySelector('[data-chon-the="SAI-3"]')!);
      expect(dauFocus()).toEqual(['SAI-3']);
      expect(daChon()).toEqual(['SAI-2', 'SAI-3']);
    });
  }

  for (const xem of ['bang', 'danh-sach'] as const) {
    it(`BAT-36 khổ HẸP xem=${xem}: tick thẻ ⇒ KHÔNG mở panel (không dialog, nền không inert), thẻ được chọn đúng, tick được thẻ thứ hai và thanh chọn nhiều còn dùng được`, async () => {
      const goc = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
      Object.defineProperty(globalThis, 'matchMedia', {
        configurable: true,
        value: (q: string) => ({
          media: q,
          matches: q === TRUY_VAN_HEP,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }),
      });
      try {
        may(ba());
        dung(<TrangDanhSachTicket />, `/ticket?xem=${xem}`);
        await waitFor(() => {
          expect(document.querySelector('[data-chon-the="SAI-3"]')).not.toBeNull();
        });
        fireEvent.click(document.querySelector('[data-chon-the="SAI-1"]')!);
        expect(daChon()).toEqual(['SAI-1']);
        expect(document.querySelector('[data-o="panel-the"]')).toBeNull();
        expect(document.querySelector('[aria-modal="true"]')).toBeNull();
        expect(document.querySelector('[inert]')).toBeNull();
        fireEvent.click(document.querySelector('[data-chon-the="SAI-2"]')!);
        expect(daChon()).toEqual(['SAI-1', 'SAI-2']);
        expect(document.querySelector('[data-o="panel-the"]')).toBeNull();
        expect(document.querySelector('[inert]')).toBeNull();
        expect(soChon()).toBe(nhanSoChon(2));
      } finally {
        if (goc === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
        else Object.defineProperty(globalThis, 'matchMedia', goc);
      }
    });
  }

  it('vùng aria-live luôn có trong DOM (rỗng khi 0 thẻ), đọc số thẻ khi chọn', async () => {
    await moTrang();
    const loa = document.querySelector('[data-o="loa-chon"]');
    expect(loa).not.toBeNull();
    expect(loa!.getAttribute('aria-live')).toBe('polite');
    expect(loa!.textContent).toBe('');
    phim('x');
    expect(document.querySelector('[data-o="loa-chon"]')).toBe(loa);
    expect(loa!.textContent).toBe(nhanSoChon(1));
    // Không đọc hai lần: số đếm trên thanh không mang aria-live.
    expect(document.querySelector('[data-o="so-chon"]')!.hasAttribute('aria-live')).toBe(false);
    phim('Escape');
    expect(loa!.textContent).toBe('');
  });
});

/* ================================================================== *
 * 4. A nhiều thẻ — một hộp, gửi tuần tự, không lạc quan
 * ================================================================== */

describe('A nhiều thẻ: MỘT hộp, giao tuần tự từng thẻ, không lạc quan', () => {
  async function moHopLo(): Promise<ReturnType<typeof may>> {
    const r = await moTrang();
    chonDau(3);
    phim('a');
    await waitFor(() => {
      expect(hop()).not.toBeNull();
    });
    await waitFor(() => {
      expect(hop()!.querySelector<HTMLSelectElement>('[data-nhap="agent"]')!.options.length).toBe(3);
    });
    return r;
  }

  it('hộp mở MỘT lần, tiêu đề "Giao 3 thẻ"; gửi ⇒ đúng 3 POST tuần tự (đúng id + agent); SAI-2 lỗi ⇒ toast đúng thẻ, hộp giữ với SAI-2, còn chọn SAI-2', async () => {
    const { kho, ghi } = await moHopLo();
    expect(document.querySelectorAll('[data-o="hop-giao-viec"]')).toHaveLength(1);
    expect(hop()!.querySelector('h2')?.textContent).toBe('Giao 3 thẻ');
    expect(hop()!.querySelector('[data-o="the-giao"]')?.textContent).toBe('SAI-1, SAI-2, SAI-3');
    const LOI = 'Ticket đã có một lượt giao đang mở (SPEC mục 5).';
    kho.tra.set('luot-giao tk-SAI-2', { loi: { error: 'ASSIGNMENT_OPEN', message: LOI } });
    const c = cuaTreo();
    kho.cho = c.cho;
    fireEvent.change(hop()!.querySelector('[data-nhap="agent"]')!, { target: { value: 'ag-b' } });
    fireEvent.submit(hop()!.querySelector('form')!);
    await waitFor(() => {
      expect(ghiCua(ghi, 'luot-giao')).toEqual(['tk-SAI-1']);
    });
    await doi(20);
    // Tuần tự: thẻ 2 chưa gửi khi thẻ 1 chưa xong. Không lạc quan: thẻ không đổi.
    expect(ghiCua(ghi, 'luot-giao')).toEqual(['tk-SAI-1']);
    expect(['SAI-1', 'SAI-2', 'SAI-3'].map(trangThai)).toEqual(['todo', 'todo', 'todo']);
    c.mo();
    await waitFor(() => {
      expect(cauToast()).toEqual([`1/3 thẻ lỗi: SAI-2 — ${LOI}`]);
    });
    expect(ghi.filter((g) => g.loai === 'luot-giao').map((g) => [g.id, g.than])).toEqual([
      ['tk-SAI-1', { nguoi_nhan_agent_id: 'ag-b' }],
      ['tk-SAI-2', { nguoi_nhan_agent_id: 'ag-b' }],
      ['tk-SAI-3', { nguoi_nhan_agent_id: 'ag-b' }],
    ]);
    await waitFor(() => {
      expect(hop()!.querySelector('h2')?.textContent).toBe('Giao 1 thẻ');
    });
    expect(hop()!.querySelector('[data-o="the-giao"]')?.textContent).toBe('SAI-2');
    expect(hop()!.querySelector<HTMLSelectElement>('[data-nhap="agent"]')!.value).toBe('ag-b');
    expect(daChon()).toEqual(['SAI-2']);

    // Gửi lại cho đúng thẻ lỗi ⇒ 1 POST nữa; xong ⇒ hộp đóng, tập chọn rỗng.
    kho.tra.delete('luot-giao tk-SAI-2');
    fireEvent.submit(hop()!.querySelector('form')!);
    await waitFor(() => {
      expect(hop()).toBeNull();
    });
    expect(ghiCua(ghi, 'luot-giao')).toEqual(['tk-SAI-1', 'tk-SAI-2', 'tk-SAI-3', 'tk-SAI-2']);
    expect(soChon()).toBeNull();
    // Tập chọn rỗng rồi chọn lại: hộp KHÔNG tự mở lại.
    phim('x');
    await doi(10);
    expect(hop()).toBeNull();
  });

  it('Gửi hai lần / Enter hai lần cùng nhịp ⇒ mỗi thẻ đúng 1 POST', async () => {
    const { kho, ghi } = await moHopLo();
    const c = cuaTreo();
    kho.cho = c.cho;
    fireEvent.change(hop()!.querySelector('[data-nhap="agent"]')!, { target: { value: 'ag-a' } });
    const form = hop()!.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.click(hop()!.querySelector('[data-nut="gui-giao"]')!);
    c.mo();
    await waitFor(() => {
      expect(hop()).toBeNull();
    });
    await doi(20);
    expect(ghiCua(ghi, 'luot-giao')).toEqual(['tk-SAI-1', 'tk-SAI-2', 'tk-SAI-3']);
    expect(soChon()).toBeNull();
  });

  it('đổi tập chọn trong lúc lượt giao còn bay (bỏ chọn SAI-3 bằng chuột) ⇒ vẫn đúng 3 POST cho 3 thẻ đã chụp lúc bấm', async () => {
    const { kho, ghi } = await moHopLo();
    const c = cuaTreo();
    kho.cho = c.cho;
    fireEvent.change(hop()!.querySelector('[data-nhap="agent"]')!, { target: { value: 'ag-a' } });
    fireEvent.submit(hop()!.querySelector('form')!);
    await waitFor(() => {
      expect(ghiCua(ghi, 'luot-giao')).toEqual(['tk-SAI-1']);
    });
    fireEvent.click(document.querySelector('[data-chon-the="SAI-3"]')!);
    expect(daChon()).toEqual(['SAI-1', 'SAI-2']);
    c.mo();
    await waitFor(() => {
      expect(ghiCua(ghi, 'luot-giao')).toHaveLength(3);
    });
    await doi(20);
    expect(ghiCua(ghi, 'luot-giao')).toEqual(['tk-SAI-1', 'tk-SAI-2', 'tk-SAI-3']);
  });

  it('mất mạng: Gửi ⇒ chờ; Esc ⇒ HUỶ cả lượt (0 POST khi có mạng lại), toast huỷ, giữ chọn (BAT-34)', async () => {
    const { ghi } = await moHopLo();
    fireEvent.change(hop()!.querySelector('[data-nhap="agent"]')!, { target: { value: 'ag-a' } });
    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.submit(hop()!.querySelector('form')!);
    await waitFor(() => {
      expect(hop()!.querySelector('[data-o="cho-mang"]')).not.toBeNull();
    });
    fireEvent.keyDown(hop()!, { key: 'Escape' });
    expect(hop()).toBeNull();
    act(() => {
      onlineManager.setOnline(true);
    });
    await doi(50);
    expect(ghiCua(ghi, 'luot-giao')).toEqual([]);
    expect([...document.querySelectorAll('[data-toast="tin"] span')].map((e) => e.textContent)).toEqual([
      CAU_DA_HUY_GIAO,
    ]);
    expect(daChon()).toEqual(['SAI-1', 'SAI-2', 'SAI-3']);
  });

  it('không có thẻ chọn ⇒ A hành vi cũ: hộp của đúng thẻ đang focus', async () => {
    await moTrang();
    phim('a');
    await waitFor(() => {
      expect(hop()).not.toBeNull();
    });
    expect(hop()!.getAttribute('data-ma')).toBe('SAI-1');
    expect(hop()!.querySelector('h2')?.textContent).toMatch(/Giao việc\s*SAI-1/);
  });
});

/* ================================================================== *
 * 5. BAT-38 (#159, Chủ chốt T-38 = A): hỏi "Áp cho N thẻ?" khi N ≥ 10
 * ================================================================== */

describe('BAT-38 #159: N ≥ 10 thẻ ⇒ hỏi "Áp cho N thẻ?"; N < 10 áp luôn', () => {
  const nhieu = (n: number): TicketDong[] =>
    Array.from({ length: n }, (_, i) => dong({ ma: `SAI-${String(i + 1)}` }));
  const hopAp = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-o="hop-xac-nhan-ap"]');
  const idsSap = (g: Goi[], loai: string): string[] => ghiCua(g, loai).sort();
  const idsCua = (n: number): string[] => nhieu(n).map((t) => t.id).sort();

  it('hằng số: ngưỡng 10, câu hỏi tiếng Việt', () => {
    expect(NGUONG_HOI_AP).toBe(10);
    expect(canHoiAp(9)).toBe(false);
    expect(canHoiAp(10)).toBe(true);
    expect(cauHoiAp(12)).toBe('Áp cho 12 thẻ?');
  });

  it('N = 9 ⇒ KHÔNG hỏi, nút "Áp" áp luôn cho đủ 9 thẻ', async () => {
    const { ghi } = await moTrang(nhieu(9));
    chonDau(9);
    expect(soChon()).toBe(nhanSoChon(9));
    phim('s');
    chonVaAp('trang-thai', 'in_progress');
    expect(hopAp()).toBeNull();
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(idsSap(ghi, 'trang-thai')).toEqual(idsCua(9));
  });

  it('N = 10 trạng thái ⇒ hỏi trước (0 request, focus ở Huỷ); xác nhận ⇒ áp đủ 10, focus về danh sách', async () => {
    const { ghi } = await moTrang(nhieu(10));
    chonDau(10);
    phim('s');
    chonVaAp('trang-thai', 'done');
    expect(hopAp()).not.toBeNull();
    expect(hopAp()!.getAttribute('role')).toBe('dialog');
    expect(hopAp()!.getAttribute('aria-modal')).toBe('true');
    expect(hopAp()!.querySelector('h2')?.textContent).toBe(cauHoiAp(10));
    expect(document.activeElement).toBe(hopAp()!.querySelector('[data-nut="huy-ap"]'));
    // Phím danh sách không lọt qua hộp: X không bỏ chọn thẻ nào.
    phim('x');
    expect(soChon()).toBe(nhanSoChon(10));
    await doi(30);
    expect(ghi).toEqual([]);
    fireEvent.click(hopAp()!.querySelector('[data-nut="xac-nhan-ap"]')!);
    expect(hopAp()).toBeNull();
    expect(document.activeElement?.hasAttribute('data-mo-the')).toBe(true);
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(idsSap(ghi, 'trang-thai')).toEqual(idsCua(10));
    expect(ghi.every((g) => (g.than as { trang_thai: string }).trang_thai === 'done')).toBe(true);
  });

  it('N = 10 ưu tiên, bấm Huỷ ⇒ 0 request, giữ tập chọn và giá trị chờ; Áp lại + xác nhận ⇒ đủ 10', async () => {
    const { ghi } = await moTrang(nhieu(10));
    chonDau(10);
    phim('p');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('uu-tien'));
    });
    chonVaAp('uu-tien', 'high');
    expect(hopAp()).not.toBeNull();
    fireEvent.click(hopAp()!.querySelector('[data-nut="huy-ap"]')!);
    expect(hopAp()).toBeNull();
    // Focus về đúng chỗ đã mở hộp (ô ưu tiên của thanh).
    expect(document.activeElement).toBe(oLo('uu-tien'));
    await doi(30);
    expect(ghi).toEqual([]);
    expect(soChon()).toBe(nhanSoChon(10));
    expect(oLo<HTMLSelectElement>('uu-tien').value).toBe('high');
    expect(nhieu(10).map((t) => uuTien(t.ma)).every((u) => u === 'none')).toBe(true);
    fireEvent.click(document.querySelector('[data-nut="ap-uu-tien"]')!);
    fireEvent.click(hopAp()!.querySelector('[data-nut="xac-nhan-ap"]')!);
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(idsSap(ghi, 'sua')).toEqual(idsCua(10));
  });

  it('N = 10 nhãn, Esc trên hộp ⇒ huỷ (0 request, ô nhãn giữ chữ, vẫn chọn 10); Áp lại + xác nhận ⇒ gắn cho 10', async () => {
    const { ghi } = await moTrang(nhieu(10));
    chonDau(10);
    phim('l');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('nhan'));
    });
    chonVaAp('nhan', 'ui');
    expect(hopAp()).not.toBeNull();
    expect(hopAp()!.querySelector('[data-o="viec-ap"]')?.textContent).toBe('Gắn nhãn "ui" cho 10 thẻ');
    fireEvent.keyDown(hopAp()!, { key: 'Escape' });
    expect(hopAp()).toBeNull();
    expect(soChon()).toBe(nhanSoChon(10));
    expect(oLo<HTMLInputElement>('nhan').value).toBe('ui');
    await doi(30);
    expect(ghi).toEqual([]);
    bamAp('nhan');
    fireEvent.click(hopAp()!.querySelector('[data-nut="xac-nhan-ap"]')!);
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(idsSap(ghi, 'nhan')).toEqual(idsCua(10));
    expect(ghi.every((g) => (g.than as { gan: boolean }).gan)).toBe(true);
  });

  it('N = 10 nhãn, MỌI thẻ đã có ⇒ hộp nói "Bỏ nhãn … khỏi 10 thẻ"; xác nhận ⇒ 10 request gan:false', async () => {
    const ds = nhieu(10).map((t) => ({ ...t, nhan: ['ui'] }));
    const { ghi } = await moTrang(ds);
    chonDau(10);
    phim('l');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('nhan'));
    });
    chonVaAp('nhan', 'ui');
    expect(hopAp()!.querySelector('[data-o="viec-ap"]')?.textContent).toBe('Bỏ nhãn "ui" khỏi 10 thẻ');
    fireEvent.click(hopAp()!.querySelector('[data-nut="xac-nhan-ap"]')!);
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(idsSap(ghi, 'nhan')).toEqual(ds.map((t) => t.id).sort());
    expect(ghi.every((g) => !(g.than as { gan: boolean }).gan)).toBe(true);
  });

  it('N = 10 nhãn, 3 thẻ đã có ⇒ hộp nói "Gắn nhãn … cho 7 thẻ (3 thẻ đã có, không đổi)"; xác nhận ⇒ đúng 7 request gan:true', async () => {
    const ds = nhieu(10).map((t, i) => (i < 3 ? { ...t, nhan: ['ui'] } : t));
    const { ghi } = await moTrang(ds);
    chonDau(10);
    phim('l');
    await waitFor(() => {
      expect(document.activeElement).toBe(oLo('nhan'));
    });
    chonVaAp('nhan', 'ui');
    expect(hopAp()!.querySelector('[data-o="viec-ap"]')?.textContent).toBe(
      'Gắn nhãn "ui" cho 7 thẻ (3 thẻ đã có, không đổi)',
    );
    fireEvent.click(hopAp()!.querySelector('[data-nut="xac-nhan-ap"]')!);
    await waitFor(() => {
      expect(soChon()).toBeNull();
    });
    expect(idsSap(ghi, 'nhan')).toEqual(ds.slice(3).map((t) => t.id).sort());
    expect(ghi.every((g) => (g.than as { gan: boolean }).gan)).toBe(true);
  });

  it('N = 10 trạng thái, bấm NỀN ("Đóng hộp xác nhận áp") ⇒ huỷ: 0 request, giữ tập chọn và giá trị chờ', async () => {
    const { ghi } = await moTrang(nhieu(10));
    chonDau(10);
    phim('s');
    chonVaAp('trang-thai', 'done');
    expect(hopAp()).not.toBeNull();
    const nen = document.querySelector<HTMLElement>('[aria-label="Đóng hộp xác nhận áp"]');
    expect(nen).not.toBeNull();
    fireEvent.click(nen!);
    expect(hopAp()).toBeNull();
    await doi(30);
    expect(ghi).toEqual([]);
    expect(soChon()).toBe(nhanSoChon(10));
    expect(oLo<HTMLSelectElement>('trang-thai').value).toBe('done');
  });

  it('A với N = 10 ⇒ KHÔNG thêm bước hỏi: mở thẳng hộp "Giao 10 thẻ"', async () => {
    await moTrang(nhieu(10));
    chonDau(10);
    phim('a');
    await waitFor(() => {
      expect(hop()).not.toBeNull();
    });
    expect(hopAp()).toBeNull();
    expect(hop()!.querySelector('h2')?.textContent).toMatch(/Giao 10 thẻ/);
  });
});

/* ================================================================== *
 * 6. BAT-39 (CoS/Chủ chốt 20/10): ô của thanh CHỈ đặt giá trị chờ —
 *    Enter / mũi tên / Space / gõ chữ không gửi request; chỉ nút "Áp" mới áp.
 *    Lỗi thật 19/10: Enter đóng danh sách đã mở trên Chromium ⇒ áp cho 2 thẻ.
 * ================================================================== */

describe('BAT-39: Enter / mũi tên / Space / gõ chữ trong ô thanh chọn nhiều KHÔNG áp; chỉ nút "Áp"', () => {
  type ONhap = 'trang-thai' | 'uu-tien' | 'nhan';
  const nhieu = (n: number): TicketDong[] =>
    Array.from({ length: n }, (_, i) => dong({ ma: `SAI-${String(i + 1)}` }));
  const hopAp = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-o="hop-xac-nhan-ap"]');
  const nutAp = (o: ONhap): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>(`[data-nut="ap-${o}"]`)!;
  const LOAI: Record<ONhap, string> = { 'trang-thai': 'trang-thai', 'uu-tien': 'sua', nhan: 'nhan' };
  const GIA_TRI: Record<ONhap, string> = { 'trang-thai': 'in_progress', 'uu-tien': 'high', nhan: 'ui' };
  const PHIM_MO: Record<ONhap, string> = { 'trang-thai': 's', 'uu-tien': 'p', nhan: 'l' };

  /**
   * Đi đúng đường bàn phím của Chủ: focus ô, mũi tên xuống, (trình duyệt đổi giá
   * trị ⇒ `change`), Enter (đóng danh sách đã mở), Space. Ô nhãn: gõ chữ rồi Enter.
   */
  function doiBangPhim(o: ONhap): void {
    const el = oLo(o);
    el.focus();
    if (o === 'nhan') {
      fireEvent.keyDown(el, { key: 'u' });
      fireEvent.change(el, { target: { value: GIA_TRI[o] } });
    } else {
      fireEvent.keyDown(el, { key: 'ArrowDown' });
      fireEvent.change(el, { target: { value: GIA_TRI[o] } });
    }
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyUp(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: ' ' });
    fireEvent.keyDown(el, { key: 'Enter' });
  }

  for (const o of ['trang-thai', 'uu-tien', 'nhan'] as const) {
    it(`N = 2, ô ${o}: change ⇒ 0 request; phím (mũi tên/gõ chữ + Enter + Space) ⇒ 0 request, không mở thẻ; bấm "Áp" ⇒ đúng 2 request`, async () => {
      const { ghi } = await moTrang();
      chonDau(2);
      expect(nutAp(o).disabled).toBe(true);
      phim(PHIM_MO[o]);
      await waitFor(() => {
        expect(document.activeElement).toBe(oLo(o));
      });
      // Chuột / change một mình.
      fireEvent.change(oLo(o), { target: { value: GIA_TRI[o] } });
      await doi(30);
      expect(ghi).toEqual([]);
      // Bàn phím.
      doiBangPhim(o);
      await doi(30);
      expect(ghi).toEqual([]);
      expect(hopAp()).toBeNull();
      // Vẫn chọn 2 thẻ, focus vẫn ở ô, giá trị chờ còn nguyên, thẻ không đổi.
      expect(soChon()).toBe(nhanSoChon(2));
      expect(document.activeElement).toBe(oLo(o));
      expect(oLo<HTMLInputElement>(o).value).toBe(GIA_TRI[o]);
      expect(['SAI-1', 'SAI-2'].map(trangThai)).toEqual(['todo', 'todo']);
      expect(['SAI-1', 'SAI-2'].map(uuTien)).toEqual(['none', 'none']);
      expect(['SAI-1', 'SAI-2'].map(nhan)).toEqual([[], []]);
      // Chỉ nút "Áp" mới gửi — đúng 1 lượt: mỗi thẻ 1 request.
      expect(nutAp(o).disabled).toBe(false);
      fireEvent.click(nutAp(o));
      await waitFor(() => {
        expect(soChon()).toBeNull();
      });
      await doi(20);
      expect(ghi.map((g) => g.id)).toEqual(['tk-SAI-1', 'tk-SAI-2']);
      expect(ghi.every((g) => g.loai === LOAI[o])).toBe(true);
    });

    it(`N = 10, ô ${o}: phím ⇒ 0 request, KHÔNG mở hộp hỏi; "Áp" ⇒ hộp; xác nhận ⇒ đúng 10 request`, async () => {
      const { ghi } = await moTrang(nhieu(10));
      chonDau(10);
      phim(PHIM_MO[o]);
      await waitFor(() => {
        expect(document.activeElement).toBe(oLo(o));
      });
      doiBangPhim(o);
      await doi(30);
      expect(ghi).toEqual([]);
      expect(hopAp()).toBeNull();
      expect(soChon()).toBe(nhanSoChon(10));
      fireEvent.click(nutAp(o));
      expect(hopAp()).not.toBeNull();
      await doi(20);
      expect(ghi).toEqual([]);
      fireEvent.click(hopAp()!.querySelector('[data-nut="xac-nhan-ap"]')!);
      await waitFor(() => {
        expect(soChon()).toBeNull();
      });
      await doi(20);
      expect(ghiCua(ghi, LOAI[o]).sort()).toEqual(nhieu(10).map((t) => t.id).sort());
      expect(ghi).toHaveLength(10);
    });
  }

  it('SPEC mục 14 (chữ của SPEC, không gõ lại): ô chỉ đặt giá trị chờ; Enter/mũi tên/Space/gõ chữ không gửi; chỉ nút "Áp"', () => {
    expect(specDoiChiNutApChonNhieu()).toEqual({ chi_gia_tri_cho: true, enter_khong_gui: true, chi_nut_ap: true });
  });

  it('nút "Áp" nhãn: có aria-label, khoá khi nhãn rỗng sau trim', async () => {
    await moTrang();
    chonDau(2);
    const n = nutAp('nhan');
    expect(n).not.toBeNull();
    expect(n.getAttribute('aria-label')).toBe(NHAN_AP_NHAN);
    expect(n.disabled).toBe(true);
    fireEvent.change(oLo('nhan'), { target: { value: '   ' } });
    expect(n.disabled).toBe(true);
    fireEvent.change(oLo('nhan'), { target: { value: ' ui ' } });
    expect(n.disabled).toBe(false);
  });
});
