/**
 * `baton ask --level urgent|today|later --type ... "<tiêu đề>" [--option "A: ..."]...
 * [--recommend A] [--command "..."] [--file ...] [--ticket MÃ] [--context f.md]`
 * — SPEC mục 13 d.375: "Tạo mục Cần Chủ, in `T-số`".
 *
 * ## Mã vào, nhãn ra (d.381)
 *
 * `--level` nhận mã nhóm `muc_can_chu` (`urgent` · `today` · `later`) và `--type`
 * nhận mã nhóm `loai_can_chu` (`decision` · `run_command` · `review` · `fyi`) —
 * **bảng 0.1 của `@baton/shared`**, không chép bảng thứ hai. Mã sai bị chặn **tại
 * CLI**, thông điệp kể đủ các mã kèm **nhãn tiếng Việt**.
 *
 * ## Chặn gì tại CLI, để gì cho máy chủ
 *
 * Cùng nếp `baton status` của lượt 5: chặn tại CLI đúng những luật **nhìn được từ
 * chính dòng lệnh**, và ném **đúng mã lỗi của SPEC** chứ không `INVALID_INPUT` —
 * mã lỗi là thứ agent đọc để quyết, nó phải giống nhau dù luật bắt ở tầng nào.
 *
 *   * `--type decision` mà **không gõ** `--option` → `OPTIONS_REQUIRED` (mục 8,
 *     phần Lỗi: "Loại `Quyết định` mà thiếu phương án"), và không gõ
 *     `--recommend` cũng vậy (d.236: "**cộng** phương án đề xuất và lý do").
 *   * `--type run_command` mà **không gõ** `--command` → `COMMAND_REQUIRED`
 *     (mục 8: "Loại `Chủ chạy lệnh` mà thiếu lệnh").
 *
 * **`--command` đi được với MỌI `--type`** (`spec-questions.md` #130): d.250 cho
 * mọi thẻ có "lệnh có nút Copy", và d.237 chỉ nói `run_command` **bắt buộc** có
 * lệnh, không nói loại khác không được có. Trước lượt này máy chủ **bỏ im lặng**
 * lệnh của ba loại kia — lỗi thật chủ gặp 13/10 ("mục kêu chạy lệnh nhưng không
 * thấy lệnh đâu"). CLI không thêm luật nào ở đây: `--command` luôn vào thân
 * request, `COMMAND_REQUIRED` vẫn chỉ áp cho `run_command`.
 *   * `--type review` mà **không gõ** `--file` → `INVALID_INPUT` — mục 8 d.238
 *     đòi "ít nhất 1 file hoặc link" nhưng phần Lỗi **không cấp mã riêng** cho
 *     nó, và `kiemFileReview` của `@baton/shared` cũng dùng `INVALID_INPUT`. Một
 *     bản luật, hai tầng cùng mã.
 *
 * **Để cho máy chủ**: số phương án 2–5, mỗi phương án 1–3 dòng, quyền tạo
 * (`FORBIDDEN` cho `worker`/`reviewer`), hạn mặc định 19.8, cờ "có thể trùng
 * T-x", ticket liên quan có thật và trong tầm. CLI không chép một dòng nào của
 * những luật đó.
 *
 * ## `--option "A: ..."` và `--recommend A` — nhãn ai gán
 *
 * **Máy chủ gán nhãn theo thứ tự gửi lên** (`NHAN_PHUONG_AN` của `@baton/shared`:
 * phương án thứ nhất là A, thứ hai là B…). Nên chữ `A:` trong ví dụ của d.375 chỉ
 * có một cách đọc không mâu thuẫn: nó **nhắc lại** nhãn mà vị trí đó sẽ nhận.
 * CLI vì vậy:
 *   * cắt tiền tố `X:` nếu có, và **bắt nó khớp vị trí** — gõ `--option "B: …"`
 *     ở chỗ thứ nhất là `INVALID_INPUT`, không im lặng đổi tên: `--recommend B`
 *     sau đó sẽ trỏ nhầm phương án;
 *   * cho **bỏ hẳn** tiền tố (`--option "Dùng Hono"`), vì nhãn vốn do vị trí
 *     quyết.
 * SPEC không nói tiền tố đó là chữ thật hay chữ minh hoạ — `spec-questions.md` #91.
 *
 * ## Lý do của phương án đề xuất — một vế SPEC đòi mà bảng lệnh không có chỗ
 *
 * d.236 bắt buộc "phương án đề xuất **và lý do**" (máy chủ ném `OPTIONS_REQUIRED`
 * khi thiếu), nhưng d.375 **không có cờ nào** mang lý do đó. Nên `--recommend`
 * nhận thêm dạng `"A: <lý do>"` — đúng hình của `--option`, và dạng trần `A` vẫn
 * chạy đúng chữ d.375. Thiếu lý do thì lỗi là `OPTIONS_REQUIRED` của máy chủ,
 * **không** bị CLI nuốt. Khai ở `spec-questions.md` #92.
 */

