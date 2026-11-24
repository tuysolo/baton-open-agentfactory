/**
 * CLI `baton` — nền + bốn lệnh **đọc** (SPEC mục 13 d.359, d.372, d.373, d.378;
 * d.380 `--json` và mã thoát; d.381 mã tiếng Anh vào / nhãn tiếng Việt ra; d.382
 * biến môi trường và "không bao giờ in token").
 *
 * **Mọi ca đi đường thật:** `chayCli` nhận đúng chuỗi tham số như trên dòng lệnh,
 * tự phân tích, tự đọc biến môi trường, gọi **Worker thật** trong Miniflare
 * (`SELF`) với **token thật của một agent thật** trong D1, rồi in ra hai luồng
 * giả. Không ca nào gọi hàm nội bộ của một lệnh rồi khai là "lệnh chạy được".
 */

import { SELF } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { BANG_LOI, MA_THOAT, maThoatCuaLoi, type MaLoi } from '@baton/shared';
import {
  CHE,
  DONG_BANG_CHUNG_CHUA_CO,
  DONG_CHUA_CO_LOI_DA_GAP,
  DONG_CHUA_SOAN_HO_SO,
  DONG_CHUA_SOAN_LUAT_CHUNG,
  bienTheToken,
  chayCli,
  cheToken,
  cheTrongDuLieu,
  noiDay,
  type MoiTruongCli,
  type TienTrinhNode,
} from '@baton/cli';
import {
  TOKEN_CHU,
  choVaoDuAn,
  dungAgentCoToken,
  dungBinhLuan,
  dungDuAn,
  dungLuotGiao,
  dungTicket,
  dungTicketWorkspaceKhac,
  dungWorkspace,
  goiApi,
  xoaMemTicket,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ (BAT-53, xem `caQuaSo`): ca hết giờ không để
// lệnh CLI còn dở bắn request vào lúc pool pop storage cô lập.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const URL_API = 'https://baton.test';

/** Token **giả** của test, đặt sao cho nhận ra ngay trong một đống chữ. */
const TOKEN = 'bt_token_gia_NHAN_RA_DUOC_zzz9';

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
}

/**
 * Một môi trường CLI giả: `fetch` đi thẳng vào Worker thật của Miniflare.
 *
 * `fetch_rieng` chỉ dùng cho hai ca không dựng được bằng API thật ở lượt này:
 * mạng hỏng và máy chủ trả 500.
 */
function ban(
  env: Record<string, string | undefined> = { BATON_URL: URL_API, BATON_TOKEN: TOKEN },
  fetch_rieng?: typeof fetch,
): BanChay {
  const ra: string[] = [];
  const loi: string[] = [];
  const f: typeof fetch = fetch_rieng ?? ((u, i) => SELF.fetch(u, i));
  return {
    mt: { env, viet: (d) => void ra.push(d), vietLoi: (d) => void loi.push(d), fetch: f },
    ra,
    loi,
  };
}

/** Toàn bộ đầu ra của một lần chạy — `stdout` **và** `stderr`. */
function tatCa(b: BanChay): string {
  return [...b.ra, ...b.loi].join('\n');
}

async function duLieuMau(): Promise<{ ticket_id: string }> {
  await dungWorkspace();
  const pj = await dungDuAn('SAI', 'Sample');
  await dungAgentCoToken({
    id: 'ag-1',
    ten: 'W-builder',
    vai_tro: 'worker',
    token: TOKEN,
    du_an: [pj],
  });
  const tk = await dungTicket(pj, 1, 'Dựng nền CLI', { uu_tien: 'high', trang_thai: 'in_progress' });
  return { ticket_id: tk };
}

