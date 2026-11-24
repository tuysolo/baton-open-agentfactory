/**
 * **Mục Cần Chủ loại Review TỰ SINH của dự án không code** — SPEC mục 7 d.217,
 * 19.10 (d.548), **19.12 câu 57**, mục 8 (d.232, d.238, d.246).
 *
 * Mọi ca ở đây đi **đường thật**: HTTP qua cửa ghi, hoặc handler `scheduled` của
 * Cron. Không ca nào tiêm một cổng giả, vì thứ đang kiểm **là** cổng.
 *
 * Không gọi mạng lần nào: nguồn xác minh GitHub là `datNguonGiaLap` (chỗ cắm đã
 * có, chỉ bật trong Miniflare) — danh sách cấm `CLAUDE.md`.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { chayCron } from '../src/index.js';
import { boiCanhMuc, tieuDeMuc } from '../src/muc-xac-nhan.js';
import {
  TOKEN_CHU,
  WS,
  datNguonGiaLap,
  dungBangChung,
  dungDuAn,
  dungLienKet,
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
const HASH = 'a1b2c3d4e5f6a7b8';
const REPO = 'chu/baton';

interface MucTrongDb {
  id: string;
  ma_so: number;
  tieu_de: string;
  trang_thai: string;
  muc: string;
  loai: string;
  boi_canh: string | null;
  han_luc: number | null;
  mo_lai_lan: number;
  project_id: string | null;
  tao_boi_agent_id: string | null;
  ket_luan_review: string | null;
  xu_ly_luc: number | null;
}

/** Mục xác nhận tự sinh của một ticket — tra theo **cột mốc** của 0016. */
async function mucXacNhan(ticket_id = TK): Promise<MucTrongDb | null> {
  return env.DB.prepare(
    `SELECT id, ma_so, tieu_de, trang_thai, muc, loai, boi_canh, han_luc, mo_lai_lan,
            project_id, tao_boi_agent_id, ket_luan_review, xu_ly_luc
       FROM can_chu WHERE workspace_id = ? AND xac_nhan_ticket_id = ?`,
  )
    .bind(WS, ticket_id)
    .first<MucTrongDb>();
}

/** **Mọi** mục của workspace — để đếm "một mục, không sinh trùng". */
async function soMuc(): Promise<number> {
  const d = await env.DB.prepare('SELECT count(*) AS n FROM can_chu WHERE workspace_id = ?')
    .bind(WS)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

async function fileCuaMuc(can_chu_id: string): Promise<{ dia_chi: string; thu_tu: number }[]> {
  const { results } = await env.DB.prepare(
    'SELECT dia_chi, thu_tu FROM can_chu_file WHERE can_chu_id = ? ORDER BY thu_tu',
  )
    .bind(can_chu_id)
    .all<{ dia_chi: string; thu_tu: number }>();
  return results;
}

/** Chủ gõ `baton status <ticket> done` — một **lần kiểm cổng** thật. */
function lenXong(ticket_id = TK): Promise<Response> {
  return goiApi(`/v1/ticket/${ticket_id}/trang-thai`, TOKEN_CHU, {
    method: 'POST',
    than: { trang_thai: 'done' },
  });
}

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn();
  await dungTicket(P, 1, 'Viết lại tài liệu nghiệm thu', { trang_thai: 'verifying' });
  // **Dự án KHÔNG CODE** — cờ của d.217, đọc **mỗi lần kiểm** (19.10).
  await env.DB.prepare('UPDATE project SET khong_code = 1 WHERE id = ?').bind(P).run();
});

/* ================================================================== *
 * A. Gạch 1 — sinh LÚC KIỂM CỔNG, mọi đường kiểm cổng
 * ================================================================== */

