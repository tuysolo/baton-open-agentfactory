/**
 * **Màn hình Cần Chủ** — SPEC mục 8 d.248–252, 19.8 (d.532), 19.12 câu 60 (mọi
 * giờ-trên-tường là UTC+7) và câu 61 (tầm nhìn lớp "Chung" rẽ theo **vai**).
 *
 * Phần 4 làm **tầng API**, không giao diện (phần 6). Nên các ca ở đây đo đúng hai
 * thứ: **thứ tự và tập dòng** mà SPEC đòi, và **các dẫn xuất** mà phần 6 không được
 * phải tính lại (`qua_han_gio`, `muc_cao_nhat`, `ngay`, `tieu_de_ngan`).
 *
 * Khối `EXPLAIN QUERY PLAN` ở cuối đo **chính câu sản phẩm** (`cauKhoiCho`,
 * `cauHuyHieu`, `cauDaXuLy`, `cauAsksVuaXuLy`), không một chuỗi SQL viết lại trong
 * test — nếp đã chốt ở `quyet-dinh.md`: một chuỗi viết lại vẫn xanh sau khi câu
 * thật đã hỏng.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { MUI_GIO_CHU_PHUT, gioQuaHan, khoangNgay, mucCaoNhat, nuaDemCuaNgay } from '@baton/shared';
import {
  bangDaXuLy,
  cauAsksVuaXuLy,
  cauDaXuLy,
  cauHuyHieu,
  cauKhoiCho,
  huyHieuCanChu,
  khoiCho,
  manHinhCanChu,
  tieuDeNgan,
} from '../src/doc-can-chu.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  aiAgent,
  choVaoDuAn,
  dungAgent,
  dungCanChu,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const P2 = 'pj-COS';

/** Mốc "bây giờ" cố định của mọi ca — một con số, không `Date.now()`. */
const GIO = 1_760_000_000_000;

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn();
  await dungDuAn('COS', 'Chief of Staff');
});

/* ================================================================== *
 * A. d.249 — ba khối, và THỨ TỰ trong khối
 * ================================================================== */

describe('d.249 — 3 khối, trong khối sắp theo HẠN rồi theo LÚC TẠO', () => {
  it('đúng ba khối, đúng thứ tự 🔴 → 🟡 → ⚪', async () => {
    // 🔴 không dùng được với loại `fyi` (19.8 — CHECK của 0013 ép, và fixture tôn
    // trọng luật đó thay vì đi cửa hậu), nên mục 🔴 ở đây là `run_command`.
    await dungCanChu('ct-u', { muc: 'urgent', loai: 'run_command', project_id: P });
    await dungCanChu('ct-t', { muc: 'today', project_id: P });
    await dungCanChu('ct-l', { muc: 'later', project_id: P });

    const mh = await manHinhCanChu(env.DB, CHU, WS, GIO);
    expect(mh.khoi.map((k) => k.muc)).toEqual(['urgent', 'today', 'later']);
    expect(mh.khoi.map((k) => k.items.map((t) => t.id))).toEqual([
      ['ct-u'],
      ['ct-t'],
      ['ct-l'],
    ]);
  });

  it('trong khối: HẠN SỚM HƠN đứng trước, bất kể lúc tạo', async () => {
    // Tạo **trước** nhưng hạn **muộn** ⇒ phải đứng sau.
    await dungCanChu('ct-han-muon', { muc: 'today', tao_luc: GIO - 9_000, han_luc: GIO + 9_000 });
    await dungCanChu('ct-han-som', { muc: 'today', tao_luc: GIO - 1_000, han_luc: GIO + 1_000 });

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items.map((t) => t.id)).toEqual(['ct-han-som', 'ct-han-muon']);
  });

  it('CA BIÊN: hai mục CÙNG HẠN → phá vỡ hoà bằng LÚC TẠO (cũ hơn trước)', async () => {
    const han = GIO + 5_000;
    await dungCanChu('ct-tao-sau', { muc: 'today', tao_luc: GIO - 1_000, han_luc: han });
    await dungCanChu('ct-tao-truoc', { muc: 'today', tao_luc: GIO - 5_000, han_luc: han });

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items.map((t) => t.id)).toEqual(['ct-tao-truoc', 'ct-tao-sau']);
  });

  it('CA BIÊN: cùng hạn VÀ cùng lúc tạo → vẫn có thứ tự xác định (theo `id`)', async () => {
    // Thứ tự toàn phần là điều kiện sống còn của keyset (`trang.ts`): thiếu cột
    // phá hoà thì cursor bỏ sót hoặc trả trùng.
    await dungCanChu('ct-b', { muc: 'today', tao_luc: GIO, han_luc: GIO + 1 });
    await dungCanChu('ct-a', { muc: 'today', tao_luc: GIO, han_luc: GIO + 1 });

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items.map((t) => t.id)).toEqual(['ct-a', 'ct-b']);
  });

  it('19.8: mục QUÁ HẠN được đưa lên ĐẦU khối (hạn nhỏ nhất ⇒ đứng đầu)', async () => {
    await dungCanChu('ct-con-han', { muc: 'today', tao_luc: GIO - 9_000, han_luc: GIO + 60_000 });
    await dungCanChu('ct-qua-han', { muc: 'today', tao_luc: GIO - 1_000, han_luc: GIO - 60_000 });

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items.map((t) => t.id)).toEqual(['ct-qua-han', 'ct-con-han']);
    expect(k.items[0]?.qua_han).toBe(true);
    expect(k.items[1]?.qua_han).toBe(false);
  });

  /**
   * **SPEC không nói mục KHÔNG ĐẶT HẠN nằm đâu** trong thứ tự của d.249 —
   * `cau-hoi-spec.md` #77. Hướng tạm đã cài: **cuối khối**.
   *
   * Ca này ghim hướng đó, nên nếu phiên spec chốt ngược thì nó **đỏ** chứ không
   * lặng lẽ đổi nghĩa. Nó cũng là ca duy nhất chứng minh hai **pha** của
   * `cauKhoiCho` nối đúng (xem khối ghi chú của hàm đó).
   */
  it('#77: mục KHÔNG ĐẶT HẠN nằm CUỐI khối, sau cả mục chưa quá hạn', async () => {
    await dungCanChu('ct-khong-han', { muc: 'later', tao_luc: GIO - 9_000, han_luc: null });
    await dungCanChu('ct-co-han', { muc: 'later', tao_luc: GIO - 1_000, han_luc: GIO + 90_000 });

    const k = await khoiCho(env.DB, CHU, WS, 'later', GIO);
    expect(k.items.map((t) => t.id)).toEqual(['ct-co-han', 'ct-khong-han']);
  });

  it('#77: nhiều mục không hạn thì sắp theo LÚC TẠO với nhau', async () => {
    await dungCanChu('ct-n2', { muc: 'later', tao_luc: GIO - 1_000, han_luc: null });
    await dungCanChu('ct-n1', { muc: 'later', tao_luc: GIO - 5_000, han_luc: null });

    const k = await khoiCho(env.DB, CHU, WS, 'later', GIO);
    expect(k.items.map((t) => t.id)).toEqual(['ct-n1', 'ct-n2']);
  });

  it('ba khối chỉ gồm mục `Chờ`: mục đã xử lý và bỏ qua KHÔNG nằm trong khối nào', async () => {
    await dungCanChu('ct-cho', { muc: 'today' });
    await dungCanChu('ct-xong', { muc: 'today', trang_thai: 'resolved' });
    await dungCanChu('ct-bo', { muc: 'today', trang_thai: 'skipped' });

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items.map((t) => t.id)).toEqual(['ct-cho']);
  });

  it('keyset: cuộn qua hai pha bằng `cursor`, không bỏ sót và không trùng', async () => {
    await dungCanChu('ct-1', { muc: 'today', tao_luc: GIO, han_luc: GIO + 1_000 });
    await dungCanChu('ct-2', { muc: 'today', tao_luc: GIO, han_luc: GIO + 2_000 });
    await dungCanChu('ct-3', { muc: 'today', tao_luc: GIO - 2_000, han_luc: null });
    await dungCanChu('ct-4', { muc: 'today', tao_luc: GIO - 1_000, han_luc: null });

    const thay: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      const trang = await khoiCho(env.DB, CHU, WS, 'today', GIO, { limit: 1, cursor });
      thay.push(...trang.items.map((t) => t.id));
      if (trang.cursor_sau === null) break;
      cursor = trang.cursor_sau;
    }
    expect(thay).toEqual(['ct-1', 'ct-2', 'ct-3', 'ct-4']);
  });
});

