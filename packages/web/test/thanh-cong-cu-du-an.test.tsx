/**
 * **Thanh công cụ dự án** — SPEC 20.8 (Chủ chốt 04/11/2026, T-131), phía giao diện.
 *
 *   A. Thẻ dự án trên bản đồ Tổng quan: đổi Trạng thái / Ưu tiên hiện **ngay**
 *      (thẻ đổi làn, đồng hồ WIP) trước khi máy chủ trả lời; máy chủ từ chối ⇒
 *      hoàn lại + toast câu lỗi nguyên văn; "Đặt bởi"; ô Nhóm; bấm ô không điều
 *      hướng thẻ.
 *   B. Đầu trang dự án (hồ sơ): cùng thanh, dự án lưu trữ khoá ô Trạng thái.
 *   C. Hàm thuần áp thay đổi vào cache.
 */

import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { DuAnChiTiet, HangDuAn, HoSo, ThanSuaDuAn, TongQuan } from '../src/api';
import { TEN_KHOI, TrangTongQuan } from '../src/trang/tong-quan';
import { TrangHoSoDuAn, apHoSo } from '../src/trang/ho-so-du-an';
import { TrangDanhSachTicket } from '../src/trang/danh-sach-ticket';
import { apTongQuan, nhanWip } from '../src/vo/ban-do-tong-quan';
import {
  NHAN_LUU_TRU,
  apThanDuAn,
  cacNhom,
  cauDatBoi,
  chuyenGocSauLoi,
  hoanLanDoi,
  taoLanDoi,
  type GiaTriDuAnCongCu,
  type SuaDuAnTrong,
} from '../src/vo/thanh-cong-cu-du-an';
import { MayChuGia, dung, type TraLoi } from './giup';
import { GIO, PHUT, TONG_QUAN_RONG, hangDuAn } from './than-tong-quan';
import { THAN_AGENT, THAN_DU_AN, manHinhDanhSach } from './than-ticket';

/** Biến đổi "áp thân" — dạng mà `apTongQuan`/`apHoSo` nhận. */
const theoThan =
  (than: ThanSuaDuAn): SuaDuAnTrong =>
  (d) =>
    apThanDuAn(d, than);

/* ------------------------------------------------------------------ *
 * Thân giả
 * ------------------------------------------------------------------ */

const DU_AN: HangDuAn[] = [
  hangDuAn({ ma: 'SAI', ten: 'Sample', nhom: 'Sample', dang_day: true, uu_tien: 5 }),
  hangDuAn({
    ma: 'INA',
    ten: 'Incubator',
    nhom: 'INC',
    uu_tien: 2,
    dat_boi: { loai: 'agent', ten: 'M-Inc', luc: GIO - 5 * PHUT },
  }),
  hangDuAn({ ma: 'APP', ten: 'App phụ', nhom: null, trang_thai: 'paused', nhan_trang_thai: 'Tạm dừng' }),
];

const THAN: TongQuan = {
  ...TONG_QUAN_RONG,
  du_an: DU_AN,
  ban_do: { ten_chu: 'Chủ', wip: { dang_day: 1, gioi_han: 3, vuot: false } },
};

function hoaHen(): { cho: Promise<unknown>; tha: () => void } {
  let tha: () => void = () => undefined;
  const cho = new Promise<unknown>((r) => {
    tha = () => {
      r(undefined);
    };
  });
  return { cho, tha };
}

async function moTongQuan(m: MayChuGia): Promise<ReturnType<typeof dung>> {
  m.gan();
  const r = dung(<TrangTongQuan />);
  await screen.findByRole('region', { name: TEN_KHOI.du_an });
  return r;
}

const the = (ma: string): HTMLElement => document.querySelector(`article[data-du-an="${ma}"]`) as HTMLElement;
/** Giá trị đang chọn của một ô (combobox) theo nhãn truy cập. */
const giaTriO = (ten: string, goc: HTMLElement = document.body): string =>
  within(goc).getByRole<HTMLSelectElement | HTMLInputElement>('combobox', { name: ten }).value;
const lanCua = (ma: string): string | null =>
  document.querySelector(`article[data-du-an="${ma}"]`)?.closest('[data-lan]')?.getAttribute('data-lan') ?? null;

