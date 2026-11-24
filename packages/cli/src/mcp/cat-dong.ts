/**
 * Cắt một luồng **khúc** thành một luồng **dòng**.
 *
 * Vận chuyển stdio của MCP phân cách thông điệp bằng ký tự xuống dòng, nhưng
 * `stdin` giao hàng theo khúc tuỳ ý: một thông điệp dài bị cắt làm đôi, hai
 * thông điệp ngắn về chung một khúc. Đọc thẳng từng khúc như một thông điệp là
 * một lỗi chỉ hiện ra khi thân dài — tức đúng lúc `baton submit` gửi một báo
 * cáo thật.
 *
 * Hàm này thuần và nhận một `AsyncIterable`, nên ca test đưa vào một mảng khúc
 * cắt ở chỗ hiểm (giữa một chuỗi JSON) mà không cần tiến trình nào.
 *
 * Khúc cuối không có `\n` vẫn được trả: một client đóng ống ngay sau thông điệp
 * cuối là chuyện bình thường, và nuốt thông điệp đó là treo client.
 */
export async function* catDong(nguon: AsyncIterable<string>): AsyncGenerator<string> {
  let con = '';
  for await (const khuc of nguon) {
    con += khuc;
    let vi_tri = con.indexOf('\n');
    while (vi_tri !== -1) {
      // `\r\n` cũng cắt đúng: bỏ `\r` cuối dòng.
      yield con.slice(0, vi_tri).replace(/\r$/, '');
      con = con.slice(vi_tri + 1);
      vi_tri = con.indexOf('\n');
    }
  }
  if (con !== '') yield con;
}
