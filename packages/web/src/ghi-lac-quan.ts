/**
 * **Sổ đếm chung "ghi lạc quan đang bay", theo khoá query** (BAT-27).
 *
 * SPEC mục 14 d.418: sửa thì hiện **ngay**, máy chủ từ chối thì hoàn lại. Giá trị
 * lạc quan nằm trong cache cho tới khi mutation xong; một GET bắn trong khoảng đó
 * (nhịp `refetchInterval`, hay cổng "quay lại tab" của `lam-moi.ts`) trả dữ liệu
 * **trước** thao tác và đè mất nó — màn hình nháy về giá trị cũ rồi lại về mới.
 *
 * `so-dem-sua.ts` chặn đúng việc đó cho S/P/L (theo `ticket_id`). Sổ này là bản
 * chung cho **mọi** mutation ghi lạc quan khác: mỗi mutation khai **những khoá nó
 * ghi** (`setQueryData`), và hai cổng của `lam-moi.ts` đọc sổ này. `lamMoiTheoSo`
 * đọc **cả hai** sổ (BAT-29, xem dưới).
 *
 * Cách dùng (mọi `useMutation` có `onMutate` ghi cache):
 *
 *   onMutate:  **chụp khoá** (`const k = khoa`) và `const ghi = batDauGhiLacQuan(qc,
 *              [k…])` ở **dòng đầu**, trước mọi `await` (để cổng đóng trước khi
 *              `cancelQueries` nhả lượt và trước `setQueryData` — `setQueryData`
 *              tính lại `refetchInterval` đồng bộ); trả **cả `ghi` lẫn khoá đã chụp**
 *              trong ngữ cảnh. Thân còn lại ném ⇒ `ketThucGhiLacQuan` rồi ném tiếp
 *              (TanStack gọi `onError`/`onSettled` với ngữ cảnh `undefined`).
 *   onError:   hoàn lại vào **khoá trong ngữ cảnh** (BAT-28), không khoá của closure;
 *              ngữ cảnh `undefined` ⇒ không hoàn gì (chưa chắc đã ghi gì).
 *   onSettled: `ketThucGhiLacQuan(qc, ngu_canh?.ghi)` **trước** `lamMoiTheoSo(qc, {
 *              queryKey: ngu_canh?.khoa ?? khoa })` (để lượt tải đó, khi về, bật lại
 *              nhịp). **Không** `qc.invalidateQueries` trần (BAT-28, xem dưới).
 *
 * **Khoá trong ngữ cảnh, không khoá của closure, ở `onError`/`onSettled`** (BAT-28).
 * Cùng lý do với vé: TanStack đẩy `setOptions` vào mutation đang treo, nên hai hàm
 * này là của lần vẽ **mới nhất** — đổi thẻ trong panel, đổi bộ lọc Cần Chủ/danh
 * sách giữa chừng thì khoá closure là khoá **khác**: hoàn ảnh chụp của thẻ A vào
 * cache thẻ B, làm mới B thay vì A. Ngữ cảnh `undefined` (`onMutate` ném) thì
 * `onSettled` làm mới khoá closure — chỉ còn khoá đó để làm; nó không đè gì lạc
 * quan vì `lamMoiTheoSo` vẫn hỏi sổ.
 *
 * **Đích của `mutationFn` trong BIẾN, không trong closure** (BAT-29). Cùng gốc:
 * `mutationFn` chạy **sau** `onMutate` (có `await cancelQueries`), hay sau một lần
 * treo vì mất mạng, nên nó cũng là hàm của lần vẽ mới nhất. Đọc id thẻ/phiên/dự
 * án từ closure ⇒ ghi sang **thẻ khác**, Dừng **nhầm phiên**. `mutate(bien)` mang
 * đích (và khoá) lúc bấm; `mutationFn(bien)` chỉ đọc từ đó.
 *
 * **`lamMoiTheoSo` thay `invalidateQueries` sau mutation** (BAT-28, d.418). Một
 * mutation xong làm mới các khoá của **nó** — mà khoá đó (hay tiền tố của nó: thẻ
 * chi tiết sau S/P/L, `['can-chu']` sau Gửi, `['ticket']` sau tạo việc) có thể
 * đang bị một mutation lạc quan **khác** còn bay ghi vào; GET khi đó trả bản trước
 * thao tác và đè giá trị lạc quan. `lamMoiTheoSo` khớp như `invalidateQueries`
 * (tiền tố, hay `exact`) nhưng **bỏ qua từng query** bị chặn, và ghi query đó vào
 * danh sách **hoãn**. Khi một khoá hoãn không còn bị chặn, lượt xả hoãn làm mới
 * đúng khoá đó (`exact`), một lần.
 *
 * **"Bị chặn" = sổ chung HOẶC sổ S/P/L** (BAT-29). Sổ S/P/L (`so-dem-sua.ts`, đổi
 * trạng thái/ưu tiên/nhãn theo `ticket_id`) đi riêng, nên bản BAT-28 chỉ hỏi sổ
 * chung: tạo việc xong (`lamMoiTheoSo(['ticket'])`) lúc S/P/L còn bay vẫn bắn GET
 * danh sách / chi tiết ⇒ danh sách nháy về giá trị cũ (d.418). Nay hỏi thêm
 * `khoaBiSuaChan` — **đúng luật** cổng "quay lại tab" của `lam-moi.ts` (danh sách
 * chặn khi `tong > 0`, chi tiết `['ticket','chi-tiet',ma]` khi `theDangSuaTheoMa`).
 * Xả hoãn hẹn ở cả hai chỗ sổ giảm: `ketThucGhiLacQuan` và `lamMoiSauDoi` (sau
 * `ketThucSua`) — cùng `henXaHoan`, nên khoá hoãn vì S/P/L không kẹt mãi.
 * Nhịp: `nhipLamMoi` (chi tiết thẻ) đọc cả sổ chung lẫn `khoaBiSuaChan` (BAT-30,
 * tính lại đồng bộ nhờ `setState({})` ở `so-dem-sua.ts`); nhịp của danh sách ticket
 * tự đọc sổ S/P/L ở trang của nó.
 *
 * **Vé, không khoá trần, ở `ketThuc`.** Khoá của trang đổi theo props/bộ lọc (thẻ
 * khác trong panel, bộ lọc Cần Chủ): `onSettled` đọc khoá từ closure của lần vẽ
 * **mới nhất** (TanStack đẩy `setOptions` vào mutation đang treo), tức có thể là
 * khoá khác khoá đã cộng ⇒ trừ nhầm khoá, khoá cũ kẹt > 0 mãi và **không bao giờ
 * được làm mới**. Vé mang đúng khoá đã cộng, và chỉ trừ **một lần** (`da_tra`).
 *
 * Mỗi `QueryClient` một sổ (`WeakMap`, như `so-dem-sua.ts`): test dựng client mới
 * mỗi ca, và sổ không được rò giữa hai ca.
 */

