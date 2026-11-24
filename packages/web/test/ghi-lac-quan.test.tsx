/**
 * **BAT-27 — sổ đếm chung "ghi lạc quan đang bay" theo khoá query**
 * (`src/ghi-lac-quan.ts`, hai cổng ở `src/lam-moi.ts`).
 *
 * SPEC mục 14 d.418: sửa thì hiện **ngay**; máy chủ từ chối thì hoàn lại. Giữa lúc
 * mutation còn treo, một GET (nhịp `refetchInterval` hay "quay lại tab") trả dữ
 * liệu **trước** thao tác và đè giá trị lạc quan. S/P/L đã có cổng riêng (BAT-25/26,
 * `danh-sach-ticket.test.tsx`, `danh-sach-xem-them.test.tsx`); file này canh mọi
 * mutation lạc quan **khác**:
 *
 *   | nhóm                    | khoá ghi                                  | có nhịp |
 *   |-------------------------|-------------------------------------------|---------|
 *   | sửa tiêu đề (chi tiết)  | `['ticket','chi-tiet',ma]`                | có      |
 *   | Dừng phiên              | `['phien',id]`                            | có      |
 *   | Gửi (Cần Chủ)           | `['can-chu','man-hinh',loc]`, `…'da-xu-ly'`| có      |
 *   | công tắc thông báo      | `['cai-dat','thong-bao']`                 | KHÔNG   |
 *
 * Mỗi nhóm có nhịp: (a) mutation treo + tới nhịp ⇒ không GET, màn hình vẫn là bản
 * lạc quan; (b) mutation treo + quay lại tab ⇒ không GET; xong ⇒ làm mới lại bình
 * thường. Công tắc thông báo không có nhịp và không đăng ký `useNhipLamMoi` ⇒
 * chỉ (b), cộng một ca ghim nó **có** khai khoá vào sổ.
 *
 * Mọi máy chủ giả trả **bản cũ** cho GET trong lúc mutation treo — đúng ca thật
 * (máy chủ chưa ghi xong), và là thứ làm một lượt GET lọt cổng **thấy được** trên
 * màn hình chứ không chỉ trong bộ đếm.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, type JSX } from 'react';
import { QueryClient, hashKey, type QueryKey } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import {
  batDauGhiLacQuan,
  dangGhiLacQuan,
  henXaHoan,
  ketThucGhiLacQuan,
  khoaDangHoan,
  lamMoiTheoSo,
} from '../src/ghi-lac-quan';
import { batDauSua, ketThucSua, khoaBiSuaChan } from '../src/so-dem-sua';
import { nhipLamMoi } from '../src/lam-moi';
import { TrangChiTietTicket } from '../src/trang/chi-tiet-ticket';
import { TrangPhien } from '../src/trang/phien';
import { KHOA_LOC, NHAN_GUI, TrangCanChu } from '../src/trang/can-chu';
import { KHOA_CAI_DAT_THONG_BAO, TrangCaiDat } from '../src/trang/cai-dat';
import { MayChuGia, dung } from './giup';
import { manHinhTicket, ticketDayDu } from './than-ticket';
import { manHinhPhien, phienDong } from './than-agent';
import { DA_XU_LY_RONG, DU_AN_RONG, manHinh, the } from './than-can-chu';

/* ------------------------------------------------------------------ *
 * Khung chung
 * ------------------------------------------------------------------ */

function datHienThi(v: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  datHienThi('visible');
  vi.useRealTimers();
});

/** Một cửa treo: mutation chờ tới khi `mo()`. */
function cuaTreo(): { cho: Promise<unknown>; mo: () => void } {
  let mo = (): void => undefined;
  const cho = new Promise<unknown>((r) => {
    mo = () => r(null);
  });
  return { cho, mo };
}

/** Cho ba chu kỳ nhịp trôi qua (fake timers). */
async function quaBaNhip(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS * 3 + 50);
  });
}

/** Quay lại tab rồi cho các lượt invalidate kịp chạy. */
async function quayLaiTab(): Promise<void> {
  await act(async () => {
    datHienThi('visible');
    await vi.advanceTimersByTimeAsync(10);
  });
}

/* ================================================================== *
 * 0. Sổ đếm — đơn vị
 * ================================================================== */

