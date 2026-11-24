/**
 * **Thời gian trên màn hình** — SPEC mục 14 d.412: "Thời gian hiển thị dạng
 * **tương đối** ("12 phút trước"), **rê chuột** thấy **giờ đầy đủ theo giờ Việt
 * Nam**."
 *
 * Một helper dùng chung cho mọi trang, không một `toLocaleString` rải trong từng
 * component: hai cách viết giờ là hai cách đọc, và chủ sẽ thấy "12 phút trước" ở
 * một chỗ, "11 phút" ở chỗ kia cho cùng một mốc.
 *
 * ## Hai vế, hai hàm
 *
 *   * `thoiGianTuongDoi(moc, bay_gio)` → chữ hiện trên màn hình.
 *   * `gioDayDu(moc)` → chữ trong `title` của thẻ, tức thứ hiện ra khi rê chuột.
 *
 * `bay_gio` qua **tham số**, không `Date.now()` bên trong: cùng kỷ luật với tầng
 * máy chủ (`quyet-dinh.md` 01/10) — một hàm tự đọc đồng hồ thì ca test chỉ ghim
 * được bằng cách giả lập đồng hồ toàn cục, và nó sẽ đỏ theo ngày chạy.
 *
 * ## Vì sao `Intl` ở đây mà `MUI_GIO_CHU_PHUT` ở tầng máy chủ
 *
 * `can-chu.ts` của `@baton/shared` cố ý **không** dùng `Intl`: nó tính giờ-trên-
 * tường bằng một độ lệch cố định, vì đó là một luật nghiệp vụ (hạn 20:00 của
 * 19.8) phải kiểm chứng được bằng số học và phải chạy trong Workers. Ở đây ngược
 * lại: việc cần làm là **định dạng cho người đọc**, và `Intl` với
 * `timeZone: 'Asia/Ho_Chi_Minh'` là bản duy nhất nói đúng tên múi giờ mà d.412
 * gọi ra. Hai mục đích khác nhau, nên hai cách làm khác nhau — và chúng cho cùng
 * một kết quả vì Việt Nam không có giờ mùa hè (có ca test đối chiếu hai bản).
 */

/** d.412 gọi tên "giờ Việt Nam"; đây là tên IANA của nó. */
export const MUI_GIO_HIEN_THI = 'Asia/Ho_Chi_Minh';

const PHUT = 60_000;
const GIO = 60 * PHUT;
const NGAY = 24 * GIO;

/**
 * "**12 phút trước**" — d.412.
 *
 * Bậc thang: giây → phút → giờ → ngày. Không có bậc "tuần"/"tháng": chúng đòi
 * một luật về độ dài tháng mà SPEC không nói, và Tổng quan chỉ hiện mốc trong
 * vòng 24 giờ (d.317–320), nên bậc ngày đã quá đủ cho mọi chỗ đang gọi.
 *
 * Mốc **ở tương lai** (hạn sắp tới, đồng hồ máy lệch) ra "trong X": nói "−3 phút
 * trước" là một màn hình hỏng, và hạn của mục Cần Chủ là một mốc tương lai thật.
 *
 * Làm tròn **xuống** (`Math.floor`): "1 phút trước" ở giây thứ 60, không ở giây
 * thứ 30 — người đọc đối chiếu với `title` sẽ thấy hai con số khớp nhau.
 */
export function thoiGianTuongDoi(moc: number, bay_gio: number): string {
  const lech = bay_gio - moc;
  const tuong_lai = lech < 0;
  const ms = Math.abs(lech);

  const chu = ((): string => {
    if (ms < PHUT) return `${String(Math.floor(ms / 1000))} giây`;
    if (ms < GIO) return `${String(Math.floor(ms / PHUT))} phút`;
    if (ms < NGAY) return `${String(Math.floor(ms / GIO))} giờ`;
    return `${String(Math.floor(ms / NGAY))} ngày`;
  })();

  return tuong_lai ? `trong ${chu}` : `${chu} trước`;
}

/**
 * Giờ **đầy đủ theo giờ Việt Nam** — thứ d.412 đòi phải thấy khi rê chuột.
 *
 * Dạng `dd/MM/yyyy HH:mm:ss` (24 giờ) kèm chữ "giờ Việt Nam": không có chữ đó
 * thì một mốc ghi `03:00` không nói được nó là giờ của ai, và đúng chỗ ấy là chỗ
 * chủ sẽ tự đối chiếu với đồng hồ của mình.
 */
export function gioDayDu(moc: number): string {
  const dinh_dang = new Intl.DateTimeFormat('vi-VN', {
    timeZone: MUI_GIO_HIEN_THI,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${dinh_dang.format(new Date(moc))} (giờ Việt Nam)`;
}
