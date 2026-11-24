/**
 * **Ô trả lời hàng loạt** — SPEC mục 8 d.271.
 *
 * Đây là chỗ dễ nhất trong cả giao diện để một lỗi **âm thầm áp sai phương án**:
 * một dòng hiểu lệch vẫn chạy thành công, vẫn ghi một dòng Nhật ký không sửa
 * được (d.309), vẫn bình luận lên ticket. Nên mỗi ca biên ở đây đo **đúng một**
 * điều và đo cả **vì sao** (hằng `LY_DO` nào), không chỉ "hiểu / không hiểu":
 * hai ca biên khác nhau rơi vào cùng một câu chung chung là hai ca không phân
 * biệt được.
 */

import { describe, expect, it } from 'vitest';
import {
  LY_DO,
  coTheAp,
  soTCuaTieuDe,
  tachHangLoat,
  type DongHangLoat,
  type MucBiet,
} from '../src/tra-loi-hang-loat';
import { specDoiOHangLoat } from './doc-spec';

/* ------------------------------------------------------------------ *
 * Lưới của chính file này: d.271 có đúng ba vế mà bộ tách đang cài?
 * ------------------------------------------------------------------ */

describe('d.271 — ba vế của câu SPEC, cắt ra từ SPEC.md', () => {
  it('parser đọc được cả ba vế (tách mã · xem trước rồi áp một lần · báo đỏ không áp)', () => {
    expect(specDoiOHangLoat()).toEqual({ tach_ma: true, xem_truoc: true, bao_do: true });
  });
});

/* ------------------------------------------------------------------ *
 * Bảng mục mà màn hình đang biết
 * ------------------------------------------------------------------ */

const MUC: MucBiet[] = [
  { id: 'ct-18', ma: 'T-18', tieu_de: 'Xem bản nháp', loai: 'fyi', trang_thai: 'open', nhan_phuong_an: [] },
  {
    id: 'ct-52',
    ma: 'T-52',
    tieu_de: 'Chọn CSDL',
    loai: 'decision',
    trang_thai: 'open',
    nhan_phuong_an: ['A', 'B'],
  },
  {
    id: 'ct-60',
    ma: 'T-60',
    tieu_de: 'Chạy migration',
    loai: 'run_command',
    trang_thai: 'open',
    nhan_phuong_an: [],
  },
  { id: 'ct-70', ma: 'T-70', tieu_de: 'Duyệt PR', loai: 'review', trang_thai: 'open', nhan_phuong_an: [] },
  {
    id: 'ct-99',
    ma: 'T-99',
    tieu_de: 'Đã xong rồi',
    loai: 'fyi',
    trang_thai: 'resolved',
    nhan_phuong_an: [],
  },
];

function mot(dong: string): DongHangLoat {
  const ra = tachHangLoat(dong, MUC);
  expect(ra.length).toBe(1);
  return ra[0]!;
}

function loi(dong: string): string {
  const d = mot(dong);
  if (d.hieu) throw new Error(`Dòng \`${dong}\` lại được hiểu: ${JSON.stringify(d.than)}`);
  return d.ly_do;
}

/* ================================================================== *
 * A. Hai ví dụ NGUYÊN VĂN của d.271
 * ================================================================== */

describe('hai ví dụ của SPEC chạy đúng', () => {
  it('`T-18: đã xem` — chữ tự do thành ghi thêm', () => {
    const d = mot('T-18: đã xem');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.id).toBe('ct-18');
    expect(d.than).toEqual({ ghi_them: 'đã xem' });
  });

  it('`T-52: A, ngưỡng 500` — khớp phương án A, phần sau là ghi thêm', () => {
    const d = mot('T-52: A, ngưỡng 500');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ phuong_an: 'A', ghi_them: 'ngưỡng 500' });
    // Chữ xem trước phải nói đúng thứ sẽ gửi, nếu không "cho xem trước" vô nghĩa.
    expect(d.tom_tat).toBe('A, ngưỡng 500');
  });

  it('`T-52: B` — chỉ phương án, không ghi thêm', () => {
    const d = mot('T-52: B');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ phuong_an: 'B' });
  });
});

