/**
 * **Sidebar** — SPEC mục 14 d.391–394, mục 2 d.70–76.
 *
 * Bảng mong đợi **cắt ra từ `SPEC.md`** (xem `doc-spec.ts` cho lý lẽ): ca này
 * không so mã với một bản chép của mã.
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Sidebar } from '../src/vo/sidebar';
import { theoNhom } from '../src/vo/sidebar';
import { CAU_DU_AN_KHONG_CHAY, NHAN_CHUA_TINH } from '../src/vo/cham-suc-song';
import { MUC_CHINH, MUC_CUOI, NHOM_KHONG_TEN } from '../src/vo/muc-sidebar';
import type { DuAnSidebar } from '../src/api';
import { MayChuGia, dung } from './giup';
import { docMucSidebarTuSpec, specDoiNhomVaChamSucSong } from './doc-spec';

const SPEC = docMucSidebarTuSpec();

function duAn(p: Partial<DuAnSidebar> & { ma: string }): DuAnSidebar {
  return {
    id: `id-${p.ma}`,
    ten: p.ten ?? `Dự án ${p.ma}`,
    trang_thai: p.trang_thai ?? 'active',
    nhom: p.nhom ?? null,
    ...p,
  };
}

function mayVoi(
  du_an: DuAnSidebar[],
  huy_hieu: { so_cho: number; muc_cao_nhat: string | null } = {
    so_cho: 0,
    muc_cao_nhat: null,
  },
): MayChuGia {
  return new MayChuGia()
    .dat('GET /v1/du-an?limit=200', { than: { items: du_an, cursor_sau: null } })
    .dat('GET /v1/can-chu', { than: { huy_hieu } })
    .gan();
}

/** Nhãn của các mục d.391–394 đang hiện trên DOM, theo thứ tự DOM. */
async function nhanDangHien(): Promise<string[]> {
  const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
  return [...nav.querySelectorAll('[data-muc="chinh"] [data-nhan="co"]')].map(
    (e) => e.textContent ?? '',
  );
}

describe('d.391–394 — đủ mục, đúng thứ tự, đúng chữ của SPEC', () => {
  it('parser cắt ra đúng bảy nhãn từ SPEC (lưới của chính ca này)', () => {
    // Không có ca này thì một parser hỏng (trả danh sách ngắn) làm mọi ca dưới
    // thành vô nghĩa mà vẫn xanh.
    expect(SPEC.chinh.length).toBe(6);
    expect(SPEC.cuoi).toBe('Cài đặt');
  });

  it('sidebar vẽ ĐÚNG các nhãn SPEC liệt kê, đúng thứ tự, không thiếu không thừa', async () => {
    mayVoi([]);
    dung(<Sidebar />);
    expect(await nhanDangHien()).toEqual([...SPEC.chinh, SPEC.cuoi]);
  });

  it('BAT-7: Tổng quan đứng đầu, Cần Chủ thứ hai (thứ tự viết thẳng, không từ SPEC)', async () => {
    mayVoi([]);
    dung(<Sidebar />);
    expect((await nhanDangHien()).slice(0, 2)).toEqual(['Tổng quan', 'Cần Chủ']);
  });

  it('`muc-sidebar.ts` khớp SPEC (bắt lệch ngay ở sổ tra, không chỉ ở DOM)', () => {
    expect(MUC_CHINH.map((m) => m.nhan)).toEqual(SPEC.chinh);
    expect(MUC_CUOI.nhan).toBe(SPEC.cuoi);
  });

  it('d.394: Cài đặt là mục CUỐI CÙNG, sau cả danh sách dự án', async () => {
    mayVoi([duAn({ ma: 'BAT', nhom: 'N' })]);
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    // Chờ dự án về trước khi đo thứ tự: đo lúc danh sách còn rỗng thì ca này chỉ
    // nói "Cài đặt sau sáu mục", không nói "sau cả danh sách dự án".
    await screen.findByRole('region', { name: 'Nhóm dự án: N' });
    const moi = [...nav.querySelectorAll('[data-muc]')];
    const cuoi = moi[moi.length - 1];
    expect(cuoi?.textContent).toBe(SPEC.cuoi);
    // Và dự án nằm **giữa** sáu mục đầu và Cài đặt.
    const vi_tri_du_an = moi.findIndex((e) => e.getAttribute('data-muc') === 'du-an');
    expect(vi_tri_du_an).toBe(SPEC.chinh.length);
    expect(vi_tri_du_an).toBeLessThan(moi.length - 1);
  });

  it('mỗi mục trỏ tới một đường, và đường của Tổng quan là `/` (trang mặc định)', async () => {
    mayVoi([]);
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    const duong = [...nav.querySelectorAll('[data-muc="chinh"]')].map((e) =>
      e.getAttribute('href'),
    );
    expect(duong.length).toBe(SPEC.chinh.length + 1);
    expect(duong.every((d) => d !== null && d.startsWith('/'))).toBe(true);
    // Mục 11 d.315: Tổng quan là **trang mặc định**.
    const i = SPEC.chinh.indexOf('Tổng quan');
    expect(duong[i]).toBe('/');
  });
});

