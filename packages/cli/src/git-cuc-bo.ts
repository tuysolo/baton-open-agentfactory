/**
 * **Kiểm "đã merge" NGAY TRONG REPO CỤC BỘ** — cho bằng chứng `commit` của SPEC
 * mục 7 d.206.
 *
 * ## Vì sao CLI phải làm việc này
 *
 * d.206 kiểm commit "qua **GitHub API**". Repo của chủ ff-merge vào nhánh mặc
 * định **trên máy** và chưa push, nên GitHub **không biết** commit đó: kết luận
 * mãi là "không tìm thấy" ⇒ không bao giờ `merged` ⇒ cổng d.214 **không bao giờ**
 * mở. Ngày 13/10 đó là một trong ba chỗ chặn làm không ticket nào vào được Xong.
 *
 * Server không chạy được `git`: nó là một Worker, nó không có repo của chủ. Chỗ
 * duy nhất **ở trong repo** là CLI. Nên CLI kiểm, rồi **gửi kèm lời khai**; server
 * vẫn hỏi GitHub trước và chỉ dựa vào lời khai khi GitHub không biết commit đó,
 * và khi đó kết luận được ghi kèm nguồn `local` (hiện ra ở mọi đường đọc).
 *
 * ## Hai lệnh git, cả hai chỉ ĐỌC
 *
 *   1. `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` → nhánh mặc
 *      định (`origin/main` → `main`). **Phải hỏi, không đoán `main`**: repo cũ
 *      dùng `master`, và đoán sai thì một commit đã merge bị khai là chưa.
 *      Không có `origin` thì tra **theo tên**: `main`, rồi `master`, nhánh nào
 *      **tồn tại cục bộ** (`show-ref --verify refs/heads/<tên>`) thì lấy.
 *      Nhánh lấy được luôn được so ở dạng **`refs/heads/<tên>`** (xem
 *      `daMergeCucBo`), nên một repo không có nhánh đó **cục bộ** thì không khai
 *      gì — đúng hướng đóng, và đúng ca của chủ (merge cục bộ thì nhánh cục bộ có).
 *   2. `git merge-base --is-ancestor <hash> <nhánh>` → **mã thoát 0** nghĩa là
 *      hash là tổ tiên của (hoặc chính) đầu nhánh đó, tức "truy cập được từ nhánh
 *      mặc định" — đúng chữ d.206.
 *
 * ## KHÔNG BAO GIỜ lấy nhánh ĐANG ĐỨNG làm nhánh mặc định — siết sau review
 *
 * Bản đầu của lượt BAT-5 rơi về `git symbolic-ref --short HEAD` khi không có
 * `origin`, với lý lẽ "đúng cho một repo chỉ có một nhánh". Reviewer bắt đúng:
 * **mã không kiểm được giả định đó**, và hậu quả là lời khai thành **hiển nhiên
 * đúng** — đứng trên `tinh-nang`, gửi chính commit HEAD, thì `--is-ancestor` trả 0
 * vì một commit luôn là tổ tiên của chính nó, nên Baton khai `merged` cho một
 * commit **chưa merge vào đâu cả**. Đó là mở cổng Xong bằng một phép so vô nghĩa.
 *
 * Nên nhánh mặc định chỉ đến từ **hai nguồn gọi tên nó ra**: `origin/HEAD`, hoặc
 * tên `main`/`master` tồn tại thật. Không nguồn nào nói được thì **không khai gì**
 * — bằng chứng đi đúng đường cũ (GitHub quyết). Chọn tra theo tên thay vì "khác
 * nhánh đang đứng" vì ca thật của chủ là **đang đứng trên `main` và vừa ff-merge
 * vào `main`**: điều kiện "phải khác nhánh đang đứng" sẽ chặn đúng ca cần chạy,
 * trong khi tra theo tên vẫn so với một nhánh có tên thật.
 *
 * Không `fetch`, không `pull`, không `push`, không lệnh ghi nào: hàm này không
 * được đổi một byte nào trong repo của chủ, và nó không gọi mạng.
 *
 * **Không ném**: mọi hỏng hóc (không phải repo git, không có `git`, hash lạ) trả
 * `{ merged: false }`. Lý do: đây là một **lời khai thêm**, không phải điều kiện
 * của lệnh — một máy không có `git` vẫn phải gửi được bằng chứng commit, và nó sẽ
 * đi đúng đường cũ (GitHub quyết).
 */

/**
 * Chạy một lệnh `git` **chỉ đọc** và trả mã thoát + đầu ra.
 *
 * Đi qua tham số chứ không `import 'node:child_process'` trong thân lệnh — cùng
 * nếp `fetch` và `docFile` của `MoiTruongCli`: `bin.ts` là chỗ duy nhất biết tới
 * Node, nên test chạy đúng đường thật của CLI mà **không chạy tiến trình con nào**.
 */
