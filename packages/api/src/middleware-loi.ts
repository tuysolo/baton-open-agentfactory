/**
 * Biến `BatonError` thành response đúng dạng SPEC mục 13:
 *   `{ "error": "<CODE>", "message": "<thông điệp tiếng Việt>" }`
 * cùng mã HTTP của mã lỗi, và header `Retry-After` khi là 429.
 */

import type { Context, ErrorHandler, MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import { BatonError, type ThanLoi } from '@baton/shared';
import {
  cfRayHopLe,
  dinhDanhDeLog,
  ghiDongLoi,
  loaiBangChungDeLog,
  moTaLoi,
} from './nhat-ky-loi.js';

/** Dựng response lỗi từ một `BatonError`. */
export function phanHoiLoi(c: Context, loi: BatonError): Response {
  const than: ThanLoi = loi.than();
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (loi.http === 429) {
    // SPEC mục 13: 429 **kèm** `Retry-After`. Không có giá trị thì mặc định 60s.
    headers['retry-after'] = String(loi.retryAfter ?? 60);
  }
  return c.newResponse(JSON.stringify(than), { status: loi.http as 400, headers });
}

/**
 * `app.onError(...)`. Lỗi không phải `BatonError` không bao giờ lộ chi tiết ra
 * ngoài (SPEC mục 15): trả mã **riêng** `INTERNAL` / **500** và ghi log phía
 * server.
 *
 * Vì sao không tái dùng `INVALID_INPUT`: mã đó là 422 "lỗi nghiệp vụ", nên CLI
 * thoát **mã 1** và agent hiểu là "dữ liệu tôi gửi sai, sửa rồi gửi lại". Lỗi
 * máy chủ phải ra **mã 2** "lỗi xác thực hoặc mạng" (SPEC mục 13 bảng mã thoát)
 * để agent thử lại hoặc báo người, thay vì sửa dữ liệu vô ích.
 */
export const xuLyLoi: ErrorHandler = (err, c) => {
  if (BatonError.la(err) && err.ma !== 'INTERNAL') return phanHoiLoi(c, err);

  /*
   * **Lỗi lạ, hoặc `INTERNAL` đã dựng sẵn** (vd `goiLenh` thấy cửa ghi trả HTTP
   * khác 200 — trước BAT-65 nhánh đó không được log ở đâu cả): ghi một dòng có
   * cấu trúc, rồi trả `INTERNAL`/500. Xem `nhat-ky-loi.ts`.
   */
  const ray = cfRayHopLe(c.req.header('cf-ray'));
  ghiDongLoi(dongLoiInternal(err, c, ray));

  // Dùng thông điệp của `INTERNAL` (mặc định, hoặc thông điệp đã đặt của một
  // `BatonError('INTERNAL')`): không ghép chi tiết lỗi gốc vào thân response
  // (SPEC mục 15). Chỉ nối **mã tra log** khi request có `cf-ray` hợp lệ — mã đó
  // là của Cloudflare, không phải của lỗi, và nó là thứ duy nhất người dùng cần
  // để chủ tìm đúng dòng log.
  const goc = BatonError.la(err) ? err : new BatonError('INTERNAL');
  const tra = ray === null ? goc : new BatonError('INTERNAL', {
    message: `${goc.message} (mã tra log: ${ray})`,
  });
  return phanHoiLoi(c, tra);
};

/**
 * Dòng log `loi_internal`. **Chỉ** những trường dưới đây — không header nào
 * ngoài `cf-ray`, không token, không thân request, không nội dung bằng chứng.
 */
function dongLoiInternal(err: unknown, c: Context, ray: string | null): Record<string, unknown> {
  /*
   * Mẫu route của **route cuối cùng khớp** (`routePath(c, -1)`), không phải của
   * chặng đang chạy: lỗi ném trong middleware `*` (vd `xacThuc`) vẫn cho biết
   * request định đi đường nào. Không khớp route nào (chỉ còn `*`) thì dùng
   * pathname — **không** kèm query.
   */
  let mau = '';
  try {
    mau = routePath(c, -1);
  } catch {
    mau = '';
  }
  const duong = mau !== '' && !mau.includes('*') ? mau : c.req.path;

  // `ticket` chỉ có nghĩa ở route của ticket; id của agent/dự án không gán nhầm tên.
  let ticket: string | null = null;
  if (duong.startsWith('/v1/ticket/:id')) ticket = dinhDanhDeLog(c.req.param('id'));
  else if (duong.endsWith('/ticket/ma/:ma')) ticket = dinhDanhDeLog(c.req.param('ma'));

  const bien = c.get('loai_bang_chung') as unknown;

  return {
    su_kien: 'loi_internal',
    method: c.req.method,
    duong: dinhDanhDeLog(duong),
    ticket,
    loai_bang_chung: loaiBangChungDeLog(bien),
    ray,
    ...moTaLoi(err),
    chi_tiet: BatonError.la(err) ? (err.chiTiet ?? null) : null,
  };
}

/**
 * Bắt luôn cả lỗi ném trong middleware chạy trước `onError` của Hono.
 * Dùng khi muốn chắc mọi đường ra đều đúng dạng `{ error, message }`.
 *
 * `BatonError` đi qua **cùng** `xuLyLoi`, để một `INTERNAL` lọt tới đây cũng
 * được log như ở `onError`.
 */
export const batLoi: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (err) {
    if (BatonError.la(err)) return xuLyLoi(err, c);
    throw err;
  }
  return undefined;
};

/** `app.notFound(...)`: 404 cũng phải đúng dạng thân lỗi của SPEC mục 13. */
export const khongTimThay = (c: Context): Response =>
  phanHoiLoi(c, new BatonError('NOT_FOUND'));
