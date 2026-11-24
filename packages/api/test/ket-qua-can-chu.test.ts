/**
 * **`baton result T-x [--wait]` và `resolved_asks`** — SPEC mục 8 d.267–268,
 * mục 13 d.376, 19.9 d.543, 19.12 câu 15, câu 25, câu 53, câu 61.
 *
 * Mỗi dòng SPEC mà lượt 3a chạm tới có một ca, và những dòng có **ranh giới** thì
 * có cả ca đối chứng:
 *
 *   * **d.267** "nhận kết quả **trong vòng 3 giây** sau khi chủ bấm Gửi" — đo bằng
 *     đồng hồ thật, ngưỡng 3 000 ms đúng con số của SPEC. Vô hiệu đường đánh thức
 *     thì ca này đỏ (lệnh sẽ hết 30 giây), không phải xanh chậm.
 *   * **d.267, cửa sổ đua** — chủ bấm Gửi vào **đúng khe** giữa lúc waiter vào sổ
 *     và lần đọc trạng thái. Đổi thứ tự thành "đọc trước, đăng ký sau" thì ca này
 *     đỏ ngay ở `soDangCho()`.
 *   * **d.244 + 19.9 d.540** — `Bỏ qua` **cũng** đánh thức.
 *   * **19.9 d.543** — hết giờ: `het_gio: true`, trạng thái vẫn `open`, **không**
 *     phải lỗi HTTP (tầng này cho CLI phân biệt được để thoát mã 4).
 *   * **d.268** — `resolved_asks` ra ở `tasks`, và **không** làm `co_viec` bật.
 *   * **19.12 câu 53** — lệnh chờ dài là lệnh **đọc**: không nhích "lần cuối lên
 *     tiếng" của agent, không nhích tín hiệu phiên.
 *   * **19.12 câu 61** — tầm nhìn lớp "Chung" cho **cả bốn vai** cộng chủ.
 *   * **19.12 câu 15** — `T-404` của người không có quyền đọc ra kết quả **giống
 *     hệt** một mục có thật ngoài tầm nhìn (không phải máy dò sự tồn tại).
 *   * **19.12 câu 25** — mục của dự án `archived` vẫn **đọc** được.
 */

import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { CUA_SO_RESOLVED_ASKS_MS } from '../src/doc-can-chu.js';
import { cuaGhiCua, type WorkspaceGate } from '../src/workspace-gate.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  WS_KHAC,
  aiAgent,
  dungAgentCoToken,
  dungCanChu,
  dungDuAn,
  dungPhien,
  dungLuotGiao,
  dungTicket,
  dungTicketWorkspaceKhac,
  dungWorkspace,
  goiApi,
  phienTrongDb,
} from './giup.js';
import { caQuaSo, choRoiNem, choToi, soRequestBay } from './cho-toi.js';
import './ap-migration.js';

// Sổ `bay` (xem chú thích ở `afterEach` dưới) khai ở đầu file vì cả thân mỗi
// ca/`beforeEach` cũng đi qua nó (BAT-54, khuôn BAT-53, xem `caQuaSo`): ca hết giờ
// không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
const { it, beforeEach } = caQuaSo(bay);

/* ------------------------------------------------------------------ *
 * Dựng nền
 * ------------------------------------------------------------------ */

const T = {
  coord: 'bt_kq_coordinator',
  man: 'bt_kq_manager',
  man2: 'bt_kq_manager_2',
  work: 'bt_kq_worker',
  rev: 'bt_kq_reviewer',
  ngoai: 'bt_kq_ngoai_du_an',
} as const;

const AG = {
  coord: 'ag-kq-coord',
  man: 'ag-kq-man',
  man2: 'ag-kq-man2',
  work: 'ag-kq-work',
  rev: 'ag-kq-rev',
  ngoai: 'ag-kq-ngoai',
} as const;

let PJ = '';
let PJ_KHAC = '';
let TK = '';

beforeEach(async () => {
  for (const b of [
    'nhat_ky_can_cu',
    'nhat_ky',
    'can_chu_ticket',
    'can_chu_file',
    'can_chu_phuong_an',
    'phien_hoat_dong',
    'phien',
    'luot_giao',
    'can_chu',
    'ticket_label',
    'ticket_link',
    'ticket_history',
    'comment',
    'ticket',
    'bo_dem',
    'agent_project',
    'agent_permission',
    'agent',
    'project',
    'workspace',
  ]) {
    await env.DB.prepare(`DELETE FROM ${b}`).run();
  }

  await dungWorkspace();
  PJ = await dungDuAn('SAI', 'Sample');
  PJ_KHAC = await dungDuAn('KHA', 'Dự án khác');
  TK = await dungTicket(PJ, 1, 'Việc một');

  await dungAgentCoToken({
    id: AG.coord,
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: T.coord,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: AG.man,
    ten: 'M-Baton',
    vai_tro: 'manager',
    token: T.man,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: AG.man2,
    ten: 'M-Khac',
    vai_tro: 'manager',
    token: T.man2,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: AG.work,
    ten: 'W-builder',
    vai_tro: 'worker',
    token: T.work,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: AG.rev,
    ten: 'W-reviewer',
    vai_tro: 'reviewer',
    token: T.rev,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: AG.ngoai,
    ten: 'W-du-an-khac',
    vai_tro: 'worker',
    token: T.ngoai,
    du_an: [PJ_KHAC],
  });
});

