/**
 * **Ticket sang Xong ⇒ mục xác nhận TỰ SINH còn `Chờ` tự đóng** — BAT-40,
 * `spec-questions.md` #163 (Chủ chốt T-38 = A, T-43 = A), SPEC mục 7, mục 8,
 * 19.12 câu 57. Migration 0028.
 *
 *   A. Migration 0028: chỉ mệnh đề 7 đổi (so văn bản với 0021), mục tạo tay vẫn
 *      bị chặn, mục tự sinh được phép; dữ liệu cũ còn nguyên; rollback.
 *   B. Mọi đường sang Xong (HTTP chủ, CLI, chủ ép Xong, nộp, nghiệm thu, tự lên
 *      Xong của Cron, cha tự kiểm cổng khi con cuối kết) đóng mục.
 *   C. Không đụng: mục tạo tay, mục của ticket khác, mục đã Bỏ qua / đã xử lý.
 *   D. Nguyên tử: cùng `db.batch()` với lệnh đưa ticket sang Xong.
 *   E. `chuDaXacNhan` trả `false` với mục đóng tự động.
 *
 * Mọi ca đi đường thật (HTTP qua cửa ghi, CLI thật, Cron thật). Không gọi mạng:
 * nguồn xác minh là `datNguonGiaLap`.
 */

import { SELF, applyD1Migrations, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { MA_THOAT } from '@baton/shared';
import { chayCli, type MoiTruongCli } from '@baton/cli';
import { chayCron } from '../src/index.js';
import { chuDaXacNhan, mucXacNhanCua } from '../src/muc-xac-nhan.js';
import { boChuThichDongKieuD1, tachCauLenh } from './tien-xu-ly-d1.js';
import {
  TOKEN_CHU,
  WS,
  datNguonGiaLap,
  dungAgentCoToken,
  dungBangChung,
  dungCanChu,
  dungDuAn,
  dungLienKet,
  dungLuotGiao,
  dungTicket,
  dungWorkspace,
  goiApi,
  noiCanChuTicket,
  trangThaiCua,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ (BAT-53, xem `caQuaSo`): ca hết giờ không để
// lệnh CLI còn dở bắn request vào lúc pool pop storage cô lập.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const TK = 'tk-pj-SAI-1';
const KET_QUA = 'ticket đã Xong';
const HASH = 'a1b2c3d4e5f6a7b8';
const REPO = 'chu/baton';
const WK = 'ag-wk-bat40';
const TOKEN_WK = 'bt_t_wk_bat40_zz';

interface Muc {
  id: string;
  trang_thai: string;
  ket_qua: string | null;
  ket_luan_review: string | null;
  ly_do_bo_qua: string | null;
  xu_ly_luc: number | null;
  cap_nhat_luc: number;
}

async function mucCua(ticket_id = TK): Promise<Muc | null> {
  return env.DB.prepare(
    `SELECT id, trang_thai, ket_qua, ket_luan_review, ly_do_bo_qua, xu_ly_luc, cap_nhat_luc
       FROM can_chu WHERE workspace_id = ? AND xac_nhan_ticket_id = ?`,
  )
    .bind(WS, ticket_id)
    .first<Muc>();
}

async function mucTheoId(id: string): Promise<Muc | null> {
  return env.DB.prepare(
    `SELECT id, trang_thai, ket_qua, ket_luan_review, ly_do_bo_qua, xu_ly_luc, cap_nhat_luc
       FROM can_chu WHERE id = ?`,
  )
    .bind(id)
    .first<Muc>();
}

function lenXong(ticket_id = TK, than: Record<string, unknown> = {}): Promise<Response> {
  return goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
    method: 'POST',
    than: { trang_thai: 'done', ...than },
  });
}

/** Bằng chứng `bao_cao` do CHỦ ký (nguồn `owner`) — mở cổng ticket không code (T-31). */
async function baoCaoChu(ticket_id = TK, id = `bc-${ticket_id}`): Promise<void> {
  const t = Date.now();
  await env.DB.prepare(
    `INSERT INTO evidence (id, workspace_id, ticket_id, loai, nguoi_gui_loai, gui_luc, xac_minh,
                           duong_dan, bao_cao_nguon, tao_luc, cap_nhat_luc)
     VALUES (?, ?, ?, 'file', 'owner', ?, 'not_required', 'bao-cao/bat40.md', 'owner', ?, ?)`,
  )
    .bind(id, WS, ticket_id, t, t, t)
    .run();
}

