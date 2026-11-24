/**
 * **Tạo việc trên web** — BAT-22 việc A. SPEC mục 14 d.413 ("`C` tạo ticket"),
 * d.418 (lỗi máy chủ báo rõ lý do), mục 4 (trường khi tạo, tiêu đề bắt buộc sau
 * khi cắt khoảng trắng, ưu tiên mặc định `Không`), mục 15 (chỉ chủ — hộp chỉ có
 * trong vỏ đã đăng nhập).
 *
 * Phần lớn ca dựng `<App />` ở đường `/khong-co` (trang "Không có trang này"):
 * trang đó **không gọi máy chủ**, nên mọi lượt gọi đếm được là của vỏ và của hộp.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { KHOA_LOC_TICKET, NHAN_TRANG_THAI, NHAN_UU_TIEN } from '../src/loc-ticket';
import {
  TRANG_THAI_KHI_TAO_MAC_DINH_WEB,
  TRANG_THAI_KHI_TAO_WEB,
  trangThaiDauTuTuyChon,
} from '../src/vo/mo-tao-viec';
import { NHAN_MO_MENU } from '../src/vo/thanh-tren';
import { NHAN_NUT_TAO } from '../src/vo/sidebar';
import {
  CAU_THIEU_DU_AN,
  CAU_THIEU_TIEU_DE,
  NHAN_HOP_TAO_VIEC,
  NHAN_NUT_DANG_TAO,
  NHAN_NUT_GUI_TAO,
  NHAN_O_CHA,
  NHAN_O_DU_AN,
  NHAN_O_MO_TA,
  NHAN_O_TIEU_DE,
  NHAN_O_TRANG_THAI,
  NHAN_O_UU_TIEN,
  NGUON_MA_DU_AN_WEB,
  UU_TIEN_MAC_DINH_WEB,
  chuanMaCha,
  dangSoanIme,
  duAnGoiY,
  kiemNhap,
  laPhimTaoViec,
  thanTaoViec,
} from '../src/vo/tao-viec';
import type { DuAnSidebar } from '../src/api';
import { LOI_401, MayChuGia, TOI_CHU, dung } from './giup';
import { doiAgent } from './than-agent';
import { dong, manHinhDanhSach, manHinhTicket, ticketDayDu, THAN_AGENT } from './than-ticket';
import { DA_XU_LY_RONG, manHinh, the } from './than-can-chu';
/*
 * Mã nguồn của `NGUON_MA_DU_AN` ở `shared`, đọc bằng `?raw` (nếp `cai-dat.test.tsx`):
 * giao diện cố ý không nhập `@baton/shared`.
 */
import KIEU_SHARED from '../../shared/src/kieu.ts?raw';
import MA_NHAN_SHARED from '../../shared/src/ma-nhan.ts?raw';
import {
  specDoiPhimTaoTicket,
  specDoiTieuDeBatBuoc,
  trangThaiKhiTaoTuSpec,
  uuTienMacDinhTuSpec,
} from './doc-spec';

const DU_AN: DuAnSidebar[] = [
  { id: 'id-SPX', ma: 'SPX', ten: 'Sample', trang_thai: 'active', nhom: null },
  { id: 'id-COS', ma: 'COS', ten: 'Chief of Staff', trang_thai: 'active', nhom: null },
  { id: 'id-CU', ma: 'CU', ten: 'Dự án cũ', trang_thai: 'archived', nhom: null },
];

const KET_QUA_TAO = { id: 'tk-new', ma: 'SPX-7', so: 7, tieu_de: 'Việc mới', trang_thai: 'todo' };

function may(): MayChuGia {
  return new MayChuGia()
    .dat('GET /v1/toi', { than: TOI_CHU })
    .dat('GET /v1/du-an?limit=200', { than: { items: DU_AN, cursor_sau: null } })
    .dat('GET /v1/can-chu', { than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null } } })
    .dat('GET /v1/man-hinh-agent', { than: doiAgent([]) })
    .dat('GET /v1/agent', { than: THAN_AGENT })
    .dat('GET /v1/man-hinh-ticket/ma/SPX-7', { than: manHinhTicket(ticketDayDu({ ma: 'SPX-7' })) });
}

async function vaoVo(
  m: MayChuGia,
  duong = '/khong-co',
  gan = true,
): Promise<ReturnType<typeof dung>> {
  // `gan = false`: ca đã tự gắn và bọc thêm `fetch` (đường danh sách nhận mọi truy vấn).
  if (gan) m.gan();
  const r = dung(<App />, duong);
  await screen.findByRole('navigation', { name: 'Điều hướng chính' });
  // Danh sách dự án của sidebar đã về (ô dự án của hộp đọc chung khoá này).
  // (`findAll`: trang Cần Chủ / danh sách có thêm ô lọc dự án mang cùng tên.)
  await screen.findAllByText('Sample');
  return r;
}

function hop(): HTMLElement {
  return screen.getByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
}

async function moBangPhim(): Promise<HTMLElement> {
  await userEvent.keyboard('c');
  return screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
}

function o(h: HTMLElement, nhan: string): HTMLInputElement {
  return within(h).getByLabelText(nhan);
}

