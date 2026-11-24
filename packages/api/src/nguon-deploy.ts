/**
 * **Nguồn deploy** — SPEC mục 7 d.207, d.219, d.220.
 *
 * d.207: "Server gọi URL; mã **2xx hoặc 3xx** là đạt. Chỉ nhận `https://`, không
 * nhận IP nội bộ hay localhost."
 *
 * Luật *hình dạng* URL nằm ở `@baton/shared/bang-chung.ts`
 * (`kiemBangChungDeploy` + `laHostBiChan`) và chạy **trước khi** dòng
 * `evidence` được ghi. File này là phần còn lại: **một lần gọi mạng**, và ba
 * quyết định mà SPEC không nói rõ (xem `cau-hoi-spec.md` #57).
 *
 * ## Ba chốt tạm của #57 — đều chọn hướng ĐÓNG
 *
 * 1. **KHÔNG theo chuyển hướng** (`redirect: 'manual'`). SPEC nói "3xx là **đạt**",
 *    nên đọc mã rồi **dừng ngay** là đúng chữ SPEC *và* là hướng an toàn: theo
 *    chuyển hướng thì một URL công khai đã qua `laHostBiChan` có thể trả
 *    `302 Location: http://169.254.169.254/…` và lần gọi thứ hai đi thẳng vào
 *    máy chủ metadata — tức cả lớp chặn host ở trên thành vô nghĩa.
 * 2. **Hạn cứng, và KHÔNG đọc body.** Chỉ cần mã HTTP. Đọc body là mời một
 *    phản hồi dài vô hạn làm treo cửa ghi và ăn bộ nhớ Worker, mà không dòng
 *    nào của SPEC dùng tới nội dung đó.
 * 3. **Kiểm lại host ngay trước khi gọi.** Xem `HAN_CHE_KHONG_GHIM_DUOC_IP`.
 */

import { HAN_GOI_MANG_MS, laHostBiChan } from '@baton/shared';
import { chuanHoaHost } from './tuyen-noi-bo.js';

/**
 * **Cách kiểm một URL trỏ vào chính Baton** — xem `tuyen-noi-bo.ts`.
 *
 * `host` là host công khai của Baton, **đã chuẩn hoá** (`chuanHoaHost`): so sánh
 * **bằng**, không bằng tiền tố hay hậu tố, nên `baton.test.evil.com` không khớp.
 */
export interface KiemNoiBo {
  host: string;
  /** Định tuyến một `GET` vào chính router của app, trả `Response` thật. */
  goi: (url: string) => Promise<Response>;
}

/**
 * ⚠️ **HẠN CHẾ ĐÃ BIẾT, KHÔNG IM LẶNG** (ghi cả ở `quyet-dinh.md` và
 * `cau-hoi-spec.md` #57).
 *
 * Lớp chặn của d.207 chặn được **cú pháp host**: `127.0.0.1`, `10.0.0.5`,
 * `localhost`, mọi cách viết lách của chúng, và các dải nội bộ. Nó **không** chặn
 * được **DNS trỏ tới địa chỉ nội bộ**: `https://noi-bo.example.com/` phân giải ra
 * `10.0.0.5` thì cú pháp hoàn toàn hợp lệ.
 *
 * Cách chặn đúng là: phân giải tên → kiểm IP → **gọi đúng IP đã kiểm** (ghim IP,
 * để không có khoảng hở "phân giải lại ra địa chỉ khác" giữa lúc kiểm và lúc
 * gọi). **Cloudflare Workers không cho làm việc đó**: runtime không có API phân
 * giải DNS, và `fetch` không nhận IP đã ghim — địa chỉ do chính runtime phân giải
 * ở tầng dưới.
 *
 * Nên hạn chế này **ở lại**, và nó phải được viết ra ở đây, trong `quyet-dinh.md`
 * và trong `cau-hoi-spec.md` #57 — chứ không được âm thầm gọi ra như thể đã an
 * toàn. Cái vẫn làm được và đã làm: `redirect: 'manual'` (chặn đường vòng dễ
 * nhất), kiểm lại cú pháp host ngay trước khi gọi, không đọc body, hạn cứng.
 */
