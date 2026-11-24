/**
 * **Cron của cảnh báo phiên đứng / lỗi** — SPEC mục 6 d.196, 19.12 câu 46.
 *
 * d.196: "Phiên chuyển sang `stalled` **hoặc** `error` thì bắn **1** thông báo (mục
 * 12). Phiên **hồi lại rồi đứng lần nữa** thì bắn **lại**."
 *
 * 19.12 câu 46 chốt **ai phát hiện** lần chuyển đó, vì `stalled` là trạng thái
 * **dẫn xuất, không ghi cơ sở dữ liệu** (câu 42) nên không có sự kiện nào để bắn:
 *
 *   * Cảnh báo được phát hiện bằng một **Cron Trigger quét mỗi 5 phút**, **không**
 *     dựa vào việc có ai mở Tổng quan.
 *   * Giữ một **mốc** "đã bắn cảnh báo cho tín hiệu nào" để chống bắn lặp — mốc,
 *     không cờ bật/tắt.
 *   * Mốc được ghi **qua cửa ghi** (Durable Object), như mọi lần ghi khác.
 *   * Thông báo **ghi vào kho thông báo trong app**; gửi Telegram thật là phần 7.
 *
 * ## Đường cũ đã bị bỏ, và đừng dựng lại
 *
 * Lượt 4 của phần 2 cài đường ngược lại: một lệnh `quet_canh_bao` (route
 * `POST /v1/phien/canh-bao/quet`) mà Tổng quan gọi khi mở. Chốt của chủ bỏ nó, nên
 * lệnh, route và ô quyền của nó **đã được gỡ** trong cùng lượt với file này — không
 * để lại hai đường ghi mốc. Một đường phụ thuộc người mở màn hình có hai lỗ mà cron
 * không có:
 *   * phiên đứng lúc 2 giờ sáng chỉ được báo khi chủ thức dậy và mở Tổng quan —
 *     tức đúng lúc chủ đã tự nhận ra, là thứ mục 6 tồn tại để tránh (d.178);
 *   * một lần mở Tổng quan **ghi dữ liệu**, nên một đường đọc có tác dụng phụ.
 *
 * ## Ba chặng, cùng nếp `cron-bang-chung.ts`
 *
 *   1. **Đọc (thẳng D1, không qua DO)** — `phienCanCanhBaoToanHe`. Một truy vấn cho
 *      **cả hệ**: một Cron Trigger không có workspace nào cho trước.
 *   2. **Quyết (hàm thuần)** — `canhBaoDung`, trong chặng đọc. Không gọi mạng lần
 *      nào ở file này: việc *gửi* là phần 7.
 *   3. **Ghi (trong DO của ĐÚNG workspace của từng dòng)** — `goiGhiMocCanhBao`,
 *      một lượt ghi ngắn (mốc + một dòng `thong_bao`, cùng một `batch`).
 *
 * Chặng 3 **kiểm lại luật lần hai** bên trong cửa ghi và **không** nhận kết luận mà
 * file này gửi vào — đó là thứ duy nhất làm được "đúng 1 tin" khi hai lượt cron
 * chồng nhau. Xem `WorkspaceGate.ghiMocCanhBao`.
 *
 * ## Trần số dòng mỗi lượt quét
 *
 * Câu lọc thô (`LOC_CAN_CANH_BAO` trong `doc-phien.ts`) để lọt **mọi phiên còn mở
 * chưa bắn cho tín hiệu hiện tại**, tức gần như mọi phiên đang chạy khoẻ mạnh — nó
 * không lọc được theo `stalled`, vì `stalled` không có trong cơ sở dữ liệu. Nên trần
 * ở đây không phải chuyện gọn gàng mà là điều kiện để lượt quét kết thúc được.
 *
 * Thứ tự là `ORDER BY tin_hieu_cuoi_luc, id` — **phiên im lâu nhất đi trước**, thứ
 * tự toàn phần. Hệ quả, khai thẳng: **hơn trần thì phần còn lại đợi lượt quét sau**,
 * và phần bị đẩy sang lượt sau là các phiên **mới có tín hiệu**, tức đúng những
 * phiên ít cần cảnh báo nhất. Không dòng nào bị bỏ lại mãi.
 */

