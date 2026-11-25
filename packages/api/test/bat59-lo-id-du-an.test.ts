/**
 * **BAT-59** — không lộ sự tồn tại của **id dự án** qua các đường GHI (19.12 câu
 * 15 gạch 3: "Với agent ngoài phạm vi, **cả hai ca phải ra phản hồi giống hệt
 * nhau**"). Cùng khuôn BAT-57 (id lượt/phiên, #175) và BAT-58 (id ticket, #176),
 * áp dụng chốt T-75 A — `spec-questions.md` #177.
 *
 * Người gọi **không thấy** được dự án (ngoài `agent_project`, luật của `layDuAn`)
 * ⇒ **cùng dòng `throw NOT_FOUND`** với id bịa: so trực tiếp status, content-type,
 * thân; ảnh DB trước/sau như nhau. Lệnh kiểm quyền/cửa dự án **trước** khi tra
 * (chỉ chủ; `batBuocQuyen(…, { project_id })`) ra 403 cho **mọi** id — không lộ,
 * không đổi. Người **thấy** được mà không có quyền ⇒ vẫn 403.
 *
 * Bảng lệnh ghi nhận id dự án đã rà (agent ngoài phạm vi, id THẬT; trước → sau):
 *   POST  /v1/du-an/:id/loi-da-gap (them_loi_da_gap)          403 → 404 (id bịa 404)
 *   POST  /v1/du-an/:id/loi-da-gap, dự án ngoài phạm vi ĐÃ LƯU TRỮ 403 → 404
 *   PATCH /v1/du-an/:id/ho-so (sua_ho_so_du_an, chỉ chủ)      403 cả hai — đúng sẵn
 *   PATCH /v1/du-an/:id (sua_du_an, chỉ chủ)                  403 cả hai — đúng sẵn
 *   POST  /v1/ticket { project_id } (tao_ticket)              403 cả hai (cửa dự án của quyền trước khi tra) — đúng sẵn
 *   POST  /v1/can-chu { project_id } (tao_can_chu)            403 cả hai — đúng sẵn
 *   POST  /v1/nhat-ky { project_id } (ghi_nhat_ky)            403 cả hai — đúng sẵn
 *   lệnh `cap_so_ticket` (không route HTTP)                   FORBIDDEN cả hai — đúng sẵn
 *   tao_agent / sua_agent `du_an_duoc_vao`, dat_quyen          chỉ chủ, kiểm trước — không lộ
 *   Nhập ticket (phần 8)                                      chưa có lệnh/route
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { BatonError } from '@baton/shared';
import { goiLenh } from '../src/workspace-gate.js';
import {
  TOKEN_CHU,
  WS,
  aiAgent,
  dungAgentCoToken,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/** Token **giả**. */
const TOKEN = {
  wk: 'bt_token_gia_bat59_wk',
  mgr: 'bt_token_gia_bat59_mgr',
  ngoai_mgr: 'bt_token_gia_bat59_ngoai_mgr',
  ngoai_wk: 'bt_token_gia_bat59_ngoai_wk',
  tat_ca: 'bt_token_gia_bat59_tat_ca',
  luu: 'bt_token_gia_bat59_luu',
} as const;

const ID_BIA = 'pj-khong-co';

let P = '';
let P_NGOAI = '';
let P_LUU = '';