/* ------------------------------------------------------------------ *
 * Giúp việc
 * ------------------------------------------------------------------ */

interface KetQuaRa {
  id: string;
  ma: string;
  trang_thai: string;
  da_xu_ly: boolean;
  tieu_de: string;
  loai: string;
  muc: string;
  project_id: string | null;
  ket_qua: string | null;
  phuong_an_da_chon: { id: string; nhan: string; noi_dung: string } | null;
  ket_luan_review: string | null;
  ly_do_bo_qua: string | null;
  xu_ly_luc: number | null;
  mo_lai_lan: number;
  het_gio: boolean;
  da_cho_ms: number;
  cho_toi_da_giay: number;
}

interface TasksRa {
  luot_giao: { id: string }[];
  resolved_asks: KetQuaRa[];
  co_viec: boolean;
  het_gio: boolean;
}

/*
 * **Sổ các request còn đang bay** — chống chập chờn "Isolated storage failed"
 * (BAT-13, cùng mẫu `cho-dai.test.ts`). Ca `--wait 30` mà assert ở giữa đỏ thì
 * request bị bỏ rơi vẫn sống và còn đọc D1/DO SAU khi pool đã pop storage cô lập
 * của ca, kéo các ca sau đỏ dây chuyền. `afterEach` chờ hết chúng. Sổ khai ở đầu
 * file (`bay`, BAT-54).
 */
afterEach(async () => {
  await bay.doiHet();
  // Trần đủ cho một lệnh chờ 30 giây bị bỏ rơi tự hết hạn.
}, 45_000);

function ketQua(ma: string, token: string, truy_van = ''): Promise<Response> {
  return bay.theoDoi(goiApi(`/v1/can-chu/${ma}${truy_van}`, token));
}

async function than(res: Response): Promise<KetQuaRa> {
  return res.json<KetQuaRa>();
}

function tasks(token: string, truy_van = ''): Promise<Response> {
  return bay.theoDoi(goiApi(`/v1/tasks${truy_van}`, token));
}

async function soDangCho(): Promise<number> {
  return runInDurableObject(cuaGhiCua(env, WS), (g: WorkspaceGate) => g.soDangCho());
}

/**
 * Chờ tới khi sổ waiter của cửa ghi có đúng `n` lệnh chờ, thay cho `nghi(250)`.
 * Không nới assert: hết `han_ms` mà sổ chưa có `n` thì `expect` đỏ như cũ.
 */
async function choVaoSo(n: number, han_ms = 10_000): Promise<void> {
  await choToi(async () => (await soDangCho()) === n, han_ms);
  expect(await soDangCho(), `sổ waiter phải có ${n} lệnh chờ`).toBe(n);
}

/** Như `choVaoSo`, cho ca đang chạy BÊN TRONG DO (`runInDurableObject`). */
async function choVaoSoCua(gate: WorkspaceGate, n: number, han_ms = 10_000): Promise<void> {
  await choToi(() => gate.soDangCho() === n, han_ms);
  expect(gate.soDangCho(), `sổ waiter phải có ${n} lệnh chờ`).toBe(n);
}

/** Chủ bấm **Gửi** trên một mục — `POST /v1/can-chu/:id/xu-ly`. */
function chuGui(ma: string, them: Record<string, unknown> = {}): Promise<Response> {
  return goiApi(`/v1/can-chu/${ma}/xu-ly`, TOKEN_CHU, { method: 'POST', than: them });
}

/** Chủ bấm **Bỏ qua** — `POST /v1/can-chu/:id/bo-qua`, bắt buộc lý do (d.244). */
function chuBoQua(ma: string, ly_do: string): Promise<Response> {
  return goiApi(`/v1/can-chu/${ma}/bo-qua`, TOKEN_CHU, { method: 'POST', than: { ly_do } });
}

async function lenTiengCua(agent_id: string): Promise<number | null> {
  const d = await env.DB.prepare(
    'SELECT len_tieng_luc FROM agent WHERE id = ? AND workspace_id = ?',
  )
    .bind(agent_id, WS)
    .first<{ len_tieng_luc: number | null }>();
  return d?.len_tieng_luc ?? null;
}

/* ================================================================== *
 * 1. Đọc một mục — mục 13 d.376 ("in trạng thái và kết quả")
 * ================================================================== */
