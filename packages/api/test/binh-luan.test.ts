/**
 * **Bình luận ticket** — SPEC mục 4: "markdown, của chủ hoặc agent. **Tác giả tự
 * sửa được** (có ghi 'đã sửa'). **Agent không xoá được**."
 *
 * Hai chỗ SPEC không nói hết, đã chốt tạm trong `spec-questions.md` và có test ghi
 * rõ ở đây:
 *   * #22 — bảng quyền mục 3 không có hàng cho bình luận; điều kiện là "agent
 *     được vào dự án".
 *   * #23 — SPEC chỉ nói "agent không xoá được", không nói về chủ; chốt tạm là
 *     chủ xoá được, và xoá **mềm**.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
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

const TOKEN_W1 = 'bt_token_worker_1_bl';
const TOKEN_W2 = 'bt_token_worker_2_bl';
const TOKEN_NGOAI = 'bt_token_agent_ngoai_bl';

const TICKET = 'tk-pj-SAI-1';

async function themBinhLuan(token: string, noi_dung: string): Promise<string> {
  const res = await goiApi(`/v1/ticket/${TICKET}/binh-luan`, token, {
    method: 'POST',
    than: { noi_dung },
  });
  expect(res.status).toBe(201);
  const { id } = await res.json<{ id: string }>();
  return id;
}

async function dongBinhLuan(id: string): Promise<{
  tac_gia_loai: string;
  tac_gia_agent_id: string | null;
  noi_dung: string;
  da_sua: number;
  xoa_luc: number | null;
} | null> {
  return env.DB.prepare(
    'SELECT tac_gia_loai, tac_gia_agent_id, noi_dung, da_sua, xoa_luc FROM comment WHERE id = ?',
  )
    .bind(id)
    .first();
}

describe('SPEC mục 4 — bình luận: thêm, của chủ và của agent', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungDuAn('INC', 'INC');
    await dungTicket('pj-SAI', 1, 'Việc có bình luận');
    await dungAgentCoToken({
      id: 'ag-w1',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: TOKEN_W1,
      du_an: ['pj-SAI'],
    });
    await dungAgentCoToken({
      id: 'ag-w2',
      ten: 'W-reviewer',
      vai_tro: 'reviewer',
      token: TOKEN_W2,
      du_an: ['pj-SAI'],
    });
    await dungAgentCoToken({
      id: 'ag-ngoai',
      ten: 'W-chi-INC',
      vai_tro: 'worker',
      token: TOKEN_NGOAI,
      du_an: ['pj-INC'],
    });
  });

  it('CHỦ bình luận được; nội dung markdown giữ nguyên, `da_sua` tắt', async () => {
    const id = await themBinhLuan(TOKEN_CHU, '## Ghi chú\n\n- một\n- hai');
    expect(await dongBinhLuan(id)).toMatchObject({
      tac_gia_loai: 'owner',
      tac_gia_agent_id: null,
      noi_dung: '## Ghi chú\n\n- một\n- hai',
      da_sua: 0,
      xoa_luc: null,
    });
  });

  it('AGENT bình luận được (mọi vai trò, miễn được vào dự án — `spec-questions.md` #22)', async () => {
    for (const token of [TOKEN_W1, TOKEN_W2]) {
      const id = await themBinhLuan(token, 'Agent báo tiến độ');
      expect((await dongBinhLuan(id))?.tac_gia_loai).toBe('agent');
    }
  });

  it('agent NGOÀI dự án → 404 NOT_FOUND giống hệt id bịa (BAT-58), và không ghi gì', async () => {
    /*
     * Trước BAT-58 ca này ghim 403 FORBIDDEN, còn id bịa ra 404 — hai phản hồi
     * khác nhau là một máy dò sự tồn tại ticket, trái 19.12 câu 15 ("cả hai ca
     * phải ra phản hồi giống hệt nhau"). Cửa ghi không biết dự án trước khi tra
     * id, nên chọn 404 cho cả hai — cùng lựa chọn #175 (`spec-questions.md` #176).
     */
    const res = await goiApi(`/v1/ticket/${TICKET}/binh-luan`, TOKEN_NGOAI, {
      method: 'POST',
      than: { noi_dung: 'Xuyên phạm vi' },
    });
    const bia = await goiApi('/v1/ticket/tk-khong-co/binh-luan', TOKEN_NGOAI, {
      method: 'POST',
      than: { noi_dung: 'Xuyên phạm vi' },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(await bia.json());

    const n = await env.DB.prepare('SELECT count(*) AS n FROM comment').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('agent NGOÀI dự án ĐỌC ticket và bình luận của nó → 404 (SPEC mục 13)', async () => {
    await themBinhLuan(TOKEN_CHU, 'Bình luận không được lộ');
    expect((await goiApi(`/v1/ticket/${TICKET}`, TOKEN_NGOAI)).status).toBe(404);
    expect((await goiApi(`/v1/ticket/${TICKET}/binh-luan`, TOKEN_NGOAI)).status).toBe(404);
  });

  it('nội dung rỗng hoặc chỉ khoảng trắng → 422 INVALID_INPUT', async () => {
    for (const noi_dung of [undefined, '', '   ']) {
      const res = await goiApi(`/v1/ticket/${TICKET}/binh-luan`, TOKEN_CHU, {
        method: 'POST',
        than: { noi_dung },
      });
      expect(res.status, JSON.stringify(noi_dung)).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
    }
  });

  it('đường đọc trả bình luận mới nhất trước, kèm tác giả và cờ `da_sua`', async () => {
    await themBinhLuan(TOKEN_CHU, 'Bình luận một');
    await themBinhLuan(TOKEN_W1, 'Bình luận hai');

    const res = await goiApi(`/v1/ticket/${TICKET}/binh-luan`, TOKEN_CHU);
    expect(res.status).toBe(200);
    const { items } = await res.json<{ items: { noi_dung: string; da_sua: boolean }[] }>();
    expect(items.map((b) => b.noi_dung)).toEqual(['Bình luận hai', 'Bình luận một']);
    expect(items.every((b) => !b.da_sua)).toBe(true);
  });
});

