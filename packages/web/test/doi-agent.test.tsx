/**
 * **Đội agent, trang agent, chi tiết phiên** — SPEC mục 3 d.80–105, mục 6, mục 14
 * d.392 + d.402, cộng d.407, d.410, d.412.
 *
 * Ba lớp chống "test xanh giả" của file này (nếp đã lập ở `can-chu.test.tsx` và
 * `chi-tiet-ticket.test.tsx`):
 *
 *   1. **Mọi chuỗi SPEC chốt cứng được CẮT TỪ `SPEC.md`** (`test/doc-spec.ts`):
 *      nhãn nút "Dừng", bảy nhãn trạng thái phiên, năm nhãn trạng thái agent,
 *      chín hàng bảng quyền, các vế của d.104 và d.402, cửa sổ 30 ngày của 19.5.
 *      Kèm **một ca ghim chính mỗi parser**, vì một parser trả rỗng sẽ làm mọi ca
 *      so-sánh xanh một cách vô nghĩa.
 *   2. **Ca phủ định dựng trạng thái xấu THẬT**: tỉ lệ `null` **không** được in
 *      "0%"; cờ "tất cả dự án" **không** được in "chưa được vào dự án nào"; một
 *      trường `token_bam` lọt vào thân **không** được hiện lên; máy chủ **thật
 *      sự** trả 409 rồi đo trạng thái **quay về** bản cũ.
 *   3. **Cửa chặn lượt đọc** (`kho.cho_get`) cho ca "hoàn lại" của d.407 — bài
 *      học lượt 5: `invalidateQueries` của `onSettled` tải lại ngay và đưa bản cũ
 *      về **dù mã không hoàn gì**, nên không chặn lượt đọc thì ca đó xanh giả.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAU_CHUA_CO_AGENT,
  CAU_CHUA_CO_LUOT_GIAO,
  CAU_CHUA_LEN_TIENG,
  CAU_CHUA_VAO_DU_AN_NAO,
  CAU_KHONG_CO_PHIEN_MO,
  CAU_VAO_MOI_DU_AN,
  NHAN_DA_TAT,
  TEN_KHOI_AGENT,
  TEN_TRANG_DOI_AGENT,
  TrangAgent,
  TrangDoiAgent,
  cauTiLe,
  duongAgent,
} from '../src/trang/doi-agent';
import {
  CAU_CHUA_CO_KE_HOACH,
  CAU_KHONG_CO_HOAT_DONG,
  CAU_PHIEN_DA_DONG,
  NHAN_TRANG_THAI_PHIEN,
  TEN_KHOI_PHIEN,
  TrangPhien,
} from '../src/trang/phien';
import { gioDayDu, thoiGianTuongDoi } from '../src/thoi-gian';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import type { ManHinhAgent, ManHinhDoiAgent, ManHinhPhien } from '../src/api';
import {
  CAU_DA_SAO_CHEP,
  CAU_DONG_LA_MAT,
  CAU_KHONG_SAO_CHEP_DUOC,
  NHAN_DONG_HOP_TOKEN,
  NHAN_DONG_HOP_TOKEN_NGOAI,
  NHAN_HUY_TOKEN,
  NHAN_SAO_CHEP_TOKEN,
  NHAN_TAO_LAI_TOKEN,
  NHAN_THU_HOI_TOKEN,
  NHAN_TOKEN_DA_THU_HOI,
  NHAN_XAC_NHAN_TAO_LAI,
  NHAN_XAC_NHAN_THU_HOI,
  cauDaThuHoi,
  cauHoiTaoLai,
  cauHoiThuHoi,
} from '../src/trang/token-agent';
import { MayChuGia, datKhoGia, dung } from './giup';
import {
  GIO,
  PHUT,
  agentDong,
  doiAgent,
  hoatDong,
  luotCuaAgent,
  manHinhAgent,
  manHinhPhien,
  phienDong,
} from './than-agent';
import {
  hangQuyenTuSpec,
  hienThayDoiTuSpec,
  nhanLoaiHoatDongTuSpec,
  nhanTrangThaiAgentTuSpec,
  nhanTrangThaiPhienTuSpec,
  tiLeDatLanDauTuSpec,
  veChiTietPhienTuSpec,
  veTrangAgentTuSpec,
} from './doc-spec';

const D_AGENT = '/v1/man-hinh-agent';

/* ================================================================== *
 * 0. Ca ghim CHÍNH các parser SPEC
 * ================================================================== */

describe('parser SPEC của lượt này cắt ra đúng thứ cần', () => {
  it('d.104 có ít nhất bốn vế và nói "dạng bảng"', () => {
    const { ve, co_dang_bang } = veTrangAgentTuSpec();
    expect(ve.length).toBeGreaterThanOrEqual(4);
    expect(ve.join(' | ')).toContain('phiên đang mở');
    expect(ve.join(' | ')).toContain('lần cuối lên tiếng');
    expect(co_dang_bang).toBe(true);
  });

  it('d.402 có đúng ba vế, và nhãn nút là "Dừng"', () => {
    const { ve, nhan_dung } = veChiTietPhienTuSpec();
    expect(ve).toHaveLength(3);
    expect(ve[0]).toContain('dòng hoạt động');
    expect(ve[1]).toContain('kế hoạch');
    expect(nhan_dung).toBe('Dừng');
  });

  it('bảng 0.1 cắt ra đúng 7 trạng thái phiên, 5 trạng thái agent, 5 loại hoạt động', () => {
    expect(Object.keys(nhanTrangThaiPhienTuSpec())).toHaveLength(7);
    expect(Object.keys(nhanTrangThaiAgentTuSpec())).toHaveLength(5);
    expect(Object.keys(nhanLoaiHoatDongTuSpec())).toHaveLength(5);
  });

  it('bảng quyền mục 3 cắt ra đúng 9 hàng, có hai hàng "không bao giờ"', () => {
    const hang = hangQuyenTuSpec();
    expect(hang).toHaveLength(9);
    expect(hang[0]).toBe('Tạo ticket');
    expect(hang).toContain('Xoá bất cứ thứ gì');
    expect(hang).toContain('Quyết mục Cần Chủ');
  });

  it('19.5 chốt cửa sổ 30 ngày và một công thức chia', () => {
    expect(tiLeDatLanDauTuSpec()).toEqual({ ngay: 30, co_cong_thuc: true });
  });
});

/* ================================================================== *
 * 1. Đội agent — d.392, d.80
 * ================================================================== */

