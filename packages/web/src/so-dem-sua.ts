/**
 * **Sổ đếm thao tác S/P/L đang bay** (đổi trạng thái, đổi ưu tiên, gắn/bỏ nhãn).
 *
 * Ở module riêng vì ba chỗ cần đọc nó: trang danh sách (cổng khoá danh sách /
 * chi tiết, nhịp trang đầu), `lam-moi.ts` (cổng "quay lại tab") **và**
 * `ghi-lac-quan.ts` (`lamMoiTheoSo`, BAT-29). Hai cái sau là hạ tầng dùng chung,
 * không được import từ một trang. Module này không import gì của hai cái đó
 * (tránh vòng import).
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Sổ đếm thao tác S/P/L đang bay, **một sổ cho mỗi `QueryClient`**: tổng trên mọi
 * thẻ (cổng khoá danh sách) và theo từng thẻ (cổng khoá chi tiết).
 */
export interface SoDemSua {
  tong: number;
  theo_the: Map<string, number>;
  /**
   * `ticket_id` → mã thẻ (vd BAT-12), khi đã biết. Khoá chi tiết `['ticket',
   * 'chi-tiet', ma]` theo **mã**, còn `theo_the` theo **id** — cổng "quay lại tab"
   * cần cầu nối này.
   */
  ma_cua_the: Map<string, string>;
}
const SO_DEM_SUA = new WeakMap<QueryClient, SoDemSua>();

export function soDemSua(qc: QueryClient): SoDemSua {
  let s = SO_DEM_SUA.get(qc);
  if (s === undefined) {
    s = { tong: 0, theo_the: new Map(), ma_cua_the: new Map() };
    SO_DEM_SUA.set(qc, s);
  }
  return s;
}

/**
 * **Bắt observer của khoá chi tiết thẻ tính lại timer ĐỒNG BỘ** (BAT-30, d.418).
 *
 * `refetchInterval` dạng hàm của chi tiết (`nhipLamMoi`) hỏi `khoaBiSuaChan`, nhưng
 * TanStack v5 chỉ tính lại hàm đó ở `#updateTimers` — khi query được cập nhật
 * (`onQueryUpdate`) hoặc `setOptions` lúc component vẽ lại. `setInterval` đã hẹn
 * KHÔNG hỏi lại hàm mỗi tick. S/P/L `onMutate` chỉ `setQueryData` khoá danh sách,
 * không chạm khoá chi tiết ⇒ không có gì kích tính lại, tick đã hẹn vẫn bắn.
 *
 * `useIsMutating` trong thân chi tiết cũng được, nhưng là state React: vẽ lại bất
 * đồng bộ ⇒ có một khe để tick bắn GET trước khi `setOptions` tới. Ở đây ta
 * `setState({})` (gộp rỗng, KHÔNG đổi dữ liệu/trạng thái) lên các query chi tiết ⇒
 * `#dispatch` ⇒ `observer.onQueryUpdate()` ⇒ `#updateTimers` ngay trong cùng lời
 * gọi: tick đã hẹn bị xoá (khi hàm trả `false`) hoặc hẹn lại (khi hết chặn), không
 * qua lần vẽ nào. Gọi ở mọi chỗ sổ đổi: `batDauSua`, `ghiMaThe` (mã biết rồi ⇒
 * thẻ khác được thả), `ketThucSua` (kể cả nhánh lỗi ⇒ hẹn lại nhịp).
 *
 * **Chỉ nhắc query mà trạng thái chặn ĐỔI** quanh lần đổi sổ. `setState({})` làm
 * `#updateRefetchInterval` huỷ và hẹn lại interval TỪ ĐẦU, tức đặt lại pha nhịp:
 * nhắc cả những thẻ không liên quan thì chủ bấm S/P/L liên tục (< 1 chu kỳ) trên
 * thẻ khác sẽ làm chi tiết thẻ B không có tick nào (lệch d.420 "trong 3 giây").
 * Nên chụp trạng thái chặn trước, đổi sổ, rồi chỉ nhắc query có trạng thái khác.
 */
function doiSoRoiNhac(qc: QueryClient, doiSo: () => void): void {
  const truoc = qc
    .getQueryCache()
    .findAll({ queryKey: ['ticket'] })
    .map((q) => ({ q, chan: khoaBiSuaChan(qc, q.queryKey) }));
  doiSo();
  for (const { q, chan } of truoc) {
    const chan_moi = khoaBiSuaChan(qc, q.queryKey);
    if (chan_moi === chan) continue;
    /*
     * BAT-31 (d.418): query vừa BỊ CHẶN mà đang có một lần tải TẠM DỪNG vì mất mạng
     * (bắt đầu trước khi S/P/L bay) thì `onOnline` → `retryer.continue()` sẽ bắn GET
     * mà không hỏi `refetchOnReconnect`. `onMutate` chỉ `cancelQueries` khoá danh
     * sách đang xem, không phủ chi tiết thẻ / danh sách khác ⇒ huỷ ở đây.
     */
    if (chan_moi && q.state.fetchStatus === 'paused') void q.cancel({ revert: true });
    // Timer chỉ cần tính lại ở khoá chi tiết (nhịp `refetchInterval` dạng hàm).
    if (q.queryKey[1] === 'chi-tiet') q.setState({});
  }
}

