/**
 * **Đọc file brief markdown** cho `--brief f.md` của `baton create` (SPEC mục 13
 * d.367) và `baton assign` (d.368).
 *
 * Brief là **8 trường có cấu trúc** của mục 4 d.112: Mục tiêu · Bối cảnh · Phạm
 * vi · File và nguồn liên quan · Điều cấm · Xong là gì · Cách kiểm chứng · Nộp
 * lại. Bảng lệnh chỉ viết `--brief f.md` và **không nói file đó trông thế nào** —
 * `spec-questions.md` **#89**.
 *
 * Hướng tạm: **đúng một bộ luật đọc với `bao-cao-md.ts`**, chỉ đổi bảng nhãn.
 * Một người đã biết viết file báo cáo của `baton submit` không phải học thêm một
 * quy ước thứ hai, và sửa luật đọc thì sửa một chỗ:
 *
 *   * Mục bắt đầu ở một **tiêu đề markdown** (`#` … `######`) mà chữ tiêu đề khớp
 *     một nhãn của mục 4; nội dung là mọi dòng tới tiêu đề khớp kế tiếp.
 *   * So khớp qua `chuanHoaNhan`: bỏ khoảng trắng hai đầu, bỏ `:` cuối, bỏ số thứ
 *     tự đầu dòng, **không** phân biệt hoa/thường. Nhận cả dạng ngắn mà chính SPEC
 *     viết trong ngoặc ở các brief mẫu ("File và nguồn", "Xong là gì?").
 *   * Tiêu đề **không khớp** nhãn nào thì phần dưới nó bị **bỏ qua**, không phải
 *     lỗi: một file brief thật thường mở đầu bằng tiêu đề riêng.
 *
 * Khác `bao-cao-md.ts` ở **một** điểm, và đó là luật của SPEC chứ không phải một
 * chọn lựa: báo cáo có một trường **bắt buộc** (`Kết quả`), còn brief thì mục 4
 * ghi rõ "(có cấu trúc, **tuỳ chọn**)" — nên một file brief không khớp mục nào
 * **vẫn hợp lệ**, chỉ là không gửi lên trường nào. Không tự thêm một luật bắt
 * buộc mà SPEC không có.
 *
 * File không có / không đọc được → `INVALID_INPUT` kèm **đường dẫn** (mã thoát 1),
 * do `docFile` của `BoiCanhLenh` bọc sẵn (`moi-truong.ts`).
 */

import { NHAN_TRUONG_BRIEF, TRUONG_BRIEF, type Brief } from '@baton/shared';
import { chuanHoaNhan } from './bao-cao-md.js';

/** Nhãn phụ (dạng ngắn) chấp nhận cho từng trường brief. */
const NHAN_PHU: Readonly<Record<keyof Brief, readonly string[]>> = {
  muc_tieu: [],
  boi_canh: [],
  pham_vi: [],
  file_va_nguon: ['File và nguồn', 'File liên quan'],
  dieu_cam: [],
  xong_la_gi: ['Xong là gì?'],
  cach_kiem_chung: ['Kiểm chứng'],
  nop_lai: [],
};

function soTra(): Map<string, keyof Brief> {
  const so = new Map<string, keyof Brief>();
  for (const t of TRUONG_BRIEF) {
    so.set(chuanHoaNhan(NHAN_TRUONG_BRIEF[t]), t);
    for (const phu of NHAN_PHU[t]) so.set(chuanHoaNhan(phu), t);
  }
  return so;
}

/** Một dòng tiêu đề markdown — cùng mẫu với `bao-cao-md.ts`. */
const MAU_TIEU_DE = /^ {0,3}#{1,6}\s+(.*)$/u;

/**
 * Thân file brief → các trường brief **có nội dung**. Trường không có trong file
 * thì **vắng mặt** (không phải `null`): với `baton assign`, vắng mặt nghĩa là "lấy
 * brief của ticket" còn `null` nghĩa là "xoá trường đó cho lượt này" — hai ý khác
 * nhau (mục 5 d.156 "Brief lấy từ ticket nếu có, cho sửa riêng cho lượt này").
 */
export function docBriefMd(chu: string): Partial<Record<keyof Brief, string>> {
  const so = soTra();
  const than = new Map<keyof Brief, string[]>();
  let dang_o: keyof Brief | null = null;

  for (const dong of chu.split('\n')) {
    const khop = MAU_TIEU_DE.exec(dong);
    if (khop === null) {
      if (dang_o !== null) {
        const ds = than.get(dang_o);
        if (ds === undefined) than.set(dang_o, [dong]);
        else ds.push(dong);
      }
      continue;
    }

    const tieu_de = khop[1] ?? '';
    // `## Mục tiêu: dựng CLI` — chữ sau dấu hai chấm là nội dung, không phải tên mục.
    const dau_hai_cham = tieu_de.indexOf(':');
    const phan_dau = dau_hai_cham === -1 ? tieu_de : tieu_de.slice(0, dau_hai_cham);
    const phan_sau = dau_hai_cham === -1 ? '' : tieu_de.slice(dau_hai_cham + 1).trim();

    const truong = so.get(chuanHoaNhan(tieu_de)) ?? so.get(chuanHoaNhan(phan_dau));
    if (truong === undefined) {
      dang_o = null;
      continue;
    }
    dang_o = truong;
    than.set(truong, phan_sau === '' ? [] : [phan_sau]);
  }

  const ra: Partial<Record<keyof Brief, string>> = {};
  for (const t of TRUONG_BRIEF) {
    const v = (than.get(t) ?? []).join('\n').trim();
    if (v !== '') ra[t] = v;
  }
  return ra;
}
