/**
 * **Mã lỗi qua HTTP thật** — SPEC mục 13 (bảng mã lỗi + mã HTTP + mã thoát CLI),
 * mục 19.10 (hai mã thêm), mục 15 (không rò rỉ chi tiết lỗi gốc).
 *
 * `loi.test.ts` đã kiểm bảng `BANG_LOI` ở tầng dữ liệu. File này kiểm ba thứ mà
 * tầng đó không thấy:
 *
 *   1. **Tính đầy đủ của ánh xạ**: mọi mã trong `BANG_LOI` phải nằm trong đúng một
 *      nhóm HTTP và đúng một nhóm mã thoát của bảng đã chốt (`decisions.md`).
 *      Bảng ca thử **sinh từ `BANG_LOI`**, không viết tay 16 ca rời, nên thêm một
 *      mã mà quên ánh xạ là test đỏ ngay — đó là điểm chính của file này.
 *   2. **Thân response qua HTTP thật**: đúng `error`, đúng mã HTTP, `message` là
 *      **tiếng Việt** (không lọt mã tiếng Anh ra thông điệp), và **đúng 2 khoá**.
 *   3. **Đường nghiệp vụ thật**: mã nào phần 1 sinh được bằng một lệnh thật thì
 *      phải có một ca đi qua lệnh đó, không chỉ qua đường test `/v1/_loi/:ma`.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { Hono } from 'hono';
import { afterEach, describe, expect } from 'vitest';
import {
  BANG_LOI,
  MA_THOAT,
  bamToken,
  httpCuaLoi,
  maThoatCuaLoi,
  type MaLoi,
  type MaThoat,
} from '@baton/shared';
import { batLoi, xuLyLoi } from '../src/middleware-loi.js';
import { GIOI_HAN_MOI_PHUT, type GioiHanToken } from '../src/gioi-han-token.js';
import {
  TOKEN_CHU,
  dungAgentCoToken,
  dungDuAn,
  dungLienKet,
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

/** Mọi mã trong bảng, lấy **từ bảng** chứ không chép tay. */
const MOI_MA = Object.keys(BANG_LOI) as MaLoi[];

/* ------------------------------------------------------------------ *
 * Bảng ánh xạ đã chốt — `decisions.md` 01/10, SPEC mục 13
 * ------------------------------------------------------------------ *
 * Viết theo **nhóm HTTP** (đúng hình dạng của bảng trong `decisions.md`), rồi
 * kiểm hợp của các nhóm phủ đúng `BANG_LOI`: không thiếu mã nào, không mã nào ở
 * hai nhóm.
 */
const NHOM_HTTP: Record<number, readonly MaLoi[]> = {
  401: ['INVALID_TOKEN'],
  403: ['FORBIDDEN'],
  404: ['NOT_FOUND'],
  409: [
    'CHILDREN_OPEN',
    'PROJECT_NOT_ACCEPTING',
    'SESSION_CLOSED',
    'ALREADY_RESOLVED',
    // SPEC mục 5 (lượt giao) — hai xung đột trạng thái không có mã sẵn trong
    // bảng "tối thiểu" của mục 13. Xem ghi chú trong `shared/src/loi.ts`.
    'ASSIGNMENT_OPEN',
    'ASSIGNMENT_NOT_PENDING',
    'ASSIGNMENT_STATE_INVALID',
  ],
  422: [
    'INVALID_INPUT',
    'EVIDENCE_REQUIRED',
    'REASON_REQUIRED',
    'INVALID_DUPLICATE_TARGET',
    'OPTIONS_REQUIRED',
    'COMMAND_REQUIRED',
    'REVIEWER_IS_WORKER',
  ],
  429: ['RATE_LIMITED'],
  500: ['INTERNAL'],
};

/**
 * Mã thoát CLI — SPEC mục 13 + 19.9.
 * 0 xong · 1 lỗi nghiệp vụ · 2 lỗi xác thực hoặc mạng · 3 `STOP` · 4 hết thời
 * gian chờ. Mã 0, 3, 4 **không** gắn với mã lỗi API nào: `STOP` và hết thời gian
 * chờ không phải lỗi của response.
 */