describe('SPEC mục 13 d.376 — `baton result T-x`: trạng thái và kết quả', () => {
  it('mục `Chờ`: trả `open`, `da_xu_ly: false`, chưa có kết quả nào', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tieu_de: 'Đã deploy xong' });

    const res = await ketQua('T-1', T.man);
    expect(res.status).toBe(200);
    const v = await than(res);
    expect(v.ma).toBe('T-1');
    expect(v.id).toBe('ct-1');
    expect(v.trang_thai).toBe('open');
    expect(v.da_xu_ly).toBe(false);
    expect(v.tieu_de).toBe('Đã deploy xong');
    expect(v.ket_qua).toBeNull();
    expect(v.xu_ly_luc).toBeNull();
    // Không `--wait` thì không chờ, nên không hết giờ.
    expect(v.het_gio).toBe(false);
    expect(v.da_cho_ms).toBe(0);
    expect(v.cho_toi_da_giay).toBe(60);
  });

  it('đọc được bằng **id** y như bằng `T-số` (một chỗ dịch duy nhất)', async () => {
    await dungCanChu('ct-1', { project_id: PJ });
    const theo_ma = await than(await ketQua('T-1', T.man));
    const theo_id = await than(await ketQua('ct-1', T.man));
    expect(theo_id).toEqual(theo_ma);
    // `t-1` chữ thường cũng là `T-1` — `maSoTuChu` nhận cả hai.
    expect((await than(await ketQua('t-1', T.man))).id).toBe('ct-1');
  });

  it('mục `Đã xử lý`: trả `resolved`, chữ kết quả và mốc xử lý (d.244)', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'run_command' });
    expect((await chuGui('T-1', { ghi_them: 'đã chạy, 42 test xanh' })).status).toBe(200);

    const v = await than(await ketQua('T-1', T.man));
    expect(v.trang_thai).toBe('resolved');
    expect(v.da_xu_ly).toBe(true);
    expect(v.ket_qua).toBe('đã chạy, 42 test xanh');
    expect(v.xu_ly_luc).toBeGreaterThan(0);
    expect(v.ly_do_bo_qua).toBeNull();
  });

  it('mục `Bỏ qua`: trả `skipped` kèm **lý do** (d.244, 19.9 d.540)', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    expect((await chuBoQua('T-1', 'không còn cần nữa')).status).toBe(200);

    const v = await than(await ketQua('T-1', T.man));
    expect(v.trang_thai).toBe('skipped');
    expect(v.da_xu_ly).toBe(true);
    expect(v.ly_do_bo_qua).toBe('không còn cần nữa');
    expect(v.ket_qua).toBeNull();
  });

  it('mục `decision`: trả **phương án đã chọn** là khoá thật, không chỉ một nhãn', async () => {
    const tao = await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: {
        tieu_de: 'Chọn CSDL',
        muc: 'today',
        loai: 'decision',
        project_id: PJ,
        phuong_an: [{ noi_dung: 'Dùng D1', de_xuat: true }, { noi_dung: 'Dùng Postgres' }],
        ly_do_de_xuat: 'Đã có sẵn trong Workers',
      },
    });
    expect(tao.status).toBe(201);
    const ma = (await tao.json<{ ma: string }>()).ma;
    expect((await chuGui(ma, { phuong_an: 'B', ghi_them: 'ngưỡng 500' })).status).toBe(200);

    const v = await than(await ketQua(ma, T.man));
    expect(v.trang_thai).toBe('resolved');
    expect(v.phuong_an_da_chon?.nhan).toBe('B');
    expect(v.phuong_an_da_chon?.noi_dung).toBe('Dùng Postgres');
    expect(v.phuong_an_da_chon?.id).toMatch(/.+/);
    expect(v.ket_qua).toContain('ngưỡng 500');
  });

  it('mục `review`: trả `ket_luan_review` (mục 8 d.261)', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'review' });
    expect((await chuGui('T-1', { ket_luan: 'can_sua', ghi_them: 'thiếu test' })).status).toBe(200);

    const v = await than(await ketQua('T-1', T.man));
    expect(v.ket_luan_review).toBe('can_sua');
  });

  it('mục `open` mà chưa có phương án đã chọn → `phuong_an_da_chon: null`', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    expect((await than(await ketQua('T-1', T.man))).phuong_an_da_chon).toBeNull();
  });

  it('`T-` không có thật → 404 NOT_FOUND', async () => {
    const res = await ketQua('T-404', T.man);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('mục của workspace KHÁC không đọc được — kể cả chủ (mọi câu SQL ràng `workspace_id`)', async () => {
    await dungTicketWorkspaceKhac();
    const t = Date.now();
    await env.DB.prepare(
      `INSERT INTO can_chu
         (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
          han_luc, can_tty, tao_luc, cap_nhat_luc, mo_lai_lan)
       VALUES (?, ?, 1, 'Mục của người khác', 'pj-khac', 'today', 'fyi', 'open',
               NULL, 0, ?, ?, 0)`,
    )
      .bind('ct-khac', WS_KHAC, t, t)
      .run();

    // `T-1` của workspace này **không tồn tại**, và `T-1` kia nằm ở DO/ws khác.
    expect((await ketQua('T-1', TOKEN_CHU)).status).toBe(404);
    expect((await ketQua('ct-khac', TOKEN_CHU)).status).toBe(404);
  });
});

/* ================================================================== *
 * 2. Tầm nhìn — 19.12 câu 61 (lớp "Chung") và câu 15
 * ================================================================== */
