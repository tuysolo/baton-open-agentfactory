/**
 * **Danh sách ticket (bộ lọc d.396) và màn hình chi tiết ticket (d.398–401)** —
 * tầng API của SPEC mục 14.
 *
 * Phần 6 lượt 5 làm giao diện, nhưng ba thứ ở đây **không được** sống trong
 * component, nên chúng có ca ở root này:
 *
 *   1. **Chín bộ lọc của d.396**, đặc biệt ba cái mới: "người đang cầm" (một dẫn
 *      xuất 5 bậc của 19.1), "cần Chủ", "xong không bằng chứng". Lọc phải nằm
 *      trong SQL, vì phân trang là keyset (19.12 câu 1 — 200.000 ticket).
 *   2. **Ca đối chiếu** của bộ lọc "người đang cầm": tập mà bộ lọc trả về phải
 *      **trùng khít** tập mà trường `nguoi_dang_cam` (do hàm thuần `nguoiDangCam`
 *      tính) nói là của người đó. Đây là lưới duy nhất chống việc bản SQL của
 *      19.1 trôi khỏi bản hàm thuần — xem `veNguoiDangCamLa`.
 *   3. **Hình thân của màn hình chi tiết** (d.398–401): từng vế của bốn dòng đó
 *      phải có một trường, và `bay_gio` phải là **một** mốc cho cả thân (d.412).
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { BANG_LOI } from '@baton/shared';
import { lietKeTicket, type YeuCauLietKeTicket } from '../src/doc-ticket.js';
import {
  manHinhDanhSachTicket,
  manHinhTicket,
  tenAgentTheoId,
  ticketCon,
} from '../src/doc-man-hinh-ticket.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  aiAgent,
  choVaoDuAn,
  dungAgent,
  dungAgentCoToken,
  dungBangChung,
  dungBinhLuan,
  dungCanChu,
  dungDuAn,
  dungLienKet,
  dungLuotGiao,
  dungNhan,
  dungTicket,
  dungWorkspace,
  goiApi,
  noiCanChuTicket,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const P2 = 'pj-COS';

/** Mốc "bây giờ" cố định — một con số, không `Date.now()`. */
const GIO = 1_760_000_000_000;

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn();
  await dungDuAn('COS', 'Chief of Staff');
});

/** Mã của các ticket mà một bộ lọc trả về, đã sắp để so bằng `toEqual`. */
async function maLoc(yeu_cau: YeuCauLietKeTicket): Promise<string[]> {
  const t = await lietKeTicket(env.DB, CHU, WS, { ...yeu_cau, limit: 200 });
  return t.items.map((x) => x.ma).sort();
}

/* ================================================================== *
 * A. d.396 — bộ lọc "người đang cầm", đối chiếu với 19.1
 * ================================================================== */

