/**
 * **Gửi và rút bằng chứng** — SPEC mục 7 d.204–211 (bảng loại), d.213–217 (cổng),
 * d.219–223 (xác minh, rút lại); 19.3 (review khác người làm); 19.7; mục 3 (bảng
 * quyền); mục 13 d.364 (`baton evidence` chờ tối đa 10 giây).
 *
 * Phần 3 lượt 1 cài **luật thuần** + schema (xem `bang-chung.test.ts`). File này
 * là lượt 2: **lệnh** gửi và rút, và **việc xác minh** (d.206, d.207).
 *
 * ## Hai luật của chính file test này
 *
 * 1. **Không gọi mạng, một lần nào.** Nguồn GitHub và nguồn deploy là hai cổng ra
 *    tiêm được (`nguon-github.ts`, `nguon-deploy.ts`); test đặt bảng giả lập qua
 *    `datNguonGiaLap`, và `xac-minh-bang-chung.ts` chỉ nhận bảng đó khi cờ
 *    `CHO_DUONG_TEST` cũng bật. Không `monkey-patch globalThis.fetch` chỗ nào.
 * 2. **Đi đường HTTP thật**, qua cửa ghi thật — không tiêm cổng bằng chứng, không
 *    gọi handler trực tiếp. Lý do: ba chặng của việc gửi bằng chứng (ghi → gọi
 *    mạng → ghi kết luận) **nằm ở ba tầng khác nhau**, nên một test gọi handler
 *    chỉ chứng minh chặng đầu.
 *
 * Mỗi khẳng định "bị từ chối" / "không mở cổng" có một ca **đối chứng** ngay cạnh:
 * cùng dữ liệu, đổi đúng một thứ, rồi đường kia chạy được.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  CHO_THU_LAI_MS,
  THEO_DOI_COMMIT_MS,
  TRAN_XAC_MINH_MS,
} from '@baton/shared';
import {
  HAN_CHE_KHONG_GHIM_DUOC_IP,
  maHttpDat,
  nguonDeployGiaLap,
} from '../src/nguon-deploy.js';
import { khoaCommit, nguonGitHubGiaLap, nguonGitHubThat } from '../src/nguon-github.js';
import {
  canXacMinh,
  tiemNguonXacMinh,
  xacMinhMotBangChung,
  xacMinhTrongHan,
} from '../src/xac-minh-bang-chung.js';
import { repoMacDinhCuaDuAn } from '../src/lenh-bang-chung.js';
import { caQuaSo, choToi, soRequestBay } from './cho-toi.js';
import {
  TOKEN_CHU,
  bangChungTrongDb,
  boNguonGiaLap,
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

// Sổ `bay` (xem chú thích ở `afterEach` dưới) khai ở đầu file vì cả thân mỗi
// ca/`beforeEach` cũng đi qua nó (BAT-54, khuôn BAT-53, xem `caQuaSo`): ca hết giờ
// không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const P_NGOAI = 'pj-OTH';
const TK = 'tk-pj-SAI-1';
const TK2 = 'tk-pj-SAI-2';

/** Bốn vai trò, mỗi vai một token — bảng quyền SPEC mục 3. */
const TOKEN = {
  coordinator: 'bt_t_coord',
  manager: 'bt_t_mgr',
  worker: 'bt_t_wk',
  reviewer: 'bt_t_rv',
  /** `reviewer` thứ hai, **không** là người làm của ticket nào — đối chứng 19.3. */
  reviewer2: 'bt_t_rv2',
  /** `worker` **không được vào dự án** — cửa dự án của bảng quyền mục 3. */
  ngoai: 'bt_t_ngoai',
  /** Agent bị **tắt** — SPEC mục 3. */
  tat: 'bt_t_tat',
} as const;

const ID = {
  coordinator: 'ag-coord',
  manager: 'ag-mgr',
  worker: 'ag-wk',
  reviewer: 'ag-rv',
  reviewer2: 'ag-rv2',
  ngoai: 'ag-ngoai',
  tat: 'ag-tat',
} as const;

const HASH = 'a1b2c3d4e5f6a7b8';
const REPO = 'chu/baton';
const URL_DEPLOY = 'https://baton.example.com/khoe';

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn('SAI', 'Sample');
  await dungDuAn('OTH', 'Dự án khác');
  await dungTicket(P, 1, 'Việc có bằng chứng', { trang_thai: 'verifying' });
  await dungTicket(P, 2, 'Việc thứ hai', { trang_thai: 'verifying' });

  await dungAgentCoToken({ id: ID.coordinator, ten: 'C', vai_tro: 'coordinator', token: TOKEN.coordinator, du_an: [P] });
  await dungAgentCoToken({ id: ID.manager, ten: 'M', vai_tro: 'manager', token: TOKEN.manager, du_an: [P] });
  await dungAgentCoToken({ id: ID.worker, ten: 'W', vai_tro: 'worker', token: TOKEN.worker, du_an: [P] });
  await dungAgentCoToken({ id: ID.reviewer, ten: 'R', vai_tro: 'reviewer', token: TOKEN.reviewer, du_an: [P] });
  await dungAgentCoToken({ id: ID.reviewer2, ten: 'R2', vai_tro: 'reviewer', token: TOKEN.reviewer2, du_an: [P] });
  await dungAgentCoToken({ id: ID.ngoai, ten: 'N', vai_tro: 'worker', token: TOKEN.ngoai, du_an: [P_NGOAI] });
  await dungAgentCoToken({ id: ID.tat, ten: 'T', vai_tro: 'worker', token: TOKEN.tat, du_an: [P], disabled: true });

  // Nguồn **giả lập** là mặc định của mọi ca: không ca nào được chạm mạng thật.
  datNguonGiaLap({
    commit: { [khoaCommit(REPO, HASH)]: 'merged' },
    deploy: { [URL_DEPLOY]: 200 },
  });
});

/*
 * **Sổ các request còn đang bay** (BAT-13, mẫu `cho-dai.test.ts`): ba ca gửi bằng
 * chứng không await ngay — ca "KIẾN TRÚC" (nguồn deploy chậm 2 giây, ca DUY NHẤT qua
 * HTTP còn dùng nguồn ngủ thật: con số 2 giây chính là thứ ca đó đo) và hai ca d.222
 * (RÚT / ĐỐI CHỨNG không rút) với nguồn giả CHẶN tới khi ca thả cửa (BAT-54, BAT-55).
 * Assert ở giữa đỏ thì request bị bỏ rơi còn gọi nguồn giả và ghi D1 sau khi pool đã
 * pop storage cô lập của ca. `afterEach` chờ hết. Sổ khai ở đầu file (`bay`, BAT-54).
 * (Ca "nguồn chậm hơn trần" của d.219 gọi `xacMinhTrongHan` trực tiếp, không qua
 * HTTP, nên không ở trong sổ.)
 */
afterEach(async () => {
  await bay.doiHet();
}, 30_000);

/** Gửi bằng chứng qua HTTP — đúng đường `baton evidence` của mục 13 d.364. */
function gui(
  token: string,
  than: Record<string, unknown>,
  ticket_id = TK,
): Promise<Response> {
  return bay.theoDoi(goiApi(`/v1/ticket/${ticket_id}/bang-chung`, token, { method: 'POST', than }));
}

