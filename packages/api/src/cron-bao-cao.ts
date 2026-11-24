/**
 * **Cron của báo cáo** — SPEC mục 11 d.322 ("tự sinh lúc **07:30**"), d.330 ("tự
 * sinh lúc **20:00**"), mục 12 d.346 ("Bắn khi: … Báo cáo sáng và tối"), 19.12
 * câu 60.
 *
 * ## Hai MỐC THỜI GIAN, không hai biểu thức cron — và cả hai là giờ UTC
 *
 * Từ 10/10, Baton chạy **đúng một** Cron Trigger `* * * * *` và phân nhánh trong
 * mã theo `controller.scheduledTime` (lý do: gói Workers Free cho **5 cron
 * trigger mỗi tài khoản**, lỗi 10072 lúc deploy 07/10 — xem `wrangler.toml`). Nên
 * hai nhịp báo cáo giờ là hai **phút trong ngày UTC**, không hai chuỗi cron:
 *
 *   * `PHUT_UTC_BAO_CAO_SANG` = 30   → 00:30 UTC = **07:30 UTC+7** (d.322)
 *   * `PHUT_UTC_BAO_CAO_TOI`  = 780  → 13:00 UTC = **20:00 UTC+7** (d.330)
 *
 * **Hai con số đó KHÔNG viết tay.** Chúng tính từ giờ-trên-tường của SPEC (07:30,
 * 20:00) trừ `MUI_GIO_CHU_PHUT` — `phutUtcCuaGioChu`. Và `CRON_BAO_CAO_SANG` /
 * `CRON_BAO_CAO_TOI` dựng lại **từ** chúng, nên hai chuỗi ấy không thể lệch khỏi
 * mốc mà `viecCuaCron` thật sự dùng.
 *
 * **CHỖ GHIM PHÉP ĐỔI MÚI GIỜ LÀ `test/cron-bang-chung.test.ts`**, ca "mỗi MỐC GIỜ
 * bật đúng việc của nó": nó gọi `viecCuaCron` tại `nhip(0, 30)` và `nhip(13, 0)` —
 * hai con số **UTC viết tay** — và đòi đúng nhánh báo cáo bật. Đổi
 * `MUI_GIO_CHU_PHUT` mà quên hai mốc này thì ca ấy **đỏ**.
 *
 * Đọc kỹ chỗ này, vì nó là một cái bẫy: `test/luat-bao-cao.test.ts` (ca d.322/d.330)
 * **không còn** ghim được phép đổi nữa. Nó lấy mốc **từ** `CRON_BAO_CAO_SANG` rồi
 * cộng lại `MUI_GIO_CHU_PHUT` để kiểm ra 07:30 — mà chuỗi ấy nay **dẫn xuất** từ
 * cùng hằng đó, nên phép kiểm thành một vòng kín: nó xanh với **mọi** giá trị múi
 * giờ. Ca đó vẫn đáng giữ (nó canh hai mốc **khác nhau** và canh chúng nằm ngoài giờ
 * yên lặng d.347), nhưng đừng trông vào nó để bắt một lần đổi múi giờ.
 *
 * Hai chuỗi `CRON_*` **không còn nằm trong `[triggers]`** — chúng ở lại vì chúng là
 * cách gọn nhất để nói "mốc nào" cho người đọc.
 *
 * ## Nhịp TRỄ và nhịp LẶP — `TRE_TOI_DA_PHUT`
 *
 * Cloudflare **không** bảo đảm một nhịp chạy đúng một lần đúng giờ. Hai hình lỗi,
 * hai cách chữa khác nhau:
 *
 *   * **Lặp** (nhịp 00:30 chạy hai lần): chữa bằng **khoá chính** của `bao_cao`
 *     (`INSERT … ON CONFLICT DO NOTHING` trong `WorkspaceGate.sinhBaoCao`), nên lượt
 *     thứ hai trả `da_ghi: false` và **không** là một lỗi.
 *   * **Trễ** (nhịp 00:30 **không** chạy, chỉ có 00:31): nếu nhánh báo cáo so phút
 *     **cứng** thì hôm đó chủ **không có báo cáo nào**. Nên nhánh này không so phút
 *     cứng mà mở một **cửa sổ** `[mốc, mốc + TRE_TOI_DA_PHUT]` và bên trong cửa sổ
 *     hỏi "**đã sinh báo cáo loại này cho ngày (giờ chủ) hôm nay chưa**".
 *
 * Phép hỏi ấy là một `SELECT` **rẻ** (`daCoBaoCao`, đi trọn khoá chính
 * `(workspace_id, ngay, loai)`) và nó chạy **trước** `duLieuBaoCao` — đó là cả điều
 * kiện để cửa sổ 60 phút không thành **60 lượt `tongQuan()` mỗi ngày**. (Lượt trước
 * khối này nói "chặn bằng một cuộc đọc `tongQuan()` mỗi phút là một cái giá không
 * ai mua". Vẫn đúng; giờ chúng ta **không** mua nó: một `SELECT` một dòng rẻ hơn
 * chừng ba bậc so với một lượt `tongQuan()`.)
 *
 * Khai thẳng giới hạn: mất nhịp **suốt cả cửa sổ** thì mất báo cáo hôm đó. Không có
 * hàng đợi bù, và v0.1 không cần một cái: 60 nhịp một phút liên tiếp cùng tắt là
 * một sự cố lớn hơn một báo cáo thiếu.
 *
 * "Ngày" ở đây là **ngày trên tường của chủ** (`ngayDiaPhuong`, tức qua
 * `MUI_GIO_CHU_PHUT`) — **không** ngày UTC. Dùng ngày UTC thì báo cáo sáng 07:30 giờ
 * chủ (00:30 UTC) thuộc đúng ngày, nhưng handoff tối 20:00 giờ chủ của ngày 06 là
 * 13:00 UTC ngày 06 — và một nhịp trễ sang 00:10 UTC ngày 07 sẽ ghi sang ngày khác.
 * `duLieuBaoCao` đã tính `ngay` theo giờ chủ; chỗ kiểm rẻ phải tính **đúng cùng
 * phép** đó, nếu không hai nơi hỏi hai ngày và cửa sổ trễ thành vô dụng.
 *
 * ## Ba chặng, không đường thứ hai
 *
 * Cùng hình với `cron-thong-bao.ts`:
 *   1. **Đọc (thẳng D1, không qua DO)** — `duLieuBaoCao` của `doc-bao-cao.ts`.
 *   2. **Dựng chữ (hàm thuần của `@baton/shared`)** — `dungBaoCaoMd`, `tinBaoCao`.
 *   3. **Ghi (trong DO)** — `goiSinhBaoCao`, **một** lượt ghi ngắn: một dòng
 *      `bao_cao` và một dòng `thong_bao` trong **cùng** `batch()`.
 *
 * Chặng 1 nặng (nó gọi `tongQuan()`), nên nó **không** nằm trong cửa ghi: một lượt
 * đọc năm khối bên trong `WorkspaceGate` giữ hàng đợi ghi của cả workspace suốt
 * thời gian đó — cùng ràng buộc mà `cron-bang-chung.ts` đã khai cho chặng gọi mạng.
 *
 * **File này KHÔNG gọi mạng.** Tin Telegram chỉ **vào kho**; đưa nó ra ngoài là
 * việc của nhịp mỗi phút (`quetGuiThongBao`) — xem `KENH_CHO_GUI` ở `thong-bao.ts`.
 * Nhờ vậy giờ yên lặng của d.347 áp cho tin báo cáo bằng **đúng một** bộ luật
 * (`quyetDinhGuiTin`), không một bản thứ hai ở đây.
 */

