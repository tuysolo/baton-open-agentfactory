/**
 * **Luật chuyển trạng thái ticket** — SPEC mục 4 (dòng 133–139), 19.2, 19.4,
 * 19.10, 19.11, và "mã tiếng Anh ở API" của mục 0.1 + 13.
 *
 * Hai tầng test, cố ý:
 *
 *  1. **Luật thuần** (`apDungLuat`, `ticketGocHopLe`, `trangThaiDieuPhoiTheo` của
 *     `@baton/shared`): mỗi câu của SPEC một ca, không cần dựng server. Đây là
 *     chỗ phủ cả những nhánh mà **lượt giao (phần 2)** chưa nối được qua HTTP.
 *  2. **Qua HTTP**, với dữ liệu thật trong D1: để biết luật không chỉ đúng trong
 *     ống nghiệm mà còn thật sự nằm trên đường đi của `baton status` — reviewer
 *     lượt 2 đã bắt một lỗ vì chỉ có test đơn vị.
 *
 * Ở lượt này **cổng bằng chứng luôn trả "chưa đủ"** (`cong-bang-chung.ts` là chỗ
 * cắm của phần 3), nên đường HTTP chỉ có hai cách vào Xong: **chủ ép kèm lý do**
 * (SPEC mục 7) và **ticket điều phối** (19.4). Nhánh "cổng đạt" được phủ ở tầng
 * luật thuần bằng cổng tiêm vào.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  CONG_CHUA_DU,
  LY_DO_HUY_DIEU_PHOI,
  apDungLuat,
  quyen,
  ticketGocHopLe,
  trangThaiDieuPhoiTheo,
  type BoiCanhLuat,
  type KetQuaCong,
  type TrangThaiTicket,
} from '@baton/shared';
import {
  TOKEN_CHU,
  aiAgent,
  dungAgentCoToken,
  dungDuAn,
  dungLienKet,
  dungTicket,
  dungTicketWorkspaceKhac,
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

/** Cổng bằng chứng **đạt** — chỉ dùng ở tầng luật thuần (phần 3 cài bản thật). */
const CONG_DU: KetQuaCong = { du: true, ly_do: '' };

function bc(them: Partial<BoiCanhLuat> = {}): BoiCanhLuat {
  return {
    trang_thai: 'todo',
    la_chu: false,
    la_dieu_phoi: false,
    con_chua_ket: 0,
    cong: CONG_CHUA_DU,
    ...them,
  };
}

const TOKEN_COORD = 'bt_token_coord_tt';
const TOKEN_MGR = 'bt_token_mgr_tt';
const TOKEN_WORKER = 'bt_token_worker_tt';
const TOKEN_REVIEWER = 'bt_token_reviewer_tt';

/** Dựng workspace + 1 dự án + 1 ticket, trả id ticket. */
async function moiTruongMotTicket(
  trang_thai: TrangThaiTicket = 'todo',
  so = 1,
): Promise<string> {
  await dungWorkspace();
  await dungDuAn('SAI', 'Sample');
  return dungTicket('pj-SAI', so, 'Việc để đổi trạng thái', { trang_thai });
}

/* ================================================================== *
 * Luật 3 — Vào Xong phải qua cổng bằng chứng
 *   SPEC mục 4 dòng 135 + 19.2 (dòng 488)
 * ================================================================== */

describe('SPEC mục 4 + 19.2 — vào Xong thiếu bằng chứng: EVIDENCE_REQUIRED', () => {
  it('luật thuần: cổng ĐẠT → Xong', () => {
    const kq = apDungLuat({ loai: 'doi_tay', dich: 'done' }, bc({ cong: CONG_DU }));
    expect(kq).toEqual({ trang_thai: 'done' });
  });

  it('luật thuần: nhóm `active` + cổng chưa đủ → lỗi EVIDENCE_REQUIRED **và** sang verifying', () => {
    for (const hien of ['in_progress', 'verifying'] as const) {
      const kq = apDungLuat({ loai: 'doi_tay', dich: 'done' }, bc({ trang_thai: hien }));
      expect(kq.loi?.ma, hien).toBe('EVIDENCE_REQUIRED');
      // "Vừa từ chối vừa đổi dữ liệu" — SPEC 19.2 dòng 488.
      expect(kq.trang_thai, hien).toBe('verifying');
    }
  });

  it('luật thuần: nhóm `planned` + cổng chưa đủ → lỗi, nhưng **giữ nguyên** trạng thái', () => {
    for (const hien of ['backlog', 'todo'] as const) {
      const kq = apDungLuat({ loai: 'doi_tay', dich: 'done' }, bc({ trang_thai: hien }));
      expect(kq.loi?.ma, hien).toBe('EVIDENCE_REQUIRED');
      expect(kq.trang_thai, hien).toBe(hien);
    }
  });

  describe('qua HTTP', () => {
    beforeEach(async () => {
      await dungWorkspace();
      await dungDuAn('SAI', 'Sample');
      await dungTicket('pj-SAI', 1, 'Đang làm', { trang_thai: 'in_progress' });
      await dungTicket('pj-SAI', 2, 'Cần làm', { trang_thai: 'todo' });
    });

    it('ticket nhóm `active` → 422 EVIDENCE_REQUIRED, và ticket sang `verifying`', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done' },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'EVIDENCE_REQUIRED' });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('verifying');
    });

    it('ticket nhóm `planned` → 422 EVIDENCE_REQUIRED, và ticket **giữ nguyên** `todo`', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-2/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done' },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'EVIDENCE_REQUIRED' });
      expect(await trangThaiCua('tk-pj-SAI-2')).toBe('todo');
    });

    it('CHỦ ÉP XONG kèm lý do thì ĐẠT, và ticket mang nhãn "xong không bằng chứng"', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done', ep: true, ly_do: 'Đã live, bằng chứng gửi sau' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('done');

      const doc = await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU);
      expect(await doc.json()).toMatchObject({ co: { xong_khong_bang_chung: true } });
    });

    it('ép Xong KHÔNG lý do → 422 REASON_REQUIRED (SPEC mục 7)', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done', ep: true },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'REASON_REQUIRED' });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('in_progress');
    });

    it('AGENT không ép được Xong: chỉ chủ (SPEC mục 7) → 403 FORBIDDEN', async () => {
      await dungAgentCoToken({
        id: 'ag-coord',
        ten: 'CoS',
        vai_tro: 'coordinator',
        token: TOKEN_COORD,
        vao_tat_ca_du_an: true,
      });
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_COORD, {
        method: 'POST',
        than: { trang_thai: 'done', ep: true, ly_do: 'Agent tự ép' },
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('in_progress');
    });
  });
});

