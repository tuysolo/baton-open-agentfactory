/**
 * **Trang Báo cáo** (`/bao-cao`) — SPEC mục 11 d.322–336, mục 14 d.392.
 *
 * Hai thứ file này canh, và chỉ hai:
 *   1. **Mỗi vế của d.323–328 và d.331–334 hiện ra**, với chữ của SPEC (kể cả
 *      "chưa có đề xuất" của d.324).
 *   2. **Trang không tính dẫn xuất nào và không dựng lại markdown** — vế "xuất ra
 *      markdown được" của d.336 chép đúng `noi_dung_md` của máy chủ.
 *
 * Luật thuần của báo cáo (sáu vế, "đạt hay chưa", khuôn markdown) ở
 * `packages/api/test/luat-bao-cao.test.ts`; đường thật ở `bao-cao.test.ts` của api.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAU_CHUA_CO_BAO_CAO,
  CAU_CHUA_CO_DE_XUAT,
  CAU_DA_SAO_MD,
  CAU_LOI_XEM_THEM,
  NHAN_THU_LAI,
  NHAN_XEM_THEM,
  NHAN_LOAI_BAO_CAO,
  NHAN_SAO_MD,
  TIEU_DE_KHOI_HIEN_HANH,
  TrangBaoCao,
  VE_SANG,
  boTrongTamKhac,
  VE_TOI,
  loaiCuaNgay,
  ngayCoBaoCao,
} from '../src/trang/bao-cao';
import { MayChuGia, dung } from './giup';

const NGAY = '2026-10-06';
const HOM_QUA = '2026-10-05';
const TAO_LUC = 1_760_000_000_000;

/** Markdown **của máy chủ** — trang không dựng lại, nên ca nào cũng đọc đúng chuỗi này. */
const MD_SANG = `# Báo cáo sáng — ${NGAY}\n\n## Cần Chủ (đọc trước)\n\nĐang chờ: **2** mục.\n`;

const DANH_SACH = {
  items: [
    { ngay: NGAY, loai: 'toi', nhan_loai: 'Handoff tối', tao_luc: TAO_LUC },
    { ngay: NGAY, loai: 'sang', nhan_loai: 'Báo cáo sáng', tao_luc: TAO_LUC },
    { ngay: HOM_QUA, loai: 'sang', nhan_loai: 'Báo cáo sáng', tao_luc: TAO_LUC },
  ],
  cursor_sau: null,
};

const BAO_CAO_SANG = {
  ngay: NGAY,
  loai: 'sang',
  nhan_loai: 'Báo cáo sáng',
  tao_luc: TAO_LUC,
  noi_dung_md: MD_SANG,
  du_lieu: {
    ngay: NGAY,
    tao_luc: TAO_LUC,
    can_chu: {
      so_cho: 2,
      so_theo_muc: { urgent: 1, today: 1, later: 0 },
      gap_nhat: [{ ma: 'T-7', tieu_de: 'Chốt tên miền', nhan_muc: 'Gấp' }],
    },
    trong_tam: [],
    hom_qua: {
      ngay: HOM_QUA,
      viec: [{ ma: 'SAI-9', tieu_de: 'Dựng cổng bằng chứng', nhan_trang_thai: 'Xong' }],
    },
    dang_chay: [
      { ma: 'SAI-11', tieu_de: 'Trang báo cáo', nhan_trang_thai: 'Đang làm', agent_id: null },
    ],
    rui_ro_va_lech: [{ nhan_loai: 'Bằng chứng trượt', chi_tiet: 'SAI-11 — commit chưa merge' }],
    quyet_dinh_moi: [{ nguoi: 'Chủ', quyet_dinh: 'Dùng D1', vi_sao: 'Đã có sẵn' }],
  },
};