describe('sổ ghi lạc quan: đếm lồng nhau, vé trả một lần, khớp tiền tố hai chiều', () => {
  it('hai lần cộng cùng khoá ⇒ còn chặn tới khi CẢ HAI trả vé', () => {
    const qc = new QueryClient();
    const k = ['phien', 'ph-1'] as const;
    const v1 = batDauGhiLacQuan(qc, [k]);
    const v2 = batDauGhiLacQuan(qc, [k]);
    expect(dangGhiLacQuan(qc, k)).toBe(true);
    ketThucGhiLacQuan(qc, v1);
    expect(dangGhiLacQuan(qc, k)).toBe(true);
    ketThucGhiLacQuan(qc, v2);
    expect(dangGhiLacQuan(qc, k)).toBe(false);
  });

  it('trả một vé HAI lần chỉ trừ một lần (không mở cổng của mutation khác còn bay)', () => {
    const qc = new QueryClient();
    const k = ['phien', 'ph-1'] as const;
    const v1 = batDauGhiLacQuan(qc, [k]);
    batDauGhiLacQuan(qc, [k]);
    ketThucGhiLacQuan(qc, v1);
    ketThucGhiLacQuan(qc, v1);
    ketThucGhiLacQuan(qc, undefined);
    expect(dangGhiLacQuan(qc, k)).toBe(true);
  });

  it('vé mang ĐÚNG khoá đã cộng: khoá của trang đổi giữa chừng không làm kẹt khoá cũ', () => {
    const qc = new QueryClient();
    const cu = ['ticket', 'chi-tiet', 'SAI-1'] as const;
    const ve = batDauGhiLacQuan(qc, [cu]);
    // (trang chuyển sang SAI-2 trong lúc mutation treo — `onSettled` vẫn trả vé cũ)
    ketThucGhiLacQuan(qc, ve);
    expect(dangGhiLacQuan(qc, cu)).toBe(false);
  });

  it('khớp: trùng, cha, con ⇒ chặn; anh em và khoá khác ⇒ KHÔNG chặn', () => {
    const qc = new QueryClient();
    batDauGhiLacQuan(qc, [['can-chu', 'man-hinh', { muc: 'urgent', du_an: 'a' }]]);
    // trùng — object khác thứ tự trường vẫn là một khoá (hashKey)
    expect(dangGhiLacQuan(qc, ['can-chu', 'man-hinh', { du_an: 'a', muc: 'urgent' }])).toBe(true);
    expect(dangGhiLacQuan(qc, ['can-chu'])).toBe(true); // cha
    expect(dangGhiLacQuan(qc, ['can-chu', 'man-hinh', { muc: 'urgent', du_an: 'a' }, 2])).toBe(
      true,
    ); // con
    expect(dangGhiLacQuan(qc, ['can-chu', 'huy-hieu'])).toBe(false); // anh em
    expect(dangGhiLacQuan(qc, ['can-chu', 'man-hinh', { muc: 'today' }])).toBe(false);
    expect(dangGhiLacQuan(qc, ['tong-quan'])).toBe(false);
  });

  it('mỗi QueryClient một sổ', () => {
    const a = new QueryClient();
    const b = new QueryClient();
    batDauGhiLacQuan(a, [['phien', 'ph-1']]);
    expect(dangGhiLacQuan(b, ['phien', 'ph-1'])).toBe(false);
  });

  it('`nhipLamMoi(qc).refetchInterval` đọc sổ SỐNG: false khi khoá đang ghi, chu kỳ khi không', () => {
    const qc = new QueryClient();
    const { refetchInterval } = nhipLamMoi(qc);
    const k = ['phien', 'ph-1'] as const;
    expect(refetchInterval({ queryKey: k })).toBe(CHU_KY_LAM_MOI_MS);
    const ve = batDauGhiLacQuan(qc, [k]);
    expect(refetchInterval({ queryKey: k })).toBe(false);
    expect(refetchInterval({ queryKey: ['tong-quan'] })).toBe(CHU_KY_LAM_MOI_MS);
    ketThucGhiLacQuan(qc, ve);
    expect(refetchInterval({ queryKey: k })).toBe(CHU_KY_LAM_MOI_MS);
  });
});

/* ================================================================== *
 * 1. Sửa tiêu đề — chi tiết ticket
 * ================================================================== */

const MA = 'SAI-1';
const DUONG_MH = `/v1/man-hinh-ticket/ma/${MA}`;

function mayChiTiet(cho: Promise<unknown>): MayChuGia {
  return new MayChuGia()
    .dat('GET ' + DUONG_MH, { than: manHinhTicket(ticketDayDu({ ma: MA })) })
    .dat(`PATCH /v1/ticket/tk-${MA}`, { than: { ok: true }, cho })
    .gan();
}

async function suaTieuDe(u: ReturnType<typeof userEvent.setup>, moi: string): Promise<void> {
  await u.click(document.querySelector<HTMLButtonElement>('[data-nut="sua-tieu-de"]')!);
  const o = document.querySelector<HTMLInputElement>('[data-o-nhap="tieu-de"]')!;
  await u.clear(o);
  await u.type(o, moi);
  await u.click(document.querySelector<HTMLButtonElement>('[data-nut="luu-tieu-de"]')!);
  await waitFor(() => {
    expect(screen.getByText(moi)).toBeTruthy();
  });
}

describe('BAT-27 sửa tiêu đề treo: GET cũ không đè tiêu đề lạc quan', () => {
  async function dungChiTiet(): Promise<{ m: MayChuGia; mo: () => void; u: ReturnType<typeof userEvent.setup> }> {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { cho, mo } = cuaTreo();
    const m = mayChiTiet(cho);
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')).not.toBeNull();
    });
    return { m, mo, u };
  }

  it('(a) tới nhịp tự làm mới ⇒ KHÔNG GET, tiêu đề vẫn là bản lạc quan; xong ⇒ làm mới, nhịp chạy lại', async () => {
    const { m, mo, u } = await dungChiTiet();
    await suaTieuDe(u, 'Tiêu đề lạc quan');
    const n = m.soLan('GET', DUONG_MH);

    await quaBaNhip();
    expect(m.soLan('GET', DUONG_MH)).toBe(n);
    expect(screen.getByText('Tiêu đề lạc quan')).toBeTruthy();

    mo();
    await waitFor(() => {
      expect(m.soLan('GET', DUONG_MH)).toBe(n + 1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);
    });
    expect(m.soLan('GET', DUONG_MH)).toBeGreaterThan(n + 1);
  });

  it('(b) quay lại tab ⇒ KHÔNG GET khoá chi tiết; xong ⇒ quay lại tab làm mới bình thường', async () => {
    const { m, mo, u } = await dungChiTiet();
    await suaTieuDe(u, 'Tiêu đề lạc quan');
    const n = m.soLan('GET', DUONG_MH);

    await quayLaiTab();
    expect(m.soLan('GET', DUONG_MH)).toBe(n);
    expect(screen.getByText('Tiêu đề lạc quan')).toBeTruthy();

    mo();
    await waitFor(() => {
      expect(m.soLan('GET', DUONG_MH)).toBe(n + 1);
    });
    await quayLaiTab();
    expect(m.soLan('GET', DUONG_MH)).toBe(n + 2);
  });
});