/* ================================================================== *
 * B. Khoảng trắng, hoa/thường, dòng rỗng
 * ================================================================== */

describe('khoảng trắng · hoa/thường · dòng rỗng', () => {
  it('khoảng trắng quanh mã, quanh dấu hai chấm và cuối dòng đều bỏ qua được', () => {
    const d = mot('   T-52  :   a ,  ngưỡng 500   ');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    // Nhãn phương án **viết thường** vẫn hiểu, và đi lên thành chữ hoa: cùng
    // luật mà `kiemKetQuaXuLy` của máy chủ đã cài (`nhan_gui.toUpperCase()`).
    expect(d.than).toEqual({ phuong_an: 'A', ghi_them: 'ngưỡng 500' });
  });

  it('mã viết thường (`t-18`) vẫn khớp', () => {
    const d = mot('t-18: đã xem');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.ma).toBe('T-18');
  });

  it('dòng rỗng và dòng chỉ có khoảng trắng bị BỎ QUA, không thành dòng đỏ', () => {
    const ra = tachHangLoat('\nT-18: đã xem\n   \n\nT-60: ok\n', MUC);
    expect(ra.length).toBe(2);
    expect(ra.every((d) => d.hieu)).toBe(true);
  });
});

/* ================================================================== *
 * C. Năm ca "không hiểu" — mỗi ca một lý do RIÊNG
 * ================================================================== */

describe('d.271 — dòng không hiểu thì báo đỏ, mỗi ca một lý do riêng', () => {
  it('mã không tồn tại trên màn hình', () => {
    expect(loi('T-404: đã xem')).toBe(LY_DO.khong_co_ma('T-404'));
  });

  it('chữ cái không phải phương án CỦA MỤC ĐÓ', () => {
    // T-52 chỉ có A và B; `C` là một nhãn hợp lệ ở nơi khác, nên đây đúng là ca
    // mà một phép kiểm "có phải chữ cái A–E không" sẽ cho qua.
    expect(loi('T-52: C, ngưỡng 500')).toBe(LY_DO.khong_co_phuong_an('C', ['A', 'B']));
  });

  it('`T-18:` không có nội dung', () => {
    expect(loi('T-18:')).toBe(LY_DO.thieu_noi_dung);
    expect(loi('T-18:    ')).toBe(LY_DO.thieu_noi_dung);
  });

  it('`T-18 đã xem` — thiếu dấu hai chấm nay HIỂU ĐƯỢC, không còn là một lỗi', () => {
    /*
     * Nới 11/10: dấu hai chấm là tuỳ chọn, nên `LY_DO.thieu_dau_hai_cham` không
     * còn tồn tại. Ca này giữ lại nguyên dòng cũ nhưng đổi vế mong đợi — để một
     * lượt sau siết lại thì nó đỏ, chứ không im lặng mất.
     */
    const d = mot('T-18 đã xem');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.ma).toBe('T-18');
    expect(d.than).toEqual({ ghi_them: 'đã xem' });
    expect(Object.keys(LY_DO)).not.toContain('thieu_dau_hai_cham');
  });

  it('một dòng ĐẦU TIÊN không có hình gì — `khong_hieu_dang`', () => {
    // Không có dòng-có-mã nào trước nó, nên không nối vào đâu được (xem mục F).
    expect(loi('đã xem hết rồi')).toBe(LY_DO.khong_hieu_dang);
  });

  it('19.10 d.551 — hai dòng CÙNG một mã: CẢ HAI dòng đều đỏ, không áp dòng nào', () => {
    /*
     * Đỏ riêng dòng thứ hai là cái bẫy: chủ thấy một dòng đỏ, xoá đúng dòng đó
     * rồi áp — và dòng còn lại ("đã xem") là dòng chủ KHÔNG định giữ.
     */
    const ra = tachHangLoat('T-18: đã xem\nT-18: đã xem lần nữa', MUC);
    expect(ra.length).toBe(2);
    expect(ra.map((d) => d.hieu)).toEqual([false, false]);
    expect(ra.map((d) => (d.hieu === false ? d.ly_do : ''))).toEqual([
      LY_DO.trung_ma('T-18'),
      LY_DO.trung_ma('T-18'),
    ]);
    expect(coTheAp(ra)).toBe(false);
  });

  it('d.551 — ba dòng cùng mã thì cả ba đỏ, các mã khác không bị kéo theo', () => {
    const ra = tachHangLoat('T-18: a\nT-60: ok\nT-18: b\nT-18: c', MUC);
    expect(ra.map((d) => d.hieu)).toEqual([false, true, false, false]);
  });

  it('d.551 — dòng SAI trước (`T-52: Z`) rồi dòng đúng (`T-52: A`): cả hai vẫn đỏ', () => {
    /*
     * Lượt đếm phải chạy TRƯỚC khi hiểu dòng. Nếu "đã gặp" chỉ ghi ở nhánh
     * thành công thì dòng đầu đỏ vì nhãn sai, dòng sau **được nhận** — tức một
     * mục bị áp dù lần dán có hai dòng cùng mã.
     */
    const ra = tachHangLoat('T-52: Z\nT-52: A', MUC);
    expect(ra.map((d) => d.hieu)).toEqual([false, false]);
    expect(ra.map((d) => (d.hieu === false ? d.ly_do : ''))).toEqual([
      LY_DO.trung_ma('T-52'),
      LY_DO.trung_ma('T-52'),
    ]);
  });

  it('mục ĐÃ XỬ LÝ rồi — không áp, và lý do chỉ đúng việc phải làm (mở lại)', () => {
    expect(loi('T-99: đã xem')).toBe(LY_DO.da_xu_ly('T-99'));
  });
});

