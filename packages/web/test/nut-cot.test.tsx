/**
 * **Nút `+` ở đầu cột Cần làm của bảng** — BAT-62; **nút `+` ở đầu nhóm Backlog
 * của kiểu Danh sách** — BAT-63; **nút `+` ở đầu cột Backlog của bảng** — BAT-64.
 *
 * Căn cứ: SPEC mục 4 d.127 (Cần làm là trạng thái "mặc định khi tạo") và câu
 * "Trạng thái khi tạo" (T-108 = B: chọn được Backlog, còn lại `INVALID_INPUT`),
 * mục 14 d.413 (tạo ticket trên web — hộp Tạo việc của vỏ), mục 14 câu sáu cột
 * Bảng (T-111 = A, 29/10), mục 2 + 19.12 câu 25 (`archived` chỉ đọc), 19.12 câu
 * 26 (chủ tạo được trong dự án `paused`). `spec-questions.md` #179, #180: Bảng có
 * `+` ở cột Backlog (mở với Backlog chọn sẵn) và cột Cần làm; Danh sách chỉ nhóm
 * Backlog có `+`, mở hộp với Backlog chọn sẵn.
 *
 * Ca dựng **`<App />`** (vỏ thật): nút `+` mở chính hộp của vỏ qua
 * `MoTaoViecContext`, nên ngoài vỏ nó không có (ca ở `the-viec.test.tsx`).
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { DuAnSidebar } from '../src/api';
import { KHOA_LOC_TICKET, NHAN_TRANG_THAI, NHOM_COT_CHU } from '../src/loc-ticket';
import {
  COT_CO_NUT_TAO,
  NHOM_CO_NUT_TAO,
  choTaoTuBang,
  nhanNutTaoTrongCot,
  nhanNutTaoTrongNhom,
  nutTaoChoCot,
} from '../src/trang/danh-sach-ticket';
import {
  NHAN_HOP_TAO_VIEC,
  NHAN_NUT_GUI_TAO,
  NHAN_O_DU_AN,
  NHAN_O_TIEU_DE,
  NHAN_O_TRANG_THAI,
} from '../src/vo/tao-viec';
import { NHAN_NUT_TAO } from '../src/vo/sidebar';
import { MayChuGia, TOI_CHU, dung } from './giup';
import { doiAgent } from './than-agent';
import { dong, manHinhDanhSach, manHinhTicket, ticketDayDu, THAN_AGENT } from './than-ticket';
import { cotBangTuSpec, trangThaiKhiTaoTuSpec, trangThaiMacDinhKhiTaoTuSpec } from './doc-spec';

const DU_AN: DuAnSidebar[] = [
  { id: 'id-SPX', ma: 'SPX', ten: 'Sample', trang_thai: 'active', nhom: null },
  { id: 'id-COS', ma: 'COS', ten: 'Chief of Staff', trang_thai: 'paused', nhom: null },
  /*
   * Máy chủ thật **ẩn** dự án lưu trữ khỏi `GET /v1/du-an` (19.12 câu 27); khai nó
   * ở đây để canh lớp phòng thủ của trang: có lọt vào danh sách thì vẫn không `+`.
   */
  { id: 'id-CU', ma: 'CU', ten: 'Dự án cũ', trang_thai: 'archived', nhom: null },
];

const DS = [
  dong({ ma: 'SAI-1', trang_thai: 'todo', nhom_trang_thai: 'planned' }),
  dong({ ma: 'SAI-2', trang_thai: 'in_progress', nhom_trang_thai: 'active' }),
  dong({ ma: 'SAI-3', trang_thai: 'verifying', nhom_trang_thai: 'active' }),
];

const KET_QUA_TAO = { id: 'tk-new', ma: 'SPX-7', so: 7, tieu_de: 'Việc mới', trang_thai: 'todo' };

/**
 * Máy chủ giả: đường màn hình danh sách nhận mọi chuỗi truy vấn nên bọc `fetch`
 * (nếp `tao-viec.test.tsx`). `items` = dòng trả cho bảng.
 */
