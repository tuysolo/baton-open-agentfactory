/**
 * **Màn hình Cần Chủ** — SPEC mục 8 d.248–275, mục 14 d.397 + d.408.
 *
 * Ba lớp chống "test xanh giả" của file này:
 *
 *   1. **Mọi chuỗi SPEC chốt cứng được CẮT TỪ `SPEC.md`** (`test/doc-spec.ts`):
 *      ba nhãn mức, bốn nút Gửi của bảng d.257–262, "Đề xuất", "Đạt", "Cần sửa",
 *      "Bỏ qua", "quá hạn X giờ", "chạy ở terminal thật", bốn cột bảng Đã xử lý,
 *      câu tóm tắt phiên duyệt, số 6 của "gập sau 6 dòng". Kèm **một ca ghim
 *      chính mỗi parser** (số phần tử + nội dung), vì một parser trả rỗng sẽ làm
 *      mọi ca so-sánh xanh một cách vô nghĩa.
 *   2. **Ca phủ định dựng trạng thái xấu THẬT**: nút Gửi mờ khi chưa chọn **và**
 *      không mờ sau khi chọn; máy chủ **thật sự** trả 409 rồi đo thẻ **quay về**
 *      khối cũ; máy chủ **chưa** trả lời (`cho`) rồi đo thẻ đã xuống bảng.
 *   3. **Máy chủ giả CÓ TRẠNG THÁI**: `POST …/xu-ly` thật sự bỏ mục khỏi kho,
 *      nên lần tải lại sau mutation nói **đúng** thứ máy chủ sẽ nói. Một fake trả
 *      mãi một thân cố định sẽ làm thẻ "mọc lại" sau mỗi lần gửi và che đúng vế
 *      d.265.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import {
  CAU_BO_QUA_CAN_LY_DO,
  CAU_CAN_SUA_CAN_GHI_CHU,
  CAU_TERMINAL_THAT,
  KHOA_LOC,
  NHAN_BO_QUA,
  NHAN_COPY,
  NHAN_DAT,
  NHAN_CAN_SUA,
  NHAN_DE_XUAT,
  NHAN_GHI_THEM,
  NHAN_GHI_THEM_DECISION,
  NHAN_GUI,
  NHAN_LOAI,
  NHAN_MUC,
  NHAN_PHIEN_DUYET,
  SO_DONG_GAP,
  SO_PHIM_PHUONG_AN,
  TrangCanChu,
  cauKhongThayThe,
  cauQuaHan,
  cauTheDaXuLy,
  cauTomTatPhien,
  coTheGui,
  hanhDongPhim,
  NHAP_RONG,
} from '../src/trang/can-chu';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import type { DongDaXuLy, ManHinhCanChu } from '../src/api';
import { MayChuGia, dung } from './giup';
import {
  DA_XU_LY_RONG,
  DU_AN_RONG,
  GIO,
  GIO_MS,
  MAN_HINH_RONG,
  bangDaXuLy,
  dongDaXuLy,
  manHinh,
  phuongAn,
  the,
} from './than-can-chu';
import { gioDayDu, thoiGianTuongDoi } from '../src/thoi-gian';
import {
  bangTraLoiTuSpec,
  cauQuaHanTuSpec,
  cauTomTatPhienTuSpec,
  cauTerminalThatTuSpec,
  cotDaXuLyTuSpec,
  nhanBaKhoiTuSpec,
  nhanBoQuaTuSpec,
  nhanDeXuatTuSpec,
  nhanLoaiCanChuTuSpec,
  nhanPhienDuyetTuSpec,
  soDongGapTuSpec,
  specDoiChuyenNgay,
  specDoiDienThoai,
  specDoiToastHoanLai,
  specDoiThoiGianTuongDoi,
  hienThayDoiTuSpec,
  phimTatCanChuTuSpec,
} from './doc-spec';

const SPEC_KHOI = nhanBaKhoiTuSpec();
const SPEC_BANG = bangTraLoiTuSpec();
const SPEC_PHIM = phimTatCanChuTuSpec();

/* ------------------------------------------------------------------ *
 * Máy chủ giả CÓ TRẠNG THÁI
 * ------------------------------------------------------------------ */

interface Kho {
  man: ManHinhCanChu;
  da: DongDaXuLy[];
}

function mayCanChu(
  bd: { man?: ManHinhCanChu; da?: DongDaXuLy[] } = {},
): { m: MayChuGia; kho: Kho } {
  const kho: Kho = { man: bd.man ?? MAN_HINH_RONG, da: bd.da ?? [] };
  const m = new MayChuGia()
    .dat('GET /v1/can-chu', () => ({ than: kho.man }))
    .dat('GET /v1/can-chu/da-xu-ly', () => ({ than: bangDaXuLy(kho.da) }))
    .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
    .gan();
  return { m, kho };
}

/** Một đường ghi **thật sự đổi kho** — xem lớp (3) ở đầu file. */
function datGhi(
  m: MayChuGia,
  kho: Kho,
  duong: string,
  id: string,
  tuy: { cho?: Promise<unknown>; loi?: { error: string; message: string }; http?: number } = {},
): void {
  m.dat(`POST ${duong}`, () => {
    if (tuy.loi === undefined) {
      kho.man = {
        ...kho.man,
        khoi: kho.man.khoi.map((k) => ({ ...k, items: k.items.filter((t) => t.id !== id) })),
      };
      kho.da = [dongDaXuLy({ ma: id, id, ket_qua: 'máy chủ nói' }), ...kho.da];
    }
    return { ...tuy };
  });
}

/** Bấm chờ DOM: chờ ba khối dựng xong sau lần tải đầu. */
async function moTrang(duong = '/can-chu'): Promise<ReturnType<typeof userEvent.setup>> {
  const u = userEvent.setup();
  dung(<TrangCanChu />, duong);
  await screen.findByRole('region', { name: SPEC_KHOI[0] ?? '' });
  return u;
}

function khoiCua(nhan: string): HTMLElement {
  return screen.getByRole('region', { name: nhan });
}

function theCua(ma: string): HTMLElement {
  const e = document.querySelector<HTMLElement>(`[data-the="${ma}"]`);
  if (e === null) throw new Error(`Không có thẻ ${ma} trên màn hình`);
  return e;
}

/* ================================================================== *
 * A. Lưới của chính các parser SPEC
 * ================================================================== */

describe('parser SPEC — ghim chính nó, để mã-và-SPEC cùng lệch vẫn đỏ', () => {
  it('ba nhãn mức cắt ra đúng ba, đúng thứ tự d.249', () => {
    expect(SPEC_KHOI.length).toBe(3);
    expect(SPEC_KHOI).toEqual(['🔴 Gấp', '🟡 Trong ngày', '⚪ Không gấp']);
  });

  it('bảng d.257–262 cắt ra đúng bốn hàng, đúng bốn nút Gửi', () => {
    expect(SPEC_BANG.length).toBe(4);
    expect(SPEC_BANG.map((h) => h.loai)).toEqual(['decision', 'run_command', 'review', 'fyi']);
    expect(SPEC_BANG.map((h) => h.gui[0])).toEqual([
      'Gửi duyệt',
      'Đã chạy · Gửi',
      'Gửi duyệt',
      'Đã đọc',
    ]);
  });

  it('các chuỗi lẻ cắt ra đúng chữ SPEC', () => {
    expect(cauQuaHanTuSpec()).toBe('quá hạn X giờ');
    expect(soDongGapTuSpec()).toBe(6);
    expect(nhanDeXuatTuSpec()).toBe('Đề xuất');
    expect(nhanBoQuaTuSpec()).toBe('Bỏ qua');
    expect(nhanPhienDuyetTuSpec()).toBe('Bắt đầu phiên duyệt');
    expect(cauTerminalThatTuSpec()).toBe('chạy ở terminal thật');
    expect(cauTomTatPhienTuSpec()).toBe('đã xử lý N, bỏ qua M, còn lại K');
    expect(cotDaXuLyTuSpec()).toEqual(['ngày', 'mã', 'tiêu đề ngắn', 'kết quả']);
    expect(nhanLoaiCanChuTuSpec()).toEqual({
      decision: 'Quyết định',
      run_command: 'Chủ chạy lệnh',
      review: 'Chủ review',
      fyi: 'Chỉ để biết',
    });
  });

  it('sổ tra trong mã khớp SPEC — bắt lệch ngay ở hằng, không chỉ ở DOM', () => {
    expect([NHAN_MUC.urgent, NHAN_MUC.today, NHAN_MUC.later]).toEqual(SPEC_KHOI);
    expect(SO_DONG_GAP).toBe(soDongGapTuSpec());
    expect(NHAN_DE_XUAT).toBe(nhanDeXuatTuSpec());
    expect(NHAN_BO_QUA).toBe(nhanBoQuaTuSpec());
    expect(NHAN_PHIEN_DUYET).toBe(nhanPhienDuyetTuSpec());
    expect(CAU_TERMINAL_THAT).toBe(cauTerminalThatTuSpec());
    expect(NHAN_LOAI).toEqual(nhanLoaiCanChuTuSpec());
    // Bốn nút Gửi, từng loại một, so với **đúng hàng** của bảng SPEC.
    for (const h of SPEC_BANG) {
      expect(NHAN_GUI[h.loai as keyof typeof NHAN_GUI]).toBe(h.gui[0]);
    }
    // Hai nút chọn của `review` là chữ đậm của ô "Trên thẻ có" — đúng hai.
    const review = SPEC_BANG.find((h) => h.loai === 'review');
    expect(review?.nut_tren_the).toEqual([NHAN_DAT, NHAN_CAN_SUA]);
  });

  it('"quá hạn X giờ" dựng đúng hình chữ của SPEC (X thay bằng số)', () => {
    expect(cauQuaHan(3)).toBe(cauQuaHanTuSpec().replace('X', '3'));
  });

  it('câu tóm tắt phiên duyệt dựng đúng hình chữ d.275 (N, M, K thay bằng số)', () => {
    expect(cauTomTatPhien(2, 1, 4)).toBe(
      cauTomTatPhienTuSpec().replace('N', '2').replace('M', '1').replace('K', '4'),
    );
  });

  it('d.265 và d.408 đúng là những câu mà lượt này cài', () => {
    expect(specDoiChuyenNgay()).toBe(true);
    expect(specDoiToastHoanLai()).toEqual({ hoan_lai: true, toast: true });
  });

  it('bảng phím tắt d.270 cắt ra đúng NĂM vế, đúng các phím', () => {
    expect(SPEC_PHIM.length).toBe(5);
    expect(SPEC_PHIM.map((v) => v.phim)).toEqual([
      ['1', '5'],
      ['Cmd/Ctrl+Enter'],
      ['D'],
      ['S'],
      ['J', 'K'],
    ]);
    // Và đúng **việc** của từng phím, để một lần đổi nghĩa ở SPEC cũng đỏ.
    expect(SPEC_PHIM.map((v) => v.viec)).toEqual([
      'chọn phương án',
      'gửi',
      'là nút chính của loại lệnh, review, fyi',
      'bỏ qua',
      'lên xuống',
    ]);
  });

  it('d.410 và d.411 cắt ra đúng con số của SPEC', () => {
    expect(hienThayDoiTuSpec()).toEqual({ giay: 3, khong_tai_lai: true });
    expect(specDoiDienThoai()).toEqual({
      px: 375,
      co_can_chu: true,
      co_phien_duyet: true,
      co_hang_loat: true,
      // Vế của lượt 5 (chi tiết ticket ở 375px) — ca của nó ở `chi-tiet-ticket.test.tsx`.
      co_chi_tiet_ticket: true,
    });
  });
});

