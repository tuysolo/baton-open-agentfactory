/**
 * **BAT-34 việc 2 — hộp Tạo việc và hộp Giao việc khi mất mạng.**
 *
 * Mất mạng, bấm Gửi ⇒ lượt gửi tạm dừng (TanStack `isPaused`). Hộp phải: nói rõ
 * đang chờ mạng (`aria-live`), BẬT lại Esc/Huỷ; đóng lúc đó = **huỷ gửi** (có mạng
 * lại ⇒ 0 request, toast "chưa tạo/giao gì", không toast lỗi); không đóng mà có mạng
 * lại ⇒ đúng 1 request, hộp đóng như thường; huỷ rồi mở hộp mới vẫn gửi được.
 * Xem `src/huy-gui.ts`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { useState, type JSX } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { ThanChiTietTicket, TrangChiTietTicket } from '../src/trang/chi-tiet-ticket';
import {
  CAU_CHO_MANG,
  CAU_DA_HUY_GIAO,
  CAU_DA_HUY_TAO,
} from '../src/huy-gui';
import { NHAN_NUT_GIAO_VIEC } from '../src/vo/giao-viec';
import {
  NHAN_HOP_TAO_VIEC,
  NHAN_O_CHA,
  NHAN_O_DU_AN,
  NHAN_O_TIEU_DE,
} from '../src/vo/tao-viec';
import type { DuAnSidebar } from '../src/api';
import { MayChuGia, TOI_CHU, dung } from './giup';
import { doiAgent } from './than-agent';
import { manHinhTicket, ticketDayDu, THAN_AGENT } from './than-ticket';

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true);
  });
  document.body.style.overflow = '';
});

const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const matMang = (): void => {
  act(() => {
    onlineManager.setOnline(false);
  });
};
const coMang = (): void => {
  act(() => {
    onlineManager.setOnline(true);
  });
};
/**
 * Có mạng lại rồi **Esc trong cùng nhịp, trước khi React render lại**: chờ vài
 * microtask cho `continue()` ⇒ `run()` ⇒ `mutationFn` (request đã bay), nhưng chưa
 * tới `setTimeout` của `notifyManager` nên `isPaused` trên màn hình còn là `true`.
 */
async function coMangRoiEscCungNhip(h: HTMLElement, da_bay: () => boolean): Promise<void> {
  await act(async () => {
    onlineManager.setOnline(true);
    for (let i = 0; i < 50 && !da_bay(); i += 1) await Promise.resolve();
    expect(da_bay()).toBe(true);
    // Màn hình còn cũ: vẫn hiện dòng "chờ mạng" (isPaused render = true).
    expect(h.querySelector('[data-o="cho-mang"]')).not.toBeNull();
    fireEvent.keyDown(h, { key: 'Escape' });
  });
}

const toastTin = (): string[] => [...document.querySelectorAll('[data-toast="tin"] span')].map((e) => e.textContent ?? '');
const toastLoi = (): string[] => [...document.querySelectorAll('[data-toast="loi"] span')].map((e) => e.textContent ?? '');

/* ================================================================== *
 * Hộp TẠO VIỆC
 * ================================================================== */

const DU_AN: DuAnSidebar[] = [{ id: 'id-SPX', ma: 'SPX', ten: 'Sample', trang_thai: 'active', nhom: null }];
const KET_QUA_TAO = { id: 'tk-new', ma: 'SPX-7', so: 7, tieu_de: 'Việc mới', trang_thai: 'todo' };

function mayTao(): MayChuGia {
  return new MayChuGia()
    .dat('GET /v1/toi', { than: TOI_CHU })
    .dat('GET /v1/du-an?limit=200', { than: { items: DU_AN, cursor_sau: null } })
    .dat('GET /v1/can-chu', { than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null } } })
    .dat('GET /v1/man-hinh-agent', { than: doiAgent([]) })
    .dat('GET /v1/agent', { than: THAN_AGENT })
    .dat('GET /v1/ticket/ma/SPX-3', { than: { id: 'tk-SPX-3', ma: 'SPX-3', tieu_de: 'Cha' } })
    .dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO })
    .dat('GET /v1/man-hinh-ticket/ma/SPX-7', { than: manHinhTicket(ticketDayDu({ ma: 'SPX-7' })) })
    .gan();
}

const hopTao = (): HTMLElement | null => screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC });

async function vaoVoTao(): Promise<MayChuGia> {
  const m = mayTao();
  dung(<App />, '/khong-co');
  await screen.findByRole('navigation', { name: 'Điều hướng chính' });
  await screen.findAllByText('Sample');
  return m;
}

