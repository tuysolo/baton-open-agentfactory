/**
 * **Việc sửa A3 của reviewer lượt 1** — migration `0002`.
 *
 * Lượt 1, `ticket_link` (và `ticket_label`, `comment`, `ticket_history`) khai hai
 * khoá ngoài **rời nhau**: `workspace_id → workspace(id)` và
 * `ticket_id → ticket(id)`. Không có gì buộc hai thứ đó khớp, nên một bug ở tầng
 * trên nối được ticket **xuyên workspace** mà DB vẫn nhận. Lệch tinh thần SPEC
 * mục 1: "dữ liệu phải tách theo workspace từ đầu để sau này ship nhiều khách".
 *
 * `0002` thêm trigger kiểm `workspace_id` của bảng con khớp
 * `ticket.workspace_id`, cho cả INSERT và UPDATE.
 *
 * Các test dưới đây ghi **thẳng vào DB**, không qua cửa ghi: đúng chỗ phải kiểm,
 * vì mục đích của ràng buộc là chặn *bug của tầng trên*. Nếu chỉ thử qua API thì
 * test sẽ xanh nhờ tầng ứng dụng, chứ không chứng minh được DB đã chặn.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { goiLenh } from '../src/workspace-gate.js';
import { CHU, WS } from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const WS_KHAC = 'ws-khac';

/** Hai workspace, mỗi workspace một dự án và một ticket. */
async function dungHaiWorkspace(): Promise<void> {
  const t = Date.now();
  for (const [ws, pj, tk, ma] of [
    [WS, 'pj-a', 'tk-a', 'AAA'],
    [WS_KHAC, 'pj-b', 'tk-b', 'BBB'],
  ] as const) {
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind(ws, 'Chủ', t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
      .bind(pj, ws, `Dự án ${ma}`, ma, t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO ticket
         (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
          nguoi_tao_loai, tao_luc, cap_nhat_luc)
       VALUES (?, ?, ?, 1, 'Việc', 'todo', 'none', 4, 'owner', ?, ?)`,
    )
      .bind(tk, ws, pj, t, t)
      .run();
  }
}

describe('A3 — nối ticket XUYÊN workspace bị chặn ở tầng DB', () => {
  beforeEach(dungHaiWorkspace);

  it('ticket_link: hai đầu ở hai workspace khác nhau → bị chặn', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
         VALUES (?, 'tk-a', 'tk-b', 'related', 0)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow(/cung workspace/);

    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket_link').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('ticket_link: workspace_id của dòng lệch workspace của ticket → bị chặn', async () => {
    // Cả hai ticket cùng workspace WS, nhưng dòng link khai workspace khác.
    const t = Date.now();
    await env.DB.prepare(
      `INSERT INTO ticket
         (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
          nguoi_tao_loai, tao_luc, cap_nhat_luc)
       VALUES ('tk-a2', ?, 'pj-a', 2, 'Việc hai', 'todo', 'none', 4, 'owner', ?, ?)`,
    )
      .bind(WS, t, t)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
         VALUES (?, 'tk-a', 'tk-a2', 'related', 0)`,
      )
        .bind(WS_KHAC)
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('ticket_link: UPDATE cũng không lách được sang workspace khác', async () => {
    const t = Date.now();
    await env.DB.prepare(
      `INSERT INTO ticket
         (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
          nguoi_tao_loai, tao_luc, cap_nhat_luc)
       VALUES ('tk-a2', ?, 'pj-a', 2, 'Việc hai', 'todo', 'none', 4, 'owner', ?, ?)`,
    )
      .bind(WS, t, t)
      .run();
    // Dòng hợp lệ trong WS.
    await env.DB.prepare(
      `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
       VALUES (?, 'tk-a', 'tk-a2', 'related', 0)`,
    )
      .bind(WS)
      .run();

    // Rồi đổi một đầu sang ticket của workspace khác.
    await expect(
      env.DB.prepare(
        "UPDATE ticket_link SET den_ticket_id = 'tk-b' WHERE tu_ticket_id = 'tk-a'",
      ).run(),
    ).rejects.toThrow(/cung workspace/);

    // Và đổi workspace_id của dòng.
    await expect(
      env.DB.prepare('UPDATE ticket_link SET workspace_id = ? WHERE tu_ticket_id = ?')
        .bind(WS_KHAC, 'tk-a')
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('ticket_link ĐÚNG workspace vẫn nối được, kể cả KHÁC DỰ ÁN (SPEC mục 4)', async () => {
    const t = Date.now();
    // Dự án thứ hai trong cùng workspace.
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
       VALUES ('pj-a2', ?, 'Dự án AA2', 'AAB', 'active', ?, ?)`,
    )
      .bind(WS, t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO ticket
         (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
          nguoi_tao_loai, tao_luc, cap_nhat_luc)
       VALUES ('tk-a3', ?, 'pj-a2', 1, 'Việc dự án khác', 'todo', 'none', 4, 'owner', ?, ?)`,
    )
      .bind(WS, t, t)
      .run();

    await env.DB.prepare(
      `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
       VALUES (?, 'tk-a', 'tk-a3', 'related', 0)`,
    )
      .bind(WS)
      .run();

    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket_link').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it.each([['parent'], ['related'], ['blocks'], ['dieu_phoi']])(
    'loại liên kết "%s" cũng bị chặn khi xuyên workspace',
    async (loai) => {
      await expect(
        env.DB.prepare(
          `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
           VALUES (?, 'tk-a', 'tk-b', ?, 0)`,
        )
          .bind(WS, loai)
          .run(),
      ).rejects.toThrow(/cung workspace/);
    },
  );
});

describe('A3 — các bảng con khác của ticket cũng phải cùng workspace', () => {
  beforeEach(dungHaiWorkspace);

  it('ticket_label: nhãn khai workspace khác với ticket → bị chặn', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO ticket_label (workspace_id, ticket_id, nhan, tao_luc)
         VALUES (?, 'tk-a', 'gap', 0)`,
      )
        .bind(WS_KHAC)
        .run(),
    ).rejects.toThrow(/cung workspace/);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket_label').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('ticket_label: UPDATE sang workspace khác cũng bị chặn', async () => {
    await env.DB.prepare(
      `INSERT INTO ticket_label (workspace_id, ticket_id, nhan, tao_luc)
       VALUES (?, 'tk-a', 'gap', 0)`,
    )
      .bind(WS)
      .run();
    await expect(
      env.DB.prepare('UPDATE ticket_label SET workspace_id = ? WHERE ticket_id = ?')
        .bind(WS_KHAC, 'tk-a')
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('comment: bình luận khai workspace khác với ticket → bị chặn', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO comment (id, workspace_id, ticket_id, tac_gia_loai, noi_dung, tao_luc, cap_nhat_luc)
         VALUES ('cm-1', ?, 'tk-a', 'owner', 'Xin chào', 0, 0)`,
      )
        .bind(WS_KHAC)
        .run(),
    ).rejects.toThrow(/cung workspace/);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM comment').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('ticket_history: dòng lịch sử khai workspace khác với ticket → bị chặn', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO ticket_history
           (id, workspace_id, ticket_id, tac_gia_loai, luc, truong, gia_tri_cu, gia_tri_moi)
         VALUES ('ls-1', ?, 'tk-a', 'owner', 0, 'tieu_de', 'a', 'b')`,
      )
        .bind(WS_KHAC)
        .run(),
    ).rejects.toThrow(/cung workspace/);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket_history').first<{
      n: number;
    }>();
    expect(n?.n).toBe(0);
  });

  it.each([
    ['ticket_label', WS],
    ['comment', WS],
    ['ticket_history', WS],
  ])('%s ĐÚNG workspace vẫn ghi được', async (bang, ws) => {
    const cau: Record<string, string> = {
      ticket_label: `INSERT INTO ticket_label (workspace_id, ticket_id, nhan, tao_luc)
                     VALUES (?, 'tk-a', 'gap', 0)`,
      comment: `INSERT INTO comment (id, workspace_id, ticket_id, tac_gia_loai, noi_dung, tao_luc, cap_nhat_luc)
                VALUES ('cm-ok', ?, 'tk-a', 'owner', 'Xin chào', 0, 0)`,
      ticket_history: `INSERT INTO ticket_history
                         (id, workspace_id, ticket_id, tac_gia_loai, luc, truong, gia_tri_cu, gia_tri_moi)
                       VALUES ('ls-ok', ?, 'tk-a', 'owner', 0, 'tieu_de', 'a', 'b')`,
    };
    await env.DB.prepare(cau[bang]!).bind(ws).run();
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM ${bang}`).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('lịch sử vẫn chỉ-thêm: trigger 0001 không bị 0002 làm mất tác dụng', async () => {
    await env.DB.prepare(
      `INSERT INTO ticket_history
         (id, workspace_id, ticket_id, tac_gia_loai, luc, truong, gia_tri_cu, gia_tri_moi)
       VALUES ('ls-2', ?, 'tk-a', 'owner', 0, 'tieu_de', 'a', 'b')`,
    )
      .bind(WS)
      .run();

    await expect(
      env.DB.prepare("UPDATE ticket_history SET truong = 'x' WHERE id = 'ls-2'").run(),
    ).rejects.toThrow(/chi them/);
    await expect(
      env.DB.prepare("DELETE FROM ticket_history WHERE id = 'ls-2'").run(),
    ).rejects.toThrow(/chi them/);
  });
});

describe('A3 — cửa ghi vẫn ghi lịch sử bình thường sau khi thêm trigger', () => {
  it('đổi tiêu đề qua cửa ghi: lịch sử vào đúng workspace, không bị trigger chặn oan', async () => {
    const t = Date.now();
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind(WS, 'Chủ', t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
       VALUES ('pj-a', ?, 'Dự án', 'AAA', 'active', ?, ?)`,
    )
      .bind(WS, t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO ticket
         (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
          nguoi_tao_loai, tao_luc, cap_nhat_luc)
       VALUES ('tk-a', ?, 'pj-a', 1, 'Cũ', 'todo', 'none', 4, 'owner', ?, ?)`,
    )
      .bind(WS, t, t)
      .run();

    await goiLenh(env, {
      loai: 'doi_tieu_de',
      workspace_id: WS,
      ai: CHU,
      ticket_id: 'tk-a',
      tieu_de: 'Mới',
    });

    const d = await env.DB.prepare(
      'SELECT workspace_id, gia_tri_moi FROM ticket_history WHERE ticket_id = ?',
    )
      .bind('tk-a')
      .first<{ workspace_id: string; gia_tri_moi: string }>();
    expect(d).toEqual({ workspace_id: WS, gia_tri_moi: 'Mới' });
  });
});
