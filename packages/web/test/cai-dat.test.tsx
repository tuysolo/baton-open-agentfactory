/**
 * **Trang Cài đặt — nút "Xuất dữ liệu (JSON)"** — SPEC mục 15 d.429 ("xuất toàn bộ
 * dữ liệu ra JSON bằng **một nút** (chỉ chủ)"), mục 14 d.394 (Cài đặt dưới cùng
 * sidebar), d.408 (lỗi đi ra toast nguyên văn). BAT-8.
 *
 * Máy chủ giả ở ranh giới `fetch` (nếp `giup.tsx`). `URL.createObjectURL` và cú
 * bấm link tải về là của trình duyệt — jsdom không có/không làm, nên ca thay chúng
 * bằng bản ghi lại, rồi trả nguyên trạng sau mỗi ca.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DinhTuyen } from '../src/dinh-tuyen';
import {
  CAU_LOI_KHONG_RO,
  MAT_KHAU_DAI_TOI_DA,
  MAT_KHAU_DAI_TOI_THIEU,
  TEN_FILE_XUAT_DU_PHONG,
  tenFileTuHeader,
} from '../src/api';
/*
 * Mã nguồn của hằng độ dài mật khẩu ở `shared`, đọc bằng `?raw` (nếp `doc-spec.ts`)
 * chứ không `import` thẳng: nhập module `shared` vào `tsc -p packages/web` là kéo
 * cả phần WebCrypto của máy chủ vào chặng kiểm kiểu của web (lib DOM khác lib
 * Workers), và giao diện cố ý không phụ thuộc `shared`.
 */
import MAT_KHAU_SHARED from '../../shared/src/mat-khau.ts?raw';
import {
  CAU_CHUA_GHI_DUNG,
  CAU_DA_DOI,
  CAU_DA_XUAT,
  CAU_HOI_DANG_XUAT_MOI_NOI,
  CAU_KHONG_KHOP,
  CAU_LUAT_DO_DAI,
  CAU_SAO_LUU_CHUA_BAT,
  CAU_TRUNG_MAT_KHAU_CU,
  NHAN_HUY,
  NHAN_KHONG_RO_THIET_BI,
  NHAN_MAT_KHAU_CU,
  NHAN_MAT_KHAU_MOI,
  NHAN_MA_TOTP_DOI,
  NHAN_NHAP_LAI,
  NHAN_NUT_DOI,
  NHAN_NUT_XUAT,
  NHAN_PHIEN_NAY,
  NHAN_XAC_NHAN_DANG_XUAT,
  TIEU_DE_THONG_BAO,
  TRE_THU_HOI_BLOB_MS,
  TrangCaiDat,
  dungLuongDeDoc,
} from '../src/trang/cai-dat';
import { CAU_GIU_CHO } from '../src/trang/giu-cho';
import { gioDayDu } from '../src/thoi-gian';
import { MUC_CUOI } from '../src/vo/muc-sidebar';
import { NHAN_DANG_XUAT_MOI_NOI } from '../src/vo/sidebar';
import { LOI_DANG_NHAP_SAI, MayChuGia, TOI_CHU, dung } from './giup';

interface BanGhiTai {
  url_tao: Blob[];
  url_thu_hoi: string[];
  bam: { href: string; download: string }[];
}

let ghi: BanGhiTai;
const mo_ta_tao = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const mo_ta_thu_hoi = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

beforeEach(() => {
  ghi = { url_tao: [], url_thu_hoi: [], bam: [] };
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (b: Blob) => {
      ghi.url_tao.push(b);
      return 'blob:baton-test/1';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (u: string) => void ghi.url_thu_hoi.push(u),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    ghi.bam.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [ten, mo_ta] of [
    ['createObjectURL', mo_ta_tao],
    ['revokeObjectURL', mo_ta_thu_hoi],
  ] as const) {
    if (mo_ta === undefined) delete (URL as unknown as Record<string, unknown>)[ten];
    else Object.defineProperty(URL, ten, mo_ta);
  }
});

const BAN_XUAT = { schema_version: 1, workspace_id: 'ws-test', bang: { ticket: [] } };

/**
 * Đọc chữ của một `Blob`. `Blob` của jsdom **không có** `text()`, nên đi qua
 * `FileReader` (jsdom có) — một đường đọc cho cả hai loại `Blob`.
 */