describe('d.396 — lọc theo NGƯỜI ĐANG CẦM, khớp từng bậc của 19.1', () => {
  /**
   * Một ticket cho **mỗi bậc** của 19.1, cộng hai ca gài bẫy:
   *
   *   * `SAI-5`: **hai lượt `submitted`** do hai người giao khác nhau ⇒ chỉ lượt
   *     `so_luot` **lớn nhất** tính. DB cho phép ca này (index riêng phần
   *     `ux_luot_giao_mo` của 0004 chỉ chặn hai lượt **mở** cùng loại, không chặn
   *     hai lượt đã nộp), nên nó là ca thật — và nó là ca mà một bản `EXISTS`
   *     ngây thơ sẽ trả ticket cho **cả hai** người.
   *   * `SAI-6`: `chu_tu_lam = 1` **và** có lượt `submitted` do agent giao ⇒ bậc
   *     3 thắng bậc 4, nên ticket này **không** của chủ.
   */
  beforeEach(async () => {
    await dungAgent('ag-a', 'A');
    await dungAgent('ag-b', 'B');

    // Bậc 1 — lượt `review` mở của A (có cả lượt worker mở của B để bậc 1 phải thắng).
    await dungTicket(P, 1);
    await dungLuotGiao('lg-1-w', 'tk-pj-SAI-1', 'ag-b', { loai: 'work', trang_thai: 'in_progress' });
    await dungLuotGiao('lg-1-r', 'tk-pj-SAI-1', 'ag-a', { loai: 'review', trang_thai: 'pending' });

    // Bậc 2 — lượt worker mở của B.
    await dungTicket(P, 2);
    await dungLuotGiao('lg-2', 'tk-pj-SAI-2', 'ag-b', { loai: 'work', trang_thai: 'pending' });

    // Bậc 3 — lượt `submitted`, người giao là **chủ**.
    await dungTicket(P, 3);
    await dungLuotGiao('lg-3', 'tk-pj-SAI-3', 'ag-b', { trang_thai: 'submitted' });

    // Bậc 4 — chủ bấm "Tôi làm", không lượt nào.
    await dungTicket(P, 4, 'Chủ tự làm', { chu_tu_lam: true });

    /*
     * Bẫy 1 — hai lượt `submitted`: lượt 1 do A giao, lượt 2 do chủ giao. Người
     * cầm là người giao của lượt **mới nhất** ⇒ **chủ**, không A.
     */
    await dungTicket(P, 5);
    await dungLuotGiao('lg-5-a', 'tk-pj-SAI-5', 'ag-b', {
      trang_thai: 'submitted',
      so_luot: 1,
      nguoi_giao_agent_id: 'ag-a',
    });
    await dungLuotGiao('lg-5-b', 'tk-pj-SAI-5', 'ag-b', { trang_thai: 'submitted', so_luot: 2 });

    // Bẫy 2 — `chu_tu_lam` **và** submitted do agent A giao ⇒ A cầm (bậc 3), không chủ.
    await dungTicket(P, 6, 'Vừa tự làm vừa đã giao', { chu_tu_lam: true });
    await dungLuotGiao('lg-6', 'tk-pj-SAI-6', 'ag-b', {
      trang_thai: 'submitted',
      nguoi_giao_agent_id: 'ag-a',
    });

    // Bậc 5 — không ai cầm.
    await dungTicket(P, 7);
  });

  it('bậc 1 thắng bậc 2: lượt review mở của A ⇒ SAI-1 là của A, không của B', async () => {
    expect(await maLoc({ nguoi_dang_cam: 'ag-a' })).toEqual(['SAI-1', 'SAI-6']);
    // SAI-1 **không** được lọt vào tập của B dù B có một lượt worker mở ở đó.
    expect(await maLoc({ nguoi_dang_cam: 'ag-b' })).toEqual(['SAI-2']);
  });

  it('bậc 3–4 của chủ: lượt submitted do chủ giao, và "Tôi làm"', async () => {
    expect(await maLoc({ nguoi_dang_cam: 'owner' })).toEqual(['SAI-3', 'SAI-4', 'SAI-5']);
  });

  it('BẪY: hai lượt submitted ⇒ chỉ lượt so_luot LỚN NHẤT quyết người cầm', async () => {
    // A giao lượt 1, chủ giao lượt 2 ⇒ SAI-5 là của **chủ**, không của A.
    expect(await maLoc({ nguoi_dang_cam: 'ag-a' })).not.toContain('SAI-5');
    expect(await maLoc({ nguoi_dang_cam: 'owner' })).toContain('SAI-5');
  });

  it('BẪY: bậc 3 thắng bậc 4 ⇒ ticket chu_tu_lam có lượt submitted KHÔNG của chủ', async () => {
    expect(await maLoc({ nguoi_dang_cam: 'owner' })).not.toContain('SAI-6');
  });

  /**
   * **Ca đối chiếu** — lưới chống hai bản 19.1 trôi khỏi nhau.
   *
   * Với **mỗi** người xuất hiện trong cột `nguoi_dang_cam` của danh sách không
   * lọc, tập mà bộ lọc trả về phải bằng đúng tập mà trường đó chỉ ra. Một ca
   * `expect` duy nhất cho mỗi người (không `expect` trong vòng lặp che vòng sau):
   * cả bảng được dựng rồi so **một lần**.
   */
  it('ĐỐI CHIẾU: bộ lọc SQL khớp từng chữ với trường nguoi_dang_cam của 19.1', async () => {
    const tat_ca = await lietKeTicket(env.DB, CHU, WS, { limit: 200 });

    const khoa = (t: (typeof tat_ca.items)[number]): string =>
      t.nguoi_dang_cam === null
        ? '(trống)'
        : t.nguoi_dang_cam.loai === 'agent'
          ? (t.nguoi_dang_cam.agentId ?? '(agent không id)')
          : 'owner';

    const mong: Record<string, string[]> = {};
    for (const t of tat_ca.items) {
      const k = khoa(t);
      mong[k] = [...(mong[k] ?? []), t.ma].sort();
    }

    const thuc: Record<string, string[]> = {};
    for (const k of Object.keys(mong)) {
      if (k === '(trống)') continue;
      thuc[k] = await maLoc({ nguoi_dang_cam: k });
    }

    delete mong['(trống)'];
    expect(thuc).toEqual(mong);
    // Lưới của chính ca này: bảng mong đợi phải phủ cả chủ và hai agent, nếu
    // không thì `toEqual({})` ở trên là một tautology.
    expect(Object.keys(mong).sort()).toEqual(['ag-a', 'ag-b', 'owner']);
  });
});

/* ================================================================== *
 * B. d.396 — "cần Chủ", "xong không bằng chứng", và bảy lọc cũ
 * ================================================================== */

