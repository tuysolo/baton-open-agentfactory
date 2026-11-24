/**
 * **BAT-73 — `layDuAn()` lấy ĐỦ mọi dự án**, và Tổng quan nói ra phần bị trần
 * `TRAN_DU_AN` cắt (`cau-hoi-spec.md` #181).
 *
 * Trước BAT-73, `layDuAn` gọi `/v1/du-an` một trang không `limit` ⇒ máy chủ trả
 * 50 dự án đầu (`LIMIT_TRANG_MAC_DINH`) và dự án thứ 51 trở đi biến mất khỏi
 * sidebar, hộp Tạo việc, bộ lọc. Máy chủ giả ở đây **phân trang thật** theo
 * `cursor` (kẹp `limit` về 200 như `kiemLimit`, mặc định 50 khi vắng), nên bản cũ
 * đỏ ở mọi ca 51/200/500.
 */

import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAU_LOI_KHONG_RO,
  LIMIT_TRANG_DU_AN,
  LoiApi,
  MA_PHAN_TRANG_HONG,
  TRAN_SO_TRANG_DU_AN,
  layDuAn,
  type DuAnSidebar,
  type TongQuan,
} from '../src/api';
import { App } from '../src/App';
import { Sidebar } from '../src/vo/sidebar';
import { NHAN_HOP_TAO_VIEC, NHAN_O_DU_AN } from '../src/vo/tao-viec';
import { NHAN_NUT_LOC, TrangDanhSachTicket } from '../src/trang/danh-sach-ticket';
import {
  TEN_KHOI,
  TRAN_DU_AN_TONG_QUAN,
  TrangTongQuan,
  soDuAnConLai,
} from '../src/trang/tong-quan';
import { cauConLai } from '../src/vo/cau-con-lai';
import { cauConLai as cauConLaiBanDo } from '../src/trang/ban-do';
import { KHOA_LOC_TICKET } from '../src/loc-ticket';
import { TOI_CHU, dung } from './giup';
import { doiAgent } from './than-agent';
import { THAN_AGENT, manHinhDanhSach } from './than-ticket';
import { TONG_QUAN_RONG, hangDuAn } from './than-tong-quan';
// Mã nguồn API đọc bằng `?raw` (nếp `tao-viec.test.tsx`): giao diện không nhập gói API.
import NGUON_TONG_QUAN_API from '../../api/src/doc-tong-quan.ts?raw';
import NGUON_KIEU_SHARED from '../../shared/src/kieu.ts?raw';

/* ------------------------------------------------------------------ *
 * Máy chủ giả có phân trang
 * ------------------------------------------------------------------ */

/** `n` dự án, mã `P001`…, tên `Dự án số 1`… — đúng thứ tự máy chủ trả. */
function dsDuAn(n: number): DuAnSidebar[] {
  return Array.from({ length: n }, (_, i) => {
    const so = i + 1;
    const ma = `P${String(so).padStart(3, '0')}`;
    return { id: `pj-${ma}`, ma, ten: `Dự án số ${String(so)}`, trang_thai: 'active', nhom: null };
  });
}

interface MayPhanTrang {
  da_goi: string[];
  /** Đặt để làm hỏng một trang (1-based) từ lượt gọi sau trở đi. */
  hong: { trang: number | null; cursor_lap: boolean; cursor_rong: boolean };
}

