/**
 * **Cần Chủ — đường XỬ LÝ.** SPEC mục 8 (d.240, d.243–246, d.261, d.278–281),
 * 19.6 (d.516), 19.9 (d.537–542), 19.10 (d.553), 19.11 (d.560), 19.12 câu 4.
 *
 * Mỗi luật của SPEC mà lượt này chạm tới có **một ca**, và những luật có ranh
 * giới thì có cả **ca đối chứng**:
 *   * ba việc của d.278–281 là **nguyên tử** (một chặng hỏng ⇒ không chặng nào ghi);
 *   * cặp **vào–ra** của phiên, và **mốc** ngưỡng đứng tính lại (19.6 d.516);
 *   * 19.11 d.560: phiên đã `closed`, agent đã `disabled`;
 *   * **mỗi loại** một ca kết quả mặc định (19.9 d.539);
 *   * `decision` trỏ một nhãn **không có thật**;
 *   * mở lại rồi xử lý lần hai ⇒ **dòng thứ hai**, dòng cũ **nguyên vẹn**;
 *   * **cả bốn** vai agent → 403.
 *
 * Không có ở đây, có chủ ý: `resolved_asks` (d.268) và `baton result [--wait]`
 * (d.267, d.376) nằm ở `test/ket-qua-can-chu.test.ts` (lượt 3a); đường **đọc** 3
 * khối (d.248–252) là lượt 3b.
 */

import { afterEach, describe, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  BatonError,
  CAU_DECISION_CAN_PHUONG_AN_HOAC_CHU,
  KET_QUA_MAC_DINH,
  NHAN_KET_LUAN_REVIEW_MUC,
  TRANG_THAI_PHIEN,
  batBuocMoLaiDuoc,
  batBuocXuLyDuoc,
  cauBinhLuanBoQua,
  cauBinhLuanDaXuLy,
  cauBinhLuanMoLai,
  cauKetQuaDecision,
  kiemKetQuaXuLy,
  quyen,
  trangThaiPhienDanXuat,
  type TrangThaiPhien,
} from '@baton/shared';
import { SO_DANG_KY_HANDLER } from '../src/lenh.js';
import { maSoTuChu } from '../src/lenh-xu-ly-can-chu.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  aiAgent,
  binhLuanCuaTicket,
  canChuCuaPhien,
  canChuTrongDb,
  dungAgentCoToken,
  dungCanChu,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
  nhatKyTheoThuTu,
  phienTrongDb,
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

const T_COORD = 'bt_xl_coordinator';
const T_MANAGER = 'bt_xl_manager';
const T_WORKER = 'bt_xl_worker';
const T_REVIEWER = 'bt_xl_reviewer';

let PJ = '';
let TK = '';
let TK2 = '';

type Than = Record<string, unknown>;
function than(r: Response): Promise<Than> {
  return r.json<Than>();
}

