/**
 * Môi trường chạy của CLI — SPEC mục 13 d.382: "CLI đọc `BATON_URL` và
 * `BATON_TOKEN` từ biến môi trường, **không bao giờ in token**."
 *
 * Mọi thứ CLI chạm tới bên ngoài (biến môi trường, hai luồng ra, `fetch`) đi qua
 * **một** object truyền vào. Nhờ vậy test chạy **đúng đường thật** của CLI (phân
 * tích tham số → gọi API → in) mà không cần tiến trình con, và `bin.ts` là chỗ
 * duy nhất biết tới `process`.
 */

import type { CauHinhClient } from '@baton/client';
import { BatonError } from '@baton/shared';
import { LoiCli } from './loi-cli.js';
import type { ChayGit } from './git-cuc-bo.js';

export interface MoiTruongCli {
  env: Readonly<Record<string, string | undefined>>;
  /** Một dòng ra `stdout`. */
  viet: (dong: string) => void;
  /** Một dòng ra `stderr`. */
  vietLoi: (dong: string) => void;
  /** `fetch` thay thế (test trỏ vào Worker trong Miniflare). */
  fetch?: typeof fetch;
  /**
   * Đọc một file văn bản — cho `baton plan <file.json>` và
   * `baton submit <lượt> <file-bao-cao.md>` (SPEC mục 13 d.364, d.366).
   *
   * Đi qua môi trường, **không** `import 'node:fs'` trong thân lệnh: cùng lý do
   * với `fetch` và `env` — `bin.ts` là chỗ duy nhất biết tới Node, nên test chạy
   * đúng đường thật của CLI mà không đụng đĩa.
   */
  docFile?: (duong: string) => Promise<string>;
  /**
   * Ghi một file văn bản **MỚI** — chỉ cho `baton export <file>` (SPEC mục 15 d.429,
   * BAT-8). Cùng lý do với `docFile`: `bin.ts` là chỗ duy nhất biết tới Node.
   *
   * Bản của `bin.ts` mở file bằng cờ `wx`: **file đã có thì lỗi, không ghi đè** —
   * ghi đè một file của chủ là một lần xoá dữ liệu (danh sách cấm `CLAUDE.md` mục 4).
   * Tuỳ chọn: đường MCP không truyền nó, nên `export` qua MCP ra `INVALID_INPUT`.
   */
  ghiFile?: (duong: string, noi_dung: string) => Promise<void>;
  /**
   * Chạy một lệnh `git` **chỉ đọc** trong thư mục hiện tại — cho bằng chứng
   * `commit` của SPEC mục 7 d.206 khi repo merge **cục bộ** và chưa push (xem
   * `git-cuc-bo.ts`).
   *
   * Tuỳ chọn, và **thiếu nó thì không lệnh nào trượt**: lời khai "đã merge cục
   * bộ" chỉ là một dữ kiện thêm, không có nó thì bằng chứng đi đúng đường cũ
   * (GitHub quyết). Test không truyền trường này thì **không tiến trình con nào**
   * được tạo.
   */
  chayGit?: ChayGit;
}

export const TEN_BIEN_URL = 'BATON_URL';
export const TEN_BIEN_TOKEN = 'BATON_TOKEN';
/**
 * Lượt giao **mặc định** cho `heartbeat`, `log`, `plan` khi agent có nhiều phiên
 * mở (BAT-56, `spec-questions.md` #83). Cờ `--luot` (MCP: tham số `luot`) thắng
 * biến này. Xem `phien-hien-tai.ts`.
 */
export const TEN_BIEN_LUOT = 'BATON_LUOT';

/**
 * Giá trị `BATON_LUOT`, hoặc `undefined` khi không đặt **hoặc đặt rỗng** (một
 * dòng `export BATON_LUOT=` trong shell là "không chỉ định", không phải "lượt có
 * id rỗng"). Đây là chỗ **duy nhất** đọc biến này — lệnh không đọc `env` thẳng.
 */
