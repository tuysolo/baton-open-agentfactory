/**
 * **Khung chung kiểu Linear** — BAT-6 đợt 1: sidebar (đầu sidebar, "Việc của
 * tôi", nhóm thu gọn **nhớ** được, nhóm Đội agent), breadcrumb của thanh trên,
 * và menu trượt ở 375px (d.411).
 *
 * Phần SPEC chạm tới: mục 14 d.391–394 (sidebar), d.411 (375px). Phần ngoài
 * SPEC (yêu cầu của chủ qua brief) ghi ở `cau-hoi-spec.md` #125–#129 — ca ở đây
 * ghim **đề xuất tạm đang dùng**, nên khi chủ chốt khác thì ca đỏ, không âm thầm
 * lệch.
 *
 * Hai điều ca ở đây **cố ý không** làm:
 *   * không lặp lại các ca d.391–394 của `sidebar.test.tsx` (đủ mục, đúng thứ
 *     tự, huy hiệu, dự án `archived`) — chúng vẫn là chỗ canh SPEC;
 *   * không kiểm màu. Không một ca test nào trong jsdom đo được tương phản (CSS
 *     của Tailwind không được nạp). Vế "đọc được ở cả hai chế độ" được canh bằng
 *     **rà tay từng trang**, ghi trong báo cáo, và bằng lưới "không mã màu cứng
 *     trong component" dưới đây.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { NHAN_COMMAND_MENU } from '../src/vo/command-menu';
import { NHAN_DONG_MENU, NHAN_MENU_TRUOT } from '../src/App';
import {
  NHAN_DANG_XUAT,
  NHAN_DANG_XUAT_MOI_NOI,
  NHAN_MENU_WORKSPACE,
  NHAN_NHOM_DOI_AGENT,
  NHAN_NHOM_DU_AN,
  NHAN_NUT_TAO,
  NHAN_NUT_TIM,
  Sidebar,
  TEN_WORKSPACE,
} from '../src/vo/sidebar';
import { NHAN_DUONG_DAN, NHAN_MO_MENU } from '../src/vo/thanh-tren';
import {
  MUC_CHINH,
  MUC_CUOI,
  NHAN_BAN_DO,
  NHAN_TAT_CA_VIEC,
} from '../src/vo/muc-sidebar';
import {
  CHANG_HO_SO,
  CHANG_TAT_CA_DU_AN,
  CHANG_VIEC,
  DAU_CHANG,
  duongDanTuUrl,
} from '../src/vo/duong-dan';
import {
  KHOA_THU_GON,
  NHOM_DOI_AGENT,
  NHOM_DU_AN,
  dangMo,
  daoThuGon,
  docThuGon,
  khoaDuAn,
  luuThuGon,
} from '../src/vo/thu-gon';
import {
  LOP_MUC_GAP,
  LOP_NHAN,
  LOP_TRANG_THAI,
  LOP_TRANG_THAI_AGENT,
  LOP_UU_TIEN,
} from '../src/vo/mau-the';
import type { DuAnSidebar } from '../src/api';
import { MayChuGia, TOI_CHU, datKhoGia, dung } from './giup';
import { agentDong, doiAgent } from './than-agent';
import { specDoiDoiAgentVaBanDo, specDoiMenuWorkspace } from './doc-spec';

/*
 * **`kieu.css` đọc bằng `node:fs`, KHÔNG bằng `?raw`** — ngoại lệ có lý do của
 * nếp `doc-spec.ts` (nơi `SPEC.md` đi qua `?raw`): dưới vitest, CSS bị tắt
 * (`test.css` mặc định `false`), nên `import … from '../src/kieu.css?raw'` trả
 * về **chuỗi rỗng** — đã đo cả `import … from '…?raw'` và `import.meta.glob`,
 * cả hai cho `length === 0`, và cả lưới tương phản bên dưới **xanh vì không màu
 * nào tra được**: đúng loại lưới mục mà ca "bảng màu đủ hai cột" tồn tại để bắt.
 * Khai kiểu tối thiểu ở `test/moi-truong-node.d.ts` (và **chỉ** ở `test/`).
 *
 * Đường lấy từ **`expect.getState().testPath`** (đường tuyệt đối của chính file
 * test này), không từ `import.meta.url` và không từ `process.cwd()`: dưới
 * vite-node `import.meta.url` **không** phải scheme `file:` (đã thử: `TypeError:
 * The URL must be of scheme file`), còn `cwd` thì phụ thuộc cách gõ lệnh — đúng
 * cái bẫy mà `vitest.config.ts` đã ghi (32 ca từng im lặng biến mất vì nó).
 */
function docKieuCss(): string {
  const duong = expect.getState().testPath;
  if (duong === undefined) throw new Error('Không biết đường của file test');
  return readFileSync(join(dirname(duong), '..', 'src', 'kieu.css'), 'utf8');
}

function duAn(p: Partial<DuAnSidebar> & { ma: string }): DuAnSidebar {
  return {
    id: `id-${p.ma}`,
    ten: p.ten ?? `Dự án ${p.ma}`,
    trang_thai: p.trang_thai ?? 'active',
    nhom: p.nhom ?? null,
    ...p,
  };
}

const AGENT = [
  agentDong({ id: 'ag-1', ten: 'W-builder', trang_thai: 'busy', nhan_trang_thai: 'Đang làm' }),
  agentDong({ id: 'ag-2', ten: 'W-reviewer', trang_thai: 'idle', nhan_trang_thai: 'Rảnh' }),
];

/**
 * Tên nhóm **khác** tên dự án trong mọi ca: một dự án "Sample" trong nhóm
 * "Sample" làm `findByText('Sample')` thấy hai phần tử, và ca đỏ vì một lý do
 * không liên quan đến luật đang kiểm.
 */
const NHOM = 'Nhóm S';

function may(ds: DuAnSidebar[] = [duAn({ ma: 'SPX', ten: 'Sample', nhom: NHOM })]): MayChuGia {
  return new MayChuGia()
    .dat('GET /v1/toi', { than: TOI_CHU })
    .dat('GET /v1/du-an?limit=200', { than: { items: ds, cursor_sau: null } })
    .dat('GET /v1/can-chu', { than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null } } })
    .dat('GET /v1/man-hinh-agent', { than: doiAgent(AGENT) })
    .gan();
}

function donDep(): void {
  try {
    globalThis.localStorage.removeItem(KHOA_THU_GON);
  } catch {
    /* không có kho thì không có gì phải dọn. */
  }
}

beforeEach(() => {
  // Kho mới mỗi ca — xem `datKhoGia` ở `giup.tsx`: môi trường test không có
  // `localStorage` dùng được, nên không có nó thì mọi ca "nhớ" xanh vì không
  // nhớ gì.
  datKhoGia();
  donDep();
});
afterEach(donDep);

describe('đầu sidebar: workspace, tìm, tạo việc', () => {
  it('có tên workspace, nút Tìm, nút Tạo việc', async () => {
    may();
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    // Tên workspace nay là một **nút mở menu** (d.401), nên đọc chữ bên trong nó.
    expect(nav.querySelector('[data-o="ten-workspace"]')?.textContent).toContain(TEN_WORKSPACE);
    expect(screen.getByLabelText(NHAN_NUT_TIM)).toBeTruthy();
    expect(screen.getByLabelText(NHAN_NUT_TAO)).toBeTruthy();
  });

  it('nút Tìm mở command menu (BAT-34, d.414): BẬT khi vỏ truyền `onTimNhanh`, bấm là gọi nó; title nhắc Cmd/Ctrl+K', async () => {
    may();
    const mo = vi.fn();
    dung(<Sidebar onTimNhanh={mo} />);
    const nut = await screen.findByLabelText(NHAN_NUT_TIM);
    expect(nut.tagName).toBe('BUTTON');
    expect(nut.getAttribute('href')).toBeNull();
    expect(nut.hasAttribute('disabled')).toBe(false);
    expect(nut.getAttribute('title')).toContain('Cmd/Ctrl+K');
    await userEvent.click(nut);
    expect(mo).toHaveBeenCalledTimes(1);
  });

  it('sidebar dựng KHÔNG có vỏ (không `onTimNhanh`) thì nút Tìm mờ', async () => {
    may();
    dung(<Sidebar />);
    expect((await screen.findByLabelText(NHAN_NUT_TIM)).hasAttribute('disabled')).toBe(true);
  });

  it('nút Tạo việc BẬT khi vỏ truyền `onTaoViec`, bấm là gọi nó; title nhắc phím C (d.413)', async () => {
    may();
    const mo = vi.fn();
    dung(<Sidebar onTaoViec={mo} />);
    const nut = await screen.findByLabelText(NHAN_NUT_TAO);
    expect(nut.hasAttribute('disabled')).toBe(false);
    expect(nut.getAttribute('title')).toContain('C');
    await userEvent.click(nut);
    expect(mo).toHaveBeenCalledTimes(1);
  });

  it('sidebar dựng KHÔNG có vỏ (không `onTaoViec`) thì nút Tạo việc mờ — không có hộp để mở', async () => {
    may();
    dung(<Sidebar />);
    const nut = await screen.findByLabelText(NHAN_NUT_TAO);
    expect(nut.hasAttribute('disabled')).toBe(true);
  });
});

