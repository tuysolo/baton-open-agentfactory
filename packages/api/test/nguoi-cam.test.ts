/**
 * **Người đang cầm** và cờ **"Đang làm mà không ai cầm"** — SPEC mục 4
 * (dòng 115, 139) + SPEC 19.1, 19.10.
 *
 * Thời gian **luôn tiêm vào qua tham số**: `tinhCoKhongAiCam(t, bay_gio)` và
 * `ticketDangCanBatCo(db, ws, bay_gio)` không gọi `Date.now()`. Test ngưỡng 24
 * giờ bằng giờ thật thì hoặc phải chờ một ngày, hoặc phải giả lập đồng hồ toàn
 * cục — cả hai đều tệ hơn một tham số.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  NGUONG_KHONG_AI_CAM_MS,
  TRANG_THAI_TICKET,
  nguoiDangCam,
  nhomTrangThai,
  tinhCoKhongAiCam,
  type TacGia,
  type TrangThaiTicket,
} from '@baton/shared';
import { SQL_TICKET_CAN_BAT_CO, ticketDangCanBatCo } from '../src/doc-ticket.js';
import { boiCanhNguoiCamCua } from '../src/doc-luot-giao.js';
import {
  TOKEN_CHU,
  WS,
  dungAgent,
  dungDuAn,
  dungLuotGiao,
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

const REVIEWER: TacGia = { loai: 'agent', agentId: 'ag-reviewer' };
const WORKER: TacGia = { loai: 'agent', agentId: 'ag-worker' };
const NGUOI_GIAO: TacGia = { loai: 'agent', agentId: 'ag-manager' };
const CHU_RA: TacGia = { loai: 'owner' };

/* ================================================================== *
 * Luật 9 — Người đang cầm, 5 bậc theo đúng thứ tự của SPEC 19.1
 * ================================================================== */

describe('SPEC 19.1 — người đang cầm: thứ tự ưu tiên 5 bậc', () => {
  it('bậc 1 — agent của lượt `review` MỞ thắng mọi bậc dưới', () => {
    expect(
      nguoiDangCam(
        { chu_tu_lam: true },
        {
          luot_review_mo: REVIEWER,
          luot_worker_mo: WORKER,
          nguoi_giao_luot_submitted: NGUOI_GIAO,
        },
      ),
    ).toEqual({ nguoi: REVIEWER, bac: 1, cho_nghiem_thu: false });
  });

  it('bậc 2 — không có lượt review mở thì là agent của lượt `worker` mở', () => {
    expect(
      nguoiDangCam(
        { chu_tu_lam: true },
        { luot_worker_mo: WORKER, nguoi_giao_luot_submitted: NGUOI_GIAO },
      ),
    ).toEqual({ nguoi: WORKER, bac: 2, cho_nghiem_thu: false });
  });

  it('bậc 3 — lượt `submitted` chờ nghiệm thu: **người giao**, và cờ "chờ … nghiệm thu"', () => {
    expect(
      nguoiDangCam({ chu_tu_lam: true }, { nguoi_giao_luot_submitted: NGUOI_GIAO }),
    ).toEqual({ nguoi: NGUOI_GIAO, bac: 3, cho_nghiem_thu: true });
  });

  it('bậc 4 — chủ bấm "Tôi làm" (SPEC 19.10)', () => {
    expect(nguoiDangCam({ chu_tu_lam: true })).toEqual({
      nguoi: CHU_RA,
      bac: 4,
      cho_nghiem_thu: false,
    });
  });

  it('bậc 5 — không có ai: TRỐNG', () => {
    expect(nguoiDangCam({ chu_tu_lam: false })).toEqual({
      nguoi: null,
      bac: 5,
      cho_nghiem_thu: false,
    });
  });

  it('bối cảnh `null`/`undefined` tính như "không có lượt đó", không nhảy bậc sai', () => {
    expect(
      nguoiDangCam(
        { chu_tu_lam: false },
        { luot_review_mo: null, luot_worker_mo: undefined, nguoi_giao_luot_submitted: null },
      ),
    ).toEqual({ nguoi: null, bac: 5, cho_nghiem_thu: false });
  });

  it('người đang cầm là TỰ TÍNH: đường đọc ticket không có cột nào để sửa tay', async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungTicket('pj-SAI', 1, 'Việc', { trang_thai: 'in_progress' });

    // Thử khai thẳng `nguoi_dang_cam` qua đường sửa ticket: whitelist bỏ trường
    // lạ (SPEC mục 4 "tự tính từ mục 5, **không sửa tay**").
    const res = await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU, {
      method: 'PATCH',
      than: { nguoi_dang_cam: { loai: 'agent', agentId: 'ag-gia' }, tieu_de: 'Việc đã sửa' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ da_doi: ['tieu_de'], bo_qua: ['nguoi_dang_cam'] });

    const doc = await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU);
    expect(await doc.json()).toMatchObject({ nguoi_dang_cam: null, bac_nguoi_cam: 5 });
  });
});

