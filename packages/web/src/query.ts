/**
 * `QueryClient` của TanStack Query — một bản cho cả ứng dụng.
 *
 * Hàm, không một hằng xuất sẵn: test cần **một client mới cho mỗi ca** (cache
 * dùng lại giữa hai ca là một ca ăn dữ liệu của ca trước, và nó xanh/đỏ theo thứ
 * tự chạy).
 *
 * `retry: false` cho mọi query: lỗi của Baton là `{ error, message }` có nghĩa —
 * 401 là "chưa đăng nhập", 403 là "không có quyền", 404 là "không có". Thử lại
 * ba lần cho những câu trả lời đó là ba request vô ích.
 *
 * `refetchInterval` **không đặt** ở đây, có chủ ý. SPEC mục 14 d.420 đòi "thay
 * đổi do agent tạo hiện lên trong vòng 3 giây, không cần tải lại trang", và cách
 * đã chốt là hỏi vòng theo `CHU_KY_LAM_MOI_MS` (`src/hang-so.ts`) — nhưng đặt
 * **từng query**, không đặt mặc định ở đây: không phải đường đọc nào cũng đổi do
 * agent (danh sách lựa chọn bộ lọc đổi theo chủ), và một mặc định toàn cục biến
 * mọi query mới thành một vòng hỏi 2 giây mà không ai chọn. Mảnh tuỳ chọn để
 * trải vào từng query nằm ở `src/lam-moi.ts` (`NHIP_LAM_MOI`).
 *
 * `refetchIntervalInBackground: false` khai **tường minh** dù đó đang là mặc
 * định của TanStack Query: "tab ẩn thì không hỏi máy chủ" là một luật của sản
 * phẩm (một tab Baton bỏ quên không được đốt một request mỗi hai giây cả ngày),
 * không một chi tiết của thư viện — treo nó vào mặc định nghĩa là nó rụng theo
 * một lần nâng phiên bản và **không ca nào đỏ**. Có ca test ghim.
 *
 * `refetchOnWindowFocus: false` thì **giữ**, và vế "quay lại tab thì làm mới ngay
 * một lần" cài riêng ở `useNhipLamMoi` (nghe `visibilitychange`): `focus` của cửa
 * sổ bắn cả khi chủ click từ cửa sổ khác về để bấm một nút, nên bật nó lên là một
 * loạt refetch cho mỗi cú click — lý lẽ đầy đủ ở đầu `src/lam-moi.ts`.
 *
 * `refetchOnReconnect` là **hàm đi qua cùng cổng d.418** (BAT-31). Mặc định của
 * TanStack là bật: có mạng lại thì MỌI query đang xem tải lại, kể cả khi một S/P/L
 * (`so-dem-sua.ts`) hay một mutation lạc quan (`ghi-lac-quan.ts`) còn treo — mà
 * treo thường chính là vì mất mạng. GET đó trả dữ liệu TRƯỚC thao tác và đè giá trị
 * lạc quan (nháy về giá trị cũ), đúng cái mà nhịp và "quay lại tab" đã bị chặn.
 * Tắt hẳn thì mất d.420 (có mạng lại là thấy ngay thay đổi của agent), nên hàm hỏi
 * đúng `khoaBiSuaChan`/`dangGhiLacQuan` cho từng query: bị chặn ⇒ `false`, còn lại
 * `true` (giữ nguyên mặc định). Khi thao tác xong, `lamMoiSauDoi`/`lamMoiTheoSo`
 * làm mới khoá đó. TanStack v5 gọi hàm với chính `Query` (`shouldFetchOn`), và
 * `queryKey` của nó là khoá cần hỏi. Không có vòng import: hai module sổ không
 * import file này.
 *
 * Vế còn lại của `onOnline` là `retryer.continue()`: một lần tải đang TẠM DỪNG vì
 * mất mạng sẽ chạy tiếp mà không hỏi `refetchOnReconnect`. Khoá danh sách thì
 * `onMutate` của S/P/L/lạc quan đã `cancelQueries` (huỷ cả lần tạm dừng). Khoá chi
 * tiết/khoá `'ticket'` khác không bị `cancelQueries` ⇒ `batDauSua` tự huỷ lần tải
 * đang tạm dừng của query vừa bị chặn (xem `doiSoRoiNhac` ở `so-dem-sua.ts`).
 *
 * **Lần tải đầu (mount) lúc đang chặn** (BAT-32). Query mount SAU khi khoá đã bị chặn
 * (mất mạng, S/P/L thẻ A còn treo, chủ mở chi tiết A) bắt đầu ở `fetchStatus
 * 'paused'` mà không đổi trạng thái chặn ⇒ `doiSoRoiNhac` không thấy, và có mạng lại
 * `retryer.continue()` bắn GET vượt cổng. Chọn (b), không (a): (a) `enabled:false`
 * khi chặn thì `invalidateQueries` bỏ qua query đó và phải có lần vẽ lại mới bật
 * được ⇒ dễ kẹt "Đang tải…"; còn `refetchOnMount` KHÔNG được hỏi cho query chưa có
 * dữ liệu. (b) nghe cache: query nào hiện `paused` mà khoá đang bị chặn thì huỷ
 * (`revert`) và ghi vào danh sách hoãn của `ghi-lac-quan.ts` — hết chặn thì
 * `xaHoan` tải lại đúng khoá đó (chi tiết chưa có dữ liệu vẫn được tải). Nghe cache
 * chứ không nghe `onlineManager`: thứ tự listener của `queryCache.onOnline` không
 * nằm trong tay ta. Cùng cổng `khoaBiSuaChan || dangGhiLacQuan` như BAT-31.
 *
 * **Khe còn lại** (có từ trước BAT-32, không sửa): query KHÔNG phải `'ticket'` đã tạm
 * dừng từ trước, rồi một mutation lạc quan ghi vào khoá CON của nó — `cancelQueries(khoá
 * con)` không phủ query cha, và không có sự kiện cache nào để lưới trên bắt (query đã
 * `paused` từ trước). Có mạng lại, `retryer.continue()` vẫn bắn GET. Ca hiếm.
 */

import { QueryClient } from '@tanstack/react-query';
import { dangGhiLacQuan, hoanKhoa } from './ghi-lac-quan';
import { khoaBiSuaChan } from './so-dem-sua';

export function taoQueryClient(): QueryClient {
  const qc: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: (q) => !(khoaBiSuaChan(qc, q.queryKey) || dangGhiLacQuan(qc, q.queryKey)),
        refetchIntervalInBackground: false,
      },
    },
  });
  qc.getQueryCache().subscribe((ev) => {
    if (ev.type !== 'updated') return;
    const q = ev.query;
    if (q.state.fetchStatus !== 'paused') return;
    const khoa = q.queryKey as readonly unknown[];
    if (!(khoaBiSuaChan(qc, khoa) || dangGhiLacQuan(qc, khoa))) return;
    hoanKhoa(qc, khoa);
    void q.cancel({ revert: true });
  });
  return qc;
}
