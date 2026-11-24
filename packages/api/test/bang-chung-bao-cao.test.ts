/**
 * **Bằng chứng "Báo cáo" (`bao_cao`) + cờ "ticket không code"** — BAT-37 việc 2,
 * chủ chốt T-31 câu 3.4 A (19/10), `cau-hoi-spec.md` #161, migration 0027.
 *
 *   A. Cổng — luật thuần (`congXong`): `bao_cao` chỉ mở cổng cho ticket KHÔNG code.
 *   B. Migration 0027: cột, trigger tổ hợp, bất biến, dữ liệu cũ, rollback.
 *   C. HTTP: quyền ký giống `review`; cổng qua cửa ghi thật; đọc lại thấy `bao_cao`.
 *   D. Cờ `ticket.khong_code`: chỉ chủ đổi, ghi Lịch sử, cổng đọc lúc kiểm.
 *
 * Không gọi mạng: `bao_cao` không có bước xác minh (`not_required`).
 */

import { applyD1Migrations, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  LY_DO_BAO_CAO_CUA_NGUOI_LAM,
  LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN,
  LY_DO_KHONG_CODE_THIEU_FILE_NOTE,
  LY_DO_THIEU_COMMIT_HOAC_DEPLOY,
  LY_DO_THIEU_REVIEW_DAT,
  baoCaoDuocTinh,
  congXong,
  kiemNoiDungBangChung,
  xacMinhBanDau,
  type BangChungChoCong,
  type BoiCanhCong,
} from '@baton/shared';
import { congBangChungCua } from '../src/cong-bang-chung.js';
import { sqlLoaiBangChung } from '../src/loai-bang-chung.js';
import { boChuThichDongKieuD1, tachCauLenh } from './tien-xu-ly-d1.js';
import {
  TOKEN_CHU,
  WS,
  dungAgentCoToken,
  dungBangChung,
  dungDuAn,
  dungLuotGiao,
  dungTicket,
  dungWorkspace,
  goiApi,
  trangThaiCua,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const TK = 'tk-pj-SAI-1';
const BAO_CAO_RV = 'bao-cao/2026-10-19.md#reviewer';

const TOKEN = {
  manager: 'bt_t_mgr_bat37',
  worker: 'bt_t_wk_bat37',
  reviewer: 'bt_t_rv_bat37',
  coordinator: 'bt_t_cd_bat37',
} as const;
const ID = {
  manager: 'ag-mgr-bat37',
  worker: 'ag-wk-bat37',
  reviewer: 'ag-rv-bat37',
  coordinator: 'ag-cd-bat37',
} as const;

/* ================================================================== *
 * A. Cổng — luật thuần
 * ================================================================== */

describe('T-31 3.4 A — `congXong` với `bao_cao` (luật thuần)', () => {
  function bc(them: Partial<BoiCanhCong> = {}): BoiCanhCong {
    return {
      khong_code: false,
      bat_buoc_review: true,
      chu_xac_nhan: false,
      bang_chung: [],
      nguoi_lam: ['ag-worker'],
      ...them,
    };
  }
  const baoCao = (agent_id: string | null, rut_luc: number | null = null): BangChungChoCong => ({
    loai: 'bao_cao',
    gui_luc: 500,
    xac_minh: 'not_required',
    rut_luc,
    nguoi_gui: agent_id === null ? { loai: 'owner' } : { loai: 'agent', agent_id },
  });
  const commit = (gui_luc: number): BangChungChoCong => ({
    loai: 'commit',
    gui_luc,
    xac_minh: 'merged',
    rut_luc: null,
  });

  it('không code (cờ ticket ⇒ khong_code=true) + `bao_cao` của reviewer khác người làm ⇒ ĐỦ, không cần chủ xác nhận', () => {
    expect(congXong(bc({ khong_code: true, bang_chung: [baoCao('ag-rv')] }))).toEqual({
      du: true,
      ly_do: '',
    });
  });

  it('`bao_cao` do CHÍNH người làm ký ⇒ KHÔNG đủ, lý do riêng', () => {
    const kq = congXong(bc({ khong_code: true, bang_chung: [baoCao('ag-worker')] }));
    expect(kq).toEqual({ du: false, ly_do: LY_DO_BAO_CAO_CUA_NGUOI_LAM });
  });

  it('`bao_cao` đã RÚT ⇒ KHÔNG đủ (d.222), lý do thiếu bằng chứng', () => {
    const kq = congXong(bc({ khong_code: true, bang_chung: [baoCao('ag-rv', 900)] }));
    expect(kq).toEqual({ du: false, ly_do: LY_DO_KHONG_CODE_THIEU_FILE_NOTE });
  });

  it('`bao_cao` do CHỦ ký ⇒ ĐỦ', () => {
    expect(congXong(bc({ khong_code: true, bang_chung: [baoCao(null)] })).du).toBe(true);
  });

  it('cờ DỰ ÁN không code (cũng khong_code=true) + `bao_cao` ⇒ ĐỦ', () => {
    expect(congXong(bc({ khong_code: true, nguoi_lam: [], bang_chung: [baoCao('ag-cd')] })).du).toBe(
      true,
    );
  });

  it('CÓ code + chỉ `bao_cao` ⇒ LY_DO_THIEU_COMMIT_HOAC_DEPLOY (bao_cao không mở gì)', () => {
    expect(congXong(bc({ bang_chung: [baoCao('ag-rv')] }))).toEqual({
      du: false,
      ly_do: LY_DO_THIEU_COMMIT_HOAC_DEPLOY,
    });
    expect(congXong(bc({ bang_chung: [baoCao(null)] })).ly_do).toBe(LY_DO_THIEU_COMMIT_HOAC_DEPLOY);
  });

  it('CÓ code + commit merged + `bao_cao` nhưng thiếu review ⇒ vẫn chặn (bao_cao không thay review)', () => {
    expect(congXong(bc({ bang_chung: [commit(100), baoCao('ag-rv')] }))).toEqual({
      du: false,
      ly_do: LY_DO_THIEU_REVIEW_DAT,
    });
  });

  it('luật cũ d.217 vẫn đúng: file/note + chủ xác nhận ⇒ đủ; chỉ note ⇒ chờ chủ', () => {
    const note: BangChungChoCong = { loai: 'note', gui_luc: 10, xac_minh: 'not_required', rut_luc: null };
    expect(congXong(bc({ khong_code: true, bang_chung: [note] })).ly_do).toBe(
      LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN,
    );
    expect(congXong(bc({ khong_code: true, chu_xac_nhan: true, bang_chung: [note] })).du).toBe(true);
  });

  it('`bao_cao` KHÔNG bị đếm như file/note: báo cáo của người làm + chủ đã xác nhận ⇒ vẫn chặn', () => {
    expect(
      congXong(bc({ khong_code: true, chu_xac_nhan: true, bang_chung: [baoCao('ag-worker')] })).du,
    ).toBe(false);
  });

  it('`baoCaoDuocTinh` chỉ lọc `bao_cao` chưa rút, khác người làm', () => {
    const ds = [baoCao('ag-worker'), baoCao('ag-rv'), baoCao('ag-rv2', 1), commit(1)];
    expect(baoCaoDuocTinh(ds, ['ag-worker'])).toHaveLength(1);
  });

  it('kiểm nhập: cần đường dẫn hoặc nội dung; `not_required`', () => {
    expect(() => kiemNoiDungBangChung({ loai: 'bao_cao' })).toThrow(/ít nhất một/);
    expect(kiemNoiDungBangChung({ loai: 'bao_cao', noi_dung: ' x ' })).toEqual({
      loai: 'bao_cao',
      duong_dan: null,
      noi_dung: 'x',
      duong_dan_bao_cao: null,
    });
    expect(xacMinhBanDau('bao_cao')).toBe('not_required');
  });
});

/* ================================================================== *
 * B. Migration 0027
 * ================================================================== */

async function chen(cot: Record<string, unknown>): Promise<string | null> {
  const day: Record<string, unknown> = {
    workspace_id: WS,
    ticket_id: TK,
    nguoi_gui_loai: 'owner',
    gui_luc: 1,
    xac_minh: 'not_required',
    tao_luc: 1,
    cap_nhat_luc: 1,
    ...cot,
  };
  const ten = Object.keys(day);
  try {
    await env.DB.prepare(
      `INSERT INTO evidence (${ten.join(', ')}) VALUES (${ten.map(() => '?').join(', ')})`,
    )
      .bind(...ten.map((t) => day[t]))
      .run();
    return null;
  } catch (e) {
    return String(e);
  }
}

describe('migration 0027 — cột, trigger, dữ liệu cũ, rollback', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungTicket(P, 1, 'Việc nghiên cứu', { trang_thai: 'verifying' });
    await dungAgentCoToken({ id: ID.manager, ten: 'M', vai_tro: 'manager', token: TOKEN.manager, du_an: [P] });
  });

  it('có `ticket.khong_code` (mặc định 0) và hai cột mới của `evidence`', async () => {
    const t = await env.DB.prepare('PRAGMA table_info(ticket)').all<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>();
    const kc = t.results.find((c) => c.name === 'khong_code');
    expect(kc?.notnull).toBe(1);
    expect(kc?.dflt_value).toBe('0');
    const e = await env.DB.prepare('PRAGMA table_info(evidence)').all<{ name: string }>();
    expect(e.results.map((c) => c.name)).toEqual(
      expect.arrayContaining(['bao_cao_nguon', 'bao_cao_reviewer']),
    );
    const d = await env.DB.prepare('SELECT khong_code FROM ticket WHERE id = ?').bind(TK).first();
    expect(d?.['khong_code']).toBe(0);
    expect(
      await env.DB.prepare('UPDATE ticket SET khong_code = 2 WHERE id = ?').bind(TK).run().catch(String),
    ).toMatch(/CHECK/);
  });

  it('trigger nhận đúng tổ hợp hợp lệ (đối chứng)', async () => {
    expect(await chen({ id: 'a', loai: 'note', noi_dung: 'x', bao_cao_nguon: 'owner' })).toBeNull();
    expect(await chen({ id: 'b', loai: 'file', duong_dan: 'y', bao_cao_nguon: 'owner' })).toBeNull();
    expect(
      await chen({
        id: 'c',
        loai: 'note',
        noi_dung: 'x',
        duong_dan: 'y',
        nguoi_gui_loai: 'agent',
        nguoi_gui_agent_id: ID.manager,
        bao_cao_nguon: 'manager',
        bao_cao_reviewer: BAO_CAO_RV,
      }),
    ).toBeNull();
  });

  it('trigger CHẶN tổ hợp sai', async () => {
    const sai = [
      { id: 's1', loai: 'review', ket_luan: 'pass', bao_cao_nguon: 'owner' },
      { id: 's2', loai: 'note', noi_dung: 'x', bao_cao_nguon: 'khach' },
      { id: 's3', loai: 'note', noi_dung: 'x', bao_cao_nguon: 'reviewer' }, // người gửi là chủ
      {
        id: 's4',
        loai: 'note',
        noi_dung: 'x',
        nguoi_gui_loai: 'agent',
        nguoi_gui_agent_id: ID.manager,
        bao_cao_nguon: 'owner',
      },
      { id: 's5', loai: 'file', duong_dan: 'y', noi_dung: 'x', bao_cao_nguon: 'owner' }, // có nội dung phải là note
      {
        id: 's6',
        loai: 'note',
        noi_dung: 'x',
        nguoi_gui_loai: 'agent',
        nguoi_gui_agent_id: ID.manager,
        bao_cao_nguon: 'manager',
      }, // thiếu báo cáo reviewer
      { id: 's7', loai: 'note', noi_dung: 'x', bao_cao_reviewer: BAO_CAO_RV }, // không phải báo cáo
    ];
    const lot: string[] = [];
    for (const c of sai) {
      const loi = await chen(c);
      if (loi === null || !/bao cao khong hop le/.test(loi)) lot.push(c.id);
    }
    expect(lot).toEqual([]);
  });

  it('hai cột mới BẤT BIẾN (d.222)', async () => {
    await chen({ id: 'bb', loai: 'note', noi_dung: 'x', bao_cao_nguon: 'owner' });
    await chen({ id: 'nn', loai: 'note', noi_dung: 'x' });
    for (const sql of [
      "UPDATE evidence SET bao_cao_nguon = NULL WHERE id = 'bb'",
      "UPDATE evidence SET bao_cao_reviewer = 'z' WHERE id = 'bb'",
      "UPDATE evidence SET bao_cao_nguon = 'owner' WHERE id = 'nn'",
    ]) {
      expect(await env.DB.prepare(sql).run().catch(String)).toMatch(/khong sua duoc/);
    }
  });

  it('`sqlLoaiBangChung` map `bao_cao`, giữ nguyên loại khác', async () => {
    await chen({ id: 'bb', loai: 'file', duong_dan: 'y', bao_cao_nguon: 'owner' });
    await chen({ id: 'ff', loai: 'file', duong_dan: 'y' });
    const { results } = await env.DB.prepare(
      `SELECT id, ${sqlLoaiBangChung()} AS loai FROM evidence ORDER BY id`,
    ).all<{ id: string; loai: string }>();
    expect(results).toEqual([
      { id: 'bb', loai: 'bao_cao' },
      { id: 'ff', loai: 'file' },
    ]);
  });

  it('dữ liệu TRƯỚC 0027 còn nguyên sau khi áp 0027, và rollback áp được (DB thử riêng)', async () => {
    const db = env.DB_TIEN_XU_LY;
    const truoc = env.TEST_MIGRATIONS.filter((m) => m.name < '0027');
    const m27 = env.TEST_MIGRATIONS.filter((m) => m.name.startsWith('0027_'));
    expect(m27).toHaveLength(1);
    await applyD1Migrations(db, truoc);

    await db.batch([
      db.prepare("INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES ('w', 'T', 1, 1)"),
      db.prepare(
        "INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc) VALUES ('p', 'w', 'S', 'SAI', 'active', 1, 1)",
      ),
      db.prepare(
        `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
           chiu_trach_nhiem_loai, nguoi_tao_loai, tao_luc, cap_nhat_luc)
         VALUES ('t', 'w', 'p', 1, 'Cũ', 'done', 'none', 4, 'owner', 'owner', 1, 1)`,
      ),
      db.prepare(
        `INSERT INTO evidence (id, workspace_id, ticket_id, loai, nguoi_gui_loai, gui_luc, xac_minh,
           noi_dung, tao_luc, cap_nhat_luc)
         VALUES ('e', 'w', 't', 'note', 'owner', 1, 'not_required', 'Ghi chú cũ', 1, 1)`,
      ),
    ]);

    await applyD1Migrations(db, m27);
    const t = await db.prepare("SELECT tieu_de, trang_thai, khong_code FROM ticket WHERE id = 't'").first();
    expect(t).toEqual({ tieu_de: 'Cũ', trang_thai: 'done', khong_code: 0 });
    const e = await db
      .prepare(`SELECT ${sqlLoaiBangChung()} AS loai, noi_dung, bao_cao_nguon FROM evidence WHERE id = 'e'`)
      .first();
    expect(e).toEqual({ loai: 'note', noi_dung: 'Ghi chú cũ', bao_cao_nguon: null });

    // Rollback (file thư mục con, không tự áp) áp được, dữ liệu cũ vẫn còn.
    const rb = env.TEST_VAN_BAN_ROLLBACK.find((f) => f.ten === '0027_bang_chung_bao_cao.rollback.sql');
    expect(rb).toBeDefined();
    expect(env.TEST_MIGRATIONS.map((m) => m.name)).not.toContain(rb!.ten);
    const cau = tachCauLenh(boChuThichDongKieuD1(rb!.noi_dung));
    expect(cau.length).toBeGreaterThan(0);
    for (const c of cau) await db.prepare(c).run();
    const cot_tk = await db.prepare('PRAGMA table_info(ticket)').all<{ name: string }>();
    expect(cot_tk.results.map((c) => c.name)).not.toContain('khong_code');
    const cot_ev = await db.prepare('PRAGMA table_info(evidence)').all<{ name: string }>();
    expect(cot_ev.results.map((c) => c.name)).not.toContain('bao_cao_nguon');
    expect(await db.prepare("SELECT noi_dung FROM evidence WHERE id = 'e'").first()).toEqual({
      noi_dung: 'Ghi chú cũ',
    });
  });
});