export const HAN_CHE_KHONG_GHIM_DUOC_IP =
  'Cloudflare Workers không cho phân giải DNS hay ghim IP, nên lớp chặn d.207 chỉ chặn được cú pháp host, không chặn được tên miền công khai trỏ tới địa chỉ nội bộ. Xem cau-hoi-spec.md #57.';

/**
 * Kết quả một lần gọi URL deploy.
 *   * `{ ma_http }` — có phản hồi; `maHttpDat` quyết đạt hay trượt (d.207).
 *   * `{ loi }`     — **chưa kết luận được** (lỗi mạng, quá hạn) ⇒ đường `pending`
 *                     + thử lại của d.220.
 *   * `{ truot }`   — **trượt dứt điểm kèm lý do**, không thử lại. Dành cho ca
 *                     không có phản hồi HTTP nào mà thử lại cũng vô nghĩa (19.7:
 *                     "chỉ tự thử lại khi lỗi là lỗi mạng hoặc lỗi GitHub").
 */
export type KetQuaGoiUrl = { ma_http: number } | { loi: string } | { truot: string };

export interface NguonDeploy {
  goiUrl(url: string): Promise<KetQuaGoiUrl>;
}

/** "Mã **2xx hoặc 3xx** là đạt" — SPEC d.207, nguyên văn. */
export function maHttpDat(ma: number): boolean {
  return ma >= 200 && ma < 400;
}

/**
 * Bản **thật**: một lần `fetch`, hạn cứng, không theo chuyển hướng, không đọc body.
 *
 * `tuy_chon.goc` là **cửa `fetch`** — cùng nếp tham số tuỳ chọn mà
 * `nguonGitHubThat` đã có cho gốc API, và mặc định vẫn là `fetch` toàn cục, nên
 * hành vi bản thật **không đổi**.
 *
 * Vì sao cần tiêm được: ba lớp an toàn của chốt #57 (`redirect: 'manual'`,
 * `method: 'GET'`, hạn cứng `signal`) nằm **trong đối tượng tuỳ chọn** truyền cho
 * `fetch`. Không có cách nào quan sát chúng mà không ra mạng, nên trước lượt này
 * bỏ `redirect: 'manual'` đi thì **không test nào đỏ** — tức lớp chặn SSRF duy
 * nhất chống `302 → 169.254.169.254` là một lời khẳng định không ai kiểm. Tiêm
 * một `fetch` giả để **đo tuỳ chọn**, không để đổi hành vi.
 */