/* ================================================================== *
 * Luật 4 — Ticket cha còn con chưa kết: CHILDREN_OPEN
 *   SPEC mục 4 dòng 136, 19.11
 * ================================================================== */

describe('SPEC mục 4 — ticket cha không vào Xong khi còn con chưa kết', () => {
  it('luật thuần: còn con chưa kết → CHILDREN_OPEN, kể cả khi cổng ĐẠT', () => {
    const kq = apDungLuat(
      { loai: 'doi_tay', dich: 'done' },
      bc({ trang_thai: 'in_progress', con_chua_ket: 2, cong: CONG_DU }),
    );
    expect(kq.loi?.ma).toBe('CHILDREN_OPEN');
    // SPEC 19.11: cha nằm ở Chờ kiểm chứng với dòng "chờ N ticket con".
    expect(kq.trang_thai).toBe('verifying');
    expect(kq.loi?.message).toContain('2');
  });

  it('luật thuần: CHILDREN_OPEN chặn cả khi CHỦ ÉP (mục 7 chỉ ép phần bằng chứng)', () => {
    const kq = apDungLuat(
      { loai: 'doi_tay', dich: 'done', ep_xong: true, ly_do: 'ép' },
      bc({ trang_thai: 'in_progress', la_chu: true, con_chua_ket: 1 }),
    );
    expect(kq.loi?.ma).toBe('CHILDREN_OPEN');
  });

  it('luật thuần: con đã kết hết → không còn chặn vì lý do này', () => {
    const kq = apDungLuat(
      { loai: 'doi_tay', dich: 'done' },
      bc({ trang_thai: 'in_progress', con_chua_ket: 0, cong: CONG_DU }),
    );
    expect(kq.loi).toBeUndefined();
    expect(kq.trang_thai).toBe('done');
  });

  describe('qua HTTP', () => {
    beforeEach(async () => {
      await dungWorkspace();
      await dungDuAn('SAI', 'Sample');
      await dungTicket('pj-SAI', 1, 'Ticket cha', { trang_thai: 'in_progress' });
      await dungTicket('pj-SAI', 2, 'Ticket con', { trang_thai: 'todo' });
      // `parent` có hướng: `tu_ticket_id` là **cha** (migration 0001).
      await dungLienKet('tk-pj-SAI-1', 'tk-pj-SAI-2', 'parent');
    });

    it('con còn mở → 409 CHILDREN_OPEN, cha sang `verifying` kèm "chờ 1 ticket con"', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done', ep: true, ly_do: 'Ép dù còn con' },
      });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: 'CHILDREN_OPEN' });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('verifying');

      const doc = await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU);
      expect(await doc.json()).toMatchObject({ con_chua_ket: 1 });
    });

    it('con đã kết hết → lý do chặn ĐỔI sang EVIDENCE_REQUIRED, không còn CHILDREN_OPEN', async () => {
      await goiApi('/v1/ticket/tk-pj-SAI-2/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: 'Không làm nữa' },
      });
      expect(await trangThaiCua('tk-pj-SAI-2')).toBe('canceled');

      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done' },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'EVIDENCE_REQUIRED' });
    });

    it('con đã kết hết + CHỦ ÉP → cha vào Xong', async () => {
      await goiApi('/v1/ticket/tk-pj-SAI-2/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: 'Gộp vào cha' },
      });
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done', ep: true, ly_do: 'Đã merge' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('done');
    });
  });
});

/* ================================================================== *
 * Luật 5 — Vào Huỷ phải có lý do: REASON_REQUIRED (SPEC mục 4 dòng 137)
 * ================================================================== */