function may(items = DS): MayChuGia {
  const m = new MayChuGia()
    .dat('GET /v1/toi', { than: TOI_CHU })
    .dat('GET /v1/du-an?limit=200', { than: { items: DU_AN, cursor_sau: null } })
    .dat('GET /v1/can-chu', { than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null } } })
    .dat('GET /v1/man-hinh-agent', { than: doiAgent([]) })
    .dat('GET /v1/agent', { than: THAN_AGENT })
    .dat('POST /v1/ticket', { http: 201, than: KET_QUA_TAO })
    .gan();
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
      return tra(manHinhTicket(ticketDayDu({ ma: decodeURIComponent(ma) })));
    }
    if (duong.startsWith('/v1/man-hinh-ticket')) return tra(manHinhDanhSach(items));
    return goc(duong, init);
  }) as typeof globalThis.fetch;
  return m;
}

/** Vào vỏ ở `duong`, chờ bảng vẽ xong (đủ sáu cột — T-111 A). */
async function vaoBang(duong: string): Promise<void> {
  dung(<App />, duong);
  await screen.findByRole('navigation', { name: 'Điều hướng chính' });
  await waitFor(() => {
    expect(document.querySelectorAll('[data-dau-cot]')).toHaveLength(NHOM_COT_CHU.length);
  });
  // Danh sách dự án đã về (nút `+` theo dự án đang xem đọc nó).
  await screen.findAllByText('Sample');
}

function nutCot(cot: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `[data-dau-cot="${cot}"] button[data-nut="tao-trong-cot"]`,
  );
}

function hop(): HTMLElement {
  return screen.getByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
}

function oDuAn(): HTMLSelectElement {
  return within(hop()).getByLabelText(NHAN_O_DU_AN);
}

/* ================================================================== *
 * Lưới SPEC + hàm thuần
 * ================================================================== */

describe('SPEC mục 4 + 14 — cột có `+` là cột của trạng thái "chọn được khi tạo"', () => {
  /*
   * T-111 A (29/10, BAT-64): trước đây chỉ MỘT cột (Cần làm) có `+`; nay hai cột
   * Backlog và Cần làm — đúng hai trạng thái mục 4 "Trạng thái khi tạo" cho phép,
   * và đúng câu "nút `+` ở đầu cột … và đầu cột …" của mục 14.
   */
  it('cột có `+` = Backlog + Cần làm, đúng câu mục 14 và đúng hai trạng thái "khi tạo" của mục 4', () => {
    expect(COT_CO_NUT_TAO).toEqual(['backlog', 'todo']);
    expect(COT_CO_NUT_TAO.map((t) => NHAN_TRANG_THAI[t])).toEqual(cotBangTuSpec().cot_co_nut_tao);
    expect(NHAN_TRANG_THAI.todo).toBe(trangThaiMacDinhKhiTaoTuSpec());
    const spec = trangThaiKhiTaoTuSpec();
    // Cùng tập với "mặc định" + "chọn thêm" của mục 4 (Backlog trước, đúng thứ tự cột).
    expect(COT_CO_NUT_TAO.map((t) => NHAN_TRANG_THAI[t])).toEqual([...spec.chon_them, spec.mac_dinh]);
  });

  it('nutTaoChoCot: Backlog ⇒ mở với `{ trang_thai: backlog }`; Cần làm ⇒ mở không tuỳ chọn; cột khác / không hộp ⇒ null', () => {
    const goi: unknown[][] = [];
    const tao = (...a: unknown[]): void => {
      goi.push(a);
    };
    nutTaoChoCot('backlog', tao)?.();
    nutTaoChoCot('todo', tao)?.();
    expect(goi).toEqual([[{ trang_thai: 'backlog' }], []]);
    for (const cot of ['in_progress', 'verifying', 'done', 'canceled', 'duplicate'] as const) {
      expect(nutTaoChoCot(cot, tao), cot).toBeNull();
    }
    expect(nutTaoChoCot('backlog', null)).toBeNull();
    expect(nutTaoChoCot('todo', null)).toBeNull();
  });

  it('choTaoTuBang: không lọc dự án ⇒ có; active/paused ⇒ có; archived / không biết ⇒ KHÔNG', () => {
    expect(choTaoTuBang(undefined, undefined)).toBe(true);
    expect(choTaoTuBang('', DU_AN)).toBe(true);
    expect(choTaoTuBang('id-SPX', DU_AN)).toBe(true);
    // 19.12 câu 26: chủ tạo được ticket trong dự án tạm dừng.
    expect(choTaoTuBang('id-COS', DU_AN)).toBe(true);
    // Mục 2 + 19.12 câu 25: lưu trữ là chỉ đọc.
    expect(choTaoTuBang('id-CU', DU_AN)).toBe(false);
    // Không có trong danh sách (máy chủ ẩn dự án lưu trữ) / danh sách chưa về ⇒ không đoán.
    expect(choTaoTuBang('id-LA', DU_AN)).toBe(false);
    expect(choTaoTuBang('id-SPX', undefined)).toBe(false);
  });
});

