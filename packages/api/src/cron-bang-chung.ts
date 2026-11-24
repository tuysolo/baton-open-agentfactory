/**
 * **Cron của bằng chứng** — SPEC mục 7 d.220, d.221; 19.7.
 *
 * Hai việc nền, hai nhịp khác nhau:
 *
 *   1. **Thử lại bằng chứng `pending` đến hạn** — d.220: "Lỗi mạng hoặc token
 *      GitHub có vấn đề thì trạng thái là `pending`, **tự thử lại sau 5 phút, tối
 *      đa 3 lần**, rồi thành `failed` với lý do." Nhịp: mỗi phút (xem
 *      `wrangler.toml`) — mốc thử lại là **5 phút**, nên nhịp một phút cho sai số
 *      tối đa một phút; nhịp 5 phút cho sai số tới 5 phút, tức một bằng chứng
 *      `pending` có thể phải chờ 10 phút cho lần thử thứ nhất.
 *
 *   2. **Kiểm lại commit `pushed`** — d.221: "Server kiểm lại các commit `pushed`
 *      **mỗi 10 phút trong 7 ngày**", và 19.7 cho cái quá 7 ngày: dừng theo dõi,
 *      nhãn "chưa merge sau 7 ngày", Telegram báo 1 lần. Nhịp: **mỗi 10 phút**,
 *      đúng chữ SPEC.
 *
 * ## RÀNG BUỘC KIẾN TRÚC: chặng gọi mạng KHÔNG nằm trong cửa ghi
 *
 * Đây là **cùng** ràng buộc của lượt 2, và ở Cron nó nặng hơn: một lần quét xử lý
 * tới 100 dòng, nên nếu `fetch` chạy trong `WorkspaceGate` thì hàng đợi ghi của cả
 * workspace đứng lại **100 lần gọi mạng** liền nhau, không phải một.
 *
 * Nên file này sống ở **tầng Worker** (`scheduled` trong `index.ts`) và đi đúng ba
 * chặng của lượt 2, không dựng đường thứ hai:
 *
 *   1. **Đọc (thẳng D1, không qua DO)** — lệnh đọc không bao giờ qua cửa ghi.
 *   2. **Gọi mạng (ở đây, trong Worker)** — `xacMinhTrongHan`, cùng hàm mà đường
 *      gửi bằng chứng dùng, cùng trần 10 giây của d.219.
 *   3. **Ghi kết luận (trong DO)** — `goiGhiXacMinh` / `goiDungTheoDoi`, hai lượt
 *      ghi ngắn, không có `fetch` nào bên trong.
 *
 * Có một ca test **đo** điều đó (`test/cron-bang-chung.test.ts`, "KIẾN TRÚC"), cùng
 * nếp ca của `gui-bang-chung.test.ts`: nguồn chậm + một lệnh ghi khác trên cùng
 * workspace, và lệnh kia phải không bị treo.
 *
 * ## Trần số dòng mỗi lượt quét, và hệ quả
 *
 * Mỗi lượt quét lấy tối đa `TRAN_DONG_MOI_LUOT` dòng (`LIMIT 100` — đúng câu mà
 * `test/bang-chung.test.ts` mục (b)/(c) đang canh với `EXPLAIN QUERY PLAN`). Hệ quả,
 * khai thẳng: **hơn trần thì phần còn lại đợi lượt quét sau.** Hai thứ làm hệ quả
 * đó chấp nhận được:
 *   * Thứ tự quét là `ORDER BY thu_lai_luc, id` (và `theo_doi_den_luc, id`), tức
 *     **cái đến hạn lâu nhất đi trước** — không có dòng nào bị bỏ lại mãi.
 *   * Hai index là **riêng phần**, nên tập ứng viên chỉ gồm các dòng đang chờ, chứ
 *     không phải cả bảng `evidence`.
 * Không có trần thì một lần quét có thể phải gọi mạng cho hàng nghìn dòng trong một
 * lần chạy `scheduled`, và nó bị runtime cắt giữa chừng — lúc đó **không** biết
 * được dòng nào đã xử lý.
 */

