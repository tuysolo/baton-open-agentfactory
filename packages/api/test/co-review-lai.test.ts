/**
 * **Cờ "cần review lại"** — SPEC 19.3 d.494–496, 19.6 d.522, 19.11 d.555, mục 7
 * d.221–222.
 *
 * Ba tầng, ba nhóm ca, vì ba tầng hỏng theo ba cách khác nhau:
 *
 *   A. **Luật thuần** (`tinhCanReviewLai` của `@baton/shared`) — không DB. Đây là
 *      chỗ duy nhất có luật, nên mỗi câu SPEC được canh ở đây trước.
 *   B. **Qua D1 và cửa ghi** — cờ và mốc thật sự nằm trong hai cột
 *      `ticket.co_can_review_lai` (0001) + `ticket.can_review_lai_luc` (0011), và
 *      hai **trigger** của 0011 ABORT nếu cờ với mốc lệch nhau. Một test hàm thuần
 *      không chạm tới được bất cứ điều nào trong câu trên.
 *   C. **Trigger 0011** — luật "cờ và mốc cùng có hoặc cùng không" là luật của DB,
 *      nên nó phải được canh bằng một lần ghi bị ABORT thật.
 *
 * **Mỗi khẳng định "không bật cờ" có một ca ĐỐI CHỨNG ngay cạnh**: cùng dữ liệu,
 * đổi đúng một thứ, rồi cờ bật được. Một assert `toBe(false)` không có đối chứng
 * xanh y nguyên khi cả hàm trả `false` mãi.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  apDungLuat,
  tinhCanReviewLai,
  type BangChungChoCong,
  type BoiCanhLuat,
  type TrangThaiTicket,
} from '@baton/shared';
import { quetThuLai } from '../src/cron-bang-chung.js';
import { khoaCommit } from '../src/nguon-github.js';
import {
  CHU,
  CONG_DU_GIA,
  TOKEN_CHU,
  WS,
  chayLenhVoiCong,
  datNguonGiaLap,
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

const TOKEN = { worker: 'bt_t_wk', reviewer: 'bt_t_rv' } as const;
const ID = { worker: 'ag-wk', reviewer: 'ag-rv' } as const;

const HASH = 'a1b2c3d4e5f6a7b8';
const REPO = 'chu/baton';

/* ------------------------------------------------------------------ *
 * Dựng bằng chứng cho **luật thuần** — không DB
 * ------------------------------------------------------------------ */

function commit(gui_luc: number, xac_minh: BangChungChoCong['xac_minh'] = 'merged'): BangChungChoCong {
  return { loai: 'commit', gui_luc, xac_minh, rut_luc: null };
}

function review(
  gui_luc: number,
  ket_luan: 'pass' | 'fail',
  them: Partial<BangChungChoCong> = {},
): BangChungChoCong {
  return { loai: 'review', gui_luc, xac_minh: 'not_required', rut_luc: null, ket_luan, ...them };
}

function tinh(
  trang_thai: TrangThaiTicket,
  bang_chung: readonly BangChungChoCong[],
  nguoi_lam: readonly string[] = [],
): ReturnType<typeof tinhCanReviewLai> {
  return tinhCanReviewLai({ trang_thai, bang_chung, nguoi_lam });
}

/* ================================================================== *
 * A. Luật thuần — SPEC 19.3 d.494–496, 19.11 d.555
 * ================================================================== */

