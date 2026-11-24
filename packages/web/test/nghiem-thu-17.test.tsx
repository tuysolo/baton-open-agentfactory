/**
 * **Nghiệm thu v0.1 — SPEC mục 17, nửa GIAO DIỆN của bước 5, 6, 11** (BAT-9),
 * cộng **bước 3, 4, 8** (BAT-70): Tổng quan hiện dự án 🟡 + dòng phiên đứng; chủ
 * chạm phương án B rồi "Gửi duyệt"; chủ bấm "Dừng" ở chi tiết phiên. Chữ nút
 * ("Gửi duyệt", "Dừng") cắt từ chính SPEC 17, không gõ lại.
 *
 * Nửa máy chủ của cùng ba bước (và tám bước còn lại) ở
 * `packages/api/test/nghiem-thu-17.test.ts`. Kết luận từng bước ở
 * `nghiem-thu-v0.1.md` (gốc repo).
 *
 * Giới hạn khai thẳng: jsdom **không nạp CSS và không dàn trang**, nên bước 11
 * ("dùng tốt ở 375px") ở đây chỉ kiểm được những gì **đọc được từ DOM**: lớp đáp
 * ứng, không chiều rộng cứng vượt 375px, bảng nằm trong khung cuộn ngang, hàng nút
 * biết xuống dòng, thẻ `meta viewport`. Thấy tận mắt "dùng tốt" thì là việc của
 * chủ trên điện thoại thật — mục "Chủ thử tay" của `nghiem-thu-v0.1.md`.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrangCanChu } from '../src/trang/can-chu';
import { TEN_KHOI, TEN_O_CAN_CHU, TrangTongQuan } from '../src/trang/tong-quan';
import { TrangChiTietTicket } from '../src/trang/chi-tiet-ticket';
import { TrangPhien } from '../src/trang/phien';
import { CAU_DU_AN_KHONG_CHAY } from '../src/vo/cham-suc-song';
import type { DongDaXuLy, ManHinhCanChu, TongQuan } from '../src/api';
import { MayChuGia, dung } from './giup';
import { DU_AN_RONG, bangDaXuLy, dongDaXuLy, manHinh, phuongAn, the } from './than-can-chu';
import {
  GIO,
  PHUT,
  TONG_QUAN_RONG,
  hangDuAn,
  nhomCanChuY,
  dongCanChuY,
  theViecDangChay,
  ticketDong,
  ticketTroTa,
} from './than-tong-quan';
import { lienKet, luotGiao, manHinhTicket, ticketCon, ticketDayDu } from './than-ticket';
import { manHinhPhien } from './than-agent';
import { cauDuAnKhongChayTuSpec, mucSpec, specDoiDienThoai } from './doc-spec';
import HTML_GOC from '../index.html?raw';
import SPEC_VAN from '../../../SPEC.md?raw';

/**
 * Một bước của SPEC 17 ("Định nghĩa xong"), kể cả các dòng con thụt lề — cắt từ
 * `SPEC.md` để chữ nút của bước 4 và 8 không bị gõ lại trong ca test.
 */
function buocMuc17(so: number): string {
  const muc = mucSpec(SPEC_VAN, 17);
  const dau = muc.indexOf(`\n${String(so)}. `);
  if (dau === -1) throw new Error(`SPEC 17 không có bước ${String(so)}`);
  const sau = muc.indexOf(`\n${String(so + 1)}. `, dau + 1);
  return muc.slice(dau, sau === -1 ? undefined : sau);
}

/** Chữ in đậm `**…**` đầu tiên của một bước SPEC 17. */
function chuDamBuoc(so: number): string {
  const k = /\*\*([^*]+)\*\*/.exec(buocMuc17(so));
  if (k?.[1] === undefined) throw new Error(`Bước ${String(so)} không có chữ in đậm`);
  return k[1];
}

/* ------------------------------------------------------------------ *
 * Máy chủ giả của trang Cần Chủ — có trạng thái (cùng nếp can-chu.test.tsx)
 * ------------------------------------------------------------------ */