import {
  BatonError,
  SO_LAN_THU_TOI_DA,
  kiemBangChungCommit,
  kiemBangChungDeploy,
  type NoiDungBangChung,
} from '@baton/shared';
import type { Env } from './moi-truong.js';
import { trongCuaSoNhip } from './cron-bao-cao.js';
import { laNhipSaoLuu } from './sao-luu.js';
import { nguonXacMinhCua, xacMinhTrongHan } from './xac-minh-bang-chung.js';
import { goiDungTheoDoi, goiGhiXacMinh } from './workspace-gate.js';

/**
 * **Trần số dòng mỗi lượt quét.** 100 — cùng con số trong câu mà
 * `test/bang-chung.test.ts` mục (b) và (c) canh bằng `EXPLAIN QUERY PLAN`, nên đổi
 * nó ở đây mà không đổi ở đó là làm hai nơi nói hai số khác nhau.
 */
export const TRAN_DONG_MOI_LUOT = 100;

/**
 * **Số lần gọi mạng chạy song song** trong một lượt quét.
 *
 * Không phải 1 (một lượt 100 dòng × tới 10 giây = quá dài cho một lần `scheduled`),
 * cũng không phải 100 (100 lần `fetch` cùng lúc tới GitHub là một lần tự bắn
 * rate-limit, và SPEC d.223 nói rõ Baton không được cư xử như một con bot quét
 * repo). Sáu là mức giữ một lượt quét đầy trần trong khoảng một phút ở trường hợp
 * xấu nhất.
 */
export const SO_SONG_SONG = 6;

export interface DongCanQuet {
  id: string;
  workspace_id: string;
  ticket_id: string;
  loai: string;
  so_lan_thu: number;
  commit_hash: string | null;
  repo: string | null;
  url: string | null;
  ma_phien_ban: string | null;
  theo_doi_den_luc: number | null;
  /**
   * Lời khai "đã merge cục bộ" của người gửi (0 hoặc 1) — migration 0022 khối A.
   * Phải quét ra: lần thử lại của Cron dựng lại nội dung **từ DB**, nên bỏ cột
   * này thì một bằng chứng có lời khai sẽ mất lời khai ở đúng lần thử lại.
   */
  merged_cuc_bo: number;
}

const COT_QUET = `id, workspace_id, ticket_id, loai, so_lan_thu,
                  commit_hash, repo, url, ma_phien_ban, theo_doi_den_luc,
                  merged_cuc_bo`;

/* ------------------------------------------------------------------ *
 * Nội dung bằng chứng, dựng lại từ DB — và kiểm LẠI
 * ------------------------------------------------------------------ */

/**
 * Dựng `NoiDungBangChung` từ một dòng `evidence`, **đi qua lại hàm kiểm hợp lệ**.
 *
 * Vì sao kiểm lại một dòng đã nằm trong DB (nội dung bằng chứng là **bất biến** —
 * trigger `tg_evidence_noi_dung_bat_bien` của 0009): vì cửa ghi **không** là đường
 * duy nhất vào bảng này. Migration và nhập dữ liệu của mục 16 ghi thẳng, và một
 * dòng `deploy` với `url = 'https://169.254.169.254/'` vào bằng đường đó sẽ biến
 * Cron thành công cụ gọi vào máy chủ metadata (luật SSRF của d.207,
 * `cau-hoi-spec.md` #57). Đường gửi bằng chứng kiểm lúc gửi; Cron là đường **thứ
 * hai**, nên nó phải tự kiểm.
 *
 * `null` = không dựng được nội dung hợp lệ. Người gọi kết luận **`failed` kèm lý
 * do** cho ca đó, không thử lại: ba lần nữa cũng cùng kết quả.
 */
export function noiDungTuDong(dong: DongCanQuet): NoiDungBangChung | null {
  try {
    if (dong.loai === 'commit') {
      // Cột là 0/1 trong D1; `kiemBangChungCommit` chỉ nhận `true` tường minh là
      // một lời khai (hướng đóng — xem `@baton/shared/bang-chung.ts`).
      return kiemBangChungCommit(
        { ...dong, merged_cuc_bo: dong.merged_cuc_bo === 1 },
        dong.repo,
      );
    }
    if (dong.loai === 'deploy') return kiemBangChungDeploy(dong);
    return null;
  } catch (e) {
    if (BatonError.la(e)) return null;
    throw e;
  }
}

