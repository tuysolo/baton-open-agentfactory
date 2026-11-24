/**
 * **Trang danh sách / bảng ticket** — SPEC mục 14 d.395–397, d.407, d.409, d.410,
 * d.412.
 *
 * Các luật thuần (bộ lọc → URL, gom nhóm, làm phẳng, `dichKeo`, view đã lưu) có
 * ca riêng ở `loc-ticket.test.ts`. Ở đây là những luật **chỉ đo được trên cây
 * React**: ô lọc có ghi lên URL và có đi vào lượt gọi không, hai kiểu xem có đổi
 * không, một lần đổi trạng thái bị máy chủ từ chối có **bật về chỗ cũ kèm lý do** hay
 * không, và bộ ảo hoá có thật sự không vẽ 5.000 dòng hay không.
 *
 * ## Hạn chế đã khai của lưới này
 *
 * **Chuỗi chuột `pointerdown → move → up` không dựng được**: jsdom không có
 * layout, nên `getBoundingClientRect` trả 0 cho mọi thứ và phép dò va chạm của
 * dnd-kit không quyết được gì — không có `dragend` nào để bắt. Luật của một lần
 * kéo vì vậy được ghim **ba lớp**: `dichKeo` (hàm thuần, `loc-ticket.test.ts`),
 * `xongKeo` gọi **trực tiếp** với `DragEndEvent` dựng tay (cuối file này: sang
 * cột khác / thả ra ngoài / thả lại cột cũ / id lạ), và ô trạng thái của panel
 * (`data-trang-thai-panel`; ô "Chuyển cột" trên thẻ đã bỏ ở d.404) đi hết đường
 * mutation thật — cùng `dichKeo`, cùng mutation, cùng toast.
 *
 * Phần **còn lại** thuộc nghiệm thu tay mục 17 là đúng một điều: dnd-kit có gắn
 * listener vào con trỏ và gọi `onDragEnd` thật hay không.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import {
  TrangDanhSachTicket,
  CAU_KHONG_CO_TICKET,
  NHAN_LUU_VIEW,
  NHAN_NUT_LOC,
  xongKeo,
} from '../src/trang/danh-sach-ticket';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import { ThanChiTietTicket } from '../src/trang/chi-tiet-ticket';
import { useNhipLamMoi } from '../src/lam-moi';
import { hashKey, onlineManager, type QueryClient, type QueryKey } from '@tanstack/react-query';
import {
  batDauGhiLacQuan,
  dangGhiLacQuan,
  henXaHoan,
  ketThucGhiLacQuan,
  khoaDangHoan,
  lamMoiTheoSo,
} from '../src/ghi-lac-quan';
import { batDauSua, ketThucSua } from '../src/so-dem-sua';
import {
  KHOA_KIEU_XEM,
  KHOA_LOC_TICKET,
  KHOA_VIEW_DA_LUU,
  NHAN_KIEU_XEM,
  NHAN_TRANG_THAI,
  NHOM_COT_CHU,
  TRANG_THAI_THEO_THU_TU,
  UU_TIEN_THEO_THU_TU,
} from '../src/loc-ticket';
import { MayChuGia, dung } from './giup';
import {
  GIO,
  GIO_MS,
  THAN_AGENT,
  THAN_DU_AN,
  dong,
  manHinhDanhSach,
  manHinhTicket,
  nhieuDong,
  ticketDayDu,
} from './than-ticket';
import { hienThayDoiTuSpec, soTicketCuonMuotTuSpec, specDoiDienThoai } from './doc-spec';

/**
 * Máy chủ giả cho trang này.
 *
 * `kho.trang` **đổi được giữa các lượt gọi** — điều kiện để dựng ca d.410 (agent
 * tạo thay đổi ở phía máy chủ) và ca "tải lại sau khi đổi trạng thái".
 * `may.da_goi` giữ **mọi** đường đã gọi, nên ca ghim được "ô lọc có đi vào truy
 * vấn" chứ không chỉ "URL có đổi".
 */
