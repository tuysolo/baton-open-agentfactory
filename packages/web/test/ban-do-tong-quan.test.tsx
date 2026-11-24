/**
 * **Bản đồ dự án trên Tổng quan — lượt 2: giao diện** (SPEC 20.2–20.6; Chủ chốt
 * T-127 = A, 04/11/2026), cộng 4 cột mới của trang Bản đồ (mục 9).
 *
 *   A. Luật trình bày thuần (`vo/ban-do-bo-cuc.ts`) — không cần DOM.
 *   B. Cây tròn: mặc định gập, ba nút nhanh, bấm mảng (gập/mở + lọc), phóng vào
 *      dự án / quay lại (không bao giờ ba tầng), màu, tooltip, bàn phím.
 *   C. Thẻ 3 làn + Hill Chart + bấm thẻ.
 *   D. Thanh đầu (đồng hồ WIP), ô Cần Chủ (20.5), dải duy trì.
 *   E. Trang Bản đồ: 4 cột thêm.
 *   F. Tương phản màu mới (Sáng/Tối) và 375px.
 *
 * Thân giả nói thẳng mọi thứ máy chủ tính (Xong/Tổng, Mốc tới, cờ Cần Chủ Chờ,
 * đồng hồ WIP) — trang không được tự tính lại.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { HangBanDo, HangDuAn, ManHinhBanDo, TongQuan } from '../src/api';
import { TrangTongQuan, TEN_KHOI, TEN_O_CAN_CHU, nhanMoDsCanChu } from '../src/trang/tong-quan';
import { COT_BAN_DO, COT_BAN_DO_THEM, TrangBanDo } from '../src/trang/ban-do';
import {
  LOP_MANG,
  LOP_MAU_BONG,
  NHAN_DANG_DAY_CAN_CHU,
  NHAN_DOI_PHAI,
  NHAN_DOI_TRAI,
  TEN_MANG_KHAC,
  banKinhDuAn,
  banKinhMangGap,
  boCucCay,
  chiaLan,
  gomMang,
  khoiTrenDoi,
  lanCua,
  lenCay,
  mangGapMacDinh,
  mauBong,
  mauMang,
  nhanDoi,
  sapKhoi,
  soKhoi,
  tenHien,
  xepCanChu,
} from '../src/vo/ban-do-bo-cuc';
import {
  GIU_MS,
  NHAN_CHI_GIU_DANG_DAY,
  NHAN_MO_HET,
  NHAN_THU_GON_HET,
  nhanDaiDuyTri,
  nhanWip,
} from '../src/vo/ban-do-tong-quan';
import { MayChuGia, dung } from './giup';
import { GIO, PHUT, TONG_QUAN_RONG, hangDuAn, khoiLon, mucCanChuO } from './than-tong-quan';

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ *
 * Thân giả
 * ------------------------------------------------------------------ */

const KHOI_SAI = [
  khoiLon({ ma: 'SAI-1', khoi_lon: 3, tieu_de: 'Ra mắt', trang_thai: 'todo', nhan_trang_thai: 'Cần làm', doi: 10 }),
  khoiLon({ ma: 'SAI-2', khoi_lon: 1, tieu_de: 'Nền tảng', trang_thai: 'done', nhan_trang_thai: 'Xong' }),
  khoiLon({ ma: 'SAI-4', khoi_lon: 2, tieu_de: 'Thanh toán', trang_thai: 'verifying', nhan_trang_thai: 'Chờ kiểm chứng', doi: 70 }),
  khoiLon({ ma: 'SAI-3', khoi_lon: 2, tieu_de: 'Tự tạo cộng đồng', trang_thai: 'in_progress', nhan_trang_thai: 'Đang làm', doi: 30 }),
  khoiLon({ ma: 'SAI-5', khoi_lon: 4, tieu_de: 'Chưa đặt đồi', trang_thai: 'in_progress', nhan_trang_thai: 'Đang làm' }),
];

const DU_AN: HangDuAn[] = [
  hangDuAn({
    ma: 'SAI',
    ten: 'Nền tảng cộng đồng Sample',
    ten_ngan: 'SP',
    nhom: 'Sample',
    dang_day: true,
    uu_tien: 5,
    suc_song: 'xanh',
    quan_ly_ten: 'M-Sample',
    co_can_chu_cho: true,
    can_chu_cho_moi_nhat: { id: 'ct-5', ma: 'T-5', tieu_de: 'Duyệt khối lớn GĐ6' },
    khoi_lon: KHOI_SAI,
    khoi_xong: 1,
    khoi_tong: 5,
    moc_toi: KHOI_SAI[3] ?? null,
    viec_noi_bat: {
      id: 'tk-SAI-3',
      ma: 'SAI-3',
      tieu_de: 'Tự tạo cộng đồng',
      project_id: 'pj-SAI',
      trang_thai: 'in_progress',
      nhan_trang_thai: 'Đang làm',
    },
  }),
  hangDuAn({ ma: 'APP', ten: 'App phụ', nhom: 'Sample', trang_thai: 'paused', nhan_trang_thai: 'Tạm dừng', uu_tien: 1, suc_song: 'trang' }),
  hangDuAn({ ma: 'INA', ten: 'Incubator', nhom: 'INC', uu_tien: 2 }),
  hangDuAn({ ma: 'INB', ten: 'Lamp', nhom: 'INC', uu_tien: 4, co_can_chu_cho: true }),
  hangDuAn({ ma: 'KHA', ten: 'Không nhóm', nhom: null, uu_tien: 3 }),
  hangDuAn({ ma: 'DT1', ten: 'Chat support', ten_ngan: 'Chat', duy_tri: true, co_can_chu_cho: true }),
  hangDuAn({ ma: 'DT2', ten: 'Hoá đơn tháng', duy_tri: true }),
  hangDuAn({ ma: 'OLD', ten: 'Đã lưu trữ', nhom: 'INC', trang_thai: 'archived', nhan_trang_thai: 'Lưu trữ', dang_day: true }),
];