describe('SPEC mục 4 — TÁC GIẢ tự sửa được, có cờ "đã sửa"', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungTicket('pj-SAI', 1, 'Việc có bình luận');
    await dungAgentCoToken({
      id: 'ag-w1',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: TOKEN_W1,
      du_an: ['pj-SAI'],
    });
    await dungAgentCoToken({
      id: 'ag-w2',
      ten: 'W-reviewer',
      vai_tro: 'reviewer',
      token: TOKEN_W2,
      du_an: ['pj-SAI'],
    });
  });

  it('ĐẠT: agent sửa bình luận CỦA MÌNH → nội dung mới + cờ `da_sua` bật', async () => {
    const id = await themBinhLuan(TOKEN_W1, 'Bản đầu');
    const res = await goiApi(`/v1/binh-luan/${id}`, TOKEN_W1, {
      method: 'PATCH',
      than: { noi_dung: 'Bản đã sửa' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ da_sua: true });
    expect(await dongBinhLuan(id)).toMatchObject({ noi_dung: 'Bản đã sửa', da_sua: 1 });

    const doc = await goiApi(`/v1/ticket/${TICKET}/binh-luan`, TOKEN_CHU);
    const { items } = await doc.json<{ items: { da_sua: boolean }[] }>();
    expect(items[0]?.da_sua).toBe(true);
  });

  it('ĐẠT: chủ sửa bình luận CỦA MÌNH', async () => {
    const id = await themBinhLuan(TOKEN_CHU, 'Chủ ghi');
    const res = await goiApi(`/v1/binh-luan/${id}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { noi_dung: 'Chủ ghi lại' },
    });
    expect(res.status).toBe(200);
    expect(await dongBinhLuan(id)).toMatchObject({ noi_dung: 'Chủ ghi lại', da_sua: 1 });
  });

  it('BỊ TỪ CHỐI: agent KHÁC sửa → 403 FORBIDDEN, nội dung không đổi', async () => {
    const id = await themBinhLuan(TOKEN_W1, 'Bản đầu');
    const res = await goiApi(`/v1/binh-luan/${id}`, TOKEN_W2, {
      method: 'PATCH',
      than: { noi_dung: 'Người khác sửa' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(await dongBinhLuan(id)).toMatchObject({ noi_dung: 'Bản đầu', da_sua: 0 });
  });

  it('BỊ TỪ CHỐI: CHỦ cũng không sửa được bình luận của agent (SPEC viết "tác giả")', async () => {
    const id = await themBinhLuan(TOKEN_W1, 'Agent ghi');
    const res = await goiApi(`/v1/binh-luan/${id}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { noi_dung: 'Chủ sửa lời agent' },
    });
    expect(res.status).toBe(403);
    expect(await dongBinhLuan(id)).toMatchObject({ noi_dung: 'Agent ghi', da_sua: 0 });
  });

  it('BỊ TỪ CHỐI: agent sửa bình luận của CHỦ → 403', async () => {
    const id = await themBinhLuan(TOKEN_CHU, 'Chủ ghi');
    const res = await goiApi(`/v1/binh-luan/${id}`, TOKEN_W1, {
      method: 'PATCH',
      than: { noi_dung: 'Agent sửa lời chủ' },
    });
    expect(res.status).toBe(403);
    expect(await dongBinhLuan(id)).toMatchObject({ noi_dung: 'Chủ ghi', da_sua: 0 });
  });

  it('cờ "đã sửa" bật rồi KHÔNG BAO GIỜ tắt lại', async () => {
    const id = await themBinhLuan(TOKEN_W1, 'Bản đầu');
    await goiApi(`/v1/binh-luan/${id}`, TOKEN_W1, {
      method: 'PATCH',
      than: { noi_dung: 'Bản hai' },
    });
    // Sửa lại về đúng nội dung ban đầu: cờ vẫn phải bật.
    await goiApi(`/v1/binh-luan/${id}`, TOKEN_W1, {
      method: 'PATCH',
      than: { noi_dung: 'Bản đầu' },
    });
    expect(await dongBinhLuan(id)).toMatchObject({ noi_dung: 'Bản đầu', da_sua: 1 });
  });

  it('sửa thành nội dung rỗng → 422 INVALID_INPUT, không ghi đè', async () => {
    const id = await themBinhLuan(TOKEN_W1, 'Bản đầu');
    const res = await goiApi(`/v1/binh-luan/${id}`, TOKEN_W1, {
      method: 'PATCH',
      than: { noi_dung: '   ' },
    });
    expect(res.status).toBe(422);
    expect(await dongBinhLuan(id)).toMatchObject({ noi_dung: 'Bản đầu', da_sua: 0 });
  });

  it('bình luận không tồn tại → 404', async () => {
    const res = await goiApi('/v1/binh-luan/bl-khong-co', TOKEN_CHU, {
      method: 'PATCH',
      than: { noi_dung: 'Gì cũng được' },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});

describe('SPEC mục 4 + mục 3 — AGENT KHÔNG XOÁ ĐƯỢC bình luận', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungTicket('pj-SAI', 1, 'Việc có bình luận');
    await dungAgentCoToken({
      id: 'ag-w1',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: TOKEN_W1,
      du_an: ['pj-SAI'],
    });
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_W2,
      vao_tat_ca_du_an: true,
    });
  });

  it('BỊ TỪ CHỐI: agent xoá bình luận CỦA CHÍNH MÌNH cũng 403 (hàng "không bao giờ")', async () => {
    const id = await themBinhLuan(TOKEN_W1, 'Agent ghi rồi muốn xoá');
    const res = await goiApi(`/v1/binh-luan/${id}/xoa`, TOKEN_W1, { method: 'POST' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect((await dongBinhLuan(id))?.xoa_luc).toBeNull();
  });

  it('BỊ TỪ CHỐI: agent `coordinator` cũng không xoá được — "không bao giờ" là tuyệt đối', async () => {
    const id = await themBinhLuan(TOKEN_CHU, 'Chủ ghi');
    const res = await goiApi(`/v1/binh-luan/${id}/xoa`, TOKEN_W2, { method: 'POST' });
    expect(res.status).toBe(403);
    expect((await dongBinhLuan(id))?.xoa_luc).toBeNull();
  });

  it('ĐẠT: CHỦ xoá được (`spec-questions.md` #23), xoá MỀM và biến khỏi đường đọc', async () => {
    const id = await themBinhLuan(TOKEN_W1, 'Sẽ bị chủ xoá');
    await themBinhLuan(TOKEN_CHU, 'Còn lại');

    const res = await goiApi(`/v1/binh-luan/${id}/xoa`, TOKEN_CHU, { method: 'POST' });
    expect(res.status).toBe(200);

    // Xoá **mềm**: dòng còn trong DB (SPEC mục 15 "mọi hành động có dấu vết").
    const d = await dongBinhLuan(id);
    expect(d?.xoa_luc).not.toBeNull();
    expect(d?.noi_dung).toBe('Sẽ bị chủ xoá');

    const doc = await goiApi(`/v1/ticket/${TICKET}/binh-luan`, TOKEN_CHU);
    const { items } = await doc.json<{ items: { noi_dung: string }[] }>();
    expect(items.map((b) => b.noi_dung)).toEqual(['Còn lại']);
  });

  it('bình luận đã xoá thì không sửa được nữa (tra ra 404)', async () => {
    const id = await themBinhLuan(TOKEN_W1, 'Sẽ bị chủ xoá');
    await goiApi(`/v1/binh-luan/${id}/xoa`, TOKEN_CHU, { method: 'POST' });

    const res = await goiApi(`/v1/binh-luan/${id}`, TOKEN_W1, {
      method: 'PATCH',
      than: { noi_dung: 'Sửa sau khi xoá' },
    });
    expect(res.status).toBe(404);
  });

  it('API không mở động từ DELETE nào cho bình luận (SPEC mục 3 hàng "Xoá")', async () => {
    const id = await themBinhLuan(TOKEN_CHU, 'Chủ ghi');
    expect((await goiApi(`/v1/binh-luan/${id}`, TOKEN_CHU, { method: 'DELETE' })).status).toBe(404);
    expect((await dongBinhLuan(id))?.xoa_luc).toBeNull();
  });
});