function mayTicket(trang = manHinhDanhSach([dong({ ma: 'SAI-1' })])): {
  may: MayChuGia;
  kho: {
    trang: ReturnType<typeof manHinhDanhSach>;
    loi: { error: string; message: string } | null;
    cho: Promise<unknown> | null;
    choGet: Promise<unknown> | null;
    hang_nhan: { loi: { error: string; message: string } | null; cho: Promise<unknown> | null }[];
    /** Như `hang_nhan` nhưng cho `PATCH /v1/ticket/:id` (ưu tiên) và `POST .../trang-thai`. */
    hang_patch: { loi: { error: string; message: string } | null; cho: Promise<unknown> | null }[];
    hang_tt: { loi: { error: string; message: string } | null; cho: Promise<unknown> | null }[];
  };
} {
  const kho = {
    trang,
    loi: null as { error: string; message: string } | null,
    cho: null as Promise<unknown> | null,
    /**
     * **Cửa chặn lượt ĐỌC.** Đóng cửa này rồi mới bấm là cách duy nhất đo được
     * phép **hoàn lại** của d.407 cho đúng nó: không có cửa, lần
     * `invalidateQueries` của `onSettled` tải lại ngay và thẻ về cột cũ **dù mã
     * không hoàn gì** — tức ca "bật về chỗ cũ" xanh một cách vô nghĩa (đã đo bằng
     * đột biến: bỏ `setQueryData(anh)` trong `onError` mà ca vẫn xanh).
     */
    choGet: null as Promise<unknown> | null,
    /**
     * **Câu trả lời của từng lượt `POST .../nhan`, theo thứ tự gọi** — để dựng
     * ca hai thao tác nhãn chồng nhau (lượt 1 lỗi, lượt 2 nhận). Hết hàng thì
     * dùng `loi`/`cho` chung.
     */
    hang_nhan: [] as { loi: { error: string; message: string } | null; cho: Promise<unknown> | null }[],
    hang_patch: [] as { loi: { error: string; message: string } | null; cho: Promise<unknown> | null }[],
    hang_tt: [] as { loi: { error: string; message: string } | null; cho: Promise<unknown> | null }[],
  };
  const may = new MayChuGia();
  may.dat('GET /v1/du-an?limit=200', { than: THAN_DU_AN });
  may.dat('GET /v1/agent', { than: THAN_AGENT });
  may.gan();

  /*
   * Đường màn hình nhận **mọi chuỗi truy vấn**, nên bảng tra của `MayChuGia`
   * (khớp đúng chuỗi) không dùng được — một ô lọc mới là một đường mới. Nên
   * `fetch` được bọc thêm một lớp mỏng: đường bắt đầu bằng `/v1/man-hinh-ticket`
   * thì trả `kho.trang`; `POST .../trang-thai` thì trả `kho.loi` nếu có.
   */
  const goc = globalThis.fetch;
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    /*
     * **Đường chi tiết của panel phải thử TRƯỚC** đường danh sách: cả hai bắt đầu
     * bằng `/v1/man-hinh-ticket`, và trả thân danh sách cho panel làm
     * `ThanChiTietTicket` đổ (`ticket` là `undefined`). Cùng nếp
     * `the-viec.test.tsx`; cần ở đây từ đợt 3 vì **panel** là một trong ba đường
     * đổi trạng thái của d.404.
     */
    const ma_chi_tiet = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
    if (ma_chi_tiet !== undefined) {
      may.da_goi.push({ duong, method: init?.method ?? 'GET', than: undefined });
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
      may.da_goi.push({ duong, method: init?.method ?? 'GET', than: undefined });
      const dap_get = (): Response =>
        new Response(JSON.stringify(kho.trang), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      return kho.choGet === null ? Promise.resolve(dap_get()) : kho.choGet.then(dap_get);
    }
    if (/^\/v1\/ticket\/[^/]+$/.test(duong) && init?.method === 'PATCH') {
      may.da_goi.push({
        duong,
        method: 'PATCH',
        than: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const luot = kho.hang_patch.shift() ?? { loi: kho.loi, cho: kho.cho };
      const dap = (): Response =>
        luot.loi === null
          ? new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : new Response(JSON.stringify(luot.loi), {
              status: 422,
              headers: { 'content-type': 'application/json' },
            });
      return luot.cho === null ? Promise.resolve(dap()) : luot.cho.then(dap);
    }
    if (/^\/v1\/ticket\/[^/]+\/nhan$/.test(duong) && init?.method === 'POST') {
      may.da_goi.push({
        duong,
        method: 'POST',
        than: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const luot = kho.hang_nhan.shift() ?? { loi: kho.loi, cho: kho.cho };
      const dap = (): Response =>
        luot.loi === null
          ? new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : new Response(JSON.stringify(luot.loi), {
              status: 422,
              headers: { 'content-type': 'application/json' },
            });
      return luot.cho === null ? Promise.resolve(dap()) : luot.cho.then(dap);
    }
    if (duong.includes('/trang-thai')) {
      may.da_goi.push({
        duong,
        method: init?.method ?? 'POST',
        than: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const luot = kho.hang_tt.shift() ?? { loi: kho.loi, cho: kho.cho };
      const dap = (): Response =>
        luot.loi === null
          ? new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : new Response(JSON.stringify(luot.loi), {
              status: 422,
              headers: { 'content-type': 'application/json' },
            });
      return luot.cho === null ? Promise.resolve(dap()) : luot.cho.then(dap);
    }
    return goc(duong, init);
  }) as typeof globalThis.fetch;

  return { may, kho };
}

/**
 * **Đường của kiểu DANH SÁCH, tường minh** — từ BAT-6 đợt 3, kiểu mặc định của
 * trang việc là **Bảng** (d.403, d.397). Ca nào nói về *kiểu xem danh sách* vì
 * vậy phải xin nó trên URL; để `'/ticket'` suông là đo một màn hình khác.
 */
const DUONG_DANH_SACH = '/ticket?xem=danh-sach';

/**
 * **Mở menu "Lọc"** — d.407: thanh lọc **không mở sẵn**. Mọi ca đụng tới một ô
 * `[data-loc=…]` hay ô "Tên view" phải mở menu trước, đúng như chủ phải làm.
 */
async function moMenuLoc(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${NHAN_NUT_LOC}`) }));
}

/** Mở panel chi tiết của một thẻ — đường đổi trạng thái của d.404. */
async function moPanel(ma: string): Promise<HTMLSelectElement> {
  await userEvent.click(screen.getByRole('button', { name: `Mở ${ma}` }));
  return await vi.waitFor(() => {
    const o = document.querySelector<HTMLSelectElement>(`[data-trang-thai-panel="${ma}"]`);
    expect(o).not.toBeNull();
    return o!;
  });
}

/** Chờ trang có dữ liệu. */
async function choTai(ma: string): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector(`[data-ticket="${ma}"], [data-the-ticket="${ma}"]`)).not.toBeNull();
  });
}

/**
 * **jsdom ở root này KHÔNG có `localStorage`** (node chạy không
 * `--localstorage-file`). Đó cũng là một môi trường thật (iframe sandbox, Safari
 * chặn cookie), và `khoView()` của mã sản phẩm đã chịu được nó — ca "kho bị chặn"
 * dưới đây ghim điều đó.
 *
 * Nhưng các ca **về chính việc lưu view** cần một kho chạy được, nên chúng gắn một
 * kho trong bộ nhớ. Gắn trong `beforeEach`, tháo trong `afterEach`: một kho rò
 * sang ca sau là một ca ăn view của ca trước.
 */
function khoTrongBoNho(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
}

function ganKho(): Storage {
  const kho = khoTrongBoNho();
  Object.defineProperty(globalThis, 'localStorage', {
    value: kho,
    configurable: true,
    writable: true,
  });
  return kho;
}

function thaoKho(): void {
  Reflect.deleteProperty(globalThis, 'localStorage');
}

afterEach(() => {
  onlineManager.setOnline(true); // BAT-31: ca nào mô phỏng mất mạng phải trả mạng lại
  vi.useRealTimers();
  vi.restoreAllMocks();
  thaoKho();
});

/* ================================================================== *
 * A. d.395–396 — danh sách gom theo trạng thái
 * ================================================================== */

describe('d.396 — kiểu xem danh sách: gom theo trạng thái', () => {
  /**
   * **Nhóm RỖNG bị ẩn** — d.405: "nhóm rỗng ở Danh sách thì **ẩn**". Đợt 2 vẽ đủ
   * bảy tiêu đề; chủ gọi năm tiêu đề trống là thừa, và SPEC nay nói thẳng. Ca này
   * là ca cũ, viết lại cho đúng luật mới — và nó có **cả hai** vế: nhóm có việc
   * thì hiện, nhóm rỗng thì không.
   */
  it('chỉ hiện tiêu đề của nhóm CÓ việc; nhóm rỗng thì ẩn (d.405)', async () => {
    mayTicket(
      manHinhDanhSach([
        dong({ ma: 'SAI-1', trang_thai: 'todo' }),
        dong({ ma: 'SAI-2', trang_thai: 'done' }),
      ]),
    );
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    expect(document.querySelectorAll('[data-nhom]')).toHaveLength(2);
    expect(document.querySelector('[data-nhom="todo"]')?.textContent).toContain(
      NHAN_TRANG_THAI.todo,
    );
    expect(document.querySelector('[data-nhom="done"]')).not.toBeNull();
    // Năm nhóm còn lại **không** có tiêu đề nào.
    expect(document.querySelector('[data-nhom="backlog"]')).toBeNull();
    expect(document.querySelector('[data-nhom="verifying"]')).toBeNull();
    expect(document.querySelector('[data-ticket="SAI-2"]')).not.toBeNull();
  });

  it('mỗi dòng có link `/t/<MÃ>` — d.398', async () => {
    mayTicket();
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    const hang = document.querySelector('[data-ticket="SAI-1"]');
    expect(hang?.querySelector('a')?.getAttribute('href')).toBe('/t/SAI-1');
  });

  it('nhãn trạng thái trên DÒNG lấy từ máy chủ, không dịch lại ở web', async () => {
    /*
     * Fixture trả một nhãn **lạ** cho cùng mã `todo`. Nếu giao diện tự dịch mã →
     * nhãn (bảng trong `loc-ticket.ts`) thì dòng sẽ in "Cần làm" và ca đỏ.
     */
    const t = { ...dong({ ma: 'SAI-1', trang_thai: 'todo' }), nhan_trang_thai: 'NHÃN-CỦA-MÁY-CHỦ' };
    mayTicket(manHinhDanhSach([t]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    const o = document.querySelector('[data-ticket="SAI-1"] [data-o="trang-thai"]');
    expect(o?.textContent).toBe('NHÃN-CỦA-MÁY-CHỦ');
  });

  it('không có ticket nào khớp ⇒ nói rõ, không một danh sách trắng', async () => {
    mayTicket(manHinhDanhSach([]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await vi.waitFor(() => {
      expect(screen.getByText(CAU_KHONG_CO_TICKET)).toBeTruthy();
    });
  });
});

/* ================================================================== *
 * B. d.412 — thời gian tương đối, rê chuột thấy giờ Việt Nam
 * ================================================================== */

describe('d.412 — hạn hiện tương đối, đếm từ `bay_gio` CỦA MÁY CHỦ', () => {
  it('chữ tương đối, và `title` là giờ đầy đủ giờ Việt Nam', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', han_luc: GIO + 2 * GIO_MS })]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    const o = document.querySelector('[data-ticket="SAI-1"] [data-o="han"]');
    expect(o?.textContent).toBe('Hạn trong 2 giờ');
    expect(o?.getAttribute('title')).toContain('giờ Việt Nam');
  });

  /**
   * **Đồng hồ máy khách lệch ⇒ chữ KHÔNG đổi.** Đây là ca duy nhất phân biệt được
   * "đếm từ `bay_gio` của máy chủ" với "đếm từ `Date.now()`": với một
   * `Date.now()` bị đẩy đi 10 giờ, bản dùng đồng hồ máy khách sẽ in
   * "8 giờ trước".
   */
  it('máy khách lệch 10 giờ: chữ vẫn là "trong 2 giờ" (không dùng Date.now)', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', han_luc: GIO + 2 * GIO_MS })]));
    vi.useFakeTimers({ now: GIO + 10 * GIO_MS, shouldAdvanceTime: true });
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-ticket="SAI-1"] [data-o="han"]')?.textContent).toBe(
      'Hạn trong 2 giờ',
    );
  });
});

/* ================================================================== *
 * C. d.396–397 — bộ lọc, ghi trên URL VÀ đi vào lượt gọi
 * ================================================================== */

describe('d.397 — bộ lọc ghi trên URL và đi vào truy vấn máy chủ', () => {
  /*
   * Từ đợt 3, mọi ô lọc nằm **trong menu "Lọc"** (d.407). Luật được canh ở đây
   * **không đổi** — "ghi trên URL và đi vào truy vấn" — chỉ thêm một bước mở menu,
   * đúng bước mà chủ cũng phải làm.
   */
  it('chọn trạng thái ⇒ URL có khoá, và lượt gọi mới mang `trang_thai=`', async () => {
    const { may } = mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');
    await moMenuLoc();

    const o = document.querySelector<HTMLSelectElement>(
      `[data-loc="${KHOA_LOC_TICKET.trang_thai}"]`,
    );
    expect(o).not.toBeNull();
    await userEvent.selectOptions(o!, 'done');

    await vi.waitFor(() => {
      expect(
        may.da_goi.some(
          (l) => l.duong.startsWith('/v1/man-hinh-ticket') && l.duong.includes('trang_thai=done'),
        ),
      ).toBe(true);
    });
  });

  it('cờ "cần Chủ" gửi đúng `can_chu=co`', async () => {
    const { may } = mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');
    await moMenuLoc();

    await userEvent.click(
      document.querySelector<HTMLInputElement>(`[data-loc="${KHOA_LOC_TICKET.can_chu}"]`)!,
    );
    await vi.waitFor(() => {
      expect(may.da_goi.some((l) => l.duong.includes('can_chu=co'))).toBe(true);
    });
  });

  it('bộ lọc ĐỌC TỪ URL lúc mở trang (link dán vào được)', async () => {
    const { may } = mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket?uu_tien=urgent&nguoi_dang_cam=ag-a');
    await choTai('SAI-1');

    const goi = may.da_goi.find((l) => l.duong.startsWith('/v1/man-hinh-ticket'));
    expect(goi?.duong).toContain('uu_tien=urgent');
    expect(goi?.duong).toContain('nguoi_dang_cam=ag-a');
  });

  it('d.407 — thanh lọc KHÔNG mở sẵn: chưa bấm "Lọc" thì không ô nào trên trang', async () => {
    mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');

    const co = Object.values(KHOA_LOC_TICKET).filter(
      (k) => document.querySelector(`[data-loc="${k}"]`) !== null,
    );
    expect(co).toEqual([]);
    // "Lưu thành view" cũng ở trong menu (d.407), không trần trên trang.
    expect(screen.queryByRole('button', { name: NHAN_LUU_VIEW })).toBeNull();
    expect(document.querySelector('[data-o="ten-view"]')).toBeNull();
  });

  it('cả chín ô lọc của d.396 có mặt TRONG menu "Lọc", cùng "Lưu thành view"', async () => {
    mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');
    await moMenuLoc();

    const menu = screen.getByRole('menu', { name: 'Menu lọc' });
    const thieu = Object.values(KHOA_LOC_TICKET).filter(
      (k) => menu.querySelector(`[data-loc="${k}"]`) === null,
    );
    expect(thieu).toEqual([]);
    expect(within(menu).getByRole('button', { name: NHAN_LUU_VIEW })).toBeTruthy();
  });

  it('`Escape` đóng menu "Lọc" và trả focus về nút (dùng được bằng bàn phím, d.411)', async () => {
    mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');

    const nut = screen.getByRole('button', { name: new RegExp(`^${NHAN_NUT_LOC}`) });
    await moMenuLoc();
    expect(nut.getAttribute('aria-expanded')).toBe('true');

    // Con trỏ phải **ở trong** menu, nếu không `Escape` không tới `onKeyDown`.
    const o = document.querySelector<HTMLElement>(`[data-loc="${KHOA_LOC_TICKET.trang_thai}"]`)!;
    o.focus();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: 'Menu lọc' })).toBeNull();
    expect(document.activeElement).toBe(nut);
  });
});

/* ================================================================== *
 * C'. BAT-41 (tạm, `cau-hoi-spec.md` #167) — gõ mã ticket vào ô Nhãn
 * ================================================================== */

describe('BAT-41 — ô lọc Nhãn đúng dạng mã ticket ⇒ thêm dòng "Mở MÃ"; lọc nhãn giữ nguyên', () => {
  /** In ra đường + chuỗi truy vấn hiện tại của router, để đo URL thật. */
  function ViTri(): React.JSX.Element {
    const vt = useLocation();
    return <output data-o="vi-tri">{`${vt.pathname}${vt.search}`}</output>;
  }
  const viTri = (): string => document.querySelector('[data-o="vi-tri"]')?.textContent ?? '';
  const dongMo = (): HTMLAnchorElement | null =>
    document.querySelector<HTMLAnchorElement>('[data-o="mo-ma-tu-loc-nhan"]');

  function dungCoTuyen(): void {
    dung(
      <>
        <Routes>
          <Route path="/ticket" element={<TrangDanhSachTicket />} />
          <Route path="/t/:ma" element={<p data-o="trang-chi-tiet">chi tiết</p>} />
        </Routes>
        <ViTri />
      </>,
      DUONG_DANH_SACH,
    );
  }

  async function goNhan(chu: string): Promise<HTMLInputElement> {
    const o = document.querySelector<HTMLInputElement>(`[data-loc="${KHOA_LOC_TICKET.nhan}"]`)!;
    await userEvent.clear(o);
    await userEvent.type(o, chu);
    return o;
  }

  it.each(['SAI-5', ' sai-5 '])(
    'gõ %j ⇒ dòng "Mở SAI-5" tới /t/SAI-5; URL vẫn mang giá trị nhãn và lượt gọi vẫn lọc nhãn',
    async (chu) => {
      const { may } = mayTicket();
      dungCoTuyen();
      await choTai('SAI-1');
      await moMenuLoc();
      expect(dongMo()).toBeNull();

      await goNhan(chu);
      const a = await vi.waitFor(() => {
        const x = dongMo();
        expect(x).not.toBeNull();
        return x!;
      });
      expect(a.textContent).toBe('Mở SAI-5');
      expect(a.getAttribute('href')).toBe('/t/SAI-5');
      expect(screen.getByRole('link', { name: 'Mở SAI-5' })).toBe(a);

      // Lọc nhãn KHÔNG đổi: giá trị gõ (nguyên văn) vẫn trên URL dưới khoá nhãn và đi vào truy vấn.
      expect(new URLSearchParams(viTri().split('?')[1]).get(KHOA_LOC_TICKET.nhan)).toBe(chu);
      await vi.waitFor(() => {
        expect(
          may.da_goi.some(
            (l) =>
              l.duong.startsWith('/v1/man-hinh-ticket') &&
              new URLSearchParams(l.duong.split('?')[1]).get('nhan') === chu,
          ),
        ).toBe(true);
      });

      // Bấm ⇒ điều hướng SPA tới trang chi tiết.
      await userEvent.click(a);
      await vi.waitFor(() => {
        expect(viTri()).toBe('/t/SAI-5');
      });
      expect(document.querySelector('[data-o="trang-chi-tiet"]')).not.toBeNull();
    },
  );

  it.each(['bug', 'SAI', 'SAI-', '5', 'SAI-01', 'SAI-0', 'S-5', 'SAI-5x', 'SAI 5'])(
    'gõ %j (không đúng dạng mã) ⇒ KHÔNG có dòng "Mở"; giá trị vẫn lọc nhãn như cũ',
    async (chu) => {
      mayTicket();
      dungCoTuyen();
      await choTai('SAI-1');
      await moMenuLoc();
      await goNhan(chu);
      expect(new URLSearchParams(viTri().split('?')[1]).get(KHOA_LOC_TICKET.nhan)).toBe(chu);
      expect(dongMo()).toBeNull();
      expect(screen.queryByRole('link', { name: /^Mở / })).toBeNull();
    },
  );

  it('mã đọc từ URL lúc mở trang cũng hiện dòng (link dán vào được)', async () => {
    mayTicket();
    dung(<TrangDanhSachTicket />, `${DUONG_DANH_SACH}&${KHOA_LOC_TICKET.nhan}=spx-12`);
    await choTai('SAI-1');
    await moMenuLoc();
    expect(dongMo()?.getAttribute('href')).toBe('/t/SPX-12');
    expect(dongMo()?.textContent).toBe('Mở SPX-12');
  });
});

/* ================================================================== *
 * D. d.395 — "theo dự án" qua đường `/du-an/:ma`
 * ================================================================== */

describe('d.395 — danh sách theo dự án', () => {
  it('`/du-an/SAI` lọc theo đúng `project_id` của dự án có mã đó', async () => {
    const { may } = mayTicket();
    dung(<TrangDanhSachTicket ma_du_an="SAI" />, '/du-an/SAI');
    await choTai('SAI-1');

    await vi.waitFor(() => {
      expect(may.da_goi.some((l) => l.duong.includes('project_id=pj-SAI'))).toBe(true);
    });
    // Ô lọc dự án không hiện **kể cả khi menu đã mở**: dự án đã do đường quyết.
    await moMenuLoc();
    expect(screen.getByRole('menu', { name: 'Menu lọc' })).toBeTruthy();
    expect(document.querySelector(`[data-loc="${KHOA_LOC_TICKET.du_an}"]`)).toBeNull();
    // Nhưng các ô khác **có** — lưới chống "xanh vì menu rỗng".
    expect(document.querySelector(`[data-loc="${KHOA_LOC_TICKET.trang_thai}"]`)).not.toBeNull();
  });

  it('mã dự án không có ⇒ nói rõ, KHÔNG im lặng hiện tất cả dự án', async () => {
    const { may } = mayTicket();
    dung(<TrangDanhSachTicket ma_du_an="KHONG-CO" />, '/du-an/KHONG-CO');
    await vi.waitFor(() => {
      expect(screen.getByText('Không có dự án này.')).toBeTruthy();
    });
    // Và **không** gọi đường danh sách với bộ lọc rỗng.
    expect(may.da_goi.some((l) => l.duong.startsWith('/v1/man-hinh-ticket'))).toBe(false);
  });
});

/* ================================================================== *
 * E. d.396 — hai kiểu xem, và bảng có cột là trạng thái
 * ================================================================== */

describe('d.396 — hai kiểu xem', () => {
  /**
   * **Sáu cột, không bảy** — T-111 A (29/10, BAT-64): 6 cột, Backlog đầu (trước
   * đó, từ BAT-6 đợt 2, là năm cột không có Backlog). `duplicate` hiện trong cột
   * Huỷ; ô trạng thái của panel vẫn giữ đủ bảy giá trị nên không trạng thái nào
   * mất đường tới. Danh sách đủ sáu cột và luật gộp có ca riêng ở `the-viec.test.tsx`.
   */
  it('bấm "Bảng" ⇒ sáu cột Backlog đầu, thẻ nằm đúng cột của nó', async () => {
    mayTicket(
      manHinhDanhSach([
        dong({ ma: 'SAI-1', trang_thai: 'in_progress' }),
        dong({ ma: 'SAI-2', trang_thai: 'done' }),
        dong({ ma: 'SAI-3', trang_thai: 'backlog', nhom_trang_thai: 'planned' }),
      ]),
    );
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    await userEvent.click(screen.getByRole('button', { name: NHAN_KIEU_XEM.bang }));
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-cot]')).toHaveLength(NHOM_COT_CHU.length);
    });
    expect([...document.querySelectorAll('[data-cot]')].map((c) => c.getAttribute('data-cot'))).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'verifying',
      'done',
      'canceled',
    ]);
    const cot_backlog = document.querySelector<HTMLElement>('[data-cot="backlog"]')!;
    expect(within(cot_backlog).getByText('Việc SAI-3')).toBeTruthy();

    const cot_dang_lam = document.querySelector<HTMLElement>('[data-cot="in_progress"]')!;
    expect(within(cot_dang_lam).getByText('Việc SAI-1')).toBeTruthy();
    const cot_xong = document.querySelector<HTMLElement>('[data-cot="done"]')!;
    expect(within(cot_xong).getByText('Việc SAI-2')).toBeTruthy();
    // Và SAI-1 **không** ở cột Xong — ca phủ định có thật.
    expect(within(cot_xong).queryByText('Việc SAI-1')).toBeNull();
  });

  it('kiểu xem ghi trên URL, nên mở `?xem=bang` là vào thẳng bảng', async () => {
    mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-cot]')).toHaveLength(NHOM_COT_CHU.length);
    });
    expect(document.querySelector('[data-o="khung-cuon"]')).toBeNull();
  });

  /* ---------------------------------------------------------------- *
   * d.403 + d.397 — kiểu MẶC ĐỊNH là Bảng, và lựa chọn của chủ thắng
   * ---------------------------------------------------------------- */

  it('d.403 — trang việc của MỘT DỰ ÁN mặc định là kiểu Bảng (không URL nào nói gì)', async () => {
    mayTicket();
    dung(<TrangDanhSachTicket ma_du_an="SAI" />, '/du-an/SAI');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-cot]')).toHaveLength(NHOM_COT_CHU.length);
    });
    expect(document.querySelector('[data-o="khung-cuon"]')).toBeNull();
  });

  it('d.397 — "Tất cả việc" (`/ticket`) cũng mở ở kiểu Bảng', async () => {
    mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-cot]')).toHaveLength(NHOM_COT_CHU.length);
    });
  });

  it('chủ bấm "Danh sách" ⇒ lựa chọn được NHỚ và thắng mặc định ở lần mở sau', async () => {
    ganKho();
    mayTicket();
    const dau = dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');
    await userEvent.click(screen.getByRole('button', { name: NHAN_KIEU_XEM['danh-sach'] }));
    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="khung-cuon"]')).not.toBeNull();
    });
    dau.unmount();

    // Mở lại **không** mang `?xem=`: kho nhớ Danh sách ⇒ Danh sách, không Bảng.
    dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');
    expect(document.querySelector('[data-o="khung-cuon"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-cot]')).toHaveLength(0);
  });

  it('URL thắng cả lựa chọn đã nhớ (d.397: bộ lọc và kiểu xem ghi trên URL)', async () => {
    const kho = ganKho();
    kho.setItem(KHOA_KIEU_XEM, 'danh-sach');
    mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-cot]')).toHaveLength(NHOM_COT_CHU.length);
    });
  });

  it('kho nhớ một giá trị RÁC ⇒ về mặc định của SPEC, không trang trắng', async () => {
    const kho = ganKho();
    kho.setItem(KHOA_KIEU_XEM, 'kieu-khong-co');
    mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-cot]')).toHaveLength(NHOM_COT_CHU.length);
    });
  });
});

/* ================================================================== *
 * E2. d.405 — cột rỗng ở Bảng: thu hẹp, nhưng vẫn có tiêu đề và số 0
 * ================================================================== */

describe('d.405 — cột rỗng thu hẹp nhưng VẪN hiện tiêu đề và số 0', () => {
  it('cột không có thẻ nào: còn tiêu đề, số đếm là 0, và hẹp hơn cột có thẻ', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'in_progress' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');

    const co_the = document.querySelector<HTMLElement>('[data-cot="in_progress"]')!;
    const rong = document.querySelector<HTMLElement>('[data-cot="done"]')!;

    // Vẫn là một cột thật: tiêu đề + số 0.
    expect(rong.getAttribute('aria-label')).toBe(NHAN_TRANG_THAI.done);
    expect(rong.querySelector('[data-so="cot"]')?.textContent).toBe('0');

    // Và nó **hẹp hơn**: hai lớp bề ngang khác nhau, đánh dấu bằng `data-rong`.
    expect(rong.getAttribute('data-rong')).toBe('co');
    expect(co_the.getAttribute('data-rong')).toBe('khong');
    expect(rong.className).toContain('w-28');
    expect(co_the.className).toContain('w-64');
  });
});

/* ================================================================== *
 * F. d.396 + d.407 — kéo vào Xong thiếu bằng chứng
 * ================================================================== */

describe('d.396 — chuyển sang Xong mà thiếu bằng chứng: bật về chỗ cũ + báo lý do', () => {
  const LY_DO = 'Thiếu bằng chứng: cần ít nhất một commit đã merge.';

  /*
   * **Đường đổi trạng thái của ba ca dưới nay là PANEL CHI TIẾT** (d.404), không ô
   * "Chuyển cột" trên thẻ — ô ấy đã bỏ ở đợt 3 phần B. Luật được canh **không
   * đổi**: hiện ngay (d.407), máy chủ từ chối thì hoàn lại + toast nguyên văn
   * (d.396, d.407), máy chủ nhận thì gọi đúng đường và đúng thân.
   */

  it('thẻ sang cột Xong NGAY trước khi máy chủ trả lời (d.407)', async () => {
    const { kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'in_progress' })]));
    // Giữ phản hồi lại: không có nó thì bản lạc quan và bản thật không phân biệt được.
    let mo: () => void = () => undefined;
    kho.cho = new Promise<unknown>((res) => {
      mo = () => res(null);
    });
    kho.loi = { error: 'EVIDENCE_REQUIRED', message: LY_DO };

    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-the-ticket="SAI-1"]')).not.toBeNull();
    });

    await userEvent.selectOptions(await moPanel('SAI-1'), 'done');

    // **Trước** khi máy chủ trả lời: thẻ đã ở cột Xong.
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-cot="done"] [data-the-ticket="SAI-1"]'),
      ).not.toBeNull();
    });
    mo();
  });

  it('máy chủ từ chối ⇒ thẻ VỀ CỘT CŨ và toast mang LÝ DO CỦA MÁY CHỦ', async () => {
    const { kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'in_progress' })]));
    kho.loi = { error: 'EVIDENCE_REQUIRED', message: LY_DO };

    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-the-ticket="SAI-1"]')).not.toBeNull();
    });

    /*
     * **Đóng cửa lượt đọc** ngay sau lần tải đầu. Từ đây, thứ duy nhất có thể
     * đưa thẻ về cột cũ là phép **hoàn lại ảnh chụp** của `onError` — lần
     * `invalidateQueries` của `onSettled` còn đang treo.
     */
    kho.choGet = new Promise<unknown>(() => {
      /* không bao giờ mở — lượt đọc treo suốt ca này */
    });

    await userEvent.selectOptions(await moPanel('SAI-1'), 'done');

    // Lý do đi **nguyên văn** từ máy chủ, không một câu web tự viết.
    await vi.waitFor(() => {
      expect(screen.getByText(LY_DO)).toBeTruthy();
    });
    // Và thẻ bật về **đúng** cột cũ, **trước** khi có bất kỳ dữ liệu mới nào.
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-cot="in_progress"] [data-the-ticket="SAI-1"]'),
      ).not.toBeNull();
    });
    expect(document.querySelector('[data-cot="done"] [data-the-ticket="SAI-1"]')).toBeNull();
  });

  /*
   * BAT-64 (T-111 A): cột Backlog không có đường riêng — vào nó đi qua cùng mutation
   * `keo` (kéo thả, panel, phím `S`). Máy chủ từ chối (vd mở lại ticket đã kết mà
   * không phải chủ, SPEC mục 4) ⇒ thẻ về cột cũ + toast nguyên văn, như mọi cột.
   */
  it('BAT-64: sang Backlog bị máy chủ từ chối ⇒ thẻ VỀ CỘT CŨ (Xong), toast lý do máy chủ, gửi đúng `backlog`', async () => {
    const TU_CHOI = 'Mở lại ticket đã kết chỉ chủ làm được (SPEC mục 4).';
    const { may, kho } = mayTicket(
      manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'done', nhom_trang_thai: 'closed' })]),
    );
    kho.loi = { error: 'FORBIDDEN', message: TU_CHOI };

    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-cot="done"] [data-the-ticket="SAI-1"]')).not.toBeNull();
    });
    kho.choGet = new Promise<unknown>(() => {
      /* lượt đọc treo: chỉ phép hoàn lại của `onError` đưa được thẻ về */
    });

    await userEvent.selectOptions(await moPanel('SAI-1'), 'backlog');

    await vi.waitFor(() => {
      expect(screen.getByText(TU_CHOI)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-cot="done"] [data-the-ticket="SAI-1"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-cot="backlog"] [data-the-ticket="SAI-1"]')).toBeNull();
    expect(may.da_goi.find((l) => l.duong.includes('/trang-thai'))?.than).toEqual({
      trang_thai: 'backlog',
    });
  });

  it('máy chủ nhận ⇒ gọi đúng đường, đúng thân, và KHÔNG có toast lỗi', async () => {
    const { may, kho } = mayTicket(
      manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'verifying' })]),
    );
    kho.loi = null;
    // Máy chủ đã nhận ⇒ lượt tải lại sau đó trả bản mới.
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-the-ticket="SAI-1"]')).not.toBeNull();
    });

    kho.trang = manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'done' })]);
    await userEvent.selectOptions(await moPanel('SAI-1'), 'done');

    await vi.waitFor(() => {
      const goi = may.da_goi.find((l) => l.duong.includes('/trang-thai'));
      expect(goi?.duong).toBe('/v1/ticket/tk-SAI-1/trang-thai');
      expect(goi?.than).toEqual({ trang_thai: 'done' });
    });
    expect(screen.queryByText(LY_DO)).toBeNull();
  });
});

/* ================================================================== *
 * F2. d.404 — BA đường đổi trạng thái, và KHÔNG có ô "Chuyển cột"
 * ================================================================== */

describe('d.404 — thẻ KHÔNG có ô "Chuyển cột"; ba đường còn lại đều sống', () => {
  it('không một ô "Chuyển cột" nào trên bảng (cũng không trên danh sách)', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'in_progress' })]));
    const { unmount } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');
    expect(document.querySelector('[data-chuyen-cot]')).toBeNull();
    unmount();

    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');
    expect(document.querySelector('[data-chuyen-cot]')).toBeNull();
  });

  it('đường 2 — PANEL: ô trạng thái có đủ BẢY giá trị (không mất trạng thái nào)', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'in_progress' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');

    const o = await moPanel('SAI-1');
    expect([...o.options].map((x) => x.value)).toEqual([...TRANG_THAI_THEO_THU_TU]);
    expect(o.value).toBe('in_progress');
  });

  it('đường 3 — PHÍM `S`: con trỏ vào ô trạng thái của thẻ đang chọn, rồi đổi được', async () => {
    const { may } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'in_progress' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');

    await userEvent.keyboard('s');
    const o = await vi.waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>('[data-trang-thai-panel="SAI-1"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(document.activeElement).toBe(o);

    // Và từ đó đổi được thật — cùng đường mutation, cùng thân.
    await userEvent.selectOptions(o, 'verifying');
    await vi.waitFor(() => {
      const goi = may.da_goi.find((l) => l.duong.includes('/trang-thai'));
      expect(goi?.than).toEqual({ trang_thai: 'verifying' });
    });
  });

  it('`S` khi CHƯA chọn thẻ nào ⇒ không làm gì (d.415 nói "ticket đang chọn")', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'in_progress' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');

    await userEvent.keyboard('s');
    expect(document.querySelector('[data-o="panel-the"]')).toBeNull();
  });

  it('ĐANG GÕ trong ô nhập thì `s` là chữ `s`, không phải phím tắt', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'in_progress' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await moMenuLoc();

    const o = document.querySelector<HTMLInputElement>(`[data-loc="${KHOA_LOC_TICKET.nhan}"]`)!;
    await userEvent.type(o, 'sos');
    expect(o.value).toBe('sos');
  });
});

describe('d.415 — phím `P`: ưu tiên của ticket đang chọn', () => {
  const o_ut = (ma: string): HTMLSelectElement | null =>
    document.querySelector<HTMLSelectElement>(`[data-uu-tien-panel="${ma}"]`);
  const ut_cua = (ma: string): string | null =>
    document.querySelector(`[data-the-ticket="${ma}"] [data-o="uu-tien"]`)?.getAttribute('data-uu-tien') ??
    null;

  it('`P` khi CHƯA chọn thẻ ⇒ không làm gì', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');
    await userEvent.keyboard('p');
    expect(document.querySelector('[data-o="panel-the"]')).toBeNull();
  });

  it('`P` khi có thẻ chọn ⇒ panel mở, ô ưu tiên được focus, đủ năm giá trị', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'high' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('P');
    const o = await vi.waitFor(() => {
      const el = o_ut('SAI-1');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(document.activeElement).toBe(o);
    expect(o.value).toBe('high');
    expect([...o.options].map((x) => x.value)).toEqual([...UU_TIEN_THEO_THU_TU]);
  });

  it('`P` gõ trong ô input ⇒ không bắt; Ctrl+P / Meta+P ⇒ không bắt', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await moMenuLoc();
    const o = document.querySelector<HTMLInputElement>(`[data-loc="${KHOA_LOC_TICKET.nhan}"]`)!;
    await userEvent.type(o, 'pp');
    expect(o.value).toBe('pp');
    // Panel đã mở (thẻ đang chọn); "không bắt" = con trỏ KHÔNG bị kéo sang ô ưu tiên.
    expect(document.activeElement).toBe(o);
    expect(document.activeElement).not.toBe(o_ut('SAI-1'));

    o.blur();
    await userEvent.keyboard('{Control>}p{/Control}');
    expect(document.activeElement).not.toBe(o_ut('SAI-1'));
    await userEvent.keyboard('{Meta>}p{/Meta}');
    expect(document.activeElement).not.toBe(o_ut('SAI-1'));
    // Đối chứng: `p` trần ngoài ô nhập thì CÓ kéo con trỏ vào ô ưu tiên.
    await userEvent.keyboard('p');
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(o_ut('SAI-1'));
    });
  });

  it('phím trong phần tử con của contenteditable không bị bắt; đang soạn IME cũng không', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    const vung = document.createElement('div');
    vung.setAttribute('contenteditable', 'true');
    const con = document.createElement('span');
    vung.appendChild(con);
    document.body.appendChild(vung);
    // `fireEvent` trả `false` khi có ai `preventDefault` — tức phím đã bị bắt.
    const khong_bat = (muc: Element, init: KeyboardEventInit): void => {
      expect(fireEvent.keyDown(muc, init)).toBe(true);
      expect(document.activeElement).not.toBe(o_ut('SAI-1'));
    };
    try {
      khong_bat(con, { key: 'p' });
    } finally {
      vung.remove();
    }
    khong_bat(document.body, { key: 'p', isComposing: true });
    khong_bat(document.body, { key: 'p', keyCode: 229 });
    // Đối chứng: cùng phím ngoài các ca trên thì bị bắt.
    expect(fireEvent.keyDown(document.body, { key: 'p' })).toBe(false);
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(o_ut('SAI-1'));
    });
  });

  it('đổi ưu tiên: thẻ đổi NGAY trước khi máy chủ trả lời, gọi PATCH { uu_tien }', async () => {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
    let mo: () => void = () => undefined;
    kho.cho = new Promise<unknown>((res) => {
      mo = () => res(null);
    });
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('p');
    const o = await vi.waitFor(() => {
      const el = o_ut('SAI-1');
      expect(el).not.toBeNull();
      return el!;
    });
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.selectOptions(o, 'urgent');
    await vi.waitFor(() => {
      expect(ut_cua('SAI-1')).toBe('urgent');
    });
    const goi = may.da_goi.find((l) => l.method === 'PATCH');
    expect(goi?.duong).toBe('/v1/ticket/tk-SAI-1');
    expect(goi?.than).toEqual({ uu_tien: 'urgent' });
    mo();
  });

  it('chọn lại đúng giá trị đang có ⇒ không gọi máy chủ', async () => {
    const { may } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('p');
    const o = await vi.waitFor(() => {
      const el = o_ut('SAI-1');
      expect(el).not.toBeNull();
      return el!;
    });
    await userEvent.selectOptions(o, 'low');
    expect(may.da_goi.some((l) => l.method === 'PATCH')).toBe(false);
  });

  it('máy chủ lỗi ⇒ hoàn lại ưu tiên cũ + toast nguyên văn', async () => {
    const LOI = 'Không đổi được ưu tiên: ticket đã đóng.';
    const { kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
    kho.loi = { error: 'FORBIDDEN', message: LOI };
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('p');
    const o = await vi.waitFor(() => {
      const el = o_ut('SAI-1');
      expect(el).not.toBeNull();
      return el!;
    });
    // Lượt đọc treo: chỉ phép hoàn ảnh chụp mới đưa được thẻ về `low`.
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.selectOptions(o, 'urgent');
    await vi.waitFor(() => {
      expect(screen.getByText(LOI)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(ut_cua('SAI-1')).toBe('low');
    });
  });
});

describe('BAT-24 — phím S/P/L: làm mới chi tiết, cờ focus, hoàn bằng phép ngược, đang gửi theo thẻ', () => {
  const o_ut = (ma: string): HTMLSelectElement | null =>
    document.querySelector<HTMLSelectElement>(`[data-uu-tien-panel="${ma}"]`);
  const o_tt = (ma: string): HTMLSelectElement | null =>
    document.querySelector<HTMLSelectElement>(`[data-trang-thai-panel="${ma}"]`);
  const ut_cua = (ma: string): string | null =>
    document.querySelector(`[data-the-ticket="${ma}"] [data-o="uu-tien"]`)?.getAttribute('data-uu-tien') ??
    null;
  const cho_o = async (lay: () => HTMLSelectElement | null): Promise<HTMLSelectElement> =>
    await vi.waitFor(() => {
      const el = lay();
      expect(el).not.toBeNull();
      return el!;
    });
  const cua = (): { cho: Promise<unknown>; mo: () => void } => {
    let mo: () => void = () => undefined;
    const cho = new Promise<unknown>((res) => {
      mo = () => res(null);
    });
    return { cho, mo };
  };
  const so_lan_doc_chi_tiet = (may: MayChuGia, ma: string): number =>
    may.da_goi.filter((l) => l.method === 'GET' && l.duong === `/v1/man-hinh-ticket/ma/${ma}`).length;
  const bo_focus = (): void => {
    (document.activeElement as HTMLElement | null)?.blur();
  };

  it('`P` xong ⇒ khoá chi tiết của thẻ được đọc lại (không chỉ danh sách)', async () => {
    const { may } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('p');
    const o = await cho_o(() => o_ut('SAI-1'));
    await vi.waitFor(() => {
      expect(so_lan_doc_chi_tiet(may, 'SAI-1')).toBe(1);
    });
    await userEvent.selectOptions(o, 'urgent');
    await vi.waitFor(() => {
      expect(so_lan_doc_chi_tiet(may, 'SAI-1')).toBe(2);
    });
  });

  it('`S` xong ⇒ khoá chi tiết của thẻ được đọc lại', async () => {
    const { may } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'todo' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('s');
    const o = await cho_o(() => o_tt('SAI-1'));
    await vi.waitFor(() => {
      expect(so_lan_doc_chi_tiet(may, 'SAI-1')).toBe(1);
    });
    await userEvent.selectOptions(o, 'in_progress');
    await vi.waitFor(() => {
      expect(so_lan_doc_chi_tiet(may, 'SAI-1')).toBe(2);
    });
  });

  for (const phim of ['s', 'p', 'l'] as const) {
    it(`thẻ đang chọn KHÔNG có trong trang: \`${phim}\` rồi \`J\` ⇒ focus không bị kéo nhầm vào ô của panel`, async () => {
      mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })]));
      dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-9');
      await choTai('SAI-1');
      await userEvent.keyboard(phim);
      // Panel của thẻ vắng mặt không có ô nào để focus.
      expect(o_tt('SAI-9')).toBeNull();
      await userEvent.keyboard('j');
      await vi.waitFor(() => {
        expect(o_tt('SAI-1')).not.toBeNull();
      });
      // Như khi không có cờ: focus không vào ô trạng thái / ưu tiên / nhãn.
      expect(document.activeElement).not.toBe(o_tt('SAI-1'));
      expect(document.activeElement).not.toBe(o_ut('SAI-1'));
      expect(document.activeElement).not.toBe(document.querySelector('[data-o="them-nhan"]'));
    });
  }

  it('hai thẻ: A lỗi, B nhận ⇒ chỉ A được hoàn; A đang gửi không làm B hiện "đang gửi"', async () => {
    const LOI = 'Không đổi được ưu tiên của A.';
    const { kho } = mayTicket(
      manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' }), dong({ ma: 'SAI-2', uu_tien: 'low' })]),
    );
    const c1 = cua();
    const c2 = cua();
    kho.hang_patch = [
      { loi: { error: 'FORBIDDEN', message: LOI }, cho: c1.cho },
      { loi: null, cho: c2.cho },
    ];
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('p');
    const a = await cho_o(() => o_ut('SAI-1'));
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.selectOptions(a, 'urgent');
    await vi.waitFor(() => {
      expect(a.getAttribute('data-dang-gui')).toBe('co');
    });

    bo_focus();
    await userEvent.keyboard('j');
    const b = await cho_o(() => o_ut('SAI-2'));
    // A còn bay mà B không hiện "đang gửi".
    expect(b.getAttribute('data-dang-gui')).toBe('khong');
    expect(b.getAttribute('aria-busy')).toBe('false');
    await userEvent.selectOptions(b, 'high');
    await vi.waitFor(() => {
      expect(b.getAttribute('data-dang-gui')).toBe('co');
    });

    c1.mo();
    await vi.waitFor(() => {
      expect(screen.getByText(LOI)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(ut_cua('SAI-1')).toBe('low');
    });
    // B (còn bay) không bị hoàn theo.
    expect(ut_cua('SAI-2')).toBe('high');
    c2.mo();
    await new Promise((r) => setTimeout(r, 50));
    expect(ut_cua('SAI-2')).toBe('high');
  });

  it('hai trường của một thẻ: trạng thái lỗi, ưu tiên nhận ⇒ chỉ trạng thái được hoàn', async () => {
    const LOI = 'Chưa đủ bằng chứng.';
    const { kho } = mayTicket(
      manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low', trang_thai: 'todo' })]),
    );
    const c1 = cua();
    const c2 = cua();
    kho.hang_tt = [{ loi: { error: 'EVIDENCE_REQUIRED', message: LOI }, cho: c1.cho }];
    kho.hang_patch = [{ loi: null, cho: c2.cho }];
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('s');
    const tt = await cho_o(() => o_tt('SAI-1'));
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.selectOptions(tt, 'done');
    await vi.waitFor(() => {
      expect(tt.value).toBe('done');
    });
    const ut = await cho_o(() => o_ut('SAI-1'));
    await userEvent.selectOptions(ut, 'urgent');
    await vi.waitFor(() => {
      expect(ut_cua('SAI-1')).toBe('urgent');
    });

    c1.mo();
    await vi.waitFor(() => {
      expect(screen.getByText(LOI)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(o_tt('SAI-1')?.value).toBe('todo');
    });
    expect(ut_cua('SAI-1')).toBe('urgent');
    c2.mo();
  });

  it('cùng một trường, hai lần đổi: lần 1 lỗi khi lần 2 đã ghi đè ⇒ không hoàn đè lên lần 2', async () => {
    const LOI = 'Lỗi lần một.';
    const { kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
    const c1 = cua();
    const c2 = cua();
    kho.hang_patch = [
      { loi: { error: 'FORBIDDEN', message: LOI }, cho: c1.cho },
      { loi: null, cho: c2.cho },
    ];
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('p');
    const o = await cho_o(() => o_ut('SAI-1'));
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.selectOptions(o, 'urgent');
    await userEvent.selectOptions(o, 'high');
    await vi.waitFor(() => {
      expect(ut_cua('SAI-1')).toBe('high');
    });
    c1.mo();
    await vi.waitFor(() => {
      expect(screen.getByText(LOI)).toBeTruthy();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(ut_cua('SAI-1')).toBe('high');
    c2.mo();
  });

  /*
   * **Khoá DANH SÁCH dùng chung cho mọi thẻ** ⇒ chỉ làm mới khi không còn thao
   * tác S/P/L nào đang bay trên BẤT KỲ thẻ nào (d.418: sửa hiện ngay, không nhấp
   * nháy). Khác các ca trên, lượt GET ở đây **thật sự về** và mang dữ liệu máy
   * chủ CHƯA có thao tác của A — nên một lần làm mới sớm sẽ xoá kết quả lạc quan
   * của A. Ca kết bằng A xong ⇒ danh sách làm mới đúng (máy chủ có thêm một thay
   * đổi khác để chứng minh lượt đọc đã chạy).
   */
  const nhan_the = (ma: string): string[] =>
    [...document.querySelectorAll(`[data-the-ticket="${ma}"] [data-nhan]`)].map(
      (e) => e.getAttribute('data-nhan') ?? '',
    );
  const tt_cua = (ma: string): string | null =>
    document.querySelector(`[data-the-ticket="${ma}"]`)?.getAttribute('data-trang-thai') ?? null;
  const so_lan_doc_ds = (may: MayChuGia): number =>
    may.da_goi.filter(
      (l) => l.method === 'GET' && l.duong.startsWith('/v1/man-hinh-ticket') && !l.duong.includes('/ma/'),
    ).length;

  it('hai thẻ bấm `L`: B xong trước khi A còn bay ⇒ GET danh sách KHÔNG xoá nhãn của A; A xong ⇒ làm mới', async () => {
    const { may, kho } = mayTicket(
      manHinhDanhSach([dong({ ma: 'SAI-1', nhan: [] }), dong({ ma: 'SAI-2', nhan: [] })]),
    );
    const cA = cua();
    const cB = cua();
    kho.hang_nhan = [
      { loi: null, cho: cA.cho },
      { loi: null, cho: cB.cho },
    ];
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('l');
    const oA = await cho_o(() => document.querySelector<HTMLSelectElement>('[data-o="them-nhan"]'));
    await userEvent.type(oA, 'x{Enter}');
    await vi.waitFor(() => {
      expect(nhan_the('SAI-1')).toEqual(['x']);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-2' }));
    await cho_o(() => o_tt('SAI-2'));
    await userEvent.keyboard('l');
    const oB = await cho_o(() => document.querySelector<HTMLSelectElement>('[data-o="them-nhan"]'));
    await userEvent.type(oB, 'y{Enter}');
    await vi.waitFor(() => {
      expect(nhan_the('SAI-2')).toEqual(['y']);
    });

    // Máy chủ: đã nhận B, CHƯA nhận A.
    kho.trang = manHinhDanhSach([dong({ ma: 'SAI-1', nhan: [] }), dong({ ma: 'SAI-2', nhan: ['y'] })]);
    const doc_truoc = so_lan_doc_ds(may);
    cB.mo();
    await new Promise((r) => setTimeout(r, 100));
    expect(nhan_the('SAI-1')).toEqual(['x']);
    expect(nhan_the('SAI-2')).toEqual(['y']);
    expect(so_lan_doc_ds(may)).toBe(doc_truoc);

    // A xong ⇒ danh sách làm mới (máy chủ có thêm `z` ở B do agent thêm).
    kho.trang = manHinhDanhSach([
      dong({ ma: 'SAI-1', nhan: ['x'] }),
      dong({ ma: 'SAI-2', nhan: ['y', 'z'] }),
    ]);
    cA.mo();
    await vi.waitFor(() => {
      expect(nhan_the('SAI-2')).toEqual(['y', 'z']);
    });
    expect(nhan_the('SAI-1')).toEqual(['x']);
    expect(so_lan_doc_ds(may)).toBeGreaterThan(doc_truoc);
  });

  it('`S` thẻ A còn bay, `P` thẻ B xong ⇒ GET danh sách KHÔNG ghi đè trạng thái của A; A xong ⇒ làm mới', async () => {
    const { may, kho } = mayTicket(
      manHinhDanhSach([
        dong({ ma: 'SAI-1', trang_thai: 'todo', uu_tien: 'low' }),
        dong({ ma: 'SAI-2', trang_thai: 'todo', uu_tien: 'low' }),
      ]),
    );
    const cA = cua();
    const cB = cua();
    kho.hang_tt = [{ loi: null, cho: cA.cho }];
    kho.hang_patch = [{ loi: null, cho: cB.cho }];
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('s');
    const tt = await cho_o(() => o_tt('SAI-1'));
    await userEvent.selectOptions(tt, 'in_progress');
    await vi.waitFor(() => {
      expect(tt_cua('SAI-1')).toBe('in_progress');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-2' }));
    const ut = await cho_o(() => o_ut('SAI-2'));
    await userEvent.selectOptions(ut, 'high');
    await vi.waitFor(() => {
      expect(ut_cua('SAI-2')).toBe('high');
    });

    // Máy chủ: đã nhận P của B, CHƯA nhận S của A.
    kho.trang = manHinhDanhSach([
      dong({ ma: 'SAI-1', trang_thai: 'todo', uu_tien: 'low' }),
      dong({ ma: 'SAI-2', trang_thai: 'todo', uu_tien: 'high' }),
    ]);
    const doc_truoc = so_lan_doc_ds(may);
    cB.mo();
    await new Promise((r) => setTimeout(r, 100));
    expect(tt_cua('SAI-1')).toBe('in_progress');
    expect(ut_cua('SAI-2')).toBe('high');
    expect(so_lan_doc_ds(may)).toBe(doc_truoc);

    // A xong ⇒ làm mới (máy chủ có thêm một đổi của agent ở B).
    kho.trang = manHinhDanhSach([
      dong({ ma: 'SAI-1', trang_thai: 'in_progress', uu_tien: 'low' }),
      dong({ ma: 'SAI-2', trang_thai: 'todo', uu_tien: 'urgent' }),
    ]);
    cA.mo();
    await vi.waitFor(() => {
      expect(ut_cua('SAI-2')).toBe('urgent');
    });
    expect(tt_cua('SAI-1')).toBe('in_progress');
    expect(so_lan_doc_ds(may)).toBeGreaterThan(doc_truoc);
  });

  /*
   * **BAT-25 việc 1 — nhịp `refetchInterval` của chính query (một trang) tắt khi
   * còn thao tác S/P/L đang bay.** Thao tác treo ⇒ không GET danh sách nào, giá trị
   * lạc quan đứng nguyên; thả ⇒ làm mới đúng một lần, rồi nhịp chạy lại.
   */
  const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it(
    'một trang, thao tác `P` treo ≥ 2 chu kỳ ⇒ KHÔNG có GET danh sách, giá trị lạc quan đứng; thả ⇒ làm mới, rồi nhịp chạy lại',
    async () => {
      const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
      const c = cua();
      kho.hang_patch = [{ loi: null, cho: c.cho }];
      dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
      await choTai('SAI-1');
      await userEvent.keyboard('p');
      const o = await cho_o(() => o_ut('SAI-1'));
      await userEvent.selectOptions(o, 'urgent');
      await vi.waitFor(() => {
        expect(ut_cua('SAI-1')).toBe('urgent');
      });

      // Máy chủ CHƯA có thao tác (đang treo): mọi GET lọt ra sẽ trả 'low' và đè.
      const doc_truoc = so_lan_doc_ds(may);
      await doi(2 * CHU_KY_LAM_MOI_MS + 300);
      expect(so_lan_doc_ds(may)).toBe(doc_truoc);
      expect(ut_cua('SAI-1')).toBe('urgent');

      // Thả: máy chủ đã nhận ⇒ một lần làm mới.
      kho.trang = manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'urgent' })]);
      c.mo();
      await vi.waitFor(() => {
        expect(so_lan_doc_ds(may)).toBe(doc_truoc + 1);
      });
      expect(ut_cua('SAI-1')).toBe('urgent');

      // Nhịp bật lại: thêm một chu kỳ ⇒ có GET.
      const sau_tha = so_lan_doc_ds(may);
      await vi.waitFor(
        () => {
          expect(so_lan_doc_ds(may)).toBeGreaterThan(sau_tha);
        },
        { timeout: 2 * CHU_KY_LAM_MOI_MS + 1000 },
      );
    },
    20_000,
  );

  it(
    'thao tác lỗi cũng bật nhịp lại (nhánh `onError`)',
    async () => {
      const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
      const c = cua();
      kho.hang_patch = [{ loi: { error: 'FORBIDDEN', message: 'Không được.' }, cho: c.cho }];
      dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
      await choTai('SAI-1');
      await userEvent.keyboard('p');
      const o = await cho_o(() => o_ut('SAI-1'));
      await userEvent.selectOptions(o, 'urgent');
      await vi.waitFor(() => {
        expect(ut_cua('SAI-1')).toBe('urgent');
      });
      c.mo();
      await vi.waitFor(() => {
        expect(screen.getByText('Không được.')).toBeTruthy();
      });
      await vi.waitFor(() => {
        expect(ut_cua('SAI-1')).toBe('low');
      });
      const sau = so_lan_doc_ds(may);
      await vi.waitFor(
        () => {
          expect(so_lan_doc_ds(may)).toBeGreaterThan(sau);
        },
        { timeout: 2 * CHU_KY_LAM_MOI_MS + 1000 },
      );
    },
    20_000,
  );

  /*
   * **BAT-25 việc 2 — hai thao tác xong cùng một nhịp ⇒ đúng MỘT lần làm mới.**
   */
  it('một thao tác đơn lẻ xong ⇒ đúng một GET danh sách và một GET chi tiết thêm', async () => {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
    const c = cua();
    kho.hang_patch = [{ loi: null, cho: c.cho }];
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('p');
    const o = await cho_o(() => o_ut('SAI-1'));
    await vi.waitFor(() => {
      expect(so_lan_doc_chi_tiet(may, 'SAI-1')).toBe(1);
    });
    await userEvent.selectOptions(o, 'urgent');
    const ds_truoc = so_lan_doc_ds(may);
    c.mo();
    await vi.waitFor(() => {
      expect(so_lan_doc_chi_tiet(may, 'SAI-1')).toBe(2);
    });
    await doi(300);
    expect(so_lan_doc_ds(may) - ds_truoc).toBe(1);
    expect(so_lan_doc_chi_tiet(may, 'SAI-1')).toBe(2);
  });

  it('`S` thẻ A và `P` thẻ B được trả lời cùng một lúc ⇒ danh sách làm mới đúng 1 lần (không 0, không 2); chi tiết thẻ B đúng 1', async () => {
    const { may, kho } = mayTicket(
      manHinhDanhSach([
        dong({ ma: 'SAI-1', trang_thai: 'todo', uu_tien: 'low' }),
        dong({ ma: 'SAI-2', trang_thai: 'todo', uu_tien: 'low' }),
      ]),
    );
    const cA = cua();
    const cB = cua();
    kho.hang_tt = [{ loi: null, cho: cA.cho }];
    kho.hang_patch = [{ loi: null, cho: cB.cho }];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    const goi_invalidate = vi.spyOn(qc, 'invalidateQueries');
    const so_lan_lam_moi_chi_tiet = (ma: string): number =>
      goi_invalidate.mock.calls.filter((g) => {
        const k = (g[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
        return k?.length === 3 && k[0] === 'ticket' && k[1] === 'chi-tiet' && k[2] === ma;
      }).length;
    await choTai('SAI-1');
    await userEvent.keyboard('s');
    const tt = await cho_o(() => o_tt('SAI-1'));
    await userEvent.selectOptions(tt, 'in_progress');
    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-2' }));
    const ut = await cho_o(() => o_ut('SAI-2'));
    await vi.waitFor(() => {
      expect(so_lan_doc_chi_tiet(may, 'SAI-2')).toBe(1);
    });
    await userEvent.selectOptions(ut, 'high');
    await vi.waitFor(() => {
      expect(ut_cua('SAI-2')).toBe('high');
    });
    expect(tt_cua('SAI-1')).toBe('in_progress');

    kho.trang = manHinhDanhSach([
      dong({ ma: 'SAI-1', trang_thai: 'in_progress', uu_tien: 'low' }),
      dong({ ma: 'SAI-2', trang_thai: 'todo', uu_tien: 'high' }),
    ]);
    const ds_truoc = so_lan_doc_ds(may);
    expect(so_lan_lam_moi_chi_tiet('SAI-1')).toBe(0);
    expect(so_lan_lam_moi_chi_tiet('SAI-2')).toBe(0);
    cA.mo();
    cB.mo();
    await vi.waitFor(() => {
      expect(so_lan_doc_chi_tiet(may, 'SAI-2')).toBe(2);
    });
    await doi(400);
    expect(so_lan_doc_ds(may) - ds_truoc).toBe(1);
    expect(so_lan_doc_chi_tiet(may, 'SAI-2')).toBe(2);
    // Khoá chi tiết theo THẺ: mỗi thẻ được làm mới đúng một lần, kể cả thẻ A (không
    // phải thẻ xong sau cùng, và lúc A xong tổng còn > 0).
    expect(so_lan_lam_moi_chi_tiet('SAI-1')).toBe(1);
    expect(so_lan_lam_moi_chi_tiet('SAI-2')).toBe(1);
  });

  it('hai thao tác `L` cùng thẻ được trả lời cùng một lúc ⇒ danh sách làm mới đúng 1 lần', async () => {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: [] })]));
    const c1 = cua();
    const c2 = cua();
    kho.hang_nhan = [
      { loi: null, cho: c1.cho },
      { loi: null, cho: c2.cho },
    ];
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('l');
    const oA = await cho_o(() => document.querySelector<HTMLSelectElement>('[data-o="them-nhan"]'));
    await userEvent.type(oA, 'x{Enter}');
    await userEvent.type(oA, 'y{Enter}');
    await vi.waitFor(() => {
      expect(nhan_the('SAI-1')).toEqual(['x', 'y']);
    });
    kho.trang = manHinhDanhSach([dong({ ma: 'SAI-1', nhan: ['x', 'y'] })]);
    const ds_truoc = so_lan_doc_ds(may);
    c1.mo();
    c2.mo();
    await vi.waitFor(() => {
      expect(so_lan_doc_ds(may)).toBeGreaterThan(ds_truoc);
    });
    await doi(400);
    expect(so_lan_doc_ds(may) - ds_truoc).toBe(1);
  });
});