const BAO_CAO_TOI = {
  ngay: NGAY,
  loai: 'toi',
  nhan_loai: 'Handoff tối',
  tao_luc: TAO_LUC,
  noi_dung_md: `# Handoff tối — ${NGAY}\n`,
  du_lieu: {
    ngay: NGAY,
    tao_luc: TAO_LUC,
    trong_tam: [
      {
        thu_tu: 1,
        ma: 'SAI-1',
        tieu_de: 'Việc một',
        nhan_trang_thai: 'Xong',
        dat: true,
        ghi_chu: 'vì chặn cả phần 7',
      },
      {
        thu_tu: 2,
        ma: 'SAI-2',
        tieu_de: 'Việc hai',
        nhan_trang_thai: 'Chờ kiểm chứng',
        dat: false,
        ghi_chu: null,
      },
    ],
    du_an: [
      {
        ma: 'SAI',
        ten: 'Sample',
        nhan_suc_song: 'Dự án không chạy',
        so_dang_lam: 0,
        so_cho_kiem_chung: 1,
        so_xong_24h: 2,
      },
    ],
    chuyen_sang_mai: [{ ma: 'SAI-12', tieu_de: 'Nhập dữ liệu cũ', nhan_trang_thai: 'Đang làm' }],
    can_chu_moi: [{ ma: 'T-8', tieu_de: 'Chọn gói Cloudflare', nhan_muc: 'Hôm nay' }],
  },
};

function may(tuy_chon: { danh_sach?: unknown; trong_tam?: unknown } = {}): MayChuGia {
  return new MayChuGia()
    .dat('GET /v1/trong-tam', { than: tuy_chon.trong_tam ?? { ngay: NGAY, muc: [] } })
    .dat('GET /v1/bao-cao', { than: tuy_chon.danh_sach ?? DANH_SACH })
    .dat(`GET /v1/bao-cao/${NGAY}/toi`, { than: BAO_CAO_TOI })
    .dat(`GET /v1/bao-cao/${NGAY}/sang`, { than: BAO_CAO_SANG })
    .dat(`GET /v1/bao-cao/${HOM_QUA}/sang`, { than: { ...BAO_CAO_SANG, ngay: HOM_QUA } })
    .gan();
}

/* ================================================================== *
 * A. Hàm thuần
 * ================================================================== */

describe('d.336 — chọn ngày và loại từ danh sách báo cáo đã lưu', () => {
  it('`ngayCoBaoCao` bỏ trùng và GIỮ thứ tự của máy chủ (mới nhất trước)', () => {
    expect(ngayCoBaoCao(DANH_SACH.items as never)).toEqual([NGAY, HOM_QUA]);
  });

  it('`loaiCuaNgay` chỉ trả loại CÓ THẬT của ngày đó', () => {
    expect(loaiCuaNgay(DANH_SACH.items as never, NGAY)).toEqual(['sang', 'toi']);
    // Ngày chỉ có báo cáo sáng ⇒ ô chọn loại không được bày "Handoff tối".
    expect(loaiCuaNgay(DANH_SACH.items as never, HOM_QUA)).toEqual(['sang']);
    expect(loaiCuaNgay(DANH_SACH.items as never, '2020-01-01')).toEqual([]);
  });
});

/* ================================================================== *
 * B. Chưa có báo cáo nào
 * ================================================================== */

describe('mục 11 d.322, d.330 — chưa tới 07:30/20:00 thì chưa có báo cáo', () => {
  it('danh sách rỗng ⇒ nói thẳng vì sao, không một trang trắng', async () => {
    may({ danh_sach: { items: [], cursor_sau: null } });
    dung(<TrangBaoCao />);
    expect(await screen.findByText(CAU_CHUA_CO_BAO_CAO)).toBeTruthy();
  });

  it('danh sách rỗng ⇒ KHÔNG gọi đường một báo cáo nào', async () => {
    const m = may({ danh_sach: { items: [], cursor_sau: null } });
    dung(<TrangBaoCao />);
    await screen.findByText(CAU_CHUA_CO_BAO_CAO);
    expect(m.da_goi.filter((l) => l.duong.startsWith('/v1/bao-cao/'))).toHaveLength(0);
  });
});

/* ================================================================== *
 * C. Sáu vế của báo cáo sáng — d.323–328
 * ================================================================== */