describe('19.12 câu 57 gạch 1 — sinh lúc KIỂM CỔNG', () => {
  it('chủ bấm Xong + cổng thiếu chủ xác nhận → sinh đúng 1 mục `review` `Chờ`', async () => {
    await dungBangChung('ev-f', TK, 'file', { duong_dan: 'file:///srv/bao-cao.md' });

    const r = await lenXong();
    // Cổng vẫn ĐÓNG ở lần này: mục vừa sinh đang `Chờ`, chưa ai bấm gì.
    expect(r.status).toBe(422);
    expect(await trangThaiCua(TK)).toBe('verifying');

    const m = await mucXacNhan();
    expect(m).not.toBeNull();
    expect(m?.loai).toBe('review');
    expect(m?.trang_thai).toBe('open');
    // d.217 nói mục thuộc **ticket**, nên nó mang dự án của ticket, không "Chung".
    expect(m?.project_id).toBe(P);
    // Mục **tự sinh**: không agent nào tạo. Cột mốc `xac_nhan_ticket_id` là thứ
    // phân biệt nó với "chủ tự tạo để ghi nhớ" (d.229) — xem #78.
    expect(m?.tao_boi_agent_id).toBeNull();
    expect(await soMuc()).toBe(1);
  });

  it('d.240 + d.250: mục nối vào ticket qua `can_chu_ticket` (thẻ phải hiện ticket)', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();

    const m = await mucXacNhan();
    const d = await env.DB.prepare(
      'SELECT count(*) AS n FROM can_chu_ticket WHERE can_chu_id = ? AND ticket_id = ?',
    )
      .bind(m?.id, TK)
      .first<{ n: number }>();
    expect(d?.n).toBe(1);
  });

  it('d.238: mục mang đúng bằng chứng `file` làm "cái để xem"', async () => {
    await dungBangChung('ev-f1', TK, 'file', { duong_dan: '/srv/a.md', gui_luc: 1_000 });
    await dungBangChung('ev-f2', TK, 'file', { duong_dan: '/srv/b.md', gui_luc: 2_000 });
    await lenXong();

    const m = await mucXacNhan();
    expect(await fileCuaMuc(m!.id)).toEqual([
      { dia_chi: '/srv/a.md', thu_tu: 1 },
      { dia_chi: '/srv/b.md', thu_tu: 2 },
    ]);
  });

  it('19.8: mục tự sinh là 🟡 và nhận HẠN MẶC ĐỊNH của 🟡 (cùng hàm `hanMacDinh`)', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();

    const m = await mucXacNhan();
    expect(m?.muc).toBe('today');
    // 🟡 **luôn** có hạn (20:00 cùng ngày hoặc hôm sau) — khác ⚪ (`null`).
    expect(m?.han_luc).not.toBeNull();
    expect(m?.han_luc).toBeGreaterThan(Date.now());
  });

  it('KHÔNG có bằng chứng `file`/`note` nào → KHÔNG sinh (d.238 không có cái để xem)', async () => {
    // Cổng đóng ở vế **thứ nhất** của d.217 ("cần 1 `file` hoặc `note` **cộng**
    // chủ xác nhận"), nên chưa có gì để hỏi chủ.
    const r = await lenXong();
    expect(r.status).toBe(422);
    expect(await mucXacNhan()).toBeNull();
    expect(await soMuc()).toBe(0);
  });

  it('bằng chứng đã RÚT (d.222) không tính là cái để xem → KHÔNG sinh', async () => {
    await dungBangChung('ev-f', TK, 'file', { gui_luc: 1_000, rut_luc: 2_000 });
    await lenXong();
    expect(await mucXacNhan()).toBeNull();
  });

  it('ĐỐI CHỨNG: dự án CÓ code thì không đường nào sinh mục xác nhận', async () => {
    await env.DB.prepare('UPDATE project SET khong_code = 0, bat_buoc_review = 0 WHERE id = ?')
      .bind(P)
      .run();
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();
    expect(await mucXacNhan()).toBeNull();
  });

  /**
   * **Ca mà câu 57 gọi tên riêng**: "kể cả đường tự lên Xong định kỳ (d.221), nơi
   * **không có ai gõ lệnh nào**". Đây là đường `#ghiMotXacMinh` của cửa ghi, một
   * đường ghi **khác** `#chayMotLenh` — nên nếu bộ sinh chỉ được nối vào đường
   * lệnh thì ca này đỏ.
   */
  it('d.221 — đường Cron tự lên Xong cũng sinh mục, dù không ai gõ lệnh', async () => {
    datNguonGiaLap({ commit: { [`${REPO}@${HASH}`]: 'merged' } });
    await dungBangChung('ev-f', TK, 'file');
    await dungBangChung('ev-c', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: Date.now() - 1,
    });

    // Một cron duy nhất từ 10/10: nhịp mỗi phút bật `thu_lai`. Phút 1 của giờ 3 UTC
    // không chia hết 5, nên không nhịp việc nào khác chen vào lượt này.
    const kq = await chayCron({ scheduledTime: Date.UTC(2026, 9, 6, 3, 1) }, env);

    // Cổng vẫn đóng (mục đang `Chờ`) ⇒ ticket **ở lại** Chờ kiểm chứng — đúng 19.10.
    expect(kq.thu_lai.so_tu_len_xong).toBe(0);
    expect(await trangThaiCua(TK)).toBe('verifying');
    // …nhưng mục đã có, nên chủ có cái để bấm. Đó là nửa mà lượt trước chưa có.
    const m = await mucXacNhan();
    expect(m?.trang_thai).toBe('open');
    expect(await soMuc()).toBe(1);
  });
});

