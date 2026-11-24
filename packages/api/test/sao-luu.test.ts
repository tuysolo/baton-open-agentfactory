/**
 * **Sao lưu tự động hằng ngày lên R2, giữ 14 bản** — SPEC mục 15 d.429, 19.12 câu 7.
 * BAT-8.
 *
 * R2 là bucket **giả lập** của Miniflare (`r2Buckets` trong `vitest.config.ts`),
 * cô lập theo ca. Ca "R2 lỗi" bọc bucket đó bằng một bản ném lỗi ở đúng một chặng.
 * Không gọi mạng, không chạm bucket thật.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { ngayDiaPhuong } from '@baton/shared';
import { chayCron } from '../src/index.js';
import { viecCuaCron } from '../src/cron-bang-chung.js';
import type { Env } from '../src/moi-truong.js';
import {
  CAU_SAO_LUU,
  MAU_KHOA_SAO_LUU,
  PHUT_UTC_SAO_LUU,
  SO_BAN_GIU,
  TIEN_TO_SAO_LUU,
  TRE_SAO_LUU_PHUT,
  khoaCanXoa,
  khoaSaoLuu,
  lietKeSaoLuu,
  ngaySaoLuuGanNhat,
  taiSaoLuu,
} from '../src/sao-luu.js';
import { BANG_XUAT, PHIEN_BAN_DINH_DANG, type BanXuat } from '../src/xuat-du-lieu.js';
import {
  TOKEN_CHU,
  WS,
  dungAgentCoToken,
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

/** Một mốc UTC viết tay — ngày 15/10/2026. */
function utc(gio: number, phut = 0, ngay = 15): number {
  return Date.UTC(2026, 9, ngay, gio, phut);
}

/** 19:00 UTC ngày 15 = **02:00 giờ chủ ngày 16** — mốc sao lưu. */
const MOC = utc(19, 0);
const NGAY_MOC = '2026-10-16';

function r2(): R2Bucket {
  const b = env.SAO_LUU;
  if (b === undefined) throw new Error('Thiếu binding SAO_LUU trong vitest.config.ts');
  return b;
}

async function moiKhoaTrenR2(): Promise<string[]> {
  const ra: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const t = await r2().list(cursor === undefined ? {} : { cursor });
    ra.push(...t.objects.map((o) => o.key));
    if (!t.truncated) return ra.sort();
    cursor = t.cursor;
  }
}

/**
 * Bọc bucket thật bằng một bản **ném** ở các chặng được chọn, và đếm số lần `delete`.
 */
function r2Hong(hong: { head?: boolean; put?: boolean; list?: boolean; delete?: boolean }): {
  bucket: R2Bucket;
  soLanXoa: () => number;
} {
  const goc = r2();
  let so_xoa = 0;
  const nem = (chang: string): never => {
    throw new Error(`R2 giả lập hỏng ở chặng ${chang}`);
  };
  const bucket = {
    head: (k: string) => (hong.head === true ? nem('head') : goc.head(k)),
    put: (k: string, v: string, o?: R2PutOptions) => (hong.put === true ? nem('put') : goc.put(k, v, o)),
    list: (o?: R2ListOptions) => (hong.list === true ? nem('list') : goc.list(o)),
    delete: (k: string | string[]) => {
      so_xoa += 1;
      return hong.delete === true ? nem('delete') : goc.delete(k);
    },
    get: (k: string) => goc.get(k),
  } as unknown as R2Bucket;
  return { bucket, soLanXoa: () => so_xoa };
}

beforeEach(async () => {
  await dungWorkspace();
  const pj = await dungDuAn('SAI', 'Sample');
  await dungTicket(pj, 1, 'Việc cần sao lưu');
});

/* ================================================================== *
 * A. Nhịp
 * ================================================================== */