function json(than: unknown, status = 200): Response {
  return new Response(JSON.stringify(than), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * `GET /v1/du-an` phân trang theo offset mã hoá trong `cursor` (`c<offset>`), như
 * keyset của máy chủ nhìn từ ngoài: cursor mờ, `null` khi hết. `limit` vắng ⇒ 50,
 * lớn hơn 200 ⇒ 200 (`kiemLimit`). Các đường khác của vỏ trả thân rỗng hợp lệ.
 */
function gan(ds: DuAnSidebar[]): MayPhanTrang {
  const m: MayPhanTrang = { da_goi: [], hong: { trang: null, cursor_lap: false, cursor_rong: false } };
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    m.da_goi.push(duong);
    const url = new URL(duong, 'http://x');
    if (method === 'GET' && url.pathname === '/v1/du-an') {
      const lim_van = url.searchParams.get('limit');
      const limit = Math.min(lim_van === null ? 50 : Number(lim_van), 200);
      const cur = url.searchParams.get('cursor');
      const tu = cur === null ? 0 : Number(cur.slice(1));
      const so_trang = Math.floor(tu / limit) + 1;
      if (m.hong.trang === so_trang) {
        return Promise.resolve(json({ error: 'INTERNAL', message: 'Lỗi máy chủ giả.' }, 500));
      }
      const den = tu + limit;
      let cursor_sau: string | null = den < ds.length ? `c${String(den)}` : null;
      if (m.hong.cursor_lap && cursor_sau !== null) cursor_sau = 'c0';
      if (m.hong.cursor_rong) cursor_sau = '';
      return Promise.resolve(json({ items: ds.slice(tu, den), cursor_sau }));
    }
    if (method === 'GET' && url.pathname === '/v1/toi') return Promise.resolve(json(TOI_CHU));
    if (method === 'GET' && url.pathname === '/v1/can-chu') {
      return Promise.resolve(json({ huy_hieu: { so_cho: 0, muc_cao_nhat: null, so_theo_muc: { urgent: 0, today: 0, later: 0 } } }));
    }
    if (method === 'GET' && url.pathname === '/v1/man-hinh-agent') return Promise.resolve(json(doiAgent([])));
    if (method === 'GET' && url.pathname === '/v1/agent') return Promise.resolve(json(THAN_AGENT));
    if (method === 'GET' && url.pathname === '/v1/man-hinh-ticket') {
      return Promise.resolve(json(manHinhDanhSach([])));
    }
    return Promise.reject(new Error(`máy giả: không khai \`${method} ${duong}\``));
  }) as typeof globalThis.fetch;
  return m;
}

const goiDuAn = (m: MayPhanTrang): string[] =>
  m.da_goi.filter((d) => d.startsWith('/v1/du-an'));

/* ------------------------------------------------------------------ *
 * A. Hàm `layDuAn`
 * ------------------------------------------------------------------ */