/** Chạy `viec` cho từng phần tử, tối đa `tran` việc cùng lúc. */
async function songSong<T, R>(
  ds: readonly T[],
  tran: number,
  viec: (x: T) => Promise<R>,
): Promise<R[]> {
  const ra: R[] = [];
  for (let i = 0; i < ds.length; i += tran) {
    ra.push(...(await Promise.all(ds.slice(i, i + tran).map(viec))));
  }
  return ra;
}

/** Bộ đếm lỗi của một lượt quét — xem `moiDongMotLoi`. */
interface DemLoi {
  so_loi: number;
}

/**
 * **Cô lập lỗi theo DÒNG.** Chạy `viec` cho một dòng; dòng đó ném thì ghi log, đếm
 * vào `dem.so_loi`, trả `null`, và **lượt quét đi tiếp**.
 *
 * Vì sao phải có lớp này (đây là một lỗi chặn vĩnh viễn, không phải chuyện gọn
 * gàng): `songSong` gom các dòng vào `Promise.all`, nên **một** dòng ném là **cả
 * lô** reject và `quetThuLai` / `quetTheoDoiPushed` ném ra ngoài — 99 dòng còn lại
 * của lượt đó không được xử lý. Mà thứ tự quét là `ORDER BY thu_lai_luc, id`, tức
 * dòng **đến hạn lâu nhất** luôn nằm trong lô **đầu tiên**: nếu chính nó là dòng
 * độc (ticket đã bị xoá nên `ticketBatBuoc` ném `NOT_FOUND`, một dòng nhập tay của
 * mục 16, hay một lỗi D1 riêng của dòng đó) thì **mọi** lượt quét sau đọc lại đúng
 * danh sách ấy, gặp lại đúng dòng ấy, lại đổ — và d.220 ("thử lại sau 5 phút, tối
 * đa 3 lần rồi `failed`") cùng d.221 **không bao giờ tiến** cho mọi bằng chứng xếp
 * sau nó.
 *
 * Lỗi **không bị nuốt im lặng**: nó vào `console.error` (cùng nếp với
 * `#chayMotLenh`) và `so_loi` đi ra tới `chayCronBangChung`, nên lượt sau quan sát
 * được. Nhưng **chỉ con số** đi ra: `KetQuaQuet` không mang thông điệp lỗi nào, để
 * nếu về sau kết quả này vào một phản hồi HTTP (mục 15) thì chi tiết thô không rò
 * theo.
 *
 * Dòng độc **không bị đánh dấu** gì — nó nằm lại đúng trạng thái cũ và lượt sau
 * gặp lại. SPEC không nói hành vi "đánh dấu một dòng mà server không xử lý được"
 * (`cau-hoi-spec.md` #63), nên không tự đoán: cô lập lỗi đã đủ để hết hình lỗi
 * chặn vĩnh viễn.
 */
async function moiDongMotLoi<R>(
  nhan: string,
  dong: { id: string },
  dem: DemLoi,
  viec: () => Promise<R>,
): Promise<R | null> {
  try {
    return await viec();
  } catch (e) {
    dem.so_loi += 1;
    console.error(
      `Cron bằng chứng (${nhan}): bỏ qua dòng evidence ${dong.id} vì một lỗi của riêng dòng đó.`,
      e,
    );
    return null;
  }
}

/* ================================================================== *
 * 1. Thử lại bằng chứng `pending` đến hạn — d.220
 * ================================================================== */

export interface KetQuaQuet {
  /** Số dòng lượt quét này lấy ra (≤ `TRAN_DONG_MOI_LUOT`). */
  so_dong: number;
  /** Số dòng cửa ghi **thật sự** ghi lên. */
  so_ghi: number;
  /** Số dòng chuyển sang `failed` ở lượt này (d.220 hết 3 lần). */
  so_failed: number;
  /** Số ticket **tự lên Xong** ở lượt này — d.221. */
  so_tu_len_xong: number;
  /**
   * Số dòng **ném lỗi và bị cô lập** ở lượt này — xem `moiDongMotLoi`. Trả ra để
   * quan sát được (một con số, không một thông điệp): một hệ luôn có `so_loi > 0`
   * là một hệ đang có dòng không xử lý được, và đó là việc của "Cần chú ý".
   */
  so_loi: number;
  /**
   * Lượt quét đầy trần → **còn dòng chờ lượt sau**. Trả ra để quan sát được, chứ
   * không im lặng: một hệ luôn đầy trần là một hệ đang tụt lại.
   */
  day_tran: boolean;
}

