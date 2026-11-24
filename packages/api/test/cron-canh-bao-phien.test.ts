/**
 * **Cron cảnh báo phiên đứng / lỗi** — SPEC mục 6 d.196, **19.12 câu 46** (chốt của
 * chủ), mục 12 d.339/d.342, migration 0012.
 *
 * d.196: "Phiên chuyển sang `stalled` **hoặc** `error` thì bắn **1** thông báo (mục
 * 12). Phiên **hồi lại rồi đứng lần nữa** thì bắn **lại**."
 *
 * 19.12 câu 46 chốt **ai phát hiện** lần chuyển đó (vì `stalled` là trạng thái dẫn
 * xuất, không ghi DB — câu 42):
 *   1. một **Cron Trigger quét mỗi 5 phút**, **không** dựa vào việc có ai mở Tổng quan;
 *   2. một **mốc** "đã bắn cho tín hiệu nào", **không** một cờ bật/tắt;
 *   3. mốc ghi **qua cửa ghi** (Durable Object);
 *   4. tin **vào kho thông báo trong app**; **gửi Telegram thật là phần 7**.
 *
 * ## Ba luật của chính file test này
 *
 * 1. **Không gọi mạng, một lần nào** — và ở đây là luật của chính mã sản phẩm, không
 *    riêng của test: đường cảnh báo của lượt này chỉ ghi vào bảng `thong_bao`.
 *    `guiThongBao` là chỗ cắm chưa cài (phần 7); danh sách cấm `CLAUDE.md`: không
 *    gửi Telegram/email thật tới ai. Test gọi **thẳng** handler `scheduled` qua
 *    `chayCron`; `wrangler` không được gọi, cron không được áp lên thật.
 * 2. **Mọi khẳng định "không bắn" có một ca ĐỐI CHỨNG ngay cạnh**: cùng dữ liệu, đổi
 *    đúng một thứ, rồi tin được bắn. Không có đối chứng thì một hàm luôn trả "không
 *    làm gì" cũng xanh — và đó đúng là hình dạng lỗi dễ nhất của một cron.
 * 3. **Đọc lại KHO, không chỉ con số trả ra.** `so_tin` là thứ mã tự khai; dòng
 *    `thong_bao` là thứ chủ thật sự đọc trong chuông (d.339). Mỗi ca "đã bắn" đều
 *    kiểm cả hai.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { NGUONG_DUNG_MAC_DINH_PHUT } from '@baton/shared';
import { chayCron } from '../src/index.js';
import {
  CRON_CANH_BAO,
  QUET_CANH_BAO_RONG,
  TRAN_PHIEN_MOI_LUOT,
  quetCanhBaoPhien,
  type KetQuaQuetCanhBao,
} from '../src/cron-canh-bao-phien.js';
import { GIAN_CANH_BAO_PHUT, viecCuaCron } from '../src/cron-bang-chung.js';
import { KENH_CHO_GUI } from '../src/thong-bao.js';
import { cauQuetCanhBaoToanHe, phienCanCanhBaoToanHe } from '../src/doc-phien.js';
import { SO_DANG_KY_HANDLER } from '../src/lenh.js';
import { WorkspaceGate } from '../src/workspace-gate.js';
import type { Env } from '../src/moi-truong.js';
import {
  TOKEN_CHU,
  WS,
  WS_KHAC,
  datMocPhien,
  dungAgent,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungTicketWorkspaceKhac,
  dungWorkspace,
  goiApi,
  phienTrongDb,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const TK = 'tk-pj-SAI-1';
const TK2 = 'tk-pj-SAI-2';
const TK3 = 'tk-pj-SAI-3';
const AG_WK = 'ag-wk';
const AG_MGR = 'ag-mgr';

const PHUT = 60_000;
/** Quá ngưỡng đứng mặc định (30 phút) — d.184 so sánh `>=`. */
const QUA_NGUONG_MS = (NGUONG_DUNG_MAC_DINH_PHUT + 1) * PHUT;

/* ------------------------------------------------------------------ *
 * Giúp việc
 * ------------------------------------------------------------------ */

/**
 * **Một lượt Cron cảnh báo** — nhịp 5 phút (`CRON_CANH_BAO`), đúng chốt của câu 46.
 *
 * Gọi qua `chayCron` (handler `scheduled` thật) chứ không gọi thẳng
 * `quetCanhBaoPhien`: chặng chọn việc theo biểu thức cron là một phần của luật, và
 * một ca gọi thẳng hàm quét sẽ xanh cả khi `scheduled` quên nối việc này vào.
 */
async function cronCanhBao(): Promise<KetQuaQuetCanhBao> {
  const kq = await chayCron({ scheduledTime: NHIP_CANH_BAO }, env);
  return kq.canh_bao;
}

/**
 * **Một `scheduledTime` rơi đúng phút `phut` của giờ `gio` UTC.**
 *
 * Từ 10/10 Worker có **một** cron `* * * * *` và chọn việc theo `scheduledTime`
 * (`viecCuaCron`), nên ca test nói **mốc nhịp**, không một chuỗi cron. Giờ 3 UTC
 * nằm ngoài cả hai cửa sổ báo cáo, nên các mốc dưới đây chỉ bật đúng việc đang xét.
 */
function nhip(gio: number, phut: number): number {
  return Date.UTC(2026, 9, 6, gio, phut);
}

/** Nhịp bật việc cảnh báo: phút chia hết `GIAN_CANH_BAO_PHUT` (19.12 câu 46). */
const NHIP_CANH_BAO = nhip(3, 5);

