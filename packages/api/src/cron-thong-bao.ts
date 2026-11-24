/**
 * **Cron của thông báo** — SPEC mục 12 (d.339–348), mục 8 d.283, 19.8 d.535,
 * 19.12 câu 6.
 *
 * Hai việc, **cùng** nhịp **mỗi phút** (xem `wrangler.toml`):
 *
 *   1. **Gửi các tin còn nợ kênh ngoài** (`quetGuiThongBao`). Nhịp một phút vì mốc
 *      nhỏ nhất của luật là **10 giây** (lần thử lại đầu, 19.12 câu 6) và cuối giờ
 *      yên lặng là một mốc **phút** (07:00) — nhịp 5 phút làm một tin 🔴 bị trượt
 *      lần đầu phải chờ tới 5 phút cho lần thử thứ hai, và làm hàng tin hoãn qua
 *      đêm đi muộn tới 5 phút.
 *   2. **Nhắc mục 🔴 chưa xử lý sau 2 giờ** (`quetNhacCanChuDo`) — mục 8 d.283.
 *      `wrangler.toml` đã dành sẵn nhịp này cho đúng việc đó từ phần trước.
 *
 * ## RÀNG BUỘC KIẾN TRÚC: chặng gọi mạng KHÔNG nằm trong cửa ghi
 *
 * Cùng ràng buộc (và cùng lời khai) của `cron-bang-chung.ts`: một `fetch` tới
 * Telegram trong `WorkspaceGate` giữ hàng đợi ghi của **cả workspace** suốt thời
 * gian chờ mạng, và một lượt quét đầy trần làm việc đó nhiều lần liền nhau. Nên ba
 * chặng, không đường thứ hai:
 *   1. **Đọc (thẳng D1, không qua DO)** — `tinCanGui`, `mucDoCanNhac`.
 *   2. **Gọi mạng (ở đây, trong Worker)** — `nguonTelegramCua(env)`.
 *   3. **Ghi kết luận (trong DO)** — `goiGhiMocGui`, `goiNhacCanChuDo`, hai lượt
 *      ghi ngắn, không `fetch` nào bên trong.
 * Chặng 3 **kiểm lại luật lần hai** bên trong cửa ghi và **không** nhận kết luận
 * mà file này gửi vào — xem `WorkspaceGate.ghiMocGui`.
 *
 * ## Thiếu secret ⇒ KHÔNG gửi và KHÔNG lỗi
 *
 * `nguonTelegramCua` trả `null` khi thiếu `TELEGRAM_BOT_TOKEN` hoặc
 * `TELEGRAM_CHAT_ID` (mục 12 d.339: "cấu hình phía server"). Lượt quét khi đó
 * **trả về ngay, không ghi một dòng nào**: tin vẫn nằm trong kho với
 * `gui_telegram_luc` NULL, `gui_so_lan_thu` vẫn 0 (ba lần thử **không** bị tiêu vì
 * một cấu hình thiếu), chuông trong app vẫn đủ, và không lệnh ghi nào bị chạm.
 * Chủ sắp deploy mà chưa chắc đã đặt secret, nên đây là hành vi **bắt buộc**.
 *
 * ## Trần số dòng mỗi lượt quét
 *
 * `TRAN_TIN_MOI_LUOT` dòng cho việc gửi (có chặng gọi mạng, nên trần nhỏ như
 * `cron-bang-chung.ts`) và `TRAN_NHAC_MOI_LUOT` cho việc nhắc (không gọi mạng, nên
 * trần lớn hơn, như `cron-canh-bao-phien.ts`). Hệ quả khai thẳng: **hơn trần thì
 * phần còn lại đợi lượt sau** — chịu được vì thứ tự quét là `ORDER BY tao_luc, id`
 * (**toàn phần**, cái cũ nhất đi trước) nên không dòng nào bị bỏ lại mãi, và hai
 * index là **riêng phần** nên tập ứng viên chỉ gồm dòng đang chờ.
 */

