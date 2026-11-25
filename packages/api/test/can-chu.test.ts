/**
 * **Cần Chủ — lõi dữ liệu + đường TẠO.** SPEC mục 8 (d.226–291), 19.8
 * (d.531–535), 19.12 câu 4 (Chung là rỗng), câu 15 (ghi → 403), câu 18 (cấp
 * `T-số` qua ô "Tạo mục Cần Chủ"), câu 19 (422).
 *
 * Mỗi luật của SPEC mà lượt này chạm tới có **một ca**, và những luật có ranh
 * giới thì có cả **ca đối chứng** (số phương án 1/2/5/6; mốc 18:00 trước/đúng/
 * sau; cờ "có thể trùng" với ba ca KHÔNG trùng).
 *
 * Đường xử lý (19.9) là lượt 2 của phần 4 — không có ca nào ở đây.
 */

import { afterEach, describe, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  CUA_SO_TRUNG_MS,
  MUI_GIO_CHU_PHUT,
  NHAN_PHUONG_AN,
  SO_PHUONG_AN_TOI_DA,
  SO_PHUONG_AN_TOI_THIEU,
  chuanHoaTieuDe,
  gioDiaPhuong,
  haMucNeuCan,
  hanMacDinh,
  kiemFileReview,
  kiemLenhChay,
  kiemLenhKem,
  kiemPhuongAn,
  maCanChu,
  mucCoTheTrung,
  quaHan,
  quyen,
} from '@baton/shared';
import {
  TOKEN_CHU,
  WS,
  canChuTrongDb,
  dungAgentCoToken,
  dungCanChu,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  goiApi,
  phuongAnCua,
} from './giup.js';
import './ap-migration.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/* ------------------------------------------------------------------ *
 * Dựng nền
 * ------------------------------------------------------------------ */

const T_COORD = 'bt_test_coordinator';
const T_MANAGER = 'bt_test_manager';
const T_WORKER = 'bt_test_worker';
const T_REVIEWER = 'bt_test_reviewer';
/** Manager của một dự án **khác**, để kiểm "ngoài phạm vi dự án → 403". */
const T_NGOAI = 'bt_test_ngoai_pham_vi';

let PJ = '';
let PJ_KHAC = '';

/** Thân JSON của một phản hồi. Kiểu lỏng vì mỗi ca đọc một trường khác nhau. */
type Than = Record<string, unknown>;

function than(r: Response): Promise<Than> {
  return r.json<Than>();
}

beforeEach(async () => {
  for (const b of [
    'can_chu_ticket',
    'can_chu_file',
    'can_chu_phuong_an',
    'phien',
    'luot_giao',
    'can_chu',
    'ticket_label',
    'ticket_link',
    'ticket_history',
    'comment',
    'ticket',
    'bo_dem',
    'agent_project',
    'agent_permission',
    'agent',
    'project',
    'workspace',
  ]) {
    await env.DB.prepare(`DELETE FROM ${b}`).run();
  }

  await dungWorkspace();
  PJ = await dungDuAn('SAI', 'Sample');
  PJ_KHAC = await dungDuAn('OTH', 'Dự án khác');

  await dungAgentCoToken({
    id: 'ag-coord',
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: T_COORD,
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({
    id: 'ag-man',
    ten: 'M-Baton',
    vai_tro: 'manager',
    token: T_MANAGER,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: 'ag-work',
    ten: 'W-builder',
    vai_tro: 'worker',
    token: T_WORKER,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: 'ag-rev',
    ten: 'W-reviewer',
    vai_tro: 'reviewer',
    token: T_REVIEWER,
    du_an: [PJ],
  });
  await dungAgentCoToken({
    id: 'ag-ngoai',
    ten: 'M-khac',
    vai_tro: 'manager',
    token: T_NGOAI,
    du_an: [PJ_KHAC],
  });
});

/** Tạo một mục qua **đường HTTP thật**, tức qua cửa ghi. */
function tao(token: string, body: Than): Promise<Response> {
  return goiApi('/v1/can-chu', token, { method: 'POST', than: body });
}

const QUYET_DINH: Than = {
  tieu_de: 'Chọn cơ sở dữ liệu',
  muc: 'today',
  loai: 'decision',
  ly_do_de_xuat: 'D1 đã có sẵn trong Workers, không thêm hạ tầng',
  phuong_an: [{ noi_dung: 'Dùng D1', de_xuat: true }, { noi_dung: 'Dùng Postgres' }],
};

/* ================================================================== *
 * A. Bốn loại mục, mỗi loại đúng trường bắt buộc — mục 8 d.236–239
 * ================================================================== */

describe('mục 8 d.235–239 — 4 loại mục tạo được, mỗi loại đúng trường bắt buộc', () => {
  it('`decision`: 2–5 phương án có nhãn A, B…, cộng phương án đề xuất và lý do', async () => {
    const r = await tao(T_COORD, { ...QUYET_DINH, project_id: PJ });
    expect(r.status).toBe(201);
    const t = await than(r);

    expect(t['loai_can_chu']).toBe('decision');
    const d = await canChuTrongDb(t['id'] as string);
    expect(d?.loai).toBe('decision');
    expect(d?.ly_do_de_xuat).toBe('D1 đã có sẵn trong Workers, không thêm hạ tầng');
    // Lệnh và cờ TTY **không** thuộc loại này (CHECK liên-cột của 0013).
    expect(d?.lenh).toBeNull();
    expect(d?.can_tty).toBe(0);

    // Nhãn **A, B, C…** do server gán theo thứ tự, và đúng một phương án đề xuất.
    const pa = await phuongAnCua(t['id'] as string);
    expect(pa.map((p) => p.nhan)).toEqual(['A', 'B']);
    expect(pa.map((p) => p.thu_tu)).toEqual([1, 2]);
    expect(pa.filter((p) => p.de_xuat === 1).map((p) => p.nhan)).toEqual(['A']);
  });

  it('`run_command`: có lệnh, và cờ cần TTY ghi được', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Chạy migration trên máy chủ',
      muc: 'urgent',
      loai: 'run_command',
      lenh: 'npx wrangler d1 migrations apply baton',
      can_tty: true,
      project_id: PJ,
    });
    expect(r.status).toBe(201);
    const t = await than(r);

    const d = await canChuTrongDb(t['id'] as string);
    expect(d?.lenh).toBe('npx wrangler d1 migrations apply baton');
    expect(d?.can_tty).toBe(1);
    expect(d?.ly_do_de_xuat).toBeNull();
    expect(await phuongAnCua(t['id'] as string)).toHaveLength(0);
  });

  it('`review`: ít nhất 1 file hoặc link, và `loai` từng dòng là khoá file/link', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Xem lại bản thiết kế',
      muc: 'later',
      loai: 'review',
      file_hoac_link: [
        'file:///srv/thiet-ke.md',
        'https://baton.example.com/pr/9',
        '/tmp/ghi-chu.txt',
      ],
      project_id: PJ,
    });
    expect(r.status).toBe(201);
    const t = await than(r);

    const { results } = await env.DB.prepare(
      'SELECT loai, dia_chi, thu_tu FROM can_chu_file WHERE can_chu_id = ? ORDER BY thu_tu',
    )
      .bind(t['id'])
      .all<{ loai: string; dia_chi: string; thu_tu: number }>();
    expect(results.map((f) => f.loai)).toEqual(['file', 'link', 'file']);
    expect(results.map((f) => f.thu_tu)).toEqual([1, 2, 3]);
  });

  it('`fyi`: không cần gì thêm (d.239 "không cần làm gì")', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Đã đổi tên nhánh mặc định',
      muc: 'later',
      loai: 'fyi',
      project_id: PJ,
    });
    expect(r.status).toBe(201);
    const t = await than(r);

    const d = await canChuTrongDb(t['id'] as string);
    expect(d?.loai).toBe('fyi');
    expect(d?.lenh).toBeNull();
    expect(d?.ly_do_de_xuat).toBeNull();
    expect(d?.trang_thai).toBe('open');
  });

  it('`loai` lạ → `INVALID_INPUT`', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Mục loại lạ',
      muc: 'today',
      loai: 'xin_y_kien',
      project_id: PJ,
    });
    expect(r.status).toBe(422);
    expect((await than(r))['error']).toBe('INVALID_INPUT');
  });

  it('tiêu đề `"   "` → `INVALID_INPUT`, kiểm **trước** khi tra dự án', async () => {
    const r = await tao(T_COORD, {
      tieu_de: '   ',
      muc: 'today',
      loai: 'fyi',
      project_id: 'pj-KHONG-CO-THAT',
    });
    expect(r.status).toBe(422);
    expect((await than(r))['error']).toBe('INVALID_INPUT');
  });
});

