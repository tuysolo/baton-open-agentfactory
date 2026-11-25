/**
 * **Phiên tự đóng khi VIỆC ĐÃ XONG** — SPEC mục 6 d.181 (BAT-6 đợt 3 phần B,
 * việc 9).
 *
 * d.181, nguyên văn: "phiên đóng ngay khi **lượt giao của nó nộp báo cáo**, và khi
 * **ticket của lượt đó sang Chờ kiểm chứng hoặc Xong** — kể cả khi phiên đang
 * `stalled` hoặc `error`. Lý do đóng ghi vào lịch sử phiên (*việc đã xong*). Hệ
 * quả bắt buộc: một việc đã xong **không bao giờ** còn hiện ở *Cần chú ý* dưới
 * dạng phiên đứng, và agent không còn *cầm* nó."
 *
 * Nửa thứ nhất (nộp báo cáo) đã có từ phần 2 và có ca riêng ở `phien.test.ts`
 * ("đóng khi NỘP"). File này canh **nửa thứ hai**, cộng **hai hệ quả** mà d.181
 * gọi là bắt buộc, cộng ca đối chứng.
 *
 * ## Vì sao mỗi ca có một ca đối chứng
 *
 * "Phiên của việc đã xong không hiện ở Cần chú ý" xanh kể cả khi cả khối Cần chú ý
 * bị gỡ. Nên mỗi ca dương đi kèm một ca âm **cùng fixture, cùng mốc thời gian**:
 * một ticket `in_progress` với một phiên im **cùng một khoảng** phải **vẫn** hiện
 * phiên đứng, và agent của nó phải **vẫn** `busy`.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { LY_DO_DONG_VIEC_XONG, TRANG_THAI_TICKET_DONG_PHIEN } from '@baton/shared';
import { phienMoTrongWorkspace, phienCanCanhBao } from '../src/doc-phien.js';
import { tongQuan } from '../src/doc-tong-quan.js';
import { CHU, TOKEN_CHU, WS } from './giup.js';
import {
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
  phienTrongDb,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const AG_WK = 'ag-wk';
const PHUT = 60_000;
/** Mốc cố định: mọi ca đo trên cùng một đồng hồ, không `Date.now()` rải rác. */
const GIO = 1_760_000_000_000;
/** Im lặng quá ngưỡng 30 phút ⇒ phiên **đứng** (mục 6 d.189). */
const IM_LAU = GIO - 90 * PHUT;

beforeEach(async () => {
  await dungWorkspace();
  await dungAgentCoToken({ id: AG_WK, ten: 'W-builder', vai_tro: 'worker', token: 'bt_vx_wk' });
  await dungDuAn('SAI', 'Sample', 'active', null);
  await choVaoDuAn(AG_WK, P);
});

/**
 * Một ticket + một lượt giao `in_progress` + một phiên **đang đứng** trên đó —
 * đúng trạng thái xấu mà chủ thấy trên bản live 14/10.
 */
async function viecCoPhienDung(
  so: number,
  trang_thai: string,
  trang_thai_phien: 'stalled' | 'error' | 'running' = 'running',
): Promise<{ ticket_id: string; phien_id: string }> {
  const ticket_id = await dungTicket(P, so, `Việc ${String(so)}`, { trang_thai });
  const luot_id = `lg-${String(so)}`;
  await dungLuotGiao(luot_id, ticket_id, AG_WK, { trang_thai: 'in_progress', nhan_luc: IM_LAU });
  const phien_id = `ph-${String(so)}`;
  await dungPhien(phien_id, luot_id, {
    trang_thai: trang_thai_phien,
    tin_hieu_cuoi_luc: IM_LAU,
    mo_luc: IM_LAU,
  });
  return { ticket_id, phien_id };
}