describe('SPEC vẫn đòi đúng các câu của bản soát UI (lưới của các ca dưới)', () => {
  it('d.401 — tên workspace mở menu hai nút, và chúng không nằm trần trên thanh trên', () => {
    expect(specDoiMenuWorkspace()).toEqual({ menu_o_ten: true, khong_nam_tran: true });
  });

  it('d.397–398 — tiêu đề "Đội agent" bấm được, không link thứ hai; Bản đồ không có mục riêng', () => {
    expect(specDoiDoiAgentVaBanDo()).toEqual({
      tieu_de_bam_duoc: true,
      khong_link_thu_hai: true,
      ban_do_khong_co_muc: true,
    });
  });
});

describe('d.397 — "Đội agent": MỘT link duy nhất, và nó cũng là tiêu đề nhóm', () => {
  it('đúng MỘT link tới `/doi-agent` trong cả sidebar', async () => {
    may();
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await screen.findByText('W-builder');

    const toi_doi_agent = [...nav.querySelectorAll('a')].filter(
      (a) => a.getAttribute('href') === '/doi-agent',
    );
    expect(toi_doi_agent).toHaveLength(1);
  });

  it('link ấy là tiêu đề nhóm: cạnh nó là nút thu gọn, và danh sách agent nằm dưới', async () => {
    may();
    dung(<Sidebar />);
    const lien = await screen.findByRole('link', { name: /^Đội agent/ });
    expect(lien.getAttribute('href')).toBe('/doi-agent');

    // Nút thu gọn mang cùng nhãn (một chỗ, một tên), và nhóm mở sẵn. `find…`:
    // nút chỉ dựng khi thân `/v1/man-hinh-agent` đã về (không dựng nhóm rỗng).
    const nut = await screen.findByRole('button', { name: NHAN_NHOM_DOI_AGENT });
    expect(nut.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByText('W-builder')).toBeTruthy();

    await userEvent.click(nut);
    expect(nut.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('W-builder')).toBeNull();
    // Nhưng **link** vẫn còn: thu gọn danh sách không được lấy đi đường vào trang.
    expect(screen.getByRole('link', { name: /^Đội agent/ })).toBeTruthy();
  });
});

describe('d.401 — tên workspace mở menu chứa hai nút đăng xuất', () => {
  /*
   * Hành vi **nghiệp vụ** của hai nút (hai đường của d.415, `onSettled` xoá cache
   * trừ `['toi']`) có ca riêng ở `dang-nhap.test.tsx` — ở đây là **hình và bàn
   * phím**: menu không mở sẵn, mở được, `Escape` đóng và trả focus, và hai nút
   * **không** còn nằm trần trên thanh trên.
   */
  it('chưa bấm gì ⇒ KHÔNG có nút đăng xuất nào trên màn hình', async () => {
    may();
    dung(<App />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    expect(screen.queryByRole('menu', { name: NHAN_MENU_WORKSPACE })).toBeNull();
    expect(screen.queryByText(NHAN_DANG_XUAT)).toBeNull();
    expect(screen.queryByText(NHAN_DANG_XUAT_MOI_NOI)).toBeNull();
  });

  it('bấm tên workspace ⇒ menu có ĐỦ HAI nút của d.415', async () => {
    may();
    dung(<Sidebar />);
    const nut = await screen.findByRole('button', { name: TEN_WORKSPACE });
    expect(nut.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(nut);
    expect(nut.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: NHAN_MENU_WORKSPACE });
    expect(within(menu).getByRole('menuitem', { name: NHAN_DANG_XUAT })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: NHAN_DANG_XUAT_MOI_NOI })).toBeTruthy();
  });

  it('`Escape` đóng menu và TRẢ FOCUS về nút tên workspace', async () => {
    may();
    dung(<Sidebar />);
    const nut = await screen.findByRole('button', { name: TEN_WORKSPACE });
    await userEvent.click(nut);
    // Menu tự lấy focus khi mở, nếu không `Escape` không bao giờ tới `onKeyDown`.
    expect(
      screen.getByRole('menu', { name: NHAN_MENU_WORKSPACE }).contains(document.activeElement),
    ).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: NHAN_MENU_WORKSPACE })).toBeNull();
    expect(document.activeElement).toBe(nut);
  });

  it('thanh trên KHÔNG còn nút đăng xuất nào (d.401 "không nằm trần")', async () => {
    may();
    dung(<App />);
    const thanh = (await screen.findByRole('navigation', { name: NHAN_DUONG_DAN })).closest(
      'header',
    );
    expect(thanh).not.toBeNull();
    expect(thanh?.textContent).not.toContain(NHAN_DANG_XUAT);
  });
});

describe('d.392 — KHÔNG còn mục ngoài SPEC nào chen vào danh sách mục chính', () => {
  /**
   * **"Việc của tôi" đã bỏ** (BAT-6 đợt 3 phần B): nó trùng nghĩa với "Cần Chủ"
   * — chỉ là `/ticket?can_chu=co` — và d.392 nay có một mục thật cho chỗ ấy,
   * "Tất cả việc". Ca này là lưới cho **cả hai** vế: không còn mục ngoài SPEC
   * trong khối mục chính, và số `data-muc="chinh"` vẫn đúng bằng sáu + Cài đặt
   * (lưới giữ cho `sidebar.test.tsx` không thành vô nghĩa).
   */
  it('`data-muc="chinh"` đúng bằng sáu mục + Cài đặt, không `data-muc-them="chinh"` nào', async () => {
    may();
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    expect(nav.querySelectorAll('[data-muc="chinh"]').length).toBe(MUC_CHINH.length + 1);
    expect(nav.querySelectorAll('[data-muc-them="chinh"]').length).toBe(0);
    expect(screen.queryByRole('link', { name: 'Việc của tôi' })).toBeNull();
  });

  it('"Bản đồ dự án" KHÔNG còn là mục sidebar (d.398), nhưng vào được từ một dự án', async () => {
    may([duAn({ ma: 'SPX', ten: 'Sample', nhom: NHOM })]);
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    // Không một mục chính nào tên "Bản đồ dự án".
    const nhan_chinh = [...nav.querySelectorAll('[data-muc="chinh"] [data-nhan="co"]')].map(
      (e) => e.textContent,
    );
    expect(nhan_chinh).not.toContain(NHAN_BAN_DO);

    // Nhưng mở một dự án ra thì có đường vào, và nó trỏ đúng trang.
    await userEvent.click(await screen.findByLabelText('Mở rộng dự án Sample'));
    const lien = screen.getByRole('link', { name: NHAN_BAN_DO });
    expect(lien.getAttribute('href')).toBe('/ban-do-du-an');
  });
});

