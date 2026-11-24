/**
 * **Trang chi tiết ticket `/t/<MÃ>`** — SPEC mục 14 d.398–401, d.407, d.410,
 * d.411, d.412.
 *
 * Luật thuần "bình luận xen lịch sử" (`tronBinhLuanVaLichSu`) có ca riêng ở
 * `loc-ticket.test.ts`. Ở đây là những gì chỉ đo được trên cây React: **từng vế**
 * của d.399–401 có một khối trên trang, sửa tại chỗ có hiện ngay và có hoàn lại
 * khi máy chủ từ chối, và bản 375px không dựng hai cột cứng.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAU_DU_AN_KHONG_CODE,
  CAU_KHONG_CO_CAN_CHU,
  NHAN_BRIEF,
  NHAN_KHONG_CODE_TICKET,
  NHAN_LUU,
  TEN_KHOI,
  TrangChiTietTicket,
  tenTacGia,
} from '../src/trang/chi-tiet-ticket';
import { CHU_KY_LAM_MOI_MS } from '../src/hang-so';
import { MUC_BRIEF } from '../src/api';
import { MayChuGia, dung } from './giup';
import {
  GIO,
  GIO_MS,
  binhLuan,
  dongLichSu,
  lienKet,
  luotGiao,
  manHinhTicket,
  ticketCon,
  ticketDayDu,
} from './than-ticket';
import { the as theCanChu } from './than-can-chu';
import {
  hienThayDoiTuSpec,
  mucBriefTuSpec,
  specDoiDienThoai,
  veChiTietTicketTuSpec,
} from './doc-spec';

const MA = 'SAI-1';
const DUONG_MH = `/v1/man-hinh-ticket/ma/${MA}`;

/** Năm trường `bao_cao_*` của một bằng chứng KHÔNG phải báo cáo (migration 0027). */
const KHONG_BAO_CAO = {
  bao_cao_nguon: null,
  nhan_bao_cao_nguon: null,
  bao_cao_duong_dan: null,
  bao_cao_noi_dung: null,
  bao_cao_reviewer: null,
} as const;

/**
 * Máy chủ giả. `kho.mh` đổi được giữa các lượt gọi (ca d.410); `kho.loi` bật ca
 * "máy chủ từ chối" của d.407; `kho.cho` giữ phản hồi lại để phân biệt bản lạc
 * quan với bản thật.
 */
function mayChiTiet(mh = manHinhTicket(ticketDayDu({ ma: MA }))): {
  may: MayChuGia;
  kho: {
    mh: ReturnType<typeof manHinhTicket>;
    loi: { error: string; message: string } | null;
    cho: Promise<unknown> | null;
    choGet: Promise<unknown> | null;
  };
} {
  const kho = {
    mh,
    loi: null as { error: string; message: string } | null,
    cho: null as Promise<unknown> | null,
    /**
     * **Cửa chặn lượt ĐỌC** — xem ghi chú cùng tên ở `danh-sach-ticket.test.tsx`.
     * Không có nó thì ca "hoàn lại" xanh nhờ lần `invalidateQueries` của
     * `onSettled`, **dù mã không hoàn gì** (đã đo bằng đột biến).
     */
    choGet: null as Promise<unknown> | null,
  };
  const may = new MayChuGia();
  may.dat('GET ' + DUONG_MH, () => ({
    than: kho.mh,
    ...(kho.choGet === null ? {} : { cho: kho.choGet }),
  }));
  may.dat('PATCH /v1/ticket/tk-' + MA, () =>
    kho.loi === null
      ? { than: { ok: true }, ...(kho.cho === null ? {} : { cho: kho.cho }) }
      : { loi: kho.loi, http: 422, ...(kho.cho === null ? {} : { cho: kho.cho }) },
  );
  may.gan();
  return { may, kho };
}

async function choTai(): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector('[data-o="ma"]')).not.toBeNull();
  });
}

afterEach(() => {
  vi.useRealTimers();
});

/* ================================================================== *
 * A. d.399–401 — từng vế của SPEC có một khối trên trang
 * ================================================================== */