import { batonFetch } from '@baton/client';
import {
  BatonError,
  NHAN_PHUONG_AN,
  danhSachMa,
  laMaHopLe,
  nhan,
} from '@baton/shared';
import type { TaoCanChuRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { ticketTheoMaHoacId } from '../tra-ma.js';

/** Một mã của bảng 0.1, hoặc `INVALID_INPUT` kể đủ các mã kèm nhãn (d.381). */
function kiemMaCli<N extends 'muc_can_chu' | 'loai_can_chu'>(
  nhom: N,
  co: string,
  tho: string,
): string {
  if (!laMaHopLe(nhom, tho)) {
    throw new BatonError('INVALID_INPUT', {
      message: `"${tho}" không phải giá trị của --${co}. Các mã: ${keMa(nhom)}`,
    });
  }
  return tho;
}

/** `mã (Nhãn), mã (Nhãn)…` — d.381, đọc thẳng bảng 0.1, không chép bảng thứ hai. */
function keMa<N extends 'muc_can_chu' | 'loai_can_chu'>(nhom: N): string {
  return danhSachMa(nhom)
    .map((m) => `${m} (${nhan(nhom, m)})`)
    .join(', ');
}

/** `--level` → mã `muc_can_chu`. */
export function kiemMucCli(tho: string | undefined): string {
  if (tho === undefined) {
    throw new BatonError('INVALID_INPUT', {
      message: `Thiếu --level. Các mã: ${keMa('muc_can_chu')}`,
    });
  }
  return kiemMaCli('muc_can_chu', 'level', tho);
}

/** `--type` → mã `loai_can_chu`. */
export function kiemLoaiCli(tho: string | undefined): string {
  if (tho === undefined) {
    throw new BatonError('INVALID_INPUT', {
      message: `Thiếu --type. Các mã: ${keMa('loai_can_chu')}`,
    });
  }
  return kiemMaCli('loai_can_chu', 'type', tho);
}

/** `X: nội dung` → `{ nhan: 'X', noi_dung }`; không có tiền tố → `nhan: null`. */
export function tachNhanPhuongAn(tho: string): { nhan: string | null; noi_dung: string } {
  const khop = /^\s*([A-Za-z])\s*:\s*([\s\S]*)$/.exec(tho);
  if (khop === null) return { nhan: null, noi_dung: tho.trim() };
  return { nhan: (khop[1] ?? '').toUpperCase(), noi_dung: (khop[2] ?? '').trim() };
}

/**
 * `--option` lặp → danh sách phương án cho API, mỗi phần tử `{ noi_dung, de_xuat }`.
 *
 * Nhãn tiền tố (nếu gõ) phải **khớp vị trí** — xem khối chú thích đầu file.
 */
export function phuongAnTuCo(
  options: readonly string[],
  nhan_de_xuat: string | null,
): { noi_dung: string; de_xuat: boolean }[] {
  return options.map((tho, i) => {
    const { nhan: nh, noi_dung } = tachNhanPhuongAn(tho);
    const nhan_vi_tri = NHAN_PHUONG_AN[i];
    if (nh !== null && nhan_vi_tri !== undefined && nh !== nhan_vi_tri) {
      throw new BatonError('INVALID_INPUT', {
        message:
          `--option thứ ${String(i + 1)} mang nhãn "${nh}" nhưng máy chủ gán nhãn theo thứ tự ` +
          `gõ, nên chỗ này là "${nhan_vi_tri}". Sửa nhãn hoặc bỏ hẳn tiền tố.`,
      });
    }
    return { noi_dung, de_xuat: nhan_de_xuat !== null && (nh ?? nhan_vi_tri) === nhan_de_xuat };
  });
}

/** `--recommend` → `{ nhan, ly_do }`; `"A"` cũng được, `"A: vì …"` cũng được. */
export function tachDeXuat(tho: string): { nhan: string; ly_do: string | null } {
  const { nhan: nh, noi_dung } = tachNhanPhuongAn(tho);
  if (nh !== null) return { nhan: nh, ly_do: noi_dung === '' ? null : noi_dung };
  const trimmed = tho.trim().toUpperCase();
  if (!/^[A-Z]$/.test(trimmed)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `"${tho}" không phải nhãn phương án. Dùng một chữ cái ` +
        `(${NHAN_PHUONG_AN.join(', ')}), hoặc "A: <lý do đề xuất>".`,
    });
  }
  return { nhan: trimmed, ly_do: null };
}

