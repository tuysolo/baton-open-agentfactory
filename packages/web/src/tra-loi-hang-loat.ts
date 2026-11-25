/**
 * **Ô trả lời hàng loạt** — SPEC mục 8 d.271 nguyên văn: "dán nhiều dòng dạng
 * `T-18: đã xem` hay `T-52: A, ngưỡng 500`. Baton **tách từng mã**, **khớp
 * phương án nếu có chữ cái đầu hợp lệ**, **cho xem trước rồi áp một lần**. Dòng
 * không hiểu thì **báo đỏ, không áp**."
 *
 * ## Vì sao bộ tách là một HÀM THUẦN ở file riêng
 *
 * Đây là chỗ dễ nhất trong cả giao diện để một lỗi **âm thầm áp sai phương án**
 * cho một mục: một dòng `T-52: B, ngưỡng 500` hiểu lệch thành `A` vẫn chạy
 * thành công, vẫn ghi một dòng Nhật ký **không sửa được** (mục 10 d.309), vẫn
 * bình luận lên ticket — và không ai thấy. Nên luật tách nằm ngoài component,
 * không chạm DOM, không chạm `fetch`, và mọi ca biên có test riêng.
 *
 * ## "Áp một lần" — nguyên tử hay lần lượt? (`spec-questions.md` #107)
 *
 * SPEC không nói, và máy chủ **không có** đường ghi theo lô. Hướng tạm đang cài:
 * **chặn trước** ở bước xem trước (có **một** dòng không hiểu ⇒ **không áp dòng
 * nào**), rồi áp các dòng còn lại **lần lượt** qua đường `POST
 * /v1/can-chu/:id/xu-ly` có sẵn, và hiện rõ **từng mục** thành công / thất bại.
 * Hàm này cài đúng nửa đầu (`coTheAp`); nửa sau ở `trang/can-chu.tsx`.
 *
 * ## Ba chỗ NỚI sau lần chủ dùng thật 11/10
 *
 * Chủ dán hai dòng và **cả hai** báo đỏ, nên bộ tách đang chặt hơn mức có ích:
 *
 * 1. **Mã lỏng hơn** — `T106`, `t-106`, `T 106`, `T–106` đều chuẩn hoá về
 *    `T-106`, và dấu hai chấm là **tuỳ chọn**. Một biểu thức duy nhất
 *    (`MAU_DONG_HANG_LOAT`), nên "lỗi thiếu dấu hai chấm" không còn tồn tại.
 * 2. **Dòng không có mã = NỐI TIẾP dòng trước** — một câu trả lời nhiều dòng là
 *    một mục, một hàng xem trước, nội dung nối bằng `\n` (xem `tachHangLoat`).
 * 3. **Nội dung không khớp phương án nào trên một mục `decision` = trả lời TỰ
 *    DO**, không đỏ (`spec-questions.md` **#121**) — nhưng một **nhãn sai**
 *    (`T-2: Z, …`) thì **vẫn đỏ**; lý lẽ ở `thanCuaDong`.
 *
 * Cộng một **lối tạm**: mã không khớp mục nào thì thử số T ghi ở **đầu tiêu đề**
 * (`soTCuaTieuDe`) — CoS đang đặt tiêu đề `"T-106 · …"` trong khi Baton cấp mã
 * `T-2`.
 */

import type { KetLuanReviewMuc, LoaiCanChu, ThanXuLyMuc, TrangThaiCanChu } from './api';

/** Một mục mà màn hình **đang biết** — nguồn duy nhất để khớp mã và nhãn. */
export interface MucBiet {
  id: string;
  /** `T-<số>` **do Baton cấp** — mã thắng tuyệt đối khi khớp. */
  ma: string;
  /**
   * Tiêu đề của mục. Có ở đây vì một **lối tạm** (xem `soTCuaTieuDe`): CoS đang
   * đặt tiêu đề dạng `"T-106 · …"` với số T từ `can-chu.md` cũ của chủ, trong khi
   * Baton tự cấp một mã khác (`T-2`).
   */
  tieu_de: string;
  loai: LoaiCanChu;
  trang_thai: TrangThaiCanChu;
  /** Nhãn A, B, C… **có thật** của chính mục đó. */
  nhan_phuong_an: string[];
}