describe('d.399–401 — mọi vế của SPEC có một khối', () => {
  /** Chữ của SPEC → tên khối trên trang. Bảng dịch duy nhất, và nó bị ghim. */
  const KHOI_CUA_VE: Record<string, string> = {
    'tiêu đề và mô tả': 'mo-ta',
    brief: 'brief',
    'ticket con': 'ticket-con',
    'chuỗi lượt giao dạng dòng thời gian': 'luot-giao',
    'bằng chứng': 'bang-chung',
    'bình luận xen lịch sử': 'binh-luan',
    'thuộc tính': 'thuoc-tinh',
    'ticket liên quan': 'lien-quan',
    'mục Cần Chủ liên quan': 'can-chu',
  };

  it('danh sách vế cắt từ d.399 + d.401 phủ KHỚP bảng khối của trang', () => {
    const ve = veChiTietTicketTuSpec();
    const tat_ca = [...ve.ben_trai, ...ve.ben_phai];
    expect(tat_ca.filter((v) => KHOI_CUA_VE[v] === undefined)).toEqual([]);
    expect(Object.keys(KHOI_CUA_VE).filter((v) => !tat_ca.includes(v))).toEqual([]);
  });

  it('parser cắt ra đủ vế hai bên, và đủ các cờ của d.399/d.401', () => {
    const ve = veChiTietTicketTuSpec();
    expect(ve.ben_trai.length).toBeGreaterThanOrEqual(6);
    expect(ve.ben_phai).toHaveLength(3);
    expect(ve.co_dieu_phoi).toBe(true);
    expect(ve.co_sua_tai_cho).toBe(true);
    expect(ve.co_dong_thoi_gian).toBe(true);
    expect(ve.co_lich_su_thu_gon).toBe(true);
    expect(ve.so_muc_brief).toBe(MUC_BRIEF.length);
  });

  it('mọi khối của bảng trên có mặt trong DOM', async () => {
    mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const thieu = Object.values(KHOI_CUA_VE).filter(
      (k) => document.querySelector(`[data-khoi="${k}"], [data-o="${k}"]`) === null,
    );
    expect(thieu).toEqual([]);
  });
});

/* ================================================================== *
 * B. d.399 — brief 8 mục GẬP ĐƯỢC
 * ================================================================== */

describe('d.399 — brief 8 mục gập được', () => {
  it('tám nhãn brief trong mã khớp từng chữ với SPEC mục 4', () => {
    expect(MUC_BRIEF.map((m) => NHAN_BRIEF[m])).toEqual(mucBriefTuSpec());
  });

  it('mặc định GẬP: nội dung brief không có trong DOM', async () => {
    mayChiTiet(manHinhTicket(ticketDayDu({ ma: MA, muc_tieu: 'Làm xong cổng Xong' })));
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    expect(document.querySelector('[data-o="brief-mo"]')).toBeNull();
    expect(screen.queryByText('Làm xong cổng Xong')).toBeNull();
  });

  it('bấm mở ⇒ đủ TÁM mục, kể cả mục rỗng (mục thiếu là một dữ kiện)', async () => {
    mayChiTiet(manHinhTicket(ticketDayDu({ ma: MA, muc_tieu: 'Làm xong cổng Xong' })));
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="gap-brief"]')!);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="brief-mo"]')).not.toBeNull();
    });

    expect(document.querySelectorAll('[data-muc-brief]')).toHaveLength(MUC_BRIEF.length);
    expect(screen.getByText('Làm xong cổng Xong')).toBeTruthy();
    // Mục rỗng hiện dấu "—", không bị ẩn.
    expect(
      document.querySelector('[data-muc-brief="nop_lai"]')?.textContent,
    ).toContain('—');
  });

  it('đếm số mục đã có / tổng', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA, muc_tieu: 'A', xong_la_gi: 'B', pham_vi: '   ' })),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();
    // `pham_vi` toàn khoảng trắng **không** tính là đã có.
    expect(document.querySelector('[data-so="brief"]')?.textContent).toBe(
      `2/${String(MUC_BRIEF.length)}`,
    );
  });
});

/* ================================================================== *
 * C. d.399 — ticket con, và chuỗi lượt giao dạng dòng thời gian
 * ================================================================== */