describe('SPEC mục 4 — vào Huỷ bắt buộc có lý do', () => {
  it('luật thuần: không lý do → REASON_REQUIRED, trạng thái giữ nguyên', () => {
    for (const ly_do of [undefined, null, '', '   ']) {
      const kq = apDungLuat(
        { loai: 'doi_tay', dich: 'canceled', ly_do },
        bc({ trang_thai: 'in_progress' }),
      );
      expect(kq.loi?.ma, JSON.stringify(ly_do)).toBe('REASON_REQUIRED');
      expect(kq.trang_thai).toBe('in_progress');
    }
  });

  it('luật thuần: có lý do → Huỷ, và lý do được **cắt khoảng trắng**', () => {
    const kq = apDungLuat(
      { loai: 'doi_tay', dich: 'canceled', ly_do: '  Khách đổi ý  ' },
      bc({ trang_thai: 'in_progress' }),
    );
    expect(kq).toEqual({ trang_thai: 'canceled', ly_do_huy: 'Khách đổi ý' });
  });

  describe('qua HTTP', () => {
    beforeEach(async () => {
      await moiTruongMotTicket('in_progress');
    });

    it('thiếu lý do → 422 REASON_REQUIRED, ticket không đổi', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled' },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'REASON_REQUIRED' });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('in_progress');
    });

    it('có lý do → 200, ticket Huỷ và **lý do được lưu**', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: '  Trùng việc đã làm xong  ' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('canceled');

      const d = await env.DB.prepare('SELECT ly_do_huy FROM ticket WHERE id = ?')
        .bind('tk-pj-SAI-1')
        .first<{ ly_do_huy: string | null }>();
      expect(d?.ly_do_huy).toBe('Trùng việc đã làm xong');
    });
  });
});

/* ================================================================== *
 * Luật 6 — Vào Trùng phải có ticket gốc hợp lệ
 *   SPEC mục 4 dòng 137 (`INVALID_DUPLICATE_TARGET`), `cau-hoi-spec.md` #19
 * ================================================================== */

describe('SPEC mục 4 — vào Trùng bắt buộc có ticket gốc hợp lệ', () => {
  it('luật thuần: không có gốc hợp lệ → INVALID_DUPLICATE_TARGET', () => {
    const kq = apDungLuat(
      { loai: 'doi_tay', dich: 'duplicate', ticket_goc_hop_le: false },
      bc({ trang_thai: 'todo' }),
    );
    expect(kq.loi?.ma).toBe('INVALID_DUPLICATE_TARGET');
    expect(kq.trang_thai).toBe('todo');
  });

  it('luật thuần: gốc hợp lệ → Trùng', () => {
    const kq = apDungLuat(
      { loai: 'doi_tay', dich: 'duplicate', ticket_goc_hop_le: true },
      bc({ trang_thai: 'todo' }),
    );
    expect(kq).toEqual({ trang_thai: 'duplicate' });
  });

  it('`ticketGocHopLe`: gốc không tồn tại / ngoài workspace (tra ra null) → không hợp lệ', () => {
    expect(ticketGocHopLe('tk-1', null, new Map())).toBe(false);
  });

  it('`ticketGocHopLe`: chính nó → không hợp lệ', () => {
    expect(ticketGocHopLe('tk-1', { id: 'tk-1', trung_voi_ticket_id: null }, new Map())).toBe(false);
  });

  it('`ticketGocHopLe`: gốc khác, không tạo vòng → hợp lệ', () => {
    expect(ticketGocHopLe('tk-1', { id: 'tk-2', trung_voi_ticket_id: null }, new Map())).toBe(true);
  });

  it('`ticketGocHopLe`: chuỗi trùng tạo VÒNG → không hợp lệ', () => {
    // tk-2 đã trùng tk-3, tk-3 trùng tk-1. Cho tk-1 trùng tk-2 là tạo vòng.
    const chuoi = new Map<string, string | null>([
      ['tk-2', 'tk-3'],
      ['tk-3', 'tk-1'],
    ]);
    expect(ticketGocHopLe('tk-1', { id: 'tk-2', trung_voi_ticket_id: 'tk-3' }, chuoi)).toBe(false);
  });

  describe('qua HTTP', () => {
    beforeEach(async () => {
      await dungWorkspace();
      await dungDuAn('SAI', 'Sample');
      await dungTicket('pj-SAI', 1, 'Ticket sẽ bị đánh trùng');
      await dungTicket('pj-SAI', 2, 'Ticket gốc');
    });

    it('KHÔNG gửi ticket gốc → 422 INVALID_DUPLICATE_TARGET', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'duplicate' },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'INVALID_DUPLICATE_TARGET' });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
    });

    it('gốc KHÔNG TỒN TẠI → 422 INVALID_DUPLICATE_TARGET', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'duplicate', ticket_goc_id: 'tk-khong-co' },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'INVALID_DUPLICATE_TARGET' });
    });

    it('gốc là CHÍNH NÓ → 422 INVALID_DUPLICATE_TARGET', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'duplicate', ticket_goc_id: 'tk-pj-SAI-1' },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'INVALID_DUPLICATE_TARGET' });
    });

    it('gốc ở WORKSPACE KHÁC → 422 INVALID_DUPLICATE_TARGET (không lộ, không nối)', async () => {
      const ngoai = await dungTicketWorkspaceKhac();
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'duplicate', ticket_goc_id: ngoai },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'INVALID_DUPLICATE_TARGET' });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
    });

    it('gốc HỢP LỆ → 200, ticket Trùng và liên kết trùng được lưu', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'duplicate', ticket_goc_id: 'tk-pj-SAI-2' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('duplicate');

      const d = await env.DB.prepare('SELECT trung_voi_ticket_id FROM ticket WHERE id = ?')
        .bind('tk-pj-SAI-1')
        .first<{ trung_voi_ticket_id: string | null }>();
      expect(d?.trung_voi_ticket_id).toBe('tk-pj-SAI-2');
    });
  });
});