describe('d.415 — phím `L`: nhãn của ticket đang chọn (d.418 sửa hiện ngay)', () => {
  const o_nhan = (): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>('[data-o="them-nhan"]');
  const nhan_the = (ma: string): string[] =>
    [...document.querySelectorAll(`[data-the-ticket="${ma}"] [data-nhan]`)].map(
      (e) => e.getAttribute('data-nhan') ?? '',
    );
  const goi_nhan = (may: MayChuGia): { duong: string; than: unknown }[] =>
    may.da_goi.filter((l) => l.method === 'POST' && l.duong.endsWith('/nhan'));
  const choONhan = async (): Promise<HTMLInputElement> =>
    await vi.waitFor(() => {
      const el = o_nhan();
      expect(el).not.toBeNull();
      return el!;
    });
  /** Một cửa đóng: `mo()` mới cho câu trả lời đi. */
  const cua = (): { cho: Promise<unknown>; mo: () => void } => {
    let mo: () => void = () => undefined;
    const cho = new Promise<unknown>((res) => {
      mo = () => res(null);
    });
    return { cho, mo };
  };

  it('`L` khi CHƯA chọn thẻ ⇒ không làm gì', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');
    await userEvent.keyboard('l');
    expect(document.querySelector('[data-o="panel-the"]')).toBeNull();
    expect(o_nhan()).toBeNull();
  });

  it('`L` khi có thẻ chọn ⇒ panel mở, ô "Thêm nhãn" được focus, chữ `l` KHÔNG rơi vào ô', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: ['sos'] })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('L');
    const o = await choONhan();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(o);
    });
    expect(o.value).toBe('');
    // Khối nhãn của panel liệt kê nhãn đang có, mỗi nhãn một nút bỏ có nhãn rõ.
    expect(document.querySelector('[data-nhan-panel="sos"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Bỏ nhãn sos' })).toBeTruthy();
  });

  it('`L` gõ trong ô input ⇒ không bắt; Ctrl+L / Meta+L ⇒ không bắt', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await moMenuLoc();
    const o = document.querySelector<HTMLInputElement>(`[data-loc="${KHOA_LOC_TICKET.nhan}"]`)!;
    await userEvent.type(o, 'll');
    expect(o.value).toBe('ll');
    // Panel đã mở (thẻ đang chọn); "không bắt" = con trỏ KHÔNG bị kéo sang ô nhãn.
    expect(document.activeElement).toBe(o);

    o.blur();
    await userEvent.keyboard('{Control>}l{/Control}');
    expect(document.activeElement).not.toBe(o_nhan());
    await userEvent.keyboard('{Meta>}l{/Meta}');
    expect(document.activeElement).not.toBe(o_nhan());
    // Đối chứng: `l` trần ngoài ô nhập thì CÓ kéo con trỏ vào ô nhãn.
    await userEvent.keyboard('l');
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(o_nhan());
    });
  });

  it('đang soạn IME / trong contenteditable ⇒ không bắt (có đối chứng)', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    const vung = document.createElement('div');
    vung.setAttribute('contenteditable', 'true');
    const con = document.createElement('span');
    vung.appendChild(con);
    document.body.appendChild(vung);
    const khong_bat = (muc: Element, init: KeyboardEventInit): void => {
      expect(fireEvent.keyDown(muc, init)).toBe(true);
      expect(document.activeElement).not.toBe(o_nhan());
    };
    try {
      khong_bat(con, { key: 'l' });
    } finally {
      vung.remove();
    }
    khong_bat(document.body, { key: 'l', isComposing: true });
    khong_bat(document.body, { key: 'l', keyCode: 229 });
    expect(fireEvent.keyDown(document.body, { key: 'l' })).toBe(false);
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(o_nhan());
    });
  });

  it('thêm nhãn: thẻ hiện nhãn NGAY trước khi máy chủ trả lời, gọi POST .../nhan { nhan, gan: true }', async () => {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: ['sos'] })]));
    const c = cua();
    kho.cho = c.cho;
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('l');
    const o = await choONhan();
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.type(o, '  ui  {Enter}');
    await vi.waitFor(() => {
      expect(nhan_the('SAI-1')).toEqual(['sos', 'ui']);
    });
    expect(o.value).toBe('');
    expect(goi_nhan(may)).toEqual([
      { duong: '/v1/ticket/tk-SAI-1/nhan', method: 'POST', than: { nhan: 'ui', gan: true } },
    ]);
    c.mo();
  });

  it('bỏ nhãn: biến mất NGAY, gọi { nhan, gan: false }', async () => {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: ['sos', 'ui'] })]));
    const c = cua();
    kho.cho = c.cho;
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await choONhan();
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ nhãn sos' }));
    await vi.waitFor(() => {
      expect(nhan_the('SAI-1')).toEqual(['ui']);
    });
    expect(goi_nhan(may).map((l) => l.than)).toEqual([{ nhan: 'sos', gan: false }]);
    c.mo();
  });

  it('gắn nhãn ĐÃ CÓ / ô trống / chỉ khoảng trắng ⇒ không gọi máy chủ', async () => {
    const { may } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: ['sos'] })]));
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('l');
    const o = await choONhan();
    await userEvent.type(o, '{Enter}');
    await userEvent.type(o, '   {Enter}');
    await userEvent.type(o, 'sos{Enter}');
    await userEvent.type(o, ' sos {Enter}');
    expect(goi_nhan(may)).toEqual([]);
    expect(nhan_the('SAI-1')).toEqual(['sos']);
  });

  it('máy chủ từ chối GẮN ⇒ nhãn biến mất lại + toast nguyên văn', async () => {
    const LOI = 'Nhãn phải có 1–40 ký tự.';
    const { kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: ['sos'] })]));
    kho.loi = { error: 'INVALID_INPUT', message: LOI };
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('l');
    const o = await choONhan();
    // Lượt đọc treo: chỉ phép hoàn lại của mã mới đưa thẻ về trạng thái cũ.
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.type(o, 'ui{Enter}');
    await vi.waitFor(() => {
      expect(screen.getByText(LOI)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(nhan_the('SAI-1')).toEqual(['sos']);
    });
  });

  it('máy chủ từ chối BỎ ⇒ nhãn về ĐÚNG chỗ cũ + toast nguyên văn', async () => {
    const LOI = 'Dự án đã lưu trữ, không sửa được.';
    const { kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: ['a', 'b', 'c'] })]));
    kho.loi = { error: 'PROJECT_ARCHIVED', message: LOI };
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await choONhan();
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ nhãn b' }));
    await vi.waitFor(() => {
      expect(screen.getByText(LOI)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(nhan_the('SAI-1')).toEqual(['a', 'b', 'c']);
    });
  });

  it('hai thao tác liên tiếp: thao tác 1 LỖI, thao tác 2 nhận ⇒ còn nhãn của thao tác 2', async () => {
    const LOI = 'Không gắn được nhãn x.';
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: [] })]));
    const c1 = cua();
    const c2 = cua();
    kho.hang_nhan = [
      { loi: { error: 'INVALID_INPUT', message: LOI }, cho: c1.cho },
      { loi: null, cho: c2.cho },
    ];
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await userEvent.keyboard('l');
    const o = await choONhan();
    kho.choGet = new Promise<unknown>(() => undefined);
    await userEvent.type(o, 'x{Enter}');
    await userEvent.type(o, 'y{Enter}');
    await vi.waitFor(() => {
      expect(nhan_the('SAI-1')).toEqual(['x', 'y']);
    });
    expect(goi_nhan(may).map((l) => l.than)).toEqual([
      { nhan: 'x', gan: true },
      { nhan: 'y', gan: true },
    ]);

    // Thao tác 1 lỗi TRONG KHI thao tác 2 còn bay: chỉ `x` được hoàn.
    c1.mo();
    await vi.waitFor(() => {
      expect(screen.getByText(LOI)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(nhan_the('SAI-1')).toEqual(['y']);
    });
    // Thao tác 2 nhận: kết quả cuối vẫn là `y` (lượt đọc treo, nên đây là cache của mã).
    c2.mo();
    await new Promise((r) => setTimeout(r, 50));
    expect(nhan_the('SAI-1')).toEqual(['y']);
  });
});