describe('Đội agent (d.392, mục 3 d.80)', () => {
  function may(than: ManHinhDoiAgent): MayChuGia {
    return new MayChuGia().dat(`GET ${D_AGENT}`, { than }).gan();
  }

  it('danh sách rỗng nói thẳng là chưa có agent', async () => {
    may(doiAgent([]));
    dung(<TrangDoiAgent />, '/doi-agent');
    expect(await screen.findByText(CAU_CHUA_CO_AGENT)).toBeTruthy();
    expect(screen.getByRole('heading', { name: TEN_TRANG_DOI_AGENT })).toBeTruthy();
  });

  /**
   * **Nhãn tiếng Việt của năm mã trạng thái agent** (d.98–103, bảng 0.1).
   *
   * Nhãn tới từ máy chủ (`nhan_trang_thai`), nên ca này đo đúng một điều: màn
   * hình in **nhãn**, không in mã. In mã (`busy`) là một ca đỏ.
   */
  it('mỗi agent hiện nhãn trạng thái của bảng 0.1, không hiện mã máy', async () => {
    const nhan = nhanTrangThaiAgentTuSpec();
    const ma = Object.keys(nhan);
    may(
      doiAgent(
        ma.map((m, i) =>
          agentDong({
            id: `ag-${String(i)}`,
            // Tên **không** chứa mã máy: nếu có, ca phủ định dưới đây vô nghĩa.
            ten: `Agent số ${String(i)}`,
            trang_thai: m as ManHinhDoiAgent['agent'][number]['trang_thai'],
            nhan_trang_thai: nhan[m]!,
          }),
        ),
      ),
    );
    dung(<TrangDoiAgent />, '/doi-agent');
    await screen.findByText('Agent số 0');

    for (const [i, m] of ma.entries()) {
      const hang = document.querySelector(`[data-agent="ag-${String(i)}"]`);
      const o = hang?.querySelector(`[data-trang-thai="${m}"]`);
      expect(o?.textContent, m).toBe(nhan[m]!);
      // Phủ định có tải: mã máy không được lọt ra chữ hiển thị.
      expect(hang?.textContent, m).not.toContain(m);
    }
  });

  it('"lần cuối lên tiếng" đếm từ bay_gio CỦA MÁY CHỦ, không Date.now()', async () => {
    const luc = GIO - 31 * PHUT;
    may(doiAgent([agentDong({ id: 'ag-1', ten: 'W-builder', len_tieng_luc: luc })]));
    dung(<TrangDoiAgent />, '/doi-agent');

    const o = await screen.findByText(thoiGianTuongDoi(luc, GIO));
    // d.412: rê chuột thấy giờ đầy đủ theo giờ Việt Nam.
    expect(o.getAttribute('title')).toBe(gioDayDu(luc));
    /*
     * `GIO` cách `Date.now()` thật cả tháng, nên một bản cài đếm từ đồng hồ trình
     * duyệt sẽ in một chuỗi khác hẳn ("x ngày trước") — ca trên đã đỏ. Dòng này
     * ghim thêm rằng chuỗi của hai mốc **thật sự khác nhau**, để ca không vô tình
     * đúng ở một ngày nào đó.
     */
    expect(thoiGianTuongDoi(luc, Date.now())).not.toBe(thoiGianTuongDoi(luc, GIO));
  });

  it('agent chưa lên tiếng lần nào thì nói thẳng, không hiện mốc rỗng', async () => {
    may(doiAgent([agentDong({ id: 'ag-1', len_tieng_luc: null })]));
    dung(<TrangDoiAgent />, '/doi-agent');
    expect(await screen.findByText(CAU_CHUA_LEN_TIENG)).toBeTruthy();
  });

  it('tên agent là link tới trang agent của nó', async () => {
    may(doiAgent([agentDong({ id: 'ag-7', ten: 'M-Baton' })]));
    dung(<TrangDoiAgent />, '/doi-agent');
    const a = await screen.findByRole('link', { name: 'M-Baton' });
    expect(a.getAttribute('href')).toBe(duongAgent('ag-7'));
  });
});

/* ================================================================== *
 * 2. Trang một agent — d.104, d.80
 * ================================================================== */

