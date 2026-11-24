/**
 * Bộ phân tích tham số dòng lệnh — tự viết, **không thêm phụ thuộc** (phần 5
 * chưa cần một thư viện tham số, và mỗi phụ thuộc là một thứ phải kiểm).
 *
 * Dạng nhận: `baton <lệnh> [vị trí...] [--co] [--co giá-trị] [--co=giá-trị]`.
 *
 * `--json` **không** do lệnh khai: nó được thêm vào mọi lệnh ở đây (SPEC mục 13
 * d.380 "Mọi lệnh có `--json`"), nên một lệnh mới không có cách nào quên nó.
 */

import { BatonError } from '@baton/shared';

/**
 * Tuỳ chọn có nhận giá trị hay không, và **gõ lại được mấy lần**.
 *
 *   * `bat` — cờ bật/tắt, không nhận giá trị.
 *   * `gia_tri` — nhận một giá trị; gõ hai lần thì lần sau **ghi đè**.
 *   * `nhieu_gia_tri` — **lặp được**, mỗi lần gõ thêm một phần tử, giữ thứ tự gõ.
 *
 * `nhieu_gia_tri` sinh ra từ `baton ask` (d.375 viết `[--option "A: ..."]...`,
 * dấu `...` là "lặp được"), nhưng nó là **một kiểu cờ chung** chứ không phải một
 * đặc cách của `ask`: `--ticket` (mục 8 d.240 "ticket liên quan (nhiều)") và
 * `--file` (d.238 "ít nhất 1 file hoặc link") cùng cần đúng hành vi này, và
 * `--ref` của `baton decision` (d.377) cũng vậy.
 */
export type KieuCo = 'gia_tri' | 'bat' | 'nhieu_gia_tri';

export interface KhaiLenh {
  ten: string;
  /** Tên các tham số vị trí **bắt buộc**, theo thứ tự (để in cách dùng). */
  readonly vi_tri: readonly string[];
  /**
   * Tham số vị trí **tuỳ chọn**, sau các tham số bắt buộc — in trong ngoặc
   * vuông, đúng như SPEC viết: `baton heartbeat [ghi chú]` (d.362).
   */
  readonly vi_tri_tuy_chon?: readonly string[];
  /** Tuỳ chọn riêng của lệnh. `--json` tự có ở mọi lệnh. */
  readonly co: Readonly<Record<string, KieuCo>>;
  /**
   * Một dòng ghi chú in **dưới** dòng "Cách dùng" (vd `baton export`: "chỉ chạy được
   * với TOKEN_CHU"). Tuỳ chọn; lệnh không khai thì cách dùng giữ nguyên một dòng.
   */
  readonly ghi_chu?: string;
}

export const CO_JSON = 'json';

export interface ThamSoDaPhanTich {
  readonly vi_tri: readonly string[];
  /** Tuỳ chọn `gia_tri` đã gõ; thiếu = không gõ. */
  readonly gia_tri: Readonly<Record<string, string>>;
  /**
   * Tuỳ chọn `nhieu_gia_tri` đã gõ, **theo thứ tự gõ**. Cờ khai kiểu đó mà không
   * gõ lần nào thì có khoá với mảng **rỗng** — nên lệnh không phải phân biệt
   * `undefined` với `[]`.
   */
  readonly nhieu: Readonly<Record<string, readonly string[]>>;
  /** Tuỳ chọn `bat` đã gõ. */
  readonly bat: ReadonlySet<string>;
  /** `--json` (đọc riêng vì nó áp cho mọi lệnh). */
  readonly json: boolean;
}

export function cachDung(khai: KhaiLenh): string {
  const co = Object.entries(khai.co).map(([ten, kieu]) => {
    if (kieu === 'bat') return `[--${ten}]`;
    // `...` sau cờ lặp — đúng cách d.375 viết `[--option "A: ..."]...`.
    return kieu === 'nhieu_gia_tri' ? `[--${ten} <giá trị>]...` : `[--${ten} <giá trị>]`;
  });
  const dong = [
    'Cách dùng: baton',
    khai.ten,
    ...khai.vi_tri.map((v) => `<${v}>`),
    ...(khai.vi_tri_tuy_chon ?? []).map((v) => `[${v}]`),
    ...co,
    '[--json]',
  ].join(' ');
  return khai.ghi_chu === undefined ? dong : `${dong}\n${khai.ghi_chu}`;
}