/* ================================================================== *
 * B. "quá hạn X giờ" — d.249, 19.8
 * ================================================================== */

describe('d.249 — "quá hạn X giờ" tính ở SERVER', () => {
  const GIO_MS = 3_600_000;

  it('đúng số giờ, làm tròn LÊN (#77)', () => {
    expect(gioQuaHan(GIO - 3 * GIO_MS, GIO)).toBe(3);
    // 3 giờ 30 phút ⇒ 4, không 3: xem `gioQuaHan`.
    expect(gioQuaHan(GIO - 3.5 * GIO_MS, GIO)).toBe(4);
    // Quá hạn 5 phút ⇒ 1, **không 0**: "quá hạn 0 giờ" là một thẻ nói sai.
    expect(gioQuaHan(GIO - 5 * 60_000, GIO)).toBe(1);
  });

  it('chưa quá hạn, hoặc không có hạn → `null`, không `0`', () => {
    expect(gioQuaHan(GIO + 1, GIO)).toBeNull();
    expect(gioQuaHan(GIO, GIO)).toBeNull();
    expect(gioQuaHan(null, GIO)).toBeNull();
  });

  it('thẻ mang đúng con số, không để phần 6 tự tính', async () => {
    await dungCanChu('ct-qh', { muc: 'urgent', loai: 'run_command', han_luc: GIO - 2 * GIO_MS });
    const k = await khoiCho(env.DB, CHU, WS, 'urgent', GIO);
    expect(k.items[0]?.qua_han).toBe(true);
    expect(k.items[0]?.qua_han_gio).toBe(2);
  });

  it('mục 14 d.412 — thân mang `bay_gio` để giao diện viết được chữ TƯƠNG ĐỐI', async () => {
    /*
     * d.412 đòi thời gian hiện dạng tương đối ("12 phút trước"). Chữ đó cần một
     * mốc "bây giờ", và mốc phải là **mốc máy chủ** — đúng cái đồng hồ đã tính
     * `qua_han` / `qua_han_gio` ngay trên cùng một thẻ. Để giao diện tự đọc
     * `Date.now()` là đặt một đồng hồ thứ hai cạnh thẻ: một máy lệch giờ sẽ hiện
     * "trong 2 giờ" cạnh nhãn "quá hạn 3 giờ".
     */
    await dungCanChu('ct-bg', { muc: 'urgent', han_luc: GIO + 2 * GIO_MS });
    const mh = await manHinhCanChu(env.DB, CHU, WS, GIO);
    expect(mh.bay_gio).toBe(GIO);
    // Và là mốc **truyền vào**, không một `Date.now()` ẩn trong thân hàm.
    const mh2 = await manHinhCanChu(env.DB, CHU, WS, GIO + 5 * GIO_MS);
    expect(mh2.bay_gio).toBe(GIO + 5 * GIO_MS);
  });

  it('19.8: quá hạn KHÔNG đổi mức — mục vẫn ở đúng khối của nó', async () => {
    await dungCanChu('ct-l-qh', { muc: 'later', han_luc: GIO - 99 * GIO_MS });
    const mh = await manHinhCanChu(env.DB, CHU, WS, GIO);
    expect(mh.khoi[0]?.items).toHaveLength(0);
    expect(mh.khoi[2]?.items.map((t) => t.id)).toEqual(['ct-l-qh']);
  });
});

