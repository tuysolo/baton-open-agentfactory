/**
 * Khung dựng cho test của giao diện.
 *
 * ## `MayChuGia`: một bảng tra `"METHOD /duong"` → phản hồi
 *
 * Giao diện chỉ nói chuyện với máy chủ qua `fetch` (xem `src/api.ts`), nên giả
 * lập đúng ở đó là giả lập **toàn bộ** ranh giới, không hơn không kém. Hai điều
 * khung này giữ:
 *
 *   * **Đường không khai thì trượt bằng một lỗi nói rõ đường nào.** Không trả 404
 *     im lặng: một ca mà component gọi thêm một đường ngoài dự kiến phải **đỏ**,
 *     kèm tên đường, chứ không xanh với một màn hình thiếu dữ liệu.
 *   * **Mọi lời gọi được ghi lại.** Nhờ vậy ca ghim được "đã gọi đúng đường, đúng
 *     phương thức, đúng thân" — vd nút "Đăng xuất mọi nơi" gọi
 *     `/v1/dang-xuat-moi-noi`, không gọi `/v1/dang-xuat`.
 *
 * Thân lỗi dựng đúng hình của SPEC mục 13 (`{ error, message }`), vì đó là hình
 * mà `src/api.ts` phân tích.
 */

import type { ReactElement } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import { taoQueryClient } from '../src/query';
import { KhuToast } from '../src/vo/toast';

export interface LoiGoi {
  duong: string;
  method: string;
  than: unknown;
}

export interface TraLoi {
  http?: number;
  than?: unknown;
  /** Thân lỗi `{ error, message }` — dùng cho ca 4xx. */
  loi?: { error: string; message: string };
  /**
   * **`fetch` ném, không trả response** — mạng đứt giữa lúc máy chủ trả lời.
   *
   * Khác hẳn một mã lỗi: ở đây máy chủ **có thể đã làm xong việc** (huỷ phiên)
   * mà trình duyệt không nhận được câu trả lời. Đó là ca mà `onSettled` tồn tại
   * để xử, và không có nó thì không dựng được ca đó.
   */
  nem?: Error;
  /**
   * **Giữ phản hồi lại cho tới khi promise này xong** — để dựng được ca "máy chủ
   * CHƯA trả lời".
   *
   * Không có nó thì không ca nào đo được vế "hiện **ngay trước khi** server trả
   * lời" của d.408: máy chủ giả trả lời trong cùng một microtask, nên bản lạc
   * quan và bản thật không phân biệt được — ca sẽ xanh kể cả khi mã **không** có
   * cập nhật lạc quan nào.
   */
  cho?: Promise<unknown>;
}

export class MayChuGia {
  readonly da_goi: LoiGoi[] = [];
  private readonly bang = new Map<string, TraLoi | ((l: LoiGoi) => TraLoi)>();

  dat(khoa: string, tl: TraLoi | ((l: LoiGoi) => TraLoi)): this {
    this.bang.set(khoa, tl);
    return this;
  }

  /** Gắn vào `globalThis.fetch`. `don-dep.ts` tháo ra sau mỗi ca. */
  gan(): this {
    globalThis.fetch = ((duong: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const than: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const l: LoiGoi = { duong, method, than };
      this.da_goi.push(l);

      const tim = this.bang.get(`${method} ${duong}`);
      if (tim === undefined) {
        return Promise.reject(
          new Error(`MayChuGia: ca này không khai đường \`${method} ${duong}\``),
        );
      }
      const tl = typeof tim === 'function' ? tim(l) : tim;
      if (tl.nem !== undefined) return Promise.reject(tl.nem);
      const than_ra = tl.loi ?? tl.than ?? null;
      const http = tl.http ?? (tl.loi === undefined ? 200 : 400);
      const dap = (): Response =>
        new Response(JSON.stringify(than_ra), {
          status: http,
          headers: { 'content-type': 'application/json' },
        });
      return tl.cho === undefined ? Promise.resolve(dap()) : tl.cho.then(dap);
    }) as typeof globalThis.fetch;
    return this;
  }

  /** Số lần một đường được gọi — để ghim "gọi đúng một lần" hoặc "không gọi". */
  soLan(method: string, duong: string): number {
    return this.da_goi.filter((l) => l.method === method && l.duong === duong).length;
  }
}

