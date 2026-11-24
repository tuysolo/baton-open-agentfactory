/**
 * **MCP server của Baton** — SPEC mục 13 d.351 ("Ba đường, cùng một bộ quyền:
 * CLI `baton`, **MCP server**, HTTP API"), d.355 ("MCP có công cụ tương đương,
 * cùng tên"), d.267 và d.301 ("công cụ MCP tương đương", "đọc được qua CLI hoặc
 * MCP").
 *
 * File này là tầng **giao thức**: một thông điệp JSON-RPC 2.0 vào, một thông
 * điệp ra. Nó không biết tới `stdout`, không biết tới `process` — chỗ đó là
 * `vao-ra.ts`. Nhờ vậy mọi ca test chạy đúng đường thật của MCP (giao thức →
 * lệnh → API) mà không cần một tiến trình con.
 *
 * ## QUYẾT ĐỊNH: tự cài giao thức, KHÔNG thêm SDK
 *
 * Repo chưa có phụ thuộc MCP nào, và dự án có nếp "không thêm phụ thuộc khi chưa
 * cần" (đầu `phan-tich.ts`, `node-fs.d.ts`, `noi-day.ts`). Ba lý do cụ thể, chứ
 * không phải chỉ theo nếp:
 *
 *   1. **Phần dùng tới rất nhỏ và đã cố định.** Baton cần đúng ba method —
 *      `initialize`, `tools/list`, `tools/call` — trên một khung JSON-RPC 2.0.
 *      Đó là chưa tới trăm dòng ở dưới. Một SDK mang theo đăng ký resource,
 *      prompt, sampling, nhiều lớp vận chuyển: thứ không dùng nhưng vẫn phải
 *      cập nhật và vẫn nằm trong bề mặt tấn công.
 *   2. **Môi trường test.** Bộ test của dự án chạy trong Miniflare
 *      (`@cloudflare/vitest-pool-workers`), không phải Node: một SDK dựng quanh
 *      `node:stream`/`process.stdin` sẽ không nhập được ở đó, và cổng nghiệm thu
 *      sẽ phải đổi theo. Tầng giao thức thuần ở đây chạy được ở cả hai nơi.
 *   3. **Lưới chắn token.** d.382 đòi **không bao giờ** in token. Lớp chắn cuối
 *      chỉ đứng vững khi **mọi** byte ra `stdout` đi qua đúng một hàm
 *      (`vao-ra.ts`). Một SDK tự quản lý việc ghi — kể cả log nội bộ của nó —
 *      là một đường ra ngoài tầm lưới chắn.
 *
 * Nợ đã nhận, khai thẳng: tự cài nghĩa là **không** có `logging`, `resources`,
 * `prompts`, không `cancellation`, không phiên bản giao thức nào ngoài con số
 * khai ở `PHIEN_BAN_GIAO_THUC`. Baton không cần chúng hôm nay; cần tới thì đó là
 * lúc cân lại việc thêm SDK, và quyết định này nằm ở đây để đọc lại.
 *
 * ## Giới hạn 600 request/phút (d.384)
 *
 * Không cài gì thêm ở đây, và đó là chủ ý: giới hạn là **của token**, đếm ở máy
 * chủ (`gioi-han-token.ts` của API). Mọi công cụ MCP gọi API qua đúng
 * `batonFetch` với đúng token đó, nên một lời gọi MCP tiêu một request y như một
 * lệnh CLI, và "lệnh chờ dài tính 1 request" cũng tự đúng theo. Dựng một bộ đếm
 * thứ hai ở đây là cài cùng một luật hai lần.
 */

import { danhSachCongCu } from './cong-cu.js';
import { goiCongCu } from './ket-qua.js';
import type { MoiTruongCli } from '../moi-truong.js';

/**
 * Phiên bản giao thức khai lúc `initialize`.
 *
 * Trả **đúng** phiên bản client xin nếu Baton hiểu được nó, không thì trả phiên
 * bản này để client tự quyết — đúng cách thương lượng của MCP.
 */
export const PHIEN_BAN_GIAO_THUC = '2025-06-18';
export const PHIEN_BAN_HO_TRO: readonly string[] = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const TEN_MAY_CHU = 'baton';

/** Mã lỗi JSON-RPC 2.0 — chỉ những mã file này phát. */
export const LOI_RPC = {
  phan_tich: -32700,
  yeu_cau_sai: -32600,
  khong_co_method: -32601,
  tham_so_sai: -32602,
} as const;