/* ================================================================== *
 * G. d.409 — 5.000 ticket cuộn mượt
 * ================================================================== */

describe('d.409 — danh sách ở mốc SPEC KHÔNG vẽ hết vào DOM', () => {
  const N = soTicketCuonMuotTuSpec();

  it(`${String(N)} ticket: số dòng vẽ ra nhỏ hơn hẳn ${String(N)}`, async () => {
    mayTicket(manHinhDanhSach(nhieuDong(N)));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await choTai('SAI-1');

    const ve = document.querySelectorAll('[data-chi-so]').length;
    // Bệ đỡ 720px / 56px ≈ 13 dòng + overscan. Trần 200 là rộng rãi nhưng vẫn
    // **đỏ ngay** nếu bộ ảo hoá bị bỏ (lúc đó là N + 7 dòng).
    expect(ve).toBeGreaterThan(0);
    expect(ve).toBeLessThan(200);
    // Lưới chống "xanh vì danh sách rỗng": dữ liệu thật sự có N dòng.
    expect(N).toBeGreaterThan(1000);
  });
});

/* ================================================================== *
 * H. d.410 — thay đổi do agent hiện trong 3 giây
 * ================================================================== */

describe('d.410 — ticket agent vừa đổi hiện lên, không tải lại trang', () => {
  it('chu kỳ hỏi lại NGẮN HƠN mốc của SPEC', () => {
    expect(CHU_KY_LAM_MOI_MS).toBeLessThan(hienThayDoiTuSpec().giay * 1000);
    expect(CHU_KY_LAM_MOI_MS).toBeGreaterThan(0);
  });

  it('ticket mới hiện lên sau một chu kỳ', async () => {
    vi.useFakeTimers();
    const { kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    dung(<TrangDanhSachTicket />, DUONG_DANH_SACH);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-ticket="SAI-9"]')).toBeNull();

    kho.trang = manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-9' })]);
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-9"]')).not.toBeNull();
    });
  });
});

