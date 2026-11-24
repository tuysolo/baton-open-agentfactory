/**
 * **Chống leo quyền qua thân request** — SPEC mục 3 (bảng quyền).
 *
 * Lỗ mà reviewer lượt 2 tìm ra: tầng HTTP `spread` nguyên thân request vào lệnh
 * của cửa ghi, nên client gửi thêm một trường là **tự khai phạm vi quyền của
 * mình**:
 *
 * ```
 * PATCH /v1/ticket/<id>   {"tieu_de":"x","ticket_cua_luot_minh":true}
 * ```
 *
 * làm `quyen('change_status', { ticket_cua_luot_minh: true })` cho qua, nên một
 * agent `worker` sửa được **mọi** ticket trong dự án nó được vào — trong khi SPEC
 * chỉ cho "ticket của lượt mình". 410 test của lượt 2 vẫn xanh vì **không có test
 * nào ở tầng HTTP** gửi trường lạ; file này là test đó.
 *
 * Hai hàng rào được kiểm ở đây:
 *   1. Các cờ phạm vi **không nằm trong kiểu lệnh nào** (`phamViLuotGiao` dựng
 *      chúng trong cửa ghi, từ DB).
 *   2. Tầng HTTP chỉ chép những trường trong whitelist `TRUONG_CLIENT`.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { TRUONG_CLIENT } from '../src/index.js';
import { SO_DANG_KY_HANDLER } from '../src/lenh.js';
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

const TOKEN_WORKER = 'bt_token_worker_leo_quyen';
const TOKEN_REVIEWER = 'bt_token_reviewer_leo_quyen';
const TOKEN_MGR = 'bt_token_manager_leo_quyen';

let ticket_cua_nguoi_khac = '';

beforeEach(async () => {
  await dungWorkspace();
  const sai = await dungDuAn('SAI', 'Sample');
  await dungDuAn('INC', 'INC');
  // Ticket có thật trong dự án worker ĐƯỢC VÀO, nhưng **không** thuộc lượt giao
  // nào của nó (lượt này chưa có lượt giao nào cả).
  ticket_cua_nguoi_khac = await dungTicket(sai, 1, 'Việc của người khác');

  await dungAgentCoToken({
    id: 'ag-worker',
    ten: 'W-builder',
    vai_tro: 'worker',
    token: TOKEN_WORKER,
    du_an: [sai],
  });
  await dungAgentCoToken({
    id: 'ag-reviewer',
    ten: 'W-reviewer',
    vai_tro: 'reviewer',
    token: TOKEN_REVIEWER,
    du_an: [sai],
  });
  await dungAgentCoToken({
    id: 'ag-mgr',
    ten: 'M-Sample',
    vai_tro: 'manager',
    token: TOKEN_MGR,
    du_an: [sai],
  });
});

/* ------------------------------------------------------------------ *
 * Giúp việc: toàn bộ dữ liệu trong DB thành một chuỗi
 * ------------------------------------------------------------------ */

/**
 * Dump mọi dòng của mọi bảng nghiệp vụ thành JSON.
 *
 * Dùng để khẳng định một giá trị **không** tới được dữ liệu đã ghi, ở bất kỳ
 * bảng hay cột nào — mạnh hơn việc đoán trước nó sẽ lọt vào cột nào.
 */
async function toanBoDuLieu(): Promise<string> {
  const { results: bang } = await env.DB.prepare(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'
      ORDER BY name`,
  ).all<{ name: string }>();

  expect(bang.length, 'không tìm thấy bảng nào — truy vấn dump bị sai').toBeGreaterThan(5);

  const phan: string[] = [];
  for (const b of bang) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${b.name}`).all();
    phan.push(`${b.name}: ${JSON.stringify(results)}`);
  }
  return phan.join('\n');
}

/* ------------------------------------------------------------------ *
 * CHẶN 2 — worker tự khai "ticket của lượt mình"
 * ------------------------------------------------------------------ */