const THAN: TongQuan = {
  ...TONG_QUAN_RONG,
  du_an: DU_AN,
  ban_do: { ten_chu: 'Chủ', wip: { dang_day: 1, gioi_han: 3, vuot: false } },
};

function may(than: TongQuan = THAN): MayChuGia {
  return new MayChuGia().dat('GET /v1/tong-quan', { than }).gan();
}

async function moTrang(than: TongQuan = THAN): Promise<HTMLElement> {
  may(than);
  dung(<TrangTongQuan />);
  return await screen.findByRole('region', { name: TEN_KHOI.du_an });
}

const nutDuAn = (ma: string): Element | null => document.querySelector(`[data-nut-du-an="${ma}"]`);
const nutMang = (ten: string): Element | null => document.querySelector(`[data-nut-mang="${ten}"]`);
const maNutDuAn = (): string[] =>
  [...document.querySelectorAll('[data-nut-du-an]')].map((e) => e.getAttribute('data-nut-du-an') ?? '');
const maThe = (lan: string): string[] =>
  [...document.querySelectorAll(`section[data-lan="${lan}"] article[data-du-an]`)].map(
    (e) => e.getAttribute('data-du-an') ?? '',
  );

/* ================================================================== *
 * A. Luật thuần
 * ================================================================== */

describe('A. luật trình bày thuần (20.3–20.5)', () => {
  it('lên cây: không lưu trữ, không duy trì (20.3)', () => {
    expect(DU_AN.filter(lenCay).map((d) => d.ma)).toEqual(['SAI', 'APP', 'INA', 'INB', 'KHA']);
  });

  it('mảng = nhóm; không nhóm ⇒ "Khác", đứng cuối; mảng không có dự án đang đẩy gập mặc định', () => {
    const m = gomMang(DU_AN);
    expect(m.map((x) => x.ten)).toEqual(['INC', 'Sample', TEN_MANG_KHAC]);
    expect(TEN_MANG_KHAC).toBe('Khác');
    // INC chỉ có INA, INB (OLD lưu trữ không lên cây).
    expect(m[0]?.du_an.map((d) => d.ma)).toEqual(['INB', 'INA']);
    expect(m[0]?.tong_uu_tien).toBe(6);
    expect([...mangGapMacDinh(m)].sort()).toEqual(['INC', TEN_MANG_KHAC].sort());
  });

  it('màu bong bóng theo đúng thứ tự SPEC: vàng (Cần Chủ Chờ) > xám (Tạm dừng) > xanh', () => {
    expect(mauBong({ co_can_chu_cho: true, trang_thai: 'paused' })).toBe('vang');
    expect(mauBong({ co_can_chu_cho: false, trang_thai: 'paused' })).toBe('xam');
    expect(mauBong({ co_can_chu_cho: false, trang_thai: 'active' })).toBe('xanh');
  });

  it('cỡ bong bóng tăng theo uu_tien; mảng gập to theo tổng ưu tiên', () => {
    const r = [1, 2, 3, 4, 5].map(banKinhDuAn);
    expect([...r].sort((a, b) => a - b)).toEqual(r);
    expect(new Set(r).size).toBe(5);
    expect(banKinhMangGap(12)).toBeGreaterThan(banKinhMangGap(3));
  });

  it('bố cục: mảng gập không có nút dự án; mảng mở có đủ nút; mọi điểm nằm trong khung', () => {
    const m = gomMang(DU_AN);
    const bc = boCucCay(m, new Set(['INC']));
    expect(bc.mang.find((x) => x.ten === 'INC')?.gap).toBe(true);
    expect(bc.du_an.map((n) => n.du_an.ma).sort()).toEqual(['APP', 'KHA', 'SAI']);
    for (const n of [...bc.mang, ...bc.du_an]) {
      expect(Math.hypot(n.x, n.y)).toBeLessThanOrEqual(215);
    }
  });

  it('ba làn: Đang đẩy (dang_day) · Hàng chờ (còn lại) · Tạm dừng; lọc theo mảng', () => {
    expect(lanCua({ dang_day: true, trang_thai: 'paused' })).toBe('dang_day');
    const l = chiaLan(DU_AN, null);
    expect(l.dang_day.map((d) => d.ma)).toEqual(['SAI']);
    expect(l.hang_cho.map((d) => d.ma)).toEqual(['INB', 'KHA', 'INA']);
    expect(l.tam_dung.map((d) => d.ma)).toEqual(['APP']);
    const inc = chiaLan(DU_AN, 'INC');
    expect([...inc.dang_day, ...inc.hang_cho, ...inc.tam_dung].map((d) => d.ma)).toEqual(['INB', 'INA']);
  });

  it('khối: số "01, 02…" theo khoi_lon, trùng số sắp theo mã (#183)', () => {
    expect(sapKhoi(KHOI_SAI).map((k) => [soKhoi(k.khoi_lon), k.ma])).toEqual([
      ['01', 'SAI-2'],
      ['02', 'SAI-3'],
      ['02', 'SAI-4'],
      ['03', 'SAI-1'],
      ['04', 'SAI-5'],
    ]);
  });

  it('Hill Chart: chấm chỉ cho khối Đang làm/Chờ kiểm chứng CÓ doi; nhãn <50 / ≥50', () => {
    // SAI-1 (todo, doi 10) không chấm; SAI-5 (đang làm, không doi) không chấm.
    expect(khoiTrenDoi(KHOI_SAI).map((k) => k.ma)).toEqual(['SAI-3', 'SAI-4']);
    expect([nhanDoi(0), nhanDoi(49), nhanDoi(50), nhanDoi(100)]).toEqual([
      NHAN_DOI_TRAI,
      NHAN_DOI_TRAI,
      NHAN_DOI_PHAI,
      NHAN_DOI_PHAI,
    ]);
    expect(NHAN_DOI_TRAI).toBe('chưa rõ cách làm');
    expect(NHAN_DOI_PHAI).toBe('đã rõ cách, đang làm');
  });

  it('Cần Chủ 20.5: mục dự án đang đẩy lên đầu, thứ tự cũ giữ trong mỗi phần', () => {
    const ds = [
      mucCanChuO({ ma: 'T-1' }),
      mucCanChuO({ ma: 'T-2', du_an_dang_day: true }),
      mucCanChuO({ ma: 'T-3' }),
      mucCanChuO({ ma: 'T-4', du_an_dang_day: true }),
    ];
    expect(xepCanChu(ds).map((m) => m.ma)).toEqual(['T-2', 'T-4', 'T-1', 'T-3']);
    expect(NHAN_DANG_DAY_CAN_CHU).toBe('· đang đẩy');
  });

  it('tên hiện: tên ngắn nếu có, không thì tên đầy đủ; màu mảng ổn định trong bảng cố định', () => {
    expect(tenHien({ ten: 'Dài', ten_ngan: 'N' })).toBe('N');
    expect(tenHien({ ten: 'Dài', ten_ngan: null })).toBe('Dài');
    expect(mauMang('INC')).toBe(mauMang('INC'));
    expect(LOP_MANG).toContain(mauMang('Sample'));
  });
});