/* ================================================================== *
 * I. d.396 — lưu thành view riêng
 * ================================================================== */

describe('d.396 — lưu thành view riêng', () => {
  it('lưu view rồi bấm lại ⇒ bộ lọc của view được áp (qua URL)', async () => {
    const kho = ganKho();
    const { may } = mayTicket();
    dung(<TrangDanhSachTicket />, '/ticket?uu_tien=urgent');
    await choTai('SAI-1');
    // d.407 — "Lưu thành view" nay **trong** menu "Lọc".
    await moMenuLoc();

    await userEvent.type(document.querySelector<HTMLInputElement>('[data-o="ten-view"]')!, 'Gấp');
    await userEvent.click(screen.getByRole('button', { name: NHAN_LUU_VIEW }));

    // View được ghi xuống kho, với **chuỗi truy vấn đang ở trên URL**.
    const luu: unknown = JSON.parse(kho.getItem(KHOA_VIEW_DA_LUU) ?? '[]');
    expect(luu).toEqual([{ ten: 'Gấp', truy_van: 'uu_tien=urgent' }]);

    // Đổi sang bộ lọc khác, rồi bấm view ⇒ bộ lọc của view quay lại.
    await userEvent.selectOptions(
      document.querySelector<HTMLSelectElement>(`[data-loc="${KHOA_LOC_TICKET.uu_tien}"]`)!,
      'low',
    );
    await vi.waitFor(() => {
      expect(may.da_goi.some((l) => l.duong.includes('uu_tien=low'))).toBe(true);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Gấp' }));
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLSelectElement>(`[data-loc="${KHOA_LOC_TICKET.uu_tien}"]`)?.value,
      ).toBe('urgent');
    });
  });

  it('kho `localStorage` BỊ CHẶN (ném khi ghi) ⇒ KHÔNG làm vỡ trang', async () => {
    mayTicket();
    const kho = ganKho();
    vi.spyOn(kho, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');
    await moMenuLoc();
    await userEvent.type(document.querySelector<HTMLInputElement>('[data-o="ten-view"]')!, 'Gấp');
    await userEvent.click(screen.getByRole('button', { name: NHAN_LUU_VIEW }));

    // Trang còn sống (thẻ vẫn đó) và nút view vẫn hiện trong lượt này.
    expect(document.querySelector('[data-the-ticket="SAI-1"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Gấp' })).toBeTruthy();
  });

  /**
   * Môi trường **không có `localStorage`** — chính môi trường của root test này,
   * và cũng là môi trường thật của một iframe sandbox. Trang phải chạy bình
   * thường; chỉ là view không được nhớ sang lần mở sau.
   */
  it('KHÔNG có `localStorage` nào ⇒ trang vẫn chạy, chỉ là không nhớ view', async () => {
    mayTicket();
    // Cố ý **không** `ganKho()`.
    dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');
    await moMenuLoc();

    await userEvent.type(document.querySelector<HTMLInputElement>('[data-o="ten-view"]')!, 'Gấp');
    await userEvent.click(screen.getByRole('button', { name: NHAN_LUU_VIEW }));

    expect(document.querySelector('[data-the-ticket="SAI-1"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Gấp' })).toBeTruthy();
  });
});

/* ================================================================== *
 * J. d.411 — không có chiều rộng cứng nào vượt 375px
 * ================================================================== */