function mayCanChu(man: ManHinhCanChu, da: DongDaXuLy[] = []): MayChuGia {
  const kho = { man, da };
  const m = new MayChuGia()
    .dat('GET /v1/can-chu', () => ({ than: kho.man }))
    .dat('GET /v1/can-chu/da-xu-ly', () => ({ than: bangDaXuLy(kho.da) }))
    .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG });
  for (const k of man.khoi) {
    for (const t of k.items) {
      m.dat(`POST /v1/can-chu/${t.id}/xu-ly`, () => {
        kho.man = {
          ...kho.man,
          khoi: kho.man.khoi.map((kk) => ({ ...kk, items: kk.items.filter((x) => x.id !== t.id) })),
        };
        kho.da = [dongDaXuLy({ ma: t.ma, id: t.id }), ...kho.da];
        return { than: { ok: true } };
      });
    }
  }
  return m.gan();
}

/** Ba mục Chờ, ba loại — đúng ba dòng `T-x: ...` của bước 5. */
const BA_MUC = manHinh({
  urgent: [the({ ma: 'T-21', loai: 'fyi', tieu_de: 'Đã dựng bản nháp' })],
  today: [
    the({
      ma: 'T-22',
      loai: 'decision',
      tieu_de: 'Chọn ngưỡng',
      phuong_an: [phuongAn('A', '300'), phuongAn('B', '500', true)],
    }),
  ],
  later: [the({ ma: 'T-23', loai: 'run_command', tieu_de: 'Chạy migration', lenh: 'npm run migrate' })],
});

async function moCanChu(): Promise<ReturnType<typeof userEvent.setup>> {
  const u = userEvent.setup();
  dung(<TrangCanChu />, '/can-chu');
  await screen.findByRole('region', { name: '🔴 Gấp' });
  return u;
}

function oHangLoat(): HTMLElement {
  return document.querySelector('[data-o="van-hang-loat"]') as HTMLElement;
}

/* ================================================================== *
 * Bước 3 — worker im 30 phút: Tổng quan hiện phiên đứng, dự án 🟡
 *
 * Nửa máy chủ (`packages/api/test/nghiem-thu-17.test.ts` › Bước 3) đã ghim rằng
 * ở 10:30 `GET /v1/tong-quan` trả `suc_song = 'vang'` và một dòng Cần chú ý
 * `phien_dung_hoac_loi` trỏ đúng ticket + phiên. Ở đây: web nhận đúng thân ấy
 * thì HIỆN ra đúng như thế.
 * ================================================================== */

const TICKET_DUNG = { ...ticketTroTa('SAI-1', 'Việc đang đứng'), trang_thai: 'in_progress', nhan_trang_thai: 'Đang làm' };

/** Thân Tổng quan lúc 10:30 của bước 3 — đúng hình máy chủ trả (`doc-tong-quan.ts`). */
const TONG_QUAN_BUOC_3: TongQuan = {
  ...TONG_QUAN_RONG,
  du_an: [
    hangDuAn({ ma: 'SAI', suc_song: 'vang', so_dang_lam: 1, so_tong: 1 }),
    hangDuAn({ ma: 'COS', suc_song: 'xanh', so_dang_lam: 1, so_tong: 1 }),
  ],
  can_chu_y: [
    nhomCanChuY(
      [
        dongCanChuY({
          loai: 'phien_dung_hoac_loi',
          nhan_loai: 'Phiên đứng hoặc lỗi',
          luc: GIO - 30 * PHUT,
          ticket: TICKET_DUNG,
          phien: { id: 'ph-dung', agent_id: 'ag-w', trang_thai: 'stalled', nhan_trang_thai: 'Đứng' },
        }),
      ],
      TICKET_DUNG,
    ),
  ],
};

