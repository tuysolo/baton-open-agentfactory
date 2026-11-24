/**
 * **Màn hình Đội agent, trang agent, và chi tiết phiên** — SPEC mục 3 (d.80–105),
 * mục 6, mục 14 d.392 ("Đội agent") và d.402 ("Chi tiết phiên: dòng hoạt động, kế
 * hoạch, nút **Dừng**").
 *
 * | Vế SPEC | Trường của thân |
 * |---|---|
 * | d.80 "đội mình có ai" | `manHinhDoiAgent` → `agent[]` |
 * | d.80 "mỗi agent đang làm gì" | `trang_thai` + `phien_dang_mo` |
 * | d.80 "được phép làm gì" | `bang_quyen` (mục 3 d.84–96) |
 * | d.80 "lần cuối lên tiếng lúc nào" | `len_tieng_luc` (19.12 câu 23) |
 * | d.104 "phiên đang mở" | `phien_dang_mo` |
 * | d.104 "lịch sử lượt giao (dạng bảng)" | `luot_giao` |
 * | d.104 "tỉ lệ nộp lại đạt review" | `ti_le_dat_lan_dau` (19.5) |
 * | d.402 "dòng hoạt động, kế hoạch" | `manHinhPhien` → `hoat_dong`, `ke_hoach` |
 *
 * ## Token: KHÔNG có trường nào mang token
 *
 * Mục 15 d.417 nói token "**không bao giờ** trả ra API hay UI". Thân ở đây đi qua
 * `AgentRa` của `doc-du-an.ts`, nơi `COT_AGENT` cố ý **không** chọn `token_bam` —
 * và màn hình này **không** thêm cột nào. `token_bon_cuoi` (4 ký tự cuối) là thứ
 * mục 3 d.83 **đòi** hiện ("sau đó chỉ hiện 4 ký tự cuối"), nó không phải token và
 * không phải băm; ca test ghim rằng thân không có `token_bam` và không có chuỗi
 * token nào.
 *
 * ## `bay_gio` trong thân, bắt buộc — d.412
 *
 * Cùng nếp `manHinhTicket` / `manHinhCanChu` / `tongQuan`: mọi dẫn xuất phụ thuộc
 * thời gian của thân này (`stalled` của mục 6 d.184, `im_lang_ms`,
 * `khong_phan_hoi` của mục 5, cửa sổ 30 ngày của 19.5) được tính tại **một** mốc,
 * và giao diện đếm chữ tương đối từ đúng mốc đó.
 *
 * ## Không một dẫn xuất nào tính ở giao diện
 *
 * `trang_thai` của agent (mục 3 d.98–103, ánh xạ 7→5 của 19.12 câu 43),
 * `trang_thai` dẫn xuất của phiên (d.184, d.194), `dung`, `tin_hieu`,
 * `ti_le_dat_lan_dau`, `bang_quyen`, mọi `nhan_*` tiếng Việt (d.381): **đã tính**
 * ở đây.
 */

import {
  BatonError,
  PHAM_VI_QUYEN,
  VIEC_QUYEN,
  bangQuyenCuaAgent,
  nhan,
  type AiGoi,
  type PhamViQuyen,
  type TiLeDatLanDau,
  type ViecQuyen,
} from '@baton/shared';
import { layAgent, lietKeAgent, type AgentRa } from './doc-du-an.js';
import {
  hoatDongCuaPhien,
  keHoachCuaPhien,
  phienTheoId,
  raPhien,
  type HoatDongRa,
  type KeHoachRa,
  type PhienRa,
} from './doc-phien.js';
import { luotGiaoCuaAgent, type LuotGiaoCuaAgentRa } from './doc-luot-giao.js';
import { aiGoiCuaDongAgent, type DongAgent } from './xac-thuc.js';

/** Câu của cổng "chỉ chủ" — một chuỗi cho cả ba màn hình của lượt này. */
export const CAU_CHI_CHU_AGENT = 'Màn hình này chỉ dành cho chủ.';

function batBuocChu(ai: AiGoi): void {
  if (ai.loai !== 'chu') throw new BatonError('FORBIDDEN', { message: CAU_CHI_CHU_AGENT });
}

/* ------------------------------------------------------------------ *
 * Bảng quyền của một agent — mục 3 d.84–96
 * ------------------------------------------------------------------ */

/** Một hàng của bảng quyền trên trang agent: mã việc, nhãn, phạm vi, nhãn phạm vi. */
export interface HangQuyenRa {
  viec: ViecQuyen;
  nhan_viec: string;
  pham_vi: PhamViQuyen;
  nhan_pham_vi: string;
}

/**
 * Bảng quyền **hiện hành** của một agent, đủ 9 hàng của mục 3 d.86–96.
 *
 * Nhãn tiếng Việt lấy từ `VIEC_QUYEN` / `PHAM_VI_QUYEN` của `@baton/shared` —
 * nơi bảng SPEC đã được chép một lần và có test từng ô (`quyen.test.ts`). Giao
 * diện **không** gõ lại chín tên hàng: chép lần thứ hai là mở đường cho web nói
 * khác CLI về cùng một ô.
 */
