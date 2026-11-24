/**
 * **Trang Tổng quan** — SPEC mục 11 d.316–323, mục 2 d.74, mục 14 d.408 + d.412.
 *
 * Từ **BAT-6 đợt 3** trang này là màn hình **quản lý công việc tổng quát** (chủ
 * chốt 14/10, SPEC mục 11 viết lại): năm khối là Dự án → Việc đang chạy → Agent
 * đang làm gì → Vừa xong → Cần chú ý, và **Cần Chủ chỉ còn một ô gọn** ở thanh
 * bên phải (d.322).
 *
 * Ba lớp chống "test xanh giả" của file này:
 *
 *   1. **Tên và thứ tự năm khối cắt ra từ `SPEC.md`** (`khoiTongQuanTuSpec`), và
 *      chữ của ⚪ cũng vậy (`cauDuAnKhongChayTuSpec`) — không gõ lại trong ca
 *      test. Kèm một ca ghim **chính parser** (`SPEC.length === 5`), để mã-và-SPEC
 *      cùng lệch vẫn đỏ.
 *   2. **Máy chủ giả trượt kèm tên đường** (`MayChuGia`): một khối tự gọi thêm
 *      một đường ngoài `/v1/tong-quan` làm ca đỏ, chứ không xanh với một màn hình
 *      thiếu dữ liệu. Đó là lưới canh luật "một đường, một lượt gọi".
 *   3. **Không một kết luận nghiệp vụ nào dựng trong ca test**: thân giả nói
 *      thẳng những gì máy chủ tính (`so_xong`/`so_tong`, `viec_noi_bat`,
 *      `nguoi_cam_ten`, `can_chu_y` đã gom), nên nếu trang tự tính lại thì ca
 *      đỏ.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DinhTuyen } from '../src/dinh-tuyen';
import {
  CAU_CHUA_AI_CAM,
  CAU_CHUA_LEN_TIENG,
  CAU_CHUA_XONG_VIEC_NAO,
  CAU_CHUA_XONG_VIEC_NAO_7N,
  CAU_DANG_LAM_MOI,
  CAU_DANG_TAI_TONG_QUAN,
  CAU_KHONG_AGENT_NAO_DANG_LAM,
  CAU_KHONG_CO_GI_CAN_CHU_Y,
  CAU_KHONG_CO_MUC_CHO,
  CAU_KHONG_CO_VIEC_DANG_CHAY,
  CUA_SO_VUA_XONG,
  NHAN_PHIEN_DUYET,
  TEN_KHOI,
  TEN_O_CAN_CHU,
  ThanhTienDo,
  TrangTongQuan,
  nhanAgentRanh,
} from '../src/trang/tong-quan';
import { CAU_DU_AN_KHONG_CHAY, NHAN_CHUA_TINH } from '../src/vo/cham-suc-song';
import { gioDayDu, thoiGianTuongDoi } from '../src/thoi-gian';
import type { TongQuan } from '../src/api';
import { MayChuGia, dung } from './giup';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import {
  cauDuAnKhongChayTuSpec,
  hienThayDoiTuSpec,
  khoiTongQuanTuSpec,
  specDoiThoiGianTuongDoi,
} from './doc-spec';
import {
  GIO,
  GIO_MS,
  PHUT,
  TONG_QUAN_RONG,
  dongCanChuY,
  hangDuAn,
  nhomCanChuY,
  theAgent,
  theViecDangChay,
  ticketDong,
  ticketTroTa,
} from './than-tong-quan';

const SPEC_KHOI = khoiTongQuanTuSpec();

/** Gắn máy chủ giả trả một thân Tổng quan. */
function may(than: TongQuan): MayChuGia {
  return new MayChuGia().dat('GET /v1/tong-quan', { than }).gan();
}

/** Nhãn các khối đang hiện trên DOM, **theo thứ tự DOM**. */
function khoiDangHien(): string[] {
  return [...document.querySelectorAll('[data-khoi]')].map(
    (e) => e.getAttribute('aria-label') ?? '',
  );
}

/* ================================================================== *
 * A. Năm khối, đúng thứ tự "từ trên xuống" của d.316
 * ================================================================== */

describe('d.316–321 — năm khối, đúng chữ và đúng thứ tự của SPEC', () => {
  it('parser cắt ra đúng NĂM khối từ SPEC (lưới của chính ca này)', () => {
    expect(SPEC_KHOI.length).toBe(5);
    expect(SPEC_KHOI).toEqual([
      'Dự án',
      'Việc đang chạy',
      'Agent đang làm gì',
      'Vừa xong',
      'Cần chú ý',
    ]);
  });

  it('trang vẽ đủ năm khối, ĐÚNG THỨ TỰ SPEC liệt kê, không thiếu không thừa', async () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: SPEC_KHOI[0] ?? '' });
    expect(khoiDangHien()).toEqual(SPEC_KHOI);
  });

  it('`TEN_KHOI` trong mã khớp SPEC (bắt lệch ngay ở sổ tra, không chỉ ở DOM)', () => {
    expect([
      TEN_KHOI.du_an,
      TEN_KHOI.viec_dang_chay,
      TEN_KHOI.agent,
      TEN_KHOI.vua_xong,
      TEN_KHOI.can_chu_y,
    ]).toEqual(SPEC_KHOI);
  });

  it('khối ĐẦU TRANG là Dự án, và Cần Chủ KHÔNG còn là một khối', async () => {
    /*
     * Ca của chính chốt 14/10 ("để Cần Chủ lên trên thì không đúng"). Hai vế, và
     * cả hai cần: khối đầu là "Dự án", **và** Cần Chủ không mang `data-khoi` nào
     * — nếu nó vẫn là một `section` có `data-khoi` thì ca "đúng thứ tự" ở trên
     * cũng đỏ, nhưng ca này nói rõ **vì sao**.
     */
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });
    expect(khoiDangHien()[0]).toBe('Dự án');
    expect(khoiDangHien()).not.toContain(TEN_O_CAN_CHU);
    expect(document.querySelector('[data-khoi="can-chu"]')).toBeNull();
  });

  it('chỉ gọi ĐÚNG MỘT đường, đúng một lần — không ghép từ sáu đường rời', async () => {
    const m = may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });
    expect(m.da_goi.map((l) => l.duong)).toEqual(['/v1/tong-quan']);
    expect(m.soLan('GET', '/v1/tong-quan')).toBe(1);
  });
});

/* ================================================================== *
 * B. Ô Cần Chủ ở thanh bên phải (d.322)
 * ================================================================== */