describe('d.181 — ticket sang Chờ kiểm chứng / Xong thì phiên ĐÓNG', () => {
  it('bảng hai trạng thái của d.181 là ĐÚNG hai mã của bảng 0.1', () => {
    // Lưới của chính các ca dưới: một mảng rỗng (hay một mã lạ) làm chúng vô nghĩa.
    expect([...TRANG_THAI_TICKET_DONG_PHIEN]).toEqual(['verifying', 'done']);
    expect(LY_DO_DONG_VIEC_XONG).toBe('việc đã xong');
  });

  it('chủ đưa ticket sang **Chờ kiểm chứng** ⇒ phiên `stalled` thành `closed`, lý do "việc đã xong"', async () => {
    const { ticket_id, phien_id } = await viecCoPhienDung(1, 'in_progress', 'stalled');

    const res = await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'verifying' },
    });
    expect(res.status).toBe(200);

    const d = await phienTrongDb(phien_id);
    expect(d?.trang_thai).toBe('closed');
    expect(d?.ly_do_dong).toBe(LY_DO_DONG_VIEC_XONG);
    expect(d?.dong_luc).not.toBeNull();
  });

  it('chủ ép **Xong** ⇒ phiên `error` cũng đóng (d.181 nói "kể cả khi … `error`")', async () => {
    const { ticket_id, phien_id } = await viecCoPhienDung(2, 'in_progress', 'error');

    const res = await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Đã live, bằng chứng gửi sau' },
    });
    expect(res.status).toBe(200);

    const d = await phienTrongDb(phien_id);
    expect(d?.trang_thai).toBe('closed');
    expect(d?.ly_do_dong).toBe(LY_DO_DONG_VIEC_XONG);
  });

  it('CA ĐỐI CHỨNG: sang **Đang làm** thì phiên KHÔNG bị đóng', async () => {
    const { ticket_id, phien_id } = await viecCoPhienDung(3, 'todo', 'stalled');

    const res = await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    });
    expect(res.status).toBe(200);

    const d = await phienTrongDb(phien_id);
    expect(d?.trang_thai).not.toBe('closed');
    expect(d?.ly_do_dong).toBeNull();
  });
});

describe('d.181 — chỉ đóng khi ticket SANG verifying/done; giữ phiên lượt review', () => {
  const AG_RV = 'ag-rv';

  async function dungPhienReview(so: number, trang_thai_ticket: string) {
    await dungAgentCoToken({ id: AG_RV, ten: 'R-reviewer', vai_tro: 'reviewer', token: 'bt_vx_rv' });
    await choVaoDuAn(AG_RV, P);
    const work = await viecCoPhienDung(so, trang_thai_ticket, 'running');
    await dungLuotGiao(`lr-${String(so)}`, work.ticket_id, AG_RV, {
      loai: 'review',
      trang_thai: 'in_progress',
      nhan_luc: IM_LAU,
    });
    await dungPhien(`pr-${String(so)}`, `lr-${String(so)}`, {
      trang_thai: 'running',
      tin_hieu_cuoi_luc: IM_LAU,
      mo_luc: IM_LAU,
    });
    return { ...work, review_id: `pr-${String(so)}` };
  }

  it('ticket ĐÃ ở verifying, sự kiện giữ nguyên verifying ⇒ phiên review VẪN mở', async () => {
    const { ticket_id, review_id } = await dungPhienReview(20, 'verifying');
    const res = await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'verifying' },
    });
    expect(res.status).toBe(200);
    expect((await phienTrongDb(review_id))?.trang_thai).not.toBe('closed');
    expect((await phienTrongDb('ph-20'))?.trang_thai).not.toBe('closed');
  });

  it('in_progress → verifying: phiên work đóng, phiên review còn mở', async () => {
    const { ticket_id, phien_id, review_id } = await dungPhienReview(21, 'in_progress');
    const res = await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'verifying' },
    });
    expect(res.status).toBe(200);
    expect((await phienTrongDb(phien_id))?.trang_thai).toBe('closed');
    expect((await phienTrongDb(review_id))?.trang_thai).not.toBe('closed');
  });

  it('sang done ⇒ mọi phiên đóng, kể cả phiên review', async () => {
    const { ticket_id, phien_id, review_id } = await dungPhienReview(22, 'in_progress');
    const res = await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Đã live' },
    });
    expect(res.status).toBe(200);
    expect((await phienTrongDb(phien_id))?.trang_thai).toBe('closed');
    expect((await phienTrongDb(review_id))?.trang_thai).toBe('closed');
  });
});