/* ================================================================== *
 * B. Cây tròn
 * ================================================================== */

describe('B. cây tròn (20.3)', () => {
  it('tâm là tên chủ; mặc định: mảng không có dự án đang đẩy GẬP (ghi "+n"), mảng có thì mở', async () => {
    await moTrang();
    expect(document.querySelector('[data-nut="tam"]')?.textContent).toBe('Chủ');
    expect(nutMang('Sample')?.getAttribute('data-gap')).toBe('khong');
    expect(nutMang('INC')?.getAttribute('data-gap')).toBe('co');
    expect(nutMang('INC')?.textContent).toContain('+2');
    expect(nutMang(TEN_MANG_KHAC)?.getAttribute('data-gap')).toBe('co');
    // Chỉ dự án của mảng đang mở có nút; mảng gập to theo tổng ưu tiên.
    expect(maNutDuAn().sort()).toEqual(['APP', 'SAI']);
    expect(Number(nutMang('INC')?.getAttribute('data-r'))).toBeCloseTo(banKinhMangGap(6), 1);
  });

  it('dự án duy trì và lưu trữ KHÔNG lên cây (kể cả khi mở hết)', async () => {
    await moTrang();
    await userEvent.click(screen.getByRole('button', { name: NHAN_MO_HET }));
    expect(maNutDuAn().sort()).toEqual(['APP', 'INA', 'INB', 'KHA', 'SAI']);
    expect(nutDuAn('DT1')).toBeNull();
    expect(nutDuAn('OLD')).toBeNull();
  });

  it('ba nút nhanh: Mở hết / Thu gọn hết / Chỉ giữ dự án đang đẩy', async () => {
    await moTrang();
    await userEvent.click(screen.getByRole('button', { name: NHAN_THU_GON_HET }));
    expect(maNutDuAn()).toEqual([]);
    expect([...document.querySelectorAll('[data-nut-mang][data-gap="co"]')]).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: NHAN_MO_HET }));
    expect(maNutDuAn()).toHaveLength(5);
    expect(document.querySelectorAll('[data-nut-mang][data-gap="co"]')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: NHAN_CHI_GIU_DANG_DAY }));
    expect(maNutDuAn().sort()).toEqual(['APP', 'SAI']);
  });

  it('bấm mảng: gập/mở VÀ lọc thẻ theo mảng; bấm lại: mở/gập lại VÀ bỏ lọc', async () => {
    await moTrang();
    const inc = nutMang('INC') as Element;
    act(() => {
      fireEvent.click(inc);
    });
    expect(nutMang('INC')?.getAttribute('data-gap')).toBe('khong');
    expect(nutMang('INC')?.getAttribute('aria-pressed')).toBe('true');
    expect(maNutDuAn().sort()).toEqual(['APP', 'INA', 'INB', 'SAI']);
    // Thẻ chỉ còn của mảng INC.
    expect([...document.querySelectorAll('article[data-du-an]')].map((e) => e.getAttribute('data-du-an'))).toEqual([
      'INB',
      'INA',
    ]);

    act(() => {
      fireEvent.click(nutMang('INC') as Element);
    });
    expect(nutMang('INC')?.getAttribute('data-gap')).toBe('co');
    expect(nutMang('INC')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('article[data-du-an]')).toHaveLength(5);
  });

  it('bấm mảng → "Bỏ lọc" → bấm lại mảng ⇒ lọc BẬT lại (gập/mở vẫn bật tắt)', async () => {
    await moTrang();
    act(() => {
      fireEvent.click(nutMang('INC') as Element);
    });
    expect(nutMang('INC')?.getAttribute('aria-pressed')).toBe('true');
    expect(nutMang('INC')?.getAttribute('data-gap')).toBe('khong');

    await userEvent.click(screen.getByRole('button', { name: 'Bỏ lọc' }));
    expect(nutMang('INC')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('article[data-du-an]')).toHaveLength(5);

    act(() => {
      fireEvent.click(nutMang('INC') as Element);
    });
    // Lọc bật lại theo INC; gập/mở đảo như mọi lần bấm.
    expect(nutMang('INC')?.getAttribute('aria-pressed')).toBe('true');
    expect(nutMang('INC')?.getAttribute('data-gap')).toBe('co');
    expect([...document.querySelectorAll('article[data-du-an]')].map((e) => e.getAttribute('data-du-an'))).toEqual([
      'INB',
      'INA',
    ]);
  });

  it('mảng dùng được bằng BÀN PHÍM: role=button, tabIndex 0, Enter gập/mở', async () => {
    await moTrang();
    const inc = nutMang('INC') as SVGGElement;
    expect(inc.getAttribute('role')).toBe('button');
    expect(inc.getAttribute('tabindex')).toBe('0');
    expect(inc.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      fireEvent.keyDown(inc, { key: 'Enter' });
    });
    expect(nutMang('INC')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('màu bong bóng: vàng (Cần Chủ Chờ) / xám (Tạm dừng) / xanh; đang đẩy viền đậm, còn lại mờ', async () => {
    await moTrang();
    await userEvent.click(screen.getByRole('button', { name: NHAN_MO_HET }));
    const mau = (ma: string): [string | null, string | null] => [
      nutDuAn(ma)?.getAttribute('data-mau') ?? null,
      nutDuAn(ma)?.querySelector('[data-bong]')?.getAttribute('class') ?? null,
    ];
    expect(mau('SAI')).toEqual(['vang', 'fill-canh stroke-chu']);
    expect(mau('INB')).toEqual(['vang', 'fill-canh stroke-chu']);
    expect(mau('APP')).toEqual(['xam', 'fill-neutral-500 stroke-chu']);
    expect(mau('INA')).toEqual(['xanh', 'fill-tot stroke-chu']);
    // Đang đẩy: viền 3, không mờ. Hàng chờ: không viền, mờ.
    expect(nutDuAn('SAI')?.querySelector('[data-bong]')?.getAttribute('stroke-width')).toBe('3');
    expect(nutDuAn('SAI')?.getAttribute('opacity')).toBe('1');
    expect(nutDuAn('INA')?.querySelector('[data-bong]')?.getAttribute('stroke-width')).toBe('0');
    expect(Number(nutDuAn('INA')?.getAttribute('opacity'))).toBeLessThan(1);
  });

  it('vòng tiến độ + chữ "Xong/Tổng" khối chỉ ở dự án có khối lớn; cỡ theo uu_tien', async () => {
    await moTrang();
    expect(nutDuAn('SAI')?.querySelector('[data-vong-tien-do]')?.getAttribute('data-vong-tien-do')).toBe('1/5');
    expect(nutDuAn('SAI')?.querySelector('[data-tien-do-khoi]')?.textContent).toBe('1/5');
    expect(nutDuAn('APP')?.querySelector('[data-vong-tien-do]')).toBeNull();
    expect(Number(nutDuAn('SAI')?.getAttribute('data-r'))).toBeGreaterThan(Number(nutDuAn('APP')?.getAttribute('data-r')));
  });

  it('phóng vào dự án: dự án ở tâm, khối lớn thành vòng ngoài 01, 02…; KHÔNG ba tầng; bấm tâm quay lại', async () => {
    await moTrang();
    act(() => {
      fireEvent.click(nutDuAn('SAI') as Element);
    });
    // Chỉ còn hai tầng: tâm dự án + khối. Không cây, không mảng, không tâm chủ.
    expect(document.querySelector('svg[data-ban-do="phong"]')).not.toBeNull();
    expect(document.querySelector('svg[data-ban-do="cay"]')).toBeNull();
    expect(document.querySelectorAll('[data-nut-mang]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-nut-du-an]')).toHaveLength(0);
    expect(document.querySelector('[data-nut="tam"]')).toBeNull();
    expect(screen.queryByRole('button', { name: NHAN_MO_HET })).toBeNull();

    const khoi = [...document.querySelectorAll('[data-khoi-lon]')].map((e) => [
      e.getAttribute('data-so-khoi'),
      e.getAttribute('data-khoi-lon'),
      e.getAttribute('data-kieu'),
    ]);
    expect(khoi).toEqual([
      ['01', 'SAI-2', 'xong'],
      ['02', 'SAI-3', 'dang_lam'],
      ['02', 'SAI-4', 'dang_lam'],
      ['03', 'SAI-1', 'chua_toi'],
      ['04', 'SAI-5', 'dang_lam'],
    ]);
    // Xong xanh; Đang làm/Chờ kiểm chứng vàng viền đậm; chưa tới xám nét đứt.
    const tron = (ma: string): Element | null => document.querySelector(`[data-khoi-lon="${ma}"] circle`);
    expect(tron('SAI-2')?.getAttribute('class')).toBe('fill-tot');
    expect(tron('SAI-3')?.getAttribute('class')).toBe('fill-canh stroke-chu');
    expect(tron('SAI-3')?.getAttribute('stroke-width')).toBe('3');
    expect(tron('SAI-1')?.getAttribute('class')).toBe('fill-none stroke-tt-huy');
    expect(tron('SAI-1')?.getAttribute('stroke-dasharray')).toBe('4 3');

    act(() => {
      fireEvent.click(document.querySelector('[data-nut="tam-du-an"]') as Element);
    });
    expect(document.querySelector('svg[data-ban-do="cay"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-khoi-lon]')).toHaveLength(0);
  });

  it('phóng vào bằng bàn phím (Enter trên bong bóng), quay lại bằng Space trên tâm', async () => {
    await moTrang();
    act(() => {
      fireEvent.keyDown(nutDuAn('SAI') as Element, { key: 'Enter' });
    });
    expect(document.querySelector('svg[data-ban-do="phong"]')).not.toBeNull();
    const tam = document.querySelector('[data-nut="tam-du-an"]') as Element;
    expect(tam.getAttribute('role')).toBe('button');
    act(() => {
      fireEvent.keyDown(tam, { key: ' ' });
    });
    expect(document.querySelector('svg[data-ban-do="cay"]')).not.toBeNull();
  });

  it('dự án chưa chia khối: phóng vào vẫn được, nói thẳng', async () => {
    await moTrang();
    act(() => {
      fireEvent.click(nutDuAn('APP') as Element);
    });
    expect(screen.getByText('Dự án này chưa chia khối việc lớn.')).toBeTruthy();
  });

  it('rê chuột / focus ⇒ tooltip: tên đầy đủ, trạng thái, "Đang làm"', async () => {
    await moTrang();
    const tip = (): Element | null => document.querySelector('[role="tooltip"]');
    expect(tip()?.getAttribute('data-goi-y')).toBe('an');
    act(() => {
      fireEvent.mouseEnter(nutDuAn('SAI') as Element);
    });
    expect(tip()?.textContent).toContain('Nền tảng cộng đồng Sample');
    expect(tip()?.textContent).toContain('Đang chạy');
    expect(tip()?.textContent).toContain('Đang làm: SAI-3 Tự tạo cộng đồng');
    act(() => {
      fireEvent.mouseLeave(nutDuAn('SAI') as Element);
    });
    expect(tip()?.getAttribute('data-goi-y')).toBe('an');
    act(() => {
      fireEvent.focus(nutDuAn('APP') as Element);
    });
    expect(tip()?.textContent).toContain('App phụ');
    expect(tip()?.textContent).toContain('Tạm dừng');
    expect(tip()?.textContent).toContain('Đang làm: Dự án không chạy');
  });

  it('chạm giữ ⇒ tooltip, và cú nhấc tay sau đó KHÔNG phóng vào', async () => {
    await moTrang();
    vi.useFakeTimers();
    const nut = nutDuAn('SAI') as Element;
    const ev = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    act(() => {
      nut.dispatchEvent(ev);
    });
    act(() => {
      vi.advanceTimersByTime(GIU_MS + 10);
    });
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('Nền tảng cộng đồng Sample');
    act(() => {
      fireEvent.click(nut);
    });
    expect(document.querySelector('svg[data-ban-do="cay"]')).not.toBeNull();
    // Cú bấm thường sau đó thì phóng vào.
    act(() => {
      fireEvent.click(nutDuAn('SAI') as Element);
    });
    expect(document.querySelector('svg[data-ban-do="phong"]')).not.toBeNull();
  });
});