/* ================================================================== *
 * B. Ba khối — d.249
 * ================================================================== */

describe('d.249 — ba khối 🔴 · 🟡 · ⚪, đúng thứ tự; mục quá hạn viền đỏ', () => {
  it('đủ ba khối, đúng thứ tự SPEC, không thiếu không thừa', async () => {
    mayCanChu();
    await moTrang();
    expect(
      [...document.querySelectorAll('[data-khoi="urgent"],[data-khoi="today"],[data-khoi="later"]')].map(
        (e) => e.getAttribute('aria-label'),
      ),
    ).toEqual(SPEC_KHOI);
  });

  it('thẻ nằm đúng khối của mức nó, và THỨ TỰ máy chủ trả được giữ nguyên', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [the({ ma: 'T-1' }), the({ ma: 'T-2' })],
        today: [the({ ma: 'T-3' })],
      }),
    });
    await moTrang();
    expect(
      [...khoiCua(NHAN_MUC.urgent).querySelectorAll('[data-the]')].map((e) =>
        e.getAttribute('data-the'),
      ),
    ).toEqual(['T-1', 'T-2']);
    expect(khoiCua(NHAN_MUC.today).querySelector('[data-the="T-3"]')).not.toBeNull();
    expect(khoiCua(NHAN_MUC.urgent).querySelector('[data-the="T-3"]')).toBeNull();
  });

  it('mục quá hạn: viền đỏ + chữ "quá hạn X giờ" lấy SỐ GIỜ của máy chủ', async () => {
    mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-9', qua_han: true, qua_han_gio: 3 })] }),
    });
    await moTrang();
    const t = theCua('T-9');
    expect(t.getAttribute('data-qua-han')).toBe('co');
    expect(t.className).toContain('border-red-600');
    expect(t.querySelector('[data-o="qua-han"]')?.textContent).toBe(cauQuaHan(3));
  });

  it('d.412 — HẠN hiện dạng TƯƠNG ĐỐI, rê chuột thấy giờ đầy đủ theo giờ Việt Nam', async () => {
    /*
     * Mốc lấy từ **dữ liệu** (`GIO` của fixture, cũng là `man.bay_gio`), không
     * từ `Date.now()` thật: một ca đo giờ bằng đồng hồ máy sẽ đổi kết quả theo
     * ngày chạy. Hạn ở **tương lai** 2 giờ — đúng hình của một mục Cần Chủ.
     */
    expect(specDoiThoiGianTuongDoi()).toEqual({ tuong_doi: true, gio_viet_nam: true });

    const han = GIO + 2 * GIO_MS;
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-11', han_luc: han })] }) });
    await moTrang();
    const o = theCua('T-11').querySelector('[data-o="han"]');

    // Vế 1 — chữ trên màn hình là chữ tương đối, đếm từ mốc MÁY CHỦ.
    expect(o?.textContent).toBe(`Hạn ${thoiGianTuongDoi(han, GIO)}`);
    expect(o?.textContent).toBe('Hạn trong 2 giờ');
    // Và **không** phải giờ đầy đủ: đây là ca đã lệch ở lượt trước.
    expect(o?.textContent).not.toContain('giờ Việt Nam');

    // Vế 2 — rê chuột thấy giờ đầy đủ.
    expect(o?.getAttribute('title')).toBe(gioDayDu(han));
    expect(o?.getAttribute('title')).toContain('giờ Việt Nam');
  });

  it('mục CHƯA quá hạn không có viền đỏ và không có chữ đó (ca đối chứng)', async () => {
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-10' })] }) });
    await moTrang();
    const t = theCua('T-10');
    expect(t.getAttribute('data-qua-han')).toBe('khong');
    expect(t.className).not.toContain('border-red-600');
    expect(t.querySelector('[data-o="qua-han"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Hệ thiết kế 29/10 (`DESIGN.md`, lượt UI-B) — chấm mức gấp
 * ------------------------------------------------------------------ */

describe('UI-B — mức gấp là CHẤM, không nền màu cả khối/thẻ', () => {
  it('đầu mỗi khối có chấm đúng mức + số đếm; thẻ có chấm mức của chính nó trước mã', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [the({ ma: 'T-1', muc: 'urgent' })],
        today: [the({ ma: 'T-3', muc: 'today' })],
      }),
    });
    await moTrang();

    for (const muc of ['urgent', 'today', 'later'] as const) {
      const dau = khoiCua(NHAN_MUC[muc]).querySelector('h2')!;
      expect(dau.querySelector(`[data-muc-gap="${muc}"]`), muc).not.toBeNull();
      expect(dau.querySelector('[data-so="khoi"]'), muc).not.toBeNull();
    }

    const t = theCua('T-3');
    const cham = t.querySelector('[data-o="muc-gap"]');
    expect(cham?.querySelector('[data-muc-gap="today"]')).not.toBeNull();
    // Tên mức ở `title` (rê chuột), và chấm đứng TRƯỚC mã.
    expect(cham?.getAttribute('title')).toBe(NHAN_MUC.today);
    const ma = t.querySelector('[data-o="ma"]')!;
    expect((cham!.compareDocumentPosition(ma) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    // Không tô nền màu mức gấp lên thẻ.
    expect(t.className).not.toMatch(/bg-(gap|loi|canh)/);
  });
});

/* ================================================================== *
 * C. Một thẻ — d.250
 * ================================================================== */

describe('d.250 — thẻ hiện ĐỦ các vế', () => {
  const day = the({
    ma: 'T-20',
    loai: 'decision',
    du_an: { id: 'pj-1', ten: 'Solo Prep', ma: 'SPX' },
    tieu_de: 'Chốt ngưỡng',
    boi_canh: 'Dòng 1\nDòng 2\nDòng 3\nDòng 4\nDòng 5\nDòng 6\nDòng 7',
    phuong_an: [phuongAn('A', 'Giữ 500'), phuongAn('B', 'Hạ 300', true)],
    phuong_an_de_xuat_id: 'pa-B',
    ticket_lien_quan: [{ id: 'tk-1', ma: 'SPX-12', tieu_de: 'Dựng bảng' }],
  });

  it('mã · dự án · loại · tiêu đề', async () => {
    mayCanChu({ man: manHinh({ urgent: [day] }) });
    await moTrang();
    const t = theCua('T-20');
    expect(t.querySelector('[data-o="ma"]')?.textContent).toBe('T-20');
    expect(t.querySelector('[data-o="du-an"]')?.textContent).toBe('Solo Prep');
    expect(t.querySelector('[data-o="loai"]')?.textContent).toBe(NHAN_LOAI.decision);
    expect(within(t).getByRole('heading', { name: 'Chốt ngưỡng' })).toBeTruthy();
  });

  it('mục Chung (không dự án) hiện chữ "Chung" — 19.12 câu 4', async () => {
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-21' })] }) });
    await moTrang();
    expect(theCua('T-21').querySelector('[data-o="du-an"]')?.textContent).toBe('Chung');
  });

  it('bối cảnh markdown MẶC ĐỊNH GẬP sau 6 dòng, mở ra thì thấy đủ', async () => {
    mayCanChu({ man: manHinh({ urgent: [day] }) });
    const u = await moTrang();
    const t = theCua('T-20');
    expect(t.querySelector('[data-o="boi-canh"]')?.getAttribute('data-gap')).toBe('co');
    expect(t.textContent).not.toContain('Dòng 7');
    expect(t.textContent).toContain('Dòng 6');

    await u.click(t.querySelector('[data-nut="gap-boi-canh"]') as HTMLElement);
    expect(theCua('T-20').textContent).toContain('Dòng 7');
  });

  it('bối cảnh ĐÚNG 6 dòng thì KHÔNG gập, không có nút mở rộng (ca đối chứng)', async () => {
    const sau_dong = Array.from({ length: SO_DONG_GAP }, (_, i) => `D${String(i)}`).join('\n');
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-22', boi_canh: sau_dong })] }) });
    await moTrang();
    const t = theCua('T-22');
    expect(t.querySelector('[data-o="boi-canh"]')?.getAttribute('data-gap')).toBe('khong');
    expect(t.querySelector('[data-nut="gap-boi-canh"]')).toBeNull();
  });

  it('phương án thành NÚT, và đúng phương án đề xuất mang nhãn "Đề xuất"', async () => {
    mayCanChu({ man: manHinh({ urgent: [day] }) });
    await moTrang();
    const t = theCua('T-20');
    const nut = [...t.querySelectorAll('[data-phuong-an]')];
    expect(nut.map((e) => e.getAttribute('data-phuong-an'))).toEqual(['A', 'B']);
    expect(nut.map((e) => e.tagName)).toEqual(['BUTTON', 'BUTTON']);
    // **Chỉ một** nút mang nhãn, và đúng nút B.
    const co_nhan = nut.filter((e) => e.querySelector('[data-de-xuat="co"]') !== null);
    expect(co_nhan.length).toBe(1);
    expect(co_nhan[0]?.getAttribute('data-phuong-an')).toBe('B');
    expect(co_nhan[0]?.textContent).toContain(NHAN_DE_XUAT);
  });

  it('lệnh trong khối code + nút Copy; ghi chú TTY chỉ khi agent đánh dấu', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [
          the({ ma: 'T-30', loai: 'run_command', lenh: 'npm run deploy', can_tty: true }),
          the({ ma: 'T-31', loai: 'run_command', lenh: 'npm test', can_tty: false }),
        ],
      }),
    });
    await moTrang();
    const a = theCua('T-30');
    expect(a.querySelector('pre')?.textContent).toBe('npm run deploy');
    expect(within(a).getByRole('button', { name: NHAN_COPY })).toBeTruthy();
    expect(a.querySelector('[data-o="can-tty"]')?.textContent).toBe(CAU_TERMINAL_THAT);
    // Ca đối chứng: không đánh dấu TTY thì **không** có ghi chú.
    expect(theCua('T-31').querySelector('[data-o="can-tty"]')).toBeNull();
  });

  /**
   * **d.250 viết chung cho MỌI thẻ** ("… lệnh có nút Copy …"), nên khối lệnh
   * không phải đặc sản của `run_command` — `spec-questions.md` #130. Ca này cũng
   * ghim vế thứ hai: bảng d.257–262 **không đổi**, nút "Gửi duyệt" của
   * `decision` vẫn mờ tới khi chọn phương án dù thẻ có lệnh.
   */
  it('thẻ `decision`/`review`/`fyi` có lệnh: vẫn hiện khối code + nút Copy, nút chính KHÔNG đổi', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [
          the({
            ma: 'T-32',
            loai: 'decision',
            lenh: 'npm run deploy',
            can_tty: true,
            phuong_an: [phuongAn('A', 'Deploy luôn'), phuongAn('B', 'Chờ mai')],
          }),
          the({ ma: 'T-33', loai: 'review', lenh: 'git diff main', can_tty: false }),
          the({ ma: 'T-34', loai: 'fyi', lenh: 'cat ghi-chu.txt', can_tty: false }),
          // Ca đối chứng: **không** lệnh thì **không** khối lệnh, ở mọi loại.
          the({ ma: 'T-35', loai: 'fyi' }),
        ],
      }),
    });
    const u = await moTrang();

    const lenh_cua: [string, string][] = [
      ['T-32', 'npm run deploy'],
      ['T-33', 'git diff main'],
      ['T-34', 'cat ghi-chu.txt'],
    ];
    for (const [ma, lenh] of lenh_cua) {
      const t = theCua(ma);
      expect(t.querySelector('[data-o="lenh"]'), ma).not.toBeNull();
      expect(t.querySelector('pre')?.textContent, ma).toBe(lenh);
      expect(within(t).getByRole('button', { name: NHAN_COPY })).toBeTruthy();
    }
    expect(theCua('T-35').querySelector('[data-o="lenh"]')).toBeNull();

    // Ghi chú TTY (d.237) cũng áp cho mọi loại — và chỉ khi agent đánh dấu.
    expect(theCua('T-32').querySelector('[data-o="can-tty"]')?.textContent).toBe(CAU_TERMINAL_THAT);
    expect(theCua('T-33').querySelector('[data-o="can-tty"]')).toBeNull();

    // Nút chính và điều kiện bật nút của d.257–262 **không** đổi.
    const nut_gui = (ma: string): HTMLButtonElement =>
      theCua(ma).querySelector('[data-nut="gui"]') as HTMLButtonElement;
    expect(nut_gui('T-32').textContent).toBe(SPEC_BANG.find((h) => h.loai === 'decision')?.gui[0]);
    expect(nut_gui('T-32').disabled).toBe(true);
    await u.click(theCua('T-32').querySelector('[data-phuong-an="A"]') as HTMLElement);
    expect(nut_gui('T-32').disabled).toBe(false);
    expect(nut_gui('T-34').textContent).toBe(SPEC_BANG.find((h) => h.loai === 'fyi')?.gui[0]);
  });

  it('file/link có link; link ticket trỏ `/t/<MÃ>` (d.398)', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [
          {
            ...day,
            file: [
              { loai: 'file', dia_chi: 'file:///tmp/a.md', thu_tu: 1 },
              { loai: 'link', dia_chi: 'javascript:alert(1)', thu_tu: 2 },
            ],
          },
        ],
      }),
    });
    await moTrang();
    const t = theCua('T-20');
    expect(t.querySelector('[data-file="an-toan"]')?.getAttribute('href')).toBe(
      'file:///tmp/a.md',
    );
    // Fail-closed ở chỗ vẽ: scheme lạ **không** thành `<a href>`.
    expect(t.querySelector('[data-file="khong-an-toan"]')).not.toBeNull();
    expect(t.querySelectorAll('[data-ds="file"] a').length).toBe(1);
    expect(
      t.querySelector('[data-ds="ticket"] a')?.getAttribute('href'),
    ).toBe('/t/SPX-12');
  });
});