/* ================================================================== *
 * Luật 7 — Mở lại ticket đã kết: chỉ chủ (SPEC mục 4 dòng 138)
 * ================================================================== */

describe('SPEC mục 4 — mở lại ticket nhóm `closed` chỉ chủ làm được', () => {
  it('luật thuần: không phải chủ → FORBIDDEN, trạng thái giữ nguyên', () => {
    for (const hien of ['done', 'canceled', 'duplicate'] as const) {
      const kq = apDungLuat(
        { loai: 'doi_tay', dich: 'todo' },
        bc({ trang_thai: hien, la_chu: false }),
      );
      expect(kq.loi?.ma, hien).toBe('FORBIDDEN');
      expect(kq.trang_thai, hien).toBe(hien);
    }
  });

  it('luật thuần: chủ → về Cần làm', () => {
    const kq = apDungLuat(
      { loai: 'doi_tay', dich: 'todo' },
      bc({ trang_thai: 'canceled', la_chu: true }),
    );
    expect(kq).toEqual({ trang_thai: 'todo' });
  });

  describe('qua HTTP', () => {
    beforeEach(async () => {
      await dungWorkspace();
      await dungDuAn('SAI', 'Sample');
      await dungTicket('pj-SAI', 1, 'Việc đã huỷ', { trang_thai: 'canceled' });
      await dungAgentCoToken({
        id: 'ag-coord',
        ten: 'CoS',
        vai_tro: 'coordinator',
        token: TOKEN_COORD,
        vao_tat_ca_du_an: true,
      });
      await dungAgentCoToken({
        id: 'ag-mgr',
        ten: 'M-Sample',
        vai_tro: 'manager',
        token: TOKEN_MGR,
        du_an: ['pj-SAI'],
      });
    });

    it.each([
      ['coordinator', TOKEN_COORD],
      ['manager', TOKEN_MGR],
    ])('agent %s mở lại → 403 FORBIDDEN, ticket vẫn Huỷ', async (_vai_tro, token) => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', token, {
        method: 'POST',
        than: { trang_thai: 'todo' },
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('canceled');
    });

    it('CHỦ mở lại → 200, ticket về Cần làm và `ly_do_huy` được xoá', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'todo' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
    });
  });
});

/* ================================================================== *
 * Luật 10 — Chủ tự làm "Tôi làm" (SPEC 19.10, bậc 4 của 19.1)
 * ================================================================== */

describe('SPEC 19.10 — nút "Tôi làm" của chủ', () => {
  beforeEach(async () => {
    await moiTruongMotTicket('todo');
  });

  it('ĐẠT: ticket sang Đang làm, `chu_tu_lam` bật, người đang cầm là CHỦ (bậc 4)', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
      method: 'POST',
      than: { bat: true },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ trang_thai: 'in_progress', chu_tu_lam: true });
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('in_progress');

    const doc = await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU);
    expect(await doc.json()).toMatchObject({
      chu_tu_lam: true,
      nguoi_dang_cam: { loai: 'owner' },
      bac_nguoi_cam: 4,
    });
  });

  it('BỊ TỪ CHỐI: agent bấm "Tôi làm" → 403 FORBIDDEN', async () => {
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_COORD, {
      method: 'POST',
      than: { bat: true },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
  });

  it('"Vào Xong vẫn qua cổng": sau "Tôi làm", đổi sang Xong → 422 EVIDENCE_REQUIRED', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
      method: 'POST',
      than: { bat: true },
    });
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'EVIDENCE_REQUIRED' });
    // Ticket đang nhóm `active` nên sang Chờ kiểm chứng (19.2).
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('verifying');
  });

  it('"chủ ép được" (19.10): ép Xong kèm lý do thì ĐẠT, và chủ thôi cầm', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
      method: 'POST',
      than: { bat: true },
    });
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Tự làm, đã live' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('done');

    // `chu_tu_lam` tắt khi ticket rời nhóm `active` (SPEC 19.10 gắn "Tôi làm" với
    // Đang làm), nên người đang cầm về trống — bậc 5 của 19.1.
    const doc = await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU);
    expect(await doc.json()).toMatchObject({
      chu_tu_lam: false,
      nguoi_dang_cam: null,
      bac_nguoi_cam: 5,
    });
  });

  it('bỏ "Tôi làm" (`bat: false`) → người đang cầm về trống, trạng thái không đổi', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
      method: 'POST',
      than: { bat: true },
    });
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
      method: 'POST',
      than: { bat: false },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('in_progress');

    const doc = await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU);
    expect(await doc.json()).toMatchObject({ chu_tu_lam: false, nguoi_dang_cam: null });
  });
});

/* ================================================================== *
 * Luật 11 — Ticket điều phối tự theo ticket dự án (SPEC 19.4 + 19.11)
 * ================================================================== */

