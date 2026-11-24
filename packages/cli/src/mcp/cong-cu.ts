/**
 * **Danh sách công cụ MCP — sinh ra từ `SO_LENH`, không gõ tay.**
 *
 * SPEC mục 13 d.351 ("Ba đường, **cùng một bộ quyền**: CLI `baton`, MCP server,
 * HTTP API") và d.355 ("MCP có công cụ tương đương, **cùng tên**"). "Cùng tên"
 * và "cùng một bộ quyền" chỉ đúng được một cách: MCP dùng **chính** bộ lệnh của
 * CLI. Một bảng công cụ gõ tay là một bộ lệnh **thứ hai**, và bộ thứ hai luôn
 * trôi khỏi bộ thứ nhất — rồi SPEC đúng ở một đường, sai ở đường kia.
 *
 * Nên ở đây **không có** tên lệnh nào được viết ra. Mọi thứ duyệt `SO_LENH`:
 * tên công cụ là `khai.ten`, schema tham số sinh từ `khai.vi_tri`,
 * `khai.vi_tri_tuy_chon` và `khai.co`. Thêm một lệnh vào `SO_LENH` thì MCP **tự**
 * có nó; `mcp-cong-cu.test.ts` khoá điều đó bằng một ca so **tập** tên.
 *
 * ## Tên tham số: vì sao phải đổi, và đổi theo luật nào
 *
 * Tham số vị trí của CLI mang tên **người đọc**: `nội dung`, `DỰ ÁN`, `T-số`,
 * `file-bao-cao.md`, `accept|return`. Chúng là nhãn để in dòng "Cách dùng", chứ
 * không phải định danh. Khoá của một object JSON thì nên là định danh, nên
 * `tenThamSo` bỏ dấu, hạ chữ thường và thay mọi thứ không phải chữ/số bằng `_`
 * (`nội dung` → `noi_dung`, `T-số` → `t_so`).
 *
 * Bỏ dấu bằng `normalize('NFD')` + xoá dấu tổ hợp, **không** bằng một bảng chép
 * tay: một bảng chép tay quên một chữ là một tên tham số lạ lọt ra ngoài. `đ`
 * không phải chữ có dấu tổ hợp nên nó là ngoại lệ duy nhất, xử riêng.
 *
 * Phép đổi đó có thể **đụng tên** (hai tham số khác nhau ra cùng một khoá, hoặc
 * một tham số vị trí trùng tên một tuỳ chọn). Đụng tên là một lỗi **lập trình**,
 * không phải lỗi người dùng, nên `schemaThamSo` ném ngay khi dựng — và có một ca
 * duyệt cả `SO_LENH` để lỗi đó đỏ lúc test chứ không lúc một agent gọi.
 */

import type { KhaiLenh, KieuCo } from '../phan-tich.js';
import { cachDung } from '../phan-tich.js';
import { SO_LENH, type LenhCli } from '../lenh.js';

/** Một công cụ MCP, đúng hình `tools/list` của giao thức. */
export interface CongCuMcp {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
}

export interface JsonSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties: boolean;
}