/* ================================================================== *
 * D. Trả lời bằng nút rồi bấm Gửi — d.257–262
 * ================================================================== */

describe('d.259–262 — bốn loại, bốn hình nút, và điều kiện mờ của nút Gửi', () => {
  it('`coTheGui` — hàm thuần cài đúng ba điều kiện của SPEC', () => {
    expect(coTheGui('decision', NHAP_RONG)).toBe(false);
    expect(coTheGui('decision', { ...NHAP_RONG, phuong_an: 'A' })).toBe(true);
    /*
     * **#121** — `decision` gửi được bằng một câu trả lời **tự do**: d.259 nói
     * "mờ cho tới khi đã chọn 1 phương án" nhưng d.244 nói kết quả là "phương án
     * đã chọn **và/hoặc** chữ tự do", và chủ đã yêu cầu trực tiếp (11/10).
     */
    expect(coTheGui('decision', { ...NHAP_RONG, ghi_them: 'làm trước tính năng' })).toBe(true);
    // Ca đối chứng: ô "Ghi thêm" chỉ có khoảng trắng thì **vẫn** không gửi được —
    // một mục `resolved` không `ket_qua` là trạng thái d.279 cảnh báo.
    expect(coTheGui('decision', { ...NHAP_RONG, ghi_them: '   ' })).toBe(false);
    expect(coTheGui('review', NHAP_RONG)).toBe(false);
    expect(coTheGui('review', { ...NHAP_RONG, ket_luan: 'dat' })).toBe(true);
    // "Cần sửa thì **bắt buộc ghi chú**" — d.261.
    expect(coTheGui('review', { ...NHAP_RONG, ket_luan: 'can_sua' })).toBe(false);
    expect(coTheGui('review', { ...NHAP_RONG, ket_luan: 'can_sua', ghi_them: 'x' })).toBe(true);
    // Ô kết quả **tuỳ chọn** — d.260, d.262.
    expect(coTheGui('run_command', NHAP_RONG)).toBe(true);
    expect(coTheGui('fyi', NHAP_RONG)).toBe(true);
  });

  it('mỗi loại có đúng nút Gửi của SPEC trên thẻ', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [
          the({ ma: 'T-40', loai: 'decision', phuong_an: [phuongAn('A', 'x')] }),
          the({ ma: 'T-41', loai: 'run_command', lenh: 'ls' }),
          the({ ma: 'T-42', loai: 'review' }),
          the({ ma: 'T-43', loai: 'fyi' }),
        ],
      }),
    });
    await moTrang();
    const bang: [string, string][] = [
      ['T-40', 'decision'],
      ['T-41', 'run_command'],
      ['T-42', 'review'],
      ['T-43', 'fyi'],
    ];
    const thay: string[] = [];
    for (const [ma] of bang) {
      thay.push(theCua(ma).querySelector('[data-nut="gui"]')?.textContent ?? '');
    }
    expect(thay).toEqual(bang.map(([, l]) => SPEC_BANG.find((h) => h.loai === l)?.gui[0]));
  });

  it('`decision`: nút Gửi duyệt MỜ khi chưa chọn, KHÔNG mờ sau khi chọn; bấm cái khác thì đổi', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [
          the({
            ma: 'T-50',
            loai: 'decision',
            phuong_an: [phuongAn('A', 'Giữ'), phuongAn('B', 'Hạ')],
          }),
        ],
      }),
    });
    const u = await moTrang();
    const t = () => theCua('T-50');
    const nut_gui = (): HTMLButtonElement =>
      t().querySelector('[data-nut="gui"]') as HTMLButtonElement;

    expect(nut_gui().disabled).toBe(true);

    await u.click(t().querySelector('[data-phuong-an="A"]') as HTMLElement);
    expect(nut_gui().disabled).toBe(false);
    expect(t().querySelector('[data-phuong-an="A"]')?.getAttribute('aria-pressed')).toBe('true');

    // "bấm phương án khác để **đổi**" — đúng một phương án đang chọn.
    await u.click(t().querySelector('[data-phuong-an="B"]') as HTMLElement);
    expect(t().querySelector('[data-phuong-an="A"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(t().querySelector('[data-phuong-an="B"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('thân gửi của `decision` mang nhãn phương án + ghi thêm', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({
        urgent: [
          the({ ma: 'T-51', loai: 'decision', phuong_an: [phuongAn('A', 'Giữ')] }),
        ],
      }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-51/xu-ly', 'ct-T-51');
    const u = await moTrang();
    await u.click(theCua('T-51').querySelector('[data-phuong-an="A"]') as HTMLElement);
    await u.type(theCua('T-51').querySelector('[data-o="ghi-them"]') as HTMLElement, 'ngưỡng 500');
    await u.click(theCua('T-51').querySelector('[data-nut="gui"]') as HTMLElement);

    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-51/xu-ly')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({
      phuong_an: 'A',
      ghi_them: 'ngưỡng 500',
    });
  });

  it('#121 — `decision` chỉ gõ "Ghi thêm": nút Gửi BẬT, thân chỉ mang `ghi_them`', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({
        urgent: [
          the({
            ma: 'T-52',
            loai: 'decision',
            phuong_an: [phuongAn('A', 'Giữ'), phuongAn('B', 'Hạ'), phuongAn('C', 'Bỏ')],
          }),
        ],
      }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-52/xu-ly', 'ct-T-52');
    const u = await moTrang();
    const t = () => theCua('T-52');
    const nut_gui = (): HTMLButtonElement =>
      t().querySelector('[data-nut="gui"]') as HTMLButtonElement;

    // Đúng chỗ chủ kẹt hôm 11/10: ba phương án, chủ không chọn cái nào.
    expect(nut_gui().disabled).toBe(true);
    await u.type(
      t().querySelector('[data-o="ghi-them"]') as HTMLElement,
      'làm trước tính năng, chưa cần đo gì',
    );
    expect(nut_gui().disabled).toBe(false);

    await u.click(nut_gui());
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-52/xu-ly')).toBe(1);
    });
    // **Không** `phuong_an` trong thân — không `null`, không chuỗi rỗng.
    const than_gui = m.da_goi.find((l) => l.method === 'POST')?.than;
    expect(than_gui).toEqual({ ghi_them: 'làm trước tính năng, chưa cần đo gì' });
    expect(Object.keys(than_gui as Record<string, unknown>)).not.toContain('phuong_an');
  });

  it('#121 — nhãn ô "Ghi thêm" của `decision` NÓI RÕ gõ vào đây là gửi được', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [
          the({ ma: 'T-53', loai: 'decision', phuong_an: [phuongAn('A', 'Giữ')] }),
          the({ ma: 'T-54', loai: 'review' }),
        ],
      }),
    });
    await moTrang();
    // Nhãn cũ ("Ghi thêm (tuỳ chọn)") là chữ của một luật đã nới — mục `review`
    // vẫn giữ nó, nên ca này cũng là ca đối chứng.
    expect(theCua('T-53').textContent).toContain(NHAN_GHI_THEM_DECISION);
    expect(theCua('T-54').textContent).toContain(NHAN_GHI_THEM);
    expect(theCua('T-54').textContent).not.toContain(NHAN_GHI_THEM_DECISION);
  });

  it('`review`: Cần sửa mà chưa ghi chú thì CHẶN Gửi và nói rõ lý do; Đạt thì không chặn', async () => {
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-60', loai: 'review' })] }) });
    const u = await moTrang();
    const t = () => theCua('T-60');

    await u.click(t().querySelector('[data-ket-luan="can_sua"]') as HTMLElement);
    expect((t().querySelector('[data-nut="gui"]') as HTMLButtonElement).disabled).toBe(true);
    expect(within(t()).getByRole('alert').textContent).toBe(CAU_CAN_SUA_CAN_GHI_CHU);

    await u.type(t().querySelector('[data-o="ghi-them"]') as HTMLElement, 'thiếu test');
    expect((t().querySelector('[data-nut="gui"]') as HTMLButtonElement).disabled).toBe(false);
    expect(within(t()).queryByRole('alert')).toBeNull();

    // Ca đối chứng: Đạt **không** đòi ghi chú.
    await u.click(t().querySelector('[data-ket-luan="dat"]') as HTMLElement);
    expect((t().querySelector('[data-nut="gui"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('`review`: thân gửi mang `ket_luan`, đúng mã máy của d.261', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-61', loai: 'review' })] }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-61/xu-ly', 'ct-T-61');
    const u = await moTrang();
    await u.click(theCua('T-61').querySelector('[data-ket-luan="dat"]') as HTMLElement);
    await u.click(theCua('T-61').querySelector('[data-nut="gui"]') as HTMLElement);
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-61/xu-ly')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({ ket_luan: 'dat' });
  });

  it('`fyi`: nút "Đã đọc" gửi được NGAY, thân rỗng (19.9 d.539 cho mặc định)', async () => {
    const { m, kho } = mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-70' })] }) });
    datGhi(m, kho, '/v1/can-chu/ct-T-70/xu-ly', 'ct-T-70');
    const u = await moTrang();
    await u.click(
      within(theCua('T-70')).getByRole('button', { name: NHAN_GUI.fyi }),
    );
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-70/xu-ly')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({});
  });
});