describe('SPEC 19.4 + 19.11 — trạng thái ticket điều phối', () => {
  it('luật thuần: có ≥1 ticket dự án nhóm `active` → Đang làm', () => {
    expect(trangThaiDieuPhoiTheo(['done', 'in_progress', 'todo'])).toEqual({
      doi: true,
      trang_thai: 'in_progress',
    });
    expect(trangThaiDieuPhoiTheo(['verifying'])).toEqual({
      doi: true,
      trang_thai: 'in_progress',
    });
  });

  it('luật thuần: tất cả đã kết và ≥1 Xong → Xong', () => {
    expect(trangThaiDieuPhoiTheo(['done', 'canceled', 'duplicate'])).toEqual({
      doi: true,
      trang_thai: 'done',
    });
  });

  it('luật thuần: tất cả Huỷ/Trùng → Huỷ, lý do đúng chữ SPEC 19.4', () => {
    expect(trangThaiDieuPhoiTheo(['canceled', 'duplicate'])).toEqual({
      doi: true,
      trang_thai: 'canceled',
      ly_do_huy: LY_DO_HUY_DIEU_PHOI,
    });
    expect(LY_DO_HUY_DIEU_PHOI).toBe('mọi ticket dự án đã huỷ');
  });

  it('luật thuần (19.11): chưa có cái nào `active` và chưa kết hết → **giữ nguyên**', () => {
    expect(trangThaiDieuPhoiTheo(['todo', 'done'])).toEqual({ doi: false });
    expect(trangThaiDieuPhoiTheo(['backlog'])).toEqual({ doi: false });
    // Chưa nối ticket dự án nào thì cũng không tự nhảy trạng thái.
    expect(trangThaiDieuPhoiTheo([])).toEqual({ doi: false });
  });

  it('luật thuần: ticket điều phối **không qua cổng bằng chứng** (19.4)', () => {
    const kq = apDungLuat(
      { loai: 'doi_tay', dich: 'done' },
      bc({ trang_thai: 'in_progress', la_dieu_phoi: true, cong: CONG_CHUA_DU }),
    );
    expect(kq).toEqual({ trang_thai: 'done' });
  });

  describe('qua HTTP: lan toả từ ticket dự án lên ticket điều phối', () => {
    beforeEach(async () => {
      await dungWorkspace();
      await dungDuAn('COS', 'Điều phối');
      await dungDuAn('SAI', 'Sample');
      // Ticket điều phối ở dự án COS, nối `dieu_phoi` tới ticket dự án.
      await dungTicket('pj-COS', 1, '[Giao M-Sample] Làm việc A', { trang_thai: 'todo' });
      await dungTicket('pj-SAI', 1, 'Việc A', { trang_thai: 'todo' });
      await dungLienKet('tk-pj-COS-1', 'tk-pj-SAI-1', 'dieu_phoi');
    });

    it('ticket dự án sang Đang làm → ticket điều phối cũng Đang làm', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'in_progress' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('in_progress');
    });

    it('ticket dự án duy nhất vào Xong → ticket điều phối Xong', async () => {
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done', ep: true, ly_do: 'Đã merge' },
      });
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('done');
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('done');
    });

    it('mọi ticket dự án Huỷ → ticket điều phối Huỷ, lý do đúng chữ SPEC 19.4', async () => {
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: 'Bỏ hướng này' },
      });
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('canceled');

      const d = await env.DB.prepare('SELECT ly_do_huy FROM ticket WHERE id = ?')
        .bind('tk-pj-COS-1')
        .first<{ ly_do_huy: string | null }>();
      expect(d?.ly_do_huy).toBe(LY_DO_HUY_DIEU_PHOI);
    });

    it('19.11: ticket dự án còn ở nhóm `planned` → ticket điều phối GIỮ NGUYÊN', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'backlog' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('backlog');
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('todo');
    });

    it('lan toả CHỈ MỘT CHIỀU: đổi ticket điều phối không đụng ticket dự án (19.4)', async () => {
      await goiApi('/v1/ticket/tk-pj-COS-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'in_progress' },
      });
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('in_progress');
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
    });

    it('một ticket điều phối nối NHIỀU ticket dự án: còn 1 cái `active` thì vẫn Đang làm', async () => {
      await dungTicket('pj-SAI', 2, 'Việc B', { trang_thai: 'in_progress' });
      await dungLienKet('tk-pj-COS-1', 'tk-pj-SAI-2', 'dieu_phoi');

      // Huỷ cái thứ nhất; cái thứ hai vẫn đang làm.
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: 'Gộp sang việc B' },
      });
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('in_progress');
    });

    it('CHỦ bấm "Tôi làm" trên ticket dự án cũng lan lên ticket điều phối (19.4)', async () => {
      // `/toi-lam` kéo ticket dự án sang Đang làm, nên nó là một lần "ticket dự
      // án đổi trạng thái" y như `baton status` — phải lan y như vậy.
      const res = await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
        method: 'POST',
        than: { bat: true },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('in_progress');
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('in_progress');

      // Và dòng lịch sử của ticket điều phối ghi người làm là **hệ thống**.
      const d = await env.DB.prepare(
        `SELECT tac_gia_loai FROM ticket_history
          WHERE ticket_id = ? AND truong = 'trang_thai'`,
      )
        .bind('tk-pj-COS-1')
        .first<{ tac_gia_loai: string }>();
      expect(d?.tac_gia_loai).toBe('system');
    });

    it('"Tôi làm" KHÔNG kéo được trạng thái thì cũng không lan (ticket đã `active`)', async () => {
      await goiApi('/v1/ticket/tk-pj-COS-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'verifying' },
      });
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'verifying' },
      });
      // Ticket dự án `verifying` đã là nhóm `active` nên điều phối đã `in_progress`.
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('in_progress');

      await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
        method: 'POST',
        than: { bat: true },
      });
      // "Tôi làm" không đổi trạng thái ticket dự án (đang `active`), nên không lan.
      expect(await trangThaiCua('tk-pj-SAI-1')).toBe('verifying');
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('in_progress');
    });

    it('19.11 — con cuối cùng kết thì CHA tự kiểm cổng lại, tác giả là "hệ thống"', async () => {
      /*
       * Cổng bằng chứng lượt này luôn "chưa đủ", nên ca duy nhất kiểm được **hôm
       * nay** là cha **ticket điều phối**: 19.4 cho nó không qua cổng. Ca này
       * cũng là cái canh `Math.max(0, soConChuaKet - 1)` trong
       * `kiemLaiCongCuaCha` — trạng thái mới của con chưa vào DB lúc đếm, nên
       * thiếu phép trừ đó thì cha mãi không bao giờ tự lên Xong.
       */
      await dungTicket('pj-SAI', 9, 'Ticket con của ticket điều phối', {
        trang_thai: 'in_progress',
      });
      await dungLienKet('tk-pj-COS-1', 'tk-pj-SAI-9', 'parent');
      await goiApi('/v1/ticket/tk-pj-COS-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'verifying' },
      });
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('verifying');

      // Con cuối cùng kết → cha tự kiểm cổng lại và vào Xong.
      const res = await goiApi('/v1/ticket/tk-pj-SAI-9/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: 'Không cần nữa' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('done');

      const { results } = await env.DB.prepare(
        `SELECT tac_gia_loai, gia_tri_cu, gia_tri_moi FROM ticket_history
          WHERE ticket_id = ? AND truong = 'trang_thai' ORDER BY luc`,
      )
        .bind('tk-pj-COS-1')
        .all<{ tac_gia_loai: string; gia_tri_cu: string; gia_tri_moi: string }>();
      expect(results.at(-1)).toMatchObject({
        tac_gia_loai: 'system',
        gia_tri_cu: 'verifying',
        gia_tri_moi: 'done',
      });
    });

    it('19.11 — con CHƯA kết hết thì cha vẫn nằm ở Chờ kiểm chứng', async () => {
      await dungTicket('pj-SAI', 9, 'Con một', { trang_thai: 'in_progress' });
      await dungTicket('pj-SAI', 10, 'Con hai', { trang_thai: 'in_progress' });
      await dungLienKet('tk-pj-COS-1', 'tk-pj-SAI-9', 'parent');
      await dungLienKet('tk-pj-COS-1', 'tk-pj-SAI-10', 'parent');
      await goiApi('/v1/ticket/tk-pj-COS-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'verifying' },
      });

      await goiApi('/v1/ticket/tk-pj-SAI-9/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: 'Bỏ con một' },
      });
      // Còn con hai chưa kết → cha chưa được tự lên Xong.
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('verifying');

      await goiApi('/v1/ticket/tk-pj-SAI-10/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: 'Bỏ con hai' },
      });
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('done');
    });

    it('ticket điều phối **không qua cổng**: đổi tay sang Xong ĐẠT, không cần ép', async () => {
      const res = await goiApi('/v1/ticket/tk-pj-COS-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'done' },
      });
      expect(res.status).toBe(200);
      expect(await trangThaiCua('tk-pj-COS-1')).toBe('done');
      // Và không mang nhãn "xong không bằng chứng" vì không phải ép.
      const doc = await goiApi('/v1/ticket/tk-pj-COS-1', TOKEN_CHU);
      expect(await doc.json()).toMatchObject({
        la_dieu_phoi: true,
        co: { xong_khong_bang_chung: false },
      });
    });
  });
});