/* ================================================================== *
 * (a) Chỉ cột Cần làm có `+`
 * ================================================================== */

describe('(a) nút `+` chỉ ở đầu cột Backlog và cột Cần làm', () => {
  /*
   * T-111 A (29/10, BAT-64): cột Backlog cũng có `+` — trước đây ca này ghim "chỉ
   * cột Cần làm, đúng 1 nút". Bốn cột Đang làm / Chờ kiểm chứng / Xong / Huỷ vẫn
   * không có nút nào.
   */
  it('bảng chung: cột Backlog và Cần làm có `+` (nhãn + title rõ), bốn cột còn lại KHÔNG có nút nào', async () => {
    may();
    await vaoBang('/ticket?xem=bang');

    for (const cot of ['backlog', 'todo'] as const) {
      const nut = nutCot(cot);
      expect(nut, cot).not.toBeNull();
      expect(nut?.getAttribute('type')).toBe('button');
      expect(nut?.getAttribute('aria-label')).toBe(nhanNutTaoTrongCot(NHAN_TRANG_THAI[cot]));
      expect(nut?.getAttribute('title')).toBe(nhanNutTaoTrongCot(NHAN_TRANG_THAI[cot]));
      // Nút ngoài `h2`: tên tiêu đề cột không lẫn nhãn nút.
      expect(nut?.closest('h2')).toBeNull();
    }

    for (const cot of ['in_progress', 'verifying', 'done', 'canceled']) {
      expect(document.querySelector(`[data-dau-cot="${cot}"]`), cot).not.toBeNull();
      expect(document.querySelector(`[data-dau-cot="${cot}"] button`), cot).toBeNull();
    }
    expect(document.querySelectorAll('button[data-nut="tao-trong-cot"]')).toHaveLength(2);
  });

  it('cột Cần làm RỖNG (thu hẹp) vẫn có `+`; cột Backlog RỖNG (thu hẹp) cũng vậy', async () => {
    may([dong({ ma: 'SAI-2', trang_thai: 'in_progress', nhom_trang_thai: 'active' })]);
    await vaoBang('/ticket?xem=bang');

    expect(document.querySelector('[data-cot="todo"]')?.getAttribute('data-rong')).toBe('co');
    expect(nutCot('todo')).not.toBeNull();
    expect(document.querySelector('[data-cot="backlog"]')?.getAttribute('data-rong')).toBe('co');
    expect(nutCot('backlog')).not.toBeNull();
  });
});

/* ================================================================== *
 * (b) Bấm `+` mở CHÍNH hộp Tạo việc của vỏ, dự án chọn sẵn
 * ================================================================== */

