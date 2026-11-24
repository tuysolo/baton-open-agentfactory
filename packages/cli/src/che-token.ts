/**
 * **Không bao giờ in token** — SPEC mục 13 d.382, mục 15, danh sách CẤM số 5 của
 * `CLAUDE.md`.
 *
 * Luật này được cài bằng **hai lớp**, không bằng một lời hứa:
 *   1. **Cấu trúc:** token chỉ đi vào đúng một chỗ — header `Authorization` của
 *      `batonFetch` (`@baton/client`). Không lệnh nào nhận token làm tham số,
 *      không lệnh nào nhận `MoiTruongCli`, không chỗ nào in lại header hay
 *      request. Đây là lớp **thật**.
 *   2. **Lưới chắn cuối:** mọi dòng ra `stdout`/`stderr` đi qua đây ngay trước
 *      khi viết (`in-ra.ts` là chỗ in duy nhất). Nhờ vậy một thông điệp lỗi do
 *      **máy chủ** hoặc một **proxy** dựng mà tình cờ chứa token cũng không lọt
 *      ra. Lớp 1 đủ cho mã hiện tại; lớp 2 là thứ còn đứng khi mã đổi.
 *
 * ## Vì sao phải che cả BIẾN THỂ của token
 *
 * Bản đầu che **chuỗi y nguyên** và che **sau** `JSON.stringify`. Ca hỏng:
 * `BATON_TOKEN` là `ab"cd`, máy chủ trả `{"message":"Token ab\"cd sai."}`, thì
 * sau khi serialize đầu ra chứa `ab\"cd` — **không** chứa `ab"cd`, nên lưới chắn
 * không khớp và token ra `stderr` nguyên vẹn. Cùng hình với `encodeURIComponent`
 * nếu một lượt sau đưa token qua URL.
 *
 * Nay lưới chắn che **mọi biến thể** trong `bienTheToken`, và `in-ra.ts` còn che
 * **trước** khi serialize (`cheTrongDuLieu`) nên đường JSON có hai lần chắn.
 *
 * ## Hai nửa đó KHÔNG phân biệt được bằng test — khai thẳng
 *
 * Reviewer lượt 2 đo bằng đột biến: **bỏ hẳn** `cheTrongDuLieu` ở `in-ra.ts` thì
 * **không ca nào đỏ**. Kiểm lại thì đúng, và đúng vì một lý do có thể chứng minh:
 * phép thoát của `JSON.stringify` chạy **theo từng ký tự**, nên `token ⊂ s` kéo
 * theo `escape(token) ⊂ escape(s)` — mà `escape(token)` **có** trong
 * `bienTheToken`. Tức với đường ra JSON hôm nay, **nửa che-sau một mình là đủ**;
 * nửa che-trước là **dư thừa** về tính "không lọt token", không phải "mỗi nửa bắt
 * một hình khác nhau" như bản trước của khối này viết.
 *
 * Giữ nửa che-trước vì một lý do khác và hẹp hơn: nó là nửa **không phải đoán
 * phép thoát của bộ serialize**. Đổi `JSON.stringify` sang bất kỳ cách dựng chữ
 * nào khác (replacer, YAML, bảng kẻ) thì danh sách biến thể lạc hậu ngay, còn
 * che-trước vẫn đúng. **Không có ca nào ghim lựa chọn này** — bỏ nó đi test vẫn
 * xanh; `cheTrongDuLieu` có ca riêng cho *hành vi của chính nó* (lồng sâu, khoá
 * của object), không cho vai trò của nó trong `in-ra.ts`.
 *
 * ## NGOÀI tầm lưới chắn — khai thẳng, không khai kín hơn thực tế
 *
 * Lưới chắn chỉ bắt được những dạng **giữ nguyên toàn bộ** token và liệt kê được.
 * Nó **không** bắt:
 *   * **base64 / hex / bất kỳ mã hoá nhị phân nào** (`btoa(token)`, `%-hex` của
 *     từng byte UTF-8). Không đường nào của CLI đưa token qua đó hôm nay —
 *     `Authorization: Bearer <token>` là chuỗi thô — nên đây là nợ *tiềm năng*,
 *     không phải lỗ đang mở; thêm một dạng mã hoá mới vào đường ra thì **phải**
 *     thêm một biến thể vào đây.
 *   * **token bị CẮT KHÚC** (`bt_token…zzz9`, hoặc in thành hai dòng, hoặc bọc
 *     dòng ở 80 cột). Che một tiền tố thì phải chọn một độ dài tối thiểu, và mọi
 *     độ dài đều vừa bỏ sót vừa che oan dữ liệu thật — nên không làm.
 *   * **đổi chữ hoa/thường**, chuẩn hoá Unicode, thoát HTML (`&quot;`), hay bất
 *     kỳ hàm một chiều (băm) nào.
 * Những dạng đó chỉ chặn được bằng **lớp 1** (token không đi tới chỗ in).
 */