describe('A. luật thuần: cờ "cần review lại" phải là gì', () => {
  it('d.494 — review ĐẠT rồi có commit MỚI hơn → cờ bật, lý do `review_het_hieu_luc`', () => {
    expect(tinh('verifying', [commit(100), review(200, 'pass'), commit(300)])).toEqual({
      co: true,
      ly_do: 'review_het_hieu_luc',
      ve_cho_kiem_chung: false,
    });
  });

  it('ĐỐI CHỨNG d.494 — review ĐẠT gửi SAU commit cuối → cờ TẮT', () => {
    expect(tinh('verifying', [commit(100), commit(300), review(400, 'pass')])).toEqual({
      co: false,
      ly_do: null,
      ve_cho_kiem_chung: false,
    });
  });

  it('d.494 — "gửi sau" là so CHẶT: review ĐẠT cùng millisecond với commit → cờ vẫn BẬT', () => {
    // Cùng nếp `congXong`: hai bằng chứng cùng một millisecond thì không ai nói
    // được cái nào trước, nên hướng đóng.
    expect(tinh('verifying', [commit(300), review(300, 'pass')]).co).toBe(true);
    // Đối chứng: lệch đúng 1 ms về sau thì tắt.
    expect(tinh('verifying', [commit(300), review(301, 'pass')]).co).toBe(false);
  });

  it('d.555 — review KHÔNG ĐẠT → cờ bật, lý do `review_khong_dat`', () => {
    expect(tinh('verifying', [commit(100), review(200, 'fail')])).toEqual({
      co: true,
      ly_do: 'review_khong_dat',
      ve_cho_kiem_chung: false,
    });
  });

  /*
   * **ĐƯỜNG TẮT ĐỨNG TRƯỚC HAI NHÁNH BẬT, kể cả trước review KHÔNG ĐẠT.**
   *
   * Ba ca dưới đây chốt đúng thứ tự đó, vì nó dễ hiểu sai: một review ĐẠT **được
   * tính** và gửi **sau** commit/deploy cuối là gạch 2 của cổng đã đạt
   * (`congXong`), nên cổng **mở**. Nếu cờ vẫn bật trong ca ấy thì cổng và cờ nói
   * hai chuyện khác nhau về cùng một ticket — đúng cái mà `co-review-lai.ts` tồn
   * tại để tránh. Hệ quả: tie-break "KHÔNG ĐẠT thắng" chỉ áp **khi không có review
   * ĐẠT nào mở được cổng**. Xem `spec-questions.md` #65.
   */
  it('review ĐẠT mở được cổng thì cờ TẮT, dù có một review `fail` cùng lúc (#65)', () => {
    expect(tinh('verifying', [commit(100), review(200, 'fail'), review(200, 'pass')]).co).toBe(
      false,
    );
    // ĐỐI CHỨNG: đẩy commit cuối ra **sau** cả hai review → không review ĐẠT nào mở
    // được cổng, nên cờ bật và tie-break áp.
    const kq = tinh('verifying', [review(200, 'fail'), review(200, 'pass'), commit(300)]);
    expect(kq.co).toBe(true);
    expect(kq.ly_do).toBe('review_khong_dat');
  });

  it('d.555 — `fail` và `pass` CÙNG millisecond, cả hai TRƯỚC commit cuối: "KHÔNG ĐẠT" thắng', () => {
    const kq = tinh('verifying', [review(200, 'fail'), review(200, 'pass'), commit(400)]);
    expect(kq.co).toBe(true);
    expect(kq.ly_do).toBe('review_khong_dat');
  });

  it('lý do đi theo review còn hiệu lực MỚI NHẤT: `pass` cũ + `fail` mới → `review_khong_dat`', () => {
    expect(
      tinh('verifying', [review(200, 'pass'), review(300, 'fail'), commit(400)]).ly_do,
    ).toBe('review_khong_dat');
    // Đối chứng ngược: `fail` cũ + `pass` mới (vẫn trước commit cuối) → hết hiệu lực.
    expect(
      tinh('verifying', [review(100, 'fail'), review(200, 'pass'), commit(300)]).ly_do,
    ).toBe('review_het_hieu_luc');
  });

  it('CHƯA CÓ REVIEW NÀO → cờ tắt (không có gì "lại")', () => {
    expect(tinh('verifying', [commit(100), commit(300)]).co).toBe(false);
    // Đối chứng: thêm đúng một review `fail` thì bật.
    expect(tinh('verifying', [commit(100), commit(300), review(400, 'fail')]).co).toBe(true);
  });

  it('review đã RÚT không tính (d.222) → cờ tắt; đối chứng: chưa rút thì bật', () => {
    const da_rut = review(200, 'fail', { rut_luc: 250 });
    expect(tinh('verifying', [commit(100), da_rut]).co).toBe(false);
    expect(tinh('verifying', [commit(100), review(200, 'fail')]).co).toBe(true);
  });

  it('d.496 — review ĐẠT do CHÍNH NGƯỜI LÀM gửi: không bật cờ (chưa có lần review nào được tính)', () => {
    const cua_nguoi_lam = review(200, 'pass', {
      nguoi_gui: { loai: 'agent', agent_id: ID.worker },
    });
    expect(tinh('verifying', [commit(100), cua_nguoi_lam, commit(300)], [ID.worker]).co).toBe(
      false,
    );
    // ĐỐI CHỨNG: cùng dữ liệu, người gửi KHÁC người làm → cờ bật.
    expect(
      tinh('verifying', [commit(100), cua_nguoi_lam, commit(300)], [ID.reviewer]).co,
    ).toBe(true);
  });

  it('d.495 — ticket nhóm `closed` KHÔNG BAO GIỜ mang cờ', () => {
    const bc = [commit(100), review(200, 'fail'), commit(300)];
    for (const tt of ['done', 'canceled', 'duplicate'] as const) {
      expect(tinh(tt, bc)).toEqual({ co: false, ly_do: null, ve_cho_kiem_chung: false });
    }
    // ĐỐI CHỨNG: cùng bằng chứng, ticket còn `active` → cờ bật.
    expect(tinh('in_progress', bc).co).toBe(true);
  });

  it('d.494 "ở hoặc VỀ Chờ kiểm chứng": nhóm `active` khác `verifying` thì bị kéo về', () => {
    const bc = [commit(100), review(200, 'pass'), commit(300)];
    expect(tinh('in_progress', bc).ve_cho_kiem_chung).toBe(true);
    // Đã ở đó rồi thì không có gì để đổi.
    expect(tinh('verifying', bc).ve_cho_kiem_chung).toBe(false);
  });

  it('nhóm `planned` — cờ BẬT được nhưng KHÔNG bị kéo sang Chờ kiểm chứng', () => {
    const bc = [commit(100), review(200, 'fail')];
    for (const tt of ['backlog', 'todo'] as const) {
      const kq = tinh(tt, bc);
      expect(kq.co).toBe(true);
      expect(kq.ve_cho_kiem_chung).toBe(false);
    }
  });
});

describe('A2. sự kiện `can_review_lai` của luật trạng thái — tầng hai của d.494/d.495', () => {
  const bc = (trang_thai: TrangThaiTicket): BoiCanhLuat => ({
    trang_thai,
    la_chu: false,
    la_dieu_phoi: false,
    con_chua_ket: 0,
    cong: { du: false, ly_do: '' },
  });

  it('d.494 — `ve_cho_kiem_chung` bật → sang Chờ kiểm chứng, tác giả hệ thống', () => {
    expect(apDungLuat({ loai: 'can_review_lai', ve_cho_kiem_chung: true }, bc('in_progress'))).toEqual(
      { trang_thai: 'verifying', he_thong: true },
    );
  });

  it('ĐỐI CHỨNG — `ve_cho_kiem_chung` tắt thì không đổi gì', () => {
    expect(
      apDungLuat({ loai: 'can_review_lai', ve_cho_kiem_chung: false }, bc('in_progress')),
    ).toEqual({ trang_thai: 'in_progress' });
  });

  it('d.495 — nhóm `closed` KHÔNG BỊ HẠ dù tầng trên nói `ve_cho_kiem_chung`', () => {
    for (const tt of ['done', 'canceled', 'duplicate'] as const) {
      expect(
        apDungLuat({ loai: 'can_review_lai', ve_cho_kiem_chung: true }, bc(tt)).trang_thai,
      ).toBe(tt);
    }
  });

  it('19.4 d.502 — ticket ĐIỀU PHỐI giữ nguyên trạng thái (cùng lớp chặn với `kiem_cong_lai`)', () => {
    expect(
      apDungLuat(
        { loai: 'can_review_lai', ve_cho_kiem_chung: true },
        { ...bc('in_progress'), la_dieu_phoi: true },
      ),
    ).toEqual({ trang_thai: 'in_progress' });
    // ĐỐI CHỨNG: cùng bối cảnh, ticket **dự án** thì vẫn bị kéo.
    expect(
      apDungLuat({ loai: 'can_review_lai', ve_cho_kiem_chung: true }, bc('in_progress'))
        .trang_thai,
    ).toBe('verifying');
  });
});

