/**
 * **Nghiệm thu v0.1 — SPEC mục 17 "Định nghĩa xong", 11 bước** (BAT-9, phần 9
 * của `build-plan-v0.1.md`).
 *
 * Mỗi bước một `describe('Bước N — ...')`. File này **tự đứng làm bằng chứng**:
 * mỗi ca đi đúng kịch bản chữ của mục 17, trên **đường thật** của dự án —
 *
 *   * agent nói chuyện bằng **CLI thật** (`chayCli` phân tích tham số như dòng
 *     lệnh, đọc `BATON_URL`/`BATON_TOKEN`, gọi Worker thật trong Miniflare bằng
 *     token thật của agent thật trong D1);
 *   * chủ nói chuyện bằng **API web của chủ** (cookie phiên sau khi đăng nhập mật
 *     khẩu + TOTP — đúng thứ trang web gửi, `credentials: 'same-origin'`), hoặc
 *     `TOKEN_CHU` ở chỗ dựng nền (tạo dự án, tạo agent);
 *   * thời gian trôi bằng **handler `scheduled` thật** (`chayCron`) với **đồng hồ
 *     giả** (`vi.useFakeTimers({ toFake: ['Date'] })`) — không ngủ thật 30 phút;
 *   * GitHub và Telegram là **nguồn giả lập** tiêm qua chỗ cắm đã khai
 *     (`datNguonGiaLap`, `datNguonTelegram`) — **không một lần gọi mạng**, không
 *     secret, không dữ liệu thật (danh sách cấm `CLAUDE.md`).
 *
 * Bước nào **trượt** thì ca của nó là `it.fails` (khẳng định đúng kỳ vọng SPEC và
 * đang đỏ thật — sửa xong nó sẽ báo) hoặc `it.todo` (không có giao diện nào để
 * gọi), kèm chú thích trỏ mục SPEC. Kết luận từng bước và phần "Cần chủ thử tay"
 * ở `nghiem-thu-v0.1.md` (gốc repo).
 *
 * Bước 1 trượt ở BAT-9 (vế CLI: không có cờ lượt review, không có lệnh nối) đã
 * sửa ở BAT-43 (`baton assign --review`, `baton link` — T-50 = A, #168): chuỗi
 * bước 1 nay chạy trọn qua CLI, các ca là `it` thường. Bước 9 vẫn `it.todo`, hoãn
 * theo T-119 (mục 16).
 *
 * Bước 5, 6, 11 có thêm nửa giao diện ở `packages/web/test/nghiem-thu-17.test.tsx`.
 * Bước 10 có thêm số đo ở bộ đo `test/hieu-nang/do-200k.ts` (`npm run do-hieu-nang`);
 * lỗi `too many SQL variables` mà bước này bắt ở BAT-9 đã sửa ở BAT-42 (chia lô
 * tham số), nên các ca của bước 10 nay là `it` thường.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it as itGoc, vi } from 'vitest';
import { MA_THOAT, maTotp } from '@baton/shared';
import { chayCli, type MoiTruongCli } from '@baton/cli';
import { chayCron } from '../src/index.js';
import { khoaCommit } from '../src/nguon-github.js';
import { cuaGhiCua, type WorkspaceGate } from '../src/workspace-gate.js';
import { caQuaSo, choToi, soRequestBay } from './cho-toi.js';
import {
  TOKEN_CHU,
  WS,
  binhLuanCuaTicket,
  boNguonTelegram,
  canChuTrongDb,
  datNguonGiaLap,
  datNguonTelegram,
  dungCanChu,
  dungLienKet,
  dungLuotGiao,
  dungNhan,
  dungTicket,
  dungWorkspace,
  goiApi,
  nhatKyTheoThuTu,
  noiCanChuTicket,
  phienTrongDb,
  trangThaiCua,
} from './giup.js';

/* ================================================================== *
 * Nền chung
 * ================================================================== */

const URL_API = 'https://baton.test';
const HASH = 'a1b2c3d4e5f6a7b8';
const REPO = 'chu/baton';

/** Mật khẩu **giả** của chủ — chỉ sống trong Miniflare. */
const MAT_KHAU = 'mat-khau-gia-nghiem-thu-2026';

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
}

/** Một lần chạy `baton ...` với token của một agent; file đọc từ bảng trong bộ nhớ. */
function ban(token: string, file: Record<string, string> = {}): BanChay {
  const ra: string[] = [];
  const loi: string[] = [];
  return {
    mt: {
      env: { BATON_URL: URL_API, BATON_TOKEN: token },
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void loi.push(d),
      fetch: (u, i) => SELF.fetch(u, i),
      docFile: async (duong) => {
        const chu = file[duong];
        if (chu === undefined) throw new Error(`ENOENT: no such file or directory, open '${duong}'`);
        return await Promise.resolve(chu);
      },
    },
    ra,
    loi,
  };
}

/** Chạy một lệnh CLI, đòi mã thoát `ma`, trả JSON đầu ra (lệnh phải có `--json`). */
async function cli<T = Record<string, unknown>>(
  token: string,
  ds: string[],
  ma: number = MA_THOAT.xong,
  file: Record<string, string> = {},
): Promise<T> {
  const b = ban(token, file);
  const code = await chayCli([...ds, '--json'], b.mt);
  expect(code, `baton ${ds.join(' ')} → ${[...b.ra, ...b.loi].join('\n')}`).toBe(ma);
  const chu = (code === MA_THOAT.xong || code === MA_THOAT.nhan_stop ? b.ra : b.loi).join('\n');
  return JSON.parse(chu) as T;
}

/** Chạy CLI không `--json`, trả `{ code, chu }` (stdout + stderr). */
async function cliChu(token: string, ds: string[]): Promise<{ code: number; chu: string }> {
  const b = ban(token);
  const code = await chayCli(ds, b.mt);
  return { code, chu: [...b.ra, ...b.loi].join('\n') };
}

interface Nen {
  pj: { COS: string; SAI: string; INC: string };
  ag: { coord: string; man: string; wk: string; rv: string };
  tk: { coord: string; man: string; wk: string; rv: string };
}

/**
 * **"Tạo 3 dự án và 4 agent (coordinator, manager, worker, reviewer)"** — mục 17
 * bước 1, dòng đầu. Đi **đường của chủ** (`POST /v1/du-an`, `POST /v1/agent`),
 * token mỗi agent lấy đúng từ lần hiện **duy nhất** lúc tạo (SPEC mục 3).
 *
 * Phân quyền dự án đúng như một đội thật: coordinator vào COS + SAI, manager vào
 * COS (nhận ticket điều phối) + SAI (quản lý), worker và reviewer chỉ SAI. **Không
 * agent nào vào INC** — bước 7 cần đúng điều đó.
 */