import {
  LOAI_TIN_GOP,
  NHAC_DO_SAU_MS,
  SO_LAN_GUI_TOI_DA,
  laUuTienTin,
  quyetDinhGuiTin,
  tinBiTat,
  type QuyetDinhGui,
  type UuTienTin,
} from '@baton/shared';
import type { Env } from './moi-truong.js';
import { linkCuaTin } from './thong-bao.js';
import { congTacDangTat } from './cai-dat-thong-bao.js';
import { locChuoiAnToan, nguonTelegramCua, type NguonTelegram } from './nguon-telegram.js';
import { goiGhiMocGui, goiNhacCanChuDo } from './workspace-gate.js';

/**
 * Nhịp của hai việc này — **mỗi phút**, tức chính nhịp của Cron Trigger duy nhất
 * (`CRON_THU_LAI`). Nên hai việc này chạy ở **mọi** lượt `scheduled`; xem
 * `viecCuaCron`.
 */
export const CRON_THONG_BAO = '* * * * *';

/** Trần tin mỗi lượt gửi. 50: mỗi dòng có một lần gọi mạng (tới 10 giây). */
export const TRAN_TIN_MOI_LUOT = 50;

/** Số lần gửi chạy song song — cùng lý lẽ `SO_SONG_SONG` của `cron-bang-chung.ts`. */
export const SO_SONG_SONG_GUI = 4;

/** Trần mục mỗi lượt nhắc. 200: không có chặng gọi mạng, chỉ một lượt ghi ngắn. */
export const TRAN_NHAC_MOI_LUOT = 200;

/* ================================================================== *
 * 1. Gửi các tin còn nợ kênh ngoài — mục 12
 * ================================================================== */

/** Một dòng `thong_bao` như lượt gửi cần. */
export interface DongTinCanGui {
  id: string;
  workspace_id: string;
  loai: string;
  uu_tien: UuTienTin;
  noi_dung: string;
  gui_telegram_luc: number | null;
  gui_so_lan_thu: number;
  gui_thu_lai_luc: number | null;
  can_chu_id: string | null;
  phien_id: string | null;
  /** Mã ticket dạng `SAI-12`, ghép trong câu đọc — d.347 dựng link từ đây. */
  ticket_ma: string | null;
  /** `thong_bao.bao_mat` (0026) — tin bảo mật tài khoản, không công tắc nào tắt được. */
  bao_mat: string | null;
}

/**
 * Các tin **chưa ra kênh ngoài và còn lượt thử**, cũ nhất trước.
 *
 * Câu này đi theo `ix_thong_bao_cho_gui` (index **riêng phần** của 0019): điều kiện
 * `gui_telegram_luc IS NULL AND gui_so_lan_thu < 4` khớp **đúng** mệnh đề `WHERE`
 * của index, nên tập ứng viên không bao giờ là cả bảng `thong_bao` — mà bảng ấy chỉ
 * lớn lên theo thời gian và gần như mọi dòng của nó là tin đã gửi.
 *
 * `LEFT JOIN` ticket + project để ghép **mã ticket** (`SAI-12`) ngay trong câu đọc:
 * d.347 đòi link thẳng tới ticket, và mã ticket là thứ đường `/t/:ma` của phần 6
 * nhận. Ghép ở đây chứ không một truy vấn thứ hai cho từng dòng (N+1 trong một lượt
 * cron).
 *
 * **Không** lọc mốc thử lại trong SQL: luật "chưa tới mốc thì hoãn" nằm ở hàm thuần
 * `quyetDinhGuiTin` cùng với giờ yên lặng và luật gộp — một chỗ, không hai. Trần
 * vẫn an toàn vì thứ tự sắp (`tao_luc, id`) không phụ thuộc điều kiện bị lọc sau:
 * tin cũ nhất luôn đi trước, nên không tin nào bị một tin mới hơn chen mãi.
 */