/* ================================================================== *
 * E. Bỏ qua — d.264
 * ================================================================== */

describe('d.264 — mọi thẻ có "Bỏ qua", bắt buộc nhập lý do rồi Gửi', () => {
  it('MỌI loại đều có link Bỏ qua', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [
          the({ ma: 'T-80', loai: 'decision', phuong_an: [phuongAn('A', 'x')] }),
          the({ ma: 'T-81', loai: 'run_command', lenh: 'ls' }),
          the({ ma: 'T-82', loai: 'review' }),
          the({ ma: 'T-83', loai: 'fyi' }),
        ],
      }),
    });
    await moTrang();
    const thieu = ['T-80', 'T-81', 'T-82', 'T-83'].filter(
      (ma) => theCua(ma).querySelector('[data-nut="bo-qua"]') === null,
    );
    expect(thieu).toEqual([]);
  });

  it('lý do rỗng thì chặn Gửi và nói rõ; có lý do thì gửi `/bo-qua` kèm `ly_do`', async () => {
    const { m, kho } = mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-84' })] }) });
    datGhi(m, kho, '/v1/can-chu/ct-T-84/bo-qua', 'ct-T-84');
    const u = await moTrang();
    await u.click(theCua('T-84').querySelector('[data-nut="bo-qua"]') as HTMLElement);

    const gui = (): HTMLButtonElement =>
      theCua('T-84').querySelector('[data-nut="gui-bo-qua"]') as HTMLButtonElement;
    expect(gui().disabled).toBe(true);
    expect(theCua('T-84').querySelector('[data-o="can-ly-do"]')?.textContent).toBe(
      CAU_BO_QUA_CAN_LY_DO,
    );

    await u.type(theCua('T-84').querySelector('[data-o="ly-do-bo-qua"]') as HTMLElement, 'để sau');
    expect(gui().disabled).toBe(false);
    await u.click(gui());

    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-84/bo-qua')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({ ly_do: 'để sau' });
  });
});

/* ================================================================== *
 * F. Cập nhật lạc quan — d.265 + d.408
 * ================================================================== */

describe('d.265 + d.408 — hiện NGAY, máy chủ từ chối thì hoàn lại + toast', () => {
  it('thẻ xuống bảng Đã xử lý TRƯỚC khi máy chủ trả lời', async () => {
    let tha = (): void => undefined;
    const cho = new Promise<void>((r) => {
      tha = r;
    });
    const { m, kho } = mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-90' })] }) });
    datGhi(m, kho, '/v1/can-chu/ct-T-90/xu-ly', 'ct-T-90', { cho });

    const u = await moTrang();
    await u.click(within(theCua('T-90')).getByRole('button', { name: NHAN_GUI.fyi }));

    // Máy chủ **chưa** trả lời (promise `cho` còn treo), mà thẻ đã rời khối và
    // dòng đã có trong bảng — đúng vế "chuyển **ngay**" của d.265.
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-90"]')).toBeNull();
    });
    expect(document.querySelector('[data-dong-da-xu-ly="T-90"]')).not.toBeNull();
    expect(m.soLan('GET', '/v1/can-chu')).toBe(1);

    tha();
    // Sau khi máy chủ xong: tải lại, và thẻ **vẫn** không mọc lại (kho đã đổi).
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/can-chu')).toBeGreaterThan(1);
    });
    expect(document.querySelector('[data-the="T-90"]')).toBeNull();
  });

  it('huy hiệu/số của khối giảm ngay cùng lúc', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-91' }), the({ ma: 'T-92' })] }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-91/xu-ly', 'ct-T-91');
    const u = await moTrang();
    expect(khoiCua(NHAN_MUC.urgent).querySelector('[data-so="khoi"]')?.textContent).toBe('2');
    await u.click(within(theCua('T-91')).getByRole('button', { name: NHAN_GUI.fyi }));
    await waitFor(() => {
      expect(khoiCua(NHAN_MUC.urgent).querySelector('[data-so="khoi"]')?.textContent).toBe('1');
    });
  });

  it('máy chủ TỪ CHỐI (409) ⇒ thẻ QUAY VỀ khối cũ, toast in NGUYÊN VĂN câu máy chủ', async () => {
    const CAU = 'T-93 đã xử lý, mở lại trước (SPEC 19.10).';
    const man = manHinh({ today: [the({ ma: 'T-93' })] });

    /*
     * **Lần tải lại SAU mutation bị giữ treo, có chủ ý.**
     *
     * Đo bằng đột biến: nếu để lần tải lại của `onSettled` trả về bình thường
     * thì thẻ mọc lại **từ máy chủ** dù nhánh hoàn lại có hay không — ca xanh
     * với một `onError` **trống rỗng** (đã thử: mutant sống sót). Giữ lần tải
     * thứ hai treo lại làm thứ đang hiện trên màn hình đúng là **bản đã hoàn**,
     * nên ca này đo chính nhánh hoàn lại.
     */
    let lan = 0;
    const treo = new Promise<void>(() => undefined);
    /*
     * Không giữ `MayChuGia` vào một biến: ca này đo **màn hình** (toast nguyên
     * văn + thẻ về đúng khối cũ), không đo số lần gọi — một biến không ai đọc là
     * một lời hứa suông rằng có assert trên nó.
     */
    new MayChuGia()
      .dat('GET /v1/can-chu', () => {
        lan += 1;
        return lan === 1 ? { than: man } : { than: man, cho: treo };
      })
      .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .dat('POST /v1/can-chu/ct-T-93/xu-ly', {
        http: 409,
        loi: { error: 'ALREADY_RESOLVED', message: CAU },
      })
      .gan();

    const u = await moTrang();
    await u.click(within(theCua('T-93')).getByRole('button', { name: NHAN_GUI.fyi }));

    // Câu lỗi là câu **của máy chủ**, không một bản dịch thứ hai ở giao diện.
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(CAU);
    });

    // Và thẻ **quay về đúng khối cũ** (🟡, không 🔴).
    await waitFor(() => {
      expect(khoiCua(NHAN_MUC.today).querySelector('[data-the="T-93"]')).not.toBeNull();
    });
    expect(khoiCua(NHAN_MUC.urgent).querySelector('[data-the="T-93"]')).toBeNull();
    expect(document.querySelector('[data-dong-da-xu-ly="T-93"]')).toBeNull();
  });

  it('nhánh LỖI cũng tải lại (`onSettled`, không `onSuccess`)', async () => {
    const { m, kho } = mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-94' })] }) });
    datGhi(m, kho, '/v1/can-chu/ct-T-94/xu-ly', 'ct-T-94', {
      http: 409,
      loi: { error: 'ALREADY_RESOLVED', message: 'đã xử lý' },
    });
    const u = await moTrang();
    expect(m.soLan('GET', '/v1/can-chu')).toBe(1);
    await u.click(within(theCua('T-94')).getByRole('button', { name: NHAN_GUI.fyi }));
    // Nếu đổi `onSettled` thành `onSuccess` thì con số này đứng ở 1 ⇒ ca đỏ.
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/can-chu')).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/can-chu/da-xu-ly')).toBeGreaterThan(1);
    });
  });
});

/* ================================================================== *
 * G. Bảng "Đã xử lý" — d.251
 * ================================================================== */

