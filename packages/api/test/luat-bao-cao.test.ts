/**
 * **Luật THUẦN của báo cáo sáng / handoff tối** — SPEC mục 11 d.322–336, mục 12
 * d.346, 19.12 câu 60.
 *
 * Không Miniflare, không DB: mọi thứ ở đây là hàm thuần của `@baton/shared`
 * (`bao-cao.ts`) cộng phép đổi múi giờ của hai biểu thức cron. Đường thật (cron →
 * cửa ghi → D1 → kênh giả lập) ở `bao-cao.test.ts`.
 *
 * ## Bảng phủ không được tự xác nhận chính nó
 *
 * Nếp đã chốt (`decisions.md` 01/10, ghi chú reviewer lượt 4): **một phía của một
 * ca là chữ người đọc từ `SPEC.md`, phía kia sinh từ mã**. Nên các danh sách chữ
 * trong file này được **chép tay** từ `SPEC.md` d.322–336 và **không** nhập từ
 * `TIEU_DE_VE_SANG` / `TIEU_DE_VE_TOI` — đổi một tiêu đề vế trong mã là một ca đỏ.
 */

import { describe, expect, it } from 'vitest';
import {
  CAU_CHUA_CO_DE_XUAT,
  CAU_DU_AN_KHONG_CHAY,
  DAU_TRONG_TAM,
  MUI_GIO_CHU_PHUT,
  NHAN_BAO_CAO,
  SO_TRONG_TAM,
  demTrongTamDat,
  dungBaoCaoMd,
  dungBaoCaoSangMd,
  dungBaoCaoToiMd,
  gioDiaPhuong,
  laLoaiBaoCao,
  tinBaoCaoSang,
  tinBaoCaoToi,
  trongGioYenLang,
  trongTamDat,
  type DuLieuBaoCaoSang,
  type DuLieuBaoCaoToi,
  type MucTrongTamBaoCao,
} from '@baton/shared';
import { CRON_BAO_CAO_SANG, CRON_BAO_CAO_TOI } from '../src/cron-bao-cao.js';
import { ruiRoCuaBaoCao } from '../src/doc-bao-cao.js';
import { tinChuaMergeSau7Ngay } from '../src/thong-bao.js';

/* ------------------------------------------------------------------ *
 * Chữ của SPEC — CHÉP TAY từ `SPEC.md`, không nhập từ mã
 * ------------------------------------------------------------------ */

/** d.323–328: sáu vế của "Báo cáo sáng", đúng thứ tự SPEC viết. */
const VE_SANG_THEO_SPEC = [
  'Cần Chủ (đọc trước)',
  'Đề xuất 3 việc trọng tâm hôm nay',
  'Hôm qua đã xong',
  'Đang chạy',
  'Rủi ro và lệch',
  'Quyết định mới trong Nhật ký',
];

/** d.331–334: bốn vế của "Handoff tối", đúng thứ tự SPEC viết. */
const VE_TOI_THEO_SPEC = [
  '3 trọng tâm hôm nay: đạt hay chưa',
  'Trạng thái từng dự án',
  'Chuyển sang mai',
  'Cần Chủ mới phát sinh',
];

/* ------------------------------------------------------------------ *
 * Dữ liệu mẫu
 * ------------------------------------------------------------------ */

function trongTam(thu_tu: number, trang_thai: string): MucTrongTamBaoCao {
  return {
    thu_tu,
    ma: `SAI-${String(thu_tu)}`,
    tieu_de: `Việc ${String(thu_tu)}`,
    nhan_trang_thai: trang_thai === 'done' ? 'Xong' : 'Đang làm',
    dat: trongTamDat(trang_thai),
    ghi_chu: null,
  };
}