export async function tinCanGui(
  db: D1Database,
  tran = TRAN_TIN_MOI_LUOT,
): Promise<DongTinCanGui[]> {
  const { results } = await db
    .prepare(
      `SELECT tb.id AS id, tb.workspace_id AS workspace_id, tb.loai AS loai,
              tb.uu_tien AS uu_tien, tb.noi_dung AS noi_dung,
              tb.gui_telegram_luc AS gui_telegram_luc,
              tb.gui_so_lan_thu AS gui_so_lan_thu, tb.gui_thu_lai_luc AS gui_thu_lai_luc,
              tb.can_chu_id AS can_chu_id, tb.phien_id AS phien_id, tb.bao_mat AS bao_mat,
              CASE WHEN t.id IS NULL THEN NULL
                   ELSE pr.ma || '-' || CAST(t.so AS TEXT) END AS ticket_ma
         FROM thong_bao tb
         LEFT JOIN ticket t   ON t.id = tb.ticket_id AND t.workspace_id = tb.workspace_id
         LEFT JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
        WHERE tb.gui_telegram_luc IS NULL AND tb.gui_so_lan_thu < ${String(SO_LAN_GUI_TOI_DA)}
          AND tb.bo_qua_gui_luc IS NULL
        ORDER BY tb.tao_luc, tb.id
        LIMIT ${String(tran)}`,
    )
    .bind()
    .all<Omit<DongTinCanGui, 'uu_tien'> & { uu_tien: string }>();

  // `uu_tien` tới từ DB (một `CHECK` giữ nó), nhưng kiểu phải hẹp lại ở biên: một
  // giá trị lạ **không** được âm thầm thành `khan` và xuyên qua giờ yên lặng.
  return results.map((r) => ({ ...r, uu_tien: laUuTienTin(r.uu_tien) ? r.uu_tien : 'thuong' }));
}

/**
 * Mốc gửi của tin `ticket_xong` **gần nhất** trong một workspace — luật gộp 15 phút
 * của d.345. Đi theo `ix_thong_bao_gop_xong` (riêng phần, 0019).
 */
export async function mocTicketXongCuoi(
  db: D1Database,
  workspace_id: string,
): Promise<number | null> {
  const d = await db
    .prepare(
      `SELECT max(gui_telegram_luc) AS moc FROM thong_bao
        WHERE workspace_id = ? AND loai = '${LOAI_TIN_GOP}' AND gui_telegram_luc IS NOT NULL`,
    )
    .bind(workspace_id)
    .first<{ moc: number | null }>();
  return d?.moc ?? null;
}

export interface KetQuaQuetGui {
  /** Số dòng lượt quét này lấy ra (≤ trần). */
  so_dong: number;
  /** Số tin **thật sự** đã ra kênh ngoài ở lượt này. */
  so_gui: number;
  /** Số tin gửi **trượt** ở lượt này (đã ghi mốc thử lại). */
  so_truot: number;
  /** Số tin **hoãn** (giờ yên lặng, mốc thử lại, luật gộp 15 phút). */
  so_hoan: number;
  /** Số tin **không gửi nữa** (đã gửi rồi, hoặc hết 3 lần thử). */
  so_bo: number;
  /** Số tin **không gửi vì chủ tắt loại đó** (d.348, BAT-16) — vẫn ở trong chuông. */
  so_tat: number;
  /** Số dòng ném lỗi và bị cô lập — xem `moiDongMotLoi`. */
  so_loi: number;
  /** `true` = **chưa cấu hình Telegram**: không gửi, không lỗi, không ghi gì. */
  chua_cau_hinh: boolean;
  day_tran: boolean;
}

export const QUET_GUI_RONG: KetQuaQuetGui = {
  so_dong: 0,
  so_gui: 0,
  so_truot: 0,
  so_hoan: 0,
  so_bo: 0,
  so_tat: 0,
  so_loi: 0,
  chua_cau_hinh: false,
  day_tran: false,
};