/* ================================================================== *
 * A. Thẻ dự án trên Tổng quan
 * ================================================================== */

describe('A. 20.8 thanh công cụ trên thẻ dự án (Tổng quan)', () => {
  it('đổi Trạng thái ⇒ thẻ đổi làn + đồng hồ WIP NGAY, trước khi máy chủ trả lời; thân PATCH đúng', async () => {
    const h = hoaHen();
    const m = new MayChuGia()
      .dat('GET /v1/tong-quan', { than: THAN })
      .dat('PATCH /v1/du-an/pj-INA', { than: { id: 'pj-INA', da_doi: ['dang_day'] }, cho: h.cho });
    await moTongQuan(m);
    expect(lanCua('INA')).toBe('hang_cho');

    const o = within(the('INA')).getByRole('combobox', { name: 'Trạng thái của Incubator' });
    fireEvent.change(o, { target: { value: 'dang_day' } });

    await waitFor(() => {
      expect(lanCua('INA')).toBe('dang_day');
    });
    expect(document.querySelector('[data-o="wip-chu"]')?.textContent).toBe(nhanWip(2, 3));
    expect(m.da_goi.filter((l) => l.method === 'PATCH').map((l) => l.than)).toEqual([
      { trang_thai_ban_do: 'dang_day' },
    ]);
    // Máy chủ CHƯA trả lời: lượt PATCH vẫn treo.
    expect(m.soLan('GET', '/v1/tong-quan')).toBe(1);

    await act(async () => {
      h.tha();
      await h.cho;
    });
    // Xong ⇒ làm mới Tổng quan (để "Đặt bởi" đúng).
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/tong-quan')).toBe(2);
    });
  });

  it('đổi Ưu tiên ⇒ hiện ngay; chọn Tạm dừng ⇒ sang làn Tạm dừng', async () => {
    const h = hoaHen();
    const m = new MayChuGia()
      .dat('GET /v1/tong-quan', { than: THAN })
      .dat('PATCH /v1/du-an/pj-SAI', { than: { id: 'pj-SAI', da_doi: ['uu_tien'] }, cho: h.cho });
    await moTongQuan(m);

    fireEvent.change(within(the('SAI')).getByRole('combobox', { name: 'Ưu tiên của Sample' }), {
      target: { value: '1' },
    });
    await waitFor(() => {
      expect(the('SAI').querySelector('[data-o="uu-tien"]')?.textContent).toBe('Ưu tiên 1');
    });
    expect(giaTriO('Ưu tiên của Sample', the('SAI'))).toBe('1');
    expect(m.da_goi.find((l) => l.method === 'PATCH')?.than).toEqual({ uu_tien: 1 });

    fireEvent.change(within(the('SAI')).getByRole('combobox', { name: 'Trạng thái của Sample' }), {
      target: { value: 'tam_dung' },
    });
    await waitFor(() => {
      expect(lanCua('SAI')).toBe('tam_dung');
    });
    // Rời "Đang đẩy" ⇒ đồng hồ trừ một.
    expect(document.querySelector('[data-o="wip-chu"]')?.textContent).toBe(nhanWip(0, 3));
    await act(async () => {
      h.tha();
      await h.cho;
    });
  });

  it('máy chủ từ chối ⇒ hoàn lại giá trị cũ + toast ghi rõ lý do (nguyên văn)', async () => {
    const h = hoaHen();
    const ly_do = 'Manager chỉ đổi được trạng thái bản đồ của dự án mình quản lý (SPEC 20.8).';
    const m = new MayChuGia()
      .dat('GET /v1/tong-quan', { than: THAN })
      .dat('PATCH /v1/du-an/pj-INA', { http: 403, loi: { error: 'FORBIDDEN', message: ly_do }, cho: h.cho });
    await moTongQuan(m);

    fireEvent.change(within(the('INA')).getByRole('combobox', { name: 'Trạng thái của Incubator' }), {
      target: { value: 'tam_dung' },
    });
    await waitFor(() => {
      expect(lanCua('INA')).toBe('tam_dung');
    });

    await act(async () => {
      h.tha();
      await h.cho;
    });
    const toast = await screen.findByRole('alert');
    expect(toast.textContent).toContain(ly_do);
    await waitFor(() => {
      expect(lanCua('INA')).toBe('hang_cho');
    });
    expect(giaTriO('Trạng thái của Incubator', the('INA'))).toBe('hang_cho');
  });

  it('"Đặt bởi <tên> · <thời gian>" từ dat_boi; null ⇒ không hiện', async () => {
    await moTongQuan(new MayChuGia().dat('GET /v1/tong-quan', { than: THAN }));
    const dong = the('INA').querySelector('[data-o="dat-boi"]');
    expect(dong?.textContent).toBe('Đặt bởi M-Inc · 5 phút trước');
    expect(dong?.getAttribute('title')).toContain('giờ Việt Nam');
    expect(the('SAI').querySelector('[data-o="dat-boi"]')).toBeNull();
  });

  it('ô Nhóm hiện (web là giao diện của chủ), gợi ý nhóm đã có; Enter ghi; "Bỏ nhóm" gửi null', async () => {
    const m = new MayChuGia()
      .dat('GET /v1/tong-quan', { than: THAN })
      .dat('PATCH /v1/du-an/pj-APP', { than: { id: 'pj-APP', da_doi: ['nhom'] } })
      .dat('PATCH /v1/du-an/pj-SAI', { than: { id: 'pj-SAI', da_doi: ['nhom'] } });
    await moTongQuan(m);

    const o = within(the('APP')).getByRole<HTMLInputElement>('combobox', { name: 'Nhóm của App phụ' });
    const ds = document.getElementById(o.getAttribute('list') ?? '');
    expect([...(ds?.querySelectorAll('option') ?? [])].map((x) => x.getAttribute('value'))).toEqual(['INC', 'Sample']);
    // Chưa có nhóm ⇒ không có nút "Bỏ nhóm".
    expect(within(the('APP')).queryByRole('button', { name: 'Bỏ nhóm của App phụ' })).toBeNull();

    await userEvent.type(o, 'INC{Enter}');
    await waitFor(() => {
      expect(m.soLan('PATCH', '/v1/du-an/pj-APP')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.duong === '/v1/du-an/pj-APP')?.than).toEqual({ nhom: 'INC' });

    await userEvent.click(within(the('SAI')).getByRole('button', { name: 'Bỏ nhóm của Sample' }));
    await waitFor(() => {
      expect(m.soLan('PATCH', '/v1/du-an/pj-SAI')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.duong === '/v1/du-an/pj-SAI')?.than).toEqual({ nhom: null });
  });

  it('rời ô Nhóm mà không đổi ⇒ KHÔNG gửi', async () => {
    const m = new MayChuGia().dat('GET /v1/tong-quan', { than: THAN });
    await moTongQuan(m);
    const o = within(the('SAI')).getByRole('combobox', { name: 'Nhóm của Sample' });
    fireEvent.focus(o);
    fireEvent.blur(o);
    expect(m.da_goi.filter((l) => l.method === 'PATCH')).toEqual([]);
  });

  it('bấm / gõ phím trong ô chọn KHÔNG điều hướng thẻ; bấm phần khác của thẻ vẫn đi bảng việc', async () => {
    new MayChuGia()
      .dat('GET /v1/tong-quan', { than: THAN })
      .dat('PATCH /v1/du-an/pj-INA', { than: { id: 'pj-INA', da_doi: [] } })
      .gan();
    dung(
      <Routes>
        <Route path="/" element={<TrangTongQuan />} />
        <Route path="/du-an/:ma" element={<p>Trang bảng việc</p>} />
      </Routes>,
    );
    await screen.findByRole('region', { name: TEN_KHOI.du_an });

    const o = within(the('INA')).getByRole('combobox', { name: 'Ưu tiên của Incubator' });
    await userEvent.click(o);
    await userEvent.keyboard('{Enter}');
    await userEvent.click(within(the('INA')).getByRole('combobox', { name: 'Nhóm của Incubator' }));
    await userEvent.click(the('INA').querySelector('[data-thanh-cong-cu]') as Element);
    expect(screen.queryByText('Trang bảng việc')).toBeNull();
    expect(the('INA')).toBeTruthy();

    await userEvent.click(the('INA').querySelector('dl') as Element);
    expect(await screen.findByText('Trang bảng việc')).toBeTruthy();
  });

  it('mỗi ô có nhãn truy cập (aria-label) mang tên dự án', async () => {
    await moTongQuan(new MayChuGia().dat('GET /v1/tong-quan', { than: THAN }));
    const nhom = within(the('SAI')).getByRole('group', { name: 'Thanh công cụ dự án Sample' });
    for (const ten of ['Ưu tiên của Sample', 'Trạng thái của Sample', 'Nhóm của Sample']) {
      expect(within(nhom).getByRole('combobox', { name: ten })).toBeTruthy();
    }
    const tt = within(nhom).getByRole<HTMLSelectElement>('combobox', { name: 'Trạng thái của Sample' });
    expect([...tt.querySelectorAll('option')].map((x) => x.textContent)).toEqual([
      'Đang đẩy',
      'Hàng chờ',
      'Tạm dừng',
      'Duy trì',
    ]);
    expect(tt.value).toBe('dang_day');
  });
});

