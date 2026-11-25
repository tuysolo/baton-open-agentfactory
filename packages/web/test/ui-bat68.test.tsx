/**
 * **UI BAT-68** — Nhật ký, Bản đồ dự án, hộp Token agent, Cài đặt, Đăng nhập lên
 * mức "làm kỹ" của `DESIGN.md`. Không ca nào ở đây kiểm hành vi SPEC mới: hành
 * vi không đổi, các ca hành vi vẫn ở `nhat-ky.test.tsx`, `ban-do.test.tsx`,
 * `doi-agent.test.tsx` (token), `cai-dat.test.tsx`, `dang-nhap.test.tsx`. Ca ở
 * đây ghim **quy tắc trình bày** đã ghi vào `DESIGN.md`:
 *
 *   1. dòng `LOP_DS_DONG` + `LOP_DONG` / `LOP_DONG_NHIEU_TANG`; khối `vo/khoi`;
 *   2. nhãn trạng thái là chip viền mờ (`LOP_CHIP_CANH` / `LOP_CHIP_LOI`), không
 *      tô nền, không chữ `canh`/`loi` trần;
 *   3. 375px không tràn (jsdom không dàn trang ⇒ ghim lớp: `flex-wrap` /
 *      `min-w-0` / `break-words` / `break-all`);
 *   4. focus thấy được: ô nhập `LOP_O_NHAP`, không lớp tắt outline nào;
 *   5. hai chế độ: chỉ token (không `bg-neutral-*` trong ô token).
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DongNhatKy, ManHinhBanDo, ManHinhNhatKy } from '../src/api';
import { CAU_DA_CO_MOI, TrangNhatKy } from '../src/trang/nhat-ky';
import { TEN_KHOI_LUAT_CHUNG, TrangBanDo } from '../src/trang/ban-do';
import { NHAN_TAO_LAI_TOKEN, NHAN_TOKEN_DA_THU_HOI, NutToken } from '../src/trang/token-agent';
import { TrangCaiDat, TIEU_DE_THONG_BAO } from '../src/trang/cai-dat';
import { NHAN_MAT_KHAU, NHAN_MA_TOTP, NHAN_NUT, TrangDangNhap } from '../src/trang/dang-nhap';
import {
  LOP_CHIP,
  LOP_CHIP_CANH,
  LOP_CHIP_LOI,
  LOP_DAU_KHOI,
  LOP_DONG,
  LOP_DONG_NHIEU_TANG,
  LOP_DS_DONG,
  LOP_O_NHAP,
  LOP_THE,
  LOP_TIEU_DE_MUC,
  LOP_TIEU_DE_TRANG,
  NUT_CHINH,
} from '../src/vo/lop-nut';
import { MayChuGia, datKhoGia, dung } from './giup';
import { GIO, PHUT, agentDong } from './than-agent';

/* ================================================================== *
 * Giúp (cùng nếp `ui-bat67.test.tsx`)
 * ================================================================== */

const NGUON = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });

async function docMot(duoi: string): Promise<string> {
  for (const [duong, doc] of Object.entries(NGUON)) {
    if (duong.endsWith(duoi)) return (await doc()) as string;
  }
  throw new Error(`không thấy ${duoi}`);
}

