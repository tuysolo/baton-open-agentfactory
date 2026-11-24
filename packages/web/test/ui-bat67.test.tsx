/**
 * **UI BAT-67** — Chi tiết phiên, Báo cáo, Hồ sơ dự án lên mức "làm kỹ" của
 * `THIET-KE.md`, cộng phần dọn cùng họ (focus nhìn thấy được trên khung hộp, chip
 * cờ không tô nền, chấm agent sidebar). Không ca nào ở đây kiểm hành vi SPEC mới:
 * hành vi không đổi, các ca hành vi vẫn ở `doi-agent.test.tsx` (phiên),
 * `bao-cao.test.tsx`, `ban-do.test.tsx` (hồ sơ), `phim-vo`/`tao-viec`/
 * `command-menu`/`giao-viec`/`the-viec`/`vo-linear`. Ca ở đây ghim **quy tắc
 * trình bày** đã ghi vào `THIET-KE.md`:
 *
 *   1. khối dùng `vo/khoi` (`section[aria-label][data-khoi]` + `header`
 *      `LOP_DAU_KHOI` + `h2` `LOP_TIEU_DE_MUC`);
 *   2. chip cảnh báo viền mờ, không `bg-*-nen`; icon/chấm trước mã/tên;
 *   3. dòng `LOP_DS_DONG` + `LOP_DONG`; 375px không tràn (jsdom không dàn trang ⇒
 *      ghim lớp: `flex-wrap` / `min-w-0` / `break-words` / `truncate`);
 *   4. khung hộp nhận focus không tắt outline; vòng `:focus-visible` của
 *      `kieu.css` không phải `none`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, NHAN_MENU_TRUOT } from '../src/App';
import type { HoSo, ManHinhPhien } from '../src/api';
import { TEN_KHOI_PHIEN, TrangPhien } from '../src/trang/phien';
import { TrangBaoCao, VE_SANG, VE_TOI } from '../src/trang/bao-cao';
import {
  TEN_KHOI_LICH_SU,
  TEN_KHOI_LOI_DA_GAP,
  TEN_KHOI_MUC,
  TrangHoSoDuAn,
} from '../src/trang/ho-so-du-an';
import { duongHoSo } from '../src/trang/ban-do';
import { TrangChiTietTicket } from '../src/trang/chi-tiet-ticket';
import { NHAN_PANEL, TrangDanhSachTicket } from '../src/trang/danh-sach-ticket';
import { KHOA_THE } from '../src/loc-ticket';
import { NHAN_TAO_LAI_TOKEN, NutToken } from '../src/trang/token-agent';
import { HopGiaoViec } from '../src/vo/giao-viec';
import { NHAN_BANG_PHIM } from '../src/vo/phim-vo';
import { NHAN_HOP_TAO_VIEC } from '../src/vo/tao-viec';
import { NHAN_COMMAND_MENU } from '../src/vo/command-menu';
import { NHAN_MO_MENU } from '../src/vo/thanh-tren';
import { TRUY_VAN_HEP } from '../src/vo/kho-man-hinh';
import {
  LOP_CHIP,
  LOP_CHIP_CANH,
  LOP_DAU_KHOI,
  LOP_DONG,
  LOP_DONG_NHIEU_TANG,
  LOP_DS_DONG,
  LOP_TIEU_DE_MUC,
} from '../src/vo/lop-nut';
import { MayChuGia, TOI_CHU, datKhoGia, dung } from './giup';
import { GIO, PHUT, agentDong, doiAgent, hoatDong, manHinhPhien, phienDong } from './than-agent';
import {
  THAN_AGENT,
  THAN_DU_AN,
  dong,
  manHinhDanhSach,
  manHinhTicket,
  ticketDayDu,
} from './than-ticket';
import { DA_XU_LY_RONG, manHinh } from './than-can-chu';

/* ================================================================== *
 * Giúp
 * ================================================================== */

const NGUON = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });

async function docMot(duoi: string): Promise<string> {
  for (const [duong, doc] of Object.entries(NGUON)) {
    if (duong.endsWith(duoi)) return (await doc()) as string;
  }
  throw new Error(`không thấy ${duoi}`);
}

