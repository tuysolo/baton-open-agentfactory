/**
 * **Cờ "cần review lại"** — luật thuần. SPEC 19.3 d.494–495, 19.6 d.522,
 * 19.11 d.555, mục 7 d.222.
 *
 * Module này **thuần**: vào là trạng thái ticket + danh sách bằng chứng đã tra
 * sẵn + tập người làm; ra là `QuyetDinhCanReviewLai`. Không I/O, không
 * `Date.now()`. Phần tra D1 và dựng câu lệnh nằm ở `api/src/co-review-lai.ts`.
 *
 * ## Vì sao cờ này là một luật riêng, không nằm trong `congXong`
 *
 * `congXong` trả lời "ticket này **vào Xong được chưa**", và nó được gọi **mỗi
 * lần** một ticket định vào Xong. Cờ này trả lời một câu khác: "người giao có phải
 * **làm gì** không" — nó là một trạng thái **được lưu** (`ticket.co_can_review_lai`
 * + `ticket.can_review_lai_luc`, migration 0001 + 0011) vì hai chỗ đọc nó không
 * chạy cùng lúc với cổng:
 *   * truy vấn "Cần chú ý" / "có cờ" (mục 14, `doc-du-an.ts`) lọc **trong SQL**,
 *     nên không thể gọi một hàm luật cho từng ticket;
 *   * chỉ báo dự án 🟡 của 19.6 d.522 cần biết cờ đã bật **bao lâu**, mà cổng không
 *     giữ mốc nào.
 *
 * Hai luật phải nói **cùng một chuyện** về "review còn hiệu lực" — nên cả hai dùng
 * `mocCodeCuoi` và `reviewDatDuocTinh` của `cong-xong.ts`, không có bản thứ hai.
 *
 * ## Ba câu SPEC mà hàm này cài
 *
 *   1. **19.3 d.494** — "Có commit hoặc deploy mới sau review thì review cũ **hết
 *      hiệu lực**. Ticket ở hoặc về Chờ kiểm chứng, gắn cờ **'cần review lại'**
 *      (hiện ở 'Cần chú ý')."
 *   2. **19.3 d.495** — "**Ticket đã Xong không bị hạ.**" Nên ticket ở nhóm
 *      `closed` **không bao giờ** được bật cờ, và vào Xong thì cờ **tắt**. Cùng ý
 *      với d.222 ("Ticket đã Xong không bị hạ tự động").
 *   3. **19.11 d.555** — review KHÔNG ĐẠT: "Ticket giữ Chờ kiểm chứng và **hiện ở
 *      'Cần chú ý'** cho người giao."
 *
 * 19.11 **không nói dùng cờ nào** cho ca (3). Truy vấn "Cần chú ý" hiện chỉ có bốn
 * cờ (`co_khong_ai_cam`, `co_can_review_lai`, `co_xong_khong_bang_chung`,
 * `co_nhap_khong_bang_chung`), nên đây là chỗ SPEC thiếu —
 * `cau-hoi-spec.md` **#64**. Đề xuất tạm cài ở đây: dùng chính `co_can_review_lai`,
 * vì một review KHÔNG ĐẠT đúng nghĩa là **cần review lại**. Không tự thêm một cờ
 * thứ năm: thêm cột là đổi schema theo một suy đoán, và `#64` có thể được chốt theo
 * hướng khác.
 */

import { nhomTrangThai, type TrangThaiTicket } from './ma-nhan.js';
import {
  mocCodeCuoi,
  reviewDatDuocTinh,
  type BangChungChoCong,
} from './cong-xong.js';

/** Vì sao cờ bật — để lịch sử và UI (phần 6) nói đúng việc người giao phải làm. */
export type LyDoCanReviewLai =
  /** 19.3 d.494: review ĐẠT cũ bị một commit/deploy mới hơn làm hết hiệu lực. */
  | 'review_het_hieu_luc'
  /** 19.11 d.555: reviewer kết luận KHÔNG ĐẠT. */
  | 'review_khong_dat';

export interface BoiCanhCanReviewLai {
  /**
   * Trạng thái ticket **sau** lệnh đang chạy, không phải trạng thái trong DB: một
   * ticket vừa tự lên Xong trong cùng batch phải được xét như đã Xong (d.495).
   */
  trang_thai: TrangThaiTicket;
  /** Mọi bằng chứng của ticket, **kể cả đã rút** (luật tự lọc). */
  bang_chung: readonly BangChungChoCong[];
  /** `agent_id` của người nhận **mọi** lượt `work` — 19.3 d.496. */
  nguoi_lam: readonly string[];
}

export interface QuyetDinhCanReviewLai {
  /** Giá trị cờ **phải có** sau lệnh này. */
  co: boolean;
  /** `null` khi `co = false`. */
  ly_do: LyDoCanReviewLai | null;
  /**
   * Ticket phải **về** Chờ kiểm chứng — d.494 "ticket **ở hoặc về** Chờ kiểm
   * chứng". `false` khi nó **đã ở đó** (không có gì để đổi), khi cờ tắt, và khi
   * ticket ở nhóm `closed` (d.495) hay `planned`.
   *
   * Vì sao nhóm `planned` **không** bị kéo sang Chờ kiểm chứng: cùng nếp đã chốt
   * cho đường đổi tay ở 19.2 ("Ticket đang ở nhóm `active` thì sang Chờ kiểm
   * chứng; đang ở nhóm `planned` thì **giữ nguyên**"). Một ticket còn ở Cần làm /
   * Chờ mà có bằng chứng là dữ liệu của mục 16 hoặc một ticket vừa bị trả về; đẩy
   * nó sang Chờ kiểm chứng là nói rằng việc đã làm xong.
   */
  ve_cho_kiem_chung: boolean;
}

