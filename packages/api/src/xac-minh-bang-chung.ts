/**
 * **Xác minh một bằng chứng** — SPEC mục 7 d.206, d.207, d.219, d.220; 19.7.
 *
 * d.219: "Chạy **ngay khi gửi**, trả kết quả **trong tối đa 10 giây**. Lỗi mạng
 * hoặc token GitHub có vấn đề thì trạng thái là `pending`, tự thử lại sau 5 phút,
 * tối đa 3 lần, rồi thành `failed` với lý do."
 *
 * ## RÀNG BUỘC KIẾN TRÚC: hàm này chạy TRONG WORKER, NGOÀI cửa ghi
 *
 * `WorkspaceGate` là **một** Durable Object cho mỗi workspace và nó chạy **đơn
 * luồng**. Một lần `fetch()` tới GitHub (hay tới một URL deploy) mất hàng giây;
 * gọi nó bên trong DO là treo **toàn bộ hàng đợi ghi của cả workspace** trong
 * suốt thời gian đó — mọi lệnh tạo ticket, nộp báo cáo, nhịp tim của mọi agent
 * đứng lại vì một lần gọi mạng chậm của một bằng chứng.
 *
 * Nên lệnh gửi bằng chứng đi **ba chặng**, và chặng giữa không ở trong DO:
 *
 *   1. **Ghi (trong DO)** — `handlerGuiBangChung`: kiểm quyền, kiểm nội dung,
 *      chèn dòng `evidence` với `xac_minh = 'pending'`.
 *   2. **Gọi mạng (trong Worker, hàm này)** — không chạm DB, không chạm DO.
 *   3. **Ghi kết luận (trong DO)** — `WorkspaceGate.ghiXacMinh`, một lượt ghi thứ
 *      hai, ngắn.
 *
 * Giá phải trả, ghi rõ: hai lượt ghi **không** cùng một giao dịch. Một bằng chứng
 * có thể nằm lại `pending` nếu Worker chết giữa chặng 2 — và đó đúng là trạng
 * thái d.220 dựng ra cho ca này, với `thu_lai_luc` đã đặt sẵn ở chặng 1, nên Cron
 * của lượt 3 nhặt nó lên. Hướng "một giao dịch" thì phải gọi mạng trong DO, tức
 * đánh đổi tính toàn vẹn của một dòng bằng **thời gian đáp của cả workspace**.
 * Xem `decisions.md`.
 */

import {
  TRAN_XAC_MINH_MS,
  type NguonXacMinhMerged,
  type NoiDungBangChung,
  type XacMinhLuuDuoc,
} from '@baton/shared';
import { choDuongTest, type Env } from './moi-truong.js';
import {
  nguonGitHubGiaLap,
  nguonGitHubThat,
  type CaiDatGiaLapGitHub,
  type NguonGitHub,
} from './nguon-github.js';
import {
  maHttpDat,
  nguonDeployGiaLap,
  nguonDeployThat,
  type CaiDatGiaLapDeploy,
  type KiemNoiBo,
  type NguonDeploy,
} from './nguon-deploy.js';
import { hostCongKhaiCuaBaton, tuyenNoiBo } from './tuyen-noi-bo.js';

/** Hai cổng ra của việc xác minh. Tiêm cả hai để test không gọi mạng thật. */
export interface NguonXacMinh {
  github: NguonGitHub;
  deploy: NguonDeploy;
}

/**
 * Kết luận của một lần xác minh, đúng các mã lưu được của migration 0009.
 *
 * `xac_minh = 'pending'` nghĩa là **chưa kết luận được** (lỗi mạng / token) —
 * d.220. `ly_do` khi đó là lý do *chậm*, không phải lý do *trượt*; cả hai cùng
 * vào cột `ly_do` (CHECK của 0009 cho `ly_do` ở `pending` và `failed`).
 */
export interface KetQuaXacMinh {
  xac_minh: Extract<XacMinhLuuDuoc, 'pending' | 'failed' | 'passed' | 'pushed' | 'merged'>;
  ly_do: string | null;
  ma_http: number | null;
  /**
   * **Nguồn của kết luận** `merged`/`pushed` của một commit — `github` hay
   * `local` (migration 0022 khối A). `null` cho mọi kết luận khác và cho deploy.
   *
   * Phải là một trường riêng, không suy từ `xac_minh`: `merged` theo `github` và
   * `merged` theo `local` là **hai mức chắc chắn khác nhau**, và người đọc phải
   * phân biệt được.
   */
  nguon_xac_minh: NguonXacMinhMerged | null;
}