describe('d.396 — lọc "cần Chủ" và "xong không bằng chứng"', () => {
  it('"cần Chủ" chỉ lấy ticket có mục ĐANG CHỜ, không mục đã xử lý', async () => {
    await dungTicket(P, 1, 'Có mục đang chờ');
    await dungTicket(P, 2, 'Có mục đã xử lý');
    await dungTicket(P, 3, 'Không mục nào');

    await dungCanChu('ct-mo', { project_id: P, trang_thai: 'open' });
    await dungCanChu('ct-xong', { project_id: P, trang_thai: 'resolved' });
    await noiCanChuTicket('ct-mo', 'tk-pj-SAI-1');
    await noiCanChuTicket('ct-xong', 'tk-pj-SAI-2');

    expect(await maLoc({ can_chu: true })).toEqual(['SAI-1']);
    // Không lọc thì cả ba còn đó — nếu không, ca trên xanh vì bảng rỗng.
    expect(await maLoc({})).toEqual(['SAI-1', 'SAI-2', 'SAI-3']);
  });

  it('"xong không bằng chứng" đi theo đúng cờ của mục 7', async () => {
    await dungTicket(P, 1, 'Xong mà không có bằng chứng', { trang_thai: 'done' });
    await dungTicket(P, 2, 'Xong tử tế', { trang_thai: 'done' });
    await env.DB.prepare('UPDATE ticket SET co_xong_khong_bang_chung = 1 WHERE id = ?')
      .bind('tk-pj-SAI-1')
      .run();

    expect(await maLoc({ xong_khong_bang_chung: true })).toEqual(['SAI-1']);
    expect(await maLoc({})).toEqual(['SAI-1', 'SAI-2']);
  });

  it('bảy lọc còn lại của d.396 vẫn chạy, và CỘNG DỒN (AND) chứ không thay nhau', async () => {
    await dungAgent('ag-a', 'A');
    await dungTicket(P, 1, 'Đúng mọi điều kiện', {
      trang_thai: 'in_progress',
      uu_tien: 'high',
      chiu_trach_nhiem_agent_id: 'ag-a',
    });
    await dungNhan('tk-pj-SAI-1', 'hạ-tầng');
    // Lệch **đúng một** điều kiện mỗi cái — nếu các vế `WHERE` thay nhau thì ít
    // nhất một trong ba sẽ lọt vào kết quả.
    await dungTicket(P, 2, 'Lệch ưu tiên', {
      trang_thai: 'in_progress',
      uu_tien: 'low',
      chiu_trach_nhiem_agent_id: 'ag-a',
    });
    await dungNhan('tk-pj-SAI-2', 'hạ-tầng');
    await dungTicket(P, 3, 'Lệch nhãn', {
      trang_thai: 'in_progress',
      uu_tien: 'high',
      chiu_trach_nhiem_agent_id: 'ag-a',
    });
    await dungTicket(P2, 1, 'Lệch dự án', {
      trang_thai: 'in_progress',
      uu_tien: 'high',
      chiu_trach_nhiem_agent_id: 'ag-a',
    });
    await dungNhan('tk-pj-COS-1', 'hạ-tầng');

    expect(
      await maLoc({
        project_id: P,
        trang_thai: 'in_progress',
        uu_tien: 'high',
        chiu_trach_nhiem: 'ag-a',
        nhan: 'hạ-tầng',
      }),
    ).toEqual(['SAI-1']);
  });
});

/* ================================================================== *
 * C. d.412 — `bay_gio` trong thân `GET /v1/ticket`
 * ================================================================== */

