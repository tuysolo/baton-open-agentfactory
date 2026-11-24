/**
 * **Luật thuần của danh sách / bảng ticket** — SPEC mục 14 d.396, d.397, d.409,
 * d.412, cộng hai mảnh đỡ (`loc-ticket.ts`, `khung-cuon.ts`).
 *
 * Ở đây **không** có DOM: mọi ca là một hàm vào–ra. Nhờ vậy các luật khó thấy
 * nhất (thứ tự nhóm, phá vỡ hoà của dòng trộn, "kéo vào đúng cột đang ở thì không
 * gọi máy chủ", dữ liệu `localStorage` hỏng) có ca riêng, không phải suy ra từ
 * việc một màn hình có hiện gì hay không.
 *
 * Bảng nhãn và danh sách bộ lọc được **cắt từ `SPEC.md`** (`doc-spec.ts`), không
 * gõ lại: một ca so mã với một bản chép của mã vẫn xanh khi cả hai cùng lệch khỏi
 * SPEC.
 */

import { describe, expect, it } from 'vitest';
import {
  COT_BANG,
  GIA_TRI_BAT,
  KHOA_LOC_TICKET,
  KHOA_VIEW,
  KHOA_XEM,
  NHAN_TAT_CA_DU_AN,
  NHAN_TRANG_THAI,
  NHAN_UU_TIEN,
  TRANG_THAI_THEO_THU_TU,
  UU_TIEN_THEO_THU_TU,
  boView,
  datKhoa,
  dichKeo,
  docView,
  doiTrangThaiTrongTrang,
  gomTheoTrangThai,
  kieuXemTuUrl,
  lamPhang,
  locTuUrl,
  luuView,
  soLocDangBat,
  TRAN_VIEW,
  type ViewDaLuu,
} from '../src/loc-ticket';
import {
  CHIEU_CAO_BE_DO,
  chieuCaoDungDuoc,
  doKhung,
} from '../src/khung-cuon';
import { tronBinhLuanVaLichSu } from '../src/trang/chi-tiet-ticket';
import {
  cotBangTuSpec,
  locTicketTuSpec,
  nhanTatCaDuAnTuSpec,
  nhanTrangThaiTicketTuSpec,
  nhanUuTienTuSpec,
  soTicketCuonMuotTuSpec,
  specDoiCotNhomRong,
  specDoiHaiKieuXem,
  specDoiMotDuAnKieuBang,
  specDoiTatCaViec,
  specDoiThanhLocGon,
  specDoiTheViec,
  specDoiUrlVaView,
  tabNhanhTuSpec,
} from './doc-spec';
import {
  GIO,
  GIO_MS,
  binhLuan,
  dong,
  dongLichSu,
  manHinhDanhSach,
  nhieuDong,
} from './than-ticket';
import {
  KHOA_NHANH,
  KHOA_THE,
  KIEU_XEM_MAC_DINH,
  LOC_NHANH,
  NHAN_LOC_NHANH,
  NGAY_XONG_CU,
  NHOM_COT_CHU,
  NHOM_CUA_LOC_NHANH,
  TRANG_THAI_TRONG_COT,
  datNhanTrongCache,
  dichNhan,
  gomTheoCotChu,
  laNhomChu,
  laXongCu,
  locNhanh,
  locXongCu,
  nhanhTuUrl,
} from '../src/loc-ticket';
import { LOP_NHAN, mauNhan, vietTat } from '../src/vo/mau-the';

/* ================================================================== *
 * A. Bảng 0.1 — nhãn trong mã PHẢI khớp SPEC
 * ================================================================== */

describe('bảng 0.1 — nhãn trạng thái và ưu tiên khớp SPEC từng chữ', () => {
  it('bảy trạng thái: đúng mã, đúng nhãn, ĐÚNG THỨ TỰ của bảng 0.1', () => {
    const tu_spec = nhanTrangThaiTicketTuSpec();
    expect(TRANG_THAI_THEO_THU_TU).toEqual(Object.keys(tu_spec));
    expect(NHAN_TRANG_THAI).toEqual(tu_spec);
  });

  it('năm mức ưu tiên: đúng mã, đúng nhãn, đúng thứ tự', () => {
    const tu_spec = nhanUuTienTuSpec();
    expect(UU_TIEN_THEO_THU_TU).toEqual(Object.keys(tu_spec));
    expect(NHAN_UU_TIEN).toEqual(tu_spec);
  });

  it('cột của BẢNG (d.396) là đúng bảy trạng thái, đúng thứ tự đó', () => {
    expect(COT_BANG).toEqual(TRANG_THAI_THEO_THU_TU);
  });

  it('nhãn "Tất cả dự án" là chữ của d.395', () => {
    expect(NHAN_TAT_CA_DU_AN).toBe(nhanTatCaDuAnTuSpec());
  });

  /** Lưới cho chính parser: cắt ra rỗng là một ca vô nghĩa, phải đỏ. */
  it('parser cắt ra đủ bảy trạng thái và năm ưu tiên (chống bảng mong đợi rỗng)', () => {
    expect(Object.keys(nhanTrangThaiTicketTuSpec())).toHaveLength(7);
    expect(Object.keys(nhanUuTienTuSpec())).toHaveLength(5);
  });
});

/* ================================================================== *
 * B. d.396 — chín bộ lọc, và khoá URL cho từng cái
 * ================================================================== */