describe('d.391 — huy hiệu của Cần Chủ', () => {
  it('có mục Chờ ⇒ huy hiệu hiện ĐÚNG CON SỐ của `/v1/can-chu`', async () => {
    mayVoi([], { so_cho: 7, muc_cao_nhat: 'urgent' });
    dung(<Sidebar />);
    const hh = await screen.findByLabelText('7 mục Chờ');
    expect(hh.textContent).toBe('7');
  });

  it('không có mục Chờ ⇒ KHÔNG hiện huy hiệu (không hiện số 0)', async () => {
    mayVoi([], { so_cho: 0, muc_cao_nhat: null });
    dung(<Sidebar />);
    await nhanDangHien();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.querySelector('[data-huy-hieu="can-chu"]')).toBeNull();
  });

  it('huy hiệu nằm trên mục Cần Chủ, không trên mục khác', async () => {
    mayVoi([], { so_cho: 2, muc_cao_nhat: 'today' });
    dung(<Sidebar />);
    const hh = await screen.findByLabelText('2 mục Chờ');
    const lien = hh.closest('[data-muc="chinh"]');
    expect(lien?.querySelector('[data-nhan="co"]')?.textContent).toBe('Cần Chủ');
  });
});

describe('d.393 — dự án theo nhóm, mỗi dự án một chấm sức sống', () => {
  it('SPEC vẫn đòi đúng hai thứ này', () => {
    expect(specDoiNhomVaChamSucSong()).toBe(true);
  });

  it('dự án gom theo nhóm, mỗi nhóm một tiêu đề', async () => {
    mayVoi([
      duAn({ ma: 'SPX', ten: 'Sample web', nhom: 'Sample' }),
      duAn({ ma: 'INC', ten: 'INC Docs', nhom: 'INC' }),
      duAn({ ma: 'SPA', ten: 'Sample app', nhom: 'Sample' }),
    ]);
    dung(<Sidebar />);

    const nhom_spx = await screen.findByRole('region', { name: 'Nhóm dự án: Sample' });
    const nhom_inc = screen.getByRole('region', { name: 'Nhóm dự án: INC' });
    expect(within(nhom_spx).getAllByRole('link').length).toBe(2);
    expect(within(nhom_inc).getAllByRole('link').length).toBe(1);
    expect(within(nhom_spx).getByText('Sample web')).toBeTruthy();
    expect(within(nhom_inc).getByText('INC Docs')).toBeTruthy();
  });

  it('dự án chưa có nhóm vào nhóm riêng và xuống CUỐI', () => {
    const ra = theoNhom([
      duAn({ ma: 'KH1', nhom: null }),
      duAn({ ma: 'SPX', nhom: 'Sample' }),
      duAn({ ma: 'INC', nhom: 'INC' }),
    ]);
    expect(ra.map(([n]) => n)).toEqual(['INC', 'Sample', NHOM_KHONG_TEN]);
  });

  it('MỖI dự án có một chấm sức sống — đếm chấm bằng số dự án', async () => {
    const ds = [
      duAn({ ma: 'A', nhom: 'N1' }),
      duAn({ ma: 'B', nhom: 'N1' }),
      duAn({ ma: 'C', nhom: 'N2' }),
    ];
    mayVoi(ds);
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await screen.findByRole('region', { name: 'Nhóm dự án: N1' });
    expect(nav.querySelectorAll('[data-muc="du-an"] [data-suc-song]').length).toBe(ds.length);
  });

  it('`GET /v1/du-an` trả `suc_song` ⇒ chấm vẽ ĐÚNG giá trị máy chủ (nợ L2 đã trả)', async () => {
    /*
     * Lượt 3 của phần 6 làm `GET /v1/du-an` trả `suc_song` thật (`doc-suc-song.ts`,
     * luật ở hàm thuần `sucSongDuAn`). Ca này thay ca "chưa tính" của lượt 2 — nó
     * canh **trạng thái mới cho đúng**, chứ không bị xoá.
     */
    mayVoi([
      duAn({ ma: 'A', nhom: 'N1', suc_song: 'xanh' }),
      duAn({ ma: 'B', nhom: 'N1', suc_song: 'vang' }),
      duAn({ ma: 'C', nhom: 'N1', suc_song: 'trang' }),
    ]);
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await screen.findByRole('region', { name: 'Nhóm dự án: N1' });
    const cham = [...nav.querySelectorAll('[data-muc="du-an"] [data-suc-song]')].map((e) =>
      e.getAttribute('data-suc-song'),
    );
    expect(cham).toEqual(['xanh', 'vang', 'trang']);
    // ⚪ mang đúng câu của d.74.
    expect(screen.getByLabelText(CAU_DU_AN_KHONG_CHAY)).toBeTruthy();
  });

  it('d.74 ca PHỦ ĐỊNH: thân THIẾU `suc_song` ⇒ "chưa tính", KHÔNG vẽ ⚪', async () => {
    /*
     * Dựng trạng thái xấu **thật**: một thân mà máy chủ không trả trường đó (bản
     * API cũ, proxy cắt bớt). d.74 dành câu "Dự án không chạy" cho kết luận "không
     * có ticket Đang làm nào" — nói nó khi chưa ai tính là nói sai với chủ.
     */
    const thieu = { ...duAn({ ma: 'A', nhom: 'N1' }) } as Record<string, unknown>;
    delete thieu['suc_song'];
    mayVoi([thieu as unknown as DuAnSidebar]);
    dung(<Sidebar />);
    const cham = await screen.findByLabelText(NHAN_CHUA_TINH);
    expect(cham.getAttribute('data-suc-song')).toBe('chua-tinh');
    expect(screen.queryByLabelText(CAU_DU_AN_KHONG_CHAY)).toBeNull();
  });

  it('dự án trỏ tới đường danh sách ticket của chính nó', async () => {
    mayVoi([duAn({ ma: 'SPX', nhom: 'Sample' })]);
    dung(<Sidebar />);
    const lien = await screen.findByRole('link', { name: /Dự án SPX/ });
    expect(lien.getAttribute('href')).toBe('/du-an/SPX');
  });
});