describe('Bước 3 — worker im 30 phút: Tổng quan hiện phiên đứng, dự án thành 🟡', () => {
  it('dự án SAI hiện chấm 🟡 (`data-suc-song="vang"`, nhãn "Phiên đứng hoặc lỗi"); dự án COS 🟢 KHÔNG vàng', async () => {
    new MayChuGia().dat('GET /v1/tong-quan', { than: TONG_QUAN_BUOC_3 }).gan();
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });

    const cham = (ma: string): Element | null =>
      khoi.querySelector(`[data-du-an="${ma}"] [data-suc-song]`);
    expect(cham('SAI')?.getAttribute('data-suc-song')).toBe('vang');
    expect(cham('SAI')?.getAttribute('aria-label')).toBe('Phiên đứng hoặc lỗi');
    expect((cham('SAI')?.getAttribute('class') ?? '').split(/\s+/)).toContain('bg-canh');
    // Đối chứng: dự án còn chạy không bị tô vàng theo.
    expect(cham('COS')?.getAttribute('data-suc-song')).toBe('xanh');
    expect((cham('COS')?.getAttribute('class') ?? '').split(/\s+/)).not.toContain('bg-canh');
    expect(khoi.querySelectorAll('[data-suc-song="vang"]')).toHaveLength(1);
  });

  it('"Cần chú ý" có dòng phiên đứng trỏ ĐÚNG ticket (`/t/SAI-1`) và ĐÚNG phiên (`/phien/ph-dung`)', async () => {
    new MayChuGia().dat('GET /v1/tong-quan', { than: TONG_QUAN_BUOC_3 }).gan();
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.can_chu_y });

    const dong = [...khoi.querySelectorAll('[data-can-chu-y]')];
    expect(dong).toHaveLength(1);
    const d = dong[0] as HTMLElement;
    expect(d.querySelector('[data-ly-do="phien_dung_hoac_loi"]')?.textContent).toBe('Phiên đứng hoặc lỗi');
    expect(within(d).getByRole('link', { name: 'SAI-1' }).getAttribute('href')).toBe('/t/SAI-1');
    expect(within(d).getByRole('link', { name: 'Đứng' }).getAttribute('href')).toBe('/phien/ph-dung');
  });

  it('đối chứng: trước mốc 30 phút (dự án 🟢, Cần chú ý rỗng) ⇒ không chấm vàng, không dòng phiên đứng', async () => {
    new MayChuGia()
      .dat('GET /v1/tong-quan', {
        than: {
          ...TONG_QUAN_RONG,
          du_an: [hangDuAn({ ma: 'SAI', suc_song: 'xanh', so_dang_lam: 1, so_tong: 1 })],
        } satisfies TongQuan,
      })
      .gan();
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    expect(khoi.querySelector('[data-du-an="SAI"] [data-suc-song]')?.getAttribute('data-suc-song')).toBe('xanh');
    expect(document.querySelectorAll('[data-suc-song="vang"]')).toHaveLength(0);
    const cy = screen.getByRole('region', { name: TEN_KHOI.can_chu_y });
    expect(cy.querySelectorAll('[data-can-chu-y]')).toHaveLength(0);
    expect(cy.querySelector('[data-ly-do="phien_dung_hoac_loi"]')).toBeNull();
    expect(cy.querySelector('a[href^="/phien/"]')).toBeNull();
  });
});

/* ================================================================== *
 * Bước 4 — Quyết định 🔴 3 phương án: chủ chạm B rồi chạm "Gửi duyệt"
 *
 * Nửa máy chủ (Telegram ≤ 60 s, `result --wait` ≤ 3 s, Nhật ký, bình luận) ở
 * `packages/api/test/nghiem-thu-17.test.ts` › Bước 4, gửi đúng thân
 * `{ phuong_an: 'B' }` mà ca dưới đây ghim rằng trang web gửi.
 * ================================================================== */

const QUYET_DINH_DO = manHinh({
  urgent: [
    the({
      ma: 'T-30',
      loai: 'decision',
      tieu_de: 'Chọn ngưỡng cảnh báo',
      phuong_an: [phuongAn('A', '300'), phuongAn('B', '500', true), phuongAn('C', '1000')],
    }),
  ],
});

