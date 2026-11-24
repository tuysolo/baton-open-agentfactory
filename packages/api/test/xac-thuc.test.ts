/**
 * Xác thực agent bằng token, agent bị tắt, thu hồi và tạo lại token, giới hạn
 * nhịp độ — SPEC mục 3, 13, 15.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { bamToken } from '@baton/shared';
import { GIOI_HAN_MOI_PHUT, type GioiHanToken } from '../src/gioi-han-token.js';
import {
  TOKEN_CHU,
  dungAgentCoToken,
  dungDuAn,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/** Gọi API với header tuỳ ý — để thử thiếu header và header sai dạng. */
function goiApiTho(duong: string, headers: Record<string, string> = {}): Promise<Response> {
  return SELF.fetch(`https://baton.test${duong}`, { headers });
}

const TOKEN_COORD = 'bt_token_gia_cua_coordinator';
const TOKEN_WORKER = 'bt_token_gia_cua_worker';
const TOKEN_TAT = 'bt_token_gia_cua_agent_bi_tat';

async function dungDoi(): Promise<void> {
  await dungWorkspace();
  const p1 = await dungDuAn('SAI', 'Sample');
  await dungAgentCoToken({
    id: 'ag-coord',
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: TOKEN_COORD,
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({
    id: 'ag-worker',
    ten: 'W-builder',
    vai_tro: 'worker',
    token: TOKEN_WORKER,
    du_an: [p1],
  });
  await dungAgentCoToken({
    id: 'ag-tat',
    ten: 'W-da-tat',
    vai_tro: 'worker',
    token: TOKEN_TAT,
    disabled: true,
    du_an: [p1],
  });
}

describe('SPEC mục 13 — token sai thì 401 INVALID_TOKEN', () => {
  beforeEach(dungDoi);

  it('thiếu header Authorization → 401 INVALID_TOKEN', async () => {
    const res = await goiApiTho('/v1/whoami');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
  });

  it('token không có trong hệ thống → 401 INVALID_TOKEN', async () => {
    const res = await goiApi('/v1/whoami', 'bt_token_khong_ton_tai');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
  });

  it('header sai dạng (không có "Bearer ") → 401', async () => {
    const res = await goiApiTho('/v1/whoami', { authorization: TOKEN_COORD });
    expect(res.status).toBe(401);
  });

  it('token đúng → 200 và whoami cho biết agent là ai (SPEC mục 13)', async () => {
    const res = await goiApi('/v1/whoami', TOKEN_COORD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      loai: 'agent',
      agent_id: 'ag-coord',
      vai_tro: 'coordinator',
      nhan_vai_tro: 'Điều phối',
    });
  });

  it('token chủ → whoami là chủ (đường tạm của phần 1)', async () => {
    const res = await goiApi('/v1/whoami', TOKEN_CHU);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ loai: 'chu' });
  });

  it('whoami của agent kèm bảng quyền hiện hành (SPEC mục 3)', async () => {
    const res = await goiApi('/v1/whoami', TOKEN_WORKER);
    const than = await res.json<{ quyen: Record<string, string> }>();
    expect(than.quyen['create_ticket']).toBe('ticket_con_cua_luot_minh');
    expect(than.quyen['assign']).toBe('khong');
    expect(than.quyen['delete_anything']).toBe('khong_bao_gio');
  });

  it('token sai không lộ token đúng nào trong thân lỗi (SPEC mục 15)', async () => {
    const res = await goiApi('/v1/whoami', 'bt_sai');
    const chu = await res.text();
    expect(chu).not.toContain(TOKEN_COORD);
    expect(chu).not.toContain(TOKEN_CHU);
    expect(chu).not.toContain('bt_sai');
  });
});