afterEach(() => {
  document.body.style.overflow = '';
});

/* ================================================================== *
 * Lưới SPEC
 * ================================================================== */

describe('SPEC vẫn đòi đúng các câu mà hộp tạo việc dựa vào', () => {
  it('d.413 — "`C` tạo ticket"', () => {
    expect(specDoiPhimTaoTicket()).toBe(true);
  });

  it('mục 4 — tiêu đề bắt buộc, tính sau khi cắt khoảng trắng', () => {
    expect(specDoiTieuDeBatBuoc()).toEqual({ bat_buoc: true, cat_khoang_trang: true });
  });

  it('mục 4 — ưu tiên mặc định của hộp khớp chữ SPEC ("Mặc định `Không`")', () => {
    expect(NHAN_UU_TIEN[UU_TIEN_MAC_DINH_WEB]).toBe(uuTienMacDinhTuSpec());
  });
});

/* ================================================================== *
 * Hàm thuần
 * ================================================================== */

describe('hàm thuần của hộp', () => {
  const base = {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: document.body,
  };

  it('laPhimTaoViec: chỉ c/C, không phím phụ, không IME, không phím đã bị chặn', () => {
    expect(laPhimTaoViec({ ...base, key: 'c' })).toBe(true);
    expect(laPhimTaoViec({ ...base, key: 'C' })).toBe(true);
    for (const key of ['j', 'k', 's', 'd', '1', 'Enter', 'Escape', 'g']) {
      expect(laPhimTaoViec({ ...base, key }), key).toBe(false);
    }
    expect(laPhimTaoViec({ ...base, key: 'c', metaKey: true })).toBe(false);
    expect(laPhimTaoViec({ ...base, key: 'c', ctrlKey: true })).toBe(false);
    expect(laPhimTaoViec({ ...base, key: 'c', altKey: true })).toBe(false);
    expect(laPhimTaoViec({ ...base, key: 'c', isComposing: true })).toBe(false);
    expect(laPhimTaoViec({ ...base, key: 'c', defaultPrevented: true })).toBe(false);
  });

  it('laPhimTaoViec: đang gõ trong input/textarea/select/contenteditable thì KHÔNG', () => {
    const vung = document.createElement('div');
    vung.setAttribute('contenteditable', 'true');
    const con = document.createElement('span');
    vung.append(con);
    const cac = [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      vung,
      con,
    ];
    document.body.append(...cac.filter((x) => x !== con));
    try {
      for (const dich of cac) {
        expect(laPhimTaoViec({ ...base, key: 'c', target: dich }), dich.tagName).toBe(false);
      }
    } finally {
      for (const x of cac) if (x !== con) x.remove();
    }
  });

  it('kiemNhap: thiếu dự án / tiêu đề rỗng hoặc toàn khoảng trắng', () => {
    expect(kiemNhap({ project_id: '', tieu_de: '' })).toEqual({
      du_an: CAU_THIEU_DU_AN,
      tieu_de: CAU_THIEU_TIEU_DE,
    });
    expect(kiemNhap({ project_id: 'p', tieu_de: '   \n\t ' })).toEqual({ tieu_de: CAU_THIEU_TIEU_DE });
    expect(kiemNhap({ project_id: 'p', tieu_de: ' x ' })).toEqual({});
  });

  it('thanTaoViec: cắt tiêu đề, bỏ mô tả rỗng, cha chỉ là ID', () => {
    expect(
      thanTaoViec({ project_id: 'p', tieu_de: '  A  ', mo_ta: '  ', uu_tien: 'none' }, null),
    ).toEqual({ project_id: 'p', tieu_de: 'A', uu_tien: 'none' });
    expect(
      thanTaoViec({ project_id: 'p', tieu_de: 'A', mo_ta: '**m**', uu_tien: 'high' }, 'tk-1'),
    ).toEqual({ project_id: 'p', tieu_de: 'A', mo_ta: '**m**', uu_tien: 'high', ticket_cha_id: 'tk-1' });
  });

  it('duAnGoiY: chọn sẵn dự án theo đường; không đoán, bỏ dự án không có trong danh sách', () => {
    const ds = DU_AN.filter((d) => d.trang_thai !== 'archived');
    expect(duAnGoiY('/du-an/SPX', '', ds)).toBe('id-SPX');
    expect(duAnGoiY('/du-an/id-COS/ho-so', '', ds)).toBe('id-COS');
    expect(duAnGoiY('/t/SPX-12', '', ds)).toBe('id-SPX');
    // BAT-62: khoá lọc dự án THẬT trên URL của danh sách là `du_an` (`KHOA_LOC_TICKET`);
    // ca cũ ghim `?project_id=` — tên tham số máy chủ, không chỗ nào ghi nó lên URL.
    expect(duAnGoiY('/ticket', `?${KHOA_LOC_TICKET.du_an}=id-COS`, ds)).toBe('id-COS');
    expect(duAnGoiY('/ticket', '?xem=bang&du_an=id-COS', ds)).toBe('id-COS');
    expect(duAnGoiY('/ticket', '?project_id=id-COS', ds)).toBeNull();
    // Lọc nhiều hơn một dự án ⇒ không đoán.
    expect(duAnGoiY('/ticket', '?du_an=id-COS&du_an=id-SPX', ds)).toBeNull();
    expect(duAnGoiY('/ticket', '?du_an=', ds)).toBeNull();
    // Dự án lưu trữ (không có trong danh sách) ⇒ null.
    expect(duAnGoiY('/ticket', '?du_an=id-CU', ds)).toBeNull();
    expect(duAnGoiY('/du-an/CU', '', ds)).toBeNull();
    expect(duAnGoiY('/t/ZZZ-1', '', ds)).toBeNull();
    expect(duAnGoiY('/', '', ds)).toBeNull();
    expect(duAnGoiY('/ticket', '', ds)).toBeNull();
  });

  it('duAnGoiY `/t/<MÃ>`: theo đúng luật mã dự án của SPEC mục 2 (2–6 chữ A–Z), số từ 1', () => {
    const ds: DuAnSidebar[] = [
      { id: 'id-AB', ma: 'AB', ten: 'Hai chữ', trang_thai: 'active', nhom: null },
      { id: 'id-ABCDEF', ma: 'ABCDEF', ten: 'Sáu chữ', trang_thai: 'active', nhom: null },
    ];
    expect(duAnGoiY('/t/AB-1', '', ds)).toBe('id-AB');
    expect(duAnGoiY('/t/ABCDEF-120', '', ds)).toBe('id-ABCDEF');
    // Ngoài luật mã: 1 chữ, 7 chữ, có chữ số, chữ thường, số 0 đứng đầu.
    for (const p of ['/t/A-1', '/t/ABCDEFG-1', '/t/AB1-2', '/t/ab-1', '/t/AB-0', '/t/AB-01']) {
      expect(duAnGoiY(p, '', ds), p).toBeNull();
    }
  });

  it('bản chép lớp ký tự mã dự án của web BẰNG ĐÚNG `NGUON_MA_DU_AN` của @baton/shared', () => {
    const m = /export const NGUON_MA_DU_AN = '([^']+)'/.exec(KIEU_SHARED);
    if (m?.[1] === undefined) throw new Error('không tìm thấy NGUON_MA_DU_AN trong shared/src/kieu.ts');
    expect(NGUON_MA_DU_AN_WEB).toBe(m[1]);
  });

  it('chuanMaCha: cắt khoảng trắng, chữ hoa', () => {
    expect(chuanMaCha('  spx-3 ')).toBe('SPX-3');
    expect(chuanMaCha('SPX-3')).toBe('SPX-3');
    expect(chuanMaCha('   ')).toBe('');
  });
});