/* ================================================================== *
 * C. d.248 — huy hiệu đếm, màu theo MỨC CAO NHẤT
 * ================================================================== */

describe('d.248 — huy hiệu đếm số `Chờ`, màu theo mức cao nhất', () => {
  it('đếm đúng số mục `Chờ`, và mức cao nhất là mức CÓ MỤC cao nhất', async () => {
    await dungCanChu('ct-t1', { muc: 'today' });
    await dungCanChu('ct-t2', { muc: 'today' });
    await dungCanChu('ct-l1', { muc: 'later' });

    const h = await huyHieuCanChu(env.DB, CHU, WS);
    expect(h.so_cho).toBe(3);
    expect(h.muc_cao_nhat).toBe('today');
    expect(h.so_theo_muc).toEqual({ urgent: 0, today: 2, later: 1 });
  });

  it('có một mục 🔴 thì màu là 🔴, dù 🟡 và ⚪ nhiều hơn', async () => {
    await dungCanChu('ct-u1', { muc: 'urgent', loai: 'run_command' });
    await dungCanChu('ct-t1', { muc: 'today' });
    await dungCanChu('ct-t2', { muc: 'today' });
    await dungCanChu('ct-l1', { muc: 'later' });

    const h = await huyHieuCanChu(env.DB, CHU, WS);
    expect(h.so_cho).toBe(4);
    expect(h.muc_cao_nhat).toBe('urgent');
  });

  it('CA BIÊN: KHÔNG còn mục `Chờ` nào → `so_cho` 0 và `muc_cao_nhat` **null**', async () => {
    await dungCanChu('ct-xong', { muc: 'urgent', trang_thai: 'resolved' });
    await dungCanChu('ct-bo', { muc: 'urgent', trang_thai: 'skipped' });

    const h = await huyHieuCanChu(env.DB, CHU, WS);
    expect(h.so_cho).toBe(0);
    // `null`, không `'later'`: phần 6 không được dựng một huy hiệu ⚪ số 0.
    expect(h.muc_cao_nhat).toBeNull();
    expect(h.so_theo_muc).toEqual({ urgent: 0, today: 0, later: 0 });
  });

  it('`mucCaoNhat` là hàm thuần, và tập rỗng → null', () => {
    expect(mucCaoNhat([])).toBeNull();
    expect(mucCaoNhat(['later', 'urgent', 'today'])).toBe('urgent');
    expect(mucCaoNhat(['later', 'today'])).toBe('today');
    expect(mucCaoNhat(['later'])).toBe('later');
  });

  it('huy hiệu đi theo BỘ LỌC đang bật (d.252), không đếm cả workspace', async () => {
    await dungCanChu('ct-sai', { muc: 'urgent', project_id: P });
    await dungCanChu('ct-cos', { muc: 'today', project_id: P2 });

    const h = await huyHieuCanChu(env.DB, CHU, WS, { project_id: P2 });
    expect(h.so_cho).toBe(1);
    expect(h.muc_cao_nhat).toBe('today');
  });
});

/* ================================================================== *
 * D. d.250 — mỗi thẻ hiện ĐỦ
 * ================================================================== */

