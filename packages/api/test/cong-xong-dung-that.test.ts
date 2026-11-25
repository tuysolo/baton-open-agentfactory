/**
 * **Ba chỗ chặn của cổng Xong trong cách dùng thật (13/10)** — SPEC mục 7
 * d.206, d.207, d.208, "Cổng vào Xong" d.213–215; 19.7; 19.11.
 *
 * Ngày 13/10 chủ dùng thật và **không ticket nào** chuyển được sang Xong. Ba chỗ,
 * và file này là bộ canh cho cả ba:
 *
 *   1. **deploy trỏ vào chính Baton bị 404.** Một subrequest của Worker tới chính
 *      hostname của nó không được chính Worker đó phục vụ, nên mã đọc được là 404
 *      dù từ ngoài `curl` trả 200. Sửa: host trùng host công khai ⇒ **kiểm nội
 *      bộ**, không gọi mạng (`tuyen-noi-bo.ts`).
 *   2. **commit merge CỤC BỘ không bao giờ `merged`.** GitHub không biết commit
 *      của một repo chưa push. Sửa: CLI khai `merged_cuc_bo`, server dùng nó
 *      **chỉ khi** GitHub không biết commit đó, và ghi nguồn `local` (migration
 *      0022 khối A).
 *   3. **không ai gửi được `review` ĐẠT.** Reviewer thật là sub-agent không có
 *      token Baton. Sửa: `manager` ghi được, **bắt buộc** kèm đường dẫn báo cáo
 *      của reviewer, và ghi nguồn `manager` (khối B).
 *
 * Hai luật của file test này, như `gui-bang-chung.test.ts`: **không gọi mạng một
 * lần nào**, và **đi đường HTTP thật** qua cửa ghi thật.
 *
 * Ca của chặn 1 **cố ý không** tiêm nguồn giả lập (`boNguonGiaLap`): nó phải chạy
 * đúng `nguonDeployThat`, vì cái đang được kiểm chính là đường đi của bản thật.
 * Không có mạng nào bị chạm: `BATON_URL_CONG_KHAI` của bộ test là
 * `https://baton.test` (xem `vitest.config.ts`), nên request đi vào **chính router
 * trong tiến trình**.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { nguonDeployGiaLap, nguonDeployThat } from '../src/nguon-deploy.js';
import { assetDungDuong, phucVuSpa } from '../src/phuc-vu-spa.js';
import { chuanHoaHost, hostCongKhaiCuaBaton, tuyenNoiBo } from '../src/tuyen-noi-bo.js';
import { khoaCommit, nguonGitHubGiaLap, nguonGitHubThat } from '../src/nguon-github.js';
import { xacMinhMotBangChung } from '../src/xac-minh-bang-chung.js';
import {
  TOKEN_CHU,
  WS,
  bangChungTrongDb,
  boNguonGiaLap,
  datNguonGiaLap,
  dungAgentCoToken,
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

const TOKEN = {
  manager: 'bt_t_mgr_bat5',
  worker: 'bt_t_wk_bat5',
  reviewer: 'bt_t_rv_bat5',
  coordinator: 'bt_t_cd_bat5',
} as const;
const ID = {
  manager: 'ag-mgr-bat5',
  worker: 'ag-wk-bat5',
  reviewer: 'ag-rv-bat5',
  coordinator: 'ag-cd-bat5',
} as const;

/** Đường màn hình một ticket theo **mã** — route `/v1/man-hinh-ticket/ma/:ma`. */
const MA_TK = 'ma/SAI-1';
const HASH = 'abc1234def5678';
const REPO = 'chu/baton';
const BAO_CAO = 'bao-cao/2026-10-13.md#reviewer-bat5';

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn('SAI', 'Sample');
  await dungTicket(P, 1, 'Việc chờ kiểm chứng', { trang_thai: 'verifying' });

  await dungAgentCoToken({ id: ID.manager, ten: 'M', vai_tro: 'manager', token: TOKEN.manager, du_an: [P] });
  await dungAgentCoToken({ id: ID.worker, ten: 'W', vai_tro: 'worker', token: TOKEN.worker, du_an: [P] });
  await dungAgentCoToken({ id: ID.reviewer, ten: 'R', vai_tro: 'reviewer', token: TOKEN.reviewer, du_an: [P] });
  await dungAgentCoToken({
    id: ID.coordinator,
    ten: 'C',
    vai_tro: 'coordinator',
    token: TOKEN.coordinator,
    du_an: [P],
  });
});

function gui(token: string, than: Record<string, unknown>): Promise<Response> {
  return goiApi(`/v1/ticket/${TK}/bang-chung`, token, { method: 'POST', than });
}