beforeEach(async () => {
  for (const b of [
    'nhat_ky_can_cu',
    'nhat_ky',
    'can_chu_ticket',
    'can_chu_file',
    'can_chu_phuong_an',
    'phien_hoat_dong',
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
  TK = await dungTicket(PJ, 1, 'Việc một');
  TK2 = await dungTicket(PJ, 2, 'Việc hai');

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
});

/**
 * Bắt lỗi của một luật **thuần** rồi trả chính `BatonError` đó.
 *
 * Có hàm này để mỗi ca dưới đây giữ được assertion **mã lỗi cụ thể** — mã ở
 * từng ca là một quyết định SPEC có chủ ý (vd `OPTIONS_REQUIRED` chứ không
 * `INVALID_INPUT` cho ca "nhãn không khớp phương án nào") — mà không phải
 * mượn `expect.objectContaining`, thứ cho ra `any`. Hàm **không** ném thì ca
 * đỏ, chứ không im lặng đi qua.
 */
function loiKhiNem(chay: () => unknown): BatonError {
  try {
    chay();
  } catch (loi) {
    expect(BatonError.la(loi)).toBe(true);
    return loi as BatonError;
  }
  throw new Error('Hàm KHÔNG ném lỗi nào, trong khi ca này chờ một mã lỗi.');
}

/** Chỉ lấy **mã** của lỗi mà một luật thuần ném ra. */
function maKhiNem(chay: () => unknown): string {
  return loiKhiNem(chay).ma;
}

/**
 * Trạng thái phiên **đọc từ DB** (`string`) hẹp về `TrangThaiPhien`.
 *
 * Có hàm này để ca "`waiting_owner` không bao giờ bị tính đứng" truyền được
 * **giá trị thật của dòng DB** vào `trangThaiPhienDanXuat` — viết tay
 * `'waiting_owner'` thì ca đó đo một dòng dựng tay, trái đúng lời khai của nó.
 * Giá trị lạ thì **ném**, chứ không ép kiểu im lặng.
 */
function trangThaiPhienTuDb(chu: string): TrangThaiPhien {
  if (!(chu in TRANG_THAI_PHIEN)) {
    throw new Error(`Trạng thái phiên lạ trong DB: ${chu}`);
  }
  return chu as TrangThaiPhien;
}

/** Nối một ticket vào một mục (bảng `can_chu_ticket` của 0013). */
async function noiTicket(can_chu_id: string, ticket_id: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO can_chu_ticket (workspace_id, can_chu_id, ticket_id, tao_luc) VALUES (?, ?, ?, ?)',
  )
    .bind(WS, can_chu_id, ticket_id, Date.now())
    .run();
}

/** Tạo một mục `decision` **qua cửa ghi**, để nó có phương án thật. */
async function taoDecision(tuy_chon: { ticket?: string[] } = {}): Promise<Than> {
  const res = await goiApi('/v1/can-chu', TOKEN_CHU, {
    method: 'POST',
    than: {
      tieu_de: 'Chọn CSDL',
      muc: 'today',
      loai: 'decision',
      project_id: PJ,
      phuong_an: [
        { noi_dung: 'Dùng D1', de_xuat: true },
        { noi_dung: 'Dùng Postgres' },
      ],
      ly_do_de_xuat: 'Đã có sẵn trong Workers',
      ...(tuy_chon.ticket === undefined ? {} : { ticket_lien_quan: tuy_chon.ticket }),
    },
  });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return than(res);
}

/* ================================================================== *
 * 1. Luật THUẦN — 19.9 d.538–539, mục 8 d.244, d.261
 * ================================================================== */

describe('19.9 d.539 — kết quả mặc định theo loại (luật thuần)', () => {
  it('`run_command` để trống → "đã chạy"', () => {
    expect(kiemKetQuaXuLy('run_command', {})).toEqual({
      loai: 'run_command',
      ket_qua: 'đã chạy',
    });
  });

  it('`review` để trống (Đạt) → "đã xem"', () => {
    expect(kiemKetQuaXuLy('review', { ket_luan: 'dat' })).toEqual({
      loai: 'review',
      ket_luan: 'dat',
      ket_qua: 'đã xem',
    });
  });

  it('`fyi` để trống → "đã đọc"', () => {
    expect(kiemKetQuaXuLy('fyi', {})).toEqual({ loai: 'fyi', ket_qua: 'đã đọc' });
  });

  it('`decision` KHÔNG có mặc định — bảng chỉ có đúng ba loại kia', () => {
    expect(Object.keys(KET_QUA_MAC_DINH).sort()).toEqual(['fyi', 'review', 'run_command']);
  });

  it('ĐỐI CHỨNG: có chữ ghi thêm thì mặc định KHÔNG áp', () => {
    expect(kiemKetQuaXuLy('fyi', { ghi_them: '  đã đọc kỹ  ' })).toEqual({
      loai: 'fyi',
      ket_qua: 'đã đọc kỹ',
    });
  });
});

describe('19.9 d.538 — `decision` bắt buộc chọn 1 phương án CÓ THẬT', () => {
  const CO_SAN = [
    { id: 'pa-a', nhan: 'A' },
    { id: 'pa-b', nhan: 'B' },
  ];

  it('không có GÌ CẢ (không phương án, không ghi thêm) → OPTIONS_REQUIRED', () => {
    expect(maKhiNem(() => kiemKetQuaXuLy('decision', {}, CO_SAN))).toBe('OPTIONS_REQUIRED');
    // Chuỗi rỗng / khoảng trắng cũng là "không có gì".
    expect(maKhiNem(() => kiemKetQuaXuLy('decision', { ghi_them: '   ' }, CO_SAN))).toBe(
      'OPTIONS_REQUIRED',
    );
    // Câu lỗi phải nói **cả hai** đường ra, không chỉ "chọn 1 phương án" — sau
    // #121 một câu chỉ nói vế đầu là bảo chủ làm đúng thứ chủ vừa từ chối.
    expect(loiKhiNem(() => kiemKetQuaXuLy('decision', {}, CO_SAN)).message).toBe(
      CAU_DECISION_CAN_PHUONG_AN_HOAC_CHU,
    );
  });

  it('#121 — KHÔNG phương án mà CÓ ghi thêm → hợp lệ, trả lời tự do', () => {
    /*
     * Chỗ **nới** so với chữ d.259/19.9 d.539, theo yêu cầu trực tiếp của chủ
     * 11/10; vế SPEC đỡ nó là d.244 ("phương án đã chọn **và/hoặc** chữ tự do").
     */
    expect(kiemKetQuaXuLy('decision', { ghi_them: ' làm trước tính năng ' }, CO_SAN)).toEqual({
      loai: 'decision',
      phuong_an_id: null,
      nhan: null,
      ket_qua: 'làm trước tính năng',
    });
  });

  it('#121 — câu kết quả của trả lời tự do là ĐÚNG chữ đó, không `", abc"`', () => {
    expect(cauKetQuaDecision(null, 'làm trước tính năng')).toBe('làm trước tính năng');
    // Cả hai rỗng thì không có gì ghi vào `ket_qua` ⇒ ném, không ra chuỗi rỗng
    // (một mục `resolved` không `ket_qua` vỡ trigger của 0015).
    expect(maKhiNem(() => cauKetQuaDecision(null, null))).toBe('OPTIONS_REQUIRED');
  });

  it('nhãn KHÔNG khớp phương án nào → OPTIONS_REQUIRED (không phải INVALID_INPUT)', () => {
    expect(maKhiNem(() => kiemKetQuaXuLy('decision', { phuong_an: 'C' }, CO_SAN))).toBe(
      'OPTIONS_REQUIRED',
    );
    /*
     * **#121 không nới ca này**, kể cả khi có ghi thêm: gửi một nhãn là **định**
     * chọn một phương án, nên gõ sai nhãn vẫn phải đỏ. Biến nó thành một câu trả
     * lời tự do `"Z"` là âm thầm áp sai một quyết định của chủ.
     */
    expect(
      maKhiNem(() => kiemKetQuaXuLy('decision', { phuong_an: 'Z', ghi_them: 'ngưỡng 500' }, CO_SAN)),
    ).toBe('OPTIONS_REQUIRED');
  });

  it('chọn đúng nhãn → trả **khoá thật**, không chữ "A" rời', () => {
    expect(kiemKetQuaXuLy('decision', { phuong_an: 'B' }, CO_SAN)).toEqual({
      loai: 'decision',
      phuong_an_id: 'pa-b',
      nhan: 'B',
      ket_qua: 'B',
    });
  });

  it('nhãn viết thường vẫn hiểu (ô "Trả lời hàng loạt" — d.264)', () => {
    expect(kiemKetQuaXuLy('decision', { phuong_an: ' a ' }, CO_SAN)).toMatchObject({
      phuong_an_id: 'pa-a',
      nhan: 'A',
    });
  });

  it('kết quả đúng ví dụ của SPEC d.244: "A, ngưỡng 500"', () => {
    expect(cauKetQuaDecision('A', 'ngưỡng 500')).toBe('A, ngưỡng 500');
    expect(
      kiemKetQuaXuLy('decision', { phuong_an: 'A', ghi_them: 'ngưỡng 500' }, CO_SAN),
    ).toMatchObject({ ket_qua: 'A, ngưỡng 500' });
  });
});

describe('mục 8 d.261 — `review` có hai lựa chọn Đạt / Cần sửa', () => {
  it('thiếu `ket_luan` → INVALID_INPUT', () => {
    expect(maKhiNem(() => kiemKetQuaXuLy('review', {}))).toBe('INVALID_INPUT');
  });

  it('`ket_luan` lạ → INVALID_INPUT (danh sách khoá, không chữ tự do)', () => {
    expect(maKhiNem(() => kiemKetQuaXuLy('review', { ket_luan: 'Đạt' }))).toBe('INVALID_INPUT');
  });

  it('**Cần sửa thì bắt buộc ghi chú** → thiếu ghi chú là lỗi', () => {
    expect(maKhiNem(() => kiemKetQuaXuLy('review', { ket_luan: 'can_sua' }))).toBe(
      'INVALID_INPUT',
    );
  });

  it('ĐỐI CHỨNG: Cần sửa + ghi chú → nhận, kết quả là chính ghi chú', () => {
    expect(kiemKetQuaXuLy('review', { ket_luan: 'can_sua', ghi_them: 'thiếu test' })).toEqual({
      loai: 'review',
      ket_luan: 'can_sua',
      ket_qua: 'thiếu test',
    });
  });

  it('ĐỐI CHỨNG: **Đạt** thì ghi chú vẫn tuỳ chọn', () => {
    expect(kiemKetQuaXuLy('review', { ket_luan: 'dat' })).toMatchObject({ ket_qua: 'đã xem' });
    expect(NHAN_KET_LUAN_REVIEW_MUC).toEqual({ dat: 'Đạt', can_sua: 'Cần sửa' });
  });
});

describe('cổng trạng thái — mục 8 d.244, d.246; 19.10 d.553', () => {
  it('`open` thì xử lý được', () => {
    expect(() => batBuocXuLyDuoc('open', 'T-1')).not.toThrow();
  });

  it('`resolved` → ALREADY_RESOLVED, thông điệp "mở lại trước" (19.10 d.553)', () => {
    const loi = loiKhiNem(() => batBuocXuLyDuoc('resolved', 'T-1'));
    expect(loi.ma).toBe('ALREADY_RESOLVED');
    expect(loi.message).toContain('mở lại trước');
  });

  it('`skipped` cũng → ALREADY_RESOLVED (hướng đóng tạm, #73)', () => {
    expect(maKhiNem(() => batBuocXuLyDuoc('skipped', 'T-1'))).toBe('ALREADY_RESOLVED');
  });

  it('mở lại: nhận `resolved` và `skipped`, từ chối `open`', () => {
    expect(() => batBuocMoLaiDuoc('resolved', 'T-1')).not.toThrow();
    expect(() => batBuocMoLaiDuoc('skipped', 'T-1')).not.toThrow();
    expect(maKhiNem(() => batBuocMoLaiDuoc('open', 'T-1'))).toBe('INVALID_INPUT');
  });
});

describe('câu chữ của SPEC — mục 8 d.280, 19.9 d.541–542', () => {
  it('bình luận khi xử lý: đúng chữ d.280 "T-số đã xử lý: <kết quả>"', () => {
    expect(cauBinhLuanDaXuLy('T-18', 'đã chạy')).toBe('T-18 đã xử lý: đã chạy');
  });

  it('bình luận khi bỏ qua và khi mở lại (19.9 d.541–542)', () => {
    expect(cauBinhLuanBoQua('T-18', 'không cần nữa')).toBe('T-18 bỏ qua: không cần nữa');
    expect(cauBinhLuanMoLai('T-18')).toBe('T-18 mở lại');
  });

  it('`T-số` và id đều tra được cùng một mục (mục 13 nói bằng T-số)', () => {
    expect(maSoTuChu('T-18')).toBe(18);
    expect(maSoTuChu('t-7')).toBe(7);
    expect(maSoTuChu('ct-abc')).toBeNull();
    expect(maSoTuChu('T-')).toBeNull();
  });
});

/* ================================================================== *
 * 2. Quyền — mục 8 d.245, bảng quyền mục 3 ("không bao giờ")
 * ================================================================== */

describe('mục 8 d.245 — CHỈ CHỦ chuyển trạng thái', () => {
  it.each([
    ['coordinator', T_COORD],
    ['manager', T_MANAGER],
    ['worker', T_WORKER],
    ['reviewer', T_REVIEWER],
  ])('vai `%s` xử lý mục → 403 FORBIDDEN', async (_vai, token) => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    for (const duong of ['xu-ly', 'bo-qua', 'mo-lai']) {
      const res = await goiApi(`/v1/can-chu/ct-1/${duong}`, token, {
        method: 'POST',
        than: { ly_do: 'không cần' },
      });
      expect(res.status, `${_vai} ${duong}`).toBe(403);
      expect(await than(res), `${_vai} ${duong}`).toMatchObject({ error: 'FORBIDDEN' });
    }
    // Mục **không đổi** — 403 là từ chối, không phải "từ chối nhưng vẫn ghi".
    expect((await canChuTrongDb('ct-1'))?.trang_thai).toBe('open');
  });

  it('hàng "Quyết mục Cần Chủ" là **tuyệt đối**: chủ bật ô cho agent cũng vô ích', () => {
    // Ô `resolve_ask` không nằm trong `VIEC_GHI_DE_DUOC`, nên không có đường ghi
    // đè nào; `quyen()` còn chặn ở bước 1, trước cả nhánh ghi đè.
    const ai = aiAgent('coordinator', {
      vao_tat_ca_du_an: true,
      // @ts-expect-error — cố tình khai một ô không ghi đè được, để ca này nói
      // đúng điều nó muốn nói: kể cả có dòng dữ liệu đó thì vẫn bị từ chối.
      ghi_de: { resolve_ask: { cho_phep: true, pham_vi: 'co' } },
    });
    expect(quyen(ai, 'resolve_ask', {})).toMatchObject({ cho_phep: false, ma: 'FORBIDDEN' });
    expect(quyen(CHU, 'resolve_ask', {})).toEqual({ cho_phep: true });
  });

  it('agent gọi một mục KHÔNG có thật vẫn là 403, không 404 (19.12 câu 15)', async () => {
    const res = await goiApi('/v1/can-chu/T-404/xu-ly', T_COORD, { method: 'POST', than: {} });
    expect(res.status).toBe(403);
  });
});