import type { Env } from './moi-truong.js';
import { phienCanCanhBaoToanHe } from './doc-phien.js';
import { KENH_CHO_GUI, type TinCanhBaoPhien } from './thong-bao.js';
import { goiGhiMocCanhBao } from './workspace-gate.js';

/**
 * Nhịp **hiệu dụng** của việc này — 19.12 câu 46 "quét **mỗi 5 phút**".
 *
 * **Không còn là một Cron Trigger** (từ 10/10 `wrangler.toml` chỉ có `* * * * *` —
 * gói Free cho 5 cron mỗi tài khoản, lỗi 10072). Nhịp ấy nay là
 * `minute % GIAN_CANH_BAO_PHUT === 0` trong `viecCuaCron`, và chuỗi này ở lại vì nó
 * là cách gọn nhất để nói nhịp mà câu 46 chốt. Con số trong chuỗi phải khớp
 * `GIAN_CANH_BAO_PHUT` — có một ca test canh đúng điều đó.
 */
export const CRON_CANH_BAO = '*/5 * * * *';

/**
 * **Trần số dòng mỗi lượt quét.** 200, không 100 như `cron-bang-chung.ts`: ở đó một
 * dòng tốn tới 10 giây vì có chặng gọi mạng, còn ở đây một dòng chỉ là một lượt ghi
 * ngắn trong DO.
 *
 * Trần đếm **dòng thô** (`so_dong`), không đếm số lượt ghi: câu lọc thô để lọt gần
 * như mọi phiên đang mở của cả hệ, rồi `canhBaoDung` loại phần lớn ngay trong chặng
 * đọc — vòng lặp ghi của `quetCanhBaoPhien` chỉ chạy trên `can`, tức các dòng **đã
 * qua** luật. Nên trần ở đây canh **chi phí của câu đọc**, và nó vẫn phải có đúng vì
 * câu lọc thô ấy để lọt gần như mọi phiên đang mở.
 */
export const TRAN_PHIEN_MOI_LUOT = 200;

export interface KetQuaQuetCanhBao {
  /** Số dòng **thô** lượt quét này lấy ra (≤ `TRAN_PHIEN_MOI_LUOT`). */
  so_dong: number;
  /** Số phiên cửa ghi **thật sự** ghi mốc cho. */
  so_ghi: number;
  /** Số tin **vừa vào kho** ở lượt này — d.196 "bắn **1** thông báo". */
  so_tin: number;
  /** Các tin vừa dựng, để test và log đọc được đúng thứ đã bắn. */
  tin: TinCanhBaoPhien[];
  /** Kênh gửi của từng tin — `cho_cron` (xem `KENH_CHO_GUI`). */
  kenh: string[];
  /** Số dòng **ném lỗi và bị cô lập** — xem `moiDongMotLoi`. */
  so_loi: number;
  /** Lượt quét đầy trần → **còn dòng chờ lượt sau**. Trả ra để quan sát được. */
  day_tran: boolean;
}

export const QUET_CANH_BAO_RONG: KetQuaQuetCanhBao = {
  so_dong: 0,
  so_ghi: 0,
  so_tin: 0,
  tin: [],
  kenh: [],
  so_loi: 0,
  day_tran: false,
};

/**
 * **Cô lập lỗi theo DÒNG** — cùng lỗ và cùng hệ quả với `moiDongMotLoi` của
 * `cron-bang-chung.ts`, nên cùng cách chữa.
 *
 * Vì sao cần nó ở đây (đây là một lỗi chặn vĩnh viễn, không phải chuyện gọn gàng):
 * thứ tự quét là `ORDER BY tin_hieu_cuoi_luc, id`, tức phiên **im lâu nhất** luôn
 * đứng **đầu** danh sách — và nó cũng đúng là phiên dễ có dữ liệu hỏng nhất (một
 * dòng nhập tay của mục 16, một lỗi D1 của riêng dòng đó). Để lỗi ném ra khỏi
 * `quetCanhBaoPhien` thì **mọi** lượt quét sau đọc lại đúng danh sách ấy, gặp lại
 * đúng dòng ấy, lại đổ — và d.196 **không bao giờ** chạy cho mọi phiên xếp sau nó.
 *
 * Lỗi **không bị nuốt im lặng**: nó vào `console.error` và `so_loi` đi ra tới
 * `chayCronCanhBao`. Nhưng **chỉ con số** đi ra, không thông điệp lỗi nào, để nếu
 * về sau kết quả này vào một phản hồi HTTP thì chi tiết thô không rò theo (mục 15).
 */