/** Bỏ ghi chú khối và dòng: ghi chú **nói về** class cũ để giải thích. */
function boGhiChu(ma: string): string {
  return ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function lop(e: Element | null | undefined): string[] {
  return (e?.getAttribute('class') ?? '').split(/\s+/).filter((x) => x !== '');
}

/** `a` đứng TRƯỚC `b` trong DOM. */
function truoc(a: Element | null | undefined, b: Element | null | undefined): boolean {
  if (a == null || b == null) return false;
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** Chip không tô nền: không một lớp `bg-*` nào (gồm `bg-canh-nen`, `bg-loi-nen`). */
function khongToNen(e: Element | null | undefined): void {
  expect(e, 'không thấy phần tử').not.toBeNull();
  expect(lop(e).filter((c) => c.startsWith('bg-'))).toEqual([]);
}

/**
 * **375px không tràn** (THIET-KE "Bảng và danh sách", bài học BAT-66): một dòng
 * KHÔNG `flex-wrap` thì không con nào được có bề rộng cố định không tiền tố `sm:`
 * (`w-32`, `min-w-16`…; `min-w-0` thì được). jsdom không dàn trang nên chỉ ghim
 * được bằng lớp (`cau-hoi-spec.md` #109).
 */
function khongTran375(dong_: Element): void {
  const l = lop(dong_);
  if (l.includes('flex-wrap') || l.includes('flex-col')) return;
  for (const con of [...dong_.children]) {
    const co_dinh = lop(con).filter((c) => /^(?:w|min-w)-(?!0$)/.test(c));
    expect(co_dinh, con.outerHTML).toEqual([]);
  }
}

/** Phần chữ dài trong dòng: co được (`min-w-0`) và chuỗi liền thì ngắt. */
function chuDaiCoDuoc(e: Element | null | undefined): void {
  expect(e, 'không thấy phần chữ dài').not.toBeNull();
  expect(lop(e)).toContain('min-w-0');
  expect(lop(e).some((c) => c === 'break-words' || c === 'break-all' || c === 'truncate')).toBe(true);
}

/** Khung hộp KHÔNG tắt outline bằng lớp tiện ích nào. */
function khongTatOutline(e: Element | null | undefined): void {
  expect(e, 'không thấy khung hộp').not.toBeNull();
  const tat = lop(e).filter((c) => /(?:^|:)outline-(?:none|hidden|0)$/.test(c));
  expect(tat, e?.outerHTML.slice(0, 200)).toEqual([]);
}

/** Mọi khối `vo/khoi` của trang: `section[aria-label][data-khoi]` > `header` > `h2`. */
function khoiChung(ma_mong: readonly string[]): void {
  const khoi = [...document.querySelectorAll('section[data-khoi]')];
  expect(khoi.map((k) => k.getAttribute('data-khoi'))).toEqual([...ma_mong]);
  for (const k of khoi) {
    expect(k.getAttribute('aria-label'), k.getAttribute('data-khoi') ?? '').not.toBeNull();
    const dau = k.firstElementChild;
    expect(dau?.tagName).toBe('HEADER');
    expect(dau?.getAttribute('class')).toBe(LOP_DAU_KHOI);
    const h2 = dau?.querySelector('h2');
    expect(h2?.getAttribute('class')).toBe(LOP_TIEU_DE_MUC);
    expect(h2?.textContent).toBe(k.getAttribute('aria-label'));
  }
}

beforeEach(() => {
  datKhoGia();
});

afterEach(() => {
  document.body.style.overflow = '';
});

/* ================================================================== *
 * 0. Đầu khối chung: thêm `flex-wrap`, tương thích ba trang BAT-66
 * ================================================================== */

describe('`LOP_DAU_KHOI` — đầu khối biết xuống hàng ở 375px', () => {
  it('giữ dáng BAT-66 (min-h-7, căn giữa dọc, hai đầu) và thêm `flex-wrap`', () => {
    const l = LOP_DAU_KHOI.split(' ');
    expect(l).toEqual(
      expect.arrayContaining(['flex', 'min-h-7', 'items-center', 'justify-between', 'flex-wrap']),
    );
    // Không bề rộng cố định nào trên đầu khối.
    expect(l.filter((c) => /^(?:w|min-w)-/.test(c))).toEqual([]);
  });
});

/* ================================================================== *
 * 1. Chi tiết phiên
 * ================================================================== */

const CHUOI_LIEN = 'https://vi-du.local/' + 'a'.repeat(120);

function mayPhien(than: ManHinhPhien): void {
  new MayChuGia().dat(`GET /v1/man-hinh-phien/${than.phien.id}`, { than }).gan();
}

const PHIEN_DAY = manHinhPhien({
  phien: phienDong({
    id: 'ph-1',
    trang_thai: 'stalled',
    nhan_trang_thai: 'Đứng',
    dung: true,
    cho_nguoi_giao_qua_han: true,
    tin_hieu: ['STOP'],
  }),
  ticket: {
    id: 'tk-1',
    ma: 'SAI-1',
    tieu_de: `Một tiêu đề rất dài ${CHUOI_LIEN}`,
    trang_thai: 'in_progress',
    nhan_trang_thai: 'Đang làm',
  },
  hoat_dong: [
    hoatDong({ id: 'hd-1', noi_dung: CHUOI_LIEN, loai: 'action', nhan_loai: 'Thao tác', ten_thao_tac: 'baton.ghi_hoat_dong_rat_dai' }),
  ],
  ke_hoach: {
    phien_id: 'ph-1',
    phien_ban: 1,
    gui_luc: GIO - PHUT,
    buoc: [{ thu_tu: 1, noi_dung: CHUOI_LIEN, trang_thai: 'done', nhan_trang_thai: 'Xong' }],
  },
});

describe('Chi tiết phiên — khối chung, chip cảnh báo, icon trước mã, 375px', () => {
  it('hai khối dùng `vo/khoi`: `section[aria-label][data-khoi]` + `header` `LOP_DAU_KHOI` + `h2`', async () => {
    mayPhien(PHIEN_DAY);
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });
    khoiChung(['hoat-dong', 'ke-hoach']);
  });

  it('"Đứng" và "Chờ người giao quá hạn" là chip cảnh báo `LOP_CHIP_CANH`, không tô nền; chữ giữ nguyên', async () => {
    mayPhien(PHIEN_DAY);
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });

    const dung_ = document.querySelector('[data-o="dung"]');
    expect(dung_?.textContent).toBe('Đứng');
    expect(dung_?.getAttribute('class')).toBe(LOP_CHIP_CANH);
    khongToNen(dung_);
    const cho = document.querySelector('[data-o="cho-nguoi-giao"]');
    expect(cho?.textContent).toBe('Chờ người giao quá hạn');
    expect(cho?.getAttribute('class')).toBe(LOP_CHIP_CANH);
    khongToNen(cho);
  });

  it('chip trạng thái phiên là `LOP_CHIP` KHÔNG hình (THIET-KE chưa có quy ước hình cho trạng thái phiên)', async () => {
    mayPhien(PHIEN_DAY);
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });
    const chip = document.querySelector('[data-o="trang-phien"] [data-trang-thai]');
    expect(chip?.getAttribute('class')).toBe(LOP_CHIP);
    expect(chip?.textContent).toBe('Đứng');
    expect(chip?.querySelector('svg')).toBeNull();
    // Chip tín hiệu vẫn `LOP_CHIP`.
    expect(document.querySelector('[data-tin-hieu="STOP"]')?.getAttribute('class')).toBe(LOP_CHIP);
  });

  it('ticket của phiên: `IconTrangThai` (`aria-hidden`, không nhãn) đứng TRƯỚC mã; mã là `ma-ticket`', async () => {
    mayPhien(PHIEN_DAY);
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });
    const dong_ticket = document.querySelector('[data-o="dong-ticket"]');
    const icon = dong_ticket?.querySelector('svg[data-icon-trang-thai="in_progress"]');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('role')).toBeNull();
    const ma = dong_ticket?.querySelector('a[data-o="ticket"]');
    expect(truoc(icon, ma)).toBe(true);
    expect(lop(ma)).toContain('ma-ticket');
    // Không thêm chữ nào: dòng vẫn đọc mã + tiêu đề + tên agent + vai trò.
    expect(dong_ticket?.textContent).toBe(`SAI-1Một tiêu đề rất dài ${CHUOI_LIEN}W-builderNgười làm`);
  });

  it('mã trạng thái ticket lạ ⇒ KHÔNG icon (không đoán), mã ticket vẫn hiện', async () => {
    mayPhien(
      manHinhPhien({
        ticket: { id: 'tk-1', ma: 'SAI-1', tieu_de: 'Việc', trang_thai: 'la_lam', nhan_trang_thai: '?' },
      }),
    );
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });
    expect(document.querySelector('[data-o="dong-ticket"] svg')).toBeNull();
    expect(document.querySelector('a[data-o="ticket"]')?.textContent).toBe('SAI-1');
  });

  it('tên agent trong dòng là chữ chính, gạch chân khi hover — không màu nhấn liên kết', async () => {
    mayPhien(PHIEN_DAY);
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });
    const a = document.querySelector('a[data-o="agent"]');
    expect(lop(a)).toEqual(expect.arrayContaining(['text-chu', 'hover:underline']));
    expect(lop(a)).not.toContain('text-nhan-manh-chu');
  });

  it('d.411 — 375px: dòng hoạt động / bước kế hoạch `flex-wrap`, nội dung dài `min-w-0` + ngắt', async () => {
    mayPhien(PHIEN_DAY);
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    const khoi_hd = await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });

    const hd = khoi_hd.querySelector('li[data-hoat-dong]');
    expect(lop(hd)).toContain('flex-wrap');
    expect(lop(hd)).toEqual(expect.arrayContaining(LOP_DONG.split(' ')));
    chuDaiCoDuoc([...(hd?.querySelectorAll('span') ?? [])].find((s) => s.textContent === CHUOI_LIEN));
    chuDaiCoDuoc(hd?.querySelector('[data-o="thao-tac"]'));
    khongTran375(hd!);

    const buoc = screen.getByRole('region', { name: TEN_KHOI_PHIEN.ke_hoach }).querySelector('li[data-buoc]');
    // Cột số thứ tự `w-5` cố định ⇒ dòng PHẢI `flex-wrap`.
    expect(lop(buoc)).toContain('flex-wrap');
    chuDaiCoDuoc([...(buoc?.querySelectorAll('span') ?? [])].find((s) => s.textContent === CHUOI_LIEN));

    // Hàng ticket của đầu trang: `flex-wrap`, tiêu đề dài co được.
    const dt = document.querySelector('[data-o="dong-ticket"]');
    expect(lop(dt)).toContain('flex-wrap');
    chuDaiCoDuoc([...(dt?.querySelectorAll('span') ?? [])].find((s) => s.textContent?.startsWith('Một tiêu đề')));
  });

  it('dòng hoạt động và bước kế hoạch nằm trong `LOP_DS_DONG`', async () => {
    mayPhien(PHIEN_DAY);
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong });
    expect(document.querySelector('[data-ds="hoat-dong"]')?.getAttribute('class')).toBe(LOP_DS_DONG);
    expect(document.querySelector('[data-ds="buoc"]')?.getAttribute('class')).toBe(LOP_DS_DONG);
  });
});

