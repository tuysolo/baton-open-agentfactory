/**
 * **Trang Bản đồ dự án và trang hồ sơ dự án** — SPEC mục 9 d.294–303, mục 14
 * d.392, d.410, d.412.
 *
 * Ba lớp chống "test xanh giả", theo nếp đã lập ở các lượt trước:
 *
 *   1. **Chuỗi SPEC chốt cứng được CẮT TỪ `SPEC.md`**: sáu cột của d.302, ba
 *      trường + tính "chỉ thêm" của d.299, hai cờ của d.300, hai phần của d.301,
 *      lịch sử phiên bản của d.303. Kèm ca ghim chính mỗi parser.
 *   2. **Ca phủ định dựng trạng thái xấu THẬT**: trang hồ sơ **không** có nút
 *      sửa/xoá nào cho một mục "Lỗi đã gặp" đã ghi (d.299); nút Gửi mờ khi chưa
 *      nói lỗi là gì; thư mục chưa soạn hiện dấu "—", không một ô trắng.
 *   3. **Máy chủ giả có trạng thái** cho ca ghi: `POST …/loi-da-gap` và
 *      `PATCH …/ho-so` thật sự đổi kho, nên lượt tải lại sau mutation nói **đúng**
 *      thứ máy chủ sẽ nói.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAU_CHUA_CO_DU_AN,
  CAU_CHUA_SOAN_LUAT_CHUNG,
  COT_BAN_DO,
  NHAN_CHECKLIST,
  NHAN_DANH_SACH_CAM_CHUNG,
  NHAN_LUU_LUAT_CHUNG,
  NHAN_SUA_LUAT_CHUNG,
  O_RONG,
  TEN_KHOI_LUAT_CHUNG,
  TEN_TRANG_BAN_DO,
  TrangBanDo,
  cauConLai,
  duongHoSo,
  thanSuaLuatChung,
} from '../src/trang/ban-do';
import {
  CAU_CAN_LOI,
  CAU_CHUA_CO_BAN,
  CAU_CHUA_CO_LOI,
  MUC_HO_SO,
  NHAN_BAT_BUOC_REVIEW,
  NHAN_GUI_LOI,
  NHAN_KHONG_CODE,
  NHAN_LUU_HO_SO,
  NHAN_SUA_HO_SO,
  NHAN_THEM_LOI,
  TEN_KHOI_LICH_SU,
  TEN_KHOI_LOI_DA_GAP,
  TrangHoSoDuAn,
  coTheGhiLoi,
  thanSuaHoSo,
} from '../src/trang/ho-so-du-an';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import { gioDayDu, thoiGianTuongDoi } from '../src/thoi-gian';
import type { HangBanDo, HoSo, LoiDaGap, ManHinhBanDo, MucHoSo as MucHoSoThan } from '../src/api';
import { MayChuGia, dung } from './giup';
import { GIO, PHUT } from './than-agent';
import {
  coHoSoTuSpec,
  coLichSuPhienBanTuSpec,
  cotBanDoTuSpec,
  hienThayDoiTuSpec,
  veLoiDaGapTuSpec,
  veLuatChungTuSpec,
} from './doc-spec';

const D_BAN_DO = '/v1/man-hinh-ban-do';
const PJ = 'pj-SAI';
const D_HO_SO = `/v1/du-an/${PJ}/ho-so`;

function hang(p: Partial<HangBanDo> & { id: string }): HangBanDo {
  return {
    ma: 'SAI',
    ten: 'Sample',
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

const MUC_RONG: MucHoSoThan = {
  la_gi: null,
  thu_muc: null,
  repo_chu_so_huu: null,
  repo_ten: null,
  repo_nhanh_mac_dinh: null,
  stack: null,
  doc_truoc: null,
  cach_deploy: null,
  danh_sach_cam: null,
};

function hoSo(p: Partial<HoSo> = {}): HoSo {
  return {
    ...MUC_RONG,
    project_id: PJ,
    bay_gio: GIO,
    phien_ban: 0,
    cap_nhat_luc: null,
    khong_code: false,
    bat_buoc_review: false,
    du_an: {
      id: PJ,
      ma: 'SAI',
      ten: 'Sample',
      quan_ly_agent_id: null,
      quan_ly_agent_ten: null,
      // Thanh công cụ đầu trang — SPEC 20.8.
      trang_thai: 'active',
      uu_tien: 3,
      dang_day: false,
      duy_tri: false,
      nhom: null,
      dat_boi: null,
    },
    loi_da_gap: [],
    lich_su_ban: [],
    ...p,
  };
}

/** Máy chủ giả **có trạng thái** cho Bản đồ: ghi Luật chung thì lượt đọc sau thấy. */
function mayBanDo(mh: Partial<ManHinhBanDo> = {}): MayChuGia {
  const kho: ManHinhBanDo = {
    bay_gio: GIO,
    du_an: [],
    luat_chung: { danh_sach_cam: null, checklist: null, cap_nhat_luc: null },
    so_con_lai: 0,
    ...mh,
  };
  return new MayChuGia()
    .dat(`GET ${D_BAN_DO}`, () => ({ than: kho }))
    .dat('PUT /v1/luat-chung', (l) => {
      const than = l.than as { danh_sach_cam?: string | null; checklist?: string | null };
      kho.luat_chung = { ...kho.luat_chung, ...than, cap_nhat_luc: GIO };
      return { than: { workspace_id: 'ws', da_doi: Object.keys(than) } };
    })
    .gan();
}

