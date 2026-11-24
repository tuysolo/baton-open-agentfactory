/**
 * Chạy một công cụ MCP — **chỗ ra duy nhất** của đường MCP, đối xứng với
 * `in-ra.ts` của đường CLI.
 *
 * ## Mã thoát trong một giao thức không có tiến trình
 *
 * SPEC mục 13 d.380 cho mã thoát 0/1/2/3, 19.9 d.543 thêm mã 4. MCP không có
 * tiến trình để thoát, nên nếu không làm gì thì mã **3** (`STOP` — "agent phải
 * ngưng việc ngay", mục 6 d.193) và mã **4** (hết giờ chờ) **biến mất** trên
 * đường này. Đó là mất một tín hiệu dừng việc, không phải mất một chi tiết trang
 * trí. Nên mã thoát đi theo kết quả bằng **hai** cách, cả hai đều đọc được:
 *   1. `structuredContent.ma_thoat` — cho máy.
 *   2. một **dòng đầu** trong phần chữ, nói rõ mã và nghĩa — cho model đọc chữ.
 *
 * `isError` của MCP chỉ bật khi lệnh **không chạy xong** (mã 1 và 2). `STOP` và
 * hết giờ chờ **không phải lỗi** — lệnh vẫn trả đủ kết quả — đúng như `chay.ts`
 * đã quyết cho CLI: chúng về qua `DuLieuRa.ma_thoat`, không qua đường ngoại lệ.
 *
 * ## `--json` ở đây là gì
 *
 * d.380 "Mọi lệnh có `--json`". MCP trả **cả hai** dạng ở **mọi** lời gọi:
 * `structuredContent` (thân y hệt `--json` của CLI) và `content` chữ (các dòng
 * nhãn tiếng Việt, d.381). Không có cờ để quên bật, nên vế d.380 được giữ chặt
 * hơn ở đường này chứ không bị bỏ.
 *
 * ## Token
 *
 * d.382 "không bao giờ in token", danh sách CẤM số 5. Lưới chắn **y hệt** đường
 * CLI và bằng **cùng hàm**: `cheTrongDuLieu` trên thân, `cheToken` trên mọi
 * dòng chữ. Lớp cuối cùng nằm ở `vao-ra.ts`, ngay trước khi viết ra `stdout` —
 * nên cả khung JSON-RPC (id, tên method, thông điệp lỗi giao thức) cũng được
 * phủ, không chỉ phần thân do file này dựng.
 *
 * **Đo bằng đột biến, và khai thẳng kết quả:** bỏ hẳn hai lần che trong file
 * này mà giữ lớp ở `vao-ra.ts` thì **không ca nào đỏ**. Đúng, và đúng vì cùng
 * một lý do đã chứng minh ở `che-token.ts` cho đường CLI: phép thoát của
 * `JSON.stringify` chạy theo từng ký tự, nên `token ⊂ s` kéo theo
 * `escape(token) ⊂ escape(s)`, mà dạng escape **có** trong `bienTheToken`. Tức
 * với đường ra hôm nay, **lớp ở `vao-ra.ts` một mình là đủ**; lớp ở đây là **dư
 * thừa** về tính "không lọt token".
 *
 * Giữ nó vì một lý do hẹp hơn và thật: nó che **trước** khi serialize, nên nó
 * không phải đoán phép thoát của bộ serialize. Đổi `JSON.stringify` sang bất kỳ
 * cách dựng chữ nào khác thì danh sách biến thể lạc hậu ngay, còn lớp này vẫn
 * đúng. Không có ca nào ghim lựa chọn đó — bỏ đi test vẫn xanh.
 */

import { BatonError, MA_THOAT, type MaThoat } from '@baton/shared';
import { cheToken, cheTrongDuLieu } from '../che-token.js';
import type { BoiCanhLenh } from '../lenh.js';
import { SO_LENH_MCP } from './cong-cu.js';
import {
  docCauHinh,
  docFileChu,
  ghiFileChu,
  luotTuMoiTruong,
  tokenTu,
  type MoiTruongCli,
} from '../moi-truong.js';
import { doiNgoaiLe } from '../loi-cli.js';
import { thamSoTuMcp } from './tham-so.js';

/** Kết quả một `tools/call`, đúng hình của giao thức. */
export interface KetQuaCongCu {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly structuredContent: Readonly<Record<string, unknown>>;
  readonly isError: boolean;
}