function duLieuSang(sua: Partial<DuLieuBaoCaoSang> = {}): DuLieuBaoCaoSang {
  return {
    ngay: '2026-10-06',
    tao_luc: 1_760_000_000_000,
    can_chu: {
      so_cho: 2,
      so_theo_muc: { urgent: 1, today: 1, later: 0 },
      gap_nhat: [{ ma: 'T-7', tieu_de: 'Chốt tên miền', nhan_muc: 'Gấp' }],
    },
    trong_tam: [],
    hom_qua: {
      ngay: '2026-10-05',
      viec: [{ ma: 'SAI-9', tieu_de: 'Dựng cổng bằng chứng', nhan_trang_thai: 'Xong' }],
    },
    dang_chay: [
      { ma: 'SAI-11', tieu_de: 'Trang báo cáo', nhan_trang_thai: 'Đang làm', agent_id: 'ag-w' },
    ],
    rui_ro_va_lech: [{ nhan_loai: 'Bằng chứng trượt', chi_tiet: 'SAI-11 — commit chưa merge' }],
    quyet_dinh_moi: [{ nguoi: 'Chủ', quyet_dinh: 'Dùng D1', vi_sao: 'Đã có sẵn' }],
    ...sua,
  };
}

function duLieuToi(sua: Partial<DuLieuBaoCaoToi> = {}): DuLieuBaoCaoToi {
  return {
    ngay: '2026-10-06',
    tao_luc: 1_760_000_000_000,
    trong_tam: [],
    du_an: [
      {
        ma: 'SAI',
        ten: 'Sample',
        nhan_suc_song: CAU_DU_AN_KHONG_CHAY,
        so_dang_lam: 0,
        so_cho_kiem_chung: 1,
        so_xong_24h: 2,
      },
    ],
    chuyen_sang_mai: [{ ma: 'SAI-12', tieu_de: 'Nhập dữ liệu cũ', nhan_trang_thai: 'Đang làm' }],
    can_chu_moi: [{ ma: 'T-8', tieu_de: 'Chọn gói Cloudflare', nhan_muc: 'Hôm nay' }],
    ...sua,
  };
}

/* ================================================================== *
 * A. Sáu vế của báo cáo sáng — d.322–328
 * ================================================================== */

describe('mục 11 d.322–328 — báo cáo sáng có ĐỦ SÁU vế, đúng thứ tự SPEC', () => {
  it('mỗi vế của d.323–328 có một tiêu đề trong markdown', () => {
    const md = dungBaoCaoSangMd(duLieuSang());
    for (const ve of VE_SANG_THEO_SPEC) {
      expect(md, `vế "${ve}" của SPEC`).toContain(ve);
    }
  });

  it('thứ tự sáu vế trong markdown ĐÚNG thứ tự d.323–328', () => {
    const md = dungBaoCaoSangMd(duLieuSang());
    const vi_tri = VE_SANG_THEO_SPEC.map((ve) => md.indexOf(ve));
    expect(vi_tri.every((v) => v >= 0)).toBe(true);
    // Thứ tự là **nội dung của SPEC** (một báo cáo chủ đọc từ trên xuống), nên nó
    // phải tăng dần nghiêm ngặt.
    expect([...vi_tri].sort((a, b) => a - b)).toEqual(vi_tri);
  });

  it('tiêu đề nói rõ là "Báo cáo sáng" và mang NGÀY (d.336 "lưu theo ngày")', () => {
    const md = dungBaoCaoSangMd(duLieuSang({ ngay: '2026-10-06' }));
    expect(md.split('\n')[0]).toBe(`# ${NHAN_BAO_CAO.sang} — 2026-10-06`);
  });

  it('d.325 — vế "Hôm qua đã xong" nêu ĐÚNG NGÀY hôm qua, không một cửa sổ trượt', () => {
    const md = dungBaoCaoSangMd(duLieuSang());
    // Ngày hôm qua hiện ngay cạnh tiêu đề vế: chủ đọc được báo cáo nói về ngày nào,
    // không phải "24 giờ qua tính từ lúc nào".
    expect(md).toContain('Hôm qua đã xong (2026-10-05)');
    expect(md).toContain('SAI-9');
  });

  it('d.323 — vế Cần Chủ nêu số mục Chờ và 3 mục gấp nhất', () => {
    const md = dungBaoCaoSangMd(duLieuSang());
    expect(md).toContain('Đang chờ: **2** mục');
    expect(md).toContain('T-7');
    expect(md).toContain('Chốt tên miền');
  });

  it('d.326 — ticket Đang làm mà KHÔNG AI CẦM vẫn được nêu, kèm chữ "không ai cầm"', () => {
    const md = dungBaoCaoSangMd(
      duLieuSang({
        dang_chay: [
          { ma: 'SAI-11', tieu_de: 'Trang báo cáo', nhan_trang_thai: 'Đang làm', agent_id: null },
        ],
      }),
    );
    expect(md).toContain('SAI-11');
    expect(md).toContain('không ai cầm');
  });
});