/** Máy chủ giả **có trạng thái** cho trang hồ sơ. */
function mayHoSo(ban_dau: HoSo = hoSo()): {
  may: MayChuGia;
  kho: { hs: HoSo };
} {
  const kho = { hs: ban_dau };
  const may = new MayChuGia()
    .dat(`GET ${D_HO_SO}`, () => ({ than: kho.hs }))
    .dat(`PATCH ${D_HO_SO}`, (l) => {
      const than = l.than as Partial<MucHoSoThan>;
      kho.hs = { ...kho.hs, ...than, phien_ban: kho.hs.phien_ban + 1 };
      return { than: { project_id: PJ, phien_ban: kho.hs.phien_ban, da_doi: Object.keys(than) } };
    })
    .dat(`POST /v1/du-an/${PJ}/loi-da-gap`, (l) => {
      const than = l.than as { loi: string; cach_tranh: string | null };
      const moi: LoiDaGap = {
        id: `ld-${String(kho.hs.loi_da_gap.length + 1)}`,
        ngay: '2025-10-09',
        loi: than.loi,
        cach_tranh: than.cach_tranh,
        ghi_boi_loai: 'owner',
        ghi_boi_agent_id: null,
        tao_luc: GIO,
      };
      kho.hs = { ...kho.hs, loi_da_gap: [moi, ...kho.hs.loi_da_gap] };
      return { than: { id: moi.id, ngay: moi.ngay } };
    })
    .gan();
  return { may, kho };
}

/* ================================================================== *
 * 0. Ca ghim CHÍNH các parser SPEC
 * ================================================================== */

describe('parser SPEC của mục 9', () => {
  it('d.302 cắt ra đúng sáu cột của bảng Bản đồ', () => {
    const c = cotBanDoTuSpec();
    expect(c).toHaveLength(6);
    expect(c[0]).toBe('tên');
    expect(c.join(' | ')).toContain('agent quản lý');
    expect(c.join(' | ')).toContain('cập nhật cuối');
  });

  it('d.299 nói "chỉ thêm" và kể ba trường ngày · lỗi · cách tránh', () => {
    const v = veLoiDaGapTuSpec();
    expect(v.chi_them).toBe(true);
    expect(v.truong).toEqual(['ngày', 'lỗi', 'cách tránh']);
  });

  it('d.300 cắt ra đúng hai cờ, d.301 hai phần, d.303 lịch sử phiên bản', () => {
    expect(coHoSoTuSpec()).toEqual(['dự án không code', 'bắt buộc review']);
    expect(veLuatChungTuSpec()).toEqual({ danh_sach_cam: true, checklist: true });
    expect(coLichSuPhienBanTuSpec()).toBe(true);
  });
});

/* ================================================================== *
 * 1. Bảng Bản đồ — d.302
 * ================================================================== */