/* ================================================================== *
 * A2. Lệnh đi được với MỌI loại — d.250 vs d.237; `spec-questions.md` #130
 * ================================================================== */

describe('mục 8 d.250 — MỌI loại mang được lệnh, và đường đọc trả lại đúng lệnh đó', () => {
  /*
   * Lỗi thật 13/10: CoS tạo mục `decision` kèm `--command` và server **bỏ lệnh
   * im lặng**. d.250 viết "mỗi thẻ hiện đủ: … **lệnh có nút Copy**" cho **mọi**
   * thẻ; d.237 chỉ nói `run_command` **bắt buộc** có lệnh. Ba ca dưới là ba loại
   * còn lại, mỗi ca kiểm **cả hai** đầu: đã ghi vào DB (cột `lenh_kem` của 0023)
   * và đọc lại được qua `GET /v1/can-chu/:id` ở đúng trường `lenh`.
   */
  const ba_loai: { loai: string; them: Than }[] = [
    { loai: 'decision', them: QUYET_DINH },
    { loai: 'review', them: { loai: 'review', file_hoac_link: ['/tmp/xem.md'] } },
    { loai: 'fyi', them: { loai: 'fyi' } },
  ];

  for (const { loai, them } of ba_loai) {
    it(`\`${loai}\` mang được lệnh: ghi vào \`lenh_kem\`, đọc ra ở trường \`lenh\``, async () => {
      const r = await tao(T_COORD, {
        tieu_de: `Mục ${loai} có kèm lệnh`,
        muc: 'today',
        ...them,
        project_id: PJ,
        lenh: 'npm run deploy',
        can_tty: true,
      });
      expect(r.status).toBe(201);
      const id = (await than(r))['id'] as string;

      const d = await canChuTrongDb(id);
      expect(d?.loai).toBe(loai);
      // Cột `lenh` của 0013 vẫn **chỉ** của `run_command` (CHECK liên-cột).
      expect(d?.lenh).toBeNull();
      expect(d?.can_tty).toBe(0);
      expect(d?.lenh_kem).toBe('npm run deploy');
      expect(d?.can_tty_kem).toBe(1);

      // Đường ĐỌC gộp hai chỗ bằng `COALESCE` — client thấy **một** trường.
      const g = await goiApi(`/v1/can-chu/${id}`, TOKEN_CHU);
      expect(g.status).toBe(200);
      const m = await than(g);
      expect(m['lenh']).toBe('npm run deploy');
      expect(m['can_tty']).toBe(true);
    });
  }

  it('không gửi lệnh thì mọi loại vẫn `lenh` rỗng, cờ TTY = 0 (không cờ treo)', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Mục fyi không kèm lệnh',
      muc: 'later',
      loai: 'fyi',
      project_id: PJ,
      // `can_tty` **có** mà lệnh **không** ⇒ cờ về 0 (`kiemLenhKem` + trigger 0023).
      can_tty: true,
    });
    expect(r.status).toBe(201);
    const d = await canChuTrongDb((await than(r))['id'] as string);
    expect(d?.lenh).toBeNull();
    expect(d?.lenh_kem).toBeNull();
    expect(d?.can_tty).toBe(0);
    expect(d?.can_tty_kem).toBe(0);
  });

  it('`run_command` vẫn ghi vào cột `lenh` của 0013, không vào `lenh_kem`', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Chạy test',
      muc: 'today',
      loai: 'run_command',
      lenh: 'npm test',
      project_id: PJ,
    });
    expect(r.status).toBe(201);
    const d = await canChuTrongDb((await than(r))['id'] as string);
    expect(d?.lenh).toBe('npm test');
    expect(d?.lenh_kem).toBeNull();
  });

  it('luật thuần `kiemLenhKem`: không lệnh thì KHÔNG lỗi, có lệnh thì dùng chung luật', () => {
    expect(kiemLenhKem(undefined, undefined)).toEqual({ lenh: null, can_tty: false });
    expect(kiemLenhKem('   ', true)).toEqual({ lenh: null, can_tty: false });
    expect(kiemLenhKem(' npm test ', true)).toEqual({ lenh: 'npm test', can_tty: true });
    // Giới hạn dùng chung `kiemLenhChay` ⇒ cùng mã lỗi, không lệch một ký tự.
    expect(() => kiemLenhKem('x'.repeat(20_001), false)).toThrowError(/20.000 ký tự/);
    expect(() => kiemLenhKem('npm test', 'co')).toThrowError(/can_tty/);
    // …và **không** ném `COMMAND_REQUIRED` khi không có lệnh: đó là luật của
    // riêng `run_command` (d.287), không của ba loại kia.
    expect(() => kiemLenhChay('   ', false)).toThrowError(/lệnh hoặc script/);
  });

  it('trigger 0023: `lenh_kem` trên một mục `run_command` thì VỠ tại DB', async () => {
    const t = Date.now();
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu
           (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
            han_luc, ly_do_de_xuat, lenh, can_tty, lenh_kem, can_tty_kem,
            tao_luc, cap_nhat_luc)
         VALUES (?, ?, 9301, 'Hai cho cung mang lenh', NULL, 'today', 'run_command', 'open',
                 NULL, NULL, 'npm test', 0, 'npm run deploy', 0, ?, ?)`,
      )
        .bind(crypto.randomUUID(), WS, t, t)
        .run(),
    ).rejects.toThrow();

    // Và một cờ TTY **không có lệnh nào** cũng vỡ.
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu
           (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
            han_luc, ly_do_de_xuat, lenh, can_tty, lenh_kem, can_tty_kem,
            tao_luc, cap_nhat_luc)
         VALUES (?, ?, 9302, 'Co TTY ma khong co lenh', NULL, 'today', 'fyi', 'open',
                 NULL, NULL, NULL, 0, NULL, 1, ?, ?)`,
      )
        .bind(crypto.randomUUID(), WS, t, t)
        .run(),
    ).rejects.toThrow();
  });
});

/* ================================================================== *
 * B. Lỗi của mục 8 (phần Lỗi) + ranh giới 2–5 phương án
 * ================================================================== */