describe('19.12 câu 61 — tầm nhìn lớp "Chung" rẽ theo VAI', () => {
  beforeEach(async () => {
    // Mục **Chung** (`project_id` rỗng) do `manager` AG.man tạo.
    await dungCanChu('ct-chung', {
      project_id: null,
      loai: 'fyi',
      tao_boi_agent_id: AG.man,
      tieu_de: 'Hỏi chuyện ngoài dự án',
    });
  });

  it('CHỦ đọc được mọi mục Chung', async () => {
    const v = await than(await ketQua('T-1', TOKEN_CHU));
    expect(v.id).toBe('ct-chung');
    expect(v.project_id).toBeNull();
  });

  it('`coordinator` đọc được mọi mục Chung — kể cả mục của người khác', async () => {
    expect((await than(await ketQua('T-1', T.coord))).id).toBe('ct-chung');
  });

  it('`manager` đọc được mục Chung **của chính mình**', async () => {
    expect((await than(await ketQua('T-1', T.man))).id).toBe('ct-chung');
  });

  it('`manager` KHÁC **không** đọc được mục Chung đó → 404', async () => {
    expect((await ketQua('T-1', T.man2)).status).toBe(404);
  });

  it('`manager` không đọc được mục Chung **do chủ ghi** → 404', async () => {
    await dungCanChu('ct-chung-chu', { project_id: null, loai: 'fyi', tao_boi_agent_id: null });
    expect((await ketQua('T-2', T.man)).status).toBe(404);
    // Đối chứng: chủ thì đọc được.
    expect((await than(await ketQua('T-2', TOKEN_CHU))).id).toBe('ct-chung-chu');
  });

  it('`worker` không đọc được mục Chung nào → 404', async () => {
    expect((await ketQua('T-1', T.work)).status).toBe(404);
  });

  it('`reviewer` không đọc được mục Chung nào → 404', async () => {
    expect((await ketQua('T-1', T.rev)).status).toBe(404);
  });

  it('đối chứng: cùng `worker` đó ĐỌC ĐƯỢC mục **có dự án** của dự án mình', async () => {
    await dungCanChu('ct-pj', { project_id: PJ, loai: 'fyi' });
    expect((await than(await ketQua('T-2', T.work))).id).toBe('ct-pj');
  });

  it('agent **ngoài dự án** không đọc được mục có dự án đó → 404', async () => {
    await dungCanChu('ct-pj', { project_id: PJ, loai: 'fyi' });
    expect((await ketQua('T-2', T.ngoai)).status).toBe(404);
  });
});

describe('19.12 câu 15 — ngoài tầm nhìn và không có thật ra GIỐNG HỆT NHAU', () => {
  it('`T-404` và một mục CÓ THẬT ngoài tầm nhìn: cùng mã, cùng thân', async () => {
    // Mục có thật, nhưng `worker` không bao giờ đọc được mục Chung (câu 61).
    await dungCanChu('ct-chung', { project_id: null, loai: 'fyi', tao_boi_agent_id: AG.man });

    const co_that = await ketQua('T-1', T.work);
    const khong_co = await ketQua('T-404', T.work);

    expect(co_that.status).toBe(khong_co.status);
    expect(co_that.status).toBe(404);
    expect(await co_that.json()).toEqual(await khong_co.json());
  });

  it('cùng chuyện đó với một mục của dự án mình không được vào', async () => {
    await dungCanChu('ct-pj', { project_id: PJ, loai: 'fyi' });
    const co_that = await ketQua('T-1', T.ngoai);
    const khong_co = await ketQua('T-999', T.ngoai);
    expect(co_that.status).toBe(404);
    expect(await co_that.json()).toEqual(await khong_co.json());
  });
});

/* ================================================================== *
 * 3. Dự án `archived` — 19.12 câu 25 ("chỉ đọc" thì phải đọc được)
 * ================================================================== */
describe('19.12 câu 25 — mục của dự án `archived` vẫn ĐỌC được', () => {
  it('`baton result T-x` trên mục của dự án đã lưu trữ → 200, in đủ kết quả', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    expect((await chuGui('T-1', { ghi_them: 'đã xem' })).status).toBe(200);

    await env.DB.prepare('UPDATE project SET trang_thai = ? WHERE id = ? AND workspace_id = ?')
      .bind('archived', PJ, WS)
      .run();

    const v = await than(await ketQua('T-1', T.man));
    expect(v.trang_thai).toBe('resolved');
    expect(v.ket_qua).toBe('đã xem');
  });
});

/* ================================================================== *
 * 4. `wait` — đọc, kẹp, lỗi (mục 13 d.352, d.376)
 * ================================================================== */
