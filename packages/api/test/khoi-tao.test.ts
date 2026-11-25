/**
 * **Đường khởi tạo lần đầu** — `POST /v1/khoi-tao` (`src/khoi-tao.ts`).
 *
 * Ca chốt của file này: **DB rỗng ngay sau migration**. Không file test nào khác
 * làm vậy — tất cả đều gọi `dungWorkspace()` trước, nên lỗi chặn deploy ("không
 * có đường nào ghi một dòng `workspace`, mà `workspaceDuyNhat` ném `NOT_FOUND`
 * khi rỗng, nên **mọi** đường chết") không có ca nào nhìn thấy. Ca đầu tiên dưới
 * đây ghim chính cái đó.
 *
 * Luật SPEC được ghim ở đây:
 *   * mục 1 d.51 — v0.1 **một** workspace: chạy lại không tạo cái thứ hai.
 *   * mục 3 — token agent hiện **đúng một lần**; chạy lại không cấp lại.
 *   * mục 15 d.417 — bí mật không ra khỏi máy chủ ngoài lần cấp: ca quét **cả
 *     thân** phản hồi lần hai, tìm `otpauth` và tìm từng token đã cấp.
 *   * mục 15 — cổng `TOKEN_CHU` fail-closed: token agent và token sai bị từ chối.
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { maTotp } from '@baton/shared';
import { app } from '../src/index.js';
import { TOKEN_CHU, WS_KHAC, dungAgentCoToken, dungWorkspace, goiApi } from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`): ca hết giờ
// không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it } = caQuaSo(bay);

const MAT_KHAU = 'mat-khau-gia-cua-chu-2026';

/** Thân đầy đủ, giống hệt cái chủ sẽ gõ lúc deploy (xem `DEPLOYMENT.md`). */
const THAN = {
  ten_chu: 'Chủ',
  mat_khau: MAT_KHAU,
  du_an: [
    { ten: 'Baton', ma: 'BAT' },
    { ten: 'Sample', ma: 'SAI' },
  ],
  agent: [
    { ten: 'CoS', vai_tro: 'coordinator', vao_tat_ca_du_an: true },
    { ten: 'M-Baton', vai_tro: 'manager', du_an_duoc_vao: ['BAT'] },
    { ten: 'W-builder', vai_tro: 'worker', du_an_duoc_vao: ['BAT', 'SAI'] },
  ],
};

interface RaKhoiTao {
  workspace: { id: string; ten_chu: string; vua_tao: boolean };
  chu: { vua_tao: boolean; otpauth: string | null; ghi_chu: string };
  du_an: { id: string; ma: string; ten: string; vua_tao: boolean }[];
  agent: {
    id: string;
    ten: string;
    vai_tro: string;
    vua_tao: boolean;
    token: string | null;
    ghi_chu: string;
  }[];
}

function khoiTao(than: unknown, token = TOKEN_CHU): Promise<Response> {
  return goiApi('/v1/khoi-tao', token, { method: 'POST', than });
}

/** Secret TOTP lấy ra từ URI `otpauth://` — lần duy nhất nó ra khỏi máy chủ. */
function secretTuUri(uri: string): string {
  const s = new URL(uri.replace('otpauth://', 'https://')).searchParams.get('secret');
  if (s === null) throw new Error('URI otpauth không có secret');
  return s;
}

/**
 * Khởi tạo rồi đăng nhập thật, trả cookie phiên của chủ.
 *
 * Dùng cho các ca "cookie phiên KHÔNG vào được đường chỉ-`TOKEN_CHU`": một cookie
 * cũng dựng ra `{ loai: 'chu' }` trong `xacThuc`, nên điều kiện duy nhất phân
 * biệt hai đường giấy tờ là cờ `qua_token_chu`.
 */