describe('d.250 — thẻ mang đủ mọi vế của câu đó', () => {
  it('`decision`: phương án thành danh sách, và biết phương án nào là ĐỀ XUẤT', async () => {
    await dungCanChu('ct-d', { muc: 'today', loai: 'decision', project_id: P });
    await env.DB.prepare(
      `INSERT INTO can_chu_phuong_an
         (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
       VALUES ('pa-a', ?, 'ct-d', 'A', 'Dùng D1', 0, 1, 1),
              ('pa-b', ?, 'ct-d', 'B', 'Dùng Postgres', 1, 2, 1)`,
    )
      .bind(WS, WS)
      .run();

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    const t = k.items[0]!;
    expect(t.phuong_an.map((p) => [p.nhan, p.noi_dung, p.de_xuat])).toEqual([
      ['A', 'Dùng D1', false],
      ['B', 'Dùng Postgres', true],
    ]);
    expect(t.phuong_an_de_xuat_id).toBe('pa-b');
  });

  it('`run_command`: lệnh và cờ cần TTY ra tới thẻ (d.237)', async () => {
    await dungCanChu('ct-r', { muc: 'today', loai: 'run_command' });
    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items[0]?.lenh).toBe('npm test');
    expect(k.items[0]?.can_tty).toBe(false);
  });

  it('`review`: file và link ra tới thẻ (d.238)', async () => {
    await dungCanChu('ct-v', { muc: 'today', loai: 'review' });
    await env.DB.prepare(
      `INSERT INTO can_chu_file (id, workspace_id, can_chu_id, loai, dia_chi, thu_tu, tao_luc)
       VALUES ('f-1', ?, 'ct-v', 'file', '/srv/a.md', 1, 1),
              ('f-2', ?, 'ct-v', 'link', 'https://x.test/b', 2, 1)`,
    )
      .bind(WS, WS)
      .run();

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items[0]?.file).toEqual([
      { loai: 'file', dia_chi: '/srv/a.md', thu_tu: 1 },
      { loai: 'link', dia_chi: 'https://x.test/b', thu_tu: 2 },
    ]);
  });

  it('DỰ ÁN của thẻ: tên và mã, không chỉ một id', async () => {
    await dungCanChu('ct-p', { muc: 'today', project_id: P2 });
    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items[0]?.du_an).toEqual({ id: P2, ten: 'Chief of Staff', ma: 'COS' });
  });

  it('mục **Chung** (19.12 câu 4): `du_an` là `null`, không một dự án tên "Chung"', async () => {
    await dungCanChu('ct-chung', { muc: 'today', project_id: null });
    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items[0]?.project_id).toBeNull();
    expect(k.items[0]?.du_an).toBeNull();
  });

  it('TICKET LIÊN QUAN ra tới thẻ, kèm mã ticket dựng được link (d.240)', async () => {
    await dungTicket(P, 7, 'Việc liên quan');
    await dungCanChu('ct-tk', { muc: 'today', project_id: P });
    await env.DB.prepare(
      `INSERT INTO can_chu_ticket (workspace_id, can_chu_id, ticket_id, tao_luc)
       VALUES (?, 'ct-tk', ?, 1)`,
    )
      .bind(WS, `tk-${P}-7`)
      .run();

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items[0]?.ticket_lien_quan).toEqual([
      { id: `tk-${P}-7`, ma: 'SAI-7', tieu_de: 'Việc liên quan' },
    ]);
  });

  it('một trang nhiều thẻ vẫn là MỘT lô truy vấn: mỗi thẻ nhận đúng dữ liệu của nó', async () => {
    await dungCanChu('ct-x', { muc: 'today', loai: 'run_command', tao_luc: GIO - 2_000 });
    await dungCanChu('ct-y', { muc: 'today', loai: 'review', tao_luc: GIO - 1_000 });
    await env.DB.prepare(
      `INSERT INTO can_chu_file (id, workspace_id, can_chu_id, loai, dia_chi, thu_tu, tao_luc)
       VALUES ('f-y', ?, 'ct-y', 'file', '/srv/y.md', 1, 1)`,
    )
      .bind(WS)
      .run();

    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO);
    expect(k.items.map((t) => t.id)).toEqual(['ct-x', 'ct-y']);
    expect(k.items[0]?.file).toEqual([]);
    expect(k.items[1]?.file).toHaveLength(1);
  });
});

/* ================================================================== *
 * E. d.252 — lọc theo DỰ ÁN, theo LOẠI
 * ================================================================== */

describe('d.252 — lọc theo dự án và theo loại', () => {
  beforeEach(async () => {
    await dungCanChu('ct-sai-d', { muc: 'today', project_id: P, loai: 'decision' });
    await dungCanChu('ct-sai-f', { muc: 'today', project_id: P, loai: 'fyi' });
    await dungCanChu('ct-cos-f', { muc: 'today', project_id: P2, loai: 'fyi' });
    await dungCanChu('ct-chung-f', { muc: 'today', project_id: null, loai: 'fyi' });
  });

  it('lọc theo dự án', async () => {
    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO, { project_id: P2 });
    expect(k.items.map((t) => t.id)).toEqual(['ct-cos-f']);
  });

  it('`project_id=chung` lọc lấy mục **Chung** (19.12 câu 4)', async () => {
    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO, { project_id: 'chung' });
    expect(k.items.map((t) => t.id)).toEqual(['ct-chung-f']);
  });

  it('lọc theo loại', async () => {
    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO, { loai: 'decision' });
    expect(k.items.map((t) => t.id)).toEqual(['ct-sai-d']);
  });

  it('hai bộ lọc cộng nhau (dự án VÀ loại)', async () => {
    const k = await khoiCho(env.DB, CHU, WS, 'today', GIO, { project_id: P, loai: 'fyi' });
    expect(k.items.map((t) => t.id)).toEqual(['ct-sai-f']);
  });

  it('loại LẠ → `INVALID_INPUT`, KHÔNG âm thầm trả rỗng', async () => {
    await expect(khoiCho(env.DB, CHU, WS, 'today', GIO, { loai: 'khong-co' })).rejects.toThrow(
      /decision/,
    );
    // Cả màn hình cũng vậy: kiểm **một lần, trước** mọi truy vấn.
    await expect(manHinhCanChu(env.DB, CHU, WS, GIO, { loai: 'xyz' })).rejects.toThrow();
  });
});

/* ================================================================== *
 * F. d.251 — bảng "Đã xử lý"
 * ================================================================== */