describe('`baton result T-x --wait`: đọc tham số `wait`', () => {
  it('mục ĐÃ xử lý thì `--wait` trả về NGAY, và KHÔNG chạm cửa ghi', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    expect((await chuGui('T-1')).status).toBe(200);

    const t0 = Date.now();
    const v = await than(await ketQua('T-1', T.man, '?wait=30'));
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(v.da_xu_ly).toBe(true);
    expect(v.het_gio).toBe(false);
    // Nhánh `wait=0` của `index.ts`: đọc thẳng D1, nên `da_cho_ms` đúng 0.
    expect(v.da_cho_ms).toBe(0);
    expect(await soDangCho()).toBe(0);
  });

  it('`wait=0` đọc thẳng D1 trên một mục `open`: không waiter nào, `het_gio: false`', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    const v = await than(await ketQua('T-1', T.man, '?wait=0'));
    expect(v.trang_thai).toBe('open');
    expect(v.het_gio).toBe(false);
    expect(v.da_cho_ms).toBe(0);
    expect(await soDangCho()).toBe(0);
  });

  it('`?wait=-1` và `?wait=abc` → 422 INVALID_INPUT', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    const am = await ketQua('T-1', T.man, '?wait=-1');
    expect(am.status).toBe(422);
    expect(await am.json()).toMatchObject({ error: 'INVALID_INPUT' });
    expect((await ketQua('T-1', T.man, '?wait=abc')).status).toBe(422);
  });

  it(
    '`?wait=300` bị KẸP về 60, không phải lỗi; trần hiện trong `cho_toi_da_giay`',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
      // Mục đã xử lý nên trả ngay — ca này đo việc **không** báo lỗi và đo trần.
      expect((await chuGui('T-1')).status).toBe(200);
      const res = await ketQua('T-1', T.man, '?wait=300');
      expect(res.status).toBe(200);
      expect((await than(res)).cho_toi_da_giay).toBe(60);
    },
  );

  it('tầng DO tự kẹp `han_ms` cho cả đường này (dùng chung `hanChoHieuLucMs`)', async () => {
    await runInDurableObject(cuaGhiCua(env, WS), (gate: WorkspaceGate) => {
      expect(gate.hanChoHieuLucMs(300_000)).toBe(60_000);
    });
  });

  it('`--wait` trên một mục NGOÀI TẦM NHÌN → 404, không treo waiter nào', async () => {
    await dungCanChu('ct-chung', { project_id: null, loai: 'fyi', tao_boi_agent_id: AG.man });
    const res = await ketQua('T-1', T.work, '?wait=30');
    expect(res.status).toBe(404);
    expect(await soDangCho()).toBe(0);
  });
});

/* ================================================================== *
 * 5. d.267 — "≤ 3 GIÂY sau khi chủ bấm Gửi" (luật trung tâm)
 * ================================================================== */
describe('SPEC mục 8 d.267 — agent đang chờ nhận kết quả TRONG VÒNG 3 GIÂY', () => {
  it(
    'đang `--wait 30` mà chủ bấm Gửi → tỉnh và trả kết quả dưới 3 giây',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'run_command' });

      const dang_cho = ketQua('T-1', T.man, '?wait=30');
      // Để request kịp vào sổ chờ của cửa ghi (hỏi lại sổ thật, không nghỉ cố định).
      await choVaoSo(1);

      const t_gui = Date.now();
      expect((await chuGui('T-1', { ghi_them: 'đã chạy, 42 test xanh' })).status).toBe(200);

      const v = await than(await dang_cho);
      const ms = Date.now() - t_gui;

      // **Assert mang tải**: vô hiệu `can_chu_ma:T-x` thì dòng này đỏ (hết 30 giây).
      expect(ms).toBeLessThan(3_000);
      expect(v.het_gio).toBe(false);
      expect(v.da_xu_ly).toBe(true);
      expect(v.trang_thai).toBe('resolved');
      expect(v.ket_qua).toBe('đã chạy, 42 test xanh');
      expect(await soDangCho()).toBe(0);
    },
    40_000,
  );

  it(
    'chủ bấm **Bỏ qua** cũng đánh thức — `skipped` là một kết quả (19.9 d.540)',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });

      const dang_cho = ketQua('T-1', T.man, '?wait=30');
      await choVaoSo(1);

      const t_gui = Date.now();
      expect((await chuBoQua('T-1', 'việc đã tự hết')).status).toBe(200);

      const v = await than(await dang_cho);
      expect(Date.now() - t_gui).toBeLessThan(3_000);
      expect(v.trang_thai).toBe('skipped');
      expect(v.da_xu_ly).toBe(true);
      expect(v.het_gio).toBe(false);
      expect(v.ly_do_bo_qua).toBe('việc đã tự hết');
    },
    40_000,
  );

  it(
    'mục KHÁC được xử lý thì lệnh chờ KHÔNG trả về sớm (chủ đề mang `T-số`)',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
      await dungCanChu('ct-2', { project_id: PJ, loai: 'fyi' });

      const t0 = Date.now();
      const dang_cho = ketQua('T-1', T.man, '?wait=3');
      await choVaoSo(1);

      expect((await chuGui('T-2')).status).toBe(200);

      const v = await than(await dang_cho);
      expect(v.het_gio).toBe(true);
      expect(v.trang_thai).toBe('open');
      // Vẫn chờ gần đủ 3 giây; đường cắt sớm sẽ về sau ~250 ms (xa hơn 8 lần).
      expect(Date.now() - t0).toBeGreaterThanOrEqual(2_000);
    },
    40_000,
  );

  /*
   * **Cửa sổ đua** — lý do `#dangKyCho` tồn tại tách khỏi `cho()`.
   *
   * `truocKhiDoc` được gọi **ngay sau khi waiter vào sổ và ngay trước** lần đọc
   * trạng thái, tức đúng khe mà một lệnh ghi rơi vào sẽ mất khoá đánh thức nếu
   * thứ tự là "đọc trước, đăng ký sau". Hai assertion mang tải:
   *   * `soDangCho() === 1` **trong** hook — đổi thứ tự thì ở đây là 0, ca đỏ ngay.
   *   * kết quả trả về là `resolved` và **nhanh**, dù lệnh ghi rơi đúng vào khe.
   */
  it(
    'd.267 — chủ bấm Gửi vào ĐÚNG KHE giữa đăng ký waiter và lần đọc',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });

      await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
        let da_vao_khe = false;
        const v = await gate.choCanChu(
          {
            workspace_id: WS,
            ai: {
              loai: 'agent',
              ai: aiAgent('manager', { agent_id: AG.man, du_an_duoc_vao: [PJ] }),
              token_bam: null,
            },
            ma_hoac_id: 'T-1',
            han_ms: 30_000,
          },
          undefined,
          async () => {
            // Chỉ chen một lần: vòng sau mục đã `resolved` nên không cần nữa.
            if (da_vao_khe) return;
            da_vao_khe = true;
            // **Waiter phải đã vào sổ TRƯỚC lần đọc** — đó là cả luật của ca này.
            expect(gate.soDangCho()).toBe(1);
            expect((await chuGui('T-1', { ghi_them: 'gửi đúng vào khe' })).status).toBe(200);
          },
        );

        expect(da_vao_khe).toBe(true);
        expect(v.trang_thai).toBe('resolved');
        expect(v.ket_qua).toBe('gửi đúng vào khe');
        expect(v.het_gio).toBe(false);
        expect(gate.soDangCho()).toBe(0);
      });
    },
    40_000,
  );
});