describe('mục 8 phần Lỗi — OPTIONS_REQUIRED, COMMAND_REQUIRED, review thiếu file', () => {
  it('`decision` thiếu phương án → `OPTIONS_REQUIRED` (422 — 19.12 câu 19)', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Quyết mà không có phương án',
      muc: 'today',
      loai: 'decision',
      ly_do_de_xuat: 'không có gì',
      project_id: PJ,
    });
    expect(r.status).toBe(422);
    expect((await than(r))['error']).toBe('OPTIONS_REQUIRED');
  });

  it('`run_command` thiếu lệnh → `COMMAND_REQUIRED` (422)', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Chạy gì đó',
      muc: 'today',
      loai: 'run_command',
      project_id: PJ,
    });
    expect(r.status).toBe(422);
    expect((await than(r))['error']).toBe('COMMAND_REQUIRED');
  });

  it('`review` thiếu file hoặc link → 422 `INVALID_INPUT`', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Review mà không có gì để xem',
      muc: 'today',
      loai: 'review',
      project_id: PJ,
    });
    expect(r.status).toBe(422);
    const t = await than(r);
    expect(t['error']).toBe('INVALID_INPUT');
    expect(String(t['message'])).toContain('ít nhất 1 file hoặc link');
  });

  it('ranh giới số phương án: **1 và 6 → lỗi**, **2 và 5 → được**', async () => {
    const dung = (n: number): Than => ({
      tieu_de: `Quyết với ${String(n)} phương án`,
      muc: 'today',
      loai: 'decision',
      ly_do_de_xuat: 'lý do',
      project_id: PJ,
      phuong_an: Array.from({ length: n }, (_, i) => ({
        noi_dung: `Phương án ${String(i + 1)}`,
        de_xuat: i === 0,
      })),
    });

    expect((await tao(T_COORD, dung(1))).status).toBe(422);
    expect((await tao(T_COORD, dung(6))).status).toBe(422);
    expect((await tao(T_COORD, dung(SO_PHUONG_AN_TOI_THIEU))).status).toBe(201);
    expect((await tao(T_COORD, dung(SO_PHUONG_AN_TOI_DA))).status).toBe(201);
  });

  it('`decision` thiếu phương án **đề xuất** hoặc thiếu **lý do** → `OPTIONS_REQUIRED`', async () => {
    const khong_de_xuat = await tao(T_COORD, {
      ...QUYET_DINH,
      project_id: PJ,
      phuong_an: [{ noi_dung: 'Dùng D1' }, { noi_dung: 'Dùng Postgres' }],
    });
    expect(khong_de_xuat.status).toBe(422);
    expect((await than(khong_de_xuat))['error']).toBe('OPTIONS_REQUIRED');

    const khong_ly_do = await tao(T_COORD, {
      ...QUYET_DINH,
      project_id: PJ,
      ly_do_de_xuat: '   ',
    });
    expect(khong_ly_do.status).toBe(422);
    expect((await than(khong_ly_do))['error']).toBe('OPTIONS_REQUIRED');
  });

  it('luật thuần: mỗi phương án tối đa 3 dòng (mục 8 d.236)', () => {
    expect(() =>
      kiemPhuongAn([{ noi_dung: 'a\nb\nc', de_xuat: true }, { noi_dung: 'x' }], 'lý do'),
    ).not.toThrow();
    expect(() =>
      kiemPhuongAn([{ noi_dung: 'a\nb\nc\nd', de_xuat: true }, { noi_dung: 'x' }], 'lý do'),
    ).toThrowError(/3 dòng/);
  });

  it('luật thuần: nhãn A–E do server gán, đúng thứ tự gửi lên', () => {
    const { phuong_an } = kiemPhuongAn(
      ['một', 'hai', { noi_dung: 'ba', de_xuat: true }, 'bốn', 'năm'],
      'lý do',
    );
    expect(phuong_an.map((p) => p.nhan)).toEqual([...NHAN_PHUONG_AN]);
    expect(phuong_an.filter((p) => p.de_xuat).map((p) => p.nhan)).toEqual(['C']);
  });

  it('luật thuần: `COMMAND_REQUIRED` cho lệnh rỗng, và file/link phải mở được', () => {
    expect(() => kiemLenhChay('   ', false)).toThrowError(/lệnh hoặc script/);
    expect(() => kiemFileReview([])).toThrowError(/ít nhất 1 file hoặc link/);
    expect(() => kiemFileReview(['chỉ là một câu chữ'])).toThrowError(/file:\/\//);
    expect(kiemFileReview(['file:///a', 'https://b'])).toEqual([
      { loai: 'file', dia_chi: 'file:///a', thu_tu: 1 },
      { loai: 'link', dia_chi: 'https://b', thu_tu: 2 },
    ]);
  });
});

/* ================================================================== *
 * C. 19.8 — `fyi` tối đa 🟡, và **báo lại** cho agent
 * ================================================================== */

describe('19.8 d.534 — loại `Chỉ để biết` tối đa 🟡', () => {
  it('gửi 🔴 → hạ về 🟡 **và** phản hồi báo lại việc hạ đó', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Chỉ để biết mà gửi gấp',
      muc: 'urgent',
      loai: 'fyi',
      project_id: PJ,
    });
    expect(r.status).toBe(201);
    const t = await than(r);

    // Nửa thứ nhất: mức thật sự được ghi là 🟡.
    expect(t['muc']).toBe('today');
    expect((await canChuTrongDb(t['id'] as string))?.muc).toBe('today');

    // Nửa thứ hai — nửa dễ mất: **báo lại trong kết quả trả về**, không im lặng.
    expect(t['muc_da_ha']).toBe(true);
    expect(String(t['ghi_chu_muc'])).toContain('Chỉ để biết');
    expect(String(t['ghi_chu_muc'])).toContain('🟡');
  });

  it('`fyi` gửi 🟡, và loại khác gửi 🔴 → **không** hạ gì, không ghi chú', async () => {
    const fyi_vang = await tao(T_COORD, {
      tieu_de: 'fyi vàng',
      muc: 'today',
      loai: 'fyi',
      project_id: PJ,
    });
    expect((await than(fyi_vang))['muc_da_ha']).toBe(false);

    const lenh_do = await tao(T_COORD, {
      tieu_de: 'Chạy lệnh gấp',
      muc: 'urgent',
      loai: 'run_command',
      lenh: 'npm test',
      project_id: PJ,
    });
    const t = await than(lenh_do);
    expect(t['muc']).toBe('urgent');
    expect(t['muc_da_ha']).toBe(false);
    expect(t['ghi_chu_muc']).toBeNull();
  });

  it('luật thuần `haMucNeuCan`: chỉ cặp (`fyi`, 🔴) bị hạ', () => {
    expect(haMucNeuCan('fyi', 'urgent')).toMatchObject({ muc: 'today', da_ha: true });
    expect(haMucNeuCan('fyi', 'today').da_ha).toBe(false);
    expect(haMucNeuCan('fyi', 'later').da_ha).toBe(false);
    expect(haMucNeuCan('decision', 'urgent')).toMatchObject({ muc: 'urgent', da_ha: false });
  });

  it('DB là lớp thứ hai: một mục `fyi` 🔴 không ghi được dù đi thẳng SQL', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, muc, loai, trang_thai,
                              can_tty, tao_luc, cap_nhat_luc)
         VALUES ('ct-xau', ?, 999, 'fyi gấp trái 19.8', 'urgent', 'fyi', 'open', 0, 1, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();
  });
});

/* ================================================================== *
 * D. 19.8 — hạn mặc định, kể cả ranh giới 18:00
 * ================================================================== */