/* ================================================================== *
 * B. Đầu trang dự án (hồ sơ)
 * ================================================================== */

const PJ = 'pj-SAI';

function hoSo(du_an: Partial<HoSo['du_an']> = {}): HoSo {
  return {
    la_gi: null,
    thu_muc: null,
    repo_chu_so_huu: null,
    repo_ten: null,
    repo_nhanh_mac_dinh: null,
    stack: null,
    doc_truoc: null,
    cach_deploy: null,
    danh_sach_cam: null,
    project_id: PJ,
    bay_gio: GIO,
    phien_ban: 0,
    cap_nhat_luc: null,
    khong_code: false,
    bat_buoc_review: false,
    du_an: {
      id: PJ,
      ma: 'SAI',
      ten: 'Sample',
      quan_ly_agent_id: null,
      quan_ly_agent_ten: null,
      trang_thai: 'active',
      uu_tien: 3,
      dang_day: false,
      duy_tri: false,
      nhom: null,
      dat_boi: { loai: 'chu', ten: 'Chủ', luc: GIO - 2 * 60 * PHUT },
      ...du_an,
    },
    loi_da_gap: [],
    lich_su_ban: [],
  };
}

describe('B. 20.8 thanh công cụ ở đầu trang dự án', () => {
  it('hiện ba ô + "Đặt bởi"; đổi Trạng thái hiện ngay trước khi máy chủ trả lời', async () => {
    const h = hoaHen();
    const m = new MayChuGia()
      .dat(`GET /v1/du-an/${PJ}/ho-so`, { than: hoSo() })
      .dat(`PATCH /v1/du-an/${PJ}`, { than: { id: PJ, da_doi: ['duy_tri'] }, cho: h.cho })
      .gan();
    dung(<TrangHoSoDuAn id={PJ} />, `/du-an/${PJ}/ho-so`);
    const tt = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Trạng thái của Sample' });
    expect(tt.value).toBe('hang_cho');
    expect(screen.getByRole('combobox', { name: 'Ưu tiên của Sample' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Nhóm của Sample' })).toBeTruthy();
    expect(document.querySelector('[data-o="dat-boi"]')?.textContent).toBe('Đặt bởi Chủ · 2 giờ trước');

    fireEvent.change(tt, { target: { value: 'duy_tri' } });
    await waitFor(() => {
      expect(giaTriO('Trạng thái của Sample')).toBe('duy_tri');
    });
    expect(m.da_goi.find((l) => l.method === 'PATCH')?.than).toEqual({ trang_thai_ban_do: 'duy_tri' });
    await act(async () => {
      h.tha();
      await h.cho;
    });
  });

  it('máy chủ từ chối ⇒ hoàn lại + toast lý do', async () => {
    const ly_do = 'Dự án SAI đã lưu trữ — ô Trạng thái không áp cho dự án lưu trữ; chủ mở lại lưu trữ trước (SPEC 20.8).';
    new MayChuGia()
      .dat(`GET /v1/du-an/${PJ}/ho-so`, { than: hoSo() })
      .dat(`PATCH /v1/du-an/${PJ}`, { http: 409, loi: { error: 'PROJECT_NOT_ACCEPTING', message: ly_do } })
      .gan();
    dung(<TrangHoSoDuAn id={PJ} />, `/du-an/${PJ}/ho-so`);
    const uu = await screen.findByRole('combobox', { name: 'Ưu tiên của Sample' });
    fireEvent.change(uu, { target: { value: '5' } });
    expect((await screen.findByRole('alert')).textContent).toContain(ly_do);
    await waitFor(() => {
      expect(giaTriO('Ưu tiên của Sample')).toBe('3');
    });
  });

  it('dự án lưu trữ: ô Trạng thái bị khoá, ghi "Lưu trữ" (Lưu trữ không nằm trong ô)', async () => {
    new MayChuGia().dat(`GET /v1/du-an/${PJ}/ho-so`, { than: hoSo({ trang_thai: 'archived' }) }).gan();
    dung(<TrangHoSoDuAn id={PJ} />, `/du-an/${PJ}/ho-so`);
    const tt = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Trạng thái của Sample' });
    expect(tt.disabled).toBe(true);
    expect([...tt.querySelectorAll('option')].map((x) => x.textContent)).toEqual([NHAN_LUU_TRU]);
  });
});

/* ================================================================== *
 * C. Hàm thuần
 * ================================================================== */

describe('C. hàm thuần áp thay đổi (cache lạc quan)', () => {
  it('apThanDuAn theo bảng 20.8', () => {
    const goc = { trang_thai: 'paused', uu_tien: 3, dang_day: false, duy_tri: true, nhom: 'A' };
    expect(apThanDuAn(goc, { trang_thai_ban_do: 'dang_day' })).toMatchObject({
      trang_thai: 'active',
      dang_day: true,
      duy_tri: false,
    });
    expect(apThanDuAn(goc, { trang_thai_ban_do: 'tam_dung' })).toMatchObject({ trang_thai: 'paused', duy_tri: false });
    expect(apThanDuAn(goc, { uu_tien: 5, nhom: null })).toMatchObject({ uu_tien: 5, nhom: null, duy_tri: true });
  });

  it('apTongQuan: WIP cộng/trừ đúng phần dự án; vượt ⇒ vuot; nhãn trạng thái đổi; dự án lạ ⇒ giữ nguyên', () => {
    const t = { ...THAN, ban_do: { ten_chu: 'Chủ', wip: { dang_day: 1, gioi_han: 1, vuot: false } } };
    const moi = apTongQuan(t, 'pj-INA', theoThan({ trang_thai_ban_do: 'dang_day' }));
    expect(moi.ban_do.wip).toEqual({ dang_day: 2, gioi_han: 1, vuot: true });
    const tam = apTongQuan(t, 'pj-SAI', theoThan({ trang_thai_ban_do: 'tam_dung' }));
    expect(tam.ban_do.wip).toEqual({ dang_day: 0, gioi_han: 1, vuot: false });
    expect(tam.du_an.find((d) => d.id === 'pj-SAI')).toMatchObject({ trang_thai: 'paused', nhan_trang_thai: 'Tạm dừng' });
    expect(apTongQuan(t, 'pj-BIA', theoThan({ uu_tien: 1 }))).toBe(t);
  });

  it('apHoSo chỉ áp cho đúng dự án; cacNhom bỏ trống và trùng; cauDatBoi', () => {
    const hs = hoSo();
    expect(apHoSo(hs, 'pj-KHAC', theoThan({ uu_tien: 5 }))).toBe(hs);
    expect(apHoSo(hs, PJ, theoThan({ uu_tien: 5 })).du_an.uu_tien).toBe(5);
    expect(cacNhom([{ nhom: 'B' }, { nhom: null }, { nhom: 'A' }, { nhom: 'B' }, { nhom: '' }])).toEqual(['A', 'B']);
    expect(cauDatBoi({ loai: 'agent', ten: 'CoS', luc: GIO - 30_000 }, GIO)).toBe('Đặt bởi CoS · 30 giây trước');
  });

  it('hoanLanDoi: chỉ đảo nhóm của mình, chỉ khi cache vẫn là giá trị lạc quan của mình', () => {
    const goc: GiaTriDuAnCongCu = { trang_thai: 'active', uu_tien: 2, dang_day: false, duy_tri: false, nhom: null };
    const a = taoLanDoi(goc, { trang_thai_ban_do: 'dang_day' });
    const sau_a = apThanDuAn(goc, { trang_thai_ban_do: 'dang_day' });
    const sau_b = apThanDuAn(sau_a, { uu_tien: 1 });
    // A lỗi: trạng thái về cũ, ưu tiên của B đứng.
    expect(hoanLanDoi(sau_b, a)).toEqual({ ...goc, uu_tien: 1 });
    // Một lần đổi sau đã đè trạng thái ⇒ A không đụng.
    const de = apThanDuAn(sau_a, { trang_thai_ban_do: 'tam_dung' });
    expect(hoanLanDoi(de, a)).toEqual(de);
  });

  it('chuyenGocSauLoi: A lỗi trước ⇒ B (cùng nhóm, gốc = giá trị của A) lấy gốc của A', () => {
    const goc: GiaTriDuAnCongCu = { trang_thai: 'active', uu_tien: 2, dang_day: false, duy_tri: false, nhom: null };
    const a = taoLanDoi(goc, { trang_thai_ban_do: 'dang_day' });
    const b = taoLanDoi(apThanDuAn(goc, { trang_thai_ban_do: 'dang_day' }), { trang_thai_ban_do: 'tam_dung' });
    const c = taoLanDoi(goc, { uu_tien: 5 });
    chuyenGocSauLoi(a, [b, c]);
    const hien = apThanDuAn(goc, { trang_thai_ban_do: 'tam_dung' });
    expect(hoanLanDoi(hien, b)).toMatchObject({ trang_thai: 'active', dang_day: false, duy_tri: false });
    expect(c.cu).toEqual({ uu_tien: { uu_tien: 2 } });
  });
});

/* ================================================================== *
 * D. Đầu trang bảng việc của dự án (`/du-an/<MÃ>`)
 * ================================================================== */

const CHI_TIET: DuAnChiTiet = {
  id: 'pj-SAI',
  ma: 'SAI',
  ten: 'Sample',
  trang_thai: 'active',
  nhan_trang_thai: 'Đang chạy',
  uu_tien: 3,
  dang_day: false,
  duy_tri: false,
  nhom: null,
  dat_boi: { loai: 'agent', ten: 'M-Sai', luc: GIO - 3 * PHUT },
  bay_gio: GIO,
};

/** Máy chủ của bảng việc: danh sách dự án/agent, chi tiết dự án, màn hình ticket (mọi truy vấn). */
function mayBangViec(patch: TraLoi): MayChuGia {
  const m = new MayChuGia()
    .dat('GET /v1/du-an?limit=200', { than: THAN_DU_AN })
    .dat('GET /v1/agent', { than: THAN_AGENT })
    .dat('GET /v1/du-an/pj-SAI', { than: CHI_TIET })
    .dat('PATCH /v1/du-an/pj-SAI', patch)
    .gan();
  const goc = globalThis.fetch;
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    if (duong.startsWith('/v1/man-hinh-ticket')) {
      return Promise.resolve(
        new Response(JSON.stringify(manHinhDanhSach([])), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return goc(duong, init);
  }) as typeof globalThis.fetch;
  return m;
}

describe('D. 20.8 thanh công cụ ở đầu bảng việc của dự án', () => {
  it('thanh hiện (dữ liệu từ GET /v1/du-an/:id, gồm "Đặt bởi"); đổi hiện ngay trước khi máy chủ trả lời', async () => {
    const h = hoaHen();
    const m = mayBangViec({ than: { id: 'pj-SAI', da_doi: ['trang_thai'] }, cho: h.cho });
    dung(<TrangDanhSachTicket ma_du_an="SAI" />, '/du-an/SAI');
    const tt = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Trạng thái của Sample' });
    expect(tt.value).toBe('hang_cho');
    expect(screen.getByRole('combobox', { name: 'Ưu tiên của Sample' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Nhóm của Sample' })).toBeTruthy();
    expect(document.querySelector('[data-o="dat-boi"]')?.textContent).toBe('Đặt bởi M-Sai · 3 phút trước');
    expect(m.soLan('GET', '/v1/du-an/pj-SAI')).toBe(1);

    fireEvent.change(tt, { target: { value: 'tam_dung' } });
    await waitFor(() => {
      expect(giaTriO('Trạng thái của Sample')).toBe('tam_dung');
    });
    expect(m.da_goi.find((l) => l.method === 'PATCH')?.than).toEqual({ trang_thai_ban_do: 'tam_dung' });
    await act(async () => {
      h.tha();
      await h.cho;
    });
    // Xong ⇒ làm mới chi tiết dự án (để "Đặt bởi" đúng).
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/du-an/pj-SAI')).toBe(2);
    });
  });

  it('máy chủ từ chối ⇒ hoàn lại + toast lý do', async () => {
    const h = hoaHen();
    const ly_do = 'Chỉ chủ và agent coordinator sửa được ưu tiên, tên ngắn của dự án (SPEC 20.1, 20.8); vai manager thì không.';
    mayBangViec({ http: 403, loi: { error: 'FORBIDDEN', message: ly_do }, cho: h.cho });
    dung(<TrangDanhSachTicket ma_du_an="SAI" />, '/du-an/SAI');
    const uu = await screen.findByRole('combobox', { name: 'Ưu tiên của Sample' });
    fireEvent.change(uu, { target: { value: '5' } });
    await waitFor(() => {
      expect(giaTriO('Ưu tiên của Sample')).toBe('5');
    });
    await act(async () => {
      h.tha();
      await h.cho;
    });
    expect((await screen.findByRole('alert')).textContent).toContain(ly_do);
    await waitFor(() => {
      expect(giaTriO('Ưu tiên của Sample')).toBe('3');
    });
  });

  it('trang "Tất cả việc" (không dự án) KHÔNG có thanh, không gọi chi tiết dự án', async () => {
    const m = mayBangViec({ than: {} });
    dung(<TrangDanhSachTicket />, '/viec');
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('[data-thanh-cong-cu]')).toBeNull();
    expect(m.soLan('GET', '/v1/du-an/pj-SAI')).toBe(0);
  });
});

/* ================================================================== *
 * E. Hai lần đổi chồng nhau (lượt sửa sau review)
 * ================================================================== */

/**
 * Máy chủ Tổng quan với hai lượt PATCH treo, trả theo thứ tự gọi; mọi GET sau lần
 * đầu bị **giữ** cho tới cuối ca — để cache chỉ do phép hoàn lại quyết, không do
 * một lượt tải lại về kịp (không thì ca xanh dù hoàn sai).
 */
function mayChong(): {
  m: MayChuGia;
  a: ReturnType<typeof hoaHen>;
  b: ReturnType<typeof hoaHen>;
  cua_get: ReturnType<typeof hoaHen>;
} {
  const a = hoaHen();
  const b = hoaHen();
  const cua_get = hoaHen();
  let so_get = 0;
  let so_patch = 0;
  const LOI: TraLoi['loi'] = { error: 'FORBIDDEN', message: 'Từ chối thử.' };
  const m = new MayChuGia()
    .dat('GET /v1/tong-quan', () => {
      so_get += 1;
      return so_get === 1 ? { than: THAN } : { than: THAN, cho: cua_get.cho };
    })
    .dat('PATCH /v1/du-an/pj-INA', () => {
      so_patch += 1;
      return so_patch === 1 ? { http: 403, loi: LOI, cho: a.cho } : { http: 403, loi: LOI, cho: b.cho };
    });
  return { m, a, b, cua_get };
}

describe('E. đổi nhanh hai lần: hoàn lại không đè giá trị của lần kia', () => {
  it('A (trạng thái) lỗi TRƯỚC khi B (ưu tiên) còn bay ⇒ trạng thái về cũ, ưu tiên lạc quan của B giữ nguyên', async () => {
    const { m, a, b, cua_get } = mayChong();
    // B thành công: ghi đè lượt PATCH thứ hai.
    let n = 0;
    m.dat('PATCH /v1/du-an/pj-INA', () => {
      n += 1;
      return n === 1
        ? { http: 403, loi: { error: 'FORBIDDEN', message: 'A bị từ chối.' }, cho: a.cho }
        : { than: { id: 'pj-INA', da_doi: ['uu_tien'] }, cho: b.cho };
    });
    await moTongQuan(m);

    fireEvent.change(within(the('INA')).getByRole('combobox', { name: 'Trạng thái của Incubator' }), {
      target: { value: 'dang_day' },
    });
    await waitFor(() => {
      expect(lanCua('INA')).toBe('dang_day');
    });
    fireEvent.change(within(the('INA')).getByRole('combobox', { name: 'Ưu tiên của Incubator' }), {
      target: { value: '1' },
    });
    await waitFor(() => {
      expect(giaTriO('Ưu tiên của Incubator', the('INA'))).toBe('1');
    });

    await act(async () => {
      a.tha();
      await a.cho;
    });
    expect((await screen.findByRole('alert')).textContent).toContain('A bị từ chối.');
    await waitFor(() => {
      expect(lanCua('INA')).toBe('hang_cho');
    });
    expect(giaTriO('Ưu tiên của Incubator', the('INA'))).toBe('1');
    expect(document.querySelector('[data-o="wip-chu"]')?.textContent).toBe(nhanWip(1, 3));

    await act(async () => {
      b.tha();
      await b.cho;
      cua_get.tha();
      await cua_get.cho;
    });
  });

  it('cùng ô: A lỗi trước (B đã đè) ⇒ giữ giá trị B; rồi B lỗi ⇒ về giá trị THẬT, không về giá trị của A', async () => {
    const { m, a, b, cua_get } = mayChong();
    await moTongQuan(m);
    const chon = (v: string): void => {
      fireEvent.change(within(the('INA')).getByRole('combobox', { name: 'Trạng thái của Incubator' }), {
        target: { value: v },
      });
    };

    chon('dang_day');
    await waitFor(() => {
      expect(lanCua('INA')).toBe('dang_day');
    });
    chon('tam_dung');
    await waitFor(() => {
      expect(lanCua('INA')).toBe('tam_dung');
    });

    // A lỗi trước: B đã đè ô ⇒ B đứng.
    await act(async () => {
      a.tha();
      await a.cho;
    });
    await screen.findByRole('alert');
    expect(lanCua('INA')).toBe('tam_dung');

    // B lỗi sau: về "Hàng chờ" (giá trị thật), KHÔNG về "Đang đẩy" của A đã hỏng.
    await act(async () => {
      b.tha();
      await b.cho;
    });
    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
    expect(lanCua('INA')).toBe('hang_cho');
    expect(giaTriO('Trạng thái của Incubator', the('INA'))).toBe('hang_cho');
    expect(document.querySelector('[data-o="wip-chu"]')?.textContent).toBe(nhanWip(1, 3));
    // Cả ca: chưa lượt GET nào về sau lần đầu (cửa còn đóng).
    expect(m.soLan('GET', '/v1/tong-quan')).toBeLessThanOrEqual(2);

    await act(async () => {
      cua_get.tha();
      await cua_get.cho;
    });
  });

  it('cùng ô: B lỗi TRƯỚC khi A còn bay ⇒ về giá trị lạc quan của A (A vẫn đang bay)', async () => {
    const { m, a, b, cua_get } = mayChong();
    await moTongQuan(m);
    const chon = (v: string): void => {
      fireEvent.change(within(the('INA')).getByRole('combobox', { name: 'Trạng thái của Incubator' }), {
        target: { value: v },
      });
    };
    chon('dang_day');
    await waitFor(() => {
      expect(lanCua('INA')).toBe('dang_day');
    });
    chon('tam_dung');
    await waitFor(() => {
      expect(lanCua('INA')).toBe('tam_dung');
    });
    await act(async () => {
      b.tha();
      await b.cho;
    });
    await screen.findByRole('alert');
    expect(lanCua('INA')).toBe('dang_day');
    await act(async () => {
      a.tha();
      await a.cho;
    });
    await waitFor(() => {
      expect(lanCua('INA')).toBe('hang_cho');
    });
    await act(async () => {
      cua_get.tha();
      await cua_get.cho;
    });
  });
});