describe('BAT-73 — layDuAn đi hết mọi trang theo cursor_sau', () => {
  it('cỡ trang bằng LIMIT_TRANG_TOI_DA của shared (máy chủ kẹp về đúng số này)', () => {
    expect(NGUON_KIEU_SHARED).toMatch(
      new RegExp(`export const LIMIT_TRANG_TOI_DA = ${String(LIMIT_TRANG_DU_AN)};`),
    );
    expect(LIMIT_TRANG_DU_AN).toBe(200);
  });

  it.each([
    [51, 1],
    [200, 1],
    [201, 2],
    [500, 3],
  ])('%i dự án ⇒ trả đủ, đúng thứ tự, %i lượt gọi, lượt nào cũng gửi limit=200', async (n, so_luot) => {
    const ds = dsDuAn(n);
    const m = gan(ds);
    const kq = await layDuAn();
    expect(kq.items.map((d) => d.id)).toEqual(ds.map((d) => d.id));
    expect(kq.cursor_sau).toBeNull();
    const goi = goiDuAn(m);
    expect(goi).toHaveLength(so_luot);
    expect(goi[0]).toBe('/v1/du-an?limit=200');
    for (const d of goi) expect(new URL(d, 'http://x').searchParams.get('limit')).toBe('200');
    // Trang sau mang đúng cursor trang trước trả.
    goi.slice(1).forEach((d, i) => {
      expect(new URL(d, 'http://x').searchParams.get('cursor')).toBe(`c${String((i + 1) * 200)}`);
    });
  });

  it('0 dự án ⇒ một lượt, danh sách rỗng', async () => {
    const m = gan([]);
    expect(await layDuAn()).toEqual({ items: [], cursor_sau: null });
    expect(goiDuAn(m)).toHaveLength(1);
  });

  it('cursor_sau vắng hoặc chuỗi rỗng ⇒ coi là hết trang, không gọi tiếp', async () => {
    const m = gan(dsDuAn(300));
    m.hong.cursor_rong = true;
    const kq = await layDuAn();
    expect(kq.items).toHaveLength(200);
    expect(goiDuAn(m)).toHaveLength(1);

    globalThis.fetch = () => Promise.resolve(json({ items: dsDuAn(3) }));
    expect((await layDuAn()).items).toHaveLength(3);
  });

  it('cursor lặp lại ⇒ NÉM (không lặp vô hạn, không trả nửa vời)', async () => {
    const m = gan(dsDuAn(500));
    m.hong.cursor_lap = true;
    const loi = await layDuAn().catch((e: unknown) => e);
    expect(loi).toBeInstanceOf(LoiApi);
    expect((loi as LoiApi).ma).toBe(MA_PHAN_TRANG_HONG);
    expect((loi as LoiApi).message).toBe(CAU_LOI_KHONG_RO);
    // Lượt 1 (cursor c0 lần đầu) + lượt 2 (trả lại c0) rồi dừng.
    expect(goiDuAn(m)).toHaveLength(2);
  });

  it(`cursor mới mãi không hết ⇒ NÉM khi vượt TRAN_SO_TRANG_DU_AN (${String(TRAN_SO_TRANG_DU_AN)} trang)`, async () => {
    let i = 0;
    globalThis.fetch = () => {
      i += 1;
      return Promise.resolve(json({ items: [], cursor_sau: `moi-${String(i)}` }));
    };
    const loi = await layDuAn().catch((e: unknown) => e);
    expect(loi).toBeInstanceOf(LoiApi);
    expect((loi as LoiApi).ma).toBe(MA_PHAN_TRANG_HONG);
    expect(i).toBe(TRAN_SO_TRANG_DU_AN);
  });

  it('trang 2 lỗi ⇒ NÉM lỗi của máy chủ, KHÔNG trả 200 dự án đầu như thể đủ', async () => {
    const m = gan(dsDuAn(500));
    m.hong.trang = 2;
    const loi = await layDuAn().catch((e: unknown) => e);
    expect(loi).toBeInstanceOf(LoiApi);
    expect((loi as LoiApi).http).toBe(500);
    expect((loi as LoiApi).message).toBe('Lỗi máy chủ giả.');
  });

  it('trang 3 lỗi (500 dự án) ⇒ cũng NÉM', async () => {
    const m = gan(dsDuAn(500));
    m.hong.trang = 3;
    await expect(layDuAn()).rejects.toBeInstanceOf(LoiApi);
  });
});

/* ------------------------------------------------------------------ *
 * B. Nơi dùng hiện đủ dự án cuối
 * ------------------------------------------------------------------ */

const CO_DU_AN = [51, 200, 500] as const;

describe('BAT-73 — sidebar hiện đủ dự án thứ 51/200/500', () => {
  it.each(CO_DU_AN)('%i dự án ⇒ sidebar có dự án đầu và dự án cuối', async (n) => {
    gan(dsDuAn(n));
    dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(await within(nav).findByText(`Dự án số ${String(n)}`)).toBeTruthy();
    expect(within(nav).getByText('Dự án số 1')).toBeTruthy();
  });

  it('refetch: dữ liệu cũ đủ 500, lần lấy lại trang 2 lỗi ⇒ dữ liệu cũ VẪN hiện', async () => {
    const m = gan(dsDuAn(500));
    const { qc } = dung(<Sidebar />);
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await within(nav).findByText('Dự án số 500');
    m.hong.trang = 2;
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['du-an'] });
    });
    await waitFor(() => {
      expect(qc.getQueryState(['du-an'])?.status).toBe('error');
    });
    expect(qc.getQueryData<{ items: DuAnSidebar[] }>(['du-an'])?.items).toHaveLength(500);
    expect(within(nav).getByText('Dự án số 500')).toBeTruthy();
    expect(within(nav).getByText('Dự án số 201')).toBeTruthy();
  });

  it('lần tải đầu, trang 2 lỗi ⇒ không vẽ 200 dự án đầu như thể đủ', async () => {
    const m = gan(dsDuAn(500));
    m.hong.trang = 2;
    const { qc } = dung(<Sidebar />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await waitFor(() => {
      expect(qc.getQueryState(['du-an'])?.status).toBe('error');
    });
    expect(screen.queryByText('Dự án số 1')).toBeNull();
    expect(screen.queryByText('Dự án số 200')).toBeNull();
  });
});