describe('Trang agent (mục 3 d.104)', () => {
  function may(than: ManHinhAgent): MayChuGia {
    return new MayChuGia().dat(`GET ${D_AGENT}/${than.agent.id}`, { than }).gan();
  }

  const BANG_QUYEN_DU = hangQuyenTuSpec().map((nhan_viec, i) => ({
    viec: `viec_${String(i)}`,
    nhan_viec,
    pham_vi: i < 7 ? 'co' : 'khong_bao_gio',
    nhan_pham_vi: i < 7 ? 'có' : 'không bao giờ',
  }));

  it('có đủ các vế của d.104: thông tin, phiên đang mở, lịch sử lượt giao dạng bảng, tỉ lệ, lần cuối lên tiếng', async () => {
    const than = manHinhAgent({
      agent: agentDong({
        id: 'ag-1',
        ten: 'W-builder',
        nhan_vai_tro: 'Người làm',
        len_tieng_luc: GIO - PHUT,
      }),
      bang_quyen: BANG_QUYEN_DU,
      phien_dang_mo: [phienDong({ id: 'ph-1' })],
      luot_giao: [luotCuaAgent({ id: 'lg-1', so_luot: 1, ticket_ma: 'SAI-1' })],
      ti_le_dat_lan_dau: { dat: 1, da_nop: 2, ti_le: 0.5 },
    });
    may(than);
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    // thông tin
    expect(await screen.findByRole('heading', { name: 'W-builder' })).toBeTruthy();
    expect(screen.getByText('Người làm')).toBeTruthy();
    // phiên đang mở
    expect(screen.getByRole('region', { name: TEN_KHOI_AGENT.phien })).toBeTruthy();
    expect(document.querySelector('[data-phien="ph-1"]')).not.toBeNull();
    // lịch sử lượt giao **dạng bảng** — d.104 đòi đúng chữ đó.
    const bang = document.querySelector('[data-bang="luot-giao"]');
    expect(bang?.tagName).toBe('TABLE');
    // tỉ lệ nộp lại đạt review (19.5)
    expect(document.querySelector('[data-o="ti-le"]')?.textContent).toBe('50% (1/2)');
    // lần cuối lên tiếng
    expect(document.querySelector('[data-o="len-tieng"]')?.textContent).toBe(
      thoiGianTuongDoi(GIO - PHUT, GIO),
    );
  });

  it('bảng quyền có ĐÚNG chín hàng của mục 3, đúng thứ tự, nhãn tiếng Việt', async () => {
    const than = manHinhAgent({ agent: agentDong({ id: 'ag-1' }), bang_quyen: BANG_QUYEN_DU });
    may(than);
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    const bang = await waitFor(() => {
      const b = document.querySelector('[data-bang="quyen"]');
      if (b === null) throw new Error('chưa có bảng quyền');
      return b;
    });
    const ten_hang = [...bang.querySelectorAll('tbody tr th')].map((o) => o.textContent);
    expect(ten_hang).toEqual(hangQuyenTuSpec());
    // Hai hàng "không bao giờ" (d.95–96) hiện đúng chữ đó, không hiện "—".
    expect(bang.textContent).toContain('không bao giờ');
  });

  it('tỉ lệ KHÔNG có số liệu thì nói thẳng, tuyệt đối không in "0%"', async () => {
    const than = manHinhAgent({
      agent: agentDong({ id: 'ag-1' }),
      ti_le_dat_lan_dau: { dat: 0, da_nop: 0, ti_le: null },
    });
    may(than);
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    const o = await waitFor(() => {
      const x = document.querySelector('[data-o="ti-le"]');
      if (x === null) throw new Error('chưa có ô tỉ lệ');
      return x;
    });
    /*
     * 19.5: `ti_le === null` là "**không có** tỉ lệ", không phải 0%. Một bản cài
     * `ti_le ?? 0` in "0%" — tức nói agent **trượt mọi lần**, trong khi nó chưa
     * nộp lần nào. Đây là ca phủ định có tải thật.
     */
    expect(o.textContent).not.toContain('0%');
    expect(o.textContent).toBe(cauTiLe({ dat: 0, da_nop: 0, ti_le: null }));
  });

  it('cờ "tất cả dự án" hiện đúng, KHÔNG nói "chưa được vào dự án nào"', async () => {
    const than = manHinhAgent({
      // Cờ bật **và** danh sách `agent_project` rỗng — đúng trạng thái thật của
      // một agent "tất cả dự án" (mục 3 d.82).
      agent: agentDong({ id: 'ag-1', vao_tat_ca_du_an: true }),
      du_an: [],
    });
    may(than);
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    expect(await screen.findByText(CAU_VAO_MOI_DU_AN)).toBeTruthy();
    expect(screen.queryByText(CAU_CHUA_VAO_DU_AN_NAO)).toBeNull();
  });

  it('agent không có cờ và không có dự án nào thì nói thẳng', async () => {
    may(manHinhAgent({ agent: agentDong({ id: 'ag-1' }), du_an: [] }));
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    expect(await screen.findByText(CAU_CHUA_VAO_DU_AN_NAO)).toBeTruthy();
  });

  it('agent bị tắt hiện nhãn "Đã tắt" (d.103)', async () => {
    may(manHinhAgent({ agent: agentDong({ id: 'ag-1', disabled: true }) }));
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    expect(await screen.findByText(NHAN_DA_TAT)).toBeTruthy();
  });

  it('khối rỗng nói thẳng: không phiên nào mở, chưa có lượt giao nào', async () => {
    may(manHinhAgent({ agent: agentDong({ id: 'ag-1' }) }));
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    expect(await screen.findByText(CAU_KHONG_CO_PHIEN_MO)).toBeTruthy();
    expect(screen.getByText(CAU_CHUA_CO_LUOT_GIAO)).toBeTruthy();
  });

  /**
   * **Bảng lịch sử giữ ĐÚNG thứ tự máy chủ trả về**, và ca ghim **nội dung** chứ
   * không chỉ hình: bài học lượt 5 — một ca chỉ đo "có hai dòng" xanh ở cả hai
   * hướng sắp. Cặp `(số lượt, mã ticket)` lệch nhau nên đảo thứ tự là đỏ.
   */
  it('lịch sử lượt giao giữ đúng thứ tự và nội dung của máy chủ', async () => {
    may(
      manHinhAgent({
        agent: agentDong({ id: 'ag-1' }),
        luot_giao: [
          luotCuaAgent({ id: 'lg-2', so_luot: 2, ticket_ma: 'SAI-9', nhan_loai: 'Review' }),
          luotCuaAgent({ id: 'lg-1', so_luot: 1, ticket_ma: 'SAI-1' }),
        ],
      }),
    );
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    const bang = await waitFor(() => {
      const b = document.querySelector('[data-bang="luot-giao"]');
      if (b === null) throw new Error('chưa có bảng');
      return b;
    });
    const dong = [...bang.querySelectorAll('tbody tr')].map((tr) => [
      tr.querySelectorAll('td')[0]?.textContent,
      tr.querySelector('[data-o="loai"]')?.textContent,
      tr.querySelector('a')?.textContent,
    ]);
    expect(dong).toEqual([
      ['2', 'Review', 'SAI-9'],
      ['1', 'Làm', 'SAI-1'],
    ]);
  });

  it('"Không phản hồi" của mục 5 hiện theo cờ máy chủ, không tính lại ở client', async () => {
    may(
      manHinhAgent({
        agent: agentDong({ id: 'ag-1' }),
        luot_giao: [
          luotCuaAgent({
            id: 'lg-1',
            so_luot: 1,
            ticket_ma: 'SAI-1',
            // Hạn **chưa** tới theo đồng hồ, nhưng máy chủ nói "không phản hồi":
            // màn hình phải tin máy chủ (dẫn xuất của mục 5 tính ở một chỗ).
            han_phan_hoi_luc: GIO + 10 * PHUT,
            khong_phan_hoi: true,
          }),
        ],
      }),
    );
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    expect(await screen.findByText('Không phản hồi')).toBeTruthy();
  });

  it('phiên trong khối "phiên đang mở" là link tới chi tiết phiên (d.402)', async () => {
    may(
      manHinhAgent({
        agent: agentDong({ id: 'ag-1' }),
        phien_dang_mo: [
          phienDong({ id: 'ph-9', trang_thai: 'stalled', nhan_trang_thai: 'Đứng', dung: true }),
        ],
      }),
    );
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    const a = await screen.findByRole('link', { name: 'Đứng' });
    expect(a.getAttribute('href')).toBe('/phien/ph-9');
  });

  /**
   * **Token** — mục 3 d.83 ("sau đó chỉ hiện 4 ký tự cuối", "server chỉ lưu token
   * dạng băm"), cùng tinh thần mục 15 d.427 ("không bao giờ trả ra API hay UI").
   *
   * Ca dựng một thân có **thêm** một khoá `token_bam` (đúng thứ một bản API cũ
   * hoặc một lần `SELECT *` sẽ gửi lên) rồi đo rằng màn hình **không in nó**. Một
   * ca chỉ kiểm "có hiện 4 ký tự cuối" sẽ xanh kể cả khi trang in cả bản băm.
   */
  it('hiện 4 ký tự cuối (d.83) và KHÔNG in băm token dù thân có mang (d.83/d.427)', async () => {
    const BAM = 'bam_token_rat_dai_khong_duoc_hien_ra';
    const than = manHinhAgent({ agent: agentDong({ id: 'ag-1', token_bon_cuoi: '9f3a' }) });
    Object.assign(than.agent, { token_bam: BAM });
    may(than);
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    expect(await screen.findByText('••••9f3a')).toBeTruthy();
    expect(document.body.textContent).not.toContain(BAM);
  });

  it('lỗi của máy chủ hiện NGUYÊN VĂN, không một câu dịch lại ở client', async () => {
    new MayChuGia()
      .dat(`GET ${D_AGENT}/ag-1`, {
        http: 403,
        loi: { error: 'FORBIDDEN', message: 'Màn hình này chỉ dành cho chủ.' },
      })
      .gan();
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    const o = await screen.findByRole('alert');
    expect(o.textContent).toBe('Màn hình này chỉ dành cho chủ.');
  });
});