describe('SPEC mục 3 — agent `disabled` gọi API bị từ chối', () => {
  beforeEach(dungDoi);

  it('agent bị tắt gọi đường đọc → bị từ chối (FORBIDDEN)', async () => {
    const res = await goiApi('/v1/whoami', TOKEN_TAT);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('agent bị tắt gọi đường ghi → cũng bị từ chối', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_TAT, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc của agent đã tắt' },
    });
    expect(res.status).toBe(403);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('bật lại agent thì token cũ dùng được ngay', async () => {
    await env.DB.prepare('UPDATE agent SET disabled = 0 WHERE id = ?').bind('ag-tat').run();
    const res = await goiApi('/v1/whoami', TOKEN_TAT);
    expect(res.status).toBe(200);
  });
});

describe('SPEC mục 3 — tạo lại và thu hồi token', () => {
  beforeEach(dungDoi);

  it('token hiện ĐÚNG MỘT LẦN khi tạo agent, sau đó chỉ còn 4 ký tự cuối', async () => {
    const tao = await goiApi('/v1/agent', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'M-moi', vai_tro: 'manager' },
    });
    expect(tao.status).toBe(201);
    const than = await tao.json<{ id: string; token: string; token_bon_cuoi: string }>();
    expect(than.token.startsWith('bt_')).toBe(true);
    expect(than.token_bon_cuoi).toBe(than.token.slice(-4));

    // Đọc lại agent: KHÔNG còn token thô ở bất kỳ đâu trong thân.
    const doc = await goiApi(`/v1/agent/${than.id}`, TOKEN_CHU);
    const chu = await doc.text();
    expect(chu).not.toContain(than.token);
    expect(chu).toContain(than.token_bon_cuoi);

    // Và DB chỉ giữ bản băm, không giữ token thô (SPEC mục 3, 15).
    const d = await env.DB.prepare('SELECT token_bam FROM agent WHERE id = ?')
      .bind(than.id)
      .first<{ token_bam: string }>();
    expect(d?.token_bam).toBe(await bamToken(than.token));
    expect(d?.token_bam).not.toContain(than.token);
  });

  it('token mới dùng được, token CŨ hết hiệu lực NGAY sau khi tạo lại', async () => {
    // Token cũ đang dùng được.
    expect((await goiApi('/v1/whoami', TOKEN_WORKER)).status).toBe(200);

    const tao_lai = await goiApi('/v1/agent/ag-worker/token', TOKEN_CHU, { method: 'POST' });
    expect(tao_lai.status).toBe(200);
    const { token: token_moi } = await tao_lai.json<{ token: string }>();

    // Token cũ: 401 ngay lần gọi kế tiếp.
    const cu = await goiApi('/v1/whoami', TOKEN_WORKER);
    expect(cu.status).toBe(401);
    expect(await cu.json()).toMatchObject({ error: 'INVALID_TOKEN' });

    // Token mới: dùng được, vẫn là đúng agent đó.
    const moi = await goiApi('/v1/whoami', token_moi);
    expect(moi.status).toBe(200);
    expect(await moi.json()).toMatchObject({ agent_id: 'ag-worker' });
  });

  it('thu hồi token: token đó bị từ chối, 4 ký tự cuối vẫn hiện được', async () => {
    const thu = await goiApi('/v1/agent/ag-worker/token/thu-hoi', TOKEN_CHU, { method: 'POST' });
    expect(thu.status).toBe(200);

    const res = await goiApi('/v1/whoami', TOKEN_WORKER);
    expect(res.status).toBe(401);

    const d = await env.DB.prepare(
      'SELECT token_bam, token_bon_cuoi, token_thu_hoi_luc FROM agent WHERE id = ?',
    )
      .bind('ag-worker')
      .first<{ token_bam: string | null; token_bon_cuoi: string; token_thu_hoi_luc: number }>();
    expect(d?.token_bam).toBeNull();
    expect(d?.token_bon_cuoi).toBe(TOKEN_WORKER.slice(-4));
    expect(d?.token_thu_hoi_luc).toBeGreaterThan(0);
  });

  it('chỉ chủ tạo lại hoặc thu hồi được token (SPEC mục 3)', async () => {
    for (const duong of ['/v1/agent/ag-worker/token', '/v1/agent/ag-worker/token/thu-hoi']) {
      const res = await goiApi(duong, TOKEN_COORD, { method: 'POST' });
      expect(res.status, duong).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    }
    // Và token của worker vẫn còn hiệu lực: lệnh bị từ chối thì không ghi gì.
    expect((await goiApi('/v1/whoami', TOKEN_WORKER)).status).toBe(200);
  });

  it('agent tự tạo lại token của CHÍNH MÌNH cũng không được', async () => {
    const res = await goiApi('/v1/agent/ag-worker/token', TOKEN_WORKER, { method: 'POST' });
    expect(res.status).toBe(403);
  });
});

