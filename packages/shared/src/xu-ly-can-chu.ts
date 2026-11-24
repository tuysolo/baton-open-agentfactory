/**
 * **Luật thuần của đường XỬ LÝ một mục Cần Chủ** — SPEC mục 8 (d.243–246,
 * d.261, d.278–281), 19.9 (d.537–542), 19.10 (d.553, mã `ALREADY_RESOLVED`).
 *
 * Tách khỏi `can-chu.ts` (đường **tạo**) vì hai đường có hai bộ luật rời nhau và
 * `can-chu.ts` đã dài; nhưng cùng một kỷ luật: **không chạm DB**, không
 * `Date.now()`, nên API lẫn CLI (phần 5) lẫn web (phần 6) đọc **một** bản và
 * mọi luật test được không cần Miniflare.
 *
 * Ba câu chữ của SPEC cho **Nhật ký** (`cauNhatKyKetQua`, `cauNhatKyBoQua`,
 * `cauNhatKyMoLai`) đã ở `nhat-ky.ts` từ lượt trước và **không** chép lại ở đây.
 * Ba câu cho **bình luận ticket** thì ở đây, vì chúng là chữ của mục 8 d.280 và
 * 19.9 d.541–542.
 */

import { BatonError } from './loi.js';
import { NHAN_PHUONG_AN, type NhanPhuongAn } from './can-chu.js';
import type { LoaiCanChu, TrangThaiCanChu } from './ma-nhan.js';

/* ------------------------------------------------------------------ *
 * 1. Kết quả mặc định theo loại — 19.9 d.539
 * ------------------------------------------------------------------ */

/**
 * **19.9 d.539 nguyên văn:** "Các loại khác: chữ là tuỳ chọn. Để trống thì Baton
 * tự điền **'đã chạy'** (loại lệnh), **'đã xem'** (loại review), **'đã đọc'**
 * (loại chỉ để biết)."
 *
 * `decision` **không có** mặc định, và sự vắng mặt đó là một luật: cùng câu
 * SPEC nói loại `Quyết định` "**bắt buộc chọn 1 phương án**", nên một mục
 * `decision` không bao giờ được xử lý bằng một chữ tự điền. Kiểu
 * `Record<Exclude<LoaiCanChu, 'decision'>, string>` khoá điều đó lại: thêm một
 * mặc định cho `decision` là lỗi biên dịch.
 */
export const KET_QUA_MAC_DINH: Record<Exclude<LoaiCanChu, 'decision'>, string> = {
  run_command: 'đã chạy',
  review: 'đã xem',
  fyi: 'đã đọc',
};

/**
 * Độ dài tối đa của **chữ tự do** trong kết quả và của lý do bỏ qua.
 *
 * 2.000 chứ không 20.000 (trần của `quyet_dinh` ở bảng `nhat_ky`) có chủ ý: kết
 * quả này đi **nguyên văn** vào ba chỗ cùng lúc — dòng Nhật ký (d.279), câu
 * bình luận `"T-x đã xử lý: …"` trên **mọi** ticket liên quan (d.280), và cột
 * `can_chu.ket_qua`. Trần nhỏ hơn mọi trần phía dưới nên không bao giờ có ca
 * "mục đã `resolved` mà câu bình luận vỡ CHECK của bảng `comment`" — tức không
 * có cách nào để ba việc của d.278–281 hỏng **một nửa** vì độ dài. Và nó đúng
 * tầm của thứ SPEC mô tả: `"đã chạy"`, `"A, ngưỡng 500"`.
 */
export const DAI_KET_QUA_TOI_DA = 2000;

/* ------------------------------------------------------------------ *
 * 2. Hai lựa chọn của loại `review` — mục 8 d.261
 * ------------------------------------------------------------------ */

/**
 * "2 nút chọn **Đạt** hoặc **Cần sửa** (Cần sửa thì **bắt buộc ghi chú**)" —
 * mục 8 d.261 (bảng "Trả lời bằng nút rồi bấm Gửi").
 *
 * **Khoá thật, không chữ tự do** — cùng nếp bốn cột khoá của 0012 và bảng
 * `can_chu_phuong_an` của 0013: đây là thứ phần 6 dựng **hai nút** từ đó, và là
 * thứ một đường đọc về sau phải lọc được ("các mục review Cần sửa"). Một chuỗi
 * `'Cần sửa'` do client gửi thì không lọc được và không có gì buộc nó đúng
 * chính tả.
 */
