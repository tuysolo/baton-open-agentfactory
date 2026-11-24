/**
 * Migration D1 và các luật SPEC được ép ở tầng cơ sở dữ liệu.
 * SPEC mục 1 (workspace), 2 (mã dự án), 3+15 (token băm), 4 (ticket, lịch sử).
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  LOI_MA_DU_AN_SAI_DINH_DANG,
  MAU_MA_DU_AN,
  TEN_CHU_MAC_DINH,
  bamToken,
  bonKyTuCuoi,
  kiemMaDuAn,
  kiemTieuDeTicket,
  laMaDuAnHopLe,
  maTicket,
  sinhToken,
} from '@baton/shared';
import { WS, dungDuAn, dungTicket, dungWorkspace } from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const BANG_PHAI_CO = [
  'workspace',
  'agent',
  'project',
  'agent_project',
  'agent_permission',
  'bo_dem',
  'ticket',
  'ticket_link',
  'ticket_label',
  'ticket_history',
  'comment',
  // Phần 2 — SPEC mục 5 (migration 0004).
  'luot_giao',
  // Phần 2 lượt 3 — SPEC mục 6 (migration 0006).
  'phien',
  // Phần 2 lượt 4 — SPEC mục 6 d.190, d.191 (migration 0007).
  'phien_hoat_dong',
  'phien_ke_hoach',
  // Phần 3 lượt 1 — SPEC mục 7 (migration 0009).
  'evidence',
  // Phần 3 chốt T-69 — kho thông báo **trong app** (migration 0012).
  // SPEC mục 12 d.339 ("trong app (chuông)") + 19.12 câu 46: "Thông báo ghi vào
  // kho thông báo trong app; gửi Telegram thật là phần 7."
  'thong_bao',
  // Phần 4 lượt 1 — SPEC mục 8 (migration 0013). Lõi dữ liệu Cần Chủ: mục, phương
  // án của loại `Quyết định`, file/link của loại `Chủ review`, và bảng nối ticket
  // liên quan ("nhiều" — mục 8 d.240).
  'can_chu',
  'can_chu_phuong_an',
  'can_chu_file',
  'can_chu_ticket',
  // Phần 4 lượt 2a — SPEC mục 10 (migration 0014). Nhật ký quyết định: dòng
  // **chỉ thêm** (d.309) và bảng con căn cứ (d.308: T-số, mã ticket, dòng cũ).
  'nhat_ky',
  'nhat_ky_can_cu',
  // Phần 6 lượt 1 — SPEC mục 15 d.415 (migration 0017). Đường đăng nhập của chủ:
  // tài khoản (mật khẩu PBKDF2 + secret TOTP + chống dò) và phiên đăng nhập 30
  // ngày, id lưu dạng **băm** như token agent.
  'chu_tai_khoan',
  'chu_phien',
  // Phần 6 lượt 6 — SPEC mục 9 d.294–303 (migration 0018). Hồ sơ dự án: các mục
  // markdown (d.296–298), lịch sử phiên bản (d.303), danh sách "Lỗi đã gặp" chỉ
  // thêm (d.299), và trang "Luật chung" của workspace (d.301).
  'project_ho_so',
  'project_ho_so_ban',
  'project_loi_da_gap',
  'luat_chung',
  // Phần 7 việc B — SPEC mục 11 d.322–336 (migration 0020). Báo cáo sáng /
  // handoff tối lưu **theo ngày** (d.336 "xem lại được, xuất ra markdown được"),
  // và 3 việc trọng tâm của một ngày trỏ tới **ticket** (d.324 + d.331 "đạt hay
  // chưa **theo trạng thái các ticket được gắn là trọng tâm**").
  'bao_cao',
  'trong_tam',
  // BAT-16 — SPEC mục 12 d.348 (migration 0026). Công tắc từng loại thông báo;
  // không có dòng = bật.
  'cai_dat_thong_bao',
  // Bản đồ L1 — SPEC 20.1 (migration 0029). Lịch sử chỉ thêm của trường dự án
  // (`uu_tien`, `dang_day`, `duy_tri`, `ten_ngan`, `nhom`) và giới hạn WIP.
  'project_history',
];

describe('migration áp được', () => {
  it('mọi bảng của phần 1 đều tồn tại', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
    ).all<{ name: string }>();
    const ten = results.map((r) => r.name).sort();
    expect(ten).toEqual([...BANG_PHAI_CO].sort());
  });

  it('mọi bảng dữ liệu đều có cột workspace_id (SPEC mục 1, 18)', async () => {
    for (const bang of BANG_PHAI_CO.filter((b) => b !== 'workspace')) {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${bang})`).all<{ name: string }>();
      expect(
        results.map((r) => r.name),
        `bảng ${bang}`,
      ).toContain('workspace_id');
    }
  });

  it('có đủ index cho mốc 200.000 ticket', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ticket'",
    ).all<{ name: string }>();
    const ten = results.map((r) => r.name);
    for (const i of [
      'ux_ticket_so',
      'ix_ticket_du_an',
      'ix_ticket_ws_trang_thai',
      'ix_ticket_chiu_trach_nhiem',
      'ix_ticket_han',
      'ix_ticket_xong_luc',
      'ix_ticket_ma_cu',
      'ix_ticket_da_xoa',
    ]) {
      expect(ten, `index ${i}`).toContain(i);
    }
  });

  it('danh sách ticket dùng index, không quét toàn bảng', async () => {
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM ticket
       WHERE workspace_id = ? AND project_id = ? AND trang_thai = 'todo' AND xoa_luc IS NULL
       ORDER BY hang_uu_tien ASC, tao_luc DESC, id DESC
       LIMIT 50`,
    )
      .bind(WS, 'pj-SAI')
      .all<{ detail: string }>();
    const ke_hoach = results.map((r) => r.detail).join(' | ');
    expect(ke_hoach).toContain('ix_ticket_du_an');
    expect(ke_hoach).not.toContain('SCAN ticket');
  });
});

describe('khoá ngoài được D1 ép thật', () => {
  it('không chèn được ticket trỏ tới dự án không tồn tại', async () => {
    await dungWorkspace();
    await expect(dungTicket('pj-khong-co', 1)).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('không chèn được lịch sử trỏ tới agent không tồn tại', async () => {
    await dungWorkspace();
    const duAn = await dungDuAn('SAI');
    const ticket = await dungTicket(duAn, 1);
    await expect(
      env.DB.prepare(
        `INSERT INTO ticket_history (id, workspace_id, ticket_id, tac_gia_loai, tac_gia_agent_id, luc, truong)
         VALUES ('ls-x', ?, ?, 'agent', 'ag-khong-co', 0, 'tieu_de')`,
      )
        .bind(WS, ticket)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });
});

describe('SPEC mục 1 — workspace', () => {
  it('tên chủ mặc định là "Chủ"', async () => {
    const t = Date.now();
    await env.DB.prepare('INSERT INTO workspace (id, tao_luc, cap_nhat_luc) VALUES (?, ?, ?)')
      .bind('ws-mac-dinh', t, t)
      .run();
    const dong = await env.DB.prepare('SELECT ten_chu FROM workspace WHERE id = ?')
      .bind('ws-mac-dinh')
      .first<{ ten_chu: string }>();
    expect(dong?.ten_chu).toBe(TEN_CHU_MAC_DINH);
    expect(TEN_CHU_MAC_DINH).toBe('Chủ');
  });
});

describe('SPEC mục 2 — mã dự án', () => {
  beforeEach(async () => {
    await dungWorkspace();
  });

  it('chỉ nhận 2–6 chữ A–Z', () => {
    for (const ma of ['SAI', 'IN', 'COSXYZ', 'AB']) expect(laMaDuAnHopLe(ma)).toBe(true);
    for (const ma of ['A', 'ABCDEFG', 'sai', 'SA1', 'SA-I', 'SÀI', '']) {
      expect(laMaDuAnHopLe(ma), ma).toBe(false);
    }
    expect(MAU_MA_DU_AN.source).toBe('^[A-Z]{2,6}$');
  });

  it('sai định dạng thì báo đúng chữ của SPEC', () => {
    expect(() => kiemMaDuAn('sai')).toThrowError(LOI_MA_DU_AN_SAI_DINH_DANG);
    expect(LOI_MA_DU_AN_SAI_DINH_DANG).toBe('Mã chỉ gồm 2–6 chữ A–Z');
  });

  it('mã duy nhất trong workspace', async () => {
    await dungDuAn('SAI');
    await expect(dungDuAn('SAI', 'Sample 2')).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it('mã KHÔNG đổi được sau khi tạo', async () => {
    const id = await dungDuAn('SAI');
    await expect(
      env.DB.prepare('UPDATE project SET ma = ? WHERE id = ?').bind('INC', id).run(),
    ).rejects.toThrow(/khong doi duoc sau khi tao/);

    // Ghi lại đúng mã cũ thì không bị chặn (không phải thay đổi).
    await env.DB.prepare('UPDATE project SET ma = ? WHERE id = ?').bind('SAI', id).run();
    // Tên thì đổi được.
    await env.DB.prepare('UPDATE project SET ten = ? WHERE id = ?').bind('Tên mới', id).run();
    const dong = await env.DB.prepare('SELECT ma, ten FROM project WHERE id = ?')
      .bind(id)
      .first<{ ma: string; ten: string }>();
    expect(dong).toEqual({ ma: 'SAI', ten: 'Tên mới' });
  });

  it('"bắt buộc review" mặc định BẬT, "không code" mặc định tắt (SPEC mục 7, 9)', async () => {
    const id = await dungDuAn('BAT');
    const dong = await env.DB.prepare(
      'SELECT bat_buoc_review, khong_code, trang_thai FROM project WHERE id = ?',
    )
      .bind(id)
      .first<{ bat_buoc_review: number; khong_code: number; trang_thai: string }>();
    expect(dong).toEqual({ bat_buoc_review: 1, khong_code: 0, trang_thai: 'active' });
  });

  it('chỉ nhận 3 trạng thái dự án của SPEC mục 0.1', async () => {
    const id = await dungDuAn('TTT');
    for (const tt of ['active', 'paused', 'archived']) {
      await env.DB.prepare('UPDATE project SET trang_thai = ? WHERE id = ?').bind(tt, id).run();
    }
    await expect(
      env.DB.prepare('UPDATE project SET trang_thai = ? WHERE id = ?').bind('dang_chay', id).run(),
    ).rejects.toThrow(/constraint/i);
  });
});

describe('SPEC mục 3 + 15 — token agent chỉ lưu dạng băm', () => {
  beforeEach(async () => {
    await dungWorkspace();
  });

  it('bảng agent không có cột nào chứa token gốc', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(agent)').all<{ name: string }>();
    const cot = results.map((r) => r.name);
    expect(cot).toContain('token_bam');
    expect(cot).toContain('token_bon_cuoi');
    expect(cot).toContain('token_tao_luc');
    expect(cot).toContain('token_thu_hoi_luc');
    expect(cot).not.toContain('token');
  });

  it('băm SHA-256 ổn định, 64 ký tự hex, và không chứa token gốc', async () => {
    const token = sinhToken();
    const bam = await bamToken(token);
    expect(bam).toMatch(/^[0-9a-f]{64}$/);
    expect(bam).toBe(await bamToken(token));
    expect(bam).not.toContain(token);
    expect(await bamToken(sinhToken())).not.toBe(bam);
  });

  it('4 ký tự cuối để UI hiện lại; token gốc đủ entropy', () => {
    const token = sinhToken();
    expect(bonKyTuCuoi(token)).toBe(token.slice(-4));
    expect(bonKyTuCuoi(token)).toHaveLength(4);
    expect(token.startsWith('bt_')).toBe(true);
    expect(token.length).toBeGreaterThanOrEqual(35);
    expect(sinhToken()).not.toBe(sinhToken());
  });

  it('lưu agent thì chỉ ghi băm, truy vấn theo băm tìm được agent', async () => {
    const token = sinhToken();
    const bam = await bamToken(token);
    const t = Date.now();
    await env.DB.prepare(
      `INSERT INTO agent (id, workspace_id, ten, vai_tro, token_bam, token_bon_cuoi,
                          token_tao_luc, tao_luc, cap_nhat_luc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind('ag-1', WS, 'W-builder', 'worker', bam, bonKyTuCuoi(token), t, t, t)
      .run();

    const dong = await env.DB.prepare('SELECT * FROM agent WHERE token_bam = ?')
      .bind(bam)
      .first<Record<string, unknown>>();
    expect(dong?.ten).toBe('W-builder');
    expect(dong?.disabled).toBe(0);
    expect(JSON.stringify(dong)).not.toContain(token);
  });

  it('tên agent duy nhất trong workspace', async () => {
    const t = Date.now();
    const them = (id: string): Promise<unknown> =>
      env.DB.prepare(
        'INSERT INTO agent (id, workspace_id, ten, vai_tro, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(id, WS, 'CoS', 'coordinator', t, t)
        .run();
    await them('ag-a');
    await expect(them('ag-b')).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it('chỉ nhận 4 vai trò của SPEC mục 0.1', async () => {
    const t = Date.now();
    await expect(
      env.DB.prepare(
        'INSERT INTO agent (id, workspace_id, ten, vai_tro, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind('ag-x', WS, 'X', 'admin', t, t)
        .run(),
    ).rejects.toThrow(/constraint/i);
  });
});

describe('SPEC mục 4 — ticket', () => {
  let duAn = '';
  beforeEach(async () => {
    await dungWorkspace();
    duAn = await dungDuAn('SAI');
  });

  it('mã hiển thị là MÃ-số', () => {
    expect(maTicket('SAI', 12)).toBe('SAI-12');
  });

  it('tiêu đề 1–200 ký tự sau khi cắt khoảng trắng', () => {
    expect(kiemTieuDeTicket('  Việc A  ')).toBe('Việc A');
    expect(() => kiemTieuDeTicket('   ')).toThrowError(/1–200/);
    expect(() => kiemTieuDeTicket('')).toThrowError(/1–200/);
    expect(() => kiemTieuDeTicket('x'.repeat(201))).toThrowError(/1–200/);
    expect(kiemTieuDeTicket('x'.repeat(200))).toHaveLength(200);
  });

  it('DB cũng từ chối tiêu đề rỗng và quá 200 ký tự', async () => {
    await expect(dungTicket(duAn, 1, '')).rejects.toThrow(/constraint/i);
    await expect(dungTicket(duAn, 2, 'x'.repeat(201))).rejects.toThrow(/constraint/i);
  });

  it('số ticket duy nhất trong dự án', async () => {
    await dungTicket(duAn, 1);
    await expect(
      env.DB.prepare(
        `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, nguoi_tao_loai, tao_luc, cap_nhat_luc, uu_tien, hang_uu_tien)
         VALUES ('tk-trung', ?, ?, 1, 'Trùng số', 'owner', 0, 0, 'none', 4)`,
      )
        .bind(WS, duAn)
        .run(),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it('mặc định: trạng thái todo, ưu tiên none', async () => {
    const t = Date.now();
    await env.DB.prepare(
      `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, nguoi_tao_loai, tao_luc, cap_nhat_luc)
       VALUES ('tk-md', ?, ?, 9, 'Mặc định', 'owner', ?, ?)`,
    )
      .bind(WS, duAn, t, t)
      .run();
    const dong = await env.DB.prepare(
      'SELECT trang_thai, uu_tien, hang_uu_tien FROM ticket WHERE id = ?',
    )
      .bind('tk-md')
      .first<{ trang_thai: string; uu_tien: string; hang_uu_tien: number }>();
    expect(dong).toEqual({ trang_thai: 'todo', uu_tien: 'none', hang_uu_tien: 4 });
  });

  it('hang_uu_tien không bao giờ lệch với uu_tien', async () => {
    const id = await dungTicket(duAn, 3);
    await env.DB.prepare('UPDATE ticket SET uu_tien = ?, hang_uu_tien = ? WHERE id = ?')
      .bind('urgent', 0, id)
      .run();
    await expect(
      env.DB.prepare('UPDATE ticket SET uu_tien = ?, hang_uu_tien = ? WHERE id = ?')
        .bind('urgent', 3, id)
        .run(),
    ).rejects.toThrow(/constraint/i);
  });

  it('chỉ nhận 7 trạng thái ticket của SPEC', async () => {
    const id = await dungTicket(duAn, 4);
    for (const tt of [
      'backlog',
      'todo',
      'in_progress',
      'verifying',
      'done',
      'canceled',
      'duplicate',
    ]) {
      await env.DB.prepare('UPDATE ticket SET trang_thai = ? WHERE id = ?').bind(tt, id).run();
    }
    await expect(
      env.DB.prepare('UPDATE ticket SET trang_thai = ? WHERE id = ?').bind('wontfix', id).run(),
    ).rejects.toThrow(/constraint/i);
  });

  it('có đủ 8 trường brief của SPEC mục 4', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(ticket)').all<{ name: string }>();
    const cot = results.map((r) => r.name);
    for (const truong of [
      'muc_tieu',
      'boi_canh',
      'pham_vi',
      'file_va_nguon',
      'dieu_cam',
      'xong_la_gi',
      'cach_kiem_chung',
      'nop_lai',
    ]) {
      expect(cot, `trường brief ${truong}`).toContain(truong);
    }
  });

  it('xoá mềm: ticket đã xoá rời khỏi danh sách nhưng còn trong DB (khôi phục 30 ngày)', async () => {
    const id = await dungTicket(duAn, 5);
    await env.DB.prepare('UPDATE ticket SET xoa_luc = ? WHERE id = ?').bind(Date.now(), id).run();

    const dsach = await env.DB.prepare(
      'SELECT count(*) AS n FROM ticket WHERE project_id = ? AND xoa_luc IS NULL',
    )
      .bind(duAn)
      .first<{ n: number }>();
    expect(dsach?.n).toBe(0);

    const con = await env.DB.prepare('SELECT so FROM ticket WHERE id = ?')
      .bind(id)
      .first<{ so: number }>();
    expect(con?.so).toBe(5);
  });

  it('có chỗ sẵn cho ma_cu và tìm được (SPEC mục 16)', async () => {
    const id = await dungTicket(duAn, 6);
    await env.DB.prepare('UPDATE ticket SET ma_cu = ? WHERE id = ?').bind('LIN-421', id).run();
    const dong = await env.DB.prepare(
      'SELECT id FROM ticket WHERE workspace_id = ? AND ma_cu = ?',
    )
      .bind(WS, 'LIN-421')
      .first<{ id: string }>();
    expect(dong?.id).toBe(id);
  });

  it('cặp "ai" nhất quán: loại agent phải có agent_id', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, nguoi_tao_loai, tao_luc, cap_nhat_luc)
         VALUES ('tk-sai-ai', ?, ?, 77, 'Thiếu agent_id', 'agent', 0, 0)`,
      )
        .bind(WS, duAn)
        .run(),
    ).rejects.toThrow(/constraint/i);
  });
});

describe('SPEC mục 4 + 19.4 — liên kết ticket', () => {
  let duAn = '';
  let duAnKhac = '';
  beforeEach(async () => {
    await dungWorkspace();
    duAn = await dungDuAn('SAI');
    duAnKhac = await dungDuAn('COS', 'CoS');
  });

  it('liên kết được ticket KHÁC dự án, và "điều phối" là loại riêng', async () => {
    const a = await dungTicket(duAn, 1, 'Ticket dự án');
    const b = await dungTicket(duAnKhac, 1, '[Giao M-Sample] Việc');
    for (const loai of ['related', 'dieu_phoi']) {
      await env.DB.prepare(
        'INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(WS, b, a, loai, Date.now())
        .run();
    }
    const { results } = await env.DB.prepare(
      'SELECT loai FROM ticket_link WHERE tu_ticket_id = ? ORDER BY loai',
    )
      .bind(b)
      .all<{ loai: string }>();
    expect(results.map((r) => r.loai)).toEqual(['dieu_phoi', 'related']);
  });

  it('chỉ nhận 4 loại liên kết, và không tự nối với chính mình', async () => {
    const a = await dungTicket(duAn, 2);
    await expect(
      env.DB.prepare(
        'INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc) VALUES (?, ?, ?, ?, 0)',
      )
        .bind(WS, a, a, 'related')
        .run(),
    ).rejects.toThrow(/constraint/i);

    const b = await dungTicket(duAn, 3);
    await expect(
      env.DB.prepare(
        'INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc) VALUES (?, ?, ?, ?, 0)',
      )
        .bind(WS, a, b, 'duplicate_of')
        .run(),
    ).rejects.toThrow(/constraint/i);
  });
});

describe('SPEC mục 4 — lịch sử chỉ thêm, không sửa, không xoá', () => {
  let ticket = '';
  beforeEach(async () => {
    await dungWorkspace();
    const duAn = await dungDuAn('SAI');
    ticket = await dungTicket(duAn, 1);
    await env.DB.prepare(
      `INSERT INTO ticket_history (id, workspace_id, ticket_id, tac_gia_loai, luc, truong, gia_tri_cu, gia_tri_moi)
       VALUES ('ls-1', ?, ?, 'owner', 1, 'trang_thai', 'todo', 'in_progress')`,
    )
      .bind(WS, ticket)
      .run();
  });

  it('không sửa được một dòng lịch sử', async () => {
    await expect(
      env.DB.prepare("UPDATE ticket_history SET gia_tri_moi = 'done' WHERE id = 'ls-1'").run(),
    ).rejects.toThrow(/chi them, khong sua/);
  });

  it('không xoá được một dòng lịch sử', async () => {
    await expect(
      env.DB.prepare("DELETE FROM ticket_history WHERE id = 'ls-1'").run(),
    ).rejects.toThrow(/chi them, khong xoa/);
  });

  it('thêm dòng mới thì được', async () => {
    await env.DB.prepare(
      `INSERT INTO ticket_history (id, workspace_id, ticket_id, tac_gia_loai, luc, truong, gia_tri_cu, gia_tri_moi)
       VALUES ('ls-2', ?, ?, 'system', 2, 'trang_thai', 'in_progress', 'done')`,
    )
      .bind(WS, ticket)
      .run();
    const dong = await env.DB.prepare(
      'SELECT count(*) AS n FROM ticket_history WHERE ticket_id = ?',
    )
      .bind(ticket)
      .first<{ n: number }>();
    expect(dong?.n).toBe(2);
  });
});

describe('SPEC mục 4 + 8 — bộ đếm không bao giờ giảm (mã không tái dùng)', () => {
  beforeEach(async () => {
    await dungWorkspace();
  });

  it('bộ đếm tăng được, giảm thì bị chặn', async () => {
    await env.DB.prepare(
      "INSERT INTO bo_dem (workspace_id, pham_vi, khoa, gia_tri) VALUES (?, 'workspace', 'ask', 5)",
    )
      .bind(WS)
      .run();
    await env.DB.prepare(
      "UPDATE bo_dem SET gia_tri = 6 WHERE workspace_id = ? AND pham_vi = 'workspace' AND khoa = 'ask'",
    )
      .bind(WS)
      .run();
    await expect(
      env.DB.prepare(
        "UPDATE bo_dem SET gia_tri = 3 WHERE workspace_id = ? AND pham_vi = 'workspace' AND khoa = 'ask'",
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow(/bo dem khong duoc giam/);
  });
});

describe('SPEC mục 4 — bình luận', () => {
  it('cờ "đã sửa" mặc định tắt, bật được', async () => {
    await dungWorkspace();
    const duAn = await dungDuAn('SAI');
    const ticket = await dungTicket(duAn, 1);
    const t = Date.now();
    await env.DB.prepare(
      `INSERT INTO comment (id, workspace_id, ticket_id, tac_gia_loai, noi_dung, tao_luc, cap_nhat_luc)
       VALUES ('cm-1', ?, ?, 'owner', '**markdown** được', ?, ?)`,
    )
      .bind(WS, ticket, t, t)
      .run();
    let dong = await env.DB.prepare('SELECT da_sua FROM comment WHERE id = ?')
      .bind('cm-1')
      .first<{ da_sua: number }>();
    expect(dong?.da_sua).toBe(0);

    await env.DB.prepare("UPDATE comment SET noi_dung = 'sửa rồi', da_sua = 1 WHERE id = 'cm-1'").run();
    dong = await env.DB.prepare('SELECT da_sua FROM comment WHERE id = ?')
      .bind('cm-1')
      .first<{ da_sua: number }>();
    expect(dong?.da_sua).toBe(1);
  });
});