describe('d.411 — danh sách không dựng tràn ngang ở 375px', () => {
  const PX = specDoiDienThoai().px;

  it('không lớp nào chốt chiều rộng cứng lớn hơn số px của SPEC', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    const { container } = dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');

    const qua: { lop: string; px: number }[] = [];
    for (const e of [container, ...container.querySelectorAll<HTMLElement>('*')]) {
      /*
       * `getAttribute('class')`, **không** `e.className`: trên một `<svg>` (icon
       * ưu tiên của thẻ việc) `className` là một `SVGAnimatedString`, không một
       * chuỗi — `.split` trên nó ném, và ca này đỏ vì một lý do không liên quan
       * tới luật nó canh. Thuộc tính `class` thì cùng một chuỗi cho cả hai.
       */
      for (const lop of (e.getAttribute('class') ?? '').split(/\s+/)) {
        const khop = /^(?:min-)?w-\[(\d+(?:\.\d+)?)px\]$/.exec(lop);
        if (khop?.[1] !== undefined && Number(khop[1]) > PX) qua.push({ lop, px: Number(khop[1]) });
      }
    }
    expect(qua).toEqual([]);
  });

  it('mọi hàng nút nằm ngang có `flex-wrap`', async () => {
    mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' })]));
    const { container } = dung(<TrangDanhSachTicket />, '/ticket');
    await choTai('SAI-1');

    const thieu = [...container.querySelectorAll<HTMLElement>('[data-hang="nut"]')].filter(
      (e) => !e.className.includes('flex-wrap'),
    );
    expect(thieu.map((e) => e.outerHTML.slice(0, 80))).toEqual([]);
  });
});

/* ================================================================== *
 * d.396 — chính CỬ CHỈ KÉO: `xongKeo` gọi trực tiếp
 * ================================================================== */

/**
 * Ba quyết định của cử chỉ kéo không đi qua ô `<select data-chuyen-cot>`: tra thẻ
 * theo `active.id`, thả **ra ngoài** mọi cột, thả lại **đúng cột cũ**. jsdom không
 * sinh được `dragend` của dnd-kit (không có layout), nên ca test gọi thẳng hàm —
 * đó là lưới duy nhất cho ba dòng đó.
 */
describe('d.396 — `xongKeo`: một cử chỉ kéo vừa kết thúc', () => {
  const DS = [
    dong({ ma: 'SAI-1', trang_thai: 'todo' }),
    dong({ ma: 'SAI-2', trang_thai: 'in_progress' }),
  ];

  it('kéo sang CỘT KHÁC → gọi đúng ticket, đúng trạng thái ĐÍCH', () => {
    const keo = vi.fn();
    xongKeo(DS, { active: { id: 'tk-SAI-1' }, over: { id: 'in_progress' } }, keo);
    // Tải thật: đúng ticket **và** đúng cột đích, không chỉ "đã gọi".
    expect(keo.mock.calls).toEqual([[{ ticket_id: 'tk-SAI-1', trang_thai: 'in_progress' }]]);
  });

  it('thả RA NGOÀI mọi cột (`over === null`) → không gọi gì', () => {
    const keo = vi.fn();
    xongKeo(DS, { active: { id: 'tk-SAI-1' }, over: null }, keo);
    expect(keo).not.toHaveBeenCalled();
  });

  it('thả lại ĐÚNG CỘT CŨ → không gọi gì (không một `POST` rỗng nghĩa)', () => {
    const keo = vi.fn();
    xongKeo(DS, { active: { id: 'tk-SAI-2' }, over: { id: 'in_progress' } }, keo);
    expect(keo).not.toHaveBeenCalled();
  });

  it('`active.id` không thuộc trang đang xem → không gọi gì', () => {
    const keo = vi.fn();
    xongKeo(DS, { active: { id: 'tk-LA-9' }, over: { id: 'done' } }, keo);
    expect(keo).not.toHaveBeenCalled();
  });

  /*
   * BAT-64 (T-111 A): cột Backlog là một vùng thả như mọi cột khác. Client chỉ
   * dịch cử chỉ; luật chuyển là của máy chủ (`apDungLuat`).
   */
  it('BAT-64: thẻ Cần làm thả vào cột Backlog → gọi với `backlog`', () => {
    const keo = vi.fn();
    xongKeo(DS, { active: { id: 'tk-SAI-1' }, over: { id: 'backlog' } }, keo);
    expect(keo.mock.calls).toEqual([[{ ticket_id: 'tk-SAI-1', trang_thai: 'backlog' }]]);
  });

  it('BAT-64: thẻ Backlog thả vào cột Cần làm → gọi với `todo`; thả lại cột Backlog → không gọi', () => {
    const ds = [dong({ ma: 'SAI-3', trang_thai: 'backlog', nhom_trang_thai: 'planned' })];
    const keo = vi.fn();
    xongKeo(ds, { active: { id: 'tk-SAI-3' }, over: { id: 'todo' } }, keo);
    expect(keo.mock.calls).toEqual([[{ ticket_id: 'tk-SAI-3', trang_thai: 'todo' }]]);
    keo.mockClear();
    xongKeo(ds, { active: { id: 'tk-SAI-3' }, over: { id: 'backlog' } }, keo);
    expect(keo).not.toHaveBeenCalled();
  });
});

/* ================================================================== *
 * BAT-28 — panel chi tiết: làm mới sau S/P/L hoãn khoá đang sửa tiêu đề
 * (việc 1); đổi thẻ khi sửa tiêu đề còn treo dùng khoá ngữ cảnh (việc 2)
 * ================================================================== */

describe('BAT-28 — panel: sửa tiêu đề (lạc quan) gặp S/P/L và đổi thẻ', () => {
  const o_ut = (ma: string): HTMLSelectElement | null =>
    document.querySelector<HTMLSelectElement>(`[data-uu-tien-panel="${ma}"]`);
  const cua = (): { cho: Promise<unknown>; mo: () => void } => {
    let mo: () => void = () => undefined;
    const cho = new Promise<unknown>((res) => {
      mo = () => res(null);
    });
    return { cho, mo };
  };
  const doc_ct = (may: MayChuGia, ma: string): number =>
    may.da_goi.filter((l) => l.method === 'GET' && l.duong === `/v1/man-hinh-ticket/ma/${ma}`).length;
  const so_patch = (may: MayChuGia): number => may.da_goi.filter((l) => l.method === 'PATCH').length;
  const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const tieuDe = (qc: QueryClient, ma: string): string | undefined =>
    qc.getQueryData<{ ticket: { tieu_de: string } }>(['ticket', 'chi-tiet', ma])?.ticket.tieu_de;

  async function suaTieuDe(moi: string): Promise<void> {
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="sua-tieu-de"]')!);
    const o = document.querySelector<HTMLInputElement>('[data-o-nhap="tieu-de"]')!;
    await userEvent.clear(o);
    await userEvent.type(o, moi);
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="luu-tieu-de"]')!);
    await vi.waitFor(() => {
      expect(screen.getByText(moi)).toBeTruthy();
    });
  }

  it('việc 1: `P` xong khi sửa tiêu đề CÙNG thẻ còn bay ⇒ chi tiết KHÔNG bị GET (tiêu đề lạc quan còn); sửa xong ⇒ GET đúng một lần', async () => {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
    const c_td = cua();
    const c_ut = cua();
    kho.hang_patch = [
      { loi: null, cho: c_td.cho },
      { loi: null, cho: c_ut.cho },
    ];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBe(1);
    });
    await suaTieuDe('Tiêu đề lạc quan');
    const o = await vi.waitFor(() => {
      const el = o_ut('SAI-1');
      expect(el).not.toBeNull();
      return el!;
    });
    await userEvent.selectOptions(o, 'urgent');
    await vi.waitFor(() => {
      expect(so_patch(may)).toBe(2);
    });
    const n = doc_ct(may, 'SAI-1');

    // `P` xong trước: `lamMoiSauDoi` muốn làm mới chi tiết SAI-1 — đang bị sửa tiêu đề ghi.
    c_ut.mo();
    await doi(150);
    expect(doc_ct(may, 'SAI-1')).toBe(n);
    expect(tieuDe(qc, 'SAI-1')).toBe('Tiêu đề lạc quan');
    expect(screen.getByText('Tiêu đề lạc quan')).toBeTruthy();
    expect(khoaDangHoan(qc)).toEqual([['ticket', 'chi-tiet', 'SAI-1']]);

    // Sửa tiêu đề xong ⇒ làm mới chi tiết, đúng MỘT lượt (hoãn + của chính nó gộp lại).
    c_td.mo();
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBe(n + 1);
    });
    await doi(150);
    expect(doc_ct(may, 'SAI-1')).toBe(n + 1);
    expect(tieuDe(qc, 'SAI-1')).toBe('Thân panel');
    expect(khoaDangHoan(qc)).toEqual([]);
  });

  it('việc 2: sửa tiêu đề thẻ A treo, chuyển panel sang B, A bị từ chối ⇒ hoàn đúng cache A, cache B không bị đụng; làm mới khoá A (không B); sổ A về 0', async () => {
    const LOI = 'Không sửa được tiêu đề của A.';
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })]));
    const c = cua();
    kho.hang_patch = [{ loi: { error: 'FORBIDDEN', message: LOI }, cho: c.cho }];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBe(1);
    });
    await suaTieuDe('Tiêu đề lạc quan A');
    await vi.waitFor(() => {
      expect(so_patch(may)).toBe(1);
    });
    const KA = ['ticket', 'chi-tiet', 'SAI-1'] as const;
    const KB = ['ticket', 'chi-tiet', 'SAI-2'] as const;
    expect(dangGhiLacQuan(qc, KA)).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Mở SAI-2' }));
    await vi.waitFor(() => {
      expect(tieuDe(qc, 'SAI-2')).toBe('Thân panel');
    });
    const b_truoc = qc.getQueryData(KB);
    const nB = doc_ct(may, 'SAI-2');
    const goi = vi.spyOn(qc, 'invalidateQueries');
    const lam_moi = (k: readonly unknown[]): number =>
      goi.mock.calls.filter((g) => {
        const q = (g[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
        return q !== undefined && JSON.stringify(q) === JSON.stringify(k);
      }).length;

    c.mo();
    expect(await screen.findByText(LOI)).toBeTruthy();
    await doi(100);
    // Hoàn vào khoá ĐÃ GHI (A), không khoá của thẻ đang mở (B).
    expect(tieuDe(qc, 'SAI-1')).toBe('Thân panel');
    expect(qc.getQueryData(KB)).toBe(b_truoc);
    // Làm mới khoá A, không khoá B.
    expect(lam_moi(KA)).toBe(1);
    expect(lam_moi(KB)).toBe(0);
    expect(doc_ct(may, 'SAI-2')).toBe(nB);
    expect(dangGhiLacQuan(qc, KA)).toBe(false);
  });
});

/* ================================================================== *
 * BAT-28 việc 2 — đổi BỘ LỌC danh sách khi S/P/L còn treo: `onError` và
 * `lamMoiSauDoi` dùng khoá danh sách trong ngữ cảnh (khoá A đã ghi), không
 * khoá của bộ lọc đang chọn (B)
 * ================================================================== */

describe('BAT-28 việc 2 — đổi bộ lọc danh sách khi S/P/L còn treo', () => {
  type The = { ma: string; trang_thai: string; uu_tien: string; nhan: string[] };
  const khoaDs = (qc: QueryClient): QueryKey[] =>
    qc
      .getQueryCache()
      .findAll({ queryKey: ['ticket', 'man-hinh'] })
      .map((q) => q.queryKey);
  const theTrong = (qc: QueryClient, k: QueryKey, ma: string): The | undefined =>
    qc
      .getQueryData<{ pages: { items: The[] }[] }>(k)
      ?.pages.flatMap((p) => p.items)
      .find((t) => t.ma === ma);
  const cua = (): { cho: Promise<unknown>; mo: () => void } => {
    let mo: () => void = () => undefined;
    const cho = new Promise<unknown>((res) => {
      mo = () => res(null);
    });
    return { cho, mo };
  };
  const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const choEl = async <T extends Element>(chon: string): Promise<T> =>
    await vi.waitFor(() => {
      const el = document.querySelector<T>(chon);
      expect(el).not.toBeNull();
      return el!;
    });

  type Hang = 'hang_tt' | 'hang_patch' | 'hang_nhan';
  const BA_HOOK: {
    ten: string;
    hang: Hang;
    lam: () => Promise<void>;
    doc: (t: The | undefined) => string | undefined;
    cu: string;
    moi: string;
  }[] = [
    {
      ten: 'S (useDoiTrangThai)',
      hang: 'hang_tt',
      lam: async () => {
        await userEvent.selectOptions(
          await choEl<HTMLSelectElement>('[data-trang-thai-panel="SAI-1"]'),
          'in_progress',
        );
      },
      doc: (t) => t?.trang_thai,
      cu: 'todo',
      moi: 'in_progress',
    },
    {
      ten: 'P (useDoiUuTien)',
      hang: 'hang_patch',
      lam: async () => {
        await userEvent.selectOptions(
          await choEl<HTMLSelectElement>('[data-uu-tien-panel="SAI-1"]'),
          'urgent',
        );
      },
      doc: (t) => t?.uu_tien,
      cu: 'low',
      moi: 'urgent',
    },
    {
      ten: 'L (useDatNhan)',
      hang: 'hang_nhan',
      lam: async () => {
        await userEvent.type(await choEl<HTMLInputElement>('[data-o="them-nhan"]'), 'x{Enter}');
      },
      doc: (t) => t?.nhan.join(','),
      cu: '',
      moi: 'x',
    },
  ];

  /**
   * Dựng: thao tác treo trên bộ lọc A (không lọc), đổi sang bộ lọc B (`can_chu=co`),
   * chờ B về, rồi chặn mọi GET danh sách (thứ gì đổi cache sau đó là của mutation).
   */
  async function dungVaDoiLoc(
    h: (typeof BA_HOOK)[number],
    loi: { error: string; message: string } | null,
  ): Promise<{ qc: QueryClient; mo: () => void; KA: QueryKey; KB: QueryKey }> {
    const { kho } = mayTicket(
      manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'todo', uu_tien: 'low', nhan: [] })]),
    );
    const c = cua();
    kho[h.hang] = [{ loi, cho: c.cho }];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await vi.waitFor(() => {
      expect(khoaDs(qc).length).toBe(1);
    });
    const KA = khoaDs(qc)[0]!;
    await h.lam();
    await vi.waitFor(() => {
      expect(h.doc(theTrong(qc, KA, 'SAI-1'))).toBe(h.moi);
    });

    await moMenuLoc();
    await userEvent.click(
      document.querySelector<HTMLInputElement>(`[data-loc="${KHOA_LOC_TICKET.can_chu}"]`)!,
    );
    const KB = await vi.waitFor(() => {
      const k = khoaDs(qc).find((x) => hashKey(x) !== hashKey(KA));
      expect(k).toBeDefined();
      expect(qc.getQueryData(k!)).toBeDefined();
      return k!;
    });
    kho.choGet = new Promise<unknown>(() => undefined);
    return { qc, mo: c.mo, KA, KB };
  }

  it.each(BA_HOOK)(
    '(a) $ten treo trên bộ lọc A, đổi sang B, máy chủ TỪ CHỐI ⇒ hoàn khoá A bằng phép ngược; khoá B giữ nguyên tham chiếu',
    async (h) => {
      const LOI = `Từ chối ${h.ten}.`;
      const { qc, mo, KA, KB } = await dungVaDoiLoc(h, { error: 'FORBIDDEN', message: LOI });
      const b_truoc = qc.getQueryData(KB);
      expect(h.doc(theTrong(qc, KB, 'SAI-1'))).toBe(h.cu);

      mo();
      expect(await screen.findByText(LOI)).toBeTruthy();
      await doi(50);
      expect(h.doc(theTrong(qc, KA, 'SAI-1'))).toBe(h.cu);
      expect(qc.getQueryData(KB)).toBe(b_truoc);
    },
  );

  it.each(BA_HOOK)(
    '(b) $ten treo trên bộ lọc A, đổi sang B, máy chủ NHẬN ⇒ làm mới khoá A, không đụng khoá B',
    async (h) => {
      const { qc, mo, KA, KB } = await dungVaDoiLoc(h, null);
      const b_truoc = qc.getQueryData(KB);
      const goi = vi.spyOn(qc, 'invalidateQueries');
      const lam_moi = (k: QueryKey): number =>
        goi.mock.calls.filter((g) => {
          const q = (g[0] as { queryKey?: QueryKey } | undefined)?.queryKey;
          return q !== undefined && hashKey(q) === hashKey(k);
        }).length;

      mo();
      await vi.waitFor(() => {
        expect(lam_moi(KA)).toBe(1);
      });
      await doi(50);
      expect(lam_moi(KA)).toBe(1);
      expect(lam_moi(KB)).toBe(0);
      expect(qc.getQueryData(KB)).toBe(b_truoc);
      expect(qc.getQueryState(KA)?.isInvalidated).toBe(true);
    },
  );

  it('`L` mà `onMutate` ném trước khi ghi (cancelQueries lỗi, ngữ cảnh undefined) ⇒ cache danh sách KHÔNG bị đổi', async () => {
    const { kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', nhan: [] })]));
    kho.hang_nhan = [{ loi: null, cho: null }];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    const o = await choEl<HTMLInputElement>('[data-o="them-nhan"]');
    const KA = khoaDs(qc)[0]!;
    // Chặn mọi GET danh sách: lượt làm mới của `onSettled` không được che việc đo.
    kho.choGet = new Promise<unknown>(() => undefined);
    const dem_truoc = qc.getQueryState(KA)?.dataUpdateCount;
    const truoc = qc.getQueryData(KA);
    vi.spyOn(qc, 'cancelQueries').mockRejectedValueOnce(new Error('cancel hỏng'));

    await userEvent.type(o, 'y{Enter}');
    await vi.waitFor(() => {
      expect(qc.getMutationCache().getAll().length).toBeGreaterThan(0);
      expect(qc.isMutating()).toBe(0);
    });
    await doi(50);
    // Không một lần ghi nào vào khoá danh sách (kể cả một "phép ngược" trùng giá trị).
    expect(qc.getQueryState(KA)?.dataUpdateCount).toBe(dem_truoc);
    expect(qc.getQueryData(KA)).toBe(truoc);
    expect(theTrong(qc, KA, 'SAI-1')?.nhan).toEqual([]);
  });
});

