/**
 * SPEC mục 13 (+ 19.10) — mã lỗi, mã HTTP, và thân lỗi
 * `{ "error": "<CODE>", "message": "<tiếng Việt>" }`.
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
// `app` là ứng dụng Hono trần (export **mặc định** giờ là đối tượng Worker, có cả
// `scheduled` — phần 3 lượt 3). Hai ca dưới gọi `app.fetch` với `env` dựng tay.
import { app } from '../src/index.js';
import { laDuongCongKhai } from '../src/xac-thuc.js';
import { TOKEN_CHU, dungWorkspace } from './giup.js';
import {
  BANG_LOI,
  BatonError,
  MA_THOAT,
  httpCuaLoi,
  laMaLoi,
  maThoatCuaLoi,
  thongDiepCuaLoi,
  type MaLoi,
} from '@baton/shared';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`): ca hết giờ
// không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it } = caQuaSo(bay);

/** Mã lỗi tối thiểu của SPEC mục 13, cộng hai mã của mục 19.10. */
const MA_TOI_THIEU: MaLoi[] = [
  'EVIDENCE_REQUIRED',
  'CHILDREN_OPEN',
  'REASON_REQUIRED',
  'INVALID_DUPLICATE_TARGET',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_INPUT',
  'PROJECT_NOT_ACCEPTING',
  'SESSION_CLOSED',
  'OPTIONS_REQUIRED',
  'COMMAND_REQUIRED',
  'INVALID_TOKEN',
  'RATE_LIMITED',
  'REVIEWER_IS_WORKER',
  'ALREADY_RESOLVED',
];

/**
 * Mã **không** nằm trong bảng của SPEC, Baton tự thêm. SPEC mục 13 gọi bảng của
 * nó là "mã lỗi **tối thiểu**", nên thêm là hợp lệ; mỗi mã thêm phải có một dòng
 * trong `quyet-dinh.md`.
 */
const MA_THEM: MaLoi[] = [
  'INTERNAL',
  'ASSIGNMENT_OPEN',
  'ASSIGNMENT_NOT_PENDING',
  'ASSIGNMENT_STATE_INVALID',
];

const MOI_MA: MaLoi[] = [...MA_TOI_THIEU, ...MA_THEM];