/* ================================================================== *
 * C. Thẻ 3 làn + Hill Chart
 * ================================================================== */

describe('C. thẻ dự án (20.4)', () => {
  it('ba làn đúng tên SPEC, đúng thẻ; duy trì/lưu trữ không có thẻ', async () => {
    await moTrang();
    expect([...document.querySelectorAll('section[data-lan]')].map((e) => e.getAttribute('aria-label'))).toEqual([
      'Đang đẩy',
      'Hàng chờ',
      'Tạm dừng',
    ]);
    expect(maThe('dang_day')).toEqual(['SAI']);
    expect(maThe('hang_cho')).toEqual(['INB', 'KHA', 'INA']);
    expect(maThe('tam_dung')).toEqual(['APP']);
    expect(document.querySelector('article[data-du-an="DT1"]')).toBeNull();
    expect(document.querySelector('article[data-du-an="OLD"]')).toBeNull();
  });

  it('nội dung thẻ: tên ngắn, chấm sức sống, ưu tiên, người cầm, Đang làm, Chờ Chủ (link mục), Mốc tới', async () => {
    await moTrang();
    const the = document.querySelector('article[data-du-an="SAI"]') as HTMLElement;
    expect(the.querySelector('[data-o="ten"]')?.textContent).toBe('SP');
    expect(the.querySelector('[data-o="ten"]')?.getAttribute('title')).toBe('Nền tảng cộng đồng Sample');
    expect(the.querySelector('[data-suc-song]')?.getAttribute('data-suc-song')).toBe('xanh');
    expect(the.querySelector('[data-o="uu-tien"]')?.textContent).toBe('Ưu tiên 5');
    expect(the.querySelector('[data-o="nguoi-cam"]')?.textContent).toBe('M-Sample');
    expect(the.querySelector('[data-noi-bat]')?.textContent).toBe('Tự tạo cộng đồng');
    const cho = within(the).getByRole('link', { name: 'Duyệt khối lớn GĐ6' });
    expect(cho.getAttribute('href')).toBe('/can-chu?the=T-5');
    expect(the.querySelector('[data-o="moc-toi"]')?.textContent).toBe('02 Tự tạo cộng đồng');
    // Không agent quản lý ⇒ tên chủ; không mục Chờ ⇒ "Không"; không khối ⇒ "—".
    const app = document.querySelector('article[data-du-an="APP"]') as HTMLElement;
    expect(app.querySelector('[data-o="nguoi-cam"]')?.textContent).toBe('Chủ');
    expect(app.querySelector('[data-o="cho-chu"]')?.textContent).toBe('Không');
    expect(app.querySelector('[data-o="moc-toi"]')?.textContent).toBe('—');
  });

  it('Hill Chart: chấm tại doi cho khối Đang làm/Chờ kiểm chứng; nhãn theo <50 / ≥50; không doi ⇒ không chấm', async () => {
    await moTrang();
    const the = document.querySelector('article[data-du-an="SAI"]') as HTMLElement;
    const cham = [...the.querySelectorAll('[data-cham-doi]')].map((e) => [
      e.getAttribute('data-cham-doi'),
      e.getAttribute('data-doi'),
    ]);
    expect(cham).toEqual([
      ['SAI-3', '30'],
      ['SAI-4', '70'],
    ]);
    // SAI-5 đang làm nhưng chưa có doi; SAI-1 có doi nhưng chưa tới ⇒ không chấm.
    expect(the.querySelector('[data-cham-doi="SAI-5"]')).toBeNull();
    expect(the.querySelector('[data-cham-doi="SAI-1"]')).toBeNull();
    // Chấm 30 nằm sườn trái, 70 sườn phải (x < 100 < x).
    const x = (ma: string): number => Number(the.querySelector(`[data-cham-doi="${ma}"]`)?.getAttribute('cx'));
    expect(x('SAI-3')).toBeLessThan(100);
    expect(x('SAI-4')).toBeGreaterThan(100);
    expect(the.querySelector('[data-nhan-doi="SAI-3"] [data-o="nhan-doi"]')?.textContent).toBe('chưa rõ cách làm');
    expect(the.querySelector('[data-nhan-doi="SAI-4"] [data-o="nhan-doi"]')?.textContent).toBe('đã rõ cách, đang làm');
    // Dự án không có khối lớn ⇒ không Hill Chart.
    expect(document.querySelector('article[data-du-an="APP"] [data-hill]')).toBeNull();
  });

  it('bấm thẻ ⇒ bảng việc của dự án (`/du-an/<MÃ>`)', async () => {
    may();
    dung(
      <Routes>
        <Route path="/" element={<TrangTongQuan />} />
        <Route path="/du-an/:ma" element={<p>Trang bảng việc</p>} />
      </Routes>,
    );
    await screen.findByRole('region', { name: TEN_KHOI.du_an });
    const the = document.querySelector('article[data-du-an="INA"] dl') as Element;
    await userEvent.click(the);
    expect(await screen.findByText('Trang bảng việc')).toBeTruthy();
  });
});