/** Mở hộp, điền, MẤT MẠNG, gửi ⇒ chờ thấy dòng "đang chờ có mạng". */
async function guiTaoKhiMatMang(ma_cha = ''): Promise<HTMLElement> {
  await userEvent.keyboard('c');
  const h = await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
  await userEvent.selectOptions(within(h).getByLabelText(NHAN_O_DU_AN), 'id-SPX');
  await userEvent.type(within(h).getByLabelText(NHAN_O_TIEU_DE), 'Việc mới');
  if (ma_cha !== '') await userEvent.type(within(h).getByLabelText(NHAN_O_CHA), ma_cha);
  matMang();
  fireEvent.submit(h.querySelector('form')!);
  await waitFor(() => {
    expect(h.querySelector('[data-o="cho-mang"]')?.textContent).toBe(CAU_CHO_MANG);
  });
  return h;
}

describe('hộp Tạo việc — mất mạng', () => {
  it('Gửi khi mất mạng ⇒ dòng trạng thái aria-live, nút Gửi vẫn khoá, Huỷ BẬT; Esc đóng ⇒ có mạng ⇒ 0 request + toast huỷ', async () => {
    const m = await vaoVoTao();
    const h = await guiTaoKhiMatMang(' SPX-3 ');
    expect(h.querySelector('[data-o="cho-mang"]')?.closest('[aria-live]')).not.toBeNull();
    expect(h.querySelector<HTMLButtonElement>('[data-nut="gui-tao"]')!.disabled).toBe(true);
    expect(h.querySelector<HTMLButtonElement>('[data-nut="huy-tao"]')!.disabled).toBe(false);
    // Bấm Gửi lần nữa lúc đang chờ: không có lượt thứ hai.
    fireEvent.submit(h.querySelector('form')!);

    await userEvent.keyboard('{Escape}');
    expect(hopTao()).toBeNull();
    expect(toastTin()).toContain(CAU_DA_HUY_TAO);

    coMang();
    await doi(50);
    expect(m.soLan('POST', '/v1/ticket')).toBe(0);
    // Cả lượt tra mã cha (GET) cũng không bay.
    expect(m.soLan('GET', '/v1/ticket/ma/SPX-3')).toBe(0);
    expect(toastLoi()).toEqual([]);
  });

  it('nút Huỷ khi đang chờ mạng ⇒ đóng, có mạng ⇒ 0 request + toast huỷ', async () => {
    const m = await vaoVoTao();
    const h = await guiTaoKhiMatMang();
    await userEvent.click(h.querySelector<HTMLButtonElement>('[data-nut="huy-tao"]')!);
    expect(hopTao()).toBeNull();
    coMang();
    await doi(50);
    expect(m.soLan('POST', '/v1/ticket')).toBe(0);
    expect(toastTin()).toEqual([CAU_DA_HUY_TAO]);
  });

  it('KHÔNG đóng mà có mạng lại ⇒ đúng MỘT request, hộp đóng như thường (tới /t/<MÃ>)', async () => {
    const m = await vaoVoTao();
    await guiTaoKhiMatMang();
    coMang();
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    await waitFor(() => {
      expect(hopTao()).toBeNull();
    });
    await doi(50);
    expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    expect(toastTin()).toEqual([]);
  });

  it('có mạng lại rồi Esc CÙNG NHỊP (request đã bay, render còn isPaused cũ) ⇒ hộp KHÔNG đóng, không toast huỷ; kết quả thật về ⇒ đóng như thường', async () => {
    const m = await vaoVoTao();
    let mo = (): void => undefined;
    const cho = new Promise<void>((r) => {
      mo = r;
    });
    m.dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO, cho });
    const h = await guiTaoKhiMatMang();
    await coMangRoiEscCungNhip(h, () => m.soLan('POST', '/v1/ticket') === 1);
    expect(hopTao()).not.toBeNull();
    expect(toastTin()).toEqual([]);
    // Sau khi render lại: Huỷ khoá như lúc gửi bình thường.
    await waitFor(() => {
      expect(h.querySelector<HTMLButtonElement>('[data-nut="huy-tao"]')!.disabled).toBe(true);
    });
    mo();
    await waitFor(() => {
      expect(hopTao()).toBeNull();
    });
    expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    expect(toastTin()).toEqual([]);
    expect(toastLoi()).toEqual([]);
  });

  it('huỷ rồi mở hộp MỚI gửi được (đúng 1 request — chốt của lượt cũ không giữ hộp mới)', async () => {
    const m = await vaoVoTao();
    await guiTaoKhiMatMang();
    await userEvent.keyboard('{Escape}');
    expect(hopTao()).toBeNull();
    coMang();
    await doi(30);

    await userEvent.keyboard('c');
    const h = await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
    await userEvent.selectOptions(within(h).getByLabelText(NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(within(h).getByLabelText(NHAN_O_TIEU_DE), 'Lần hai');
    fireEvent.submit(h.querySelector('form')!);
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toMatchObject({ tieu_de: 'Lần hai' });
  });

  it('đối chứng: có mạng thì không có dòng "chờ mạng", Huỷ khoá trong lúc đang gửi thật', async () => {
    const m = await vaoVoTao();
    let mo = (): void => undefined;
    const cho = new Promise<void>((r) => {
      mo = r;
    });
    m.dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO, cho });
    await userEvent.keyboard('c');
    const h = await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
    await userEvent.selectOptions(within(h).getByLabelText(NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(within(h).getByLabelText(NHAN_O_TIEU_DE), 'X');
    fireEvent.submit(h.querySelector('form')!);
    await waitFor(() => {
      expect(h.querySelector<HTMLButtonElement>('[data-nut="huy-tao"]')!.disabled).toBe(true);
    });
    expect(h.querySelector('[data-o="cho-mang"]')).toBeNull();
    fireEvent.keyDown(h, { key: 'Escape' });
    expect(hopTao()).not.toBeNull();
    mo();
    await waitFor(() => {
      expect(hopTao()).toBeNull();
    });
  });
});