/* ================================================================== *
 * D. Mục `review` — chỗ SPEC im lặng (cau-hoi-spec.md #107)
 * ================================================================== */

describe('mục `review` trong ô hàng loạt — hướng tạm, có test', () => {
  it('`T-70: Đạt` thành `ket_luan: dat`', () => {
    const d = mot('T-70: Đạt');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ ket_luan: 'dat' });
  });

  it('`T-70: Cần sửa, thiếu test` thành `can_sua` kèm ghi chú', () => {
    const d = mot('T-70: Cần sửa, thiếu test');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ ket_luan: 'can_sua', ghi_them: 'thiếu test' });
  });

  it('`Cần sửa` mà KHÔNG ghi chú bị chặn ngay ở xem trước (d.261)', () => {
    expect(loi('T-70: Cần sửa')).toBe(LY_DO.review_can_sua_can_ghi_chu);
  });

  it('một chữ tự do trên mục review là dòng KHÔNG hiểu, không gửi đi để nhận lỗi', () => {
    expect(loi('T-70: xem rồi')).toBe(LY_DO.review_can_ket_luan);
  });
});

/* ================================================================== *
 * D2. `decision` — trả lời TỰ DO được, nhưng nhãn SAI vẫn đỏ
 *     (`cau-hoi-spec.md` #121)
 * ================================================================== */