describe('Trang Bản đồ (d.302)', () => {
  it('bảng rỗng nói thẳng', async () => {
    mayBanDo();
    dung(<TrangBanDo />, '/ban-do-du-an');
    expect(await screen.findByText(CAU_CHUA_CO_DU_AN)).toBeTruthy();
    expect(screen.getByRole('heading', { name: TEN_TRANG_BAN_DO })).toBeTruthy();
  });

  /**
   * **Sáu cột của d.302 đều có mặt**, so với danh sách **cắt từ SPEC**, không
   * với một bản chép thứ hai của `COT_BAN_DO`.
   *
   * Khớp theo **từ khoá** chứ không từng chữ: SPEC viết câu văn ("số ticket Đang
   * làm", "chỉ báo sức sống") còn tiêu đề bảng là nhãn ngắn ("Đang làm", "Sức
   * sống"). Bỏ một cột khỏi `COT_BAN_DO` ⇒ đỏ; thêm một cột vào d.302 ⇒ đỏ.
   */
  it('bảng có đủ sáu cột mà d.302 kể', async () => {
    mayBanDo({ du_an: [hang({ id: PJ })] });
    dung(<TrangBanDo />, '/ban-do-du-an');
    await waitFor(() => {
      expect(document.querySelector('[data-bang="ban-do"]')).not.toBeNull();
    });

    const tieu_de = [...document.querySelectorAll('thead th')].map((o) => o.textContent ?? '');
    const spec = cotBanDoTuSpec();
    expect(COT_BAN_DO).toHaveLength(spec.length);
    for (const c of ['tên', 'agent quản lý', 'thư mục', 'đang làm', 'sức sống', 'cập nhật cuối']) {
      expect(
        tieu_de.some((t) => t.toLowerCase().includes(c)),
        `cột "${c}" của d.302`,
      ).toBe(true);
    }
    // Và từ khoá dùng để khớp phải **thật sự** còn trong d.302.
    for (const c of spec) {
      expect(c.toLowerCase()).not.toBe('');
    }
  });

  it('một hàng hiện đủ sáu ô, và mốc tính từ bay_gio CỦA MÁY CHỦ (d.412)', async () => {
    mayBanDo({
      du_an: [
        hang({
          id: PJ,
          quan_ly_agent_ten: 'M-Baton',
          thu_muc: '~/Documents/Baton',
          so_dang_lam: 3,
          suc_song: 'vang',
          cap_nhat_luc: GIO - 30 * PHUT,
          co_ho_so: true,
        }),
      ],
    });
    dung(<TrangBanDo />, '/ban-do-du-an');

    const tr = await waitFor(() => {
      const o = document.querySelector(`[data-du-an="${PJ}"]`);
      if (o === null) throw new Error('chưa có hàng');
      return o;
    });
    expect(tr.querySelector('[data-o="ten"]')?.textContent).toBe('Sample');
    expect(tr.querySelector('[data-o="quan-ly"]')?.textContent).toBe('M-Baton');
    expect(tr.querySelector('[data-o="thu-muc"]')?.textContent).toBe('~/Documents/Baton');
    expect(tr.querySelector('[data-o="dang-lam"]')?.textContent).toBe('3');
    expect(tr.querySelector('[data-suc-song]')?.getAttribute('data-suc-song')).toBe('vang');

    const moc = tr.querySelector('time');
    expect(moc?.textContent).toBe(thoiGianTuongDoi(GIO - 30 * PHUT, GIO));
    expect(moc?.getAttribute('title')).toBe(gioDayDu(GIO - 30 * PHUT));
    // d.294 — mỗi dự án có một đường tới trang hồ sơ.
    expect(tr.querySelector('[data-o="ho-so"]')?.getAttribute('href')).toBe(duongHoSo(PJ));
  });

  /**
   * Ca phủ định có tải: một bản cài `thu_muc ?? ''` in ô trắng, và chủ không
   * phân biệt được "chưa soạn thư mục" với "mất dữ liệu".
   */
  it('thư mục và agent quản lý chưa có thì hiện dấu —, không ô trắng', async () => {
    mayBanDo({ du_an: [hang({ id: PJ, thu_muc: null, quan_ly_agent_ten: null })] });
    dung(<TrangBanDo />, '/ban-do-du-an');

    const tr = await waitFor(() => {
      const o = document.querySelector(`[data-du-an="${PJ}"]`);
      if (o === null) throw new Error('chưa có hàng');
      return o;
    });
    expect(tr.querySelector('[data-o="thu-muc"]')?.textContent).toBe(O_RONG);
    expect(tr.querySelector('[data-o="quan-ly"]')?.textContent).toBe(O_RONG);
  });

  /** "bảng **mọi** dự án" — một dự án lưu trữ vẫn có hàng trên bản đồ. */
  it('dự án lưu trữ vẫn nằm trong bảng (d.302 "mọi dự án")', async () => {
    mayBanDo({
      du_an: [
        hang({ id: 'pj-OLD', ma: 'OLD', ten: 'Cũ', trang_thai: 'archived', nhan_trang_thai: 'Lưu trữ' }),
      ],
    });
    dung(<TrangBanDo />, '/ban-do-du-an');
    const tr = await waitFor(() => {
      const o = document.querySelector('[data-du-an="pj-OLD"]');
      if (o === null) throw new Error('chưa có hàng');
      return o;
    });
    expect(tr.querySelector('[data-o="trang-thai"]')?.textContent).toBe('Lưu trữ');
  });
});