/* ================================================================== *
 * B. d.324 — "chưa có đề xuất" là CHỮ CỦA SPEC
 * ================================================================== */

describe('mục 11 d.324 — chưa ghi trọng tâm thì để trống kèm chữ "chưa có đề xuất"', () => {
  it('hằng mang ĐÚNG chuỗi của SPEC', () => {
    // Phía này là chữ chép tay từ `SPEC.md` d.324; phía kia sinh từ mã.
    expect(CAU_CHUA_CO_DE_XUAT).toBe('chưa có đề xuất');
  });

  it('`trong_tam` rỗng ⇒ báo cáo sáng mang đúng chuỗi đó', () => {
    expect(dungBaoCaoSangMd(duLieuSang({ trong_tam: [] }))).toContain('chưa có đề xuất');
  });

  it('`trong_tam` rỗng ⇒ handoff tối cũng mang đúng chuỗi đó', () => {
    expect(dungBaoCaoToiMd(duLieuToi({ trong_tam: [] }))).toContain('chưa có đề xuất');
  });

  it('có trọng tâm ⇒ KHÔNG còn chuỗi đó (ca đối chứng)', () => {
    const md = dungBaoCaoSangMd(duLieuSang({ trong_tam: [trongTam(1, 'in_progress')] }));
    expect(md).not.toContain('chưa có đề xuất');
    expect(md).toContain('SAI-1');
  });

  it('d.324 nói **3** việc — `SO_TRONG_TAM` là 3', () => {
    expect(SO_TRONG_TAM).toBe(3);
  });
});

/* ================================================================== *
 * C. Bốn vế của handoff tối — d.330–334
 * ================================================================== */

describe('mục 11 d.330–334 — handoff tối có ĐỦ BỐN vế, đúng thứ tự SPEC', () => {
  it('mỗi vế của d.331–334 có một tiêu đề trong markdown', () => {
    const md = dungBaoCaoToiMd(duLieuToi());
    for (const ve of VE_TOI_THEO_SPEC) {
      expect(md, `vế "${ve}" của SPEC`).toContain(ve);
    }
  });

  it('thứ tự bốn vế trong markdown ĐÚNG thứ tự d.331–334', () => {
    const md = dungBaoCaoToiMd(duLieuToi());
    const vi_tri = VE_TOI_THEO_SPEC.map((ve) => md.indexOf(ve));
    expect(vi_tri.every((v) => v >= 0)).toBe(true);
    expect([...vi_tri].sort((a, b) => a - b)).toEqual(vi_tri);
  });

  it('tiêu đề nói rõ là "Handoff tối" và mang NGÀY', () => {
    expect(dungBaoCaoToiMd(duLieuToi()).split('\n')[0]).toBe(
      `# ${NHAN_BAO_CAO.toi} — 2026-10-06`,
    );
  });

  it('d.332 — dự án ⚪ hiện ĐÚNG câu "Dự án không chạy" của d.74', () => {
    expect(dungBaoCaoToiMd(duLieuToi())).toContain('Dự án không chạy');
  });

  it('d.333 — "Chuyển sang mai" nêu ticket còn mở', () => {
    expect(dungBaoCaoToiMd(duLieuToi())).toContain('SAI-12');
  });

  it('d.334 — "Cần Chủ mới phát sinh" nêu mục mới của ngày, kèm nhãn mức', () => {
    const md = dungBaoCaoToiMd(duLieuToi());
    expect(md).toContain('T-8');
    expect(md).toContain('Hôm nay');
  });
});

/* ================================================================== *
 * D. d.331 — "đạt hay chưa" theo TRẠNG THÁI TICKET
 * ================================================================== */