/* ================================================================== *
 * B + C. Qua D1, cửa ghi, và trigger 0011
 * ================================================================== */

/** Hai cột cờ + trạng thái + mốc cập nhật, đọc **thô** từ DB. */
async function coTrongDb(ticket_id = TK): Promise<{
  co_can_review_lai: number;
  can_review_lai_luc: number | null;
  trang_thai: string;
  cap_nhat_luc: number;
}> {
  const d = await env.DB.prepare(
    `SELECT co_can_review_lai, can_review_lai_luc, trang_thai, cap_nhat_luc
       FROM ticket WHERE id = ?`,
  )
    .bind(ticket_id)
    .first<{
      co_can_review_lai: number;
      can_review_lai_luc: number | null;
      trang_thai: string;
      cap_nhat_luc: number;
    }>();
  if (d === null) throw new Error(`Không có ticket ${ticket_id}`);
  return d;
}

/** Đặt cờ + mốc bằng tay (fixture) — tôn trọng trigger 0011. */
async function datCo(co: boolean, moc: number | null, ticket_id = TK): Promise<void> {
  await env.DB.prepare(
    'UPDATE ticket SET co_can_review_lai = ?, can_review_lai_luc = ? WHERE id = ?',
  )
    .bind(co ? 1 : 0, moc, ticket_id)
    .run();
}