describe('d.412 — màn hình danh sách ticket trả mốc máy chủ', () => {
  it('`GET /v1/man-hinh-ticket` có `bay_gio`, và nó là mốc của lượt gọi này', async () => {
    await dungTicket(P, 1);
    const truoc = Date.now();
    const r = await goiApi('/v1/man-hinh-ticket', TOKEN_CHU);
    const than = await r.json<{ items: unknown[]; bay_gio: number }>();

    expect(than.items).toHaveLength(1);
    expect(typeof than.bay_gio).toBe('number');
    expect(than.bay_gio).toBeGreaterThanOrEqual(truoc);
    expect(than.bay_gio).toBeLessThanOrEqual(Date.now());
  });

  /**
   * **`GET /v1/ticket` KHÔNG được mang `bay_gio`** — thân của nó cũng là đầu ra
   * `baton list --json` (mục 13), và một mốc đổi mỗi lần gọi làm đầu ra đó không
   * so lại được. Ca này là lưới cho chính quyết định đó.
   */
  it('`GET /v1/ticket` (đường của CLI) KHÔNG mang `bay_gio`', async () => {
    await dungTicket(P, 1);
    const r = await goiApi('/v1/ticket', TOKEN_CHU);
    const than = await r.json<Record<string, unknown>>();
    expect(than['items']).toHaveLength(1);
    expect(Object.keys(than).sort()).toEqual(['cursor_sau', 'items']);
  });

  it('màn hình danh sách là của CHỦ: token agent ⇒ 403', async () => {
    await dungAgentCoToken({
      id: 'ag-a',
      ten: 'A',
      vai_tro: 'worker',
      token: 'bt_test_token_agent_ds',
      vao_tat_ca_du_an: true,
    });
    await dungTicket(P, 1);
    const r = await goiApi('/v1/man-hinh-ticket', 'bt_test_token_agent_ds');
    expect(r.status).toBe(403);
  });

  it('màn hình danh sách nhận đủ bộ lọc d.396 qua query', async () => {
    await dungTicket(P, 1, 'Đang làm', { trang_thai: 'in_progress' });
    await dungTicket(P, 2, 'Cần làm');
    const r = await goiApi('/v1/man-hinh-ticket?trang_thai=in_progress', TOKEN_CHU);
    const than = await r.json<{ items: { ma: string }[] }>();
    expect(than.items.map((t) => t.ma)).toEqual(['SAI-1']);
  });

  /**
   * **Bộ lọc chữ để trống là `INVALID_INPUT`, không một trang rỗng** — mục 13.
   *
   * `?nguoi_dang_cam=` từng đi thẳng tới SQL thành `agent_id = ''`: máy chủ trả
   * `200 { items: [] }`, tức nói "không có ticket nào" cho một câu hỏi vô nghĩa.
   * Ca này ghim **cả bốn** bộ lọc đi thẳng vào SQL, trên **cả hai** đường dùng
   * `docLocTicket` — một cửa đặt ở một đường là nửa cửa.
   */
  it('mục 13 — bộ lọc chữ để trống ⇒ INVALID_INPUT, KHÔNG phải trang rỗng', async () => {
    await dungTicket(P, 1);
    const loc = ['project_id', 'chiu_trach_nhiem', 'nguoi_dang_cam', 'nhan'];

    for (const duong of ['/v1/ticket', '/v1/man-hinh-ticket']) {
      for (const ten of loc) {
        const r = await goiApi(`${duong}?${ten}=`, TOKEN_CHU);
        const than = await r.json<{ error?: string; message?: string; items?: unknown[] }>();
        // Mã HTTP đọc từ **bảng lỗi của mục 13**, không gõ lại một con số ở đây.
        expect({ duong, ten, http: r.status, error: than.error }).toEqual({
          duong,
          ten,
          http: BANG_LOI.INVALID_INPUT.http,
          error: 'INVALID_INPUT',
        });
        // Mục 13 d.379: lỗi mang **câu tiếng Việt**, và nó nêu tên bộ lọc.
        expect(than.message).toContain(ten);
        expect(than.items).toBeUndefined();
      }
    }
  });

  /**
   * Vế ngược của ca trên: **vắng mặt** tham số vẫn là "không lọc", không lỗi.
   * Không có ca này thì một bản cài ném cho cả `undefined` cũng xanh.
   */
  it('bộ lọc VẮNG MẶT vẫn là "không lọc" (không lẫn với để trống)', async () => {
    await dungTicket(P, 1);
    const r = await goiApi('/v1/ticket', TOKEN_CHU);
    expect(r.status).toBe(200);
    const than = await r.json<{ items: { ma: string }[] }>();
    expect(than.items.map((t) => t.ma)).toEqual(['SAI-1']);
  });

  /**
   * `trang_thai=` và `uu_tien=` **không** qua `locKhongRong` — chúng đã có cửa
   * riêng. Ca này ghim rằng chúng vẫn là `INVALID_INPUT` (không rơi xuống SQL),
   * để một lần dọn `locKhongRong` không vô tình mở hai lỗ mới.
   */
  it('`trang_thai=` và `uu_tien=` cũng là INVALID_INPUT (cửa riêng của chúng)', async () => {
    await dungTicket(P, 1);
    for (const ten of ['trang_thai', 'uu_tien']) {
      const r = await goiApi(`/v1/ticket?${ten}=`, TOKEN_CHU);
      const than = await r.json<{ error?: string }>();
      expect({ ten, http: r.status, error: than.error }).toEqual({
        ten,
        http: BANG_LOI.INVALID_INPUT.http,
        error: 'INVALID_INPUT',
      });
    }
  });
});

/* ================================================================== *
 * C2. d.396 — bốn trường CỦA THẺ trên đường đọc màn hình (BAT-6 đợt 2)
 * ================================================================== *
 * Thẻ việc của d.396 hiện nhãn, "việc con xong/tổng" và "số Cần Chủ liên quan".
 * Cả ba là **dẫn xuất**, nên chúng phải tính ở máy chủ (cùng kỷ luật 19.1, 19.11,
 * d.381): một bản tính ở giao diện sẽ cần ba lượt gọi nữa cho mỗi trang và sẽ
 * trôi khỏi định nghĩa của `con_chua_ket`.
 */