import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { khoaBiSuaChan } from './so-dem-sua';

interface MucSo {
  khoa: QueryKey;
  dem: number;
}

const SO_GHI = new WeakMap<QueryClient, Map<string, MucSo>>();

/**
 * Khoá đã bị `lamMoiTheoSo` bỏ qua vì đang ghi lạc quan, chờ làm mới (BAT-28).
 * Mỗi client một danh sách (`WeakMap`, như sổ): không rò giữa hai ca test.
 */
const HOAN = new WeakMap<QueryClient, Map<string, QueryKey>>();

function soCua(qc: QueryClient): Map<string, MucSo> {
  let s = SO_GHI.get(qc);
  if (s === undefined) {
    s = new Map();
    SO_GHI.set(qc, s);
  }
  return s;
}

/** Vé của một lần `batDauGhiLacQuan` — trả đúng một lần ở `ketThucGhiLacQuan`. */
export interface VeGhiLacQuan {
  readonly khoa: readonly QueryKey[];
  da_tra: boolean;
}

/**
 * Ghi nhận một mutation lạc quan **bắt đầu** ghi các khoá `khoa`. Đếm lồng nhau:
 * hai mutation trên cùng một khoá ⇒ khoá còn bị chặn tới khi **cả hai** xong.
 */
export function batDauGhiLacQuan(qc: QueryClient, khoa: readonly QueryKey[]): VeGhiLacQuan {
  const s = soCua(qc);
  for (const k of khoa) {
    const h = hashKey(k);
    const m = s.get(h);
    if (m === undefined) s.set(h, { khoa: k, dem: 1 });
    else m.dem += 1;
  }
  return { khoa, da_tra: false };
}