/*
 * Tên có đuôi `_MUC` để **không** đụng `KET_LUAN_REVIEW` của `ma-nhan.ts`, vốn
 * là `pass`/`fail` của **bằng chứng** loại `review` (mục 7 d.208). Hai thứ khác
 * nhau thật: cái kia là kết luận của một **reviewer agent** trên một ticket,
 * cái này là hai nút **chủ** bấm trên một thẻ Cần Chủ. Gộp mã là mời một lượt
 * sau đọc nhầm một cái thành cái kia.
 */
export const KET_LUAN_REVIEW_MUC = ['dat', 'can_sua'] as const;
export type KetLuanReviewMuc = (typeof KET_LUAN_REVIEW_MUC)[number];

/** Nhãn tiếng Việt, đúng chữ SPEC mục 8 d.261. */
export const NHAN_KET_LUAN_REVIEW_MUC: Record<KetLuanReviewMuc, string> = {
  dat: 'Đạt',
  can_sua: 'Cần sửa',
};

export function laKetLuanReviewMuc(v: unknown): v is KetLuanReviewMuc {
  return typeof v === 'string' && (KET_LUAN_REVIEW_MUC as readonly string[]).includes(v);
}

/* ------------------------------------------------------------------ *
 * 3. Kết quả đã kiểm
 * ------------------------------------------------------------------ */

/** Một phương án **có thật** của mục, như đường ghi đọc được từ DB. */
export interface PhuongAnCoSan {
  id: string;
  nhan: string;
}

/**
 * Kết quả **đã kiểm** của một lần xử lý. Union theo loại, nên chỗ ghi không thể
 * đặt một `ket_luan` lên một mục `run_command` hay quên `phuong_an_id` của một
 * mục `decision` — TypeScript bắt.
 */
export type KetQuaXuLyDaKiem =
  | {
      loai: 'decision';
      /**
       * **Khoá thật** trỏ tới một dòng `can_chu_phuong_an` của chính mục này.
       *
       * **`null` = chủ trả lời TỰ DO**, không chọn phương án nào — `cau-hoi-spec.md`
       * **#121**. Đây là chỗ **nới** so với chữ d.259/19.9 d.539 ("bắt buộc chọn 1
       * phương án"), theo yêu cầu trực tiếp của chủ 11/10, và nó khớp vế
       * "**và/hoặc** chữ tự do" của d.244. Lúc đó `ket_qua` là **chính chữ tự do**.
       */
      phuong_an_id: string | null;
      nhan: NhanPhuongAn | null;
      /** Chữ đi vào Nhật ký và bình luận — xem `cauKetQua`. */
      ket_qua: string;
    }
  | { loai: 'run_command'; ket_qua: string }
  | { loai: 'review'; ket_luan: KetLuanReviewMuc; ket_qua: string }
  | { loai: 'fyi'; ket_qua: string };

/** Chữ tự do của kết quả ("ghi thêm" — 19.9 d.538). Rỗng = không có. */
function chuTuDo(nguon: unknown, ten: string): string | null {
  if (nguon === undefined || nguon === null) return null;
  if (typeof nguon !== 'string') {
    throw new BatonError('INVALID_INPUT', { message: `${ten} phải là chữ.` });
  }
  const t = nguon.trim();
  if (t.length === 0) return null;
  if (t.length > DAI_KET_QUA_TOI_DA) {
    throw new BatonError('INVALID_INPUT', {
      message: `${ten} tối đa ${String(DAI_KET_QUA_TOI_DA)} ký tự.`,
    });
  }
  return t;
}

/**
 * Câu kết quả của một mục `decision` — **đúng ví dụ của SPEC**.
 *
 * Mục 8 d.244 cho hai ví dụ của trường "kết quả": `"đã chạy"` và
 * `"A, ngưỡng 500"`. Câu thứ hai là **nhãn phương án, phẩy, chữ ghi thêm** —
 * nên công thức ở đây là đúng chữ đó, không một cách viết nghĩ ra.
 *
 * **`nhan === null` = trả lời tự do** (`cau-hoi-spec.md` #121): câu kết quả là
 * **đúng chữ tự do**, không một nhãn rỗng ghép thành `", abc"` — chữ đó đi
 * nguyên văn vào dòng Nhật ký (d.279) và câu bình luận (d.280), nên một dấu phẩy
 * mở đầu là một dòng Nhật ký **không sửa được** mà trông như lỗi dữ liệu.
 */
