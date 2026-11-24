/**
 * Tham số của một lời gọi MCP → `ThamSoDaPhanTich` — **hình mà lệnh đã nhận sẵn**.
 *
 * ## Vì sao KHÔNG dựng lại một dòng lệnh rồi gọi `phanTich`
 *
 * Cách thẳng tay nhất là ghép tham số MCP thành một mảng `argv` rồi đưa cho
 * `phanTich`, và như vậy mới "tái dùng tối đa". Nhưng nó mở một lỗ thật: bộ phân
 * tích CLI coi **mọi** chữ bắt đầu bằng `--` là một tuỳ chọn (xem `phan-tich.ts`).
 * Một agent gọi `comment` với nội dung `"--json"` — hoặc tệ hơn, `"--brief"` —
 * thì chữ đó thôi làm nội dung và thành một cờ. Ở CLI điều đó là nếp của dòng
 * lệnh và người gõ thấy được; ở MCP thì **tham số đã có ranh giới rõ ràng rồi**,
 * nên bỏ ranh giới đó đi để rồi đoán lại là tự tạo ra một đường tiêm.
 *
 * Nên ở đây tham số đi **thẳng** vào `ThamSoDaPhanTich`, không qua chữ. Phần
 * **luật** — số tham số vị trí, dạng thông điệp lỗi — vẫn là của `phan-tich.ts`
 * (`kiemSoViTri`, `loiThamSo`), đúng một bản, dùng chung hai đường.
 *
 * `json: false` luôn: `ThamSoDaPhanTich.json` là "người gõ có xin `--json`
 * không", một câu hỏi của dòng lệnh. MCP trả **cả hai** dạng ở mọi lời gọi
 * (xem `ket-qua.ts`), và không lệnh nào đọc trường đó — chỉ `chay.ts` đọc, để
 * chọn chế độ in.
 */

import type { KhaiLenh, ThamSoDaPhanTich } from '../phan-tich.js';
import { kiemSoViTri, loiThamSo } from '../phan-tich.js';
import { tenThamSo } from './cong-cu.js';

/** Một giá trị JSON bất kỳ đến từ client. */
type GiaTriVao = unknown;

/**
 * Một giá trị vô hướng → chuỗi, hoặc `INVALID_INPUT`.
 *
 * ## Vì sao chỗ này NỚI TAY mà cờ `bat` lại KHẮT KHE
 *
 * Hàm này nhận `60` và `true` rồi đổi thành `"60"`, `"true"`; còn cờ `bat` (ở
 * `thamSoTuMcp`) **từ chối** chuỗi `"true"` thay vì đổi nó thành `true`. Trông
 * như hai mức khắt khe lệch nhau, nhưng đó là chủ ý, và lý do nằm ở **hậu quả
 * của việc đoán sai**, không ở sự cân đối:
 *
 *   * Số/bool → chuỗi là phép đổi **không mất gì và chỉ có một nghĩa**. Tham số
 *     vị trí và cờ `gia_tri` của CLI vốn **luôn** là chuỗi (chúng đến từ dòng
 *     lệnh), và một agent gửi `{"wait": 60}` thay vì `{"wait": "60"}` là chuyện
 *     thường của JSON — ép nó thành `"60"` cho ra **đúng** thứ `baton result
 *     T-1 --wait 60` tạo ra. Từ chối ở đây chỉ là bắt agent gõ thêm dấu nháy.
 *   * Chuỗi → bool thì **có hai nghĩa và một trong hai âm thầm sai**: `"false"`
 *     là một chuỗi không rỗng, nên phép ép tự nhiên nhất biến ý "tắt" thành
 *     "bật". Một cờ bật nhầm là một việc đã làm mà agent tưởng mình không làm.
 *     Không có cách đoán nào an toàn, nên không đoán.
 *
 * Tức luật chung là: **ép khi phép ép chỉ có một nghĩa, từ chối khi nó có hai.**
 * Mảng và object không bao giờ ép (chúng không có một dạng chuỗi hiển nhiên) —
 * trừ đúng chỗ cờ `nhieu_gia_tri`, nơi mảng **là** hình đúng.
 */
function chuoiHoacSai(khai: KhaiLenh, khoa: string, v: GiaTriVao): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return loiThamSo(khai, `Tham số "${khoa}" phải là một chuỗi.`);
}