import {
  dungBaoCaoMd,
  ngayDiaPhuong,
  tinBaoCao,
  type LoaiBaoCao,
  type DuLieuBaoCao,
} from '@baton/shared';
import type { Env } from './moi-truong.js';
import { AI_CHU_CRON, duLieuBaoCao } from './doc-bao-cao.js';
import { locChuoiAnToan } from './loc-chuoi.js';
import { goiSinhBaoCao } from './workspace-gate.js';
import { phutUtcCuaGioChu, trongCuaSoTuMoc } from './moc-cron.js';
import { canhBaoSaoLuu } from './sao-luu.js';

/*
 * `phutUtcCuaGioChu` từng khai ở đây; BAT-8 dời nó sang `moc-cron.ts` (dùng chung với
 * sao lưu, tránh vòng nhập) và **xuất lại** để mọi chỗ đang nhập từ file này vẫn chạy.
 */
export { phutUtcCuaGioChu };

/** **Phút trong ngày UTC** của báo cáo sáng — 07:30 giờ chủ (d.322) ⇒ 30 = 00:30 UTC. */
export const PHUT_UTC_BAO_CAO_SANG = phutUtcCuaGioChu(7, 30);

/** **Phút trong ngày UTC** của handoff tối — 20:00 giờ chủ (d.330) ⇒ 780 = 13:00 UTC. */
export const PHUT_UTC_BAO_CAO_TOI = phutUtcCuaGioChu(20, 0);

