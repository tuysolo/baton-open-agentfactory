/**
 * **Ticket điều phối — hai chốt T-64** (SPEC 19.12 câu 16 và 17).
 *
 *   * **Câu 16** (`spec-questions.md` #25): **chỉ chủ và agent vai `coordinator`**
 *     nối được liên kết loại `dieu_phoi`. `related` và `blocks` giữ luật cũ.
 *   * **Câu 17** (`spec-questions.md` #26): ticket dự án **xoá mềm không tính** vào
 *     tập mà ticket điều phối theo; xoá cái **cuối cùng** thì ticket điều phối
 *     **giữ nguyên**; **khôi phục** thì tính lại.
 *
 * Vì sao câu 16 là một lỗ **leo quyền**, không chỉ là một ô bảng quyền: liên kết
 * `dieu_phoi` là thứ **định nghĩa** một ticket là ticket điều phối, và ticket điều
 * phối **không qua cổng bằng chứng** (19.4). Nên một `manager` nối được
 * `dieu_phoi` là một `manager` đi vòng được qua cổng bằng chứng.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  LY_DO_HUY_DIEU_PHOI,
  VAI_TRO_AGENT,
  VAI_TRO_NOI_DUOC_DIEU_PHOI,
  quyenNoiDieuPhoi,
  type VaiTroAgent,
} from '@baton/shared';
import { LOAI_NOI_DUOC } from '../src/lenh-ticket.js';
import {
  TOKEN_CHU,
  aiAgent,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungLienKet,
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
 * Danh sách vai trò: lấy **từ hệ**, không gõ tay
 * ------------------------------------------------------------------ *
 * Đọc thẳng `VAI_TRO_AGENT` (bảng mã máy của SPEC 0.1) nên thêm một vai trò mới
 * vào hệ là **tự động** có ca thử ở đây. Gõ tay một mảng bốn tên thì vai thứ năm
 * sẽ im lặng không ai thử — mà im lặng đúng ở chỗ này là một lỗ quyền.
 */
const VAI_TRO = Object.keys(VAI_TRO_AGENT) as VaiTroAgent[];

const P_DP = 'pj-COS';
const P_DA = 'pj-SAI';

const TK_DP = 'tk-pj-COS-1';
const TK_DA = 'tk-pj-SAI-1';

const TOKEN: Record<VaiTroAgent, string> = Object.fromEntries(
  VAI_TRO.map((v) => [v, `bt_dp_${v}`]),
) as Record<VaiTroAgent, string>;

/** `coordinator` **ngoài** cả hai dự án — phải vẫn bị chặn. */
const TOKEN_COORD_NGOAI = 'bt_dp_coord_ngoai';
/** `coordinator` bị chủ **tắt** — phải vẫn bị chặn. */
const TOKEN_COORD_TAT = 'bt_dp_coord_tat';

function noi(token: string, loai_lien_ket: string, tu = TK_DP, den = TK_DA) {
  return goiApi(`/v1/ticket/${tu}/lien-ket`, token, {
    method: 'POST',
    than: { den_ticket_id: den, loai_lien_ket },
  });
}

/**
 * Ticket cha của một ticket — SPEC 19.12 câu 12.
 *
 * Cha **không** có cột riêng trên bảng `ticket`: nó là một dòng `ticket_link` loại
 * `parent`, và liên kết đó **có hướng** — `tu_ticket_id` là **cha** (migration
 * 0001, `handlerTaoTicket`). Nên "không có đường đổi cha" = không đường nào ghi
 * thêm hay bỏ một dòng `parent` sau lúc tạo.
 */
async function chaCua(ticket_id: string): Promise<string | null> {
  const d = await env.DB.prepare(
    "SELECT tu_ticket_id FROM ticket_link WHERE den_ticket_id = ? AND loai = 'parent'",
  )
    .bind(ticket_id)
    .first<{ tu_ticket_id: string }>();
  return d?.tu_ticket_id ?? null;
}