/* ================================================================== *
 * 2. Dừng phiên
 * ================================================================== */

const DUONG_PHIEN = '/v1/man-hinh-phien/ph-1';

describe('BAT-27 Dừng phiên treo: GET cũ ("Đang chạy") không đè "Đang dừng"', () => {
  async function dungPhien(): Promise<{ m: MayChuGia; mo: () => void }> {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { cho, mo } = cuaTreo();
    const m = new MayChuGia()
      .dat('GET ' + DUONG_PHIEN, { than: manHinhPhien() })
      .dat('POST /v1/phien/ph-1/dung', { than: { ok: true }, cho })
      .gan();
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    const nut = await screen.findByRole('button', { name: 'Dừng' });
    fireEvent.click(nut);
    await waitFor(() => {
      expect(document.querySelector('[data-trang-thai="stopping"]')).not.toBeNull();
    });
    return { m, mo };
  }

  it('(a) tới nhịp ⇒ KHÔNG GET, vẫn "stopping"; xong ⇒ làm mới, nhịp chạy lại', async () => {
    const { m, mo } = await dungPhien();
    const n = m.soLan('GET', DUONG_PHIEN);

    await quaBaNhip();
    expect(m.soLan('GET', DUONG_PHIEN)).toBe(n);
    expect(document.querySelector('[data-trang-thai="stopping"]')).not.toBeNull();

    mo();
    await waitFor(() => {
      expect(m.soLan('GET', DUONG_PHIEN)).toBe(n + 1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);
    });
    expect(m.soLan('GET', DUONG_PHIEN)).toBeGreaterThan(n + 1);
  });

  it('(b) quay lại tab ⇒ KHÔNG GET; xong ⇒ quay lại tab làm mới bình thường', async () => {
    const { m, mo } = await dungPhien();
    const n = m.soLan('GET', DUONG_PHIEN);

    await quayLaiTab();
    expect(m.soLan('GET', DUONG_PHIEN)).toBe(n);
    expect(document.querySelector('[data-trang-thai="stopping"]')).not.toBeNull();

    mo();
    await waitFor(() => {
      expect(m.soLan('GET', DUONG_PHIEN)).toBe(n + 1);
    });
    await quayLaiTab();
    expect(m.soLan('GET', DUONG_PHIEN)).toBe(n + 2);
  });

  it('(c) máy chủ TỪ CHỐI (nhánh lỗi) ⇒ sổ cũng được trả: hoàn "running", nhịp và quay lại tab chạy lại', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { cho, mo } = cuaTreo();
    const CAU = 'Chỉ chủ bấm được Dừng.';
    const m = new MayChuGia()
      .dat('GET ' + DUONG_PHIEN, { than: manHinhPhien() })
      .dat('POST /v1/phien/ph-1/dung', { http: 403, loi: { error: 'FORBIDDEN', message: CAU }, cho })
      .gan();
    const { qc } = dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Dừng' }));
    await waitFor(() => {
      expect(document.querySelector('[data-trang-thai="stopping"]')).not.toBeNull();
    });
    expect(dangGhiLacQuan(qc, ['phien', 'ph-1'])).toBe(true);
    const n = m.soLan('GET', DUONG_PHIEN);

    mo();
    expect(await screen.findByText(CAU)).toBeTruthy();
    await waitFor(() => {
      expect(m.soLan('GET', DUONG_PHIEN)).toBe(n + 1);
    });
    expect(dangGhiLacQuan(qc, ['phien', 'ph-1'])).toBe(false);
    expect(document.querySelector('[data-trang-thai="running"]')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);
    });
    expect(m.soLan('GET', DUONG_PHIEN)).toBeGreaterThan(n + 1);
  });

  it('(d) `onMutate` ném giữa chừng (cancelQueries lỗi) ⇒ nhánh catch trả vé: khoá không kẹt "đang ghi"', async () => {
    new MayChuGia()
      .dat('GET ' + DUONG_PHIEN, { than: manHinhPhien() })
      .dat('POST /v1/phien/ph-1/dung', { than: { ok: true } })
      .gan();
    const { qc } = dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    const nut = await screen.findByRole('button', { name: 'Dừng' });
    vi.spyOn(qc, 'cancelQueries').mockRejectedValueOnce(new Error('cancel hỏng'));
    fireEvent.click(nut);
    // `onMutate` ném ⇒ không có ngữ cảnh ⇒ `onSettled` không có vé để trả; chỉ catch trả được.
    await waitFor(() => {
      expect(qc.getMutationCache().getAll().length).toBeGreaterThan(0);
      expect(qc.isMutating()).toBe(0);
    });
    expect(dangGhiLacQuan(qc, ['phien', 'ph-1'])).toBe(false);
  });
});