/* ================================================================== *
 * 2. Báo cáo
 * ================================================================== */

const NGAY = '2026-10-06';
const HOM_QUA = '2026-10-05';
const TAO_LUC = 1_760_000_000_000;

const SANG = {
  ngay: NGAY,
  loai: 'sang',
  nhan_loai: 'Báo cáo sáng',
  tao_luc: TAO_LUC,
  noi_dung_md: '# sáng\n',
  du_lieu: {
    ngay: NGAY,
    tao_luc: TAO_LUC,
    can_chu: {
      so_cho: 1,
      so_theo_muc: { urgent: 1, today: 0, later: 0 },
      gap_nhat: [{ ma: 'T-7', tieu_de: 'Chốt tên miền', nhan_muc: 'Gấp' }],
    },
    trong_tam: [
      { thu_tu: 1, ma: 'SAI-1', tieu_de: 'Việc một', nhan_trang_thai: 'Đang làm', dat: false, ghi_chu: 'ghi chú' },
    ],
    hom_qua: { ngay: HOM_QUA, viec: [{ ma: 'SAI-9', tieu_de: CHUOI_LIEN, nhan_trang_thai: 'Xong' }] },
    dang_chay: [{ ma: 'SAI-11', tieu_de: 'Trang báo cáo', nhan_trang_thai: 'Đang làm', agent_id: null }],
    rui_ro_va_lech: [{ nhan_loai: 'Bằng chứng trượt', chi_tiet: 'SAI-11 — commit chưa merge' }],
    quyet_dinh_moi: [{ nguoi: 'Chủ', quyet_dinh: 'Dùng D1', vi_sao: 'Đã có sẵn' }],
  },
};