describe('SPEC mục 15 — token thô không bao giờ xuất hiện trong response', () => {
  beforeEach(dungDoi);

  it('quét toàn thân mọi đường đọc: không có token thô nào', async () => {
    const duong = [
      '/v1/whoami',
      '/v1/du-an',
      '/v1/du-an/pj-SAI',
      '/v1/agent',
      '/v1/agent/ag-worker',
      '/v1/meta',
    ];
    for (const d of duong) {
      const chu = await (await goiApi(d, TOKEN_CHU)).text();
      for (const token of [TOKEN_CHU, TOKEN_COORD, TOKEN_WORKER, TOKEN_TAT]) {
        expect(chu, `${d} lộ token`).not.toContain(token);
      }
      // Cả bản băm cũng không được ra ngoài (SPEC mục 15).
      expect(chu, `${d} lộ băm token`).not.toContain(await bamToken(TOKEN_WORKER));
      expect(chu, `${d} có cột token_bam`).not.toContain('token_bam');
    }
  });

  it('đường ghi cũng không vọng token thô ra lại (trừ lúc tạo/tạo lại)', async () => {
    const chu = await (
      await goiApi('/v1/agent/ag-worker', TOKEN_CHU, {
        method: 'PATCH',
        than: { mo_ta: 'Worker dựng phần 1' },
      })
    ).text();
    expect(chu).not.toContain(TOKEN_WORKER);
  });
});

describe('SPEC mục 13 — giới hạn 600 request mỗi phút cho mỗi token', () => {
  beforeEach(dungDoi);

  it('bộ đếm cho qua đúng 600 request rồi chặn, kèm số giây chờ', async () => {
    const ns = env.GIOI_HAN_TOKEN;
    const stub = ns.get(ns.idFromName('token:bat-ky'));
    await runInDurableObject(stub, (dem: GioiHanToken) => {
      const moc = 1_000_000;
      for (let i = 1; i <= GIOI_HAN_MOI_PHUT; i += 1) {
        const kq = dem.dem(moc);
        expect(kq.cho_phep, `request thứ ${String(i)}`).toBe(true);
        expect(kq.da_dung).toBe(i);
      }
      // Request thứ 601 bị chặn.
      const qua = dem.dem(moc);
      expect(qua.cho_phep).toBe(false);
      expect(qua.da_dung).toBe(GIOI_HAN_MOI_PHUT + 1);
      expect(qua.retry_after).toBeGreaterThan(0);
      expect(qua.retry_after).toBeLessThanOrEqual(60);

      // Sang cửa sổ phút sau: bộ đếm mở lại.
      const sau = dem.dem(moc + 60_000);
      expect(sau.cho_phep).toBe(true);
      expect(sau.da_dung).toBe(1);
    });
  });

  it('vượt giới hạn qua HTTP → 429 RATE_LIMITED kèm Retry-After', async () => {
    // Đẩy bộ đếm của ĐÚNG token đó tới giới hạn, rồi gọi thật một lần.
    const ns = env.GIOI_HAN_TOKEN;
    const stub = ns.get(ns.idFromName(`token:${await bamToken(TOKEN_WORKER)}`));
    await runInDurableObject(stub, (dem: GioiHanToken) => {
      for (let i = 0; i < GIOI_HAN_MOI_PHUT; i += 1) dem.dem();
    });

    const res = await goiApi('/v1/whoami', TOKEN_WORKER);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'RATE_LIMITED' });
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('bộ đếm của token này không ảnh hưởng token khác', async () => {
    const ns = env.GIOI_HAN_TOKEN;
    const stub = ns.get(ns.idFromName(`token:${await bamToken(TOKEN_WORKER)}`));
    await runInDurableObject(stub, (dem: GioiHanToken) => {
      for (let i = 0; i < GIOI_HAN_MOI_PHUT; i += 1) dem.dem();
    });

    expect((await goiApi('/v1/whoami', TOKEN_WORKER)).status).toBe(429);
    // Token khác vẫn đi qua bình thường.
    expect((await goiApi('/v1/whoami', TOKEN_COORD)).status).toBe(200);
  });

  it('id của bộ đếm dẫn xuất từ BĂM token, không từ token thô (SPEC mục 15)', async () => {
    // Nếu id dùng token thô thì bộ đếm của token thật phải nằm ở `token:<thô>`.
    const ns = env.GIOI_HAN_TOKEN;
    const theo_tho = ns.get(ns.idFromName(`token:${TOKEN_WORKER}`));
    await goiApi('/v1/whoami', TOKEN_WORKER);
    const da_dung_theo_tho = await runInDurableObject(theo_tho, (dem: GioiHanToken) =>
      dem.dem().da_dung,
    );
    // Bộ đếm "theo token thô" chưa từng được dùng → request này là request đầu.
    expect(da_dung_theo_tho).toBe(1);

    const theo_bam = ns.get(ns.idFromName(`token:${await bamToken(TOKEN_WORKER)}`));
    const da_dung_theo_bam = await runInDurableObject(theo_bam, (dem: GioiHanToken) =>
      dem.dem().da_dung,
    );
    // Còn bộ đếm "theo băm" đã đếm lần gọi thật ở trên.
    expect(da_dung_theo_bam).toBe(2);
  });
});
