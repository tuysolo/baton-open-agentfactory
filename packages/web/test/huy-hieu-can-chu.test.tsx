/**
 * **Huy hiệu "Cần Chủ" của sidebar nói đúng** — SPEC mục 14 d.391 (huy hiệu) +
 * d.410 ("thay đổi do agent tạo hiện lên trong vòng 3 giây, **không cần tải lại
 * trang**").
 *
 * Lỗi chủ gặp khi dùng thật: xử lý xong mục Chờ cuối cùng trên trang Cần Chủ,
 * màn hình trống, mà huy hiệu đỏ **(1)** ở sidebar **vẫn còn** — chỉ mất khi tải
 * lại trang. Hai nguyên nhân, nên hai ca:
 *
 *   (d) query huy hiệu không bị `invalidate` khi một mục được xử lý (mutation
 *       invalidate theo hai khoá đầy đủ, bỏ sót `['can-chu','huy-hieu']`);
 *   (e) query huy hiệu **không có nhịp** nào: một mục do agent tạo khi chủ đang ở
 *       trang khác thì con số không bao giờ lên.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import { NHAN_GUI, TrangCanChu } from '../src/trang/can-chu';
import { Sidebar } from '../src/vo/sidebar';
import { MayChuGia, dung } from './giup';
import { DA_XU_LY_RONG, DU_AN_RONG, MAN_HINH_RONG, manHinh, the } from './than-can-chu';

afterEach(() => {
  vi.useRealTimers();
});

function huyHieu(): Element | null {
  return document.querySelector('[data-huy-hieu="can-chu"]');
}

describe('d.391 + d.410 — huy hiệu Cần Chủ đúng ngay, và đúng theo nhịp', () => {
  it('(d) xử lý mục Chờ CUỐI CÙNG ⇒ huy hiệu biến đi, không cần tải lại trang', async () => {
    /*
     * Kho của máy chủ giả: một mục Chờ, và đường ghi làm nó **hết** — nên
     * `huy_hieu.so_cho` của lượt đọc sau là 0 (`manHinh()` tự đếm từ thẻ, nên
     * fixture không thể nói "còn 1 mục" trong khi khối đã rỗng).
     */
    const kho = { man: manHinh({ urgent: [the({ ma: 'T-1' })] }) };
    new MayChuGia()
      .dat('GET /v1/can-chu', () => ({ than: kho.man }))
      .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .dat('POST /v1/can-chu/ct-T-1/xu-ly', () => {
        kho.man = MAN_HINH_RONG;
        return {};
      })
      .gan();

    const u = userEvent.setup();
    // Sidebar **và** trang trong cùng một `QueryClient` — đúng hình của vỏ thật
    // (`App.tsx`): đó là điều kiện để một lần `invalidate` của trang chạm tới
    // query của sidebar.
    dung(
      <>
        <Sidebar />
        <TrangCanChu />
      </>,
      '/can-chu',
    );

    await waitFor(() => {
      expect(huyHieu()?.textContent).toBe('1');
    });

    const the_dom = document.querySelector<HTMLElement>('[data-the="T-1"]');
    expect(the_dom).not.toBeNull();
    await u.click(within(the_dom as HTMLElement).getByRole('button', { name: NHAN_GUI.fyi }));

    /*
     * `waitFor` mặc định chờ **1 giây**, ngắn hơn một chu kỳ (2 giây): nên ca này
     * **không thể** xanh nhờ nhịp hỏi vòng — nó chỉ xanh nếu mutation invalidate
     * đúng khoá huy hiệu. Đã đo bằng đột biến: đổi `onSettled` về hai khoá đầy đủ
     * (`k_man`, `k_da`) thì ca này đỏ, mọi ca khác vẫn xanh.
     */
    await waitFor(() => {
      expect(huyHieu()).toBeNull();
    });
  });

  it('(e) máy chủ báo thêm mục ⇒ huy hiệu LÊN theo nhịp, không cần tải lại trang', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const kho = { man: MAN_HINH_RONG };
    new MayChuGia()
      .dat('GET /v1/can-chu', () => ({ than: kho.man }))
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .gan();

    dung(<Sidebar />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    // Không có mục Chờ ⇒ không có huy hiệu (số 0 là một con số không nói gì).
    await waitFor(() => {
      expect(huyHieu()).toBeNull();
    });

    // Agent tạo hai mục. Không một cú bấm nào, không dựng lại cây.
    kho.man = manHinh({ urgent: [the({ ma: 'T-7' })], today: [the({ ma: 'T-8' })] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);
    });
    await waitFor(() => {
      expect(huyHieu()?.textContent).toBe('2');
    });
  });
});