/** Số dòng lịch sử của trường `co_can_review_lai`, kèm tác giả. */
async function lichSuCo(): Promise<{ gia_tri_cu: string | null; gia_tri_moi: string | null; tac_gia_loai: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT gia_tri_cu, gia_tri_moi, tac_gia_loai FROM ticket_history
      WHERE ticket_id = ? AND truong = 'co_can_review_lai' ORDER BY luc, id`,
  )
    .bind(TK)
    .all<{ gia_tri_cu: string | null; gia_tri_moi: string | null; tac_gia_loai: string }>();
  return results;
}

function guiBangChung(token: string, than: Record<string, unknown>): Promise<Response> {
  return goiApi(`/v1/ticket/${TK}/bang-chung`, token, { method: 'POST', than });
}

/** Thân JSON của một phản hồi, không `as` — `Response.json` của Workers là generic. */
function thanJson(res: Response): Promise<Record<string, unknown>> {
  return res.json<Record<string, unknown>>();
}

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn('SAI', 'Sample');
  await dungTicket(P, 1, 'Việc có bằng chứng', { trang_thai: 'verifying' });

  await dungAgentCoToken({
    id: ID.worker, ten: 'W', vai_tro: 'worker', token: TOKEN.worker, du_an: [P],
  });
  await dungAgentCoToken({
    id: ID.reviewer, ten: 'R', vai_tro: 'reviewer', token: TOKEN.reviewer, du_an: [P],
  });

  datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' }, deploy: {} });
});

describe('B. qua D1 và cửa ghi: gửi bằng chứng', () => {
  it('d.555 — gửi review `fail` qua HTTP → cờ BẬT trong DB, có mốc, lịch sử ghi "hệ thống"', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });

    const res = await guiBangChung(TOKEN.reviewer, {
      loai_bang_chung: 'review',
      ket_luan: 'fail',
      ghi_chu: 'Thiếu test cho nhánh lỗi.',
    });
    expect(res.status).toBe(201);
    const than = await thanJson(res);
    expect(than['can_review_lai']).toBe(true);
    expect(than['can_review_lai_ly_do']).toBe('review_khong_dat');

    const d = await coTrongDb();
    expect(d.co_can_review_lai).toBe(1);
    expect(d.can_review_lai_luc).not.toBeNull();

    const ls = await lichSuCo();
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ gia_tri_cu: '0', gia_tri_moi: '1', tac_gia_loai: 'system' });
  });

  it('ĐỐI CHỨNG d.555 — cùng lệnh, `ket_luan` là `pass` (gửi sau commit) → cờ TẮT', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });

    const res = await guiBangChung(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' });
    expect(res.status).toBe(201);
    expect((await thanJson(res))['can_review_lai']).toBe(false);

    const d = await coTrongDb();
    expect(d.co_can_review_lai).toBe(0);
    expect(d.can_review_lai_luc).toBeNull();
    expect(await lichSuCo()).toHaveLength(0);
  });

  it('d.494 — commit MỚI sau review ĐẠT: cờ bật VÀ ticket về Chờ kiểm chứng', async () => {
    // Ticket đang Đang làm (nhóm `active`, chưa ở Chờ kiểm chứng) — đúng ca "VỀ".
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK)
      .run();
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', {
      gui_luc: 2_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });

    const res = await guiBangChung(TOKEN.worker, {
      loai_bang_chung: 'commit',
      commit_hash: HASH,
      repo: REPO,
    });
    expect(res.status).toBe(201);
    const than = await thanJson(res);
    expect(than['can_review_lai']).toBe(true);
    expect(than['can_review_lai_ly_do']).toBe('review_het_hieu_luc');
    expect(than['ticket_trang_thai']).toBe('verifying');

    // Đi qua đúng đường luật trạng thái: trạng thái trong DB đổi thật, và có dòng
    // lịch sử cho trường `trang_thai` (mục 4), tác giả hệ thống.
    expect(await trangThaiCua(TK)).toBe('verifying');
    expect((await coTrongDb()).co_can_review_lai).toBe(1);
    const ls_tt = await env.DB.prepare(
      `SELECT gia_tri_cu, gia_tri_moi, tac_gia_loai FROM ticket_history
        WHERE ticket_id = ? AND truong = 'trang_thai'`,
    )
      .bind(TK)
      .first<{ gia_tri_cu: string; gia_tri_moi: string; tac_gia_loai: string }>();
    expect(ls_tt).toMatchObject({
      gia_tri_cu: 'in_progress',
      gia_tri_moi: 'verifying',
      tac_gia_loai: 'system',
    });
  });

  it('ĐỐI CHỨNG d.494 — không có review nào trước đó: commit mới KHÔNG bật cờ, ticket giữ Đang làm', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK)
      .run();
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });

    const res = await guiBangChung(TOKEN.worker, {
      loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO,
    });
    expect((await thanJson(res))['can_review_lai']).toBe(false);
    expect(await trangThaiCua(TK)).toBe('in_progress');
  });

  it('d.495 — ticket đã Xong: bằng chứng gửi sau vẫn LƯU, cờ KHÔNG bật, ticket không bị hạ', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'done' WHERE id = ?").bind(TK).run();
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });

    const res = await guiBangChung(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'fail' });
    expect(res.status).toBe(201);
    const than = await thanJson(res);
    expect(than['sau_khi_xong']).toBe(true);
    expect(than['can_review_lai']).toBe(false);
    expect(await trangThaiCua(TK)).toBe('done');
    expect((await coTrongDb()).co_can_review_lai).toBe(0);

    // Dòng bằng chứng **vẫn được lưu** — nửa còn lại của d.495.
    const n = await env.DB.prepare('SELECT count(*) AS n FROM evidence WHERE ticket_id = ?')
      .bind(TK)
      .first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it('d.496 — review ĐẠT của chính người làm không bật cờ; đối chứng: reviewer khác thì bật', async () => {
    // Cùng dữ liệu, chỉ đổi **người nhận lượt `work`**.
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', {
      gui_luc: 2_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });
    await dungBangChung('ev-c2', TK, 'commit', { gui_luc: 3_000, xac_minh: 'merged' });

    // (a) `ag-rv` là người nhận một lượt `work` → review của nó không được tính.
    await dungLuotGiao('lg-1', TK, ID.reviewer, { loai: 'work', trang_thai: 'accepted' });
    let res = await guiBangChung(TOKEN.worker, { loai_bang_chung: 'note', noi_dung: 'Ghi chú.' });
    expect((await thanJson(res))['can_review_lai']).toBe(false);

    // (b) ĐỐI CHỨNG: lượt `work` đó là của `ag-wk`, không của `ag-rv`.
    await env.DB.prepare('UPDATE luot_giao SET nguoi_nhan_agent_id = ? WHERE id = ?')
      .bind(ID.worker, 'lg-1')
      .run();
    res = await guiBangChung(TOKEN.worker, { loai_bang_chung: 'note', noi_dung: 'Ghi chú 2.' });
    expect((await thanJson(res))['can_review_lai']).toBe(true);
  });
});

describe('B. qua D1: rút bằng chứng (d.222)', () => {
  it('rút chính review `fail` đang giữ cờ → cờ TẮT và mốc về NULL', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', { gui_luc: 2_000, ket_luan: 'fail' });
    await datCo(true, 2_000);

    const res = await goiApi('/v1/bang-chung/ev-r1/rut', TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'Reviewer đọc nhầm nhánh.' },
    });
    expect(res.status).toBe(200);
    const than = await thanJson(res);
    expect(than['can_review_lai']).toBe(false);

    const d = await coTrongDb();
    expect(d.co_can_review_lai).toBe(0);
    expect(d.can_review_lai_luc).toBeNull();
  });

  it('ĐỐI CHỨNG — rút một bằng chứng KHÁC thì cờ vẫn BẬT', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', { gui_luc: 2_000, ket_luan: 'fail' });
    await dungBangChung('ev-n1', TK, 'note', { gui_luc: 2_500 });
    await datCo(true, 2_000);

    const res = await goiApi('/v1/bang-chung/ev-n1/rut', TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'Ghi chú sai ticket.' },
    });
    expect((await thanJson(res))['can_review_lai']).toBe(true);
    expect((await coTrongDb()).co_can_review_lai).toBe(1);
  });

  it('rút review ĐẠT đang giữ cổng → cờ BẬT (lý do hết hiệu lực), ticket Xong KHÔNG bị hạ', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK)
      .run();
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', {
      gui_luc: 2_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });
    // Một commit **đã rút** ở 3_000 vẫn tính vào mốc (`#56`), nhưng ở đây không cần:
    // rút `ev-r1` làm tập review còn hiệu lực rỗng → không có gì "lại".
    await dungBangChung('ev-c2', TK, 'commit', { gui_luc: 3_000, xac_minh: 'merged' });
    await dungBangChung('ev-r2', TK, 'review', {
      gui_luc: 4_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });

    // Trước khi rút: review ĐẠT mới nhất (4_000) ở sau commit cuối (3_000) → cờ tắt.
    let res = await goiApi('/v1/bang-chung/ev-r2/rut', TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'Review gửi nhầm ticket.' },
    });
    const than = await thanJson(res);
    // Sau khi rút: chỉ còn review ĐẠT ở 2_000, trước commit 3_000 → hết hiệu lực.
    expect(than['can_review_lai']).toBe(true);
    expect(than['can_review_lai_ly_do']).toBe('review_het_hieu_luc');
    expect(than['ticket_trang_thai']).toBe('verifying');

    // Và với ticket **đã Xong** thì đúng đường ấy không hạ gì — d.222 + d.495.
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'done' WHERE id = ?").bind(TK).run();
    await datCo(false, null);
    await dungBangChung('ev-r3', TK, 'review', {
      gui_luc: 5_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });
    res = await goiApi('/v1/bang-chung/ev-r3/rut', TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'Rút nốt.' },
    });
    expect((await thanJson(res))['ticket_trang_thai']).toBe('done');
    expect(await trangThaiCua(TK)).toBe('done');
    expect((await coTrongDb()).co_can_review_lai).toBe(0);
  });
});

