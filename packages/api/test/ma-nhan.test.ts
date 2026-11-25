/**
 * SPEC mục 0.1 — bảng mã máy (tiếng Anh) ↔ nhãn hiển thị (tiếng Việt).
 * Mỗi nhóm trong bảng của SPEC được đối chiếu **đúng từng mã, đúng từng nhãn**.
 */

import { describe, expect, it } from 'vitest';
import {
  BANG_MA,
  HANG_UU_TIEN,
  KET_LUAN_REVIEW,
  KET_QUA_NOP,
  LOAI_BANG_CHUNG,
  LOAI_CAN_CHU,
  LOAI_HOAT_DONG,
  LOAI_LIEN_KET_TICKET,
  LOAI_LUOT_GIAO,
  MUC_CAN_CHU,
  NHOM_TRANG_THAI_TICKET,
  THU_TU_MUC_CAN_CHU,
  THU_TU_UU_TIEN,
  TIN_HIEU,
  TRANG_THAI_AGENT,
  TRANG_THAI_CAN_CHU,
  TRANG_THAI_DU_AN,
  TRANG_THAI_LUOT_GIAO,
  TRANG_THAI_PHIEN,
  TRANG_THAI_TICKET,
  TRANG_THAI_TICKET_MAC_DINH,
  UU_TIEN,
  UU_TIEN_MAC_DINH,
  VAI_TRO_AGENT,
  XAC_MINH_BANG_CHUNG,
  XAC_MINH_LUU_DUOC,
  danhSachMa,
  laMaHopLe,
  nhan,
  nhomTrangThai,
  trangThaiTheoNhom,
} from '@baton/shared';

