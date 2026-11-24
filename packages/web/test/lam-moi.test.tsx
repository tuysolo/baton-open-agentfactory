/**
 * **Nhịp làm mới êm** — `src/lam-moi.ts`, `src/vo/dau-lam-moi.tsx`.
 *
 * SPEC: mục 14 d.410 ("thay đổi do agent tạo hiện lên trong vòng 3 giây, không
 * cần tải lại trang") và d.408 ("sau lần tải đầu, chuyển trang không có màn hình
 * chờ toàn trang").
 *
 * Lượt này sinh từ hai lỗi chủ gặp khi dùng thật:
 *   1. mỗi lượt refetch (2 giây một lần) hiện một dòng "Đang làm mới…" rồi mất,
 *      nên nội dung bị đẩy lên xuống liên tục;
 *   2. huy hiệu "Cần Chủ" ở sidebar **cũ**: xử lý xong mục cuối mà số đỏ vẫn còn.
 *
 * Năm điều các ca dưới canh — và cả năm đều **đo được bằng hành vi**, không bằng
 * cách đọc lại một hằng của mã:
 *   (a) đã có dữ liệu + đang refetch ⇒ **không** một chữ "Đang làm mới…" nào;
 *   (b) lượt tải chậm quá ngưỡng ⇒ dấu hiện, và **ô dành sẵn vẫn là một ô** (nội
 *       dung bên dưới không bị đẩy);
 *   (c) tab ẩn ⇒ **không** gọi máy chủ theo nhịp; quay lại ⇒ gọi **đúng một lần**;
 *   (d) quay lại tab chỉ làm mới đường đọc **có nhịp** — một dòng báo cáo (bất
 *       biến, cố ý không có nhịp) **không** bị kéo theo;
 *   (e) trang có **hai** query ⇒ mỗi đường đọc đúng **một** lượt; tháo rồi dựng
 *       lại ⇒ vẫn đúng một lượt (không rò, không mất đăng ký);
 *   (f) ô dấu dành sẵn có mặt ở **mọi trang có nhịp**, không riêng Tổng quan;
 *   (g) đổi bộ lọc ⇒ danh sách cũ **vẫn trên màn hình**, không nháy trống.
 *
 * Lỗi (2) — huy hiệu — ở `test/huy-hieu-can-chu.test.tsx`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import { useNhipLamMoi } from '../src/lam-moi';
import { CHU_KY_LAM_MOI_MS, NGUONG_HIEN_DAU_LAM_MOI_MS } from '../src/hang-so';
import { CAU_DANG_LAM_MOI } from '../src/vo/dau-lam-moi';
import { TrangTongQuan } from '../src/trang/tong-quan';
import { TrangBaoCao } from '../src/trang/bao-cao';
import { TrangCanChu } from '../src/trang/can-chu';
import { TrangDoiAgent } from '../src/trang/doi-agent';
import { TrangBanDo } from '../src/trang/ban-do';
import { TrangDanhSachTicket } from '../src/trang/danh-sach-ticket';
import { KHOA_LOC_TICKET } from '../src/loc-ticket';
import { batDauSua, ketThucSua } from '../src/so-dem-sua';
import { Sidebar } from '../src/vo/sidebar';
import { MayChuGia, dung } from './giup';
import { TONG_QUAN_RONG } from './than-tong-quan';
import { DA_XU_LY_RONG, DU_AN_RONG, manHinh, the } from './than-can-chu';
import { doiAgent, agentDong } from './than-agent';
import { THAN_AGENT, THAN_DU_AN, dong, manHinhDanhSach } from './than-ticket';
import { hienThayDoiTuSpec } from './doc-spec';

/* ------------------------------------------------------------------ *
 * Khung dựng
 * ------------------------------------------------------------------ */

/** Đổi `document.visibilityState` — không có setter thật, nên định nghĩa lại. */
function datHienThi(v: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => v,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  // Trả tab về `visible` **và** bắn lại sự kiện: `focusManager` của TanStack
  // Query đọc thẳng `document.visibilityState`, nên một ca bỏ tab ở `hidden` sẽ
  // làm mọi ca sau đứng im mà không ai hiểu vì sao.
  datHienThi('visible');
  vi.useRealTimers();
});

