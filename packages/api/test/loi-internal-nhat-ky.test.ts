/**
 * **Lỗi `INTERNAL` phải để lại một dòng log chẩn đoán được** — BAT-65.
 *
 * Trên live, `baton evidence … review pass "<chữ có dấu, + = ngoặc>"` gửi ngay
 * sau một `evidence … deploy` từng ra `INTERNAL`/500; gửi lại 1–2 phút sau thì
 * được, và lần lỗi **không** ghi được dòng review. Không tìm ra gốc trong mã, và
 * log cũ không đủ để tìm từ `wrangler tail`. Lượt này chỉ thêm log có cấu trúc +
 * mã tra log — **không** thử lại lệnh ghi (không idempotent, d.222 cấm xoá).
 *
 * Luật đang ghim (SPEC mục 13 thân lỗi `{ error, message }` + mã HTTP; mục 15
 * không rò chi tiết gốc, không log secret):
 *   1. Lỗi lạ từ cửa ghi (DO ném, vd `retryable`) → 500 `INTERNAL` đúng dạng, và
 *      **đúng một** dòng `loi_internal` có đường, loại bằng chứng, cờ của lỗi.
 *   2. Dòng log **không** chứa token, **không** chứa `ghi_chu`.
 *   3. `cf-ray` hợp lệ → thông điệp kèm "(mã tra log: …)"; lạ hoặc vắng → giữ
 *      nguyên thông điệp mặc định.
 *   4. Cửa ghi trả HTTP khác 200 → 500 `INTERNAL` **và** có log (`chi_tiet`).
 *   5. Lỗi nghiệp vụ có tên (404) → **không** có dòng `loi_internal`.
 *   6. Lỗi lạ **trong** `#chayMotLenh` (D1 tạm thời ở `batch`) → dòng
 *      `loi_cua_ghi` có `loai_lenh`, rồi lỗi vẫn ném lên (không nuốt).
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect, vi, type MockInstance } from 'vitest';
import { BANG_LOI } from '@baton/shared';
import { app } from '../src/index.js';
import { WorkspaceGate } from '../src/workspace-gate.js';
import type { Env } from '../src/moi-truong.js';
import type { Lenh } from '../src/lenh.js';
import { TOKEN_CHU, WS, dungDuAn, dungTicket, dungWorkspace } from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/** `ghi_chu` của lần gửi lỗi trên live: chữ có dấu, `+`, `=`, ngoặc. */
const GHI_CHU = 'Đạt yêu cầu (bản 2): a+b=c [đã kiểm] {ổn} — Chủ ✓';
const TK = 'tk-pj-SAI-1';
const DUONG_BC = `/v1/ticket/${TK}/bang-chung`;
const THONG_DIEP_INTERNAL = BANG_LOI.INTERNAL.message;

/** Một lỗi giống lỗi của Durable Object bị reset/quá tải: có cờ `retryable`. */
function loiDoGiaLap(): Error {
  const e = new Error('Durable Object reset because its code was updated.');
  Object.assign(e, { retryable: true, remote: true });
  return e;
}

/** `WORKSPACE_GATE` giả: `get(...).fetch` làm `lam()` — ném, hoặc trả một Response. */
function cuaGhiGia(lam: () => Promise<Response>): DurableObjectNamespace {
  return {
    idFromName: () => ({}) as DurableObjectId,
    get: () => ({ fetch: lam }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace;
}

async function guiReview(moi_truong: Env, headers: Record<string, string> = {}): Promise<Response> {
  return app.fetch(
    new Request(`https://baton.test${DUONG_BC}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN_CHU}`,
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ loai_bang_chung: 'review', ket_luan: 'pass', ghi_chu: GHI_CHU }),
    }),
    moi_truong,
  );
}