/* ================================================================== *
 * 3. Ba việc của d.278–281 — MỘT giao dịch
 * ================================================================== */

describe('mục 8 d.278–281 — ba việc khi một mục được xử lý', () => {
  it('đổi trạng thái + 1 dòng Nhật ký + bình luận lên MỌI ticket + thả phiên', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'run_command', tieu_de: 'Chạy migration' });
    await noiTicket('ct-1', TK);
    await noiTicket('ct-1', TK2);
    await dungLuotGiao('lg-1', TK, 'ag-work', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'waiting_owner', can_chu_id: 'ct-1' });

    const res = await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const kq = await than(res);

    // (0) Trạng thái và kết quả — d.244 + 19.9 d.539 (mặc định "đã chạy").
    const muc = await canChuTrongDb('ct-1');
    expect(muc?.trang_thai).toBe('resolved');
    expect(muc?.ket_qua).toBe('đã chạy');
    expect(muc?.xu_ly_luc).not.toBeNull();

    // (1) **Một** dòng Nhật ký: người là chủ, cùng dự án, nội dung là kết quả.
    const nk = await nhatKyTheoThuTu();
    expect(nk).toHaveLength(1);
    expect(nk[0]).toMatchObject({ nguoi_loai: 'chu', project_id: PJ, quyet_dinh: 'đã chạy' });

    // …căn cứ là `T-số`, và nó là **khoá thật** trỏ dòng `can_chu`.
    const { results: can_cu } = await env.DB.prepare(
      'SELECT loai, can_chu_id FROM nhat_ky_can_cu WHERE nhat_ky_id = ?',
    )
      .bind(nk[0]!.id)
      .all<{ loai: string; can_chu_id: string | null }>();
    expect(can_cu).toEqual([{ loai: 'ask', can_chu_id: 'ct-1' }]);

    // (2) Bình luận trên **mọi** ticket liên quan, tác giả là chủ.
    expect(kq['so_binh_luan']).toBe(2);
    for (const t of [TK, TK2]) {
      expect(await binhLuanCuaTicket(t)).toEqual([
        { noi_dung: 'T-1 đã xử lý: đã chạy', tac_gia_loai: 'owner', tac_gia_agent_id: null },
      ]);
    }

    // (3) Phiên hết `waiting_owner`.
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');
    expect(await canChuCuaPhien('ph-1')).toBeNull();
  });

  it('**NGUYÊN TỬ**: handler không tự ghi gì, và một chặng hỏng ⇒ không chặng nào ghi', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    await noiTicket('ct-1', TK);

    /*
     * Gọi thẳng handler và **không** chạy batch của nó. Nếu handler tự
     * `db.batch()` một chặng nào (vd ghi Nhật ký rồi mới đổi mục), dòng đó đã có
     * trong DB ngay sau dòng dưới đây — tức ca này đỏ.
     */
    const ket = await SO_DANG_KY_HANDLER.xu_ly_can_chu(
      { loai: 'xu_ly_can_chu', workspace_id: WS, ai: CHU, can_chu_id: 'ct-1' },
      {
        env,
        db: env.DB,
        bay_gio: Date.now(),
        danhThuc: () => undefined,
        cong: () => Promise.resolve({ du: false, ly_do: '' }),
      },
    );
    expect((await canChuTrongDb('ct-1'))?.trang_thai).toBe('open');
    expect(await nhatKyTheoThuTu()).toHaveLength(0);
    expect(await binhLuanCuaTicket(TK)).toHaveLength(0);

    /*
     * Nay cho **một chặng hỏng** trong cùng batch: một câu lệnh vỡ ràng buộc
     * (dòng Nhật ký trỏ tới một dự án của workspace khác —
     * `tg_nhat_ky_ws_them` của 0014). Vì bốn việc nằm trong **một** `batch()`,
     * cả bốn phải cùng hỏng.
     */
    const hong = env.DB.prepare(
      `INSERT INTO nhat_ky (id, workspace_id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao)
       VALUES (?, ?, ?, 'chu', NULL, 'pj-khong-co-that', 'x', 'y')`,
    ).bind(crypto.randomUUID(), WS, Date.now());

    await expect(env.DB.batch([...ket.cau_lenh, hong])).rejects.toBeTruthy();

    // Không một chặng nào ghi được.
    expect((await canChuTrongDb('ct-1'))?.trang_thai).toBe('open');
    expect((await canChuTrongDb('ct-1'))?.ket_qua).toBeNull();
    expect(await nhatKyTheoThuTu()).toHaveLength(0);
    expect(await binhLuanCuaTicket(TK)).toHaveLength(0);

    // ĐỐI CHỨNG: cùng bộ câu lệnh, không chặng hỏng ⇒ cả bốn việc xảy ra.
    await env.DB.batch(ket.cau_lenh);
    expect((await canChuTrongDb('ct-1'))?.trang_thai).toBe('resolved');
    expect(await nhatKyTheoThuTu()).toHaveLength(1);
    expect(await binhLuanCuaTicket(TK)).toHaveLength(1);
  });

  it('19.12 câu 4 — mục **Chung** ⇒ dòng Nhật ký để TRỐNG dự án', async () => {
    await dungCanChu('ct-chung', { project_id: null, loai: 'fyi' });
    const res = await goiApi('/v1/can-chu/ct-chung/xu-ly', TOKEN_CHU, {
      method: 'POST',
      than: {},
    });
    expect(res.status).toBe(200);
    expect((await nhatKyTheoThuTu())[0]).toMatchObject({ project_id: null });
  });

  it('"vì sao" mặc định là tiêu đề mục; chủ gửi thì tôn trọng', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tieu_de: 'Đọc bản tóm tắt' });
    await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect((await nhatKyTheoThuTu())[0]?.vi_sao).toBe('Trả lời mục T-1: Đọc bản tóm tắt');

    await dungCanChu('ct-2', { project_id: PJ, loai: 'fyi' });
    await goiApi('/v1/can-chu/ct-2/xu-ly', TOKEN_CHU, {
      method: 'POST',
      than: { vi_sao: 'Vì đã có số đo' },
    });
    expect((await nhatKyTheoThuTu())[1]?.vi_sao).toBe('Vì đã có số đo');
  });

  it('mục không có ticket liên quan nào vẫn xử lý được (0 bình luận)', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    const res = await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(await than(res)).toMatchObject({ so_binh_luan: 0, trang_thai: 'resolved' });
  });
});