describe('19.8 d.533 — hạn mặc định của ba mức', () => {
  const GIO = 3_600_000;

  /** Mốc epoch ứng với đúng `gio:phut` **giờ địa phương** ngày 2026-10-03. */
  function mocDiaPhuong(gio: number, phut = 0): number {
    return Date.UTC(2026, 9, 3, gio, phut) - MUI_GIO_CHU_PHUT * 60_000;
  }

  it('🔴 = **4 giờ** kể từ lúc tạo', () => {
    const t = mocDiaPhuong(9, 15);
    expect(hanMacDinh('urgent', t)).toBe(t + 4 * GIO);
  });

  it('⚪ = **không có hạn mặc định**', () => {
    expect(hanMacDinh('later', mocDiaPhuong(9))).toBeNull();
  });

  it('🟡 tạo **trước 18:00** → 20:00 **cùng ngày**', () => {
    const han = hanMacDinh('today', mocDiaPhuong(17, 59));
    expect(han).toBe(mocDiaPhuong(20));
    expect(gioDiaPhuong(han ?? 0)).toBe(20);
  });

  it('🟡 tạo **đúng 18:00** → 20:00 **hôm sau** (ranh giới thuộc nhánh sau)', () => {
    expect(hanMacDinh('today', mocDiaPhuong(18))).toBe(mocDiaPhuong(20) + 24 * GIO);
  });

  it('🟡 tạo **sau 18:00** (vd 21:30) → 20:00 **hôm sau**', () => {
    const han = hanMacDinh('today', mocDiaPhuong(21, 30));
    expect(han).toBe(mocDiaPhuong(20) + 24 * GIO);
    expect(gioDiaPhuong(han ?? 0)).toBe(20);
  });

  it('🟡 tạo lúc 00:30 (sau nửa đêm) → 20:00 **cùng ngày đó**', () => {
    expect(hanMacDinh('today', mocDiaPhuong(0, 30))).toBe(mocDiaPhuong(20));
  });

  it('đường HTTP: ba mức nhận đúng hạn mặc định', async () => {
    const do_ = await tao(T_COORD, {
      tieu_de: 'Gấp',
      muc: 'urgent',
      loai: 'fyi',
      project_id: PJ,
    });
    // `fyi` 🔴 bị hạ về 🟡 (19.8) ⇒ hạn phải theo 🟡, **không** theo 🔴. Đây là
    // chỗ hai luật của 19.8 gặp nhau: hạ mức **trước**, rồi mới tính hạn.
    const t_do = await than(do_);
    expect(t_do['muc']).toBe('today');
    const d = await canChuTrongDb(t_do['id'] as string);
    expect(t_do['han_luc']).toBe(hanMacDinh('today', d?.tao_luc ?? 0));
    expect(gioDiaPhuong(t_do['han_luc'] as number)).toBe(20);

    const vang = await tao(T_COORD, {
      tieu_de: 'Trong ngày',
      muc: 'today',
      loai: 'review',
      file_hoac_link: ['file:///a'],
      project_id: PJ,
    });
    const t_vang = await than(vang);
    expect(t_vang['han_mac_dinh']).toBe(true);
    expect(gioDiaPhuong(t_vang['han_luc'] as number)).toBe(20);

    const trang = await tao(T_COORD, {
      tieu_de: 'Không gấp',
      muc: 'later',
      loai: 'fyi',
      project_id: PJ,
    });
    expect((await than(trang))['han_luc']).toBeNull();
  });

  it('🔴 của một loại khác `fyi`: hạn đúng **4 giờ** sau lúc tạo', async () => {
    const r = await tao(T_COORD, {
      tieu_de: 'Chạy lệnh gấp',
      muc: 'urgent',
      loai: 'run_command',
      lenh: 'npm test',
      project_id: PJ,
    });
    const t = await than(r);
    const d = await canChuTrongDb(t['id'] as string);
    expect(t['han_luc']).toBe((d?.tao_luc ?? 0) + 4 * GIO);
  });

  it('hạn do agent gửi thì **tôn trọng**, và `han_mac_dinh` là false', async () => {
    const rieng = Date.UTC(2026, 11, 25, 9, 0);
    const r = await tao(T_COORD, {
      tieu_de: 'Có hạn riêng',
      muc: 'urgent',
      loai: 'fyi',
      han_luc: rieng,
      project_id: PJ,
    });
    const t = await than(r);
    expect(t['han_luc']).toBe(rieng);
    expect(t['han_mac_dinh']).toBe(false);
    expect((await canChuTrongDb(t['id'] as string))?.han_luc).toBe(rieng);
  });

  it('**quá hạn không đổi mức** (19.8): mức giữ nguyên, và quá hạn là dẫn xuất', async () => {
    const qua = Date.now() - 10 * GIO;
    const r = await tao(T_COORD, {
      tieu_de: 'Mục đã quá hạn',
      muc: 'later',
      loai: 'fyi',
      han_luc: qua,
      project_id: PJ,
    });
    const t = await than(r);

    // Mức giữ nguyên ⚪ — không có chuyện tự lên 🔴.
    expect((await canChuTrongDb(t['id'] as string))?.muc).toBe('later');
    // "Quá hạn" tính được, nhưng **không** có cột nào trong DB.
    expect(quaHan(qua, Date.now())).toBe(true);
    const { results } = await env.DB.prepare('PRAGMA table_info(can_chu)').all<{ name: string }>();
    expect(results.map((c) => c.name)).not.toContain('qua_han');
  });
});

/* ================================================================== *
 * E. Quyền tạo — mục 8 d.229, bảng quyền mục 3, 19.12 câu 15 và 18
 * ================================================================== */

describe('mục 8 d.229 + bảng quyền mục 3 — ai tạo được mục Cần Chủ', () => {
  it('`coordinator`, `manager` và **chủ** tạo được', async () => {
    expect((await tao(T_COORD, { ...QUYET_DINH, project_id: PJ })).status).toBe(201);
    expect((await tao(T_MANAGER, { ...QUYET_DINH, project_id: PJ })).status).toBe(201);
    expect((await tao(TOKEN_CHU, { ...QUYET_DINH, project_id: PJ })).status).toBe(201);
  });

  it('`worker` tạo → **`FORBIDDEN`/403**', async () => {
    const r = await tao(T_WORKER, { ...QUYET_DINH, project_id: PJ });
    expect(r.status).toBe(403);
    expect((await than(r))['error']).toBe('FORBIDDEN');
  });

  it('`reviewer` tạo → **`FORBIDDEN`/403**', async () => {
    const r = await tao(T_REVIEWER, { ...QUYET_DINH, project_id: PJ });
    expect(r.status).toBe(403);
    expect((await than(r))['error']).toBe('FORBIDDEN');
  });

  it('agent **ngoài phạm vi dự án** → 403, **không** 404 (19.12 câu 15)', async () => {
    const r = await tao(T_NGOAI, { ...QUYET_DINH, project_id: PJ });
    expect(r.status).toBe(403);
    expect((await than(r))['error']).toBe('FORBIDDEN');
  });

  it('dự án **không tồn tại** cho agent ngoài phạm vi cũng ra **403** — không có máy dò', async () => {
    const co_that = await tao(T_NGOAI, { ...QUYET_DINH, project_id: PJ });
    const khong_co = await tao(T_NGOAI, { ...QUYET_DINH, project_id: 'pj-KHONG-CO-THAT' });
    expect(co_that.status).toBe(403);
    expect(khong_co.status).toBe(403);
    // Hai ca phải ra **phản hồi giống hệt nhau** (19.12 câu 15).
    expect(await than(khong_co)).toEqual(await than(co_that));
  });

  it('`worker` bị chặn **trước** khi đụng dự án: dự án không tồn tại vẫn ra 403', async () => {
    const r = await tao(T_WORKER, { ...QUYET_DINH, project_id: 'pj-KHONG-CO-THAT' });
    expect(r.status).toBe(403);
  });

  it('19.12 câu 18 — cấp `T-số` đi qua ô "Tạo mục Cần Chủ": `worker` không đốt được số', async () => {
    const r = await tao(T_WORKER, { ...QUYET_DINH, project_id: PJ });
    expect(r.status).toBe(403);
    const dem = await env.DB.prepare(
      "SELECT gia_tri FROM bo_dem WHERE workspace_id = ? AND pham_vi = 'workspace' AND khoa = 'ask'",
    )
      .bind(WS)
      .first<{ gia_tri: number }>();
    expect(dem).toBeNull();
  });

  // BAT-58 (19.12 câu 15, `spec-questions.md` #176): trước là 403; nay ticket người
  // gọi không thấy ra 404 GIỐNG HỆT id bịa — 403 cho id thật là một máy dò.
  it('ticket liên quan ngoài phạm vi dự án của agent → 404 giống hệt id bịa (BAT-58), không tạo mục', async () => {
    const tk_khac = await dungTicket(PJ_KHAC, 1, 'Việc của dự án khác');
    const r = await tao(T_MANAGER, {
      ...QUYET_DINH,
      project_id: PJ,
      ticket_lien_quan: [tk_khac],
    });
    const bia = await tao(T_MANAGER, {
      ...QUYET_DINH,
      project_id: PJ,
      ticket_lien_quan: ['tk-khong-co'],
    });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual(await bia.json());
  });
});

/* ================================================================== *
 * E2. Trạng thái dự án — 19.12 câu 25 (`archived`), câu 26 (`paused`)
 * ================================================================== */