/* ================================================================== *
 * 3. Gửi ở Cần Chủ — hai khoá
 * ================================================================== */

describe('BAT-27 Gửi (Cần Chủ) treo: GET cũ không đưa thẻ mọc lại', () => {
  async function dungCanChu(): Promise<{ m: MayChuGia; mo: () => void }> {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { cho, mo } = cuaTreo();
    // Máy chủ CHƯA ghi: GET luôn trả thẻ T-1 còn chờ — một lượt lọt cổng làm thẻ mọc lại.
    const m = new MayChuGia()
      .dat('GET /v1/can-chu', { than: manHinh({ urgent: [the({ ma: 'T-1' })] }) })
      .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .dat('POST /v1/can-chu/ct-T-1/xu-ly', { than: { ok: true }, cho })
      .gan();
    dung(<TrangCanChu />, '/can-chu');
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).not.toBeNull();
    });
    const the_ = document.querySelector<HTMLElement>('[data-the="T-1"]')!;
    fireEvent.click(within(the_).getByRole('button', { name: NHAN_GUI.fyi }));
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).toBeNull();
    });
    expect(document.querySelector('[data-dong-da-xu-ly="T-1"]')).not.toBeNull();
    return { m, mo };
  }

  function dem(m: MayChuGia): { man: number; da: number } {
    return { man: m.soLan('GET', '/v1/can-chu'), da: m.soLan('GET', '/v1/can-chu/da-xu-ly') };
  }

  it('(a) tới nhịp ⇒ KHÔNG GET cả hai khoá, thẻ không mọc lại; xong ⇒ làm mới, nhịp chạy lại', async () => {
    const { m, mo } = await dungCanChu();
    const n = dem(m);

    await quaBaNhip();
    expect(dem(m)).toEqual(n);
    expect(document.querySelector('[data-the="T-1"]')).toBeNull();
    expect(document.querySelector('[data-dong-da-xu-ly="T-1"]')).not.toBeNull();

    mo();
    await waitFor(() => {
      expect(dem(m)).toEqual({ man: n.man + 1, da: n.da + 1 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);
    });
    expect(dem(m).man).toBeGreaterThan(n.man + 1);
    expect(dem(m).da).toBeGreaterThan(n.da + 1);
  });

  it('(b) quay lại tab ⇒ KHÔNG GET cả hai khoá; xong ⇒ quay lại tab làm mới bình thường', async () => {
    const { m, mo } = await dungCanChu();
    const n = dem(m);

    await quayLaiTab();
    expect(dem(m)).toEqual(n);
    expect(document.querySelector('[data-the="T-1"]')).toBeNull();

    mo();
    await waitFor(() => {
      expect(dem(m)).toEqual({ man: n.man + 1, da: n.da + 1 });
    });
    await quayLaiTab();
    expect(dem(m)).toEqual({ man: n.man + 2, da: n.da + 2 });
  });
});

/* ================================================================== *
 * 4. Công tắc thông báo — KHÔNG có nhịp
 * ================================================================== */

const CONG_TAC = {
  items: [{ cong_tac: 'phien_dung', nhan: 'Phiên đứng', bat: true, khoa: false, ly_do_khoa: null }],
};

describe('BAT-27 công tắc thông báo treo (query KHÔNG có nhịp, không đăng ký useNhipLamMoi)', () => {
  async function dungCaiDat(): Promise<{ m: MayChuGia; mo: () => void; qc: QueryClient }> {
    const { cho, mo } = cuaTreo();
    const m = new MayChuGia()
      .dat('GET /v1/sao-luu', { than: { bat: false, items: [] } })
      .dat('GET /v1/chu/phien-dang-nhap', { than: { items: [] } })
      .dat('GET /v1/cai-dat/thong-bao', { than: CONG_TAC })
      .dat('PUT /v1/cai-dat/thong-bao/phien_dung', {
        than: { cong_tac: 'phien_dung', bat: false },
        cho,
      })
      .gan();
    const { qc } = dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText('Phiên đứng');
    const o = document.querySelector<HTMLInputElement>(
      '[data-cong-tac="phien_dung"] input[role="switch"]',
    )!;
    fireEvent.click(o);
    await waitFor(() => {
      expect(m.soLan('PUT', '/v1/cai-dat/thong-bao/phien_dung')).toBe(1);
    });
    expect(o.checked).toBe(false);
    return { m, mo, qc };
  }

  it('khoá được khai vào sổ trong lúc treo, và rút ra khi xong (kể cả để ngày nó có nhịp)', async () => {
    const { mo, qc } = await dungCaiDat();
    expect(dangGhiLacQuan(qc, KHOA_CAI_DAT_THONG_BAO)).toBe(true);
    mo();
    await waitFor(() => {
      expect(dangGhiLacQuan(qc, KHOA_CAI_DAT_THONG_BAO)).toBe(false);
    });
  });

  /*
   * Ca này KHÔNG chứng minh cổng quay-lại-tab: query này không đăng ký
   * `useNhipLamMoi`, tức **không có đường làm mới tự động nào** — nên xanh dù cổng
   * bị bỏ. Nó chỉ ghim hệ quả quan sát được (không GET thừa, công tắc giữ bản lạc
   * quan, xong thì `onSettled` tải lại). Cổng được chứng minh ở ca (b) của ba nhóm
   * có nhịp ở trên và ca ghim khai khoá ngay trước.
   */
  it('(b) không có đường làm mới tự động: quay lại tab không GET cài đặt, công tắc giữ bản lạc quan', async () => {
    const { m, mo } = await dungCaiDat();
    const n = m.soLan('GET', '/v1/cai-dat/thong-bao');
    act(() => {
      datHienThi('visible');
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(m.soLan('GET', '/v1/cai-dat/thong-bao')).toBe(n);
    expect(
      document.querySelector<HTMLInputElement>('[data-cong-tac="phien_dung"] input[role="switch"]')
        ?.checked,
    ).toBe(false);
    mo();
    // Xong ⇒ `onSettled` tải lại khoá (đường làm mới duy nhất của query này).
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/cai-dat/thong-bao')).toBe(n + 1);
    });
  });
});

