/**
 * **Màn hình Đội agent, trang agent, chi tiết phiên** — tầng API của SPEC mục 3
 * (d.80–105), mục 6, mục 14 d.392 + d.402.
 *
 * Bốn thứ ở đây **không được** sống trong component, nên chúng có ca ở root này:
 *
 *   1. **Token không ra API** (mục 15 d.417): thân của cả ba màn hình không được
 *      có `token_bam`, và không được có chuỗi token nào. Ca dựng một agent có
 *      token **thật** (băm trong DB) rồi tìm chuỗi đó trong JSON — một ca chỉ
 *      kiểm `token_bam === undefined` sẽ xanh kể cả khi một cột khác lọt token ra.
 *   2. **Bảng quyền hiện hành** (d.80, d.84–96): đủ 9 hàng, và nó phản ánh **ô
 *      chủ đã chỉnh riêng**, không chỉ mặc định theo vai.
 *   3. **Lịch sử lượt giao dạng bảng** (d.104): thứ tự mới nhất trước, gồm cả
 *      lượt `review`, và mang mã ticket đọc được.
 *   4. **`bay_gio` là MỘT mốc cho cả thân** (d.412) và mọi dẫn xuất phụ thuộc
 *      thời gian (phiên `stalled` của d.184) được tính tại mốc đó.
 *
 * Cộng cổng "chỉ chủ" của mục 14: agent gọi ba đường này nhận `FORBIDDEN`.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { VIEC_QUYEN } from '@baton/shared';
import {
  manHinhAgent,
  manHinhDoiAgent,
  manHinhPhien,
} from '../src/doc-man-hinh-agent.js';
import { luotGiaoCuaAgent } from '../src/doc-luot-giao.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  aiAgent,
  choVaoDuAn,
  datMocPhien,
  dungAgent,
  dungAgentCoToken,
  dungDuAn,
  dungHoatDong,
  dungLuotGiao,
  dungPhien,
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

const P = 'pj-SAI';

/** Mốc "bây giờ" cố định — một con số, không `Date.now()`. */
const GIO = 1_760_000_000_000;
const PHUT = 60_000;

/** Token giả của agent — chỉ bản băm vào DB, như đường thật (mục 3, 15). */
const TOKEN_AGENT = 'bt_token_agent_cua_phien';

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn();
});

/* ================================================================== *
 * 1. Đội agent — d.392, d.80
 * ================================================================== */