describe('19.12 câu 25–26 — dự án `archived` chặn, `paused` thì VẪN tạo được', () => {
  it('dự án **`archived`** → 409 `PROJECT_NOT_ACCEPTING` (câu 25: mọi lệnh **ghi** bị từ chối)', async () => {
    const pj_luu = await dungDuAn('ARC', 'Dự án đã lưu trữ', 'archived');
    const r = await tao(T_COORD, { ...QUYET_DINH, project_id: pj_luu });
    expect(r.status).toBe(409);
    expect((await than(r))['error']).toBe('PROJECT_NOT_ACCEPTING');

    // Và **không** mục nào được ghi, cũng không đốt `T-số` nào.
    const dem = await env.DB.prepare('SELECT count(*) AS n FROM can_chu').first<{ n: number }>();
    expect(dem?.n).toBe(0);
  });

  it('dự án **`paused`** → **201 vẫn tạo được** (câu 26 nói về **việc mới**, mục Cần Chủ không là việc của agent)', async () => {
    /*
     * **Lựa chọn có chủ ý, đừng "sửa" thành chặn.** 19.12 câu 26 đọc `paused` là
     * "agent không nhận **việc mới** / không tạo được **ticket** trong dự án"
     * (mục 2, 4) — đó là luật về việc của **agent**. Một mục Cần Chủ không phải
     * việc của agent: nó là một câu hỏi gửi cho **chủ**, và chủ phải hỏi được về
     * một dự án vừa tạm dừng (thường đó chính là lúc cần hỏi nhất). Nên handler
     * gọi `batBuocKhongLuuTru` (chỉ chặn `archived`), **không**
     * `batBuocNhanViecMoi` (chặn cả `paused`).
     */
    const pj_dung = await dungDuAn('PAU', 'Dự án tạm dừng', 'paused');
    const r = await tao(T_COORD, { ...QUYET_DINH, project_id: pj_dung });
    expect(r.status).toBe(201);
    const t = await than(r);
    expect(t['project_id']).toBe(pj_dung);
    expect((await canChuTrongDb(t['id'] as string))?.project_id).toBe(pj_dung);
  });

  it('mục **Chung** không có dự án nào để kiểm trạng thái → vẫn tạo được', async () => {
    await dungDuAn('ARC', 'Dự án đã lưu trữ', 'archived');
    expect((await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Hỏi chung' })).status).toBe(201);
  });
});

/* ================================================================== *
 * F. Mục "Chung" — 19.12 câu 4 (+ câu hỏi SPEC #69)
 * ================================================================== */

describe('19.12 câu 4 — "Chung" là `project_id` RỖNG, không một dự án', () => {
  it('không truyền dự án → `project_id` **NULL**, và không có dòng `project` nào tên "Chung"', async () => {
    const r = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Hỏi chung một câu' });
    expect(r.status).toBe(201);
    const t = await than(r);

    expect(t['project_id']).toBeNull();
    expect((await canChuTrongDb(t['id'] as string))?.project_id).toBeNull();

    const chung = await env.DB.prepare(
      "SELECT 1 AS co FROM project WHERE ten = 'Chung' OR ma = 'CHUNG'",
    ).first<{ co: number }>();
    expect(chung).toBeNull();
  });

  it('`project_id` rỗng hoặc `null` cũng là Chung', async () => {
    const rong = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chung A', project_id: '' });
    const vo = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chung B', project_id: null });
    expect((await than(rong))['project_id']).toBeNull();
    expect((await than(vo))['project_id']).toBeNull();
  });

  /*
   * **Hướng MỞ** cho đường TẠO (#69, Manager chốt ở lượt sửa review của P4 lượt
   * 1). Căn cứ là chữ SPEC, không sở thích: d.229 nói mục Cần Chủ do agent
   * `coordinator` **hoặc `manager`** tạo, và 19.12 câu 4 nói `baton ask` **không
   * truyền dự án** thì mục là Chung — nên "`manager` gửi `baton ask` không dự án"
   * là một đường SPEC **cho phép tường minh**, và chặn nó là siết vượt chữ SPEC.
   * Chỗ SPEC thật sự im lặng là **phạm vi/tầm nhìn** của mục Chung (ai **đọc**
   * được nó) — #69 đã thu hẹp vào đúng đó, và đường đọc là lượt sau.
   */
  it('#69 hướng MỞ: chủ, `coordinator` **và `manager`** tạo được mục Chung', async () => {
    expect((await tao(TOKEN_CHU, { ...QUYET_DINH, tieu_de: 'Chung của chủ' })).status).toBe(201);
    expect((await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chung của CoS' })).status).toBe(201);

    const r = await tao(T_MANAGER, { ...QUYET_DINH, tieu_de: 'Chung của manager' });
    expect(r.status).toBe(201);
    // Và nó là một mục **Chung** thật, không lặng lẽ gán dự án nào.
    const t = await than(r);
    expect(t['project_id']).toBeNull();
    expect((await canChuTrongDb(t['id'] as string))?.project_id).toBeNull();

    // `manager` vẫn tạo được mục **gắn dự án** của nó như thường.
    expect((await tao(T_MANAGER, { ...QUYET_DINH, project_id: PJ })).status).toBe(201);
  });

  it('#69 hướng MỞ **không** nới cho `worker`/`reviewer`: mục Chung vẫn 403', async () => {
    for (const token of [T_WORKER, T_REVIEWER]) {
      const r = await tao(token, { ...QUYET_DINH, tieu_de: 'Chung của worker' });
      expect(r.status).toBe(403);
      expect((await than(r))['error']).toBe('FORBIDDEN');
    }
  });

  it('hai đường cùng ô `create_ask` **khớp nhau**: ai cấp được `T-số` thì tạo được mục Chung', async () => {
    /*
     * 19.12 câu 18: cấp `T-số` đi qua đúng ô "Tạo mục Cần Chủ". Luật **duy nhất**
     * của `handlerCapSoCanChu` (`lenh-ticket.ts`) là
     * `batBuocQuyen(ai, 'create_ask', {})` — **không** dự án, y như đường tạo mục
     * Chung sau khi #69 mở. Nên `quyen(ai, 'create_ask', {})` *là* cửa của đường
     * cấp số, và ca này đặt nó cạnh kết quả HTTP thật của đường tạo: hai đường
     * phải trả cùng câu trả lời cho cùng một vai, nếu không thì có vai đốt được
     * số mà không tạo được mục (đúng lỗ hướng ĐÓNG để lại).
     */
    for (const [token, vai] of [
      [T_COORD, 'coordinator'],
      [T_MANAGER, 'manager'],
      [T_WORKER, 'worker'],
      [T_REVIEWER, 'reviewer'],
    ] as const) {
      const cua_cap_so = quyen(
        {
          loai: 'agent',
          agent_id: `ag-${vai}`,
          vai_tro: vai,
          disabled: false,
          vao_tat_ca_du_an: vai === 'coordinator',
          du_an_duoc_vao: [PJ],
          du_an_minh_quan_ly: [],
          ghi_de: {},
        },
        'create_ask',
        {},
      ).cho_phep;

      const tao_muc = await tao(token, { ...QUYET_DINH, tieu_de: `Chung của ${vai}` });
      expect(tao_muc.status, `tạo mục Chung với vai ${vai}`).toBe(cua_cap_so ? 201 : 403);
    }
  });
});

/* ================================================================== *
 * G. `T-số` — mục 8: tăng dần toàn workspace, không tái dùng
 * ================================================================== */

describe('mục 8 — `T-số` tăng dần TOÀN WORKSPACE, không tái dùng', () => {
  it('số tăng dần và **không theo dự án**: hai dự án khác nhau vẫn cùng một dãy', async () => {
    const a = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Một', project_id: PJ });
    const b = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Hai', project_id: PJ_KHAC });
    const c = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Ba' }); // Chung

    const so: unknown[] = [];
    for (const r of [a, b, c]) so.push((await than(r))['ma_so']);
    expect(so).toEqual([1, 2, 3]);
  });

  it('mã dạng chữ là `T-số` (mục 8, mục 13 `baton result T-x`)', async () => {
    const r = await tao(T_COORD, { ...QUYET_DINH, project_id: PJ });
    expect((await than(r))['ma']).toBe('T-1');
    expect(maCanChu(42)).toBe('T-42');
  });

  it('hai mục tạo **cùng lúc** qua cửa ghi → **hai số khác nhau**', async () => {
    // Đua thật: 6 request song song. Cửa ghi là một Durable Object đơn luồng nên
    // chúng xếp hàng, và `capSo` + INSERT nằm trong **cùng một** batch.
    const ra = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        tao(T_COORD, { ...QUYET_DINH, tieu_de: `Song song ${String(i)}`, project_id: PJ }),
      ),
    );
    for (const r of ra) expect(r.status).toBe(201);

    const so: number[] = [];
    for (const r of ra) so.push((await than(r))['ma_so'] as number);
    expect(new Set(so).size).toBe(6);
    expect([...so].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('**không tái dùng**: bộ đếm chỉ tăng, nên số của một mục không bao giờ quay lại', async () => {
    await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Một', project_id: PJ });
    // Hạ bộ đếm là việc trigger `tg_bo_dem_chi_tang` (0001) cấm.
    await expect(
      env.DB.prepare(
        "UPDATE bo_dem SET gia_tri = 0 WHERE workspace_id = ? AND pham_vi = 'workspace' AND khoa = 'ask'",
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();

    const sau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Hai', project_id: PJ });
    expect((await than(sau))['ma_so']).toBe(2);
  });

  it('`T-số` duy nhất trong workspace (`ux_can_chu_ma_so`)', async () => {
    await dungCanChu('ct-1', { ma_so: 7 });
    await expect(dungCanChu('ct-2', { ma_so: 7 })).rejects.toThrow();
  });

  it('client **không** khai được `ma_so` hay `trang_thai` (whitelist bỏ)', async () => {
    const r = await tao(T_COORD, {
      ...QUYET_DINH,
      project_id: PJ,
      ma_so: 999,
      trang_thai: 'resolved',
    });
    const t = await than(r);
    expect(t['ma_so']).toBe(1);
    expect(t['trang_thai']).toBe('open');
    expect(t['bo_qua']).toEqual(expect.arrayContaining(['ma_so', 'trang_thai']));
  });
});

/* ================================================================== *
 * H. Cờ "có thể trùng T-x" — mục 8, phần Lỗi
 * ================================================================== */

describe('mục 8 phần Lỗi — cờ "có thể trùng T-x"', () => {
  it('cùng tiêu đề + cùng dự án + trong 24 giờ + mục kia `Chờ` → **vẫn tạo** nhưng có cờ', async () => {
    const dau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chọn DB', project_id: PJ });
    const t_dau = await than(dau);

    const sau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chọn DB', project_id: PJ });
    // **Vẫn tạo** — SPEC nói rõ.
    expect(sau.status).toBe(201);
    const t_sau = await than(sau);

    expect(t_sau['co_the_trung_ma']).toBe(t_dau['ma']);
    expect(t_sau['co_the_trung_can_chu_id']).toBe(t_dau['id']);
    // Cờ là một **khoá thật** trỏ tới mục kia, không một chuỗi.
    expect((await canChuTrongDb(t_sau['id'] as string))?.trung_voi_can_chu_id).toBe(t_dau['id']);
  });

  it('đối chứng — **quá 24 giờ** thì KHÔNG cờ', async () => {
    await dungCanChu('ct-cu', {
      tieu_de: 'Chọn DB',
      project_id: PJ,
      tao_luc: Date.now() - CUA_SO_TRUNG_MS - 60_000,
    });
    const r = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chọn DB', project_id: PJ });
    expect((await than(r))['co_the_trung_ma']).toBeNull();
  });

  it('đối chứng — **khác dự án** thì KHÔNG cờ (gồm cả cặp Chung vs có dự án)', async () => {
    await dungCanChu('ct-khac-pj', { tieu_de: 'Chọn DB', project_id: PJ_KHAC });
    const r = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chọn DB', project_id: PJ });
    expect((await than(r))['co_the_trung_ma']).toBeNull();

    await dungCanChu('ct-chung', { tieu_de: 'Hỏi chung', project_id: null });
    const co_pj = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Hỏi chung', project_id: PJ });
    expect((await than(co_pj))['co_the_trung_ma']).toBeNull();
  });

  it('hai mục **Chung** cùng tiêu đề trong 24 giờ thì CÓ cờ (`null` = `null` là "cùng dự án")', async () => {
    const dau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Hỏi chung' });
    const sau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Hỏi chung' });
    expect((await than(sau))['co_the_trung_ma']).toBe((await than(dau))['ma']);
  });

  it('đối chứng — mục kia **đã xử lý** hoặc **bỏ qua** thì KHÔNG cờ', async () => {
    await dungCanChu('ct-xong', { tieu_de: 'Chọn DB', project_id: PJ, trang_thai: 'resolved' });
    await dungCanChu('ct-bo', { tieu_de: 'Chọn DB', project_id: PJ, trang_thai: 'skipped' });
    const r = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chọn DB', project_id: PJ });
    expect((await than(r))['co_the_trung_ma']).toBeNull();
  });

  /*
   * **Ca phân biệt được hai cài đặt** (#70). Trước lượt sửa này câu SQL lọc
   * `tieu_de = ?` **đúng chuỗi**, nên phép hạ chữ của `mucCoTheTrung` không bao
   * giờ khớp thêm gì — nó là mã chết, và lời khai "không phân biệt hoa/thường"
   * không đúng với mã. Nay phép so nằm trong SQL (`lower(tieu_de) = lower(?)`),
   * nên hai tiêu đề khác nhau **chỉ ở hoa/thường ASCII** phải CÓ cờ. Ca này đỏ
   * với cài đặt cũ, xanh với cài đặt mới.
   */
  it('khác nhau **chỉ ở hoa/thường (ASCII)** + khác khoảng trắng hai đầu → VẪN có cờ', async () => {
    const dau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'Chon DB', project_id: PJ });
    const sau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: '  chon db  ', project_id: PJ });
    expect(sau.status).toBe(201);
    expect((await than(sau))['co_the_trung_ma']).toBe((await than(dau))['ma']);
  });

  it('giới hạn đã khai của #70: khác hoa/thường ở một chữ **có dấu** thì KHÔNG cờ', async () => {
    // `lower()` của SQLite chỉ biết ASCII, nên `Ọ` không hạ về `ọ`.
    const dau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'CHỌN DB', project_id: PJ });
    expect(dau.status).toBe(201);
    const sau = await tao(T_COORD, { ...QUYET_DINH, tieu_de: 'chọn db', project_id: PJ });
    expect((await than(sau))['co_the_trung_ma']).toBeNull();
  });

  it('luật thuần `chuanHoaTieuDe` là **bản sao** của `lower()` SQLite: chỉ ASCII', () => {
    expect(chuanHoaTieuDe('  Chon DB  ')).toBe('chon db');
    // Chữ có dấu **không** bị hạ — cố tình, để hàm này không rộng hơn câu SQL.
    expect(chuanHoaTieuDe('CHỌN DB')).toBe('chỌn db');
    expect(chuanHoaTieuDe('CHỌN DB')).not.toBe(chuanHoaTieuDe('chọn db'));
  });

  it('luật thuần `mucCoTheTrung`: trả mục **mới nhất** khi có nhiều mục thoả', () => {
    const t = 1_000_000_000_000;
    const ra = mucCoTheTrung(
      { tieu_de: 'Chọn DB', project_id: 'pj-SAI' },
      [
        { id: 'a', ma_so: 1, tieu_de: 'Chọn DB', project_id: 'pj-SAI', tao_luc: t - 5000 },
        { id: 'b', ma_so: 2, tieu_de: 'chọn db ', project_id: 'pj-SAI', tao_luc: t - 1000 },
        { id: 'c', ma_so: 3, tieu_de: 'Chọn DB', project_id: null, tao_luc: t - 10 },
      ],
      t,
    );
    expect(ra?.id).toBe('b');
  });
});

/* ================================================================== *
 * I. Ticket liên quan — mục 8 d.240 ("nhiều")
 * ================================================================== */

describe('mục 8 d.240 — ticket liên quan là NHIỀU', () => {
  it('nối được nhiều ticket, bỏ trùng, và nối cả ticket **khác dự án**', async () => {
    const t1 = await dungTicket(PJ, 1, 'Việc một');
    const t2 = await dungTicket(PJ, 2, 'Việc hai');
    const t3 = await dungTicket(PJ_KHAC, 1, 'Việc dự án khác');

    // `coordinator` vào được mọi dự án, nên nối được cả ticket của PJ_KHAC —
    // cùng tinh thần "liên kết ticket được khác dự án" (mục 4).
    const r = await tao(T_COORD, {
      ...QUYET_DINH,
      project_id: PJ,
      ticket_lien_quan: [t1, t2, t3, t1],
    });
    expect(r.status).toBe(201);
    const t = await than(r);
    expect(t['so_ticket_lien_quan']).toBe(3);

    const { results } = await env.DB.prepare(
      'SELECT ticket_id FROM can_chu_ticket WHERE can_chu_id = ? ORDER BY ticket_id',
    )
      .bind(t['id'])
      .all<{ ticket_id: string }>();
    expect(results.map((x) => x.ticket_id).sort()).toEqual([t1, t2, t3].sort());
  });

  it('ticket không tồn tại → `NOT_FOUND`, và **không** tạo mục nào', async () => {
    const r = await tao(T_COORD, {
      ...QUYET_DINH,
      project_id: PJ,
      ticket_lien_quan: ['tk-khong-co-that'],
    });
    expect(r.status).toBe(404);
    const dem = await env.DB.prepare('SELECT count(*) AS n FROM can_chu').first<{ n: number }>();
    expect(dem?.n).toBe(0);
  });
});

/* ================================================================== *
 * J. Trigger workspace khớp — SPEC mục 1, 18
 * ================================================================== */

describe('SPEC mục 1, 18 — mọi khoá ngoài phải cùng workspace', () => {
  const WS2 = 'ws-zz-khac';

  beforeEach(async () => {
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, 1, 1)',
    )
      .bind(WS2, 'Người khác')
      .run();
  });

  it('mục mang workspace khác **dự án** của nó → chặn tại DB', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, project_id, muc, loai,
                              trang_thai, can_tty, tao_luc, cap_nhat_luc)
         VALUES ('ct-x', ?, 1, 'Xuyên workspace', ?, 'today', 'fyi', 'open', 0, 1, 1)`,
      )
        .bind(WS2, PJ)
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('mục mang workspace khác **agent tạo** → chặn tại DB', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, muc, loai, trang_thai,
                              can_tty, tao_luc, cap_nhat_luc, tao_boi_agent_id)
         VALUES ('ct-y', ?, 1, 'Xuyên workspace', 'today', 'fyi', 'open', 0, 1, 1, 'ag-coord')`,
      )
        .bind(WS2)
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('**phương án** mang workspace khác mục cha → chặn tại DB', async () => {
    await dungCanChu('ct-pa', { loai: 'decision' });
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu_phuong_an
           (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
         VALUES ('pa-x', ?, 'ct-pa', 'A', 'xuyên workspace', 1, 1, 1)`,
      )
        .bind(WS2)
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('**ticket liên quan** ở workspace khác → chặn tại DB', async () => {
    await dungCanChu('ct-tk');
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
       VALUES ('pj-ws2', ?, 'Dự án kia', 'KIA', 'active', 1, 1)`,
    )
      .bind(WS2)
      .run();
    await env.DB.prepare(
      `INSERT INTO ticket (id, workspace_id, project_id, so, tieu_de, trang_thai, uu_tien,
                           hang_uu_tien, chiu_trach_nhiem_loai, nguoi_tao_loai, tao_luc, cap_nhat_luc)
       VALUES ('tk-ws2', ?, 'pj-ws2', 1, 'Việc kia', 'todo', 'none', 4, 'owner', 'owner', 1, 1)`,
    )
      .bind(WS2)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu_ticket (workspace_id, can_chu_id, ticket_id, tao_luc)
         VALUES (?, 'ct-tk', 'tk-ws2', 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('`phien.can_chu_id` phải trỏ tới một mục **có thật** (chỗ cắm 0006 → trigger 0013)', async () => {
    const tk = await dungTicket(PJ, 1);
    await env.DB.prepare(
      `INSERT INTO luot_giao (id, workspace_id, ticket_id, so_luot, loai, nguoi_giao_loai,
                              nguoi_nhan_agent_id, trang_thai, tao_luc, cap_nhat_luc)
       VALUES ('lg-1', ?, ?, 1, 'work', 'owner', 'ag-work', 'in_progress', 1, 1)`,
    )
      .bind(WS, tk)
      .run();

    // Trả nợ chỗ cắm: trước 0013 cột này nhận một chuỗi bất kỳ.
    await expect(
      env.DB.prepare(
        `INSERT INTO phien (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
                            tin_hieu_cuoi_luc, can_chu_id, mo_luc, cap_nhat_luc)
         VALUES ('ph-x', ?, 'lg-1', ?, 'ag-work', 'waiting_owner', 1, 'khong-co-that', 1, 1)`,
      )
        .bind(WS, tk)
        .run(),
    ).rejects.toThrow(/muc Can Chu co that/);

    // Mục có thật, cùng workspace → được.
    await dungCanChu('ct-that');
    await env.DB.prepare(
      `INSERT INTO phien (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
                          tin_hieu_cuoi_luc, can_chu_id, mo_luc, cap_nhat_luc)
       VALUES ('ph-ok', ?, 'lg-1', ?, 'ag-work', 'waiting_owner', 1, 'ct-that', 1, 1)`,
    )
      .bind(WS, tk)
      .run();
    const d = await env.DB.prepare("SELECT can_chu_id FROM phien WHERE id = 'ph-ok'").first<{
      can_chu_id: string;
    }>();
    expect(d?.can_chu_id).toBe('ct-that');
  });
});

/* ================================================================== *
 * K. Index của ba khối — mục 8 d.249
 * ================================================================== */

describe('mục 8 d.249 — 3 khối theo mức, trong khối sắp theo HẠN rồi LÚC TẠO', () => {
  it('đường đọc một khối đi `ix_can_chu_khoi`, không quét bảng, không TEMP B-TREE', async () => {
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM can_chu
        WHERE workspace_id = ? AND trang_thai = 'open' AND muc = ?
        ORDER BY han_luc, tao_luc, id
        LIMIT 50`,
    )
      .bind(WS, 'urgent')
      .all<{ detail: string }>();
    const ke_hoach = results.map((r) => r.detail).join(' | ');

    /*
     * **In chuỗi thật ra rồi đọc** — không đoán. Bài học của lượt T-69: kế hoạch
     * in theo **alias**, nên một khẳng định âm kiểu `not.toContain('SCAN can_chu')`
     * có thể đúng vì chuỗi đó **không bao giờ** xuất hiện, chứ không vì câu truy
     * vấn tốt. Nên ca này khẳng định **dương** trước (tên index phải có mặt), rồi
     * mới khẳng định âm trên đúng chữ mà SQLite thật sự in ra ("SCAN").
     * Thông điệp của mỗi `expect` mang theo chuỗi kế hoạch, nên khi đỏ thì đọc
     * được ngay nó đã chọn đường nào.
     */
    expect(ke_hoach, `kế hoạch: ${ke_hoach}`).toContain('ix_can_chu_khoi');
    expect(ke_hoach, `kế hoạch: ${ke_hoach}`).toContain('SEARCH');
    expect(ke_hoach, `kế hoạch: ${ke_hoach}`).not.toContain('SCAN');
    // Hướng `ORDER BY` khớp hướng index ⇒ không phải sắp lại trong bộ nhớ.
    expect(ke_hoach, `kế hoạch: ${ke_hoach}`).not.toContain('TEMP B-TREE');
  });

  it('đường đọc cờ "có thể trùng" đi `ix_can_chu_trung` (index **biểu thức**, riêng phần `open`)', async () => {
    // Đúng câu của `mucChoGanDay`: phép so không phân biệt hoa/thường nằm **trong**
    // SQL, nên index phải là index biểu thức `lower(tieu_de)` — nếu nó là
    // `tieu_de` thô thì ca này đỏ ngay ở khẳng định `SEARCH`.
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id, ma_so, tieu_de, project_id, tao_luc FROM can_chu
        WHERE workspace_id = ? AND trang_thai = 'open'
          AND lower(tieu_de) = lower(?) AND tao_luc >= ?`,
    )
      .bind(WS, 'Chọn DB', 0)
      .all<{ detail: string }>();
    const ke_hoach = results.map((r) => r.detail).join(' | ');

    expect(ke_hoach, `kế hoạch: ${ke_hoach}`).toContain('ix_can_chu_trung');
    expect(ke_hoach, `kế hoạch: ${ke_hoach}`).toContain('SEARCH');
    expect(ke_hoach, `kế hoạch: ${ke_hoach}`).not.toContain('SCAN');
  });

  it('thứ tự thật trong một khối: hạn trước, rồi lúc tạo', async () => {
    const t = Date.now();
    // `loai` **khác** `fyi`: một mục `fyi` không bao giờ mang 🔴 (19.8), nên dựng
    // khối 🔴 bằng `fyi` thì khối rỗng và ca này không đo được gì.
    const chung = { muc: 'urgent', loai: 'run_command' } as const;
    await dungCanChu('ct-a', { ...chung, han_luc: t + 3000, tao_luc: t });
    await dungCanChu('ct-b', { ...chung, han_luc: t + 1000, tao_luc: t + 500 });
    await dungCanChu('ct-c', { ...chung, han_luc: t + 3000, tao_luc: t - 500 });

    const { results } = await env.DB.prepare(
      `SELECT id FROM can_chu
        WHERE workspace_id = ? AND trang_thai = 'open' AND muc = 'urgent'
        ORDER BY han_luc, tao_luc, id`,
    )
      .bind(WS)
      .all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['ct-b', 'ct-c', 'ct-a']);
  });
});