/** Một dòng đã hiểu — đủ để gọi `xuLyMuc(id, than)`, không phải đoán thêm gì. */
export interface DongHieu {
  hieu: true;
  dong: string;
  id: string;
  ma: string;
  loai: LoaiCanChu;
  than: ThanXuLyMuc;
  /** Chữ hiện ở bảng xem trước ("A, ngưỡng 500"). */
  tom_tat: string;
}

export interface DongKhongHieu {
  hieu: false;
  dong: string;
  /** Vì sao — hiện **đỏ** cạnh đúng dòng đó (d.271). */
  ly_do: string;
}

export type DongHangLoat = DongHieu | DongKhongHieu;

/**
 * Câu báo đỏ. Hằng có tên, không chuỗi rải trong thân hàm: ca test ghim **lý do
 * nào** cho **ca nào**, nên hai ca biên khác nhau không thể cùng rơi vào một câu
 * chung chung mà vẫn xanh.
 */
export const LY_DO = {
  khong_hieu_dang: 'Không hiểu dòng này. Dạng đúng: T-18: đã xem',
  thieu_noi_dung: 'Thiếu nội dung trả lời sau mã',
  khong_co_ma: (ma: string): string => `Không có mục ${ma} đang Chờ trên màn hình này`,
  trung_ma: (ma: string): string =>
    `Mã ${ma} xuất hiện nhiều lần trong lần dán này; giữ lại một dòng`,
  da_xu_ly: (ma: string): string => `${ma} đã xử lý rồi, mở lại trước`,
  /** Lối tạm số T ở đầu tiêu đề — **hai** mục cùng số thì không chọn hộ được. */
  ma_nhap_nhang: (ma: string, so_muc: number): string =>
    `${ma} nhập nhằng: có ${String(so_muc)} mục ghi số này ở đầu tiêu đề và không mục nào ` +
    `có mã Baton ${ma}; gõ đúng mã Baton (T-số ở thẻ) để chọn một mục`,
  khong_co_phuong_an: (nhan: string, co_san: readonly string[]): string =>
    `Mục này không có phương án nhãn ${nhan}; các nhãn có thật: ${co_san.join(', ')}`,
  review_can_ket_luan: 'Mục loại Chủ review cần mở đầu bằng Đạt hoặc Cần sửa',
  review_can_sua_can_ghi_chu: 'Chọn Cần sửa thì bắt buộc có ghi chú',
} as const;

/** Hai chữ của d.261, dạng chủ gõ trong ô hàng loạt. */
const CHU_KET_LUAN: { chu: string; ket_luan: KetLuanReviewMuc }[] = [
  { chu: 'đạt', ket_luan: 'dat' },
  { chu: 'dat', ket_luan: 'dat' },
  { chu: 'cần sửa', ket_luan: 'can_sua' },
  { chu: 'can sua', ket_luan: 'can_sua' },
  { chu: 'can_sua', ket_luan: 'can_sua' },
];

/**
 * **Tách từng dòng** — d.271.
 *
 * Dòng **rỗng** (kể cả dòng chỉ có khoảng trắng) bị **bỏ qua**, không thành một
 * dòng đỏ: dán từ một ghi chú luôn kéo theo dòng trống, và một dòng trống không
 * phải một câu "không hiểu" — nó không nói gì cả.
 *
 * Hệ quả thứ hai, **có chủ ý**: một dòng trống **không CẮT** khối nối tiếp. Nên
 * `T-60: chạy rồi` + dòng trống + `dòng hai` là **một** mục với nội dung
 * `"chạy rồi\ndòng hai"`, chứ không một mục cộng một dòng đỏ. Chọn vậy vì chính
 * cái nguồn mà vế "bỏ qua dòng trống" tồn tại để phục vụ — một đoạn chủ dán từ
 * ghi chú — là nơi dòng trống xuất hiện **giữa** các đoạn của cùng một câu trả
 * lời. Có ca test riêng cho hình này.
 */
