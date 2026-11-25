/**
 * Phân trang **keyset (cursor)** — mốc 200 dự án + 200.000 ticket
 * (`decisions.md` 01/10).
 *
 * Vì sao không `OFFSET`: `LIMIT 50 OFFSET 100000` buộc SQLite đi qua 100.000
 * dòng trước khi trả dòng đầu, nên trang càng sâu càng chậm. Keyset thì mỗi
 * trang là một lần tìm trong index rồi đọc 50 dòng — thời gian không phụ thuộc
 * độ sâu.
 *
 * **Luật sống còn: thứ tự sắp xếp phải là thứ tự toàn phần.** Nếu khoá sắp xếp
 * có giá trị trùng nhau (hai dự án cùng tên, hai ticket cùng ưu tiên và cùng
 * `tao_luc`) mà không có cột phá vỡ hoà, thì `WHERE ten > ?` sẽ **bỏ sót** các
 * dòng cùng tên còn lại, còn `WHERE ten >= ?` sẽ **trả trùng**. Nên mọi khoá
 * keyset ở Baton đều kết thúc bằng `id`.
 */

import { BatonError } from './loi.js';

/** Một khoá keyset: các giá trị của đúng những cột trong `ORDER BY`, cùng thứ tự. */
export type KhoaTrang = readonly (string | number)[];

/**
 * Gói khoá thành con trỏ mờ. Mờ là chủ ý: client không được dựng cursor bằng
 * tay, nên sau này đổi khoá sắp xếp không làm vỡ client nào.
 */
export function goiCursor(khoa: KhoaTrang): string {
  const chu = JSON.stringify(khoa);
  const bytes = new TextEncoder().encode(chu);
  let nhi = '';
  for (const b of bytes) nhi += String.fromCharCode(b);
  // base64url: an toàn trong query string, không cần mã hoá thêm.
  return btoa(nhi).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Mở con trỏ. Cursor sai hoặc không đúng số cột → `INVALID_INPUT`, **không**
 * âm thầm trả về trang đầu (âm thầm thì vòng lặp cuộn của agent sẽ chạy mãi).
 */
export function moCursor(cursor: string, so_cot: number): KhoaTrang {
  const loi = (): never => {
    throw new BatonError('INVALID_INPUT', { message: 'cursor không hợp lệ.' });
  };
  let chu: string;
  try {
    const nhi = atob(cursor.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(nhi.length);
    for (let i = 0; i < nhi.length; i += 1) bytes[i] = nhi.charCodeAt(i);
    chu = new TextDecoder().decode(bytes);
  } catch {
    return loi();
  }

  let gia_tri: unknown;
  try {
    gia_tri = JSON.parse(chu);
  } catch {
    return loi();
  }

  if (!Array.isArray(gia_tri) || gia_tri.length !== so_cot) return loi();
  for (const v of gia_tri) {
    if (typeof v !== 'string' && typeof v !== 'number') return loi();
  }
  return gia_tri as KhoaTrang;
}