/* ================================================================== *
 * B. Gạch 2 — MỘT mục cho mỗi ticket, không sinh trùng
 * ================================================================== */

describe('19.12 câu 57 gạch 2 — một mục mỗi ticket', () => {
  it('HAI lần kiểm cổng liên tiếp → vẫn đúng MỘT mục', async () => {
    await dungBangChung('ev-f', TK, 'file');

    await lenXong();
    const lan_1 = await mucXacNhan();
    await lenXong();
    const lan_2 = await mucXacNhan();

    expect(await soMuc()).toBe(1);
    // Cùng một dòng, cùng `T-số` — không phải "một dòng mới trông giống dòng cũ".
    expect(lan_2?.id).toBe(lan_1?.id);
    expect(lan_2?.ma_so).toBe(lan_1?.ma_so);
  });

  it('mục đang `Chờ` thì lần kiểm sau KHÔNG đốt thêm `T-số` nào', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();
    const bo_dem_1 = await boDemAsk();
    await lenXong();
    await lenXong();
    // d.232 "tăng dần, **không tái dùng**": một số đốt là mất vĩnh viễn, nên bộ
    // đếm **không được** nhích ở những lần kiểm không sinh gì.
    expect(await boDemAsk()).toBe(bo_dem_1);
  });

  it('`ux_can_chu_xac_nhan_ticket` (0016) chặn mục thứ hai ngay tại DB', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();

    // Ca SQL **thô**: không đường ghi nào của sản phẩm làm được việc này, nên đây
    // là cách duy nhất chứng minh hàng rào DB **bật được** — một ràng buộc không
    // có ca bật được là mã chết.
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu
           (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
            can_tty, tao_luc, cap_nhat_luc, xac_nhan_ticket_id)
         VALUES ('ct-trung', ?, 9999, 'Mục thứ hai', ?, 'today', 'review', 'open',
                 0, 1, 1, ?)`,
      )
        .bind(WS, P, TK)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint/i);
    expect(await soMuc()).toBe(1);
  });

  it('0016: mục mang mốc mà KHÔNG phải loại `review` → ABORT (d.217 nói "loại Review")', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu
           (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
            can_tty, tao_luc, cap_nhat_luc, xac_nhan_ticket_id)
         VALUES ('ct-sai-loai', ?, 9998, 'Mục fyi mang mốc', ?, 'today', 'fyi', 'open',
                 0, 1, 1, ?)`,
      )
        .bind(WS, P, TK)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  /*
   * **Vế `IS NOT` của `tg_can_chu_xac_nhan_them`, không `<>`.** Chú thích dòng
   * 71–73 của 0016 tự gọi tên cái bẫy: ticket không tồn tại ⇒ `(SELECT workspace_id
   * …)` ra **NULL**, và `NEW.workspace_id <> NULL` cho **NULL**, tức `WHEN` **không
   * bật** và dòng lọt qua trigger. Reviewer của lượt 3b bắt đúng chỗ này: đổi
   * `IS NOT` thành `<>` **không** làm đỏ ca nào.
   *
   * **Mẫu thông điệp là thứ ghim được mệnh đề này**, không chỉ `rejects`: khoá
   * ngoài `REFERENCES ticket(id)` **được D1 ép thật** (`schema.test.ts`), nên với
   * `<>` câu lệnh vẫn hỏng — nhưng hỏng bằng một lỗi **`FOREIGN KEY`**, ở một bước
   * **sau** trigger `BEFORE INSERT`. Nên ca này đòi đúng `INVALID_INPUT` của 0016:
   * với `<>` nó nhận `FOREIGN KEY` và **đỏ**.
   */
  it('0016 `IS NOT`: mục `review` mang mốc trỏ ticket KHÔNG TỒN TẠI → ABORT của trigger', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO can_chu
           (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
            can_tty, tao_luc, cap_nhat_luc, xac_nhan_ticket_id)
         VALUES ('ct-moc-tro-hu', ?, 9995, 'Mốc trỏ hư', ?, 'today', 'review', 'open',
                 0, 1, 1, 'tk-khong-he-co')`,
      )
        .bind(WS, P)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
    expect(await soMuc()).toBe(0);
  });

  /*
   * **`tg_can_chu_xac_nhan_sua` (BEFORE UPDATE) có việc riêng, không trùng trigger
   * INSERT.** Reviewer bắt: xoá hẳn nó thì không ca nào đỏ. Hậu quả thật của việc
   * thiếu nó: một câu `UPDATE can_chu SET loai = 'fyi'` biến mục xác nhận thành một
   * loại **không có** nút Đạt/Cần sửa của d.261 — mà `chuDaXacNhan` chỉ đọc
   * `trang_thai` + `ket_luan_review`, **không** đọc `loai`, nên cổng Xong của
   * ticket mất hẳn đường mở (không ai bấm Đạt được nữa) mà không lỗi nào báo.
   */
  it('`tg_can_chu_xac_nhan_sua` (0016): `UPDATE … SET loai = \'fyi\'` trên mục xác nhận → ABORT', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();
    const m = await mucXacNhan();
    expect(m?.loai).toBe('review');

    await expect(
      env.DB.prepare('UPDATE can_chu SET loai = ? WHERE id = ?').bind('fyi', m!.id).run(),
    ).rejects.toThrow(/INVALID_INPUT/);

    // Mục **còn** là `review`, nên hai nút của d.261 còn đó.
    expect((await mucXacNhan())?.loai).toBe('review');
  });

  /*
   * **Đường vòng của `ma_so` bất biến.** `INSERT OR REPLACE` thay một dòng trùng
   * khoá bằng cách **xoá rồi chèn**, nên **không** `BEFORE UPDATE` nào bắn — và
   * phép xoá đó cũng không bắn `BEFORE DELETE` khi `PRAGMA recursive_triggers`
   * tắt (mặc định của SQLite). Cùng lỗ đã bịt cho `nhat_ky` ở 0014
   * (`nhat-ky.test.ts`), nên 0016 bịt nó cho `can_chu` bằng
   * `tg_can_chu_khong_ghi_de`. Ca này là bằng chứng duy nhất rằng hàng rào đó
   * bật được: một phép ghi đè **thành công** giữ nguyên số dòng, nên ca so
   * **nội dung** dòng cũ, không chỉ đếm.
   */
  it('`tg_can_chu_khong_ghi_de` (0016): `INSERT OR REPLACE` lên một `id` đã có → ABORT', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();
    const m = await mucXacNhan();
    expect(m).not.toBeNull();

    await expect(
      env.DB.prepare(
        `INSERT OR REPLACE INTO can_chu
           (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
            can_tty, tao_luc, cap_nhat_luc, xac_nhan_ticket_id)
         VALUES (?, ?, 9997, 'Bản ghi đè lén', ?, 'today', 'review', 'open',
                 0, 1, 1, NULL)`,
      )
        .bind(m!.id, WS, P)
        .run(),
    ).rejects.toThrow(/FORBIDDEN/);

    // `INSERT OR IGNORE` cũng không âm thầm nuốt — cùng một trigger.
    await expect(
      env.DB.prepare(
        `INSERT OR IGNORE INTO can_chu
           (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
            can_tty, tao_luc, cap_nhat_luc, xac_nhan_ticket_id)
         VALUES (?, ?, 9996, 'Bản khác', ?, 'today', 'review', 'open',
                 0, 1, 1, NULL)`,
      )
        .bind(m!.id, WS, P)
        .run(),
    ).rejects.toThrow(/FORBIDDEN/);

    // Dòng cũ **còn nguyên**, từng trường một — gồm `ma_so` và `trang_thai`.
    const sau = await mucXacNhan();
    expect(sau).toEqual(m);
    expect(sau?.ma_so).toBe(m?.ma_so);
    expect(sau?.trang_thai).toBe('open');
    expect(await soMuc()).toBe(1);
  });
});