async function dangNhapLayCookie(): Promise<string> {
  const ra = await (await khoiTao(THAN)).json<RaKhoiTao>();
  const secret = secretTuUri(ra.chu.otpauth!);
  const res = await SELF.fetch('https://baton.test/v1/dang-nhap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mat_khau: MAT_KHAU, ma_totp: await maTotp(secret, Date.now()) }),
  });
  const set = res.headers.get('set-cookie');
  const cookie = set === null ? null : (/baton_phien=([^;]*)/.exec(set)?.[0] ?? null);
  if (cookie === null) throw new Error('không lấy được cookie phiên');
  return cookie;
}

function demBang(bang: string): Promise<{ n: number } | null> {
  return env.DB.prepare(`SELECT count(*) AS n FROM ${bang}`).first<{ n: number }>();
}

describe('POST /v1/khoi-tao — DB rỗng ngay sau migration', () => {
  it('lỗi chặn deploy: KHÔNG có đường nào khác vào được khi chưa có workspace', async () => {
    // Không `dungWorkspace()`: đây là đúng trạng thái sau `d1 migrations apply`.
    expect((await demBang('workspace'))?.n).toBe(0);

    // Ngay cả đường thiết lập chủ — đường "lần đầu" của phần 6 — cũng chết:
    // `xacThuc` tra `workspaceDuyNhat` TRƯỚC khi vào route.
    const res = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
      method: 'POST',
      than: { mat_khau: MAT_KHAU },
    });
    expect(res.status).toBe(404);

    // Và đường khởi tạo thì vào được — nó là ngoại lệ duy nhất.
    expect((await khoiTao(THAN)).status).toBe(200);
  });

  it('một lượt gọi: có workspace, có chủ đăng nhập được, có dự án, có agent dùng được token', async () => {
    const res = await khoiTao(THAN);
    expect(res.status).toBe(200);
    const ra = await res.json<RaKhoiTao>();

    expect(ra.workspace.vua_tao).toBe(true);
    expect(ra.workspace.ten_chu).toBe('Chủ');
    expect(ra.chu.vua_tao).toBe(true);
    expect(ra.du_an.map((d) => d.ma)).toEqual(['BAT', 'SAI']);
    expect(ra.du_an.every((d) => d.vua_tao)).toBe(true);
    expect(ra.agent.map((a) => a.ten)).toEqual(['CoS', 'M-Baton', 'W-builder']);
    expect(ra.agent.every((a) => a.vua_tao)).toBe(true);

    /* Chủ vào được bằng mật khẩu + TOTP vừa cấp — SPEC mục 15 d.415. */
    const secret = secretTuUri(ra.chu.otpauth!);
    const dang_nhap = await SELF.fetch('https://baton.test/v1/dang-nhap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mat_khau: MAT_KHAU, ma_totp: await maTotp(secret, Date.now()) }),
    });
    expect(dang_nhap.status).toBe(200);

    /* Agent dùng được token vừa cấp, và thấy đúng phạm vi dự án của mình. */
    const tk_manager = ra.agent.find((a) => a.ten === 'M-Baton')!.token!;
    const toi = await goiApi('/v1/whoami', tk_manager);
    expect(toi.status).toBe(200);
    expect((await toi.json<{ ten: string; vai_tro: string }>()).vai_tro).toBe('manager');

    const ds = await goiApi('/v1/du-an', tk_manager);
    expect(ds.status).toBe(200);
    expect((await ds.json<{ items: { ma: string }[] }>()).items.map((d) => d.ma)).toEqual(['BAT']);
  });

  it('agent vao_tat_ca_du_an thấy mọi dự án; agent theo mã chỉ thấy mã của mình', async () => {
    const ra = await (await khoiTao(THAN)).json<RaKhoiTao>();
    const cos = ra.agent.find((a) => a.ten === 'CoS')!.token!;
    const ds = await (await goiApi('/v1/du-an', cos)).json<{ items: { ma: string }[] }>();
    expect(ds.items.map((d) => d.ma).sort()).toEqual(['BAT', 'SAI']);
  });

  it('thiếu mật khẩu khi chưa có chủ → INVALID_INPUT, nhưng workspace đã tạo nên chạy lại là đủ', async () => {
    const res = await khoiTao({ du_an: [], agent: [] });
    expect(res.status).toBe(422);
    expect((await demBang('workspace'))?.n).toBe(1);

    const lan_hai = await khoiTao(THAN);
    expect(lan_hai.status).toBe(200);
    const ra = await lan_hai.json<RaKhoiTao>();
    // Workspace dùng lại, chủ mới đặt lần này.
    expect(ra.workspace.vua_tao).toBe(false);
    expect(ra.chu.vua_tao).toBe(true);
    expect((await demBang('workspace'))?.n).toBe(1);
  });

  it('mã dự án sai định dạng → INVALID_INPUT (luật mục 2 vẫn do cửa ghi kiểm)', async () => {
    const res = await khoiTao({ ...THAN, du_an: [{ ten: 'Sai', ma: 'qua-dai-va-thuong' }] });
    expect(res.status).toBe(422);
  });

  it('agent trỏ vào mã dự án không có → NOT_FOUND, nói rõ mã nào', async () => {
    const res = await khoiTao({
      ...THAN,
      agent: [{ ten: 'W-lac', vai_tro: 'worker', du_an_duoc_vao: ['ZZZ'] }],
    });
    expect(res.status).toBe(404);
    expect((await res.json<{ message: string }>()).message).toContain('ZZZ');
  });
});