describe('Bước 4 — Quyết định 🔴 3 phương án: chủ chạm B rồi chạm "Gửi duyệt" ⇒ đúng một POST phuong_an B', () => {
  it('chữ nút cắt từ SPEC 17 bước 4 là "Gửi duyệt" — và thẻ 🔴 Quyết định có đúng nút chữ ấy, ba nút phương án A/B/C', async () => {
    const GUI_DUYET = chuDamBuoc(4);
    expect(GUI_DUYET).toBe('Gửi duyệt');
    mayCanChu(QUYET_DINH_DO);
    await moCanChu();
    const gap = screen.getByRole('region', { name: '🔴 Gấp' });
    const t = within(gap).getByText('Chọn ngưỡng cảnh báo').closest('[data-the]') as HTMLElement;
    expect(t.getAttribute('data-the')).toBe('T-30');
    expect([...t.querySelectorAll('[data-phuong-an]')].map((e) => e.getAttribute('data-phuong-an'))).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(within(t).getByRole('button', { name: GUI_DUYET })).toBeTruthy();
  });

  it('chạm B ⇒ 0 request ghi; chạm "Gửi duyệt" ⇒ ĐÚNG MỘT `POST /v1/can-chu/ct-T-30/xu-ly` thân `{ phuong_an: "B" }`, thẻ rời khối 🔴', async () => {
    const GUI_DUYET = chuDamBuoc(4);
    const m = mayCanChu(QUYET_DINH_DO);
    const u = await moCanChu();
    const t = (): HTMLElement => document.querySelector('[data-the="T-30"]') as HTMLElement;

    // Đối chứng: trước khi chạm, nút Gửi duyệt mờ (chưa chọn phương án).
    expect(within(t()).getByRole<HTMLButtonElement>('button', { name: GUI_DUYET }).disabled).toBe(true);

    await u.click(within(t()).getByRole('button', { name: /^B\s/ }));
    expect(t().querySelector('[data-phuong-an="B"]')?.getAttribute('aria-pressed')).toBe('true');
    // Đối chứng: chọn phương án KHÔNG ghi gì — chỉ "Gửi duyệt" mới ghi.
    // "Ghi" = mọi request không phải GET (POST/PATCH/PUT/DELETE đều tính).
    expect(m.da_goi.filter((l) => l.method !== 'GET')).toEqual([]);

    await u.click(within(t()).getByRole('button', { name: GUI_DUYET }));
    await waitFor(() => {
      expect(m.da_goi.filter((l) => l.method !== 'GET').length).toBe(1);
    });
    const ghi = m.da_goi.filter((l) => l.method !== 'GET').map((l) => [l.method, l.duong, l.than]);
    expect(ghi).toEqual([['POST', '/v1/can-chu/ct-T-30/xu-ly', { phuong_an: 'B' }]]);
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-30"]')).toBeNull();
    });
  });
});

/* ================================================================== *
 * Bước 5 — ô trả lời hàng loạt
 * ================================================================== */

describe('Bước 5 — dán 3 dòng `T-x: ...` ⇒ cả 3 mục được xử lý đúng; dòng sai mã báo đỏ', () => {
  it('3 dòng đúng + 1 dòng sai mã ⇒ dòng sai ĐỎ, nút áp bị khoá, KHÔNG một request ghi nào', async () => {
    const m = mayCanChu(BA_MUC);
    const u = await moCanChu();
    await u.type(oHangLoat(), 'T-21: đã xem{enter}T-22: B, ngưỡng 500{enter}T-23: đã chạy{enter}T-99: đã xem');
    await u.click(screen.getByRole('button', { name: 'Xem trước' }));

    const dong = [...document.querySelectorAll('[data-dong-hang-loat]')];
    expect(dong.map((e) => e.getAttribute('data-dong-hang-loat'))).toEqual([
      'hieu',
      'hieu',
      'hieu',
      'khong-hieu',
    ]);
    expect(dong[3]?.textContent).toContain('T-99');
    // "báo đỏ" bằng lớp màu lỗi thật của giao diện (`text-loi`), chỉ ở dòng sai mã.
    expect((dong[3]?.getAttribute('class') ?? '').split(/\s+/)).toContain('text-loi');
    for (const d of dong.slice(0, 3)) {
      expect((d.getAttribute('class') ?? '').split(/\s+/)).not.toContain('text-loi');
    }

    const nut = screen.getByRole<HTMLButtonElement>('button', { name: 'Áp một lần' });
    expect(nut.disabled).toBe(true);
    await u.click(nut);
    expect(m.da_goi.filter((l) => l.method === 'POST')).toEqual([]);
  });

  it('bỏ dòng sai ⇒ áp MỘT LẦN: đúng 3 request, mỗi mục đúng thân của dòng mình, 3 thẻ rời khối Chờ', async () => {
    const m = mayCanChu(BA_MUC);
    const u = await moCanChu();
    await u.type(oHangLoat(), 'T-21: đã xem{enter}T-22: B, ngưỡng 500{enter}T-23: đã chạy');
    await u.click(screen.getByRole('button', { name: 'Xem trước' }));
    await u.click(screen.getByRole('button', { name: 'Áp một lần' }));

    await waitFor(() => {
      expect(m.da_goi.filter((l) => l.method === 'POST').length).toBe(3);
    });
    const ghi = m.da_goi.filter((l) => l.method === 'POST').map((l) => [l.duong, l.than]);
    expect(ghi).toEqual([
      ['/v1/can-chu/ct-T-21/xu-ly', { ghi_them: 'đã xem' }],
      ['/v1/can-chu/ct-T-22/xu-ly', { phuong_an: 'B', ghi_them: 'ngưỡng 500' }],
      ['/v1/can-chu/ct-T-23/xu-ly', { ghi_them: 'đã chạy' }],
    ]);
    await waitFor(() => {
      expect(document.querySelectorAll('[data-the]').length).toBe(0);
    });
  });
});