/*
 * Hai ca mốc dưới đây đi qua `chayLenhVoiCong` chứ không qua HTTP — **chỉ** để
 * **tiêm mốc thời gian**, cùng nếp các ca mốc khác của dự án (`datMocPhien`,
 * `quetTheoDoiPushed`).
 *
 * Vì sao buộc phải tiêm: cửa ghi lấy `bay_gio = Date.now()` bên trong DO, và hai lệnh
 * nối nhau trong một test chạy cách nhau vài ms — có khi **cùng một** millisecond. Lúc
 * đó "mốc không nhích" xanh **vì hai con số tình cờ bằng nhau**, không vì luật; và
 * "mốc mới khác mốc cũ" đỏ **vì tình cờ bằng nhau**. Một ca xanh-giả tệ hơn không có
 * ca nào: nó nói rằng luật đã được canh.
 */
const LUC = { mot: 5_000_000, hai: 6_000_000, ba: 7_000_000 } as const;

/** Gửi một bằng chứng **ngoài cửa ghi**, với mốc thời gian tự chọn. */
function guiLuc(bay_gio: number, than: Record<string, unknown>): Promise<unknown> {
  return chayLenhVoiCong(
    { loai: 'gui_bang_chung', workspace_id: WS, ai: CHU, ticket_id: TK, ...than } as never,
    CONG_DU_GIA,
    bay_gio,
  );
}

describe('B. mốc `can_review_lai_luc` — 19.6 d.522', () => {
  it('cờ còn BẬT qua một lượt ghi nữa thì mốc KHÔNG NHÍCH (đồng hồ 24 giờ không bị đặt lại)', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });

    // Lượt ghi 1: cờ tắt → bật. Mốc được đặt, và đúng bằng mốc của lượt ghi đó.
    await guiLuc(LUC.mot, { loai_bang_chung: 'review', ket_luan: 'fail' });
    expect(await coTrongDb()).toMatchObject({
      co_can_review_lai: 1,
      can_review_lai_luc: LUC.mot,
    });

    // Lượt ghi 2, mốc **khác hẳn**: cờ còn bật (vẫn còn review `fail` còn hiệu lực).
    await guiLuc(LUC.hai, { loai_bang_chung: 'note', noi_dung: 'Thêm một ghi chú.' });
    expect(await coTrongDb()).toMatchObject({
      co_can_review_lai: 1,
      // Mốc **vẫn là `LUC.mot`** — đây là luật của d.522.
      can_review_lai_luc: LUC.mot,
    });

    /*
     * **ĐỐI CHỨNG rằng lượt ghi thứ hai THẬT SỰ chạy** — không có nó thì assert
     * "mốc không nhích" cũng xanh khi lệnh thứ hai bị từ chối hoặc không ghi gì.
     * Hai thứ chứng minh: số dòng `evidence` tăng, và dòng mới mang **đúng mốc của
     * lượt ghi thứ hai** — tức một trường **số** đã nhích tới `LUC.hai` trong khi
     * `can_review_lai_luc` thì không.
     *
     * (Không dùng `ticket.cap_nhat_luc`: lượt ghi thứ hai **không** chạm bảng `ticket`
     * — cờ không đổi nên không có câu `UPDATE ticket` nào, đúng như thiết kế. Dùng nó
     * làm đối chứng là assert một thứ sai.)
     */
    const ev = await env.DB.prepare(
      'SELECT count(*) AS n, max(gui_luc) AS moi_nhat FROM evidence WHERE ticket_id = ?',
    )
      .bind(TK)
      .first<{ n: number; moi_nhat: number }>();
    expect(ev?.n).toBe(3);
    expect(ev?.moi_nhat).toBe(LUC.hai);
  });

  it('TẮT rồi BẬT LẠI → mốc MỚI, không phải mốc cũ', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });

    // Bật lần một.
    await guiLuc(LUC.mot, { loai_bang_chung: 'review', ket_luan: 'fail' });
    expect((await coTrongDb()).can_review_lai_luc).toBe(LUC.mot);

    // Tắt: rút chính review `fail` đó.
    const ds = await env.DB.prepare(
      "SELECT id FROM evidence WHERE ticket_id = ? AND loai = 'review'",
    )
      .bind(TK)
      .first<{ id: string }>();
    await chayLenhVoiCong(
      {
        loai: 'rut_bang_chung',
        workspace_id: WS,
        ai: CHU,
        bang_chung_id: ds?.id ?? '',
        ly_do: 'Rút để bật lại.',
      } as never,
      CONG_DU_GIA,
      LUC.hai,
    );
    expect(await coTrongDb()).toMatchObject({
      co_can_review_lai: 0,
      can_review_lai_luc: null,
    });

    // Bật lần hai: mốc phải là mốc **mới**, đúng bằng mốc của lượt ghi thứ ba.
    await guiLuc(LUC.ba, { loai_bang_chung: 'review', ket_luan: 'fail' });
    expect((await coTrongDb()).can_review_lai_luc).toBe(LUC.ba);
  });

  it('lịch sử ghi ĐỦ ba lần đổi cờ: 0→1, 1→0, 0→1 (đi qua cửa ghi thật)', async () => {
    // Ca này đi qua HTTP — `chayLenhVoiCong` **không** ghi `ticket_history`, nên nó
    // không nói được gì về lịch sử. Mốc không bị assert ở đây, nên đồng hồ thật không
    // làm ca này chập chờn.
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });

    await guiBangChung(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'fail' });
    const ds = await env.DB.prepare(
      "SELECT id FROM evidence WHERE ticket_id = ? AND loai = 'review'",
    )
      .bind(TK)
      .first<{ id: string }>();
    await goiApi(`/v1/bang-chung/${ds?.id ?? ''}/rut`, TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'Rút để bật lại.' },
    });
    await guiBangChung(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'fail' });

    expect((await lichSuCo()).map((d) => `${d.gia_tri_cu ?? ''}>${d.gia_tri_moi ?? ''}`)).toEqual([
      '0>1',
      '1>0',
      '0>1',
    ]);
  });
});