/* ================================================================== *
 * 4. `decision` qua cửa ghi — khoá thật, không chữ "A" rời
 * ================================================================== */

describe('19.9 d.538 qua cửa ghi — phương án đã chọn là KHOÁ THẬT', () => {
  it('chọn B → cột trỏ đúng dòng `can_chu_phuong_an` của chính mục đó', async () => {
    const tao = await taoDecision();
    const id = tao['id'] as string;

    const res = await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { phuong_an: 'B', ghi_them: 'ngưỡng 500' },
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);

    const muc = await canChuTrongDb(id);
    expect(muc?.ket_qua).toBe('B, ngưỡng 500');
    const pa = await env.DB.prepare(
      'SELECT can_chu_id, nhan FROM can_chu_phuong_an WHERE id = ?',
    )
      .bind(muc?.phuong_an_da_chon_id)
      .first<{ can_chu_id: string; nhan: string }>();
    expect(pa).toEqual({ can_chu_id: id, nhan: 'B' });
    expect((await nhatKyTheoThuTu())[0]?.quyet_dinh).toBe('B, ngưỡng 500');
  });

  it('nhãn KHÔNG có thật → 422 OPTIONS_REQUIRED, mục KHÔNG đổi', async () => {
    const tao = await taoDecision();
    const id = tao['id'] as string;

    const res = await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { phuong_an: 'E' },
    });
    expect(res.status).toBe(422);
    expect(await than(res)).toMatchObject({ error: 'OPTIONS_REQUIRED' });
    expect((await canChuTrongDb(id))?.trang_thai).toBe('open');
    expect(await nhatKyTheoThuTu()).toHaveLength(0);
  });

  it('`decision` mà KHÔNG CÓ GÌ CẢ (không phương án, không ghi thêm) → 422, mục KHÔNG đổi', async () => {
    const tao = await taoDecision();
    const id = tao['id'] as string;
    const res = await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: {},
    });
    expect(res.status).toBe(422);
    expect(await than(res)).toMatchObject({ error: 'OPTIONS_REQUIRED' });
    expect((await canChuTrongDb(id))?.trang_thai).toBe('open');
  });

  it('#121 — `decision` CHỈ với `ghi_them` → 200, không phương án, ghi được vào DB', async () => {
    /*
     * **Ca chứng minh migration 0021 đã nới trigger.** Trước 0021, mệnh đề 6 của
     * `tg_can_chu_xu_ly_sua` ABORT đúng câu UPDATE này (`resolved` + `decision` +
     * `phuong_an_da_chon_id IS NULL`) — nên nếu một lượt sau bỏ 0021 mà chỉ giữ
     * luật ở `kiemKetQuaXuLy`, ca này đỏ ở tầng DB chứ không lọt.
     */
    const tao = await taoDecision();
    const id = tao['id'] as string;

    const res = await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { ghi_them: 'làm trước tính năng, chưa cần đo gì' },
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect(await than(res)).toMatchObject({
      trang_thai: 'resolved',
      phuong_an_da_chon_id: null,
      nhan_phuong_an: null,
      ket_qua: 'làm trước tính năng, chưa cần đo gì',
    });

    // Ghi **thật** vào DB, không chỉ một thân trả về.
    expect(await canChuTrongDb(id)).toMatchObject({
      trang_thai: 'resolved',
      phuong_an_da_chon_id: null,
      ket_qua: 'làm trước tính năng, chưa cần đo gì',
    });
    // Chữ tự do đi **nguyên văn** vào Nhật ký (d.279) — không `", …"` đầu dòng.
    expect((await nhatKyTheoThuTu())[0]?.quyet_dinh).toBe(
      'làm trước tính năng, chưa cần đo gì',
    );
  });

  it('DB chặn tầng hai: phương án của MỤC KHÁC không gán được', async () => {
    const a = (await taoDecision())['id'] as string;
    const b = (await taoDecision())['id'] as string;
    const pa_cua_b = await env.DB.prepare(
      'SELECT id FROM can_chu_phuong_an WHERE can_chu_id = ? LIMIT 1',
    )
      .bind(b)
      .first<{ id: string }>();

    await expect(
      env.DB.prepare(
        `UPDATE can_chu SET trang_thai = 'resolved', ket_qua = 'A',
                            phuong_an_da_chon_id = ?, xu_ly_luc = ? WHERE id = ?`,
      )
        .bind(pa_cua_b?.id, Date.now(), a)
        .run(),
    ).rejects.toThrow();
  });

  it('#121 — migration 0021: `decision` `resolved` KHÔNG phương án mà CÓ `ket_qua` thì DB NHẬN', async () => {
    /*
     * Ca này **đổi chiều** so với bản trước 0021: mệnh đề 6 của 0015
     * (`resolved` + `decision` + `phuong_an_da_chon_id IS NULL` ⇒ ABORT) đã bỏ,
     * vì d.244 cho "**và/hoặc** chữ tự do" và chủ yêu cầu trực tiếp 11/10
     * (`spec-questions.md` #121). Giữ nguyên dòng cũ dưới dạng ca mới để chỗ nới
     * này **đo được**, không chỉ nằm trong một chú thích SQL.
     */
    const a = (await taoDecision())['id'] as string;
    const kq = await env.DB.prepare(
      `UPDATE can_chu SET trang_thai = 'resolved', ket_qua = 'xong', xu_ly_luc = ? WHERE id = ?`,
    )
      .bind(Date.now(), a)
      .run();
    expect(kq.success).toBe(true);
    expect(await canChuTrongDb(a)).toMatchObject({
      trang_thai: 'resolved',
      phuong_an_da_chon_id: null,
      ket_qua: 'xong',
    });
  });

  it('ĐỐI CHỨNG 0021: `decision` `resolved` mà KHÔNG phương án VÀ KHÔNG `ket_qua` vẫn bị chặn', async () => {
    // Mệnh đề **1** của cặp trigger gánh luật này cho mọi loại — đó là lý do
    // 0021 **bỏ** mệnh đề 6 thay vì viết một mệnh đề mới không bao giờ bật.
    const a = (await taoDecision())['id'] as string;
    await expect(
      env.DB.prepare(
        `UPDATE can_chu SET trang_thai = 'resolved', xu_ly_luc = ? WHERE id = ?`,
      )
        .bind(Date.now(), a)
        .run(),
    ).rejects.toThrow();
    expect((await canChuTrongDb(a))?.trang_thai).toBe('open');
  });

  it('DB chặn tầng hai: `resolved` mà thiếu `ket_qua`', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    await expect(
      env.DB.prepare(
        `UPDATE can_chu SET trang_thai = 'resolved', xu_ly_luc = ? WHERE id = 'ct-1'`,
      )
        .bind(Date.now())
        .run(),
    ).rejects.toThrow();
  });
});