function ô(): Element | null {
  return document.querySelector('[data-dau-lam-moi]');
}

/* ================================================================== *
 * 0. Hai ngưỡng — ghim bằng số CẮT TỪ SPEC
 * ================================================================== */

describe('ngưỡng: chu kỳ theo d.410, dấu chỉ cho lượt chậm bất thường', () => {
  it('chu kỳ hỏi lại NGẮN HƠN mốc 3 giây của d.410 (số cắt từ SPEC.md)', () => {
    expect(CHU_KY_LAM_MOI_MS).toBeLessThan(hienThayDoiTuSpec().giay * 1000);
    expect(CHU_KY_LAM_MOI_MS).toBeGreaterThan(0);
  });

  it('ngưỡng hiện dấu NHỎ HƠN chu kỳ: một lượt lành không bao giờ chạm tới', () => {
    expect(NGUONG_HIEN_DAU_LAM_MOI_MS).toBeGreaterThan(0);
    expect(NGUONG_HIEN_DAU_LAM_MOI_MS).toBeLessThan(CHU_KY_LAM_MOI_MS);
  });
});

/* ================================================================== *
 * (a) + (b) Refetch nền im lặng; chỉ lượt chậm mới có dấu
 * ================================================================== */

describe('d.408/d.410 — refetch nền IM LẶNG, dấu chỉ cho lượt chậm', () => {
  /**
   * Dựng trang Tổng quan, rồi **giữ** lượt refetch kế lại để đo.
   *
   * Trả `tra()` để nhả phản hồi: không có nó thì máy chủ giả trả lời trong cùng
   * một microtask và trạng thái "đang tải lần hai" không bao giờ quan sát được.
   */
  async function dungRoiTreoLuotSau(): Promise<{ tra: () => void }> {
    new MayChuGia().dat('GET /v1/tong-quan', { than: TONG_QUAN_RONG }).gan();
    dung(<TrangTongQuan />);
    // Khối **đầu** của Tổng quan là "Dự án" từ BAT-6 đợt 3 (SPEC mục 11 d.316).
    await screen.findByRole('region', { name: 'Dự án' });

    let tra = (): void => undefined;
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
    return { tra: () => tra() };
  }

  it('(a) đã có dữ liệu + đang refetch ⇒ KHÔNG có chữ "Đang làm mới…"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { tra } = await dungRoiTreoLuotSau();

    // Một nhịp của chu kỳ đi qua ⇒ lượt refetch bắt đầu (và đang treo).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 10);
    });

    /*
     * Đúng thứ chủ báo: màn hình **im**. Ca này là ca đỏ của bản cũ (bản cũ hiện
     * dòng đó ngay khi `isFetching` bật), nên nó không phải một ca tautology.
     */
    expect(screen.queryByText(CAU_DANG_LAM_MOI)).toBeNull();
    // Và năm khối vẫn ở đó — không màn hình chờ toàn trang (d.408).
    expect(document.querySelectorAll('[data-khoi]').length).toBe(5);
    tra();
  });

  it('(b) lượt tải chậm quá ngưỡng ⇒ dấu hiện, trong ĐÚNG ô dành sẵn đó', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { tra } = await dungRoiTreoLuotSau();

    const truoc = ô();
    expect(truoc).not.toBeNull();
    expect(truoc?.getAttribute('data-dau-lam-moi')).toBe('khong');
    const lop_truoc = truoc?.className;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 10);
    });
    // Chưa tới ngưỡng: vẫn im.
    expect(screen.queryByText(CAU_DANG_LAM_MOI)).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NGUONG_HIEN_DAU_LAM_MOI_MS + 10);
    });

    // Tới ngưỡng: dấu hiện.
    expect(screen.getByText(CAU_DANG_LAM_MOI)).toBeTruthy();

    /*
     * **Bố cục không đổi** — vế "không đẩy nội dung" của lượt này.
     *
     * jsdom không bày bố cục (mọi chiều cao là 0), nên đo pixel ở đây là đo một
     * con số bịa. Thứ đo được và thật sự là luật: ô là **cùng một phần tử**, vẫn
     * ở **cùng chỗ** trong cây, với **cùng lớp chiều cao cố định** — chỉ nội dung
     * bên trong đổi. Một bản `{hien ? <p/> : null}` (bản cũ) làm ca này đỏ: lúc
     * im thì không có phần tử nào.
     */
    const sau = ô();
    expect(sau).toBe(truoc);
    expect(sau?.className).toBe(lop_truoc);
    expect(sau?.getAttribute('data-dau-lam-moi')).toBe('co');
    expect(lop_truoc).toContain('h-4');
    // Năm khối vẫn nằm **sau** ô dấu, không bị thay bằng màn hình chờ.
    expect(document.querySelectorAll('[data-khoi]').length).toBe(5);

    // Thân về ⇒ dấu tắt, ô vẫn còn đó.
    await act(async () => {
      tra();
      await vi.advanceTimersByTimeAsync(10);
    });
    await waitFor(() => {
      expect(screen.queryByText(CAU_DANG_LAM_MOI)).toBeNull();
    });
    expect(ô()).toBe(truoc);
  });
});

