/**
 * **Nộp báo cáo, nghiệm thu, trả lại, huỷ lượt** — SPEC mục 5 (nửa sau),
 * 19.2 (bảng sự kiện → ticket), 19.3, 19.5, 19.11.
 *
 * Mỗi câu luật của SPEC có một ca riêng, tên ca ghi đúng chữ SPEC để đối chiếu.
 *
 * Bảng **19.2** là luật trung tâm của lượt này, nên **mỗi hàng của bảng có một
 * ca**, và ca nào cũng kiểm trạng thái ticket **đọc lại từ DB** — không tin giá
 * trị trả về của lệnh, vì chính nó là thứ đang được kiểm.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  CUA_SO_DAT_LAN_DAU_MS,
  TIEU_DE_LY_DO_TRA_LAI,
  briefCongLyDoTraLai,
  hanPhanHoiApLai,
  kiemBaoCaoNop,
  kiemKetQuaNop,
  tiLeDatLanDau,
  type LuotChoTiLe,
} from '@baton/shared';
import { tiLeDatLanDauCuaAgent } from '../src/doc-luot-giao.js';
import { layAgent } from '../src/doc-du-an.js';
import {
  CHU,
  CONG_DU_GIA,
  TOKEN_CHU,
  WS,
  chayLenhVoiCong,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungLienKet,
  dungLuotGiao,
  dungTicket,
  dungWorkspace,
  goiApi,
  trangThaiCua,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/* ------------------------------------------------------------------ *
 * Môi trường
 * ------------------------------------------------------------------ */

const P = 'pj-SAI';
const TK = 'tk-pj-SAI-1';
const TK_2 = 'tk-pj-SAI-2';
const TK_3 = 'tk-pj-SAI-3';

const AG = { mgr: 'ag-mgr', wk: 'ag-wk', wk2: 'ag-wk2', rv: 'ag-rv' } as const;
const TOKEN = {
  mgr: 'bt_nnt_mgr',
  wk: 'bt_nnt_wk',
  wk2: 'bt_nnt_wk2',
  rv: 'bt_nnt_rv',
} as const;

beforeEach(async () => {
  await dungWorkspace();
  await dungAgentCoToken({ id: AG.mgr, ten: 'M-Sample', vai_tro: 'manager', token: TOKEN.mgr });
  await dungAgentCoToken({ id: AG.wk, ten: 'W-builder', vai_tro: 'worker', token: TOKEN.wk });
  await dungAgentCoToken({ id: AG.wk2, ten: 'W-builder-2', vai_tro: 'worker', token: TOKEN.wk2 });
  await dungAgentCoToken({ id: AG.rv, ten: 'W-reviewer', vai_tro: 'reviewer', token: TOKEN.rv });

  await dungDuAn('SAI', 'Sample', 'active', AG.mgr);
  for (const id of Object.values(AG)) await choVaoDuAn(id, P);

  await dungTicket(P, 1, 'Việc để giao', { trang_thai: 'todo' });
  await dungTicket(P, 2, 'Việc thứ hai', { trang_thai: 'todo' });
  await dungTicket(P, 3, 'Việc thứ ba', { trang_thai: 'todo' });
});

/* ------------------------------------------------------------------ *
 * Giúp việc: đi đúng đường HTTP thật
 * ------------------------------------------------------------------ */

interface LuotRa {
  id: string;
  so_luot: number;
  trang_thai: string;
  ticket_trang_thai: string;
  tu_accepted?: boolean;
  luot_moi?: {
    id: string;
    so_luot: number;
    trang_thai: string;
    nguoi_nhan_agent_id: string;
    han_phan_hoi_luc: number | null;
  } | null;
  con_luot_mo?: boolean;
}

/** Giao rồi nhận: đưa một lượt về `in_progress`, trạng thái duy nhất nộp được. */
async function giaoVaNhan(
  ticket_id: string,
  nguoi_nhan: string,
  token_nhan: string,
  them: Record<string, unknown> = {},
  token_giao: string = TOKEN.mgr,
): Promise<string> {
  const tao = await goiApi(`/v1/ticket/${ticket_id}/luot-giao`, token_giao, {
    method: 'POST',
    than: { nguoi_nhan_agent_id: nguoi_nhan, ...them },
  });
  expect(tao.status, 'tạo lượt').toBe(201);
  const { id } = await tao.json<{ id: string }>();

  const nhan = await goiApi(`/v1/luot-giao/${id}/nhan`, token_nhan, { method: 'POST' });
  expect(nhan.status, 'nhận lượt').toBe(200);
  return id;
}

function nop(
  token: string,
  luot_giao_id: string,
  than: Record<string, unknown>,
): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/nop`, token, { method: 'POST', than });
}

function nghiemThu(
  token: string,
  luot_giao_id: string,
  than: Record<string, unknown>,
): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/nghiem-thu`, token, { method: 'POST', than });
}