/**
 * **Cô lập lỗi theo DÒNG** — cùng lỗ, cùng hệ quả và cùng cách chữa với
 * `moiDongMotLoi` của `cron-bang-chung.ts` và `cron-canh-bao-phien.ts`.
 *
 * Vì sao cần ở đây: thứ tự quét là `ORDER BY tao_luc, id`, tức tin **cũ nhất** luôn
 * nằm trong lô **đầu**, và nó cũng là tin dễ có dữ liệu lạ nhất. Để lỗi ném ra khỏi
 * lượt quét thì **mọi** lượt sau đọc lại đúng danh sách ấy, gặp lại đúng dòng ấy,
 * lại đổ — và mọi tin xếp sau nó **không bao giờ** được gửi. Với một hệ mà việc của
 * nó là báo việc gấp cho chủ, đó là một lỗi im lặng tuyệt đối.
 *
 * Lỗi vào `console.error` và `so_loi` đi ra để quan sát được; **chỉ con số** đi ra,
 * không thông điệp nào — chi tiết thô không được rò theo một phản hồi HTTP nào
 * (mục 15), và ở đây nó còn có thể mang chữ của Telegram.
 *
 * Chính dòng log cũng đi qua `locChuoiAnToan`, **không** in object `e` thô: log là
 * đường ra thứ ba, đứng cạnh DB (`gui_loi_ly_do`) và UI ("Cần chú ý"), nên nó phải
 * khoá bằng hai đường kia (mục 15 d.417). Hôm nay `guiTin` không có đường ném nào
 * mang token, nhưng đây là lời khai về **một** bản nguồn: một lượt sau thay kênh
 * bằng bản ném nguyên thân phản hồi của Telegram thì token đi thẳng vào log.
 */