/**
 * Ghi nhận một thao tác S/P/L bắt đầu. Gọi ở **dòng đầu** của `onMutate` (trước
 * mọi `await`), để mỗi `lamMoiSauDoi` về sau có đúng một lần trừ tương ứng.
 */
export function batDauSua(qc: QueryClient, ticket_id: string, ma?: string): void {
  const s = soDemSua(qc);
  doiSoRoiNhac(qc, () => {
    s.tong += 1;
    s.theo_the.set(ticket_id, (s.theo_the.get(ticket_id) ?? 0) + 1);
    if (ma !== undefined) s.ma_cua_the.set(ticket_id, ma);
  });
}

/** Ghi mã của thẻ đang bị sửa khi mã mới biết (sau khi tra cache). Thẻ không còn bay thì bỏ qua. */
export function ghiMaThe(qc: QueryClient, ticket_id: string, ma: string | undefined): void {
  const s = soDemSua(qc);
  if (ma !== undefined && s.theo_the.has(ticket_id)) {
    doiSoRoiNhac(qc, () => {
      s.ma_cua_the.set(ticket_id, ma);
    });
  }
}

/**
 * Thẻ mang mã `ma` có S/P/L đang bay không? Thao tác mà **chưa biết mã** (thẻ
 * không có trong cache) tính là có thể trùng ⇒ `true` (phương án an toàn: chặn).
 */
export function theDangSuaTheoMa(qc: QueryClient, ma: string): boolean {
  const s = soDemSua(qc);
  for (const id of s.theo_the.keys()) {
    const m = s.ma_cua_the.get(id);
    if (m === undefined || m === ma) return true;
  }
  return false;
}

/**
 * **Cổng S/P/L của một khoá query** (d.418) — một chỗ cho mọi đường làm mới:
 * cổng "quay lại tab" (`lam-moi.ts`) và làm mới sau mutation (`lamMoiTheoSo`,
 * BAT-29). GET khoá bị chặn lúc này trả dữ liệu TRƯỚC thao tác và đè giá trị lạc
 * quan. Thu hẹp theo loại khoá `'ticket'`:
 *
 *   * Chi tiết `['ticket','chi-tiet',ma]`: chặn khi **thẻ `ma`** có S/P/L bay
 *     (`theDangSuaTheoMa` — sổ khoá theo id, cầu nối id→mã ở trên). Thẻ khác không.
 *   * Danh sách `['ticket','man-hinh',…]` và mọi khoá `'ticket'` khác (không rõ
 *     thuộc thẻ nào ⇒ phương án an toàn): chặn khi `tong > 0`.
 *   * Khoá không phải `'ticket'`: không chặn.
 */
export function khoaBiSuaChan(qc: QueryClient, khoa: QueryKey): boolean {
  if (khoa[0] !== 'ticket') return false;
  if (khoa[1] === 'chi-tiet' && typeof khoa[2] === 'string') return theDangSuaTheoMa(qc, khoa[2]);
  return soDemSua(qc).tong > 0;
}

/**
 * Ghi nhận một thao tác S/P/L kết thúc (cặp với `batDauSua`): trừ đồng bộ, rồi
 * báo đã về 0 chưa — trên mọi thẻ (`het_tat_ca`) và trên đúng thẻ này (`het_the`).
 */
export function ketThucSua(
  qc: QueryClient,
  ticket_id: string,
): { het_tat_ca: boolean; het_the: boolean } {
  const s = soDemSua(qc);
  let con_the = 0;
  // Hết chặn ⇒ hẹn lại nhịp chi tiết của thẻ được thả, cả nhánh lỗi (BAT-30).
  doiSoRoiNhac(qc, () => {
    s.tong = Math.max(0, s.tong - 1);
    con_the = Math.max(0, (s.theo_the.get(ticket_id) ?? 0) - 1);
    if (con_the === 0) {
      s.theo_the.delete(ticket_id);
      s.ma_cua_the.delete(ticket_id);
    } else {
      s.theo_the.set(ticket_id, con_the);
    }
  });
  return { het_tat_ca: s.tong === 0, het_the: con_the === 0 };
}