describe('mục 11 d.331 — đạt hay chưa đọc từ `ticket.trang_thai`', () => {
  it('chỉ `done` (Xong) là đạt', () => {
    expect(trongTamDat('done')).toBe(true);
  });

  it('`verifying` (Chờ kiểm chứng) CHƯA đạt — cổng bằng chứng của mục 7 còn ở giữa', () => {
    expect(trongTamDat('verifying')).toBe(false);
  });

  it('`canceled`, `duplicate`, `in_progress`, `todo`, `backlog` đều KHÔNG đạt', () => {
    for (const t of ['canceled', 'duplicate', 'in_progress', 'todo', 'backlog']) {
      expect(trongTamDat(t), t).toBe(false);
    }
  });

  it('mã lạ (dữ liệu nhập của mục 16) ⇒ chưa đạt, không ném lỗi', () => {
    expect(trongTamDat('mot-ma-cu-nao-do')).toBe(false);
  });

  it('markdown đánh dấu từng trọng tâm, và câu tóm là "đạt/tổng"', () => {
    const md = dungBaoCaoToiMd(
      duLieuToi({ trong_tam: [trongTam(1, 'done'), trongTam(2, 'in_progress')] }),
    );
    expect(md).toContain(`1. ${DAU_TRONG_TAM.dat} **SAI-1**`);
    expect(md).toContain(`2. ${DAU_TRONG_TAM.chua} **SAI-2**`);
    expect(md).toContain('đạt hay chưa (1/2)');
  });

  it('`demTrongTamDat` đếm đúng', () => {
    expect(demTrongTamDat([trongTam(1, 'done'), trongTam(2, 'done'), trongTam(3, 'todo')])).toEqual(
      { dat: 2, tong: 3 },
    );
    expect(demTrongTamDat([])).toEqual({ dat: 0, tong: 0 });
  });
});

/* ================================================================== *
 * E. d.336 — xuất ra markdown được
 * ================================================================== */

describe('mục 11 d.336 — báo cáo xuất ra markdown được', () => {
  it('`dungBaoCaoMd` là một cửa duy nhất và chọn đúng khuôn theo loại', () => {
    expect(dungBaoCaoMd('sang', duLieuSang())).toBe(dungBaoCaoSangMd(duLieuSang()));
    expect(dungBaoCaoMd('toi', duLieuToi())).toBe(dungBaoCaoToiMd(duLieuToi()));
  });

  it('chữ ra là markdown thật: tiêu đề `#` và `##`', () => {
    const md = dungBaoCaoSangMd(duLieuSang());
    expect(md.startsWith('# ')).toBe(true);
    expect(md.split('\n').filter((d) => d.startsWith('## ')).length).toBe(
      VE_SANG_THEO_SPEC.length,
    );
  });

  it('hàm dựng chữ là THUẦN: cùng dữ liệu vào ⇒ cùng chữ ra, hai lần gọi', () => {
    const d = duLieuSang();
    expect(dungBaoCaoSangMd(d)).toBe(dungBaoCaoSangMd(d));
  });

  it('`laLoaiBaoCao` nhận đúng hai mã của `CHECK` migration 0020', () => {
    expect(laLoaiBaoCao('sang')).toBe(true);
    expect(laLoaiBaoCao('toi')).toBe(true);
    expect(laLoaiBaoCao('chieu')).toBe(false);
    expect(laLoaiBaoCao(7)).toBe(false);
  });
});

/* ================================================================== *
 * F. Tin Telegram — mục 12 d.346, d.347
 * ================================================================== */