describe('(b) bấm `+` mở hộp Tạo việc của vỏ', () => {
  it('bảng của dự án SPX (`/du-an/SPX`): hộp mở, ô Dự án đã chọn SPX; chỉ MỘT hộp', async () => {
    may();
    await vaoBang('/du-an/SPX?xem=bang');

    await userEvent.click(nutCot('todo')!);
    expect(document.querySelectorAll('[data-o="hop-tao-viec"]')).toHaveLength(1);
    expect(oDuAn().value).toBe('id-SPX');
  });

  it('bảng của dự án đang tạm dừng (`/du-an/COS`): vẫn có `+`, chọn sẵn COS (19.12 câu 26)', async () => {
    may();
    await vaoBang('/du-an/COS?xem=bang');

    await userEvent.click(nutCot('todo')!);
    expect(oDuAn().value).toBe('id-COS');
  });

  it('bảng chung không lọc dự án: hộp mở, ô Dự án CHƯA chọn — để chủ chọn như cũ', async () => {
    may();
    await vaoBang('/ticket?xem=bang');

    await userEvent.click(nutCot('todo')!);
    expect(document.querySelector('[data-o="hop-tao-viec"]')).not.toBeNull();
    expect(oDuAn().value).toBe('');
  });

  it('bảng chung LỌC một dự án (`/ticket?du_an=id-SPX`): bấm `+` ⇒ ô Dự án chọn sẵn SPX', async () => {
    may();
    await vaoBang(`/ticket?xem=bang&${KHOA_LOC_TICKET.du_an}=id-SPX`);

    await userEvent.click(nutCot('todo')!);
    expect(oDuAn().value).toBe('id-SPX');
  });

  it('cùng URL lọc một dự án, phím `C` ⇒ cũng chọn sẵn SPX', async () => {
    may();
    await vaoBang('/ticket?xem=bang&du_an=id-SPX');

    await userEvent.keyboard('c');
    expect(oDuAn().value).toBe('id-SPX');
  });

  it('URL lặp khoá lọc dự án (`du_an=id-SPX&du_an=id-COS`): không đoán — ô Dự án CHƯA chọn', async () => {
    may();
    await vaoBang('/ticket?xem=bang&du_an=id-SPX&du_an=id-COS');

    await userEvent.click(nutCot('todo')!);
    expect(oDuAn().value).toBe('');
  });

  it('phím `C` trên bảng vẫn mở đúng hộp ấy (giữ nguyên), cùng dự án chọn sẵn', async () => {
    may();
    await vaoBang('/du-an/SPX?xem=bang');

    await userEvent.keyboard('c');
    expect(document.querySelectorAll('[data-o="hop-tao-viec"]')).toHaveLength(1);
    expect(oDuAn().value).toBe('id-SPX');
  });
});

/* ================================================================== *
 * (c) Thân POST giống luồng `C`: không có trường trạng thái
 * ================================================================== */

/*
 * BAT-63: hộp có ô Trạng thái (Cần làm / Backlog). Mở từ `+` cột Cần làm ⇒ ô ở Cần
 * làm, và Cần làm là mặc định máy chủ nên thân **vẫn** không mang `trang_thai`
 * (cùng nếp `baton create` không cờ) — kỳ vọng ca dưới giữ nguyên.
 */
describe('(c) gửi hộp mở từ `+` Cần làm ⇒ `POST /v1/ticket` KHÔNG có trường trạng thái (mặc định máy chủ)', () => {
  async function guiTu(mo: () => Promise<void>): Promise<unknown> {
    const m = may();
    await vaoBang('/du-an/SPX?xem=bang');
    await mo();
    await userEvent.type(within(hop()).getByLabelText(NHAN_O_TIEU_DE), 'Việc mới');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    return m.da_goi.find((l) => l.method === 'POST' && l.duong === '/v1/ticket')?.than;
  }

  it('thân từ nút `+` = thân từ phím `C`, và không có `trang_thai`', async () => {
    const tu_nut = await guiTu(async () => {
      await userEvent.click(nutCot('todo')!);
    });
    expect(tu_nut).toEqual({ project_id: 'id-SPX', tieu_de: 'Việc mới', uu_tien: 'none' });
    expect(Object.keys(tu_nut as object)).not.toContain('trang_thai');
  });

  it('cùng ca qua phím `C` — đối chứng', async () => {
    const tu_phim = await guiTu(async () => {
      await userEvent.keyboard('c');
    });
    expect(tu_phim).toEqual({ project_id: 'id-SPX', tieu_de: 'Việc mới', uu_tien: 'none' });
  });
});

/* ================================================================== *
 * (d) Dự án lưu trữ (chỉ đọc) ⇒ không có `+`
 * ================================================================== */

describe('(d) dự án `archived` (chỉ đọc, mục 2) ⇒ KHÔNG có nút `+`', () => {
  it('`/du-an/CU` (dự án lưu trữ lọt vào danh sách): bảng vẽ, không có `+`', async () => {
    may();
    await vaoBang('/du-an/CU?xem=bang');
    expect(document.querySelector('button[data-nut="tao-trong-cot"]')).toBeNull();
  });

  it('bảng chung lọc theo dự án lưu trữ (`?du_an=id-CU`): không có `+`', async () => {
    may();
    await vaoBang('/ticket?xem=bang&du_an=id-CU');
    expect(document.querySelector('button[data-nut="tao-trong-cot"]')).toBeNull();
  });

  it('lọc theo một id KHÔNG có trong danh sách dự án (máy chủ ẩn lưu trữ): không đoán, không `+`', async () => {
    may();
    await vaoBang('/ticket?xem=bang&du_an=id-LA');
    expect(document.querySelector('button[data-nut="tao-trong-cot"]')).toBeNull();
  });
});