describe('worker KHÔNG tự khai được "ticket của lượt mình" (SPEC mục 3)', () => {
  it('PATCH ticket kèm ticket_cua_luot_minh: true → FORBIDDEN', async () => {
    const res = await goiApi(`/v1/ticket/${ticket_cua_nguoi_khac}`, TOKEN_WORKER, {
      method: 'PATCH',
      than: { tieu_de: 'Worker leo quyền', ticket_cua_luot_minh: true },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });

    const d = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
      .bind(ticket_cua_nguoi_khac)
      .first<{ tieu_de: string }>();
    expect(d?.tieu_de).toBe('Việc của người khác');
  });

  it.each([
    [true],
    ['true'],
    [1],
    ['co'],
    [{ ticket_id: 'bat_ky' }],
  ])('mọi hình dạng giá trị của cờ đều vô hiệu: %j → FORBIDDEN', async (gia_tri) => {
    const res = await goiApi(`/v1/ticket/${ticket_cua_nguoi_khac}`, TOKEN_WORKER, {
      method: 'PATCH',
      than: { tieu_de: 'Thử hình dạng khác', ticket_cua_luot_minh: gia_tri },
    });
    expect(res.status).toBe(403);
  });

  it('không có cờ cũng FORBIDDEN — hành vi đúng là từ chối, không phải nhờ bỏ cờ', async () => {
    const res = await goiApi(`/v1/ticket/${ticket_cua_nguoi_khac}`, TOKEN_WORKER, {
      method: 'PATCH',
      than: { tieu_de: 'Không kèm cờ' },
    });
    expect(res.status).toBe(403);
  });

  it('reviewer cũng không khai được (ô "Đổi trạng thái ticket" × reviewer là "—")', async () => {
    const res = await goiApi(`/v1/ticket/${ticket_cua_nguoi_khac}`, TOKEN_REVIEWER, {
      method: 'PATCH',
      than: { tieu_de: 'Reviewer leo quyền', ticket_cua_luot_minh: true },
    });
    expect(res.status).toBe(403);
  });

  it('manager thì sửa được vì ô của nó là "trong dự án", không phải nhờ cờ', async () => {
    // Đối chứng: nếu test này đỏ thì bản sửa đã khoá quá tay, không phải chỉ bịt lỗ.
    const res = await goiApi(`/v1/ticket/${ticket_cua_nguoi_khac}`, TOKEN_MGR, {
      method: 'PATCH',
      than: { tieu_de: 'Manager sửa trong dự án' },
    });
    expect(res.status).toBe(200);
  });

  it('manager vẫn không sửa được ticket ngoài dự án nó được vào', async () => {
    const inc = await dungTicket('pj-INC', 1, 'Việc dự án INC');
    const res = await goiApi(`/v1/ticket/${inc}`, TOKEN_MGR, {
      method: 'PATCH',
      than: { tieu_de: 'Vượt phạm vi', ticket_cua_luot_minh: true },
    });
    // BAT-58: trước ghim 403; nay ticket ngoài phạm vi ra 404 giống hệt id bịa
    // (19.12 câu 15, `cau-hoi-spec.md` #176). Vẫn không sửa được — đó là điều ca này canh.
    expect(res.status).toBe(404);
    expect(
      await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?').bind(inc).first('tieu_de'),
    ).toBe('Việc dự án INC');
  });
});

/* ------------------------------------------------------------------ *
 * CHẶN 3 + 4 — worker tự khai "ticket con của lượt mình đang làm"
 * ------------------------------------------------------------------ */