function docBlob(b: Blob): Promise<string> {
  return new Promise((xong, hong) => {
    const fr = new FileReader();
    fr.onload = () => xong(typeof fr.result === 'string' ? fr.result : '');
    fr.onerror = () => hong(new Error('FileReader lỗi'));
    fr.readAsText(b);
  });
}

describe('mục 15 d.429 — nút "Xuất dữ liệu (JSON)" ở trang Cài đặt', () => {
  it('`/cai-dat` có nút xuất, tiêu đề đúng nhãn sidebar; BAT-16 làm xong d.348 nên KHÔNG còn dòng giữ chỗ', async () => {
    new MayChuGia().dat('GET /v1/sao-luu', { than: { bat: false, items: [] } }).gan();
    dung(<DinhTuyen />, MUC_CUOI.duong);
    // BAT-26: trang Cài đặt là lazy — chờ chunk nạp xong.
    expect(await screen.findByRole('heading', { name: MUC_CUOI.nhan })).toBeTruthy();
    expect(screen.getByRole('button', { name: NHAN_NUT_XUAT })).toBeTruthy();
    expect(screen.getByRole('heading', { name: TIEU_DE_THONG_BAO })).toBeTruthy();
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
    expect(document.body.textContent).not.toContain(CAU_GIU_CHO);
  });

  it('bấm → gọi GET /v1/xuat ĐÚNG MỘT LẦN, đưa thân cho trình duyệt tải về, thu hồi link blob', async () => {
    const may = new MayChuGia()
      .dat('GET /v1/xuat', { than: BAN_XUAT })
      .dat('GET /v1/sao-luu', { than: { bat: false, items: [] } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');

    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_XUAT }));

    await waitFor(() => expect(ghi.bam).toHaveLength(1));
    expect(may.soLan('GET', '/v1/xuat')).toBe(1);
    // Thân đi **nguyên khối** vào Blob — đúng thứ máy chủ trả.
    expect(ghi.url_tao).toHaveLength(1);
    expect(JSON.parse(await docBlob(ghi.url_tao[0] as Blob))).toEqual(BAN_XUAT);
    expect(ghi.bam[0]).toEqual({ href: 'blob:baton-test/1', download: TEN_FILE_XUAT_DU_PHONG });
    // Link blob KHÔNG bị thu hồi ngay sau cú bấm (trình duyệt cần thời gian đọc) …
    expect(ghi.url_thu_hoi).toEqual([]);
    // … nhưng có bị thu hồi, sau `TRE_THU_HOI_BLOB_MS`.
    await waitFor(() => expect(ghi.url_thu_hoi).toEqual(['blob:baton-test/1']), {
      timeout: TRE_THU_HOI_BLOB_MS + 1_000,
    });
    // Không để lại thẻ <a> tạm nào trong trang.
    expect(document.querySelector('a[download]')).toBeNull();
    expect(await screen.findByText(CAU_DA_XUAT(TEN_FILE_XUAT_DU_PHONG))).toBeTruthy();
  });

  it('tên file lấy từ `content-disposition` của máy chủ (baton-<ngày>.json)', async () => {
    // Chỉ trả cho `/v1/xuat`; các đường đọc khác của trang (sao lưu, phiên — BAT-11)
    // trượt, để thân xuất không bị đọc nhầm thành thân của chúng.
    globalThis.fetch = ((duong: string) =>
      duong !== '/v1/xuat'
        ? Promise.reject(new Error(`ca này không khai đường ${duong}`))
        : Promise.resolve(
            new Response(JSON.stringify(BAN_XUAT), {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'content-disposition': 'attachment; filename="baton-2026-10-16.json"',
              },
            }),
          )) as typeof globalThis.fetch;
    dung(<TrangCaiDat />, '/cai-dat');
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_XUAT }));
    await waitFor(() => expect(ghi.bam).toHaveLength(1));
    expect(ghi.bam[0]?.download).toBe('baton-2026-10-16.json');
    // Chờ hẹn thu hồi chạy xong trong ca này — để nó không rơi sang ca sau, khi bản
    // ghi `revokeObjectURL` đã được tháo.
    await waitFor(() => expect(ghi.url_thu_hoi).toHaveLength(1), {
      timeout: TRE_THU_HOI_BLOB_MS + 1_000,
    });
  });

  it('máy chủ từ chối (403) → toast câu của máy chủ NGUYÊN VĂN, không tải gì', async () => {
    new MayChuGia()
      .dat('GET /v1/sao-luu', { than: { bat: false, items: [] } })
      .dat('GET /v1/xuat', {
        http: 403,
        loi: { error: 'FORBIDDEN', message: 'Xuất dữ liệu chỉ dành cho chủ (SPEC mục 15).' },
      })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_XUAT }));
    expect(await screen.findByText('Xuất dữ liệu chỉ dành cho chủ (SPEC mục 15).')).toBeTruthy();
    expect(ghi.bam).toEqual([]);
    expect(ghi.url_tao).toEqual([]);
    // Nút bật lại sau lỗi — chủ thử lại được.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: NHAN_NUT_XUAT }).disabled).toBe(false);
  });

  it('BAT-10: bat:false → đúng chữ "Sao lưu tự động chưa bật", không nút tải', async () => {
    new MayChuGia().dat('GET /v1/sao-luu', { than: { bat: false, items: [] } }).gan();
    dung(<TrangCaiDat />, '/cai-dat');
    expect(await screen.findByText(CAU_SAO_LUU_CHUA_BAT)).toBeTruthy();
    expect(CAU_SAO_LUU_CHUA_BAT).toBe('Sao lưu tự động chưa bật');
    expect(screen.queryByRole('button', { name: /^Tải bản/ })).toBeNull();
  });

  it('BAT-10: bật nhưng rỗng → "Chưa có bản sao lưu nào"', async () => {
    new MayChuGia().dat('GET /v1/sao-luu', { than: { bat: true, items: [] } }).gan();
    dung(<TrangCaiDat />, '/cai-dat');
    expect(await screen.findByText('Chưa có bản sao lưu nào')).toBeTruthy();
  });

  it('BAT-10: danh sách hiện ngày + dung lượng dễ đọc; "Tải" gọi đúng bản, tải về, thu hồi blob sau hẹn', async () => {
    const may = new MayChuGia()
      .dat('GET /v1/sao-luu', {
        than: {
          bat: true,
          items: [
            { ngay: '2026-10-16', khoa: 'sao-luu/baton-2026-10-16.json', kich_thuoc: 2048, tao_luc: 1 },
            { ngay: '2026-10-15', khoa: 'sao-luu/baton-2026-10-15.json', kich_thuoc: 3 * 1024 * 1024, tao_luc: 1 },
          ],
        },
      })
      .dat('GET /v1/sao-luu/2026-10-15', { than: { x: 1 } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    expect(await screen.findByText('2026-10-16')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('3.0 MB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tải bản 2026-10-15' }));
    await waitFor(() => expect(ghi.bam).toHaveLength(1));
    expect(may.soLan('GET', '/v1/sao-luu/2026-10-15')).toBe(1);
    expect(ghi.bam[0]?.href).toBe('blob:baton-test/1');
    expect(ghi.url_thu_hoi).toEqual([]);
    await waitFor(() => expect(ghi.url_thu_hoi).toEqual(['blob:baton-test/1']), {
      timeout: TRE_THU_HOI_BLOB_MS + 1_000,
    });
  });

  it('dungLuongDeDoc: B / KB / MB', () => {
    expect(dungLuongDeDoc(500)).toBe('500 B');
    expect(dungLuongDeDoc(1536)).toBe('1.5 KB');
    expect(dungLuongDeDoc(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('tenFileTuHeader: đọc đúng filename, thiếu header thì null', () => {
    expect(tenFileTuHeader('attachment; filename="baton-2026-10-16.json"')).toBe('baton-2026-10-16.json');
    expect(tenFileTuHeader(null)).toBeNull();
    expect(tenFileTuHeader('inline')).toBeNull();
  });
});

/* ================================================================== *
 * BAT-11 — khu "Tài khoản" (SPEC mục 15 d.425, d.427; mục 14 d.422)
 * ================================================================== */

const BAY_GIO = 1_760_000_000_000;
const PHUT = 60_000;

const DS_PHIEN = {
  bay_gio: BAY_GIO,
  items: [
    {
      tao_luc: BAY_GIO - 2 * 60 * PHUT,
      het_luc: BAY_GIO + 28 * 24 * 60 * PHUT,
      dung_cuoi_luc: BAY_GIO - 5 * PHUT,
      thiet_bi: 'Chrome · macOS',
      ua: 'Mozilla/5.0 (Macintosh) Chrome/130',
      hien_tai: true,
    },
    {
      tao_luc: BAY_GIO - 3 * 24 * 60 * PHUT,
      het_luc: BAY_GIO + 27 * 24 * 60 * PHUT,
      dung_cuoi_luc: null,
      thiet_bi: null,
      ua: null,
      hien_tai: false,
    },
  ],
};

/** Máy chủ giả có sẵn hai đường đọc của trang; ca nào cần thêm thì `.dat` tiếp. */
function mayChuTaiKhoan(): MayChuGia {
  return new MayChuGia()
    .dat('GET /v1/sao-luu', { than: { bat: false, items: [] } })
    .dat('GET /v1/chu/phien-dang-nhap', { than: DS_PHIEN })
    // BAT-16: đường đọc thứ ba của trang (khối "Thông báo Telegram").
    .dat('GET /v1/cai-dat/thong-bao', { than: CONG_TAC });
}

/** Thân `GET /v1/cai-dat/thong-bao` giả — hình của `docCaiDatThongBao` (api). */
const LY_DO_KHOA = 'Luôn bật: tin bảo mật được gửi cả trong giờ yên lặng.';
const CONG_TAC = {
  items: [
    { cong_tac: 'phien_dung', nhan: 'Phiên đứng', bat: true, khoa: false, ly_do_khoa: null },
    { cong_tac: 'ticket_xong', nhan: 'Ticket Xong (gom 15 phút)', bat: false, khoa: false, ly_do_khoa: null },
    { cong_tac: 'bao_mat_tai_khoan', nhan: 'Bảo mật tài khoản', bat: true, khoa: true, ly_do_khoa: LY_DO_KHOA },
  ],
};

function dienForm(o: { cu: string; ma: string; moi: string; nhap_lai: string }): void {
  fireEvent.change(screen.getByLabelText(NHAN_MAT_KHAU_CU), { target: { value: o.cu } });
  fireEvent.change(screen.getByLabelText(NHAN_MA_TOTP_DOI), { target: { value: o.ma } });
  fireEvent.change(screen.getByLabelText(NHAN_MAT_KHAU_MOI), { target: { value: o.moi } });
  fireEvent.change(screen.getByLabelText(NHAN_NHAP_LAI), { target: { value: o.nhap_lai } });
}

const FORM_DUNG = {
  cu: 'mat-khau-cu-du-dai',
  ma: '123456',
  moi: 'mat-khau-moi-du-dai',
  nhap_lai: 'mat-khau-moi-du-dai',
};

describe('BAT-11 mục 15 d.425 — các phiên đang mở', () => {
  it('mỗi phiên: thiết bị, lúc đăng nhập, lần dùng cuối (tương đối theo bay_gio máy chủ); đúng MỘT dòng "Phiên này"', async () => {
    mayChuTaiKhoan().gan();
    dung(<TrangCaiDat />, '/cai-dat');

    // Chờ đúng danh sách PHIÊN (từ BAT-16 trang có thêm danh sách công tắc, có thể
    // về trước — `findAllByRole('listitem')` một mình sẽ dừng ở danh sách đó).
    await screen.findByText(NHAN_PHIEN_NAY);
    const ds = screen.getAllByRole('listitem');
    const dong = ds.filter((li) => li.hasAttribute('data-phien'));
    expect(dong).toHaveLength(2);

    const [nay, khac] = dong as [HTMLElement, HTMLElement];
    expect(nay.getAttribute('data-phien')).toBe('hien-tai');
    expect(nay.textContent).toContain('Chrome · macOS');
    expect(nay.textContent).toContain(NHAN_PHIEN_NAY);
    expect(nay.textContent).toContain('Đăng nhập 2 giờ trước');
    expect(nay.textContent).toContain('Dùng gần nhất 5 phút trước');

    expect(khac.getAttribute('data-phien')).toBe('khac');
    // `thiet_bi: null` → nhãn dự phòng, không để trống.
    expect(khac.textContent).toContain(NHAN_KHONG_RO_THIET_BI);
    expect(khac.textContent).not.toContain(NHAN_PHIEN_NAY);
    expect(khac.textContent).toContain('Đăng nhập 3 ngày trước');
    expect(khac.textContent).toContain(`Dùng gần nhất ${CAU_CHUA_GHI_DUNG}`);

    expect(screen.getAllByText(NHAN_PHIEN_NAY)).toHaveLength(1);
    // d.422: rê chuột thấy giờ đầy đủ theo giờ Việt Nam.
    const moc = nay.querySelector('time');
    expect(moc?.getAttribute('title')).toBe(gioDayDu(BAY_GIO - 2 * 60 * PHUT));
  });
});

describe('BAT-11 mục 15 d.425 — "Đăng xuất mọi nơi" phải qua xác nhận', () => {
  it('bấm nút KHÔNG gọi API; "Huỷ" thì không gọi; "Xác nhận" gọi đúng /v1/dang-xuat-moi-noi một lần, bỏ cache trừ ["toi"]', async () => {
    const may = mayChuTaiKhoan().dat('POST /v1/dang-xuat-moi-noi', { than: { da_dang_xuat: true } }).gan();
    const { qc } = dung(<TrangCaiDat />, '/cai-dat');
    qc.setQueryData(['toi'], TOI_CHU);
    qc.setQueryData(['ticket', 'gia'], { ma: 'BAT-1' });
    await screen.findByText(NHAN_PHIEN_NAY);

    // Bước 1: bấm nút → chỉ mở câu hỏi.
    fireEvent.click(screen.getByRole('button', { name: NHAN_DANG_XUAT_MOI_NOI }));
    expect(screen.getByText(CAU_HOI_DANG_XUAT_MOI_NOI)).toBeTruthy();
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(0);

    // Huỷ → đóng câu hỏi, không gọi gì.
    fireEvent.click(screen.getByRole('button', { name: NHAN_HUY }));
    expect(screen.queryByText(CAU_HOI_DANG_XUAT_MOI_NOI)).toBeNull();
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(0);

    // Bấm lại rồi xác nhận → gọi đúng đường "mọi nơi", không gọi đăng xuất thường.
    fireEvent.click(screen.getByRole('button', { name: NHAN_DANG_XUAT_MOI_NOI }));
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_DANG_XUAT }));

    await waitFor(() => expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(1));
    expect(may.soLan('POST', '/v1/dang-xuat')).toBe(0);
    // Nếp `MenuWorkspace`: dữ liệu của chủ rời cache, `['toi']` ở lại và bị đánh dấu cũ.
    // (Đo bằng một query KHÔNG có observer: query của chính trang này còn component
    // gắn nên nó được dựng lại ngay — trong app thật vỏ bị tháo khi `/v1/toi` trả 401.)
    await waitFor(() => expect(qc.getQueryData(['ticket', 'gia'])).toBeUndefined());
    expect(qc.getQueryData(['toi'])).toEqual(TOI_CHU);
    expect(qc.getQueryState(['toi'])?.isInvalidated).toBe(true);
  });
});