/* ================================================================== *
 * Luật 12 — Đổi trạng thái theo bảng quyền SPEC mục 3
 * ================================================================== */

describe('SPEC mục 3 — ai đổi được trạng thái ticket', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungDuAn('INC', 'INC');
    await dungTicket('pj-SAI', 1, 'Việc SAI');
    await dungTicket('pj-INC', 1, 'Việc INC');

    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
    await dungAgentCoToken({
      id: 'ag-mgr',
      ten: 'M-Sample',
      vai_tro: 'manager',
      token: TOKEN_MGR,
      du_an: ['pj-SAI'],
    });
    await dungAgentCoToken({
      id: 'ag-worker',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: TOKEN_WORKER,
      du_an: ['pj-SAI'],
    });
    await dungAgentCoToken({
      id: 'ag-reviewer',
      ten: 'W-reviewer',
      vai_tro: 'reviewer',
      token: TOKEN_REVIEWER,
      du_an: ['pj-SAI'],
    });
  });

  it('`coordinator` ("có"): đổi được trong MỌI dự án được vào', async () => {
    for (const ticket of ['tk-pj-SAI-1', 'tk-pj-INC-1']) {
      const res = await goiApi(`/v1/ticket/${ticket}/trang-thai`, TOKEN_COORD, {
        method: 'POST',
        than: { trang_thai: 'in_progress' },
      });
      expect(res.status, ticket).toBe(200);
      expect(await trangThaiCua(ticket)).toBe('in_progress');
    }
  });

  it('`manager` ("trong dự án"): ĐẠT trong dự án mình được vào', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_MGR, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(res.status).toBe(200);
  });

  // BAT-58 (19.12 câu 15, `cau-hoi-spec.md` #176): trước ghim 403 FORBIDDEN; nay
  // ticket người gọi không thấy ra 404 GIỐNG HỆT id bịa (403 cho id thật là máy dò).
  it('`manager`: BỊ TỪ CHỐI ở dự án không được vào → 404 NOT_FOUND giống hệt id bịa (BAT-58)', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-INC-1/trang-thai', TOKEN_MGR, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    const bia = await goiApi('/v1/ticket/tk-khong-co/trang-thai', TOKEN_MGR, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(await bia.json());
    expect(await trangThaiCua('tk-pj-INC-1')).toBe('todo');
  });

  it('`reviewer` ("—"): không đổi được trạng thái → 403 FORBIDDEN', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_REVIEWER, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
  });

  it('`worker` ("ticket của lượt mình"): chưa cầm lượt nào → 403 FORBIDDEN', async () => {
    // Bảng `luot_giao` là **phần 2**, nên `phamViLuotGiao` còn trả `false` cho mọi
    // ticket (mặc định ĐÓNG, xem `lenh-khung.ts`). Vì vậy ca ĐẠT của ô này chỉ
    // kiểm được ở tầng luật thuần dưới đây; qua HTTP thì hoãn tới phần 2.
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_WORKER, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
  });

  it('`worker` ĐẠT khi ticket LÀ của lượt mình (luật thuần — phần 2 nối dữ liệu)', () => {
    const ai = aiAgent('worker', { du_an_duoc_vao: ['pj-SAI'] });
    expect(
      quyen(ai, 'change_status', { project_id: 'pj-SAI', ticket_cua_luot_minh: true }),
    ).toEqual({ cho_phep: true });
    expect(
      quyen(ai, 'change_status', { project_id: 'pj-SAI', ticket_cua_luot_minh: false }),
    ).toMatchObject({ cho_phep: false, ma: 'FORBIDDEN' });
  });
});

