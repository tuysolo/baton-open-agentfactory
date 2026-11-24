/**
 * **BAT-32 việc 1 — nút gửi/lưu khoá khi mutation đang chạy.**
 *
 * Bấm hai lần liên tiếp trong lúc máy chủ giả chưa trả lời ⇒ đúng MỘT lệnh gọi.
 * Đối chứng: sau khi máy chủ trả lời, bấm lại được (lệnh thứ hai đi tới máy chủ).
 *
 * Ngoại lệ có chủ ý (KHÔNG khoá, không test ở đây): các thao tác lạc quan S/P/L
 * (đổi trạng thái / ưu tiên / nhãn) — thiết kế cho bấm liên tiếp.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrangPhien } from '../src/trang/phien';
import {
  NHAN_GUI_LOI,
  NHAN_LUU_HO_SO,
  NHAN_SUA_HO_SO,
  NHAN_THEM_LOI,
  TrangHoSoDuAn,
} from '../src/trang/ho-so-du-an';
import { NHAN_GHI_DONG, NHAN_GUI_DONG, TrangNhatKy } from '../src/trang/nhat-ky';
import { NHAN_LUU_LUAT_CHUNG, NHAN_SUA_LUAT_CHUNG, TrangBanDo } from '../src/trang/ban-do';
import type { HoSo } from '../src/api';
import { MayChuGia, dung } from './giup';
import { GIO, manHinhPhien } from './than-agent';

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true);
  });
  vi.restoreAllMocks();
});

/** Nút tên `ten` đang khoá? (không có nút ⇒ `false`: form đã đóng sau khi lưu.) */
function dangKhoa(ten: string): boolean {
  const nut = screen.queryByRole('button', { name: ten });
  return nut instanceof HTMLButtonElement ? nut.disabled : false;
}

const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Phản hồi theo lượt: lượt đầu chờ `mo()`, các lượt sau trả ngay. Dùng làm hàm
 * trả lời của `MayChuGia.dat`.
 */
function treoLuotDau<T>(than: T): { tra: () => { than: T; cho?: Promise<void> }; mo: () => void } {
  let mo = (): void => undefined;
  const cho = new Promise<void>((r) => {
    mo = () => r();
  });
  let lan = 0;
  return {
    tra: () => {
      lan += 1;
      return lan === 1 ? { than, cho } : { than };
    },
    mo: () => mo(),
  };
}

const PJ = 'pj-SAI';

function hoSo(): HoSo {
  return {
    la_gi: 'Cũ',
    thu_muc: null,
    repo_chu_so_huu: null,
    repo_ten: null,
    repo_nhanh_mac_dinh: null,
    stack: null,
    doc_truoc: null,
    cach_deploy: null,
    danh_sach_cam: null,
    project_id: PJ,
    bay_gio: GIO,
    phien_ban: 1,
    cap_nhat_luc: null,
    khong_code: false,
    bat_buoc_review: false,
    du_an: {
      id: PJ,
      ma: 'SAI',
      ten: 'Sample',
      quan_ly_agent_id: null,
      quan_ly_agent_ten: null,
      trang_thai: 'active',
      uu_tien: 3,
      dang_day: false,
      duy_tri: false,
      nhom: null,
      dat_boi: null,
    },
    loi_da_gap: [],
    lich_su_ban: [],
  };
}

