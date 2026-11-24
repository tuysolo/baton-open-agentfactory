/**
 * **Luật THUẦN của việc gửi thông báo** — SPEC mục 12 d.345, d.347; mục 8 d.283,
 * d.291; 19.8 d.535; 19.12 câu 6 và câu 60.
 *
 * Không DB, không mạng, không Miniflare cho khối này: `@baton/shared/thong-bao.ts`
 * là một hàm thuần, nên biên của nó ghim được bằng số học. Đường đi qua DB và cron
 * ở `cron-thong-bao.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  GIAN_THU_LAI_GUI_MS,
  GIO_YEN_LANG_BAT_DAU,
  GIO_YEN_LANG_KET_THUC,
  GOP_TICKET_XONG_MS,
  MUI_GIO_CHU_PHUT,
  NHAC_DO_SAU_MS,
  SO_LAN_GUI_TOI_DA,
  SO_LAN_THU_LAI_TOI_DA,
  canNhacDo,
  cuoiGioYenLang,
  gioDiaPhuong,
  mocThuLaiGui,
  quyetDinhGuiTin,
  trongGioYenLang,
  type TinDeGui,
} from '@baton/shared';

/** Mốc epoch của một giờ **trên tường** của chủ (UTC+7) trong ngày 2026-10-06. */
function gioVN(gio: number, phut = 0): number {
  return Date.UTC(2026, 9, 6, gio, phut) - MUI_GIO_CHU_PHUT * 60_000;
}

const TIN: TinDeGui = {
  loai: 'phien_dung',
  uu_tien: 'thuong',
  gui_telegram_luc: null,
  gui_so_lan_thu: 0,
  gui_thu_lai_luc: null,
};

describe('giờ yên lặng 23:00–07:00 — mục 12 d.347, 19.12 câu 60', () => {
  it('hằng là đúng chữ SPEC, và dùng đúng múi giờ của câu 60 (không có độ lệch thứ hai)', () => {
    expect([GIO_YEN_LANG_BAT_DAU, GIO_YEN_LANG_KET_THUC]).toEqual([23, 7]);
    // `gioDiaPhuong` là **cùng** hàm mà hạn mặc định 🟡 của 19.8 dùng. Nếu một
    // lượt sau khai một độ lệch thứ hai cho giờ yên lặng thì ca này đỏ.
    expect(gioDiaPhuong(gioVN(23, 30))).toBe(23);
    expect(gioDiaPhuong(gioVN(6, 59))).toBe(6);
  });

  it('BIÊN: 23:00 thuộc khung, 22:59 không; 06:59 thuộc, 07:00 không', () => {
    expect(trongGioYenLang(gioVN(23, 0))).toBe(true);
    expect(trongGioYenLang(gioVN(22, 59))).toBe(false);
    expect(trongGioYenLang(gioVN(6, 59))).toBe(true);
    expect(trongGioYenLang(gioVN(7, 0))).toBe(false);
  });

  it('khung VẮT QUA nửa đêm: 00:30 và 02:00 vẫn là giờ yên lặng', () => {
    // Ca này là ca bắt lỗi `23 <= gio && gio < 7` (một điều kiện không bao giờ
    // đúng, tức giờ yên lặng thành mã chết).
    expect(trongGioYenLang(gioVN(0, 30))).toBe(true);
    expect(trongGioYenLang(gioVN(2, 0))).toBe(true);
  });

  it('cuối giờ yên lặng: 23:30 → 07:00 HÔM SAU; 02:00 → 07:00 cùng ngày', () => {
    expect(cuoiGioYenLang(gioVN(23, 30))).toBe(gioVN(7) + 24 * 3_600_000);
    expect(cuoiGioYenLang(gioVN(2, 0))).toBe(gioVN(7));
    // Ngoài khung thì không có gì để đợi.
    expect(cuoiGioYenLang(gioVN(12, 0))).toBe(gioVN(12, 0));
  });

  it('mốc hoãn KHÔNG tự hoãn thêm 24 giờ: 07:00 ở ngoài khung', () => {
    const moc = cuoiGioYenLang(gioVN(2, 0));
    expect(trongGioYenLang(moc)).toBe(false);
  });
});