/**
 * Nghĩa của từng mã thoát — **một bảng duy nhất**, khoá theo `MA_THOAT` của
 * `@baton/shared` (`satisfies Record<MaThoat, string>`), nên thêm một mã ở SPEC
 * mà quên chỗ này là **lỗi biên dịch**, không phải một dòng thiếu im lặng.
 */
const NGHIA_MA_THOAT = {
  [MA_THOAT.xong]: 'xong',
  [MA_THOAT.loi_nghiep_vu]: 'lỗi nghiệp vụ',
  [MA_THOAT.loi_xac_thuc_hoac_mang]: 'lỗi xác thực hoặc mạng',
  [MA_THOAT.nhan_stop]: 'nhận tín hiệu STOP — phải ngưng việc ngay và gửi một mục result hoặc error',
  [MA_THOAT.het_thoi_gian_cho]: 'hết thời gian chờ',
} as const satisfies Record<MaThoat, string>;

export function dongMaThoat(ma: MaThoat): string {
  return `Mã thoát ${String(ma)}: ${NGHIA_MA_THOAT[ma]}.`;
}

/** Mã thoát nào tính là "lệnh không chạy xong" — xem khối chú thích đầu file. */
function laLoi(ma: MaThoat): boolean {
  return ma === MA_THOAT.loi_nghiep_vu || ma === MA_THOAT.loi_xac_thuc_hoac_mang;
}

function dungKetQua(
  mt: MoiTruongCli,
  than: Record<string, unknown>,
  dong: readonly string[],
  ma_thoat: MaThoat,
): KetQuaCongCu {
  const token = tokenTu(mt);
  const chu = [dongMaThoat(ma_thoat), ...dong].map((d) => cheToken(d, token)).join('\n');
  return {
    content: [{ type: 'text', text: chu }],
    structuredContent: cheTrongDuLieu(than, token) as Record<string, unknown>,
    isError: laLoi(ma_thoat),
  };
}

/**
 * Gọi một công cụ MCP: tên + tham số → kết quả.
 *
 * **Không ném** — y như `chayCli`: mọi ngoại lệ thành một kết quả có `isError`
 * và một `ma_thoat`. Một agent nhận lỗi giao thức thay vì lỗi nghiệp vụ sẽ
 * không biết mình gõ sai cái gì.
 *
 * Tên công cụ lạ → `INVALID_INPUT` kèm **danh sách tên đang có**, sinh từ
 * `SO_LENH_MCP` (cùng câu chữ với `chay.ts`).
 */
export async function goiCongCu(
  mt: MoiTruongCli,
  ten: string,
  doi_so: Readonly<Record<string, unknown>>,
): Promise<KetQuaCongCu> {
  try {
    // `SO_LENH_MCP`, không `SO_LENH`: lệnh `chi_cli` (vd `export`) không gọi được
    // qua MCP kể cả khi gõ đúng tên — ẩn khỏi `tools/list` mà vẫn gọi được thì chưa ẩn.
    const lenh = SO_LENH_MCP[ten];
    if (lenh === undefined) {
      throw new BatonError('INVALID_INPUT', {
        message: `Không có công cụ "${ten}". Công cụ đang có: ${Object.keys(SO_LENH_MCP).sort().join(', ')}.`,
      });
    }
    const ts = thamSoTuMcp(lenh.khai, doi_so);
    const bc: BoiCanhLenh = {
      cauHinh: docCauHinh(mt),
      docFile: async (duong) => await docFileChu(mt, duong),
      // Không công cụ MCP nào ghi file (`export` là `chi_cli`); `noiDayMcp` cũng không
      // truyền `ghiFile`, nên nếu một lệnh sau lỡ gọi thì ra `INVALID_INPUT`, không ghi.
      ghiFile: async (duong, noi_dung) => await ghiFileChu(mt, duong, noi_dung),
      // BAT-56: thiếu tham số `luot` thì rơi về `BATON_LUOT` của tiến trình MCP.
      luotMacDinh: luotTuMoiTruong(mt),
    };
    const kq = await lenh.chay(bc, ts);
    const ma_thoat = kq.ma_thoat ?? MA_THOAT.xong;
    return dungKetQua(mt, { lenh: ten, ma_thoat, du_lieu: kq.json }, kq.dong, ma_thoat);
  } catch (e: unknown) {
    const { dong, ma_thoat } = doiNgoaiLe(e);
    const loi = BatonError.la(e) ? e.ma : null;
    return dungKetQua(mt, { lenh: ten, ma_thoat, loi, thong_diep: dong }, [dong], ma_thoat);
  }
}