/* ================================================================== *
 * 2. Luật chung — d.301
 * ================================================================== */

describe('Khối Luật chung (d.301)', () => {
  it('chưa soạn thì nói thẳng, không hiện hai tiêu đề rỗng', async () => {
    mayBanDo();
    dung(<TrangBanDo />, '/ban-do-du-an');
    expect(await screen.findByText(CAU_CHUA_SOAN_LUAT_CHUNG)).toBeTruthy();
    expect(screen.queryByText(NHAN_DANH_SACH_CAM_CHUNG)).toBeNull();
    expect(screen.queryByText(NHAN_CHECKLIST)).toBeNull();
  });

  it('hiện CẢ danh sách cấm chung VÀ checklist — đúng hai phần của d.301', async () => {
    expect(veLuatChungTuSpec()).toEqual({ danh_sach_cam: true, checklist: true });
    mayBanDo({
      luat_chung: {
        danh_sach_cam: 'Không tiền, không dữ liệu thật.',
        checklist: 'Đã có tiêu chí Xong?',
        cap_nhat_luc: GIO - PHUT,
      },
    });
    dung(<TrangBanDo />, '/ban-do-du-an');

    const khoi = await waitFor(() => {
      const o = document.querySelector('[data-khoi="luat-chung"]');
      if (o === null) throw new Error('chưa có khối');
      return o as HTMLElement;
    });
    expect(within(khoi).getByText('Không tiền, không dữ liệu thật.')).toBeTruthy();
    expect(within(khoi).getByText('Đã có tiêu chí Xong?')).toBeTruthy();
    expect(screen.getByRole('region', { name: TEN_KHOI_LUAT_CHUNG })).toBeTruthy();
  });
});

/* ================================================================== *
 * 2b. Chủ SỬA Luật chung — d.301
 * ================================================================== */

/**
 * **d.301 là hai phần, và chủ phải soạn được chúng ở đâu đó.**
 *
 * Bản đầu của lượt này chỉ *đọc* Luật chung, nên cách duy nhất để chủ soạn danh
 * sách cấm chung là gọi `PUT /v1/luat-chung` bằng tay — tức SPEC có mà chủ không
 * dùng được.
 */
