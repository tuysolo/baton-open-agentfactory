/**
 * **Nhịp làm mới — một chỗ cho cả giao diện.**
 *
 * SPEC mục 14 d.420 đòi "thay đổi do agent tạo hiện lên trong vòng 3 giây, không
 * cần tải lại trang", và d.419 đòi "sau lần tải đầu, chuyển trang không có màn
 * hình chờ toàn trang". Mười trang cài hai luật đó **mười lần** là mười cách hơi
 * khác nhau để làm mới, và lượt này chủ đã gặp hậu quả: trang Tổng quan nháy dòng
 * "Đang làm mới…" mỗi hai giây.
 *
 * Nên ba thứ ở đây, và **không** chép sang trang nào:
 *
 *   1. `NHIP_LAM_MOI` / `NHIP_LAM_MOI_DANH_SACH` — mảnh tuỳ chọn trải vào
 *      `useQuery`. Một lần chốt chu kỳ hay chốt cách giữ dữ liệu cũ sửa đúng một
 *      chỗ.
 *   2. `useNhipLamMoi` — trả `hien_dau`: có hiện dấu "đang làm mới" hay không.
 *   3. (cùng hook) **quay lại tab thì làm mới ngay một lần**.
 *
 * ## Vì sao refetch nền phải IM LẶNG
 *
 * d.420 nói về *dữ liệu*, không nói giao diện phải **kể** là nó đang hỏi. Một
 * dòng trạng thái mọc lên rồi mất mỗi hai giây là thứ tệ hơn cả việc không có
 * nó: nó đẩy nội dung bên dưới, nên chủ đang đọc một dòng thì dòng đó nhảy chỗ.
 * Dữ liệu cũ vẫn ở đó, vẫn đúng tới mili-giây vừa rồi — không có gì để báo.
 *
 * Chỉ một lượt **chậm quá** `NGUONG_HIEN_DAU_LAM_MOI_MS` mới đáng một dấu, và cả
 * lúc đó dấu nằm trong **ô dành sẵn** (`vo/dau-lam-moi.tsx`), chiều cao cố định:
 * hiện hay không hiện thì nội dung bên dưới **không** dịch một pixel.
 *
 * ## Vì sao "quay lại tab" cài ở đây, không bật `refetchOnWindowFocus`
 *
 * Tab ẩn thì TanStack Query **không** fetch theo nhịp (`refetchIntervalInBackground`
 * mặc định `false`, và `queryObserver` kiểm `focusManager.isFocused()` trước khi
 * fetch — xem chú thích trong `query.ts`). Tức sau mười phút ẩn tab, màn hình đang
 * cũ mười phút: quay lại mà chờ hết một chu kỳ nữa là hở đúng vế "không cần tải
 * lại trang" của d.420.
 *
 * `refetchOnWindowFocus: true` **không** dùng, có chủ ý: nó bắn theo cả `focus`
 * của cửa sổ, nên mỗi lần chủ click từ cửa sổ khác về — kể cả để bấm một nút —
 * là một loạt refetch. Ở đây nghe đúng `visibilitychange` và chỉ chạy khi
 * `visibilityState === 'visible'`: đúng một lần cho một lần quay lại tab.
 *
 * Listener là **một** cho mỗi `QueryClient`, không một cho mỗi query: một trang
 * có hai query dùng hook này (Cần Chủ) thì hai listener sẽ `invalidateQueries`
 * hai lần cho cùng một lần quay lại. Sổ đăng ký dưới đây đếm số người dùng và chỉ
 * tháo khi người cuối rời đi.
 */