describe('d.399 — ticket con và chuỗi lượt giao', () => {
  it('ticket con hiện mã, tiêu đề, nhãn trạng thái, và link `/t/<MÃ>`', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), { ticket_con: [ticketCon('SAI-2', 'done')] }),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const o = document.querySelector<HTMLElement>('[data-ticket-con="SAI-2"]')!;
    expect(o.textContent).toContain('Việc SAI-2');
    expect(o.textContent).toContain('Xong');
    expect(o.querySelector('a')?.getAttribute('href')).toBe('/t/SAI-2');
  });

  it('dòng thời gian: đúng thứ tự `so_luot`, đủ bốn vế của d.399', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), {
        luot_giao: [
          luotGiao({
            so_luot: 1,
            trang_thai: 'returned',
            nhan_trang_thai: 'Trả lại',
            ly_do: 'Thiếu test cho luật 19.3',
            dang_mo: false,
            bao_cao: { ket_qua: 'partial', nhan_ket_qua: 'Một phần', nop_luc: GIO - 2 * GIO_MS },
            nop_luc: GIO - 2 * GIO_MS,
          }),
          luotGiao({ so_luot: 2, khong_phan_hoi: true }),
        ],
      }),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const muc = [...document.querySelectorAll('[data-luot]')];
    expect(muc.map((e) => e.getAttribute('data-luot'))).toEqual(['1', '2']);

    const mot = muc[0] as HTMLElement;
    // Người giao → người nhận.
    expect(mot.querySelector('[data-o="giao-nhan"]')?.textContent).toBe('Chủ (chủ) → agent');
    // Trạng thái (nhãn của máy chủ).
    expect(mot.querySelector('[data-o="trang-thai"]')?.textContent).toBe('Trả lại');
    // Báo cáo nộp.
    expect(mot.querySelector('[data-o="ket-qua"]')?.textContent).toBe('Một phần');
    // Nghiệm thu — lý do trả lại.
    expect(mot.querySelector('[data-o="ly-do"]')?.textContent).toContain('Thiếu test cho luật 19.3');

    // "Không phản hồi" là dẫn xuất của MÁY CHỦ; lượt 1 không có, lượt 2 có.
    expect(mot.querySelector('[data-o="khong-phan-hoi"]')).toBeNull();
    expect((muc[1] as HTMLElement).querySelector('[data-o="khong-phan-hoi"]')).not.toBeNull();
  });

  it('chưa có lượt nào ⇒ nói rõ', async () => {
    mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();
    expect(document.querySelector('[data-so="luot-giao"]')?.textContent).toBe('0');
  });
});

/* ================================================================== *
 * D. d.400 — bằng chứng, và bình luận xen lịch sử
 * ================================================================== */

describe('d.400 — bằng chứng và dòng bình luận–lịch sử', () => {
  it('bằng chứng hiện hash MÁY CHỦ ĐÃ CẮT, không cắt lại ở web', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), {
        bang_chung: [
          {
            id: 'bc-1',
            loai: 'commit',
            nhan_loai: 'Commit',
            hash: 'abcdef1',
            repo: 'chu/baton',
            url: null,
            ma_phien_ban: null,
            xac_minh: 'merged',
            nhan_xac_minh: 'Đã merge',
            nguon_xac_minh: 'github',
            nhan_nguon_xac_minh: 'kiểm qua GitHub',
            review_nguon: null,
            nhan_review_nguon: null,
            review_bao_cao: null,
            ...KHONG_BAO_CAO,
          },
        ],
      }),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const o = document.querySelector<HTMLElement>('[data-bang-chung="bc-1"]')!;
    expect(o.querySelector('[data-o="hash"]')?.textContent).toBe('abcdef1');
    expect(o.querySelector('[data-o="xac-minh"]')?.textContent).toBe('Đã merge');
    // Đối chứng cho ca `bao_cao` dưới: commit thì không có khối báo cáo nào.
    expect(o.querySelector('[data-o="nguon-bao-cao"]')).toBeNull();
  });

  /*
   * Bằng chứng **Báo cáo** (`bao_cao`, migration 0027, T-31 câu 3.4 A): nhãn
   * "Báo cáo" của máy chủ, người ký, đường dẫn, nội dung (markdown), báo cáo
   * reviewer của manager.
   */
  it('bằng chứng `bao_cao`: hiện nhãn "Báo cáo", người ký, đường dẫn, nội dung, báo cáo reviewer', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), {
        bang_chung: [
          {
            id: 'bc-bc',
            loai: 'bao_cao',
            nhan_loai: 'Báo cáo',
            hash: null,
            repo: null,
            url: null,
            ma_phien_ban: null,
            xac_minh: 'not_required',
            nhan_xac_minh: 'Không cần xác minh',
            nguon_xac_minh: null,
            nhan_nguon_xac_minh: null,
            review_nguon: null,
            nhan_review_nguon: null,
            review_bao_cao: null,
            bao_cao_nguon: 'manager',
            nhan_bao_cao_nguon: 'manager ký, kèm báo cáo reviewer',
            bao_cao_duong_dan: 'bao-cao/sai-32.md',
            bao_cao_noi_dung: 'Kết luận **nghiên cứu**: chọn phương án B.',
            bao_cao_reviewer: 'bao-cao/reviewer-sai-32.md',
          },
        ],
      }),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const o = document.querySelector<HTMLElement>('[data-bang-chung="bc-bc"]')!;
    expect(o.querySelector('[data-o="loai"]')?.textContent).toBe('Báo cáo');
    expect(o.querySelector('[data-o="nguon-bao-cao"]')?.textContent).toBe(
      'manager ký, kèm báo cáo reviewer',
    );
    expect(o.querySelector('[data-o="bao-cao-duong-dan"]')?.textContent).toBe('bao-cao/sai-32.md');
    expect(o.querySelector('[data-o="bao-cao-reviewer"]')?.textContent).toBe(
      'bao-cao/reviewer-sai-32.md',
    );
    expect(o.querySelector('[data-o="bao-cao-noi-dung"]')?.textContent).toContain(
      'chọn phương án B',
    );
  });

  it('bình luận và lịch sử nằm trong MỘT dòng, xen kẽ theo mốc', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), {
        binh_luan: [
          binhLuan({ id: 'bl-moi', tao_luc: GIO - 1000, noi_dung: 'Bình luận mới' }),
          binhLuan({ id: 'bl-cu', tao_luc: GIO - 3000, noi_dung: 'Bình luận cũ' }),
        ],
        lich_su: [dongLichSu({ id: 'ls', luc: GIO - 2000 })],
      }),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    /*
     * Ghim **nội dung** theo thứ tự, không chỉ hình `['binh-luan','lich-su',
     * 'binh-luan']`: hình đó **giống nhau** ở cả hai hướng sắp (tăng và giảm), nên
     * một ca chỉ đọc hình sẽ sống sót khi `tronBinhLuanVaLichSu` sắp ngược (đã đo
     * bằng đột biến).
     */
    const dong = [...document.querySelectorAll('[data-moc]')].map((e) => ({
      moc: e.getAttribute('data-moc'),
      chu: e.textContent ?? '',
    }));
    expect(dong.map((d) => d.moc)).toEqual(['binh-luan', 'lich-su', 'binh-luan']);
    expect(dong[0]?.chu).toContain('Bình luận mới');
    expect(dong[2]?.chu).toContain('Bình luận cũ');
  });

  it('lịch sử THU GỌN: một dòng `trường: cũ → mới`, không một khối như bình luận', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), {
        lich_su: [dongLichSu({ id: 'ls', luc: GIO, truong: 'uu_tien', gia_tri_cu: 'low', gia_tri_moi: 'high' })],
      }),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const o = document.querySelector<HTMLElement>('[data-moc="lich-su"]')!;
    expect(o.querySelector('[data-o="truong"]')?.textContent).toBe('uu_tien');
    expect(o.querySelector('[data-o="doi"]')?.textContent).toBe('low → high');
  });
});