const TOI = {
  ngay: NGAY,
  loai: 'toi',
  nhan_loai: 'Handoff tối',
  tao_luc: TAO_LUC,
  noi_dung_md: '# tối\n',
  du_lieu: {
    ngay: NGAY,
    tao_luc: TAO_LUC,
    trong_tam: [
      { thu_tu: 1, ma: 'SAI-1', tieu_de: 'Việc một', nhan_trang_thai: 'Xong', dat: true, ghi_chu: null },
    ],
    du_an: [
      { ma: 'SAI', ten: 'Sample', nhan_suc_song: 'Dự án không chạy', so_dang_lam: 0, so_cho_kiem_chung: 1, so_xong_24h: 2 },
    ],
    chuyen_sang_mai: [{ ma: 'SAI-12', tieu_de: 'Nhập dữ liệu cũ', nhan_trang_thai: 'Đang làm' }],
    can_chu_moi: [{ ma: 'T-8', tieu_de: 'Chọn gói', nhan_muc: 'Hôm nay' }],
  },
};

function mayBaoCao(dau: 'sang' | 'toi'): void {
  const items = (dau === 'sang' ? [SANG, TOI] : [TOI, SANG]).map((b) => ({
    ngay: b.ngay,
    loai: b.loai,
    nhan_loai: b.nhan_loai,
    tao_luc: b.tao_luc,
  }));
  new MayChuGia()
    .dat('GET /v1/trong-tam', { than: { ngay: NGAY, muc: [] } })
    .dat('GET /v1/bao-cao', { than: { items, cursor_sau: null } })
    .dat(`GET /v1/bao-cao/${NGAY}/sang`, { than: SANG })
    .dat(`GET /v1/bao-cao/${NGAY}/toi`, { than: TOI })
    .gan();
}

function ve(ten: string): Element {
  const v = document.querySelector(`[data-ve="${ten}"]`);
  if (v === null) throw new Error(`không thấy vế ${ten}`);
  return v;
}