interface DongThongBao {
  id: string;
  workspace_id: string;
  loai: string;
  noi_dung: string;
  phien_id: string | null;
  ticket_id: string | null;
  agent_id: string | null;
  bang_chung_id: string | null;
  tao_luc: number;
  doc_luc: number | null;
  gui_telegram_luc: number | null;
}

/**
 * Mọi dòng trong **kho thông báo** (bảng `thong_bao`, 0012), cũ nhất trước.
 *
 * **Không ràng `workspace_id`**, và đó là chủ ý: ca "nhiều workspace trong một lượt
 * quét" phải thấy được cả hai tin để kiểm mỗi tin vào đúng workspace của phiên nó.
 */
async function khoThongBao(): Promise<DongThongBao[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, workspace_id, loai, noi_dung, phien_id, ticket_id, agent_id, bang_chung_id,
            tao_luc, doc_luc, gui_telegram_luc
       FROM thong_bao ORDER BY tao_luc, id`,
  ).all<DongThongBao>();
  return results;
}

/**
 * Một phiên trong **workspace của test** (`WS`), ở trạng thái lưu cho trước và với
 * tín hiệu cuối đặt tay.
 *
 * `tin_hieu_cuoi_luc` phải đặt **sau** khi chèn (`datMocPhien`): đường ghi thật chỉ
 * nhích tín hiệu tới "bây giờ", nên không có cách nào dựng một phiên đã im 31 phút
 * qua lệnh — xem ghi chú của `datMocPhien`.
 */
async function dungCanh(
  ticket_id: string,
  tuy_chon: {
    trang_thai?: 'running' | 'error' | 'closed';
    im_lang_ms?: number;
    error_luc?: number | null;
    canh_bao_tin_hieu_luc?: number | null;
  } = {},
): Promise<{ luot: string; phien: string; tin_hieu_cuoi_luc: number }> {
  const luot = `lg-${ticket_id}`;
  const phien = `ph-${ticket_id}`;
  await dungLuotGiao(luot, ticket_id, AG_WK, {
    trang_thai: 'in_progress',
    nguoi_giao_agent_id: AG_MGR,
  });
  await dungPhien(phien, luot, { trang_thai: tuy_chon.trang_thai ?? 'running' });

  const tin_hieu_cuoi_luc = Date.now() - (tuy_chon.im_lang_ms ?? QUA_NGUONG_MS);
  await datMocPhien(phien, {
    tin_hieu_cuoi_luc,
    ...(tuy_chon.error_luc === undefined ? {} : { error_luc: tuy_chon.error_luc }),
    ...(tuy_chon.canh_bao_tin_hieu_luc === undefined
      ? {}
      : { canh_bao_tin_hieu_luc: tuy_chon.canh_bao_tin_hieu_luc }),
  });
  return { luot, phien, tin_hieu_cuoi_luc };
}

/**
 * Một phiên `running` **đã im quá ngưỡng** trong **workspace KHÁC** (`WS_KHAC`).
 *
 * Viết bằng SQL thô vì mọi fixture của `giup.ts` ràng cứng `WS` — và một cron quét
 * **toàn hệ** chỉ kiểm chứng được khi có workspace thứ hai: không có nó thì "mỗi tin
 * vào đúng `workspace_id` của phiên nó" xanh cả khi mã lấy workspace từ một biến
 * chung.
 */
async function dungCanhWorkspaceKhac(): Promise<{ phien: string; ticket: string }> {
  const ticket = await dungTicketWorkspaceKhac();
  const t = Date.now();
  const agent = 'ag-khac';
  const luot = 'lg-khac';
  const phien = 'ph-khac';

  await env.DB.prepare(
    `INSERT INTO agent (id, workspace_id, ten, vai_tro, tao_luc, cap_nhat_luc)
     VALUES (?, ?, 'W-cua-nguoi-khac', 'worker', ?, ?)`,
  )
    .bind(agent, WS_KHAC, t, t)
    .run();

  await env.DB.prepare(
    `INSERT INTO luot_giao
       (id, workspace_id, ticket_id, so_luot, loai, nguoi_giao_loai, nguoi_nhan_agent_id,
        trang_thai, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, 1, 'work', 'owner', ?, 'in_progress', ?, ?)`,
  )
    .bind(luot, WS_KHAC, ticket, agent, t, t)
    .run();

  await env.DB.prepare(
    `INSERT INTO phien
       (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
        tin_hieu_cuoi_luc, mo_luc, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
  )
    .bind(phien, WS_KHAC, luot, ticket, agent, t - QUA_NGUONG_MS, t - QUA_NGUONG_MS, t)
    .run();

  return { phien, ticket };
}

/**
 * Một `Env` mà cửa ghi **ném lỗi cho đúng một phiên**, các phiên khác đi đường thật.
 *
 * Đây là cách duy nhất dựng được "một dòng độc" mà không bịa một trạng thái DB không
 * thể có: mọi khoá của `thong_bao` đều lấy **từ chính dòng phiên** (cùng workspace
 * theo trigger của 0006), nên không có dữ liệu nào làm chặng ghi đổ cho riêng một
 * dòng. Lỗi mô phỏng đúng thứ `moiDongMotLoi` sinh ra để chịu: một lỗi D1 / lỗi
 * chặng nội bộ của **riêng** dòng đó.
 *
 * Chỉ `idFromName` và `get` được dùng (xem `cuaGhiCua`), nên chỉ hai cái đó có thật.
 */