describe('SPEC 0.1 — từng nhóm mã đủ mã và đúng nhãn', () => {
  it('vai trò agent (4 mã)', () => {
    expect(VAI_TRO_AGENT).toEqual({
      coordinator: 'Điều phối',
      manager: 'Quản lý',
      worker: 'Người làm',
      reviewer: 'Người duyệt',
    });
  });

  it('trạng thái dự án (3 mã)', () => {
    expect(TRANG_THAI_DU_AN).toEqual({
      active: 'Đang chạy',
      paused: 'Tạm dừng',
      archived: 'Lưu trữ',
    });
  });

  it('trạng thái agent (5 mã)', () => {
    expect(TRANG_THAI_AGENT).toEqual({
      busy: 'Đang làm',
      waiting_owner: 'Chờ Chủ',
      stalled: 'Đứng',
      idle: 'Rảnh',
      disabled: 'Đã tắt',
    });
  });

  it('trạng thái ticket — đúng 7 mã, đúng thứ tự SPEC', () => {
    expect(Object.keys(TRANG_THAI_TICKET)).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'verifying',
      'done',
      'canceled',
      'duplicate',
    ]);
    expect(TRANG_THAI_TICKET).toEqual({
      backlog: 'Backlog',
      todo: 'Cần làm',
      in_progress: 'Đang làm',
      verifying: 'Chờ kiểm chứng',
      done: 'Xong',
      canceled: 'Huỷ',
      duplicate: 'Trùng',
    });
  });

  it('ticket mới mặc định là Cần làm (SPEC mục 4)', () => {
    expect(TRANG_THAI_TICKET_MAC_DINH).toBe('todo');
  });

  it('nhóm trạng thái ticket và ánh xạ trạng thái → nhóm', () => {
    expect(NHOM_TRANG_THAI_TICKET).toEqual({
      planned: 'chờ',
      active: 'chạy',
      closed: 'kết',
    });
    expect(trangThaiTheoNhom('planned')).toEqual(['backlog', 'todo']);
    expect(trangThaiTheoNhom('active')).toEqual(['in_progress', 'verifying']);
    expect(trangThaiTheoNhom('closed')).toEqual(['done', 'canceled', 'duplicate']);
    expect(nhomTrangThai('verifying')).toBe('active');
    expect(nhomTrangThai('duplicate')).toBe('closed');
  });

  it('ưu tiên — 5 mức, thứ tự cố định, mặc định none (SPEC mục 4)', () => {
    expect(UU_TIEN).toEqual({
      urgent: 'Khẩn',
      high: 'Cao',
      medium: 'Vừa',
      low: 'Thấp',
      none: 'Không',
    });
    expect([...THU_TU_UU_TIEN]).toEqual(['urgent', 'high', 'medium', 'low', 'none']);
    expect(UU_TIEN_MAC_DINH).toBe('none');
    // Hạng số phải khớp đúng thứ tự, vì SQL sắp xếp theo hạng này.
    expect(THU_TU_UU_TIEN.map((m) => HANG_UU_TIEN[m])).toEqual([0, 1, 2, 3, 4]);
  });

  it('loại và trạng thái lượt giao', () => {
    expect(LOAI_LUOT_GIAO).toEqual({ work: 'Làm', review: 'Review' });
    expect(TRANG_THAI_LUOT_GIAO).toEqual({
      pending: 'Chờ nhận',
      in_progress: 'Đang làm',
      submitted: 'Đã nộp',
      accepted: 'Đạt',
      returned: 'Trả lại',
      canceled: 'Đã huỷ',
    });
  });

  it('kết quả nộp (3 mã)', () => {
    expect(KET_QUA_NOP).toEqual({
      done: 'Xong',
      partial: 'Xong một phần',
      blocked: 'Không làm được',
    });
  });

  it('trạng thái phiên (7 mã)', () => {
    expect(TRANG_THAI_PHIEN).toEqual({
      running: 'Đang chạy',
      waiting_owner: 'Chờ Chủ',
      waiting_assigner: 'Chờ người giao',
      stalled: 'Đứng',
      error: 'Lỗi',
      stopping: 'Đang dừng',
      closed: 'Đã đóng',
    });
  });

  it('loại hoạt động (5 mã) và tín hiệu', () => {
    expect(LOAI_HOAT_DONG).toEqual({
      thought: 'Suy nghĩ',
      action: 'Thao tác',
      question: 'Hỏi',
      result: 'Kết quả',
      error: 'Lỗi',
    });
    expect(TIN_HIEU).toEqual({ STOP: 'Dừng' });
  });

  it('loại bằng chứng (6 mã SPEC + `bao_cao` của T-31) và xác minh bằng chứng', () => {
    expect(Object.keys(LOAI_BANG_CHUNG)).toEqual([
      'commit',
      'deploy',
      'review',
      'test',
      'file',
      'note',
      // Mã Baton thêm — T-31 câu 3.4 A, `spec-questions.md` #161 (migration 0027).
      'bao_cao',
    ]);
    expect(LOAI_BANG_CHUNG.note).toBe('Ghi chú');
    expect(LOAI_BANG_CHUNG.bao_cao).toBe('Báo cáo');

    /*
     * **Chữ literal của bảng SPEC 0.1** — sáu mã này phải có đúng nhãn đó.
     * `toMatchObject` chứ không `toEqual`: Baton thêm **một** mã ngoài bảng 0.1,
     * và ca dưới khoá đúng một mã đó lại.
     */
    expect(XAC_MINH_BANG_CHUNG).toMatchObject({
      pending: 'Đang kiểm',
      passed: 'Đạt',
      failed: 'Trượt',
      withdrawn: 'Đã rút',
      pushed: 'pushed',
      merged: 'merged',
    });
  });

  /**
   * `spec-questions.md` #55 — `not_required` là mã **Baton thêm**, vì bảng 0.1
   * không có mã nào cho "Không xác minh" của d.209–211. Ca này khoá danh sách
   * mã thêm lại: thêm một mã nữa ngoài bảng 0.1 mà không có dòng câu hỏi thì ca
   * này đỏ, chứ không im lặng đi vào v0.1.
   */
  it('ngoài bảng 0.1, nhóm xác minh có ĐÚNG MỘT mã Baton thêm: `not_required` (#55)', () => {
    const MA_CUA_SPEC_01 = ['pending', 'passed', 'failed', 'withdrawn', 'pushed', 'merged'];
    const them = Object.keys(XAC_MINH_BANG_CHUNG).filter((m) => !MA_CUA_SPEC_01.includes(m));
    expect(them).toEqual(['not_required']);

    // `withdrawn` **không** lưu được vào cột `evidence.xac_minh` (migration 0009):
    // nó là mã hiển thị, suy ra từ `rut_luc`.
    expect([...XAC_MINH_LUU_DUOC].sort()).toEqual(
      [...MA_CUA_SPEC_01.filter((m) => m !== 'withdrawn'), 'not_required'].sort(),
    );
  });

  it('kết luận review', () => {
    expect(KET_LUAN_REVIEW).toEqual({ pass: 'Đạt', fail: 'Không đạt' });
  });

  it('Cần Chủ — mức, loại, trạng thái', () => {
    expect(MUC_CAN_CHU).toEqual({
      urgent: '🔴 Gấp',
      today: '🟡 Trong ngày',
      later: '⚪ Không gấp',
    });
    // Phiên duyệt đi theo thứ tự 🔴 → 🟡 → ⚪ (SPEC mục 8).
    expect([...THU_TU_MUC_CAN_CHU]).toEqual(['urgent', 'today', 'later']);
    expect(LOAI_CAN_CHU).toEqual({
      decision: 'Quyết định',
      run_command: 'Chủ chạy lệnh',
      review: 'Chủ review',
      fyi: 'Chỉ để biết',
    });
    expect(TRANG_THAI_CAN_CHU).toEqual({
      open: 'Chờ',
      resolved: 'Đã xử lý',
      skipped: 'Bỏ qua',
    });
  });

  it('SPEC 19.4 — "điều phối" là loại liên kết RIÊNG, khác "liên quan"', () => {
    expect(Object.keys(LOAI_LIEN_KET_TICKET)).toEqual([
      'parent',
      'related',
      'blocks',
      'dieu_phoi',
    ]);
    expect(LOAI_LIEN_KET_TICKET.dieu_phoi).not.toBe(LOAI_LIEN_KET_TICKET.related);
  });
});