function rut(token: string, bang_chung_id: string, ly_do?: string): Promise<Response> {
  return goiApi(`/v1/bang-chung/${bang_chung_id}/rut`, token, {
    method: 'POST',
    than: ly_do === undefined ? {} : { ly_do },
  });
}

/* ================================================================== *
 * A. Bảng quyền — SPEC mục 3 ("Nộp bằng chứng": có cho cả bốn vai trò)
 * ================================================================== */

describe('mục 3 — hàng "Nộp bằng chứng"', () => {
  it.each(['coordinator', 'manager', 'worker', 'reviewer'] as const)(
    'vai %s nộp được bằng chứng (ô "có" của bảng mục 3)',
    async (vai) => {
      const res = await gui(TOKEN[vai], { loai_bang_chung: 'note', noi_dung: `từ ${vai}` });
      expect(res.status).toBe(201);
      const b = await res.json<Record<string, unknown>>();
      expect(b['loai']).toBe('note');
      // Bốn loại không có bước xác minh — d.209–211 + d.208.
      expect(b['xac_minh']).toBe('not_required');
      expect(b['can_xac_minh']).toBe(false);
    },
  );

  it('chủ nộp được bằng chứng, và dòng ghi `nguoi_gui_loai = owner`', async () => {
    const res = await gui(TOKEN_CHU, { loai_bang_chung: 'note', noi_dung: 'của chủ' });
    expect(res.status).toBe(201);
    const id = (await res.json<{ id: string }>()).id;
    const d = await bangChungTrongDb(id);
    expect(d?.nguoi_gui_loai).toBe('owner');
    expect(d?.nguoi_gui_agent_id).toBeNull();
  });

  it('agent gửi thì dòng ghi ĐÚNG agent đó (d.222 cần biết ai gửi để cho rút)', async () => {
    const res = await gui(TOKEN.worker, { loai_bang_chung: 'note', noi_dung: 'của worker' });
    const id = (await res.json<{ id: string }>()).id;
    const d = await bangChungTrongDb(id);
    expect(d?.nguoi_gui_loai).toBe('agent');
    expect(d?.nguoi_gui_agent_id).toBe(ID.worker);
  });

  // BAT-58 (19.12 câu 15, `cau-hoi-spec.md` #176): trước ghim 403 FORBIDDEN; nay
  // ticket ngoài phạm vi ra 404 NOT_FOUND giống hệt id bịa (403 cho id thật là máy dò).
  it('CỬA DỰ ÁN: agent không được vào dự án → 404 giống hệt id bịa (BAT-58); ĐỐI CHỨNG cùng vai trò được vào → 201', async () => {
    const xau = await gui(TOKEN.ngoai, { loai_bang_chung: 'note', noi_dung: 'x' });
    const bia = await gui(TOKEN.ngoai, { loai_bang_chung: 'note', noi_dung: 'x' }, 'tk-khong-co');
    expect(xau.status).toBe(404);
    expect(await xau.json()).toEqual(await bia.json());

    const tot = await gui(TOKEN.worker, { loai_bang_chung: 'note', noi_dung: 'x' });
    expect(tot.status).toBe(201);
  });

  it('agent đã bị TẮT → 403 (SPEC mục 3)', async () => {
    const res = await gui(TOKEN.tat, { loai_bang_chung: 'note', noi_dung: 'x' });
    expect(res.status).toBe(403);
    expect((await res.json<{ message: string }>()).message).toMatch(/bị tắt/);
  });

  it('dự án đã LƯU TRỮ là chỉ đọc → `PROJECT_NOT_ACCEPTING`; ĐỐI CHỨNG dự án `paused` thì VẪN nộp được', async () => {
    await env.DB.prepare('UPDATE project SET trang_thai = ? WHERE id = ?')
      .bind('archived', P)
      .run();
    const xau = await gui(TOKEN_CHU, { loai_bang_chung: 'note', noi_dung: 'x' });
    expect(xau.status).toBe(409);
    expect((await xau.json<{ error: string }>()).error).toBe('PROJECT_NOT_ACCEPTING');

    // `paused` chỉ chặn **việc mới** (mục 2); bằng chứng là phần cuối của một
    // việc đã đang chạy, nên chặn nó là khoá một ticket gần xong lại mãi.
    await env.DB.prepare('UPDATE project SET trang_thai = ? WHERE id = ?').bind('paused', P).run();
    expect((await gui(TOKEN_CHU, { loai_bang_chung: 'note', noi_dung: 'x' })).status).toBe(201);
  });

  it('ticket không có, hoặc ở workspace khác → 404 (mục 13: không lộ sự tồn tại)', async () => {
    const res = await gui(TOKEN_CHU, { loai_bang_chung: 'note', noi_dung: 'x' }, 'tk-khong-co');
    expect(res.status).toBe(404);
  });
});

/* ================================================================== *
 * B. Kiểm nội dung đi qua cửa ghi — d.204–211
 * ================================================================== */