/* ================================================================== *
 * L. Luật của DB trên bảng con
 * ================================================================== */

describe('migration 0013 — luật của DB trên phương án và file', () => {
  it('nhãn ngoài A–E bị chặn (trần là 5 phương án)', async () => {
    await dungCanChu('ct-1', { loai: 'decision' });
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu_phuong_an
           (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
         VALUES ('pa-f', ?, 'ct-1', 'F', 'phương án thứ sáu', 0, 5, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();
  });

  it('một phương án quá 3 dòng bị chặn tại DB (mục 8 d.236)', async () => {
    await dungCanChu('ct-1', { loai: 'decision' });
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu_phuong_an
           (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
         VALUES ('pa-dai', ?, 'ct-1', 'A', ?, 0, 1, 1)`,
      )
        .bind(WS, 'một\nhai\nba\nbốn')
        .run(),
    ).rejects.toThrow();
  });

  it('**hai** phương án đề xuất trong một mục bị chặn (`ux_can_chu_phuong_an_de_xuat`)', async () => {
    await dungCanChu('ct-1', { loai: 'decision' });
    await env.DB.prepare(
      `INSERT INTO can_chu_phuong_an
         (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
       VALUES ('pa-a', ?, 'ct-1', 'A', 'A', 1, 1, 1)`,
    )
      .bind(WS)
      .run();
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu_phuong_an
           (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
         VALUES ('pa-b', ?, 'ct-1', 'B', 'B', 1, 2, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();
  });

  it('hai phương án cùng nhãn trong một mục bị chặn (`ux_can_chu_phuong_an_nhan`)', async () => {
    await dungCanChu('ct-1', { loai: 'decision' });
    await env.DB.prepare(
      `INSERT INTO can_chu_phuong_an
         (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
       VALUES ('pa-a', ?, 'ct-1', 'A', 'A', 0, 1, 1)`,
    )
      .bind(WS)
      .run();
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu_phuong_an
           (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
         VALUES ('pa-a2', ?, 'ct-1', 'A', 'A lần hai', 0, 2, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();
  });

  it('`lenh` chỉ thuộc `run_command`; `run_command` thiếu lệnh cũng vỡ', async () => {
    // `fyi` mang lệnh → vỡ CHECK liên-cột.
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, muc, loai, trang_thai,
                              lenh, can_tty, tao_luc, cap_nhat_luc)
         VALUES ('ct-x', ?, 90, 'fyi mang lệnh', 'today', 'fyi', 'open', 'rm -rf', 0, 1, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();

    // `run_command` **thiếu** lệnh → cũng vỡ (lớp thứ hai của COMMAND_REQUIRED).
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, muc, loai, trang_thai,
                              can_tty, tao_luc, cap_nhat_luc)
         VALUES ('ct-y', ?, 91, 'lệnh mà không lệnh', 'today', 'run_command', 'open', 0, 1, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();
  });

  it('một **phương án** chỉ thuộc mục loại `decision` (trigger `tg_can_chu_phuong_an_loai_*`)', async () => {
    // Hôm nay handler phân nhánh theo union nên không chèn được như thế này; ca
    // này canh **luật của DB**, đúng tiêu chuẩn mà 0013 tự đặt cho cặp CHECK
    // liên-cột ("một đường ghi mới ở lượt sau không lách được").
    await dungCanChu('ct-rev', { loai: 'review' });
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu_phuong_an
           (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
         VALUES ('pa-sai', ?, 'ct-rev', 'A', 'phương án trong mục review', 1, 1, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow(/loai decision/);

    // Đối chứng: cùng câu INSERT, mục cha `decision` → được.
    await dungCanChu('ct-qd', { loai: 'decision' });
    await env.DB.prepare(
      `INSERT INTO can_chu_phuong_an
         (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
       VALUES ('pa-ok', ?, 'ct-qd', 'A', 'phương án đúng chỗ', 1, 1, 1)`,
    )
      .bind(WS)
      .run();

    // Và **UPDATE** cũng không dời được nó sang mục loại khác.
    await expect(
      env.DB.prepare("UPDATE can_chu_phuong_an SET can_chu_id = 'ct-rev' WHERE id = 'pa-ok'").run(),
    ).rejects.toThrow(/loai decision/);
  });

  it('một **file/link** chỉ thuộc mục loại `review` (trigger `tg_can_chu_file_loai_*`)', async () => {
    await dungCanChu('ct-fyi', { loai: 'fyi' });
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu_file (id, workspace_id, can_chu_id, loai, dia_chi, thu_tu, tao_luc)
         VALUES ('f-sai', ?, 'ct-fyi', 'link', 'https://vi.du/x', 1, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow(/loai review/);

    // Đối chứng: mục cha `review` → được.
    await dungCanChu('ct-rev', { loai: 'review' });
    await env.DB.prepare(
      `INSERT INTO can_chu_file (id, workspace_id, can_chu_id, loai, dia_chi, thu_tu, tao_luc)
       VALUES ('f-ok', ?, 'ct-rev', 'link', 'https://vi.du/x', 1, 1)`,
    )
      .bind(WS)
      .run();

    await expect(
      env.DB.prepare("UPDATE can_chu_file SET can_chu_id = 'ct-fyi' WHERE id = 'f-ok'").run(),
    ).rejects.toThrow(/loai review/);
  });

  it('`decision` **phải** có lý do đề xuất (CHECK liên-cột)', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu (id, workspace_id, ma_so, tieu_de, muc, loai, trang_thai,
                              can_tty, tao_luc, cap_nhat_luc)
         VALUES ('ct-z', ?, 92, 'quyết mà không lý do', 'today', 'decision', 'open', 0, 1, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow();
  });
});