describe('BAT-8 — mốc sao lưu: 19:00 UTC = 02:00 giờ chủ, cửa sổ 60 phút', () => {
  it('mốc là 19:00 UTC — con số UTC viết tay, ghim phép đổi múi giờ', () => {
    expect(PHUT_UTC_SAO_LUU).toBe(19 * 60);
    expect(TRE_SAO_LUU_PHUT).toBe(60);
  });

  it('viecCuaCron bật `sao_luu` đúng trong cửa sổ, tắt ngoài cửa sổ', () => {
    expect(viecCuaCron(utc(19, 0)).sao_luu).toBe(true);
    expect(viecCuaCron(utc(19, 37)).sao_luu).toBe(true);
    expect(viecCuaCron(utc(20, 0)).sao_luu).toBe(true); // biên trên — trễ 60 phút
    expect(viecCuaCron(utc(20, 1)).sao_luu).toBe(false);
    expect(viecCuaCron(utc(18, 59)).sao_luu).toBe(false);
    expect(viecCuaCron(utc(0, 30)).sao_luu).toBe(false); // nhịp báo cáo sáng
    expect(viecCuaCron(utc(13, 0)).sao_luu).toBe(false); // nhịp handoff tối
  });

  it('ngaySaoLuuGanNhat: bản đáng lẽ đã có (cửa sổ đã đóng)', () => {
    // 07:30 giờ chủ ngày 16 (= 00:30 UTC ngày 16) ⇒ bản của ngày 16 (chạy 02:00).
    expect(ngaySaoLuuGanNhat(utc(0, 30, 16))).toBe('2026-10-16');
    // 20:00 giờ chủ ngày 16 (= 13:00 UTC) ⇒ vẫn bản ngày 16.
    expect(ngaySaoLuuGanNhat(utc(13, 0, 16))).toBe('2026-10-16');
    // 02:30 giờ chủ ngày 16 — cửa sổ còn mở ⇒ bản ngày 15.
    expect(ngaySaoLuuGanNhat(utc(19, 30, 15))).toBe('2026-10-15');
    // 03:00 giờ chủ ngày 16 — cửa sổ vừa đóng ⇒ ngày 16.
    expect(ngaySaoLuuGanNhat(utc(20, 0, 15))).toBe('2026-10-16');
  });
});

/* ================================================================== *
 * B. Ghi đúng một object, idempotent
 * ================================================================== */

describe('mục 15 d.429 — cron ghi bản sao lưu lên R2', () => {
  it('nhịp đúng mốc → đúng 1 object, khoá theo ngày giờ chủ, cùng định dạng GET /v1/xuat', async () => {
    const kq = await chayCron({ scheduledTime: MOC }, env);
    expect(kq.sao_luu).toMatchObject({ chay: true, da_ghi: true, da_co: false, loi: null });
    expect(kq.sao_luu.khoa).toBe(khoaSaoLuu(NGAY_MOC));
    expect(kq.sao_luu.khoa).toBe('sao-luu/baton-2026-10-16.json');
    expect(await moiKhoaTrenR2()).toEqual(['sao-luu/baton-2026-10-16.json']);

    const obj = await r2().get(khoaSaoLuu(NGAY_MOC));
    expect(obj?.httpMetadata?.contentType).toBe('application/json');
    const ban = JSON.parse((await obj?.text()) ?? '{}') as BanXuat;
    expect(ban.schema_version).toBe(PHIEN_BAN_DINH_DANG);
    expect(ban.workspace_id).toBe(WS);
    expect(Object.keys(ban.bang)).toEqual(Object.keys(BANG_XUAT));
    expect(ban.bang['ticket']?.[0]).toMatchObject({ tieu_de: 'Việc cần sao lưu' });
  });

  it('nhịp LẶP và nhịp TRỄ trong cửa sổ → vẫn đúng 1 object, không ghi lại', async () => {
    await chayCron({ scheduledTime: MOC }, env);
    const lap = await chayCron({ scheduledTime: MOC }, env);
    const tre = await chayCron({ scheduledTime: MOC + 15 * 60_000 }, env);
    for (const kq of [lap, tre]) {
      expect(kq.sao_luu).toMatchObject({ chay: true, da_ghi: false, da_co: true, so_xoa: 0 });
    }
    expect(await moiKhoaTrenR2()).toEqual([khoaSaoLuu(NGAY_MOC)]);
  });

  it('nhịp TRỄ khi nhịp đúng giờ bị mất → vẫn ghi (một lần), đúng ngày của mốc', async () => {
    const kq = await chayCron({ scheduledTime: MOC + 42 * 60_000 }, env);
    expect(kq.sao_luu.da_ghi).toBe(true);
    expect(await moiKhoaTrenR2()).toEqual([khoaSaoLuu(NGAY_MOC)]);
  });

  it('nhịp NGOÀI mốc → không ghi gì', async () => {
    for (const moc of [utc(18, 59), utc(20, 1), utc(0, 30), utc(13, 0), utc(9, 1)]) {
      const kq = await chayCron({ scheduledTime: moc }, env);
      expect(kq.sao_luu.chay).toBe(false);
    }
    expect(await moiKhoaTrenR2()).toEqual([]);
  });

  it('thiếu binding SAO_LUU → bỏ qua, không ném, các việc khác vẫn chạy', async () => {
    const env_thieu: Env = { ...env, SAO_LUU: undefined };
    const kq = await chayCron({ scheduledTime: MOC }, env_thieu);
    expect(kq.sao_luu).toMatchObject({ chay: true, thieu_binding: true, da_ghi: false });
    expect(kq.thu_lai).toBeDefined();
    expect(kq.canh_bao).toBeDefined();
  });
});