const NHOM_MA_THOAT: Record<MaThoat, readonly MaLoi[]> = {
  0: [],
  1: [
    'FORBIDDEN',
    'NOT_FOUND',
    'CHILDREN_OPEN',
    'PROJECT_NOT_ACCEPTING',
    'SESSION_CLOSED',
    'ALREADY_RESOLVED',
    'ASSIGNMENT_OPEN',
    'ASSIGNMENT_NOT_PENDING',
    'ASSIGNMENT_STATE_INVALID',
    'INVALID_INPUT',
    'EVIDENCE_REQUIRED',
    'REASON_REQUIRED',
    'INVALID_DUPLICATE_TARGET',
    'OPTIONS_REQUIRED',
    'COMMAND_REQUIRED',
    'REVIEWER_IS_WORKER',
  ],
  2: ['INVALID_TOKEN', 'RATE_LIMITED', 'INTERNAL'],
  3: [],
  4: [],
};

/** Phẳng hoá một bảng nhóm thành danh sách mã. */
function moiMaTrongNhom(bang: Record<number, readonly MaLoi[]>): MaLoi[] {
  return Object.values(bang).flat();
}

/* ------------------------------------------------------------------ *
 * Thông điệp phải là tiếng Việt
 * ------------------------------------------------------------------ */

/**
 * Dấu tiếng Việt. Dùng để chặn đúng một lỗi dễ xảy ra: thông điệp bị để nguyên
 * tiếng Anh, hoặc chính mã máy bị đem ra làm thông điệp cho người đọc (SPEC mục
 * 13 đòi "thông điệp tiếng Việt").
 */
const DAU_TIENG_VIET =
  /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;

/** Kiểm một response lỗi: mã HTTP, thân đúng 2 khoá, thông điệp tiếng Việt. */
async function kiemThanLoi(res: Response, ma: MaLoi, ghi_chu = ''): Promise<void> {
  const nhan = `${ma} ${ghi_chu}`;
  expect(res.status, nhan).toBe(httpCuaLoi(ma));
  expect(res.headers.get('content-type'), nhan).toContain('application/json');

  const than = await res.json<Record<string, unknown>>();
  // Đúng 2 khoá: không rò rỉ stack, SQL hay chi tiết nội bộ (SPEC mục 15).
  expect(Object.keys(than).sort(), nhan).toEqual(['error', 'message']);
  expect(than['error'], nhan).toBe(ma);

  const message = than['message'];
  expect(typeof message, nhan).toBe('string');
  const m = message as string;
  expect(m.length, nhan).toBeGreaterThan(0);
  // Thông điệp không được **là** mã, và không được mang mã tiếng Anh ra cho người đọc.
  expect(m, nhan).not.toBe(ma);
  expect(m, nhan).not.toContain(ma);
  expect(DAU_TIENG_VIET.test(m), `${nhan}: thông điệp không có dấu tiếng Việt → "${m}"`).toBe(true);
}

/* ================================================================== *
 * 1. Tính ĐẦY ĐỦ của ánh xạ — sinh từ BANG_LOI
 * ================================================================== */
describe('SPEC mục 13 — ánh xạ mã lỗi phủ ĐỦ bảng, không thiếu không trùng', () => {
  it('mọi mã trong BANG_LOI có đúng một nhóm HTTP', () => {
    const trong_nhom = moiMaTrongNhom(NHOM_HTTP);
    // Không trùng.
    expect(new Set(trong_nhom).size, 'một mã nằm ở hai nhóm HTTP').toBe(trong_nhom.length);
    // Phủ đúng bảng: thêm mã mới mà quên ánh xạ → đỏ ở đây.
    expect([...trong_nhom].sort()).toEqual([...MOI_MA].sort());
  });

  it('`httpCuaLoi` của từng mã khớp nhóm đã chốt', () => {
    for (const [http, ds] of Object.entries(NHOM_HTTP)) {
      for (const ma of ds) expect(httpCuaLoi(ma), `HTTP của ${ma}`).toBe(Number(http));
    }
  });

  it('mọi mã trong BANG_LOI có đúng một mã thoát CLI', () => {
    const trong_nhom = moiMaTrongNhom(NHOM_MA_THOAT);
    expect(new Set(trong_nhom).size, 'một mã nằm ở hai nhóm mã thoát').toBe(trong_nhom.length);
    expect([...trong_nhom].sort()).toEqual([...MOI_MA].sort());
  });

  it('`maThoatCuaLoi` của MỌI mã khớp nhóm đã chốt (SPEC mục 13 + 19.9)', () => {
    for (const [ma_thoat, ds] of Object.entries(NHOM_MA_THOAT)) {
      for (const ma of ds) expect(maThoatCuaLoi(ma), `mã thoát của ${ma}`).toBe(Number(ma_thoat));
    }
  });

  it('bảng mã thoát đủ 5 giá trị 0–4 của SPEC mục 13 + 19.9', () => {
    expect(MA_THOAT).toEqual({
      xong: 0,
      loi_nghiep_vu: 1,
      loi_xac_thuc_hoac_mang: 2,
      nhan_stop: 3,
      het_thoi_gian_cho: 4,
    });
    // Mã 0, 3, 4 không gắn mã lỗi API nào: `STOP` và hết thời gian chờ là trạng
    // thái của CLI, không phải thân lỗi của một response.
    expect(NHOM_MA_THOAT[0]).toEqual([]);
    expect(NHOM_MA_THOAT[3]).toEqual([]);
    expect(NHOM_MA_THOAT[4]).toEqual([]);
  });

  it('mỗi mã HTTP ≥ 500 chỉ có đúng mã INTERNAL', () => {
    expect(MOI_MA.filter((m) => httpCuaLoi(m) >= 500)).toEqual(['INTERNAL']);
  });
});