describe('mục 11 d.323–328 — trang hiện đủ sáu vế của báo cáo sáng', () => {
  function oChonLoai(): HTMLSelectElement {
    const o = document.querySelector('[data-chon="loai"]');
    if (!(o instanceof HTMLSelectElement)) throw new Error('không thấy ô chọn loại');
    return o;
  }

  it('sáu tiêu đề vế của d.323–328 đều hiện', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    await userEvent.selectOptions(oChonLoai(), 'sang');
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });

    for (const ten of Object.values(VE_SANG)) {
      expect(document.querySelector(`[data-ve="${ten}"]`), ten).not.toBeNull();
    }
  });

  it('d.325 — vế "Hôm qua đã xong" nêu ĐÚNG NGÀY hôm qua (không cửa sổ trượt)', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    await userEvent.selectOptions(oChonLoai(), 'sang');
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });

    expect(document.querySelector('[data-o="ngay-hom-qua"]')?.textContent).toBe(HOM_QUA);
    expect(document.querySelector('[data-viec="SAI-9"]')).not.toBeNull();
  });

  it('d.326 — ticket không ai cầm hiện kèm chữ "không ai cầm"', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    await userEvent.selectOptions(oChonLoai(), 'sang');
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });

    expect(document.querySelector('[data-viec="SAI-11"]')?.textContent).toContain(
      'không ai cầm',
    );
  });

  it('d.324 — trọng tâm rỗng ⇒ ĐÚNG chữ "chưa có đề xuất" của SPEC', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    await userEvent.selectOptions(oChonLoai(), 'sang');
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });

    expect(CAU_CHUA_CO_DE_XUAT).toBe('chưa có đề xuất');
    expect(
      document.querySelector(`[data-ve="${VE_SANG.trong_tam}"]`)?.textContent,
    ).toContain(CAU_CHUA_CO_DE_XUAT);
  });
});

/* ================================================================== *
 * D. Bốn vế của handoff tối — d.331–334
 * ================================================================== */

describe('mục 11 d.331–334 — trang hiện đủ bốn vế của handoff tối', () => {
  it('bốn tiêu đề vế của d.331–334 đều hiện', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });

    for (const ten of Object.values(VE_TOI)) {
      expect(document.querySelector(`[data-ve="${ten}"]`), ten).not.toBeNull();
    }
  });

  it('d.331 — "đạt hay chưa" đọc từ `dat` của MÁY CHỦ, trang không tính lại', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });

    expect(document.querySelector('[data-trong-tam="SAI-1"]')?.getAttribute('data-dat')).toBe(
      'co',
    );
    // SAI-2 ở "Chờ kiểm chứng" — máy chủ đã nói `dat: false`, và trang **không**
    // suy lại từ nhãn trạng thái.
    expect(document.querySelector('[data-trong-tam="SAI-2"]')?.getAttribute('data-dat')).toBe(
      'khong',
    );
  });

  it('ghi chú của một trọng tâm hiện ra khi có', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    expect(document.querySelector('[data-trong-tam="SAI-1"]')?.textContent).toContain(
      'vì chặn cả phần 7',
    );
  });

  it('d.332 — dự án ⚪ hiện đúng câu "Dự án không chạy" của d.74', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    expect(document.querySelector('[data-du-an="SAI"]')?.textContent).toContain(
      'Dự án không chạy',
    );
  });

  it('d.333, d.334 — "Chuyển sang mai" và "Cần Chủ mới phát sinh" nêu đúng dòng', async () => {
    may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    expect(document.querySelector('[data-viec="SAI-12"]')).not.toBeNull();
    expect(document.querySelector('[data-muc="T-8"]')).not.toBeNull();
  });
});

/* ================================================================== *
 * E. d.336 — xuất ra markdown được
 * ================================================================== */

describe('mục 11 d.336 — xuất ra markdown được', () => {
  it('nút "Sao markdown" chép ĐÚNG `noi_dung_md` của máy chủ, không dựng lại', async () => {
    may();
    const viet = vi.fn<(s: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: viet },
      configurable: true,
    });

    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    const o = document.querySelector('[data-chon="loai"]');
    if (!(o instanceof HTMLSelectElement)) throw new Error('không thấy ô chọn loại');
    await userEvent.selectOptions(o, 'sang');
    await screen.findByRole('heading', { name: /Báo cáo sáng/ });

    await userEvent.click(screen.getByRole('button', { name: NHAN_SAO_MD }));

    await waitFor(() => {
      expect(viet).toHaveBeenCalledWith(MD_SANG);
    });
    expect(await screen.findByText(CAU_DA_SAO_MD)).toBeTruthy();
  });

  it('`du_lieu` không đọc được ⇒ VẪN xem lại được qua chính markdown', async () => {
    new MayChuGia()
      .dat('GET /v1/bao-cao', { than: DANH_SACH })
      .dat(`GET /v1/bao-cao/${NGAY}/toi`, {
        than: { ...BAO_CAO_TOI, du_lieu: null, noi_dung_md: '# Handoff tối — hỏng JSON' },
      })
      .gan();

    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    expect(document.querySelector('[data-o="md-tho"]')?.textContent).toContain('hỏng JSON');
  });
});