export type ChayGit = (doi_so: readonly string[]) => Promise<{ ma: number; ra: string }>;

/** Kết luận của một lần kiểm cục bộ. */
export interface KetQuaMergeCucBo {
  /** Hash là tổ tiên của (hoặc chính) đầu nhánh mặc định cục bộ. */
  merged: boolean;
  /** Nhánh đã so; `null` khi không xác định được nhánh nào. */
  nhanh: string | null;
}

/**
 * **Tên remote mà `origin/HEAD` trỏ qua** — bỏ đúng tiền tố `origin/`, không bỏ
 * "mọi thứ trước dấu `/` đầu".
 *
 * Siết sau review: bản đầu dùng `indexOf('/')` cho **mọi** ref, nên một nhánh có
 * dấu gạch chéo trong tên bị cắt mất phần đầu — `worker/bat5-bat6a` thành
 * `bat5-bat6a` (một nhánh không tồn tại ⇒ không khai được gì), và tệ hơn,
 * `a/feature` thành `feature`, tức **so với một nhánh khác** nhánh mà git vừa chỉ
 * ra. Tên nhánh của git được phép chứa `/`, nên phép cắt phải neo vào **đúng** tiền
 * tố remote.
 */
export function nhanhSauTienToRemote(tho: string, remote = 'origin'): string | null {
  const t = tho.trim();
  const tien_to = `${remote}/`;
  if (!t.startsWith(tien_to)) return null;
  const ten = t.slice(tien_to.length);
  return ten.length === 0 ? null : ten;
}

/**
 * Tên nhánh mặc định **đoán theo tên**, chỉ nhận khi nhánh đó **tồn tại cục bộ**.
 * Thứ tự `main` rồi `master` là thứ tự phổ biến ngày nay; cả hai không có thì
 * `null` (⇒ không khai gì).
 */
export const TEN_NHANH_MAC_DINH_PHO_BIEN = ['main', 'master'] as const;

/** Nhánh mặc định của repo cục bộ — xem khối chú thích đầu file. */
export async function nhanhMacDinhCucBo(chayGit: ChayGit): Promise<string | null> {
  const xa = await chayGit(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (xa.ma === 0) {
    const ten = nhanhSauTienToRemote(xa.ra);
    if (ten !== null) return ten;
  }

  /*
   * Không có `origin/HEAD`: tra **theo tên**, không lấy nhánh đang đứng. Xem khối
   * "KHÔNG BAO GIỜ lấy nhánh ĐANG ĐỨNG" ở đầu file — lấy nhánh đang đứng làm cho
   * `--is-ancestor` so một commit với chính nhánh nó đang nằm trên, tức một phép
   * so luôn đúng.
   */
  for (const ten of TEN_NHANH_MAC_DINH_PHO_BIEN) {
    const co = await chayGit(['show-ref', '--verify', '--quiet', `refs/heads/${ten}`]);
    if (co.ma === 0) return ten;
  }
  return null;
}

/**
 * Hash này đã vào nhánh mặc định của repo cục bộ chưa.
 *
 * `merged: false` cho **mọi** ca không chắc chắn (không xác định được nhánh,
 * `git` không chạy được, hash không có trong repo) — hướng **đóng**: lời khai này
 * mở được cổng Xong, nên nó chỉ được sinh ra khi `git` nói đúng "có".
 */
export async function daMergeCucBo(
  chayGit: ChayGit,
  hash: string,
): Promise<KetQuaMergeCucBo> {
  try {
    const nhanh = await nhanhMacDinhCucBo(chayGit);
    if (nhanh === null) return { merged: false, nhanh: null };
    /*
     * **`refs/heads/<nhánh>`, không tên trần** — git phân giải `refs/tags/<tên>`
     * **trước** `refs/heads/<tên>`, nên một repo có **tag** cùng tên với nhánh mặc
     * định (vd tag `main` của một bản phát hành) sẽ làm `--is-ancestor` so với tag
     * đó, tức so với một mốc cũ đã đóng băng. Neo thẳng vào không gian nhánh thì
     * không có chỗ cho sự nhập nhằng ấy.
     */
    const kq = await chayGit(['merge-base', '--is-ancestor', hash, `refs/heads/${nhanh}`]);
    return { merged: kq.ma === 0, nhanh };
  } catch {
    // Không có `git`, không phải repo, tiến trình con bị chặn… — xem đầu file.
    return { merged: false, nhanh: null };
  }
}