export function luotTuMoiTruong(mt: MoiTruongCli): string | undefined {
  const v = mt.env[TEN_BIEN_LUOT]?.trim();
  return v === undefined || v === '' ? undefined : v;
}

/**
 * Token đang dùng, hoặc chuỗi rỗng khi chưa có.
 *
 * Đọc riêng khỏi `docCauHinh` vì bộ lọc che token (`che-token.ts`) cần nó **kể cả
 * khi cấu hình chưa đọc được**: một lỗi xảy ra trước lúc dựng cấu hình vẫn phải
 * đi qua bộ lọc.
 */
export function tokenTu(mt: MoiTruongCli): string {
  return mt.env[TEN_BIEN_TOKEN] ?? '';
}

/**
 * Dựng cấu hình client từ biến môi trường.
 *
 * Thiếu `BATON_URL` hoặc `BATON_TOKEN` → **mã thoát 2** ("lỗi xác thực hoặc
 * mạng" — SPEC d.380), không phải 1: không có token thì lệnh chưa bao giờ tới
 * được tầng nghiệp vụ, nên mã 1 sẽ khiến agent đi sửa tham số của mình.
 *
 * Thông điệp chỉ nói **tên biến**, không bao giờ nói giá trị (d.382).
 */
export function docCauHinh(mt: MoiTruongCli): CauHinhClient {
  const url = mt.env[TEN_BIEN_URL];
  const token = mt.env[TEN_BIEN_TOKEN];
  const thieu: string[] = [];
  if (url === undefined || url === '') thieu.push(TEN_BIEN_URL);
  if (token === undefined || token === '') thieu.push(TEN_BIEN_TOKEN);
  if (thieu.length > 0 || url === undefined || token === undefined) {
    throw LoiCli.xacThuc(
      `Thiếu biến môi trường ${thieu.join(' và ')}. Đặt ${TEN_BIEN_URL} (gốc API) và ` +
        `${TEN_BIEN_TOKEN} (token agent) rồi chạy lại.`,
    );
  }
  return { baseUrl: url, token, ...(mt.fetch === undefined ? {} : { fetch: mt.fetch }) };
}

/**
 * Nội dung một file người gõ chỉ tên — `plan` và `submit`.
 *
 * File không có, không đọc được, hay môi trường không có cách đọc file đều ra
 * **`INVALID_INPUT`** (mã thoát 1): đó là một tham số người gọi sửa được, không
 * phải lỗi mạng. Thông điệp **nêu đường dẫn** đúng như người gõ.
 */
export async function docFileChu(mt: MoiTruongCli, duong: string): Promise<string> {
  const doc = mt.docFile;
  if (doc === undefined) {
    throw new BatonError('INVALID_INPUT', {
      message: `Môi trường chạy này không đọc được file ("${duong}").`,
    });
  }
  try {
    return await doc(duong);
  } catch (e: unknown) {
    throw new BatonError('INVALID_INPUT', {
      message: `Không đọc được file "${duong}": ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

/**
 * Ghi một file **mới** — `baton export`. Cùng nếp với `docFileChu`: không ghi được
 * (môi trường không có cách ghi, file đã có, thư mục không có) ⇒ **`INVALID_INPUT`**
 * nêu đường dẫn, mã thoát 1.
 */
export async function ghiFileChu(mt: MoiTruongCli, duong: string, noi_dung: string): Promise<void> {
  const ghi = mt.ghiFile;
  if (ghi === undefined) {
    throw new BatonError('INVALID_INPUT', {
      message: `Môi trường chạy này không ghi được file ("${duong}").`,
    });
  }
  try {
    await ghi(duong, noi_dung);
  } catch (e: unknown) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `Không ghi được file "${duong}" (file đã có thì không ghi đè — chọn tên khác): ` +
        `${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