/* ================================================================== *
 * C. Xoay vòng — giữ 14 bản
 * ================================================================== */

describe('mục 15 d.429 — giữ 14 bản mới nhất', () => {
  it('khoaCanXoa: chỉ khoá đúng mẫu, cũ nhất trước; khoá lạ không bao giờ bị chọn', () => {
    const khoa = [
      'sao-luu/baton-2026-10-03.json',
      'sao-luu/baton-2026-10-01.json',
      'sao-luu/baton-2026-10-02.json',
      'sao-luu/ghi-chu.txt',
      'sao-luu/baton-2026-10-01.json.bak',
    ];
    expect(khoaCanXoa(khoa, 2)).toEqual(['sao-luu/baton-2026-10-01.json']);
    expect(khoaCanXoa(khoa, 5)).toEqual([]);
    expect(MAU_KHOA_SAO_LUU.test('sao-luu/ghi-chu.txt')).toBe(false);
  });

  it('16 bản cũ + object lạ → sau một lượt còn đúng 14 bản mẫu (mới nhất), object lạ còn nguyên', async () => {
    const cu: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      // 16 ngày liền trước ngày mốc: 2026-09-30 … 2026-10-15.
      const ngay = ngayDiaPhuong(Date.UTC(2026, 8, 30 + i, 12, 0), 0);
      cu.push(khoaSaoLuu(ngay));
      await r2().put(khoaSaoLuu(ngay), '{}');
    }
    const LA = ['sao-luu/ghi-chu-cua-chu.txt', 'khac/baton-2026-01-01.json'];
    for (const k of LA) await r2().put(k, 'đừng xoá');

    const kq = await chayCron({ scheduledTime: MOC }, env);
    expect(kq.sao_luu).toMatchObject({ da_ghi: true, so_xoa: 3, loi: null });

    const con = await moiKhoaTrenR2();
    const mau = con.filter((k) => MAU_KHOA_SAO_LUU.test(k));
    expect(mau).toHaveLength(SO_BAN_GIU);
    // 14 bản mới nhất = bản vừa ghi + 13 bản cũ mới nhất.
    expect(mau).toEqual([...cu.slice(3), khoaSaoLuu(NGAY_MOC)].sort());
    for (const k of LA) expect(con).toContain(k);
    expect(con.filter((k) => k.startsWith(TIEN_TO_SAO_LUU))).toHaveLength(SO_BAN_GIU + 1);
  });
});

/* ================================================================== *
 * D. R2 lỗi — không làm hỏng cron
 * ================================================================== */