describe('d.396 — mọi bộ lọc SPEC kể đều có một khoá URL', () => {
  /**
   * Phép nối **chữ của SPEC → khoá URL**. Bảng này là chỗ duy nhất dịch, và ca
   * dưới ghim rằng nó phủ **đủ** danh sách cắt từ SPEC: thêm một bộ lọc vào d.396
   * mà không thêm khoá ⇒ đỏ.
   */
  const KHOA_CUA_VE: Record<string, string> = {
    'dự án': KHOA_LOC_TICKET.du_an,
    'trạng thái': KHOA_LOC_TICKET.trang_thai,
    'ưu tiên': KHOA_LOC_TICKET.uu_tien,
    'người chịu trách nhiệm': KHOA_LOC_TICKET.chiu_trach_nhiem,
    'người đang cầm': KHOA_LOC_TICKET.nguoi_dang_cam,
    'nhãn': KHOA_LOC_TICKET.nhan,
    'có cờ': KHOA_LOC_TICKET.co_co,
    'cần Chủ': KHOA_LOC_TICKET.can_chu,
    'xong không bằng chứng': KHOA_LOC_TICKET.xong_khong_bang_chung,
  };

  it('danh sách bộ lọc của SPEC và bảng khoá URL phủ nhau HOÀN TOÀN', () => {
    const tu_spec = locTicketTuSpec();
    // Mỗi vế SPEC phải có khoá; và không có khoá nào dư (một khoá dư là một ô lọc
    // mà SPEC không kể).
    expect(tu_spec.filter((v) => KHOA_CUA_VE[v] === undefined)).toEqual([]);
    expect(Object.keys(KHOA_CUA_VE).filter((v) => !tu_spec.includes(v))).toEqual([]);
  });

  it('parser d.396 cắt ra ĐÚNG chín vế (chống danh sách rỗng)', () => {
    expect(locTicketTuSpec()).toHaveLength(9);
  });

  it('d.397 có cả hai vế: ghi trên URL, và lưu thành view riêng', () => {
    expect(specDoiUrlVaView()).toEqual({ tren_url: true, view_rieng: true });
  });

  it('d.396 có đủ năm vế về hai kiểu xem và luật kéo vào Xong', () => {
    expect(specDoiHaiKieuXem()).toEqual({
      gom_theo_trang_thai: true,
      cot_la_trang_thai: true,
      keo_tha: true,
      bat_ve_cho_cu: true,
      bao_ly_do: true,
    });
  });
});