export function cauKetQuaDecision(nhan: string | null, ghi_them: string | null): string {
  if (nhan === null) {
    // Cả hai rỗng thì không có **gì** để ghi vào `ket_qua`, mà `resolved` buộc
    // phải có `ket_qua` (mệnh đề 1 của trigger 0015). Ném ở đây để ca đó không
    // bao giờ đi tới DB dưới dạng một chuỗi rỗng.
    if (ghi_them === null) {
      throw new BatonError('OPTIONS_REQUIRED', {
        message: CAU_DECISION_CAN_PHUONG_AN_HOAC_CHU,
      });
    }
    return ghi_them;
  }
  return ghi_them === null ? nhan : `${nhan}, ${ghi_them}`;
}

/**
 * Câu lỗi của ca **không có gì cả** trên một mục `decision` — không phương án,
 * không ghi thêm.
 *
 * Một hằng có tên vì đây là câu duy nhất còn lại của `OPTIONS_REQUIRED` ở nhánh
 * "thiếu", và nó phải nói **cả hai** đường ra ("hoặc viết câu trả lời"): sau
 * #121 một câu chỉ nói "bắt buộc chọn 1 phương án" là một câu **sai**, nó bảo
 * chủ làm đúng thứ chủ vừa từ chối làm.
 */
export const CAU_DECISION_CAN_PHUONG_AN_HOAC_CHU =
  'Mục loại Quyết định cần chọn một phương án (nhãn A, B, C…) hoặc viết câu trả lời ' +
  'vào "Ghi thêm" (cau-hoi-spec.md #121).';

/**
 * **Kiểm kết quả theo LOẠI** — 19.9 d.538–539, mục 8 d.261.
 *
 * Một cửa duy nhất cho cả bốn loại, cùng lý lẽ `kiemNoiDungCanChu` của đường
 * tạo: kiểu trả về là union theo `loai`, nên handler không có nhánh nào bỏ sót.
 *
 * `phuong_an_co_san` là tập phương án **thật** của chính mục đó (đường ghi đọc
 * từ `can_chu_phuong_an`). Hàm này **không** tra DB; nó chỉ so nhãn trong tập
 * được đưa vào, nên luật "phải trỏ tới một phương án có thật" test được không
 * cần Miniflare.
 *
 * ### Mã lỗi
 * `OPTIONS_REQUIRED` (**422** theo 19.12 câu 19) cho **hai** ca còn sai của loại
 * `decision` sau khi #121 nới luật:
 *   1. **không có gì cả** — không phương án **và** không ghi thêm;
 *   2. gửi một nhãn **không khớp phương án nào** của mục (`"Z"`).
 * Ca 2 **cố ý** không biến thành trả lời tự do: chủ gõ một nhãn đứng một mình là
 * chủ **định** chọn một phương án, và nhận im lặng một câu trả lời `"Z"` là đúng
 * thứ "âm thầm áp sai" mà cả đường này được dựng để tránh. Một mã cho cả hai vì
 * cách sửa cùng họ: nói lại cho rõ chủ muốn gì.
 *
 * `INVALID_INPUT` dành cho những thứ SPEC **không** nêu mã: `ket_luan` của
 * `review` thiếu hoặc sai mã, và "Cần sửa mà không ghi chú".
 */