describe('mục 2 d.70 — dự án `archived` ẩn khỏi sidebar', () => {
  it('máy chủ có trả về một dự án lưu trữ thì sidebar vẫn KHÔNG hiện nó', async () => {
    /*
     * Ca dựng đúng trạng thái mà một lượt sau có thể tạo ra: thêm
     * `?gom_luu_tru=co` vào lời gọi của sidebar. Máy chủ hiện lọc sẵn, nên nếu
     * sidebar không lọc, ca này là chỗ duy nhất bắt được.
     */
    mayVoi([
      duAn({ ma: 'CON', ten: 'Còn chạy', nhom: 'N' }),
      duAn({ ma: 'CU', ten: 'Dự án cũ', nhom: 'N', trang_thai: 'archived' }),
    ]);
    dung(<Sidebar />);
    expect(await screen.findByText('Còn chạy')).toBeTruthy();
    expect(screen.queryByText('Dự án cũ')).toBeNull();
  });

  it('`paused` thì VẪN hiện — d.69 chỉ nói agent không nhận việc mới', async () => {
    mayVoi([duAn({ ma: 'TAM', ten: 'Tạm dừng', nhom: 'N', trang_thai: 'paused' })]);
    dung(<Sidebar />);
    expect(await screen.findByText('Tạm dừng')).toBeTruthy();
  });

  it('`theoNhom` bỏ dự án lưu trữ và KHÔNG để lại nhóm rỗng', () => {
    const ra = theoNhom([duAn({ ma: 'CU', nhom: 'N', trang_thai: 'archived' })]);
    expect(ra).toEqual([]);
  });
});