describe('Chủ sửa Luật chung (d.301)', () => {
  async function moSua(): Promise<void> {
    await userEvent.click(await screen.findByRole('button', { name: NHAN_SUA_LUAT_CHUNG }));
  }

  it('ô nhập NẠP SẴN nội dung hiện tại, không rỗng', async () => {
    mayBanDo({
      luat_chung: { danh_sach_cam: 'Không tiền', checklist: '1. Đọc SPEC', cap_nhat_luc: GIO },
    });
    dung(<TrangBanDo />, '/ban-do-du-an');
    await moSua();

    /*
     * Ca phủ định có tải: ô rỗng biến mỗi lần mở-rồi-lưu thành một lần **xoá
     * sạch** danh sách cấm đang ràng mọi agent.
     */
    expect((document.querySelector('[data-nhap="danh-sach-cam"]') as HTMLTextAreaElement).value).toBe(
      'Không tiền',
    );
    expect((document.querySelector('[data-nhap="checklist"]') as HTMLTextAreaElement).value).toBe(
      '1. Đọc SPEC',
    );
  });

  it('sửa một phần chỉ gửi phần đó, và nội dung mới hiện lên', async () => {
    const may = mayBanDo({
      luat_chung: { danh_sach_cam: 'Không tiền', checklist: '1. Đọc SPEC', cap_nhat_luc: GIO },
    });
    dung(<TrangBanDo />, '/ban-do-du-an');
    await moSua();

    const o = document.querySelector('[data-nhap="checklist"]') as HTMLElement;
    await userEvent.clear(o);
    await userEvent.type(o, '1. Đọc SPEC 2. Đọc hồ sơ');
    await userEvent.click(screen.getByRole('button', { name: NHAN_LUU_LUAT_CHUNG }));

    await waitFor(() => {
      expect(screen.getByText('1. Đọc SPEC 2. Đọc hồ sơ')).toBeTruthy();
    });
    const goi = may.da_goi.find((l) => l.method === 'PUT');
    expect(goi?.duong).toBe('/v1/luat-chung');
    // **Chỉ** phần đã đổi — `danh_sach_cam` không đi kèm.
    expect(goi?.than).toEqual({ checklist: '1. Đọc SPEC 2. Đọc hồ sơ' });
  });

  it('soạn lần đầu từ trang trống: gửi cả hai phần', async () => {
    const may = mayBanDo();
    dung(<TrangBanDo />, '/ban-do-du-an');
    await moSua();

    await userEvent.type(
      document.querySelector('[data-nhap="danh-sach-cam"]') as HTMLElement,
      'Không tiền',
    );
    await userEvent.type(
      document.querySelector('[data-nhap="checklist"]') as HTMLElement,
      'Đã có tiêu chí Xong?',
    );
    await userEvent.click(screen.getByRole('button', { name: NHAN_LUU_LUAT_CHUNG }));

    await waitFor(() => {
      expect(may.da_goi.some((l) => l.method === 'PUT')).toBe(true);
    });
    expect(may.da_goi.find((l) => l.method === 'PUT')?.than).toEqual({
      danh_sach_cam: 'Không tiền',
      checklist: 'Đã có tiêu chí Xong?',
    });
  });

  it('máy chủ từ chối thì toast ghi NGUYÊN VĂN lý do', async () => {
    const may = mayBanDo();
    may.dat('PUT /v1/luat-chung', {
      http: 403,
      loi: { error: 'FORBIDDEN', message: 'Chỉ chủ sửa được trang Luật chung.' },
    });
    dung(<TrangBanDo />, '/ban-do-du-an');
    await moSua();

    await userEvent.type(
      document.querySelector('[data-nhap="danh-sach-cam"]') as HTMLElement,
      'x',
    );
    await userEvent.click(screen.getByRole('button', { name: NHAN_LUU_LUAT_CHUNG }));
    expect(await screen.findByText('Chỉ chủ sửa được trang Luật chung.')).toBeTruthy();
  });

  it('thanSuaLuatChung: chỉ phần đổi, và rỗng hoá null', () => {
    const cu = { danh_sach_cam: 'A', checklist: 'B', cap_nhat_luc: GIO };
    expect(thanSuaLuatChung(cu, { danh_sach_cam: 'A', checklist: 'B' })).toEqual({});
    expect(thanSuaLuatChung(cu, { danh_sach_cam: 'A2', checklist: 'B' })).toEqual({
      danh_sach_cam: 'A2',
    });
    expect(thanSuaLuatChung(cu, { danh_sach_cam: '  ', checklist: 'B' })).toEqual({
      danh_sach_cam: null,
    });
  });
});

/* ================================================================== *
 * 2c. Trần của một lượt gọi phải NÓI RA — d.302 "bảng MỌI dự án"
 * ================================================================== */

describe('so_con_lai (d.302)', () => {
  it('cauConLai nói đúng số còn lại', () => {
    expect(cauConLai(3)).toContain('3');
  });

  it('hết dự án thì KHÔNG hiện dòng nào', async () => {
    mayBanDo({ du_an: [hang({ id: PJ })], so_con_lai: 0 });
    dung(<TrangBanDo />, '/ban-do-du-an');
    await waitFor(() => {
      expect(document.querySelector(`[data-du-an="${PJ}"]`)).not.toBeNull();
    });
    expect(document.querySelector('[data-o="con-lai"]')).toBeNull();
  });

  it('còn dự án bị cắt thì NÓI RA, không im lặng', async () => {
    mayBanDo({ du_an: [hang({ id: PJ })], so_con_lai: 7 });
    dung(<TrangBanDo />, '/ban-do-du-an');
    expect(await screen.findByText(cauConLai(7))).toBeTruthy();
  });
});

/* ================================================================== *
 * 3. d.410 — thay đổi do agent hiện lên, không tải lại trang
 * ================================================================== */

describe('d.410 trên Bản đồ', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chu kỳ hỏi lại ngắn hơn mốc 3 giây, và số Đang làm mới hiện sau một chu kỳ', async () => {
    expect(CHU_KY_LAM_MOI_MS).toBeLessThan(hienThayDoiTuSpec().giay * 1000);

    vi.useFakeTimers();
    const kho = { so: 0 };
    new MayChuGia()
      .dat(`GET ${D_BAN_DO}`, () => ({
        than: {
          bay_gio: GIO,
          du_an: [hang({ id: PJ, so_dang_lam: kho.so })],
          luat_chung: { danh_sach_cam: null, checklist: null, cap_nhat_luc: null },
        },
      }))
      .gan();
    dung(<TrangBanDo />, '/ban-do-du-an');

    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="dang-lam"]')?.textContent).toBe('0');
    });
    kho.so = 2;
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="dang-lam"]')?.textContent).toBe('2');
    });
  });
});