describe('d.394 — "Cài đặt" luôn ở đáy sidebar, ngoài khối cuộn (BAT-11 việc 3)', () => {
  /*
   * jsdom không đo layout nên canh theo CẤU TRÚC: Cài đặt là `data-muc` cuối
   * cùng và KHÔNG nằm trong khối `overflow-y-auto` (khối cuộn của dự án).
   */
  function kiemCaiDatOCuoi(nav: HTMLElement): void {
    const muc = [...nav.querySelectorAll('[data-muc]')];
    const cuoi = muc[muc.length - 1];
    expect(cuoi?.textContent).toBe(MUC_CUOI.nhan);
    expect(cuoi?.closest('.overflow-y-auto')).toBeNull();
    // Các dự án thì nằm TRONG khối cuộn.
    for (const d of nav.querySelectorAll('[data-muc="du-an"]')) {
      expect(d.closest('.overflow-y-auto')).not.toBeNull();
    }
  }

  it('nhóm Dự án mở ⇒ Cài đặt là mục cuối, ngoài khối cuộn', async () => {
    may();
    dung(<Sidebar />);
    await screen.findByText('Sample');
    kiemCaiDatOCuoi(screen.getByRole('navigation', { name: 'Điều hướng chính' }));
  });

  it('nhóm Dự án gập ⇒ Cài đặt vẫn có mặt, là mục cuối, ngoài khối cuộn', async () => {
    may();
    dung(<Sidebar />);
    await screen.findByText('Sample');
    await userEvent.click(screen.getByRole('button', { name: NHAN_NHOM_DU_AN }));
    expect(screen.queryByText('Sample')).toBeNull();
    kiemCaiDatOCuoi(screen.getByRole('navigation', { name: 'Điều hướng chính' }));
  });

  it('Đội agent mở ⇒ danh sách agent không đẩy Cài đặt khỏi vị trí cuối', async () => {
    may();
    dung(<Sidebar />);
    await screen.findByText('W-builder');
    kiemCaiDatOCuoi(screen.getByRole('navigation', { name: 'Điều hướng chính' }));
  });

  it('aside desktop của App dính đầu và cao đúng một màn hình (`sticky` + `h-screen`)', async () => {
    may();
    dung(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    const aside = nav.closest('aside');
    expect(aside).not.toBeNull();
    // Thiếu một trong hai lớp này, aside giãn theo cả trang và Cài đặt trôi xuống đáy trang.
    expect(aside?.classList.contains('sticky')).toBe(true);
    expect(aside?.classList.contains('h-screen')).toBe(true);
    expect(aside?.classList.contains('top-0')).toBe(true);
  });
});

describe('d.394 — cửa sổ THẤP: chỉ vùng giữa co lại và cuộn, "Cài đặt" vẫn thấy (BAT-12 việc 3)', () => {
  /*
   * jsdom không đo layout, nên canh đúng các lớp bảo đảm điều đó trong flex cột:
   *   * nav là flex cột cao đầy (`flex flex-col h-full`);
   *   * vùng giữa `flex-1 min-h-0 overflow-y-auto`: thiếu `min-h-0` thì flex con
   *     không co dưới chiều cao nội dung và đẩy đáy ra ngoài;
   *   * đầu và đáy `shrink-0`: không bị ép mất;
   *   * mọi thứ có thể dài ra (sáu mục chính, danh sách agent, dự án) nằm TRONG
   *     vùng giữa — ngoài nó thì chúng lại đẩy "Cài đặt" xuống.
   */
  function vung(nav: HTMLElement, ten: 'dau' | 'giua' | 'day'): HTMLElement {
    const ds = nav.querySelectorAll<HTMLElement>(`:scope > [data-vung-sidebar="${ten}"]`);
    expect(ds).toHaveLength(1);
    return ds[0] as HTMLElement;
  }

  it('nav chia đúng ba vùng con trực tiếp, theo thứ tự đầu → giữa → đáy', async () => {
    may();
    dung(<Sidebar />);
    await screen.findByText('Sample');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    for (const lop of ['flex', 'flex-col', 'h-full']) expect(nav.classList.contains(lop), lop).toBe(true);
    expect([...nav.children].map((c) => c.getAttribute('data-vung-sidebar'))).toEqual([
      'dau',
      'giua',
      'day',
    ]);
  });

  it('vùng giữa co được và cuộn được; đầu và đáy không co', async () => {
    may();
    dung(<Sidebar />);
    await screen.findByText('Sample');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const giua = vung(nav, 'giua');
    for (const lop of ['flex-1', 'min-h-0', 'overflow-y-auto']) {
      expect(giua.classList.contains(lop), lop).toBe(true);
    }
    expect(vung(nav, 'dau').classList.contains('shrink-0')).toBe(true);
    expect(vung(nav, 'day').classList.contains('shrink-0')).toBe(true);
  });

  it('"Cài đặt" nằm ở vùng đáy; sáu mục chính, danh sách agent và dự án nằm ở vùng giữa', async () => {
    may();
    dung(<Sidebar />);
    await screen.findByText('Sample');
    await screen.findByText('W-builder');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const giua = vung(nav, 'giua');
    const day = vung(nav, 'day');

    const cai_dat = [...nav.querySelectorAll('[data-muc]')].filter(
      (e) => e.textContent === MUC_CUOI.nhan,
    );
    expect(cai_dat).toHaveLength(1);
    expect(day.contains(cai_dat[0] as Node)).toBe(true);

    for (const e of nav.querySelectorAll('[data-muc], [data-muc-them="agent"]')) {
      if (e === cai_dat[0]) continue;
      expect(giua.contains(e), e.textContent ?? '').toBe(true);
    }
  });
});

describe('điều hướng: mọi mục sidebar trỏ tới đúng đường của sổ tra', () => {
  it('sáu mục + Cài đặt — đủ, và đúng `href`', async () => {
    may();
    dung(<Sidebar />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    for (const m of [...MUC_CHINH, MUC_CUOI]) {
      const lien = screen.getByRole('link', { name: new RegExp(`^${m.nhan}`) });
      expect(lien.getAttribute('href')).toBe(m.duong);
    }
  });

  it('một dự án mở ra Việc / Bản đồ dự án / Hồ sơ, không đường nào bỏ trống', async () => {
    may([duAn({ ma: 'SPX', ten: 'Sample', nhom: NHOM })]);
    dung(<Sidebar />);
    // Mặc định một dự án **đóng**: sidebar không dài gấp bốn ngay lần đầu.
    const nut = await screen.findByLabelText('Mở rộng dự án Sample');
    expect(nut.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(nut);
    expect(nut.getAttribute('aria-expanded')).toBe('true');
    const con = [...document.querySelectorAll('[data-muc-them="du-an-con"]')];
    expect(con.map((e) => e.textContent)).toEqual(['Việc', NHAN_BAN_DO, 'Hồ sơ']);
    expect(con.map((e) => e.getAttribute('href'))).toEqual([
      '/du-an/SPX',
      '/ban-do-du-an',
      '/du-an/id-SPX/ho-so',
    ]);
  });
});

describe('nhóm thu gọn được, và NHỚ trạng thái thu gọn', () => {
  it('hai nhóm lớn mở sẵn, một dự án đóng sẵn — luật thuần', () => {
    const rong = new Set<string>();
    expect(dangMo(rong, NHOM_DU_AN)).toBe(true);
    expect(dangMo(rong, NHOM_DOI_AGENT)).toBe(true);
    expect(dangMo(rong, khoaDuAn('SPX'))).toBe(false);
    // Tập lưu là "khác mặc định", nên nó đảo cả hai chiều.
    expect(dangMo(daoThuGon(rong, NHOM_DU_AN), NHOM_DU_AN)).toBe(false);
    expect(dangMo(daoThuGon(rong, khoaDuAn('SPX')), khoaDuAn('SPX'))).toBe(true);
  });

  it('dữ liệu HỎNG trong kho ⇒ coi như chưa thu gọn gì, không ném', () => {
    const kho = { getItem: (): string => '{không phải json', setItem: (): void => undefined };
    expect(docThuGon(kho).size).toBe(0);
    const kho2 = { getItem: (): string => '"một chuỗi"', setItem: (): void => undefined };
    expect(docThuGon(kho2).size).toBe(0);
  });

  it('bấm tiêu đề nhóm Dự án ⇒ danh sách dự án biến mất, và `aria-expanded` đổi', async () => {
    may([duAn({ ma: 'SPX', ten: 'Sample', nhom: NHOM })]);
    dung(<Sidebar />);
    expect(await screen.findByText('Sample')).toBeTruthy();

    const nut = screen.getByRole('button', { name: NHAN_NHOM_DU_AN });
    expect(nut.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(nut);

    expect(nut.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: `Nhóm dự án: ${NHOM}` })).toBeNull();
  });

  it('thu gọn rồi DỰNG LẠI ⇒ vẫn thu gọn (nhớ qua lần tải sau)', async () => {
    may([duAn({ ma: 'SPX', ten: 'Sample', nhom: NHOM })]);
    const dau = dung(<Sidebar />);
    await screen.findByText('Sample');
    await userEvent.click(screen.getByRole('button', { name: NHAN_NHOM_DU_AN }));
    dau.unmount();

    dung(<Sidebar />);
    const nut = await screen.findByRole('button', { name: NHAN_NHOM_DU_AN });
    expect(nut.getAttribute('aria-expanded')).toBe('false');
  });

  it('kho đã có sẵn bản ghi thu gọn ⇒ sidebar dựng ra ĐÚNG trạng thái đó', async () => {
    luuThuGon(new Set([NHOM_DOI_AGENT]));
    may();
    dung(<Sidebar />);

    const nut = await screen.findByRole('button', { name: NHAN_NHOM_DOI_AGENT });
    expect(nut.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('W-builder')).toBeNull();
  });
});

describe('nhóm Đội agent: chấm đang làm / rảnh', () => {
  it('mỗi agent một chấm mang ĐÚNG trạng thái và nhãn của máy chủ', async () => {
    may();
    dung(<Sidebar />);
    await screen.findByText('W-builder');

    const cham = [...document.querySelectorAll('[data-trang-thai-agent]')];
    expect(cham.map((e) => e.getAttribute('data-trang-thai-agent'))).toEqual(['busy', 'idle']);
    // Nhãn đi nguyên văn từ `nhan_trang_thai` — giao diện không dịch mã.
    expect(screen.getByLabelText('Đang làm')).toBeTruthy();
    expect(screen.getByLabelText('Rảnh')).toBeTruthy();
  });

  it('mỗi agent dẫn tới trang agent của chính nó', async () => {
    may();
    dung(<Sidebar />);
    const lien = await screen.findByRole('link', { name: /W-builder/ });
    expect(lien.getAttribute('href')).toBe('/agent/ag-1');
  });

  it('thân CHƯA về ⇒ KHÔNG dựng một nhóm rỗng nói sai là "không có agent"', async () => {
    new MayChuGia()
      .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/can-chu', { than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null } } })
      .dat('GET /v1/man-hinh-agent', {
        http: 403,
        loi: { error: 'FORBIDDEN', message: 'Không có quyền.' },
      })
      .gan();
    dung(<Sidebar />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    expect(screen.queryByRole('button', { name: NHAN_NHOM_DOI_AGENT })).toBeNull();
  });
});

describe('breadcrumb của thanh trên — "Sample › Việc"', () => {
  it('luật thuần: đường nào ra chặng nào', () => {
    expect(duongDanTuUrl('/')).toEqual(['Tổng quan']);
    expect(duongDanTuUrl('/can-chu')).toEqual(['Cần Chủ']);
    expect(duongDanTuUrl('/cai-dat')).toEqual([MUC_CUOI.nhan]);
    /*
     * `/ticket` nay là mục **"Tất cả việc"** của d.392, nên breadcrumb nói đúng
     * một chặng mang **đúng nhãn sidebar** — `duongDanTuUrl` tra `MUC_CHINH`
     * trước, nên không có bản chép nào phải sửa theo. Chuỗi "Tất cả dự án"
     * (`CHANG_TAT_CA_DU_AN`) vẫn còn cho đường có **lọc dự án**.
     */
    expect(duongDanTuUrl('/ticket')).toEqual([NHAN_TAT_CA_VIEC]);
    expect(CHANG_TAT_CA_DU_AN).toBe('Tất cả dự án');
    expect(duongDanTuUrl('/t/BAT-12')).toEqual([CHANG_VIEC, 'BAT-12']);
    // Tên dự án tra được ⇒ dùng tên; không tra được ⇒ **mã trên đường**, không
    // một chữ "Đang tải…" nhảy hai lần.
    expect(duongDanTuUrl('/du-an/SPX', () => 'Sample')).toEqual(['Sample', CHANG_VIEC]);
    expect(duongDanTuUrl('/du-an/SPX')).toEqual(['SPX', CHANG_VIEC]);
    expect(duongDanTuUrl('/du-an/id-SPX/ho-so', () => 'Sample')).toEqual([
      'Sample',
      CHANG_HO_SO,
    ]);
    expect(duongDanTuUrl('/khong-co-duong-nay')).toEqual(['Baton']);
  });

  it('trên vỏ thật: `/du-an/SPX` hiện "Sample › Việc", chặng cuối là chặng đậm', async () => {
    may();
    dung(<App />, '/du-an/SPX');

    const bc = await screen.findByRole('navigation', { name: NHAN_DUONG_DAN });
    // Chờ tên dự án về (trước đó chặng đầu là mã `SPX`).
    await within(bc).findByText('Sample');
    expect(bc.textContent).toBe(`Sample${DAU_CHANG}${CHANG_VIEC}`);
    expect(bc.querySelector('[data-chang="cuoi"]')?.textContent).toBe(CHANG_VIEC);
  });
});

describe('375px: sidebar thành menu trượt (d.411)', () => {
  it('chưa bấm gì ⇒ CHỈ MỘT sidebar trong cây (không hai `nav` cùng tên)', async () => {
    may();
    dung(<App />);
    await screen.findByRole('navigation', { name: NHAN_DUONG_DAN });

    expect(screen.getAllByRole('navigation', { name: 'Điều hướng chính' }).length).toBe(1);
    expect(screen.queryByRole('dialog', { name: NHAN_MENU_TRUOT })).toBeNull();
  });

  it('bấm "Mở menu" ⇒ menu trượt có sidebar; bấm một mục ⇒ menu ĐÓNG', async () => {
    may();
    dung(<App />);
    await userEvent.click(await screen.findByLabelText(NHAN_MO_MENU));

    const menu = screen.getByRole('dialog', { name: NHAN_MENU_TRUOT });
    expect(within(menu).getByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();

    /*
     * Bấm "Cài đặt": trang giữ chỗ, **không gọi API nào**. Bấm "Cần Chủ" ở đây
     * sẽ kéo cả màn hình Cần Chủ vào ca này (và cần hai đường máy chủ giả nữa) —
     * ca này nói về menu, không về trang.
     */
    await userEvent.click(within(menu).getByRole('link', { name: MUC_CUOI.nhan }));
    expect(screen.queryByRole('dialog', { name: NHAN_MENU_TRUOT })).toBeNull();
  });

  it('cấu trúc: sidebar thường trú ẩn dưới `md`, nút mở menu chỉ hiện dưới `md`, aria-expanded theo trạng thái', async () => {
    may();
    dung(<App />);
    const mo = await screen.findByLabelText(NHAN_MO_MENU);
    expect(mo.className).toContain('md:hidden');
    // Vùng chạm ~44px (size-11 = 2.75rem) trên điện thoại.
    expect(mo.className).toContain('size-11');
    expect(mo.getAttribute('aria-expanded')).toBe('false');

    const aside = document.querySelector('aside');
    expect(aside?.className).toContain('hidden');
    expect(aside?.className).toContain('md:block');

    await userEvent.click(mo);
    expect(mo.getAttribute('aria-expanded')).toBe('true');
    // Bấm lớp mờ (ra ngoài) cũng đóng.
    await userEvent.click(screen.getByLabelText('Đóng menu (bấm ra ngoài)'));
    expect(screen.queryByRole('dialog', { name: NHAN_MENU_TRUOT })).toBeNull();
    expect(mo.getAttribute('aria-expanded')).toBe('false');
  });

  it('kieu.css đặt vùng chạm tối thiểu 2.75rem cho nút/ô chọn dưới `md` (767px)', () => {
    const css = docKieuCss();
    const kh = css.indexOf('@media (max-width: 767px)');
    expect(kh).toBeGreaterThan(-1);
    expect(css.slice(kh, kh + 200)).toContain('min-height: 2.75rem');
  });

  it('nút ✕ cũng đóng menu, và focus TRẢ VỀ nút "Mở menu"', async () => {
    may();
    dung(<App />);
    const mo = await screen.findByLabelText(NHAN_MO_MENU);
    await userEvent.click(mo);
    await userEvent.click(screen.getByLabelText(NHAN_DONG_MENU));

    expect(screen.queryByRole('dialog', { name: NHAN_MENU_TRUOT })).toBeNull();
    // Không trả focus thì con trỏ bàn phím rơi về đầu tài liệu.
    expect(document.activeElement).toBe(mo);
  });

  it('một `role="dialog"` phải CƯ XỬ như dialog: `aria-modal`, Escape, khoá cuộn', async () => {
    may();
    dung(<App />);
    const truoc = document.body.style.overflow;
    await userEvent.click(await screen.findByLabelText(NHAN_MO_MENU));

    const menu = screen.getByRole('dialog', { name: NHAN_MENU_TRUOT });
    expect(menu.getAttribute('aria-modal')).toBe('true');
    // Trang dưới KHÔNG được cuộn trong khi menu che cả màn hình.
    expect(document.body.style.overflow).toBe('hidden');
    /*
     * `Escape` đi tới dialog vì dialog **tự lấy focus** khi mở — nếu không, sự
     * kiện bàn phím bọt lên từ `body` và không bao giờ tới `onKeyDown` của nó.
     */
    expect(menu.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: NHAN_MENU_TRUOT })).toBeNull();
    // Và khoá cuộn được trả về **giá trị cũ**, không gán cứng chuỗi rỗng.
    expect(document.body.style.overflow).toBe(truoc);
  });
});

describe('phím tắt cũ KHÔNG bị khung mới làm hỏng', () => {
  it('vỏ đăng ký ĐÚNG MỘT listener `keydown` (Cmd/Ctrl+K, C, G rồi T/O/N, ? — d.413, d.414, d.416), và nó KHÔNG chạm phím nào khác', async () => {
    /*
     * Vỏ có phím toàn cục: `C` (BAT-22), chuỗi `G` và `?` (BAT-23) — cả ba trong
     * **một** listener. Ca này là lưới cho phím tắt **trong trang** (Cần Chủ
     * d.270: `1`–`5`, `D`, `S`, `J`/`K`, `Cmd/Ctrl+Enter`; danh sách:
     * `J`/`K`/`S`/`P`/`Esc`): listener của vỏ không được `preventDefault` hay
     * nuốt bất kỳ phím nào trong số đó — một listener bubble đăng ký SAU vỏ vẫn
     * phải nhận đủ. Chạy ở đường không có trang (`/khong-co`) để mọi listener đếm
     * được là của **vỏ**.
     */
    const theo = vi.spyOn(window, 'addEventListener');
    may();
    dung(<App />, '/khong-co');
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    const keydown = theo.mock.calls.filter(([ten]) => ten === 'keydown');
    expect(keydown.length).toBe(1);
    theo.mockRestore();

    const trang = vi.fn();
    window.addEventListener('keydown', trang);
    try {
      /*
       * `g` trơn cũng không bị chặn; `g` rồi một phím KHÁC `T`/`O`/`N` (`p`, `j`,
       * `1`…) thì phím đó vẫn tới trang. `t`/`o`/`n` không có `g` trước cũng vậy.
       */
      const ds = [
        '1', '5', 'd', 'D', 's', 'S', 'j', 'J', 'k', 'K', 'p', 'P', 'Escape', 'Enter',
        't', 'o', 'n', 'T', 'O', 'N', 'l', 'a', 'x', '/',
        'g', 'p', 'g', 'j', 'g', '1', 'g', 'Escape', 'G', 's',
      ];
      for (const key of ds) {
        const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        document.body.dispatchEvent(e);
        expect(e.defaultPrevented, `phím ${key}`).toBe(false);
      }
      const phu = [
        { key: 'Enter', ctrlKey: true },
        { key: 'Enter', metaKey: true },
        // Alt/Shift + K không phải `Cmd/Ctrl+K` của d.414.
        { key: 'k', metaKey: true, altKey: true },
        { key: 'k', ctrlKey: true, shiftKey: true },
      ];
      for (const p of phu) {
        const e = new KeyboardEvent('keydown', { ...p, bubbles: true, cancelable: true });
        document.body.dispatchEvent(e);
        expect(e.defaultPrevented, JSON.stringify(p)).toBe(false);
      }
      // Mọi phím trên đều tới listener bubble của "trang" — không bị nuốt.
      expect(trang).toHaveBeenCalledTimes(ds.length + phu.length);
      expect(screen.queryByRole('dialog')).toBeNull();

      /*
       * BAT-34: `Cmd/Ctrl+K` nay là phím của vỏ (d.414) — **cùng** listener duy nhất ở
       * trên (đếm ở đầu ca). Nó `preventDefault` và không tới trang (một lần bấm
       * không làm hai việc), và mở command menu.
       */
      const k = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true });
      act(() => {
        document.body.dispatchEvent(k);
      });
      expect(k.defaultPrevented).toBe(true);
      expect(trang).toHaveBeenCalledTimes(ds.length + phu.length);
      expect(screen.getByRole('dialog', { name: NHAN_COMMAND_MENU })).toBeTruthy();
    } finally {
      window.removeEventListener('keydown', trang);
    }
  });
});