/* ================================================================== *
 * (e) Bấm `+` không mở thẻ, không đổi chọn
 * ================================================================== */

describe('(e) bấm `+` không mở thẻ và không đổi thẻ đang chọn / tập chọn', () => {
  function panel(): string | null {
    return (
      document.querySelector('[data-trang-thai-panel]')?.getAttribute('data-trang-thai-panel') ??
      null
    );
  }

  it('chưa chọn thẻ nào: bấm `+` ⇒ không panel, không thẻ nào `data-chon="co"` / `data-da-chon="co"`', async () => {
    may();
    await vaoBang('/ticket?xem=bang');

    await userEvent.click(nutCot('todo')!);
    expect(hop()).toBeTruthy();
    expect(panel()).toBeNull();
    expect(document.querySelector('[data-the-ticket][data-chon="co"]')).toBeNull();
    expect(document.querySelector('[data-the-ticket][data-da-chon="co"]')).toBeNull();
  });

  it('đang mở SAI-2 ở panel: bấm `+` rồi đóng hộp ⇒ panel vẫn SAI-2, thẻ chọn không đổi', async () => {
    may();
    await vaoBang('/ticket?xem=bang&the=SAI-2');
    await waitFor(() => {
      expect(panel()).toBe('SAI-2');
    });

    await userEvent.click(nutCot('todo')!);
    expect(hop()).toBeTruthy();
    expect(panel()).toBe('SAI-2');
    expect(document.querySelector('[data-the-ticket="SAI-2"]')?.getAttribute('data-chon')).toBe('co');
    expect(document.querySelector('[data-the-ticket="SAI-1"]')?.getAttribute('data-chon')).toBe(
      'khong',
    );

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
    expect(panel()).toBe('SAI-2');
  });
});

/* ================================================================== *
 * BAT-63 — `+` ở đầu nhóm Backlog của kiểu Danh sách (T-108 = B)
 * ================================================================== */

/** Có một ticket Backlog: nhóm rỗng ở Danh sách thì ẩn (d.417), nên cần nó để nhóm hiện. */
const DS_CO_BACKLOG = [
  ...DS,
  dong({ ma: 'SAI-4', trang_thai: 'backlog', nhom_trang_thai: 'planned' }),
];

/** Vào vỏ ở `duong` (kiểu Danh sách), chờ nhóm Backlog vẽ xong. */
async function vaoDanhSach(duong: string): Promise<void> {
  dung(<App />, duong);
  await screen.findByRole('navigation', { name: 'Điều hướng chính' });
  await waitFor(() => {
    expect(document.querySelector('[data-nhom="backlog"]')).not.toBeNull();
  });
  await screen.findAllByText('Sample');
}

function nutNhom(nhom: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `[data-dau-nhom="${nhom}"] button[data-nut="tao-trong-nhom"]`,
  );
}

function oTrangThai(): HTMLSelectElement {
  return within(hop()).getByLabelText(NHAN_O_TRANG_THAI);
}

describe('BAT-63 — lưới SPEC: nhóm có `+` ở Danh sách là trạng thái "chọn được khi tạo"', () => {
  it('chỉ nhóm Backlog; nhãn của nó là nhãn SPEC mục 4 "người tạo được chọn **…**"', () => {
    expect(NHOM_CO_NUT_TAO).toEqual(['backlog']);
    const spec = trangThaiKhiTaoTuSpec();
    expect(spec.chon_them).toEqual([NHAN_TRANG_THAI.backlog]);
    expect(spec.mac_dinh).toBe(NHAN_TRANG_THAI.todo);
    expect(spec.cam_con_lai).toBe(true);
    // T-111 A (29/10): 6 cột, Backlog đầu — trước BAT-64 ca này ghim năm cột, không
    // cột Backlog. `+` nhóm Backlog ở Danh sách vẫn giữ (#180).
    expect(NHOM_COT_CHU).toEqual(['backlog', 'todo', 'in_progress', 'verifying', 'done', 'canceled']);
  });
});