/* ================================================================== *
 * 6. 19.9 d.543 — hết thời gian chờ (CLI thoát mã 4)
 * ================================================================== */
describe('SPEC 19.9 d.543 — hết thời gian mà mục chưa xử lý', () => {
  it(
    'không ai bấm Gửi → 200 với `het_gio: true` và trạng thái vẫn `open`',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });

      const t0 = Date.now();
      const res = await ketQua('T-1', T.man, '?wait=1');
      const ms = Date.now() - t0;

      // **Không phải lỗi HTTP**: 200. CLI dịch `het_gio` thành mã thoát 4.
      expect(res.status).toBe(200);
      const v = await than(res);
      expect(v.het_gio).toBe(true);
      expect(v.trang_thai).toBe('open');
      expect(v.da_xu_ly).toBe(false);
      expect(ms).toBeGreaterThanOrEqual(900);
      expect(v.da_cho_ms).toBeGreaterThanOrEqual(900);
      expect(await soDangCho()).toBe(0);
    },
    30_000,
  );

  it(
    '`het_gio` phân biệt được hai ca có CÙNG `trang_thai: "open"`',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
      // Không `--wait`: mục chưa xử lý, nhưng **không** hết giờ (CLI thoát mã 0).
      const khong_cho = await than(await ketQua('T-1', T.man));
      // Có `--wait`: hết giờ (CLI thoát mã 4).
      const co_cho = await than(await ketQua('T-1', T.man, '?wait=1'));

      expect(khong_cho.trang_thai).toBe(co_cho.trang_thai);
      expect(khong_cho.het_gio).toBe(false);
      expect(co_cho.het_gio).toBe(true);
    },
    30_000,
  );

  it('mục đã xử lý thì `het_gio` KHÔNG bao giờ bật', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    expect((await chuGui('T-1')).status).toBe(200);
    expect((await than(await ketQua('T-1', T.man, '?wait=1'))).het_gio).toBe(false);
  });
});

/* ================================================================== *
 * 7. Dọn sổ waiter: client ngắt, token mất hiệu lực
 * ================================================================== */
describe('dọn sổ waiter của `result --wait`', () => {
  it('client NGẮT giữa lúc chờ → sổ waiter sạch, không đánh thức xác', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });

    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const ngat = new AbortController();
      const cho = gate.choCanChu(
        {
          workspace_id: WS,
          ai: {
            loai: 'agent',
            ai: aiAgent('manager', { agent_id: AG.man, du_an_duoc_vao: [PJ] }),
            token_bam: null,
          },
          ma_hoac_id: 'T-1',
          han_ms: 30_000,
        },
        ngat.signal,
      );
      try {
        await choVaoSoCua(gate, 1);
      } catch (e) {
        // Assert đỏ: vẫn huỷ lệnh chờ 30 giây để nó không sống quá ca.
        ngat.abort();
        return choRoiNem(e, cho);
      }

      ngat.abort();
      const v = await cho;

      expect(gate.soDangCho()).toBe(0);
      expect(v.het_gio).toBe(true);
      expect(v.trang_thai).toBe('open');
      // Không còn ai nghe: một khoá tới sau không gọi dậy cái xác nào.
      expect(gate.danhThuc('can_chu_ma:T-1')).toBe(0);
    });
  }, 30_000);

  it(
    'token bị THU HỒI giữa lúc chờ → waiter tỉnh và cắt với 401 (cau-hoi-spec #51)',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: AG.man });

      const t0 = Date.now();
      const dang_cho = ketQua('T-1', T.man, '?wait=30');
      await choVaoSo(1);

      const thu = await goiApi(`/v1/agent/${AG.man}/token/thu-hoi`, TOKEN_CHU, { method: 'POST' });
      expect(thu.status).toBe(200);

      const res = await dang_cho;
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
      expect(Date.now() - t0).toBeLessThan(5_000);
      expect(await soDangCho()).toBe(0);
    },
    40_000,
  );

  it(
    'agent bị TẮT thẳng trong DB (không phát khoá) → đường hết hạn vẫn trả 403',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });

      const dang_cho = ketQua('T-1', T.man, '?wait=2');
      await choVaoSo(1);

      await env.DB.prepare('UPDATE agent SET disabled = 1 WHERE id = ? AND workspace_id = ?')
        .bind(AG.man, WS)
        .run();

      const res = await dang_cho;
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
      expect(await soDangCho()).toBe(0);
    },
    30_000,
  );

  it('khoá của mục KHÁC không gọi dậy waiter của mình', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });

    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const cho = gate.choCanChu({
        workspace_id: WS,
        ai: {
          loai: 'agent',
          ai: aiAgent('manager', { agent_id: AG.man, du_an_duoc_vao: [PJ] }),
          token_bam: null,
        },
        ma_hoac_id: 'T-1',
        han_ms: 1_500,
      });
      try {
        await choVaoSoCua(gate, 1);
      } catch (e) {
        // Assert đỏ: chờ lệnh chờ 1,5 giây tự hết hạn, không để nó sống quá ca.
        return choRoiNem(e, cho);
      }

      expect(gate.danhThuc('can_chu_ma:T-2')).toBe(0);
      expect(gate.danhThuc('can_chu')).toBe(0);
      expect(gate.danhThuc('can_chu_ma:T-1')).toBe(1);

      const v = await cho;
      expect(v.trang_thai).toBe('open');
    });
  }, 30_000);
});