export function bangQuyenRa(ai_agent: Parameters<typeof bangQuyenCuaAgent>[0]): HangQuyenRa[] {
  const bang = bangQuyenCuaAgent(ai_agent);
  return (Object.keys(VIEC_QUYEN) as ViecQuyen[]).map((viec) => ({
    viec,
    nhan_viec: VIEC_QUYEN[viec],
    pham_vi: bang[viec],
    nhan_pham_vi: PHAM_VI_QUYEN[bang[viec]],
  }));
}

/* ------------------------------------------------------------------ *
 * Đội agent — mục 14 d.392, mục 3 d.80
 * ------------------------------------------------------------------ */

export interface ManHinhDoiAgentRa {
  /** Mốc mà **mọi** dẫn xuất của thân này được tính tại — d.412. */
  bay_gio: number;
  agent: AgentRa[];
  cursor_sau: string | null;
}

export async function manHinhDoiAgent(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
  yeu_cau: { cursor?: string | undefined; limit?: string | undefined } = {},
): Promise<ManHinhDoiAgentRa> {
  batBuocChu(ai);
  const trang = await lietKeAgent(db, ai, workspace_id, yeu_cau, bay_gio);
  return { bay_gio, agent: trang.items, cursor_sau: trang.cursor_sau };
}

/* ------------------------------------------------------------------ *
 * Trang một agent — mục 3 d.104
 * ------------------------------------------------------------------ */

/** Một dự án agent được vào — đủ để vẽ link và tên, không chỉ một `id` trơ. */
export interface DuAnCuaAgentRa {
  id: string;
  ma: string;
  ten: string;
  /** Agent này là **agent quản lý** của dự án đó (mục 2). */
  quan_ly: boolean;
}

export interface ManHinhAgentRa {
  bay_gio: number;
  agent: AgentRa;
  /** d.80 "được phép làm gì" — 9 hàng của bảng quyền mục 3. */
  bang_quyen: HangQuyenRa[];
  /** d.104 "phiên đang mở". */
  phien_dang_mo: PhienRa[];
  /** d.104 "lịch sử lượt giao (dạng bảng)" — mới nhất trước. */
  luot_giao: LuotGiaoCuaAgentRa[];
  /** d.104 "tỉ lệ nộp lại đạt review" — định nghĩa chính xác ở 19.5. */
  ti_le_dat_lan_dau: TiLeDatLanDau;
  /** Cờ "tất cả dự án" bật thì danh sách này rỗng mà agent vẫn vào mọi dự án. */
  du_an: DuAnCuaAgentRa[];
}

/**
 * Trang agent — **một** lượt gọi cho cả bốn khối của d.104.
 *
 * Chỉ **chủ**: đây là giao diện web của chủ (mục 14). Agent đọc thông tin agent
 * bằng `GET /v1/agent/:id` (19.12 câu 24 chốt phạm vi của đường đó), nên cổng ở
 * đây **không** làm hẹp tầm nhìn của agent — nó chỉ không mở một đường thứ hai.
 *
 * Agent không có → `NOT_FOUND`, một câu duy nhất (d.386: 404 cũng dùng cho ngoài
 * phạm vi, để không lộ sự tồn tại).
 */
export async function manHinhAgent(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  agent_id: string,
  bay_gio: number,
): Promise<ManHinhAgentRa> {
  batBuocChu(ai);

  /*
   * `layAgent` của `doc-du-an.ts` đã trả **đúng ba** khối của d.104 (thông tin +
   * `phien_dang_mo` + `ti_le_dat_lan_dau`) và đã ném `NOT_FOUND` khi không có
   * agent. Màn hình chỉ thêm hai thứ nó chưa có: bảng quyền (d.80) và bảng lịch
   * sử lượt giao (d.104). Dựng lại ba khối kia ở đây là ba luật có hai bản.
   */
  const agent = await layAgent(db, ai, workspace_id, agent_id, bay_gio);

  /*
   * Bối cảnh quyền dựng bằng **đúng** hàm mà cổng xác thực dùng
   * (`aiGoiCuaDongAgent`), không một bản thứ hai: bảng quyền trên màn hình phải
   * là bảng **thật sự** áp cho agent đó, kể cả các ô chủ đã chỉnh riêng.
   */
  const dong: DongAgent = {
    id: agent.id,
    workspace_id,
    vai_tro: agent.vai_tro,
    disabled: agent.disabled ? 1 : 0,
    vao_tat_ca_du_an: agent.vao_tat_ca_du_an ? 1 : 0,
  };

  const [ai_agent, luot_giao, du_an] = await Promise.all([
    aiGoiCuaDongAgent(db, dong),
    luotGiaoCuaAgent(db, workspace_id, agent.id, bay_gio),
    duAnCuaAgent(db, workspace_id, agent.id),
  ]);

  return {
    bay_gio,
    agent,
    bang_quyen: bangQuyenRa(ai_agent),
    phien_dang_mo: agent.phien_dang_mo,
    luot_giao,
    ti_le_dat_lan_dau: agent.ti_le_dat_lan_dau,
    du_an,
  };
}