/* ================================================================== *
 * (c) Tab ẩn
 * ================================================================== */

describe('tab ẩn: không hỏi máy chủ; quay lại: hỏi ĐÚNG MỘT lần', () => {
  it('(c) ẩn tab ⇒ nhịp không gọi API; về `visible` ⇒ gọi đúng một lần ngay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const m = new MayChuGia().dat('GET /v1/tong-quan', { than: TONG_QUAN_RONG }).gan();
    dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: 'Dự án' });
    expect(m.soLan('GET', '/v1/tong-quan')).toBe(1);

    datHienThi('hidden');
    // Ba chu kỳ trôi qua trong lúc tab ẩn.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS * 3 + 50);
    });
    /*
     * Không một request nào. Đây là ca ghim `refetchIntervalInBackground: false`
     * của `src/query.ts`: nó đang là mặc định của thư viện, nên nếu một lượt sau
     * đặt nó thành `true` "cho chắc ăn", ca này đỏ.
     */
    expect(m.soLan('GET', '/v1/tong-quan')).toBe(1);

    // Quay lại tab: **một** lượt ngay, không chờ hết chu kỳ.
    await act(async () => {
      datHienThi('visible');
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(m.soLan('GET', '/v1/tong-quan')).toBe(2);
  });
});

describe('BAT-26 — cổng sổ đếm S/P/L chỉ chặn khoá `ticket`', () => {
  it('(c2) tong > 0: khoá KHÔNG phải `ticket` (Tổng quan) vẫn được làm mới khi quay lại tab', async () => {
    const m = new MayChuGia().dat('GET /v1/tong-quan', { than: TONG_QUAN_RONG }).gan();
    const { qc } = dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: 'Dự án' });
    expect(m.soLan('GET', '/v1/tong-quan')).toBe(1);

    batDauSua(qc, 'tk-SAI-1'); // một thao tác S/P/L đang bay ở đâu đó
    act(() => {
      datHienThi('visible');
    });
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/tong-quan')).toBe(2);
    });
    ketThucSua(qc, 'tk-SAI-1');
  });
});

