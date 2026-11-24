/**
 * **Trang đăng nhập và cổng vào vỏ** — SPEC mục 15 d.415–416.
 *
 * Ba luật được canh ở đây:
 *   * chưa có phiên (`/v1/toi` → 401) ⇒ thấy **trang đăng nhập**, và **không một
 *     mảnh nào** của vỏ được dựng;
 *   * sai mật khẩu hoặc sai mã TOTP ⇒ hiện **câu tiếng Việt của máy chủ**, vẫn ở
 *     trang đăng nhập;
 *   * đúng cả hai ⇒ vào vỏ (sidebar hiện ra), và cả hai yếu tố đi trong **một**
 *     request tới `/v1/dang-nhap`.
 */

import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, CAU_DANG_TAI } from '../src/App';
import { CAU_LOI_KHONG_RO } from '../src/api';
import { NHAN_MAT_KHAU, NHAN_MA_TOTP, NHAN_NUT, NHAN_TIEU_DE } from '../src/trang/dang-nhap';
/*
 * **Hai nút đăng xuất nay ở MENU của tên workspace** — SPEC mục 14 d.401 ("hai
 * nút này không nằm trần trên thanh trên"), đổi ở BAT-6 đợt 3 phần B. Nên nhãn
 * nhập từ `vo/sidebar.tsx`, và mọi ca phải **mở menu** trước khi bấm — xem
 * `bamDangXuat`.
 */
import {
  NHAN_DANG_XUAT,
  NHAN_DANG_XUAT_MOI_NOI,
  TEN_WORKSPACE,
} from '../src/vo/sidebar';
import {
  CAU_HOI_DANG_XUAT_MOI_NOI,
  NHAN_HUY,
  NHAN_XAC_NHAN_DANG_XUAT,
} from '../src/vo/xac-nhan-dang-xuat';
import { LOI_401, LOI_DANG_NHAP_SAI, MayChuGia, TOI_CHU, dung } from './giup';

/** Mở menu tên workspace rồi bấm một trong hai nút đăng xuất (d.401). */
async function bamDangXuat(nhan: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: TEN_WORKSPACE }));
  await userEvent.click(screen.getByRole('menuitem', { name: nhan }));
}

/** Thân rỗng cho hai đường mà sidebar của vỏ gọi khi đã vào được. */
function themDuongCuaVo(may: MayChuGia): MayChuGia {
  return may
    .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
    .dat('GET /v1/can-chu', {
      than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null, so_theo_muc: {} } },
    });
}