/* ================================================================== *
 * Bước 6 — "Dự án không chạy"
 * ================================================================== */

describe('Bước 6 — dự án không có ticket Đang làm hiện "Dự án không chạy"', () => {
  it('Tổng quan: dự án ⚪ hiện đúng chữ SPEC (cắt từ SPEC.md), dự án 🟢/🟡 thì không', async () => {
    const cau = cauDuAnKhongChayTuSpec();
    expect(cau).toBe('Dự án không chạy');
    expect(CAU_DU_AN_KHONG_CHAY).toBe(cau);

    new MayChuGia()
      .dat('GET /v1/tong-quan', {
        than: {
          ...TONG_QUAN_RONG,
          du_an: [
            hangDuAn({ ma: 'SAI', suc_song: 'xanh', so_dang_lam: 1 }),
            hangDuAn({ ma: 'COS', suc_song: 'vang', so_dang_lam: 1 }),
            hangDuAn({ ma: 'INC', suc_song: 'trang', so_can_lam: 1, so_xong: 1, so_tong: 2 }),
          ],
        } satisfies TongQuan,
      })
      .gan();
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    expect(within(khoi.querySelector('[data-du-an="INC"]') as HTMLElement).getByText(cau)).toBeTruthy();
    expect(within(khoi).getAllByText(cau)).toHaveLength(1);
  });
});

/* ================================================================== *
 * Bước 8 — chủ bấm Dừng
 *
 * Web đặt nút Dừng ở chi tiết phiên (`/phien/:id`, SPEC 14 d.402), không có bước
 * xác nhận. Nửa máy chủ (`heartbeat` kế tiếp thoát mã 3 sau đúng request này) ở
 * `packages/api/test/nghiem-thu-17.test.ts` › Bước 8.
 * ================================================================== */

/** Chữ nút của bước 8 — "Chủ bấm <nút>:" cắt từ SPEC 17. */
function nutBuoc8(): string {
  const k = /Chủ bấm ([^:]+):/.exec(buocMuc17(8));
  if (k?.[1] === undefined) throw new Error('SPEC 17 bước 8 không có "Chủ bấm …:"');
  return k[1].replace(/\*\*/g, '').trim();
}

describe('Bước 8 — chủ bấm Dừng ở chi tiết phiên ⇒ đúng một `POST /v1/phien/:id/dung`', () => {
  it('trước khi bấm 0 request ghi; bấm nút chữ SPEC "Dừng" ⇒ ĐÚNG MỘT `POST /v1/phien/ph-1/dung`, không đường ghi nào khác', async () => {
    const DUNG = nutBuoc8();
    expect(DUNG).toBe('Dừng');
    const man = manHinhPhien();
    const m = new MayChuGia()
      .dat(`GET /v1/man-hinh-phien/${man.phien.id}`, { than: man })
      .dat('POST /v1/phien/ph-1/dung', { than: { ok: true } })
      .gan();
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');

    const nut = await screen.findByRole<HTMLButtonElement>('button', { name: DUNG });
    expect(nut.disabled).toBe(false);
    // Đối chứng: mở trang phiên KHÔNG tự dừng.
    // "Ghi" = mọi request không phải GET (POST/PATCH/PUT/DELETE đều tính).
    expect(m.da_goi.filter((l) => l.method !== 'GET')).toEqual([]);

    await userEvent.click(nut);
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/phien/ph-1/dung')).toBe(1);
    });
    expect(m.da_goi.filter((l) => l.method !== 'GET').map((l) => `${l.method} ${l.duong}`)).toEqual([
      'POST /v1/phien/ph-1/dung',
    ]);
  });
});