/* ================================================================== *
 * Lưới tương phản — đọc bảng màu THẬT từ `kieu.css`, tính WCAG
 * ================================================================== *
 * Vì sao phần này tồn tại: phép rà của lượt trước là "liệt kê class rồi soi
 * `text-white`", và nó **để lọt bảy chỗ** — `disabled:bg-neutral-300` bên cạnh
 * `text-nen`, tức nền mờ và chữ **cùng nhạt** (1.5:1). Hai class đọc rời nhau
 * thì cái nào cũng hợp lệ; chỉ **cặp** mới sai. Nên lưới mới không soi tên
 * class nữa mà **tính tỉ lệ tương phản** cho từng cặp, ở **cả hai** chế độ, từ
 * chính hai bảng màu trong `kieu.css` (không một bản chép hex nào trong test).
 *
 * **Giới hạn đã biết, khai thẳng:** lưới chỉ xét cặp nền–chữ **viết cùng một
 * đoạn class**. Chữ **thừa hưởng** màu nền từ một tổ tiên (phần lớn chữ của các
 * trang: `text-neutral-500` trên nền trang) thì nó không thấy — muốn thấy phải
 * dựng cây thật và tính màu hiệu dụng, mà jsdom không nạp CSS nên không làm
 * được ở đây. Hai lưới còn lại cho phần đó: bảng `--t-n*` được chọn sao cho
 * `n500`/`n600` đạt ≥ 4.5:1 trên `nen` ở **cả hai** chế độ (có ca dưới ghim), và
 * phần rà tay ghi trong báo cáo lượt này.
 */