/* ================================================================== *
 * 5. `review` qua cửa ghi — mục 8 d.261
 * ================================================================== */

describe('mục 8 d.261 qua cửa ghi — Đạt / Cần sửa', () => {
  async function taoReview(id: string): Promise<void> {
    await dungCanChu(id, { project_id: PJ, loai: 'review' });
  }

  it('Đạt, không ghi chú → `ket_luan_review = dat`, kết quả "đã xem"', async () => {
    await taoReview('ct-r');
    const res = await goiApi('/v1/can-chu/ct-r/xu-ly', TOKEN_CHU, {
      method: 'POST',
      than: { ket_luan: 'dat' },
    });
    expect(res.status).toBe(200);
    expect(await canChuTrongDb('ct-r')).toMatchObject({
      trang_thai: 'resolved',
      ket_luan_review: 'dat',
      ket_qua: 'đã xem',
    });
  });

  it('Cần sửa KHÔNG ghi chú → 422, mục không đổi', async () => {
    await taoReview('ct-r');
    const res = await goiApi('/v1/can-chu/ct-r/xu-ly', TOKEN_CHU, {
      method: 'POST',
      than: { ket_luan: 'can_sua' },
    });
    expect(res.status).toBe(422);
    expect((await canChuTrongDb('ct-r'))?.trang_thai).toBe('open');
  });

  it('DB chặn tầng hai: `review` `resolved` mà thiếu kết luận', async () => {
    await taoReview('ct-r');
    await expect(
      env.DB.prepare(
        `UPDATE can_chu SET trang_thai = 'resolved', ket_qua = 'đã xem', xu_ly_luc = ?
          WHERE id = 'ct-r'`,
      )
        .bind(Date.now())
        .run(),
    ).rejects.toThrow();
  });

  it('DB chặn tầng hai: kết luận review trên một mục KHÔNG phải loại review', async () => {
    await dungCanChu('ct-f', { project_id: PJ, loai: 'fyi' });
    await expect(
      env.DB.prepare(`UPDATE can_chu SET ket_luan_review = 'dat' WHERE id = 'ct-f'`).run(),
    ).rejects.toThrow();
  });
});

/* ================================================================== *
 * 6. Bỏ qua — 19.9 d.541
 * ================================================================== */

describe('19.9 d.541 — Bỏ qua: bắt buộc lý do', () => {
  it('thiếu lý do → 422 REASON_REQUIRED, mục không đổi', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    for (const body of [{}, { ly_do: '   ' }]) {
      const res = await goiApi('/v1/can-chu/ct-1/bo-qua', TOKEN_CHU, {
        method: 'POST',
        than: body,
      });
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await than(res)).toMatchObject({ error: 'REASON_REQUIRED' });
    }
    expect((await canChuTrongDb('ct-1'))?.trang_thai).toBe('open');
    expect(await nhatKyTheoThuTu()).toHaveLength(0);
  });

  it('có lý do → `skipped`, Nhật ký "T-x bỏ qua: …", bình luận, phiên về `running`', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    await noiTicket('ct-1', TK);
    await dungLuotGiao('lg-1', TK, 'ag-work', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'waiting_owner', can_chu_id: 'ct-1' });

    const res = await goiApi('/v1/can-chu/ct-1/bo-qua', TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'đã tự làm' },
    });
    expect(res.status).toBe(200);

    expect(await canChuTrongDb('ct-1')).toMatchObject({
      trang_thai: 'skipped',
      ly_do_bo_qua: 'đã tự làm',
      ket_qua: null,
    });
    expect((await nhatKyTheoThuTu())[0]?.quyet_dinh).toBe('T-1 bỏ qua: đã tự làm');
    expect((await binhLuanCuaTicket(TK))[0]?.noi_dung).toBe('T-1 bỏ qua: đã tự làm');
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');
  });

  it('DB chặn tầng hai: `skipped` mà thiếu lý do', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    await expect(
      env.DB.prepare(
        `UPDATE can_chu SET trang_thai = 'skipped', xu_ly_luc = ? WHERE id = 'ct-1'`,
      )
        .bind(Date.now())
        .run(),
    ).rejects.toThrow();
  });
});

/* ================================================================== *
 * 7. Mở lại — mục 8 d.246, 19.9 d.542
 * ================================================================== */