/* ================================================================== *
 * Luật 8 — Cờ "Đang làm mà không ai cầm"
 *   SPEC mục 4 dòng 139 + 19.1 (ưu tiên hơn: nhóm `active`, 24 giờ)
 * ================================================================== */

describe('SPEC mục 4 + 19.1 — cờ "Đang làm mà không ai cầm"', () => {
  const MOC = 1_800_000_000_000;

  it('ngưỡng đúng 24 giờ', () => {
    expect(NGUONG_KHONG_AI_CAM_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('BẬT: nhóm `active`, không ai cầm, đã QUÁ ngưỡng', () => {
    for (const tt of ['in_progress', 'verifying'] as const) {
      expect(
        tinhCoKhongAiCam(
          { trang_thai: tt, co_nguoi_cam: false, trong_tay_tu_luc: MOC },
          MOC + NGUONG_KHONG_AI_CAM_MS,
        ),
        tt,
      ).toBe(true);
      expect(
        tinhCoKhongAiCam(
          { trang_thai: tt, co_nguoi_cam: false, trong_tay_tu_luc: MOC },
          MOC + NGUONG_KHONG_AI_CAM_MS + 1,
        ),
        tt,
      ).toBe(true);
    }
  });

  it('TẮT: DƯỚI ngưỡng (kể cả thiếu 1 ms)', () => {
    expect(
      tinhCoKhongAiCam(
        { trang_thai: 'in_progress', co_nguoi_cam: false, trong_tay_tu_luc: MOC },
        MOC + NGUONG_KHONG_AI_CAM_MS - 1,
      ),
    ).toBe(false);
    expect(
      tinhCoKhongAiCam(
        { trang_thai: 'in_progress', co_nguoi_cam: false, trong_tay_tu_luc: MOC },
        MOC,
      ),
    ).toBe(false);
  });

  it('TẮT: có người cầm, dù đã quá ngưỡng', () => {
    expect(
      tinhCoKhongAiCam(
        { trang_thai: 'in_progress', co_nguoi_cam: true, trong_tay_tu_luc: MOC },
        MOC + 10 * NGUONG_KHONG_AI_CAM_MS,
      ),
    ).toBe(false);
  });

  it('TẮT: ticket nhóm `planned` hoặc `closed` (19.1 nói "nhóm `active`")', () => {
    const ngoai_active = (Object.keys(TRANG_THAI_TICKET) as TrangThaiTicket[]).filter(
      (t) => nhomTrangThai(t) !== 'active',
    );
    expect(ngoai_active.sort()).toEqual(
      ['backlog', 'canceled', 'done', 'duplicate', 'todo'].sort(),
    );
    for (const tt of ngoai_active) {
      expect(
        tinhCoKhongAiCam(
          { trang_thai: tt, co_nguoi_cam: false, trong_tay_tu_luc: MOC },
          MOC + 10 * NGUONG_KHONG_AI_CAM_MS,
        ),
        tt,
      ).toBe(false);
    }
  });

  it('TẮT: chưa có mốc bắt đầu (`trong_tay_tu_luc` null) thì không có gì "kéo dài"', () => {
    expect(
      tinhCoKhongAiCam(
        { trang_thai: 'in_progress', co_nguoi_cam: false, trong_tay_tu_luc: null },
        MOC + 10 * NGUONG_KHONG_AI_CAM_MS,
      ),
    ).toBe(false);
  });

  it('19.1 ưu tiên hơn mục 4: ticket ở **Chờ kiểm chứng** không ai cầm cũng bật cờ', () => {
    // Mục 4 dòng 139 chỉ nói "ở Đang làm"; 19.1 nói "nhóm `active`" — và mục 19.x
    // ưu tiên hơn (SPEC dòng 464). Khác biệt thật, nên có ca riêng.
    expect(
      tinhCoKhongAiCam(
        { trang_thai: 'verifying', co_nguoi_cam: false, trong_tay_tu_luc: MOC },
        MOC + NGUONG_KHONG_AI_CAM_MS,
      ),
    ).toBe(true);
  });

  describe('`ticketDangCanBatCo` — phần đọc của việc nền, thời gian tiêm vào', () => {
    beforeEach(async () => {
      await dungWorkspace();
      await dungDuAn('SAI', 'Sample');
      // 1: active, không ai cầm, mốc = MOC → đủ điều kiện khi quá 24 giờ.
      await dungTicket('pj-SAI', 1, 'Không ai cầm', {
        trang_thai: 'in_progress',
        trong_tay_tu_luc: MOC,
      });
      // 2: active nhưng CHỦ đang cầm → không bao giờ bật.
      await dungTicket('pj-SAI', 2, 'Chủ tự làm', {
        trang_thai: 'in_progress',
        chu_tu_lam: true,
        trong_tay_tu_luc: MOC,
      });
      // 3: nhóm `planned` → không bật.
      await dungTicket('pj-SAI', 3, 'Cần làm', {
        trang_thai: 'todo',
        trong_tay_tu_luc: MOC,
      });
      // 4: Chờ kiểm chứng, không ai cầm → bật (19.1).
      await dungTicket('pj-SAI', 4, 'Chờ kiểm chứng', {
        trang_thai: 'verifying',
        trong_tay_tu_luc: MOC,
      });
    });

    it('DƯỚI ngưỡng: không ticket nào cần bật cờ', async () => {
      const ds = await ticketDangCanBatCo(env.DB, WS, MOC + NGUONG_KHONG_AI_CAM_MS - 1);
      expect(ds).toEqual([]);
    });

    it('QUÁ ngưỡng: đúng hai ticket nhóm `active` không ai cầm', async () => {
      const ds = await ticketDangCanBatCo(env.DB, WS, MOC + NGUONG_KHONG_AI_CAM_MS);
      expect(ds.sort()).toEqual(['tk-pj-SAI-1', 'tk-pj-SAI-4']);
    });

    it('ticket đã bật cờ rồi thì không trả lại (không bắn hai lần)', async () => {
      await env.DB.prepare('UPDATE ticket SET co_khong_ai_cam = 1 WHERE id = ?')
        .bind('tk-pj-SAI-1')
        .run();
      const ds = await ticketDangCanBatCo(env.DB, WS, MOC + NGUONG_KHONG_AI_CAM_MS);
      expect(ds).toEqual(['tk-pj-SAI-4']);
    });
  });

  /* ================================================================ *
   * `ticketDangCanBatCo` × lượt giao thật — SPEC 19.1 bậc 1–3
   * ================================================================ *
   * `ticketDangCanBatCo` loại ba bậc đầu của 19.1 ngay trong SQL bằng
   * `NOT EXISTS (… luot_giao … 'pending','in_progress','submitted')`. Fixture
   * của khối trên **không có dòng `luot_giao` nào**, nên mệnh đề đó chưa từng
   * chạy với dữ liệu thật: xoá nó đi test vẫn xanh. Khối này lấp đúng chỗ ấy.
   */
  describe('`ticketDangCanBatCo` × lượt giao thật (19.1 bậc 1–3)', () => {
    /** Mọi ticket dưới đây đều ở nhóm `active` và đã quá 24 giờ không ai cầm. */
    const KHI_DO = MOC + NGUONG_KHONG_AI_CAM_MS;

    beforeEach(async () => {
      await dungWorkspace();
      await dungDuAn('SAI', 'Sample');
      await dungAgent('ag-worker', 'W-builder', 'worker');
      await dungAgent('ag-reviewer', 'W-reviewer', 'reviewer');
      await dungAgent('ag-manager', 'M-Sample', 'manager');

      // 1 — không lượt nào: chứng tỏ các ticket dưới đây **chắc chắn** sẽ bị trả
      // về nếu không có lượt giao.
      await dungTicket('pj-SAI', 1, 'Không ai cầm thật', {
        trang_thai: 'in_progress',
        trong_tay_tu_luc: MOC,
      });
      // 2 — bậc 2: lượt `work` MỞ.
      await dungTicket('pj-SAI', 2, 'Có lượt work mở', {
        trang_thai: 'in_progress',
        trong_tay_tu_luc: MOC,
      });
      await dungLuotGiao('lg-work', 'tk-pj-SAI-2', 'ag-worker', { trang_thai: 'in_progress' });
      // 3 — bậc 1: lượt `review` MỞ.
      await dungTicket('pj-SAI', 3, 'Có lượt review mở', {
        trang_thai: 'verifying',
        trong_tay_tu_luc: MOC,
      });
      await dungLuotGiao('lg-review', 'tk-pj-SAI-3', 'ag-reviewer', { loai: 'review' });
      // 4 — bậc 3: lượt `submitted` chờ nghiệm thu.
      await dungTicket('pj-SAI', 4, 'Có lượt đã nộp', {
        trang_thai: 'verifying',
        trong_tay_tu_luc: MOC,
      });
      await dungLuotGiao('lg-sub', 'tk-pj-SAI-4', 'ag-worker', {
        trang_thai: 'submitted',
        nguoi_giao_agent_id: 'ag-manager',
      });
      // 5 — lượt đã ĐÓNG: không còn ai cầm, nên **vẫn** phải bị trả về.
      await dungTicket('pj-SAI', 5, 'Lượt đã nghiệm thu xong', {
        trang_thai: 'in_progress',
        trong_tay_tu_luc: MOC,
      });
      await dungLuotGiao('lg-xong', 'tk-pj-SAI-5', 'ag-worker', { trang_thai: 'accepted' });
      // 6 — lượt đã huỷ: cũng không còn ai cầm.
      await dungTicket('pj-SAI', 6, 'Lượt đã huỷ', {
        trang_thai: 'in_progress',
        trong_tay_tu_luc: MOC,
      });
      await dungLuotGiao('lg-huy', 'tk-pj-SAI-6', 'ag-worker', { trang_thai: 'canceled' });
    });

    it('bậc 2 — ticket có lượt `work` MỞ thì KHÔNG bị tính là không ai cầm', async () => {
      const ds = await ticketDangCanBatCo(env.DB, WS, KHI_DO);
      expect(ds).not.toContain('tk-pj-SAI-2');
    });

    it('bậc 1 — ticket có lượt `review` MỞ thì KHÔNG bị tính là không ai cầm', async () => {
      const ds = await ticketDangCanBatCo(env.DB, WS, KHI_DO);
      expect(ds).not.toContain('tk-pj-SAI-3');
    });

    it('bậc 3 — ticket có lượt `submitted` (chờ nghiệm thu) cũng KHÔNG', async () => {
      const ds = await ticketDangCanBatCo(env.DB, WS, KHI_DO);
      expect(ds).not.toContain('tk-pj-SAI-4');
    });

    /**
     * **SPEC mục 1 — mọi đường đọc đều ràng `workspace_id`.**
     *
     * Câu con `NOT EXISTS` trên `luot_giao` trước lượt này chỉ ràng `ticket_id`,
     * tức đọc bảng `luot_giao` **xuyên workspace** — chỗ duy nhất trong dự án
     * lệch khỏi nếp đó.
     *
     * Kiểm bằng `EXPLAIN QUERY PLAN` chứ không bằng dữ liệu: khoá ngoại
     * `luot_giao.ticket_id → ticket.id` khiến một lượt của workspace khác không
     * thể mang `ticket_id` của workspace này, nên lỗi **không quan sát được bằng
     * hành vi** — chỉ thấy ở kế hoạch truy vấn. Gỡ mệnh đề `lg.workspace_id =
     * ticket.workspace_id` ra thì `ANY(workspace_id)` (skip-scan trên
     * `ix_luot_giao_ticket`) xuất hiện lại và ca này đỏ.
     */
    it('SPEC mục 1 — câu con `luot_giao` ràng workspace_id, EXPLAIN hết skip-scan', async () => {
      const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${SQL_TICKET_CAN_BAT_CO}`)
        .bind(WS)
        .all<{ detail: string }>();
      const ke_hoach = results.map((r) => r.detail).join(' | ');

      /*
       * Phải là **SEARCH … (workspace_id=? AND ticket_id=?)**: hai cột dẫn đầu
       * của `ix_luot_giao_ticket` đều là đẳng thức.
       *
       * Gỡ mệnh đề `lg.workspace_id = …` ra thì kế hoạch tụt xuống một trong hai
       * dạng tệ hơn, tuỳ số liệu thống kê của bảng: `SCAN lg USING COVERING
       * INDEX …` (DB nhỏ của test) hoặc `SEARCH … (ANY(workspace_id) AND
       * ticket_id=?)` — skip-scan (DB 200.000 ticket của bộ đo). Canh cả hai
       * nên ca này đỏ ở cả hai cỡ dữ liệu.
       */
      expect(ke_hoach).toContain(
        'SEARCH lg USING COVERING INDEX ix_luot_giao_ticket (workspace_id=? AND ticket_id=?)',
      );
      expect(ke_hoach).not.toContain('ANY(workspace_id)');
    });

    it('đối chứng: lượt đã ĐÓNG (`accepted`, `canceled`) thì ticket VẪN bị trả về', async () => {
      // Thiếu ca này thì ba ca trên vẫn xanh kể cả khi `NOT EXISTS` chặn nhầm
      // **mọi** lượt, tức cờ của 19.1 không bao giờ bật nữa.
      const ds = await ticketDangCanBatCo(env.DB, WS, KHI_DO);
      expect(ds.sort()).toEqual(['tk-pj-SAI-1', 'tk-pj-SAI-5', 'tk-pj-SAI-6']);
    });

    /**
     * **Đối chiếu hai đường trên cùng một bộ ticket biên.**
     *
     * Đường A: `ticketDangCanBatCo` (một câu SQL, có `NOT EXISTS`).
     * Đường B: tính tay bằng `boiCanhNguoiCamCua` + `nguoiDangCam` +
     * `tinhCoKhongAiCam` — tức đúng chuỗi luật của SPEC 19.1 ghép lại.
     *
     * Hai đường phải cho **cùng một tập id**. Đây là thứ canh cho lần sau ai đó
     * đổi mệnh đề SQL mà quên rằng nó đang thay cho ba bậc đầu của 19.1.
     */
    it('hai đường (SQL và luật thuần) cho CÙNG một tập id, trên bộ ticket biên', async () => {
      // Thêm ba ca biên nữa vào bộ đã có.
      await dungTicket('pj-SAI', 7, 'Chờ kiểm chứng + chủ tự làm', {
        trang_thai: 'verifying',
        chu_tu_lam: true,
        trong_tay_tu_luc: MOC,
      });
      await dungTicket('pj-SAI', 8, 'Đã bật cờ rồi', {
        trang_thai: 'in_progress',
        trong_tay_tu_luc: MOC,
      });
      await env.DB.prepare('UPDATE ticket SET co_khong_ai_cam = 1 WHERE id = ?')
        .bind('tk-pj-SAI-8')
        .run();
      await dungTicket('pj-SAI', 9, 'Nhóm planned', {
        trang_thai: 'todo',
        trong_tay_tu_luc: MOC,
      });

      const { results } = await env.DB.prepare(
        `SELECT id, trang_thai, chu_tu_lam, trong_tay_tu_luc, co_khong_ai_cam
           FROM ticket WHERE workspace_id = ? AND xoa_luc IS NULL`,
      )
        .bind(WS)
        .all<{
          id: string;
          trang_thai: TrangThaiTicket;
          chu_tu_lam: number;
          trong_tay_tu_luc: number | null;
          co_khong_ai_cam: number;
        }>();

      const bang_tay: string[] = [];
      for (const t of results) {
        if (t.co_khong_ai_cam === 1) continue;
        const boi_canh = await boiCanhNguoiCamCua(env.DB, WS, t.id);
        const cam = nguoiDangCam({ chu_tu_lam: t.chu_tu_lam === 1 }, boi_canh);
        if (
          tinhCoKhongAiCam(
            {
              trang_thai: t.trang_thai,
              co_nguoi_cam: cam.nguoi !== null,
              trong_tay_tu_luc: t.trong_tay_tu_luc,
            },
            KHI_DO,
          )
        ) {
          bang_tay.push(t.id);
        }
      }

      const qua_sql = await ticketDangCanBatCo(env.DB, WS, KHI_DO);
      expect(qua_sql.sort()).toEqual(bang_tay.sort());
      // Và tập đó không rỗng — nếu không, hai đường "bằng nhau" mà chẳng nói gì.
      expect(bang_tay.length).toBeGreaterThan(0);
    });

    it('đúng ngưỡng 24 giờ chẵn vẫn tính, và hai đường vẫn khớp ở mốc đó', async () => {
      const truoc = await ticketDangCanBatCo(env.DB, WS, KHI_DO - 1);
      const tai_moc = await ticketDangCanBatCo(env.DB, WS, KHI_DO);
      expect(truoc).toEqual([]);
      expect(tai_moc.sort()).toEqual(['tk-pj-SAI-1', 'tk-pj-SAI-5', 'tk-pj-SAI-6']);
    });
  });

  describe('mốc `trong_tay_tu_luc` do cửa ghi đặt và KHÔNG bị đặt lại vô cớ', () => {
    beforeEach(async () => {
      await dungWorkspace();
      await dungDuAn('SAI', 'Sample');
      await dungTicket('pj-SAI', 1, 'Việc', { trang_thai: 'todo' });
    });

    async function moc(): Promise<number | null> {
      const d = await env.DB.prepare('SELECT trong_tay_tu_luc FROM ticket WHERE id = ?')
        .bind('tk-pj-SAI-1')
        .first<{ trong_tay_tu_luc: number | null }>();
      return d?.trong_tay_tu_luc ?? null;
    }

    it('vào nhóm `active` mà không ai cầm → mốc được đặt', async () => {
      expect(await moc()).toBeNull();
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'in_progress' },
      });
      expect(await moc()).not.toBeNull();
    });

    it('sửa ticket vì chuyện khác KHÔNG làm đồng hồ 24 giờ chạy lại', async () => {
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'in_progress' },
      });
      const dau = await moc();

      // Đổi sang trạng thái `active` khác, rồi sửa tiêu đề: mốc phải y nguyên.
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'verifying' },
      });
      await goiApi('/v1/ticket/tk-pj-SAI-1', TOKEN_CHU, {
        method: 'PATCH',
        than: { tieu_de: 'Tiêu đề mới', uu_tien: 'high' },
      });
      expect(await moc()).toBe(dau);
    });

    it('chủ bấm "Tôi làm" → có người cầm, mốc được XOÁ', async () => {
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'in_progress' },
      });
      expect(await moc()).not.toBeNull();

      await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
        method: 'POST',
        than: { bat: true },
      });
      expect(await moc()).toBeNull();
    });

    it('chủ THÔI cầm → đồng hồ 24 giờ chạy lại TỪ LÚC THẢ, không đếm từ mốc cũ', async () => {
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'in_progress' },
      });

      /*
       * Đặt mốc về **một giá trị xa trong quá khứ** rồi mới so.
       *
       * Khẳng định cũ là `sau >= truoc`, mà đúng cái bug `apDungLenTicket` (cửa
       * ghi bỏ qua `cauLenhNguoiCam` khi không cột nào đổi) lại làm
       * `sau === truoc` — nên test xanh trong khi điều nó nói ("chạy lại từ lúc
       * thả") là sai. So với một mốc cũ **cố định** thì không có chỗ cho ca biên
       * "hai lệnh rơi cùng một millisecond", và bug kia làm test đỏ ngay.
       */
      const MOC_CU = 1_000_000_000_000; // 2001-09-09, chắc chắn < bây giờ
      await env.DB.prepare('UPDATE ticket SET trong_tay_tu_luc = ? WHERE id = ?')
        .bind(MOC_CU, 'tk-pj-SAI-1')
        .run();
      expect(await moc()).toBe(MOC_CU);

      // Chủ nhận cầm: mốc phải bị XOÁ (không còn "không ai cầm").
      await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
        method: 'POST',
        than: { bat: true },
      });
      expect(await moc()).toBeNull();

      // Chủ thả: mốc được đặt LẠI từ bây giờ, không phải mốc 2001.
      await goiApi('/v1/ticket/tk-pj-SAI-1/toi-lam', TOKEN_CHU, {
        method: 'POST',
        than: { bat: false },
      });
      const sau = await moc();
      expect(sau).not.toBeNull();
      expect(sau).toBeGreaterThan(MOC_CU);
      // Và là "bây giờ", không phải một mốc cũ nào khác.
      expect(Math.abs(sau! - Date.now())).toBeLessThan(60_000);
    });

    it('rời nhóm `active` → mốc được XOÁ', async () => {
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'in_progress' },
      });
      await goiApi('/v1/ticket/tk-pj-SAI-1/trang-thai', TOKEN_CHU, {
        method: 'POST',
        than: { trang_thai: 'canceled', ly_do: 'Không làm nữa' },
      });
      expect(await moc()).toBeNull();
    });
  });
});