/* ================================================================== *
 * 4. Trang hồ sơ — d.296–298, d.300, d.303
 * ================================================================== */

describe('Trang hồ sơ dự án (d.296–298, d.300, d.303)', () => {
  it('chưa có hồ sơ thì mở ra được một trang trống để bắt đầu điền', async () => {
    mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    expect(await screen.findByRole('heading', { name: 'Sample' })).toBeTruthy();
    expect(screen.getByRole('button', { name: NHAN_SUA_HO_SO })).toBeTruthy();
  });

  it('hiện đủ CHÍN mục của d.296–298', async () => {
    mayHoSo(
      hoSo({
        phien_ban: 1,
        cap_nhat_luc: GIO - PHUT,
        la_gi: 'Hệ ticket cho agent',
        thu_muc: '~/Documents/Baton',
        repo_chu_so_huu: 'ten-github',
        repo_ten: 'baton',
        repo_nhanh_mac_dinh: 'main',
        stack: 'Hono + D1 + React',
        doc_truoc: 'SPEC.md',
        cach_deploy: 'Chủ chạy tay',
        danh_sach_cam: 'Không tiền',
      }),
    );
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));

    await waitFor(() => {
      expect(document.querySelector('[data-muc="la_gi"]')).not.toBeNull();
    });
    // Chín mục, đủ cả chín — một mục quên vẽ là một mục agent không đọc được.
    expect(MUC_HO_SO).toHaveLength(9);
    for (const { khoa } of MUC_HO_SO) {
      expect(document.querySelector(`[data-muc="${khoa}"]`), `mục ${khoa}`).not.toBeNull();
    }
    expect(document.querySelector('[data-muc="stack"]')?.textContent).toContain(
      'Hono + D1 + React',
    );
  });

  /** d.300 — hai cờ, đúng chữ của SPEC (so **không phân biệt hoa thường**). */
  it('hai cờ của d.300 hiện khi bật, và KHÔNG hiện khi tắt', async () => {
    const [c1, c2] = coHoSoTuSpec();
    expect(NHAN_KHONG_CODE.toLowerCase()).toBe(c1);
    expect(NHAN_BAT_BUOC_REVIEW.toLowerCase()).toBe(c2);

    mayHoSo(hoSo({ khong_code: true, bat_buoc_review: false }));
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));

    await waitFor(() => {
      expect(document.querySelector('[data-co="khong-code"]')?.textContent).toBe(NHAN_KHONG_CODE);
    });
    expect(document.querySelector('[data-co="bat-buoc-review"]')).toBeNull();
  });

  it('lịch sử phiên bản của d.303 hiện từng bản cũ, mới nhất trước', async () => {
    expect(coLichSuPhienBanTuSpec()).toBe(true);
    mayHoSo(
      hoSo({
        phien_ban: 3,
        lich_su_ban: [
          { id: 'b2', phien_ban: 2, luc: GIO - PHUT, sua_boi_loai: 'owner', sua_boi_agent_id: null, muc: {} },
          { id: 'b1', phien_ban: 1, luc: GIO - 2 * PHUT, sua_boi_loai: 'owner', sua_boi_agent_id: null, muc: {} },
        ],
      }),
    );
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));

    const ds = await waitFor(() => {
      const o = document.querySelectorAll('[data-ban]');
      if (o.length === 0) throw new Error('chưa có lịch sử');
      return [...o];
    });
    expect(ds.map((b) => b.getAttribute('data-ban'))).toEqual(['2', '1']);
    expect(screen.getByRole('region', { name: TEN_KHOI_LICH_SU })).toBeTruthy();
  });

  /**
   * **Agent quản lý hiện TÊN, không id** — cùng vế mà d.302 gọi "agent quản lý"
   * và đã hiện bằng tên trên Bản đồ. Hai trang nói hai thứ khác nhau về cùng một
   * agent là một trang nói sai.
   */
  it('agent quản lý hiện TÊN, không hiện id', async () => {
    mayHoSo(
      hoSo({
        du_an: {
          ...hoSo().du_an,
          quan_ly_agent_id: 'ag-1',
          quan_ly_agent_ten: 'M-Baton',
        },
      }),
    );
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));

    const o = await waitFor(() => {
      const x = document.querySelector('[data-o="quan-ly"]');
      if (x === null) throw new Error('chưa có ô agent quản lý');
      return x;
    });
    expect(o.textContent).toBe('M-Baton');
    expect(o.textContent).not.toContain('ag-1');
    // Vẫn là một link tới trang agent (mục 3 d.104), theo **id**.
    expect(o.getAttribute('href')).toContain('ag-1');
  });

  it('chưa có bản cũ nào thì nói thẳng', async () => {
    mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    expect(await screen.findByText(CAU_CHUA_CO_BAN)).toBeTruthy();
  });

  /** Sửa: ô nhập **nạp sẵn** giá trị cũ, và thân `PATCH` chỉ mang mục đã đổi. */
  it('sửa một mục chỉ gửi mục đó, và trang hiện giá trị mới', async () => {
    const { may } = mayHoSo(hoSo({ phien_ban: 1, la_gi: 'Cũ', stack: 'Hono' }));
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));

    await userEvent.click(await screen.findByRole('button', { name: NHAN_SUA_HO_SO }));
    const o = document.querySelector('[data-nhap="la_gi"]') as HTMLTextAreaElement;
    // Nạp sẵn giá trị cũ: nếu rỗng, mỗi lần mở-rồi-lưu là một lần xoá sạch hồ sơ.
    expect(o.value).toBe('Cũ');
    await userEvent.clear(o);
    await userEvent.type(o, 'Mới');
    await userEvent.click(screen.getByRole('button', { name: NHAN_LUU_HO_SO }));

    await waitFor(() => {
      expect(document.querySelector('[data-muc="la_gi"]')?.textContent).toContain('Mới');
    });
    const goi = may.da_goi.find((l) => l.method === 'PATCH');
    expect(goi?.than).toEqual({ la_gi: 'Mới' });
  });

  it('thân PATCH rỗng khi không đổi gì — không ép máy chủ chụp một bản y hệt (d.303)', () => {
    const cu: MucHoSoThan = { ...MUC_RONG, la_gi: 'Cũ' };
    expect(thanSuaHoSo(cu, { la_gi: 'Cũ' })).toEqual({});
    expect(thanSuaHoSo(cu, { la_gi: 'Mới' })).toEqual({ la_gi: 'Mới' });
    // Xoá sạch một mục = `null`, không chuỗi rỗng.
    expect(thanSuaHoSo(cu, { la_gi: '  ' })).toEqual({ la_gi: null });
    // Mục vốn đã rỗng mà vẫn để rỗng ⇒ không gửi.
    expect(thanSuaHoSo(cu, { stack: '' })).toEqual({});
  });

  it('máy chủ từ chối thì toast ghi NGUYÊN VĂN lý do', async () => {
    const { may } = mayHoSo(hoSo({ phien_ban: 1, la_gi: 'Cũ' }));
    may.dat(`PATCH ${D_HO_SO}`, {
      http: 403,
      loi: { error: 'FORBIDDEN', message: 'Chỉ chủ sửa được hồ sơ dự án.' },
    });
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));

    await userEvent.click(await screen.findByRole('button', { name: NHAN_SUA_HO_SO }));
    const o = document.querySelector('[data-nhap="la_gi"]') as HTMLTextAreaElement;
    await userEvent.clear(o);
    await userEvent.type(o, 'Mới');
    await userEvent.click(screen.getByRole('button', { name: NHAN_LUU_HO_SO }));

    expect(await screen.findByText('Chỉ chủ sửa được hồ sơ dự án.')).toBeTruthy();
  });
});