describe('quyết định gửi — thứ tự xét là luật', () => {
  it('tin THƯỜNG trong giờ yên lặng ⇒ HOÃN tới 07:00, không bỏ (19.8 d.535)', () => {
    const q = quyetDinhGuiTin(TIN, gioVN(2, 0));
    expect(q.hanh_dong).toBe('hoan');
    expect(q.hanh_dong === 'hoan' ? q.moc : null).toBe(gioVN(7));
  });

  it('tin 🔴 KHẨN trong giờ yên lặng ⇒ GỬI NGAY (d.347 "chỉ 🔴 được gửi")', () => {
    const q = quyetDinhGuiTin({ ...TIN, uu_tien: 'khan' }, gioVN(2, 0));
    expect(q.hanh_dong).toBe('gui');
  });

  it('tin THƯỜNG ngoài giờ yên lặng ⇒ GỬI (ca đối chứng của ca trên)', () => {
    expect(quyetDinhGuiTin(TIN, gioVN(12, 0)).hanh_dong).toBe('gui');
  });

  it('đã có mốc `gui_telegram_luc` ⇒ KHÔNG gửi lại, kể cả tin 🔴 giữa ban ngày', () => {
    const q = quyetDinhGuiTin(
      { ...TIN, uu_tien: 'khan', gui_telegram_luc: gioVN(11) },
      gioVN(12, 0),
    );
    expect(q.hanh_dong).toBe('khong');
  });

  it('trượt 4 lần (1 + 3 thử lại) ⇒ KHÔNG gửi nữa; trượt 3 lần thì CÒN một lượt', () => {
    expect(quyetDinhGuiTin({ ...TIN, gui_so_lan_thu: 4 }, gioVN(12, 0)).hanh_dong).toBe('khong');
    // Ca đối chứng, và nó là ca bắt đúng lỗi "thử lại 3 lần" đọc thành "tổng 3
    // lần gửi": với cách đọc sai thì lần thử lại thứ ba không bao giờ chạy.
    expect(quyetDinhGuiTin({ ...TIN, gui_so_lan_thu: 3 }, gioVN(12, 0)).hanh_dong).toBe('gui');
  });

  it('chưa tới mốc thử lại ⇒ HOÃN; tới đúng mốc ⇒ GỬI', () => {
    const bay_gio = gioVN(12, 0);
    expect(
      quyetDinhGuiTin({ ...TIN, gui_so_lan_thu: 1, gui_thu_lai_luc: bay_gio + 1 }, bay_gio)
        .hanh_dong,
    ).toBe('hoan');
    expect(
      quyetDinhGuiTin({ ...TIN, gui_so_lan_thu: 1, gui_thu_lai_luc: bay_gio }, bay_gio).hanh_dong,
    ).toBe('gui');
  });

  it('giờ yên lặng xét TRƯỚC luật gộp: tin Ticket Xong lúc 02:00 đợi tới 07:00', () => {
    const q = quyetDinhGuiTin({ ...TIN, loai: 'ticket_xong' }, gioVN(2, 0), {
      moc_ticket_xong_cuoi: null,
    });
    expect(q.hanh_dong === 'hoan' ? q.moc : null).toBe(gioVN(7));
  });
});