describe('B. đường Cron TỰ LÊN XONG cũng tắt cờ — d.221 + d.495', () => {
  it('Cron kết luận `merged` → ticket tự lên Xong, và cờ TẮT + mốc về NULL', async () => {
    /*
     * Dựng đúng ca mà cổng **đủ** trong khi luật cờ lại muốn **bật**: dự án
     * **không bắt buộc review** (d.215), nên một commit `merged` là đủ; mà review
     * ĐẠT có sẵn lại gửi **trước** commit đó, tức "review cũ hết hiệu lực" của
     * d.494. Không có nhánh `closed` của d.495 thì cờ sẽ bật lên một ticket vừa
     * Xong và nằm đó mãi — `doc-du-an.ts` lọc "có cờ" trong SQL, không ai tính lại.
     */
    await env.DB.prepare('UPDATE project SET bat_buoc_review = 0 WHERE id = ?').bind(P).run();
    await dungBangChung('ev-r1', TK, 'review', {
      gui_luc: 1_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });
    await datCo(true, 1_000);

    const t = Date.now();
    await dungBangChung('ev-c1', TK, 'commit', {
      gui_luc: 2_000,
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: t - 1_000,
    });

    const kq = await quetThuLai(env, t);
    expect(kq.so_tu_len_xong).toBe(1);

    const d = await coTrongDb();
    expect(d.trang_thai).toBe('done');
    expect(d.co_can_review_lai).toBe(0);
    expect(d.can_review_lai_luc).toBeNull();
  });

  it('ĐỐI CHỨNG — cùng dữ liệu nhưng ticket KHÔNG lên Xong (còn ticket con) → cờ vẫn BẬT', async () => {
    await env.DB.prepare('UPDATE project SET bat_buoc_review = 0 WHERE id = ?').bind(P).run();
    // Một ticket con chưa kết → `CHILDREN_OPEN` giữ cha ở Chờ kiểm chứng (mục 4).
    await dungTicket(P, 2, 'Con chưa kết', { trang_thai: 'todo' });
    await env.DB.prepare(
      `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
       VALUES (?, ?, 'tk-pj-SAI-2', 'parent', ?)`,
    )
      .bind(WS, TK, Date.now())
      .run();

    await dungBangChung('ev-r1', TK, 'review', {
      gui_luc: 1_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });
    const t = Date.now();
    await dungBangChung('ev-c1', TK, 'commit', {
      gui_luc: 2_000,
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: t - 1_000,
    });

    const kq = await quetThuLai(env, t);
    expect(kq.so_tu_len_xong).toBe(0);

    const d = await coTrongDb();
    expect(d.trang_thai).toBe('verifying');
    expect(d.co_can_review_lai).toBe(1);
    expect(d.can_review_lai_luc).not.toBeNull();
  });
});

describe('B. `baton status` — đổi trạng thái tay cũng tính lại cờ', () => {
  it('chủ ÉP Xong (d.216) → cờ TẮT dù review vừa KHÔNG ĐẠT (d.495)', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', { gui_luc: 2_000, ket_luan: 'fail' });
    await datCo(true, 2_000);

    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Chủ chịu trách nhiệm, cho qua.' },
    });
    expect(res.status).toBe(200);

    const d = await coTrongDb();
    expect(d.trang_thai).toBe('done');
    expect(d.co_can_review_lai).toBe(0);
    expect(d.can_review_lai_luc).toBeNull();
  });

  /*
   * **#66 — RANH GIỚI của nửa "về Chờ kiểm chứng".**
   *
   * Ba ca dưới đây khoá đúng một chuyện: lượt ghi **không đổi bằng chứng** thì chỉ
   * bật/tắt cờ, **không** kéo trạng thái. Không có nó thì chủ không bao giờ đưa được
   * một ticket mang cờ về Đang làm để đi sửa mã (d.555 giả định phải làm được), và
   * `baton status` cư xử **ngược** với "Tôi làm" trên cùng một chuyển trạng thái.
   */
  it('#66 — chủ đưa ticket mang cờ về Đang làm: cờ VẪN BẬT, ticket Ở LẠI Đang làm', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', { gui_luc: 2_000, ket_luan: 'fail' });
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'todo' WHERE id = ?").bind(TK).run();

    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(res.status).toBe(200);
    expect((await thanJson(res))['trang_thai']).toBe('in_progress');

    const d = await coTrongDb();
    expect(d.trang_thai).toBe('in_progress');
    // Cờ **vẫn bật**: việc cần làm chưa xong. Nó chỉ tắt khi bằng chứng đổi.
    expect(d.co_can_review_lai).toBe(1);
    expect(d.can_review_lai_luc).not.toBeNull();
  });

  it('#66 — "Tôi làm" (19.10) cư xử GIỐNG HỆT `baton status` trên cùng chuyển trạng thái', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', { gui_luc: 2_000, ket_luan: 'fail' });
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'todo' WHERE id = ?").bind(TK).run();
    await datCo(true, 2_000);

    const res = await goiApi(`/v1/ticket/${TK}/toi-lam`, TOKEN_CHU, {
      method: 'POST',
      than: { bat: true },
    });
    expect(res.status).toBe(200);
    expect((await thanJson(res))['trang_thai']).toBe('in_progress');

    const d = await coTrongDb();
    expect(d.trang_thai).toBe('in_progress');
    expect(d.co_can_review_lai).toBe(1);
    // Và mốc **không nhích**: cờ còn bật qua lượt ghi này (d.522).
    expect(d.can_review_lai_luc).toBe(2_000);
  });

  it('ĐỐI CHỨNG #66 — đường BẰNG CHỨNG thì VẪN kéo về Chờ kiểm chứng (nửa d.494 còn nguyên)', async () => {
    /*
     * Cặp đối chứng của hai ca trên, **cùng một trạng thái đầu** `in_progress` (nhóm
     * `active`, chưa ở Chờ kiểm chứng — ca duy nhất mà `ve_cho_kiem_chung` bật được).
     * Khác đúng một thứ: lượt ghi này **thêm một bằng chứng**. Nếu ca này xanh-giả thì
     * nửa d.494 đã bị tắt mất.
     */
    await dungBangChung('ev-c1', TK, 'commit', { gui_luc: 1_000, xac_minh: 'merged' });
    await dungBangChung('ev-r1', TK, 'review', {
      gui_luc: 2_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK)
      .run();

    // (a) Lượt ghi KHÔNG đổi bằng chứng: chủ đổi tay sang chính `in_progress` → giữ.
    await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(await trangThaiCua(TK)).toBe('in_progress');

    // (b) Lượt ghi ĐỔI bằng chứng: kéo về Chờ kiểm chứng.
    const res = await guiBangChung(TOKEN.worker, {
      loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO,
    });
    const than = await thanJson(res);
    expect(than['can_review_lai']).toBe(true);
    expect(than['ticket_trang_thai']).toBe('verifying');
    expect(await trangThaiCua(TK)).toBe('verifying');
  });
});

