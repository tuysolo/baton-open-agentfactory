/**
 * **Màn hình Cần Chủ** — SPEC mục 8 d.248–275, mục 14 d.397 (bộ lọc trên URL) và
 * d.418 (cập nhật lạc quan + toast).
 *
 * | Vế SPEC | Ở đâu trong file này |
 * |---|---|
 * | d.249 ba khối 🔴 · 🟡 · ⚪, mục quá hạn viền đỏ + "quá hạn X giờ" | `Khoi`, `The` |
 * | d.250 thẻ đủ mã/dự án/loại/tiêu đề/bối cảnh gập 6 dòng/phương án/lệnh+Copy/file/ticket | `The`, `BoiCanh` |
 * | d.251 bảng "Đã xử lý" + lọc dự án, khoảng ngày | `BangDaXuLy` |
 * | d.252 lọc theo dự án, theo loại | `ThanhLoc` (ghi trên URL) |
 * | d.257–262 bốn loại, bốn hình nút, điều kiện mờ của nút Gửi | `TraLoi`, `coTheGui` |
 * | d.264 link "Bỏ qua", bắt buộc lý do | `OBoQua` |
 * | d.265 bấm Gửi là xong phía chủ (thẻ xuống "Đã xử lý" **ngay**) | `useGuiTraLoi` (`onMutate`) |
 * | d.270 phím tắt `1`–`5`, `Cmd/Ctrl+Enter`, `D`, `S`, `J`/`K` | `hanhDongPhim`, `usePhimTat` |
 * | d.271 ô trả lời hàng loạt | `OHangLoat` + `src/tra-loi-hang-loat.ts` |
 * | d.274–275 phiên duyệt, tóm tắt cuối phiên | `PhienDuyet`, `cauTomTatPhien` |
 * | d.420 thay đổi do agent hiện trong 3 giây, không tải lại trang | `nhipLamMoiDanhSach` (`src/lam-moi.ts`) |
 * | d.411 điện thoại 375px, kể cả phiên duyệt và ô hàng loạt | lớp `flex-wrap` / `w-full`, `data-hang="nut"` |
 * | d.414 + #154: `?the=<T-số>` mở đúng một mục (từ command menu) | `useMoTheTuUrl` |
 *
 * ## Trang này KHÔNG tính lại một luật nào của máy chủ
 *
 * Thứ tự trong khối (hạn rồi lúc tạo — d.249), `qua_han` / `qua_han_gio`, hạn
 * mặc định 4 giờ / 20:00 (d.241), `tieu_de_ngan` và `ngay` của bảng Đã xử lý,
 * huy hiệu `muc_cao_nhat`: **đã tính** ở `packages/api/src/doc-can-chu.ts`, và ở
 * đây chỉ được **vẽ**. Mọi `ket_qua` ghi vào Nhật ký cũng do máy chủ dựng
 * (`kiemKetQuaXuLy`), nên giao diện gửi **nhãn phương án**, không gửi câu kết
 * quả — xem `ThanXuLyMuc` ở `src/api.ts`.
 *
 * ## Phím tắt của d.270 đọc trạng thái nhập từ NGOÀI thẻ
 *
 * Trạng thái nhập của **mọi** thẻ nằm trong **một** `Map` ở `TrangCanChu`
 * (`nhap`, `datNhap`), không trong từng thẻ. Nhờ vậy `usePhimTat` gọi được
 * `datNhap(id, …)` và `guiThe(…)` cho **thẻ đang chọn** mà không phải chạm vào
 * cây thẻ; `chon_id` giữ id thẻ đang chọn — `J`/`K` chỉ đổi id đó.
 *
 * ## Vế 375px của d.411 được canh bằng LỚP, không bằng chiều rộng đo được
 *
 * jsdom không có layout: `getBoundingClientRect` trả 0 cho mọi thứ, nên không ca
 * nào ở đây đo được "có tràn ngang ở 375px hay không". Thứ **đo được** là cái
 * sinh ra tràn: một chiều rộng cứng lớn hơn 375px, một hàng nút không `flex-wrap`,
 * một bảng không nằm trong khung cuộn ngang. Nên mọi hàng nút nằm ngang mang
 * `data-hang="nut"` và test ghim rằng **mọi** hàng đó có `flex-wrap`, bảng Đã xử
 * lý nằm trong `overflow-x-auto`, và **không** lớp nào chốt một chiều rộng cứng
 * vượt 375px. Khai thẳng: đó là một lưới chống hồi quy, **không** thay được một
 * lần mở thật trên điện thoại ở bước nghiệm thu mục 17 (đã ghi `cau-hoi-spec.md`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import {
  LoiApi,
  boQuaMuc,
  layDaXuLy,
  layDuAn,
  layManHinhCanChu,
  xuLyMuc,
  type BangDaXuLyRa,
  type DongDaXuLy,
  type DuAnSidebar,
  type KhoiCanChu,
  type LocCanChu,
  type LoaiCanChu,
  type ManHinhCanChu,
  type MucDoKhan,
  type TheCanChu,
  type ThanXuLyMuc,
} from '../api';
import { nhipLamMoiDanhSach, useNhipLamMoi } from '../lam-moi';
import {
  batDauGhiLacQuan,
  ketThucGhiLacQuan,
  lamMoiTheoSo,
  type VeGhiLacQuan,
} from '../ghi-lac-quan';
import { Markdown, hinhCuaDiaChi } from '../markdown';
import { DauLamMoi } from '../vo/dau-lam-moi';
import { ChamMucGap } from '../vo/icon';
import {
  LOP_CAU_CHO,
  LOP_CAU_LOI,
  LOP_CHIP,
  LOP_O_NHAP,
  LOP_TIEU_DE_MUC,
  LOP_TIEU_DE_TRANG,
  NUT_CHINH,
  NUT_MO,
  NUT_PHU,
} from '../vo/lop-nut';
import { useToast } from '../vo/toast';
import { KHOA_THE_CAN_CHU, duongTicket } from '../vo/muc-sidebar';
import { bangPhimDangMo } from '../vo/phim-vo';
import { commandMenuDangMo } from '../vo/hop-dang-mo';
import { hopTaoViecDangMo, trongONhap } from '../vo/tao-viec';
import { gioDayDu, thoiGianTuongDoi } from '../thoi-gian';
import {
  coTheAp,
  tachHangLoat,
  type DongHangLoat,
  type MucBiet,
} from '../tra-loi-hang-loat';

/* ================================================================== *
 * 0. Chữ của SPEC — một chỗ, cắt đối chiếu trong test
 * ================================================================== *
 * Mọi chuỗi dưới đây là **chữ của SPEC**, không chữ nghĩ ra, và
 * `test/doc-spec.ts` cắt bản gốc từ `SPEC.md` rồi so với đúng các hằng này. Nên
 * sửa một nhãn ở đây mà SPEC không đổi ⇒ đỏ, và ngược lại.
 */

/** Nhãn sidebar của d.391, cũng là tiêu đề trang. */
export const TEN_TRANG = 'Cần Chủ';

/** Ba mức, **đúng thứ tự d.249**. */
export const MUC_THEO_DO_KHAN: readonly MucDoKhan[] = ['urgent', 'today', 'later'];

export const NHAN_MUC: Record<MucDoKhan, string> = {
  urgent: '🔴 Gấp',
  today: '🟡 Trong ngày',
  later: '⚪ Không gấp',
};

/** Bảng 0.1, hàng "Loại Cần Chủ". */
export const NHAN_LOAI: Record<LoaiCanChu, string> = {
  decision: 'Quyết định',
  run_command: 'Chủ chạy lệnh',
  review: 'Chủ review',
  fyi: 'Chỉ để biết',
};

/** Nút **Gửi** của từng loại — cột "Gửi" của bảng d.257–262. */
export const NHAN_GUI: Record<LoaiCanChu, string> = {
  decision: 'Gửi duyệt',
  run_command: 'Đã chạy · Gửi',
  review: 'Gửi duyệt',
  fyi: 'Đã đọc',
};

export const NHAN_DE_XUAT = 'Đề xuất';
export const NHAN_DAT = 'Đạt';
export const NHAN_CAN_SUA = 'Cần sửa';
export const NHAN_BO_QUA = 'Bỏ qua';
export const NHAN_COPY = 'Copy';
export const NHAN_PHIEN_DUYET = 'Bắt đầu phiên duyệt';
export const NHAN_KET_THUC_PHIEN = 'Kết thúc phiên';
export const CAU_TERMINAL_THAT = 'chạy ở terminal thật';

/** "Bối cảnh (**mặc định gập sau 6 dòng**)" — d.250. */
export const SO_DONG_GAP = 6;

/** "quá hạn **X giờ**" — d.249. Số giờ do máy chủ tính (`qua_han_gio`). */
export const cauQuaHan = (gio: number): string => `quá hạn ${String(gio)} giờ`;

/** "đã xử lý N, bỏ qua M, còn lại K" — d.275, đúng hình chữ đó. */
export const cauTomTatPhien = (n: number, m: number, k: number): string =>
  `đã xử lý ${String(n)}, bỏ qua ${String(m)}, còn lại ${String(k)}`;

export const CAU_CAN_SUA_CAN_GHI_CHU = 'Chọn Cần sửa thì bắt buộc có ghi chú.';
export const CAU_BO_QUA_CAN_LY_DO = 'Bỏ qua thì bắt buộc nhập lý do.';

export const CAU_DANG_TAI = 'Đang tải Cần Chủ…';
export const CAU_KHOI_RONG = 'Không có mục nào.';
export const CAU_CHUA_XU_LY_GI = 'Chưa có mục nào đã xử lý.';
export const CAU_HET_MUC_CHO = 'Không còn mục nào đang Chờ.';
/**
 * Nhãn ô "Ghi thêm" của **riêng** mục `decision` — `cau-hoi-spec.md` **#121**.
 *
 * Nó phải nói được rằng **gõ vào đây là gửi được**, không cần chọn phương án:
 * nhãn cũ ("Ghi thêm (tuỳ chọn)") là chữ của một luật đã nới, và một ô nói
 * "tuỳ chọn" trong khi nó là **một trong hai** đường trả lời là đúng chỗ chủ đã
 * bị kẹt hôm 11/10.
 */