describe('nền CLI — tham số, biến môi trường, mã thoát (SPEC d.380, d.382)', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('thiếu BATON_URL hoặc BATON_TOKEN: mã thoát 2, nói đúng tên biến', async () => {
    const khong_url = ban({ BATON_TOKEN: TOKEN });
    expect(await chayCli(['whoami'], khong_url.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(khong_url.loi.join('\n')).toContain('BATON_URL');

    const khong_token = ban({ BATON_URL: URL_API });
    expect(await chayCli(['whoami'], khong_token.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(khong_token.loi.join('\n')).toContain('BATON_TOKEN');

    const khong_gi = ban({});
    expect(await chayCli(['whoami'], khong_gi.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(khong_gi.loi.join('\n')).toContain('BATON_URL');
    expect(khong_gi.loi.join('\n')).toContain('BATON_TOKEN');
  });

  it('lệnh lạ, tuỳ chọn lạ, thiếu tham số: INVALID_INPUT và mã thoát 1', async () => {
    const la = ban();
    expect(await chayCli(['khong-co-lenh-nay'], la.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(la.loi.join('\n')).toContain('INVALID_INPUT');

    const co_la = ban();
    expect(await chayCli(['list', '--khong-co-co-nay'], co_la.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(co_la.loi.join('\n')).toContain('--khong-co-co-nay');

    const thieu_gia_tri = ban();
    expect(await chayCli(['list', '--status'], thieu_gia_tri.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(thieu_gia_tri.loi.join('\n')).toContain('--status cần một giá trị');

    const thieu_vi_tri = ban();
    expect(await chayCli(['show'], thieu_vi_tri.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(thieu_vi_tri.loi.join('\n')).toContain('Cách dùng: baton show');

    const thua_vi_tri = ban();
    expect(await chayCli(['whoami', 'thua'], thua_vi_tri.mt)).toBe(MA_THOAT.loi_nghiep_vu);
  });

  it('--co=giá-trị và --co giá-trị cho cùng kết quả', async () => {
    const bang = ban();
    expect(await chayCli(['list', '--project=SAI', '--json'], bang.mt)).toBe(MA_THOAT.xong);
    const cach = ban();
    expect(await chayCli(['list', '--project', 'SAI', '--json'], cach.mt)).toBe(MA_THOAT.xong);
    expect(bang.ra.join('\n')).toBe(cach.ra.join('\n'));
  });

  it('token sai: 401 thật của API → mã thoát 2 (không phải 1)', async () => {
    const b = ban({ BATON_URL: URL_API, BATON_TOKEN: 'bt_khong_phai_token_cua_ai' });
    expect(await chayCli(['whoami'], b.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(b.loi.join('\n')).toContain('INVALID_TOKEN');
  });

  it('NOT_FOUND thật của API → mã thoát 1, có in mã lỗi', async () => {
    const b = ban();
    expect(await chayCli(['show', 'tk-khong-ton-tai'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('NOT_FOUND');
  });

  it('500 của máy chủ → mã thoát 2, và mạng hỏng → mã thoát 2', async () => {
    const nam_tram = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, async () =>
      Response.json({ error: 'INTERNAL', message: 'Máy chủ gặp lỗi không lường trước.' }, { status: 500 }),
    );
    expect(await chayCli(['whoami'], nam_tram.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(nam_tram.loi.join('\n')).toContain('INTERNAL');

    const mang = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, () => {
      throw new TypeError('fetch failed');
    });
    expect(await chayCli(['whoami'], mang.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(mang.loi.join('\n')).toContain('Không gọi được Baton');
  });

  it('bảng mã thoát phủ **mọi** mã lỗi, và ba mã hạ tầng ra 2 (quyet-dinh 01/10)', () => {
    for (const ma of Object.keys(BANG_LOI) as MaLoi[]) {
      expect([MA_THOAT.loi_nghiep_vu, MA_THOAT.loi_xac_thuc_hoac_mang]).toContain(
        maThoatCuaLoi(ma),
      );
    }
    expect(maThoatCuaLoi('INTERNAL')).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(maThoatCuaLoi('RATE_LIMITED')).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(maThoatCuaLoi('INVALID_TOKEN')).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(maThoatCuaLoi('NOT_FOUND')).toBe(MA_THOAT.loi_nghiep_vu);
    expect(maThoatCuaLoi('FORBIDDEN')).toBe(MA_THOAT.loi_nghiep_vu);
    expect(maThoatCuaLoi('EVIDENCE_REQUIRED')).toBe(MA_THOAT.loi_nghiep_vu);
  });

  it('--json ở đường LỖI cũng phân tích được bằng JSON.parse', async () => {
    const b = ban();
    expect(await chayCli(['show', 'tk-khong-ton-tai', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    const than = JSON.parse(b.loi.join('\n')) as { loi: string; thong_diep: string };
    expect(than.loi).toBe('NOT_FOUND');
    expect(typeof than.thong_diep).toBe('string');
  });
});

describe('baton whoami — SPEC d.359', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('người đọc: agent là ai, vai trò (mã + nhãn tiếng Việt), dự án được vào', async () => {
    const b = ban();
    expect(await chayCli(['whoami'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Tôi là: agent ag-1');
    // d.381: mã tiếng Anh **và** nhãn tiếng Việt.
    expect(chu).toContain('(worker)');
    expect(chu).toMatch(/Vai trò: .+ \(worker\)/);
    expect(chu).toContain('Dự án được vào: pj-SAI');
    // Vế "luật chung" của d.359 — mục 9 d.301, chưa soạn thì nói "chưa soạn".
    expect(chu).toContain(DONG_CHUA_SOAN_LUAT_CHUNG);
  });

  it('--json: phân tích được, có vai trò và dự án được vào', async () => {
    const b = ban();
    expect(await chayCli(['whoami', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as {
      loai: string;
      agent_id: string;
      vai_tro: string;
      du_an_duoc_vao: string[];
      luat_chung: { danh_sach_cam: string | null; checklist: string | null };
    };
    expect(d.loai).toBe('agent');
    expect(d.agent_id).toBe('ag-1');
    expect(d.vai_tro).toBe('worker');
    expect(d.du_an_duoc_vao).toEqual(['pj-SAI']);
    // Vế "luật chung" của d.359 — một thân **thật**, không còn `null`.
    expect(d.luat_chung).toHaveProperty('danh_sach_cam');
    expect(d.luat_chung).toHaveProperty('checklist');
  });
});

/** Mốc gốc của 12 bình luận fixture — xem `MOC_BINH_LUAN`. */
const MOC_GOC = 1_700_000_000_000;

/**
 * Mốc tạo của bình luận số `i` — **tách nhau** một phút.
 *
 * Bản đầu của fixture dùng `Date.now()` cho cả 12 bình luận, nên 12 cái **cùng**
 * `tao_luc` và không ca nào phân biệt được "10 bình luận **cuối**" của d.372:
 * đột biến `ORDER BY tao_luc DESC` → `ASC` vẫn xanh. Tách mốc là điều kiện để vế
 * đó có một assertion thật.
 */
function MOC_BINH_LUAN(i: number): number {
  return MOC_GOC + i * 60_000;
}

describe('baton show <MÃ> — SPEC d.372', () => {
  let ticket_id = '';

  beforeEach(async () => {
    const d = await duLieuMau();
    ticket_id = d.ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', { trang_thai: 'in_progress' });
    // 12 bình luận để chứng minh CLI in **đúng 10 cuối**, không in hết.
    for (let i = 1; i <= 12; i += 1) {
      await dungBinhLuan(
        `cm-${String(i)}`,
        ticket_id,
        `Bình luận số ${String(i)}`,
        'ag-1',
        MOC_BINH_LUAN(i),
      );
    }
  });

  it('nhận MÃ hiển thị (SAI-1), in ticket, lượt giao và đúng 10 bình luận cuối', async () => {
    const b = ban();
    expect(await chayCli(['show', 'SAI-1'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('SAI-1 — Dựng nền CLI');
    expect(chu).toMatch(/Trạng thái: .+ \(in_progress\)/);
    expect(chu).toContain('Lượt giao (1):');
    expect(chu).toContain('#1');
    expect(chu).toContain('ag-1');
    /*
     * Nhan đề **không** viết cứng số 10: số bình luận cuối là hằng của server
     * (`SO_BINH_LUAN_CUOI`), không có trong thân phản hồi. Số trong ngoặc là số
     * đếm thật.
     */
    expect(chu).toContain('Bình luận cuối (10):');
    expect(chu).not.toContain('10 bình luận cuối');
    expect(b.ra.join('\n').match(/Bình luận số/g)).toHaveLength(10);
    // Vế "bằng chứng" của d.372 — API chưa có đường đọc.
    expect(chu).toContain(DONG_BANG_CHUNG_CHUA_CO);
  });

  /**
   * Vế "**10 bình luận CUỐI**" của d.372 — đúng **tập** và đúng **thứ tự**.
   *
   * Ca này là ca ghim đột biến `ORDER BY tao_luc DESC, id DESC` → `ASC`: với 12
   * bình luận có mốc tách nhau, 10 cái cuối là số **12 → 3**, không phải 1 → 10.
   */
  it('10 bình luận cuối là 10 cái MỚI NHẤT, mới trước cũ sau', async () => {
    const mong_doi = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3];

    const b = ban();
    expect(await chayCli(['show', 'SAI-1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as {
      ticket: { binh_luan_cuoi: { id: string; noi_dung: string; tao_luc: number }[] };
    };
    expect(d.ticket.binh_luan_cuoi.map((c) => c.id)).toEqual(
      mong_doi.map((i) => `cm-${String(i)}`),
    );
    expect(d.ticket.binh_luan_cuoi.map((c) => c.tao_luc)).toEqual(mong_doi.map(MOC_BINH_LUAN));
    // Hai cái cũ nhất **không** được có mặt.
    expect(d.ticket.binh_luan_cuoi.map((c) => c.id)).not.toContain('cm-1');
    expect(d.ticket.binh_luan_cuoi.map((c) => c.id)).not.toContain('cm-2');

    // Đầu ra người-đọc giữ **đúng** thứ tự ấy (cau-hoi-spec #79: không sắp lại ở CLI).
    const nguoi_doc = ban();
    expect(await chayCli(['show', 'SAI-1'], nguoi_doc.mt)).toBe(MA_THOAT.xong);
    const so_theo_thu_tu = [...nguoi_doc.ra.join('\n').matchAll(/Bình luận số (\d+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(so_theo_thu_tu).toEqual(mong_doi);
  });

  /**
   * **Ticket đã xoá mềm vẫn `show` được bằng MÃ** — mục 4 (khôi phục trong 30
   * ngày), d.372 không loại trừ ticket đã xoá.
   *
   * Ca ghim việc bỏ đường **cuộn `GET /v1/ticket`**: truy vấn danh sách có cứng
   * `xoa_luc IS NULL`, nên bản cuộn ra `NOT_FOUND` cho `SAI-1` đã xoá trong khi
   * `show <id>` của **cùng** ticket trả về bình thường.
   */
  it('ticket ĐÃ XOÁ MỀM: show theo MÃ ra đúng cùng ticket như show theo id', async () => {
    await xoaMemTicket(ticket_id, MOC_GOC);

    const theo_ma = ban();
    expect(await chayCli(['show', 'SAI-1', '--json'], theo_ma.mt)).toBe(MA_THOAT.xong);
    const a = JSON.parse(theo_ma.ra.join('\n')) as { ticket: { id: string; xoa_luc: number } };
    expect(a.ticket.id).toBe(ticket_id);
    expect(a.ticket.xoa_luc).toBe(MOC_GOC);

    const theo_id = ban();
    expect(await chayCli(['show', ticket_id, '--json'], theo_id.mt)).toBe(MA_THOAT.xong);
    expect(theo_id.ra.join('\n')).toBe(theo_ma.ra.join('\n'));
  });

  /**
   * **Một** request để tra mã — đếm lần gọi, không đo bằng thời gian.
   *
   * Ở mốc 200.000 ticket (19.12 câu 1), bản cuộn danh sách tốn ~2000 request cho
   * một `baton show SAI-1` (ticket **cũ nhất** nằm cuối thứ tự
   * `(hang_uu_tien, tao_luc DESC)`), tự đập vào trần 600 request/phút của d.387.
   */
  it('show theo MÃ tốn ĐÚNG MỘT request tra mã, và không cuộn danh sách', async () => {
    const duong: string[] = [];
    const b = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, (u, i) => {
      duong.push(new URL(String(u)).pathname + new URL(String(u)).search);
      return SELF.fetch(u, i);
    });
    expect(await chayCli(['show', 'SAI-1', '--json'], b.mt)).toBe(MA_THOAT.xong);

    expect(duong.filter((p) => p.startsWith('/v1/ticket/ma/'))).toEqual(['/v1/ticket/ma/SAI-1']);
    // Không một lần nào gọi danh sách ticket hay danh sách dự án.
    expect(duong.filter((p) => p === '/v1/ticket' || p.startsWith('/v1/ticket?'))).toEqual([]);
    expect(duong.filter((p) => p.startsWith('/v1/du-an'))).toEqual([]);
    // Cả lệnh: tra mã (trả luôn ticket) + chuỗi lượt giao.
    expect(duong).toHaveLength(2);
  });

  /**
   * **Ngoài phạm vi phải GIỐNG HỆT không có thật** — d.386 ("404 … cũng dùng khi
   * đối tượng ngoài phạm vi, để không lộ sự tồn tại") + 19.12 câu 15.
   *
   * So **cả mã lẫn thân**: hai câu chữ khác nhau là một máy dò sự tồn tại đủ
   * dùng, dù mã HTTP giống nhau.
   */
  it('MÃ ngoài phạm vi và MÃ không có thật: cùng mã HTTP, cùng thân', async () => {
    // Một dự án ag-1 **không** được vào, có ticket thật trong đó.
    const an = await dungDuAn('HID', 'Dự án ag-1 không thấy');
    await dungTicket(an, 1, 'Việc ngoài tầm nhìn');

    const goi = async (ma: string): Promise<{ status: number; than: unknown }> => {
      const res = await SELF.fetch(`${URL_API}/v1/ticket/ma/${ma}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      return { status: res.status, than: await res.json() };
    };

    const ngoai_pham_vi = await goi('HID-1');
    const khong_co_that = await goi('HID-9');
    const du_an_khong_co = await goi('ZZZ-1');
    const sai_dinh_dang = await goi('khong-phai-ma');

    expect(ngoai_pham_vi.status).toBe(404);
    expect(ngoai_pham_vi).toEqual(khong_co_that);
    expect(ngoai_pham_vi).toEqual(du_an_khong_co);
    expect(ngoai_pham_vi).toEqual(sai_dinh_dang);

    // Và qua CLI: mã thoát 1 + `NOT_FOUND`, không lộ gì thêm.
    const b = ban();
    expect(await chayCli(['show', 'HID-1'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('NOT_FOUND');
    expect(b.loi.join('\n')).not.toContain('Việc ngoài tầm nhìn');
  });

  /**
   * **MÃ của một WORKSPACE KHÁC** — bất biến tách dữ liệu của SPEC mục 1, trên
   * đúng đường tra mã.
   *
   * `dungTicketWorkspaceKhac` dựng workspace `ws-zz-khac` với dự án mã `OTH` và
   * ticket số 1, tức mã `OTH-1` **tồn tại thật** — chỉ không thuộc workspace của
   * người gọi. Phản hồi phải giống **hệt** một mã không có thật (cả mã HTTP lẫn
   * thân), và không được trả tiêu đề của ticket kia.
   */
  it('MÃ thuộc WORKSPACE KHÁC: giống hệt mã không có thật', async () => {
    await dungTicketWorkspaceKhac();

    const goi = async (ma: string): Promise<{ status: number; than: unknown }> => {
      const res = await SELF.fetch(`${URL_API}/v1/ticket/ma/${ma}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      return { status: res.status, than: await res.json() };
    };

    const ws_khac = await goi('OTH-1');
    const khong_co_that = await goi('OTH-9');

    expect(ws_khac.status).toBe(404);
    expect(ws_khac).toEqual(khong_co_that);
    expect(JSON.stringify(ws_khac.than)).not.toContain('workspace khác');

    /*
     * Và với token **CHỦ** — đây mới là phần đo đúng bất biến workspace. Token
     * agent `ag-1` còn bị **cửa phạm vi dự án** (`agent_project`) chặn trước, nên
     * phần trên một mình không phân biệt được: đã thử, bỏ `t.workspace_id` khỏi
     * `layTicket` mà nó **vẫn xanh**. Chủ không có cửa phạm vi nào.
     *
     * Đo bằng đột biến: ca này chỉ đỏ khi **cả ba** vế workspace thành hằng đúng
     * (`p.workspace_id` trong `ON` + `t.workspace_id` của câu tra mã +
     * `t.workspace_id` của `layTicket`) — tức mỗi vế một mình đã đủ chắn, và đó
     * chính là lý do thêm vế `ON` không phải một bản vá bảo mật mà là một lớp dư
     * thừa cộng với một kế hoạch truy vấn tốt hơn (xem `doc-ticket.ts`).
     */
    const chu_res = await goiApi('/v1/ticket/ma/OTH-1', TOKEN_CHU);
    const chu_than = await chu_res.json<unknown>();
    expect(chu_res.status).toBe(404);
    expect(chu_than).toEqual(
      await (await goiApi('/v1/ticket/ma/OTH-9', TOKEN_CHU)).json<unknown>(),
    );
    expect(JSON.stringify(chu_than)).not.toContain('workspace khác');

    const b = ban();
    expect(await chayCli(['show', 'OTH-1'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('NOT_FOUND');
    expect(b.loi.join('\n')).not.toContain('Việc của workspace khác');
  });

  it('--json: phân tích được, có ticket + lượt giao + 10 bình luận cuối', async () => {
    const b = ban();
    expect(await chayCli(['show', 'SAI-1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as {
      ticket: { ma: string; id: string; binh_luan_cuoi: unknown[] };
      luot_giao: { so_luot: number }[];
      bang_chung: null;
    };
    expect(d.ticket.ma).toBe('SAI-1');
    expect(d.ticket.id).toBe(ticket_id);
    expect(d.ticket.binh_luan_cuoi).toHaveLength(10);
    expect(d.luot_giao).toHaveLength(1);
    expect(d.luot_giao[0]?.so_luot).toBe(1);
    expect(d.bang_chung).toBeNull();
  });

  it('nhận cả id thật của ticket, cho cùng ticket', async () => {
    const b = ban();
    expect(await chayCli(['show', ticket_id, '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { ticket: { ma: string } };
    expect(d.ticket.ma).toBe('SAI-1');
  });

  it('MÃ của dự án không có, và số không có: NOT_FOUND, mã thoát 1', async () => {
    const du_an_la = ban();
    expect(await chayCli(['show', 'ZZZ-1'], du_an_la.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(du_an_la.loi.join('\n')).toContain('NOT_FOUND');

    const so_la = ban();
    expect(await chayCli(['show', 'SAI-999'], so_la.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(so_la.loi.join('\n')).toContain('NOT_FOUND');
  });
});

describe('baton list — SPEC d.373, d.381', () => {
  beforeEach(async () => {
    await duLieuMau();
    const pj2 = await dungDuAn('OTR', 'Dự án khác');
    await choVaoDuAn('ag-1', pj2);
    await dungTicket('pj-SAI', 2, 'Việc đã xong', { trang_thai: 'done' });
    await dungTicket(pj2, 1, 'Việc của dự án khác');
  });

  it('người đọc: một dòng mỗi ticket, có mã, nhãn tiếng Việt và mã tiếng Anh', async () => {
    const b = ban();
    expect(await chayCli(['list'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('SAI-1');
    expect(chu).toContain('SAI-2');
    expect(chu).toContain('OTR-1');
    expect(chu).toMatch(/SAI-1.+\(high\).+\(in_progress\)/);
  });

  it('--project nhận MÃ dự án và chỉ trả dự án đó', async () => {
    const b = ban();
    expect(await chayCli(['list', '--project', 'OTR', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { items: { ma: string; project_id: string }[] };
    expect(d.items.map((t) => t.ma)).toEqual(['OTR-1']);
  });

  it('--status nhận mã tiếng Anh; mã sai bị chặn ở CLI với mã thoát 1', async () => {
    const dung = ban();
    expect(await chayCli(['list', '--status', 'done', '--json'], dung.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(dung.ra.join('\n')) as { items: { ma: string }[] };
    expect(d.items.map((t) => t.ma)).toEqual(['SAI-2']);

    // Nhãn tiếng Việt **không** phải mã nhập (d.381).
    const sai = ban();
    expect(await chayCli(['list', '--status', 'Xong'], sai.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(sai.loi.join('\n')).toContain('INVALID_INPUT');
    expect(sai.loi.join('\n')).toContain('done');
  });
});

describe('baton profile <DỰ ÁN> — SPEC d.378', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('người đọc: dự án, hai cờ của mục 9 d.300, và hồ sơ CHƯA SOẠN thì nói ra', async () => {
    const b = ban();
    expect(await chayCli(['profile', 'SAI'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('SAI — Sample');
    expect(chu).toMatch(/Trạng thái: .+ \(active\)/);
    expect(chu).toContain('Dự án không code:');
    expect(chu).toContain('Bắt buộc review:');
    // Chưa soạn **khác** rỗng — xem `ho-so-md.ts`.
    expect(chu).toContain(DONG_CHUA_SOAN_HO_SO);
    expect(chu).toContain(DONG_CHUA_CO_LOI_DA_GAP);
  });

  /**
   * **d.378 "In hồ sơ dự án" — hồ sơ THẬT.** Ca này là lưới cho vế mà phần 5 còn
   * là một dòng "API chưa có": chín mục của d.296–298, "Lỗi đã gặp" của d.299 và
   * Luật chung của d.301 phải **ra chữ** cho agent đọc, vì d.294 nói agent mới
   * "chỉ cần đọc trang này" — và agent không có trình duyệt.
   */
  it('hồ sơ đã soạn: chín mục, Lỗi đã gặp, và Luật chung đều ra chữ', async () => {
    await SELF.fetch('https://x/v1/du-an/pj-SAI/ho-so', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${TOKEN_CHU}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        la_gi: 'Hệ điều hành việc',
        thu_muc: '/Users/chu/sample',
        repo_chu_so_huu: 'chu',
        repo_ten: 'sample',
        repo_nhanh_mac_dinh: 'main',
        stack: 'TypeScript',
        doc_truoc: '- SPEC.md\n- viec.md',
        cach_deploy: 'CoS chạy tay',
        danh_sach_cam: 'Không dữ liệu thật',
      }),
    });
    await SELF.fetch('https://x/v1/du-an/pj-SAI/loi-da-gap', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_CHU}`, 'content-type': 'application/json' },
      body: JSON.stringify({ loi: 'D1 kén SQL', cach_tranh: 'Chạy thử migration' }),
    });
    await SELF.fetch('https://x/v1/luat-chung', {
      method: 'PUT',
      headers: { authorization: `Bearer ${TOKEN_CHU}`, 'content-type': 'application/json' },
      body: JSON.stringify({ danh_sach_cam: 'Không tiền', checklist: '1. Đọc SPEC' }),
    });

    const b = ban();
    expect(await chayCli(['profile', 'SAI'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');

    // Chín mục của d.296–298 — đủ cả chín, không thiếu vế nào.
    for (const v of [
      'Hệ điều hành việc',
      '/Users/chu/sample',
      'chu',
      'sample',
      'main',
      'TypeScript',
      'SPEC.md',
      'CoS chạy tay',
      'Không dữ liệu thật',
    ]) {
      expect(chu, `mục "${v}" của d.296–298`).toContain(v);
    }
    // d.299 — ngày, lỗi, cách tránh.
    expect(chu).toMatch(/\d{4}-\d{2}-\d{2} — D1 kén SQL/);
    expect(chu).toContain('Cách tránh: Chạy thử migration');
    // d.301 — Luật chung đọc được **qua CLI**, không phải chỉ trên web.
    expect(chu).toContain('Không tiền');
    expect(chu).toContain('1. Đọc SPEC');
    // Và không còn một dòng "chưa có" nào.
    expect(chu).not.toContain(DONG_CHUA_SOAN_HO_SO);
    expect(chu).not.toContain(DONG_CHUA_CO_LOI_DA_GAP);
  });

  it('--json: phân tích được, có dự án và hồ sơ THẬT (không còn `ho_so: null`)', async () => {
    const b = ban();
    expect(await chayCli(['profile', 'SAI', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as {
      du_an: { ma: string; id: string; khong_code: boolean };
      ho_so: { project_id: string; phien_ban: number; loi_da_gap: unknown[] };
      luat_chung: { danh_sach_cam: string | null };
    };
    expect(d.du_an.ma).toBe('SAI');
    expect(d.du_an.id).toBe('pj-SAI');
    expect(d.ho_so.project_id).toBe('pj-SAI');
    expect(d.ho_so.phien_ban).toBe(0);
    expect(d.ho_so.loi_da_gap).toEqual([]);
    expect(d.luat_chung).toHaveProperty('danh_sach_cam');
  });

  it('mã dự án sai định dạng → INVALID_INPUT; dự án ngoài phạm vi → NOT_FOUND', async () => {
    const dinh_dang = ban();
    expect(await chayCli(['profile', 'sai-dinh-dang'], dinh_dang.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(dinh_dang.loi.join('\n')).toContain('INVALID_INPUT');

    const ngoai = ban();
    expect(await chayCli(['profile', 'ZZZ'], ngoai.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(ngoai.loi.join('\n')).toContain('NOT_FOUND');
  });
});

/**
 * **`baton rules` — trang "Luật chung", SPEC mục 9 d.301.**
 *
 * d.301 là vế duy nhất của mục 9 chốt **đường đọc**: "Agent đọc được qua CLI hoặc
 * MCP". Nên nó cần một lệnh, không chỉ một khối lồng trong `baton profile` (một
 * agent chưa được vào dự án nào thì không có mã dự án nào để gõ).
 */
describe('baton rules — SPEC mục 9 d.301', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('chưa soạn thì nói "chưa soạn", không im lặng', async () => {
    const b = ban();
    expect(await chayCli(['rules'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain(DONG_CHUA_SOAN_LUAT_CHUNG);
  });

  it('AGENT đọc được cả hai phần của d.301, không cần mã dự án nào', async () => {
    await SELF.fetch('https://x/v1/luat-chung', {
      method: 'PUT',
      headers: { authorization: `Bearer ${TOKEN_CHU}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        danh_sach_cam: 'Không tiền\nKhông dữ liệu thật',
        checklist: '1. Đọc SPEC\n2. Đọc hồ sơ',
      }),
    });

    // `ban()` chạy bằng token **agent**, không token chủ — đúng vế "agent đọc được".
    const b = ban();
    expect(await chayCli(['rules'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Không tiền');
    expect(chu).toContain('Không dữ liệu thật');
    expect(chu).toContain('1. Đọc SPEC');
    expect(chu).toContain('2. Đọc hồ sơ');
    expect(chu).not.toContain(DONG_CHUA_SOAN_LUAT_CHUNG);
  });

  it('--json: phân tích được, đúng hai trường của d.301', async () => {
    const b = ban();
    expect(await chayCli(['rules', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as Record<string, unknown>;
    expect(d).toHaveProperty('danh_sach_cam');
    expect(d).toHaveProperty('checklist');
  });
});

describe('KHÔNG BAO GIỜ IN TOKEN — SPEC d.382, mục 15', () => {
  beforeEach(async () => {
    const d = await duLieuMau();
    await dungLuotGiao('lg-1', d.ticket_id, 'ag-1', { trang_thai: 'in_progress' });
    await dungBinhLuan('cm-1', d.ticket_id, 'Một bình luận', 'ag-1');
  });

  it('bốn lệnh đọc, cả hai chế độ ra: token không ra stdout, stderr hay --json', async () => {
    const lenh = [
      ['whoami'],
      ['show', 'SAI-1'],
      ['list'],
      ['profile', 'SAI'],
      ['whoami', '--json'],
      ['show', 'SAI-1', '--json'],
      ['list', '--json'],
      ['profile', 'SAI', '--json'],
    ];
    for (const ds of lenh) {
      const b = ban();
      expect(await chayCli(ds, b.mt)).toBe(MA_THOAT.xong);
      expect(tatCa(b)).not.toContain(TOKEN);
    }
  });

  it('đường LỖI cũng không lọt: 401, NOT_FOUND, 500, mạng hỏng, thiếu biến', async () => {
    const sai_token = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN + '-sai' });
    await chayCli(['whoami', '--json'], sai_token.mt);
    expect(tatCa(sai_token)).not.toContain(TOKEN);

    const khong_thay = ban();
    await chayCli(['show', 'SAI-999'], khong_thay.mt);
    expect(tatCa(khong_thay)).not.toContain(TOKEN);

    /*
     * **Ca của người đi tìm cách làm token lọt ra:** một máy chủ (hoặc một proxy)
     * nhắc lại chính token trong thông điệp lỗi của mình. Thông điệp đó đi nguyên
     * vào `BatonError.message` rồi ra `stderr` — nếu không có lưới chắn.
     */
    const may_chu_nhac_lai = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, async () =>
      Response.json(
        { error: 'INVALID_TOKEN', message: `Token "${TOKEN}" không hợp lệ.` },
        { status: 401 },
      ),
    );
    expect(await chayCli(['whoami'], may_chu_nhac_lai.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(tatCa(may_chu_nhac_lai)).not.toContain(TOKEN);
    expect(tatCa(may_chu_nhac_lai)).toContain(CHE);

    // Cùng chuyện, ở chế độ `--json`.
    const json_nhac_lai = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, async () =>
      Response.json({ error: 'INVALID_TOKEN', message: `Token ${TOKEN} sai.` }, { status: 401 }),
    );
    await chayCli(['whoami', '--json'], json_nhac_lai.mt);
    expect(tatCa(json_nhac_lai)).not.toContain(TOKEN);
    expect(JSON.parse(json_nhac_lai.loi.join('\n'))).toMatchObject({ loi: 'INVALID_TOKEN' });

    // Lỗi mạng mang theo token trong thông điệp của runtime.
    const mang = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, () => {
      throw new TypeError(`connect ECONNREFUSED (authorization: Bearer ${TOKEN})`);
    });
    expect(await chayCli(['whoami'], mang.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(tatCa(mang)).not.toContain(TOKEN);

    // Thiếu biến môi trường: thông điệp chỉ nói **tên** biến.
    const thieu = ban({ BATON_TOKEN: TOKEN });
    await chayCli(['whoami'], thieu.mt);
    expect(tatCa(thieu)).not.toContain(TOKEN);
  });

  it('cheToken: che mọi lần xuất hiện, không đụng gì khi token rỗng', () => {
    expect(cheToken(`a ${TOKEN} b ${TOKEN}`, TOKEN)).toBe(`a ${CHE} b ${CHE}`);
    expect(cheToken('không có gì', TOKEN)).toBe('không có gì');
    expect(cheToken('abc', '')).toBe('abc');
  });

  it('cheToken bắt cả biến thể: dạng JSON-escape và dạng URL-encode', () => {
    const t = 'ab"c\\d/e f';
    for (const dang of bienTheToken(t)) {
      expect(cheToken(`trước ${dang} sau`, t)).toBe(`trước ${CHE} sau`);
    }
    // Ba dạng tối thiểu phải có mặt.
    expect(bienTheToken(t)).toContain(t);
    expect(bienTheToken(t)).toContain(JSON.stringify(t).slice(1, -1));
    expect(bienTheToken(t)).toContain(encodeURIComponent(t));
    // Token rỗng vẫn không che gì (không chèn CHE vào giữa mọi ký tự).
    expect(bienTheToken('')).toEqual([]);
  });

  /**
   * **Dạng form-urlencoded: dấu cách thành `+`, không `%20`.**
   *
   * Chỗ **duy nhất** của dự án dựng query là `URLSearchParams.set` trong `ghepUrl`
   * của `@baton/client` — và nó sinh `+` cho dấu cách. Lưới chắn chỉ có
   * `encodeURIComponent` (tức `%20`) thì một token **có dấu cách** đi qua một query
   * sẽ ra `bt_gia_a+b_zzz9`, không biến thể nào khớp. Chưa đường nào đưa token vào
   * URL (ca "token KHÔNG đi vào URL" ghim việc đó), nên đây là lưới chắn, không
   * phải một lỗ đang mở.
   */
  it('cheToken bắt dạng FORM-URLENCODED của token có dấu cách (`+`, không `%20`)', () => {
    const t = 'bt_gia_a b_zzz9';
    const dang_form = new URLSearchParams({ token: t }).toString().slice('token='.length);
    expect(dang_form).toBe('bt_gia_a+b_zzz9');
    expect(bienTheToken(t)).toContain(dang_form);
    expect(cheToken(`trước ${dang_form} sau`, t)).toBe(`trước ${CHE} sau`);
    // Dạng `%20` vẫn phải còn — hai dạng cùng tồn tại, không thay nhau.
    expect(bienTheToken(t)).toContain(encodeURIComponent(t));
    expect(cheToken(encodeURIComponent(t), t)).toBe(CHE);
  });

  /**
   * `cheTrongDuLieu` — **hành vi của chính hàm**: đi hết dữ liệu lồng sâu và che
   * cả **khoá** của object.
   *
   * Ca này **không** phân biệt hai nửa lưới chắn của `in-ra.ts`: bỏ lời gọi
   * `cheTrongDuLieu` ở đó thì ca này vẫn xanh (nó gọi hàm trực tiếp), và reviewer
   * lượt 2 đã đo đúng điều ấy — nửa che-sau một mình đủ cho mọi ca hiện có. Khai
   * đầy đủ ở `che-token.ts`, khối "Hai nửa đó KHÔNG phân biệt được bằng test".
   */
  it('cheTrongDuLieu: che trong dữ liệu lồng sâu, cả khoá của object', () => {
    const sau = cheTrongDuLieu(
      { a: [{ b: { c: [`x ${TOKEN} y`] } }], [TOKEN]: 1, d: null, e: 7, f: true },
      TOKEN,
    );
    expect(sau).toEqual({
      a: [{ b: { c: [`x ${CHE} y`] } }],
      [CHE]: 1,
      d: null,
      e: 7,
      f: true,
    });
    expect(JSON.stringify(sau)).not.toContain(TOKEN);
  });

  it('token KHÔNG đi vào URL, chỉ vào header Authorization', async () => {
    const url_da_goi: string[] = [];
    const b = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, (u, i) => {
      url_da_goi.push(String(u));
      return SELF.fetch(u, i);
    });
    expect(await chayCli(['show', 'SAI-1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    expect(url_da_goi.length).toBeGreaterThan(0);
    for (const u of url_da_goi) expect(u).not.toContain(TOKEN);
  });
});

/**
 * **Token có ký tự bị JSON escape** — ca hỏng của lưới chắn bản đầu.
 *
 * Bản đầu che **sau** `JSON.stringify` và chỉ che **chuỗi y nguyên**: với
 * `BATON_TOKEN` chứa `"`, đầu ra chứa `ab\"cd` chứ không chứa `ab"cd`, nên lưới
 * chắn không khớp và **token ra `stderr` nguyên vẹn**. Token của các ca trên chỉ
 * gồm `[A-Za-z0-9_]` nên không ca nào bắt được.
 *
 * Mọi token dưới đây là chuỗi **giả**.
 */
describe('KHÔNG BAO GIỜ IN TOKEN — token có ký tự đặc biệt (SPEC d.382, mục 15)', () => {
  /** Có `"` và `\` — hai ký tự `JSON.stringify` thoát. */
  const TOKEN_NGOAC = 'bt_gia_ab"cd\\ef_zzz9';
  /** Có ký tự phải URL-encode (`/`, `+`, `%`). */
  const TOKEN_URL = 'bt_gia_a+b/c%d_zzz9';

  for (const [ten, token] of [
    ['JSON escape', TOKEN_NGOAC],
    ['URL encode', TOKEN_URL],
  ] as const) {
    describe(`token cần ${ten}`, () => {
      beforeEach(async () => {
        await dungWorkspace();
        const pj = await dungDuAn('SAI', 'Sample');
        await dungAgentCoToken({
          id: 'ag-1',
          ten: 'W-builder',
          vai_tro: 'worker',
          token,
          du_an: [pj],
        });
        await dungTicket(pj, 1, 'Dựng nền CLI', { uu_tien: 'high' });
      });

      /**
       * Không một **biến thể** nào của token có mặt trong `chu`.
       *
       * Ba dạng dưới đây viết **tại test**, không lấy từ `bienTheToken`: nếu chỉ
       * lặp qua `bienTheToken` thì bỏ một dạng khỏi mã làm ca này **mất** chính
       * phép kiểm của nó mà vẫn xanh. `bienTheToken` được cộng thêm để dạng nào
       * mã khai là che được thì cũng phải thật sự che được.
       */
      const khongDangNao = (chu: string): void => {
        const phai_chan = [
          token,
          JSON.stringify(token).slice(1, -1),
          encodeURIComponent(token),
          ...bienTheToken(token),
        ];
        for (const dang of phai_chan) expect(chu).not.toContain(dang);
      };

      it('đường THÀNH CÔNG, cả hai chế độ ra: không biến thể nào lọt', async () => {
        for (const ds of [['whoami'], ['whoami', '--json'], ['show', 'SAI-1', '--json'], ['list']]) {
          const b = ban({ BATON_URL: URL_API, BATON_TOKEN: token });
          expect(await chayCli(ds, b.mt)).toBe(MA_THOAT.xong);
          khongDangNao(tatCa(b));
        }
      });

      it('đường LỖI: máy chủ nhắc lại token, cả hai chế độ ra', async () => {
        for (const ds of [['whoami'], ['whoami', '--json']]) {
          const b = ban({ BATON_URL: URL_API, BATON_TOKEN: token }, async () =>
            Response.json(
              { error: 'INVALID_TOKEN', message: `Token "${token}" sai.` },
              { status: 401 },
            ),
          );
          expect(await chayCli(ds, b.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
          khongDangNao(tatCa(b));
          expect(tatCa(b)).toContain(CHE);
        }
      });

      it('đường LỖI: dữ liệu máy chủ mang token ở CHỖ KHÁC trong JSON', async () => {
        /*
         * Không chỉ `message`: một proxy có thể dội lại cả header trong thân. Lưới
         * chắn phải bắt token ở **mọi** chuỗi, kể cả **khoá** của object.
         */
        const b = ban({ BATON_URL: URL_API, BATON_TOKEN: token }, async () =>
          Response.json(
            {
              error: 'INVALID_TOKEN',
              message: 'Token sai.',
              echo: { authorization: `Bearer ${token}`, [token]: 'khoá cũng là chuỗi' },
            },
            { status: 401 },
          ),
        );
        expect(await chayCli(['whoami', '--json'], b.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
        khongDangNao(tatCa(b));
      });

      it('lỗi mạng mang token trong thông điệp runtime', async () => {
        const b = ban({ BATON_URL: URL_API, BATON_TOKEN: token }, () => {
          throw new TypeError(`connect ECONNREFUSED (authorization: Bearer ${token})`);
        });
        expect(await chayCli(['whoami', '--json'], b.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
        khongDangNao(tatCa(b));
      });
    });
  }
});

/**
 * **Lỗi hạ tầng không mang dạng Baton → mã thoát 2**, không phải 1.
 *
 * `quyet-dinh.md` 01/10 đẩy `INTERNAL` lên mã 2 vì "ra mã 1 thì agent tưởng dữ
 * liệu mình gửi sai và đi sửa dữ liệu mãi". Một `502` kèm HTML là đúng ca đó, mà
 * `@baton/client` bản đầu dựng `INVALID_INPUT` ⇒ **mã 1**.
 */
describe('mã thoát của lỗi HẠ TẦNG — SPEC d.380 + quyet-dinh 01/10', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('502 kèm HTML (không phải dạng lỗi Baton) → mã thoát 2, mã lỗi INTERNAL', async () => {
    const b = ban(
      { BATON_URL: URL_API, BATON_TOKEN: TOKEN },
      async () =>
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
    );
    expect(await chayCli(['list', '--json'], b.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(JSON.parse(b.loi.join('\n'))).toMatchObject({ loi: 'INTERNAL' });
  });

  it('200 mà thân không phải JSON → mã thoát 2 (lỗi mạng), không phải 1', async () => {
    const b = ban(
      { BATON_URL: URL_API, BATON_TOKEN: TOKEN },
      async () => new Response('không phải json', { status: 200 }),
    );
    expect(await chayCli(['list'], b.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
  });

  it('5xx mang MÃ NGHIỆP VỤ trong thân vẫn ra mã thoát 2, giữ thông điệp máy chủ', async () => {
    const b = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, async () =>
      Response.json({ error: 'NOT_FOUND', message: 'Một thông điệp lạ.' }, { status: 503 }),
    );
    expect(await chayCli(['list', '--json'], b.mt)).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    const than = JSON.parse(b.loi.join('\n')) as { loi: string; thong_diep: string };
    expect(than.loi).toBe('INTERNAL');
    expect(than.thong_diep).toContain('Một thông điệp lạ.');
  });

  it('4xx dạng Baton KHÔNG đổi nghĩa: 422 vẫn ra mã thoát 1', async () => {
    const b = ban({ BATON_URL: URL_API, BATON_TOKEN: TOKEN }, async () =>
      Response.json({ error: 'INVALID_INPUT', message: 'Dữ liệu sai.' }, { status: 422 }),
    );
    expect(await chayCli(['list', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(JSON.parse(b.loi.join('\n'))).toMatchObject({ loi: 'INVALID_INPUT' });
  });
});

/**
 * **`--help` ở mọi vị trí** — SPEC im lặng; `baton show --help` ra một lỗi là
 * hướng sai (không ai gõ `--help` để mong `INVALID_INPUT`).
 */
describe('baton <lệnh> --help', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('--help SAU tên lệnh ra cách dùng của chính lệnh đó, mã thoát 0', async () => {
    const b = ban();
    expect(await chayCli(['show', '--help'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Cách dùng: baton show <MÃ>');
    expect(b.loi).toEqual([]);
  });

  it('--help của lệnh có tuỳ chọn, và ở chế độ --json', async () => {
    const b = ban();
    expect(await chayCli(['list', '--help', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { lenh: string; cach_dung: string };
    expect(d.lenh).toBe('list');
    expect(d.cach_dung).toContain('baton list');
  });

  it('--help không cần BATON_URL/BATON_TOKEN (chưa gọi máy chủ)', async () => {
    const b = ban({});
    expect(await chayCli(['show', '--help'], b.mt)).toBe(MA_THOAT.xong);
  });

  it('--help với tên lệnh lạ, và --help ở đầu: ra trợ giúp CHUNG', async () => {
    const la = ban();
    expect(await chayCli(['khong-co-lenh-nay', '--help'], la.mt)).toBe(MA_THOAT.xong);
    expect(la.ra.join('\n')).toContain('Lệnh:');

    const dau = ban();
    expect(await chayCli(['--help'], dau.mt)).toBe(MA_THOAT.xong);
    expect(dau.ra.join('\n')).toContain('Lệnh:');
  });
});

/**
 * **Dây nối `process` ↔ `chayCli`** (`noiDay`) — SPEC mục 13 d.380 (mã thoát).
 *
 * Môi trường của dự án **chặn** `node dist/bin.js`, nên không ai chạy được bản
 * thật; một `process` **giả** là cách duy nhất hiện có để kiểm chứng ba việc của
 * dây nối: `argv.slice(2)`, hai luồng ra **có `\n`**, và **`exitCode`** thay vì
 * `exit()` (trên ống, `write` của Node là bất đồng bộ nên `exit()` ngay sau
 * `write` cắt mất đoạn cuối).
 *
 * Ba ca dưới đây **không cần mạng**: trợ giúp, thiếu biến môi trường, lệnh lạ.
 */
describe('noiDay — dây nối tiến trình (SPEC d.380)', () => {
  function tienTrinhGia(doi_so: string[], env: Record<string, string | undefined> = {}) {
    const ra: string[] = [];
    const loi: string[] = [];
    const tt: TienTrinhNode = {
      argv: ['node', '/duong/dan/bin.js', ...doi_so],
      env,
      stdout: { write: (c) => ra.push(c) },
      stderr: { write: (c) => loi.push(c) },
      exitCode: 0,
    };
    return { tt, ra, loi };
  }

  it('bỏ hai đối số đầu của argv, ghi stdout CÓ \\n, đặt exitCode 0', async () => {
    const t = tienTrinhGia(['--help']);
    await noiDay(t.tt);
    expect(t.tt.exitCode).toBe(MA_THOAT.xong);
    expect(t.ra.join('')).toContain('Lệnh:');
    for (const chu of t.ra) expect(chu.endsWith('\n')).toBe(true);
    expect(t.loi).toEqual([]);
  });

  it('thiếu biến môi trường: ĐẶT exitCode 2 và ghi stderr có \\n', async () => {
    const t = tienTrinhGia(['whoami']);
    await noiDay(t.tt);
    expect(t.tt.exitCode).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(t.loi.join('')).toContain('BATON_URL');
    for (const chu of t.loi) expect(chu.endsWith('\n')).toBe(true);
    expect(t.ra).toEqual([]);
  });

  it('lệnh lạ: exitCode 1 — và KHÔNG gọi process.exit (bản giả không có exit)', async () => {
    const t = tienTrinhGia(['khong-co-lenh-nay'], { BATON_URL: URL_API, BATON_TOKEN: TOKEN });
    await noiDay(t.tt);
    expect(t.tt.exitCode).toBe(MA_THOAT.loi_nghiep_vu);
    expect(t.loi.join('')).toContain('INVALID_INPUT');
  });

  it('đọc env qua đúng đối tượng truyền vào, không qua một bảng toàn cục', async () => {
    // Có `BATON_URL` trong `env` của bản giả ⇒ chỉ **thiếu** `BATON_TOKEN`.
    const t = tienTrinhGia(['whoami'], { BATON_URL: URL_API });
    await noiDay(t.tt);
    expect(t.loi.join('')).toContain('Thiếu biến môi trường BATON_TOKEN.');
    expect(t.tt.exitCode).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
  });
});