describe('d.322 — Cần Chủ là một Ô GỌN ở bên phải, không khối đầu trang', () => {
  const than: TongQuan = {
    ...TONG_QUAN_RONG,
    can_chu: {
      so_theo_muc: { urgent: 2, today: 3, later: 0 },
      so_cho: 5,
      muc_cao_nhat: 'urgent',
      gap_nhat: [],
      ds_cho: [],
    },
  };

  it('là một vùng PHỤ (`complementary`), có đủ ba con số theo mức', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const o = await screen.findByRole('complementary', { name: TEN_O_CAN_CHU });
    const so = [...o.querySelectorAll('[data-ds="so-theo-muc"] [data-muc]')].map((e) => [
      e.getAttribute('data-muc'),
      e.textContent?.replace(/\D/g, ''),
    ]);
    expect(so).toEqual([
      ['urgent', '2'],
      ['today', '3'],
      ['later', '0'],
    ]);
  });

  it('có link tới `/can-chu` và nút "Bắt đầu phiên duyệt" — đủ ba thứ d.322 kể', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const o = await screen.findByRole('complementary', { name: TEN_O_CAN_CHU });
    expect(o.querySelector('[data-lien="can-chu"]')?.getAttribute('href')).toBe('/can-chu');
    expect(o.querySelector('[data-nut="phien-duyet"]')).not.toBeNull();
    // Và ô **không** kể danh sách mục nào: nó là một ô gọn, không một hộp thư.
    expect(o.querySelectorAll('[data-muc-can-chu]').length).toBe(0);
  });

  it('nút "Bắt đầu phiên duyệt" điều hướng tới `/can-chu`', async () => {
    /*
     * Dựng **cả bộ định tuyến thật**, không riêng trang: một spy trên
     * `useNavigate` chỉ canh "có gọi navigate", còn ca này canh **tới đúng đường
     * có trang thật** — tức nó cũng đỏ nếu `/can-chu` bị đổi mà nút thì không.
     */
    may(TONG_QUAN_RONG);
    dung(<DinhTuyen />, '/');
    const nut = await screen.findByRole('button', { name: NHAN_PHIEN_DUYET });
    act(() => {
      nut.click();
    });
    expect(await screen.findByRole('heading', { name: 'Cần Chủ', level: 1 })).toBeTruthy();
    // Và trang Tổng quan đã rời khỏi DOM.
    expect(document.querySelector('[data-khoi="du-an"]')).toBeNull();
  });

  it('không có mục Chờ nào ⇒ nói thẳng, không để trống', async () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    expect(await screen.findByText(CAU_KHONG_CO_MUC_CHO)).toBeTruthy();
  });
});

/* ================================================================== *
 * C. Khối 1 — Dự án (d.317) + chữ của ⚪ (d.74)
 * ================================================================== */

describe('d.317 — mỗi dự án: chấm, thanh tiến độ xong/tổng, bốn số, việc nổi bật', () => {
  const than: TongQuan = {
    ...TONG_QUAN_RONG,
    du_an: [
      hangDuAn({
        ma: 'SAI',
        ten: 'Sample',
        suc_song: 'xanh',
        so_dang_lam: 2,
        so_cho_kiem_chung: 1,
        so_can_lam: 5,
        so_xong: 3,
        so_tong: 12,
        so_xong_24h: 4,
        viec_noi_bat: {
          ...ticketTroTa('SAI-7', 'Dựng cổng Xong'),
          trang_thai: 'in_progress',
          nhan_trang_thai: 'Đang làm',
        },
      }),
      hangDuAn({ ma: 'COS', ten: 'Chief of Staff', suc_song: 'vang', so_dang_lam: 1 }),
      hangDuAn({ ma: 'INC', ten: 'INC Docs', suc_song: 'trang' }),
    ],
  };

  it('mỗi dự án một THẺ (20.4), mỗi thẻ một chấm sức sống đúng giá trị máy chủ', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    const cham: Record<string, string | null | undefined> = {};
    for (const e of khoi.querySelectorAll('article[data-du-an]')) {
      cham[e.getAttribute('data-du-an') ?? ''] = e.querySelector('[data-suc-song]')?.getAttribute('data-suc-song');
    }
    expect(cham).toEqual({ SAI: 'xanh', COS: 'vang', INC: 'trang' });
  });

  it('SPEC 11 ý 1 → 20.2: khối Dự án KHÔNG còn hàng thanh tiến độ + bốn con số của d.317 cũ', async () => {
    /*
     * Mục 11 ý 1 nay là "Dự án: Bản đồ dự án (mục 20)" — thanh tiến độ việc và
     * bốn con số Đang làm/Chờ kiểm chứng/Cần làm không còn trong SPEC. Tiến độ
     * nay là **khối lớn** ("Xong/Tổng", 20.1) — xem `ban-do-tong-quan.test.tsx`.
     */
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    expect(khoi.querySelector('[role="progressbar"]')).toBeNull();
    expect(khoi.querySelector('[data-so="dang-lam"]')).toBeNull();
    expect(khoi.querySelector('[data-ban-do-du-an="co"]')).not.toBeNull();
  });

  it('"việc đang làm nổi bật nhất" hiện kèm link `/t/<MÃ>`; dự án không có thì KHÔNG', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    const noi_bat = khoi.querySelector('[data-du-an="SAI"] [data-noi-bat]');
    expect(noi_bat?.getAttribute('data-noi-bat')).toBe('SAI-7');
    expect(noi_bat?.textContent).toContain('Dựng cổng Xong');
    expect(within(khoi).getByRole('link', { name: 'SAI-7' }).getAttribute('href')).toBe('/t/SAI-7');
    // Dự án ⚪ không có việc nổi bật nào ⇒ không một ô rỗng.
    expect(khoi.querySelector('[data-du-an="INC"] [data-noi-bat]')).toBeNull();
  });

  it('trang KHÔNG tự chọn việc nổi bật: nó vẽ đúng ticket máy chủ trả', async () => {
    /*
     * Thân nói "nổi bật" là một ticket **không** nằm trong khối Việc đang chạy,
     * và ưu tiên của nó cũng không phải cao nhất. Nếu trang tự suy từ
     * `viec_dang_chay` thì nó sẽ vẽ một mã khác và ca này đỏ.
     */
    may({
      ...TONG_QUAN_RONG,
      du_an: [
        hangDuAn({
          ma: 'SAI',
          viec_noi_bat: { ...ticketTroTa('SAI-99', 'Máy chủ chọn cái này'), trang_thai: 'in_progress' },
        }),
      ],
      viec_dang_chay: [
        theViecDangChay({ the: ticketDong({ ma: 'SAI-1', uu_tien: 'urgent', nhan_uu_tien: 'Khẩn' }) }),
      ],
    });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    expect(khoi.querySelector('[data-noi-bat]')?.getAttribute('data-noi-bat')).toBe('SAI-99');
  });

  it('d.74 — dự án ⚪ hiện ĐÚNG CHỮ của SPEC, và chỉ dự án ⚪', async () => {
    // Chữ mong đợi **cắt từ `SPEC.md`**, không gõ lại.
    const cau = cauDuAnKhongChayTuSpec();
    expect(cau).toBe(CAU_DU_AN_KHONG_CHAY);

    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    expect(within(khoi).getAllByText(cau).length).toBe(1);
    expect(khoi.querySelector('[data-du-an="INC"] [data-khong-chay="co"]')).not.toBeNull();
    expect(khoi.querySelector('[data-du-an="SAI"] [data-khong-chay="co"]')).toBeNull();
  });

  it('d.74 ca PHỦ ĐỊNH: thiếu `suc_song` trong thân ⇒ "chưa tính", KHÔNG phải ⚪', async () => {
    /*
     * Dựng **trạng thái xấu thật**: một thân mà máy chủ không trả `suc_song`
     * (bản API cũ, một proxy cắt bớt). Lúc đó không được nói "Dự án không chạy" —
     * d.74 dành câu đó cho ca "không có ticket Đang làm nào", một kết luận mà
     * không ai đã tính ở đây.
     */
    const thieu = { ...hangDuAn({ ma: 'SAI' }) } as Record<string, unknown>;
    delete thieu['suc_song'];
    may({ ...TONG_QUAN_RONG, du_an: [thieu as never] });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    expect(khoi.querySelector('[data-suc-song]')?.getAttribute('data-suc-song')).toBe('chua-tinh');
    expect(within(khoi).queryByLabelText(NHAN_CHUA_TINH)).not.toBeNull();
    expect(within(khoi).queryByText(CAU_DU_AN_KHONG_CHAY)).toBeNull();
  });

  it('`ThanhTienDo` — luật thuần: tổng 0 KHÔNG chia cho 0', () => {
    dung(<ThanhTienDo ten="Dự án mới" xong={0} tong={0} />);
    const thanh = screen.getByRole('progressbar');
    expect(thanh.getAttribute('data-tien-do')).toBe('0/0');
    expect(thanh.querySelector('[data-o="thanh"]')?.getAttribute('data-phan-tram')).toBe('0');
  });
});

