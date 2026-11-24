/**
 * **Định tuyến + vỏ** — SPEC mục 14.
 *
 * Lượt này không làm nội dung trang nào, nên điều đáng canh là đúng ba thứ:
 *   1. **Mỗi mục sidebar dẫn tới một trang thật**, không tới "Không có trang này"
 *      (một mục sidebar trỏ vào một đường không có route là một cú bấm chết, và
 *      nó không thấy được khi đọc diff).
 *   2. **Tên trang trùng nhãn sidebar của SPEC** — tức chuỗi
 *      `SPEC.md → muc-sidebar.ts → route → tiêu đề trang` khép kín.
 *   3. **`/t/<MÃ>` đúng dạng d.398** và mã đi được tới trang.
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { CAU_DANG_TAI_TRANG, CAU_KHONG_CO_TRANG, DinhTuyen } from '../src/dinh-tuyen';
import { CAU_GIU_CHO } from '../src/trang/giu-cho';
import { CAU_CHUA_CO_AGENT } from '../src/trang/doi-agent';
import { CAU_CHUA_CO_BAO_CAO } from '../src/trang/bao-cao';
import { duongTicket } from '../src/vo/muc-sidebar';
import { MayChuGia, dung } from './giup';
import { TONG_QUAN_RONG } from './than-tong-quan';
import { DA_XU_LY_RONG, MAN_HINH_RONG as MAN_HINH_CAN_CHU_RONG } from './than-can-chu';
import { docMucSidebarTuSpec } from './doc-spec';
import { MUC_CHINH, MUC_CUOI } from '../src/vo/muc-sidebar';

const SPEC = docMucSidebarTuSpec();

/**
 * Máy chủ giả cho các ca "mỗi mục sidebar có một trang": từ lượt 3 `/` là Tổng
 * quan thật, từ lượt 4 `/can-chu` là màn hình Cần Chủ thật, và cả hai gọi API.
 *
 * Khai thêm đường ở đây **không** nới lỏng ca nào: `MayChuGia` vẫn trượt kèm tên
 * đường nếu một trang gọi một đường **khác** những đường đã khai.
 */
function mayChoMoiDuong(): MayChuGia {
  return new MayChuGia()
    .dat('GET /v1/tong-quan', { than: TONG_QUAN_RONG })
    .dat('GET /v1/can-chu', { than: MAN_HINH_CAN_CHU_RONG })
    .dat('GET /v1/can-chu/da-xu-ly', { than: DA_XU_LY_RONG })
    .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
    // Từ lượt 6, `/doi-agent` và `/nhat-ky` là trang thật (mục 3 d.80, mục 10).
    .dat('GET /v1/man-hinh-agent', {
      than: { bay_gio: 1_760_000_000_000, agent: [], cursor_sau: null },
    })
    .dat('GET /v1/man-hinh-nhat-ky', {
      than: { items: [], cursor_sau: null, nhom_theo_ngay: [], bay_gio: 1_760_000_000_000 },
    })
    .dat('GET /v1/agent', { than: { items: [], cursor_sau: null } })
    // Từ phần 7 việc B, `/bao-cao` là trang thật (mục 11 d.322–336).
    .dat('GET /v1/bao-cao', { than: { items: [], cursor_sau: null } })
    // Từ lượt 6, `/ban-do-du-an` là trang thật (mục 9 d.302).
    .dat('GET /v1/man-hinh-ban-do', {
      than: {
        bay_gio: 1_760_000_000_000,
        du_an: [],
        luat_chung: { danh_sach_cam: null, checklist: null, cap_nhat_luc: null },
      },
    })
    // "Tất cả việc" (d.392) gọi danh sách ticket ngay khi dựng.
    .dat('GET /v1/man-hinh-ticket?limit=200', {
      than: { items: [], cursor_sau: null, bay_gio: 1_760_000_000_000 },
    })
    // Từ BAT-16, `/cai-dat` là trang thật hết (mục 12 d.348 + mục 15): ba đường đọc.
    .dat('GET /v1/sao-luu', { than: { bat: false, items: [] } })
    .dat('GET /v1/chu/phien-dang-nhap', { than: { bay_gio: 1_760_000_000_000, items: [] } })
    .dat('GET /v1/cai-dat/thong-bao', {
      than: {
        items: [
          { cong_tac: 'phien_dung', nhan: 'Phiên đứng', bat: true, khoa: false, ly_do_khoa: null },
        ],
      },
    })
    .gan();
}