/**
 * **Mốc của mỗi loại báo cáo** — sổ tra mà `trongCuaSoNhip` thật sự đọc, nên nó
 * không phải một bảng trang trí: thêm một loại báo cáo là thêm **một dòng** ở đây và
 * kiểu `LoaiBaoCao` buộc dòng ấy phải có.
 */
export const PHUT_UTC_CUA_BAO_CAO: Record<LoaiBaoCao, number> = {
  sang: PHUT_UTC_BAO_CAO_SANG,
  toi: PHUT_UTC_BAO_CAO_TOI,
};

/** Một phút trong ngày UTC thành biểu thức cron `phút giờ * * *`. */
function bieuThucCua(phut_ngay: number): string {
  return `${String(phut_ngay % 60)} ${String(Math.floor(phut_ngay / 60))} * * *`;
}

/**
 * **07:30 giờ chủ** = 00:30 UTC — d.322. Dựng **từ** `PHUT_UTC_BAO_CAO_SANG`, nên
 * nó không thể lệch khỏi mốc mà `viecCuaCron` dùng.
 *
 * **Không còn** nằm trong `[triggers]` của `wrangler.toml` (một cron duy nhất — xem
 * khối đầu file); nó ở lại để nói "mốc nào" và để ca test ghim múi giờ bám vào.
 */
export const CRON_BAO_CAO_SANG = bieuThucCua(PHUT_UTC_BAO_CAO_SANG);

/** **20:00 giờ chủ** = 13:00 UTC — d.330. Xem `CRON_BAO_CAO_SANG`. */
export const CRON_BAO_CAO_TOI = bieuThucCua(PHUT_UTC_BAO_CAO_TOI);

/*
 * (Từng có một `CRON_CUA_BAO_CAO: Record<LoaiBaoCao, string>` ở đây. **Đã bỏ**: từ
 * khi `[triggers]` chỉ còn một chuỗi, không mã nào tra biểu thức cron theo loại báo
 * cáo nữa, và một `Record` không ai đọc là một chỗ để lệch âm thầm về sau. Sổ tra
 * thật, có người đọc, là `PHUT_UTC_CUA_BAO_CAO` ở trên.)
 */

/**
 * **Trễ tối đa còn chấp nhận**, phút — xem khối "Nhịp TRỄ và nhịp LẶP" đầu file.
 *
 * 60: đủ dài để chịu một quãng nhịp đứt dài (Cloudflare có thể bỏ nhịp khi tài
 * khoản bị dồn tải), đủ ngắn để một báo cáo sáng **không** rơi ra giữa buổi làm —
 * một "báo cáo sáng" sinh lúc 09:00 giờ chủ đã mất phần lớn công dụng của d.322.
 * Quá cửa sổ thì **mất nhịp hôm đó**, khai thẳng.
 */