function huy(
  token: string,
  luot_giao_id: string,
  than: Record<string, unknown> = {},
): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/huy`, token, { method: 'POST', than });
}

async function luotTrongDb(id: string): Promise<Record<string, unknown>> {
  const d = await env.DB.prepare('SELECT * FROM luot_giao WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  expect(d, `không tìm thấy lượt ${id}`).not.toBeNull();
  return d!;
}

/* ================================================================== *
 * SPEC mục 5 — "Báo cáo nộp (có cấu trúc, bắt buộc khi nộp)"
 * ================================================================== */
describe('SPEC mục 5 — báo cáo nộp có cấu trúc', () => {
  it('kết quả là 3 mã của bảng mục 0.1: done, partial, blocked', () => {
    expect(kiemKetQuaNop('done')).toBe('done');
    expect(kiemKetQuaNop('partial')).toBe('partial');
    expect(kiemKetQuaNop('blocked')).toBe('blocked');
  });

  it('kết quả lạ → INVALID_INPUT (không nhận `worker`, `ok`, `xong`…)', () => {
    for (const xau of ['worker', 'ok', 'xong', 'accepted', '', null, 1]) {
      expect(() => kiemKetQuaNop(xau), String(xau)).toThrowError();
    }
  });

  it('kết quả BẮT BUỘC: nộp mà thiếu `ket_qua` → 422 INVALID_INPUT', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.wk, lg, { da_lam: 'xong rồi' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('5 mục của SPEC được lưu đủ, đúng tên: Đã làm · Kiểm chứng · Nhánh và commit · Rủi ro · Việc phát sinh', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.wk, lg, {
      ket_qua: 'partial',
      da_lam: 'Cài xong lệnh nộp',
      kiem_chung: 'npm test xanh',
      nhanh_va_commit: 'worker/p2 · abc1234',
      rui_ro: 'Chưa có phiên',
      viec_phat_sinh: 'Tách cổng bằng chứng ra phần 3',
    });
    expect(res.status).toBe(200);

    const d = await luotTrongDb(lg);
    expect(d['ket_qua']).toBe('partial');
    expect(d['bc_da_lam']).toBe('Cài xong lệnh nộp');
    expect(d['bc_kiem_chung']).toBe('npm test xanh');
    expect(d['bc_nhanh_va_commit']).toBe('worker/p2 · abc1234');
    expect(d['bc_rui_ro']).toBe('Chưa có phiên');
    expect(d['bc_viec_phat_sinh']).toBe('Tách cổng bằng chứng ra phần 3');
    expect(d['nop_luc']).toBeTypeOf('number');
  });

  it('mục để trống lưu NULL, không lưu chuỗi rỗng', () => {
    const bc = kiemBaoCaoNop({ da_lam: '   ', kiem_chung: 'có' });
    expect(bc.da_lam).toBeNull();
    expect(bc.kiem_chung).toBe('có');
    expect(bc.viec_phat_sinh).toBeNull();
  });

  it('lượt → `submitted` sau khi nộp', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.wk, lg, { ket_qua: 'partial' });
    expect((await res.json<LuotRa>()).trang_thai).toBe('submitted');
    expect((await luotTrongDb(lg))['trang_thai']).toBe('submitted');
  });
});

describe('SPEC mục 5 — ai nộp được, và lượt phải đang làm', () => {
  it('chỉ **người nhận** nộp được: agent khác → 403', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.wk2, lg, { ket_qua: 'done' });
    expect(res.status).toBe(403);
  });

  it('kể cả **người giao** cũng không nộp hộ được → 403', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.mgr, lg, { ket_qua: 'done' });
    expect(res.status).toBe(403);
  });

  it('kể cả **chủ** cũng không nộp hộ được → 403', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN_CHU, lg, { ket_qua: 'done' });
    expect(res.status).toBe(403);
  });

  it('lượt còn `pending` (chưa nhận) → 409 ASSIGNMENT_STATE_INVALID', async () => {
    await dungLuotGiao('lg-cho', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });
    const res = await nop(TOKEN.wk, 'lg-cho', { ket_qua: 'done' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'ASSIGNMENT_STATE_INVALID' });
  });

  it('nộp hai lần → lần hai 409 (lượt đã `submitted`)', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    expect((await nop(TOKEN.wk, lg, { ket_qua: 'partial' })).status).toBe(200);
    const res = await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    expect(res.status).toBe(409);
  });

  it('lượt không tồn tại → 404 (không lộ sự tồn tại — SPEC mục 13)', async () => {
    const res = await nop(TOKEN.wk, 'lg-khong-co-that', { ket_qua: 'done' });
    expect(res.status).toBe(404);
  });
});

/* ================================================================== *
 * SPEC 19.1 — `submitted` KHÔNG còn "mở", mà là "chờ nghiệm thu"
 * ================================================================== */
describe('SPEC 19.1 — nộp xong thì lượt hết "mở", nên mở được lượt mới', () => {
  it('nộp xong, giao lượt `work` mới trên cùng ticket được (không còn ASSIGNMENT_OPEN)', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);

    // Trước khi nộp: lượt đang mở, nên lượt thứ hai bị chặn.
    const bi_chan = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: AG.wk2 },
    });
    expect(bi_chan.status).toBe(409);
    expect(await bi_chan.json()).toMatchObject({ error: 'ASSIGNMENT_OPEN' });

    expect((await nop(TOKEN.wk, lg, { ket_qua: 'partial' })).status).toBe(200);

    // Sau khi nộp: `submitted` không còn mở (19.1), nên giao được lượt mới.
    const sau = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: AG.wk2 },
    });
    expect(sau.status).toBe(201);
  });

  it('`phamViLuotGiao` cũng hết tính lượt `submitted` là của mình: worker mất quyền sửa ticket', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);

    // Đang `in_progress`: ô "ticket của lượt mình" mở, worker đổi trạng thái được.
    const truoc = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN.wk, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(truoc.status).toBe(200);

    expect((await nop(TOKEN.wk, lg, { ket_qua: 'partial' })).status).toBe(200);

    // Đã `submitted`: hết "mở", nên ô phạm vi đóng lại → FORBIDDEN.
    const sau = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN.wk, {
      method: 'POST',
      than: { trang_thai: 'backlog' },
    });
    expect(sau.status).toBe(403);
  });

  it('người đang cầm chuyển sang bậc 3: "chờ <người giao> nghiệm thu" (19.1)', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    expect((await nop(TOKEN.wk, lg, { ket_qua: 'partial' })).status).toBe(200);

    const res = await goiApi(`/v1/ticket/${TK}`, TOKEN_CHU);
    const than = await res.json<{ nguoi_dang_cam: unknown; cho_nghiem_thu: boolean }>();
    expect(than.nguoi_dang_cam).toMatchObject({ loai: 'agent', agentId: AG.mgr });
    expect(than.cho_nghiem_thu).toBe(true);
  });
});

/* ================================================================== *
 * SPEC 19.2 — bảng sự kiện → ticket. MỖI HÀNG MỘT CA.
 * ================================================================== */
describe('SPEC 19.2 — nộp `done`: kiểm cổng, đủ thì Xong, thiếu thì Chờ kiểm chứng', () => {
  it('cổng THIẾU (mặc định của phần 2) → ticket sang **Chờ kiểm chứng**', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.wk, lg, { ket_qua: 'done', da_lam: 'xong' });
    expect(res.status).toBe(200);
    expect((await res.json<LuotRa>()).ticket_trang_thai).toBe('verifying');
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('nộp `done` mà cổng thiếu **không phải lỗi**: 200, không EVIDENCE_REQUIRED', async () => {
    // Khác hẳn đổi tay sang Xong (`baton status`), chỗ đó mới có
    // `EVIDENCE_REQUIRED`. Nộp là việc hợp lệ; cổng chưa đạt chỉ giữ ticket lại.
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    expect(res.status).toBe(200);
  });

  it('cổng ĐỦ (cổng giả tiêm vào) → ticket vào **Xong**', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);

    const { ket_qua } = await chayLenhVoiCong(
      {
        loai: 'nop_bao_cao',
        workspace_id: WS,
        ai: {
          loai: 'agent',
          agent_id: AG.wk,
          vai_tro: 'worker',
          disabled: false,
          vao_tat_ca_du_an: false,
          du_an_duoc_vao: [P],
          du_an_minh_quan_ly: [],
          ghi_de: {},
        },
        luot_giao_id: lg,
        ket_qua: 'done',
      },
      CONG_DU_GIA,
    );

    expect((ket_qua as LuotRa).ticket_trang_thai).toBe('done');
    expect(await trangThaiCua(TK)).toBe('done');
  });
});

describe('SPEC 19.2 — nộp `partial`: giữ **Đang làm**', () => {
  it('ticket ở lại `in_progress`', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.wk, lg, { ket_qua: 'partial' });
    expect((await res.json<LuotRa>()).ticket_trang_thai).toBe('in_progress');
    expect(await trangThaiCua(TK)).toBe('in_progress');
  });
});

describe('SPEC 19.2 — nộp `blocked`: về **Cần làm**', () => {
  it('ticket về `todo`', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    expect(await trangThaiCua(TK)).toBe('in_progress');

    const res = await nop(TOKEN.wk, lg, { ket_qua: 'blocked', rui_ro: 'thiếu quyền repo' });
    expect((await res.json<LuotRa>()).ticket_trang_thai).toBe('todo');
    expect(await trangThaiCua(TK)).toBe('todo');
  });

  it('đối chứng: `partial` và `blocked` cho hai kết quả KHÁC nhau trên cùng ticket', async () => {
    const a = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, a, { ket_qua: 'partial' });
    const sau_partial = await trangThaiCua(TK);

    const b = await giaoVaNhan(TK_2, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, b, { ket_qua: 'blocked' });
    const sau_blocked = await trangThaiCua(TK_2);

    expect(sau_partial).not.toBe(sau_blocked);
  });
});

/* ================================================================== *
 * SPEC mục 5 + 19.2 — Nghiệm thu
 * ================================================================== */
describe('SPEC mục 5 — ai nghiệm thu được', () => {
  it('chỉ **người giao**: agent khác → 403', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    expect((await nghiemThu(TOKEN.wk2, lg, { ket_qua: 'accepted' })).status).toBe(403);
  });

  it('người nhận không tự nghiệm thu lượt của mình → 403', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    expect((await nghiemThu(TOKEN.wk, lg, { ket_qua: 'accepted' })).status).toBe(403);
  });

  it('lượt do agent giao: **chủ** không nghiệm thu thay → 403', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    expect((await nghiemThu(TOKEN_CHU, lg, { ket_qua: 'accepted' })).status).toBe(403);
  });

  it('lượt do CHỦ giao thì chủ nghiệm thu được', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk, {}, TOKEN_CHU);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    expect((await nghiemThu(TOKEN_CHU, lg, { ket_qua: 'accepted' })).status).toBe(200);
  });

  it('lượt chưa nộp (`in_progress`) → 409 ASSIGNMENT_STATE_INVALID', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'accepted' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'ASSIGNMENT_STATE_INVALID' });
  });

  it('kết quả nghiệm thu lạ → 422 (chỉ `accepted` hoặc `returned`, mã bảng 0.1)', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    for (const xau of ['accept', 'return', 'dat', 'ok']) {
      const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: xau });
      expect(res.status, xau).toBe(422);
    }
  });
});

describe('SPEC 19.2 + mục 5 — nghiệm thu `accepted`', () => {
  it('lượt sang `accepted`', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'accepted' });
    expect(res.status).toBe(200);
    expect((await luotTrongDb(lg))['trang_thai']).toBe('accepted');
    expect((await luotTrongDb(lg))['dong_luc']).toBeTypeOf('number');
  });

  it('**`accepted` KHÔNG tự làm ticket Xong** (mục 5): cổng thiếu → Chờ kiểm chứng', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'partial' });
    expect(await trangThaiCua(TK)).toBe('in_progress');

    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'accepted' });
    expect((await res.json<LuotRa>()).ticket_trang_thai).toBe('verifying');
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('"**Baton kiểm cổng ngay**" (19.2): cổng đủ → ticket vào Xong ngay lúc nghiệm thu', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'partial' });
    expect(await trangThaiCua(TK)).toBe('in_progress');

    const { ket_qua } = await chayLenhVoiCong(
      {
        loai: 'nghiem_thu',
        workspace_id: WS,
        ai: {
          loai: 'agent',
          agent_id: AG.mgr,
          vai_tro: 'manager',
          disabled: false,
          vao_tat_ca_du_an: false,
          du_an_duoc_vao: [P],
          du_an_minh_quan_ly: [P],
          ghi_de: {},
        },
        luot_giao_id: lg,
        ket_qua: 'accepted',
      },
      CONG_DU_GIA,
    );

    expect((ket_qua as LuotRa).ticket_trang_thai).toBe('done');
    expect(await trangThaiCua(TK)).toBe('done');
  });
});

describe('SPEC mục 5 + 19.2 + 19.5 — nghiệm thu `returned` (trả lại)', () => {
  it('**bắt buộc có lý do**: thiếu → 422 REASON_REQUIRED', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });

    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'REASON_REQUIRED' });

    // Không ghi gì: lượt vẫn `submitted`.
    expect((await luotTrongDb(lg))['trang_thai']).toBe('submitted');
  });

  it('lý do chỉ có khoảng trắng cũng là thiếu → 422 REASON_REQUIRED', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: '   ' });
    expect(res.status).toBe(422);
  });

  it('lượt cũ sang `returned` và **giữ lý do**', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'Thiếu test cho 19.2' });

    const d = await luotTrongDb(lg);
    expect(d['trang_thai']).toBe('returned');
    expect(d['ly_do']).toBe('Thiếu test cho 19.2');
  });

  it('19.2 — ticket **giữ Đang làm**', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    expect(await trangThaiCua(TK)).toBe('verifying');

    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'làm lại' });
    expect((await res.json<LuotRa>()).ticket_trang_thai).toBe('in_progress');
    expect(await trangThaiCua(TK)).toBe('in_progress');
  });

  it('19.5 — sinh **lượt mới `pending`, cùng người nhận, số lượt tăng, trỏ lượt cũ**', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });

    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'thiếu kiểm chứng' });
    const than = await res.json<LuotRa>();
    expect(than.luot_moi).not.toBeNull();

    const moi = await luotTrongDb(than.luot_moi!.id);
    expect(moi['trang_thai']).toBe('pending');
    expect(moi['nguoi_nhan_agent_id']).toBe(AG.wk);
    expect(moi['so_luot']).toBe(2);
    expect(moi['luot_truoc_id']).toBe(lg);
    expect(moi['loai']).toBe('work');
    // Lượt mới chưa nhận → `nhan_luc` trống, và chưa có báo cáo nào.
    expect(moi['nhan_luc']).toBeNull();
    expect(moi['ket_qua']).toBeNull();
  });

  it('19.5 — brief lượt mới = brief cũ **cộng mục "Lý do trả lại" đặt ở ĐẦU**', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk, {
      muc_tieu: 'Cài lệnh nộp báo cáo',
      dieu_cam: 'Không sửa SPEC',
    });
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });

    const res = await nghiemThu(TOKEN.mgr, lg, {
      ket_qua: 'returned',
      ly_do: 'Thiếu test cho nộp blocked',
    });
    const { luot_moi } = await res.json<LuotRa>();
    const moi = await luotTrongDb(luot_moi!.id);

    const muc_tieu = moi['muc_tieu'] as string;
    expect(muc_tieu.startsWith(TIEU_DE_LY_DO_TRA_LAI)).toBe(true);
    expect(muc_tieu).toContain('Thiếu test cho nộp blocked');
    // Brief cũ vẫn còn, cả trường đang sửa lẫn trường khác.
    expect(muc_tieu).toContain('Cài lệnh nộp báo cáo');
    expect(moi['dieu_cam']).toBe('Không sửa SPEC');
  });

  it('19.5 — **hạn phản hồi áp lại** (cùng khoảng của lượt cũ, tính từ lúc trả lại)', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk, { han_phan_hoi_phut: 30 });
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });

    const truoc = Date.now();
    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'làm lại' });
    const { luot_moi } = await res.json<LuotRa>();

    const han = luot_moi!.han_phan_hoi_luc!;
    expect(han).toBeGreaterThanOrEqual(truoc + 30 * 60_000);
    expect(han).toBeLessThan(Date.now() + 31 * 60_000);
  });

  it('19.5 — lượt cũ **không** đặt hạn thì lượt mới cũng không (không tự áp 15 phút)', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk, { han_phan_hoi_phut: null });
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'làm lại' });
    const { luot_moi } = await res.json<LuotRa>();
    expect(luot_moi!.han_phan_hoi_luc).toBeNull();
  });

  it('19.5 — "người nhận phải `nhan` lại": lượt mới nhận được, và chỉ người nhận cũ nhận', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'làm lại' });
    const { luot_moi } = await res.json<LuotRa>();

    const nguoi_khac = await goiApi(`/v1/luot-giao/${luot_moi!.id}/nhan`, TOKEN.wk2, {
      method: 'POST',
    });
    expect(nguoi_khac.status).toBe(403);

    const dung_nguoi = await goiApi(`/v1/luot-giao/${luot_moi!.id}/nhan`, TOKEN.wk, {
      method: 'POST',
    });
    expect(dung_nguoi.status).toBe(200);
  });

  it('19.5 + 19.1 — lượt mới là lượt **mở** duy nhất: không giao thêm lượt `work` nào nữa', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'làm lại' });

    const them = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: AG.wk2 },
    });
    expect(them.status).toBe(409);
    expect(await them.json()).toMatchObject({ error: 'ASSIGNMENT_OPEN' });
  });

  it('trả lại hai lần: mỗi lần một mục "Lý do trả lại" mới ở trên cùng, không mất lần cũ', async () => {
    const lg1 = await giaoVaNhan(TK, AG.wk, TOKEN.wk, { muc_tieu: 'Mục tiêu gốc' });
    await nop(TOKEN.wk, lg1, { ket_qua: 'done' });
    const r1 = await nghiemThu(TOKEN.mgr, lg1, { ket_qua: 'returned', ly_do: 'lý do một' });
    const lg2 = (await r1.json<LuotRa>()).luot_moi!.id;

    await goiApi(`/v1/luot-giao/${lg2}/nhan`, TOKEN.wk, { method: 'POST' });
    await nop(TOKEN.wk, lg2, { ket_qua: 'done' });
    const r2 = await nghiemThu(TOKEN.mgr, lg2, { ket_qua: 'returned', ly_do: 'lý do hai' });
    const lg3 = (await r2.json<LuotRa>()).luot_moi!.id;

    const moi = await luotTrongDb(lg3);
    const muc_tieu = moi['muc_tieu'] as string;
    expect(muc_tieu.indexOf('lý do hai')).toBeLessThan(muc_tieu.indexOf('lý do một'));
    expect(muc_tieu).toContain('Mục tiêu gốc');
    expect(moi['so_luot']).toBe(3);
  });
});

/* ================================================================== *
 * SPEC 19.3 — lượt review tự `accepted`
 * ================================================================== */
describe('SPEC 19.3 — reviewer nộp lượt `review`, lượt **tự `accepted`**', () => {
  it('nộp lượt `review` → lượt đi thẳng `accepted`, không qua `submitted`', async () => {
    const lg = await giaoVaNhan(TK, AG.rv, TOKEN.rv, { loai_luot: 'review' });
    const res = await nop(TOKEN.rv, lg, { ket_qua: 'done', da_lam: 'Đã review' });
    expect(res.status).toBe(200);

    const than = await res.json<LuotRa>();
    expect(than.trang_thai).toBe('accepted');
    expect(than.tu_accepted).toBe(true);
    expect((await luotTrongDb(lg))['trang_thai']).toBe('accepted');
  });

  it('không cần nghiệm thu: gọi nghiệm thu lượt review đó → 409 (đã kết)', async () => {
    const lg = await giaoVaNhan(TK, AG.rv, TOKEN.rv, { loai_luot: 'review' });
    await nop(TOKEN.rv, lg, { ket_qua: 'done' });
    const res = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'accepted' });
    expect(res.status).toBe(409);
  });

  it('đối chứng: lượt `work` nộp xong vẫn là `submitted` (chờ nghiệm thu)', async () => {
    const lg = await giaoVaNhan(TK_2, AG.wk, TOKEN.wk);
    const res = await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    const than = await res.json<LuotRa>();
    expect(than.trang_thai).toBe('submitted');
    expect(than.tu_accepted).toBe(false);
  });

  /*
   * **Nợ phần 3**: 19.3 nói reviewer nộp "bằng bằng chứng `review` **cộng** báo
   * cáo", và 19.11 nói review KHÔNG ĐẠT vẫn tự `accepted` nhưng không mở cổng.
   * Bảng `evidence` là phần 3, nên nửa bằng chứng chưa có; nửa trạng thái lượt ở
   * trên đã cài và đã có test. Ca dưới canh phần đã cài không bị hiểu nhầm là đủ.
   */
  it('nợ phần 3: nộp lượt review KHÔNG tự đưa ticket vào Xong (cổng vẫn quyết)', async () => {
    const lg = await giaoVaNhan(TK, AG.rv, TOKEN.rv, { loai_luot: 'review' });
    const res = await nop(TOKEN.rv, lg, { ket_qua: 'done' });
    expect((await res.json<LuotRa>()).ticket_trang_thai).not.toBe('done');
  });
});

/* ================================================================== *
 * SPEC mục 5 + 19.2 + 19.11 — Huỷ lượt
 * ================================================================== */
describe('SPEC mục 5 — "người giao huỷ, hoặc chủ huỷ"', () => {
  it('người giao huỷ được', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    expect((await huy(TOKEN.mgr, lg)).status).toBe(200);
    expect((await luotTrongDb(lg))['trang_thai']).toBe('canceled');
  });

  it('**chủ** huỷ được, kể cả lượt do agent giao', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    expect((await huy(TOKEN_CHU, lg)).status).toBe(200);
    expect((await luotTrongDb(lg))['trang_thai']).toBe('canceled');
  });

  it('người nhận KHÔNG huỷ lượt của mình → 403', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    expect((await huy(TOKEN.wk, lg)).status).toBe(403);
  });

  it('agent ngoài cuộc → 403', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    expect((await huy(TOKEN.wk2, lg)).status).toBe(403);
  });

  it('huỷ lượt đã kết → 409 ASSIGNMENT_STATE_INVALID', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await huy(TOKEN.mgr, lg);
    const res = await huy(TOKEN.mgr, lg);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'ASSIGNMENT_STATE_INVALID' });
  });

  it('huỷ được cả lượt đang `submitted` (chờ nghiệm thu, chưa kết)', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    expect((await huy(TOKEN.mgr, lg)).status).toBe(200);
  });
});

describe('SPEC 19.2 — lượt bị `canceled`, KHÔNG còn lượt mở nào → ticket về **Cần làm**', () => {
  it('huỷ lượt duy nhất → ticket `todo`', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    expect(await trangThaiCua(TK)).toBe('in_progress');

    const res = await huy(TOKEN.mgr, lg);
    const than = await res.json<LuotRa>();
    expect(than.con_luot_mo).toBe(false);
    expect(than.ticket_trang_thai).toBe('todo');
    expect(await trangThaiCua(TK)).toBe('todo');
  });

  it('CÒN lượt mở khác (lượt `review` song song) → ticket **không** về Cần làm', async () => {
    const lg_work = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: AG.rv, loai_luot: 'review' },
    });

    const res = await huy(TOKEN.mgr, lg_work);
    const than = await res.json<LuotRa>();
    expect(than.con_luot_mo).toBe(true);
    expect(than.ticket_trang_thai).toBe('in_progress');
    expect(await trangThaiCua(TK)).toBe('in_progress');
  });

  /*
   * Lượt còn lại ở `submitted`: **không còn mở** — 19.1 chỉ gọi `pending` và
   * `in_progress` là lượt mở, `submitted` là "chờ nghiệm thu". Nên huỷ lượt
   * `work` lúc này vẫn đưa ticket về Cần làm. Ca này canh đúng danh sách đếm
   * "lượt mở": thêm `submitted` vào đó là test đỏ.
   */
  it('lượt còn lại đang `submitted` thì KHÔNG tính là lượt mở (19.1) → ticket về `todo`', async () => {
    const lg_work = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    // Lượt `review` nộp qua HTTP tự `accepted` (19.3), nên dựng thẳng `submitted`.
    await dungLuotGiao('lg-rv-sub', TK, AG.rv, {
      loai: 'review',
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'submitted',
    });

    const res = await huy(TOKEN.mgr, lg_work);
    const than = await res.json<LuotRa>();
    expect(than.con_luot_mo).toBe(false);
    expect(than.ticket_trang_thai).toBe('todo');
    expect(await trangThaiCua(TK)).toBe('todo');
  });
});

/*
 * **Huỷ lượt KHÔNG hạ ticket đã kết.** Hàng cuối bảng 19.2 nói về ticket đang
 * chạy; nó không được vượt lên hai luật khác:
 *   - **19.3**: "Ticket đã Xong **không bị hạ**."
 *   - **mục 4 dòng 138** (+ `cau-hoi-spec.md` #18): mọi lần rời nhóm `closed`
 *     chỉ **chủ** làm được — mà `huy` lượt là đường **agent** người giao đi được.
 */
describe('SPEC 19.3 + mục 4 d.138 — huỷ lượt KHÔNG hạ ticket nhóm `closed`', () => {
  it('ticket đã **Xong** (nộp `done` + cổng đủ, lượt còn `submitted`) → huỷ lượt giữ `done`', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);

    // Cổng đủ + nộp `done`: ticket vào Xong, nhưng lượt `work` còn `submitted`.
    await chayLenhVoiCong(
      {
        loai: 'nop_bao_cao',
        workspace_id: WS,
        ai: {
          loai: 'agent',
          agent_id: AG.wk,
          vai_tro: 'worker',
          disabled: false,
          vao_tat_ca_du_an: false,
          du_an_duoc_vao: [P],
          du_an_minh_quan_ly: [],
          ghi_de: {},
        },
        luot_giao_id: lg,
        ket_qua: 'done',
      },
      CONG_DU_GIA,
    );
    expect(await trangThaiCua(TK)).toBe('done');

    // Người giao là **agent**, đi đường HTTP thật: không được hạ ticket.
    const res = await huy(TOKEN.mgr, lg, { ly_do: 'Dọn lượt treo' });
    expect(res.status).toBe(200);
    const than = await res.json<LuotRa>();
    expect(than.con_luot_mo).toBe(false);
    expect(than.ticket_trang_thai).toBe('done');
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('ticket đã **Huỷ** (chủ đổi tay, lượt còn `pending`) → agent huỷ lượt giữ `canceled`', async () => {
    const tao = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: AG.wk },
    });
    const { id: lg } = await tao.json<{ id: string }>();

    // Chỉ chủ hạ được ticket vào nhóm `closed` (mục 4 d.138).
    await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'canceled', ly_do: 'Không làm nữa' },
    });
    expect(await trangThaiCua(TK)).toBe('canceled');

    const res = await huy(TOKEN.mgr, lg, { ly_do: 'Ticket huỷ rồi' });
    expect(res.status).toBe(200);
    expect((await res.json<LuotRa>()).ticket_trang_thai).toBe('canceled');
    // Nếu không, agent người giao có cửa sau để mở lại ticket đã kết.
    expect(await trangThaiCua(TK)).toBe('canceled');
  });
});

describe('SPEC 19.11 — huỷ lượt `work` khi lượt `review` đang mở: review KHÔNG bị huỷ theo', () => {
  it('lượt review vẫn `pending` sau khi lượt work bị huỷ', async () => {
    const lg_work = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const tao = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: AG.rv, loai_luot: 'review' },
    });
    const { id: lg_review } = await tao.json<{ id: string }>();

    await huy(TOKEN.mgr, lg_work);

    expect((await luotTrongDb(lg_work))['trang_thai']).toBe('canceled');
    expect((await luotTrongDb(lg_review))['trang_thai']).toBe('pending');
  });

  it('lượt review đang `in_progress` cũng không bị đụng tới', async () => {
    const lg_work = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const lg_review = await giaoVaNhan(TK, AG.rv, TOKEN.rv, { loai_luot: 'review' });

    await huy(TOKEN.mgr, lg_work);

    const rv = await luotTrongDb(lg_review);
    expect(rv['trang_thai']).toBe('in_progress');
    expect(rv['dong_luc']).toBeNull();
  });

  it('và reviewer vẫn nộp được lượt review của mình sau đó', async () => {
    const lg_work = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const lg_review = await giaoVaNhan(TK, AG.rv, TOKEN.rv, { loai_luot: 'review' });
    await huy(TOKEN.mgr, lg_work);

    const res = await nop(TOKEN.rv, lg_review, { ket_qua: 'done' });
    expect(res.status).toBe(200);
  });
});

/* ================================================================== *
 * SPEC mục 5 — "Tạo ticket từ việc phát sinh"
 * ================================================================== */
describe('SPEC mục 5 — Tạo ticket từ việc phát sinh', () => {
  async function nopCoViecPhatSinh(viec: string): Promise<string> {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'partial', viec_phat_sinh: viec });
    return lg;
  }

  function taoTu(token: string, lg: string, than: Record<string, unknown> = {}): Promise<Response> {
    return goiApi(`/v1/luot-giao/${lg}/viec-phat-sinh/ticket`, token, { method: 'POST', than });
  }

  it('người giao tạo được ticket, tiêu đề lấy từ dòng đầu, mô tả là cả mục', async () => {
    const lg = await nopCoViecPhatSinh('- Tách cổng bằng chứng\nCần làm ở phần 3');
    const res = await taoTu(TOKEN.mgr, lg);
    expect(res.status).toBe(201);

    const than = await res.json<{ id: string; ma: string; tieu_de: string; trang_thai: string }>();
    expect(than.tieu_de).toBe('Tách cổng bằng chứng');
    expect(than.ma).toMatch(/^SAI-\d+$/);
    expect(than.trang_thai).toBe('todo');

    const t = await env.DB.prepare('SELECT mo_ta, project_id FROM ticket WHERE id = ?')
      .bind(than.id)
      .first<{ mo_ta: string; project_id: string }>();
    expect(t?.mo_ta).toContain('Cần làm ở phần 3');
    // Cùng dự án với ticket gốc.
    expect(t?.project_id).toBe(P);
  });

  it('tiêu đề truyền tay thì dùng tiêu đề đó', async () => {
    const lg = await nopCoViecPhatSinh('việc phát sinh dài dòng');
    const res = await taoTu(TOKEN.mgr, lg, { tieu_de: 'Tên do người giao đặt' });
    expect((await res.json<{ tieu_de: string }>()).tieu_de).toBe('Tên do người giao đặt');
  });

  it('**chỉ người giao**: người nhận gọi → 403', async () => {
    const lg = await nopCoViecPhatSinh('một việc');
    expect((await taoTu(TOKEN.wk, lg)).status).toBe(403);
  });

  it('agent ngoài cuộc → 403', async () => {
    const lg = await nopCoViecPhatSinh('một việc');
    expect((await taoTu(TOKEN.wk2, lg)).status).toBe(403);
  });

  it('lượt chưa nộp → 409 (chưa có báo cáo nào để lấy việc phát sinh)', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await taoTu(TOKEN.mgr, lg);
    expect(res.status).toBe(409);
  });

  it('báo cáo không có mục việc phát sinh → 422', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    const res = await taoTu(TOKEN.mgr, lg);
    expect(res.status).toBe(422);
  });

  it('dùng lại luật tạo ticket: số `MÃ-số` tăng dần, không tái dùng (SPEC mục 4)', async () => {
    const lg = await nopCoViecPhatSinh('việc A');
    const a = await taoTu(TOKEN.mgr, lg, { tieu_de: 'A' });
    const b = await taoTu(TOKEN.mgr, lg, { tieu_de: 'B' });
    const so_a = (await a.json<{ so: number }>()).so;
    const so_b = (await b.json<{ so: number }>()).so;
    expect(so_b).toBe(so_a + 1);
    // Ticket fixture đã chiếm số 1–3, nên ticket mới phải lớn hơn.
    expect(so_a).toBeGreaterThan(3);
  });

  it('vẫn qua bảng quyền "Tạo ticket": reviewer (ô "—") không tạo được dù là người giao', async () => {
    // Dựng thẳng trong DB một lượt do **reviewer** giao: bảng quyền mục 3 không
    // cho reviewer giao việc, nên không có đường HTTP nào dựng được ca này.
    await dungLuotGiao('lg-rv-giao', TK_3, AG.wk, {
      trang_thai: 'submitted',
      nguoi_giao_agent_id: AG.rv,
      ket_qua: 'partial',
      bc_viec_phat_sinh: 'việc phát sinh nào đó',
    });
    const res = await taoTu(TOKEN.rv, 'lg-rv-giao');
    expect(res.status).toBe(403);
  });
});

/* ================================================================== *
 * SPEC mục 5 + 14 — đường ĐỌC: chuỗi lượt có báo cáo và kết quả nghiệm thu
 * ================================================================== */
describe('SPEC mục 5 — "thấy cả chuỗi… kèm brief gì, kết quả ra sao"', () => {
  interface ChuoiRa {
    items: {
      id: string;
      so_luot: number;
      trang_thai: string;
      dang_mo: boolean;
      ly_do: string | null;
      nop_luc: number | null;
      bao_cao: Record<string, unknown> | null;
    }[];
  }

  it('chuỗi trả **báo cáo nộp** của lượt đã nộp', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, {
      ket_qua: 'partial',
      da_lam: 'Phần A',
      viec_phat_sinh: 'Phần B để sau',
    });

    const res = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN_CHU);
    const { items } = await res.json<ChuoiRa>();
    expect(items).toHaveLength(1);

    const bc = items[0]!.bao_cao!;
    expect(bc['ket_qua']).toBe('partial');
    expect(bc['nhan_ket_qua']).toBe('Xong một phần');
    expect(bc['da_lam']).toBe('Phần A');
    expect(bc['viec_phat_sinh']).toBe('Phần B để sau');
    expect(bc['kiem_chung']).toBeNull();
    expect(items[0]!.nop_luc).toBeTypeOf('number');
  });

  it('lượt chưa nộp thì `bao_cao` là null (không dựng báo cáo rỗng giả)', async () => {
    await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    const res = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN_CHU);
    const { items } = await res.json<ChuoiRa>();
    expect(items[0]!.bao_cao).toBeNull();
  });

  it('chuỗi trả **kết quả nghiệm thu**: trạng thái + lý do trả lại, cả hai lượt', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'Chưa có test 19.11' });

    const res = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN_CHU);
    const { items } = await res.json<ChuoiRa>();
    expect(items).toHaveLength(2);

    expect(items[0]!.so_luot).toBe(1);
    expect(items[0]!.trang_thai).toBe('returned');
    expect(items[0]!.ly_do).toBe('Chưa có test 19.11');
    expect(items[0]!.dang_mo).toBe(false);

    expect(items[1]!.so_luot).toBe(2);
    expect(items[1]!.trang_thai).toBe('pending');
    expect(items[1]!.dang_mo).toBe(true);
  });
});

/* ================================================================== *
 * SPEC mục 4 — lịch sử của mọi thay đổi
 * ================================================================== */
describe('SPEC mục 4 — mỗi lần nộp / nghiệm thu / huỷ đều để lại dấu vết ai làm', () => {
  async function lichSu(ticket_id: string): Promise<{ truong: string; tac_gia_agent_id: string | null; gia_tri_moi: string | null }[]> {
    const { results } = await env.DB.prepare(
      'SELECT truong, tac_gia_agent_id, gia_tri_moi FROM ticket_history WHERE ticket_id = ? ORDER BY luc, rowid',
    )
      .bind(ticket_id)
      .all<{ truong: string; tac_gia_agent_id: string | null; gia_tri_moi: string | null }>();
    return results;
  }

  it('nộp ghi dòng lượt giao (người làm = người nhận) và dòng trạng thái ticket', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'blocked' });

    const ds = await lichSu(TK);
    const dong_luot = ds.filter((d) => d.truong === `luot_giao:${lg}`);
    expect(dong_luot.at(-1)).toMatchObject({
      gia_tri_moi: 'submitted',
      tac_gia_agent_id: AG.wk,
    });
    expect(ds.some((d) => d.truong === 'trang_thai' && d.gia_tri_moi === 'todo')).toBe(true);
  });

  it('nghiệm thu ghi người làm = **người giao**', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'accepted' });

    const ds = await lichSu(TK);
    const dong = ds.filter((d) => d.truong === `luot_giao:${lg}`).at(-1);
    expect(dong).toMatchObject({ gia_tri_moi: 'accepted', tac_gia_agent_id: AG.mgr });
  });

  it('huỷ ghi dòng `canceled`', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await huy(TOKEN.mgr, lg);
    const ds = await lichSu(TK);
    expect(ds.some((d) => d.truong === `luot_giao:${lg}` && d.gia_tri_moi === 'canceled')).toBe(
      true,
    );
  });
});

/* ================================================================== *
 * SPEC 19.2 — ticket cha, ticket con, ticket điều phối vẫn đúng khi nộp
 * ================================================================== */
describe('SPEC 19.2 × 19.4 × 19.11 — nộp đi đúng đường của `apDungLuat`, không viết lại luật', () => {
  it('ticket cha còn con chưa kết: nộp `done` dừng ở Chờ kiểm chứng (mục 4 CHILDREN_OPEN)', async () => {
    await dungLienKet(TK, TK_2, 'parent');
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);

    // Cổng ĐỦ, nhưng con chưa kết → vẫn không vào Xong.
    const { ket_qua } = await chayLenhVoiCong(
      {
        loai: 'nop_bao_cao',
        workspace_id: WS,
        ai: {
          loai: 'agent',
          agent_id: AG.wk,
          vai_tro: 'worker',
          disabled: false,
          vao_tat_ca_du_an: false,
          du_an_duoc_vao: [P],
          du_an_minh_quan_ly: [],
          ghi_de: {},
        },
        luot_giao_id: lg,
        ket_qua: 'done',
      },
      CONG_DU_GIA,
    );
    expect((ket_qua as LuotRa).ticket_trang_thai).toBe('verifying');
  });

  /*
   * TK_3 là **ticket điều phối**, nối `dieu_phoi` tới ticket dự án TK (SPEC
   * 19.4). Đưa TK_3 về `in_progress` bằng `baton status` — đường lan toả của
   * `baton status` đã có từ phần 1 và đã có test riêng; ở đây chỉ cần một trạng
   * thái xuất phát đúng để đo **đường lan toả của lệnh nộp**.
   */
  async function dungDieuPhoi(): Promise<void> {
    await dungLienKet(TK_3, TK, 'dieu_phoi');
    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN.mgr, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua(TK_3)).toBe('in_progress');
  }

  it('19.4 — nộp `done` (cổng đủ) làm ticket dự án Xong, và **ticket điều phối theo**', async () => {
    await dungDieuPhoi();
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);

    await chayLenhVoiCong(
      {
        loai: 'nop_bao_cao',
        workspace_id: WS,
        ai: {
          loai: 'agent',
          agent_id: AG.wk,
          vai_tro: 'worker',
          disabled: false,
          vao_tat_ca_du_an: false,
          du_an_duoc_vao: [P],
          du_an_minh_quan_ly: [],
          ghi_de: {},
        },
        luot_giao_id: lg,
        ket_qua: 'done',
      },
      CONG_DU_GIA,
    );

    expect(await trangThaiCua(TK)).toBe('done');
    // "Tất cả đã kết, và ít nhất 1 Xong: **Xong**" — SPEC 19.4.
    expect(await trangThaiCua(TK_3)).toBe('done');
  });

  it('19.11 — nộp `blocked`: ticket dự án về Cần làm, ticket điều phối **giữ nguyên**', async () => {
    await dungDieuPhoi();
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);

    await nop(TOKEN.wk, lg, { ket_qua: 'blocked' });

    expect(await trangThaiCua(TK)).toBe('todo');
    // 19.11: chưa có ticket dự án nào `active`, và chưa phải tất cả đã kết →
    // ticket điều phối giữ trạng thái hiện tại.
    expect(await trangThaiCua(TK_3)).toBe('in_progress');
  });
});

/* ================================================================== *
 * SPEC 19.5 — tỉ lệ đạt lần đầu (hàm thuần, giờ tiêm vào)
 * ================================================================== */
describe('SPEC 19.5 — tỉ lệ đạt lần đầu', () => {
  const BAY_GIO = 1_800_000_000_000;
  const TRONG = BAY_GIO - 10 * 24 * 60 * 60 * 1000;
  const NGOAI = BAY_GIO - CUA_SO_DAT_LAN_DAU_MS - 1;

  function luot(p: Partial<LuotChoTiLe> & { ticket_id: string }): LuotChoTiLe {
    return {
      loai: 'work',
      trang_thai: 'accepted',
      so_luot: 1,
      nop_luc: TRONG,
      ...p,
    };
  }

  it('lượt đầu `accepted` → 1/1', () => {
    expect(tiLeDatLanDau([luot({ ticket_id: 'tk-1' })], BAY_GIO)).toEqual({
      dat: 1,
      da_nop: 1,
      ti_le: 1,
    });
  });

  it('**ca biên**: nộp → bị trả lại → lần 2 mới đạt ⇒ KHÔNG tính đạt lần đầu', () => {
    const kq = tiLeDatLanDau(
      [
        luot({ ticket_id: 'tk-1', so_luot: 1, trang_thai: 'returned' }),
        luot({ ticket_id: 'tk-1', so_luot: 2, trang_thai: 'accepted' }),
      ],
      BAY_GIO,
    );
    expect(kq).toEqual({ dat: 0, da_nop: 1, ti_le: 0 });
  });

  it('thứ tự dữ liệu không đổi kết quả (lượt 2 tới trước lượt 1)', () => {
    const kq = tiLeDatLanDau(
      [
        luot({ ticket_id: 'tk-1', so_luot: 2, trang_thai: 'accepted' }),
        luot({ ticket_id: 'tk-1', so_luot: 1, trang_thai: 'returned' }),
      ],
      BAY_GIO,
    );
    expect(kq.dat).toBe(0);
  });

  it('**ca biên**: ticket đã nộp nhưng CHƯA nghiệm thu ⇒ vào mẫu số, không vào tử số', () => {
    const kq = tiLeDatLanDau([luot({ ticket_id: 'tk-1', trang_thai: 'submitted' })], BAY_GIO);
    expect(kq).toEqual({ dat: 0, da_nop: 1, ti_le: 0 });
  });

  it('**ca biên**: ticket nộp NGOÀI cửa sổ 30 ngày ⇒ không tính vào đâu cả', () => {
    const kq = tiLeDatLanDau([luot({ ticket_id: 'tk-cu', nop_luc: NGOAI })], BAY_GIO);
    expect(kq).toEqual({ dat: 0, da_nop: 0, ti_le: null });
  });

  it('đúng mốc 30 ngày chẵn vẫn tính', () => {
    const kq = tiLeDatLanDau(
      [luot({ ticket_id: 'tk-1', nop_luc: BAY_GIO - CUA_SO_DAT_LAN_DAU_MS })],
      BAY_GIO,
    );
    expect(kq.da_nop).toBe(1);
  });

  it('lượt CHƯA nộp bao giờ (`nop_luc` null) không vào mẫu số', () => {
    const kq = tiLeDatLanDau(
      [luot({ ticket_id: 'tk-1', trang_thai: 'pending', nop_luc: null })],
      BAY_GIO,
    );
    expect(kq).toEqual({ dat: 0, da_nop: 0, ti_le: null });
  });

  it('lượt `review` KHÔNG tính (SPEC viết thẳng "lượt `work`")', () => {
    const kq = tiLeDatLanDau([luot({ ticket_id: 'tk-1', loai: 'review' })], BAY_GIO);
    expect(kq).toEqual({ dat: 0, da_nop: 0, ti_le: null });
  });

  it('mẫu số là **ticket**, không phải lượt: nộp 3 lần trên 1 ticket vẫn là 1', () => {
    const kq = tiLeDatLanDau(
      [
        luot({ ticket_id: 'tk-1', so_luot: 1, trang_thai: 'returned' }),
        luot({ ticket_id: 'tk-1', so_luot: 2, trang_thai: 'returned' }),
        luot({ ticket_id: 'tk-1', so_luot: 3, trang_thai: 'accepted' }),
      ],
      BAY_GIO,
    );
    expect(kq.da_nop).toBe(1);
  });

  it('hai ticket, một đạt lần đầu → 1/2 = 0.5', () => {
    const kq = tiLeDatLanDau(
      [
        luot({ ticket_id: 'tk-1', trang_thai: 'accepted' }),
        luot({ ticket_id: 'tk-2', so_luot: 1, trang_thai: 'returned' }),
        luot({ ticket_id: 'tk-2', so_luot: 2, trang_thai: 'accepted' }),
      ],
      BAY_GIO,
    );
    expect(kq).toEqual({ dat: 1, da_nop: 2, ti_le: 0.5 });
  });

  it('không có gì để tính → `ti_le` là **null**, không phải 0', () => {
    expect(tiLeDatLanDau([], BAY_GIO).ti_le).toBeNull();
  });

  it('hàm thuần: KHÔNG gọi `Date.now()` — đổi `bay_gio` là đổi kết quả', () => {
    const ds = [luot({ ticket_id: 'tk-1', nop_luc: BAY_GIO - 20 * 24 * 60 * 60 * 1000 })];
    expect(tiLeDatLanDau(ds, BAY_GIO).da_nop).toBe(1);
    // Nhìn từ 40 ngày sau, cùng dữ liệu đó đã ra khỏi cửa sổ.
    expect(tiLeDatLanDau(ds, BAY_GIO + 40 * 24 * 60 * 60 * 1000).da_nop).toBe(0);
  });

  it('qua DB thật: nộp rồi nghiệm thu đạt → 1/1 ở `tiLeDatLanDauCuaAgent`', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'accepted' });

    const kq = await tiLeDatLanDauCuaAgent(env.DB, WS, AG.wk, Date.now());
    expect(kq).toEqual({ dat: 1, da_nop: 1, ti_le: 1 });
  });

  it('qua DB thật: bị trả lại rồi lần 2 đạt → 0/1', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    const r = await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'returned', ly_do: 'làm lại' });
    const lg2 = (await r.json<LuotRa>()).luot_moi!.id;

    await goiApi(`/v1/luot-giao/${lg2}/nhan`, TOKEN.wk, { method: 'POST' });
    await nop(TOKEN.wk, lg2, { ket_qua: 'done' });
    await nghiemThu(TOKEN.mgr, lg2, { ket_qua: 'accepted' });

    expect(await tiLeDatLanDauCuaAgent(env.DB, WS, AG.wk, Date.now())).toEqual({
      dat: 0,
      da_nop: 1,
      ti_le: 0,
    });
  });

  it('hiện ở **trang agent** (SPEC mục 3) — `layAgent` trả `ti_le_dat_lan_dau`', async () => {
    const lg = await giaoVaNhan(TK, AG.wk, TOKEN.wk);
    await nop(TOKEN.wk, lg, { ket_qua: 'done' });
    await nghiemThu(TOKEN.mgr, lg, { ket_qua: 'accepted' });

    const ra = await layAgent(env.DB, CHU, WS, AG.wk, Date.now());
    expect(ra.ti_le_dat_lan_dau).toEqual({ dat: 1, da_nop: 1, ti_le: 1 });
  });

  it('trang agent của người chưa nhận việc bao giờ: `ti_le` null, không vỡ', async () => {
    const ra = await layAgent(env.DB, CHU, WS, AG.wk2, Date.now());
    expect(ra.ti_le_dat_lan_dau).toEqual({ dat: 0, da_nop: 0, ti_le: null });
  });
});

/* ================================================================== *
 * SPEC 19.5 — hai hàm thuần phụ trợ
 * ================================================================== */
describe('SPEC 19.5 — hàm thuần dựng brief và hạn của lượt mới', () => {
  it('`briefCongLyDoTraLai` đặt khối mới ở ĐẦU, giữ nguyên brief cũ', () => {
    const ra = briefCongLyDoTraLai('Mục tiêu cũ', 'vì thiếu test');
    expect(ra.startsWith(TIEU_DE_LY_DO_TRA_LAI)).toBe(true);
    expect(ra.indexOf('vì thiếu test')).toBeLessThan(ra.indexOf('Mục tiêu cũ'));
  });

  // 19.12 câu 35: chữ chốt là khối `Lý do trả lại: <lý do>` — một dòng, hai chấm
  // rồi lý do. Ca này canh **đúng chữ** đó, không chỉ canh "ở đầu".
  it('19.12 câu 35 — khối đúng định dạng `Lý do trả lại: <lý do>`', () => {
    expect(TIEU_DE_LY_DO_TRA_LAI).toBe('Lý do trả lại:');
    expect(briefCongLyDoTraLai('Mục tiêu cũ', 'vì thiếu test')).toBe(
      'Lý do trả lại: vì thiếu test\n\nMục tiêu cũ',
    );
  });

  it('`briefCongLyDoTraLai` với brief cũ rỗng: chỉ còn khối mới, không có dòng trắng thừa', () => {
    expect(briefCongLyDoTraLai(null, 'lý do')).toBe('Lý do trả lại: lý do');
  });

  it('`hanPhanHoiApLai` giữ đúng khoảng của lượt cũ, tính từ lúc trả lại', () => {
    const cu = { tao_luc: 1000, han_phan_hoi_luc: 1000 + 15 * 60_000 };
    expect(hanPhanHoiApLai(cu, 9_000_000)).toBe(9_000_000 + 15 * 60_000);
  });

  it('`hanPhanHoiApLai` của lượt không đặt hạn vẫn là không đặt hạn', () => {
    expect(hanPhanHoiApLai({ tao_luc: 1000, han_phan_hoi_luc: null }, 9_000_000)).toBeNull();
  });

  it('`hanPhanHoiApLai` không bao giờ sinh ra hạn đã qua (dữ liệu cũ hỏng)', () => {
    const cu = { tao_luc: 5000, han_phan_hoi_luc: 1000 };
    expect(hanPhanHoiApLai(cu, 9_000_000)).toBeGreaterThan(9_000_000);
  });
});

/* ================================================================== *
 * migration 0005 — luật ép ở tầng DB
 * ================================================================== */
describe('migration 0005 — `ket_qua` chỉ nhận 3 mã của SPEC mục 0.1', () => {
  it('CHECK của DB từ chối mã lạ, kể cả khi lách qua cửa ghi', async () => {
    await dungLuotGiao('lg-check', TK, AG.wk, { trang_thai: 'in_progress' });
    await expect(
      env.DB.prepare("UPDATE luot_giao SET ket_qua = 'xong' WHERE id = ?").bind('lg-check').run(),
    ).rejects.toThrow();
  });

  it('ba mã hợp lệ thì ghi được', async () => {
    await dungLuotGiao('lg-ok', TK, AG.wk, { trang_thai: 'in_progress' });
    for (const ma of ['done', 'partial', 'blocked']) {
      await env.DB.prepare('UPDATE luot_giao SET ket_qua = ? WHERE id = ?').bind(ma, 'lg-ok').run();
      const d = await luotTrongDb('lg-ok');
      expect(d['ket_qua']).toBe(ma);
    }
  });
});