/* ================================================================== *
 * D. Khối 2 — Việc đang chạy (d.318)
 * ================================================================== */

describe('d.318 — thẻ việc của mọi dự án, kèm ai cầm và đã cầm bao lâu', () => {
  const than: TongQuan = {
    ...TONG_QUAN_RONG,
    viec_dang_chay: [
      theViecDangChay({
        the: ticketDong({
          ma: 'SAI-7',
          tieu_de: 'Dựng cổng Xong',
          uu_tien: 'high',
          nhan_uu_tien: 'Cao',
          nhan: ['hạ-tầng'],
          con_tong: 3,
          con_chua_ket: 1,
          nguoi_dang_cam: { loai: 'agent', agentId: 'ag-1' },
        }),
        nguoi_cam_ten: 'W-builder',
        cam_tu_luc: GIO - 2 * GIO_MS,
      }),
      theViecDangChay({
        the: ticketDong({
          ma: 'COS-3',
          tieu_de: 'Chờ kiểm chứng',
          trang_thai: 'verifying',
          nhan_trang_thai: 'Chờ kiểm chứng',
        }),
      }),
    ],
  };

  it('một thẻ cho mỗi việc, và thẻ là ĐÚNG component thẻ việc kiểu Linear', async () => {
    /*
     * Lưới cho vế "cùng kiểu thẻ với bảng việc ở mục 14" (d.318): tám ô của thẻ
     * việc đợt 2 mang `data-o="…"`, nên nếu khối này tự vẽ một thẻ nhìn-giống thì
     * các ô ấy không có và ca đỏ.
     */
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.viec_dang_chay });
    const the = khoi.querySelector('[data-the-ticket="SAI-7"]');
    expect(the?.querySelector('[data-o="ma"]')?.getAttribute('href')).toBe('/t/SAI-7');
    expect(the?.querySelector('[data-o="tieu-de"]')?.textContent).toBe('Dựng cổng Xong');
    expect(the?.querySelector('[data-o="uu-tien"]')?.getAttribute('data-uu-tien')).toBe('high');
    expect(the?.querySelector('[data-nhan="hạ-tầng"]')).not.toBeNull();
    // "việc con xong/tổng" = `con_tong − con_chua_ket` (cùng định nghĩa với bảng).
    expect(the?.querySelector('[data-o="viec-con"]')?.textContent).toBe('2/3');
  });

  it('đủ cả `in_progress` và `verifying`, mỗi thẻ nói trạng thái của nó', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.viec_dang_chay });
    expect(
      [...khoi.querySelectorAll('[data-the-ticket]')].map((e) => [
        e.getAttribute('data-the-ticket'),
        e.getAttribute('data-trang-thai'),
      ]),
    ).toEqual([
      ['SAI-7', 'in_progress'],
      ['COS-3', 'verifying'],
    ]);
    // Khối trộn hai trạng thái nên nhãn trạng thái **phải** có trên thẻ.
    expect(
      khoi.querySelector('[data-the-ticket="COS-3"] [data-o="trang-thai"]')?.textContent,
    ).toBe('Chờ kiểm chứng');
  });

  it('người cầm hiện TÊN agent, không bao giờ id (d.404)', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.viec_dang_chay });
    const the = khoi.querySelector('[data-the-ticket="SAI-7"]');
    const o = the?.querySelector('[data-o="nguoi-cam"]');
    expect(o?.getAttribute('title')).toBe('W-builder');
    expect(o?.getAttribute('aria-label')).toBe('Người đang cầm: W-builder');
    // Viết tắt cũng của **tên**, không của id (`ag-1` ⇒ `A1`).
    expect(o?.textContent).toBe('WB');
    // Và không một chỗ nào trên thẻ in cái id ra.
    expect(the?.textContent).not.toContain('ag-1');
    expect(the?.innerHTML).not.toContain('ag-1');
  });

  it('"đã cầm bao lâu" là mốc TƯƠNG ĐỐI đếm từ `bay_gio` của máy chủ (d.412)', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.viec_dang_chay });
    const o = khoi.querySelector('[data-the-ticket="SAI-7"] [data-o="cam-tu"]');
    expect(o?.textContent).toContain('W-builder');
    const moc = o?.querySelector('[data-moc]');
    expect(moc?.textContent).toBe('2 giờ trước');
    expect(moc?.getAttribute('title')).toBe(gioDayDu(GIO - 2 * GIO_MS));
  });

  it('không ai cầm ⇒ nói thẳng, KHÔNG vẽ một mốc bịa', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.viec_dang_chay });
    const o = khoi.querySelector('[data-the-ticket="COS-3"] [data-o="cam-tu"]');
    expect(o?.textContent).toBe(CAU_CHUA_AI_CAM);
    expect(o?.querySelector('[data-moc]')).toBeNull();
  });

  it('không có việc nào đang chạy ⇒ nói thẳng', async () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    expect(await screen.findByText(CAU_KHONG_CO_VIEC_DANG_CHAY)).toBeTruthy();
  });
});