/**
 * Một lỗi gõ sai tham số: `INVALID_INPUT` + **cách dùng** của chính lệnh đó.
 *
 * Tách ra khỏi thân `phanTich` vì đường **MCP** (`mcp/tham-so.ts`) nhận tham số
 * dưới dạng một object JSON chứ không phải một dãy chữ, nên nó không gọi được
 * `phanTich`, nhưng nó phải báo lỗi **y hệt** — cùng mã lỗi, cùng dòng cách
 * dùng. Hai đường gọi chung một hàm thì không có bản thứ hai để trôi.
 */
export const loiThamSo: (khai: KhaiLenh, message: string) => never = (khai, message) => {
  throw new BatonError('INVALID_INPUT', { message: `${message}\n${cachDung(khai)}` });
};

/**
 * **Luật số lượng tham số vị trí — một chỗ duy nhất**, dùng chung cho CLI và MCP.
 *
 * Thiếu hoặc thừa đều `INVALID_INPUT` (mã thoát 1): đó là thứ người gọi sửa được.
 */
export function kiemSoViTri(khai: KhaiLenh, so: number): void {
  const toi_thieu = khai.vi_tri.length;
  const toi_da = toi_thieu + (khai.vi_tri_tuy_chon ?? []).length;
  if (so < toi_thieu || so > toi_da) {
    loiThamSo(
      khai,
      `Lệnh "${khai.ten}" cần ${toi_thieu === toi_da ? String(toi_thieu) : `${String(toi_thieu)}–${String(toi_da)}`} tham số, nhận được ` +
        `${String(so)}.`,
    );
  }
}

/**
 * Phân tích tham số của một lệnh.
 *
 * Mọi lỗi gõ sai (tuỳ chọn lạ, thiếu giá trị, thiếu hoặc thừa tham số vị trí) là
 * `INVALID_INPUT` — tức **mã thoát 1** qua bảng duy nhất của `@baton/shared`,
 * đúng phân lớp của d.380: không phải lỗi xác thực, không phải lỗi mạng.
 */
export function phanTich(khai: KhaiLenh, doi_so: readonly string[]): ThamSoDaPhanTich {
  const vi_tri: string[] = [];
  const gia_tri: Record<string, string> = {};
  const nhieu: Record<string, string[]> = {};
  for (const [ten, kieu] of Object.entries(khai.co)) {
    if (kieu === 'nhieu_gia_tri') nhieu[ten] = [];
  }
  const bat = new Set<string>();
  /*
   * Kiểu khai **trên biến** (không chỉ trên hàm): TypeScript chỉ coi một lời gọi
   * là "không bao giờ trả về" (để thu hẹp kiểu sau đó) khi biến có kiểu khai
   * tường minh.
   */
  const sai: (message: string) => never = (message) => loiThamSo(khai, message);

  for (let i = 0; i < doi_so.length; i += 1) {
    const d = doi_so[i] ?? '';
    if (!d.startsWith('--')) {
      vi_tri.push(d);
      continue;
    }
    const sau_gach = d.slice(2);
    const dau_bang = sau_gach.indexOf('=');
    const ten = dau_bang === -1 ? sau_gach : sau_gach.slice(0, dau_bang);
    const gan = dau_bang === -1 ? undefined : sau_gach.slice(dau_bang + 1);

    if (ten === CO_JSON) {
      if (gan !== undefined) sai(`Tuỳ chọn --${CO_JSON} không nhận giá trị.`);
      bat.add(CO_JSON);
      continue;
    }

    const kieu = khai.co[ten];
    if (kieu === undefined) sai(`Lệnh "${khai.ten}" không có tuỳ chọn --${ten}.`);
    if (kieu === 'bat') {
      if (gan !== undefined) sai(`Tuỳ chọn --${ten} không nhận giá trị.`);
      bat.add(ten);
      continue;
    }

    let gia: string;
    if (gan !== undefined) {
      gia = gan;
    } else {
      const ke = doi_so[i + 1];
      if (ke === undefined || ke.startsWith('--')) sai(`Tuỳ chọn --${ten} cần một giá trị.`);
      gia = ke ?? '';
      i += 1;
    }

    if (kieu === 'nhieu_gia_tri') {
      // Khoá đã được khởi tạo ở đầu hàm cho **mọi** cờ lặp đã khai.
      nhieu[ten]?.push(gia);
      continue;
    }
    gia_tri[ten] = gia;
  }

  kiemSoViTri(khai, vi_tri.length);

  return { vi_tri, gia_tri, nhieu, bat, json: bat.has(CO_JSON) };
}