/* ================================================================== *
 * Bước 11 — 375px
 * ================================================================== */

const PX = specDoiDienThoai().px;

/** Lớp Tailwind chốt chiều rộng cứng theo px (`w-[420px]`, `min-w-[400px]`) vượt `PX`. */
function rongCungQua(goc: Element): string[] {
  const ra: string[] = [];
  for (const e of [goc, ...goc.querySelectorAll('*')]) {
    const cls = typeof e.className === 'string' ? e.className : (e.getAttribute('class') ?? '');
    for (const lop of cls.split(/\s+/)) {
      const k = /^(?:min-)?w-\[(\d+(?:\.\d+)?)px\]$/.exec(lop);
      if (k?.[1] !== undefined && Number(k[1]) > PX) ra.push(lop);
    }
  }
  return ra;
}

/** Bảng (`<table>`) nào KHÔNG nằm trong một khung `overflow-x-auto` — thứ làm cả trang tràn ngang. */
function bangTran(goc: Element): string[] {
  const ra: string[] = [];
  for (const t of goc.querySelectorAll('table')) {
    let e: Element | null = t.parentElement;
    let co = false;
    while (e !== null && e !== goc.parentElement) {
      if ((e.getAttribute('class') ?? '').split(/\s+/).includes('overflow-x-auto')) co = true;
      e = e.parentElement;
    }
    if (!co) ra.push(t.outerHTML.slice(0, 80));
  }
  return ra;
}

/** Hàng nút (`data-hang="nut"`) không biết xuống dòng. */
function hangNutKhongWrap(goc: Element): string[] {
  return [...goc.querySelectorAll('[data-hang="nut"]')]
    .filter((e) => !(e.getAttribute('class') ?? '').includes('flex-wrap'))
    .map((e) => e.outerHTML.slice(0, 80));
}

