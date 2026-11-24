/**
 * **BAT-29 việc 1 — đích của `mutationFn` nằm trong BIẾN của `mutate`, không
 * trong closure.**
 *
 * TanStack đẩy `setOptions` vào mutation đang treo, nên `mutationFn` — chạy
 * **sau** `onMutate` (có `await cancelQueries`), hay sau một lần treo vì mất mạng
 * (`networkMode: 'online'` mặc định) — là hàm của lần vẽ **mới nhất**. Một
 * `mutationFn` đọc id đích từ closure thì đổi thẻ / phiên / dự án giữa lúc bấm và
 * lúc gọi máy chủ là **ghi sang đích khác** (d.418 "sửa hiện ngay" thành sửa nhầm).
 *
 * Mỗi hook đã sửa một ca: bấm trên đích A, chặn trước khi `mutationFn` chạy, đổi
 * sang đích B (rerender cùng component với props khác), nhả ⇒ lệnh gọi máy chủ
 * mang đúng **A**, không một lệnh nào tới B.
 *
 *   | hook                        | chặn bằng                  | đích            |
 *   |-----------------------------|----------------------------|-----------------|
 *   | `useSuaTicket` (chi tiết)   | `cancelQueries` treo       | `ticket_id`     |
 *   | `useDungPhien`              | `cancelQueries` treo       | `phien_id`      |
 *   | hồ sơ — Lưu                 | mất mạng (mutation dừng)   | `project_id`    |
 *   | hồ sơ — Lỗi đã gặp          | mất mạng                   | `project_id`    |
 *   | nhật ký — Ghi               | mất mạng                   | `project_id`    |
 *   | Luật chung — Lưu            | mất mạng                   | thân lúc bấm    |
 *
 * Ba hook cuối không có `onMutate`, nên khe duy nhất giữa `mutate` và
 * `mutationFn` là lần mutation **dừng vì mất mạng** (rồi chạy tiếp khi có mạng).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, type JSX } from 'react';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThanChiTietTicket } from '../src/trang/chi-tiet-ticket';
import { TrangPhien } from '../src/trang/phien';
import {
  NHAN_GUI_LOI,
  NHAN_LUU_HO_SO,
  NHAN_SUA_HO_SO,
  NHAN_THEM_LOI,
  TrangHoSoDuAn,
} from '../src/trang/ho-so-du-an';
import { NHAN_GHI_DONG, NHAN_GUI_DONG, TrangNhatKy } from '../src/trang/nhat-ky';
import { NHAN_LUU_LUAT_CHUNG, NHAN_SUA_LUAT_CHUNG, TrangBanDo } from '../src/trang/ban-do';
import type { HoSo } from '../src/api';
import { MayChuGia, dung } from './giup';
import { manHinhTicket, ticketDayDu } from './than-ticket';
import { GIO, manHinhPhien, phienDong } from './than-agent';

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true);
  });
  vi.restoreAllMocks();
});

/** Một cửa treo: chờ tới khi `mo()`. */
function cuaTreo(): { cho: Promise<void>; mo: () => void } {
  let mo = (): void => undefined;
  const cho = new Promise<void>((r) => {
    mo = () => r();
  });
  return { cho, mo };
}

const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Vỏ giả: một nút đổi prop đích của cùng một component (như chủ bấm sang đích khác). */
function VoDoi({
  a,
  b,
  ve,
}: {
  a: string;
  b: string;
  ve: (dich: string) => JSX.Element;
}): JSX.Element {
  const [dich, datDich] = useState(a);
  return (
    <>
      <button type="button" onClick={() => datDich(b)}>
        sang đích B
      </button>
      {ve(dich)}
    </>
  );
}

function sangB(): void {
  fireEvent.click(screen.getByRole('button', { name: 'sang đích B' }));
}

/* ================================================================== *
 * 1. useSuaTicket — đổi thẻ khi onMutate còn chờ cancelQueries
 * ================================================================== */