describe('POST /v1/khoi-tao — CHẠY LẠI ĐƯỢC (chủ sẽ gõ sai và gõ lại)', () => {
  it('lần hai: không nhân bản workspace / dự án / agent nào', async () => {
    const mot = await (await khoiTao(THAN)).json<RaKhoiTao>();
    const hai = await (await khoiTao(THAN)).json<RaKhoiTao>();

    expect((await demBang('workspace'))?.n).toBe(1);
    expect((await demBang('project'))?.n).toBe(2);
    expect((await demBang('agent'))?.n).toBe(3);

    // Và là **đúng những dòng cũ**, không phải ba dòng mới thay chỗ.
    expect(hai.workspace.id).toBe(mot.workspace.id);
    expect(hai.du_an.map((d) => d.id)).toEqual(mot.du_an.map((d) => d.id));
    expect(hai.agent.map((a) => a.id)).toEqual(mot.agent.map((a) => a.id));
  });

  it('lần hai: mỗi mục nói rõ "đã có", không mục nào nói "vừa tạo"', async () => {
    await khoiTao(THAN);
    const hai = await (await khoiTao(THAN)).json<RaKhoiTao>();

    expect(hai.workspace.vua_tao).toBe(false);
    expect(hai.chu.vua_tao).toBe(false);
    expect(hai.du_an.every((d) => !d.vua_tao)).toBe(true);
    expect(hai.agent.every((a) => !a.vua_tao)).toBe(true);
    expect(hai.chu.ghi_chu).toContain('đã có');
    expect(hai.agent.every((a) => a.ghi_chu.includes('đã có'))).toBe(true);
  });

  it('lần hai KHÔNG đổi mật khẩu đang dùng: mật khẩu mới trong thân bị bỏ qua', async () => {
    const mot = await (await khoiTao(THAN)).json<RaKhoiTao>();
    const secret = secretTuUri(mot.chu.otpauth!);

    const hai = await (await khoiTao({ ...THAN, mat_khau: 'mat-khau-khac-hoan-toan' })).json<RaKhoiTao>();
    expect(hai.chu.vua_tao).toBe(false);

    // Mật khẩu CŨ vẫn vào được — tức lần hai không ghi đè gì.
    const vao = await SELF.fetch('https://baton.test/v1/dang-nhap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mat_khau: MAT_KHAU, ma_totp: await maTotp(secret, Date.now()) }),
    });
    expect(vao.status).toBe(200);
  });

  it('lần hai KHÔNG cấp token mới: băm token trong DB không đổi', async () => {
    await khoiTao(THAN);
    const truoc = await env.DB.prepare('SELECT ten, token_bam FROM agent ORDER BY ten').all<{
      ten: string;
      token_bam: string;
    }>();
    await khoiTao(THAN);
    const sau = await env.DB.prepare('SELECT ten, token_bam FROM agent ORDER BY ten').all<{
      ten: string;
      token_bam: string;
    }>();
    expect(sau.results).toEqual(truoc.results);
  });

  it('thêm một dự án và một agent ở lần hai: chỉ cái mới là vua_tao', async () => {
    await khoiTao(THAN);
    const hai = await (
      await khoiTao({
        ...THAN,
        du_an: [...THAN.du_an, { ten: 'INC', ma: 'INC' }],
        agent: [...THAN.agent, { ten: 'R-kiem', vai_tro: 'reviewer', vao_tat_ca_du_an: true }],
      })
    ).json<RaKhoiTao>();

    expect(hai.du_an.filter((d) => d.vua_tao).map((d) => d.ma)).toEqual(['INC']);
    expect(hai.agent.filter((a) => a.vua_tao).map((a) => a.ten)).toEqual(['R-kiem']);
    expect(hai.agent.find((a) => a.ten === 'R-kiem')!.token).not.toBeNull();
    // Token của agent cũ vẫn là `null` ở lượt này.
    expect(hai.agent.find((a) => a.ten === 'CoS')!.token).toBeNull();
  });
});