/* ================================================================== *
 * E. d.401 — cột phải: thuộc tính, liên quan (kể cả điều phối), Cần Chủ
 * ================================================================== */

describe('UI-B (THIET-KE.md) — icon trạng thái ở đầu trang và ở thuộc tính', () => {
  it('đầu trang: icon đúng trạng thái đứng trước chữ trạng thái; thuộc tính "Trạng thái" cũng có icon, chữ máy chủ còn nguyên', async () => {
    mayChiTiet(
      manHinhTicket(
        ticketDayDu({ ma: MA, trang_thai: 'verifying', nhan_trang_thai: 'Chờ kiểm chứng' }),
      ),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const goc = document.querySelector<HTMLElement>('[data-o="chi-tiet-ticket"]')!;
    const dau = goc.querySelector('header [data-o="trang-thai"]')!;
    expect(dau.querySelector('[data-icon-trang-thai="verifying"]')).not.toBeNull();
    expect(dau.textContent).toBe('Chờ kiểm chứng');

    const tt = goc.querySelector('[data-thuoc-tinh="trang-thai"]')!;
    expect(tt.querySelector('[data-icon-trang-thai="verifying"]')).not.toBeNull();
    expect(tt.querySelector('dd')?.textContent).toBe('Chờ kiểm chứng');
  });
});

describe('d.401 — cột phải', () => {
  it('thuộc tính lấy nhãn và dẫn xuất TỪ MÁY CHỦ', async () => {
    mayChiTiet(
      manHinhTicket(
        ticketDayDu({
          ma: MA,
          uu_tien: 'urgent',
          nguoi_dang_cam: { loai: 'agent', agentId: 'ag-a' },
          chiu_trach_nhiem: { loai: 'owner' },
          nhan: ['hạ-tầng'],
          co: {
            xong_khong_bang_chung: true,
            nhap_khong_bang_chung: false,
            khong_ai_cam: false,
            can_review_lai: false,
          },
        }),
      ),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const o = document.querySelector<HTMLElement>('[data-khoi="thuoc-tinh"]')!;
    expect(o.querySelector('[data-thuoc-tinh="uu-tien"]')?.textContent).toContain('Khẩn');
    expect(o.querySelector('[data-thuoc-tinh="nguoi-dang-cam"]')?.textContent).not.toContain('ag-a');
    expect(o.querySelector('[data-thuoc-tinh="chiu-trach-nhiem"]')?.textContent).toContain('Chủ');
    expect(o.querySelector('[data-nhan="hạ-tầng"]')).not.toBeNull();
    // Chỉ cờ đang bật hiện ra.
    expect(o.querySelector('[data-co="xong_khong_bang_chung"]')).not.toBeNull();
    expect(o.querySelector('[data-co="khong_ai_cam"]')).toBeNull();
  });

  it('ticket liên quan GIỮ ticket điều phối, và KHÔNG lặp lại ticket con', async () => {
    mayChiTiet(
      manHinhTicket(
        ticketDayDu({
          ma: MA,
          lien_ket: [
            lienKet('parent', 'SAI-2'), // con — khối riêng ở cột trái
            lienKet('parent', 'SAI-3', true), // cha — là "liên quan"
            lienKet('related', 'SAI-4'),
            lienKet('dieu_phoi', 'COS-1'),
          ],
        }),
        { ticket_con: [ticketCon('SAI-2')] },
      ),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const o = document.querySelector<HTMLElement>('[data-khoi="lien-quan"]')!;
    const ma_ds = [...o.querySelectorAll('[data-lien-ket]')].map((e) =>
      e.getAttribute('data-lien-ket'),
    );
    expect(ma_ds).toEqual(['SAI-3', 'SAI-4', 'COS-1']);
    // Ticket **điều phối** phân biệt được với `related` (19.4).
    expect(o.querySelector('[data-lien-ket="COS-1"]')?.getAttribute('data-loai')).toBe('dieu_phoi');
    // Và ticket con vẫn ở khối của nó.
    expect(document.querySelector('[data-ticket-con="SAI-2"]')).not.toBeNull();
  });

  it('ticket điều phối có nhãn riêng ở đầu trang — 19.4', async () => {
    mayChiTiet(manHinhTicket(ticketDayDu({ ma: MA, la_dieu_phoi: true })));
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();
    expect(document.querySelector('[data-o="dieu-phoi"]')).not.toBeNull();
  });

  it('"chờ N ticket con" của 19.11 hiện khi máy chủ nói có', async () => {
    mayChiTiet(manHinhTicket(ticketDayDu({ ma: MA, con_chua_ket: 3 })));
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();
    expect(document.querySelector('[data-o="con-chua-ket"]')?.textContent).toContain(
      'chờ 3 ticket con',
    );
  });

  it('mục Cần Chủ liên quan vẽ bằng THẺ d.250, với `bay_gio` của thân này', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), {
        can_chu: [
          theCanChu({
            ma: 'T-7',
            loai: 'run_command',
            lenh: 'npm test',
            han_luc: GIO + 2 * GIO_MS,
          }),
        ],
      }),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const o = document.querySelector<HTMLElement>('[data-can-chu="T-7"]')!;
    // Chính component `The`: nó mang `data-the` và khối lệnh + nút Copy của d.250.
    expect(o.querySelector('[data-the="T-7"]')).not.toBeNull();
    expect(o.querySelector('[data-nut="copy"]')).not.toBeNull();
    // Hạn đếm từ `bay_gio` **của thân**, không `Date.now()`.
    expect(o.querySelector('[data-o="han"]')?.textContent).toBe('Hạn trong 2 giờ');
    // Và có đường sang trang Cần Chủ để trả lời.
    expect(o.querySelector('[data-mo-can-chu="T-7"]')?.getAttribute('href')).toBe('/can-chu');
  });

  it('không có mục Cần Chủ nào ⇒ nói rõ', async () => {
    mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();
    expect(within(document.querySelector<HTMLElement>('[data-khoi="can-chu"]')!).getByText(
      CAU_KHONG_CO_CAN_CHU,
    )).toBeTruthy();
  });
});