/* ================================================================== *
 * 5. Lỗi đã gặp — d.299, CHỈ THÊM
 * ================================================================== */

describe('Lỗi đã gặp (d.299)', () => {
  it('danh sách rỗng nói thẳng, và khối mang đúng tên của SPEC', async () => {
    mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    expect(await screen.findByText(CAU_CHUA_CO_LOI)).toBeTruthy();
    expect(screen.getByRole('region', { name: TEN_KHOI_LOI_DA_GAP })).toBeTruthy();
  });

  it('một mục hiện đủ BA trường mà d.299 kể: ngày, lỗi, cách tránh', async () => {
    expect(veLoiDaGapTuSpec().truong).toEqual(['ngày', 'lỗi', 'cách tránh']);
    mayHoSo(
      hoSo({
        loi_da_gap: [
          {
            id: 'ld-1',
            ngay: '2025-10-09',
            loi: 'D1 không nhận STRICT',
            cach_tranh: 'Bỏ từ khoá đó khỏi migration',
            ghi_boi_loai: 'agent',
            ghi_boi_agent_id: 'ag-1',
            tao_luc: GIO - PHUT,
          },
        ],
      }),
    );
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));

    const li = await waitFor(() => {
      const o = document.querySelector('[data-loi="ld-1"]');
      if (o === null) throw new Error('chưa có mục');
      return o;
    });
    expect(li.querySelector('[data-o="ngay"]')?.textContent).toBe('2025-10-09');
    expect(li.querySelector('[data-o="loi"]')?.textContent).toBe('D1 không nhận STRICT');
    expect(li.querySelector('[data-o="cach-tranh"]')?.textContent).toContain(
      'Bỏ từ khoá đó khỏi migration',
    );
    // "ai ghi" — một agent ghi được mục này (đề xuất tạm #113b).
    expect(li.querySelector('[data-o="ghi-boi"]')?.textContent).toBe('ag-1');
  });

  /**
   * **Ca phủ định của "chỉ thêm"** — d.299. Một mục đã ghi **không** có nút sửa,
   * **không** có nút xoá, và trang không gửi một lượt ghi nào tới nó.
   */
  it('KHÔNG có nút sửa và KHÔNG có nút xoá nào cho một mục đã ghi', async () => {
    expect(veLoiDaGapTuSpec().chi_them).toBe(true);
    const { may } = mayHoSo(
      hoSo({
        loi_da_gap: [
          {
            id: 'ld-1',
            ngay: '2025-10-09',
            loi: 'Một lỗi',
            cach_tranh: null,
            ghi_boi_loai: 'owner',
            ghi_boi_agent_id: null,
            tao_luc: GIO,
          },
        ],
      }),
    );
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    await waitFor(() => {
      expect(document.querySelector('[data-loi="ld-1"]')).not.toBeNull();
    });

    const muc = document.querySelector('[data-loi="ld-1"]') as HTMLElement;
    for (const ten of [/sửa/i, /xoá/i, /xóa/i]) {
      expect(within(muc).queryByRole('button', { name: ten })).toBeNull();
    }
    expect(may.da_goi.filter((l) => l.method !== 'GET')).toHaveLength(0);
  });

  it('nút Gửi MỜ khi chưa nói lỗi là gì, và KHÔNG mờ khi đã có', async () => {
    mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    await userEvent.click(await screen.findByRole('button', { name: NHAN_THEM_LOI }));

    const nut = screen.getByRole('button', { name: NHAN_GUI_LOI });
    expect(nut.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(CAU_CAN_LOI)).toBeTruthy();

    await userEvent.type(document.querySelector('[data-nhap="loi"]') as HTMLElement, 'Một lỗi');
    expect(nut.hasAttribute('disabled')).toBe(false);
  });

  it('thêm một mục: thân gửi đúng hai trường, và mục mới hiện lên', async () => {
    const { may } = mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    await userEvent.click(await screen.findByRole('button', { name: NHAN_THEM_LOI }));

    await userEvent.type(document.querySelector('[data-nhap="loi"]') as HTMLElement, 'D1 kén SQL');
    await userEvent.type(
      document.querySelector('[data-nhap="cach-tranh"]') as HTMLElement,
      'Chạy migration thử trước',
    );
    await userEvent.click(screen.getByRole('button', { name: NHAN_GUI_LOI }));

    await waitFor(() => {
      expect(screen.getByText('D1 kén SQL')).toBeTruthy();
    });
    const goi = may.da_goi.find((l) => l.method === 'POST');
    expect(goi?.duong).toBe(`/v1/du-an/${PJ}/loi-da-gap`);
    expect(goi?.than).toEqual({ loi: 'D1 kén SQL', cach_tranh: 'Chạy migration thử trước' });
  });

  it('"cách tránh" để trống đi thành null, không chuỗi rỗng', async () => {
    const { may } = mayHoSo();
    dung(<TrangHoSoDuAn id={PJ} />, duongHoSo(PJ));
    await userEvent.click(await screen.findByRole('button', { name: NHAN_THEM_LOI }));
    await userEvent.type(document.querySelector('[data-nhap="loi"]') as HTMLElement, 'Một lỗi');
    await userEvent.click(screen.getByRole('button', { name: NHAN_GUI_LOI }));

    await waitFor(() => {
      expect(may.da_goi.some((l) => l.method === 'POST')).toBe(true);
    });
    expect(may.da_goi.find((l) => l.method === 'POST')?.than).toEqual({
      loi: 'Một lỗi',
      cach_tranh: null,
    });
  });

  it('coTheGhiLoi đòi lỗi không rỗng sau khi cắt khoảng trắng', () => {
    expect(coTheGhiLoi('x')).toBe(true);
    expect(coTheGhiLoi('')).toBe(false);
    expect(coTheGhiLoi('  \n ')).toBe(false);
  });
});