describe('POST /v1/khoi-tao — bí mật ra khỏi máy chủ ĐÚNG MỘT LẦN (mục 15 d.417)', () => {
  it('thân phản hồi lần hai KHÔNG chứa otpauth và KHÔNG chứa token nào đã cấp', async () => {
    const res_mot = await khoiTao(THAN);
    const chu_mot = await res_mot.text();
    const mot = JSON.parse(chu_mot) as RaKhoiTao;

    // Lần một thì có — nếu không, ca dưới xanh một cách vô nghĩa.
    expect(chu_mot).toContain('otpauth://');
    const token_da_cap = mot.agent.map((a) => a.token!);
    expect(token_da_cap.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);

    const chu_hai = await (await khoiTao(THAN)).text();
    // Tìm `otpauth://` chứ không chỉ chữ `otpauth`: tên trường `"otpauth":null`
    // vẫn còn trong thân (và phải còn — nó là chỗ nói "không cấp lại"); thứ không
    // được có là **URI mang secret**.
    expect(chu_hai).not.toContain('otpauth://');
    for (const t of token_da_cap) expect(chu_hai).not.toContain(t);

    const hai = JSON.parse(chu_hai) as RaKhoiTao;
    expect(hai.chu.otpauth).toBeNull();
    expect(hai.agent.every((a) => a.token === null)).toBe(true);
  });

  it('thân phản hồi lần một KHÔNG mang secret TOTP trần, băm mật khẩu hay băm token', async () => {
    const chu = await (await khoiTao(THAN)).text();
    const dong = await env.DB.prepare(
      'SELECT mat_khau_bam, muoi, totp_secret FROM chu_tai_khoan',
    ).first<{ mat_khau_bam: string; muoi: string; totp_secret: string }>();

    expect(chu).not.toContain(dong!.mat_khau_bam);
    expect(chu).not.toContain(dong!.muoi);
    // `totp_secret` có trong URI `otpauth://` — đó là đúng một lần đã khai; nhưng
    // không được có ở đâu khác, nên bỏ URI ra rồi tìm lại.
    const ra = JSON.parse(chu) as RaKhoiTao;
    const con_lai = JSON.stringify({ ...ra, chu: { ...ra.chu, otpauth: null } });
    expect(con_lai).not.toContain(dong!.totp_secret);

    const { results } = await env.DB.prepare('SELECT token_bam FROM agent').all<{
      token_bam: string;
    }>();
    for (const r of results) expect(chu).not.toContain(r.token_bam);
  });
});