/* ================================================================== *
 * E. Khối 3 — Agent đang làm gì (d.319)
 * ================================================================== */

describe('d.319 — mỗi agent đang làm MỘT DÒNG; agent rảnh gom một dòng', () => {
  const than: TongQuan = {
    ...TONG_QUAN_RONG,
    agent: [
      theAgent({
        id: 'ag-1',
        ten: 'W-builder',
        trang_thai: 'busy',
        nhan_trang_thai: 'Đang làm',
        tin_hieu_cuoi_luc: GIO - 12 * PHUT,
        ticket_dang_cam: [
          { ...ticketTroTa('SAI-7', 'Dựng Tổng quan'), trang_thai: 'in_progress' },
        ],
      }),
      theAgent({
        id: 'ag-2',
        ten: 'M-Baton',
        trang_thai: 'waiting_owner',
        nhan_trang_thai: 'Chờ Chủ',
      }),
    ],
    agent_ranh_so: 4,
  };

  it('một DÒNG cho mỗi agent, với NHÃN tiếng Việt của trạng thái (mục 0.1)', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    const dong = [...khoi.querySelectorAll('[data-agent]')];
    expect(dong.length).toBe(2);
    expect(dong.map((e) => e.tagName)).toEqual(['LI', 'LI']);
    expect(dong.map((e) => e.querySelector('[data-trang-thai]')?.textContent)).toEqual([
      'Đang làm',
      'Chờ Chủ',
    ]);
    // Tên agent, không id.
    expect(dong[0]?.textContent).toContain('W-builder');
  });

  it('agent rảnh là MỘT DÒNG đếm số, không mỗi agent một dòng', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    const gom = khoi.querySelectorAll('[data-agent-ranh="co"]');
    expect(gom.length).toBe(1);
    expect(gom[0]?.textContent).toBe(nhanAgentRanh(4));
  });

  it('không có agent rảnh ⇒ KHÔNG có dòng gom (không "0 agent rảnh")', async () => {
    may({ ...than, agent_ranh_so: 0 });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    expect(khoi.querySelector('[data-agent-ranh="co"]')).toBeNull();
  });

  it('ticket đang cầm hiện mã và link `/t/<MÃ>` (d.398)', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    const lien = within(khoi).getByRole('link', { name: 'SAI-7' });
    expect(lien.getAttribute('href')).toBe('/t/SAI-7');
  });

  it('d.412 — "thời gian từ tín hiệu cuối" là chữ TƯƠNG ĐỐI, `title` là giờ đầy đủ', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    const moc = khoi.querySelector('[data-agent="ag-1"] [data-moc]');
    expect(moc?.textContent).toBe('12 phút trước');
    expect(moc?.getAttribute('title')).toBe(gioDayDu(GIO - 12 * PHUT));
  });

  it('agent chưa lên tiếng lần nào ⇒ nói thẳng, KHÔNG vẽ một mốc bịa', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    const dong = khoi.querySelector('[data-agent="ag-2"]');
    expect(dong?.textContent).toContain(CAU_CHUA_LEN_TIENG);
    expect(dong?.querySelector('[data-moc]')).toBeNull();
  });

  it('không agent nào đang làm ⇒ nói thẳng (nhưng dòng gom vẫn hiện nếu có agent rảnh)', async () => {
    may({ ...TONG_QUAN_RONG, agent_ranh_so: 2 });
    dung(<TrangTongQuan />);
    expect(await screen.findByText(CAU_KHONG_AGENT_NAO_DANG_LAM)).toBeTruthy();
    expect(screen.getByText(nhanAgentRanh(2))).toBeTruthy();
  });
});

/* ================================================================== *
 * F. Khối 4 — Vừa xong (d.320), hai cửa sổ
 * ================================================================== */