/* ================================================================== *
 * 3. Chi tiết phiên — d.402
 * ================================================================== */

/** Máy chủ giả **có trạng thái** cho trang phiên, kèm cửa chặn lượt đọc. */
function mayPhien(than: ManHinhPhien = manHinhPhien()): {
  may: MayChuGia;
  kho: { man: ManHinhPhien; chan_get: Promise<unknown> | undefined };
} {
  const kho: { man: ManHinhPhien; chan_get: Promise<unknown> | undefined } = {
    man: than,
    chan_get: undefined,
  };
  const may = new MayChuGia()
    .dat(`GET /v1/man-hinh-phien/${than.phien.id}`, () =>
      kho.chan_get === undefined
        ? { than: kho.man }
        : { than: kho.man, cho: kho.chan_get },
    )
    .gan();
  return { may, kho };
}

describe('Chi tiết phiên (d.402)', () => {
  it('có đủ ba vế của d.402: dòng hoạt động, kế hoạch, nút Dừng', async () => {
    const { nhan_dung } = veChiTietPhienTuSpec();
    mayPhien(
      manHinhPhien({
        hoat_dong: [hoatDong({ id: 'hd-1', noi_dung: 'Đang đọc SPEC' })],
        ke_hoach: {
          phien_id: 'ph-1',
          phien_ban: 1,
          gui_luc: GIO - PHUT,
          buoc: [{ thu_tu: 1, noi_dung: 'Đọc SPEC', trang_thai: 'done', nhan_trang_thai: 'Xong' }],
        },
      }),
    );
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');

    expect(await screen.findByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong })).toBeTruthy();
    expect(screen.getByRole('region', { name: TEN_KHOI_PHIEN.ke_hoach })).toBeTruthy();
    // Nhãn nút **cắt từ SPEC**, không gõ lại.
    expect(screen.getByRole('button', { name: nhan_dung })).toBeTruthy();
  });

  it('dòng hoạt động giữ thứ tự cũ → mới và in NHÃN loại của bảng 0.1', async () => {
    mayPhien(
      manHinhPhien({
        hoat_dong: [
          hoatDong({ id: 'hd-1', noi_dung: 'Đang đọc SPEC', loai: 'thought', nhan_loai: 'Suy nghĩ' }),
          hoatDong({
            id: 'hd-2',
            noi_dung: 'Chạy test',
            loai: 'action',
            nhan_loai: 'Thao tác',
            thu_tu: 2,
          }),
        ],
      }),
    );
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');

    const ds = await waitFor(() => {
      const o = document.querySelector('[data-ds="hoat-dong"]');
      if (o === null) throw new Error('chưa có dòng hoạt động');
      return o;
    });
    // Ghim **nội dung** theo đúng thứ tự, không chỉ hình (bài học lượt 5).
    const muc = [...ds.querySelectorAll('li')].map((li) => [
      li.querySelector('[data-o="loai"]')?.textContent,
      li.getAttribute('data-hoat-dong'),
    ]);
    expect(muc).toEqual([
      ['Suy nghĩ', 'thought'],
      ['Thao tác', 'action'],
    ]);
  });

  it('chưa gửi kế hoạch (bản 0) KHÁC kế hoạch rỗng (bản 2, không bước nào)', async () => {
    mayPhien(manHinhPhien());
    const { unmount } = dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    expect(await screen.findByText(CAU_CHUA_CO_KE_HOACH)).toBeTruthy();
    unmount();

    /*
     * d.191 cho agent gửi lại **toàn bộ** danh sách, kể cả danh sách trống — đó
     * là "kế hoạch rỗng", **không** phải "chưa gửi kế hoạch". Máy chủ phân biệt
     * hai ca bằng `phien_ban`, và màn hình phải phân biệt theo.
     */
    mayPhien(
      manHinhPhien({
        ke_hoach: { phien_id: 'ph-1', phien_ban: 2, gui_luc: GIO - PHUT, buoc: [] },
      }),
    );
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await waitFor(() => {
      expect(document.querySelector('[data-o="phien-ban"]')?.textContent).toBe('bản 2');
    });
    expect(screen.queryByText(CAU_CHUA_CO_KE_HOACH)).toBeNull();
  });

  it('phiên đứng: nhãn của máy chủ cộng chữ "Đứng", nhãn DB vẫn là running', async () => {
    mayPhien(
      manHinhPhien({
        phien: phienDong({
          id: 'ph-1',
          trang_thai: 'stalled',
          nhan_trang_thai: nhanTrangThaiPhienTuSpec()['stalled']!,
          trang_thai_luu: 'running',
          dung: true,
        }),
      }),
    );
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');

    await waitFor(() => {
      expect(document.querySelector('[data-trang-thai="stalled"]')?.textContent).toBe(
        nhanTrangThaiPhienTuSpec()['stalled']!,
      );
    });
    expect(document.querySelector('[data-o="dung"]')).not.toBeNull();
  });

  it('tín hiệu STOP của d.193 hiện lên khi phiên đang dừng', async () => {
    mayPhien(
      manHinhPhien({
        phien: phienDong({
          id: 'ph-1',
          trang_thai: 'stopping',
          nhan_trang_thai: 'Đang dừng',
          tin_hieu: ['STOP'],
        }),
      }),
    );
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    expect(await screen.findByText('STOP')).toBeTruthy();
  });

  /* ---------------- Nút Dừng: d.402 + d.407 ---------------- */

  it('bấm Dừng gọi ĐÚNG đường của mục 6 d.193, đúng một lần', async () => {
    const { may } = mayPhien();
    may.dat('POST /v1/phien/ph-1/dung', { than: { ok: true } });
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');

    const nut = await screen.findByRole('button', { name: 'Dừng' });
    await userEvent.click(nut);

    await waitFor(() => {
      expect(may.soLan('POST', '/v1/phien/ph-1/dung')).toBe(1);
    });
    // Không một đường ghi nào khác: luật dừng chỉ có **một** cửa.
    expect(may.da_goi.filter((l) => l.method === 'POST')).toHaveLength(1);
  });

  it('trạng thái đổi NGAY trước khi máy chủ trả lời (d.407), nhãn đúng bảng 0.1', async () => {
    const { may } = mayPhien();
    let moCua = (): void => undefined;
    const treo = new Promise<unknown>((res) => {
      moCua = () => {
        res(null);
      };
    });
    may.dat('POST /v1/phien/ph-1/dung', { than: { ok: true }, cho: treo });
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Dừng' }));

    // Máy chủ **chưa** trả lời, mà màn hình đã nói "Đang dừng".
    await waitFor(() => {
      expect(document.querySelector('[data-trang-thai="stopping"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-trang-thai="stopping"]')?.textContent).toBe(
      nhanTrangThaiPhienTuSpec()['stopping']!,
    );
    moCua();
  });

  /**
   * **Hoàn lại + toast nguyên văn** — d.407.
   *
   * Cửa chặn lượt đọc (`kho.chan_get`) là điều kiện để ca này có nghĩa: không có
   * nó thì `invalidateQueries` của `onSettled` tải lại ngay và đưa bản cũ về **dù
   * mã không hoàn gì** — đúng ca xanh giả mà lượt 5 đã bắt được. Ở đây lượt đọc
   * sau mutation bị treo, nên thứ **duy nhất** đưa trạng thái về `running` là
   * phép hoàn lại trong `onError`.
   */
  it('máy chủ từ chối thì hoàn lại trạng thái cũ và toast ghi NGUYÊN VĂN lý do', async () => {
    const { may, kho } = mayPhien();
    const CAU = 'Chỉ chủ bấm được Dừng.';
    may.dat('POST /v1/phien/ph-1/dung', {
      http: 403,
      loi: { error: 'FORBIDDEN', message: CAU },
    });
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await screen.findByRole('button', { name: 'Dừng' });

    // Chặn mọi lượt đọc **sau** lần đầu: chỉ phép hoàn lại mới cứu được màn hình.
    kho.chan_get = new Promise<unknown>(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Dừng' }));

    expect(await screen.findByText(CAU)).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('[data-trang-thai="running"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-trang-thai="stopping"]')).toBeNull();
  });

  it('phiên ĐÃ ĐÓNG thì nút mờ và nói rõ lý do, không gọi máy chủ', async () => {
    const { may } = mayPhien(
      manHinhPhien({
        phien: phienDong({
          id: 'ph-1',
          trang_thai: 'closed',
          nhan_trang_thai: 'Đã đóng',
          dang_mo: false,
          dong_luc: GIO - PHUT,
          ly_do_dong: 'đã nộp báo cáo',
        }),
      }),
    );
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');

    const nut = await screen.findByRole('button', { name: 'Dừng' });
    expect(nut.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(CAU_PHIEN_DA_DONG)).toBeTruthy();
    await userEvent.click(nut).catch(() => undefined);
    expect(may.soLan('POST', '/v1/phien/ph-1/dung')).toBe(0);
  });

  it('dòng hoạt động rỗng nói thẳng', async () => {
    mayPhien(manHinhPhien({ hoat_dong: [] }));
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    expect(await screen.findByText(CAU_KHONG_CO_HOAT_DONG)).toBeTruthy();
  });

  it('ticket và agent của phiên là link đọc được', async () => {
    mayPhien(manHinhPhien());
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');

    const t = await screen.findByRole('link', { name: 'SAI-1' });
    expect(t.getAttribute('href')).toBe('/t/SAI-1');
    expect(screen.getByRole('link', { name: 'W-builder' }).getAttribute('href')).toBe(
      duongAgent('ag-1'),
    );
  });

  it('nhãn bảy trạng thái phiên trong mã khớp từng chữ bảng 0.1 của SPEC', () => {
    expect(NHAN_TRANG_THAI_PHIEN).toEqual(nhanTrangThaiPhienTuSpec());
  });
});