/**
 * Ghi nhận mutation **kết thúc** (cả nhánh thành công lẫn lỗi). Trả vé lần hai
 * (hay vé `undefined`) là không làm gì: mỗi lần cộng đúng một lần trừ.
 */
export function ketThucGhiLacQuan(qc: QueryClient, ve: VeGhiLacQuan | undefined): void {
  if (ve === undefined || ve.da_tra) return;
  ve.da_tra = true;
  const s = soCua(qc);
  for (const k of ve.khoa) {
    const h = hashKey(k);
    const m = s.get(h);
    if (m === undefined) continue;
    m.dem -= 1;
    if (m.dem <= 0) s.delete(h);
  }
  henXaHoan(qc);
}

/**
 * Hẹn xả các khoá hoãn — gọi khi **một sổ chặn vừa giảm**: `ketThucGhiLacQuan`
 * (sổ chung) và `lamMoiSauDoi` của trang danh sách, ngay sau `ketThucSua` (sổ
 * S/P/L, BAT-29). Không có khoá hoãn thì không hẹn gì.
 *
 * Làm mới các khoá hoãn **sau một microtask**, không ngay: người gọi trừ sổ rồi
 * **liền đó** `lamMoiTheoSo` khoá của chính nó — lượt đó thường trùm luôn khoá hoãn
 * (cùng khoá, hay tiền tố) và rút nó khỏi danh sách hoãn (xem `lamMoiTheoSo`), nên
 * khoá chỉ bị làm mới **một** lần chứ không hai (lượt thứ hai huỷ lượt thứ nhất:
 * `cancelRefetch`). `Promise.resolve().then`, không `queueMicrotask`/hẹn giờ: fake
 * timers của test không chạm tới nó.
 */
export function henXaHoan(qc: QueryClient): void {
  const hoan = HOAN.get(qc);
  if (hoan === undefined || hoan.size === 0) return;
  void Promise.resolve().then(() => {
    xaHoan(qc);
  });
}

/* ------------------------------------------------------------------ *
 * Làm mới sau mutation — bỏ qua (và hoãn) khoá đang ghi lạc quan (BAT-28)
 * ------------------------------------------------------------------ */

function hoanCua(qc: QueryClient): Map<string, QueryKey> {
  let h = HOAN.get(qc);
  if (h === undefined) {
    h = new Map();
    HOAN.set(qc, h);
  }
  return h;
}

/**
 * Khoá có bị **một trong hai sổ** chặn không (BAT-29): sổ ghi lạc quan chung
 * (`dangGhiLacQuan`) hay sổ S/P/L (`khoaBiSuaChan` — cùng luật cổng "quay lại tab"
 * của `lam-moi.ts`). Chỉ dùng cho làm mới sau mutation (`lamMoiTheoSo`, `xaHoan`).
 * (Nhịp `nhipLamMoi` đọc cả hai sổ từ BAT-30 — xem chú thích đầu file.)
 */
function biChanLamMoi(qc: QueryClient, khoa: QueryKey): boolean {
  return dangGhiLacQuan(qc, khoa) || khoaBiSuaChan(qc, khoa);
}

/** Làm mới (exact) mọi khoá hoãn **không còn** bị chặn; khoá còn bị chặn thì để lại. */
function xaHoan(qc: QueryClient): void {
  const hoan = HOAN.get(qc);
  if (hoan === undefined) return;
  for (const [h, k] of [...hoan]) {
    if (biChanLamMoi(qc, k)) continue;
    hoan.delete(h);
    void qc.invalidateQueries({ queryKey: k, exact: true });
  }
}

/**
 * Ghi một khoá vào danh sách hoãn (BAT-32): lần tải của nó vừa bị huỷ vì khoá đang
 * bị chặn (`query.ts`, lần tải đầu mount lúc mất mạng). Khi hết chặn, `xaHoan` làm
 * mới đúng khoá đó — nên chi tiết chưa có dữ liệu không kẹt "Đang tải…".
 */