/* ================================================================== *
 * F. d.398 + d.407 — sửa tại chỗ, hiện ngay, hoàn lại khi bị từ chối
 * ================================================================== */

describe('d.398 + d.407 — sửa tiêu đề tại chỗ', () => {
  const LY_DO = 'Không có quyền sửa ticket này.';

  it('bấm Sửa ⇒ ô nhập ngay tại chỗ; Lưu ⇒ gọi PATCH đúng thân', async () => {
    const { may } = mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="sua-tieu-de"]')!);
    const o = document.querySelector<HTMLInputElement>('[data-o-nhap="tieu-de"]')!;
    await userEvent.clear(o);
    await userEvent.type(o, 'Tiêu đề mới');
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="luu-tieu-de"]')!);

    await vi.waitFor(() => {
      const goi = may.da_goi.find((l) => l.method === 'PATCH');
      expect(goi?.duong).toBe(`/v1/ticket/tk-${MA}`);
      expect(goi?.than).toEqual({ tieu_de: 'Tiêu đề mới' });
    });
  });

  it('tiêu đề mới hiện NGAY, trước khi máy chủ trả lời', async () => {
    const { kho } = mayChiTiet();
    let mo: () => void = () => undefined;
    kho.cho = new Promise<unknown>((res) => {
      mo = () => res(null);
    });
    kho.loi = { error: 'FORBIDDEN', message: LY_DO };

    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="sua-tieu-de"]')!);
    const o = document.querySelector<HTMLInputElement>('[data-o-nhap="tieu-de"]')!;
    await userEvent.clear(o);
    await userEvent.type(o, 'Tiêu đề lạc quan');
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="luu-tieu-de"]')!);

    await vi.waitFor(() => {
      expect(screen.getByText('Tiêu đề lạc quan')).toBeTruthy();
    });
    mo();
  });

  it('máy chủ TỪ CHỐI ⇒ tiêu đề hoàn lại và toast mang lý do của máy chủ', async () => {
    const { kho } = mayChiTiet();
    kho.loi = { error: 'FORBIDDEN', message: LY_DO };

    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    // Đóng cửa lượt đọc: từ đây, thứ duy nhất đưa tiêu đề về bản cũ là phép
    // **hoàn lại ảnh chụp** của `onError`.
    kho.choGet = new Promise<unknown>(() => {
      /* không bao giờ mở */
    });

    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="sua-tieu-de"]')!);
    const o = document.querySelector<HTMLInputElement>('[data-o-nhap="tieu-de"]')!;
    await userEvent.clear(o);
    await userEvent.type(o, 'Tiêu đề bị từ chối');
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="luu-tieu-de"]')!);

    await vi.waitFor(() => {
      expect(screen.getByText(LY_DO)).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(screen.getByText(`Việc ${MA}`)).toBeTruthy();
    });
    expect(screen.queryByText('Tiêu đề bị từ chối')).toBeNull();
  });

  it('bấm Huỷ ⇒ KHÔNG gọi máy chủ, giá trị cũ còn nguyên', async () => {
    const { may } = mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="sua-tieu-de"]')!);
    await userEvent.type(
      document.querySelector<HTMLInputElement>('[data-o-nhap="tieu-de"]')!,
      ' thêm chữ',
    );
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="huy-tieu-de"]')!);

    expect(may.da_goi.some((l) => l.method === 'PATCH')).toBe(false);
    expect(screen.getByText(`Việc ${MA}`)).toBeTruthy();
  });

  it('mô tả cũng sửa tại chỗ, và PATCH đúng trường `mo_ta`', async () => {
    const { may } = mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="sua-mo-ta"]')!);
    await userEvent.type(
      document.querySelector<HTMLTextAreaElement>('[data-o-nhap="mo-ta"]')!,
      'Mô tả mới',
    );
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-nut="luu-mo-ta"]')!);

    await vi.waitFor(() => {
      expect(may.da_goi.find((l) => l.method === 'PATCH')?.than).toEqual({ mo_ta: 'Mô tả mới' });
    });
  });
});

