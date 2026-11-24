/**
 * **Gửi thông báo ra kênh ngoài + nhắc 🔴 sau 2 giờ** — SPEC mục 12 (d.339–348),
 * mục 8 d.283 và d.291, 19.8 d.535, 19.12 câu 6.
 *
 * Mọi ca ở đây đi **đường thật** (cron → Worker → cửa ghi → D1) và **không gọi
 * mạng lần nào**: kênh Telegram là một nguồn **giả lập** tiêm qua
 * `datNguonTelegram` (danh sách cấm `CLAUDE.md` mục 3). Luật thuần (biên giờ yên
 * lặng, ba khoảng giãn, ngưỡng 2 giờ) ở `luat-gui-thong-bao.test.ts`.
 */

import { afterEach, describe, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { GIAN_THU_LAI_GUI_MS, MUI_GIO_CHU_PHUT, NHAC_DO_SAU_MS, maCanChu } from '@baton/shared';
import {
  TOKEN_CHU,
  WS,
  boNguonTelegram,
  datNguonTelegram,
  dungAgentCoToken,
  dungCanChu,
  dungDuAn,
  dungTicket,
  dungTin,
  dungWorkspace,
  goiApi,
  mocNhacDoCua,
  tinTheoThuTu,
  tinTrongDb,
} from './giup.js';
import { quetGuiThongBao, quetNhacCanChuDo } from '../src/cron-thong-bao.js';
import { nguonTelegramThat, locChuoiAnToan } from '../src/nguon-telegram.js';
import { viecCuaCron } from '../src/cron-bang-chung.js';
import { tongQuan } from '../src/doc-tong-quan.js';
import './ap-migration.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
// `afterEach` của file chờ sổ ĐẦU TIÊN, rồi mới gỡ kênh giả.
const bay = soRequestBay();
const { it, beforeEach } = caQuaSo(bay);

const T_COORD = 'bt_test_coordinator_tb';
let PJ = '';

/** Mốc epoch của một giờ **trên tường** của chủ (UTC+7), ngày 2026-10-06. */
function gioVN(gio: number, phut = 0): number {
  return Date.UTC(2026, 9, 6, gio, phut) - MUI_GIO_CHU_PHUT * 60_000;
}
const TRUA = gioVN(12);
const DEM = gioVN(2);

beforeEach(async () => {
  for (const b of [
    'thong_bao',
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
  boNguonTelegram();
});

afterEach(async () => {
  // Thân ca hết giờ có thể còn dùng kênh giả: chờ nó xong trước (BAT-54).
  await bay.doiHet();
  // Không để một kênh giả lập sống sang file test khác.
  boNguonTelegram();
});

/* ================================================================== *
 * A. Thiếu secret ⇒ KHÔNG gửi và KHÔNG lỗi — mục 12 d.339
 * ================================================================== */

describe('mục 12 d.339 — thiếu cấu hình Telegram thì không gửi, không lỗi', () => {
  it('không có `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` ⇒ `chua_cau_hinh`, tin vẫn nằm trong kho', async () => {
    await dungTin('tb-1', { tao_luc: TRUA });

    // `env` của bộ test **không** đặt hai secret đó (xem `vitest.config.ts`), và
    // không có kênh giả lập nào được tiêm ở ca này.
    const kq = await quetGuiThongBao(env, TRUA);

    expect(kq.chua_cau_hinh).toBe(true);
    expect([kq.so_dong, kq.so_gui, kq.so_truot, kq.so_loi]).toEqual([0, 0, 0, 0]);

    // **Không một dòng nào bị chạm**: ba lần thử của 19.12 câu 6 không bị tiêu vì
    // một cấu hình thiếu, và chuông trong app vẫn đủ.
    const d = await tinTrongDb('tb-1');
    expect(d?.gui_telegram_luc).toBeNull();
    expect(d?.gui_so_lan_thu).toBe(0);
    expect(d?.gui_loi_ly_do).toBeNull();
  });

  it('thiếu MỘT trong hai cũng là "chưa cấu hình" — `nguonTelegramThat` trả null', () => {
    expect(nguonTelegramThat(undefined, 'chat')).toBeNull();
    expect(nguonTelegramThat('token', undefined)).toBeNull();
    expect(nguonTelegramThat('  ', 'chat')).toBeNull();
    expect(nguonTelegramThat('token', '   ')).toBeNull();
    // Ca đối chứng: đủ cả hai thì **có** kênh (và nó không gọi mạng lúc dựng).
    expect(nguonTelegramThat('token', 'chat')).not.toBeNull();
  });

  it('lệnh ghi của agent VẪN thành công khi chưa cấu hình Telegram (🔴 mới)', async () => {
    const r = await goiApi('/v1/can-chu', T_COORD, {
      method: 'POST',
      than: { tieu_de: 'Sập production', muc: 'urgent', loai: 'fyi', project_id: PJ },
    });
    // `fyi` + 🔴 ⇒ bị hạ về 🟡 (19.8 d.534); dùng một loại khác cho ca 🔴 thật ở
    // khối C. Ở đây điểm cần ghim chỉ là: lệnh **không trượt**.
    expect(r.status).toBe(201);
  });
});

/* ================================================================== *
 * B. Gửi thật (giả lập), chống bắn lặp, link — mục 12 d.347
 * ================================================================== */

describe('mục 12 — một tin ra kênh ngoài ĐÚNG MỘT LẦN, có link', () => {
  it('gửi xong thì ghi mốc `gui_telegram_luc`, và tin mang link thẳng tới ticket (d.347)', async () => {
    const tk = await dungTicket(PJ, 7, 'Việc có tin');
    await dungTin('tb-1', { tao_luc: TRUA, ticket_id: tk, noi_dung: 'Phiên đứng' });
    const kenh = datNguonTelegram();

    const kq = await quetGuiThongBao(env, TRUA);
    expect([kq.so_dong, kq.so_gui, kq.so_truot, kq.so_hoan]).toEqual([1, 1, 0, 0]);

    expect(kenh.da_gui).toEqual([
      { noi_dung: 'Phiên đứng', link: 'https://baton.test/t/SAI-7' },
    ]);
    const d = await tinTrongDb('tb-1');
    expect(d?.gui_telegram_luc).not.toBeNull();
    expect(d?.gui_loi_ly_do).toBeNull();
  });

  it('lượt quét THỨ HAI không gửi lại tin đã có mốc — `WHERE gui_telegram_luc IS NULL`', async () => {
    await dungTin('tb-1', { tao_luc: TRUA });
    const kenh = datNguonTelegram();

    await quetGuiThongBao(env, TRUA);
    const lan_2 = await quetGuiThongBao(env, TRUA);

    expect(kenh.soLanGoi()).toBe(1);
    expect([lan_2.so_dong, lan_2.so_gui]).toEqual([0, 0]);
  });

  it('cửa ghi kiểm LẠI "đã gửi chưa": mốc có sẵn ⇒ `ghiMocGui` không ghi gì', async () => {
    // Dựng đúng ca hai lượt cron chồng nhau: dòng **đã** có mốc, nhưng một lượt
    // cũ vẫn gọi tới cửa ghi với kết quả "đã gửi".
    await dungTin('tb-1', { tao_luc: TRUA, gui_telegram_luc: TRUA - 1 });
    const { goiGhiMocGui } = await import('../src/workspace-gate.js');
    const kq = await goiGhiMocGui(env, {
      workspace_id: WS,
      thong_bao_id: 'tb-1',
      ket_qua: { da_gui: true },
    });
    expect(kq.da_ghi).toBe(false);
    expect((await tinTrongDb('tb-1'))?.gui_telegram_luc).toBe(TRUA - 1);
  });

  it('mốc gửi chỉ đặt MỘT LẦN ở tầng dữ liệu — trigger của 0019 chặn SQL thô', async () => {
    await dungTin('tb-1', { tao_luc: TRUA, gui_telegram_luc: TRUA });
    await expect(
      env.DB.prepare('UPDATE thong_bao SET gui_telegram_luc = ? WHERE id = ?')
        .bind(TRUA + 5_000, 'tb-1')
        .run(),
    ).rejects.toThrow(/chi dat mot lan/);
  });

  it('thiếu `BATON_URL_CONG_KHAI` ⇒ tin VẪN gửi, chỉ không có link', async () => {
    await dungTin('tb-1', { tao_luc: TRUA });
    const kenh = datNguonTelegram();
    const kq = await quetGuiThongBao(
      { ...env, BATON_URL_CONG_KHAI: undefined },
      TRUA,
    );
    expect(kq.so_gui).toBe(1);
    expect(kenh.da_gui[0]?.link).toBeNull();
  });
});

/* ================================================================== *
 * C. Giờ yên lặng qua đường thật — d.347, 19.8 d.535
 * ================================================================== */

describe('mục 12 d.347 — giờ yên lặng: chỉ 🔴 được gửi, phần còn lại HOÃN', () => {
  it('tin thường lúc 02:00 ⇒ hoãn (không gửi, không ghi gì); 🔴 khẩn ⇒ gửi ngay', async () => {
    await dungTin('tb-thuong', { tao_luc: DEM, uu_tien: 'thuong' });
    await dungTin('tb-khan', { tao_luc: DEM, uu_tien: 'khan', loai: 'can_chu_do' });
    const kenh = datNguonTelegram();

    const kq = await quetGuiThongBao(env, DEM);

    expect([kq.so_dong, kq.so_gui, kq.so_hoan]).toEqual([2, 1, 1]);
    expect(kenh.da_gui.length).toBe(1);
    expect((await tinTrongDb('tb-khan'))?.gui_telegram_luc).not.toBeNull();
    // Tin hoãn **không bị bỏ** và **không bị tính một lần thử**.
    const t = await tinTrongDb('tb-thuong');
    expect(t?.gui_telegram_luc).toBeNull();
    expect(t?.gui_so_lan_thu).toBe(0);
  });

  it('cùng tin đó, sau 07:00 thì ĐƯỢC gửi — hoãn chứ không bỏ (19.8 d.535)', async () => {
    await dungTin('tb-thuong', { tao_luc: DEM });
    const kenh = datNguonTelegram();

    await quetGuiThongBao(env, DEM);
    expect(kenh.soLanGoi()).toBe(0);

    const kq = await quetGuiThongBao(env, gioVN(7));
    expect(kq.so_gui).toBe(1);
    expect(kenh.soLanGoi()).toBe(1);
  });
});

/* ================================================================== *
 * D. Gộp "Ticket Xong" 15 phút qua đường thật — d.345
 * ================================================================== */

describe('mục 12 d.345 — Ticket Xong: tối đa 1 tin mỗi 15 phút', () => {
  it('ba tin `ticket_xong` trong cùng lượt ⇒ gửi ĐÚNG MỘT, hai tin kia hoãn', async () => {
    for (const [i, id] of ['tx-1', 'tx-2', 'tx-3'].entries()) {
      await dungTin(id, { loai: 'ticket_xong', tao_luc: TRUA + i });
    }
    const kenh = datNguonTelegram();

    const kq = await quetGuiThongBao(env, TRUA);

    expect([kq.so_dong, kq.so_gui, kq.so_hoan]).toEqual([3, 1, 2]);
    expect(kenh.soLanGoi()).toBe(1);
    // Tin **cũ nhất** đi trước (`ORDER BY tao_luc, id`).
    expect((await tinTrongDb('tx-1'))?.gui_telegram_luc).not.toBeNull();
    expect((await tinTrongDb('tx-2'))?.gui_telegram_luc).toBeNull();
  });

  it('một tin `ticket_xong` đã gửi 14 phút trước ⇒ tin mới HOÃN; sau 15 phút thì gửi', async () => {
    await dungTin('tx-cu', {
      loai: 'ticket_xong',
      tao_luc: TRUA - 15 * 60_000,
      gui_telegram_luc: TRUA - 14 * 60_000,
    });
    await dungTin('tx-moi', { loai: 'ticket_xong', tao_luc: TRUA });
    const kenh = datNguonTelegram();

    expect((await quetGuiThongBao(env, TRUA)).so_hoan).toBe(1);
    expect(kenh.soLanGoi()).toBe(0);

    expect((await quetGuiThongBao(env, TRUA + 60_000)).so_gui).toBe(1);
  });

  it('luật gộp KHÔNG chặn loại khác: một tin `phien_dung` vẫn đi cùng lượt', async () => {
    await dungTin('tx-1', { loai: 'ticket_xong', tao_luc: TRUA });
    await dungTin('tx-2', { loai: 'ticket_xong', tao_luc: TRUA + 1 });
    await dungTin('pd-1', { loai: 'phien_dung', tao_luc: TRUA + 2 });
    datNguonTelegram();

    const kq = await quetGuiThongBao(env, TRUA);
    expect([kq.so_gui, kq.so_hoan]).toEqual([2, 1]);
    expect((await tinTrongDb('pd-1'))?.gui_telegram_luc).not.toBeNull();
  });
});

/* ================================================================== *
 * E. Thử lại 3 lần, rồi "Cần chú ý" — 19.12 câu 6
 * ================================================================== */

describe('19.12 câu 6 — gửi trượt: thử lại 3 lần giãn 10 giây / 60 giây / 5 phút', () => {
  it('lần trượt thứ nhất ⇒ `so_lan_thu = 1`, mốc thử lại = +10 giây, có lý do', async () => {
    await dungTin('tb-1', { tao_luc: TRUA });
    datNguonTelegram({ loi: 'Telegram trả mã 500.' });

    const kq = await quetGuiThongBao(env, TRUA);
    expect([kq.so_gui, kq.so_truot]).toEqual([0, 1]);

    const d = await tinTrongDb('tb-1');
    expect(d?.gui_telegram_luc).toBeNull();
    expect(d?.gui_so_lan_thu).toBe(1);
    expect(d?.gui_loi_ly_do).toBe('Telegram trả mã 500.');
    // Mốc là **mốc thật**, không một cờ: nó đo được.
    expect((d?.gui_thu_lai_luc ?? 0) - Date.now()).toBeLessThanOrEqual(GIAN_THU_LAI_GUI_MS[0]!);
    expect((d?.gui_thu_lai_luc ?? 0) - Date.now()).toBeGreaterThan(0);
  });

  it('CHƯA tới mốc thử lại thì lượt sau KHÔNG gọi mạng lần nữa', async () => {
    await dungTin('tb-1', { tao_luc: TRUA, gui_so_lan_thu: 1, gui_thu_lai_luc: TRUA + 10_000 });
    const kenh = datNguonTelegram();

    expect((await quetGuiThongBao(env, TRUA)).so_hoan).toBe(1);
    expect(kenh.soLanGoi()).toBe(0);
  });

  it('trượt lần thứ 4 (hết 3 lần thử lại) ⇒ mốc thử lại NULL, và tin hiện ở "Cần chú ý"', async () => {
    await dungTin('tb-1', {
      tao_luc: TRUA,
      gui_so_lan_thu: 3,
      gui_thu_lai_luc: TRUA - 1,
      noi_dung: 'Phiên của agent ag-x: đứng.',
    });
    datNguonTelegram({ loi: 'Telegram trả mã 401.' });

    await quetGuiThongBao(env, TRUA);
    const d = await tinTrongDb('tb-1');
    expect(d?.gui_so_lan_thu).toBe(4);
    expect(d?.gui_thu_lai_luc).toBeNull();

    // Lượt sau **không** gửi nữa (hết lượt) — tin giữ trong chuông.
    const kenh = datNguonTelegram();
    const lan_sau = await quetGuiThongBao(env, TRUA + 3_600_000);
    expect([lan_sau.so_dong, lan_sau.so_gui]).toEqual([0, 0]);
    expect(kenh.soLanGoi()).toBe(0);

    // Và nó lên "Cần chú ý" với đúng nhãn + lý do (không mang secret nào).
    const tq = await tongQuan(env.DB, { loai: 'chu' }, WS, TRUA + 3_600_000);
    // `can_chu_y` gom theo ticket (d.321, BAT-6 đợt 3); một tin không gửi được
    // **không** có ticket nào nên nó là một nhóm riêng một lý do.
    const dong = tq.can_chu_y
      .flatMap((n) => n.ly_do)
      .filter((x) => x.loai === 'thong_bao_gui_truot');
    expect(dong.length).toBe(1);
    expect(dong[0]?.nhan_loai).toBe('Không gửi được thông báo Telegram');
    expect(dong[0]?.thong_bao?.ly_do).toBe('Telegram trả mã 401.');
    // Và nó đứng riêng, không bị gom vào một dòng ticket nào.
    expect(tq.can_chu_y.filter((n) => n.ticket === null).length).toBe(1);
  });

  it('một tin MỚI trượt lần đầu CHƯA lên "Cần chú ý" (chỉ khi hết lượt thử)', async () => {
    await dungTin('tb-1', { tao_luc: TRUA, gui_so_lan_thu: 1, gui_loi_ly_do: 'Lỗi mạng.' });
    const tq = await tongQuan(env.DB, { loai: 'chu' }, WS, TRUA);
    expect(
      tq.can_chu_y.flatMap((n) => n.ly_do).filter((x) => x.loai === 'thong_bao_gui_truot'),
    ).toEqual([]);
  });

  it('thất bại gửi KHÔNG chặn luồng chính: lệnh tạo mục 🔴 vẫn 201 khi kênh trượt', async () => {
    datNguonTelegram({ loi: 'Telegram trả mã 500.' });
    const r = await goiApi('/v1/can-chu', T_COORD, {
      method: 'POST',
      than: { tieu_de: 'Sập production', muc: 'urgent', loai: 'run_command', lenh: 'kubectl get po' },
    });
    expect(r.status).toBe(201);
    // Lượt cron sau đó trượt, và vẫn không ai thấy một lỗi nào.
    const kq = await quetGuiThongBao(env, TRUA);
    expect(kq.so_truot).toBe(1);
    expect(kq.so_loi).toBe(0);
  });
});

/* ================================================================== *
 * F. Secret không bao giờ in ra — CLAUDE.md mục 5, SPEC mục 15 d.417
 * ================================================================== */

describe('mục 15 d.417 — bot token không đi vào lý do, log hay DB', () => {
  const TOKEN_GIA = '123456789:AAHgiatokenkhongphaithatchiladetest00';

  it('`fetch` TIÊM VÀO: thân hàm thật chạy, KHÔNG một lời gọi nào ra api.telegram.org', async () => {
    const url_da_goi: string[] = [];
    const nguon = nguonTelegramThat(TOKEN_GIA, '42', {
      goi: (url) => {
        url_da_goi.push(url);
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      },
    });
    const kq = await nguon?.guiTin({ noi_dung: 'xin chào', link: null });

    expect(kq).toEqual({ da_gui: true });
    // Đúng một lời gọi, và nó đi vào **bản giả** — không request nào ra mạng.
    expect(url_da_goi.length).toBe(1);
    expect(url_da_goi.every((u) => !u.startsWith('https://api.telegram.org'))).toBe(false);
    // (URL thật *là* api.telegram.org, nhưng nó chỉ tới hàm giả ở trên.)
  });

  it('lỗi HTTP ⇒ lý do chỉ mang MÃ, không URL và không token', async () => {
    const nguon = nguonTelegramThat(TOKEN_GIA, '42', {
      goi: () => Promise.resolve(new Response('{"ok":false,"error_code":401}', { status: 401 })),
    });
    const kq = await nguon?.guiTin({ noi_dung: 'xin chào', link: null });
    const loi = kq !== undefined && 'loi' in kq ? kq.loi : '';
    expect(loi).toContain('401');
    expect(loi).not.toContain(TOKEN_GIA);
    expect(loi).not.toContain('api.telegram.org');
  });

  it('lỗi mạng ⇒ lý do KHÔNG mang lỗi gốc (lỗi gốc của fetch chứa URL, tức token)', async () => {
    const nguon = nguonTelegramThat(TOKEN_GIA, '42', {
      goi: () => Promise.reject(new Error(`fetch failed: https://api.telegram.org/bot${TOKEN_GIA}/sendMessage`)),
    });
    const kq = await nguon?.guiTin({ noi_dung: 'xin chào', link: null });
    const loi = kq !== undefined && 'loi' in kq ? kq.loi : '';
    expect(loi).toBe('Không gọi được Telegram (lỗi mạng hoặc quá hạn chờ).');
    expect(loi).not.toContain(TOKEN_GIA);
  });

  it('`description` của Telegram đi qua bộ lọc: đoạn trông như token bị thay', async () => {
    const nguon = nguonTelegramThat(TOKEN_GIA, '42', {
      goi: () =>
        Promise.resolve(
          new Response(JSON.stringify({ description: `Unauthorized for bot${TOKEN_GIA}` }), {
            status: 401,
          }),
        ),
    });
    const kq = await nguon?.guiTin({ noi_dung: 'x', link: null });
    const loi = kq !== undefined && 'loi' in kq ? kq.loi : '';
    expect(loi).not.toContain(TOKEN_GIA);
    expect(loi).toContain('(đã lọc)');
  });

  it('bộ lọc cắt chuỗi quá dài và thay mọi đoạn dạng token', () => {
    expect(locChuoiAnToan(`a ${TOKEN_GIA} b`)).toBe('a (đã lọc) b');
    expect(locChuoiAnToan('x'.repeat(500)).length).toBeLessThanOrEqual(201);
  });
});

/* ================================================================== *
 * G. 🔴 mới ⇒ một dòng `thong_bao` — mục 8 d.283, mục 12 d.341
 * ================================================================== */

describe('mục 8 d.283 — mục 🔴 mới thì bắn ngay, 🟡 và ⚪ thì không', () => {
  const GAP = { tieu_de: 'Sập production', muc: 'urgent', loai: 'run_command', lenh: 'kubectl get po' };

  it('🔴 mới ⇒ đúng 1 dòng `thong_bao` loại `can_chu_do`, `uu_tien = khan`, trỏ tới mục', async () => {
    const r = await goiApi('/v1/can-chu', T_COORD, { method: 'POST', than: { ...GAP, project_id: PJ } });
    expect(r.status).toBe(201);
    const t = await r.json<Record<string, unknown>>();

    const ds = await tinTheoThuTu();
    expect(ds.length).toBe(1);
    expect(ds[0]?.loai).toBe('can_chu_do');
    expect(ds[0]?.uu_tien).toBe('khan');
    expect(ds[0]?.can_chu_id).toBe(t['id']);
    expect(ds[0]?.noi_dung).toContain(maCanChu(t['ma_so'] as number));
    expect(ds[0]?.noi_dung).toContain('Sập production');
    // Chưa ra kênh ngoài: việc đó là của cron gửi.
    expect(ds[0]?.gui_telegram_luc).toBeNull();
  });

  it('🟡 và ⚪ ⇒ KHÔNG dòng `thong_bao` nào (d.283: chỉ vào tóm tắt sáng/tối)', async () => {
    await goiApi('/v1/can-chu', T_COORD, {
      method: 'POST',
      than: { ...GAP, muc: 'today', tieu_de: 'Chọn thư viện' },
    });
    await goiApi('/v1/can-chu', T_COORD, {
      method: 'POST',
      than: { ...GAP, muc: 'later', tieu_de: 'Dọn repo' },
    });
    expect(await tinTheoThuTu()).toEqual([]);
  });

  it('19.8 d.534: `fyi` gửi 🔴 bị hạ về 🟡 ⇒ mục đó KHÔNG bắn tin', async () => {
    const r = await goiApi('/v1/can-chu', T_COORD, {
      method: 'POST',
      than: { tieu_de: 'Đã dọn log', muc: 'urgent', loai: 'fyi' },
    });
    const t = await r.json<Record<string, unknown>>();
    expect(t['muc']).toBe('today');
    expect(t['muc_da_ha']).toBe(true);
    // Đây là ca dễ cài sai nhất của lượt này: nếu tin được bắn theo **mức agent
    // gửi** thay vì mức **đã ghi**, một mục ở khối 🟡 sẽ bắn một tin 🔴 khẩn
    // xuyên qua giờ yên lặng.
    expect(await tinTheoThuTu()).toEqual([]);
  });

  it('tin 🔴 mới ĐƯỢC gửi trong giờ yên lặng (19.8 d.535), qua đường cron thật', async () => {
    await goiApi('/v1/can-chu', T_COORD, { method: 'POST', than: GAP });
    const kenh = datNguonTelegram();
    const kq = await quetGuiThongBao(env, DEM);
    expect(kq.so_gui).toBe(1);
    expect(kenh.da_gui[0]?.link).toBe('https://baton.test/can-chu');
  });
});

/* ================================================================== *
 * H. Nhắc 🔴 sau 2 giờ, đúng 1 lần — mục 8 d.283, d.291
 * ================================================================== */

describe('mục 8 d.283 — 🔴 chưa xử lý sau 2 giờ thì nhắc 1 lần', () => {
  it('quá 2 giờ ⇒ một lời nhắc vào kho + mốc `nhac_do_luc`; lượt sau KHÔNG nhắc lại', async () => {
    await dungCanChu('ct-1', {
      muc: 'urgent',
      loai: 'run_command',
      tao_luc: TRUA - NHAC_DO_SAU_MS,
      tieu_de: 'Sập production',
    });

    const lan_1 = await quetNhacCanChuDo(env, TRUA, NHAC_DO_SAU_MS);
    expect([lan_1.so_dong, lan_1.so_nhac, lan_1.so_loi]).toEqual([1, 1, 0]);

    const ds = await tinTheoThuTu();
    expect(ds.length).toBe(1);
    expect(ds[0]?.loai).toBe('can_chu_do');
    expect(ds[0]?.can_chu_id).toBe('ct-1');
    expect(ds[0]?.noi_dung).toContain('Vẫn chờ Chủ');
    expect(await mocNhacDoCua('ct-1')).not.toBeNull();

    // **Nhắc 1 lần** (d.291 "KHÔNG nhắc lặp nhiều lần"): mục đã rời câu quét.
    const lan_2 = await quetNhacCanChuDo(env, TRUA + 3_600_000, NHAC_DO_SAU_MS);
    expect([lan_2.so_dong, lan_2.so_nhac]).toEqual([0, 0]);
    expect((await tinTheoThuTu()).length).toBe(1);
  });

  it('CHƯA đủ 2 giờ ⇒ không nhắc (ca đối chứng của biên)', async () => {
    await dungCanChu('ct-1', {
      muc: 'urgent',
      loai: 'run_command',
      tao_luc: TRUA - NHAC_DO_SAU_MS + 1,
    });
    expect((await quetNhacCanChuDo(env, TRUA, NHAC_DO_SAU_MS)).so_nhac).toBe(0);
    expect(await tinTheoThuTu()).toEqual([]);
  });

  it('🟡 quá 2 giờ, và 🔴 ĐÃ xử lý quá 2 giờ ⇒ cả hai KHÔNG được nhắc', async () => {
    await dungCanChu('ct-vang', { muc: 'today', loai: 'fyi', tao_luc: TRUA - NHAC_DO_SAU_MS });
    await dungCanChu('ct-xong', {
      muc: 'urgent',
      // **Không** `fyi`: `CHECK` của 0013 (19.8 d.534) không cho `fyi` mang 🔴, và
      // fixture tôn trọng luật đó bằng cách hạ về 🟡 — một mục 🟡 thì ca này không
      // còn nói được điều nó muốn nói.
      loai: 'run_command',
      trang_thai: 'resolved',
      tao_luc: TRUA - NHAC_DO_SAU_MS,
    });
    expect((await quetNhacCanChuDo(env, TRUA, NHAC_DO_SAU_MS)).so_nhac).toBe(0);
    expect(await tinTheoThuTu()).toEqual([]);
  });

  it('cửa ghi kiểm LẠI luật: mục vừa được xử lý giữa lúc quét và lúc ghi ⇒ không nhắc', async () => {
    await dungCanChu('ct-1', {
      muc: 'urgent',
      loai: 'run_command',
      trang_thai: 'resolved',
      tao_luc: TRUA - NHAC_DO_SAU_MS,
    });
    const { goiNhacCanChuDo } = await import('../src/workspace-gate.js');
    const kq = await goiNhacCanChuDo(env, { workspace_id: WS, can_chu_id: 'ct-1' });
    expect(kq.da_ghi).toBe(false);
    expect(await tinTheoThuTu()).toEqual([]);
  });

  it('mốc nhắc chỉ đặt MỘT LẦN ở tầng dữ liệu — trigger của 0019 chặn SQL thô', async () => {
    await dungCanChu('ct-1', { muc: 'urgent', loai: 'run_command' });
    await env.DB.prepare('UPDATE can_chu SET nhac_do_luc = ? WHERE id = ?').bind(TRUA, 'ct-1').run();
    await expect(
      env.DB.prepare('UPDATE can_chu SET nhac_do_luc = NULL WHERE id = ?').bind('ct-1').run(),
    ).rejects.toThrow(/chi dat mot lan/);
  });

  it('lời nhắc KHÔNG hưởng ngoại lệ 🔴 của giờ yên lặng — nó là tin `thuong` (19.8 d.535)', async () => {
    await dungCanChu('ct-1', {
      muc: 'urgent',
      loai: 'run_command',
      tao_luc: DEM - NHAC_DO_SAU_MS,
    });
    await quetNhacCanChuDo(env, DEM, NHAC_DO_SAU_MS);
    const ds = await tinTheoThuTu();
    expect(ds[0]?.uu_tien).toBe('thuong');

    // Và vì vậy nó **hoãn** tới 07:00 thay vì đi lúc 2 giờ sáng.
    const kenh = datNguonTelegram();
    expect((await quetGuiThongBao(env, DEM)).so_hoan).toBe(1);
    expect(kenh.soLanGoi()).toBe(0);
    expect((await quetGuiThongBao(env, gioVN(7))).so_gui).toBe(1);
  });
});

/* ================================================================== *
 * I. Sổ tra nhịp cron — một chỗ duy nhất
 * ================================================================== */

describe('nhịp cron — `viecCuaCron` là sổ tra duy nhất', () => {
  it('việc gửi + nhắc đi ở MỌI nhịp, vì nhịp của nó là MỖI PHÚT', () => {
    /** Một `scheduledTime` rơi đúng phút `phut` của giờ `gio` UTC. */
    const nhip = (gio: number, phut: number): number => Date.UTC(2026, 9, 6, gio, phut);

    expect(viecCuaCron(nhip(3, 1))).toEqual({
      thu_lai: true,
      theo_doi: false,
      canh_bao: false,
      thong_bao: true,
      bao_cao_sang: false,
      bao_cao_toi: false,
      sao_luu: false,
    });

    /*
     * Từ 10/10 chỉ còn **một** cron `* * * * *` (gói Free: 5 cron mỗi tài khoản, lỗi
     * 10072 ngày 07/10), nên `thong_bao` bật ở **mọi** mốc — kể cả hai mốc báo cáo.
     * Giãn cách thử lại nhỏ nhất của 19.12 câu 6 là **10 giây**, nên nhịp mỗi phút
     * là nhịp đúng cho việc này và không có mốc nào nó được phép nghỉ.
     */
    for (const [gio, phut] of [
      [3, 5],
      [3, 10],
      [0, 30],
      [13, 0],
      [2, 0],
    ] as const) {
      expect(viecCuaCron(nhip(gio, phut)).thong_bao, `${String(gio)}:${String(phut)}`).toBe(
        true,
      );
    }

    /*
     * Hai mốc báo cáo của mục 11 vẫn **không tự gửi** gì: chúng chỉ đặt tin vào kho,
     * và đưa tin ra Telegram là việc của lượt `thong_bao`. Điều giữ cho giờ yên lặng
     * d.347 có **một** bộ luật là **thứ tự** trong `chayCron` (`thong_bao` chạy
     * trước `bao_cao`, nên tin vừa sinh ra kênh ở nhịp sau), không một ô `false` ở
     * đây — ca "tin báo cáo RA kênh" ở `bao-cao.test.ts` canh đúng điều đó.
     */
    expect(viecCuaCron(nhip(0, 30))).toMatchObject({ bao_cao_sang: true, thong_bao: true });
  });
});

/* ================================================================== *
 * J. Tin đi xuyên workspace — SPEC mục 1, 18
 * ================================================================== */

describe('mục 1 — một tin không trỏ tới mục Cần Chủ của workspace khác', () => {
  it('trigger `tg_thong_bao_ws_them` (0019) chặn `can_chu_id` lệch workspace', async () => {
    const t = Date.now();
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind('ws-zz', 'Người khác', t, t)
      .run();
    await dungCanChu('ct-1', { muc: 'urgent', loai: 'fyi' });

    await expect(
      env.DB.prepare(
        `INSERT INTO thong_bao (id, workspace_id, loai, noi_dung, can_chu_id, tao_luc)
         VALUES (?, 'ws-zz', 'can_chu_do', 'x', 'ct-1', ?)`,
      )
        .bind('tb-xau', t)
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('`uu_tien` của một tin là BẤT BIẾN — không kéo một tin thường thành khẩn', async () => {
    await dungTin('tb-1', { tao_luc: TRUA, uu_tien: 'thuong' });
    await expect(
      env.DB.prepare("UPDATE thong_bao SET uu_tien = 'khan' WHERE id = ?").bind('tb-1').run(),
    ).rejects.toThrow(/khong sua duoc/);
  });
});

/** Dùng `TOKEN_CHU` ở một ca để lint không báo import không dùng. */
it('token chủ vẫn vào được đường Tổng quan (nền của khối E)', async () => {
  const r = await goiApi('/v1/tong-quan', TOKEN_CHU);
  expect(r.status).toBe(200);
});