describe('d.251 — bảng Đã xử lý: bốn cột của SPEC + lọc khoảng ngày', () => {
  it('bốn cột, ĐÚNG CHỮ và ĐÚNG THỨ TỰ của SPEC', async () => {
    mayCanChu({ da: [dongDaXuLy({ ma: 'T-95' })] });
    await moTrang();
    const bang = khoiCua('Đã xử lý');
    expect([...bang.querySelectorAll('thead th')].map((e) => e.textContent)).toEqual(
      cotDaXuLyTuSpec(),
    );
  });

  it('một dòng hiện ngày, mã, tiêu đề NGẮN (máy chủ cắt) và kết quả', async () => {
    mayCanChu({
      da: [
        dongDaXuLy({
          ma: 'T-96',
          ngay: '2025-10-04',
          tieu_de: 'Một tiêu đề rất dài không bao giờ cắt ở giao diện',
          tieu_de_ngan: 'Một tiêu đề rất dài…',
          ket_qua: 'A, ngưỡng 500',
        }),
      ],
    });
    await moTrang();
    const d = document.querySelector('[data-dong-da-xu-ly="T-96"]') as HTMLElement;
    // Ô thời gian là chữ **tương đối** của d.412 (ca riêng ở dưới đo cả hai vế);
    // ngày trên tường vẫn đọc được khi rê chuột.
    expect(d.querySelector('[data-cot="ngay"] [data-cot="xu-ly-luc"]')).not.toBeNull();
    expect(d.querySelector('[data-cot="ma"]')?.textContent).toBe('T-96');
    // Cắt là việc của máy chủ (`tieuDeNgan`): giao diện **không** cắt lần hai.
    expect(d.querySelector('[data-cot="tieu-de"]')?.textContent).toBe('Một tiêu đề rất dài…');
    expect(d.querySelector('[data-cot="ket-qua"]')?.textContent).toBe('A, ngưỡng 500');
  });

  it('d.412 — ô thời gian của bảng cũng TƯƠNG ĐỐI, rê chuột thấy giờ đầy đủ', async () => {
    /*
     * Bảng Đã xử lý ở **cùng** màn hình Cần Chủ (d.251), nên d.412 áp cho nó y
     * như cho hạn trên thẻ. Mốc lấy từ **fixture** (`bay_gio` = `GIO` của thân
     * `da-xu-ly`), không `Date.now()` thật: một ca đo bằng đồng hồ máy sẽ đổi kết
     * quả theo ngày chạy — và chính "đồng hồ thứ hai" đó là thứ luật này cấm.
     */
    expect(specDoiThoiGianTuongDoi()).toEqual({ tuong_doi: true, gio_viet_nam: true });

    const luc = GIO - 3 * GIO_MS;
    mayCanChu({ da: [dongDaXuLy({ ma: 'T-98', xu_ly_luc: luc })] });
    await moTrang();
    const o = document.querySelector('[data-dong-da-xu-ly="T-98"] [data-cot="xu-ly-luc"]');

    // Vế 1 — chữ trên màn hình là chữ tương đối, đếm từ mốc MÁY CHỦ.
    expect(o?.textContent).toBe(thoiGianTuongDoi(luc, GIO));
    expect(o?.textContent).toBe('3 giờ trước');
    // Ca phủ định: **không** phải giờ đầy đủ, và không phải `YYYY-MM-DD`.
    expect(o?.textContent).not.toContain('giờ Việt Nam');
    expect(o?.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    // Vế 2 — rê chuột thấy giờ đầy đủ theo giờ Việt Nam.
    expect(o?.getAttribute('title')).toBe(gioDayDu(luc));
    expect(o?.getAttribute('title')).toContain('giờ Việt Nam');
  });

  it('mục Bỏ qua cũng nằm trong bảng, kèm trạng thái để phân biệt', async () => {
    mayCanChu({
      da: [dongDaXuLy({ ma: 'T-97', trang_thai: 'skipped', ket_qua: 'để sau' })],
    });
    await moTrang();
    const o = document.querySelector('[data-dong-da-xu-ly="T-97"] [data-cot="ket-qua"]');
    expect(o?.getAttribute('data-trang-thai')).toBe('skipped');
    expect(o?.textContent).toBe('để sau');
  });
});

/* ================================================================== *
 * H. Bộ lọc ghi trên URL — d.252, d.251, d.397
 * ================================================================== */

function Dia(): React.JSX.Element {
  const l = useLocation();
  return <output data-dia="co">{l.search}</output>;
}

describe('d.252 + d.251 — lọc theo dự án, loại, khoảng ngày; GHI TRÊN URL (d.397)', () => {
  it('bộ lọc trên URL đi thẳng vào tham số truy vấn của CẢ HAI đường đọc', async () => {
    const kho = { man: MAN_HINH_RONG, da: [] as DongDaXuLy[] };
    const m = new MayChuGia()
      .dat('GET /v1/can-chu?project_id=pj-1&loai=decision', () => ({ than: kho.man }))
      .dat(
        'GET /v1/can-chu/da-xu-ly?project_id=pj-1&loai=decision&tu_ngay=2025-10-01&den_ngay=2025-10-05',
        () => ({ than: bangDaXuLy(kho.da) }),
      )
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .gan();

    dung(
      <TrangCanChu />,
      '/can-chu?du_an=pj-1&loai=decision&tu_ngay=2025-10-01&den_ngay=2025-10-05',
    );
    await screen.findByRole('region', { name: SPEC_KHOI[0] ?? '' });

    // `MayChuGia` trượt kèm tên đường, nên một URL khác đi là ca đỏ — không cần
    // assert thêm. Nhưng ghim số lần để chắc **đã** gọi, không phải "không gọi
    // gì nên không trượt gì".
    expect(m.soLan('GET', '/v1/can-chu?project_id=pj-1&loai=decision')).toBe(1);
  });

  it('đổi bộ lọc dự án GHI LÊN URL (chia sẻ được, đánh dấu trang được)', async () => {
    const kho = { man: MAN_HINH_RONG };
    new MayChuGia()
      .dat('GET /v1/can-chu', () => ({ than: kho.man }))
      .dat('GET /v1/can-chu?project_id=chung', () => ({ than: kho.man }))
      .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
      .dat('GET /v1/can-chu/da-xu-ly?project_id=chung', { than: DA_XU_LY_RONG })
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .gan();

    const u = userEvent.setup();
    dung(
      <>
        <TrangCanChu />
        <Dia />
      </>,
      '/can-chu',
    );
    await screen.findByRole('region', { name: SPEC_KHOI[0] ?? '' });

    await u.selectOptions(
      document.querySelector(`[data-loc="${KHOA_LOC.du_an}"]`) as HTMLElement,
      'chung',
    );
    await waitFor(() => {
      expect(document.querySelector('[data-dia="co"]')?.textContent).toBe('?du_an=chung');
    });
  });

  it('đổi "Từ ngày" ghi lên URL và chỉ đổi đường bảng Đã xử lý', async () => {
    const m = new MayChuGia()
      .dat('GET /v1/can-chu', { than: MAN_HINH_RONG })
      .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
      .dat('GET /v1/can-chu/da-xu-ly?tu_ngay=2025-10-02', { than: DA_XU_LY_RONG })
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .gan();

    dung(
      <>
        <TrangCanChu />
        <Dia />
      </>,
      '/can-chu',
    );
    await screen.findByRole('region', { name: SPEC_KHOI[0] ?? '' });

    const o = document.querySelector(`[data-loc="${KHOA_LOC.tu_ngay}"]`) as HTMLInputElement;
    /*
     * `fireEvent.change` cho ô `type="date"`, không `user.type`: gõ từng ký tự
     * vào một ô ngày trong jsdom không sinh một giá trị hợp lệ nào cho tới ký tự
     * cuối, nên ca sẽ đo một chuỗi rỗng. Đây là một ô ngày của trình duyệt —
     * thứ cần canh là "giá trị đổi ⇒ URL đổi ⇒ đường API đổi".
     */
    fireEvent.change(o, { target: { value: '2025-10-02' } });
    await waitFor(() => {
      expect(document.querySelector('[data-dia="co"]')?.textContent).toBe('?tu_ngay=2025-10-02');
    });
    await waitFor(() => {
      expect(m.soLan('GET', '/v1/can-chu/da-xu-ly?tu_ngay=2025-10-02')).toBe(1);
    });
  });
});

/* ================================================================== *
 * I. Phiên duyệt — d.274–275
 * ================================================================== */

describe('d.274–275 — phiên duyệt: từng thẻ một, thứ tự 🔴 → 🟡 → ⚪, tóm tắt cuối', () => {
  it('bấm "Bắt đầu phiên duyệt" ⇒ chỉ MỘT thẻ, và là thẻ 🔴 trước', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [the({ ma: 'T-100' })],
        today: [the({ ma: 'T-101' })],
        later: [the({ ma: 'T-102' })],
      }),
    });
    const u = await moTrang();
    await u.click(screen.getByRole('button', { name: NHAN_PHIEN_DUYET }));

    expect(document.querySelectorAll('[data-the]').length).toBe(1);
    expect(document.querySelector('[data-the]')?.getAttribute('data-the')).toBe('T-100');
    // Ba khối không còn trên màn hình trong chế độ phiên duyệt.
    expect(screen.queryByRole('region', { name: NHAN_MUC.later })).toBeNull();
  });

  it('xử lý một thẻ ⇒ sang thẻ kế tiếp theo đúng thứ tự mức', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-103' })], today: [the({ ma: 'T-104' })] }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-103/xu-ly', 'ct-T-103');
    const u = await moTrang();
    await u.click(screen.getByRole('button', { name: NHAN_PHIEN_DUYET }));
    await u.click(within(theCua('T-103')).getByRole('button', { name: NHAN_GUI.fyi }));

    await waitFor(() => {
      expect(document.querySelector('[data-the]')?.getAttribute('data-the')).toBe('T-104');
    });
    expect(document.querySelectorAll('[data-the]').length).toBe(1);
  });

  it('cuối phiên: "đã xử lý N, bỏ qua M, còn lại K" với số ĐÚNG việc đã làm', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({
        urgent: [the({ ma: 'T-105' }), the({ ma: 'T-106' })],
        today: [the({ ma: 'T-107' })],
      }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-105/xu-ly', 'ct-T-105');
    datGhi(m, kho, '/v1/can-chu/ct-T-106/bo-qua', 'ct-T-106');

    const u = await moTrang();
    await u.click(screen.getByRole('button', { name: NHAN_PHIEN_DUYET }));

    // 1. Xử lý T-105.
    await u.click(within(theCua('T-105')).getByRole('button', { name: NHAN_GUI.fyi }));
    await waitFor(() => {
      expect(document.querySelector('[data-the]')?.getAttribute('data-the')).toBe('T-106');
    });

    // 2. Bỏ qua T-106.
    await u.click(theCua('T-106').querySelector('[data-nut="bo-qua"]') as HTMLElement);
    await u.type(
      theCua('T-106').querySelector('[data-o="ly-do-bo-qua"]') as HTMLElement,
      'để sau',
    );
    await u.click(theCua('T-106').querySelector('[data-nut="gui-bo-qua"]') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('[data-the]')?.getAttribute('data-the')).toBe('T-107');
    });

    // 3. Kết thúc: còn lại đúng 1 (T-107).
    await u.click(screen.getByRole('button', { name: 'Kết thúc phiên' }));
    expect(document.querySelector('[data-o="tom-tat"]')?.textContent).toBe(
      cauTomTatPhien(1, 1, 1),
    );
  });

  it('hết mục Chờ ⇒ tóm tắt hiện ngay, "còn lại 0"', async () => {
    mayCanChu();
    const u = await moTrang();
    await u.click(screen.getByRole('button', { name: NHAN_PHIEN_DUYET }));
    expect(document.querySelector('[data-o="tom-tat"]')?.textContent).toBe(
      cauTomTatPhien(0, 0, 0),
    );
  });
});