export function kiemKetQuaXuLy(
  loai: LoaiCanChu,
  nguon: { phuong_an?: unknown; ghi_them?: unknown; ket_luan?: unknown },
  phuong_an_co_san: readonly PhuongAnCoSan[] = [],
): KetQuaXuLyDaKiem {
  const ghi_them = chuTuDo(nguon.ghi_them, 'Ghi thêm của kết quả');

  switch (loai) {
    case 'decision': {
      if (nguon.phuong_an === undefined || nguon.phuong_an === null || nguon.phuong_an === '') {
        /*
         * **Trả lời TỰ DO** — `cau-hoi-spec.md` **#121**, chỗ **nới** so với
         * d.259/19.9 d.539 theo yêu cầu trực tiếp của chủ 11/10; vế SPEC đỡ nó là
         * d.244 ("phương án đã chọn **và/hoặc** chữ tự do").
         *
         * Không phương án mà **có** chữ ⇒ hợp lệ, `phuong_an_id`/`nhan` là `null`
         * và `ket_qua` là chính chữ đó. Không có **gì cả** thì vẫn
         * `OPTIONS_REQUIRED`: một mục `resolved` không `ket_qua` là đúng trạng
         * thái "không sửa lại được" mà d.279 cảnh báo, và trigger của 0015 chặn.
         */
        if (ghi_them !== null) {
          return { loai, phuong_an_id: null, nhan: null, ket_qua: ghi_them };
        }
        throw new BatonError('OPTIONS_REQUIRED', {
          message: CAU_DECISION_CAN_PHUONG_AN_HOAC_CHU,
        });
      }
      if (typeof nguon.phuong_an !== 'string') {
        throw new BatonError('OPTIONS_REQUIRED', {
          message: 'Phương án đã chọn phải là nhãn A, B, C… của một phương án có thật.',
        });
      }
      // Nhãn viết thường (`"a"`) vẫn hiểu: ô "Trả lời hàng loạt" của mục 8 dán
      // chữ người gõ, và `"T-52: a, ngưỡng 500"` là một dòng hợp lý.
      const nhan_gui = nguon.phuong_an.trim().toUpperCase();
      const chon = phuong_an_co_san.find((p) => p.nhan === nhan_gui);
      if (chon === undefined) {
        throw new BatonError('OPTIONS_REQUIRED', {
          message: `Mục này không có phương án nhãn "${nhan_gui}"; các nhãn có thật: ${
            phuong_an_co_san.length === 0
              ? '(không có phương án nào)'
              : phuong_an_co_san.map((p) => p.nhan).join(', ')
          }.`,
        });
      }
      // `chon.nhan` tới từ DB (CHECK của 0013 giới hạn đúng A–E), nhưng kiểu của
      // nó là `string`; thu hẹp ở đây để union mang đúng `NhanPhuongAn`.
      const nhan = (NHAN_PHUONG_AN as readonly string[]).includes(chon.nhan)
        ? (chon.nhan as NhanPhuongAn)
        : null;
      if (nhan === null) {
        throw new BatonError('INVALID_INPUT', {
          message: `Nhãn phương án "${chon.nhan}" không nằm trong A–E (SPEC mục 8).`,
        });
      }
      return {
        loai,
        phuong_an_id: chon.id,
        nhan,
        ket_qua: cauKetQuaDecision(nhan, ghi_them),
      };
    }

    case 'review': {
      if (!laKetLuanReviewMuc(nguon.ket_luan)) {
        throw new BatonError('INVALID_INPUT', {
          message: `Mục loại Chủ review bắt buộc chọn ${NHAN_KET_LUAN_REVIEW_MUC.dat} hoặc ${NHAN_KET_LUAN_REVIEW_MUC.can_sua} (SPEC mục 8); gửi ket_luan = ${KET_LUAN_REVIEW_MUC.join(' hoặc ')}.`,
        });
      }
      // "**Cần sửa thì bắt buộc ghi chú**" — mục 8 d.261.
      if (nguon.ket_luan === 'can_sua' && ghi_them === null) {
        throw new BatonError('INVALID_INPUT', {
          message: 'Chọn "Cần sửa" thì bắt buộc có ghi chú (SPEC mục 8).',
        });
      }
      // Chữ tuỳ chọn, để trống thì mặc định "đã xem" — 19.9 d.539. Hai luật rời
      // nhau: `ket_luan` là **khoá** (cột riêng), `ket_qua` là **chữ**.
      return { loai, ket_luan: nguon.ket_luan, ket_qua: ghi_them ?? KET_QUA_MAC_DINH.review };
    }

    case 'run_command':
      return { loai, ket_qua: ghi_them ?? KET_QUA_MAC_DINH.run_command };

    case 'fyi':
      return { loai, ket_qua: ghi_them ?? KET_QUA_MAC_DINH.fyi };
  }
}

/* ------------------------------------------------------------------ *
 * 4. Cổng trạng thái — mục 8 d.244, d.246; 19.10 d.553
 * ------------------------------------------------------------------ */

