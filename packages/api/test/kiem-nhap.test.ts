/**
 * **Việc sửa A1 của reviewer lượt 1.**
 *
 * Lượt 1, handler `doi_tieu_de` ghi thẳng `lenh.tieu_de` vào DB mà không gọi
 * `kiemTieuDeTicket`, nên tiêu đề `"   "` lọt qua — lệch SPEC mục 4 ("tiêu đề
 * bắt buộc, **1–200 ký tự sau khi cắt khoảng trắng**"; "tiêu đề rỗng bị từ chối
 * (`INVALID_INPUT`)").
 *
 * Luật chung đặt từ lượt này: **mọi handler ghi phải kiểm nhập ở cửa ghi, không
 * tin client**. File này kiểm luật đó trên cả hai đường ghi ticket đang có, và
 * kiểm cả hai chặng: qua HTTP **và** gọi thẳng cửa ghi (CLI, MCP, API dùng chung
 * cửa ghi, nên hàng rào phải nằm ở đó, không nằm ở tầng HTTP).
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { BatonError, DAI_TIEU_DE_TOI_DA } from '@baton/shared';
import { goiLenh } from '../src/workspace-gate.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
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

/** Tiêu đề phải bị từ chối, theo đúng chữ SPEC mục 4. */
const TIEU_DE_XAU: [string, string][] = [
  ['   ', 'chỉ khoảng trắng'],
  ['', 'rỗng'],
  ['\t\n  \n', 'chỉ ký tự trắng'],
  ['  ', 'chỉ khoảng trắng không ngắt'],
  ['x'.repeat(DAI_TIEU_DE_TOI_DA + 1), 'dài hơn 200 ký tự'],
  [`   ${'x'.repeat(DAI_TIEU_DE_TOI_DA + 1)}   `, 'dài hơn 200 sau khi cắt khoảng trắng'],
];