async function dongCua(res: Response): Promise<{
  b: Record<string, unknown>;
  d: Awaited<ReturnType<typeof bangChungTrongDb>>;
}> {
  const b = await res.json<Record<string, unknown>>();
  return { b, d: await bangChungTrongDb(b['id'] as string) };
}

/* ================================================================== *
 * Chặn 1 — URL deploy trỏ vào CHÍNH Baton
 * ================================================================== */

describe('chặn 1 — deploy trỏ vào chính Baton (d.207)', () => {
  beforeEach(() => {
    // Đi **bản thật** của nguồn deploy: đó là thứ đang được kiểm.
    boNguonGiaLap();
  });

  it('URL trùng host của Baton, đường có thật → `passed` mã 200, KHÔNG gọi mạng', async () => {
    const { b, d } = await dongCua(
      await gui(TOKEN_CHU, { loai_bang_chung: 'deploy', url: 'https://baton.test/v1/health' }),
    );
    expect(b['xac_minh']).toBe('passed');
    expect(d?.xac_minh).toBe('passed');
    expect(d?.ma_http).toBe(200);
  });

  /*
   * Đường dùng ở đây là một đường **ngoài `/v1`** (nhánh SPA): bộ test không gắn
   * binding `ASSETS` nào, nên `phucVuSpa` trả **404 JSON** — đúng mã mà một URL
   * deploy chết phải cho. (Một đường `/v1/...` không có thì ăn **401** ở cổng xác
   * thực trước khi tới `notFound`; đó cũng là một mã trượt đúng, nhưng nó nói về
   * xác thực nên không dùng làm ca canh của d.207.)
   */
  it('URL trùng host của Baton, đường KHÔNG có → `failed` mã 404 (đối chứng)', async () => {
    const { d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'deploy',
        url: 'https://baton.test/khong-co-trang-nay',
      }),
    );
    expect(d?.xac_minh).toBe('failed');
    expect(d?.ma_http).toBe(404);
  });

  it('host KHÁC Baton → đi đường `fetch` như cũ (đo bằng cửa `fetch` tiêm vào)', async () => {
    const da_goi: string[] = [];
    const noi_bo_da_goi: string[] = [];
    const nguon = nguonDeployThat({
      goc: async (u) => {
        da_goi.push(String(u));
        return await Promise.resolve(new Response(null, { status: 200 }));
      },
      noi_bo: {
        host: 'baton.test',
        goi: async (u) => {
          noi_bo_da_goi.push(u);
          return await Promise.resolve(new Response(null, { status: 200 }));
        },
      },
    });

    expect(await nguon.goiUrl('https://sample.com/')).toEqual({ ma_http: 200 });
    expect(da_goi).toEqual(['https://sample.com/']);
    expect(noi_bo_da_goi).toEqual([]);

    // ĐỐI CHỨNG: cùng nguồn, host trùng → đường nội bộ, `fetch` **không** thêm lần nào.
    expect(await nguon.goiUrl('https://baton.test/v1/health')).toEqual({ ma_http: 200 });
    expect(da_goi).toEqual(['https://sample.com/']);
    expect(noi_bo_da_goi).toEqual(['https://baton.test/v1/health']);
  });

  it('KHÔNG đặt `BATON_URL_CONG_KHAI` → không có đường nội bộ, đi `fetch` như cũ', () => {
    expect(hostCongKhaiCuaBaton({ ...env, BATON_URL_CONG_KHAI: undefined })).toBeNull();
    expect(hostCongKhaiCuaBaton({ ...env, BATON_URL_CONG_KHAI: 'không-phải-url' })).toBeNull();
    // ĐỐI CHỨNG: giá trị thật của bộ test đọc ra được host.
    expect(hostCongKhaiCuaBaton(env)).toBe('baton.test');
  });

  it('so host là so BẰNG, không tiền tố/hậu tố: `baton.test.evil.com` đi `fetch`', async () => {
    const da_goi: string[] = [];
    const nguon = nguonDeployThat({
      goc: async (u) => {
        da_goi.push(String(u));
        return await Promise.resolve(new Response(null, { status: 200 }));
      },
      noi_bo: {
        host: 'baton.test',
        goi: () => Promise.reject(new Error('đường nội bộ không được chạy ở ca này')),
      },
    });
    expect(await nguon.goiUrl('https://baton.test.evil.com/')).toEqual({ ma_http: 200 });
    expect(da_goi).toEqual(['https://baton.test.evil.com/']);
    // `chuanHoaHost` bỏ một dấu chấm cuối, nên FQDN tuyệt đối vẫn khớp chính Baton.
    expect(chuanHoaHost('BATON.TEST.')).toBe('baton.test');
  });

  /**
   * **Ca canh của lần siết sau review (13/10).** Ca "đường KHÔNG có → 404" ở trên
   * chỉ đúng vì bộ test **không gắn binding `ASSETS`**; trên bản thật có asset,
   * nếu đường nội bộ đi qua nhánh SPA thì **mọi** đường trên host Baton rơi về
   * `index.html` ⇒ 200 ⇒ `passed`, tức `deploy https://<host>/bat-ky-duong-nao`
   * mở được cổng Xong mà không chứng minh gì.
   *
   * Nên ở đây dựng một `ASSETS` **giả lập** đúng hình Asset Worker (file có thật
   * ⇒ 200, không có ⇒ 404) và ghim rằng đường nội bộ **không** rơi về
   * `index.html`: một đường không tồn tại vẫn phải ra 404.
   */
  /** `ASSETS` **giả lập**, đúng hình Asset Worker: file có thật ⇒ 200, không ⇒ 404. */
  function assetsGiaLap(): Fetcher {
    const co_that = new Set(['/index.html', '/assets/app-123.js']);
    return {
      fetch: (vao: RequestInfo | URL) => {
        const duong = new URL(typeof vao === 'string' ? vao : (vao as Request).url).pathname;
        return Promise.resolve(new Response(null, { status: co_that.has(duong) ? 200 : 404 }));
      },
    } as unknown as Fetcher;
  }

  /**
   * **Ca ghim CHÍNH DÒNG SIẾT** — việc đăng ký ở `index.ts`
   * (`laDuongApi ? app.fetch : assetDungDuong`).
   *
   * Hai ca HTTP ở trên chạy trong môi trường **không gắn `ASSETS`**, nên ở đó
   * `phucVuSpa` và `assetDungDuong` cho **cùng** 404 — tức hoàn nguyên `index.ts`
   * về `phucVuRequest` vẫn xanh. Reviewer bắt đúng, và đó là cùng loại lỗi mà
   * `decisions.md` 10/10 đã ghi là bài học lặp lại ("ca test tính qua chính thứ
   * nó định canh thì không đỏ được").
   *
   * Nên ca này gọi **đúng hàm đã đăng ký** (`tuyenNoiBo()`) với một `env` **có**
   * `ASSETS`: đi qua `assetDungDuong` ⇒ 404, đi qua `phucVuSpa` ⇒ 200. Hoàn nguyên
   * một dòng ở `index.ts` là ca này **đỏ**.
   */
  it('hàm nội bộ ĐÃ ĐĂNG KÝ không đi nhánh SPA: có `ASSETS` mà đường lạ vẫn 404', async () => {
    const tuyen = tuyenNoiBo();
    expect(tuyen).not.toBeNull();
    const moi_truong = { ...env, ASSETS: assetsGiaLap() };

    const la = await tuyen!(new Request('https://baton.test/khong-co-trang-nay'), moi_truong);
    expect(la.status).toBe(404);

    // ĐỐI CHỨNG 1: file asset thật thì vẫn 200 (đường nội bộ không chặn oan).
    const that = await tuyen!(new Request('https://baton.test/assets/app-123.js'), moi_truong);
    expect(that.status).toBe(200);

    // ĐỐI CHỨNG 2: `/v1/*` vẫn vào Hono, không vào asset.
    const api = await tuyen!(new Request('https://baton.test/v1/health'), moi_truong);
    expect(api.status).toBe(200);

    // ĐỐI CHỨNG 3: nhánh SPA — thứ **không** được dùng — trả 200 cho cùng đường lạ.
    const spa = await phucVuSpa(new Request('https://baton.test/khong-co-trang-nay'), moi_truong);
    expect(spa.status).toBe(200);
  });

  it('CÓ binding `ASSETS`: đường không tồn tại vẫn 404, KHÔNG rơi về index.html', async () => {
    const assets = assetsGiaLap();

    const nguon = nguonDeployThat({
      goc: () => Promise.reject(new Error('không được gọi mạng ở ca này')),
      noi_bo: {
        host: 'baton.test',
        goi: async (u) =>
          await assetDungDuong(new Request(u, { method: 'GET' }), { ...env, ASSETS: assets }),
      },
    });

    // File thật ⇒ 200 (đạt).
    expect(await nguon.goiUrl('https://baton.test/assets/app-123.js')).toEqual({ ma_http: 200 });
    // Đường không có ⇒ **404**, không phải 200 của `index.html`.
    expect(await nguon.goiUrl('https://baton.test/khong-co-trang-nay')).toEqual({ ma_http: 404 });

    // ĐỐI CHỨNG: nhánh SPA (`phucVuSpa`) thì **có** rơi về `index.html` — đó chính
    // là hành vi mà đường nội bộ phải tránh.
    const spa = await phucVuSpa(new Request('https://baton.test/khong-co-trang-nay'), {
      ...env,
      ASSETS: assets,
    });
    expect(spa.status).toBe(200);
  });

  /*
   * **Không có ca HTTP cho nhánh `catch` — khai thẳng vì sao.** Đường nội bộ chỉ
   * ném khi chính router của Baton ném, và không có thân request nào dựng được
   * trạng thái đó qua HTTP: một URL méo (`/v1/health%ZZ`) vẫn được Hono trả
   * **401** ở cổng xác thực, không ném. Nên nhánh đó được canh ở tầng hàm, ngay
   * dưới — gồm cả việc `{ truot }` đi đường `failed` chứ không `pending`.
   */
  it('nhánh `catch` của đường nội bộ: `{ truot }` → `failed`, không thử lại (19.7)', async () => {
    const nguon = nguonDeployThat({
      goc: () => Promise.reject(new Error('không được gọi mạng ở ca này')),
      noi_bo: { host: 'baton.test', goi: () => Promise.reject(new Error('router ném')) },
    });
    const ra = await nguon.goiUrl('https://baton.test/v1/health');
    expect(ra).toEqual({ truot: expect.stringMatching(/chính Baton/) });

    // Và `{ truot }` đi đường `failed`, **không** `pending` (19.7).
    const kq = await xacMinhMotBangChung(
      { loai: 'deploy', url: 'https://baton.test/v1/health', ma_phien_ban: null },
      { github: nguonGitHubGiaLap(), deploy: nguon },
    );
    expect(kq.xac_minh).toBe('failed');
    expect(kq.ly_do).toMatch(/chính Baton/);
  });

  it('đường nội bộ KHÔNG lách lớp chặn host của d.207 (localhost vẫn bị chặn)', async () => {
    const nguon = nguonDeployThat({
      goc: () => Promise.reject(new Error('không được gọi mạng ở ca này')),
      noi_bo: {
        host: '127.0.0.1',
        goi: () => Promise.reject(new Error('đường nội bộ không được chạy ở ca này')),
      },
    });
    expect(await nguon.goiUrl('https://127.0.0.1/health')).toEqual({
      loi: expect.stringMatching(/localhost hay IP nội bộ/),
    });
  });
});

