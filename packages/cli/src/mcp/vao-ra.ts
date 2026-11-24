/**
 * **Dây nối** giữa `xuLyDong` và một luồng stdio — đối xứng với `noi-day.ts` của
 * CLI, và tách khỏi `bin-mcp.ts` vì cùng một lý do: `bin-mcp.ts` chạy ngay khi
 * nhập, nên không ca test nào nhập được nó mà không khởi động cả máy chủ.
 *
 * ## Lưới chắn token cuối cùng (d.382, danh sách CẤM số 5)
 *
 * `viet` ở đây là chỗ **duy nhất** của đường MCP ghi ra `stdout`, và mọi byte đi
 * qua `cheToken` ngay trước khi ghi — **cùng hàm** với `in-ra.ts` của CLI, không
 * phải một bản chép. Đặt lưới ở đây chứ không chỉ trong `ket-qua.ts` vì ở đây nó
 * phủ **cả khung JSON-RPC**: `id` do client đặt, tên method client gửi lại trong
 * thông điệp lỗi, và mọi thứ một lượt sau có thể thêm vào. Một lưới đặt sớm hơn
 * chỉ phủ phần thân mà tầng đó tự dựng.
 *
 * ## `stderr` là đường log duy nhất
 *
 * Trong vận chuyển stdio của MCP, `stdout` **chỉ** chứa thông điệp giao thức —
 * một dòng chữ lạc vào đó làm hỏng phiên của client. Nên mọi thứ không phải
 * JSON-RPC đi ra `stderr`, và cũng qua lưới chắn.
 */

import { cheToken } from '../che-token.js';
import { tokenTu, type MoiTruongCli } from '../moi-truong.js';
import { xuLyDong, type ThongDiepRpc } from './may-chu.js';

/**
 * Nhận một dòng, trả **chuỗi** để ghi ra `stdout` (hoặc `null` nếu im lặng).
 *
 * Tách khỏi `vongLapMcp` để ca test ghim được đúng một việc: dòng ra đã che
 * token chưa.
 */
export async function dongRa(mt: MoiTruongCli, dong_vao: string): Promise<string | null> {
  const tra: ThongDiepRpc | null = await xuLyDong(mt, dong_vao);
  if (tra === null) return null;
  return cheToken(JSON.stringify(tra), tokenTu(mt));
}

/**
 * Chạy máy chủ MCP trên một nguồn dòng.
 *
 * `nguon` là bất cứ thứ gì sinh ra từng dòng — `bin-mcp.ts` đưa vào `stdin` của
 * Node đã cắt dòng; test đưa vào một mảng. Xử lý **tuần tự** (`for await` +
 * `await`): giao thức cho phép xen kẽ, nhưng một agent gọi `claim` rồi `submit`
 * trông đợi đúng thứ tự đó, và tuần tự là thứ không cần giải thích.
 */
export async function vongLapMcp(
  mt: MoiTruongCli,
  nguon: AsyncIterable<string> | Iterable<string>,
): Promise<void> {
  for await (const dong of nguon) {
    const ra = await dongRa(mt, dong);
    if (ra !== null) mt.viet(ra);
  }
}