describe('A1 — đổi tiêu đề: kiểm nhập ở cửa ghi', () => {
  let ticket = '';
  beforeEach(async () => {
    await dungWorkspace();
    const du_an = await dungDuAn('SAI');
    ticket = await dungTicket(du_an, 1, 'Tiêu đề hợp lệ ban đầu');
  });

  it.each(TIEU_DE_XAU)(
    'gọi THẲNG cửa ghi với tiêu đề %j (%s) → INVALID_INPUT, DB không đổi',
    async (tieu_de) => {
      const loi = await goiLenh(env, {
        loai: 'doi_tieu_de',
        workspace_id: WS,
        ai: CHU,
        ticket_id: ticket,
        tieu_de,
      }).catch((e: unknown) => e);

      expect(BatonError.la(loi)).toBe(true);
      expect((loi as BatonError).ma).toBe('INVALID_INPUT');
      expect((loi as BatonError).http).toBe(422);

      // Tiêu đề cũ còn nguyên, và không có dòng lịch sử nào được ghi.
      const d = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
        .bind(ticket)
        .first<{ tieu_de: string }>();
      expect(d?.tieu_de).toBe('Tiêu đề hợp lệ ban đầu');
      const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket_history').first<{
        n: number;
      }>();
      expect(n?.n).toBe(0);
    },
  );

  it.each(TIEU_DE_XAU)('qua HTTP với tiêu đề %j (%s) → 422 INVALID_INPUT', async (tieu_de) => {
    const res = await goiApi(`/v1/ticket/${ticket}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { tieu_de },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('tiêu đề hợp lệ được GHI ĐÃ CẮT khoảng trắng, không ghi giá trị thô', async () => {
    await goiLenh(env, {
      loai: 'doi_tieu_de',
      workspace_id: WS,
      ai: CHU,
      ticket_id: ticket,
      tieu_de: '   Tiêu đề có khoảng trắng hai đầu   ',
    });

    const d = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
      .bind(ticket)
      .first<{ tieu_de: string }>();
    expect(d?.tieu_de).toBe('Tiêu đề có khoảng trắng hai đầu');

    // Lịch sử cũng ghi giá trị đã kiểm, không ghi chuỗi thô.
    const ls = await env.DB.prepare(
      'SELECT gia_tri_moi FROM ticket_history WHERE ticket_id = ?',
    )
      .bind(ticket)
      .first<{ gia_tri_moi: string }>();
    expect(ls?.gia_tri_moi).toBe('Tiêu đề có khoảng trắng hai đầu');
  });

  it('đúng 200 ký tự sau khi cắt là hợp lệ (biên trên của SPEC mục 4)', async () => {
    const tieu_de = 'x'.repeat(DAI_TIEU_DE_TOI_DA);
    const kq = await goiLenh(env, {
      loai: 'doi_tieu_de',
      workspace_id: WS,
      ai: CHU,
      ticket_id: ticket,
      tieu_de: `  ${tieu_de}  `,
    });
    expect(kq.tieu_de).toHaveLength(DAI_TIEU_DE_TOI_DA);
  });

  it('một ký tự là hợp lệ (biên dưới của SPEC mục 4)', async () => {
    const kq = await goiLenh(env, {
      loai: 'doi_tieu_de',
      workspace_id: WS,
      ai: CHU,
      ticket_id: ticket,
      tieu_de: 'x',
    });
    expect(kq.tieu_de).toBe('x');
  });

  it('tiêu đề không phải chuỗi (số, null, object) → INVALID_INPUT', async () => {
    for (const tieu_de of [42, null, { a: 1 }, ['x'], true]) {
      const res = await goiApi(`/v1/ticket/${ticket}`, TOKEN_CHU, {
        method: 'PATCH',
        than: { tieu_de },
      });
      expect(res.status, JSON.stringify(tieu_de)).toBe(422);
    }
  });

  it('kiểm nhập chạy TRƯỚC khi tra ticket: tiêu đề xấu + ticket lạ vẫn là INVALID_INPUT', async () => {
    // Thứ tự này quan trọng: nếu tra ticket trước thì lỗi sẽ là NOT_FOUND và
    // lỗi nhập bị che, nên bug kiểu A1 không ai thấy.
    const loi = await goiLenh(env, {
      loai: 'doi_tieu_de',
      workspace_id: WS,
      ai: CHU,
      ticket_id: 'tk-khong-ton-tai',
      tieu_de: '   ',
    }).catch((e: unknown) => e);
    expect((loi as BatonError).ma).toBe('INVALID_INPUT');
  });
});

describe('A1 — tạo ticket: cùng một luật kiểm nhập', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI');
  });

  it.each(TIEU_DE_XAU)('tạo ticket với tiêu đề %j (%s) → 422, không có ticket nào', async (tieu_de) => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });

    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('tiêu đề xấu KHÔNG làm bộ đếm số ticket nhảy (số không tái dùng — SPEC mục 4)', async () => {
    await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: '   ' },
    });
    const tao = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc thật đầu tiên' },
    });
    // Nếu lệnh hỏng vẫn tăng bộ đếm thì ticket thật đầu tiên sẽ là SAI-2.
    expect(await tao.json()).toMatchObject({ ma: 'SAI-1', so: 1 });
  });

  it('ticket được ghi tiêu đề đã cắt khoảng trắng', async () => {
    const tao = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: '  Việc có khoảng trắng  ' },
    });
    const { id, tieu_de } = await tao.json<{ id: string; tieu_de: string }>();
    expect(tieu_de).toBe('Việc có khoảng trắng');
    const d = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
      .bind(id)
      .first<{ tieu_de: string }>();
    expect(d?.tieu_de).toBe('Việc có khoảng trắng');
  });

  it('ưu tiên lạ → INVALID_INPUT (5 mức cố định — SPEC mục 4)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc', uu_tien: 'rat_khan' },
    });
    expect(res.status).toBe(422);
  });

  it('ưu tiên mặc định là `none`, và hạng số khớp (SPEC mục 4)', async () => {
    const tao = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Việc không đặt ưu tiên' },
    });
    const { id } = await tao.json<{ id: string }>();
    const d = await env.DB.prepare('SELECT uu_tien, hang_uu_tien, trang_thai FROM ticket WHERE id = ?')
      .bind(id)
      .first<{ uu_tien: string; hang_uu_tien: number; trang_thai: string }>();
    expect(d).toEqual({ uu_tien: 'none', hang_uu_tien: 4, trang_thai: 'todo' });
  });

  it.each([
    ['urgent', 0],
    ['high', 1],
    ['medium', 2],
    ['low', 3],
    ['none', 4],
  ])('ưu tiên "%s" lưu hạng số %i (để sắp xếp trong SQL)', async (uu_tien, hang) => {
    const tao = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: `Việc ${uu_tien}`, uu_tien },
    });
    const { id } = await tao.json<{ id: string }>();
    const d = await env.DB.prepare('SELECT hang_uu_tien FROM ticket WHERE id = ?')
      .bind(id)
      .first<{ hang_uu_tien: number }>();
    expect(d?.hang_uu_tien).toBe(hang);
  });

  it('dự án không tồn tại → NOT_FOUND', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-khong-co', tieu_de: 'Việc' },
    });
    expect(res.status).toBe(404);
  });

  it('thân request không phải JSON object → INVALID_INPUT', async () => {
    for (const than of [[1, 2], 'chuỗi', 42, null]) {
      const res = await goiApi('/v1/ticket', TOKEN_CHU, { method: 'POST', than });
      expect(res.status, JSON.stringify(than)).toBe(422);
    }
  });
});