describe('BAT-27 — cổng quay lại tab thu hẹp theo thẻ (d.418, d.420)', () => {
  const KHOA_DS = ['ticket', 'man-hinh', 'loc'] as const;
  const KHOA_A = ['ticket', 'chi-tiet', 'BAT-1'] as const;
  const KHOA_B = ['ticket', 'chi-tiet', 'BAT-2'] as const;
  const dem = { ds: 0, a: 0, b: 0 };

  function BaKhoa(): React.JSX.Element {
    useQuery({ queryKey: KHOA_DS, queryFn: () => ({ n: ++dem.ds }) });
    useQuery({ queryKey: KHOA_A, queryFn: () => ({ n: ++dem.a }) });
    useQuery({ queryKey: KHOA_B, queryFn: () => ({ n: ++dem.b }) });
    useNhipLamMoi(false, [KHOA_DS, KHOA_A, KHOA_B]);
    return <p>ba khoá</p>;
  }

  async function dungVaChoXong(): Promise<ReturnType<typeof dung>> {
    dem.ds = 0;
    dem.a = 0;
    dem.b = 0;
    const r = dung(<BaKhoa />);
    await waitFor(() => {
      expect(dem).toEqual({ ds: 1, a: 1, b: 1 });
    });
    return r;
  }

  it('S/P/L treo trên thẻ A ⇒ quay lại tab: chi tiết thẻ B được tải lại; chi tiết A và danh sách thì không', async () => {
    const { qc } = await dungVaChoXong();

    batDauSua(qc, 'id-A', 'BAT-1');
    act(() => {
      datHienThi('visible');
    });
    await waitFor(() => {
      expect(dem.b).toBe(2);
    });
    expect(dem.a).toBe(1);
    expect(dem.ds).toBe(1);
    ketThucSua(qc, 'id-A');
  });

  it('mã thẻ chưa biết (thẻ không có trong cache) ⇒ chặn mọi chi tiết (an toàn)', async () => {
    const { qc } = await dungVaChoXong();

    batDauSua(qc, 'id-la'); // chưa có mã
    act(() => {
      datHienThi('visible');
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(dem).toEqual({ ds: 1, a: 1, b: 1 });
    ketThucSua(qc, 'id-la');
  });

  it('không có S/P/L nào bay ⇒ cả ba khoá đều được tải lại', async () => {
    await dungVaChoXong();
    act(() => {
      datHienThi('visible');
    });
    await waitFor(() => {
      expect(dem).toEqual({ ds: 2, a: 2, b: 2 });
    });
  });
});

/* ================================================================== *
 * (d) Quay lại tab chỉ chạm đường đọc CÓ NHỊP
 * ================================================================== */

const NGAY_BC = '2026-10-06';
const BAO_CAO_SANG = {
  ngay: NGAY_BC,
  loai: 'sang',
  nhan_loai: 'Báo cáo sáng',
  tao_luc: 1_760_000_000_000,
  noi_dung_md: `# Báo cáo sáng — ${NGAY_BC}\n`,
  du_lieu: {
    ngay: NGAY_BC,
    tao_luc: 1_760_000_000_000,
    can_chu: { so_cho: 0, so_theo_muc: { urgent: 0, today: 0, later: 0 }, gap_nhat: [] },
    trong_tam: [],
    hom_qua: { ngay: '2026-10-05', viec: [] },
    dang_chay: [],
    rui_ro_va_lech: [],
    quyet_dinh_moi: [],
  },
};

describe('quay lại tab: chỉ làm mới đường đọc CÓ NHỊP', () => {
  it('(d) danh sách báo cáo (có nhịp) được gọi lại; MỘT DÒNG báo cáo (bất biến) thì KHÔNG', async () => {
    /*
     * Ca này canh đúng chỗ bản đầu của lượt BAT-3 làm sai: hook gọi
     * `invalidateQueries({ refetchType: 'active' })` **không khoá**, nên nó khớp
     * mọi query trong cache. `trang/bao-cao.tsx` cố ý **không** cho một dòng
     * `bao_cao` nhịp nào ("một dòng báo cáo là bất biến"), và chuyển tab rồi quay
     * lại là một lượt tải lại nó — một request vô ích cho một thứ không đổi được.
     *
     * Trang Báo cáo là ca duy nhất dựng được cả hai vế trong **một** cây: một
     * đường đọc có nhịp (`['bao-cao', 'ds']`) và một đường đọc cố ý không có
     * (`['bao-cao', ngay, loai]`).
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const m = new MayChuGia()
      .dat('GET /v1/bao-cao', {
        than: {
          items: [
            { ngay: NGAY_BC, loai: 'sang', nhan_loai: 'Báo cáo sáng', tao_luc: 1_760_000_000_000 },
          ],
          cursor_sau: null,
        },
      })
      .dat(`GET /v1/bao-cao/${NGAY_BC}/sang`, { than: BAO_CAO_SANG })
      .dat('GET /v1/trong-tam', { than: { ngay: NGAY_BC, muc: [] } })
      .gan();

    dung(<TrangBaoCao />);
    // Chờ **cả hai** đường đã về: danh sách ngày, rồi dòng báo cáo của ngày đó.
    await waitFor(() => {
      expect(m.soLan('GET', `/v1/bao-cao/${NGAY_BC}/sang`)).toBe(1);
    });
    const ds_truoc = m.soLan('GET', '/v1/bao-cao');
    const mot_truoc = m.soLan('GET', `/v1/bao-cao/${NGAY_BC}/sang`);
    expect(ds_truoc).toBe(1);
    expect(mot_truoc).toBe(1);

    datHienThi('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS * 2);
    });
    await act(async () => {
      datHienThi('visible');
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(m.soLan('GET', '/v1/bao-cao')).toBe(ds_truoc + 1);
    // Vế then chốt: dòng báo cáo **không** bị kéo theo.
    expect(m.soLan('GET', `/v1/bao-cao/${NGAY_BC}/sang`)).toBe(mot_truoc);
  });
});

/* ================================================================== *
 * (e) Một listener, một lượt cho mỗi đường đọc — kể cả sau khi dựng lại
 * ================================================================== */

/** Máy chủ giả cho trang Cần Chủ — **hai** đường đọc có nhịp. */
function mayCanChu(): MayChuGia {
  const man = manHinh({ urgent: [the({ ma: 'T-1' })] });
  return new MayChuGia()
    .dat('GET /v1/can-chu', () => ({ than: man }))
    .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
    .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
    .gan();
}

describe('trang có HAI query: quay lại tab gọi mỗi đường ĐÚNG MỘT lần', () => {
  it('(e1) hai đường đọc, mỗi đường thêm đúng một lượt — không một đường nào gọi hai lần', async () => {
    /*
     * Ca (c) chỉ dùng trang Tổng quan (**một** query), nên nó không nói gì về
     * trang nhiều query. Ở đây: ba khoá có nhịp, hai chỗ gọi hook, và mỗi khoá
     * phải thêm **đúng một** lượt.
     *
     * ## Giới hạn đã đo của ca này — đọc trước khi "dọn" sổ `WeakMap`
     *
     * Ca này **không** phân biệt được "một listener cho mỗi QueryClient" với "một
     * listener cho mỗi hook": đã thử đột biến (bỏ hẳn phép tra sổ, mỗi hook tự
     * gắn một listener) và cả 14 ca **vẫn xanh**. Lý do thật: TanStack Query gộp
     * các lượt `refetch` đang bay của **cùng một** query, nên hai listener bắn
     * cùng một nhịp vẫn ra đúng một request. Sổ đăng ký vì vậy là chuyện *gọn và
     * không rò*, không phải chuyện hành vi — và hành vi là thứ ca này ghim. Đừng
     * thêm một ca đếm listener bằng cách nhòm `addEventListener`: `focusManager`
     * của TanStack cũng gắn đúng sự kiện đó, nên con số ấy không nói được của ai.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const m = mayCanChu();
    /*
     * Sidebar **cùng** trang trong một cây — đúng hình của vỏ thật (`App.tsx`):
     * **hai** chỗ gọi hook, ba khoá có nhịp. Chỉ một trang thì ca này xanh kể cả
     * khi mỗi hook tự gắn một listener.
     */
    dung(
      <>
        <Sidebar />
        <TrangCanChu />
      </>,
      '/can-chu',
    );
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).not.toBeNull();
    });
    const man_truoc = m.soLan('GET', '/v1/can-chu');
    const da_truoc = m.soLan('GET', '/v1/can-chu/da-xu-ly');
    const du_an_truoc = m.soLan('GET', '/v1/du-an?limit=200');

    datHienThi('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS * 2);
    });
    await act(async () => {
      datHienThi('visible');
      await vi.advanceTimersByTimeAsync(10);
    });

    /*
     * `+2` cho `/v1/can-chu`: **hai khoá khác nhau** đi cùng một đường — màn hình
     * (`['can-chu','man-hinh',loc]`) và huy hiệu (`['can-chu','huy-hieu']`). Mỗi
     * khoá đúng một lượt; `+3` hay `+4` là dấu hiệu một khoá bị gọi hai lần.
     */
    expect(m.soLan('GET', '/v1/can-chu')).toBe(man_truoc + 2);
    expect(m.soLan('GET', '/v1/can-chu/da-xu-ly')).toBe(da_truoc + 1);
    /*
     * Và `['du-an']` (danh sách lựa chọn bộ lọc — đổi **theo chủ**, không theo
     * agent, nên cố ý không có nhịp) **không** bị kéo theo.
     */
    expect(m.soLan('GET', '/v1/du-an?limit=200')).toBe(du_an_truoc);
  });

  it('(e2) dựng → tháo → dựng lại: vẫn đúng một lượt khi quay lại tab', async () => {
    /*
     * Bắt hai lỗi của sổ đăng ký: (1) **rò** — người cuối rời đi mà listener còn
     * lại, nên lần dựng sau có hai listener; (2) **mất đăng ký** — `delete` sổ rồi
     * lần dựng sau không gắn lại, nên quay lại tab chẳng làm gì.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const m = mayCanChu();

    dung(<TrangCanChu />, '/can-chu');
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).not.toBeNull();
    });
    // Tháo cả cây — `dung()` tạo một `QueryClient` mới cho lần dựng sau, nên ca
    // này cũng ghim "sổ của client cũ không giữ gì lại".
    cleanup();

    dung(<TrangCanChu />, '/can-chu');
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-1"]')).not.toBeNull();
    });
    const man_truoc = m.soLan('GET', '/v1/can-chu');

    datHienThi('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS * 2);
    });
    await act(async () => {
      datHienThi('visible');
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(m.soLan('GET', '/v1/can-chu')).toBe(man_truoc + 1);
  });
});

/* ================================================================== *
 * (f) Ô dấu dành sẵn có ở MỌI trang có nhịp
 * ================================================================== */

describe('ô dấu dành sẵn: mọi trang có nhịp, không riêng Tổng quan', () => {
  /*
   * Không có ca này thì một lượt sau đổi **một** trang về `{hien ? <p/> : null}`
   * và bố cục trang đó xô lại mỗi hai giây mà **không ca nào đỏ** — ca (b) chỉ
   * canh trang Tổng quan.
   */
  const trang: { ten: string; dung: () => void; cho: () => Promise<unknown> }[] = [
    {
      ten: 'Tổng quan',
      dung: () => {
        new MayChuGia().dat('GET /v1/tong-quan', { than: TONG_QUAN_RONG }).gan();
        dung(<TrangTongQuan />);
      },
      cho: () => screen.findByRole('region', { name: 'Dự án' }),
    },
    {
      ten: 'Cần Chủ',
      dung: () => {
        mayCanChu();
        dung(<TrangCanChu />, '/can-chu');
      },
      cho: () =>
        waitFor(() => {
          expect(document.querySelector('[data-the="T-1"]')).not.toBeNull();
        }),
    },
    {
      ten: 'Đội agent',
      dung: () => {
        new MayChuGia()
          .dat('GET /v1/man-hinh-agent', {
            than: doiAgent([agentDong({ id: 'ag-a' })]),
          })
          .gan();
        dung(<TrangDoiAgent />);
      },
      cho: () =>
        waitFor(() => {
          expect(document.querySelector('[data-agent="ag-a"]')).not.toBeNull();
        }),
    },
    {
      ten: 'Bản đồ dự án',
      dung: () => {
        new MayChuGia()
          .dat('GET /v1/man-hinh-ban-do', {
            than: {
              bay_gio: 1_760_000_000_000,
              du_an: [],
              luat_chung: { danh_sach_cam: null, checklist: null, cap_nhat_luc: null },
              so_con_lai: 0,
            },
          })
          .gan();
        dung(<TrangBanDo />, '/ban-do-du-an');
      },
      cho: () => screen.findByRole('heading', { name: 'Bản đồ dự án' }),
    },
    {
      ten: 'Danh sách ticket',
      dung: () => {
        new MayChuGia()
          .dat('GET /v1/du-an?limit=200', { than: THAN_DU_AN })
          .dat('GET /v1/agent', { than: THAN_AGENT })
          .dat('GET /v1/man-hinh-ticket', {
            than: manHinhDanhSach([dong({ ma: 'SAI-1' })]),
          })
          .gan();
        dung(<TrangDanhSachTicket />, '/ticket');
      },
      // Tiêu đề trang "mọi dự án" nay là nhãn sidebar của d.392 ("Tất cả việc").
      cho: () => screen.findByRole('heading', { name: /Tất cả việc|ticket/i }),
    },
  ];

  for (const t of trang) {
    it(`(f) ${t.ten}: ô dấu có mặt, và ở trạng thái IM (không chữ)`, async () => {
      t.dung();
      await t.cho();
      const o = ô();
      expect(o).not.toBeNull();
      // Có mặt **khi đang im** — đó là vế mà một `null` có điều kiện làm đỏ.
      expect(o?.getAttribute('data-dau-lam-moi')).toBe('khong');
      expect(o?.className).toContain('h-4');
      expect(screen.queryByText(CAU_DANG_LAM_MOI)).toBeNull();
    });
  }
});

/* ================================================================== *
 * (g) Đổi bộ lọc KHÔNG nháy danh sách — `keepPreviousData`
 * ================================================================== */

describe('d.408 — đổi bộ lọc: danh sách cũ VẪN trên màn hình trong lúc tải', () => {
  it('(g) danh sách ticket: đổi ô lọc trạng thái ⇒ không một nhịp trống nào', async () => {
    /*
     * Đổi bộ lọc là đổi `queryKey`, và một khoá mới chưa có cache nghĩa là `data`
     * thành `undefined` **một nhịp** — danh sách trắng rồi mọc lại. `keepPreviousData`
     * (`NHIP_LAM_MOI_DANH_SACH`) là chỗ chặn, và trước lượt này **không ca nào**
     * ghim nó.
     *
     * Lượt đọc sau khi đổi lọc bị **giữ treo**, nếu không thì máy chủ giả trả lời
     * trong cùng một microtask và trạng thái "đang tải khoá mới" không quan sát
     * được — ca sẽ xanh kể cả khi không giữ bản cũ.
     */
    const u = userEvent.setup();
    let tra = (): void => undefined;
    let treo = false;
    const than = manHinhDanhSach([dong({ ma: 'SAI-1' })]);

    new MayChuGia()
      .dat('GET /v1/du-an?limit=200', { than: THAN_DU_AN })
      .dat('GET /v1/agent', { than: THAN_AGENT })
      .gan();
    const goc = globalThis.fetch;
    globalThis.fetch = ((duong: string, init?: RequestInit) => {
      if (!duong.startsWith('/v1/man-hinh-ticket')) return goc(duong, init);
      const dap = (): Response =>
        new Response(JSON.stringify(than), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (!treo) return Promise.resolve(dap());
      return new Promise<Response>((res) => {
        tra = (): void => {
          res(dap());
        };
      });
    }) as typeof globalThis.fetch;

    // `?xem=danh-sach` tường minh: kiểu mặc định nay là **Bảng** (d.403), và ca
    // này đọc dòng của kiểu danh sách (`[data-ticket=…]`).
    dung(<TrangDanhSachTicket />, '/ticket?xem=danh-sach');
    await waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });

    treo = true;
    // Ô lọc nằm trong menu "Lọc" (d.407 — thanh lọc không mở sẵn).
    await u.click(screen.getByRole('button', { name: /^Lọc/ }));
    const o = document.querySelector<HTMLSelectElement>(
      `[data-loc="${KHOA_LOC_TICKET.trang_thai}"]`,
    );
    expect(o).not.toBeNull();
    await u.selectOptions(o as HTMLSelectElement, 'done');

    // Khoá mới, lượt đọc còn treo — mà dòng cũ **vẫn còn**.
    expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    tra();
    await waitFor(() => {
      expect(document.querySelector('[data-ticket="SAI-1"]')).not.toBeNull();
    });
  });
});

/*
 * Hai vế còn lại của lượt này — huy hiệu "Cần Chủ" đúng ngay sau mutation và lên
 * theo nhịp — ở `test/huy-hieu-can-chu.test.tsx`: chúng đo **sidebar**, không đo
 * nhịp của một trang.
 */