const QUET_RONG: KetQuaQuet = {
  so_dong: 0,
  so_ghi: 0,
  so_failed: 0,
  so_tu_len_xong: 0,
  so_loi: 0,
  day_tran: false,
};

/**
 * Quét các bằng chứng `pending` **đã đến hạn** thử lại và thử lại từng cái — d.220.
 *
 * Câu truy vấn đi theo `ix_evidence_thu_lai` (index **riêng phần** của 0009):
 * `xac_minh = 'pending' AND thu_lai_luc IS NOT NULL AND thu_lai_luc <= ?`, sắp theo
 * `thu_lai_luc, id`, `LIMIT 100`. `rut_luc IS NULL` là một điều kiện **lọc** thêm
 * (bằng chứng đã rút không được tính — d.222) và nó **không** làm mất index: có ca
 * test đo bằng `EXPLAIN QUERY PLAN` cho đúng câu này.
 */
export async function quetThuLai(env: Env, bay_gio: number): Promise<KetQuaQuet> {
  const { results } = await env.DB.prepare(
    `SELECT ${COT_QUET} FROM evidence
      WHERE xac_minh = 'pending' AND thu_lai_luc IS NOT NULL AND thu_lai_luc <= ?
        AND rut_luc IS NULL
      ORDER BY thu_lai_luc, id LIMIT ${String(TRAN_DONG_MOI_LUOT)}`,
  )
    .bind(bay_gio)
    .all<DongCanQuet>();

  if (results.length === 0) return QUET_RONG;

  const dem: DemLoi = { so_loi: 0 };

  const ra = await songSong(results, SO_SONG_SONG, (dong) =>
    moiDongMotLoi('thu_lai', dong, dem, async () => {
      const noi_dung = noiDungTuDong(dong);

      /*
       * Nội dung không hợp lệ (chỉ tới được bằng một đường ghi ngoài cửa ghi): kết
       * luận **`failed` dứt điểm**, và **không** gọi mạng lần nào. Đi qua chặng ghi
       * `thu_lai` với một `KetQuaXacMinh` đã là `failed` nên luật đếm lần thử của
       * d.220 không bị chạm tới.
       */
      if (noi_dung === null) {
        return goiGhiXacMinh(env, {
          workspace_id: dong.workspace_id,
          bang_chung_id: dong.id,
          nguon: 'thu_lai',
          ket_qua: {
            xac_minh: 'failed',
            ly_do:
              'Nội dung bằng chứng trong cơ sở dữ liệu không hợp lệ nên không xác minh được (SPEC mục 7 d.206, d.207).',
            ma_http: null,
            nguon_xac_minh: null,
          },
        });
      }

      // **Chặng gọi mạng, ở Worker.** Trần 10 giây của d.219 áp cho từng dòng.
      const kq = await xacMinhTrongHan(noi_dung, nguonXacMinhCua(env));

      return goiGhiXacMinh(env, {
        workspace_id: dong.workspace_id,
        bang_chung_id: dong.id,
        nguon: 'thu_lai',
        ket_qua: kq,
      });
    }),
  );

  return {
    so_dong: results.length,
    so_ghi: ra.filter((r) => r !== null && r.da_ghi).length,
    so_failed: ra.filter((r) => r !== null && r.da_ghi && r.xac_minh === 'failed').length,
    so_tu_len_xong: ra.filter((r) => r !== null && r.tu_len_xong).length,
    so_loi: dem.so_loi,
    day_tran: results.length >= TRAN_DONG_MOI_LUOT,
  };
}

/* ================================================================== *
 * 2. Kiểm lại commit `pushed`, và dừng theo dõi sau 7 ngày — d.221, 19.7
 * ================================================================== */

export interface KetQuaQuetTheoDoi extends KetQuaQuet {
  /** Số dòng **dừng theo dõi** vì quá 7 ngày — 19.7. */
  so_dung_theo_doi: number;
  /** Số tin "chưa merge sau 7 ngày" **vừa** dựng (không gửi — mục 12 là phần 7). */
  so_tin: number;
}