/* ================================================================== *
 * 5. BAT-28 — `lamMoiTheoSo`: làm mới sau mutation bỏ qua (và hoãn) khoá
 *    đang ghi lạc quan; khoá ngữ cảnh ở onError/onSettled
 * ================================================================== */

/** Cho mọi microtask (gồm lượt xả hoãn của `ketThucGhiLacQuan`) chạy xong. */
async function xaMicrotask(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('BAT-28 `lamMoiTheoSo` — đơn vị', () => {
  function qcCo(...khoa: QueryKey[]): QueryClient {
    const qc = new QueryClient();
    for (const k of khoa) qc.setQueryData(k, 1);
    return qc;
  }
  const cu = (qc: QueryClient, k: QueryKey): boolean | undefined => qc.getQueryState(k)?.isInvalidated;
  /** Số lời `invalidateQueries` **exact** đúng khoá `k` (lượt xả hoãn). */
  const soLanXa = (goi: { mock: { calls: unknown[][] } }, k: QueryKey): number =>
    goi.mock.calls.filter((g) => {
      const f = g[0] as { queryKey?: QueryKey; exact?: boolean } | undefined;
      return f?.exact === true && f.queryKey !== undefined && hashKey(f.queryKey) === hashKey(k);
    }).length;

  const MAN = ['can-chu', 'man-hinh', { muc: 'a' }] as const;
  const DA = ['can-chu', 'da-xu-ly', { muc: 'a' }] as const;
  const HH = ['can-chu', 'huy-hieu'] as const;

  it('khoá đang ghi bị BỎ QUA (không đánh dấu cũ) và vào hoãn; anh em vẫn làm mới ngay', async () => {
    const qc = qcCo(MAN, DA, HH);
    const ve = batDauGhiLacQuan(qc, [MAN, DA]);
    await lamMoiTheoSo(qc, { queryKey: ['can-chu'] });
    expect(cu(qc, HH)).toBe(true);
    expect(cu(qc, MAN)).toBe(false);
    expect(cu(qc, DA)).toBe(false);
    expect(khoaDangHoan(qc).map((k) => hashKey(k)).sort()).toEqual(
      [hashKey(MAN), hashKey(DA)].sort(),
    );

    ketThucGhiLacQuan(qc, ve);
    await xaMicrotask();
    // Sổ về 0 ⇒ khoá hoãn được làm mới, và rút khỏi danh sách hoãn.
    expect(cu(qc, MAN)).toBe(true);
    expect(cu(qc, DA)).toBe(true);
    expect(khoaDangHoan(qc)).toEqual([]);
  });

  it('`exact` giữ như `invalidateQueries`: khoá con không bị đụng', async () => {
    const qc = qcCo(['a'], ['a', 'b']);
    await lamMoiTheoSo(qc, { queryKey: ['a'], exact: true });
    expect(cu(qc, ['a'])).toBe(true);
    expect(cu(qc, ['a', 'b'])).toBe(false);
    await lamMoiTheoSo(qc, { queryKey: ['a'] });
    expect(cu(qc, ['a', 'b'])).toBe(true);
  });

  it('một khoá hoãn HAI lần ⇒ được làm mới đúng MỘT lần', async () => {
    const qc = qcCo(MAN);
    const goi = vi.spyOn(qc, 'invalidateQueries');
    const ve = batDauGhiLacQuan(qc, [MAN]);
    void lamMoiTheoSo(qc, { queryKey: ['can-chu'] });
    void lamMoiTheoSo(qc, { queryKey: MAN });
    expect(khoaDangHoan(qc).length).toBe(1);
    ketThucGhiLacQuan(qc, ve);
    await xaMicrotask();
    expect(soLanXa(goi, MAN)).toBe(1);
    // Vé trả lần hai không xả thêm.
    ketThucGhiLacQuan(qc, ve);
    await xaMicrotask();
    expect(soLanXa(goi, MAN)).toBe(1);
  });

  it('còn mutation khác ghi khoá ⇒ CHƯA làm mới; mutation cuối xong mới làm mới', async () => {
    const qc = qcCo(MAN);
    const v1 = batDauGhiLacQuan(qc, [MAN]);
    const v2 = batDauGhiLacQuan(qc, [MAN]);
    await lamMoiTheoSo(qc, { queryKey: MAN });
    ketThucGhiLacQuan(qc, v1);
    await xaMicrotask();
    expect(cu(qc, MAN)).toBe(false);
    expect(khoaDangHoan(qc).length).toBe(1);
    ketThucGhiLacQuan(qc, v2);
    await xaMicrotask();
    expect(cu(qc, MAN)).toBe(true);
    expect(khoaDangHoan(qc)).toEqual([]);
  });

  it('chính mutation vừa trả vé làm mới khoá của nó ngay sau `ketThuc` ⇒ không tự hoãn, không làm mới lần hai', async () => {
    const qc = qcCo(MAN);
    const ve = batDauGhiLacQuan(qc, [MAN]);
    // (một mutation khác xong trước, khoá MAN bị hoãn)
    void lamMoiTheoSo(qc, { queryKey: ['can-chu'] });
    const goi = vi.spyOn(qc, 'invalidateQueries');
    // `onSettled` của chính mutation đang ghi MAN: trả vé TRƯỚC, rồi làm mới.
    ketThucGhiLacQuan(qc, ve);
    void lamMoiTheoSo(qc, { queryKey: MAN });
    expect(cu(qc, MAN)).toBe(true);
    expect(khoaDangHoan(qc)).toEqual([]);
    await xaMicrotask();
    expect(goi).toHaveBeenCalledTimes(1);
    expect(soLanXa(goi, MAN)).toBe(0);
  });

  it('nhiều QueryClient: hoãn của client A không bị client B xả, không rò sang B', async () => {
    const a = qcCo(MAN);
    const b = qcCo(MAN);
    const ve_a = batDauGhiLacQuan(a, [MAN]);
    await lamMoiTheoSo(a, { queryKey: MAN });
    expect(khoaDangHoan(a).length).toBe(1);
    expect(khoaDangHoan(b)).toEqual([]);

    const ve_b = batDauGhiLacQuan(b, [MAN]);
    ketThucGhiLacQuan(b, ve_b);
    await xaMicrotask();
    expect(cu(a, MAN)).toBe(false);
    expect(khoaDangHoan(a).length).toBe(1);

    ketThucGhiLacQuan(a, ve_a);
    await xaMicrotask();
    expect(cu(a, MAN)).toBe(true);
    expect(cu(b, MAN)).toBe(false);
  });
});

describe('BAT-29 `lamMoiTheoSo` hỏi cả sổ S/P/L — đơn vị', () => {
  function qcCo(...khoa: QueryKey[]): QueryClient {
    const qc = new QueryClient();
    for (const k of khoa) qc.setQueryData(k, 1);
    return qc;
  }
  const cu = (qc: QueryClient, k: QueryKey): boolean | undefined => qc.getQueryState(k)?.isInvalidated;
  const DS = ['ticket', 'man-hinh', { trang_thai: 'todo' }] as const;
  const CT_1 = ['ticket', 'chi-tiet', 'SAI-1'] as const;
  const CT_2 = ['ticket', 'chi-tiet', 'SAI-2'] as const;
  const TQ = ['tong-quan'] as const;

  it('`khoaBiSuaChan`: danh sách khi tong>0; chi tiết theo mã; mã chưa biết ⇒ chặn mọi chi tiết; khoá khác `ticket` ⇒ không', () => {
    const qc = new QueryClient();
    expect(khoaBiSuaChan(qc, DS)).toBe(false);
    batDauSua(qc, 'tk-SAI-1', 'SAI-1');
    expect(khoaBiSuaChan(qc, DS)).toBe(true);
    expect(khoaBiSuaChan(qc, CT_1)).toBe(true);
    expect(khoaBiSuaChan(qc, CT_2)).toBe(false);
    expect(khoaBiSuaChan(qc, TQ)).toBe(false);
    batDauSua(qc, 'tk-9');
    expect(khoaBiSuaChan(qc, CT_2)).toBe(true);
  });

  it('S/P/L bay ⇒ `lamMoiTheoSo([ticket])` bỏ qua + hoãn danh sách và chi tiết thẻ đang sửa; thẻ khác và khoá khác làm mới ngay', async () => {
    const qc = qcCo(DS, CT_1, CT_2, TQ);
    batDauSua(qc, 'tk-SAI-1', 'SAI-1');
    await lamMoiTheoSo(qc, { queryKey: ['ticket'] });
    await lamMoiTheoSo(qc, { queryKey: TQ });
    expect(cu(qc, DS)).toBe(false);
    expect(cu(qc, CT_1)).toBe(false);
    expect(cu(qc, CT_2)).toBe(true);
    expect(cu(qc, TQ)).toBe(true);
    expect(khoaDangHoan(qc).map((k) => hashKey(k)).sort()).toEqual([hashKey(DS), hashKey(CT_1)].sort());
  });

  it('S/P/L kết thúc + `henXaHoan` ⇒ khoá hoãn vì S/P/L được làm mới (không kẹt); còn S/P/L khác ⇒ danh sách vẫn hoãn', async () => {
    const qc = qcCo(DS, CT_1);
    batDauSua(qc, 'tk-SAI-1', 'SAI-1');
    batDauSua(qc, 'tk-SAI-2', 'SAI-2');
    await lamMoiTheoSo(qc, { queryKey: ['ticket'] });
    expect(khoaDangHoan(qc).length).toBe(2);

    ketThucSua(qc, 'tk-SAI-1');
    henXaHoan(qc);
    await xaMicrotask();
    // Chi tiết SAI-1 hết bị chặn ⇒ xả; danh sách còn SAI-2 bay ⇒ để lại.
    expect(cu(qc, CT_1)).toBe(true);
    expect(cu(qc, DS)).toBe(false);
    expect(khoaDangHoan(qc)).toEqual([DS]);

    ketThucSua(qc, 'tk-SAI-2');
    henXaHoan(qc);
    await xaMicrotask();
    expect(cu(qc, DS)).toBe(true);
    expect(khoaDangHoan(qc)).toEqual([]);
  });

  it('khoá hoãn vì S/P/L KHÔNG bị sổ chung xả sớm: `ketThucGhiLacQuan` khi S/P/L còn bay ⇒ khoá vẫn hoãn', async () => {
    const qc = qcCo(CT_1);
    const ve = batDauGhiLacQuan(qc, [CT_1]);
    batDauSua(qc, 'tk-SAI-1', 'SAI-1');
    await lamMoiTheoSo(qc, { queryKey: CT_1 });
    ketThucGhiLacQuan(qc, ve);
    await xaMicrotask();
    expect(cu(qc, CT_1)).toBe(false);
    expect(khoaDangHoan(qc)).toEqual([CT_1]);
    ketThucSua(qc, 'tk-SAI-1');
    henXaHoan(qc);
    await xaMicrotask();
    expect(cu(qc, CT_1)).toBe(true);
  });
});

describe('BAT-28 Cần Chủ: hai lần Gửi liên tiếp', () => {
  const dem = (m: MayChuGia): { man: number; da: number } => ({
    man: m.soLan('GET', '/v1/can-chu'),
    da: m.soLan('GET', '/v1/can-chu/da-xu-ly'),
  });

  it('lần 1 xong KHÔNG GET hai khoá (lần 2 còn ghi) ⇒ thẻ lần 2 không mọc lại; lần 2 xong ⇒ làm mới đúng một lần', async () => {
    const c1 = cuaTreo();
    const c2 = cuaTreo();
    const kho = { cho: [the({ ma: 'T-1' }), the({ ma: 'T-2' })] };
    const m = new MayChuGia()
      .dat('GET /v1/can-chu', () => ({ than: manHinh({ urgent: kho.cho }) }))
      .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .dat('POST /v1/can-chu/ct-T-1/xu-ly', { than: { ok: true }, cho: c1.cho })
      .dat('POST /v1/can-chu/ct-T-2/xu-ly', { than: { ok: true }, cho: c2.cho })
      .gan();
    dung(<TrangCanChu />, '/can-chu');
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-2"]')).not.toBeNull();
    });
    for (const ma of ['T-1', 'T-2']) {
      const el = document.querySelector<HTMLElement>(`[data-the="${ma}"]`)!;
      fireEvent.click(within(el).getByRole('button', { name: NHAN_GUI.fyi }));
      await waitFor(() => {
        expect(document.querySelector(`[data-the="${ma}"]`)).toBeNull();
      });
    }
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-2/xu-ly')).toBe(1);
    });
    const n = dem(m);

    // Máy chủ đã nhận lần 1, CHƯA nhận lần 2: một GET lúc này đưa T-2 mọc lại.
    kho.cho = [the({ ma: 'T-2' })];
    c1.mo();
    await new Promise((r) => setTimeout(r, 100));
    expect(dem(m)).toEqual(n);
    expect(document.querySelector('[data-the="T-2"]')).toBeNull();
    expect(document.querySelector('[data-dong-da-xu-ly="T-2"]')).not.toBeNull();

    kho.cho = [];
    c2.mo();
    await waitFor(() => {
      expect(dem(m)).toEqual({ man: n.man + 1, da: n.da + 1 });
    });
    await new Promise((r) => setTimeout(r, 100));
    // Hoãn + làm mới của chính lần 2 gộp lại: đúng MỘT lượt mỗi khoá.
    expect(dem(m)).toEqual({ man: n.man + 1, da: n.da + 1 });
    expect(document.querySelector('[data-the="T-2"]')).toBeNull();
  });
});