describe('19.9 d.542 — Mở lại: thêm dòng mới, dòng cũ KHÔNG bị sửa', () => {
  it('xử lý → mở lại → xử lý lần hai: **ba** dòng Nhật ký, hai dòng đầu nguyên vẹn', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'run_command' });
    await noiTicket('ct-1', TK);

    await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, {
      method: 'POST',
      than: { ghi_them: 'lần một' },
    });
    const sau_lan_mot = await nhatKyTheoThuTu();
    expect(sau_lan_mot).toHaveLength(1);

    const mo = await goiApi('/v1/can-chu/ct-1/mo-lai', TOKEN_CHU, { method: 'POST', than: {} });
    expect(mo.status).toBe(200);
    expect(await than(mo)).toMatchObject({
      trang_thai: 'open',
      trang_thai_cu: 'resolved',
      mo_lai_lan: 1,
    });

    // Mục về `Chờ`, **mọi dấu của lần trước đã dọn** (trigger của 0015 ép).
    expect(await canChuTrongDb('ct-1')).toMatchObject({
      trang_thai: 'open',
      ket_qua: null,
      xu_ly_luc: null,
      mo_lai_lan: 1,
    });

    await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, {
      method: 'POST',
      than: { ghi_them: 'lần hai' },
    });

    const cuoi = await nhatKyTheoThuTu();
    expect(cuoi.map((d) => d.quyet_dinh)).toEqual(['lần một', 'T-1 mở lại', 'lần hai']);
    // **Dòng cũ nguyên vẹn** — cùng id, cùng nội dung, cùng mốc.
    expect(cuoi[0]).toEqual(sau_lan_mot[0]);

    // Bình luận cũng **thêm mới**, không sửa.
    expect((await binhLuanCuaTicket(TK)).map((b) => b.noi_dung)).toEqual([
      'T-1 đã xử lý: lần một',
      'T-1 mở lại',
      'T-1 đã xử lý: lần hai',
    ]);
  });

  it('mục đã `resolved` mà xử lý tiếp → 409 ALREADY_RESOLVED', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', trang_thai: 'resolved' });
    const res = await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status).toBe(409);
    expect(await than(res)).toMatchObject({ error: 'ALREADY_RESOLVED' });
  });

  it('mục `skipped` mở lại được, rồi xử lý được (đường "mở lại trước" của 19.10)', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', trang_thai: 'skipped' });

    const chan = await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(chan.status).toBe(409);

    const mo = await goiApi('/v1/can-chu/ct-1/mo-lai', TOKEN_CHU, { method: 'POST', than: {} });
    expect(mo.status).toBe(200);
    expect(await than(mo)).toMatchObject({ trang_thai_cu: 'skipped' });
    expect(await canChuTrongDb('ct-1')).toMatchObject({ trang_thai: 'open', ly_do_bo_qua: null });

    const xong = await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(xong.status).toBe(200);
  });

  it('mở lại một mục đang `Chờ` → 422, không ghi dòng Nhật ký nào', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    const res = await goiApi('/v1/can-chu/ct-1/mo-lai', TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status).toBe(422);
    expect(await nhatKyTheoThuTu()).toHaveLength(0);
  });

  /*
   * Hai ca dưới đây khoá **hai cột** mà ca mở lại ở trên không với tới: nó dùng
   * loại `run_command`, và ca `skipped` dùng `fyi` — cả hai loại không bao giờ
   * mang `phuong_an_da_chon_id` hay `ket_luan_review`, nên xoá hẳn hai cột đó
   * khỏi câu `UPDATE` của `handlerMoLaiCanChu` vẫn không làm đỏ ca nào.
   */
  it('mở lại một mục `decision` ⇒ `phuong_an_da_chon_id` về **NULL**', async () => {
    const id = (await taoDecision())['id'] as string;

    const xu_ly = await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { phuong_an: 'A' },
    });
    expect(xu_ly.status, JSON.stringify(await xu_ly.clone().json())).toBe(200);
    expect((await canChuTrongDb(id))?.phuong_an_da_chon_id).not.toBeNull();

    const mo = await goiApi(`/v1/can-chu/${id}/mo-lai`, TOKEN_CHU, { method: 'POST', than: {} });
    expect(mo.status, JSON.stringify(await mo.clone().json())).toBe(200);
    expect(await canChuTrongDb(id)).toMatchObject({
      trang_thai: 'open',
      ket_qua: null,
      xu_ly_luc: null,
      phuong_an_da_chon_id: null,
      mo_lai_lan: 1,
    });
  });

  it('mở lại một mục `review` ⇒ `ket_luan_review` về **NULL**', async () => {
    await dungCanChu('ct-r', { project_id: PJ, loai: 'review' });

    const xu_ly = await goiApi('/v1/can-chu/ct-r/xu-ly', TOKEN_CHU, {
      method: 'POST',
      than: { ket_luan: 'dat' },
    });
    expect(xu_ly.status).toBe(200);
    expect((await canChuTrongDb('ct-r'))?.ket_luan_review).toBe('dat');

    const mo = await goiApi('/v1/can-chu/ct-r/mo-lai', TOKEN_CHU, { method: 'POST', than: {} });
    expect(mo.status, JSON.stringify(await mo.clone().json())).toBe(200);
    expect(await canChuTrongDb('ct-r')).toMatchObject({
      trang_thai: 'open',
      ket_qua: null,
      xu_ly_luc: null,
      ket_luan_review: null,
      mo_lai_lan: 1,
    });
  });

  /*
   * Mệnh đề **3b** và **3c** của cặp `tg_can_chu_xu_ly_*` (0015): một mục `open`
   * **không** được mang phương án đã chọn hay kết luận review. Hai ca này chạy
   * **đúng** câu `UPDATE` của `handlerMoLaiCanChu` nhưng **thiếu** một cột — tức
   * đúng phép đột biến mà hai ca trên bắt ở tầng handler, nay bắt ở tầng DB, bất
   * kể đường ghi nào tạo ra dòng đó.
   */
  it('DB chặn tầng hai: mục `open` mang `phuong_an_da_chon_id` (mệnh đề 3b)', async () => {
    const id = (await taoDecision())['id'] as string;
    await goiApi(`/v1/can-chu/${id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: { phuong_an: 'A' },
    });

    // Đúng câu UPDATE của `handlerMoLaiCanChu`, **thiếu** `phuong_an_da_chon_id = NULL`.
    await expect(
      env.DB.prepare(
        `UPDATE can_chu
            SET trang_thai = 'open', ket_qua = NULL, ket_luan_review = NULL,
                ly_do_bo_qua = NULL, xu_ly_luc = NULL,
                mo_lai_lan = mo_lai_lan + 1, cap_nhat_luc = ?
          WHERE id = ?`,
      )
        .bind(Date.now(), id)
        .run(),
    ).rejects.toThrow();
    expect((await canChuTrongDb(id))?.trang_thai).toBe('resolved');
  });

  it('DB chặn tầng hai: mục `open` mang `ket_luan_review` (mệnh đề 3c)', async () => {
    await dungCanChu('ct-r', { project_id: PJ, loai: 'review' });
    await goiApi('/v1/can-chu/ct-r/xu-ly', TOKEN_CHU, {
      method: 'POST',
      than: { ket_luan: 'dat' },
    });

    // Đúng câu UPDATE của `handlerMoLaiCanChu`, **thiếu** `ket_luan_review = NULL`.
    await expect(
      env.DB.prepare(
        `UPDATE can_chu
            SET trang_thai = 'open', ket_qua = NULL, phuong_an_da_chon_id = NULL,
                ly_do_bo_qua = NULL, xu_ly_luc = NULL,
                mo_lai_lan = mo_lai_lan + 1, cap_nhat_luc = ?
          WHERE id = 'ct-r'`,
      )
        .bind(Date.now())
        .run(),
    ).rejects.toThrow();
    expect((await canChuTrongDb('ct-r'))?.trang_thai).toBe('resolved');
  });

  it('`mo_lai_lan` **chỉ tăng** — trigger của 0015', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', mo_lai_lan: 3 });
    await expect(
      env.DB.prepare(`UPDATE can_chu SET mo_lai_lan = 1 WHERE id = 'ct-1'`).run(),
    ).rejects.toThrow();
  });

  it('dòng Nhật ký đã ghi KHÔNG sửa được bằng bất cứ đường nào (d.309)', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    const dong = (await nhatKyTheoThuTu())[0]!;
    await expect(
      env.DB.prepare('UPDATE nhat_ky SET quyet_dinh = ? WHERE id = ?')
        .bind('sửa trộm', dong.id)
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare('DELETE FROM nhat_ky WHERE id = ?').bind(dong.id).run(),
    ).rejects.toThrow();
  });
});

/* ================================================================== *
 * 8. Phiên — cặp VÀO–RA (mục 8 d.240, 19.6 d.516)
 * ================================================================== */

describe('mục 8 d.240 + 19.6 d.516 — cặp vào–ra của phiên', () => {
  beforeEach(async () => {
    await dungLuotGiao('lg-1', TK, 'ag-work', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'running' });
  });

  it('VÀO: tạo mục có `phien_lien_quan` ⇒ phiên sang `waiting_owner`, trỏ đúng mục', async () => {
    const res = await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: {
        tieu_de: 'Chạy lệnh hộ',
        muc: 'urgent',
        loai: 'fyi',
        project_id: PJ,
        phien_lien_quan: 'ph-1',
      },
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    const kq = await than(res);
    expect(kq).toMatchObject({ phien_lien_quan: 'ph-1', phien_trang_thai: 'waiting_owner' });

    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('waiting_owner');
    expect(await canChuCuaPhien('ph-1')).toBe(kq['id']);
  });

  it('RA: xử lý ⇒ phiên về `running`, và **ngưỡng đứng tính lại từ lúc đó**', async () => {
    // Phiên im lặng từ 10 tiếng trước — quá mọi ngưỡng của mục 6 (trần 1440 phút).
    const lau = Date.now() - 10 * 60 * 60_000;
    await env.DB.prepare('UPDATE phien SET tin_hieu_cuoi_luc = ? WHERE id = ?')
      .bind(lau, 'ph-1')
      .run();

    await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: {
        tieu_de: 'Chờ Chủ',
        muc: 'today',
        loai: 'fyi',
        project_id: PJ,
        phien_lien_quan: 'ph-1',
      },
    });
    const ct = await env.DB.prepare('SELECT id FROM can_chu LIMIT 1').first<{ id: string }>();

    const truoc = Date.now();
    const res = await goiApi(`/v1/can-chu/${ct!.id}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: {},
    });
    expect(res.status).toBe(200);
    expect(await than(res)).toMatchObject({ phien_da_tha: ['ph-1'] });

    const sau = await phienTrongDb('ph-1');
    expect(sau?.trang_thai).toBe('running');
    /*
     * **Mốc**, không chỉ trạng thái: 19.6 d.516 nói "ngưỡng đứng tính lại **từ
     * lúc đó**". Không đặt lại `tin_hieu_cuoi_luc` thì phiên về `running` rồi
     * **lập tức** là `stalled` (im 10 tiếng), tức mất đúng nửa luật này.
     */
    expect(sau!.tin_hieu_cuoi_luc).toBeGreaterThanOrEqual(truoc);
    expect(sau!.tin_hieu_cuoi_luc).toBeGreaterThan(lau);
  });

  it('RA: **bỏ qua** cũng thả phiên (19.6 d.516 "xử lý **hoặc bỏ qua**")', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    await env.DB.prepare(
      `UPDATE phien SET trang_thai = 'waiting_owner', can_chu_id = 'ct-1' WHERE id = 'ph-1'`,
    ).run();

    await goiApi('/v1/can-chu/ct-1/bo-qua', TOKEN_CHU, {
      method: 'POST',
      than: { ly_do: 'không cần nữa' },
    });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');
    expect(await canChuCuaPhien('ph-1')).toBeNull();
  });

  it('phiên `waiting_owner` **không bao giờ** bị tính đứng, kể cả qua đường mới', async () => {
    await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: {
        tieu_de: 'Chờ Chủ lâu',
        muc: 'today',
        loai: 'fyi',
        project_id: PJ,
        phien_lien_quan: 'ph-1',
      },
    });
    // Im lặng 10 tiếng **trong lúc** chờ Chủ.
    await env.DB.prepare('UPDATE phien SET tin_hieu_cuoi_luc = ? WHERE id = ?')
      .bind(Date.now() - 10 * 60 * 60_000, 'ph-1')
      .run();

    /*
     * Hàng rào này có từ phần 2 (`trangThaiPhienDanXuat` chỉ dẫn xuất `stalled`
     * **từ `running`**), nên ca này là một **khẳng định** rằng nó vẫn đúng khi
     * phiên đi vào `waiting_owner` qua đường mới của lượt này — đo trên đúng
     * dòng DB mà đường mới vừa ghi, không trên một dòng dựng tay.
     */
    const d = (await phienTrongDb('ph-1'))!;
    expect(d.trang_thai).toBe('waiting_owner');
    expect(
      trangThaiPhienDanXuat(
        {
          // `d.trang_thai`, **không** một chữ viết tay: lời khai ngay trên là "đo
          // trên đúng dòng DB mà đường mới vừa ghi", nên cả hai trường phải đến
          // từ dòng đó.
          trang_thai: trangThaiPhienTuDb(d.trang_thai),
          tin_hieu_cuoi_luc: d.tin_hieu_cuoi_luc,
          stopping_luc: null,
        },
        Date.now(),
        30 * 60_000,
      ),
    ).toMatchObject({ trang_thai: 'waiting_owner' });
  });

  it('agent chỉ nối được phiên **của chính mình**', async () => {
    const xau = await goiApi('/v1/can-chu', T_MANAGER, {
      method: 'POST',
      than: {
        tieu_de: 'Nối trộm phiên người khác',
        muc: 'later',
        loai: 'fyi',
        project_id: PJ,
        phien_lien_quan: 'ph-1',
      },
    });
    expect(xau.status).toBe(403);
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');
  });

  it('phiên không có thật → 404, mục KHÔNG được tạo', async () => {
    const res = await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: {
        tieu_de: 'Phiên ma',
        muc: 'later',
        loai: 'fyi',
        project_id: PJ,
        phien_lien_quan: 'ph-khong-co',
      },
    });
    expect(res.status).toBe(404);
    const dem = await env.DB.prepare('SELECT count(*) AS n FROM can_chu').first<{ n: number }>();
    expect(dem?.n).toBe(0);
  });
});

