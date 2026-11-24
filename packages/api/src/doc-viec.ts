/**
 * **Đường kéo việc của agent** — SPEC mục 13 d.352:
 *
 * > "**Mô hình kéo việc** (không cần webhook): agent tự gọi "việc của tôi" hoặc
 * > "chờ việc". Có chế độ chờ dài tới 60 giây; có việc mới hoặc tín hiệu mới thì
 * > trả về ngay."
 *
 * và bảng lệnh mục 13: `baton tasks [--wait 60]` — "Liệt kê lượt giao `pending`
 * hoặc `in_progress` của mình; `--wait` thì chờ tới khi có".
 *
 * File này là **phần đọc** (thuần, không chờ): một lần gọi trả về đúng ba thứ mà
 * d.352 gọi là "việc mới hoặc tín hiệu mới":
 *
 *   1. `luot_giao` — lượt giao `pending`/`in_progress` **của mình** (mục 13).
 *   2. `cau_hoi`  — câu hỏi đang chờ **mình** trả lời, vì 19.6 nói thẳng "câu hỏi
 *      hiện trong `baton tasks` của người giao".
 *   3. `tin_hieu` — `STOP` của phiên còn mở của mình (mục 6 d.193; CLI thoát mã 3).
 *
 * Phần **chờ dài** nằm trong `WorkspaceGate` (`workspace-gate.ts`): cửa ghi là chỗ
 * duy nhất biết "vừa có lệnh ghi thành công" nên cũng là chỗ đánh thức.
 *
 * **Phạm vi không nới ở đây.** `agent_id` luôn lấy từ `AiGoi` đã xác thực, không
 * bao giờ từ query của client; mọi câu SQL ràng cả `workspace_id` (nếp đã chốt
 * trong `quyet-dinh.md`). Không có đối tượng nào nhận theo id, nên không có ca
 * "ngoài phạm vi" riêng của đường này.
 */

import { BatonError, type AiGoi, type AiGoiAgent } from '@baton/shared';
import { choHet } from './cho-het.js';
import { asksVuaXuLy, type MucCanChuRa } from './doc-can-chu.js';
import {
  cauHoiChoTraLoi,
  phienCuaAgent,
  type CauHoiChoTraLoi,
  type PhienRa,
} from './doc-phien.js';
import { COT_LUOT_GIAO, raLuotGiao, type DongLuotGiao, type LuotGiaoRa } from './doc-luot-giao.js';

/* ------------------------------------------------------------------ *
 * Trần thời gian chờ — SPEC mục 13 d.352 ("tới 60 giây")
 * ------------------------------------------------------------------ */

/** "Chờ dài **tới 60 giây**" — SPEC mục 13 d.352. */
export const CHO_DAI_TOI_DA_GIAY = 60;

/**
 * Đọc `?wait=<giây>` thành milliseconds.
 *
 * **`wait` lớn hơn 60 bị KẸP về 60**, không trả `INVALID_INPUT`. Lý do (ghi vào
 * `quyet-dinh.md`): 60 giây là một **trần tài nguyên của server** — mỗi lệnh chờ
 * giữ một request và một waiter trong DO — không phải một con số nghiệp vụ mà
 * agent phải đoán đúng. Agent gửi `--wait 300` nói rõ ý "chờ lâu nhất có thể";
 * kẹp phục vụ đúng ý đó, còn `INVALID_INPUT` thì bắt mọi CLI và MCP phải tự biết
 * trần của server trước khi gọi, và biến một lời xin lịch sự thành lỗi nghiệp vụ
 * (CLI thoát mã 1 — mục 13). Trần được trả lại trong `cho_toi_da_giay` nên client
 * **thấy** mình bị kẹp, không phải đoán.
 *
 * Còn lại giữ chặt, vì chúng là lỗi gõ chứ không phải lời xin:
 *   * `wait` âm, không phải số, có dấu → `INVALID_INPUT`.
 *   * thiếu `wait`, `wait=` rỗng, `wait=0` → **0 ms**, tức hành vi cũ (trả ngay).
 */
export function msChoDai(tho: string | undefined): number {
  if (tho === undefined) return 0;
  const chu = tho.trim();
  if (chu === '') return 0;

  // Chỉ chữ số: chặn `-1`, `1e3`, `abc`, `NaN`, ` 1.5`, `+1` cùng một chỗ.
  if (!/^\d+$/.test(chu)) {
    throw new BatonError('INVALID_INPUT', {
      message: `wait phải là số giây nguyên từ 0 tới ${CHO_DAI_TOI_DA_GIAY}.`,
    });
  }

  const giay = Number(chu);
  if (!Number.isSafeInteger(giay)) {
    throw new BatonError('INVALID_INPUT', {
      message: `wait phải là số giây nguyên từ 0 tới ${CHO_DAI_TOI_DA_GIAY}.`,
    });
  }
  return Math.min(giay, CHO_DAI_TOI_DA_GIAY) * 1000;
}