/** Ticket có `file` + lần kiểm cổng bị chặn ⇒ mục tự sinh `open` (câu 57). */
async function sinhMucMo(ticket_id = TK): Promise<Muc> {
  await dungBangChung(`ev-f-${ticket_id}`, ticket_id, 'file', { gui_luc: 1_000 });
  const r = await lenXong(ticket_id);
  // 422 EVIDENCE_REQUIRED; ticket cha còn con chưa kết thì 409 — cả hai vẫn ghi
  // (lỗi sau ghi) và vẫn là một lần kiểm cổng.
  expect([409, 422]).toContain(r.status);
  const m = await mucCua(ticket_id);
  expect(m?.trang_thai).toBe('open');
  return m!;
}

/** Khẳng định: mục tự sinh đã tự đóng đúng chốt #163. */
async function kyVongDaDong(ticket_id = TK): Promise<void> {
  const m = await mucCua(ticket_id);
  expect(m?.trang_thai).toBe('resolved');
  expect(m?.ket_qua).toBe(KET_QUA);
  expect(m?.ket_luan_review).toBeNull();
  expect(m?.ly_do_bo_qua).toBeNull();
  expect(m?.xu_ly_luc).toBeTypeOf('number');
}

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn('SAI', 'Sample');
  await dungTicket(P, 1, 'Viết tài liệu nghiệm thu', { trang_thai: 'verifying' });
  await env.DB.prepare('UPDATE project SET khong_code = 1 WHERE id = ?').bind(P).run();
});

/* ================================================================== *
 * A. Migration 0028
 * ================================================================== */

/** Gom khoảng trắng để so văn bản SQL qua hai bộ tách câu khác nhau. */
function gon(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
}

function cauTrigger(queries: readonly string[], ten: string): string {
  const c = queries.find((q) => gon(q).startsWith(`CREATE TRIGGER ${ten} `));
  expect(c, ten).toBeDefined();
  return gon(c!);
}

const MENH_DE_7_CU = 'AND NEW.ket_luan_review IS NULL)';
const MENH_DE_7_MOI = 'AND NEW.ket_luan_review IS NULL AND NEW.xac_nhan_ticket_id IS NULL)';

async function sqlTriggerTrongDb(db: D1Database, ten: string): Promise<string> {
  const d = await db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?")
    .bind(ten)
    .first<{ sql: string }>();
  return gon(d?.sql ?? '');
}

