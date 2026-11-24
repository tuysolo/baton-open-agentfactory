/**
 * **Trang Nhật ký quyết định** — SPEC mục 10 d.306–312, mục 14 d.392, cộng 19.12
 * câu 4 (lớp "Chung"), câu 8 (tìm theo chữ **giữ nguyên**, khác `Cmd/Ctrl+K`),
 * câu 62 ("vì sao" không rỗng), câu 64 (dòng tự sinh).
 *
 * Ba lớp chống "test xanh giả" (nếp đã lập ở các lượt trước):
 *
 *   1. **Chuỗi SPEC chốt cứng được CẮT TỪ `SPEC.md`**: sáu trường của d.308, chữ
 *      "đã có quyết định mới" của d.309, ba vế của d.311, nhãn "Chung" của câu 4,
 *      và công thức "vì sao" của câu 64. Kèm ca ghim chính mỗi parser.
 *   2. **Ca phủ định dựng trạng thái xấu THẬT**: nút Gửi mờ khi thiếu "vì sao"
 *      **và** không mờ sau khi có; một dòng Chung **không** được hiện id rỗng;
 *      trang **không** có nút sửa/xoá nào (d.309).
 *   3. **Máy chủ giả có trạng thái** cho ca ghi: `POST /v1/nhat-ky` thật sự thêm
 *      dòng vào kho, nên lượt tải lại sau mutation nói **đúng** thứ máy chủ sẽ
 *      nói — một fake trả mãi một thân cố định sẽ che đúng vế "dòng mới hiện lên".
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAU_CAN_VI_SAO,
  CAU_CHUA_CO_DONG,
  CAU_DA_CO_MOI,
  KHOA_LOC_NHAT_KY,
  LOC_AI_CHU,
  LOC_CHUNG,
  NHAN_CHU,
  NHAN_CHUNG,
  NHAN_GHI_DONG,
  NHAN_GUI_DONG,
  NHAN_VI_SAO,
  TEN_TRANG_NHAT_KY,
  TrangNhatKy,
  coTheGhi,
} from '../src/trang/nhat-ky';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import { gioDayDu, thoiGianTuongDoi } from '../src/thoi-gian';
import type { DongNhatKy, ManHinhNhatKy } from '../src/api';
import { MayChuGia, dung } from './giup';
import { GIO, PHUT } from './than-agent';
import {
  cauDaCoQuyetDinhMoiTuSpec,
  hienThayDoiTuSpec,
  nhanChungTuSpec,
  truongNhatKyTuSpec,
  veManHinhNhatKyTuSpec,
  viSaoTuSinhTuSpec,
} from './doc-spec';

const D = '/v1/man-hinh-nhat-ky';

function dongNhatKy(p: Partial<DongNhatKy> & { id: string }): DongNhatKy {
  return {
    luc: GIO - PHUT,
    ngay: '2025-10-09',
    nguoi_loai: 'chu',
    agent_id: null,
    project_id: null,
    quyet_dinh: 'Chốt dùng D1',
    vi_sao: 'Vì nó rẻ nhất',
    da_co_quyet_dinh_moi: false,
    can_cu: [],
    ...p,
  };
}

/** Thân màn hình, `nhom_theo_ngay` **khớp** số dòng (như máy chủ vẫn trả). */
function manHinh(items: DongNhatKy[]): ManHinhNhatKy {
  const nhom: { ngay: string; so_dong: number }[] = [];
  for (const d of items) {
    const cuoi = nhom.at(-1);
    if (cuoi !== undefined && cuoi.ngay === d.ngay) cuoi.so_dong += 1;
    else nhom.push({ ngay: d.ngay, so_dong: 1 });
  }
  return { items, cursor_sau: null, nhom_theo_ngay: nhom, bay_gio: GIO };
}