/* ================================================================== *
 * Hộp GIAO VIỆC
 * ================================================================== */

const KQ_GIAO = {
  id: 'lg-moi',
  ticket_id: 'tk-SAI-1',
  so_luot: 1,
  loai: 'work',
  trang_thai: 'pending',
  nguoi_nhan_agent_id: 'ag-b',
  han_phan_hoi_luc: null,
  ticket_trang_thai: 'in_progress',
};
const THAN_AGENT_GIAO = {
  items: [{ id: 'ag-b', ten: 'M-baton', vai_tro: 'manager', nhan_vai_tro: 'Manager', disabled: false }],
  cursor_sau: null,
};
const POST_1 = '/v1/ticket/tk-SAI-1/luot-giao';
const POST_2 = '/v1/ticket/tk-SAI-2/luot-giao';

function mayGiao(): MayChuGia {
  return new MayChuGia()
    .dat('GET /v1/agent', { than: THAN_AGENT_GIAO })
    .dat('GET /v1/man-hinh-ticket/ma/SAI-1', { than: manHinhTicket(ticketDayDu({ ma: 'SAI-1', trang_thai: 'todo' })) })
    .dat('GET /v1/man-hinh-ticket/ma/SAI-2', { than: manHinhTicket(ticketDayDu({ ma: 'SAI-2', trang_thai: 'todo' })) })
    .dat(`POST ${POST_1}`, { than: KQ_GIAO, http: 201 })
    .dat(`POST ${POST_2}`, { than: { ...KQ_GIAO, ticket_id: 'tk-SAI-2' }, http: 201 })
    .gan();
}

const hopGiao = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-o="hop-giao-viec"]');
const oAgent = (): HTMLSelectElement => hopGiao()!.querySelector<HTMLSelectElement>('[data-nhap="agent"]')!;

async function moHopGiao(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
  await waitFor(() => {
    expect(oAgent().options.length).toBe(2);
  });
  return hopGiao()!;
}

async function guiGiaoKhiMatMang(): Promise<HTMLElement> {
  const h = await moHopGiao();
  fireEvent.change(oAgent(), { target: { value: 'ag-b' } });
  matMang();
  fireEvent.submit(h.querySelector('form')!);
  await waitFor(() => {
    expect(h.querySelector('[data-o="cho-mang"]')?.textContent).toBe(CAU_CHO_MANG);
  });
  return h;
}