/* ================================================================== *
 * F. Những thứ trang này CỐ Ý KHÔNG CÓ
 * ================================================================== */

describe('mục 11 — trang Báo cáo không có đường ghi nào', () => {
  it('KHÔNG có nút "sinh lại báo cáo": báo cáo sinh bằng Cron và bất biến', async () => {
    const m = may();
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });

    // Không một lượt gọi nào khác `GET`: trang này chỉ đọc.
    expect(m.da_goi.every((l) => l.method === 'GET')).toBe(true);
    expect(screen.queryByRole('button', { name: /sinh lại/i })).toBeNull();
  });

  it('nhãn hai loại đúng chữ SPEC d.322 và d.330', () => {
    // Phía này chép tay từ `SPEC.md`; phía kia sinh từ mã.
    expect(NHAN_LOAI_BAO_CAO.sang).toBe('Báo cáo sáng');
    expect(NHAN_LOAI_BAO_CAO.toi).toBe('Handoff tối');
  });
});

/* ================================================================== *
 * G. Ô ghi 3 việc trọng tâm + khối "hiện hành" — d.324, #147 (BAT-11)
 * ================================================================== */

const SONG_2 = {
  ngay: NGAY,
  muc: [
    {
      thu_tu: 1,
      ticket_id: 'tk-1',
      ma: 'SAI-1',
      tieu_de: 'Việc một',
      ghi_chu: 'gấp',
      agent_id: null,
      nguoi_ghi: null,
      tao_luc: TAO_LUC,
    },
    {
      thu_tu: 2,
      ticket_id: 'tk-2',
      ma: 'SAI-2',
      tieu_de: 'Việc hai',
      ghi_chu: null,
      agent_id: null,
      nguoi_ghi: null,
      tao_luc: TAO_LUC,
    },
  ],
};

function oTT(ten: string): HTMLInputElement {
  const o = screen.getByLabelText(ten);
  if (!(o instanceof HTMLInputElement)) throw new Error(`không phải ô nhập: ${ten}`);
  return o;
}

/** Máy chủ giả giữ MỘT bộ sống: POST thay bộ, GET trả bộ hiện có. */
function mayTT(dau: typeof SONG_2, chup: unknown[] = []): { m: MayChuGia; bo: { v: typeof SONG_2 } } {
  const bo = { v: dau };
  const m = new MayChuGia()
    .dat('GET /v1/trong-tam', () => ({ than: bo.v }))
    .dat('POST /v1/trong-tam', (l) => {
      const muc = (l.than as { muc: { ticket_id: string; ghi_chu?: string }[] }).muc;
      bo.v = {
        ngay: NGAY,
        muc: muc.map((x, i) => ({
          thu_tu: i + 1,
          ticket_id: x.ticket_id,
          ma: x.ticket_id === 'tk-12' ? 'BAT-12' : x.ticket_id === 'tk-1' ? 'SAI-1' : 'SAI-2',
          tieu_de: 't',
          ghi_chu: x.ghi_chu ?? null,
          agent_id: null,
          nguoi_ghi: null,
          tao_luc: TAO_LUC,
        })),
      };
      return { http: 201, than: { ngay: NGAY, so_muc: muc.length } };
    })
    .dat('GET /v1/man-hinh-ticket/ma/BAT-12', { than: { ticket: { id: 'tk-12', ma: 'BAT-12' } } })
    .dat('GET /v1/bao-cao', { than: DANH_SACH })
    .dat(`GET /v1/bao-cao/${NGAY}/toi`, { than: BAO_CAO_TOI })
    .dat(`GET /v1/bao-cao/${NGAY}/sang`, {
      than: { ...BAO_CAO_SANG, du_lieu: { ...BAO_CAO_SANG.du_lieu, trong_tam: chup } },
    })
    .dat(`GET /v1/bao-cao/${HOM_QUA}/sang`, {
      than: {
        ...BAO_CAO_SANG,
        ngay: HOM_QUA,
        du_lieu: { ...BAO_CAO_SANG.du_lieu, ngay: HOM_QUA, trong_tam: chup },
      },
    })
    .gan();
  return { m, bo };
}