describe('d.204–211 — kiểm nội dung ngay trong cửa ghi', () => {
  it('loại lạ → `INVALID_INPUT`/422', async () => {
    const res = await gui(TOKEN_CHU, { loai_bang_chung: 'screenshot' });
    expect(res.status).toBe(422);
    expect((await res.json<{ message: string }>()).message).toMatch(/Loại bằng chứng/);
  });

  it('d.206: commit KHÔNG ghi repo → từ chối, vì hồ sơ dự án chưa có repo (phần 4)', async () => {
    // Chốt cài đặt: `repoMacDinhCuaDuAn` trả `null` cho tới phần 4, nên bằng
    // chứng commit **phải** ghi repo. Hướng đóng: đoán repo là xác minh trên
    // repo của người khác.
    expect(await repoMacDinhCuaDuAn(env.DB, P)).toBeNull();
    const res = await gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: HASH });
    expect(res.status).toBe(422);
    expect((await res.json<{ message: string }>()).message).toMatch(/hồ sơ dự án chưa ghi repo/);

    // ĐỐI CHỨNG: cùng lệnh, có repo → 201.
    expect((await gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO })).status).toBe(201);
  });

  it('d.206: hash ngắn hơn 7 ký tự → từ chối; ĐỐI CHỨNG đúng 7 ký tự → nhận', async () => {
    const xau = await gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: 'a1b2c3', repo: REPO });
    expect(xau.status).toBe(422);
    expect((await xau.json<{ message: string }>()).message).toMatch(/ít nhất 7 ký tự/);

    datNguonGiaLap({ commit: { [khoaCommit(REPO, 'a1b2c3d')]: 'merged' } });
    expect((await gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: 'a1b2c3d', repo: REPO })).status).toBe(201);
  });

  it('d.207: URL `http://` bị từ chối ngay trong cửa ghi; ĐỐI CHỨNG `https://` → nhận', async () => {
    const xau = await gui(TOKEN_CHU, { loai_bang_chung: 'deploy', url: 'http://baton.example.com/' });
    expect(xau.status).toBe(422);
    expect((await xau.json<{ message: string }>()).message).toMatch(/https/);
    expect((await gui(TOKEN_CHU, { loai_bang_chung: 'deploy', url: URL_DEPLOY })).status).toBe(201);
  });

  it('d.207: URL trỏ vào máy chủ metadata cloud bị từ chối TRƯỚC khi ghi dòng nào', async () => {
    const res = await gui(TOKEN_CHU, {
      loai_bang_chung: 'deploy',
      url: 'https://169.254.169.254/latest/meta-data/',
    });
    expect(res.status).toBe(422);
    // Không có dòng `evidence` nào được ghi: một URL SSRF không được để lại dấu
    // vết "đã nhận" nào trong bảng.
    const dem = await env.DB.prepare('SELECT count(*) AS n FROM evidence').first<{ n: number }>();
    expect(dem?.n).toBe(0);
  });

  it('19.12 câu 5: mã phiên bản được LƯU y nguyên, server không kiểm', async () => {
    const res = await gui(TOKEN_CHU, {
      loai_bang_chung: 'deploy',
      url: URL_DEPLOY,
      ma_phien_ban: 'không phải hex, có dấu!',
    });
    const id = (await res.json<{ id: string }>()).id;
    expect((await bangChungTrongDb(id))?.ma_phien_ban).toBe('không phải hex, có dấu!');
  });

  it('WHITELIST: client tự khai `xac_minh: merged` thì bị BỎ QUA, dòng theo kết luận thật', async () => {
    /*
     * Ca canh quan trọng nhất của cả file: ai khai được `xac_minh` thì tự mở được
     * cổng Xong (d.206 + d.214). `xac_minh` không nằm trong `TRUONG_CLIENT`, nên
     * tầng HTTP bỏ nó và báo lại trong `bo_qua`.
     */
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });
    const res = await gui(TOKEN_CHU, {
      loai_bang_chung: 'commit',
      commit_hash: HASH,
      repo: REPO,
      xac_minh: 'merged',
      so_lan_thu: 99,
    });
    const b = await res.json<{ id: string; xac_minh: string; bo_qua?: string[] }>();
    expect(b.bo_qua).toEqual(expect.arrayContaining(['xac_minh', 'so_lan_thu']));
    expect(b.xac_minh).toBe('pushed');
    expect((await bangChungTrongDb(b.id))?.xac_minh).toBe('pushed');
  });
});

/* ================================================================== *
 * C. d.206 — xác minh commit qua GitHub API (nguồn giả lập)
 * ================================================================== */

describe('d.206 — commit: merged / pushed / không tìm thấy', () => {
  async function guiCommit(tinh_trang: 'merged' | 'pushed' | 'khong_thay' | { loi: string }) {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: tinh_trang } });
    const res = await gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
    const b = await res.json<Record<string, unknown>>();
    return { res, b, d: await bangChungTrongDb(b['id'] as string) };
  }

  it('truy cập được từ NHÁNH MẶC ĐỊNH → `merged`', async () => {
    const { res, b, d } = await guiCommit('merged');
    expect(res.status).toBe(201);
    expect(b['xac_minh']).toBe('merged');
    expect(d?.xac_minh).toBe('merged');
    // Đã kết luận → không còn mốc thử lại, không theo dõi 7 ngày.
    expect(d?.thu_lai_luc).toBeNull();
    expect(d?.theo_doi_den_luc).toBeNull();
    expect(d?.ly_do).toBeNull();
  });

  it('chỉ có trên NHÁNH KHÁC → `pushed`, và đặt mốc theo dõi 7 ngày (19.7, d.221)', async () => {
    const truoc = Date.now();
    const { b, d } = await guiCommit('pushed');
    expect(b['xac_minh']).toBe('pushed');
    expect(d?.xac_minh).toBe('pushed');
    expect(d?.theo_doi_den_luc).toBeGreaterThanOrEqual(truoc + THEO_DOI_COMMIT_MS);
    // `pushed` là một **kết luận**, không phải lỗi mạng → không thử lại 5 phút.
    expect(d?.thu_lai_luc).toBeNull();
  });

  it('KHÔNG TÌM THẤY → `failed` kèm lý do bằng chữ, KHÔNG thử lại (19.7)', async () => {
    const { b, d } = await guiCommit('khong_thay');
    expect(b['xac_minh']).toBe('failed');
    expect(d?.xac_minh).toBe('failed');
    expect(d?.ly_do).toMatch(/Không tìm thấy commit/);
    // 19.7: "Server **chỉ** tự thử lại khi lỗi là lỗi mạng hoặc lỗi GitHub."
    expect(d?.thu_lai_luc).toBeNull();
  });

  it('LỖI MẠNG → ở lại `pending` + mốc thử lại sau 5 PHÚT, `so_lan_thu` vẫn 0 (d.220)', async () => {
    const truoc = Date.now();
    const { b, d } = await guiCommit({ loi: 'GitHub API trả mã 502.' });
    expect(b['xac_minh']).toBe('pending');
    expect(d?.xac_minh).toBe('pending');
    expect(d?.ly_do).toMatch(/502/);
    expect(d?.thu_lai_luc).toBeGreaterThanOrEqual(truoc + CHO_THU_LAI_MS);
    /*
     * d.220 đếm "tự thử **lại**", và lần chạy ngay khi gửi không phải một lần thử
     * lại — nên `so_lan_thu` vẫn 0 và Cron của lượt 3 còn đủ 3 lần.
     */
    expect(d?.so_lan_thu).toBe(0);
  });

  it('ĐỐI CHỨNG ba kết luận là BA trạng thái khác nhau (không phải một hằng số)', async () => {
    const a = await guiCommit('merged');
    const b = await guiCommit('pushed');
    const c = await guiCommit('khong_thay');
    expect(new Set([a.d?.xac_minh, b.d?.xac_minh, c.d?.xac_minh]).size).toBe(3);
  });

  it('d.220: THIẾU token GitHub → `pending` kèm lý do, KHÔNG nổ và KHÔNG gọi mạng', async () => {
    /*
     * Bỏ nguồn giả lập để đi đúng `nguonGitHubThat(undefined)`. Nó trả `{ loi }`
     * **trước** mọi lần `fetch`, nên ca này vẫn không chạm mạng.
     */
    boNguonGiaLap();
    try {
      const res = await gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
      expect(res.status).toBe(201);
      const b = await res.json<{ id: string; xac_minh: string }>();
      expect(b.xac_minh).toBe('pending');
      const d = await bangChungTrongDb(b.id);
      expect(d?.ly_do).toMatch(/token GitHub/i);
      expect(d?.thu_lai_luc).not.toBeNull();
    } finally {
      datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
    }
  });

  it('d.223 "KHÔNG tự quét repo": nguồn chỉ được hỏi ĐÚNG hash và repo đã gửi', async () => {
    const da_hoi: string[] = [];
    const nguon = {
      github: {
        tinhTrangCommit(repo: string, hash: string) {
          da_hoi.push(khoaCommit(repo, hash));
          return Promise.resolve({ tinh_trang: 'merged' as const });
        },
      },
      deploy: nguonDeployGiaLap(),
    };
    await xacMinhMotBangChung(
      { loai: 'commit', commit_hash: HASH, repo: REPO, merged_cuc_bo: false },
      nguon,
    );
    expect(da_hoi).toEqual([khoaCommit(REPO, HASH)]);
  });

  it('nguồn GitHub THẬT không có token: trả lỗi, không gọi `fetch` lần nào', async () => {
    // Giao diện hẹp nên ca này kiểm được bản thật mà không cần mạng: thiếu token
    // là một nhánh **trước** `fetch`.
    const ra = await nguonGitHubThat(undefined).tinhTrangCommit(REPO, HASH);
    expect(ra).toEqual({ loi: expect.stringMatching(/GITHUB_TOKEN/) });
  });

  it('nguồn GitHub THẬT: repo sai hình dạng → `khong_thay`, không gọi mạng', async () => {
    const ra = await nguonGitHubThat('bt_token_gia').tinhTrangCommit('không-phải/repo/hợp-lệ', HASH);
    expect(ra).toEqual({ tinh_trang: 'khong_thay' });
  });
});