describe('BAT-32 hồ sơ dự án: Gửi lỗi / Lưu không gửi trùng', () => {
  it('Gửi lỗi: bấm hai lần khi máy chủ chưa trả lời ⇒ đúng 1 POST; trả lời xong, gõ lại và bấm ⇒ POST thứ hai', async () => {
    const t = treoLuotDau({ id: 'ld-1', ngay: '2025-10-09' });
    const m = new MayChuGia()
      .dat(`GET /v1/du-an/${PJ}/ho-so`, { than: hoSo() })
      .dat(`POST /v1/du-an/${PJ}/loi-da-gap`, t.tra)
      .gan();
    dung(<TrangHoSoDuAn id={PJ} />, `/du-an/${PJ}/ho-so`);
    await userEvent.click(await screen.findByRole('button', { name: NHAN_THEM_LOI }));
    const o = (): HTMLTextAreaElement =>
      document.querySelector<HTMLTextAreaElement>('[data-nhap="loi"]')!;
    fireEvent.change(o(), { target: { value: 'Lỗi A' } });
    const nut = screen.getByRole('button', { name: NHAN_GUI_LOI });

    fireEvent.click(nut);
    await waitFor(() => {
      expect(m.soLan('POST', `/v1/du-an/${PJ}/loi-da-gap`)).toBe(1);
      expect((nut as HTMLButtonElement).disabled).toBe(true);
    });
    fireEvent.click(nut);
    await doi(30);
    expect(m.soLan('POST', `/v1/du-an/${PJ}/loi-da-gap`)).toBe(1);

    t.mo();
    await waitFor(() => {
      expect(o().value).toBe('');
    });
    fireEvent.change(o(), { target: { value: 'Lỗi B' } });
    await waitFor(() => {
      expect(dangKhoa(NHAN_GUI_LOI)).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_LOI }));
    await waitFor(() => {
      expect(m.soLan('POST', `/v1/du-an/${PJ}/loi-da-gap`)).toBe(2);
    });
  });

  it('Lưu hồ sơ: bấm hai lần khi chưa trả lời ⇒ đúng 1 PATCH; sau khi trả lời, mở sửa lại và Lưu ⇒ PATCH thứ hai', async () => {
    const t = treoLuotDau({ project_id: PJ, phien_ban: 2, da_doi: ['la_gi'] });
    const m = new MayChuGia()
      .dat(`GET /v1/du-an/${PJ}/ho-so`, { than: hoSo() })
      .dat(`PATCH /v1/du-an/${PJ}/ho-so`, t.tra)
      .gan();
    dung(<TrangHoSoDuAn id={PJ} />, `/du-an/${PJ}/ho-so`);
    await userEvent.click(await screen.findByRole('button', { name: NHAN_SUA_HO_SO }));
    fireEvent.change(document.querySelector('[data-nhap="la_gi"]')!, { target: { value: 'Mới' } });
    const nut = screen.getByRole('button', { name: NHAN_LUU_HO_SO });

    fireEvent.click(nut);
    await waitFor(() => {
      expect(m.soLan('PATCH', `/v1/du-an/${PJ}/ho-so`)).toBe(1);
      expect((nut as HTMLButtonElement).disabled).toBe(true);
    });
    fireEvent.click(nut);
    await doi(30);
    expect(m.soLan('PATCH', `/v1/du-an/${PJ}/ho-so`)).toBe(1);

    t.mo();
    await waitFor(() => {
      expect(dangKhoa(NHAN_LUU_HO_SO)).toBe(false);
    });
    // Đối chứng: nút còn đó thì phải bấm được; nếu form đã đóng thì mở lại.
    if (screen.queryByRole('button', { name: NHAN_LUU_HO_SO }) === null) {
      await userEvent.click(await screen.findByRole('button', { name: NHAN_SUA_HO_SO }));
      fireEvent.change(document.querySelector('[data-nhap="la_gi"]')!, { target: { value: 'Mới 2' } });
    }
    fireEvent.click(screen.getByRole('button', { name: NHAN_LUU_HO_SO }));
    await waitFor(() => {
      expect(m.soLan('PATCH', `/v1/du-an/${PJ}/ho-so`)).toBe(2);
    });
  });
});

describe('BAT-32 nhật ký: Ghi không gửi trùng', () => {
  it('bấm Ghi hai lần khi chưa trả lời ⇒ đúng 1 POST; sau khi trả lời, ghi lại ⇒ POST thứ hai', async () => {
    const t = treoLuotDau({ id: 'nk-1', luc: GIO, canh_bao: [] });
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-nhat-ky', {
        than: { items: [], cursor_sau: null, nhom_theo_ngay: [], bay_gio: GIO },
      })
      .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/agent', { than: { items: [], cursor_sau: null } })
      .dat('POST /v1/nhat-ky', t.tra)
      .gan();
    dung(<TrangNhatKy />, '/nhat-ky');
    await userEvent.click(await screen.findByRole('button', { name: NHAN_GHI_DONG }));
    const dien = (a: string, b: string): void => {
      fireEvent.change(document.querySelector('[data-nhap="quyet-dinh"]')!, { target: { value: a } });
      fireEvent.change(document.querySelector('[data-nhap="vi-sao"]')!, { target: { value: b } });
    };
    dien('Chốt D1', 'Rẻ nhất');
    const nut = screen.getByRole('button', { name: NHAN_GUI_DONG });

    fireEvent.click(nut);
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/nhat-ky')).toBe(1);
      expect((nut as HTMLButtonElement).disabled).toBe(true);
    });
    fireEvent.click(nut);
    await doi(30);
    expect(m.soLan('POST', '/v1/nhat-ky')).toBe(1);

    t.mo();
    await waitFor(() => {
      expect(document.querySelector<HTMLTextAreaElement>('[data-nhap="quyet-dinh"]')!.value).toBe('');
    });
    dien('Chốt D2', 'Vì D2');
    await waitFor(() => {
      expect(dangKhoa(NHAN_GUI_DONG)).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_DONG }));
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/nhat-ky')).toBe(2);
    });
  });
});