const CHUP_1 = [
  { thu_tu: 1, ma: 'SAI-1', tieu_de: 'Việc một', nhan_trang_thai: 'Đang làm', dat: false, ghi_chu: 'gấp' },
];

async function xemSang(): Promise<void> {
  await screen.findByRole('heading', { name: /Handoff tối/ });
  const o = document.querySelector('[data-chon="loai"]');
  if (!(o instanceof HTMLSelectElement)) throw new Error('không thấy ô chọn loại');
  await userEvent.selectOptions(o, 'sang');
  await screen.findByRole('heading', { name: /Báo cáo sáng/ });
}

describe('mục 11 d.324 — chủ ghi 3 việc trọng tâm trên /bao-cao', () => {
  it('nạp sẵn bộ đang có của hôm nay (mã + ghi chú), dòng thừa để trống', async () => {
    mayTT(SONG_2);
    dung(<TrangBaoCao />);
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 1').value).toBe('SAI-1');
    });
    expect(oTT('Ghi chú trọng tâm 1').value).toBe('gấp');
    expect(oTT('Mã ticket trọng tâm 2').value).toBe('SAI-2');
    expect(oTT('Mã ticket trọng tâm 3').value).toBe('');
  });

  it('Lưu gửi đúng thân: đúng thứ tự, ghi chú, id tra từ mã, KHÔNG gửi ngày', async () => {
    const { m } = mayTT(SONG_2);
    dung(<TrangBaoCao />);
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 1').value).toBe('SAI-1');
    });
    await userEvent.type(oTT('Mã ticket trọng tâm 3'), 'bat-12');
    await userEvent.type(oTT('Ghi chú trọng tâm 3'), '  làm trước  ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => {
      expect(m.soLan('POST', '/v1/trong-tam')).toBe(1);
    });
    const post = m.da_goi.find((l) => l.method === 'POST');
    expect(post?.than).toEqual({
      muc: [
        { ticket_id: 'tk-1', ghi_chu: 'gấp' },
        { ticket_id: 'tk-2' },
        { ticket_id: 'tk-12', ghi_chu: 'làm trước' },
      ],
    });
    expect(Object.keys(post?.than as object)).toEqual(['muc']);
    // Chỉ mã MỚI mới phải tra; hai mã đã có thì dùng lại id.
    expect(m.soLan('GET', '/v1/man-hinh-ticket/ma/BAT-12')).toBe(1);
    // Ghi xong thì tải lại bộ sống và ô nạp lại đúng bộ mới.
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 3').value).toBe('BAT-12');
    });
  });

  it('"Xoá hết" gửi mảng rỗng; báo cáo sáng hôm nay hiện "chưa có đề xuất" ở khối hiện hành', async () => {
    const { m } = mayTT(SONG_2, CHUP_1);
    dung(<TrangBaoCao />);
    await xemSang();
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 1').value).toBe('SAI-1');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Xoá hết' }));
    await waitFor(() => {
      expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({ muc: [] });
    });
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 1').value).toBe('');
    });
    const khoi = await waitFor(() => {
      const k = document.querySelector(`[data-ve="${TIEU_DE_KHOI_HIEN_HANH}"]`);
      if (k === null) throw new Error('chưa có khối');
      return k;
    });
    expect(khoi.textContent).toContain(CAU_CHUA_CO_DE_XUAT);
  });

  it('server từ chối ⇒ toast nêu đúng lý do VÀ ô hoàn về bộ trước', async () => {
    const { m } = mayTT(SONG_2);
    m.dat('POST /v1/trong-tam', {
      loi: { error: 'INVALID_INPUT', message: 'Một ticket không được chiếm hai trong ba ô trọng tâm.' },
      http: 422,
    });
    dung(<TrangBaoCao />);
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 1').value).toBe('SAI-1');
    });
    await userEvent.type(oTT('Mã ticket trọng tâm 3'), 'SAI-1');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const t = await screen.findByRole('alert');
    expect(t.textContent).toContain('Một ticket không được chiếm hai trong ba ô trọng tâm.');
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 3').value).toBe('');
    });
  });

  it('mã không có thật (NOT_FOUND khi tra) ⇒ toast lý do, KHÔNG gửi POST', async () => {
    const { m } = mayTT(SONG_2);
    m.dat('GET /v1/man-hinh-ticket/ma/ZZZ-9', {
      http: 404,
      loi: { error: 'NOT_FOUND', message: 'Không tìm thấy ticket.' },
    });
    dung(<TrangBaoCao />);
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 1').value).toBe('SAI-1');
    });
    await userEvent.type(oTT('Mã ticket trọng tâm 3'), 'zzz-9');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Không tìm thấy ticket.');
    expect(m.soLan('POST', '/v1/trong-tam')).toBe(0);
  });
});