const NGUON = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });

/**
 * Hai cột màu đọc **từ chính `kieu.css`** qua `?raw` (cùng nếp `doc-spec.ts` đọc
 * `SPEC.md`): một bản chép hex trong test sẽ xanh mãi sau khi ai đó sửa bảng
 * màu thật.
 */
function khoiSau(van: string, moc: string): string {
  const i = van.indexOf(moc);
  if (i < 0) return '';
  const j = van.indexOf('{', i);
  const k = van.indexOf('}', j);
  return van.slice(j, k);
}

/** `\n:root {` khớp **đúng** khối sáng, không khớp `:root:not([data-theme])`. */
const khoiSang = (): string => khoiSau(docKieuCss(), '\n:root {');
const khoiToi = (): string => khoiSau(docKieuCss(), "\n:root[data-theme='toi']");

async function docNguon(): Promise<[string, string][]> {
  const ra: [string, string][] = [];
  for (const [duong, doc] of Object.entries(NGUON)) ra.push([duong, (await doc()) as string]);
  return ra;
}

/**
 * Token ngữ nghĩa mà lưới cặp biết đo. Hệ thiết kế 29/10 (`THIET-KE.md`) thêm
 * chữ mờ hơn, màu nhấn (5 vai trò), màu 5 trạng thái và 3 mức gấp — thêm vào
 * đây để mọi cặp nền–chữ dùng chúng **có người đo**; một token lạ với lưới thì
 * cặp của nó bị bỏ qua im lặng.
 */