describe('BAT-11 — "Đăng xuất mọi nơi" trượt ở /cai-dat thì chủ THẤY lỗi', () => {
  it('5xx không thân → câu chung; bước xác nhận ở lại để bấm lại', async () => {
    const may = mayChuTaiKhoan().dat('POST /v1/dang-xuat-moi-noi', { http: 502, than: null }).gan();
    const { qc } = dung(<TrangCaiDat />, '/cai-dat');
    qc.setQueryData(['toi'], TOI_CHU);
    await screen.findByText(NHAN_PHIEN_NAY);

    fireEvent.click(screen.getByRole('button', { name: NHAN_DANG_XUAT_MOI_NOI }));
    fireEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_DANG_XUAT }));

    const canh = await screen.findByRole('alert');
    expect(canh.textContent).toBe(CAU_LOI_KHONG_RO);
    expect(may.soLan('POST', '/v1/dang-xuat-moi-noi')).toBe(1);
    // Vẫn hỏi lại `/v1/toi` (máy chủ có thể đã huỷ trước khi đường truyền hỏng).
    await waitFor(() => expect(qc.getQueryState(['toi'])?.isInvalidated).toBe(true));
    // Nút xác nhận bật lại — chủ thử lại được.
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: NHAN_XAC_NHAN_DANG_XUAT }).disabled,
    ).toBe(false);
  });

  it('máy chủ trả lỗi có câu → in NGUYÊN VĂN; "Huỷ" xoá câu lỗi', async () => {
    const cau = 'Máy chủ đang bảo trì.';
    mayChuTaiKhoan()
      .dat('POST /v1/dang-xuat-moi-noi', { http: 503, loi: { error: 'INTERNAL', message: cau } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);

    fireEvent.click(screen.getByRole('button', { name: NHAN_DANG_XUAT_MOI_NOI }));
    fireEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_DANG_XUAT }));
    expect(await screen.findByText(cau)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: NHAN_HUY }));
    expect(screen.queryByText(cau)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: NHAN_DANG_XUAT_MOI_NOI }));
    expect(screen.queryByText(cau)).toBeNull();
  });
});