/* ------------------------------------------------------------------ *
 * Ai đang hỏi việc
 * ------------------------------------------------------------------ */

/**
 * Người kéo việc, dạng **đi qua dây** tới Durable Object.
 *
 * **Mang cả `AiGoi` của agent — đổi ở lượt 3a, có lý do.** Trước đó kiểu này chỉ
 * mang `agent_id`, vì ba nguồn việc đầu (lượt giao, câu hỏi, tín hiệu phiên) đều
 * có phạm vi hẹp hơn mọi ô của bảng quyền mục 3 ("người nhận là tôi", "người giao
 * là tôi"). Nguồn thứ tư — `resolved_asks` của mục 8 d.268 — **không** như vậy:
 * tầm nhìn của nó rẽ theo **vai** (19.12 câu 61, lớp "Chung") và theo `agent_project`,
 * nên `locPhamViCanChu` cần đúng `AiGoi`. Dựng lại một `AiGoi` bên trong DO từ
 * `agent_id` là một đường đọc quyền **thứ hai**, tức đúng thứ "một chỗ duy nhất"
 * của câu 61 cấm.
 *
 * `AiGoi` ở đây **luôn** là kết luận của middleware `xacThuc` từ danh tính đã xác
 * thực, không bao giờ từ thân request của client — và binding DO không ra Internet,
 * nên không có đường nào cho client đặt nó.
 *
 * Token thô thì **không bao giờ** đi qua dây — chỉ `token_bam`, để DO kiểm lại
 * token còn hiệu lực giữa lúc chờ (SPEC mục 15, `quyet-dinh.md` dòng 19).
 */
export type AiKeoViec =
  | { loai: 'chu' }
  | { loai: 'agent'; ai: AiGoiAgent; token_bam: string | null };

export function aiKeoViecTu(ai: AiGoi, token_bam: string | null): AiKeoViec {
  return ai.loai === 'chu' ? { loai: 'chu' } : { loai: 'agent', ai, token_bam };
}

/** `AiKeoViec` trở lại dạng `AiGoi` — cho các hàm luật nhận `AiGoi`. */
export function aiGoiCua(ai: AiKeoViec): AiGoi {
  return ai.loai === 'chu' ? { loai: 'chu' } : ai.ai;
}

/* ------------------------------------------------------------------ *
 * Lượt giao của mình — SPEC mục 13 `baton tasks`
 * ------------------------------------------------------------------ */

/**
 * Lượt giao `pending` hoặc `in_progress` **của mình** (người nhận là mình).
 *
 * Không cần ô bảng quyền nào: một lượt giao cho chính agent này là việc của nó,
 * và nó phải đọc được brief để làm. Phạm vi là `nguoi_nhan_agent_id = ?`, hẹp hơn
 * mọi ô phạm vi của mục 3.
 *
 * Lọc nằm trong tiền tố của `ix_luot_giao_nguoi_nhan` (migration 0004).
 */