export function tachHangLoat(van: string, muc: readonly MucBiet[]): DongHangLoat[] {
  const bang = new Map(muc.map((m) => [m.ma.toUpperCase(), m]));
  const theo_tieu_de = bangSoTCuaTieuDe(muc);

  /*
   * **Gộp dòng NỐI TIẾP trước khi làm bất cứ việc gì khác.**
   *
   * Chủ gõ một câu trả lời nhiều dòng (dùng thật 11/10):
   *
   *     T106 làm trước tính năng…
   *     rồi mới tới phần báo cáo
   *
   * Dòng thứ hai không có mã. Nó là **phần tiếp** của câu trả lời mục trên, nên
   * nó được nối vào nội dung của dòng trước bằng `\n` — không phải một dòng đỏ.
   *
   * Gộp phải chạy **trước** lượt đếm mã (19.10 d.551): nếu không thì một dòng nối
   * tiếp hoặc lọt vào bảng đếm (và một câu ba dòng tự biến thành "mã lặp ba
   * lần"), hoặc thành một hàng riêng trên bảng xem trước — hai đường đều sai.
   *
   * Dòng không có mã mà **chưa** có dòng-có-mã nào trước nó (dòng đầu lần dán)
   * thì **không nối vào đâu được**: nó vẫn là một dòng đỏ `khong_hieu_dang`.
   */
  const tho_dong: string[] = [];
  let co_khoi = false;
  for (const tho of van.split('\n')) {
    const dong = tho.trim();
    if (dong === '') continue;
    if (maCuaDong(dong) === null && co_khoi) {
      tho_dong[tho_dong.length - 1] = `${tho_dong[tho_dong.length - 1]!}\n${dong}`;
      continue;
    }
    if (maCuaDong(dong) !== null) co_khoi = true;
    tho_dong.push(dong);
  }

  /*
   * **Hai lượt** — 19.10 d.551: "nhiều dòng cùng mã trong một lần dán: báo đỏ
   * **tất cả** các dòng đó". Một lượt duy nhất với `Set` "đã gặp" chỉ đỏ được
   * dòng **thứ hai** trở đi, và hậu quả thật rất xấu: chủ dán 10 dòng, thấy một
   * dòng đỏ, xoá đúng dòng đó rồi áp — dòng còn lại là dòng chủ KHÔNG định giữ.
   *
   * Lượt 1 chỉ đếm mã, **không** quan tâm dòng có hiểu được hay không: `T-5: Z`
   * (nhãn sai) rồi `T-5: A` cũng là "cùng mã hai lần", nên cả hai phải đỏ.
   */
  const dem = new Map<string, number>();
  for (const dong of tho_dong) {
    const ma = maCuaDong(dong);
    if (ma !== null) dem.set(ma, (dem.get(ma) ?? 0) + 1);
  }

  return tho_dong.map((dong) => motDong(dong, bang, theo_tieu_de, dem));
}

/**
 * **Một** biểu thức cho cả hai nơi đọc mã (`maCuaDong` và `motDong`).
 *
 * Trước đây hai nơi lặp lại **cùng** một biểu thức; hai bản lệch nhau một ký tự
 * là một dòng được đếm ở lượt 1 mà không hiểu ở lượt 2 (hoặc ngược lại), tức
 * luật "mã lặp thì đỏ cả hai dòng" hỏng im lặng. Nên nó là một hằng.
 *
 * **Lỏng có chủ ý** (chủ dùng thật 11/10 gõ `T106`):
 *   * dấu nối **tuỳ chọn** và nhận cả gạch dài: `T-106`, `T106`, `T–106`, `T 106`;
 *   * dấu hai chấm **tuỳ chọn**: `T-18 đã xem` hiểu được, không còn là một lỗi
 *     ("thiếu dấu hai chấm" đã bỏ khỏi `LY_DO`);
 *   * hoa/thường tuỳ ý.
 *
 * `[\s\S]*` chứ không `.*` cho phần nội dung: sau khi gộp dòng nối tiếp, một
 * "dòng" có thể chứa `\n` thật, và `.` không khớp `\n`.
 */