/* ================================================================== *
 * 2. Mỗi mã qua HTTP thật: error + HTTP + thông điệp tiếng Việt
 * ================================================================== */
describe('SPEC mục 13 — mỗi mã của BANG_LOI qua HTTP (đường test /v1/_loi/:ma)', () => {
  it.each(MOI_MA)('%s: đúng error, đúng mã HTTP, thông điệp tiếng Việt, đúng 2 khoá', async (ma) => {
    const res = await SELF.fetch(`https://baton.test/v1/_loi/${ma}`);
    await kiemThanLoi(res, ma, 'qua /v1/_loi');
  });

  it('RATE_LIMITED kèm Retry-After, giá trị hợp lý (≤ cửa sổ 60 giây)', async () => {
    const res = await SELF.fetch('https://baton.test/v1/_loi/RATE_LIMITED');
    expect(res.status).toBe(429);
    const ra = Number(res.headers.get('retry-after'));
    expect(Number.isInteger(ra)).toBe(true);
    expect(ra).toBeGreaterThanOrEqual(1);
    expect(ra).toBeLessThanOrEqual(60);
  });

  it('mọi mã KHÁC 429 đều không có Retry-After', async () => {
    for (const ma of MOI_MA.filter((m) => httpCuaLoi(m) !== 429)) {
      const res = await SELF.fetch(`https://baton.test/v1/_loi/${ma}`);
      expect(res.headers.get('retry-after'), ma).toBeNull();
    }
  });
});

/* ================================================================== *
 * 3. Đường nghiệp vụ THẬT của phần 1
 * ================================================================== *
 * Khai tường minh mã nào phần 1 sinh được bằng một lệnh thật, và mã nào chưa.
 * Hai danh sách phải phủ đúng `BANG_LOI`, nên một mã mới không lặng lẽ rơi ra
 * ngoài cả hai.
 */

/** Mã có lệnh thật ở phần 1 — mỗi mã có một ca `it` bên dưới. */
const CO_DUONG_THAT: readonly MaLoi[] = [
  'INVALID_TOKEN',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_INPUT',
  'PROJECT_NOT_ACCEPTING',
  'EVIDENCE_REQUIRED',
  'CHILDREN_OPEN',
  'REASON_REQUIRED',
  'INVALID_DUPLICATE_TARGET',
  'RATE_LIMITED',
  'INTERNAL',
  // Lượt giao — SPEC mục 5 (phần 2 lượt 1).
  'ASSIGNMENT_OPEN',
  'ASSIGNMENT_NOT_PENDING',
  // Nộp / nghiệm thu / huỷ sai trạng thái — SPEC mục 5 (phần 2 lượt 2).
  'ASSIGNMENT_STATE_INVALID',
];

/**
 * Mã **chưa** có đường nghiệp vụ ở phần 1 — nghiệp vụ của chúng thuộc phần sau.
 * Chúng vẫn được phủ ở tầng bảng (mục 1 trên) và qua `/v1/_loi/:ma` (mục 2).
 */
const CHUA_CO_DUONG_THAT: Readonly<Partial<Record<MaLoi, string>>> = {
  SESSION_CLOSED: 'Phiên làm việc là phần 2 (SPEC mục 6).',
  OPTIONS_REQUIRED: 'Mục Cần Chủ loại Quyết định là phần 4 (SPEC mục 8).',
  COMMAND_REQUIRED: 'Mục Cần Chủ loại "Chủ chạy lệnh" là phần 4 (SPEC mục 8).',
  REVIEWER_IS_WORKER: 'Gửi review là phần 2 (SPEC mục 19.10).',
  ALREADY_RESOLVED: 'Quyết mục Cần Chủ là phần 4 (SPEC mục 8, 19.10).',
};