describe('#147 — khối "Trọng tâm hiện hành" dưới mục 2 của báo cáo sáng HÔM NAY', () => {
  it('bộ sống khác bản chụp ⇒ giữ nguyên mục 2 và hiện thêm khối sống ngay dưới', async () => {
    mayTT(SONG_2, CHUP_1);
    dung(<TrangBaoCao />);
    await xemSang();
    const khoi = await waitFor(() => {
      const k = document.querySelector(`[data-ve="${TIEU_DE_KHOI_HIEN_HANH}"]`);
      if (k === null) throw new Error('chưa có khối');
      return k;
    });
    expect(TIEU_DE_KHOI_HIEN_HANH).toBe('Trọng tâm hiện hành (sửa sau khi báo cáo sinh lúc 07:30)');
    expect(khoi.querySelector('[data-trong-tam-hien-hanh="SAI-2"]')).not.toBeNull();
    // Mục 2 của bản chụp còn nguyên.
    const muc2 = document.querySelector(`[data-ve="${VE_SANG.trong_tam}"]`);
    expect(muc2?.querySelector('[data-trong-tam="SAI-1"]')).not.toBeNull();
    // Và khối nằm NGAY SAU mục 2.
    expect(muc2?.nextElementSibling).toBe(khoi);
  });

  it('bộ sống rỗng, bản chụp có ⇒ khối ghi "chưa có đề xuất"', async () => {
    mayTT({ ngay: NGAY, muc: [] }, CHUP_1);
    dung(<TrangBaoCao />);
    await xemSang();
    const khoi = await waitFor(() => {
      const k = document.querySelector(`[data-ve="${TIEU_DE_KHOI_HIEN_HANH}"]`);
      if (k === null) throw new Error('chưa có khối');
      return k;
    });
    expect(khoi.textContent).toContain(CAU_CHUA_CO_DE_XUAT);
  });

  it('bộ sống GIỐNG bản chụp ⇒ không hiện khối', async () => {
    mayTT(
      { ngay: NGAY, muc: [SONG_2.muc[0] as (typeof SONG_2.muc)[number]] },
      CHUP_1,
    );
    dung(<TrangBaoCao />);
    await xemSang();
    await waitFor(() => {
      expect(oTT('Mã ticket trọng tâm 1').value).toBe('SAI-1');
    });
    expect(document.querySelector(`[data-ve="${TIEU_DE_KHOI_HIEN_HANH}"]`)).toBeNull();
  });

  it('báo cáo sáng của NGÀY KHÁC hôm nay ⇒ không hiện khối', async () => {
    mayTT(SONG_2, CHUP_1);
    dung(<TrangBaoCao />);
    await xemSang();
    const o = document.querySelector('[data-chon="ngay"]');
    if (!(o instanceof HTMLSelectElement)) throw new Error('không thấy ô chọn ngày');
    await userEvent.selectOptions(o, HOM_QUA);
    await waitFor(() => {
      expect(document.querySelector('[data-o="ngay"]')?.textContent).toBe(HOM_QUA);
    });
    expect(document.querySelector(`[data-ve="${TIEU_DE_KHOI_HIEN_HANH}"]`)).toBeNull();
  });

  it('`boTrongTamKhac`: so mã + ghi chú theo thứ tự', () => {
    const a = { ma: 'A-1', ghi_chu: null };
    const b = { ma: 'A-2', ghi_chu: 'x' };
    expect(boTrongTamKhac([a, b], [a, b])).toBe(false);
    expect(boTrongTamKhac([a, b], [b, a])).toBe(true);
    expect(boTrongTamKhac([a], [a, b])).toBe(true);
    expect(boTrongTamKhac([a], [{ ma: 'A-1', ghi_chu: 'y' }])).toBe(true);
  });
});

/* ================================================================== *
 * H. Nút "Xem thêm" — danh sách báo cáo phân trang keyset (BAT-15)
 * ================================================================== */