/* ================================================================== *
 * 8. 19.12 câu 53 — lệnh chờ dài là lệnh ĐỌC
 * ================================================================== */
describe('19.12 câu 53 — `result --wait` là lệnh ĐỌC, không nhích mốc nào', () => {
  it(
    'KHÔNG nhích "lần cuối lên tiếng" của agent, KHÔNG nhích tín hiệu phiên',
    async () => {
      const cu = Date.now() - 5 * 60_000;
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
      await dungLuotGiao('lg-1', TK, AG.man, {
        nguoi_giao_agent_id: null,
        trang_thai: 'in_progress',
      });
      await dungPhien('ph-1', 'lg-1', {
        trang_thai: 'running',
        tin_hieu_cuoi_luc: cu,
        mo_luc: cu,
      });
      await env.DB.prepare('UPDATE agent SET len_tieng_luc = ? WHERE id = ? AND workspace_id = ?')
        .bind(cu, AG.man, WS)
        .run();

      // Một lần đọc thường và một lệnh **chờ dài** hết giờ.
      expect((await ketQua('T-1', T.man)).status).toBe(200);
      expect((await ketQua('T-1', T.man, '?wait=1')).status).toBe(200);

      expect(await lenTiengCua(AG.man)).toBe(cu);
      expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(cu);

      // Đối chứng: một lệnh GHI (nhịp tim) thì **có** nhích cả hai mốc.
      const hb = await goiApi('/v1/luot-giao/lg-1/heartbeat', T.man, {
        method: 'POST',
        than: {},
      });
      expect(hb.status).toBe(200);
      expect(await lenTiengCua(AG.man)).toBeGreaterThan(cu);
      expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBeGreaterThan(cu);
    },
    30_000,
  );
});

/* ================================================================== *
 * 9. d.268 — `resolved_asks`
 * ================================================================== */
