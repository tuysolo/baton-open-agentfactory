/**
 * `baton result T-<số> [--wait 60]` — SPEC mục 13 d.376: "In **trạng thái** và
 * **kết quả** của mục; `--wait` thì chờ tới khi xử lý xong".
 *
 * ## Đây là lệnh duy nhất phát **mã thoát 4**
 *
 * 19.9 **d.543**: "`baton result --wait` hết thời gian mà mục chưa xử lý: in
 * 'chưa xử lý', thoát **mã 4**. Bảng mã thoát ở mục 13 được bổ sung: 4 = hết thời
 * gian chờ." Nên điều kiện phát mã 4 là **hai vế cùng lúc**, không một vế nào:
 *
 *   1. có `--wait` (không chờ thì không có "hết thời gian chờ"), **và**
 *   2. máy chủ trả `het_gio: true` mà mục vẫn **chưa rời `open`**.
 *
 * `baton result T-x` **không** `--wait`, mục còn `open` → **mã 0**: đó là câu trả
 * lời đúng của d.376 ("in trạng thái"), không phải một lần chờ hết giờ.
 *
 * **Ranh giới với `baton evidence`** (`spec-questions.md` #87), đừng "thống nhất"
 * hai chỗ này: `evidence` hết 10 giây mà xác minh còn `pending` thì ra **mã 0**,
 * còn ở đây ra **mã 4**, và chúng khác nhau có lý do, không phải do sơ ý.
 *   * d.543 gắn mã 4 vào **đúng một lệnh** — `baton result --wait`. Nó là câu
 *     SPEC duy nhất định nghĩa mã 4, và nó nêu đích danh lệnh này.
 *   * `pending` của bằng chứng là **đường đi bình thường** của mục 7 d.220 (máy
 *     chủ tự thử lại sau 5 phút, agent **không** được gửi lại) — tức một kết quả,
 *     không phải một lần chờ trượt. Mục 7 không có mã thoát nào cho nó.
 * Gộp hai ca lại là biến một trong hai thành hành vi sai: hoặc agent gửi lại bằng
 * chứng đã gửi, hoặc một lần chờ hết giờ im lặng thành "xong".
 *
 * ## `--wait` tối đa 60 giây, tính 1 request
 *
 * Trần nằm ở **máy chủ** (`msChoDai` kẹp về 60 và trả lại `cho_toi_da_giay`), nên
 * CLI không chép con số đó — dùng lại đúng `kiemWait` của `baton tasks`, một bản
 * duy nhất. d.387 ("lệnh chờ dài tính 1 request") cũng là luật của máy chủ; CLI
 * bắn **một** `GET`, không hỏi vòng.
 *
 * `T-<số>` đi thẳng vào đường dẫn: `GET /v1/can-chu/:id` nhận **cả** `T-số` lẫn
 * id (một chỗ dịch duy nhất ở `canChuBatBuoc`), nên CLI không tra mã trước —
 * không tốn request nào, và `--json` của `baton ask` trả `id` dùng lại được ngay.
 */

import { batonFetch } from '@baton/client';
import { MA_THOAT, nhan } from '@baton/shared';
import type { KetQuaCanChuRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { kiemWait } from './tasks.js';

export const LENH_RESULT: LenhCli = {
  khai: { ten: 'result', vi_tri: ['T-số'], co: { wait: 'gia_tri' } },

  chay: async ({ cauHinh }, ts) => {
    const ma = ts.vi_tri[0] ?? '';
    const wait = kiemWait(ts.gia_tri['wait']);

    const kq = await batonFetch<KetQuaCanChuRa>(cauHinh, {
      method: 'GET',
      path: `/v1/can-chu/${encodeURIComponent(ma)}`,
      query: { wait },
    });

    const dong: string[] = [
      `${kq.ma} — ${kq.tieu_de}`,
      `Mức: ${nhan('muc_can_chu', kq.muc)} (${kq.muc}) · ` +
        `Loại: ${nhan('loai_can_chu', kq.loai)} (${kq.loai})`,
      `Trạng thái: ${nhan('trang_thai_can_chu', kq.trang_thai)} (${kq.trang_thai})`,
    ];

    if (kq.da_xu_ly) {
      if (kq.phuong_an_da_chon !== null) {
        dong.push(
          `Phương án đã chọn: ${kq.phuong_an_da_chon.nhan} — ${kq.phuong_an_da_chon.noi_dung}`,
        );
      }
      if (kq.ket_luan_review !== null) dong.push(`Kết luận review: ${kq.ket_luan_review}`);
      if (kq.ket_qua !== null) dong.push(`Kết quả: ${kq.ket_qua}`);
      if (kq.ly_do_bo_qua !== null) dong.push(`Lý do bỏ qua: ${kq.ly_do_bo_qua}`);
      if (kq.mo_lai_lan > 0) dong.push(`Đã mở lại ${String(kq.mo_lai_lan)} lần (mục 8 d.246).`);
      return { json: kq, dong };
    }

    /*
     * **Chưa xử lý.** d.543 đòi đúng chữ "chưa xử lý" ở đầu ra người đọc, và mã
     * thoát 4 **chỉ khi** đã thật sự chờ và máy chủ báo hết giờ.
     */
    dong.push('Chưa xử lý.');
    if (!kq.het_gio) return { json: kq, dong };

    dong.push(
      `Đã chờ ${String(Math.round(kq.da_cho_ms / 1000))} giây mà mục vẫn chưa được xử lý ` +
        `(trần chờ của máy chủ: ${String(kq.cho_toi_da_giay)} giây) — SPEC 19.9 d.543, ` +
        'mã thoát 4.',
    );
    return { json: kq, dong, ma_thoat: MA_THOAT.het_thoi_gian_cho };
  },
};