function envCuaGhiDocMotDong(phien_doc: string): Env {
  const thuc = (env as unknown as Env).WORKSPACE_GATE;
  const gia = {
    idFromName: (ten: string) => thuc.idFromName(ten),
    get: (id: DurableObjectId) => {
      const stub = thuc.get(id);
      return {
        ...stub,
        fetch: (input: RequestInfo, init?: RequestInit) => {
          const than = typeof init?.body === 'string' ? init.body : '';
          if (than.includes(phien_doc)) {
            return Promise.reject(new Error('lỗi giả của riêng dòng này'));
          }
          return stub.fetch(input, init);
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return { ...(env as unknown as Env), WORKSPACE_GATE: gia };
}

beforeEach(async () => {
  await dungWorkspace();
  await dungAgent(AG_MGR, 'M-Sample', 'manager');
  await dungAgent(AG_WK, 'W-builder', 'worker');
  await dungDuAn('SAI', 'Sample', 'active', AG_MGR);
  await dungTicket(P, 1, 'Việc đang làm', { trang_thai: 'in_progress' });
  await dungTicket(P, 2, 'Việc thứ hai', { trang_thai: 'in_progress' });
  await dungTicket(P, 3, 'Việc thứ ba', { trang_thai: 'in_progress' });
});

/* ================================================================== *
 * A. d.196 — bắn ĐÚNG 1 tin, và bắn LẠI khi đứng lần nữa
 * ================================================================== */

describe('SPEC mục 6 d.196 + 19.12 câu 46 — "bắn 1 thông báo", mốc chống bắn lặp', () => {
  it('phiên `stalled` → đúng 1 tin vào kho, và mốc được ghi qua cửa ghi', async () => {
    const { phien, tin_hieu_cuoi_luc } = await dungCanh(TK);

    const kq = await cronCanhBao();

    expect(kq.so_tin).toBe(1);
    expect(kq.so_ghi).toBe(1);
    expect(kq.so_loi).toBe(0);
    expect(kq.tin[0]?.phien_id).toBe(phien);
    expect(kq.tin[0]?.ly_do).toBe('stalled');

    const kho = await khoThongBao();
    expect(kho).toHaveLength(1);

    // Gạch đầu dòng 2+3 của câu 46: mốc **gắn với tín hiệu**, và ghi **qua cửa ghi**.
    const dong = await phienTrongDb(phien);
    expect(dong?.canh_bao_tin_hieu_luc).toBe(tin_hieu_cuoi_luc);
  });

  it('chạy cron LẦN HAI ngay sau đó → không bắn thêm tin nào', async () => {
    await dungCanh(TK);

    const mot = await cronCanhBao();
    const hai = await cronCanhBao();

    expect(mot.so_tin).toBe(1);
    // d.196 "bắn **1** thông báo" — lượt sau thấy mốc đã khớp tín hiệu nên không ghi.
    expect(hai.so_tin).toBe(0);
    expect(hai.so_ghi).toBe(0);
    /*
     * Và dòng đó **không còn lọt cả câu lọc thô** (`LOC_CAN_CANH_BAO`): mốc đã khớp
     * tín hiệu cuối. Tức lượt quét sau không phải đọc nó về rồi mới loại — đó là lý
     * do câu lọc ấy so mốc với tín hiệu ngay trong SQL thay vì lọc ở bộ nhớ.
     */
    expect(hai.so_dong).toBe(0);
    expect(await khoThongBao()).toHaveLength(1);
  });

  it('phiên HỒI LẠI rồi ĐỨNG LẦN NỮA → bắn lại (tin thứ hai)', async () => {
    const { phien } = await dungCanh(TK, { im_lang_ms: 90 * PHUT });
    await cronCanhBao();
    expect(await khoThongBao()).toHaveLength(1);

    /*
     * "Hồi lại" = một tín hiệu **mới** (nhịp tim, một mục dòng hoạt động); "đứng lần
     * nữa" = tín hiệu mới đó cũng đã quá ngưỡng. Đây là ca mà một **cờ** bật/tắt
     * không phân biệt được với "vẫn đang đứng từ lần trước" — chính lý do câu 46
     * chốt mốc chứ không cờ.
     */
    const tin_hieu_moi = Date.now() - 45 * PHUT;
    await datMocPhien(phien, { tin_hieu_cuoi_luc: tin_hieu_moi });

    const lai = await cronCanhBao();

    expect(lai.so_tin).toBe(1);
    const kho = await khoThongBao();
    expect(kho).toHaveLength(2);
    expect(kho.every((t) => t.phien_id === phien)).toBe(true);
    expect((await phienTrongDb(phien))?.canh_bao_tin_hieu_luc).toBe(tin_hieu_moi);
  });

  it('phiên `error` → bắn, và mốc gắn `error_luc` chứ không `tin_hieu_cuoi_luc`', async () => {
    /*
     * Hai mốc **lệch nhau** là điều kiện để ca này có nghĩa: `error` là trạng thái
     * ghi trong DB, nên một tín hiệu mới **không** đưa phiên ra khỏi `error` — gắn
     * mốc vào `tin_hieu_cuoi_luc` thì mỗi nhịp tim của một agent đang lỗi lại là
     * một lần bắn mới. Xem `mocLanChuyenSang` trong `shared/src/phien.ts`.
     */
    const error_luc = Date.now() - 20 * PHUT;
    const { phien, tin_hieu_cuoi_luc } = await dungCanh(TK, {
      trang_thai: 'error',
      im_lang_ms: 2 * PHUT,
      error_luc,
    });

    const kq = await cronCanhBao();

    expect(kq.so_tin).toBe(1);
    expect(kq.tin[0]?.ly_do).toBe('error');

    const dong = await phienTrongDb(phien);
    expect(dong?.canh_bao_tin_hieu_luc).toBe(error_luc);
    expect(dong?.canh_bao_tin_hieu_luc).not.toBe(tin_hieu_cuoi_luc);

    // Và một nhịp tim sau đó **không** mở ra một lần bắn thứ hai.
    await datMocPhien(phien, { tin_hieu_cuoi_luc: Date.now() });
    expect((await cronCanhBao()).so_tin).toBe(0);
    expect(await khoThongBao()).toHaveLength(1);
  });

  it('phiên đã `closed` → không bắn gì', async () => {
    await dungCanh(TK, { trang_thai: 'closed' });

    const kq = await cronCanhBao();

    expect(kq.so_tin).toBe(0);
    expect(kq.so_ghi).toBe(0);
    // Phiên đóng còn bị **câu lọc thô loại hẳn** (`ix_phien_canh_bao` riêng phần).
    expect(kq.so_dong).toBe(0);
    expect(await khoThongBao()).toHaveLength(0);
  });

  it('ĐỐI CHỨNG: cùng phiên đó còn mở và im quá ngưỡng → bắn', async () => {
    await dungCanh(TK, { trang_thai: 'running' });

    expect((await cronCanhBao()).so_tin).toBe(1);
  });

  it('phiên `running` còn tín hiệu trong ngưỡng → không bắn (d.182/d.184 hai mặt một luật)', async () => {
    await dungCanh(TK, { im_lang_ms: 5 * PHUT });

    const kq = await cronCanhBao();

    // Dòng **lọt câu lọc thô** rồi bị `canhBaoDung` loại — đúng chỗ luật phải nằm.
    expect(kq.so_dong).toBe(1);
    expect(kq.so_tin).toBe(0);
    expect(await khoThongBao()).toHaveLength(0);
  });
});

/* ================================================================== *
 * B. Kho thông báo trong app — 19.12 câu 46 gạch 4, mục 12 d.339
 * ================================================================== */

describe('19.12 câu 46 — "tin ghi vào kho thông báo trong app; Telegram là phần 7"', () => {
  it('tin nằm trong kho với `loai` = `phien_dung`, nội dung tiếng Việt và khoá đúng', async () => {
    const { phien } = await dungCanh(TK);

    await cronCanhBao();

    const kho = await khoThongBao();
    expect(kho).toHaveLength(1);
    const tin = kho[0]!;

    expect(tin.loai).toBe('phien_dung');
    expect(tin.workspace_id).toBe(WS);
    expect(tin.phien_id).toBe(phien);
    expect(tin.ticket_id).toBe(TK);
    expect(tin.agent_id).toBe(AG_WK);
    // Tin cảnh báo phiên không gắn bằng chứng nào.
    expect(tin.bang_chung_id).toBeNull();

    // Mục 0.1: nhãn hiển thị là **tiếng Việt**, và nội dung lưu là chữ đã dựng xong.
    // BAT-7: tên agent + mã ticket, không UUID.
    expect(tin.noi_dung).toBe('W-builder · SAI-1: phiên đứng');
    expect(tin.noi_dung).not.toContain(AG_WK);
    expect(tin.noi_dung).not.toContain(TK);

    // Chưa đọc, và **chưa ra kênh ngoài**: phần 7 mới ghi `gui_telegram_luc`.
    expect(tin.doc_luc).toBeNull();
    expect(tin.gui_telegram_luc).toBeNull();
  });

  it('phiên `error` → `loai` = `phien_loi`, không gộp vào `phien_dung` (19.12 câu 42)', async () => {
    await dungCanh(TK, {
      trang_thai: 'error',
      im_lang_ms: PHUT,
      error_luc: Date.now() - 10 * PHUT,
    });

    await cronCanhBao();

    const kho = await khoThongBao();
    expect(kho).toHaveLength(1);
    expect(kho[0]?.loai).toBe('phien_loi');
    expect(kho[0]?.noi_dung).toBe('W-builder · SAI-1: phiên lỗi');
  });

  it('kênh gửi ra ngoài là `cho_cron` — lượt quét này KHÔNG ra mạng lần nào', async () => {
    await dungCanh(TK);

    const kq = await cronCanhBao();

    /*
     * Phần 7 đổi hình của chặng hai: tin vào kho ở đây, và **một lượt quét riêng**
     * (`cron-thong-bao.ts`, nhịp mỗi phút) đưa nó ra kênh ngoài theo luật thời
     * điểm của mục 12. Lượt quét cảnh báo này vẫn **không gọi mạng lần nào** — đó
     * là điều kiện để nó quét 200 phiên trong một nhịp.
     */
    expect(kq.kenh).toEqual([KENH_CHO_GUI]);
  });
});

/* ================================================================== *
 * C. Một lượt quét đi qua NHIỀU workspace
 * ================================================================== */

describe('19.12 câu 46 — cron quét TOÀN HỆ, mỗi tin vào đúng workspace của phiên nó', () => {
  it('hai workspace trong một lượt quét → hai tin, mỗi tin đúng `workspace_id`', async () => {
    const { phien: phien_ta } = await dungCanh(TK);
    const { phien: phien_khac, ticket: tk_khac } = await dungCanhWorkspaceKhac();

    const kq = await cronCanhBao();

    expect(kq.so_tin).toBe(2);

    const kho = await khoThongBao();
    expect(kho).toHaveLength(2);

    const cua = new Map(kho.map((t) => [t.phien_id, t]));
    expect(cua.get(phien_ta)?.workspace_id).toBe(WS);
    expect(cua.get(phien_ta)?.ticket_id).toBe(TK);
    expect(cua.get(phien_khac)?.workspace_id).toBe(WS_KHAC);
    expect(cua.get(phien_khac)?.ticket_id).toBe(tk_khac);
  });
});

/* ================================================================== *
 * D. Hai lượt cron CHỒNG NHAU trên cùng một phiên
 * ================================================================== */

describe('d.196 "bắn 1 thông báo" — hai lượt cron chồng nhau', () => {
  it('hai lượt quét song song trên cùng phiên → vẫn đúng 1 tin', async () => {
    const { phien, tin_hieu_cuoi_luc } = await dungCanh(TK);

    /*
     * Cả hai lượt ĐỌC (thẳng D1, ngoài DO) trước khi lượt nào GHI, nên cả hai đều
     * kết luận "cần bắn". Thứ duy nhất giữ được "đúng 1 tin" là việc
     * `ghiMocCanhBao` **kiểm lại luật lần hai** bên trong cửa ghi và không nhận kết
     * luận người gọi gửi vào. Bỏ chặng kiểm lại đó thì ca này đỏ.
     */
    const [mot, hai] = await Promise.all([cronCanhBao(), cronCanhBao()]);

    expect(mot.so_tin + hai.so_tin).toBe(1);
    expect(mot.so_ghi + hai.so_ghi).toBe(1);
    expect(mot.so_loi + hai.so_loi).toBe(0);
    expect(await khoThongBao()).toHaveLength(1);
    expect((await phienTrongDb(phien))?.canh_bao_tin_hieu_luc).toBe(tin_hieu_cuoi_luc);
  });

  it('KHÔNG BAO GIỜ có tin không mốc: mọi tin trong kho đều có mốc trên phiên của nó', async () => {
    /*
     * Tính chất này là thứ `batch` của `ghiMocCanhBao` tồn tại để giữ, và cả hai câu
     * trong `batch` đó đều chịu **một** điều kiện `WHERE` (xem ghi chú ở
     * `#ghiMotMocCanhBao`). Một tin **không** mốc nghĩa là lượt quét sau lại kết luận
     * "cần bắn" cho đúng lần đứng ấy — chuông nhận một tin mới mỗi 5 phút, mãi mãi.
     *
     * Đo trên ba phiên và hai lượt cron **chồng nhau**, tức đúng hình dạng mà hai
     * câu có thể lệch nhau.
     */
    await dungCanh(TK, { im_lang_ms: 90 * PHUT });
    await dungCanh(TK2, { im_lang_ms: 60 * PHUT });
    await dungCanh(TK3, { im_lang_ms: 40 * PHUT });

    await Promise.all([cronCanhBao(), cronCanhBao()]);

    const kho = await khoThongBao();
    expect(kho).toHaveLength(3);
    for (const t of kho) {
      const p = await phienTrongDb(t.phien_id!);
      expect(p?.canh_bao_tin_hieu_luc, `tin ${t.id} phải có mốc`).not.toBeNull();
    }
  });

  it('KHÔNG BAO GIỜ có mốc không tin: mọi phiên có mốc đều có ĐÚNG MỘT tin trong kho', async () => {
    /*
     * Chiều **đối xứng** của ca ngay trên, và là chiều `batch` cũng phải giữ: một mốc
     * **không** tin nghĩa là lần đứng ấy bị ghi là "đã bắn" mà chuông của chủ không
     * bao giờ nhận gì — d.196 "bắn 1 thông báo" **không** xảy ra, và không lượt quét
     * nào sau đó bắn lại được (mốc đã khớp). Đó là hỏng im lặng, nặng hơn chiều kia.
     *
     * "Đúng một" chứ không "ít nhất một": hai tin cho cùng một mốc cũng là vi phạm
     * d.196. Cùng cảnh dựng với ca trên — ba phiên, hai lượt cron **chồng nhau**.
     */
    await dungCanh(TK, { im_lang_ms: 90 * PHUT });
    await dungCanh(TK2, { im_lang_ms: 60 * PHUT });
    await dungCanh(TK3, { im_lang_ms: 40 * PHUT });

    await Promise.all([cronCanhBao(), cronCanhBao()]);

    const kho = await khoThongBao();
    for (const phien of [`ph-${TK}`, `ph-${TK2}`, `ph-${TK3}`]) {
      const p = await phienTrongDb(phien);
      expect(p?.canh_bao_tin_hieu_luc, `phiên ${phien} phải có mốc`).not.toBeNull();
      expect(
        kho.filter((t) => t.phien_id === phien),
        `phiên ${phien} có mốc thì phải có đúng 1 tin`,
      ).toHaveLength(1);
    }
  });

  it('GUARD của `batch` không khớp (ghi 0 dòng) → KHÔNG đếm tin nào, kho vẫn rỗng', async () => {
    /*
     * Đây là đúng cái ca mà `GUARD` trong `#ghiMotMocCanhBao` tồn tại để chịu: cả hai
     * câu của `batch` ghi **0 dòng** vì một đường ngoài DO vừa đặt mốc giữa lúc ĐỌC
     * và lúc GHI. Nếu ở đó hàm vẫn trả `da_ghi: true` kèm `tin` thì Cron đếm `so_tin`
     * cho một tin **không có trong kho**, và phần 7 sẽ gửi ra ngoài một tin không tồn
     * tại — hỏng tệ hơn cả việc không bắn.
     *
     * Cửa ghi dựng **thẳng** (`new WorkspaceGate`, `_state` không dùng) với một `DB`
     * mà `prepare` đi đường thật còn `batch` ghi 0 dòng: không có cách nào dựng cảnh
     * này qua dữ liệu, vì hai câu `if` phía trên đọc đúng những cột mà `GUARD` đọc —
     * chỉ một lượt ghi chen vào giữa mới tách chúng ra, và nó không dựng được từ test.
     */
    const { phien } = await dungCanh(TK);

    const db_batch_rong = {
      ...env.DB,
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: (cau: D1PreparedStatement[]) =>
        Promise.resolve(
          cau.map(() => ({ success: true, results: [], meta: { changes: 0 } })),
        ) as unknown as Promise<D1Result[]>,
    } as unknown as D1Database;

    const cua = new WorkspaceGate(null as unknown as DurableObjectState, {
      ...(env as unknown as Env),
      DB: db_batch_rong,
    });

    const kq = await cua.ghiMocCanhBao({ workspace_id: WS, phien_id: phien });

    expect(kq.da_ghi).toBe(false);
    expect(kq.tin).toBeNull();
    expect(kq.thong_bao_id).toBeNull();
    expect(kq.moc_moi).toBeNull();
    expect(kq.kenh).toBeNull();
    // Và đúng điều `tin: null` khai: kho không có gì để đếm.
    expect(await khoThongBao()).toHaveLength(0);
  });

  it('ĐỐI CHỨNG: cùng phiên đó qua cửa ghi THẬT → `da_ghi` true và kho có đúng tin ấy', async () => {
    const { phien } = await dungCanh(TK);

    const cua = new WorkspaceGate(null as unknown as DurableObjectState, env);
    const kq = await cua.ghiMocCanhBao({ workspace_id: WS, phien_id: phien });

    expect(kq.da_ghi).toBe(true);
    expect(kq.tin?.phien_id).toBe(phien);

    const kho = await khoThongBao();
    expect(kho).toHaveLength(1);
    expect(kho[0]?.id).toBe(kq.thong_bao_id);
  });
});

/* ================================================================== *
 * E. Chọn việc theo MỐC GIỜ của nhịp
 * ================================================================== */

describe('19.12 câu 46 — nhịp 5 phút, và chỉ nhịp 5 phút', () => {
  it('`CRON_CANH_BAO` vẫn nói nhịp 5 phút, đúng chữ chốt', () => {
    /*
     * Chuỗi này **không còn** là một Cron Trigger (gói Free cho 5 cron mỗi tài
     * khoản — lỗi 10072, 07/10; `wrangler.toml` chỉ còn `* * * * *`). Nó ở lại vì nó
     * là cách gọn nhất để nói nhịp **hiệu dụng** mà câu 46 chốt, và nhịp ấy **không
     * đổi**: `GIAN_CANH_BAO_PHUT` phải là đúng con số trong chuỗi.
     */
    expect(CRON_CANH_BAO).toBe('*/5 * * * *');
    expect(GIAN_CANH_BAO_PHUT).toBe(5);
    expect(CRON_CANH_BAO).toContain(`*/${String(GIAN_CANH_BAO_PHUT)} `);
  });

  it('`viecCuaCron` là sổ tra duy nhất, và chỉ phút chia hết 5 bật việc cảnh báo', () => {
    // Phút chia hết 5 → cảnh báo bật.
    expect(viecCuaCron(nhip(3, 5))).toMatchObject({ canh_bao: true, theo_doi: false });
    expect(viecCuaCron(nhip(3, 15))).toMatchObject({ canh_bao: true });

    /*
     * Phút **không** chia hết 5 → **không** cảnh báo. Đây là vế "không dày hơn chữ
     * chốt": một nhịp mỗi phút bật cảnh báo mỗi phút là quét `phien` của cả hệ 5 lần
     * nhiều hơn câu 46, không đổi lấy gì.
     */
    for (const phut of [1, 2, 3, 4, 6, 9]) {
      expect(viecCuaCron(nhip(3, phut)).canh_bao, `phút ${String(phut)}`).toBe(false);
    }

    // Việc của phần 7 ở nhịp thường vẫn bật — chúng không liên quan tới nhịp 5 phút.
    expect(viecCuaCron(nhip(3, 1))).toEqual({
      thu_lai: true,
      theo_doi: false,
      canh_bao: false,
      thong_bao: true,
      bao_cao_sang: false,
      bao_cao_toi: false,
      sao_luu: false,
    });
  });

  it('nhịp phút chia hết 5 chạy việc cảnh báo; nhịp phút khác thì KHÔNG', async () => {
    await dungCanh(TK);

    const kq = await chayCron({ scheduledTime: nhip(3, 5) }, env);
    expect(kq.canh_bao.so_tin).toBe(1);
    // Nhịp này cũng là một nhịp mỗi phút (một cron duy nhất), nhưng không có bằng
    // chứng nào đến hạn nên hai lượt quét của phần 7 vẫn rỗng.
    expect(kq.thu_lai.so_dong).toBe(0);
    expect(kq.theo_doi.so_dong).toBe(0);
  });

  it('phút KHÔNG chia hết 5 không chạy việc cảnh báo, không ghi gì vào kho', async () => {
    await dungCanh(TK);

    for (const phut of [1, 2, 3, 4]) {
      const kq = await chayCron({ scheduledTime: nhip(3, phut) }, env);
      expect(kq.canh_bao, `phút ${String(phut)}`).toEqual(QUET_CANH_BAO_RONG);
    }

    // Bốn nhịp đó không ghi gì vào kho — đối chứng là ca ngay trên.
    expect(await khoThongBao()).toHaveLength(0);
  });

  it('phút chia hết 10 chạy CẢ cảnh báo và theo dõi — hai nhịp độc lập', async () => {
    await dungCanh(TK);

    /*
     * Hình cũ (năm cron) có trigger mỗi 10 phút **không** bật cảnh báo, vì nó là
     * một trigger khác. Hình mới thì phút 10 chia hết cả 10 và 5, nên cả hai bật — và
     * đó là **đúng** nhịp mà SPEC chốt cho từng việc, không một việc nào chạy dày
     * hơn hay thưa hơn trước.
     */
    const kq = await chayCron({ scheduledTime: nhip(3, 10) }, env);
    expect(kq.canh_bao.so_tin).toBe(1);
    expect(viecCuaCron(nhip(3, 10))).toMatchObject({ canh_bao: true, theo_doi: true });
  });

  it('không còn ĐƯỜNG THỨ HAI nào ghi mốc: route và lệnh của lượt 4 đã gỡ', async () => {
    /*
     * 19.12 câu 46 bỏ đường "Tổng quan gọi khi mở". Hai đường ghi mốc cùng tồn tại
     * thì "bắn đúng 1 lần" không còn một chỗ duy nhất để canh — nên ca này canh
     * **sự vắng mặt** của đường cũ.
     */
    const res = await goiApi('/v1/phien/canh-bao/quet', TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status).toBe(404);

    expect(Object.keys(SO_DANG_KY_HANDLER)).not.toContain('quet_canh_bao');
  });
});

/* ================================================================== *
 * F. Trần mỗi lượt + cô lập lỗi THEO DÒNG
 * ================================================================== */

describe('trần mỗi lượt quét — "phiên im lâu nhất đi trước"', () => {
  it('trần là 200 dòng, và một lượt thường không đầy trần', async () => {
    await dungCanh(TK);

    expect(TRAN_PHIEN_MOI_LUOT).toBe(200);
    expect((await cronCanhBao()).day_tran).toBe(false);
  });

  it('đầy trần → phần còn lại đợi lượt sau, và dòng im lâu nhất đi trước', async () => {
    const cu = await dungCanh(TK, { im_lang_ms: 90 * PHUT });
    await dungCanh(TK2, { im_lang_ms: 40 * PHUT });

    /*
     * Gọi thẳng chặng đọc với `tran = 1`: dựng 200 phiên chỉ để thấy cùng một điều
     * là một ca test chạy hàng chục giây mà không kiểm thêm luật nào.
     */
    const mot = await phienCanCanhBaoToanHe(env.DB, Date.now(), 1);

    expect(mot.so_dong).toBe(1);
    expect(mot.can[0]?.phien_id).toBe(cu.phien);

    // Và với trần đủ rộng thì cả hai ra, vẫn theo thứ tự im lâu nhất trước.
    const hai = await phienCanCanhBaoToanHe(env.DB, Date.now(), TRAN_PHIEN_MOI_LUOT);
    expect(hai.can.map((p) => p.phien_id)).toEqual([cu.phien, `ph-${TK2}`]);
  });
});

describe('cô lập lỗi THEO DÒNG — một dòng độc không cắt lượt quét', () => {
  it('dòng độc đứng ĐẦU danh sách: các phiên xếp sau vẫn được xử lý, `so_loi` đếm đúng', async () => {
    /*
     * Dòng độc là dòng **im lâu nhất**, nên nó đứng đầu `ORDER BY tin_hieu_cuoi_luc`
     * — đúng hình dạng xấu nhất mà `moiDongMotLoi` sinh ra để chịu: để lỗi ném ra
     * thì mọi lượt quét sau đọc lại đúng danh sách ấy, gặp lại đúng dòng ấy, lại đổ,
     * và d.196 **không bao giờ** chạy cho hai phiên xếp sau.
     */
    const doc = await dungCanh(TK, { im_lang_ms: 90 * PHUT });
    const sau_1 = await dungCanh(TK2, { im_lang_ms: 60 * PHUT });
    const sau_2 = await dungCanh(TK3, { im_lang_ms: 40 * PHUT });

    const kq = await quetCanhBaoPhien(envCuaGhiDocMotDong(doc.phien), Date.now());

    expect(kq.so_dong).toBe(3);
    expect(kq.so_loi).toBe(1);
    expect(kq.so_tin).toBe(2);
    expect(kq.tin.map((t) => t.phien_id)).toEqual([sau_1.phien, sau_2.phien]);

    const kho = await khoThongBao();
    expect(kho.map((t) => t.phien_id)).toEqual([sau_1.phien, sau_2.phien]);
    // Dòng độc **không** được ghi mốc, nên lượt quét sau vẫn thử lại nó.
    expect((await phienTrongDb(doc.phien))?.canh_bao_tin_hieu_luc).toBeNull();
  });

  it('ĐỐI CHỨNG: cùng ba phiên đó qua cửa ghi thật → 3 tin, 0 lỗi', async () => {
    await dungCanh(TK, { im_lang_ms: 90 * PHUT });
    await dungCanh(TK2, { im_lang_ms: 60 * PHUT });
    await dungCanh(TK3, { im_lang_ms: 40 * PHUT });

    const kq = await cronCanhBao();

    expect(kq.so_loi).toBe(0);
    expect(kq.so_tin).toBe(3);
    expect(await khoThongBao()).toHaveLength(3);
  });
});

/* ================================================================== *
 * G. Index: đúng câu truy vấn THẬT của Cron 5 phút
 * ================================================================== */

describe('Cron 5 phút đi theo index RIÊNG PHẦN `ix_phien_canh_bao` của 0012', () => {
  it('câu quét toàn hệ thật của Cron dùng `ix_phien_canh_bao`, không quét cả bảng `phien`', async () => {
    /*
     * Câu đo ở đây **không chép tay**: nó là `cauQuetCanhBaoToanHe`, đúng chuỗi mà
     * `phienCanCanhBaoToanHe` đưa cho `prepare`. Lý do phải vậy nằm ở chỗ
     * `ix_phien_canh_bao` là index **riêng phần** (`WHERE trang_thai <> 'closed'`):
     * SQLite chỉ dùng nó khi `WHERE` của câu hàm ý **đúng** vị từ ấy. Sửa
     * `LOC_CAN_CANH_BAO` sang một cách viết tương đương về nghĩa mà SQLite không
     * nhận ra (vd `trang_thai NOT IN ('closed')`, hay bỏ hẳn điều kiện đó rồi lọc ở
     * bộ nhớ) làm Cron quét toàn bảng `phien` của cả hệ mỗi 5 phút — và không ca nào
     * khác trong file này đỏ, vì kết quả trả ra **không đổi**.
     */
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN ${cauQuetCanhBaoToanHe(TRAN_PHIEN_MOI_LUOT)}`,
    ).all<{ detail: string }>();
    const ke_hoach = results.map((r) => r.detail).join(' | ');

    /*
     * Chuỗi kế hoạch THẬT, nguyên văn (đọc ra bằng cách in `ke_hoach` trong một lần
     * chạy, không đoán):
     *
     *   SCAN p USING INDEX ix_phien_canh_bao
     *     | SEARCH a USING INDEX sqlite_autoindex_agent_1 (id=?)
     *     | SEARCH t USING INDEX sqlite_autoindex_ticket_1 (id=?)
     *     | SEARCH pr USING INDEX sqlite_autoindex_project_1 (id=?)
     *
     * Vì câu viết `FROM phien p`, SQLite in kế hoạch theo **alias**: một lượt quét
     * toàn bảng hiện ra là `SCAN p` TRƠN, không bao giờ là `SCAN phien`. Nên khẳng
     * định âm phải bắt đúng dạng trơn ấy; `not.toContain('SCAN phien')` thì xanh kể
     * cả khi Cron quét cả bảng.
     */
    expect(results[0]?.detail).toBe('SCAN p USING INDEX ix_phien_canh_bao');
    expect(ke_hoach).toContain('ix_phien_canh_bao');
    expect(ke_hoach).not.toMatch(/SCAN p(?! USING INDEX)/);
    /*
     * `ORDER BY tin_hieu_cuoi_luc, id` đi đúng thứ tự của `ix_phien_canh_bao`, nên
     * không cần sắp tạm. Có `TEMP B-TREE` nghĩa là index không còn phục vụ thứ tự —
     * tức trần 200 dòng được cắt sau khi đã sắp cả bảng.
     */
    expect(ke_hoach).not.toContain('TEMP B-TREE');
  });
});

/* ================================================================== *
 * H. Trigger của migration 0012
 * ================================================================== */

describe('migration 0012 — trigger của bảng `thong_bao`', () => {
  it('tin mang `workspace_id` lệch với phiên của nó → bị chặn (SPEC mục 1, 18)', async () => {
    const { phien } = await dungCanh(TK);
    await dungTicketWorkspaceKhac();

    await expect(
      env.DB.prepare(
        `INSERT INTO thong_bao (id, workspace_id, loai, noi_dung, phien_id, tao_luc)
         VALUES ('tb-xuyen', ?, 'phien_dung', 'Tin đi xuyên workspace', ?, ?)`,
      )
        .bind(WS_KHAC, phien, Date.now())
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it('ĐỐI CHỨNG: cùng tin đó với đúng workspace của phiên → vào kho được', async () => {
    const { phien } = await dungCanh(TK);

    await env.DB.prepare(
      `INSERT INTO thong_bao (id, workspace_id, loai, noi_dung, phien_id, tao_luc)
       VALUES ('tb-dung', ?, 'phien_dung', 'Tin đúng workspace', ?, ?)`,
    )
      .bind(WS, phien, Date.now())
      .run();

    expect(await khoThongBao()).toHaveLength(1);
  });

  it('tin mang `ticket_id` của workspace khác → bị chặn', async () => {
    const tk_khac = await dungTicketWorkspaceKhac();

    await expect(
      env.DB.prepare(
        `INSERT INTO thong_bao (id, workspace_id, loai, noi_dung, ticket_id, tao_luc)
         VALUES ('tb-tk', ?, 'ticket_xong', 'Tin trỏ ticket của chủ khác', ?, ?)`,
      )
        .bind(WS, tk_khac, Date.now())
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it('`noi_dung` của một tin ĐÃ BẮN không sửa được', async () => {
    await dungCanh(TK);
    await cronCanhBao();
    const tin = (await khoThongBao())[0]!;

    await expect(
      env.DB.prepare('UPDATE thong_bao SET noi_dung = ? WHERE id = ?')
        .bind('Viết lại thứ đã nói với chủ', tin.id)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);

    await expect(
      env.DB.prepare("UPDATE thong_bao SET loai = 'bao_cao_sang' WHERE id = ?")
        .bind(tin.id)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);

    expect((await khoThongBao())[0]?.noi_dung).toBe(tin.noi_dung);
  });

  it('nhưng `doc_luc` và `gui_telegram_luc` thì UPDATE được (chuông + phần 7)', async () => {
    await dungCanh(TK);
    await cronCanhBao();
    const tin = (await khoThongBao())[0]!;

    const t = Date.now();
    await env.DB.prepare('UPDATE thong_bao SET doc_luc = ? WHERE id = ?').bind(t, tin.id).run();
    await env.DB.prepare('UPDATE thong_bao SET gui_telegram_luc = ? WHERE id = ?')
      .bind(t, tin.id)
      .run();

    const sau = (await khoThongBao())[0]!;
    expect(sau.doc_luc).toBe(t);
    expect(sau.gui_telegram_luc).toBe(t);
    expect(sau.noi_dung).toBe(tin.noi_dung);
  });
});
