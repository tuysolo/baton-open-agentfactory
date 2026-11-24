/**
 * **Báo cáo sáng 07:30 và handoff tối 20:00** — SPEC mục 11 d.322–336, mục 12
 * d.346, mục 14 d.392, 19.12 câu 60.
 *
 * Mọi ca ở đây đi **đường thật** (cron → Worker → cửa ghi → D1 → cron gửi → kênh
 * giả lập) và **không gọi mạng lần nào**: kênh Telegram là nguồn **giả lập** tiêm
 * qua `datNguonTelegram` (danh sách cấm `CLAUDE.md` mục 3). Luật thuần (sáu vế,
 * bốn vế, "đạt hay chưa", phép đổi múi giờ của hai biểu thức cron) ở
 * `luat-bao-cao.test.ts`.
 */

import { afterEach, describe, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import {
  CAU_CHUA_CO_DE_XUAT,
  MUI_GIO_CHU_PHUT,
  NHAN_BAO_CAO,
  SO_TRONG_TAM,
  ngayDiaPhuong,
  trongGioYenLang,
  type DuLieuBaoCaoSang,
  type DuLieuBaoCaoToi,
} from '@baton/shared';
import {
  CHU,
  TOKEN_CHU,
  WS,
  boNguonTelegram,
  datNguonTelegram,
  dungAgentCoToken,
  dungCanChu,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  goiApi,
  tinTheoThuTu,
} from './giup.js';
import { chayCron } from '../src/index.js';
import { TRE_TOI_DA_PHUT, daCoBaoCao } from '../src/cron-bao-cao.js';
import { viecCuaCron } from '../src/cron-bang-chung.js';
import type { Env } from '../src/moi-truong.js';
import { VAI_GHI_TRONG_TAM } from '../src/lenh-bao-cao.js';
import {
  duLieuBaoCaoSang,
  duLieuBaoCaoToi,
  khoangNgay,
  ngayHomQua,
  viecXongTrongNgay,
} from '../src/doc-bao-cao.js';
import './ap-migration.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
// `afterEach` của file chờ sổ ĐẦU TIÊN, rồi mới gỡ kênh giả và trả đồng hồ thật.
const bay = soRequestBay();
const { it, beforeEach } = caQuaSo(bay);

const T_COORD = 'bt_test_coordinator_bc';
const T_MGR = 'bt_test_manager_bc';
const T_WK = 'bt_test_worker_bc';
const T_RV = 'bt_test_reviewer_bc';
const T_TAT = 'bt_test_disabled_bc';

let PJ = '';

/** Mốc epoch của một giờ **trên tường** của chủ (UTC+7), ngày 2026-10-06. */
function gioVN(gio: number, phut = 0, ngay = 6): number {
  return Date.UTC(2026, 9, ngay, gio, phut) - MUI_GIO_CHU_PHUT * 60_000;
}

/**
 * **07:30 giờ chủ ngày 06/10 = 00:30 UTC** — đúng mốc của báo cáo sáng (d.322).
 *
 * Từ 10/10 đây cũng là **`scheduledTime`** mà ca test trao cho `chayCron`: Worker có
 * một cron `* * * * *` và chọn việc theo mốc thời gian (`viecCuaCron`), nên "nhịp
 * báo cáo sáng" là một **mốc**, không một chuỗi cron.
 */
const SANG = gioVN(7, 30);
/** 20:00 giờ chủ ngày 06/10 = 13:00 UTC — mốc của handoff tối (d.330). */
const TOI = gioVN(20, 0);

/** Một mốc **trễ** `tre` phút so với một mốc nhịp — xem `TRE_TOI_DA_PHUT`. */
function tre(moc: number, phut: number): number {
  return moc + phut * 60_000;
}

/**
 * Một nhịp **thường**: trong giờ làm của chủ, ngoài cả hai cửa sổ báo cáo, phút
 * không chia hết 5. Dùng cho chặng "đưa tin ra kênh" và cho ca đối chứng.
 */
const NHIP_THUONG = gioVN(9, 1);

/**
 * **Ghim đồng hồ hệ thống (chỉ `Date`) về ngay sau `NHIP_THUONG`** — 09:02 giờ chủ,
 * ngoài giờ yên lặng 23:00–07:00 (d.347).
 *
 * Vì sao cần: `chayCron` lấy `bay_gio = Date.now()` (không `scheduledTime`), và chặng
 * gửi tin hoãn tin thường trong giờ yên lặng. Không ghim thì ba ca "tin RA kênh" đỏ
 * mỗi khi bộ test chạy từ 23:00 tới 07:00 giờ Việt Nam — đỏ vì **giờ chạy**, không vì
 * mã (review BAT-8). Chỉ giả `Date`: hẹn giờ thật vẫn chạy, nên các lượt gọi tới
 * Durable Object không bị treo. `afterEach` trả đồng hồ thật.
 */
function ghimDongHoNgoaiGioYenLang(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NHIP_THUONG + 60_000);
  expect(trongGioYenLang(Date.now(), MUI_GIO_CHU_PHUT)).toBe(false);
}

/**
 * Một `env` **đếm số lần chặng đọc nặng chạy** — xem ca "nhịp thứ hai trong cửa sổ
 * KHÔNG chạy chặng đọc nặng".
 *
 * Đếm các câu chạm bảng `trong_tam`: câu ấy chỉ do `trongTamCuaNgay` của
 * `duLieuBaoCao` phát ra (cả hai loại báo cáo đều gọi), nên nó là một dấu hiệu
 * **chỉ** của chặng đọc nặng. `moiWorkspace` chạm `workspace`, `daCoBaoCao` chạm
 * `bao_cao` — không câu nào trong hai câu rẻ ấy bị đếm lẫn.
 */
function demDocNang(): { env_dem: Env; soLanDocNang: () => number } {
  let so = 0;
  const db = new Proxy(env.DB, {
    get(goc, ten) {
      if (ten === 'prepare') {
        return (sql: string): D1PreparedStatement => {
          if (sql.includes('trong_tam')) so += 1;
          return goc.prepare(sql);
        };
      }
      // Mọi thứ khác đi thẳng về `goc`. Hàm phải `bind` lại: một phương thức gốc
      // gọi với `this` là Proxy sẽ ném ("illegal invocation").
      const o: unknown = Reflect.get(goc, ten);
      return typeof o === 'function' ? (o as (...a: never[]) => unknown).bind(goc) : o;
    },
  });
  return { env_dem: { ...env, DB: db }, soLanDocNang: () => so };
}

const NGAY = '2026-10-06';
const HOM_QUA = '2026-10-05';

