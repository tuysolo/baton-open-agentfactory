/**
 * `baton evidence <MÃ> <type> <giá trị> [...]` — SPEC mục 13 d.365: "Gửi bằng
 * chứng; **chờ xác minh tối đa 10 giây** rồi in kết quả".
 *
 * ## `<type>` và `<giá trị> [...]`
 *
 * `<type>` nhận **mã tiếng Anh** của bảng 0.1 (d.381), chặn **tại CLI**, thông
 * điệp kể đủ 6 loại kèm **nhãn tiếng Việt** — bảng của `@baton/shared`.
 *
 * SPEC viết `<giá trị> [...]` và **không nói giá trị nào ứng với trường nào** của
 * từng loại; bảng mục 7 d.204–211 thì nói rõ mỗi loại gồm những gì.
 * `spec-questions.md` **#88**; hướng tạm ở `HINH_GIA_TRI` dưới đây là **đọc thẳng
 * bảng d.204–211 theo đúng thứ tự SPEC viết trong ô "Giá trị"**, không thêm bớt:
 *
 *   | loại | `<giá trị>` | `[...]` |
 *   |---|---|---|
 *   | `commit` | hash | repo (tuỳ chọn — "lấy từ hồ sơ dự án nếu không ghi") |
 *   | `deploy` | URL | mã phiên bản (tuỳ chọn, d.207) |
 *   | `review` | `pass`/`fail` | ghi chú (tuỳ chọn) |
 *   | `test`   | tóm tắt | `pass`/`fail` — **bắt buộc**, d.209 "tóm tắt **+ cờ đạt**" |
 *   | `file`   | đường dẫn | — |
 *   | `note`   | chữ | — |
 *   | `bao_cao` (gõ `bao-cao` cũng được) | đường dẫn báo cáo, hoặc `-` | — ; nội dung qua `--noi-dung`, báo cáo reviewer của manager qua `--bao-cao` (T-31, #161) |
 *
 * `pass`/`fail` của `review` là mã 0.1 nhóm `ket_luan_review`, chặn tại CLI. Với
 * `test`, bảng 0.1 **không có nhóm nào** cho "cờ đạt" (nó là một boolean ở API),
 * nên CLI nhận đúng hai chữ `pass`/`fail` cho nhất quán với `review` và đổi sang
 * boolean — cũng ghi trong #88.
 *
 * Luật **nội dung** (hash ≥ 7 ký tự, URL phải `https://` và không trỏ nội bộ…)
 * nằm ở `kiemNoiDungBangChung` của `@baton/shared`, chạy ở cửa ghi. CLI không
 * chép: hai bản sẽ lệch, và bản ở client thì bỏ qua được.
 *
 * ## "Chờ xác minh tối đa 10 giây" — ai đếm 10 giây đó
 *
 * **Máy chủ đếm.** `POST /v1/ticket/:id/bang-chung` chạy xác minh **ngay trong
 * request** với trần `TRAN_XAC_MINH_MS` (= 10 giây, cùng con số của mục 7 d.219 và
 * d.365 — một hằng, một chỗ), rồi trả kết quả. Nên "chờ tối đa 10 giây" của CLI
 * **là** việc chờ phản hồi đó; đặt thêm một đồng hồ 10 giây ở client là cắt ngang
 * đúng request mà server sắp trả lời (10 giây của server **cộng** độ trễ mạng đã
 * quá 10 giây), và agent sẽ gửi lại — thành hai dòng bằng chứng cho một việc.
 *
 * `HAN_CHO_CLI_MS` dưới đây **không phải** bản thứ hai của luật 10 giây: nó là một
 * lưới an toàn **trên** trần đó, để một máy chủ treo không treo luôn agent. Chạm
 * nó thì `fetch` huỷ và lỗi đi đường "mạng" của d.380 → **mã thoát 2**.
 *
 * Hết 10 giây mà **chưa xác minh xong** thì **không** phải lỗi: d.220 nói rõ trạng
 * thái lúc đó là `pending` và server tự thử lại sau 5 phút. Nên lệnh in `pending`
 * kèm lý do và thoát **0**. SPEC **không** nói mã thoát nào cho ca này —
 * `spec-questions.md` **#87**, đây là hướng tạm, không phải một chọn lựa im lặng.
 */