/** Nghe `console.error`, không in ra (các lỗi ở đây là CỐ Ý). */
function ngheLog(): MockInstance<(...doi: unknown[]) => void> {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

/** Mọi dòng log có cấu trúc (một chuỗi JSON) mang `su_kien` đã cho. */
function dongTheoSuKien(nghe: MockInstance<(...doi: unknown[]) => void>, su_kien: string): Record<string, unknown>[] {
  const ra: Record<string, unknown>[] = [];
  for (const doi of nghe.mock.calls) {
    if (doi.length !== 1 || typeof doi[0] !== 'string') continue;
    try {
      const o = JSON.parse(doi[0]) as Record<string, unknown>;
      if (o['su_kien'] === su_kien) ra.push(o);
    } catch {
      // Không phải dòng JSON — không phải dòng có cấu trúc.
    }
  }
  return ra;
}

/** Chuỗi của MỌI đối số của MỌI lần gọi — để kiểm "không có ở đâu trong log". */
function toanBoLog(nghe: MockInstance<(...doi: unknown[]) => void>): string {
  return nghe.mock.calls
    .flat()
    .map((d) => (typeof d === 'string' ? d : d instanceof Error ? `${d.name}: ${d.message}\n${String(d.stack)}` : JSON.stringify(d)))
    .join('\n');
}

async function kiemThanInternal(res: Response): Promise<string> {
  expect(res.status).toBe(500);
  const than = await res.json<Record<string, unknown>>();
  expect(Object.keys(than).sort()).toEqual(['error', 'message']);
  expect(than['error']).toBe('INTERNAL');
  expect(typeof than['message']).toBe('string');
  return than['message'] as string;
}

describe('BAT-65 — lỗi INTERNAL để lại một dòng log chẩn đoán được (SPEC mục 13, 15)', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungTicket('pj-SAI', 1, 'Việc cần review', { trang_thai: 'in_progress' });
  });

  it('DO ném lỗi `retryable` khi gửi review → 500 INTERNAL đúng dạng + đúng MỘT dòng loi_internal', async () => {
    const nghe = ngheLog();
    try {
      const res = await guiReview({
        ...env,
        WORKSPACE_GATE: cuaGhiGia(() => Promise.reject(loiDoGiaLap())),
      });
      // Không có `cf-ray` → thông điệp NGUYÊN như trước BAT-65.
      expect(await kiemThanInternal(res)).toBe(THONG_DIEP_INTERNAL);

      const dong = dongTheoSuKien(nghe, 'loi_internal');
      expect(dong).toHaveLength(1);
      const d = dong[0]!;
      expect(d['method']).toBe('POST');
      expect(String(d['duong'])).toContain('bang-chung');
      expect(d['duong']).toBe('/v1/ticket/:id/bang-chung');
      expect(d['ticket']).toBe(TK);
      expect(d['loai_bang_chung']).toBe('review');
      expect(d['retryable']).toBe(true);
      expect(d['remote']).toBe(true);
      expect(d['overloaded']).toBeNull();
      expect(d['loi_ten']).toBe('Error');
      expect(String(d['loi_thong_diep'])).toContain('Durable Object reset');
      expect(d['ray']).toBeNull();
      expect(d['chi_tiet']).toBeNull();

      // Không token, không nội dung bằng chứng — ở BẤT KỲ đối số log nào.
      const log = toanBoLog(nghe);
      expect(log).not.toContain(TOKEN_CHU);
      expect(log).not.toContain('Đạt yêu cầu');
      expect(log).not.toContain('a+b=c');
      expect(log.toLowerCase()).not.toContain('bearer');

      // Lần lỗi không ghi được dòng nào (đúng hiện tượng trên live).
      const { n } = (await env.DB.prepare('SELECT count(*) AS n FROM evidence WHERE ticket_id = ?')
        .bind(TK)
        .first<{ n: number }>())!;
      expect(n).toBe(0);
    } finally {
      nghe.mockRestore();
    }
  });

  it('có `cf-ray` hợp lệ → thông điệp kết thúc bằng "(mã tra log: <ray>)", log mang ray', async () => {
    const nghe = ngheLog();
    try {
      const res = await guiReview(
        { ...env, WORKSPACE_GATE: cuaGhiGia(() => Promise.reject(loiDoGiaLap())) },
        { 'cf-ray': '8abc123-SIN' },
      );
      const message = await kiemThanInternal(res);
      expect(message.startsWith(THONG_DIEP_INTERNAL)).toBe(true);
      expect(message.endsWith('(mã tra log: 8abc123-SIN)')).toBe(true);
      expect(dongTheoSuKien(nghe, 'loi_internal')[0]?.['ray']).toBe('8abc123-SIN');
    } finally {
      nghe.mockRestore();
    }
  });

  it.each([
    ['ký tự lạ', '8abc<script>-SIN'],
    ['khoảng trắng', '8abc 123'],
    ['quá 64 ký tự', 'a'.repeat(65)],
  ])('`cf-ray` %s → thông điệp mặc định, không phản chiếu header', async (_ten, ray) => {
    const nghe = ngheLog();
    try {
      const res = await guiReview(
        { ...env, WORKSPACE_GATE: cuaGhiGia(() => Promise.reject(loiDoGiaLap())) },
        { 'cf-ray': ray },
      );
      expect(await kiemThanInternal(res)).toBe(THONG_DIEP_INTERNAL);
      expect(dongTheoSuKien(nghe, 'loi_internal')[0]?.['ray']).toBeNull();
    } finally {
      nghe.mockRestore();
    }
  });

  it('cửa ghi trả HTTP 500 → 500 INTERNAL, và nhánh này GIỜ có log (chi_tiet.trang_thai_cua_ghi)', async () => {
    const nghe = ngheLog();
    try {
      const res = await guiReview({
        ...env,
        WORKSPACE_GATE: cuaGhiGia(() => Promise.resolve(new Response('x', { status: 500 }))),
      });
      expect(await kiemThanInternal(res)).toBe(THONG_DIEP_INTERNAL);

      const dong = dongTheoSuKien(nghe, 'loi_internal');
      expect(dong).toHaveLength(1);
      expect(dong[0]!['chi_tiet']).toEqual({ trang_thai_cua_ghi: 500 });
      expect(dong[0]!['loi_ten']).toBe('BatonError');
      expect(dong[0]!['loai_bang_chung']).toBe('review');
      expect(toanBoLog(nghe)).not.toContain('Đạt yêu cầu');
    } finally {
      nghe.mockRestore();
    }
  });

  it('lỗi nghiệp vụ có tên (404 ticket bịa) → KHÔNG có dòng loi_internal, thân như cũ', async () => {
    const nghe = ngheLog();
    try {
      const res = await app.fetch(
        new Request('https://baton.test/v1/ticket/tk-khong-co-that', {
          headers: { authorization: `Bearer ${TOKEN_CHU}`, 'cf-ray': '8abc123-SIN' },
        }),
        env,
      );
      expect(res.status).toBe(404);
      const than = await res.json<{ error: string; message: string }>();
      expect(than.error).toBe('NOT_FOUND');
      expect(than.message).not.toContain('mã tra log');
      expect(dongTheoSuKien(nghe, 'loi_internal')).toHaveLength(0);
    } finally {
      nghe.mockRestore();
    }
  });

  it('loai_bang_chung lạ (không khớp /^[a-z_]{1,20}$/) → log ghi null, không chép giá trị client', async () => {
    const nghe = ngheLog();
    try {
      const res = await app.fetch(
        new Request(`https://baton.test${DUONG_BC}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${TOKEN_CHU}`, 'content-type': 'application/json' },
          body: JSON.stringify({ loai_bang_chung: 'Review (bí mật)', ket_luan: 'pass' }),
        }),
        { ...env, WORKSPACE_GATE: cuaGhiGia(() => Promise.reject(loiDoGiaLap())) },
      );
      await kiemThanInternal(res);
      const dong = dongTheoSuKien(nghe, 'loi_internal');
      expect(dong).toHaveLength(1);
      expect(dong[0]!['loai_bang_chung']).toBeNull();
      expect(toanBoLog(nghe)).not.toContain('bí mật');
    } finally {
      nghe.mockRestore();
    }
  });

  it('lỗi D1 tạm thời trong #chayMotLenh (batch ném) → dòng loi_cua_ghi, lỗi vẫn ném lên', async () => {
    /*
     * Dựng `WorkspaceGate` trực tiếp với một `env` có `DB.batch` ném — cửa ghi
     * thật của Miniflare dùng binding của chính nó, nên env của `app.fetch` không
     * tới được trong DO. Constructor không đọc `state`, và `chayLenh` là đúng
     * cổng mà `fetch('/lenh')` gọi.
     */
    const db = new Proxy(env.DB, {
      get(goc, ten) {
        if (ten === 'batch') {
          return () => Promise.reject(new Error('D1_ERROR: Network connection lost.'));
        }
        const o: unknown = Reflect.get(goc, ten);
        return typeof o === 'function' ? (o as (...a: never[]) => unknown).bind(goc) : o;
      },
    });
    const gate = new WorkspaceGate({} as DurableObjectState, { ...env, DB: db });
    const lenh = {
      loai: 'gui_bang_chung',
      workspace_id: WS,
      ai: { loai: 'chu' },
      ticket_id: TK,
      loai_bang_chung: 'review',
      ket_luan: 'pass',
      ghi_chu: GHI_CHU,
    } as unknown as Lenh;

    const nghe = ngheLog();
    try {
      await expect(gate.chayLenh(lenh)).rejects.toThrow('Network connection lost');

      const dong = dongTheoSuKien(nghe, 'loi_cua_ghi');
      expect(dong).toHaveLength(1);
      const d = dong[0]!;
      expect(d['loai_lenh']).toBe('gui_bang_chung');
      expect(d['ticket_id']).toBe(TK);
      expect(d['loai_bang_chung']).toBe('review');
      expect(d['loi_ten']).toBe('Error');
      expect(d['loi_thong_diep']).toBe('D1_ERROR: Network connection lost.');
      // Không `ai`, không nội dung lệnh.
      expect(Object.keys(d)).not.toContain('ai');
      const log = toanBoLog(nghe);
      expect(log).not.toContain('Đạt yêu cầu');
      expect(log).not.toContain('a+b=c');
    } finally {
      nghe.mockRestore();
    }
  });

  it('loi_thong_diep cắt ≤ 300 ký tự', async () => {
    const nghe = ngheLog();
    try {
      const dai = new Error('x'.repeat(5000));
      await guiReview({ ...env, WORKSPACE_GATE: cuaGhiGia(() => Promise.reject(dai)) });
      const d = dongTheoSuKien(nghe, 'loi_internal')[0]!;
      expect(String(d['loi_thong_diep']).length).toBe(300);
    } finally {
      nghe.mockRestore();
    }
  });
});
