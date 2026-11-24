/**
 * **Trang Tổng quan** — SPEC mục 11 d.315–320, cộng hai luật nó phải cài đúng:
 * chỉ báo sức sống của mục 2 d.71–74 và trạng thái agent của mục 3 d.98–105.
 *
 * Ba kỷ luật của các ca ở đây:
 *
 *   1. **Mốc "bây giờ" là một con số tiêm vào** (`GIO`), không `Date.now()`: bốn
 *      mốc của màn hình này (ngưỡng đứng mục 6, hạn phản hồi mục 5, 24 giờ của
 *      d.319 và của d.320) chỉ ghim được bằng giờ tiêm.
 *   2. **Ca phủ định dựng trạng thái xấu thật**: "không vẽ 🟢" chỉ có nghĩa khi
 *      dữ liệu đưa vào thực sự là một phiên đã đứng, không phải khi thiếu dữ liệu.
 *   3. **Không `expect` trong vòng lặp**: gom thành mảng rồi so một lần, nếu
 *      không thì vòng đầu đỏ che hết các vòng sau.
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { hashRutGon, sucSongDuAn, type TrangThaiPhien } from '@baton/shared';
import {
  cauChoKiemChungQuaHan,
  cauGapNhat,
  gomTheoTicket,
  tongQuan,
  type DongCanChuY,
  type LoaiCanChuY,
  type NhomCanChuY,
} from '../src/doc-tong-quan.js';
import { lietKeDuAn } from '../src/doc-du-an.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  WS_KHAC,
  aiAgent,
  dungAgent,
  dungAgentCoToken,
  dungBangChung,
  dungCanChu,
  dungDuAn,
  dungLienKet,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
  xoaMemTicket,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const P2 = 'pj-COS';

/** Mốc "bây giờ" cố định của mọi ca. */
const GIO = 1_760_000_000_000;
const PHUT = 60_000;
const GIO_MS = 60 * PHUT;

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn();
  await dungDuAn('COS', 'Chief of Staff');
});

/* ------------------------------------------------------------------ *
 * Fixture cục bộ: những cột mà `giup.ts` không mở ra
 * ------------------------------------------------------------------ */

/** `ticket.xong_luc` — mốc của "Vừa xong" (d.320). */
async function datXongLuc(ticket_id: string, luc: number): Promise<void> {
  await env.DB.prepare('UPDATE ticket SET xong_luc = ? WHERE id = ? AND workspace_id = ?')
    .bind(luc, ticket_id, WS)
    .run();
}

/** Cờ "Đang làm mà không ai cầm" (19.1) — d.319 nguồn 3. */
async function batCoKhongAiCam(ticket_id: string, trong_tay_tu_luc: number): Promise<void> {
  await env.DB.prepare(
    'UPDATE ticket SET co_khong_ai_cam = 1, trong_tay_tu_luc = ? WHERE id = ? AND workspace_id = ?',
  )
    .bind(trong_tay_tu_luc, ticket_id, WS)
    .run();
}

/** `agent.len_tieng_luc` — "thời gian từ tín hiệu cuối" của d.318. */
async function datLenTieng(agent_id: string, luc: number): Promise<void> {
  await env.DB.prepare('UPDATE agent SET len_tieng_luc = ? WHERE id = ? AND workspace_id = ?')
    .bind(luc, agent_id, WS)
    .run();
}