describe('Đội agent (d.392)', () => {
  it('trả mọi agent kèm trạng thái đã tính và một mốc bay_gio', async () => {
    await dungAgent('ag-1', 'W-builder', 'worker');
    await dungAgent('ag-2', 'M-Baton', 'manager');

    const ra = await manHinhDoiAgent(env.DB, CHU, WS, GIO);

    expect(ra.bay_gio).toBe(GIO);
    expect(ra.agent.map((a) => a.ten)).toEqual(['M-Baton', 'W-builder']);
    // Không phiên nào ⇒ `idle` (mục 3 d.102), nhãn tiếng Việt của bảng 0.1.
    expect(ra.agent.map((a) => a.trang_thai)).toEqual(['idle', 'idle']);
    expect(ra.agent.map((a) => a.nhan_trang_thai)).toEqual(['Rảnh', 'Rảnh']);
  });

  it('agent gọi màn hình này thì FORBIDDEN (mục 14: giao diện của chủ)', async () => {
    await dungAgent('ag-1');
    await expect(
      manHinhDoiAgent(env.DB, aiAgent('coordinator', { agent_id: 'ag-1' }), WS, GIO),
    ).rejects.toMatchObject({ ma: 'FORBIDDEN' });
  });

  it('phiên đang chạy làm agent busy; im quá ngưỡng thì stalled (d.98–103, d.184)', async () => {
    await dungAgent('ag-1');
    const t = await dungTicket(P, 1, 'Việc đang làm', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-1', t, 'ag-1', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'running', tin_hieu_cuoi_luc: GIO - PHUT });

    const dang_chay = await manHinhDoiAgent(env.DB, CHU, WS, GIO);
    expect(dang_chay.agent[0]?.trang_thai).toBe('busy');

    // Cùng dữ liệu, chỉ đồng hồ đi tới: 31 phút > ngưỡng mặc định 30 phút.
    const da_dung = await manHinhDoiAgent(env.DB, CHU, WS, GIO + 31 * PHUT);
    expect(da_dung.agent[0]?.trang_thai).toBe('stalled');
  });
});

/* ================================================================== *
 * 2. Trang agent — d.104
 * ================================================================== */

describe('Trang agent (d.104)', () => {
  it('có đủ bốn khối của d.104 cộng bảng quyền của d.80', async () => {
    await dungAgent('ag-1', 'W-builder', 'worker');
    await choVaoDuAn('ag-1', P);
    const t = await dungTicket(P, 1, 'Việc một', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-1', t, 'ag-1', { trang_thai: 'in_progress', tao_luc: GIO - 10 * PHUT });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'running', tin_hieu_cuoi_luc: GIO - PHUT });

    const ra = await manHinhAgent(env.DB, CHU, WS, 'ag-1', GIO);

    expect(ra.bay_gio).toBe(GIO);
    expect(ra.agent.ten).toBe('W-builder');
    expect(ra.phien_dang_mo.map((p) => p.id)).toEqual(['ph-1']);
    expect(ra.luot_giao.map((l) => l.id)).toEqual(['lg-1']);
    expect(ra.luot_giao[0]?.ticket_ma).toBe('SAI-1');
    expect(ra.luot_giao[0]?.ticket_tieu_de).toBe('Việc một');
    // 19.5: chưa nộp lần nào ⇒ mẫu số 0 ⇒ tỉ lệ là `null`, **không** phải 0.
    expect(ra.ti_le_dat_lan_dau).toEqual({ dat: 0, da_nop: 0, ti_le: null });
    expect(ra.du_an).toEqual([{ id: P, ma: 'SAI', ten: 'Sample', quan_ly: false }]);
  });

  it('bảng quyền đủ 9 hàng của mục 3, nhãn tiếng Việt, đúng mặc định theo vai', async () => {
    await dungAgent('ag-1', 'W-builder', 'worker');
    const ra = await manHinhAgent(env.DB, CHU, WS, 'ag-1', GIO);

    expect(ra.bang_quyen.map((h) => h.viec)).toEqual(Object.keys(VIEC_QUYEN));
    const o = (viec: string): string =>
      ra.bang_quyen.find((h) => h.viec === viec)?.nhan_pham_vi ?? '(thiếu hàng)';

    // Bốn ô của hàng `worker` trong bảng mục 3 — chữ của SPEC, không mã.
    expect(o('create_ticket')).toBe('ticket con của lượt mình đang làm');
    expect(o('assign')).toBe('—');
    expect(o('change_status')).toBe('ticket của lượt mình');
    expect(o('submit_evidence')).toBe('có');
    // Hai hàng "không bao giờ" (d.95–96) không có đường nào nới ra.
    expect(o('delete_anything')).toBe('không bao giờ');
    expect(o('resolve_ask')).toBe('không bao giờ');
  });

  it('bảng quyền phản ánh ô chủ đã chỉnh riêng, không chỉ mặc định của vai', async () => {
    await dungAgent('ag-1', 'W-builder', 'worker');
    // Chủ bật hàng "Giao việc" cho một worker (mục 3: chủ chỉnh được từng agent).
    const r = await goiApi('/v1/agent/ag-1/quyen/assign', TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'trong_du_an' },
    });
    expect(r.status).toBe(200);

    const ra = await manHinhAgent(env.DB, CHU, WS, 'ag-1', GIO);
    const assign = ra.bang_quyen.find((h) => h.viec === 'assign');
    expect(assign?.pham_vi).toBe('trong_du_an');
    expect(assign?.nhan_pham_vi).toBe('trong dự án');
  });

  it('cờ quản lý dự án hiện đúng (mục 2: agent quản lý)', async () => {
    await dungAgent('ag-2', 'M-Baton', 'manager');
    await dungDuAn('COS', 'Chief of Staff', 'active', 'ag-2');
    await choVaoDuAn('ag-2', P);
    await choVaoDuAn('ag-2', 'pj-COS');

    const ra = await manHinhAgent(env.DB, CHU, WS, 'ag-2', GIO);
    expect(ra.du_an.map((d) => [d.ma, d.quan_ly])).toEqual([
      ['COS', true],
      ['SAI', false],
    ]);
  });

  it('agent không có thì NOT_FOUND, không lộ sự tồn tại (mục 13)', async () => {
    await expect(manHinhAgent(env.DB, CHU, WS, 'ag-khong-co', GIO)).rejects.toMatchObject({
      ma: 'NOT_FOUND',
    });
  });

  it('agent gọi trang agent thì FORBIDDEN', async () => {
    await dungAgent('ag-1');
    await expect(
      manHinhAgent(env.DB, aiAgent('manager', { agent_id: 'ag-1' }), WS, 'ag-1', GIO),
    ).rejects.toMatchObject({ ma: 'FORBIDDEN' });
  });
});

