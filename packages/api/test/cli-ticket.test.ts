/**
 * CLI `baton` — **ticket và bằng chứng** (SPEC mục 13): `create` (d.367),
 * `assign` (d.368), `status` (d.371 + luật mục 4), `comment` (d.374),
 * `evidence` (d.365 + mục 7).
 *
 * **Mọi ca đi đường thật**, đúng nếp của `cli.test.ts` và `cli-vong-doi.test.ts`:
 * `chayCli` nhận chuỗi tham số như trên dòng lệnh, tự phân tích, tự đọc biến môi
 * trường, gọi **Worker thật** trong Miniflare với **token thật của một agent
 * thật** trong D1. Không ca nào gọi thẳng hàm nội bộ của một lệnh rồi khai là
 * "lệnh chạy được".
 *
 * Xác minh bằng chứng dùng **bảng nguồn giả lập** (`datNguonGiaLap`) — cùng chỗ
 * cắm mà `gui-bang-chung.test.ts` dùng, nên không ca nào gọi mạng thật.
 *
 * `docFile` của môi trường là một **bảng file trong bộ nhớ** — không ca nào chạm
 * đĩa (không tạo, không xoá file nào).
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { LOI_TRANG_THAI_KHI_TAO, MA_THOAT, TRAN_XAC_MINH_MS } from '@baton/shared';
import {
  CHE,
  HAN_CHO_CLI_MS,
  LOAI_LINK_CLI,
  SO_LENH,
  chayCli,
  schemaThamSo,
  daMergeCucBo,
  docBriefMd,
  nhanhSauTienToRemote,
  hanChoCliMs,
  thongDiepKhongThayAgent,
  tiemHanChoCli,
  type MoiTruongCli,
} from '@baton/cli';
import { LOAI_NOI_DUOC } from '../src/lenh-ticket.js';
import { khoaCommit } from '../src/nguon-github.js';
import {
  TOKEN_CHU,
  choVaoDuAn,
  datNguonGiaLap,
  dungAgentCoToken,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  trangThaiCua,
  WS,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

/*
 * **Cả thân mỗi ca/`beforeEach` đi qua sổ `bay`** (BAT-53, xem `caQuaSo`): ca hết
 * giờ thì thân vẫn chạy tiếp các lệnh CLI còn lại; `afterEach` chờ nó xong rồi pool
 * mới pop storage cô lập — không request nào dựng lại DO giữa lúc pop.
 */
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const URL_API = 'https://baton.test';

/** Token **giả** của manager (người giao) và của worker (người làm). */
const TOKEN_QL = 'bt_token_gia_manager_tk51';
const TOKEN = 'bt_token_gia_worker_tk51';

const HASH = 'a1b2c3d4e5f6a7b8';
const REPO = 'chu/baton';
const URL_DEPLOY = 'https://baton.example.com/khoe';

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
  /** Số request HTTP lệnh đã bắn — để chứng minh "chặn **tại CLI**". */
  so_request: () => number;
}

function ban(
  token = TOKEN_QL,
  file: Record<string, string> = {},
  /**
   * `git` **giả lập** cho bằng chứng `commit` merge cục bộ (mục 7 d.206, xem
   * `git-cuc-bo.ts`). Không truyền thì môi trường **không có** `git` — và đó là
   * mặc định của mọi ca khác, nên **không ca nào tạo tiến trình con**.
   */
  chayGit?: (doi_so: readonly string[]) => Promise<{ ma: number; ra: string }>,
): BanChay {
  const ra: string[] = [];
  const loi: string[] = [];
  let n = 0;
  return {
    mt: {
      env: { BATON_URL: URL_API, BATON_TOKEN: token },
      ...(chayGit === undefined ? {} : { chayGit }),
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void loi.push(d),
      fetch: (u, i) => {
        n += 1;
        return SELF.fetch(u, i);
      },
      docFile: async (duong) => {
        const chu = file[duong];
        // Giống `readFile` của Node: file không có thì **ném**.
        if (chu === undefined) throw new Error(`ENOENT: no such file or directory, open '${duong}'`);
        return await Promise.resolve(chu);
      },
    },
    ra,
    loi,
    so_request: () => n,
  };
}

function tatCa(b: BanChay): string {
  return [...b.ra, ...b.loi].join('\n');
}

/** Thân lỗi mà `inLoi` in ra ở chế độ `--json`. */
function loiJson(b: BanChay): { loi: string | null; thong_diep: string } {
  return JSON.parse(b.loi.join('\n')) as { loi: string | null; thong_diep: string };
}

/**
 * Một dự án `SAI`, một manager (tạo/giao/đổi trạng thái được), một worker, và
 * ticket **SAI-1** ở `todo`.
 */
async function duLieuMau(): Promise<void> {
  await dungWorkspace();
  // Manager **quản lý** dự án: hàng "Tạo ticket" của bảng quyền mục 3 cho
  // `manager` đúng phạm vi "dự án mình quản lý", nên dựng agent trước dự án.
  await dungAgentCoToken({ id: 'ag-ql', ten: 'M', vai_tro: 'manager', token: TOKEN_QL });
  const pj = await dungDuAn('SAI', 'Sample', 'active', 'ag-ql');
  await choVaoDuAn('ag-ql', pj);
  await dungAgentCoToken({ id: 'ag-1', ten: 'W', vai_tro: 'worker', token: TOKEN, du_an: [pj] });
  await dungTicket(pj, 1, 'Việc có sẵn');
}

/** Một trường bất kỳ của một ticket, đọc thẳng DB (kiểm chứng độc lập với API). */
async function cotTicket(ticket_id: string, cot: string): Promise<unknown> {
  const d = await env.DB.prepare(`SELECT ${cot} AS v FROM ticket WHERE id = ?`)
    .bind(ticket_id)
    .first<{ v: unknown }>();
  return d?.v ?? null;
}

async function idTheoMa(ma: string): Promise<string> {
  const [, so = ''] = ma.split('-');
  const d = await env.DB.prepare('SELECT id FROM ticket WHERE project_id = ? AND so = ?')
    .bind('pj-SAI', Number(so))
    .first<{ id: string }>();
  return d?.id ?? '(không có)';
}

const BRIEF_MD = [
  '# Brief cho việc này',
  '',
  '## Mục tiêu',
  'Dựng năm lệnh ghi của mục 13.',
  '',
  '## Điều cấm',
  'Không push, không merge.',
  '',
  '## Chuyện ngoài lề',
  'Đoạn này không thuộc mục nào nên bị bỏ qua.',
  '',
  '## Nộp lại: theo mẫu 5 mục',
].join('\n');

/* ================================================================== *
 * baton create — SPEC d.367
 * ================================================================== */