/* ================================================================== *
 * J. Ô trả lời hàng loạt trên màn hình — d.271
 * ================================================================== */

describe('d.271 — ô hàng loạt: xem trước, dòng đỏ chặn, áp một lần', () => {
  const man = manHinh({
    urgent: [
      the({ ma: 'T-110' }),
      the({ ma: 'T-111', loai: 'decision', phuong_an: [phuongAn('A', 'Giữ')] }),
    ],
  });

  it('dòng không hiểu báo ĐỎ và nút áp bị chặn — không gửi request nào', async () => {
    const { m } = mayCanChu({ man });
    const u = await moTrang();
    await u.type(
      document.querySelector('[data-o="van-hang-loat"]') as HTMLElement,
      'T-110: đã xem{enter}T-404: đã xem',
    );
    await u.click(screen.getByRole('button', { name: 'Xem trước' }));

    const dong = [...document.querySelectorAll('[data-dong-hang-loat]')];
    expect(dong.map((e) => e.getAttribute('data-dong-hang-loat'))).toEqual([
      'hieu',
      'khong-hieu',
    ]);
    expect(dong[1]?.textContent).toContain('T-404');

    const nut = screen.getByRole<HTMLButtonElement>('button', { name: 'Áp một lần' });
    expect(nut.disabled).toBe(true);
    await u.click(nut);
    expect(m.da_goi.filter((l) => l.method === 'POST').length).toBe(0);
  });

  it('cả lô hiểu được ⇒ áp MỘT LẦN, mỗi mục một request với đúng thân', async () => {
    const { m, kho } = mayCanChu({ man });
    datGhi(m, kho, '/v1/can-chu/ct-T-110/xu-ly', 'ct-T-110');
    datGhi(m, kho, '/v1/can-chu/ct-T-111/xu-ly', 'ct-T-111');

    const u = await moTrang();
    await u.type(
      document.querySelector('[data-o="van-hang-loat"]') as HTMLElement,
      'T-110: đã xem{enter}T-111: A, ngưỡng 500',
    );
    await u.click(screen.getByRole('button', { name: 'Xem trước' }));
    await u.click(screen.getByRole('button', { name: 'Áp một lần' }));

    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-110/xu-ly')).toBe(1);
    });
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-111/xu-ly')).toBe(1);
    });
    expect(
      m.da_goi.find((l) => l.duong === '/v1/can-chu/ct-T-111/xu-ly')?.than,
    ).toEqual({ phuong_an: 'A', ghi_them: 'ngưỡng 500' });

    // Hai thẻ rời khối ngay (cập nhật lạc quan áp cho từng mục).
    await waitFor(() => {
      expect(document.querySelectorAll('[data-the]').length).toBe(0);
    });
  });

  it('lô chạy TUẦN TỰ: mục sau chỉ đi SAU khi mục trước trả lời; mục bị từ chối không làm dừng lô', async () => {
    /*
     * Ca này ghim **thứ tự chạy**, không chỉ số request — và ghim nó bằng cách
     * duy nhất đo được từ ngoài: giữ phản hồi của mục **thứ nhất** treo lại, rồi
     * đo rằng mục thứ hai **chưa** đi. Bắn cả lô song song thì cả ba request đã
     * nằm trong `da_goi` ngay lúc đó ⇒ ca đỏ (đã thử: `void gui(...)` thay cho
     * `await gui(...)` làm ca này đỏ).
     *
     * Vì sao thứ tự chạy là chuyện đáng ghim: mỗi mutation tự `cancelQueries`
     * rồi **chụp ảnh** cache ở `onMutate`. Song song thì các ảnh chồng lên nhau
     * theo một thứ tự không ai điều khiển, nên một mục bị từ chối ở giữa lô có
     * thể hoàn về một ảnh **cũ hơn** và làm các mục đã xong **mọc lại**. Tuần tự
     * thì mỗi ảnh chắc chắn đã chứa mọi mục trước đó.
     *
     * Nửa sau của ca đo chính hậu quả đó: mục thứ ba bị 409 ⇒ **đúng một** thẻ
     * còn trên màn hình. Lần tải lại của `onSettled` bị giữ treo như ca 409 ở
     * trên, nếu không máy chủ giả sẽ dọn màn hình giúp.
     */
    const ba = manHinh({
      urgent: [the({ ma: 'T-113' }), the({ ma: 'T-114' }), the({ ma: 'T-115' })],
    });
    const { m, kho } = mayCanChu({ man: ba });

    let moKhoa = (): void => undefined;
    const khoa = new Promise<void>((ok) => {
      moKhoa = () => {
        ok();
      };
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-113/xu-ly', 'ct-T-113', { cho: khoa });
    datGhi(m, kho, '/v1/can-chu/ct-T-114/xu-ly', 'ct-T-114');
    datGhi(m, kho, '/v1/can-chu/ct-T-115/xu-ly', 'ct-T-115', {
      http: 409,
      loi: { error: 'ALREADY_RESOLVED', message: 'T-115 đã xử lý, mở lại trước' },
    });

    let lan = 0;
    const treo = new Promise<void>(() => undefined);
    m.dat('GET /v1/can-chu', () => {
      lan += 1;
      return lan === 1 ? { than: kho.man } : { than: kho.man, cho: treo };
    });

    const u = await moTrang();
    await u.type(
      document.querySelector('[data-o="van-hang-loat"]') as HTMLElement,
      'T-113: đã xem{enter}T-114: đã xem{enter}T-115: đã xem',
    );
    await u.click(screen.getByRole('button', { name: 'Xem trước' }));
    await u.click(screen.getByRole('button', { name: 'Áp một lần' }));

    // Mục 1 đã đi, mục 2 và 3 **chưa** — đây là vế "tuần tự".
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-113/xu-ly')).toBe(1);
    });
    expect(m.soLan('POST', '/v1/can-chu/ct-T-114/xu-ly')).toBe(0);
    expect(m.soLan('POST', '/v1/can-chu/ct-T-115/xu-ly')).toBe(0);

    moKhoa();

    // Mục 3 bị từ chối, nhưng mục 2 vẫn chạy: một mục đỏ không dừng cả lô.
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('T-115');
    });
    expect(m.soLan('POST', '/v1/can-chu/ct-T-114/xu-ly')).toBe(1);

    // Và đúng MỘT thẻ còn lại — thẻ bị từ chối, không hai thẻ đã xong mọc lại.
    expect(
      [...document.querySelectorAll('[data-the]')].map((e) => e.getAttribute('data-the')),
    ).toEqual(['T-115']);
  });
});

/* ================================================================== *
 * K. Phím tắt trong trang — d.270
 * ================================================================== */