/** Tên người-đọc của một tham số → khoá JSON. Xem khối chú thích đầu file. */
export function tenThamSo(ten: string): string {
  const khong_dau = ten
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return khong_dau
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function schemaCo(kieu: KieuCo, ten: string): unknown {
  switch (kieu) {
    case 'bat':
      return { type: 'boolean', description: `Cờ --${ten} của lệnh CLI tương đương.` };
    case 'nhieu_gia_tri':
      return {
        type: 'array',
        items: { type: 'string' },
        description: `Tuỳ chọn --${ten}, **lặp được**: mỗi phần tử là một lần gõ --${ten}.`,
      };
    case 'gia_tri':
      return { type: 'string', description: `Tuỳ chọn --${ten} của lệnh CLI tương đương.` };
  }
}

/**
 * Schema tham số vào của một lệnh.
 *
 * `--json` **không** có ở đây: nó là cách xin đầu ra máy-đọc của một dòng lệnh,
 * còn MCP vốn trả dữ liệu có cấu trúc ở **mọi** lời gọi (xem `ket-qua.ts`). Đưa
 * nó vào chỉ tạo ra một cờ không làm gì — và d.380 "Mọi lệnh có `--json`" đã
 * được giữ *mạnh hơn* ở đường này, chứ không bị bỏ.
 */
export function schemaThamSo(khai: KhaiLenh): JsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const them = (khoa: string, nguon: string, gia_tri: unknown): void => {
    if (khoa === '') {
      throw new Error(`Lệnh "${khai.ten}": tham số "${nguon}" đổi ra khoá rỗng.`);
    }
    if (khoa in properties) {
      throw new Error(
        `Lệnh "${khai.ten}": hai tham số đổi ra cùng khoá "${khoa}" (lần sau là "${nguon}"). ` +
          'Đổi tên một trong hai ở khai báo lệnh.',
      );
    }
    properties[khoa] = gia_tri;
  };

  for (const v of khai.vi_tri) {
    const khoa = tenThamSo(v);
    them(khoa, v, { type: 'string', description: `Tham số bắt buộc "${v}".` });
    required.push(khoa);
  }
  for (const v of khai.vi_tri_tuy_chon ?? []) {
    them(tenThamSo(v), v, { type: 'string', description: `Tham số tuỳ chọn "${v}".` });
  }
  for (const [ten, kieu] of Object.entries(khai.co)) {
    them(tenThamSo(ten), ten, schemaCo(kieu, ten));
  }

  return { type: 'object', properties, required, additionalProperties: false };
}

/**
 * Schema đầu ra — **giống nhau ở mọi công cụ**, vì mọi lệnh trả cùng một hình
 * `DuLieuRa` (xem `in-ra.ts`).
 *
 * `ma_thoat` nằm trong schema chứ không bị bỏ: MCP không có tiến trình để thoát,
 * nên mã thoát 3 (`STOP` — d.380) và 4 (hết giờ chờ — 19.9 d.543) phải tới agent
 * bằng **dữ liệu**. Bỏ nó đi là nuốt mất tín hiệu dừng việc. Xem `ket-qua.ts`.
 */
export function schemaKetQua(): JsonSchema {
  return {
    type: 'object',
    properties: {
      lenh: { type: 'string', description: 'Tên lệnh đã chạy.' },
      ma_thoat: {
        type: 'integer',
        description:
          'Mã thoát của lệnh CLI tương đương (SPEC mục 13 d.380 + 19.9 d.543): ' +
          '0 xong; 1 lỗi nghiệp vụ; 2 lỗi xác thực hoặc mạng; 3 nhận tín hiệu STOP ' +
          '(phải ngưng việc ngay); 4 hết thời gian chờ.',
      },
      du_lieu: { description: 'Kết quả của lệnh — đúng thân mà `--json` của CLI in ra.' },
      loi: { type: ['string', 'null'], description: 'Mã lỗi tiếng Anh khi ma_thoat khác 0.' },
      thong_diep: { type: 'string', description: 'Thông điệp lỗi, nhãn tiếng Việt.' },
    },
    required: ['lenh', 'ma_thoat'],
    additionalProperties: false,
  };
}

/** Một lệnh CLI → một công cụ MCP **cùng tên** (d.355). */
export function congCuCua(lenh: LenhCli): CongCuMcp {
  return {
    name: lenh.khai.ten,
    description: cachDung(lenh.khai),
    inputSchema: schemaThamSo(lenh.khai),
    outputSchema: schemaKetQua(),
  };
}

/**
 * **Phần của `SO_LENH` mà MCP mang** — mọi lệnh trừ lệnh khai `chi_cli` (hiện chỉ
 * `export`, BAT-8: lệnh của chủ, ghi file). Vẫn **sinh** từ `SO_LENH`, không gõ tay:
 * một lệnh mới tự vào MCP trừ khi nó tự khai mình chỉ thuộc CLI. Dùng cho **cả**
 * `tools/list` lẫn `tools/call`, nên lệnh ẩn không gọi được qua MCP bằng tên.
 */
export const SO_LENH_MCP: Readonly<Record<string, LenhCli>> = Object.fromEntries(
  Object.entries(SO_LENH).filter(([, l]) => l.chi_cli !== true),
);

/** Cả bảng công cụ, sinh từ `SO_LENH_MCP`. Thứ tự theo tên để đầu ra ổn định. */
export function danhSachCongCu(): CongCuMcp[] {
  return Object.values(SO_LENH_MCP)
    .map((l) => congCuCua(l))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