describe('mục 15 d.429 — R2 lỗi: bắt, log, không ném, không xoá gì khi ghi lỗi', () => {
  async function gieo16(): Promise<void> {
    for (let i = 0; i < 16; i += 1) {
      await r2().put(khoaSaoLuu(ngayDiaPhuong(Date.UTC(2026, 8, 30 + i, 12), 0)), '{}');
    }
  }

  it('put ném → kết quả `loi: put`, KHÔNG xoá bản nào, các việc khác vẫn có kết quả', async () => {
    await gieo16();
    const { bucket, soLanXoa } = r2Hong({ put: true });
    const kq = await chayCron({ scheduledTime: MOC }, { ...env, SAO_LUU: bucket });
    expect(kq.sao_luu).toMatchObject({ chay: true, da_ghi: false, loi: 'put', so_xoa: 0 });
    expect(soLanXoa()).toBe(0);
    expect(await moiKhoaTrenR2()).toHaveLength(16);
    // Nhịp 19:00 bật cả thử lại, gửi tin, cảnh báo, theo dõi: tất cả vẫn có kết quả.
    expect(kq.thu_lai).toBeDefined();
    expect(kq.theo_doi).toBeDefined();
    expect(kq.canh_bao).toBeDefined();
    expect(kq.thong_bao).toBeDefined();
  });

  it('list ném → đã ghi bản mới, `loi: list`, không xoá gì, không ném', async () => {
    await gieo16();
    const { bucket, soLanXoa } = r2Hong({ list: true });
    const kq = await chayCron({ scheduledTime: MOC }, { ...env, SAO_LUU: bucket });
    expect(kq.sao_luu).toMatchObject({ da_ghi: true, loi: 'list', so_xoa: 0 });
    expect(soLanXoa()).toBe(0);
    expect(await moiKhoaTrenR2()).toHaveLength(17);
  });

  it('head ném → `loi: head`, không ghi, không ném', async () => {
    const { bucket } = r2Hong({ head: true });
    const kq = await chayCron({ scheduledTime: MOC }, { ...env, SAO_LUU: bucket });
    expect(kq.sao_luu).toMatchObject({ da_ghi: false, loi: 'head' });
    expect(await moiKhoaTrenR2()).toEqual([]);
  });

  it('delete ném → bản mới vẫn còn, `loi: delete`, không ném', async () => {
    await gieo16();
    const { bucket } = r2Hong({ delete: true });
    const kq = await chayCron({ scheduledTime: MOC }, { ...env, SAO_LUU: bucket });
    expect(kq.sao_luu).toMatchObject({ da_ghi: true, loi: 'delete', so_xoa: 0 });
    expect(await moiKhoaTrenR2()).toContain(khoaSaoLuu(NGAY_MOC));
  });
});

/* ================================================================== *
 * E. Báo cáo sáng/tối có MỘT dòng khi bản sao lưu gần nhất thiếu
 * ================================================================== */

/**
 * Báo cáo sinh bằng **đồng hồ thật** (`bay_gio = Date.now()` trong `chayCron`, nếp của
 * `bao-cao.test.ts`), nên ngày của bản phải có cũng tính từ `Date.now()`.
 */
const NHIP_SANG = Date.UTC(2026, 9, 16, 0, 30);

async function baoCaoSang(): Promise<string | null> {
  const d = await env.DB.prepare(
    "SELECT noi_dung_md FROM bao_cao WHERE workspace_id = ? AND loai = 'sang'",
  )
    .bind(WS)
    .first<{ noi_dung_md: string }>();
  return d?.noi_dung_md ?? null;
}

async function tinBaoCaoSang(): Promise<string | null> {
  const d = await env.DB.prepare(
    "SELECT noi_dung FROM thong_bao WHERE workspace_id = ? AND loai = 'bao_cao_sang'",
  )
    .bind(WS)
    .first<{ noi_dung: string }>();
  return d?.noi_dung ?? null;
}

