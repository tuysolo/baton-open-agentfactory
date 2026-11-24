/**
 * `@baton/client` — chỗ cắm chung cho CLI và MCP (SPEC mục 13).
 * Kiểm: lỗi `{ error, message }` được dựng lại thành `BatonError` để CLI in
 * đúng mã lỗi và chọn đúng mã thoát.
 */

import { describe, expect, it } from 'vitest';
import { BatonError, MA_THOAT, maThoatCuaLoi } from '@baton/shared';
import { CHO_DAI_TOI_DA_GIAY, batonFetch, type CauHinhClient } from '@baton/client';

function cauHinh(fetchGia: typeof fetch): CauHinhClient {
  return { baseUrl: 'https://baton.test/', token: 'bt_token-gia', fetch: fetchGia };
}

describe('batonFetch', () => {
  it('gửi token ở header Authorization và không bao giờ đưa token vào URL', async () => {
    let urlDaGoi = '';
    let authDaGui = '';
    const kq = await batonFetch<{ ok: boolean }>(
      cauHinh(async (url, init) => {
        urlDaGoi = String(url);
        authDaGui = String((init?.headers as Record<string, string>).authorization);
        return Response.json({ ok: true });
      }),
      { method: 'GET', path: '/v1/health' },
    );
    expect(kq).toEqual({ ok: true });
    expect(urlDaGoi).toBe('https://baton.test/v1/health');
    expect(urlDaGoi).not.toContain('bt_token-gia');
    expect(authDaGui).toBe('Bearer bt_token-gia');
  });

  it('bỏ qua tham số query undefined', async () => {
    let urlDaGoi = '';
    await batonFetch(
      cauHinh(async (url) => {
        urlDaGoi = String(url);
        return Response.json({});
      }),
      {
        method: 'GET',
        path: '/v1/tickets',
        query: { project: 'SAI', status: undefined, limit: 50 },
      },
    );
    expect(urlDaGoi).toBe('https://baton.test/v1/tickets?project=SAI&limit=50');
  });

  it('lỗi API thành BatonError đúng mã, đúng thông điệp tiếng Việt', async () => {
    const loi = await batonFetch(
      cauHinh(async () =>
        Response.json(
          { error: 'EVIDENCE_REQUIRED', message: 'Chưa đủ bằng chứng để vào Xong.' },
          { status: 422 },
        ),
      ),
      { method: 'POST', path: '/v1/tickets/SAI-1/status' },
    ).catch((e: unknown) => e);

    expect(BatonError.la(loi)).toBe(true);
    expect((loi as BatonError).ma).toBe('EVIDENCE_REQUIRED');
    expect((loi as BatonError).message).toBe('Chưa đủ bằng chứng để vào Xong.');
    expect(maThoatCuaLoi((loi as BatonError).ma)).toBe(MA_THOAT.loi_nghiep_vu);
  });

  it('429 giữ lại Retry-After; token sai cho mã thoát 2', async () => {
    const loi429 = await batonFetch(
      cauHinh(async () =>
        Response.json({ error: 'RATE_LIMITED', message: 'Quá giới hạn.' }, {
          status: 429,
          headers: { 'retry-after': '30' },
        }),
      ),
      { method: 'GET', path: '/v1/tasks' },
    ).catch((e: unknown) => e as BatonError);
    expect((loi429 as BatonError).retryAfter).toBe(30);

    const loi401 = await batonFetch(
      cauHinh(async () =>
        Response.json({ error: 'INVALID_TOKEN', message: 'Token sai.' }, { status: 401 }),
      ),
      { method: 'GET', path: '/v1/whoami' },
    ).catch((e: unknown) => e as BatonError);
    expect(maThoatCuaLoi((loi401 as BatonError).ma)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
  });

  /**
   * **Ghim hành vi hiện tại:** nhánh **≥ 500** BỎ `Retry-After`.
   *
   * Mã đọc header `retry-after` **chỉ** trong nhánh `status < 500`. Nên một
   * `503 + Retry-After: 30` mang thân `RATE_LIMITED` ra `INTERNAL` (mã thoát 2) và
   * `retryAfter` là `undefined`: CLI **mất** thông tin chờ. Hôm nay không đường nào
   * của server dựng cặp đó (giới hạn token trả 429 — SPEC mục 13 d.386 "429 kèm
   * `Retry-After`"), nên đây là một lựa chọn chứ không một lỗi — ca này tồn tại để
   * lựa chọn ấy có dấu, và để lúc ai đó đổi nó thì phải đổi ở đây một cách nhìn
   * thấy được.
   */
  it('503 kèm Retry-After: ra INTERNAL và BỎ retryAfter (hành vi đang có)', async () => {
    const loi = await batonFetch(
      cauHinh(async () =>
        Response.json({ error: 'RATE_LIMITED', message: 'Quá giới hạn.' }, {
          status: 503,
          headers: { 'retry-after': '30' },
        }),
      ),
      { method: 'GET', path: '/v1/tasks' },
    ).catch((e: unknown) => e as BatonError);
    expect((loi as BatonError).ma).toBe('INTERNAL');
    expect((loi as BatonError).retryAfter).toBeUndefined();
    expect(maThoatCuaLoi((loi as BatonError).ma)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
  });

  it('204 không có thân thì trả undefined', async () => {
    const kq = await batonFetch(
      cauHinh(async () => new Response(null, { status: 204 })),
      { method: 'DELETE', path: '/v1/x' },
    );
    expect(kq).toBeUndefined();
  });

  it('chờ dài tối đa 60 giây theo SPEC mục 13', () => {
    expect(CHO_DAI_TOI_DA_GIAY).toBe(60);
  });
});