/* ================================================================== *
 * F2. Cờ "ticket không code" — migration 0027, T-31 câu 3.4 A
 * ================================================================== */

describe('cờ "ticket không code" — công tắc của chủ ở khối Thuộc tính', () => {
  it('có công tắc nhãn rõ; bấm ⇒ PATCH `{ khong_code: true }` và hiện "Bật" ngay', async () => {
    const { may, kho } = mayChiTiet();
    // Giữ PATCH lại: bản "Bật" phải hiện TRƯỚC khi máy chủ trả lời (d.407).
    let mo: () => void = () => undefined;
    kho.cho = new Promise<unknown>((res) => {
      mo = () => res(null);
    });
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const hang = document.querySelector<HTMLElement>('[data-thuoc-tinh="khong-code"]')!;
    expect(hang.textContent).toContain(NHAN_KHONG_CODE_TICKET);
    const o = hang.querySelector<HTMLInputElement>('[data-o="khong-code"]')!;
    expect(o.checked).toBe(false);

    await userEvent.click(o);
    await vi.waitFor(() => {
      const goi = may.da_goi.find((l) => l.method === 'PATCH');
      expect(goi?.duong).toBe(`/v1/ticket/tk-${MA}`);
      expect(goi?.than).toEqual({ khong_code: true });
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLInputElement>('[data-o="khong-code"]')!.checked,
      ).toBe(true);
    });
    mo();
  });

  it('cờ đang bật ⇒ bấm gửi `{ khong_code: false }`', async () => {
    const { may } = mayChiTiet(manHinhTicket(ticketDayDu({ ma: MA, khong_code: true })));
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const o = document.querySelector<HTMLInputElement>('[data-o="khong-code"]')!;
    expect(o.checked).toBe(true);
    await userEvent.click(o);
    await vi.waitFor(() => {
      expect(may.da_goi.find((l) => l.method === 'PATCH')?.than).toEqual({ khong_code: false });
    });
  });

  it('máy chủ từ chối ⇒ công tắc hoàn lại + toast lý do', async () => {
    const { kho } = mayChiTiet();
    kho.loi = { error: 'FORBIDDEN', message: 'Chỉ chủ bật/tắt được cờ "ticket không code".' };
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();
    kho.choGet = new Promise<unknown>(() => {
      /* không bao giờ mở */
    });

    await userEvent.click(document.querySelector<HTMLInputElement>('[data-o="khong-code"]')!);
    await vi.waitFor(() => {
      expect(screen.getByText('Chỉ chủ bật/tắt được cờ "ticket không code".')).toBeTruthy();
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLInputElement>('[data-o="khong-code"]')!.checked,
      ).toBe(false);
    });
  });

  it('dự án đã "không code" ⇒ hiện câu báo; dự án có code ⇒ không (đối chứng)', async () => {
    mayChiTiet(manHinhTicket(ticketDayDu({ ma: MA, du_an_khong_code: true })));
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();
    expect(document.querySelector('[data-o="du-an-khong-code"]')?.textContent).toBe(
      CAU_DU_AN_KHONG_CODE,
    );
  });

  it('đối chứng: dự án có code ⇒ không có câu báo', async () => {
    mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();
    expect(document.querySelector('[data-o="du-an-khong-code"]')).toBeNull();
  });
});