export const NHAN_GHI_THEM_DECISION = 'Ghi thêm, hoặc trả lời tự do (không cần chọn phương án)';
export const NHAN_GHI_THEM = 'Ghi thêm (tuỳ chọn)';
export const NHAN_KET_QUA = 'Kết quả (tuỳ chọn)';
export const NHAN_XEM_TRUOC = 'Xem trước';
export const NHAN_AP_HANG_LOAT = 'Áp một lần';

/** `?the=<T-số>` trỏ vào một mục đã ở bảng Đã xử lý — #154 (BAT-37). Chữ ngoài SPEC. */
export const cauTheDaXuLy = (ma: string): string => `${ma} đã được xử lý.`;
/** `?the=<T-số>` không có trên trang — #154 (BAT-37). Chữ ngoài SPEC. */
export const cauKhongThayThe = (ma: string): string =>
  `Không tìm thấy mục ${ma} (có thể đã xử lý hoặc không tồn tại).`;

/* ================================================================== *
 * 1. Bộ lọc — d.252 + d.251, **ghi trên URL** (d.397)
 * ================================================================== */

/**
 * Bốn khoá truy vấn trên URL. Tên tiếng Việt không dấu, cùng nếp đường của
 * `cau-hoi-spec.md` #101 (SPEC **không** chốt đường nào ngoài `/t/<MÃ>`, nên
 * không tự chốt đường mới ở lượt này — chỉ dùng đề xuất tạm đã ghi ở đó).
 *
 * `du_an` nhận **id dự án** hoặc `chung` (mục Chung — 19.12 câu 4), tức đúng
 * giá trị mà `GET /v1/can-chu?project_id=` nhận. Một bảng dịch tên thứ hai giữa
 * URL và API là một chỗ nữa để lệch.
 */
export const KHOA_LOC = {
  du_an: 'du_an',
  loai: 'loai',
  tu_ngay: 'tu_ngay',
  den_ngay: 'den_ngay',
} as const;

function locTuUrl(sp: URLSearchParams): LocCanChu {
  const lay = (k: string): string | undefined => {
    const v = sp.get(k);
    return v === null || v === '' ? undefined : v;
  };
  return {
    project_id: lay(KHOA_LOC.du_an),
    loai: lay(KHOA_LOC.loai),
    tu_ngay: lay(KHOA_LOC.tu_ngay),
    den_ngay: lay(KHOA_LOC.den_ngay),
  };
}

/* ================================================================== *
 * 2. Trạng thái nhập của một thẻ
 * ================================================================== */

/** Những gì chủ đã bấm/gõ trên **một** thẻ, chưa gửi. */
export interface NhapThe {
  /** `decision`: **nhãn** phương án đã chọn (A, B, C…) — d.259. */
  phuong_an?: string;
  /** `review`: `dat` / `can_sua` — d.261. */
  ket_luan?: 'dat' | 'can_sua';
  /** Ô "ghi thêm" / "kết quả" — d.259, d.260. */
  ghi_them: string;
  /** Ô "Bỏ qua" đang mở? — d.264. */
  bo_qua_mo: boolean;
  ly_do_bo_qua: string;
}

export const NHAP_RONG: NhapThe = {
  ghi_them: '',
  bo_qua_mo: false,
  ly_do_bo_qua: '',
};

/**
 * **Nút Gửi có bật hay không** — hàm thuần, vì đây là nơi ba điều kiện của SPEC
 * sống cạnh nhau và cả ba đều phải test được không cần DOM:
 *
 *   * `decision`: **đã chọn một phương án HOẶC đã gõ "Ghi thêm"** — d.259 viết
 *     "mờ cho tới khi đã chọn 1 phương án", nhưng d.244 nói kết quả là "phương án
 *     đã chọn **và/hoặc** chữ tự do", và chủ đã yêu cầu trực tiếp (11/10) cho
 *     trả lời tự do. Xung đột + chỗ nới: `cau-hoi-spec.md` **#121**;
 *   * `review`: hai nút chọn, và "**Cần sửa thì bắt buộc ghi chú**" (d.261);
 *   * `run_command` / `fyi`: không điều kiện nào (ô kết quả **tuỳ chọn**).
 */
export function coTheGui(loai: LoaiCanChu, nhap: NhapThe): boolean {
  if (loai === 'decision') {
    return nhap.phuong_an !== undefined || nhap.ghi_them.trim() !== '';
  }
  if (loai === 'review') {
    if (nhap.ket_luan === undefined) return false;
    return nhap.ket_luan === 'dat' || nhap.ghi_them.trim() !== '';
  }
  return true;
}

/**
 * Thân `xu-ly` của một thẻ, dựng từ đúng những gì chủ đã bấm.
 *
 * `decision` **không chọn phương án** ⇒ thân chỉ có `ghi_them`, và khoá
 * `phuong_an` **vắng mặt hẳn** — không `phuong_an: undefined`, cũng không
 * `null`: `JSON.stringify` bỏ `undefined` nên hai cách cho cùng một gói gửi đi,
 * nhưng kiểu của thân thì khác, và `kiemKetQuaXuLy` phân biệt `''`/`null`/vắng
 * mặt. Giữ "vắng mặt" là giữ đúng hình mà máy chủ đọc (`cau-hoi-spec.md` #121).
 */
export function thanTuNhap(loai: LoaiCanChu, nhap: NhapThe): ThanXuLyMuc {
  const ghi_them = nhap.ghi_them.trim();
  return {
    ...(loai === 'decision' && nhap.phuong_an !== undefined
      ? { phuong_an: nhap.phuong_an }
      : {}),
    ...(loai === 'review' && nhap.ket_luan !== undefined ? { ket_luan: nhap.ket_luan } : {}),
    ...(ghi_them === '' ? {} : { ghi_them }),
  };
}

/* ================================================================== *
 * 2b. Phím tắt trong trang — d.270
 * ================================================================== */

/**
 * Một việc mà d.270 cho làm bằng một phím. `so` của `phuong-an` là **thứ tự**
 * phương án trên thẻ (1–5), không nhãn: nhãn A/B/C do máy chủ đặt, và một mục chỉ
 * có phương án B và C (sau khi sửa) vẫn phải bấm được bằng `1` và `2`.
 */
export type HanhDongPhim =
  | { loai: 'phuong-an'; so: number }
  | { loai: 'gui' }
  | { loai: 'chinh' }
  | { loai: 'bo-qua' }
  | { loai: 'xuong' }
  | { loai: 'len' };

/** Số phương án tối đa bấm được bằng phím — `1`–`5` của d.270. */
export const SO_PHIM_PHUONG_AN = 5;

/**
 * **Phím → việc**, hàm thuần, vì đây là chỗ cả năm vế của d.270 sống cạnh nhau:
 *
 *   * `1`–`5` chọn phương án; `Cmd/Ctrl+Enter` gửi; `D` nút chính của loại
 *     lệnh/review/fyi; `S` bỏ qua; `J`/`K` lên xuống.
 *
 * Hai luật **không** có trong d.270 mà không thể không có (đã khai ở
 * `cau-hoi-spec.md` #108):
 *
 *   * **Đang gõ trong một ô thì chữ là chữ, không là phím tắt.** Không có luật
 *     này thì gõ "ngưỡng 500" vào ô ghi thêm sẽ bấm `5` → đổi phương án, và gõ
 *     "sẽ" sẽ mở ô Bỏ qua. `Cmd/Ctrl+Enter` thì **vẫn** gửi khi đang gõ — đó là
 *     đúng chỗ người ta dùng nó.
 *   * **Có phím phụ (Alt, hoặc Cmd/Ctrl với một phím khác `Enter`) thì nhường** —
 *     `Cmd+D` là đánh dấu trang của trình duyệt, `Cmd+K` là command menu d.400.
 */
export function hanhDongPhim(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  trong_o_nhap: boolean;
}): HanhDongPhim | null {
  const phu = e.metaKey || e.ctrlKey;
  if (e.key === 'Enter') return phu ? { loai: 'gui' } : null;
  if (phu || e.altKey || e.trong_o_nhap) return null;

  if (/^[1-9]$/.test(e.key)) {
    const so = Number(e.key);
    return so <= SO_PHIM_PHUONG_AN ? { loai: 'phuong-an', so } : null;
  }
  switch (e.key.toLowerCase()) {
    case 'd':
      return { loai: 'chinh' };
    case 's':
      return { loai: 'bo-qua' };
    case 'j':
      return { loai: 'xuong' };
    case 'k':
      return { loai: 'len' };
    default:
      return null;
  }
}

/* ================================================================== *
 * 3. Cập nhật lạc quan — d.265 + d.418
 * ================================================================== */

interface BienGui {
  the: { id: string; ma: string; loai: LoaiCanChu; muc: MucDoKhan; tieu_de: string };
  /** `null` = **bỏ qua** (d.264); ngược lại là thân `xu-ly`. */
  than: ThanXuLyMuc | null;
  ly_do_bo_qua?: string;
  /** Đang trong phiên duyệt (d.274) — để đếm N và M. */
  trong_phien?: boolean;
}

interface AnhChup {
  man: ManHinhCanChu | undefined;
  da: BangDaXuLyRa | undefined;
  /** Vé sổ ghi lạc quan (BAT-27, `ghi-lac-quan.ts`) — trả ở `onSettled`. */
  ghi: VeGhiLacQuan;
  /**
   * Hai khoá đã ghi lạc quan, chụp ở dòng đầu `onMutate` (BAT-28): đổi bộ lọc
   * giữa chừng thì `onError` (của lần vẽ mới nhất) phải hoàn vào khoá **cũ**.
   */
  k_man: readonly unknown[];
  k_da: readonly unknown[];
}

