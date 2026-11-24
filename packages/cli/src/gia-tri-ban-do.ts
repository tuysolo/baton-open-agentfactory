/**
 * Đổi **chữ người gõ** của `baton project set` / `baton ticket set` (SPEC 20.1)
 * thành giá trị JSON mà API nhận.
 *
 * Khoảng và thông điệp lỗi **không** viết lại ở đây: số gõ vào đi qua đúng hàm
 * kiểm của `@baton/shared` (`kiemUuTienDuAn`, `kiemKhoiLon`, `kiemDoi`), nên CLI,
 * MCP và máy chủ nói cùng một câu "… phải là số nguyên a–b". Chữ không phải số
 * nguyên được chuyển **nguyên** cho hàm kiểm để nó báo đúng câu đó.
 */

import { BatonError, laTrangThaiBanDo, TRANG_THAI_BAN_DO, type TrangThaiBanDo } from '@baton/shared';

/** Bốn giá trị cờ `--trang-thai` (SPEC 20.8) — gạch ngang, đúng chữ CLI của SPEC. */
export const GIA_TRI_CO_TRANG_THAI = TRANG_THAI_BAN_DO.map((t) => t.replace('_', '-'));

/**
 * `--trang-thai dang-day|hang-cho|tam-dung|duy-tri` (20.8) → giá trị API
 * (`dang_day`…, gạch dưới). Khác ⇒ `INVALID_INPUT` liệt kê bốn giá trị.
 */
export function trangThaiBanDo(tho: string): TrangThaiBanDo {
  const api = tho.replace('-', '_');
  if (!tho.includes('_') && laTrangThaiBanDo(api)) return api;
  throw new BatonError('INVALID_INPUT', {
    message: `--trang-thai chỉ nhận ${GIA_TRI_CO_TRANG_THAI.join(', ')} (nhận được "${tho}").`,
  });
}

/** `"5"` → `5`; chữ không phải số nguyên (kể cả `"2.5"`, `"abc"`, `""`) → giữ nguyên chữ. */
export function soNguyenHoacChu(tho: string): number | string {
  return /^-?\d+$/.test(tho.trim()) ? Number(tho.trim()) : tho;
}

/** `on` → `true`, `off` → `false`, khác → `INVALID_INPUT` nói rõ cờ nào. */
export function onOff(tho: string, co: string): boolean {
  if (tho === 'on') return true;
  if (tho === 'off') return false;
  throw new BatonError('INVALID_INPUT', {
    message: `--${co} chỉ nhận on hoặc off (nhận được "${tho}").`,
  });
}