/* ================================================================== *
 * Luật 16 — Mã tiếng Anh ở API, nhãn tiếng Việt ở thông điệp
 *   SPEC mục 0.1 + 13
 * ================================================================== */

describe('SPEC mục 0.1 + 13 — API nhận MÃ tiếng Anh, không nhận nhãn tiếng Việt', () => {
  beforeEach(async () => {
    await moiTruongMotTicket('todo');
  });

  it.each([
    ['Đang làm'],
    ['Cần làm'],
    ['Xong'],
    ['Chờ kiểm chứng'],
    ['Huỷ'],
    ['Trùng'],
    ['dang_lam'],
  ])('gửi nhãn/mã lạ "%s" làm trạng thái → 422 INVALID_INPUT', async (trang_thai) => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
  });

  it('thông điệp lỗi là **tiếng Việt**, dù mã lỗi là tiếng Anh', async () => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'Đang làm' },
    });
    const { error, message } = await res.json<{ error: string; message: string }>();
    expect(error).toBe('INVALID_INPUT');
    expect(message).toContain('Trạng thái ticket phải là một trong');
  });

  it.each([
    ['backlog'],
    ['todo'],
    ['in_progress'],
    ['verifying'],
  ])('mã tiếng Anh "%s" được nhận (các mã không qua cổng)', async (trang_thai) => {
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe(trang_thai);
  });

  it('phản hồi và đường đọc trả **cả mã lẫn nhãn** (SPEC mục 0.1)', async () => {
    await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'verifying' },
    });
    const doc = await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU);
    expect(await doc.json()).toMatchObject({
      trang_thai: 'verifying',
      nhan_trang_thai: 'Chờ kiểm chứng',
      nhom_trang_thai: 'active',
    });
  });
});

/* ================================================================== *
 * BAT-64 — Bảng có cột Backlog (SPEC mục 14, T-111 A): kéo giữa cột Backlog
 * và cột Cần làm đi qua đúng đường đổi trạng thái của chủ. Chỉ test, không
 * đổi luật: `apDungLuat` (nhánh `doi_tay`) không có điều kiện riêng cho cặp
 * này nên nó rơi xuống `return { trang_thai: dich }`; rời nhóm `closed` sang
 * Backlog vẫn "chỉ chủ" (SPEC mục 4, `cau-hoi-spec.md` #18).
 * ================================================================== */

describe('SPEC mục 14 (BAT-64) — kéo giữa cột Backlog và Cần làm', () => {
  it('chủ: Cần làm → Backlog → 200, ticket ở `backlog`', async () => {
    await moiTruongMotTicket('todo');
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'backlog' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('backlog');
  });

  it('chủ: Backlog → Cần làm → 200, ticket ở `todo`', async () => {
    await moiTruongMotTicket('backlog');
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'todo' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('todo');
  });

  it('kéo ticket đã kết vào cột Backlog: agent → 403 FORBIDDEN (giữ nguyên), chủ → 200', async () => {
    await moiTruongMotTicket('done');
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
    const tu_choi = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_COORD, {
      method: 'POST',
      than: { trang_thai: 'backlog' },
    });
    expect(tu_choi.status).toBe(403);
    expect(await tu_choi.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('done');

    const dat = await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'backlog' },
    });
    expect(dat.status).toBe(200);
    expect(await trangThaiCua('tk-pj-SAI-1')).toBe('backlog');
  });
});

/* ================================================================== *
 * Các sự kiện của SPEC 19.2 mà phần 2 sẽ nối vào
 * (luật cài đủ ở lượt này, nên phải có test ngay — nếu không, phần 2
 *  sửa nhầm cũng không đỏ test nào)
 * ================================================================== */