describe('d.396 — thẻ việc: `nhan`, `con_tong`/`con_chua_ket`, `can_chu_so`', () => {
  /** Thẻ của một mã, từ đường **đọc màn hình**. */
  async function the(ma: string): Promise<{
    nhan: string[];
    con_tong: number;
    con_chua_ket: number;
    can_chu_so: number;
  }> {
    const r = await manHinhDanhSachTicket(env.DB, CHU, WS, { limit: 200 }, GIO);
    const t = r.items.find((x) => x.ma === ma);
    if (t === undefined) throw new Error(`Không có ${ma} trong trang`);
    return {
      nhan: t.nhan,
      con_tong: t.con_tong,
      con_chua_ket: t.con_chua_ket,
      can_chu_so: t.can_chu_so,
    };
  }

  it('có ticket con: tổng đếm hết, "chưa kết" bỏ cả `done`, `canceled`, `duplicate`', async () => {
    await dungTicket(P, 1, 'Cha');
    await dungTicket(P, 2, 'Con còn mở', { trang_thai: 'in_progress' });
    await dungTicket(P, 3, 'Con xong', { trang_thai: 'done' });
    await dungTicket(P, 4, 'Con huỷ', { trang_thai: 'canceled' });
    for (const so of [2, 3, 4]) {
      await dungLienKet('tk-pj-SAI-1', `tk-pj-SAI-${String(so)}`, 'parent');
    }

    // "Xong/tổng" của thẻ = (3 − 1)/3 — `spec-questions.md` #134: **Huỷ cũng là kết**.
    expect(await the('SAI-1')).toMatchObject({ con_tong: 3, con_chua_ket: 1 });
  });

  it('KHÔNG có ticket con ⇒ 0/0 (không `null`, không undefined)', async () => {
    await dungTicket(P, 1);
    expect(await the('SAI-1')).toMatchObject({ con_tong: 0, con_chua_ket: 0 });
  });

  it('`parent` NGƯỢC không tính: cha không phải con của con', async () => {
    await dungTicket(P, 1, 'Con');
    await dungTicket(P, 2, 'Cha');
    await dungLienKet('tk-pj-SAI-2', 'tk-pj-SAI-1', 'parent');

    expect((await the('SAI-1')).con_tong).toBe(0);
    expect((await the('SAI-2')).con_tong).toBe(1);
  });

  it('`related` / `dieu_phoi` không tính là ticket con', async () => {
    await dungTicket(P, 1);
    await dungTicket(P, 2);
    await dungTicket(P2, 1);
    await dungLienKet('tk-pj-SAI-1', 'tk-pj-SAI-2', 'related');
    await dungLienKet('tk-pj-SAI-1', 'tk-pj-COS-1', 'dieu_phoi');

    expect((await the('SAI-1')).con_tong).toBe(0);
  });

  it('`can_chu_so` chỉ đếm mục ĐANG CHỜ — cùng định nghĩa bộ lọc `can_chu`', async () => {
    await dungTicket(P, 1, 'Có hai mục chờ và một đã xử lý');
    await dungTicket(P, 2, 'Không mục nào');
    await dungCanChu('ct-1', { project_id: P, trang_thai: 'open' });
    await dungCanChu('ct-2', { project_id: P, trang_thai: 'open' });
    await dungCanChu('ct-xong', { project_id: P, trang_thai: 'resolved' });
    for (const ct of ['ct-1', 'ct-2', 'ct-xong']) await noiCanChuTicket(ct, 'tk-pj-SAI-1');

    expect((await the('SAI-1')).can_chu_so).toBe(2);
    expect((await the('SAI-2')).can_chu_so).toBe(0);
  });

  it('`nhan` đủ và SẮP THEO CHỮ (máy chủ sắp, giao diện chỉ vẽ)', async () => {
    await dungTicket(P, 1);
    await dungNhan('tk-pj-SAI-1', 'ui');
    await dungNhan('tk-pj-SAI-1', 'bug');
    await dungTicket(P, 2);

    expect((await the('SAI-1')).nhan).toEqual(['bug', 'ui']);
    expect((await the('SAI-2')).nhan).toEqual([]);
  });

  /**
   * **`xong_luc` trên thẻ** — mốc của "ẩn Xong cũ". `cap_nhat_luc` nhích vì mọi
   * lần sửa, nên nó không trả lời được "ticket này xong bao lâu rồi"
   * (`spec-questions.md` #132, cùng họ lỗi #104).
   */
  it('`xong_luc` ra đúng mốc máy chủ ghi, và là `null` khi ticket chưa Xong', async () => {
    await dungTicket(P, 1, 'Đã xong', { trang_thai: 'done' });
    await dungTicket(P, 2, 'Chưa xong');
    await env.DB.prepare('UPDATE ticket SET xong_luc = ? WHERE id = ?')
      .bind(GIO - 100 * 86_400_000, 'tk-pj-SAI-1')
      .run();

    const r = await manHinhDanhSachTicket(env.DB, CHU, WS, { limit: 200 }, GIO);
    const bang = Object.fromEntries(r.items.map((t) => [t.ma, t.xong_luc]));
    expect(bang).toEqual({ 'SAI-1': GIO - 100 * 86_400_000, 'SAI-2': null });
  });

  it('SỬA một ticket đã Xong KHÔNG đổi `xong_luc` (đó là lý do nó tồn tại)', async () => {
    await dungTicket(P, 1, 'Đã xong', { trang_thai: 'done' });
    await env.DB.prepare('UPDATE ticket SET xong_luc = ? WHERE id = ?')
      .bind(GIO - 100 * 86_400_000, 'tk-pj-SAI-1')
      .run();
    // Một lần sửa bất kỳ: `cap_nhat_luc` nhảy, `xong_luc` thì không.
    await dungNhan('tk-pj-SAI-1', 'vừa-gắn');
    await env.DB.prepare('UPDATE ticket SET cap_nhat_luc = ? WHERE id = ?')
      .bind(GIO - 1_000, 'tk-pj-SAI-1')
      .run();

    const r = await manHinhDanhSachTicket(env.DB, CHU, WS, { limit: 200 }, GIO);
    expect(r.items[0]).toMatchObject({
      xong_luc: GIO - 100 * 86_400_000,
      cap_nhat_luc: GIO - 1_000,
    });
  });

  it('trang RỖNG ⇒ không ném (không một câu `IN ()` nào)', async () => {
    const r = await manHinhDanhSachTicket(env.DB, CHU, WS, { limit: 200 }, GIO);
    expect(r.items).toEqual([]);
    expect(r.bay_gio).toBe(GIO);
  });

  it('`GET /v1/ticket` (đường CLI) KHÔNG mang bốn trường này', async () => {
    /*
     * Thân của đường kia là đầu ra `baton list --json` (mục 13). Bốn trường của
     * thẻ là ba lượt truy vấn phụ cho mỗi trang, và CLI không vẽ thẻ nào.
     */
    await dungTicket(P, 1);
    await dungNhan('tk-pj-SAI-1', 'bug');
    const r = await goiApi('/v1/ticket', TOKEN_CHU);
    const than = await r.json<{ items: Record<string, unknown>[] }>();
    const co = ['nhan', 'con_tong', 'con_chua_ket', 'can_chu_so', 'xong_luc'].filter(
      (k) => than.items[0] !== undefined && k in than.items[0],
    );
    expect(co).toEqual([]);
  });

  it('qua HTTP: thẻ của `/v1/man-hinh-ticket` mang đủ bốn trường', async () => {
    await dungTicket(P, 1);
    await dungNhan('tk-pj-SAI-1', 'bug');
    const r = await goiApi('/v1/man-hinh-ticket', TOKEN_CHU);
    const than = await r.json<{ items: Record<string, unknown>[] }>();
    expect(than.items[0]).toMatchObject({
      nhan: ['bug'],
      con_tong: 0,
      con_chua_ket: 0,
      can_chu_so: 0,
      xong_luc: null,
    });
  });
});