const MAU_DONG_HANG_LOAT = /^t\s*[-–—]?\s*(\d+)\s*:?\s*([\s\S]*)$/i;

/** Mã chuẩn hoá `T-<số>` của một dòng, hoặc `null` nếu dòng không mở đầu bằng mã. */
function maCuaDong(dong: string): string | null {
  const khop = MAU_DONG_HANG_LOAT.exec(dong);
  return khop === null ? null : `T-${khop[1]!}`;
}

/**
 * **Số T ghi ở ĐẦU TIÊU ĐỀ** của một mục, hoặc `null` — một **lối tạm**.
 *
 * CoS đang tạo mục với tiêu đề `"T-106 · …"` (số từ `can-chu.md` cũ của chủ)
 * trong khi Baton tự cấp mã `T-2`. Chủ gõ `T106` là tự nhiên và nó **không** khớp
 * mã Baton nào — nên mã không khớp thì thử tiếp số ở đầu tiêu đề.
 *
 * **Đây KHÔNG phải phần 8** ("Nhập số T cũ thật", mục 16): phần đó là một cột dữ
 * liệu thật (`ma_cu`) có đường nhập và đường tra. Lối tạm này chỉ đọc chữ của
 * tiêu đề ở phía trình duyệt, nên nó biến mất ngay khi cột thật có mặt.
 *
 * Chỉ nhận số ở **ngay đầu** tiêu đề và phải có một dấu ngắt sau nó
 * (`·`, `-`, `:`, khoảng trắng, hoặc hết chuỗi) — nếu không thì một tiêu đề
 * "T1000 dòng log" sẽ khớp cả `T-1` lẫn `T-10`.
 */
export function soTCuaTieuDe(tieu_de: string): string | null {
  const khop = /^\s*t\s*[-–—]?\s*(\d+)(?=\s*(?:[·\-–—:]|\s|$))/i.exec(tieu_de);
  return khop === null ? null : `T-${khop[1]!}`;
}

/** Mã-theo-tiêu-đề → **mọi** mục mang số đó (hai mục cùng số ⇒ nhập nhằng). */
function bangSoTCuaTieuDe(muc: readonly MucBiet[]): Map<string, MucBiet[]> {
  const bang = new Map<string, MucBiet[]>();
  for (const m of muc) {
    const so = soTCuaTieuDe(m.tieu_de);
    if (so === null) continue;
    const da = bang.get(so);
    if (da === undefined) bang.set(so, [m]);
    else da.push(m);
  }
  return bang;
}

function motDong(
  dong: string,
  bang: Map<string, MucBiet>,
  theo_tieu_de: Map<string, MucBiet[]>,
  dem: Map<string, number>,
): DongHangLoat {
  const khop = MAU_DONG_HANG_LOAT.exec(dong);
  if (khop === null) return { hieu: false, dong, ly_do: LY_DO.khong_hieu_dang };

  const ma = `T-${khop[1]!}`;
  const noi = khop[2]!.trim();

  // d.551: đỏ **mọi** dòng của một mã lặp, không riêng dòng thứ hai — và cùng
  // **một** câu, để chủ thấy ngay là hai dòng này nói về cùng một mục. Đứng
  // trước các phép kiểm khác: một mã lặp thì chuyện cần sửa là "có hai dòng",
  // dù dòng đó còn sai gì nữa.
  if ((dem.get(ma) ?? 0) > 1) return { hieu: false, dong, ly_do: LY_DO.trung_ma(ma) };

  /*
   * **Mã Baton thắng tuyệt đối.** Chỉ khi không mục nào mang mã này thì mới thử
   * lối tạm "số T ở đầu tiêu đề" (xem `soTCuaTieuDe`). Thứ tự này là luật, không
   * là tình cờ: nếu không, một mục có **mã** `T-5` bị một mục khác có **tiêu đề**
   * `"T-5 · …"` tranh mất, tức chữ do CoS gõ đè lên mã do chính Baton cấp.
   *
   * Hai mục cùng một số ở đầu tiêu đề thì **đỏ**: chọn hộ một trong hai là đúng
   * chỗ "âm thầm áp sai mục" mà khối ghi chú đầu file nói tới.
   */
  let m = bang.get(ma);
  if (m === undefined) {
    const ung = theo_tieu_de.get(ma) ?? [];
    if (ung.length > 1) {
      return { hieu: false, dong, ly_do: LY_DO.ma_nhap_nhang(ma, ung.length) };
    }
    m = ung[0];
  }
  if (m === undefined) return { hieu: false, dong, ly_do: LY_DO.khong_co_ma(ma) };
  if (m.trang_thai !== 'open') return { hieu: false, dong, ly_do: LY_DO.da_xu_ly(ma) };
  if (noi === '') return { hieu: false, dong, ly_do: LY_DO.thieu_noi_dung };

  const than = thanCuaDong(m, noi);
  if (typeof than === 'string') return { hieu: false, dong, ly_do: than };

  return {
    hieu: true,
    dong,
    id: m.id,
    ma: m.ma,
    loai: m.loai,
    than,
    tom_tat: tomTat(than),
  };
}

