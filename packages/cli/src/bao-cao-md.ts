/**
 * **Đọc file báo cáo markdown** cho `baton submit <lượt> <file-bao-cao.md>` —
 * SPEC mục 13 d.366: "Nộp báo cáo (**file theo mẫu 5 mục ở mục 5**); đóng phiên".
 *
 * Mục 5 d.166–168 cho cấu trúc báo cáo: **Kết quả** (`done`/`partial`/`blocked`)
 * cộng năm mục **Đã làm · Kiểm chứng · Nhánh và commit · Rủi ro, điều cần xem kỹ
 * · Việc phát sinh (không tự làm)**. 19.12 câu 34 chốt: **chỉ `Kết quả` bắt
 * buộc**, năm mục còn lại được để trống.
 *
 * **SPEC không nói file markdown đó trông thế nào** — không nói mục là tiêu đề
 * `##` hay một dòng `Mục: nội dung`, và `Kết quả` lấy từ đâu khi bảng lệnh d.366
 * không có cờ nào cho nó. Đã ghi `cau-hoi-spec.md` **#84**; dưới đây là hướng
 * tạm, chọn sao cho nó **chỉ đọc được đúng thứ mục 5 kể**, không đoán thêm:
 *
 *   * Mục bắt đầu ở một **tiêu đề markdown** (`#` tới `######`) mà **chữ tiêu đề
 *     khớp một nhãn của mục 5**; nội dung là mọi dòng tới tiêu đề khớp kế tiếp.
 *   * So khớp: bỏ khoảng trắng hai đầu, bỏ dấu `:` cuối, bỏ số thứ tự đầu dòng
 *     (`1.`, `2)`), **không** phân biệt hoa/thường. Nhận cả nhãn **đầy đủ** của
 *     mục 5 và dạng **ngắn** ("Rủi ro", "Việc phát sinh"), vì chính SPEC viết
 *     phần trong ngoặc như một lời giải thích.
 *   * **`Kết quả` lấy từ chính file**, ở mục cùng tên: mã tiếng Anh `done`,
 *     `partial` hay `blocked` (d.381), nhận cả dạng viết ngay trên dòng tiêu đề
 *     (`## Kết quả: done`). Thiếu hoặc sai mã → `INVALID_INPUT`, kể đủ ba mã kèm
 *     nhãn tiếng Việt.
 *   * Tiêu đề **không khớp** nhãn nào thì phần dưới nó bị **bỏ qua**, không phải
 *     lỗi: một báo cáo thật thường có tiêu đề riêng ở đầu file.
 *
 * Mọi lỗi ở đây là `INVALID_INPUT` kèm **đường dẫn** file — mã thoát 1.
 */

import {
  BatonError,
  MUC_BAO_CAO,
  NHAN_MUC_BAO_CAO,
  danhSachMa,
  laMaHopLe,
  nhan,
  type MucBaoCao,
} from '@baton/shared';

/** Nhãn của mục "Kết quả" trong file — mục 5 d.167. */
export const NHAN_KET_QUA = 'Kết quả';

/**
 * Nhãn (và dạng ngắn) của từng mục → tên trường API.
 *
 * Dạng ngắn có mặt vì phần trong ngoặc của mục 5 là lời giải thích, không phải
 * một phần bắt buộc của tên: "Rủi ro, điều cần xem kỹ" và "Việc phát sinh (không
 * tự làm)".
 */
const NHAN_PHU: Readonly<Record<MucBaoCao, readonly string[]>> = {
  da_lam: [],
  kiem_chung: [],
  nhanh_va_commit: [],
  rui_ro: ['Rủi ro'],
  viec_phat_sinh: ['Việc phát sinh'],
};

/** Chuẩn hoá chữ của một tiêu đề để so khớp. */
export function chuanHoaNhan(chu: string): string {
  return chu
    .trim()
    .replace(/^\d+\s*[.)]\s*/u, '')
    .replace(/\s*:+\s*$/u, '')
    .trim()
    .toLowerCase();
}

function soTra(): Map<string, MucBaoCao | 'ket_qua'> {
  const so = new Map<string, MucBaoCao | 'ket_qua'>();
  so.set(chuanHoaNhan(NHAN_KET_QUA), 'ket_qua');
  for (const m of MUC_BAO_CAO) {
    so.set(chuanHoaNhan(NHAN_MUC_BAO_CAO[m]), m);
    for (const phu of NHAN_PHU[m]) so.set(chuanHoaNhan(phu), m);
  }
  return so;
}

export interface BaoCaoDaDoc {
  ket_qua: string;
  muc: Record<MucBaoCao, string | null>;
}

/** Một dòng tiêu đề markdown → (chữ tiêu đề, phần viết ngay sau dấu `:`). */
const MAU_TIEU_DE = /^ {0,3}#{1,6}\s+(.*)$/u;

export function docBaoCaoMd(chu: string, duong: string): BaoCaoDaDoc {
  const so = soTra();
  const than = new Map<MucBaoCao | 'ket_qua', string[]>();
  let dang_o: MucBaoCao | 'ket_qua' | null = null;

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
    // `## Kết quả: done` — chữ sau dấu hai chấm là nội dung, không phải tên mục.
    const dau_hai_cham = tieu_de.indexOf(':');
    const phan_dau = dau_hai_cham === -1 ? tieu_de : tieu_de.slice(0, dau_hai_cham);
    const phan_sau = dau_hai_cham === -1 ? '' : tieu_de.slice(dau_hai_cham + 1).trim();

    const muc = so.get(chuanHoaNhan(tieu_de)) ?? so.get(chuanHoaNhan(phan_dau));
    if (muc === undefined) {
      // Tiêu đề lạ **kết thúc** mục đang đọc: nội dung dưới nó không thuộc mục nào.
      dang_o = null;
      continue;
    }
    dang_o = muc;
    than.set(muc, phan_sau === '' ? [] : [phan_sau]);
  }

  const ket_qua_tho = (than.get('ket_qua') ?? []).join('\n').trim();
  // "done (Xong)" hay "done." vẫn đọc được: lấy **từ đầu tiên** gồm chữ cái.
  const ket_qua = /^[a-z_]+/u.exec(ket_qua_tho.toLowerCase())?.[0] ?? '';
  if (!laMaHopLe('ket_qua_nop', ket_qua)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `File "${duong}" thiếu mục "${NHAN_KET_QUA}" hợp lệ (SPEC mục 5: trường bắt buộc duy ` +
        `nhất của báo cáo). Các mã: ` +
        danhSachMa('ket_qua_nop')
          .map((m) => `${m} (${nhan('ket_qua_nop', m)})`)
          .join(', '),
    });
  }

  const muc = {} as Record<MucBaoCao, string | null>;
  for (const m of MUC_BAO_CAO) {
    const v = (than.get(m) ?? []).join('\n').trim();
    muc[m] = v === '' ? null : v;
  }

  return { ket_qua, muc };
}