const TAT: QuyetDinhCanReviewLai = { co: false, ly_do: null, ve_cho_kiem_chung: false };

/** Mốc `gui_luc` lớn nhất của một danh sách; `-Infinity` khi rỗng. */
function mocCuoi(ds: readonly BangChungChoCong[]): number {
  return ds.reduce((max, b) => Math.max(max, b.gui_luc), Number.NEGATIVE_INFINITY);
}

/**
 * Cờ "cần review lại" **phải** là gì, tính lại từ đầu mỗi lần — không phải một
 * phép bật/tắt theo sự kiện.
 *
 * Tính lại từ đầu là chủ ý: một cờ chỉ được **bật** bởi sự kiện A và chỉ được
 * **tắt** bởi sự kiện B sẽ sai vĩnh viễn ngay lần đầu B bị bỏ sót, và không có dữ
 * liệu nào để phát hiện. Ở đây mọi đường ghi gọi cùng hàm này với cùng dữ liệu, nên
 * cờ luôn khớp với tập bằng chứng đang có.
 */
export function tinhCanReviewLai(bc: BoiCanhCanReviewLai): QuyetDinhCanReviewLai {
  // d.495 + d.222: ticket đã kết **không bao giờ** mang cờ này, và vào Xong thì cờ
  // tắt. Nhánh này là nửa "tắt cờ" của luật đó.
  if (nhomTrangThai(bc.trang_thai) === 'closed') return TAT;

  /*
   * **Chưa có review nào còn hiệu lực thì không có gì "lại".** Một ticket chưa
   * từng được review thì thiếu review — đó là việc của cổng (`LY_DO_THIEU_REVIEW_DAT`),
   * không phải cờ này. SPEC chỉ bật cờ sau khi **đã có** một review (d.494 "review
   * cũ hết hiệu lực"; d.555 "review KHÔNG ĐẠT").
   */
  const review_con = bc.bang_chung.filter((b) => b.loai === 'review' && b.rut_luc === null);
  if (review_con.length === 0) return TAT;

  const moc_code = mocCodeCuoi(bc.bang_chung);
  const review_dat = reviewDatDuocTinh(bc.bang_chung, bc.nguoi_lam);

  /*
   * **Đường TẮT cờ** — gạch 2 của cổng đã đạt: có một review ĐẠT được tính, gửi
   * **sau** commit/deploy cuối cùng. So chặt (`>`), đúng như `congXong`: hai bằng
   * chứng cùng một millisecond thì không ai nói được cái nào trước.
   *
   * Một cờ bật mà không có đường tắt là một cờ sai vĩnh viễn, nên nhánh này đứng
   * **trước** hai nhánh bật ở dưới.
   */
  if (review_dat.some((b) => b.gui_luc > moc_code)) return TAT;

  const moc_khong_dat = mocCuoi(review_con.filter((b) => b.ket_luan === 'fail'));
  const moc_het_hieu_luc = mocCuoi(review_dat);

  /*
   * Không có review KHÔNG ĐẠT nào, cũng không có review ĐẠT nào **được tính**: tập
   * review còn hiệu lực chỉ gồm review ĐẠT do **chính người làm** gửi (19.3 d.496).
   *
   * Không bật cờ cho ca này, có chủ ý: cổng đã có câu riêng cho nó
   * (`LY_DO_REVIEW_CUA_NGUOI_LAM`), và SPEC không gọi nó là "cần review **lại**" —
   * chưa có lần review nào được tính thì chưa có gì để làm lại. Ca này cũng chỉ tới
   * được bằng một đường ghi **ngoài cửa ghi** (lệnh gửi đã từ chối bằng
   * `REVIEWER_IS_WORKER`).
   */
  if (moc_khong_dat === Number.NEGATIVE_INFINITY && moc_het_hieu_luc === Number.NEGATIVE_INFINITY) {
    return TAT;
  }

  /*
   * Lý do đi theo **review còn hiệu lực mới nhất**: đó là kết luận đang có hiệu
   * lực, nên nó là câu người giao cần đọc. Bằng nhau thì "KHÔNG ĐẠT" thắng — một
   * kết luận không đạt là tin nặng hơn, và đây lại là hướng đóng.
   */
  const ly_do: LyDoCanReviewLai =
    moc_khong_dat >= moc_het_hieu_luc ? 'review_khong_dat' : 'review_het_hieu_luc';

  return {
    co: true,
    ly_do,
    // d.494 "ticket **ở hoặc về** Chờ kiểm chứng": chỉ nhóm `active` mới bị kéo về,
    // và chỉ khi nó chưa ở đó. Xem ghi chú của `ve_cho_kiem_chung`.
    ve_cho_kiem_chung:
      nhomTrangThai(bc.trang_thai) === 'active' && bc.trang_thai !== 'verifying',
  };
}