describe('SPEC mục 4 dòng 134 + 19.2 — sự kiện lượt giao (luật thuần)', () => {
  it('mở lượt giao cho ticket nhóm `planned` → Đang làm; `active`/`closed` giữ nguyên', () => {
    expect(apDungLuat({ loai: 'mo_luot_giao' }, bc({ trang_thai: 'todo' }))).toEqual({
      trang_thai: 'in_progress',
    });
    expect(apDungLuat({ loai: 'mo_luot_giao' }, bc({ trang_thai: 'backlog' }))).toEqual({
      trang_thai: 'in_progress',
    });
    // Mở lượt review trên ticket đang Chờ kiểm chứng **không** kéo nó về Đang làm.
    expect(apDungLuat({ loai: 'mo_luot_giao' }, bc({ trang_thai: 'verifying' }))).toEqual({
      trang_thai: 'verifying',
    });
    expect(apDungLuat({ loai: 'mo_luot_giao' }, bc({ trang_thai: 'done' }))).toEqual({
      trang_thai: 'done',
    });
  });

  it('nộp `done`: cổng đủ → Xong, thiếu → Chờ kiểm chứng, và **không phải lỗi**', () => {
    expect(
      apDungLuat({ loai: 'nop', ket_qua: 'done' }, bc({ trang_thai: 'in_progress', cong: CONG_DU })),
    ).toEqual({ trang_thai: 'done' });
    const thieu = apDungLuat({ loai: 'nop', ket_qua: 'done' }, bc({ trang_thai: 'in_progress' }));
    expect(thieu).toEqual({ trang_thai: 'verifying' });
    expect(thieu.loi).toBeUndefined();
  });

  it('nộp `partial` → giữ Đang làm; nộp `blocked` → về Cần làm', () => {
    expect(
      apDungLuat({ loai: 'nop', ket_qua: 'partial' }, bc({ trang_thai: 'in_progress' })),
    ).toEqual({ trang_thai: 'in_progress' });
    expect(
      apDungLuat({ loai: 'nop', ket_qua: 'blocked' }, bc({ trang_thai: 'in_progress' })),
    ).toEqual({ trang_thai: 'todo' });
  });

  it('nghiệm thu `accepted`: chưa Xong thì kiểm cổng ngay; `returned` giữ Đang làm', () => {
    expect(
      apDungLuat({ loai: 'nghiem_thu', ket_qua: 'accepted' }, bc({ trang_thai: 'in_progress' })),
    ).toEqual({ trang_thai: 'verifying' });
    expect(
      apDungLuat(
        { loai: 'nghiem_thu', ket_qua: 'accepted' },
        bc({ trang_thai: 'in_progress', cong: CONG_DU }),
      ),
    ).toEqual({ trang_thai: 'done' });
    expect(
      apDungLuat({ loai: 'nghiem_thu', ket_qua: 'returned' }, bc({ trang_thai: 'verifying' })),
    ).toEqual({ trang_thai: 'in_progress' });
  });

  it('lượt bị huỷ: không còn lượt mở → về Cần làm; còn lượt mở → giữ nguyên', () => {
    expect(
      apDungLuat({ loai: 'luot_huy', con_luot_mo: false }, bc({ trang_thai: 'in_progress' })),
    ).toEqual({ trang_thai: 'todo' });
    expect(
      apDungLuat({ loai: 'luot_huy', con_luot_mo: true }, bc({ trang_thai: 'in_progress' })),
    ).toEqual({ trang_thai: 'in_progress' });
  });

  it('lượt bị huỷ KHÔNG hạ ticket đã kết: `done` và `canceled` giữ nguyên (19.3, mục 4 d.138)', () => {
    // 19.3 "Ticket đã Xong không bị hạ" — huỷ một lượt không được kéo nó về Cần làm.
    expect(
      apDungLuat({ loai: 'luot_huy', con_luot_mo: false }, bc({ trang_thai: 'done' })),
    ).toEqual({ trang_thai: 'done' });
    // Mục 4 dòng 138 + `cau-hoi-spec.md` #18: rời nhóm `closed` chỉ chủ làm được,
    // nên `huy` lượt (đường của agent người giao) không được là cửa sau.
    expect(
      apDungLuat({ loai: 'luot_huy', con_luot_mo: false }, bc({ trang_thai: 'canceled' })),
    ).toEqual({ trang_thai: 'canceled' });
  });

  it('`kiem_cong_lai` CHỈ áp cho ticket ở Chờ kiểm chứng, và ghi người làm là "hệ thống"', () => {
    const len = apDungLuat({ loai: 'kiem_cong_lai' }, bc({ trang_thai: 'verifying', cong: CONG_DU }));
    expect(len).toEqual({ trang_thai: 'done', he_thong: true });

    // SPEC 19.2: commit merge khi ticket còn Đang làm thì *chưa có gì xảy ra*.
    expect(
      apDungLuat({ loai: 'kiem_cong_lai' }, bc({ trang_thai: 'in_progress', cong: CONG_DU })),
    ).toEqual({ trang_thai: 'in_progress' });
    // Còn con chưa kết thì vẫn nằm ở Chờ kiểm chứng (19.11).
    expect(
      apDungLuat(
        { loai: 'kiem_cong_lai' },
        bc({ trang_thai: 'verifying', con_chua_ket: 1, cong: CONG_DU }),
      ),
    ).toEqual({ trang_thai: 'verifying' });
  });

  it('đổi sang chính trạng thái đang có: không lỗi, không đổi gì', () => {
    expect(apDungLuat({ loai: 'doi_tay', dich: 'done' }, bc({ trang_thai: 'done' }))).toEqual({
      trang_thai: 'done',
    });
  });
});