describe('#121 — mục `decision` nhận một câu trả lời tự do', () => {
  it('`T-52: đã xem` — không nhãn nào ở đầu ⇒ trả lời TỰ DO, không đỏ', () => {
    const d = mot('T-52: đã xem');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ ghi_them: 'đã xem' });
    // `tomTat` phải hiện rõ câu trả lời, nếu không bản xem trước nói sai thứ gửi.
    expect(d.tom_tat).toBe('đã xem');
  });

  it('`T-52: làm trước tính năng…` — câu tự do dài vẫn hiểu', () => {
    const d = mot('T-52: làm trước tính năng, chưa cần đo gì');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ ghi_them: 'làm trước tính năng, chưa cần đo gì' });
  });

  /*
   * **Ba đường của `thanCuaDong`, phân biệt bằng HÌNH của dòng.** Ba ca dưới đây
   * đo đúng ba đường đó, và ca thứ ba là **vế còn sót** của cái bug lượt này đi
   * chữa: chủ gõ tiếng Việt nên không vấp hôm 11/10, nhưng một câu mở đầu bằng
   * một chữ cái rời vẫn bị chặn.
   */
  it('đường 1 — nhãn CÓ THẬT: `T-52: A ngưỡng 500` vẫn khớp A (d.271 không mất vế nào)', () => {
    const d = mot('T-52: A ngưỡng 500');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ phuong_an: 'A', ghi_them: 'ngưỡng 500' });
  });

  it('đường 1 — `T-52: a nữa`: nhãn A có thật nên vẫn là phương án A, KHÔNG đổi chiều', () => {
    const d = mot('T-52: a nữa');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ phuong_an: 'A', ghi_them: 'nữa' });
  });

  it('đường 3 — `T-52: I think we should…`: câu tự do, KHÔNG đỏ, không mất chữ `I`', () => {
    const d = mot('T-52: I think we should đo trước');
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    // Nội dung là **cả câu**, kể cả chữ cái đầu.
    expect(d.than).toEqual({ ghi_them: 'I think we should đo trước' });
  });

  it('đường 3 — một chữ cái lạ rồi khoảng trắng rồi chữ, trên mục KHÔNG có nhãn đó', () => {
    // `T-70` ở `MUC` là `review`; dựng riêng một mục `decision` chỉ có nhãn B để
    // ca này đo đúng ca "chữ cái `a` không phải nhãn của mục này".
    const chi_b: MucBiet[] = [
      {
        id: 'ct-b',
        ma: 'T-80',
        tieu_de: 'Chỉ có B',
        loai: 'decision',
        trang_thai: 'open',
        nhan_phuong_an: ['B'],
      },
    ];
    const d = tachHangLoat('T-80: a nữa thì sao', chi_b)[0]!;
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.than).toEqual({ ghi_them: 'a nữa thì sao' });
  });

  it('đường 2 — `T-52: Z` (một chữ, hết dòng) ⇒ VẪN ĐỎ', () => {
    expect(loi('T-52: Z')).toBe(LY_DO.khong_co_phuong_an('Z', ['A', 'B']));
  });

  it('GIỮ ĐỎ: `T-52: Z, ngưỡng 500` — nhãn đứng một mình nhưng không có thật', () => {
    /*
     * Hai ca đi hai đường, và đó là **cả điểm** của #121: ở đây hình của dòng
     * nói rõ chủ ĐỊNH chọn một phương án và gõ sai nhãn. Biến nó thành một câu
     * trả lời tự do `"Z, ngưỡng 500"` là âm thầm áp sai.
     */
    expect(loi('T-52: Z, ngưỡng 500')).toBe(LY_DO.khong_co_phuong_an('Z', ['A', 'B']));
  });

  it('`LY_DO.decision_can_phuong_an` đã bỏ — không còn ca nào rơi vào nó', () => {
    expect(Object.keys(LY_DO)).not.toContain('decision_can_phuong_an');
  });
});

/* ================================================================== *
 * F. Mã lỏng · dòng NỐI TIẾP · số T ở đầu tiêu đề (nới 11/10)
 * ================================================================== */

describe('mã lỏng hơn — `T106`, `t-106`, `T 106`, `T–106` cùng một mã', () => {
  const MUC_106: MucBiet[] = [
    { id: 'ct-106', ma: 'T-106', tieu_de: 'Việc 106', loai: 'fyi', trang_thai: 'open', nhan_phuong_an: [] },
  ];

  it('bốn cách gõ cho CÙNG một kết quả', () => {
    const ra = ['T-106: ok', 'T106: ok', 't-106: ok', 'T 106: ok', 'T–106: ok'].map((v) => {
      const d = tachHangLoat(v, MUC_106)[0]!;
      expect(d.hieu, v).toBe(true);
      return d.hieu ? { ma: d.ma, id: d.id, than: d.than } : null;
    });
    for (const x of ra) expect(x).toEqual({ ma: 'T-106', id: 'ct-106', than: { ghi_them: 'ok' } });
  });

  it('`T 106 ok` — không dấu nối, không dấu hai chấm', () => {
    const d = tachHangLoat('T 106 ok', MUC_106)[0]!;
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.ma).toBe('T-106');
    expect(d.than).toEqual({ ghi_them: 'ok' });
  });

  it('một dòng chữ mở đầu bằng `t` nhưng không có số thì KHÔNG thành mã', () => {
    expect(loi('tới 500 là ổn')).toBe(LY_DO.khong_hieu_dang);
  });
});