/* ================================================================== *
 * 4. d.410 — thay đổi do agent hiện trong 3 giây
 * ================================================================== */

describe('d.410 — thay đổi do agent hiện lên, KHÔNG tải lại trang', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chu kỳ hỏi lại NGẮN HƠN mốc 3 giây của SPEC', () => {
    expect(CHU_KY_LAM_MOI_MS).toBeLessThan(hienThayDoiTuSpec().giay * 1000);
    expect(CHU_KY_LAM_MOI_MS).toBeGreaterThan(0);
  });

  it('một mục hoạt động mới của agent hiện lên sau một chu kỳ', async () => {
    vi.useFakeTimers();
    const { kho } = mayPhien();
    dung(<TrangPhien id="ph-1" />, '/phien/ph-1');
    await vi.waitFor(() => {
      expect(screen.getByRole('region', { name: TEN_KHOI_PHIEN.hoat_dong })).toBeTruthy();
    });
    expect(document.querySelector('[data-ds="hoat-dong"]')).toBeNull();

    // Agent gửi một mục ở **phía máy chủ**; trang không được dựng lại lần nào.
    kho.man = manHinhPhien({ hoat_dong: [hoatDong({ id: 'hd-1', noi_dung: 'Vừa xong' })] });
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-ds="hoat-dong"]')).not.toBeNull();
    });
  });

  it('trang Đội agent cũng hỏi lại theo chu kỳ đó (d.410 không chừa màn hình nào)', async () => {
    vi.useFakeTimers();
    const kho = { man: doiAgent([]) };
    const may = new MayChuGia().dat(`GET ${D_AGENT}`, () => ({ than: kho.man })).gan();
    dung(<TrangDoiAgent />, '/doi-agent');
    await vi.waitFor(() => {
      expect(screen.getByText(CAU_CHUA_CO_AGENT)).toBeTruthy();
    });

    kho.man = doiAgent([agentDong({ id: 'ag-moi', ten: 'W-moi' })]);
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-agent="ag-moi"]')).not.toBeNull();
    });
    expect(may.soLan('GET', D_AGENT)).toBeGreaterThanOrEqual(2);
  });

  it('trang agent cũng vậy', async () => {
    vi.useFakeTimers();
    const kho = { man: manHinhAgent({ agent: agentDong({ id: 'ag-1' }) }) };
    const may = new MayChuGia().dat(`GET ${D_AGENT}/ag-1`, () => ({ than: kho.man })).gan();
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    await vi.waitFor(() => {
      expect(screen.getByText(CAU_KHONG_CO_PHIEN_MO)).toBeTruthy();
    });

    kho.man = manHinhAgent({
      agent: agentDong({ id: 'ag-1' }),
      phien_dang_mo: [phienDong({ id: 'ph-moi' })],
    });
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-phien="ph-moi"]')).not.toBeNull();
    });
    expect(may.soLan('GET', `${D_AGENT}/ag-1`)).toBeGreaterThanOrEqual(2);
  });
});

/* ================================================================== *
 * 5. d.411 — khổ 375px
 * ================================================================== */