/* ================================================================== *
 * Mở / đóng
 * ================================================================== */

describe('d.413 — mở hộp: phím C và nút "Tạo việc"', () => {
  it('phím C mở hộp ở một trang bất kỳ của vỏ; Esc đóng', async () => {
    await vaoVo(may());
    expect(screen.queryByRole('dialog')).toBeNull();

    const h = await moBangPhim();
    expect(h.getAttribute('aria-modal')).toBe('true');
    // Chưa có dự án ⇒ con trỏ ở ô dự án; chữ `c` không rơi vào ô nào.
    expect(document.activeElement).toBe(o(h, NHAN_O_DU_AN));
    expect(o(h, NHAN_O_TIEU_DE).value).toBe('');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('chữ hoa C (Shift) cũng mở', async () => {
    await vaoVo(may());
    await userEvent.keyboard('{Shift>}C{/Shift}');
    expect(await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeTruthy();
  });

  it('nút "Tạo việc" của sidebar mở hộp; đóng thì focus trả về nút', async () => {
    await vaoVo(may());
    const nut = screen.getByLabelText(NHAN_NUT_TAO);
    await userEvent.click(nut);
    expect(hop()).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(nut);
  });

  it('KHÔNG mở khi đang gõ trong input / textarea (gõ chữ c vẫn là gõ chữ)', async () => {
    await vaoVo(may());
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    document.body.append(input, textarea);
    try {
      await userEvent.click(input);
      await userEvent.keyboard('c');
      expect(input.value).toBe('c');
      await userEvent.click(textarea);
      await userEvent.keyboard('cC');
      expect(textarea.value).toBe('cC');
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      input.remove();
      textarea.remove();
    }
  });

  it('KHÔNG mở với Ctrl/Meta/Alt + C (Cmd+C là sao chép)', async () => {
    await vaoVo(may());
    await userEvent.keyboard('{Control>}c{/Control}');
    await userEvent.keyboard('{Meta>}c{/Meta}');
    await userEvent.keyboard('{Alt>}c{/Alt}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('KHÔNG mở khi đang có một hộp modal khác (menu trượt 375px)', async () => {
    await vaoVo(may());
    await userEvent.click(screen.getByLabelText(NHAN_MO_MENU));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await userEvent.keyboard('c');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
  });

  it('bấm "Tạo việc" trong menu trượt: menu đóng, hộp mở — không hai lớp modal', async () => {
    await vaoVo(may());
    await userEvent.click(screen.getByLabelText(NHAN_MO_MENU));
    const menu = screen.getByRole('dialog');
    await userEvent.click(within(menu).getByLabelText(NHAN_NUT_TAO));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(hop()).toBeTruthy();
  });

  it('phím C khi hộp ĐÃ mở là một chữ gõ vào hộp, không mở hộp thứ hai', async () => {
    await vaoVo(may());
    const h = await moBangPhim();
    await userEvent.click(o(h, NHAN_O_TIEU_DE));
    await userEvent.keyboard('cc');
    expect(o(h, NHAN_O_TIEU_DE).value).toBe('cc');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('phím gõ TRONG hộp không lọt ra listener `window` của trang (Cmd/Ctrl+Enter của Cần Chủ, J/K, Esc)', async () => {
    await vaoVo(may());
    const h = await moBangPhim();
    const nghe = vi.fn();
    window.addEventListener('keydown', nghe);
    try {
      await userEvent.click(o(h, NHAN_O_MO_TA));
      await userEvent.keyboard('jks{Control>}{Enter}{/Control}');
      expect(nghe).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', nghe);
    }
  });

  it('đang ở trang của một dự án (`/t/SPX-7`) thì dự án đó được chọn sẵn, con trỏ ở ô tiêu đề', async () => {
    await vaoVo(may(), '/t/SPX-7');
    const h = await moBangPhim();
    expect(o(h, NHAN_O_DU_AN).value).toBe('id-SPX');
    expect(document.activeElement).toBe(o(h, NHAN_O_TIEU_DE));
  });

  it('ô dự án KHÔNG có dự án lưu trữ (không tạo được ticket trong đó)', async () => {
    await vaoVo(may());
    const h = await moBangPhim();
    const gia_tri = [...(o(h, NHAN_O_DU_AN) as unknown as HTMLSelectElement).options].map((x) => x.value);
    expect(gia_tri).toEqual(['', 'id-SPX', 'id-COS']);
  });
});

describe('mục 15 — hộp chỉ có trong vỏ ĐÃ đăng nhập', () => {
  it('trang đăng nhập: phím C không mở gì, không gọi `/v1/du-an`', async () => {
    const m = new MayChuGia().dat('GET /v1/toi', { http: 401, loi: LOI_401 }).gan();
    dung(<App />, '/khong-co');
    // Trang đăng nhập đã vẽ (ô mật khẩu), vỏ thì không.
    await waitFor(() => {
      expect(document.querySelector('input[name="mat_khau"]')).not.toBeNull();
    });
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
    await userEvent.keyboard('c');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(m.soLan('GET', '/v1/du-an?limit=200')).toBe(0);
    expect(m.da_goi.some((l) => l.method === 'POST')).toBe(false);
  });
});

/* ================================================================== *
 * Kiểm phía client
 * ================================================================== */

describe('mục 4 — thiếu dự án hoặc tiêu đề: báo ngay, KHÔNG gọi API', () => {
  it('bấm Tạo với hộp trống: hai câu báo, không POST', async () => {
    const m = may();
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.click(within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    expect(within(h).getByText(CAU_THIEU_DU_AN)).toBeTruthy();
    expect(within(h).getByText(CAU_THIEU_TIEU_DE)).toBeTruthy();
    expect(m.soLan('POST', '/v1/ticket')).toBe(0);
    // Con trỏ về ô thiếu đầu tiên.
    expect(document.activeElement).toBe(o(h, NHAN_O_DU_AN));
  });

  it('tiêu đề toàn khoảng trắng là thiếu — không POST', async () => {
    const m = may();
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), '    ');
    await userEvent.keyboard('{Enter}');
    expect(within(h).getByText(CAU_THIEU_TIEU_DE)).toBeTruthy();
    expect(within(h).queryByText(CAU_THIEU_DU_AN)).toBeNull();
    expect(m.soLan('POST', '/v1/ticket')).toBe(0);
  });
});

/* ================================================================== *
 * Gửi
 * ================================================================== */

describe('tạo thành công — đúng thân, làm mới danh sách, tới `/t/<MÃ>`', () => {
  it('gửi đúng thân (cha tra từ MÃ ra ID), đóng hộp, invalidate danh sách + tổng quan, mở chi tiết', async () => {
    const m = may()
      .dat('GET /v1/ticket/ma/SPX-3', { than: { id: 'tk-SPX-3', ma: 'SPX-3', tieu_de: 'Cha' } })
      .dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO });
    const { qc } = await vaoVo(m);
    // Hai màn hình có ticket đã nằm trong cache (không đang hiện).
    const k_ds = ['ticket', 'man-hinh', {}] as const;
    qc.setQueryData(k_ds, { pages: [], pageParams: [] });
    qc.setQueryData(['tong-quan'], { bay_gio: 1 });

    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), '  Việc mới  ');
    await userEvent.type(o(h, NHAN_O_MO_TA), '**đậm**');
    await userEvent.selectOptions(o(h, NHAN_O_UU_TIEN), 'high');
    await userEvent.type(o(h, NHAN_O_CHA), ' SPX-3 ');
    await userEvent.click(within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO }));

    await waitFor(() => {
      expect(m.soLan('GET', '/v1/man-hinh-ticket/ma/SPX-7')).toBe(1);
    });
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();

    const post = m.da_goi.filter((l) => l.method === 'POST' && l.duong === '/v1/ticket');
    expect(post).toHaveLength(1);
    expect(post[0]?.than).toEqual({
      project_id: 'id-SPX',
      tieu_de: 'Việc mới',
      mo_ta: '**đậm**',
      uu_tien: 'high',
      ticket_cha_id: 'tk-SPX-3',
    });
    // Mã không bao giờ đi vào `ticket_cha_id`.
    expect(m.soLan('GET', '/v1/ticket/ma/SPX-3')).toBe(1);

    expect(qc.getQueryState(k_ds)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['tong-quan'])?.isInvalidated).toBe(true);
  });

  it('không cha, không mô tả: thân chỉ có dự án, tiêu đề, ưu tiên mặc định `none`', async () => {
    const m = may().dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-COS');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'X{Enter}');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({
      project_id: 'id-COS',
      tieu_de: 'X',
      uu_tien: 'none',
    });
  });
});