describe('worker KHÔNG tự khai được "ticket con của lượt mình đang làm"', () => {
  it('POST ticket kèm ticket_cha_cua_luot_minh: true → FORBIDDEN, không tạo gì', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: {
        project_id: 'pj-SAI',
        tieu_de: 'Ticket worker tự cho mình quyền tạo',
        ticket_cha_cua_luot_minh: true,
      },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });

    const n = await env.DB.prepare(
      "SELECT count(*) AS n FROM ticket WHERE tieu_de LIKE '%tự cho mình quyền%'",
    ).first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('kèm CẢ ticket_cha_id thật VÀ cờ → vẫn FORBIDDEN (cờ chỉ server dựng được)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: {
        project_id: 'pj-SAI',
        tieu_de: 'Ticket con giả mạo',
        ticket_cha_id: ticket_cua_nguoi_khac,
        ticket_cha_cua_luot_minh: true,
      },
    });
    expect(res.status).toBe(403);
  });

  /**
   * CHẶN 4: ô "ticket **con** của lượt mình đang làm" phải đòi **có cha thật**.
   * Kể cả khi phần 2 đã nối nguồn dữ liệu lượt giao, một `worker` cũng không được
   * tạo ticket **không có cha** — chữ "con" trong SPEC là một điều kiện, không
   * phải lời mô tả.
   */
  it('CHẶN 4: worker tạo ticket KHÔNG có ticket_cha_id → FORBIDDEN', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Ticket không có cha' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('CHẶN 4: ticket_cha_id = null cũng là "không có cha" → FORBIDDEN', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Cha null', ticket_cha_id: null },
    });
    expect(res.status).toBe(403);
  });

  it('reviewer không tạo ticket được dù khai gì (ô "Tạo ticket" × reviewer là "—")', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_REVIEWER, {
      method: 'POST',
      than: {
        project_id: 'pj-SAI',
        tieu_de: 'Reviewer tạo ticket',
        ticket_cha_id: ticket_cua_nguoi_khac,
        ticket_cha_cua_luot_minh: true,
      },
    });
    expect(res.status).toBe(403);
  });
});

/* ------------------------------------------------------------------ *
 * CHẶN 1 — whitelist trường: test tổng quát chống tái phát
 * ------------------------------------------------------------------ */