/** Ánh xạ mã → HTTP, theo phân lớp của SPEC mục 13. */
const HTTP_MONG_DOI: Record<MaLoi, number> = {
  INVALID_TOKEN: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CHILDREN_OPEN: 409,
  PROJECT_NOT_ACCEPTING: 409,
  SESSION_CLOSED: 409,
  ALREADY_RESOLVED: 409,
  // Hai mã của SPEC mục 5 (lượt giao), Baton tự thêm — xem ghi chú trong `loi.ts`.
  ASSIGNMENT_OPEN: 409,
  ASSIGNMENT_NOT_PENDING: 409,
  // Mã thứ ba của mục 5 (nộp / nghiệm thu / huỷ sai trạng thái) — lượt 2.
  ASSIGNMENT_STATE_INVALID: 409,
  INVALID_INPUT: 422,
  EVIDENCE_REQUIRED: 422,
  REASON_REQUIRED: 422,
  INVALID_DUPLICATE_TARGET: 422,
  OPTIONS_REQUIRED: 422,
  COMMAND_REQUIRED: 422,
  REVIEWER_IS_WORKER: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

describe('SPEC 13 — bảng mã lỗi', () => {
  it('có đủ mã tối thiểu của mục 13 và mục 19.10', () => {
    for (const ma of MA_TOI_THIEU) expect(laMaLoi(ma)).toBe(true);
  });

  it('không có mã nào ngoài danh sách đã khai', () => {
    expect(Object.keys(BANG_LOI).sort()).toEqual([...MOI_MA].sort());
  });

  it('mỗi mã có thông điệp tiếng Việt mặc định không rỗng', () => {
    for (const ma of MOI_MA) {
      const m = thongDiepCuaLoi(ma);
      expect(m.length).toBeGreaterThan(0);
      // Thông điệp hiển thị là tiếng Việt, không phải chính mã máy.
      expect(m).not.toBe(ma);
    }
  });

  it('mỗi mã ánh xạ đúng mã HTTP của SPEC mục 13', () => {
    for (const ma of MOI_MA) {
      expect(httpCuaLoi(ma), `HTTP của ${ma}`).toBe(HTTP_MONG_DOI[ma]);
    }
  });

  it('401 chỉ dành cho token sai; 403 cho không có quyền', () => {
    expect(httpCuaLoi('INVALID_TOKEN')).toBe(401);
    expect(httpCuaLoi('FORBIDDEN')).toBe(403);
    const ma401 = MA_TOI_THIEU.filter((m) => httpCuaLoi(m) === 401);
    expect(ma401).toEqual(['INVALID_TOKEN']);
  });

  it('mã thoát CLI: lỗi xác thực là 2, lỗi nghiệp vụ là 1 (SPEC mục 13)', () => {
    expect(maThoatCuaLoi('INVALID_TOKEN')).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(maThoatCuaLoi('EVIDENCE_REQUIRED')).toBe(MA_THOAT.loi_nghiep_vu);
    // Mục 19.9 bổ sung mã thoát 4 = hết thời gian chờ.
    expect(MA_THOAT.het_thoi_gian_cho).toBe(4);
  });

  /* --- Việc sửa A2 của reviewer lượt 1 ------------------------------ *
   * Lỗi không lường trước từng bị ánh xạ thành `INVALID_INPUT`/422, nên CLI
   * thoát mã 1 ("lỗi nghiệp vụ") thay vì mã 2 ("lỗi xác thực hoặc mạng").
   * Agent khi đó hiểu sai là dữ liệu mình gửi sai và sẽ sửa mãi. */

  it('A2: lỗi máy chủ có mã RIÊNG, không tái dùng mã nghiệp vụ nào', () => {
    expect(laMaLoi('INTERNAL')).toBe(true);
    expect(httpCuaLoi('INTERNAL')).toBe(500);
    // Không mã nghiệp vụ nào dùng 500: `INTERNAL` là mã 500 duy nhất.
    expect(MOI_MA.filter((m) => httpCuaLoi(m) === 500)).toEqual(['INTERNAL']);
  });

  it('A2: mã thoát CLI của INTERNAL là 2, không phải 1 (SPEC mục 13)', () => {
    expect(maThoatCuaLoi('INTERNAL')).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(maThoatCuaLoi('INTERNAL')).toBe(2);
    // Và `INVALID_INPUT` vẫn phải là mã 1 — nếu không thì "sửa" này chỉ là đổi
    // chỗ sai.
    expect(maThoatCuaLoi('INVALID_INPUT')).toBe(MA_THOAT.loi_nghiep_vu);
  });

  it('A2: quá giới hạn cũng thoát mã 2 (chờ, không phải sửa lệnh)', () => {
    expect(maThoatCuaLoi('RATE_LIMITED')).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
  });
});

describe('BatonError', () => {
  it('thân lỗi đúng dạng { error, message }', () => {
    const e = new BatonError('CHILDREN_OPEN');
    expect(e.than()).toEqual({
      error: 'CHILDREN_OPEN',
      message: BANG_LOI.CHILDREN_OPEN.message,
    });
    expect(Object.keys(e.than()).sort()).toEqual(['error', 'message']);
  });

  it('ghi đè được thông điệp, giữ nguyên mã và HTTP', () => {
    const e = new BatonError('INVALID_INPUT', { message: 'Mã chỉ gồm 2–6 chữ A–Z' });
    expect(e.than()).toEqual({ error: 'INVALID_INPUT', message: 'Mã chỉ gồm 2–6 chữ A–Z' });
    expect(e.http).toBe(422);
  });

  it('chi tiết nội bộ không nằm trong thân response (SPEC mục 15)', () => {
    const e = new BatonError('NOT_FOUND', { chiTiet: { token: 'bt_khong-duoc-lo' } });
    expect(JSON.stringify(e.than())).not.toContain('bt_khong-duoc-lo');
  });
});

describe('SPEC 13 — middleware biến BatonError thành response', () => {
  it.each(MOI_MA)('%s trả đúng HTTP và đúng thân lỗi', async (ma) => {
    const res = await SELF.fetch(`https://baton.test/v1/_loi/${ma}`);
    expect(res.status).toBe(HTTP_MONG_DOI[ma]);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: ma, message: BANG_LOI[ma].message });
  });

  it('429 kèm header Retry-After (SPEC mục 13)', async () => {
    const res = await SELF.fetch('https://baton.test/v1/_loi/RATE_LIMITED');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('các mã khác không có Retry-After', async () => {
    const res = await SELF.fetch('https://baton.test/v1/_loi/FORBIDDEN');
    expect(res.headers.get('retry-after')).toBeNull();
  });

  /**
   * Đường `/v1/...` không có, **đã có token**, trả 404 đúng dạng thân lỗi.
   *
   * Phải kèm token: cổng xác thực gắn cho **mọi** đường và chỉ bỏ qua danh sách
   * đóng `DUONG_CONG_KHAI`, nên một đường không tồn tại mà không có token sẽ ra
   * 401 **trước khi** tới được `notFound` (xem test dưới).
   *
   * **Đường phải có tiền tố `/v1/`, và từ P6 lượt 2 thì đó không còn là chuyện
   * tuỳ ý.** Trước lượt đó, hai ca này gõ `/khong-co-duong-nay` và đo đúng
   * `app.notFound` / cổng xác thực. Giờ Worker chia đường **trước** Hono: đường
   * ngoài `/v1/*` ra **SPA** (`phuc-vu-spa.ts`), nên một đường như vậy không còn
   * chạm tới `notFound` của Hono — nó sẽ xanh vì một lý do khác hẳn điều tên ca
   * nói. Ranh giới đó có bộ ca riêng: `test/ranh-gioi-spa.test.ts`.
   */
  it('đường /v1 không có trả 404 đúng dạng thân lỗi, không trả HTML', async () => {
    // Nhánh chủ cần một workspace để dựng `AiGoi` (v0.1 có đúng một — SPEC mục 1).
    await dungWorkspace();
    const res = await SELF.fetch('https://baton.test/v1/khong-co-duong-nay', {
      headers: { authorization: `Bearer ${TOKEN_CHU}` },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'NOT_FOUND', message: BANG_LOI.NOT_FOUND.message });
  });

  it('đường /v1 không có mà KHÔNG có token trả 401: xác thực là mặc định', async () => {
    // Hệ quả có chủ ý của "công khai là ngoại lệ tường minh": không ai dò được
    // bản đồ đường của Baton mà chưa có token.
    const res = await SELF.fetch('https://baton.test/v1/khong-co-duong-nay');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
  });
});

describe('đường test bị chặn bằng cờ môi trường (góp ý reviewer lượt 1)', () => {
  it('không có cờ CHO_DUONG_TEST thì /v1/_loi/:ma là 404, không sinh lỗi tuỳ ý', async () => {
    // Gọi app với env **không** có cờ — chính là hình dạng khi deploy thật.
    const moi_truong = { ...env, CHO_DUONG_TEST: undefined };
    const res = await app.fetch(
      new Request('https://baton.test/v1/_loi/RATE_LIMITED'),
      moi_truong,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'NOT_FOUND',
      message: BANG_LOI.NOT_FOUND.message,
    });
  });

  it('có cờ thì đường đó vẫn chạy (để các test trên đây có nghĩa)', async () => {
    const res = await app.fetch(new Request('https://baton.test/v1/_loi/FORBIDDEN'), env);
    expect(res.status).toBe(403);
  });
});