/** Thân `xu-ly` cho một dòng, hoặc **câu lý do** nếu không hiểu. */
function thanCuaDong(m: MucBiet, noi: string): ThanXuLyMuc | string {
  if (m.loai === 'decision') {
    /*
     * "khớp phương án nếu có **chữ cái đầu hợp lệ**" — d.271. Chữ cái phải đứng
     * **một mình** ở đầu (theo sau là hết dòng, dấu phẩy, hoặc khoảng trắng), nếu
     * không thì `đã xem` sẽ khớp thành phương án `Đ`.
     *
     * **BA đường, không hai** — cố ý, `spec-questions.md` #121. Chúng tách nhau
     * theo **hình của dòng**, vì hình là thứ duy nhất nói được chủ **đang định
     * làm gì**:
     *
     *   1. **Nhãn CÓ THẬT** ⇒ khớp phương án, y nguyên hành vi của d.271 ("khớp
     *      phương án nếu có **chữ cái đầu hợp lệ**"). Nên `A ngưỡng 500` và
     *      `a nữa` vẫn là phương án A kèm ghi thêm — vế này **không** được mất.
     *   2. **Nhãn KHÔNG có thật, nhưng chữ cái đó đứng MỘT MÌNH thật** — theo sau
     *      là `,` `;` `.` hoặc **hết dòng** (`Z, ngưỡng 500`, `Z`) ⇒ **ĐỎ**. Hình
     *      đó nói chủ định chọn một phương án và gõ sai nhãn; nhận nó thành câu
     *      trả lời tự do `"Z, ngưỡng 500"` là đúng thứ khối ghi chú đầu file gọi
     *      là "**âm thầm áp sai**" — một dòng Nhật ký không sửa được, vô nghĩa.
     *   3. **Mọi hình còn lại** ⇒ **trả lời tự do**, không đỏ. Gồm **cả** ca
     *      "một chữ cái lạ rồi khoảng trắng rồi chữ" (`I think we should…`,
     *      `a nữa` khi mục không có nhãn A): đó là một **câu**, không một lựa
     *      chọn. Đây là vế còn sót của đúng cái bug lượt này đi chữa — chủ gõ
     *      tiếng Việt nên không vấp hôm 11/10, nhưng một câu tiếng Anh hay một
     *      câu mở đầu bằng `y`/`a` viết không dấu vẫn bị chặn.
     *
     * Chữ cái phải đứng **một mình** ở đầu mới được xét làm nhãn (theo sau là hết
     * dòng, dấu phẩy, hoặc khoảng trắng), nếu không thì `đã xem` khớp thành `Đ`.
     */
    const khop = /^([A-Za-z])(\s*[,;.]\s*|\s+|$)([\s\S]*)$/.exec(noi);
    if (khop === null) return { ghi_them: noi };

    const nhan = khop[1]!.toUpperCase();
    const ngat = khop[2]!;
    if (!m.nhan_phuong_an.includes(nhan)) {
      /*
       * `ngat === ''` nghĩa là nhánh `$` khớp (chữ cái là **cả** nội dung);
       * một dấu `,`/`;`/`.` trong `ngat` nghĩa là chủ ngắt sau nhãn. Chỉ hai hình
       * đó là "đứng một mình thật" ⇒ đường 2. Còn lại `ngat` chỉ có khoảng trắng
       * ⇒ đường 3, và nội dung trả về là **cả câu** kể cả chữ cái đầu.
       */
      const mot_minh = ngat === '' || /[,;.]/.test(ngat);
      if (!mot_minh) return { ghi_them: noi };
      return LY_DO.khong_co_phuong_an(nhan, m.nhan_phuong_an);
    }
    const ghi_them = khop[3]!.trim();
    return ghi_them === '' ? { phuong_an: nhan } : { phuong_an: nhan, ghi_them };
  }

  if (m.loai === 'review') {
    /*
     * **SPEC im lặng ở đây** (`spec-questions.md` #107): d.271 cho hai ví dụ, cả
     * hai đều không phải mục `review`, mà d.261 lại bắt mục `review` phải có
     * `Đạt`/`Cần sửa` — một chữ tự do không đủ để gọi đường `xu-ly` (máy chủ trả
     * `INVALID_INPUT`). Hướng tạm: đòi dòng **mở đầu** bằng một trong hai chữ
     * đó, và một dòng không có nó là dòng **không hiểu** — tức bị chặn ở bước
     * xem trước, không gửi đi để nhận một lỗi từ máy chủ.
     */
    const thuong = noi.toLowerCase();
    const chon = CHU_KET_LUAN.find((k) => thuong.startsWith(k.chu));
    if (chon === undefined) return LY_DO.review_can_ket_luan;

    const ghi_them = noi.slice(chon.chu.length).replace(/^[\s,;.]+/, '').trim();
    // "Cần sửa thì **bắt buộc ghi chú**" — d.261. Chặn ở đây thay vì để máy chủ
    // chặn: một lô đã áp nửa đường rồi mới đỏ là đúng thứ `coTheAp` tồn tại để
    // tránh.
    if (chon.ket_luan === 'can_sua' && ghi_them === '') return LY_DO.review_can_sua_can_ghi_chu;
    return ghi_them === ''
      ? { ket_luan: chon.ket_luan }
      : { ket_luan: chon.ket_luan, ghi_them };
  }

  // `run_command`, `fyi`: chữ tự do là "ghi thêm" (19.9 d.539 cho mặc định nếu
  // trống, nhưng ở đây dòng rỗng đã bị chặn trước).
  return { ghi_them: noi };
}

function tomTat(than: ThanXuLyMuc): string {
  const ve: string[] = [];
  if (than.phuong_an !== undefined) ve.push(than.phuong_an);
  if (than.ket_luan !== undefined) ve.push(than.ket_luan === 'dat' ? 'Đạt' : 'Cần sửa');
  if (than.ghi_them !== undefined) ve.push(than.ghi_them);
  return ve.join(', ');
}

/**
 * **"Dòng không hiểu thì báo đỏ, KHÔNG áp"** — d.271, vế cuối.
 *
 * Đọc chặt: có **một** dòng không hiểu thì **cả lô** không áp. Hai lý do chọn vế
 * chặt: (1) nó là cách duy nhất chắc chắn **không** áp một dòng mà d.271 nói
 * không được áp; (2) chủ dán một lô 10 dòng và sửa một dòng sai thì rẻ hơn hẳn
 * việc đoán xem 9 dòng kia đã chạy chưa — mà mục Cần Chủ đã xử lý thì phải **mở
 * lại** mới sửa được (d.246).
 */
export function coTheAp(dong: readonly DongHangLoat[]): boolean {
  return dong.length > 0 && dong.every((d) => d.hieu);
}