describe('d.411 — bảng của trang agent dùng được ở khổ hẹp', () => {
  it('hai bảng nằm trong khung cuộn ngang, không tràn khung', async () => {
    new MayChuGia()
      .dat(`GET ${D_AGENT}/ag-1`, {
        than: manHinhAgent({
          agent: agentDong({ id: 'ag-1' }),
          luot_giao: [luotCuaAgent({ id: 'lg-1', so_luot: 1, ticket_ma: 'SAI-1' })],
          bang_quyen: hangQuyenTuSpec().map((nhan_viec, i) => ({
            viec: `v${String(i)}`,
            nhan_viec,
            pham_vi: 'co',
            nhan_pham_vi: 'có',
          })),
        }),
      })
      .gan();
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    await waitFor(() => {
      expect(document.querySelector('[data-bang="luot-giao"]')).not.toBeNull();
    });
    /*
     * jsdom **không có layout**, nên 375px chỉ canh được bằng **lớp CSS** —
     * giới hạn đã khai ở `spec-questions.md` #109. Điều canh được: mỗi bảng nằm
     * trong một khung `overflow-x-auto`.
     */
    for (const ten of ['luot-giao', 'quyen']) {
      const bang = document.querySelector(`[data-bang="${ten}"]`);
      expect(bang?.parentElement?.className, ten).toContain('overflow-x-auto');
    }
  });
});

/* ================================================================== *
 * 6. Hàm thuần `cauTiLe` — 19.5
 * ================================================================== */

describe('cauTiLe (19.5)', () => {
  it('mẫu số 0 ⇒ "chưa có số liệu", không phải 0%', () => {
    expect(cauTiLe({ dat: 0, da_nop: 0, ti_le: null })).toBe('chưa có số liệu');
  });

  it('làm tròn phần trăm và giữ cả tử/mẫu để đọc lại được', () => {
    expect(cauTiLe({ dat: 1, da_nop: 3, ti_le: 1 / 3 })).toBe('33% (1/3)');
    expect(cauTiLe({ dat: 3, da_nop: 3, ti_le: 1 })).toBe('100% (3/3)');
    expect(cauTiLe({ dat: 0, da_nop: 2, ti_le: 0 })).toBe('0% (0/2)');
  });
});

/* ================================================================== *
 * 7. Mục 3 d.83 — nút "Tạo lại token" và "Thu hồi token"
 * ================================================================== */

/**
 * Máy chủ giả **có trạng thái** cho hai nút token: lượt đọc trả agent hiện hành,
 * lượt tạo lại đổi `token_bon_cuoi`, lượt thu hồi đặt `token_thu_hoi_luc`. Nhờ
 * đó ca "làm mới danh sách" đo được **màn hình đổi theo máy chủ**, không chỉ đếm
 * lượt gọi.
 */
const TOKEN_MOI = 'bt_tok_moi_rat_dai_chi_hien_mot_lan_7c1e';
const D_TAO_LAI = '/v1/agent/ag-1/token';
const D_THU_HOI = '/v1/agent/ag-1/token/thu-hoi';

function mayToken(p: Partial<ManHinhAgent['agent']> = {}): {
  may: MayChuGia;
  kho: { agent: ManHinhAgent['agent'] };
} {
  const kho = {
    agent: agentDong({ id: 'ag-1', ten: 'W-builder', token_bon_cuoi: 'aaaa', ...p }),
  };
  const may = new MayChuGia()
    .dat(`GET ${D_AGENT}/ag-1`, () => ({ than: manHinhAgent({ agent: kho.agent }) }))
    .dat(`POST ${D_TAO_LAI}`, () => {
      kho.agent = {
        ...kho.agent,
        token_bon_cuoi: TOKEN_MOI.slice(-4),
        token_thu_hoi_luc: null,
      };
      return { than: { agent_id: 'ag-1', token: TOKEN_MOI, token_bon_cuoi: TOKEN_MOI.slice(-4) } };
    })
    .dat(`POST ${D_THU_HOI}`, () => {
      kho.agent = { ...kho.agent, token_thu_hoi_luc: GIO };
      return { than: { agent_id: 'ag-1', da_thu_hoi: true } };
    })
    .gan();
  return { may, kho };
}

function hopToken(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-o="hop-token"]');
}

/** Gắn `navigator.clipboard` giả; trả hàm ghi để ca đo. */
function datClipboard(viet: ((s: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: viet === undefined ? undefined : { writeText: viet },
    configurable: true,
  });
}

/** `sessionStorage` giả trong bộ nhớ, trả về nguyên bản sau ca. */
let mo_ta_session: PropertyDescriptor | undefined;
function datSessionGia(): Map<string, string> {
  mo_ta_session = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const bang = new Map<string, string>();
  const gia: Storage = {
    getItem: (k) => bang.get(k) ?? null,
    setItem: (k, v) => {
      bang.set(k, String(v));
    },
    removeItem: (k) => {
      bang.delete(k);
    },
    clear: () => {
      bang.clear();
    },
    key: (i) => [...bang.keys()][i] ?? null,
    get length() {
      return bang.size;
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: gia });
  return bang;
}