describe('d.418 — máy chủ từ chối: báo đúng câu của máy chủ, GIỮ nội dung, cho bấm lại', () => {
  const LOI = { error: 'INVALID_INPUT', message: 'Tiêu đề ticket dài quá 200 ký tự.' };

  it('câu lỗi nguyên văn trong hộp và ở toast; mọi ô giữ nguyên; bấm lại gửi lần hai', async () => {
    const m = may().dat('POST /v1/ticket', { http: 422, loi: LOI });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'Tiêu đề');
    await userEvent.type(o(h, NHAN_O_MO_TA), 'mô tả');
    const gui = within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO });
    await userEvent.click(gui);

    expect((await within(h).findByRole('alert')).textContent).toBe(LOI.message);
    const toast = screen.getAllByRole('alert').filter((x) => !h.contains(x));
    expect(toast.map((x) => x.textContent)).toEqual([expect.stringContaining(LOI.message)]);

    expect(hop()).toBe(h);
    expect(o(h, NHAN_O_DU_AN).value).toBe('id-SPX');
    expect(o(h, NHAN_O_TIEU_DE).value).toBe('Tiêu đề');
    expect(o(h, NHAN_O_MO_TA).value).toBe('mô tả');
    expect(gui.hasAttribute('disabled')).toBe(false);

    await userEvent.click(gui);
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(2);
    });
  });

  it('mã việc cha không có: báo câu máy chủ kèm mã, KHÔNG POST', async () => {
    const m = may().dat('GET /v1/ticket/ma/SPX-99', {
      http: 404,
      loi: { error: 'NOT_FOUND', message: 'Không tìm thấy ticket.' },
    });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'Con');
    await userEvent.type(o(h, NHAN_O_CHA), 'SPX-99{Enter}');
    expect((await within(h).findByRole('alert')).textContent).toBe(
      'Việc cha SPX-99: Không tìm thấy ticket.',
    );
    expect(m.soLan('POST', '/v1/ticket')).toBe(0);
    expect(o(h, NHAN_O_CHA).value).toBe('SPX-99');
  });

  it('đang gửi: nút khoá, bấm/Enter thêm KHÔNG tạo đôi, Esc không đóng', async () => {
    let tha: (v: unknown) => void = () => undefined;
    const cho = new Promise((r) => {
      tha = r;
    });
    const m = may().dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO, cho });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'Một lần');
    await userEvent.click(within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO }));

    const nut = await within(h).findByRole('button', { name: NHAN_NUT_DANG_TAO });
    expect(nut.hasAttribute('disabled')).toBe(true);
    await userEvent.click(nut);
    await userEvent.click(o(h, NHAN_O_TIEU_DE));
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    expect(hop()).toBe(h);
    expect(m.soLan('POST', '/v1/ticket')).toBe(1);

    tha(null);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
    });
    expect(m.soLan('POST', '/v1/ticket')).toBe(1);
  });

  it('cha đã xoá mềm: tra mã được nhưng POST trả 404 — câu máy chủ nguyên văn, giữ nội dung', async () => {
    const LOI_CHA = { error: 'NOT_FOUND', message: 'Không tìm thấy ticket cha.' };
    const m = may()
      .dat('GET /v1/ticket/ma/SPX-3', { than: { id: 'tk-SPX-3', ma: 'SPX-3', tieu_de: 'Cha' } })
      .dat('POST /v1/ticket', { http: 404, loi: LOI_CHA });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'Con');
    await userEvent.type(o(h, NHAN_O_MO_TA), 'mô tả');
    await userEvent.type(o(h, NHAN_O_CHA), 'SPX-3{Enter}');

    expect((await within(h).findByRole('alert')).textContent).toBe(LOI_CHA.message);
    expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toMatchObject({
      ticket_cha_id: 'tk-SPX-3',
    });
    expect(hop()).toBe(h);
    expect(o(h, NHAN_O_TIEU_DE).value).toBe('Con');
    expect(o(h, NHAN_O_MO_TA).value).toBe('mô tả');
    expect(o(h, NHAN_O_CHA).value).toBe('SPX-3');
  });

  it('mã cha gõ chữ thường / có khoảng trắng: tra bằng mã đã chuẩn hoá', async () => {
    const m = may()
      .dat('GET /v1/ticket/ma/SPX-3', { than: { id: 'tk-SPX-3', ma: 'SPX-3', tieu_de: 'Cha' } })
      .dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'Con');
    await userEvent.type(o(h, NHAN_O_CHA), '  spx-3 {Enter}');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    expect(m.soLan('GET', '/v1/ticket/ma/SPX-3')).toBe(1);
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toMatchObject({
      ticket_cha_id: 'tk-SPX-3',
    });
  });
});