describe('BAT-8 — báo cáo có MỘT dòng cảnh báo khi thiếu bản sao lưu gần nhất', () => {
  it('thiếu bản → báo cáo (markdown + tin) có đúng một dòng ⚠️ Sao lưu <ngày>', async () => {
    const ngay = ngaySaoLuuGanNhat(Date.now());
    const kq = await chayCron({ scheduledTime: NHIP_SANG }, env);
    expect(kq.bao_cao.so_sinh).toBe(1);
    const md = (await baoCaoSang()) ?? '';
    expect(md).toContain(CAU_SAO_LUU.thieu(ngay));
    expect(md.split('\n').filter((d) => d.startsWith('⚠️ Sao lưu'))).toHaveLength(1);
    expect(await tinBaoCaoSang()).toContain(CAU_SAO_LUU.thieu(ngay));
  });

  it('có bản → KHÔNG có dòng cảnh báo nào', async () => {
    await r2().put(khoaSaoLuu(ngaySaoLuuGanNhat(Date.now())), '{}');
    await chayCron({ scheduledTime: NHIP_SANG }, env);
    expect(await baoCaoSang()).not.toContain('⚠️ Sao lưu');
    expect(await tinBaoCaoSang()).not.toContain('⚠️ Sao lưu');
  });

  it('R2 lỗi lúc kiểm → báo cáo VẪN sinh, kèm dòng "R2 lỗi"', async () => {
    const { bucket } = r2Hong({ head: true });
    const kq = await chayCron({ scheduledTime: NHIP_SANG }, { ...env, SAO_LUU: bucket });
    expect(kq.bao_cao).toMatchObject({ so_sinh: 1, so_loi: 0 });
    expect(await baoCaoSang()).toContain(CAU_SAO_LUU.loi(ngaySaoLuuGanNhat(Date.now())));
  });

  it('thiếu binding → báo cáo VẪN sinh, kèm dòng "chưa bật"', async () => {
    const kq = await chayCron({ scheduledTime: NHIP_SANG }, { ...env, SAO_LUU: undefined });
    expect(kq.bao_cao.so_sinh).toBe(1);
    expect(await baoCaoSang()).toContain(CAU_SAO_LUU.chua_bat);
  });
});

/* ================================================================== *
 * BAT-10 — liệt kê và tải bản sao lưu (19.12 câu 7, mục 15 d.429): chỉ chủ
 * ================================================================== */