describe('migration 0028 — chỉ nới mệnh đề 7 cho mục tự sinh', () => {
  const m21 = (): string[] =>
    env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0021_'))!.queries;
  const m28 = (): string[] => {
    const ds = env.TEST_MIGRATIONS.filter((m) => m.name.startsWith('0028_'));
    expect(ds).toHaveLength(1);
    return ds[0]!.queries;
  };

  it('được nạp (glob), và chỉ có DROP + CREATE lại đúng cặp trigger', () => {
    const q = m28().map(gon);
    expect(q).toHaveLength(4);
    expect(q[0]).toBe('DROP TRIGGER tg_can_chu_xu_ly_them');
    expect(q[1]).toBe('DROP TRIGGER tg_can_chu_xu_ly_sua');
    expect(q[2]).toMatch(/^CREATE TRIGGER tg_can_chu_xu_ly_them /);
    expect(q[3]).toMatch(/^CREATE TRIGGER tg_can_chu_xu_ly_sua /);
  });

  it('mọi mệnh đề khác GIỮ NGUYÊN TỪNG CHỮ so với 0021; chỉ mệnh đề 7 thêm vế `xac_nhan_ticket_id IS NULL`', async () => {
    for (const ten of ['tg_can_chu_xu_ly_them', 'tg_can_chu_xu_ly_sua']) {
      const cu = cauTrigger(m21(), ten);
      const moi = cauTrigger(m28(), ten);
      expect(cu.split(MENH_DE_7_CU)).toHaveLength(2);
      expect(moi).toBe(cu.replace(MENH_DE_7_CU, MENH_DE_7_MOI));
      // Và đó là bản đang sống trong DB.
      expect(await sqlTriggerTrongDb(env.DB, ten)).toBe(moi);
    }
  });

  it('mục `review` TẠO TAY (không mốc) `resolved` không kết luận ⇒ VẪN bị chặn (UPDATE và INSERT)', async () => {
    await dungCanChu('ct-tay', { loai: 'review', project_id: P });
    const loi = await env.DB.prepare(
      `UPDATE can_chu SET trang_thai = 'resolved', ket_qua = 'x', xu_ly_luc = 1 WHERE id = 'ct-tay'`,
    )
      .run()
      .catch(String);
    expect(loi).toMatch(/INVALID_INPUT/);

    const loi_them = await env.DB.prepare(
      `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
                            can_tty, tao_luc, cap_nhat_luc, ket_qua, xu_ly_luc)
       VALUES ('ct-tay-2', ?, 900, 'x', ?, 'today', 'review', 'resolved', 0, 1, 1, 'x', 1)`,
    )
      .bind(WS, P)
      .run()
      .catch(String);
    expect(loi_them).toMatch(/INVALID_INPUT/);
  });

  it('mục TỰ SINH (có mốc) `resolved` với `ket_luan_review` NULL ⇒ được phép', async () => {
    const m = await sinhMucMo();
    await env.DB.prepare(
      `UPDATE can_chu SET trang_thai = 'resolved', ket_qua = ?, xu_ly_luc = 5 WHERE id = ?`,
    )
      .bind(KET_QUA, m.id)
      .run();
    expect((await mucTheoId(m.id))?.trang_thai).toBe('resolved');
  });

  it('mệnh đề khác vẫn chặn cả mục tự sinh: resolved thiếu `ket_qua`, open mang kết luận, kết luận lạ', async () => {
    const m = await sinhMucMo();
    for (const sql of [
      `UPDATE can_chu SET trang_thai = 'resolved', xu_ly_luc = 5 WHERE id = ?`,
      `UPDATE can_chu SET ket_luan_review = 'dat' WHERE id = ?`,
      `UPDATE can_chu SET trang_thai = 'skipped', xu_ly_luc = 5 WHERE id = ?`,
      `UPDATE can_chu SET trang_thai = 'resolved', ket_qua = 'x' WHERE id = ?`,
    ]) {
      expect(await env.DB.prepare(sql).bind(m.id).run().catch(String), sql).toMatch(/INVALID_INPUT/);
    }
    expect(
      await env.DB.prepare(
        `UPDATE can_chu SET trang_thai = 'resolved', ket_qua = 'x', xu_ly_luc = 5, ket_luan_review = 'khac' WHERE id = ?`,
      )
        .bind(m.id)
        .run()
        .catch(String),
    ).toMatch(/CHECK/);
  });

  it('dữ liệu TRƯỚC 0028 còn nguyên sau khi áp; rollback dựng lại y như 0021 (DB thử riêng)', async () => {
    const db = env.DB_TIEN_XU_LY;
    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((m) => m.name < '0028'),
    );
    await db.batch([
      db.prepare("INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES ('w', 'T', 1, 1)"),
      db.prepare(
        "INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc) VALUES ('p', 'w', 'S', 'SAI', 'active', 1, 1)",
      ),
      db.prepare(
        `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
           chiu_trach_nhiem_loai, nguoi_tao_loai, tao_luc, cap_nhat_luc)
         VALUES ('t', 'w', 'p', 1, 'Cũ', 'verifying', 'none', 4, 'owner', 'owner', 1, 1)`,
      ),
      db.prepare(
        `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
                              can_tty, tao_luc, cap_nhat_luc, xac_nhan_ticket_id)
         VALUES ('a', 'w', 1, 'Tự sinh', 'p', 'today', 'review', 'open', 0, 1, 1, 't')`,
      ),
      db.prepare(
        `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
                              can_tty, tao_luc, cap_nhat_luc, ket_qua, ket_luan_review, xu_ly_luc)
         VALUES ('b', 'w', 2, 'Tay đã xử lý', 'p', 'today', 'review', 'resolved', 0, 1, 1, 'Đạt', 'dat', 2)`,
      ),
    ]);
    const SELECT_MUC =
      'SELECT id, trang_thai, ket_qua, ket_luan_review, xu_ly_luc FROM can_chu ORDER BY id';
    const truoc = (await db.prepare(SELECT_MUC).all()).results;

    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((m) => m.name.startsWith('0028_')),
    );
    expect((await db.prepare(SELECT_MUC).all()).results).toEqual(truoc);

    // Sau 0028: mục tự sinh đóng được không kết luận.
    await db
      .prepare(`UPDATE can_chu SET trang_thai = 'resolved', ket_qua = ?, xu_ly_luc = 9 WHERE id = 'a'`)
      .bind(KET_QUA)
      .run();

    // Rollback (thư mục con, không tự áp) áp được và dựng lại đúng 0021.
    const rb = env.TEST_VAN_BAN_ROLLBACK.find(
      (f) => f.ten === '0028_can_chu_tu_dong_xac_nhan.rollback.sql',
    );
    expect(rb).toBeDefined();
    expect(env.TEST_MIGRATIONS.map((m) => m.name)).not.toContain(rb!.ten);
    const cau = tachCauLenh(boChuThichDongKieuD1(rb!.noi_dung));
    expect(cau).toHaveLength(4);
    for (const c of cau) await db.prepare(c).run();
    for (const ten of ['tg_can_chu_xu_ly_them', 'tg_can_chu_xu_ly_sua']) {
      expect(await sqlTriggerTrongDb(db, ten)).toBe(cauTrigger(m21(), ten));
    }
    // Dữ liệu đã đóng vẫn còn; nhưng một lần đóng-không-kết-luận MỚI lại bị chặn.
    expect(await db.prepare("SELECT trang_thai FROM can_chu WHERE id = 'a'").first()).toEqual({
      trang_thai: 'resolved',
    });
    await db.prepare("UPDATE can_chu SET trang_thai = 'open', ket_qua = NULL, xu_ly_luc = NULL WHERE id = 'a'").run();
    expect(
      await db
        .prepare(`UPDATE can_chu SET trang_thai = 'resolved', ket_qua = 'x', xu_ly_luc = 9 WHERE id = 'a'`)
        .run()
        .catch(String),
    ).toMatch(/INVALID_INPUT/);
  });
});