/**
 * **Xử lý được không** — mục 8 d.244 ("`Chờ` → `Đã xử lý` … hoặc `Bỏ qua`").
 *
 * Chỉ `open`. Hai ca còn lại đều ra **`ALREADY_RESOLVED`** (409 theo 19.12 câu
 * 19; mã do 19.10 d.553 thêm), với thông điệp đúng chữ 19.10: "**đã xử lý, mở
 * lại trước**".
 *
 * **`skipped` cũng ra `ALREADY_RESOLVED`, và đó là một lựa chọn khai rõ.** SPEC
 * chỉ vẽ `Chờ` → hai nhánh (d.244) và chỉ nói mở lại **từ Đã xử lý** (d.246),
 * nên "xử lý tiếp một mục đã bỏ qua" là chỗ SPEC **im lặng** — xem
 * `cau-hoi-spec.md` **#73**. Hướng tạm là **đóng**, cùng khuôn 19.10: một mục đã
 * kết thì phải **mở lại trước**. Đường mở lại vì vậy nhận cả `skipped` (xem
 * `batBuocMoLaiDuoc`), nếu không thì câu "mở lại trước" không thực hiện được và
 * một mục bỏ qua nhầm là vĩnh viễn.
 */
export function batBuocXuLyDuoc(trang_thai: TrangThaiCanChu, ma: string): void {
  if (trang_thai === 'open') return;
  throw new BatonError('ALREADY_RESOLVED', {
    message:
      trang_thai === 'resolved'
        ? `${ma} đã xử lý, mở lại trước (SPEC 19.10).`
        : `${ma} đã bỏ qua, mở lại trước (SPEC 19.10).`,
  });
}

/**
 * **Mở lại được không** — mục 8 d.246 ("từ Đã xử lý về Chờ"), 19.9 d.542.
 *
 * Nhận `resolved` **và** `skipped` — xem căn cứ ở `batBuocXuLyDuoc` và
 * `cau-hoi-spec.md` #73.
 *
 * Mục đang `open` thì không có gì để mở lại. **Không** mượn `ALREADY_RESOLVED`:
 * mã đó nói "đã xử lý rồi", đúng ngược với sự thật ở đây, và thông điệp của nó
 * sẽ bảo người gọi đi "mở lại trước" — tức đúng việc họ vừa làm. SPEC không nêu
 * mã nào cho ca này, và danh sách 409 của 19.12 câu 19 là **đóng** (bốn mã, đều
 * có nghĩa khác), nên dùng `INVALID_INPUT`/422 — mã chung của "điều kiện nghiệp
 * vụ chưa đạt".
 */
export function batBuocMoLaiDuoc(trang_thai: TrangThaiCanChu, ma: string): void {
  if (trang_thai === 'resolved' || trang_thai === 'skipped') return;
  throw new BatonError('INVALID_INPUT', {
    message: `${ma} đang ở trạng thái Chờ, không có gì để mở lại (SPEC mục 8 d.246).`,
  });
}

/* ------------------------------------------------------------------ *
 * 5. Câu của BÌNH LUẬN tự thêm — mục 8 d.280, 19.9 d.541–542
 * ------------------------------------------------------------------ */

/**
 * **Mục 8 d.280 nguyên văn:** "Tự thêm bình luận **'T-số đã xử lý: <kết quả>'**
 * vào mọi ticket liên quan."
 *
 * Chữ của SPEC, nên nó sống ở đây — một chỗ, có test — chứ không nằm rải trong
 * handler. Cùng lý lẽ ba câu Nhật ký của `nhat-ky.ts`.
 */
export function cauBinhLuanDaXuLy(ma: string, ket_qua: string): string {
  return `${ma} đã xử lý: ${ket_qua.trim()}`;
}

/**
 * Bình luận của **bỏ qua** — 19.9 d.541 nói có ("bình luận lên ticket liên
 * quan") nhưng **không cho chữ**.
 *
 * Chọn đúng khuôn hai câu SPEC **có** cho — `"T-x bỏ qua: <lý do>"` của dòng
 * Nhật ký ngay trong cùng câu d.541, và `"T-số đã xử lý: <kết quả>"` của d.280.
 * Nên đây không phải một câu nghĩ ra: nó là cùng công thức `<mã> <việc>: <nội
 * dung>` mà SPEC đã dùng hai lần. Ghi ở `cau-hoi-spec.md` **#73**.
 */
export function cauBinhLuanBoQua(ma: string, ly_do: string): string {
  return `${ma} bỏ qua: ${ly_do.trim()}`;
}

/** `"T-x mở lại"` — 19.9 d.542 cho **đúng** chữ này cho cả Nhật ký và bình luận. */
export function cauBinhLuanMoLai(ma: string): string {
  return `${ma} mở lại`;
}