export async function luotGiaoCuaToi(
  db: D1Database,
  workspace_id: string,
  agent_id: string,
  bay_gio: number,
): Promise<LuotGiaoRa[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COT_LUOT_GIAO} FROM luot_giao
        WHERE workspace_id = ? AND nguoi_nhan_agent_id = ?
          AND trang_thai IN ('pending', 'in_progress')
        ORDER BY tao_luc, id
        LIMIT 200`,
    )
    .bind(workspace_id, agent_id)
    .all<DongLuotGiao>();
  return results.map((d) => raLuotGiao(d, bay_gio));
}

/* ------------------------------------------------------------------ *
 * Phiên còn mở mà MÌNH là người giao — để biết chủ đề cần nghe
 * ------------------------------------------------------------------ */

/**
 * Id các phiên **còn mở** trên những lượt mà người gọi là **người giao**.
 *
 * Dùng để dựng chủ đề đánh thức `cau_hoi:<phiên>` — khoá mà `gui_hoat_dong` phát
 * khi agent gửi một mục `question` (xem `lenh-hoat-dong.ts`). Khoá đó mang id
 * **phiên**, không mang id người giao, nên người chờ phải tra ra danh sách phiên
 * của mình trước khi đăng ký nghe.
 */
export async function phienMoMinhGiao(
  db: D1Database,
  workspace_id: string,
  ai: AiKeoViec,
): Promise<string[]> {
  const dieu_kien =
    ai.loai === 'chu'
      ? "lg.nguoi_giao_loai = 'owner'"
      : "lg.nguoi_giao_loai = 'agent' AND lg.nguoi_giao_agent_id = ?";
  const tham_so = ai.loai === 'chu' ? [] : [ai.ai.agent_id];

  const { results } = await db
    .prepare(
      `SELECT p.id AS id
         FROM phien p
         JOIN luot_giao lg ON lg.id = p.luot_giao_id AND lg.workspace_id = p.workspace_id
        WHERE p.workspace_id = ? AND p.trang_thai <> 'closed' AND ${dieu_kien}
        LIMIT 200`,
    )
    .bind(workspace_id, ...tham_so)
    .all<{ id: string }>();
  return results.map((d) => d.id);
}

/* ------------------------------------------------------------------ *
 * Chủ đề đánh thức
 * ------------------------------------------------------------------ */

/**
 * Chủ đề mà một lệnh chờ dài của người này được nghe.
 *
 * **Chỉ của chính mình.** `luot:<agent_id>` lấy từ danh tính đã xác thực; không
 * có đường nào cho client tự khai chủ đề, nên không nghe trộm được việc của agent
 * khác. Chủ đề của workspace khác thì nằm trong một DO khác (`cuaGhiCua` dẫn id từ
 * `workspace_id`), nên cách biệt không phụ thuộc danh sách này.
 *
 * Hai nhóm:
 *   * `luot:<tôi>` — lượt giao mới cho tôi, nghiệm thu lượt của tôi, chủ bấm Dừng
 *     phiên của tôi, người giao trả lời câu hỏi của tôi (xem `danh_thuc` của các
 *     handler trong `lenh-luot-giao.ts`, `lenh-nop-nghiem-thu.ts`, `lenh-phien.ts`,
 *     `lenh-hoat-dong.ts`).
 *   * `cau_hoi:<phiên>` — agent tôi giao việc vừa gửi một mục `question` (19.6).
 *   * `agent:<tôi>` — **danh tính của tôi vừa đổi**: token bị thu hồi hoặc tạo lại,
 *     agent bị tắt (`lenh-agent.ts`). Không phải "việc mới", nhưng một lệnh chờ
 *     dài phải tỉnh để **kiểm lại token** rồi cắt — xem `choViec`, và
 *     `cau-hoi-spec.md` #51. Để nó ngủ tiếp thì một token đã thu hồi còn đọc được
 *     dữ liệu tới 60 giây nữa.
 *
 * Chủ (`chu`) chỉ nghe nhóm `cau_hoi:`: chủ không bao giờ là **người nhận** của
 * một lượt giao (SPEC mục 5), nên không có `luot:` nào của chủ, và danh tính chủ
 * không nằm trong bảng `agent`.
 *
 * **KHÔNG có chủ đề `can_chu` ở đây — xét ở lượt 3a và cố ý bỏ.** Ba lệnh xử lý
 * mục 8 phát một chủ đề `can_chu` toàn workspace (`lenh-xu-ly-can-chu.ts`), và
 * thêm nó vào danh sách này sẽ gọi dậy **mọi** `baton tasks --wait` của workspace
 * mỗi lần chủ bấm Gửi một mục bất kỳ. Lợi thu được là **không**: `resolved_asks`
 * cố ý **không** tính vào `co_viec` (xem dưới), nên waiter tỉnh, đọc lại, thấy
 * `co_viec === false` và treo tiếp — một lần đọc D1 bỏ đi cho mỗi waiter. Nửa
 * thật sự là việc của agent (phiên về `running` — d.281) đã có khoá riêng:
 * `chuDeDanhThuc` phát `luot:<agent>` và `phien:<id>` cho từng phiên vừa thả.
 */
export function chuDeKeoViec(ai: AiKeoViec, phien_minh_giao: readonly string[]): string[] {
  const chu_de = phien_minh_giao.map((id) => `cau_hoi:${id}`);
  if (ai.loai === 'agent') chu_de.push(`luot:${ai.ai.agent_id}`, `agent:${ai.ai.agent_id}`);
  return chu_de;
}

/* ------------------------------------------------------------------ *
 * "Việc của tôi"
 * ------------------------------------------------------------------ */

export interface ViecCuaToi {
  /** Lượt giao `pending`/`in_progress` của mình — SPEC mục 13. */
  luot_giao: LuotGiaoRa[];
  /** Câu hỏi đang chờ mình trả lời — SPEC 19.6. */
  cau_hoi: CauHoiChoTraLoi[];
  /** Tín hiệu cho lần gọi kế tiếp (`STOP`) — SPEC mục 6 d.193, mục 13. */
  tin_hieu: 'STOP'[];
  /** Phiên còn mở của chính mình — bối cảnh, **không** tính là "có việc". */
  phien: PhienRa[];
  /**
   * **Kết quả mục Cần Chủ mà agent chưa chắc đã thấy** — SPEC mục 8 d.268:
   * "Agent **không** đang chờ thì nhận kết quả ở lần gọi kế tiếp (`heartbeat`,
   * `tasks` hay bất kỳ lệnh nào), trong trường **`resolved_asks`**."
   *
   * Dẫn xuất, không trạng thái: mọi mục do chính agent này tạo đã rời `open`
   * trong một cửa sổ thời gian. Xem `asksVuaXuLy` và `cau-hoi-spec.md` #76.
   */
  resolved_asks: MucCanChuRa[];
  /**
   * Có việc hay tín hiệu nào không — đúng điều kiện "có việc mới hoặc tín hiệu
   * mới thì trả về ngay" của d.352. **Không** tính `phien`: một phiên mở tồn tại
   * suốt lúc agent đang làm, nên tính nó vào thì `--wait` không bao giờ chờ.
   *
   * **Cũng KHÔNG tính `resolved_asks`**, cùng một lý do và nó còn nặng hơn: một
   * mục đã xử lý nằm trong cửa sổ 24 giờ là trạng thái **tồn tại dai**, nên tính
   * nó vào thì `baton tasks --wait` của agent đó **không bao giờ chờ nữa** —
   * `--wait 60` trả về ngay lập tức, mãi mãi, và mô hình kéo việc của d.352 thành
   * một vòng lặp quay nóng. Có ca test khoá điều này.
   */
  co_viec: boolean;
}

export interface ViecCuaToiRa extends ViecCuaToi {
  /** Đã chờ hết hạn mà không có gì. **Không phải lỗi** — CLI thoát mã 0. */
  het_gio: boolean;
  /** Số ms đã chờ thực tế (0 khi không dùng `--wait`). */
  da_cho_ms: number;
  /** Trần chờ dài của server, giây — để client thấy mình có bị kẹp không. */
  cho_toi_da_giay: number;
}

/** Một lần đọc "việc của tôi". Thuần đọc, không chờ, không ghi gì. */
export async function viecCuaToi(
  db: D1Database,
  workspace_id: string,
  ai: AiKeoViec,
  bay_gio: number,
): Promise<ViecCuaToi> {
  /*
   * `choHet`, KHÔNG `Promise.all` (BAT-51): một câu hỏng (vd lỗi D1) thì vẫn chờ ba
   * câu còn lại xong rồi mới ném. Đường này chạy cả trong DO (`choViec`), nơi lỗi
   * ném ra kết thúc request ngay — `Promise.all` để các câu anh em còn đọc D1 sau đó.
   */
  const [luot_giao, cau_hoi, phien, resolved_asks] = await choHet([
    ai.loai === 'agent'
      ? luotGiaoCuaToi(db, workspace_id, ai.ai.agent_id, bay_gio)
      : Promise.resolve<LuotGiaoRa[]>([]),
    cauHoiChoTraLoi(
      db,
      workspace_id,
      ai.loai === 'chu' ? { loai: 'chu' } : { loai: 'agent', agent_id: ai.ai.agent_id },
      bay_gio,
    ),
    ai.loai === 'agent'
      ? phienCuaAgent(db, workspace_id, ai.ai.agent_id, bay_gio, true)
      : Promise.resolve<PhienRa[]>([]),
    // d.268 — `resolved_asks`. Chủ thì rỗng (`asksVuaXuLy` tự chặn).
    asksVuaXuLy(db, aiGoiCua(ai), workspace_id, bay_gio),
  ]);

  // Phiên **còn mở sau dẫn xuất**: một phiên `stopping` quá 10 phút đã tự đóng
  // (d.194) thì không còn tín hiệu nào để agent nhận.
  const phien_mo = phien.filter((p) => p.dang_mo);
  const tin_hieu = [...new Set(phien_mo.flatMap((p) => p.tin_hieu))];

  return {
    luot_giao,
    cau_hoi,
    tin_hieu,
    phien: phien_mo,
    resolved_asks,
    // `resolved_asks` **không** có trong phép này — xem `ViecCuaToi.co_viec`.
    co_viec: luot_giao.length > 0 || cau_hoi.length > 0 || tin_hieu.length > 0,
  };
}