/** Chữ kết quả **tạm** cho dòng vừa chuyển xuống bảng Đã xử lý. */
function ketQuaTam(b: BienGui): string {
  if (b.than === null) return b.ly_do_bo_qua ?? '';
  const ve: string[] = [];
  if (b.than.phuong_an !== undefined) ve.push(b.than.phuong_an);
  if (b.than.ket_luan !== undefined) {
    ve.push(b.than.ket_luan === 'dat' ? NHAN_DAT : NHAN_CAN_SUA);
  }
  if (b.than.ghi_them !== undefined) ve.push(b.than.ghi_them);
  return ve.join(', ');
}

/**
 * **Bỏ thẻ khỏi ba khối và trừ huy hiệu** — nửa đầu của d.265 ("Thẻ chuyển
 * **ngay** xuống Đã xử lý").
 *
 * Hàm thuần trên thân đã tải, nên luật "thẻ rời khối của nó, huy hiệu giảm đúng
 * một" test được mà không cần cả một cây React.
 */
export function boTheKhoiMan(man: ManHinhCanChu, id: string): ManHinhCanChu {
  const khoi = man.khoi.map((k) => ({ ...k, items: k.items.filter((t) => t.id !== id) }));
  const con = man.khoi.flatMap((k) => k.items).find((t) => t.id === id);
  if (con === undefined) return { ...man, khoi };

  const so_theo_muc = { ...man.huy_hieu.so_theo_muc };
  so_theo_muc[con.muc] = Math.max(0, so_theo_muc[con.muc] - 1);
  const so_cho = Math.max(0, man.huy_hieu.so_cho - 1);
  const cao = MUC_THEO_DO_KHAN.find((m) => so_theo_muc[m] > 0) ?? null;
  // `bay_gio` đi nguyên: mốc của máy chủ không đổi vì một thẻ rời màn hình.
  return { huy_hieu: { so_cho, muc_cao_nhat: cao, so_theo_muc }, khoi, bay_gio: man.bay_gio };
}

/** Dòng tạm cho bảng Đã xử lý — nửa sau của d.265. */
export function dongTam(b: BienGui, luc: number, ngay: string): DongDaXuLy {
  return {
    id: b.the.id,
    ma: b.the.ma,
    ngay,
    xu_ly_luc: luc,
    tieu_de: b.the.tieu_de,
    tieu_de_ngan: b.the.tieu_de,
    ket_qua: ketQuaTam(b),
    trang_thai: b.than === null ? 'skipped' : 'resolved',
    loai: b.the.loai,
    project_id: null,
    ket_luan_review: b.than?.ket_luan ?? null,
  };
}

/** `YYYY-MM-DD` **giờ Việt Nam** cho dòng tạm; máy chủ sẽ trả bản thật ngay sau. */
function ngayHomNay(luc: number): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return p.format(new Date(luc));
}

/* ================================================================== *
 * 4. Trang
 * ================================================================== */