describe('mục 12 d.346 — tin của báo cáo là MỘT DÒNG TÓM, không cả báo cáo', () => {
  it('tin báo cáo sáng ngắn, mang ngày và các con số', () => {
    const tin = tinBaoCaoSang(duLieuSang());
    expect(tin).toContain(NHAN_BAO_CAO.sang);
    expect(tin).toContain('2026-10-06');
    expect(tin).toContain('Cần Chủ đang chờ: 2');
    // Một tin, không một báo cáo: không tiêu đề markdown nào trong đó.
    expect(tin).not.toContain('##');
    // BAT-7: dòng tổng + chi tiết (mẫu: 2 chờ nhưng chỉ có 1 trong danh sách, 1 rủi ro).
    expect(tin.split('\n')).toHaveLength(4);
    expect(tin.endsWith('… và 1 mục khác')).toBe(true);
  });

  it('BAT-7: dòng chi tiết = Cần Chủ đang chờ trước, rủi ro sau (mã ticket: lý do)', () => {
    const tin = tinBaoCaoSang(
      duLieuSang({
        can_chu: {
          so_cho: 1,
          so_theo_muc: { urgent: 1 },
          gap_nhat: [{ ma: 'T-7', tieu_de: 'Chốt tên miền', nhan_muc: 'Gấp' }],
        },
        rui_ro_va_lech: [{ nhan_loai: 'Phiên đứng', chi_tiet: 'x', ma_ticket: 'SAI-11' }],
      }),
    );
    expect(tin.split('\n').slice(1)).toEqual(['T-7: Chốt tên miền', 'SAI-11: Phiên đứng']);
  });

  it('BAT-7: quá 5 dòng ⇒ 4 dòng đầu + "… và N mục khác"', () => {
    const cho = [1, 2, 3, 4, 5].map((n) => ({
      ma: `T-${String(n)}`,
      tieu_de: `Mục ${String(n)}`,
      nhan_muc: 'Gấp',
    }));
    const tin = tinBaoCaoSang(
      duLieuSang({
        can_chu: { so_cho: 8, so_theo_muc: { urgent: 8 }, gap_nhat: cho.slice(0, 3), ds_cho: cho },
        rui_ro_va_lech: [{ nhan_loai: 'Phiên đứng', chi_tiet: 'x', ma_ticket: 'SAI-11' }],
      }),
    );
    const dong = tin.split('\n');
    expect(dong).toHaveLength(6); // 1 dòng tổng + 5 dòng chi tiết
    expect(dong.slice(1, 5)).toEqual(['T-1: Mục 1', 'T-2: Mục 2', 'T-3: Mục 3', 'T-4: Mục 4']);
    expect(dong[5]).toBe('… và 5 mục khác'); // 8 chờ + 1 rủi ro = 9, hiện 4
  });

  it('BAT-7: handoff tối cũng có dòng chi tiết; dữ liệu cũ (không có trường mới) chỉ còn dòng tổng', () => {
    const cu = tinBaoCaoToi(duLieuToi());
    expect(cu.split('\n')).toHaveLength(1);
    const moi = tinBaoCaoToi(
      duLieuToi({
        so_can_chu_cho: 1,
        ds_can_chu_cho: [{ ma: 'T-8', tieu_de: 'Chọn gói', nhan_muc: 'Gấp' }],
        rui_ro_va_lech: [{ nhan_loai: 'Bằng chứng trượt', chi_tiet: 'x', ma_ticket: 'SAI-3' }],
      }),
    );
    expect(moi.split('\n').slice(1)).toEqual(['T-8: Chọn gói', 'SAI-3: Bằng chứng trượt']);
  });

  it('BAT-7: rủi ro và lệch KHÔNG đếm ticket đã Xong/Huỷ', () => {
    const tk = (ma: string, trang_thai: string) => ({
      id: `id-${ma}`,
      ma,
      tieu_de: 't',
      project_id: 'p',
      trang_thai,
      nhan_trang_thai: trang_thai,
    });
    const ly = (ma: string, trang_thai: string) => ({
      loai: 'bang_chung_truot' as const,
      nhan_loai: 'Bằng chứng trượt',
      luc: 1,
      ticket: tk(ma, trang_thai),
      luot_giao: null,
      phien: null,
      bang_chung: null,
      thong_bao: null,
    });
    const nhom = (ma: string, trang_thai: string) => ({
      khoa: `tk:${ma}`,
      ticket: tk(ma, trang_thai),
      luc: 1,
      ly_do: [ly(ma, trang_thai)],
    });
    const ra = ruiRoCuaBaoCao([
      nhom('SAI-1', 'in_progress'),
      nhom('SAI-2', 'done'),
      nhom('SAI-3', 'canceled'),
      nhom('SAI-4', 'verifying'),
      nhom('SAI-5', 'duplicate'),
    ]);
    // BAT-10: `duplicate` (Trùng) cũng đã đóng, không phải rủi ro.
    expect(ra.map((d) => d.ma_ticket)).toEqual(['SAI-1', 'SAI-4']);
  });

  it('tin handoff tối mang tỉ lệ trọng tâm đạt', () => {
    const tin = tinBaoCaoToi(duLieuToi({ trong_tam: [trongTam(1, 'done'), trongTam(2, 'todo')] }));
    expect(tin).toContain(NHAN_BAO_CAO.toi);
    expect(tin).toContain('trọng tâm đạt 1/2');
    expect(tin.split('\n')[0]).toContain('trọng tâm đạt 1/2');
  });

  it('BAT-7: tin "chưa merge sau 7 ngày" nêu mã ticket; thiếu mã thì rơi về id', () => {
    const goc = { bang_chung_id: 'bc-1', ticket_id: 'tk-uuid', commit_hash: 'abc', repo: null, luc: 1 };
    expect(tinChuaMergeSau7Ngay({ ...goc, ticket_ma: 'BAT-5' }).noi_dung).toContain('ticket BAT-5:');
    const roi = tinChuaMergeSau7Ngay(goc).noi_dung;
    expect(roi).toContain('ticket tk-uuid:');
  });

  it('chưa có trọng tâm ⇒ tin nói đúng chữ "chưa có đề xuất" của d.324', () => {
    expect(tinBaoCaoToi(duLieuToi({ trong_tam: [] }))).toContain('chưa có đề xuất');
  });
});

