/**
 * **Chia lô tham số bind cho `IN (?, ?, …)` động** — một chỗ cho cả dự án.
 *
 * ## Vì sao phải chia
 *
 * D1 chặn **100 tham số bind** trên một câu lệnh: vượt là `D1_ERROR: too many SQL
 * variables`, và lỗi đó đi ra thành 500. Mọi câu dựng `IN (...)` từ một danh sách
 * (trang 200 dòng của `kiemLimit`, 400 thẻ "Việc đang chạy" của Tổng quan…) đều
 * vấp nó ngay khi danh sách đủ dài — nghiệm thu BAT-9 bước 10 bắt đúng lỗi này ở
 * `themCuaThe`.
 *
 * ## Vì sao ngưỡng là TỔNG tham số của câu, không số giá trị trong `IN`
 *
 * Giới hạn của D1 đếm **mọi** `?` của câu: `workspace_id = ?`, `agent_id = ?`,
 * tham số trong subquery… Các bản chia lô viết tay trước đây cắt 90 **giá trị**
 * rồi cộng thêm `workspace_id` (91) — đúng tình cờ, sai ngay khi câu có thêm một
 * điều kiện. Ở đây người gọi khai **số tham số khác** của câu, và mỗi lô bị cắt
 * sao cho `so_tham_so_khac + lo.length ≤ TRAN_THAM_SO_MOI_CAU`.
 *
 * ## Bỏ trùng trước khi chia
 *
 * `IN` vốn không phân biệt trùng, nhưng **qua nhiều lô** thì có: một id rơi vào
 * hai lô sẽ trả dòng của nó hai lần (nhân đôi nhãn, nhân đôi bằng chứng). Bỏ
 * trùng ở đây (giữ lần xuất hiện đầu) làm mỗi giá trị nằm **đúng một lô** — đó là
 * tiền đề để người gọi gộp kết quả các lô theo khoá mà không phải cộng dồn.
 */

/**
 * **Trần tổng tham số bind của một câu** — D1 chặn ở 100; chừa 10 làm biên an
 * toàn (một điều kiện thêm sau này mà người sửa quên khai vẫn chưa làm vỡ câu).
 * Hằng này là **chỗ duy nhất** mang con số đó.
 */
export const TRAN_THAM_SO_MOI_CAU = 90;

/**
 * Chia `gia_tri` (đã bỏ trùng, giữ thứ tự lần đầu) thành các lô sao cho mỗi câu
 * có tổng `so_tham_so_khac + lo.length ≤ TRAN_THAM_SO_MOI_CAU` tham số.
 *
 * * Danh sách rỗng ⇒ `[]` — **không lô nào**, tức người gọi không chạy câu nào
 *   (`IN ()` không phải SQL hợp lệ).
 * * `so_tham_so_khac` không phải số nguyên ≥ 0, hoặc ≥ trần ⇒ ném `Error`: đó
 *   là lỗi **lập trình** (câu không còn chỗ cho một giá trị nào), không lỗi
 *   người dùng.
 */
export function chiaLoThamSo<T extends string | number>(
  gia_tri: readonly T[],
  so_tham_so_khac: number,
): T[][] {
  if (!Number.isInteger(so_tham_so_khac) || so_tham_so_khac < 0) {
    throw new Error(
      `chiaLoThamSo: so_tham_so_khac phải là số nguyên ≥ 0 (nhận ${String(so_tham_so_khac)}).`,
    );
  }
  if (so_tham_so_khac >= TRAN_THAM_SO_MOI_CAU) {
    throw new Error(
      `chiaLoThamSo: câu đã có ${String(so_tham_so_khac)} tham số khác, ` +
        `không còn chỗ cho IN dưới trần ${String(TRAN_THAM_SO_MOI_CAU)}.`,
    );
  }
  const ds = [...new Set(gia_tri)];
  const co_lo = TRAN_THAM_SO_MOI_CAU - so_tham_so_khac;
  const ra: T[][] = [];
  for (let i = 0; i < ds.length; i += co_lo) ra.push(ds.slice(i, i + co_lo));
  return ra;
}

/** `?, ?, ?` cho một lô — chỉ dấu hỏi, không bao giờ giá trị. */
export function dauHoi(lo: readonly unknown[]): string {
  return lo.map(() => '?').join(', ');
}

/**
 * Chạy `chay(lo, cho)` cho **từng lô** của `chiaLoThamSo` rồi **nối** kết quả
 * theo thứ tự lô.
 *
 * Các lô chạy song song (`Promise.all` giữ thứ tự kết quả theo thứ tự lô). Kết
 * quả nối lại **không** được sắp lại: một `ORDER BY` toàn cục của câu chỉ đúng
 * **trong** từng lô. Người gọi nào cần thứ tự toàn cục qua nhiều lô thì phải tự
 * sắp sau khi gộp — hoặc, như mọi chỗ hiện có, chỉ dựa vào thứ tự **trong một
 * khoá** (mỗi khoá nằm trọn một lô nhờ bỏ trùng).
 */
export async function chayTheoLo<T extends string | number, R>(
  gia_tri: readonly T[],
  so_tham_so_khac: number,
  chay: (lo: T[], cho: string) => Promise<readonly R[]>,
): Promise<R[]> {
  const cac_lo = chiaLoThamSo(gia_tri, so_tham_so_khac);
  const ket_qua = await Promise.all(cac_lo.map((lo) => chay(lo, dauHoi(lo))));
  const ra: R[] = [];
  for (const phan of ket_qua) ra.push(...phan);
  return ra;
}