/* ================================================================== *
 * D. d.207 — xác minh deploy
 * ================================================================== */

describe('d.207 — deploy: 2xx hoặc 3xx là đạt', () => {
  async function guiDeploy(ket: number | { loi: string }) {
    datNguonGiaLap({ deploy: { [URL_DEPLOY]: ket } });
    const res = await gui(TOKEN_CHU, { loai_bang_chung: 'deploy', url: URL_DEPLOY });
    const b = await res.json<Record<string, unknown>>();
    return { b, d: await bangChungTrongDb(b['id'] as string) };
  }

  it.each([200, 201, 204, 299])('mã %i (2xx) → `passed`', async (ma) => {
    const { b, d } = await guiDeploy(ma);
    expect(b['xac_minh']).toBe('passed');
    expect(d?.xac_minh).toBe('passed');
    expect(d?.ma_http).toBe(ma);
  });

  it.each([301, 302, 307, 308, 399])('mã %i (3xx) → `passed` (đúng chữ SPEC: 3xx LÀ đạt)', async (ma) => {
    const { b, d } = await guiDeploy(ma);
    expect(b['xac_minh']).toBe('passed');
    expect(d?.ma_http).toBe(ma);
  });

  it.each([400, 404, 418, 500, 503])('mã %i (4xx/5xx) → `failed`, lưu lại mã để chủ thấy VÌ SAO', async (ma) => {
    const { b, d } = await guiDeploy(ma);
    expect(b['xac_minh']).toBe('failed');
    expect(d?.xac_minh).toBe('failed');
    expect(d?.ma_http).toBe(ma);
    expect(d?.ly_do).toMatch(new RegExp(String(ma)));
  });

  it('LỖI MẠNG → `pending` + mốc thử lại (d.220), KHÔNG `failed`', async () => {
    const truoc = Date.now();
    const { b, d } = await guiDeploy({ loi: 'Không gọi được URL deploy.' });
    expect(b['xac_minh']).toBe('pending');
    expect(d?.thu_lai_luc).toBeGreaterThanOrEqual(truoc + CHO_THU_LAI_MS);
    expect(d?.ma_http).toBeNull();
  });

  it('`maHttpDat` là luật d.207 ở dạng thuần: biên 199/200 và 399/400', () => {
    expect(maHttpDat(199)).toBe(false);
    expect(maHttpDat(200)).toBe(true);
    expect(maHttpDat(399)).toBe(true);
    expect(maHttpDat(400)).toBe(false);
  });

  it('#57: nguồn deploy THẬT từ chối IP nội bộ ngay trước lúc gọi (không tin chặng trước)', async () => {
    // Cron thử lại của lượt 3 đọc URL **từ DB** và đi thẳng vào nguồn, không qua
    // `kiemBangChungDeploy` nữa — nên chặng cuối phải tự kiểm.
    const { nguonDeployThat } = await import('../src/nguon-deploy.js');
    const nguon = nguonDeployThat();
    expect(await nguon.goiUrl('https://127.0.0.1/')).toEqual({
      loi: expect.stringMatching(/localhost hay IP nội bộ/),
    });
    expect(await nguon.goiUrl('http://baton.example.com/')).toEqual({
      loi: expect.stringMatching(/localhost hay IP nội bộ/),
    });
    expect(await nguon.goiUrl('không-phải-url')).toEqual({
      loi: expect.stringMatching(/không đọc được/),
    });
  });

  /* ---------------------------------------------------------------- *
   * Lượt 2 sửa review: khoá ba chốt an toàn của #57 bằng test
   * ---------------------------------------------------------------- *
   * `redirect: 'manual'` là lớp chặn SSRF **thật** duy nhất chống
   * `302 → 169.254.169.254`, mà trước lượt này bỏ nó đi thì không test nào đỏ.
   * Khoá nó **không gọi mạng**: tiêm một `fetch` giả qua `tuy_chon.goc` và đo
   * đúng đối tượng tuỳ chọn mà bản thật truyền vào.
   */
  describe('#57: ba chốt an toàn của lần gọi deploy, đo mà KHÔNG ra mạng', () => {
    /** Một `fetch` giả: ghi lại tham số, trả một `Response` có body đo được. */
    function fetchGia(): {
      goc: typeof fetch;
      da_goi: { url: string; tuy_chon: RequestInit | undefined }[];
      daHuyBody: () => boolean;
    } {
      const da_goi: { url: string; tuy_chon: RequestInit | undefined }[] = [];
      let da_huy = false;
      const goc = ((url: string, tuy_chon?: RequestInit) => {
        da_goi.push({ url, tuy_chon });
        // Thân phản hồi **có thật**, và nó báo lại khi bị huỷ: đó là cách duy
        // nhất phân biệt "không đọc body" với "đọc rồi bỏ".
        const than = new ReadableStream<Uint8Array>({
          cancel() {
            da_huy = true;
          },
        });
        return Promise.resolve(new Response(than, { status: 200 }));
      }) as unknown as typeof fetch;
      return { goc, da_goi, daHuyBody: () => da_huy };
    }

    it('chốt 1+2: tuỳ chọn truyền cho `fetch` có `redirect: manual`, `method: GET` và `signal` (hạn cứng)', async () => {
      const { nguonDeployThat } = await import('../src/nguon-deploy.js');
      const gia = fetchGia();
      const kq = await nguonDeployThat({ goc: gia.goc }).goiUrl(URL_DEPLOY);

      expect(kq).toEqual({ ma_http: 200 });
      expect(gia.da_goi).toHaveLength(1);
      expect(gia.da_goi[0]?.url).toBe(URL_DEPLOY);
      const tc = gia.da_goi[0]?.tuy_chon;
      // Ca canh: bỏ `redirect: 'manual'` đi là ĐỎ ở đây. Theo chuyển hướng thì
      // một URL công khai trả `302 Location: http://169.254.169.254/…` và lần
      // gọi thứ hai đi thẳng vào máy chủ metadata.
      expect(tc?.redirect).toBe('manual');
      // `GET`, không `POST`: một lần kiểm "URL còn sống" không được là một lần
      // ghi lên dịch vụ của người khác.
      expect(tc?.method).toBe('GET');
      // Hạn **cứng**: không có `signal` thì một URL treo giữ một lần gọi mãi.
      expect(tc?.signal).toBeTruthy();
    });

    it('chốt 2: KHÔNG đọc body — thân phản hồi bị `cancel()` sau khi `goiUrl` trả về', async () => {
      const { nguonDeployThat } = await import('../src/nguon-deploy.js');
      const gia = fetchGia();
      await nguonDeployThat({ goc: gia.goc }).goiUrl(URL_DEPLOY);
      expect(gia.daHuyBody()).toBe(true);
    });

    it('chốt 3: host bị chặn thì KHÔNG gọi `fetch` lần nào (kiểm trước, không sau)', async () => {
      const { nguonDeployThat } = await import('../src/nguon-deploy.js');
      const gia = fetchGia();
      const nguon = nguonDeployThat({ goc: gia.goc });
      expect(await nguon.goiUrl('https://169.254.169.254/latest/meta-data/')).toEqual({
        loi: expect.stringMatching(/localhost hay IP nội bộ/),
      });
      // #58: hậu tố chỉ-nội-bộ cũng phải dừng **trước** `fetch`.
      expect(await nguon.goiUrl('https://metadata.google.internal/')).toEqual({
        loi: expect.stringMatching(/localhost hay IP nội bộ/),
      });
      expect(gia.da_goi).toHaveLength(0);
    });
  });

  it('#57: hạn chế "không ghim được IP" được VIẾT RA, không im lặng', () => {
    // Ca canh: gỡ lời cảnh báo này đi là test đỏ. SPEC d.207 chỉ chặn được cú
    // pháp host; tên miền công khai trỏ tới IP nội bộ vẫn qua được.
    expect(HAN_CHE_KHONG_GHIM_DUOC_IP).toMatch(/không cho phân giải DNS hay ghim IP/);
    expect(HAN_CHE_KHONG_GHIM_DUOC_IP).toMatch(/#57/);
  });
});

/* ================================================================== *
 * E. d.219 — trần 10 giây, và kiến trúc "không chặn hàng đợi ghi"
 * ================================================================== */

describe('d.219 — trả kết quả trong tối đa 10 giây', () => {
  it('trần là 10 giây, đúng chữ SPEC', () => {
    expect(TRAN_XAC_MINH_MS).toBe(10_000);
  });

  it('nguồn chậm hơn trần → `pending` kèm lý do "chưa xong trong N giây", KHÔNG treo', async () => {
    const kq = await xacMinhTrongHan(
      { loai: 'commit', commit_hash: HASH, repo: REPO, merged_cuc_bo: false },
      { github: nguonGitHubGiaLap({ cham_ms: 5_000 }), deploy: nguonDeployGiaLap() },
      200,
    );
    expect(kq.xac_minh).toBe('pending');
    expect(kq.ly_do).toMatch(/chưa xong trong/);
  });

  it('ĐỐI CHỨNG: nguồn trả lời trong hạn → kết luận thật, không phải `pending`', async () => {
    const kq = await xacMinhTrongHan(
      { loai: 'commit', commit_hash: HASH, repo: REPO, merged_cuc_bo: false },
      {
        github: nguonGitHubGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } }),
        deploy: nguonDeployGiaLap(),
      },
      1_000,
    );
    expect(kq.xac_minh).toBe('merged');
  });

  it('`canXacMinh`: chỉ `commit` và `deploy`, bốn loại kia thì không', () => {
    expect(canXacMinh('commit')).toBe(true);
    expect(canXacMinh('deploy')).toBe(true);
    for (const l of ['review', 'test', 'file', 'note'] as const) {
      expect(canXacMinh(l), l).toBe(false);
    }
  });

  /**
   * **Luật kiến trúc, không phải luật SPEC — nhưng là thứ giữ cho d.219 đúng với
   * cả workspace.**
   *
   * `WorkspaceGate` là **một** Durable Object cho mỗi workspace và nó chạy **đơn
   * luồng**. Nếu lần gọi mạng của việc xác minh chạy **bên trong** DO thì một
   * bằng chứng chậm treo hàng đợi ghi của **mọi** agent trong workspace.
   *
   * Ca này đo đúng chuyện đó: một bằng chứng deploy với nguồn chậm 2 giây, và
   * **song song** một lệnh ghi khác (bình luận) trên cùng workspace. Lệnh thứ hai
   * phải xong **sớm**. Chạy xác minh trong DO thì nó phải chờ hết 2 giây — tức
   * đây là một ca **đối chứng tự thân**: con số đo được phân biệt hai kiến trúc.
   */
  it('KIẾN TRÚC: một lần xác minh CHẬM không chặn hàng đợi ghi của workspace', async () => {
    datNguonGiaLap({ deploy: { [URL_DEPLOY]: 200 }, cham_ms: 2_000 });

    const bat_dau = Date.now();
    const cham = gui(TOKEN_CHU, { loai_bang_chung: 'deploy', url: URL_DEPLOY });

    // Một lệnh GHI khác, trên **cùng** workspace (nên cùng một DO cửa ghi).
    const khac = await goiApi(`/v1/ticket/${TK2}/binh-luan`, TOKEN_CHU, {
      method: 'POST',
      than: { noi_dung: 'Lệnh ghi khác, không được phải chờ xác minh' },
    });
    const cho_den_khi_xong_lenh_khac = Date.now() - bat_dau;

    expect(khac.status).toBe(201);
    // Dưới một nửa thời gian chờ của nguồn chậm: nếu `fetch` chạy trong DO thì
    // con số này ≥ 2000.
    expect(cho_den_khi_xong_lenh_khac).toBeLessThan(1_000);

    // Và bằng chứng chậm vẫn kết luận đúng, chỉ về sau.
    const res = await cham;
    expect(res.status).toBe(201);
    const b = await res.json<{ xac_minh: string }>();
    expect(b.xac_minh).toBe('passed');
    /*
     * **Chỉ để chứng minh nguồn chậm THẬT đã chạy**, không mang luật nào — nên có
     * **biên 100 ms**: `setTimeout` của workerd dưới tải về sớm vài chục ms so với
     * 2000. Phần mang luật là `cho_den_khi_xong_lenh_khac < 1_000` ở trên (lệch hẳn
     * so với 2000, **không** nới) và `xac_minh === 'passed'`. Cùng biên, cùng lý do
     * với ca "KIẾN TRÚC" của `cron-bang-chung.test.ts`.
     */
    expect(Date.now() - bat_dau).toBeGreaterThanOrEqual(1_900);
  });

  it('kết luận xác minh KHÔNG là một lệnh của `BanDoLenh` (không có đường HTTP nào tới nó)', async () => {
    const { SO_DANG_KY_HANDLER } = await import('../src/lenh.js');
    // Ca canh: thêm `ghi_xac_minh` vào sổ đăng ký là mở một đường mà client có
    // thể gõ vào để tự khai `xac_minh: merged` — tức tự mở cổng Xong (d.214).
    expect(Object.keys(SO_DANG_KY_HANDLER)).not.toContain('ghi_xac_minh');
    expect(Object.keys(SO_DANG_KY_HANDLER)).toContain('gui_bang_chung');
  });
});