describe('BAT-10 — GET /v1/sao-luu và /v1/sao-luu/<ngay>', () => {
  const TOKEN_AG = 'bt_token_gia_SAOLUU_worker_w1';
  const ngay_i = (i: number): string => `2026-09-${String(i).padStart(2, '0')}`;

  async function gieo(so_ngay: number): Promise<void> {
    for (let i = 1; i <= so_ngay; i += 1) {
      await r2().put(khoaSaoLuu(ngay_i(i)), JSON.stringify({ ngay: ngay_i(i) }));
    }
  }

  beforeEach(async () => {
    await dungAgentCoToken({
      id: 'ag-sl',
      ten: 'A-sl',
      vai_tro: 'worker',
      token: TOKEN_AG,
      vao_tat_ca_du_an: true,
    });
  });

  it('agent → 403 FORBIDDEN cho cả danh sách lẫn tải, không lộ nội dung', async () => {
    await gieo(2);
    for (const duong of ['/v1/sao-luu', `/v1/sao-luu/${ngay_i(1)}`]) {
      const res = await goiApi(duong, TOKEN_AG);
      expect([duong, res.status]).toEqual([duong, 403]);
      const than = await res.text();
      expect(than).toContain('FORBIDDEN');
      expect(than).not.toContain('2026-09');
    }
  });

  it('cổng nằm TRONG hàm: gọi thẳng với ai = agent cũng trượt', async () => {
    const agent = {
      loai: 'agent' as const,
      agent_id: 'ag-sl',
      vai_tro: 'coordinator' as const,
      disabled: false,
      vao_tat_ca_du_an: true,
      du_an_duoc_vao: [],
      du_an_quan_ly: [],
    };
    await expect(lietKeSaoLuu(r2(), agent as never)).rejects.toMatchObject({ ma: 'FORBIDDEN' });
    await expect(taiSaoLuu(r2(), agent as never, ngay_i(1))).rejects.toMatchObject({
      ma: 'FORBIDDEN',
    });
  });

  it('chủ thấy tối đa 14 bản, mới nhất trước, bỏ khoá lạ; mỗi bản có ngay/khoa/kich_thuoc/tao_luc', async () => {
    await gieo(16);
    await r2().put('sao-luu/ghi-chu.txt', 'khong phai ban sao luu');
    await r2().put('sao-luu/baton-abc.json', 'sai dang');
    const res = await goiApi('/v1/sao-luu', TOKEN_CHU);
    expect(res.status).toBe(200);
    const than = await res.json<{
      bat: boolean;
      items: { ngay: string; khoa: string; kich_thuoc: number; tao_luc: number }[];
    }>();
    expect(than.bat).toBe(true);
    expect(than.items).toHaveLength(SO_BAN_GIU);
    expect(than.items.map((b) => b.ngay)).toEqual(
      Array.from({ length: SO_BAN_GIU }, (_, k) => ngay_i(16 - k)),
    );
    const dau = than.items[0];
    expect(dau?.khoa).toBe(khoaSaoLuu(ngay_i(16)));
    expect(dau?.kich_thuoc).toBe(JSON.stringify({ ngay: ngay_i(16) }).length);
    expect(typeof dau?.tao_luc).toBe('number');
  });

  it('chủ tải đúng nội dung bản, kèm content-disposition attachment', async () => {
    await gieo(3);
    const res = await goiApi(`/v1/sao-luu/${ngay_i(2)}`, TOKEN_CHU);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="baton-${ngay_i(2)}.json"`,
    );
    expect(await res.text()).toBe(JSON.stringify({ ngay: ngay_i(2) }));
  });

  it('thiếu binding SAO_LUU → { bat:false, items:[] } (không lỗi); tải → NOT_FOUND, không 500', async () => {
    const chu = { loai: 'chu' as const };
    expect(await lietKeSaoLuu(undefined, chu)).toEqual({ bat: false, items: [] });
    await expect(taiSaoLuu(undefined, chu, ngay_i(1))).rejects.toMatchObject({ ma: 'NOT_FOUND' });
  });

  it('bật nhưng chưa có bản nào → bat:true, items rỗng', async () => {
    const res = await goiApi('/v1/sao-luu', TOKEN_CHU);
    expect(await res.json()).toEqual({ bat: true, items: [] });
  });

  it('ngày sai dạng → 422 INVALID_INPUT; ngày không có bản → 404 NOT_FOUND', async () => {
    await gieo(1);
    const sai = await goiApi('/v1/sao-luu/2026-9-1', TOKEN_CHU);
    expect(sai.status).toBe(422);
    expect((await sai.json<{ error: string }>()).error).toBe('INVALID_INPUT');
    const chu = { loai: 'chu' as const };
    await expect(taiSaoLuu(r2(), chu, '../x')).rejects.toMatchObject({ ma: 'INVALID_INPUT' });
    const khong = await goiApi('/v1/sao-luu/2030-01-01', TOKEN_CHU);
    expect(khong.status).toBe(404);
    expect((await khong.json<{ error: string }>()).error).toBe('NOT_FOUND');
  });

  it('R2 lỗi → INTERNAL, thông điệp chuẩn, không lộ chữ lỗi thô', async () => {
    const chu = { loai: 'chu' as const };
    const { bucket } = r2Hong({ list: true });
    const e = await lietKeSaoLuu(bucket, chu).catch((x: unknown) => x as Error);
    expect(e).toMatchObject({ ma: 'INTERNAL' });
    expect((e as Error).message).not.toContain('R2 giả lập');
    const get_hong = {
      get: () => {
        throw new Error('R2 giả lập hỏng ở get');
      },
    } as unknown as R2Bucket;
    const e2 = await taiSaoLuu(get_hong, chu, ngay_i(1)).catch((x: unknown) => x as Error);
    expect(e2).toMatchObject({ ma: 'INTERNAL' });
    expect((e2 as Error).message).not.toContain('R2 giả lập');
  });
});