describe('BAT-63 (f) nút `+` chỉ ở đầu nhóm Backlog của kiểu Danh sách', () => {
  it('nhóm Backlog có `+` (nhãn + title rõ, ngoài `h2`); nhóm khác KHÔNG có nút; Danh sách không có `+` cột', async () => {
    may(DS_CO_BACKLOG);
    await vaoDanhSach('/ticket?xem=danh-sach');

    const nut = nutNhom('backlog');
    expect(nut).not.toBeNull();
    expect(nut?.getAttribute('type')).toBe('button');
    expect(nut?.getAttribute('aria-label')).toBe(nhanNutTaoTrongNhom(NHAN_TRANG_THAI.backlog));
    expect(nut?.getAttribute('title')).toBe(nhanNutTaoTrongNhom(NHAN_TRANG_THAI.backlog));
    expect(nut?.closest('h2')).toBeNull();
    // Tiêu đề nhóm vẫn là `h2[data-nhom]`, tên không lẫn nhãn nút.
    expect(document.querySelector('h2[data-nhom="backlog"]')?.textContent).not.toContain('Tạo việc');

    for (const nhom of ['todo', 'in_progress', 'verifying']) {
      expect(document.querySelector(`[data-dau-nhom="${nhom}"]`), nhom).not.toBeNull();
      expect(document.querySelector(`[data-dau-nhom="${nhom}"] button`), nhom).toBeNull();
    }
    expect(document.querySelectorAll('button[data-nut="tao-trong-nhom"]')).toHaveLength(1);
    expect(document.querySelector('button[data-nut="tao-trong-cot"]')).toBeNull();
  });

  /*
   * T-111 A (29/10, BAT-64): 6 cột, Backlog đầu — trước đây ca này ghim "năm cột,
   * không cột Backlog, `+` duy nhất là cột Cần làm".
   */
  it('Bảng: sáu cột Backlog đầu, không `+` nhóm — `+` cột chỉ ở Backlog và Cần làm', async () => {
    may(DS_CO_BACKLOG);
    await vaoBang('/ticket?xem=bang');

    expect([...document.querySelectorAll('[data-cot]')].map((c) => c.getAttribute('data-cot'))).toEqual(
      ['backlog', 'todo', 'in_progress', 'verifying', 'done', 'canceled'],
    );
    // Thẻ Backlog nằm trong cột Backlog.
    expect(document.querySelector('[data-cot="backlog"] [data-the-ticket="SAI-4"]')).not.toBeNull();
    expect(document.querySelector('button[data-nut="tao-trong-nhom"]')).toBeNull();
    expect(document.querySelectorAll('button[data-nut="tao-trong-cot"]')).toHaveLength(2);
    expect(nutCot('backlog')).not.toBeNull();
    expect(nutCot('todo')).not.toBeNull();
  });

  it('không có ticket Backlog ⇒ nhóm ẩn (d.417) ⇒ không có `+` nhóm (cau-hoi-spec #180)', async () => {
    may(DS);
    dung(<App />, '/ticket?xem=danh-sach');
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await waitFor(() => {
      expect(document.querySelector('[data-nhom="todo"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-nhom="backlog"]')).toBeNull();
    expect(document.querySelector('button[data-nut="tao-trong-nhom"]')).toBeNull();
  });
});

describe('BAT-63 (g) bấm `+` Backlog ⇒ hộp Tạo việc của vỏ với Backlog chọn sẵn', () => {
  it('`/du-an/SPX` kiểu Danh sách: một hộp, ô Dự án SPX, ô Trạng thái Backlog; gửi ⇒ thân có `trang_thai: backlog`', async () => {
    const m = may(DS_CO_BACKLOG);
    await vaoDanhSach('/du-an/SPX?xem=danh-sach');

    await userEvent.click(nutNhom('backlog')!);
    expect(document.querySelectorAll('[data-o="hop-tao-viec"]')).toHaveLength(1);
    expect(oDuAn().value).toBe('id-SPX');
    expect(oTrangThai().value).toBe('backlog');

    await userEvent.type(within(hop()).getByLabelText(NHAN_O_TIEU_DE), 'Ý tưởng xa');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST' && l.duong === '/v1/ticket')?.than).toEqual({
      project_id: 'id-SPX',
      tieu_de: 'Ý tưởng xa',
      uu_tien: 'none',
      trang_thai: 'backlog',
    });
  });

  it('bảng chung không lọc dự án: ô Dự án CHƯA chọn, ô Trạng thái Backlog', async () => {
    may(DS_CO_BACKLOG);
    await vaoDanhSach('/ticket?xem=danh-sach');

    await userEvent.click(nutNhom('backlog')!);
    expect(oDuAn().value).toBe('');
    expect(oTrangThai().value).toBe('backlog');
  });

  it('`+` cột Cần làm (Bảng) ⇒ ô Trạng thái Cần làm', async () => {
    may(DS_CO_BACKLOG);
    await vaoBang('/du-an/SPX?xem=bang');

    await userEvent.click(nutCot('todo')!);
    expect(oTrangThai().value).toBe('todo');
  });

  it('mở từ Backlog, đóng, mở lại bằng phím `C` hoặc nút "Tạo việc" ⇒ Cần làm (đặt lại mỗi lần mở)', async () => {
    may(DS_CO_BACKLOG);
    await vaoDanhSach('/du-an/SPX?xem=danh-sach');

    await userEvent.click(nutNhom('backlog')!);
    expect(oTrangThai().value).toBe('backlog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();

    await userEvent.keyboard('c');
    expect(oTrangThai().value).toBe('todo');
    await userEvent.keyboard('{Escape}');

    await userEvent.click(nutNhom('backlog')!);
    expect(oTrangThai().value).toBe('backlog');
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByLabelText(NHAN_NUT_TAO));
    expect(oTrangThai().value).toBe('todo');
  });

  it('đang mở SAI-1 ở panel: bấm `+` Backlog rồi đóng ⇒ panel vẫn SAI-1, không thẻ nào đổi chọn', async () => {
    may(DS_CO_BACKLOG);
    await vaoDanhSach('/ticket?xem=danh-sach&the=SAI-1');
    const panel = (): string | null =>
      document.querySelector('[data-trang-thai-panel]')?.getAttribute('data-trang-thai-panel') ??
      null;
    await waitFor(() => {
      expect(panel()).toBe('SAI-1');
    });

    await userEvent.click(nutNhom('backlog')!);
    expect(hop()).toBeTruthy();
    expect(panel()).toBe('SAI-1');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();
    expect(panel()).toBe('SAI-1');
  });
});