describe('whitelist trường: thân request không bơm được trường lạ vào dữ liệu', () => {
  /** Mỗi ca: một đường ghi + thân hợp lệ, rồi đính thêm trường rác. */
  const DUONG_GHI: {
    ten: string;
    duong: string;
    method: string;
    than_hop_le: Record<string, unknown>;
  }[] = [
    {
      ten: 'POST /v1/du-an',
      duong: '/v1/du-an',
      method: 'POST',
      than_hop_le: { ten: 'Dự án mới', ma: 'ZZZ' },
    },
    {
      ten: 'PATCH /v1/du-an/:id',
      duong: '/v1/du-an/pj-SAI',
      method: 'PATCH',
      than_hop_le: { ten: 'Sample đổi tên' },
    },
    {
      ten: 'POST /v1/agent',
      duong: '/v1/agent',
      method: 'POST',
      than_hop_le: { ten: 'A-moi-toanh', vai_tro: 'worker' },
    },
    {
      ten: 'PATCH /v1/agent/:id',
      duong: '/v1/agent/ag-worker',
      method: 'PATCH',
      than_hop_le: { mo_ta: 'Mô tả mới' },
    },
    {
      ten: 'POST /v1/ticket',
      duong: '/v1/ticket',
      method: 'POST',
      than_hop_le: { project_id: 'pj-SAI', tieu_de: 'Việc mới' },
    },
    {
      ten: 'PATCH /v1/ticket/:id',
      duong: `/v1/ticket/`,
      method: 'PATCH',
      than_hop_le: { tieu_de: 'Tiêu đề mới' },
    },
    {
      ten: 'PUT /v1/agent/:id/quyen/:viec',
      duong: '/v1/agent/ag-worker/quyen/create_ticket',
      method: 'PUT',
      than_hop_le: { cho_phep: true },
    },
    {
      ten: 'POST /v1/agent/:id/token',
      duong: '/v1/agent/ag-worker/token',
      method: 'POST',
      than_hop_le: {},
    },
    {
      ten: 'POST /v1/agent/:id/token/thu-hoi',
      duong: '/v1/agent/ag-worker/token/thu-hoi',
      method: 'POST',
      than_hop_le: {},
    },
  ];

  it.each(DUONG_GHI)('$ten: trường rác và trường nội bộ không tới được dữ liệu', async (ca) => {
    const DAU = 'RAC_KHONG_BAO_GIO_DUOC_GHI_7f3a9c';
    const duong = ca.duong === '/v1/ticket/' ? `/v1/ticket/${ticket_cua_nguoi_khac}` : ca.duong;

    const res = await goiApi(duong, TOKEN_CHU, {
      method: ca.method,
      than: {
        ...ca.than_hop_le,
        // Trường hoàn toàn lạ.
        truong_rac: DAU,
        // Trường **nội bộ** của lệnh: client không được khai.
        ticket_cua_luot_minh: true,
        ticket_cha_cua_luot_minh: true,
        // Trường server tự dựng: không được ghi đè.
        ai: { loai: 'chu', dau_vet: DAU },
        workspace_id: `ws-gia-${DAU}`,
        loai: 'dat_quyen',
        // Cột DB không thuộc lệnh nào.
        token_bam: DAU,
        len_tieng_luc: 99,
        disabled_khong_dung_ten: DAU,
        so: 999,
        xoa_luc: 1,
      },
    });

    // Lệnh vẫn phải chạy được bằng phần thân hợp lệ (whitelist không chặn oan).
    expect([200, 201], `${ca.ten} → ${String(res.status)}`).toContain(res.status);

    const du_lieu = await toanBoDuLieu();
    expect(du_lieu, `${ca.ten}: trường rác lọt vào DB`).not.toContain(DAU);
    // Và không có dòng nào nhảy sang workspace giả.
    expect(du_lieu).not.toContain('ws-gia-');
  });

  it('thân request không ghi đè được `workspace_id`: dữ liệu vẫn ở workspace thật', async () => {
    const res = await goiApi('/v1/du-an', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'Dự án thử', ma: 'WSX', workspace_id: 'ws-khac-hoan-toan' },
    });
    expect(res.status).toBe(201);
    const d = await env.DB.prepare('SELECT workspace_id FROM project WHERE ma = ?')
      .bind('WSX')
      .first<{ workspace_id: string }>();
    expect(d?.workspace_id).toBe('ws-test');
  });

  it('thân request không ghi đè được `ai`: agent không tự khai mình là chủ', async () => {
    // `worker` không tạo được dự án (SPEC mục 2 "chủ tạo"). Khai `ai` kiểu chủ
    // trong thân request không được đổi gì.
    const res = await goiApi('/v1/du-an', TOKEN_WORKER, {
      method: 'POST',
      than: { ten: 'Dự án của worker', ma: 'WKR', ai: { loai: 'chu' } },
    });
    expect(res.status).toBe(403);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM project WHERE ma = 'WKR'").first<{
      n: number;
    }>();
    expect(n?.n).toBe(0);
  });

  it('thân request không ghi đè được `loai` của lệnh', async () => {
    // Nếu `loai` đi được từ thân request thì một đường bất kỳ chạy được lệnh khác.
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc thật', loai: 'thu_hoi_token', agent_id: 'ag-worker' },
    });
    expect(res.status).toBe(201);
    // Token của worker vẫn còn nguyên, tức lệnh `thu_hoi_token` KHÔNG chạy.
    const d = await env.DB.prepare('SELECT token_bam FROM agent WHERE id = ?')
      .bind('ag-worker')
      .first<{ token_bam: string | null }>();
    expect(d?.token_bam).not.toBeNull();
  });

  it('id trong ĐƯỜNG DẪN thắng id trong thân request (không đổi mục tiêu)', async () => {
    // `project_id` trong thân không được chuyển hướng lệnh sang dự án khác.
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_CHU, {
      method: 'PATCH',
      than: { ten: 'Tên đã đổi', project_id: 'pj-INC' },
    });
    expect(res.status).toBe(200);

    const sai = await env.DB.prepare("SELECT ten FROM project WHERE id = 'pj-SAI'").first<{
      ten: string;
    }>();
    const inc = await env.DB.prepare("SELECT ten FROM project WHERE id = 'pj-INC'").first<{
      ten: string;
    }>();
    expect(sai?.ten).toBe('Tên đã đổi');
    expect(inc?.ten).toBe('INC');
  });

  it('agent_id trong đường dẫn thắng agent_id trong thân request', async () => {
    const res = await goiApi('/v1/agent/ag-worker', TOKEN_CHU, {
      method: 'PATCH',
      than: { mo_ta: 'Chỉ sửa worker', agent_id: 'ag-reviewer' },
    });
    expect(res.status).toBe(200);

    const w = await env.DB.prepare("SELECT mo_ta FROM agent WHERE id = 'ag-worker'").first<{
      mo_ta: string | null;
    }>();
    const r = await env.DB.prepare("SELECT mo_ta FROM agent WHERE id = 'ag-reviewer'").first<{
      mo_ta: string | null;
    }>();
    expect(w?.mo_ta).toBe('Chỉ sửa worker');
    expect(r?.mo_ta).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Hàng rào CẤU TRÚC: không cờ phạm vi nào được client gửi lên
 * ------------------------------------------------------------------ *
 * Hai test dưới đây là thứ **phát hiện được tái phát**.
 *
 * Các test hành vi ở trên vẫn xanh kể cả khi whitelist bị bỏ (đã thử bằng cách
 * tạm `spread` lại thân request): vì hàng rào thứ hai — cờ phạm vi **không nằm
 * trong kiểu lệnh nào** — vẫn đứng. Tốt cho sản phẩm, nhưng nghĩa là test hành
 * vi không canh được whitelist.
 *
 * Nên canh ở tầng cấu trúc: tên cờ phạm vi không được xuất hiện trong whitelist
 * của bất kỳ lệnh nào. Thêm một cờ vào kiểu lệnh **và** vào whitelist — tức đúng
 * cách lỗ cũ sinh ra — sẽ làm test này đỏ.
 */
describe('hàng rào cấu trúc: cờ phạm vi quyền không phải trường của client', () => {
  /** Mọi trường của `BoiCanhQuyen`: đều là **kết luận của server**. */
  const TRUONG_BOI_CANH_QUYEN = [
    'ticket_cua_luot_minh',
    'ticket_cha_cua_luot_minh',
    'vai_tro_nguoi_nhan',
    'nguoi_nhan_trong_du_an',
  ];

  it('không whitelist nào chứa một cờ phạm vi quyền', () => {
    for (const [loai, truong] of Object.entries(TRUONG_CLIENT)) {
      for (const co of TRUONG_BOI_CANH_QUYEN) {
        expect(
          truong as readonly string[],
          `lệnh "${loai}" nhận "${co}" từ client — đó là đường leo quyền`,
        ).not.toContain(co);
      }
    }
  });

  it('không whitelist nào chứa trường server tự dựng', () => {
    for (const [loai, truong] of Object.entries(TRUONG_CLIENT)) {
      for (const cua_server of ['loai', 'workspace_id', 'ai']) {
        expect(truong as readonly string[], `lệnh "${loai}"`).not.toContain(cua_server);
      }
    }
  });

  it('mọi loại lệnh đều có một whitelist (thêm lệnh mà quên khai là lỗi)', () => {
    // `SO_DANG_KY_HANDLER` là sổ đăng ký lệnh; hai bên phải khớp đúng từng khoá.
    expect(Object.keys(TRUONG_CLIENT).sort()).toEqual(Object.keys(SO_DANG_KY_HANDLER).sort());
  });
});

/* ------------------------------------------------------------------ *
 * Cờ phạm vi mặc định là TỪ CHỐI khi chưa có nguồn dữ liệu
 * ------------------------------------------------------------------ */
describe('phamViLuotGiao: chưa có bảng lượt giao thì mặc định TỪ CHỐI', () => {
  it('worker lượt này không sửa và không tạo được ticket nào (đúng bảng quyền)', async () => {
    // Lượt này chưa có lượt giao nào, nên `worker` chưa cầm ticket nào → cả hai ô
    // của nó đều không áp được. Đây là mặc định **an toàn**, không phải "cho qua
    // vì chưa làm".
    const sua = await goiApi(`/v1/ticket/${ticket_cua_nguoi_khac}`, TOKEN_WORKER, {
      method: 'PATCH',
      than: { tieu_de: 'x' },
    });
    const tao = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'y', ticket_cha_id: ticket_cua_nguoi_khac },
    });
    expect(sua.status).toBe(403);
    expect(tao.status).toBe(403);
  });

  it('nhưng chủ nới ô quyền thì worker làm được — đường ghi đè vẫn hoạt động', async () => {
    // Đối chứng cho test trên: 403 ở trên là do **ô phạm vi**, không phải do một
    // chỗ nào khoá cứng mọi lệnh của worker.
    await goiApi('/v1/agent/ag-worker/quyen/change_status', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'trong_du_an' },
    });
    const res = await goiApi(`/v1/ticket/${ticket_cua_nguoi_khac}`, TOKEN_WORKER, {
      method: 'PATCH',
      than: { tieu_de: 'Worker được chủ nới quyền' },
    });
    expect(res.status).toBe(200);
  });
});