export function nguonDeployThat(
  tuy_chon: { han_ms?: number; goc?: typeof fetch; noi_bo?: KiemNoiBo | undefined } = {},
): NguonDeploy {
  const han_ms = tuy_chon.han_ms ?? HAN_GOI_MANG_MS;
  const goi = tuy_chon.goc ?? fetch;
  const noi_bo = tuy_chon.noi_bo;
  return {
    async goiUrl(url) {
      /*
       * **Kiểm lại cú pháp host ngay trước khi gọi.** Dư thừa so với
       * `kiemBangChungDeploy` — và đó là chủ ý: đây là chặng **cuối cùng** trước
       * một lần gọi ra ngoài, nên nó không được tin chặng nào phía trước. Cron
       * thử lại của lượt 3 đọc URL **từ DB** và đi thẳng vào đây, không qua
       * `kiemBangChungDeploy` nữa.
       */
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return { loi: 'URL deploy không đọc được.' };
      }
      if (u.protocol !== 'https:' || laHostBiChan(u.hostname)) {
        return { loi: 'URL deploy không được trỏ tới localhost hay IP nội bộ.' };
      }

      /*
       * **URL trỏ vào CHÍNH Baton → kiểm NỘI BỘ, không gọi mạng.**
       *
       * Đặt **sau** hai lớp trên, có chủ ý: đường nội bộ không được là cửa lách
       * "chỉ `https:`" và `laHostBiChan`. Lý do đầy đủ (gồm nguyên nhân thật của
       * lỗi "404 khi gọi chính mình" ngày 13/10) ở `tuyen-noi-bo.ts`.
       */
      if (noi_bo !== undefined && chuanHoaHost(u.hostname) === noi_bo.host) {
        try {
          const res = await noi_bo.goi(u.toString());
          await res.body?.cancel().catch(() => undefined);
          return { ma_http: res.status };
        } catch {
          /*
           * **Một lỗi TRONG TIẾN TRÌNH ⇒ `{ truot }` (trượt dứt điểm), KHÔNG
           * `{ loi }`** — siết sau review (13/10).
           *
           * `{ loi }` đi đường `pending` của d.220, tức Cron thử lại 3 lần trong 15
           * phút. Nhưng 19.7 nói rõ "server **chỉ** tự thử lại khi lỗi là **lỗi
           * mạng hoặc lỗi GitHub**", và nhánh này không gọi mạng lần nào: nó là một
           * ngoại lệ của chính router Baton, nên thử lại ba lần cũng cùng kết quả.
           *
           * Dùng `{ truot }` chứ không bịa một `ma_http: 500`: không có phản hồi
           * HTTP nào cả, và ghi một mã mà máy chủ chưa từng trả là nói sai trong
           * một cột chủ đọc được. `{ truot }` là **trượt dứt điểm kèm lý do** —
           * 19.7 cho phép, và d.219 vẫn cho gửi bằng chứng mới.
           */
          return { truot: 'Không kiểm được URL deploy của chính Baton (lỗi phía server).' };
        }
      }

      try {
        const res = await goi(u.toString(), {
          method: 'GET',
          // Chốt #57: 3xx là **đạt**, nên đọc mã rồi dừng. Xem đầu file.
          redirect: 'manual',
          headers: { 'user-agent': 'baton' },
          signal: AbortSignal.timeout(han_ms),
        });
        /*
         * **Không đọc body**, nhưng phải **huỷ** nó: để một thân phản hồi mở là
         * giữ một kết nối sống cho tới khi runtime dọn.
         */
        await res.body?.cancel().catch(() => undefined);
        return { ma_http: res.status };
      } catch {
        // Thông điệp không mang lỗi gốc (SPEC mục 15) — xem `nguon-github.ts`.
        return { loi: 'Không gọi được URL deploy (lỗi mạng hoặc quá hạn chờ).' };
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * Bản giả lập — CHỈ dùng trong test
 * ------------------------------------------------------------------ */

/** Một dòng của bảng giả lập: mã HTTP, hoặc một lỗi mạng. */
export type DongGiaLapDeploy = number | { loi: string };

export interface CaiDatGiaLapDeploy {
  /** URL → mã HTTP. URL **không** có trong bảng = `404`. */
  deploy?: Record<string, DongGiaLapDeploy>;
  /** Giả một nguồn **chậm**. */
  cham_ms?: number;
}

function cho(ms: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, ms));
}

/**
 * Nguồn deploy **giả lập**, **không gọi mạng**.
 *
 * Mặc định `404` (một mã trượt dứt điểm), không phải lỗi mạng: một ca test gõ sai
 * URL thấy "trượt vì 404" rõ hơn là thấy "pending vì lỗi mạng".
 */
export function nguonDeployGiaLap(cai_dat: CaiDatGiaLapDeploy = {}): NguonDeploy {
  const bang = cai_dat.deploy ?? {};
  const cham_ms = cai_dat.cham_ms ?? 0;
  return {
    async goiUrl(url) {
      if (cham_ms > 0) await cho(cham_ms);
      const dong = bang[url];
      if (dong === undefined) return { ma_http: 404 };
      return typeof dong === 'number' ? { ma_http: dong } : { loi: dong.loi };
    },
  };
}