describe('chưa đăng nhập', () => {
  it('`/v1/toi` trả 401 ⇒ thấy trang đăng nhập', async () => {
    new MayChuGia().dat('GET /v1/toi', { http: 401, loi: LOI_401 }).gan();
    dung(<App />);
    expect(await screen.findByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
  });

  it('`/v1/toi` trả 401 ⇒ KHÔNG lọt vào vỏ: không sidebar, không nút đăng xuất', async () => {
    /*
     * Ca phủ định dựng để đỏ thật: `MayChuGia` **không** khai `/v1/du-an` và
     * `/v1/can-chu`. Nên nếu vỏ lọt ra dù chỉ một nhịp, sidebar sẽ gọi hai đường
     * đó và máy chủ giả **trượt kèm tên đường** — chứ không im lặng.
     */
    const may = new MayChuGia().dat('GET /v1/toi', { http: 401, loi: LOI_401 }).gan();
    dung(<App />);
    await screen.findByRole('heading', { name: NHAN_TIEU_DE });

    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
    // Nút mở menu workspace (chỗ hai nút đăng xuất ở, d.401) cũng không có.
    expect(screen.queryByRole('button', { name: TEN_WORKSPACE })).toBeNull();
    expect(may.soLan('GET', '/v1/du-an?limit=200')).toBe(0);
    expect(may.soLan('GET', '/v1/can-chu')).toBe(0);
  });

  it('403 (d.416: token agent gọi `/v1/toi`) cũng ra trang đăng nhập, không ra vỏ', async () => {
    new MayChuGia()
      .dat('GET /v1/toi', {
        http: 403,
        loi: {
          error: 'FORBIDDEN',
          message: 'Agent không đăng nhập web; dùng token và /v1/whoami.',
        },
      })
      .gan();
    dung(<App />);
    expect(await screen.findByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
  });

  it('`/v1/toi` trả 200 nhưng THÂN LẠ ⇒ vẫn ra trang đăng nhập, không vào vỏ', async () => {
    /*
     * Nửa thứ hai của điều kiện fail-closed: không phải mọi "không có phiên" đều
     * đến dưới dạng một mã lỗi. Một bản API cũ, một proxy chen vào, hay một lượt
     * sau đổi hình thân `/v1/toi` đều cho **200** với một thân không mang
     * `loai: 'chu'`. Vỏ chỉ được dựng khi thân **đọc được và đúng hình**.
     *
     * Máy chủ giả cố ý **không** khai `/v1/du-an` và `/v1/can-chu`, nên vỏ lọt ra
     * dù một nhịp là trượt kèm tên đường.
     */
    const may = new MayChuGia()
      .dat('GET /v1/toi', { than: { loai: 'agent', workspace_id: 'ws-test' } })
      .gan();
    dung(<App />);
    expect(await screen.findByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
    expect(may.soLan('GET', '/v1/du-an?limit=200')).toBe(0);
  });

  it('`/v1/toi` trả 200 với thân RỖNG ⇒ vẫn ra trang đăng nhập', async () => {
    new MayChuGia().dat('GET /v1/toi', { than: null }).gan();
    dung(<App />);
    expect(await screen.findByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
  });

  it('trong lúc chờ `/v1/toi` thì hiện "Đang tải", không hiện vỏ', () => {
    // Không bao giờ trả lời — giữ query ở `pending`.
    globalThis.fetch = () => new Promise<Response>(() => undefined);
    dung(<App />);
    expect(screen.getByRole('status').textContent).toBe(CAU_DANG_TAI);
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
  });
});

describe('nộp biểu mẫu đăng nhập', () => {
  it('sai mật khẩu/TOTP ⇒ hiện đúng câu tiếng Việt của MÁY CHỦ, vẫn ở trang đăng nhập', async () => {
    const may = new MayChuGia()
      .dat('GET /v1/toi', { http: 401, loi: LOI_401 })
      .dat('POST /v1/dang-nhap', { http: 401, loi: LOI_DANG_NHAP_SAI })
      .gan();
    dung(<App />);
    await screen.findByRole('heading', { name: NHAN_TIEU_DE });

    await userEvent.type(screen.getByLabelText(NHAN_MAT_KHAU), 'mat-khau-sai-12');
    await userEvent.type(screen.getByLabelText(NHAN_MA_TOTP), '000000');
    await userEvent.click(screen.getByRole('button', { name: NHAN_NUT }));

    const canh = await screen.findByRole('alert');
    /*
     * `toBe`, không `toContain`: câu phải là **nguyên văn** của máy chủ. Nếu giao
     * diện tự ghép thêm ("Sai mã TOTP?") thì nó đang đoán **cái nào** sai — đúng
     * thứ mà một thông điệp lỗi duy nhất ở tầng máy chủ tồn tại để che.
     */
    expect(canh.textContent).toBe(LOI_DANG_NHAP_SAI.message);
    expect(screen.getByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
    expect(may.soLan('POST', '/v1/dang-nhap')).toBe(1);
  });

  it('bị khoá (429) ⇒ hiện câu của máy chủ, không tự viết câu khác', async () => {
    new MayChuGia()
      .dat('GET /v1/toi', { http: 401, loi: LOI_401 })
      .dat('POST /v1/dang-nhap', {
        http: 429,
        loi: {
          error: 'RATE_LIMITED',
          message: 'Quá nhiều lần đăng nhập sai. Thử lại sau.',
        },
      })
      .gan();
    dung(<App />);
    await screen.findByRole('heading', { name: NHAN_TIEU_DE });
    await userEvent.type(screen.getByLabelText(NHAN_MAT_KHAU), 'mat-khau-dung-1');
    await userEvent.type(screen.getByLabelText(NHAN_MA_TOTP), '123456');
    await userEvent.click(screen.getByRole('button', { name: NHAN_NUT }));

    const canh = await screen.findByRole('alert');
    expect(canh.textContent).toBe('Quá nhiều lần đăng nhập sai. Thử lại sau.');
  });

  it('máy chủ không trả thân hiểu được ⇒ câu dự phòng duy nhất', async () => {
    new MayChuGia()
      .dat('GET /v1/toi', { http: 401, loi: LOI_401 })
      .dat('POST /v1/dang-nhap', { http: 502, than: null })
      .gan();
    dung(<App />);
    await screen.findByRole('heading', { name: NHAN_TIEU_DE });
    await userEvent.type(screen.getByLabelText(NHAN_MAT_KHAU), 'mat-khau-dung-1');
    await userEvent.type(screen.getByLabelText(NHAN_MA_TOTP), '123456');
    await userEvent.click(screen.getByRole('button', { name: NHAN_NUT }));

    const canh = await screen.findByRole('alert');
    expect(canh.textContent).toBe(CAU_LOI_KHONG_RO);
  });

  it('đúng cả hai lớp ⇒ vào vỏ, và hai yếu tố đi trong MỘT request', async () => {
    let da_dang_nhap = false;
    const may = themDuongCuaVo(
      new MayChuGia()
        .dat('GET /v1/toi', () =>
          da_dang_nhap ? { than: TOI_CHU } : { http: 401, loi: LOI_401 },
        )
        .dat('POST /v1/dang-nhap', () => {
          da_dang_nhap = true;
          return { than: { dang_nhap: true, het_luc: 9_999_999_999 } };
        }),
    ).gan();

    dung(<App />);
    await screen.findByRole('heading', { name: NHAN_TIEU_DE });

    await userEvent.type(screen.getByLabelText(NHAN_MAT_KHAU), 'mat-khau-that-123');
    await userEvent.type(screen.getByLabelText(NHAN_MA_TOTP), '123456');
    await userEvent.click(screen.getByRole('button', { name: NHAN_NUT }));

    // Vào vỏ: sidebar và hai nút đăng xuất của d.415.
    expect(
      await screen.findByRole('navigation', { name: 'Điều hướng chính' }),
    ).toBeTruthy();
    // d.401: hai nút nằm **trong menu của tên workspace**, không trần trên thanh trên.
    expect(screen.queryByRole('menuitem', { name: NHAN_DANG_XUAT })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: TEN_WORKSPACE }));
    expect(screen.getByRole('menuitem', { name: NHAN_DANG_XUAT })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: NHAN_DANG_XUAT_MOI_NOI })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: NHAN_TIEU_DE })).toBeNull();

    // **Một** request mang cả hai yếu tố (`cau-hoi-spec.md` #99).
    const goi = may.da_goi.filter((l) => l.duong === '/v1/dang-nhap');
    expect(goi.length).toBe(1);
    expect(goi[0]?.than).toEqual({ mat_khau: 'mat-khau-that-123', ma_totp: '123456' });
  });
});