describe('BAT-29 useSuaTicket: tiêu đề ghi vào thẻ LÚC BẤM, không thẻ đang mở', () => {
  it('Lưu tiêu đề thẻ A, onMutate chờ cancelQueries, panel đổi sang B, nhả ⇒ PATCH tk-A (không tk-B)', async () => {
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-ticket/ma/SAI-1', { than: manHinhTicket(ticketDayDu({ ma: 'SAI-1' })) })
      .dat('GET /v1/man-hinh-ticket/ma/SAI-2', {
        than: manHinhTicket(ticketDayDu({ ma: 'SAI-2', tieu_de: 'Thẻ B' })),
      })
      .dat('PATCH /v1/ticket/tk-SAI-1', { than: { ok: true } })
      .dat('PATCH /v1/ticket/tk-SAI-2', { than: { ok: true } })
      .gan();
    const { qc } = dung(
      <VoDoi a="SAI-1" b="SAI-2" ve={(ma) => <ThanChiTietTicket ma={ma} />} />,
      '/t/SAI-1',
    );
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-1');
    });

    const treo = cuaTreo();
    const huy = vi.spyOn(qc, 'cancelQueries').mockImplementationOnce(() => treo.cho);
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="sua-tieu-de"]')!);
    fireEvent.change(document.querySelector<HTMLInputElement>('[data-o-nhap="tieu-de"]')!, {
      target: { value: 'Tiêu đề của A' },
    });
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="luu-tieu-de"]')!);
    await waitFor(() => {
      expect(huy).toHaveBeenCalledTimes(1);
    });

    sangB();
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-2');
    });
    expect(m.da_goi.filter((l) => l.method === 'PATCH')).toHaveLength(0);

    treo.mo();
    await waitFor(() => {
      expect(m.soLan('PATCH', '/v1/ticket/tk-SAI-1')).toBe(1);
    });
    await doi(50);
    expect(m.soLan('PATCH', '/v1/ticket/tk-SAI-2')).toBe(0);
    expect(m.da_goi.find((l) => l.method === 'PATCH')?.than).toEqual({ tieu_de: 'Tiêu đề của A' });
  });
});

/* ================================================================== *
 * 2. useDungPhien — đổi /phien/:id khi onMutate còn chờ cancelQueries
 * ================================================================== */

describe('BAT-29 useDungPhien: Dừng đúng phiên LÚC BẤM', () => {
  it('bấm Dừng ph-1, onMutate chờ cancelQueries, sang ph-2, nhả ⇒ POST ph-1/dung (không ph-2)', async () => {
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-phien/ph-1', { than: manHinhPhien() })
      .dat('GET /v1/man-hinh-phien/ph-2', { than: manHinhPhien({ phien: phienDong({ id: 'ph-2' }) }) })
      .dat('POST /v1/phien/ph-1/dung', { than: { ok: true } })
      .dat('POST /v1/phien/ph-2/dung', { than: { ok: true } })
      .gan();
    const { qc } = dung(
      <VoDoi a="ph-1" b="ph-2" ve={(id) => <TrangPhien id={id} />} />,
      '/phien/ph-1',
    );
    const nut = await screen.findByRole('button', { name: 'Dừng' });

    const treo = cuaTreo();
    const huy = vi.spyOn(qc, 'cancelQueries').mockImplementationOnce(() => treo.cho);
    fireEvent.click(nut);
    await waitFor(() => {
      expect(huy).toHaveBeenCalledTimes(1);
    });

    sangB();
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/man-hinh-phien/ph-2')).toBe(1);
      expect(screen.getByRole('button', { name: 'Dừng' })).toBeTruthy();
    });

    treo.mo();
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/phien/ph-1/dung')).toBe(1);
    });
    await doi(50);
    expect(m.soLan('POST', '/v1/phien/ph-2/dung')).toBe(0);
  });
});

/* ================================================================== *
 * 3–4. Hồ sơ dự án — Lưu và Lỗi đã gặp, đổi dự án khi mutation dừng vì mất mạng
 * ================================================================== */

const PJ_A = 'pj-SAI';
const PJ_B = 'pj-COS';