/**
 * Quét các commit `pushed` đang được theo dõi — d.221 + 19.7.
 *
 * **Một** truy vấn cho **hai** việc, đúng như ghi chú của index `ix_evidence_theo_doi`
 * trong 0009: lấy mọi dòng đang theo dõi theo thứ tự `theo_doi_den_luc`, rồi
 *   * mốc **đã quá** hiện tại → dừng theo dõi (19.7), **không gọi mạng**;
 *   * mốc **còn hạn** → gọi lại GitHub (d.221).
 *
 * Mốc quá hạn đi trước trong thứ tự sắp, nên khi đầy trần thì các dòng quá 7 ngày
 * được xử lý trước — đúng ưu tiên: cái đó cần một thông báo cho chủ, còn cái còn
 * hạn chỉ chậm thêm 10 phút.
 */
export async function quetTheoDoiPushed(
  env: Env,
  bay_gio: number,
): Promise<KetQuaQuetTheoDoi> {
  const { results } = await env.DB.prepare(
    `SELECT ${COT_QUET} FROM evidence
      WHERE xac_minh = 'pushed' AND theo_doi_den_luc IS NOT NULL
        AND rut_luc IS NULL
      ORDER BY theo_doi_den_luc, id LIMIT ${String(TRAN_DONG_MOI_LUOT)}`,
  )
    .bind()
    .all<DongCanQuet>();

  const rong: KetQuaQuetTheoDoi = { ...QUET_RONG, so_dung_theo_doi: 0, so_tin: 0 };
  if (results.length === 0) return rong;

  const qua_han = results.filter(
    (d) => d.theo_doi_den_luc !== null && d.theo_doi_den_luc <= bay_gio,
  );
  const con_han = results.filter(
    (d) => d.theo_doi_den_luc !== null && d.theo_doi_den_luc > bay_gio,
  );

  /*
   * Quá 7 ngày — 19.7. Không có chặng gọi mạng nào, nên chạy tuần tự qua cửa ghi là
   * đủ rẻ, và nó giữ thứ tự xác định cho test.
   */
  const dem: DemLoi = { so_loi: 0 };
  let so_dung_theo_doi = 0;
  let so_tin = 0;
  for (const dong of qua_han) {
    // Cô lập lỗi theo dòng ở **cả** nhánh này: cùng lỗ, cùng hệ quả (xem
    // `moiDongMotLoi`). Tuần tự nên một dòng ném không reject cả lô, nhưng nó vẫn
    // ném ra khỏi `quetTheoDoiPushed` và cắt mọi dòng xếp sau.
    const kq = await moiDongMotLoi('theo_doi:qua_han', dong, dem, () =>
      goiDungTheoDoi(env, { workspace_id: dong.workspace_id, bang_chung_id: dong.id }),
    );
    if (kq === null) continue;
    if (kq.da_ghi) so_dung_theo_doi += 1;
    if (kq.tin !== null) so_tin += 1;
  }

  // Còn hạn — d.221: gọi lại GitHub. Chặng gọi mạng ở Worker, như trên.
  const ra = await songSong(con_han, SO_SONG_SONG, (dong) =>
    moiDongMotLoi('theo_doi', dong, dem, async () => {
      const noi_dung = noiDungTuDong(dong);
      if (noi_dung === null) return null;
      const kq = await xacMinhTrongHan(noi_dung, nguonXacMinhCua(env));
      return goiGhiXacMinh(env, {
        workspace_id: dong.workspace_id,
        bang_chung_id: dong.id,
        nguon: 'theo_doi',
        ket_qua: kq,
      });
    }),
  );

  return {
    so_dong: results.length,
    so_ghi: ra.filter((r) => r !== null && r.da_ghi).length + so_dung_theo_doi,
    so_failed: ra.filter((r) => r !== null && r.da_ghi && r.xac_minh === 'failed').length,
    so_tu_len_xong: ra.filter((r) => r !== null && r.tu_len_xong).length,
    so_loi: dem.so_loi,
    day_tran: results.length >= TRAN_DONG_MOI_LUOT,
    so_dung_theo_doi,
    so_tin,
  };
}