/* ================================================================== *
 * F. d.208 + 19.3 — `review`: vai trò VÀ danh tính
 * ================================================================== */

describe('d.208 + 19.3 — review: vai trò `reviewer`, và KHÁC người làm', () => {
  it('vai `reviewer` ghi được kết luận review', async () => {
    const res = await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' });
    expect(res.status).toBe(201);
    const d = await bangChungTrongDb((await res.json<{ id: string }>()).id);
    expect(d?.loai).toBe('review');
  });

  /*
   * `manager` **không** còn trong danh sách này từ 13/10 — xem khối "chặn 3"
   * dưới; `coordinator` cũng không từ 14/10 (ca riêng trong `cong-xong-dung-that`).
   * `worker` vẫn bị từ chối, và đó là ca canh: nếu một lượt sau nới cả bảng thì
   * dòng này đỏ.
   */
  it.each(['worker'] as const)(
    'vai %s KHÔNG ghi được kết luận review (hàng "Ghi kết quả review" của mục 3)',
    async (vai) => {
      const res = await gui(TOKEN[vai], { loai_bang_chung: 'review', ket_luan: 'pass' });
      expect(res.status).toBe(403);
      expect((await res.json<{ message: string }>()).message).toMatch(/Ghi kết quả review/);
      // ĐỐI CHỨNG: cùng agent, loại `note` → nộp được (hàng "Nộp bằng chứng").
      expect((await gui(TOKEN[vai], { loai_bang_chung: 'note', noi_dung: 'x' })).status).toBe(201);
    },
  );

  it('19.3 d.496: reviewer LÀ người nhận một lượt `work` của ticket → `REVIEWER_IS_WORKER`/422', async () => {
    await dungLuotGiao('lg-1', TK, ID.reviewer, { loai: 'work', trang_thai: 'accepted' });
    const res = await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' });
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('REVIEWER_IS_WORKER');

    // ĐỐI CHỨNG 1: một reviewer KHÁC, không có lượt `work` nào → 201.
    expect((await gui(TOKEN.reviewer2, { loai_bang_chung: 'review', ket_luan: 'pass' })).status).toBe(201);
    // ĐỐI CHỨNG 2: chính agent đó, nhưng trên ticket KHÁC (không có lượt) → 201.
    expect((await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' }, TK2)).status).toBe(201);
  });

  it('19.3 "bất kỳ lượt `work` nào": kể cả lượt đã HUỶ vẫn tính là người làm', async () => {
    await dungLuotGiao('lg-huy', TK, ID.reviewer, { loai: 'work', trang_thai: 'canceled' });
    expect((await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' })).status).toBe(422);
  });

  it('lượt `review` KHÔNG làm người gửi thành "người làm" (chỉ lượt `work` tính)', async () => {
    await dungLuotGiao('lg-rv', TK, ID.reviewer, { loai: 'review', trang_thai: 'in_progress' });
    expect((await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' })).status).toBe(201);
  });

  it('CHỦ gửi review được dù ticket có người làm (chủ không bao giờ là người nhận lượt)', async () => {
    await dungLuotGiao('lg-w', TK, ID.worker, { loai: 'work' });
    expect((await gui(TOKEN_CHU, { loai_bang_chung: 'review', ket_luan: 'pass' })).status).toBe(201);
  });

  it('review KHÔNG tự mở cổng: `review` một mình thì ticket vẫn không vào Xong được', async () => {
    await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' });
    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('EVIDENCE_REQUIRED');
  });
});

/* ================================================================== *
 * G. Cổng Xong đi hết ba chặng — d.213–215
 * ================================================================== */

describe('cổng Xong qua đường HTTP thật, từ lúc gửi bằng chứng', () => {
  it('commit `merged` + review ĐẠT của reviewer khác người làm → ticket vào XONG', async () => {
    await dungLuotGiao('lg-w', TK, ID.worker, { loai: 'work', trang_thai: 'accepted' });

    const c = await gui(TOKEN.worker, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
    expect((await c.json<{ xac_minh: string }>()).xac_minh).toBe('merged');
    expect((await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' })).status).toBe(201);

    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('ĐỐI CHỨNG: cùng dữ liệu, commit chỉ `pushed` → `EVIDENCE_REQUIRED` (d.206, d.214)', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });
    await gui(TOKEN.worker, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
    await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' });

    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('EVIDENCE_REQUIRED');
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('TẦNG CỔNG: review ĐẠT do CHÍNH người làm gửi (vào DB không qua cửa ghi) → không mở cổng', async () => {
    /*
     * Lớp thứ nhất (`REVIEWER_IS_WORKER`) chặn ở lệnh gửi. Lớp thứ hai là cổng.
     * Ca này dựng đúng tình huống lớp thứ nhất **không chạy**: dòng `evidence`
     * vào DB bằng fixture (như migration hay nhập dữ liệu của mục 16 vẫn làm),
     * rồi mới có lượt `work` cho chính người gửi đó.
     */
    await gui(TOKEN.worker, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
    await dungBangChung('ev-rv-sai', TK, 'review', {
      ket_luan: 'pass',
      nguoi_gui_agent_id: ID.reviewer,
      gui_luc: Date.now() + 1_000,
    });
    await dungLuotGiao('lg-w', TK, ID.reviewer, { loai: 'work', trang_thai: 'accepted' });

    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(422);
    expect(await trangThaiCua(TK)).toBe('verifying');

    // ĐỐI CHỨNG: thêm một review của reviewer KHÁC → cổng mở.
    await dungBangChung('ev-rv-dung', TK, 'review', {
      ket_luan: 'pass',
      nguoi_gui_agent_id: ID.reviewer2,
      gui_luc: Date.now() + 2_000,
    });
    const sau = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(sau.status).toBe(200);
  });

  it('deploy `passed` cũng mở cổng (d.214 "hoặc deploy đạt")', async () => {
    datNguonGiaLap({ deploy: { [URL_DEPLOY]: 302 } });
    await gui(TOKEN.worker, { loai_bang_chung: 'deploy', url: URL_DEPLOY });
    await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' });
    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(200);
  });

  /**
   * **19.7: một bằng chứng `failed` KHÔNG chặn ticket vĩnh viễn.**
   *
   * Không có mã nào chặn hôm nay, nên ca này là một **ca canh**: lượt sau mà ai
   * thêm một lần kiểm kiểu "ticket đã có bằng chứng `failed` thì không nhận nữa"
   * là đỏ ở đây, chứ không phá một luật im lặng.
   */
  it('19.7: commit `failed` rồi gửi LẠI một commit `merged` trên cùng ticket → 201 và cổng MỞ', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const xau = await gui(TOKEN.worker, {
      loai_bang_chung: 'commit',
      commit_hash: HASH,
      repo: REPO,
    });
    expect(xau.status).toBe(201);
    expect((await xau.json<{ xac_minh: string }>()).xac_minh).toBe('failed');

    const HASH_SAU = 'b9c8d7e6f5a4b3c2';
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH_SAU)]: 'merged' } });
    const tot = await gui(TOKEN.worker, {
      loai_bang_chung: 'commit',
      commit_hash: HASH_SAU,
      repo: REPO,
    });
    expect(tot.status).toBe(201);
    expect((await tot.json<{ xac_minh: string }>()).xac_minh).toBe('merged');

    // Review gửi **sau** commit cuối, nên còn hiệu lực theo 19.3.
    expect((await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' })).status).toBe(201);
    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('19.3 d.495: bằng chứng gửi SAU KHI XONG vẫn được lưu, cờ `sau_khi_xong`', async () => {
    await env.DB.prepare('UPDATE ticket SET trang_thai = ? WHERE id = ?').bind('done', TK).run();
    const res = await gui(TOKEN.worker, { loai_bang_chung: 'note', noi_dung: 'thêm sau khi xong' });
    expect(res.status).toBe(201);
    const b = await res.json<{ id: string; sau_khi_xong: boolean }>();
    expect(b.sau_khi_xong).toBe(true);
    expect(await bangChungTrongDb(b.id)).not.toBeNull();
    // Ticket **không bị hạ** (19.3).
    expect(await trangThaiCua(TK)).toBe('done');

    // ĐỐI CHỨNG: ticket chưa kết → cờ `false`.
    const khac = await gui(TOKEN.worker, { loai_bang_chung: 'note', noi_dung: 'x' }, TK2);
    expect((await khac.json<{ sau_khi_xong: boolean }>()).sau_khi_xong).toBe(false);
  });
});

/* ================================================================== *
 * H. d.222 — rút lại
 * ================================================================== */

describe('d.222 — bằng chứng không sửa, không xoá; chỉ rút lại kèm lý do', () => {
  async function guiNote(token: string, ticket_id = TK): Promise<string> {
    const res = await gui(token, { loai_bang_chung: 'note', noi_dung: 'để rút' }, ticket_id);
    return (await res.json<{ id: string }>()).id;
  }

  it('THIẾU lý do → `REASON_REQUIRED`/422; ĐỐI CHỨNG có lý do → 200', async () => {
    const id = await guiNote(TOKEN.worker);
    const xau = await rut(TOKEN.worker, id);
    expect(xau.status).toBe(422);
    expect((await xau.json<{ error: string }>()).error).toBe('REASON_REQUIRED');
    expect((await bangChungTrongDb(id))?.rut_luc).toBeNull();

    const tot = await rut(TOKEN.worker, id, 'Gửi nhầm ticket');
    expect(tot.status).toBe(200);
    const d = await bangChungTrongDb(id);
    expect(d?.rut_luc).not.toBeNull();
    expect(d?.rut_ly_do).toBe('Gửi nhầm ticket');
    expect(d?.rut_boi_loai).toBe('agent');
    expect(d?.rut_boi_agent_id).toBe(ID.worker);
  });

  it('NGƯỜI GỬI rút được; agent KHÁC thì không, kể cả `manager`', async () => {
    const id = await guiNote(TOKEN.worker);
    const xau = await rut(TOKEN.manager, id, 'tôi muốn rút');
    expect(xau.status).toBe(403);
    expect((await xau.json<{ message: string }>()).message).toMatch(
      /người gửi bằng chứng hoặc chủ/,
    );
    expect((await bangChungTrongDb(id))?.rut_luc).toBeNull();

    // ĐỐI CHỨNG: chính người gửi → 200.
    expect((await rut(TOKEN.worker, id, 'gửi nhầm')).status).toBe(200);
  });

  it('CHỦ rút được bằng chứng của agent khác (d.222 "người gửi **hoặc chủ**")', async () => {
    const id = await guiNote(TOKEN.worker);
    expect((await rut(TOKEN_CHU, id, 'chủ quyết rút')).status).toBe(200);
    const d = await bangChungTrongDb(id);
    expect(d?.rut_boi_loai).toBe('owner');
    expect(d?.rut_boi_agent_id).toBeNull();
  });

  it('rút LẦN HAI → `INVALID_INPUT` (một lần rút là MỘT CHIỀU), lý do cũ không bị ghi đè', async () => {
    const id = await guiNote(TOKEN.worker);
    await rut(TOKEN.worker, id, 'lý do đầu');
    const lai = await rut(TOKEN_CHU, id, 'lý do mới');
    expect(lai.status).toBe(422);
    expect((await lai.json<{ message: string }>()).message).toMatch(/một chiều/);
    expect((await bangChungTrongDb(id))?.rut_ly_do).toBe('lý do đầu');
  });

  it('NỘI DUNG bằng chứng không sửa được: không có đường HTTP nào ghi lên nó', async () => {
    const id = await guiNote(TOKEN.worker);
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      const res = await goiApi(`/v1/bang-chung/${id}`, TOKEN_CHU, { method });
      expect(res.status, method).toBe(404);
    }
    expect((await bangChungTrongDb(id))?.noi_dung).toBe('để rút');
  });

  it('bằng chứng không có → 404; ở workspace khác cũng 404 (không lộ sự tồn tại)', async () => {
    expect((await rut(TOKEN_CHU, 'bc-khong-co', 'lý do')).status).toBe(404);
  });

  it('ĐÃ RÚT thì KHÔNG ĐƯỢC TÍNH: rút commit `merged` → cổng đóng lại', async () => {
    const c = await gui(TOKEN.worker, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
    const id_commit = (await c.json<{ id: string }>()).id;
    await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' });

    // ĐỐI CHỨNG trước: chưa rút thì cổng MỞ.
    const truoc = await goiApi(`/v1/ticket/${TK2}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(truoc.status).toBe(422); // TK2 không có bằng chứng — canh fixture

    expect((await rut(TOKEN.worker, id_commit, 'commit sai nhánh')).status).toBe(200);

    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('EVIDENCE_REQUIRED');
  });

  it('TICKET ĐÃ XONG KHÔNG BỊ HẠ khi rút bằng chứng đã mở cổng', async () => {
    const c = await gui(TOKEN.worker, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
    const id_commit = (await c.json<{ id: string }>()).id;
    await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' });
    const len = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(len.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');

    const res = await rut(TOKEN.worker, id_commit, 'commit sai nhánh');
    expect(res.status).toBe(200);
    // d.222: "Ticket đã Xong **không bị hạ tự động**."
    expect((await res.json<{ ticket_trang_thai: string }>()).ticket_trang_thai).toBe('done');
    expect(await trangThaiCua(TK)).toBe('done');
  });
});

/* ================================================================== *
 * I. Chặng 3 (`ghiXacMinh`) — lượt 2 sửa review
 * ================================================================== *
 * Hai lỗ test reviewer tìm ra ở đây, cả hai về **cái xảy ra giữa ba chặng**.
 */

describe('chặng ghi kết luận: không ghi đè, và không biến lỗi thành 500', () => {
  /** Chờ chặng 1 chèn xong dòng `evidence` (trước khi chặng 2 gọi mạng). */
  async function choDongDauTien(): Promise<string> {
    for (let i = 0; i < 300; i += 1) {
      const d = await env.DB.prepare('SELECT id FROM evidence ORDER BY gui_luc, id LIMIT 1').first<{
        id: string;
      }>();
      if (d !== null) return d.id;
      await new Promise((ok) => setTimeout(ok, 10));
    }
    throw new Error('Chặng 1 không chèn dòng `evidence` nào');
  }

  /**
   * **d.222 qua một cuộc đua có thật.** Agent gửi bằng chứng `commit`; **trong
   * lúc** Baton đang gọi GitHub, agent gọi `POST /v1/bang-chung/:id/rut`; rồi
   * chặng 3 về. Ghi `merged` lên một dòng **đã rút** là lách đúng d.222 ("bằng
   * chứng đã rút **không được tính**") — và lách nó bằng cách làm cho một bằng
   * chứng đã rút vẫn có kết luận mở cổng.
   *
   * **Nguồn giả CHẶN tới khi ca thả cửa** (BAT-54, cùng khuôn ca "KIẾN TRÚC" của
   * `cron-bang-chung.test.ts`, BAT-41), không ngủ cố định. Bản cũ dùng `cham_ms:
   * 1_500`: 1,5 giây ngủ thật ăn gần một phần ba trần 5 giây của thân ca, nên khi
   * máy tải nặng (mọi request chậm đi, có lượt cả runtime đứng ~5 giây — đo ở bộ đầy
   * đủ, xem `quyet-dinh.md` dòng BAT-54) ca hết giờ; và cuộc đua chỉ đúng nếu lệnh
   * rút về TRƯỚC khi 1,5 giây hết — tải nặng thì rút về sau chặng 3, ca đỏ vì sai
   * điều kiện đầu vào chứ không vì mã. Có cửa: lệnh rút chắc chắn rơi giữa chặng 2
   * (nguồn đã được gọi, đang "chờ mạng") và chặng 3 (chỉ chạy sau khi thả cửa), và
   * thân ca không còn giây ngủ nào. Các khẳng định giữ nguyên. Cửa luôn được thả
   * trong `finally`, và lệnh gửi nằm trong sổ `bay`.
   */
  it('d.222: RÚT trong lúc đang xác minh → chặng 3 KHÔNG ghi gì, dòng vẫn `pending`', async () => {
    const goc = nguonGitHubGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
    let da_goi_nguon = false;
    let thaCua: () => void = () => undefined;
    const cua = new Promise<void>((ok) => {
      thaCua = ok;
    });
    tiemNguonXacMinh({
      github: {
        async tinhTrangCommit(repo: string, hash: string) {
          da_goi_nguon = true;
          await cua; // "đang chờ mạng" — tới khi ca thả
          return goc.tinhTrangCommit(repo, hash);
        },
      },
      deploy: nguonDeployGiaLap(),
    });

    const dang_gui = gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
    let id: string;
    try {
      id = await choDongDauTien();
      // Chặng 2 đã THẬT vào nguồn: lệnh rút dưới đây rơi đúng "trong lúc đang xác minh".
      expect(await choToi(() => da_goi_nguon)).toBe(true);
      expect((await rut(TOKEN_CHU, id, 'rút trong lúc đang xác minh')).status).toBe(200);
    } finally {
      thaCua();
    }

    const res = await dang_gui;
    expect(res.status).toBe(201);
    expect((await res.json<{ da_ghi_xac_minh: boolean }>()).da_ghi_xac_minh).toBe(false);

    const d = await bangChungTrongDb(id);
    // Không thành `merged`: kết luận không được ghi lên một dòng đã rút.
    expect(d?.xac_minh).toBe('pending');
    expect(d?.rut_luc).not.toBeNull();
  });

  it('ĐỐI CHỨNG: KHÔNG rút thì chặng 3 ghi thật — `da_ghi` true và dòng thành `merged`', async () => {
    /*
     * Không có đối chứng này thì "vẫn `pending`" ở ca trên có thể đúng vì một lý
     * do khác hẳn (nguồn chậm quá trần, chặng 3 không bao giờ chạy, …).
     *
     * Cùng nguồn giả CHẶN như ca trên (BAT-55), đổi đúng một thứ: không rút. Bản
     * cũ dùng `cham_ms: 1_500` (1,5 giây ngủ thật trong thân ca). Chờ tới khi
     * nguồn đã được gọi (chặng 2 THẬT đang "chờ mạng") rồi mới thả cửa — cùng
     * đường đi với ca trên tới đúng điểm rẽ.
     */
    const goc = nguonGitHubGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
    let da_goi_nguon = false;
    let thaCua: () => void = () => undefined;
    const cua = new Promise<void>((ok) => {
      thaCua = ok;
    });
    tiemNguonXacMinh({
      github: {
        async tinhTrangCommit(repo: string, hash: string) {
          da_goi_nguon = true;
          await cua; // "đang chờ mạng" — tới khi ca thả
          return goc.tinhTrangCommit(repo, hash);
        },
      },
      deploy: nguonDeployGiaLap(),
    });

    const dang_gui = gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
    try {
      expect(await choToi(() => da_goi_nguon)).toBe(true);
    } finally {
      thaCua();
    }

    const res = await dang_gui;
    expect(res.status).toBe(201);
    const b = await res.json<{ id: string; da_ghi_xac_minh: boolean }>();
    expect(b.da_ghi_xac_minh).toBe(true);

    const d = await bangChungTrongDb(b.id);
    expect(d?.xac_minh).toBe('merged');
    expect(d?.rut_luc).toBeNull();
  });

  /**
   * **Chặng 2/3 ném thì KHÔNG phải 500.** Dòng `evidence` đã có (`pending`, có
   * `thu_lai_luc`), nên không mất dữ liệu — và d.219 hứa "**trả kết quả**", không
   * hứa "thành công". Một 500 ở đây nói sai sự thật và agent sẽ gửi lại, thành
   * hai dòng cho một việc.
   */
  it('chặng xác minh NÉM lỗi → 201 + `pending`, dòng có `thu_lai_luc`, lỗi gốc KHÔNG rò ra thân', async () => {
    tiemNguonXacMinh({
      github: {
        tinhTrangCommit() {
          throw new Error('VO-O-CHANG-HAI-bi-mat');
        },
      },
      deploy: nguonDeployGiaLap(),
    });
    try {
      const res = await gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO });
      expect(res.status).toBe(201);
      const b = await res.json<{ id: string; xac_minh: string; ly_do: string }>();
      expect(b.xac_minh).toBe('pending');
      // SPEC mục 15: thông điệp không mang lỗi gốc.
      expect(b.ly_do).not.toMatch(/VO-O-CHANG-HAI/);

      const d = await bangChungTrongDb(b.id);
      expect(d?.xac_minh).toBe('pending');
      // Cron của lượt 3 còn nhặt được dòng này lên — không mắc `pending` vĩnh viễn.
      expect(d?.thu_lai_luc).not.toBeNull();
    } finally {
      datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
    }
  });
});