describe('BAT-28 việc 2 — Dừng phiên: đổi `/phien/:id` khi Dừng còn treo', () => {
  /** Vỏ giả của route: cùng một `TrangPhien`, đổi `id` như khi chủ bấm sang phiên khác. */
  function DoiPhien(): JSX.Element {
    const [id, datId] = useState('ph-1');
    return (
      <>
        <button type="button" onClick={() => datId('ph-2')}>
          sang ph-2
        </button>
        <TrangPhien id={id} />
      </>
    );
  }

  it('Dừng ph-1 treo, sang ph-2, máy chủ từ chối ⇒ hoàn cache ph-1, cache ph-2 giữ nguyên tham chiếu; làm mới ph-1 (không ph-2); sổ ph-1 về 0', async () => {
    const { cho, mo } = cuaTreo();
    const CAU = 'Chỉ chủ bấm được Dừng.';
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-phien/ph-1', { than: manHinhPhien() })
      .dat('GET /v1/man-hinh-phien/ph-2', {
        than: manHinhPhien({ phien: phienDong({ id: 'ph-2' }) }),
      })
      .dat('POST /v1/phien/ph-1/dung', { http: 403, loi: { error: 'FORBIDDEN', message: CAU }, cho })
      .gan();
    const { qc } = dung(<DoiPhien />, '/phien/ph-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Dừng' }));
    await waitFor(() => {
      expect(document.querySelector('[data-trang-thai="stopping"]')).not.toBeNull();
    });
    const K1 = ['phien', 'ph-1'] as const;
    const K2 = ['phien', 'ph-2'] as const;
    const truoc_1 = qc.getQueryData<{ phien: { trang_thai: string } }>(K1);
    expect(truoc_1?.phien.trang_thai).toBe('stopping');

    fireEvent.click(screen.getByRole('button', { name: 'sang ph-2' }));
    await waitFor(() => {
      expect(qc.getQueryData(K2)).toBeDefined();
    });
    const b_truoc = qc.getQueryData(K2);
    const n2 = m.soLan('GET', '/v1/man-hinh-phien/ph-2');
    const goi = vi.spyOn(qc, 'invalidateQueries');
    const lam_moi = (k: QueryKey): number =>
      goi.mock.calls.filter((g) => {
        const q = (g[0] as { queryKey?: QueryKey } | undefined)?.queryKey;
        return q !== undefined && hashKey(q) === hashKey(k);
      }).length;

    mo();
    expect(await screen.findByText(CAU)).toBeTruthy();
    await xaMicrotask();
    expect(qc.getQueryData<{ phien: { trang_thai: string } }>(K1)?.phien.trang_thai).toBe(
      'running',
    );
    expect(qc.getQueryData(K2)).toBe(b_truoc);
    expect(lam_moi(K1)).toBe(1);
    expect(lam_moi(K2)).toBe(0);
    expect(m.soLan('GET', '/v1/man-hinh-phien/ph-2')).toBe(n2);
    expect(dangGhiLacQuan(qc, K1)).toBe(false);
  });
});