/* ================================================================== *
 * Chặn 2 — commit merge CỤC BỘ
 * ================================================================== */

describe('chặn 2 — commit merge cục bộ (d.206, migration 0022 khối A)', () => {
  it('GitHub không thấy + người gửi khai merge cục bộ → `merged` nguồn `local`', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const { b, d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: true,
      }),
    );
    expect(b['xac_minh']).toBe('merged');
    expect(d?.xac_minh).toBe('merged');
    expect(d?.nguon_xac_minh).toBe('local');
    expect(d?.merged_cuc_bo).toBe(1);
  });

  it('ĐỐI CHỨNG: GitHub không thấy và KHÔNG khai gì → `failed`, không nguồn nào', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const { d } = await dongCua(
      await gui(TOKEN_CHU, { loai_bang_chung: 'commit', commit_hash: HASH, repo: REPO }),
    );
    expect(d?.xac_minh).toBe('failed');
    expect(d?.nguon_xac_minh).toBeNull();
  });

  it('GitHub là nguồn ƯU TIÊN: GitHub trả `merged` → nguồn `github`, dù có lời khai', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
    const { d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: true,
      }),
    );
    expect(d?.xac_minh).toBe('merged');
    expect(d?.nguon_xac_minh).toBe('github');
  });

  it('GitHub trả `pushed` → vẫn `pushed` nguồn `github`: lời khai KHÔNG nâng cấp', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });
    const { d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: true,
      }),
    );
    expect(d?.xac_minh).toBe('pushed');
    expect(d?.nguon_xac_minh).toBe('github');
  });

  it('LỖI MẠNG của GitHub → `pending` (chờ và thử lại), KHÔNG rơi về `local`', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: { loi: 'mạng hỏng' } } });
    const { d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: true,
      }),
    );
    expect(d?.xac_minh).toBe('pending');
    expect(d?.nguon_xac_minh).toBeNull();
  });

  /**
   * **Siết sau review (13/10).** Bản đầu cho ca "server chưa có `GITHUB_TOKEN`"
   * rơi về lời khai cục bộ. Máy chủ thật **chưa** đặt token đó, nên nhánh ấy biến
   * **mọi** commit có lời khai thành `merged` mà không hỏi GitHub lần nào — kể cả
   * commit đã push mà chưa vào nhánh mặc định (`pushed` của d.206). Một cấu hình
   * thiếu không được mở cổng Xong. Ca này là hàng rào chống thêm lại nhánh đó.
   */
  it('server THIẾU `GITHUB_TOKEN` → `pending`, KHÔNG rơi về `local` dù có lời khai', async () => {
    datNguonGiaLap({
      commit: {
        [khoaCommit(REPO, HASH)]: {
          loi: 'Chưa cấu hình token GitHub trên server (secret GITHUB_TOKEN).',
        },
      },
    });
    const { d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: true,
      }),
    );
    expect(d?.xac_minh).toBe('pending');
    expect(d?.nguon_xac_minh).toBeNull();
    expect(d?.ly_do).toMatch(/GITHUB_TOKEN/);
  });

  it('`local` chỉ rơi vào ca GitHub TRẢ LỜI "không thấy" (đối chứng của ca trên)', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const { d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: true,
      }),
    );
    expect(d?.nguon_xac_minh).toBe('local');
  });

  /*
   * **Siết lần hai (13/10).** `khong_thay` có ba đường vào, và chỉ đường qua chặng
   * `compare` mới là "GitHub nói nó không có commit này". Hai đường còn lại —
   * `repo` sai hình dạng (không gọi mạng lần nào) và `GET /repos/<repo>` trả 404
   * (trả lời về **repo**, không về commit) — trước lượt siết này **cũng** nhận lời
   * khai cục bộ, nên **gõ sai một chữ trong tên repo** là mở được cổng Xong mà
   * GitHub chưa được gọi lần nào.
   */
  it('repo SAI HÌNH DẠNG → `failed` dứt điểm, KHÔNG nhận lời khai (0 lần gọi mạng)', async () => {
    const kq = await xacMinhMotBangChung(
      {
        loai: 'commit',
        commit_hash: HASH,
        // Hình `chu/ten` không khớp ⇒ `nguonGitHubThat` trả về **trước** mọi `fetch`.
        repo: 'chu/baton/nhanh-gi-do',
        merged_cuc_bo: true,
      },
      { github: nguonGitHubThat('bt_token_gia'), deploy: nguonDeployGiaLap() },
    );
    expect(kq.xac_minh).toBe('failed');
    expect(kq.nguon_xac_minh).toBeNull();
    expect(kq.ly_do).toMatch(/Không tra được repo/);
  });

  it('repo trả 404 (không tồn tại / token không thấy) → `failed`, KHÔNG nhận lời khai', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay_repo' } });
    const { d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: true,
      }),
    );
    expect(d?.xac_minh).toBe('failed');
    expect(d?.nguon_xac_minh).toBeNull();
    expect(d?.ly_do).toMatch(/Không tra được repo/);
    // `failed` **dứt điểm**: không đặt mốc thử lại (19.7 — không phải lỗi mạng).
    expect(d?.thu_lai_luc).toBeNull();

    // ĐỐI CHỨNG: cùng dữ liệu, nhưng GitHub trả lời **về commit** → nhận lời khai.
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const sau = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: true,
      }),
    );
    expect(sau.d?.xac_minh).toBe('merged');
    expect(sau.d?.nguon_xac_minh).toBe('local');
  });

  it('nguồn `local` HIỆN RA ở đường đọc màn hình ticket (không ai tưởng là GitHub)', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    await gui(TOKEN_CHU, {
      loai_bang_chung: 'commit',
      commit_hash: HASH,
      repo: REPO,
      merged_cuc_bo: true,
    });
    const res = await goiApi(`/v1/man-hinh-ticket/${MA_TK}`, TOKEN_CHU);
    const than = await res.json<{
      bang_chung: { nguon_xac_minh: string | null; nhan_nguon_xac_minh: string | null }[];
    }>();
    expect(than.bang_chung[0]?.nguon_xac_minh).toBe('local');
    expect(than.bang_chung[0]?.nhan_nguon_xac_minh).toMatch(/cục bộ/);
  });

  it('client KHÔNG tự khai được `nguon_xac_minh` (nó là kết luận của server)', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const { d } = await dongCua(
      await gui(TOKEN_CHU, {
        loai_bang_chung: 'commit',
        commit_hash: HASH,
        repo: REPO,
        nguon_xac_minh: 'github',
      }),
    );
    // Không có lời khai cục bộ ⇒ `failed`, và không nguồn nào được ghi.
    expect(d?.xac_minh).toBe('failed');
    expect(d?.nguon_xac_minh).toBeNull();
  });
});