async function soLienKet(loai: string): Promise<number> {
  const d = await env.DB.prepare('SELECT count(*) AS n FROM ticket_link WHERE loai = ?')
    .bind(loai)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

beforeEach(async () => {
  await dungWorkspace();

  for (const vai_tro of VAI_TRO) {
    await dungAgentCoToken({
      id: `ag-${vai_tro}`,
      ten: `A-${vai_tro}`,
      vai_tro,
      token: TOKEN[vai_tro],
      // Vào **tất cả** dự án: bị từ chối thì phải vì vai trò, không vì cửa dự án.
      vao_tat_ca_du_an: true,
    });
  }
  await dungAgentCoToken({
    id: 'ag-coord-ngoai',
    ten: 'A-coordinator ngoài dự án',
    vai_tro: 'coordinator',
    token: TOKEN_COORD_NGOAI,
  });
  await dungAgentCoToken({
    id: 'ag-coord-tat',
    ten: 'A-coordinator đã tắt',
    vai_tro: 'coordinator',
    token: TOKEN_COORD_TAT,
    disabled: true,
    vao_tat_ca_du_an: true,
  });

  await dungDuAn('COS', 'Điều phối');
  await dungDuAn('SAI', 'Sample');
  for (const vai_tro of VAI_TRO) {
    await choVaoDuAn(`ag-${vai_tro}`, P_DP);
    await choVaoDuAn(`ag-${vai_tro}`, P_DA);
  }

  await dungTicket(P_DP, 1, '[Giao M-Sample] Làm việc A', { trang_thai: 'todo' });
  await dungTicket(P_DA, 1, 'Việc A', { trang_thai: 'todo' });
});

/* ================================================================== *
 * A. SPEC 19.12 câu 16 — ai nối được `dieu_phoi`
 * ================================================================== */

describe('19.12 câu 16 — chỉ chủ và `coordinator` nối được `dieu_phoi` (#25)', () => {
  it('danh sách vai trò được nối chỉ có `coordinator`, và mọi tên trong đó là vai trò thật', () => {
    expect([...VAI_TRO_NOI_DUOC_DIEU_PHOI]).toEqual(['coordinator']);
    for (const v of VAI_TRO_NOI_DUOC_DIEU_PHOI) expect(VAI_TRO).toContain(v);
  });

  it('luật thuần: chủ được', () => {
    expect(quyenNoiDieuPhoi({ loai: 'chu' })).toEqual({ cho_phep: true });
  });

  /*
   * **Đủ vai trò, sinh theo dữ liệu.** Mỗi vai trò của `VAI_TRO_AGENT` có đúng một
   * ca ở tầng thuần và một ca qua HTTP — không có vai nào lọt.
   */
  for (const vai_tro of VAI_TRO) {
    const duoc = (VAI_TRO_NOI_DUOC_DIEU_PHOI as readonly VaiTroAgent[]).includes(vai_tro);

    it(`luật thuần: vai \`${vai_tro}\` ${duoc ? 'ĐƯỢC' : 'bị FORBIDDEN'}`, () => {
      const kq = quyenNoiDieuPhoi(aiAgent(vai_tro, { vao_tat_ca_du_an: true }));
      if (duoc) expect(kq).toEqual({ cho_phep: true });
      else expect(kq).toMatchObject({ cho_phep: false, ma: 'FORBIDDEN' });
    });

    it(`qua HTTP: vai \`${vai_tro}\` nối \`dieu_phoi\` → ${duoc ? '200' : '403 FORBIDDEN'}`, async () => {
      const res = await noi(TOKEN[vai_tro], 'dieu_phoi');
      if (duoc) {
        expect(res.status).toBe(200);
        expect(await soLienKet('dieu_phoi')).toBe(1);
      } else {
        // Đường **GHI** → 403, theo 19.12 câu 15 (`spec-questions.md` #24).
        expect(res.status).toBe(403);
        expect((await res.json<{ error: string }>()).error).toBe('FORBIDDEN');
        // Và không có liên kết nào bị ghi: từ chối rồi thì không nửa vời.
        expect(await soLienKet('dieu_phoi')).toBe(0);
      }
    });
  }

  it('qua HTTP: CHỦ nối `dieu_phoi` được', async () => {
    const res = await noi(TOKEN_CHU, 'dieu_phoi');
    expect(res.status).toBe(200);
    expect(await soLienKet('dieu_phoi')).toBe(1);
  });

  it('`manager` KHÔNG tự biến ticket của mình thành ticket điều phối (lỗ cổng bằng chứng)', async () => {
    const res = await noi(TOKEN.manager, 'dieu_phoi');
    expect(res.status).toBe(403);
    // `la_dieu_phoi` suy ra từ liên kết, nên không có liên kết = không là điều phối.
    const d = await env.DB.prepare(
      "SELECT count(*) AS n FROM ticket_link WHERE tu_ticket_id = ? AND loai = 'dieu_phoi'",
    )
      .bind(TK_DP)
      .first<{ n: number }>();
    expect(d?.n).toBe(0);
  });

  // BAT-58 (19.12 câu 15, `spec-questions.md` #176): trước ghim 403; nay ticket người
  // gọi không thấy ra 404 GIỐNG HỆT id bịa — vẫn bị chặn, không ghi gì.
  it('`coordinator` KHÔNG được vào dự án → vẫn bị chặn (404 giống hệt id bịa — BAT-58)', async () => {
    const res = await noi(TOKEN_COORD_NGOAI, 'dieu_phoi');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(await soLienKet('dieu_phoi')).toBe(0);
  });

  it('`coordinator` bị TẮT → vẫn bị chặn (SPEC mục 3)', async () => {
    const res = await noi(TOKEN_COORD_TAT, 'dieu_phoi');
    expect(res.status).toBe(403);
    expect(await soLienKet('dieu_phoi')).toBe(0);
    expect(quyenNoiDieuPhoi(aiAgent('coordinator', { disabled: true }))).toMatchObject({
      cho_phep: false,
      ma: 'FORBIDDEN',
    });
  });

  it('vừa bị TẮT vừa vai KHÔNG nối được → lý do là "bị tắt", không phải lý do vai trò (thứ tự SPEC mục 3)', () => {
    const kq = quyenNoiDieuPhoi(aiAgent('manager', { disabled: true, vao_tat_ca_du_an: true }));
    expect(kq).toMatchObject({ cho_phep: false, ma: 'FORBIDDEN' });
    // Khoá **thứ tự** hai câu `if`: đảo lại thì lý do sẽ nói về vai trò.
    expect(kq.cho_phep === false ? kq.ly_do : '').toBe('Agent đã bị tắt.');
  });

  it('vai sai nhận ĐÚNG MỘT phản hồi 403 dù hai id có thật hay không (19.12 câu 15)', async () => {
    const that = await noi(TOKEN.manager, 'dieu_phoi');
    const khong = await noi(TOKEN.manager, 'dieu_phoi', TK_DP, 'tk-khong-ton-tai');
    expect(that.status).toBe(403);
    expect(khong.status).toBe(403);
  });
});

/* ------------------------------------------------------------------ *
 * A'. ĐỐI CHỨNG: `related` và `blocks` KHÔNG bị siết oan
 * ------------------------------------------------------------------ */

describe('19.12 câu 16 — đối chứng: `related` và `blocks` giữ luật cũ', () => {
  for (const loai of ['related', 'blocks'] as const) {
    for (const vai_tro of VAI_TRO) {
      /*
       * Luật cũ của `related`/`blocks` là hàng "Đổi trạng thái ticket" trên **cả
       * hai** đầu nối. Với fixture này (agent vào tất cả dự án, không có lượt giao
       * nào) thì `coordinator` "có" và `manager` "trong dự án" là đạt; `worker`
       * "ticket của lượt mình" và `reviewer` "—" thì không — **không liên quan gì
       * tới luật `dieu_phoi` mới**.
       */
      const duoc = vai_tro === 'coordinator' || vai_tro === 'manager';

      it(`vai \`${vai_tro}\` nối \`${loai}\` → ${duoc ? '200' : '403'} (như trước T-64)`, async () => {
        const res = await noi(TOKEN[vai_tro], loai);
        expect(res.status).toBe(duoc ? 200 : 403);
        expect(await soLienKet(loai)).toBe(duoc ? 1 : 0);
      });
    }

    it(`CHỦ nối \`${loai}\` được`, async () => {
      expect((await noi(TOKEN_CHU, loai)).status).toBe(200);
    });
  }

  it('`manager` nối được `related` nhưng KHÔNG nối được `dieu_phoi` — chỉ loại đó bị siết', async () => {
    expect((await noi(TOKEN.manager, 'related')).status).toBe(200);
    expect((await noi(TOKEN.manager, 'dieu_phoi')).status).toBe(403);
  });
});

/* ================================================================== *
 * A2. SPEC 19.12 câu 12 — ticket cha CHỈ đặt lúc tạo
 * ================================================================== *
 * Đặt ở file này vì đây là chỗ ở của các ca **lệnh nối liên kết**.
 *
 * Câu 12 có hai nửa, và trước lượt này **không ca nào** canh nửa nào:
 *   1. lệnh nối liên kết **không nhận** loại `parent` — thêm `'parent'` vào
 *      `LOAI_NOI_DUOC` không làm đỏ test nào;
 *   2. **không có đường đổi cha về sau** — `sua_ticket` không có trường đó.
 * ================================================================== */

describe('19.12 câu 12 — ticket cha chỉ đặt lúc tạo, lệnh nối KHÔNG nhận `parent` (#21)', () => {
  it('danh sách loại nối được KHÔNG có `parent` (luật thuần)', () => {
    expect([...LOAI_NOI_DUOC]).toEqual(['related', 'blocks', 'dieu_phoi']);
    expect((LOAI_NOI_DUOC as readonly string[]).includes('parent')).toBe(false);
  });

  it('CHỦ nối `parent` → 422 INVALID_INPUT, và không liên kết nào được ghi', async () => {
    // Chủ là quyền cao nhất (mục 1), nên 422 ở đây chứng minh đây là **cửa kiểm
    // nhập**, không phải một lần từ chối vì quyền.
    const res = await noi(TOKEN_CHU, 'parent');
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('INVALID_INPUT');
    expect(await soLienKet('parent')).toBe(0);
  });

  it('`coordinator` — vai duy nhất nối được `dieu_phoi` — cũng không nối được `parent`', async () => {
    const res = await noi(TOKEN.coordinator, 'parent');
    expect(res.status).toBe(422);
    expect(await soLienKet('parent')).toBe(0);
  });

  it('đường DUY NHẤT là lúc tạo: `POST /v1/ticket` nhận `ticket_cha_id`', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: P_DA, tieu_de: 'Ticket con', ticket_cha_id: TK_DA },
    });
    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: string }>();
    expect(await chaCua(id)).toBe(TK_DA);
    // Và lúc tạo thì liên kết `parent` được ghi — chỉ ở đường này.
    expect(await soLienKet('parent')).toBe(1);
  });

  it('KHÔNG có đường sửa cha về sau: `PATCH /v1/ticket/:id` BỎ QUA `ticket_cha_id`', async () => {
    const tao = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: P_DA, tieu_de: 'Ticket không cha' },
    });
    const { id } = await tao.json<{ id: string }>();
    expect(await chaCua(id)).toBeNull();

    // Chủ gửi `ticket_cha_id` lên đường sửa: lệnh thành công nhưng trường bị
    // **bỏ qua** tường minh (`bo_qua` của `locTruongClient`), và cha vẫn `null`.
    const res = await goiApi(`/v1/ticket/${id}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { ticket_cha_id: TK_DA, tieu_de: 'Đổi tiêu đề thì được' },
    });
    expect(res.status).toBe(200);
    const kq = await res.json<{ da_doi: string[]; bo_qua?: string[] }>();
    expect(kq.bo_qua).toContain('ticket_cha_id');
    expect(kq.da_doi).toContain('tieu_de');
    expect(kq.da_doi).not.toContain('ticket_cha_id');

    expect(await chaCua(id)).toBeNull();
    expect(await soLienKet('parent')).toBe(0);
  });

  it('cũng không BỎ được cha: `PATCH` chỉ có `ticket_cha_id: null` → 422, cha y nguyên', async () => {
    const tao = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: P_DA, tieu_de: 'Ticket con', ticket_cha_id: TK_DA },
    });
    const { id } = await tao.json<{ id: string }>();
    expect(await chaCua(id)).toBe(TK_DA);

    /*
     * Trường bị lọc ở `locTruongClient` nên lệnh **không còn trường nào để sửa**,
     * và `sua_ticket` từ chối tường minh → `INVALID_INPUT`/422. Đây là hành vi
     * hiện tại, và nó mạnh hơn "bỏ qua im lặng": người gọi biết mình bị từ chối.
     */
    const res = await goiApi(`/v1/ticket/${id}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { ticket_cha_id: null },
    });
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('INVALID_INPUT');
    expect(await chaCua(id)).toBe(TK_DA);
  });
});