export function TrangCanChu(): React.JSX.Element {
  const [sp, datSp] = useSearchParams();
  const loc = useMemo(() => locTuUrl(sp), [sp]);
  const k_man = useMemo(() => ['can-chu', 'man-hinh', loc] as const, [loc]);
  const k_da = useMemo(() => ['can-chu', 'da-xu-ly', loc] as const, [loc]);

  /*
   * Bản `_DANH_SACH` cho cả hai: khoá **mang bộ lọc** (`loc`), nên mỗi lần chủ
   * đổi mức/dự án/khoảng ngày là một khoá mới chưa có cache — không giữ bản cũ
   * thì cả màn hình trống trắng một nhịp (d.419 "không có màn hình chờ").
   */
  const qc_ct = useQueryClient();
  // BAT-27: nhịp của mỗi khoá tắt khi `useGuiTraLoi` đang ghi lạc quan vào nó.
  const man = useQuery({
    queryKey: k_man,
    queryFn: () => layManHinhCanChu(loc),
    ...nhipLamMoiDanhSach(qc_ct),
  });
  const da = useQuery({
    queryKey: k_da,
    queryFn: () => layDaXuLy(loc),
    ...nhipLamMoiDanhSach(qc_ct),
  });
  // **Một** dấu cho cả trang, không một dấu cho mỗi query: hai ô "đang làm mới"
  // nhấp nháy lệch pha nhau còn tệ hơn một ô.
  const { hien_dau } = useNhipLamMoi(man.isFetching || da.isFetching, [k_man, k_da]);
  const du_an = useQuery({ queryKey: ['du-an'], queryFn: layDuAn });

  const [nhap, datNhapMap] = useState<Record<string, NhapThe>>({});
  const datNhap = useCallback((id: string, v: Partial<NhapThe>) => {
    datNhapMap((cu) => ({ ...cu, [id]: { ...(cu[id] ?? NHAP_RONG), ...v } }));
  }, []);

  const [phien, datPhien] = useState<{ xu_ly: number; bo_qua: number; xong: boolean } | null>(
    null,
  );

  const gui = useGuiTraLoi({ k_man, k_da, datPhien });

  const guiThe = useCallback(
    (b: BienGui) => {
      datNhapMap((cu) => ({ ...cu, [b.the.id]: NHAP_RONG }));
      gui.mutate({ ...b, trong_phien: phien !== null && !phien.xong });
    },
    [gui, phien],
  );

  /*
   * Bản **chờ được** của `guiThe`, chỉ ô hàng loạt dùng (`cau-hoi-spec.md` #107).
   *
   * Lô phải chạy **tuần tự**, và muốn tuần tự thì phải chờ được từng mục. Bắn N
   * mutation song song thì mỗi cái tự `cancelQueries` + chụp ảnh, nên ảnh của
   * mutation thứ k đã chứa bản lạc quan của k−1: mục thứ 3 bị máy chủ từ chối sẽ
   * hoàn về một ảnh **cũ hơn**, và hai mục đã thành công **mọc lại** trên màn
   * hình cho tới lần `onSettled` kế. Không mất dữ liệu, nhưng màn hình nói sai.
   *
   * `catch` rỗng là có chủ ý: `onError` đã hoàn cache và báo toast: một mục bị từ
   * chối **không** được làm dừng các mục còn lại của lô.
   */
  const guiCho = useCallback(
    async (b: BienGui): Promise<void> => {
      datNhapMap((cu) => ({ ...cu, [b.the.id]: NHAP_RONG }));
      try {
        await gui.mutateAsync({ ...b, trong_phien: phien !== null && !phien.xong });
      } catch {
        /* đã báo ở `onError` */
      }
    },
    [gui, phien],
  );

  const khoi = man.data?.khoi ?? [];
  const cho = khoi.flatMap((k) => k.items);

  /*
   * **Thẻ đang chọn** cho d.270. Trong phiên duyệt chỉ có **một** thẻ trên màn
   * hình (d.274), nên tầm với của phím đúng bằng thẻ đó — `J`/`K` không có chỗ
   * nào để đi, và đó là đúng: nhảy sang một thẻ không hiện là bấm vào thứ không
   * thấy.
   */
  const trong_phien = phien !== null && !phien.xong;
  const ds_phim = trong_phien ? cho.slice(0, 1) : cho;
  const [chon_id, datChonId] = useState<string | null>(null);
  /*
   * **Chưa chọn gì thì KHÔNG có thẻ nào đang chọn** — cố ý không `?? ds_phim[0]`
   * (`cau-hoi-spec.md` #108).
   *
   * d.270 không nói phím phá huỷ có cần xác nhận hay không, nhưng mặc định một
   * thẻ sẵn sàng nhận phím ngay khi trang mở là ca xấu nhất của chỗ im lặng đó:
   * vừa vào trang, chưa bấm vào đâu, một phím `d` lạc là **xử lý xong** mục đầu
   * tiên — chỉ lùi được bằng "mở lại" (d.246) và đã kịp ghi một dòng Nhật ký
   * **không sửa được** (d.309). Nên thẻ chọn chỉ có giá trị sau `J`/`K`/chuột;
   * `J`/`K` tự xử lý ca "chưa chọn" (`i === -1` → thẻ đầu).
   */
  const the_chon = ds_phim.find((t) => t.id === chon_id);

  const { dich, bao_dich } = useMoTheTuUrl({
    sp,
    cho,
    man_da_tai: man.data !== undefined,
    da: da.data?.items,
    da_xong: da.data !== undefined || da.isError,
    datChonId,
  });

  usePhimTat({ ds: ds_phim, the_chon, nhap, datNhap, datChonId, gui: guiThe });

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-6">
      <header data-hang="nut" className="flex flex-wrap items-center justify-between gap-3">
        {/* Dấu làm mới **trong** hàng tiêu đề — nếp chung, xem `trang/tong-quan.tsx`. */}
        <div className="flex items-center gap-3">
          <h1 className={LOP_TIEU_DE_TRANG}>{TEN_TRANG}</h1>
          <DauLamMoi hien={hien_dau} />
        </div>
        <button
          type="button"
          data-nut="phien-duyet"
          onClick={() => datPhien({ xu_ly: 0, bo_qua: 0, xong: false })}
          className={`rounded px-3 py-1 text-sm ${NUT_CHINH}`}
        >
          {NHAN_PHIEN_DUYET}
        </button>
      </header>

      <ThanhLoc sp={sp} datSp={datSp} du_an={du_an.data?.items ?? []} />

      {/* #154 (BAT-37): dòng báo của `?the=<T-số>` — vùng sống luôn có trong DOM. */}
      <p role="status" data-o="bao-the" className="text-sm text-neutral-600 empty:hidden">
        {bao_dich}
      </p>

      {man.data === undefined && man.isPending ? (
        <p role="status" className={LOP_CAU_CHO}>
          {CAU_DANG_TAI}
        </p>
      ) : man.data === undefined ? (
        <p role="alert" className={LOP_CAU_LOI}>
          {man.error instanceof LoiApi ? man.error.message : String(man.error)}
        </p>
      ) : phien !== null ? (
        <PhienDuyet
          phien={phien}
          cho={cho}
          nhap={nhap}
          datNhap={datNhap}
          gui={guiThe}
          bay_gio={man.data.bay_gio}
          ketThuc={() => datPhien((p) => (p === null ? null : { ...p, xong: true }))}
          dong={() => datPhien(null)}
          chon_id={the_chon?.id ?? null}
        />
      ) : (
        <>
          <OHangLoat cho={cho} da={da.data?.items ?? []} gui={guiCho} />

          {MUC_THEO_DO_KHAN.map((m) => (
            <Khoi
              key={m}
              khoi={man.data.khoi.find((k) => k.muc === m) ?? { muc: m, items: [], cursor_sau: null }}
              nhap={nhap}
              datNhap={datNhap}
              gui={guiThe}
              bay_gio={man.data.bay_gio}
              chon_id={the_chon?.id ?? null}
              chon={datChonId}
              noi_ma={dich}
            />
          ))}

          {/*
           * Bảng chưa tải xong thì mốc lấy từ `man.data.bay_gio` — **cũng là mốc
           * máy chủ**, chỉ của lượt gọi kia. Không `Date.now()`: một fallback
           * bằng đồng hồ máy khách là đúng cái đồng hồ thứ hai mà d.412 tránh.
           */}
          <BangDaXuLy
            ds={da.data?.items ?? []}
            bay_gio={da.data?.bay_gio ?? man.data.bay_gio}
            sp={sp}
            datSp={datSp}
            noi_ma={dich}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 4-. Mở đúng một mục từ URL — `?the=<T-số>` (#154, BAT-37)
 * ------------------------------------------------------------------ */

/** So mã không phân biệt hoa thường — người gõ tay `?the=t-31` vẫn tới `T-31`. */
function cungMa(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * Thẻ (`data-the`) hoặc dòng bảng Đã xử lý (`data-dong-da-xu-ly`) mang mã `ma`.
 * Duyệt và so thuộc tính, **không** dựng bộ chọn từ mã: mã đến từ URL, và một
 * chuỗi lạ trong `querySelector` là một lần ném.
 */
function phanTuDich(ma: string): HTMLElement | null {
  for (const e of document.querySelectorAll<HTMLElement>('[data-the],[data-dong-da-xu-ly]')) {
    if ((e.getAttribute('data-the') ?? e.getAttribute('data-dong-da-xu-ly')) === ma) return e;
  }
  return null;
}

interface KetDich {
  /** Giá trị tham số đã xử lý. */
  tham: string;
  /** Mã thật trên trang (đúng hoa thường), `null` = không có. */
  ma: string | null;
  bao: string;
}

/**
 * **`/can-chu?the=<T-số>`** — `cau-hoi-spec.md` #154 (chốt 19/10 T-31, BAT-37).
 *
 *   * Mục còn `Chờ` ⇒ đặt nó làm **thẻ đang chọn** (cùng `chon_id` của d.270 —
 *     không dựng trạng thái chọn thứ hai), cuộn tới, focus, làm nổi (`data-noi`).
 *   * Mục ở bảng Đã xử lý ⇒ cuộn tới + focus + làm nổi dòng đó, kèm dòng báo
 *     `cauTheDaXuLy`.
 *   * Không có ⇒ dòng báo `cauKhongThayThe`; không lỗi.
 *
 * **Một lần cho mỗi giá trị tham số** (`da_lam`): nhịp làm mới 3 giây (d.420) vẽ
 * lại trang liên tục, và mỗi lần vẽ mà giật focus về thẻ là cướp ô chủ đang gõ.
 * Bỏ tham số khỏi URL ⇒ quên, để lần sau tới lại cùng mục vẫn chạy.
 *
 * Mục còn Chờ quyết được ngay khi ba khối về; mục không có ở ba khối thì chờ
 * bảng Đã xử lý về (hoặc lỗi) rồi mới nói "đã xử lý" hay "không tìm thấy".
 */
function useMoTheTuUrl({
  sp,
  cho,
  man_da_tai,
  da,
  da_xong,
  datChonId,
}: {
  sp: URLSearchParams;
  cho: readonly TheCanChu[];
  man_da_tai: boolean;
  da: readonly DongDaXuLy[] | undefined;
  da_xong: boolean;
  datChonId: (id: string) => void;
}): { dich: string | null; bao_dich: string } {
  const tham = (sp.get(KHOA_THE_CAN_CHU) ?? '').trim();
  const da_lam = useRef<string | null>(null);
  const [ket, datKet] = useState<KetDich | null>(null);

  useEffect(() => {
    if (tham === '') {
      da_lam.current = null;
      return;
    }
    if (da_lam.current === tham || !man_da_tai) return;
    const t = cho.find((x) => cungMa(x.ma, tham));
    if (t !== undefined) {
      da_lam.current = tham;
      datChonId(t.id);
      datKet({ tham, ma: t.ma, bao: '' });
      return;
    }
    if (!da_xong) return;
    da_lam.current = tham;
    const d = (da ?? []).find((x) => cungMa(x.ma, tham));
    datKet(
      d === undefined
        ? { tham, ma: null, bao: cauKhongThayThe(tham) }
        : { tham, ma: d.ma, bao: cauTheDaXuLy(d.ma) },
    );
  }, [tham, man_da_tai, cho, da, da_xong, datChonId]);

  // Cuộn + focus sau lần vẽ mang `ket` mới — mỗi `ket` đúng một lần.
  useEffect(() => {
    if (ket === null || ket.ma === null) return;
    const e = phanTuDich(ket.ma);
    if (e === null) return;
    e.focus({ preventScroll: true });
    // jsdom không có `scrollIntoView` — gọi có điều kiện, không ném.
    const cuon: Partial<Pick<HTMLElement, 'scrollIntoView'>> = e;
    cuon.scrollIntoView?.({ block: 'center' });
  }, [ket]);

  const hop = ket !== null && ket.tham === tham;
  return { dich: hop ? ket.ma : null, bao_dich: hop ? ket.bao : '' };
}

/* ------------------------------------------------------------------ *
 * 4a. Phím tắt d.270 — gắn một lần ở trang, không ở từng thẻ
 * ------------------------------------------------------------------ */

/**
 * Nối `hanhDongPhim` (phím → việc) với **thẻ đang chọn** (việc → thẻ nào).
 *
 * Một listener trên `window`, không một `onKeyDown` trên mỗi thẻ: thẻ không có
 * tiêu điểm bàn phím (chủ chưa bấm vào đâu) mà `J`/`K` vẫn phải chạy — và với
 * 200 mục thì 200 listener là 200 lần đăng ký cho một việc.
 *
 * **Không gửi khi điều kiện gửi chưa đủ.** Phím chạy đúng cái nút đang hiện: nút
 * mờ (d.259 `decision` chưa chọn, d.261 `review` Cần sửa chưa ghi chú, d.264 bỏ
 * qua chưa có lý do) thì phím **không** làm gì — nếu không, phím tắt thành một
 * cửa sau đi quanh đúng ba luật mà nút Gửi đang canh.
 */
function usePhimTat({
  ds,
  the_chon,
  nhap,
  datNhap,
  datChonId,
  gui,
}: {
  ds: readonly TheCanChu[];
  the_chon: TheCanChu | undefined;
  nhap: Record<string, NhapThe>;
  datNhap: (id: string, v: Partial<NhapThe>) => void;
  datChonId: (id: string) => void;
  gui: (b: BienGui) => void;
}): void {
  useEffect(() => {
    const nghe = (e: KeyboardEvent): void => {
      // Hộp tạo việc (BAT-22) đang mở: phím thuộc về hộp, không về thẻ phía sau.
      // Bảng phím `?` (BAT-23) cũng vậy.
      // Command menu `Cmd/Ctrl+K` (BAT-34) cũng vậy.
      if (hopTaoViecDangMo() || bangPhimDangMo() || commandMenuDangMo()) return;
      const hd = hanhDongPhim({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        trong_o_nhap: trongONhap(e.target),
      });
      if (hd === null) return;

      // `J`/`K` chạy được cả khi chưa có thẻ nào được chọn tường minh.
      if (hd.loai === 'xuong' || hd.loai === 'len') {
        if (ds.length === 0) return;
        e.preventDefault();
        const i = the_chon === undefined ? -1 : ds.findIndex((t) => t.id === the_chon.id);
        const j = Math.min(ds.length - 1, Math.max(0, i + (hd.loai === 'xuong' ? 1 : -1)));
        const sang = ds[j];
        if (sang !== undefined) datChonId(sang.id);
        return;
      }

      if (the_chon === undefined) return;
      const t = the_chon;
      const n = nhap[t.id] ?? NHAP_RONG;
      const b_the = { id: t.id, ma: t.ma, loai: t.loai, muc: t.muc, tieu_de: t.tieu_de };

      if (hd.loai === 'phuong-an') {
        if (t.loai !== 'decision') return;
        const p = t.phuong_an[hd.so - 1];
        if (p === undefined) return;
        e.preventDefault();
        datNhap(t.id, { phuong_an: p.nhan });
        return;
      }

      if (hd.loai === 'bo-qua') {
        e.preventDefault();
        datNhap(t.id, { bo_qua_mo: true });
        return;
      }

      /*
       * `D` là "nút chính của loại **lệnh, review, fyi**" — d.270 kể ba loại đó
       * và **không** kể `decision`, nên `D` trên một mục Quyết định không làm gì:
       * nút chính của nó là Gửi duyệt, và nó cần một phương án (`1`–`5` rồi
       * `Cmd/Ctrl+Enter`).
       */
      if (hd.loai === 'chinh' && t.loai === 'decision') return;

      // `Cmd/Ctrl+Enter` khi ô Bỏ qua đang mở thì gửi **lý do bỏ qua** — đó là
      // nút Gửi duy nhất đang hiện ở trạng thái đó.
      if (n.bo_qua_mo && hd.loai === 'gui') {
        const ly_do = n.ly_do_bo_qua.trim();
        if (ly_do === '') return;
        e.preventDefault();
        gui({ the: b_the, than: null, ly_do_bo_qua: ly_do });
        return;
      }

      if (!coTheGui(t.loai, n)) return;
      e.preventDefault();
      gui({ the: b_the, than: thanTuNhap(t.loai, n) });
    };

    window.addEventListener('keydown', nghe);
    return () => {
      window.removeEventListener('keydown', nghe);
    };
  }, [ds, the_chon, nhap, datNhap, datChonId, gui]);
}

/* ------------------------------------------------------------------ *
 * 4b. Mutation: cập nhật lạc quan (d.265, d.418)
 * ------------------------------------------------------------------ */

function useGuiTraLoi({
  k_man,
  k_da,
  datPhien,
}: {
  k_man: readonly unknown[];
  k_da: readonly unknown[];
  datPhien: React.Dispatch<
    React.SetStateAction<{ xu_ly: number; bo_qua: number; xong: boolean } | null>
  >;
}): UseMutationResult<unknown, Error, BienGui, AnhChup> {
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  return useMutation<unknown, Error, BienGui, AnhChup>({
    mutationFn: (b) =>
      b.than === null ? boQuaMuc(b.the.id, b.ly_do_bo_qua ?? '') : xuLyMuc(b.the.id, b.than),

    /*
     * **Hiện NGAY, trước khi máy chủ trả lời** — d.265 + d.418. Ba việc, đúng
     * thứ tự: dừng mọi lần tải đang bay (nếu không, một phản hồi cũ về sau sẽ
     * ghi đè bản lạc quan và thẻ **mọc lại**), chụp ảnh để hoàn, rồi sửa cache.
     */
    onMutate: async (b) => {
      /*
       * BAT-27: trước mọi `await` — đóng nhịp + cổng quay-lại-tab cho **hai** khoá
       * sắp ghi. Thân còn lại ném ⇒ trả vé rồi ném tiếp (`onSettled` khi đó nhận
       * ngữ cảnh `undefined`, nên không trả lần hai).
       */
      // BAT-28: chụp hai khoá (bộ lọc lúc bấm) — xem `AnhChup.k_man`.
      const km = k_man;
      const kd = k_da;
      const ghi = batDauGhiLacQuan(qc, [km, kd]);
      try {
        await qc.cancelQueries({ queryKey: km });
        await qc.cancelQueries({ queryKey: kd });

        const anh: AnhChup = {
          man: qc.getQueryData<ManHinhCanChu>(km),
          da: qc.getQueryData<BangDaXuLyRa>(kd),
          ghi,
          k_man: km,
          k_da: kd,
        };

        if (anh.man !== undefined) {
          qc.setQueryData<ManHinhCanChu>(km, boTheKhoiMan(anh.man, b.the.id));
        }
        const luc = Date.now();
        /*
         * `bay_gio` của bản **lạc quan**: mốc đã có của máy chủ nếu còn, nếu không
         * thì `luc` — **cùng** đồng hồ vừa đặt `xu_ly_luc` của dòng tạm, nên chữ
         * tương đối đọc ra "0 giây trước" chứ không một con số lệch. Lần
         * `invalidateQueries` ngay sau đó trả lại mốc thật của máy chủ.
         */
        qc.setQueryData<BangDaXuLyRa>(kd, (cu) => ({
          items: [dongTam(b, luc, ngayHomNay(luc)), ...(cu?.items ?? [])],
          cursor_sau: cu?.cursor_sau ?? null,
          bay_gio: cu?.bay_gio ?? luc,
        }));

        if (b.trong_phien === true) {
          datPhien((p) =>
            p === null
              ? p
              : b.than === null
                ? { ...p, bo_qua: p.bo_qua + 1 }
                : { ...p, xu_ly: p.xu_ly + 1 },
          );
        }
        return anh;
      } catch (e) {
        ketThucGhiLacQuan(qc, ghi);
        throw e;
      }
    },

    /*
     * **Máy chủ từ chối ⇒ hoàn lại và báo toast ghi rõ lý do** — d.418.
     *
     * Câu đi **nguyên văn** từ `message` của máy chủ (nếp `src/api.ts`): mục 13
     * d.379 bắt mọi lỗi mang câu tiếng Việt, nên giao diện không dịch mã lỗi lần
     * thứ hai. `ALREADY_RESOLVED` của 19.10 là ca thật nhất ở đây — hai tab mở
     * cùng một mục.
     */
    onError: (loi, b, anh) => {
      // Hoàn vào hai khoá ĐÃ GHI (ngữ cảnh), không khoá của bộ lọc đang chọn lúc này.
      if (anh !== undefined && anh.man !== undefined) qc.setQueryData(anh.k_man, anh.man);
      if (anh !== undefined && anh.da !== undefined) qc.setQueryData(anh.k_da, anh.da);
      if (b.trong_phien === true) {
        datPhien((p) =>
          p === null
            ? p
            : b.than === null
              ? { ...p, bo_qua: Math.max(0, p.bo_qua - 1) }
              : { ...p, xu_ly: Math.max(0, p.xu_ly - 1) },
        );
      }
      toast.bao(loi instanceof LoiApi ? loi.message : String(loi.message));
    },

    /*
     * `onSettled`, **không** `onSuccess`: nhánh lỗi cũng phải tải lại. Bản lạc
     * quan vừa bị hoàn về một **ảnh chụp cũ**, và nếu máy chủ từ chối vì mục đã
     * bị xử lý ở nơi khác thì ảnh cũ ấy đang nói sai — thẻ hiện lại dù nó không
     * còn `Chờ`. Có ca test lật `onSettled` → `onSuccess` (đỏ).
     */
    /*
     * **Một** lời gọi với khoá tiền tố `['can-chu']`, không hai lời gọi theo
     * `k_man`/`k_da`.
     *
     * `invalidateQueries` khớp **tiền tố**, nên `['can-chu']` trùm cả
     * `['can-chu','man-hinh',loc]`, `['can-chu','da-xu-ly',loc]` **và**
     * `['can-chu','huy-hieu']` — huy hiệu sidebar. Hai lời gọi theo khoá đầy đủ
     * bỏ sót đúng cái thứ ba, và chủ dùng thật đã gặp: xử lý xong mục cuối, màn
     * hình trống, mà sidebar vẫn đỏ **(1)**.
     *
     * Nó cũng trùm các khoá `['can-chu', …]` của **bộ lọc khác** đang nằm trong
     * cache (chủ vừa đổi mức). Đó là đúng: một mục vừa xử lý thì mọi bản danh
     * sách Cần Chủ trong cache đều đang nói sai, và `refetchType` mặc định
     * (`'active'`) chỉ **tải lại** bản đang có người xem — các bản kia chỉ bị đánh
     * dấu cũ, không sinh request nào.
     */
    /*
     * BAT-28: `lamMoiTheoSo`, không `invalidateQueries` trần — hai lần Gửi liên
     * tiếp: lần 1 xong thì `['can-chu']` trùm cả hai khoá lần 2 **còn đang ghi**;
     * GET khi đó (máy chủ chưa nhận lần 2) đưa thẻ lần 2 mọc lại (d.418). Hai khoá
     * ấy được hoãn tới khi lần 2 xong; huy hiệu (anh em) vẫn làm mới ngay. Khoá
     * tiền tố cố định, nên không cần khoá trong ngữ cảnh ở đây.
     */
    onSettled: (_d, _l, _b, anh) => {
      // BAT-27: trả vé **trước** khi tải lại, để lượt tải đó bật lại nhịp.
      ketThucGhiLacQuan(qc, anh?.ghi);
      void lamMoiTheoSo(qc, { queryKey: ['can-chu'] });
    },
  });
}

/* ================================================================== *
 * 5. Thanh lọc — d.252, d.251 (khoảng ngày), ghi trên URL
 * ================================================================== */

function ThanhLoc({
  sp,
  datSp,
  du_an,
}: {
  sp: URLSearchParams;
  datSp: (v: URLSearchParams) => void;
  du_an: readonly DuAnSidebar[];
}): React.JSX.Element {
  const dat = (khoa: string, gia_tri: string): void => {
    const moi = new URLSearchParams(sp);
    if (gia_tri === '') moi.delete(khoa);
    else moi.set(khoa, gia_tri);
    datSp(moi);
  };

  return (
    <section aria-label="Bộ lọc" data-khoi="loc" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs">
        Dự án
        <select
          data-loc={KHOA_LOC.du_an}
          value={sp.get(KHOA_LOC.du_an) ?? ''}
          onChange={(e) => dat(KHOA_LOC.du_an, e.target.value)}
          className={LOP_O_NHAP}
        >
          <option value="">Tất cả dự án</option>
          {/* 19.12 câu 4: bộ lọc dự án có lựa chọn **Chung** cho mục không dự án. */}
          <option value="chung">Chung</option>
          {du_an.map((d) => (
            <option key={d.id} value={d.id}>
              {d.ten}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        Loại
        <select
          data-loc={KHOA_LOC.loai}
          value={sp.get(KHOA_LOC.loai) ?? ''}
          onChange={(e) => dat(KHOA_LOC.loai, e.target.value)}
          className={LOP_O_NHAP}
        >
          <option value="">Mọi loại</option>
          {(Object.keys(NHAN_LOAI) as LoaiCanChu[]).map((l) => (
            <option key={l} value={l}>
              {NHAN_LOAI[l]}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

/* ================================================================== *
 * 6. Một khối — d.249
 * ================================================================== */

function Khoi({
  khoi,
  nhap,
  datNhap,
  gui,
  bay_gio,
  chon_id,
  chon,
  noi_ma = null,
}: {
  khoi: KhoiCanChu;
  nhap: Record<string, NhapThe>;
  datNhap: (id: string, v: Partial<NhapThe>) => void;
  gui: (b: BienGui) => void;
  bay_gio: number;
  chon_id: string | null;
  chon: (id: string) => void;
  /** Mã của mục mà `?the=` trỏ tới (#154) — thẻ đó được làm nổi. */
  noi_ma?: string | null;
}): React.JSX.Element {
  const ten = NHAN_MUC[khoi.muc];
  return (
    <section aria-label={ten} data-khoi={khoi.muc} className="flex flex-col gap-2">
      {/*
       * Đầu khối (hệ thiết kế 29/10): chấm mức gấp (đỏ/vàng/xám) + tên + số đếm
       * xám — không tô nền màu cả khối hay cả thẻ.
       */}
      <h2 className={`flex items-center gap-2 ${LOP_TIEU_DE_MUC}`}>
        <ChamMucGap muc={khoi.muc} />
        {ten}{' '}
        <span data-so="khoi" className="font-normal text-chu-mo-hon tabular-nums">
          {khoi.items.length}
        </span>
      </h2>
      {khoi.items.length === 0 ? (
        <p className="text-sm text-chu-mo">{CAU_KHOI_RONG}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {khoi.items.map((t) => (
            <li key={t.id}>
              <The
                the={t}
                nhap={nhap[t.id] ?? NHAP_RONG}
                datNhap={datNhap}
                gui={gui}
                bay_gio={bay_gio}
                dang_chon={t.id === chon_id}
                chon={chon}
                noi={t.ma === noi_ma}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== *
 * 7. Một thẻ — d.250 + bảng d.257–262
 * ================================================================== */

export function The({
  the,
  nhap,
  datNhap,
  gui,
  bay_gio,
  dang_chon = false,
  chon,
  noi = false,
}: {
  the: TheCanChu;
  nhap: NhapThe;
  datNhap: (id: string, v: Partial<NhapThe>) => void;
  gui: (b: BienGui) => void;
  /** Mốc "bây giờ" **của máy chủ** (`ManHinhCanChu.bay_gio`) — d.412. */
  bay_gio: number;
  /** Thẻ mà phím tắt d.270 đang trỏ tới. */
  dang_chon?: boolean;
  chon?: (id: string) => void;
  /** Mục mà `?the=<T-số>` trỏ tới (#154) — làm nổi + nhận focus. */
  noi?: boolean;
}): React.JSX.Element {
  const b_the = {
    id: the.id,
    ma: the.ma,
    loai: the.loai,
    muc: the.muc,
    tieu_de: the.tieu_de,
  };

  return (
    <article
      data-the={the.ma}
      data-qua-han={the.qua_han ? 'co' : 'khong'}
      data-dang-chon={dang_chon ? 'co' : 'khong'}
      data-noi={noi ? 'co' : undefined}
      aria-current={noi ? 'true' : undefined}
      tabIndex={noi ? -1 : undefined}
      /*
       * Bấm vào thẻ là **chọn** nó cho phím tắt (d.270) — `onFocus` cũng bắt,
       * nên đi bằng Tab cũng dời đích của phím theo đúng chỗ đang nhìn. Không
       * `onClick` trên một `<article>` làm nút: nó không chặn gì, chỉ ghi lại
       * cái thẻ đang được chạm.
       */
      onMouseDown={() => chon?.(the.id)}
      onFocus={() => chon?.(the.id)}
      /* d.249: "Mục quá hạn có **viền đỏ**". */
      className={`flex flex-col gap-2 rounded-lg border bg-nen-lop p-3 ${
        /*
         * **Viền đỏ giữ nguyên `border-red-600`** ở cả hai chế độ, không đổi
         * sang token `border-loi` (đỏ nhạt ở chế độ tối): d.252 nói "viền đỏ",
         * và `red-600` đủ tương phản trên cả nền trắng và nền `#0d0d10`. Ca test
         * d.249 ghim đúng tên class này.
         */
        the.qua_han ? 'border-red-600' : 'border-vien'
      } ${dang_chon ? 'ring-1 ring-chu-mo' : ''} ${noi ? 'shadow-md outline-2 outline-offset-2 outline-neutral-500' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-2 text-xs text-chu-mo">
        {/*
         * Chấm mức gấp trước mã: thẻ này còn được vẽ ở chi tiết ticket
         * (`KhoiCanChu`), nơi không có đầu khối nói mức gấp. Tên mức ở `title`
         * (rê chuột), KHÔNG ở `<title>` của SVG: chữ "Khẩn" thứ hai trong DOM
         * làm các phép tìm theo chữ của khối thấy hai phần tử.
         */}
        <span data-o="muc-gap" title={NHAN_MUC[the.muc]} className="inline-flex">
          <ChamMucGap muc={the.muc} />
        </span>
        <span data-o="ma" className="ma-ticket">
          {the.ma}
        </span>
        {/* d.250 "dự án" — mục Chung (19.12 câu 4) hiện đúng chữ "Chung". */}
        <span data-o="du-an" className="text-chu-mo">
          {the.du_an?.ten ?? 'Chung'}
        </span>
        <span data-o="loai" data-loai={the.loai} className="text-chu-mo">
          {NHAN_LOAI[the.loai]}
        </span>
        {/*
          * **Hạn — d.412**: chữ **tương đối** trên màn hình ("trong 2 giờ"),
          * **giờ đầy đủ** khi rê chuột (`title`).
          *
          * Mốc "bây giờ" là `ManHinhCanChu.bay_gio`, tức **đồng hồ máy chủ** —
          * đúng cái đồng hồ đã tính `qua_han` / `qua_han_gio` của chính thẻ này.
          * Đếm từ `Date.now()` của trình duyệt sẽ đặt một đồng hồ **thứ hai**
          * cạnh nó, và một máy lệch giờ sẽ hiện "trong 2 giờ" ngay cạnh nhãn
          * "quá hạn 3 giờ".
          */}
        {the.han_luc === null ? null : (
          <time
            dateTime={new Date(the.han_luc).toISOString()}
            title={gioDayDu(the.han_luc)}
            data-o="han"
            className="text-neutral-500"
          >
            Hạn {thoiGianTuongDoi(the.han_luc, bay_gio)}
          </time>
        )}
        {the.qua_han && the.qua_han_gio !== null ? (
          <span data-o="qua-han" className="font-semibold text-loi">
            {cauQuaHan(the.qua_han_gio)}
          </span>
        ) : null}
      </header>

      <h3 className="text-sm font-medium text-chu">{the.tieu_de}</h3>

      {the.boi_canh === null || the.boi_canh.trim() === '' ? null : (
        <BoiCanh van={the.boi_canh} />
      )}

      {/*
        * d.250: "lệnh có nút Copy"; d.237: ghi chú TTY.
        *
        * Điều kiện là "**có lệnh**", không "loại là `run_command`" — d.250 viết
        * chung cho mọi thẻ, và từ lượt này máy chủ giữ lệnh cho cả bốn loại
        * (`cau-hoi-spec.md` #130). Nút chính và điều kiện bật nút của bảng
        * d.257–262 **không** đổi: khối lệnh chỉ hiện thêm.
        */}
      {the.lenh === null ? null : <OLenh lenh={the.lenh} can_tty={the.can_tty} />}

      {/* d.250: "file có link" — nút mở file/link của d.261. */}
      {the.file.length === 0 ? null : (
        <ul data-ds="file" className="flex flex-wrap gap-2 text-xs">
          {the.file.map((f) => (
            <li key={`${f.loai}-${String(f.thu_tu)}`}>
              <LienFile dia_chi={f.dia_chi} />
            </li>
          ))}
        </ul>
      )}

      {/* d.250: "ticket liên quan". */}
      {the.ticket_lien_quan.length === 0 ? null : (
        <ul data-ds="ticket" className="flex flex-wrap gap-2 text-xs">
          {the.ticket_lien_quan.map((t) => (
            <li key={t.id}>
              <Link to={duongTicket(t.ma)} className="font-mono underline">
                {t.ma}
              </Link>{' '}
              <span className="text-neutral-600">{t.tieu_de}</span>
            </li>
          ))}
        </ul>
      )}

      <TraLoi the={the} nhap={nhap} datNhap={datNhap} gui={gui} b_the={b_the} />
    </article>
  );
}

/**
 * **Bối cảnh markdown, mặc định gập sau 6 dòng** — d.250.
 *
 * Gập theo **dòng nguồn**, không theo chiều cao đo được: một `max-height` CSS
 * không kiểm chứng được trong jsdom (không có layout), nên luật "6 dòng" sẽ
 * không có ca nào canh. Đếm dòng là một con số, và nó khớp đúng chữ của SPEC.
 */
export function BoiCanh({ van }: { van: string }): React.JSX.Element {
  const [mo, datMo] = useState(false);
  const dong = van.split('\n');
  const gap_duoc = dong.length > SO_DONG_GAP;
  const hien = !gap_duoc || mo ? van : dong.slice(0, SO_DONG_GAP).join('\n');

  return (
    <div data-o="boi-canh" data-gap={gap_duoc && !mo ? 'co' : 'khong'}>
      <Markdown van={hien} />
      {gap_duoc ? (
        <button
          type="button"
          data-nut="gap-boi-canh"
          onClick={() => datMo(!mo)}
          className="mt-1 text-xs text-neutral-600 underline"
        >
          {mo ? 'Thu gọn' : `Mở rộng (còn ${String(dong.length - SO_DONG_GAP)} dòng)`}
        </button>
      ) : null}
    </div>
  );
}

/** Lệnh trong khối code + nút Copy (+ ghi chú TTY) — d.237, d.250, d.260. */
function OLenh({ lenh, can_tty }: { lenh: string; can_tty: boolean }): React.JSX.Element {
  const [da_copy, datDaCopy] = useState(false);

  const copy = (): void => {
    /*
     * `navigator.clipboard` **không** có trong mọi môi trường (jsdom, http
     * không bảo mật) — nên nó được hỏi, không giả định. Không có thì nút vẫn
     * bấm được và không ném: lệnh vẫn hiện nguyên văn trong khối code, chủ bôi
     * đen copy được. Mất một tiện ích, không mất một vế SPEC.
     */
    const cb: Clipboard | undefined = navigator.clipboard;
    if (cb !== undefined) void cb.writeText(lenh);
    datDaCopy(true);
  };

  return (
    <div data-o="lenh" className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        {/*
         * `text-neutral-900` viết **tường minh** cạnh `bg-neutral-100`, dù chữ
         * thừa hưởng đã gần đúng màu ấy: lưới tương phản của
         * `test/vo-linear.test.tsx` chỉ ghép được một cặp khi **cùng một đoạn
         * class** có cả nền và chữ, nên một khối nền-không-chữ là một cặp
         * **không ai đo**. Đây là chỗ reviewer bắt được ở Phần 1.
         */}
        <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-neutral-100 p-2 font-mono text-xs text-neutral-900">
          {lenh}
        </pre>
        <button
          type="button"
          data-nut="copy"
          onClick={copy}
          className={`rounded px-2 py-1 text-xs ${NUT_PHU}`}
        >
          {NHAN_COPY}
        </button>
      </div>
      {da_copy ? (
        <span data-o="da-copy" className="text-xs text-neutral-500">
          Đã copy
        </span>
      ) : null}
      {can_tty ? (
        <span data-o="can-tty" className="text-xs font-semibold text-canh">
          {CAU_TERMINAL_THAT}
        </span>
      ) : null}
    </div>
  );
}

/** Nút mở file hoặc link — d.261. Scheme qua `hinhCuaDiaChi` (fail-closed). */
export function LienFile({ dia_chi }: { dia_chi: string }): React.JSX.Element {
  const h = hinhCuaDiaChi(dia_chi);
  if (h.hinh === 'ngoai') {
    return (
      <a
        href={h.href}
        data-file="an-toan"
        rel="noreferrer"
        className="rounded border border-neutral-300 px-2 py-1 underline"
      >
        Mở {dia_chi}
      </a>
    );
  }
  if (h.hinh === 'trong') {
    return (
      <Link
        to={h.duong}
        data-file="trong"
        className="rounded border border-neutral-300 px-2 py-1 underline"
      >
        Mở {dia_chi}
      </Link>
    );
  }
  return (
    <span data-file="khong-an-toan" className="break-all text-neutral-600">
      {dia_chi}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * 7b. Khối trả lời — bảng d.257–262 + d.264
 * ------------------------------------------------------------------ */

function TraLoi({
  the,
  nhap,
  datNhap,
  gui,
  b_the,
}: {
  the: TheCanChu;
  nhap: NhapThe;
  datNhap: (id: string, v: Partial<NhapThe>) => void;
  gui: (b: BienGui) => void;
  b_the: BienGui['the'];
}): React.JSX.Element {
  const bat = coTheGui(the.loai, nhap);
  const can_ghi_chu =
    the.loai === 'review' && nhap.ket_luan === 'can_sua' && nhap.ghi_them.trim() === '';

  return (
    <div data-o="tra-loi" className="flex flex-col gap-2">
      {/* `decision` — mỗi phương án MỘT NÚT CHỌN; bấm cái khác thì đổi (d.259). */}
      {the.loai === 'decision' ? (
        <ul data-ds="phuong-an" className="flex flex-col gap-1">
          {the.phuong_an.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-phuong-an={p.nhan}
                aria-pressed={nhap.phuong_an === p.nhan}
                onClick={() => datNhap(the.id, { phuong_an: p.nhan })}
                className={`w-full rounded border px-2 py-1 text-left text-sm ${
                  nhap.phuong_an === p.nhan
                    ? 'border-chu-mo bg-nen-noi text-chu'
                    : 'border-vien text-chu hover:bg-nen-noi'
                }`}
              >
                <span className="font-semibold">{p.nhan}</span> {p.noi_dung}
                {p.de_xuat ? (
                  <span
                    data-de-xuat="co"
                    className={`ml-2 ${LOP_CHIP}`}
                  >
                    {NHAN_DE_XUAT}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* `review` — hai nút chọn Đạt / Cần sửa (d.261). */}
      {the.loai === 'review' ? (
        <div data-ds="ket-luan" data-hang="nut" className="flex flex-wrap gap-2">
          {(
            [
              ['dat', NHAN_DAT],
              ['can_sua', NHAN_CAN_SUA],
            ] as const
          ).map(([ma, ten]) => (
            <button
              key={ma}
              type="button"
              data-ket-luan={ma}
              aria-pressed={nhap.ket_luan === ma}
              onClick={() => datNhap(the.id, { ket_luan: ma })}
              className={`rounded border px-2 py-1 text-sm ${
                nhap.ket_luan === ma ? 'border-chu-mo bg-nen-noi text-chu' : 'border-vien text-chu hover:bg-nen-noi'
              }`}
            >
              {ten}
            </button>
          ))}
        </div>
      ) : null}

      {/* Ô "ghi thêm" / "kết quả" — TUỲ CHỌN với mọi loại (d.259, d.260). */}
      {the.loai === 'fyi' ? null : (
        <label className="flex flex-col gap-1 text-xs">
          {the.loai === 'run_command'
            ? NHAN_KET_QUA
            : the.loai === 'decision'
              ? NHAN_GHI_THEM_DECISION
              : NHAN_GHI_THEM}
          <textarea
            data-o="ghi-them"
            rows={2}
            value={nhap.ghi_them}
            onChange={(e) => datNhap(the.id, { ghi_them: e.target.value })}
            className={LOP_O_NHAP}
          />
        </label>
      )}

      {/* "Cần sửa thì **bắt buộc ghi chú**" — nói rõ vì sao nút đang mờ. */}
      {can_ghi_chu ? (
        <p role="alert" data-o="can-ghi-chu" className="text-xs text-loi">
          {CAU_CAN_SUA_CAN_GHI_CHU}
        </p>
      ) : null}

      <div data-hang="nut" className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-nut="gui"
          disabled={!bat}
          onClick={() => gui({ the: b_the, than: thanTuNhap(the.loai, nhap) })}
          /*
           * Mờ cho tới khi **trả lời được**: `decision` cần một phương án
           * **hoặc** một câu tự do ở ô "Ghi thêm" (d.259 nới theo d.244 và yêu
           * cầu của chủ 11/10 — `cau-hoi-spec.md` #121); `review` cần Đạt/Cần
           * sửa, và Cần sửa cần ghi chú (d.261). Luật ở `coTheGui`.
           */
          className={`rounded px-3 py-1 text-sm ${bat ? NUT_CHINH : NUT_MO}`}
        >
          {NHAN_GUI[the.loai]}
        </button>

        {/* d.264 — link nhỏ "Bỏ qua" trên **mọi** thẻ. */}
        <button
          type="button"
          data-nut="bo-qua"
          onClick={() => datNhap(the.id, { bo_qua_mo: !nhap.bo_qua_mo })}
          className="text-xs text-neutral-600 underline"
        >
          {NHAN_BO_QUA}
        </button>
      </div>

      {nhap.bo_qua_mo ? (
        <OBoQua
          nhap={nhap}
          datNhap={(v) => datNhap(the.id, v)}
          gui={() => gui({ the: b_the, than: null, ly_do_bo_qua: nhap.ly_do_bo_qua.trim() })}
        />
      ) : null}
    </div>
  );
}

/** Ô "Bỏ qua": **bắt buộc nhập lý do** rồi Gửi — d.264. */
function OBoQua({
  nhap,
  datNhap,
  gui,
}: {
  nhap: NhapThe;
  datNhap: (v: Partial<NhapThe>) => void;
  gui: () => void;
}): React.JSX.Element {
  const co = nhap.ly_do_bo_qua.trim() !== '';
  return (
    <div data-o="o-bo-qua" className="flex flex-col gap-1 rounded bg-neutral-50 p-2">
      <label className="flex flex-col gap-1 text-xs">
        Lý do bỏ qua
        <input
          data-o="ly-do-bo-qua"
          value={nhap.ly_do_bo_qua}
          onChange={(e) => datNhap({ ly_do_bo_qua: e.target.value })}
          className={LOP_O_NHAP}
        />
      </label>
      {co ? null : (
        <p role="alert" data-o="can-ly-do" className="text-xs text-loi">
          {CAU_BO_QUA_CAN_LY_DO}
        </p>
      )}
      <button
        type="button"
        data-nut="gui-bo-qua"
        disabled={!co}
        onClick={gui}
        className={`self-start rounded px-3 py-1 text-sm ${co ? NUT_CHINH : NUT_MO}`}
      >
        Gửi
      </button>
    </div>
  );
}

/* ================================================================== *
 * 8. Bảng "Đã xử lý" — d.251
 * ================================================================== */

function BangDaXuLy({
  ds,
  bay_gio,
  sp,
  datSp,
  noi_ma = null,
}: {
  ds: readonly DongDaXuLy[];
  /** Mốc "bây giờ" **của máy chủ** (`BangDaXuLyRa.bay_gio`) — d.412. */
  bay_gio: number;
  sp: URLSearchParams;
  datSp: (v: URLSearchParams) => void;
  /** Mã của mục mà `?the=` trỏ tới (#154) — dòng đó được làm nổi. */
  noi_ma?: string | null;
}): React.JSX.Element {
  const dat = (khoa: string, gia_tri: string): void => {
    const moi = new URLSearchParams(sp);
    if (gia_tri === '') moi.delete(khoa);
    else moi.set(khoa, gia_tri);
    datSp(moi);
  };

  return (
    <section aria-label="Đã xử lý" data-khoi="da-xu-ly" className="flex flex-col gap-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h2 className={LOP_TIEU_DE_MUC}>Đã xử lý</h2>
        {/* d.251 — lọc theo **khoảng ngày** (dự án dùng chung bộ lọc ở trên). */}
        <div data-hang="nut" className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Từ ngày
            <input
              type="date"
              data-loc={KHOA_LOC.tu_ngay}
              value={sp.get(KHOA_LOC.tu_ngay) ?? ''}
              onChange={(e) => dat(KHOA_LOC.tu_ngay, e.target.value)}
              className={LOP_O_NHAP}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Đến ngày
            <input
              type="date"
              data-loc={KHOA_LOC.den_ngay}
              value={sp.get(KHOA_LOC.den_ngay) ?? ''}
              onChange={(e) => dat(KHOA_LOC.den_ngay, e.target.value)}
              className={LOP_O_NHAP}
            />
          </label>
        </div>
      </header>

      {ds.length === 0 ? (
        <p className="text-sm text-neutral-500">{CAU_CHUA_XU_LY_GI}</p>
      ) : (
        /*
         * d.411 — bốn cột không hẹp thêm được dưới 375px, nên bảng nằm trong một
         * khung **cuộn ngang của chính nó**: cuộn một bảng là một cử chỉ quen,
         * còn một trang tràn ngang làm lệch mọi thứ khác trên màn hình.
         */
        <div data-o="khung-bang" className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead>
            <tr className="text-xs text-neutral-500">
              {/* **Bốn cột, đúng chữ và đúng thứ tự d.251.** */}
              <th scope="col">ngày</th>
              <th scope="col">mã</th>
              <th scope="col">tiêu đề ngắn</th>
              <th scope="col">kết quả</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((d) => (
              <tr
                key={d.id}
                data-dong-da-xu-ly={d.ma}
                data-noi={d.ma === noi_ma ? 'co' : undefined}
                aria-current={d.ma === noi_ma ? 'true' : undefined}
                tabIndex={d.ma === noi_ma ? -1 : undefined}
                className={d.ma === noi_ma ? 'outline-2 outline-neutral-500' : undefined}
              >
                {/*
                 * d.412 — ô thời gian hiện chữ **tương đối**, rê chuột thấy giờ
                 * đầy đủ theo giờ Việt Nam. Mốc là `bay_gio` **của máy chủ**
                 * (cùng đồng hồ với ba khối ở trên), không `Date.now()`: hai
                 * đồng hồ cạnh nhau là hai con số nói trái nhau.
                 *
                 * Vẫn **đúng bốn cột** của d.251 — cột "ngày" không tách làm
                 * hai; ngày trên tường nằm trong giờ đầy đủ của `title`.
                 */}
                <td data-cot="ngay" className="text-xs">
                  <time
                    data-cot="xu-ly-luc"
                    dateTime={new Date(d.xu_ly_luc).toISOString()}
                    title={gioDayDu(d.xu_ly_luc)}
                  >
                    {thoiGianTuongDoi(d.xu_ly_luc, bay_gio)}
                  </time>
                </td>
                <td data-cot="ma" className="font-mono text-xs">
                  {d.ma}
                </td>
                <td data-cot="tieu-de" title={d.tieu_de}>
                  {d.tieu_de_ngan}
                </td>
                <td data-cot="ket-qua" data-trang-thai={d.trang_thai}>
                  {d.ket_qua}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}

/* ================================================================== *
 * 9. Phiên duyệt — d.274–275
 * ================================================================== */

function PhienDuyet({
  phien,
  cho,
  nhap,
  datNhap,
  gui,
  bay_gio,
  ketThuc,
  dong,
  chon_id,
}: {
  phien: { xu_ly: number; bo_qua: number; xong: boolean };
  cho: readonly TheCanChu[];
  nhap: Record<string, NhapThe>;
  datNhap: (id: string, v: Partial<NhapThe>) => void;
  gui: (b: BienGui) => void;
  bay_gio: number;
  ketThuc: () => void;
  dong: () => void;
  chon_id: string | null;
}): React.JSX.Element {
  /*
   * Thứ tự 🔴 → 🟡 → ⚪ của d.274 **không** sắp lại ở đây: `cho` là ba khối của
   * `GET /v1/can-chu` nối theo đúng thứ tự `MUC_THEO_DO_KHAN`, và trong mỗi khối
   * máy chủ đã sắp theo hạn rồi lúc tạo (d.249). Sắp lần thứ hai ở giao diện là
   * mở đúng cái khe cho hai thứ tự lệch nhau.
   */
  const the = cho[0];
  const het = the === undefined;

  if (phien.xong || het) {
    return (
      <section aria-label="Tóm tắt phiên duyệt" data-khoi="tom-tat-phien" className="flex flex-col gap-2">
        <h2 className={LOP_TIEU_DE_MUC}>Tóm tắt phiên duyệt</h2>
        <p data-o="tom-tat">{cauTomTatPhien(phien.xu_ly, phien.bo_qua, cho.length)}</p>
        <button
          type="button"
          data-nut="dong-phien"
          onClick={dong}
          className={`self-start rounded px-3 py-1 text-sm ${NUT_CHINH}`}
        >
          Về danh sách
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Phiên duyệt" data-khoi="phien-duyet" className="flex flex-col gap-3">
      <header data-hang="nut" className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={LOP_TIEU_DE_MUC}>
          Phiên duyệt — còn <span data-so="con-lai">{cho.length}</span> mục
        </h2>
        <button
          type="button"
          data-nut="ket-thuc-phien"
          onClick={ketThuc}
          className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
        >
          {NHAN_KET_THUC_PHIEN}
        </button>
      </header>

      {/* **Từng thẻ `Chờ` một** — d.274. */}
      <The
        the={the}
        nhap={nhap[the.id] ?? NHAP_RONG}
        datNhap={datNhap}
        gui={gui}
        bay_gio={bay_gio}
        dang_chon={the.id === chon_id}
      />
    </section>
  );
}

/* ================================================================== *
 * 10. Ô trả lời hàng loạt — d.271
 * ================================================================== */

function OHangLoat({
  cho,
  da,
  gui,
}: {
  cho: readonly TheCanChu[];
  da: readonly DongDaXuLy[];
  /** Phải **chờ được**: lô chạy tuần tự (xem `guiCho` ở trang). */
  gui: (b: BienGui) => Promise<void>;
}): React.JSX.Element {
  const [van, datVan] = useState('');
  const [xem, datXem] = useState<DongHangLoat[] | null>(null);
  const bang_the = useMemo(() => new Map(cho.map((t) => [t.id, t])), [cho]);

  /** Mục mà màn hình đang biết: ba khối (`open`) + bảng Đã xử lý. */
  const biet: MucBiet[] = useMemo(
    () => [
      // `tieu_de` có mặt cho **lối tạm** khớp số T ghi ở đầu tiêu đề
      // (`soTCuaTieuDe` — CoS đặt tiêu đề `"T-106 · …"` trong khi Baton cấp mã
      // `T-2`). Bảng Đã xử lý dùng `tieu_de` đầy đủ, không `tieu_de_ngan`: bản
      // ngắn có thể bị cắt mất chính số T ở đầu.
      ...cho.map((t) => ({
        id: t.id,
        ma: t.ma,
        tieu_de: t.tieu_de,
        loai: t.loai,
        trang_thai: t.trang_thai,
        nhan_phuong_an: t.phuong_an.map((p) => p.nhan),
      })),
      ...da.map((d) => ({
        id: d.id,
        ma: d.ma,
        tieu_de: d.tieu_de,
        loai: d.loai,
        trang_thai: d.trang_thai,
        nhan_phuong_an: [],
      })),
    ],
    [cho, da],
  );

  const ap_duoc = xem !== null && coTheAp(xem);

  /**
   * Áp cả lô — **tuần tự**, một mục một lúc (`cau-hoi-spec.md` #107).
   *
   * Vẫn **không nguyên tử** ở v0.1 (máy chủ không có đường ghi theo lô), nhưng
   * tuần tự là điều kiện để cập nhật lạc quan nói đúng: hai mutation song song
   * chụp ảnh cache **chồng lên nhau**, nên một mục bị từ chối ở giữa lô sẽ hoàn
   * về ảnh cũ và làm các mục đã xong **mọc lại** trên màn hình.
   *
   * Ô được dọn **trước** khi chạy: lô đã chốt ở bản xem trước, và để chữ ở lại
   * trong lúc chạy là mời bấm Áp lần thứ hai.
   */
  const ap = async (): Promise<void> => {
    if (xem === null || !coTheAp(xem)) return;
    const lo = xem;
    datVan('');
    datXem(null);
    for (const d of lo) {
      if (!d.hieu) continue;
      const t = bang_the.get(d.id);
      if (t === undefined) continue;
      await gui({
        the: { id: t.id, ma: t.ma, loai: t.loai, muc: t.muc, tieu_de: t.tieu_de },
        than: d.than,
      });
    }
  };

  return (
    <section aria-label="Trả lời hàng loạt" data-khoi="hang-loat" className="flex flex-col gap-2">
      <h2 className={LOP_TIEU_DE_MUC}>Trả lời hàng loạt</h2>
      <textarea
        data-o="van-hang-loat"
        rows={3}
        value={van}
        placeholder={'T-18: đã xem\nT-52: A, ngưỡng 500'}
        onChange={(e) => {
          datVan(e.target.value);
          // Sửa chữ thì bản xem trước cũ hết đúng — bỏ đi, buộc xem lại.
          datXem(null);
        }}
        className={`w-full font-mono ${LOP_O_NHAP}`}
      />
      <div data-hang="nut" className="flex flex-wrap gap-2">
        <button
          type="button"
          data-nut="xem-truoc"
          onClick={() => datXem(tachHangLoat(van, biet))}
          className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
        >
          {NHAN_XEM_TRUOC}
        </button>
        <button
          type="button"
          data-nut="ap-hang-loat"
          disabled={!ap_duoc}
          onClick={() => void ap()}
          className={`rounded px-3 py-1 text-sm ${ap_duoc ? NUT_CHINH : NUT_MO}`}
        >
          {NHAN_AP_HANG_LOAT}
        </button>
      </div>

      {xem === null ? null : (
        <ul data-ds="xem-truoc" className="flex flex-col gap-1 text-sm">
          {xem.map((d, i) => (
            <li
              key={i}
              data-dong-hang-loat={d.hieu ? 'hieu' : 'khong-hieu'}
              className={d.hieu ? '' : 'text-loi'}
            >
              {/*
                `whitespace-pre-line`: một dòng hiểu được có thể là **cả khối
                nhiều dòng** (câu trả lời nhiều dòng — xem `tachHangLoat`), và
                HTML gộp `\n` thành khoảng trắng nếu không nói khác.
              */}
              <span className="whitespace-pre-line font-mono text-xs">{d.dong}</span>{' '}
              {d.hieu ? (
                <span data-o="tom-tat-dong">
                  → {d.ma}: {d.tom_tat}
                </span>
              ) : (
                <span role="alert" data-o="ly-do-do">
                  {d.ly_do}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