/* ================================================================== *
 * Hộp đang mở: phím KHÔNG lọt ra trang kể cả khi focus không ở trong hộp
 * ================================================================== */

/** Đẩy focus ra khỏi mọi phần tử — `activeElement` về `body`. */
function focusVeBody(): void {
  const dang = document.activeElement;
  if (dang instanceof HTMLElement) dang.blur();
  expect(document.activeElement).toBe(document.body);
}

describe('hộp đang mở — phím có đích NGOÀI hộp không tới listener của trang', () => {
  it('focus ở body: listener `window` (bubble) của trang KHÔNG nhận j/k/d/s/Ctrl+Enter/Esc', async () => {
    await vaoVo(may());
    await moBangPhim();
    const nghe = vi.fn();
    window.addEventListener('keydown', nghe);
    try {
      focusVeBody();
      await userEvent.keyboard('jkds12{Control>}{Enter}{/Control}{Meta>}{Enter}{/Meta}');
      expect(nghe).not.toHaveBeenCalled();
      expect(hop()).toBeTruthy();
    } finally {
      window.removeEventListener('keydown', nghe);
    }
  });

  it('Esc với focus ở body đóng hộp; lúc đang gửi thì không', async () => {
    let tha: (v: unknown) => void = () => undefined;
    const cho = new Promise((r) => {
      tha = r;
    });
    const m = may().dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO, cho });
    await vaoVo(m);
    let h = await moBangPhim();
    focusVeBody();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();

    h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'X');
    await userEvent.click(within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await within(h).findByRole('button', { name: NHAN_NUT_DANG_TAO });
    focusVeBody();
    await userEvent.keyboard('{Escape}');
    expect(hop()).toBe(h);
    tha(null);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
    });
  });

  it('lúc gửi, nút Tạo bị khoá: focus được giữ trong hộp (không rơi về body)', async () => {
    let tha: (v: unknown) => void = () => undefined;
    const cho = new Promise((r) => {
      tha = r;
    });
    const m = may().dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO, cho });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'X');
    await userEvent.click(within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await within(h).findByRole('button', { name: NHAN_NUT_DANG_TAO });
    expect(h.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLButtonElement).disabled ?? false).not.toBe(true);
    tha(null);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
    });
  });

  it('sau lỗi máy chủ, focus quay về trong hộp (ô tiêu đề); lỗi tra cha ⇒ ô cha', async () => {
    const m = may()
      .dat('POST /v1/ticket', {
        http: 422,
        loi: { error: 'INVALID_INPUT', message: 'Tiêu đề ticket dài quá 200 ký tự.' },
      })
      .dat('GET /v1/ticket/ma/SPX-99', {
        http: 404,
        loi: { error: 'NOT_FOUND', message: 'Không tìm thấy ticket.' },
      });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'X');
    await userEvent.click(within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await within(h).findByRole('alert');
    expect(document.activeElement).toBe(o(h, NHAN_O_TIEU_DE));

    await userEvent.type(o(h, NHAN_O_CHA), 'SPX-99');
    await userEvent.click(within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await waitFor(() => {
      expect(within(h).getByRole('alert').textContent).toBe('Việc cha SPX-99: Không tìm thấy ticket.');
    });
    expect(document.activeElement).toBe(o(h, NHAN_O_CHA));
  });

  it('Tab / Shift+Tab vòng trong hộp, không thoát ra trang; Tab từ body đi vào hộp', async () => {
    await vaoVo(may());
    const h = await moBangPhim();
    for (let i = 0; i < 15; i++) {
      await userEvent.tab();
      expect(h.contains(document.activeElement), `Tab lần ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 15; i++) {
      await userEvent.tab({ shift: true });
      expect(h.contains(document.activeElement), `Shift+Tab lần ${i + 1}`).toBe(true);
    }
    focusVeBody();
    await userEvent.tab();
    expect(h.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(h);
  });

  it('dangSoanIme: isComposing hoặc keyCode 229', () => {
    expect(dangSoanIme({ isComposing: true, keyCode: 27 })).toBe(true);
    expect(dangSoanIme({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(dangSoanIme({ isComposing: false, keyCode: 27 })).toBe(false);
  });

  it('Esc lúc đang soạn IME KHÔNG đóng hộp, nội dung còn nguyên (trong hộp và từ body)', async () => {
    await vaoVo(may());
    const h = await moBangPhim();
    const tieu_de = o(h, NHAN_O_TIEU_DE);
    await userEvent.type(tieu_de, 'Việc dở');

    // Trong hộp (onKeyDown của React).
    fireEvent.keyDown(tieu_de, { key: 'Escape', isComposing: true });
    expect(hop()).toBe(h);
    fireEvent.keyDown(tieu_de, { key: 'Escape', keyCode: 229 });
    expect(hop()).toBe(h);
    expect(o(h, NHAN_O_TIEU_DE).value).toBe('Việc dở');

    // Đích ngoài hộp (listener capture).
    focusVeBody();
    fireEvent.keyDown(document.body, { key: 'Escape', isComposing: true });
    expect(hop()).toBe(h);
    fireEvent.keyDown(document.body, { key: 'Escape', keyCode: 229 });
    expect(hop()).toBe(h);
    expect(o(h, NHAN_O_TIEU_DE).value).toBe('Việc dở');

    // Hết soạn: Esc đóng như thường.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
  });

  it('bấm vào chỗ trống trong hộp: focus ở khung hộp, không về body', async () => {
    await vaoVo(may());
    const h = await moBangPhim();
    await userEvent.click(within(h).getByRole('heading', { name: NHAN_HOP_TAO_VIEC }));
    expect(document.activeElement).toBe(h);
  });
});

describe('hộp mở trên `/can-chu` có thẻ đang chọn — thẻ phía sau KHÔNG bị gửi', () => {
  it('sau 422 focus ở body: gõ `d` và Ctrl+Enter không POST trả lời, hộp vẫn mở', async () => {
    const m = may()
      .dat('GET /v1/can-chu', { than: manHinh({ urgent: [the({ ma: 'T-1', loai: 'fyi' })] }) })
      .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
      .dat('POST /v1/can-chu/ct-T-1/xu-ly', { than: { ok: true } })
      .dat('POST /v1/ticket', {
        http: 422,
        loi: { error: 'INVALID_INPUT', message: 'Tiêu đề ticket dài quá 200 ký tự.' },
      });
    await vaoVo(m, '/can-chu');
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).not.toBeNull();
    });
    await userEvent.keyboard('j');
    expect(document.querySelector('[data-the="T-1"]')?.getAttribute('data-dang-chon')).toBe('co');

    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'X');
    await userEvent.click(within(h).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await within(h).findByRole('alert');

    focusVeBody();
    await userEvent.keyboard('d');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(m.soLan('POST', '/v1/can-chu/ct-T-1/xu-ly')).toBe(0);
    expect(hop()).toBe(h);
  });
});

describe('hộp mở trên `/ticket` có panel đang mở — Esc/J/K thuộc về hộp', () => {
  /** Đường màn hình nhận mọi chuỗi truy vấn: bọc `fetch` (nếp `danh-sach-ticket.test.tsx`). */
  function mayDanhSach(): MayChuGia {
    const m = may().gan();
    const goc = globalThis.fetch;
    const tra = (than: unknown): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(than), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    globalThis.fetch = ((duong: string, init?: RequestInit) => {
      const ma = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
      if (ma !== undefined) {
        return tra(manHinhTicket(ticketDayDu({ ma: decodeURIComponent(ma), tieu_de: 'Thân panel' })));
      }
      if (duong.startsWith('/v1/man-hinh-ticket')) {
        return tra(manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })]));
      }
      return goc(duong, init);
    }) as typeof globalThis.fetch;
    return m;
  }

  function panelDangMo(): string | null {
    return (
      document.querySelector('[data-trang-thai-panel]')?.getAttribute('data-trang-thai-panel') ?? null
    );
  }

  it('focus ở body: Esc đóng hộp chứ không đóng panel; J/K không đổi thẻ chọn', async () => {
    await vaoVo(mayDanhSach(), '/ticket?xem=danh-sach', false);
    await waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });
    await userEvent.keyboard('j');
    await waitFor(() => {
      expect(panelDangMo()).toBe('SAI-1');
    });

    focusVeBody();
    await moBangPhim();
    focusVeBody();
    await userEvent.keyboard('jjk');
    expect(panelDangMo()).toBe('SAI-1');
    expect(hop()).toBeTruthy();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
    expect(panelDangMo()).toBe('SAI-1');
  });

  it('hồi quy: đóng hộp thì listener capture đã gỡ — Esc lần hai đóng panel', async () => {
    await vaoVo(mayDanhSach(), '/ticket?xem=danh-sach', false);
    await waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });
    await userEvent.keyboard('j');
    await waitFor(() => {
      expect(panelDangMo()).toBe('SAI-1');
    });

    focusVeBody();
    await moBangPhim();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
    expect(panelDangMo()).toBe('SAI-1');

    focusVeBody();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(panelDangMo()).toBeNull();
    });
  });
});

/* ================================================================== *
 * BAT-63 — ô Trạng thái: Cần làm (mặc định) / Backlog (T-108 = B)
 * ================================================================== */

describe('BAT-63 — SPEC mục 4 "Trạng thái khi tạo": ô Trạng thái của hộp', () => {
  it('lưới SPEC: hai lựa chọn của hộp = mặc định + "được chọn" của câu SPEC, đúng thứ tự', () => {
    const spec = trangThaiKhiTaoTuSpec();
    expect(TRANG_THAI_KHI_TAO_WEB.map((t) => NHAN_TRANG_THAI[t])).toEqual([
      spec.mac_dinh,
      ...spec.chon_them,
    ]);
    expect(NHAN_TRANG_THAI[TRANG_THAI_KHI_TAO_MAC_DINH_WEB]).toBe(spec.mac_dinh);
    expect(spec.cam_con_lai).toBe(true);
  });

  it('bản chép của web BẰNG ĐÚNG `TRANG_THAI_TICKET_KHI_TAO` của @baton/shared', () => {
    const khop = /export const TRANG_THAI_TICKET_KHI_TAO = \[([^\]]*)\]/.exec(MA_NHAN_SHARED);
    expect(khop?.[1]).toBeDefined();
    const shared = [...(khop?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((k) => k[1]);
    expect(shared).toEqual([...TRANG_THAI_KHI_TAO_WEB]);
  });

  it('trangThaiDauTuTuyChon: chỉ `{ trang_thai: backlog }` ra Backlog; mọi thứ khác ⇒ Cần làm', () => {
    expect(trangThaiDauTuTuyChon(undefined)).toBe('todo');
    expect(trangThaiDauTuTuyChon(null)).toBe('todo');
    expect(trangThaiDauTuTuyChon({})).toBe('todo');
    expect(trangThaiDauTuTuyChon({ trang_thai: 'backlog' })).toBe('backlog');
    expect(trangThaiDauTuTuyChon({ trang_thai: 'todo' })).toBe('todo');
    // Trạng thái hợp lệ khác không đặt được lúc tạo — không lọt qua đường mở hộp.
    for (const la of ['in_progress', 'verifying', 'done', 'canceled', 'duplicate', '', 'xyz', 5]) {
      expect(trangThaiDauTuTuyChon({ trang_thai: la }), String(la)).toBe('todo');
    }
    // `moHop` gắn thẳng vào `onClick` nhận một sự kiện bấm ⇒ Cần làm.
    expect(trangThaiDauTuTuyChon(new MouseEvent('click'))).toBe('todo');
  });

  it('thanTaoViec: Backlog ⇒ có `trang_thai: backlog`; Cần làm / thiếu ⇒ KHÔNG gửi trường', () => {
    const n = { project_id: 'p', tieu_de: 'T', mo_ta: '', uu_tien: 'none' as const };
    expect(thanTaoViec({ ...n, trang_thai: 'backlog' }, null)).toEqual({
      project_id: 'p',
      tieu_de: 'T',
      uu_tien: 'none',
      trang_thai: 'backlog',
    });
    expect(thanTaoViec({ ...n, trang_thai: 'todo' }, null)).not.toHaveProperty('trang_thai');
    expect(thanTaoViec(n, null)).not.toHaveProperty('trang_thai');
  });

  it('phím C: ô Trạng thái mặc định Cần làm, đúng HAI lựa chọn (Cần làm, Backlog)', async () => {
    await vaoVo(may());
    const h = await moBangPhim();
    const o_tt = within(h).getByLabelText<HTMLSelectElement>(NHAN_O_TRANG_THAI);
    expect(o_tt.value).toBe('todo');
    expect([...o_tt.options].map((x) => [x.value, x.textContent])).toEqual([
      ['todo', NHAN_TRANG_THAI.todo],
      ['backlog', NHAN_TRANG_THAI.backlog],
    ]);
  });

  it('đổi sang Backlog rồi gửi ⇒ thân có `trang_thai: backlog`; danh sách + tổng quan vẫn được làm mới', async () => {
    const m = may().dat('POST /v1/ticket', {
      http: 201,
      than: { ...KET_QUA_TAO, trang_thai: 'backlog' },
    });
    const { qc } = await vaoVo(m);
    const k_ds = ['ticket', 'man-hinh', {}] as const;
    qc.setQueryData(k_ds, { pages: [], pageParams: [] });
    qc.setQueryData(['tong-quan'], { bay_gio: 1 });

    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    await userEvent.selectOptions(o(h, NHAN_O_TRANG_THAI), 'backlog');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'Ý tưởng{Enter}');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({
      project_id: 'id-SPX',
      tieu_de: 'Ý tưởng',
      uu_tien: 'none',
      trang_thai: 'backlog',
    });
    // Không chèn lạc quan theo `todo`: danh sách đọc lại từ máy chủ ⇒ ticket vào đúng nhóm Backlog.
    expect(qc.getQueryState(k_ds)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['tong-quan'])?.isInvalidated).toBe(true);
  });

  it('KHÔNG gửi được trạng thái thứ ba: ép giá trị lạ vào ô ⇒ ô về Cần làm, thân không có `trang_thai`', async () => {
    const m = may().dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO });
    await vaoVo(m);
    const h = await moBangPhim();
    await userEvent.selectOptions(o(h, NHAN_O_DU_AN), 'id-SPX');
    const o_tt = within(h).getByLabelText<HTMLSelectElement>(NHAN_O_TRANG_THAI);
    await userEvent.selectOptions(o_tt, 'backlog');
    fireEvent.change(o_tt, { target: { value: 'done' } });
    expect(o_tt.value).toBe('todo');
    await userEvent.type(o(h, NHAN_O_TIEU_DE), 'X{Enter}');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).not.toHaveProperty('trang_thai');
  });
});