export const LENH_ASK: LenhCli = {
  khai: {
    ten: 'ask',
    vi_tri: ['tiêu đề'],
    co: {
      level: 'gia_tri',
      type: 'gia_tri',
      option: 'nhieu_gia_tri',
      recommend: 'gia_tri',
      command: 'gia_tri',
      file: 'nhieu_gia_tri',
      ticket: 'nhieu_gia_tri',
      context: 'gia_tri',
    },
  },

  chay: async ({ cauHinh, docFile }, ts) => {
    const tieu_de = ts.vi_tri[0] ?? '';
    const muc = kiemMucCli(ts.gia_tri['level']);
    const loai = kiemLoaiCli(ts.gia_tri['type']);
    const option = ts.nhieu['option'] ?? [];
    const file = ts.nhieu['file'] ?? [];
    const ma_ticket = ts.nhieu['ticket'] ?? [];
    const lenh_chay = ts.gia_tri['command'];
    const duong_context = ts.gia_tri['context'];
    const recommend = ts.gia_tri['recommend'];

    // Trường bắt buộc theo loại — nhìn được từ chính dòng lệnh (xem đầu file).
    if (loai === 'decision' && option.length === 0) {
      throw new BatonError('OPTIONS_REQUIRED', {
        message:
          `Mục loại ${nhan('loai_can_chu', 'decision')} (decision) bắt buộc có phương án ` +
          '(SPEC mục 8): thêm --option "A: ..." --option "B: ...".',
      });
    }
    if (loai === 'decision' && recommend === undefined) {
      throw new BatonError('OPTIONS_REQUIRED', {
        message:
          `Mục loại ${nhan('loai_can_chu', 'decision')} (decision) bắt buộc có phương án đề ` +
          'xuất và lý do (SPEC mục 8 d.236): thêm --recommend "A: <lý do>".',
      });
    }
    if (loai === 'run_command' && lenh_chay === undefined) {
      throw new BatonError('COMMAND_REQUIRED', {
        message:
          `Mục loại ${nhan('loai_can_chu', 'run_command')} (run_command) bắt buộc có lệnh ` +
          '(SPEC mục 8): thêm --command "...".',
      });
    }
    if (loai === 'review' && file.length === 0) {
      throw new BatonError('INVALID_INPUT', {
        message:
          `Mục loại ${nhan('loai_can_chu', 'review')} (review) bắt buộc có ít nhất 1 file hoặc ` +
          'link (SPEC mục 8 d.238): thêm --file <đường dẫn hoặc link>.',
      });
    }

    const de_xuat = recommend === undefined ? null : tachDeXuat(recommend);
    const phuong_an =
      option.length === 0 ? null : phuongAnTuCo(option, de_xuat === null ? null : de_xuat.nhan);
    if (phuong_an !== null && de_xuat !== null && !phuong_an.some((p) => p.de_xuat)) {
      throw new BatonError('OPTIONS_REQUIRED', {
        message:
          `--recommend ${de_xuat.nhan} không trỏ tới phương án nào: đã gõ ` +
          `${String(option.length)} --option, tức nhãn ${NHAN_PHUONG_AN.slice(0, option.length).join(', ')}.`,
      });
    }

    // Đọc file **trước** khi gọi mạng: một đường dẫn sai không đáng tốn request nào.
    const boi_canh = duong_context === undefined ? null : await docFile(duong_context);

    // `--ticket MÃ` nhận **mã ticket**; API nhận **id** (cùng nếp `--parent` của
    // `baton create`). Một request mỗi mã, nên chỉ tra đúng số mã người gõ.
    const ticket: { id: string; ma: string; tieu_de: string }[] = [];
    for (const m of ma_ticket) ticket.push(await ticketTheoMaHoacId(cauHinh, m));

    const kq = await batonFetch<TaoCanChuRa>(cauHinh, {
      method: 'POST',
      path: '/v1/can-chu',
      body: {
        tieu_de,
        muc,
        // Route đổi `loai` → `loai_can_chu`, `lenh` → `lenh_chay` (xem `index.ts`).
        loai,
        ...(boi_canh === null ? {} : { boi_canh }),
        ...(phuong_an === null ? {} : { phuong_an }),
        ...(de_xuat?.ly_do == null ? {} : { ly_do_de_xuat: de_xuat.ly_do }),
        ...(lenh_chay === undefined ? {} : { lenh: lenh_chay }),
        ...(file.length === 0 ? {} : { file_hoac_link: file }),
        ...(ticket.length === 0 ? {} : { ticket_lien_quan: ticket.map((t) => t.id) }),
      },
    });

    const dong: string[] = [
      `Đã tạo mục Cần Chủ ${kq.ma}: ${kq.tieu_de}`,
      `Mức: ${nhan('muc_can_chu', kq.muc)} (${kq.muc})`,
      `Loại: ${nhan('loai_can_chu', kq.loai_can_chu)} (${kq.loai_can_chu})`,
      `Trạng thái: ${nhan('trang_thai_can_chu', kq.trang_thai)} (${kq.trang_thai})`,
      `Dự án: ${kq.project_id ?? 'Chung'}`,
    ];
    if (kq.muc_da_ha) {
      // 19.8: server tự hạ 🔴 → 🟡 cho `fyi` và **báo lại cho agent**. Nuốt dòng
      // này là để agent tin mục của mình vẫn đang gấp.
      dong.push(`Lưu ý: ${kq.ghi_chu_muc ?? 'mức đã bị hạ theo SPEC 19.8.'}`);
    }
    dong.push(
      kq.han_luc === null
        ? 'Hạn: không có'
        : `Hạn: ${new Date(kq.han_luc).toISOString()}${kq.han_mac_dinh ? ' (mặc định của SPEC 19.8)' : ''}`,
    );
    if (kq.co_the_trung_ma !== null) {
      dong.push(`Cờ: có thể trùng ${kq.co_the_trung_ma} (mục vẫn được tạo — SPEC mục 8).`);
    }
    for (const t of ticket) dong.push(`Ticket liên quan: ${t.ma} — ${t.tieu_de}`);
    dong.push(`Đọc kết quả: baton result ${kq.ma} --wait 60`);

    return { json: kq, dong };
  },
};
