/**
 * **Thẻ việc, năm nhóm cột, panel bên phải, bộ lọc nhanh** — BAT-6 đợt 2.
 *
 * Phần SPEC chạm tới: mục 14 d.396 (hai kiểu xem, bộ lọc **ghi trên URL**),
 * d.398–401 (nội dung chi tiết — panel dùng **cùng** thân với trang `/t/<MÃ>`),
 * d.405–406 (`J`/`K` trên ticket đang chọn), d.411 (375px), d.412 (thời gian
 * tương đối + rê chuột thấy giờ VN). Phần **ngoài** SPEC là yêu cầu của chủ qua
 * brief, ghi ở `cau-hoi-spec.md` #131–#136 — ca ở đây ghim **đề xuất tạm đang
 * dùng**.
 *
 * Luật thuần (năm nhóm, lọc nhanh, mốc "Xong cũ", băm màu nhãn, viết tắt) có ca
 * riêng ở `loc-ticket.test.ts`. Ở đây **chỉ** những gì phải đo trên cây React.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAU_LOC_TRONG_TRANG,
  NHAN_DONG_PANEL,
  NHAN_MO_TOAN_TRANG,
  NHAN_NUT_LOC,
  NHAN_PANEL,
  TrangDanhSachTicket,
} from '../src/trang/danh-sach-ticket';
import {
  COT_BANG,
  KHOA_LOC_TICKET,
  KHOA_NHANH,
  KHOA_THE,
  NHAN_AN_XONG_CU,
  NHAN_TRANG_THAI,
  NHOM_COT_CHU,
} from '../src/loc-ticket';
import { LOP_NHAN, mauNhan } from '../src/vo/mau-the';
import { TRUY_VAN_HEP, manHinhHep } from '../src/vo/kho-man-hinh';
import { CHIEU_CAO_DONG, CHIEU_CAO_NHOM, tuyChonDanhSachAo } from '../src/khung-cuon';
import { MayChuGia, datKhoGia, dung } from './giup';
import {
  GIO,
  GIO_MS,
  THAN_AGENT,
  THAN_DU_AN,
  dong,
  manHinhDanhSach,
  manHinhTicket,
  ticketDayDu,
} from './than-ticket';

const NGAY_MS = 24 * GIO_MS;

/**
 * Máy chủ giả: đường **danh sách** nhận mọi chuỗi truy vấn (nên không dùng được
 * bảng tra khớp-đúng-chuỗi của `MayChuGia`), còn đường **chi tiết** của panel là
 * `…/ma/<MÃ>` — phải thử nó **trước**, vì nó cũng bắt đầu bằng
 * `/v1/man-hinh-ticket`.
 */
function may(trang = manHinhDanhSach([dong({ ma: 'SAI-1' })])): {
  may: MayChuGia;
  kho: { trang: ReturnType<typeof manHinhDanhSach> };
} {
  const kho = { trang };
  const m = new MayChuGia();
  m.dat('GET /v1/du-an?limit=200', { than: THAN_DU_AN });
  m.dat('GET /v1/agent', { than: THAN_AGENT });
  m.gan();

  const goc = globalThis.fetch;
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    const ma_chi_tiet = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
    if (ma_chi_tiet !== undefined) {
      m.da_goi.push({ duong, method: init?.method ?? 'GET', than: undefined });
      return Promise.resolve(
        new Response(
          JSON.stringify(
            manHinhTicket(ticketDayDu({ ma: decodeURIComponent(ma_chi_tiet), tieu_de: 'Thân panel' })),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    }
    if (duong.startsWith('/v1/man-hinh-ticket')) {
      m.da_goi.push({ duong, method: init?.method ?? 'GET', than: undefined });
      return Promise.resolve(
        new Response(JSON.stringify(kho.trang), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return goc(duong, init);
  }) as typeof globalThis.fetch;

  return { may: m, kho };
}

async function choTai(ma: string): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector(`[data-ticket="${ma}"], [data-the-ticket="${ma}"]`)).not.toBeNull();
  });
}

/**
 * **Đường của kiểu DANH SÁCH, tường minh** — từ BAT-6 đợt 3, kiểu mặc định của
 * trang việc là **Bảng** (d.403). Ca nào đọc `[data-ticket=…]` (dòng của kiểu
 * danh sách) vì vậy phải xin kiểu ấy trên URL.
 */
const DUONG_DANH_SACH = '/ticket?xem=danh-sach';