describe('Báo cáo — mọi vế là danh sách dòng (`LOP_DS_DONG` + `LOP_DONG`)', () => {
  it('báo cáo sáng: mỗi danh sách là `LOP_DS_DONG`, mỗi dòng `LOP_DONG` + `flex-wrap` (trừ dòng nhiều tầng)', async () => {
    mayBaoCao('sang');
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });

    for (const ten of [VE_SANG.can_chu, VE_SANG.trong_tam, VE_SANG.hom_qua, VE_SANG.dang_chay, VE_SANG.rui_ro, VE_SANG.quyet_dinh]) {
      const ds = ve(ten).querySelector('ul, ol');
      expect(ds?.getAttribute('class'), ten).toBe(LOP_DS_DONG);
      for (const li of [...(ds?.children ?? [])]) {
        expect(li.tagName).toBe('LI');
        // Không còn `<li className="text-sm">` trần.
        expect(li.getAttribute('class'), ten).not.toBe('text-sm');
        if (ten === VE_SANG.quyet_dinh) {
          expect(li.getAttribute('class')).toBe(LOP_DONG_NHIEU_TANG);
        } else {
          expect(li.getAttribute('class')).toBe(`flex-wrap ${LOP_DONG}`);
        }
        khongTran375(li);
      }
    }
  });

  it('handoff tối: bốn vế cũng là `LOP_DS_DONG` + dòng `flex-wrap LOP_DONG`', async () => {
    mayBaoCao('toi');
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    for (const ten of Object.values(VE_TOI)) {
      const ds = ve(ten).querySelector('ul, ol');
      expect(ds?.getAttribute('class'), ten).toBe(LOP_DS_DONG);
      for (const li of [...(ds?.children ?? [])]) {
        expect(li.getAttribute('class'), ten).toBe(`flex-wrap ${LOP_DONG}`);
      }
    }
  });

  it('mã ticket là `ma-ticket` và đứng TRƯỚC tiêu đề; tiêu đề dài co được (375px)', async () => {
    mayBaoCao('sang');
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });
    const li = document.querySelector('[data-viec="SAI-9"]');
    const ma = li?.querySelector('.ma-ticket');
    expect(ma?.textContent).toBe('SAI-9');
    const tieu_de = [...(li?.querySelectorAll('span') ?? [])].find((s) => s.textContent === CHUOI_LIEN);
    expect(truoc(ma, tieu_de)).toBe(true);
    chuDaiCoDuoc(tieu_de);
  });

  it('chữ trong dòng giữ nguyên từng ký tự (chỉ bọc thêm `span`)', async () => {
    mayBaoCao('sang');
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });
    expect(document.querySelector('[data-viec="SAI-11"]')?.textContent).toBe(
      'SAI-11 Trang báo cáo (Đang làm) — không ai cầm',
    );
    expect(document.querySelector('[data-trong-tam="SAI-1"]')?.textContent).toBe(
      '☐ SAI-1 Việc một (Đang làm) — ghi chú',
    );
    expect(document.querySelector('[data-muc="T-7"]')?.textContent).toBe('Gấp T-7 Chốt tên miền');
    expect(document.querySelector('[data-rui-ro="Bằng chứng trượt"]')?.textContent).toBe(
      'Bằng chứng trượt: SAI-11 — commit chưa merge',
    );
    expect(ve(VE_SANG.quyet_dinh).querySelector('li')?.textContent).toBe('Chủ Dùng D1 — vì sao: Đã có sẵn');
  });

  it('handoff tối: dòng dự án giữ nguyên chữ', async () => {
    mayBaoCao('toi');
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    expect(document.querySelector('[data-du-an="SAI"]')?.textContent).toBe(
      'SAI Sample — Dự án không chạy; Đang làm 0, Chờ kiểm chứng 1, Xong 24 giờ qua 2',
    );
  });

  it('Rủi ro và lệch: nhãn loại là chip cảnh báo `LOP_CHIP_CANH`, không tô nền, không chữ `canh` trần', async () => {
    mayBaoCao('sang');
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });
    const chip = document.querySelector('[data-rui-ro="Bằng chứng trượt"] [data-o="loai-rui-ro"]');
    expect(chip?.textContent).toBe('Bằng chứng trượt');
    expect(chip?.getAttribute('class')).toBe(LOP_CHIP_CANH);
    khongToNen(chip);
  });

  it('KHÔNG `IconTrangThai` trong báo cáo: thân chỉ mang NHÃN trạng thái, không mã (không suy mã từ nhãn)', async () => {
    mayBaoCao('sang');
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });
    expect(document.querySelector('article [data-icon-trang-thai]')).toBeNull();
  });

  it('Cần Chủ không có mục gấp nào ⇒ không dựng khung danh sách rỗng', async () => {
    const goc = SANG.du_lieu.can_chu.gap_nhat;
    SANG.du_lieu.can_chu.gap_nhat = [];
    try {
      mayBaoCao('sang');
      dung(<TrangBaoCao />);
      await screen.findByRole('heading', { name: /Báo cáo sáng/ });
      expect(ve(VE_SANG.can_chu).querySelector('ul')).toBeNull();
      expect(ve(VE_SANG.can_chu).querySelector('[data-o="so-cho"]')?.textContent).toBe('1');
    } finally {
      SANG.du_lieu.can_chu.gap_nhat = goc;
    }
  });
});

/* ================================================================== *
 * 3. Hồ sơ dự án
 * ================================================================== */

const PJ = 'pj-SAI';

function hoSo(p: Partial<HoSo> = {}): HoSo {
  return {
    la_gi: 'Là một dự án',
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
    phien_ban: 2,
    cap_nhat_luc: GIO - PHUT,
    khong_code: true,
    bat_buoc_review: true,
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
      dat_boi: null,
    },
    loi_da_gap: [
      {
        id: 'ld-1',
        ngay: '2025-10-09',
        loi: CHUOI_LIEN,
        cach_tranh: CHUOI_LIEN,
        ghi_boi_loai: 'agent',
        ghi_boi_agent_id: 'W-builder-rat-dai',
        tao_luc: GIO,
      },
    ],
    lich_su_ban: [
      { id: 'b1', phien_ban: 1, luc: GIO - 2 * PHUT, sua_boi_loai: 'agent', sua_boi_agent_id: 'M-Baton', muc: {} },
    ],
    ...p,
  };
}

function mayHoSo(hs: HoSo = hoSo()): void {
  new MayChuGia().dat(`GET /v1/du-an/${PJ}/ho-so`, { than: hs }).gan();
}