describe('đường công khai là danh sách ĐÓNG, không phải hệ quả thứ tự route', () => {
  it.each([['/v1/health'], ['/v1/meta'], ['/v1/_loi/FORBIDDEN']])(
    '%s đi qua được không cần token',
    async (duong) => {
      const res = await SELF.fetch(`https://baton.test${duong}`);
      expect(res.status).not.toBe(401);
    },
  );

  it.each([
    ['/v1/whoami'],
    ['/v1/du-an'],
    ['/v1/du-an/pj-bat-ky'],
    ['/v1/agent'],
    ['/v1/agent/ag-bat-ky'],
  ])('%s KHÔNG công khai: thiếu token là 401', async (duong) => {
    const res = await SELF.fetch(`https://baton.test${duong}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
  });

  it('`laDuongCongKhai` chỉ nhận đúng ba đường đã khai', () => {
    expect(laDuongCongKhai('/v1/health')).toBe(true);
    expect(laDuongCongKhai('/v1/meta')).toBe(true);
    expect(laDuongCongKhai('/v1/_loi/NOT_FOUND')).toBe(true);

    // Không khớp tiền tố lỏng: thêm gì vào sau là đường khác.
    expect(laDuongCongKhai('/v1/health/bi-mat')).toBe(false);
    expect(laDuongCongKhai('/v1/metadata')).toBe(false);
    expect(laDuongCongKhai('/v1/meta/du-an')).toBe(false);
    expect(laDuongCongKhai('/v1/_loi/a/b')).toBe(false);
    expect(laDuongCongKhai('/v1/du-an')).toBe(false);
    expect(laDuongCongKhai('/')).toBe(false);
  });
});

describe('/v1/meta — web và CLI lấy bảng mã ở một chỗ', () => {
  it('trả cả bảng mã mục 0.1 và bảng mã lỗi mục 13', async () => {
    const res = await SELF.fetch('https://baton.test/v1/meta');
    expect(res.status).toBe(200);
    const than = await res.json<{
      ma: Record<string, Record<string, string>>;
      loi: Record<string, { http: number; message: string }>;
    }>();
    expect(than.ma.trang_thai_ticket?.verifying).toBe('Chờ kiểm chứng');
    expect(than.loi.EVIDENCE_REQUIRED?.http).toBe(422);
  });
});