/* ================================================================== *
 * G. d.412 — mốc máy chủ, không đồng hồ thứ hai
 * ================================================================== */

describe('d.412 — mốc thời gian đếm từ `bay_gio` của máy chủ', () => {
  it('máy khách lệch 10 giờ: chữ tương đối KHÔNG đổi', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), {
        binh_luan: [binhLuan({ id: 'bl', tao_luc: GIO - 2 * GIO_MS })],
      }),
    );
    vi.useFakeTimers({ now: GIO + 10 * GIO_MS, shouldAdvanceTime: true });
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-moc="binh-luan"]')).not.toBeNull();
    });

    const o = document.querySelector('[data-moc="binh-luan"] [data-o="luc"]');
    expect(o?.textContent).toBe('2 giờ trước');
    expect(o?.getAttribute('title')).toContain('giờ Việt Nam');
  });
});

/* ================================================================== *
 * H. d.410 — thay đổi do agent hiện trong 3 giây
 * ================================================================== */

describe('d.410 — thay đổi của agent trên ticket này hiện lên', () => {
  it('chu kỳ hỏi lại ngắn hơn mốc SPEC', () => {
    expect(CHU_KY_LAM_MOI_MS).toBeLessThan(hienThayDoiTuSpec().giay * 1000);
  });

  it('agent nộp báo cáo ⇒ dòng thời gian cập nhật sau một chu kỳ', async () => {
    vi.useFakeTimers();
    const { kho } = mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA }), { luot_giao: [luotGiao({ so_luot: 1 })] }),
    );
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-luot="1"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-o="ket-qua"]')).toBeNull();

    kho.mh = manHinhTicket(ticketDayDu({ ma: MA }), {
      luot_giao: [
        luotGiao({
          so_luot: 1,
          trang_thai: 'submitted',
          nhan_trang_thai: 'Đã nộp',
          bao_cao: { ket_qua: 'done', nhan_ket_qua: 'Xong', nop_luc: GIO },
          nop_luc: GIO,
        }),
      ],
    });
    await vi.advanceTimersByTimeAsync(CHU_KY_LAM_MOI_MS + 50);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-o="ket-qua"]')?.textContent).toBe('Xong');
    });
  });
});

/* ================================================================== *
 * I. d.411 — chi tiết ticket dùng tốt ở 375px
 * ================================================================== */