/* ================================================================== *
 * 9. 19.11 d.560 — phiên đã đóng, agent đã bị tắt
 * ================================================================== */

describe('19.11 d.560 — kết quả vẫn lưu khi phiên đã đóng hoặc agent đã tắt', () => {
  it('phiên `closed`: nối vào mục thì **không** đổi trạng thái, và xử lý KHÔNG ném lỗi', async () => {
    await dungLuotGiao('lg-1', TK, 'ag-work', { trang_thai: 'submitted' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'closed', ly_do_dong: 'đã nộp báo cáo' });

    const tao = await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: {
        tieu_de: 'Hỏi sau khi đã nộp',
        muc: 'today',
        loai: 'fyi',
        project_id: PJ,
        phien_lien_quan: 'ph-1',
      },
    });
    expect(tao.status, JSON.stringify(await tao.clone().json())).toBe(201);
    const kq = await than(tao);
    // "**Không gửi thêm tín hiệu nào**": phiên đóng là vĩnh viễn, giữ `closed`.
    expect(kq['phien_trang_thai']).toBe('closed');
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('closed');

    const xl = await goiApi(`/v1/can-chu/${kq['id'] as string}/xu-ly`, TOKEN_CHU, {
      method: 'POST',
      than: {},
    });
    expect(xl.status, JSON.stringify(await xl.clone().json())).toBe(200);
    // **Kết quả vẫn lưu** — đó là cả nội dung của d.560.
    expect(await canChuTrongDb(kq['id'] as string)).toMatchObject({
      trang_thai: 'resolved',
      ket_qua: 'đã đọc',
    });
    // Phiên đóng không bị đụng tới.
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('closed');
    expect(await nhatKyTheoThuTu()).toHaveLength(1);
  });

  it('agent đã `disabled`: mục của nó vẫn xử lý được, kết quả vẫn lưu', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi', tao_boi_agent_id: 'ag-work' });
    await noiTicket('ct-1', TK);
    await dungLuotGiao('lg-1', TK, 'ag-work', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'waiting_owner', can_chu_id: 'ct-1' });
    await env.DB.prepare('UPDATE agent SET disabled = 1 WHERE id = ?').bind('ag-work').run();

    const res = await goiApi('/v1/can-chu/ct-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect((await canChuTrongDb('ct-1'))?.ket_qua).toBe('đã đọc');
    expect(await nhatKyTheoThuTu()).toHaveLength(1);
    expect((await binhLuanCuaTicket(TK))[0]?.noi_dung).toBe('T-1 đã xử lý: đã đọc');
  });

  it('phiên `stopping` nối vào mục thì **giữ `stopping`** (d.193 vẫn phải dừng)', async () => {
    await dungLuotGiao('lg-1', TK, 'ag-work', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'stopping' });

    const tao = await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: {
        tieu_de: 'Hỏi lúc đang dừng',
        muc: 'later',
        loai: 'fyi',
        project_id: PJ,
        phien_lien_quan: 'ph-1',
      },
    });
    expect(tao.status).toBe(201);
    expect(await than(tao)).toMatchObject({ phien_trang_thai: 'stopping' });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('stopping');
  });
});

