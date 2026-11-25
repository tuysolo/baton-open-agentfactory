/**
 * **Lượt giao** — SPEC mục 5, 19.1, 19.3, 19.5.
 *
 * Mỗi luật của mục 5 có một ca riêng, và tên ca ghi đúng chữ của SPEC để đối
 * chiếu được. Những luật nào ép được ở tầng DB thì có thêm một ca gọi thẳng
 * `env.DB` — hai tầng hàng rào, như migration 0004 đã khai.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  HAN_PHAN_HOI_MAC_DINH_PHUT,
  laKhongPhanHoi,
  nguoiDangCam,
} from '@baton/shared';
import {
  TOKEN_CHU,
  WS,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungLuotGiao,
  dungTicket,
  dungWorkspace,
  goiApi,
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
const P_TAM_DUNG = 'pj-PAU';
const P_LUU = 'pj-ARC';
const P_NGOAI = 'pj-OUT';

const TK = 'tk-pj-SAI-1';
const TK_2 = 'tk-pj-SAI-2';
const TK_NGOAI = 'tk-pj-OUT-1';
const TK_TAM_DUNG = 'tk-pj-PAU-1';
const TK_LUU = 'tk-pj-ARC-1';

const AG = {
  coord: 'ag-coord',
  mgr: 'ag-mgr',
  wk: 'ag-wk',
  wk2: 'ag-wk2',
  rv: 'ag-rv',
  tat: 'ag-tat',
  ngoai: 'ag-ngoai',
} as const;

const TOKEN = {
  coord: 'bt_lg_coord',
  mgr: 'bt_lg_mgr',
  wk: 'bt_lg_wk',
  wk2: 'bt_lg_wk2',
  rv: 'bt_lg_rv',
} as const;

beforeEach(async () => {
  await dungWorkspace();

  await dungAgentCoToken({ id: AG.coord, ten: 'CoS', vai_tro: 'coordinator', token: TOKEN.coord });
  await dungAgentCoToken({ id: AG.mgr, ten: 'M-Sample', vai_tro: 'manager', token: TOKEN.mgr });
  await dungAgentCoToken({ id: AG.wk, ten: 'W-builder', vai_tro: 'worker', token: TOKEN.wk });
  await dungAgentCoToken({ id: AG.wk2, ten: 'W-builder-2', vai_tro: 'worker', token: TOKEN.wk2 });
  await dungAgentCoToken({ id: AG.rv, ten: 'W-reviewer', vai_tro: 'reviewer', token: TOKEN.rv });
  await dungAgentCoToken({
    id: AG.tat,
    ten: 'W-da-tat',
    vai_tro: 'worker',
    token: 'bt_lg_tat',
    disabled: true,
    // Vào **mọi** dự án: bị từ chối thì phải vì `disabled`, không vì cửa dự án.
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({
    id: AG.ngoai,
    ten: 'W-ngoai-du-an',
    vai_tro: 'worker',
    token: 'bt_lg_ngoai',
  });

  await dungDuAn('SAI', 'Sample', 'active', AG.mgr);
  await dungDuAn('PAU', 'Dự án tạm dừng', 'paused');
  await dungDuAn('ARC', 'Dự án lưu trữ', 'archived');
  await dungDuAn('OUT', 'Dự án ngoài phạm vi', 'active');

  for (const id of [AG.coord, AG.mgr, AG.wk, AG.wk2, AG.rv]) {
    await choVaoDuAn(id, P);
    await choVaoDuAn(id, P_TAM_DUNG);
    await choVaoDuAn(id, P_LUU);
  }

  await dungTicket(P, 1, 'Việc để giao', { trang_thai: 'todo' });
  await dungTicket(P, 2, 'Việc thứ hai', { trang_thai: 'todo' });
  await dungTicket(P_NGOAI, 1, 'Việc ngoài phạm vi');
  await dungTicket(P_TAM_DUNG, 1, 'Việc trong dự án tạm dừng');
  await dungTicket(P_LUU, 1, 'Việc trong dự án lưu trữ');
});

/** `baton assign` qua HTTP (SPEC mục 13). */
function giao(
  token: string,
  ticket_id: string,
  nguoi_nhan_agent_id: string,
  them: Record<string, unknown> = {},
): Promise<Response> {
  return goiApi(`/v1/ticket/${ticket_id}/luot-giao`, token, {
    method: 'POST',
    than: { nguoi_nhan_agent_id, ...them },
  });
}