describe('d.411 — chi tiết ticket ở 375px', () => {
  const VE = specDoiDienThoai();

  it('d.411 có kể "chi tiết ticket" (nếu không, lượt này phủ sai vế)', () => {
    expect(VE.co_chi_tiet_ticket).toBe(true);
    expect(VE.px).toBe(375);
  });

  it('hai cột chỉ bật từ `lg`, mặc định MỘT cột', async () => {
    mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const lop = document.querySelector('[data-o="chi-tiet-ticket"]')?.className ?? '';
    expect(lop).toContain('grid-cols-1');
    // Lưới chống hồi quy: một `grid-cols-3` **không** có tiền tố `lg:` là hai cột
    // ~125px ở 375px.
    expect(/(^|\s)grid-cols-(2|3)(\s|$)/.test(lop)).toBe(false);
    expect(lop).toContain('lg:grid-cols-3');
    // Ô lưới không được đẩy rộng hơn khung.
    expect(lop).toContain('min-w-0');
  });

  it('không lớp nào chốt chiều rộng cứng lớn hơn 375px; mọi hàng nút có flex-wrap', async () => {
    mayChiTiet(
      manHinhTicket(ticketDayDu({ ma: MA, lien_ket: [lienKet('dieu_phoi', 'COS-1')] }), {
        luot_giao: [luotGiao({ so_luot: 1 })],
        ticket_con: [ticketCon('SAI-2')],
        can_chu: [theCanChu({ ma: 'T-7' })],
      }),
    );
    const { container } = dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const qua: string[] = [];
    const thieu_wrap: string[] = [];
    for (const e of [container, ...container.querySelectorAll<HTMLElement>('*')]) {
      // `getAttribute('class')`: icon trạng thái là `<svg>`, `className` của nó là
      // `SVGAnimatedString` (không `.split` được) — cùng nếp `danh-sach-ticket.test.tsx`.
      const cls = e.getAttribute('class') ?? '';
      for (const lop of cls.split(/\s+/)) {
        const khop = /^(?:min-)?w-\[(\d+(?:\.\d+)?)px\]$/.exec(lop);
        if (khop?.[1] !== undefined && Number(khop[1]) > VE.px) qua.push(lop);
      }
      if (e.getAttribute?.('data-hang') === 'nut' && !cls.includes('flex-wrap')) {
        thieu_wrap.push(e.outerHTML.slice(0, 80));
      }
    }
    expect(qua).toEqual([]);
    expect(thieu_wrap).toEqual([]);
  });
});

/* ================================================================== *
 * J. tenTacGia — hàm thuần
 * ================================================================== */

describe('tenTacGia', () => {
  it('chủ, agent, hệ thống, và trống', () => {
    expect(tenTacGia({ loai: 'owner' })).toBe('Chủ (chủ)');
    // d.404 — không bao giờ in id: tra không ra thì "agent", tra ra thì tên.
    expect(tenTacGia({ loai: 'agent', agentId: 'ag-a' })).toBe('agent');
    expect(tenTacGia({ loai: 'agent', agentId: 'ag-a' }, () => 'Ba')).toBe('Ba');
    expect(tenTacGia({ loai: 'agent' })).toBe('agent');
    expect(tenTacGia({ loai: 'system' })).toBe('system');
    expect(tenTacGia(null)).toBe('—');
  });
});

/* ================================================================== *
 * K. Lỗi của máy chủ đi nguyên văn ra màn hình
 * ================================================================== */

describe('ticket không có ⇒ hiện câu của máy chủ', () => {
  it('404 `NOT_FOUND` ⇒ câu tiếng Việt của máy chủ, không câu web tự viết', async () => {
    const may = new MayChuGia();
    may.dat('GET ' + DUONG_MH, {
      http: 404,
      loi: { error: 'NOT_FOUND', message: 'Không tìm thấy ticket.' },
    });
    may.gan();

    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Không tìm thấy ticket.');
    });
  });
});

/* Tên khối dùng trong mô tả `aria-label` — ghim để một lần đổi chữ là có chủ ý. */
describe('tên khối', () => {
  it('mỗi khối có `aria-label` đúng tên của nó', async () => {
    mayChiTiet();
    dung(<TrangChiTietTicket ma={MA} />, `/t/${MA}`);
    await choTai();

    const thieu = Object.values(TEN_KHOI).filter(
      (ten) => screen.queryByRole('region', { name: ten }) === null,
    );
    expect(thieu).toEqual([]);
  });
});

/* Lưới cho chính ca "Lưu": nhãn nút là hằng, không chữ gõ trong ca. */
describe('nhãn nút Lưu', () => {
  it('là hằng của trang', () => {
    expect(NHAN_LUU).toBe('Lưu');
  });
});