const NGAY_CU_1 = '2026-10-04';
const NGAY_CU_2 = '2026-10-03';
const CURSOR_2 = 'cur-trang-2';
const TRANG_1 = { ...DANH_SACH, cursor_sau: CURSOR_2 };
const TRANG_2 = (cursor_sau: string | null): { items: unknown[]; cursor_sau: string | null } => ({
  items: [
    { ngay: NGAY_CU_1, loai: 'sang', nhan_loai: 'Báo cáo sáng', tao_luc: TAO_LUC },
    { ngay: NGAY_CU_2, loai: 'sang', nhan_loai: 'Báo cáo sáng', tao_luc: TAO_LUC },
  ],
  cursor_sau,
});
const DUONG_TRANG_2 = `GET /v1/bao-cao?cursor=${CURSOR_2}`;

function cacNgayTrongO(): string[] {
  const o = document.querySelector('[data-chon="ngay"]');
  if (!(o instanceof HTMLSelectElement)) throw new Error('không thấy ô chọn ngày');
  return [...o.options].map((x) => x.value);
}

describe('BAT-15 — nút "Xem thêm" nối trang kế của danh sách báo cáo', () => {
  it('bấm ⇒ gọi `?cursor=` đúng và NỐI ngày cũ hơn vào cuối, giữ thứ tự', async () => {
    const m = may({ danh_sach: TRANG_1 });
    m.dat(DUONG_TRANG_2, { than: TRANG_2(null) });
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    expect(cacNgayTrongO()).toEqual([NGAY, HOM_QUA]);

    await userEvent.click(screen.getByRole('button', { name: NHAN_XEM_THEM }));

    await waitFor(() => {
      expect(cacNgayTrongO()).toEqual([NGAY, HOM_QUA, NGAY_CU_1, NGAY_CU_2]);
    });
    expect(m.soLan('GET', `/v1/bao-cao?cursor=${CURSOR_2}`)).toBe(1);
    // Báo cáo đang xem không bị đổi.
    expect(document.querySelector('[data-o="ngay"]')?.textContent).toBe(NGAY);
  });

  it('`cursor_sau: null` ⇒ không có nút, cả khi trang đầu đã hết lẫn sau khi nối trang cuối', async () => {
    may();
    const a = dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    expect(screen.queryByRole('button', { name: NHAN_XEM_THEM })).toBeNull();
    a.unmount();

    const m = may({ danh_sach: TRANG_1 });
    m.dat(DUONG_TRANG_2, { than: TRANG_2(null) });
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });
    await userEvent.click(screen.getByRole('button', { name: NHAN_XEM_THEM }));
    await waitFor(() => {
      expect(cacNgayTrongO()).toContain(NGAY_CU_2);
    });
    expect(screen.queryByRole('button', { name: NHAN_XEM_THEM })).toBeNull();
    expect(screen.queryByRole('button', { name: NHAN_THU_LAI })).toBeNull();
  });

  it('lỗi mạng khi Xem thêm ⇒ alert + "Thử lại", GIỮ danh sách và báo cáo đang xem; Thử lại nối trang 2', async () => {
    const m = may({ danh_sach: TRANG_1 });
    // Không khai đường trang 2 ⇒ fetch bị reject (lỗi mạng).
    dung(<TrangBaoCao />);
    await screen.findByRole('heading', { name: /Handoff tối/ });

    await userEvent.click(screen.getByRole('button', { name: NHAN_XEM_THEM }));

    const canh_bao = await screen.findByRole('alert');
    expect(canh_bao.textContent).toContain(CAU_LOI_XEM_THEM);
    expect(cacNgayTrongO()).toEqual([NGAY, HOM_QUA]);
    expect(screen.getByRole('heading', { name: /Handoff tối/ })).toBeTruthy();

    // Máy chủ giả trả được ⇒ Thử lại tải lại ĐÚNG trang đó.
    m.dat(DUONG_TRANG_2, { than: TRANG_2(null) });
    await userEvent.click(screen.getByRole('button', { name: NHAN_THU_LAI }));
    await waitFor(() => {
      expect(cacNgayTrongO()).toEqual([NGAY, HOM_QUA, NGAY_CU_1, NGAY_CU_2]);
    });
    expect(m.soLan('GET', `/v1/bao-cao?cursor=${CURSOR_2}`)).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