/** Loại có bước xác minh bất đồng bộ — d.206, d.207. Bốn loại kia thì không. */
export function canXacMinh(loai: NoiDungBangChung['loai']): boolean {
  return loai === 'commit' || loai === 'deploy';
}

/**
 * Xác minh **một** bằng chứng. Thuần theo nghĩa "không chạm DB": vào là nội dung
 * đã kiểm hợp lệ, ra là kết luận. Mọi I/O đi qua `nguon`.
 */
export async function xacMinhMotBangChung(
  noi_dung: NoiDungBangChung,
  nguon: NguonXacMinh,
): Promise<KetQuaXacMinh> {
  if (noi_dung.loai === 'commit') {
    const ra = await nguon.github.tinhTrangCommit(noi_dung.repo, noi_dung.commit_hash);

    /*
     * **GitHub là nguồn ƯU TIÊN; `local` chỉ là đường cuối** — migration 0022
     * khối A, `decisions.md` 13/10.
     *
     * Rơi về lời khai `merged_cuc_bo` ở **đúng một** ca: `khong_thay` **kèm
     * `da_hoi_commit`**, tức GitHub đã được hỏi **về chính commit này** (chặng
     * `compare`) và nó trả lời "không có" — hình của một repo chưa push. Mọi ca
     * còn lại **không** rơi về đây:
     *   * `merged`/`pushed` — nguồn ưu tiên đã trả lời; `pushed` nghĩa là GitHub
     *     thấy commit nhưng nó chưa vào nhánh mặc định, nên một lời khai cục bộ
     *     **không** được nâng nó lên;
     *   * **lỗi mạng hoặc lỗi GitHub** — chưa ai trả lời câu hỏi nào, nên d.220 nói
     *     phải `pending` rồi thử lại;
     *   * **server chưa có `GITHUB_TOKEN`** — cũng là `{ loi }`, nên cũng `pending`;
     *   * `khong_thay` **không** kèm `da_hoi_commit` — repo sai hình dạng, hoặc
     *     `GET /repos/<repo>` trả 404. Hai ca này là `failed` **dứt điểm** kèm lý
     *     do nói đúng chuyện gì đã xảy ra: chưa ai hỏi được tới commit, nên không
     *     có gì để một lời khai cục bộ bổ khuyết. Siết lần hai (13/10): trước đó
     *     chúng cũng nhận lời khai, nên **gõ sai một chữ trong tên repo** là mở
     *     được cổng Xong mà GitHub chưa được gọi lần nào.
     *
     * Ca cuối là một lần **siết lại** sau review (13/10): bản đầu cho "thiếu token"
     * rơi về `local` với lý lẽ "thử lại cũng cùng kết quả". Nhưng máy chủ thật hiện
     * **chưa** đặt `GITHUB_TOKEN`, nên nhánh đó biến **mọi** commit có lời khai
     * thành `merged` mà không hỏi GitHub một lần nào — kể cả commit đã push nhưng
     * chưa vào nhánh mặc định, tức đúng ca mà d.206 gọi là `pushed`. Một cấu hình
     * thiếu không được phép mở cổng Xong. Xem `spec-questions.md` #122.
     */
    if ('loi' in ra) {
      // d.220 + 19.7: lỗi mạng, lỗi GitHub, hoặc thiếu token → `pending`.
      return { xac_minh: 'pending', ly_do: ra.loi, ma_http: null, nguon_xac_minh: null };
    }
    if (ra.tinh_trang === 'khong_thay') {
      if (ra.da_hoi_commit !== true) {
        /*
         * **Chưa hỏi được tới commit** (repo sai hình dạng, hoặc repo 404). `failed`
         * **dứt điểm**, không `pending`: 19.7 chỉ cho thử lại khi lỗi là lỗi mạng
         * hoặc lỗi GitHub, mà cả hai ca này là một câu trả lời dứt khoát về **repo**
         * — ba lần thử nữa không sửa được một tên repo gõ sai hay một token không
         * thấy repo riêng tư. `failed` không chặn vĩnh viễn (19.7): sửa repo rồi gửi
         * bằng chứng mới là được.
         */
        return {
          xac_minh: 'failed',
          ly_do: `Không tra được repo ${noi_dung.repo} trên GitHub (sai hình dạng, không tồn tại, hoặc token không thấy repo riêng tư), nên chưa kiểm được commit ${noi_dung.commit_hash}.`,
          ma_http: null,
          nguon_xac_minh: null,
        };
      }
      if (noi_dung.merged_cuc_bo) {
        return { xac_minh: 'merged', ly_do: null, ma_http: null, nguon_xac_minh: 'local' };
      }
      // d.206: "không tìm thấy thì **trượt**" — dứt điểm, không thử lại.
      return {
        xac_minh: 'failed',
        ly_do: `Không tìm thấy commit ${noi_dung.commit_hash} trong repo ${noi_dung.repo}.`,
        ma_http: null,
        nguon_xac_minh: null,
      };
    }
    // `merged` hoặc `pushed`. Chỉ `merged` mở cổng Xong (d.206, d.214) — đó là
    // việc của `congXong`, không của chỗ này.
    return { xac_minh: ra.tinh_trang, ly_do: null, ma_http: null, nguon_xac_minh: 'github' };
  }

  if (noi_dung.loai === 'deploy') {
    const ra = await nguon.deploy.goiUrl(noi_dung.url);
    if ('loi' in ra) {
      return { xac_minh: 'pending', ly_do: ra.loi, ma_http: null, nguon_xac_minh: null };
    }
    /*
     * **Trượt dứt điểm, không thử lại** — 19.7 ("chỉ tự thử lại khi lỗi là lỗi
     * mạng hoặc lỗi GitHub"). Hôm nay chỉ đường kiểm nội bộ dựng ra ca này: một
     * ngoại lệ trong tiến trình thì thử lại ba lần cũng cùng kết quả.
     */
    if ('truot' in ra) {
      return { xac_minh: 'failed', ly_do: ra.truot, ma_http: null, nguon_xac_minh: null };
    }
    if (maHttpDat(ra.ma_http)) {
      return { xac_minh: 'passed', ly_do: null, ma_http: ra.ma_http, nguon_xac_minh: null };
    }
    return {
      xac_minh: 'failed',
      ly_do: `URL deploy trả mã HTTP ${String(ra.ma_http)}; d.207 chỉ nhận 2xx hoặc 3xx.`,
      ma_http: ra.ma_http,
      nguon_xac_minh: null,
    };
  }

  /*
   * Bốn loại còn lại không bao giờ tới đây (`canXacMinh` chặn ở người gọi). Nếu
   * tới thì **không** kết luận gì: trả `pending` kèm lý do, không ném — một bằng
   * chứng `note` bị kéo vào đây là một bug, và bug đó không được biến thành 500
   * cho agent đang nộp việc.
   */
  return {
    xac_minh: 'pending',
    ly_do: `Loại bằng chứng "${noi_dung.loai}" không có bước xác minh nào.`,
    ma_http: null,
    nguon_xac_minh: null,
  };
}