describe('BAT-73 — hộp Tạo việc có đủ dự án thứ 51/200/500', () => {
  it.each(CO_DU_AN)('%i dự án ⇒ ô Dự án có lựa chọn dự án cuối', async (n) => {
    gan(dsDuAn(n));
    dung(<App />, '/khong-co');
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await screen.findByText(`Dự án số ${String(n)}`);
    await userEvent.keyboard('c');
    const hop = await screen.findByRole('dialog', { name: NHAN_HOP_TAO_VIEC });
    const o = within(hop).getByLabelText(NHAN_O_DU_AN);
    const ten = [...o.querySelectorAll('option')].map((x) => x.textContent ?? '');
    // Chữ lựa chọn của hộp là "<tên> (<mã>)".
    expect(ten).toContain(`Dự án số ${String(n)} (P${String(n).padStart(3, '0')})`);
    expect(ten).toContain('Dự án số 1 (P001)');
    expect(ten.filter((t) => t.startsWith('Dự án số '))).toHaveLength(n);
  });
});

describe('BAT-73 — bộ lọc danh sách ticket có đủ dự án thứ 51/200/500', () => {
  it.each(CO_DU_AN)('%i dự án ⇒ ô lọc Dự án có lựa chọn dự án cuối', async (n) => {
    const m = gan(dsDuAn(n));
    const { qc } = dung(<TrangDanhSachTicket />, '/ticket?xem=danh-sach');
    const ma = `P${String(n).padStart(3, '0')}`;
    await waitFor(() => {
      expect(qc.getQueryState(['du-an'])?.status).toBe('success');
    });
    expect(goiDuAn(m).length).toBeGreaterThan(0);
    // d.407: thanh lọc không mở sẵn — mở menu "Lọc" như chủ phải làm.
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${NHAN_NUT_LOC}`) }));
    await waitFor(() => {
      const o = document.querySelector(`select[data-loc="${KHOA_LOC_TICKET.du_an}"]`);
      expect(o?.querySelector(`option[value="pj-${ma}"]`)?.textContent).toBe(`Dự án số ${String(n)}`);
    });
    const o = document.querySelector(`select[data-loc="${KHOA_LOC_TICKET.du_an}"]`);
    // "Tất cả dự án" + n dự án.
    expect(o?.querySelectorAll('option')).toHaveLength(n + 1);
  });
});

/* ------------------------------------------------------------------ *
 * C. Tổng quan: dòng "Còn N dự án chưa hiện ở lượt này."
 * ------------------------------------------------------------------ */

/** Thân Tổng quan như máy chủ thật trả: `min(n, TRAN_DU_AN)` hàng đầu. */
function tongQuanVoi(ds: DuAnSidebar[]): TongQuan {
  return {
    ...TONG_QUAN_RONG,
    du_an: ds.slice(0, TRAN_DU_AN_TONG_QUAN).map((d) => hangDuAn({ ma: d.ma, id: d.id, ten: d.ten })),
  };
}

function ganTongQuan(ds: DuAnSidebar[]): MayPhanTrang {
  const m = gan(ds);
  const goc = globalThis.fetch;
  const tq = tongQuanVoi(ds);
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    if (duong === '/v1/tong-quan') {
      m.da_goi.push(duong);
      return Promise.resolve(json(tq));
    }
    return goc(duong, init);
  }) as typeof globalThis.fetch;
  return m;
}

describe('BAT-73 — Tổng quan nói ra dự án vượt TRAN_DU_AN (cau-hoi-spec #181)', () => {
  it('hằng web khớp TRAN_DU_AN của API', () => {
    expect(NGUON_TONG_QUAN_API).toMatch(
      new RegExp(`export const TRAN_DU_AN = ${String(TRAN_DU_AN_TONG_QUAN)};`),
    );
  });

  it('dùng lại ĐÚNG chữ của Bản đồ — ghim nguyên văn', () => {
    expect(cauConLai(1)).toBe('Còn 1 dự án chưa hiện ở lượt này.');
    expect(cauConLai(300)).toBe('Còn 300 dự án chưa hiện ở lượt này.');
    expect(cauConLaiBanDo).toBe(cauConLai);
  });

  it('soDuAnConLai: so theo id; chưa tải hoặc ≤ trần ⇒ 0', () => {
    const ds = dsDuAn(201);
    const hang = tongQuanVoi(ds).du_an;
    expect(soDuAnConLai(hang, undefined)).toBe(0);
    expect(soDuAnConLai(hang, ds.slice(0, 200))).toBe(0);
    expect(soDuAnConLai(hang, ds)).toBe(1);
    // So theo id, không theo vị trí: hàng thiếu ở giữa vẫn đếm đúng.
    expect(soDuAnConLai(hang.slice(1), ds)).toBe(2);
  });

  it('200 dự án ⇒ KHÔNG có dòng "Còn"', async () => {
    ganTongQuan(dsDuAn(200));
    const { qc } = dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    await waitFor(() => {
      expect(qc.getQueryState(['du-an'])?.status).toBe('success');
    });
    // SPEC 20.4: mỗi dự án (không duy trì) là một THẺ trên bản đồ — `data-du-an`.
    expect(khoi.querySelectorAll('article[data-du-an]')).toHaveLength(200);
    expect(document.querySelector('[data-o="con-lai"]')).toBeNull();
    expect(screen.queryByText(/^Còn \d+ dự án/)).toBeNull();
  });

  it('dưới trần (5 dự án) ⇒ không gọi thêm /v1/du-an, không có dòng "Còn"', async () => {
    const m = ganTongQuan(dsDuAn(5));
    dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });
    await screen.findByText('Dự án số 5');
    expect(m.da_goi).toEqual(['/v1/tong-quan']);
    expect(document.querySelector('[data-o="con-lai"]')).toBeNull();
  });

  it.each([
    [201, 'Còn 1 dự án chưa hiện ở lượt này.'],
    [500, 'Còn 300 dự án chưa hiện ở lượt này.'],
  ])('%i dự án ⇒ khối Dự án có dòng "%s"', async (n, cau) => {
    ganTongQuan(dsDuAn(n));
    dung(<TrangTongQuan />);
    const khoi = await screen.findByRole('region', { name: TEN_KHOI.du_an });
    const dong = await within(khoi).findByText(cau);
    expect(dong.getAttribute('data-o')).toBe('con-lai');
  });

  it('501 dự án nhưng danh sách đầy đủ lỗi ⇒ không hiện gì (không đoán số)', async () => {
    const m = ganTongQuan(dsDuAn(501));
    m.hong.trang = 2;
    const { qc } = dung(<TrangTongQuan />);
    await screen.findByRole('region', { name: TEN_KHOI.du_an });
    await waitFor(() => {
      expect(qc.getQueryState(['du-an'])?.status).toBe('error');
    });
    expect(document.querySelector('[data-o="con-lai"]')).toBeNull();
  });
});