describe('d.320 — ticket Xong + bằng chứng rút gọn, cửa sổ 24 giờ hoặc 7 ngày', () => {
  const KHONG_BAO_CAO = {
    bao_cao_nguon: null,
    nhan_bao_cao_nguon: null,
    bao_cao_duong_dan: null,
    bao_cao_noi_dung: null,
    bao_cao_reviewer: null,
  };
  const bc_commit = {
    id: 'bc-1',
    loai: 'commit',
    nhan_loai: 'commit',
    hash: 'a1b2c3d',
    repo: 'chu/baton',
    url: null,
    ma_phien_ban: null,
    xac_minh: 'merged',
    nhan_xac_minh: 'merged',
    nguon_xac_minh: 'github',
    nhan_nguon_xac_minh: 'kiểm qua GitHub',
    review_nguon: null,
    nhan_review_nguon: null,
    review_bao_cao: null,
    ...KHONG_BAO_CAO,
  };
  const bc_deploy = {
    id: 'bc-2',
    loai: 'deploy',
    nhan_loai: 'deploy',
    hash: null,
    repo: null,
    url: 'https://baton.example.com/',
    ma_phien_ban: 'e91efbeb',
    xac_minh: 'passed',
    nhan_xac_minh: 'Đạt',
    nguon_xac_minh: null,
    nhan_nguon_xac_minh: null,
    review_nguon: null,
    nhan_review_nguon: null,
    review_bao_cao: null,
    ...KHONG_BAO_CAO,
  };
  /** Bằng chứng Báo cáo (`bao_cao`, migration 0027) — không hash/URL ⇒ hiện nhãn. */
  const bc_bao_cao = {
    ...bc_deploy,
    id: 'bc-3',
    loai: 'bao_cao',
    nhan_loai: 'Báo cáo',
    url: null,
    ma_phien_ban: null,
    xac_minh: 'not_required',
    nhan_xac_minh: 'Không cần xác minh',
    bao_cao_nguon: 'reviewer',
    nhan_bao_cao_nguon: 'agent reviewer ký',
    bao_cao_duong_dan: 'bao-cao/x.md',
    bao_cao_noi_dung: null,
    bao_cao_reviewer: null,
  };

  const trong_24h = {
    ticket: ticketTroTa('SAI-9', 'Xong việc này'),
    xong_luc: GIO - 2 * GIO_MS,
    bang_chung: [bc_commit, bc_deploy],
  };
  const cu_hon = {
    ticket: ticketTroTa('SAI-4', 'Xong ba ngày trước'),
    xong_luc: GIO - 72 * GIO_MS,
    bang_chung: [],
  };
  const than: TongQuan = {
    ...TONG_QUAN_RONG,
    vua_xong_24h: [trong_24h],
    vua_xong_7n: [trong_24h, cu_hon],
  };

  it('mặc định là cửa sổ 24 GIỜ; hai nút đúng hai lựa chọn của SPEC', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });
    const nut = [...khoi.querySelectorAll('[data-cua-so]')];
    expect(nut.map((e) => [e.getAttribute('data-cua-so'), e.textContent])).toEqual(
      CUA_SO_VUA_XONG.map((c) => [c.ma, c.nhan]),
    );
    expect(nut.map((e) => e.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect([...khoi.querySelectorAll('[data-vua-xong]')].map((e) => e.getAttribute('data-vua-xong'))).toEqual(
      ['SAI-9'],
    );
  });

  it('bấm "7 ngày" đổi tập — và KHÔNG gọi máy chủ lần nữa (d.410)', async () => {
    /*
     * Hai vế trong một ca, cố ý: nếu nút đổi cửa sổ sinh một query thứ hai thì
     * vế sau đỏ, và đó đúng là lỗi d.410 cấm ("một đường đọc duy nhất, một ảnh
     * chụp"). Cả hai tập đã nằm trong thân.
     */
    const m = may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });
    const truoc = m.soLan('GET', '/v1/tong-quan');

    await userEvent.click(khoi.querySelector('[data-cua-so="7n"]') as HTMLElement);

    expect(
      [...khoi.querySelectorAll('[data-vua-xong]')].map((e) => e.getAttribute('data-vua-xong')),
    ).toEqual(['SAI-9', 'SAI-4']);
    expect(
      [...khoi.querySelectorAll('[data-cua-so]')].map((e) => e.getAttribute('aria-pressed')),
    ).toEqual(['false', 'true']);
    expect(m.soLan('GET', '/v1/tong-quan')).toBe(truoc);
    expect(m.da_goi.map((l) => l.duong)).toEqual(Array(truoc).fill('/v1/tong-quan'));
  });

  it('hiện hash 7 ký tự, URL và mã phiên bản — đúng ba thứ d.320 kể', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });
    const hang = khoi.querySelector('[data-vua-xong="SAI-9"]');
    expect(hang?.querySelector('[data-hash="co"]')?.textContent).toBe('a1b2c3d');
    expect(hang?.querySelector('[data-hash="co"]')?.textContent?.length).toBe(7);
    expect(within(khoi).getByRole('link', { name: 'https://baton.example.com/' })).toBeTruthy();
    expect(hang?.querySelector('[data-ma-phien-ban="co"]')?.textContent).toBe('e91efbeb');
  });

  it('giao diện KHÔNG tự cắt hash: nó hiện đúng chuỗi máy chủ trả', async () => {
    /*
     * Ca phủ định của việc cắt hai lần: nếu trang tự `slice(0, 7)` thì một thân
     * mang hash dài (một bản API chưa cắt) sẽ hiện 7 ký tự và lỗi của máy chủ bị
     * che. Luật d.320 phải ở **một** chỗ, và ca này ghim rằng chỗ đó là máy chủ.
     */
    const dai = { ...trong_24h, bang_chung: [{ ...bc_commit, hash: 'a1b2c3d4e5f6' }] };
    may({ ...TONG_QUAN_RONG, vua_xong_24h: [dai], vua_xong_7n: [dai] });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });
    expect(khoi.querySelector('[data-hash="co"]')?.textContent).toBe('a1b2c3d4e5f6');
  });

  it('URL KHÔNG phải `https:` thì hiện nguyên văn nhưng KHÔNG thành link', async () => {
    /*
     * Dựng trạng thái xấu **thật**: một bằng chứng `deploy` mang
     * `javascript:alert(1)`. Đường **gửi** không cho nó vào (`kiemBangChungDeploy`
     * ép `https:`), nhưng mục 16 (nhập dữ liệu) chưa viết và có thể đi vòng cửa
     * đó — nên chỗ **vẽ** phải tự chặn. Một `href="javascript:…"` là XSS mà
     * chính chủ bấm.
     */
    const xau = { ...trong_24h, bang_chung: [{ ...bc_deploy, url: 'javascript:alert(1)' }] };
    may({ ...TONG_QUAN_RONG, vua_xong_24h: [xau], vua_xong_7n: [xau] });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });

    expect(within(khoi).queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull();
    expect(khoi.querySelectorAll('a[href^="javascript:"]').length).toBe(0);
    // Vẫn hiện nguyên văn — không che một bằng chứng đã nằm trong dữ liệu.
    expect(khoi.querySelector('[data-url="khong-an-toan"]')?.textContent).toBe(
      'javascript:alert(1)',
    );
  });

  it('URL `https:` VẪN là link — ca đối chứng, để lớp chặn không chặn oan', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });
    const lien = within(khoi).getByRole('link', { name: 'https://baton.example.com/' });
    expect(lien.getAttribute('href')).toBe('https://baton.example.com/');
    expect(lien.getAttribute('data-url')).toBe('https');
  });

  it('URL không đọc được ⇒ cũng không thành link (fail-closed)', async () => {
    const xau = { ...trong_24h, bang_chung: [{ ...bc_deploy, url: 'khong-phai-mot-url' }] };
    may({ ...TONG_QUAN_RONG, vua_xong_24h: [xau], vua_xong_7n: [xau] });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });
    expect(within(khoi).queryAllByRole('link').length).toBe(1); // chỉ mã ticket
    expect(khoi.querySelector('[data-url="khong-an-toan"]')?.textContent).toBe(
      'khong-phai-mot-url',
    );
  });

  it('bằng chứng `bao_cao` (0027) không vỡ khối: hiện nhãn "Báo cáo"', async () => {
    const co_bao_cao = { ...trong_24h, bang_chung: [bc_bao_cao] };
    may({ ...TONG_QUAN_RONG, vua_xong_24h: [co_bao_cao], vua_xong_7n: [co_bao_cao] });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.vua_xong });
    expect(khoi.querySelector('[data-bang-chung="bao_cao"]')?.textContent).toBe('Báo cáo');
  });

  it('chưa có việc nào xong ⇒ nói thẳng, và câu nói ĐÚNG cửa sổ đang chọn', async () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    expect(await screen.findByText(CAU_CHUA_XONG_VIEC_NAO)).toBeTruthy();

    const khoi = screen.getByRole('region', { name: TEN_KHOI.vua_xong });
    await userEvent.click(khoi.querySelector('[data-cua-so="7n"]') as HTMLElement);
    expect(screen.getByText(CAU_CHUA_XONG_VIEC_NAO_7N)).toBeTruthy();
  });
});

/* ================================================================== *
 * G. Khối 5 — Cần chú ý (d.321), GOM THEO TICKET
 * ================================================================== */