const TOKEN_NGU_NGHIA = [
  'nen', 'nen-lop', 'nen-noi', 'chu', 'chu-mo', 'chu-mo-hon',
  'loi', 'loi-nen', 'canh', 'canh-nen', 'tot',
  'nhan-manh', 'nhan-manh-dam', 'nhan-manh-nen', 'nhan-manh-chu', 'tren-nhan-manh',
  'tt-cho', 'tt-dang-lam', 'tt-kiem-chung', 'tt-xong', 'tt-huy',
  'gap-khan', 'gap-hom-nay', 'gap-sau',
];

/** Tên class Tailwind (phần sau `bg-`/`text-`) → tên biến trong `kieu.css`. */
function tenBien(lop: string): string | null {
  const n = /^neutral-(\d+)$/.exec(lop);
  if (n !== null) return `--t-n${n[1] ?? ''}`;
  // Sáu cặp màu nhãn của BAT-6 đợt 2 (`vo/mau-the.ts`) — `nhan3-nen` → `--t-nhan3-nen`.
  if (/^nhan[1-9]-(?:nen|chu)$/.test(lop)) return `--t-${lop}`;
  if (TOKEN_NGU_NGHIA.includes(lop)) return `--t-${lop}`;
  // Mọi màu khác (`red-600`, `black`, `transparent`…) **không** nằm trong thang
  // token nên lưới này không xét — `text-white` có lưới riêng ở trên.
  return null;
}

