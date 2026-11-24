/**
 * **Command menu `Cmd/Ctrl+K` — đường đọc `GET /v1/tim`** (BAT-34). SPEC mục 14
 * d.414 ("tìm mã, tiêu đề, T-số"), **19.12 câu 8** (chỉ mã ticket, tiêu đề ticket,
 * mã cũ, T-số, tiêu đề Cần Chủ; chuỗi con; KHÔNG mô tả/brief/bình luận), mục 13
 * (mã lỗi, 401, không lộ sự tồn tại), mục 1 (tách workspace), mục 4 (xoá mềm).
 */

import { afterEach, describe, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { DAI_TOI_DA_TIM_CHU } from '@baton/shared';
import {
  KET_QUA_TIM_MAC_DINH,
  TRAN_KET_QUA_TIM,
  cauTicketChuoiCon,
  cauTicketTheoMa,
  kiemLimitTim,
  maSoTimCanChu,
  type KetQuaTim,
} from '../src/doc-tim.js';
import {
  TOKEN_CHU,
  WS,
  WS_KHAC,
  dungAgentCoToken,
  dungBinhLuan,
  dungCanChu,
  dungDuAn,
  dungTicket,
  dungTicketWorkspaceKhac,
  dungWorkspace,
  goiApi,
  xoaMemTicket,
} from './giup.js';
import './ap-migration.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const T_WORKER = 'bt_test_worker_tim';
const T_COORD = 'bt_test_coord_tim';

let PJ = '';
let PJ_KHAC = '';

beforeEach(async () => {
  for (const b of [
    'can_chu_ticket',
    'can_chu_file',
    'can_chu_phuong_an',
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
  PJ_KHAC = await dungDuAn('OTH', 'Dự án khác');
  // Worker chỉ vào SAI; coordinator vào mọi dự án.
  await dungAgentCoToken({ id: 'ag-w', ten: 'W-builder', vai_tro: 'worker', token: T_WORKER, du_an: [PJ] });
  await dungAgentCoToken({
    id: 'ag-c',
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: T_COORD,
    vao_tat_ca_du_an: true,
  });
});

async function tim(q: string, token = TOKEN_CHU, them = ''): Promise<KetQuaTim> {
  const r = await goiApi(`/v1/tim?q=${encodeURIComponent(q)}${them}`, token);
  expect(r.status, await r.clone().text()).toBe(200);
  return r.json<KetQuaTim>();
}

const maTicket = (k: KetQuaTim): string[] => k.ticket.map((t) => t.ma);
const maMuc = (k: KetQuaTim): string[] => k.can_chu.map((m) => m.ma);

/* ================================================================== */

describe('hàm thuần', () => {
  it('kẹp limit vào trần; mặc định; sai dạng ⇒ INVALID_INPUT', () => {
    expect(kiemLimitTim(undefined)).toBe(KET_QUA_TIM_MAC_DINH);
    expect(kiemLimitTim('3')).toBe(3);
    expect(kiemLimitTim('9999')).toBe(TRAN_KET_QUA_TIM);
    expect(() => kiemLimitTim('0')).toThrow();
    expect(() => kiemLimitTim('abc')).toThrow();
  });

  it('T-số: T-12, t-12, T12, t12 tra thẳng; khác ⇒ null', () => {
    for (const s of ['T-12', 't-12', 'T12', 't12', ' T-12 ']) expect(maSoTimCanChu(s), s).toBe(12);
    for (const s of ['T-', 'T-1a', 'X-12', '12', 'T--12']) expect(maSoTimCanChu(s), s).toBeNull();
  });
});

describe('theo MÃ ticket', () => {
  it('đúng mã ⇒ ticket đó ĐỨNG ĐẦU, dù thứ tự danh sách đặt nó sau; không phân biệt hoa thường', async () => {
    // SAI-1 ưu tiên thấp nhất ⇒ trong thứ tự danh sách nó ở cuối.
    await dungTicket(PJ, 1, 'Một', { uu_tien: 'none' });
    for (let so = 10; so <= 14; so++) await dungTicket(PJ, so, `Việc ${String(so)}`, { uu_tien: 'urgent' });
    const k = await tim('SAI-1');
    expect(k.ticket[0]?.ma).toBe('SAI-1');
    // Chuỗi con trên mã: SAI-1x cũng ra (sau mã khớp đúng).
    expect(maTicket(k).slice(1).sort()).toEqual(['SAI-10', 'SAI-11', 'SAI-12', 'SAI-13', 'SAI-14']);
    const k2 = await tim('sai-1');
    expect(k2.ticket[0]?.ma).toBe('SAI-1');
    // Hình dạng phần tử.
    expect(k.ticket[0]).toMatchObject({
      id: `tk-${PJ}-1`,
      tieu_de: 'Một',
      trang_thai: 'todo',
      nhan_trang_thai: 'Cần làm',
      ma_cu: null,
      project_id: PJ,
      ma_du_an: 'SAI',
    });
  });

  it('đúng mã nhưng không còn chỗ (limit=1) ⇒ vẫn là mã đó', async () => {
    for (let so = 10; so <= 12; so++) await dungTicket(PJ, so, 'x', { uu_tien: 'urgent' });
    await dungTicket(PJ, 1, 'Một');
    const k = await tim('SAI-1', TOKEN_CHU, '&limit=1');
    expect(maTicket(k)).toEqual(['SAI-1']);
  });
});

describe('theo CHỮ trong tiêu đề — chuỗi con, khác hoa thường (ASCII), có dấu', () => {
  it('khớp chuỗi con ở giữa tiêu đề; hoa/thường ASCII khác nhau vẫn khớp; chữ có dấu khớp đúng chữ', async () => {
    await dungTicket(PJ, 1, 'Sửa Lỗi Đăng Nhập trên web');
    await dungTicket(PJ, 2, 'Việc không liên quan');
    // `S`, `L` (ASCII) khác hoa thường; `ử`, `ỗ` là chữ có dấu giữ nguyên.
    expect(maTicket(await tim('sửa lỗi'))).toEqual(['SAI-1']);
    expect(maTicket(await tim('đăng nhập trên WEB'))).toEqual([]); // `Đ` ≠ `đ` — xem ca dưới
    expect(maTicket(await tim('Đăng Nhập trên WEB'))).toEqual(['SAI-1']);
    expect(maTicket(await tim('nhập'))).toEqual(['SAI-1']);
  });

  it('GIỚI HẠN đã khai: chữ có dấu KHÁC hoa/thường không khớp (lower() của SQLite chỉ hạ ASCII)', async () => {
    await dungTicket(PJ, 1, 'đăng nhập');
    expect(maTicket(await tim('ĐĂNG'))).toEqual([]);
    expect(maTicket(await tim('đăng'))).toEqual(['SAI-1']);
  });

  it('KHÔNG tìm trong mô tả, brief, bình luận (19.12 câu 8)', async () => {
    const id = await dungTicket(PJ, 1, 'Tiêu đề thường');
    await env.DB.prepare('UPDATE ticket SET mo_ta = ?, muc_tieu = ? WHERE id = ?')
      .bind('chữ bí mật trong mô tả', 'chữ bí mật trong brief', id)
      .run();
    await dungBinhLuan('cm-1', id, 'chữ bí mật trong bình luận');
    const k = await tim('bí mật');
    expect(k.ticket).toEqual([]);
  });
});

describe('theo MÃ CŨ (mục 16)', () => {
  it('chuỗi con của ma_cu, không phân biệt hoa thường ASCII', async () => {
    const id = await dungTicket(PJ, 1, 'Việc nhập từ hệ cũ');
    await dungTicket(PJ, 2, 'Việc khác');
    await env.DB.prepare('UPDATE ticket SET ma_cu = ? WHERE id = ?').bind('LIN-482', id).run();
    const k = await tim('lin-48');
    expect(maTicket(k)).toEqual(['SAI-1']);
    expect(k.ticket[0]?.ma_cu).toBe('LIN-482');
  });
});

describe('Cần Chủ: T-số và tiêu đề', () => {
  it('T-số tra thẳng (T-12, t12) và đứng đầu; tiêu đề chuỗi con; Chờ trước rồi mới nhất', async () => {
    await dungCanChu('ct-12', { ma_so: 12, tieu_de: 'Duyệt ngân sách', trang_thai: 'resolved', project_id: PJ });
    await dungCanChu('ct-3', { ma_so: 3, tieu_de: 'Chọn tên miền T12 mới', project_id: PJ, tao_luc: 1000 });
    await dungCanChu('ct-4', { ma_so: 4, tieu_de: 'Chọn tên miền phụ', project_id: PJ, tao_luc: 2000 });
    const k = await tim('T-12');
    expect(k.can_chu[0]).toMatchObject({ id: 'ct-12', ma: 'T-12', tieu_de: 'Duyệt ngân sách', trang_thai: 'resolved' });
    expect(typeof k.can_chu[0]?.nhan_trang_thai).toBe('string');
    expect(maMuc(await tim('t12'))[0]).toBe('T-12');
    // Tiêu đề: hai mục Chờ, mới nhất trước.
    expect(maMuc(await tim('tên miền'))).toEqual(['T-4', 'T-3']);
  });

  it('mục đã xử lý xếp SAU mục Chờ', async () => {
    await dungCanChu('ct-1', { ma_so: 1, tieu_de: 'Hỏi A', trang_thai: 'resolved', tao_luc: 3000 });
    await dungCanChu('ct-2', { ma_so: 2, tieu_de: 'Hỏi B', tao_luc: 1000 });
    expect(maMuc(await tim('hỏi'))).toEqual(['T-2', 'T-1']);
  });
});

describe('không có kết quả, q rỗng, q quá dài', () => {
  it('không có gì khớp ⇒ hai mảng rỗng', async () => {
    await dungTicket(PJ, 1, 'Một');
    expect(await tim('zzzz')).toEqual({ ticket: [], can_chu: [] });
  });

  it('q rỗng / chỉ khoảng trắng / vắng ⇒ hai mảng rỗng, 200', async () => {
    await dungTicket(PJ, 1, 'Một');
    await dungCanChu('ct-1', { ma_so: 1, tieu_de: 'Hỏi' });
    expect(await tim('')).toEqual({ ticket: [], can_chu: [] });
    expect(await tim('   ')).toEqual({ ticket: [], can_chu: [] });
    const r = await goiApi('/v1/tim', TOKEN_CHU);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ticket: [], can_chu: [] });
  });

  it(`q dài hơn ${String(DAI_TOI_DA_TIM_CHU)} ký tự ⇒ 422 INVALID_INPUT (mục 13); đúng ${String(DAI_TOI_DA_TIM_CHU)} thì được`, async () => {
    const r = await goiApi(`/v1/tim?q=${'a'.repeat(DAI_TOI_DA_TIM_CHU + 1)}`, TOKEN_CHU);
    expect(r.status).toBe(422);
    expect((await r.json<{ error: string }>()).error).toBe('INVALID_INPUT');
    const r2 = await goiApi(`/v1/tim?q=${'a'.repeat(DAI_TOI_DA_TIM_CHU)}`, TOKEN_CHU);
    expect(r2.status).toBe(200);
  });

  it('limit sai dạng ⇒ 422 INVALID_INPUT', async () => {
    const r = await goiApi('/v1/tim?q=a&limit=0', TOKEN_CHU);
    expect(r.status).toBe(422);
    expect((await r.json<{ error: string }>()).error).toBe('INVALID_INPUT');
  });
});

describe('giới hạn số kết quả mỗi nhóm', () => {
  it(`sinh nhiều hơn trần ⇒ mặc định ${String(KET_QUA_TIM_MAC_DINH)}, limit lớn kẹp về ${String(TRAN_KET_QUA_TIM)}, limit nhỏ đúng số`, async () => {
    const n = TRAN_KET_QUA_TIM + 5;
    for (let so = 1; so <= n; so++) await dungTicket(PJ, so, `Lặp ${String(so)}`);
    for (let so = 1; so <= n; so++) await dungCanChu(`ct-${String(so)}`, { ma_so: so, tieu_de: `Lặp ${String(so)}` });
    const k = await tim('lặp');
    expect(k.ticket).toHaveLength(KET_QUA_TIM_MAC_DINH);
    expect(k.can_chu).toHaveLength(KET_QUA_TIM_MAC_DINH);
    const k2 = await tim('lặp', TOKEN_CHU, '&limit=1000');
    expect(k2.ticket).toHaveLength(TRAN_KET_QUA_TIM);
    expect(k2.can_chu).toHaveLength(TRAN_KET_QUA_TIM);
    const k3 = await tim('lặp', TOKEN_CHU, '&limit=3');
    expect(k3.ticket).toHaveLength(3);
    expect(k3.can_chu).toHaveLength(3);
  });
});

describe('ticket đã xoá mềm KHÔNG ra (cùng luật danh sách)', () => {
  it('cả lối tra mã lẫn chuỗi con', async () => {
    const id = await dungTicket(PJ, 1, 'Việc đã xoá');
    await dungTicket(PJ, 2, 'Việc còn');
    await xoaMemTicket(id);
    expect(maTicket(await tim('SAI-1'))).toEqual([]);
    expect(maTicket(await tim('việc'))).toEqual(['SAI-2']);
  });
});

describe('quyền — cùng cửa GET /v1/ticket và GET /v1/can-chu', () => {
  it('agent ngoài phạm vi dự án KHÔNG thấy ticket/mục của dự án đó (kể cả tra thẳng mã)', async () => {
    await dungTicket(PJ, 1, 'Chung chữ khoá');
    await dungTicket(PJ_KHAC, 1, 'Chung chữ khoá');
    await dungCanChu('ct-1', { ma_so: 1, tieu_de: 'Khoá hỏi', project_id: PJ });
    await dungCanChu('ct-2', { ma_so: 2, tieu_de: 'Khoá hỏi', project_id: PJ_KHAC });

    const w = await tim('chữ khoá', T_WORKER);
    expect(maTicket(w)).toEqual(['SAI-1']);
    expect(maTicket(await tim('OTH-1', T_WORKER))).toEqual([]);
    expect(maMuc(await tim('khoá hỏi', T_WORKER))).toEqual(['T-1']);
    expect(maMuc(await tim('T-2', T_WORKER))).toEqual([]);

    // Đối chứng: agent "tất cả dự án" và chủ thấy cả hai.
    expect(maTicket(await tim('chữ khoá', T_COORD)).sort()).toEqual(['OTH-1', 'SAI-1']);
    expect(maTicket(await tim('chữ khoá')).sort()).toEqual(['OTH-1', 'SAI-1']);
    expect(maMuc(await tim('khoá hỏi')).sort()).toEqual(['T-1', 'T-2']);
  });

  it('nhóm Cần Chủ khớp ĐÚNG tập của GET /v1/can-chu cho cùng người gọi (lớp Chung theo cùng luật)', async () => {
    await dungCanChu('ct-1', { ma_so: 1, tieu_de: 'Mục so sánh A', project_id: PJ });
    await dungCanChu('ct-2', { ma_so: 2, tieu_de: 'Mục so sánh B', project_id: PJ_KHAC });
    await dungCanChu('ct-3', { ma_so: 3, tieu_de: 'Mục so sánh C' }); // Chung
    for (const token of [TOKEN_CHU, T_WORKER, T_COORD]) {
      const r = await goiApi('/v1/can-chu', token);
      const man = await r.json<{ khoi: { items: { ma: string }[] }[] }>();
      const thay = man.khoi.flatMap((k) => k.items.map((i) => i.ma)).sort();
      expect(maMuc(await tim('so sánh', token)).sort(), token).toEqual(thay);
    }
  });

  it('khác workspace KHÔNG thấy (ticket lẫn Cần Chủ)', async () => {
    await dungTicketWorkspaceKhac();
    const t = Date.now();
    await env.DB.prepare(
      `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
                            can_tty, tao_luc, cap_nhat_luc, mo_lai_lan)
       VALUES ('ct-khac', ?, 7, 'Hỏi của workspace khác', NULL, 'today', 'fyi', 'open', 0, ?, ?, 0)`,
    )
      .bind(WS_KHAC, t, t)
      .run();
    const k = await tim('workspace khác');
    expect(k).toEqual({ ticket: [], can_chu: [] });
    expect(maMuc(await tim('T-7'))).toEqual([]);
    expect(maTicket(await tim('OTH-1'))).toEqual([]);
    expect(WS).not.toBe(WS_KHAC);
  });

  it('không token ⇒ 401 (nếp cổng xác thực)', async () => {
    const r = await SELF.fetch('https://baton.test/v1/tim?q=a');
    expect(r.status).toBe(401);
  });
});

describe('ký tự đặc biệt của LIKE và SQL là CHỮ', () => {
  it('`%` không là "mọi thứ", `_` không là "một ký tự bất kỳ", `\\` và `\'` khớp đúng chữ, không lỗi SQL', async () => {
    await dungTicket(PJ, 1, 'Giảm 50% phí');
    await dungTicket(PJ, 2, 'Giảm 500 phí');
    await dungTicket(PJ, 3, 'tên_biến');
    await dungTicket(PJ, 4, 'tênXbiến');
    await dungTicket(PJ, 5, 'đường C:\\tmp');
    await dungTicket(PJ, 6, "it's ok");
    await dungCanChu('ct-1', { ma_so: 1, tieu_de: '100% chắc' });
    await dungCanChu('ct-2', { ma_so: 2, tieu_de: '1000 chắc' });

    expect(maTicket(await tim('%'))).toEqual(['SAI-1']);
    expect(maTicket(await tim('50%'))).toEqual(['SAI-1']);
    expect(maTicket(await tim('_'))).toEqual(['SAI-3']);
    expect(maTicket(await tim('n_b'))).toEqual(['SAI-3']);
    expect(maTicket(await tim('\\'))).toEqual(['SAI-5']);
    expect(maTicket(await tim(':\\t'))).toEqual(['SAI-5']);
    expect(maTicket(await tim("'"))).toEqual(['SAI-6']);
    expect(maTicket(await tim("it's"))).toEqual(['SAI-6']);
    expect(maMuc(await tim('%'))).toEqual(['T-1']);
  });
});

describe('đường đọc không ghi gì', () => {
  it('gọi tìm không thêm dòng lịch sử nào, không đổi cap_nhat_luc của ticket', async () => {
    const id = await dungTicket(PJ, 1, 'Một', { tao_luc: 1234 });
    const truoc = await env.DB.prepare('SELECT count(*) AS n FROM ticket_history').first<{ n: number }>();
    await tim('một');
    await tim('SAI-1');
    const sau = await env.DB.prepare('SELECT count(*) AS n FROM ticket_history').first<{ n: number }>();
    expect(sau?.n).toBe(truoc?.n);
    const t = await env.DB.prepare('SELECT cap_nhat_luc FROM ticket WHERE id = ?').bind(id).first<{ cap_nhat_luc: number }>();
    expect(t?.cap_nhat_luc).toBe(1234);
  });
});

/**
 * **Kế hoạch truy vấn** (nếp `phan-trang.test.ts`: đo chính hàm dựng câu của mã
 * sản phẩm). Mã dự án lấy qua **JOIN** `project` (một lần tra khoá chính mỗi
 * dòng), không subquery tương quan. Câu chuỗi con vẫn **quét ticket trong một
 * workspace** — `LIKE '%x%'` không dùng được B-tree (đã khai ở `doc-tim.ts`, không
 * thêm index) — nhưng đi index theo đúng thứ tự `ORDER BY` (không B-tree tạm).
 */
describe('EXPLAIN QUERY PLAN — JOIN project, không subquery tương quan, không B-tree tạm', () => {
  const WORKER_AI = {
    loai: 'agent' as const,
    agent_id: 'ag-w',
    vai_tro: 'worker' as const,
    disabled: false,
    vao_tat_ca_du_an: false,
    du_an_duoc_vao: [] as string[],
    du_an_minh_quan_ly: [] as string[],
    ghi_de: {},
  };

  async function keHoach(cau: { sql: string; bind: (string | number)[] }): Promise<string> {
    const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${cau.sql}`)
      .bind(...cau.bind)
      .all<{ detail: string }>();
    return results.map((r) => r.detail).join(' | ');
  }

  for (const [ten, ai] of [
    ['chủ', { loai: 'chu' as const }],
    ['agent hẹp phạm vi', WORKER_AI],
  ] as const) {
    it(`chuỗi con (${ten}): project tra theo khoá, không CORRELATED, không TEMP B-TREE`, async () => {
      const kh = await keHoach(cauTicketChuoiCon(ai, WS, '%sai%', 10));
      expect(kh).not.toContain('CORRELATED');
      expect(kh).not.toContain('SCAN p');
      expect(kh).toMatch(/SEARCH p USING (INDEX sqlite_autoindex_project_1|INDEX ux_project_ma|PRIMARY KEY)/);
      expect(kh).not.toContain('TEMP B-TREE');
      // Đã biết, đã khai: đi cả workspace theo index danh sách (LIKE '%x%').
      expect(kh).toContain('SEARCH t USING INDEX ix_ticket_ws_uu_tien (workspace_id=?)');
    });

    it(`tra thẳng mã (${ten}): ux_project_ma + ux_ticket_so, không SCAN, không CORRELATED`, async () => {
      const kh = await keHoach(cauTicketTheoMa(ai, WS, 'SAI', 1));
      expect(kh).toContain('ux_project_ma');
      expect(kh).toContain('ux_ticket_so');
      expect(kh).not.toMatch(/SCAN (t|p)\b/);
      expect(kh).not.toContain('CORRELATED');
    });
  }
});