describe('d.251 — bảng "Đã xử lý": ngày, mã, tiêu đề ngắn, kết quả', () => {
  it('bốn cột của SPEC, và mới nhất trước', async () => {
    await dungCanChu('ct-1', { ma_so: 11, tieu_de: 'Chọn CSDL', trang_thai: 'resolved', tao_luc: GIO - 2_000 });
    await dungCanChu('ct-2', { ma_so: 12, tieu_de: 'Chạy migration', trang_thai: 'resolved', tao_luc: GIO - 1_000 });

    const b = await bangDaXuLy(env.DB, CHU, WS, GIO);
    expect(b.items.map((d) => d.ma)).toEqual(['T-12', 'T-11']);
    expect(b.items[0]).toMatchObject({
      ma: 'T-12',
      tieu_de_ngan: 'Chạy migration',
      ket_qua: 'đã xong (fixture)',
      trang_thai: 'resolved',
    });
    // "ngày" là ngày **trên tường**, dạng `YYYY-MM-DD`.
    expect(b.items[0]?.ngay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('mục `Bỏ qua` cũng xuống bảng này, và ô kết quả là LÝ DO bỏ qua', async () => {
    await dungCanChu('ct-bo', { trang_thai: 'skipped', tao_luc: GIO });
    const b = await bangDaXuLy(env.DB, CHU, WS, GIO);
    expect(b.items).toHaveLength(1);
    expect(b.items[0]).toMatchObject({
      trang_thai: 'skipped',
      ket_qua: 'không còn cần (fixture)',
    });
  });

  it('mục `Chờ` KHÔNG nằm trong bảng này', async () => {
    await dungCanChu('ct-cho', { tao_luc: GIO });
    expect((await bangDaXuLy(env.DB, CHU, WS, GIO)).items).toEqual([]);
  });

  it('"tiêu đề ngắn" cắt ở 80 ký tự, và tiêu đề đầy đủ vẫn ra', async () => {
    const dai = 'Đ'.repeat(200);
    await dungCanChu('ct-dai', { tieu_de: dai, trang_thai: 'resolved', tao_luc: GIO });
    const b = await bangDaXuLy(env.DB, CHU, WS, GIO);
    expect([...(b.items[0]?.tieu_de_ngan ?? '')].length).toBe(81);
    expect(b.items[0]?.tieu_de_ngan.endsWith('…')).toBe(true);
    expect(b.items[0]?.tieu_de).toBe(dai);
  });

  it('`tieuDeNgan` là hàm thuần: ngắn thì KHÔNG cắt, không thêm dấu …', () => {
    expect(tieuDeNgan('Ngắn')).toBe('Ngắn');
    expect([...tieuDeNgan('x'.repeat(80))].length).toBe(80);
    expect([...tieuDeNgan('x'.repeat(81))].length).toBe(81);
  });

  it('lọc theo DỰ ÁN (d.251)', async () => {
    await dungCanChu('ct-sai', { project_id: P, trang_thai: 'resolved', tao_luc: GIO - 1_000 });
    await dungCanChu('ct-cos', { project_id: P2, trang_thai: 'resolved', tao_luc: GIO });

    const b = await bangDaXuLy(env.DB, CHU, WS, GIO, { project_id: P });
    expect(b.items.map((d) => d.id)).toEqual(['ct-sai']);
  });

  it('lọc theo LOẠI cũng áp cho bảng này', async () => {
    await dungCanChu('ct-f', { loai: 'fyi', trang_thai: 'resolved', tao_luc: GIO - 1_000 });
    await dungCanChu('ct-r', { loai: 'run_command', trang_thai: 'resolved', tao_luc: GIO });

    const b = await bangDaXuLy(env.DB, CHU, WS, GIO, { loai: 'run_command' });
    expect(b.items.map((d) => d.id)).toEqual(['ct-r']);
  });

  it('mục 14 d.412 — thân bảng cũng mang `bay_gio`, và là mốc TRUYỀN VÀO', async () => {
    /*
     * Bảng Đã xử lý ở **cùng** màn hình Cần Chủ (d.251), nên d.412 áp cho ô thời
     * gian của nó y như cho hạn trên thẻ: chữ tương đối, đếm từ **một** đồng hồ —
     * đồng hồ máy chủ. Hai lần gọi với hai mốc để ghim rằng `bay_gio` đi vào từ
     * tham số, không một `Date.now()` ẩn trong thân hàm (nếu ẩn, ca này đỏ).
     */
    await dungCanChu('ct-bg-bang', { trang_thai: 'resolved', tao_luc: GIO - 1_000 });

    const b = await bangDaXuLy(env.DB, CHU, WS, GIO);
    expect(b.bay_gio).toBe(GIO);
    expect(b.items).toHaveLength(1);

    const b2 = await bangDaXuLy(env.DB, CHU, WS, GIO + 5 * 3_600_000);
    expect(b2.bay_gio).toBe(GIO + 5 * 3_600_000);
    // Mốc đổi thì **dữ liệu dòng không đổi**: `bay_gio` chỉ là mốc đọc.
    expect(b2.items.map((d) => d.xu_ly_luc)).toEqual(b.items.map((d) => d.xu_ly_luc));
  });

  it('keyset: cuộn hết bảng không bỏ sót, không trùng', async () => {
    for (let i = 1; i <= 4; i += 1) {
      await dungCanChu(`ct-${String(i)}`, { trang_thai: 'resolved', tao_luc: GIO - i * 1_000 });
    }
    const thay: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      const trang = await bangDaXuLy(env.DB, CHU, WS, GIO, { limit: 1, cursor });
      thay.push(...trang.items.map((d) => d.id));
      if (trang.cursor_sau === null) break;
      cursor = trang.cursor_sau;
    }
    expect(thay).toEqual(['ct-1', 'ct-2', 'ct-3', 'ct-4']);
  });
});

/* ================================================================== *
 * G. d.251 + 19.12 câu 60 — "khoảng ngày" là ngày TRÊN TƯỜNG (UTC+7)
 * ================================================================== */

describe('d.251 + 19.12 câu 60 — lọc theo khoảng ngày, theo UTC+7', () => {
  /** 2026-10-04 23:30 **giờ Việt Nam** = 2026-10-04T16:30:00Z. */
  const SOM_04 = Date.UTC(2026, 9, 4, 16, 30);
  /** 2026-10-05 00:30 **giờ Việt Nam** = 2026-10-04T17:30:00Z — UTC vẫn là ngày 04. */
  const SOM_05 = Date.UTC(2026, 9, 4, 17, 30);

  beforeEach(async () => {
    await dungCanChu('ct-04', { tieu_de: 'Cuối ngày 04', trang_thai: 'resolved', tao_luc: SOM_04 });
    await dungCanChu('ct-05', { tieu_de: 'Đầu ngày 05', trang_thai: 'resolved', tao_luc: SOM_05 });
  });

  it('`ngay` của dòng là ngày TRÊN TƯỜNG, không ngày UTC', async () => {
    const b = await bangDaXuLy(env.DB, CHU, WS, GIO);
    const theo_id = new Map(b.items.map((d) => [d.id, d.ngay]));
    expect(theo_id.get('ct-04')).toBe('2026-10-04');
    // Nếu tính theo UTC thì dòng này cũng là `2026-10-04` — đúng chỗ ca này đo.
    expect(theo_id.get('ct-05')).toBe('2026-10-05');
  });

  it('lọc ngày 04 → CHỈ mục của ngày 04 trên tường', async () => {
    const b = await bangDaXuLy(env.DB, CHU, WS, GIO, { tu_ngay: '2026-10-04', den_ngay: '2026-10-04' });
    expect(b.items.map((d) => d.id)).toEqual(['ct-04']);
  });

  it('lọc ngày 05 → CHỈ mục của ngày 05 trên tường', async () => {
    const b = await bangDaXuLy(env.DB, CHU, WS, GIO, { tu_ngay: '2026-10-05', den_ngay: '2026-10-05' });
    expect(b.items.map((d) => d.id)).toEqual(['ct-05']);
  });

  it('CA BIÊN đầu khoảng: đúng 00:00:00.000 giờ địa phương thì VÀO khoảng', async () => {
    const nua_dem = nuaDemCuaNgay('2026-10-06')!;
    await dungCanChu('ct-bien-dau', { trang_thai: 'resolved', tao_luc: nua_dem });
    await dungCanChu('ct-truoc-bien', { trang_thai: 'resolved', tao_luc: nua_dem - 1 });

    const b = await bangDaXuLy(env.DB, CHU, WS, GIO, { tu_ngay: '2026-10-06', den_ngay: '2026-10-06' });
    expect(b.items.map((d) => d.id)).toEqual(['ct-bien-dau']);
  });

  it('CA BIÊN cuối khoảng: 23:59:59.999 VÀO, nửa đêm hôm sau RA', async () => {
    const nua_dem_07 = nuaDemCuaNgay('2026-10-07')!;
    await dungCanChu('ct-cuoi-06', { trang_thai: 'resolved', tao_luc: nua_dem_07 - 1 });
    await dungCanChu('ct-dau-07', { trang_thai: 'resolved', tao_luc: nua_dem_07 });

    const b = await bangDaXuLy(env.DB, CHU, WS, GIO, { tu_ngay: '2026-10-06', den_ngay: '2026-10-06' });
    expect(b.items.map((d) => d.id)).toEqual(['ct-cuoi-06']);
  });

  it('chỉ `tu_ngay`, hoặc chỉ `den_ngay`, cũng dùng được', async () => {
    const chi_tu = await bangDaXuLy(env.DB, CHU, WS, GIO, { tu_ngay: '2026-10-05' });
    expect(chi_tu.items.map((d) => d.id)).toEqual(['ct-05']);
    const chi_den = await bangDaXuLy(env.DB, CHU, WS, GIO, { den_ngay: '2026-10-04' });
    expect(chi_den.items.map((d) => d.id)).toEqual(['ct-04']);
  });

  it('ngày sai dạng → `INVALID_INPUT`, KHÔNG âm thầm bỏ bộ lọc', async () => {
    await expect(bangDaXuLy(env.DB, CHU, WS, GIO, { tu_ngay: '04/10/2026' })).rejects.toThrow(
      /YYYY-MM-DD/,
    );
    // Ngày **không có thật** cũng bị từ chối, không "tràn" sang ngày khác.
    await expect(bangDaXuLy(env.DB, CHU, WS, GIO, { tu_ngay: '2026-02-31' })).rejects.toThrow();
  });

  it('`nuaDemCuaNgay` / `khoangNgay`: số học thuần, khớp độ lệch UTC+7 duy nhất', () => {
    expect(MUI_GIO_CHU_PHUT).toBe(420);
    expect(nuaDemCuaNgay('2026-10-05')).toBe(Date.UTC(2026, 9, 5) - 420 * 60_000);
    const k = khoangNgay('2026-10-05', '2026-10-05');
    expect(k.den! - k.tu!).toBe(86_400_000);
    expect(nuaDemCuaNgay('khong-phai-ngay')).toBeNull();
  });
});

/* ================================================================== *
 * H. 19.12 câu 61 — tầm nhìn: chủ + CẢ BỐN vai
 * ================================================================== */

describe('19.12 câu 61 — tầm nhìn của lớp "Chung" rẽ theo VAI', () => {
  const AG = 'ag-1';

  beforeEach(async () => {
    await dungAgent(AG, 'A-1', 'coordinator');
    await dungCanChu('ct-sai', { muc: 'today', project_id: P, tao_luc: GIO - 3_000 });
    await dungCanChu('ct-cos', { muc: 'today', project_id: P2, tao_luc: GIO - 2_000 });
    await dungCanChu('ct-chung-toi', {
      muc: 'today',
      project_id: null,
      tao_boi_agent_id: AG,
      tao_luc: GIO - 1_000,
    });
    await dungCanChu('ct-chung-chu', { muc: 'today', project_id: null, tao_luc: GIO });
  });

  async function thay(ai: Parameters<typeof khoiCho>[1]): Promise<string[]> {
    const k = await khoiCho(env.DB, ai, WS, 'today', GIO);
    return k.items.map((t) => t.id);
  }

  it('CHỦ thấy mọi mục — mục của mọi dự án và mọi mục Chung', async () => {
    expect(await thay(CHU)).toEqual(['ct-sai', 'ct-cos', 'ct-chung-toi', 'ct-chung-chu']);
  });

  it('`coordinator` đọc MỌI mục Chung, kể cả mục do CHỦ ghi', async () => {
    await choVaoDuAn(AG, P);
    expect(await thay(aiAgent('coordinator', { agent_id: AG, du_an_duoc_vao: [P] }))).toEqual([
      'ct-sai',
      'ct-chung-toi',
      'ct-chung-chu',
    ]);
  });

  it('`coordinator` KHÔNG bật cờ "mọi dự án" vẫn đọc mọi mục Chung (câu 61)', async () => {
    const ds = await thay(aiAgent('coordinator', { agent_id: AG, du_an_duoc_vao: [] }));
    expect(ds).toEqual(['ct-chung-toi', 'ct-chung-chu']);
  });

  it('`manager` CHỈ đọc mục Chung do CHÍNH MÌNH tạo', async () => {
    await choVaoDuAn(AG, P2);
    const ds = await thay(aiAgent('manager', { agent_id: AG, du_an_duoc_vao: [P2] }));
    expect(ds).toEqual(['ct-cos', 'ct-chung-toi']);
    expect(ds).not.toContain('ct-chung-chu');
  });

  it('`worker` KHÔNG đọc mục Chung nào', async () => {
    await choVaoDuAn(AG, P);
    const ds = await thay(aiAgent('worker', { agent_id: AG, du_an_duoc_vao: [P] }));
    expect(ds).toEqual(['ct-sai']);
  });

  it('`reviewer` KHÔNG đọc mục Chung nào', async () => {
    await choVaoDuAn(AG, P);
    const ds = await thay(aiAgent('reviewer', { agent_id: AG, du_an_duoc_vao: [P] }));
    expect(ds).toEqual(['ct-sai']);
  });

  it('tầm nhìn áp cho CẢ huy hiệu và CẢ bảng "Đã xử lý", không chỉ ba khối', async () => {
    const ai = aiAgent('worker', { agent_id: AG, du_an_duoc_vao: [] });
    const h = await huyHieuCanChu(env.DB, ai, WS);
    // `worker` không vào dự án nào và không đọc mục Chung ⇒ huy hiệu rỗng.
    expect(h.so_cho).toBe(0);
    expect(h.muc_cao_nhat).toBeNull();

    await dungCanChu('ct-xong-chung', { project_id: null, trang_thai: 'resolved', tao_luc: GIO });
    const b = await bangDaXuLy(env.DB, ai, WS, GIO);
    expect(b.items).toEqual([]);
    // Đối chứng dương: chủ **thấy** đúng dòng đó.
    expect((await bangDaXuLy(env.DB, CHU, WS, GIO)).items.map((d) => d.id)).toEqual(['ct-xong-chung']);
  });
});

/* ================================================================== *
 * I. Đường HTTP — ba route của màn hình
 * ================================================================== */

describe('đường HTTP của màn hình Cần Chủ', () => {
  beforeEach(async () => {
    await dungCanChu('ct-cho', { muc: 'today', project_id: P, tieu_de: 'Còn chờ' });
    await dungCanChu('ct-xong', {
      muc: 'today',
      project_id: P,
      tieu_de: 'Đã xong',
      trang_thai: 'resolved',
      tao_luc: GIO,
    });
  });

  it('`GET /v1/can-chu` trả huy hiệu + ba khối', async () => {
    const r = await goiApi('/v1/can-chu', TOKEN_CHU);
    expect(r.status).toBe(200);
    const b = await r.json<{
      huy_hieu: { so_cho: number; muc_cao_nhat: string | null };
      khoi: { muc: string; items: { id: string }[] }[];
    }>();
    expect(b.huy_hieu).toMatchObject({ so_cho: 1, muc_cao_nhat: 'today' });
    expect(b.khoi.map((k) => k.muc)).toEqual(['urgent', 'today', 'later']);
    expect(b.khoi[1]?.items.map((t) => t.id)).toEqual(['ct-cho']);
  });

  /**
   * **Thứ tự khai route là một luật ở đây, không một chi tiết.** `GET
   * /v1/can-chu/:id` (lượt 3a) khớp **mọi** một đoạn, nên nếu nó đứng trước thì
   * `/v1/can-chu/da-xu-ly` bị nó nuốt và trả `NOT_FOUND` cho mã `"da-xu-ly"`.
   */
  it('`GET /v1/can-chu/da-xu-ly` KHÔNG bị route `:id` nuốt', async () => {
    const r = await goiApi('/v1/can-chu/da-xu-ly', TOKEN_CHU);
    expect(r.status).toBe(200);
    const b = await r.json<{ items: { ma: string; tieu_de_ngan: string }[] }>();
    expect(b.items.map((d) => d.tieu_de_ngan)).toEqual(['Đã xong']);
  });

  it('`GET /v1/can-chu/da-xu-ly?tu_ngay=&den_ngay=` lọc theo khoảng ngày', async () => {
    const r = await goiApi('/v1/can-chu/da-xu-ly?tu_ngay=1999-01-01&den_ngay=1999-01-02', TOKEN_CHU);
    expect(r.status).toBe(200);
    expect((await r.json<{ items: unknown[] }>()).items).toEqual([]);
  });

  it('`GET /v1/can-chu/da-xu-ly` với ngày sai dạng → 422 `INVALID_INPUT`', async () => {
    const r = await goiApi('/v1/can-chu/da-xu-ly?tu_ngay=hom-qua', TOKEN_CHU);
    expect(r.status).toBe(422);
    expect(await r.json<{ error: string }>()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('`GET /v1/can-chu/khoi/:muc` cuộn một khối; mức lạ → 422', async () => {
    const r = await goiApi('/v1/can-chu/khoi/today', TOKEN_CHU);
    expect(r.status).toBe(200);
    const b = await r.json<{ items: { id: string }[] }>();
    expect(b.items.map((t) => t.id)).toEqual(['ct-cho']);

    const sai = await goiApi('/v1/can-chu/khoi/rat-gap', TOKEN_CHU);
    expect(sai.status).toBe(422);
  });

  it('route `:id` của lượt 3a vẫn hoạt động bình thường (không bị route mới chắn)', async () => {
    const r = await goiApi('/v1/can-chu/ct-cho', TOKEN_CHU);
    expect(r.status).toBe(200);
    expect(await r.json<{ id: string }>()).toMatchObject({ id: 'ct-cho' });
  });
});

/* ================================================================== *
 * J. EXPLAIN QUERY PLAN — đo CHÍNH CÂU SẢN PHẨM
 * ================================================================== */

describe('EXPLAIN QUERY PLAN — không quét bảng, không sắp bằng B-tree tạm', () => {
  async function keHoach(cau: { sql: string; bind: (string | number)[] }): Promise<string> {
    const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${cau.sql}`)
      .bind(...cau.bind)
      .all<{ detail: string }>();
    return results.map((r) => r.detail).join(' | ');
  }

  /** Mọi đường đọc của màn hình phải đi index và không sắp lại trong bộ nhớ. */
  function dat(kh: string, index: string): void {
    expect(kh).toContain(index);
    expect(kh).not.toContain('TEMP B-TREE');
    expect(kh).not.toContain('SCAN can_chu');
  }

  it('khối, pha "có hạn" → `ix_can_chu_khoi`, không TEMP B-TREE', async () => {
    const kh = await keHoach(cauKhoiCho(CHU, WS, 'today', {}, 'co_han', null, 50));
    dat(kh, 'ix_can_chu_khoi');
  });

  it('khối, pha "không hạn" → cũng `ix_can_chu_khoi`', async () => {
    const kh = await keHoach(cauKhoiCho(CHU, WS, 'today', {}, 'khong_han', null, 50));
    dat(kh, 'ix_can_chu_khoi');
  });

  it('khối, trang sau (có cursor) vẫn đi index', async () => {
    const kh = await keHoach(
      cauKhoiCho(CHU, WS, 'today', {}, 'co_han', [GIO, GIO, 'ct-x'], 50),
    );
    dat(kh, 'ix_can_chu_khoi');
  });

  it('khối, có bộ lọc dự án + loại vẫn đi index (lọc là vế sau, không thêm B-tree)', async () => {
    const kh = await keHoach(
      cauKhoiCho(CHU, WS, 'today', { project_id: P, loai: 'fyi' }, 'co_han', null, 50),
    );
    dat(kh, 'ix_can_chu_khoi');
  });

  it('huy hiệu: `GROUP BY muc` chạy trên thứ tự index, không B-tree tạm', async () => {
    const kh = await keHoach(cauHuyHieu(CHU, WS, {}));
    dat(kh, 'ix_can_chu_khoi');
  });

  it('bảng "Đã xử lý" → `ix_can_chu_da_xu_ly` (0016), không TEMP B-TREE', async () => {
    const kh = await keHoach(cauDaXuLy(CHU, WS, {}, { tu: null, den: null }, null, 50));
    dat(kh, 'ix_can_chu_da_xu_ly');
  });

  it('bảng "Đã xử lý" có khoảng ngày + cursor vẫn đi đúng index', async () => {
    const kh = await keHoach(
      cauDaXuLy(CHU, WS, {}, { tu: GIO - 86_400_000, den: GIO }, [GIO, 'ct-x'], 50),
    );
    dat(kh, 'ix_can_chu_da_xu_ly');
  });

  /**
   * **Nợ reviewer lượt 3a.** `asksVuaXuLy` lọc `tao_boi_agent_id` + một **bất đẳng
   * thức** trên `trang_thai`, nên `ix_can_chu_khoi` chỉ dùng được vế `workspace_id`
   * ⇒ quét toàn bộ mục của workspace ở **mọi** lần `tasks`/`heartbeat`. 0016 thêm
   * `ix_can_chu_asks`, và ca này đo **chính câu sản phẩm**.
   */
  it('`resolved_asks` → `ix_can_chu_asks` (0016), không quét bảng', async () => {
    const kh = await keHoach(cauAsksVuaXuLy(aiAgent('manager', { agent_id: 'ag-1' }), WS, GIO));
    dat(kh, 'ix_can_chu_asks');
  });

  it('`resolved_asks` của một `coordinator` (tầm nhìn khác) vẫn đi đúng index', async () => {
    const kh = await keHoach(
      cauAsksVuaXuLy(aiAgent('coordinator', { agent_id: 'ag-1' }), WS, GIO),
    );
    dat(kh, 'ix_can_chu_asks');
  });
});