describe('POST /v1/khoi-tao — ngoại lệ miễn phép tra workspace HẸP đúng một đường', () => {
  /*
   * Ghim chính **lá chắn trung tâm** của lượt thêm đường khởi tạo:
   * `xac-thuc.ts` so `pathname === DUONG_KHOI_TAO`, **bằng chuỗi**. Không có các
   * ca dưới đây thì đổi phép so thành `startsWith` hay `includes('khoi-tao')`
   * không làm ca nào đỏ — tức ngoại lệ có thể âm thầm nới ra cả một cây đường con
   * mà diff không cho ai thấy.
   *
   * Tất cả chạy trên **DB rỗng**: đó là trạng thái duy nhất phân biệt được "được
   * miễn phép tra workspace" (vào tới route) với "không được miễn" (404 ở
   * middleware, trước route).
   */
  const KHONG_DUOC_MIEN = [
    '/v1/khoi-tao/',
    '/v1/khoi-tao/them',
    '/v1/khoi-tao/..',
    '/v1/khoi-taox',
    '/v1/KHOI-TAO',
  ];

  for (const duong of KHONG_DUOC_MIEN) {
    it(`${duong} KHÔNG được miễn phép tra workspace`, async () => {
      const res = await goiApi(duong, TOKEN_CHU, { method: 'POST', than: THAN });
      expect(res.status).toBe(404);

      /*
       * **Phải đo THÂN, không chỉ mã.** Cả hai bản — được miễn và không được
       * miễn — trả 404 cho các đường này, chỉ khác *lý do*: được miễn thì
       * middleware cho qua và Hono không có route nào khớp (404 chung chung);
       * không được miễn thì chết ngay ở `workspaceDuyNhat`. Đo bằng mã thôi là
       * một ca xanh với cả hai bản — đúng cái bẫy đã làm bản đầu của ca này vô
       * dụng.
       */
      expect(await res.json()).toMatchObject({
        error: 'NOT_FOUND',
        message: 'Chưa có workspace nào.',
      });
      expect((await demBang('workspace'))?.n).toBe(0);
    });
  }

  it('đúng /v1/khoi-tao kèm query string vẫn vào được (query không phải pathname)', async () => {
    const res = await goiApi('/v1/khoi-tao?lan=1', TOKEN_CHU, { method: 'POST', than: THAN });
    expect(res.status).toBe(200);
  });
});