function hoSo(project_id: string, ma: string, ten: string, la_gi: string | null): HoSo {
  return {
    la_gi,
    thu_muc: null,
    repo_chu_so_huu: null,
    repo_ten: null,
    repo_nhanh_mac_dinh: null,
    stack: null,
    doc_truoc: null,
    cach_deploy: null,
    danh_sach_cam: null,
    project_id,
    bay_gio: GIO,
    phien_ban: 1,
    cap_nhat_luc: null,
    khong_code: false,
    bat_buoc_review: false,
    du_an: {
      id: project_id,
      ma,
      ten,
      quan_ly_agent_id: null,
      quan_ly_agent_ten: null,
      trang_thai: 'active',
      uu_tien: 3,
      dang_day: false,
      duy_tri: false,
      nhom: null,
      dat_boi: null,
    },
    loi_da_gap: [],
    lich_su_ban: [],
  };
}

/**
 * Dựng trang hồ sơ dự án A, **nạp sẵn** cache hồ sơ B (mất mạng thì GET B không
 * chạy — B phải vẽ được ngay khi đổi, đúng ca "đã xem B trước đó").
 */
async function dungHoSo(
  /** BAT-30: giữ phản hồi PATCH / POST của dự án A tới khi promise này xong. */
  cho_a?: { patch?: Promise<unknown>; post?: Promise<unknown> },
): Promise<MayChuGia & { qc: QueryClient }> {
  const m = new MayChuGia()
    .dat(`GET /v1/du-an/${PJ_A}/ho-so`, { than: hoSo(PJ_A, 'SAI', 'Sample', 'Cũ A') })
    .dat(`GET /v1/du-an/${PJ_B}/ho-so`, { than: hoSo(PJ_B, 'COS', 'Chief of Staff', 'Cũ B') })
    .dat(`PATCH /v1/du-an/${PJ_A}/ho-so`, {
      than: { project_id: PJ_A, phien_ban: 2, da_doi: ['la_gi'] },
      ...(cho_a?.patch === undefined ? {} : { cho: cho_a.patch }),
    })
    .dat(`PATCH /v1/du-an/${PJ_B}/ho-so`, { than: { project_id: PJ_B, phien_ban: 2, da_doi: ['la_gi'] } })
    .dat(`POST /v1/du-an/${PJ_A}/loi-da-gap`, {
      than: { id: 'ld-1', ngay: '2025-10-09' },
      ...(cho_a?.post === undefined ? {} : { cho: cho_a.post }),
    })
    .dat(`POST /v1/du-an/${PJ_B}/loi-da-gap`, { than: { id: 'ld-1', ngay: '2025-10-09' } })
    .gan();
  const { qc } = dung(
    <VoDoi a={PJ_A} b={PJ_B} ve={(id) => <TrangHoSoDuAn id={id} />} />,
    `/du-an/${PJ_A}/ho-so`,
  );
  qc.setQueryData(['ho-so', PJ_B], hoSo(PJ_B, 'COS', 'Chief of Staff', 'Cũ B'));
  await screen.findByRole('heading', { name: 'Sample' });
  return Object.assign(m, { qc });
}

async function doiSangBRoiCoMang(): Promise<void> {
  sangB();
  await screen.findByRole('heading', { name: 'Chief of Staff' });
  act(() => {
    onlineManager.setOnline(true);
  });
}