/** Mở menu "Lọc" — d.407: thanh lọc **không mở sẵn**. */
async function moMenuLoc(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${NHAN_NUT_LOC}`) }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ================================================================== *
 * A. Thẻ việc — tám thứ brief đòi
 * ================================================================== */

describe('thẻ việc hiện ĐỦ TÁM thứ', () => {
  const THE = dong({
    ma: 'SAI-7',
    tieu_de: 'Dựng cổng Xong',
    trang_thai: 'in_progress',
    nhom_trang_thai: 'active',
    uu_tien: 'high',
    nguoi_dang_cam: { loai: 'agent', agentId: 'W-builder' },
    nhan: ['hạ-tầng', 'bug'],
    con_tong: 3,
    con_chua_ket: 1,
    can_chu_so: 2,
    cap_nhat_luc: GIO - 2 * GIO_MS,
  });

  /**
   * **Một ca đọc đủ tám thứ.** Tám `expect` rời nhau sẽ cho tám ca cùng dựng
   * lại một trang; ở đây dựng một lần rồi đọc một bảng — và vì nó là **một**
   * `toEqual`, thiếu bất kỳ thứ nào cũng in ra đúng thứ nào thiếu.
   */
  it('mã · tiêu đề · người cầm · nhãn · ưu tiên · việc con · Cần Chủ · thời gian', async () => {
    may(manHinhDanhSach([THE]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-7');

    const the = document.querySelector<HTMLElement>('[data-ticket="SAI-7"]')!;
    const lay = (sel: string): string | null =>
      the.querySelector(sel)?.textContent?.trim() ?? null;

    expect({
      ma: lay('[data-o="ma"]'),
      tieu_de: lay('[data-o="tieu-de"]'),
      // Viết tắt của agent đang cầm, và tên đầy đủ khi rê chuột.
      nguoi_cam: lay('[data-o="nguoi-cam"]'),
      nguoi_cam_title: the.querySelector('[data-o="nguoi-cam"]')?.getAttribute('title') ?? null,
      nhan: [...the.querySelectorAll('[data-nhan]')].map((e) => e.getAttribute('data-nhan')),
      // Ưu tiên là **icon** (một `<svg>`), nhãn tiếng Việt của máy chủ ở `aria-label`.
      uu_tien_icon: the.querySelector('[data-o="uu-tien"] svg') !== null,
      uu_tien_nhan: the.querySelector('[data-o="uu-tien"]')?.getAttribute('aria-label') ?? null,
      viec_con: lay('[data-o="viec-con"]'),
      can_chu: lay('[data-o="can-chu"]'),
      thoi_gian: lay('[data-o="thoi-gian"]'),
    }).toEqual({
      ma: 'SAI-7',
      tieu_de: 'Dựng cổng Xong',
      nguoi_cam: 'WB',
      nguoi_cam_title: 'W-builder',
      nhan: ['hạ-tầng', 'bug'],
      uu_tien_icon: true,
      uu_tien_nhan: 'Cao',
      // "xong/tổng" = đã kết / tổng = (3 − 1)/3 — `cau-hoi-spec.md` #134.
      viec_con: '2/3',
      can_chu: 'Cần Chủ 2',
      thoi_gian: '2 giờ trước',
    });
  });

  it('ưu tiên là ICON, KHÔNG phải chữ "Cao" trên thẻ', async () => {
    may(manHinhDanhSach([THE]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-7');

    const o = document.querySelector('[data-ticket="SAI-7"] [data-o="uu-tien"]')!;
    // Nhãn vẫn đọc được bằng trình đọc màn hình / rê chuột, nhưng không in ra chữ.
    expect(o.textContent).toBe('');
    expect(o.getAttribute('title')).toBe('Cao');
    expect(o.getAttribute('data-uu-tien')).toBe('high');
  });

  /**
   * **Bốn mức in ra, mức "Không" KHÔNG in gì** — d.404: 'Ưu tiên "Không"
   * **không** in chữ trên thẻ.' Đổi ở BAT-6 đợt 3 phần B theo bản soát UI của
   * chủ; cách đã chọn là **không vẽ gì** (không một icon mờ), lý do ghi ở
   * `NoiDungThe`.
   *
   * Ca giữ cả hai vế: bốn mức còn lại vẫn ra **bốn hình khác nhau** (màu không
   * phải thông tin duy nhất), và `none` không có ô ưu tiên nào.
   */
  it('bốn mức ra BỐN hình khác nhau; mức "Không" không in gì (d.404)', async () => {
    may(
      manHinhDanhSach([
        dong({ ma: 'SAI-1', uu_tien: 'urgent' }),
        dong({ ma: 'SAI-2', uu_tien: 'high' }),
        dong({ ma: 'SAI-3', uu_tien: 'medium' }),
        dong({ ma: 'SAI-4', uu_tien: 'low' }),
        dong({ ma: 'SAI-5', uu_tien: 'none' }),
      ]),
    );
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    const hinh = ['SAI-1', 'SAI-2', 'SAI-3', 'SAI-4'].map(
      (ma) =>
        document.querySelector(`[data-ticket="${ma}"] [data-o="uu-tien"] svg`)?.innerHTML ?? '',
    );
    expect(new Set(hinh).size).toBe(4);
    expect(hinh.every((h) => h !== '')).toBe(true);

    // `none`: không ô ưu tiên, và không chữ "Không" nào trên thẻ.
    const the_none = document.querySelector<HTMLElement>('[data-ticket="SAI-5"]')!;
    expect(the_none.querySelector('[data-o="uu-tien"]')).toBeNull();
    expect(the_none.textContent).not.toContain('Không');
  });

  it('nhãn mang MỘT trong sáu cặp màu đã khai, và cùng chữ ⇒ cùng cặp', async () => {
    may(manHinhDanhSach([THE]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-7');

    const o = document.querySelector('[data-ticket="SAI-7"] [data-nhan="hạ-tầng"]')!;
    const lop = o.getAttribute('class') ?? '';
    expect(LOP_NHAN.some((l) => l.split(' ').every((c) => lop.includes(c)))).toBe(true);
    expect(mauNhan('hạ-tầng').split(' ').every((c) => lop.includes(c))).toBe(true);
  });

  it('tiêu đề gọn ĐÚNG HAI DÒNG (cắt bằng CSS, không cắt theo số ký tự)', async () => {
    const dai = 'Một tiêu đề rất dài '.repeat(12);
    may(manHinhDanhSach([dong({ ma: 'SAI-8', tieu_de: dai })]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-8');

    const o = document.querySelector('[data-ticket="SAI-8"] [data-o="tieu-de"]')!;
    expect(o.getAttribute('class')).toContain('line-clamp-2');
    // Chữ **không** bị cắt trong DOM: cắt ở JS là cắt sai ở một trong hai kiểu xem.
    expect(o.textContent).toBe(dai);
  });

  /* --------------- d.404 — tên agent, không bao giờ id --------------- */

  /**
   * **Nợ của đợt 2 đã trả**: thẻ đọc `nguoi_cam_ten` mà đường đọc danh sách nay
   * trả (`TheDanhSachRa`, `packages/api/src/doc-man-hinh-ticket.ts`), nên bảng
   * việc không còn vẽ `agentId`.
   *
   * Fixture dựng đúng trạng thái thật: `nguoi_dang_cam` mang **id** (`ag-wb`) và
   * `nguoi_cam_ten` mang **tên** (`W-builder`). Một bản chỉ đọc `agentId` sẽ hiện
   * "ag-wb" và viết tắt "AG" — ca này đỏ ngay.
   */
  it('người cầm hiện TÊN và viết tắt theo tên; id KHÔNG lọt lên thẻ (d.404)', async () => {
    may(
      manHinhDanhSach([
        dong({
          ma: 'SAI-4',
          nguoi_dang_cam: { loai: 'agent', agentId: 'ag-wb' },
          nguoi_cam_ten: 'W-builder',
        }),
      ]),
    );
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-4');

    const the = document.querySelector<HTMLElement>('[data-ticket="SAI-4"]')!;
    const o = the.querySelector('[data-o="nguoi-cam"]')!;
    expect(o.getAttribute('title')).toBe('W-builder');
    expect(o.getAttribute('aria-label')).toBe('Người đang cầm: W-builder');
    // Viết tắt lấy từ **tên** (`vietTat`), không từ id ("AG" của `ag-wb`).
    expect(o.textContent).toBe('WB');
    expect(the.textContent).not.toContain('ag-wb');
  });

  it('chủ cầm / không ai cầm ⇒ vẫn nói đúng, không một cái tên bịa', async () => {
    may(
      manHinhDanhSach([
        dong({ ma: 'SAI-5', nguoi_dang_cam: { loai: 'owner' }, nguoi_cam_ten: null }),
        dong({ ma: 'SAI-6', nguoi_dang_cam: null, nguoi_cam_ten: null }),
      ]),
    );
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-5');

    expect(
      document.querySelector('[data-ticket="SAI-5"] [data-o="nguoi-cam"]')?.getAttribute('title'),
    ).toBe('Chủ (chủ)');
    expect(
      document.querySelector('[data-ticket="SAI-6"] [data-o="nguoi-cam"]')?.getAttribute('title'),
    ).toBe('—');
  });

  it('không có việc con / không có Cần Chủ ⇒ KHÔNG hiện "0/0" hay "Cần Chủ 0"', async () => {
    may(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    expect(document.querySelector('[data-ticket="SAI-1"] [data-o="viec-con"]')).toBeNull();
    expect(document.querySelector('[data-ticket="SAI-1"] [data-o="can-chu"]')).toBeNull();
  });

  it('cùng một thẻ trên BẢNG cũng đủ tám thứ (một component, không hai)', async () => {
    may(manHinhDanhSach([THE]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-7');

    const the = document.querySelector<HTMLElement>('[data-the-ticket="SAI-7"]')!;
    const thieu = [
      '[data-o="ma"]',
      '[data-o="tieu-de"]',
      '[data-o="nguoi-cam"]',
      '[data-nhan="bug"]',
      '[data-o="uu-tien"] svg',
      '[data-o="viec-con"]',
      '[data-o="can-chu"]',
      '[data-o="thoi-gian"]',
    ].filter((s) => the.querySelector(s) === null);
    expect(thieu).toEqual([]);
  });
});

/* ================================================================== *
 * B. Nhóm cột (sáu từ BAT-64, T-111 A), số đếm, ẩn/hiện Xong cũ
 * ================================================================== */

/*
 * T-111 A (29/10, BAT-64): 6 cột, Backlog đầu. Khối này trước đây ghim "năm cột,
 * Backlog không có cột"; kỳ vọng đổi theo, không bỏ ca nào.
 */
describe('sáu nhóm cột của bảng, và số đếm ở đầu cột', () => {
  const DS = [
    dong({ ma: 'SAI-1', trang_thai: 'todo', nhom_trang_thai: 'planned' }),
    dong({ ma: 'SAI-2', trang_thai: 'in_progress', nhom_trang_thai: 'active' }),
    dong({ ma: 'SAI-3', trang_thai: 'in_progress', nhom_trang_thai: 'active' }),
    dong({ ma: 'SAI-4', trang_thai: 'verifying', nhom_trang_thai: 'active' }),
    dong({ ma: 'SAI-5', trang_thai: 'done', nhom_trang_thai: 'closed' }),
    dong({ ma: 'SAI-6', trang_thai: 'canceled', nhom_trang_thai: 'closed' }),
  ];

  /**
   * **Assert tuyệt đối trên MỌI cột**, không chỉ trên các cột mang
   * `data-nhom-chu="co"`: bản trước query theo thuộc tính ấy nên nó xanh cả khi
   * bảng có bảy cột — đúng chỗ reviewer bắt được. Thêm một cột thứ bảy bây giờ
   * là **đỏ** (T-111 A: sáu cột, Backlog đầu — trước BAT-64 là năm).
   */
  it('bảng ra ĐÚNG SÁU cột Backlog đầu (không năm, không bảy), đúng nhãn, và số đếm đúng', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');

    const chu = [...document.querySelectorAll('[data-cot]')];
    expect(chu.map((e) => e.getAttribute('data-cot'))).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'verifying',
      'done',
      'canceled',
    ]);
    expect(chu.map((e) => e.getAttribute('data-cot'))).toEqual([...NHOM_COT_CHU]);
    expect(chu.map((e) => e.querySelector('h2')?.textContent)).toEqual([
      `${NHAN_TRANG_THAI.backlog} 0`,
      `${NHAN_TRANG_THAI.todo} 1`,
      `${NHAN_TRANG_THAI.in_progress} 2`,
      `${NHAN_TRANG_THAI.verifying} 1`,
      `${NHAN_TRANG_THAI.done} 1`,
      `${NHAN_TRANG_THAI.canceled} 1`,
    ]);
  });

  it('danh sách gom giữ đủ BẢY nhóm (kể cả Backlog, Trùng) và đánh dấu các nhóm có cột trên Bảng', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    /*
     * Kiểu xem **danh sách** không gộp gì: nó là chỗ `backlog` và `duplicate` vẫn
     * có nhóm riêng, nên không trạng thái nào biến mất khỏi giao diện. Từ đợt 3,
     * nhóm **rỗng** thì ẩn (d.405) — `DS` có việc ở **năm** trạng thái, nên năm
     * tiêu đề; `backlog` và `duplicate` (không có việc trong fixture này) là hai
     * nhóm bị ẩn. Ca "backlog vẫn có nhóm riêng khi **có** việc" nằm ngay dưới.
     */
    const nhom = [...document.querySelectorAll('[data-nhom]')].map((e) =>
      e.getAttribute('data-nhom'),
    );
    expect(nhom).toEqual(['todo', 'in_progress', 'verifying', 'done', 'canceled']);
    /*
     * T-111 A (BAT-64): `NHOM_COT_CHU` nay có `backlog` đứng đầu, mà fixture này
     * không có việc Backlog (nhóm ẩn) — nên nhóm được đánh dấu là `NHOM_COT_CHU`
     * trừ Backlog. Nhóm Backlog được đánh dấu `co` có ca ngay dưới.
     */
    const chu = [...document.querySelectorAll('[data-nhom][data-nhom-chu="co"]')];
    expect(chu.map((e) => e.getAttribute('data-nhom'))).toEqual(
      NHOM_COT_CHU.filter((t) => t !== 'backlog'),
    );
  });

  it('`backlog` và `duplicate` VẪN có nhóm riêng ở Danh sách — khi chúng có việc', async () => {
    /*
     * Nửa đối chứng của ca trên: d.405 ẩn nhóm **rỗng**, không ẩn `backlog` hay
     * `duplicate`. Không có ca này thì một bản lọc sai ("bỏ hẳn hai nhóm ấy")
     * vẫn xanh.
     */
    may(
      manHinhDanhSach([
        dong({ ma: 'SAI-1', trang_thai: 'backlog', nhom_trang_thai: 'planned' }),
        dong({ ma: 'SAI-7', trang_thai: 'duplicate', nhom_trang_thai: 'closed' }),
      ]),
    );
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    expect(
      [...document.querySelectorAll('[data-nhom]')].map((e) => e.getAttribute('data-nhom')),
    ).toEqual(['backlog', 'duplicate']);
    // T-111 A (BAT-64): Backlog nay có cột trên Bảng ⇒ `data-nhom-chu="co"` (trước là
    // `khong`); Trùng vẫn gộp vào cột Huỷ ⇒ `khong`.
    expect(document.querySelector('[data-nhom="backlog"]')?.getAttribute('data-nhom-chu')).toBe('co');
    expect(document.querySelector('[data-nhom="duplicate"]')?.getAttribute('data-nhom-chu')).toBe(
      'khong',
    );
  });

  /* ---------------- cột Huỷ gộp `duplicate` — #137 ---------------- */

  it('thẻ `duplicate` nằm trong cột Huỷ, và ĐỌC RA ĐƯỢC nhãn Trùng của máy chủ', async () => {
    may(
      manHinhDanhSach([
        dong({ ma: 'SAI-6', trang_thai: 'canceled', nhom_trang_thai: 'closed' }),
        dong({ ma: 'SAI-7', trang_thai: 'duplicate', nhom_trang_thai: 'closed' }),
      ]),
    );
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-7');

    const huy = document.querySelector<HTMLElement>('[data-cot="canceled"]')!;
    expect(within(huy).getByText('Việc SAI-7')).toBeTruthy();
    // Nhãn đi nguyên văn từ máy chủ (d.381) — web không chép bảng nhãn.
    expect(huy.querySelector('[data-the-ticket="SAI-7"] [data-o="trang-thai"]')?.textContent).toBe(
      NHAN_TRANG_THAI.duplicate,
    );
    /*
     * Và thẻ `canceled` **không** nhắc lại nhãn: cột đã nói "Huỷ". Không có vế
     * này thì ca trên xanh cả khi mọi thẻ đều in nhãn trạng thái.
     */
    expect(huy.querySelector('[data-the-ticket="SAI-6"] [data-o="trang-thai"]')).toBeNull();
  });

  it('số đếm cột Huỷ = `canceled` + `duplicate`', async () => {
    may(
      manHinhDanhSach([
        dong({ ma: 'SAI-6', trang_thai: 'canceled', nhom_trang_thai: 'closed' }),
        dong({ ma: 'SAI-7', trang_thai: 'duplicate', nhom_trang_thai: 'closed' }),
        dong({ ma: 'SAI-8', trang_thai: 'duplicate', nhom_trang_thai: 'closed' }),
      ]),
    );
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-7');

    expect(document.querySelector('[data-cot="canceled"] [data-so="cot"]')?.textContent).toBe('3');
  });

  /*
   * T-111 A (29/10, BAT-64): ticket backlog nay ra cột Backlog (đầu bên trái) —
   * trước đây ca này ghim "`backlog` KHÔNG có cột".
   */
  it('`backlog` ra CỘT Backlog (đầu bên trái), và tab nhanh Backlog vẫn còn', async () => {
    may(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'backlog', nhom_trang_thai: 'planned' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-cot]')).toHaveLength(NHOM_COT_CHU.length);
    });

    const cot = document.querySelector<HTMLElement>('[data-cot="backlog"]');
    expect(cot).not.toBeNull();
    expect(document.querySelector('[data-cot]')?.getAttribute('data-cot')).toBe('backlog');
    expect(cot?.querySelector('[data-the-ticket="SAI-1"]')).not.toBeNull();
    expect(cot?.querySelector('[data-so="cot"]')?.textContent).toBe('1');
    /*
     * Tab nhanh Backlog của d.407 vẫn còn, và **mọi** thẻ đổi được sang cả bảy
     * trạng thái qua ô trạng thái của **panel** (d.404) — ô "Chuyển cột" trên thẻ
     * đã bỏ ở đợt 3, xem ca dưới.
     */
    const o = document.querySelector<HTMLElement>('[data-nhanh="backlog"]');
    expect(o).not.toBeNull();
  });

  it('mọi thẻ đổi được sang cả BẢY trạng thái — qua PANEL, không qua ô trên thẻ', async () => {
    may(manHinhDanhSach([dong({ ma: 'SAI-2', trang_thai: 'in_progress', nhom_trang_thai: 'active' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-2');

    // d.404 — thẻ **không** có ô "Chuyển cột".
    expect(document.querySelector('[data-chuyen-cot]')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-2' }));
    const o = await vi.waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>('[data-trang-thai-panel="SAI-2"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect([...o.options].map((x) => x.value)).toEqual([...COT_BANG]);
    expect(COT_BANG).toHaveLength(7);
  });
});

describe('ẩn/hiện "Xong cũ" — một nút, và NHỚ lựa chọn', () => {
  const cu = dong({
    ma: 'SAI-9',
    trang_thai: 'done',
    nhom_trang_thai: 'closed',
    cap_nhat_luc: GIO - 100 * NGAY_MS,
  });
  const moi = dong({ ma: 'SAI-1', trang_thai: 'done', nhom_trang_thai: 'closed' });

  it('mặc định HIỆN hết; bấm nút ⇒ thẻ Xong cũ biến mất, số đếm cột giảm', async () => {
    may(manHinhDanhSach([moi, cu]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-9');
    expect(document.querySelector('[data-cot="done"] [data-so="cot"]')?.textContent).toBe('2');

    await userEvent.click(screen.getByRole('button', { name: NHAN_AN_XONG_CU }));

    expect(document.querySelector('[data-the-ticket="SAI-9"]')).toBeNull();
    expect(document.querySelector('[data-the-ticket="SAI-1"]')).not.toBeNull();
    // Số đếm đi theo thứ **đang thấy**: một cột ghi "2" mà vẽ 1 thẻ là nói sai.
    expect(document.querySelector('[data-cot="done"] [data-so="cot"]')?.textContent).toBe('1');
  });

  it('bấm rồi DỰNG LẠI trang ⇒ vẫn đang ẩn (nhớ qua lần tải sau)', async () => {
    // Môi trường test không có `localStorage` dùng được — xem `datKhoGia`.
    datKhoGia();
    may(manHinhDanhSach([moi, cu]));
    const dau = dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-9');
    await userEvent.click(screen.getByRole('button', { name: NHAN_AN_XONG_CU }));
    dau.unmount();

    may(manHinhDanhSach([moi, cu]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');
    expect(screen.getByRole('button', { name: NHAN_AN_XONG_CU }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(document.querySelector('[data-the-ticket="SAI-9"]')).toBeNull();
  });

  it('KHÔNG có `localStorage` ⇒ trang vẫn chạy, chỉ là không nhớ', async () => {
    // Cố ý **không** `datKhoGia()`: đúng môi trường của root test này.
    may(manHinhDanhSach([moi, cu]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-9');

    await userEvent.click(screen.getByRole('button', { name: NHAN_AN_XONG_CU }));
    expect(document.querySelector('[data-the-ticket="SAI-9"]')).toBeNull();
  });
});

/* ================================================================== *
 * C. Panel bên phải
 * ================================================================== */

describe('bấm thẻ ⇒ panel bên phải, bảng vẫn thấy phía sau', () => {
  const DS = [
    dong({ ma: 'SAI-1', trang_thai: 'todo', nhom_trang_thai: 'planned' }),
    dong({ ma: 'SAI-2', trang_thai: 'in_progress', nhom_trang_thai: 'active' }),
  ];

  it('bấm thẻ ⇒ panel mở, mang nội dung chi tiết, và bảng CÒN trong cây', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');

    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-1' }));

    const panel = await screen.findByRole('complementary', { name: NHAN_PANEL });
    expect(panel.getAttribute('data-ma')).toBe('SAI-1');
    // Nội dung là **thân chi tiết thật** (d.398–401), không một bản rút gọn thứ hai.
    expect(within(panel).getByText('Thân panel')).toBeTruthy();
    expect(panel.querySelector('[data-khoi="luot-giao"]')).not.toBeNull();
    expect(panel.querySelector('[data-khoi="thuoc-tinh"]')).not.toBeNull();
    // "Bảng vẫn thấy phía sau": cột và thẻ còn đó, và panel KHÔNG là `dialog`
    // (ở khổ rộng — khổ hẹp có hai ca riêng ở khối E).
    expect(document.querySelectorAll('[data-cot]')).toHaveLength(NHOM_COT_CHU.length);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('thẻ đang mở được GHI TRÊN URL, nên link dán vào mở sẵn panel', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, `/ticket?${KHOA_THE}=SAI-2`);

    const panel = await screen.findByRole('complementary', { name: NHAN_PANEL });
    expect(panel.getAttribute('data-ma')).toBe('SAI-2');
  });

  it('nút "Mở toàn trang" trỏ đúng `/t/<MÃ>` — d.398', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, `/ticket?${KHOA_THE}=SAI-2`);
    const panel = await screen.findByRole('complementary', { name: NHAN_PANEL });

    expect(within(panel).getByRole('link', { name: NHAN_MO_TOAN_TRANG }).getAttribute('href')).toBe(
      '/t/SAI-2',
    );
  });

  it('`Esc` đóng panel; nút ✕ cũng đóng', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, `/ticket?${KHOA_THE}=SAI-1`);
    await screen.findByRole('complementary', { name: NHAN_PANEL });

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: NHAN_PANEL })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-1' }));
    await screen.findByRole('complementary', { name: NHAN_PANEL });
    await userEvent.click(screen.getByLabelText(NHAN_DONG_PANEL));
    expect(screen.queryByRole('complementary', { name: NHAN_PANEL })).toBeNull();
  });

  it('`J`/`K` đi thẻ kế, và PANEL ĐỔI THEO thẻ đang chọn', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    // Chưa chọn gì: `J` vào thẻ đầu (theo đúng thứ tự gom nhóm).
    await userEvent.keyboard('j');
    await vi.waitFor(() => {
      expect(
        screen.getByRole('complementary', { name: NHAN_PANEL }).getAttribute('data-ma'),
      ).toBe('SAI-1');
    });

    await userEvent.keyboard('j');
    await vi.waitFor(() => {
      expect(
        screen.getByRole('complementary', { name: NHAN_PANEL }).getAttribute('data-ma'),
      ).toBe('SAI-2');
    });

    // Hết dãy thì ĐỨNG LẠI, không quay vòng về đầu.
    await userEvent.keyboard('j');
    expect(screen.getByRole('complementary', { name: NHAN_PANEL }).getAttribute('data-ma')).toBe(
      'SAI-2',
    );

    await userEvent.keyboard('k');
    await vi.waitFor(() => {
      expect(
        screen.getByRole('complementary', { name: NHAN_PANEL }).getAttribute('data-ma'),
      ).toBe('SAI-1');
    });
  });

  it('ĐANG GÕ trong một ô nhập thì `j` là chữ `j`, KHÔNG phải phím tắt', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    await moMenuLoc();
    const o = document.querySelector<HTMLInputElement>(`[data-loc="${KHOA_LOC_TICKET.nhan}"]`)!;
    await userEvent.type(o, 'jk');

    expect(o.value).toBe('jk');
    expect(screen.queryByRole('complementary', { name: NHAN_PANEL })).toBeNull();
  });

  it('`Cmd/Ctrl+K` KHÔNG bị `K` của thẻ ăn mất (d.404 là lượt sau)', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    await userEvent.keyboard('{Meta>}k{/Meta}');
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('complementary', { name: NHAN_PANEL })).toBeNull();
  });

  it('bấm LINK MÃ trên thẻ không mở panel (nó mở cả trang)', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    await userEvent.click(
      document.querySelector<HTMLElement>('[data-ticket="SAI-1"] [data-o="ma"]')!,
    );
    expect(screen.queryByRole('complementary', { name: NHAN_PANEL })).toBeNull();
  });
});

/* ================================================================== *
 * D. Bộ lọc nhanh
 * ================================================================== */

describe('bộ lọc nhanh Active / Backlog / All — và GHI TRÊN URL', () => {
  const DS = [
    dong({ ma: 'SAI-1', trang_thai: 'backlog', nhom_trang_thai: 'planned' }),
    dong({ ma: 'SAI-2', trang_thai: 'in_progress', nhom_trang_thai: 'active' }),
    dong({ ma: 'SAI-3', trang_thai: 'done', nhom_trang_thai: 'closed' }),
  ];

  it('ba tab, mặc định `all`; bấm "Đang chạy" ⇒ chỉ nhóm chạy, và `?nhanh=active`', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');
    expect(document.querySelector('[data-nhanh="all"]')?.getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(document.querySelector<HTMLElement>('[data-nhanh="active"]')!);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).toBeNull();
    });
    expect(document.querySelector('[data-ticket="SAI-2"]')).not.toBeNull();
    expect(document.querySelector('[data-ticket="SAI-3"]')).toBeNull();
    // d.397 — ghi trên URL, nên link dán được.
    expect(document.querySelector('[data-nhanh="active"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('`?nhanh=backlog` trên URL lúc mở trang ⇒ đúng nhóm chờ', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, `/ticket?${KHOA_NHANH}=backlog&xem=danh-sach`);
    await choTai('SAI-1');

    expect(document.querySelector('[data-ticket="SAI-2"]')).toBeNull();
    expect(document.querySelector('[data-ticket="SAI-3"]')).toBeNull();
  });

  it('`All` trả lại cả ba', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, `/ticket?${KHOA_NHANH}=active&xem=danh-sach`);
    await choTai('SAI-2');

    await userEvent.click(document.querySelector<HTMLElement>('[data-nhanh="all"]')!);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-ticket="SAI-3"]')).not.toBeNull();
  });

  /**
   * **Mỗi bộ lọc có ĐÚNG MỘT chỗ nhập** — d.407, và là phần "dọn trùng" của đợt 3.
   *
   * Đợt 2 có hai chỗ nhập cho cùng một khoá URL: ô "Người cầm"/"Nhãn" ở hàng
   * nhanh (`data-nhanh-loc`) và ô tương ứng trong thanh lọc đầy đủ (`data-loc`).
   * Hai chỗ nhập cho một nguồn sự thật là thứ chủ gọi là thừa, và nó cũng làm mọi
   * ca test chỉ thấy cái đầu. Ca này đỏ nếu một lượt sau dựng lại chỗ thứ hai.
   */
  it('mỗi khoá lọc có ĐÚNG MỘT ô nhập, và ô ấy nằm trong menu "Lọc"', async () => {
    const { may: m } = may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    // Không còn ô lọc nào ở hàng nhanh.
    expect(document.querySelectorAll('[data-nhanh-loc]')).toHaveLength(0);

    await moMenuLoc();
    const menu = screen.getByRole('menu', { name: 'Menu lọc' });
    for (const k of Object.values(KHOA_LOC_TICKET)) {
      expect(document.querySelectorAll(`[data-loc="${k}"]`), k).toHaveLength(1);
      expect(menu.querySelector(`[data-loc="${k}"]`), k).not.toBeNull();
    }

    // Và chỗ nhập duy nhất ấy vẫn đi vào truy vấn máy chủ (d.397).
    await userEvent.selectOptions(
      document.querySelector<HTMLSelectElement>(`[data-loc="${KHOA_LOC_TICKET.nguoi_dang_cam}"]`)!,
      'ag-a',
    );
    await vi.waitFor(() => {
      expect(m.da_goi.some((l) => l.duong.includes('nguoi_dang_cam=ag-a'))).toBe(true);
    });
  });

  /**
   * **Dòng cảnh báo phải nói đúng điều nó cảnh báo** — hai phép lọc máy khách
   * chỉ soi trang đã tải (`cau-hoi-spec.md` #132, #133). Không có vế này thì chủ
   * bấm "Backlog" ra 3 dòng và tưởng cả workspace có 3.
   */
  it('còn trang sau ⇒ nói rõ lọc nhanh CHỈ soi trang đã tải', async () => {
    may(manHinhDanhSach(DS, { cursor_sau: 'con-nua' }));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    const o = document.querySelector('[data-o="con-trang-sau"]');
    expect(o?.textContent).toContain(CAU_LOC_TRONG_TRANG);
  });

  it('hết trang (không `cursor_sau`) ⇒ KHÔNG có dòng cảnh báo nào', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    expect(document.querySelector('[data-o="con-trang-sau"]')).toBeNull();
  });

  it('lọc theo NHÃN (trong menu) đi vào truy vấn máy chủ', async () => {
    const { may: m } = may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');
    await moMenuLoc();

    await userEvent.type(
      document.querySelector<HTMLInputElement>(`[data-loc="${KHOA_LOC_TICKET.nhan}"]`)!,
      'bug',
    );

    await vi.waitFor(() => {
      expect(m.da_goi.some((l) => l.duong.includes('nhan=bug'))).toBe(true);
    });
  });
});

/* ================================================================== *
 * E. 375px — panel phủ kín thì phải CƯ XỬ như dialog (d.411)
 * ================================================================== */

/**
 * Một `matchMedia` giả nói "đang ở khổ hẹp". jsdom **không có** `matchMedia`
 * (nên mặc định của `manHinhHep` là "rộng" — xem `vo/kho-man-hinh.ts`), và nó
 * cũng không cho đổi khổ cửa sổ, nên đây là cách duy nhất dựng được ca 375px.
 */
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

describe('d.411 — ở 375px panel phủ kín, nên nó LÀ một dialog', () => {
  const DS = [dong({ ma: 'SAI-1', trang_thai: 'todo', nhom_trang_thai: 'planned' })];
  let thao: () => void = () => undefined;
  afterEach(() => {
    thao();
  });

  it('khổ HẸP: `role="dialog"` + `aria-modal`, khoá cuộn `body`, nền `inert`', async () => {
    thao = datKhoHep(true);
    may(manHinhDanhSach(DS));
    const truoc = document.body.style.overflow;
    dung(<TrangDanhSachTicket />, `/ticket?${KHOA_THE}=SAI-1`);

    const panel = await screen.findByRole('dialog', { name: NHAN_PANEL });
    expect(panel.getAttribute('aria-modal')).toBe('true');
    // Trang dưới KHÔNG được cuộn trong khi panel che cả màn hình.
    expect(document.body.style.overflow).toBe('hidden');
    /*
     * Nền `inert`: chặn **cả** `Tab` chạy xuyên ra bảng sau tấm phủ **và** trình
     * đọc màn hình đọc cả nền — hai vế mà một `role="dialog"` trần không có.
     */
    expect(document.querySelector('[inert]')).not.toBeNull();
    // Và panel tự lấy focus, nếu không thì `Tab` đầu tiên rơi về đầu tài liệu.
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(truoc).toBe('');
  });

  it('khổ HẸP: đóng ⇒ trả cuộn về GIÁ TRỊ CŨ, bỏ `inert`, và trả focus về thẻ', async () => {
    thao = datKhoHep(true);
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, `/ticket?${KHOA_THE}=SAI-1`);
    await screen.findByRole('dialog', { name: NHAN_PANEL });

    await userEvent.keyboard('{Escape}');

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog', { name: NHAN_PANEL })).toBeNull();
    });
    // Trả **giá trị cũ**, không gán cứng chuỗi rỗng — nếp đã chốt ở `App.tsx`.
    expect(document.body.style.overflow).toBe('');
    expect(document.querySelector('[inert]')).toBeNull();
    // Con trỏ bàn phím về đúng nút đã mở panel, không về đầu tài liệu.
    expect(document.activeElement?.getAttribute('data-mo-the')).toBe('SAI-1');
  });

  it('khổ RỘNG: vẫn là `complementary`, KHÔNG khoá cuộn, KHÔNG `inert`', async () => {
    thao = datKhoHep(false);
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, `/ticket?${KHOA_THE}=SAI-1`);

    await screen.findByRole('complementary', { name: NHAN_PANEL });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('luật thuần: không có `matchMedia` ⇒ coi là khổ RỘNG (không khoá cuộn ai)', () => {
    expect(manHinhHep({})).toBe(false);
    expect(manHinhHep({ matchMedia: ((q: string) => ({ matches: q === TRUY_VAN_HEP })) as never })).toBe(
      true,
    );
    // Một `matchMedia` NÉM cũng không được làm trắng cả trang.
    expect(
      manHinhHep({
        matchMedia: () => {
          throw new Error('môi trường lạ');
        },
      }),
    ).toBe(false);
  });
});

/* ================================================================== *
 * F. d.409 — bộ ảo hoá ĐO THẬT từng dòng, không một pitch cứng
 * ================================================================== *
 * Lỗi reviewer bắt được: `estimateSize` trả một pitch cứng 56px cho mọi dòng và
 * không đo lại, nên thẻ việc ba hàng (~110–150px) **đè lên nhau** ở kiểu xem
 * mặc định. jsdom không có layout nên **không ca test nào** thấy được chuyện đó
 * — nên phần kiểm chứng phải nằm ở **chính bộ tuỳ chọn**, một hàm thuần.
 */

describe('d.409 — bộ tuỳ chọn ảo hoá: có đo thật, và ước lượng theo loại dòng', () => {
  const laNhom = (i: number): boolean => i === 0;
  const tc = (): ReturnType<typeof tuyChonDanhSachAo> =>
    tuyChonDanhSachAo(3, laNhom, () => null);

  it('CÓ `measureElement` — bỏ nó đi là mọi dòng dùng ước lượng và đè nhau', () => {
    expect(typeof tc().measureElement).toBe('function');
  });

  it('ước lượng tiêu đề nhóm KHÁC ước lượng thẻ việc, và khớp đúng hai hằng', () => {
    expect(tc().estimateSize(0)).toBe(CHIEU_CAO_NHOM);
    expect(tc().estimateSize(1)).toBe(CHIEU_CAO_DONG);
    /*
     * **Hai con số không được lệch nhau**: hằng pitch của thẻ phải là một ước
     * lượng *của thẻ ba hàng*, không phải của một dòng chữ. Mốc dưới là chiều cao
     * thấp nhất mà một thẻ ba hàng có thể có (ba hàng × ~24px + padding), nên một
     * lần hạ `CHIEU_CAO_DONG` về 56 là **đỏ**.
     */
    expect(CHIEU_CAO_DONG).toBeGreaterThanOrEqual(96);
    expect(CHIEU_CAO_NHOM).toBeLessThan(CHIEU_CAO_DONG);
  });

  it('`measureElement` dùng SỐ ĐO THẬT khi có, và ước lượng theo `data-index` khi là 0', () => {
    const el = (i: number, h: number): Element =>
      ({
        getAttribute: (t: string) => (t === 'data-index' ? String(i) : null),
        getBoundingClientRect: () => ({ height: h }),
      }) as unknown as Element;

    // Trình duyệt thật: lấy đúng số đo.
    expect(tc().measureElement(el(1, 137))).toBe(137);
    // Chưa layout / jsdom: bệ đỡ là ước lượng **của chính dòng đó**.
    expect(tc().measureElement(el(1, 0))).toBe(CHIEU_CAO_DONG);
    expect(tc().measureElement(el(0, 0))).toBe(CHIEU_CAO_NHOM);
  });

  it('mỗi dòng vẽ ra mang `data-index` — không có nó `measureElement` không tra được dòng nào', async () => {
    may(manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    const dong_ve = [...document.querySelectorAll('[data-chi-so]')];
    expect(dong_ve.length).toBeGreaterThan(0);
    expect(dong_ve.filter((e) => e.getAttribute('data-index') === null)).toEqual([]);
    // Và hai thuộc tính nói **cùng một** chỉ số.
    expect(dong_ve.map((e) => e.getAttribute('data-index'))).toEqual(
      dong_ve.map((e) => e.getAttribute('data-chi-so')),
    );
  });
});

/* ================================================================== *
 * Hệ thiết kế 29/10 (`THIET-KE.md`, lượt UI-B) — icon trạng thái, đầu nhóm/cột
 * ================================================================== *
 * Chỉ ghim phần trình bày mà hệ thiết kế đòi và jsdom thấy được: icon trạng
 * thái (đúng hình của đúng trạng thái) đứng TRƯỚC tiêu đề trên dòng/thẻ, và đầu
 * nhóm/cột có icon + số đếm. Chữ trạng thái của máy chủ vẫn nằm trong DOM.
 */

/** `a` đứng trước `b` trong thứ tự tài liệu. */
function dungTruoc(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('UI-B — icon trạng thái trước tiêu đề, đầu nhóm/cột có số đếm', () => {
  const DS = [
    dong({ ma: 'SAI-1', trang_thai: 'todo', nhom_trang_thai: 'planned' }),
    dong({ ma: 'SAI-2', trang_thai: 'in_progress', nhom_trang_thai: 'active' }),
    dong({ ma: 'SAI-3', trang_thai: 'in_progress', nhom_trang_thai: 'active' }),
  ];

  it('DANH SÁCH: mỗi dòng có icon đúng trạng thái, đứng trước tiêu đề; chữ trạng thái vẫn trong DOM', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-2');

    const hang = document.querySelector<HTMLElement>('[data-ticket="SAI-2"]')!;
    const icon = hang.querySelector('[data-icon-trang-thai]');
    const tieu_de = hang.querySelector('[data-o="tieu-de"]');
    expect(icon?.getAttribute('data-icon-trang-thai')).toBe('in_progress');
    expect(icon !== null && tieu_de !== null && dungTruoc(icon, tieu_de)).toBe(true);
    // Icon đứng cạnh chữ ⇒ `aria-hidden` (THIET-KE.md "ARIA"); chữ của máy chủ còn.
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(hang.querySelector('[data-o="trang-thai"]')?.textContent).toBe(
      DS[1]!.nhan_trang_thai,
    );
  });

  it('DANH SÁCH: đầu nhóm = icon trạng thái + tên + số đếm', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    const dau = document.querySelector<HTMLElement>('[data-nhom="in_progress"]')!;
    expect(dau.querySelector('[data-icon-trang-thai="in_progress"]')).not.toBeNull();
    expect(dau.textContent).toContain(NHAN_TRANG_THAI.in_progress);
    expect(dau.querySelector('[data-so="nhom"]')?.textContent).toBe('2');
  });

  it('BẢNG: mỗi thẻ có icon đúng trạng thái trước tiêu đề; đầu cột có icon + số đếm', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');

    const the = document.querySelector<HTMLElement>('[data-the-ticket="SAI-1"]')!;
    const icon = the.querySelector('[data-icon-trang-thai]');
    const tieu_de = the.querySelector('[data-o="tieu-de"]');
    expect(icon?.getAttribute('data-icon-trang-thai')).toBe('todo');
    expect(icon !== null && tieu_de !== null && dungTruoc(icon, tieu_de)).toBe(true);

    const cot = document.querySelector<HTMLElement>('[data-cot="in_progress"]')!;
    const dau = cot.querySelector('h2')!;
    expect(dau.querySelector('[data-icon-trang-thai="in_progress"]')).not.toBeNull();
    expect(dau.querySelector('[data-so="cot"]')?.textContent).toBe('2');
  });

  /*
   * BAT-62 sửa kỳ vọng: ca cũ ghim "không có `…`/`+`". Nay cột Cần làm có `+` —
   * nhưng **chỉ trong vỏ** (hộp Tạo việc của vỏ cấp `moHop` qua context). Trang
   * dựng ngoài vỏ ⇒ không nút nào; `…` thì không ở đâu cả. Ca trong vỏ:
   * `test/nut-cot.test.tsx`.
   */
  it('BẢNG: đầu cột KHÔNG có nút `…`; dựng ngoài vỏ (không có hộp Tạo việc) thì cũng không có `+`', async () => {
    may(manHinhDanhSach(DS));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');

    const dau = [...document.querySelectorAll('[data-dau-cot]')];
    // T-111 A (29/10, BAT-64): 6 cột, Backlog đầu (trước là 5).
    expect(dau).toHaveLength(6);
    expect(dau.map((d) => d.getAttribute('data-dau-cot'))).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'verifying',
      'done',
      'canceled',
    ]);
    for (const d of dau) {
      expect(d.querySelector('button')).toBeNull();
    }
  });
});