describe('dòng không có mã = NỐI TIẾP dòng trước (trả lời nhiều dòng)', () => {
  const MUC_106: MucBiet[] = [
    { id: 'ct-106', ma: 'T-106', tieu_de: 'Việc 106', loai: 'fyi', trang_thai: 'open', nhan_phuong_an: [] },
    { id: 'ct-60', ma: 'T-60', tieu_de: 'Việc 60', loai: 'run_command', trang_thai: 'open', nhan_phuong_an: [] },
  ];

  it('đúng khối chủ dán hôm 11/10: MỘT dòng hiểu, nội dung hai dòng nối bằng \\n', () => {
    const ra = tachHangLoat('T106 làm trước tính năng…\nrồi mới tới phần báo cáo', MUC_106);
    expect(ra.length).toBe(1);
    const d = ra[0]!;
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.ma).toBe('T-106');
    expect(d.than).toEqual({ ghi_them: 'làm trước tính năng…\nrồi mới tới phần báo cáo' });
    // Bảng xem trước hiện **cả khối**, một hàng cho mỗi mục.
    expect(d.dong).toBe('T106 làm trước tính năng…\nrồi mới tới phần báo cáo');
  });

  it('ba dòng nối tiếp vẫn là một mục, và KHÔNG tính là mã lặp (d.551)', () => {
    const ra = tachHangLoat('T-60: chạy rồi\ndòng hai\ndòng ba', MUC_106);
    expect(ra.length).toBe(1);
    expect(ra[0]!.hieu).toBe(true);
    expect(coTheAp(ra)).toBe(true);
  });

  it('dòng trống GIỮA khối vẫn bị bỏ, phần sau vẫn nối vào mục trên', () => {
    const ra = tachHangLoat('T-60: chạy rồi\n\n   \ndòng hai', MUC_106);
    expect(ra.length).toBe(1);
    const d = ra[0]!;
    expect(d.hieu && d.than).toEqual({ ghi_them: 'chạy rồi\ndòng hai' });
  });

  it('dòng ĐẦU TIÊN không có mã ⇒ vẫn đỏ, và các dòng sau không bị kéo theo', () => {
    const ra = tachHangLoat('làm trước đi\nT-60: chạy rồi\ndòng hai', MUC_106);
    expect(ra.length).toBe(2);
    expect(ra.map((d) => d.hieu)).toEqual([false, true]);
    expect(ra[0]!.hieu === false && ra[0]!.ly_do).toBe(LY_DO.khong_hieu_dang);
  });

  it('mã KHÔNG tồn tại: đỏ đúng DÒNG ĐẦU của khối, không dòng nối tiếp', () => {
    const ra = tachHangLoat('T-999: gì đó\ndòng nối tiếp', MUC_106);
    expect(ra.length).toBe(1);
    const d = ra[0]!;
    expect(d.hieu).toBe(false);
    if (d.hieu) return;
    expect(d.ly_do).toBe(LY_DO.khong_co_ma('T-999'));
    expect(d.dong.startsWith('T-999: gì đó')).toBe(true);
  });
});