describe('POST /v1/khoi-tao — phạm vi workspace của phép tra mã dự án', () => {
  it('mã dự án của workspace KHÁC không dùng được cho agent → NOT_FOUND', async () => {
    /*
     * Ghim `WHERE workspace_id = ?` của phép tra mã→id trong `khoi-tao.ts`. Bỏ
     * điều kiện đó đi thì agent của workspace này nối được vào một dự án của
     * workspace khác — và `agent_project` mang `workspace_id` của *mình*, nên
     * dòng đó là một mối nối xuyên workspace, đúng thứ SPEC mục 1 cấm.
     *
     * `WS_KHAC = 'ws-zz-khac'` sắp **sau** workspace chính: `workspaceDuyNhat`
     * dùng `ORDER BY id LIMIT 1`, nên một id nhỏ hơn sẽ chiếm chỗ workspace của
     * ca này.
     */
    await khoiTao(THAN);
    const t = Date.now();
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind(WS_KHAC, 'Người khác', t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
       VALUES ('pj-khac', ?, 'Dự án của người khác', 'OTH', 'active', ?, ?)`,
    )
      .bind(WS_KHAC, t, t)
      .run();

    const res = await khoiTao({
      ...THAN,
      agent: [{ ten: 'W-xuyen-ws', vai_tro: 'worker', du_an_duoc_vao: ['OTH'] }],
    });
    expect(res.status).toBe(404);
    expect((await res.json<{ message: string }>()).message).toContain('OTH');

    // Và không có mối nối nào được tạo.
    const noi = await env.DB.prepare(
      "SELECT count(*) AS n FROM agent_project WHERE project_id = 'pj-khac'",
    ).first<{ n: number }>();
    expect(noi?.n).toBe(0);
  });
});

describe('POST /v1/khoi-tao — hai lượt SONG SONG không dựng được workspace thứ hai', () => {
  it('8 POST /v1/khoi-tao chồng nhau: đúng MỘT workspace (SPEC mục 1 d.51)', async () => {
    /*
     * Ghim `WHERE NOT EXISTS (SELECT 1 FROM workspace)` **trong câu INSERT** của
     * `dungWorkspaceNeuThieu`. Bỏ nó đi thì hai lượt chồng nhau đều thấy "chưa
     * có" ở phép kiểm tầng trên và **cả hai** chèn — rồi `workspaceDuyNhat` lặng
     * lẽ chọn cái có id nhỏ hơn, và một nửa dữ liệu nằm ở một workspace không ai
     * đọc tới.
     *
     * Việc tạo workspace **không đi qua cửa ghi được**: DO id dẫn xuất từ
     * `workspace_id`, mà lúc này chưa có `workspace_id` nào. Nên tính nguyên tử
     * phải đến từ chính câu SQL, và ca này là bằng chứng cho lời khai đó.
     *
     * **Thân KHÔNG có `mat_khau`** (nên mọi lượt dừng ở bước chủ với 422): như
     * vậy ca này đo đúng **một** thứ — bước tạo workspace — chứ không lẫn với cuộc
     * đua ở bước đặt mật khẩu, nơi đúng một lượt thắng và các lượt sau nhận
     * `FORBIDDEN` (và đó là hành vi đúng của `thietLapChu`).
     *
     * **Đo thật:** bỏ `WHERE NOT EXISTS` → ca này ĐỎ với **8** workspace, tức cả
     * tám lượt đều thấy "chưa có" ở phép kiểm tầng trên. Tám `fetch` song song
     * trong Miniflare xen vào nhau trọn vẹn, nên ca này đỏ tin cậy trên thực tế.
     *
     * **Khai thẳng giới hạn:** sự xen kẽ đó là của *bộ chạy*, không phải một điều
     * ca này ép được. Bảo đảm thật nằm ở **câu SQL**; ca này là bằng chứng cho
     * lời khai đó, không phải nguồn của nó. Nó **không bao giờ đỏ sai**.
     */
    const ket = await Promise.all(
      Array.from({ length: 8 }, () => khoiTao({ du_an: [], agent: [] })),
    );
    expect(ket.every((r) => r.status === 422)).toBe(true);
    expect((await demBang('workspace'))?.n).toBe(1);
  });
});

describe('POST /v1/khoi-tao — cổng TOKEN_CHU, fail-closed (mục 15)', () => {
  it('token sai → 401, và không ghi gì vào DB', async () => {
    const res = await khoiTao(THAN, 'bt_token_hoan_toan_sai');
    expect(res.status).toBe(401);
    expect((await demBang('workspace'))?.n).toBe(0);
  });

  it('thiếu Authorization → 401', async () => {
    const res = await SELF.fetch('https://baton.test/v1/khoi-tao', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(THAN),
    });
    expect(res.status).toBe(401);
  });

  it('token AGENT (dù là coordinator) → 403, không khởi tạo được gì', async () => {
    /*
     * Dựng nền bằng fixture: một agent chỉ tồn tại khi đã có workspace, nên ca
     * này đo đúng điều nó muốn đo — "token agent không vào được đường khởi tạo"
     * — chứ không đo lại cái 404 "chưa có workspace".
     */
    await dungWorkspace();
    const TOKEN_AGENT = 'bt_token_gia_cua_coordinator';
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_AGENT,
      vao_tat_ca_du_an: true,
    });

    const res = await khoiTao(THAN, TOKEN_AGENT);
    expect(res.status).toBe(403);
    expect((await demBang('project'))?.n).toBe(0);
    expect((await demBang('chu_tai_khoan'))?.n).toBe(0);
  });

  /*
   * **`TOKEN_CHU` rỗng hoặc chưa đặt = KHÔNG đường nào vào** — lá chắn
   * fail-closed của `xac-thuc.ts`, điều kiện
   * `token_chu !== undefined && token_chu !== ''`.
   *
   * Dựng được bằng cách gọi `app.fetch` với một `env` ghi đè, đúng nếp
   * `test/loi.test.ts` đã dùng cho `CHO_DUONG_TEST` — binding của `vitest.config`
   * là một giá trị cho cả tiến trình, nhưng `env` thì sao chép được. (Lượt trước
   * tôi khai ca này "không dựng được"; lời khai đó sai, reviewer bắt đúng.)
   *
   * Các ca dưới đây ghim **tính chất đầu-cuối** cho cả bốn đường chỉ-`TOKEN_CHU`:
   * secret chưa đặt hoặc rỗng ⇒ **không ai** vào được với tư cách chủ.
   *
   * **Nhưng khai thẳng chúng ghim cái gì và KHÔNG ghim cái gì.** Đo bằng đột biến
   * ở lượt này: rút điều kiện `token_chu !== undefined && token_chu !== ''` ở
   * `xac-thuc.ts` thành `bangNhauAnToan(token, token_chu ?? '')` thì **không ca
   * nào đỏ**. Lý do là một tính chất của `tokenTuRequest`, không phải thiếu test:
   * mẫu của nó là `/^Bearer (.+)$/` chạy **sau** `header.trim()`, nên nhóm bắt
   * được không bao giờ rỗng sau khi trim — tức **không request nào** đưa được
   * `token === ''` tới phép so. Hai tầng cùng giữ một luật, và tầng ngoài đã bắt
   * mọi ca quan sát được. Điều kiện kia vẫn phải ở lại: nó là thứ duy nhất còn
   * đúng nếu một lượt sau nới mẫu của `tokenTuRequest`.
   */
  const DUONG_CHI_TOKEN_CHU = [
    '/v1/khoi-tao',
    '/v1/chu/thiet-lap',
    '/v1/chu/mo-khoa',
    '/v1/chu/dat-lai-totp',
  ];

  for (const duong of DUONG_CHI_TOKEN_CHU) {
    it(`TOKEN_CHU chưa đặt → ${duong} trả 401, không ai vào được với tư cách chủ`, async () => {
      const res = await app.fetch(
        new Request(`https://baton.test${duong}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${TOKEN_CHU}`, 'content-type': 'application/json' },
          body: JSON.stringify(THAN),
        }),
        { ...env, TOKEN_CHU: undefined },
      );
      expect(res.status).toBe(401);
      expect((await demBang('workspace'))?.n).toBe(0);
    });

    it(`TOKEN_CHU rỗng → ${duong} trả 401 (chuỗi rỗng KHÔNG phải một token)`, async () => {
      const res = await app.fetch(
        new Request(`https://baton.test${duong}`, {
          method: 'POST',
          headers: { authorization: 'Bearer ', 'content-type': 'application/json' },
          body: JSON.stringify(THAN),
        }),
        { ...env, TOKEN_CHU: '' },
      );
      expect(res.status).toBe(401);
      expect((await demBang('workspace'))?.n).toBe(0);
    });
  }

  it('cookie phiên của chủ KHÔNG vào được /v1/khoi-tao (chỉ TOKEN_CHU)', async () => {
    /*
     * Ghim `c.get('qua_token_chu') !== true` ở route. Không có ca này thì đổi nó
     * thành `c.get('ai').loai !== 'chu'` vẫn xanh — và điều kiện đó **cho một
     * phiên web đi vào** đường khởi tạo, tức một trang mở trong trình duyệt của
     * chủ (hay một CSRF nhắm vào nó) chạm được tới đường tạo workspace và cấp
     * token agent.
     */
    const cookie = await dangNhapLayCookie();
    const res = await SELF.fetch('https://baton.test/v1/khoi-tao', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ...THAN, du_an: [{ ten: 'Moi', ma: 'NEW' }] }),
    });
    expect(res.status).toBe(403);

    // Và không có dự án `NEW` nào được tạo.
    const co = await env.DB.prepare("SELECT count(*) AS n FROM project WHERE ma = 'NEW'").first<{
      n: number;
    }>();
    expect(co?.n).toBe(0);
  });
});