/* ================================================================== *
 * D. Thanh đầu, ô Cần Chủ, dải duy trì
 * ================================================================== */

describe('D. đồng hồ WIP, ô Cần Chủ 20.5, dải duy trì (20.2)', () => {
  const wip = async (dang_day: number, gioi_han: number, vuot: boolean): Promise<Element | null> => {
    await moTrang({ ...THAN, ban_do: { ten_chu: 'Chủ', wip: { dang_day, gioi_han, vuot } } });
    return document.querySelector('[data-wip]');
  };

  it('"Đang đẩy n/<giới hạn>" ĐỎ khi n > giới hạn (máy chủ báo `vuot`)', async () => {
    const w = await wip(4, 3, true);
    expect(w?.getAttribute('data-vuot')).toBe('co');
    const chu = w?.querySelector('[data-o="wip-chu"]');
    expect(chu?.textContent).toBe('Đang đẩy 4/3');
    expect(chu?.getAttribute('class')).toContain('text-loi');
    expect(w?.querySelectorAll('.bg-loi')).toHaveLength(1);
  });

  it('n BẰNG giới hạn ⇒ KHÔNG đỏ', async () => {
    const w = await wip(3, 3, false);
    expect(w?.getAttribute('data-vuot')).toBe('khong');
    expect(w?.querySelector('[data-o="wip-chu"]')?.textContent).toBe(nhanWip(3, 3));
    expect(w?.querySelector('[data-o="wip-chu"]')?.getAttribute('class')).not.toContain('text-loi');
    expect(w?.querySelectorAll('.bg-loi')).toHaveLength(0);
  });

  it('ô Cần Chủ: danh sách đóng sẵn; mở ra xếp mục dự án đang đẩy lên đầu, gắn "· đang đẩy"', async () => {
    await moTrang({
      ...THAN,
      can_chu: {
        ...THAN.can_chu,
        so_cho: 4,
        ds_cho: [
          mucCanChuO({ ma: 'T-1', muc: 'urgent' }),
          mucCanChuO({ ma: 'T-2', du_an_dang_day: true }),
          mucCanChuO({ ma: 'T-3' }),
          mucCanChuO({ ma: 'T-4', du_an_dang_day: true, muc: 'later' }),
        ],
      },
    });
    const o = screen.getByRole('complementary', { name: TEN_O_CAN_CHU });
    expect(o.querySelectorAll('[data-muc-can-chu]')).toHaveLength(0);
    const nut = within(o).getByRole('button', { name: nhanMoDsCanChu(4) });
    expect(nut.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(nut);
    const dong = [...o.querySelectorAll('[data-muc-can-chu]')];
    expect(dong.map((e) => e.getAttribute('data-muc-can-chu'))).toEqual(['T-2', 'T-4', 'T-1', 'T-3']);
    expect(dong.map((e) => e.querySelector('[data-o="nhan-dang-day"]')?.textContent ?? null)).toEqual([
      '· đang đẩy',
      '· đang đẩy',
      null,
      null,
    ]);
    expect(within(dong[0] as HTMLElement).getByRole('link', { name: 'T-2' }).getAttribute('href')).toBe(
      '/can-chu?the=T-2',
    );
  });

  it('dải "Khu vực duy trì · n": chip tên ngắn, chấm vàng khi có Cần Chủ Chờ, bấm mở trang dự án', async () => {
    await moTrang();
    const dai = screen.getByRole('group', { name: nhanDaiDuyTri(2) });
    expect(within(dai).getByText('Khu vực duy trì · 2')).toBeTruthy();
    const chip = [...dai.querySelectorAll('[data-chip-duy-tri]')];
    expect(chip.map((c) => [c.getAttribute('data-chip-duy-tri'), c.getAttribute('href')])).toEqual([
      ['DT1', '/du-an/DT1'],
      ['DT2', '/du-an/DT2'],
    ]);
    expect(chip[0]?.textContent).toContain('Chat');
    expect(chip[0]?.querySelector('[data-cham]')?.getAttribute('data-cham')).toBe('vang');
    expect(chip[0]?.querySelector('[data-cham]')?.getAttribute('class')).toContain('bg-canh');
    expect(chip[1]?.querySelector('[data-cham]')?.getAttribute('data-cham')).toBe('xanh');
    expect(chip[1]?.querySelector('[data-cham]')?.getAttribute('class')).toContain('bg-tot');
  });

  it('thứ tự từ trên xuống của khối: thanh đầu → bản đồ + thẻ → dải duy trì; khối 2–5 vẫn dưới', async () => {
    const khoi = await moTrang();
    const thu_tu = [...khoi.querySelectorAll('[data-o="thanh-dau"], [data-o="ban-do-va-the"], [data-dai-duy-tri]')].map(
      (e) => e.getAttribute('data-o') ?? 'dai-duy-tri',
    );
    expect(thu_tu).toEqual(['thanh-dau', 'ban-do-va-the', 'dai-duy-tri']);
    expect([...document.querySelectorAll('section[data-khoi]')].map((e) => e.getAttribute('data-khoi'))).toEqual([
      'du-an',
      'viec-dang-chay',
      'agent',
      'vua-xong',
      'can-chu-y',
    ]);
  });
});

/* ================================================================== *
 * E. Trang Bản đồ — 4 cột thêm (mục 9)
 * ================================================================== */

describe('E. trang Bản đồ: thêm cột Nhóm, Ưu tiên, Đang đẩy, Duy trì (mục 9)', () => {
  function hang(p: Partial<HangBanDo> & { id: string; ma: string }): HangBanDo {
    return {
      ten: `Dự án ${p.ma}`,
      nhom: null,
      trang_thai: 'active',
      nhan_trang_thai: 'Đang chạy',
      quan_ly_agent_id: null,
      quan_ly_agent_ten: null,
      thu_muc: null,
      so_dang_lam: 0,
      suc_song: 'xanh',
      cap_nhat_luc: GIO - PHUT,
      khong_code: false,
      bat_buoc_review: false,
      co_ho_so: false,
      uu_tien: 3,
      dang_day: false,
      duy_tri: false,
      ten_ngan: null,
      ...p,
    };
  }

  it('đầu bảng = sáu cột d.302 + bốn cột mới; mỗi hàng đúng giá trị', async () => {
    const mh: ManHinhBanDo = {
      bay_gio: GIO,
      du_an: [
        hang({ id: 'pj-SAI', ma: 'SAI', nhom: 'Sample', uu_tien: 5, dang_day: true }),
        hang({ id: 'pj-DT', ma: 'DT', duy_tri: true, uu_tien: 1 }),
      ],
      luat_chung: { danh_sach_cam: null, checklist: null, cap_nhat_luc: null },
      so_con_lai: 0,
    };
    new MayChuGia().dat('GET /v1/man-hinh-ban-do', { than: mh }).gan();
    dung(<TrangBanDo />, '/ban-do-du-an');
    await waitFor(() => {
      expect(document.querySelector('[data-bang="ban-do"]')).not.toBeNull();
    });
    const dau = [...document.querySelectorAll('thead th')].map((o) => o.textContent);
    expect(dau.slice(0, 10)).toEqual([...COT_BAN_DO, ...COT_BAN_DO_THEM]);
    expect(COT_BAN_DO_THEM).toEqual(['Nhóm', 'Ưu tiên', 'Đang đẩy', 'Duy trì']);
    const o = (id: string, cot: string): string | null | undefined =>
      document.querySelector(`tr[data-du-an="${id}"] [data-o="${cot}"]`)?.textContent;
    expect([o('pj-SAI', 'nhom'), o('pj-SAI', 'uu-tien'), o('pj-SAI', 'dang-day'), o('pj-SAI', 'duy-tri')]).toEqual([
      'Sample',
      '5',
      'Có',
      'Không',
    ]);
    expect([o('pj-DT', 'nhom'), o('pj-DT', 'uu-tien'), o('pj-DT', 'dang-day'), o('pj-DT', 'duy-tri')]).toEqual([
      '—',
      '1',
      'Không',
      'Có',
    ]);
  });
});

/* ================================================================== *
 * F. Tương phản (Sáng/Tối) và 375px
 * ================================================================== */

function docKieuCss(): string {
  const duong = expect.getState().testPath;
  if (duong === undefined) throw new Error('Không biết đường của file test');
  return readFileSync(join(dirname(duong), '..', 'src', 'kieu.css'), 'utf8');
}

function bangMau(che: 'sang' | 'toi'): Map<string, string> {
  const van = docKieuCss();
  const moc = che === 'sang' ? '\n:root {' : "\n:root[data-theme='toi']";
  const i = van.indexOf(moc);
  const khoi = van.slice(van.indexOf('{', i), van.indexOf('}', van.indexOf('{', i)));
  const b = new Map<string, string>();
  for (const m of khoi.matchAll(/(--t-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) b.set(m[1] ?? '', m[2] ?? '');
  return b;
}

function sang(hex: string): number {
  const k = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (k[0] ?? 0) + 0.7152 * (k[1] ?? 0) + 0.0722 * (k[2] ?? 0);
}

function tiLe(b: Map<string, string>, x: string, y: string): number {
  const a = b.get(x);
  const c = b.get(y);
  if (a === undefined || c === undefined) throw new Error(`thiếu token ${x} hoặc ${y}`);
  const [p, q] = [sang(a), sang(c)].sort((m, n) => n - m);
  return ((p ?? 0) + 0.05) / ((q ?? 0) + 0.05);
}

describe('F. màu mới đọc được ở Sáng và Tối; 375px không tràn', () => {
  const BA_NEN = ['--t-nen', '--t-nen-lop', '--t-nen-noi'];

  it('màu mảng (nhánh, nhãn mảng) ≥ 4.5:1 trên ba nền; chữ "+n" (`fill-nen`) trên bong bóng mảng ≥ 4.5:1', () => {
    const xau: string[] = [];
    for (const che of ['sang', 'toi'] as const) {
      const b = bangMau(che);
      for (const lop of LOP_MANG) {
        const bien = `--t-${lop.replace(/^text-/, '')}`;
        for (const nen of BA_NEN) {
          const r = tiLe(b, nen, bien);
          if (r < 4.5) xau.push(`${che} ${bien}/${nen} ${r.toFixed(2)}`);
        }
        const r = tiLe(b, bien, '--t-nen');
        if (r < 4.5) xau.push(`${che} chữ nen trên ${bien} ${r.toFixed(2)}`);
      }
    }
    expect(xau).toEqual([]);
  });

  it('màu bong bóng, vòng tiến độ, nét đứt, chấm đồi ≥ 3:1 trên nền thẻ (thành phần giao diện)', () => {
    const xau: string[] = [];
    for (const che of ['sang', 'toi'] as const) {
      const b = bangMau(che);
      // tot/canh/n500 = ba màu bong bóng; tt-huy = nét đứt khối chưa tới; nhan-manh = tâm.
      for (const mau of ['--t-tot', '--t-canh', '--t-n500', '--t-tt-huy', '--t-nhan-manh']) {
        for (const nen of BA_NEN) {
          const r = tiLe(b, nen, mau);
          if (r < 3) xau.push(`${che} ${mau}/${nen} ${r.toFixed(2)}`);
        }
      }
    }
    expect(xau).toEqual([]);
  });

  it('MỌI chữ nằm TRÊN bong bóng ≥ 4.5:1 ở Sáng và Tối (chữ 9.5–12px)', () => {
    /*
     * Ba màu bong bóng lấy từ ĐÚNG bảng `LOP_MAU_BONG` của mã sản phẩm (tâm khi
     * phóng vào mang tên + "x/y khối xong" bằng `fill-nen`); khối Xong (tot) và
     * Đang làm (canh) mang số "01" `fill-nen`; khối chưa tới không tô, số
     * `fill-chu-mo` trên nền thẻ; mảng mang "+n" `fill-nen`; tâm chủ
     * `fill-tren-nhan-manh` trên `fill-nhan-manh`.
     */
    const bien = (lop: string, tien_to: string): string => `--t-${lop.replace(tien_to, '').replace(/^neutral-/, 'n')}`;
    const cap: [string, string][] = [
      ...Object.values(LOP_MAU_BONG).map((l): [string, string] => [bien(l, 'fill-'), '--t-nen']),
      ['--t-tot', '--t-nen'],
      ['--t-canh', '--t-nen'],
      ...LOP_MANG.map((l): [string, string] => [bien(l, 'text-'), '--t-nen']),
      ['--t-nhan-manh', '--t-tren-nhan-manh'],
      ['--t-nen-lop', '--t-chu-mo'],
      ['--t-nen', '--t-chu-mo'],
    ];
    expect(Object.values(LOP_MAU_BONG)).toEqual(['fill-canh', 'fill-neutral-500', 'fill-tot']);
    const xau: string[] = [];
    for (const che of ['sang', 'toi'] as const) {
      const b = bangMau(che);
      for (const [nen, chu] of cap) {
        const r = tiLe(b, nen, chu);
        if (r < 4.5) xau.push(`${che} ${chu} trên ${nen} ${r.toFixed(2)}`);
      }
    }
    expect(xau).toEqual([]);
  });

  it('ca đối chứng: cặp cũ `fill-nen` trên `tt-huy` TRƯỢT 4.5:1 (lý do đổi xám sang neutral-500)', () => {
    expect(tiLe(bangMau('sang'), '--t-tt-huy', '--t-nen')).toBeLessThan(4.5);
    expect(tiLe(bangMau('toi'), '--t-tt-huy', '--t-nen')).toBeLessThan(4.5);
  });

  it('375px: mọi SVG của bản đồ dùng viewBox + w-full (không width cứng); không lớp w-[Npx] > 375', async () => {
    const khoi = await moTrang();
    // SVG của bản đồ (cây tròn + Hill Chart); icon 10px cố định của ô Cần Chủ không tính.
    const svg = [...khoi.querySelectorAll('svg[data-ban-do], [data-hill] svg')];
    expect(svg.length).toBeGreaterThan(1);
    for (const s of svg) {
      expect(s.getAttribute('width'), s.outerHTML.slice(0, 60)).toBeNull();
      expect(s.getAttribute('class') ?? '', s.outerHTML.slice(0, 60)).toMatch(/\bw-full\b/);
    }
    const rong: string[] = [];
    for (const e of [khoi, ...khoi.querySelectorAll('*')]) {
      for (const lop of (e.getAttribute('class') ?? '').split(/\s+/)) {
        const k = /^(?:min-)?w-\[(\d+)px\]$/.exec(lop);
        if (k !== null && Number(k[1]) > 375) rong.push(lop);
      }
    }
    expect(rong).toEqual([]);
    // Hàng nút nhanh xuống dòng được ở khổ hẹp.
    expect(khoi.querySelector('[aria-label="Thu gọn hoặc mở mảng"]')?.getAttribute('class')).toContain('flex-wrap');
    // Thẻ co được (min-w-0) để chữ dài cắt, không đẩy ngang.
    for (const a of khoi.querySelectorAll('article[data-du-an]')) {
      expect(a.getAttribute('class')).toContain('min-w-0');
    }
  });
});