/** `baton claim` qua HTTP. */
function nhan(token: string, luot_giao_id: string): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/nhan`, token, { method: 'POST' });
}

async function than<T>(res: Response): Promise<T> {
  return res.json<T>();
}

interface LuotRa {
  id: string;
  so_luot: number;
  loai: string;
  trang_thai: string;
  han_phan_hoi_luc: number | null;
  ticket_trang_thai: string;
}

/* ================================================================== *
 * SPEC mục 5 — "Luật"
 * ================================================================== */
describe('SPEC mục 5 — ai tạo được lượt giao', () => {
  it('agent `worker` KHÔNG tạo được lượt giao → FORBIDDEN', async () => {
    const res = await giao(TOKEN.wk, TK, AG.wk2);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('agent `reviewer` KHÔNG tạo được lượt giao → FORBIDDEN', async () => {
    const res = await giao(TOKEN.rv, TK, AG.wk);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('`manager` giao được cho worker trong dự án; `coordinator` cũng giao được', async () => {
    expect((await giao(TOKEN.mgr, TK, AG.wk)).status).toBe(201);
    expect((await giao(TOKEN.coord, TK_2, AG.wk2)).status).toBe(201);
  });

  it('chủ giao được (SPEC mục 5: "người giao (chủ hoặc agent có quyền)")', async () => {
    expect((await giao(TOKEN_CHU, TK, AG.wk)).status).toBe(201);
  });

  it('`manager` KHÔNG giao được cho `manager` (bảng quyền mục 3: worker, reviewer)', async () => {
    await dungAgentCoToken({
      id: 'ag-mgr-2',
      ten: 'M-khac',
      vai_tro: 'manager',
      token: 'bt_lg_mgr2',
    });
    await choVaoDuAn('ag-mgr-2', P);
    const res = await giao(TOKEN.mgr, TK, 'ag-mgr-2');
    expect(res.status).toBe(403);
  });
});

describe('SPEC mục 5 — người nhận', () => {
  it('KHÔNG giao cho agent đang `disabled` → FORBIDDEN', async () => {
    const res = await giao(TOKEN_CHU, TK, AG.tat);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('KHÔNG giao cho agent không có quyền vào dự án đó → FORBIDDEN', async () => {
    const res = await giao(TOKEN_CHU, TK, AG.ngoai);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('KHÔNG giao cho chính mình → FORBIDDEN', async () => {
    // Chủ mở ô "Giao việc" cho worker để lệnh đi qua được bảng quyền; luật "không
    // giao cho chính mình" vẫn phải chặn — nó là luật riêng của mục 5.
    await goiApi(`/v1/agent/${AG.wk}/quyen/assign`, TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'co' },
    });
    const res = await giao(TOKEN.wk, TK, AG.wk);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });

    // Đối chứng: cùng token đó giao cho **người khác** thì qua.
    expect((await giao(TOKEN.wk, TK, AG.wk2)).status).toBe(201);
  });

  it('người nhận không tồn tại → NOT_FOUND', async () => {
    const res = await giao(TOKEN_CHU, TK, 'ag-khong-co-that');
    expect(res.status).toBe(404);
  });
});

/*
 * BAT-48 — **agent ngoài phạm vi người gọi = không tồn tại** (SPEC mục 13 d.399
 * "404 … cũng dùng khi đối tượng ngoài phạm vi, để không lộ sự tồn tại"; 19.12
 * câu 15 "cả hai ca phải ra phản hồi giống hệt nhau"; `spec-questions.md` #172).
 *
 * Phạm vi "agent nào được thấy" là của `GET /v1/agent` (`locPhamViAgent`): chính
 * mình, agent chung ít nhất một dự án, agent `vao_tat_ca_du_an`; chủ và agent
 * `vao_tat_ca_du_an` thấy mọi agent.
 */
describe('BAT-48 — giao cho agent ngoài phạm vi người gọi: giống hệt agent không tồn tại', () => {
  /** Chỉ vào `pj-OUT` — không chung dự án nào với `ag-mgr`. */
  const X = 'ag-x-ngoai';
  /** Như X nhưng **đã tắt**: không được lộ trạng thái tắt. */
  const X_TAT = 'ag-x-ngoai-tat';
  /** Chung `pj-PAU` với `ag-mgr` (thấy được) nhưng không vào `pj-SAI` của TK. */
  const Y = 'ag-y-chung-pau';
  const KHONG_CO = 'ag-khong-co-that';

  beforeEach(async () => {
    await dungAgentCoToken({ id: X, ten: 'W-x', vai_tro: 'worker', token: 'bt_lg_x', du_an: [P_NGOAI] });
    await dungAgentCoToken({
      id: X_TAT,
      ten: 'W-x-tat',
      vai_tro: 'worker',
      token: 'bt_lg_x_tat',
      disabled: true,
      du_an: [P_NGOAI],
    });
    await dungAgentCoToken({ id: Y, ten: 'W-y', vai_tro: 'worker', token: 'bt_lg_y', du_an: [P_TAM_DUNG] });
  });

  /** Toàn bộ phản hồi lỗi mà người gọi nhìn thấy: status, kiểu nội dung, thân. */
  async function phanHoi(res: Response): Promise<{ status: number; kieu: string | null; than: unknown }> {
    return { status: res.status, kieu: res.headers.get('content-type'), than: await res.json() };
  }

  it('manager giao cho agent chỉ ở dự án khác → 404 NOT_FOUND, GIỐNG HỆT id không tồn tại', async () => {
    const ngoai = await phanHoi(await giao(TOKEN.mgr, TK, X));
    const khong_co = await phanHoi(await giao(TOKEN.mgr, TK, KHONG_CO));

    expect(ngoai.status).toBe(404);
    expect(ngoai.than).toMatchObject({ error: 'NOT_FOUND' });
    // Cùng mã, cùng thông điệp từng ký tự, cùng HTTP, cùng mọi trường của thân.
    expect(ngoai).toEqual(khong_co);
  });

  it('agent ngoài phạm vi mà ĐÃ TẮT → vẫn 404 giống hệt (không lộ trạng thái tắt)', async () => {
    const tat = await phanHoi(await giao(TOKEN.mgr, TK, X_TAT));
    const khong_co = await phanHoi(await giao(TOKEN.mgr, TK, KHONG_CO));
    expect(tat.status).toBe(404);
    expect(tat).toEqual(khong_co);
  });

  it('giống hệt cả khi ticket nằm trong dự án của chính người nhận (không phép kiểm nào chạy trước làm lệch)', async () => {
    // `ag-mgr` không vào `pj-OUT`: phép kiểm ticket/quyền không được chen trước
    // và cho hai ca hai phản hồi khác nhau. Ticket ngoài dự án của người gọi
    // không được lộ, nhưng hai ca agent vẫn phải trùng nhau.
    const ngoai = await phanHoi(await giao(TOKEN.mgr, TK_NGOAI, X));
    const khong_co = await phanHoi(await giao(TOKEN.mgr, TK_NGOAI, KHONG_CO));
    expect(ngoai).toEqual(khong_co);
  });

  it('worker (không có quyền giao) gõ id ngoài phạm vi hay id bịa: cũng giống hệt', async () => {
    const ngoai = await phanHoi(await giao(TOKEN.wk, TK, X));
    const khong_co = await phanHoi(await giao(TOKEN.wk, TK, KHONG_CO));
    expect(ngoai).toEqual(khong_co);
  });

  it('agent THẤY ĐƯỢC (chung dự án) nhưng không vào dự án của ticket → vẫn FORBIDDEN (SPEC mục 5)', async () => {
    const res = await giao(TOKEN.mgr, TK, Y);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: 'FORBIDDEN',
      message: 'Người nhận không được vào dự án của ticket này.',
    });
  });

  it('agent THẤY ĐƯỢC mà đã tắt → vẫn FORBIDDEN (agent `vao_tat_ca_du_an` ai cũng thấy)', async () => {
    const res = await giao(TOKEN.mgr, TK, AG.tat);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: 'FORBIDDEN',
      message: 'Không giao việc cho agent đã bị tắt.',
    });
  });

  it('chủ thấy mọi agent: giao cho X trên ticket dự án của X → 201', async () => {
    const res = await giao(TOKEN_CHU, TK_NGOAI, X);
    expect(res.status).toBe(201);
    expect(await than<{ nguoi_nhan_agent_id: string }>(res)).toMatchObject({
      nguoi_nhan_agent_id: X,
    });
  });

  it('chủ giao cho agent đã tắt (ngoài mọi phạm vi agent) → vẫn FORBIDDEN như cũ', async () => {
    const res = await giao(TOKEN_CHU, TK_NGOAI, X_TAT);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: 'FORBIDDEN',
      message: 'Không giao việc cho agent đã bị tắt.',
    });
  });

  it('agent `vao_tat_ca_du_an` thấy mọi agent: X ra lỗi của luật (FORBIDDEN), giao đúng dự án thì 201', async () => {
    await dungAgentCoToken({
      id: 'ag-coord-all',
      ten: 'CoS-moi-du-an',
      vai_tro: 'coordinator',
      token: 'bt_lg_coord_all',
      vao_tat_ca_du_an: true,
    });

    // Thấy X ⇒ không phải NOT_FOUND, mà là luật "không vào dự án" của mục 5.
    const sai_du_an = await giao('bt_lg_coord_all', TK, X);
    expect(sai_du_an.status).toBe(403);
    expect(await sai_du_an.json()).toMatchObject({
      error: 'FORBIDDEN',
      message: 'Người nhận không được vào dự án của ticket này.',
    });
    // Thấy X_TAT ⇒ luật "đã tắt".
    const tat = await giao('bt_lg_coord_all', TK_NGOAI, X_TAT);
    expect(tat.status).toBe(403);
    expect(await tat.json()).toMatchObject({ message: 'Không giao việc cho agent đã bị tắt.' });

    expect((await giao('bt_lg_coord_all', TK_NGOAI, X)).status).toBe(201);
  });

  it('agent cùng dự án với X thì thấy X: giao được (phạm vi là "chung dự án", không phải "cùng ticket")', async () => {
    await dungAgentCoToken({
      id: 'ag-mgr-out',
      ten: 'M-out',
      vai_tro: 'manager',
      token: 'bt_lg_mgr_out',
      du_an: [P_NGOAI],
    });
    expect((await giao('bt_lg_mgr_out', TK_NGOAI, X)).status).toBe(201);
  });
});

describe('SPEC mục 5 + 19.1 — tối đa 1 lượt mở, trừ lượt review song song', () => {
  it('đã có 1 lượt `work` mở thì không tạo thêm lượt `work` → 409 ASSIGNMENT_OPEN', async () => {
    expect((await giao(TOKEN_CHU, TK, AG.wk)).status).toBe(201);
    const res = await giao(TOKEN_CHU, TK, AG.wk2);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'ASSIGNMENT_OPEN' });
  });

  it('lượt `review` vẫn mở SONG SONG được với lượt `work` đang mở', async () => {
    expect((await giao(TOKEN_CHU, TK, AG.wk)).status).toBe(201);
    expect((await giao(TOKEN_CHU, TK, AG.rv, { loai_luot: 'review' })).status).toBe(201);
  });

  it('nhưng hai lượt `review` mở cùng lúc thì không → 409', async () => {
    expect((await giao(TOKEN_CHU, TK, AG.rv, { loai_luot: 'review' })).status).toBe(201);
    const res = await giao(TOKEN_CHU, TK, AG.wk2, { loai_luot: 'review' });
    expect(res.status).toBe(409);
  });

  it('lượt `in_progress` vẫn là lượt MỞ (SPEC 19.1), nên vẫn chặn', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    expect((await nhan(TOKEN.wk, tao.id)).status).toBe(200);
    expect((await giao(TOKEN_CHU, TK, AG.wk2)).status).toBe(409);
  });

  it('lượt đã đóng thì KHÔNG chặn nữa (mở lại được lượt mới)', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    await env.DB.prepare("UPDATE luot_giao SET trang_thai = 'canceled' WHERE id = ?")
      .bind(tao.id)
      .run();
    expect((await giao(TOKEN_CHU, TK, AG.wk2)).status).toBe(201);
  });

  it('tầng DB: index `ux_luot_giao_mo` chặn hai lượt `work` mở, kể cả ghi thẳng', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk);
    await expect(dungLuotGiao('lg-2', TK, AG.wk2)).rejects.toThrow();
    // Lượt `review` thì vẫn chèn được: index gồm cả `loai`.
    await expect(dungLuotGiao('lg-3', TK, AG.rv, { loai: 'review' })).resolves.toBe('lg-3');
  });
});

describe('SPEC 19.5 — số lượt tăng dần trong phạm vi ticket, không tái dùng', () => {
  it('số lượt tăng dần và KHÔNG tái dùng số của lượt đã đóng', async () => {
    const mot = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    expect(mot.so_luot).toBe(1);

    const hai = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.rv, { loai_luot: 'review' }));
    expect(hai.so_luot).toBe(2);

    await env.DB.prepare("UPDATE luot_giao SET trang_thai = 'canceled' WHERE id = ?")
      .bind(mot.id)
      .run();

    const ba = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk2));
    expect(ba.so_luot).toBe(3);
  });

  it('số lượt là của RIÊNG từng ticket', async () => {
    const a = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    const b = await than<LuotRa>(await giao(TOKEN_CHU, TK_2, AG.wk));
    expect(a.so_luot).toBe(1);
    expect(b.so_luot).toBe(1);
  });

  it('tầng DB: `ux_luot_giao_so` chặn hai lượt cùng số trên một ticket', async () => {
    await dungLuotGiao('lg-a', TK, AG.wk, { so_luot: 1, trang_thai: 'accepted' });
    await expect(
      dungLuotGiao('lg-b', TK, AG.wk2, { so_luot: 1, trang_thai: 'accepted' }),
    ).rejects.toThrow();
  });
});

describe('SPEC mục 5 — brief của lượt', () => {
  beforeEach(async () => {
    await env.DB.prepare('UPDATE ticket SET muc_tieu = ?, dieu_cam = ? WHERE id = ?')
      .bind('Mục tiêu của ticket', 'Không xoá file', TK)
      .run();
  });

  it('brief LẤY TỪ TICKET khi lệnh không truyền', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    const d = await env.DB.prepare('SELECT muc_tieu, dieu_cam FROM luot_giao WHERE id = ?')
      .bind(tao.id)
      .first<{ muc_tieu: string | null; dieu_cam: string | null }>();
    expect(d?.muc_tieu).toBe('Mục tiêu của ticket');
    expect(d?.dieu_cam).toBe('Không xoá file');
  });

  it('brief GHI ĐÈ RIÊNG cho lượt này, không đụng brief của ticket', async () => {
    const tao = await than<LuotRa>(
      await giao(TOKEN_CHU, TK, AG.wk, { muc_tieu: 'Mục tiêu riêng của lượt' }),
    );
    const luot = await env.DB.prepare('SELECT muc_tieu, dieu_cam FROM luot_giao WHERE id = ?')
      .bind(tao.id)
      .first<{ muc_tieu: string | null; dieu_cam: string | null }>();
    expect(luot?.muc_tieu).toBe('Mục tiêu riêng của lượt');
    // Trường không ghi đè vẫn lấy từ ticket.
    expect(luot?.dieu_cam).toBe('Không xoá file');

    const tk = await env.DB.prepare('SELECT muc_tieu FROM ticket WHERE id = ?')
      .bind(TK)
      .first<{ muc_tieu: string | null }>();
    expect(tk?.muc_tieu).toBe('Mục tiêu của ticket');
  });
});

describe('SPEC mục 5 — hạn phản hồi (mặc định 15 phút)', () => {
  it('mặc định là 15 phút kể từ lúc giao', async () => {
    const truoc = Date.now();
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    const sau = Date.now();

    expect(HAN_PHAN_HOI_MAC_DINH_PHUT).toBe(15);
    expect(tao.han_phan_hoi_luc).not.toBeNull();
    const han = tao.han_phan_hoi_luc ?? 0;
    expect(han).toBeGreaterThanOrEqual(truoc + 15 * 60_000);
    expect(han).toBeLessThanOrEqual(sau + 15 * 60_000);
  });

  it('truyền được giá trị khác (`baton assign --timeout`)', async () => {
    const truoc = Date.now();
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk, { han_phan_hoi_phut: 60 }));
    expect(tao.han_phan_hoi_luc ?? 0).toBeGreaterThanOrEqual(truoc + 60 * 60_000);
  });

  it('`han_phan_hoi_phut: null` = không đặt hạn', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk, { han_phan_hoi_phut: null }));
    expect(tao.han_phan_hoi_luc).toBeNull();
  });

  it('giá trị vô lý → INVALID_INPUT', async () => {
    const res = await giao(TOKEN_CHU, TK, AG.wk, { han_phan_hoi_phut: 0 });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });
});

describe('SPEC mục 2 + 4 — dự án tạm dừng và lưu trữ không nhận việc mới', () => {
  it('dự án `paused` → PROJECT_NOT_ACCEPTING', async () => {
    const res = await giao(TOKEN_CHU, TK_TAM_DUNG, AG.wk);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });
  });

  it('dự án `archived` → PROJECT_NOT_ACCEPTING', async () => {
    const res = await giao(TOKEN_CHU, TK_LUU, AG.wk);
    expect(res.status).toBe(409);
  });
});

describe('SPEC 19.3 — lượt `review` do manager hoặc coordinator tạo', () => {
  it('manager và coordinator tạo được lượt review', async () => {
    expect((await giao(TOKEN.mgr, TK, AG.rv, { loai_luot: 'review' })).status).toBe(201);
    expect((await giao(TOKEN.coord, TK_2, AG.rv, { loai_luot: 'review' })).status).toBe(201);
  });

  it('agent vai trò khác, dù chủ đã mở ô "Giao việc", vẫn KHÔNG tạo được lượt review', async () => {
    await goiApi(`/v1/agent/${AG.wk}/quyen/assign`, TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'co' },
    });
    // Đối chứng: lượt `work` thì tạo được sau khi mở ô.
    expect((await giao(TOKEN.wk, TK, AG.wk2)).status).toBe(201);

    const res = await giao(TOKEN.wk, TK, AG.rv, { loai_luot: 'review' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('loại lượt lạ → INVALID_INPUT', async () => {
    const res = await giao(TOKEN_CHU, TK, AG.wk, { loai_luot: 'worker' });
    expect(res.status).toBe(422);
  });
});

describe('SPEC mục 4 dòng 134 — mở lượt giao thì ticket nhóm `planned` tự sang Đang làm', () => {
  it('ticket `todo` → `in_progress` sau khi mở lượt', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    expect(tao.ticket_trang_thai).toBe('in_progress');

    const d = await env.DB.prepare('SELECT trang_thai, bat_dau_luc FROM ticket WHERE id = ?')
      .bind(TK)
      .first<{ trang_thai: string; bat_dau_luc: number | null }>();
    expect(d?.trang_thai).toBe('in_progress');
    expect(d?.bat_dau_luc).not.toBeNull();
  });

  it('ticket đang `verifying` KHÔNG bị kéo về Đang làm khi mở lượt review (19.3)', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'verifying' WHERE id = ?")
      .bind(TK)
      .run();
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.rv, { loai_luot: 'review' }));
    expect(tao.ticket_trang_thai).toBe('verifying');
  });
});

describe('SPEC mục 4 — mọi hành động có dấu vết ai làm', () => {
  it('tạo lượt ghi một dòng lịch sử trên ticket', async () => {
    await giao(TOKEN.mgr, TK, AG.wk);
    const { results } = await env.DB.prepare(
      'SELECT truong, gia_tri_moi, tac_gia_loai, tac_gia_agent_id FROM ticket_history WHERE ticket_id = ?',
    )
      .bind(TK)
      .all<{
        truong: string;
        gia_tri_moi: string | null;
        tac_gia_loai: string;
        tac_gia_agent_id: string | null;
      }>();

    const dong = results.find((r) => r.truong === 'luot_giao:work');
    expect(dong).toBeDefined();
    expect(dong?.gia_tri_moi).toBe(AG.wk);
    expect(dong?.tac_gia_loai).toBe('agent');
    expect(dong?.tac_gia_agent_id).toBe(AG.mgr);
  });

  it('nhận việc cũng ghi lịch sử', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    await nhan(TOKEN.wk, tao.id);

    const { results } = await env.DB.prepare(
      'SELECT truong, gia_tri_cu, gia_tri_moi FROM ticket_history WHERE ticket_id = ?',
    )
      .bind(TK)
      .all<{ truong: string; gia_tri_cu: string | null; gia_tri_moi: string | null }>();
    const dong = results.find((r) => r.truong === `luot_giao:${tao.id}`);
    expect(dong?.gia_tri_cu).toBe('pending');
    expect(dong?.gia_tri_moi).toBe('in_progress');
  });
});

/* ================================================================== *
 * SPEC mục 5 — Nhận việc
 * ================================================================== */
describe('SPEC mục 5 — nhận việc', () => {
  it('`pending` → `in_progress`, có `nhan_luc`', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    const res = await nhan(TOKEN.wk, tao.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ trang_thai: 'in_progress' });

    const d = await env.DB.prepare('SELECT trang_thai, nhan_luc FROM luot_giao WHERE id = ?')
      .bind(tao.id)
      .first<{ trang_thai: string; nhan_luc: number | null }>();
    expect(d?.trang_thai).toBe('in_progress');
    expect(d?.nhan_luc).not.toBeNull();
  });

  it('agent KHÁC người nhận → FORBIDDEN', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    const res = await nhan(TOKEN.wk2, tao.id);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('người GIAO cũng không nhận hộ được → FORBIDDEN', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN.mgr, TK, AG.wk));
    expect((await nhan(TOKEN.mgr, tao.id)).status).toBe(403);
  });

  it('chủ cũng không nhận hộ được → FORBIDDEN', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    expect((await nhan(TOKEN_CHU, tao.id)).status).toBe(403);
  });

  it('nhận một lượt đã `in_progress` → 409 ASSIGNMENT_NOT_PENDING', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    expect((await nhan(TOKEN.wk, tao.id)).status).toBe(200);
    const res = await nhan(TOKEN.wk, tao.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'ASSIGNMENT_NOT_PENDING' });
  });

  it('nhận một lượt đã đóng → 409', async () => {
    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    await env.DB.prepare("UPDATE luot_giao SET trang_thai = 'canceled' WHERE id = ?")
      .bind(tao.id)
      .run();
    expect((await nhan(TOKEN.wk, tao.id)).status).toBe(409);
  });

  it('lượt không tồn tại → NOT_FOUND', async () => {
    expect((await nhan(TOKEN.wk, 'lg-khong-co-that')).status).toBe(404);
  });

  /**
   * SPEC mục 5: "Quá hạn phản hồi mà chưa nhận thì lượt hiện **Không phản hồi** ở
   * Tổng quan (**lượt không tự huỷ**)". Nên quá hạn **không** chặn lệnh nhận.
   */
  it('QUÁ HẠN phản hồi mà chưa nhận: lượt KHÔNG tự huỷ, vẫn nhận được', async () => {
    await dungLuotGiao('lg-qua-han', TK, AG.wk, {
      han_phan_hoi_luc: Date.now() - 60 * 60_000,
    });

    const res = await nhan(TOKEN.wk, 'lg-qua-han');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ trang_thai: 'in_progress', qua_han_phan_hoi: true });

    const d = await env.DB.prepare('SELECT trang_thai FROM luot_giao WHERE id = ?')
      .bind('lg-qua-han')
      .first<{ trang_thai: string }>();
    expect(d?.trang_thai).toBe('in_progress');
  });
});

/* ================================================================== *
 * "Không phản hồi" là giá trị TÍNH ĐƯỢC — SPEC mục 5
 * ================================================================== */
describe('SPEC mục 5 — "Không phản hồi" (hàm thuần, giờ tiêm vào)', () => {
  const HAN = 1_000_000;

  it('chưa tới hạn thì không', () => {
    expect(laKhongPhanHoi({ trang_thai: 'pending', han_phan_hoi_luc: HAN }, HAN - 1)).toBe(false);
  });

  it('đúng ngay mốc hạn thì chưa tính là quá hạn', () => {
    expect(laKhongPhanHoi({ trang_thai: 'pending', han_phan_hoi_luc: HAN }, HAN)).toBe(false);
  });

  it('quá mốc một mili giây là "Không phản hồi"', () => {
    expect(laKhongPhanHoi({ trang_thai: 'pending', han_phan_hoi_luc: HAN }, HAN + 1)).toBe(true);
  });

  it('đã nhận rồi thì không bao giờ là "Không phản hồi"', () => {
    expect(laKhongPhanHoi({ trang_thai: 'in_progress', han_phan_hoi_luc: HAN }, HAN + 1)).toBe(
      false,
    );
  });

  it('lượt không đặt hạn thì không bao giờ là "Không phản hồi"', () => {
    expect(laKhongPhanHoi({ trang_thai: 'pending', han_phan_hoi_luc: null }, HAN + 1)).toBe(false);
  });

  it('đường đọc trả cờ `khong_phan_hoi` đúng cho lượt đã quá hạn', async () => {
    await dungLuotGiao('lg-qh', TK, AG.wk, { han_phan_hoi_luc: Date.now() - 1000 });
    const res = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN_CHU);
    const { items } = await than<{ items: { id: string; khong_phan_hoi: boolean }[] }>(res);
    expect(items.find((l) => l.id === 'lg-qh')?.khong_phan_hoi).toBe(true);
  });
});

/* ================================================================== *
 * Đường đọc — SPEC mục 5 ("thấy cả chuỗi"), mục 13
 * ================================================================== */
describe('SPEC mục 5 — chuỗi lượt giao của một ticket', () => {
  it('trả các lượt theo `so_luot` tăng dần', async () => {
    await dungLuotGiao('lg-2', TK, AG.wk, { so_luot: 2, trang_thai: 'accepted' });
    await dungLuotGiao('lg-1', TK, AG.wk, { so_luot: 1, trang_thai: 'returned', ly_do: 'Thiếu test' });
    await dungLuotGiao('lg-3', TK, AG.wk2, { so_luot: 3 });

    const res = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN_CHU);
    expect(res.status).toBe(200);
    const { items } = await than<{ items: LuotRa[] }>(res);
    expect(items.map((l) => l.id)).toEqual(['lg-1', 'lg-2', 'lg-3']);
    expect(items.map((l) => l.trang_thai)).toEqual(['returned', 'accepted', 'pending']);
  });

  it('agent thấy lượt của ticket nó đọc được', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk);
    const res = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.wk);
    expect(res.status).toBe(200);
  });

  it('ticket NGOÀI phạm vi → NOT_FOUND (không lộ sự tồn tại, SPEC mục 13)', async () => {
    const res = await goiApi(`/v1/ticket/${TK_NGOAI}/luot-giao`, TOKEN.wk);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});

/* ================================================================== *
 * Người đang cầm — SPEC 19.1, 5 bậc, qua DB THẬT
 * ================================================================== */
describe('SPEC 19.1 — người đang cầm, từng bậc, qua DB thật', () => {
  async function nguoiCamCua(ticket_id: string): Promise<{
    nguoi_dang_cam: { loai: string; agentId?: string } | null;
    bac_nguoi_cam: number;
    cho_nghiem_thu: boolean;
  }> {
    const res = await goiApi(`/v1/ticket/${ticket_id}`, TOKEN_CHU);
    return than(res);
  }

  it('bậc 5: không có ai → trống', async () => {
    const t = await nguoiCamCua(TK);
    expect(t.nguoi_dang_cam).toBeNull();
    expect(t.bac_nguoi_cam).toBe(5);
  });

  it('bậc 4: chủ bấm "Tôi làm"', async () => {
    await goiApi(`/v1/ticket/${TK}/toi-lam`, TOKEN_CHU, { method: 'POST', than: { bat: true } });
    const t = await nguoiCamCua(TK);
    expect(t.nguoi_dang_cam).toEqual({ loai: 'owner' });
    expect(t.bac_nguoi_cam).toBe(4);
  });

  it('bậc 3: có lượt `submitted` → người GIAO của lượt đó, "chờ … nghiệm thu"', async () => {
    await dungLuotGiao('lg-sub', TK, AG.wk, {
      trang_thai: 'submitted',
      nguoi_giao_agent_id: AG.mgr,
    });
    const t = await nguoiCamCua(TK);
    expect(t.nguoi_dang_cam).toEqual({ loai: 'agent', agentId: AG.mgr });
    expect(t.bac_nguoi_cam).toBe(3);
    expect(t.cho_nghiem_thu).toBe(true);
  });

  it('bậc 2: lượt `work` mở → người NHẬN của lượt đó (thắng bậc 3)', async () => {
    await dungLuotGiao('lg-sub', TK, AG.wk2, {
      trang_thai: 'submitted',
      nguoi_giao_agent_id: AG.mgr,
    });
    await dungLuotGiao('lg-mo', TK, AG.wk, { trang_thai: 'in_progress' });
    const t = await nguoiCamCua(TK);
    expect(t.nguoi_dang_cam).toEqual({ loai: 'agent', agentId: AG.wk });
    expect(t.bac_nguoi_cam).toBe(2);
  });

  it('bậc 1: lượt `review` mở thắng cả lượt `work` mở', async () => {
    await dungLuotGiao('lg-mo', TK, AG.wk, { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-rv', TK, AG.rv, { loai: 'review' });
    const t = await nguoiCamCua(TK);
    expect(t.nguoi_dang_cam).toEqual({ loai: 'agent', agentId: AG.rv });
    expect(t.bac_nguoi_cam).toBe(1);
  });

  it('bậc 1 thắng cả bậc 4 (chủ đang "Tôi làm")', async () => {
    await goiApi(`/v1/ticket/${TK}/toi-lam`, TOKEN_CHU, { method: 'POST', than: { bat: true } });
    await dungLuotGiao('lg-rv', TK, AG.rv, { loai: 'review' });
    const t = await nguoiCamCua(TK);
    expect(t.bac_nguoi_cam).toBe(1);
  });

  it('danh sách ticket cũng hiện người đang cầm (không chỉ trang chi tiết)', async () => {
    await dungLuotGiao('lg-mo', TK, AG.wk, { trang_thai: 'in_progress' });
    const res = await goiApi(`/v1/ticket?project_id=${P}`, TOKEN_CHU);
    const { items } = await than<{
      items: { id: string; nguoi_dang_cam: { agentId?: string } | null }[];
    }>(res);
    expect(items.find((t) => t.id === TK)?.nguoi_dang_cam).toEqual({
      loai: 'agent',
      agentId: AG.wk,
    });
    expect(items.find((t) => t.id === TK_2)?.nguoi_dang_cam).toBeNull();
  });

  it('hàm luật thuần và đường DB cho cùng một kết luận (bậc 2)', async () => {
    await dungLuotGiao('lg-mo', TK, AG.wk, { trang_thai: 'in_progress' });
    const qua_db = await nguoiCamCua(TK);
    const thuan = nguoiDangCam(
      { chu_tu_lam: false },
      { luot_worker_mo: { loai: 'agent', agentId: AG.wk } },
    );
    expect(qua_db.bac_nguoi_cam).toBe(thuan.bac);
    expect(qua_db.nguoi_dang_cam).toEqual(thuan.nguoi);
  });

  it('ticket có lượt giao mở thì KHÔNG bị tính là "không ai cầm" (19.1)', async () => {
    // Ticket đang ở tình trạng "active + không ai cầm" từ 10 giờ trước: mốc đồng
    // hồ 24 giờ của 19.1 đã chạy. Mở một lượt giao là có người cầm, nên mốc phải
    // bị **xoá** — không thì cờ bật sai ngay sau đó.
    await env.DB.prepare(
      "UPDATE ticket SET trang_thai = 'in_progress', trong_tay_tu_luc = ? WHERE id = ?",
    )
      .bind(Date.now() - 10 * 60 * 60_000, TK)
      .run();

    const tao = await than<LuotRa>(await giao(TOKEN_CHU, TK, AG.wk));
    expect(tao.ticket_trang_thai).toBe('in_progress');
    const d = await env.DB.prepare('SELECT trong_tay_tu_luc FROM ticket WHERE id = ?')
      .bind(TK)
      .first<{ trong_tay_tu_luc: number | null }>();
    expect(d?.trong_tay_tu_luc).toBeNull();
  });
});

/* ================================================================== *
 * Trang lớn hơn một lô — SPEC 19.1 trên đường danh sách
 * ================================================================== *
 * `boiCanhNguoiCamNhieu` chia lô 90 vì D1 chặn ở ~100 tham số bind. Không có ca
 * nào đi qua **hai** lô thì lỗi `too many SQL variables` (bộ đo từng bắt được)
 * sẽ quay lại im lặng, hoặc tệ hơn: vòng lô bị bỏ mà chỉ lô đầu có người cầm.
 */
describe('SPEC 19.1 — danh sách dài hơn một lô vẫn đủ người đang cầm', () => {
  /*
   * **120, không phải 95.**
   *
   * Trần tham số bind của D1 là ~100. Với 95 ticket thì cả trang (95 + 2 ticket
   * có sẵn + 1 tham số workspace = 98) vẫn **lọt** dưới trần, nên bỏ vòng lô đi
   * test vẫn xanh — đã thử. 120 ticket thì một câu gộp chắc chắn vỡ, mà chia lô
   * 90 thì vẫn chạy: đúng ca cần canh.
   */
  const SO = 120;

  it(`trang ${String(SO)}+ ticket: không lỗi, và người đang cầm đúng ở CẢ HAI lô`, async () => {
    const id_co_luot: string[] = [];
    for (let i = 0; i < SO; i += 1) {
      const so = 100 + i;
      const ticket_id = await dungTicket(P, so, `Việc hàng loạt ${String(so)}`, {
        trang_thai: 'in_progress',
      });
      id_co_luot.push(ticket_id);
      // Mỗi ticket một lượt `work` đang mở → người đang cầm là `ag-wk` (bậc 2).
      await dungLuotGiao(`lg-loat-${String(so)}`, ticket_id, AG.wk, {
        trang_thai: 'in_progress',
      });
    }

    const res = await goiApi(`/v1/ticket?project_id=${P}&limit=200`, TOKEN_CHU);
    expect(res.status).toBe(200);

    const { items } = await than<{
      items: { id: string; nguoi_dang_cam: { loai: string; agentId?: string } | null }[];
    }>(res);
    expect(items.length).toBeGreaterThanOrEqual(SO);

    const vi_tri = items
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => id_co_luot.includes(t.id));
    expect(vi_tri.length).toBe(SO);

    for (const { t } of vi_tri) {
      expect(t.nguoi_dang_cam, t.id).toEqual({ loai: 'agent', agentId: AG.wk });
    }

    /*
     * Và phải có ticket nằm **ngoài lô đầu**: lô chia theo thứ tự của trang, nên
     * một ticket ở vị trí ≥ 90 chỉ có người cầm nếu vòng lô chạy tới lô thứ hai.
     * Bỏ vòng lô đi là ca này đỏ (hoặc vỡ với `too many SQL variables`).
     */
    const xa_nhat = Math.max(...vi_tri.map((v) => v.i));
    expect(xa_nhat).toBeGreaterThanOrEqual(90);
    expect(items[xa_nhat]?.nguoi_dang_cam).not.toBeNull();
  });
});

/* ================================================================== *
 * Hàng rào tầng DB của migration 0004
 * ================================================================== */
describe('migration 0004 — luật ép ở tầng DB', () => {
  it('`returned` bắt buộc có lý do (SPEC mục 5)', async () => {
    await expect(
      dungLuotGiao('lg-tra', TK, AG.wk, { trang_thai: 'returned' }),
    ).rejects.toThrow();
    await expect(
      dungLuotGiao('lg-tra-2', TK, AG.wk, { trang_thai: 'returned', ly_do: 'Thiếu test' }),
    ).resolves.toBe('lg-tra-2');
  });

  it('chỉ nhận đúng 6 mã trạng thái của SPEC mục 5', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO luot_giao (id, workspace_id, ticket_id, so_luot, loai,
            nguoi_giao_loai, nguoi_nhan_agent_id, trang_thai, tao_luc, cap_nhat_luc)
         VALUES ('lg-x', ?, ?, 9, 'work', 'owner', ?, 'khong_phan_hoi', 1, 1)`,
      )
        .bind(WS, TK, AG.wk)
        .run(),
    ).rejects.toThrow();
  });

  it('chỉ nhận hai loại `work` và `review` (SPEC mục 0.1)', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO luot_giao (id, workspace_id, ticket_id, so_luot, loai,
            nguoi_giao_loai, nguoi_nhan_agent_id, trang_thai, tao_luc, cap_nhat_luc)
         VALUES ('lg-y', ?, ?, 9, 'worker', 'owner', ?, 'pending', 1, 1)`,
      )
        .bind(WS, TK, AG.wk)
        .run(),
    ).rejects.toThrow();
  });

  it('`workspace_id` phải khớp workspace của ticket (SPEC mục 1)', async () => {
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind('ws-zz-khac', 'Người khác', 1, 1)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO luot_giao (id, workspace_id, ticket_id, so_luot, loai,
            nguoi_giao_loai, nguoi_nhan_agent_id, trang_thai, tao_luc, cap_nhat_luc)
         VALUES ('lg-ws', 'ws-zz-khac', ?, 9, 'work', 'owner', ?, 'pending', 1, 1)`,
      )
        .bind(TK, AG.wk)
        .run(),
    ).rejects.toThrow();
  });

  it('cặp "ai" của người giao phải nhất quán (loại agent thì phải có agent_id)', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO luot_giao (id, workspace_id, ticket_id, so_luot, loai,
            nguoi_giao_loai, nguoi_nhan_agent_id, trang_thai, tao_luc, cap_nhat_luc)
         VALUES ('lg-z', ?, ?, 9, 'work', 'agent', ?, 'pending', 1, 1)`,
      )
        .bind(WS, TK, AG.wk)
        .run(),
    ).rejects.toThrow();
  });
});