describe('Bước 11 — Tổng quan, Cần Chủ, chi tiết ticket ở 375px (phần đọc được từ DOM)', () => {
  it('index.html khai `meta viewport` width=device-width — điều kiện để điện thoại không thu nhỏ trang bản máy tính', () => {
    expect(PX).toBe(375);
    const meta = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(HTML_GOC)?.[1] ?? '';
    expect(meta).toContain('width=device-width');
    expect(meta).toContain('initial-scale=1');
  });

  it('Tổng quan đủ năm khối có dữ liệu: không chiều rộng cứng > 375px, không bảng tràn, ô Cần Chủ đứng trước năm khối', async () => {
    new MayChuGia()
      .dat('GET /v1/tong-quan', {
        than: {
          ...TONG_QUAN_RONG,
          du_an: [
            hangDuAn({ ma: 'SAI', suc_song: 'vang', so_dang_lam: 1, so_xong: 3, so_tong: 9 }),
            hangDuAn({ ma: 'INC', suc_song: 'trang' }),
          ],
          viec_dang_chay: [theViecDangChay({ the: ticketDong({ ma: 'SAI-1', tieu_de: 'Một tiêu đề khá dài để thử xuống dòng trên điện thoại' }) })],
          can_chu_y: [
            nhomCanChuY([dongCanChuY({ loai: 'phien_dung_hoac_loi', nhan_loai: 'Phiên đứng hoặc lỗi' })], ticketTroTa('SAI-1')),
          ],
        } satisfies TongQuan,
      })
      .gan();
    const { container } = dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });

    // Đủ năm khối, đúng tên thật trong src (`TEN_KHOI`) và đúng thứ tự DOM của d.316.
    const khoi = [...container.querySelectorAll('section[data-khoi]')];
    expect(khoi.map((k) => k.getAttribute('aria-label'))).toEqual([
      TEN_KHOI.du_an,
      TEN_KHOI.viec_dang_chay,
      TEN_KHOI.agent,
      TEN_KHOI.vua_xong,
      TEN_KHOI.can_chu_y,
    ]);
    for (const ten of Object.values(TEN_KHOI)) {
      expect(screen.getByRole('region', { name: ten })).toBeTruthy();
    }
    /*
     * SPEC 20.2 (04/11): ô Cần Chủ gọn nằm trong **thanh đầu** của khối Dự án,
     * TRƯỚC bản đồ trong DOM (ở 375px là một cột: đọc thấy trước bản đồ và thẻ).
     */
    const o = screen.getByRole('complementary', { name: TEN_O_CAN_CHU });
    const dau = khoi[0];
    expect(dau).toBeDefined();
    expect((dau as Element).contains(o)).toBe(true);
    const ban_do = (dau as Element).querySelector('[data-o="ban-do-va-the"]');
    expect(ban_do).not.toBeNull();
    expect(o.compareDocumentPosition(ban_do as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(rongCungQua(container)).toEqual([]);
    expect(bangTran(container)).toEqual([]);
    expect(hangNutKhongWrap(container)).toEqual([]);
  });

  it('Cần Chủ (ba khối + bảng Đã xử lý + ô hàng loạt + phiên duyệt): không chiều rộng cứng > 375px, bảng trong khung cuộn ngang, hàng nút xuống dòng', async () => {
    mayCanChu(BA_MUC, [dongDaXuLy({ ma: 'T-20' })]);
    const u = await moCanChu();
    const goc = document.body;
    // Ghim rằng các lưới dưới có dữ liệu để soi (không xanh vì DOM rỗng).
    expect(goc.querySelectorAll('table').length).toBeGreaterThan(0);
    expect(goc.querySelectorAll('[data-hang="nut"]').length).toBeGreaterThan(2);
    expect(rongCungQua(goc)).toEqual([]);
    expect(bangTran(goc)).toEqual([]);
    expect(hangNutKhongWrap(goc)).toEqual([]);
    expect(oHangLoat().getAttribute('class')).toContain('w-full');

    await u.click(screen.getByRole('button', { name: 'Bắt đầu phiên duyệt' }));
    expect(rongCungQua(goc)).toEqual([]);
    expect(hangNutKhongWrap(goc)).toEqual([]);
  });

  it('chi tiết ticket đủ khối (liên kết điều phối, lượt giao, ticket con, Cần Chủ): một cột mặc định, hai cột chỉ từ `lg` (lưới 3 phần, cột trái chiếm 2), không rộng cứng > 375px', async () => {
    const MA = 'SAI-1';
    new MayChuGia()
      .dat(`GET /v1/man-hinh-ticket/ma/${MA}`, {
        than: manHinhTicket(ticketDayDu({ ma: MA, lien_ket: [lienKet('dieu_phoi', 'COS-1', true)] }), {
          luot_giao: [luotGiao({ so_luot: 1 }), luotGiao({ so_luot: 2, loai: 'review', nhan_loai: 'Review' })],
          ticket_con: [ticketCon('SAI-2')],
          can_chu: [the({ ma: 'T-7' })],
        }),
      })
      .gan();
    const { container } = dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')).not.toBeNull();
    });
    const lop = document.querySelector('[data-o="chi-tiet-ticket"]')?.getAttribute('class') ?? '';
    expect(lop).toContain('grid-cols-1');
    expect(lop).toContain('lg:grid-cols-3');
    expect(/(^|\s)grid-cols-(2|3)(\s|$)/.test(lop)).toBe(false);
    // "Hai cột" từ `lg`: lưới 3 phần chỉ có HAI con — cột trái `lg:col-span-2`, cột phải 1 phần.
    const con = [...(document.querySelector('[data-o="chi-tiet-ticket"]')?.children ?? [])];
    expect(con).toHaveLength(2);
    expect((con[0]?.getAttribute('class') ?? '').split(/\s+/)).toContain('lg:col-span-2');
    expect(con[1]?.getAttribute('class') ?? '').not.toContain('col-span');
    expect(rongCungQua(container)).toEqual([]);
    expect(bangTran(container)).toEqual([]);
    expect(hangNutKhongWrap(container)).toEqual([]);
  });
});