import { batonFetch } from '@baton/client';
import {
  BatonError,
  NHAN_NGUON_BAO_CAO,
  NHAN_NGUON_REVIEW,
  NHAN_NGUON_XAC_MINH,
  TRAN_XAC_MINH_MS,
  danhSachMa,
  laMaHopLe,
  nhan,
} from '@baton/shared';
import { daMergeCucBo } from '../git-cuc-bo.js';
import type { GuiBangChungRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { ticketTheoMaHoacId } from '../tra-ma.js';

/**
 * Lưới an toàn **trên** trần 10 giây của server — xem khối chú thích đầu file.
 * Biên 5 giây là chỗ cho độ trễ mạng và cho lượt ghi kết luận (chặng 3).
 */
export const HAN_CHO_CLI_MS = TRAN_XAC_MINH_MS + 5_000;

/**
 * Hạn **đang dùng**. Bằng `HAN_CHO_CLI_MS` trong mọi lần chạy thật; chỉ
 * `tiemHanChoCli` đổi được nó.
 */
let han_dang_dung = HAN_CHO_CLI_MS;

/**
 * **Chỗ cắm cho test** — hạ hằng số 15 giây xuống vài chục mili giây.
 *
 * Cùng loại với `tiemNguonXacMinh` của API: không có nó thì ca "chạm lưới an
 * toàn → mã thoát 2" hoặc phải chạy thật 15 giây, hoặc **không được viết** —
 * và lời khai ở khối chú thích đầu file sẽ là một khẳng định chưa ai kiểm.
 *
 * Không phải cửa hậu: nó không đọc biến môi trường và không có đường HTTP nào
 * gọi tới; muốn đổi hạn thì phải **nhập được module này**, tức đã ở trong tiến
 * trình. `null` trả về mặc định.
 */
export function tiemHanChoCli(ms: number | null): void {
  han_dang_dung = ms ?? HAN_CHO_CLI_MS;
}

export function hanChoCliMs(): number {
  return han_dang_dung;
}

/** Tên hai tham số vị trí của từng loại, để in thông điệp lỗi đúng chỗ. */
interface HinhGiaTri {
  /** Tên `<giá trị>` trong thông điệp. */
  ten_1: string;
  /** Tên `[...]`; `null` = loại này **không** nhận giá trị thứ hai. */
  ten_2: string | null;
  /** Giá trị thứ hai có bắt buộc không (chỉ `test` — d.209). */
  bat_buoc_2: boolean;
}

export const HINH_GIA_TRI: Readonly<Record<string, HinhGiaTri>> = {
  commit: { ten_1: 'hash commit', ten_2: 'repo', bat_buoc_2: false },
  deploy: { ten_1: 'URL', ten_2: 'mã phiên bản', bat_buoc_2: false },
  review: { ten_1: 'kết luận (pass|fail)', ten_2: 'ghi chú', bat_buoc_2: false },
  test: { ten_1: 'tóm tắt', ten_2: 'cờ đạt (pass|fail)', bat_buoc_2: true },
  file: { ten_1: 'đường dẫn', ten_2: null, bat_buoc_2: false },
  note: { ten_1: 'nội dung', ten_2: null, bat_buoc_2: false },
  /*
   * `bao_cao` (T-31 câu 3.4 A, #161): `<giá trị>` là **đường dẫn báo cáo**; nội
   * dung đi bằng `--noi-dung`. Chỉ gửi nội dung thì gõ `-` vào ô đường dẫn
   * (`KHONG_DUONG_DAN`) — giữ nguyên số tham số vị trí của `evidence` (và schema
   * MCP), không đổi nghĩa `<giá trị>` của sáu loại kia.
   */
  bao_cao: { ten_1: 'đường dẫn báo cáo (hoặc - nếu chỉ có --noi-dung)', ten_2: null, bat_buoc_2: false },
};

/** Ô đường dẫn của `bao_cao` gõ `-` = "không có đường dẫn, chỉ có `--noi-dung`". */
export const KHONG_DUONG_DAN = '-';

/**
 * Chuẩn hoá `<type>`: nhận `bao-cao` (gạch ngang, dễ gõ trên shell) như
 * `bao_cao` (mã của `@baton/shared`). Mã khác giữ nguyên.
 */
export function chuanHoaLoai(loai: string): string {
  return loai === 'bao-cao' ? 'bao_cao' : loai;
}

/** `pass`/`fail` → boolean, cho **cờ đạt** của `test` (d.209). */
function coDat(tho: string): boolean {
  if (tho === 'pass') return true;
  if (tho === 'fail') return false;
  throw new BatonError('INVALID_INPUT', {
    message:
      `"${tho}" không phải cờ đạt của bằng chứng test. Dùng pass ` +
      `(${nhan('ket_luan_review', 'pass')}) hoặc fail (${nhan('ket_luan_review', 'fail')}).`,
  });
}

/** `<type>` + hai giá trị vị trí → thân request của `POST .../bang-chung`. */
export function thanBangChung(
  loai_go: string,
  gt1: string,
  gt2: string | undefined,
): Record<string, unknown> {
  const loai = chuanHoaLoai(loai_go);
  if (!laMaHopLe('loai_bang_chung', loai)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `"${loai}" không phải loại bằng chứng. Các mã: ` +
        danhSachMa('loai_bang_chung')
          .map((m) => `${m} (${nhan('loai_bang_chung', m)})`)
          .join(', '),
    });
  }

  const hinh = HINH_GIA_TRI[loai];
  /* istanbul ignore next — `HINH_GIA_TRI` phủ đủ 6 mã của bảng 0.1. */
  if (hinh === undefined) throw new BatonError('INVALID_INPUT');

  if (hinh.ten_2 === null && gt2 !== undefined) {
    throw new BatonError('INVALID_INPUT', {
      message: `Bằng chứng ${loai} chỉ nhận một giá trị: ${hinh.ten_1}.`,
    });
  }
  if (hinh.bat_buoc_2 && gt2 === undefined) {
    throw new BatonError('INVALID_INPUT', {
      message: `Bằng chứng ${loai} cần hai giá trị: ${hinh.ten_1} rồi ${String(hinh.ten_2)}.`,
    });
  }

  switch (loai) {
    case 'commit':
      return { loai_bang_chung: loai, commit_hash: gt1, ...(gt2 === undefined ? {} : { repo: gt2 }) };
    case 'deploy':
      return { loai_bang_chung: loai, url: gt1, ma_phien_ban: gt2 ?? null };
    case 'review':
      if (!laMaHopLe('ket_luan_review', gt1)) {
        throw new BatonError('INVALID_INPUT', {
          message:
            `"${gt1}" không phải kết luận review. Các mã: ` +
            danhSachMa('ket_luan_review')
              .map((m) => `${m} (${nhan('ket_luan_review', m)})`)
              .join(', '),
        });
      }
      return { loai_bang_chung: loai, ket_luan: gt1, ghi_chu: gt2 ?? null };
    case 'test':
      return { loai_bang_chung: loai, tom_tat: gt1, dat: coDat(gt2 ?? '') };
    case 'file':
      return { loai_bang_chung: loai, duong_dan: gt1 };
    case 'bao_cao':
      // Nội dung (`--noi-dung`) gắn ở `chay`; ở đây chỉ có đường dẫn.
      return gt1 === KHONG_DUONG_DAN
        ? { loai_bang_chung: loai }
        : { loai_bang_chung: loai, duong_dan: gt1 };
    default:
      return { loai_bang_chung: loai, noi_dung: gt1 };
  }
}