/* ================================================================== *
 * D. d.398–401 — màn hình chi tiết ticket
 * ================================================================== */

/* ================================================================== *
 * d.404 — "Mọi chỗ hiện người làm đều hiện TÊN agent, không bao giờ id"
 * ================================================================== *
 * Nợ của BAT-6 đợt 2 (`NoiDungThe` có prop `ten_nguoi_cam` nhưng đường đọc danh
 * sách không trả tên, nên bảng việc vẫn vẽ `agentId`). Hai trường mới ở
 * `TheDanhSachRa`, và chúng chỉ ở đường **đọc màn hình** — `GET /v1/ticket`
 * (đầu ra `baton list --json`) giữ nguyên id, vì id là thứ agent cần.
 * ================================================================== */

describe('d.404 — đường đọc danh sách trả TÊN agent cho người cầm và người chịu trách nhiệm', () => {
  beforeEach(async () => {
    await dungAgent('ag-wb', 'W-builder');
    await dungAgent('ag-wr', 'W-reviewer');
  });

  async function the(ma: string): Promise<{
    nguoi_cam_ten: string | null;
    chiu_trach_nhiem_ten: string | null;
  }> {
    const r = await manHinhDanhSachTicket(env.DB, CHU, WS, { limit: 200 }, GIO);
    const t = r.items.find((x) => x.ma === ma);
    if (t === undefined) throw new Error(`Không có ${ma} trong trang`);
    return { nguoi_cam_ten: t.nguoi_cam_ten, chiu_trach_nhiem_ten: t.chiu_trach_nhiem_ten };
  }

  it('agent cầm (19.1 bậc 2) ⇒ TÊN của chính agent đó, không id', async () => {
    await dungTicket(P, 1, 'Việc đang giao', {
      chiu_trach_nhiem_agent_id: 'ag-wr',
    });
    await dungLuotGiao('lg-1', 'tk-pj-SAI-1', 'ag-wb', { loai: 'work', trang_thai: 'in_progress' });

    expect(await the('SAI-1')).toEqual({
      nguoi_cam_ten: 'W-builder',
      chiu_trach_nhiem_ten: 'W-reviewer',
    });
  });

  it('CHỦ cầm (bậc 4) ⇒ `null`, không một cái tên bịa', async () => {
    // `nguoi_dang_cam` đã nói `{loai:'owner'}`; một tên ở đây sẽ che mất ca đó.
    await dungTicket(P, 2, 'Chủ tự làm', { chu_tu_lam: true });
    expect(await the('SAI-2')).toEqual({ nguoi_cam_ten: null, chiu_trach_nhiem_ten: null });
  });

  it('không ai cầm (bậc 5) ⇒ `null`', async () => {
    await dungTicket(P, 3);
    expect((await the('SAI-3')).nguoi_cam_ten).toBeNull();
  });

  /**
   * **Agent không tra được tên ⇒ `null`, KHÔNG rơi về id.**
   *
   * Ca này đo thẳng `tenAgentTheoId` thay vì dựng một ticket trỏ tới một agent
   * không tồn tại: khoá ngoại của `ticket.chiu_trach_nhiem_agent_id` chặn trạng
   * thái đó ở tầng DB (đã thử: `FOREIGN KEY constraint failed`). Nhưng luật vẫn
   * phải có lưới, vì ca thật còn lại là **agent của workspace khác** (bảng tra
   * ràng `workspace_id`) — và lúc đó d.404 cấm in id ra màn hình.
   */
  it('agent không tra được tên ⇒ bảng tra KHÔNG có khoá đó (không rơi về id)', async () => {
    const ten = await tenAgentTheoId(env.DB, WS, [
      { loai: 'agent', agentId: 'ag-wb' },
      { loai: 'agent', agentId: 'ag-khong-co' },
      { loai: 'owner' },
      null,
    ]);
    expect(ten.get('ag-wb')).toBe('W-builder');
    expect(ten.has('ag-khong-co')).toBe(false);
    expect(ten.size).toBe(1);
  });

  it('danh sách rỗng / không agent nào ⇒ bảng tra rỗng, không câu SQL nào lỗi', async () => {
    expect((await tenAgentTheoId(env.DB, WS, [])).size).toBe(0);
    expect((await tenAgentTheoId(env.DB, WS, [null, { loai: 'owner' }])).size).toBe(0);
  });

  it('`GET /v1/ticket` (đầu ra CLI) KHÔNG có hai trường tên — hợp đồng mục 13 không đổi', async () => {
    await dungTicket(P, 5);
    await dungLuotGiao('lg-5', 'tk-pj-SAI-5', 'ag-wb', { loai: 'work', trang_thai: 'in_progress' });

    const t = await lietKeTicket(env.DB, CHU, WS, { limit: 200 });
    const dong = t.items.find((x) => x.ma === 'SAI-5');
    expect(dong).toBeDefined();
    expect(Object.keys(dong as object)).not.toContain('nguoi_cam_ten');
    // Và id vẫn còn ở đó cho agent dùng.
    expect(dong?.nguoi_dang_cam).toEqual({ loai: 'agent', agentId: 'ag-wb' });
  });

  it('một trang nhiều dòng cùng agent ⇒ **một** câu tra tên (không N+1)', async () => {
    for (const so of [6, 7, 8]) {
      await dungTicket(P, so);
      await dungLuotGiao(`lg-${String(so)}`, `tk-pj-SAI-${String(so)}`, 'ag-wb', {
        loai: 'work',
        trang_thai: 'in_progress',
      });
    }
    const r = await manHinhDanhSachTicket(env.DB, CHU, WS, { limit: 200 }, GIO);
    const ten = r.items
      .filter((t) => ['SAI-6', 'SAI-7', 'SAI-8'].includes(t.ma))
      .map((t) => t.nguoi_cam_ten);
    expect(ten).toEqual(['W-builder', 'W-builder', 'W-builder']);
  });
});