describe('đăng xuất — d.415 "có nút đăng xuất mọi nơi"', () => {
  /** Dựng sẵn một vỏ đã đăng nhập; `con_phien` điều khiển `/v1/toi` về sau. */
  async function voDaDangNhap(): Promise<{ may: MayChuGia; tat: () => void }> {
    let con_phien = true;
    const may = themDuongCuaVo(
      new MayChuGia()
        .dat('GET /v1/toi', () =>
          con_phien ? { than: TOI_CHU } : { http: 401, loi: LOI_401 },
        )
        .dat('POST /v1/dang-xuat', { than: { da_dang_xuat: true, so_phien_da_huy: 1 } })
        .dat('POST /v1/dang-xuat-moi-noi', {
          than: { da_dang_xuat: true, so_phien_da_huy: 3 },
        }),
    ).gan();
    dung(<App />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    return {
      may,
      tat: () => {
        con_phien = false;
      },
    };
  }

  it('"Đăng xuất" gọi `/v1/dang-xuat` (một máy) rồi về trang đăng nhập', async () => {
    const { may, tat } = await voDaDangNhap();
    tat();
    await bamDangXuat(NHAN_DANG_XUAT);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
    });
    expect(may.soLan('POST', '/v1/dang-xuat')).toBe(1);
    // Hai việc, hai đường: nút này **không** được chạm đường "mọi nơi".
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(0);
  });

  it('"Đăng xuất mọi nơi" (sau xác nhận) gọi ĐÚNG `/v1/dang-xuat-moi-noi`, không gọi đường một máy', async () => {
    const { may, tat } = await voDaDangNhap();
    tat();
    await bamDangXuat(NHAN_DANG_XUAT_MOI_NOI);
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_DANG_XUAT }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
    });
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(1);
    expect(may.soLan('POST', '/v1/dang-xuat')).toBe(0);
  });

  it('menu: bấm "Đăng xuất mọi nơi" KHÔNG gọi API; "Huỷ" không gọi; "Xác nhận" gọi đúng một lần', async () => {
    const { may, tat } = await voDaDangNhap();
    const nut = screen.getByRole('button', { name: TEN_WORKSPACE });

    // Bấm mục → chỉ hiện bước xác nhận, chưa gọi gì.
    await bamDangXuat(NHAN_DANG_XUAT_MOI_NOI);
    expect(screen.getByText(CAU_HOI_DANG_XUAT_MOI_NOI)).toBeTruthy();
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(0);
    expect(may.soLan('POST', '/v1/dang-xuat')).toBe(0);

    // Huỷ → đóng hẳn, focus về nút tên workspace, không gọi gì.
    await userEvent.click(screen.getByRole('button', { name: NHAN_HUY }));
    expect(screen.queryByText(CAU_HOI_DANG_XUAT_MOI_NOI)).toBeNull();
    expect(document.activeElement).toBe(nut);
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(0);

    // `Escape` ở bước xác nhận cũng đóng, trả focus, không gọi gì.
    await bamDangXuat(NHAN_DANG_XUAT_MOI_NOI);
    expect(
      screen.getByRole('group', { name: NHAN_DANG_XUAT_MOI_NOI }).contains(document.activeElement),
    ).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(CAU_HOI_DANG_XUAT_MOI_NOI)).toBeNull();
    expect(document.activeElement).toBe(nut);
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(0);

    // Xác nhận → gọi đúng đường "mọi nơi" đúng một lần.
    tat();
    await bamDangXuat(NHAN_DANG_XUAT_MOI_NOI);
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_DANG_XUAT }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
    });
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(1);
    expect(may.soLan('POST', '/v1/dang-xuat')).toBe(0);
  });

  it('menu: "Đăng xuất mọi nơi" trượt (5xx) ⇒ câu lỗi hiện ở bước xác nhận, không im lặng', async () => {
    new MayChuGia()
      .dat('GET /v1/toi', { than: TOI_CHU })
      .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/can-chu', {
        than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null, so_theo_muc: {} } },
      })
      .dat('POST /v1/dang-xuat-moi-noi', { http: 502, than: null })
      .gan();
    dung(<App />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    await bamDangXuat(NHAN_DANG_XUAT_MOI_NOI);
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_DANG_XUAT }));

    // Đọc trong tấm xác nhận: trang Tổng quan phía sau có `alert` riêng của nó
    // (máy chủ giả không khai đường của trang ấy).
    const tam = screen.getByRole('group', { name: NHAN_DANG_XUAT_MOI_NOI });
    const canh = await within(tam).findByRole('alert');
    expect(canh.textContent).toBe(CAU_LOI_KHONG_RO);
    // Phiên còn sống (`/v1/toi` vẫn 200) ⇒ vẫn ở trong vỏ.
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();
  });

  it('máy chủ ĐÃ huỷ phiên rồi mạng đứt lúc trả lời ⇒ VẪN về trang đăng nhập', async () => {
    /*
     * Ca này là lý lẽ duy nhất của `onSettled` (thay vì `onSuccess`) ở
     * `thanh-tren.tsx`, và lượt trước nó **không có ca nào** — reviewer đo được
     * đột biến `onSettled`→`onSuccess` **sống sót**. Đây là ca giết nó.
     *
     * Dựng đúng trạng thái: `POST /v1/dang-xuat` **ném** (mạng đứt), nhưng phiên
     * ở máy chủ **đã** bị huỷ trước đó — nên `/v1/toi` từ lúc này trả 401. Với
     * `onSuccess`, mutation lỗi ⇒ không ai hỏi lại `/v1/toi` ⇒ chủ ngồi trong một
     * cái vỏ đầy dữ liệu của một phiên đã chết.
     */
    let con_phien = true;
    const may = themDuongCuaVo(
      new MayChuGia()
        .dat('GET /v1/toi', () =>
          con_phien ? { than: TOI_CHU } : { http: 401, loi: LOI_401 },
        )
        .dat('POST /v1/dang-xuat', () => {
          // Thứ tự đúng với thực tế: máy chủ làm xong việc, rồi đường truyền chết.
          con_phien = false;
          return { nem: new Error('mạng đứt khi đang trả lời') };
        }),
    ).gan();
    dung(<App />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    await bamDangXuat(NHAN_DANG_XUAT);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
    });
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
    // Và `/v1/toi` thật sự được hỏi lại sau lần bấm (không phải vỏ tự biến mất).
    expect(may.soLan('GET', '/v1/toi')).toBeGreaterThan(1);
  });

  it('dữ liệu của chủ bị bỏ khỏi cache khi đăng xuất, không vẽ lại ở lần sau', async () => {
    /*
     * Vế thứ hai của `onSettled`: `removeQueries` cho mọi khoá **trừ** `['toi']`.
     * Nếu giữ cache, lần đăng nhập sau sẽ vẽ ngay danh sách dự án cũ trước khi
     * đọc lại — dữ liệu của một phiên đã chết hiện trên màn hình.
     */
    let con_phien = true;
    new MayChuGia()
      .dat('GET /v1/toi', () => (con_phien ? { than: TOI_CHU } : { http: 401, loi: LOI_401 }))
      .dat('GET /v1/du-an?limit=200', {
        than: {
          items: [
            { id: 'id-A', ma: 'A', ten: 'Dự án cũ của chủ', trang_thai: 'active', nhom: 'N' },
          ],
          cursor_sau: null,
        },
      })
      .dat('GET /v1/can-chu', {
        than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null, so_theo_muc: {} } },
      })
      .dat('POST /v1/dang-xuat', () => {
        con_phien = false;
        return { than: { da_dang_xuat: true, so_phien_da_huy: 1 } };
      })
      .gan();
    const { qc } = dung(<App />);
    expect(await screen.findByText('Dự án cũ của chủ')).toBeTruthy();
    // Dữ liệu **đang** trong cache trước khi đăng xuất — nửa đối chứng của ca.
    expect(qc.getQueryData(['du-an'])).toBeDefined();

    await bamDangXuat(NHAN_DANG_XUAT);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: NHAN_TIEU_DE })).toBeTruthy();
    });

    /*
     * Đo **cache**, không đo DOM. Sau khi đăng xuất thì vỏ bị tháo, nên
     * `queryByText('Dự án cũ của chủ')` là `null` **dù cache còn nguyên** — một ca
     * chỉ đọc DOM ở đây sống sót đột biến "bỏ `removeQueries`" (đã đo).
     */
    expect(qc.getQueryData(['du-an'])).toBeUndefined();
    expect(qc.getQueryData(['can-chu', 'huy-hieu'])).toBeUndefined();
    // Nhưng `['toi']` **phải** còn: nó là khoá được hỏi lại để đưa chủ ra ngoài.
    expect(qc.getQueryState(['toi'])).toBeDefined();
  });
});