/* ================================================================== *
 * G. 19.12 câu 60 — hai biểu thức cron là PHÉP ĐỔI MÚI GIỜ
 * ================================================================== */

describe('19.12 câu 60 — hai nhịp cron đúng 07:30 / 20:00 GIỜ CHỦ', () => {
  /**
   * Mốc epoch của một lượt cron `"<phút> <giờ> * * *"` trong một ngày bất kỳ.
   *
   * Biểu thức cron của Cloudflare là **UTC**, nên `Date.UTC` ở đây là đúng nghĩa,
   * không một phép xấp xỉ.
   */
  function mocCua(bieu_thuc: string): number {
    const [phut, gio] = bieu_thuc.split(' ');
    return Date.UTC(2026, 9, 6, Number(gio), Number(phut));
  }

  /*
   * **Phía "mong đợi" là chữ chép tay từ SPEC** ("tự sinh lúc 07:30" d.322, "tự
   * sinh lúc 20:00" d.330); phía "nhận được" tính **qua `MUI_GIO_CHU_PHUT`** từ
   * chính hai hằng của mã. Không viết tay số 7 ở đâu cả — nên nếu một lượt sau đổi
   * hằng múi giờ mà quên hai biểu thức cron, hai ca dưới đây **đỏ**.
   */
  it('d.322 — `CRON_BAO_CAO_SANG` rơi đúng 07:30 giờ chủ', () => {
    const moc = mocCua(CRON_BAO_CAO_SANG);
    expect(gioDiaPhuong(moc, MUI_GIO_CHU_PHUT)).toBe(7);
    // Phút cũng phải đúng: `gioDiaPhuong` chỉ trả giờ.
    expect(new Date(moc + MUI_GIO_CHU_PHUT * 60_000).getUTCMinutes()).toBe(30);
  });

  it('d.330 — `CRON_BAO_CAO_TOI` rơi đúng 20:00 giờ chủ', () => {
    const moc = mocCua(CRON_BAO_CAO_TOI);
    expect(gioDiaPhuong(moc, MUI_GIO_CHU_PHUT)).toBe(20);
    expect(new Date(moc + MUI_GIO_CHU_PHUT * 60_000).getUTCMinutes()).toBe(0);
  });

  it('hai nhịp KHÁC nhau và không trùng nhịp nào của phần trước', () => {
    expect(CRON_BAO_CAO_SANG).not.toBe(CRON_BAO_CAO_TOI);
    for (const cu of ['* * * * *', '*/5 * * * *', '*/10 * * * *']) {
      expect([CRON_BAO_CAO_SANG, CRON_BAO_CAO_TOI]).not.toContain(cu);
    }
  });

  /* ---------------------------------------------------------------- *
   * d.347 — giờ yên lặng: một KẾT LUẬN, nên nó phải có ca canh
   * ---------------------------------------------------------------- */

  it('d.347 — hai mốc sinh báo cáo đều NGOÀI giờ yên lặng 23:00–07:00', () => {
    /*
     * Hai báo cáo mang `uu_tien = 'thuong'`, nên nếu chúng rơi vào giờ yên lặng thì
     * tin bị **hoãn tới 07:00** — đúng SPEC, nhưng một "báo cáo sáng 07:30" tới lúc
     * 07:00 hôm sau thì vô nghĩa. Nên "ở ngoài khung" là một điều kiện thật của mục
     * 11, và ca này là chỗ canh nó: đổi `GIO_YEN_LANG_KET_THUC` lên 8 là ca đỏ.
     */
    expect(trongGioYenLang(mocCua(CRON_BAO_CAO_SANG), MUI_GIO_CHU_PHUT)).toBe(false);
    expect(trongGioYenLang(mocCua(CRON_BAO_CAO_TOI), MUI_GIO_CHU_PHUT)).toBe(false);
  });
});