describe('gộp "Ticket Xong" tối đa 1 tin mỗi 15 phút — mục 12 d.345', () => {
  const XONG: TinDeGui = { ...TIN, loai: 'ticket_xong' };

  it('vừa gửi một tin cách đây 14 phút ⇒ HOÃN tới mốc + 15 phút', () => {
    const bay_gio = gioVN(12, 0);
    const cuoi = bay_gio - 14 * 60_000;
    const q = quyetDinhGuiTin(XONG, bay_gio, { moc_ticket_xong_cuoi: cuoi });
    expect(q.hanh_dong).toBe('hoan');
    expect(q.hanh_dong === 'hoan' ? q.moc : null).toBe(cuoi + GOP_TICKET_XONG_MS);
  });

  it('BIÊN: đúng 15 phút ⇒ GỬI; 15 phút trừ 1 ms ⇒ HOÃN', () => {
    const bay_gio = gioVN(12, 0);
    expect(
      quyetDinhGuiTin(XONG, bay_gio, { moc_ticket_xong_cuoi: bay_gio - GOP_TICKET_XONG_MS })
        .hanh_dong,
    ).toBe('gui');
    expect(
      quyetDinhGuiTin(XONG, bay_gio, { moc_ticket_xong_cuoi: bay_gio - GOP_TICKET_XONG_MS + 1 })
        .hanh_dong,
    ).toBe('hoan');
  });

  it('luật gộp CHỈ áp cho `ticket_xong`: một tin loại khác không bị hoãn', () => {
    const bay_gio = gioVN(12, 0);
    expect(
      quyetDinhGuiTin(TIN, bay_gio, { moc_ticket_xong_cuoi: bay_gio - 1_000 }).hanh_dong,
    ).toBe('gui');
  });
});

describe('thử lại 3 lần giãn 10 giây / 60 giây / 5 phút — 19.12 câu 6', () => {
  it('ba khoảng giãn đúng chữ SPEC; tổng số lần gửi là 1 + 3 = 4', () => {
    expect(GIAN_THU_LAI_GUI_MS).toEqual([10_000, 60_000, 300_000]);
    expect(SO_LAN_THU_LAI_TOI_DA).toBe(3);
    // Hai con số khác nhau, và lẫn chúng làm lần thử lại **thứ ba** (sau 5 phút)
    // không bao giờ chạy — xem `SO_LAN_GUI_TOI_DA`.
    expect(SO_LAN_GUI_TOI_DA).toBe(4);
  });

  it('mốc kế tiếp theo số lần đã trượt, rồi `null` ở lần trượt thứ tư', () => {
    const t = 1_000_000;
    expect(mocThuLaiGui(0, t)).toBe(t + 10_000);
    expect(mocThuLaiGui(1, t)).toBe(t + 60_000);
    expect(mocThuLaiGui(2, t)).toBe(t + 300_000);
    expect(mocThuLaiGui(3, t)).toBeNull();
  });
});

describe('nhắc 🔴 sau 2 giờ, đúng 1 lần — mục 8 d.283, d.291', () => {
  const t0 = gioVN(10, 0);
  const GOC = { muc: 'urgent', trang_thai: 'open', tao_luc: t0, nhac_do_luc: null };

  it('ngưỡng là 2 giờ, và BIÊN đúng 2 giờ đã là "sau 2 giờ"', () => {
    expect(NHAC_DO_SAU_MS).toBe(2 * 3_600_000);
    expect(canNhacDo(GOC, t0 + NHAC_DO_SAU_MS)).toBe(true);
    expect(canNhacDo(GOC, t0 + NHAC_DO_SAU_MS - 1)).toBe(false);
  });

  it('đã nhắc rồi ⇒ KHÔNG nhắc lại (d.291 "không nhắc lặp nhiều lần")', () => {
    expect(canNhacDo({ ...GOC, nhac_do_luc: t0 + NHAC_DO_SAU_MS }, t0 + 10 * 3_600_000)).toBe(
      false,
    );
  });

  it('🟡 và ⚪ KHÔNG bao giờ được nhắc (d.283: chỉ vào tóm tắt sáng/tối)', () => {
    const sau = t0 + 10 * 3_600_000;
    expect(canNhacDo({ ...GOC, muc: 'today' }, sau)).toBe(false);
    expect(canNhacDo({ ...GOC, muc: 'later' }, sau)).toBe(false);
  });

  it('mục đã xử lý hoặc bỏ qua ⇒ KHÔNG nhắc ("chưa xử lý")', () => {
    const sau = t0 + 10 * 3_600_000;
    expect(canNhacDo({ ...GOC, trang_thai: 'resolved' }, sau)).toBe(false);
    expect(canNhacDo({ ...GOC, trang_thai: 'skipped' }, sau)).toBe(false);
  });
});