/* ================================================================== *
 * 3. Một lượt Cron
 * ================================================================== */

export interface KetQuaCronBangChung {
  thu_lai: KetQuaQuet;
  theo_doi: KetQuaQuetTheoDoi;
}

/**
 * Biểu thức cron **của chính Worker** — từ 10/10 chỉ còn **một**, và nó là nhịp của
 * `thu_lai`. Giữ tên cũ vì nó là chuỗi trong `wrangler.toml` `[triggers]`.
 */
export const CRON_THU_LAI = '* * * * *';

/**
 * Nhịp **hiệu dụng** của việc theo dõi commit `pushed` — d.221 "mỗi 10 phút".
 *
 * **Không còn là một Cron Trigger.** Nó là `minute % GIAN_THEO_DOI_PHUT === 0` bên
 * trong nhịp một phút; chuỗi này ở lại để nói nhịp ấy bằng một hình người đọc quen.
 */
export const CRON_THEO_DOI = '*/10 * * * *';

/** Giãn cách việc theo dõi commit `pushed`, phút — d.221 "mỗi 10 phút". */
export const GIAN_THEO_DOI_PHUT = 10;

/**
 * Giãn cách việc cảnh báo phiên, phút — mục 6 d.196, và **chốt của chủ** 19.12 câu
 * 46: "quét **mỗi 5 phút**". Nhịp hiệu dụng không đổi khi gộp cron, chỉ đổi cách
 * kích: thay vì một Cron Trigger riêng mỗi 5 phút, nhịp một phút tự lọc theo phút.
 */
export const GIAN_CANH_BAO_PHUT = 5;

export interface ViecCuaCron {
  thu_lai: boolean;
  theo_doi: boolean;
  /** Cảnh báo phiên đứng / lỗi — mục 6 d.196, 19.12 câu 46. */
  canh_bao: boolean;
  /**
   * **Gửi thông báo ra kênh ngoài + nhắc 🔴 sau 2 giờ** — mục 12, mục 8 d.283.
   * Cùng nhịp **mỗi phút** với `thu_lai`, nên **mọi** nhịp chạy hai việc này. Hai
   * việc ấy không tranh nhau tài nguyên nào (một quét `evidence`, một quét
   * `thong_bao`), và chúng chạy **tuần tự** trong `chayCron`.
   */
  thong_bao: boolean;
  /**
   * **Sinh báo cáo sáng 07:30** — mục 11 d.322. Bật trong **cửa sổ** từ 00:30 UTC
   * tới 00:30 + `TRE_TOI_DA_PHUT`, và bên trong cửa sổ chặng sinh tự hỏi "hôm nay
   * đã có chưa" bằng một `SELECT` rẻ — xem `cron-bao-cao.ts`.
   */
  bao_cao_sang: boolean;
  /** **Sinh handoff tối 20:00** — mục 11 d.330, cửa sổ từ 13:00 UTC. Xem trên. */
  bao_cao_toi: boolean;
  /**
   * **Sao lưu tự động hằng ngày lên R2** — mục 15 d.429 (BAT-8). Cửa sổ từ 19:00 UTC
   * (= 02:00 giờ chủ) tới +`TRE_SAO_LUU_PHUT`; bên trong cửa sổ `head` R2 chặn ghi
   * lặp — xem `sao-luu.ts`.
   */
  sao_luu: boolean;
}