describe('d.321 — mỗi ticket MỘT dòng, các lý do thành NHÃN trên dòng đó', () => {
  const ticket = { ...ticketTroTa('SAI-1', 'Việc đang đứng'), trang_thai: 'in_progress' };

  const than: TongQuan = {
    ...TONG_QUAN_RONG,
    can_chu_y: [
      nhomCanChuY(
        [
          dongCanChuY({
            loai: 'phien_dung_hoac_loi',
            nhan_loai: 'Phiên đứng hoặc lỗi',
            luc: GIO - 31 * PHUT,
            ticket,
            phien: { id: 'ph-1', agent_id: 'ag-1', trang_thai: 'stalled', nhan_trang_thai: 'Đứng' },
          }),
          dongCanChuY({
            loai: 'bang_chung_truot',
            nhan_loai: 'Bằng chứng trượt',
            luc: GIO - 10 * GIO_MS,
            ticket,
            bang_chung: { id: 'bc-1', loai: 'commit', ly_do: 'Không thấy commit' },
          }),
        ],
        ticket,
      ),
      nhomCanChuY([
        dongCanChuY({
          loai: 'thong_bao_gui_truot',
          nhan_loai: 'Không gửi được thông báo Telegram',
          luc: GIO - 5 * PHUT,
          thong_bao: {
            id: 'tb-1',
            loai: 'can_chu_do',
            ly_do: 'Telegram từ chối: chat chưa bấm Start với bot.',
          },
        }),
      ]),
    ],
  };

  it('hai lý do CÙNG một ticket ⇒ MỘT dòng, HAI nhãn', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.can_chu_y });
    const dong = [...khoi.querySelectorAll('[data-can-chu-y]')];
    // Hai dòng: một nhóm ticket và một tin không gửi được.
    expect(dong.length).toBe(2);

    const nhom = dong[0];
    expect(nhom?.querySelector('[data-o="ma"], a[href="/t/SAI-1"]')).not.toBeNull();
    expect(
      [...(nhom?.querySelectorAll('[data-ly-do]') ?? [])].map((e) => [
        e.getAttribute('data-ly-do'),
        e.textContent,
      ]),
    ).toEqual([
      ['phien_dung_hoac_loi', 'Phiên đứng hoặc lỗi'],
      ['bang_chung_truot', 'Bằng chứng trượt'],
    ]);
    // Mã ticket xuất hiện **đúng một lần** trong cả khối — không hai dòng.
    expect(within(khoi).getAllByRole('link', { name: 'SAI-1' }).length).toBe(1);
  });

  it('mốc của dòng là `luc` của NHÓM (máy chủ tính), không của lý do đầu', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.can_chu_y });
    // Nhóm có `luc = GIO − 10 giờ` (lý do cũ nhất), không `31 phút`.
    expect(khoi.querySelector('[data-can-chu-y] [data-moc]')?.textContent).toBe('10 giờ trước');
  });

  it('thứ cụ thể nhất của mỗi lý do vẫn hiện: link phiên và lý do bằng chứng', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.can_chu_y });
    expect(within(khoi).getByRole('link', { name: 'Đứng' }).getAttribute('href')).toBe('/phien/ph-1');
    expect(khoi.textContent).toContain('Không thấy commit');
  });

  it('dòng KHÔNG gắn ticket (tin không gửi được) đứng RIÊNG, kèm lý do đã lọc', async () => {
    may(than);
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.can_chu_y });
    const le = [...khoi.querySelectorAll('[data-can-chu-y]')][1];
    expect(le?.querySelector('[data-ly-do="thong_bao_gui_truot"]')?.textContent).toBe(
      'Không gửi được thông báo Telegram',
    );
    expect(le?.textContent).toContain('Telegram từ chối: chat chưa bấm Start với bot.');
    expect(le?.querySelector('a[href^="/t/"]')).toBeNull();
  });

  it('BAT-17: tin BẢO MẬT gửi trượt (mượn `thong_bao.loai = can_chu_do`) KHÔNG hiện nhãn "Cần Chủ 🔴" — nhãn là của nguồn "gửi trượt"', async () => {
    /*
     * Tin bảo mật tài khoản (0026) mượn `loai = 'can_chu_do'`. Trang không được
     * dịch `thong_bao.loai` thành nhãn: nhãn duy nhất của dòng là `nhan_loai` mà
     * máy chủ dựng cho nguồn `thong_bao_gui_truot`. Ca này ghim điều đó.
     */
    may({
      ...TONG_QUAN_RONG,
      can_chu_y: [
        nhomCanChuY([
          dongCanChuY({
            loai: 'thong_bao_gui_truot',
            nhan_loai: 'Không gửi được thông báo Telegram',
            luc: GIO - 5 * PHUT,
            thong_bao: { id: 'tb-bm', loai: 'can_chu_do', ly_do: 'Telegram trả mã 502.' },
          }),
        ]),
      ],
    });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.can_chu_y });
    const nhan = [...khoi.querySelectorAll('[data-ly-do]')].map((e) => e.textContent);
    expect(nhan).toEqual(['Không gửi được thông báo Telegram']);
    expect(khoi.textContent).not.toMatch(/Cần Chủ/);
    expect(khoi.textContent).not.toContain('can_chu_do');
  });

  it('trang KHÔNG tự gom: nó vẽ đúng số dòng máy chủ trả', async () => {
    /*
     * Thân nói hai **nhóm** cùng một ticket (một trạng thái máy chủ thật không
     * trả). Nếu trang tự gom lại theo id ticket thì nó vẽ một dòng và ca đỏ —
     * tức ca này ghim rằng phép gom của d.321 sống ở **máy chủ**
     * (`gomTheoTicket`), chỗ có test riêng cho nó.
     */
    may({
      ...TONG_QUAN_RONG,
      can_chu_y: [
        { ...nhomCanChuY([dongCanChuY({ loai: 'phien_dung_hoac_loi', ticket })], ticket), khoa: 'a' },
        { ...nhomCanChuY([dongCanChuY({ loai: 'ticket_khong_ai_cam', ticket })], ticket), khoa: 'b' },
      ],
    });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.can_chu_y });
    expect(
      [...khoi.querySelectorAll('[data-can-chu-y]')].map((e) => e.getAttribute('data-can-chu-y')),
    ).toEqual(['a', 'b']);
  });

  it('không có gì cần chú ý ⇒ nói thẳng', async () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    expect(await screen.findByText(CAU_KHONG_CO_GI_CAN_CHU_Y)).toBeTruthy();
  });
});

/* ================================================================== *
 * H. d.411 — 375px: ô Cần Chủ thành một dòng trên cùng
 * ================================================================== */