/* ================================================================== *
 * 10. Mục không có thật, và `T-số`
 * ================================================================== */

describe('tra mục theo id hoặc `T-số`', () => {
  it('chủ gọi `T-số` → cùng một mục với gọi theo id', async () => {
    await dungCanChu('ct-1', { project_id: PJ, loai: 'fyi' });
    const res = await goiApi('/v1/can-chu/T-1/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status).toBe(200);
    expect(await than(res)).toMatchObject({ id: 'ct-1', ma: 'T-1' });
  });

  it('chủ gọi một mục không có thật → 404', async () => {
    const res = await goiApi('/v1/can-chu/T-99/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status).toBe(404);
    expect(await than(res)).toMatchObject({ error: 'NOT_FOUND' });
  });
});

/* ================================================================== *
 * 11. Dự án `archived` — LỆCH CÓ CHỦ Ý khỏi 19.12 câu 25
 * ================================================================== */

/**
 * Ca này **ghim hành vi đã chọn**, không chứng minh nó đúng SPEC.
 *
 * 19.12 câu 25 nói **tường minh** mọi lệnh **ghi** lên dự án `archived` bị từ chối
 * (trừ chính việc chủ đổi `trang_thai`), nhưng 19.6 d.516 + d.281 nói đường
 * **duy nhất** thả một phiên khỏi `waiting_owner` là mục được xử lý — nên áp câu
 * 25 ở đây sinh ra một phiên kẹt **vĩnh viễn** mà không cảnh báo nào bắn. Lệch
 * đang chờ chủ chốt ở **`spec-questions.md` #75**.
 *
 * Có ca này thì một lượt sau "sửa cho đúng câu 25" làm **đỏ** chỗ này, chứ không
 * lặng lẽ đổi nghĩa một đường mà dữ liệu đã đi qua.
 */
describe('19.12 câu 25 vs 19.6 d.516 — dự án `archived` KHÔNG chặn đường xử lý (#75)', () => {
  it('chủ xử lý một mục của dự án đã lưu trữ → **200**, có dòng Nhật ký mới', async () => {
    const PJ_LT = await dungDuAn('LTU', 'Đã lưu trữ', 'archived');
    const tk_lt = await dungTicket(PJ_LT, 7, 'Việc của dự án đã lưu trữ');
    await dungCanChu('ct-lt', { project_id: PJ_LT, loai: 'fyi' });
    await noiTicket('ct-lt', tk_lt);
    await dungLuotGiao('lg-lt', tk_lt, 'ag-work', { trang_thai: 'in_progress' });
    await dungPhien('ph-lt', 'lg-lt', { trang_thai: 'waiting_owner', can_chu_id: 'ct-lt' });

    const res = await goiApi('/v1/can-chu/ct-lt/xu-ly', TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);

    expect(await canChuTrongDb('ct-lt')).toMatchObject({
      trang_thai: 'resolved',
      ket_qua: 'đã đọc',
    });

    // **Một dòng `nhat_ky` mới** — đúng thứ câu 25 sẽ chặn nếu chủ chốt hướng đóng.
    const nk = await nhatKyTheoThuTu();
    expect(nk).toHaveLength(1);
    expect(nk[0]).toMatchObject({ project_id: PJ_LT, quyet_dinh: 'đã đọc' });

    // Và một bình luận trên ticket của dự án đã lưu trữ.
    expect((await binhLuanCuaTicket(tk_lt))[0]?.noi_dung).toBe('T-1 đã xử lý: đã đọc');

    // Nửa còn lại của lý lẽ: phiên **thoát** `waiting_owner` (19.6 d.516).
    expect((await phienTrongDb('ph-lt'))?.trang_thai).toBe('running');
  });

  it('đối chứng: đường **TẠO** mục vẫn theo đúng câu 25 → `PROJECT_NOT_ACCEPTING`', async () => {
    const PJ_LT = await dungDuAn('LTU', 'Đã lưu trữ', 'archived');
    const res = await goiApi('/v1/can-chu', TOKEN_CHU, {
      method: 'POST',
      than: { tieu_de: 'Hỏi vào dự án đã lưu trữ', muc: 'today', loai: 'fyi', project_id: PJ_LT },
    });
    expect(res.status).toBe(409);
    expect(await than(res)).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });
  });
});