describe('d.270 — `1`–`5`, `Cmd/Ctrl+Enter`, `D`, `S`, `J`/`K`', () => {
  it('`hanhDongPhim` — hàm thuần khớp từng vế của d.270', () => {
    const p = (
      key: string,
      tuy: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; trong_o_nhap?: boolean } = {},
    ): ReturnType<typeof hanhDongPhim> =>
      hanhDongPhim({
        key,
        metaKey: tuy.metaKey ?? false,
        ctrlKey: tuy.ctrlKey ?? false,
        altKey: tuy.altKey ?? false,
        trong_o_nhap: tuy.trong_o_nhap ?? false,
      });

    expect(p('1')).toEqual({ loai: 'phuong-an', so: 1 });
    expect(p(String(SO_PHIM_PHUONG_AN))).toEqual({ loai: 'phuong-an', so: SO_PHIM_PHUONG_AN });
    // "`1`–`5`" — **không** `6`.
    expect(p('6')).toBeNull();
    expect(p('Enter', { metaKey: true })).toEqual({ loai: 'gui' });
    expect(p('Enter', { ctrlKey: true })).toEqual({ loai: 'gui' });
    // `Enter` trơ là `Enter`, không phải gửi.
    expect(p('Enter')).toBeNull();
    expect(p('d')).toEqual({ loai: 'chinh' });
    expect(p('D')).toEqual({ loai: 'chinh' });
    expect(p('s')).toEqual({ loai: 'bo-qua' });
    expect(p('j')).toEqual({ loai: 'xuong' });
    expect(p('k')).toEqual({ loai: 'len' });
    expect(p('z')).toBeNull();

    // Đang gõ trong một ô: chữ là chữ; nhưng `Cmd+Enter` **vẫn** gửi.
    expect(p('5', { trong_o_nhap: true })).toBeNull();
    expect(p('s', { trong_o_nhap: true })).toBeNull();
    expect(p('Enter', { metaKey: true, trong_o_nhap: true })).toEqual({ loai: 'gui' });

    // Nhường phím của trình duyệt và của d.399–403 (`Cmd+K` là command menu).
    expect(p('k', { metaKey: true })).toBeNull();
    expect(p('d', { metaKey: true })).toBeNull();
    expect(p('j', { altKey: true })).toBeNull();
  });

  it('`1` và `2` chọn phương án THỨ NHẤT/THỨ HAI của thẻ đang chọn; `Cmd+Enter` gửi', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({
        urgent: [
          the({
            ma: 'T-120',
            loai: 'decision',
            phuong_an: [phuongAn('A', 'Giữ'), phuongAn('B', 'Hạ')],
          }),
        ],
      }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-120/xu-ly', 'ct-T-120');
    const u = await moTrang();
    /*
     * Vừa mở trang thì **chưa thẻ nào** đang chọn (`spec-questions.md` #108) —
     * `J` là cú chọn đầu tiên, và nó rơi vào thẻ đầu danh sách.
     */
    expect(theCua('T-120').getAttribute('data-dang-chon')).toBe('khong');
    await u.keyboard('j');
    expect(theCua('T-120').getAttribute('data-dang-chon')).toBe('co');

    await u.keyboard('2');
    expect(theCua('T-120').querySelector('[data-phuong-an="B"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    // "bấm phương án khác để đổi" cũng đúng với phím.
    await u.keyboard('1');
    expect(theCua('T-120').querySelector('[data-phuong-an="A"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );

    await u.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-120/xu-ly')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({ phuong_an: 'A' });
  });

  it('`Cmd+Enter` KHÔNG gửi khi nút Gửi đang mờ — phím không là cửa sau của d.259', async () => {
    const { m } = mayCanChu({
      man: manHinh({
        urgent: [the({ ma: 'T-121', loai: 'decision', phuong_an: [phuongAn('A', 'Giữ')] })],
      }),
    });
    const u = await moTrang();
    await u.keyboard('{Control>}{Enter}{/Control}');
    expect(m.da_goi.filter((l) => l.method === 'POST').length).toBe(0);
    // Thẻ vẫn ở khối của nó (không có cập nhật lạc quan nào đã chạy).
    expect(theCua('T-121')).toBeTruthy();
  });

  it('`D` là nút chính của `fyi` (gửi ngay) nhưng KHÔNG làm gì trên `decision`', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({
        urgent: [
          the({ ma: 'T-122', loai: 'decision', phuong_an: [phuongAn('A', 'Giữ')] }),
          the({ ma: 'T-123', loai: 'fyi' }),
        ],
      }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-123/xu-ly', 'ct-T-123');
    const u = await moTrang();

    // `J` chọn T-122 (`decision`) — `D` trên nó không gửi gì.
    await u.keyboard('j');
    expect(theCua('T-122').getAttribute('data-dang-chon')).toBe('co');
    await u.keyboard('d');
    expect(m.da_goi.filter((l) => l.method === 'POST').length).toBe(0);

    // `J` sang T-123 (`fyi`), rồi `D` gửi đúng mục đó.
    await u.keyboard('j');
    expect(theCua('T-123').getAttribute('data-dang-chon')).toBe('co');
    expect(theCua('T-122').getAttribute('data-dang-chon')).toBe('khong');
    await u.keyboard('d');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-123/xu-ly')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({});
  });

  it('`J`/`K` đi xuống rồi lên, và DỪNG ở hai đầu danh sách', async () => {
    mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-124' }), the({ ma: 'T-125' })] }),
    });
    const u = await moTrang();
    const dang = (): string | null =>
      document.querySelector('[data-dang-chon="co"]')?.getAttribute('data-the') ?? null;

    // Chưa chọn gì (#108) — cú `J` đầu tiên chọn thẻ đầu danh sách.
    expect(dang()).toBeNull();
    await u.keyboard('j');
    expect(dang()).toBe('T-124');
    await u.keyboard('k'); // đã ở đầu — không nhảy vòng xuống cuối
    expect(dang()).toBe('T-124');
    await u.keyboard('j');
    expect(dang()).toBe('T-125');
    await u.keyboard('j'); // đã ở cuối
    expect(dang()).toBe('T-125');
    await u.keyboard('k');
    expect(dang()).toBe('T-124');
  });

  it('phím trong PHẦN TỬ CON của vùng contenteditable không bị bắt (dùng chung `trongONhap`)', async () => {
    const { m, kho } = mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-127' })] }) });
    datGhi(m, kho, '/v1/can-chu/ct-T-127/bo-qua', 'ct-T-127');
    const u = await moTrang();
    await u.keyboard('j');

    const vung = document.createElement('div');
    vung.setAttribute('contenteditable', 'true');
    const con = document.createElement('span');
    vung.appendChild(con);
    document.body.appendChild(vung);
    try {
      fireEvent.keyDown(con, { key: 's' });
      expect(theCua('T-127').querySelector('[data-o="o-bo-qua"]')).toBeNull();
    } finally {
      vung.remove();
    }
    // Ngoài vùng ấy thì `s` vẫn là phím tắt.
    await u.keyboard('s');
    expect(theCua('T-127').querySelector('[data-o="o-bo-qua"]')).not.toBeNull();
  });

  it('`S` mở ô Bỏ qua; `Cmd+Enter` chỉ gửi SAU khi có lý do (d.264 còn nguyên)', async () => {
    const { m, kho } = mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-126' })] }) });
    datGhi(m, kho, '/v1/can-chu/ct-T-126/bo-qua', 'ct-T-126');
    const u = await moTrang();

    await u.keyboard('j'); // chọn thẻ trước đã (#108)
    await u.keyboard('s');
    expect(theCua('T-126').querySelector('[data-o="o-bo-qua"]')).not.toBeNull();

    // Chưa có lý do: `Cmd+Enter` không gửi gì (không gửi `xu-ly`, không `bo-qua`).
    await u.keyboard('{Meta>}{Enter}{/Meta}');
    expect(m.da_goi.filter((l) => l.method === 'POST').length).toBe(0);

    await u.type(theCua('T-126').querySelector('[data-o="ly-do-bo-qua"]') as HTMLElement, 'để sau');
    await u.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-126/bo-qua')).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({ ly_do: 'để sau' });
  });

  it('mới mở trang: một phím `d` lạc KHÔNG xử lý mục nào (spec-questions.md #108)', async () => {
    /*
     * SPEC im lặng chuyện phím phá huỷ có cần xác nhận. Hướng tạm: **không** tự
     * chọn thẻ nào khi trang mở. Lý do là chi phí của ca ngược: `d` xử lý xong
     * một mục, chỉ lùi được bằng "mở lại" (d.246) và đã ghi một dòng Nhật ký
     * **không sửa được** (d.309).
     */
    const { m, kho } = mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-130', loai: 'fyi' })] }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-130/xu-ly', 'ct-T-130');
    const u = await moTrang();

    await u.keyboard('d');
    expect(m.da_goi.filter((l) => l.method === 'POST').length).toBe(0);
    expect(document.querySelector('[data-dang-chon="co"]')).toBeNull();

    // Và sau một cú `J` thì đúng thẻ đầu nhận phím — phím không bị tắt, chỉ cần
    // một cú chọn tường minh.
    await u.keyboard('j');
    await u.keyboard('d');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-130/xu-ly')).toBe(1);
    });
  });

  it('gõ chữ có "s" và "5" vào ô ghi thêm KHÔNG bấm phím tắt nào', async () => {
    mayCanChu({
      man: manHinh({
        urgent: [the({ ma: 'T-127', loai: 'decision', phuong_an: [phuongAn('A', 'Giữ')] })],
      }),
    });
    const u = await moTrang();
    await u.type(
      theCua('T-127').querySelector('[data-o="ghi-them"]') as HTMLElement,
      'ngưỡng 500 sau',
    );
    // Không mở ô Bỏ qua ("s"), không chọn phương án ("5" / "0").
    expect(theCua('T-127').querySelector('[data-o="o-bo-qua"]')).toBeNull();
    expect(theCua('T-127').querySelector('[data-phuong-an="A"]')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(
      (theCua('T-127').querySelector('[data-o="ghi-them"]') as HTMLTextAreaElement).value,
    ).toBe('ngưỡng 500 sau');
  });

  it('trong PHIÊN DUYỆT phím chạy trên đúng thẻ đang hiện (d.274 + d.270)', async () => {
    const { m, kho } = mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-128' })], today: [the({ ma: 'T-129' })] }),
    });
    datGhi(m, kho, '/v1/can-chu/ct-T-128/xu-ly', 'ct-T-128');
    const u = await moTrang();
    await u.click(screen.getByRole('button', { name: NHAN_PHIEN_DUYET }));

    // Chỉ một thẻ trên màn hình, nên `J` không dời đích đi đâu được.
    await u.keyboard('j');
    expect(theCua('T-128').getAttribute('data-dang-chon')).toBe('co');

    await u.keyboard('d');
    await waitFor(() => {
      expect(m.soLan('POST', '/v1/can-chu/ct-T-128/xu-ly')).toBe(1);
    });
    await waitFor(() => {
      expect(document.querySelector('[data-the]')?.getAttribute('data-the')).toBe('T-129');
    });
  });
});

/* ================================================================== *
 * L. Thay đổi do agent hiện trong 3 giây — d.410
 * ================================================================== */

describe('d.410 — mục mới do agent tạo hiện lên, KHÔNG tải lại trang', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chu kỳ hỏi lại NGẮN HƠN mốc 3 giây của SPEC (còn chỗ cho một lần đi-về)', () => {
    expect(CHU_KY_LAM_MOI_MS).toBeLessThan(hienThayDoiTuSpec().giay * 1000);
    expect(CHU_KY_LAM_MOI_MS).toBeGreaterThan(0);
  });

  it('thẻ agent vừa tạo hiện lên sau một chu kỳ, cây React KHÔNG dựng lại', async () => {
    vi.useFakeTimers();
    const { kho } = mayCanChu();
    dung(<TrangCanChu />, '/can-chu');
    await vi.waitFor(() => {
      expect(screen.getByRole('region', { name: SPEC_KHOI[0] ?? '' })).toBeTruthy();
    });
    expect(document.querySelector('[data-the="T-130"]')).toBeNull();

    // Agent tạo một mục ở **phía máy chủ**; trang không được dựng lại lần nào.
    kho.man = manHinh({ urgent: [the({ ma: 'T-130' })] });
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-the="T-130"]')).not.toBeNull();
    });
  });
});

/* ================================================================== *
 * M. Điện thoại 375px — d.411
 * ================================================================== */

/**
 * Lớp Tailwind chốt một chiều rộng **cứng** theo px (`w-[420px]`,
 * `min-w-[400px]`) — thứ sinh ra tràn ngang ở 375px. `rem` thì bỏ qua: nó co theo
 * cỡ chữ gốc và `min-w-[20rem]` của bảng (320px) nhỏ hơn 375px.
 */