beforeEach(async () => {
  for (const b of [
    'bao_cao',
    'trong_tam',
    'thong_bao',
    'can_chu_ticket',
    'can_chu_file',
    'can_chu_phuong_an',
    'phien',
    'luot_giao',
    'can_chu',
    'nhat_ky_can_cu',
    'nhat_ky',
    'ticket_label',
    'ticket_link',
    'ticket_history',
    'comment',
    'evidence',
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
  await dungAgentCoToken({
    id: 'ag-coord',
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: T_COORD,
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({
    id: 'ag-mgr',
    ten: 'M-Baton',
    vai_tro: 'manager',
    token: T_MGR,
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({
    id: 'ag-wk',
    ten: 'W-builder',
    vai_tro: 'worker',
    token: T_WK,
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({
    id: 'ag-rv',
    ten: 'W-reviewer',
    vai_tro: 'reviewer',
    token: T_RV,
    vao_tat_ca_du_an: true,
  });
  await dungAgentCoToken({
    id: 'ag-tat',
    ten: 'C-tat',
    vai_tro: 'coordinator',
    token: T_TAT,
    vao_tat_ca_du_an: true,
    disabled: true,
  });
  boNguonTelegram();
});

afterEach(async () => {
  // Thân ca hết giờ có thể còn dùng kênh giả / đồng hồ giả: chờ nó xong trước (BAT-54).
  await bay.doiHet();
  boNguonTelegram();
  // Trả đồng hồ thật sau ca nào đã ghim (`ghimDongHoNgoaiGioYenLang`); vô hại với ca khác.
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ *
 * Giúp việc
 * ------------------------------------------------------------------ */

/**
 * Một ticket của dự án `SAI`. `so` quyết **mã** (`SAI-<so>`), và mã là thứ mọi vế
 * của báo cáo kể ra — nên các ca dưới đây đặt `so` tường minh thay vì dựa vào thứ
 * tự tạo.
 */
function tkMoi(
  so: number,
  tieu_de: string,
  tuy_chon: { trang_thai?: string } = {},
): Promise<string> {
  return dungTicket(PJ, so, tieu_de, tuy_chon);
}

async function baoCaoTrongDb(
  ngay: string,
  loai: string,
): Promise<{ noi_dung_md: string; du_lieu_json: string; tao_luc: number } | null> {
  return env.DB.prepare(
    `SELECT noi_dung_md, du_lieu_json, tao_luc FROM bao_cao
      WHERE workspace_id = ? AND ngay = ? AND loai = ?`,
  )
    .bind(WS, ngay, loai)
    .first();
}

async function demBaoCao(): Promise<number> {
  const d = await env.DB.prepare('SELECT count(*) AS n FROM bao_cao WHERE workspace_id = ?')
    .bind(WS)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

async function trongTamTrongDb(
  ngay: string,
): Promise<{ thu_tu: number; ticket_id: string; ghi_chu: string | null; agent_id: string | null }[]> {
  const { results } = await env.DB.prepare(
    `SELECT thu_tu, ticket_id, ghi_chu, agent_id FROM trong_tam
      WHERE workspace_id = ? AND ngay = ? ORDER BY thu_tu`,
  )
    .bind(WS, ngay)
    .all<{ thu_tu: number; ticket_id: string; ghi_chu: string | null; agent_id: string | null }>();
  return results;
}

/** Đặt `xong_luc` + trạng thái Xong cho một ticket (fixture của d.325). */
async function datXong(ticket_id: string, xong_luc: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE ticket SET trang_thai = 'done', xong_luc = ?, cap_nhat_luc = ? WHERE id = ?",
  )
    .bind(xong_luc, xong_luc, ticket_id)
    .run();
}

/* ================================================================== *
 * A. Migration 0020 — hai bảng và các ràng buộc
 * ================================================================== */

describe('migration 0020 — `bao_cao` lưu theo ngày và BẤT BIẾN (d.336, mục 15)', () => {
  it('khoá chính `(workspace_id, ngay, loai)` chặn dòng thứ hai của cùng ngày', async () => {
    const t = SANG;
    await env.DB.prepare(
      `INSERT INTO bao_cao (workspace_id, ngay, loai, noi_dung_md, du_lieu_json, tao_luc)
       VALUES (?, ?, 'sang', '# x', '{}', ?)`,
    )
      .bind(WS, NGAY, t)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO bao_cao (workspace_id, ngay, loai, noi_dung_md, du_lieu_json, tao_luc)
         VALUES (?, ?, 'sang', '# y', '{}', ?)`,
      )
        .bind(WS, NGAY, t)
        .run(),
    ).rejects.toThrow(/UNIQUE|PRIMARY/i);

    // Cùng ngày, **loại khác** thì được: một ngày có hai báo cáo (d.322 + d.330).
    await env.DB.prepare(
      `INSERT INTO bao_cao (workspace_id, ngay, loai, noi_dung_md, du_lieu_json, tao_luc)
       VALUES (?, ?, 'toi', '# z', '{}', ?)`,
    )
      .bind(WS, NGAY, t)
      .run();
    expect(await demBaoCao()).toBe(2);
  });

  it('`CHECK (loai IN (sang, toi))` chặn một loại thứ ba', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO bao_cao (workspace_id, ngay, loai, noi_dung_md, du_lieu_json, tao_luc)
         VALUES (?, ?, 'chieu', '# x', '{}', ?)`,
      )
        .bind(WS, NGAY, SANG)
        .run(),
    ).rejects.toThrow(/CHECK/i);
  });

  it('trigger `tg_bao_cao_bat_bien` chặn sửa chữ của một báo cáo đã sinh', async () => {
    await env.DB.prepare(
      `INSERT INTO bao_cao (workspace_id, ngay, loai, noi_dung_md, du_lieu_json, tao_luc)
       VALUES (?, ?, 'sang', '# thật', '{}', ?)`,
    )
      .bind(WS, NGAY, SANG)
      .run();

    await expect(
      env.DB.prepare('UPDATE bao_cao SET noi_dung_md = ? WHERE workspace_id = ? AND ngay = ?')
        .bind('# viết lại', WS, NGAY)
        .run(),
    ).rejects.toThrow(/khong sua duoc/);
    await expect(
      env.DB.prepare('UPDATE bao_cao SET tao_luc = ? WHERE workspace_id = ? AND ngay = ?')
        .bind(0, WS, NGAY)
        .run(),
    ).rejects.toThrow(/khong sua duoc/);

    expect((await baoCaoTrongDb(NGAY, 'sang'))?.noi_dung_md).toBe('# thật');
  });
});

describe('migration 0020 — `trong_tam` trỏ tới ticket (d.324, d.331)', () => {
  it('`CHECK (thu_tu BETWEEN 1 AND 3)` — d.324 nói 3 việc', async () => {
    const tk = await tkMoi(1, 'Việc một');
    await expect(
      env.DB.prepare(
        `INSERT INTO trong_tam (workspace_id, ngay, thu_tu, ticket_id, tao_luc)
         VALUES (?, ?, 4, ?, ?)`,
      )
        .bind(WS, NGAY, tk, SANG)
        .run(),
    ).rejects.toThrow(/CHECK/i);
    expect(SO_TRONG_TAM).toBe(3);
  });

  it('`UNIQUE (workspace_id, ngay, ticket_id)` — một ticket không chiếm hai ô', async () => {
    const tk = await tkMoi(1, 'Việc một');
    await env.DB.prepare(
      `INSERT INTO trong_tam (workspace_id, ngay, thu_tu, ticket_id, tao_luc)
       VALUES (?, ?, 1, ?, ?)`,
    )
      .bind(WS, NGAY, tk, SANG)
      .run();
    await expect(
      env.DB.prepare(
        `INSERT INTO trong_tam (workspace_id, ngay, thu_tu, ticket_id, tao_luc)
         VALUES (?, ?, 2, ?, ?)`,
      )
        .bind(WS, NGAY, tk, SANG)
        .run(),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it('trigger `tg_trong_tam_ws_them` chặn ticket của workspace KHÁC (mục 1, 18)', async () => {
    const t = SANG;
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind('ws-zz', 'Người khác', t, t)
      .run();
    const tk = await tkMoi(1, 'Việc một');

    await expect(
      env.DB.prepare(
        `INSERT INTO trong_tam (workspace_id, ngay, thu_tu, ticket_id, tao_luc)
         VALUES ('ws-zz', ?, 1, ?, ?)`,
      )
        .bind(NGAY, tk, t)
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });
});

/* ================================================================== *
 * B. d.324 — ai ghi được 3 trọng tâm (cau-hoi-spec #117)
 * ================================================================== */

describe('mục 11 d.324 — chủ hoặc agent `coordinator` ghi 3 việc trọng tâm', () => {
  it('`VAI_GHI_TRONG_TAM` là đúng vai mà d.324 gọi tên', () => {
    // Phía này là chữ chép tay từ `SPEC.md` d.324 ("Agent `coordinator` ghi qua
    // API"); phía kia sinh từ mã. #117: `manager` **không** có trong danh sách.
    expect([...VAI_GHI_TRONG_TAM]).toEqual(['coordinator']);
  });

  it('agent `coordinator` ghi được, và `ngay` là KẾT LUẬN CỦA SERVER', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    const t2 = await tkMoi(2, 'Việc hai');

    const r = await goiApi('/v1/trong-tam', T_COORD, {
      method: 'POST',
      than: {
        muc: [{ ticket_id: t1, ghi_chu: '  vì chặn cả phần 7  ' }, { ticket_id: t2 }],
        // Client cố khai `ngay` — whitelist `TRUONG_CLIENT.ghi_trong_tam` **không có**
        // trường này, nên nó bị bỏ và server vẫn dùng ngày trên tường của hôm nay.
        ngay: '1999-01-01',
      },
    });
    expect(r.status).toBe(201);
    const kq = await r.json<{ ngay: string; so_muc: number; agent_id: string | null }>();

    expect(kq.ngay).toBe(ngayDiaPhuong(Date.now()));
    expect(kq.ngay).not.toBe('1999-01-01');
    expect(kq.so_muc).toBe(2);
    // Mục 15 — dấu vết: dòng mang **ai ghi**.
    expect(kq.agent_id).toBe('ag-coord');

    const ds = await trongTamTrongDb(kq.ngay);
    expect(ds.map((d) => [d.thu_tu, d.ticket_id])).toEqual([
      [1, t1],
      [2, t2],
    ]);
    // Ghi **giá trị đã cắt khoảng trắng** — luật chung của mọi handler ghi.
    expect(ds[0]?.ghi_chu).toBe('vì chặn cả phần 7');
    expect(ds[1]?.ghi_chu).toBeNull();
  });

  it('chủ ghi được; `agent_id` là NULL (chủ tự ghi)', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    const r = await goiApi('/v1/trong-tam', TOKEN_CHU, {
      method: 'POST',
      than: { muc: [{ ticket_id: t1 }] },
    });
    expect(r.status).toBe(201);
    expect((await r.json<{ agent_id: string | null }>()).agent_id).toBeNull();
  });

  it('agent `manager`, `worker`, `reviewer` → FORBIDDEN (#117: hướng chặt, không mượn bảng quyền)', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    for (const token of [T_MGR, T_WK, T_RV]) {
      const r = await goiApi('/v1/trong-tam', token, {
        method: 'POST',
        than: { muc: [{ ticket_id: t1 }] },
      });
      expect(r.status).toBe(403);
      expect((await r.json<{ error: string }>()).error).toBe('FORBIDDEN');
    }
    expect(await trongTamTrongDb(ngayDiaPhuong(Date.now()))).toEqual([]);
  });

  it('agent `coordinator` đã bị TẮT → FORBIDDEN (mục 3)', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    const r = await goiApi('/v1/trong-tam', T_TAT, {
      method: 'POST',
      than: { muc: [{ ticket_id: t1 }] },
    });
    expect(r.status).toBe(403);
  });

  it('ghi lại cùng ngày THAY cả bộ 3, không thêm dòng', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    const t2 = await tkMoi(2, 'Việc hai');
    const t3 = await tkMoi(3, 'Việc ba');
    const ngay = ngayDiaPhuong(Date.now());

    await goiApi('/v1/trong-tam', T_COORD, {
      method: 'POST',
      than: { muc: [{ ticket_id: t1 }, { ticket_id: t2 }, { ticket_id: t3 }] },
    });
    expect(await trongTamTrongDb(ngay)).toHaveLength(3);

    await goiApi('/v1/trong-tam', T_COORD, {
      method: 'POST',
      than: { muc: [{ ticket_id: t3 }] },
    });
    const ds = await trongTamTrongDb(ngay);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ thu_tu: 1, ticket_id: t3 });
  });

  it('bộ RỖNG bỏ hẳn đề xuất của hôm nay ⇒ báo cáo quay về "chưa có đề xuất"', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    const ngay = ngayDiaPhuong(Date.now());
    await goiApi('/v1/trong-tam', T_COORD, {
      method: 'POST',
      than: { muc: [{ ticket_id: t1 }] },
    });
    await goiApi('/v1/trong-tam', T_COORD, { method: 'POST', than: { muc: [] } });
    expect(await trongTamTrongDb(ngay)).toEqual([]);
  });

  it('hơn 3 mục → INVALID_INPUT (d.324 nói 3)', async () => {
    const ds: { ticket_id: string }[] = [];
    for (let i = 1; i <= 4; i += 1) {
      ds.push({ ticket_id: await tkMoi(i, `Việc ${String(i)}`) });
    }
    const r = await goiApi('/v1/trong-tam', T_COORD, { method: 'POST', than: { muc: ds } });
    expect(r.status).toBe(422);
    expect((await r.json<{ error: string }>()).error).toBe('INVALID_INPUT');
  });

  it('trùng ticket trong cùng bộ → INVALID_INPUT tường minh, không âm thầm bỏ bớt', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    const r = await goiApi('/v1/trong-tam', T_COORD, {
      method: 'POST',
      than: { muc: [{ ticket_id: t1 }, { ticket_id: t1 }] },
    });
    expect(r.status).toBe(422);
  });

  it('`GET /v1/trong-tam` đọc SỐNG bộ của hôm nay: thứ tự, mã, id, ghi chú, người ghi, tao_luc', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    const t2 = await tkMoi(2, 'Việc hai');
    await goiApi('/v1/trong-tam', T_COORD, {
      method: 'POST',
      than: { muc: [{ ticket_id: t2, ghi_chu: 'gấp' }, { ticket_id: t1 }] },
    });
    const r = await goiApi('/v1/trong-tam', TOKEN_CHU);
    expect(r.status).toBe(200);
    const kq = await r.json<{
      ngay: string;
      muc: {
        thu_tu: number;
        ticket_id: string;
        ma: string;
        tieu_de: string;
        ghi_chu: string | null;
        agent_id: string | null;
        nguoi_ghi: string | null;
        tao_luc: number;
      }[];
    }>();
    expect(kq.ngay).toBe(ngayDiaPhuong(Date.now()));
    expect(kq.muc.map((m) => [m.thu_tu, m.ticket_id, m.ma, m.tieu_de, m.ghi_chu])).toEqual([
      [1, t2, 'SAI-2', 'Việc hai', 'gấp'],
      [2, t1, 'SAI-1', 'Việc một', null],
    ]);
    expect(kq.muc[0]?.agent_id).toBe('ag-coord');
    expect(kq.muc[0]?.nguoi_ghi).toBe('CoS');
    expect(kq.muc[0]?.tao_luc).toBeGreaterThan(0);
    // Coordinator cũng đọc được (cùng quyền với ghi).
    expect((await goiApi('/v1/trong-tam', T_COORD)).status).toBe(200);
  });

  it('`GET /v1/trong-tam`: ngày chưa ghi → rỗng; bộ rỗng sau khi xoá → rỗng', async () => {
    const r = await goiApi('/v1/trong-tam', TOKEN_CHU);
    expect(r.status).toBe(200);
    expect((await r.json<{ muc: unknown[] }>()).muc).toEqual([]);
    const t1 = await tkMoi(1, 'Việc một');
    await goiApi('/v1/trong-tam', TOKEN_CHU, { method: 'POST', than: { muc: [{ ticket_id: t1 }] } });
    await goiApi('/v1/trong-tam', TOKEN_CHU, { method: 'POST', than: { muc: [] } });
    expect((await (await goiApi('/v1/trong-tam', TOKEN_CHU)).json<{ muc: unknown[] }>()).muc).toEqual(
      [],
    );
  });

  it('`GET /v1/trong-tam`: agent worker/manager/reviewer/đã tắt → 403', async () => {
    for (const token of [T_WK, T_MGR, T_RV, T_TAT]) {
      const r = await goiApi('/v1/trong-tam', token);
      expect(r.status).toBe(403);
      expect((await r.json<{ error: string }>()).error).toBe('FORBIDDEN');
    }
  });

  it('`GET /v1/trong-tam` KHÔNG lộ ngày khác và bỏ qua tham số ngày', async () => {
    const t1 = await tkMoi(1, 'Việc một');
    const t2 = await tkMoi(2, 'Việc hai');
    const hom_nay = ngayDiaPhuong(Date.now());
    const hom_qua = ngayDiaPhuong(Date.now() - 24 * 60 * 60 * 1000);
    // Bộ của HÔM QUA chèn thẳng (API không cho ghi ngày khác).
    await env.DB.prepare(
      `INSERT INTO trong_tam (workspace_id, ngay, thu_tu, ticket_id, ghi_chu, agent_id, tao_luc)
       VALUES (?, ?, 1, ?, 'của hôm qua', NULL, ?)`,
    )
      .bind(WS, hom_qua, t2, Date.now() - 1000)
      .run();
    await goiApi('/v1/trong-tam', TOKEN_CHU, { method: 'POST', than: { muc: [{ ticket_id: t1 }] } });

    const r = await goiApi(`/v1/trong-tam?ngay=${hom_qua}`, TOKEN_CHU);
    const kq = await r.json<{ ngay: string; muc: { ticket_id: string; ghi_chu: string | null }[] }>();
    expect(kq.ngay).toBe(hom_nay);
    expect(kq.muc.map((m) => m.ticket_id)).toEqual([t1]);
    expect(JSON.stringify(kq)).not.toContain('của hôm qua');
  });

  it('ticket không có thật → NOT_FOUND, không ghi gì', async () => {
    const r = await goiApi('/v1/trong-tam', T_COORD, {
      method: 'POST',
      than: { muc: [{ ticket_id: 'tk-khong-co' }] },
    });
    expect(r.status).toBe(404);
    expect(await trongTamTrongDb(ngayDiaPhuong(Date.now()))).toEqual([]);
  });
});

/* ================================================================== *
 * C. d.325 — "Hôm qua" là MỘT NGÀY DƯƠNG LỊCH, không 24 giờ trượt
 * ================================================================== */

describe('mục 11 d.325 — "Hôm qua đã xong" đi theo ngày trên tường (#118)', () => {
  it('`khoangNgay` là khoảng NỬA MỞ, dài đúng 24 giờ', () => {
    const k = khoangNgay(NGAY);
    expect(k).not.toBeNull();
    expect(k?.tu).toBe(gioVN(0, 0));
    expect((k?.den ?? 0) - (k?.tu ?? 0)).toBe(24 * 60 * 60 * 1000);
    expect(khoangNgay('không-phải-ngày')).toBeNull();
  });

  it('`ngayHomQua` lùi đúng một ngày trên tường', () => {
    expect(ngayHomQua(NGAY)).toBe(HOM_QUA);
    // Qua mốc đầu tháng — chỗ một phép trừ tay dễ sai.
    expect(ngayHomQua('2026-11-01')).toBe('2026-10-31');
  });

  it('việc xong 07:00 HÔM QUA được đếm; việc xong 00:30 HÔM NAY thì KHÔNG', async () => {
    /*
     * Đây là cả nội dung của #118. Một cửa sổ **trượt 24 giờ** tính từ 07:30 hôm
     * nay sẽ làm **ngược lại**: bỏ việc xong 07:00 hôm qua (đã quá 24 giờ) và đếm
     * thêm việc xong 00:30 hôm nay. Nên hai ticket dưới đây là hai ca biên của
     * đúng cái lỗi đó.
     */
    const som_hom_qua = await tkMoi(1, 'Xong 07:00 hôm qua');
    const dem_hom_nay = await tkMoi(2, 'Xong 00:30 hôm nay');
    await datXong(som_hom_qua, gioVN(7, 0, 5));
    await datXong(dem_hom_nay, gioVN(0, 30, 6));

    const ds = await viecXongTrongNgay(env.DB, WS, HOM_QUA);
    expect(ds.map((v) => v.tieu_de)).toEqual(['Xong 07:00 hôm qua']);
  });

  it('hai biên chính xác: 00:00:00.000 thuộc ngày, 00:00:00.000 hôm sau thì không', async () => {
    const dau = await tkMoi(1, 'Đúng nửa đêm đầu ngày');
    const cuoi = await tkMoi(2, 'Đúng nửa đêm hôm sau');
    await datXong(dau, gioVN(0, 0, 5));
    await datXong(cuoi, gioVN(0, 0, 6));

    expect((await viecXongTrongNgay(env.DB, WS, HOM_QUA)).map((v) => v.tieu_de)).toEqual([
      'Đúng nửa đêm đầu ngày',
    ]);
  });
});

/* ================================================================== *
 * D. Sáu vế / bốn vế dựng từ DB thật
 * ================================================================== */

describe('mục 11 d.322–334 — dữ liệu của hai báo cáo dựng từ DB thật', () => {
  it('báo cáo sáng gom đủ sáu vế', async () => {
    const tk_xong = await tkMoi(1, 'Việc hôm qua');
    await datXong(tk_xong, gioVN(15, 0, 5));
    await tkMoi(2, 'Việc đang chạy', { trang_thai: 'in_progress' });
    const tk_tt = await tkMoi(3, 'Trọng tâm');
    await env.DB.prepare(
      `INSERT INTO trong_tam (workspace_id, ngay, thu_tu, ticket_id, tao_luc)
       VALUES (?, ?, 1, ?, ?)`,
    )
      .bind(WS, NGAY, tk_tt, SANG)
      .run();
    await dungCanChu('ct-1', { muc: 'urgent', loai: 'fyi' });
    await env.DB.prepare(
      `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, quyet_dinh, vi_sao)
       VALUES ('nk-1', ?, ?, 'chu', 'Dùng D1', 'Đã có sẵn')`,
    )
      .bind(WS, gioVN(16, 0, 5))
      .run();

    const d: DuLieuBaoCaoSang = await duLieuBaoCaoSang(env.DB, CHU, WS, SANG);

    expect(d.ngay).toBe(NGAY);
    expect(d.hom_qua.ngay).toBe(HOM_QUA);
    expect(d.can_chu.so_cho).toBeGreaterThanOrEqual(1); // vế 1 — d.323
    expect(d.trong_tam.map((m) => m.ma)).toEqual(['SAI-3']); // vế 2 — d.324
    expect(d.hom_qua.viec.map((v) => v.tieu_de)).toEqual(['Việc hôm qua']); // vế 3 — d.325
    expect(d.dang_chay.map((v) => v.tieu_de)).toEqual(['Việc đang chạy']); // vế 4 — d.326
    expect(Array.isArray(d.rui_ro_va_lech)).toBe(true); // vế 5 — d.327
    expect(d.quyet_dinh_moi).toEqual([
      { nguoi: 'Chủ', quyet_dinh: 'Dùng D1', vi_sao: 'Đã có sẵn' },
    ]); // vế 6 — d.328
  });

  it('handoff tối gom đủ bốn vế, và trọng tâm là của CHÍNH NGÀY ĐÓ', async () => {
    const tk_dat = await tkMoi(1, 'Trọng tâm xong');
    const tk_chua = await tkMoi(2, 'Trọng tâm chưa xong', { trang_thai: 'verifying' });
    await datXong(tk_dat, gioVN(18, 0));
    for (const [i, tk] of [tk_dat, tk_chua].entries()) {
      await env.DB.prepare(
        `INSERT INTO trong_tam (workspace_id, ngay, thu_tu, ticket_id, tao_luc)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(WS, NGAY, i + 1, tk, TOI)
        .run();
    }
    await dungCanChu('ct-moi', { muc: 'today', loai: 'fyi', tao_luc: gioVN(10, 0) });
    await dungCanChu('ct-cu', { muc: 'today', loai: 'fyi', tao_luc: gioVN(10, 0, 3) });

    const d: DuLieuBaoCaoToi = await duLieuBaoCaoToi(env.DB, CHU, WS, TOI);

    // vế 1 — d.331: "đạt hay chưa" theo trạng thái ticket.
    expect(d.trong_tam.map((m) => [m.ma, m.dat])).toEqual([
      ['SAI-1', true],
      ['SAI-2', false],
    ]);
    // vế 2 — d.332.
    expect(d.du_an.map((x) => x.ma)).toEqual(['SAI']);
    // vế 3 — d.333: ticket còn ở nhóm "chạy" (#119).
    expect(d.chuyen_sang_mai.map((v) => v.tieu_de)).toEqual(['Trọng tâm chưa xong']);
    // vế 4 — d.334: **mới phát sinh trong ngày**, không mọi mục đang chờ.
    expect(d.can_chu_moi).toHaveLength(1);
  });

  it('đường đọc báo cáo CHỈ CHỦ — agent nhận FORBIDDEN', async () => {
    const ai_agent = {
      loai: 'agent' as const,
      agent_id: 'ag-coord',
      vai_tro: 'coordinator' as const,
      disabled: false,
      vao_tat_ca_du_an: true,
      du_an_duoc_vao: [],
      du_an_minh_quan_ly: [],
      ghi_de: {},
    };
    await expect(duLieuBaoCaoSang(env.DB, ai_agent, WS, SANG)).rejects.toThrow(/Chỉ chủ/);
    await expect(duLieuBaoCaoToi(env.DB, ai_agent, WS, TOI)).rejects.toThrow(/Chỉ chủ/);
  });
});

/* ================================================================== *
 * E. Cron 07:30 / 20:00 — đường thật, hết chặng
 * ================================================================== */

describe('mục 11 d.322, d.330 + mục 12 d.346 — cron sinh báo cáo rồi tin ra kênh', () => {
  it('nhịp 00:30 UTC sinh BÁO CÁO SÁNG, ghi một tin vào kho, chưa gửi', async () => {
    const kq = await chayCron({ scheduledTime: SANG }, env);

    expect(kq.bao_cao.loai).toBe('sang');
    expect(kq.bao_cao.so_sinh).toBe(1);
    expect(kq.bao_cao.so_loi).toBe(0);
    // Nhịp này **không** kéo theo việc nào của phần 3 hay của cron gửi.
    expect(kq.thong_bao.gui.so_gui).toBe(0);

    const ngay = ngayDiaPhuong(Date.now());
    const bc = await baoCaoTrongDb(ngay, 'sang');
    expect(bc?.noi_dung_md).toContain(NHAN_BAO_CAO.sang);
    // d.336 — lưu **cả** markdown và ảnh dữ liệu JSON.
    expect(JSON.parse(bc?.du_lieu_json ?? '{}')).toMatchObject({ ngay });

    const tin = await tinTheoThuTu();
    expect(tin).toHaveLength(1);
    expect(tin[0]?.loai).toBe('bao_cao_sang');
    expect(tin[0]?.uu_tien).toBe('thuong');
    expect(tin[0]?.gui_telegram_luc).toBeNull();
  });

  it('nhịp 13:00 UTC sinh HANDOFF TỐI với `loai = bao_cao_toi`', async () => {
    const kq = await chayCron({ scheduledTime: TOI }, env);
    expect(kq.bao_cao.loai).toBe('toi');
    expect(kq.bao_cao.so_sinh).toBe(1);
    expect((await tinTheoThuTu())[0]?.loai).toBe('bao_cao_toi');
    expect(await baoCaoTrongDb(ngayDiaPhuong(Date.now()), 'toi')).not.toBeNull();
  });

  it('d.346 + d.347 — tin báo cáo RA kênh giả lập, kèm link `/bao-cao`', async () => {
    ghimDongHoNgoaiGioYenLang();
    const kenh = datNguonTelegram();

    await chayCron({ scheduledTime: SANG }, env);
    // Chặng hai: nhịp **mỗi phút** là đường duy nhất ra ngoài (`KENH_CHO_GUI`).
    const kq = await chayCron({ scheduledTime: NHIP_THUONG }, env);

    expect(kq.thong_bao.gui.so_gui).toBe(1);
    expect(kenh.da_gui).toHaveLength(1);
    expect(kenh.da_gui[0]?.noi_dung).toContain(NHAN_BAO_CAO.sang);
    // d.392 + #101: mục sidebar "Báo cáo" ở `/bao-cao`.
    expect(kenh.da_gui[0]?.link).toBe('https://baton.test/bao-cao');
  });

  it('nhịp báo cáo KHÔNG gọi mạng lần nào (danh sách cấm CLAUDE.md mục 3)', async () => {
    const kenh = datNguonTelegram();
    await chayCron({ scheduledTime: SANG }, env);
    // Tin chỉ **vào kho**; đưa nó ra ngoài là việc của nhịp mỗi phút.
    expect(kenh.soLanGoi()).toBe(0);
  });

  it('nhịp NGOÀI hai cửa sổ KHÔNG sinh báo cáo nào', async () => {
    // 09:00 giờ chủ = 02:00 UTC: quá cửa sổ 60 phút của mốc 00:30, chưa tới 13:00.
    const kq = await chayCron({ scheduledTime: gioVN(9, 0) }, env);
    expect(kq.bao_cao.loai).toBeNull();
    expect(kq.bao_cao.so_sinh).toBe(0);
    expect(await demBaoCao()).toBe(0);
  });

  it('báo cáo mang 3 trọng tâm nếu `coordinator` đã ghi; "chưa có đề xuất" nếu chưa', async () => {
    // Chưa ghi ⇒ chữ của d.324.
    await chayCron({ scheduledTime: SANG }, env);
    const ngay = ngayDiaPhuong(Date.now());
    expect((await baoCaoTrongDb(ngay, 'sang'))?.noi_dung_md).toContain(CAU_CHUA_CO_DE_XUAT);

    // Đã ghi ⇒ handoff tối của cùng ngày kể chúng.
    const tk = await tkMoi(1, 'Việc trọng tâm');
    await goiApi('/v1/trong-tam', T_COORD, { method: 'POST', than: { muc: [{ ticket_id: tk }] } });
    await chayCron({ scheduledTime: TOI }, env);
    const md = (await baoCaoTrongDb(ngay, 'toi'))?.noi_dung_md ?? '';
    expect(md).toContain('SAI-1');
    expect(md).not.toContain(CAU_CHUA_CO_DE_XUAT);
  });
});

/* ================================================================== *
 * F. NGUYÊN Ý — một nhịp cron chạy hai lần cho ĐÚNG MỘT báo cáo
 * ================================================================== */

describe('mục 11 d.336 + mục 12 d.346 — sinh báo cáo là nguyên ý (idempotent)', () => {
  it('chạy nhịp báo cáo HAI LẦN ⇒ đúng MỘT dòng `bao_cao` và đúng MỘT tin', async () => {
    /*
     * Một Cron Trigger có thể chạy hơn một lần cho cùng một nhịp (Cloudflare không
     * bảo đảm đúng-một-lần). Cửa sổ đua được đóng bằng **khoá chính của `bao_cao`**
     * (`INSERT … ON CONFLICT DO NOTHING` + `meta.changes`), cộng hàng đợi đơn luồng
     * của `WorkspaceGate` — xem `WorkspaceGate.sinhBaoCao`.
     */
    const mot = await chayCron({ scheduledTime: SANG }, env);
    const hai = await chayCron({ scheduledTime: SANG }, env);

    expect(mot.bao_cao.so_sinh).toBe(1);
    expect(hai.bao_cao.so_sinh).toBe(0);
    // Lượt thứ hai **không** là một lỗi: nó chỉ thấy báo cáo đã có.
    expect(hai.bao_cao.so_da_co).toBe(1);
    expect(hai.bao_cao.so_loi).toBe(0);

    expect(await demBaoCao()).toBe(1);
    expect(await tinTheoThuTu()).toHaveLength(1);
  });

  it('hai lượt chạy CHỒNG NHAU cũng cho đúng một báo cáo và một tin', async () => {
    const [mot, hai] = await Promise.all([
      chayCron({ scheduledTime: SANG }, env),
      chayCron({ scheduledTime: SANG }, env),
    ]);
    expect(mot.bao_cao.so_sinh + hai.bao_cao.so_sinh).toBe(1);
    expect(await demBaoCao()).toBe(1);
    expect(await tinTheoThuTu()).toHaveLength(1);
  });

  it('chủ chỉ nhận MỘT tin Telegram dù nhịp chạy hai lần', async () => {
    ghimDongHoNgoaiGioYenLang();
    const kenh = datNguonTelegram();
    await chayCron({ scheduledTime: SANG }, env);
    await chayCron({ scheduledTime: SANG }, env);
    await chayCron({ scheduledTime: NHIP_THUONG }, env);
    expect(kenh.da_gui).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- *
   * Nhịp TRỄ — Cloudflare bỏ nhịp 00:30, chỉ nhả 00:31
   * ---------------------------------------------------------------- */

  it('nhịp 00:30 BỊ BỎ, chỉ có 00:31 ⇒ báo cáo sáng VẪN ra, đúng một lần', async () => {
    /*
     * Cloudflare không hứa nhả nhịp đúng giờ. Nếu nhánh báo cáo so phút **cứng** thì
     * hôm đó chủ không có báo cáo nào — và nhịp này mỗi ngày một lần, nên "lượt sau
     * thử lại" là *mai*. Cửa sổ `TRE_TOI_DA_PHUT` là chỗ chữa, và ca này là chỗ canh.
     */
    const kq = await chayCron({ scheduledTime: tre(SANG, 1) }, env);

    expect(kq.bao_cao.loai).toBe('sang');
    expect(kq.bao_cao.so_sinh).toBe(1);
    expect(kq.bao_cao.so_loi).toBe(0);
    expect(await demBaoCao()).toBe(1);
    expect((await tinTheoThuTu())[0]?.loai).toBe('bao_cao_sang');
  });

  it('nhịp trễ TỚI ĐÚNG BIÊN cửa sổ vẫn ra báo cáo; trễ hơn một phút thì KHÔNG', async () => {
    // Biên trên **tính**: đó là nhịp trễ nhất còn được chấp nhận.
    const bien = await chayCron({ scheduledTime: tre(SANG, TRE_TOI_DA_PHUT) }, env);
    expect(bien.bao_cao.so_sinh).toBe(1);
    expect(await demBaoCao()).toBe(1);
  });

  it('quá cửa sổ ⇒ MẤT NHỊP hôm đó, và đó là hành vi đã khai, không một lỗi', async () => {
    const qua = await chayCron({ scheduledTime: tre(SANG, TRE_TOI_DA_PHUT + 1) }, env);
    expect(qua.bao_cao.loai).toBeNull();
    expect(qua.bao_cao.so_sinh).toBe(0);
    expect(qua.bao_cao.so_loi).toBe(0);
    expect(await demBaoCao()).toBe(0);
  });

  it('cửa sổ sáng KHÔNG chạm cửa sổ tối, và ngược lại', async () => {
    // Mọi nhịp trong cửa sổ sáng chỉ ra loại `sang`; mọi nhịp cửa sổ tối chỉ ra `toi`.
    for (const phut of [0, 1, 30, TRE_TOI_DA_PHUT]) {
      expect(viecCuaCron(tre(SANG, phut)), `sáng +${String(phut)}`).toMatchObject({
        bao_cao_sang: true,
        bao_cao_toi: false,
      });
      expect(viecCuaCron(tre(TOI, phut)), `tối +${String(phut)}`).toMatchObject({
        bao_cao_sang: false,
        bao_cao_toi: true,
      });
    }
  });

  /* ---------------------------------------------------------------- *
   * Nhịp LẶP trong cửa sổ — một ngày, một báo cáo
   * ---------------------------------------------------------------- */

  it('ba nhịp trong CÙNG cửa sổ (00:30, 00:31, 00:45) ⇒ đúng MỘT dòng `bao_cao`', async () => {
    /*
     * Đây là ca mà cửa sổ trễ mua lấy: 60 nhịp mỗi ngày đi qua nhánh báo cáo sáng.
     * Lượt đầu sinh; mọi lượt sau thấy "ngày này đã có" bằng **kiểm rẻ** `daCoBaoCao`
     * và **không** chạy `tongQuan()` lần nào nữa. `so_da_co` là chỗ quan sát được
     * điều đó.
     */
    const mot = await chayCron({ scheduledTime: SANG }, env);
    const hai = await chayCron({ scheduledTime: tre(SANG, 1) }, env);
    const ba = await chayCron({ scheduledTime: tre(SANG, 15) }, env);

    expect(mot.bao_cao.so_sinh).toBe(1);
    expect(hai.bao_cao.so_sinh).toBe(0);
    expect(ba.bao_cao.so_sinh).toBe(0);

    // Hai lượt sau **không** là lỗi: chúng chỉ thấy báo cáo đã có.
    expect(hai.bao_cao.so_da_co).toBe(1);
    expect(ba.bao_cao.so_da_co).toBe(1);
    expect(hai.bao_cao.so_loi).toBe(0);
    expect(ba.bao_cao.so_loi).toBe(0);

    // Và loại vẫn được khai ở mọi lượt trong cửa sổ — `loai` nói "nhánh nào đã chạy".
    expect(ba.bao_cao.loai).toBe('sang');

    expect(await demBaoCao()).toBe(1);
    expect(await tinTheoThuTu()).toHaveLength(1);
  });

  it('nhịp thứ hai trong cửa sổ KHÔNG chạy chặng đọc nặng lần nào (`daCoBaoCao`)', async () => {
    /*
     * **Ca này ghim chính lý do `daCoBaoCao` tồn tại**, và không ca nào khác ghim
     * được nó: bỏ hẳn `daCoBaoCao` thì khoá chính của `bao_cao` **vẫn** chặn dòng
     * thứ hai, nên `so_sinh`, `so_da_co` và số dòng trong DB **không đổi** — mọi ca
     * khác vẫn xanh, chỉ còn 60 lượt `tongQuan()` mỗi ngày mà không ai thấy. Thứ duy
     * nhất quan sát được là **số lần chặng đọc nặng chạy**, nên ca này đếm đúng nó.
     *
     * Cách đếm: bọc `env.DB.prepare` và đếm các câu chạm bảng `trong_tam` — câu ấy
     * chỉ do `trongTamCuaNgay` của `duLieuBaoCao` phát ra, không do `moiWorkspace`
     * hay `daCoBaoCao` (hai câu đó chỉ chạm `workspace` và `bao_cao`).
     */
    const { env_dem, soLanDocNang } = demDocNang();

    // Nhịp đúng giờ: **phải** chạy chặng đọc nặng, nếu không phép đếm vô nghĩa.
    const mot = await chayCron({ scheduledTime: SANG }, env_dem);
    expect(mot.bao_cao.so_sinh).toBe(1);
    const sau_nhip_dau = soLanDocNang();
    expect(sau_nhip_dau).toBeGreaterThan(0);

    // Nhịp trễ một phút, cùng cửa sổ, cùng ngày: **không một lần nào nữa**.
    const hai = await chayCron({ scheduledTime: tre(SANG, 1) }, env_dem);
    expect(hai.bao_cao.so_da_co).toBe(1);
    expect(hai.bao_cao.so_sinh).toBe(0);
    expect(soLanDocNang() - sau_nhip_dau).toBe(0);
  });

  it('`daCoBaoCao` tra đúng ba cột khoá chính — ngày khác, loại khác thì KHÔNG chặn', async () => {
    await chayCron({ scheduledTime: SANG }, env);
    const ngay = ngayDiaPhuong(Date.now());

    expect(await daCoBaoCao(env.DB, WS, ngay, 'sang')).toBe(true);
    // Cùng ngày, **loại khác** ⇒ chưa có: handoff tối của cùng ngày là một dòng riêng.
    expect(await daCoBaoCao(env.DB, WS, ngay, 'toi')).toBe(false);
    // Ngày khác ⇒ chưa có: "đã sinh hôm nay chưa" phải là một câu hỏi **theo ngày**.
    expect(await daCoBaoCao(env.DB, WS, '2020-01-01', 'sang')).toBe(false);
    // Workspace khác ⇒ chưa có (mục 1, 18: không đọc chéo chủ).
    expect(await daCoBaoCao(env.DB, 'ws-khong-ton-tai', ngay, 'sang')).toBe(false);
  });

  it('chủ chỉ nhận MỘT tin dù cả cửa sổ 60 nhịp đều chạy', async () => {
    ghimDongHoNgoaiGioYenLang();
    const kenh = datNguonTelegram();
    for (const phut of [0, 1, 2, 30, TRE_TOI_DA_PHUT]) {
      await chayCron({ scheduledTime: tre(SANG, phut) }, env);
    }
    // Chặng đưa ra ngoài là một nhịp thường, sau đó.
    await chayCron({ scheduledTime: NHIP_THUONG }, env);
    expect(kenh.da_gui).toHaveLength(1);
    expect(await demBaoCao()).toBe(1);
  });

  it('báo cáo sáng và handoff tối của cùng ngày là HAI dòng, không đua nhau', async () => {
    await chayCron({ scheduledTime: SANG }, env);
    await chayCron({ scheduledTime: TOI }, env);
    expect(await demBaoCao()).toBe(2);
    expect(await tinTheoThuTu()).toHaveLength(2);
  });
});

/* ================================================================== *
 * G. d.336 — xem lại được, xuất ra markdown được (đường HTTP)
 * ================================================================== */

describe('mục 11 d.336 — báo cáo lưu theo ngày, xem lại được, xuất markdown được', () => {
  it('`GET /v1/bao-cao` liệt kê ngày đã có báo cáo, mới nhất trước', async () => {
    await chayCron({ scheduledTime: SANG }, env);
    await chayCron({ scheduledTime: TOI }, env);

    const r = await goiApi('/v1/bao-cao', TOKEN_CHU);
    expect(r.status).toBe(200);
    const trang = await r.json<{
      items: { ngay: string; loai: string; nhan_loai: string }[];
      cursor_sau: string | null;
    }>();
    expect(trang.items).toHaveLength(2);
    // `(ngay, loai)` giảm dần ⇒ cùng ngày thì `toi` trước `sang`.
    expect(trang.items.map((x) => x.loai)).toEqual(['toi', 'sang']);
    expect(trang.items[0]?.nhan_loai).toBe(NHAN_BAO_CAO.toi);
  });

  it('phân trang keyset đi tiếp đúng, không trùng không sót', async () => {
    await chayCron({ scheduledTime: SANG }, env);
    await chayCron({ scheduledTime: TOI }, env);

    const r1 = await goiApi('/v1/bao-cao?limit=1', TOKEN_CHU);
    const t1 = await r1.json<{ items: { loai: string }[]; cursor_sau: string | null }>();
    expect(t1.items.map((x) => x.loai)).toEqual(['toi']);
    expect(t1.cursor_sau).not.toBeNull();

    const r2 = await goiApi(
      `/v1/bao-cao?limit=1&cursor=${encodeURIComponent(t1.cursor_sau ?? '')}`,
      TOKEN_CHU,
    );
    const t2 = await r2.json<{ items: { loai: string }[]; cursor_sau: string | null }>();
    expect(t2.items.map((x) => x.loai)).toEqual(['sang']);
    expect(t2.cursor_sau).toBeNull();
  });

  it('`GET /v1/bao-cao/:ngay/:loai` trả cả markdown và dữ liệu JSON', async () => {
    await chayCron({ scheduledTime: SANG }, env);
    const ngay = ngayDiaPhuong(Date.now());

    const r = await goiApi(`/v1/bao-cao/${ngay}/sang`, TOKEN_CHU);
    expect(r.status).toBe(200);
    const bc = await r.json<{
      ngay: string;
      loai: string;
      noi_dung_md: string;
      du_lieu: { ngay: string } | null;
    }>();
    expect(bc.ngay).toBe(ngay);
    expect(bc.loai).toBe('sang');
    // Vế "xuất ra markdown được": chữ **đã lưu**, không dựng lại.
    expect(bc.noi_dung_md).toContain(`# ${NHAN_BAO_CAO.sang} — ${ngay}`);
    expect(bc.du_lieu?.ngay).toBe(ngay);
  });

  it('ngày chưa có báo cáo, hoặc `loai` lạ → 404', async () => {
    expect((await goiApi('/v1/bao-cao/2020-01-01/sang', TOKEN_CHU)).status).toBe(404);
    expect((await goiApi('/v1/bao-cao/2020-01-01/chieu', TOKEN_CHU)).status).toBe(404);
    expect((await goiApi('/v1/bao-cao/khong-phai-ngay/sang', TOKEN_CHU)).status).toBe(404);
  });

  it('agent KHÔNG đọc được báo cáo — mục 11 nằm trong mục 14 (giao diện của chủ)', async () => {
    await chayCron({ scheduledTime: SANG }, env);
    const ngay = ngayDiaPhuong(Date.now());
    for (const token of [T_COORD, T_MGR, T_WK]) {
      expect((await goiApi('/v1/bao-cao', token)).status).toBe(403);
      expect((await goiApi(`/v1/bao-cao/${ngay}/sang`, token)).status).toBe(403);
    }
  });
});