describe('BAT-11 — key của dòng phiên không trùng', () => {
  it('hai phiên cùng tao_luc/het_luc → không cảnh báo key trùng, đủ ba dòng', async () => {
    const dong = DS_PHIEN.items[1] as (typeof DS_PHIEN.items)[number];
    new MayChuGia()
      .dat('GET /v1/sao-luu', { than: { bat: false, items: [] } })
      .dat('GET /v1/chu/phien-dang-nhap', {
        than: { bay_gio: BAY_GIO, items: [DS_PHIEN.items[0], dong, { ...dong }] },
      })
      .gan();
    const loi = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);
    expect(document.querySelectorAll('[data-phien]')).toHaveLength(3);
    const trung = loi.mock.calls.filter((c) => String(c[0]).includes('same key'));
    expect(trung).toEqual([]);
  });
});

describe('BAT-11 mục 15 d.425 — đổi mật khẩu', () => {
  it('ô nhập: type password + autocomplete đúng; luật độ dài lấy từ hằng', async () => {
    mayChuTaiKhoan().gan();
    dung(<TrangCaiDat />, '/cai-dat');
    const cu = screen.getByLabelText<HTMLInputElement>(NHAN_MAT_KHAU_CU);
    const ma = screen.getByLabelText<HTMLInputElement>(NHAN_MA_TOTP_DOI);
    const moi = screen.getByLabelText<HTMLInputElement>(NHAN_MAT_KHAU_MOI);
    const lai = screen.getByLabelText<HTMLInputElement>(NHAN_NHAP_LAI);
    expect([cu.type, cu.autocomplete]).toEqual(['password', 'current-password']);
    expect(ma.autocomplete).toBe('one-time-code');
    expect([moi.type, moi.autocomplete]).toEqual(['password', 'new-password']);
    expect([lai.type, lai.autocomplete]).toEqual(['password', 'new-password']);
    expect(screen.getByText(CAU_LUAT_DO_DAI)).toBeTruthy();
    expect(CAU_LUAT_DO_DAI).toContain(`từ ${String(MAT_KHAU_DAI_TOI_THIEU)} tới ${String(MAT_KHAU_DAI_TOI_DA)}`);
    await screen.findByText(NHAN_PHIEN_NAY);
  });

  it('bản chép luật độ dài của web BẰNG ĐÚNG hằng của @baton/shared', () => {
    const hang = (ten: string): number => {
      const m = new RegExp(`export const ${ten} = ([0-9_]+);`).exec(MAT_KHAU_SHARED);
      if (m?.[1] === undefined) throw new Error(`không tìm thấy ${ten} trong shared/src/mat-khau.ts`);
      return Number(m[1].replaceAll('_', ''));
    };
    expect(MAT_KHAU_DAI_TOI_THIEU).toBe(hang('MAT_KHAU_DAI_TOI_THIEU'));
    expect(MAT_KHAU_DAI_TOI_DA).toBe(hang('MAT_KHAU_DAI_TOI_DA'));
  });

  it('gửi ĐÚNG thân; thành công → báo số phiên khác, xoá trắng bốn ô, làm mới danh sách phiên', async () => {
    const may = mayChuTaiKhoan()
      .dat('POST /v1/chu/doi-mat-khau', { than: { so_phien_khac_da_huy: 2, doi_luc: BAY_GIO } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);
    expect(may.soLan('GET', '/v1/chu/phien-dang-nhap')).toBe(1);

    dienForm(FORM_DUNG);
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_DOI }));

    expect(await screen.findByText(CAU_DA_DOI(2))).toBeTruthy();
    expect(CAU_DA_DOI(2)).toBe('Đã đổi mật khẩu; đã đăng xuất 2 phiên khác.');
    const goi = may.da_goi.filter((l) => l.duong === '/v1/chu/doi-mat-khau');
    expect(goi).toHaveLength(1);
    expect(goi[0]?.than).toEqual({
      mat_khau_cu: FORM_DUNG.cu,
      ma_totp: FORM_DUNG.ma,
      mat_khau_moi: FORM_DUNG.moi,
    });
    for (const nhan of [NHAN_MAT_KHAU_CU, NHAN_MA_TOTP_DOI, NHAN_MAT_KHAU_MOI, NHAN_NHAP_LAI]) {
      expect(screen.getByLabelText<HTMLInputElement>(nhan).value).toBe('');
    }
    await waitFor(() => expect(may.soLan('GET', '/v1/chu/phien-dang-nhap')).toBe(2));
  });

  it('hai ô mật khẩu mới KHÔNG khớp → không gửi gì, báo lỗi ở trang', async () => {
    const may = mayChuTaiKhoan()
      .dat('POST /v1/chu/doi-mat-khau', { than: { so_phien_khac_da_huy: 0, doi_luc: BAY_GIO } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);

    dienForm({ ...FORM_DUNG, nhap_lai: 'mat-khau-moi-go-khac' });
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_DOI }));

    expect(await screen.findByText(CAU_KHONG_KHOP)).toBeTruthy();
    expect(may.soLan('POST', '/v1/chu/doi-mat-khau')).toBe(0);
    // Không xoá ô nào — chủ sửa lại được.
    expect(screen.getByLabelText<HTMLInputElement>(NHAN_MAT_KHAU_CU).value).toBe(FORM_DUNG.cu);
  });

  it('401 (sai mật khẩu hoặc mã) → in NGUYÊN VĂN câu của máy chủ, không báo thành công', async () => {
    mayChuTaiKhoan()
      .dat('POST /v1/chu/doi-mat-khau', { http: 401, loi: LOI_DANG_NHAP_SAI })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);

    dienForm(FORM_DUNG);
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_DOI }));

    expect(await screen.findByText(LOI_DANG_NHAP_SAI.message)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('429 (đang khoá) → in NGUYÊN VĂN câu chờ của máy chủ', async () => {
    const cau = 'Quá nhiều lần nhập sai mật khẩu hoặc mã xác thực. Thử lại sau 120 giây.';
    mayChuTaiKhoan()
      .dat('POST /v1/chu/doi-mat-khau', { http: 429, loi: { error: 'RATE_LIMITED', message: cau } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);

    dienForm(FORM_DUNG);
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_DOI }));

    expect(await screen.findByText(cau)).toBeTruthy();
  });

  it('422 (sai độ dài) → in NGUYÊN VĂN câu của máy chủ', async () => {
    const cau = 'Mật khẩu mới phải dài từ 12 tới 256 ký tự.';
    mayChuTaiKhoan()
      .dat('POST /v1/chu/doi-mat-khau', { http: 422, loi: { error: 'INVALID_INPUT', message: cau } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);

    dienForm({ ...FORM_DUNG, moi: 'ngan', nhap_lai: 'ngan' });
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_DOI }));

    expect(await screen.findByText(cau)).toBeTruthy();
  });

  it('BAT-16 #148: mật khẩu mới TRÙNG mật khẩu hiện tại → câu tiếng Việt ở trang, KHÔNG gửi', async () => {
    const may = mayChuTaiKhoan()
      .dat('POST /v1/chu/doi-mat-khau', { than: { so_phien_khac_da_huy: 0, doi_luc: BAY_GIO } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);

    dienForm({ cu: FORM_DUNG.cu, ma: FORM_DUNG.ma, moi: FORM_DUNG.cu, nhap_lai: FORM_DUNG.cu });
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_DOI }));

    expect(await screen.findByText(CAU_TRUNG_MAT_KHAU_CU)).toBeTruthy();
    expect(CAU_TRUNG_MAT_KHAU_CU).toBe('Mật khẩu mới phải khác mật khẩu hiện tại.');
    expect(may.soLan('POST', '/v1/chu/doi-mat-khau')).toBe(0);
  });

  it('BAT-16 #148: máy chủ trả 422 "trùng" → in NGUYÊN VĂN câu của máy chủ', async () => {
    const cau = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
    mayChuTaiKhoan()
      .dat('POST /v1/chu/doi-mat-khau', { http: 422, loi: { error: 'INVALID_INPUT', message: cau } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText(NHAN_PHIEN_NAY);
    dienForm(FORM_DUNG);
    fireEvent.click(screen.getByRole('button', { name: NHAN_NUT_DOI }));
    expect(await screen.findByText(cau)).toBeTruthy();
  });
});

