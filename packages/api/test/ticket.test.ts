/**
 * **Ticket: tạo, mặc định, kiểm nhập** — SPEC mục 4 (dòng 110–121, 149) và
 * **dạng lỗi + mã HTTP** của SPEC mục 13.
 *
 * Mỗi `it` dưới đây gắn với một câu của SPEC, và luôn có cả ca **ĐẠT** lẫn ca
 * **BỊ TỪ CHỐI** kèm đúng mã lỗi và đúng mã HTTP: một luật chỉ có ca từ chối thì
 * không phân biệt được "luật đúng" với "đường đi hỏng".
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { BANG_LOI, DAI_TIEU_DE_TOI_DA } from '@baton/shared';
import {
  TOKEN_CHU,
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

const TOKEN_COORD = 'bt_token_coord_ticket';
const TOKEN_HEP = 'bt_token_agent_chi_sai';

/* ================================================================== *
 * Luật 1 — SPEC mục 4: mặc định khi tạo, và tiêu đề 1–200 ký tự
 * ================================================================== */

describe('SPEC mục 4 — ticket mới tạo: trạng thái và ưu tiên mặc định', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
  });

  it('mặc định trạng thái `todo` (Cần làm) và ưu tiên `none` (Không)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc đầu tiên' },
    });
    expect(res.status).toBe(201);
    const { id, trang_thai } = await res.json<{ id: string; trang_thai: string }>();
    // SPEC mục 4: "Cần làm — chờ — Đã lên kế hoạch (**mặc định khi tạo**)".
    expect(trang_thai).toBe('todo');

    const doc = await goiApi(`/v1/ticket/${id}`, TOKEN_CHU);
    expect(await doc.json()).toMatchObject({
      trang_thai: 'todo',
      nhan_trang_thai: 'Cần làm',
      nhom_trang_thai: 'planned',
      // SPEC mục 4: "Ưu tiên: 5 mức cố định … **Mặc định `Không`**".
      uu_tien: 'none',
      nhan_uu_tien: 'Không',
    });
  });

  it('tiêu đề RỖNG hoặc chỉ khoảng trắng → INVALID_INPUT / 422, không ghi gì', async () => {
    for (const tieu_de of [undefined, '', '   ', '\t\n  ']) {
      const res = await goiApi('/v1/ticket', TOKEN_CHU, {
        method: 'POST',
        than: { project_id: 'pj-SAI', tieu_de },
      });
      expect(res.status, JSON.stringify(tieu_de)).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
    }
    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('ĐÚNG 200 ký tự thì ĐẠT; 201 ký tự → INVALID_INPUT / 422', async () => {
    const dai_200 = 'a'.repeat(DAI_TIEU_DE_TOI_DA);
    expect(dai_200.length).toBe(200);

    const dat = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: dai_200 },
    });
    expect(dat.status).toBe(201);

    const tu_choi = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: `${dai_200}a` },
    });
    expect(tu_choi.status).toBe(422);
    expect(await tu_choi.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('"200 ký tự SAU KHI CẮT khoảng trắng": 200 chữ kèm khoảng trắng hai đầu vẫn ĐẠT', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: `   ${'b'.repeat(200)}   ` },
    });
    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: string }>();

    // Và giá trị **đã cắt** mới là giá trị được ghi, không phải chuỗi thô.
    const d = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
      .bind(id)
      .first<{ tieu_de: string }>();
    expect(d?.tieu_de).toBe('b'.repeat(200));
  });

  it('cùng luật áp cho đường SỬA, không chỉ đường tạo', async () => {
    const id = await dungTicket('pj-SAI', 1);
    const res = await goiApi(`/v1/ticket/${id}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { tieu_de: '   ' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });

    const d = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
      .bind(id)
      .first<{ tieu_de: string }>();
    expect(d?.tieu_de).toBe('Việc giả để test');
  });
});

/* ================================================================== *
 * Luật 2 — SPEC mục 4 dòng 149: dự án paused/archived
 * ================================================================== */

describe('SPEC mục 4 — dự án paused/archived: agent không tạo được ticket', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('ACT', 'Đang chạy', 'active');
    await dungDuAn('PAU', 'Tạm dừng', 'paused');
    await dungDuAn('ARC', 'Lưu trữ', 'archived');
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
  });

  it('ĐẠT: dự án `active` thì agent tạo được', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-ACT', tieu_de: 'Việc trong dự án đang chạy' },
    });
    expect(res.status).toBe(201);
  });

  it.each([
    ['pj-PAU', 'paused'],
    ['pj-ARC', 'archived'],
  ])('BỊ TỪ CHỐI: dự án %s (%s) → PROJECT_NOT_ACCEPTING / 409', async (project_id) => {
    const res = await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id, tieu_de: 'Việc mới' },
    });
    // SPEC mục 13 xếp `PROJECT_NOT_ACCEPTING` vào **xung đột trạng thái** (409):
    // dữ liệu gửi lên không sai, chỉ trạng thái dự án không nhận việc mới.
    expect(res.status).toBe(409);
    expect(BANG_LOI.PROJECT_NOT_ACCEPTING.http).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });

    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('chữ "agent" trong SPEC là chủ ý: CHỦ vẫn tạo được trong dự án `paused`', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-PAU', tieu_de: 'Chủ lên kế hoạch trước' },
    });
    expect(res.status).toBe(201);
  });

  it('nhưng `archived` là CHỈ ĐỌC với cả chủ (SPEC mục 2)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-ARC', tieu_de: 'Không được tạo' },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });
  });
});

/* ================================================================== *
 * Luật 15 — SPEC mục 13: dạng thân lỗi và mã HTTP
 * ================================================================== */

describe('SPEC mục 13 — thân lỗi `{ error, message }` và mã HTTP đúng lớp', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungDuAn('INC', 'INC');
    await dungTicket('pj-SAI', 1);
    await dungTicket('pj-INC', 1);
    await dungAgentCoToken({
      id: 'ag-hep',
      ten: 'W-chi-SAI',
      vai_tro: 'worker',
      token: TOKEN_HEP,
      du_an: ['pj-SAI'],
    });
  });

  it.each([
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CHILDREN_OPEN', 409],
    ['PROJECT_NOT_ACCEPTING', 409],
    ['EVIDENCE_REQUIRED', 422],
    ['REASON_REQUIRED', 422],
    ['INVALID_DUPLICATE_TARGET', 422],
    ['INVALID_INPUT', 422],
  ] as const)('mã %s → HTTP %i, thân đúng dạng SPEC mục 13', async (ma, http) => {
    // Bảng mã là nguồn sự thật; `/v1/_loi/:ma` chỉ để kiểm đúng chặng HTTP.
    expect(BANG_LOI[ma].http).toBe(http);

    const res = await goiApi(`/v1/_loi/${ma}`, TOKEN_CHU);
    expect(res.status).toBe(http);
    const than = await res.json<Record<string, unknown>>();
    // Đúng **hai** khoá: `error` (mã tiếng Anh) và `message` (tiếng Việt).
    expect(Object.keys(than).sort()).toEqual(['error', 'message']);
    expect(than['error']).toBe(ma);
    expect(typeof than['message']).toBe('string');
    expect((than['message'] as string).length).toBeGreaterThan(0);
  });

  it('404 khi ticket NGOÀI phạm vi — không lộ sự tồn tại (SPEC mục 13)', async () => {
    const ngoai = await goiApi('/v1/ticket/tk-pj-INC-1', TOKEN_HEP);
    const khong_co = await goiApi('/v1/ticket/tk-khong-bao-gio-co', TOKEN_HEP);

    expect(ngoai.status).toBe(404);
    expect(khong_co.status).toBe(404);
    // Hai phản hồi **giống hệt nhau**: không có cách nào dò ra ticket kia có thật.
    expect(await ngoai.json()).toEqual(await khong_co.json());

    // Còn ticket trong phạm vi thì đọc được — nếu không, test trên vô nghĩa.
    expect((await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_HEP)).status).toBe(200);
  });

  it('đường GHI dùng 403: ghi vào dự án ngoài phạm vi là FORBIDDEN', async () => {
    // Quy ước của Baton (`spec-questions.md` #24): **ĐỌC → 404** (không lộ sự tồn
    // tại), **GHI → 403** (nói thẳng "không có quyền", để agent không đi sửa dữ
    // liệu gửi lên vì tưởng mình gõ sai id).
    const res = await goiApi('/v1/ticket', TOKEN_HEP, {
      method: 'POST',
      than: { project_id: 'pj-INC', tieu_de: 'Việc xuyên phạm vi' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('403 của đường GHI KHÔNG là máy dò sự tồn tại của dự án (`spec-questions.md` #24)', async () => {
    /*
     * Chỗ này từng là một **oracle**: `handlerTaoTicket` tra dự án *trước* khi
     * kiểm quyền, nên `project_id` không có thật ra 404 còn `project_id` có thật
     * mà agent không được vào ra 403 — agent dò được danh sách dự án mình không
     * được vào. Giờ quyền kiểm trước, nên hai ca **giống hệt nhau**.
     */
    const co_that = await goiApi('/v1/ticket', TOKEN_HEP, {
      method: 'POST',
      than: { project_id: 'pj-INC', tieu_de: 'Dự án có thật, không được vào' },
    });
    const khong_co = await goiApi('/v1/ticket', TOKEN_HEP, {
      method: 'POST',
      than: { project_id: 'pj-KHONG-BAO-GIO-CO', tieu_de: 'Dự án không tồn tại' },
    });

    expect(co_that.status).toBe(khong_co.status);
    expect(await co_that.json()).toEqual(await khong_co.json());

    // Và chủ vẫn nhận 404 đúng nghĩa cho dự án không tồn tại — chủ thấy mọi dự
    // án nên không có gì để che.
    const chu = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-KHONG-BAO-GIO-CO', tieu_de: 'Chủ gõ sai id' },
    });
    expect(chu.status).toBe(404);
    expect(await chu.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('401 khi token sai (SPEC mục 13)', async () => {
    expect((await goiApi('/v1/ticket/tk-pj-SAI-1', 'bt_token_khong_co_that')).status).toBe(401);
  });
});
