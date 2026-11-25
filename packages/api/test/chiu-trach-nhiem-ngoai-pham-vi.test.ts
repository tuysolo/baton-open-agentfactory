/**
 * BAT-48 — **người chịu trách nhiệm** (SPEC mục 4) là agent ngoài phạm vi người
 * gọi ⇒ phản hồi **giống hệt** agent không tồn tại (SPEC mục 13 d.399, 19.12 câu
 * 15; `spec-questions.md` #172). Cùng khuôn với người nhận lượt giao
 * (`luot-giao.test.ts`, khối BAT-48).
 *
 * Trước BAT-48, `kiemChiuTrachNhiem` tra cả workspace: agent tạo ticket với
 * `chiu_trach_nhiem_agent_id` của một agent nó không thấy thì **thành công** (hoặc
 * `INVALID_INPUT` nếu agent đó là worker/reviewer), còn id bịa ra `NOT_FOUND` —
 * dò được cả sự tồn tại lẫn vai trò.
 */

import { afterEach, describe, expect } from 'vitest';
import {
  TOKEN_CHU,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
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

const P = 'pj-SAI';
const P_NGOAI = 'pj-OUT';
const TK = 'tk-pj-SAI-1';

const MGR = 'ag-mgr';
const TOKEN_MGR = 'bt_ctn_mgr';
/** Manager chỉ ở `pj-OUT` — không chung dự án nào với `ag-mgr`. */
const X_MGR = 'ag-x-mgr';
/** Worker chỉ ở `pj-OUT`: vai trò không được chịu trách nhiệm (mục 4). */
const X_WK = 'ag-x-wk';
/** Coordinator chung `pj-SAI` với `ag-mgr`: thấy được. */
const COORD = 'ag-coord';
const KHONG_CO = 'ag-khong-co-that';

beforeEach(async () => {
  await dungWorkspace();
  // Agent quản lý trước (khoá ngoại `project.quan_ly_agent_id`), dự án sau.
  await dungAgentCoToken({ id: MGR, ten: 'M-Sample', vai_tro: 'manager', token: TOKEN_MGR });
  await dungDuAn('SAI', 'Sample', 'active', MGR);
  await dungDuAn('OUT', 'Dự án ngoài phạm vi', 'active');
  await choVaoDuAn(MGR, P);
  await dungAgentCoToken({ id: X_MGR, ten: 'M-x', vai_tro: 'manager', token: 'bt_ctn_x', du_an: [P_NGOAI] });
  await dungAgentCoToken({ id: X_WK, ten: 'W-x', vai_tro: 'worker', token: 'bt_ctn_xw', du_an: [P_NGOAI] });
  await dungAgentCoToken({ id: COORD, ten: 'CoS', vai_tro: 'coordinator', token: 'bt_ctn_c', du_an: [P] });

  await dungTicket(P, 1, 'Việc có sẵn', { trang_thai: 'todo' });
});

function taoTicket(token: string, agent_id: string): Promise<Response> {
  return goiApi('/v1/ticket', token, {
    method: 'POST',
    than: {
      project_id: P,
      tieu_de: 'Việc mới',
      chiu_trach_nhiem_loai: 'agent',
      chiu_trach_nhiem_agent_id: agent_id,
    },
  });
}

function suaTicket(token: string, agent_id: string): Promise<Response> {
  return goiApi(`/v1/ticket/${TK}`, token, {
    method: 'PATCH',
    than: { chiu_trach_nhiem_loai: 'agent', chiu_trach_nhiem_agent_id: agent_id },
  });
}

async function phanHoi(res: Response): Promise<{ status: number; kieu: string | null; than: unknown }> {
  return { status: res.status, kieu: res.headers.get('content-type'), than: await res.json() };
}

describe('BAT-48 — người chịu trách nhiệm ngoài phạm vi người gọi = không tồn tại', () => {
  it('tạo ticket: agent manager ngoài phạm vi → 404 GIỐNG HỆT id không tồn tại', async () => {
    const ngoai = await phanHoi(await taoTicket(TOKEN_MGR, X_MGR));
    const khong_co = await phanHoi(await taoTicket(TOKEN_MGR, KHONG_CO));
    expect(ngoai.status).toBe(404);
    expect(ngoai.than).toMatchObject({ error: 'NOT_FOUND' });
    expect(ngoai).toEqual(khong_co);
  });

  it('tạo ticket: agent worker ngoài phạm vi → cũng 404 giống hệt (không lộ vai trò)', async () => {
    const ngoai = await phanHoi(await taoTicket(TOKEN_MGR, X_WK));
    const khong_co = await phanHoi(await taoTicket(TOKEN_MGR, KHONG_CO));
    expect(ngoai).toEqual(khong_co);
  });

  it('sửa ticket: agent ngoài phạm vi → 404 giống hệt id không tồn tại', async () => {
    const ngoai = await phanHoi(await suaTicket(TOKEN_MGR, X_MGR));
    const khong_co = await phanHoi(await suaTicket(TOKEN_MGR, KHONG_CO));
    expect(ngoai.status).toBe(404);
    expect(ngoai).toEqual(khong_co);
  });

  it('agent thấy được (chung dự án) thì vẫn đặt được; vai trò sai vẫn INVALID_INPUT', async () => {
    expect((await taoTicket(TOKEN_MGR, COORD)).status).toBe(201);
    expect((await suaTicket(TOKEN_MGR, COORD)).status).toBe(200);

    await dungAgentCoToken({ id: 'ag-wk-sai', ten: 'W-sai', vai_tro: 'worker', token: 'bt_ctn_w', du_an: [P] });
    const res = await taoTicket(TOKEN_MGR, 'ag-wk-sai');
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('chủ thấy mọi agent: đặt được agent chỉ ở dự án khác', async () => {
    expect((await taoTicket(TOKEN_CHU, X_MGR)).status).toBe(201);
    expect((await suaTicket(TOKEN_CHU, X_MGR)).status).toBe(200);
  });
});