export const TRE_TOI_DA_PHUT = 60;

/**
 * Nhịp `moc_nhip` (epoch ms, chính `controller.scheduledTime`) có nằm trong **cửa
 * sổ** `[mốc, mốc + TRE_TOI_DA_PHUT]` của báo cáo loại `loai` không?
 *
 * Mốc tra qua `PHUT_UTC_CUA_BAO_CAO`, nên hàm này nhận **loại báo cáo** chứ không
 * một con số: một người gọi trao tay số phút là một chỗ để một mốc thứ hai sinh ra
 * cạnh sổ tra.
 *
 * Hai biên **đều tính**: biên dưới là nhịp đúng giờ (ca thường), biên trên là nhịp
 * trễ nhất còn được chấp nhận. Phép trừ quấn vòng theo ngày, nên một cửa sổ bắt qua
 * nửa đêm UTC vẫn đúng.
 */
export function trongCuaSoNhip(moc_nhip: number, loai: LoaiBaoCao): boolean {
  return trongCuaSoTuMoc(moc_nhip, PHUT_UTC_CUA_BAO_CAO[loai], TRE_TOI_DA_PHUT);
}

/**
 * Trần số workspace mỗi lượt. v0.1 có **một** workspace (mục 1), nên con số này là
 * một hàng rào chống chạy vô hạn, không một luật nghiệp vụ. Hơn trần thì phần còn
 * lại **mất nhịp hôm đó** — khai thẳng, và chịu được vì nhịp này mỗi ngày một lần
 * và trần gấp 100 lần số workspace thật.
 */
export const TRAN_WORKSPACE_MOI_LUOT = 100;

export interface KetQuaCronBaoCao {
  /** `null` = nhịp này không phải nhịp báo cáo nào. */
  loai: LoaiBaoCao | null;
  /** Số workspace lượt này xét (≤ trần). */
  so_workspace: number;
  /** Số báo cáo **thật sự vừa sinh** — đã có rồi thì không đếm (xem `sinhBaoCao`). */
  so_sinh: number;
  /** Số workspace bỏ qua vì ngày đó đã có báo cáo loại này. */
  so_da_co: number;
  /** Số workspace ném lỗi và bị cô lập — xem `moiWorkspaceMotLoi`. */
  so_loi: number;
  day_tran: boolean;
}

export const CRON_BAO_CAO_RONG: KetQuaCronBaoCao = {
  loai: null,
  so_workspace: 0,
  so_sinh: 0,
  so_da_co: 0,
  so_loi: 0,
  day_tran: false,
};

/**
 * Các workspace của cả hệ.
 *
 * Cron quét **toàn hệ**, nên `workspace_id` đi theo **từng dòng** — không lấy từ
 * một biến chung, và không có "workspace mặc định" nào. Cùng kỷ luật mà
 * `cron-thong-bao.ts` đã khai: một lượt cron đọc dòng của mọi chủ, nên lẫn
 * `workspace_id` ở đây là ghi dữ liệu của chủ này sang chủ khác (lệch mục 1, 18).
 */
export async function moiWorkspace(
  db: D1Database,
  tran = TRAN_WORKSPACE_MOI_LUOT,
): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT id FROM workspace ORDER BY id LIMIT ?')
    .bind(tran)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/**
 * **Cô lập lỗi theo WORKSPACE** — cùng lỗ, cùng hệ quả và cùng cách chữa với
 * `moiDongMotLoi` của `cron-thong-bao.ts`.
 *
 * Vì sao cần ở đây: một lượt báo cáo đọc rất nhiều bảng của một workspace, nên một
 * dòng dữ liệu lạ (mã trạng thái cũ từ bản nhập của mục 16, một `du_lieu_json` quá
 * dài) có thể ném. Để lỗi đó ra khỏi lượt quét thì **mọi** workspace xếp sau nó
 * không có báo cáo hôm đó — và nhịp này **mỗi ngày một lần**, nên "lượt sau thử
 * lại" là *mai*. Với một hệ mà việc của nó là báo cho chủ mỗi sáng, đó là một ngày
 * im lặng hoàn toàn.
 *
 * Chỉ **con số** đi ra, không thông điệp nào: chi tiết thô không được rò theo một
 * phản hồi nào (mục 15 d.417). Dòng log đi qua `locChuoiAnToan` — cùng lời khai
 * của `cron-thong-bao.ts`: đó là đường ra thứ ba, nên nó phải khoá bằng hai đường
 * kia.
 */