describe('BAT-29 hồ sơ dự án: ghi vào dự án LÚC BẤM', () => {
  it('Lưu hồ sơ A khi mất mạng, sang hồ sơ B, có mạng lại ⇒ PATCH hồ sơ A với thân của A (không B)', async () => {
    const m = await dungHoSo();
    await userEvent.click(screen.getByRole('button', { name: NHAN_SUA_HO_SO }));
    const o = document.querySelector<HTMLTextAreaElement>('[data-nhap="la_gi"]')!;
    fireEvent.change(o, { target: { value: 'Mới A' } });

    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.click(screen.getByRole('button', { name: NHAN_LUU_HO_SO }));
    await doi(20);
    expect(m.da_goi.filter((l) => l.method === 'PATCH')).toHaveLength(0);

    await doiSangBRoiCoMang();
    await waitFor(() => {
      expect(m.soLan('PATCH', `/v1/du-an/${PJ_A}/ho-so`)).toBe(1);
    });
    await doi(50);
    expect(m.soLan('PATCH', `/v1/du-an/${PJ_B}/ho-so`)).toBe(0);
    expect(m.da_goi.find((l) => l.method === 'PATCH')?.than).toEqual({ la_gi: 'Mới A' });
  });

  it('Ghi "Lỗi đã gặp" cho A khi mất mạng, sang B, có mạng lại ⇒ POST loi-da-gap của A (không B)', async () => {
    const m = await dungHoSo();
    await userEvent.click(screen.getByRole('button', { name: NHAN_THEM_LOI }));
    fireEvent.change(document.querySelector<HTMLTextAreaElement>('[data-nhap="loi"]')!, {
      target: { value: 'Lỗi của A' },
    });

    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_LOI }));
    await doi(20);
    expect(m.da_goi.filter((l) => l.method === 'POST')).toHaveLength(0);

    await doiSangBRoiCoMang();
    await waitFor(() => {
      expect(m.soLan('POST', `/v1/du-an/${PJ_A}/loi-da-gap`)).toBe(1);
    });
    await doi(50);
    expect(m.soLan('POST', `/v1/du-an/${PJ_B}/loi-da-gap`)).toBe(0);
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({
      loi: 'Lỗi của A',
      cach_tranh: null,
    });
  });
});

/* ================================================================== *
 * BAT-30 việc 1 — bản nháp theo dự án: đổi `:id` giữ nguyên instance của trang
 * (cùng phần tử route, như `VoDoi`) nên state nháp phải có `key` theo dự án.
 * ================================================================== */