/* ================================================================== *
 * BAT-8 — dòng cảnh báo sao lưu (mục 15 d.429) trong CẢ HAI báo cáo
 * ================================================================== */

describe('BAT-8 — dòng cảnh báo sao lưu: có `canh_bao_sao_luu` thì có dòng, không thì không', () => {
  const CANH_BAO = '⚠️ Sao lưu 2026-10-06 chưa có (bản sao lưu tự động không thấy trên R2).';

  /** Số dòng của một chuỗi đúng bằng câu cảnh báo. */
  const soDong = (chu: string): number => chu.split('\n').filter((d) => d === CANH_BAO).length;

  it('handoff tối — markdown: đúng MỘT dòng, đứng sau tiêu đề và TRƯỚC vế đầu', () => {
    const md = dungBaoCaoToiMd(duLieuToi({ canh_bao_sao_luu: CANH_BAO }));
    expect(soDong(md)).toBe(1);
    expect(md.indexOf(CANH_BAO)).toBeGreaterThan(md.indexOf(`# ${NHAN_BAO_CAO.toi}`));
    expect(md.indexOf(CANH_BAO)).toBeLessThan(md.indexOf(`## ${VE_TOI_THEO_SPEC[0] ?? ''}`));
  });

  it('handoff tối — markdown: KHÔNG có trường thì không dòng nào, và chữ y như trước BAT-8', () => {
    const khong = dungBaoCaoToiMd(duLieuToi());
    expect(khong).not.toContain('Sao lưu');
    // Trường rỗng cũng không sinh dòng trống thừa.
    expect(dungBaoCaoToiMd(duLieuToi({ canh_bao_sao_luu: '' }))).toBe(khong);
  });

  it('handoff tối — tin: đúng MỘT dòng ngay dưới dòng tổng; không có trường thì không có', () => {
    const tin = tinBaoCaoToi(duLieuToi({ canh_bao_sao_luu: CANH_BAO }));
    expect(soDong(tin)).toBe(1);
    expect(tin.split('\n')[1]).toBe(CANH_BAO);
    expect(tinBaoCaoToi(duLieuToi())).not.toContain('Sao lưu');
  });

  it('báo cáo sáng — markdown và tin: cùng luật hai chiều', () => {
    const md = dungBaoCaoSangMd(duLieuSang({ canh_bao_sao_luu: CANH_BAO }));
    expect(soDong(md)).toBe(1);
    expect(md.indexOf(CANH_BAO)).toBeLessThan(md.indexOf(`## ${VE_SANG_THEO_SPEC[0] ?? ''}`));
    expect(dungBaoCaoSangMd(duLieuSang())).not.toContain('Sao lưu');

    const tin = tinBaoCaoSang(duLieuSang({ canh_bao_sao_luu: CANH_BAO }));
    expect(tin.split('\n')[1]).toBe(CANH_BAO);
    expect(tinBaoCaoSang(duLieuSang())).not.toContain('Sao lưu');
  });
});