/** Một dòng lịch sử "vào `verifying`" — mốc của d.319 nguồn 5. */
async function dungLichSuVaoVerifying(ticket_id: string, luc: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ticket_history
       (id, workspace_id, ticket_id, tac_gia_loai, tac_gia_agent_id, luc, truong, gia_tri_cu, gia_tri_moi)
     VALUES (?, ?, ?, 'owner', NULL, ?, 'trang_thai', 'in_progress', 'verifying')`,
  )
    .bind(crypto.randomUUID(), WS, ticket_id, luc)
    .run();
}

/**
 * Một ticket **Đang làm** có một phiên mở ở trạng thái cho trước.
 *
 * `tin_hieu_cuoi_luc` là mốc thật của d.72 ("nhịp tim trong ngưỡng"): phiên
 * `running` mà im quá 30 phút **đã là** `stalled` ở đường đọc, nên ca 🟡 dựng
 * bằng im lặng, không bằng cách ghi chữ `stalled` vào DB.
 */
async function ticketDangLamCoPhien(
  project_id: string,
  so: number,
  agent_id: string,
  phien: { trang_thai?: TrangThaiPhien; im_phut?: number } = {},
): Promise<string> {
  const tk = await dungTicket(project_id, so, `Việc ${String(so)}`, {
    trang_thai: 'in_progress',
    tao_luc: GIO - 2 * GIO_MS,
  });
  const lg = await dungLuotGiao(`lg-${project_id}-${String(so)}`, tk, agent_id, {
    trang_thai: 'in_progress',
    tao_luc: GIO - 2 * GIO_MS,
  });
  await dungPhien(`ph-${project_id}-${String(so)}`, lg, {
    trang_thai: phien.trang_thai ?? 'running',
    mo_luc: GIO - 2 * GIO_MS,
    tin_hieu_cuoi_luc: GIO - (phien.im_phut ?? 1) * PHUT,
  });
  return tk;
}

/**
 * Mọi **lý do** của khối Cần chú ý, trải phẳng khỏi phép gom theo ticket của
 * d.321 — các ca về từng nguồn đo nguồn, các ca về phép gom đo `can_chu_y` thẳng.
 */
function lyDo(ds: readonly NhomCanChuY[]): DongCanChuY[] {
  return ds.flatMap((n) => n.ly_do);
}

function loai(ds: readonly NhomCanChuY[]): LoaiCanChuY[] {
  return lyDo(ds).map((d) => d.loai);
}

/* ================================================================== *
 * A. Quyền: đường của CHỦ
 * ================================================================== */

describe('d.315 + mục 15 d.416 — Tổng quan chỉ của chủ', () => {
  it('chủ gọi qua HTTP: 200 và có đủ NĂM khối của d.317–321 + ô Cần Chủ', async () => {
    const r = await goiApi('/v1/tong-quan', TOKEN_CHU);
    expect(r.status).toBe(200);
    const than = await r.json<Record<string, unknown>>();
    /*
     * Assert **tuyệt đối** (không `toContain`): một khoá biến mất là một khối
     * trống trên màn hình của chủ, và một khoá **thừa** nghĩa là trang đang
     * nhận dữ liệu không ai vẽ. Hai khoá `vua_xong_*` là hai cửa sổ của d.320
     * trong **một** lượt gọi (d.410).
     */
    expect(Object.keys(than).sort()).toEqual(
      [
        'agent',
        'agent_ranh_so',
        // Bản đồ dự án (SPEC 20.2–20.3): tâm cây + đồng hồ WIP — cấp workspace.
        'ban_do',
        'bay_gio',
        'can_chu_y',
        'can_chu',
        'du_an',
        'viec_dang_chay',
        'vua_xong_24h',
        'vua_xong_7n',
      ].sort(),
    );
  });

  it('AGENT gọi qua HTTP: 403, và thân KHÔNG mang khối nào', async () => {
    await dungAgentCoToken({
      id: 'ag-w',
      ten: 'W',
      vai_tro: 'worker',
      token: 'tk_worker_tong_quan',
      du_an: [P],
    });
    const r = await goiApi('/v1/tong-quan', 'tk_worker_tong_quan');
    expect(r.status).toBe(403);
    const than = await r.json<Record<string, unknown>>();
    expect(than['error']).toBe('FORBIDDEN');
    expect(than['du_an']).toBeUndefined();
    expect(than['can_chu']).toBeUndefined();
  });

  it('KHÔNG giấy tờ gì: 401, và thân KHÔNG mang khối nào', async () => {
    /*
     * Chiều thứ hai của d.416 (chiều thứ nhất là ca 403 ở trên). Hôm nay đường
     * này an toàn vì nó **không** có trong `DUONG_CONG_KHAI` của `xac-thuc.ts`,
     * nên cổng `app.use('*', xacThuc)` chặn trước khi handler chạy — nhưng đó là
     * một **lý lẽ về cấu trúc**, không phải một cổng có test. Thêm một dòng vào
     * danh sách đóng đó (vì một đường khác cần công khai) sẽ mở thẳng Tổng quan
     * cho người lạ, và ca này là chỗ duy nhất bắt được.
     */
    const r = await SELF.fetch('https://baton.test/v1/tong-quan');
    expect(r.status).toBe(401);
    const than = await r.json<Record<string, unknown>>();
    expect(than['error']).toBe('INVALID_TOKEN');
    expect(than['du_an']).toBeUndefined();
    expect(than['can_chu']).toBeUndefined();
  });

  it('token RÁC: 401, không 403 và không 200', async () => {
    const r = await goiApi('/v1/tong-quan', 'bt_token_khong_co_that');
    expect(r.status).toBe(401);
    const than = await r.json<Record<string, unknown>>();
    expect(than['du_an']).toBeUndefined();
  });

  it('cổng nằm TRONG hàm, không chỉ ở route: gọi `tongQuan` bằng `ai` agent cũng trượt', async () => {
    await expect(
      tongQuan(env.DB, aiAgent('coordinator', { vao_tat_ca_du_an: true }), WS, GIO),
    ).rejects.toThrow(/chủ/);
  });
});

/* ================================================================== *
 * B. Khối 1 — Cần Chủ (d.316)
 * ================================================================== */

describe('d.316 — số mục Chờ theo mức, 3 mục gấp nhất', () => {
  it('`so_theo_muc` đếm đúng từng mức, và chỉ đếm mục `Chờ`', async () => {
    await dungCanChu('ct-1', { muc: 'urgent', loai: 'run_command', project_id: P });
    await dungCanChu('ct-2', { muc: 'urgent', loai: 'run_command', project_id: P });
    await dungCanChu('ct-3', { muc: 'today', project_id: P });
    // Đã xử lý ⇒ **không** đếm.
    await dungCanChu('ct-4', { muc: 'later', project_id: P, trang_thai: 'resolved' });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu.so_theo_muc).toEqual({ urgent: 2, today: 1, later: 0 });
    expect(tq.can_chu.so_cho).toBe(3);
    expect(tq.can_chu.muc_cao_nhat).toBe('urgent');
  });

  it('`gap_nhat` đúng BA mục, thứ tự mức → hạn → lúc tạo', async () => {
    // Năm mục để "lấy 3" có nghĩa; dựng lẫn thứ tự để `ORDER BY` phải làm việc.
    await dungCanChu('ct-later', { muc: 'later', project_id: P, tao_luc: GIO - 9 * GIO_MS });
    await dungCanChu('ct-today-khong-han', {
      muc: 'today',
      project_id: P,
      tao_luc: GIO - 8 * GIO_MS,
      han_luc: null,
    });
    await dungCanChu('ct-today-han-muon', {
      muc: 'today',
      project_id: P,
      tao_luc: GIO - 7 * GIO_MS,
      han_luc: GIO + 9 * GIO_MS,
    });
    await dungCanChu('ct-urgent', {
      muc: 'urgent',
      loai: 'run_command',
      project_id: P,
      tao_luc: GIO - 1 * GIO_MS,
      han_luc: GIO + 3 * GIO_MS,
    });
    await dungCanChu('ct-today-han-som', {
      muc: 'today',
      project_id: P,
      tao_luc: GIO - 6 * GIO_MS,
      han_luc: GIO + 1 * GIO_MS,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu.gap_nhat.map((m) => m.id)).toEqual([
      // 🔴 trước mọi 🟡, dù tạo sau cùng.
      'ct-urgent',
      // trong 🟡: hạn sớm hơn trước…
      'ct-today-han-som',
      'ct-today-han-muon',
    ]);
    // …và mục **không hẹn hạn** xuống dưới cả hai mục có hạn ⇒ không vào top 3.
    expect(tq.can_chu.gap_nhat.map((m) => m.id)).not.toContain('ct-today-khong-han');
  });

  it('`gap_nhat` mang mã `T-số` và cờ `qua_han` tính tại `bay_gio`', async () => {
    await dungCanChu('ct-qua', {
      ma_so: 18,
      muc: 'today',
      project_id: P,
      han_luc: GIO - 1 * GIO_MS,
    });
    await dungCanChu('ct-chua', {
      ma_so: 19,
      muc: 'today',
      project_id: P,
      han_luc: GIO + 1 * GIO_MS,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu.gap_nhat.map((m) => [m.ma, m.qua_han])).toEqual([
      ['T-18', true],
      ['T-19', false],
    ]);
  });

  it('`cauGapNhat` là CHÍNH câu sản phẩm, và nó chỉ lấy `open` của đúng workspace', () => {
    const cau = cauGapNhat(WS);
    expect(cau.sql).toContain("ct.trang_thai = 'open'");
    expect(cau.sql).toContain('ct.workspace_id = ?');
    // Trần 3 của d.316 nằm trong `bind`, không trong chuỗi SQL.
    expect(cau.bind).toEqual([WS, 3]);
  });
});

/* ================================================================== *
 * C. Khối 2 — Dự án và CHỈ BÁO SỨC SỐNG (d.317, mục 2 d.71–74)
 * ================================================================== */

describe('mục 2 d.71–74 — luật thuần `sucSongDuAn`', () => {
  it('d.74: không có ticket Đang làm nào ⇒ ⚪, bất kể có phiên gì', () => {
    expect(sucSongDuAn({ so_ticket_dang_lam: 0, trang_thai_phien: [] })).toBe('trang');
    expect(sucSongDuAn({ so_ticket_dang_lam: 0, trang_thai_phien: ['running'] })).toBe('trang');
  });

  it('d.72: có ticket Đang làm + phiên đang chạy ⇒ 🟢', () => {
    expect(sucSongDuAn({ so_ticket_dang_lam: 1, trang_thai_phien: ['running'] })).toBe('xanh');
  });

  it('d.73: có ticket Đang làm nhưng phiên ĐỨNG hoặc LỖI ⇒ 🟡, KHÔNG 🟢', () => {
    expect(sucSongDuAn({ so_ticket_dang_lam: 1, trang_thai_phien: ['stalled'] })).toBe('vang');
    expect(sucSongDuAn({ so_ticket_dang_lam: 1, trang_thai_phien: ['error'] })).toBe('vang');
  });

  it('có cả phiên chạy và phiên đứng ⇒ 🟢 (phiên đứng vẫn hiện riêng ở Cần chú ý)', () => {
    expect(
      sucSongDuAn({ so_ticket_dang_lam: 2, trang_thai_phien: ['stalled', 'running'] }),
    ).toBe('xanh');
  });

  it('ticket Đang làm mà KHÔNG phiên nào ⇒ 🟡, không 🟢 và không ⚪', () => {
    // Chỗ SPEC không nói (`cau-hoi-spec.md` #102). Ca ghim hướng đang cài: không
    // được nói "Dự án không chạy" (d.74 dành cho ca khác) và không được vẽ 🟢.
    expect(sucSongDuAn({ so_ticket_dang_lam: 1, trang_thai_phien: [] })).toBe('vang');
  });
});

describe('d.317 — mỗi dự án một hàng: sức sống + ba con số', () => {
  it('🟢 cho dự án có phiên còn nhịp tim trong ngưỡng', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    await ticketDangLamCoPhien(P, 1, ag, { im_phut: 5 });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const hang = tq.du_an.find((d) => d.id === P);
    expect(hang?.suc_song).toBe('xanh');
    expect(hang?.so_dang_lam).toBe(1);
  });

  it('🟡 khi phiên IM QUÁ NGƯỠNG 30 phút — dẫn xuất, không ghi `stalled` vào DB', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    // Phiên vẫn `running` trong DB; chỉ im lặng 31 phút (mục 6 d.184, 19.12 câu 42).
    await ticketDangLamCoPhien(P, 1, ag, { trang_thai: 'running', im_phut: 31 });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.du_an.find((d) => d.id === P)?.suc_song).toBe('vang');
  });

  it('⚪ + ba con số 0 cho dự án không có ticket nào ĐANG LÀM', async () => {
    await dungTicket(P2, 1, 'Chưa làm', { trang_thai: 'todo' });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const hang = tq.du_an.find((d) => d.id === P2);
    expect(hang?.suc_song).toBe('trang');
    expect([hang?.so_dang_lam, hang?.so_cho_kiem_chung, hang?.so_xong_24h]).toEqual([0, 0, 0]);
  });

  it('⚪ cho dự án CHỈ CÓ ticket Chờ kiểm chứng — đi qua đúng luật, không qua đường mặc định', async () => {
    /*
     * Ca trên đi nhánh "dự án không có dòng nào trong bảng đếm" (`SO_LIEU_RONG`),
     * nên nó **không** gọi tới `sucSongDuAn` — đo bằng đột biến: đổi vế `<= 0`
     * của hàm thuần thành `< 0` thì ca trên vẫn xanh. Ca này đóng lỗ đó: dự án có
     * một ticket `verifying`, tức **có** dòng trong bảng đếm, nên kết luận ⚪ phải
     * do chính luật d.74 sinh ra. Một phiên còn mở trên ticket đó cũng không
     * được đẩy dự án lên 🟢 — ticket không còn Đang làm.
     */
    const ag = await dungAgent('ag-1', 'W1');
    const tk = await dungTicket(P2, 1, 'Đã nộp, chờ kiểm', { trang_thai: 'verifying' });
    const lg = await dungLuotGiao('lg-ver', tk, ag, { trang_thai: 'in_progress' });
    await dungPhien('ph-ver', lg, {
      trang_thai: 'running',
      mo_luc: GIO - GIO_MS,
      tin_hieu_cuoi_luc: GIO - PHUT,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const hang = tq.du_an.find((d) => d.id === P2);
    expect(hang?.so_cho_kiem_chung).toBe(1);
    expect(hang?.so_dang_lam).toBe(0);
    expect(hang?.suc_song).toBe('trang');
  });

  it('`so_cho_kiem_chung` và `so_xong_24h` đếm đúng, và 24 giờ là một CỬA SỔ', async () => {
    await dungTicket(P, 1, 'Chờ kiểm 1', { trang_thai: 'verifying' });
    await dungTicket(P, 2, 'Chờ kiểm 2', { trang_thai: 'verifying' });
    const trong = await dungTicket(P, 3, 'Xong trong cửa sổ', { trang_thai: 'done' });
    const ngoai = await dungTicket(P, 4, 'Xong tháng trước', { trang_thai: 'done' });
    await datXongLuc(trong, GIO - 23 * GIO_MS);
    await datXongLuc(ngoai, GIO - 25 * GIO_MS);

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const hang = tq.du_an.find((d) => d.id === P);
    expect(hang?.so_cho_kiem_chung).toBe(2);
    expect(hang?.so_xong_24h).toBe(1);
  });

  it('phiên của ticket CHỜ KIỂM CHỨNG không đẩy dự án lên 🟢', async () => {
    /*
     * d.72 và d.73 đều mở đầu bằng "có ticket **Đang làm**", nên chỉ phiên của
     * ticket `in_progress` được tính. Ca dựng đúng trạng thái phân biệt được hai
     * cách cài: một ticket Đang làm **không phiên nào** (⇒ 🟡) cộng một ticket đã
     * sang Chờ kiểm chứng **còn phiên đang chạy**. Bỏ bộ lọc trạng thái ticket thì
     * dự án thành 🟢 — tức nói với chủ là dự án đang chạy nhờ một phiên trên một
     * việc đã nộp xong. (Đo bằng đột biến: không có ca này thì bỏ lọc vẫn xanh.)
     */
    const ag = await dungAgent('ag-1', 'W1');
    await dungTicket(P, 1, 'Đang làm, không ai cầm', { trang_thai: 'in_progress' });
    const tk = await dungTicket(P, 2, 'Đã nộp', { trang_thai: 'verifying' });
    const lg = await dungLuotGiao('lg-ver', tk, ag, { trang_thai: 'in_progress' });
    await dungPhien('ph-ver', lg, {
      trang_thai: 'running',
      mo_luc: GIO - GIO_MS,
      tin_hieu_cuoi_luc: GIO - PHUT,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const hang = tq.du_an.find((d) => d.id === P);
    expect([hang?.so_dang_lam, hang?.so_cho_kiem_chung]).toEqual([1, 1]);
    expect(hang?.suc_song).toBe('vang');
  });

  it('ticket của dự án KHÁC không lẫn vào hàng của dự án này', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    await ticketDangLamCoPhien(P, 1, ag, { im_phut: 1 });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.du_an.find((d) => d.id === P2)?.so_dang_lam).toBe(0);
    expect(tq.du_an.find((d) => d.id === P2)?.suc_song).toBe('trang');
  });

  it('thanh tiến độ xong/tổng: `done` là tử số, `canceled`/`duplicate` NGOÀI tổng', async () => {
    /*
     * d.317 "thanh tiến độ xong/tổng (kèm số)". Mẫu số là chỗ SPEC im lặng
     * (`cau-hoi-spec.md` #138) — ca này ghim đề xuất tạm đang cài: `backlog` và
     * `todo` **trong** tổng (việc còn phải làm), `canceled` và `duplicate`
     * **ngoài** (không làm nữa; để chúng trong tổng thì càng huỷ càng trông càng
     * ít xong).
     */
    await dungTicket(P, 1, 'Xong 1', { trang_thai: 'done' });
    await dungTicket(P, 2, 'Xong 2', { trang_thai: 'done' });
    await dungTicket(P, 3, 'Cần làm', { trang_thai: 'todo' });
    await dungTicket(P, 4, 'Backlog', { trang_thai: 'backlog' });
    await dungTicket(P, 5, 'Đang làm', { trang_thai: 'in_progress' });
    await dungTicket(P, 6, 'Chờ kiểm', { trang_thai: 'verifying' });
    await dungTicket(P, 7, 'Huỷ', { trang_thai: 'canceled' });
    await dungTicket(P, 8, 'Trùng', { trang_thai: 'duplicate' });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const hang = tq.du_an.find((d) => d.id === P);
    expect([hang?.so_xong, hang?.so_tong]).toEqual([2, 6]);
    // Và bốn con số của dòng dự án, trong đó "Cần làm" là `todo`, **không** backlog.
    expect([hang?.so_dang_lam, hang?.so_cho_kiem_chung, hang?.so_can_lam]).toEqual([1, 1, 1]);
  });

  it('ticket đã XOÁ MỀM không vào tổng (tử số và mẫu số đều không)', async () => {
    const xoa = await dungTicket(P, 1, 'Đã xoá', { trang_thai: 'done' });
    await dungTicket(P, 2, 'Còn', { trang_thai: 'todo' });
    await xoaMemTicket(xoa, GIO - PHUT);

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const hang = tq.du_an.find((d) => d.id === P);
    expect([hang?.so_xong, hang?.so_tong]).toEqual([0, 1]);
  });

  it('`viec_noi_bat` là ticket ĐANG LÀM ưu tiên cao nhất của chính dự án đó', async () => {
    await dungTicket(P, 1, 'Đang làm ưu tiên thấp', {
      trang_thai: 'in_progress',
      uu_tien: 'low',
    });
    await dungTicket(P, 2, 'Đang làm KHẨN', { trang_thai: 'in_progress', uu_tien: 'urgent' });
    // Chờ kiểm chứng **không** phải "đang làm", dù ưu tiên khẩn.
    await dungTicket(P, 3, 'Chờ kiểm khẩn', { trang_thai: 'verifying', uu_tien: 'urgent' });
    await dungTicket(P2, 1, 'Đang làm của COS', { trang_thai: 'in_progress' });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.du_an.find((d) => d.id === P)?.viec_noi_bat?.ma).toBe('SAI-2');
    // Không lẫn dự án: mỗi dòng lấy việc của chính nó.
    expect(tq.du_an.find((d) => d.id === P2)?.viec_noi_bat?.ma).toBe('COS-1');
  });

  it('dự án KHÔNG có ticket Đang làm ⇒ `viec_noi_bat` là `null` (không mượn Chờ kiểm chứng)', async () => {
    await dungTicket(P, 1, 'Chờ kiểm', { trang_thai: 'verifying' });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const hang = tq.du_an.find((d) => d.id === P);
    expect(hang?.viec_noi_bat).toBeNull();
    expect(hang?.suc_song).toBe('trang');
  });

  it('dự án `archived` không có hàng nào (mục 2 d.70 — ẩn)', async () => {
    await dungDuAn('OLD', 'Dự án cũ', 'archived');
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.du_an.map((d) => d.ma)).not.toContain('OLD');
  });
});

describe('d.393 + d.71–74 — `GET /v1/du-an` cũng trả `suc_song` (nợ L2)', () => {
  it('sidebar nhận đúng cùng một kết luận với Tổng quan, không `undefined`', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    await ticketDangLamCoPhien(P, 1, ag, { im_phut: 31 });

    const trang = await lietKeDuAn(env.DB, CHU, WS, {}, GIO);
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const theo_ma = new Map(trang.items.map((d) => [d.ma, d.suc_song]));
    expect(theo_ma.get('SAI')).toBe('vang');
    expect(theo_ma.get('COS')).toBe('trang');
    expect(tq.du_an.map((d) => [d.ma, d.suc_song])).toEqual(
      trang.items.map((d) => [d.ma, d.suc_song]),
    );
  });

  it('qua HTTP: thân `GET /v1/du-an` có khoá `suc_song` cho mọi dự án', async () => {
    const r = await goiApi('/v1/du-an', TOKEN_CHU);
    const than = await r.json<{ items: { ma: string; suc_song?: string }[] }>();
    expect(than.items.length).toBe(2);
    expect(than.items.map((d) => d.suc_song)).toEqual(['trang', 'trang']);
  });
});

/* ================================================================== *
 * D. Khối 3 — Agent ĐANG LÀM GÌ (d.319, mục 3 d.98–105)
 * ================================================================== */

describe('d.319 — CHỈ agent đang làm, mỗi agent một dòng; agent rảnh gom một dòng', () => {
  it('agent rảnh và agent đã tắt KHÔNG có dòng; rảnh chỉ vào con số gom', async () => {
    const a_busy = await dungAgent('ag-busy', 'A busy');
    const a_dung = await dungAgent('ag-dung', 'B dung');
    await dungAgent('ag-ranh', 'C ranh');
    const a_tat = await dungAgent('ag-tat', 'D tat');
    await env.DB.prepare('UPDATE agent SET disabled = 1 WHERE id = ?').bind(a_tat).run();

    await ticketDangLamCoPhien(P, 1, a_busy, { im_phut: 2 });
    await ticketDangLamCoPhien(P, 2, a_dung, { im_phut: 31 });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.agent.map((a) => [a.id, a.trang_thai])).toEqual([
      ['ag-busy', 'busy'],
      ['ag-dung', 'stalled'],
    ]);
    // Một agent rảnh ⇒ con số gom là 1. Agent **đã tắt** không ở cả hai chỗ.
    expect(tq.agent_ranh_so).toBe(1);
  });

  it('`waiting_owner` CÒN CẦM VIỆC vẫn là "đang làm" — nó đang giữ gậy', async () => {
    const ag = await dungAgent('ag-cho', 'Chờ Chủ');
    const tk = await dungTicket(P, 1, 'Việc chờ Chủ', { trang_thai: 'in_progress' });
    const lg = await dungLuotGiao('lg-cho', tk, ag, { trang_thai: 'in_progress' });
    await dungPhien('ph-cho', lg, {
      trang_thai: 'waiting_owner',
      can_chu_id: 'ct-cho',
      mo_luc: GIO - GIO_MS,
      tin_hieu_cuoi_luc: GIO - 50 * PHUT,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const a = tq.agent.find((x) => x.id === ag);
    expect(a?.trang_thai).toBe('waiting_owner');
    expect(a?.ticket_dang_cam.map((t) => t.ma)).toEqual(['SAI-1']);
    expect(tq.agent_ranh_so).toBe(0);
  });

  it('`stalled` mà KHÔNG còn cầm việc nào thì không có dòng — ca phủ định', async () => {
    /*
     * Dựng trạng thái xấu thật: một phiên im 31 phút (⇒ `stalled`) trên một lượt
     * **đã đóng**, tức agent không còn cầm ticket nào. Không có vế "còn cầm
     * việc" thì dòng ấy vẫn hiện và chủ đọc nó thành "agent này đang làm".
     */
    const ag = await dungAgent('ag-dung', 'Đứng rỗng');
    const tk = await dungTicket(P, 1, 'Đã nghiệm thu', { trang_thai: 'done' });
    const lg = await dungLuotGiao('lg-xong', tk, ag, { trang_thai: 'accepted' });
    await dungPhien('ph-dung', lg, {
      trang_thai: 'running',
      mo_luc: GIO - 2 * GIO_MS,
      tin_hieu_cuoi_luc: GIO - 31 * PHUT,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    // Lưới của chính ca này: agent đó **thật sự** đã dẫn xuất ra `stalled`.
    expect(tq.agent.map((a) => a.id)).toEqual([]);
    expect(tq.agent_ranh_so).toBe(0);
  });

  it('`ticket_dang_cam` = ticket của lượt giao MỞ của chính agent đó', async () => {
    const a1 = await dungAgent('ag-1', 'A một');
    const t1 = await dungTicket(P, 1, 'Của A', { trang_thai: 'in_progress' });
    const t3 = await dungTicket(P, 3, 'Đã nghiệm thu');
    const lg1 = await dungLuotGiao('lg-1', t1, a1, { trang_thai: 'in_progress' });
    await dungPhien('ph-1', lg1, {
      trang_thai: 'running',
      mo_luc: GIO - GIO_MS,
      tin_hieu_cuoi_luc: GIO - PHUT,
    });
    // Lượt **đã đóng** ⇒ không còn cầm (19.1: lượt mở = pending | in_progress).
    await dungLuotGiao('lg-3', t3, a1, { trang_thai: 'accepted' });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.agent.find((a) => a.id === 'ag-1')?.ticket_dang_cam.map((t) => t.ma)).toEqual([
      'SAI-1',
    ]);
  });

  it('`tin_hieu_cuoi_luc` là mốc "lần cuối lên tiếng" của agent đang làm', async () => {
    const a1 = await dungAgent('ag-1', 'A một');
    await ticketDangLamCoPhien(P, 1, a1, { im_phut: 2 });
    await datLenTieng(a1, GIO - 12 * PHUT);

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.agent.find((a) => a.id === 'ag-1')?.tin_hieu_cuoi_luc).toBe(GIO - 12 * PHUT);
  });
});

/* ================================================================== *
 * D2. Khối 2 — Việc đang chạy (d.318)
 * ================================================================== */

describe('d.318 — thẻ việc của MỌI dự án đang chạy, kèm ai cầm và từ lúc nào', () => {
  it('đủ `in_progress` + `verifying` của MỌI dự án, và KHÔNG trạng thái khác', async () => {
    await dungTicket(P, 1, 'Đang làm SAI', { trang_thai: 'in_progress' });
    await dungTicket(P, 2, 'Chờ kiểm SAI', { trang_thai: 'verifying' });
    await dungTicket(P2, 1, 'Đang làm COS', { trang_thai: 'in_progress' });
    // Ba trạng thái **không** đang chạy.
    await dungTicket(P, 3, 'Cần làm', { trang_thai: 'todo' });
    await dungTicket(P, 4, 'Backlog', { trang_thai: 'backlog' });
    await dungTicket(P, 5, 'Xong', { trang_thai: 'done' });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.viec_dang_chay.map((v) => v.the.ma).sort()).toEqual(['COS-1', 'SAI-1', 'SAI-2']);
    expect(tq.viec_dang_chay.map((v) => v.the.trang_thai).sort()).toEqual([
      'in_progress',
      'in_progress',
      'verifying',
    ]);
  });

  it('thẻ mang ĐỦ bốn trường của thẻ việc (nhãn, con, Cần Chủ, xong_luc)', async () => {
    /*
     * Lưới cho vế "dùng lại **đúng** thẻ việc của bảng d.403": nếu khối này tự
     * dựng thẻ từ `lietKeTicket` mà bỏ `themCuaThe` thì bốn trường dưới đây là
     * `undefined` và thẻ mất nhãn, mất "việc con xong/tổng".
     */
    const cha = await dungTicket(P, 1, 'Có con và nhãn', { trang_thai: 'in_progress' });
    const con = await dungTicket(P, 2, 'Con chưa kết', { trang_thai: 'todo' });
    await dungLienKet(cha, con, 'parent');
    await env.DB.prepare(
      'INSERT INTO ticket_label (workspace_id, ticket_id, nhan, tao_luc) VALUES (?, ?, ?, ?)',
    )
      .bind(WS, cha, 'hạ-tầng', GIO)
      .run();

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const the = tq.viec_dang_chay.find((v) => v.the.ma === 'SAI-1')?.the;
    expect(the?.nhan).toEqual(['hạ-tầng']);
    expect([the?.con_tong, the?.con_chua_ket]).toEqual([1, 1]);
    expect(the?.can_chu_so).toBe(0);
    expect(the?.xong_luc).toBeNull();
  });

  it('`nguoi_cam_ten` là TÊN agent (d.404), và `cam_tu_luc` là lúc NHẬN lượt', async () => {
    const ag = await dungAgent('ag-1', 'W-builder');
    const tk = await dungTicket(P, 1, 'Đang cầm', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-1', tk, ag, {
      trang_thai: 'in_progress',
      tao_luc: GIO - 5 * GIO_MS,
      nhan_luc: GIO - 2 * GIO_MS,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const v = tq.viec_dang_chay.find((x) => x.the.ma === 'SAI-1');
    // Tên, **không** id: id `ag-1` không được là thứ chủ đọc.
    expect(v?.nguoi_cam_ten).toBe('W-builder');
    expect(JSON.stringify(v?.nguoi_cam_ten)).not.toContain('ag-1');
    expect(v?.cam_tu_luc).toBe(GIO - 2 * GIO_MS);
  });

  it('lượt còn `pending` (chưa nhận) ⇒ `cam_tu_luc` rơi về lúc TẠO lượt', async () => {
    const ag = await dungAgent('ag-1', 'W-builder');
    const tk = await dungTicket(P, 1, 'Giao rồi, chưa nhận', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-1', tk, ag, { trang_thai: 'pending', tao_luc: GIO - 3 * GIO_MS });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.viec_dang_chay[0]?.cam_tu_luc).toBe(GIO - 3 * GIO_MS);
  });

  it('không ai cầm ⇒ `nguoi_cam_ten` và `cam_tu_luc` là `null`, không một tên bịa', async () => {
    await dungTicket(P, 1, 'Không ai cầm', { trang_thai: 'in_progress' });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect([tq.viec_dang_chay[0]?.nguoi_cam_ten, tq.viec_dang_chay[0]?.cam_tu_luc]).toEqual([
      null,
      null,
    ]);
  });

  it('lượt `review` mở THẮNG lượt `work` mở (19.1 bậc 1 trước bậc 2)', async () => {
    /*
     * Hai agent, hai lượt mở trên cùng ticket; id của người làm (`ag-a`) nhỏ hơn
     * id của reviewer (`ag-z`) **và** ngược lại trong một ca thứ hai dưới, nên ca
     * này đỏ nếu phép chọn dựa vào thứ tự `agent_id` thay vì hạng của 19.1.
     */
    const lam = await dungAgent('ag-z-lam', 'W-builder');
    const duyet = await dungAgent('ag-a-duyet', 'W-reviewer');
    const tk = await dungTicket(P, 1, 'Đang review', { trang_thai: 'verifying' });
    await dungLuotGiao('lg-work', tk, lam, {
      trang_thai: 'in_progress',
      tao_luc: GIO - 5 * GIO_MS,
    });
    await dungLuotGiao('lg-review', tk, duyet, {
      loai: 'review',
      so_luot: 2,
      trang_thai: 'in_progress',
      tao_luc: GIO - GIO_MS,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.viec_dang_chay[0]?.nguoi_cam_ten).toBe('W-reviewer');
    expect(tq.viec_dang_chay[0]?.cam_tu_luc).toBe(GIO - GIO_MS);
  });
});

/* ================================================================== *
 * E. Khối 4 — Cần chú ý (d.319): NĂM nguồn
 * ================================================================== */

describe('d.319 — năm nguồn của Cần chú ý', () => {
  it('(1) phiên ĐỨNG và phiên LỖI đều ra, kèm ticket và phiên liên quan', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    await ticketDangLamCoPhien(P, 1, ag, { trang_thai: 'running', im_phut: 31 });
    const tk2 = await dungTicket(P, 2, 'Việc lỗi', { trang_thai: 'in_progress' });
    const lg2 = await dungLuotGiao('lg-loi', tk2, ag, { trang_thai: 'in_progress' });
    await dungPhien('ph-loi', lg2, {
      trang_thai: 'error',
      mo_luc: GIO - GIO_MS,
      tin_hieu_cuoi_luc: GIO - 3 * PHUT,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const ds = lyDo(tq.can_chu_y).filter((d) => d.loai === 'phien_dung_hoac_loi');
    expect(ds.map((d) => d.phien?.trang_thai)).toEqual(['stalled', 'error']);
    expect(ds.map((d) => d.ticket?.ma)).toEqual(['SAI-1', 'SAI-2']);
    // `luc` là tín hiệu cuối ⇒ phiên im lâu nhất lên trước.
    expect(ds.map((d) => d.luc)).toEqual([GIO - 31 * PHUT, GIO - 3 * PHUT]);
  });

  it('(1) phiên đang chạy BÌNH THƯỜNG không ra — ca phủ định', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    await ticketDangLamCoPhien(P, 1, ag, { im_phut: 2 });
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(loai(tq.can_chu_y)).not.toContain('phien_dung_hoac_loi');
  });

  it('(2) lượt giao QUÁ HẠN phản hồi mà chưa nhận ⇒ "không phản hồi"; lượt đã nhận thì không', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    const t1 = await dungTicket(P, 1, 'Quá hạn');
    const t2 = await dungTicket(P, 2, 'Chưa tới hạn');
    const t3 = await dungTicket(P, 3, 'Đã nhận');
    await dungLuotGiao('lg-qua', t1, ag, {
      trang_thai: 'pending',
      han_phan_hoi_luc: GIO - 5 * PHUT,
    });
    await dungLuotGiao('lg-chua', t2, ag, {
      trang_thai: 'pending',
      han_phan_hoi_luc: GIO + 5 * PHUT,
    });
    await dungLuotGiao('lg-nhan', t3, ag, {
      trang_thai: 'in_progress',
      han_phan_hoi_luc: GIO - 50 * PHUT,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const ds = lyDo(tq.can_chu_y).filter((d) => d.loai === 'luot_giao_khong_phan_hoi');
    expect(ds.map((d) => d.luot_giao?.id)).toEqual(['lg-qua']);
    expect(ds[0]?.luc).toBe(GIO - 5 * PHUT);
    expect(ds[0]?.ticket?.ma).toBe('SAI-1');
  });

  it('(3) ticket "Đang làm mà không ai cầm" ra theo CỜ của 19.1', async () => {
    const tk = await dungTicket(P, 1, 'Bỏ rơi', { trang_thai: 'in_progress' });
    await batCoKhongAiCam(tk, GIO - 30 * GIO_MS);
    await dungTicket(P, 2, 'Có người cầm', { trang_thai: 'in_progress' });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const ds = lyDo(tq.can_chu_y).filter((d) => d.loai === 'ticket_khong_ai_cam');
    expect(ds.map((d) => d.ticket?.ma)).toEqual(['SAI-1']);
    expect(ds[0]?.luc).toBe(GIO - 30 * GIO_MS);
  });

  it('(4) bằng chứng TRƯỢT ra; bằng chứng đã RÚT thì không (d.222)', async () => {
    const tk = await dungTicket(P, 1, 'Có bằng chứng');
    await dungBangChung('bc-truot', tk, 'commit', {
      xac_minh: 'failed',
      ly_do: 'Không thấy commit trong repo',
      gui_luc: GIO - 2 * GIO_MS,
    });
    await dungBangChung('bc-truot-da-rut', tk, 'commit', {
      xac_minh: 'failed',
      ly_do: 'Gửi nhầm',
      gui_luc: GIO - 3 * GIO_MS,
      rut_luc: GIO - GIO_MS,
    });
    await dungBangChung('bc-dat', tk, 'deploy', { xac_minh: 'passed', gui_luc: GIO - GIO_MS });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const ds = lyDo(tq.can_chu_y).filter((d) => d.loai === 'bang_chung_truot');
    expect(ds.map((d) => d.bang_chung?.id)).toEqual(['bc-truot']);
    expect(ds[0]?.bang_chung?.ly_do).toBe('Không thấy commit trong repo');
  });

  it('(5) Chờ kiểm chứng QUÁ 24 GIỜ ra; 23 giờ thì chưa — mốc tính từ LỊCH SỬ vào `verifying`', async () => {
    const qua = await dungTicket(P, 1, 'Chờ 25 giờ', { trang_thai: 'verifying' });
    const chua = await dungTicket(P, 2, 'Chờ 23 giờ', { trang_thai: 'verifying' });
    await dungLichSuVaoVerifying(qua, GIO - 25 * GIO_MS);
    await dungLichSuVaoVerifying(chua, GIO - 23 * GIO_MS);
    /*
     * `cap_nhat_luc` của **cả hai** đặt về "vừa xong": nếu mã đọc `cap_nhat_luc`
     * thay vì lịch sử thì ca này đỏ. Đây là ca duy nhất bắt được lỗi đó.
     */
    await env.DB.prepare('UPDATE ticket SET cap_nhat_luc = ? WHERE workspace_id = ?')
      .bind(GIO - PHUT, WS)
      .run();

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const ds = lyDo(tq.can_chu_y).filter((d) => d.loai === 'ticket_cho_kiem_chung_qua_24h');
    expect(ds.map((d) => d.ticket?.ma)).toEqual(['SAI-1']);
    expect(ds[0]?.luc).toBe(GIO - 25 * GIO_MS);
  });

  it('(5) QUÁ TRẦN: ticket quá hạn KHÔNG bị một ticket chưa quá hạn chen mất chỗ', async () => {
    /*
     * Ca tái lập lỗi mà reviewer lượt 3 bắt. Bản đầu lấy `LIMIT 50` ticket
     * `verifying` **xếp theo `cap_nhat_luc`** rồi mới lọc quá-24-giờ ở phía
     * JavaScript — hai khoá khác nhau, nên dựng được trạng thái này:
     *
     *   * 50 ticket `verifying` **chưa** quá hạn, `cap_nhat_luc` **cũ**;
     *   * 1 ticket `verifying` **đã chờ 3 ngày** nhưng vừa bị sửa một nhãn, nên
     *     `cap_nhat_luc` là **mới nhất** workspace.
     *
     * Trên mã cũ, ticket thứ 51 rơi khỏi 50 dòng đầu và **mất hẳn** khỏi Cần chú
     * ý — im lặng, vì số dòng trả về vẫn trông hợp lý. (Đã xác nhận ca này đỏ
     * trên mã cũ bằng cách lật lại hai chặng rồi Edit về.)
     */
    for (let i = 1; i <= 50; i += 1) {
      const tk = await dungTicket(P, i, `Chờ kiểm mới ${String(i)}`, {
        trang_thai: 'verifying',
      });
      // Vào `verifying` mới đây ⇒ **chưa** quá hạn.
      await dungLichSuVaoVerifying(tk, GIO - PHUT);
      await env.DB.prepare('UPDATE ticket SET cap_nhat_luc = ? WHERE id = ?')
        .bind(GIO - 10 * GIO_MS, tk)
        .run();
    }
    const cu = await dungTicket(P, 51, 'Chờ ba ngày, vừa bị sửa nhãn', {
      trang_thai: 'verifying',
    });
    await dungLichSuVaoVerifying(cu, GIO - 72 * GIO_MS);
    await env.DB.prepare('UPDATE ticket SET cap_nhat_luc = ? WHERE id = ?')
      .bind(GIO - 1_000, cu)
      .run();

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const ds = lyDo(tq.can_chu_y).filter((d) => d.loai === 'ticket_cho_kiem_chung_qua_24h');
    expect(ds.map((d) => d.ticket?.ma)).toEqual(['SAI-51']);
    expect(ds[0]?.luc).toBe(GIO - 72 * GIO_MS);
  });

  it('(5) quá trần 50 thì cắt dòng MỚI NHẤT, giữ dòng chờ lâu nhất', async () => {
    // 51 ticket **đều** quá hạn, mốc vào `verifying` cách nhau một giờ: trần chỉ
    // được phép bỏ dòng mới nhất, không bỏ dòng cũ nhất.
    for (let i = 1; i <= 51; i += 1) {
      const tk = await dungTicket(P, i, `Chờ kiểm ${String(i)}`, { trang_thai: 'verifying' });
      await dungLichSuVaoVerifying(tk, GIO - (25 + i) * GIO_MS);
    }
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const ds = lyDo(tq.can_chu_y).filter((d) => d.loai === 'ticket_cho_kiem_chung_qua_24h');
    expect(ds.length).toBe(50);
    // Cũ nhất (`i = 51`, vào lúc GIO − 76 giờ) phải còn; mới nhất (`i = 1`) bị cắt.
    expect(ds[0]?.ticket?.ma).toBe('SAI-51');
    expect(ds.map((d) => d.ticket?.ma)).not.toContain('SAI-1');
  });

  it('(5) ĐÚNG mốc 24 giờ đã là quá hạn (`>=`, không `>`)', async () => {
    const tk = await dungTicket(P, 1, 'Chờ đúng 24 giờ', { trang_thai: 'verifying' });
    await dungLichSuVaoVerifying(tk, GIO - 24 * GIO_MS);
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(loai(tq.can_chu_y)).toContain('ticket_cho_kiem_chung_qua_24h');
  });

  it('năm nguồn cùng lúc: đủ cả năm, theo ĐÚNG thứ tự d.319 liệt kê', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    // (1) phiên đứng
    await ticketDangLamCoPhien(P, 1, ag, { im_phut: 31 });
    // (2) lượt không phản hồi
    const t2 = await dungTicket(P, 2, 'Chưa ai nhận');
    await dungLuotGiao('lg-qua', t2, ag, {
      trang_thai: 'pending',
      han_phan_hoi_luc: GIO - 5 * PHUT,
    });
    // (3) không ai cầm
    const t3 = await dungTicket(P, 3, 'Bỏ rơi', { trang_thai: 'in_progress' });
    await batCoKhongAiCam(t3, GIO - 30 * GIO_MS);
    // (4) bằng chứng trượt
    const t4 = await dungTicket(P, 4, 'Bằng chứng trượt');
    await dungBangChung('bc-truot', t4, 'commit', { xac_minh: 'failed', ly_do: 'không thấy' });
    // (5) chờ kiểm chứng quá hạn
    const t5 = await dungTicket(P, 5, 'Chờ kiểm lâu', { trang_thai: 'verifying' });
    await dungLichSuVaoVerifying(t5, GIO - 48 * GIO_MS);

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(loai(tq.can_chu_y)).toEqual([
      'phien_dung_hoac_loi',
      'luot_giao_khong_phan_hoi',
      'ticket_khong_ai_cam',
      'bang_chung_truot',
      'ticket_cho_kiem_chung_qua_24h',
    ]);
    // Mỗi dòng có nhãn tiếng Việt (mục 0.1: mã máy + nhãn hiển thị).
    expect(lyDo(tq.can_chu_y).every((d) => d.nhan_loai.length > 0)).toBe(true);
  });

  it('(4) bằng chứng trượt rồi có bằng chứng CÙNG LOẠI Đạt SAU ĐÓ ⇒ KHÔNG báo nữa', async () => {
    /*
     * d.321 + 19.7 ("`failed` không chặn vĩnh viễn: gửi bằng chứng mới là
     * được"). Bốn ticket dựng đúng bốn ca phân biệt được cách cài sai:
     *   SAI-1 trượt → `merged` sau  ⇒ **im**;
     *   SAI-2 trượt → `passed` **cùng loại** trước đó  ⇒ vẫn báo (Đạt cũ không
     *         cải chính được một trượt mới — 19.3);
     *   SAI-3 trượt `commit` → `passed` loại **khác** (`deploy`) sau ⇒ vẫn báo;
     *   SAI-4 trượt → `merged` sau nhưng bản Đạt **đã bị rút** ⇒ vẫn báo (d.222).
     */
    const t1 = await dungTicket(P, 1, 'Gửi lại và merge được');
    await dungBangChung('bc1-truot', t1, 'commit', {
      xac_minh: 'failed',
      ly_do: 'Không thấy commit',
      gui_luc: GIO - 3 * GIO_MS,
    });
    await dungBangChung('bc1-dat', t1, 'commit', {
      xac_minh: 'merged',
      gui_luc: GIO - GIO_MS,
    });

    const t2 = await dungTicket(P, 2, 'Đạt trước, trượt sau');
    await dungBangChung('bc2-dat', t2, 'commit', { xac_minh: 'merged', gui_luc: GIO - 3 * GIO_MS });
    await dungBangChung('bc2-truot', t2, 'commit', {
      xac_minh: 'failed',
      ly_do: 'Commit mới không merge được',
      gui_luc: GIO - GIO_MS,
    });

    const t3 = await dungTicket(P, 3, 'Đạt loại khác');
    await dungBangChung('bc3-truot', t3, 'commit', {
      xac_minh: 'failed',
      ly_do: 'Không thấy commit',
      gui_luc: GIO - 3 * GIO_MS,
    });
    await dungBangChung('bc3-dat-khac', t3, 'deploy', {
      xac_minh: 'passed',
      gui_luc: GIO - GIO_MS,
    });

    const t4 = await dungTicket(P, 4, 'Đạt sau nhưng đã rút');
    await dungBangChung('bc4-truot', t4, 'commit', {
      xac_minh: 'failed',
      ly_do: 'Không thấy commit',
      gui_luc: GIO - 3 * GIO_MS,
    });
    await dungBangChung('bc4-dat-da-rut', t4, 'commit', {
      xac_minh: 'merged',
      gui_luc: GIO - GIO_MS,
      rut_luc: GIO - 30 * PHUT,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const ds = lyDo(tq.can_chu_y).filter((d) => d.loai === 'bang_chung_truot');
    expect(ds.map((d) => d.bang_chung?.id).sort()).toEqual([
      'bc2-truot',
      'bc3-truot',
      'bc4-truot',
    ]);
  });

  it('GOM THEO TICKET: một ticket có hai lý do ⇒ MỘT dòng, hai nhãn', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    // Cùng một ticket: phiên đứng **và** bằng chứng trượt.
    const tk = await ticketDangLamCoPhien(P, 1, ag, { im_phut: 31 });
    await dungBangChung('bc-truot', tk, 'commit', {
      xac_minh: 'failed',
      ly_do: 'không thấy',
      gui_luc: GIO - 10 * GIO_MS,
    });
    // Một ticket khác, một lý do.
    const t2 = await dungTicket(P, 2, 'Bỏ rơi', { trang_thai: 'in_progress' });
    await batCoKhongAiCam(t2, GIO - 30 * GIO_MS);

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu_y.map((n) => n.ticket?.ma)).toEqual(['SAI-1', 'SAI-2']);
    expect(tq.can_chu_y.map((n) => n.ly_do.map((d) => d.loai))).toEqual([
      ['phien_dung_hoac_loi', 'bang_chung_truot'],
      ['ticket_khong_ai_cam'],
    ]);
    // `luc` của nhóm là mốc **sớm nhất** của nó (bằng chứng trượt 10 giờ trước).
    expect(tq.can_chu_y[0]?.luc).toBe(GIO - 10 * GIO_MS);
    // Khoá do máy chủ cấp, ổn định theo ticket (giao diện không tự dựng khoá).
    expect(tq.can_chu_y[0]?.khoa).toBe(`tk:${tk}`);
  });

  it('`gomTheoTicket` — luật thuần: dòng KHÔNG ticket đứng riêng từng dòng', () => {
    const dong = (loai_: LoaiCanChuY, luc: number, ticket_id: string | null): DongCanChuY => ({
      loai: loai_,
      nhan_loai: 'Nhãn',
      luc,
      ticket:
        ticket_id === null
          ? null
          : {
              id: ticket_id,
              ma: `SAI-${ticket_id}`,
              tieu_de: 'Việc',
              project_id: P,
              trang_thai: 'in_progress',
              nhan_trang_thai: 'Đang làm',
            },
      luot_giao: null,
      phien: null,
      bang_chung: null,
      thong_bao: null,
    });

    const ra = gomTheoTicket([
      dong('phien_dung_hoac_loi', 100, '1'),
      dong('thong_bao_gui_truot', 50, null),
      dong('bang_chung_truot', 10, '1'),
      dong('thong_bao_gui_truot', 20, null),
    ]);

    // Ba dòng: một nhóm ticket (hai lý do) và **hai** dòng tin lẻ, mỗi tin một dòng.
    expect(ra.map((n) => [n.ticket?.ma ?? null, n.ly_do.length, n.luc])).toEqual([
      ['SAI-1', 2, 10],
      [null, 1, 50],
      [null, 1, 20],
    ]);
    // Thứ tự **giữ nguyên** theo lần xuất hiện đầu, dù `luc` của nhóm tụt xuống 10.
    expect(ra.map((n) => n.khoa)).toEqual(['tk:1', 'le:thong_bao_gui_truot:1', 'le:thong_bao_gui_truot:2']);
  });

  it('BAT-10: ticket done/canceled/duplicate KHÔNG vào Cần chú ý; ticket mở cùng lý do vẫn vào', async () => {
    const ag = await dungAgent('ag-1', 'W1');
    const dong_ = ['done', 'canceled', 'duplicate'] as const;
    let so = 0;
    for (const trang_thai of dong_) {
      so += 1;
      const tk = await dungTicket(P, so, `Đóng ${trang_thai} - bằng chứng trượt`, { trang_thai });
      await dungBangChung(`bc-${trang_thai}`, tk, 'commit', { xac_minh: 'failed', ly_do: 'trượt' });
      so += 1;
      const tl = await dungTicket(P, so, `Đóng ${trang_thai} - quá hạn`, { trang_thai });
      await dungLuotGiao(`lg-qua-${trang_thai}`, tl, ag, {
        trang_thai: 'pending',
        han_phan_hoi_luc: GIO - 5 * PHUT,
      });
      so += 1;
      const tp = await dungTicket(P, so, `Đóng ${trang_thai} - phiên lỗi`, { trang_thai });
      const lg = await dungLuotGiao(`lg-ph-${trang_thai}`, tp, ag, { trang_thai: 'in_progress' });
      await dungPhien(`ph-${trang_thai}`, lg, {
        trang_thai: 'error',
        mo_luc: GIO - GIO_MS,
        tin_hieu_cuoi_luc: GIO - 3 * PHUT,
      });
    }
    // Ticket mở cùng lý do: vẫn ra.
    so += 1;
    const mo = await dungTicket(P, so, 'Mở - bằng chứng trượt');
    await dungBangChung('bc-mo', mo, 'commit', { xac_minh: 'failed', ly_do: 'trượt' });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu_y.map((n) => n.ticket?.ma)).toEqual([`SAI-${String(so)}`]);
  });

  it('workspace sạch ⇒ Cần chú ý RỖNG (không dòng rác nào)', async () => {
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.can_chu_y).toEqual([]);
  });
});

/* ================================================================== *
 * F. Khối 5 — Vừa xong (d.320)
 * ================================================================== */

describe('d.320 — ticket Xong 24 giờ qua + bằng chứng rút gọn', () => {
  it('chỉ ticket trong cửa sổ 24 giờ, mới nhất trước', async () => {
    const a = await dungTicket(P, 1, 'Xong 1 giờ trước', { trang_thai: 'done' });
    const b = await dungTicket(P, 2, 'Xong 20 giờ trước', { trang_thai: 'done' });
    const c = await dungTicket(P, 3, 'Xong 25 giờ trước', { trang_thai: 'done' });
    await datXongLuc(a, GIO - 1 * GIO_MS);
    await datXongLuc(b, GIO - 20 * GIO_MS);
    await datXongLuc(c, GIO - 25 * GIO_MS);

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.vua_xong_24h.map((d) => d.ticket.ma)).toEqual(['SAI-1', 'SAI-2']);
    expect(tq.vua_xong_24h[0]?.xong_luc).toBe(GIO - 1 * GIO_MS);
    // Cùng lượt gọi cũng trả cửa sổ 7 ngày, và nó **chứa** cửa sổ 24 giờ.
    expect(tq.vua_xong_7n.map((d) => d.ticket.ma)).toEqual(['SAI-1', 'SAI-2', 'SAI-3']);
  });

  it('HAI cửa sổ về cùng một lượt gọi: 24 giờ là tập con của 7 ngày, ngoài 7 ngày thì không', async () => {
    /*
     * d.320 "chọn cửa sổ 24 giờ **hoặc 7 ngày**". Nút đổi cửa sổ của trang
     * **không được** sinh một query thứ hai (d.410), nên cả hai tập phải có
     * trong một thân. Ca dựng đúng ba mốc phân biệt được: trong 24 giờ, trong 7
     * ngày nhưng ngoài 24 giờ, và ngoài 7 ngày.
     */
    const a = await dungTicket(P, 1, 'Xong 2 giờ trước', { trang_thai: 'done' });
    const b = await dungTicket(P, 2, 'Xong 3 ngày trước', { trang_thai: 'done' });
    const c = await dungTicket(P, 3, 'Xong 8 ngày trước', { trang_thai: 'done' });
    await datXongLuc(a, GIO - 2 * GIO_MS);
    await datXongLuc(b, GIO - 72 * GIO_MS);
    await datXongLuc(c, GIO - 8 * 24 * GIO_MS);

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.vua_xong_24h.map((d) => d.ticket.ma)).toEqual(['SAI-1']);
    expect(tq.vua_xong_7n.map((d) => d.ticket.ma)).toEqual(['SAI-1', 'SAI-2']);
  });

  it('ĐÚNG mốc 7 ngày vẫn còn trong cửa sổ dài (`>=`, không `>`)', async () => {
    const tk = await dungTicket(P, 1, 'Xong đúng 7 ngày trước', { trang_thai: 'done' });
    await datXongLuc(tk, GIO - 7 * 24 * GIO_MS);
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.vua_xong_7n.map((d) => d.ticket.ma)).toEqual(['SAI-1']);
    expect(tq.vua_xong_24h).toEqual([]);
  });

  it('ticket có `xong_luc` cũ nhưng ĐÃ MỞ LẠI (không `done`) không ra', async () => {
    const tk = await dungTicket(P, 1, 'Mở lại', { trang_thai: 'in_progress' });
    await datXongLuc(tk, GIO - 2 * GIO_MS);
    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.vua_xong_24h).toEqual([]);
    expect(tq.vua_xong_7n).toEqual([]);
  });

  it('bằng chứng rút gọn: hash ĐÚNG 7 ký tự, URL và mã phiên bản nguyên văn', async () => {
    const tk = await dungTicket(P, 1, 'Có bằng chứng', { trang_thai: 'done' });
    await datXongLuc(tk, GIO - GIO_MS);
    await dungBangChung('bc-commit', tk, 'commit', {
      commit_hash: 'a1b2c3d4e5f67890',
      repo: 'chu/baton',
      xac_minh: 'merged',
      gui_luc: GIO - 2 * GIO_MS,
    });
    await dungBangChung('bc-deploy', tk, 'deploy', {
      url: 'https://baton.example.com/',
      ma_phien_ban: 'e91efbeb',
      xac_minh: 'passed',
      gui_luc: GIO - GIO_MS,
    });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const bc = tq.vua_xong_24h[0]?.bang_chung ?? [];
    expect(bc.map((b) => b.id)).toEqual(['bc-commit', 'bc-deploy']);
    expect(bc[0]?.hash).toBe('a1b2c3d');
    expect(bc[0]?.hash?.length).toBe(7);
    // Hash **đầy đủ** không ra khỏi khối rút gọn.
    expect(JSON.stringify(bc)).not.toContain('a1b2c3d4e5f67890');
    expect(bc[1]?.url).toBe('https://baton.example.com/');
    expect(bc[1]?.ma_phien_ban).toBe('e91efbeb');
    expect(bc[1]?.hash).toBeNull();
  });

  it('bằng chứng đã RÚT không hiện ở "Vừa xong" (d.222)', async () => {
    const tk = await dungTicket(P, 1, 'Đã rút', { trang_thai: 'done' });
    await datXongLuc(tk, GIO - GIO_MS);
    await dungBangChung('bc-rut', tk, 'commit', { rut_luc: GIO - PHUT });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    expect(tq.vua_xong_24h[0]?.bang_chung).toEqual([]);
  });

  it('`hashRutGon` — luật thuần: cắt 7, giữ nguyên hash ngắn, `null` cho rỗng', () => {
    expect(hashRutGon('0123456789abcdef')).toBe('0123456');
    expect(hashRutGon('abc')).toBe('abc');
    expect(hashRutGon(null)).toBeNull();
    expect(hashRutGon('')).toBeNull();
  });
});

/* ================================================================== *
 * G. Hiệu năng: KHÔNG N+1
 * ================================================================== */

describe('19.12 câu 1 — số truy vấn KHÔNG tăng theo số dự án hay số agent', () => {
  /** Đếm số lần `prepare` của một lượt mở Tổng quan. */
  function demPrepare(): { db: D1Database; so: () => number } {
    let n = 0;
    const that = env.DB;
    const db = new Proxy(that, {
      get(t, k, r): unknown {
        if (k === 'prepare') {
          return (sql: string): D1PreparedStatement => {
            n += 1;
            return t.prepare(sql);
          };
        }
        return Reflect.get(t, k, r) as unknown;
      },
    });
    return { db, so: () => n };
  }

  /**
   * Dựng `so` dự án, **mỗi dự án có dữ liệu thật** ở cả bốn khối: một agent, một
   * ticket Đang làm có phiên, một ticket Chờ kiểm chứng, một ticket Xong, một
   * mục Cần Chủ.
   *
   * Dữ liệu thật là **điều kiện** để ca N+1 nói được điều nó tưởng: đo bằng đột
   * biến, một fixture chỉ có dự án rỗng làm mọi vòng lặp theo-dự-án chạy **không
   * lần nào**, nên cài một N+1 thật vẫn xanh.
   */
  async function dungNhieuDuAn(tu: number, den: number): Promise<void> {
    for (let i = tu; i < den; i += 1) {
      const ma = `D${String(i)}`;
      const pj = await dungDuAn(ma, `Dự án ${String(i)}`);
      const ag = await dungAgent(`ag-${String(i)}`, `Agent ${String(i)}`);
      await ticketDangLamCoPhien(pj, 1, ag, { im_phut: 1 });
      await dungTicket(pj, 2, 'Chờ kiểm', { trang_thai: 'verifying' });
      const xong = await dungTicket(pj, 3, 'Đã xong', { trang_thai: 'done' });
      await datXongLuc(xong, GIO - GIO_MS);
      await dungCanChu(`ct-${String(i)}`, { muc: 'today', project_id: pj });
    }
  }

  it('2 dự án + 2 agent và 12 dự án + 12 agent: CÙNG một số truy vấn', async () => {
    await dungNhieuDuAn(0, 2);
    const dem1 = demPrepare();
    const nho_tq = await tongQuan(dem1.db, CHU, WS, GIO);
    const nho = dem1.so();
    // Lưới của chính ca này: fixture nhỏ phải thực sự có dữ liệu ở mọi khối.
    expect(nho_tq.du_an.some((d) => d.suc_song === 'xanh')).toBe(true);
    expect(nho_tq.vua_xong_24h.length).toBe(2);

    await dungNhieuDuAn(2, 12);
    const dem2 = demPrepare();
    const tq = await tongQuan(dem2.db, CHU, WS, GIO);
    // 12 dự án mới + 2 dự án của `beforeEach`.
    expect(tq.du_an.length).toBe(14);
    expect(tq.agent.length).toBe(12);
    expect(tq.vua_xong_24h.length).toBe(12);
    expect(dem2.so()).toBe(nho);
  });

  it('`GET /v1/du-an` cũng không N+1 khi thêm dự án', async () => {
    await dungNhieuDuAn(0, 2);
    const dem1 = demPrepare();
    const nho_trang = await lietKeDuAn(dem1.db, CHU, WS, {}, GIO);
    const nho = dem1.so();
    expect(nho_trang.items.some((d) => d.suc_song === 'xanh')).toBe(true);

    await dungNhieuDuAn(2, 12);
    const dem2 = demPrepare();
    const trang = await lietKeDuAn(dem2.db, CHU, WS, {}, GIO);
    expect(trang.items.length).toBe(14);
    expect(dem2.so()).toBe(nho);
  });
});

/* ================================================================== *
 * H. Mọi câu ràng `workspace_id`
 * ================================================================== */

/**
 * Dựng một **workspace thứ hai** có dữ liệu ở **cả năm** khối của d.316–320.
 *
 * Insert thô, không qua `giup.ts`: mọi fixture ở đó ràng cứng `WS`. Mọi CHECK và
 * trigger của lược đồ vẫn áp — không có cửa hậu nào ở tầng DB.
 *
 * Đây là lưới duy nhất cho luật "mọi câu SQL ràng cả `workspace_id`"
 * (`quyet-dinh.md`): không có workspace thứ hai thì bỏ một vế `workspace_id = ?`
 * **không làm ca nào đỏ**, và ca "`toContain('workspace_id = ?')`" của lượt
 * trước chỉ đọc được **một** câu trong mười.
 */
async function dungWorkspaceKhacDayDu(): Promise<void> {
  const t = GIO - 2 * GIO_MS;
  const ws = WS_KHAC;

  await env.DB.prepare(
    'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
  )
    .bind(ws, 'Người khác', t, t)
    .run();
  await env.DB.prepare(
    `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
     VALUES ('pj-khac', ?, 'Dự án của người khác', 'OTH', 'active', ?, ?)`,
  )
    .bind(ws, t, t)
    .run();
  await env.DB.prepare(
    `INSERT INTO agent (id, workspace_id, ten, vai_tro, len_tieng_luc, tao_luc, cap_nhat_luc)
     VALUES ('ag-khac', ?, 'Agent của người khác', 'worker', ?, ?, ?)`,
  )
    .bind(ws, GIO - PHUT, t, t)
    .run();

  const ticket = async (
    id: string,
    so: number,
    tieu_de: string,
    trang_thai: string,
    them: { xong_luc?: number; co_khong_ai_cam?: boolean } = {},
  ): Promise<string> => {
    await env.DB.prepare(
      `INSERT INTO ticket
         (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
          chiu_trach_nhiem_loai, nguoi_tao_loai, co_khong_ai_cam, xong_luc,
          tao_luc, cap_nhat_luc)
       VALUES (?, ?, 'pj-khac', ?, ?, ?, 'none', 4, 'owner', 'owner', ?, ?, ?, ?)`,
    )
      .bind(
        id,
        ws,
        so,
        tieu_de,
        trang_thai,
        them.co_khong_ai_cam === true ? 1 : 0,
        them.xong_luc ?? null,
        t,
        t,
      )
      .run();
    return id;
  };

  // (2) Dự án của WS khác phải có ticket Đang làm + phiên ĐỨNG ⇒ nếu một câu
  // quên `workspace_id`, dự án của WS1 sẽ đổi màu theo phiên của WS2.
  const dang_lam = await ticket('tk-khac-dang-lam', 1, 'Việc của người khác', 'in_progress');
  await env.DB.prepare(
    `INSERT INTO luot_giao
       (id, workspace_id, ticket_id, so_luot, loai, nguoi_giao_loai, nguoi_nhan_agent_id,
        trang_thai, tao_luc, cap_nhat_luc)
     VALUES ('lg-khac', ?, ?, 1, 'work', 'owner', 'ag-khac', 'in_progress', ?, ?)`,
  )
    .bind(ws, dang_lam, t, t)
    .run();
  await env.DB.prepare(
    `INSERT INTO phien
       (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
        tin_hieu_cuoi_luc, mo_luc, cap_nhat_luc)
     VALUES ('ph-khac', ?, 'lg-khac', ?, 'ag-khac', 'running', ?, ?, ?)`,
  )
    .bind(ws, dang_lam, GIO - 90 * PHUT, t, t)
    .run();

  // (4) Lượt quá hạn phản hồi, ticket không ai cầm, Chờ kiểm chứng quá hạn,
  //     bằng chứng trượt — bốn trong năm nguồn của d.319.
  const cho_nhan = await ticket('tk-khac-cho-nhan', 2, 'Chưa ai nhận', 'todo');
  await env.DB.prepare(
    `INSERT INTO luot_giao
       (id, workspace_id, ticket_id, so_luot, loai, nguoi_giao_loai, nguoi_nhan_agent_id,
        trang_thai, han_phan_hoi_luc, tao_luc, cap_nhat_luc)
     VALUES ('lg-khac-cho', ?, ?, 1, 'work', 'owner', 'ag-khac', 'pending', ?, ?, ?)`,
  )
    .bind(ws, cho_nhan, GIO - 30 * PHUT, t, t)
    .run();
  await ticket('tk-khac-bo-roi', 3, 'Bỏ rơi của người khác', 'in_progress', {
    co_khong_ai_cam: true,
  });
  const cho_kiem = await ticket('tk-khac-cho-kiem', 4, 'Chờ kiểm của người khác', 'verifying');
  await env.DB.prepare(
    `INSERT INTO ticket_history
       (id, workspace_id, ticket_id, tac_gia_loai, luc, truong, gia_tri_cu, gia_tri_moi)
     VALUES (?, ?, ?, 'owner', ?, 'trang_thai', 'in_progress', 'verifying')`,
  )
    .bind(crypto.randomUUID(), ws, cho_kiem, GIO - 48 * GIO_MS)
    .run();

  // (5) Ticket Xong trong 24 giờ + bằng chứng (một `failed` cho nguồn (4), một
  //     `commit` cho khối "Vừa xong").
  const xong = await ticket('tk-khac-xong', 5, 'Xong của người khác', 'done', {
    xong_luc: GIO - GIO_MS,
  });
  // BAT-10: ticket ĐÃ ĐÓNG không còn vào Cần chú ý, nên bằng chứng trượt của WS2
  // gắn vào một ticket MỞ riêng (đổi so với bản cũ gắn vào ticket `done`).
  const mo_truot = await ticket('tk-khac-mo-truot', 6, 'Mở của người khác', 'todo');
  await env.DB.prepare(
    `INSERT INTO evidence
       (id, workspace_id, ticket_id, loai, nguoi_gui_loai, gui_luc, xac_minh, ly_do,
        commit_hash, repo, so_lan_thu, tao_luc, cap_nhat_luc)
     VALUES ('bc-khac-truot', ?, ?, 'commit', 'owner', ?, 'failed', 'Lý do của người khác',
             'deadbeefcafe', 'nguoi/khac', 3, ?, ?)`,
  )
    .bind(ws, mo_truot, t, t, t)
    .run();
  await env.DB.prepare(
    `INSERT INTO evidence
       (id, workspace_id, ticket_id, loai, nguoi_gui_loai, gui_luc, xac_minh,
        commit_hash, repo, so_lan_thu, tao_luc, cap_nhat_luc)
     VALUES ('bc-khac-merged', ?, ?, 'commit', 'owner', ?, 'merged',
             'facefeed1234', 'nguoi/khac', 0, ?, ?)`,
  )
    .bind(ws, xong, t, t, t)
    .run();

  // (1) Một mục Cần Chủ 🔴 — mức cao hơn mọi mục của WS1 trong ca dưới, nên nếu
  //     câu đếm hay câu "3 gấp nhất" quên `workspace_id` thì nó lên đầu ngay.
  await env.DB.prepare(
    `INSERT INTO can_chu
       (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
        lenh, can_tty, tao_luc, cap_nhat_luc)
     VALUES ('ct-khac', ?, 1, 'Mục Cần Chủ của người khác', 'pj-khac', 'urgent',
             'run_command', 'open', 'rm -rf /', 0, ?, ?)`,
  )
    .bind(ws, GIO - 5 * GIO_MS, t)
    .run();
}

describe('mục 1 — dữ liệu tách theo workspace', () => {
  it('mọi câu của Tổng quan ràng `workspace_id` — câu xuất ra được', () => {
    /*
     * Ca này chỉ đọc **một** câu (câu duy nhất tách ra được để test). Nó **không**
     * phủ chín câu còn lại — lượt trước khai là "các câu còn lại đã được ca dữ
     * liệu phủ", và đó là **khai quá**: trước ca dưới đây, cả file không có
     * workspace thứ hai, nên bỏ một vế `workspace_id = ?` ở bất kỳ câu nào cũng
     * không làm ca nào đỏ. Lưới thật là ca kế tiếp.
     */
    expect(cauGapNhat(WS).sql).toContain('ct.workspace_id = ?');
    expect(cauChoKiemChungQuaHan(WS, GIO).sql).toContain('t.workspace_id = ?');
  });

  /*
   * **Ca dưới đây canh được bảy câu trong mười, không mười** — đo bằng đột biến,
   * khai thẳng thay vì khai "mọi câu":
   *
   *   * **Bắt được** (bỏ vế `workspace_id` ⇒ ca đỏ): `cauGapNhat`, `huyHieuCanChu`,
   *     `cauChoKiemChungQuaHan`, `nguonKhongPhanHoi`, `nguonKhongAiCam`,
   *     `nguonBangChungTruot`, `khoiVuaXong` + câu bằng chứng của nó. Chúng trả
   *     **dòng** đi thẳng vào thân phản hồi, nên một dòng lạ lộ ra ngay.
   *   * **KHÔNG bắt được, và vì một lý do cấu trúc, không vì thiếu ca**: ba câu
   *     gộp của `doc-suc-song.ts` (đếm theo trạng thái, đếm Xong 24 giờ) và câu
   *     `ticketDangCam`. Cả bốn trả về một **`Map` tra theo id** (`project_id`,
   *     `agent_id`), và chỗ gọi chỉ tra những id mà **câu liệt kê đã qua cửa
   *     phạm vi** của nó trả về — nên một dòng của workspace khác vào Map cũng
   *     không có ai đọc. Đã thử bỏ vế `workspace_id` của `demTheoTrangThai` và
   *     của `ticketDangCam`: **không ca nào đỏ**. Đó đúng là tính chất mà khối
   *     ghi chú đầu `doc-suc-song.ts` khai ("không lộ ra ngoài API"), nhưng nó là
   *     một **lời khai về cấu trúc**, không phải một cổng có test — nên vế
   *     `workspace_id` ở bốn câu đó phải giữ, và nếu một lượt sau đổi chỗ gọi
   *     thành "lấy mọi khoá của Map" thì lưới duy nhất là đọc lại ghi chú này.
   */
  it('workspace KHÁC có dữ liệu ở cả NĂM khối ⇒ Tổng quan của WS1 không chứa một mảnh nào', async () => {
    await dungWorkspaceKhacDayDu();
    // WS1 có đúng một mục Cần Chủ 🟡 và không gì khác, nên mọi dòng lạ đều là của WS2.
    await dungCanChu('ct-cua-toi', { muc: 'today', project_id: P });

    const tq = await tongQuan(env.DB, CHU, WS, GIO);
    const than = JSON.stringify(tq);

    // Lưới của chính ca này: WS2 **thật sự** có dữ liệu ở cả năm khối.
    const tq_khac = await tongQuan(env.DB, CHU, WS_KHAC, GIO);
    expect(tq_khac.can_chu.so_cho).toBe(1);
    expect(tq_khac.du_an.length).toBe(1);
    expect(tq_khac.agent.length).toBe(1);
    expect(loai(tq_khac.can_chu_y).sort()).toEqual(
      [
        'bang_chung_truot',
        'luot_giao_khong_phan_hoi',
        'phien_dung_hoac_loi',
        'ticket_cho_kiem_chung_qua_24h',
        'ticket_khong_ai_cam',
      ].sort(),
    );
    expect(tq_khac.vua_xong_24h.length).toBe(1);
    // WS2 có hai ticket `in_progress` và một `verifying`.
    expect(tq_khac.viec_dang_chay.length).toBe(3);

    // Ô Cần Chủ — không đếm, không xếp mục của WS2 vào "3 gấp nhất".
    expect(tq.can_chu.so_theo_muc).toEqual({ urgent: 0, today: 1, later: 0 });
    expect(tq.can_chu.muc_cao_nhat).toBe('today');
    expect(tq.can_chu.gap_nhat.map((m) => m.id)).toEqual(['ct-cua-toi']);

    // Khối 1 — chỉ hai dự án của `beforeEach`, và phiên đứng của WS2 không đổi màu.
    expect(tq.du_an.map((d) => d.ma)).toEqual(['COS', 'SAI']);
    expect(tq.du_an.map((d) => d.suc_song)).toEqual(['trang', 'trang']);
    expect(tq.du_an.map((d) => [d.so_dang_lam, d.so_cho_kiem_chung, d.so_xong_24h])).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    // Thanh tiến độ và "việc nổi bật" cũng không ăn ticket của WS2.
    expect(tq.du_an.map((d) => [d.so_xong, d.so_tong, d.so_can_lam])).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(tq.du_an.map((d) => d.viec_noi_bat)).toEqual([null, null]);

    // Khối 2, 3, 4, 5 — rỗng sạch.
    expect(tq.viec_dang_chay).toEqual([]);
    expect(tq.agent).toEqual([]);
    expect(tq.agent_ranh_so).toBe(0);
    expect(tq.can_chu_y).toEqual([]);
    expect(tq.vua_xong_24h).toEqual([]);
    expect(tq.vua_xong_7n).toEqual([]);

    // Và không một id, mã hay chuỗi nào của WS2 lọt vào thân.
    expect(than).not.toContain('khac');
    expect(than).not.toContain('OTH');
    expect(than).not.toContain('deadbee');
  });

  it('`GET /v1/du-an` của WS1 cũng không mang sức sống của workspace khác', async () => {
    await dungWorkspaceKhacDayDu();
    const trang = await lietKeDuAn(env.DB, CHU, WS, {}, GIO);
    expect(trang.items.map((d) => [d.ma, d.suc_song])).toEqual([
      ['COS', 'trang'],
      ['SAI', 'trang'],
    ]);
  });
});