describe('BAT-30 hồ sơ dự án: bản nháp thuộc về dự án, không đi theo instance', () => {
  const o_la_gi = (): HTMLTextAreaElement | null =>
    document.querySelector<HTMLTextAreaElement>('[data-nhap="la_gi"]');
  const o_loi = (): HTMLTextAreaElement | null =>
    document.querySelector<HTMLTextAreaElement>('[data-nhap="loi"]');

  it('đang Sửa hồ sơ ở A (đã gõ), sang B ⇒ B ở chế độ đọc, không ô nào mang bản nháp của A', async () => {
    await dungHoSo();
    await userEvent.click(screen.getByRole('button', { name: NHAN_SUA_HO_SO }));
    fireEvent.change(o_la_gi()!, { target: { value: 'Nháp của A' } });

    sangB();
    await screen.findByRole('heading', { name: 'Chief of Staff' });
    expect(o_la_gi()).toBeNull();
    expect(screen.getByRole('button', { name: NHAN_SUA_HO_SO })).toBeTruthy();
    // Mở sửa ở B: ô mang giá trị CỦA B, không phải nháp của A.
    await userEvent.click(screen.getByRole('button', { name: NHAN_SUA_HO_SO }));
    expect(o_la_gi()!.value).toBe('Cũ B');
  });

  it('đang mở ô "Lỗi đã gặp" ở A (đã gõ), sang B ⇒ ô đóng, không mang chữ của A', async () => {
    await dungHoSo();
    await userEvent.click(screen.getByRole('button', { name: NHAN_THEM_LOI }));
    fireEvent.change(o_loi()!, { target: { value: 'Lỗi nháp của A' } });

    sangB();
    await screen.findByRole('heading', { name: 'Chief of Staff' });
    expect(o_loi()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: NHAN_THEM_LOI }));
    expect(o_loi()!.value).toBe('');
  });

  it('Lưu A treo, sang B, mở sửa và gõ; A về thành công ⇒ bản nháp ở B còn nguyên (và A vẫn được làm mới)', async () => {
    const treo = cuaTreo();
    const m = await dungHoSo({ patch: treo.cho });
    await userEvent.click(screen.getByRole('button', { name: NHAN_SUA_HO_SO }));
    fireEvent.change(o_la_gi()!, { target: { value: 'Mới A' } });
    fireEvent.click(screen.getByRole('button', { name: NHAN_LUU_HO_SO }));
    await waitFor(() => {
      expect(m.soLan('PATCH', `/v1/du-an/${PJ_A}/ho-so`)).toBe(1);
    });

    sangB();
    await screen.findByRole('heading', { name: 'Chief of Staff' });
    await userEvent.click(screen.getByRole('button', { name: NHAN_SUA_HO_SO }));
    fireEvent.change(o_la_gi()!, { target: { value: 'Đang gõ dở ở B' } });

    expect(m.qc.getQueryState(['ho-so', PJ_A])?.isInvalidated).toBe(false);
    treo.mo();
    // Làm mới sau Lưu vẫn đi đúng khoá của A (khoá nằm trong biến mutate); A không
    // còn người xem nên chỉ bị đánh dấu cũ, B thì không.
    await waitFor(() => {
      expect(m.qc.getQueryState(['ho-so', PJ_A])?.isInvalidated).toBe(true);
    });
    await doi(50);
    expect(m.qc.getQueryState(['ho-so', PJ_B])?.isInvalidated).toBe(false);
    expect(o_la_gi()!.value).toBe('Đang gõ dở ở B');
    expect(m.soLan('PATCH', `/v1/du-an/${PJ_B}/ho-so`)).toBe(0);
  });

  it('Ghi lỗi A treo, sang B, mở ô và gõ; A về thành công ⇒ chữ đang gõ ở B còn nguyên', async () => {
    const treo = cuaTreo();
    const m = await dungHoSo({ post: treo.cho });
    await userEvent.click(screen.getByRole('button', { name: NHAN_THEM_LOI }));
    fireEvent.change(o_loi()!, { target: { value: 'Lỗi của A' } });
    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_LOI }));
    await waitFor(() => {
      expect(m.soLan('POST', `/v1/du-an/${PJ_A}/loi-da-gap`)).toBe(1);
    });

    sangB();
    await screen.findByRole('heading', { name: 'Chief of Staff' });
    await userEvent.click(screen.getByRole('button', { name: NHAN_THEM_LOI }));
    fireEvent.change(o_loi()!, { target: { value: 'Lỗi đang gõ ở B' } });

    treo.mo();
    await doi(80);
    expect(o_loi()!.value).toBe('Lỗi đang gõ ở B');
    expect(m.soLan('POST', `/v1/du-an/${PJ_B}/loi-da-gap`)).toBe(0);
  });
});

/* ================================================================== *
 * BAT-31 việc 1 — Lỗi đã gặp: mỗi ô chỉ về rỗng khi còn TRÙNG nội dung đã gửi
 * ================================================================== */

