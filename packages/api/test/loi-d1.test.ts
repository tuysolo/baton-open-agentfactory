/**
 * **A1 — lỗi ràng buộc của D1 phải ra mã nghiệp vụ, không phải `INTERNAL`/500.**
 *
 * Migration 0001 và 0002 phát `RAISE(ABORT, '<MÃ>: <mô tả>')` đúng để tầng trên
 * tách mã, nhưng trước lượt này không tầng nào tách: cửa ghi rethrow, `goiLenh`
 * đổi thành 500. Hệ quả thật là nối ticket xuyên workspace, vỡ `ux_ticket_so`,
 * vi phạm trigger "lịch sử chỉ thêm" đều ra 500 — lệch SPEC mục 13.
 *
 * Hai tầng test: hàm tách (`batonErrorTuLoiD1`) và **đường thật qua D1** (ném lỗi
 * từ chính SQLite rồi kiểm mã ra).
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { BatonError } from '@baton/shared';
import { batonErrorTuLoiD1 } from '../src/loi-d1.js';
import { WS, dungDuAn, dungTicket, dungWorkspace } from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

describe('A1 — batonErrorTuLoiD1 tách mã lỗi (SPEC mục 13)', () => {
  it('mã do trigger của Baton đặt: "INVALID_INPUT: …" → INVALID_INPUT/422', () => {
    const loi = batonErrorTuLoiD1(
      new Error('D1_ERROR: INVALID_INPUT: lien ket ticket phai cung workspace: SQLITE_CONSTRAINT'),
    );
    expect(loi?.ma).toBe('INVALID_INPUT');
    expect(loi?.http).toBe(422);
  });

  it('trigger "lịch sử chỉ thêm, không sửa" → FORBIDDEN/403', () => {
    const loi = batonErrorTuLoiD1(new Error('FORBIDDEN: lich su chi them, khong sua'));
    expect(loi?.ma).toBe('FORBIDDEN');
    expect(loi?.http).toBe(403);
  });

  it('bỏ qua cụm chữ in hoa không phải mã lỗi của Baton (D1_ERROR, SQLITE_*)', () => {
    expect(batonErrorTuLoiD1(new Error('D1_ERROR: SQLITE_BUSY: database is locked'))).toBeNull();
  });

  it.each([
    ['UNIQUE constraint failed: ticket.project_id, ticket.so'],
    ['FOREIGN KEY constraint failed'],
    ['CHECK constraint failed: tieu_de'],
    ['NOT NULL constraint failed: ticket.tieu_de'],
  ])('ràng buộc chuẩn của SQLite %j → INVALID_INPUT/422', (chu) => {
    const loi = batonErrorTuLoiD1(new Error(`D1_ERROR: ${chu}`));
    expect(loi?.ma).toBe('INVALID_INPUT');
    expect(loi?.http).toBe(422);
  });

  it('lỗi lạ → null, để tầng trên giữ INTERNAL/500 (không đoán)', () => {
    expect(batonErrorTuLoiD1(new Error('something went sideways'))).toBeNull();
    expect(batonErrorTuLoiD1(undefined)).toBeNull();
    expect(batonErrorTuLoiD1({})).toBeNull();
  });

  it('BatonError đi vào thì trả lại chính nó', () => {
    const goc = new BatonError('CHILDREN_OPEN');
    expect(batonErrorTuLoiD1(goc)).toBe(goc);
  });

  it('đọc được cả lỗi SQLite nằm trong `cause`', () => {
    const loi = batonErrorTuLoiD1(
      new Error('D1_ERROR', { cause: new Error('UNIQUE constraint failed: project.ma') }),
    );
    expect(loi?.ma).toBe('INVALID_INPUT');
  });

  it('thông điệp trả ra KHÔNG mang chữ thô của SQLite (SPEC mục 15)', () => {
    const loi = batonErrorTuLoiD1(
      new Error('D1_ERROR: INVALID_INPUT: lien ket ticket phai cung workspace'),
    );
    expect(loi?.message).not.toContain('D1_ERROR');
    expect(loi?.message).not.toContain('workspace');
    // Chữ thô vẫn giữ trong `chiTiet` để ghi log.
    expect(JSON.stringify(loi?.chiTiet)).toContain('lien ket ticket');
  });
});

describe('A1 — lỗi ràng buộc THẬT từ D1 ra đúng mã (không 500)', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI');
  });

  /**
   * Chạy một `batch()` hỏng rồi tách mã lỗi đúng như cửa ghi làm. Test gọi
   * `batonErrorTuLoiD1` trên lỗi **thật của D1**, nên nếu D1 đổi định dạng thông
   * điệp thì test này đỏ, chứ không phải người dùng gặp 500.
   */
  async function maLoiCuaBatch(cau: D1PreparedStatement[]): Promise<string> {
    try {
      await env.DB.batch(cau);
      return '(không có lỗi)';
    } catch (e) {
      return batonErrorTuLoiD1(e)?.ma ?? '(không tách được)';
    }
  }

  it('trigger 0002: liên kết ticket xuyên workspace → INVALID_INPUT, không INTERNAL', async () => {
    const a = await dungTicket('pj-SAI', 1);
    const b = await dungTicket('pj-SAI', 2);
    const ma = await maLoiCuaBatch([
      env.DB.prepare(
        `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
         VALUES ('ws-khac', ?, ?, 'related', 1)`,
      ).bind(a, b),
    ]);
    expect(ma).toBe('INVALID_INPUT');
  });

  it('UNIQUE ux_ticket_so: hai ticket cùng (project_id, so) → INVALID_INPUT', async () => {
    await dungTicket('pj-SAI', 7);
    const ma = await maLoiCuaBatch([
      env.DB.prepare(
        `INSERT INTO ticket
           (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
            nguoi_tao_loai, tao_luc, cap_nhat_luc)
         VALUES ('tk-trung', ?, 'pj-SAI', 7, 'Trùng số', 'todo', 'none', 4, 'owner', 1, 1)`,
      ).bind(WS),
    ]);
    expect(ma).toBe('INVALID_INPUT');
  });

  it('trigger 0001: sửa dòng lịch sử → FORBIDDEN (lịch sử chỉ thêm, SPEC mục 4)', async () => {
    const t = await dungTicket('pj-SAI', 3);
    await env.DB.prepare(
      `INSERT INTO ticket_history
         (id, workspace_id, ticket_id, tac_gia_loai, luc, truong, gia_tri_cu, gia_tri_moi)
       VALUES ('ls-1', ?, ?, 'owner', 1, 'tieu_de', 'a', 'b')`,
    )
      .bind(WS, t)
      .run();

    expect(
      await maLoiCuaBatch([
        env.DB.prepare("UPDATE ticket_history SET gia_tri_moi = 'sửa lén' WHERE id = 'ls-1'"),
      ]),
    ).toBe('FORBIDDEN');

    expect(
      await maLoiCuaBatch([env.DB.prepare("DELETE FROM ticket_history WHERE id = 'ls-1'")]),
    ).toBe('FORBIDDEN');
  });

  it('trigger 0001: bộ đếm không được giảm → INVALID_INPUT', async () => {
    await env.DB.prepare(
      "INSERT INTO bo_dem (workspace_id, pham_vi, khoa, gia_tri) VALUES (?, 'project', 'pj-SAI', 5)",
    )
      .bind(WS)
      .run();
    const ma = await maLoiCuaBatch([
      env.DB.prepare(
        "UPDATE bo_dem SET gia_tri = 1 WHERE workspace_id = ? AND pham_vi = 'project' AND khoa = 'pj-SAI'",
      ).bind(WS),
    ]);
    expect(ma).toBe('INVALID_INPUT');
  });

  it('CHECK của 0001: tiêu đề quá 200 ký tự → INVALID_INPUT', async () => {
    const ma = await maLoiCuaBatch([
      env.DB.prepare(
        `INSERT INTO ticket
           (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
            nguoi_tao_loai, tao_luc, cap_nhat_luc)
         VALUES ('tk-dai', ?, 'pj-SAI', 99, ?, 'todo', 'none', 4, 'owner', 1, 1)`,
      ).bind(WS, 'x'.repeat(201)),
    ]);
    expect(ma).toBe('INVALID_INPUT');
  });
});