describe('hộp Giao việc — mất mạng', () => {
  it('Gửi khi mất mạng ⇒ dòng trạng thái, Huỷ BẬT; Esc đóng ⇒ có mạng ⇒ 0 POST + toast huỷ, không toast lỗi', async () => {
    const m = mayGiao();
    dung(<TrangChiTietTicket ma="SAI-1" />, '/t/SAI-1');
    const h = await guiGiaoKhiMatMang();
    expect(h.querySelector('[data-o="cho-mang"]')?.closest('[aria-live]')).not.toBeNull();
    expect(h.querySelector<HTMLButtonElement>('[data-nut="gui-giao"]')!.disabled).toBe(true);
    expect(h.querySelector<HTMLButtonElement>('[data-nut="huy-giao"]')!.disabled).toBe(false);
    fireEvent.submit(h.querySelector('form')!);

    await userEvent.keyboard('{Escape}');
    expect(hopGiao()).toBeNull();
    expect(toastTin()).toContain(CAU_DA_HUY_GIAO);
    coMang();
    await doi(50);
    expect(m.soLan('POST', POST_1)).toBe(0);
    expect(toastLoi()).toEqual([]);
  });

  it('nút Huỷ khi đang chờ mạng ⇒ đóng, có mạng ⇒ 0 POST + toast huỷ', async () => {
    const m = mayGiao();
    dung(<TrangChiTietTicket ma="SAI-1" />, '/t/SAI-1');
    const h = await guiGiaoKhiMatMang();
    await userEvent.click(h.querySelector<HTMLButtonElement>('[data-nut="huy-giao"]')!);
    expect(hopGiao()).toBeNull();
    coMang();
    await doi(50);
    expect(m.soLan('POST', POST_1)).toBe(0);
    expect(toastTin()).toEqual([CAU_DA_HUY_GIAO]);
  });

  it('KHÔNG đóng mà có mạng lại ⇒ đúng MỘT POST, hộp đóng như thường', async () => {
    const m = mayGiao();
    dung(<TrangChiTietTicket ma="SAI-1" />, '/t/SAI-1');
    await guiGiaoKhiMatMang();
    coMang();
    await waitFor(() => {
      expect(hopGiao()).toBeNull();
    });
    await doi(50);
    expect(m.soLan('POST', POST_1)).toBe(1);
    expect(toastTin()).toEqual([]);
  });

  it('có mạng lại rồi Esc CÙNG NHỊP (POST đã bay, render còn isPaused cũ) ⇒ hộp KHÔNG đóng, không toast huỷ; kết quả thật về ⇒ đóng', async () => {
    const m = mayGiao();
    let mo = (): void => undefined;
    const cho = new Promise<void>((r) => {
      mo = r;
    });
    m.dat(`POST ${POST_1}`, { than: KQ_GIAO, http: 201, cho });
    dung(<TrangChiTietTicket ma="SAI-1" />, '/t/SAI-1');
    const h = await guiGiaoKhiMatMang();
    await coMangRoiEscCungNhip(h, () => m.soLan('POST', POST_1) === 1);
    expect(hopGiao()).not.toBeNull();
    expect(toastTin()).toEqual([]);
    mo();
    await waitFor(() => {
      expect(hopGiao()).toBeNull();
    });
    expect(m.soLan('POST', POST_1)).toBe(1);
    expect(toastTin()).toEqual([]);
    expect(toastLoi()).toEqual([]);
  });

  it('huỷ rồi mở hộp MỚI gửi được (đúng 1 POST)', async () => {
    const m = mayGiao();
    dung(<TrangChiTietTicket ma="SAI-1" />, '/t/SAI-1');
    await guiGiaoKhiMatMang();
    await userEvent.keyboard('{Escape}');
    coMang();
    await doi(30);
    const h = await moHopGiao();
    fireEvent.change(oAgent(), { target: { value: 'ag-b' } });
    fireEvent.submit(h.querySelector('form')!);
    await waitFor(() => {
      expect(m.soLan('POST', POST_1)).toBe(1);
    });
    await doi(30);
    expect(m.soLan('POST', POST_1)).toBe(1);
  });

  it('panel đổi thẻ lúc lượt đang chờ mạng (hộp bị THÁO) ⇒ có mạng: 0 POST (không tk-SAI-1, không tk-SAI-2) + toast huỷ', async () => {
    const m = mayGiao();
    function VoDoi(): JSX.Element {
      const [ma, datMa] = useState('SAI-1');
      return (
        <>
          <button type="button" onClick={() => datMa('SAI-2')}>
            sang thẻ B
          </button>
          <ThanChiTietTicket ma={ma} />
        </>
      );
    }
    const { qc } = dung(<VoDoi />, '/t/SAI-1');
    qc.setQueryData(['ticket', 'chi-tiet', 'SAI-2'], manHinhTicket(ticketDayDu({ ma: 'SAI-2', trang_thai: 'todo' })));
    await guiGiaoKhiMatMang();
    fireEvent.click(screen.getByRole('button', { name: 'sang thẻ B' }));
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-2');
    });
    expect(hopGiao()).toBeNull();
    expect(toastTin()).toEqual([CAU_DA_HUY_GIAO]);
    coMang();
    await doi(50);
    expect(m.soLan('POST', POST_1)).toBe(0);
    expect(m.soLan('POST', POST_2)).toBe(0);
    expect(toastLoi()).toEqual([]);
  });
});