describe('d.411 + 20.6 — ở 375px Tổng quan vẫn dùng tốt', () => {
  it('ô Cần Chủ ở THANH ĐẦU của khối Dự án (20.2), trước bản đồ trong DOM ⇒ ở 375px là dòng trên', async () => {
    /*
     * jsdom không nạp CSS nên không ca nào đo được bề rộng thật. Thứ **đo được**
     * và cũng là thứ quyết định hành vi ở 375px: **thứ tự DOM**. SPEC 20.2 (04/11)
     * đưa ô gọn vào thanh đầu của khối "1. Dự án", cạnh đồng hồ WIP.
     */
    may({ ...TONG_QUAN_RONG, du_an: [hangDuAn({ ma: 'SAI' })] });
    dung(<TrangTongQuan />);
    const o = await screen.findByRole('complementary', { name: TEN_O_CAN_CHU });
    const khoi_dau = document.querySelector('[data-khoi]');
    expect(khoi_dau?.getAttribute('data-khoi')).toBe('du-an');
    expect(khoi_dau?.contains(o)).toBe(true);
    const ban_do = khoi_dau?.querySelector('[data-o="ban-do-va-the"]');
    expect(o.compareDocumentPosition(ban_do as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('thanh đầu đổi theo KHỔ bằng class: cột dọc mặc định, hàng từ `md` (768px)', async () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    const o = await screen.findByRole('complementary', { name: TEN_O_CAN_CHU });
    const boc = o.parentElement;
    expect(boc?.getAttribute('data-o')).toBe('thanh-dau');
    expect(boc?.className).toContain('flex-col');
    expect(boc?.className).toContain('md:flex-row');
    expect(boc?.className).toContain('min-w-0');
  });

  it('khung trang có `min-w-0` và đệm nhỏ ở khổ hẹp (không cuộn ngang)', async () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    const o = await screen.findByRole('complementary', { name: TEN_O_CAN_CHU });
    const goc = o.closest('[data-o="cot-chinh"]')?.parentElement;
    expect(goc?.className).toContain('min-w-0');
    expect(goc?.className).toContain('p-4');
    expect(goc?.className).toContain('sm:p-6');
  });

  it('20.2: bản đồ + thẻ xếp DỌC dưới 768px (`flex-col md:flex-row`), SVG co theo bề ngang', async () => {
    may({ ...TONG_QUAN_RONG, du_an: [hangDuAn({ ma: 'SAI', dang_day: true })] });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    const boc = khoi.querySelector('[data-o="ban-do-va-the"]');
    expect(boc?.className).toContain('flex-col');
    expect(boc?.className).toContain('md:flex-row');
    const svg = khoi.querySelector('svg[data-ban-do="cay"]');
    expect(svg?.getAttribute('viewBox')).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
    expect(svg?.getAttribute('width')).toBeNull();
    expect(svg?.getAttribute('class')).toContain('w-full');
  });

  it('thẻ Việc đang chạy chiếm TRỌN bề ngang ở khổ hẹp, cố định từ `sm`', async () => {
    may({
      ...TONG_QUAN_RONG,
      viec_dang_chay: [theViecDangChay({ the: ticketDong({ ma: 'SAI-1' }) })],
    });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.viec_dang_chay });
    const the = khoi.querySelector('[data-the-ticket="SAI-1"]');
    expect(the?.className).toContain('w-full');
    expect(the?.className).toContain('sm:w-72');
  });
});

/* ================================================================== *
 * I. Trạng thái tải (d.408) và lỗi (mục 13 d.379)
 * ================================================================== */

describe('d.408 — màn hình chờ chỉ ở LẦN TẢI ĐẦU', () => {
  it('lần tải đầu: một dòng trạng thái, và tiêu đề trang vẫn có', () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    expect(screen.getByRole('status').textContent).toBe(CAU_DANG_TAI_TONG_QUAN);
    // Trang **không** trắng tên trong lúc chờ.
    expect(screen.getByRole('heading', { name: 'Tổng quan' })).toBeTruthy();
  });

  it('TẢI LẠI khi đã có dữ liệu: năm khối VẪN trên màn hình, và màn hình IM LẶNG', async () => {
    /*
     * Đây là ca canh đúng chữ d.408 ("**sau lần tải đầu**, không có màn hình chờ
     * toàn trang"). Đo bằng đột biến: đổi điều kiện chờ thành `isFetching` thì
     * mọi ca khác vẫn xanh — chỉ ca này đỏ, vì nó là ca duy nhất dựng được trạng
     * thái "đang tải **lần hai**".
     */
    may(TONG_QUAN_RONG);
    const { qc } = dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });

    /*
     * Lượt tải lại **treo**: `fetch` trả một promise chưa giải, nên trạng thái
     * "đang tải lần hai" đứng lại để đo được. Máy chủ giả thường giải ngay, và
     * với nó thì lượt refetch xong trước khi React vẽ lần nào — tức ca này sẽ
     * không đo được gì.
     */
    let tra: (() => void) | null = null;
    globalThis.fetch = () =>
      new Promise<Response>((res) => {
        tra = (): void => {
          res(
            new Response(JSON.stringify(TONG_QUAN_RONG), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        };
      });

    await act(async () => {
      void qc.refetchQueries({ queryKey: ['tong-quan'] });
      /*
       * Nhường một nhịp **macrotask**: `notifyManager` của TanStack Query gom
       * thông báo rồi phát bằng `setTimeout(…, 0)`, nên một `act` đồng bộ (hay
       * một nhịp microtask) chưa vẽ lại kịp — ca sẽ đo một DOM cũ.
       */
      await new Promise((r) => setTimeout(r, 0));
    });

    /*
     * Giữa lượt tải lại: khối cũ còn nguyên, KHÔNG màn hình chờ toàn trang, và
     * **không một chữ nào** nói "đang làm mới".
     */
    expect(khoiDangHien().length).toBe(5);
    expect(screen.queryByText(CAU_DANG_TAI_TONG_QUAN)).toBeNull();
    expect(screen.queryByText(CAU_DANG_LAM_MOI)).toBeNull();
    // Ô dành sẵn thì **có mặt** (chiều cao cố định), chỉ không có chữ.
    expect(document.querySelector('[data-dau-lam-moi="khong"]')).toBeTruthy();

    // Thân mới về ⇒ năm khối vẫn đủ, và vẫn không có chữ nào.
    await act(async () => {
      tra?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    await vi.waitFor(() => {
      expect(screen.queryByText(CAU_DANG_LAM_MOI)).toBeNull();
    });
    expect(khoiDangHien().length).toBe(5);
  });

  it('đã có dữ liệu rồi thì KHÔNG còn màn hình chờ toàn trang', async () => {
    may(TONG_QUAN_RONG);
    dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });
    // Năm khối vẫn đủ, và không còn dòng "Đang tải Tổng quan…".
    expect(khoiDangHien().length).toBe(5);
    expect(screen.queryByText(CAU_DANG_TAI_TONG_QUAN)).toBeNull();
  });
});