export function hoanKhoa(qc: QueryClient, khoa: QueryKey): void {
  hoanCua(qc).set(hashKey(khoa), khoa);
}

/** Khoá danh sách hoãn của `qc` (cho test: đo được "hoãn đúng một lần", "không rò"). */
export function khoaDangHoan(qc: QueryClient): QueryKey[] {
  return [...(HOAN.get(qc)?.values() ?? [])];
}

/** Bộ lọc của `lamMoiTheoSo` — đúng phần của `invalidateQueries` mà mã này dùng. */
export interface LocLamMoi {
  queryKey: QueryKey;
  exact?: boolean;
}

/**
 * **Làm mới sau một mutation** — thay `qc.invalidateQueries({ queryKey, exact? })`
 * trong `onSettled`/`onSuccess` (BAT-28, d.418).
 *
 * Khớp y như `invalidateQueries` (tiền tố mặc định, `exact` nếu có, làm mới bản
 * đang có người xem), trừ **từng query** bị chặn (`biChanLamMoi`: sổ chung **hoặc**
 * sổ S/P/L, BAT-29): query đó không bị đánh dấu cũ, không bị tải lại, mà vào danh
 * sách hoãn — `henXaHoan` (từ `ketThucGhiLacQuan` hay `lamMoiSauDoi`) làm mới nó
 * khi không còn sổ nào chặn. Anh em không bị chặn: `['can-chu']` vẫn làm mới
 * `['can-chu','huy-hieu']` khi `['can-chu','man-hinh',…]` đang ghi.
 *
 * Query khớp mà **không** bị ghi thì được làm mới ở lượt này, nên rút khỏi danh
 * sách hoãn (nếu có): một khoá hoãn chỉ được làm mới một lần.
 *
 * Trả promise của `invalidateQueries` (người gọi `await` được, như trước). Khoá
 * hoãn không nằm trong promise đó — nó chờ một mutation khác.
 */
export function lamMoiTheoSo(qc: QueryClient, loc: LocLamMoi): Promise<void> {
  const loc_tim = loc.exact === true ? { queryKey: loc.queryKey, exact: true } : { queryKey: loc.queryKey };
  const hoan = hoanCua(qc);
  for (const q of qc.getQueryCache().findAll(loc_tim)) {
    const h = hashKey(q.queryKey);
    if (biChanLamMoi(qc, q.queryKey)) hoan.set(h, q.queryKey);
    else hoan.delete(h);
  }
  return qc.invalidateQueries({
    ...loc_tim,
    predicate: (q) => !biChanLamMoi(qc, q.queryKey),
  });
}

/** `a` là tiền tố của `b` (so từng phần tử bằng `hashKey`, nên object không phụ thuộc thứ tự trường). */
function laTienTo(a: QueryKey, b: QueryKey): boolean {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (hashKey([a[i]]) !== hashKey([b[i]])) return false;
  }
  return true;
}

/**
 * Khoá `khoa` có đang dính một ghi lạc quan đang bay không.
 *
 * **Khớp tiền tố HAI chiều** (khoá đang ghi là cha **hoặc** con của `khoa`, kể cả
 * trùng), không chỉ trùng đúng — chọn phía an toàn: lỡ chặn một lượt làm mới thì
 * giá chỉ là chậm tới khi mutation xong (`onSettled` làm mới ngay), còn lỡ **không**
 * chặn thì giá trị lạc quan bị GET cũ đè (d.418). Một mutation khai khoá ngắn
 * (vd `['can-chu']`) vẫn che mọi khoá con của nó. Khoá anh em không bị chặn:
 * `['can-chu','huy-hieu']` vẫn làm mới khi `['can-chu','man-hinh',…]` đang ghi.
 */
export function dangGhiLacQuan(qc: QueryClient, khoa: QueryKey): boolean {
  const s = SO_GHI.get(qc);
  if (s === undefined || s.size === 0) return false;
  for (const m of s.values()) {
    if (laTienTo(m.khoa, khoa) || laTienTo(khoa, m.khoa)) return true;
  }
  return false;
}