/** Chuỗi thay thế. Có chữ để người đọc hiểu đây là chủ ý, không phải dữ liệu lỗi. */
export const CHE = '[token đã che]';

/**
 * Các dạng token có thể xuất hiện **y nguyên** trên đường ra.
 *
 * Xuất khẩu để test khẳng định **không** dạng nào lọt, chứ không phải để chép
 * danh sách này ở chỗ khác.
 *
 * Sắp **dài trước**: che chuỗi dài trước thì một biến thể ngắn hơn (vd token
 * không có ký tự đặc biệt: cả ba dạng bằng nhau) không cắt mất chuỗi dài hơn.
 */
export function bienTheToken(token: string): string[] {
  if (token === '') return [];
  const dang = [
    token,
    // Dạng sau khi `JSON.stringify` — `"` thành `\"`, `\` thành `\\`, v.v.
    JSON.stringify(token).slice(1, -1),
    // Dạng sau khi đi qua một URL (percent-encoding, dấu cách thành `%20`).
    encodeURIComponent(token),
    // Dạng **form-urlencoded**: dấu cách thành `+`, không `%20`. Đây là dạng mà
    // `URLSearchParams.set` của `@baton/client` (`ghepUrl`) dựng — tức chỗ **duy
    // nhất** của dự án sinh ra một query. Chưa đường nào đưa token vào query (có
    // ca ghim việc đó), nhưng hai dạng chỉ lệch nhau ở dấu cách nên bỏ một dạng
    // là một lỗ chờ sẵn.
    encodeURIComponent(token).replace(/%20/g, '+'),
  ];
  return [...new Set(dang)].filter((d) => d !== '').sort((a, b) => b.length - a.length);
}

/**
 * Che mọi lần xuất hiện của `token` — và của mọi biến thể của nó — trong `chu`.
 *
 * Token rỗng thì không che gì: thay thế chuỗi rỗng sẽ chèn `CHE` vào giữa **mọi**
 * ký tự của đầu ra.
 *
 * Dùng `split`/`join` chứ không `RegExp`: token là dữ liệu, và dữ liệu đưa vào
 * một biểu thức chính quy là một lỗi chờ sẵn (ký tự đặc biệt trong token làm
 * mẫu sai, hoặc không khớp gì cả — tức lưới chắn im lặng không chắn).
 */
export function cheToken(chu: string, token: string): string {
  let ra = chu;
  for (const dang of bienTheToken(token)) ra = ra.split(dang).join(CHE);
  return ra;
}

/**
 * Che token **bên trong dữ liệu**, trước khi serialize.
 *
 * Đây là nửa còn lại của việc che `--json`: che sau `JSON.stringify` thì phải
 * đoán trước mọi phép thoát của nó, còn che **trước** thì chuỗi còn nguyên như
 * máy chủ trả. Nửa này **dư thừa** so với nửa che-sau trên đường JSON hôm nay
 * (xem khối "Hai nửa đó KHÔNG phân biệt được bằng test" ở đầu file); giữ vì nó
 * không phụ thuộc vào việc đoán đúng phép thoát của bộ serialize.
 *
 * Đi qua cả **khoá** của object: một máy chủ lạ hoàn toàn có thể trả
 * `{ "<token>": ... }`.
 */
export function cheTrongDuLieu(v: unknown, token: string): unknown {
  if (typeof v === 'string') return cheToken(v, token);
  if (Array.isArray(v)) return v.map((x) => cheTrongDuLieu(x, token));
  if (typeof v === 'object' && v !== null) {
    const ra: Record<string, unknown> = {};
    for (const [k, gt] of Object.entries(v)) ra[cheToken(k, token)] = cheTrongDuLieu(gt, token);
    return ra;
  }
  return v;
}