describe('BAT-28 việc 2 — Cần Chủ: đổi bộ lọc khi Gửi còn treo', () => {
  type Man = { khoi: { items: { ma: string }[] }[] };
  const maTrong = (d: unknown): string[] =>
    d === undefined ? [] : (d as Man).khoi.flatMap((k) => k.items.map((t) => t.ma));
  const duLieuMan = (qc: QueryClient, project_id: string | undefined): unknown =>
    qc
      .getQueryCache()
      .findAll({ queryKey: ['can-chu', 'man-hinh'] })
      .find((q) => (q.queryKey[2] as { project_id?: string }).project_id === project_id)?.state.data;

  it('máy chủ từ chối ⇒ hoàn vào khoá bộ lọc CŨ (đã ghi); khoá bộ lọc mới không nhận ảnh chụp cũ; sổ khoá cũ về 0', async () => {
    const c = cuaTreo();
    const CAU = 'Mục này đã được xử lý ở nơi khác.';
    let chan_moi = false;
    new MayChuGia()
      .dat('GET /v1/can-chu', { than: manHinh({ urgent: [the({ ma: 'T-1' })] }) })
      .dat('GET /v1/can-chu?project_id=chung', () =>
        chan_moi
          ? { than: null, cho: new Promise<unknown>(() => undefined) }
          : { than: manHinh({ urgent: [the({ ma: 'T-9' })] }) },
      )
      .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
      .dat('GET /v1/can-chu/da-xu-ly?project_id=chung', { than: DA_XU_LY_RONG })
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .dat('POST /v1/can-chu/ct-T-1/xu-ly', {
        http: 409,
        loi: { error: 'ALREADY_RESOLVED', message: CAU },
        cho: c.cho,
      })
      .gan();
    const { qc } = dung(<TrangCanChu />, '/can-chu');
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).not.toBeNull();
    });
    const el = document.querySelector<HTMLElement>('[data-the="T-1"]')!;
    fireEvent.click(within(el).getByRole('button', { name: NHAN_GUI.fyi }));
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).toBeNull();
    });
    const k_cu = qc
      .getQueryCache()
      .findAll({ queryKey: ['can-chu', 'man-hinh'] })
      .map((q) => q.queryKey)[0]!;
    expect(dangGhiLacQuan(qc, k_cu)).toBe(true);

    fireEvent.change(document.querySelector(`[data-loc="${KHOA_LOC.du_an}"]`)!, {
      target: { value: 'chung' },
    });
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-9"]')).not.toBeNull();
    });
    // Mọi GET bộ lọc mới từ đây treo: thứ gì ghi vào khoá mới lúc lỗi là của `onError`.
    chan_moi = true;

    c.mo();
    expect(await screen.findByText(CAU)).toBeTruthy();
    await xaMicrotask();
    // Khoá CŨ được hoàn: T-1 trở lại.
    expect(maTrong(duLieuMan(qc, undefined))).toEqual(['T-1']);
    // Khoá MỚI không bị ghi ảnh chụp của bộ lọc cũ.
    expect(maTrong(duLieuMan(qc, 'chung'))).toEqual(['T-9']);
    expect(document.querySelector('[data-the="T-1"]')).toBeNull();
    expect(dangGhiLacQuan(qc, k_cu)).toBe(false);
  });
});