/* ================================================================== *
 * C + D. HTTP thật
 * ================================================================== */

function gui(token: string, than: Record<string, unknown>): Promise<Response> {
  return goiApi(`/v1/ticket/${TK}/bang-chung`, token, { method: 'POST', than });
}
function doiXong(): Promise<Response> {
  return goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
    method: 'POST',
    than: { trang_thai: 'done' },
  });
}
function suaTicket(token: string, than: Record<string, unknown>): Promise<Response> {
  return goiApi(`/v1/ticket/${TK}`, token, { method: 'PATCH', than });
}
async function batKhongCodeTicket(): Promise<void> {
  expect((await suaTicket(TOKEN_CHU, { khong_code: true })).status).toBe(200);
}
const BAO_CAO = { loai_bang_chung: 'bao_cao', duong_dan: 'bao-cao/sai-32.md' };

describe('HTTP — gửi `bao_cao`, cổng, đọc lại, cờ ticket', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungTicket(P, 1, 'Việc nghiên cứu', { trang_thai: 'verifying' });
    for (const vai of ['manager', 'worker', 'reviewer', 'coordinator'] as const) {
      await dungAgentCoToken({ id: ID[vai], ten: vai, vai_tro: vai, token: TOKEN[vai], du_an: [P] });
    }
    await dungLuotGiao('lg-wk', TK, ID.worker, { loai: 'work', trang_thai: 'accepted' });
  });

  /* --- quyền ký: giống hệt review ------------------------------------ */

  it('reviewer khác người làm ⇒ 201, nguồn `reviewer`; đọc lại `loai: bao_cao`', async () => {
    const res = await gui(TOKEN.reviewer, BAO_CAO);
    expect(res.status).toBe(201);
    const b = await res.json<{ loai: string; bao_cao_nguon: string; review_nguon: unknown }>();
    expect(b.loai).toBe('bao_cao');
    expect(b.bao_cao_nguon).toBe('reviewer');
    expect(b.review_nguon).toBeNull();
  });

  it('worker (người làm) ⇒ FORBIDDEN; reviewer LÀ người làm ⇒ REVIEWER_IS_WORKER', async () => {
    expect((await gui(TOKEN.worker, BAO_CAO)).status).toBe(403);
    await dungLuotGiao('lg-rv', TK, ID.reviewer, { loai: 'work', trang_thai: 'accepted' });
    const res = await gui(TOKEN.reviewer, BAO_CAO);
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('REVIEWER_IS_WORKER');
  });

  it('manager KHÔNG kèm báo cáo reviewer ⇒ INVALID_INPUT; kèm ⇒ nguồn `manager`', async () => {
    const thieu = await gui(TOKEN.manager, BAO_CAO);
    expect(thieu.status).toBe(422);
    expect((await thieu.json<{ message: string }>()).message).toMatch(/đường dẫn báo cáo/);
    const du = await gui(TOKEN.manager, { ...BAO_CAO, duong_dan_bao_cao: BAO_CAO_RV });
    expect(du.status).toBe(201);
    expect((await du.json<{ bao_cao_nguon: string }>()).bao_cao_nguon).toBe('manager');
  });

  it('coordinator ⇒ nguồn `coordinator`; chủ ⇒ nguồn `owner`', async () => {
    const cd = await gui(TOKEN.coordinator, BAO_CAO);
    expect((await cd.json<{ bao_cao_nguon: string }>()).bao_cao_nguon).toBe('coordinator');
    const chu = await gui(TOKEN_CHU, { loai_bang_chung: 'bao_cao', noi_dung: 'Kết luận.' });
    expect(chu.status).toBe(201);
    expect((await chu.json<{ bao_cao_nguon: string }>()).bao_cao_nguon).toBe('owner');
  });

  it('đường đọc màn hình ticket thấy `bao_cao` + nguồn + đường dẫn/nội dung, không lộ `note`', async () => {
    await gui(TOKEN.manager, {
      loai_bang_chung: 'bao_cao',
      duong_dan: 'bao-cao/sai-32.md',
      noi_dung: 'Chọn B.',
      duong_dan_bao_cao: BAO_CAO_RV,
    });
    const res = await goiApi('/v1/man-hinh-ticket/ma/SAI-1', TOKEN_CHU);
    const than = await res.json<{ bang_chung: Record<string, unknown>[] }>();
    expect(than.bang_chung[0]).toMatchObject({
      loai: 'bao_cao',
      nhan_loai: 'Báo cáo',
      xac_minh: 'not_required',
      bao_cao_nguon: 'manager',
      bao_cao_duong_dan: 'bao-cao/sai-32.md',
      bao_cao_noi_dung: 'Chọn B.',
      bao_cao_reviewer: BAO_CAO_RV,
    });
  });

  it('Lịch sử ghi `bang_chung:bao_cao`', async () => {
    await gui(TOKEN_CHU, BAO_CAO);
    const d = await env.DB.prepare(
      "SELECT count(*) AS n FROM ticket_history WHERE ticket_id = ? AND truong = 'bang_chung:bao_cao'",
    )
      .bind(TK)
      .first<{ n: number }>();
    expect(d?.n).toBe(1);
  });

  /* --- cổng qua cửa ghi thật ---------------------------------------- */

  it('ticket CÓ code + chỉ `bao_cao` ⇒ EVIDENCE_REQUIRED', async () => {
    await gui(TOKEN.reviewer, BAO_CAO);
    const res = await doiXong();
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('EVIDENCE_REQUIRED');
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('cờ TICKET không code + `bao_cao` hợp lệ ⇒ chuyển Xong thành công', async () => {
    await batKhongCodeTicket();
    await gui(TOKEN.reviewer, BAO_CAO);
    expect((await doiXong()).status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('cờ DỰ ÁN không code + `bao_cao` của chủ ⇒ Xong', async () => {
    await env.DB.prepare('UPDATE project SET khong_code = 1 WHERE id = ?').bind(P).run();
    await gui(TOKEN_CHU, BAO_CAO);
    expect((await doiXong()).status).toBe(200);
  });

  it('không code + `bao_cao` hợp lệ ⇒ KHÔNG sinh mục Cần Chủ xác nhận (kể cả khi có `note` thường)', async () => {
    await batKhongCodeTicket();
    // Có `note` thường: không có đường `bao_cao` thì lần kiểm cổng này SINH mục.
    await gui(TOKEN_CHU, { loai_bang_chung: 'note', noi_dung: 'Ghi chú thường.' });
    await gui(TOKEN.reviewer, BAO_CAO);
    expect((await doiXong()).status).toBe(200);
    const d = await env.DB.prepare('SELECT count(*) AS n FROM can_chu WHERE xac_nhan_ticket_id = ?')
      .bind(TK)
      .first<{ n: number }>();
    expect(d?.n).toBe(0);
  });

  it('đối chứng: không code + chỉ `note` ⇒ chặn, và SINH mục xác nhận (19.12 câu 57 áp cho cờ ticket)', async () => {
    await batKhongCodeTicket();
    await gui(TOKEN_CHU, { loai_bang_chung: 'note', noi_dung: 'Ghi chú thường.' });
    const res = await doiXong();
    expect(res.status).toBe(422);
    const d = await env.DB.prepare('SELECT count(*) AS n FROM can_chu WHERE xac_nhan_ticket_id = ?')
      .bind(TK)
      .first<{ n: number }>();
    expect(d?.n).toBe(1);
  });

  it('`bao_cao` của reviewer RỒI reviewer thành người làm ⇒ cổng (lớp 2) không tính', async () => {
    await batKhongCodeTicket();
    await gui(TOKEN.reviewer, BAO_CAO);
    await dungLuotGiao('lg-rv2', TK, ID.reviewer, { loai: 'work', trang_thai: 'accepted' });
    expect(await congBangChungCua(env, env.DB)(TK)).toEqual({
      du: false,
      ly_do: LY_DO_BAO_CAO_CUA_NGUOI_LAM,
    });
  });

  it('`bao_cao` đã RÚT ⇒ không tính', async () => {
    await batKhongCodeTicket();
    const id = (await (await gui(TOKEN_CHU, BAO_CAO)).json<{ id: string }>()).id;
    const rut = await goiApi(`/v1/bang-chung/${id}/rut`, TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'Gửi nhầm' },
    });
    expect(rut.status).toBe(200);
    expect((await congBangChungCua(env, env.DB)(TK)).du).toBe(false);
  });

  /* --- cờ ticket.khong_code ------------------------------------------ */

  it('agent (kể cả manager/coordinator) gửi `khong_code` ⇒ FORBIDDEN, cờ không đổi', async () => {
    for (const vai of ['manager', 'coordinator', 'worker'] as const) {
      const res = await suaTicket(TOKEN[vai], { khong_code: true });
      expect(res.status, vai).toBe(403);
    }
    const d = await env.DB.prepare('SELECT khong_code FROM ticket WHERE id = ?').bind(TK).first();
    expect(d?.['khong_code']).toBe(0);
  });

  it('chủ bật được ⇒ cột = 1, có dòng Lịch sử, trạng thái KHÔNG đổi (19.12 câu 58)', async () => {
    const res = await suaTicket(TOKEN_CHU, { khong_code: true });
    expect(res.status).toBe(200);
    expect((await res.json<{ da_doi: string[] }>()).da_doi).toEqual(['khong_code']);
    const ls = await env.DB.prepare(
      "SELECT gia_tri_cu, gia_tri_moi FROM ticket_history WHERE ticket_id = ? AND truong = 'khong_code'",
    )
      .bind(TK)
      .first();
    expect(ls).toEqual({ gia_tri_cu: '0', gia_tri_moi: '1' });
    expect(await trangThaiCua(TK)).toBe('verifying');
    const t = await goiApi(`/v1/ticket/${TK}`, TOKEN_CHU);
    expect((await t.json<{ khong_code: boolean }>()).khong_code).toBe(true);
  });

  it('giá trị không phải boolean ⇒ INVALID_INPUT', async () => {
    expect((await suaTicket(TOKEN_CHU, { khong_code: 'co' })).status).toBe(422);
  });

  it('cổng đọc cờ ticket MỖI LẦN kiểm (19.10): tắt lại ⇒ bao_cao hết tác dụng', async () => {
    await dungBangChung('ev-bc', TK, 'note', { noi_dung: 'x', gui_luc: 1 });
    await env.DB.prepare("UPDATE ticket SET khong_code = 1 WHERE id = ?").bind(TK).run();
    // Dòng note thường (không phải báo cáo) ⇒ cần chủ xác nhận.
    expect((await congBangChungCua(env, env.DB)(TK)).ly_do).toBe(LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN);
    await gui(TOKEN_CHU, BAO_CAO);
    expect((await congBangChungCua(env, env.DB)(TK)).du).toBe(true);
    await env.DB.prepare("UPDATE ticket SET khong_code = 0 WHERE id = ?").bind(TK).run();
    expect((await congBangChungCua(env, env.DB)(TK)).ly_do).toBe(LY_DO_THIEU_COMMIT_HOAC_DEPLOY);
  });
});