describe('d.181 — hai hệ quả bắt buộc', () => {
  /**
   * Đi **đường ghi thật** (chủ kéo thẻ sang Xong), không dựng sẵn một trạng thái
   * xấu trong DB: d.181 là một luật của đường ghi, và dữ liệu cũ đã có thì
   * migration 0024 dọn. Đường đọc **cố ý không lọc** theo trạng thái ticket —
   * xem khối ghi chú của `phienMoTrongWorkspace` (lượt `review` sống trên một
   * ticket `verifying`).
   */
  it('trước khi việc xong: phiên ĐỨNG có mặt (lưới của chính ca dưới)', async () => {
    await viecCoPhienDung(4, 'in_progress', 'running');
    const mo = await phienMoTrongWorkspace(env.DB, WS, GIO);
    expect(mo.length).toBe(1);
    expect(mo[0]?.trang_thai).toBe('stalled');
  });

  it('chủ kéo sang Xong ⇒ KHÔNG còn phiên mở nào', async () => {
    const { ticket_id } = await viecCoPhienDung(5, 'in_progress', 'running');
    await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Đã live' },
    });
    expect(await phienMoTrongWorkspace(env.DB, WS, GIO)).toEqual([]);
  });

  /**
   * **Vế "agent không còn cầm nó" — đọc theo `spec-questions.md` #141.**
   *
   * d.181 nói "agent không còn *cầm* nó", nhưng "người đang cầm" là dẫn xuất **5
   * bậc của 19.1** tính từ **lượt giao mở**, không từ phiên — và d.181 không nói
   * đóng lượt giao. Đề xuất tạm đã chọn (và đang cài): câu ấy được hiểu ở **tầng
   * phiên**, tức agent không còn `busy` vì việc đó (mục 3 d.98: trạng thái agent
   * suy ra từ phiên). Dẫn xuất 19.1 **không đổi**, vì đổi nó là viết lại mục 4 và
   * 19.1 ở một dòng của mục 6.
   */
  it('việc đã Xong KHÔNG hiện ở "Cần chú ý", và agent KHÔNG còn `busy` vì nó', async () => {
    const { ticket_id } = await viecCoPhienDung(6, 'in_progress', 'running');

    // Lưới: **trước** khi việc xong, cả hai vế đều ngược lại.
    const truoc = await tongQuan(env.DB, CHU, WS, GIO);
    expect(truoc.can_chu_y.flatMap((n) => n.ly_do.map((l) => l.loai))).toContain(
      'phien_dung_hoac_loi',
    );
    // d.319 chỉ kể agent **đang làm**, nên "còn cầm" = còn có mặt trong khối này.
    expect(truoc.agent.map((a) => a.id)).toContain(AG_WK);

    await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Đã live' },
    });

    const sau = await tongQuan(env.DB, CHU, WS, GIO);
    expect(sau.can_chu_y.flatMap((n) => n.ly_do.map((l) => l.loai))).not.toContain(
      'phien_dung_hoac_loi',
    );
    expect(sau.agent.map((a) => a.id)).not.toContain(AG_WK);
    expect(sau.agent_ranh_so).toBe(1);
  });
});

describe('d.196 — cron cảnh báo KHÔNG bắn cho phiên đã đóng', () => {
  it('phiên vừa đóng vì "việc đã xong" không còn trong danh sách cần cảnh báo', async () => {
    const { ticket_id, phien_id } = await viecCoPhienDung(8, 'in_progress', 'stalled');

    // Trước khi việc xong: phiên đứng này **có** trong danh sách — lưới của ca.
    const truoc = await phienCanCanhBao(env.DB, WS, GIO);
    expect(truoc.map((p) => p.phien_id)).toContain(phien_id);

    await goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'verifying' },
    });

    const sau = await phienCanCanhBao(env.DB, WS, GIO);
    expect(sau.map((p) => p.phien_id)).not.toContain(phien_id);
  });
});