/* ================================================================== *
 * B2. Hai đường ghi KHÔNG phải một lệnh — 19.11 d.558 và 19.4
 * ================================================================== *
 * Cả hai đưa một ticket **khác** vào nhóm `closed`, nên cả hai phải tắt cờ (d.495).
 * Không đường nào là một lệnh có tên, nên không đường nào nằm trong danh sách lệnh —
 * đó chính là vì sao chúng bị sót ở lượt trước, và vì sao lời gọi cờ nay nằm **bên
 * trong** chúng chứ không ở từng chỗ gọi.
 */

/** Dự án không bắt buộc review ⇒ một `commit merged` là đủ cổng (d.215). */
async function boBatBuocReview(): Promise<void> {
  await env.DB.prepare('UPDATE project SET bat_buoc_review = 0 WHERE id = ?').bind(P).run();
}

/**
 * Bộ bằng chứng mà **cổng nói ĐỦ** trong khi **luật cờ nói BẬT**: review ĐẠT gửi
 * **trước** commit cuối (d.494 "review cũ hết hiệu lực"), còn cổng thì không đòi review
 * nào vì dự án tắt `bat_buoc_review`. Đây là ca duy nhất tách được d.495 khỏi đường
 * "tắt cờ vì review ĐẠT còn hiệu lực".
 */
async function congDuMaCoBat(ticket_id: string): Promise<void> {
  await dungBangChung(`ev-r-${ticket_id}`, ticket_id, 'review', {
    gui_luc: 1_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
  });
  await dungBangChung(`ev-c-${ticket_id}`, ticket_id, 'commit', {
    gui_luc: 2_000, xac_minh: 'merged',
  });
}

describe('B2. con cuối cùng kết → CHA tự kiểm cổng lại (19.11) cũng tắt cờ', () => {
  const CON = 'tk-pj-SAI-9';

  beforeEach(async () => {
    await boBatBuocReview();
    await dungTicket(P, 9, 'Ticket con', { trang_thai: 'in_progress' });
    await env.DB.prepare(
      `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
       VALUES (?, ?, ?, 'parent', ?)`,
    )
      .bind(WS, TK, CON, Date.now())
      .run();
    await congDuMaCoBat(TK);
    await datCo(true, 1_500);
  });

  it('cha sang Xong ⇒ cờ TẮT và mốc về NULL (d.495)', async () => {
    // Chủ đóng ticket **con**; cha ở Chờ kiểm chứng, cổng đã đủ ⇒ cha tự sang Xong.
    const res = await goiApi(`/v1/ticket/${CON}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Chủ cho qua.' },
    });
    expect(res.status).toBe(200);

    const cha = await coTrongDb(TK);
    expect(cha.trang_thai).toBe('done');
    expect(cha.co_can_review_lai).toBe(0);
    expect(cha.can_review_lai_luc).toBeNull();
  });

  it('ĐỐI CHỨNG — cha KHÔNG lên Xong (cổng chưa đủ) thì cờ VẪN BẬT', async () => {
    // Đổi đúng một thứ: commit của cha chưa `merged` ⇒ cổng chưa đủ.
    await env.DB.prepare("UPDATE evidence SET xac_minh = 'pushed' WHERE id = ?")
      .bind(`ev-c-${TK}`)
      .run();

    const res = await goiApi(`/v1/ticket/${CON}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Chủ cho qua.' },
    });
    expect(res.status).toBe(200);

    const cha = await coTrongDb(TK);
    // Đối chứng rằng lượt ghi đã chạy thật: con đã Xong.
    expect(await trangThaiCua(CON)).toBe('done');
    expect(cha.trang_thai).toBe('verifying');
    expect(cha.co_can_review_lai).toBe(1);
    expect(cha.can_review_lai_luc).toBe(1_500);
  });
});