/* ================================================================== *
 * B. SPEC 19.12 câu 17 — xoá / khôi phục ticket dự án
 * ================================================================== */

describe('19.12 câu 17 — xoá mềm, khôi phục và ticket điều phối (#26)', () => {
  async function xoa(ticket_id: string): Promise<Response> {
    return goiApi(`/v1/ticket/${ticket_id}/xoa`, TOKEN_CHU, { method: 'POST' });
  }
  async function khoiPhuc(ticket_id: string): Promise<Response> {
    return goiApi(`/v1/ticket/${ticket_id}/khoi-phuc`, TOKEN_CHU, { method: 'POST' });
  }

  it('xoá một ticket làm TẬP ĐỔI → ticket điều phối đổi trạng thái đúng', async () => {
    // Tập: A `in_progress`, B `done`. Ticket điều phối đang Đang làm vì có A.
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DA)
      .run();
    await dungTicket(P_DA, 2, 'Việc B', { trang_thai: 'done' });
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');
    await dungLienKet(TK_DP, 'tk-pj-SAI-2', 'dieu_phoi');
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DP)
      .run();

    // Xoá A ⇒ tập còn { done } ⇒ tất cả đã kết, có Xong ⇒ điều phối Xong.
    expect((await xoa(TK_DA)).status).toBe(200);
    expect(await trangThaiCua(TK_DP)).toBe('done');
  });

  it('xoá ticket làm tập còn toàn Huỷ → điều phối Huỷ, lý do đúng chữ 19.4', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DA)
      .run();
    await dungTicket(P_DA, 2, 'Việc B', { trang_thai: 'canceled' });
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');
    await dungLienKet(TK_DP, 'tk-pj-SAI-2', 'dieu_phoi');

    expect((await xoa(TK_DA)).status).toBe(200);
    expect(await trangThaiCua(TK_DP)).toBe('canceled');
    const d = await env.DB.prepare('SELECT ly_do_huy FROM ticket WHERE id = ?')
      .bind(TK_DP)
      .first<{ ly_do_huy: string | null }>();
    expect(d?.ly_do_huy).toBe(LY_DO_HUY_DIEU_PHOI);
  });

  it('xoá ticket CUỐI CÙNG → ticket điều phối GIỮ NGUYÊN (không Huỷ, không Cần làm)', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DA)
      .run();
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DP)
      .run();

    expect((await xoa(TK_DA)).status).toBe(200);
    expect(await trangThaiCua(TK_DP)).toBe('in_progress');
  });

  it('xoá ticket cuối cùng khi điều phối đang ở Cần làm → vẫn Cần làm', async () => {
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');
    expect((await xoa(TK_DA)).status).toBe(200);
    expect(await trangThaiCua(TK_DP)).toBe('todo');
  });

  it('KHÔI PHỤC → tính lại theo tập mới (về đúng trạng thái trước khi xoá)', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DA)
      .run();
    await dungTicket(P_DA, 2, 'Việc B', { trang_thai: 'done' });
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');
    await dungLienKet(TK_DP, 'tk-pj-SAI-2', 'dieu_phoi');
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DP)
      .run();

    await xoa(TK_DA);
    expect(await trangThaiCua(TK_DP)).toBe('done');

    // Khôi phục A (`in_progress`) ⇒ tập lại có một cái `active` ⇒ Đang làm.
    expect((await khoiPhuc(TK_DA)).status).toBe(200);
    expect(await trangThaiCua(TK_DP)).toBe('in_progress');
  });

  it('khôi phục ticket CUỐI CÙNG đã xoá → điều phối tính lại từ tập một phần tử', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DA)
      .run();
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');

    await xoa(TK_DA);
    // Tập rỗng ⇒ giữ nguyên Cần làm.
    expect(await trangThaiCua(TK_DP)).toBe('todo');

    await khoiPhuc(TK_DA);
    expect(await trangThaiCua(TK_DP)).toBe('in_progress');
  });

  it('ticket ĐÃ xoá mềm KHÔNG ảnh hưởng tập: đổi ticket khác vẫn tính đúng', async () => {
    await dungTicket(P_DA, 2, 'Việc B', { trang_thai: 'todo' });
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');
    await dungLienKet(TK_DP, 'tk-pj-SAI-2', 'dieu_phoi');

    // Xoá B, rồi đưa A vào Xong. Nếu B (đã xoá) còn được tính thì tập là
    // { done, todo } ⇒ "chưa phải tất cả đã kết" ⇒ điều phối giữ nguyên Cần làm.
    await xoa('tk-pj-SAI-2');
    await goiApi(`/v1/ticket/${TK_DA}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Đã merge' },
    });
    expect(await trangThaiCua(TK_DP)).toBe('done');
  });

  it('xoá ticket dự án KHÔNG nối `dieu_phoi` nào → không ticket nào khác bị đụng', async () => {
    await dungTicket(P_DA, 2, 'Việc rời', { trang_thai: 'in_progress' });
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');

    expect((await xoa('tk-pj-SAI-2')).status).toBe(200);
    expect(await trangThaiCua(TK_DP)).toBe('todo');
    expect(await trangThaiCua(TK_DA)).toBe('todo');
  });

  it('việc tính lại nằm TRONG CÙNG lệnh xoá: có dòng lịch sử cho ticket điều phối', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DA)
      .run();
    await dungTicket(P_DA, 2, 'Việc B', { trang_thai: 'done' });
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');
    await dungLienKet(TK_DP, 'tk-pj-SAI-2', 'dieu_phoi');

    await xoa(TK_DA);

    const { results } = await env.DB.prepare(
      "SELECT truong, gia_tri_moi FROM ticket_history WHERE ticket_id = ? AND truong = 'trang_thai'",
    )
      .bind(TK_DP)
      .all<{ truong: string; gia_tri_moi: string | null }>();
    expect(results).toMatchObject([{ truong: 'trang_thai', gia_tri_moi: 'done' }]);
  });
});

/* ================================================================== *
 * C. `spec-questions.md` #54 — ticket ĐIỀU PHỐI đã xoá mềm
 * ================================================================== *
 * SPEC **không nói** ca này. Chốt tạm (chủ chưa trả lời), cài ở phần 3 lượt 1:
 * ticket điều phối đã xoá mềm thì lan toả **BỎ QUA** nó — không ném lỗi, không
 * ghi dòng lịch sử nào cho nó.
 *
 * Trước khi sửa: `lanToiTicketDieuPhoi` tra ticket cha bằng
 * `ticketBatBuoc(db, workspace_id, dp.id)` (lọc `xoa_luc IS NULL`), nên một ticket
 * điều phối đã xoá làm hàm ném `NOT_FOUND`/404 và **đổ cả lệnh** — tức một ticket
 * dự án **còn sống** không đổi trạng thái / không xoá / không khôi phục được.
 *
 * Phủ **cả ba** đường của `DieuChinhTapDieuPhoi`: `doi_trang_thai`, `xoa`,
 * `khoi_phuc`. Mỗi đường một ca, vì chúng là ba lời gọi khác nhau ở ba handler
 * khác nhau: sửa đúng một đường thì hai đường kia vẫn 404.
 */

describe('#54 — ticket ĐIỀU PHỐI đã xoá mềm thì lan toả bỏ qua', () => {
  /** Xoá mềm trực tiếp trong DB: cần xoá **ticket điều phối**, không qua lệnh nào khác. */
  async function xoaMem(ticket_id: string): Promise<void> {
    await env.DB.prepare('UPDATE ticket SET xoa_luc = ? WHERE id = ?')
      .bind(Date.now(), ticket_id)
      .run();
  }

  async function soLichSu(ticket_id: string): Promise<number> {
    const d = await env.DB.prepare('SELECT count(*) AS n FROM ticket_history WHERE ticket_id = ?')
      .bind(ticket_id)
      .first<{ n: number }>();
    return d?.n ?? 0;
  }

  /**
   * Đúng ca mô tả trong #54: ticket điều phối nối **2** ticket dự án; ticket còn
   * lại ở `done` nên tập sau lệnh làm lan toả **tính ra một trạng thái mới** cho
   * ticket điều phối — tức lan toả thật sự đi tới chỗ tra ticket cha, không rẽ
   * sớm ở `trangThaiDieuPhoiTheo(...).doi === false`.
   */
  beforeEach(async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DA)
      .run();
    await dungTicket(P_DA, 2, 'Việc B', { trang_thai: 'done' });
    await dungLienKet(TK_DP, TK_DA, 'dieu_phoi');
    await dungLienKet(TK_DP, 'tk-pj-SAI-2', 'dieu_phoi');
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK_DP)
      .run();
  });

  it('ĐỐI CHỨNG: ticket điều phối CÒN SỐNG thì lệnh vẫn lan toả và ghi lịch sử', async () => {
    // Nếu ca này không xanh thì ba ca dưới không chứng minh gì: chúng sẽ chỉ nói
    // "không có lịch sử" trên một đường lan toả vốn không bao giờ chạy.
    const r = await goiApi(`/v1/ticket/${TK_DA}/xoa`, TOKEN_CHU, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(await trangThaiCua(TK_DP)).toBe('done');
    expect(await soLichSu(TK_DP)).toBeGreaterThan(0);
  });

  it('`doi_trang_thai`: đổi trạng thái ticket dự án còn sống → 200, không 404', async () => {
    await xoaMem(TK_DP);

    const r = await goiApi(`/v1/ticket/${TK_DA}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Đã merge' },
    });
    expect(r.status).toBe(200);
    // Ticket dự án đổi thật — lệnh không chỉ "không lỗi" mà còn làm đúng việc.
    expect(await trangThaiCua(TK_DA)).toBe('done');
    // Ticket điều phối đã xoá: **không dòng lịch sử nào**, và trạng thái y nguyên.
    expect(await soLichSu(TK_DP)).toBe(0);
    expect(await trangThaiCua(TK_DP)).toBe('in_progress');
  });

  it('`xoa`: xoá ticket dự án còn sống → 200, không 404', async () => {
    await xoaMem(TK_DP);

    const r = await goiApi(`/v1/ticket/${TK_DA}/xoa`, TOKEN_CHU, { method: 'POST' });
    expect(r.status).toBe(200);
    const d = await env.DB.prepare('SELECT xoa_luc FROM ticket WHERE id = ?')
      .bind(TK_DA)
      .first<{ xoa_luc: number | null }>();
    expect(d?.xoa_luc).not.toBeNull();
    expect(await soLichSu(TK_DP)).toBe(0);
    expect(await trangThaiCua(TK_DP)).toBe('in_progress');
  });

  it('`khoi_phuc`: khôi phục ticket dự án → 200, không 404', async () => {
    // Xoá ticket dự án **trước** khi xoá ticket điều phối, để lệnh xoá đó còn
    // chạy được; rồi mới xoá ticket điều phối và thử khôi phục.
    expect((await goiApi(`/v1/ticket/${TK_DA}/xoa`, TOKEN_CHU, { method: 'POST' })).status).toBe(
      200,
    );
    await xoaMem(TK_DP);
    const lich_su_truoc = await soLichSu(TK_DP);

    const r = await goiApi(`/v1/ticket/${TK_DA}/khoi-phuc`, TOKEN_CHU, { method: 'POST' });
    expect(r.status).toBe(200);
    const d = await env.DB.prepare('SELECT xoa_luc FROM ticket WHERE id = ?')
      .bind(TK_DA)
      .first<{ xoa_luc: number | null }>();
    expect(d?.xoa_luc).toBeNull();
    // Không có dòng lịch sử **mới** cho ticket điều phối đã xoá.
    expect(await soLichSu(TK_DP)).toBe(lich_su_truoc);
  });

  it('một ticket điều phối đã xoá KHÔNG chặn ticket điều phối còn sống nối cùng ticket', async () => {
    // Hai cha: một đã xoá, một còn sống. Cha còn sống **vẫn phải** được cập nhật —
    // luật "bỏ qua" chỉ bỏ qua đúng cái đã xoá, không bỏ qua cả vòng lặp.
    await dungTicket(P_DP, 2, '[Giao khác] Việc A', { trang_thai: 'in_progress' });
    await dungLienKet('tk-pj-COS-2', TK_DA, 'dieu_phoi');
    await dungLienKet('tk-pj-COS-2', 'tk-pj-SAI-2', 'dieu_phoi');
    await xoaMem(TK_DP);

    expect((await goiApi(`/v1/ticket/${TK_DA}/xoa`, TOKEN_CHU, { method: 'POST' })).status).toBe(
      200,
    );
    expect(await trangThaiCua('tk-pj-COS-2')).toBe('done');
    expect(await soLichSu(TK_DP)).toBe(0);
  });
});
