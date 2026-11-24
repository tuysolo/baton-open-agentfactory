/**
 * **Chỗ in duy nhất của CLI** — SPEC mục 13 d.380: "Mọi lệnh có `--json`".
 *
 * `--json` ở mọi lệnh được bảo đảm bằng **cấu trúc**, không bằng kỷ luật: mỗi
 * lệnh trả về một `DuLieuRa` (dữ liệu máy đọc + các dòng người đọc) và **không
 * được tự in**. Hai chế độ ra đi qua đúng hàm này, nên không có đường nào để một
 * lệnh có đầu ra người-đọc mà `--json` lại lệch, hoặc ngược lại.
 *
 * Mọi dòng đi qua lưới chắn token ngay trước khi viết — xem `che-token.ts`.
 *
 * Che **hai lần**: một lần trong dữ liệu (`cheTrongDuLieu`) rồi một lần trên chữ
 * đã serialize (`cheToken`). Lần che **sau** là lần mang luật: nó bắt cả những
 * chuỗi không đi qua dữ liệu (vd chữ do `JSON.stringify` dựng, hay một `toJSON`
 * trả về token mà `cheTrongDuLieu` không nhìn thấy), và nhờ danh sách biến thể có
 * dạng JSON-escape, **một mình nó đã đủ** cho mọi ca hiện có — bỏ lần che
 * **trước** đi thì không ca nào đỏ. Lần che trước giữ lại chỉ vì nó không phải
 * đoán phép thoát của bộ serialize; khai đầy đủ ở `che-token.ts`, khối "Hai nửa
 * đó KHÔNG phân biệt được bằng test".
 */

import type { MaThoat } from '@baton/shared';
import { cheToken, cheTrongDuLieu } from './che-token.js';
import type { MoiTruongCli } from './moi-truong.js';
import { tokenTu } from './moi-truong.js';

export interface DuLieuRa {
  /** Dữ liệu cho `--json`. Phải `JSON.stringify` được. */
  readonly json: unknown;
  /** Các dòng cho người đọc (nhãn tiếng Việt — d.381). */
  readonly dong: readonly string[];
  /**
   * Mã thoát khi lệnh **chạy xong** mà vẫn không phải `0` — hiện chỉ có **3**
   * "nhận tín hiệu `STOP`" (d.380). Thiếu = `0`.
   *
   * Để nó ở đây chứ không để lệnh tự ném: `STOP` **không phải lỗi** (lệnh vẫn
   * thành công, vẫn phải in đủ kết quả), nên nó không đi đường ngoại lệ của
   * `loi-cli.ts`. Xem `tin-hieu.ts`.
   */
  readonly ma_thoat?: MaThoat;
}

export function inKetQua(mt: MoiTruongCli, kq: DuLieuRa, json: boolean): void {
  const token = tokenTu(mt);
  const chu = json
    ? JSON.stringify(cheTrongDuLieu(kq.json, token), null, 2)
    : kq.dong.map((d) => cheToken(d, token)).join('\n');
  mt.viet(cheToken(chu, token));
}

/**
 * In một lỗi. `--json` thì lỗi cũng ra JSON: một agent chạy `--json` phải phân
 * tích được **cả** đường lỗi, không phải gặp một dòng chữ giữa dòng JSON.
 */
export function inLoi(mt: MoiTruongCli, dong: string, ma_loi: string | null, json: boolean): void {
  const token = tokenTu(mt);
  // Che **trước** khi serialize: `dong` là chỗ thông điệp của máy chủ đi vào.
  const da_che = cheToken(dong, token);
  const chu = json ? JSON.stringify({ loi: ma_loi, thong_diep: da_che }, null, 2) : da_che;
  mt.vietLoi(cheToken(chu, token));
}