/* ================================================================== *
 * BAT-28 việc 3 — `ghiMaThe` qua hook thật: cổng "quay lại tab" chỉ chặn
 * chi tiết của ĐÚNG thẻ có S/P đang bay (d.418, d.420)
 * ================================================================== */

describe('BAT-28 việc 3 — quay lại tab khi S/P treo: chi tiết thẻ khác vẫn làm mới', () => {
  const KHOA_A = ['ticket', 'chi-tiet', 'SAI-1'] as const; // thẻ đang bị sửa
  const KHOA_B = ['ticket', 'chi-tiet', 'SAI-2'] as const; // thẻ khác, đang có người xem

  function QuanSat(): null {
    useNhipLamMoi(false, [KHOA_A, KHOA_B]);
    return null;
  }

  type DongDs = { ma: string; trang_thai: string; uu_tien: string };
  const chonDong = async <T extends Element>(chon: string): Promise<T> =>
    await vi.waitFor(() => {
      const el = document.querySelector<T>(chon);
      expect(el).not.toBeNull();
      return el!;
    });

  const HAI_HOOK: {
    ten: string;
    hang: 'hang_tt' | 'hang_patch';
    lam: () => Promise<void>;
    doc: (t: DongDs | undefined) => string | undefined;
    moi: string;
  }[] = [
    {
      ten: 'S (useDoiTrangThai)',
      hang: 'hang_tt',
      lam: async () => {
        await userEvent.selectOptions(
          await chonDong<HTMLSelectElement>('[data-trang-thai-panel="SAI-1"]'),
          'in_progress',
        );
      },
      doc: (t) => t?.trang_thai,
      moi: 'in_progress',
    },
    {
      ten: 'P (useDoiUuTien)',
      hang: 'hang_patch',
      lam: async () => {
        await userEvent.selectOptions(
          await chonDong<HTMLSelectElement>('[data-uu-tien-panel="SAI-1"]'),
          'urgent',
        );
      },
      doc: (t) => t?.uu_tien,
      moi: 'urgent',
    },
  ];

  it.each(HAI_HOOK)(
    '$ten treo trên thẻ A (có trong cache) ⇒ quay lại tab: chi tiết thẻ B được làm mới, chi tiết thẻ A thì không',
    async (h) => {
      const { kho } = mayTicket(
        manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'todo', uu_tien: 'low', nhan: [] })]),
      );
      let mo: () => void = () => undefined;
      kho[h.hang] = [
        {
          loi: null,
          cho: new Promise<unknown>((res) => {
            mo = () => res(null);
          }),
        },
      ];
      const { qc } = dung(
        <>
          <TrangDanhSachTicket />
          <QuanSat />
        </>,
        '/ticket?xem=bang&the=SAI-1',
      );
      await choTai('SAI-1');
      await h.lam();
      // Thao tác đã qua onMutate (cache đã đổi lạc quan) và còn treo ở máy chủ.
      await vi.waitFor(() => {
        const the = qc
          .getQueryCache()
          .findAll({ queryKey: ['ticket', 'man-hinh'] })
          .flatMap(
            (q) =>
              qc.getQueryData<{ pages: { items: DongDs[] }[] }>(q.queryKey)?.pages.flatMap((p) => p.items) ?? [],
          )
          .find((t) => t.ma === 'SAI-1');
        expect(h.doc(the)).toBe(h.moi);
      });

      const goi = vi.spyOn(qc, 'invalidateQueries');
      const lamMoi = (k: QueryKey): number =>
        goi.mock.calls.filter((g) => {
          const q = (g[0] as { queryKey?: QueryKey } | undefined)?.queryKey;
          return q !== undefined && hashKey(q) === hashKey(k);
        }).length;

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(lamMoi(KHOA_B)).toBe(1);
      expect(lamMoi(KHOA_A)).toBe(0);
      mo();
    },
  );
});

/* ================================================================== *
 * BAT-29 việc 2 — `lamMoiTheoSo` hỏi cả sổ S/P/L (d.418): tạo việc xong
 * (`lamMoiTheoSo(['ticket'])`) lúc S/P/L còn bay KHÔNG bắn GET danh sách /
 * chi tiết thẻ đang sửa; S/P/L xong ⇒ làm mới, và khoá hoãn không kẹt.
 * ================================================================== */

describe('BAT-29 việc 2 — làm mới sau mutation khi S/P/L còn treo', () => {
  type DongDs = { ma: string; uu_tien: string };
  const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const doc_ds = (may: MayChuGia): number =>
    may.da_goi.filter(
      (l) => l.method === 'GET' && l.duong.startsWith('/v1/man-hinh-ticket') && !l.duong.includes('/ma/'),
    ).length;
  const doc_ct = (may: MayChuGia, ma: string): number =>
    may.da_goi.filter((l) => l.method === 'GET' && l.duong === `/v1/man-hinh-ticket/ma/${ma}`).length;
  const uuTien = (qc: QueryClient, k: QueryKey): string | undefined =>
    qc
      .getQueryData<{ pages: { items: DongDs[] }[] }>(k)
      ?.pages.flatMap((p) => p.items)
      .find((t) => t.ma === 'SAI-1')?.uu_tien;
  const bam = (ds: readonly QueryKey[]): string[] => ds.map((k) => hashKey(k)).sort();

  it('`P` treo trên SAI-1, tạo việc xong ⇒ KHÔNG GET danh sách / chi tiết SAI-1 (giá trị lạc quan đứng), chi tiết thẻ khác vẫn làm mới; `P` xong ⇒ mỗi khoá làm mới đúng MỘT lần, khoá bộ lọc khác được xả', async () => {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', uu_tien: 'low' })]));
    let mo: () => void = () => undefined;
    kho.hang_patch = [
      {
        loi: null,
        cho: new Promise<unknown>((r) => {
          mo = () => r(null);
        }),
      },
    ];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBe(1);
    });
    const KA = qc.getQueryCache().findAll({ queryKey: ['ticket', 'man-hinh'] })[0]!.queryKey;
    const CT_A = ['ticket', 'chi-tiet', 'SAI-1'] as const;
    // Bộ lọc cũ còn trong cache (không ai xem) và chi tiết của một thẻ KHÁC.
    const K_KHAC = ['ticket', 'man-hinh', 'bo-loc-khac'] as const;
    const CT_B = ['ticket', 'chi-tiet', 'SAI-2'] as const;
    qc.setQueryData(K_KHAC, { pages: [], pageParams: [] });
    qc.setQueryData(CT_B, manHinhTicket(ticketDayDu({ ma: 'SAI-2' })));

    const o = await vi.waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>('[data-uu-tien-panel="SAI-1"]');
      expect(el).not.toBeNull();
      return el!;
    });
    await userEvent.selectOptions(o, 'urgent');
    await vi.waitFor(() => {
      expect(uuTien(qc, KA)).toBe('urgent');
    });
    const n_ds = doc_ds(may);
    const n_ct = doc_ct(may, 'SAI-1');

    // Đúng lời gọi của `onSuccess` tạo việc (`vo/tao-viec.tsx`).
    act(() => {
      void lamMoiTheoSo(qc, { queryKey: ['ticket'] });
    });
    await doi(150);
    expect(doc_ds(may)).toBe(n_ds);
    expect(doc_ct(may, 'SAI-1')).toBe(n_ct);
    expect(uuTien(qc, KA)).toBe('urgent');
    expect(qc.getQueryState(KA)?.isInvalidated).toBe(false);
    // Thẻ khác (mã đã biết, không bị sửa) KHÔNG bị chặn.
    expect(qc.getQueryState(CT_B)?.isInvalidated).toBe(true);
    expect(bam(khoaDangHoan(qc))).toEqual(bam([KA, K_KHAC, CT_A]));

    mo();
    await vi.waitFor(() => {
      expect(doc_ds(may)).toBe(n_ds + 1);
    });
    await doi(150);
    expect(doc_ds(may)).toBe(n_ds + 1);
    expect(doc_ct(may, 'SAI-1')).toBe(n_ct + 1);
    // Khoá bộ lọc khác: `lamMoiSauDoi` không làm mới nó, nhưng lượt xả hoãn thì có.
    expect(qc.getQueryState(K_KHAC)?.isInvalidated).toBe(true);
    expect(khoaDangHoan(qc)).toEqual([]);
  });
});

/* ================================================================== *
 * BAT-30 việc 3 — nhịp chi tiết ticket hỏi sổ S/P/L (d.418): S treo trên thẻ A
 * ⇒ tick nhịp của chi tiết A KHÔNG bắn GET (kể cả tick đã hẹn từ trước); thẻ khác
 * treo thì chi tiết A vẫn chạy nhịp; S xong ⇒ nhịp hẹn lại.
 * ================================================================== */

describe('BAT-30 việc 3 — nhịp chi tiết thẻ khi S/P/L còn treo', () => {
  const doc_ct = (may: MayChuGia, ma: string): number =>
    may.da_goi.filter((l) => l.method === 'GET' && l.duong === `/v1/man-hinh-ticket/ma/${ma}`).length;

  async function dungPanelA(): Promise<{
    may: MayChuGia;
    qc: QueryClient;
    mo: () => void;
    doiTrangThai: () => Promise<void>;
  }> {
    vi.useFakeTimers();
    const { may, kho } = mayTicket(
      manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'todo' })]),
    );
    let mo: () => void = () => undefined;
    kho.hang_tt = [
      {
        loi: null,
        cho: new Promise<unknown>((r) => {
          mo = () => r(null);
        }),
      },
    ];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(1);
    });
    return {
      may,
      qc,
      mo: () => {
        mo();
      },
      doiTrangThai: async () => {
        const o = await vi.waitFor(() => {
          const el = document.querySelector<HTMLSelectElement>('[data-trang-thai-panel="SAI-1"]');
          expect(el).not.toBeNull();
          return el!;
        });
        fireEvent.change(o, { target: { value: 'in_progress' } });
        await vi.waitFor(() => {
          expect(may.da_goi.some((l) => l.method === 'POST' && l.duong.includes('/trang-thai'))).toBe(
            true,
          );
        });
      },
    };
  }

  it('S treo trên thẻ A ⇒ qua ≥2 chu kỳ KHÔNG có GET chi tiết A mới; S xong ⇒ nhịp chạy lại', async () => {
    const { may, mo, doiTrangThai } = await dungPanelA();
    await doiTrangThai();
    const n = doc_ct(may, 'SAI-1');

    await vi.advanceTimersByTimeAsync(2 * CHU_KY_LAM_MOI_MS + 100);
    expect(doc_ct(may, 'SAI-1')).toBe(n);

    mo();
    // `lamMoiSauDoi` invalidate chi tiết A khi sổ về 0 ⇒ một lượt tải.
    await vi.advanceTimersByTimeAsync(50);
    const sau = doc_ct(may, 'SAI-1');
    expect(sau).toBeGreaterThan(n);
    // Và nhịp được hẹn lại: thêm chu kỳ ⇒ thêm GET.
    await vi.advanceTimersByTimeAsync(2 * CHU_KY_LAM_MOI_MS + 100);
    expect(doc_ct(may, 'SAI-1')).toBeGreaterThan(sau);
  });

  it('cơ chế tính lại timer: sổ S/P/L đổi NGOÀI React (không lần vẽ nào) vẫn xoá tick đã hẹn, và hẹn lại khi hết', async () => {
    vi.useFakeTimers();
    const { may } = mayTicket();
    const { qc } = dung(<ThanChiTietTicket ma="SAI-1" />, '/t/SAI-1');
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBe(1);
    });
    // Nhịp đang chạy khi chưa có S/P/L.
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);
    expect(doc_ct(may, 'SAI-1')).toBe(2);

    // Đúng điều `onMutate` làm: cộng sổ, KHÔNG chạm khoá chi tiết, không state React.
    batDauSua(qc, 'tk-SAI-1', 'SAI-1');
    await vi.advanceTimersByTimeAsync(3 * CHU_KY_LAM_MOI_MS + 100);
    expect(doc_ct(may, 'SAI-1')).toBe(2);

    // Sổ về 0 mà không ai invalidate (vd nhánh lỗi) ⇒ nhịp phải tự hẹn lại.
    ketThucSua(qc, 'tk-SAI-1');
    await vi.advanceTimersByTimeAsync(2 * CHU_KY_LAM_MOI_MS + 100);
    expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(4);
  });

  it('chuỗi S/P/L liên tiếp trên thẻ KHÁC đã biết mã (cách nhau < 1 chu kỳ) KHÔNG đặt lại pha nhịp của chi tiết SAI-1', async () => {
    vi.useFakeTimers();
    const { may } = mayTicket();
    const { qc } = dung(<ThanChiTietTicket ma="SAI-1" />, '/t/SAI-1');
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBe(1);
    });
    // 6 nửa chu kỳ = 3 chu kỳ; mỗi nửa chu kỳ bắt đầu hoặc kết thúc một thao tác trên SAI-9.
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS / 2);
      if (i % 2 === 0) batDauSua(qc, 'tk-SAI-9', 'SAI-9');
      else ketThucSua(qc, 'tk-SAI-9');
    }
    await vi.advanceTimersByTimeAsync(50);
    // 1 lượt đầu + ít nhất 2 tick (ba chu kỳ trôi qua).
    expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(3);
  });

  it('đối chứng: S treo trên thẻ B khác ⇒ chi tiết A vẫn có GET theo nhịp', async () => {
    const { may, qc } = await dungPanelA();
    const n = doc_ct(may, 'SAI-1');
    // Đúng điều `useDoiTrangThai.onMutate` làm cho thẻ B (đã biết mã SAI-2).
    act(() => {
      batDauSua(qc, 'tk-SAI-2', 'SAI-2');
    });
    await vi.advanceTimersByTimeAsync(2 * CHU_KY_LAM_MOI_MS + 100);
    expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(n + 2);
    act(() => {
      ketThucSua(qc, 'tk-SAI-2');
    });
  });
});

/* ================================================================== *
 * BAT-31 việc 2 — có mạng lại (`refetchOnReconnect`) đi qua cùng cổng d.418:
 * S/P/L hay ghi lạc quan còn treo ⇒ khoá bị chặn KHÔNG GET; không treo ⇒ GET (d.420).
 * Client thật từ `taoQueryClient()` (qua `dung`) nên cấu hình thật được ghim.
 * ================================================================== */