async function dungNen(): Promise<Nen> {
  await dungWorkspace();

  const taoDuAn = async (ma: string, ten: string): Promise<string> => {
    const r = await goiApi('/v1/du-an', TOKEN_CHU, { method: 'POST', than: { ma, ten } });
    expect(r.status, `tạo dự án ${ma}`).toBe(201);
    return (await r.json<{ id: string }>()).id;
  };
  const pj = {
    COS: await taoDuAn('COS', 'Chief of Staff'),
    SAI: await taoDuAn('SAI', 'Sample'),
    INC: await taoDuAn('INC', 'INC Docs'),
  };

  const taoAgent = async (
    ten: string,
    vai_tro: string,
    du_an: string[],
  ): Promise<{ id: string; token: string }> => {
    const r = await goiApi('/v1/agent', TOKEN_CHU, {
      method: 'POST',
      than: { ten, vai_tro, model: 'model-gia', du_an_duoc_vao: du_an },
    });
    expect(r.status, `tạo agent ${ten}`).toBe(201);
    return r.json<{ id: string; token: string }>();
  };
  const coord = await taoAgent('CoS', 'coordinator', [pj.COS, pj.SAI]);
  const man = await taoAgent('M-Sample', 'manager', [pj.COS, pj.SAI]);
  const wk = await taoAgent('W-builder', 'worker', [pj.SAI]);
  const rv = await taoAgent('W-reviewer', 'reviewer', [pj.SAI]);

  // Manager quản lý SAI (bảng quyền mục 3: "Tạo ticket — dự án mình quản lý").
  const p = await goiApi(`/v1/du-an/${pj.SAI}`, TOKEN_CHU, {
    method: 'PATCH',
    than: { quan_ly_agent_id: man.id },
  });
  expect(p.status).toBe(200);

  return {
    pj,
    ag: { coord: coord.id, man: man.id, wk: wk.id, rv: rv.id },
    tk: { coord: coord.token, man: man.token, wk: wk.token, rv: rv.token },
  };
}