describe('lối tạm — khớp số T ghi ở ĐẦU TIÊU ĐỀ', () => {
  const MUC_TD: MucBiet[] = [
    {
      id: 'ct-2',
      ma: 'T-2',
      tieu_de: 'T-106 · Gộp cron về một nhịp',
      loai: 'fyi',
      trang_thai: 'open',
      nhan_phuong_an: [],
    },
  ];

  it('gõ `T106` (số ở đầu tiêu đề) khớp đúng mục có mã `T-2`', () => {
    const d = tachHangLoat('T106: ok', MUC_TD)[0]!;
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.id).toBe('ct-2');
    // `ma` trả về là **mã Baton của mục**, không chữ chủ gõ: đó là mã đi vào
    // đường gọi và vào mọi dòng Nhật ký.
    expect(d.ma).toBe('T-2');
  });

  it('gõ `T-2` (mã Baton) cũng khớp đúng mục đó', () => {
    const d = tachHangLoat('T-2: ok', MUC_TD)[0]!;
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.id).toBe('ct-2');
  });

  it('MÃ BATON THẮNG: mục mã `T-5` và mục khác tiêu đề `"T-5 · …"`', () => {
    const hai: MucBiet[] = [
      { id: 'ct-5', ma: 'T-5', tieu_de: 'Việc năm', loai: 'fyi', trang_thai: 'open', nhan_phuong_an: [] },
      {
        id: 'ct-9',
        ma: 'T-9',
        tieu_de: 'T-5 · số cũ của chủ',
        loai: 'fyi',
        trang_thai: 'open',
        nhan_phuong_an: [],
      },
    ];
    const d = tachHangLoat('T-5: ok', hai)[0]!;
    expect(d.hieu).toBe(true);
    if (!d.hieu) return;
    expect(d.id).toBe('ct-5');
  });

  it('HAI mục cùng số ở đầu tiêu đề ⇒ ĐỎ, lý do nói rõ là nhập nhằng', () => {
    const hai: MucBiet[] = [
      {
        id: 'ct-2',
        ma: 'T-2',
        tieu_de: 'T-106 · bản một',
        loai: 'fyi',
        trang_thai: 'open',
        nhan_phuong_an: [],
      },
      {
        id: 'ct-3',
        ma: 'T-3',
        tieu_de: 'T106 bản hai',
        loai: 'fyi',
        trang_thai: 'open',
        nhan_phuong_an: [],
      },
    ];
    const d = tachHangLoat('T106: ok', hai)[0]!;
    expect(d.hieu).toBe(false);
    if (d.hieu) return;
    expect(d.ly_do).toBe(LY_DO.ma_nhap_nhang('T-106', 2));
  });

  it('số T phải ở NGAY ĐẦU tiêu đề và có dấu ngắt sau nó', () => {
    expect(soTCuaTieuDe('T-106 · Gộp cron')).toBe('T-106');
    expect(soTCuaTieuDe('T106 bản hai')).toBe('T-106');
    expect(soTCuaTieuDe('T-106: gì đó')).toBe('T-106');
    expect(soTCuaTieuDe('T-106')).toBe('T-106');
    // Không ở đầu, và không có dấu ngắt ⇒ không nhận (nếu không `T1000 dòng log`
    // sẽ khớp cả `T-1` lẫn `T-10`).
    expect(soTCuaTieuDe('Gộp cron T-106')).toBe(null);
    expect(soTCuaTieuDe('T1000abc')).toBe(null);
    expect(soTCuaTieuDe('Việc 106')).toBe(null);
  });
});

/* ================================================================== *
 * E. "Áp một lần" — một dòng đỏ chặn cả lô
 * ================================================================== */

describe('d.271 — "cho xem trước rồi áp một lần", dòng không hiểu thì KHÔNG áp', () => {
  it('cả lô hiểu được ⇒ áp được', () => {
    expect(coTheAp(tachHangLoat('T-18: đã xem\nT-60: ok', MUC))).toBe(true);
  });

  it('MỘT dòng không hiểu ⇒ cả lô không áp (ca phủ định thật)', () => {
    const ra = tachHangLoat('T-18: đã xem\nT-404: đã xem\nT-60: ok', MUC);
    expect(ra.filter((d) => d.hieu).length).toBe(2);
    expect(coTheAp(ra)).toBe(false);
  });

  it('ô rỗng ⇒ không áp (không phải "áp 0 mục thành công")', () => {
    expect(coTheAp(tachHangLoat('', MUC))).toBe(false);
    expect(coTheAp(tachHangLoat('   \n\n', MUC))).toBe(false);
  });
});