/* ================================================================== *
 * B. Mọi đường sang Xong đóng mục tự sinh
 * ================================================================== */

describe('#163 — ticket sang Xong bằng MỌI đường ⇒ mục tự sinh `open` tự đóng', () => {
  it('chủ đổi Xong (HTTP) khi cổng đủ nhờ `bao_cao` ⇒ mục `resolved`, kết quả "ticket đã Xong", không kết luận', async () => {
    await sinhMucMo();
    await baoCaoChu();
    expect((await lenXong()).status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
    await kyVongDaDong();
  });

  it('CLI `baton status SAI-1 done` ⇒ mục tự đóng', async () => {
    await sinhMucMo();
    await baoCaoChu();
    const ra: string[] = [];
    const mt: MoiTruongCli = {
      env: { BATON_URL: 'https://baton.test', BATON_TOKEN: TOKEN_CHU },
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void ra.push(d),
      fetch: (u, i) => SELF.fetch(u, i),
      docFile: () => Promise.reject(new Error('không đọc file')),
    };
    expect(await chayCli(['status', 'SAI-1', 'done'], mt), ra.join('\n')).toBe(MA_THOAT.xong);
    expect(await trangThaiCua(TK)).toBe('done');
    await kyVongDaDong();
  });

  it('chủ ÉP Xong kèm lý do (không bằng chứng đủ) ⇒ mục tự đóng', async () => {
    await sinhMucMo();
    expect((await lenXong(TK, { ep: true, ly_do: 'Chủ đã xem ngoài Baton' })).status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
    await kyVongDaDong();
  });

  it('chủ ép Xong khi CHƯA có mục (lần kiểm cổng ấy sinh mục) ⇒ không còn mục `open` nào treo', async () => {
    await dungBangChung('ev-f', TK, 'file');
    expect((await lenXong(TK, { ep: true, ly_do: 'Xong ngoài Baton' })).status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
    // Lần kiểm cổng của lệnh ép SINH mục (câu 57) trong cùng batch; câu tự đóng
    // đứng sau bộ sinh nên mục ra đời rồi đóng ngay — không treo ở khối Chờ.
    expect(await mucCua()).not.toBeNull();
    await kyVongDaDong();
    const d = await env.DB.prepare(
      "SELECT count(*) AS n FROM can_chu WHERE workspace_id = ? AND trang_thai = 'open'",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(d?.n).toBe(0);
  });

  it('worker NỘP `done` khi cổng đủ ⇒ ticket Xong, mục tự đóng', async () => {
    await sinhMucMo();
    await baoCaoChu();
    await dungAgentCoToken({ id: WK, ten: 'W', vai_tro: 'worker', token: TOKEN_WK, du_an: [P] });
    await dungLuotGiao('lg-nop', TK, WK, { loai: 'work', trang_thai: 'in_progress', nhan_luc: 1 });
    const r = await goiApi('/v1/luot-giao/lg-nop/nop', TOKEN_WK, {
      method: 'POST',
      than: { ket_qua: 'done' },
    });
    expect(r.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
    await kyVongDaDong();
  });

  it('người giao NGHIỆM THU `accepted` khi cổng đủ ⇒ ticket Xong, mục tự đóng', async () => {
    await sinhMucMo();
    await baoCaoChu();
    await dungAgentCoToken({ id: WK, ten: 'W', vai_tro: 'worker', token: TOKEN_WK, du_an: [P] });
    await dungLuotGiao('lg-nt', TK, WK, {
      loai: 'work',
      trang_thai: 'submitted',
      ket_qua: 'done',
      nop_luc: 2,
      nhan_luc: 1,
    });
    const r = await goiApi('/v1/luot-giao/lg-nt/nghiem-thu', TOKEN_CHU, {
      method: 'POST',
      than: { ket_qua: 'accepted' },
    });
    expect(r.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
    await kyVongDaDong();
  });

  it('Cron TỰ LÊN XONG (d.221, không ai gõ lệnh) ⇒ mục tự đóng', async () => {
    await sinhMucMo();
    await baoCaoChu();
    datNguonGiaLap({ commit: { [`${REPO}@${HASH}`]: 'merged' } });
    await dungBangChung('ev-c', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: Date.now() - 1,
    });
    const kq = await chayCron({ scheduledTime: Date.UTC(2026, 9, 6, 3, 1) }, env);
    expect(kq.thu_lai.so_tu_len_xong).toBe(1);
    expect(await trangThaiCua(TK)).toBe('done');
    await kyVongDaDong();
  });

  it('CHA tự kiểm cổng khi con cuối kết (19.11 d.559) ⇒ mục của CHA tự đóng', async () => {
    const con = await dungTicket(P, 2, 'Con', { trang_thai: 'verifying' });
    await dungLienKet(TK, con, 'parent');
    await sinhMucMo(TK); // cha bị chặn (con chưa kết) ⇒ vẫn sinh mục của cha
    await baoCaoChu(TK);
    await baoCaoChu(con);

    expect((await lenXong(con)).status).toBe(200);
    expect(await trangThaiCua(con)).toBe('done');
    expect(await trangThaiCua(TK)).toBe('done');
    await kyVongDaDong(TK);
  });

  it('Cron (#ghiMotXacMinh) đưa CON tự lên Xong ⇒ CHA tự kiểm cổng lên Xong ⇒ mục của CHA tự đóng', async () => {
    const con = await dungTicket(P, 2, 'Con', { trang_thai: 'verifying' });
    await dungLienKet(TK, con, 'parent');
    await sinhMucMo(TK); // cha bị chặn (con chưa kết) ⇒ sinh mục của cha
    await baoCaoChu(TK);
    await baoCaoChu(con);
    // Không ai gõ lệnh cho con: chỉ có kết luận xác minh `merged` của Cron.
    datNguonGiaLap({ commit: { [`${REPO}@${HASH}`]: 'merged' } });
    await dungBangChung('ev-c-con', con, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: Date.now() - 1,
    });

    const kq = await chayCron({ scheduledTime: Date.UTC(2026, 9, 6, 3, 1) }, env);
    expect(kq.thu_lai.so_tu_len_xong).toBe(1);
    expect(await trangThaiCua(con)).toBe('done');
    expect(await trangThaiCua(TK)).toBe('done');
    await kyVongDaDong(TK);
  });
});

/* ================================================================== *
 * C. Không đụng gì khác
 * ================================================================== */

describe('#163 — KHÔNG đụng: mục tạo tay, mục ticket khác, mục đã Bỏ qua / đã xử lý', () => {
  it('mục `review` TẠO TAY nối ticket qua `can_chu_ticket` vẫn `open`', async () => {
    await sinhMucMo();
    await dungCanChu('ct-tay', { loai: 'review', project_id: P });
    await noiCanChuTicket('ct-tay', TK);
    const truoc = await mucTheoId('ct-tay');

    await baoCaoChu();
    expect((await lenXong()).status).toBe(200);
    await kyVongDaDong();
    expect(await mucTheoId('ct-tay')).toEqual(truoc);
  });

  it('mục tự sinh của TICKET KHÁC vẫn `open`', async () => {
    const tk2 = await dungTicket(P, 2, 'Việc khác', { trang_thai: 'verifying' });
    const m2 = await sinhMucMo(tk2);
    await sinhMucMo(TK);

    await baoCaoChu(TK);
    expect((await lenXong(TK)).status).toBe(200);
    await kyVongDaDong(TK);
    expect(await mucTheoId(m2.id)).toEqual(m2);
  });

  it('mục đã BỎ QUA giữ nguyên `skipped`, lý do và mốc cũ', async () => {
    const m = await sinhMucMo();
    expect(
      (
        await goiApi(`/v1/can-chu/${m.id}/bo-qua`, TOKEN_CHU, {
          method: 'POST',
          than: { ly_do: 'Chưa cần xem' },
        })
      ).status,
    ).toBe(200);
    const truoc = await mucTheoId(m.id);
    expect(truoc?.trang_thai).toBe('skipped');

    await baoCaoChu();
    expect((await lenXong()).status).toBe(200);
    expect(await mucTheoId(m.id)).toEqual(truoc);
  });

  it('mục đã XỬ LÝ "Cần sửa" giữ nguyên kết luận, kết quả và mốc cũ', async () => {
    const m = await sinhMucMo();
    expect(
      (
        await goiApi(`/v1/can-chu/${m.id}/xu-ly`, TOKEN_CHU, {
          method: 'POST',
          than: { ket_luan: 'can_sua', ghi_them: 'Thiếu mục 3' },
        })
      ).status,
    ).toBe(200);
    const truoc = await mucTheoId(m.id);
    expect(truoc?.ket_luan_review).toBe('can_sua');

    await baoCaoChu();
    expect((await lenXong()).status).toBe(200);
    expect(await mucTheoId(m.id)).toEqual(truoc);
  });

  it('đường KHÔNG sang Xong (vd Đang làm) không đóng mục', async () => {
    const m = await sinhMucMo();
    const r = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(r.status).toBe(200);
    expect(await mucTheoId(m.id)).toEqual(m);
  });
});

/* ================================================================== *
 * D. Nguyên tử — cùng một `db.batch()`
 * ================================================================== */

describe('#163 — nguyên tử: đóng mục nằm CÙNG batch với lệnh đưa ticket sang Xong', () => {
  it('cổng chặn (không `bao_cao`) ⇒ ticket ở lại Chờ kiểm chứng, mục vẫn `open`', async () => {
    const m = await sinhMucMo();
    expect((await lenXong()).status).toBe(422);
    expect(await trangThaiCua(TK)).toBe('verifying');
    expect(await mucTheoId(m.id)).toEqual(m);
  });

  it('câu đưa ticket sang Xong hỏng ⇒ mục vẫn `open`', async () => {
    const m = await sinhMucMo();
    await baoCaoChu();
    await env.DB.prepare(
      `CREATE TRIGGER tg_thu_chan_xong BEFORE UPDATE OF trang_thai ON ticket
       WHEN NEW.trang_thai = 'done' BEGIN SELECT RAISE(ABORT, 'INVALID_INPUT: chan thu'); END`,
    ).run();
    expect((await lenXong()).status).not.toBe(200);
    expect(await trangThaiCua(TK)).toBe('verifying');
    expect(await mucTheoId(m.id)).toEqual(m);
  });

  it('câu đóng mục hỏng ⇒ ticket KHÔNG sang Xong (cùng thành, cùng hỏng)', async () => {
    const m = await sinhMucMo();
    await baoCaoChu();
    await env.DB.prepare(
      `CREATE TRIGGER tg_thu_chan_dong BEFORE UPDATE OF trang_thai ON can_chu
       WHEN NEW.trang_thai = 'resolved' AND NEW.xac_nhan_ticket_id IS NOT NULL
       BEGIN SELECT RAISE(ABORT, 'INVALID_INPUT: chan thu'); END`,
    ).run();
    expect((await lenXong()).status).not.toBe(200);
    expect(await trangThaiCua(TK)).toBe('verifying');
    expect(await mucTheoId(m.id)).toEqual(m);
  });
});

/* ================================================================== *
 * E. `chuDaXacNhan` với mục đóng tự động
 * ================================================================== */

describe('#163 — mục đóng tự động KHÔNG phải "chủ đã xác nhận"', () => {
  it('`chuDaXacNhan` trả `false` (đòi `dat`)', async () => {
    await sinhMucMo();
    await baoCaoChu();
    expect((await lenXong()).status).toBe(200);
    const m = await mucXacNhanCua(env.DB, WS, TK);
    expect(m?.trang_thai).toBe('resolved');
    expect(m?.ket_luan_review).toBeNull();
    expect(chuDaXacNhan(m)).toBe(false);
  });
});