describe('BAT-31 việc 2 — có mạng lại khi thao tác còn treo', () => {
  const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const doc_ds = (may: MayChuGia): number =>
    may.da_goi.filter(
      (l) => l.method === 'GET' && l.duong.startsWith('/v1/man-hinh-ticket') && !l.duong.includes('/ma/'),
    ).length;
  const doc_ct = (may: MayChuGia, ma: string): number =>
    may.da_goi.filter((l) => l.method === 'GET' && l.duong === `/v1/man-hinh-ticket/ma/${ma}`).length;
  const CT_A = ['ticket', 'chi-tiet', 'SAI-1'] as const;

  /** Panel SAI-1 mở, chi tiết + danh sách đã tải; (tuỳ chọn) `S` đang treo ở máy chủ. */
  async function dungVaTreo(treo_s: boolean): Promise<{
    may: MayChuGia;
    qc: QueryClient;
    mo: () => void;
  }> {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'todo' })]));
    let mo: () => void = () => undefined;
    kho.hang_tt = [
      {
        loi: null,
        cho: new Promise<unknown>((r) => {
          mo = () => r(null);
        }),
      },
    ];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choTai('SAI-1');
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(1);
    });
    if (treo_s) {
      const o = await vi.waitFor(() => {
        const el = document.querySelector<HTMLSelectElement>('[data-trang-thai-panel="SAI-1"]');
        expect(el).not.toBeNull();
        return el!;
      });
      fireEvent.change(o, { target: { value: 'in_progress' } });
      await vi.waitFor(() => {
        expect(may.da_goi.some((l) => l.method === 'POST' && l.duong.includes('/trang-thai'))).toBe(true);
      });
    }
    return { may, qc, mo: () => mo() };
  }

  async function matMangRoiCoLai(): Promise<void> {
    act(() => {
      onlineManager.setOnline(false);
    });
    await doi(20);
    act(() => {
      onlineManager.setOnline(true);
    });
    await doi(150);
  }

  it('(a) S treo trên thẻ A: có mạng lại ⇒ KHÔNG GET danh sách và KHÔNG GET chi tiết A', async () => {
    const { may, mo } = await dungVaTreo(true);
    const n_ds = doc_ds(may);
    const n_ct = doc_ct(may, 'SAI-1');
    await matMangRoiCoLai();
    expect(doc_ds(may)).toBe(n_ds);
    expect(doc_ct(may, 'SAI-1')).toBe(n_ct);
    mo();
  });

  it('(b) mutation lạc quan khác treo trên khoá chi tiết A (sổ ghi-lac-quan): có mạng lại ⇒ không GET khoá đó, khoá không dính vẫn GET', async () => {
    const { may, qc } = await dungVaTreo(false);
    const ve = batDauGhiLacQuan(qc, [CT_A]);
    const n_ds = doc_ds(may);
    const n_ct = doc_ct(may, 'SAI-1');
    await matMangRoiCoLai();
    expect(doc_ct(may, 'SAI-1')).toBe(n_ct);
    expect(doc_ds(may)).toBeGreaterThan(n_ds);
    ketThucGhiLacQuan(qc, ve);
  });

  it('(c) đối chứng (d.420): không có gì treo ⇒ có mạng lại thì danh sách và chi tiết A đều được tải lại', async () => {
    const { may } = await dungVaTreo(false);
    const n_ds = doc_ds(may);
    const n_ct = doc_ct(may, 'SAI-1');
    await matMangRoiCoLai();
    expect(doc_ds(may)).toBeGreaterThan(n_ds);
    expect(doc_ct(may, 'SAI-1')).toBeGreaterThan(n_ct);
  });

  it('(d) S treo trên thẻ B khác (mã đã biết): có mạng lại ⇒ chi tiết A vẫn tải lại, danh sách thì không', async () => {
    const { may, qc } = await dungVaTreo(false);
    act(() => {
      batDauSua(qc, 'tk-SAI-2', 'SAI-2');
    });
    const n_ds = doc_ds(may);
    const n_ct = doc_ct(may, 'SAI-1');
    await matMangRoiCoLai();
    expect(doc_ct(may, 'SAI-1')).toBeGreaterThan(n_ct);
    expect(doc_ds(may)).toBe(n_ds);
    act(() => {
      ketThucSua(qc, 'tk-SAI-2');
    });
  });

  it('(e) lần tải chi tiết A đang TẠM DỪNG vì mất mạng, rồi S bắt đầu trên A ⇒ lần tải bị huỷ; có mạng lại không bắn GET (retryer.continue không qua cổng)', async () => {
    const { may, qc } = await dungVaTreo(false);
    act(() => {
      onlineManager.setOnline(false);
    });
    void qc.refetchQueries({ queryKey: CT_A });
    await vi.waitFor(() => {
      expect(qc.getQueryState(CT_A)?.fetchStatus).toBe('paused');
    });
    act(() => {
      batDauSua(qc, 'tk-SAI-1', 'SAI-1');
    });
    expect(qc.getQueryState(CT_A)?.fetchStatus).toBe('idle');
    const n_ct = doc_ct(may, 'SAI-1');
    act(() => {
      onlineManager.setOnline(true);
    });
    await doi(150);
    expect(doc_ct(may, 'SAI-1')).toBe(n_ct);
    act(() => {
      ketThucSua(qc, 'tk-SAI-1');
    });
  });
});

/* ================================================================== *
 * BAT-32 việc 2 — lần tải ĐẦU (mount) của chi tiết thẻ lúc mất mạng + khoá đang bị
 * chặn: query bắt đầu ở `paused` mà trạng thái chặn không đổi, nên có mạng lại
 * `retryer.continue()` từng bắn GET vượt cổng d.418. Nay `query.ts` huỷ lần tải đó
 * và hoãn khoá; hết chặn thì khoá được tải (không kẹt "Đang tải…").
 * ================================================================== */

describe('BAT-32 việc 2 — mount chi tiết lúc mất mạng khi khoá bị chặn', () => {
  const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const doc_ct = (may: MayChuGia, ma: string): number =>
    may.da_goi.filter((l) => l.method === 'GET' && l.duong === `/v1/man-hinh-ticket/ma/${ma}`).length;

  /** Danh sách có SAI-1, SAI-2; chưa mở panel; chưa có GET chi tiết nào. */
  async function dungDanhSach(): Promise<{ may: MayChuGia; qc: QueryClient }> {
    const { may } = mayTicket(
      manHinhDanhSach([
        dong({ ma: 'SAI-1', trang_thai: 'todo' }),
        dong({ ma: 'SAI-2', trang_thai: 'todo' }),
      ]),
    );
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');
    expect(doc_ct(may, 'SAI-1')).toBe(0);
    return { may, qc };
  }

  async function matMangMoRoiCoLai(ma: string): Promise<void> {
    act(() => {
      onlineManager.setOnline(false);
    });
    return moRoiCoLai(ma);
  }

  /** Đã mất mạng sẵn; mở panel `ma`, đợi lần tải đầu tạm dừng/huỷ, rồi có mạng lại. */
  async function moRoiCoLai(ma: string): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: `Mở ${ma}` }));
    await doi(30);
    act(() => {
      onlineManager.setOnline(true);
    });
    await doi(150);
  }

  it('S treo trên A, mất mạng, mở chi tiết A, có mạng lại ⇒ KHÔNG GET chi tiết A; S xong ⇒ chi tiết A được tải (không kẹt)', async () => {
    const { may, qc } = await dungDanhSach();
    act(() => {
      batDauSua(qc, 'tk-SAI-1', 'SAI-1');
    });
    await matMangMoRoiCoLai('SAI-1');
    expect(doc_ct(may, 'SAI-1')).toBe(0);
    expect(qc.getQueryState(['ticket', 'chi-tiet', 'SAI-1'])?.fetchStatus).toBe('idle');

    // Đúng điều `lamMoiSauDoi` làm: trừ sổ, rồi xả khoá hoãn.
    act(() => {
      ketThucSua(qc, 'tk-SAI-1');
      henXaHoan(qc);
    });
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(1);
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-1');
    });
  });

  it('mutation lạc quan treo trên khoá chi tiết A (sổ ghi-lac-quan): cùng cổng — không GET; xong ⇒ tải', async () => {
    const { may, qc } = await dungDanhSach();
    const ve = batDauGhiLacQuan(qc, [['ticket', 'chi-tiet', 'SAI-1']]);
    await matMangMoRoiCoLai('SAI-1');
    expect(doc_ct(may, 'SAI-1')).toBe(0);
    act(() => {
      ketThucGhiLacQuan(qc, ve);
    });
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(1);
    });
  });

  it('đối chứng: không treo gì ⇒ mất mạng mở chi tiết A, có mạng lại thì lần tải đầu chạy bình thường', async () => {
    const { may } = await dungDanhSach();
    await matMangMoRoiCoLai('SAI-1');
    expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(1);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-1');
    });
  });

  it('đối chứng: S treo trên thẻ B (mã đã biết) ⇒ mất mạng mở chi tiết A, có mạng lại thì A vẫn tải', async () => {
    const { may, qc } = await dungDanhSach();
    act(() => {
      batDauSua(qc, 'tk-SAI-2', 'SAI-2');
    });
    await matMangMoRoiCoLai('SAI-1');
    expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(1);
    act(() => {
      ketThucSua(qc, 'tk-SAI-2');
    });
  });

  it('(a)(b) chi tiết A ĐÃ có dữ liệu, rồi mất mạng + refetch tạm dừng khi khoá bị chặn ⇒ huỷ, dữ liệu cũ còn nguyên, không lỗi; xả xong ⇒ không rò khoá hoãn', async () => {
    const { may, qc } = await dungDanhSach();
    await moPanel('SAI-1');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-1');
    });
    const khoa = ['ticket', 'chi-tiet', 'SAI-1'];
    const cu = qc.getQueryData(khoa);
    expect(cu).toBeDefined();
    const n0 = doc_ct(may, 'SAI-1');

    act(() => {
      batDauSua(qc, 'tk-SAI-1', 'SAI-1');
      onlineManager.setOnline(false);
    });
    await act(async () => {
      void qc.refetchQueries({ queryKey: khoa });
      await doi(30);
    });
    // Lần tải tạm dừng bị huỷ + revert: dữ liệu cũ nguyên vẹn, không lỗi, không GET.
    const st = qc.getQueryState(khoa);
    expect(st?.fetchStatus).toBe('idle');
    expect(st?.status).toBe('success');
    expect(st?.error).toBeNull();
    expect(qc.getQueryData(khoa)).toBe(cu);
    expect(doc_ct(may, 'SAI-1')).toBe(n0);
    expect(khoaDangHoan(qc).map((k) => hashKey(k))).toContain(hashKey(khoa));

    act(() => {
      onlineManager.setOnline(true);
    });
    await doi(150);
    expect(doc_ct(may, 'SAI-1')).toBe(n0); // có mạng lại vẫn bị chặn

    act(() => {
      ketThucSua(qc, 'tk-SAI-1');
      henXaHoan(qc);
    });
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBeGreaterThan(n0);
    });
    expect(khoaDangHoan(qc)).toEqual([]); // không rò khoá
    expect(qc.getQueryData(khoa)).toBeDefined();
  });

  it('(c) qua S thật (useDoiTrangThai → lamMoiSauDoi): mất mạng + refetch chi tiết khi S treo ⇒ không GET; S xong ⇒ chi tiết được tải, không rò khoá hoãn', async () => {
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'todo' })]));
    let nha: () => void = () => undefined;
    kho.hang_tt = [
      {
        loi: null,
        cho: new Promise<void>((r) => {
          nha = r;
        }),
      },
    ];
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choTai('SAI-1');
    const o = await moPanel('SAI-1');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-1');
    });
    const khoa = ['ticket', 'chi-tiet', 'SAI-1'];
    const cu = qc.getQueryData(khoa);

    fireEvent.change(o, { target: { value: 'in_progress' } }); // S thật: batDauSua + ghiMaThe
    await vi.waitFor(() => {
      expect(may.da_goi.some((l) => l.duong.includes('/trang-thai'))).toBe(true);
    });
    const n0 = doc_ct(may, 'SAI-1');

    act(() => {
      onlineManager.setOnline(false);
    });
    await act(async () => {
      void qc.refetchQueries({ queryKey: khoa });
      await doi(30);
    });
    expect(qc.getQueryState(khoa)?.fetchStatus).toBe('idle');
    expect(qc.getQueryData(khoa)).toBe(cu);
    act(() => {
      onlineManager.setOnline(true);
    });
    await doi(150);
    expect(doc_ct(may, 'SAI-1')).toBe(n0);

    await act(async () => {
      nha(); // S xong ⇒ onSettled ⇒ lamMoiSauDoi (ketThucSua + henXaHoan + lamMoiTheoSo)
      await doi(50);
    });
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBeGreaterThan(n0);
    });
    expect(khoaDangHoan(qc)).toEqual([]);
    expect(qc.getQueryState(khoa)?.error).toBeNull();
  });
});

/* ================================================================== *
 * BAT-31 việc 3 — `ghiMaThe` qua `useDoiTrangThai` THẬT: lúc `batDauSua` chưa biết
 * mã (cửa sổ `await cancelQueries`) mọi chi tiết thẻ bị chặn; khi hook ghi mã
 * SAI-1 thì chi tiết thẻ khác (SAI-2) được thả, SAI-1 vẫn chặn.
 * ================================================================== */

describe('BAT-31 việc 3 — ghiMaThe qua useDoiTrangThai thật', () => {
  const doc_ct = (may: MayChuGia, ma: string): number =>
    may.da_goi.filter((l) => l.method === 'GET' && l.duong === `/v1/man-hinh-ticket/ma/${ma}`).length;

  it('trước khi hook ghi mã: chi tiết SAI-2 bị chặn (an toàn); hook ghi mã SAI-1 ⇒ SAI-2 chạy nhịp lại, SAI-1 vẫn chặn', async () => {
    vi.useFakeTimers();
    const { may, kho } = mayTicket(manHinhDanhSach([dong({ ma: 'SAI-1', trang_thai: 'todo' })]));
    kho.hang_tt = [{ loi: null, cho: new Promise<unknown>(() => undefined) }];
    const { qc } = dung(
      <>
        <TrangDanhSachTicket />
        <ThanChiTietTicket ma="SAI-2" />
      </>,
      '/ticket?xem=bang&the=SAI-1',
    );
    await choTai('SAI-1');
    await vi.waitFor(() => {
      expect(doc_ct(may, 'SAI-1')).toBeGreaterThanOrEqual(1);
      expect(doc_ct(may, 'SAI-2')).toBeGreaterThanOrEqual(1);
    });

    // Giữ `cancelQueries` của `onMutate` lại: đó là khe giữa `batDauSua` và `ghiMaThe`.
    const that = qc.cancelQueries.bind(qc);
    let mo_khe: () => void = () => undefined;
    const khe = new Promise<void>((r) => {
      mo_khe = r;
    });
    vi.spyOn(qc, 'cancelQueries').mockImplementation(async (...a) => {
      await khe;
      return that(...a);
    });

    const o = await vi.waitFor(() => {
      const el = document.querySelector<HTMLSelectElement>('[data-trang-thai-panel="SAI-1"]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(o, { target: { value: 'in_progress' } });

    const n1 = doc_ct(may, 'SAI-1');
    const n2 = doc_ct(may, 'SAI-2');
    await vi.advanceTimersByTimeAsync(2 * CHU_KY_LAM_MOI_MS + 100);
    // Mã chưa biết ⇒ cả hai chi tiết đều bị chặn.
    expect(doc_ct(may, 'SAI-1')).toBe(n1);
    expect(doc_ct(may, 'SAI-2')).toBe(n2);

    mo_khe(); // `cancelQueries` xong ⇒ hook thật gọi `ghiMaThe(qc, 'tk-SAI-1', 'SAI-1')`
    await vi.advanceTimersByTimeAsync(2 * CHU_KY_LAM_MOI_MS + 100);
    expect(doc_ct(may, 'SAI-2')).toBeGreaterThan(n2);
    expect(doc_ct(may, 'SAI-1')).toBe(n1);
  });
});