/** Máy chủ giả **có trạng thái**: ghi một dòng thì lượt đọc sau thấy nó. */
function mayNhatKy(ban_dau: DongNhatKy[] = []): {
  may: MayChuGia;
  kho: { ds: DongNhatKy[]; canh_bao: { ma: string; message: string }[] };
} {
  const kho = { ds: ban_dau, canh_bao: [] as { ma: string; message: string }[] };
  const may = new MayChuGia()
    .dat(`GET ${D}`, () => ({ than: manHinh(kho.ds) }))
    .dat('GET /v1/du-an?limit=200', {
      than: {
        items: [{ id: 'pj-SAI', ma: 'SAI', ten: 'Sample', trang_thai: 'active', nhom: null }],
        cursor_sau: null,
      },
    })
    .dat('GET /v1/agent', {
      than: {
        items: [{ id: 'ag-1', ten: 'M-Baton', vai_tro: 'manager', nhan_vai_tro: 'Quản lý' }],
        cursor_sau: null,
      },
    })
    .dat('POST /v1/nhat-ky', (l) => {
      const than = l.than as { quyet_dinh: string; vi_sao: string; project_id: string | null };
      kho.ds = [
        dongNhatKy({
          id: `nk-${String(kho.ds.length + 1)}`,
          quyet_dinh: than.quyet_dinh,
          vi_sao: than.vi_sao,
          project_id: than.project_id,
        }),
        ...kho.ds,
      ];
      return { than: { id: 'nk-moi', luc: GIO, canh_bao: kho.canh_bao } };
    })
    .gan();
  return { may, kho };
}

/* ================================================================== *
 * 0. Ca ghim CHÍNH các parser SPEC
 * ================================================================== */

describe('parser SPEC của trang Nhật ký', () => {
  it('d.308 cắt ra sáu trường của một dòng', () => {
    const t = truongNhatKyTuSpec();
    expect(t).toHaveLength(6);
    expect(t[0]).toContain('lúc');
    expect(t.join(' | ')).toContain('vì sao');
    expect(t.join(' | ')).toContain('căn cứ');
  });

  it('d.309 cắt ra đúng chữ "đã có quyết định mới"', () => {
    expect(cauDaCoQuyetDinhMoiTuSpec()).toBe(CAU_DA_CO_MOI);
  });

  it('d.311 có ba vế: gom theo ngày, lọc theo dự án và theo ai, tìm theo chữ', () => {
    expect(veManHinhNhatKyTuSpec()).toEqual({
      gom_theo_ngay: true,
      loc_du_an: true,
      loc_ai: true,
      tim_theo_chu: true,
    });
  });

  it('19.12 câu 4 chốt nhãn "Chung" cho giá trị rỗng, và câu 64 chốt công thức "vì sao"', () => {
    expect(nhanChungTuSpec()).toBe(NHAN_CHUNG);
    expect(viSaoTuSinhTuSpec()).toContain('Trả lời mục T-x');
  });
});

/* ================================================================== *
 * 1. Gom theo ngày và sáu trường của một dòng — d.308, d.311
 * ================================================================== */