import { useEffect, useRef, useState } from 'react';
import {
  keepPreviousData,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { CHU_KY_LAM_MOI_MS, NGUONG_HIEN_DAU_LAM_MOI_MS } from './hang-so';
import { dangGhiLacQuan } from './ghi-lac-quan';
import { khoaBiSuaChan } from './so-dem-sua';

/**
 * Tuỳ chọn `useQuery` cho một đường đọc **đổi do agent** (d.420).
 *
 * `refetchIntervalInBackground: false` khai **tường minh** dù đó đang là mặc
 * định: luật "tab ẩn thì không hỏi máy chủ" không được treo vào một mặc định của
 * thư viện — nó rụng theo một lần nâng phiên bản mà không ca nào đỏ.
 */
export const NHIP_LAM_MOI = {
  refetchInterval: CHU_KY_LAM_MOI_MS,
  refetchIntervalInBackground: false,
} as const;

/**
 * Như trên, thêm **giữ dữ liệu cũ khi khoá đổi** — cho query **có tham số** (bộ
 * lọc, cursor).
 *
 * Đổi bộ lọc là đổi `queryKey`, và một khoá mới chưa có cache nghĩa là `data`
 * thành `undefined` **một nhịp**: danh sách trống trắng rồi mọc lại. Đó đúng là
 * "màn hình chờ" mà d.419 cấm, chỉ là nó ngắn.
 *
 * **Không** dùng cho trang chi tiết khoá theo id (phiên, hồ sơ, ticket, agent):
 * ở đó dữ liệu cũ không phải "bản cũ của cùng một thứ" mà là **một thứ khác** —
 * giữ nó lại nghĩa là hiện tên và thân của *ticket trước* dưới đường dẫn của
 * ticket mới. Một dòng "Đang tải…" ngắn thà hơn một màn hình nói sai nó là gì.
 */
export const NHIP_LAM_MOI_DANH_SACH = {
  ...NHIP_LAM_MOI,
  placeholderData: keepPreviousData,
} as const;

/**
 * **Nhịp tắt khi khoá đang có ghi lạc quan bay** (BAT-27, d.418) — bản của
 * `NHIP_LAM_MOI` cho query mà một mutation lạc quan ghi vào (`ghi-lac-quan.ts`).
 *
 * `refetchInterval` là **hàm** đọc sổ đếm SỐNG (`dangGhiLacQuan`), không một số
 * chụp lúc vẽ: `batDauGhiLacQuan` cộng ở dòng đầu `onMutate`, rồi `setQueryData`
 * trong `onMutate` chạy đồng bộ → `onQueryUpdate` → `#updateTimers` tính lại hàm
 * này ⇒ trả `false` ⇒ tick đã hẹn bị xoá **trước** khi bắn (cùng lý lẽ với nhịp
 * danh sách ticket, `danh-sach-ticket.tsx`). Một state React thì chỉ đổi ở lần vẽ
 * sau — có một khe để tick bắn GET cũ đè giá trị lạc quan.
 *
 * Bật lại: `onSettled` trả vé rồi `invalidateQueries` ⇒ lượt tải đó cập nhật query
 * ⇒ `#updateTimers` tính lại ⇒ sổ đã về 0 ⇒ nhịp chạy lại.
 *
 * **Thêm sổ S/P/L (BAT-30)**: `khoaBiSuaChan` (`so-dem-sua.ts`) cũng tắt nhịp — chi
 * tiết `['ticket','chi-tiet',ma]` khi thẻ `ma` (hoặc thẻ chưa biết mã) có S/P/L bay.
 * Đặt ở đây (chung) vì `khoaBiSuaChan` trả `false` cho khoá không phải `'ticket'`
 * (trang khác không đổi hành vi) và để mọi query chi tiết thẻ dùng chung một cổng.
 * Hàm chỉ được TÍNH LẠI khi query cập nhật: `batDauSua`/`ghiMaThe`/`ketThucSua`
 * gọi `setState({})` lên query chi tiết để observer tính lại đồng bộ (xem
 * `nhacNhipChiTiet`) — không phụ thuộc lần vẽ lại của React.
 *
 * Cần `qc` vì `Query` không lộ client của nó; trang lấy bằng `useQueryClient()`.
 */
export function nhipLamMoi(qc: QueryClient): {
  refetchInterval: (q: { queryKey: QueryKey }) => number | false;
  refetchIntervalInBackground: false;
} {
  return {
    refetchInterval: (q) =>
      dangGhiLacQuan(qc, q.queryKey) || khoaBiSuaChan(qc, q.queryKey) ? false : CHU_KY_LAM_MOI_MS,
    refetchIntervalInBackground: false,
  };
}

/** Như `nhipLamMoi`, thêm giữ dữ liệu cũ khi khoá đổi — xem `NHIP_LAM_MOI_DANH_SACH`. */
export function nhipLamMoiDanhSach(qc: QueryClient): ReturnType<typeof nhipLamMoi> & {
  placeholderData: typeof keepPreviousData;
} {
  return { ...nhipLamMoi(qc), placeholderData: keepPreviousData };
}

/* ------------------------------------------------------------------ *
 * Sổ đăng ký listener `visibilitychange` — một cho mỗi QueryClient
 * ------------------------------------------------------------------ */

/** Khoá của những đường đọc **có nhịp** mà một component đang dùng. */
type NguonKhoa = { current: readonly (readonly unknown[])[] };

interface GhiDanhNghe {
  /** Mỗi component dùng hook góp một nguồn; tháo thì rút nguồn ra. */
  nguon: Set<NguonKhoa>;
  thao: () => void;
}

const SO_NGHE = new WeakMap<QueryClient, GhiDanhNghe>();

/**
 * Đăng ký "quay lại tab thì làm mới" cho **đúng các khoá** của `nguon`.
 *
 * ## Vì sao KHÔNG `invalidateQueries({ refetchType: 'active' })` trần
 *
 * Bản đầu của lượt này gọi đúng câu đó: không `queryKey` nghĩa là khớp **mọi**
 * query trong cache. Nó phá hai thứ đã chốt ở nơi khác:
 *
 *   * `trang/bao-cao.tsx` cố ý **không** cho một dòng `bao_cao` nhịp nào ("một
 *     dòng báo cáo là **bất biến**"), nhưng chủ mở một báo cáo cũ rồi chuyển tab
 *     và quay lại là một lượt tải lại nó;
 *   * `['du-an']`, `['agent']` (danh sách lựa chọn bộ lọc — đổi **theo chủ**,
 *     không theo agent) và `['toi']` cũng bị kéo theo.
 *
 * Tức hook đã dựng lại **một mặc định toàn cục** qua cửa sau, đúng thứ
 * `src/query.ts` từ chối làm ở cửa trước. Nên ở đây chỉ làm mới những đường đọc
 * **đã tự khai là có nhịp** bằng cách gọi hook này.
 *
 * `nguon` là một **ref**, không một mảng: khoá của trang đổi theo bộ lọc, và đọc
 * qua ref thì một lần đổi bộ lọc không phải tháo/gắn lại listener.
 *
 * Một listener cho mỗi `QueryClient`, và mỗi khoá được invalidate **một lần** cho
 * một lần quay lại (`Set` chữ-ký khoá): một trang có hai query, hay sidebar và
 * trang cùng trỏ một khoá, không được thành hai lượt gọi.
 */
function ganNgheHienLai(qc: QueryClient, nguon: NguonKhoa): () => void {
  let g = SO_NGHE.get(qc);
  if (g === undefined) {
    const ghi: GhiDanhNghe = { nguon: new Set(), thao: () => undefined };
    const nghe = (): void => {
      if (document.visibilityState !== 'visible') return;
      const da_goi = new Set<string>();
      for (const n of ghi.nguon) {
        for (const khoa of n.current) {
          const chu_ky = JSON.stringify(khoa);
          if (da_goi.has(chu_ky)) continue;
          da_goi.add(chu_ky);
          /*
           * `refetchType: 'active'` — chỉ query **đang có người xem** mới hỏi
           * lại. Đó cũng là mặc định; khai thẳng vì đây là chỗ dễ biến thành một
           * trận refetch cả cache nhất.
           */
          /*
           * `exact: true` — khoá đăng ký là khoá **của chính** query có nhịp, và
           * `invalidateQueries` mặc định khớp **tiền tố**. Không có nó, một khoá
           * ngắn của danh sách (nay là `['bao-cao', 'ds']`, có nhịp) có thể kéo
           * theo `['bao-cao', ngay, loai]` (một dòng báo cáo, **bất biến**, cố ý
           * không có nhịp) — đúng ca reviewer bắt được ở khoá `['bao-cao']` cũ.
           */
          /*
           * Cổng S/P/L (d.418), thu hẹp theo loại khoá `'ticket'` — luật ở
           * `khoaBiSuaChan` (`so-dem-sua.ts`), dùng chung với `lamMoiTheoSo`
           * (BAT-29). GET lúc này trả dữ liệu TRƯỚC thao tác và đè giá trị lạc
           * quan. Không cần hoãn rồi bắn lại: `lamMoiSauDoi` invalidate danh sách
           * + chi tiết thẻ bị sửa khi sổ đếm về 0.
           */
          if (khoaBiSuaChan(qc, khoa)) continue;
          /*
           * BAT-27 — cùng lý lẽ cho **mọi** mutation ghi lạc quan khác (sổ chung
           * `ghi-lac-quan.ts`): khoá đang bị ghi (trùng, cha hoặc con — xem
           * `dangGhiLacQuan`) thì bỏ qua lần quay lại này. Không bắn bù: `onSettled`
           * của mutation đó đã `invalidateQueries` khoá của nó.
           */
          if (dangGhiLacQuan(qc, khoa)) continue;
          void qc.invalidateQueries({ queryKey: khoa, exact: true, refetchType: 'active' });
        }
      }
    };
    document.addEventListener('visibilitychange', nghe);
    ghi.thao = () => {
      document.removeEventListener('visibilitychange', nghe);
    };
    SO_NGHE.set(qc, ghi);
    g = ghi;
  }

  g.nguon.add(nguon);

  return () => {
    const con = SO_NGHE.get(qc);
    if (con === undefined) return;
    con.nguon.delete(nguon);
    // Người cuối rời đi ⇒ tháo listener **và** xoá sổ, để lần mount sau đăng ký
    // lại từ đầu (một sổ còn lại với `nguon` rỗng là một listener không ai gọi).
    if (con.nguon.size > 0) return;
    con.thao();
    SO_NGHE.delete(qc);
  };
}

/* ------------------------------------------------------------------ *
 * Hook
 * ------------------------------------------------------------------ */

/**
 * Nhịp làm mới của một trang.
 *
 * `dang_tai` là `isFetching` của query (hoặc `a.isFetching || b.isFetching` khi
 * trang có nhiều query — một dấu cho cả trang, không một dấu cho mỗi query).
 *
 * `khoa` là khoá của **những** query có nhịp trên trang đó (trang Cần Chủ có
 * hai). Trang phải nói ra khoá của mình: đó là thứ duy nhất phân biệt "đường đọc
 * có nhịp" với "đường đọc cố ý không có nhịp" (một dòng báo cáo, danh sách lựa
 * chọn bộ lọc) — xem `ganNgheHienLai`.
 *
 * Trả `hien_dau`: bật khi một lượt tải đã chạy liên tục quá
 * `NGUONG_HIEN_DAU_LAM_MOI_MS`, tắt ngay khi lượt đó xong. Hẹn giờ được dọn cả
 * khi `dang_tai` đổi và khi component bị tháo — một `setTimeout` còn sống sau khi
 * tháo là một `setState` trên cây đã chết.
 */
export function useNhipLamMoi(
  dang_tai: boolean,
  khoa: readonly (readonly unknown[])[],
): { hien_dau: boolean } {
  const qc = useQueryClient();
  const [hien_dau, datHienDau] = useState(false);

  /*
   * Khoá đi qua một **ref**: trang dựng mảng khoá mới mỗi lần render (và nó đổi
   * thật khi bộ lọc đổi), nên để nó vào mảng phụ thuộc của `useEffect` là
   * tháo/gắn listener mỗi lần vẽ.
   */
  const khoa_moi_nhat = useRef(khoa);
  khoa_moi_nhat.current = khoa;

  useEffect(() => ganNgheHienLai(qc, khoa_moi_nhat), [qc]);

  useEffect(() => {
    if (!dang_tai) {
      datHienDau(false);
      return;
    }
    const hen = setTimeout(() => {
      datHienDau(true);
    }, NGUONG_HIEN_DAU_LAM_MOI_MS);
    return () => {
      clearTimeout(hen);
    };
  }, [dang_tai]);

  return { hien_dau };
}