async function moiWorkspaceMotLoi<R>(
  workspace_id: string,
  dem: { so_loi: number },
  viec: () => Promise<R>,
): Promise<R | null> {
  try {
    return await viec();
  } catch (e) {
    dem.so_loi += 1;
    console.error(
      `Cron báo cáo: bỏ qua workspace ${workspace_id} vì một lỗi của riêng workspace đó.`,
      locChuoiAnToan(String(e)),
    );
    return null;
  }
}

/**
 * **Kiểm RẺ:** ngày (giờ chủ) đó đã có báo cáo loại này của workspace này chưa?
 *
 * Một `SELECT 1` đi trọn khoá chính `(workspace_id, ngay, loai)` của `bao_cao`
 * (0020) — không một lượt `tongQuan()` nào. Đây là chặng làm cửa sổ trễ 60 phút
 * chịu được: 59 nhịp sau nhịp đã sinh chỉ tốn một lần tra khoá chính mỗi workspace.
 *
 * Nó **không** thay khoá chính: hai lượt chạy chồng nhau đều thấy "chưa có" và cả
 * hai đi tiếp — cửa đóng thật vẫn là `INSERT … ON CONFLICT DO NOTHING` trong
 * `WorkspaceGate.sinhBaoCao`. Đây chỉ là một lớp **chặn sớm**, và nó phải được đọc
 * đúng như vậy.
 */
export async function daCoBaoCao(
  db: D1Database,
  workspace_id: string,
  ngay: string,
  loai: LoaiBaoCao,
): Promise<boolean> {
  const dong = await db
    .prepare('SELECT 1 AS co FROM bao_cao WHERE workspace_id = ? AND ngay = ? AND loai = ?')
    .bind(workspace_id, ngay, loai)
    .first<{ co: number }>();
  return dong !== null;
}

/**
 * Sinh **một** báo cáo cho **một** workspace — ba chặng của khối ghi chú đầu file.
 *
 * Trả `da_ghi: false` khi ngày đó đã có báo cáo loại này: đó là ca **bình thường**
 * của một nhịp Cron chạy hai lần, không một lỗi. Xem `WorkspaceGate.sinhBaoCao`.
 */
export async function sinhMotBaoCao(
  env: Env,
  workspace_id: string,
  loai: LoaiBaoCao,
  bay_gio: number,
): Promise<{ da_ghi: boolean; ngay: string; du_lieu: DuLieuBaoCao }> {
  // Chặng 1 — **đọc, ngoài cửa ghi**. Người đọc là **chủ** (báo cáo là của chủ).
  const du_lieu = await duLieuBaoCao(loai, env.DB, AI_CHU_CRON, workspace_id, bay_gio);
  /*
   * **Một dòng khi bản sao lưu gần nhất thiếu hoặc R2 lỗi** — SPEC mục 15 d.429 (BAT-8).
   * `canhBaoSaoLuu` **không bao giờ ném** (lỗi R2 thành chính dòng cảnh báo), nên
   * một R2 hỏng không làm mất báo cáo của ngày. `null` = không có gì phải báo, và
   * trường **không** được đặt — nên `du_lieu_json` của ngày bình thường không đổi hình.
   */
  const canh_bao_sao_luu = await canhBaoSaoLuu(env, bay_gio);
  if (canh_bao_sao_luu !== null) du_lieu.canh_bao_sao_luu = canh_bao_sao_luu;

  // Chặng 2 — **dựng chữ, hàm thuần**.
  const noi_dung_md = dungBaoCaoMd(loai, du_lieu);
  const noi_dung_tin = tinBaoCao(loai, du_lieu);

  // Chặng 3 — **ghi, trong cửa ghi của ĐÚNG workspace của dòng đó**.
  const ghi = await goiSinhBaoCao(env, {
    workspace_id,
    ngay: du_lieu.ngay,
    loai,
    noi_dung_md,
    du_lieu_json: JSON.stringify(du_lieu),
    noi_dung_tin,
  });

  return { da_ghi: ghi.da_ghi, ngay: du_lieu.ngay, du_lieu };
}

