/**
 * Agent và bảng quyền qua đường API — SPEC mục 3.
 *
 * Phần quyền **thuần** (36 ô) nằm ở `quyen.test.ts`. File này kiểm đường đi
 * thật: chủ tạo agent, chỉnh từng ô quyền, và ô đã chỉnh đổi hành vi của API.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { TOKEN_CHU, dungAgentCoToken, dungDuAn, dungWorkspace, goiApi } from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const TOKEN_COORD = 'bt_token_coord_agent_test';
const TOKEN_WORKER = 'bt_token_worker_agent_test';

async function dungNen(): Promise<void> {
  await dungWorkspace();
  await dungDuAn('SAI', 'Sample');
  await dungDuAn('INC', 'INC');
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
    du_an: ['pj-SAI'],
  });
}

describe('SPEC mục 3 — tạo agent', () => {
  beforeEach(dungNen);

  it('chủ tạo agent với tên, vai trò, model, mô tả, danh sách dự án', async () => {
    const res = await goiApi('/v1/agent', TOKEN_CHU, {
      method: 'POST',
      than: {
        ten: 'M-Sample',
        vai_tro: 'manager',
        model: 'claude-opus-5',
        mo_ta: 'Manager dự án Sample',
        du_an_duoc_vao: ['pj-SAI'],
      },
    });
    expect(res.status).toBe(201);
    const than = await res.json<{ id: string; token: string }>();

    const doc = await goiApi(`/v1/agent/${than.id}`, TOKEN_CHU);
    expect(await doc.json()).toMatchObject({
      ten: 'M-Sample',
      vai_tro: 'manager',
      nhan_vai_tro: 'Quản lý',
      model: 'claude-opus-5',
      disabled: false,
      vao_tat_ca_du_an: false,
      du_an_duoc_vao: ['pj-SAI'],
      trang_thai: 'idle',
      nhan_trang_thai: 'Rảnh',
    });
  });

  it('CHỈ CHỦ tạo được agent', async () => {
    const res = await goiApi('/v1/agent', TOKEN_COORD, {
      method: 'POST',
      than: { ten: 'Agent tự nhân bản', vai_tro: 'worker' },
    });
    expect(res.status).toBe(403);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM agent').first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it('tên agent DUY NHẤT trong workspace → INVALID_INPUT', async () => {
    const res = await goiApi('/v1/agent', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'CoS', vai_tro: 'manager' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it.each([['coordinator'], ['manager'], ['worker'], ['reviewer']])(
    'vai trò "%s" được nhận (đúng 4 vai trò của SPEC)',
    async (vai_tro) => {
      const res = await goiApi('/v1/agent', TOKEN_CHU, {
        method: 'POST',
        than: { ten: `A-${vai_tro}`, vai_tro },
      });
      expect(res.status).toBe(201);
    },
  );

  it.each([['admin'], ['Coordinator'], [''], ['worker,reviewer']])(
    'vai trò lạ "%s" → INVALID_INPUT (một agent có ĐÚNG 1 vai trò)',
    async (vai_tro) => {
      const res = await goiApi('/v1/agent', TOKEN_CHU, {
        method: 'POST',
        than: { ten: `A-la-${String(vai_tro)}`, vai_tro },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
    },
  );

  it('danh sách dự án có id không tồn tại → NOT_FOUND, không tạo agent nửa vời', async () => {
    const res = await goiApi('/v1/agent', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'A-du-an-la', vai_tro: 'worker', du_an_duoc_vao: ['pj-SAI', 'pj-khong-co'] },
    });
    expect(res.status).toBe(404);
    const d = await env.DB.prepare('SELECT count(*) AS n FROM agent WHERE ten = ?')
      .bind('A-du-an-la')
      .first<{ n: number }>();
    expect(d?.n).toBe(0);
  });

  it('cờ "tất cả dự án" thay cho danh sách (SPEC mục 3)', async () => {
    const res = await goiApi('/v1/agent', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'A-tat-ca', vai_tro: 'coordinator', vao_tat_ca_du_an: true },
    });
    const { id, token } = await res.json<{ id: string; token: string }>();

    const doc = await goiApi(`/v1/agent/${id}`, TOKEN_CHU);
    expect(await doc.json()).toMatchObject({ vao_tat_ca_du_an: true, du_an_duoc_vao: [] });

    // Và cờ đó cho agent vào mọi dự án, kể cả dự án tạo sau.
    const whoami = await goiApi('/v1/whoami', token);
    expect(await whoami.json()).toMatchObject({ vao_tat_ca_du_an: true });
    expect(
      (
        await goiApi('/v1/ticket', token, {
          method: 'POST',
          than: { project_id: 'pj-INC', tieu_de: 'Việc trong dự án bất kỳ' },
        })
      ).status,
    ).toBe(201);
  });
});

describe('SPEC mục 3 — bật/tắt agent', () => {
  beforeEach(dungNen);

  it('chủ tắt agent: agent đó gọi API bị từ chối, trạng thái thành `disabled`', async () => {
    const tat = await goiApi('/v1/agent/ag-worker', TOKEN_CHU, {
      method: 'PATCH',
      than: { disabled: true },
    });
    expect(tat.status).toBe(200);

    expect((await goiApi('/v1/whoami', TOKEN_WORKER)).status).toBe(403);

    const doc = await goiApi('/v1/agent/ag-worker', TOKEN_CHU);
    expect(await doc.json()).toMatchObject({
      disabled: true,
      trang_thai: 'disabled',
      nhan_trang_thai: 'Đã tắt',
    });
  });

  it('chỉ chủ tắt được agent', async () => {
    const res = await goiApi('/v1/agent/ag-worker', TOKEN_COORD, {
      method: 'PATCH',
      than: { disabled: true },
    });
    expect(res.status).toBe(403);
  });

  it('đổi danh sách dự án được vào thì phạm vi đổi theo ngay', async () => {
    // Trước: chỉ vào được SAI.
    expect((await goiApi('/v1/du-an/pj-INC', TOKEN_WORKER)).status).toBe(404);

    await goiApi('/v1/agent/ag-worker', TOKEN_CHU, {
      method: 'PATCH',
      than: { du_an_duoc_vao: ['pj-INC'] },
    });

    // Sau: vào được INC, không còn vào được SAI (danh sách thay toàn bộ).
    expect((await goiApi('/v1/du-an/pj-INC', TOKEN_WORKER)).status).toBe(200);
    expect((await goiApi('/v1/du-an/pj-SAI', TOKEN_WORKER)).status).toBe(404);
  });
});

describe('SPEC mục 3 — chủ chỉnh từng ô bảng quyền qua API', () => {
  beforeEach(dungNen);

  it('mặc định: worker không tạo được ticket thường (ô "ticket con của lượt mình")', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc worker tự tạo' },
    });
    expect(res.status).toBe(403);
  });

  it('chủ nới ô "Tạo ticket" của worker thành "mọi dự án được vào" → tạo được', async () => {
    const dat = await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });
    expect(dat.status).toBe(200);

    const res = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc worker tạo sau khi được nới quyền' },
    });
    expect(res.status).toBe(201);

    // Nhưng cửa dự án không nới theo: INC vẫn ngoài phạm vi.
    expect(
      (
        await goiApi('/v1/ticket', TOKEN_WORKER, {
          method: 'POST',
          than: { project_id: 'pj-INC', tieu_de: 'Việc ngoài phạm vi' },
        })
      ).status,
    ).toBe(403);
  });

  it('bỏ ghi đè (không gửi cho_phep) thì ô về mặc định của vai trò', async () => {
    await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });
    expect(
      (
        await goiApi('/v1/ticket', TOKEN_WORKER, {
          method: 'POST',
          than: { project_id: 'pj-SAI', tieu_de: 'Có quyền' },
        })
      ).status,
    ).toBe(201);

    const bo = await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: {},
    });
    expect(bo.status).toBe(200);
    expect(await bo.json()).toMatchObject({ cho_phep: null });

    const n = await env.DB.prepare('SELECT count(*) AS n FROM agent_permission').first<{
      n: number;
    }>();
    expect(n?.n).toBe(0);

    expect(
      (
        await goiApi('/v1/ticket', TOKEN_WORKER, {
          method: 'POST',
          than: { project_id: 'pj-SAI', tieu_de: 'Lại không có quyền' },
        })
      ).status,
    ).toBe(403);
  });

  it('chủ tắt một ô mà vai trò vốn có: coordinator mất quyền đổi ticket', async () => {
    const tao = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc để thử quyền' },
    });
    const { id } = await tao.json<{ id: string }>();

    expect(
      (
        await goiApi(`/v1/ticket/${id}`, TOKEN_COORD, {
          method: 'PATCH',
          than: { tieu_de: 'Coordinator đổi được' },
        })
      ).status,
    ).toBe(200);

    await goiApi('/v1/agent/ag-coord/quyen/change_status', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: false },
    });

    const res = await goiApi(`/v1/ticket/${id}`, TOKEN_COORD, {
      method: 'PATCH',
      than: { tieu_de: 'Giờ thì không' },
    });
    expect(res.status).toBe(403);
  });

  it('ghi đè là THEO TỪNG AGENT, không theo vai trò', async () => {
    await dungAgentCoToken({
      id: 'ag-worker-2',
      ten: 'W-builder-2',
      vai_tro: 'worker',
      token: 'bt_token_worker_hai',
      du_an: ['pj-SAI'],
    });
    await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });

    expect(
      (
        await goiApi('/v1/ticket', TOKEN_WORKER, {
          method: 'POST',
          than: { project_id: 'pj-SAI', tieu_de: 'Agent được nới' },
        })
      ).status,
    ).toBe(201);
    // Agent worker khác không được nới.
    expect(
      (
        await goiApi('/v1/ticket', 'bt_token_worker_hai', {
          method: 'POST',
          than: { project_id: 'pj-SAI', tieu_de: 'Agent không được nới' },
        })
      ).status,
    ).toBe(403);
  });

  it('CHỈ CHỦ chỉnh được quyền', async () => {
    const res = await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_COORD, {
      method: 'PUT',
      than: { cho_phep: true },
    });
    expect(res.status).toBe(403);
  });

  it('agent không tự nới quyền của chính mình được', async () => {
    const res = await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_WORKER, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'co' },
    });
    expect(res.status).toBe(403);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM agent_permission').first<{
      n: number;
    }>();
    expect(n?.n).toBe(0);
  });

  it('việc không có trong bảng quyền → INVALID_INPUT', async () => {
    const res = await goiApi('/v1/agent/ag-worker/quyen/lam_bat_cu_gi', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true },
    });
    expect(res.status).toBe(422);
  });

  it('phạm vi lạ → INVALID_INPUT', async () => {
    const res = await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_thu' },
    });
    expect(res.status).toBe(422);
  });
});

describe('SPEC mục 3 — đổi vai trò thì quyền về mặc định của vai trò MỚI', () => {
  beforeEach(dungNen);

  it('ô ghi đè của vai trò cũ bị dọn khi đổi vai trò', async () => {
    // Nới `create_ticket` cho một `worker`.
    await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });
    const truoc = await env.DB.prepare(
      'SELECT count(*) AS n FROM agent_permission WHERE agent_id = ?',
    )
      .bind('ag-worker')
      .first<{ n: number }>();
    expect(truoc?.n).toBe(1);

    // Đổi nó thành `coordinator`.
    const doi = await goiApi('/v1/agent/ag-worker', TOKEN_CHU, {
      method: 'PATCH',
      than: { vai_tro: 'coordinator' },
    });
    expect(doi.status).toBe(200);
    expect(await doi.json()).toMatchObject({
      da_doi: expect.arrayContaining(['vai_tro', 'quyen_ve_mac_dinh_vai_tro']),
    });

    // Ô ghi đè đã bị dọn: quyền hiện hành là **mặc định của coordinator**.
    const sau = await env.DB.prepare(
      'SELECT count(*) AS n FROM agent_permission WHERE agent_id = ?',
    )
      .bind('ag-worker')
      .first<{ n: number }>();
    expect(sau?.n).toBe(0);

    const who = await goiApi('/v1/whoami', TOKEN_WORKER);
    const than = await who.json<{ vai_tro: string; quyen: Record<string, string> }>();
    expect(than.vai_tro).toBe('coordinator');
    expect(than.quyen['create_ticket']).toBe('moi_du_an_duoc_vao');
    expect(than.quyen['create_ask']).toBe('co');
  });

  it('ô SIẾT của vai trò cũ không theo sang vai trò mới', async () => {
    // Tắt `submit_evidence` của coordinator...
    await goiApi('/v1/agent/ag-coord/quyen/submit_evidence', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: false },
    });
    let who = await goiApi('/v1/whoami', TOKEN_COORD);
    expect((await who.json<{ quyen: Record<string, string> }>()).quyen['submit_evidence']).toBe(
      'khong',
    );

    // ...rồi đổi thành reviewer: ô siết đó phải mất, vì nó được đặt cho vai trò cũ.
    await goiApi('/v1/agent/ag-coord', TOKEN_CHU, {
      method: 'PATCH',
      than: { vai_tro: 'reviewer' },
    });
    who = await goiApi('/v1/whoami', TOKEN_COORD);
    const than = await who.json<{ vai_tro: string; quyen: Record<string, string> }>();
    expect(than.vai_tro).toBe('reviewer');
    expect(than.quyen['submit_evidence']).toBe('co');
  });

  it('đặt LẠI đúng vai trò cũ thì KHÔNG dọn quyền (không phải thay đổi)', async () => {
    await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });
    const res = await goiApi('/v1/agent/ag-worker', TOKEN_CHU, {
      method: 'PATCH',
      than: { vai_tro: 'worker' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ da_doi: ['vai_tro'] });

    const n = await env.DB.prepare(
      'SELECT count(*) AS n FROM agent_permission WHERE agent_id = ?',
    )
      .bind('ag-worker')
      .first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('sửa trường khác (không đổi vai trò) không dọn quyền', async () => {
    await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });
    await goiApi('/v1/agent/ag-worker', TOKEN_CHU, {
      method: 'PATCH',
      than: { mo_ta: 'Mô tả mới' },
    });
    const n = await env.DB.prepare(
      'SELECT count(*) AS n FROM agent_permission WHERE agent_id = ?',
    )
      .bind('ag-worker')
      .first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('dọn quyền chỉ áp cho agent được đổi vai trò, không lan sang agent khác', async () => {
    await goiApi('/v1/agent/ag-coord/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: false },
    });
    await goiApi('/v1/agent/ag-worker/quyen/create_ticket', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });

    await goiApi('/v1/agent/ag-worker', TOKEN_CHU, {
      method: 'PATCH',
      than: { vai_tro: 'manager' },
    });

    const { results } = await env.DB.prepare('SELECT agent_id FROM agent_permission').all<{
      agent_id: string;
    }>();
    expect(results.map((r) => r.agent_id)).toEqual(['ag-coord']);
  });
});

describe('SPEC mục 3 — hai hàng "không bao giờ" không ghi đè được qua API', () => {
  beforeEach(dungNen);

  it.each([['delete_anything'], ['resolve_ask']])(
    'chủ cố bật ô "%s" → FORBIDDEN, không có dòng nào vào agent_permission',
    async (viec) => {
      const res = await goiApi(`/v1/agent/ag-coord/quyen/${viec}`, TOKEN_CHU, {
        method: 'PUT',
        than: { cho_phep: true, pham_vi: 'co' },
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });

      const n = await env.DB.prepare(
        'SELECT count(*) AS n FROM agent_permission WHERE viec = ?',
      )
        .bind(viec)
        .first<{ n: number }>();
      expect(n?.n).toBe(0);
    },
  );

  it.each([['delete_anything'], ['resolve_ask']])(
    'DB cũng không nhận "%s" trong agent_permission (hàng rào cuối)',
    async (viec) => {
      await expect(
        env.DB.prepare(
          `INSERT INTO agent_permission (workspace_id, agent_id, viec, cho_phep, cap_nhat_luc)
           VALUES ('ws-test', 'ag-coord', ?, 1, 0)`,
        )
          .bind(viec)
          .run(),
      ).rejects.toThrow();
    },
  );

  it('API không có động từ DELETE nào cho agent (hàng "Xoá bất cứ thứ gì")', async () => {
    const duong = ['/v1/du-an/pj-SAI', '/v1/agent/ag-worker', '/v1/ticket/khong-quan-trong'];
    for (const d of duong) {
      const res = await goiApi(d, TOKEN_COORD, { method: 'DELETE' });
      // 404 = không có đường DELETE nào được khai.
      expect(res.status, d).toBe(404);
    }
  });
});

describe('SPEC mục 3 — lần cuối lên tiếng', () => {
  beforeEach(dungNen);

  it('lệnh GHI thành công nhích mốc "lần cuối lên tiếng" của agent', async () => {
    const truoc = await env.DB.prepare('SELECT len_tieng_luc FROM agent WHERE id = ?')
      .bind('ag-coord')
      .first<{ len_tieng_luc: number | null }>();
    expect(truoc?.len_tieng_luc).toBeNull();

    const moc = Date.now() - 1;
    const res = await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc làm agent lên tiếng' },
    });
    expect(res.status).toBe(201);

    const sau = await env.DB.prepare('SELECT len_tieng_luc FROM agent WHERE id = ?')
      .bind('ag-coord')
      .first<{ len_tieng_luc: number }>();
    expect(sau?.len_tieng_luc).toBeGreaterThanOrEqual(moc);
  });

  it('lệnh ĐỌC KHÔNG tính là lên tiếng (SPEC mục 6 "Lệnh đọc không tính")', async () => {
    await goiApi('/v1/whoami', TOKEN_COORD);
    await goiApi('/v1/du-an', TOKEN_COORD);
    await goiApi('/v1/du-an/pj-SAI', TOKEN_COORD);
    await goiApi('/v1/agent', TOKEN_COORD);

    const d = await env.DB.prepare('SELECT len_tieng_luc FROM agent WHERE id = ?')
      .bind('ag-coord')
      .first<{ len_tieng_luc: number | null }>();
    expect(d?.len_tieng_luc).toBeNull();
  });

  it('lệnh ghi bị TỪ CHỐI không nhích mốc', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc worker không có quyền tạo' },
    });
    expect(res.status).toBe(403);

    const d = await env.DB.prepare('SELECT len_tieng_luc FROM agent WHERE id = ?')
      .bind('ag-worker')
      .first<{ len_tieng_luc: number | null }>();
    expect(d?.len_tieng_luc).toBeNull();
  });

  it('lệnh ghi của CHỦ không nhích mốc của agent nào', async () => {
    await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Chủ tự tạo' },
    });
    const { results } = await env.DB.prepare(
      'SELECT len_tieng_luc FROM agent',
    ).all<{ len_tieng_luc: number | null }>();
    for (const d of results) expect(d.len_tieng_luc).toBeNull();
  });

  it('mốc chỉ nhích về sau, không chạy lùi', async () => {
    await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Lần một' },
    });
    const mot = await env.DB.prepare('SELECT len_tieng_luc FROM agent WHERE id = ?')
      .bind('ag-coord')
      .first<{ len_tieng_luc: number }>();

    // Đặt mốc về tương lai rồi ghi tiếp: `max()` giữ mốc lớn hơn.
    const tuong_lai = Date.now() + 1_000_000;
    await env.DB.prepare('UPDATE agent SET len_tieng_luc = ? WHERE id = ?')
      .bind(tuong_lai, 'ag-coord')
      .run();
    await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Lần hai' },
    });
    const hai = await env.DB.prepare('SELECT len_tieng_luc FROM agent WHERE id = ?')
      .bind('ag-coord')
      .first<{ len_tieng_luc: number }>();

    expect(hai?.len_tieng_luc).toBe(tuong_lai);
    expect(hai?.len_tieng_luc).toBeGreaterThan(mot?.len_tieng_luc ?? 0);
  });

  it('trang agent hiện mốc lên tiếng (SPEC mục 3)', async () => {
    await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc' },
    });
    const res = await goiApi('/v1/agent/ag-coord', TOKEN_CHU);
    const than = await res.json<{ len_tieng_luc: number | null }>();
    expect(than.len_tieng_luc).toBeGreaterThan(0);
  });
});
