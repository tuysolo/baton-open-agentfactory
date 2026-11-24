/**
 * **Báo "Có bản mới — tải lại trang"** (BAT-39 việc 2, SPEC mục 14 gạch "Có bản
 * mới").
 *
 * Một tab mở từ trước một lần deploy vẫn chạy bundle **cũ**: nó gọi API mới bằng
 * mã cũ cho tới khi chủ tự tải lại. Ở đây tab tự nhận ra mình cũ và hiện **một
 * dòng nhỏ**; bấm thì `location.reload()`. **Không bao giờ tự tải lại** — chủ có
 * thể đang gõ dở (brief, nhãn, ô trả lời).
 *
 * ## Mã bản build: một chuỗi, hai nơi
 *
 * `vite.config.ts` sinh **một** mã mỗi lần `vite build` (thời điểm build + chuỗi
 * ngẫu nhiên) và đặt nó vào hai chỗ: hằng `__MA_BAN_BUILD__` trong bundle
 * (`define`) và file tĩnh `/ban-build.json` (`emitFile`) trong `dist/`. Worker
 * phục vụ `dist/` bằng Workers Static Assets — file có thật nên không rơi vào
 * nhánh SPA (`index.html`), và `/ban-build.json` không thuộc `/v1/*` nên không
 * qua Hono, không cần phiên. Mỗi lần deploy, file đổi theo bản mới; bundle của
 * tab cũ vẫn mang mã cũ ⇒ khác nhau ⇒ hiện dòng.
 *
 * Vì sao không thêm mã vào `/v1/health`: Worker (API) và `dist/` (web) build ở
 * hai chặng riêng (`build:ts`, `build:web`); muốn API biết mã của web thì phải
 * nối hai chặng build lại. File tĩnh đi cùng chính bản web — không nối gì.
 *
 * ## Khi nào kiểm
 *
 * Tab quay lại hiện (`visibilitychange` → `visible`), cửa sổ được focus lại, và
 * định kỳ mỗi `CHU_KY_KIEM_BAN_MS`. `fetch` với `cache: 'no-store'` (asset tĩnh
 * mặc định đã `max-age=0, must-revalidate`; `no-store` để chắc trình duyệt không
 * trả bản nhớ). Lỗi mạng, mã HTTP lỗi, thân không phải JSON (vd `vite dev` trả
 * `index.html`), thân thiếu `ma` ⇒ **im lặng**, không hiện. Đã thấy bản mới thì
 * thôi kiểm (dòng đứng đó tới khi chủ tải lại).
 *
 * Không có mã (`vite dev`, bộ test — không có `define`) ⇒ không kiểm, không hiện.
 */

import { useEffect, useState } from 'react';

/** Hằng do `define` của `vite.config.ts` thay lúc build; không có ở dev/test. */
declare const __MA_BAN_BUILD__: string | undefined;

/** Mã bản build của bundle **đang chạy** trong tab này; `''` khi không có. */
export const MA_BAN_DANG_CHAY: string =
  typeof __MA_BAN_BUILD__ === 'string' ? __MA_BAN_BUILD__ : '';

/** File tĩnh `vite build` phát ra cạnh `index.html`, chứa `{ "ma": "<mã>" }`. */
export const DUONG_BAN_BUILD = '/ban-build.json';

/** Kiểm định kỳ mỗi 5 phút (cộng mỗi lần tab quay lại / được focus). */
export const CHU_KY_KIEM_BAN_MS = 5 * 60_000;

export const CAU_CO_BAN_MOI = 'Có bản mới —';
export const NHAN_TAI_LAI = 'tải lại trang';

/**
 * Đọc mã bản build **đang deploy**. Mọi đường hỏng (mạng, HTTP, JSON, hình thân)
 * ⇒ `null` — người gọi coi như "không biết", không hiện gì.
 */
export async function docMaBanDeploy(): Promise<string | null> {
  try {
    const r = await fetch(DUONG_BAN_BUILD, { cache: 'no-store' });
    if (!r.ok) return null;
    const than: unknown = await r.json();
    if (typeof than !== 'object' || than === null) return null;
    const ma = (than as { ma?: unknown }).ma;
    return typeof ma === 'string' && ma !== '' ? ma : null;
  } catch {
    return null;
  }
}

/** Tab này đang chạy bản cũ? `ma_dang_chay` rỗng ⇒ luôn `false`, không fetch. */
export function useCoBanMoi(ma_dang_chay: string = MA_BAN_DANG_CHAY): boolean {
  const [co, datCo] = useState(false);

  useEffect(() => {
    if (ma_dang_chay === '' || co) return undefined;
    let con = true;
    let dang = false;
    const kiem = (): void => {
      if (dang) return;
      dang = true;
      void docMaBanDeploy().then((ma) => {
        dang = false;
        if (con && ma !== null && ma !== ma_dang_chay) datCo(true);
      });
    };
    const khiHien = (): void => {
      if (document.visibilityState === 'visible') kiem();
    };
    document.addEventListener('visibilitychange', khiHien);
    window.addEventListener('focus', kiem);
    const nhip = window.setInterval(kiem, CHU_KY_KIEM_BAN_MS);
    return () => {
      con = false;
      document.removeEventListener('visibilitychange', khiHien);
      window.removeEventListener('focus', kiem);
      window.clearInterval(nhip);
    };
  }, [ma_dang_chay, co]);

  return co;
}

/** Tải lại trang — chỉ chạy khi chủ bấm. */
function taiLaiTrang(): void {
  window.location.reload();
}

/**
 * Dòng báo bản mới, đặt dưới thanh trên của vỏ. `role="status"`: trình đọc màn
 * hình đọc một lần khi dòng xuất hiện, không cướp focus.
 */
export function BaoBanMoi({
  ma_dang_chay = MA_BAN_DANG_CHAY,
  taiLai = taiLaiTrang,
}: {
  ma_dang_chay?: string;
  taiLai?: () => void;
}): React.JSX.Element | null {
  const co = useCoBanMoi(ma_dang_chay);
  if (!co) return null;
  return (
    <div role="status" data-o="ban-moi" className="border-b border-vien px-4 py-1 text-xs">
      {CAU_CO_BAN_MOI}{' '}
      <button type="button" data-nut="tai-lai" onClick={taiLai} className="underline">
        {NHAN_TAI_LAI}
      </button>
    </div>
  );
}