function chieuRongCung(goc: HTMLElement): { lop: string; px: number }[] {
  const ra: { lop: string; px: number }[] = [];
  for (const e of [goc, ...goc.querySelectorAll<HTMLElement>('*')]) {
    /*
     * `getAttribute('class')`, không `e.className`: thẻ nay có chấm mức gấp là
     * một `<svg>` (hệ thiết kế 29/10), và `className` của SVG là một
     * `SVGAnimatedString` — `.split` trên nó ném. Cùng nếp `danh-sach-ticket.test.tsx`.
     */
    for (const lop of (e.getAttribute('class') ?? '').split(/\s+/)) {
      const khop = /^(?:min-)?w-\[(\d+(?:\.\d+)?)px\]$/.exec(lop);
      if (khop?.[1] !== undefined) ra.push({ lop, px: Number(khop[1]) });
    }
  }
  return ra;
}

describe('d.411 — Cần Chủ ở 375px, kể cả phiên duyệt và ô trả lời hàng loạt', () => {
  const PX = specDoiDienThoai().px;

  const day = manHinh({
    urgent: [
      the({
        ma: 'T-140',
        loai: 'decision',
        du_an: { id: 'pj-1', ten: 'Solo Prep', ma: 'SPX' },
        boi_canh: 'Dòng 1\nDòng 2',
        phuong_an: [phuongAn('A', 'Giữ 500'), phuongAn('B', 'Hạ 300', true)],
        ticket_lien_quan: [{ id: 'tk-1', ma: 'SPX-12', tieu_de: 'Dựng bảng' }],
      }),
      the({ ma: 'T-141', loai: 'run_command', lenh: 'npm run deploy', can_tty: true }),
    ],
  });

  it('danh sách: không lớp nào chốt chiều rộng cứng vượt 375px', async () => {
    mayCanChu({ man: day, da: [dongDaXuLy({ ma: 'T-142' })] });
    await moTrang();
    expect(
      chieuRongCung(document.body).filter((c) => c.px > PX),
    ).toEqual([]);
  });

  it('khung trang có `min-w-0` (không đẩy cha rộng hơn 375px)', async () => {
    mayCanChu({ man: day, da: [dongDaXuLy({ ma: 'T-145' })] });
    await moTrang();
    expect(document.querySelector('div.min-w-0.flex-col.p-4')).not.toBeNull();
  });

  it('MỌI hàng nút nằm ngang biết xuống dòng (`flex-wrap`)', async () => {
    mayCanChu({ man: day, da: [dongDaXuLy({ ma: 'T-143' })] });
    await moTrang();
    const hang = [...document.querySelectorAll<HTMLElement>('[data-hang="nut"]')];
    // Ghim **có** hàng nào đó: một selector trượt sẽ làm ca dưới xanh vô nghĩa.
    expect(hang.length).toBeGreaterThan(3);
    expect(hang.filter((e) => !e.className.includes('flex-wrap'))).toEqual([]);
  });

  it('bảng Đã xử lý nằm trong khung CUỘN NGANG, không làm cả trang tràn', async () => {
    mayCanChu({ da: [dongDaXuLy({ ma: 'T-144' })] });
    await moTrang();
    const bang = khoiCua('Đã xử lý').querySelector('table');
    expect(bang).not.toBeNull();
    expect(bang?.parentElement?.className).toContain('overflow-x-auto');
  });

  it('phiên duyệt ở 375px: đủ thẻ, nút chính, Bỏ qua, Kết thúc phiên — và không tràn', async () => {
    mayCanChu({ man: day });
    const u = await moTrang();
    await u.click(screen.getByRole('button', { name: NHAN_PHIEN_DUYET }));

    const t = theCua('T-140');
    expect(t.querySelector('[data-nut="gui"]')).not.toBeNull();
    expect(t.querySelector('[data-nut="bo-qua"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Kết thúc phiên' })).toBeTruthy();
    expect(chieuRongCung(document.body).filter((c) => c.px > PX)).toEqual([]);

    const hang = [...document.querySelectorAll<HTMLElement>('[data-hang="nut"]')];
    expect(hang.length).toBeGreaterThan(1);
    expect(hang.filter((e) => !e.className.includes('flex-wrap'))).toEqual([]);
  });

  it('ô trả lời hàng loạt ở 375px: ô văn bản rộng hết khung, hai nút xuống dòng được', async () => {
    mayCanChu({ man: day });
    await moTrang();
    const o = document.querySelector('[data-o="van-hang-loat"]') as HTMLElement;
    expect(o.className).toContain('w-full');
    const hang = o.parentElement?.querySelector('[data-hang="nut"]');
    expect(hang?.className).toContain('flex-wrap');
    expect(within(hang as HTMLElement).getAllByRole('button').length).toBe(2);
  });
});

/* ================================================================== *
 * `/can-chu?the=<T-số>` — mở đúng một mục (spec-questions.md #154, BAT-37)
 * ================================================================== */

describe('?the=<T-số> — mở đúng một mục (#154)', () => {
  const baoThe = (): string => document.querySelector('[role="status"][data-o="bao-the"]')?.textContent ?? '';

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  it('mục còn Chờ ⇒ thẻ đó được chọn, focus, làm nổi, cuộn tới; thẻ khác không', async () => {
    const cuon = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: cuon, configurable: true, writable: true });
    mayCanChu({
      man: manHinh({
        urgent: [the({ ma: 'T-1' })],
        today: [the({ ma: 'T-31' }), the({ ma: 'T-32' })],
      }),
    });
    await moTrang('/can-chu?the=T-31');
    await waitFor(() => {
      expect(document.activeElement).toBe(theCua('T-31'));
    });
    const t = theCua('T-31');
    expect(t.getAttribute('data-noi')).toBe('co');
    expect(t.getAttribute('aria-current')).toBe('true');
    expect(t.getAttribute('data-dang-chon')).toBe('co');
    expect(theCua('T-1').getAttribute('data-noi')).toBeNull();
    expect(theCua('T-32').getAttribute('data-dang-chon')).toBe('khong');
    expect(cuon).toHaveBeenCalledTimes(1);
    expect(cuon.mock.contexts[0]).toBe(t);
    // Mục có trên trang và còn Chờ ⇒ không có dòng báo nào.
    expect(baoThe()).toBe('');
  });

  it('jsdom không có scrollIntoView ⇒ vẫn focus + nổi, không ném', async () => {
    expect('scrollIntoView' in HTMLElement.prototype).toBe(false);
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-5' })] }) });
    await moTrang('/can-chu?the=T-5');
    await waitFor(() => {
      expect(document.activeElement).toBe(theCua('T-5'));
    });
    expect(theCua('T-5').getAttribute('data-noi')).toBe('co');
  });

  it('thẻ được chọn qua URL là thẻ đích của phím d.270: `J` đi tiếp từ nó', async () => {
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-1' }), the({ ma: 'T-2' }), the({ ma: 'T-3' })] }) });
    const u = await moTrang('/can-chu?the=T-2');
    await waitFor(() => {
      expect(document.activeElement).toBe(theCua('T-2'));
    });
    await u.keyboard('j');
    expect(theCua('T-3').getAttribute('data-dang-chon')).toBe('co');
  });

  it('mã gõ tay khác hoa thường (`?the=t-31`) vẫn tới đúng T-31', async () => {
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-31' })] }) });
    await moTrang('/can-chu?the=t-31');
    await waitFor(() => {
      expect(document.activeElement).toBe(theCua('T-31'));
    });
  });

  it('mục đã xử lý ⇒ dòng bảng Đã xử lý được focus + nổi, kèm dòng báo rõ', async () => {
    mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-1' })] }),
      da: [dongDaXuLy({ ma: 'T-30' }), dongDaXuLy({ ma: 'T-31' })],
    });
    await moTrang('/can-chu?the=T-31');
    await waitFor(() => {
      expect(baoThe()).toBe(cauTheDaXuLy('T-31'));
    });
    const dong = document.querySelector<HTMLElement>('[data-dong-da-xu-ly="T-31"]');
    expect(dong?.getAttribute('data-noi')).toBe('co');
    expect(document.activeElement).toBe(dong);
    expect(document.querySelector('[data-dong-da-xu-ly="T-30"]')?.getAttribute('data-noi')).toBeNull();
    expect(cauTheDaXuLy('T-31')).toBe('T-31 đã được xử lý.');
  });

  it('mục không có ⇒ dòng báo rõ trong role="status", trang vẫn đủ ba khối', async () => {
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-1' })] }) });
    await moTrang('/can-chu?the=T-999');
    await waitFor(() => {
      expect(baoThe()).toBe(cauKhongThayThe('T-999'));
    });
    expect(cauKhongThayThe('T-999')).toBe('Không tìm thấy mục T-999 (có thể đã xử lý hoặc không tồn tại).');
    expect(screen.getAllByRole('region').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('[data-noi]')).toBeNull();
    expect(document.querySelector('[data-dang-chon="co"]')).toBeNull();
  });

  it('mã lạ trong URL (ký tự của bộ chọn CSS) ⇒ báo không tìm thấy, không ném', async () => {
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-1' })] }) });
    await moTrang(`/can-chu?the=${encodeURIComponent('"]x[')}`);
    await waitFor(() => {
      expect(baoThe()).toBe(cauKhongThayThe('"]x['));
    });
  });

  it('không có ?the= ⇒ không chọn, không nổi, không dòng báo (giữ #108)', async () => {
    mayCanChu({ man: manHinh({ urgent: [the({ ma: 'T-1' })] }) });
    await moTrang();
    expect(document.querySelector('[data-noi]')).toBeNull();
    expect(document.querySelector('[data-dang-chon="co"]')).toBeNull();
    expect(baoThe()).toBe('');
  });

  it('làm mới (refetch) KHÔNG giật focus về thẻ lần hai', async () => {
    mayCanChu({
      man: manHinh({ urgent: [the({ ma: 'T-1', loai: 'review' }), the({ ma: 'T-2' })] }),
    });
    const u = userEvent.setup();
    const { qc } = dung(<TrangCanChu />, '/can-chu?the=T-2');
    await waitFor(() => {
      expect(document.activeElement).toBe(theCua('T-2'));
    });
    const o = theCua('T-1').querySelector<HTMLTextAreaElement>('[data-o="ghi-them"]')!;
    await u.click(o);
    expect(document.activeElement).toBe(o);

    await qc.refetchQueries();
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).toBe(o);
    // Vẫn nổi — làm mới không xoá dấu của mục đã mở.
    expect(theCua('T-2').getAttribute('data-noi')).toBe('co');
  });
});