function boGhiChu(ma: string): string {
  return ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function lop(e: Element | null | undefined): string[] {
  return (e?.getAttribute('class') ?? '').split(/\s+/).filter((x) => x !== '');
}

function khongToNen(e: Element | null | undefined): void {
  expect(e, 'không thấy phần tử').not.toBeNull();
  expect(lop(e).filter((c) => c.startsWith('bg-'))).toEqual([]);
}

/** Không lớp tắt outline nào (`outline-none`, `focus:outline-none`, `outline-0`…). */
function khongTatOutline(e: Element | null | undefined): void {
  expect(e, 'không thấy phần tử').not.toBeNull();
  const tat = lop(e).filter((c) => /(?:^|:)outline-(?:none|hidden|0)$/.test(c));
  expect(tat, e?.outerHTML.slice(0, 200)).toEqual([]);
}

/** Ô nhập/chọn mang đủ `LOP_O_NHAP` (vòng `:focus-visible` chung) và không tắt outline. */
function oNhapChung(e: Element | null | undefined): void {
  expect(e, 'không thấy ô nhập').not.toBeNull();
  expect(lop(e)).toEqual(expect.arrayContaining(LOP_O_NHAP.split(' ')));
  khongTatOutline(e);
}

/** Phần chữ dài co được (`min-w-0`) và chuỗi liền thì ngắt. */
function chuDaiCoDuoc(e: Element | null | undefined): void {
  expect(e, 'không thấy phần chữ dài').not.toBeNull();
  expect(lop(e)).toContain('min-w-0');
  expect(lop(e).some((c) => c === 'break-words' || c === 'break-all' || c === 'truncate')).toBe(true);
}

/** Một khối `vo/khoi`: `header` `LOP_DAU_KHOI` (`flex-wrap`) > `h2` `LOP_TIEU_DE_MUC` = tên khối. */
function khoiChung(k: Element | null | undefined, ten: string): void {
  expect(k, ten).not.toBeNull();
  expect(k?.tagName).toBe('SECTION');
  expect(k?.getAttribute('aria-label')).toBe(ten);
  const dau = k?.firstElementChild;
  expect(dau?.tagName).toBe('HEADER');
  expect(dau?.getAttribute('class')).toBe(LOP_DAU_KHOI);
  expect(lop(dau)).toContain('flex-wrap');
  const h2 = dau?.querySelector('h2');
  expect(h2?.getAttribute('class')).toBe(LOP_TIEU_DE_MUC);
  expect(h2?.textContent).toBe(ten);
}

const CHUOI_LIEN = 'https://vi-du.local/' + 'a'.repeat(120);

beforeEach(() => {
  datKhoGia();
});

afterEach(() => {
  document.body.style.overflow = '';
});

/* ================================================================== *
 * 1. Nhật ký
 * ================================================================== */

function dongNk(p: Partial<DongNhatKy> & { id: string }): DongNhatKy {
  return {
    luc: GIO - PHUT,
    ngay: '2025-10-09',
    nguoi_loai: 'agent',
    agent_id: 'M-Baton',
    project_id: 'pj-SAI',
    quyet_dinh: CHUOI_LIEN,
    vi_sao: CHUOI_LIEN,
    da_co_quyet_dinh_moi: true,
    can_cu: [
      { loai: 'ticket', id: 'id-' + 'b'.repeat(80), ma_can_chu: null },
      { loai: 'ask', id: 'ask-1', ma_can_chu: 'T-7' },
    ],
    ...p,
  };
}

function mayNhatKy(items: DongNhatKy[]): void {
  const mh: ManHinhNhatKy = {
    items,
    cursor_sau: null,
    nhom_theo_ngay: [{ ngay: '2025-10-09', so_dong: items.length }],
    bay_gio: GIO,
  };
  new MayChuGia()
    .dat('GET /v1/man-hinh-nhat-ky', { than: mh })
    .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
    .dat('GET /v1/agent', { than: { items: [], cursor_sau: null } })
    .gan();
}

describe('Nhật ký — dòng nhiều tầng, chip "đã có mới", ô lọc, 375px', () => {
  it('mỗi dòng là `LOP_DONG_NHIEU_TANG` (có `min-w-0`) trong `LOP_DS_DONG`', async () => {
    mayNhatKy([dongNk({ id: 'nk-1' })]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await screen.findByText(CAU_DA_CO_MOI);
    const li = document.querySelector('[data-dong="nk-1"]');
    expect(li?.getAttribute('class')).toBe(LOP_DONG_NHIEU_TANG);
    expect(lop(li)).toContain('min-w-0');
    expect(li?.parentElement?.getAttribute('class')).toBe(LOP_DS_DONG);
  });

  it('"đã có quyết định mới" là chip cảnh báo `LOP_CHIP_CANH`, không tô nền; chữ giữ nguyên', async () => {
    mayNhatKy([dongNk({ id: 'nk-1' })]);
    dung(<TrangNhatKy />, '/nhat-ky');
    const chip = await screen.findByText(CAU_DA_CO_MOI);
    expect(chip.getAttribute('data-o')).toBe('da-co-moi');
    expect(chip.getAttribute('class')).toBe(LOP_CHIP_CANH);
    khongToNen(chip);
  });

  it('dòng chưa có quyết định mới ⇒ không chip', async () => {
    mayNhatKy([dongNk({ id: 'nk-1', da_co_quyet_dinh_moi: false })]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await waitFor(() => {
      expect(document.querySelector('[data-dong="nk-1"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-o="da-co-moi"]')).toBeNull();
  });

  it('d.411 — 375px: hàng chữ phụ `flex-wrap`; quyết định / vì sao / ai / dự án / căn cứ dài ngắt được', async () => {
    mayNhatKy([dongNk({ id: 'nk-1' })]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await screen.findByText(CAU_DA_CO_MOI);
    const li = document.querySelector('[data-dong="nk-1"]');
    const hang_tren = li?.firstElementChild;
    expect(lop(hang_tren)).toEqual(expect.arrayContaining(['flex-wrap', 'min-w-0']));
    chuDaiCoDuoc(li?.querySelector('[data-o="quyet-dinh"]'));
    chuDaiCoDuoc(li?.querySelector('[data-o="vi-sao"]'));
    chuDaiCoDuoc(li?.querySelector('[data-o="ai"]'));
    chuDaiCoDuoc(li?.querySelector('[data-o="du-an"]'));
    const ds_cc = li?.querySelector('[data-ds="can-cu"]');
    expect(lop(ds_cc)).toEqual(expect.arrayContaining(['flex-wrap', 'min-w-0']));
    for (const c of [...(ds_cc?.querySelectorAll('li > *') ?? [])]) {
      // Căn cứ là chip viền mờ, id liền thì ngắt, không rộng quá dòng.
      expect(lop(c)).toEqual(expect.arrayContaining([...LOP_CHIP.split(' '), 'break-all', 'max-w-full']));
    }
  });

  it('ô lọc: ba ô `LOP_O_NHAP` (vòng focus chung), không tắt outline; hàng lọc `flex-wrap`, ô `max-w-full`', async () => {
    mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    const loc = await screen.findByRole('region', { name: 'Bộ lọc' });
    expect(lop(loc)).toEqual(expect.arrayContaining(['flex-wrap', 'min-w-0']));
    for (const k of ['du_an', 'ai', 'tim']) {
      const o = loc.querySelector(`[data-loc="${k}"]`);
      oNhapChung(o);
      expect(lop(o?.closest('label'))).toContain('max-w-full');
    }
    expect(lop(loc.querySelector('[data-loc="du_an"]'))).toContain('max-w-full');
    expect(lop(loc.querySelector('[data-loc="ai"]'))).toContain('max-w-full');
  });

  it('rỗng: câu chờ chung, không khung', async () => {
    mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    const cau = await screen.findByText('Chưa có dòng quyết định nào.');
    expect(cau.getAttribute('class')).toBe('text-sm text-chu-mo');
    expect(document.querySelector('[data-ds="nhat-ky"]')).toBeNull();
  });
});

/* ================================================================== *
 * 2. Bản đồ dự án
 * ================================================================== */

function mayBanDo(mh: Partial<ManHinhBanDo> = {}): void {
  const than: ManHinhBanDo = {
    bay_gio: GIO,
    du_an: [],
    luat_chung: { danh_sach_cam: CHUOI_LIEN, checklist: '- Đọc SPEC', cap_nhat_luc: GIO - PHUT },
    so_con_lai: 0,
    ...mh,
  };
  new MayChuGia().dat('GET /v1/man-hinh-ban-do', { than }).gan();
}

describe('Bản đồ dự án — khối Luật chung dùng `vo/khoi`, `MucVan` co được', () => {
  it('Luật chung là khối chung: `header` `LOP_DAU_KHOI` + `h2` CHỈ mang tên khối; mốc + nút ở phần phụ', async () => {
    mayBanDo();
    dung(<TrangBanDo />, '/ban-do-du-an');
    const k = await screen.findByRole('region', { name: TEN_KHOI_LUAT_CHUNG });
    expect(k.getAttribute('data-khoi')).toBe('luat-chung');
    khoiChung(k, TEN_KHOI_LUAT_CHUNG);
    const dau = k.querySelector('header');
    const phu = dau?.querySelector('[data-o="phu-luat-chung"]');
    expect(phu?.querySelector('[data-nut="mo-sua-luat-chung"]')).not.toBeNull();
    expect(phu?.querySelector('time')).not.toBeNull();
    expect(lop(phu)).toEqual(expect.arrayContaining(['flex-wrap', 'min-w-0']));
    // Tiêu đề không còn lẫn chữ của nút.
    expect(screen.getByRole('heading', { name: TEN_KHOI_LUAT_CHUNG })).toBeTruthy();
  });

  it('nội dung đã soạn nằm trong thẻ `LOP_THE`; `MucVan` `min-w-0 break-words`, tiêu đề `h3`', async () => {
    mayBanDo();
    dung(<TrangBanDo />, '/ban-do-du-an');
    const k = await screen.findByRole('region', { name: TEN_KHOI_LUAT_CHUNG });
    const the = k.querySelector('[data-o="noi-dung-luat-chung"]');
    expect(lop(the)).toEqual(expect.arrayContaining(LOP_THE.split(' ')));
    for (const ma of ['danh-sach-cam', 'checklist']) {
      const m = the?.querySelector(`[data-muc="${ma}"]`);
      chuDaiCoDuoc(m);
      expect(m?.firstElementChild?.tagName).toBe('H3');
    }
  });

  it('biểu mẫu sửa là thẻ lớp nổi; hai ô `LOP_O_NHAP`; nút "Sửa" ẩn, mốc vẫn ở đầu khối', async () => {
    mayBanDo();
    dung(<TrangBanDo />, '/ban-do-du-an');
    const k = await screen.findByRole('region', { name: TEN_KHOI_LUAT_CHUNG });
    await userEvent.click(k.querySelector('[data-nut="mo-sua-luat-chung"]') as HTMLElement);
    const form = k.querySelector('[data-o="sua-luat-chung"]');
    expect(lop(form)).toEqual(expect.arrayContaining(LOP_THE.split(' ')));
    oNhapChung(form?.querySelector('[data-nhap="danh-sach-cam"]'));
    oNhapChung(form?.querySelector('[data-nhap="checklist"]'));
    expect(k.querySelector('[data-nut="mo-sua-luat-chung"]')).toBeNull();
    expect(k.querySelector('header time')).not.toBeNull();
    // Một khối chỉ một `NUT_CHINH`.
    const chinh = [...k.querySelectorAll('button')].filter((b) => lop(b).includes(NUT_CHINH.split(' ')[0]!));
    expect(chinh).toHaveLength(1);
  });

  it('chấm sức sống giữ quy ước THIET-KE: token `bg-tot`/`bg-canh`/`bg-neutral-300`, có nhãn', async () => {
    mayBanDo({
      du_an: (['xanh', 'vang', 'trang'] as const).map((s, i) => ({
        id: `pj-${String(i)}`,
        ma: `M${String(i)}`,
        ten: `Dự án ${String(i)}`,
        nhom: null,
        trang_thai: 'active',
        nhan_trang_thai: 'Đang chạy',
        quan_ly_agent_id: null,
        quan_ly_agent_ten: null,
        thu_muc: null,
        so_dang_lam: 0,
        suc_song: s,
        cap_nhat_luc: GIO,
        khong_code: false,
        bat_buoc_review: false,
        co_ho_so: false,
        uu_tien: 3,
        dang_day: false,
        duy_tri: false,
        ten_ngan: null,
      })),
    });
    dung(<TrangBanDo />, '/ban-do-du-an');
    await waitFor(() => {
      expect(document.querySelectorAll('[data-suc-song]')).toHaveLength(3);
    });
    for (const [s, mau] of [
      ['xanh', 'bg-tot'],
      ['vang', 'bg-canh'],
      ['trang', 'bg-neutral-300'],
    ] as const) {
      const c = document.querySelector(`[data-suc-song="${s}"]`);
      expect(lop(c)).toContain(mau);
      expect(c?.getAttribute('role')).toBe('img');
      expect(c?.getAttribute('aria-label')).not.toBe('');
    }
  });
});

/* ================================================================== *
 * 3. Hộp Token agent
 * ================================================================== */

describe('hộp Token agent — token màu, chip "đã thu hồi"', () => {
  it('ô token mới: `bg-nen-noi` + `text-chu` + viền mờ (token ngữ nghĩa), không thang `neutral-*`; token liền ngắt', async () => {
    new MayChuGia().dat('POST /v1/agent/ag-1/token', { than: { agent_id: 'ag-1', token: 'btn_' + 'x'.repeat(60), token_bon_cuoi: 'xxxx' } }).gan();
    dung(<NutToken agent={agentDong({ id: 'ag-1', ten: 'W-builder' })} />);
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    await userEvent.click(document.querySelector('[data-nut="xac-nhan-token"]') as HTMLElement);
    const o = await waitFor(() => {
      const x = document.querySelector('[data-o="token-moi"]');
      if (x === null) throw new Error('chưa có token');
      return x;
    });
    expect(lop(o)).toEqual(expect.arrayContaining(['bg-nen-noi', 'text-chu', 'border', 'border-vien', 'break-all']));
    expect(lop(o).filter((c) => /neutral-/.test(c))).toEqual([]);
    khongTatOutline(document.querySelector('[data-o="hop-token"]'));
  });

  it('"Token đã thu hồi" là chip lỗi `LOP_CHIP_LOI`, không tô nền', () => {
    new MayChuGia().gan();
    dung(<NutToken agent={agentDong({ id: 'ag-1', ten: 'W-builder', token_thu_hoi_luc: GIO })} />);
    const chip = screen.getByText(NHAN_TOKEN_DA_THU_HOI);
    expect(chip.getAttribute('class')).toBe(LOP_CHIP_LOI);
    khongToNen(chip);
  });

  it('nguồn: lớp phủ `bg-lop-phu` (quy ước chung mọi hộp nổi), không `bg-neutral-*` nào', async () => {
    const ma = boGhiChu(await docMot('trang/token-agent.tsx'));
    // BAT-69: `bg-black/50` thành token `lop-phu` (cùng giá trị đen 50% ở hai chế độ).
    expect(ma).toContain('absolute inset-0 bg-lop-phu');
    expect(ma).not.toMatch(/bg-neutral-/);
    expect(ma).not.toMatch(/(?:^|[\s"`:])outline-(?:none|hidden)\b/);
  });
});

/* ================================================================== *
 * 4. Cài đặt
 * ================================================================== */

function mayCaiDat(): void {
  new MayChuGia()
    .dat('GET /v1/sao-luu', {
      than: {
        bat: true,
        items: [{ ngay: '2026-10-16', khoa: 'sao-luu/baton-2026-10-16.json', kich_thuoc: 2048, tao_luc: 1 }],
      },
    })
    .dat('GET /v1/chu/phien-dang-nhap', {
      than: {
        bay_gio: GIO,
        items: [
          {
            tao_luc: GIO - PHUT,
            het_luc: GIO + PHUT,
            dung_cuoi_luc: GIO - PHUT,
            thiet_bi: CHUOI_LIEN,
            ua: 'UA',
            hien_tai: true,
          },
        ],
      },
    })
    .dat('GET /v1/cai-dat/thong-bao', {
      than: {
        items: [
          { cong_tac: 'phien_dung', nhan: 'Phiên đứng', bat: true, khoa: false, ly_do_khoa: null },
          { cong_tac: 'bao_mat', nhan: 'Bảo mật tài khoản', bat: true, khoa: true, ly_do_khoa: 'Luôn bật.' },
        ],
      },
    })
    .gan();
}

describe('Cài đặt — bốn mục là khối chung, danh sách dòng chuẩn, 375px', () => {
  it('bốn mục: vỏ viền mờ trên (`border-t border-vien pt-5`) bọc khối `vo/khoi`, đúng thứ tự', async () => {
    mayCaiDat();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText('2026-10-16');
    const khoi = [...document.querySelectorAll('section[data-khoi]')];
    expect(khoi.map((k) => k.getAttribute('data-khoi'))).toEqual(['du-lieu', 'sao-luu', 'thong-bao', 'tai-khoan']);
    const ten = ['Dữ liệu', 'Bản sao lưu', TIEU_DE_THONG_BAO, 'Tài khoản'];
    khoi.forEach((k, i) => {
      khoiChung(k, ten[i]!);
      expect(lop(k.parentElement)).toEqual(expect.arrayContaining(['border-t', 'border-vien', 'pt-5', 'min-w-0']));
    });
    expect(screen.getByRole('heading', { level: 1 }).getAttribute('class')).toBe(LOP_TIEU_DE_TRANG);
  });

  it('bản sao lưu: dòng `flex-wrap LOP_DONG` trong `LOP_DS_DONG`; nút "Tải" là `NUT_PHU` dồn phải', async () => {
    mayCaiDat();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText('2026-10-16');
    const li = document.querySelector('[data-ban-sao-luu="2026-10-16"]');
    expect(li?.getAttribute('class')).toBe(`flex-wrap ${LOP_DONG}`);
    expect(lop(li?.parentElement)).toEqual(expect.arrayContaining(LOP_DS_DONG.split(' ')));
    const nut = li?.querySelector('button');
    expect(lop(nut)).toEqual(expect.arrayContaining(['ml-auto', 'border', 'border-vien']));
    khongTatOutline(nut);
  });

  it('phiên đang mở: dòng `flex-wrap LOP_DONG`; tên thiết bị dài ngắt được; "Phiên này" là chip viền mờ', async () => {
    mayCaiDat();
    dung(<TrangCaiDat />, '/cai-dat');
    const ten = await screen.findByText(CHUOI_LIEN);
    const li = ten.closest('li');
    expect(li?.getAttribute('class')).toBe(`flex-wrap ${LOP_DONG}`);
    chuDaiCoDuoc(ten);
    const chip = li?.querySelector('[data-o="phien-nay"]');
    expect(lop(chip)).toEqual(expect.arrayContaining(LOP_CHIP.split(' ')));
    khongToNen(chip);
  });

  it('công tắc Telegram: dòng `LOP_DONG_NHIEU_TANG`; nhãn và lý do khoá co được', async () => {
    mayCaiDat();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText('Luôn bật.');
    const li = document.querySelector('[data-cong-tac="bao_mat"]');
    expect(li?.getAttribute('class')).toBe(LOP_DONG_NHIEU_TANG);
    chuDaiCoDuoc(li?.querySelector('[data-o="ly-do-khoa"]'));
    chuDaiCoDuoc(li?.querySelector('label > span'));
  });

  it('đổi mật khẩu: bốn ô `LOP_O_NHAP`, không tắt outline', async () => {
    mayCaiDat();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText('2026-10-16');
    const form = document.querySelector('form');
    const o = [...(form?.querySelectorAll('input') ?? [])];
    expect(o).toHaveLength(4);
    for (const x of o) oNhapChung(x);
  });

  it('nguồn: không `section aria-labelledby` + `h2` tự viết, không thẻ viết tay `rounded-lg border … bg-nen-lop`', async () => {
    const ma = boGhiChu(await docMot('trang/cai-dat.tsx'));
    expect(ma).toMatch(/from '\.\.\/vo\/khoi'/);
    expect(ma).not.toMatch(/<h2 /);
    expect(ma).not.toContain('rounded-lg border border-vien bg-nen-lop');
    expect(ma).not.toContain('px-3 py-2 text-sm hover:bg-nen-lop');
  });
});

/* ================================================================== *
 * 5. Đăng nhập (chỉ giao diện)
 * ================================================================== */

describe('Đăng nhập — thẻ lớp nổi, ô nhập chung, một nút chính', () => {
  it('`h1` `LOP_TIEU_DE_TRANG`; biểu mẫu `LOP_THE`; hai ô `LOP_O_NHAP`; một `NUT_CHINH`; cột hẹp không tràn 375px', () => {
    new MayChuGia().gan();
    dung(<TrangDangNhap />, '/');
    expect(screen.getByRole('heading', { level: 1 }).getAttribute('class')).toBe(LOP_TIEU_DE_TRANG);
    const form = document.querySelector('form');
    expect(lop(form)).toEqual(expect.arrayContaining(LOP_THE.split(' ')));
    oNhapChung(screen.getByLabelText(NHAN_MAT_KHAU));
    oNhapChung(screen.getByLabelText(NHAN_MA_TOTP));
    const nut = screen.getByRole('button', { name: NHAN_NUT });
    expect(lop(nut)).toEqual(expect.arrayContaining(NUT_CHINH.split(' ')));
    expect(form?.querySelectorAll('button')).toHaveLength(1);
    khongTatOutline(nut);
    const main = document.querySelector('main');
    expect(lop(main)).toEqual(expect.arrayContaining(['w-full', 'max-w-sm']));
  });
});

/* ================================================================== *
 * 6. Nguồn chung của năm trang
 * ================================================================== */

describe('nguồn của các màn BAT-68', () => {
  it('năm trang: không `outline-none`, không `bg-canh-nen`/`bg-loi-nen`, không `function Khoi` tự viết', async () => {
    for (const f of [
      'trang/nhat-ky.tsx',
      'trang/ban-do.tsx',
      'trang/token-agent.tsx',
      'trang/cai-dat.tsx',
      'trang/dang-nhap.tsx',
    ]) {
      const ma = boGhiChu(await docMot(f));
      expect(ma, f).not.toMatch(/(?:^|[\s"`:])outline-(?:none|hidden)\b/);
      expect(ma, f).not.toMatch(/bg-(?:canh|loi)-nen/);
      expect(ma, f).not.toMatch(/function Khoi\b/);
    }
  });

  it('Nhật ký: không chữ `text-canh` trần, dòng không còn viết chuỗi tay', async () => {
    const ma = boGhiChu(await docMot('trang/nhat-ky.tsx'));
    expect(ma).not.toMatch(/\btext-canh\b/);
    expect(ma).not.toContain('flex flex-col gap-1 px-3 py-2.5 text-sm hover:bg-nen-lop');
    expect(ma).toMatch(/<li data-dong=\{d\.id\} className=\{LOP_DONG_NHIEU_TANG\}>/);
  });

  it('Token agent: không chữ `text-loi` trần trên nhãn trạng thái', async () => {
    const ma = boGhiChu(await docMot('trang/token-agent.tsx'));
    expect(ma).not.toMatch(/className="[^"]*\btext-loi\b/);
  });

  it('Bản đồ: Luật chung dùng `vo/khoi`, không `h2` tự viết', async () => {
    const ma = boGhiChu(await docMot('trang/ban-do.tsx'));
    expect(ma).toMatch(/from '\.\.\/vo\/khoi'/);
    expect(ma).not.toMatch(/<h2 /);
  });
});