/**
 * Một lượt Cron của báo cáo.
 *
 * `viec` để `scheduled` chọn theo **mốc thời gian của nhịp** (`viecCuaCron`, sổ tra
 * duy nhất). Hai cửa sổ **không bao giờ** chồng nhau (00:30–01:30 và 13:00–14:00
 * UTC, cách nhau hơn 11 giờ), nên lượt này sinh tối đa **một** loại báo cáo; `loai`
 * trong kết quả nói loại nào.
 *
 * Trong cửa sổ, mỗi workspace đi qua **kiểm rẻ** `daCoBaoCao` trước: đã có thì đếm
 * vào `so_da_co` và **không** chạy chặng đọc nặng. Xem khối "Nhịp TRỄ và nhịp LẶP".
 *
 * Chạy **tuần tự** qua từng workspace, không `Promise.all`: mỗi workspace có một
 * lượt đọc nặng (`tongQuan()`) cộng một lượt ghi qua DO, và DO của mỗi workspace
 * là đơn luồng — song song chỉ để chúng xếp hàng ở đầu kia. Tuần tự cũng giữ thứ
 * tự xác định cho test.
 */
export async function chayCronBaoCao(
  env: Env,
  bay_gio: number,
  viec: { bao_cao_sang: boolean; bao_cao_toi: boolean },
): Promise<KetQuaCronBaoCao> {
  const loai: LoaiBaoCao | null = viec.bao_cao_sang
    ? 'sang'
    : viec.bao_cao_toi
      ? 'toi'
      : null;
  if (loai === null) return CRON_BAO_CAO_RONG;

  const ds = await moiWorkspace(env.DB);
  if (ds.length === 0) return { ...CRON_BAO_CAO_RONG, loai };

  const dem = { so_loi: 0 };
  let so_sinh = 0;
  let so_da_co = 0;

  /*
   * Ngày **trên tường của chủ** của lượt này — đúng phép mà `duLieuBaoCao` dùng cho
   * cột `ngay`. Tính **một lần** ngoài vòng lặp: mọi workspace của một lượt phải
   * thuộc cùng một ngày, nếu không một lượt chạy ngang nửa đêm ghi hai ngày khác
   * nhau cho hai workspace.
   */
  const ngay_cua_luot = ngayDiaPhuong(bay_gio);

  for (const workspace_id of ds) {
    const kq = await moiWorkspaceMotLoi(workspace_id, dem, async () => {
      // **Kiểm rẻ trước chặng đọc nặng** — xem `daCoBaoCao`. Trả `false` ở đây là
      // **không** một lỗi: đó là ca thường của mọi nhịp sau nhịp đã sinh.
      if (await daCoBaoCao(env.DB, workspace_id, ngay_cua_luot, loai)) return false;
      const ghi = await sinhMotBaoCao(env, workspace_id, loai, bay_gio);
      return ghi.da_ghi;
    });
    // `null` **chỉ** là ca lỗi đã bị cô lập (đã vào `dem.so_loi`); `false` là ca
    // "ngày đó đã có". Hai ca khác nhau nên hai giá trị khác nhau, không một `null`
    // mang hai nghĩa.
    if (kq === null) continue;
    if (kq) so_sinh += 1;
    else so_da_co += 1;
  }

  return {
    loai,
    so_workspace: ds.length,
    so_sinh,
    so_da_co,
    so_loi: dem.so_loi,
    day_tran: ds.length >= TRAN_WORKSPACE_MOI_LUOT,
  };
}
