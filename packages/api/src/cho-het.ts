/**
 * **Chạy song song, nhưng KHÔNG để việc nào trôi nổi** (BAT-51).
 *
 * `Promise.all` reject **ngay** ở việc đầu tiên hỏng, trong khi các việc anh em
 * (thường là những câu đọc D1 khác) **vẫn đang chạy** — không ai còn chờ chúng.
 * Người gọi coi như lệnh đã xong (ném lỗi, trả 500, test kết thúc) mà I/O của
 * lệnh đó vẫn còn bay. Trong test, `@cloudflare/vitest-pool-workers` pop storage
 * cô lập ngay sau khi ca kết thúc, nên một câu D1 như vậy **có thể** rơi vào lúc
 * pop — chưa bắt được lần nào thực tế gây "Isolated storage failed", nhưng đó
 * đúng là hình lỗi pool tự cảnh báo ("Ensure you await all Promises that read or
 * write to these services"): rủi ro theo lý thuyết. Cùng cơ chế ấy (I/O còn bay lúc
 * pop ⇒ DO mở lại SQLite ⇒ `…sqlite-shm`) đã được TÁI HIỆN ở BAT-53, nhưng nguồn là
 * thân ca test hết giờ vẫn chạy tiếp, không phải hàm này (xem `caQuaSo` trong
 * `test/cho-toi.ts`). Ngoài test, nó là I/O chạy sau khi request đã trả lời.
 *
 * Khi mọi việc thành: kết quả giống hệt `Promise.all` — cùng thứ tự, cùng kiểu.
 *
 * Khi có việc hỏng, hàm này KHÁC `Promise.all` ở hai điểm, cả hai đều có chủ ý:
 *   1. **Lúc ném**: `Promise.all` reject ngay khi việc hỏng đầu tiên reject; hàm này
 *      **chờ mọi việc xong** (thành hay hỏng) rồi mới ném.
 *   2. **Ném lỗi nào**: `Promise.all` ném lỗi của việc hỏng **sớm nhất theo thời
 *      gian**; hàm này ném lỗi của việc hỏng **đứng đầu theo thứ tự mảng** (đọc kết
 *      quả `allSettled` từ trái sang phải). Hai việc cùng hỏng thì lỗi ra có thể
 *      khác `Promise.all` — đổi lại, lỗi ra là xác định, không phụ thuộc việc nào
 *      về trước.
 * Không nuốt lỗi nào: lỗi được ném lại nguyên vẹn (không gói `AggregateError`);
 * lỗi của các việc hỏng khác (nếu có) không được ném ra.
 */
export async function choHet<T extends readonly unknown[] | []>(
  viec: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const kq = await Promise.allSettled(viec);
  const ra: unknown[] = [];
  for (const k of kq) {
    if (k.status === 'rejected') throw k.reason;
    ra.push(k.value);
  }
  return ra as { -readonly [K in keyof T]: Awaited<T[K]> };
}