describe('BAT-63 (h) dự án `archived` (chỉ đọc) ⇒ KHÔNG có `+` nhóm Backlog', () => {
  it('`/du-an/CU` kiểu Danh sách: nhóm Backlog vẽ, không có `+`', async () => {
    may(DS_CO_BACKLOG);
    await vaoDanhSach('/du-an/CU?xem=danh-sach');
    expect(document.querySelector('button[data-nut="tao-trong-nhom"]')).toBeNull();
  });

  it('bảng chung lọc theo dự án lưu trữ / id không có trong danh sách: không `+`', async () => {
    may(DS_CO_BACKLOG);
    await vaoDanhSach('/ticket?xem=danh-sach&du_an=id-CU');
    expect(document.querySelector('button[data-nut="tao-trong-nhom"]')).toBeNull();
  });

  it('id dự án lạ (máy chủ ẩn lưu trữ): không đoán, không `+`', async () => {
    may(DS_CO_BACKLOG);
    await vaoDanhSach('/ticket?xem=danh-sach&du_an=id-LA');
    expect(document.querySelector('button[data-nut="tao-trong-nhom"]')).toBeNull();
  });
});

/* ================================================================== *
 * BAT-64 — cột Backlog của Bảng (SPEC mục 14, Chủ chốt T-111 = A, 29/10)
 * ================================================================== */