async function nen(): Promise<void> {
  await dungWorkspace();
  P = await dungDuAn('SAI', 'Sample');
  P_NGOAI = await dungDuAn('OUT', 'Dự án khác');
  P_LUU = await dungDuAn('OLD', 'Dự án cũ', 'archived');
  await dungAgentCoToken({ id: 'ag-wk', ten: 'W-builder', vai_tro: 'worker', token: TOKEN.wk, du_an: [P] });
  await dungAgentCoToken({ id: 'ag-mgr', ten: 'M-Sample', vai_tro: 'manager', token: TOKEN.mgr, du_an: [P] });
  await dungAgentCoToken({
    id: 'ag-ngoai-mgr',
    ten: 'M-ngoai',
    vai_tro: 'manager',
    token: TOKEN.ngoai_mgr,
    du_an: [P_NGOAI],
  });
  await dungAgentCoToken({
    id: 'ag-ngoai-wk',
    ten: 'W-ngoai',
    vai_tro: 'worker',
    token: TOKEN.ngoai_wk,
    du_an: [P_NGOAI],
  });
  await dungAgentCoToken({
    id: 'ag-tat-ca',
    ten: 'M-tat-ca',
    vai_tro: 'manager',
    token: TOKEN.tat_ca,
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({ id: 'ag-luu', ten: 'W-luu', vai_tro: 'worker', token: TOKEN.luu, du_an: [P_LUU] });

  /*
   * Mỗi người gọi ngoài phạm vi có **đúng 1** phiên mở: một lệnh chung thành công
   * sẽ nhích tín hiệu của nó (BAT-57). Ảnh DB chứa tín hiệu này, nên ca "không
   * nhích phiên" là ca thật.
   */
  const tk_ngoai_1 = await dungTicket(P_NGOAI, 1, 'Việc dự án khác', { trang_thai: 'in_progress' });
  const tk_ngoai_2 = await dungTicket(P_NGOAI, 2, 'Việc khác 2', { trang_thai: 'in_progress' });
  await dungLuotGiao('lg-ngoai-wk', tk_ngoai_1, 'ag-ngoai-wk', { trang_thai: 'in_progress' });
  await dungPhien('ph-ngoai-wk', 'lg-ngoai-wk', { tin_hieu_cuoi_luc: 1 });
  await dungLuotGiao('lg-ngoai-mgr', tk_ngoai_2, 'ag-ngoai-mgr', { trang_thai: 'in_progress' });
  await dungPhien('ph-ngoai-mgr', 'lg-ngoai-mgr', { tin_hieu_cuoi_luc: 1 });
}

/** Toàn bộ phản hồi người gọi thấy: status, kiểu nội dung, thân. */
async function phanHoi(res: Response): Promise<{ status: number; kieu: string | null; than: unknown }> {
  return { status: res.status, kieu: res.headers.get('content-type'), than: await res.json() };
}

/** Ảnh mọi thứ một lệnh ghi theo id dự án có thể chạm, + tín hiệu phiên + "lần cuối lên tiếng". */
async function anhDayDu(): Promise<unknown> {
  const du_an = await env.DB.prepare(
    'SELECT id, ten, trang_thai, cap_nhat_luc FROM project WHERE workspace_id = ? ORDER BY id',
  )
    .bind(WS)
    .all();
  const dem = await env.DB.prepare(
    `SELECT (SELECT count(*) FROM project_loi_da_gap WHERE workspace_id = ?1) AS loi_da_gap,
            (SELECT count(*) FROM project_ho_so WHERE workspace_id = ?1) AS ho_so,
            (SELECT count(*) FROM project_ho_so_ban WHERE workspace_id = ?1) AS ho_so_ban,
            (SELECT count(*) FROM ticket WHERE workspace_id = ?1) AS ticket,
            (SELECT count(*) FROM ticket_history WHERE workspace_id = ?1) AS lich_su,
            (SELECT count(*) FROM can_chu WHERE workspace_id = ?1) AS can_chu,
            (SELECT count(*) FROM nhat_ky WHERE workspace_id = ?1) AS nhat_ky,
            (SELECT count(*) FROM thong_bao WHERE workspace_id = ?1) AS thong_bao`,
  )
    .bind(WS)
    .first();
  const bo_dem = await env.DB.prepare(
    'SELECT pham_vi, khoa, gia_tri FROM bo_dem WHERE workspace_id = ? ORDER BY pham_vi, khoa',
  )
    .bind(WS)
    .all();
  const phien = await env.DB.prepare(
    'SELECT id, trang_thai, tin_hieu_cuoi_luc, cap_nhat_luc FROM phien WHERE workspace_id = ? ORDER BY id',
  )
    .bind(WS)
    .all();
  const agent = await env.DB.prepare('SELECT id, len_tieng_luc FROM agent WHERE workspace_id = ? ORDER BY id')
    .bind(WS)
    .all();
  return {
    du_an: du_an.results,
    dem,
    bo_dem: bo_dem.results,
    phien: phien.results,
    agent: agent.results,
  };
}

interface Duong {
  ten: string;
  method: string;
  /** Đường với id thật hoặc bịa thay vào `:id` (id nằm trong thân thì bỏ qua đối số). */
  duong: (id: string) => string;
  id_that: () => string;
  than?: () => unknown;
  /** Thân phụ thuộc id (id nằm trong thân — `project_id`). */
  than_theo_id?: (id: string) => unknown;
  token: string;
  /** Mong đợi: 404 NOT_FOUND (mặc định) hoặc 403 FORBIDDEN. */
  mong?: { status: number; error: string };
  /** `sửa` (BAT-59 đổi) hoặc `đúng sẵn`. */
  ghi_chu: 'sửa' | 'đúng sẵn';
}

const KHONG_TIM_THAY = { status: 404, error: 'NOT_FOUND' };
const CAM = { status: 403, error: 'FORBIDDEN' };

describe('BAT-59 — agent ngoài phạm vi: id dự án THẬT ≡ id bịa, không ghi gì', () => {
  beforeEach(nen);

  const DUONG: Duong[] = [
    { ten: 'thêm "Lỗi đã gặp" (worker ngoài)', method: 'POST', duong: (id) => `/v1/du-an/${id}/loi-da-gap`, id_that: () => P, than: () => ({ loi: 'Dò dự án' }), token: TOKEN.ngoai_wk, ghi_chu: 'sửa' },
    { ten: 'thêm "Lỗi đã gặp" (manager ngoài)', method: 'POST', duong: (id) => `/v1/du-an/${id}/loi-da-gap`, id_that: () => P, than: () => ({ loi: 'Dò dự án', cach_tranh: 'x' }), token: TOKEN.ngoai_mgr, ghi_chu: 'sửa' },
    { ten: 'thêm "Lỗi đã gặp" vào dự án ngoài phạm vi ĐÃ LƯU TRỮ (trạng thái không lộ)', method: 'POST', duong: (id) => `/v1/du-an/${id}/loi-da-gap`, id_that: () => P_LUU, than: () => ({ loi: 'Dò trạng thái' }), token: TOKEN.ngoai_wk, ghi_chu: 'sửa' },
    { ten: 'sửa hồ sơ dự án (chỉ chủ, kiểm trước khi tra)', method: 'PATCH', duong: (id) => `/v1/du-an/${id}/ho-so`, id_that: () => P, than: () => ({ la_gi: 'Sửa hộ' }), token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'sửa dự án (chỉ chủ, kiểm trước khi tra)', method: 'PATCH', duong: (id) => `/v1/du-an/${id}`, id_that: () => P, than: () => ({ ten: 'Đổi tên' }), token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'tạo ticket { project_id } (cửa dự án của quyền trước khi tra)', method: 'POST', duong: () => '/v1/ticket', id_that: () => P, than_theo_id: (id) => ({ project_id: id, tieu_de: 'Xuyên phạm vi' }), token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'tạo mục Cần Chủ { project_id }', method: 'POST', duong: () => '/v1/can-chu', id_that: () => P, than_theo_id: (id) => ({ tieu_de: 'Hỏi chủ', muc: 'today', loai: 'fyi', project_id: id }), token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
    { ten: 'ghi Nhật ký { project_id }', method: 'POST', duong: () => '/v1/nhat-ky', id_that: () => P, than_theo_id: (id) => ({ quyet_dinh: 'Q', vi_sao: 'V', project_id: id }), token: TOKEN.ngoai_mgr, mong: CAM, ghi_chu: 'đúng sẵn' },
  ];

  for (const d of DUONG) {
    it(`${d.method} ${d.ten} [${d.ghi_chu}]: id thật ≡ id bịa (status + content-type + thân), DB không đổi`, async () => {
      const truoc = await anhDayDu();
      const goi = async (id: string): Promise<Response> => {
        const than = d.than_theo_id === undefined ? d.than?.() : d.than_theo_id(id);
        return goiApi(d.duong(id), d.token, {
          method: d.method,
          ...(than === undefined ? {} : { than }),
        });
      };

      const that = await phanHoi(await goi(d.id_that()));
      const bia = await phanHoi(await goi(ID_BIA));

      expect(that).toEqual(bia);
      const mong = d.mong ?? KHONG_TIM_THAY;
      expect(that.status, JSON.stringify(that.than)).toBe(mong.status);
      expect(that.than).toMatchObject({ error: mong.error });
      expect(await anhDayDu()).toEqual(truoc);
    });
  }

  it('lệnh `cap_so_ticket` (không có route HTTP, đi thẳng cửa ghi): dự án ngoài phạm vi ≡ id bịa, không đốt số', async () => {
    const ai = aiAgent('manager', { agent_id: 'ag-ngoai-mgr', du_an_duoc_vao: [P_NGOAI] });
    const loi = async (project_id: string): Promise<{ ma: string; message: string }> => {
      try {
        await goiLenh(env, { loai: 'cap_so_ticket', workspace_id: WS, ai, project_id });
      } catch (e) {
        if (BatonError.la(e)) return { ma: e.ma, message: e.message };
        throw e;
      }
      throw new Error('lệnh phải bị từ chối');
    };
    const truoc = await anhDayDu();
    const that = await loi(P);
    expect(that).toEqual(await loi(ID_BIA));
    expect(that.ma).toBe('FORBIDDEN');
    expect(await anhDayDu()).toEqual(truoc);
  });
});

/* ================================================================== *
 * Thấy được mà không có quyền ⇒ vẫn 403 (không đổi)
 * ================================================================== */

describe('BAT-59 — người gọi THẤY được dự án nhưng không có quyền: vẫn 403', () => {
  beforeEach(nen);

  async function forbidden(res: Response): Promise<void> {
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  }

  it('hồ sơ / sửa dự án: agent TRONG dự án → 403 (chỉ chủ)', async () => {
    await forbidden(await goiApi(`/v1/du-an/${P}/ho-so`, TOKEN.mgr, { method: 'PATCH', than: { la_gi: 'x' } }));
    await forbidden(await goiApi(`/v1/du-an/${P}`, TOKEN.mgr, { method: 'PATCH', than: { ten: 'x' } }));
  });

  it('tạo ticket / Cần Chủ / Nhật ký: worker TRONG dự án (vai không được) → 403', async () => {
    await forbidden(
      await goiApi('/v1/ticket', TOKEN.wk, { method: 'POST', than: { project_id: P, tieu_de: 'Không cha' } }),
    );
    await forbidden(
      await goiApi('/v1/can-chu', TOKEN.wk, {
        method: 'POST',
        than: { tieu_de: 'Hỏi', muc: 'today', loai: 'fyi', project_id: P },
      }),
    );
    await forbidden(
      await goiApi('/v1/nhat-ky', TOKEN.wk, { method: 'POST', than: { quyet_dinh: 'Q', vi_sao: 'V', project_id: P } }),
    );
  });

  it('"Lỗi đã gặp": agent bị tắt THẤY dự án → FORBIDDEN; bị tắt NGOÀI dự án → NOT_FOUND ≡ id bịa (qua cửa ghi)', async () => {
    const loi = async (
      ai: ReturnType<typeof aiAgent>,
      project_id: string,
    ): Promise<{ ma: string; message: string }> => {
      try {
        await goiLenh(env, { loai: 'them_loi_da_gap', workspace_id: WS, ai, project_id, loi: 'x' });
      } catch (e) {
        if (BatonError.la(e)) return { ma: e.ma, message: e.message };
        throw e;
      }
      throw new Error('lệnh phải bị từ chối');
    };
    const truoc = await anhDayDu();
    // `ag-wk` có `agent_project` cho P (bộ lọc phạm vi đọc tra bảng này).
    const tat_trong = aiAgent('worker', { agent_id: 'ag-wk', du_an_duoc_vao: [P], disabled: true });
    expect((await loi(tat_trong, P)).ma).toBe('FORBIDDEN');
    const tat_ngoai = aiAgent('worker', { agent_id: 'ag-ngoai-wk', du_an_duoc_vao: [P_NGOAI], disabled: true });
    const that = await loi(tat_ngoai, P);
    expect(that).toEqual(await loi(tat_ngoai, ID_BIA));
    expect(that.ma).toBe('NOT_FOUND');
    expect(await anhDayDu()).toEqual(truoc);
  });
});

/* ================================================================== *
 * Người trong phạm vi: không đổi hành vi
 * ================================================================== */

describe('BAT-59 — người thấy được dự án làm như cũ', () => {
  beforeEach(nen);

  it('worker TRONG dự án thêm "Lỗi đã gặp" → 201; ghi đúng dự án', async () => {
    const res = await goiApi(`/v1/du-an/${P}/loi-da-gap`, TOKEN.wk, { method: 'POST', than: { loi: 'Bài học' } });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM project_loi_da_gap WHERE project_id = ?').bind(P).first('n'),
    ).toBe(1);
  });

  it('agent "tất cả dự án" thêm "Lỗi đã gặp" vào dự án bất kỳ → 201; id bịa → 404', async () => {
    const res = await goiApi(`/v1/du-an/${P_NGOAI}/loi-da-gap`, TOKEN.tat_ca, {
      method: 'POST',
      than: { loi: 'Bài học chung' },
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    const bia = await goiApi(`/v1/du-an/${ID_BIA}/loi-da-gap`, TOKEN.tat_ca, { method: 'POST', than: { loi: 'x' } });
    expect(bia.status).toBe(404);
  });

  it('chủ: dự án thật → 201, id bịa → 404', async () => {
    const res = await goiApi(`/v1/du-an/${P}/loi-da-gap`, TOKEN_CHU, { method: 'POST', than: { loi: 'Của chủ' } });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    const bia = await goiApi(`/v1/du-an/${ID_BIA}/loi-da-gap`, TOKEN_CHU, { method: 'POST', than: { loi: 'x' } });
    expect(bia.status).toBe(404);
    expect(await bia.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('agent TRONG dự án đã lưu trữ vẫn vấp 409 PROJECT_NOT_ACCEPTING (cổng archived sau cổng phạm vi)', async () => {
    const res = await goiApi(`/v1/du-an/${P_LUU}/loi-da-gap`, TOKEN.luu, { method: 'POST', than: { loi: 'x' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });
  });
});
