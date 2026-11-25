/**
 * Giúp việc chung cho các ca test có request chờ dài / chạy ngầm (BAT-13).
 *
 * Cùng một mẫu với `cho-dai.test.ts` (BAT-12 việc 1), gom lại để các file khác dùng
 * chung. Hai nửa:
 *   * `soRequestBay` — sổ các promise còn đang bay, để `afterEach` chờ hết.
 *   * `caQuaSo`      — `it`/`it.each`/`beforeEach` mà cả thân đi qua sổ đó (BAT-53, 54);
 *                      đo luôn thời gian thân/`beforeEach` vào `meta.do_ca` (BAT-55,
 *                      `do-ca-cham.ts` đọc khi ca chậm).
 *   * `choToi`       — chờ tới khi điều kiện xảy ra THẬT, thay cho `nghi(N)` cố định.
 *   * `choBuocTotpConDu` — canh bước TOTP 30 giây trước một ca đăng nhập (BAT-51).
 */

import { beforeEach as beforeEachGoc, it as itGoc } from 'vitest';
import { getCurrentTest } from 'vitest/suite';
import { TOTP_BUOC_GIAY } from '@baton/shared';

export function nghi(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Một bước TOTP, ms (RFC 6238, `TOTP_BUOC_GIAY` = 30). */
const BUOC_TOTP_MS = TOTP_BUOC_GIAY * 1000;

/**
 * Trần thời gian của THÂN một ca — `testTimeout` mặc định của Vitest. Các file
 * dùng `choBuocTotpConDu` không đặt trần riêng cho ca nào, nên thân ca nào chạy
 * quá số này thì đã đỏ vì hết giờ, không đi tới assert TOTP nào.
 */
const TRAN_THAN_CA_MS = 5_000;

/**
 * **Canh bước TOTP** (BAT-51): chờ tới khi bước 30 giây hiện tại còn ít nhất
 * `con_lai_ms`, để THÂN ca sau đó nằm trọn trong MỘT bước.
 *
 * Vì sao phải có: các ca đăng nhập tính `g = buocTotp(Date.now())` ở client rồi
 * gửi mã của `g - 1` (để còn `g`, `g + 1` cho các lần sau — mỗi bước chỉ tiêu
 * được một lần). Cửa sổ ±1 do bước đọc ở **máy chủ** quyết định; nếu mốc 30 giây
 * nhảy giữa lúc tính `g` và lúc máy chủ kiểm mã thì `g - 1` thành "lệch −2" và bị
 * từ chối (401) — ca đỏ ngẫu nhiên, càng hay khi cả bộ chạy song song làm mỗi
 * request chậm đi. Đã bắt thật ở `dat-lai-totp.test.ts` và `tai-khoan-chu.test.ts`.
 *
 * Gọi ở `beforeEach` **cuối cùng** của khối (sau mọi bước dựng nền), không trong
 * thân ca: thời gian chờ ăn vào trần của hook (10 giây mặc định), không ăn vào
 * trần 5 giây của thân. Còn ≥ `TRAN_THAN_CA_MS + 1 000` ms khi thân bắt đầu thì
 * thân không thể vắt qua mốc bước mà vẫn xanh: quá 5 giây là đã đỏ vì hết giờ.
 *
 * Không nới gì: cửa sổ ±1, chống dùng lại, mọi assert giữ nguyên. Chỉ loại một
 * điều kiện đầu vào sai (mốc bước nhảy giữa ca) mà ca không định đo.
 */
export async function choBuocTotpConDu(con_lai_ms = TRAN_THAN_CA_MS + 1_000): Promise<void> {
  const con_lai = BUOC_TOTP_MS - (Date.now() % BUOC_TOTP_MS);
  if (con_lai < con_lai_ms) await nghi(con_lai + 20);
}

/**
 * Chờ tới khi `dieu_kien()` đúng, hỏi lại mỗi ~20 ms, tối đa `han_ms`.
 *
 * Trả `true` nếu điều kiện đúng, `false` nếu hết hạn. Hàm này **không** tự đỏ ca:
 * người gọi phải `expect` đúng điều kiện cũ ngay sau đó, nên hết hạn thì ca vẫn đỏ
 * với đúng thông báo của assert — không nới gì.
 *
 * Vì sao không `nghi(250)`: nó đánh cược request đi hết xác thực, D1 và vào được DO
 * trong 250 ms. Máy tải nặng thì cược thua, assert đỏ, và request bị bỏ rơi còn sống
 * tới khi `@cloudflare/vitest-pool-workers` đã pop storage cô lập của ca
 * ("Isolated storage failed", `SQLITE_IOERR`).
 */
export async function choToi(
  dieu_kien: () => boolean | Promise<boolean>,
  han_ms = 10_000,
): Promise<boolean> {
  const t0 = Date.now();
  for (;;) {
    if (await dieu_kien()) return true;
    if (Date.now() - t0 >= han_ms) return false;
    await nghi(20);
  }
}

/**
 * Dọn xong rồi ném lỗi: dùng trong `catch (e)` của ca test khi phải chờ các việc
 * còn treo (waiter, request) trước khi thoát.
 *
 * Chờ mọi `viec` xong bằng `allSettled`. Việc nào reject thì ném `AggregateError`
 * với lỗi gốc `loi_goc` đứng ĐẦU, rồi tới các lý do của việc dọn; không thì ném lại
 * đúng `loi_goc`. Không nuốt lỗi nào, và `await viec` trần không còn thay mất lỗi gốc.
 */
export async function choRoiNem(loi_goc: unknown, ...viec: Promise<unknown>[]): Promise<never> {
  const kq = await Promise.allSettled(viec);
  const ly_do = kq.flatMap((k) => (k.status === 'rejected' ? [k.reason as unknown] : []));
  if (ly_do.length > 0) {
    throw new AggregateError([loi_goc, ...ly_do], 'Ca test đỏ, và việc dọn dẹp cũng lỗi');
  }
  throw loi_goc;
}

export interface SoBay {
  theoDoi: <T>(p: Promise<T>) => Promise<T>;
  doiHet: () => Promise<void>;
}

/**
 * Sổ các promise còn đang bay (request HTTP hoặc lượt cron chạy ngầm).
 *
 * Dùng: `const bay = soRequestBay();` ở đầu file, `bay.theoDoi(p)` bao quanh mọi
 * request có thể treo, và `afterEach(bay.doiHet, TRAN_AFTER_EACH)`.
 * Ca xanh thì sổ đã xong, chờ 0 ms; ca đỏ thì lỗi thật hiện ra đúng tên thay vì bị
 * "Isolated storage failed" che mất.
 *
 * `doiHet` chờ **tới khi sổ rỗng**, không chỉ chờ bản chụp đầu (BAT-53): một việc
 * trong sổ (vd cả thân ca, xem `caQuaSo`) có thể ghi thêm việc mới vào sổ trong lúc
 * đang được chờ — bản cũ chụp sổ một lần rồi xoá, nên việc ghi sau lọt ra ngoài
 * (đúng lỗ đã ghi ở dòng BAT-51 lượt 2 của `decisions.md`).
 */
export function soRequestBay(): SoBay {
  const dang_bay = new Set<Promise<unknown>>();
  return {
    theoDoi<T>(p: Promise<T>): Promise<T> {
      dang_bay.add(p);
      return p;
    },
    async doiHet(): Promise<void> {
      while (dang_bay.size > 0) {
        const ds = [...dang_bay];
        dang_bay.clear();
        await Promise.allSettled(
          ds.map(async (p) => {
            const v = await p;
            if (v instanceof Response && !v.bodyUsed) await v.arrayBuffer();
          }),
        );
      }
    },
  };
}

/** Thân một ca hoặc một hook. Các file dùng `caQuaSo` không dùng fixture của Vitest. */
type Than = () => unknown;

/**
 * **Số đo của một ca, ghi vào `meta` của ca** (BAT-55) — `test/do-ca-cham.ts` đọc
 * nó khi ca chậm để tách "thân chậm" khỏi "runtime đứng ngoài thân" (push/pop
 * storage cô lập, hook). Chỉ là số đo: không đổi gì của ca.
 */
export interface DoCa {
  /** Tổng thời gian các `beforeEach` đi qua `caQuaSo`, ms. */
  before_each_ms?: number;
  /** Thời gian THÂN ca (phần trần 5 s của Vitest áp lên), ms. */
  than_ms?: number;
}

/**
 * Đồng hồ THẬT, giữ lúc nạp module: `vi.useFakeTimers` mặc định giả cả
 * `performance.now` (mọi bộ đếm giờ có mặt), nên gọi `performance.now()` lúc chạy
 * trong ca dùng đồng hồ giả sẽ ra số giả.
 */
const dongHoThat: () => number = performance.now.bind(performance);

/**
 * Cộng `ms` vào `meta.do_ca[khoa]` của `ca`; không có ca nào thì bỏ qua.
 *
 * `ca` do người gọi chụp lúc thân BẮT ĐẦU, không lấy lại ở đây: ca hết giờ có thân
 * chạy xong muộn, lúc đó `getCurrentTest()` đã là ca kế tiếp.
 */
function ghiDoCa(ca: ReturnType<typeof getCurrentTest>, khoa: keyof DoCa, ms: number): void {
  if (ca === undefined) return;
  const meta = ca.meta as { do_ca?: DoCa };
  meta.do_ca = { ...meta.do_ca, [khoa]: (meta.do_ca?.[khoa] ?? 0) + Math.round(ms) };
}

/**
 * Bọc một thân ca/hook để **cả thân** là MỘT việc trong sổ `bay` (BAT-53).
 *
 * `khoa_do` (BAT-55): có thì thời gian của thân được ghi vào `meta.do_ca` của ca
 * (xem `DoCa`). Đo bằng `dongHoThat`, nên ca dùng đồng hồ giả vẫn đo đúng.
 */
export function thanQuaSo(bay: SoBay, than: Than, khoa_do?: keyof DoCa): () => Promise<void> {
  return () =>
    bay.theoDoi(
      (async () => {
        // Chụp ca lúc thân BẮT ĐẦU (xem `ghiDoCa`).
        let ca: ReturnType<typeof getCurrentTest>;
        try {
          ca = khoa_do === undefined ? undefined : getCurrentTest();
        } catch {
          ca = undefined;
        }
        const t0 = dongHoThat();
        try {
          await than();
        } finally {
          if (khoa_do !== undefined) {
            try {
              ghiDoCa(ca, khoa_do, dongHoThat() - t0);
            } catch {
              // Công cụ đo không được làm đỏ ca, không được đè lỗi thật của thân.
            }
          }
        }
      })(),
    );
}

/**
 * **`it` và `beforeEach` mà thân đi qua sổ `bay`** (BAT-53) — dùng cùng
 * `afterEach(bay.doiHet)` ở đầu file.
 *
 * Gốc đã tái hiện: Vitest **không dừng** thân ca khi hết giờ. Thân vẫn chạy tiếp —
 * lệnh CLI đang dở bắn request kế, rồi lệnh CLI kế — trong khi Vitest đi tiếp:
 * `afterEach`, rồi `@cloudflare/vitest-pool-workers` huỷ mọi Durable Object và
 * chép/xoá file `.sqlite` của khung storage cô lập
 * (`dist/worker/lib/cloudflare/test-runner.mjs` `updateStackedStorage`;
 * `dist/pool/index.mjs` `popStackedStorage`). Request trôi nổi vào đúng lúc đó dựng
 * lại DO `GioiHanToken` (bước đếm nhịp đầu tiên của mọi request có token) và DO của
 * D1 ⇒ SQLite mở lại file ⇒ có `…sqlite-shm` giữa lúc pool đọc thư mục ⇒
 * `Expected .sqlite, got …sqlite-shm` ⇒ "Isolated storage failed", và từ đó MỌI ca
 * còn lại của runtime đỏ theo (`state.broken`). Máy tải nặng thì ca hết giờ nhiều hơn,
 * nên lỗi chỉ lộ khi tải nặng.
 *
 * Ca hết giờ là ca đỏ, đúng. Chỉ không để nó kéo đổ các ca khác: thân nằm trong sổ,
 * và với ca đỏ Vitest gọi `afterEach` TRƯỚC khi pool pop storage (ca xanh thì thân
 * đã xong từ trước, `doiHet` chờ 0 ms). Không nới trần ca nào, không retry.
 *
 * Nhận dạng `it(tên, thân, trần?)`, `it.each(bảng)(tên, thân, trần?)` (BAT-54) và
 * `beforeEach(thân, trần?)` — đủ cho các file dùng nó. `it.todo` (không có thân)
 * không qua đây: file cần nó thì nhập `it as itGoc` từ Vitest.
 *
 * `it.each` giao lại cho `it.each` GỐC của Vitest — tên ca (`%s`, `%i`, `%j`,
 * `$khoa`…) và cách trải đối số (mọi phần tử là mảng thì trải ra, không thì đưa
 * nguyên phần tử) giữ đúng như cũ; chỉ thân của TỪNG ca được bọc qua sổ.
 */
export function caQuaSo(bay: SoBay): {
  it: ItQuaSo;
  beforeEach: (than: Than, han?: number) => void;
} {
  const it = (ten: string, than: Than, han?: number): void => {
    itGoc(ten, thanQuaSo(bay, than, 'than_ms'), han);
  };
  const each = (bang: readonly unknown[]) => {
    const itEach = itGoc.each(bang);
    return (ten: string, than: (...doi: never[]) => unknown, han?: number): void => {
      itEach(
        ten,
        (...doi: unknown[]) =>
          thanQuaSo(bay, () => (than as (...d: unknown[]) => unknown)(...doi), 'than_ms')(),
        han,
      );
    };
  };
  return {
    it: Object.assign(it, { each }),
    beforeEach(than, han) {
      beforeEachGoc(thanQuaSo(bay, than, 'before_each_ms'), han);
    },
  };
}

/** Thân một ca `it.each` nhận `D` làm đối số, trần tuỳ chọn. */
type CaEach<D extends readonly unknown[]> = (
  ten: string,
  than: (...doi: D) => unknown,
  han?: number,
) => void;

/**
 * `it` của `caQuaSo`: `it(tên, thân, trần?)` và `it.each(bảng)(tên, thân, trần?)`.
 * Ba dạng của `each` theo đúng cách suy kiểu của `it.each` gốc: bảng các mảng (suy
 * ra bộ), bảng các mảng chỉ đọc (`as const`), và bảng phần tử đơn (một đối số).
 */
export type ItQuaSo = ((ten: string, than: Than, han?: number) => void) & {
  each: {
    <T extends unknown[] | [unknown]>(bang: readonly T[]): CaEach<T>;
    <T extends readonly unknown[]>(bang: readonly T[]): CaEach<T>;
    <T>(bang: readonly T[]): CaEach<[T]>;
  };
};