describe('mỗi mục sidebar của SPEC có một trang', () => {
  /*
   * Bảng ca **sinh từ nhãn của SPEC**, không gõ tay bảy ca rời: thêm một mục vào
   * d.391 là tự nhiên có một ca mới, và nó đỏ cho tới khi có route.
   */
  const bang = [...SPEC.chinh, SPEC.cuoi].map((nhan) => {
    const muc = [...MUC_CHINH, MUC_CUOI].find((m) => m.nhan === nhan);
    return { nhan, duong: muc?.duong };
  });

  for (const { nhan, duong } of bang) {
    it(`"${nhan}" có route và tiêu đề trang đúng nhãn`, async () => {
      expect(duong).toBeTypeOf('string');
      /*
       * Máy chủ giả cho **mọi** ca: từ lượt 3, `/` là trang Tổng quan thật và nó
       * gọi `/v1/tong-quan`. Trang giữ chỗ không gọi gì, nên khai thêm một đường
       * ở đây không nới lỏng ca nào — `MayChuGia` vẫn trượt kèm tên đường nếu một
       * trang gọi một đường **khác** đường đã khai.
       */
      mayChoMoiDuong();
      dung(<DinhTuyen />, duong);
      // BAT-26: trang lazy (Báo cáo, Đội agent, Nhật ký, Cài đặt) nạp xong mới có tiêu đề.
      expect(await screen.findByRole('heading', { name: nhan })).toBeTruthy();
      expect(screen.queryByText(CAU_KHONG_CO_TRANG)).toBeNull();
    });
  }

  /**
   * Những đường đã là trang thật — `/` (lượt 3), `/can-chu` từ lượt 4 (mục 8
   * d.248–275), `/doi-agent`, `/nhat-ky` từ lượt 6 (mục 3 d.80, mục 10 d.311),
   * `/bao-cao` từ **phần 7 việc B** (mục 11 d.322–336), `/ticket` từ BAT-6,
   * `/cai-dat` từ **BAT-16** (khối "Thông báo Telegram", mục 12 d.348).
   */
  const DA_LAM: readonly string[] = [
    '/',
    '/can-chu',
    '/doi-agent',
    '/nhat-ky',
    '/bao-cao',
    // "Tất cả việc" (d.392) là trang danh sách ticket thật — BAT-6 đợt 3 phần B.
    '/ticket',
    // "Cài đặt" — BAT-16 làm xong mục 12 d.348, trang không còn dòng giữ chỗ.
    '/cai-dat',
  ];
  const CON_GIU_CHO = bang.filter(({ duong }) => duong !== undefined && !DA_LAM.includes(duong));

  it('KHÔNG mục sidebar nào còn là trang giữ chỗ (từ BAT-16)', async () => {
    // Trước BAT-16 danh sách giữ chỗ co lại theo từng lượt; nay nó phải **rỗng**.
    // Nhưng chỉ đo bộ lọc thì một bộ lọc quét sạch cũng xanh, nên ca còn **dựng
    // từng đường của sidebar** và canh không trang nào mang `data-giu-cho`.
    expect(CON_GIU_CHO).toEqual([]);
    const moi_duong = bang.map(({ duong }) => duong);
    expect(moi_duong.length).toBeGreaterThan(0);
    for (const { nhan, duong } of bang) {
      expect(duong).toBeTypeOf('string');
      mayChoMoiDuong();
      const { unmount } = dung(<DinhTuyen />, duong);
      // BAT-26: chờ trang (có thể lazy) dựng xong rồi mới đo "không giữ chỗ".
      await screen.findByRole('heading', { name: nhan });
      // `expect` ngoài một nhánh điều kiện, và `unmount` trước vòng sau: hai
      // cây React cùng lúc sẽ làm truy vấn DOM thấy trang của vòng trước.
      expect(document.querySelector('[data-giu-cho="co"]'), `đường ${String(duong)}`).toBeNull();
      expect(document.body.textContent).not.toContain(CAU_GIU_CHO);
      unmount();
    }
  });

  it('`/cai-dat` KHÔNG còn là trang giữ chỗ — khối "Thông báo Telegram" đã làm (BAT-16, mục 12 d.348)', async () => {
    const may = mayChoMoiDuong();
    dung(<DinhTuyen />, '/cai-dat');
    // Công tắc chỉ hiện sau khi `GET /v1/cai-dat/thong-bao` về — chỉ trang thật có.
    expect(await screen.findByText('Phiên đứng')).toBeTruthy();
    expect(may.soLan('GET', '/v1/cai-dat/thong-bao')).toBe(1);
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
    expect(document.body.textContent).not.toContain(CAU_GIU_CHO);
  });

  it('`/bao-cao` KHÔNG còn là trang giữ chỗ — nó là trang Báo cáo thật (mục 11 d.322)', async () => {
    mayChoMoiDuong();
    dung(<DinhTuyen />, '/bao-cao');
    // Danh sách rỗng ⇒ trang nói thẳng vì sao (Cron 07:30 / 20:00 chưa chạy).
    expect(await screen.findByText(CAU_CHUA_CO_BAO_CAO)).toBeTruthy();
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  it('`/` KHÔNG còn là trang giữ chỗ — nó là Tổng quan thật (d.316)', async () => {
    mayChoMoiDuong();
    dung(<DinhTuyen />, '/');
    // Chờ thân về: khối chỉ dựng sau khi query xong. Khối **đầu** là "Dự án" từ
    // BAT-6 đợt 3 (trước đó là "Cần Chủ", nay chỉ còn một ô bên phải — d.322).
    expect(await screen.findByRole('region', { name: 'Dự án' })).toBeTruthy();
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  it('`/can-chu` KHÔNG còn là trang giữ chỗ — nó là màn hình Cần Chủ thật (d.248)', async () => {
    mayChoMoiDuong();
    dung(<DinhTuyen />, '/can-chu');
    // Ba khối của d.249 chỉ dựng sau khi `GET /v1/can-chu` về.
    expect(await screen.findByRole('region', { name: '🔴 Gấp' })).toBeTruthy();
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });
});

describe('d.398 — `/t/<MÃ>`', () => {
  it('`duongTicket` dựng đúng dạng SPEC chốt', () => {
    expect(duongTicket('BAT-12')).toBe('/t/BAT-12');
  });

  /**
   * Từ lượt 5, `/t/<MÃ>` là **trang thật** (d.398–401): mã trên đường phải đi
   * thẳng vào lượt gọi `GET /v1/man-hinh-ticket/ma/<MÃ>`. Đó cũng là ca phủ đúng
   * cái lỗi dễ nhất của một route có tham số — gọi `.../ma/undefined`.
   */
  it('`/t/BAT-12` ra trang chi tiết ticket thật, mã đi vào lượt gọi', async () => {
    const may = mayChoMoiDuong().dat('GET /v1/man-hinh-ticket/ma/BAT-12', {
      http: 404,
      loi: { error: 'NOT_FOUND', message: 'Không tìm thấy ticket.' },
    });
    dung(<DinhTuyen />, '/t/BAT-12');

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(may.soLan('GET', '/v1/man-hinh-ticket/ma/BAT-12')).toBe(1);
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  it('`/ticket/BAT-12` KHÔNG phải đường chi tiết — d.398 chốt `/t/`', () => {
    /*
     * Ca phủ định thật: `/ticket` là danh sách "Tất cả dự án". Nếu ai đó thêm một
     * route `/ticket/:ma` trỏ vào chi tiết thì có hai đường cho một trang, và
     * link trong thông báo Telegram (mục 12) sẽ có hai dạng.
     */
    dung(<DinhTuyen />, '/ticket/BAT-12');
    expect(screen.queryByRole('heading', { name: 'Chi tiết ticket' })).toBeNull();
  });
});

describe('các đường còn lại của mục 14', () => {
  it('`/ticket` — "Tất cả việc" thật (d.392, d.397), KHÔNG còn giữ chỗ', async () => {
    mayChoMoiDuong()
      .dat('GET /v1/agent', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/man-hinh-ticket?limit=200', {
        than: { items: [], cursor_sau: null, bay_gio: 1_760_000_000_000 },
      });
    dung(<DinhTuyen />, '/ticket');

    /*
     * **Tab nhanh** của d.407 là thứ chỉ có trên trang thật (thanh lọc nay nằm
     * trong menu "Lọc" — d.407 "không mở sẵn", nên không tra nó bằng `region`
     * nữa). Và tiêu đề là **nhãn sidebar của d.392**.
     */
    expect(await screen.findByRole('region', { name: 'Bộ lọc nhanh' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tất cả việc' })).toBeTruthy();
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  /**
   * `/du-an/<MÃ>` lọc theo **dự án của đường**. Ca này ghim luôn rằng mã đường
   * được đổi thành `project_id` trước khi hỏi — một lượt gọi không có
   * `project_id` là một màn hình "dự án SPX" hiện ticket của cả workspace.
   */
  it('`/du-an/<MÃ>` — danh sách ticket của một dự án, lọc theo đúng dự án đó', async () => {
    const may = mayChoMoiDuong()
      .dat('GET /v1/agent', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/du-an?limit=200', {
        than: {
          items: [
            { id: 'pj-SPX', ma: 'SPX', ten: 'Sample', trang_thai: 'active', nhom: null },
          ],
          cursor_sau: null,
        },
      })
      .dat('GET /v1/man-hinh-ticket?project_id=pj-SPX&limit=200', {
        than: { items: [], cursor_sau: null, bay_gio: 1_760_000_000_000 },
      });
    dung(<DinhTuyen />, '/du-an/SPX');

    expect(await screen.findByRole('region', { name: 'Bộ lọc nhanh' })).toBeTruthy();
    await screen.findByRole('heading', { name: /Sample/ });
    expect(may.soLan('GET', '/v1/man-hinh-ticket?project_id=pj-SPX&limit=200')).toBe(1);
  });

  /**
   * Từ lượt 6, `/phien/<id>` và `/agent/<id>` là **trang thật** (d.402, d.104):
   * id trên đường phải đi thẳng vào lượt gọi. Cùng ca phủ cái lỗi dễ nhất của một
   * route có tham số — gọi `.../undefined`.
   */
  it('`/phien/<id>` — chi tiết phiên thật (d.402), id đi vào lượt gọi', async () => {
    const may = mayChoMoiDuong().dat('GET /v1/man-hinh-phien/ph-1', {
      http: 404,
      loi: { error: 'NOT_FOUND', message: 'Không tìm thấy phiên.' },
    });
    dung(<DinhTuyen />, '/phien/ph-1');

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(may.soLan('GET', '/v1/man-hinh-phien/ph-1')).toBe(1);
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  it('`/agent/<id>` — trang agent thật (mục 3 d.104), id đi vào lượt gọi', async () => {
    const may = mayChoMoiDuong().dat('GET /v1/man-hinh-agent/ag-1', {
      http: 404,
      loi: { error: 'NOT_FOUND', message: 'Không tìm thấy agent.' },
    });
    dung(<DinhTuyen />, '/agent/ag-1');

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(may.soLan('GET', '/v1/man-hinh-agent/ag-1')).toBe(1);
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  it('`/nhat-ky` KHÔNG còn là trang giữ chỗ — nó là Nhật ký thật (mục 10 d.311)', async () => {
    mayChoMoiDuong();
    dung(<DinhTuyen />, '/nhat-ky');

    // Thanh lọc của d.311 chỉ có trên trang thật.
    expect(await screen.findByRole('region', { name: 'Bộ lọc' })).toBeTruthy();
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  /**
   * `/ban-do-du-an` **không còn là một mục sidebar** (d.398) nhưng **trang vẫn
   * còn**, nên nó phải có route riêng — đúng cái lỗ mà ca này canh: một trang còn
   * sống mà rơi khỏi `MUC_CHINH` là một cú bấm ra "Không có trang này".
   */
  it('`/ban-do-du-an` vẫn là trang Bản đồ thật dù KHÔNG còn mục sidebar (d.398)', async () => {
    mayChoMoiDuong();
    dung(<DinhTuyen />, '/ban-do-du-an');

    // Khối "Luật chung" của d.301 chỉ có trên trang thật.
    expect(await screen.findByRole('region', { name: 'Luật chung' })).toBeTruthy();
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  /**
   * `/du-an/<id>/ho-so` — mục 9 d.294. Ba đoạn, nên nó **không** bị
   * `/du-an/:ma` (hai đoạn) ăn mất, và id đi vào lượt gọi.
   */
  it('`/du-an/<id>/ho-so` ra trang hồ sơ thật, id đi vào lượt gọi', async () => {
    const may = mayChoMoiDuong().dat('GET /v1/du-an/pj-SAI/ho-so', {
      than: {
        project_id: 'pj-SAI',
        bay_gio: 1_760_000_000_000,
        phien_ban: 0,
        cap_nhat_luc: null,
        khong_code: false,
        bat_buoc_review: false,
        la_gi: null,
        thu_muc: null,
        repo_chu_so_huu: null,
        repo_ten: null,
        repo_nhanh_mac_dinh: null,
        stack: null,
        doc_truoc: null,
        cach_deploy: null,
        danh_sach_cam: null,
        du_an: { id: 'pj-SAI', ma: 'SAI', ten: 'Sample', quan_ly_agent_id: null },
        loi_da_gap: [],
        lich_su_ban: [],
      },
    });
    dung(<DinhTuyen />, '/du-an/pj-SAI/ho-so');

    expect(await screen.findByRole('region', { name: 'Lỗi đã gặp' })).toBeTruthy();
    expect(may.soLan('GET', '/v1/du-an/pj-SAI/ho-so')).toBe(1);
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  it('`/doi-agent` KHÔNG còn là trang giữ chỗ — nó là Đội agent thật (d.392)', async () => {
    mayChoMoiDuong().dat('GET /v1/man-hinh-agent', {
      than: { bay_gio: 1_760_000_000_000, agent: [], cursor_sau: null },
    });
    dung(<DinhTuyen />, '/doi-agent');

    expect(await screen.findByText(CAU_CHUA_CO_AGENT)).toBeTruthy();
    expect(document.querySelector('[data-giu-cho="co"]')).toBeNull();
  });

  it('BAT-26 — đường lazy (`/nhat-ky`): cuối cùng ra đúng trang, dòng chờ "Đang tải trang…" đã biến mất', async () => {
    mayChoMoiDuong();
    dung(<DinhTuyen />, '/nhat-ky');
    expect(await screen.findByRole('region', { name: 'Bộ lọc' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nhật ký quyết định' })).toBeTruthy();
    expect(screen.queryByText(CAU_DANG_TAI_TRANG)).toBeNull();
  });

  it('một đường lạ ra "Không có trang này" — SPA xử, không phải máy chủ', () => {
    dung(<DinhTuyen />, '/khong-co-trang-nay');
    expect(screen.getByRole('heading', { name: CAU_KHONG_CO_TRANG })).toBeTruthy();
  });
});