describe('SPEC 0.1 — mọi nhóm của bảng đều có trong sổ tra', () => {
  it('đủ 20 nhóm, không nhóm nào rỗng', () => {
    const nhomCanCo = [
      'vai_tro_agent',
      'trang_thai_du_an',
      'trang_thai_agent',
      'trang_thai_ticket',
      'nhom_trang_thai_ticket',
      'uu_tien',
      'loai_luot_giao',
      'trang_thai_luot_giao',
      'ket_qua_nop',
      'trang_thai_phien',
      'loai_hoat_dong',
      'tin_hieu',
      'loai_bang_chung',
      'xac_minh_bang_chung',
      'ket_luan_review',
      'muc_can_chu',
      'loai_can_chu',
      'trang_thai_can_chu',
      // Hai nhóm **ngoài** bảng 0.1, mỗi nhóm có một mục SPEC khác làm căn cứ:
      'loai_lien_ket_ticket', // mục 4 + 19.4
      'trang_thai_buoc', //      mục 6 d.191 (0.1 không có nhóm này — câu hỏi SPEC)
    ];
    expect(Object.keys(BANG_MA).sort()).toEqual([...nhomCanCo].sort());
    for (const n of Object.keys(BANG_MA)) {
      expect(danhSachMa(n as keyof typeof BANG_MA).length).toBeGreaterThan(0);
    }
  });

  it('mọi mã là tiếng Anh (ASCII), mọi nhãn là chuỗi không rỗng', () => {
    for (const bang of Object.values(BANG_MA)) {
      for (const [ma, nhanVi] of Object.entries(bang)) {
        expect(ma).toMatch(/^[A-Za-z_]+$/);
        expect(typeof nhanVi).toBe('string');
        expect((nhanVi as string).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('nhan() và laMaHopLe()', () => {
  it('trả nhãn tiếng Việt của mã', () => {
    expect(nhan('trang_thai_ticket', 'verifying')).toBe('Chờ kiểm chứng');
    expect(nhan('uu_tien', 'urgent')).toBe('Khẩn');
    expect(nhan('muc_can_chu', 'urgent')).toBe('🔴 Gấp');
    expect(nhan('vai_tro_agent', 'worker')).toBe('Người làm');
  });

  it('mã lạ thì trả lại chính mã đó, UI không vỡ', () => {
    expect(nhan('trang_thai_ticket', 'khong_co_ma_nay')).toBe('khong_co_ma_nay');
  });

  it('laMaHopLe phân biệt mã có và không có', () => {
    expect(laMaHopLe('trang_thai_ticket', 'done')).toBe(true);
    expect(laMaHopLe('trang_thai_ticket', 'Xong')).toBe(false);
    expect(laMaHopLe('uu_tien', undefined)).toBe(false);
  });
});