/**
 * **`localStorage` GIẢ, trong bộ nhớ** — cho các ca "nhớ lựa chọn".
 *
 * Môi trường test **không có `localStorage` dùng được**: Node in thẳng
 * `localStorage is not available because --localstorage-file was not provided`,
 * nên `khoCucBo()` rơi về kho rỗng và mọi ca "nhớ" sẽ **xanh vì không nhớ gì**
 * (đọc ra mặc định, đúng bằng thứ ca mong đợi ở vài chỗ). Đó là một lưới mục.
 *
 * Nên ca nào kiểm vế "nhớ" thì gắn kho này vào `globalThis` — **mã sản phẩm
 * không có một seam nào cho test**, nó vẫn đi qua đúng `globalThis.localStorage`
 * như trên trình duyệt thật. Trả về `Map` để ca đọc được thứ đã ghi.
 */
let mo_ta_goc: PropertyDescriptor | undefined;
let da_gan_kho = false;

export function datKhoGia(): Map<string, string> {
  if (!da_gan_kho) {
    mo_ta_goc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    da_gan_kho = true;
  }
  const bang = new Map<string, string>();
  const gia: Storage = {
    getItem: (k) => bang.get(k) ?? null,
    setItem: (k, v) => {
      bang.set(k, String(v));
    },
    removeItem: (k) => {
      bang.delete(k);
    },
    clear: () => {
      bang.clear();
    },
    key: (i) => [...bang.keys()][i] ?? null,
    get length() {
      return bang.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: gia });
  return bang;
}

/**
 * Tháo kho giả, trả `globalThis.localStorage` về **đúng** hình cũ (kể cả ca "cũ
 * là không có thuộc tính nào"). `don-dep.ts` gọi sau **mỗi** ca.
 *
 * Vitest cô lập theo file nên hôm nay không rò sang file khác, nhưng một kho giả
 * ở lại trên `globalThis` là đúng loại trạng thái mà `don-dep.ts` tồn tại để
 * dọn — và nó sẽ che mất ca "môi trường không có `localStorage`" nếu một ca sau
 * trong **cùng file** cần đúng ca đó.
 */
export function thaoKhoGia(): void {
  if (!da_gan_kho) return;
  if (mo_ta_goc === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else Object.defineProperty(globalThis, 'localStorage', mo_ta_goc);
  da_gan_kho = false;
  mo_ta_goc = undefined;
}

/** Thân `GET /v1/toi` của một chủ đã đăng nhập. */
export const TOI_CHU = { loai: 'chu', workspace_id: 'ws-test', phien_het_luc: 9_999_999_999 };

/** Thân 401 mà cổng xác thực của Worker trả khi không có phiên (mục 13, 15). */
export const LOI_401 = {
  error: 'INVALID_TOKEN',
  message: 'Thiếu token. Gửi header `Authorization: Bearer <token>`.',
};

/** Thân 401 của `/v1/dang-nhap` khi sai mật khẩu **hoặc** sai mã TOTP. */
export const LOI_DANG_NHAP_SAI = {
  error: 'INVALID_TOKEN',
  message: 'Mật khẩu hoặc mã xác thực không đúng.',
};

/**
 * Dựng cây. Trả thêm `qc` để ca test **đo được chính cache**, không chỉ đo DOM.
 *
 * Cần thiết cho luật "đăng xuất thì bỏ dữ liệu của chủ khỏi cache": sau khi đăng
 * xuất, vỏ bị tháo nên dữ liệu cũ **biến khỏi DOM dù cache còn nguyên** — một ca
 * chỉ đọc DOM là tautology ở đúng chỗ đó (đã đo bằng đột biến: nó sống sót).
 */
export function dung(
  cay: ReactElement,
  duong_dau = '/',
): RenderResult & { qc: QueryClient } {
  const qc = taoQueryClient();
  return {
    /*
     * `KhuToast` bọc trong khung dựng vì **vỏ thật cũng bọc nó** (`App.tsx`), và
     * vì `useToast` **ném** khi thiếu provider (fail-loud, xem `vo/toast.tsx`):
     * một ca quên bọc sẽ đỏ với một lỗi không nói gì về luật đang kiểm.
     */
    ...render(
      <MemoryRouter initialEntries={[duong_dau]}>
        <QueryClientProvider client={qc}>
          <KhuToast>{cay}</KhuToast>
        </QueryClientProvider>
      </MemoryRouter>,
    ),
    qc,
  };
}