describe('Hồ sơ dự án — khối chung, chip cờ, dòng nhiều tầng, 375px', () => {
  it('ba khối dùng `vo/khoi`; nút "Sửa hồ sơ" / "Thêm một lỗi" nằm TRONG `header` đầu khối (`flex-wrap`)', async () => {
    mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    await screen.findByRole('region', { name: TEN_KHOI_LICH_SU });
    khoiChung(['muc', 'loi-da-gap', 'lich-su']);
    const dau_muc = screen.getByRole('region', { name: TEN_KHOI_MUC }).querySelector('header');
    expect(dau_muc?.querySelector('[data-nut="mo-sua"]')).not.toBeNull();
    expect(lop(dau_muc)).toContain('flex-wrap');
    const dau_loi = screen.getByRole('region', { name: TEN_KHOI_LOI_DA_GAP }).querySelector('header');
    expect(dau_loi?.querySelector('[data-nut="mo-them-loi"]')).not.toBeNull();
  });

  it('hai cờ d.300 là chip cảnh báo `LOP_CHIP_CANH` — KHÔNG `bg-canh-nen`; `data-co` và chữ giữ nguyên', async () => {
    mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    await screen.findByRole('region', { name: TEN_KHOI_LICH_SU });
    for (const [ma, chu] of [
      ['khong-code', 'Dự án không code'],
      ['bat-buoc-review', 'Bắt buộc review'],
    ] as const) {
      const co = document.querySelector(`[data-co="${ma}"]`);
      expect(co?.textContent).toBe(chu);
      expect(co?.getAttribute('class')).toBe(LOP_CHIP_CANH);
      khongToNen(co);
    }
  });

  it('Lỗi đã gặp: dòng nhiều tầng `LOP_DONG_NHIEU_TANG`; lỗi / cách tránh / người ghi ngắt được ở 375px', async () => {
    mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    const khoi = await screen.findByRole('region', { name: TEN_KHOI_LOI_DA_GAP });
    expect(khoi.querySelector('[data-ds="loi-da-gap"]')?.getAttribute('class')).toBe(LOP_DS_DONG);
    const li = khoi.querySelector('[data-loi="ld-1"]');
    expect(li?.getAttribute('class')).toBe(LOP_DONG_NHIEU_TANG);
    expect(lop(li)).toContain('min-w-0');
    expect(lop(li?.querySelector('[data-o="loi"]'))).toContain('break-words');
    expect(lop(li?.querySelector('[data-o="cach-tranh"]'))).toContain('break-words');
    chuDaiCoDuoc(li?.querySelector('[data-o="ghi-boi"]'));
    // Hàng trên chữ phụ biết xuống hàng; ngày là chữ mờ hơn `tabular-nums`.
    expect(lop(li?.querySelector('[data-o="ngay"]'))).toEqual(
      expect.arrayContaining(['text-chu-mo-hon', 'tabular-nums']),
    );
  });

  it('Lịch sử phiên bản: dòng `flex-wrap LOP_DONG`; người sửa dồn phải, `truncate` + `title`', async () => {
    mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    const khoi = await screen.findByRole('region', { name: TEN_KHOI_LICH_SU });
    const li = khoi.querySelector('[data-ban="1"]');
    expect(li?.getAttribute('class')).toBe(`flex-wrap ${LOP_DONG}`);
    const ai = li?.querySelector('[data-o="sua-boi"]');
    expect(ai?.textContent).toBe('M-Baton');
    expect(ai?.getAttribute('title')).toBe('M-Baton');
    expect(lop(ai)).toEqual(expect.arrayContaining(['ml-auto', 'min-w-0', 'truncate', 'text-xs', 'text-chu-mo']));
  });
});

/* ================================================================== *
 * 4. Dọn: chip cờ chi tiết ticket, chấm agent sidebar
 * ================================================================== */