async function moiDongMotLoi<R>(
  phien_id: string,
  dem: { so_loi: number },
  viec: () => Promise<R>,
): Promise<R | null> {
  try {
    return await viec();
  } catch (e) {
    dem.so_loi += 1;
    console.error(
      `Cron cảnh báo phiên: bỏ qua phiên ${phien_id} vì một lỗi của riêng dòng đó.`,
      e,
    );
    return null;
  }
}

/**
 * Một lượt quét: tìm các phiên vừa chuyển sang `stalled`/`error` và bắn **1** tin
 * cho mỗi lần chuyển — SPEC mục 6 d.196, 19.12 câu 46.
 *
 * Chạy **tuần tự** qua cửa ghi, không `Promise.all`: không có chặng gọi mạng nào ở
 * đây nên song song không mua được gì, mà cửa ghi của một workspace lại là một DO
 * đơn luồng — gửi 200 lượt ghi cùng lúc chỉ để chúng xếp hàng ở đầu kia. Tuần tự
 * cũng giữ thứ tự xác định cho test.
 */
export async function quetCanhBaoPhien(
  env: Env,
  bay_gio: number,
): Promise<KetQuaQuetCanhBao> {
  const { so_dong, can } = await phienCanCanhBaoToanHe(env.DB, bay_gio, TRAN_PHIEN_MOI_LUOT);
  if (so_dong === 0) return QUET_CANH_BAO_RONG;

  const dem = { so_loi: 0 };
  const tin: TinCanhBaoPhien[] = [];
  const kenh: string[] = [];
  let so_ghi = 0;

  for (const p of can) {
    const kq = await moiDongMotLoi(p.phien_id, dem, () =>
      // Cửa ghi của **đúng** workspace của dòng đó: cron quét toàn hệ, nên
      // `workspace_id` phải đi theo từng dòng, không lấy từ một biến chung nào.
      goiGhiMocCanhBao(env, { workspace_id: p.workspace_id, phien_id: p.phien_id }),
    );
    if (kq === null) continue;
    if (kq.da_ghi) so_ghi += 1;
    if (kq.tin !== null) {
      tin.push(kq.tin);
      /*
       * Tin đã **vào kho** trong cửa ghi. Chặng ra kênh ngoài **không** ở đây: nó
       * là lượt quét của `cron-thong-bao.ts`, đi theo mốc `gui_telegram_luc` —
       * xem `KENH_CHO_GUI`. Lượt quét này không gọi mạng lần nào, và đó là điều
       * kiện để nó quét được 200 phiên trong một nhịp.
       */
      kenh.push(kq.kenh ?? KENH_CHO_GUI);
    }
  }

  return {
    so_dong,
    so_ghi,
    so_tin: tin.length,
    tin,
    kenh,
    so_loi: dem.so_loi,
    day_tran: so_dong >= TRAN_PHIEN_MOI_LUOT,
  };
}

/**
 * Một lượt Cron của cảnh báo phiên.
 *
 * `chay` để `scheduled` chọn theo **mốc giờ của nhịp đang chạy** (`scheduledTime` —
 * xem `viecCuaCron` của `cron-bang-chung.ts`): việc này **chỉ** chạy ở nhịp có phút
 * chia hết 5, tức nhịp hiệu dụng vẫn đúng 5 phút như chữ chốt của câu 46, dù
 * `wrangler.toml` nay chỉ còn **một** dòng `crons`. Chạy nó ở mọi nhịp phút là quét
 * `phien` của cả hệ 5 lần nhiều hơn
 * chữ chốt của câu 46, không đổi lấy gì — mốc chống bắn lặp làm 4 lượt kia thành
 * những lượt không ghi gì.
 */
export async function chayCronCanhBao(
  env: Env,
  bay_gio: number,
  chay: boolean,
): Promise<KetQuaQuetCanhBao> {
  return chay ? quetCanhBaoPhien(env, bay_gio) : QUET_CANH_BAO_RONG;
}