/* ================================================================== *
 * BAT-16 — khối "Thông báo Telegram" (SPEC mục 12 d.348)
 * ================================================================== */

function congTac(ma: string): HTMLInputElement {
  const li = document.querySelector(`[data-cong-tac="${ma}"]`);
  const o = li?.querySelector<HTMLInputElement>('input[role="switch"]');
  if (o === null || o === undefined) throw new Error(`không có công tắc ${ma}`);
  return o;
}

describe('BAT-16 mục 12 d.348 — công tắc từng loại thông báo ở /cai-dat', () => {
  it('liệt kê từng loại với nhãn của máy chủ và trạng thái bật/tắt; công tắc bảo mật KHOÁ kèm giải thích', async () => {
    mayChuTaiKhoan().gan();
    dung(<TrangCaiDat />, '/cai-dat');
    expect(await screen.findByText('Phiên đứng')).toBeTruthy();
    expect(screen.getByText('Ticket Xong (gom 15 phút)')).toBeTruthy();
    expect(screen.getByText('Bảo mật tài khoản')).toBeTruthy();

    expect(congTac('phien_dung').checked).toBe(true);
    expect(congTac('ticket_xong').checked).toBe(false);
    expect(congTac('phien_dung').disabled).toBe(false);

    const bm = congTac('bao_mat_tai_khoan');
    expect(bm.checked).toBe(true);
    expect(bm.disabled).toBe(true);
    expect(
      document.querySelector('[data-cong-tac="bao_mat_tai_khoan"] [data-o="ly-do-khoa"]')?.textContent,
    ).toBe(LY_DO_KHOA);
  });

  it('bấm tắt → gọi ĐÚNG PUT /v1/cai-dat/thong-bao/<loại> với {bat:false}, hiện ngay trước khi máy chủ trả lời', async () => {
    let tra: (v: unknown) => void = () => undefined;
    const cho = new Promise((ok) => {
      tra = ok;
    });
    const may = mayChuTaiKhoan()
      .dat('PUT /v1/cai-dat/thong-bao/phien_dung', { than: { cong_tac: 'phien_dung', bat: false }, cho })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText('Phiên đứng');

    fireEvent.click(congTac('phien_dung'));
    await waitFor(() => expect(may.soLan('PUT', '/v1/cai-dat/thong-bao/phien_dung')).toBe(1));
    // d.418: đổi ngay trên màn hình, máy chủ chưa trả lời.
    expect(congTac('phien_dung').checked).toBe(false);
    const goi = may.da_goi.find((l) => l.duong === '/v1/cai-dat/thong-bao/phien_dung');
    expect(goi?.than).toEqual({ bat: false });
    tra(undefined);

    // Bật lại loại đang tắt → {bat:true}.
    may.dat('PUT /v1/cai-dat/thong-bao/ticket_xong', { than: { cong_tac: 'ticket_xong', bat: true } });
    fireEvent.click(congTac('ticket_xong'));
    await waitFor(() => expect(may.soLan('PUT', '/v1/cai-dat/thong-bao/ticket_xong')).toBe(1));
    expect(may.da_goi.find((l) => l.duong === '/v1/cai-dat/thong-bao/ticket_xong')?.than).toEqual({
      bat: true,
    });
  });

  it('máy chủ từ chối / lỗi mạng → công tắc HOÀN LẠI và toast câu lỗi', async () => {
    const cau = 'Chỉ chủ đổi được cài đặt thông báo.';
    mayChuTaiKhoan()
      .dat('PUT /v1/cai-dat/thong-bao/phien_dung', { http: 403, loi: { error: 'FORBIDDEN', message: cau } })
      .gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText('Phiên đứng');

    fireEvent.click(congTac('phien_dung'));
    expect(await screen.findByText(cau)).toBeTruthy();
    await waitFor(() => expect(congTac('phien_dung').checked).toBe(true));
  });

  it('bấm công tắc bảo mật (disabled) không gọi API nào', async () => {
    const may = mayChuTaiKhoan().gan();
    dung(<TrangCaiDat />, '/cai-dat');
    await screen.findByText('Bảo mật tài khoản');
    fireEvent.click(congTac('bao_mat_tai_khoan'));
    expect(may.da_goi.filter((l) => l.method === 'PUT')).toEqual([]);
    expect(congTac('bao_mat_tai_khoan').checked).toBe(true);
  });
});