describe('SPEC mục 8 d.268 — `resolved_asks` ở lần gọi kế tiếp', () => {
  it('mục do CHÍNH agent này tạo, đã xử lý → hiện trong `resolved_asks` của `tasks`', async () => {
    await dungCanChu('ct-1', {
      project_id: PJ,
      loai: 'run_command',
      tao_boi_agent_id: AG.man,
    });
    expect((await chuGui('T-1', { ghi_them: 'đã chạy' })).status).toBe(200);

    const v = await (await tasks(T.man)).json<TasksRa>();
    expect(v.resolved_asks).toHaveLength(1);
    expect(v.resolved_asks[0]?.ma).toBe('T-1');
    expect(v.resolved_asks[0]?.trang_thai).toBe('resolved');
    expect(v.resolved_asks[0]?.ket_qua).toBe('đã chạy');
  });

  it('mục `skipped` cũng vào `resolved_asks` (19.9 d.540)', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: AG.man });
    expect((await chuBoQua('T-1', 'hết cần')).status).toBe(200);

    const v = await (await tasks(T.man)).json<TasksRa>();
    expect(v.resolved_asks).toHaveLength(1);
    expect(v.resolved_asks[0]?.trang_thai).toBe('skipped');
    expect(v.resolved_asks[0]?.ly_do_bo_qua).toBe('hết cần');
  });

  it('mục còn `Chờ` KHÔNG vào `resolved_asks`', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: AG.man });
    expect((await (await tasks(T.man)).json<TasksRa>()).resolved_asks).toEqual([]);
  });

  it('mục do agent KHÁC tạo không vào `resolved_asks` của mình', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: AG.man2 });
    expect((await chuGui('T-1')).status).toBe(200);

    expect((await (await tasks(T.man)).json<TasksRa>()).resolved_asks).toEqual([]);
    // Đối chứng: người tạo thì nhận được.
    expect((await (await tasks(T.man2)).json<TasksRa>()).resolved_asks).toHaveLength(1);
  });

  it('mục do CHỦ tạo không vào `resolved_asks` của ai (d.268 nói về agent)', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: null });
    expect((await chuGui('T-1')).status).toBe(200);
    expect((await (await tasks(T.man)).json<TasksRa>()).resolved_asks).toEqual([]);
    // Chủ gọi `tasks` được (19.12 câu 52) nhưng không có `resolved_asks` nào.
    expect((await (await tasks(TOKEN_CHU)).json<TasksRa>()).resolved_asks).toEqual([]);
  });

  it('mục đã xử lý **ngoài cửa sổ** thời gian không ra nữa', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: AG.man });
    expect((await chuGui('T-1')).status).toBe(200);
    // Đẩy mốc xử lý ra ngoài cửa sổ — một ms là đủ, biên đo được.
    await env.DB.prepare('UPDATE can_chu SET xu_ly_luc = ? WHERE id = ? AND workspace_id = ?')
      .bind(Date.now() - CUA_SO_RESOLVED_ASKS_MS - 1, 'ct-1', WS)
      .run();

    expect((await (await tasks(T.man)).json<TasksRa>()).resolved_asks).toEqual([]);
  });

  it('tầm nhìn vẫn áp: agent bị bỏ khỏi dự án không còn thấy mục cũ của mình', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: AG.man });
    expect((await chuGui('T-1')).status).toBe(200);
    expect((await (await tasks(T.man)).json<TasksRa>()).resolved_asks).toHaveLength(1);

    await env.DB.prepare('DELETE FROM agent_project WHERE agent_id = ? AND project_id = ?')
      .bind(AG.man, PJ)
      .run();
    expect((await (await tasks(T.man)).json<TasksRa>()).resolved_asks).toEqual([]);
  });

  /*
   * **Luật khoá cửa.** `resolved_asks` là trạng thái **tồn tại dai** (mục nằm
   * trong cửa sổ 24 giờ), nên tính nó vào `co_viec` thì `baton tasks --wait` của
   * agent đó không bao giờ chờ nữa — `--wait 60` trả về ngay lập tức, mãi mãi.
   */
  it(
    '`resolved_asks` KHÔNG làm `co_viec` bật, và `--wait` vẫn chờ đủ giờ',
    async () => {
      await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: AG.man });
      expect((await chuGui('T-1')).status).toBe(200);

      const t0 = Date.now();
      const v = await (await tasks(T.man, '?wait=1')).json<TasksRa>();

      expect(v.resolved_asks).toHaveLength(1);
      expect(v.co_viec).toBe(false);
      expect(v.het_gio).toBe(true);
      expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    },
    30_000,
  );
});

/* ================================================================== *
 * 10. d.269 + d.281 — phiên liên quan tự về `running` (nửa của lượt 2b)
 * ================================================================== */
describe('SPEC mục 8 d.269 — phiên liên quan tự về `running` (không làm vỡ)', () => {
  it('chủ bấm Gửi: phiên thôi `waiting_owner`, và `result` thấy kết quả', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: AG.man });
    await dungLuotGiao('lg-1', TK, AG.man, {
      nguoi_giao_agent_id: null,
      trang_thai: 'in_progress',
    });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'running' });
    await env.DB.prepare(
      `UPDATE phien SET trang_thai = 'waiting_owner', can_chu_id = ?
        WHERE id = ? AND workspace_id = ?`,
    )
      .bind('ct-1', 'ph-1', WS)
      .run();

    expect((await chuGui('T-1')).status).toBe(200);

    const p = await phienTrongDb('ph-1');
    expect(p?.trang_thai).toBe('running');
    expect((await than(await ketQua('T-1', T.man))).da_xu_ly).toBe(true);
  });
});

/* ================================================================== *
 * 11. Luật thuần — hàm phạm vi gọi đúng `pham-vi-chung.ts`
 * ================================================================== */
describe('19.12 câu 61 — điều kiện lớp Chung nằm TRONG câu SQL, một chỗ', () => {
  it('`locPhamViCanChu` của chủ không giới hạn gì; của `worker` không có nhánh Chung', async () => {
    const { locPhamViCanChu } = await import('../src/doc-can-chu.js');

    expect(locPhamViCanChu(CHU)).toEqual({ sql: '', bind: [] });

    const wk = locPhamViCanChu(aiAgent('worker', { agent_id: AG.work, du_an_duoc_vao: [PJ] }));
    expect(wk.sql).toContain('ct.project_id IN');
    // `worker` không đọc mục Chung nào, nên **không** có vế `IS NULL` nào.
    expect(wk.sql).not.toContain('IS NULL');

    const mgr = locPhamViCanChu(aiAgent('manager', { agent_id: AG.man, du_an_duoc_vao: [PJ] }));
    expect(mgr.sql).toContain('ct.project_id IS NULL AND ct.tao_boi_agent_id = ?');
    expect(mgr.bind).toEqual([AG.man, AG.man]);

    const coord = locPhamViCanChu(
      aiAgent('coordinator', { agent_id: AG.coord, du_an_duoc_vao: [PJ] }),
    );
    expect(coord.sql).toContain('ct.project_id IS NULL');
    expect(coord.sql).not.toContain('tao_boi_agent_id');
  });
});