/**
 * Xác minh với **trần 10 giây** của d.219.
 *
 * Hai hàng rào, cả hai cần: hạn của từng lần `fetch`
 * (`AbortSignal.timeout` trong `nguon-*.ts`) và trần tổng ở đây. Hạn từng lần
 * không đủ vì một lần tra commit là **hai** lần gọi nối tiếp, và vì một nguồn
 * giả lập (hay một bug) có thể chậm mà không qua `fetch` nào.
 *
 * Hết trần thì trả `pending` — đúng tinh thần d.220: chưa kết luận được thì chờ
 * và thử lại, **không** kết luận `failed` cho một bằng chứng có thể hoàn toàn
 * đúng.
 */
export async function xacMinhTrongHan(
  noi_dung: NoiDungBangChung,
  nguon: NguonXacMinh,
  tran_ms: number = TRAN_XAC_MINH_MS,
): Promise<KetQuaXacMinh> {
  let dong_ho: ReturnType<typeof setTimeout> | undefined;
  const het_gio = new Promise<KetQuaXacMinh>((ok) => {
    dong_ho = setTimeout(
      () =>
        ok({
          xac_minh: 'pending',
          ly_do: `Xác minh chưa xong trong ${String(Math.round(tran_ms / 1000))} giây (SPEC mục 7 d.219), sẽ thử lại.`,
          ma_http: null,
          nguon_xac_minh: null,
        }),
      tran_ms,
    );
  });
  try {
    return await Promise.race([xacMinhMotBangChung(noi_dung, nguon), het_gio]);
  } finally {
    if (dong_ho !== undefined) clearTimeout(dong_ho);
  }
}