describe('chip cờ của chi tiết ticket — không tô nền', () => {
  it('cờ đang bật là `LOP_CHIP_CANH` (viền mờ, chữ `canh`), giữ `data-co`', async () => {
    const MA = 'SAI-1';
    new MayChuGia()
      .dat(`GET /v1/man-hinh-ticket/ma/${MA}`, {
        than: manHinhTicket(
          ticketDayDu({
            ma: MA,
            co: {
              xong_khong_bang_chung: true,
              nhap_khong_bang_chung: false,
              khong_ai_cam: true,
              can_review_lai: false,
            },
          }),
        ),
      })
      .gan();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await waitFor(() => {
      expect(document.querySelector('[data-co="xong_khong_bang_chung"]')).not.toBeNull();
    });
    for (const k of ['xong_khong_bang_chung', 'khong_ai_cam']) {
      const co = document.querySelector(`[data-co="${k}"]`);
      expect(co?.textContent).toBe(k);
      expect(co?.getAttribute('class')).toBe(LOP_CHIP_CANH);
      khongToNen(co);
    }
    expect(document.querySelector('[data-co="nhap_khong_bang_chung"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Vỏ thật (App) — cùng nếp `phim-vo.test.tsx`: đường lạ treo, không lỗi
 * ------------------------------------------------------------------ */

function json(than: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(than), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

function mayVo(): void {
  const bang: Record<string, unknown> = {
    'GET /v1/toi': TOI_CHU,
    'GET /v1/du-an?limit=200': { items: [{ id: 'id-SPX', ma: 'SPX', ten: 'Sample', trang_thai: 'active', nhom: null }], cursor_sau: null },
    'GET /v1/can-chu': manHinh(),
    'GET /v1/can-chu/da-xu-ly': DA_XU_LY_RONG,
    'GET /v1/man-hinh-agent': doiAgent([
      agentDong({ id: 'ag-1', ten: 'W-builder', trang_thai: 'busy', nhan_trang_thai: 'Đang làm' }),
      agentDong({ id: 'ag-2', ten: 'W-reviewer', trang_thai: 'stalled', nhan_trang_thai: 'Đứng' }),
    ]),
    'GET /v1/agent': THAN_AGENT,
  };
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    const k = `${init?.method ?? 'GET'} ${duong}`;
    if (k in bang) return json(bang[k]);
    return new Promise<Response>(() => undefined);
  }) as typeof globalThis.fetch;
}

async function vaoVo(): Promise<void> {
  mayVo();
  dung(<App />, '/khong-co');
  await screen.findByRole('navigation', { name: 'Điều hướng chính' });
}

describe('sidebar — chấm agent là `ChamTrangThaiAgent`', () => {
  it('mỗi agent: `svg[data-cham-agent]` mang nhãn của máy chủ (`role="img"`), vỏ giữ `data-trang-thai-agent`', async () => {
    await vaoVo();
    await screen.findByText('W-builder');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    for (const [t, nhan] of [
      ['busy', 'Đang làm'],
      ['stalled', 'Đứng'],
    ] as const) {
      const vo = nav.querySelector(`[data-trang-thai-agent="${t}"]`);
      const cham = vo?.querySelector(`svg[data-cham-agent="${t}"]`);
      expect(cham, t).not.toBeNull();
      expect(cham?.getAttribute('role')).toBe('img');
      expect(cham?.getAttribute('aria-label')).toBe(nhan);
      // BAT-69: vỏ KHÔNG còn `title` lặp — nhãn chỉ nằm trên chấm (`aria-label`).
      expect(vo?.hasAttribute('title')).toBe(false);
      // Không còn chấm `bg-*` tự tô: màu là `text-*` token của `LOP_TRANG_THAI_AGENT`.
      khongToNen(vo);
    }
    // Đứng là hình thoi (hình duy nhất không tròn) — khác hình Đang làm.
    expect(nav.querySelector('svg[data-cham-agent="stalled"] circle')).toBeNull();
    expect(nav.querySelector('svg[data-cham-agent="busy"] circle')).not.toBeNull();
  });
});

/* ================================================================== *
 * 5. Focus nhìn thấy được trên khung hộp (THIET-KE "Bàn phím trước")
 * ================================================================== */

function docKieuCss(): string {
  const duong = expect.getState().testPath;
  if (duong === undefined) throw new Error('Không biết đường của file test');
  return readFileSync(join(dirname(duong), '..', 'src', 'kieu.css'), 'utf8');
}

function datKhoHep(hep: boolean): () => void {
  const goc = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      media: q,
      matches: q === TRUY_VAN_HEP ? hep : false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  return () => {
    if (goc === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
    else Object.defineProperty(globalThis, 'matchMedia', goc);
  };
}

describe('vòng focus chung của `kieu.css`', () => {
  it('`:focus-visible` vẽ outline 2px màu nhấn — không `none`', () => {
    const css = docKieuCss();
    const m = /:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(m, 'không thấy khối :focus-visible').not.toBeNull();
    const than = m?.[1] ?? '';
    const outline = /(?:^|;|\s)outline\s*:\s*([^;]+);/.exec(than)?.[1]?.trim() ?? '';
    expect(outline).not.toBe('');
    expect(outline).not.toMatch(/\bnone\b/);
    expect(outline).toMatch(/^2px solid var\(--t-nhan-manh\)$/);
  });
});

describe('khung hộp nhận focus không tắt outline, và focus vào hộp khi mở', () => {
  it('bảng phím `?`: khung nhận focus khi mở, không `outline-none`', async () => {
    await vaoVo();
    await userEvent.keyboard('?');
    const hop = screen.getByRole('dialog', { name: NHAN_BANG_PHIM });
    expect(document.activeElement).toBe(hop);
    khongTatOutline(hop);
  });

  it('hộp Tạo việc: khung không `outline-none`, focus nằm trong hộp', async () => {
    await vaoVo();
    await userEvent.keyboard('c');
    const hop = await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
    khongTatOutline(hop);
    expect(hop.contains(document.activeElement)).toBe(true);
  });

  it('command menu: khung không `outline-none`; focus ở ô tìm (ngoại lệ có lý do: ô giữ `focus-visible:outline-none`)', async () => {
    await vaoVo();
    await userEvent.keyboard('{Meta>}k{/Meta}');
    const hop = await screen.findByRole('dialog', { name: NHAN_COMMAND_MENU });
    khongTatOutline(hop);
    const o = hop.querySelector('[data-nhap="tim-nhanh"]');
    expect(document.activeElement).toBe(o);
  });

  it('menu trượt (`fixed inset-0`, con che kín): khung nhận focus, không `outline-none`; vòng vẽ lên tấm sidebar qua `group-focus-visible:` offset âm', async () => {
    await vaoVo();
    await userEvent.click(screen.getByLabelText(NHAN_MO_MENU));
    const hop = screen.getByRole('dialog', { name: NHAN_MENU_TRUOT });
    expect(document.activeElement).toBe(hop);
    khongTatOutline(hop);
    expect(lop(hop)).toContain('group');
    const tam = hop.querySelector('[data-o="tam-menu-truot"]');
    expect(within(tam as HTMLElement).getByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();
    expect(lop(tam)).toEqual(
      expect.arrayContaining([
        'group-focus-visible:outline-2',
        'group-focus-visible:-outline-offset-2',
        'group-focus-visible:outline-nhan-manh',
      ]),
    );
  });

  it('hộp Token agent: khung không `outline-none`, focus nằm trong hộp', async () => {
    new MayChuGia().gan();
    dung(<NutToken agent={agentDong({ id: 'ag-1', ten: 'W-builder' })} />);
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    const hop = document.querySelector('[data-o="hop-token"]');
    khongTatOutline(hop);
    expect(hop?.contains(document.activeElement)).toBe(true);
  });

  it('hộp Giao việc: khung không `outline-none`, focus nằm trong hộp', () => {
    new MayChuGia()
      .dat('GET /v1/agent', { than: THAN_AGENT, cho: new Promise(() => undefined) })
      .gan();
    dung(<HopGiaoViec ticket={{ id: 'tk-SAI-1', ma: 'SAI-1' }} dong={() => undefined} />);
    const hop = document.querySelector('[data-o="hop-giao-viec"]');
    khongTatOutline(hop);
    expect(hop?.contains(document.activeElement)).toBe(true);
  });

  describe('ngăn phải danh sách ticket ở khổ hẹp (`fixed inset-y-0 right-0`)', () => {
    let thao: () => void = () => undefined;
    afterEach(() => {
      thao();
    });

    it('là dialog nhận focus; không `outline-none`; vòng offset ÂM để vẽ vào trong khung nhìn', async () => {
      thao = datKhoHep(true);
      const m = new MayChuGia();
      m.dat('GET /v1/du-an?limit=200', { than: THAN_DU_AN });
      m.dat('GET /v1/agent', { than: THAN_AGENT });
      m.gan();
      const goc = globalThis.fetch;
      globalThis.fetch = ((duong: string, init?: RequestInit) => {
        const ma = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
        if (ma !== undefined) return json(manHinhTicket(ticketDayDu({ ma: decodeURIComponent(ma) })));
        if (duong.startsWith('/v1/man-hinh-ticket')) return json(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
        return goc(duong, init);
      }) as typeof globalThis.fetch;
      dung(<TrangDanhSachTicket />, `/ticket?${KHOA_THE}=SAI-1`);

      const ngan = await screen.findByRole('dialog', { name: NHAN_PANEL });
      expect(ngan.contains(document.activeElement)).toBe(true);
      khongTatOutline(ngan);
      expect(lop(ngan)).toContain('focus-visible:-outline-offset-2');
    });
  });
});

/* ================================================================== *
 * 6. Nguồn
 * ================================================================== */

describe('nguồn của các màn BAT-67', () => {
  it('ba trang: không `bg-canh-nen`/`bg-loi-nen`, không `Khoi` tự viết, không chữ `text-canh` trần', async () => {
    for (const f of ['trang/phien.tsx', 'trang/bao-cao.tsx', 'trang/ho-so-du-an.tsx']) {
      const ma = boGhiChu(await docMot(f));
      expect(ma, f).not.toMatch(/bg-(?:canh|loi)-nen/);
      expect(ma, f).not.toMatch(/function Khoi\b/);
      expect(ma, f).not.toMatch(/className="[^"]*\btext-canh\b/);
      expect(ma, f).not.toContain('outline-none');
    }
    expect(boGhiChu(await docMot('trang/phien.tsx'))).toMatch(/from '\.\.\/vo\/khoi'/);
    expect(boGhiChu(await docMot('trang/ho-so-du-an.tsx'))).toMatch(/from '\.\.\/vo\/khoi'/);
    // Báo cáo: không còn `<li className="text-sm">` / `<ul className="flex flex-col gap-1">` trần.
    const bc = boGhiChu(await docMot('trang/bao-cao.tsx'));
    expect(bc).not.toMatch(/<li[^>]*className="text-sm"/);
    expect(bc).not.toMatch(/<(?:ul|ol)[^>]*className="flex flex-col gap-1"/);
  });

  it('chi tiết ticket: chip cờ không `bg-canh-nen`', async () => {
    expect(boGhiChu(await docMot('trang/chi-tiet-ticket.tsx'))).not.toMatch(/bg-canh-nen/);
  });

  it('khung hộp: không `outline-none`/`focus:outline-none`; ngoại lệ DUY NHẤT là ô tìm của command menu', async () => {
    for (const f of [
      'vo/phim-vo.tsx',
      'vo/giao-viec.tsx',
      'vo/tao-viec.tsx',
      'trang/token-agent.tsx',
      'trang/danh-sach-ticket.tsx',
      'App.tsx',
    ]) {
      const ma = boGhiChu(await docMot(f));
      expect(ma, f).not.toMatch(/(?:^|[\s"`:])outline-(?:none|hidden)\b/);
    }
    const cm = boGhiChu(await docMot('vo/command-menu.tsx'));
    const tat = [...cm.matchAll(/[\w:-]*outline-(?:none|hidden)\b/g)].map((x) => x[0]);
    expect(tat).toEqual(['focus-visible:outline-none']);
    // …và nó nằm trên ô nhập `text-[15px]` (ô tìm), không trên khung.
    expect(cm).toMatch(/className="[^"]*text-\[15px\][^"]*focus-visible:outline-none"/);
  });

  it('hộp xác nhận áp hàng loạt: tiêu đề ở bậc `LOP_TIEU_DE_MUC` (không `text-base font-semibold`)', async () => {
    const ma = boGhiChu(await docMot('trang/danh-sach-ticket.tsx'));
    expect(ma).toMatch(/<h2 id="hop-xac-nhan-ap-tieu-de" className=\{LOP_TIEU_DE_MUC\}>/);
  });

  it('sidebar không còn bảng màu chấm `bg-*` riêng (`MAU_AGENT`)', async () => {
    const ma = boGhiChu(await docMot('vo/sidebar.tsx'));
    expect(ma).not.toMatch(/MAU_AGENT/);
    expect(ma).toMatch(/<ChamTrangThaiAgent trang_thai=\{agent\.trang_thai\} nhan=\{agent\.nhan_trang_thai\} \/>/);
  });
});