async function boDemAsk(): Promise<number> {
  const d = await env.DB.prepare(
    "SELECT gia_tri FROM bo_dem WHERE workspace_id = ? AND pham_vi = 'workspace' AND khoa = 'ask'",
  )
    .bind(WS)
    .first<{ gia_tri: number }>();
  return d?.gia_tri ?? 0;
}

/** **Mọi** dòng Nhật ký của workspace — để đếm trước/sau một lượt ghi. */
async function soNhatKy(): Promise<number> {
  const d = await env.DB.prepare('SELECT count(*) AS n FROM nhat_ky WHERE workspace_id = ?')
    .bind(WS)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

async function soBinhLuan(ticket_id: string): Promise<number> {
  const d = await env.DB.prepare('SELECT count(*) AS n FROM comment WHERE ticket_id = ?')
    .bind(ticket_id)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

/** Bình luận có chữ "mở lại" — nửa thứ hai của d.542, cũng không được ghi. */
async function soBinhLuanMoLai(ticket_id: string): Promise<number> {
  const d = await env.DB.prepare(
    "SELECT count(*) AS n FROM comment WHERE ticket_id = ? AND noi_dung LIKE '%mở lại%'",
  )
    .bind(ticket_id)
    .first<{ n: number }>();
  return d?.n ?? 0;
}

/* ================================================================== *
 * C. Gạch 3 — Bỏ qua chỉ dựng lại khi có bằng chứng MỚI HƠN
 * ================================================================== */

describe('19.12 câu 57 gạch 3 — Bỏ qua và việc dựng lại', () => {
  /** Sinh mục, rồi chủ **Bỏ qua** nó (19.10). Trả `id` và mốc bỏ qua. */
  async function sinhRoiBoQua(): Promise<{ id: string; moc: number }> {
    await dungBangChung('ev-f', TK, 'file', { gui_luc: 1_000 });
    await lenXong();
    const m = await mucXacNhan();
    const r = await goiApi(`/v1/can-chu/${m!.id}/bo-qua`, TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'Chưa cần xem bây giờ' },
    });
    expect(r.status).toBe(200);
    const sau = await mucXacNhan();
    expect(sau?.trang_thai).toBe('skipped');
    return { id: m!.id, moc: sau!.xu_ly_luc! };
  }

  it('19.10: chủ Bỏ qua → ticket Ở LẠI Chờ kiểm chứng (cổng không mở)', async () => {
    await sinhRoiBoQua();
    const r = await lenXong();
    expect(r.status).toBe(422);
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('Bỏ qua + KHÔNG bằng chứng mới → KHÔNG dựng lại (nút Bỏ qua giữ được nghĩa)', async () => {
    const { id } = await sinhRoiBoQua();
    await lenXong();
    await lenXong();

    const m = await mucXacNhan();
    expect(m?.id).toBe(id);
    expect(m?.trang_thai).toBe('skipped');
    expect(m?.mo_lai_lan).toBe(0);
    expect(await soMuc()).toBe(1);
  });

  it('Bỏ qua + bằng chứng `file` MỚI HƠN → DỰNG LẠI về `Chờ`, `mo_lai_lan` +1', async () => {
    const { id, moc } = await sinhRoiBoQua();
    await dungBangChung('ev-f2', TK, 'file', {
      duong_dan: '/srv/ban-moi.md',
      gui_luc: moc + 1_000,
    });

    // Đếm **trước** — xem khối "KHÔNG ghi Nhật ký / bình luận" ở `cauDungLai`.
    const nhat_ky_truoc = await soNhatKy();
    const binh_luan_truoc = await soBinhLuan(TK);

    await lenXong();

    const m = await mucXacNhan();
    expect(m?.id).toBe(id);
    expect(m?.trang_thai).toBe('open');
    expect(m?.mo_lai_lan).toBe(1);
    // Năm cột của lần xử lý trước phải **sạch** — mười mệnh đề của
    // `tg_can_chu_xu_ly_*` (0015) ép đúng thế; thiếu một cột là ABORT.
    expect(m?.xu_ly_luc).toBeNull();
    expect(m?.ket_luan_review).toBeNull();
    // "Việc mới để xem" lên thẻ: file mới được thêm, file cũ **không** bị xoá.
    const f = await fileCuaMuc(id);
    expect(f.map((x) => x.dia_chi)).toContain('/srv/ban-moi.md');
    expect(f).toHaveLength(2);
    expect(await soMuc()).toBe(1);

    /*
     * **GHIM: một lần dựng lại TỰ ĐỘNG không ghi dòng Nhật ký nào, cũng không
     * bình luận "mở lại".** Đây là một **lệch có chủ ý** so với 19.9 **d.542**,
     * khai ở `cau-hoi-spec.md` #78 — lý do nằm trong khối chú thích của
     * `cauDungLai` (`muc-xac-nhan.ts`): `nhat_ky.nguoi_loai` không có `'system'`,
     * nên nửa Nhật ký của d.542 chỉ viết được bằng cách gán cho **chủ**, một việc
     * chủ không làm, và d.309 làm dòng đó **vĩnh viễn**.
     *
     * Đếm **trước/sau**, không "bằng 0": ai chốt ngược (thêm dòng) thì ca này đỏ
     * chứ không lặng lẽ đổi nghĩa.
     */
    expect(await soNhatKy()).toBe(nhat_ky_truoc);
    expect(await soBinhLuan(TK)).toBe(binh_luan_truoc);
    expect(await soBinhLuanMoLai(TK)).toBe(0);
  });

  it('Bỏ qua + bằng chứng mới nhưng CŨ HƠN lần bỏ qua → KHÔNG dựng lại', async () => {
    const { id, moc } = await sinhRoiBoQua();
    // Một dòng `evidence` gửi **trước** lúc chủ bấm Bỏ qua (vd đồng bộ muộn): chủ
    // đã thấy nó khi quyết, nên nó không phải "việc mới".
    await dungBangChung('ev-f0', TK, 'file', { duong_dan: '/srv/cu.md', gui_luc: moc - 1 });

    await lenXong();

    const m = await mucXacNhan();
    expect(m?.id).toBe(id);
    expect(m?.trang_thai).toBe('skipped');
    expect(m?.mo_lai_lan).toBe(0);
  });

  /*
   * **Biên của phép so, ghim `>` chứ không `>=`.** Chữ của câu 57 gạch 3 là bằng
   * chứng "**mới hơn** lần bỏ qua" (nguyên văn trích ở đầu `muc-xac-nhan.ts`), nên
   * một bằng chứng gửi **đúng** millisecond chủ bấm Bỏ qua **không** phải việc mới:
   * chủ đã thấy nó khi quyết. Hai ca láng giềng dùng `moc + 1_000` và `moc - 1`, nên
   * trước ca này đột biến `>` → `>=` **không** làm đỏ ca nào.
   */
  it('Bỏ qua + bằng chứng gửi ĐÚNG BẰNG mốc bỏ qua → KHÔNG dựng lại ("mới hơn", không "từ bằng")', async () => {
    const { id, moc } = await sinhRoiBoQua();
    await dungBangChung('ev-f-bang', TK, 'file', { duong_dan: '/srv/dung-luc.md', gui_luc: moc });

    await lenXong();

    const m = await mucXacNhan();
    expect(m?.id).toBe(id);
    expect(m?.trang_thai).toBe('skipped');
    expect(m?.mo_lai_lan).toBe(0);
  });

  it('bằng chứng mới `note` cũng dựng lại được (d.217 nói `file` HOẶC `note`)', async () => {
    const { moc } = await sinhRoiBoQua();
    await dungBangChung('ev-n', TK, 'note', {
      noi_dung: 'Đã viết lại mục 3, mời xem.',
      gui_luc: moc + 1_000,
    });

    await lenXong();
    const m = await mucXacNhan();
    expect(m?.trang_thai).toBe('open');
    // `note` không có địa chỉ mở được, nên nó vào **bối cảnh**, không thành một
    // dòng `can_chu_file` — chỗ d.238 và d.217 không khớp, khai ở #78.
    expect(m?.boi_canh).toContain('Đã viết lại mục 3');
  });
});

/* ================================================================== *
 * D. Đường đi HẾT — ticket của dự án không code VÀO ĐƯỢC Xong
 * ================================================================== */

describe('d.217 — chủ xác nhận rồi thì ticket vào được Xong', () => {
  it('chủ bấm **Đạt** trên mục xác nhận → lần kiểm cổng sau ticket sang Xong', async () => {
    await dungBangChung('ev-f', TK, 'file');
    expect((await lenXong()).status).toBe(422);

    const m = await mucXacNhan();
    const r = await goiApi(`/v1/can-chu/${m!.id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { ket_luan: 'dat' },
    });
    expect(r.status).toBe(200);

    // **Lần đầu đường này đi được** từ khi cổng ra đời: trước lượt 3b,
    // `chuDaXacNhan` trả `false` cứng nên nhánh này là mã chết.
    expect((await lenXong()).status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('chủ bấm **Cần sửa** → cổng VẪN ĐÓNG (chủ nói chưa được — #78)', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();

    const m = await mucXacNhan();
    const r = await goiApi(`/v1/can-chu/${m!.id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { ket_luan: 'can_sua', ghi_them: 'Mục 3 còn thiếu' },
    });
    expect(r.status).toBe(200);

    expect((await lenXong()).status).toBe(422);
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('Cần sửa + bằng chứng MỚI → dựng lại để hỏi chủ lần nữa (#78)', async () => {
    await dungBangChung('ev-f', TK, 'file', { gui_luc: 1_000 });
    await lenXong();
    const m = await mucXacNhan();
    await goiApi(`/v1/can-chu/${m!.id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { ket_luan: 'can_sua', ghi_them: 'Thiếu mục 3' },
    });
    const moc = (await mucXacNhan())!.xu_ly_luc!;

    await dungBangChung('ev-f2', TK, 'file', { duong_dan: '/srv/v2.md', gui_luc: moc + 500 });
    await lenXong();

    // Không dựng lại thì ticket treo ở Chờ kiểm chứng **vĩnh viễn** — đúng cái bẫy
    // của #75, và agent đã sửa xong lại không có đường nào hỏi lại chủ.
    const sau = await mucXacNhan();
    expect(sau?.trang_thai).toBe('open');
    expect(sau?.mo_lai_lan).toBe(1);
  });

  it('19.10: cờ `khong_code` đọc tại THỜI ĐIỂM KIỂM — tắt cờ thì cổng mở ngay', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();
    expect(await mucXacNhan()).not.toBeNull();

    await env.DB.prepare('UPDATE project SET khong_code = 0, bat_buoc_review = 0 WHERE id = ?')
      .bind(P)
      .run();
    /*
     * Dự án **có** code thì cổng đi nhánh khác: nó đòi commit/deploy (d.213), nên
     * một `file` không đủ — vẫn 422, nhưng vì **lý do khác**, và không mục nào
     * được sinh thêm.
     */
    expect((await lenXong()).status).toBe(422);
    expect(await soMuc()).toBe(1);

    // Có commit `merged` thì vào Xong, và mục Cần Chủ cũ **không** chặn gì: nó chỉ
    // là một thẻ trên màn hình của chủ, không một điều kiện của cổng nữa.
    await dungBangChung('ev-c', TK, 'commit', { xac_minh: 'merged' });
    expect((await lenXong()).status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });
});

/* ================================================================== *
 * E. `ma_so` bất biến — nợ của lượt 3a (migration 0016)
 * ================================================================== */

describe('mục 8 d.232 — `ma_so` của một mục KHÔNG BAO GIỜ đổi', () => {
  it('`UPDATE can_chu SET ma_so = …` → ABORT ngay tại DB', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();
    const m = await mucXacNhan();

    await expect(
      env.DB.prepare('UPDATE can_chu SET ma_so = ? WHERE id = ?')
        .bind(m!.ma_so + 100, m!.id)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);

    expect((await mucXacNhan())?.ma_so).toBe(m?.ma_so);
  });

  it('đặt lại ĐÚNG giá trị cũ thì KHÔNG bị chặn (trigger chỉ chặn thay đổi thật)', async () => {
    await dungBangChung('ev-f', TK, 'file');
    await lenXong();
    const m = await mucXacNhan();

    await env.DB.prepare('UPDATE can_chu SET ma_so = ? WHERE id = ?')
      .bind(m!.ma_so, m!.id)
      .run();
    expect((await mucXacNhan())?.ma_so).toBe(m?.ma_so);
  });
});

/* ================================================================== *
 * F. HAI mục trong MỘT lượt ghi — bộ đếm `bo_dem` phải theo số CUỐI
 * ================================================================== */

/**
 * Đường **thật** tới ≥2 mục trong một lượt: 19.11 d.559 ("con cuối cùng kết thì
 * cha tự kiểm cổng lại"). `apSuKienLenTicket` kiểm cổng cho ticket **con**, rồi
 * `kiemLaiCongCuaCha` kiểm cổng cho **từng** ticket cha — nên **một**
 * `baton status <con> done` là **nhiều** lần kiểm cổng, trong **một** `db.batch()`.
 *
 * Thứ ca này đo không phải "hai mục": nó đo **bộ đếm**. Bản đầu của lượt 3b giữ
 * lại câu `bo_dem` mà `capSo` trả về — câu đó **bind cứng** số **đầu**, nên sau
 * một lượt sinh `N` và `N+1` bộ đếm nằm ở `N`. Batch vẫn **thành công**, rồi lệnh
 * cấp `T-số` **kế tiếp** đọc `N`, cấp `N+1`, đụng `ux_can_chu_ma_so` và ABORT
 * **mãi mãi**. `tg_bo_dem_chi_tang` không bắt: đặt `N` khi đang `N-1` vẫn là tăng.
 * Nên ca có **ba** vế: hai mục liền số, bộ đếm bằng số **cuối**, và lượt cấp số
 * **sau** đó chạy được.
 */
describe('bộ sinh cấp ≥2 `T-số` trong một lượt — 19.11 d.559', () => {
  /** `ma_so` của mọi mục của workspace, tăng dần. */
  async function moiMaSo(): Promise<number[]> {
    const { results } = await env.DB.prepare(
      'SELECT ma_so FROM can_chu WHERE workspace_id = ? ORDER BY ma_so',
    )
      .bind(WS)
      .all<{ ma_so: number }>();
    return results.map((r) => r.ma_so);
  }

  async function chuBamDat(can_chu_id: string): Promise<void> {
    const r = await goiApi(`/v1/can-chu/${can_chu_id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { ket_luan: 'dat' },
    });
    expect(r.status).toBe(200);
  }

  it('một `baton status <con> done` sinh HAI mục liền số, và bộ đếm bằng số CUỐI', async () => {
    const cha_1 = await dungTicket(P, 10, 'Cha một', { trang_thai: 'verifying' });
    const cha_2 = await dungTicket(P, 11, 'Cha hai', { trang_thai: 'verifying' });
    const con = await dungTicket(P, 12, 'Con', { trang_thai: 'verifying' });
    await dungLienKet(cha_1, con, 'parent');
    await dungLienKet(cha_2, con, 'parent');

    // Cả ba ticket có "cái để xem" (d.238), nên cả ba lần kiểm cổng đều sinh được.
    await dungBangChung('ev-c1', cha_1, 'file', { duong_dan: '/srv/cha1.md' });
    await dungBangChung('ev-c2', cha_2, 'file', { duong_dan: '/srv/cha2.md' });
    await dungBangChung('ev-con', con, 'file', { duong_dan: '/srv/con.md' });

    // Lượt 1: con bị cổng chặn, sinh mục của **con**. Chủ bấm Đạt để lượt sau con
    // đi tới được `done` — chỉ khi con vào nhóm `closed` thì cha mới kiểm lại.
    expect((await lenXong(con)).status).toBe(422);
    const muc_con = await mucXacNhan(con);
    expect(muc_con).not.toBeNull();
    await chuBamDat(muc_con!.id);

    const bo_dem_truoc = await boDemAsk();
    expect(bo_dem_truoc).toBe(muc_con!.ma_so);
    expect(await soMuc()).toBe(1);

    // Lượt 2 — **một** lệnh, **ba** lần kiểm cổng (con, cha 1, cha 2).
    expect((await lenXong(con)).status).toBe(200);
    expect(await trangThaiCua(con)).toBe('done');

    const m1 = await mucXacNhan(cha_1);
    const m2 = await mucXacNhan(cha_2);
    expect(m1?.trang_thai).toBe('open');
    expect(m2?.trang_thai).toBe('open');
    expect(await soMuc()).toBe(3);

    // Hai `T-số` **khác nhau** và **liền nhau** — không trùng (`ux_can_chu_ma_so`).
    const N = bo_dem_truoc + 1;
    expect(await moiMaSo()).toEqual([bo_dem_truoc, N, N + 1]);

    // **Nửa quan trọng nhất**: bộ đếm theo số **cuối**, không số đầu.
    expect(await boDemAsk()).toBe(N + 1);

    /*
     * …và hậu quả mà chú thích nói tới đã hết: lượt cấp `T-số` **kế tiếp** chạy
     * được. Đi đường thật (một lần kiểm cổng nữa, cho ticket thứ ba `TK` của
     * `beforeEach`), không gọi bộ sinh trực tiếp. Với bộ đếm tụt hậu, câu
     * `INSERT can_chu` của lượt này đụng `ux_can_chu_ma_so` ⇒ **cả batch** ABORT
     * ⇒ lệnh 5xx và không mục nào sinh.
     */
    await dungBangChung('ev-tk', TK, 'file', { duong_dan: '/srv/tk.md' });
    expect((await lenXong(TK)).status).toBe(422);
    const m3 = await mucXacNhan(TK);
    expect(m3?.ma_so).toBe(N + 2);
    expect(await boDemAsk()).toBe(N + 2);
    expect(await soMuc()).toBe(4);
  });
});

/* ================================================================== *
 * G. Chữ của mục — hàm thuần, không cần DB
 * ================================================================== */

describe('chữ của mục tự sinh', () => {
  it('tiêu đề theo công thức `<mã ticket> xác nhận xong: <tiêu đề ticket>`', () => {
    expect(tieuDeMuc('SAI', 12, 'Viết lại tài liệu')).toBe(
      'SAI-12 xác nhận xong: Viết lại tài liệu',
    );
  });

  it('tiêu đề dài bị CẮT về trần 200 của `can_chu.tieu_de` (CHECK 0013)', () => {
    const ra = tieuDeMuc('SAI', 1, 'x'.repeat(500));
    expect([...ra].length).toBeLessThanOrEqual(200);
    expect(ra.endsWith('…')).toBe(true);
  });

  it('bối cảnh liệt kê cả `file` và `note`, markdown, không rỗng', () => {
    const ra = boiCanhMuc([
      { loai: 'file', gui_luc: 1, duong_dan: '/srv/a.md', noi_dung: null },
      { loai: 'note', gui_luc: 2, duong_dan: null, noi_dung: 'Xong rồi' },
    ]);
    expect(ra).toContain('/srv/a.md');
    expect(ra).toContain('Xong rồi');
    expect(ra.length).toBeLessThanOrEqual(100_000);
  });
});