describe('mục 3 d.83 — tạo lại token và thu hồi token trên trang agent', () => {
  afterEach(() => {
    if (mo_ta_session === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    } else Object.defineProperty(globalThis, 'sessionStorage', mo_ta_session);
    mo_ta_session = undefined;
    vi.restoreAllMocks();
  });

  async function moTrang(p: Partial<ManHinhAgent['agent']> = {}): Promise<{
    may: MayChuGia;
    kho: { agent: ManHinhAgent['agent'] };
    qc: ReturnType<typeof dung>['qc'];
  }> {
    const { may, kho } = mayToken(p);
    const { qc } = dung(<TrangAgent id="ag-1" />, '/agent/ag-1');
    await screen.findByRole('heading', { name: 'W-builder' });
    return { may, kho, qc };
  }

  it('mỗi agent có đủ hai nút, cùng chữ của SPEC', async () => {
    await moTrang();
    expect(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN })).toBeTruthy();
    const thu_hoi = screen.getByRole('button', { name: NHAN_THU_HOI_TOKEN });
    expect(thu_hoi.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(NHAN_TOKEN_DA_THU_HOI)).toBeNull();
  });

  it('token đã thu hồi ⇒ nút thu hồi KHOÁ kèm chữ nói lý do; tạo lại vẫn bấm được', async () => {
    const { may } = await moTrang({ token_thu_hoi_luc: GIO - PHUT });
    const thu_hoi = screen.getByRole('button', { name: NHAN_THU_HOI_TOKEN });
    expect(thu_hoi.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(NHAN_TOKEN_DA_THU_HOI)).toBeTruthy();
    await userEvent.click(thu_hoi).catch(() => undefined);
    expect(hopToken()).toBeNull();
    expect(may.soLan('POST', D_THU_HOI)).toBe(0);
    expect(
      screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }).hasAttribute('disabled'),
    ).toBe(false);
  });

  for (const [ten_nut, xac_nhan, duong, cau_hoi] of [
    [NHAN_TAO_LAI_TOKEN, NHAN_XAC_NHAN_TAO_LAI, D_TAO_LAI, cauHoiTaoLai('W-builder')],
    [NHAN_THU_HOI_TOKEN, NHAN_XAC_NHAN_THU_HOI, D_THU_HOI, cauHoiThuHoi('W-builder')],
  ] as const) {
    it(`"${ten_nut}": hộp xác nhận aria-modal nói rõ hậu quả; Huỷ ⇒ KHÔNG gọi máy chủ, focus về nút`, async () => {
      const { may } = await moTrang();
      const nut = screen.getByRole('button', { name: ten_nut });
      await userEvent.click(nut);

      const hop = screen.getByRole('dialog');
      expect(hop.getAttribute('aria-modal')).toBe('true');
      expect(within(hop).getByText(cau_hoi)).toBeTruthy();
      // Hai vế hậu quả mà brief đòi nói rõ.
      expect(cau_hoi).toContain('hết hiệu lực ngay');
      expect(cau_hoi).toContain('từ chối');
      expect(within(hop).getByRole('button', { name: xac_nhan })).toBeTruthy();

      await userEvent.click(within(hop).getByRole('button', { name: NHAN_HUY_TOKEN }));
      expect(hopToken()).toBeNull();
      expect(may.soLan('POST', duong)).toBe(0);
      expect(document.activeElement).toBe(nut);
    });

    it(`"${ten_nut}": Esc đóng hộp xác nhận ⇒ KHÔNG gọi máy chủ, focus về nút`, async () => {
      const { may } = await moTrang();
      const nut = screen.getByRole('button', { name: ten_nut });
      await userEvent.click(nut);
      expect(hopToken()).not.toBeNull();

      await userEvent.keyboard('{Escape}');
      expect(hopToken()).toBeNull();
      expect(may.soLan('POST', duong)).toBe(0);
      expect(may.da_goi.filter((l) => l.method === 'POST')).toHaveLength(0);
      expect(document.activeElement).toBe(nut);
    });

    it(`"${ten_nut}": xác nhận ⇒ gọi ĐÚNG đường, đúng một lần, không đường ghi nào khác`, async () => {
      const { may } = await moTrang();
      datClipboard(undefined);
      await userEvent.click(screen.getByRole('button', { name: ten_nut }));
      await userEvent.click(screen.getByRole('button', { name: xac_nhan }));

      await waitFor(() => {
        expect(may.soLan('POST', duong)).toBe(1);
      });
      expect(may.da_goi.filter((l) => l.method === 'POST')).toHaveLength(1);
    });
  }

  it('tạo lại thành công ⇒ token hiện MỘT lần, dặn "đóng là mất"; đóng ⇒ token rời DOM, •••• mới hiện', async () => {
    await moTrang();
    expect(screen.getByText('••••aaaa')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_TAO_LAI }));

    const o = await screen.findByText(TOKEN_MOI);
    expect(o.getAttribute('data-o')).toBe('token-moi');
    expect(screen.getByText(CAU_DONG_LA_MAT)).toBeTruthy();
    // Đúng một chỗ trên màn hình mang token.
    expect(document.body.innerHTML.split(TOKEN_MOI)).toHaveLength(2);
    // Focus ở trong hộp (nút Sao chép), không rơi về body.
    expect(document.activeElement?.getAttribute('data-nut')).toBe('sao-chep-token');

    // Trang đã đọc lại: `token_bon_cuoi` mới hiện sau thành công.
    await waitFor(() => {
      expect(screen.getByText(`••••${TOKEN_MOI.slice(-4)}`)).toBeTruthy();
    });

    // Bấm nền ở pha token KHÔNG đóng (một cú trượt chuột là mất token).
    await userEvent.click(screen.getByRole('button', { name: NHAN_DONG_HOP_TOKEN_NGOAI }));
    expect(screen.getByText(TOKEN_MOI)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: NHAN_DONG_HOP_TOKEN }));
    expect(hopToken()).toBeNull();
    expect(document.body.innerHTML).not.toContain(TOKEN_MOI);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }),
    );

    // Mở lại — cả hai thao tác — không thấy token cũ.
    await userEvent.click(screen.getByRole('button', { name: NHAN_THU_HOI_TOKEN }));
    expect(hopToken()).not.toBeNull();
    expect(document.body.innerHTML).not.toContain(TOKEN_MOI);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    expect(screen.getByText(cauHoiTaoLai('W-builder'))).toBeTruthy();
    expect(document.body.innerHTML).not.toContain(TOKEN_MOI);
  });

  it('Esc ở pha token cũng đóng và xoá token khỏi DOM', async () => {
    await moTrang();
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_TAO_LAI }));
    await screen.findByText(TOKEN_MOI);
    await userEvent.keyboard('{Escape}');
    expect(hopToken()).toBeNull();
    expect(document.body.innerHTML).not.toContain(TOKEN_MOI);
  });

  /**
   * **Token không lưu ở đâu ngoài state của hộp** — mục 3 d.83 (hiện một lần
   * duy nhất), cùng tinh thần mục 15 d.427.
   *
   * Duyệt **chính** `QueryCache` và `MutationCache` (cả `state` lẫn `options`),
   * cả hai kho trình duyệt, và mọi lời gọi `console.*`. Một bản cài dùng
   * `useMutation` sẽ đỏ ở dòng `MutationCache` (mutation giữ `data` tới hết
   * `gcTime`); một bản `setQueryData(thân)` đỏ ở dòng `QueryCache`.
   */
  it('sau khi đóng hộp: token KHÔNG nằm trong cache React Query, kho trình duyệt, console', async () => {
    const kho_cuc_bo = datKhoGia();
    const kho_phien = datSessionGia();
    const nghe = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m),
    );
    const viet = vi.fn<(s: string) => Promise<void>>().mockResolvedValue(undefined);
    datClipboard(viet);

    const { qc } = await moTrang();
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_TAO_LAI }));
    await screen.findByText(TOKEN_MOI);

    // Sao chép: gọi clipboard với đúng token, báo đã chép.
    await userEvent.click(screen.getByRole('button', { name: NHAN_SAO_CHEP_TOKEN }));
    await waitFor(() => {
      expect(viet).toHaveBeenCalledWith(TOKEN_MOI);
    });
    expect(await screen.findByText(CAU_DA_SAO_CHEP)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: NHAN_DONG_HOP_TOKEN }));
    await waitFor(() => {
      expect(screen.getByText(`••••${TOKEN_MOI.slice(-4)}`)).toBeTruthy();
    });

    const q = qc.getQueryCache().getAll();
    // Lưới: cache **có** dữ liệu của trang (không phải xanh vì rỗng).
    expect(q.length).toBeGreaterThan(0);
    expect(JSON.stringify(q.map((x) => x.state))).toContain(TOKEN_MOI.slice(-4));
    expect(JSON.stringify(q.map((x) => [x.queryKey, x.state]))).not.toContain(TOKEN_MOI);
    const m = qc.getMutationCache().getAll();
    expect(JSON.stringify(m.map((x) => [x.state, x.options.mutationKey]))).not.toContain(TOKEN_MOI);

    for (const [k, v] of [...kho_cuc_bo, ...kho_phien]) {
      expect(k).not.toContain(TOKEN_MOI);
      expect(v).not.toContain(TOKEN_MOI);
    }
    for (const s of nghe) {
      expect(JSON.stringify(s.mock.calls.map((c) => c.map(String)))).not.toContain(TOKEN_MOI);
    }
  });

  it('clipboard TỪ CHỐI ⇒ báo chép tay, token vẫn hiện, không ném', async () => {
    datClipboard(vi.fn<(s: string) => Promise<void>>().mockRejectedValue(new Error('bị chặn')));
    await moTrang();
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_TAO_LAI }));
    await screen.findByText(TOKEN_MOI);

    await userEvent.click(screen.getByRole('button', { name: NHAN_SAO_CHEP_TOKEN }));
    expect(await screen.findByText(CAU_KHONG_SAO_CHEP_DUOC)).toBeTruthy();
    expect(screen.queryByText(CAU_DA_SAO_CHEP)).toBeNull();
    expect(screen.getByText(TOKEN_MOI)).toBeTruthy();
  });

  it('KHÔNG có `navigator.clipboard` ⇒ cũng báo chép tay, không ném', async () => {
    datClipboard(undefined);
    await moTrang();
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_TAO_LAI }));
    await screen.findByText(TOKEN_MOI);
    await userEvent.click(screen.getByRole('button', { name: NHAN_SAO_CHEP_TOKEN }));
    expect(await screen.findByText(CAU_KHONG_SAO_CHEP_DUOC)).toBeTruthy();
  });

  it('đang chờ máy chủ ⇒ Esc/Huỷ KHÔNG đóng hộp (đóng giữa chừng là mất token mới)', async () => {
    const { may } = await moTrang();
    let moCua = (): void => undefined;
    const treo = new Promise<unknown>((res) => {
      moCua = () => {
        res(null);
      };
    });
    may.dat(`POST ${D_TAO_LAI}`, {
      than: { agent_id: 'ag-1', token: TOKEN_MOI, token_bon_cuoi: TOKEN_MOI.slice(-4) },
      cho: treo,
    });
    await userEvent.click(screen.getByRole('button', { name: NHAN_TAO_LAI_TOKEN }));
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_TAO_LAI }));
    await waitFor(() => {
      expect(may.soLan('POST', D_TAO_LAI)).toBe(1);
    });

    expect(screen.getByRole('button', { name: NHAN_HUY_TOKEN }).hasAttribute('disabled')).toBe(
      true,
    );
    await userEvent.keyboard('{Escape}');
    expect(hopToken()).not.toBeNull();

    moCua();
    expect(await screen.findByText(TOKEN_MOI)).toBeTruthy();
  });

  for (const [ten_nut, xac_nhan, duong] of [
    [NHAN_TAO_LAI_TOKEN, NHAN_XAC_NHAN_TAO_LAI, D_TAO_LAI],
    [NHAN_THU_HOI_TOKEN, NHAN_XAC_NHAN_THU_HOI, D_THU_HOI],
  ] as const) {
    it(`"${ten_nut}": máy chủ từ chối ⇒ toast NGUYÊN VĂN, không hộp token, giao diện không đổi`, async () => {
      const CAU = `Câu lỗi của máy chủ cho ${duong}.`;
      const { may } = await moTrang();
      may.dat(`POST ${duong}`, { http: 403, loi: { error: 'FORBIDDEN', message: CAU } });

      await userEvent.click(screen.getByRole('button', { name: ten_nut }));
      await userEvent.click(screen.getByRole('button', { name: xac_nhan }));

      const toast = await screen.findByText(CAU);
      expect(toast.closest('[data-toast]')?.getAttribute('data-toast')).toBe('loi');
      expect(hopToken()).toBeNull();
      expect(document.querySelector('[data-o="token-moi"]')).toBeNull();
      expect(screen.queryByText(CAU_DONG_LA_MAT)).toBeNull();
      expect(screen.queryByText(cauDaThuHoi('W-builder'))).toBeNull();
      // Không đổi như đã thành công: 4 ký tự cũ, nút thu hồi vẫn bật, không "đã thu hồi".
      expect(screen.getByText('••••aaaa')).toBeTruthy();
      expect(screen.queryByText(NHAN_TOKEN_DA_THU_HOI)).toBeNull();
      expect(
        screen.getByRole('button', { name: NHAN_THU_HOI_TOKEN }).hasAttribute('disabled'),
      ).toBe(false);
    });
  }

  it('thu hồi thành công ⇒ toast ngắn, trang ĐỌC LẠI và hiện "đã thu hồi", nút thu hồi khoá', async () => {
    const { may } = await moTrang();
    const truoc = may.soLan('GET', `${D_AGENT}/ag-1`);

    await userEvent.click(screen.getByRole('button', { name: NHAN_THU_HOI_TOKEN }));
    await userEvent.click(screen.getByRole('button', { name: NHAN_XAC_NHAN_THU_HOI }));

    const toast = await screen.findByText(cauDaThuHoi('W-builder'));
    expect(toast.closest('[data-toast]')?.getAttribute('data-toast')).toBe('tin');
    expect(hopToken()).toBeNull();
    // `waitFor` mặc định 1 giây < chu kỳ hỏi vòng 2 giây: chỉ `invalidate` mới kịp.
    await waitFor(() => {
      expect(screen.getByText(NHAN_TOKEN_DA_THU_HOI)).toBeTruthy();
    });
    expect(may.soLan('GET', `${D_AGENT}/ag-1`)).toBeGreaterThan(truoc);
    expect(
      screen.getByRole('button', { name: NHAN_THU_HOI_TOKEN }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

/* Dùng `within` ở một ca để tránh import chết — và vì nó đọc đúng phạm vi khối. */
describe('khối "phiên đang mở" chỉ chứa phiên, không lẫn lượt giao', () => {
  it('đúng phạm vi khối', async () => {
    new MayChuGia()
      .dat(`GET ${D_AGENT}/ag-1`, {
        than: manHinhAgent({
          agent: agentDong({ id: 'ag-1' }),
          phien_dang_mo: [phienDong({ id: 'ph-1' })],
          luot_giao: [luotCuaAgent({ id: 'lg-1', so_luot: 1, ticket_ma: 'SAI-1' })],
        }),
      })
      .gan();
    dung(<TrangAgent id="ag-1" />, '/agent/ag-1');

    const khoi = await screen.findByRole('region', { name: TEN_KHOI_AGENT.phien });
    expect(within(khoi).queryByText('SAI-1')).toBeNull();
    expect(within(khoi).getByRole('link', { name: 'Đang chạy' })).toBeTruthy();
  });
});