describe('BAT-64 — Bảng sáu cột, Backlog đầu, `+` ở đầu cột Backlog', () => {
  it('thứ tự cột trên màn hình = câu "sáu cột theo thứ tự …" của SPEC mục 14', async () => {
    may(DS_CO_BACKLOG);
    await vaoBang('/ticket?xem=bang');

    const nhan = [...document.querySelectorAll('[data-cot]')].map((c) => c.getAttribute('aria-label'));
    expect(nhan).toEqual(cotBangTuSpec().cot);
    expect(NHOM_COT_CHU.map((t) => NHAN_TRANG_THAI[t])).toEqual(cotBangTuSpec().cot);
  });

  it('đầu cột Backlog: icon trạng thái Backlog + tên "Backlog" + số đếm', async () => {
    may([
      ...DS_CO_BACKLOG,
      dong({ ma: 'SAI-5', trang_thai: 'backlog', nhom_trang_thai: 'planned' }),
    ]);
    await vaoBang('/ticket?xem=bang');

    const dau = document.querySelector('[data-dau-cot="backlog"]');
    expect(dau).not.toBeNull();
    const h2 = dau?.querySelector('h2');
    expect(h2?.querySelector('[data-icon-trang-thai="backlog"]')).not.toBeNull();
    expect(h2?.textContent).toContain(NHAN_TRANG_THAI.backlog);
    expect(h2?.querySelector('[data-so="cot"]')?.textContent).toBe('2');
    expect(document.querySelector('[data-cot="backlog"]')?.getAttribute('data-nhom-chu')).toBe('co');
  });

  it('`/du-an/SPX` Bảng: `+` cột Backlog ⇒ một hộp, ô Dự án SPX, ô Trạng thái Backlog; gửi ⇒ thân có `trang_thai: backlog`', async () => {
    const m = may();
    await vaoBang('/du-an/SPX?xem=bang');

    await userEvent.click(nutCot('backlog')!);
    expect(document.querySelectorAll('[data-o="hop-tao-viec"]')).toHaveLength(1);
    expect(oDuAn().value).toBe('id-SPX');
    expect(oTrangThai().value).toBe('backlog');

    await userEvent.type(within(hop()).getByLabelText(NHAN_O_TIEU_DE), 'Ý tưởng xa');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST' && l.duong === '/v1/ticket')?.than).toEqual({
      project_id: 'id-SPX',
      tieu_de: 'Ý tưởng xa',
      uu_tien: 'none',
      trang_thai: 'backlog',
    });
  });

  it('`+` cột Cần làm cạnh đó vẫn mở với Cần làm, POST KHÔNG có `trang_thai`', async () => {
    const m = may();
    await vaoBang('/du-an/SPX?xem=bang');

    await userEvent.click(nutCot('todo')!);
    expect(oTrangThai().value).toBe('todo');
    await userEvent.type(within(hop()).getByLabelText(NHAN_O_TIEU_DE), 'Việc mới');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GUI_TAO }));
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/ticket')).toBe(1);
    });
    const than = m.da_goi.find((l) => l.method === 'POST' && l.duong === '/v1/ticket')?.than;
    expect(than).toEqual({ project_id: 'id-SPX', tieu_de: 'Việc mới', uu_tien: 'none' });
  });

  it('mở từ `+` cột Backlog, đóng, mở lại bằng `+` cột Cần làm hoặc phím `C` ⇒ Cần làm', async () => {
    may();
    await vaoBang('/du-an/SPX?xem=bang');

    await userEvent.click(nutCot('backlog')!);
    expect(oTrangThai().value).toBe('backlog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: NHAN_HOP_TAO_VIEC })).toBeNull();

    await userEvent.click(nutCot('todo')!);
    expect(oTrangThai().value).toBe('todo');
    await userEvent.keyboard('{Escape}');

    await userEvent.click(nutCot('backlog')!);
    expect(oTrangThai().value).toBe('backlog');
    await userEvent.keyboard('{Escape}');

    await userEvent.keyboard('c');
    expect(oTrangThai().value).toBe('todo');
  });

  it('dự án `archived` (`/du-an/CU`): cột Backlog vẽ nhưng KHÔNG có `+`', async () => {
    may(DS_CO_BACKLOG);
    await vaoBang('/du-an/CU?xem=bang');
    expect(document.querySelector('[data-dau-cot="backlog"]')).not.toBeNull();
    expect(nutCot('backlog')).toBeNull();
  });

  it('`+` nhóm Backlog ở Danh sách vẫn còn (BAT-63 giữ nguyên)', async () => {
    may(DS_CO_BACKLOG);
    await vaoDanhSach('/ticket?xem=danh-sach');
    expect(nutNhom('backlog')).not.toBeNull();
  });
});