/** Dự án agent được vào, kèm cờ "mình quản lý" — một câu, không N+1. */
async function duAnCuaAgent(
  db: D1Database,
  workspace_id: string,
  agent_id: string,
): Promise<DuAnCuaAgentRa[]> {
  const { results } = await db
    .prepare(
      `SELECT pr.id AS id, pr.ma AS ma, pr.ten AS ten,
              (pr.quan_ly_agent_id = ?) AS quan_ly
         FROM agent_project ap
         JOIN project pr ON pr.id = ap.project_id AND pr.workspace_id = ap.workspace_id
        WHERE ap.workspace_id = ? AND ap.agent_id = ?
        ORDER BY pr.ten, pr.id`,
    )
    .bind(agent_id, workspace_id, agent_id)
    .all<{ id: string; ma: string; ten: string; quan_ly: number }>();
  return results.map((d) => ({ id: d.id, ma: d.ma, ten: d.ten, quan_ly: d.quan_ly === 1 }));
}

/* ------------------------------------------------------------------ *
 * Chi tiết phiên — mục 14 d.402
 * ------------------------------------------------------------------ */

export interface ManHinhPhienRa {
  bay_gio: number;
  phien: PhienRa;
  /** d.402 "dòng hoạt động" — cũ → mới, mục tạm thời đã bị thay chỗ thì ẩn (d.190). */
  hoat_dong: HoatDongRa[];
  /** d.402 "kế hoạch" — phiên bản hiện hành (d.191). */
  ke_hoach: KeHoachRa;
  /** Ticket và agent của phiên — để màn hình nói được phiên này **của việc nào**. */
  ticket: { id: string; ma: string; tieu_de: string; trang_thai: string; nhan_trang_thai: string };
  agent: { id: string; ten: string; vai_tro: string; nhan_vai_tro: string };
}

/**
 * Chi tiết một phiên — d.402, một lượt gọi cho cả ba vế của câu đó.
 *
 * Nút **Dừng** không có gì ở đây: nó là một lệnh **ghi**, và đường của nó đã có
 * từ phần 2 (`POST /v1/phien/:id/dung` → lệnh `dung_phien`, mục 6 d.193, 19.12
 * câu 44 "Dừng: chỉ chủ"). Giao diện gọi đúng đường đó; **không** có bản luật thứ
 * hai nào cho việc dừng.
 */
export async function manHinhPhien(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  phien_id: string,
  bay_gio: number,
): Promise<ManHinhPhienRa> {
  batBuocChu(ai);

  const d = await phienTheoId(db, workspace_id, phien_id);
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy phiên.' });

  const [hoat_dong, ke_hoach, boi_canh] = await Promise.all([
    hoatDongCuaPhien(db, workspace_id, d.id),
    keHoachCuaPhien(db, workspace_id, d.id),
    db
      .prepare(
        `SELECT pr.ma || '-' || t.so AS ticket_ma, t.tieu_de AS ticket_tieu_de,
                t.trang_thai AS ticket_trang_thai,
                a.ten AS agent_ten, a.vai_tro AS agent_vai_tro
           FROM ticket t
           JOIN project pr ON pr.id = t.project_id AND pr.workspace_id = t.workspace_id
           JOIN agent a ON a.id = ? AND a.workspace_id = t.workspace_id
          WHERE t.id = ? AND t.workspace_id = ?`,
      )
      .bind(d.agent_id, d.ticket_id, workspace_id)
      .first<{
        ticket_ma: string;
        ticket_tieu_de: string;
        ticket_trang_thai: string;
        agent_ten: string;
        agent_vai_tro: string;
      }>(),
  ]);

  if (boi_canh === null) {
    throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy phiên.' });
  }

  return {
    bay_gio,
    phien: raPhien(d, bay_gio),
    hoat_dong,
    ke_hoach,
    ticket: {
      id: d.ticket_id,
      ma: boi_canh.ticket_ma,
      tieu_de: boi_canh.ticket_tieu_de,
      trang_thai: boi_canh.ticket_trang_thai,
      nhan_trang_thai: nhan('trang_thai_ticket', boi_canh.ticket_trang_thai),
    },
    agent: {
      id: d.agent_id,
      ten: boi_canh.agent_ten,
      vai_tro: boi_canh.agent_vai_tro,
      nhan_vai_tro: nhan('vai_tro_agent', boi_canh.agent_vai_tro),
    },
  };
}