export interface ThongDiepRpc {
  readonly jsonrpc: '2.0';
  readonly id?: string | number | null;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

function ketQua(id: string | number | null, result: unknown): ThongDiepRpc {
  return { jsonrpc: '2.0', id, result };
}

function loi(id: string | number | null, code: number, message: string): ThongDiepRpc {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function laObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Xử lý **một** thông điệp JSON-RPC đã phân tích.
 *
 * Trả `null` khi không được trả lời gì — đó là **thông báo** (notification),
 * vd `notifications/initialized`. Trả lời một notification là sai giao thức và
 * một số client sẽ đứng.
 *
 * ## "Thông báo" là KHÓA `id` VẮNG MẶT, không phải `id` rỗng
 *
 * JSON-RPC 2.0 định nghĩa notification là thông điệp **không có** thành viên
 * `id`. Một thông điệp mang `"id": null` là một **request hợp lệ**, và phải
 * được trả lời với `id` bằng `null`. Hai thứ đó khác nhau, và phân biệt bằng
 * `typeof` thì không thấy được — `tho['id']` cho `undefined` ở cả hai ca.
 *
 * Chưa client MCP thật nào gửi `"id": null`, nên đây không phải một lỗi đang
 * cắn. Nhưng giao thức này là **tự cài** (xem khối quyết định ở đầu file), nên
 * chỗ nào SPEC của giao thức nói rõ thì ta phải tự đúng — một máy chủ im lặng
 * trước một request hợp lệ là thứ client chỉ phát hiện được bằng một lần treo.
 */
export async function xuLyThongDiep(mt: MoiTruongCli, tho: unknown): Promise<ThongDiepRpc | null> {
  if (!laObject(tho)) return loi(null, LOI_RPC.yeu_cau_sai, 'Thông điệp phải là một object JSON.');

  // `in` chứ không `!== undefined`: đó là chỗ duy nhất thấy được khoá có mặt hay không.
  const co_id = 'id' in tho;
  const id_tho = tho['id'];
  const id = typeof id_tho === 'string' || typeof id_tho === 'number' ? id_tho : null;
  const method = tho['method'];

  if (typeof method !== 'string') {
    return co_id ? loi(id, LOI_RPC.yeu_cau_sai, 'Thiếu trường "method".') : null;
  }
  // Thông báo: khoá `id` vắng mặt → không trả lời, dù method có là gì.
  if (!co_id) return null;

  const params = laObject(tho['params']) ? tho['params'] : {};

  switch (method) {
    case 'initialize': {
      const xin = params['protocolVersion'];
      const phien_ban =
        typeof xin === 'string' && PHIEN_BAN_HO_TRO.includes(xin) ? xin : PHIEN_BAN_GIAO_THUC;
      return ketQua(id, {
        protocolVersion: phien_ban,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: TEN_MAY_CHU, version: '0.1.0' },
        instructions:
          'Mỗi công cụ là một lệnh của CLI `baton` (SPEC mục 13), cùng tên và cùng bộ quyền. ' +
          'Kết quả luôn có "ma_thoat": 3 nghĩa là nhận tín hiệu STOP — phải ngưng việc ngay.',
      });
    }
    case 'ping':
      return ketQua(id, {});
    case 'tools/list':
      return ketQua(id, { tools: danhSachCongCu() });
    case 'tools/call': {
      const ten = params['name'];
      if (typeof ten !== 'string') {
        return loi(id, LOI_RPC.tham_so_sai, 'Thiếu tên công cụ ("params.name").');
      }
      const doi_so = laObject(params['arguments']) ? params['arguments'] : {};
      return ketQua(id, await goiCongCu(mt, ten, doi_so));
    }
    default:
      return loi(id, LOI_RPC.khong_co_method, `Không hỗ trợ method "${method}".`);
  }
}

/**
 * Một **dòng** JSON vào → một dòng JSON ra (hoặc `null` nếu không phải trả lời).
 *
 * Vận chuyển stdio của MCP là JSON phân cách bằng xuống dòng, nên ranh giới
 * thông điệp là một dòng. Dòng trắng bị bỏ qua; dòng không phải JSON ra lỗi
 * `-32700` chứ không làm chết máy chủ — một client gửi rác không được quyền
 * dừng phiên làm việc của agent.
 */
export async function xuLyDong(mt: MoiTruongCli, dong: string): Promise<ThongDiepRpc | null> {
  if (dong.trim() === '') return null;
  let tho: unknown;
  try {
    tho = JSON.parse(dong);
  } catch (e: unknown) {
    return loi(
      null,
      LOI_RPC.phan_tich,
      `Dòng không phải JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return await xuLyThongDiep(mt, tho);
}