describe('locTuUrl — URL → tham số máy chủ', () => {
  it('đổi tên khoá `du_an` → `project_id`, và bỏ khoá rỗng', () => {
    const sp = new URLSearchParams('du_an=pj-SAI&trang_thai=&uu_tien=high');
    expect(locTuUrl(sp)).toEqual({
      project_id: 'pj-SAI',
      trang_thai: undefined,
      uu_tien: 'high',
      chiu_trach_nhiem: undefined,
      nguoi_dang_cam: undefined,
      nhan: undefined,
      co_co: undefined,
      can_chu: undefined,
      xong_khong_bang_chung: undefined,
    });
  });

  it('ba cờ chỉ gửi khi đúng bằng `co` — giá trị khác là KHÔNG LỌC', () => {
    const bat = locTuUrl(new URLSearchParams('co_co=co&can_chu=co&xong_khong_bang_chung=co'));
    expect([bat.co_co, bat.can_chu, bat.xong_khong_bang_chung]).toEqual([
      GIA_TRI_BAT,
      GIA_TRI_BAT,
      GIA_TRI_BAT,
    ]);
    // `khong`, `1`, `true` đều **không** là bật: máy chủ không có vế "lọc ngược".
    const tat = locTuUrl(new URLSearchParams('co_co=khong&can_chu=1&xong_khong_bang_chung=true'));
    expect([tat.co_co, tat.can_chu, tat.xong_khong_bang_chung]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('`nguoi_dang_cam` và `chiu_trach_nhiem` là HAI khoá khác nhau', () => {
    const l = locTuUrl(new URLSearchParams('nguoi_dang_cam=ag-a&chiu_trach_nhiem=owner'));
    expect(l.nguoi_dang_cam).toBe('ag-a');
    expect(l.chiu_trach_nhiem).toBe('owner');
  });
});

describe('datKhoa — bộ lọc ghi trên URL (d.397)', () => {
  it('giữ các khoá khác, và giá trị rỗng là XOÁ khoá', () => {
    const sp = new URLSearchParams('du_an=pj-SAI&uu_tien=high');
    expect(datKhoa(sp, 'uu_tien', '').toString()).toBe('du_an=pj-SAI');
    expect(datKhoa(sp, 'trang_thai', 'done').toString()).toBe(
      'du_an=pj-SAI&uu_tien=high&trang_thai=done',
    );
  });

  it('đổi BỘ LỌC thì rời view đang mở; đổi KIỂU XEM thì không', () => {
    const sp = new URLSearchParams(`du_an=pj-SAI&${KHOA_VIEW}=Gấp`);
    expect(datKhoa(sp, 'uu_tien', 'high').get(KHOA_VIEW)).toBeNull();
    expect(datKhoa(sp, KHOA_XEM, 'bang').get(KHOA_VIEW)).toBe('Gấp');
  });

  it('soLocDangBat đếm đúng các khoá LỌC, không đếm `xem`/`view`', () => {
    const sp = new URLSearchParams(`du_an=pj-SAI&co_co=co&${KHOA_XEM}=bang&${KHOA_VIEW}=Gấp`);
    expect(soLocDangBat(sp)).toBe(2);
  });
});

/* ================================================================== *
 * B2. SPEC vẫn ĐÒI đúng những câu mà phần B của đợt 3 cài
 * ================================================================== *
 * Mỗi hàm cắt-SPEC mới có một **ca ghim chính nó** — nếp của `doc-spec.ts`: một
 * parser hỏng (hay một lần viết lại SPEC bỏ mất một vế) phải là **đỏ**, không
 * phải "mọi ca xanh vì cờ nào cũng `false` mà không ai đọc".
 */

describe('d.397, d.403–407 — SPEC vẫn đòi đúng các câu của bản soát UI', () => {
  it('d.407 — thanh lọc không mở sẵn, có nút "Lọc", menu chứa mọi ô lọc và "Lưu thành view"', () => {
    expect(specDoiThanhLocGon()).toEqual({
      khong_mo_san: true,
      co_nut_loc: true,
      menu_moi_o_loc: true,
      co_luu_view_trong_menu: true,
    });
  });

  it('d.404 — thẻ không có ô "Chuyển cột", ba đường đổi trạng thái, ẩn ưu tiên "Không", tên agent', () => {
    expect(specDoiTheViec()).toEqual({
      khong_chuyen_cot: true,
      ba_duong_doi_trang_thai: true,
      an_uu_tien_khong: true,
      ten_khong_id: true,
    });
  });

  it('d.405 — cột rỗng thu hẹp (vẫn có tiêu đề và số 0), nhóm rỗng ở Danh sách thì ẩn', () => {
    expect(specDoiCotNhomRong()).toEqual({ cot_thu_hep: true, nhom_rong_an: true });
  });

  it('d.397 + d.403 — "Tất cả việc" là mọi dự án, mở kiểu Bảng; một dự án cũng mặc định Bảng', () => {
    expect(specDoiTatCaViec()).toEqual({ moi_du_an: true, kieu_bang: true });
    expect(specDoiMotDuAnKieuBang()).toBe(true);
  });
});

describe('kieuXemTuUrl — hai kiểu xem của d.396, mặc định BẢNG của d.403', () => {
  /**
   * **Mặc định đổi từ Danh sách sang Bảng** ở BAT-6 đợt 3: d.403 nói "Trang việc
   * của một dự án mặc định là kiểu **Bảng**", và d.397 nói "Tất cả việc" cũng "mở
   * ở kiểu Bảng". `mac_dinh` truyền tay để ca này không phụ thuộc `localStorage`
   * (bậc 2 có ca riêng ở `danh-sach-ticket.test.tsx`).
   */
  it('URL nói gì thì theo nó; thiếu hoặc giá trị lạ ⇒ mặc định của SPEC', () => {
    expect(kieuXemTuUrl(new URLSearchParams('xem=bang'), 'danh-sach')).toBe('bang');
    expect(kieuXemTuUrl(new URLSearchParams('xem=danh-sach'), 'bang')).toBe('danh-sach');
    expect(kieuXemTuUrl(new URLSearchParams(''), 'bang')).toBe('bang');
    expect(kieuXemTuUrl(new URLSearchParams('xem=rác'), 'bang')).toBe('bang');
    // Và mặc định **của SPEC** khi không ai nói gì cả.
    expect(KIEU_XEM_MAC_DINH).toBe('bang');
  });
});

/* ================================================================== *
 * C. d.396 — view riêng
 * ================================================================== */

describe('view riêng — d.396 "Lưu thành view riêng"', () => {
  const kho = (van: string | null): Pick<Storage, 'getItem'> => ({ getItem: () => van });

  it('đọc được danh sách đã lưu', () => {
    const ds = docView(kho(JSON.stringify([{ ten: 'Gấp', truy_van: 'uu_tien=urgent' }])));
    expect(ds).toEqual([{ ten: 'Gấp', truy_van: 'uu_tien=urgent' }]);
  });

  it('DỮ LIỆU HỎNG ⇒ danh sách rỗng, KHÔNG ném (không làm trắng trang)', () => {
    expect(docView(kho('{không phải json'))).toEqual([]);
    expect(docView(kho('{"ten":"Gấp"}'))).toEqual([]);
    expect(docView(kho(null))).toEqual([]);
    // Phần tử hỏng bị bỏ, phần tử tốt còn lại.
    expect(
      docView(kho(JSON.stringify([{ ten: '' }, 3, { ten: 'Gấp', truy_van: '' }]))),
    ).toEqual([{ ten: 'Gấp', truy_van: '' }]);
  });

  it('trùng tên là GHI ĐÈ, không tạo bản thứ hai', () => {
    const ds: ViewDaLuu[] = [{ ten: 'Gấp', truy_van: 'uu_tien=urgent' }];
    expect(luuView(ds, 'Gấp', 'uu_tien=high')).toEqual([{ ten: 'Gấp', truy_van: 'uu_tien=high' }]);
  });

  it('tên rỗng / chỉ khoảng trắng thì KHÔNG lưu gì', () => {
    expect(luuView([], '   ', 'co_co=co')).toEqual([]);
  });

  it('tên bị cắt khoảng trắng hai đầu', () => {
    expect(luuView([], '  Gấp  ', 'x=1')).toEqual([{ ten: 'Gấp', truy_van: 'x=1' }]);
  });

  it('có trần số view', () => {
    let ds: ViewDaLuu[] = [];
    for (let i = 0; i < TRAN_VIEW + 5; i++) ds = luuView(ds, `v${String(i)}`, '');
    expect(ds).toHaveLength(TRAN_VIEW);
    // Giữ các view **mới nhất**.
    expect(ds.at(-1)?.ten).toBe(`v${String(TRAN_VIEW + 4)}`);
  });

  it('boView bỏ đúng một view', () => {
    const ds: ViewDaLuu[] = [
      { ten: 'A', truy_van: '' },
      { ten: 'B', truy_van: '' },
    ];
    expect(boView(ds, 'A')).toEqual([{ ten: 'B', truy_van: '' }]);
  });
});

/* ================================================================== *
 * D. d.396 — gom theo trạng thái, và làm phẳng cho d.409
 * ================================================================== */

describe('gomTheoTrangThai — kiểu xem danh sách của d.396', () => {
  it('ĐỦ BẢY nhóm kể cả nhóm rỗng, đúng thứ tự bảng 0.1', () => {
    const nhom = gomTheoTrangThai([dong({ ma: 'SAI-1', trang_thai: 'done' })]);
    expect(nhom.map((n) => n.trang_thai)).toEqual(TRANG_THAI_THEO_THU_TU);
    expect(nhom.map((n) => n.items.length)).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it('GIỮ NGUYÊN thứ tự máy chủ trong một nhóm (không sắp lại)', () => {
    // Máy chủ sắp `hang_uu_tien, tao_luc DESC`; fixture đưa vào thứ tự "lạ" có
    // chủ ý, và nhóm phải trả lại **đúng thứ tự đó**.
    const ds = [
      dong({ ma: 'SAI-9', trang_thai: 'todo', uu_tien: 'none' }),
      dong({ ma: 'SAI-2', trang_thai: 'todo', uu_tien: 'urgent' }),
      dong({ ma: 'SAI-5', trang_thai: 'todo', uu_tien: 'low' }),
    ];
    expect(gomTheoTrangThai(ds)[1]?.items.map((t) => t.ma)).toEqual(['SAI-9', 'SAI-2', 'SAI-5']);
  });

  it('nhãn của nhóm là nhãn bảng 0.1', () => {
    expect(gomTheoTrangThai([]).map((n) => n.nhan)).toEqual(
      TRANG_THAI_THEO_THU_TU.map((t) => NHAN_TRANG_THAI[t]),
    );
  });
});

describe('lamPhang — một mảng phẳng cho bộ ảo hoá (d.409), nhóm rỗng ẨN (d.405)', () => {
  it('nhóm CÓ việc thành một dòng tiêu đề rồi các ticket; nhóm rỗng không ra dòng nào', () => {
    const phang = lamPhang(
      gomTheoTrangThai([
        dong({ ma: 'SAI-1', trang_thai: 'todo' }),
        dong({ ma: 'SAI-2', trang_thai: 'todo' }),
      ]),
    );
    // **1** tiêu đề + 2 ticket: sáu nhóm rỗng còn lại bị ẩn (d.405).
    expect(phang).toHaveLength(3);
    expect(phang[0]).toEqual({ loai: 'nhom', trang_thai: 'todo', nhan: 'Cần làm', so: 2 });
    expect(phang.slice(1, 3).map((d) => (d.loai === 'ticket' ? d.the.ma : d.loai))).toEqual([
      'SAI-1',
      'SAI-2',
    ]);
    // Và `gomTheoTrangThai` **vẫn** trả đủ bảy nhóm: nó là nguồn thứ tự `J`/`K`.
    expect(gomTheoTrangThai([]).length).toBe(7);
    expect(lamPhang(gomTheoTrangThai([]))).toEqual([]);
  });

  it(`${String(soTicketCuonMuotTuSpec())} ticket (mốc d.409) ra đúng N + 7 dòng (bảy nhóm đều có việc)`, () => {
    // `nhieuDong` rải đủ bảy trạng thái, nên **không** nhóm nào rỗng ở mốc này.
    const n = soTicketCuonMuotTuSpec();
    expect(lamPhang(gomTheoTrangThai(nhieuDong(n)))).toHaveLength(n + 7);
  });
});

/* ================================================================== *
 * E. Bệ đỡ chiều cao khung cuộn — mảnh đỡ của d.409
 * ================================================================== */

describe('khung-cuon — bệ đỡ khi chưa đo được chiều cao', () => {
  it('chiều cao 0 (chưa layout, hoặc jsdom) ⇒ bệ đỡ; khác 0 ⇒ số đo thật', () => {
    expect(chieuCaoDungDuoc(0)).toBe(CHIEU_CAO_BE_DO);
    expect(chieuCaoDungDuoc(-5)).toBe(CHIEU_CAO_BE_DO);
    expect(chieuCaoDungDuoc(Number.NaN)).toBe(CHIEU_CAO_BE_DO);
    expect(chieuCaoDungDuoc(480)).toBe(480);
  });

  it('phần tử không có (ref chưa gắn) ⇒ vẫn trả bệ đỡ, không ném', () => {
    expect(doKhung(null)).toEqual({ width: 0, height: CHIEU_CAO_BE_DO });
  });
});

/* ================================================================== *
 * F. d.396 — một lần kéo có đáng gọi máy chủ không
 * ================================================================== */

describe('dichKeo — dịch một lần kéo thành một việc (hoặc không việc gì)', () => {
  const the = { id: 'tk-SAI-1', trang_thai: 'in_progress' as const };

  it('kéo sang cột khác ⇒ một việc, đúng ticket, đúng trạng thái', () => {
    expect(dichKeo(the, 'done')).toEqual({ ticket_id: 'tk-SAI-1', trang_thai: 'done' });
  });

  it('thả ra ngoài mọi cột ⇒ KHÔNG làm gì', () => {
    expect(dichKeo(the, null)).toBeNull();
  });

  it('thả lại ĐÚNG cột đang ở ⇒ KHÔNG gọi máy chủ', () => {
    expect(dichKeo(the, 'in_progress')).toBeNull();
  });

  it('id vùng thả không phải một trạng thái ⇒ KHÔNG gửi `trang_thai` rác', () => {
    expect(dichKeo(the, 'cot-done')).toBeNull();
    expect(dichKeo(the, '')).toBeNull();
  });
});

describe('doiTrangThaiTrongTrang — nửa "hiện ngay" của d.407', () => {
  it('đổi cả mã VÀ nhãn trạng thái của đúng một dòng', () => {
    const trang = manHinhDanhSach([
      dong({ ma: 'SAI-1', trang_thai: 'in_progress' }),
      dong({ ma: 'SAI-2', trang_thai: 'in_progress' }),
    ]);
    const sau = doiTrangThaiTrongTrang(trang, 'tk-SAI-1', 'done');

    expect(sau.items[0]?.trang_thai).toBe('done');
    // Không đổi nhãn thì thẻ nằm ở cột Xong mà in chữ "Đang làm".
    expect(sau.items[0]?.nhan_trang_thai).toBe(NHAN_TRANG_THAI.done);
    expect(sau.items[1]?.trang_thai).toBe('in_progress');
    // `bay_gio` đi nguyên: mốc máy chủ không đổi vì một thẻ sang cột khác.
    expect(sau.bay_gio).toBe(trang.bay_gio);
  });

  it('id không có trong trang ⇒ trang không đổi gì', () => {
    const trang = manHinhDanhSach([dong({ ma: 'SAI-1' })]);
    expect(doiTrangThaiTrongTrang(trang, 'tk-khong-co', 'done').items).toEqual(trang.items);
  });
});

describe('d.415 phím `L` — `dichNhan`: lần gắn/bỏ nhãn nào đáng gọi máy chủ', () => {
  const the = dong({ ma: 'SAI-1', nhan: ['sos'] });

  it('gắn nhãn mới ⇒ một việc mang id, mã, nhãn ĐÃ CẮT hai đầu (như máy chủ), gan=true', () => {
    expect(dichNhan(the, '  ui  ', true)).toEqual({
      ticket_id: 'tk-SAI-1',
      ma: 'SAI-1',
      nhan: 'ui',
      gan: true,
    });
  });

  it('ô trống / chỉ khoảng trắng ⇒ null (không gọi)', () => {
    expect(dichNhan(the, '', true)).toBeNull();
    expect(dichNhan(the, '   ', true)).toBeNull();
  });

  it('gắn nhãn ĐÃ CÓ (kể cả có khoảng trắng hai đầu) ⇒ null', () => {
    expect(dichNhan(the, 'sos', true)).toBeNull();
    expect(dichNhan(the, ' sos ', true)).toBeNull();
  });

  it('bỏ nhãn có ⇒ gan=false; bỏ nhãn KHÔNG có ⇒ null', () => {
    expect(dichNhan(the, 'sos', false)).toEqual({
      ticket_id: 'tk-SAI-1',
      ma: 'SAI-1',
      nhan: 'sos',
      gan: false,
    });
    expect(dichNhan(the, 'ui', false)).toBeNull();
  });
});

describe('d.418 — `datNhanTrongCache`: nhãn đổi ngay trên mọi trang đã nối', () => {
  const cache = (): {
    pages: ReturnType<typeof manHinhDanhSach>[];
    pageParams: (string | undefined)[];
  } => ({
    pages: [
      manHinhDanhSach([dong({ ma: 'SAI-1', nhan: ['a', 'b', 'c'] }), dong({ ma: 'SAI-2', nhan: ['a'] })]),
      manHinhDanhSach([dong({ ma: 'SAI-3', nhan: [] })]),
    ],
    pageParams: [undefined, 'cur-2'],
  });

  it('gắn ⇒ nối cuối, chỉ đúng thẻ; pageParams giữ nguyên', () => {
    const c = cache();
    const sau = datNhanTrongCache(c, 'tk-SAI-3', 'x', true);
    expect(sau.pages[1]?.items[0]?.nhan).toEqual(['x']);
    expect(sau.pages[0]?.items[0]?.nhan).toEqual(['a', 'b', 'c']);
    expect(sau.pageParams).toEqual([undefined, 'cur-2']);
    // Không sửa tại chỗ: cache cũ còn nguyên.
    expect(c.pages[1]?.items[0]?.nhan).toEqual([]);
  });

  it('bỏ ⇒ chỉ nhãn ấy của đúng thẻ ấy', () => {
    const sau = datNhanTrongCache(cache(), 'tk-SAI-1', 'a', false);
    expect(sau.pages[0]?.items[0]?.nhan).toEqual(['b', 'c']);
    expect(sau.pages[0]?.items[1]?.nhan).toEqual(['a']);
  });

  it('bỏ rồi hoàn bằng phép ngược với `vi_tri` ⇒ nhãn về ĐÚNG chỗ cũ', () => {
    const bo = datNhanTrongCache(cache(), 'tk-SAI-1', 'b', false);
    const hoan = datNhanTrongCache(bo, 'tk-SAI-1', 'b', true, 1);
    expect(hoan.pages[0]?.items[0]?.nhan).toEqual(['a', 'b', 'c']);
  });

  it('`vi_tri` âm hoặc vượt ⇒ nối cuối', () => {
    expect(datNhanTrongCache(cache(), 'tk-SAI-2', 'z', true, -1).pages[0]?.items[1]?.nhan).toEqual(['a', 'z']);
    expect(datNhanTrongCache(cache(), 'tk-SAI-2', 'z', true, 9).pages[0]?.items[1]?.nhan).toEqual(['a', 'z']);
  });

  it('gắn nhãn đã có / bỏ nhãn không có ⇒ thẻ không đổi', () => {
    expect(datNhanTrongCache(cache(), 'tk-SAI-1', 'a', true).pages[0]?.items[0]?.nhan).toEqual(['a', 'b', 'c']);
    expect(datNhanTrongCache(cache(), 'tk-SAI-1', 'q', false).pages[0]?.items[0]?.nhan).toEqual(['a', 'b', 'c']);
  });

  it('hai thao tác chồng nhau: thao tác 1 hoàn bằng phép ngược KHÔNG xoá thao tác 2', () => {
    const t1 = datNhanTrongCache(cache(), 'tk-SAI-3', 'x', true); // thao tác 1 (sẽ lỗi)
    const t2 = datNhanTrongCache(t1, 'tk-SAI-3', 'y', true); // thao tác 2 (thành công)
    const hoan1 = datNhanTrongCache(t2, 'tk-SAI-3', 'x', false);
    expect(hoan1.pages[1]?.items[0]?.nhan).toEqual(['y']);
  });
});

/* ================================================================== *
 * G. d.400 — bình luận XEN lịch sử
 * ================================================================== */

describe('tronBinhLuanVaLichSu — "bình luận xen lịch sử" của d.400', () => {
  it('trộn thành MỘT dòng, mới nhất trước, XEN KẼ theo mốc', () => {
    const moc = tronBinhLuanVaLichSu(
      [binhLuan({ id: 'bl-cu', tao_luc: GIO - 3000 }), binhLuan({ id: 'bl-moi', tao_luc: GIO - 1000 })],
      [dongLichSu({ id: 'ls-giua', luc: GIO - 2000 })],
    );
    expect(
      moc.map((m) => (m.loai === 'binh_luan' ? m.binh_luan.id : m.lich_su.id)),
    ).toEqual(['bl-moi', 'ls-giua', 'bl-cu']);
  });

  it('CÙNG MỐC: bình luận đứng trước dòng lịch sử', () => {
    const moc = tronBinhLuanVaLichSu(
      [binhLuan({ id: 'bl', tao_luc: GIO })],
      [dongLichSu({ id: 'ls', luc: GIO })],
    );
    expect(moc[0]?.loai).toBe('binh_luan');
    expect(moc[1]?.loai).toBe('lich_su');
  });

  it('một nguồn rỗng thì vẫn ra đủ nguồn kia', () => {
    expect(tronBinhLuanVaLichSu([], [dongLichSu({ id: 'ls', luc: GIO })])).toHaveLength(1);
    expect(tronBinhLuanVaLichSu([binhLuan({ id: 'bl', tao_luc: GIO })], [])).toHaveLength(1);
    expect(tronBinhLuanVaLichSu([], [])).toEqual([]);
  });
});

/* ================================================================== *
 * G. BAT-6 đợt 2 — nhóm cột của bảng (sáu từ BAT-64), lọc nhanh, "Xong cũ", màu thẻ
 * ================================================================== *
 * Bốn vế ngoài SPEC của brief (`cau-hoi-spec.md` #131–#136). Ca ở đây ghim **đề
 * xuất tạm đang dùng**, nên khi chủ chốt khác thì ca đỏ, không âm thầm lệch.
 */

/*
 * T-111 A (29/10, BAT-64): 6 cột, Backlog đầu. Trước BAT-64 khối này ghim "năm
 * cột, `backlog` không có cột"; các ca dưới đổi kỳ vọng, không bỏ ca nào.
 */
describe('#131 — sáu CỘT của bảng (T-111 A)', () => {
  it('cột Huỷ gộp `duplicate`; `backlog` có cột riêng; mọi cột khác một-một', () => {
    expect(TRANG_THAI_TRONG_COT['canceled']).toEqual(['canceled', 'duplicate']);
    expect(TRANG_THAI_TRONG_COT['backlog']).toEqual(['backlog']);
    // Mỗi trạng thái của bảng 0.1 **chỉ** được hiện ở một cột, không hai.
    const hien = NHOM_COT_CHU.flatMap((c) => TRANG_THAI_TRONG_COT[c] ?? [c]);
    expect(new Set(hien).size).toBe(hien.length);
    // Và không trạng thái nào thiếu cột (Trùng nằm trong cột Huỷ).
    expect(TRANG_THAI_THEO_THU_TU.filter((t) => !hien.includes(t))).toEqual([]);
  });

  it('`gomTheoCotChu`: sáu cột LUÔN có mặt, thẻ Trùng vào cột Huỷ, Backlog ra cột Backlog', () => {
    const ds = [
      dong({ ma: 'SAI-1', trang_thai: 'backlog' }),
      dong({ ma: 'SAI-2', trang_thai: 'canceled' }),
      dong({ ma: 'SAI-3', trang_thai: 'duplicate' }),
    ];
    const nhom = gomTheoCotChu(ds);
    expect(nhom.map((n) => n.cot)).toEqual([...NHOM_COT_CHU]);
    expect(nhom.map((n) => n.items.length)).toEqual([1, 0, 0, 0, 0, 2]);
    expect(nhom[0]?.items.map((t) => t.ma)).toEqual(['SAI-1']);
    expect(nhom[0]?.nhan).toBe('Backlog');
    expect(nhom[5]?.items.map((t) => t.ma)).toEqual(['SAI-2', 'SAI-3']);
    // `backlog` vẫn là một nhóm của kiểu xem danh sách.
    expect(gomTheoTrangThai(ds)[0]?.items.map((t) => t.ma)).toEqual(['SAI-1']);
  });

  it('đúng SÁU, Backlog đầu, đúng thứ tự SPEC mục 14, và đều là trạng thái thật của bảng 0.1', () => {
    expect(NHOM_COT_CHU).toEqual(['backlog', 'todo', 'in_progress', 'verifying', 'done', 'canceled']);
    // Nhãn tiếng Việt của sáu cột = đúng chữ SPEC mục 14 (T-111 A).
    expect(NHOM_COT_CHU.map((t) => NHAN_TRANG_THAI[t])).toEqual([
      'Backlog',
      'Cần làm',
      'Đang làm',
      'Chờ kiểm chứng',
      'Xong',
      'Huỷ',
    ]);
    expect(NHOM_COT_CHU.map((t) => NHAN_TRANG_THAI[t])).toEqual(cotBangTuSpec().cot);
    expect(NHOM_COT_CHU.every((t) => TRANG_THAI_THEO_THU_TU.includes(t))).toBe(true);
  });

  it('`backlog` nay là cột; `duplicate` không phải cột, nhưng ô trạng thái của panel giữ đủ bảy', () => {
    expect(laNhomChu('backlog')).toBe(true);
    expect(laNhomChu('duplicate')).toBe(false);
    expect(laNhomChu('done')).toBe(true);
    // Không trạng thái nào mất đường tới: `COT_BANG` (ô chọn) vẫn là bảy.
    expect(COT_BANG).toHaveLength(7);
  });

  it('kéo giữa cột Backlog và Cần làm: dịch đúng trạng thái; thả lại cột Backlog ⇒ không gọi', () => {
    // Client chỉ dịch cử chỉ; luật chuyển (closed → Backlog chỉ chủ, …) là của máy chủ.
    expect(dichKeo({ id: 'tk-1', trang_thai: 'todo' }, 'backlog')).toEqual({
      ticket_id: 'tk-1',
      trang_thai: 'backlog',
    });
    expect(dichKeo({ id: 'tk-2', trang_thai: 'backlog' }, 'todo')).toEqual({
      ticket_id: 'tk-2',
      trang_thai: 'todo',
    });
    expect(dichKeo({ id: 'tk-3', trang_thai: 'backlog' }, 'backlog')).toBeNull();
    // Ticket đã kết kéo vào Backlog: client vẫn gửi, để máy chủ quyết (403 nếu không phải chủ).
    expect(dichKeo({ id: 'tk-4', trang_thai: 'done' }, 'backlog')).toEqual({
      ticket_id: 'tk-4',
      trang_thai: 'backlog',
    });
  });

  it('kéo vào cột Huỷ đặt `canceled`, KHÔNG BAO GIỜ `duplicate`', () => {
    /*
     * `duplicate` cần một ticket gốc hợp lệ (`INVALID_DUPLICATE_TARGET`), thứ một
     * cử chỉ kéo không nói được. Id vùng thả của cột Huỷ là `canceled`, nên một
     * thẻ Trùng kéo trong cột ấy đi đúng đường `canceled` (và cổng "Huỷ phải có
     * lý do" của mục 4 d.137 vẫn là cổng của máy chủ).
     */
    expect(dichKeo({ id: 'tk-1', trang_thai: 'duplicate' }, 'canceled')).toEqual({
      ticket_id: 'tk-1',
      trang_thai: 'canceled',
    });
    expect(dichKeo({ id: 'tk-2', trang_thai: 'canceled' }, 'canceled')).toBeNull();
  });
});

describe('#133 — lọc nhanh Active / Backlog / All', () => {
  const DS = [
    dong({ ma: 'SAI-1', trang_thai: 'backlog', nhom_trang_thai: 'planned' }),
    dong({ ma: 'SAI-2', trang_thai: 'todo', nhom_trang_thai: 'planned' }),
    dong({ ma: 'SAI-3', trang_thai: 'in_progress', nhom_trang_thai: 'active' }),
    dong({ ma: 'SAI-4', trang_thai: 'verifying', nhom_trang_thai: 'active' }),
    dong({ ma: 'SAI-5', trang_thai: 'done', nhom_trang_thai: 'closed' }),
  ];

  it('ba tab, và mỗi tab là MỘT nhóm của máy chủ (không bảng ánh xạ thứ hai)', () => {
    // Thứ tự là thứ tự d.407 ("Đang chạy · Backlog · Tất cả").
    expect([...LOC_NHANH]).toEqual(['active', 'backlog', 'all']);
    expect(NHOM_CUA_LOC_NHANH).toEqual({ all: null, active: 'active', backlog: 'planned' });
  });

  /**
   * **Nhãn ba tab cắt ra từ SPEC** — d.407 chốt từng chữ ("Đang chạy · Backlog ·
   * Tất cả"). Đợt 2 để nguyên tiếng Anh của Linear khi SPEC chưa có; ca này là
   * lưới cho chữ mới, và nó **không** là tautology: bảng mong đợi đọc `SPEC.md`.
   */
  it('nhãn ba tab đúng chữ của d.407, đúng thứ tự', () => {
    const tu_spec = tabNhanhTuSpec();
    expect(tu_spec.length).toBe(3);
    expect(LOC_NHANH.map((n) => NHAN_LOC_NHANH[n])).toEqual(tu_spec);
  });

  it('`active` lấy đúng nhóm chạy; `backlog` đúng nhóm chờ; `all` không lọc', () => {
    expect(locNhanh(DS, 'active').map((t) => t.ma)).toEqual(['SAI-3', 'SAI-4']);
    expect(locNhanh(DS, 'backlog').map((t) => t.ma)).toEqual(['SAI-1', 'SAI-2']);
    expect(locNhanh(DS, 'all')).toHaveLength(5);
  });

  it('lọc đi theo `nhom_trang_thai` CỦA MÁY CHỦ, không theo mã trạng thái', () => {
    /*
     * Fixture nói một ticket `done` thuộc nhóm `active` — ca không tồn tại trên
     * máy chủ thật, nhưng nó là ca duy nhất phân biệt "đọc `nhom_trang_thai`" với
     * "web tự suy nhóm từ `trang_thai`".
     */
    const la = dong({ ma: 'SAI-9', trang_thai: 'done', nhom_trang_thai: 'active' });
    expect(locNhanh([la], 'active').map((t) => t.ma)).toEqual(['SAI-9']);
  });

  it('URL quyết, và giá trị lạ hoặc thiếu ⇒ `all` (không trang trắng)', () => {
    expect(nhanhTuUrl(new URLSearchParams(`${KHOA_NHANH}=active`))).toBe('active');
    expect(nhanhTuUrl(new URLSearchParams(`${KHOA_NHANH}=rác`))).toBe('all');
    expect(nhanhTuUrl(new URLSearchParams())).toBe('all');
  });
});

describe('#132 — "Xong cũ": mốc, và phép lọc', () => {
  const NGAY_MS = 24 * 60 * 60 * 1000;
  /**
   * Mốc là **`xong_luc`** (đường đọc màn hình trả), không `cap_nhat_luc`. Nên
   * fixture đặt `cap_nhat_luc` **rất mới** cho mọi ca: nếu mã đọc sai cột, mọi
   * ca dưới đây đỏ.
   */
  const xong = (ma: string, xong_luc: number) =>
    dong({
      ma,
      trang_thai: 'done',
      nhom_trang_thai: 'closed',
      xong_luc,
      cap_nhat_luc: GIO - GIO_MS,
    });

  it('"cũ" = đã KẾT và quá đúng số ngày đã chốt — hai ca biên', () => {
    // Đúng mốc (không "quá") ⇒ chưa cũ; quá một giờ ⇒ cũ.
    expect(laXongCu(xong('SAI-1', GIO - NGAY_XONG_CU * NGAY_MS), GIO)).toBe(false);
    expect(laXongCu(xong('SAI-2', GIO - NGAY_XONG_CU * NGAY_MS - GIO_MS), GIO)).toBe(true);
  });

  it('ticket CHƯA kết thì không bao giờ "cũ", dù rất lâu không ai chạm', () => {
    const cu = dong({
      ma: 'SAI-3',
      trang_thai: 'in_progress',
      nhom_trang_thai: 'active',
      cap_nhat_luc: GIO - 400 * NGAY_MS,
    });
    expect(laXongCu(cu, GIO)).toBe(false);
  });

  it('nút tắt ⇒ giữ nguyên; nút bật ⇒ bỏ đúng những thẻ cũ', () => {
    const ds = [xong('SAI-1', GIO - 30 * NGAY_MS), xong('SAI-2', GIO - GIO_MS)];
    expect(locXongCu(ds, GIO, false).map((t) => t.ma)).toEqual(['SAI-1', 'SAI-2']);
    expect(locXongCu(ds, GIO, true).map((t) => t.ma)).toEqual(['SAI-2']);
  });

  /**
   * **Ca mà `cap_nhat_luc` không trả lời được.** Chủ sửa một nhãn trên một ticket
   * Xong từ 100 ngày trước: `cap_nhat_luc` nhảy về "vừa xong", nhưng nó **vẫn
   * là** một ticket Xong cũ. Đây là lý do `xong_luc` tồn tại trên đường đọc.
   */
  it('SỬA một ticket Xong cũ KHÔNG làm nó "mới" lại', () => {
    const vua_sua = dong({
      ma: 'SAI-4',
      trang_thai: 'done',
      nhom_trang_thai: 'closed',
      xong_luc: GIO - 100 * NGAY_MS,
      cap_nhat_luc: GIO - 1_000,
    });
    expect(laXongCu(vua_sua, GIO)).toBe(true);
    expect(locXongCu([vua_sua], GIO, true)).toEqual([]);
  });

  it('`xong_luc` RỖNG (Huỷ / dữ liệu nhập) ⇒ rơi về `cap_nhat_luc`, không bỏ qua', () => {
    const huy_lau = dong({
      ma: 'SAI-5',
      trang_thai: 'canceled',
      nhom_trang_thai: 'closed',
      xong_luc: null,
      cap_nhat_luc: GIO - 100 * NGAY_MS,
    });
    expect(laXongCu(huy_lau, GIO)).toBe(true);
    // Và một ticket Huỷ **mới** thì không cũ.
    expect(
      laXongCu(
        dong({ ma: 'SAI-6', trang_thai: 'canceled', nhom_trang_thai: 'closed', xong_luc: null }),
        GIO,
      ),
    ).toBe(false);
  });

  it('mốc đếm từ `bay_gio` CỦA MÁY CHỦ, không `Date.now()`', () => {
    const ds = [xong('SAI-1', GIO - 30 * NGAY_MS)];
    // Cùng dữ liệu, hai mốc máy chủ khác nhau ⇒ hai kết quả khác nhau.
    expect(locXongCu(ds, GIO, true)).toHaveLength(0);
    expect(locXongCu(ds, GIO - 30 * NGAY_MS, true)).toHaveLength(1);
  });
});

describe('#135–#136 — màu nhãn và viết tắt người cầm', () => {
  it('cùng chữ ⇒ CÙNG màu, mọi lần; và màu luôn nằm trong sáu cặp đã khai', () => {
    expect(mauNhan('hạ-tầng')).toBe(mauNhan('hạ-tầng'));
    for (const n of ['a', 'hạ-tầng', 'bug', 'ui', '', 'rất-dài-'.repeat(6)]) {
      expect(LOP_NHAN).toContain(mauNhan(n));
    }
  });

  it('nhãn khác chữ thì KHÔNG dồn hết vào một màu (băm có rải)', () => {
    const mau = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(mauNhan));
    expect(mau.size).toBeGreaterThan(1);
  });

  it('viết tắt: hai từ đầu, không hai ký tự đầu (hai worker không trùng viết tắt)', () => {
    expect(vietTat({ loai: 'agent', agentId: 'W-builder' }, 'Chủ (chủ)')).toBe('WB');
    expect(vietTat({ loai: 'agent', agentId: 'W-reviewer' }, 'Chủ (chủ)')).toBe('WR');
    expect(vietTat({ loai: 'owner' }, 'Chủ (chủ)')).toBe('CC');
    // Bậc 5 của 19.1 — không ai cầm ⇒ nói trống, không một ô tròn rỗng.
    expect(vietTat(null, 'Chủ (chủ)')).toBe('—');
  });
});

describe('`datKhoa` — `the` (thẻ đang mở) KHÔNG phải bộ lọc', () => {
  it('chọn một thẻ thì GIỮ view đang mở; đổi lọc nhanh thì RỜI view', () => {
    const sp = new URLSearchParams(`${KHOA_VIEW}=Gấp`);
    expect(datKhoa(sp, KHOA_THE, 'SAI-1').get(KHOA_VIEW)).toBe('Gấp');
    expect(datKhoa(sp, KHOA_NHANH, 'active').get(KHOA_VIEW)).toBeNull();
  });
});