/* ================================================================== *
 * Ba trigger của migration 0022 — hàng rào ở DB, không chỉ ở mã
 * ================================================================== */

/**
 * Cửa ghi **không** là đường duy nhất vào bảng `evidence` (migration và nhập dữ
 * liệu của mục 16 ghi thẳng), nên ba luật của 0022 phải đứng được ở tầng DB. Bộ
 * test trước lượt sửa này **xanh cả khi bỏ cả ba trigger** — reviewer bắt đúng,
 * nên bốn ca dưới đây ghi/sửa **thẳng D1**, không qua cửa ghi.
 */
describe('migration 0022 — trigger ở tầng DB', () => {
  /** Chèn một dòng `evidence` thô, trả lỗi SQLite (nếu có) dạng chuỗi. */
  async function chen(cot: Record<string, string | number | null>): Promise<string | null> {
    const t = Date.now();
    const day: Record<string, string | number | null> = {
      workspace_id: WS,
      ticket_id: TK,
      nguoi_gui_loai: 'owner',
      gui_luc: t,
      tao_luc: t,
      cap_nhat_luc: t,
      ...cot,
    };
    const ten = Object.keys(day);
    try {
      await env.DB.prepare(
        `INSERT INTO evidence (${ten.join(', ')}) VALUES (${ten.map(() => '?').join(', ')})`,
      )
        .bind(...ten.map((k) => day[k] ?? null))
        .run();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  async function sua(cau: string, ...tham_so: (string | number | null)[]): Promise<string | null> {
    try {
      await env.DB.prepare(cau)
        .bind(...tham_so)
        .run();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  it('`nguon_xac_minh = local` mà `merged_cuc_bo = 0` → DB CHẶN (chèn và sửa)', async () => {
    expect(
      await chen({
        id: 'ev-local-sai',
        loai: 'commit',
        xac_minh: 'merged',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: 0,
        nguon_xac_minh: 'local',
      }),
    ).toMatch(/nguon bang chung khong hop le/);

    // ĐỐI CHỨNG: cùng dòng, có lời khai → chèn được.
    expect(
      await chen({
        id: 'ev-local-dung',
        loai: 'commit',
        xac_minh: 'merged',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: 1,
        nguon_xac_minh: 'local',
      }),
    ).toBeNull();

    // Và một dòng **không** có lời khai thì `UPDATE` cũng không đặt được `local`.
    await chen({
      id: 'ev-khong-khai',
      loai: 'commit',
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      merged_cuc_bo: 0,
    });
    expect(
      await sua(`UPDATE evidence SET nguon_xac_minh = 'local' WHERE id = 'ev-khong-khai'`),
    ).toMatch(/nguon bang chung khong hop le/);
  });

  it('vốn giá trị: `nguon_xac_minh` lạ, `review_nguon` lạ, `manager` thiếu báo cáo → CHẶN', async () => {
    expect(
      await chen({
        id: 'ev-nguon-la',
        loai: 'commit',
        xac_minh: 'merged',
        commit_hash: HASH,
        repo: REPO,
        merged_cuc_bo: 1,
        nguon_xac_minh: 'gitlab',
      }),
    ).toMatch(/nguon bang chung khong hop le/);

    expect(
      await chen({
        id: 'ev-review-la',
        loai: 'review',
        xac_minh: 'not_required',
        ket_luan: 'pass',
        review_nguon: 'chu',
      }),
    ).toMatch(/nguon bang chung khong hop le/);

    expect(
      await chen({
        id: 'ev-mgr-thieu',
        loai: 'review',
        xac_minh: 'not_required',
        ket_luan: 'pass',
        review_nguon: 'manager',
        review_bao_cao: '   ',
      }),
    ).toMatch(/nguon bang chung khong hop le/);

    // ĐỐI CHỨNG: manager + báo cáo thật → chèn được.
    expect(
      await chen({
        id: 'ev-mgr-du',
        loai: 'review',
        xac_minh: 'not_required',
        ket_luan: 'pass',
        review_nguon: 'manager',
        review_bao_cao: BAO_CAO,
      }),
    ).toBeNull();
  });

  it('`merged_cuc_bo` chỉ dành cho `commit`; `review_bao_cao` chỉ dành cho `review`', async () => {
    expect(
      await chen({
        id: 'ev-khai-sai-loai',
        loai: 'note',
        xac_minh: 'not_required',
        noi_dung: 'x',
        merged_cuc_bo: 1,
      }),
    ).toMatch(/nguon bang chung khong hop le/);

    expect(
      await chen({
        id: 'ev-bao-cao-sai-loai',
        loai: 'note',
        xac_minh: 'not_required',
        noi_dung: 'x',
        review_bao_cao: BAO_CAO,
      }),
    ).toMatch(/nguon bang chung khong hop le/);
  });

  it('`tg_evidence_nguon_bat_bien`: KHÔNG sửa được ba cột nội dung (d.222)', async () => {
    await chen({
      id: 'ev-bat-bien',
      loai: 'commit',
      xac_minh: 'merged',
      commit_hash: HASH,
      repo: REPO,
      merged_cuc_bo: 1,
      nguon_xac_minh: 'local',
    });
    await chen({
      id: 'ev-bat-bien-rv',
      loai: 'review',
      xac_minh: 'not_required',
      ket_luan: 'pass',
      review_nguon: 'manager',
      review_bao_cao: BAO_CAO,
    });

    expect(
      await sua('UPDATE evidence SET merged_cuc_bo = 0 WHERE id = ?', 'ev-bat-bien'),
    ).toMatch(/noi dung bang chung khong sua duoc/);
    expect(
      await sua('UPDATE evidence SET review_bao_cao = ? WHERE id = ?', 'khac.md', 'ev-bat-bien-rv'),
    ).toMatch(/noi dung bang chung khong sua duoc/);
    expect(
      await sua('UPDATE evidence SET review_nguon = ? WHERE id = ?', 'reviewer', 'ev-bat-bien-rv'),
    ).toMatch(/noi dung bang chung khong sua duoc/);

    /*
     * ĐỐI CHỨNG: `nguon_xac_minh` **không** bất biến — nó là **kết luận của
     * server** (chặng ghi xác minh của d.219–221 đặt nó), đúng như `xac_minh` và
     * `ma_http`. Ca này giữ cho trigger bất biến không bị nới sang cột đó.
     */
    expect(
      await sua(`UPDATE evidence SET nguon_xac_minh = 'github' WHERE id = 'ev-bat-bien'`),
    ).toBeNull();
  });
});

/* ================================================================== *
 * Chặn 3 — `manager` ghi review kèm báo cáo reviewer
 * ================================================================== */

describe('chặn 3 — manager ghi review kèm báo cáo (d.208, 19.11)', () => {
  it('manager + đường dẫn báo cáo → nhận, nguồn `manager`, lưu đường dẫn', async () => {
    const { b, d } = await dongCua(
      await gui(TOKEN.manager, {
        loai_bang_chung: 'review',
        ket_luan: 'pass',
        duong_dan_bao_cao: BAO_CAO,
      }),
    );
    expect(b['review_nguon']).toBe('manager');
    expect(d?.review_nguon).toBe('manager');
    expect(d?.review_bao_cao).toBe(BAO_CAO);
  });

  it('manager mà THIẾU đường dẫn báo cáo → bị từ chối', async () => {
    const res = await gui(TOKEN.manager, { loai_bang_chung: 'review', ket_luan: 'pass' });
    // `INVALID_INPUT` → 422, theo bảng mã của SPEC mục 13.
    expect(res.status).toBe(422);
    expect((await res.json<{ message: string }>()).message).toMatch(/đường dẫn báo cáo/);
  });

  it('manager LÀ người làm ticket → `REVIEWER_IS_WORKER` (19.3 d.496 không đổi)', async () => {
    await dungLuotGiao('lg-mgr', TK, ID.manager, { loai: 'work', trang_thai: 'accepted' });
    const res = await gui(TOKEN.manager, {
      loai_bang_chung: 'review',
      ket_luan: 'pass',
      duong_dan_bao_cao: BAO_CAO,
    });
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('REVIEWER_IS_WORKER');
  });

  it('`worker` vẫn FORBIDDEN, kể cả khi kèm đường dẫn báo cáo', async () => {
    const res = await gui(TOKEN.worker, {
      loai_bang_chung: 'review',
      ket_luan: 'pass',
      duong_dan_bao_cao: BAO_CAO,
    });
    expect(res.status).toBe(403);
  });

  it('`coordinator` ghi review KHÔNG cần báo cáo → nhận, nguồn `coordinator`', async () => {
    const { b, d } = await dongCua(
      await gui(TOKEN.coordinator, { loai_bang_chung: 'review', ket_luan: 'pass' }),
    );
    expect(b['review_nguon']).toBe('coordinator');
    expect(d?.review_nguon).toBe('coordinator');
    expect(d?.review_bao_cao).toBeNull();
  });

  it('`coordinator` kèm báo cáo thì vẫn nhận và lưu đường dẫn', async () => {
    const { d } = await dongCua(
      await gui(TOKEN.coordinator, {
        loai_bang_chung: 'review',
        ket_luan: 'pass',
        duong_dan_bao_cao: BAO_CAO,
      }),
    );
    expect(d?.review_nguon).toBe('coordinator');
    expect(d?.review_bao_cao).toBe(BAO_CAO);
  });

  it('`coordinator` LÀ người nhận lượt `work` → `REVIEWER_IS_WORKER`', async () => {
    await dungLuotGiao('lg-cd', TK, ID.coordinator, { loai: 'work', trang_thai: 'accepted' });
    const res = await gui(TOKEN.coordinator, { loai_bang_chung: 'review', ket_luan: 'pass' });
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe('REVIEWER_IS_WORKER');
  });

  it('nguồn `coordinator` HIỆN RA ở đường đọc màn hình ticket', async () => {
    await gui(TOKEN.coordinator, { loai_bang_chung: 'review', ket_luan: 'pass' });
    const res = await goiApi(`/v1/man-hinh-ticket/${MA_TK}`, TOKEN_CHU);
    const than = await res.json<{
      bang_chung: { review_nguon: string | null; nhan_review_nguon: string | null }[];
    }>();
    expect(than.bang_chung[0]?.review_nguon).toBe('coordinator');
    expect(than.bang_chung[0]?.nhan_review_nguon).toMatch(/coordinator/);
  });

  it('DB nhận `review_nguon = coordinator` không cần báo cáo (migration 0025)', async () => {
    // Trigger 0022 cũ chỉ nhận reviewer/manager; ca này chỉ qua khi 0025 đã áp.
    const { d } = await dongCua(
      await gui(TOKEN.coordinator, { loai_bang_chung: 'review', ket_luan: 'fail' }),
    );
    expect(d?.review_nguon).toBe('coordinator');
  });

  it('agent `reviewer` vẫn chạy như cũ: không cần đường dẫn, nguồn `reviewer`', async () => {
    const { d } = await dongCua(
      await gui(TOKEN.reviewer, { loai_bang_chung: 'review', ket_luan: 'pass' }),
    );
    expect(d?.review_nguon).toBe('reviewer');
    expect(d?.review_bao_cao).toBeNull();
  });

  it('nguồn review HIỆN RA ở đường đọc màn hình ticket', async () => {
    await gui(TOKEN.manager, {
      loai_bang_chung: 'review',
      ket_luan: 'pass',
      duong_dan_bao_cao: BAO_CAO,
    });
    const res = await goiApi(`/v1/man-hinh-ticket/${MA_TK}`, TOKEN_CHU);
    const than = await res.json<{
      bang_chung: { review_nguon: string | null; nhan_review_nguon: string | null }[];
    }>();
    expect(than.bang_chung[0]?.review_nguon).toBe('manager');
    expect(than.bang_chung[0]?.nhan_review_nguon).toMatch(/manager/);
  });
});

/* ================================================================== *
 * Cả ba chặn cùng lúc — ĐƯỜNG TỚI XONG của cách dùng thật
 * ================================================================== */

describe('cổng Xong mở được trong cách dùng thật (d.213–215)', () => {
  it('commit merge cục bộ + review của manager → ticket tự lên Xong', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    await gui(TOKEN_CHU, {
      loai_bang_chung: 'commit',
      commit_hash: HASH,
      repo: REPO,
      merged_cuc_bo: true,
    });
    // Ticket chưa Xong: dự án bắt buộc review (mặc định bật) nên còn thiếu d.215.
    expect(await trangThaiCua(TK)).toBe('verifying');

    await gui(TOKEN.manager, {
      loai_bang_chung: 'review',
      ket_luan: 'pass',
      duong_dan_bao_cao: BAO_CAO,
    });
    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('commit merged + review ĐẠT của coordinator → đủ điều kiện, ticket lên Xong', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    await gui(TOKEN_CHU, {
      loai_bang_chung: 'commit',
      commit_hash: HASH,
      repo: REPO,
      merged_cuc_bo: true,
    });
    expect(await trangThaiCua(TK)).toBe('verifying');
    await gui(TOKEN.coordinator, { loai_bang_chung: 'review', ket_luan: 'pass' });
    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('deploy trỏ vào chính Baton + review của manager → cổng mở', async () => {
    boNguonGiaLap();
    await gui(TOKEN_CHU, { loai_bang_chung: 'deploy', url: 'https://baton.test/v1/health' });
    await gui(TOKEN.manager, {
      loai_bang_chung: 'review',
      ket_luan: 'pass',
      duong_dan_bao_cao: BAO_CAO,
    });
    const res = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
    expect(res.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });
});