describe('B2. ticket ĐIỀU PHỐI tự theo (19.4) cũng tắt cờ của chính nó', () => {
  const DP = 'tk-pj-COS-1';

  beforeEach(async () => {
    await dungDuAn('COS', 'Điều phối');
    await dungTicket('pj-COS', 1, 'Ticket điều phối', { trang_thai: 'verifying' });
    await env.DB.prepare(
      `INSERT INTO ticket_link (workspace_id, tu_ticket_id, den_ticket_id, loai, tao_luc)
       VALUES (?, ?, ?, 'dieu_phoi', ?)`,
    )
      .bind(WS, DP, TK, Date.now())
      .run();

    /*
     * Ticket điều phối **có bằng chứng của riêng nó** — không luật nào cấm gửi bằng
     * chứng lên nó (19.4 chỉ nói nó **không qua cổng**). Nên nó mang cờ được, và vì
     * trạng thái của nó do 19.4 quyết chứ không do lệnh nào, cờ của nó chỉ tắt được ở
     * đúng đường lan toả.
     */
    await congDuMaCoBat(DP);
    await datCo(true, 1_500, DP);
  });

  it('ticket dự án cuối cùng sang Xong ⇒ ticket điều phối sang Xong và cờ của nó TẮT', async () => {
    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Chủ cho qua.' },
    });
    expect(res.status).toBe(200);

    const dp = await coTrongDb(DP);
    expect(dp.trang_thai).toBe('done');
    expect(dp.co_can_review_lai).toBe(0);
    expect(dp.can_review_lai_luc).toBeNull();
  });

  it('ĐỐI CHỨNG — ticket dự án sang Đang làm (điều phối KHÔNG kết) thì cờ VẪN BẬT', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'todo' WHERE id = ?").bind(TK).run();

    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(res.status).toBe(200);

    const dp = await coTrongDb(DP);
    // Đối chứng rằng lan toả đã chạy thật: điều phối đã rời Chờ kiểm chứng.
    expect(dp.trang_thai).toBe('in_progress');
    expect(dp.co_can_review_lai).toBe(1);
    expect(dp.can_review_lai_luc).toBe(1_500);
  });

  it('19.4 d.502 — gửi bằng chứng LÊN ticket điều phối: cờ bật nhưng trạng thái GIỮ NGUYÊN', async () => {
    /*
     * Đường reviewer dựng. Ticket điều phối đang Đang làm, đã có review ĐẠT; gửi một
     * `commit` mới lên **chính nó** ⇒ review hết hiệu lực (d.494) ⇒ cờ bật. Nhưng d.502
     * nói trạng thái ticket điều phối **tự theo** các ticket dự án, nên nó **không**
     * được bị kéo sang Chờ kiểm chứng — dù chỉ một lúc rồi lượt lan toả sau sửa lại.
     */
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(DP)
      .run();
    await datCo(false, null, DP);

    const res = await goiApi(`/v1/ticket/${DP}/bang-chung`, TOKEN_CHU, {
      method: 'POST',
      than: { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO },
    });
    expect(res.status).toBe(201);
    const than = await thanJson(res);
    // Cờ **có** bật: ticket điều phối gửi bằng chứng được nên nó mang cờ được.
    expect(than['can_review_lai']).toBe(true);
    // Nhưng trạng thái **giữ nguyên** — đây là luật của 19.4 d.502.
    expect(than['ticket_trang_thai']).toBe('in_progress');

    const dp = await coTrongDb(DP);
    expect(dp.trang_thai).toBe('in_progress');
    expect(dp.co_can_review_lai).toBe(1);
  });

  it('ĐỐI CHỨNG — cùng lệnh trên ticket DỰ ÁN thì VẪN bị kéo sang Chờ kiểm chứng', async () => {
    // Khác đúng một thứ: ticket nhận bằng chứng là ticket **dự án** (`TK`), không phải
    // ticket điều phối. Không có ca này thì ca trên xanh y nguyên khi nửa d.494 bị tắt.
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK)
      .run();
    await dungBangChung('ev-r-tk', TK, 'review', {
      gui_luc: 1_000, ket_luan: 'pass', nguoi_gui_agent_id: ID.reviewer,
    });

    const res = await goiApi(`/v1/ticket/${TK}/bang-chung`, TOKEN_CHU, {
      method: 'POST',
      than: { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO },
    });
    expect(res.status).toBe(201);
    const than = await thanJson(res);
    expect(than['can_review_lai']).toBe(true);
    expect(than['ticket_trang_thai']).toBe('verifying');
  });

  it('xoá mềm ticket dự án cuối cùng: điều phối GIỮ trạng thái ⇒ cờ cũng giữ (19.12 câu 17)', async () => {
    const res = await goiApi(`/v1/ticket/${TK}/xoa`, TOKEN_CHU, { method: 'POST' });
    expect(res.status).toBe(200);

    const dp = await coTrongDb(DP);
    expect(dp.trang_thai).toBe('verifying');
    expect(dp.co_can_review_lai).toBe(1);
  });
});

/* ================================================================== *
 * C. Trigger 0011 — luật của DB phải được canh bằng một lần ABORT thật
 * ================================================================== */

describe('C. trigger 0011: cờ và mốc phải cùng có hoặc cùng không', () => {
  it('cờ BẬT mà mốc NULL → bị ABORT', async () => {
    await expect(
      env.DB.prepare(
        'UPDATE ticket SET co_can_review_lai = 1, can_review_lai_luc = NULL WHERE id = ?',
      )
        .bind(TK)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it('cờ TẮT mà có mốc → bị ABORT', async () => {
    await expect(
      env.DB.prepare(
        'UPDATE ticket SET co_can_review_lai = 0, can_review_lai_luc = 123 WHERE id = ?',
      )
        .bind(TK)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it('ĐỐI CHỨNG — hai cặp hợp lệ đi qua được', async () => {
    await datCo(true, 123);
    expect((await coTrongDb()).can_review_lai_luc).toBe(123);
    await datCo(false, null);
    expect((await coTrongDb()).co_can_review_lai).toBe(0);
  });

  it('INSERT cờ bật mà không mốc → bị ABORT (trigger `…_them`)', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO ticket
           (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
            chiu_trach_nhiem_loai, nguoi_tao_loai, tao_luc, cap_nhat_luc, co_can_review_lai)
         VALUES ('tk-xau', 'ws-test', ?, 99, 'Xấu', 'todo', 'none', 4, 'owner', 'owner', 1, 1, 1)`,
      )
        .bind(P)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
});