describe('BAT-32 Luật chung: Lưu không gửi trùng', () => {
  it('bấm Lưu hai lần khi chưa trả lời ⇒ đúng 1 PUT; sau khi trả lời, Lưu lại ⇒ PUT thứ hai', async () => {
    const t = treoLuotDau({ workspace_id: 'ws', da_doi: ['checklist'] });
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-ban-do', {
        than: {
          bay_gio: GIO,
          du_an: [],
          luat_chung: { danh_sach_cam: null, checklist: null, cap_nhat_luc: null },
          so_con_lai: 0,
        },
      })
      .dat('PUT /v1/luat-chung', t.tra)
      .gan();
    dung(<TrangBanDo />, '/ban-do-du-an');
    await userEvent.click(await screen.findByRole('button', { name: NHAN_SUA_LUAT_CHUNG }));
    fireEvent.change(document.querySelector('[data-nhap="checklist"]')!, { target: { value: 'Bản 1' } });
    const nut = screen.getByRole('button', { name: NHAN_LUU_LUAT_CHUNG });

    fireEvent.click(nut);
    await waitFor(() => {
      expect(m.soLan('PUT', '/v1/luat-chung')).toBe(1);
      expect((nut as HTMLButtonElement).disabled).toBe(true);
    });
    fireEvent.click(nut);
    await doi(30);
    expect(m.soLan('PUT', '/v1/luat-chung')).toBe(1);

    t.mo();
    await waitFor(() => {
      expect(dangKhoa(NHAN_LUU_LUAT_CHUNG)).toBe(false);
    });
    if (screen.queryByRole('button', { name: NHAN_LUU_LUAT_CHUNG }) === null) {
      await userEvent.click(await screen.findByRole('button', { name: NHAN_SUA_LUAT_CHUNG }));
      fireEvent.change(document.querySelector('[data-nhap="checklist"]')!, { target: { value: 'Bản 2' } });
    }
    fireEvent.click(screen.getByRole('button', { name: NHAN_LUU_LUAT_CHUNG }));
    await waitFor(() => {
      expect(m.soLan('PUT', '/v1/luat-chung')).toBe(2);
    });
  });
});

describe('BAT-32 phiên: Dừng không gửi trùng', () => {
  it('bấm Dừng hai lần khi chưa trả lời ⇒ đúng 1 POST; sau khi trả lời, bấm lại ⇒ POST thứ hai', async () => {
    const t = treoLuotDau({ ok: true });
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-phien/ph-1', { than: manHinhPhien() })
      .dat('POST /v1/phien/ph-1/dung', t.tra)
      .gan();
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    const nut = await screen.findByRole('button', { name: 'Dừng' });

    fireEvent.click(nut);
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/phien/ph-1/dung')).toBe(1);
      expect((nut as HTMLButtonElement).disabled).toBe(true);
    });
    fireEvent.click(nut);
    await doi(30);
    expect(m.soLan('POST', '/v1/phien/ph-1/dung')).toBe(1);

    t.mo();
    await waitFor(() => {
      expect(dangKhoa('Dừng')).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dừng' }));
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/phien/ph-1/dung')).toBe(2);
    });
  });
});

/*
 * BAT-32 (sửa) — chốt ĐỒNG BỘ. `isPending` đọc từ lần vẽ trước (react-query báo đổi
 * qua setTimeout 0), nên hai sự kiện bấm trong CÙNG một nhịp lọt qua chốt `isPending`.
 * Hai `fireEvent.click` liền nhau, không await xen giữa ⇒ nút chưa kịp `disabled`;
 * chỉ chốt `useRef` (src/mot-lan.ts) mới giữ được: đúng một lệnh gọi máy chủ.
 */