/**
 * Việc nào chạy ở một nhịp, theo **mốc thời gian** của nhịp (`scheduledTime`, epoch
 * ms, giờ **UTC** — Cloudflare không nhả nhịp theo múi giờ nào khác).
 *
 * ## Vì sao theo mốc thời gian, không theo `controller.cron`
 *
 * Gói **Workers Free cho 5 cron trigger mỗi TÀI KHOẢN** (không mỗi Worker). Ngày
 * 07/10 bản deploy bị từ chối — `code 10072` — vì tài khoản còn một Worker khác đang
 * dùng 2 nhịp, nên Baton không đặt nổi 5 nhịp của mình, và hai nhịp **báo cáo** là
 * hai nhịp không lên được: d.322/d.330 **không chạy** trên production. Nên cả năm
 * việc nền gộp về **đúng một** `* * * * *` và phân nhánh ở đây.
 *
 * ## Vẫn là MỘT sổ tra
 *
 * Không một bản thứ hai trong `cron-canh-bao-phien.ts` hay `cron-bao-cao.ts`: hai sổ
 * tra khác nhau là hai chỗ để một nhịp chạy hai việc (hoặc không việc nào) mà không
 * ai thấy. Hình dạng trả về **không đổi** (`ViecCuaCron`), nên mọi `chayCron*` nhận
 * đúng thứ chúng vẫn nhận.
 *
 * ## Nhịp hiệu dụng, không đổi so với năm cron cũ
 *
 *   * **mỗi phút** → `thu_lai` (d.220) + `thong_bao` (mục 12, mục 8 d.283)
 *   * **phút chia hết 5** → `canh_bao` (d.196; 19.12 câu 46 "quét mỗi 5 phút")
 *   * **phút chia hết 10** → `theo_doi` (d.221 "mỗi 10 phút trong 7 ngày")
 *   * **cửa sổ từ 00:30 UTC** → `bao_cao_sang` (= 07:30 giờ chủ, d.322)
 *   * **cửa sổ từ 13:00 UTC** → `bao_cao_toi` (= 20:00 giờ chủ, d.330)
 *   * **cửa sổ từ 19:00 UTC** → `sao_luu` (= 02:00 giờ chủ, mục 15 d.429 — BAT-8;
 *     **không** phải một nhịp cũ, nó là việc mới, thêm bằng một ô ở đây chứ không
 *     một cron mới)
 *
 * Phép chia lấy **phút trong giờ** là đủ cho hai nhịp 5 và 10 phút vì 60 chia hết cả
 * hai — mốc "phút chia hết 10" trong giờ **là** mốc trong ngày. Nếu một lượt sau
 * thêm một nhịp mà 60 không chia hết (vd 7 phút) thì phải đổi sang phút-trong-ngày,
 * và nó sẽ **vẫn** nhảy một bước ở mỗi đầu giờ: một nhịp theo phút không làm được
 * nhịp không chia hết 60 cho đẹp.
 */
export function viecCuaCron(moc_nhip: number): ViecCuaCron {
  const phut = new Date(moc_nhip).getUTCMinutes();
  return {
    thu_lai: true,
    theo_doi: phut % GIAN_THEO_DOI_PHUT === 0,
    canh_bao: phut % GIAN_CANH_BAO_PHUT === 0,
    thong_bao: true,
    bao_cao_sang: trongCuaSoNhip(moc_nhip, 'sang'),
    bao_cao_toi: trongCuaSoNhip(moc_nhip, 'toi'),
    sao_luu: laNhipSaoLuu(moc_nhip),
  };
}

/**
 * Một lượt Cron của bằng chứng.
 *
 * `viec` để `scheduled` chọn theo **mốc giờ của nhịp đang chạy** (`scheduledTime`,
 * xem `viecCuaCron` ngay trên): mọi nhịp phút đều thử lại (d.220), nhưng chỉ nhịp có
 * phút chia hết 10 kiểm lại commit `pushed` (d.221). Chạy việc
 * 10 phút ở mỗi phút là gọi GitHub **10 lần nhiều hơn chữ SPEC** cho mọi commit
 * `pushed` của cả hệ — và d.223 nói rõ Baton không được cư xử như một bot quét repo.
 *
 * Hai việc chạy **tuần tự**, không `Promise.all`: cả hai gọi mạng, nên trần song
 * song của một lượt quét phải là trần của cả lượt Cron.
 */
export async function chayCronBangChung(
  env: Env,
  bay_gio: number,
  viec: { thu_lai: boolean; theo_doi: boolean },
): Promise<KetQuaCronBangChung> {
  const thu_lai = viec.thu_lai ? await quetThuLai(env, bay_gio) : QUET_RONG;
  const theo_doi = viec.theo_doi
    ? await quetTheoDoiPushed(env, bay_gio)
    : { ...QUET_RONG, so_dung_theo_doi: 0, so_tin: 0 };
  return { thu_lai, theo_doi };
}

/** Trần 3 lần của d.220, xuất lại để test và log đọc cùng một con số. */
export { SO_LAN_THU_TOI_DA };