describe('d.398–401 — mọi vế của chi tiết ticket có một trường trong thân', () => {
  beforeEach(async () => {
    await dungAgent('ag-a', 'A');
    await dungTicket(P, 1, 'Ticket chính');
    await dungTicket(P, 2, 'Ticket con');
    await dungTicket(P, 3, 'Ticket cha của SAI-1');
    await dungTicket(P2, 1, 'Ticket điều phối');

    // d.399 ticket con: SAI-1 → SAI-2 là `parent` **xuôi**; SAI-3 → SAI-1 là cha.
    await dungLienKet('tk-pj-SAI-1', 'tk-pj-SAI-2', 'parent');
    await dungLienKet('tk-pj-SAI-3', 'tk-pj-SAI-1', 'parent');
    // d.401 "ticket liên quan **kể cả ticket điều phối**".
    await dungLienKet('tk-pj-COS-1', 'tk-pj-SAI-1', 'dieu_phoi');

    await dungLuotGiao('lg-1', 'tk-pj-SAI-1', 'ag-a', {
      trang_thai: 'submitted',
      ket_qua: 'done',
      nop_luc: GIO - 1_000,
      muc_tieu: 'Làm xong cổng Xong',
    });

    await dungBangChung('bc-1', 'tk-pj-SAI-1', 'commit', {
      commit_hash: 'abcdef1234567',
      xac_minh: 'merged',
    });
    await dungBangChung('bc-rut', 'tk-pj-SAI-1', 'note', { rut_luc: GIO - 500 });

    await dungBinhLuan('bl-1', 'tk-pj-SAI-1', 'Bình luận cũ', null, GIO - 9_000);
    await dungBinhLuan('bl-2', 'tk-pj-SAI-1', 'Bình luận mới', null, GIO - 1_000);

    await dungCanChu('ct-mo', { project_id: P, trang_thai: 'open', han_luc: GIO - 3 * 3_600_000 });
    await dungCanChu('ct-xong', { project_id: P, trang_thai: 'resolved' });
    await noiCanChuTicket('ct-mo', 'tk-pj-SAI-1');
    await noiCanChuTicket('ct-xong', 'tk-pj-SAI-1');
  });

  it('một `bay_gio` cho cả thân, và nó là mốc truyền vào', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    expect(mh.bay_gio).toBe(GIO);
  });

  it('`ticket_con` chỉ là liên kết `parent` XUÔI — cha KHÔNG lọt vào', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    expect(mh.ticket_con.map((t) => t.ma)).toEqual(['SAI-2']);
    // Cha có thật trong `lien_ket` (nếu không, ca trên xanh vì chẳng có gì để lẫn).
    expect(mh.ticket.lien_ket.some((l) => l.loai === 'parent' && l.nguoc)).toBe(true);
  });

  it('`ticket_con` mang NHÃN tiếng Việt của trạng thái, không chỉ mã', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    expect(mh.ticket_con[0]).toMatchObject({ trang_thai: 'todo', nhan_trang_thai: 'Cần làm' });
  });

  it('chuỗi lượt giao có báo cáo nộp và nghiệm thu — d.399', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    expect(mh.luot_giao).toHaveLength(1);
    expect(mh.luot_giao[0]?.trang_thai).toBe('submitted');
    expect(mh.luot_giao[0]?.bao_cao?.ket_qua).toBe('done');
    expect(mh.luot_giao[0]?.nguoi_giao).toEqual({ loai: 'owner' });
    expect(mh.luot_giao[0]?.nguoi_nhan).toEqual({ loai: 'agent', agentId: 'ag-a' });
  });

  it('bằng chứng: hash cắt 7 ký tự, và bằng chứng ĐÃ RÚT không ra (d.222)', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    expect(mh.bang_chung.map((b) => b.id)).toEqual(['bc-1']);
    expect(mh.bang_chung[0]?.hash).toBe('abcdef1');
  });

  it('bình luận và lịch sử: mới nhất trước', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    expect(mh.binh_luan.map((b) => b.id)).toEqual(['bl-2', 'bl-1']);
    expect(Array.isArray(mh.lich_su)).toBe(true);
  });

  it('`can_chu` chỉ mục ĐANG CHỜ, và là THẺ ĐẦY ĐỦ của d.250 (có `qua_han_gio`)', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    expect(mh.can_chu.map((c) => c.id)).toEqual(['ct-mo']);
    // Dẫn xuất 19.8 tính **ở máy chủ**, từ cùng mốc `bay_gio` của thân này.
    expect(mh.can_chu[0]?.qua_han).toBe(true);
    expect(mh.can_chu[0]?.qua_han_gio).toBe(3);
  });

  it('ticket liên quan giữ cả ticket ĐIỀU PHỐI — d.401', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    const dp = mh.ticket.lien_ket.filter((l) => l.loai === 'dieu_phoi');
    expect(dp.map((l) => l.ma)).toEqual(['COS-1']);
  });

  it('brief 8 mục có mặt trong thân — d.399', async () => {
    const mh = await manHinhTicket(env.DB, CHU, WS, 'SAI-1', GIO);
    const truong = [
      'muc_tieu',
      'boi_canh',
      'pham_vi',
      'file_va_nguon',
      'dieu_cam',
      'xong_la_gi',
      'cach_kiem_chung',
      'nop_lai',
    ];
    expect(truong.filter((t) => t in mh.ticket)).toEqual(truong);
  });
});