describe('BAT-32 chốt đồng bộ: hai click liền nhau trong cùng một nhịp', () => {
  it('Gửi lỗi: hai click đồng bộ ⇒ đúng 1 POST', async () => {
    const t = treoLuotDau({ id: 'ld-1', ngay: '2025-10-09' });
    const m = new MayChuGia()
      .dat(`GET /v1/du-an/${PJ}/ho-so`, { than: hoSo() })
      .dat(`POST /v1/du-an/${PJ}/loi-da-gap`, t.tra)
      .gan();
    dung(<TrangHoSoDuAn id={PJ} />, `/du-an/${PJ}/ho-so`);
    await userEvent.click(await screen.findByRole('button', { name: NHAN_THEM_LOI }));
    fireEvent.change(document.querySelector('[data-nhap="loi"]')!, { target: { value: 'Lỗi A' } });
    const nut = screen.getByRole('button', { name: NHAN_GUI_LOI });

    fireEvent.click(nut);
    fireEvent.click(nut); // liền sau, đồng bộ: nút chưa kịp disabled
    await waitFor(() => {
      expect(m.soLan('POST', `/v1/du-an/${PJ}/loi-da-gap`)).toBe(1);
    });
    await doi(30);
    expect(m.soLan('POST', `/v1/du-an/${PJ}/loi-da-gap`)).toBe(1);
    t.mo();
  });

  it('Gửi lỗi: máy chủ trả lỗi ⇒ chốt được thả, bấm lại được (POST thứ hai)', async () => {
    let lan = 0;
    const m = new MayChuGia()
      .dat(`GET /v1/du-an/${PJ}/ho-so`, { than: hoSo() })
      .dat(`POST /v1/du-an/${PJ}/loi-da-gap`, () => {
        lan += 1;
        return lan === 1
          ? { loi: { error: 'X', message: 'hỏng' }, http: 500 }
          : { than: { id: 'ld-2', ngay: '2025-10-09' } };
      })
      .gan();
    dung(<TrangHoSoDuAn id={PJ} />, `/du-an/${PJ}/ho-so`);
    await userEvent.click(await screen.findByRole('button', { name: NHAN_THEM_LOI }));
    fireEvent.change(document.querySelector('[data-nhap="loi"]')!, { target: { value: 'Lỗi A' } });

    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_LOI }));
    await waitFor(() => {
      expect(m.soLan('POST', `/v1/du-an/${PJ}/loi-da-gap`)).toBe(1);
    });
    await waitFor(() => {
      expect(dangKhoa(NHAN_GUI_LOI)).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: NHAN_GUI_LOI }));
    await waitFor(() => {
      expect(m.soLan('POST', `/v1/du-an/${PJ}/loi-da-gap`)).toBe(2);
    });
  });

  it('Ghi nhật ký: hai click đồng bộ ⇒ đúng 1 POST', async () => {
    const t = treoLuotDau({ id: 'nk-1', luc: GIO, canh_bao: [] });
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-nhat-ky', {
        than: { items: [], cursor_sau: null, nhom_theo_ngay: [], bay_gio: GIO },
      })
      .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/agent', { than: { items: [], cursor_sau: null } })
      .dat('POST /v1/nhat-ky', t.tra)
      .gan();
    dung(<TrangNhatKy />, '/nhat-ky');
    await userEvent.click(await screen.findByRole('button', { name: NHAN_GHI_DONG }));
    fireEvent.change(document.querySelector('[data-nhap="quyet-dinh"]')!, { target: { value: 'Chốt D1' } });
    fireEvent.change(document.querySelector('[data-nhap="vi-sao"]')!, { target: { value: 'Rẻ nhất' } });
    const nut = screen.getByRole('button', { name: NHAN_GUI_DONG });

    fireEvent.click(nut);
    fireEvent.click(nut);
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/nhat-ky')).toBe(1);
    });
    await doi(30);
    expect(m.soLan('POST', '/v1/nhat-ky')).toBe(1);
    t.mo();
  });

  it('Dừng phiên: hai click đồng bộ ⇒ đúng 1 POST', async () => {
    const t = treoLuotDau({ ok: true });
    const m = new MayChuGia()
      .dat('GET /v1/man-hinh-phien/ph-1', { than: manHinhPhien() })
      .dat('POST /v1/phien/ph-1/dung', t.tra)
      .gan();
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    const nut = await screen.findByRole('button', { name: 'Dừng' });

    fireEvent.click(nut);
    fireEvent.click(nut);
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/phien/ph-1/dung')).toBe(1);
    });
    await doi(30);
    expect(m.soLan('POST', '/v1/phien/ph-1/dung')).toBe(1);
    t.mo();
  });
});