describe('baton create <DỰ ÁN> "<tiêu đề>" — SPEC d.367', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('tạo ticket: in mã MÃ-số, trạng thái mặc định Cần làm; --json mang cùng dữ liệu', async () => {
    const b = ban();
    expect(await chayCli(['create', 'SAI', 'Dựng CLI phần 5'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Đã tạo ticket SAI-2: Dựng CLI phần 5');
    expect(b.ra.join('\n')).toContain('Trạng thái: Cần làm (todo)');

    const js = ban();
    expect(await chayCli(['create', 'SAI', 'Ticket thứ ba', '--json'], js.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(js.ra.join('\n')) as { ma: string; so: number; trang_thai: string };
    expect(d.ma).toBe('SAI-3');
    expect(d.so).toBe(3);
    expect(d.trang_thai).toBe('todo');
  });

  it('--priority high đi tới DB; mã ưu tiên SAI bị chặn TẠI CLI (0 request)', async () => {
    const b = ban();
    expect(await chayCli(['create', 'SAI', 'Việc gấp', '--priority', 'high'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(b.ra.join('\n')).toContain('Ưu tiên: Cao (high)');
    expect(await cotTicket(await idTheoMa('SAI-2'), 'uu_tien')).toBe('high');

    // d.381: mã sai chặn tại CLI, thông điệp kể các mã kèm **nhãn tiếng Việt**.
    const x = ban();
    expect(await chayCli(['create', 'SAI', 'Việc gấp', '--priority', 'Cao', '--json'], x.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(x).loi).toBe('INVALID_INPUT');
    expect(loiJson(x).thong_diep).toContain('urgent (Khẩn)');
    expect(loiJson(x).thong_diep).toContain('none (Không)');
    expect(x.so_request()).toBe(0);
  });

  it('--parent SAI-1 nối ticket cha (liên kết `parent` trong DB)', async () => {
    const b = ban();
    expect(await chayCli(['create', 'SAI', 'Việc con', '--parent', 'SAI-1'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(b.ra.join('\n')).toContain('Ticket cha: SAI-1 — Việc có sẵn');

    const lk = await env.DB.prepare(
      "SELECT tu_ticket_id AS cha FROM ticket_link WHERE den_ticket_id = ? AND loai = 'parent'",
    )
      .bind(await idTheoMa('SAI-2'))
      .first<{ cha: string }>();
    expect(lk?.cha).toBe(await idTheoMa('SAI-1'));
  });

  it('--brief f.md gửi đúng các mục khớp nhãn mục 4, bỏ qua tiêu đề lạ', async () => {
    const b = ban(TOKEN_QL, { 'brief.md': BRIEF_MD });
    expect(await chayCli(['create', 'SAI', 'Việc có brief', '--brief', 'brief.md'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(b.ra.join('\n')).toContain('Brief: 3 trường từ "brief.md"');

    const id = await idTheoMa('SAI-2');
    expect(await cotTicket(id, 'muc_tieu')).toBe('Dựng năm lệnh ghi của mục 13.');
    expect(await cotTicket(id, 'dieu_cam')).toBe('Không push, không merge.');
    expect(await cotTicket(id, 'nop_lai')).toBe('theo mẫu 5 mục');
    // Tiêu đề không khớp nhãn nào → nội dung dưới nó **không** vào trường nào.
    expect(await cotTicket(id, 'boi_canh')).toBeNull();
    expect(await cotTicket(id, 'pham_vi')).toBeNull();
  });

  it('--brief trỏ file không có → INVALID_INPUT (mã 1), thông điệp nêu đường dẫn, 0 request', async () => {
    const b = ban(TOKEN_QL, {});
    expect(await chayCli(['create', 'SAI', 'Việc', '--brief', 'khong-co.md', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(loiJson(b).thong_diep).toContain('khong-co.md');
    expect(b.so_request()).toBe(0);
  });

  it('LỖI NGHIỆP VỤ: tiêu đề rỗng → INVALID_INPUT; mã dự án lạ → NOT_FOUND', async () => {
    const rong = ban();
    expect(await chayCli(['create', 'SAI', '   ', '--json'], rong.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(rong).loi).toBe('INVALID_INPUT');

    const la = ban();
    expect(await chayCli(['create', 'ZZZ', 'Việc', '--json'], la.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(la).loi).toBe('NOT_FOUND');
    expect(loiJson(la).thong_diep).toContain('ZZZ');

    // Mã không đúng dạng 2–6 chữ A–Z bị chặn **tại CLI**.
    const xau = ban();
    expect(await chayCli(['create', 'sai', 'Việc', '--json'], xau.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(xau).loi).toBe('INVALID_INPUT');
    expect(xau.so_request()).toBe(0);
  });

  /*
   * BAT-63 — SPEC mục 4 "Trạng thái khi tạo" (T-108 = B) + bảng lệnh mục 13
   * `[--status backlog]`. Thân request đọc bằng một `fetch` bọc (ghi lại thân rồi
   * chuyển tiếp tới Worker thật), DB đọc độc lập.
   */
  describe('--status (BAT-63)', () => {
    function banGhiThan(): BanChay & { than: () => Record<string, unknown> | undefined } {
      const b = ban();
      let than: Record<string, unknown> | undefined;
      const goc = b.mt.fetch;
      if (goc === undefined) throw new Error('ban() phải có fetch');
      b.mt.fetch = (u, i) => {
        const duong = typeof u === 'string' ? u : u instanceof URL ? u.href : u.url;
        if (i?.method === 'POST' && new URL(duong).pathname === '/v1/ticket') {
          than = JSON.parse(String(i.body)) as Record<string, unknown>;
        }
        return goc(u, i);
      };
      return { ...b, than: () => than };
    }

    it('`--status backlog` gửi `trang_thai: backlog`; ticket trong DB ở Backlog; dòng ra nói Backlog', async () => {
      const b = banGhiThan();
      expect(await chayCli(['create', 'SAI', 'Ý tưởng xa', '--status', 'backlog'], b.mt)).toBe(
        MA_THOAT.xong,
      );
      expect(b.than()?.['trang_thai']).toBe('backlog');
      expect(b.ra.join('\n')).toContain('Trạng thái: Backlog (backlog)');
      expect(await trangThaiCua(await idTheoMa('SAI-2'))).toBe('backlog');
    });

    it('không cờ ⇒ thân KHÔNG có `trang_thai` (máy chủ mặc định Cần làm); `--status todo` gửi todo', async () => {
      const khong = banGhiThan();
      expect(await chayCli(['create', 'SAI', 'Mặc định'], khong.mt)).toBe(MA_THOAT.xong);
      expect(khong.than()).toBeDefined();
      expect(khong.than()).not.toHaveProperty('trang_thai');
      expect(await trangThaiCua(await idTheoMa('SAI-2'))).toBe('todo');

      const co = banGhiThan();
      expect(await chayCli(['create', 'SAI', 'Cần làm', '--status=todo'], co.mt)).toBe(MA_THOAT.xong);
      expect(co.than()?.['trang_thai']).toBe('todo');
      expect(await trangThaiCua(await idTheoMa('SAI-3'))).toBe('todo');
    });

    it('trạng thái khác (`in_progress`, `done`, `Backlog`, rỗng) ⇒ INVALID_INPUT TẠI CLI, mã 1, 0 request, câu = câu máy chủ', async () => {
      for (const gia_tri of ['in_progress', 'done', 'Backlog', '']) {
        const x = ban();
        expect(
          await chayCli(['create', 'SAI', 'Sai', `--status=${gia_tri}`, '--json'], x.mt),
          gia_tri,
        ).toBe(MA_THOAT.loi_nghiep_vu);
        expect(loiJson(x).loi, gia_tri).toBe('INVALID_INPUT');
        expect(loiJson(x).thong_diep, gia_tri).toContain(LOI_TRANG_THAI_KHI_TAO);
        expect(x.so_request(), gia_tri).toBe(0);
      }
      expect(await idTheoMa('SAI-2')).toBe('(không có)');
    });

    it('--help của create có `[--status <giá trị>]` và nói rõ hai giá trị nhận được', async () => {
      const b = ban();
      await chayCli(['create', '--help'], b.mt);
      const ra = b.ra.join('\n');
      expect(ra).toContain('[--status <giá trị>]');
      expect(ra).toContain('todo (Cần làm, mặc định) hoặc backlog (Backlog)');
    });

    it('MCP: công cụ `create` có tham số `status` (sinh từ khai lệnh, cùng tên lệnh CLI)', () => {
      const props = schemaThamSo(SO_LENH['create']!.khai).properties as Record<string, unknown>;
      expect(Object.keys(props)).toContain('status');
    });
  });
});

/* ================================================================== *
 * baton assign — SPEC d.368
 * ================================================================== */

describe('baton assign <MÃ> <agent> — SPEC d.368', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('tạo lượt giao: ticket sang Đang làm, lượt Chờ nhận; --json mang người nhận', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Đã giao SAI-1 cho ag-1');
    expect(chu).toContain('Loại lượt: Làm (work)');
    expect(chu).toContain('Trạng thái lượt: Chờ nhận (pending)');
    expect(chu).toContain('Trạng thái ticket: Đang làm (in_progress)');
    // Mục 4 dòng 134: mở lượt cho ticket nhóm `planned` ⇒ ticket tự sang Đang làm.
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('in_progress');
  });

  it('--timeout 30 đặt hạn phản hồi 30 phút; mặc định là 15 phút (mục 5)', async () => {
    const truoc = Date.now();
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--timeout', '30', '--json'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    const d = JSON.parse(b.ra.join('\n')) as { han_phan_hoi_luc: number };
    expect(d.han_phan_hoi_luc - truoc).toBeGreaterThanOrEqual(29 * 60_000);
    expect(d.han_phan_hoi_luc - truoc).toBeLessThanOrEqual(31 * 60_000);

    const tk2 = ban();
    await chayCli(['create', 'SAI', 'Việc hai'], tk2.mt);
    const md = ban();
    expect(await chayCli(['assign', 'SAI-2', 'ag-1', '--json'], md.mt)).toBe(MA_THOAT.xong);
    const d2 = JSON.parse(md.ra.join('\n')) as { han_phan_hoi_luc: number };
    expect(d2.han_phan_hoi_luc - truoc).toBeGreaterThanOrEqual(14 * 60_000);
    expect(d2.han_phan_hoi_luc - truoc).toBeLessThanOrEqual(16 * 60_000);
  });

  it('--timeout không phải số bị chặn TẠI CLI (0 request)', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--timeout', '15p', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(loiJson(b).thong_diep).toContain('--timeout');
    expect(b.so_request()).toBe(0);
  });

  it('--brief f.md ghi đè brief riêng cho lượt này (mục 5 d.156)', async () => {
    const b = ban(TOKEN_QL, { 'brief.md': BRIEF_MD });
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--brief', 'brief.md', '--json'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    const d = JSON.parse(b.ra.join('\n')) as { id: string };
    const lg = await env.DB.prepare('SELECT muc_tieu, dieu_cam FROM luot_giao WHERE id = ?')
      .bind(d.id)
      .first<{ muc_tieu: string | null; dieu_cam: string | null }>();
    expect(lg?.muc_tieu).toBe('Dựng năm lệnh ghi của mục 13.');
    expect(lg?.dieu_cam).toBe('Không push, không merge.');
  });

  it('LỖI NGHIỆP VỤ: giao lần hai khi còn lượt mở → ASSIGNMENT_OPEN (mã 1)', async () => {
    expect(await chayCli(['assign', 'SAI-1', 'ag-1'], ban().mt)).toBe(MA_THOAT.xong);

    const hai = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--json'], hai.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(hai).loi).toBe('ASSIGNMENT_OPEN');
  });

  it('LỖI NGHIỆP VỤ: mã ticket không có → NOT_FOUND (mã 1)', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-99', 'ag-1', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('NOT_FOUND');
  });

  /*
   * `--review` — BAT-43, Chủ chốt T-50 = A (22/10, `spec-questions.md` #168): bảng lệnh
   * mục 13 thêm cờ; lượt `review` của 19.3. Không cờ vẫn là `work`.
   */
  it('--review tạo lượt loại `review` (DB), dòng ra ghi "Loại lượt: Review (review)"', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--review'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toMatch(/Loại lượt: .+ \(review\)/);

    const js = ban();
    await chayCli(['create', 'SAI', 'Việc hai'], ban().mt);
    expect(await chayCli(['assign', 'SAI-2', 'ag-1', '--review', '--json'], js.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(js.ra.join('\n')) as { id: string; loai: string };
    expect(d.loai).toBe('review');
    const lg = await env.DB.prepare('SELECT loai FROM luot_giao WHERE id = ?')
      .bind(d.id)
      .first<{ loai: string }>();
    expect(lg?.loai).toBe('review');
  });

  it('không cờ --review: lượt loại `work` (DB) — hành vi cũ giữ nguyên', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { id: string; loai: string };
    expect(d.loai).toBe('work');
    const lg = await env.DB.prepare('SELECT loai FROM luot_giao WHERE id = ?')
      .bind(d.id)
      .first<{ loai: string }>();
    expect(lg?.loai).toBe('work');
  });

  it('--review và lượt work cùng mở trên một ticket: mỗi (ticket, loại) tối đa 1 lượt mở (19.1)', async () => {
    expect(await chayCli(['assign', 'SAI-1', 'ag-1'], ban().mt)).toBe(MA_THOAT.xong);
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--review'], ban().mt)).toBe(MA_THOAT.xong);
    const hai = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--review', '--json'], hai.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(hai).loi).toBe('ASSIGNMENT_OPEN');
  });

  it('--review không nhận giá trị (cờ bật/tắt): --review=co → INVALID_INPUT, 0 request', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--review=co', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(b.so_request()).toBe(0);
  });

  it('--help của assign có [--review]', async () => {
    const b = ban();
    await chayCli(['assign', '--help'], b.mt);
    expect(b.ra.join('\n')).toContain('[--review]');
  });
});

/* ================================================================== *
 * baton assign <MÃ> <agent>: <agent> là TÊN hoặc ID — BAT-47 (T-55 = A, #171)
 * ================================================================== */

/** Số lượt giao trong DB — chứng minh "không tạo lượt" độc lập với API. */
async function soLuotGiao(): Promise<number> {
  const d = await env.DB.prepare('SELECT count(*) AS n FROM luot_giao').first<{ n: number }>();
  return d?.n ?? -1;
}

describe('baton assign: <agent> là tên hoặc ID — BAT-47 (T-55 = A)', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('(1) tên đúng ⇒ giao đúng agent (DB), dòng ra có id kèm tên', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'W'], b.mt), tatCa(b)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Đã giao SAI-1 cho ag-1 (W)');

    const js = ban();
    await chayCli(['create', 'SAI', 'Việc hai'], ban().mt);
    expect(await chayCli(['assign', 'SAI-2', 'W', '--json'], js.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(js.ra.join('\n')) as { id: string; nguoi_nhan_agent_id: string };
    expect(d.nguoi_nhan_agent_id).toBe('ag-1');
    const lg = await env.DB.prepare('SELECT nguoi_nhan_agent_id AS n FROM luot_giao WHERE id = ?')
      .bind(d.id)
      .first<{ n: string }>();
    expect(lg?.n).toBe('ag-1');
  });

  it('(2) ID đúng ⇒ như cũ', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'ag-1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { nguoi_nhan_agent_id: string };
    expect(d.nguoi_nhan_agent_id).toBe('ag-1');
  });

  it('tên so ĐÚNG, phân biệt hoa thường: "w" không khớp "W" ⇒ NOT_FOUND, không tạo lượt', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'w', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('NOT_FOUND');
    expect(await soLuotGiao()).toBe(0);
  });

  it('(3) tên không có ⇒ NOT_FOUND, thông điệp rõ "(tên hoặc ID)", không tạo lượt', async () => {
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'Khong-co', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('NOT_FOUND');
    // `inLoi` đặt mã lỗi trước thông điệp — phần sau là đúng thông điệp cố định.
    expect(loiJson(b).thong_diep).toBe(`NOT_FOUND: ${thongDiepKhongThayAgent('Khong-co')}`);
    expect(loiJson(b).thong_diep).toContain('"Khong-co" (tên hoặc ID)');
    expect(await soLuotGiao()).toBe(0);
  });

  it('(4) khớp nhiều (ID của A = tên của B) ⇒ INVALID_INPUT liệt kê các ID, KHÔNG gọi tạo lượt', async () => {
    // Agent id "W" (tên "W-hai") cùng dự án — "W" vừa là tên của ag-1 vừa là ID của nó.
    await dungAgentCoToken({
      id: 'W',
      ten: 'W-hai',
      vai_tro: 'worker',
      token: 'bt_token_gia_w_hai_bat47',
      du_an: ['pj-SAI'],
    });
    const b = ban();
    const post: string[] = [];
    b.mt.fetch = async (u, i) => {
      if (i?.method === 'POST') post.push(String(u));
      return await SELF.fetch(u, i);
    };
    expect(await chayCli(['assign', 'SAI-1', 'W', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(loiJson(b).thong_diep).toContain('ag-1');
    expect(loiJson(b).thong_diep).toMatch(/: (ag-1, W|W, ag-1) /);
    expect(post).toEqual([]);
    expect(await soLuotGiao()).toBe(0);
  });

  it('(5) agent ngoài quyền: manager gõ tên agent không thấy ⇒ lỗi GIỐNG HỆT ca tên không có, không lộ gì', async () => {
    // Dự án khác; ag-x chỉ ở đó; manager ag-ql không cùng dự án, không vao_tat_ca_du_an.
    const khac = await dungDuAn('KHA', 'Khác', 'active', null);
    await dungAgentCoToken({
      id: 'ag-x-bi-mat',
      ten: 'X-ngoai',
      vai_tro: 'worker',
      token: 'bt_token_gia_x_bat47',
      du_an: [khac],
    });

    const ngoai = ban();
    const ma_ngoai = await chayCli(['assign', 'SAI-1', 'X-ngoai', '--json'], ngoai.mt);
    const khong_co = ban();
    const ma_khong_co = await chayCli(['assign', 'SAI-1', 'Khong-co', '--json'], khong_co.mt);

    expect(ma_ngoai).toBe(ma_khong_co);
    expect(loiJson(ngoai).loi).toBe(loiJson(khong_co).loi);
    // Thay chữ người gõ bằng cùng một dấu — phần còn lại phải trùng từng ký tự.
    expect(loiJson(ngoai).thong_diep.replace('X-ngoai', '<x>')).toBe(
      loiJson(khong_co).thong_diep.replace('Khong-co', '<x>'),
    );
    expect(loiJson(ngoai).thong_diep).toBe(`NOT_FOUND: ${thongDiepKhongThayAgent('X-ngoai')}`);
    expect(tatCa(ngoai)).not.toContain('ag-x-bi-mat');
    expect(tatCa(ngoai)).not.toContain('Khác');
    expect(await soLuotGiao()).toBe(0);
  });

  it('cuộn HẾT các trang của GET /v1/agent: tên nằm ở trang 2 vẫn khớp', async () => {
    const t = Date.now();
    const lenh: D1PreparedStatement[] = [];
    for (let i = 0; i < 105; i += 1) {
      const id = `ag-dem-${String(i).padStart(3, '0')}`;
      lenh.push(
        env.DB.prepare(
          `INSERT INTO agent (id, workspace_id, ten, vai_tro, tao_luc, cap_nhat_luc)
           VALUES (?, ?, ?, 'worker', ?, ?)`,
        ).bind(id, WS, `A-${String(i).padStart(3, '0')}`, t, t),
        env.DB.prepare(
          'INSERT INTO agent_project (workspace_id, agent_id, project_id, tao_luc) VALUES (?, ?, ?, ?)',
        ).bind(WS, id, 'pj-SAI', t),
      );
    }
    await env.DB.batch(lenh);

    const b = ban();
    const trang_agent: string[] = [];
    b.mt.fetch = async (u, i) => {
      if (new URL(String(u)).pathname === '/v1/agent') trang_agent.push(String(u));
      return await SELF.fetch(u, i);
    };
    expect(await chayCli(['assign', 'SAI-1', 'W', '--json'], b.mt), tatCa(b)).toBe(MA_THOAT.xong);
    expect(trang_agent.length).toBeGreaterThanOrEqual(2);
    const d = JSON.parse(b.ra.join('\n')) as { nguoi_nhan_agent_id: string };
    expect(d.nguoi_nhan_agent_id).toBe('ag-1');
  });

  it('ticket đã xoá mềm: NOT_FOUND của cửa ghi giữ thông điệp về ticket, không nói thành "không thấy agent"', async () => {
    await env.DB.prepare('UPDATE ticket SET xoa_luc = ? WHERE project_id = ? AND so = 1')
      .bind(Date.now(), 'pj-SAI')
      .run();
    const b = ban();
    expect(await chayCli(['assign', 'SAI-1', 'Khong-co', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('NOT_FOUND');
    expect(loiJson(b).thong_diep).not.toContain(thongDiepKhongThayAgent('Khong-co'));
    expect(loiJson(b).thong_diep).toContain('ticket');
  });
});

/* ================================================================== *
 * baton link — BAT-43 (T-50 = A, #168), SPEC mục 4 + 19.4
 * ================================================================== */

/** Token **giả** của coordinator và của một worker không có quyền nối. */
const TOKEN_CO = 'bt_token_gia_coordinator_bat43';

describe('baton link <MÃ-điều-phối> <MÃ-dự-án> [--type ...] — SPEC mục 4, 19.4 (BAT-43)', () => {
  /**
   * Nền của `duLieuMau` (dự án SAI, manager `ag-ql`, worker `ag-1`, SAI-1) cộng:
   * dự án **COS** với ticket COS-1, coordinator `ag-co` vào cả COS và SAI, và SAI-2.
   */
  beforeEach(async () => {
    await duLieuMau();
    const cos = await dungDuAn('COS', 'Chief of Staff');
    await dungAgentCoToken({
      id: 'ag-co',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_CO,
      du_an: [cos, 'pj-SAI'],
    });
    await dungTicket(cos, 1, '[Giao M] Việc điều phối');
    await dungTicket('pj-SAI', 2, 'Việc dự án thứ hai');
  });

  async function lienKet(): Promise<{ tu: string; den: string; loai: string }[]> {
    const r = await env.DB.prepare(
      "SELECT tu_ticket_id AS tu, den_ticket_id AS den, loai FROM ticket_link WHERE loai <> 'parent' ORDER BY tao_luc, loai",
    ).all<{ tu: string; den: string; loai: string }>();
    return r.results;
  }

  it('mặc định `dieu_phoi`: coordinator nối COS-1 → SAI-1; DB có đúng một dòng, tiêu đề không đổi', async () => {
    const b = ban(TOKEN_CO);
    expect(await chayCli(['link', 'COS-1', 'SAI-1'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Đã nối COS-1 → SAI-1: Điều phối (dieu_phoi).');
    expect(await lienKet()).toEqual([{ tu: 'tk-pj-COS-1', den: 'tk-pj-SAI-1', loai: 'dieu_phoi' }]);
    // Tiêu đề `[Giao …]` do người tạo tự gõ — lệnh nối không sinh/sửa tiêu đề (#168).
    expect(await cotTicket('tk-pj-COS-1', 'tieu_de')).toBe('[Giao M] Việc điều phối');
    expect(await cotTicket('tk-pj-SAI-1', 'tieu_de')).toBe('Việc có sẵn');
  });

  it('--json trả { tu_ticket_id, den_ticket_id, loai_lien_ket } của API', async () => {
    const b = ban(TOKEN_CO);
    expect(await chayCli(['link', 'COS-1', 'SAI-1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    expect(JSON.parse(b.ra.join('\n'))).toEqual({
      tu_ticket_id: 'tk-pj-COS-1',
      den_ticket_id: 'tk-pj-SAI-1',
      loai_lien_ket: 'dieu_phoi',
    });
  });

  it('--type related: manager nối SAI-1 ↔ SAI-2; --type=blocks cũng nhận', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['link', 'SAI-1', 'SAI-2', '--type', 'related'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Đã nối SAI-1 → SAI-2: Liên quan (related).');
    const c = ban(TOKEN_QL);
    expect(await chayCli(['link', 'SAI-2', 'SAI-1', '--type=blocks'], c.mt)).toBe(MA_THOAT.xong);
    expect(await lienKet()).toEqual(
      expect.arrayContaining([
        { tu: 'tk-pj-SAI-1', den: 'tk-pj-SAI-2', loai: 'related' },
        { tu: 'tk-pj-SAI-2', den: 'tk-pj-SAI-1', loai: 'blocks' },
      ]),
    );
    expect(await lienKet()).toHaveLength(2);
  });

  it('mã ticket không có → NOT_FOUND (mã 1), không ghi gì', async () => {
    const dau = ban(TOKEN_CO);
    expect(await chayCli(['link', 'COS-99', 'SAI-1', '--json'], dau.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(dau).loi).toBe('NOT_FOUND');
    const sau = ban(TOKEN_CO);
    expect(await chayCli(['link', 'COS-1', 'SAI-99', '--json'], sau.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(sau).loi).toBe('NOT_FOUND');
    expect(await lienKet()).toEqual([]);
  });

  it('token không có quyền: worker nối `dieu_phoi` → FORBIDDEN (19.12 câu 16); manager nối `dieu_phoi` → FORBIDDEN', async () => {
    const wk = ban(TOKEN);
    expect(await chayCli(['link', 'SAI-1', 'SAI-2', '--json'], wk.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(wk).loi).toBe('FORBIDDEN');
    const ql = ban(TOKEN_QL);
    expect(await chayCli(['link', 'SAI-1', 'SAI-2', '--json'], ql.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(ql).loi).toBe('FORBIDDEN');
    expect(await lienKet()).toEqual([]);
  });

  it('token không có quyền: worker nối `related` hai ticket không phải lượt của mình → FORBIDDEN', async () => {
    const wk = ban(TOKEN);
    expect(await chayCli(['link', 'SAI-1', 'SAI-2', '--type', 'related', '--json'], wk.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(wk).loi).toBe('FORBIDDEN');
    expect(await lienKet()).toEqual([]);
  });

  it('ticket ngoài phạm vi (worker không vào COS) → NOT_FOUND, không lộ sự tồn tại (mục 13)', async () => {
    const wk = ban(TOKEN);
    expect(await chayCli(['link', 'COS-1', 'SAI-1', '--type', 'related', '--json'], wk.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(wk).loi).toBe('NOT_FOUND');
  });

  it('--type sai → INVALID_INPUT tại CLI (0 request), kể đủ các loại kèm nhãn; `parent` cũng không nhận', async () => {
    for (const sai of ['dieuphoi', 'parent', 'Liên quan']) {
      const b = ban(TOKEN_CO);
      expect(await chayCli(['link', 'COS-1', 'SAI-1', '--type', sai, '--json'], b.mt)).toBe(
        MA_THOAT.loi_nghiep_vu,
      );
      expect(loiJson(b).loi).toBe('INVALID_INPUT');
      expect(loiJson(b).thong_diep).toContain('dieu_phoi (Điều phối)');
      expect(loiJson(b).thong_diep).toContain('related (Liên quan)');
      expect(loiJson(b).thong_diep).toContain('blocks (Chặn)');
      expect(b.so_request()).toBe(0);
    }
    expect(await lienKet()).toEqual([]);
  });

  it('thiếu tham số vị trí → INVALID_INPUT kèm cách dùng, 0 request', async () => {
    const b = ban(TOKEN_CO);
    expect(await chayCli(['link', 'COS-1', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(loiJson(b).thong_diep).toContain('Cách dùng: baton link <MÃ-điều-phối> <MÃ-dự-án>');
    expect(b.so_request()).toBe(0);
  });

  it('có trong trợ giúp chung; --help riêng có [--type <giá trị>], [--json] và các loại', async () => {
    const chung = ban();
    expect(await chayCli(['--help'], chung.mt)).toBe(MA_THOAT.xong);
    expect(chung.ra.join('\n')).toContain('link');
    const b = ban();
    await chayCli(['link', '--help'], b.mt);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Cách dùng: baton link <MÃ-điều-phối> <MÃ-dự-án> [--type <giá trị>] [--json]');
    expect(chu).toContain('dieu_phoi|related|blocks');
  });

  it('tập loại của CLI BẰNG `LOAI_NOI_DUOC` của handler `noi_ticket` (không trôi)', () => {
    expect(new Set(LOAI_LINK_CLI)).toEqual(new Set(LOAI_NOI_DUOC));
  });

  it('không in token, cả đường thành công lẫn đường lỗi (d.382)', async () => {
    const ok = ban(TOKEN_CO);
    await chayCli(['link', 'COS-1', 'SAI-1'], ok.mt);
    expect(tatCa(ok)).not.toContain(TOKEN_CO);
    const loi = ban(TOKEN_CO);
    loi.mt.fetch = async () =>
      await Promise.resolve(
        Response.json({ error: 'INVALID_TOKEN', message: `Token "${TOKEN_CO}" không hợp lệ.` }, { status: 401 }),
      );
    expect(await chayCli(['link', 'COS-1', 'SAI-1', '--json'], loi.mt)).toBe(
      MA_THOAT.loi_xac_thuc_hoac_mang,
    );
    expect(tatCa(loi)).not.toContain(TOKEN_CO);
    expect(tatCa(loi)).toContain(CHE);
  });
});

/* ================================================================== *
 * baton status — SPEC d.371, luật mục 4
 * ================================================================== */

describe('baton status <MÃ> "<trạng thái>" — SPEC d.371 theo luật mục 4', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('đổi trạng thái: in cũ → mới kèm nhãn tiếng Việt; DB đổi theo', async () => {
    const b = ban();
    expect(await chayCli(['status', 'SAI-1', 'in_progress'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Ticket SAI-1: Cần làm (todo) → Đang làm (in_progress)');
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('in_progress');
  });

  it('mã trạng thái SAI bị chặn TẠI CLI, kể đủ 7 mã kèm nhãn (0 request)', async () => {
    const b = ban();
    expect(await chayCli(['status', 'SAI-1', 'Đang làm', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    for (const doan of [
      'backlog (Backlog)',
      'todo (Cần làm)',
      'in_progress (Đang làm)',
      'verifying (Chờ kiểm chứng)',
      'done (Xong)',
      'canceled (Huỷ)',
      'duplicate (Trùng)',
    ]) {
      expect(loiJson(b).thong_diep).toContain(doan);
    }
    expect(b.so_request()).toBe(0);
  });

  /** Mục 4 d.137 — nửa chặn được bằng chính dòng lệnh. */
  it('canceled THIẾU --reason → REASON_REQUIRED tại CLI (0 request); ĐỐI CHỨNG có --reason thì xong', async () => {
    const thieu = ban();
    expect(await chayCli(['status', 'SAI-1', 'canceled', '--json'], thieu.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(thieu).loi).toBe('REASON_REQUIRED');
    expect(loiJson(thieu).thong_diep).toContain('--reason');
    expect(thieu.so_request()).toBe(0);

    const du = ban();
    expect(await chayCli(['status', 'SAI-1', 'canceled', '--reason', 'Không làm nữa'], du.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('canceled');
    expect(await cotTicket(await idTheoMa('SAI-1'), 'ly_do_huy')).toBe('Không làm nữa');
  });

  it('duplicate THIẾU --original → INVALID_DUPLICATE_TARGET tại CLI (0 request); ĐỐI CHỨNG có --original thì xong', async () => {
    await chayCli(['create', 'SAI', 'Ticket gốc'], ban().mt);

    const thieu = ban();
    expect(await chayCli(['status', 'SAI-1', 'duplicate', '--json'], thieu.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(thieu).loi).toBe('INVALID_DUPLICATE_TARGET');
    expect(loiJson(thieu).thong_diep).toContain('--original');
    expect(thieu.so_request()).toBe(0);

    const du = ban();
    expect(await chayCli(['status', 'SAI-1', 'duplicate', '--original', 'SAI-2'], du.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(du.ra.join('\n')).toContain('Ticket gốc: SAI-2 — Ticket gốc');
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('duplicate');
    expect(await cotTicket(await idTheoMa('SAI-1'), 'trung_voi_ticket_id')).toBe(
      await idTheoMa('SAI-2'),
    );
  });

  /**
   * Chữ **"hợp lệ"** của d.137 ở **máy chủ**, không ở CLI: trỏ Trùng về chính nó
   * đi qua được cửa CLI (có `--original`) rồi bị server từ chối. Ca này là bằng
   * chứng CLI **không** chép luật hợp lệ thành bản thứ hai.
   */
  it('--original trỏ về CHÍNH NÓ: qua cửa CLI, máy chủ trả INVALID_DUPLICATE_TARGET', async () => {
    const b = ban();
    expect(await chayCli(['status', 'SAI-1', 'duplicate', '--original', 'SAI-1', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_DUPLICATE_TARGET');
    expect(b.so_request()).toBeGreaterThan(0);
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('todo');
  });

  /**
   * `--original` **thừa**: đích không phải `duplicate`. Máy chủ vốn bỏ qua
   * `ticket_goc_id` ở ca này, nên bản trước vẫn gửi nó lên và ticket đổi trạng
   * thái trong im lặng. Nay CLI báo `INVALID_INPUT` **trước mọi request**.
   */
  it('`--original` gõ thừa (đích không phải duplicate) → INVALID_INPUT tại CLI, 0 request', async () => {
    const sai_ma: string[] = [];
    const sai_loi: string[] = [];
    const co_request: string[] = [];
    for (const dich of ['in_progress', 'canceled', 'done']) {
      const b = ban();
      const ds = ['status', 'SAI-1', dich, '--original', 'SAI-2', '--reason', 'lý do', '--json'];
      if ((await chayCli(ds, b.mt)) !== MA_THOAT.loi_nghiep_vu) sai_ma.push(dich);
      if (loiJson(b).loi !== 'INVALID_INPUT') sai_loi.push(`${dich} → ${String(loiJson(b).loi)}`);
      if (b.so_request() !== 0) co_request.push(dich);
    }
    expect(sai_ma).toEqual([]);
    expect(sai_loi).toEqual([]);
    expect(co_request).toEqual([]);
    // Và ticket không đổi gì — đó là điểm của luật này.
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('todo');
  });

  it('ĐỐI CHỨNG: `--original` với đích `duplicate` vẫn chạy bình thường', async () => {
    await dungTicket('pj-SAI', 2, 'Ticket gốc');
    const b = ban();
    expect(await chayCli(['status', 'SAI-1', 'duplicate', '--original', 'SAI-2'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('duplicate');
  });

  /**
   * Mục 4 d.135: **vừa báo lỗi vừa ghi** — ticket được đưa sang Chờ kiểm chứng.
   * 19.2 thêm: chỉ ticket đang nhóm `active`; nhóm `planned` thì **giữ nguyên**.
   */
  it('done khi chưa đủ bằng chứng → EVIDENCE_REQUIRED (mã 1) VÀ ticket sang Chờ kiểm chứng', async () => {
    // Ticket ở `todo` (nhóm `planned`): vẫn EVIDENCE_REQUIRED, nhưng **giữ nguyên**.
    const plan = ban();
    expect(await chayCli(['status', 'SAI-1', 'done', '--json'], plan.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(plan).loi).toBe('EVIDENCE_REQUIRED');
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('todo');

    // Ticket ở nhóm `active`: cùng lỗi, **và** ticket sang Chờ kiểm chứng.
    expect(await chayCli(['status', 'SAI-1', 'in_progress'], ban().mt)).toBe(MA_THOAT.xong);
    const b = ban();
    expect(await chayCli(['status', 'SAI-1', 'done', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('EVIDENCE_REQUIRED');
    expect(await trangThaiCua(await idTheoMa('SAI-1'))).toBe('verifying');
  });
});

/* ================================================================== *
 * baton comment — SPEC d.374
 * ================================================================== */

describe('baton comment <MÃ> "<nội dung>" — SPEC d.374', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  it('thêm bình luận: in id, và bình luận nằm trong DB đúng tác giả', async () => {
    const b = ban();
    expect(await chayCli(['comment', 'SAI-1', 'Đã xem, **ổn**.', '--json'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(b.ra.join('\n')).toContain('"ticket_id"');
    const d = JSON.parse(b.ra.join('\n')) as { id: string; tao_luc: number };

    const bl = await env.DB.prepare(
      'SELECT noi_dung, tac_gia_loai, tac_gia_agent_id FROM comment WHERE id = ?',
    )
      .bind(d.id)
      .first<{ noi_dung: string; tac_gia_loai: string; tac_gia_agent_id: string | null }>();
    expect(bl?.noi_dung).toBe('Đã xem, **ổn**.');
    expect(bl?.tac_gia_loai).toBe('agent');
    expect(bl?.tac_gia_agent_id).toBe('ag-ql');

    const nguoi = ban();
    expect(await chayCli(['comment', 'SAI-1', 'Câu thứ hai'], nguoi.mt)).toBe(MA_THOAT.xong);
    expect(nguoi.ra.join('\n')).toContain('Đã bình luận trên SAI-1:');
  });

  it('LỖI NGHIỆP VỤ: mã ticket không có → NOT_FOUND (mã 1)', async () => {
    const b = ban();
    expect(await chayCli(['comment', 'SAI-99', 'x', '--json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).loi).toBe('NOT_FOUND');
  });
});

/* ================================================================== *
 * baton evidence — SPEC d.365, mục 7
 * ================================================================== */

describe('baton evidence <MÃ> <type> <giá trị> — SPEC d.365', () => {
  beforeEach(async () => {
    await duLieuMau();
    datNguonGiaLap({
      commit: { [khoaCommit(REPO, HASH)]: 'merged' },
      deploy: { [URL_DEPLOY]: 200 },
    });
  });

  it('note: xác minh `not_required`, mã thoát 0, --json mang cùng kết luận', async () => {
    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'note', 'Đã đọc lại SPEC'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(b.ra.join('\n')).toContain('Đã gửi bằng chứng Ghi chú (note) cho SAI-1:');
    expect(b.ra.join('\n')).toContain('Xác minh: Không cần xác minh (not_required)');

    const js = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'note', 'Ghi thêm', '--json'], js.mt)).toBe(
      MA_THOAT.xong,
    );
    const d = JSON.parse(js.ra.join('\n')) as { loai: string; xac_minh: string };
    expect(d.loai).toBe('note');
    expect(d.xac_minh).toBe('not_required');
  });

  it('commit <hash> <repo>: xác minh chạy ngay, ra `merged` (d.206) — hai giá trị vị trí', async () => {
    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'commit', HASH, REPO, '--json'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    const d = JSON.parse(b.ra.join('\n')) as { loai: string; xac_minh: string };
    expect(d.loai).toBe('commit');
    expect(d.xac_minh).toBe('merged');
  });

  it('deploy <url> <mã phiên bản>: 200 → `passed`, mã phiên bản chỉ lưu (19.12 câu 5)', async () => {
    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'deploy', URL_DEPLOY, 'e91efbeb', '--json'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    const d = JSON.parse(b.ra.join('\n')) as { id: string; xac_minh: string };
    expect(d.xac_minh).toBe('passed');

    const bc = await env.DB.prepare('SELECT ma_phien_ban FROM evidence WHERE id = ?')
      .bind(d.id)
      .first<{ ma_phien_ban: string | null }>();
    expect(bc?.ma_phien_ban).toBe('e91efbeb');
  });

  /**
   * d.220 + `spec-questions.md` #87: hết trần 10 giây mà **chưa** xác minh xong thì
   * `pending` **là một kết quả hợp lệ** — mã thoát **0**, và lệnh nói rõ máy chủ
   * tự thử lại để agent không gửi lại thành hai dòng cho một việc.
   */
  it('nguồn xác minh lỗi: in `pending` + lời "tự thử lại", vẫn MÃ THOÁT 0', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: { loi: 'GitHub không trả lời' } } });

    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'commit', HASH, REPO], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('Xác minh: Đang kiểm (pending)');
    expect(b.ra.join('\n')).toContain(`Chưa có kết luận trong ${String(TRAN_XAC_MINH_MS / 1000)} giây`);
    expect(b.ra.join('\n')).toContain('Không gửi lại bằng chứng này.');
  });

  /* ---------------------------------------------------------------- *
   * Chặn 2 của 13/10 — `commit` merge CỤC BỘ (d.206, migration 0022)
   * ---------------------------------------------------------------- */

  /**
   * CLI chạy `git merge-base --is-ancestor` **trong repo** rồi gửi kèm lời khai;
   * server chỉ dựa vào nó khi GitHub không biết commit đó, và ghi nguồn `local`.
   * `git` ở đây là một bản **giả lập** — không tiến trình con nào được tạo.
   */
  function gitGiaLap(
    ket: Record<string, { ma: number; ra: string }>,
    nhat_ky: string[][] = [],
  ): (doi_so: readonly string[]) => Promise<{ ma: number; ra: string }> {
    return (doi_so) => {
      nhat_ky.push([...doi_so]);
      return Promise.resolve(ket[doi_so.join(' ')] ?? { ma: 1, ra: '' });
    };
  }

  it('commit là tổ tiên nhánh mặc định CỤC BỘ → `merged` nguồn `local`, in rõ nguồn', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const log: string[][] = [];
    const b = ban(
      TOKEN,
      {},
      gitGiaLap(
        {
          'symbolic-ref --quiet --short refs/remotes/origin/HEAD': { ma: 0, ra: 'origin/main\n' },
          // `refs/heads/main`, **không** tên trần: git phân giải `refs/tags/` trước
          // `refs/heads/`, nên một tag cùng tên sẽ làm phép so lệch sang tag.
          [`merge-base --is-ancestor ${HASH} refs/heads/main`]: { ma: 0, ra: '' },
        },
        log,
      ),
    );

    expect(await chayCli(['evidence', 'SAI-1', 'commit', HASH, REPO], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('(merged)');
    expect(b.ra.join('\n')).toContain('Nguồn xác minh: kiểm cục bộ');
    expect(b.ra.join('\n')).toContain('nhánh "main"');
    // Đúng hai lệnh git, cả hai **chỉ đọc**: không `fetch`, không `pull`, không ghi.
    expect(log).toEqual([
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      ['merge-base', '--is-ancestor', HASH, 'refs/heads/main'],
    ]);
  });

  it('KHÔNG phải tổ tiên → không khai gì, bằng chứng trượt như cũ', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const b = ban(
      TOKEN,
      {},
      gitGiaLap({
        'symbolic-ref --quiet --short refs/remotes/origin/HEAD': { ma: 0, ra: 'origin/main\n' },
        // `merge-base --is-ancestor` không có trong bảng ⇒ mã thoát 1 = "không".
      }),
    );
    expect(await chayCli(['evidence', 'SAI-1', 'commit', HASH, REPO, '--json'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    const d = JSON.parse(b.ra.join('\n')) as { xac_minh: string; nguon_xac_minh?: string | null };
    expect(d.xac_minh).toBe('failed');
    expect(d.nguon_xac_minh ?? null).toBeNull();
  });

  it('repo KHÔNG có `origin` → tra TÊN `main`/`master` tồn tại cục bộ', async () => {
    expect(
      await daMergeCucBo(
        gitGiaLap({
          'show-ref --verify --quiet refs/heads/main': { ma: 0, ra: '' },
          [`merge-base --is-ancestor ${HASH} refs/heads/main`]: { ma: 0, ra: '' },
        }),
        HASH,
      ),
    ).toEqual({ merged: true, nhanh: 'main' });

    // Repo cũ: chỉ có `master`.
    expect(
      await daMergeCucBo(
        gitGiaLap({
          'show-ref --verify --quiet refs/heads/master': { ma: 0, ra: '' },
          [`merge-base --is-ancestor ${HASH} refs/heads/master`]: { ma: 0, ra: '' },
        }),
        HASH,
      ),
    ).toEqual({ merged: true, nhanh: 'master' });

    // Không nguồn nào gọi được tên nhánh mặc định ⇒ **không** khai.
    expect(await daMergeCucBo(gitGiaLap({}), HASH)).toEqual({ merged: false, nhanh: null });

    // `git` ném (không cài, bị chặn) ⇒ **không** khai, và không ném ra ngoài.
    expect(
      await daMergeCucBo(() => Promise.reject(new Error('không có git')), HASH),
    ).toEqual({ merged: false, nhanh: null });
  });

  /**
   * **Ca canh của lần siết sau review (13/10).** Bản đầu rơi về `symbolic-ref HEAD`
   * khi không có `origin`, nên lời khai thành **hiển nhiên đúng**: đứng trên một
   * nhánh tính năng và gửi chính commit HEAD thì `--is-ancestor` trả 0 (một commit
   * luôn là tổ tiên của chính nó) ⇒ Baton khai `merged` cho một commit **chưa merge
   * vào đâu cả**.
   */
  it('đứng trên nhánh tính năng, commit là HEAD, không có `main` → KHÔNG khai gì', async () => {
    const log: string[][] = [];
    const kq = await daMergeCucBo(
      gitGiaLap(
        {
          // Chỉ có nhánh đang đứng; `origin/HEAD` và `main`/`master` đều không có.
          'symbolic-ref --quiet --short HEAD': { ma: 0, ra: 'tinh-nang\n' },
          // Một commit **luôn** là tổ tiên của chính nhánh nó đang nằm trên.
          [`merge-base --is-ancestor ${HASH} refs/heads/tinh-nang`]: { ma: 0, ra: '' },
        },
        log,
      ),
      HASH,
    );
    expect(kq).toEqual({ merged: false, nhanh: null });
    // Và không có lệnh `merge-base` nào được chạy: không có nhánh nào để so.
    expect(log.some((d) => d[0] === 'merge-base')).toBe(false);
  });

  it('tên nhánh CÓ dấu `/` không bị cắt: `origin/HEAD` → `phat-hanh/v2`', async () => {
    expect(nhanhSauTienToRemote('origin/phat-hanh/v2')).toBe('phat-hanh/v2');
    // Một ref không mang đúng tiền tố remote thì **không** đọc được tên nhánh nào.
    expect(nhanhSauTienToRemote('phat-hanh/v2')).toBeNull();
    expect(nhanhSauTienToRemote('origin/')).toBeNull();

    expect(
      await daMergeCucBo(
        gitGiaLap({
          'symbolic-ref --quiet --short refs/remotes/origin/HEAD': {
            ma: 0,
            ra: 'origin/phat-hanh/v2\n',
          },
          [`merge-base --is-ancestor ${HASH} refs/heads/phat-hanh/v2`]: { ma: 0, ra: '' },
        }),
        HASH,
      ),
    ).toEqual({ merged: true, nhanh: 'phat-hanh/v2' });
  });

  it('môi trường KHÔNG có `git` → lệnh vẫn chạy, chỉ không khai gì (đối chứng)', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'khong_thay' } });
    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'commit', HASH, REPO, '--json'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    expect((JSON.parse(b.ra.join('\n')) as { xac_minh: string }).xac_minh).toBe('failed');
  });

  /* ---------------------------------------------------------------- *
   * Chặn 3 của 13/10 — `--bao-cao` cho review của manager (d.208)
   * ---------------------------------------------------------------- */

  it('review của manager kèm `--bao-cao` → nhận, in nguồn "manager"', async () => {
    const b = ban(TOKEN_QL);
    expect(
      await chayCli(
        ['evidence', 'SAI-1', 'review', 'pass', 'Reviewer đã kiểm', '--bao-cao', 'bao-cao/x.md'],
        b.mt,
      ),
    ).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('manager');

    const bc = await env.DB.prepare('SELECT review_nguon, review_bao_cao FROM evidence LIMIT 1')
      .first<{ review_nguon: string; review_bao_cao: string }>();
    expect(bc?.review_nguon).toBe('manager');
    expect(bc?.review_bao_cao).toBe('bao-cao/x.md');
  });

  it('review của manager THIẾU `--bao-cao` → máy chủ từ chối (mã 1)', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['evidence', 'SAI-1', 'review', 'pass', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
  });

  it('`--bao-cao` cho loại khác `review` bị chặn TẠI CLI (0 request)', async () => {
    const b = ban(TOKEN);
    expect(
      await chayCli(['evidence', 'SAI-1', 'note', 'x', '--bao-cao', 'bao-cao/x.md', '--json'], b.mt),
    ).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).thong_diep).toContain('--bao-cao');
    expect(b.so_request()).toBe(0);
  });

  it('loại bằng chứng SAI bị chặn TẠI CLI, kể đủ 6 loại (0 request)', async () => {
    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'Ghi chú', 'x', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    for (const m of ['commit', 'deploy', 'review', 'test', 'file', 'note (Ghi chú)']) {
      expect(loiJson(b).thong_diep).toContain(m);
    }
    expect(b.so_request()).toBe(0);
  });

  it('hình giá trị theo loại (d.204–211) được chặn tại CLI: review sai mã, test thiếu cờ, file thừa giá trị', async () => {
    const ca: [string[], string][] = [
      [['evidence', 'SAI-1', 'review', 'ĐẠT'], 'pass (Đạt)'],
      [['evidence', 'SAI-1', 'test', '42 passed'], 'cần hai giá trị'],
      [['evidence', 'SAI-1', 'test', '42 passed', 'ok'], 'cờ đạt'],
      [['evidence', 'SAI-1', 'file', '/tmp/a.txt', 'thừa'], 'chỉ nhận một giá trị'],
      [['evidence', 'SAI-1', 'note', 'x', 'thừa'], 'chỉ nhận một giá trị'],
    ];

    // Gom lỗi rồi assert **một lần ở cuối**: `expect` trong vòng lặp ném ngay và
    // che các ca sau.
    const sai_ma: string[] = [];
    const sai_chu: string[] = [];
    const co_request: string[] = [];

    for (const [ds, doan] of ca) {
      const b = ban(TOKEN);
      const ma = await chayCli([...ds, '--json'], b.mt);
      if (ma !== MA_THOAT.loi_nghiep_vu) sai_ma.push(ds.join(' '));
      const than = loiJson(b);
      if (than.loi !== 'INVALID_INPUT' || !than.thong_diep.includes(doan)) sai_chu.push(ds.join(' '));
      if (b.so_request() !== 0) co_request.push(ds.join(' '));
    }

    expect(sai_ma).toEqual([]);
    expect(sai_chu).toEqual([]);
    expect(co_request).toEqual([]);
  });

  it('ĐỐI CHỨNG hình giá trị: review pass (chủ gửi) và test pass đi qua được', async () => {
    const rv = ban(TOKEN_CHU);
    expect(await chayCli(['evidence', 'SAI-1', 'review', 'pass', 'Đọc kỹ rồi', '--json'], rv.mt)).toBe(
      MA_THOAT.xong,
    );
    const d = JSON.parse(rv.ra.join('\n')) as { id: string; loai: string };
    expect(d.loai).toBe('review');
    const bc = await env.DB.prepare('SELECT ket_luan, ghi_chu FROM evidence WHERE id = ?')
      .bind(d.id)
      .first<{ ket_luan: string; ghi_chu: string | null }>();
    expect(bc?.ket_luan).toBe('pass');
    expect(bc?.ghi_chu).toBe('Đọc kỹ rồi');

    const ts = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'test', '42 passed, 0 failed', 'pass', '--json'], ts.mt)).toBe(
      MA_THOAT.xong,
    );
    const dt = JSON.parse(ts.ra.join('\n')) as { id: string };
    const bt = await env.DB.prepare('SELECT tom_tat, test_dat FROM evidence WHERE id = ?')
      .bind(dt.id)
      .first<{ tom_tat: string; test_dat: number }>();
    expect(bt?.tom_tat).toBe('42 passed, 0 failed');
    expect(bt?.test_dat).toBe(1);
  });

  it('LỖI NGHIỆP VỤ: hash ngắn hơn 7 ký tự → INVALID_INPUT từ máy chủ (mã 1)', async () => {
    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'commit', 'abc', REPO, '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(b.so_request()).toBeGreaterThan(0);
  });

  /**
   * **Lưới an toàn 15 giây của CLI** (`spec-questions.md` #87) — ca này ghim đúng
   * lời khai ở `lenh/evidence.ts`: "chạm lưới thì `fetch` huỷ và lỗi đi đường
   * mạng của d.380 → **mã thoát 2**".
   *
   * Ca cũ ở chỗ này là `HAN_CHO_CLI_MS > TRAN_XAC_MINH_MS` — một **tautology**:
   * hằng trên **được định nghĩa bằng** hằng dưới cộng 5 giây, nên không đột biến
   * nào của mã sản phẩm làm nó đỏ. Nó đã bị thay bằng ca dưới đây.
   *
   * Hạn được hạ qua `tiemHanChoCli` (chỗ cắm cùng loại `tiemNguonXacMinh` của
   * API) nên test **không** chạy thật 15 giây; `fetch` ở đây không bao giờ trả
   * lời, chỉ chờ chính `signal` mà lệnh truyền xuống.
   */
  it('chạm lưới an toàn của CLI (fetch không bao giờ trả lời) → mã thoát 2', async () => {
    // Hằng vẫn phải là "trần của server **cộng** một biên", không phải nhỏ hơn.
    expect(HAN_CHO_CLI_MS).toBe(TRAN_XAC_MINH_MS + 5_000);

    tiemHanChoCli(50);
    try {
      const b = ban(TOKEN);
      let da_nhan_signal = false;
      const that = b.mt.fetch as typeof fetch;
      /*
       * Chỉ **một** đường bị cắt: `POST .../bang-chung`, đúng chỗ lệnh đặt lưới.
       * Lượt tra ticket trước đó (`GET /v1/ticket/ma/SAI-1`) **không** mang signal
       * nào, nên để nó đi đường thật — treo nó thì ca này hỏng vì một lý do khác
       * và lời khai vẫn chưa được kiểm.
       */
      b.mt.fetch = async (u, init) => {
        if (!String(u).includes('/bang-chung')) return await that(u, init);
        const signal = (init as RequestInit | undefined)?.signal ?? null;
        da_nhan_signal = signal !== null;
        return await new Promise<Response>((_giai, tu_choi) => {
          signal?.addEventListener('abort', () => void tu_choi(signal.reason as Error));
        });
      };
      // `evidence note` dừng ở chặng 1 phía server, nên nếu lưới KHÔNG cắt thì ca
      // này treo — đúng thứ cần phân biệt.
      expect(await chayCli(['evidence', 'SAI-1', 'note', 'một ghi chú', '--json'], b.mt)).toBe(
        MA_THOAT.loi_xac_thuc_hoac_mang,
      );
      expect(da_nhan_signal).toBe(true);
      expect(loiJson(b).loi).toBeNull(); // lỗi mạng, không phải mã lỗi API
      expect(loiJson(b).thong_diep).toContain('Không gọi được Baton');
    } finally {
      tiemHanChoCli(null);
    }
  });

  it('ĐỐI CHỨNG: khôi phục hạn rồi thì đường thường vẫn chạy (mã thoát 0)', async () => {
    expect(hanChoCliMs()).toBe(HAN_CHO_CLI_MS);
    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'note', 'một ghi chú'], b.mt)).toBe(MA_THOAT.xong);
  });
});

/* ================================================================== *
 * `baton evidence <MÃ> bao-cao …` — loại Báo cáo (T-31 câu 3.4 A, #161)
 * ================================================================== */

describe('baton evidence <MÃ> bao-cao — bằng chứng Báo cáo (migration 0027)', () => {
  beforeEach(async () => {
    await duLieuMau();
  });

  /** Một bản chạy ghi lại THÂN của mọi `POST …/bang-chung` mà CLI bắn đi. */
  function banGhiThan(token: string): { b: BanChay; mt: MoiTruongCli; than: Record<string, unknown>[] } {
    const b = ban(token);
    const than: Record<string, unknown>[] = [];
    const mt: MoiTruongCli = {
      ...b.mt,
      fetch: (u, i) => {
        if (i?.method === 'POST' && String(u).includes('/bang-chung')) {
          than.push(JSON.parse(String(i.body)) as Record<string, unknown>);
        }
        return SELF.fetch(u, i);
      },
    };
    return { b, mt, than };
  }

  async function dongDb(id: string): Promise<Record<string, unknown> | null> {
    return env.DB.prepare(
      `SELECT loai, duong_dan, noi_dung, bao_cao_nguon, bao_cao_reviewer FROM evidence WHERE id = ?`,
    )
      .bind(id)
      .first<Record<string, unknown>>();
  }

  it('manager: `bao-cao <đường dẫn> --noi-dung … --bao-cao <báo cáo reviewer>` → đúng thân, nguồn manager', async () => {
    const { b, mt, than } = banGhiThan(TOKEN_QL);
    expect(
      await chayCli(
        [
          'evidence',
          'SAI-1',
          'bao-cao',
          'bao-cao/sai-32.md',
          '--noi-dung',
          'Kết luận nghiên cứu: chọn B.',
          '--bao-cao',
          'bao-cao/reviewer-sai-32.md',
          '--json',
        ],
        mt,
      ),
    ).toBe(MA_THOAT.xong);
    expect(than).toEqual([
      {
        loai_bang_chung: 'bao_cao',
        duong_dan: 'bao-cao/sai-32.md',
        noi_dung: 'Kết luận nghiên cứu: chọn B.',
        duong_dan_bao_cao: 'bao-cao/reviewer-sai-32.md',
      },
    ]);
    const kq = JSON.parse(b.ra.join('\n')) as { id: string; loai: string; bao_cao_nguon: string };
    expect(kq.loai).toBe('bao_cao');
    expect(kq.bao_cao_nguon).toBe('manager');
    // DB: mượn `note` (có nội dung) + dấu báo cáo.
    expect(await dongDb(kq.id)).toEqual({
      loai: 'note',
      duong_dan: 'bao-cao/sai-32.md',
      noi_dung: 'Kết luận nghiên cứu: chọn B.',
      bao_cao_nguon: 'manager',
      bao_cao_reviewer: 'bao-cao/reviewer-sai-32.md',
    });
  });

  it('chủ: `bao_cao - --noi-dung …` (chỉ nội dung) → thân không có `duong_dan`, in người ký', async () => {
    const { b, mt, than } = banGhiThan(TOKEN_CHU);
    expect(
      await chayCli(['evidence', 'SAI-1', 'bao_cao', '-', '--noi-dung', 'Chỉ có chữ.'], mt),
    ).toBe(MA_THOAT.xong);
    expect(than).toEqual([{ loai_bang_chung: 'bao_cao', noi_dung: 'Chỉ có chữ.' }]);
    expect(b.ra.join('\n')).toContain('Đã gửi bằng chứng Báo cáo (bao_cao) cho SAI-1:');
    expect(b.ra.join('\n')).toContain('Người ký báo cáo: chủ ký (owner)');
  });

  it('chủ: chỉ đường dẫn → thân chỉ có `duong_dan`; DB mượn `file`', async () => {
    const { b, mt, than } = banGhiThan(TOKEN_CHU);
    expect(
      await chayCli(['evidence', 'SAI-1', 'bao-cao', 'file:///srv/bao-cao.md', '--json'], mt),
    ).toBe(MA_THOAT.xong);
    expect(than).toEqual([{ loai_bang_chung: 'bao_cao', duong_dan: 'file:///srv/bao-cao.md' }]);
    const kq = JSON.parse(b.ra.join('\n')) as { id: string };
    expect((await dongDb(kq.id))?.['loai']).toBe('file');
  });

  it('`bao-cao -` mà KHÔNG có --noi-dung → chặn TẠI CLI (0 request)', async () => {
    const b = ban(TOKEN_CHU);
    expect(await chayCli(['evidence', 'SAI-1', 'bao-cao', '-', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('INVALID_INPUT');
    expect(b.so_request()).toBe(0);
  });

  it('`--noi-dung` cho loại khác `bao_cao` → chặn TẠI CLI (0 request)', async () => {
    const b = ban(TOKEN);
    expect(
      await chayCli(['evidence', 'SAI-1', 'note', 'x', '--noi-dung', 'y', '--json'], b.mt),
    ).toBe(MA_THOAT.loi_nghiep_vu);
    expect(loiJson(b).thong_diep).toContain('--noi-dung');
    expect(b.so_request()).toBe(0);
  });

  it('worker gửi `bao-cao` → máy chủ FORBIDDEN (quyền ký giống review)', async () => {
    const b = ban(TOKEN);
    expect(await chayCli(['evidence', 'SAI-1', 'bao-cao', 'x.md', '--json'], b.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(loiJson(b).loi).toBe('FORBIDDEN');
  });

  it('trợ giúp của `evidence` nói cách dùng bao-cao và --noi-dung', async () => {
    const b = ban();
    await chayCli(['evidence', '--help'], b.mt);
    const chu = b.ra.join('\n');
    expect(chu).toContain('--noi-dung');
    expect(chu).toContain('bao-cao');
  });
});

/* ================================================================== *
 * docBriefMd — hình file `--brief` (cau-hoi-spec #89)
 * ================================================================== */

describe('docBriefMd: đọc 8 trường brief của mục 4', () => {
  it('nhận nhãn có số thứ tự, dấu hai chấm, hoa thường; trường vắng thì KHÔNG có khoá', () => {
    const brief = docBriefMd(
      ['# Tiêu đề file', '## 1. mục TIÊU:', 'Làm xong phần 5.', '### Kiểm chứng', 'npm test'].join(
        '\n',
      ),
    );
    expect(brief).toEqual({
      muc_tieu: 'Làm xong phần 5.',
      cach_kiem_chung: 'npm test',
    });
  });

  it('file không có mục nào khớp vẫn hợp lệ (brief là TUỲ CHỌN — mục 4 d.112)', () => {
    expect(docBriefMd('Chỉ là mấy dòng chữ, không có tiêu đề nào.')).toEqual({});
  });
});

/* ================================================================== *
 * Nền chung cho NĂM lệnh mới — d.380 (`--json`), d.382 (không in token)
 * ================================================================== */

describe('năm lệnh mới: --json, trợ giúp, không in token (d.380, d.382)', () => {
  beforeEach(async () => {
    await duLieuMau();
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
  });

  const TEN_LENH = ['create', 'assign', 'status', 'comment', 'evidence'] as const;

  it('cả năm lệnh có trong trợ giúp chung và có --help riêng kèm [--json]', async () => {
    const chung = ban();
    expect(await chayCli(['--help'], chung.mt)).toBe(MA_THOAT.xong);
    const thieu_trong_bang: string[] = [];
    const thieu_json: string[] = [];
    for (const ten of TEN_LENH) {
      if (!chung.ra.join('\n').includes(ten)) thieu_trong_bang.push(ten);
      const b = ban();
      await chayCli([ten, '--help'], b.mt);
      const chu = b.ra.join('\n');
      if (!chu.includes(`Cách dùng: baton ${ten}`) || !chu.includes('[--json]')) {
        thieu_json.push(ten);
      }
    }
    expect(thieu_trong_bang).toEqual([]);
    expect(thieu_json).toEqual([]);

    // `[giá trị 2]` của d.365 là tham số vị trí **tuỳ chọn**, in trong ngoặc vuông.
    const ev = ban();
    await chayCli(['evidence', '--help'], ev.mt);
    expect(ev.ra.join('\n')).toContain('[giá trị 2]');
  });

  it('đường thành công của cả NĂM lệnh: mã thoát 0, và không lệnh nào in token', async () => {
    const chay: [string[], string][] = [
      [['create', 'SAI', 'Việc mới'], TOKEN_QL],
      [['comment', 'SAI-1', 'một dòng'], TOKEN_QL],
      [['evidence', 'SAI-1', 'commit', HASH, REPO], TOKEN],
      [['status', 'SAI-1', 'in_progress'], TOKEN_QL],
      [['assign', 'SAI-1', 'ag-1'], TOKEN_QL],
    ];
    // Đủ **năm** lệnh của lượt này, mỗi lệnh đúng một lần.
    expect(new Set(chay.map(([ds]) => ds[0]))).toEqual(new Set(TEN_LENH));

    const hong: string[] = [];
    const lot_token: string[] = [];
    for (const [ds, token] of chay) {
      const b = ban(token);
      if ((await chayCli(ds, b.mt)) !== MA_THOAT.xong) hong.push(`${ds.join(' ')} → ${tatCa(b)}`);
      if (tatCa(b).includes(token)) lot_token.push(ds.join(' '));
    }
    expect(hong).toEqual([]);
    expect(lot_token).toEqual([]);
  });

  /**
   * **Đường LỖI của cả năm lệnh** — `--json` phân tích được, và **lưới chắn token
   * là thật**.
   *
   * Hai nhóm, chọn sao cho token **thật sự có mặt** trong thứ sắp in ra — nếu
   * không, `not.toContain` là một assert rỗng:
   *   * `may_chu_nhac_lai`: máy chủ dội lại token trong thông điệp lỗi của mình;
   *   * `create --brief <token>.md`: **chính tham số người gõ** mang token, và
   *     CLI đưa đường dẫn vào thông điệp lỗi — ca này không đi mạng lần nào.
   */
  it('đường LỖI của cả năm lệnh: --json phân tích được, token bị CHE (không lọt)', async () => {
    const chay: [string[], string, boolean][] = [
      [['create', 'SAI', 'x', '--brief', `${TOKEN_QL}.md`, '--json'], TOKEN_QL, false],
      [['assign', 'SAI-1', 'ag-1', '--json'], TOKEN_QL, true],
      [['status', 'SAI-1', 'in_progress', '--json'], TOKEN_QL, true],
      [['comment', 'SAI-1', 'x', '--json'], TOKEN_QL, true],
      [['evidence', 'SAI-1', 'note', 'x', '--json'], TOKEN, true],
    ];
    expect(new Set(chay.map(([ds]) => ds[0]))).toEqual(new Set(TEN_LENH));

    const lot_token: string[] = [];
    const thieu_che: string[] = [];
    const sai_ma: string[] = [];

    for (const [ds, token, qua_mang] of chay) {
      const b = ban(token);
      if (qua_mang) {
        b.mt.fetch = async () =>
          await Promise.resolve(
            Response.json(
              { error: 'INVALID_TOKEN', message: `Token "${token}" không hợp lệ.` },
              { status: 401 },
            ),
          );
      }
      const ma = await chayCli(ds, b.mt);
      if (ma !== MA_THOAT.loi_nghiep_vu && ma !== MA_THOAT.loi_xac_thuc_hoac_mang) {
        sai_ma.push(`${ds.join(' ')} → mã ${String(ma)}`);
      }
      // `--json` ở đường lỗi: phải phân tích được.
      expect(typeof loiJson(b).thong_diep).toBe('string');
      if (tatCa(b).includes(token)) lot_token.push(ds.join(' '));
      if (!tatCa(b).includes(CHE)) thieu_che.push(ds.join(' '));
    }

    expect(sai_ma).toEqual([]);
    expect(lot_token).toEqual([]);
    expect(thieu_che).toEqual([]);
  });
});
