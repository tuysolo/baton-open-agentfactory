/**
 * @baton/client — client HTTP mỏng, dùng chung cho CLI `baton` và MCP server
 * (SPEC mục 13: ba đường CLI / MCP / API cùng một bộ quyền).
 *
 * Lượt này chỉ là **chỗ cắm**: kiểu request/response chung + `batonFetch`.
 * Các lệnh cụ thể làm ở phần 5.
 */

import { BatonError, laMaLoi, type ThanLoi } from '@baton/shared';

export interface CauHinhClient {
  /** Gốc API, lấy từ biến môi trường `BATON_URL` (SPEC mục 13). */
  baseUrl: string;
  /** Token agent, lấy từ `BATON_TOKEN`. **Không bao giờ in ra** (SPEC mục 13). */
  token: string;
  /** Hàm fetch thay thế (test dùng fetch giả lập). */
  fetch?: typeof fetch;
}

export interface YeuCauBaton {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Đường dẫn tương đối, vd `/v1/tickets`. */
  path: string;
  /** Tham số query; giá trị `undefined` bị bỏ qua. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Thân JSON. */
  body?: unknown;
  /** Chờ dài: lệnh `--wait` tới 60 giây (SPEC mục 13). */
  signal?: AbortSignal;
}

/** Giới hạn chờ dài của SPEC mục 13 (giây). */
export const CHO_DAI_TOI_DA_GIAY = 60;

function ghepUrl(baseUrl: string, path: string, query: YeuCauBaton['query']): string {
  const url = new URL(path.replace(/^\/+/, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * Gọi API Baton. Lỗi dạng `{ error, message }` (SPEC mục 13 d.384) được dựng lại
 * thành `BatonError` để CLI in mã lỗi và chọn mã thoát đúng.
 *
 * **Lỗi hạ tầng ra `INTERNAL`, tức mã thoát 2.** Hai ca đi nhánh này: HTTP
 * **≥ 500**, và thân phản hồi **không** phải dạng lỗi Baton (một gateway hay CDN
 * trả HTML). Bản đầu dựng `INVALID_INPUT` cho ca thứ hai, tức **mã thoát 1 "lỗi
 * nghiệp vụ"** — đúng cái hại mà `decisions.md` 01/10 viện ra để đẩy `INTERNAL`
 * lên mã 2: "ra mã 1 thì agent tưởng dữ liệu mình gửi sai và đi sửa dữ liệu
 * mãi". Một `502` kèm HTML không phải lỗi dữ liệu của người gọi, và thử lại y
 * nguyên là việc đúng nên làm.
 *
 * `≥ 500` **có** thân đúng dạng Baton vẫn ra `INTERNAL`, nhưng **giữ thông điệp**
 * của máy chủ: HTTP 5xx nói "phía tôi hỏng" bất kể mã trong thân là gì, nên lấy
 * mã thân (vd một `NOT_FOUND` trả kèm 500) sẽ cho mã thoát 1 sai nghĩa.
 */
export async function batonFetch<T>(cauHinh: CauHinhClient, yeuCau: YeuCauBaton): Promise<T> {
  const f = cauHinh.fetch ?? fetch;
  const headers: Record<string, string> = {
    authorization: `Bearer ${cauHinh.token}`,
    accept: 'application/json',
  };
  if (yeuCau.body !== undefined) headers['content-type'] = 'application/json';

  const init: RequestInit = { method: yeuCau.method, headers };
  if (yeuCau.body !== undefined) init.body = JSON.stringify(yeuCau.body);
  if (yeuCau.signal !== undefined) init.signal = yeuCau.signal;

  const res = await f(ghepUrl(cauHinh.baseUrl, yeuCau.path, yeuCau.query), init);

  if (!res.ok) {
    const than = (await res.json().catch(() => null)) as Partial<ThanLoi> | null;
    if (than && laMaLoi(than.error)) {
      if (res.status < 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        throw new BatonError(than.error, {
          ...(than.message !== undefined ? { message: than.message } : {}),
          ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
        });
      }
      throw new BatonError('INTERNAL', {
        ...(than.message !== undefined ? { message: than.message } : {}),
      });
    }
    throw new BatonError('INTERNAL', {
      message: `Máy chủ trả mã ${String(res.status)} không đúng dạng lỗi Baton.`,
    });
  }

  // 204 không có thân: trả `undefined` cho những lệnh chỉ cần biết đã thành công.
  if (res.status === 204) return undefined as T;
  return await res.json<T>();
}