/**
 * Đổi object tham số của `tools/call` thành `ThamSoDaPhanTich`.
 *
 * Khoá lạ → `INVALID_INPUT` (mã thoát 1), **không** bỏ qua im lặng: một agent gõ
 * sai tên tham số mà lệnh vẫn chạy "thành công" thiếu mất một vế là thứ nó không
 * có cách nào phát hiện.
 */
export function thamSoTuMcp(khai: KhaiLenh, doi_so: Readonly<Record<string, GiaTriVao>>): ThamSoDaPhanTich {
  const con_lai = new Set(Object.keys(doi_so));
  const lay = (ten: string): GiaTriVao => {
    const khoa = tenThamSo(ten);
    con_lai.delete(khoa);
    return doi_so[khoa];
  };

  const vi_tri: string[] = [];
  for (const ten of khai.vi_tri) {
    const v = lay(ten);
    // Thiếu thì **không** đẩy gì vào: `kiemSoViTri` ở cuối là chỗ duy nhất báo thiếu.
    if (v !== undefined && v !== null) vi_tri.push(chuoiHoacSai(khai, tenThamSo(ten), v));
  }
  /*
   * Tham số vị trí **tuỳ chọn** phải liền mạch: bỏ cái trước mà gõ cái sau thì
   * giá trị sẽ tụt một ô (vd `evidence`: "giá trị 2" rơi vào ô "giá trị"). Ở CLI
   * chuyện đó không xảy ra được — vị trí là vị trí; ở MCP thì xảy ra được, nên
   * phải chặn thẳng thay vì gửi lên máy chủ một thân sai lặng lẽ.
   */
  let da_thieu: string | undefined;
  for (const ten of khai.vi_tri_tuy_chon ?? []) {
    const v = lay(ten);
    if (v === undefined || v === null) {
      da_thieu ??= ten;
      continue;
    }
    if (da_thieu !== undefined) {
      loiThamSo(
        khai,
        `Tham số "${tenThamSo(ten)}" cần có "${tenThamSo(da_thieu)}" trước nó: ` +
          'tham số vị trí tuỳ chọn phải điền liền mạch, không bỏ cách.',
      );
    }
    vi_tri.push(chuoiHoacSai(khai, tenThamSo(ten), v));
  }

  const gia_tri: Record<string, string> = {};
  const nhieu: Record<string, readonly string[]> = {};
  const bat = new Set<string>();
  for (const [ten, kieu] of Object.entries(khai.co)) {
    const khoa = tenThamSo(ten);
    const v = lay(ten);
    if (kieu === 'nhieu_gia_tri') {
      // Cờ lặp luôn có khoá, kể cả rỗng — đúng giao kèo của `ThamSoDaPhanTich`.
      if (v === undefined || v === null) {
        nhieu[ten] = [];
      } else if (Array.isArray(v)) {
        nhieu[ten] = v.map((x: GiaTriVao) => chuoiHoacSai(khai, khoa, x));
      } else {
        // Một giá trị lẻ = gõ cờ đó đúng một lần. Lành, và đúng hình của CLI.
        nhieu[ten] = [chuoiHoacSai(khai, khoa, v)];
      }
      continue;
    }
    if (v === undefined || v === null) continue;
    if (kieu === 'bat') {
      // KHÔNG ép chuỗi sang bool — `"false"` sẽ thành "bật". Xem `chuoiHoacSai`.
      if (typeof v !== 'boolean') {
        loiThamSo(
          khai,
          `Tham số "${khoa}" phải là true hoặc false (không nhận chuỗi: "false" là một ` +
            'chuỗi không rỗng, ép sang bool sẽ bật cờ mà người gọi muốn tắt).',
        );
      }
      if (v) bat.add(ten);
      continue;
    }
    gia_tri[ten] = chuoiHoacSai(khai, khoa, v);
  }

  if (con_lai.size > 0) {
    const cho_phep = [
      ...khai.vi_tri,
      ...(khai.vi_tri_tuy_chon ?? []),
      ...Object.keys(khai.co),
    ].map((t) => tenThamSo(t));
    loiThamSo(
      khai,
      `Lệnh "${khai.ten}" không có tham số ${[...con_lai].sort().map((k) => `"${k}"`).join(', ')}. ` +
        `Tham số nhận: ${cho_phep.length === 0 ? '(không có)' : cho_phep.join(', ')}.`,
    );
  }

  kiemSoViTri(khai, vi_tri.length);
  return { vi_tri, gia_tri, nhieu, bat, json: false };
}
