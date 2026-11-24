/**
 * **Màn hình Nhật ký quyết định** — tầng API của SPEC mục 10 d.306–312, mục 14.
 *
 * Đường đọc của mục 10 đã có test riêng (`nhat-ky.test.ts`); ở đây chỉ canh ba
 * thứ mà **màn hình** thêm vào, và chúng không được sống trong component:
 *
 *   1. **`bay_gio` là một mốc cho cả thân** (d.412) — chữ tương đối của giao diện
 *      phải đếm từ đồng hồ máy chủ.
 *   2. **Cổng "chỉ chủ"** của mục 14: agent gọi đường này nhận `FORBIDDEN`, kể cả
 *      một `coordinator` (vốn đọc được **mọi** dòng Chung theo 19.12 câu 61 trên
 *      đường `GET /v1/nhat-ky`) — màn hình web không phải cửa của agent.
 *   3. **Ba bộ lọc của d.311 đi qua đúng tham số** mà giao diện gửi: dự án (kể cả
 *      `chung` của 19.12 câu 4), ai, và tìm theo chữ.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { manHinhNhatKy } from '../src/doc-man-hinh-nhat-ky.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  aiAgent,
  dungAgentCoToken,
  dungDuAn,
  dungNhatKy,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const GIO = 1_760_000_000_000;
const PHUT = 60_000;

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn();
});

describe('Màn hình Nhật ký (mục 10 d.311, mục 14)', () => {
  it('trả một mốc bay_gio cho cả thân (d.412)', async () => {
    await dungNhatKy('nk-1', { luc: GIO - PHUT, quyet_dinh: 'Dùng D1', vi_sao: 'Vì rẻ' });

    const ra = await manHinhNhatKy(env.DB, CHU, WS, {}, GIO);
    expect(ra.bay_gio).toBe(GIO);
    expect(ra.items.map((d) => d.quyet_dinh)).toEqual(['Dùng D1']);
    // Mốc **truyền vào**, không `Date.now()`: gọi lại với mốc khác thì đổi theo.
    const sau = await manHinhNhatKy(env.DB, CHU, WS, {}, GIO + 5 * PHUT);
    expect(sau.bay_gio).toBe(GIO + 5 * PHUT);
  });

  it('gom theo ngày và "vì sao" không rỗng ở mọi dòng (d.311, 19.12 câu 62)', async () => {
    await dungNhatKy('nk-1', { luc: GIO - PHUT, vi_sao: 'Vì A' });
    await dungNhatKy('nk-2', { luc: GIO - 2 * PHUT, vi_sao: 'Vì B' });

    const ra = await manHinhNhatKy(env.DB, CHU, WS, {}, GIO);
    expect(ra.nhom_theo_ngay).toHaveLength(1);
    expect(ra.nhom_theo_ngay[0]?.so_dong).toBe(2);
    for (const d of ra.items) expect(d.vi_sao.trim()).not.toBe('');
  });

  it('ba bộ lọc của d.311 đi qua đúng tham số giao diện gửi', async () => {
    await dungNhatKy('nk-chung', { luc: GIO - PHUT, quyet_dinh: 'Dòng Chung' });
    await dungNhatKy('nk-du-an', {
      luc: GIO - 2 * PHUT,
      project_id: 'pj-SAI',
      quyet_dinh: 'Dòng của dự án',
    });

    // 19.12 câu 4: `project_id=chung` lọc đúng lớp dòng có trường dự án **rỗng**.
    const chung = await manHinhNhatKy(env.DB, CHU, WS, { project_id: 'chung' }, GIO);
    expect(chung.items.map((d) => d.id)).toEqual(['nk-chung']);

    const theo_du_an = await manHinhNhatKy(env.DB, CHU, WS, { project_id: 'pj-SAI' }, GIO);
    expect(theo_du_an.items.map((d) => d.id)).toEqual(['nk-du-an']);

    const cua_chu = await manHinhNhatKy(env.DB, CHU, WS, { ai_loc: 'chu' }, GIO);
    expect(cua_chu.items).toHaveLength(2);

    const tim = await manHinhNhatKy(env.DB, CHU, WS, { tim: 'dự án' }, GIO);
    expect(tim.items.map((d) => d.id)).toEqual(['nk-du-an']);
  });

  it('agent — kể cả coordinator — gọi màn hình này thì FORBIDDEN', async () => {
    await expect(
      manHinhNhatKy(env.DB, aiAgent('coordinator', { vao_tat_ca_du_an: true }), WS, {}, GIO),
    ).rejects.toMatchObject({ ma: 'FORBIDDEN' });
  });

  it('đường HTTP: chủ 200 kèm bay_gio, agent 403', async () => {
    await dungNhatKy('nk-1', { luc: GIO - PHUT });
    await dungAgentCoToken({
      id: 'ag-1',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: 'bt_token_cos',
      vao_tat_ca_du_an: true,
    });

    const chu = await goiApi('/v1/man-hinh-nhat-ky?tim=', TOKEN_CHU);
    expect(chu.status).toBe(200);
    const than = await chu.json<{ bay_gio: number; items: unknown[] }>();
    expect(than.bay_gio).toBeGreaterThan(0);
    expect(than.items).toHaveLength(1);

    const agent = await goiApi('/v1/man-hinh-nhat-ky', 'bt_token_cos');
    expect(agent.status).toBe(403);

    // Đường của agent (`GET /v1/nhat-ky`) **vẫn mở** — màn hình không siết nó.
    const duong_agent = await goiApi('/v1/nhat-ky', 'bt_token_cos');
    expect(duong_agent.status).toBe(200);
  });
});