/** Cắt một bảng `--t-…: #hex;` từ một khối CSS. */
function bangMau(khoi: string): Map<string, string> {
  const bang = new Map<string, string>();
  for (const m of khoi.matchAll(/(--t-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
    bang.set(m[1] ?? '', m[2] ?? '');
  }
  return bang;
}

/** Luminance tương đối WCAG 2.x. */
function sang(hex: string): number {
  const kenh = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (kenh[0] ?? 0) + 0.7152 * (kenh[1] ?? 0) + 0.0722 * (kenh[2] ?? 0);
}

function tiLe(a: string, b: string): number {
  const [x, y] = [sang(a), sang(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
}

/**
 * **Mức sàn 3.0:1.**
 *
 * Không lấy 4.5 (mức AA cho chữ nhỏ) vì phần lớn các cặp bị xét ở đây là trạng
 * thái **mờ** của nút, và WCAG miễn trừ thành phần `disabled`. Nhưng "được miễn
 * trừ" không có nghĩa là 1.5:1: chủ vẫn phải đọc được nhãn để biết nút nào đang
 * mờ. 3.0 là mức AA cho chữ lớn và cho thành phần giao diện, và nó bắt **đúng**
 * họ lỗi reviewer tìm ra trong khi không buộc trạng thái mờ phải đậm như trạng
 * thái thường.
 */
const SAN_TUONG_PHAN = 3;

interface CapMau {
  o: string;
  chuoi: string;
  bien_the: string;
  bg: string;
  chu: string;
}

/**
 * Rút các **cặp nền–chữ** từ một đoạn class.
 *
 * Gom theo **biến thể** (`''`, `disabled:`, `hover:`…), và biến thể nào có nền
 * mà không có chữ thì **lấy chữ của biến thể gốc** — đó đúng là cách CSS xếp
 * tầng, và cũng đúng chỗ lỗi cũ nằm: `disabled:bg-neutral-300` đổi nền trong khi
 * chữ vẫn là `text-nen` của trạng thái thường.
 */
function capTrongChuoi(o: string, chuoi: string): CapMau[] {
  const bg = new Map<string, string>();
  const chu = new Map<string, string>();
  for (const m of chuoi.matchAll(/(?:^|\s)((?:[a-z-]+:)*)(bg|text)-([a-z0-9-]+)/g)) {
    const bien_the = m[1] ?? '';
    const ten = tenBien(m[3] ?? '');
    if (ten === null) continue;
    (m[2] === 'bg' ? bg : chu).set(bien_the, ten);
  }
  const ra: CapMau[] = [];
  for (const bien_the of new Set([...bg.keys(), ...chu.keys()])) {
    const n = bg.get(bien_the) ?? bg.get('');
    const c = chu.get(bien_the) ?? chu.get('');
    if (n === undefined || c === undefined) continue;
    ra.push({ o, chuoi, bien_the, bg: n, chu: c });
  }
  return ra;
}

describe('lưới: cặp nền–chữ phải ĐỌC ĐƯỢC ở cả hai chế độ', () => {
  it('bảng màu cắt ra từ `kieu.css` đủ hai cột (lưới của chính ca này)', () => {
    const sg = bangMau(khoiSang());
    const toi = bangMau(khoiToi());
    // Không có ca này thì một regex hỏng (bảng rỗng) làm mọi ca dưới xanh vì
    // không cặp nào tra được màu.
    expect(sg.size).toBeGreaterThan(15);
    expect(sg.size).toBe(toi.size);
    expect(sg.get('--t-nen')).toBe('#ffffff');
    expect(toi.get('--t-nen')).not.toBe('#ffffff');
  });

  it('phép đo ĐÚNG CHIỀU: cặp cũ bị reviewer bắt phải TRƯỢT mức sàn', () => {
    /*
     * Ca đối chứng ngược, bắt buộc: nếu không có nó thì một phép tính sai (luôn
     * trả một số lớn) làm cả lưới dưới xanh mãi mãi. Hai số dưới đây là đúng
     * hai cặp của lỗi cũ.
     */
    const sg = bangMau(khoiSang());
    const toi = bangMau(khoiToi());
    const t = (b: Map<string, string>, x: string, y: string): number =>
      tiLe(b.get(x) ?? '#000000', b.get(y) ?? '#000000');

    expect(t(sg, '--t-n300', '--t-nen')).toBeLessThan(SAN_TUONG_PHAN);
    expect(t(toi, '--t-n300', '--t-nen')).toBeLessThan(SAN_TUONG_PHAN);
    expect(t(sg, '--t-n400', '--t-nen')).toBeLessThan(SAN_TUONG_PHAN);
    // Và cặp đã chọn thay thế thì ĐẠT ở cả hai chế độ.
    expect(t(sg, '--t-n200', '--t-n500')).toBeGreaterThanOrEqual(SAN_TUONG_PHAN);
    expect(t(toi, '--t-n200', '--t-n500')).toBeGreaterThanOrEqual(SAN_TUONG_PHAN);
  });

  it('chữ mờ THỪA HƯỞNG nền trang vẫn đạt mức AA (4.5:1) ở cả hai chế độ', () => {
    /*
     * Phần lớn chữ của các trang không khai nền trong cùng đoạn class
     * (`text-neutral-500` trên nền trang), nên lưới cặp bên dưới **không** thấy
     * chúng — xem "Giới hạn đã biết" ở đầu khối. Vế đó được canh ở đây, trên
     * **bảng màu**: hai hạng chữ mờ phải đọc được trên cả `nen` và `nen-lop`
     * (sidebar) ở cả hai chế độ. Mức 4.5 vì đây là chữ thật, chữ nhỏ.
     */
    for (const bang of [bangMau(khoiSang()), bangMau(khoiToi())]) {
      for (const nen of ['--t-nen', '--t-nen-lop', '--t-nen-noi']) {
        for (const chu of ['--t-n500', '--t-n600', '--t-chu-mo', '--t-loi', '--t-canh']) {
          const r = tiLe(bang.get(nen) ?? '#000000', bang.get(chu) ?? '#000000');
          expect({ nen, chu, r: r >= 4.5 }).toEqual({ nen, chu, r: true });
        }
      }
    }
  });

  it('MỌI cặp nền–chữ trong `src/` đạt mức sàn ở cả chế độ sáng và tối', async () => {
    const sg = bangMau(khoiSang());
    const toi = bangMau(khoiToi());
    const cap: CapMau[] = [];
    for (const [duong, van] of await docNguon()) {
      // Bỏ ghi chú khối: chúng **nói về** các cặp sai để giải thích.
      const ma = van.replace(/\/\*[\s\S]*?\*\//g, '');
      // Mỗi chuỗi nháy/backtick là một đoạn class; một `${…}` trong template
      // cắt đoạn làm hai, nên hai nhánh của một điều kiện được xét riêng —
      // đúng điều cần: mỗi nhánh phải tự đọc được.
      for (const m of ma.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
        cap.push(...capTrongChuoi(duong, m[1] ?? ''));
      }
    }
    // Lưới của chính ca này: có cặp để xét thật.
    expect(cap.length).toBeGreaterThan(5);

    const xau = cap
      .map((c) => {
        const a = tiLe(sg.get(c.bg) ?? '#000000', sg.get(c.chu) ?? '#000000');
        const b = tiLe(toi.get(c.bg) ?? '#000000', toi.get(c.chu) ?? '#000000');
        return { c, a, b };
      })
      .filter(({ a, b }) => a < SAN_TUONG_PHAN || b < SAN_TUONG_PHAN)
      .map(
        ({ c, a, b }) =>
          `${c.o}: "${c.bien_the}${c.bg} + ${c.chu}" sáng ${a.toFixed(1)}:1, tối ${b.toFixed(1)}:1`,
      );
    expect(xau).toEqual([]);
  });
});

/* ================================================================== *
 * Lưới tương phản của THẺ VIỆC — nhãn màu và icon ưu tiên (BAT-6 đợt 2)
 * ================================================================== *
 * Lưới "mọi cặp trong `src/`" ở trên **quét văn bản** mã nguồn, nên nó cũng thấy
 * sáu cặp nhãn (chúng là sáu chuỗi viết sẵn trong `vo/mau-the.ts` — xem ghi chú
 * ở đó về việc Tailwind quét mã nguồn). Nhưng "thấy" không đủ: nếu một ngày nào
 * `LOP_NHAN` có bảy cặp mà `kieu.css` chỉ khai sáu, cặp thứ bảy tra ra
 * `undefined` và lưới trên lấy `#000000` làm mặc định — tức **xanh vì không màu
 * nào tra được**, đúng cái bẫy mà ca "bảng màu đủ hai cột" tồn tại để bắt.
 *
 * Nên hai ca dưới đây đi từ **đúng hai bảng của mã sản phẩm** (`LOP_NHAN`,
 * `LOP_UU_TIEN`) và đòi: mỗi cặp **tra được màu thật**, và mỗi cặp **đạt mức**.
 * Mức: 4.5 cho nhãn (chữ thật, chữ nhỏ), 3.0 cho icon ưu tiên (thành phần giao
 * diện — và hình của năm mức đã khác nhau nên màu không là thông tin duy nhất).
 */

describe('lưới: nhãn màu và icon ưu tiên của thẻ việc đọc được ở cả hai chế độ', () => {
  it('SÁU cặp nhãn: tra được màu thật, và đạt 4.5:1 ở cả sáng và tối', () => {
    const bang = { sang: bangMau(khoiSang()), toi: bangMau(khoiToi()) };
    // Lưới của chính ca này: có cặp để xét, và đúng bằng số cặp mã sản phẩm dùng.
    expect(LOP_NHAN.length).toBe(6);

    const xau: string[] = [];
    for (const chuoi of LOP_NHAN) {
      const cap = capTrongChuoi('mau-the.ts', chuoi);
      // Mỗi chuỗi phải rút ra **đúng một** cặp nền–chữ; không thì `tenBien` chưa
      // biết tên token mới và cả ca này rỗng nghĩa.
      if (cap.length !== 1) {
        xau.push(`"${chuoi}": rút ra ${String(cap.length)} cặp, phải là 1`);
        continue;
      }
      const c = cap[0]!;
      for (const che of ['sang', 'toi'] as const) {
        const nen = bang[che].get(c.bg);
        const chu = bang[che].get(c.chu);
        if (nen === undefined || chu === undefined) {
          xau.push(`"${chuoi}" (${che}): ${c.bg}/${c.chu} KHÔNG có trong kieu.css`);
          continue;
        }
        const r = tiLe(nen, chu);
        if (r < 4.5) xau.push(`"${chuoi}" (${che}): ${r.toFixed(1)}:1 < 4.5`);
      }
    }
    expect(xau).toEqual([]);
  });

  it('NĂM màu icon ưu tiên đạt 3.0:1 trên cả ba nền, ở cả sáng và tối', () => {
    const bang = { sang: bangMau(khoiSang()), toi: bangMau(khoiToi()) };
    /*
     * Năm mức của bảng 0.1 — đọc **khoá của chính `LOP_UU_TIEN`**, nên thêm một
     * mức mà quên màu là một ca đỏ, không một icon tàng hình.
     */
    expect(Object.keys(LOP_UU_TIEN).sort()).toEqual(['high', 'low', 'medium', 'none', 'urgent']);

    const xau: string[] = [];
    for (const [muc, lop] of Object.entries(LOP_UU_TIEN)) {
      const ten = /(?:^|\s)text-([a-z0-9-]+)/.exec(lop)?.[1] ?? '';
      const bien = tenBien(ten);
      if (bien === null) {
        xau.push(`${muc}: "${lop}" không phải một token của kieu.css`);
        continue;
      }
      for (const che of ['sang', 'toi'] as const) {
        const chu = bang[che].get(bien);
        if (chu === undefined) {
          xau.push(`${muc} (${che}): ${bien} KHÔNG có trong kieu.css`);
          continue;
        }
        // Icon nằm trên nền thẻ, nền trang, hoặc nền cột — cả ba đều phải đạt.
        for (const nen of ['--t-nen', '--t-nen-lop', '--t-nen-noi']) {
          const r = tiLe(bang[che].get(nen) ?? '#000000', chu);
          if (r < SAN_TUONG_PHAN) xau.push(`${muc} (${che}, ${nen}): ${r.toFixed(1)}:1 < 3`);
        }
      }
    }
    expect(xau).toEqual([]);
  });
});

/* ================================================================== *
 * Hệ thiết kế 29/10 (`THIET-KE.md`) — token mới phải đọc được
 * ================================================================== *
 * Lượt UI-A thêm: chữ mờ hơn, màu nhấn (5 vai trò), màu 5 trạng thái, 3 mức
 * gấp, và đổi mặc định sang tối. Các ca dưới đo **từ chính `kieu.css`**, ở cả
 * hai chế độ, như phần lưới phía trên.
 */

/** Tỉ lệ của hai token trong một bảng; token thiếu ⇒ ném (không lấy `#000000`). */
function tiLeToken(bang: Map<string, string>, a: string, b: string): number {
  const x = bang.get(a);
  const y = bang.get(b);
  if (x === undefined || y === undefined) throw new Error(`thiếu token ${x === undefined ? a : b}`);
  return tiLe(x, y);
}

const BA_NEN = ['--t-nen', '--t-nen-lop', '--t-nen-noi'] as const;

describe('lưới: token hệ thiết kế 29/10 đọc được ở cả hai chế độ', () => {
  const bang = (): { sang: Map<string, string>; toi: Map<string, string> } => ({
    sang: bangMau(khoiSang()),
    toi: bangMau(khoiToi()),
  });

  it('chữ mờ hơn (số đếm, ngày): ≥ 4.5:1 trên nền trang và lớp nổi, ≥ 3:1 trên lớp hover', () => {
    for (const b of Object.values(bang())) {
      expect(tiLeToken(b, '--t-nen', '--t-chu-mo-hon')).toBeGreaterThanOrEqual(4.5);
      expect(tiLeToken(b, '--t-nen-lop', '--t-chu-mo-hon')).toBeGreaterThanOrEqual(4.5);
      expect(tiLeToken(b, '--t-nen-noi', '--t-chu-mo-hon')).toBeGreaterThanOrEqual(SAN_TUONG_PHAN);
    }
  });

  it('màu nhấn: chữ trên nút chính ≥ 4.5:1 (cả lúc hover), liên kết ≥ 4.5:1, focus ring ≥ 3:1', () => {
    for (const b of Object.values(bang())) {
      expect(tiLeToken(b, '--t-nhan-manh', '--t-tren-nhan-manh')).toBeGreaterThanOrEqual(4.5);
      expect(tiLeToken(b, '--t-nhan-manh-dam', '--t-tren-nhan-manh')).toBeGreaterThanOrEqual(4.5);
      for (const nen of [...BA_NEN, '--t-nhan-manh-nen']) {
        expect(tiLeToken(b, nen, '--t-nhan-manh-chu')).toBeGreaterThanOrEqual(4.5);
      }
      // Vòng focus và vạch chọn là thành phần giao diện: mức 3:1.
      for (const nen of BA_NEN) {
        expect(tiLeToken(b, nen, '--t-nhan-manh')).toBeGreaterThanOrEqual(SAN_TUONG_PHAN);
      }
    }
  });

  it('màu 5 trạng thái và 3 mức gấp: tra được ở cả hai cột, ≥ 3:1 trên cả ba nền', () => {
    // Đọc khoá của **chính** hai bảng mã sản phẩm dùng: thêm một trạng thái mà
    // quên màu là một ca đỏ, không một icon tàng hình.
    expect(Object.keys(LOP_TRANG_THAI).sort()).toEqual(
      ['backlog', 'canceled', 'done', 'duplicate', 'in_progress', 'todo', 'verifying'],
    );
    expect(Object.keys(LOP_MUC_GAP).sort()).toEqual(['later', 'today', 'urgent']);
    // BAT-66: năm màu chấm trạng thái agent cũng qua cùng lưới.
    expect(Object.keys(LOP_TRANG_THAI_AGENT).sort()).toEqual(
      ['busy', 'disabled', 'idle', 'stalled', 'waiting_owner'],
    );

    const xau: string[] = [];
    for (const lop of [
      ...Object.values(LOP_TRANG_THAI),
      ...Object.values(LOP_MUC_GAP),
      ...Object.values(LOP_TRANG_THAI_AGENT),
    ]) {
      const bien = tenBien(/(?:^|\s)text-([a-z0-9-]+)/.exec(lop)?.[1] ?? '');
      if (bien === null) {
        xau.push(`"${lop}" không phải một token lưới biết`);
        continue;
      }
      for (const [che, b] of Object.entries(bang())) {
        for (const nen of BA_NEN) {
          const mau = b.get(bien);
          if (mau === undefined) {
            xau.push(`${bien} (${che}) KHÔNG có trong kieu.css`);
            continue;
          }
          const r = tiLe(b.get(nen) ?? '#000000', mau);
          if (r < SAN_TUONG_PHAN) xau.push(`${bien} (${che}, ${nen}): ${r.toFixed(2)}:1 < 3`);
        }
      }
    }
    expect(xau).toEqual([]);
  });

  it('chưa có JS ⇒ TỐI: khối fallback `:root:not([data-theme])` nằm trong khối tối, không chờ `prefers-color-scheme`', () => {
    /*
     * Mặc định tối (chốt 29/10): script nội tuyến chưa chạy / bị chặn thì trang
     * vẫn phải tối — đúng như người chưa chọn sẽ thấy khi script chạy. Ca ghim
     * hai điều: bộ chọn fallback đứng chung khối với `[data-theme='toi']`, và
     * không còn một khối nào đổi màu theo `prefers-color-scheme` cho ca chưa
     * chọn (khối đó là của mặc định "theo máy" cũ).
     */
    const css = docKieuCss();
    const dau = css.indexOf("\n:root[data-theme='toi']");
    const mo = css.indexOf('{', dau);
    expect(dau).toBeGreaterThan(-1);
    expect(css.slice(dau, mo)).toContain(':root:not([data-theme])');
    expect(css).not.toContain('@media (prefers-color-scheme');
  });
});

/**
 * **Một cặp nền–chữ bị lưới BỎ QUA im lặng** — lỗi của Phần 1 mà reviewer bắt
 * được ở lượt này.
 *
 * `capTrongChuoi` chỉ ghép được một cặp khi **cùng một đoạn class** có cả `bg-*`
 * và `text-<màu>`. Khối lệnh của trang Cần Chủ (`OLenh`) viết `bg-neutral-100`
 * và để chữ **thừa hưởng**, nên cặp ấy không có ai đo — ở cả hai chế độ. Nó đã
 * được sửa bằng cách viết `text-neutral-900` **tường minh**; ca dưới đây là lưới
 * cho đúng điều đó, và nó đỏ nếu ai bỏ màu chữ ra khỏi đoạn class.
 *
 * Vì sao **không** nới `capTrongChuoi` thành "mọi `bg-*` không có chữ cũng là
 * một cặp": nền của một khối bọc (`bg-neutral-50` của tiêu đề nhóm, `bg-nen-lop`
 * của sidebar) đúng là **không** có chữ của riêng nó, nên lưới sẽ sinh hàng chục
 * cặp giả và mất nghĩa. Hướng đã chọn là ngược lại: chỗ nào **có** chữ thật thì
 * khai tường minh, và ca này ghim từng chỗ đã khai.
 */
describe('lưới: cặp của KHỐI LỆNH (Cần Chủ) phải có người đo', () => {
  it('cặp `bg-neutral-100 + text-neutral-900` CÓ MẶT trong danh sách lưới đo', async () => {
    const cap: CapMau[] = [];
    for (const [duong, van] of await docNguon()) {
      const ma = van.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of ma.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
        cap.push(...capTrongChuoi(duong, m[1] ?? ''));
      }
    }
    const khoi_lenh = cap.filter(
      (c) =>
        c.o.includes('can-chu.tsx') && c.bg === '--t-n100' && c.chu === '--t-n900',
    );
    // Có **ít nhất một** — tức lưới "mọi cặp trong `src/`" ở trên thật sự xét nó.
    expect(khoi_lenh.length).toBeGreaterThan(0);
  });

  it('và cặp ấy qua ngưỡng ở CẢ HAI chế độ (chữ trong khối lệnh là chữ thật, chữ nhỏ)', () => {
    for (const bang of [bangMau(khoiSang()), bangMau(khoiToi())]) {
      const r = tiLe(bang.get('--t-n100') ?? '#000000', bang.get('--t-n900') ?? '#000000');
      expect(r).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('lưới: component KHÔNG tự chọn mã màu', () => {
  it('không còn `text-white` / `bg-white` ngoài hai chỗ đã khai lý do', async () => {
    /*
     * `text-white` chỉ đúng khi nền **không** đảo chiều theo chế độ (nền đỏ của
     * huy hiệu Cần Chủ và của toast lỗi). Mọi chỗ khác phải là token, vì
     * `bg-neutral-900` ở chế độ tối là nền **gần trắng** — chữ trắng trên đó là
     * chữ tàng hình. Ca này đọc **mã nguồn thật** nên một lượt sau gõ lại
     * `text-white` vào một nút là một ca đỏ, không một lỗi chủ phát hiện.
     */
    const xau: string[] = [];
    for (const [duong, van] of await docNguon()) {
      // Bỏ ghi chú khối: các khối ghi chú **nói về** `text-white` để giải thích.
      const ma = van.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const lop of ['text-white', 'bg-white', 'text-black']) {
        if (ma.includes(lop)) xau.push(`${duong}: ${lop}`);
      }
    }
    /*
     * Đúng một chỗ còn lại: huy hiệu đỏ của sidebar. Toast lỗi **không** còn nền
     * đỏ chữ trắng từ hệ thiết kế 29/10 (`THIET-KE.md`): nó là tấm lớp nổi chữ
     * chính, nghĩa "lỗi" đi bằng icon đỏ — nên `toast.tsx` rời danh sách này.
     * Chữ trên màu nhấn là token `tren-nhan-manh`, không `text-white`.
     */
    expect(xau.sort()).toEqual(['../src/vo/sidebar.tsx: text-white']);
  });
});