async function moiDongMotLoi<R>(
  nhan: string,
  id: string,
  dem: { so_loi: number },
  viec: () => Promise<R>,
): Promise<R | null> {
  try {
    return await viec();
  } catch (e) {
    dem.so_loi += 1;
    console.error(
      `Cron thông báo (${nhan}): bỏ qua dòng ${id} vì một lỗi của riêng dòng đó.`,
      locChuoiAnToan(String(e)),
    );
    return null;
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

/**
 * Một lượt gửi — mục 12 d.345, d.347; 19.8 d.535; 19.12 câu 6.
 *
 * Luật thời điểm nằm **hết** ở `quyetDinhGuiTin` (hàm thuần của `@baton/shared`);
 * file này chỉ đọc, gọi mạng, và ghi.
 *
 * Luật gộp "Ticket Xong" cần `max(gui_telegram_luc)` của workspace, và nó **đổi
 * trong chính lượt này**: gửi một tin `ticket_xong` xong thì tin `ticket_xong` kế
 * tiếp phải đợi 15 phút. Nên mốc đó được giữ trong một `Map` theo workspace và
 * **cập nhật sau mỗi lần gửi thành công** — nếu không, một lượt quét có 5 tin
 * `ticket_xong` sẽ gửi cả 5, tức đúng cái d.345 cấm. Vì cùng lý do đó, các tin
 * `ticket_xong` đi **tuần tự**, không song song: hai lần gửi cùng lúc thì không
 * lần nào thấy mốc của lần kia.
 */
export async function quetGuiThongBao(env: Env, bay_gio: number): Promise<KetQuaQuetGui> {
  const kenh = nguonTelegramCua(env);
  // **Thiếu secret ⇒ không gửi, không lỗi, không ghi gì.** Xem đầu file.
  if (kenh === null) return { ...QUET_GUI_RONG, chua_cau_hinh: true };

  const ds = await tinCanGui(env.DB);
  if (ds.length === 0) return QUET_GUI_RONG;

  const dem = { so_loi: 0 };
  let so_gui = 0;
  let so_truot = 0;
  let so_hoan = 0;
  let so_bo = 0;
  let so_tat = 0;

  /*
   * Công tắc đang tắt, đọc **một lần mỗi workspace mỗi lượt** (BAT-16, d.348).
   * Cửa ghi đọc lại lần hai trước khi đặt mốc bỏ gửi — xem `ghiMocGui`.
   */
  const tat_cua = new Map<string, Set<string>>();
  const tatCua = async (workspace_id: string): Promise<Set<string>> => {
    let s = tat_cua.get(workspace_id);
    if (s === undefined) {
      s = await congTacDangTat(env.DB, workspace_id);
      tat_cua.set(workspace_id, s);
    }
    return s;
  };

  const moc_gop = new Map<string, number | null>();
  const mocGopCua = async (workspace_id: string): Promise<number | null> => {
    if (!moc_gop.has(workspace_id)) {
      moc_gop.set(workspace_id, await mocTicketXongCuoi(env.DB, workspace_id));
    }
    return moc_gop.get(workspace_id) ?? null;
  };

  const motTin = async (dong: DongTinCanGui): Promise<void> => {
    const quyet: QuyetDinhGui = quyetDinhGuiTin(dong, bay_gio, {
      moc_ticket_xong_cuoi: dong.loai === LOAI_TIN_GOP ? await mocGopCua(dong.workspace_id) : null,
      tat: tinBiTat(dong, await tatCua(dong.workspace_id)),
    });
    if (quyet.hanh_dong === 'tat') {
      // Không gọi mạng. Cửa ghi kiểm lại công tắc rồi đặt `bo_qua_gui_luc`.
      const ghi = await goiGhiMocGui(env, {
        workspace_id: dong.workspace_id,
        thong_bao_id: dong.id,
        ket_qua: { tat: true },
      });
      if (ghi.da_ghi) so_tat += 1;
      return;
    }
    if (quyet.hanh_dong === 'hoan') {
      so_hoan += 1;
      return;
    }
    if (quyet.hanh_dong === 'khong') {
      so_bo += 1;
      return;
    }

    // **Chặng gọi mạng, ở Worker.**
    const kq = await kenh.guiTin({
      noi_dung: dong.noi_dung,
      link: linkCuaTin(dong, env.BATON_URL_CONG_KHAI),
    });

    // **Chặng ghi, trong cửa ghi của ĐÚNG workspace của dòng đó**: cron quét toàn
    // hệ, nên `workspace_id` đi theo từng dòng, không lấy từ một biến chung.
    const ghi = await goiGhiMocGui(env, {
      workspace_id: dong.workspace_id,
      thong_bao_id: dong.id,
      ket_qua: 'da_gui' in kq ? { da_gui: true } : { da_gui: false, ly_do: kq.loi },
    });

    if ('da_gui' in kq) {
      if (ghi.da_ghi) {
        so_gui += 1;
        if (dong.loai === LOAI_TIN_GOP) moc_gop.set(dong.workspace_id, ghi.gui_luc);
      } else {
        // Cửa ghi nói tin đã có mốc rồi (hai lượt cron chồng nhau) — không đếm là
        // một tin mới gửi. Xem `WorkspaceGate.ghiMocGui`.
        so_bo += 1;
      }
      return;
    }
    so_truot += 1;
  };

  /*
   * Tin `ticket_xong` đi **tuần tự** (luật gộp cần thấy mốc của lần gửi trước);
   * các tin khác đi song song với trần `SO_SONG_SONG_GUI`.
   */
  const gop = ds.filter((d) => d.loai === LOAI_TIN_GOP);
  const khac = ds.filter((d) => d.loai !== LOAI_TIN_GOP);

  for (const dong of gop) {
    await moiDongMotLoi('gui:gop', dong.id, dem, () => motTin(dong));
  }
  await songSong(khac, SO_SONG_SONG_GUI, (dong) =>
    moiDongMotLoi('gui', dong.id, dem, () => motTin(dong)),
  );

  return {
    so_dong: ds.length,
    so_gui,
    so_truot,
    so_hoan,
    so_bo,
    so_tat,
    so_loi: dem.so_loi,
    chua_cau_hinh: false,
    day_tran: ds.length >= TRAN_TIN_MOI_LUOT,
  };
}

/* ================================================================== *
 * 2. Nhắc mục 🔴 chưa xử lý sau 2 giờ — mục 8 d.283, d.291
 * ================================================================== */

export interface DongMucDoCanNhac {
  id: string;
  workspace_id: string;
}

/**
 * Các mục **🔴 còn `Chờ`, chưa nhắc, đã quá 2 giờ** — mục 8 d.283.
 *
 * Câu này đi theo `ix_can_chu_nhac_do` (riêng phần theo cả ba điều kiện trạng
 * thái): một mục vừa được nhắc **rời** index ngay, nên lượt sau không thấy nó.
 * Điều kiện thời gian (`tao_luc <= bay_gio - 2 giờ`) khớp đúng cột dẫn đầu khoá
 * index, nên nó là một `SEARCH` chứ không một `SCAN`.
 *
 * `canNhacDo` (hàm thuần) chạy **lại** trên từng dòng trong cửa ghi; câu SQL này là
 * **lọc cho rẻ** — cùng nếp `LOC_CAN_CANH_BAO` / `canhBaoDung` của mục 6.
 */
export async function mucDoCanNhac(
  db: D1Database,
  bay_gio: number,
  nguong_ms: number,
  tran = TRAN_NHAC_MOI_LUOT,
): Promise<DongMucDoCanNhac[]> {
  const { results } = await db
    .prepare(
      `SELECT id, workspace_id FROM can_chu
        WHERE trang_thai = 'open' AND muc = 'urgent' AND nhac_do_luc IS NULL
          AND tao_luc <= ?
        ORDER BY tao_luc, id
        LIMIT ${String(tran)}`,
    )
    .bind(bay_gio - nguong_ms)
    .all<DongMucDoCanNhac>();
  return results;
}

export interface KetQuaQuetNhac {
  so_dong: number;
  /** Số lời nhắc **vừa vào kho** ở lượt này — d.283 "nhắc **1 lần**". */
  so_nhac: number;
  so_loi: number;
  day_tran: boolean;
}

export const QUET_NHAC_RONG: KetQuaQuetNhac = {
  so_dong: 0,
  so_nhac: 0,
  so_loi: 0,
  day_tran: false,
};

/**
 * Một lượt nhắc 🔴 — mục 8 d.283.
 *
 * Chạy **tuần tự** qua cửa ghi, không `Promise.all`: không có chặng gọi mạng nào
 * (lời nhắc chỉ **vào kho**; cron gửi đưa nó ra ngoài sau), mà cửa ghi của một
 * workspace là một DO đơn luồng — gửi 200 lượt ghi cùng lúc chỉ để chúng xếp hàng ở
 * đầu kia. Tuần tự cũng giữ thứ tự xác định cho test.
 *
 * `nguong_ms` là tham số để ca test ghim được **biên 2 giờ** bằng một con số thay
 * vì chờ thật; mặc định là `NHAC_DO_SAU_MS` của SPEC.
 */
export async function quetNhacCanChuDo(
  env: Env,
  bay_gio: number,
  nguong_ms: number = NHAC_DO_SAU_MS,
): Promise<KetQuaQuetNhac> {
  const ds = await mucDoCanNhac(env.DB, bay_gio, nguong_ms);
  if (ds.length === 0) return QUET_NHAC_RONG;

  const dem = { so_loi: 0 };
  let so_nhac = 0;

  for (const dong of ds) {
    const kq = await moiDongMotLoi('nhac', dong.id, dem, () =>
      goiNhacCanChuDo(env, { workspace_id: dong.workspace_id, can_chu_id: dong.id }),
    );
    if (kq !== null && kq.da_ghi) so_nhac += 1;
  }

  return {
    so_dong: ds.length,
    so_nhac,
    so_loi: dem.so_loi,
    day_tran: ds.length >= TRAN_NHAC_MOI_LUOT,
  };
}

/* ================================================================== *
 * 3. Một lượt Cron
 * ================================================================== */

export interface KetQuaCronThongBao {
  gui: KetQuaQuetGui;
  nhac: KetQuaQuetNhac;
}

export const CRON_THONG_BAO_RONG: KetQuaCronThongBao = {
  gui: QUET_GUI_RONG,
  nhac: QUET_NHAC_RONG,
};

/**
 * Một lượt Cron của thông báo.
 *
 * **Nhắc trước, gửi sau**, và thứ tự đó là có chủ ý: lời nhắc vừa vào kho được gửi
 * **ngay trong cùng lượt** thay vì chờ thêm một phút. Hai việc chạy **tuần tự**,
 * không `Promise.all`: việc gửi có chặng gọi mạng, nên trần song song của một lượt
 * quét phải là trần của cả lượt Cron.
 */
export async function chayCronThongBao(
  env: Env,
  bay_gio: number,
  viec: { thong_bao: boolean },
  nguong_nhac_ms: number = NHAC_DO_SAU_MS,
): Promise<KetQuaCronThongBao> {
  if (!viec.thong_bao) return CRON_THONG_BAO_RONG;
  const nhac = await quetNhacCanChuDo(env, bay_gio, nguong_nhac_ms);
  const gui = await quetGuiThongBao(env, bay_gio);
  return { gui, nhac };
}

/** Kiểu của kênh, xuất lại để test dựng nguồn giả mà không nạp thêm module. */
export type { NguonTelegram };