describe('BAT-31 hồ sơ dự án: "Lỗi đã gặp" thành công chỉ xoá phần đã gửi', () => {
  const o = (ten: string): HTMLTextAreaElement =>
    document.querySelector<HTMLTextAreaElement>(`[data-nhap="${ten}"]`)!;

  async function dungLoi(cach_tranh: string): Promise<{ m: MayChuGia & { qc: QueryClient }; mo: () => void }> {
    const treo = cuaTreo();
    const m = await dungHoSo({ post: treo.cho });
    await userEvent.click(screen.getByRole('button', { name: NHAN_THEM_LOI }));
    fireEvent.change(o('loi'), { target: { value: 'Lỗi A' } });
    fireEvent.change(o('cach-tranh'), { target: { value: cach_tranh } });
    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_LOI }));
    await waitFor(() => {
      expect(m.soLan('POST', `/v1/du-an/${PJ_A}/loi-da-gap`)).toBe(1);
    });
    return { m, mo: treo.mo };
  }

  it('lưu treo, gõ thêm vào ô "Lỗi" ⇒ ô "Lỗi" giữ chữ mới, ô "Cách tránh" (không đổi) về rỗng', async () => {
    const { mo } = await dungLoi('Cách A');
    fireEvent.change(o('loi'), { target: { value: 'Lỗi A và lỗi nữa' } });
    mo();
    await waitFor(() => {
      expect(o('cach-tranh').value).toBe('');
    });
    expect(o('loi').value).toBe('Lỗi A và lỗi nữa');
  });

  it('lưu treo, gõ thêm vào ô "Cách tránh" ⇒ ô "Cách tránh" giữ chữ mới, ô "Lỗi" về rỗng', async () => {
    const { mo } = await dungLoi('Cách A');
    fireEvent.change(o('cach-tranh'), { target: { value: 'Cách A, thêm cách B' } });
    mo();
    await waitFor(() => {
      expect(o('loi').value).toBe('');
    });
    expect(o('cach-tranh').value).toBe('Cách A, thêm cách B');
  });

  it('đã gửi "Cách tránh" trắng (thân null), gõ chữ vào ô đó trong lúc treo ⇒ chữ mới giữ', async () => {
    const { m, mo } = await dungLoi('   ');
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({ loi: 'Lỗi A', cach_tranh: null });
    fireEvent.change(o('cach-tranh'), { target: { value: 'Mới gõ' } });
    mo();
    await waitFor(() => {
      expect(o('loi').value).toBe('');
    });
    expect(o('cach-tranh').value).toBe('Mới gõ');
  });

  it('đối chứng: không gõ thêm ⇒ cả hai ô về rỗng', async () => {
    const { mo } = await dungLoi('Cách A');
    mo();
    await waitFor(() => {
      expect(o('loi').value).toBe('');
      expect(o('cach-tranh').value).toBe('');
    });
  });

  it('đối chứng: "Cách tránh" trắng đã gửi, không gõ thêm ⇒ ô về rỗng (kể cả khoảng trắng)', async () => {
    const { mo } = await dungLoi('   ');
    mo();
    await waitFor(() => {
      expect(o('cach-tranh').value).toBe('');
    });
  });
});

/* ================================================================== *
 * BAT-30 việc 2 — Nhật ký: ô chỉ về rỗng khi còn TRÙNG nội dung đã gửi
 * ================================================================== */

describe('BAT-30 nhật ký: thành công chỉ xoá phần đã gửi, không xoá phần gõ thêm', () => {
  async function dungNhatKy(): Promise<{ m: MayChuGia; mo: () => void }> {
    const treo = cuaTreo();
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-nhat-ky', {
        than: { items: [], cursor_sau: null, nhom_theo_ngay: [], bay_gio: GIO },
      })
      .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/agent', { than: { items: [], cursor_sau: null } })
      .dat('POST /v1/nhat-ky', {
        than: { id: 'nk-1', luc: GIO, canh_bao: [] },
        cho: treo.cho,
      })
      .gan();
    dung(<TrangNhatKy />, '/nhat-ky');
    await userEvent.click(await screen.findByRole('button', { name: NHAN_GHI_DONG }));
    fireEvent.change(document.querySelector('[data-nhap="quyet-dinh"]')!, {
      target: { value: 'Chốt D1' },
    });
    fireEvent.change(document.querySelector('[data-nhap="vi-sao"]')!, {
      target: { value: 'Rẻ nhất' },
    });
    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_DONG }));
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/nhat-ky')).toBe(1);
    });
    return { m, mo: treo.mo };
  }
  const o = (ten: string): HTMLTextAreaElement =>
    document.querySelector<HTMLTextAreaElement>(`[data-nhap="${ten}"]`)!;

  it('Ghi treo, gõ thêm vào ô quyết định, nhả thành công ⇒ ô quyết định giữ chữ mới, ô vì sao (không đổi) về rỗng', async () => {
    const { m, mo } = await dungNhatKy();
    fireEvent.change(o('quyet-dinh'), { target: { value: 'Chốt D1 và thêm D2' } });
    mo();
    await waitFor(() => {
      expect(o('vi-sao').value).toBe('');
    });
    expect(o('quyet-dinh').value).toBe('Chốt D1 và thêm D2');
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toMatchObject({
      quyet_dinh: 'Chốt D1',
      vi_sao: 'Rẻ nhất',
    });
  });

  it('đối chứng: không gõ thêm ⇒ cả hai ô về rỗng', async () => {
    const { mo } = await dungNhatKy();
    mo();
    await waitFor(() => {
      expect(o('quyet-dinh').value).toBe('');
      expect(o('vi-sao').value).toBe('');
    });
  });
});