/* ================================================================== *
 * 3. Lịch sử lượt giao dạng bảng — d.104
 * ================================================================== */

describe('Lịch sử lượt giao của agent (d.104)', () => {
  it('mới nhất trước, gồm cả lượt review', async () => {
    await dungAgent('ag-1');
    const t1 = await dungTicket(P, 1, 'Việc cũ');
    const t2 = await dungTicket(P, 2, 'Việc mới');
    await dungLuotGiao('lg-cu', t1, 'ag-1', { tao_luc: GIO - 3 * PHUT, trang_thai: 'accepted' });
    await dungLuotGiao('lg-review', t1, 'ag-1', {
      loai: 'review',
      tao_luc: GIO - 2 * PHUT,
      trang_thai: 'accepted',
    });
    await dungLuotGiao('lg-moi', t2, 'ag-1', { tao_luc: GIO - PHUT });

    const ds = await luotGiaoCuaAgent(env.DB, WS, 'ag-1', GIO);

    expect(ds.map((l) => l.id)).toEqual(['lg-moi', 'lg-review', 'lg-cu']);
    expect(ds.map((l) => l.loai)).toEqual(['work', 'review', 'work']);
    expect(ds.map((l) => l.ticket_ma)).toEqual(['SAI-2', 'SAI-1', 'SAI-1']);
  });

  it('chỉ lượt của chính agent đó', async () => {
    await dungAgent('ag-1');
    await dungAgent('ag-2', 'W-khac');
    // Hai ticket, vì một ticket chỉ có **một** lượt `work` mở (19.1, `ux` của 0004).
    const t1 = await dungTicket(P, 1);
    const t2 = await dungTicket(P, 2);
    await dungLuotGiao('lg-cua-1', t1, 'ag-1');
    await dungLuotGiao('lg-cua-2', t2, 'ag-2');

    const ds = await luotGiaoCuaAgent(env.DB, WS, 'ag-1', GIO);
    expect(ds.map((l) => l.id)).toEqual(['lg-cua-1']);
  });

  it('"Không phản hồi" của mục 5 tính tại bay_gio truyền vào, không Date.now()', async () => {
    await dungAgent('ag-1');
    const t = await dungTicket(P, 1);
    await dungLuotGiao('lg-1', t, 'ag-1', {
      trang_thai: 'pending',
      han_phan_hoi_luc: GIO,
      tao_luc: GIO - 15 * PHUT,
    });

    const chua = await luotGiaoCuaAgent(env.DB, WS, 'ag-1', GIO - PHUT);
    expect(chua[0]?.khong_phan_hoi).toBe(false);
    const roi = await luotGiaoCuaAgent(env.DB, WS, 'ag-1', GIO + PHUT);
    expect(roi[0]?.khong_phan_hoi).toBe(true);
  });
});