describe('đường nghiệp vụ thật: mã nào đã có, mã nào hoãn sang phần sau', () => {
  it('hai danh sách phủ đúng BANG_LOI, không thiếu không trùng', () => {
    const hoan = Object.keys(CHUA_CO_DUONG_THAT) as MaLoi[];
    expect([...CO_DUONG_THAT, ...hoan].sort()).toEqual([...MOI_MA].sort());
  });

  it('mỗi mã hoãn đều ghi rõ LÝ DO hoãn (không hoãn im lặng)', () => {
    for (const [ma, ly_do] of Object.entries(CHUA_CO_DUONG_THAT)) {
      expect(ly_do, ma).toBeTruthy();
      expect(ly_do.length, ma).toBeGreaterThan(10);
    }
  });
});

const TOKEN_WORKER = 'bt_token_worker_loi_http';

describe('mỗi mã CÓ đường thật: sinh bằng một lệnh thật của phần 1', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungDuAn('LUU', 'Dự án đã lưu trữ', 'archived');
    await dungTicket('pj-SAI', 1, 'Đang làm', { trang_thai: 'in_progress' });
    await dungTicket('pj-SAI', 2, 'Việc để huỷ', { trang_thai: 'todo' });
    await dungAgentCoToken({
      id: 'ag-worker',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: TOKEN_WORKER,
      du_an: ['pj-SAI'],
    });
  });

  it('INVALID_TOKEN / 401: token không có trong DB', async () => {
    await kiemThanLoi(
      await goiApi('/v1/whoami', 'bt_token_khong_ton_tai'),
      'INVALID_TOKEN',
      'GET /v1/whoami',
    );
  });

  it('FORBIDDEN / 403: worker tạo ticket (bảng quyền SPEC mục 3)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_WORKER, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: 'Worker tạo ticket' },
    });
    await kiemThanLoi(res, 'FORBIDDEN', 'POST /v1/ticket');
  });

  it('NOT_FOUND / 404: ticket không tồn tại', async () => {
    await kiemThanLoi(
      await goiApi('/v1/ticket/tk-khong-co-that', TOKEN_CHU),
      'NOT_FOUND',
      'GET /v1/ticket/:id',
    );
  });

  it('INVALID_INPUT / 422: tiêu đề chỉ có khoảng trắng (SPEC mục 4)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-SAI', tieu_de: '   ' },
    });
    await kiemThanLoi(res, 'INVALID_INPUT', 'POST /v1/ticket');
  });

  it('PROJECT_NOT_ACCEPTING / 409: tạo ticket trong dự án đã lưu trữ (SPEC mục 2)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-LUU', tieu_de: 'Việc trong dự án lưu trữ' },
    });
    await kiemThanLoi(res, 'PROJECT_NOT_ACCEPTING', 'POST /v1/ticket');
  });

  it('EVIDENCE_REQUIRED / 422: vào Xong khi cổng bằng chứng chưa đủ (SPEC mục 7)', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    await kiemThanLoi(res, 'EVIDENCE_REQUIRED', 'POST /v1/ticket/:id/trang-thai');
  });

  it('CHILDREN_OPEN / 409: ticket cha còn con chưa kết (SPEC mục 4, 19.11)', async () => {
    await dungTicket('pj-SAI', 3, 'Ticket con', { trang_thai: 'todo' });
    await dungLienKet('tk-pj-SAI-1', 'tk-pj-SAI-3', 'parent');
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Ép dù còn con' },
    });
    await kiemThanLoi(res, 'CHILDREN_OPEN', 'POST /v1/ticket/:id/trang-thai');
  });

  it('REASON_REQUIRED / 422: vào Huỷ mà thiếu lý do (SPEC mục 4)', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-2/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'canceled' },
    });
    await kiemThanLoi(res, 'REASON_REQUIRED', 'POST /v1/ticket/:id/trang-thai');
  });

  it('INVALID_DUPLICATE_TARGET / 422: đánh Trùng mà không có gốc hợp lệ (SPEC mục 4)', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-2/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'duplicate', ticket_goc_id: 'tk-khong-co' },
    });
    await kiemThanLoi(res, 'INVALID_DUPLICATE_TARGET', 'POST /v1/ticket/:id/trang-thai');
  });

  it('ASSIGNMENT_OPEN / 409: ticket đã có một lượt `work` đang mở (SPEC mục 5, 19.1)', async () => {
    const than = { nguoi_nhan_agent_id: 'ag-worker' };
    const dau = await goiApi('/v1/ticket/tk-pj-SAI-1/luot-giao', TOKEN_CHU, {
      method: 'POST',
      than,
    });
    expect(dau.status).toBe(201);

    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/luot-giao', TOKEN_CHU, {
      method: 'POST',
      than,
    });
    await kiemThanLoi(res, 'ASSIGNMENT_OPEN', 'POST /v1/ticket/:id/luot-giao');
  });

  it('ASSIGNMENT_NOT_PENDING / 409: nhận một lượt đã `in_progress` (SPEC mục 5)', async () => {
    const tao = await goiApi('/v1/ticket/tk-pj-SAI-1/luot-giao', TOKEN_CHU, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: 'ag-worker' },
    });
    const { id } = await tao.json<{ id: string }>();

    const nhan_lan_dau = await goiApi(`/v1/luot-giao/${id}/nhan`, TOKEN_WORKER, { method: 'POST' });
    expect(nhan_lan_dau.status).toBe(200);

    const res = await goiApi(`/v1/luot-giao/${id}/nhan`, TOKEN_WORKER, { method: 'POST' });
    await kiemThanLoi(res, 'ASSIGNMENT_NOT_PENDING', 'POST /v1/luot-giao/:id/nhan');
  });

  it('ASSIGNMENT_STATE_INVALID / 409: nộp báo cáo khi lượt còn `pending` (SPEC mục 5)', async () => {
    const tao = await goiApi('/v1/ticket/tk-pj-SAI-1/luot-giao', TOKEN_CHU, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: 'ag-worker' },
    });
    const { id } = await tao.json<{ id: string }>();

    // Chưa `nhan`, nên lượt còn `pending`: "người nhận đã nộp báo cáo" chưa xảy
    // ra được.
    const res = await goiApi(`/v1/luot-giao/${id}/nop`, TOKEN_WORKER, {
      method: 'POST',
      than: { ket_qua: 'done' },
    });
    await kiemThanLoi(res, 'ASSIGNMENT_STATE_INVALID', 'POST /v1/luot-giao/:id/nop');
  });

  it('RATE_LIMITED / 429 + Retry-After: quá 600 req/phút mỗi token (SPEC mục 13)', async () => {
    // Đẩy bộ đếm của chính token này tới giới hạn, rồi gọi một request thật.
    const ns = env.GIOI_HAN_TOKEN;
    const bam = await bamToken(TOKEN_WORKER);
    const stub = ns.get(ns.idFromName(`token:${bam}`));
    await runInDurableObject(stub, (dem: GioiHanToken) => {
      for (let i = 0; i < GIOI_HAN_MOI_PHUT; i += 1) dem.dem();
    });

    const res = await goiApi('/v1/whoami', TOKEN_WORKER);
    await kiemThanLoi(res, 'RATE_LIMITED', 'GET /v1/whoami');
    const ra = Number(res.headers.get('retry-after'));
    expect(ra).toBeGreaterThanOrEqual(1);
    // Cửa sổ là 60 giây (xem `gioi-han-token.ts`), nên không bao giờ dài hơn thế.
    expect(ra).toBeLessThanOrEqual(60);
  });

  /**
   * `INTERNAL` / 500: lỗi **không lường trước**.
   *
   * Không có lệnh nghiệp vụ nào của phần 1 cố tình ném lỗi lạ, nên ca này dựng một
   * app Hono dùng **đúng** `batLoi` + `xuLyLoi` của sản phẩm và ném một `Error`
   * thường. Đây vẫn là HTTP thật qua đúng chặng xử lý lỗi, và nó kiểm thêm luật
   * SPEC mục 15: chi tiết lỗi gốc **không** ra thân response.
   */
  it('INTERNAL / 500: lỗi lạ không rò rỉ chi tiết gốc (SPEC mục 15)', async () => {
    const CHI_TIET_BI_MAT = 'bt_secret_va_stack_khong_duoc_lo_9f1c';
    const phu = new Hono();
    phu.use('*', batLoi);
    phu.onError(xuLyLoi);
    phu.get('/no', () => {
      throw new Error(CHI_TIET_BI_MAT);
    });

    const res = await phu.fetch(new Request('https://baton.test/no'));
    const ban_sao = res.clone();
    await kiemThanLoi(res, 'INTERNAL', 'lỗi lạ qua middleware thật');
    expect(await ban_sao.text()).not.toContain(CHI_TIET_BI_MAT);
  });
});