/** Chủ đăng nhập **như trên web**: thiết lập tài khoản, rồi mật khẩu + TOTP → cookie. */
async function chuDangNhap(): Promise<string> {
  const tl = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
    method: 'POST',
    than: { mat_khau: MAT_KHAU, ten: 'Chủ' },
  });
  expect(tl.status).toBe(201);
  const { otpauth } = await tl.json<{ otpauth: string }>();
  const secret = new URL(otpauth.replace('otpauth://', 'https://')).searchParams.get('secret');
  if (secret === null) throw new Error('URI otpauth không có secret');

  const res = await SELF.fetch(`${URL_API}/v1/dang-nhap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Dien-thoai-gia/1.0' },
    body: JSON.stringify({ mat_khau: MAT_KHAU, ma_totp: await maTotp(secret, Date.now()) }),
  });
  expect(res.status).toBe(200);
  const cookie = /baton_phien=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[0];
  if (cookie === undefined) throw new Error('đăng nhập không trả cookie');
  return cookie;
}

/** Một request **của trang web** (cookie phiên chủ, không `Authorization`). */
function web(duong: string, cookie: string, tc: { method?: string; than?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { cookie };
  if (tc.than !== undefined) headers['content-type'] = 'application/json';
  return SELF.fetch(`${URL_API}${duong}`, {
    method: tc.method ?? 'GET',
    headers,
    ...(tc.than === undefined ? {} : { body: JSON.stringify(tc.than) }),
  });
}

const BAO_CAO_WORKER = [
  '## Kết quả: done',
  '',
  '## Đã làm',
  'Dựng tính năng A.',
  '',
  '## Kiểm chứng',
  '42 test xanh.',
  '',
  '## Nhánh và commit',
  `worker/sai-1-tinh-nang-a · ${HASH}`,
  '',
  '## Rủi ro, điều cần xem kỹ',
  'Không có.',
  '',
  '## Việc phát sinh (không tự làm)',
  'Không có.',
  '',
].join('\n');

const BAO_CAO_REVIEWER = ['## Kết quả: done', '', '## Đã làm', 'Đọc diff, chạy lại test: đạt.', ''].join('\n');

interface TongQuanRa {
  bay_gio: number;
  du_an: { ma: string; suc_song: string }[];
  can_chu_y: { ticket: { ma: string } | null; ly_do: { loai: string; phien: { id: string } | null }[] }[];
}

async function tongQuanChu(): Promise<TongQuanRa> {
  const r = await goiApi('/v1/tong-quan', TOKEN_CHU);
  expect(r.status).toBe(200);
  return r.json<TongQuanRa>();
}

/** Một mốc `scheduledTime` — chọn việc của cron (một cron `* * * * *`, xem `viecCuaCron`). */
function cron(scheduledTime: number): ReturnType<typeof chayCron> {
  return chayCron({ scheduledTime }, env);
}

const PHUT = 60_000;

/**
 * **Mốc gốc của đồng hồ giả**: 2030-01-07 03:00 UTC = **10:00 giờ Việt Nam** —
 * ngoài giờ yên lặng (mục 12), ngoài hai cửa sổ báo cáo sáng/tối (07:30, 20:00
 * VN) và ngoài cửa sổ sao lưu (19:00 UTC), nên mỗi nhịp cron chỉ bật đúng việc của
 * bước đang xét. Phút 00 chia hết cho 5 và 10.
 */
const GOC = Date.UTC(2030, 0, 7, 3, 0, 0);

const bay = soRequestBay();

afterEach(async () => {
  // Chờ sổ TRƯỚC (BAT-54): thân ca hết giờ / lệnh còn bay có thể còn dùng đồng hồ giả,
  // kênh giả và bảng giả lập — đặt lại chúng khi nó chưa xong là đổi đất dưới chân nó.
  await bay.doiHet();
  vi.useRealTimers();
  boNguonTelegram();
  // Về bảng giả lập RỖNG chứ không về nguồn thật: không ca nào được gọi mạng.
  datNguonGiaLap({});
}, 45_000);

// Cả thân mỗi ca cũng đi qua sổ đó (BAT-53, xem `caQuaSo`): ca hết giờ không để các
// lệnh CLI còn lại của thân bắn request vào lúc pool pop storage. `it.todo` (không có
// thân) vẫn dùng `itGoc`.
const { it } = caQuaSo(bay);

/* ================================================================== *
 * Bước 1 — chuỗi đầy đủ qua CLI
 * ================================================================== */

/**
 * Dựng chuỗi của bước 1 tới lúc **commit chưa merge** (ticket dự án ở Chờ kiểm
 * chứng, đã có review `pass`). Bước 1 và bước 2 dùng chung, mỗi bước tự đi tiếp
 * nửa "merge".
 */
async function chuoiToiChoMerge(
  n: Nen,
  /**
   * Gọi giữa các chặng. Với **đồng hồ giả** (bước 2) `Date.now()` đứng yên, nên
   * commit và review sẽ mang **cùng một mili giây** — và 19.3 chỉ tính review gửi
   * **sau** commit. Bước 2 truyền một hàm nhích đồng hồ 1 giây; bước 1 (đồng hồ
   * thật) không cần.
   */
  nhich: () => void = () => undefined,
): Promise<{
  COS: string;
  SAI: string;
  ma_cos: string;
  ma_sai: string;
}> {
  const { tk, ag } = n;
  datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });

  /* 1a. coordinator tạo ticket điều phối và giao manager. */
  const cos = await cli<{ id: string; ma: string; trang_thai: string }>(tk.coord, [
    'create',
    'COS',
    '[Giao M-Sample] Làm tính năng A',
  ]);
  expect(cos.ma).toBe('COS-1');
  const lg_dp = await cli<{ id: string; loai: string; ticket_trang_thai: string }>(tk.coord, [
    'assign',
    'COS-1',
    ag.man,
  ]);
  expect(lg_dp.loai).toBe('work');
  expect(lg_dp.ticket_trang_thai).toBe('in_progress');

  /* 1b. manager nhận lượt điều phối, tạo ticket dự án và giao worker. */
  const t_man = await cli<{ luot_giao: { id: string }[] }>(tk.man, ['tasks']);
  expect(t_man.luot_giao.map((l) => l.id)).toEqual([lg_dp.id]);
  await cli(tk.man, ['claim', lg_dp.id]);

  const sai = await cli<{ id: string; ma: string }>(tk.man, ['create', 'SAI', 'Làm tính năng A']);
  expect(sai.ma).toBe('SAI-1');

  /*
   * Nối "điều phối" COS-1 → SAI-1 bằng token **của coordinator** qua CLI
   * `baton link` (BAT-43, T-50 = A, `spec-questions.md` #168; mặc định `dieu_phoi`).
   */
  const noi = await cli<{ tu_ticket_id: string; den_ticket_id: string; loai_lien_ket: string }>(
    tk.coord,
    ['link', 'COS-1', 'SAI-1'],
  );
  expect(noi).toEqual({ tu_ticket_id: cos.id, den_ticket_id: sai.id, loai_lien_ket: 'dieu_phoi' });

  const lg_wk = await cli<{ id: string; ticket_trang_thai: string }>(tk.man, ['assign', 'SAI-1', ag.wk]);
  expect(lg_wk.ticket_trang_thai).toBe('in_progress');
  expect(await trangThaiCua(cos.id)).toBe('in_progress');

  /* 1c. worker nhận, gửi nhịp tim, gửi commit, rồi nộp báo cáo. */
  const t_wk = await cli<{ luot_giao: { id: string }[] }>(tk.wk, ['tasks']);
  expect(t_wk.luot_giao.map((l) => l.id)).toEqual([lg_wk.id]);
  const claim = await cli<{ phien_id: string }>(tk.wk, ['claim', lg_wk.id]);
  await cli(tk.wk, ['heartbeat', 'đang dựng tính năng A']);
  expect((await phienTrongDb(claim.phien_id))?.ghi_chu_cuoi).toBe('đang dựng tính năng A');

  const ev = await cli<{ xac_minh: string; ticket_trang_thai: string }>(tk.wk, [
    'evidence',
    'SAI-1',
    'commit',
    HASH,
    REPO,
  ]);
  expect(ev.xac_minh).toBe('pushed');
  nhich();

  const nop = await cli<{ trang_thai: string; phien_da_dong: boolean; ticket_trang_thai: string }>(
    tk.wk,
    ['submit', lg_wk.id, 'bc.md'],
    MA_THOAT.xong,
    { 'bc.md': BAO_CAO_WORKER },
  );
  expect(nop.trang_thai).toBe('submitted');
  expect(nop.phien_da_dong).toBe(true);
  // 19.2: nộp `done` mà cổng thiếu commit merged ⇒ Chờ kiểm chứng.
  expect(nop.ticket_trang_thai).toBe('verifying');
  await cli(tk.man, ['verdict', lg_wk.id, 'accept']);
  expect(await trangThaiCua(sai.id)).toBe('verifying');

  /*
   * 1d. manager giao reviewer; reviewer gửi review `pass`.
   *
   * Lượt **review** tạo bằng token **của manager** qua CLI `baton assign --review`
   * (BAT-43, T-50 = A, `spec-questions.md` #168). Cả chuỗi bước 1 nay đi trọn CLI.
   */
  const lg_rv = await cli<{ id: string; loai: string }>(tk.man, ['assign', 'SAI-1', ag.rv, '--review']);
  expect(lg_rv.loai).toBe('review');

  await cli(tk.rv, ['claim', lg_rv.id]);
  const rv = await cli<{ loai: string; review_nguon: string }>(tk.rv, [
    'evidence',
    'SAI-1',
    'review',
    'pass',
    'Đọc diff, test đạt',
  ]);
  expect(rv.loai).toBe('review');
  expect(rv.review_nguon).toBe('reviewer');
  const nop_rv = await cli<{ trang_thai: string }>(tk.rv, ['submit', lg_rv.id, 'rv.md'], MA_THOAT.xong, {
    'rv.md': BAO_CAO_REVIEWER,
  });
  // 19.3: lượt review tự `accepted`.
  expect(nop_rv.trang_thai).toBe('accepted');

  // Commit vẫn chưa merge ⇒ cả hai ticket chưa Xong.
  expect(await trangThaiCua(sai.id)).toBe('verifying');
  expect(await trangThaiCua(cos.id)).toBe('in_progress');

  return { COS: cos.id, SAI: sai.id, ma_cos: cos.ma, ma_sai: sai.ma };
}

describe('Bước 1 — 3 dự án, 4 agent, chuỗi đầy đủ qua CLI, ticket tự lên Xong', () => {
  it('coordinator → manager → worker → reviewer → merge ⇒ SAI-1 và COS-1 cùng Xong, xem bên nào cũng thấy bên kia', async () => {
    const n = await dungNen();
    const t = await chuoiToiChoMerge(n);

    /* 1e. Commit được merge (nguồn GitHub giả lập), Cron kiểm lại commit `pushed`. */
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
    const kq = await cron(Date.UTC(2026, 9, 6, 3, 10)); // phút chia hết 10 ⇒ việc `theo_doi`
    expect(kq.theo_doi.so_tu_len_xong).toBe(1);

    expect(await trangThaiCua(t.SAI)).toBe('done');
    // 19.4: mọi ticket dự án đã kết và có Xong ⇒ ticket điều phối Xong.
    expect(await trangThaiCua(t.COS)).toBe('done');

    // Lịch sử: người đưa lên Xong là "hệ thống" (mục 7, tự lên Xong).
    const ls = await env.DB.prepare(
      `SELECT tac_gia_loai FROM ticket_history
        WHERE ticket_id = ? AND truong = 'trang_thai' AND gia_tri_moi = 'done'`,
    )
      .bind(t.SAI)
      .all<{ tac_gia_loai: string }>();
    expect(ls.results.map((d) => d.tac_gia_loai)).toEqual(['system']);

    // "Cả hai ticket phản ánh đúng" + mục 4 "Xem ticket nào cũng thấy ticket kia".
    interface Show {
      ticket: { trang_thai: string; lien_ket: { ma: string; loai: string }[] };
      luot_giao: { loai: string; trang_thai: string }[];
    }
    const show_sai = await cli<Show>(n.tk.man, ['show', 'SAI-1']);
    expect(show_sai.ticket.trang_thai).toBe('done');
    expect(show_sai.ticket.lien_ket.map((l) => [l.ma, l.loai])).toContainEqual(['COS-1', 'dieu_phoi']);
    expect(show_sai.luot_giao.map((l) => [l.loai, l.trang_thai])).toEqual([
      ['work', 'accepted'],
      ['review', 'accepted'],
    ]);
    const show_cos = await cli<Show>(n.tk.coord, ['show', 'COS-1']);
    expect(show_cos.ticket.trang_thai).toBe('done');
    expect(show_cos.ticket.lien_ket.map((l) => [l.ma, l.loai])).toContainEqual(['SAI-1', 'dieu_phoi']);
  }, 30_000);

  /**
   * **"manager giao reviewer" qua CLI** — SPEC 17 bước 1 + 19.3. Trước BAT-43 bảng
   * lệnh mục 13 chỉ có `baton assign <MÃ> <agent>` và lệnh đó chỉ tạo lượt `work`:
   * reviewer thành "người làm" của 19.3 và review của chính họ bị `REVIEWER_IS_WORKER`
   * (ca `it.fails` cũ). Chủ chốt T-50 = A (22/10, `spec-questions.md` #168): thêm cờ
   * `baton assign --review`. Không cờ vẫn là `work` — ca thứ hai ghim điều đó.
   */
  async function giaoReviewerBangCli(
    co_review: boolean,
  ): Promise<{ loai: string; code: number; chu: string }> {
    const n = await dungNen();
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });
    await cli(n.tk.man, ['create', 'SAI', 'Việc B']);
    const lg = await cli<{ id: string }>(n.tk.man, ['assign', 'SAI-1', n.ag.wk]);
    await cli(n.tk.wk, ['claim', lg.id]);
    await cli(n.tk.wk, ['evidence', 'SAI-1', 'commit', HASH, REPO]);
    await cli(n.tk.wk, ['submit', lg.id, 'bc.md'], MA_THOAT.xong, { 'bc.md': BAO_CAO_WORKER });

    const lg_rv = await cli<{ id: string; loai: string }>(n.tk.man, [
      'assign',
      'SAI-1',
      n.ag.rv,
      ...(co_review ? ['--review'] : []),
    ]);
    await cli(n.tk.rv, ['claim', lg_rv.id]);
    const r = await cliChu(n.tk.rv, ['evidence', 'SAI-1', 'review', 'pass']);
    return { loai: lg_rv.loai, ...r };
  }

  it('manager giao reviewer BẰNG CLI (`baton assign --review`) rồi reviewer gửi review pass được nhận', async () => {
    const r = await giaoReviewerBangCli(true);
    expect(r.loai).toBe('review');
    expect(r.code, r.chu).toBe(MA_THOAT.xong);
    expect(r.chu).not.toContain('REVIEWER_IS_WORKER');
  }, 30_000);

  it('không cờ `--review`: `baton assign` vẫn tạo lượt `work`, nên review của người nhận bị `REVIEWER_IS_WORKER` (19.3)', async () => {
    const r = await giaoReviewerBangCli(false);
    expect(r.loai).toBe('work');
    expect(r.code).toBe(MA_THOAT.loi_nghiep_vu);
    expect(r.chu).toContain('REVIEWER_IS_WORKER');
  }, 30_000);

  /**
   * **Nối ticket điều phối với ticket dự án qua CLI** — SPEC mục 4, 19.4, 17 bước 1.
   * Lệnh `baton link` thêm ở BAT-43 (T-50 = A, `spec-questions.md` #168), mặc định
   * `dieu_phoi`. Ca này đứng riêng (ngoài chuỗi đầy đủ ở ca đầu, vốn cũng nối bằng
   * `baton link`) để kiểm **hai chiều thấy nhau** qua `baton show` của cả hai bên
   * ngay sau khi nối, trước mọi việc khác.
   */
  it('coordinator nối "điều phối" COS-1 ↔ SAI-1 bằng `baton link`; `baton show` bên nào cũng thấy bên kia', async () => {
    const n = await dungNen();
    await cli(n.tk.coord, ['create', 'COS', '[Giao M-Sample] Việc C']);
    await cli(n.tk.man, ['create', 'SAI', 'Việc C']);

    const r = await cliChu(n.tk.coord, ['link', 'COS-1', 'SAI-1']);
    expect(r.code, r.chu).toBe(MA_THOAT.xong);
    expect(r.chu).toContain('Đã nối COS-1 → SAI-1: Điều phối (dieu_phoi).');

    interface Show {
      ticket: { tieu_de: string; lien_ket: { ma: string; loai: string; nguoc: boolean }[] };
    }
    const cos = await cli<Show>(n.tk.coord, ['show', 'COS-1']);
    expect(cos.ticket.lien_ket.map((l) => [l.ma, l.loai, l.nguoc])).toEqual([['SAI-1', 'dieu_phoi', false]]);
    // Tiêu đề `[Giao …]` do coordinator tự gõ, lệnh nối không sinh/sửa gì (#168).
    expect(cos.ticket.tieu_de).toBe('[Giao M-Sample] Việc C');
    const sai = await cli<Show>(n.tk.man, ['show', 'SAI-1']);
    expect(sai.ticket.lien_ket.map((l) => [l.ma, l.loai, l.nguoc])).toEqual([['COS-1', 'dieu_phoi', true]]);
    expect(sai.ticket.tieu_de).toBe('Việc C');
  }, 30_000);
});

/* ================================================================== *
 * Bước 2 — chưa merge: Chờ kiểm chứng; merge: trong 10 phút lên Xong
 * ================================================================== */

describe('Bước 2 — commit chưa merge ⇒ Chờ kiểm chứng; merge xong ⇒ trong 10 phút tự lên Xong', () => {
  it('đồng hồ giả: các nhịp cron trước khi merge giữ Chờ kiểm chứng; merge lúc 03:01 ⇒ Xong ở nhịp 03:10 (9 phút)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(GOC - 5 * PHUT);
    const n = await dungNen();
    const t = await chuoiToiChoMerge(n, () => {
      vi.setSystemTime(Date.now() + 1_000);
    });

    // Chưa merge: nhịp theo dõi 03:00 hỏi GitHub, vẫn `pushed` ⇒ Chờ kiểm chứng.
    vi.setSystemTime(GOC);
    const truoc = await cron(GOC);
    expect(truoc.theo_doi.so_dong).toBe(1);
    expect(truoc.theo_doi.so_tu_len_xong).toBe(0);
    expect(await trangThaiCua(t.SAI)).toBe('verifying');

    // Merge lúc 03:01. Mỗi phút một nhịp cron, như Worker thật (`* * * * *`).
    const merge_luc = GOC + PHUT;
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
    let xong_luc: number | null = null;
    for (let phut = 1; phut <= 10 && xong_luc === null; phut += 1) {
      const luc = GOC + phut * PHUT;
      vi.setSystemTime(luc);
      await cron(luc);
      if ((await trangThaiCua(t.SAI)) === 'done') xong_luc = luc;
      else expect(await trangThaiCua(t.SAI)).toBe('verifying');
    }
    expect(xong_luc, 'phải lên Xong trong 10 phút sau merge').not.toBeNull();
    expect((xong_luc ?? Infinity) - merge_luc).toBeLessThanOrEqual(10 * PHUT);
    expect(await trangThaiCua(t.COS)).toBe('done');
  }, 30_000);

  it('máy chủ đọc ĐÚNG đồng hồ giả (để các phép "30 phút", "10 phút" ở đây có nghĩa)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(GOC + 7 * PHUT);
    await dungWorkspace();
    expect((await tongQuanChu()).bay_gio).toBe(GOC + 7 * PHUT);
  });
});

/* ================================================================== *
 * Bước 3 — worker im 30 phút
 * ================================================================== */

describe('Bước 3 — worker im 30 phút ⇒ Tổng quan hiện phiên đứng, dự án 🟡, Telegram nhận 1 tin', () => {
  it('nhịp tim 10:00; 10:25 vẫn 🟢 và 0 tin; 10:30 ⇒ phiên đứng ở "Cần chú ý", SAI 🟡, đúng 1 tin; 10:35 vẫn 1 tin', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(GOC);
    const n = await dungNen();
    const kenh = datNguonTelegram();

    await cli(n.tk.man, ['create', 'SAI', 'Việc đang làm']);
    const lg = await cli<{ id: string }>(n.tk.man, ['assign', 'SAI-1', n.ag.wk]);
    const claim = await cli<{ phien_id: string }>(n.tk.wk, ['claim', lg.id]);
    await cli(n.tk.wk, ['heartbeat', 'bắt đầu']);

    // ĐỐI CHỨNG: im 25 phút — chưa tới ngưỡng 30 (mục 6).
    vi.setSystemTime(GOC + 25 * PHUT);
    await cron(GOC + 25 * PHUT);
    let tq = await tongQuanChu();
    expect(tq.du_an.find((d) => d.ma === 'SAI')?.suc_song).toBe('xanh');
    expect(kenh.da_gui).toEqual([]);

    // Im đúng 30 phút.
    vi.setSystemTime(GOC + 30 * PHUT);
    await cron(GOC + 30 * PHUT);
    tq = await tongQuanChu();
    expect(tq.du_an.find((d) => d.ma === 'SAI')?.suc_song).toBe('vang');
    const dong = tq.can_chu_y.find((g) => g.ticket?.ma === 'SAI-1');
    expect(dong?.ly_do.map((l) => l.loai)).toContain('phien_dung_hoac_loi');
    expect(dong?.ly_do.find((l) => l.loai === 'phien_dung_hoac_loi')?.phien?.id).toBe(claim.phien_id);
    expect(kenh.da_gui).toHaveLength(1);
    expect(kenh.da_gui[0]?.link).toBe('https://baton.test/t/SAI-1');

    // "1 tin": nhịp sau không bắn lại cho cùng một lần đứng.
    vi.setSystemTime(GOC + 35 * PHUT);
    await cron(GOC + 35 * PHUT);
    expect(kenh.da_gui).toHaveLength(1);
  }, 30_000);
});

/* ================================================================== *
 * Bước 4 — ask Quyết định 🔴 3 phương án, chủ chọn B, result --wait ≤ 3 giây
 * ================================================================== */

describe('Bước 4 — `ask` Quyết định 🔴 3 phương án ⇒ Telegram ngay; chủ chọn B + Gửi duyệt ⇒ `result --wait` trả B ≤ 3 giây', () => {
  it('đi trọn: Telegram 1 tin khẩn → chủ (cookie web) gửi B → agent nhận B dưới 3 giây → Nhật ký + bình luận tự động', async () => {
    const n = await dungNen();
    await cli(n.tk.man, ['create', 'SAI', 'Việc cần quyết']);
    const kenh = datNguonTelegram();

    const muc = await cli<{ id: string; ma: string }>(n.tk.man, [
      'ask',
      '--level',
      'urgent',
      '--type',
      'decision',
      'Chọn ngưỡng cảnh báo',
      '--option',
      'A: 300',
      '--option',
      'B: 500',
      '--option',
      'C: 1000',
      '--recommend',
      'B: số liệu tuần trước',
      '--ticket',
      'SAI-1',
    ]);
    expect((await canChuTrongDb(muc.id))?.muc).toBe('urgent');

    // ĐỐI CHỨNG "ngay": mã thật CẤT tin vào kho lúc `ask`, KHÔNG gửi đồng bộ —
    // ngay sau `ask` kênh giả chưa nhận tin nào. Tin đi ở nhịp cron kế tiếp
    // (`cron-thong-bao.ts`, `* * * * *`) ⇒ chậm tới ~60 s. "Ngay" = trong một
    // nhịp cron, ≤ 60 s — Chủ chốt T-50 = A (22/10), SPEC mục 8/17/19.8, #170.
    expect(kenh.da_gui).toEqual([]);

    // "Telegram báo ngay": nhịp cron kế tiếp (mỗi phút) gửi tin 🔴 khẩn. Mốc nhịp
    // 03:01 UTC chỉ bật việc gửi + thử lại; tin 🔴 đi cả trong giờ yên lặng (19.8).
    await cron(GOC + PHUT);
    expect(kenh.da_gui).toHaveLength(1);
    expect(kenh.da_gui[0]?.noi_dung).toContain(muc.ma);
    expect(kenh.da_gui[0]?.link).toBe('https://baton.test/can-chu');

    // Chủ đăng nhập trên "điện thoại" (cookie phiên, đúng đường của trang web).
    const cookie = await chuDangNhap();
    const nk_truoc = (await nhatKyTheoThuTu()).length;

    // Agent đang chờ bằng `baton result T-x --wait 30`.
    const b = ban(n.tk.man);
    const dang_cho = bay.theoDoi(chayCli(['result', muc.ma, '--wait', '30'], b.mt));
    const soCho = (): Promise<number> =>
      runInDurableObject(cuaGhiCua(env, WS), (g: WorkspaceGate) => g.soDangCho());
    await choToi(async () => (await soCho()) === 1);
    expect(await soCho()).toBe(1);

    // Chủ chạm B rồi "Gửi duyệt" — thân đúng như `xuLyMuc` của web gửi.
    const t_gui = Date.now();
    const gui = await web(`/v1/can-chu/${muc.id}/xu-ly`, cookie, {
      method: 'POST',
      than: { phuong_an: 'B' },
    });
    expect(gui.status).toBe(200);

    expect(await dang_cho).toBe(MA_THOAT.xong);
    const ms = Date.now() - t_gui;
    // `warn` (không `log`): luật ESLint của repo chỉ cho `error`/`warn`; đây là số đo in ra để ghi vào nghiem-thu-v0.1.md.
    console.warn(`[nghiệm thu bước 4] result --wait nhận kết quả sau ${String(ms)} ms kể từ lúc chủ bấm Gửi`);
    expect(ms).toBeLessThan(3_000);
    expect(b.ra.join('\n')).toContain('Phương án đã chọn: B — 500');

    // Nhật ký có dòng mới của chủ; ticket liên quan có bình luận tự động.
    const nk = await nhatKyTheoThuTu();
    expect(nk.length).toBe(nk_truoc + 1);
    expect(nk.at(-1)?.nguoi_loai).toBe('chu');
    const sai = await env.DB.prepare("SELECT id FROM ticket WHERE project_id = ? AND so = 1")
      .bind(n.pj.SAI)
      .first<{ id: string }>();
    const bl = await binhLuanCuaTicket(sai?.id ?? '');
    expect(bl.some((c) => c.noi_dung.startsWith(`${muc.ma} đã xử lý:`))).toBe(true);
  }, 30_000);
});

/* ================================================================== *
 * Bước 5 — ô trả lời hàng loạt (nửa máy chủ)
 * ================================================================== */

describe('Bước 5 — trả lời hàng loạt 3 dòng `T-x: ...` ⇒ cả 3 mục được xử lý đúng (nửa máy chủ)', () => {
  /**
   * Ô hàng loạt **tách dòng ở trình duyệt** rồi gọi `POST /v1/can-chu/:id/xu-ly`
   * cho từng mục, tuần tự (`packages/web/src/tra-loi-hang-loat.ts`). Nửa tách dòng,
   * xem trước và **dòng sai mã báo đỏ** ở `packages/web/test/nghiem-thu-17.test.tsx`.
   * Ở đây: ba thân đúng như bộ tách sinh ra cho ba dòng
   * `T-a: đã xem` · `T-b: B, ngưỡng 500` · `T-c: đã chạy`, gửi bằng cookie web,
   * và máy chủ ghi đúng cả ba.
   */
  it('ba mục ba loại (fyi · decision · run_command), mỗi mục đúng kết quả của dòng mình', async () => {
    const n = await dungNen();
    await cli(n.tk.man, ['create', 'SAI', 'Việc có ba mục']);
    const a = await cli<{ id: string; ma: string }>(n.tk.man, [
      'ask', '--level', 'today', '--type', 'fyi', 'Đã dựng bản nháp', '--ticket', 'SAI-1',
    ]);
    const b = await cli<{ id: string; ma: string }>(n.tk.man, [
      'ask', '--level', 'today', '--type', 'decision', 'Chọn ngưỡng',
      '--option', 'A: 300', '--option', 'B: 500', '--recommend', 'B: vừa', '--ticket', 'SAI-1',
    ]);
    const c = await cli<{ id: string; ma: string }>(n.tk.man, [
      'ask', '--level', 'later', '--type', 'run_command', 'Chạy migration', '--command', 'npm run migrate',
    ]);
    const cookie = await chuDangNhap();

    const lo: [string, Record<string, string>][] = [
      [a.id, { ghi_them: 'đã xem' }],
      [b.id, { phuong_an: 'B', ghi_them: 'ngưỡng 500' }],
      [c.id, { ghi_them: 'đã chạy' }],
    ];
    for (const [id, than] of lo) {
      expect((await web(`/v1/can-chu/${id}/xu-ly`, cookie, { method: 'POST', than })).status).toBe(200);
    }

    const da = await Promise.all([a, b, c].map((m) => canChuTrongDb(m.id)));
    expect(da.map((d) => d?.trang_thai)).toEqual(['resolved', 'resolved', 'resolved']);
    expect(da[0]?.ket_qua).toBe('đã xem');
    expect(da[1]?.ket_qua).toBe('B, ngưỡng 500');
    expect(da[2]?.ket_qua).toBe('đã chạy');

    // 19.10: dòng trỏ tới mục ĐÃ xử lý thì máy chủ cũng không áp lại (lưới cuối).
    const lai = await web(`/v1/can-chu/${a.id}/xu-ly`, cookie, { method: 'POST', than: { ghi_them: 'lần hai' } });
    expect(lai.status).toBe(409);
    expect((await lai.json<{ error: string }>()).error).toBe('ALREADY_RESOLVED');
  }, 30_000);
});

/* ================================================================== *
 * Bước 6 — dự án không có ticket Đang làm
 * ================================================================== */

describe('Bước 6 — dự án không có ticket Đang làm ⇒ "Dự án không chạy" (nửa máy chủ: ⚪)', () => {
  it('INC chỉ có ticket Cần làm / Xong ⇒ sức sống ⚪ (`trang`); SAI có ticket Đang làm ⇒ không ⚪', async () => {
    const n = await dungNen();
    await dungTicket(n.pj.INC, 1, 'Việc chưa làm', { trang_thai: 'todo' });
    await dungTicket(n.pj.INC, 2, 'Việc đã xong', { trang_thai: 'done' });
    await cli(n.tk.man, ['create', 'SAI', 'Việc đang làm']);
    const lg = await cli<{ id: string }>(n.tk.man, ['assign', 'SAI-1', n.ag.wk]);
    await cli(n.tk.wk, ['claim', lg.id]);

    const tq = await tongQuanChu();
    expect(tq.du_an.find((d) => d.ma === 'INC')?.suc_song).toBe('trang');
    expect(tq.du_an.find((d) => d.ma === 'COS')?.suc_song).toBe('trang');
    expect(tq.du_an.find((d) => d.ma === 'SAI')?.suc_song).toBe('xanh');
    // Chữ "Dự án không chạy" do trang web vẽ từ `trang` — ca ở web/test/nghiem-thu-17.test.tsx.
  }, 30_000);
});

/* ================================================================== *
 * Bước 7 — FORBIDDEN và NOT_FOUND
 * ================================================================== */

describe('Bước 7 — token worker giao việc ⇒ FORBIDDEN; token không có quyền INC đọc ticket INC ⇒ NOT_FOUND', () => {
  it('`baton assign` bằng token worker ⇒ FORBIDDEN (mã thoát 1, HTTP 403)', async () => {
    const n = await dungNen();
    await cli(n.tk.man, ['create', 'SAI', 'Việc']);
    const r = await cliChu(n.tk.wk, ['assign', 'SAI-1', n.ag.rv]);
    expect(r.code).toBe(MA_THOAT.loi_nghiep_vu);
    expect(r.chu).toContain('FORBIDDEN');

    const sai = await env.DB.prepare('SELECT id FROM ticket WHERE project_id = ?').bind(n.pj.SAI).first<{ id: string }>();
    const h = await goiApi(`/v1/ticket/${sai?.id ?? ''}/luot-giao`, n.tk.wk, {
      method: 'POST',
      than: { nguoi_nhan_agent_id: n.ag.rv },
    });
    expect(h.status).toBe(403);
    expect((await h.json<{ error: string }>()).error).toBe('FORBIDDEN');
  }, 30_000);

  it('`baton show INC-1` bằng token không vào INC ⇒ NOT_FOUND (mã thoát 1, HTTP 404) — cả bốn agent', async () => {
    const n = await dungNen();
    const id = await dungTicket(n.pj.INC, 1, 'Việc của INC');
    for (const token of [n.tk.coord, n.tk.man, n.tk.wk, n.tk.rv]) {
      const r = await cliChu(token, ['show', 'INC-1']);
      expect(r.code).toBe(MA_THOAT.loi_nghiep_vu);
      expect(r.chu).toContain('NOT_FOUND');
      const h = await goiApi(`/v1/ticket/${id}`, token);
      expect(h.status).toBe(404);
      expect((await h.json<{ error: string }>()).error).toBe('NOT_FOUND');
    }
    // ĐỐI CHỨNG: chủ đọc được — ticket có thật, 404 ở trên là vì quyền.
    expect((await goiApi(`/v1/ticket/${id}`, TOKEN_CHU)).status).toBe(200);
  }, 30_000);
});

/* ================================================================== *
 * Bước 8 — chủ bấm Dừng ⇒ lệnh kế tiếp của agent thoát mã 3
 * ================================================================== */

describe('Bước 8 — chủ bấm Dừng ⇒ lệnh nhịp tim kế tiếp của agent thoát mã 3', () => {
  /**
   * Mục 17 bước 8 viết "lệnh `heartbeat` kế tiếp" (trước là "lệnh `tim`"; sửa chữ
   * theo T-50 = A, 22/10 — `spec-questions.md` #169). Ca kiểm cả
   * `baton tasks` (mục 6: "lần gọi kế tiếp của agent nhận về tín hiệu STOP").
   */
  it('chủ (cookie web) POST Dừng ⇒ phiên `stopping`; `baton heartbeat` in STOP, mã thoát 3; `tasks` cũng mã 3', async () => {
    const n = await dungNen();
    await cli(n.tk.man, ['create', 'SAI', 'Việc sẽ bị dừng']);
    const lg = await cli<{ id: string }>(n.tk.man, ['assign', 'SAI-1', n.ag.wk]);
    const claim = await cli<{ phien_id: string }>(n.tk.wk, ['claim', lg.id]);

    // ĐỐI CHỨNG: trước khi Dừng, nhịp tim thoát 0.
    expect((await cliChu(n.tk.wk, ['heartbeat'])).code).toBe(MA_THOAT.xong);

    const cookie = await chuDangNhap();
    const dung = await web(`/v1/phien/${claim.phien_id}/dung`, cookie, { method: 'POST' });
    expect(dung.status).toBe(200);
    expect((await phienTrongDb(claim.phien_id))?.trang_thai).toBe('stopping');

    const hb = await cliChu(n.tk.wk, ['heartbeat']);
    expect(hb.code).toBe(MA_THOAT.nhan_stop);
    expect(hb.chu).toContain('STOP');
    expect((await cliChu(n.tk.wk, ['tasks'])).code).toBe(MA_THOAT.nhan_stop);
  }, 30_000);
});

/* ================================================================== *
 * Bước 9 — nhập can-chu.md và decision-log.md
 * ================================================================== */

describe('Bước 9 — nhập `sample-data/needs-owner-sample.md` và `sample-data/decision-log-sample.md` (mục 16), giữ nguyên số T', () => {
  /**
   * **TRƯỢT — chưa có đường nhập.** Mục 16 **hoãn theo T-119** (Chủ chốt A, 16/10;
   * `spec-questions.md` #142): không có route, lệnh CLI hay màn hình nào nhận file
   * markdown Cần Chủ / Nhật ký. Không viết `it.fails` vì SPEC không đặt tên giao
   * diện nhập (route/lệnh), nên không có gì để gọi mà không bịa ra.
   */
  itGoc.todo('TRƯỢT — nhập needs-owner-sample.md: giữ nguyên số T, bộ đếm T tiếp tục từ số lớn nhất (mục 16; hoãn T-119)');
  itGoc.todo('TRƯỢT — nhập decision-log-sample.md: mỗi dòng bảng thành một dòng Nhật ký (mục 16; hoãn T-119)');
  itGoc.todo('TRƯỢT — chạy lại lần hai bỏ qua mục đã nhập, in báo cáo đã nhập/bỏ qua/lỗi (mục 16; hoãn T-119)');
});

/* ================================================================== *
 * Bước 10 — 200 dự án + 200.000 ticket: danh sách và Tổng quan < 1 giây
 * ================================================================== */

describe('Bước 10 — danh sách và Tổng quan MỞ ĐƯỢC khi nhiều việc (lỗi tìm thấy khi đo 200.000 ticket)', () => {
  /**
   * Số đo đầy đủ ở `npm run do-hieu-nang` (200 dự án, 200.000 ticket). Lần nghiệm
   * thu BAT-9 bộ đo đó cho thấy **Tổng quan thật** (`tongQuan`) và **màn hình danh
   * sách thật của web** (`manHinhDanhSachTicket` với `limit = 200` của
   * `packages/web/src/api.ts`) **ném** `D1_ERROR: too many SQL variables` —
   * `themCuaThe` (`src/doc-man-hinh-ticket.ts`) đặt **mọi** id của trang vào một
   * `IN (...)`, còn D1 chặn ở 100 tham số bind. Ngưỡng là **100 thẻ** một lượt
   * (1 tham số `workspace_id` + 100 id), không phải 200.000.
   *
   * **BAT-42 đã sửa**: mọi `IN (...)` động đi qua `chiaLoThamSo`
   * (`src/chia-lo-tham-so.ts`, tổng tham số mỗi câu ≤ 90). Các ca dưới dựng đúng
   * biên (89/90/91/100/250 thẻ) và kiểm **một thẻ ở lô sau** mang đủ nhãn, con,
   * Cần Chủ, tên người cầm — chứng minh gộp lô đúng nghĩa, không chỉ "hết 500".
   */
  const GOC_10 = Date.UTC(2030, 0, 1);

  /**
   * `so` ticket Đang làm `SAI-1..so`, **một batch**; `tao_luc` tăng theo số nên
   * thứ tự danh sách d.403 (`tao_luc DESC`, cùng mức ưu tiên) là `SAI-so … SAI-1`
   * — vị trí `p` (từ 0) là `SAI-(so − p)`.
   */
  async function dungNhieuViec(so: number): Promise<Nen> {
    const n = await dungNen();
    const cau = [];
    for (let i = 1; i <= so; i += 1) {
      cau.push(
        env.DB.prepare(
          `INSERT INTO ticket
             (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien, hang_uu_tien,
              chiu_trach_nhiem_loai, chu_tu_lam, nguoi_tao_loai, tao_luc, cap_nhat_luc)
           VALUES (?, ?, ?, ?, ?, 'in_progress', 'none', 4, 'owner', 0, 'owner', ?, ?)`,
        ).bind(`tk-${n.pj.SAI}-${String(i)}`, WS, n.pj.SAI, i, `Việc ${String(i)}`, GOC_10 + i, GOC_10 + i),
      );
    }
    cau.push(
      env.DB.prepare(
        `INSERT INTO bo_dem (workspace_id, pham_vi, khoa, gia_tri) VALUES (?, 'project', ?, ?)
         ON CONFLICT (workspace_id, pham_vi, khoa) DO UPDATE SET gia_tri = max(gia_tri, excluded.gia_tri)`,
      ).bind(WS, n.pj.SAI, so),
    );
    await env.DB.batch(cau);
    return n;
  }

  it('100 ticket Đang làm: `GET /v1/tong-quan` trả 200 (SPEC mục 17 bước 10 + 19.12 câu 1)', async () => {
    await dungNhieuViec(100);
    const r = await goiApi('/v1/tong-quan', TOKEN_CHU);
    expect(r.status).toBe(200);
  }, 60_000);

  it('100 ticket: `GET /v1/man-hinh-ticket?limit=200` (cỡ trang của web) trả 200 (mục 17 bước 10 + mục 14)', async () => {
    await dungNhieuViec(100);
    const r = await goiApi('/v1/man-hinh-ticket?limit=200', TOKEN_CHU);
    expect(r.status).toBe(200);
  }, 60_000);

  /**
   * Trước BAT-42 đây là ca "HIỆN TRẠNG" ghim **500** ở cả hai đường (nguyên nhân
   * đã xác nhận qua stderr của workerd: `themCuaThe` ← `duAnVaViecDangChay` ←
   * `tongQuan`, và `themCuaThe` ← `manHinhDanhSachTicket`). Nay cả hai **200**.
   */
  it('100 ticket ⇒ cả hai đường trả 200 (trước BAT-42: 500); trang 50 dòng vẫn 200', async () => {
    await dungNhieuViec(100);
    expect((await goiApi('/v1/tong-quan', TOKEN_CHU)).status).toBe(200);
    expect((await goiApi('/v1/man-hinh-ticket?limit=200', TOKEN_CHU)).status).toBe(200);
    expect((await goiApi('/v1/man-hinh-ticket?limit=50', TOKEN_CHU)).status).toBe(200);
  }, 60_000);

  interface TheRa {
    ma: string;
    nhan: string[];
    con_tong: number;
    con_chua_ket: number;
    can_chu_so: number;
    nguoi_cam_ten: string | null;
  }

  /**
   * Biên của lô: `themCuaThe` có 1 tham số khác ⇒ lô 89 id. 89 thẻ = 1 lô; 90 =
   * 89 + 1; 91 = 89 + 2; 100; 250 (danh sách cắt ở 200 ⇒ 89 + 89 + 22).
   *
   * Thẻ được trang trí là thẻ **cuối trang** (vị trí `min(so, 200) − 1`) — từ 90
   * thẻ trở lên nó nằm ở lô thứ hai trở đi. Nó mang: 2 nhãn (thứ tự `nhan`), 3
   * con ở dự án INC (1 xong, 2 chưa kết — INC không Đang làm nên không lẫn vào
   * khối), 1 mục Cần Chủ đang Chờ + 1 mục đã bỏ qua, và một lượt `in_progress`
   * của W-builder (19.1 bậc 1 ⇒ người đang cầm).
   */
  // Vòng `for` thay `it.each` (BAT-53): `caQuaSo` chỉ bọc dạng `it(tên, thân, trần)`.
  // Tên ca giữ đúng như `%i` của `it.each` cũ.
  for (const so of [89, 90, 91, 100, 250]) it(
    `${String(so)} ticket Đang làm: Tổng quan + danh sách (limit 200) trả 200, đủ thẻ, thẻ ở lô sau đúng nghĩa`,
    async () => {
      const n = await dungNhieuViec(so);
      const so_the = Math.min(so, 200);
      const so_cuoi = so - (so_the - 1);
      const ma_cuoi = `SAI-${String(so_cuoi)}`;
      const id_cuoi = `tk-${n.pj.SAI}-${String(so_cuoi)}`;

      await dungNhan(id_cuoi, 'zz-sau');
      await dungNhan(id_cuoi, 'aa-truoc');
      const c1 = await dungTicket(n.pj.INC, 1, 'con xong', { trang_thai: 'done' });
      const c2 = await dungTicket(n.pj.INC, 2, 'con chưa kết', { trang_thai: 'todo' });
      const c3 = await dungTicket(n.pj.INC, 3, 'con chưa kết 2', { trang_thai: 'todo' });
      for (const c of [c1, c2, c3]) await dungLienKet(id_cuoi, c, 'parent');
      await dungCanChu('ct-b10-mo');
      await dungCanChu('ct-b10-bo', { trang_thai: 'skipped' });
      await noiCanChuTicket('ct-b10-mo', id_cuoi);
      await noiCanChuTicket('ct-b10-bo', id_cuoi);
      await dungLuotGiao('lg-b10', id_cuoi, n.ag.wk, { trang_thai: 'in_progress', nhan_luc: GOC_10 });

      const kiemThe = (the: TheRa | undefined): void => {
        expect(the?.ma).toBe(ma_cuoi);
        expect(the?.nhan).toEqual(['aa-truoc', 'zz-sau']);
        expect(the?.con_tong).toBe(3);
        expect(the?.con_chua_ket).toBe(2);
        expect(the?.can_chu_so).toBe(1);
        expect(the?.nguoi_cam_ten).toBe('W-builder');
      };

      /* Tổng quan — khối "Việc đang chạy" (d.318). */
      const tq = await goiApi('/v1/tong-quan', TOKEN_CHU);
      expect(tq.status).toBe(200);
      const tq_than = await tq.json<{ viec_dang_chay: { the: TheRa; nguoi_cam_ten: string | null }[] }>();
      expect(tq_than.viec_dang_chay).toHaveLength(so_the);
      const khoi_cuoi = tq_than.viec_dang_chay[so_the - 1];
      kiemThe(khoi_cuoi?.the);
      expect(khoi_cuoi?.nguoi_cam_ten).toBe('W-builder');
      // Một thẻ ở lô đầu không bị nhiễm dữ liệu của thẻ lô sau.
      expect(tq_than.viec_dang_chay[0]?.the).toMatchObject({ nhan: [], con_tong: 0, can_chu_so: 0, nguoi_cam_ten: null });

      /* Danh sách web — trang 200 của `packages/web/src/api.ts`, lọc dự án SAI. */
      const ds = await goiApi(`/v1/man-hinh-ticket?limit=200&project_id=${n.pj.SAI}`, TOKEN_CHU);
      expect(ds.status).toBe(200);
      const ds_than = await ds.json<{ items: TheRa[] }>();
      expect(ds_than.items).toHaveLength(so_the);
      kiemThe(ds_than.items[so_the - 1]);

      /* Không lọc (đúng URL của bước 10) cũng 200. */
      expect((await goiApi('/v1/man-hinh-ticket?limit=200', TOKEN_CHU)).status).toBe(200);
    },
    60_000,
  );
});

/* ================================================================== *
 * Bước 11 — 375px
 * ================================================================== */

describe('Bước 11 — Tổng quan, Cần Chủ, chi tiết ticket ở 375px', () => {
  /**
   * Bố cục chỉ kiểm được ở tầng giao diện: `packages/web/test/nghiem-thu-17.test.tsx`
   * (lớp đáp ứng, không chiều rộng cứng > 375px, bảng trong khung cuộn ngang, thẻ
   * `meta viewport`). Phần chỉ mắt thấy được ⇒ "Cần chủ thử tay" ở `nghiem-thu-v0.1.md`.
   * Máy chủ không có gì riêng cho 375px, nên phía API không có ca nào.
   */
  itGoc.todo('xem packages/web/test/nghiem-thu-17.test.tsx và mục "Chủ thử tay" của nghiem-thu-v0.1.md');
});