export const LENH_EVIDENCE: LenhCli = {
  khai: {
    ten: 'evidence',
    vi_tri: ['MÃ', 'type', 'giá trị'],
    vi_tri_tuy_chon: ['giá trị 2'],
    /*
     * `--bao-cao <đường dẫn>` — đường dẫn **báo cáo của reviewer độc lập**, cho
     * bằng chứng `review`. **Bắt buộc** khi người gửi là một agent `manager`
     * (server kiểm, vì chỉ server biết vai trò của token). Xem migration 0022
     * khối B.
     *
     * Một **tuỳ chọn** chứ không một giá trị vị trí thứ ba: hai giá trị vị trí của
     * `evidence` là hình mà SPEC d.365 viết (`<giá trị> [...]`), và chen thêm một
     * ô nữa sẽ đổi nghĩa `[...]` của cả sáu loại.
     *
     * Với bằng chứng `bao_cao` (#161), `--bao-cao` mang **đúng nghĩa đó**: đường
     * dẫn báo cáo của reviewer độc lập, bắt buộc khi người ký là `manager`.
     * `--noi-dung "<chữ>"` là nội dung của chính báo cáo — chỉ cho `bao_cao`.
     */
    co: { 'bao-cao': 'gia_tri', 'noi-dung': 'gia_tri' },
    ghi_chu:
      'Loại bao-cao (bao_cao): <giá trị> là đường dẫn báo cáo, hoặc "-" nếu chỉ gửi --noi-dung "<chữ>"; ' +
      'manager kèm --bao-cao <đường dẫn báo cáo reviewer>.',
  },

  chay: async ({ cauHinh, chayGit }, ts) => {
    const ma_ticket = ts.vi_tri[0] ?? '';
    const loai = chuanHoaLoai(ts.vi_tri[1] ?? '');
    const than = thanBangChung(loai, ts.vi_tri[2] ?? '', ts.vi_tri[3]);

    const bao_cao = ts.gia_tri['bao-cao'];
    if (bao_cao !== undefined) {
      if (loai !== 'review' && loai !== 'bao_cao') {
        throw new BatonError('INVALID_INPUT', {
          message:
            '--bao-cao chỉ dùng cho bằng chứng review hoặc bao_cao (đường dẫn báo cáo của reviewer).',
        });
      }
      than['duong_dan_bao_cao'] = bao_cao;
    }

    const noi_dung = ts.gia_tri['noi-dung'];
    if (noi_dung !== undefined) {
      if (loai !== 'bao_cao') {
        throw new BatonError('INVALID_INPUT', {
          message: '--noi-dung chỉ dùng cho bằng chứng bao_cao (nội dung báo cáo).',
        });
      }
      than['noi_dung'] = noi_dung;
    }
    if (loai === 'bao_cao' && than['duong_dan'] === undefined && than['noi_dung'] === undefined) {
      throw new BatonError('INVALID_INPUT', {
        message: 'Bằng chứng bao_cao cần đường dẫn báo cáo hoặc --noi-dung (ít nhất một).',
      });
    }

    /*
     * **Lời khai "đã merge cục bộ"** — SPEC mục 7 d.206, xem `git-cuc-bo.ts`.
     *
     * Chạy ở đây vì đây là chỗ duy nhất **ở trong repo**: server là một Worker,
     * nó không có repo của chủ. Hai lệnh `git` chỉ đọc, không gọi mạng, và hỏng
     * hóc nào cũng chỉ dẫn tới "không khai gì" — bằng chứng đi đúng đường cũ.
     */
    let nhanh_cuc_bo: string | null = null;
    if (loai === 'commit' && chayGit !== undefined) {
      const kq = await daMergeCucBo(chayGit, ts.vi_tri[2] ?? '');
      if (kq.merged) {
        than['merged_cuc_bo'] = true;
        nhanh_cuc_bo = kq.nhanh;
      }
    }

    const ticket = await ticketTheoMaHoacId(cauHinh, ma_ticket);

    const kq = await batonFetch<GuiBangChungRa>(cauHinh, {
      method: 'POST',
      path: `/v1/ticket/${encodeURIComponent(ticket.id)}/bang-chung`,
      body: than,
      signal: AbortSignal.timeout(hanChoCliMs()),
    });

    const dong: string[] = [
      `Đã gửi bằng chứng ${nhan('loai_bang_chung', kq.loai)} (${kq.loai}) cho ${ticket.ma}: ${kq.id}`,
      `Xác minh: ${nhan('xac_minh_bang_chung', kq.xac_minh)} (${kq.xac_minh})`,
    ];
    /*
     * **Nguồn phải in ra, cạnh kết luận.** Một `merged` dựa vào lời khai cục bộ
     * (repo chưa push) và một `merged` đã tra qua GitHub là hai mức chắc chắn khác
     * nhau; in giống nhau là để người đọc tưởng điều không đúng.
     */
    if (kq.nguon_xac_minh !== undefined && kq.nguon_xac_minh !== null) {
      dong.push(
        `Nguồn xác minh: ${NHAN_NGUON_XAC_MINH[kq.nguon_xac_minh]} (${kq.nguon_xac_minh})`,
      );
    }
    if (nhanh_cuc_bo !== null) {
      dong.push(`Đã kiểm cục bộ: commit là tổ tiên của nhánh "${nhanh_cuc_bo}".`);
    }
    if (kq.review_nguon !== undefined && kq.review_nguon !== null) {
      dong.push(`Nguồn review: ${NHAN_NGUON_REVIEW[kq.review_nguon]} (${kq.review_nguon})`);
    }
    if (kq.bao_cao_nguon !== undefined && kq.bao_cao_nguon !== null) {
      dong.push(`Người ký báo cáo: ${NHAN_NGUON_BAO_CAO[kq.bao_cao_nguon]} (${kq.bao_cao_nguon})`);
    }
    if (kq.ly_do !== undefined && kq.ly_do !== null && kq.ly_do !== '') {
      dong.push(`Lý do: ${kq.ly_do}`);
    }
    if (kq.xac_minh === 'pending') {
      // d.220: `pending` **là** một kết quả hợp lệ, không phải thất bại — nên nói
      // rõ server sẽ tự thử lại, thay vì để agent tưởng phải gửi lại (#87).
      dong.push(
        `Chưa có kết luận trong ${String(TRAN_XAC_MINH_MS / 1000)} giây; máy chủ tự thử lại ` +
          '(SPEC mục 7 d.220). Không gửi lại bằng chứng này.',
      );
    }
    dong.push(
      `Trạng thái ticket: ${nhan('trang_thai_ticket', kq.ticket_trang_thai)} ` +
        `(${kq.ticket_trang_thai})`,
    );
    if (kq.sau_khi_xong) dong.push('Nhãn: "sau khi xong" (SPEC 19.3 d.495).');
    if (kq.can_review_lai) {
      dong.push(
        `Ticket đang mang cờ "cần review lại"${kq.can_review_lai_ly_do === null ? '' : ` (${kq.can_review_lai_ly_do})`}.`,
      );
    }

    return { json: kq, dong };
  },
};