describe('Trang Nhật ký (d.308, d.311)', () => {
  it('danh sách rỗng nói thẳng', async () => {
    mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    expect(await screen.findByText(CAU_CHUA_CO_DONG)).toBeTruthy();
    expect(screen.getByRole('heading', { name: TEN_TRANG_NHAT_KY })).toBeTruthy();
  });

  it('một dòng hiện đủ sáu trường của d.308', async () => {
    mayNhatKy([
      dongNhatKy({
        id: 'nk-1',
        luc: GIO - 30 * PHUT,
        agent_id: 'ag-1',
        nguoi_loai: 'agent',
        project_id: 'pj-SAI',
        quyet_dinh: 'Chốt dùng D1',
        vi_sao: 'Vì nó rẻ nhất',
        can_cu: [{ loai: 'ask', id: 'ct-1', ma_can_chu: 'T-64' }],
      }),
    ]);
    dung(<TrangNhatKy />, '/nhat-ky');

    const dong = await waitFor(() => {
      const o = document.querySelector('[data-dong="nk-1"]');
      if (o === null) throw new Error('chưa có dòng');
      return o;
    });

    // lúc — d.412: chữ tương đối đếm từ `bay_gio` **của máy chủ**.
    const moc = dong.querySelector('time');
    expect(moc?.textContent).toBe(thoiGianTuongDoi(GIO - 30 * PHUT, GIO));
    expect(moc?.getAttribute('title')).toBe(gioDayDu(GIO - 30 * PHUT));
    // ai · dự án · quyết định · vì sao · căn cứ
    expect(dong.querySelector('[data-o="ai"]')?.textContent).toBe('ag-1');
    expect(dong.querySelector('[data-o="du-an"]')?.textContent).toBe('pj-SAI');
    expect(dong.querySelector('[data-o="quyet-dinh"]')?.textContent).toBe('Chốt dùng D1');
    expect(dong.querySelector('[data-o="vi-sao"]')?.textContent).toContain('Vì nó rẻ nhất');
    expect(dong.querySelector('[data-can-cu="ask"]')?.textContent).toBe('T-64');
  });

  it('dòng của chủ hiện tên chủ, không hiện một agent_id rỗng', async () => {
    mayNhatKy([dongNhatKy({ id: 'nk-1', agent_id: null, nguoi_loai: 'chu' })]);
    dung(<TrangNhatKy />, '/nhat-ky');

    await waitFor(() => {
      expect(document.querySelector('[data-o="ai"]')?.textContent).toBe(NHAN_CHU);
    });
    expect(document.querySelector('[data-o="ai"]')?.tagName).not.toBe('A');
  });

  /**
   * **19.12 câu 4** — "Chung" là trường dự án **rỗng**, và giao diện hiện nhãn
   * "Chung" cho giá trị đó.
   *
   * Ca phủ định có tải: một bản cài `project_id ?? ''` in ô trống, tức chủ không
   * phân biệt được "dòng Chung" với "dòng mất dữ liệu dự án".
   */
  it('dòng Chung hiện nhãn "Chung", không hiện ô trống', async () => {
    mayNhatKy([dongNhatKy({ id: 'nk-1', project_id: null })]);
    dung(<TrangNhatKy />, '/nhat-ky');

    const o = await waitFor(() => {
      const x = document.querySelector('[data-o="du-an"]');
      if (x === null) throw new Error('chưa có ô dự án');
      return x;
    });
    expect(o.textContent).toBe(nhanChungTuSpec());
    expect(o.getAttribute('data-chung')).toBe('co');
  });

  it('gom theo ngày: hai nhóm, đúng số dòng mỗi nhóm, theo đúng nhóm của máy chủ', async () => {
    mayNhatKy([
      dongNhatKy({ id: 'nk-3', ngay: '2025-10-09', quyet_dinh: 'Hôm nay 1' }),
      dongNhatKy({ id: 'nk-2', ngay: '2025-10-09', quyet_dinh: 'Hôm nay 2' }),
      dongNhatKy({ id: 'nk-1', ngay: '2025-10-08', quyet_dinh: 'Hôm qua' }),
    ]);
    dung(<TrangNhatKy />, '/nhat-ky');

    const nhom = await waitFor(() => {
      const o = document.querySelectorAll('[data-ngay]');
      if (o.length === 0) throw new Error('chưa gom');
      return [...o];
    });
    expect(nhom.map((n) => n.getAttribute('data-ngay'))).toEqual(['2025-10-09', '2025-10-08']);
    expect(nhom.map((n) => n.querySelector('[data-so="dong"]')?.textContent)).toEqual(['2', '1']);
    // Ghim **nội dung** từng nhóm, không chỉ số đếm (bài học lượt 5).
    expect(within(nhom[0] as HTMLElement).getByText('Hôm nay 1')).toBeTruthy();
    expect(within(nhom[1] as HTMLElement).getByText('Hôm qua')).toBeTruthy();
    expect(within(nhom[1] as HTMLElement).queryByText('Hôm nay 1')).toBeNull();
  });

  /** d.309 — dòng cũ hiện chữ đó; và **không** có nút sửa/xoá nào ở đâu. */
  it('dòng đã có quyết định mới hiện đúng chữ của d.309', async () => {
    mayNhatKy([dongNhatKy({ id: 'nk-1', da_co_quyet_dinh_moi: true })]);
    dung(<TrangNhatKy />, '/nhat-ky');
    expect(await screen.findByText(cauDaCoQuyetDinhMoiTuSpec())).toBeTruthy();
  });

  it('KHÔNG có nút sửa và KHÔNG có nút xoá nào — d.309 "kể cả chủ"', async () => {
    const { may } = mayNhatKy([dongNhatKy({ id: 'nk-1', da_co_quyet_dinh_moi: true })]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await waitFor(() => {
      expect(document.querySelector('[data-dong="nk-1"]')).not.toBeNull();
    });

    for (const ten of [/sửa/i, /xoá/i, /xóa/i]) {
      expect(screen.queryByRole('button', { name: ten })).toBeNull();
    }
    // Và không một lượt gọi ghi nào tới dòng đã có.
    expect(may.da_goi.filter((l) => l.method !== 'GET')).toHaveLength(0);
  });
});

/* ================================================================== *
 * 2. Ba bộ lọc của d.311 — ghi trên URL
 * ================================================================== */

describe('Bộ lọc của d.311', () => {
  it('lọc theo dự án đi vào lượt gọi, kể cả lựa chọn "Chung" của 19.12 câu 4', async () => {
    const { may } = mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await screen.findByText(CAU_CHUA_CO_DONG);

    await userEvent.selectOptions(screen.getByLabelText(/Dự án/), LOC_CHUNG);
    await waitFor(() => {
      expect(may.soLan('GET', `${D}?project_id=${LOC_CHUNG}`)).toBe(1);
    });

    await userEvent.selectOptions(screen.getByLabelText(/Dự án/), 'pj-SAI');
    await waitFor(() => {
      expect(may.soLan('GET', `${D}?project_id=pj-SAI`)).toBe(1);
    });
  });

  it('lọc theo ai: chủ và một agent', async () => {
    const { may } = mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await screen.findByText(CAU_CHUA_CO_DONG);

    await userEvent.selectOptions(screen.getByLabelText(/^Ai$/), LOC_AI_CHU);
    await waitFor(() => {
      expect(may.soLan('GET', `${D}?ai=${LOC_AI_CHU}`)).toBe(1);
    });

    await userEvent.selectOptions(screen.getByLabelText(/^Ai$/), 'ag-1');
    await waitFor(() => {
      expect(may.soLan('GET', `${D}?ai=ag-1`)).toBe(1);
    });
  });

  /**
   * **Tìm theo chữ** — d.311, và 19.12 câu 8 nói thẳng vế này **giữ nguyên**, tức
   * nó là một luật khác với phạm vi của `Cmd/Ctrl+K` (lượt sau).
   */
  it('tìm theo chữ đi vào `?tim=`, và bộ lọc ghi trên URL', async () => {
    const { may } = mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await screen.findByText(CAU_CHUA_CO_DONG);

    const o = screen.getByLabelText(/Tìm theo chữ/);
    await userEvent.type(o, 'ngưỡng 500{Enter}');

    await waitFor(() => {
      expect(may.soLan('GET', `${D}?tim=ng%C6%B0%E1%BB%A1ng+500`)).toBe(1);
    });
  });

  it('bộ lọc trên URL được đọc ngay khi mở trang (link dán được)', async () => {
    const { may } = mayNhatKy([]);
    dung(<TrangNhatKy />, `/nhat-ky?${KHOA_LOC_NHAT_KY.du_an}=${LOC_CHUNG}`);

    await waitFor(() => {
      expect(may.soLan('GET', `${D}?project_id=${LOC_CHUNG}`)).toBe(1);
    });
    // Không gọi lượt "không lọc" nào: URL là nguồn sự thật của bộ lọc.
    expect(may.soLan('GET', D)).toBe(0);
  });
});

/* ================================================================== *
 * 3. Chủ tự ghi một dòng — d.310 + 19.12 câu 62 + d.312
 * ================================================================== */

describe('Chủ tự ghi một dòng (d.310, 19.12 câu 62)', () => {
  async function moO(): Promise<void> {
    await userEvent.click(await screen.findByRole('button', { name: NHAN_GHI_DONG }));
  }

  it('nút Gửi MỜ khi thiếu "vì sao", và KHÔNG mờ khi đã có — 19.12 câu 62', async () => {
    mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await moO();

    const nut = screen.getByRole('button', { name: NHAN_GUI_DONG });
    await userEvent.type(screen.getByLabelText(/^Quyết định$/), 'Chốt dùng D1');
    // Có quyết định, **chưa** có vì sao ⇒ vẫn mờ, và nói rõ lý do.
    expect(nut.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(CAU_CAN_VI_SAO)).toBeTruthy();

    await userEvent.type(screen.getByLabelText(new RegExp(`^${NHAN_VI_SAO}$`)), 'Vì nó rẻ nhất');
    expect(nut.hasAttribute('disabled')).toBe(false);
  });

  it('"vì sao" chỉ có khoảng trắng KHÔNG tính là có — câu 62 nói "không rỗng"', async () => {
    mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await moO();

    await userEvent.type(screen.getByLabelText(/^Quyết định$/), 'Chốt dùng D1');
    await userEvent.type(screen.getByLabelText(new RegExp(`^${NHAN_VI_SAO}$`)), '   ');
    expect(screen.getByRole('button', { name: NHAN_GUI_DONG }).hasAttribute('disabled')).toBe(true);
  });

  it('ghi xong thì dòng mới hiện lên, thân gửi đúng ba trường', async () => {
    const { may } = mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await moO();

    await userEvent.type(screen.getByLabelText(/^Quyết định$/), 'Chốt dùng D1');
    await userEvent.type(screen.getByLabelText(new RegExp(`^${NHAN_VI_SAO}$`)), 'Vì nó rẻ nhất');
    await userEvent.click(screen.getByRole('button', { name: NHAN_GUI_DONG }));

    await waitFor(() => {
      expect(screen.getByText('Chốt dùng D1')).toBeTruthy();
    });
    const goi = may.da_goi.find((l) => l.method === 'POST');
    // 19.12 câu 4: không chọn dự án ⇒ `project_id` **rỗng** (Chung), không mã lạ.
    expect(goi?.than).toEqual({
      quyet_dinh: 'Chốt dùng D1',
      vi_sao: 'Vì nó rẻ nhất',
      project_id: null,
    });
  });

  /**
   * **d.312 — "chỉ cảnh báo, không chặn".** Dòng **đã được ghi**; cảnh báo đi ra
   * kết quả của lệnh. Ca này ghim cả hai nửa: toast hiện **câu của máy chủ**, và
   * dòng vẫn vào danh sách.
   */
  it('cảnh báo dữ liệu nhân sự hiện thành toast nhưng KHÔNG chặn (d.312)', async () => {
    const { kho } = mayNhatKy([]);
    kho.canh_bao = [{ ma: 'day_so', message: 'Có một dãy 9–12 số; đừng đưa dữ liệu nhân sự vào.' }];
    dung(<TrangNhatKy />, '/nhat-ky');
    await moO();

    await userEvent.type(screen.getByLabelText(/^Quyết định$/), 'Số 123456789012');
    await userEvent.type(screen.getByLabelText(new RegExp(`^${NHAN_VI_SAO}$`)), 'Vì cần ghi');
    await userEvent.click(screen.getByRole('button', { name: NHAN_GUI_DONG }));

    expect(
      await screen.findByText('Có một dãy 9–12 số; đừng đưa dữ liệu nhân sự vào.'),
    ).toBeTruthy();
    // Không chặn: dòng vẫn hiện trong danh sách.
    await waitFor(() => {
      expect(screen.getByText('Số 123456789012')).toBeTruthy();
    });
  });

  it('máy chủ từ chối thì toast ghi NGUYÊN VĂN lý do, không một câu dịch ở client', async () => {
    const { may } = mayNhatKy([]);
    may.dat('POST /v1/nhat-ky', {
      http: 422,
      loi: { error: 'INVALID_INPUT', message: 'Dòng Nhật ký phải có "vì sao".' },
    });
    dung(<TrangNhatKy />, '/nhat-ky');
    await moO();

    await userEvent.type(screen.getByLabelText(/^Quyết định$/), 'Chốt');
    await userEvent.type(screen.getByLabelText(new RegExp(`^${NHAN_VI_SAO}$`)), 'x');
    await userEvent.click(screen.getByRole('button', { name: NHAN_GUI_DONG }));

    expect(await screen.findByText('Dòng Nhật ký phải có "vì sao".')).toBeTruthy();
  });
});

/* ================================================================== *
 * 4. Hàm thuần `coTheGhi` — câu 62
 * ================================================================== */

describe('coTheGhi (19.12 câu 62)', () => {
  it('đòi CẢ quyết định và vì sao, cả hai không rỗng sau khi cắt khoảng trắng', () => {
    expect(coTheGhi('a', 'b')).toBe(true);
    expect(coTheGhi('', 'b')).toBe(false);
    expect(coTheGhi('a', '')).toBe(false);
    expect(coTheGhi('a', '   \n ')).toBe(false);
    expect(coTheGhi('  ', 'b')).toBe(false);
  });
});

/* ================================================================== *
 * 5. d.410
 * ================================================================== */

describe('d.410 — dòng do agent ghi hiện lên, KHÔNG tải lại trang', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chu kỳ hỏi lại ngắn hơn mốc 3 giây, và một dòng mới hiện sau một chu kỳ', async () => {
    expect(CHU_KY_LAM_MOI_MS).toBeLessThan(hienThayDoiTuSpec().giay * 1000);

    vi.useFakeTimers();
    const { kho } = mayNhatKy([]);
    dung(<TrangNhatKy />, '/nhat-ky');
    await vi.waitFor(() => {
      expect(screen.getByText(CAU_CHUA_CO_DONG)).toBeTruthy();
    });

    // `manager` ghi Nhật ký được (d.310) ⇒ lớp dòng này đổi **do agent**.
    kho.ds = [dongNhatKy({ id: 'nk-moi', quyet_dinh: 'Agent vừa ghi', agent_id: 'ag-1' })];
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-dong="nk-moi"]')).not.toBeNull();
    });
  });
});