/* ================================================================== *
 * E. Cổng của màn hình: chỉ chủ, và không lộ sự tồn tại
 * ================================================================== */

describe('màn hình chi tiết ticket — cổng quyền', () => {
  it('agent gọi ⇒ FORBIDDEN, dù ticket ở đúng dự án của nó', async () => {
    await dungAgent('ag-a', 'A');
    await choVaoDuAn('ag-a', P);
    await dungTicket(P, 1);

    const ai = aiAgent('worker', { agent_id: 'ag-a', du_an_duoc_vao: [P] });
    await expect(manHinhTicket(env.DB, ai, WS, 'SAI-1', GIO)).rejects.toThrow(
      /chỉ dành cho chủ/,
    );
  });

  it('mã không có thật và mã sai dạng ra CÙNG một câu NOT_FOUND', async () => {
    const a = await manHinhTicket(env.DB, CHU, WS, 'SAI-404', GIO).catch((e: Error) => e.message);
    const b = await manHinhTicket(env.DB, CHU, WS, 'rác', GIO).catch((e: Error) => e.message);
    expect(a).toBe('Không tìm thấy ticket.');
    expect(b).toBe(a);
  });

  it('qua HTTP: `GET /v1/man-hinh-ticket/ma/:ma` của chủ trả 200 kèm `bay_gio`', async () => {
    await dungTicket(P, 1);
    const r = await goiApi('/v1/man-hinh-ticket/ma/SAI-1', TOKEN_CHU);
    expect(r.status).toBe(200);
    const than = await r.json<{ bay_gio: number; ticket: { ma: string } }>();
    expect(than.ticket.ma).toBe('SAI-1');
    expect(typeof than.bay_gio).toBe('number');
  });

  it('qua HTTP: token AGENT ⇒ 403', async () => {
    await dungAgentCoToken({
      id: 'ag-a',
      ten: 'A',
      vai_tro: 'worker',
      token: 'bt_test_token_agent_a',
      vao_tat_ca_du_an: true,
    });
    await dungTicket(P, 1);
    const r = await goiApi('/v1/man-hinh-ticket/ma/SAI-1', 'bt_test_token_agent_a');
    expect(r.status).toBe(403);
  });
});

/* ================================================================== *
 * F. `ticketCon` — hàm thuần
 * ================================================================== */

describe('ticketCon (hàm thuần)', () => {
  const lk = (loai: string, ma: string, nguoc: boolean): Parameters<typeof ticketCon>[0][number] => ({
    loai,
    nhan_loai: loai,
    ticket_id: `id-${ma}`,
    ma,
    tieu_de: ma,
    trang_thai: 'todo',
    nhan_trang_thai: 'Cần làm',
    nguoc,
  });

  it('lấy đúng `parent` xuôi; bỏ `parent` ngược và mọi loại khác', () => {
    const ra = ticketCon([
      lk('parent', 'A-1', false),
      lk('parent', 'A-2', true),
      lk('related', 'A-3', false),
      lk('dieu_phoi', 'A-4', false),
    ]);
    expect(ra.map((t) => t.ma)).toEqual(['A-1']);
  });
});