describe('mục 13 d.379 — lỗi in NGUYÊN VĂN câu của máy chủ', () => {
  it('403 của agent: hiện đúng `message`, không một câu tự dịch', async () => {
    new MayChuGia()
      .dat('GET /v1/tong-quan', {
        http: 403,
        loi: {
          error: 'FORBIDDEN',
          message: 'Tổng quan là màn hình của chủ; agent dùng token và /v1/tasks.',
        },
      })
      .gan();
    dung(<TrangTongQuan />);
    const loi = await screen.findByRole('alert');
    expect(loi.textContent).toBe('Tổng quan là màn hình của chủ; agent dùng token và /v1/tasks.');
    // Không được tự thêm mã lỗi hay một câu khác vào.
    expect(loi.textContent).not.toContain('FORBIDDEN');
  });

  it('lỗi thì KHÔNG dựng khối rỗng nào (tránh "màn hình trống trông như sạch")', async () => {
    new MayChuGia()
      .dat('GET /v1/tong-quan', { http: 500, loi: { error: 'INTERNAL', message: 'Lỗi máy chủ.' } })
      .gan();
    dung(<TrangTongQuan />);
    await screen.findByRole('alert');
    expect(khoiDangHien()).toEqual([]);
    // Cả ô Cần Chủ cũng không: một ô "0 · 0 · 0" trông như "không có gì cần chủ".
    expect(document.querySelector('[data-o-can-chu]')).toBeNull();
  });
});

/* ================================================================== *
 * J. d.412 — helper thời gian, cả hai vế
 * ================================================================== */

describe('d.412 — thời gian tương đối + giờ đầy đủ theo giờ Việt Nam', () => {
  it('SPEC vẫn đòi đúng hai vế này', () => {
    expect(specDoiThoiGianTuongDoi()).toEqual({ tuong_doi: true, gio_viet_nam: true });
  });

  it('bậc thang giây → phút → giờ → ngày, làm tròn XUỐNG', () => {
    expect(thoiGianTuongDoi(GIO - 5_000, GIO)).toBe('5 giây trước');
    expect(thoiGianTuongDoi(GIO - 59_000, GIO)).toBe('59 giây trước');
    expect(thoiGianTuongDoi(GIO - 12 * PHUT, GIO)).toBe('12 phút trước');
    // 59 phút 59 giây vẫn là "59 phút", không nhảy sang "1 giờ".
    expect(thoiGianTuongDoi(GIO - (59 * PHUT + 59_000), GIO)).toBe('59 phút trước');
    expect(thoiGianTuongDoi(GIO - 3 * GIO_MS, GIO)).toBe('3 giờ trước');
    expect(thoiGianTuongDoi(GIO - 25 * GIO_MS, GIO)).toBe('1 ngày trước');
  });

  it('mốc ở TƯƠNG LAI ra "trong X", không ra số âm', () => {
    expect(thoiGianTuongDoi(GIO + 10 * PHUT, GIO)).toBe('trong 10 phút');
    expect(thoiGianTuongDoi(GIO, GIO)).toBe('0 giây trước');
  });

  it('`gioDayDu` là giờ VIỆT NAM (UTC+7), không giờ của máy chạy test', () => {
    /*
     * Mốc chọn sao cho hai múi giờ cho **hai ngày khác nhau**: 2025-10-09T17:00Z
     * là 00:00 ngày 10 ở Việt Nam. Một bản cài dùng giờ máy (hay UTC) sẽ ra
     * `09/10 … 17:00` và ca này đỏ.
     */
    const moc = Date.UTC(2025, 9, 9, 17, 0, 0);
    const chu = gioDayDu(moc);
    expect(chu).toContain('10/10/2025');
    expect(chu).toContain('00:00:00');
    expect(chu).toContain('giờ Việt Nam');
  });

  it('mốc hiển thị đọc giờ từ THÂN máy chủ, không từ `Date.now()` của trình duyệt', async () => {
    /*
     * `bay_gio` của thân là `GIO` (2025), còn `Date.now()` của máy chạy test thì
     * khác hẳn. Nếu trang dùng đồng hồ trình duyệt thì chữ sẽ là "… ngày trước",
     * không phải "12 phút trước" — nên ca này là lưới canh đúng điều đó.
     */
    may({
      ...TONG_QUAN_RONG,
      agent: [theAgent({ id: 'ag-1', tin_hieu_cuoi_luc: GIO - 12 * PHUT })],
    });
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.agent });
    expect(khoi.querySelector('[data-moc]')?.textContent).toBe('12 phút trước');
  });
});

/* ================================================================== *
 * K. d.410 — thay đổi do agent hiện trong 3 giây, KHÔNG tải lại trang
 * ================================================================== */

/**
 * d.410 **không chừa màn hình nào**, nên Tổng quan phải có vòng làm mới như Cần
 * Chủ / danh sách / chi tiết ticket. Hai vế, đúng khuôn ca của ba trang kia:
 * ngưỡng (hằng ngắn hơn mốc SPEC) và hành vi (dòng mới hiện sau một chu kỳ, cây
 * React **không** dựng lại — `dung()` gọi đúng một lần).
 */
describe('d.410 — Tổng quan tự làm mới, KHÔNG cần tải lại trang', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chu kỳ hỏi lại NGẮN HƠN mốc 3 giây của SPEC (còn chỗ cho một lần đi-về)', () => {
    expect(CHU_KY_LAM_MOI_MS).toBeLessThan(hienThayDoiTuSpec().giay * 1000);
    expect(CHU_KY_LAM_MOI_MS).toBeGreaterThan(0);
  });

  it('dòng agent vừa tạo hiện lên sau một chu kỳ, cây React KHÔNG dựng lại', async () => {
    vi.useFakeTimers();
    // Thân **đổi được**: agent tạo dữ liệu ở phía máy chủ giữa hai lượt hỏi.
    let than: TongQuan = TONG_QUAN_RONG;
    const m = new MayChuGia().dat('GET /v1/tong-quan', () => ({ than })).gan();

    dung(<TrangTongQuan />);
    await vi.waitFor(() => {
      expect(screen.getByRole('region', { name: TEN_KHOI.agent })).toBeTruthy();
    });
    expect(document.querySelector('[data-agent="ag-moi"]')).toBeNull();

    than = { ...TONG_QUAN_RONG, agent: [theAgent({ id: 'ag-moi', ten: 'Agent mới' })] };
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-agent="ag-moi"]')).not.toBeNull();
    });
    // Hiện lên vì **hỏi lại**, không vì ai dựng lại trang.
    expect(m.soLan('GET', '/v1/tong-quan')).toBeGreaterThanOrEqual(2);
  });
});