/* ================================================================== *
 * 4. Chi tiết phiên — d.402
 * ================================================================== */

describe('Chi tiết phiên (d.402)', () => {
  beforeEach(async () => {
    await dungAgentCoToken({
      id: 'ag-1',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: TOKEN_AGENT,
      du_an: [P],
    });
    const t = await dungTicket(P, 1, 'Việc có phiên', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-1', t, 'ag-1', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'running', tin_hieu_cuoi_luc: GIO - PHUT });
  });

  it('có dòng hoạt động, kế hoạch, và bối cảnh ticket/agent', async () => {
    await dungHoatDong('hd-1', 'ph-1', { loai: 'thought', noi_dung: 'Đang đọc SPEC', gui_luc: GIO - 3 * PHUT });
    await dungHoatDong('hd-2', 'ph-1', { loai: 'action', noi_dung: 'Chạy test', gui_luc: GIO - 2 * PHUT });

    const ra = await manHinhPhien(env.DB, CHU, WS, 'ph-1', GIO);

    expect(ra.bay_gio).toBe(GIO);
    expect(ra.phien.id).toBe('ph-1');
    expect(ra.phien.trang_thai).toBe('running');
    // Cũ → mới, đúng thứ tự dòng hoạt động hiện trên màn hình (d.190).
    expect(ra.hoat_dong.map((h) => h.noi_dung)).toEqual(['Đang đọc SPEC', 'Chạy test']);
    expect(ra.hoat_dong.map((h) => h.nhan_loai)).toEqual(['Suy nghĩ', 'Thao tác']);
    // Chưa gửi kế hoạch ⇒ phiên bản 0, danh sách bước rỗng (d.191).
    expect(ra.ke_hoach).toMatchObject({ phien_id: 'ph-1', phien_ban: 0, buoc: [] });
    expect(ra.ticket).toMatchObject({ ma: 'SAI-1', tieu_de: 'Việc có phiên', nhan_trang_thai: 'Đang làm' });
    expect(ra.agent).toMatchObject({ id: 'ag-1', ten: 'W-builder', nhan_vai_tro: 'Người làm' });
  });

  it('kế hoạch hiện hành là bản agent gửi sau cùng (d.191)', async () => {
    // Kế hoạch là lời khai **của agent** (19.12 câu 44 cùng tinh thần), nên nó đi
    // bằng token agent; chủ chỉ **đọc** nó trên màn hình.
    const r = await goiApi('/v1/phien/ph-1/ke-hoach', TOKEN_AGENT, {
      method: 'PUT',
      than: { buoc: [{ noi_dung: 'Đọc SPEC', trang_thai: 'done' }, { noi_dung: 'Viết test' }] },
    });
    expect(r.status).toBe(200);

    const ra = await manHinhPhien(env.DB, CHU, WS, 'ph-1', GIO);
    expect(ra.ke_hoach.phien_ban).toBe(1);
    expect(ra.ke_hoach.buoc.map((b) => [b.noi_dung, b.nhan_trang_thai])).toEqual([
      ['Đọc SPEC', 'Xong'],
      ['Viết test', 'Chờ'],
    ]);
  });

  it('trạng thái stalled là DẪN XUẤT tại bay_gio, không một cột trong DB (d.184)', async () => {
    await datMocPhien('ph-1', { tin_hieu_cuoi_luc: GIO - 31 * PHUT });

    const ra = await manHinhPhien(env.DB, CHU, WS, 'ph-1', GIO);
    expect(ra.phien.trang_thai).toBe('stalled');
    expect(ra.phien.dung).toBe(true);
    // DB vẫn ghi `running`: nhãn đứng không bao giờ được ghi vào bảng.
    expect(ra.phien.trang_thai_luu).toBe('running');
  });

  it('nút Dừng đi qua đúng đường API có sẵn: phiên sang stopping và mang tín hiệu STOP', async () => {
    const r = await goiApi('/v1/phien/ph-1/dung', TOKEN_CHU, { method: 'POST' });
    expect(r.status).toBe(200);

    const ra = await manHinhPhien(env.DB, CHU, WS, 'ph-1', GIO);
    expect(ra.phien.trang_thai).toBe('stopping');
    // d.193: lần gọi kế tiếp của agent nhận về tín hiệu `STOP`.
    expect(ra.phien.tin_hieu).toEqual(['STOP']);
  });

  it('phiên không có thì NOT_FOUND; agent gọi thì FORBIDDEN', async () => {
    await expect(manHinhPhien(env.DB, CHU, WS, 'ph-khong-co', GIO)).rejects.toMatchObject({
      ma: 'NOT_FOUND',
    });
    await expect(
      manHinhPhien(env.DB, aiAgent('worker', { agent_id: 'ag-1' }), WS, 'ph-1', GIO),
    ).rejects.toMatchObject({ ma: 'FORBIDDEN' });
  });
});

/* ================================================================== *
 * 5. Token KHÔNG ra API — mục 15 d.417, mục 3 d.83
 * ================================================================== */

describe('Token không bao giờ ra API (mục 15 d.417)', () => {
  const TOKEN = 'bt_token_rat_bi_mat_cua_agent';

  beforeEach(async () => {
    await dungAgentCoToken({
      id: 'ag-tk',
      ten: 'W-co-token',
      vai_tro: 'worker',
      token: TOKEN,
      du_an: [P],
    });
  });

  it('thân của cả ba màn hình không mang token, không mang băm token', async () => {
    const t = await dungTicket(P, 1, 'Việc', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-1', t, 'ag-tk', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', {});

    const than = JSON.stringify([
      await manHinhDoiAgent(env.DB, CHU, WS, GIO),
      await manHinhAgent(env.DB, CHU, WS, 'ag-tk', GIO),
      await manHinhPhien(env.DB, CHU, WS, 'ph-1', GIO),
    ]);

    // Token thô: tuyệt đối không.
    expect(than).not.toContain(TOKEN);
    // Băm token: cũng không — kể cả tên trường.
    expect(than).not.toContain('token_bam');
    const bam = await env.DB.prepare('SELECT token_bam AS b FROM agent WHERE id = ?')
      .bind('ag-tk')
      .first<{ b: string }>();
    expect(bam?.b).toBeTruthy();
    expect(than).not.toContain(bam!.b);
  });

  it('nhưng 4 ký tự cuối VẪN hiện — mục 3 d.83 đòi đúng vế đó', async () => {
    const ra = await manHinhAgent(env.DB, CHU, WS, 'ag-tk', GIO);
    expect(ra.agent.token_bon_cuoi).toBe(TOKEN.slice(-4));
  });
});

/* ================================================================== *
 * 6. Đường HTTP — cổng "chỉ chủ" đi qua route thật
 * ================================================================== */

describe('Đường HTTP của ba màn hình', () => {
  it('chủ gọi được cả ba; agent nhận 403', async () => {
    await dungAgentCoToken({
      id: 'ag-1',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: 'bt_token_worker',
      du_an: [P],
    });
    const t = await dungTicket(P, 1, 'Việc', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-1', t, 'ag-1', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', {});

    for (const duong of ['/v1/man-hinh-agent', '/v1/man-hinh-agent/ag-1', '/v1/man-hinh-phien/ph-1']) {
      const cua_chu = await goiApi(duong, TOKEN_CHU);
      expect(cua_chu.status, duong).toBe(200);
      const than = await cua_chu.json<{ bay_gio: number }>();
      expect(than.bay_gio, duong).toBeGreaterThan(0);

      const cua_agent = await goiApi(duong, 'bt_token_worker');
      expect(cua_agent.status, duong).toBe(403);
      const loi = await cua_agent.json<{ error: string }>();
      expect(loi.error, duong).toBe('FORBIDDEN');
    }
  });
});