/* ================================================================== *
 * 5. Nhật ký — dự án của dòng là dự án LÚC BẤM, không ô chọn lúc gửi
 * ================================================================== */

describe('BAT-29 nhật ký: dòng ghi vào dự án đã chọn LÚC BẤM', () => {
  it('chọn dự án SAI, bấm Ghi khi mất mạng, đổi ô dự án sang Chung, có mạng lại ⇒ POST mang project_id SAI', async () => {
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-nhat-ky', {
        than: { items: [], cursor_sau: null, nhom_theo_ngay: [], bay_gio: GIO },
      })
      .dat('GET /v1/du-an?limit=200', {
        than: {
          items: [{ id: PJ_A, ma: 'SAI', ten: 'Sample', trang_thai: 'active', nhom: null }],
          cursor_sau: null,
        },
      })
      .dat('GET /v1/agent', { than: { items: [], cursor_sau: null } })
      .dat('POST /v1/nhat-ky', { than: { id: 'nk-1', luc: GIO, canh_bao: [] } })
      .gan();
    dung(<TrangNhatKy />, '/nhat-ky');
    await userEvent.click(await screen.findByRole('button', { name: NHAN_GHI_DONG }));
    fireEvent.change(document.querySelector('[data-nhap="quyet-dinh"]')!, {
      target: { value: 'Chốt D1' },
    });
    fireEvent.change(document.querySelector('[data-nhap="vi-sao"]')!, {
      target: { value: 'Rẻ nhất' },
    });
    const chon = document.querySelector<HTMLSelectElement>('[data-nhap="du-an"]')!;
    await waitFor(() => {
      expect(chon.querySelector(`option[value="${PJ_A}"]`)).not.toBeNull();
    });
    fireEvent.change(chon, { target: { value: PJ_A } });

    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_DONG }));
    await doi(20);
    expect(m.soLan('POST', '/v1/nhat-ky')).toBe(0);

    fireEvent.change(chon, { target: { value: '' } });
    act(() => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/nhat-ky')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({
      quyet_dinh: 'Chốt D1',
      vi_sao: 'Rẻ nhất',
      project_id: PJ_A,
    });
  });
});

/* ================================================================== *
 * 6. Luật chung — thân là thân LÚC BẤM, không ô nhập lúc gửi
 * ================================================================== */

describe('BAT-29 Luật chung: thân PUT là thân lúc bấm Lưu', () => {
  it('bấm Lưu khi mất mạng, gõ tiếp vào ô, có mạng lại ⇒ PUT mang đúng nội dung lúc bấm', async () => {
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-ban-do', {
        than: {
          bay_gio: GIO,
          du_an: [],
          luat_chung: { danh_sach_cam: null, checklist: null, cap_nhat_luc: null },
          so_con_lai: 0,
        },
      })
      .dat('PUT /v1/luat-chung', { than: { workspace_id: 'ws', da_doi: ['checklist'] } })
      .gan();
    dung(<TrangBanDo />, '/ban-do-du-an');
    await userEvent.click(await screen.findByRole('button', { name: NHAN_SUA_LUAT_CHUNG }));
    const o = document.querySelector<HTMLTextAreaElement>('[data-nhap="checklist"]')!;
    fireEvent.change(o, { target: { value: 'Bản lúc bấm' } });

    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.click(screen.getByRole('button', { name: NHAN_LUU_LUAT_CHUNG }));
    await doi(20);
    expect(m.soLan('PUT', '/v1/luat-chung')).toBe(0);

    fireEvent.change(o, { target: { value: 'Bản gõ SAU khi bấm' } });
    act(() => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => {
      expect(m.soLan('PUT', '/v1/luat-chung')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'PUT')?.than).toEqual({ checklist: 'Bản lúc bấm' });
  });
});