/* ------------------------------------------------------------------ *
 * Chọn nguồn: thật, hay giả lập của test
 * ------------------------------------------------------------------ */

export type CaiDatGiaLap = CaiDatGiaLapGitHub & CaiDatGiaLapDeploy;

/**
 * Nguồn **giả lập** đang được tiêm, hoặc `null` = dùng nguồn thật.
 *
 * ## Vì sao là một biến mức module, không phải một binding của `Env`
 *
 * Lần đầu chỗ cắm này là một binding (`NGUON_GIA_LAP`), và nó **không chạy
 * được**: `@cloudflare/vitest-pool-workers` đưa cho test một đối tượng `env`
 * **khác** đối tượng bindings mà handler của Worker nhận, nên test đặt biến mà
 * Worker không thấy — và lần gọi xác minh đi ra mạng thật (DNS lookup failed
 * trong log test). Ghi lại ở đây để không ai thử lại hướng đó.
 *
 * Một biến mức module thì chạy được, vì test và Worker nạp **cùng một** module
 * (vitest-pool-workers chạy Worker trong cùng isolate với test khi có `main`).
 *
 * ## Vì sao nó không phải một cửa hậu
 *
 * Hai hàng rào, cần cả hai:
 *   1. `nguonXacMinhCua` chỉ đọc biến này khi `choDuongTest(env)` **đúng** — tức
 *      khi `CHO_DUONG_TEST` được đặt, và `wrangler.toml` nói rõ cờ đó **không**
 *      được đặt khi deploy.
 *   2. Không có đường HTTP, header, query hay thân request nào đặt được nó. Chỉ
 *      mã trong cùng bundle gọi `tiemNguonXacMinh` được, và chỗ gọi duy nhất là
 *      `test/giup.ts`.
 *
 * Hàng rào phải chặt vì ai thay được nguồn thì tự khai được "commit của tôi đã
 * **merged**", tức **mở thẳng cổng Xong** (d.206 + d.214).
 */
let nguon_tiem: NguonXacMinh | null = null;

/** **CHỈ test.** Tiêm nguồn giả lập; `null` để trả về nguồn thật. */
export function tiemNguonXacMinh(nguon: NguonXacMinh | null): void {
  nguon_tiem = nguon;
}

/** Dựng một `NguonXacMinh` giả lập từ một bảng khai sẵn — chỉ test dùng. */
export function nguonGiaLap(cai_dat: CaiDatGiaLap): NguonXacMinh {
  return { github: nguonGitHubGiaLap(cai_dat), deploy: nguonDeployGiaLap(cai_dat) };
}

/**
 * Nguồn xác minh của một môi trường.
 *
 * **Đường nội bộ cho URL deploy trỏ vào chính Baton** (d.207) được bật khi và chỉ
 * khi cả hai điều kiện đúng: `BATON_URL_CONG_KHAI` đọc ra được một host, **và**
 * `index.ts` đã đăng ký đường phục vụ của Worker. Thiếu một trong hai thì
 * `noi_bo` là `undefined` và `nguonDeployThat` đi đường `fetch` **y như cũ** —
 * xem `tuyen-noi-bo.ts` cho đủ lý lẽ và cho bốn hàng rào của nó.
 */
export function nguonXacMinhCua(env: Env): NguonXacMinh {
  if (nguon_tiem !== null && choDuongTest(env)) return nguon_tiem;

  const host = hostCongKhaiCuaBaton(env);
  const tuyen = tuyenNoiBo();
  const noi_bo: KiemNoiBo | undefined =
    host === null || tuyen === null
      ? undefined
      : {
          host,
          goi: async (url) =>
            await tuyen(
              new Request(url, { method: 'GET', headers: { 'user-agent': 'baton' } }),
              env,
            ),
        };

  return {
    github: nguonGitHubThat(env.GITHUB_TOKEN),
    deploy: nguonDeployThat({ noi_bo }),
  };
}
