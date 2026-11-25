/**
 * **Danh sách / bảng ticket** — SPEC mục 14 d.395–397, d.407, d.409, d.410.
 *
 * | Vế SPEC | Ở đâu trong file này |
 * |---|---|
 * | d.395 theo dự án hoặc "Tất cả dự án" | `TrangDanhSachTicket` (prop `ma_du_an`) |
 * | d.396 hai kiểu xem: danh sách gom theo trạng thái, và bảng | `NutKieuXem`, `DanhSachGom`, `BangKeo` |
 * | d.396 bảng: cột là trạng thái, **kéo thả** | `BangKeo` (dnd-kit) |
 * | d.396 kéo vào Xong thiếu bằng chứng ⇒ **bật về chỗ cũ + báo lý do** | `useDoiTrangThai` (`onError`) |
 * | d.396 chín bộ lọc | `ThanhLocTicket` |
 * | d.397 bộ lọc **ghi trên URL** | `datKhoa` của `src/loc-ticket.ts` |
 * | d.396 **lưu thành view riêng** | `ThanhView` |
 * | d.409 5.000 ticket cuộn mượt | `DanhSachGom` (TanStack Virtual) |
 * | d.410 thay đổi của agent hiện trong 3 giây | `NHIP_LAM_MOI_DANH_SACH` (`src/lam-moi.ts`) |
 * | d.412 thời gian tương đối, rê chuột thấy giờ VN | `OHan`, `NoiDungThe` (mốc = `bay_gio` máy chủ) |
 * | d.405–406 `J`/`K` trên ticket đang chọn | `usePhimTheDangChon` |
 * | d.415 `A` giao (chọn agent) trên ticket đang chọn | `phimA` → `HopGiaoViec` (`vo/giao-viec.tsx`) |
 * | d.398–401 nội dung chi tiết trong panel | `PanelChiTiet` → `ThanChiTietTicket` |
 *
 * ## Phần ngoài SPEC (brief BAT-6 đợt 2) — `spec-questions.md` #131–#136
 *
 * | Vế của brief | Ở đâu | Câu hỏi SPEC |
 * |---|---|---|
 * | thẻ việc hiện đủ **tám** thứ | `NoiDungThe` | #134, #135, #136 |
 * | sáu cột của bảng (Backlog đầu — T-111 A, BAT-64), số đếm đầu cột | `laNhomChu` + `data-nhom-chu` | #131 |
 * | ẩn/hiện cột **Xong cũ**, nhớ lựa chọn | `ThanhNhanh` + `locXongCu` | #132 |
 * | panel bên phải, Esc đóng, `J`/`K` đổi thẻ | `PanelChiTiet`, `usePhimTheDangChon` | — |
 * | lọc nhanh Active / Backlog / All | `ThanhNhanh` + `locNhanh` | #133 |
 *
 * ## Cổng Xong KHÔNG được cài lại ở đây
 *
 * "Kéo vào Xong mà thiếu bằng chứng thì thẻ bật về chỗ cũ **và báo lý do**"
 * (d.396) được làm **qua máy chủ**, không bằng một lần kiểm ở client: cổng là
 * `congXong` của mục 7 với cả bằng chứng, ticket con (19.11) và cờ "dự án không
 * code" (19.10). Nên trình tự là: đổi ngay trên màn hình → gọi
 * `POST /v1/ticket/:id/trang-thai` → máy chủ từ chối thì **đặt lại ảnh chụp** và
 * đẩy `message` **nguyên văn** của máy chủ ra toast. Lý do hiện cho chủ vì thế
 * luôn là lý do thật (ví dụ "thiếu commit đã merge"), không một câu client đoán.
 *
 * ## Vì sao cử chỉ kéo CÓ, mà đường không-kéo cũng CÓ (và thẻ KHÔNG có ô chọn cột)
 *
 * dnd-kit cho cử chỉ chuột/cảm ứng. Nhưng d.411 nói bảng kéo thả "không bắt buộc"
 * trên điện thoại, và một bảng **chỉ** kéo được thì không dùng được bằng bàn
 * phím. Đường không-kéo là hai đường còn lại của d.404: ô trạng thái trong panel
 * chi tiết (`data-trang-thai-panel`) và phím `S` (mở panel, đưa con trỏ vào đúng ô
 * ấy). Ô "Chuyển cột" trên từng thẻ của đợt 2 đã bỏ (d.404). Cả ba đường dùng
 * chung một đường mã (`keo`): cùng cập nhật lạc quan, cùng toast. Khai thẳng một
 * hạn chế của lưới test: jsdom không có layout nên **chuỗi chuột
 * `pointerdown → move → up` không dựng được** — dnd-kit không sinh ra `dragend` ở
 * đó. Nên luật của cử chỉ kéo được ghim ba lớp: `dichKeo` (hàm thuần), `xongKeo`
 * (ca test **gọi trực tiếp** với `DragEndEvent` dựng tay: sang cột khác, thả ra
 * ngoài, thả lại cột cũ), và ô trạng thái của panel (đi hết đường mutation thật).
 * Chỉ riêng việc **dnd-kit gắn đúng listener vào con trỏ** là còn thuộc nghiệm
 * thu tay mục 17.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  LoiApi,
  cauLoi,
  datNhanTicket,
  doiTrangThai,
  layAgent,
  layDuAn,
  layManHinhDanhSach,
  suaTicket,
  type AgentChon,
  type DuAnSidebar,
  type LocTicket,
  type ManHinhDanhSach,
  type TicketDong,
  type TrangThaiTicket,
  type UuTien,
} from '../api';
import { CHU_KY_LAM_MOI_MS } from '../hang-so';
import { NHIP_LAM_MOI_DANH_SACH, useNhipLamMoi } from '../lam-moi';
import { batDauSua, ghiMaThe, ketThucSua, soDemSua } from '../so-dem-sua';
import { henXaHoan, lamMoiTheoSo } from '../ghi-lac-quan';
import { useMotLan } from '../mot-lan';
import {
  GIOI_HAN_SONG_SONG,
  NHAN_AP_TRANG_THAI,
  NHAN_AP_UU_TIEN,
  NHAN_AP_NHAN,
  NHAN_BO_CHON,
  NHAN_DANG_AP,
  NHAN_LO_GIAO,
  NHAN_LO_NHAN,
  NHAN_LO_TRANG_THAI,
  NHAN_LO_UU_TIEN,
  NHAN_NUT_AP,
  NHAN_DONG_HOP_AP_NGOAI,
  NHAN_HUY_AP,
  canHoiAp,
  cauHoiAp,
  dichNhanLo,
  moTaNhanLo,
  nhanXacNhanAp,
  nhanChonThe,
  nhanSoChon,
  taoHangGioiHan,
  tomTatLoiLo,
  type HangGioiHan,
  type LoiMotThe,
} from '../chon-nhieu';
import { DauLamMoi } from '../vo/dau-lam-moi';
import { ThanhCongCuBangViec } from '../vo/thanh-cong-cu-du-an';
import {
  LOP_CAU_CHO,
  LOP_CAU_LOI,
  LOP_O_NHAP,
  LOP_TAB_PILL,
  LOP_TAB_PILL_DANG_CHON,
  LOP_TAB_PILL_THUONG,
  LOP_TIEU_DE_MUC,
  LOP_TIEU_DE_TRANG,
  LOP_NUT_ICON,
  LOP_VUNG_TRANG,
  NUT_CHINH,
  NUT_MO,
  NUT_PHU,
} from '../vo/lop-nut';
import { useMoTaoViec, type MoTaoViec } from '../vo/mo-tao-viec';
import {
  COT_BANG,
  GIA_TRI_BAT,
  KHOA_LOC_TICKET,
  KHOA_NHANH,
  KHOA_THE,
  KHOA_VIEW,
  KHOA_VIEW_DA_LUU,
  KHOA_XEM,
  KIEU_XEM,
  LOC_NHANH,
  NGAY_XONG_CU,
  NHAN_AN_XONG_CU,
  NHAN_KIEU_XEM,
  NHAN_LOC_NHANH,
  NHAN_TAT_CA_DU_AN,
  NHAN_TRANG_THAI,
  NHAN_UU_TIEN,
  TEN_TRANG_DANH_SACH,
  TRANG_THAI_THEO_THU_TU,
  UU_TIEN_THEO_THU_TU,
  boView,
  datKhoa,
  datNhanTrongCache,
  dichKeo,
  dichNhan,
  dichUuTien,
  docAnXongCu,
  doiUuTienTrongCache,
  docView,
  doiTrangThaiTrongCache,
  ghiAnXongCu,
  ghiKieuXem,
  hoanTrangThaiTrongCache,
  hoanUuTienTrongCache,
  gomTheoCotChu,
  gomTheoTrangThai,
  khoView,
  kieuXemTuUrl,
  laNhomChu,
  lamPhang,
  locNhanh,
  locTuUrl,
  locXongCu,
  luuView,
  nhanhTuUrl,
  soLocDangBat,
  type NhomCot,
  type ViecNhan,
  type ViewDaLuu,
} from '../loc-ticket';
import { tuyChonDanhSachAo } from '../khung-cuon';
import { gioDayDu, thoiGianTuongDoi } from '../thoi-gian';
import { NHAN_TAT_CA_VIEC, duongTicket } from '../vo/muc-sidebar';
import { useToast } from '../vo/toast';
import { bangPhimDangMo } from '../vo/phim-vo';
import {
  chanPhimNgoaiHop,
  dangSoanIme,
  hopTaoViecDangMo,
  maTicketTuChuoiGo,
  trongONhap,
} from '../vo/tao-viec';
import {
  HopGiaoViec,
  NHAN_NUT_GIAO_VIEC,
  hopGiaoViecDangMo,
  type TicketGiao,
} from '../vo/giao-viec';
import { commandMenuDangMo } from '../vo/hop-dang-mo';
import { IconDong, IconThem, IconTrangThai, IconUuTien } from '../vo/icon';
import { useManHinhHep } from '../vo/kho-man-hinh';
import { LOP_UU_TIEN, mauNhan, vietTat } from '../vo/mau-the';
import { ThanChiTietTicket } from './chi-tiet-ticket';

export const CAU_DANG_TAI_DS = 'Đang tải danh sách ticket…';
export const CAU_KHONG_CO_TICKET = 'Không có ticket nào khớp bộ lọc.';
export const CAU_KHONG_CO_DU_AN = 'Không có dự án này.';

/* ------------------------------------------------------------------ *
 * BAT-62 — nút `+` ở đầu cột Cần làm của bảng
 * BAT-63 — nút `+` ở đầu nhóm Backlog của kiểu Danh sách
 * BAT-64 — nút `+` ở đầu cột Backlog của bảng (T-111 A)
 * ------------------------------------------------------------------ */

/**
 * Cột (Bảng) có nút `+`: **Backlog và Cần làm** — hai trạng thái mục 4 "Trạng
 * thái khi tạo" cho phép (T-108 = B). SPEC mục 14 (T-111 = A, 29/10; BAT-64):
 * `+` cột Backlog mở hộp Tạo việc với **Backlog chọn sẵn**, `+` cột Cần làm mở
 * không tuỳ chọn (⇒ Cần làm, mặc định khi tạo). Lý do bốn cột kia không có: xem
 * ghi chú đầu cột ở `CotBang`; `spec-questions.md` #179, #180.
 */
export const COT_CO_NUT_TAO: readonly TrangThaiTicket[] = ['backlog', 'todo'];

/**
 * Hành động của nút `+` ở đầu một cột Bảng: `null` ⇒ cột không có nút (cột
 * ngoài `COT_CO_NUT_TAO`, hoặc không có hộp để mở — ngoài vỏ / dự án
 * `archived`). Cột Backlog ⇒ mở với Backlog chọn sẵn; cột Cần làm ⇒ mở **không**
 * tuỳ chọn (hộp ở Cần làm, POST không gửi `trang_thai`).
 */
export function nutTaoChoCot(cot: TrangThaiTicket, taoViec: MoTaoViec | null): (() => void) | null {
  if (taoViec === null || !COT_CO_NUT_TAO.includes(cot)) return null;
  if (cot === 'backlog') {
    return () => {
      taoViec({ trang_thai: 'backlog' });
    };
  }
  return () => {
    taoViec();
  };
}

/**
 * Nhóm (Danh sách) có nút `+`: **chỉ Backlog** — BAT-63, mục 4 "Trạng thái khi
 * tạo" (T-108 = B): người tạo được chọn Backlog. Nút mở hộp Tạo việc của vỏ với
 * **Backlog chọn sẵn**. Các nhóm khác của Danh sách không có `+` (Cần làm có `+`
 * ở cột Bảng). Từ BAT-64 (T-111 A) Bảng cũng có cột Backlog với `+` riêng
 * (`COT_CO_NUT_TAO`); `+` nhóm ở đây giữ nguyên (#180).
 */
export const NHOM_CO_NUT_TAO: readonly TrangThaiTicket[] = ['backlog'];

/** Nhãn (và `title`) của nút `+` — nói rõ nút làm gì và ở cột nào. */
export const nhanNutTaoTrongCot = (cot: string): string => `Tạo việc trong cột ${cot}`;

/** Nhãn (và `title`) của nút `+` ở đầu một nhóm của kiểu Danh sách. */
export const nhanNutTaoTrongNhom = (nhom: string): string => `Tạo việc trong nhóm ${nhom}`;

/**
 * Bảng đang xem có cho **tạo việc** từ nút `+` không — theo dự án đang xem.
 *
 *   * Không lọc dự án (bảng chung "Tất cả việc") ⇒ có; chủ chọn dự án trong hộp.
 *   * Lọc một dự án (`/du-an/<MÃ>` hoặc `?du_an=<id>`) ⇒ chỉ khi dự án ấy **có**
 *     trong danh sách dự án đã tải và **không** `archived` (chỉ đọc, mục 2;
 *     19.12 câu 25). `paused` vẫn có: chủ tạo được ticket trong dự án tạm dừng
 *     (19.12 câu 26) — hộp Tạo việc cũng liệt kê nó.
 *   * Không biết trạng thái dự án (danh sách chưa về, hay id không có trong danh
 *     sách — `GET /v1/du-an` **ẩn** dự án lưu trữ, 19.12 câu 27) ⇒ **không** vẽ:
 *     không đoán.
 */
export function choTaoTuBang(
  project_id: string | undefined,
  ds: readonly DuAnSidebar[] | undefined,
): boolean {
  if (project_id === undefined || project_id === '') return true;
  const d = ds?.find((x) => x.id === project_id);
  return d !== undefined && d.trang_thai !== 'archived';
}

export const NHAN_LUU_VIEW = 'Lưu thành view';
export const NHAN_XOA_LOC = 'Bỏ hết bộ lọc';
export const NHAN_CON_TRANG_SAU = 'Còn trang sau';
export const NHAN_XEM_THEM = 'Xem thêm';
export const NHAN_THU_LAI_XEM_THEM = 'Thử lại';
export const NHAN_DANG_TAI_THEM = 'Đang tải thêm…';
export const CAU_LOI_XEM_THEM = 'Không tải được trang tiếp theo. Danh sách đã có vẫn còn nguyên.';
/**
 * **Hai phép lọc chạy ở máy khách chỉ soi trang đã tải** — nói thẳng ra, cạnh
 * dòng "Còn trang sau".
 *
 * Lọc nhanh Active/Backlog/All và "Ẩn Xong cũ" không gửi được xuống máy chủ
 * (`spec-questions.md` #132, #133), nên khi còn trang sau, "Backlog: 3" nghĩa là 3
 * **trong các dòng đã tải** (mỗi lần "Xem thêm" nối thêm một trang 200 dòng),
 * không phải 3 trong cả workspace. Một màn hình im lặng ở đó nói sai với chủ —
 * cùng lý lẽ làm dòng "Còn trang sau" tồn tại.
 */
export const CAU_LOC_TRONG_TRANG =
  'Lọc nhanh (Active/Backlog/All) và "Ẩn Xong cũ" chỉ soi các trang đã tải, không soi cả workspace.';

/** Nhãn của hai ô chọn người — d.396 kể cả hai, và chúng **khác nhau**. */
export const NHAN_CHIU_TRACH_NHIEM = 'Người chịu trách nhiệm';
export const NHAN_NGUOI_DANG_CAM = 'Người đang cầm';
/** Ba cờ của d.396. */
export const NHAN_CO_CO = 'Có cờ';
export const NHAN_CAN_CHU = 'Cần Chủ';
export const NHAN_XONG_KHONG_BANG_CHUNG = 'Xong không bằng chứng';
/** Giá trị "chủ" của hai ô chọn người — cùng quy ước với máy chủ. */
export const GIA_TRI_CHU = 'owner';
export const NHAN_CHU = 'Chủ (chủ)';

/** Nhãn của panel chi tiết bên phải (BAT-6 đợt 2). */
export const NHAN_PANEL = 'Chi tiết ticket';
export const NHAN_DONG_PANEL = 'Đóng panel';
export const NHAN_MO_TOAN_TRANG = 'Mở toàn trang';

/** Nút mở menu lọc và nhãn của menu — d.407 chốt chữ "Lọc". */
export const NHAN_NUT_LOC = 'Lọc';
export const NHAN_MENU_LOC = 'Menu lọc';
/** Ô đổi trạng thái trong panel chi tiết — một trong ba đường của d.404. */
export const NHAN_TRANG_THAI_PANEL = 'Trạng thái';
export const NHAN_UU_TIEN_PANEL = 'Ưu tiên';
/** Khối nhãn của panel — đích của phím `L` (d.415). */
export const NHAN_NHAN_PANEL = 'Nhãn';
export const NHAN_THEM_NHAN = 'Thêm nhãn';
export const nhanBoNhan = (n: string): string => `Bỏ nhãn ${n}`;

/** Tập chọn rỗng dùng chung — một tham chiếu cố định (không dựng `Set` mới mỗi lần vẽ). */
const TAP_RONG: ReadonlySet<string> = new Set();

/** Ba ô của thanh chọn nhiều — đích focus của `S`/`P`/`L` khi có thẻ đã chọn. */
type OLo = 'trang-thai' | 'uu-tien' | 'nhan';

/** Câu lỗi của một thẻ trong lượt nhiều thẻ — cùng nếp `onError` một thẻ. */
function cauLoiLo(loi: unknown): string {
  return loi instanceof LoiApi ? loi.message : loi instanceof Error ? loi.message : String(loi);
}

/* ================================================================== *
 * 1. Trang
 * ================================================================== */

export function TrangDanhSachTicket({
  ma_du_an,
}: {
  /** `/du-an/:ma` — d.395 "theo dự án". Trống = "Tất cả dự án". */
  ma_du_an?: string | undefined;
}): React.JSX.Element {
  const [sp, datSp] = useSearchParams();
  const du_an = useQuery({ queryKey: ['du-an'], queryFn: layDuAn });
  const agent = useQuery({ queryKey: ['agent'], queryFn: layAgent });

  /*
   * Đường `/du-an/:ma` mang **mã** dự án (thứ chủ đọc được), còn máy chủ lọc theo
   * `project_id`. Phép đổi mã → id dùng **chính** danh sách dự án mà sidebar đã
   * tải, nên không thêm một lượt gọi nào; `du_an_duong === null` trong lúc chưa
   * tải xong là "chưa biết", không phải "không có" — xem nhánh chờ ở dưới.
   */
  const du_an_duong =
    ma_du_an === undefined
      ? null
      : (du_an.data?.items.find((d) => d.ma === ma_du_an) ?? null);

  const loc = useMemo(() => {
    const tu_url = locTuUrl(sp);
    // Dự án trên **đường** thắng dự án trên **truy vấn**: đường là chỗ chủ đang ở.
    return du_an_duong === null ? tu_url : { ...tu_url, project_id: du_an_duong.id };
  }, [sp, du_an_duong]);

  const khoa = useMemo(() => ['ticket', 'man-hinh', loc] as const, [loc]);
  // Số thao tác S/P/L đang bay trên mọi thẻ — xem `refetchInterval` bên dưới.
  const dang_sua = useIsMutating(locMutationSua());
  const qc_ds = useQueryClient();
  /*
   * **"Xem thêm" — nối trang theo `cursor_sau`** (SPEC mục 14 d.409, mốc 5.000
   * ticket). Cùng mẫu `trang/bao-cao.tsx`: `useInfiniteQuery`, mọi trang dùng
   * **cùng** `loc` (bộ lọc trên URL) — đổi bộ lọc là đổi `khoa`, nên về trang
   * đầu. Dữ liệu trong cache có hình `{ pages, pageParams }`; mọi chỗ đọc/ghi
   * cache của khoá này (cập nhật lạc quan ở `useDoiTrangThai`) đi qua
   * `doiTrangThaiTrongCache`.
   */
  const ds = useInfiniteQuery({
    queryKey: khoa,
    queryFn: ({ pageParam }) => layManHinhDanhSach(loc, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (t) => t.cursor_sau ?? undefined,
    /*
     * Nhịp d.410 + "đổi bộ lọc thì giữ dữ liệu cũ trên màn hình" (d.408). Trước
     * lượt này trang tự khai `refetchInterval` và `placeholderData: (cu) => cu`;
     * nay cả hai đi từ `src/lam-moi.ts` — `keepPreviousData` của TanStack Query
     * **chính là** `(cu) => cu`, cùng hành vi, một chỗ chốt.
     */
    ...NHIP_LAM_MOI_DANH_SACH,
    /*
     * **Làm mới thông minh (BAT-19).** TanStack tải lại *tuần tự mọi trang* đã nối
     * mỗi nhịp — 5.000 ticket là 25 lượt gọi mỗi nhịp. Nên nhịp của chính query
     * này chỉ chạy khi mới có **một** trang; từ trang thứ hai trở đi nhịp do
     * `useNhipTrangDau` đảm nhận (chỉ trang đầu). Hàm được tính lại sau mỗi lần
     * cache đổi, nên nối trang thứ hai là nhịp này tự tắt.
     */
    /*
     * **Và tắt hẳn khi còn thao tác S/P/L đang bay (BAT-25).** Một GET của nhịp trả
     * dữ liệu TRƯỚC thao tác và đè giá trị lạc quan (nhấp nháy, d.418). Một GET đã
     * bay từ trước thì `onMutate` đã `cancelQueries`. Tắt NGAY trong `onMutate`:
     * `setQueryData` ở đó chạy đồng bộ → `onQueryUpdate` → `#updateTimers` tính lại
     * hàm này, nên hàm đọc sổ đếm SỐNG (`soDemSua(...).tong`, `batDauSua` tăng ở dòng
     * đầu `onMutate`) thì tick đã hẹn bị xoá trước khi bắn. `dang_sua` (state React)
     * GIỮ để khi tổng về 0 thì render lại ⇒ `setOptions` hẹn lại nhịp, kể cả nhánh lỗi.
     */
    refetchInterval: (q) =>
      dang_sua > 0 || soDemSua(qc_ds).tong > 0 || (q.state.data?.pages.length ?? 0) > 1
        ? false
        : CHU_KY_LAM_MOI_MS,
    /*
     * **Ở `/du-an/:ma`, chưa biết dự án thì KHÔNG hỏi.** Danh sách dự án chưa về
     * (hoặc mã không có) nghĩa là `loc.project_id` còn trống, và một lượt gọi với
     * bộ lọc trống trả **ticket của mọi dự án** — tức màn hình "dự án SAI" nháy
     * một danh sách toàn workspace trước khi tự sửa. Có ca test ghim.
     */
    enabled: ma_du_an === undefined || du_an_duong !== null,
  });

  /*
   * Các trang nối thành **một** `ManHinhDanhSach`: `items` là mọi trang nối
   * nhau, `bay_gio` lấy của trang **cuối** (mốc mới nhất), `cursor_sau` của trang
   * cuối (`null` = hết). Mọi code phía dưới vẫn đọc hình cũ này.
   */
  const trang = useMemo((): { data: ManHinhDanhSach | undefined } => {
    const t = ds.data?.pages;
    const cuoi = t?.[t.length - 1];
    if (t === undefined || cuoi === undefined) return { data: undefined };
    // Trang đầu được làm mới riêng (`useNhipTrangDau`) còn các trang sau giữ cursor
    // cũ: ticket đổi chỗ giữa hai trang có thể hiện ở cả hai ⇒ lọc trùng theo id,
    // giữ lần đầu (key React).
    const da_thay = new Set<string>();
    const items = t
      .flatMap((p) => p.items)
      .filter((x) => {
        if (da_thay.has(x.id)) return false;
        da_thay.add(x.id);
        return true;
      });
    return {
      data: {
        items,
        cursor_sau: cuoi.cursor_sau,
        bay_gio: cuoi.bay_gio,
      },
    };
  }, [ds.data]);

  /*
   * Dấu "đang làm mới" chỉ theo **lượt làm mới** (nhịp của query, nhịp trang đầu,
   * invalidate). Bấm "Xem thêm" (`isFetchingNextPage`) KHÔNG tính: trạng thái ấy
   * hiện ở chính nút.
   */
  const so_trang = ds.data?.pages.length ?? 0;
  const phu_dang_lam_moi = useNhipTrangDau(khoa, loc, so_trang > 1 && !ds.isPlaceholderData);
  const { hien_dau } = useNhipLamMoi(
    (ds.isFetching && !ds.isFetchingNextPage) || phu_dang_lam_moi,
    [khoa],
  );
  const kieu = kieuXemTuUrl(sp);
  /*
   * BAT-35: hàng chờ chung cho phần GỌI MÁY CHỦ của các lượt S/P/L nhiều thẻ —
   * tối đa `GIOI_HAN_SONG_SONG` request cùng lúc trên cả ba loại. Lạc quan vẫn hiện
   * ngay cho mọi thẻ (`onMutate` không xếp hàng). Thao tác một thẻ không đi qua hàng.
   */
  const [hang_lo] = useState<HangGioiHan>(() => taoHangGioiHan(GIOI_HAN_SONG_SONG));
  const doi = useDoiTrangThai(khoa, hang_lo);
  const doi_uu_tien = useDoiUuTien(khoa, hang_lo);
  const dat_nhan = useDatNhan(khoa, hang_lo);

  const dat = useCallback(
    (k: string, v: string) => {
      datSp(datKhoa(sp, k, v));
    },
    [sp, datSp],
  );

  /*
   * **Hai phép lọc chạy ở máy khách**, trên trang đã tải: lọc nhanh
   * Active/Backlog/All (`spec-questions.md` #133 — đường đọc chỉ nhận **một** mã
   * trạng thái) và "ẩn Xong cũ" (#132 — không có bộ lọc máy chủ nào cho nó).
   * Cả hai là **hàm thuần** ở `loc-ticket.ts`, và cả hai đi **trước** khi gom
   * nhóm, nên số đếm ở đầu mỗi cột là số đếm của thứ **đang thấy** — một cột ghi
   * "8" mà chỉ vẽ 3 thẻ là một con số nói sai.
   */
  const nhanh = nhanhTuUrl(sp);
  const [an_xong_cu, datAnXongCu] = useState(() => docAnXongCu());
  const trang_hien = useMemo((): ManHinhDanhSach | undefined => {
    if (trang.data === undefined) return undefined;
    const d = trang.data;
    return { ...d, items: locXongCu(locNhanh(d.items, nhanh), d.bay_gio, an_xong_cu) };
  }, [trang.data, nhanh, an_xong_cu]);

  /*
   * **Thứ tự đi của `J`/`K`** = đúng thứ tự thẻ trên màn hình (gom theo trạng
   * thái), một mảng cho **cả hai** kiểu xem: `J` trên bảng và `J` trên danh sách
   * đi cùng một dãy, nên chủ không phải học hai thứ tự.
   */
  const thu_tu = useMemo(
    () => gomTheoTrangThai(trang_hien?.items ?? []).flatMap((n) => n.items),
    [trang_hien],
  );
  const ma_the = sp.get(KHOA_THE);
  const moThe = useCallback(
    (ma: string) => {
      datSp(datKhoa(sp, KHOA_THE, ma));
    },
    [sp, datSp],
  );
  /*
   * **Phím `S` — "trên ticket đang chọn: `S` trạng thái"** (d.415), và một trong
   * **ba** đường đổi trạng thái mà d.404 chốt.
   *
   * Nó **không** dựng một bảng chọn thứ hai: nó mở panel của thẻ đang chọn và đưa
   * con trỏ vào đúng ô trạng thái của panel ấy (`data-trang-thai-panel`). Từ đó
   * mũi lên/xuống và Enter là hành vi **sẵn có** của một `<select>` — tức đổi
   * được trạng thái bằng bàn phím, đủ bảy giá trị, không một menu tự viết phải tự
   * lo focus, `aria-activedescendant` và cuộn.
   */
  /*
   * **Chọn nhiều — `X`** (d.416, BAT-35). Chọn theo **id** ticket, gắn với **bộ
   * lọc lúc chọn** (`chu_ky_loc`: khoá danh sách + tab nhanh + "Ẩn Xong cũ"). Đổi
   * bộ lọc/tab/view ⇒ tập chọn coi như rỗng — tính ra khi vẽ, không cần effect.
   * Chọn cách này (không "giữ chọn, chỉ áp thẻ đang hiện") vì nó an toàn hơn: một
   * thẻ chọn ở bộ lọc cũ rồi khuất đi không thể bị áp ngầm khi nó hiện lại sau
   * này. Ngoài ra, mọi lần áp chỉ lấy thẻ **đang có** trong `thu_tu` (`the_chon`):
   * thẻ rời danh sách vì agent đổi nó thì không bị áp.
   */
  const chu_ky_loc = JSON.stringify([khoa, nhanh, an_xong_cu]);
  const [chon, datChon] = useState<{ chu_ky: string; ids: ReadonlySet<string> }>(() => ({
    chu_ky: chu_ky_loc,
    ids: new Set(),
  }));
  // Bộ lọc đổi ⇒ xoá hẳn tập cũ (chỉnh state lúc vẽ): quay lại bộ lọc cũ không được
  // làm tập cũ "sống lại".
  if (chon.chu_ky !== chu_ky_loc) datChon({ chu_ky: chu_ky_loc, ids: new Set() });
  const ids_chon = chon.chu_ky === chu_ky_loc ? chon.ids : TAP_RONG;
  const the_chon = useMemo(() => thu_tu.filter((t) => ids_chon.has(t.id)), [thu_tu, ids_chon]);
  const co_chon = the_chon.length > 0;
  const batChon = useCallback(
    (id: string) => {
      datChon((cu) => {
        const ids = new Set(cu.chu_ky === chu_ky_loc ? cu.ids : []);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { chu_ky: chu_ky_loc, ids };
      });
    },
    [chu_ky_loc],
  );
  const boChonHet = useCallback(() => {
    datChon({ chu_ky: chu_ky_loc, ids: new Set() });
  }, [chu_ky_loc]);
  const phimX = useCallback(
    (ma: string) => {
      const t = thu_tu.find((x) => x.ma === ma);
      if (t !== undefined) batChon(t.id);
    },
    [thu_tu, batChon],
  );
  /**
   * Trả focus từ thanh chọn nhiều về **danh sách**: nút "Mở" của thẻ đang focus,
   * không có thì của thẻ đầu. Nút là `<button>` — phím danh sách (`J`/`K`/`X`/`S`…)
   * vẫn chạy khi focus ở đó. Thẻ đã rời DOM ⇒ `?.` và thôi.
   */
  const traFocusDanhSach = useCallback(() => {
    const ma = ma_the !== null && thu_tu.some((t) => t.ma === ma_the) ? ma_the : thu_tu[0]?.ma;
    if (ma === undefined) return;
    document.querySelector<HTMLElement>(`[data-mo-the="${ma}"]`)?.focus();
  }, [ma_the, thu_tu]);
  /** Ô của thanh chọn nhiều đang xin focus (phím `S`/`P`/`L` khi có thẻ đã chọn). */
  const [xin_focus_lo, datXinFocusLo] = useState<OLo | null>(null);
  const [giao_lo, datGiaoLo] = useState(false);
  const [dang_ap, datDangAp] = useState(false);
  const toast_ds = useToast();
  const mot_lo = useMotLan();

  /**
   * **Áp một thao tác S/P/L cho các thẻ đã chọn** (d.416). `dich` dựng biến cho
   * **từng** thẻ (`null` = thẻ đó không cần gửi, vd đã ở đúng trạng thái): id nằm
   * trong biến của `mutateAsync` — chụp NGAY lúc bấm, không đọc lại từ closure khi
   * request bay (BAT-29). Mỗi thẻ là một mutation riêng của chính hook một thẻ (sổ
   * đếm, khoá ghi trong ngữ cảnh, hoàn bằng phép ngược trên ĐÚNG thẻ đó), cờ `lo`
   * chỉ tắt toast từng thẻ và cho request vào hàng chờ giới hạn.
   *
   * `useMotLan` cho cả lượt: bấm/đổi lần hai lúc lượt còn bay bị bỏ (mỗi thẻ đúng 1
   * request). Xong: **một** toast tóm tắt nếu có thẻ lỗi; bỏ chọn thẻ thành công,
   * giữ đúng thẻ lỗi. Tất cả thành công ⇒ không toast (nếp một thẻ).
   */
  const apLo = useCallback(
    (dich: (t: TicketDong) => Promise<unknown> | null) => {
      const ds = the_chon;
      if (ds.length === 0) return;
      const chu_ky_luc_bam = chu_ky_loc;
      mot_lo((tha) => {
        datDangAp(true);
        const hua = ds.map((t) => dich(t) ?? Promise.resolve());
        void Promise.allSettled(hua).then((kq) => {
          const loi: LoiMotThe[] = [];
          const xong = new Set<string>();
          kq.forEach((k, i) => {
            const t = ds[i];
            if (t === undefined) return;
            if (k.status === 'rejected') loi.push({ ma: t.ma, cau: cauLoiLo(k.reason) });
            else xong.add(t.id);
          });
          if (loi.length > 0) toast_ds.bao(tomTatLoiLo(ds.length, loi));
          datChon((cu) =>
            cu.chu_ky !== chu_ky_luc_bam
              ? cu
              : { chu_ky: cu.chu_ky, ids: new Set([...cu.ids].filter((id) => !xong.has(id))) },
          );
          datDangAp(false);
          tha();
        });
      });
    },
    [the_chon, chu_ky_loc, mot_lo, toast_ds],
  );
  const apTrangThaiLo = useCallback(
    (sang: string) => {
      apLo((t) => {
        const b = dichKeo(t, sang);
        return b === null ? null : doi.mutateAsync({ ...b, lo: true });
      });
    },
    [apLo, doi],
  );
  const apUuTienLo = useCallback(
    (sang: string) => {
      apLo((t) => {
        const b = dichUuTien(t, sang);
        return b === null ? null : doi_uu_tien.mutateAsync({ ...b, lo: true });
      });
    },
    [apLo, doi_uu_tien],
  );
  const apNhanLo = useCallback(
    (nhan: string) => {
      // Luật gắn/bỏ tính MỘT lần trên cả tập lúc bấm (`dichNhanLo`), rồi tra theo id.
      const viec = new Map(
        dichNhanLo(the_chon, nhan).map((v, i) => [the_chon[i]?.id ?? '', v] as const),
      );
      apLo((t) => {
        const v = viec.get(t.id) ?? null;
        return v === null ? null : dat_nhan.mutateAsync({ ...v, lo: true });
      });
    },
    [apLo, dat_nhan, the_chon],
  );

  const [xin_focus_tt, datXinFocusTt] = useState(false);
  /*
   * Cờ xin focus chỉ đặt khi thẻ **có trong trang đã tải** (BAT-24): ô đích của
   * panel chỉ dựng khi có thẻ, nên xin cho thẻ vắng mặt thì cờ treo mãi và lần
   * `J` sau (sang thẻ có thật) bị kéo focus nhầm vào ô.
   */
  const coTrongTrang = useCallback((ma: string) => thu_tu.some((t) => t.ma === ma), [thu_tu]);
  // BAT-35: có thẻ đã chọn ⇒ `S`/`P`/`L`/`A` áp cho CÁC THẺ ĐÃ CHỌN (ô của thanh
  // chọn nhiều), không cho thẻ đang focus. Không có thẻ chọn ⇒ hành vi cũ y nguyên.
  const phimS = useCallback(
    (ma: string) => {
      if (co_chon) {
        datXinFocusLo('trang-thai');
        return;
      }
      moThe(ma);
      if (coTrongTrang(ma)) datXinFocusTt(true);
    },
    [moThe, coTrongTrang, co_chon],
  );
  // Phím `P` (d.415): cùng khuôn `S`, đích là ô ưu tiên của panel.
  const [xin_focus_ut, datXinFocusUt] = useState(false);
  const phimP = useCallback(
    (ma: string) => {
      if (co_chon) {
        datXinFocusLo('uu-tien');
        return;
      }
      moThe(ma);
      if (coTrongTrang(ma)) datXinFocusUt(true);
    },
    [moThe, coTrongTrang, co_chon],
  );
  // Phím `L` (d.415): cùng khuôn `S`/`P`, đích là ô "Thêm nhãn" của panel.
  const [xin_focus_nhan, datXinFocusNhan] = useState(false);
  const phimL = useCallback(
    (ma: string) => {
      if (co_chon) {
        datXinFocusLo('nhan');
        return;
      }
      moThe(ma);
      if (coTrongTrang(ma)) datXinFocusNhan(true);
    },
    [moThe, coTrongTrang, co_chon],
  );
  /*
   * Phím `A` (d.415 "`A` giao (chọn agent)", BAT-33): cùng khuôn `S`/`P`/`L` — cần
   * thẻ đang chọn **có trong trang đã tải** (hộp cần `id` của ticket cho `POST`).
   * Mở **chính** hộp của nút "Giao việc" ở chi tiết (`vo/giao-viec.tsx`).
   */
  const [giao_cho, datGiaoCho] = useState<TicketGiao | null>(null);
  const phimA = useCallback(
    (ma: string) => {
      // BAT-35: có thẻ đã chọn ⇒ MỘT hộp cho cả tập ("Giao N thẻ").
      if (co_chon) {
        datGiaoLo(true);
        return;
      }
      const t = thu_tu.find((x) => x.ma === ma);
      if (t !== undefined) datGiaoCho({ id: t.id, ma: t.ma });
    },
    [thu_tu, co_chon],
  );
  const dongGiao = useCallback(() => {
    datGiaoCho(null);
  }, []);
  const dongGiaoLo = useCallback(() => {
    datGiaoLo(false);
  }, []);
  /** Hộp giao nhiều thẻ báo các thẻ đã giao xong ⇒ bỏ chọn đúng các thẻ đó. */
  const daGiaoLo = useCallback(
    (ids_xong: readonly string[]) => {
      const xong = new Set(ids_xong);
      datChon((cu) =>
        cu.chu_ky !== chu_ky_loc
          ? cu
          : { chu_ky: cu.chu_ky, ids: new Set([...cu.ids].filter((id) => !xong.has(id))) },
      );
    },
    [chu_ky_loc],
  );
  const the_giao_lo = useMemo(() => the_chon.map((t) => ({ id: t.id, ma: t.ma })), [the_chon]);
  // Tập chọn rỗng (giao xong hết, hay mọi thẻ đã rời danh sách) ⇒ hộp nhiều thẻ coi
  // như đóng hẳn: lần `X` sau không được tự mở lại nó (chỉnh state lúc vẽ — nếp React).
  if (giao_lo && !co_chon) datGiaoLo(false);
  usePhimTheDangChon(thu_tu, ma_the, moThe, phimS, phimP, phimL, phimA, {
    co_chon,
    phimX,
    boChon: boChonHet,
  });
  // Khổ hẹp (dưới `sm`): panel phủ kín ⇒ nó phải cư xử như dialog. Xem `PanelChiTiet`.
  const hep = useManHinhHep();
  /*
   * BAT-62: nút `+` ở cột Cần làm (Bảng) mở **chính** hộp Tạo việc của vỏ; BAT-63:
   * nút `+` ở nhóm Backlog (Danh sách) mở cùng hộp với Backlog chọn sẵn; BAT-64:
   * nút `+` ở cột Backlog (Bảng) cũng vậy (`nutTaoChoCot`). Ngoài vỏ
   * (không provider) hoặc dự án đang xem không nhận ticket ⇒ `null`, không vẽ nút.
   * Hộp tự chọn sẵn dự án theo URL (`duAnGoiY`: `/du-an/<MÃ>`, `?du_an=<id>`).
   */
  const mo_tao_viec = useMoTaoViec();
  const tao_tu_bang =
    mo_tao_viec !== null && choTaoTuBang(loc.project_id, du_an.data?.items) ? mo_tao_viec : null;
  /** Thẻ đang mở ở panel — panel cần nó để vẽ ô đổi trạng thái (d.404). */
  const the_dang_chon = trang_hien?.items.find((t) => t.ma === ma_the);

  // `/du-an/<mã không có>` ⇒ nói rõ, không im lặng hiện "Tất cả dự án".
  if (ma_du_an !== undefined && du_an.data !== undefined && du_an_duong === null) {
    return (
      <section className={LOP_VUNG_TRANG}>
        <h1 className={LOP_TIEU_DE_TRANG}>{CAU_KHONG_CO_DU_AN}</h1>
      </section>
    );
  }

  /*
   * Panel **phủ kín** ở khổ hẹp ⇒ nền phải `inert`: không `Tab` xuyên ra bảng
   * sau tấm phủ, không trình đọc màn hình đọc cả nền. Xem `PanelChiTiet`.
   */
  const panel_phu_kin = hep && ma_the !== null;

  return (
    <>
    <div inert={panel_phu_kin} className="flex flex-col gap-3 p-4 sm:p-6">
      {/*
       * **Hàng tiêu đề đầu trang** (hệ thiết kế 29/10, `DESIGN.md`): tiêu đề →
       * tab-pill lọc nhanh + Lọc + Ẩn Xong cũ → hai nút kiểu xem bên phải. Không
       * đẩy lên thanh trên (không portal/context — brief UI-B).
       */}
      <header data-hang="nut" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* Dấu làm mới **trong** hàng tiêu đề — nếp chung, xem `trang/tong-quan.tsx`. */}
        <div data-hang="nut" className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          {/*
           * **Tiêu đề của trang "mọi dự án" là nhãn sidebar của d.392** ("Tất cả
           * việc"), không một chữ thứ hai: ca "mỗi mục sidebar có một trang, tiêu
           * đề đúng nhãn" (`test/dinh-tuyen.test.tsx`) so tiêu đề này với nhãn
           * **cắt từ SPEC**. Nhãn "Tất cả dự án" của d.402 vẫn còn — ở **ô lọc dự
           * án**, nơi nó nói về một lựa chọn lọc, không về một trang.
           */}
          <div className="flex items-center gap-2">
            <h1 className={LOP_TIEU_DE_TRANG}>
              {du_an_duong === null ? (
                NHAN_TAT_CA_VIEC
              ) : (
                <>
                  {du_an_duong.ten}{' '}
                  <span className="text-sm font-normal text-chu-mo">{TEN_TRANG_DANH_SACH}</span>
                </>
              )}
            </h1>
            <DauLamMoi hien={hien_dau} />
          </div>
          <ThanhNhanh
            sp={sp}
            dat={dat}
            datSp={datSp}
            nhanh={nhanh}
            du_an={du_an.data?.items ?? []}
            agent={agent.data?.items ?? []}
            an_o_du_an={du_an_duong !== null}
            an_xong_cu={an_xong_cu}
            datAnXongCu={(v) => {
              datAnXongCu(v);
              // Nhớ lựa chọn (brief). Kho bị chặn ⇒ im lặng không nhớ — `kho-cuc-bo.ts`.
              ghiAnXongCu(v);
            }}
          />
        </div>
        <NutKieuXem kieu={kieu} dat={dat} />
      </header>
      {/* Thanh công cụ dự án ở đầu trang dự án — SPEC 20.8 (chỉ ở `/du-an/<MÃ>`). */}
      {du_an_duong === null ? null : <ThanhCongCuBangViec key={du_an_duong.id} project_id={du_an_duong.id} />}

      {/*
       * Vùng đọc số thẻ đã chọn **luôn có trong DOM** (rỗng khi 0 thẻ): một vùng
       * `aria-live` dựng cùng lúc với nội dung đầu tiên thì trình đọc màn hình không
       * đọc — lần chọn đầu sẽ im lặng.
       */}
      <p aria-live="polite" data-o="loa-chon" className="sr-only">
        {co_chon ? nhanSoChon(the_chon.length) : ''}
      </p>
      {!co_chon ? null : (
        <ThanhChonNhieu
          so={the_chon.length}
          the_chon={the_chon}
          dang_ap={dang_ap}
          xin_focus={xin_focus_lo}
          daFocus={() => {
            datXinFocusLo(null);
          }}
          apTrangThai={apTrangThaiLo}
          apUuTien={apUuTienLo}
          apNhan={apNhanLo}
          moGiao={() => {
            datGiaoLo(true);
          }}
          boChon={boChonHet}
          traFocus={traFocusDanhSach}
        />
      )}

      {trang_hien === undefined && ds.isPending ? (
        <p role="status" className={LOP_CAU_CHO}>
          {CAU_DANG_TAI_DS}
        </p>
      ) : trang_hien === undefined ? (
        <p role="alert" className={LOP_CAU_LOI}>
          {ds.error instanceof LoiApi ? ds.error.message : String(ds.error)}
        </p>
      ) : kieu === 'bang' ? (
        <BangKeo
          trang={trang_hien}
          keo={doi.mutate}
          chon={ma_the}
          moThe={moThe}
          da_chon={ids_chon}
          batChon={batChon}
          hep={hep}
          taoViec={tao_tu_bang}
        />
      ) : (
        <DanhSachGom
          trang={trang_hien}
          chon={ma_the}
          moThe={moThe}
          da_chon={ids_chon}
          batChon={batChon}
          hep={hep}
          taoViec={tao_tu_bang}
        />
      )}


      {/*
       * **Còn trang sau thì nói ra và cho bấm "Xem thêm".** Một trang tối đa
       * `LIMIT_TRANG_TICKET` (máy chủ chặn ở 200), mốc d.409 là 5.000 ticket. Mỗi
       * lần bấm nối thêm một trang theo `cursor_sau`; `cursor_sau === null` thì
       * không còn nút. Lỗi khi tải trang sau: danh sách đã có **giữ nguyên**
       * (TanStack giữ `pages`), nút đổi thành "Thử lại".
       *
       * Hai phép lọc máy khách (#132, #133) vẫn chỉ soi phần **đã tải** — nên
       * câu `CAU_LOC_TRONG_TRANG` còn đó khi còn trang sau, và số đếm nhóm đổi
       * theo mỗi lần bấm "Xem thêm".
       */}
      {trang.data === undefined || !ds.hasNextPage ? null : (
        <div data-o="con-trang-sau" className="flex flex-col gap-2 text-xs text-chu-mo">
          <p role="status">
            {NHAN_CON_TRANG_SAU} — đang hiện {trang.data.items.length} ticket. {CAU_LOC_TRONG_TRANG}
          </p>
          {ds.isFetchNextPageError ? (
            <p role="alert" data-o="loi-xem-them" className="text-loi">
              {CAU_LOI_XEM_THEM}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              data-nut={ds.isFetchNextPageError ? 'thu-lai-xem-them' : 'xem-them'}
              disabled={ds.isFetchingNextPage}
              aria-busy={ds.isFetchingNextPage}
              onClick={() => {
                void ds.fetchNextPage();
              }}
              className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
            >
              {ds.isFetchingNextPage
                ? NHAN_DANG_TAI_THEM
                : ds.isFetchNextPageError
                  ? NHAN_THU_LAI_XEM_THEM
                  : NHAN_XEM_THEM}
            </button>
          </div>
        </div>
      )}
    </div>

    {ma_the === null ? null : (
      <PanelChiTiet
        ma={ma_the}
        the={the_dang_chon}
        keo={doi.mutate}
        doiUuTien={doi_uu_tien.mutate}
        xin_focus_uu_tien={xin_focus_ut}
        daFocusUuTien={() => {
          datXinFocusUt(false);
        }}
        datNhan={dat_nhan.mutate}
        xin_focus_nhan={xin_focus_nhan}
        daFocusNhan={() => {
          datXinFocusNhan(false);
        }}
        hep={hep}
        xin_focus_trang_thai={xin_focus_tt}
        daFocusTrangThai={() => {
          datXinFocusTt(false);
        }}
        dong={() => {
          datSp(datKhoa(sp, KHOA_THE, ''));
        }}
      />
    )}

    {giao_cho === null ? null : (
      <HopGiaoViec
        ticket={giao_cho}
        dong={dongGiao}
        traFocus={() => document.querySelector<HTMLElement>(`[data-mo-the="${giao_cho.ma}"]`)}
      />
    )}

    {/* BAT-35: một hộp cho mọi thẻ đã chọn — gửi tuần tự, không lạc quan. */}
    {!giao_lo || !co_chon ? null : (
      <HopGiaoViec nhieu={the_giao_lo} daGiaoLo={daGiaoLo} dong={dongGiaoLo} />
    )}
    </>
  );
}

/* ================================================================== *
 * 2. Đổi trạng thái: cập nhật lạc quan + bật về chỗ cũ — d.396, d.407
 * ================================================================== */

/** Hình dữ liệu của khoá danh sách trong cache TanStack: các trang đã nối. */
type CacheDanhSach = InfiniteData<ManHinhDanhSach, string | undefined>;

/**
 * **Nhịp làm mới khi đã nối >1 trang: chỉ hỏi lại TRANG ĐẦU** (BAT-19).
 *
 * `bat` = đang có >1 trang (và không phải dữ liệu giữ chỗ của bộ lọc cũ). Mỗi
 * `CHU_KY_LAM_MOI_MS` gọi `layManHinhDanhSach(loc, undefined)` rồi thay
 * `pages[0]` trong cache, giữ `pageParams` và mọi trang sau. Việc agent thêm/đổi
 * ticket ở đầu danh sách (d.410) vẫn hiện trong chu kỳ; trang 2.. là cursor cũ nên
 * chỉ tươi lại sau một thao tác của chủ (`onSettled`) hoặc khi quay lại tab.
 *
 * Tự viết bằng `setInterval` thay vì một `useQuery` phụ: một query phụ vừa bật là
 * tải ngay (không có dữ liệu = cũ), tức một lượt trang đầu thừa mỗi lần bấm
 * "Xem thêm", và khoá con của `khoa` còn bị `invalidateQueries` theo tiền tố gọi
 * đôi. Tab ẩn thì bỏ tick (như `refetchIntervalInBackground: false`).
 *
 * Bỏ kết quả nếu: effect đã bị dọn (đổi bộ lọc / về 1 trang), đang có
 * thao tác S/P/L đang bay (`soDemSua(qc).tong > 0`: sẽ ghi đè bản lạc quan bằng
 * dữ liệu trước thao tác), hoặc chính query đang
 * tải (sẽ bị `fetchNextPage` ghi đè), hoặc cache đã được cập nhật SAU lúc gửi
 * (`dataUpdateCount` đổi: một thao tác của chủ đã xong và danh sách đã tải lại
 * trong lúc lượt này còn bay, nên kết quả là dữ liệu cũ hơn cache). Dùng bộ đếm
 * thay vì `dataUpdatedAt` vì hai lần cập nhật có thể trùng một ms. Trả `true` khi
 * một lượt đang bay.
 */
function useNhipTrangDau(khoa: readonly unknown[], loc: LocTicket, bat: boolean): boolean {
  const qc = useQueryClient();
  const [dang_tai, datDangTai] = useState(false);
  // Khoá/bộ lọc đi qua ref: đổi giá trị cùng nội dung không được dựng lại hẹn giờ.
  const moi_nhat = useRef({ khoa, loc });
  moi_nhat.current = { khoa, loc };
  const chu_ky_khoa = JSON.stringify(khoa);

  useEffect(() => {
    if (!bat) return;
    let da_don = false;
    let dang_bay = false;
    const { khoa: k, loc: l } = moi_nhat.current;
    const nhip = setInterval(() => {
      if (document.visibilityState !== 'visible' || dang_bay) return;
      dang_bay = true;
      datDangTai(true);
      // Chụp bộ đếm cập nhật của cache lúc GỬI; so lúc NHẬN (xem JSDoc).
      const dem_luc_gui = qc.getQueryState(k)?.dataUpdateCount ?? 0;
      layManHinhDanhSach(l, undefined)
        .then((dau) => {
          if (da_don) return;
          // Sổ đếm S/P/L, không `isMutating()`: khoá `['ticket','man-hinh',…]` chỉ có S/P/L
          // ghi lạc quan vào (đã grep `setQueryData`); mutation khác (tạo việc, sửa chi
          // tiết, trang khác) không đụng nó nên không đáng chặn tick.
          if (soDemSua(qc).tong > 0) return;
          if (qc.isFetching({ queryKey: k, exact: true }) > 0) return;
          if ((qc.getQueryState(k)?.dataUpdateCount ?? 0) !== dem_luc_gui) return;
          qc.setQueryData<CacheDanhSach>(k, (cu) =>
            cu === undefined || cu.pages.length < 2
              ? cu
              : { ...cu, pages: [dau, ...cu.pages.slice(1)] },
          );
        })
        .catch(() => {
          // Lỗi mạng một tick: im lặng, tick sau thử lại. Dữ liệu đang hiện vẫn đúng.
        })
        .finally(() => {
          dang_bay = false;
          if (!da_don) datDangTai(false);
        });
    }, CHU_KY_LAM_MOI_MS);
    return () => {
      da_don = true;
      clearInterval(nhip);
      datDangTai(false);
    };
  }, [qc, bat, chu_ky_khoa]);

  return dang_tai;
}

export interface BienKeo {
  ticket_id: string;
  trang_thai: TrangThaiTicket;
  /**
   * BAT-35: thuộc một lượt **nhiều thẻ** — `onError` không toast riêng (lượt có một
   * toast tóm tắt), và request đi qua hàng chờ giới hạn. Vắng = thao tác một thẻ.
   */
  lo?: boolean;
}

/** Gọi máy chủ: thao tác của lượt nhiều thẻ thì xếp hàng (`GIOI_HAN_SONG_SONG`). */
function quaHang<T>(hang: HangGioiHan | undefined, lo: boolean | undefined, f: () => Promise<T>): Promise<T> {
  return lo === true && hang !== undefined ? hang.chay(f) : f();
}

/** Khoá mutation đổi trạng thái / đổi ưu tiên — lọc theo **thẻ** bằng `ticket_id` trong biến. */
const KHOA_MUTATION_TRANG_THAI = ['ticket', 'doi-trang-thai'] as const;
const KHOA_MUTATION_UU_TIEN = ['ticket', 'doi-uu-tien'] as const;

/** Bộ lọc "mutation loại này đang bay trên đúng thẻ này" — "đang gửi" của panel. */
function locMutationTheoThe(
  khoa: readonly unknown[],
  ticket_id: string,
): { mutationKey: readonly unknown[]; predicate: (m: { state: { variables: unknown } }) => boolean } {
  return {
    mutationKey: khoa,
    predicate: (m) => (m.state.variables as { ticket_id?: string } | undefined)?.ticket_id === ticket_id,
  };
}

/** Khoá của mọi mutation nhãn. */
const KHOA_MUTATION_NHAN = ['ticket', 'dat-nhan'] as const;

/** Ba loại thao tác sửa lạc quan trên danh sách (S, P, L). */
const KHOA_MUTATION_SUA: readonly (readonly unknown[])[] = [
  KHOA_MUTATION_TRANG_THAI,
  KHOA_MUTATION_UU_TIEN,
  KHOA_MUTATION_NHAN,
];

interface MutationXem {
  options: { mutationKey?: readonly unknown[] };
  state: { variables: unknown };
}

function laMutationSua(m: MutationXem): boolean {
  const k = m.options.mutationKey;
  return (
    k !== undefined &&
    KHOA_MUTATION_SUA.some((x) => x.length === k.length && x.every((p, i) => p === k[i]))
  );
}

/**
 * Bộ lọc "thao tác S/P/L đang bay": `ticket_id` có ⇒ chỉ trên đúng thẻ ấy (khoá
 * **chi tiết**, "đang gửi" của panel); không có ⇒ trên **mọi** thẻ (khoá **danh
 * sách**, dùng chung cho mọi thẻ).
 */
function locMutationSua(ticket_id?: string): { predicate: (m: MutationXem) => boolean } {
  return {
    predicate: (m) =>
      laMutationSua(m) &&
      (ticket_id === undefined ||
        (m.state.variables as { ticket_id?: string } | undefined)?.ticket_id === ticket_id),
  };
}

/*
 * Sổ đếm S/P/L (`soDemSua`, `batDauSua`, `ketThucSua`) nằm ở `../so-dem-sua`: cổng
 * "quay lại tab" của `lam-moi.ts` cũng đọc nó.
 */

/**
 * Sau một thao tác S/P/L (gọi trong `onSettled`; cặp với `batDauSua`):
 *
 *   * **Khoá danh sách** dùng chung cho mọi thẻ ⇒ chỉ làm mới khi không còn thao
 *     tác S/P/L nào khác đang bay trên **bất kỳ** thẻ nào. Lọc theo thẻ ở đây là
 *     sai: thẻ B xong trước khi thẻ A còn bay thì GET danh sách trả A chưa có thao
 *     tác của nó, và kết quả lạc quan của A nhấp nháy mất rồi hiện lại (d.418).
 *   * **Khoá chi tiết** của thẻ chỉ chứa thẻ ấy ⇒ theo thẻ (mọi loại).
 *
 * **Vì sao sổ đếm riêng mà không `isMutating(...) <= 1`.** Trong `onSettled` mutation
 * vẫn còn `pending` (TanStack chốt trạng thái SAU khi `onSettled` chạy xong). Hai
 * thao tác xong cùng một nhịp thấy nhau cùng `pending` ⇒ đếm = 2 ở cả hai ⇒ KHÔNG
 * ai làm mới. Đếm sau một microtask cũng không chắc (trạng thái được chốt ở một
 * lượt microtask sau đó) và nếu sai thì cả hai cùng thấy 0 ⇒ làm mới HAI lần.
 * Sổ đếm trừ ngay, đồng bộ, theo thứ tự `onSettled` chạy: chỉ lần trừ **cuối** về 0
 * ⇒ đúng một `invalidate` cho mỗi đợt thao tác, không phụ thuộc thời điểm chốt.
 */
function lamMoiSauDoi(
  qc: QueryClient,
  khoa: readonly unknown[],
  ticket_id: string,
  ma: string | undefined,
): void {
  const { het_tat_ca, het_the } = ketThucSua(qc, ticket_id);
  /*
   * BAT-29: sổ S/P/L vừa giảm ⇒ hẹn xả các khoá `lamMoiTheoSo` đã hoãn vì nó (vd
   * tạo việc xong lúc S/P/L còn bay). Hẹn **trước** hai lượt làm mới dưới: xả chạy
   * sau một microtask, nên khoá nào hai lượt đó đã làm mới thì đã rút khỏi hoãn —
   * không làm mới hai lần.
   */
  henXaHoan(qc);

  /*
   * BAT-28: `lamMoiTheoSo`, không `invalidateQueries` trần. Khoá chi tiết của thẻ
   * có thể đang bị `useSuaTicket` (panel: sửa tiêu đề/mô tả) ghi lạc quan — GET
   * lúc đó trả tiêu đề cũ và đè bản vừa sửa (d.418). Khoá đó được hoãn tới khi
   * lượt sửa xong.
   */
  if (het_tat_ca) {
    void lamMoiTheoSo(qc, { queryKey: khoa });
  }
  if (het_the) {
    void lamMoiTheoSo(qc, {
      queryKey: ma === undefined ? ['ticket', 'chi-tiet'] : ['ticket', 'chi-tiet', ma],
    });
  }
}

/**
 * Ngữ cảnh hoàn lại: giá trị cũ của đúng một trường + mã thẻ (để làm mới khoá chi
 * tiết) + **khoá danh sách đã ghi** (BAT-28: đổi bộ lọc giữa chừng thì `onError`/
 * `onSettled` của lần vẽ mới nhất phải hoàn/làm mới khoá **cũ**).
 */
interface NguCanhDoi<T> {
  cu: T | undefined;
  ma: string | undefined;
  khoa: readonly unknown[];
}

function timTheTrongCache(cache: CacheDanhSach | undefined, ticket_id: string) {
  if (cache === undefined) return undefined;
  for (const p of cache.pages) {
    const t = p.items.find((x) => x.id === ticket_id);
    if (t !== undefined) return t;
  }
  return undefined;
}

function useDoiTrangThai(
  khoa: readonly unknown[],
  hang?: HangGioiHan,
): UseMutationResult<unknown, Error, BienKeo, NguCanhDoi<TrangThaiTicket>> {
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  return useMutation<unknown, Error, BienKeo, NguCanhDoi<TrangThaiTicket>>({
    mutationKey: KHOA_MUTATION_TRANG_THAI,
    // Id CHỈ từ biến (BAT-29); lượt nhiều thẻ xếp hàng (BAT-35).
    mutationFn: (b) => quaHang(hang, b.lo, () => doiTrangThai(b.ticket_id, b.trang_thai)),

    /*
     * Ba việc, đúng thứ tự — cùng khuôn `useGuiTraLoi` của trang Cần Chủ: dừng
     * mọi lần tải đang bay (một phản hồi cũ về sau sẽ ghi đè bản lạc quan và thẻ
     * **nhảy về** cột cũ dù máy chủ đã nhận), ghi nhớ giá trị cũ, rồi sửa cache.
     */
    onMutate: async (b) => {
      const k = khoa; // BAT-28: chụp khoá danh sách (bộ lọc lúc bấm) cho `onError`/`onSettled`
      batDauSua(qc, b.ticket_id); // trước mọi `await`: cặp với `lamMoiSauDoi` trong `onSettled`
      await qc.cancelQueries({ queryKey: k });
      const anh = qc.getQueryData<CacheDanhSach>(k);
      const the = timTheTrongCache(anh, b.ticket_id);
      ghiMaThe(qc, b.ticket_id, the?.ma);
      if (anh !== undefined) {
        // Cache là `{ pages, pageParams }`: đổi trên **mọi** trang đã nối.
        qc.setQueryData<CacheDanhSach>(k, doiTrangThaiTrongCache(anh, b.ticket_id, b.trang_thai));
      }
      return { cu: the?.trang_thai, ma: the?.ma, khoa: k };
    },

    /**
     * **"Thẻ bật về chỗ cũ và báo lý do"** — d.396, và nửa sau của d.407.
     *
     * Bật về chỗ cũ = **phép ngược trên đúng trường của đúng thẻ** (BAT-24), không
     * đặt lại ảnh chụp cả cache: ảnh chụp xoá luôn kết quả lạc quan của thao tác
     * khác chồng lên. Thẻ đã bị thao tác sau đổi sang giá trị khác thì để yên.
     *
     * Lý do đi **nguyên văn** từ `message` của máy chủ (`EVIDENCE_REQUIRED` của
     * cổng Xong, `CHILDREN_OPEN` của 19.11, `REASON_REQUIRED`…): mục 13 d.379 bắt
     * mọi lỗi mang câu tiếng Việt, nên giao diện không dịch mã lỗi lần thứ hai.
     */
    onError: (loi, b, ngu_canh) => {
      const cu = ngu_canh?.cu;
      // Hoàn vào khoá ĐÃ GHI (ngữ cảnh), không khoá của bộ lọc đang chọn lúc này.
      if (ngu_canh !== undefined && cu !== undefined) {
        qc.setQueryData<CacheDanhSach>(ngu_canh.khoa, (c) =>
          c === undefined ? c : hoanTrangThaiTrongCache(c, b.ticket_id, b.trang_thai, cu),
        );
      }
      // Lượt nhiều thẻ: một toast tóm tắt ở `apLo`, không toast từng thẻ.
      if (b.lo !== true) toast.bao(loi instanceof LoiApi ? loi.message : String(loi.message));
    },

    // `onSettled`, không `onSuccess`: nhánh lỗi cũng phải tải lại — giá trị vừa
    // hoàn có thể đã cũ (ticket bị agent đổi ở nơi khác).
    onSettled: (_d, _l, b, ngu_canh) => {
      lamMoiSauDoi(qc, ngu_canh?.khoa ?? khoa, b.ticket_id, ngu_canh?.ma);
    },
  });
}

export interface BienUuTien {
  ticket_id: string;
  uu_tien: UuTien;
  /** BAT-35 — xem `BienKeo.lo`. */
  lo?: boolean;
}

/**
 * Đổi ưu tiên (phím `P`, d.415) — cùng khuôn `useDoiTrangThai`: huỷ tải đang bay,
 * chụp ảnh cache, sửa cache ngay; lỗi ⇒ đặt lại ảnh + toast câu lỗi máy chủ
 * nguyên văn; `onSettled` làm mới.
 */
function useDoiUuTien(
  khoa: readonly unknown[],
  hang?: HangGioiHan,
): UseMutationResult<unknown, Error, BienUuTien, NguCanhDoi<UuTien>> {
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  return useMutation<unknown, Error, BienUuTien, NguCanhDoi<UuTien>>({
    mutationKey: KHOA_MUTATION_UU_TIEN,
    mutationFn: (b) => quaHang(hang, b.lo, () => suaTicket(b.ticket_id, { uu_tien: b.uu_tien })),
    onMutate: async (b) => {
      const k = khoa; // BAT-28: chụp khoá danh sách — xem `useDoiTrangThai`
      batDauSua(qc, b.ticket_id); // trước mọi `await`: cặp với `lamMoiSauDoi` trong `onSettled`
      await qc.cancelQueries({ queryKey: k });
      const anh = qc.getQueryData<CacheDanhSach>(k);
      const the = timTheTrongCache(anh, b.ticket_id);
      ghiMaThe(qc, b.ticket_id, the?.ma);
      if (anh !== undefined) {
        qc.setQueryData<CacheDanhSach>(k, doiUuTienTrongCache(anh, b.ticket_id, b.uu_tien));
      }
      return { cu: the?.uu_tien, ma: the?.ma, khoa: k };
    },
    // Hoàn bằng phép ngược trên đúng trường của đúng thẻ (BAT-24) — xem `useDoiTrangThai`.
    onError: (loi, b, ngu_canh) => {
      const cu = ngu_canh?.cu;
      if (ngu_canh !== undefined && cu !== undefined) {
        qc.setQueryData<CacheDanhSach>(ngu_canh.khoa, (c) =>
          c === undefined ? c : hoanUuTienTrongCache(c, b.ticket_id, b.uu_tien, cu),
        );
      }
      if (b.lo !== true) toast.bao(loi instanceof LoiApi ? loi.message : String(loi.message));
    },
    onSettled: (_d, _l, b, ngu_canh) => {
      lamMoiSauDoi(qc, ngu_canh?.khoa ?? khoa, b.ticket_id, ngu_canh?.ma);
    },
  });
}

/** Ngữ cảnh hoàn lại của một thao tác nhãn: chỗ của nhãn trước khi bỏ (−1 = không có). */
interface NguCanhNhan {
  vi_tri: number;
  /** Khoá danh sách đã ghi, chụp ở dòng đầu `onMutate` (BAT-28) — xem `NguCanhDoi`. */
  khoa: readonly unknown[];
}

/**
 * **Gắn/bỏ nhãn** (phím `L`, d.415; d.418 sửa hiện ngay) — khuôn `useDoiUuTien`
 * với **hai chỗ khác**, cả hai vì hai thao tác nhãn liên tiếp trên cùng thẻ (gõ
 * nhãn, Enter, gõ nhãn nữa, Enter) là thói quen, không phải ca hiếm:
 *
 *   * **Hoàn lại bằng phép ngược trên đúng nhãn ấy**, không đặt lại ảnh chụp cả
 *     cache. Ảnh chụp của thao tác 1 chụp **trước** thao tác 2, nên thao tác 1 lỗi
 *     mà đặt lại ảnh là xoá luôn kết quả lạc quan của thao tác 2 đang bay/đã nhận.
 *     Bỏ nhãn rồi hoàn thì nhãn về **đúng chỗ cũ** (`vi_tri`).
 *   * **Chỉ thao tác cuối cùng còn bay mới làm mới danh sách** (`onSettled` →
 *     `lamMoiSauDoi`, đếm chung S/P/L trên mọi thẻ). Thao tác 1 xong sớm mà tải
 *     lại ngay thì máy chủ trả danh sách **chưa có** thao tác 2, và nhãn của thao
 *     tác 2 nhấp nháy mất rồi hiện lại.
 *
 * Làm mới cả khoá chi tiết `['ticket', 'chi-tiet', ma]`: thân panel
 * (`ThanChiTietTicket`) cũng vẽ dòng "Nhãn".
 */
/** Một thao tác nhãn; `lo` — xem `BienKeo.lo` (BAT-35). */
type BienNhan = ViecNhan & { lo?: boolean };

function useDatNhan(
  khoa: readonly unknown[],
  hang?: HangGioiHan,
): UseMutationResult<unknown, Error, BienNhan, NguCanhNhan> {
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  return useMutation<unknown, Error, BienNhan, NguCanhNhan>({
    mutationKey: KHOA_MUTATION_NHAN,
    mutationFn: (b) => quaHang(hang, b.lo, () => datNhanTicket(b.ticket_id, b.nhan, b.gan)),
    onMutate: async (b) => {
      const k = khoa; // BAT-28: chụp khoá danh sách — xem `useDoiTrangThai`
      batDauSua(qc, b.ticket_id, b.ma); // trước mọi `await`: cặp với `lamMoiSauDoi` trong `onSettled`
      await qc.cancelQueries({ queryKey: k });
      const anh = qc.getQueryData<CacheDanhSach>(k);
      let vi_tri = -1;
      if (anh !== undefined) {
        for (const p of anh.pages) {
          const t = p.items.find((x) => x.id === b.ticket_id);
          if (t !== undefined) {
            vi_tri = t.nhan.indexOf(b.nhan);
            break;
          }
        }
        qc.setQueryData<CacheDanhSach>(k, datNhanTrongCache(anh, b.ticket_id, b.nhan, b.gan));
      }
      return { vi_tri, khoa: k };
    },
    onError: (loi, b, ngu_canh) => {
      /*
       * Hoàn vào khoá ĐÃ GHI (ngữ cảnh). Ngữ cảnh `undefined` = `onMutate` ném
       * trước khi ghi (ném ở `cancelQueries`/tra cache) ⇒ không hoàn gì: phép
       * ngược trên một cache chưa bị đổi là **đổi** nó (bỏ một nhãn có thật).
       */
      if (ngu_canh !== undefined) {
        qc.setQueryData<CacheDanhSach>(ngu_canh.khoa, (cu) =>
          cu === undefined
            ? cu
            : datNhanTrongCache(cu, b.ticket_id, b.nhan, !b.gan, ngu_canh.vi_tri),
        );
      }
      if (b.lo !== true) toast.bao(cauLoi(loi));
    },
    onSettled: (_d, _l, b, ngu_canh) => {
      lamMoiSauDoi(qc, ngu_canh?.khoa ?? khoa, b.ticket_id, b.ma);
    },
  });
}

/* ================================================================== *
 * 2b. Thanh chọn nhiều — d.416 "`X` chọn; áp một phím cho nhiều ticket"
 * ================================================================== */

/**
 * **Thanh chọn nhiều** (BAT-35): hiện khi có ≥1 thẻ đã chọn. Số thẻ, ba ô áp cho
 * cả tập (trạng thái, ưu tiên, nhãn), nút giao việc, nút bỏ chọn. `S`/`P`/`L` khi
 * có thẻ đã chọn đưa con trỏ vào đúng ô ở đây (cùng khuôn `S`/`P`/`L` một thẻ đưa
 * vào ô của panel); `A` mở hộp giao việc nhiều thẻ.
 *
 * Hai ô chọn có mục trống đứng đầu và **luôn về trống** sau khi áp: thanh không giữ
 * "giá trị hiện tại" vì các thẻ đã chọn có thể đang ở các giá trị khác nhau. Lúc
 * một lượt còn bay (`dang_ap`) mọi ô khoá — chốt thật là `useMotLan` ở `apLo`.
 */
function ThanhChonNhieu({
  so,
  the_chon,
  dang_ap,
  xin_focus,
  daFocus,
  apTrangThai,
  apUuTien,
  apNhan,
  moGiao,
  boChon,
  traFocus,
}: {
  so: number;
  /** Các thẻ đã chọn đang hiện — để hộp hỏi nói rõ `L` là gắn hay bỏ. */
  the_chon: readonly Pick<TicketDong, 'id' | 'ma' | 'nhan'>[];
  dang_ap: boolean;
  xin_focus: OLo | null;
  daFocus: () => void;
  apTrangThai: (v: string) => void;
  apUuTien: (v: string) => void;
  apNhan: (v: string) => void;
  moGiao: () => void;
  boChon: () => void;
  /** Đưa focus về danh sách (nút "Mở" của thẻ đang focus, hoặc thẻ đầu). */
  traFocus: () => void;
}): React.JSX.Element {
  const o_tt = useRef<HTMLSelectElement | null>(null);
  const o_ut = useRef<HTMLSelectElement | null>(null);
  const o_nhan = useRef<HTMLInputElement | null>(null);
  const [nhan, datNhan] = useState('');
  /*
   * **Giá trị chờ** của ba ô (sửa theo reviewer BAT-35; BAT-39). Ô KHÔNG áp ở
   * `onChange`: trên Chrome/Edge Windows và Firefox, `↑`/`↓` trên một `<select>`
   * đang đóng bắn `change` ngay — một phím lỡ tay sẽ áp cho cả tập thẻ. Ô cũng
   * KHÔNG áp ở `Enter` (BAT-39, `spec-questions.md` #164): trên Chromium, `Enter` để
   * **đóng danh sách đã mở** (sau khi chọn bằng mũi tên) vẫn tới `keydown` của
   * `<select>` — 19/10 đã áp nhầm "Đang làm" cho 2 thẻ trên production. Nên ô
   * (chuột, mũi tên, Space, gõ chữ, `Enter`) **chỉ đặt giá trị chờ**; **chỉ nút
   * "Áp" cạnh ô** mới gửi. Không gắn `onKeyDown` cho `Enter` ở ba ô: listener phím
   * của danh sách bỏ qua ô đang gõ (`trongONhap`), vỏ không bắt `Enter`, thanh
   * không nằm trong `<form>` — không đường nào biến `Enter` thành áp/mở thẻ.
   */
  const [cho_tt, datChoTt] = useState('');
  const [cho_ut, datChoUt] = useState('');
  /**
   * Lượt áp **đang chờ chủ xác nhận** (BAT-38, #159): N ≥ `NGUONG_HOI_AP` thẻ ⇒
   * hỏi "Áp cho N thẻ?" trước. `null` = không hỏi gì. Giá trị chờ (`cho_tt`,
   * `cho_ut`, `nhan`) **giữ nguyên** trong lúc hỏi — Huỷ thì còn đó để sửa/áp lại.
   */
  const [hoi, datHoi] = useState<{ o: OLo; gia_tri: string } | null>(null);

  useEffect(() => {
    if (xin_focus === null) return;
    const el = xin_focus === 'trang-thai' ? o_tt.current : xin_focus === 'uu-tien' ? o_ut.current : o_nhan.current;
    el?.focus();
    daFocus();
  }, [xin_focus, daFocus]);

  /*
   * Áp xong (đã gửi lượt) ⇒ trả focus về danh sách **ngay**: ô sắp khoá (`dang_ap`)
   * và thanh có thể biến mất (mọi thẻ xong) — để yên thì focus rơi về `body`.
   */
  const thucHien = (o: OLo, v: string): void => {
    if (o === 'trang-thai') {
      apTrangThai(v);
      datChoTt('');
    } else if (o === 'uu-tien') {
      apUuTien(v);
      datChoUt('');
    } else {
      apNhan(v);
      datNhan('');
    }
    traFocus();
  };
  /** N < 10 ⇒ áp luôn (như cũ); N ≥ 10 ⇒ mở hộp hỏi, chưa gửi gì. */
  const xin = (o: OLo, v: string): void => {
    if (canHoiAp(so)) {
      datHoi({ o, gia_tri: v });
      return;
    }
    thucHien(o, v);
  };
  const apTt = (): void => {
    if (cho_tt === '') return;
    xin('trang-thai', cho_tt);
  };
  const apUt = (): void => {
    if (cho_ut === '') return;
    xin('uu-tien', cho_ut);
  };
  const apNh = (): void => {
    if (nhan.trim() === '') return;
    xin('nhan', nhan);
  };

  return (
    <>
    <section
      aria-label="Thẻ đã chọn"
      data-o="thanh-chon-nhieu"
      data-hang="nut"
      data-dang-ap={dang_ap ? 'co' : 'khong'}
      aria-busy={dang_ap}
      /*
       * **`Esc` ở bất kỳ ô nào của thanh ⇒ bỏ chọn hết** — đúng chữ "Esc bỏ chọn" in
       * trên thanh, cùng nghĩa với `Esc` ở danh sách (listener danh sách bỏ qua ô
       * đang gõ nên thanh tự bắt). Rồi trả focus về danh sách (thanh biến mất cùng
       * tập chọn). `stopPropagation`: listener `window` không xử lý `Esc` lần hai
       * (nó sẽ đóng panel — Esc thứ hai mới đóng panel, như ở danh sách).
       */
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || dangSoanIme(e.nativeEvent)) return;
        e.preventDefault();
        e.stopPropagation();
        boChon();
        traFocus();
      }}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-vien bg-nen-lop px-2 py-1 text-xs text-chu"
    >
      {/* Đọc bằng vùng `aria-live` luôn có ở trang (`data-o="loa-chon"`), không ở đây. */}
      <span data-o="so-chon" className="font-semibold">
        {nhanSoChon(so)}
      </span>
      {dang_ap ? <span data-o="dang-ap">{NHAN_DANG_AP}</span> : null}
      <select
        ref={o_tt}
        data-lo="trang-thai"
        aria-label={NHAN_LO_TRANG_THAI}
        value={cho_tt}
        disabled={dang_ap}
        onChange={(e) => {
          datChoTt(e.target.value);
        }}
        className={LOP_O_NHAP}
      >
        <option value="">— {NHAN_TRANG_THAI_PANEL} —</option>
        {COT_BANG.map((t) => (
          <option key={t} value={t}>
            {NHAN_TRANG_THAI[t]}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-nut="ap-trang-thai"
        aria-label={NHAN_AP_TRANG_THAI}
        disabled={dang_ap || cho_tt === ''}
        onClick={apTt}
        className={LOP_O_NHAP}
      >
        {NHAN_NUT_AP}
      </button>
      <select
        ref={o_ut}
        data-lo="uu-tien"
        aria-label={NHAN_LO_UU_TIEN}
        value={cho_ut}
        disabled={dang_ap}
        onChange={(e) => {
          datChoUt(e.target.value);
        }}
        className={LOP_O_NHAP}
      >
        <option value="">— {NHAN_UU_TIEN_PANEL} —</option>
        {UU_TIEN_THEO_THU_TU.map((u) => (
          <option key={u} value={u}>
            {NHAN_UU_TIEN[u]}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-nut="ap-uu-tien"
        aria-label={NHAN_AP_UU_TIEN}
        disabled={dang_ap || cho_ut === ''}
        onClick={apUt}
        className={LOP_O_NHAP}
      >
        {NHAN_NUT_AP}
      </button>
      <input
        ref={o_nhan}
        data-lo="nhan"
        aria-label={NHAN_LO_NHAN}
        placeholder={NHAN_NHAN_PANEL}
        value={nhan}
        disabled={dang_ap}
        onChange={(e) => {
          datNhan(e.target.value);
        }}
        className={`w-32 ${LOP_O_NHAP}`}
      />
      <button
        type="button"
        data-nut="ap-nhan"
        aria-label={NHAN_AP_NHAN}
        disabled={dang_ap || nhan.trim() === ''}
        onClick={apNh}
        className={LOP_O_NHAP}
      >
        {NHAN_NUT_AP}
      </button>
      <button
        type="button"
        data-nut="giao-lo"
        aria-label={NHAN_LO_GIAO}
        disabled={dang_ap}
        onClick={moGiao}
        className={LOP_O_NHAP}
      >
        {NHAN_NUT_GIAO_VIEC}
      </button>
      <button
        type="button"
        data-nut="bo-chon"
        onClick={boChon}
        className="text-xs text-neutral-600 underline"
      >
        {NHAN_BO_CHON}
      </button>
    </section>
    {hoi === null ? null : (
      <HopXacNhanAp
        so={so}
        mo_ta={moTaViecAp(hoi.o, hoi.gia_tri, the_chon)}
        xacNhan={() => {
          const h = hoi;
          datHoi(null);
          thucHien(h.o, h.gia_tri);
        }}
        huy={() => {
          datHoi(null);
        }}
      />
    )}
    </>
  );
}

/** Một dòng nói lượt áp sẽ làm gì — hiện trong hộp "Áp cho N thẻ?". */
function moTaViecAp(
  o: OLo,
  v: string,
  the_chon: readonly Pick<TicketDong, 'id' | 'ma' | 'nhan'>[],
): string {
  if (o === 'trang-thai') {
    return `${NHAN_TRANG_THAI_PANEL}: ${NHAN_TRANG_THAI[v as TrangThaiTicket]}`;
  }
  if (o === 'uu-tien') return `${NHAN_UU_TIEN_PANEL}: ${NHAN_UU_TIEN[v as UuTien]}`;
  // `L`: nói rõ lượt này GẮN hay BỎ — cùng `dichNhanLo` với lúc gửi (câu 67, 70).
  return moTaNhanLo(the_chon, v);
}

/** Bộ chọn của hộp "Áp cho N thẻ?" trên DOM. */
const CHON_HOP_XAC_NHAN_AP = '[data-o="hop-xac-nhan-ap"]';
/** Hộp "Áp cho N thẻ?" đang mở? Listener phím danh sách thoát sớm khi có. */
export function hopXacNhanApDangMo(): boolean {
  return document.querySelector(CHON_HOP_XAC_NHAN_AP) !== null;
}

/**
 * **Hộp "Áp cho N thẻ?"** (BAT-38, `spec-questions.md` #159, Chủ chốt T-38 = A) —
 * chỉ mở khi N ≥ `NGUONG_HOI_AP`. Cùng khuôn hộp xác nhận của `trang/token-agent.tsx`:
 * `role="dialog"` + `aria-modal`, focus vào **Huỷ** khi mở (Enter vô ý không là
 * "xác nhận" cho N thẻ), `Esc` = Huỷ (trừ lúc IME), Tab vòng trong hộp, phím ngoài
 * hộp không tới trang (`chanPhimNgoaiHop`), bấm nền = Huỷ.
 *
 * Huỷ ⇒ **không gửi gì**, focus về đúng chỗ đã mở hộp (ô/nút của thanh), giá trị
 * chờ còn nguyên. Xác nhận ⇒ cha áp rồi tự trả focus về danh sách — nên cleanup
 * **không** trả focus lần nữa (`tra_ve`), kẻo kéo focus về ô vừa áp.
 */
function HopXacNhanAp({
  so,
  mo_ta,
  xacNhan,
  huy,
}: {
  so: number;
  mo_ta: string;
  xacNhan: () => void;
  huy: () => void;
}): React.JSX.Element {
  const khung = useRef<HTMLDivElement | null>(null);
  const nut_huy = useRef<HTMLButtonElement | null>(null);
  const tra_ve = useRef(true);

  useEffect(() => {
    const nghe = (e: KeyboardEvent): void => {
      const h = khung.current;
      if (h !== null) chanPhimNgoaiHop(e, h, huy);
    };
    window.addEventListener('keydown', nghe, { capture: true });
    return () => {
      window.removeEventListener('keydown', nghe, { capture: true });
    };
  }, [huy]);

  useEffect(() => {
    const truoc = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nut_huy.current?.focus();
    return () => {
      if (tra_ve.current && truoc !== null && truoc.isConnected) truoc.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-[10vh]">
      <button
        type="button"
        aria-label={NHAN_DONG_HOP_AP_NGOAI}
        tabIndex={-1}
        onClick={huy}
        className="absolute inset-0 bg-lop-phu"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hop-xac-nhan-ap-tieu-de"
        data-o="hop-xac-nhan-ap"
        ref={khung}
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            if (dangSoanIme(e.nativeEvent)) return;
            e.preventDefault();
            huy();
          }
        }}
        // Không tắt outline (THIET-KE "Bàn phím trước", BAT-67): vòng focus chung.
        className="relative z-10 flex w-full max-w-md flex-col gap-3 rounded border border-vien bg-nen-lop p-4 text-chu shadow-lg"
      >
        {/* Tiêu đề hộp nổi ở bậc `h2` mục — THIET-KE "Chữ" (thang tiêu đề). */}
        <h2 id="hop-xac-nhan-ap-tieu-de" className={LOP_TIEU_DE_MUC}>
          {cauHoiAp(so)}
        </h2>
        <p data-o="viec-ap" className="text-sm">
          {mo_ta}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-nut="xac-nhan-ap"
            onClick={() => {
              tra_ve.current = false;
              xacNhan();
            }}
            className={`rounded px-3 py-1.5 text-sm ${NUT_CHINH}`}
          >
            {nhanXacNhanAp(so)}
          </button>
          <button
            type="button"
            ref={nut_huy}
            data-nut="huy-ap"
            onClick={huy}
            className="rounded border border-vien px-3 py-1.5 text-sm"
          >
            {NHAN_HUY_AP}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 * 3. Hai nút kiểu xem — d.396
 * ================================================================== */

function NutKieuXem({
  kieu,
  dat,
}: {
  kieu: string;
  dat: (k: string, v: string) => void;
}): React.JSX.Element {
  return (
    <div
      data-hang="nut"
      data-o="kieu-xem"
      className="flex flex-wrap items-center gap-0.5 rounded border border-vien p-0.5"
    >
      {KIEU_XEM.map((k) => (
        <button
          key={k}
          type="button"
          data-kieu={k}
          aria-pressed={kieu === k}
          onClick={() => {
            dat(KHOA_XEM, k);
            /*
             * **Nhớ lựa chọn của chủ** (brief đợt 3 việc 8): bấm "Danh sách" rồi
             * sang một dự án khác mà bị kéo về Bảng là một lựa chọn bị quên. URL
             * vẫn thắng cả hai (d.397) — xem `kieuXemTuUrl`. Kho bị chặn ⇒ im
             * lặng không nhớ (`kho-cuc-bo.ts`).
             */
            ghiKieuXem(k);
          }}
          className={`${LOP_TAB_PILL} ${kieu === k ? LOP_TAB_PILL_DANG_CHON : LOP_TAB_PILL_THUONG}`}
        >
          {NHAN_KIEU_XEM[k]}
        </button>
      ))}
    </div>
  );
}

/* ================================================================== *
 * 3b. Phím `J`/`K` và `Esc` của thẻ đang chọn — d.405–406
 * ================================================================== */

/**
 * **`J`/`K` đi thẻ kế, `Esc` đóng panel, `S`/`P`/`L` mở panel vào ô trạng
 * thái/ưu tiên/thêm nhãn** — d.406, d.415, và vế "panel đổi theo thẻ đang chọn"
 * của brief. `S`/`P`/`L` cần một thẻ đang chọn; chưa chọn thì không làm gì. "Đang gõ" tính
 * bằng `trongONhap` dùng chung với vỏ và trang Cần Chủ; đang soạn IME cũng bỏ qua.
 *
 * Bốn điều cố ý:
 *
 *   * **Một** listener, ở **trang này**, không ở vỏ. `test/vo-linear.test.tsx`
 *     ghim rằng listener `keydown` duy nhất của vỏ (`C`, chuỗi `G`, `?` —
 *     `vo/phim-vo.tsx`) **không chạm** phím nào khác — một listener vỏ nghe
 *     rộng hơn sẽ ăn phím trước trang và `1`–`5` của d.270 ở trang Cần Chủ hết
 *     tác dụng. Và chỉ một: hai nơi cùng nghe `J` là hai bước nhảy cho một lần bấm.
 *   * **Đang gõ thì không nghe.** Trang có ô "Nhãn", ô "Tên view", ô trạng thái của panel —
 *     gõ chữ `j` vào chúng không được làm con trỏ thẻ nhảy.
 *   * **Có phím điều khiển thì không nghe** (`Cmd/Ctrl+K` của d.404, `Alt`…):
 *     `Esc` của panel cũng không được phá bảng phím `?` hay command menu khi
 *     chúng được dựng ở lượt sau.
 *   * `Esc` **chỉ** `preventDefault` khi panel đang mở: nếu không, nó cướp `Esc`
 *     của mọi thứ khác trên trang.
 */
function usePhimTheDangChon(
  thu_tu: readonly TicketDong[],
  dang_chon: string | null,
  moThe: (ma: string) => void,
  /** `S` — "trên ticket đang chọn: `S` trạng thái" (d.415). */
  phimS?: (ma: string) => void,
  /** `P` — "trên ticket đang chọn: `P` ưu tiên" (d.415). */
  phimP?: (ma: string) => void,
  /** `L` — "trên ticket đang chọn: `L` nhãn" (d.415). */
  phimL?: (ma: string) => void,
  /** `A` — "trên ticket đang chọn: `A` giao (chọn agent)" (d.415, BAT-33). */
  phimA?: (ma: string) => void,
  /**
   * BAT-35 — d.416 "`X` chọn; áp một phím cho nhiều ticket". `X` bật/tắt chọn thẻ
   * đang focus; `Esc` khi có thẻ đã chọn ⇒ bỏ chọn hết (trước cả đóng panel: Esc
   * thứ hai mới đóng panel). Có thẻ đã chọn ⇒ `S`/`P`/`L`/`A` chạy được cả khi
   * không có thẻ đang focus (đích là tập chọn — xem `phimS`… ở trang).
   */
  lo?: { co_chon: boolean; phimX: (ma: string) => void; boChon: () => void },
): void {
  const co_chon = lo?.co_chon ?? false;
  const phimX = lo?.phimX;
  const boChon = lo?.boChon;
  useEffect(() => {
    const nghe = (e: KeyboardEvent): void => {
      // Hộp tạo việc (BAT-22) đang mở: `Esc`/`J`/`K`/`S` thuộc về hộp, không về
      // danh sách phía sau.
      // Bảng phím `?` (BAT-23) cũng vậy, và hộp giao việc (BAT-33).
      // … và command menu `Cmd/Ctrl+K` (BAT-34).
      // … và hộp "Áp cho N thẻ?" của thanh chọn nhiều (BAT-38, #159).
      if (
        hopTaoViecDangMo() ||
        bangPhimDangMo() ||
        hopGiaoViecDangMo() ||
        commandMenuDangMo() ||
        hopXacNhanApDangMo()
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // `trongONhap` không coi ô tick / radio / nút là chỗ gõ chữ (BAT-36): focus ở ô
      // chọn thẻ `OChonThe` thì phím danh sách vẫn chạy.
      if (trongONhap(e.target)) return;
      // Đang soạn IME (gõ dấu tiếng Việt/CJK): phím thuộc về bộ gõ, không về danh sách.
      if (dangSoanIme(e)) return;

      if (e.key === 'Escape') {
        // BAT-35: có thẻ đã chọn ⇒ Esc bỏ chọn hết trước.
        if (co_chon && boChon !== undefined) {
          e.preventDefault();
          boChon();
          return;
        }
        if (dang_chon === null) return;
        e.preventDefault();
        moThe('');
        return;
      }

      if (e.key === 'x' || e.key === 'X') {
        // Bật/tắt chọn thẻ đang focus; chưa focus thẻ nào thì không làm gì.
        if (dang_chon === null || phimX === undefined) return;
        e.preventDefault();
        phimX(dang_chon);
        return;
      }

      /*
       * Đích của `S`/`P`/`L`/`A`: thẻ đang focus, hoặc (BAT-35) tập chọn khi có thẻ
       * đã chọn — lúc đó trang không đọc `ma` (`''`).
       */
      const dich = dang_chon ?? (co_chon ? '' : null);

      if (e.key === 's' || e.key === 'S') {
        /*
         * **Cần một thẻ đang chọn**: d.415 nói "trên ticket **đang chọn**". Chưa
         * chọn gì thì `S` không làm gì — không tự chọn thẻ đầu, vì đổi trạng thái
         * của một ticket chủ chưa trỏ tới là một thao tác chủ không yêu cầu.
         */
        if (dich === null || phimS === undefined) return;
        e.preventDefault();
        phimS(dich);
        return;
      }

      if (e.key === 'p' || e.key === 'P') {
        // Như `S`: cần thẻ đang chọn; chưa chọn thì không làm gì.
        if (dich === null || phimP === undefined) return;
        e.preventDefault();
        phimP(dich);
        return;
      }

      if (e.key === 'l' || e.key === 'L') {
        // Như `S`/`P`: cần thẻ đang chọn. `preventDefault` để chữ `l` không rơi
        // vào ô "Thêm nhãn" vừa được focus.
        if (dich === null || phimL === undefined) return;
        e.preventDefault();
        phimL(dich);
        return;
      }

      if (e.key === 'a' || e.key === 'A') {
        // Như `S`/`P`/`L`: cần thẻ đang chọn. `preventDefault` để chữ `a` không rơi
        // vào ô agent vừa được focus trong hộp.
        if (dich === null || phimA === undefined) return;
        e.preventDefault();
        phimA(dich);
        return;
      }

      const xuong = e.key === 'j' || e.key === 'J';
      const len = e.key === 'k' || e.key === 'K';
      if (!xuong && !len) return;
      if (thu_tu.length === 0) return;
      e.preventDefault();

      const i = thu_tu.findIndex((t) => t.ma === dang_chon);
      /*
       * Chưa chọn gì (`i === -1`) ⇒ `J` vào **thẻ đầu**, `K` vào **thẻ cuối**:
       * một cú bấm đầu tiên phải làm một việc thấy được, không im lặng.
       * Hết dãy thì **đứng lại**, không quay vòng: quay vòng làm chủ mất dấu chỗ
       * đang đứng trên một danh sách 200 dòng.
       */
      const j =
        i === -1
          ? xuong
            ? 0
            : thu_tu.length - 1
          : Math.min(Math.max(i + (xuong ? 1 : -1), 0), thu_tu.length - 1);
      const the = thu_tu[j];
      if (the !== undefined) moThe(the.ma);
    };
    window.addEventListener('keydown', nghe);
    return () => {
      window.removeEventListener('keydown', nghe);
    };
  }, [thu_tu, dang_chon, moThe, phimS, phimP, phimL, phimA, co_chon, phimX, boChon]);
}

/* ================================================================== *
 * 3c. Thanh lọc NHANH — Active / Backlog / All, người cầm, nhãn
 * ================================================================== */

/**
 * **Đầu danh sách: tab nhanh + một nút "Lọc"** — SPEC mục 14 d.407:
 *
 *   > Thanh lọc **không mở sẵn**: trên đầu danh sách chỉ có các **tab nhanh**
 *   > (Đang chạy · Backlog · Tất cả) và một nút **"Lọc"** mở menu chứa mọi ô lọc
 *   > trên, cùng với "Lưu thành view".
 *
 * Đợt 2 để **sáu ô + ba ô tick + ô "Tên view"** mở sẵn thành ba hàng, cộng hai ô
 * "người cầm"/"nhãn" ở hàng nhanh — tức hai chỗ nhập cho cùng một khoá URL. Đợt 3
 * gom lại: **một** chỗ cho mỗi bộ lọc, nằm trong menu.
 *
 * Ba thứ **không được mất** khi gom (và có ca test cho từng thứ):
 *   * bộ lọc vẫn **ghi trên URL** (d.397) — menu chỉ là chỗ nhập, `datKhoa` vẫn
 *     là đường duy nhất ghi;
 *   * **"Lưu thành view"** vào trong menu, không mất (d.407 nói thẳng);
 *   * câu "hai phép lọc nhanh chỉ soi trang đã tải" (`CAU_LOC_TRONG_TRANG`,
 *     quyết định 14/10) vẫn hiện ở chỗ cũ — dòng "Còn trang sau".
 *
 * Menu dùng được bằng **bàn phím** theo nếp `MenuWorkspace` của sidebar:
 * `aria-expanded` + `aria-haspopup`, `Escape` đóng và **trả focus về nút**. Ở
 * 375px nó là một tấm **trong luồng**, bề ngang bằng `rem` — không `fixed`, không
 * chiều rộng cứng (d.411).
 */
function ThanhNhanh({
  sp,
  dat,
  datSp,
  nhanh,
  du_an,
  agent,
  an_o_du_an,
  an_xong_cu,
  datAnXongCu,
}: {
  sp: URLSearchParams;
  dat: (k: string, v: string) => void;
  datSp: (v: URLSearchParams) => void;
  nhanh: string;
  du_an: readonly DuAnSidebar[];
  agent: readonly AgentChon[];
  an_o_du_an: boolean;
  an_xong_cu: boolean;
  datAnXongCu: (v: boolean) => void;
}): React.JSX.Element {
  const [mo, datMo] = useState(false);
  const nut = useRef<HTMLButtonElement | null>(null);
  const so_bat = soLocDangBat(sp);

  return (
    <section
      aria-label="Bộ lọc nhanh"
      data-khoi="nhanh"
      data-hang="nut"
      className="flex flex-wrap items-center gap-2"
    >
      <div data-hang="nut" className="flex flex-wrap items-center gap-0.5">
        {LOC_NHANH.map((n) => (
          <button
            key={n}
            type="button"
            data-nhanh={n}
            aria-pressed={nhanh === n}
            onClick={() => dat(KHOA_NHANH, n)}
            className={`${LOP_TAB_PILL} ${nhanh === n ? LOP_TAB_PILL_DANG_CHON : LOP_TAB_PILL_THUONG}`}
          >
            {NHAN_LOC_NHANH[n]}
          </button>
        ))}
      </div>

      <div className="relative">
        <button
          ref={nut}
          type="button"
          data-nut="loc"
          aria-haspopup="menu"
          aria-expanded={mo}
          onClick={() => {
            datMo((v) => !v);
          }}
          className={`rounded border px-2 py-0.5 text-sm ${
            so_bat === 0
              ? 'border-vien text-chu-mo hover:text-chu'
              : 'border-vien bg-nen-noi text-chu'
          }`}
        >
          {NHAN_NUT_LOC}
          {so_bat === 0 ? null : <span data-so="loc"> ({so_bat})</span>}
        </button>

        {!mo ? null : (
          <div
            role="menu"
            aria-label={NHAN_MENU_LOC}
            data-o="menu-loc"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                datMo(false);
                nut.current?.focus();
              }
            }}
            className="absolute top-full left-0 z-20 mt-1 flex w-[21rem] max-w-[90vw] flex-col gap-3 rounded-lg border border-vien bg-nen-lop p-3 text-chu shadow-lg"
          >
            <ThanhLocTicket
              sp={sp}
              dat={dat}
              datSp={datSp}
              du_an={du_an}
              agent={agent}
              an_o_du_an={an_o_du_an}
            />
            <ThanhView sp={sp} datSp={datSp} />
          </div>
        )}
      </div>

      {/* Ẩn/hiện **Xong cũ** — `spec-questions.md` #132. Không phải bộ lọc của
          d.396 (máy chủ không có nó), nên nó ở ngoài menu. */}
      <button
        type="button"
        data-nut="an-xong-cu"
        aria-pressed={an_xong_cu}
        title={`Ẩn ticket đã kết, cập nhật lần cuối quá ${String(NGAY_XONG_CU)} ngày trước`}
        onClick={() => datAnXongCu(!an_xong_cu)}
        className={`rounded border px-2 py-0.5 text-sm ${
          an_xong_cu ? 'border-vien bg-nen-noi text-chu' : 'border-vien text-chu-mo hover:text-chu'
        }`}
      >
        {NHAN_AN_XONG_CU}
      </button>
    </section>
  );
}

/* ================================================================== *
 * 4. Thanh lọc — chín bộ lọc của d.396, ghi trên URL (d.397)
 * ================================================================== */

function ThanhLocTicket({
  sp,
  dat,
  datSp,
  du_an,
  agent,
  an_o_du_an,
}: {
  sp: URLSearchParams;
  dat: (k: string, v: string) => void;
  datSp: (v: URLSearchParams) => void;
  du_an: readonly DuAnSidebar[];
  agent: readonly AgentChon[];
  /** Ở `/du-an/:ma` thì dự án do đường quyết — ô lọc dự án không có việc gì. */
  an_o_du_an: boolean;
}): React.JSX.Element {
  /** Ô Nhãn đang chứa đúng dạng mã ticket? ⇒ mã chuẩn in hoa (BAT-41, #167). */
  const ma_go_nhan = maTicketTuChuoiGo(sp.get(KHOA_LOC_TICKET.nhan) ?? '');
  const nguoi = (
    khoa: string,
    nhan: string,
  ): React.JSX.Element => (
    <label className="flex flex-col gap-1 text-xs">
      {nhan}
      <select
        data-loc={khoa}
        value={sp.get(khoa) ?? ''}
        onChange={(e) => dat(khoa, e.target.value)}
        className={LOP_O_NHAP}
      >
        <option value="">Bất kỳ</option>
        <option value={GIA_TRI_CHU}>{NHAN_CHU}</option>
        {agent.map((a) => (
          <option key={a.id} value={a.id}>
            {a.ten}
          </option>
        ))}
      </select>
    </label>
  );

  const co = (khoa: string, nhan: string): React.JSX.Element => (
    <label className="flex items-center gap-1 text-xs">
      <input
        type="checkbox"
        data-loc={khoa}
        checked={sp.get(khoa) === GIA_TRI_BAT}
        onChange={(e) => dat(khoa, e.target.checked ? GIA_TRI_BAT : '')}
      />
      {nhan}
    </label>
  );

  return (
    <section
      aria-label="Bộ lọc"
      data-khoi="loc"
      data-hang="nut"
      className="flex flex-wrap items-end gap-3"
    >
      {an_o_du_an ? null : (
        <label className="flex flex-col gap-1 text-xs">
          Dự án
          <select
            data-loc={KHOA_LOC_TICKET.du_an}
            value={sp.get(KHOA_LOC_TICKET.du_an) ?? ''}
            onChange={(e) => dat(KHOA_LOC_TICKET.du_an, e.target.value)}
            className={LOP_O_NHAP}
          >
            <option value="">{NHAN_TAT_CA_DU_AN}</option>
            {du_an.map((d) => (
              <option key={d.id} value={d.id}>
                {d.ten}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-xs">
        Trạng thái
        <select
          data-loc={KHOA_LOC_TICKET.trang_thai}
          value={sp.get(KHOA_LOC_TICKET.trang_thai) ?? ''}
          onChange={(e) => dat(KHOA_LOC_TICKET.trang_thai, e.target.value)}
          className={LOP_O_NHAP}
        >
          <option value="">Mọi trạng thái</option>
          {TRANG_THAI_THEO_THU_TU.map((t) => (
            <option key={t} value={t}>
              {NHAN_TRANG_THAI[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        Ưu tiên
        <select
          data-loc={KHOA_LOC_TICKET.uu_tien}
          value={sp.get(KHOA_LOC_TICKET.uu_tien) ?? ''}
          onChange={(e) => dat(KHOA_LOC_TICKET.uu_tien, e.target.value)}
          className={LOP_O_NHAP}
        >
          <option value="">Mọi ưu tiên</option>
          {UU_TIEN_THEO_THU_TU.map((u) => (
            <option key={u} value={u}>
              {NHAN_UU_TIEN[u]}
            </option>
          ))}
        </select>
      </label>

      {nguoi(KHOA_LOC_TICKET.chiu_trach_nhiem, NHAN_CHIU_TRACH_NHIEM)}
      {nguoi(KHOA_LOC_TICKET.nguoi_dang_cam, NHAN_NGUOI_DANG_CAM)}

      {/*
       * Nhãn là **ô chữ**, không ô chọn: nhãn do agent và chủ đặt tự do (mục 4),
       * không có bảng mã nào, và không có đường API nào liệt kê chúng. Một ô chọn
       * ở đây sẽ phải đoán danh sách.
       *
       * BAT-41 (tạm, `spec-questions.md` #167): danh sách không có ô tìm chữ, nên
       * chủ hay gõ mã ticket vào đây. Giá trị **đúng dạng mã** ⇒ thêm một dòng
       * "Mở MÃ" tới trang chi tiết. Chỉ là dòng thêm: lọc nhãn giữ nguyên (giá
       * trị vẫn lên URL, vẫn lọc). Không gọi API — trang chi tiết tự lo 404.
       */}
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-xs">
          Nhãn
          <input
            data-loc={KHOA_LOC_TICKET.nhan}
            value={sp.get(KHOA_LOC_TICKET.nhan) ?? ''}
            onChange={(e) => dat(KHOA_LOC_TICKET.nhan, e.target.value)}
            className={LOP_O_NHAP}
          />
        </label>
        {ma_go_nhan === null ? null : (
          <Link
            to={duongTicket(ma_go_nhan)}
            data-o="mo-ma-tu-loc-nhan"
            className="text-xs text-nhan-manh-chu underline"
          >
            Mở {ma_go_nhan}
          </Link>
        )}
      </div>

      <div data-hang="nut" className="flex flex-wrap items-center gap-3">
        {co(KHOA_LOC_TICKET.co_co, NHAN_CO_CO)}
        {co(KHOA_LOC_TICKET.can_chu, NHAN_CAN_CHU)}
        {co(KHOA_LOC_TICKET.xong_khong_bang_chung, NHAN_XONG_KHONG_BANG_CHUNG)}
      </div>

      {soLocDangBat(sp) === 0 ? null : (
        <button
          type="button"
          data-nut="xoa-loc"
          onClick={() => {
            /*
             * Bỏ **đúng các khoá lọc**, giữ `xem`: chủ đang xem bảng thì bỏ lọc
             * không được đẩy về danh sách. `datSp(new URLSearchParams())` sẽ làm
             * đúng chuyện đó.
             */
            const moi = new URLSearchParams(sp);
            for (const k of Object.values(KHOA_LOC_TICKET)) moi.delete(k);
            moi.delete(KHOA_VIEW);
            datSp(moi);
          }}
          className="text-xs text-neutral-600 underline"
        >
          {NHAN_XOA_LOC} ({soLocDangBat(sp)})
        </button>
      )}
    </section>
  );
}

/* ================================================================== *
 * 5. View riêng — d.396 "Lưu thành view riêng"
 * ================================================================== */

function ThanhView({
  sp,
  datSp,
}: {
  sp: URLSearchParams;
  datSp: (v: URLSearchParams) => void;
}): React.JSX.Element {
  /*
   * Đọc một lần vào state, rồi mọi phép sửa đi qua `luuView`/`boView` (hàm thuần)
   * **và** ghi xuống kho. Không đọc lại kho ở mỗi lần vẽ: `localStorage` là I/O
   * đồng bộ, và một lần `JSON.parse` cho mỗi lần vẽ của một trang có 5.000 dòng
   * là đúng loại chi phí mà d.409 không cho phép.
   */
  const [ds, datDs] = useState<ViewDaLuu[]>(() => docView(khoView()));
  const [ten, datTen] = useState('');

  const ghi = (moi: ViewDaLuu[]): void => {
    datDs(moi);
    try {
      khoView().setItem(KHOA_VIEW_DA_LUU, JSON.stringify(moi));
    } catch {
      /*
       * Kho đầy hoặc bị chặn (chế độ riêng tư): **không** làm vỡ trang. View là
       * một tiện ích; bộ lọc thật vẫn nằm trên URL (d.397), nên chủ không mất gì
       * ngoài cái tên.
       */
    }
  };

  const dang_mo = sp.get(KHOA_VIEW);

  return (
    <section aria-label="View đã lưu" data-khoi="view" data-hang="nut" className="flex flex-wrap items-end gap-3">
      {ds.map((v) => (
        <span key={v.ten} className="flex items-center gap-1">
          <button
            type="button"
            data-view={v.ten}
            aria-pressed={dang_mo === v.ten}
            onClick={() => {
              const moi = new URLSearchParams(v.truy_van);
              moi.set(KHOA_VIEW, v.ten);
              datSp(moi);
            }}
            className={`${LOP_TAB_PILL} border border-vien ${
              dang_mo === v.ten ? LOP_TAB_PILL_DANG_CHON : LOP_TAB_PILL_THUONG
            }`}
          >
            {v.ten}
          </button>
          <button
            type="button"
            data-bo-view={v.ten}
            aria-label={`Bỏ view ${v.ten}`}
            onClick={() => {
              ghi(boView(ds, v.ten));
            }}
            className="text-xs text-neutral-500"
          >
            ×
          </button>
        </span>
      ))}

      <label className="flex flex-col gap-1 text-xs">
        Tên view
        <input
          data-o="ten-view"
          value={ten}
          onChange={(e) => datTen(e.target.value)}
          className={LOP_O_NHAP}
        />
      </label>
      <button
        type="button"
        data-nut="luu-view"
        disabled={ten.trim() === ''}
        onClick={() => {
          /*
           * View lưu **bộ lọc và kiểu xem đang ở trên URL**, trừ `view` (tên của
           * chính nó — lưu vào thì mở lại một view cũ sẽ ghi đè tên).
           */
          const q = new URLSearchParams(sp);
          q.delete(KHOA_VIEW);
          ghi(luuView(ds, ten, q.toString()));
          datTen('');
        }}
        className={`rounded px-3 py-1 text-sm ${ten.trim() === '' ? NUT_MO : NUT_CHINH}`}
      >
        {NHAN_LUU_VIEW}
      </button>
    </section>
  );
}

/* ================================================================== *
 * 6. Kiểu xem 1 — danh sách gom theo trạng thái, ảo hoá (d.396, d.409)
 * ================================================================== */

function DanhSachGom({
  trang,
  chon,
  moThe,
  da_chon,
  batChon,
  hep,
  taoViec,
}: {
  trang: ManHinhDanhSach;
  chon: string | null;
  moThe: (ma: string) => void;
  /** Id các thẻ đã chọn bằng `X` (BAT-35). */
  da_chon: ReadonlySet<string>;
  batChon: (id: string) => void;
  hep: boolean;
  /**
   * BAT-63: có ⇒ đầu nhóm Backlog (`NHOM_CO_NUT_TAO`) có nút `+` mở hộp Tạo việc
   * của vỏ với Backlog chọn sẵn. `null` ngoài vỏ / dự án `archived`.
   */
  taoViec: MoTaoViec | null;
}): React.JSX.Element {
  const khung = useRef<HTMLDivElement | null>(null);
  const dong = useMemo(() => lamPhang(gomTheoTrangThai(trang.items)), [trang.items]);

  /*
   * **Đo thật từng dòng**, không một pitch cứng — xem `CHIEU_CAO_DONG` ở
   * `src/khung-cuon.ts`: thẻ việc ba hàng cao ~110–150px, nên một pitch 56px
   * làm các thẻ **đè lên nhau**. Bộ tuỳ chọn dựng bằng một hàm thuần để ca test
   * ghim được "có truyền `measureElement`" (jsdom không đo được layout).
   */
  const ao = useVirtualizer(
    tuyChonDanhSachAo(
      dong.length,
      (i) => dong[i]?.loai === 'nhom',
      () => khung.current,
    ),
  );

  if (trang.items.length === 0) {
    return (
      <p role="status" className={LOP_CAU_CHO}>
        {CAU_KHONG_CO_TICKET}
      </p>
    );
  }

  return (
    <div
      ref={khung}
      data-o="khung-cuon"
      // `h-[70vh]` + `overflow-y-auto`: khung cuộn phải có chiều cao **của mình**,
      // nếu không thì trang cuộn và bộ ảo hoá không bao giờ thấy một vùng hữu hạn.
      className="h-[70vh] overflow-y-auto rounded-lg border border-vien"
    >
      <ul style={{ height: `${String(ao.getTotalSize())}px`, position: 'relative' }}>
        {ao.getVirtualItems().map((v) => {
          const d = dong[v.index];
          if (d === undefined) return null;
          return (
            <li
              key={v.key}
              data-chi-so={v.index}
              /*
               * `data-index` + `ref={ao.measureElement}`: quy ước của TanStack
               * Virtual để **đo dòng thật**. `data-chi-so` giữ nguyên vì các ca
               * test cũ đếm theo nó.
               */
              data-index={v.index}
              ref={ao.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${String(v.start)}px)`,
              }}
            >
              {d.loai === 'nhom' ? (
                /*
                 * BAT-63: dải đầu nhóm = `h2` + (chỉ nhóm Backlog) nút `+`. Nút
                 * nằm **ngoài** `h2` (tên tiêu đề nhóm không lẫn nhãn nút), cùng
                 * mẫu nút `+` cột Cần làm của Bảng. Dải vẫn ở **trong** `li` được
                 * đo (`measureElement`), nút 24px thấp hơn dòng chữ của `h2` nên
                 * chiều cao dòng nhóm không đổi; `J`/`K` đi theo thẻ, không theo
                 * focus, nên nút không chen vào thứ tự đó. Bấm: `stopPropagation`
                 * rồi mở hộp với Backlog chọn sẵn. Không có nút `…`.
                 */
                <div data-dau-nhom={d.trang_thai} className="flex items-center gap-1 bg-nen-lop pr-2">
                  <h2
                    data-nhom={d.trang_thai}
                    // Sáu nhóm có cột trên Bảng được **đánh dấu** — xem `NHOM_COT_CHU`.
                    data-nhom-chu={laNhomChu(d.trang_thai) ? 'co' : 'khong'}
                    /*
                     * Đầu nhóm (hệ thiết kế 29/10): icon trạng thái + tên + số đếm
                     * xám, trên dải lớp nổi — không tô màu trạng thái lên cả dải.
                     */
                    className="flex min-w-0 flex-1 items-center gap-2 bg-nen-lop px-3 py-2 text-sm font-medium text-chu"
                  >
                    <IconTrangThai trang_thai={d.trang_thai} co={14} />
                    {d.nhan}{' '}
                    <span data-so="nhom" className="text-chu-mo-hon tabular-nums">
                      {d.so}
                    </span>
                  </h2>
                  {taoViec === null || !NHOM_CO_NUT_TAO.includes(d.trang_thai) ? null : (
                    <button
                      type="button"
                      data-nut="tao-trong-nhom"
                      aria-label={nhanNutTaoTrongNhom(d.nhan)}
                      title={nhanNutTaoTrongNhom(d.nhan)}
                      onClick={(e) => {
                        e.stopPropagation();
                        taoViec({ trang_thai: 'backlog' });
                      }}
                      className={LOP_NUT_ICON}
                    >
                      <IconThem />
                    </button>
                  )}
                </div>
              ) : (
                <HangTicket
                  the={d.the}
                  bay_gio={trang.bay_gio}
                  chon={chon === d.the.ma}
                  moThe={moThe}
                  da_chon={da_chon.has(d.the.id)}
                  batChon={batChon}
                  hep={hep}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * **Một thẻ việc** — tám thứ của brief BAT-6 đợt 2, **một** component cho cả
 * danh sách và bảng.
 *
 * | Thứ | Ở đâu | Nguồn |
 * |---|---|---|
 * | mã | `[data-o="ma"]` (link `/t/<MÃ>`) | `the.ma` |
 * | tiêu đề, gọn **đúng 2 dòng** | `[data-o="tieu-de"]` (`line-clamp-2`) | `the.tieu_de` |
 * | người đang cầm (viết tắt) | `[data-o="nguoi-cam"]` | 19.1, **máy chủ tính** |
 * | nhãn màu | `[data-nhan="…"]` | `the.nhan` (đường đọc màn hình) |
 * | ưu tiên, **icon** | `[data-o="uu-tien"]` | `IconUuTien` + `nhan_uu_tien` |
 * | việc con xong/tổng | `[data-o="viec-con"]` | `con_tong - con_chua_ket` |
 * | số Cần Chủ liên quan | `[data-o="can-chu"]`, chỉ khi > 0 | `can_chu_so` |
 * | thời gian tương đối | `[data-o="thoi-gian"]` | `cap_nhat_luc` + `bay_gio` |
 *
 * **Không một nhãn tiếng Việt nào dịch ở đây**: `nhan_trang_thai` và
 * `nhan_uu_tien` đi nguyên văn từ máy chủ (d.381). Icon ưu tiên chỉ là **hình**
 * đi kèm, và nhãn của máy chủ nằm trong `aria-label` nên nó không bao giờ là
 * thông tin duy nhất.
 *
 * **Xuất ra** từ BAT-6 đợt 3: khối "Việc đang chạy" của Tổng quan (SPEC mục 11
 * d.318) vẽ "cùng kiểu thẻ với bảng việc ở mục 14" — tức **cùng component**, chứ
 * không phải một bản chép nhìn giống.
 */
export function NoiDungThe({
  the,
  bay_gio,
  hien_trang_thai,
  ten_nguoi_cam,
  kieu = 'the',
  truoc,
  sau,
}: {
  the: TicketDong;
  bay_gio: number;
  /** Danh sách gom theo trạng thái vẫn hiện nhãn trạng thái; bảng thì cột đã nói. */
  hien_trang_thai: boolean;
  /**
   * **Tên** agent đang cầm do chỗ gọi đưa xuống — Tổng quan có một dẫn xuất riêng
   * (`TheViecDangChay.nguoi_cam_ten`: agent của **lượt đang mở**, d.318). Không
   * truyền thì thẻ dùng `the.nguoi_cam_ten` của chính nó (d.404).
   */
  ten_nguoi_cam?: string | null;
  /**
   * Hình vẽ (hệ thiết kế 29/10, `DESIGN.md`) — **cùng** tám thứ, hai bố cục:
   *   * `'the'` (mặc định — bảng, Tổng quan): hàng đầu icon trạng thái + mã →
   *     tiêu đề 2 dòng → hàng chip nhỏ, thời gian xám ở cuối;
   *   * `'dong'` (danh sách): MỘT hàng ~36px — icon trạng thái trước tiêu đề,
   *     thông tin phụ (nhãn, việc con, hạn, thời gian, người cầm) canh phải, xám.
   */
  kieu?: 'the' | 'dong';
  /** Điều khiển đặt ĐẦU hàng thứ nhất (ô chọn `X`, tay kéo). */
  truoc?: React.ReactNode;
  /** Điều khiển đặt CUỐI hàng thứ nhất (nút "Mở"). */
  sau?: React.ReactNode;
}): React.JSX.Element {
  const con_xong = the.con_tong - the.con_chua_ket;
  const ma = (
    <Link to={duongTicket(the.ma)} data-o="ma" className="ma-ticket hover:text-chu">
      {the.ma}
    </Link>
  );
  /*
   * Nhãn trạng thái của **máy chủ** (d.381) vẫn nằm trong DOM. Ở kiểu `'dong'`
   * nó chỉ dành cho trình đọc màn hình (`sr-only`): đầu nhóm ngay trên đã nói
   * trạng thái bằng chữ, và icon cạnh tiêu đề nói bằng hình — in lần ba trên
   * mỗi dòng là thừa.
   */
  const trang_thai = hien_trang_thai ? (
    <span data-o="trang-thai" className={kieu === 'dong' ? 'sr-only' : 'text-xs text-chu-mo'}>
      {the.nhan_trang_thai}
    </span>
  ) : null;
  const co = the.co_co ? (
    <span data-o="co" title="Có cờ hệ thống" className="text-xs font-semibold text-canh">
      ⚑
    </span>
  ) : null;
  /*
   * **Gọn đúng hai dòng**: `line-clamp-2` cắt bằng `…` của chính trình duyệt
   * (`-webkit-line-clamp`), không một phép cắt theo **số ký tự** ở JS — số ký
   * tự vừa hai dòng phụ thuộc bề ngang thẻ và cỡ chữ, nên mọi con số gõ cứng
   * đều sai ở một trong hai kiểu xem. Ở kiểu `'dong'` tiêu đề thường vừa một
   * hàng; tiêu đề quá dài mới xuống hàng thứ hai.
   */
  const tieu_de = (
    <span
      data-o="tieu-de"
      className={
        kieu === 'dong'
          ? 'line-clamp-2 min-w-0 flex-1 basis-40 text-sm text-chu'
          : 'line-clamp-2 text-sm text-chu'
      }
    >
      {the.tieu_de}
    </span>
  );
  const phu = (
    <>
      {the.nhan.map((n) => (
        <span key={n} data-nhan={n} className={`rounded px-1.5 py-0.5 text-xs ${mauNhan(n)}`}>
          {n}
        </span>
      ))}
      {the.con_tong === 0 ? null : (
        <span data-o="viec-con" title="Ticket con đã kết / tổng" className="tabular-nums">
          {con_xong}/{the.con_tong}
        </span>
      )}
      {the.can_chu_so === 0 ? null : (
        <span data-o="can-chu" className="font-semibold text-canh">
          Cần Chủ {the.can_chu_so}
        </span>
      )}
      <OHan han_luc={the.han_luc} bay_gio={bay_gio} />
    </>
  );
  /* d.412 — tương đối trên màn hình, giờ VN khi rê chuột. */
  const thoi_gian = (
    <time
      dateTime={new Date(the.cap_nhat_luc).toISOString()}
      title={gioDayDu(the.cap_nhat_luc)}
      data-o="thoi-gian"
      className="text-xs text-chu-mo-hon tabular-nums"
    >
      {thoiGianTuongDoi(the.cap_nhat_luc, bay_gio)}
    </time>
  );

  if (kieu === 'dong') {
    return (
      <div data-hang="nut" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {truoc}
        {/* Ưu tiên "Không" KHÔNG in gì — d.404, lý do ở kiểu `'the'` bên dưới. */}
        {the.uu_tien === 'none' ? null : (
          <span
            data-o="uu-tien"
            data-uu-tien={the.uu_tien}
            aria-label={the.nhan_uu_tien}
            title={the.nhan_uu_tien}
            className={`flex shrink-0 items-center ${LOP_UU_TIEN[the.uu_tien]}`}
          >
            <IconUuTien uu_tien={the.uu_tien} />
          </span>
        )}
        {ma}
        <IconTrangThai trang_thai={the.trang_thai} co={14} />
        {trang_thai}
        {tieu_de}
        {co}
        <span
          data-hang="nut"
          className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs text-chu-mo"
        >
          {phu}
          {thoi_gian}
          <ONguoi nguoi={the.nguoi_dang_cam} ten={ten_nguoi_cam ?? the.nguoi_cam_ten} />
          {sau}
        </span>
      </div>
    );
  }

  return (
    <>
      <div data-hang="nut" className="flex flex-wrap items-center gap-2">
        {truoc}
        <IconTrangThai trang_thai={the.trang_thai} co={14} />
        {ma}
        {trang_thai}
        {co}
        <span className="flex-1" />
        {/*
         * **Ưu tiên "Không" KHÔNG in gì trên thẻ** — d.404: 'Ưu tiên "Không"
         * **không** in chữ trên thẻ.'
         *
         * Hai cách làm được: một icon mờ kiểu "---", hoặc **không vẽ gì**. Đã
         * chọn **không vẽ gì**, và lý do là lý do của chủ: `none` là mức mặc định
         * của phần lớn ticket (`dungTicket` của chính dự án này đặt `none`), nên
         * một icon trên **mọi** thẻ không phân biệt được gì — nó chỉ chiếm đúng
         * chỗ mà mã ticket và tên agent cần ở 375px. Mức ưu tiên vẫn **đọc được
         * và sửa được** ở hai chỗ chủ cần nó: ô lọc "Ưu tiên" (nhãn "Không" của
         * bảng 0.1 còn nguyên) và panel chi tiết.
         */}
        {the.uu_tien === 'none' ? null : (
          <span
            data-o="uu-tien"
            data-uu-tien={the.uu_tien}
            aria-label={the.nhan_uu_tien}
            title={the.nhan_uu_tien}
            className={`flex shrink-0 items-center ${LOP_UU_TIEN[the.uu_tien]}`}
          >
            <IconUuTien uu_tien={the.uu_tien} />
          </span>
        )}
        {/*
         * **Tên, không id** (d.404). Nguồn tên, theo thứ tự: tên mà chỗ gọi đưa
         * xuống (Tổng quan có `TheViecDangChay.nguoi_cam_ten`), rồi **tên của
         * chính thẻ** mà đường đọc danh sách nay trả (`TheDanhSachRa.nguoi_cam_ten`
         * — nợ của đợt 2, trả ở đợt 3 phần B). Không còn đường nào rơi về
         * `agentId`.
         */}
        <ONguoi nguoi={the.nguoi_dang_cam} ten={ten_nguoi_cam ?? the.nguoi_cam_ten} />
        {sau}
      </div>

      {tieu_de}

      <div data-hang="nut" className="flex flex-wrap items-center gap-2 text-xs text-chu-mo">
        {phu}
        <span className="ml-auto">{thoi_gian}</span>
      </div>
    </>
  );
}

/**
 * **Cú bấm vào thẻ mở panel**, nhưng bấm vào link/nút/ô nhập **trong** thẻ thì
 * không: thẻ có link mã ticket (mở cả trang), và tay kéo (ô "Chuyển cột" đã bỏ, d.404). Không
 * có cửa này thì bấm link mã vừa điều hướng vừa mở panel.
 */
function khiBamThe(e: React.MouseEvent, ma: string, moThe: (ma: string) => void): void {
  const o = e.target as HTMLElement | null;
  if (o?.closest('a, button, select, input, label, time') !== null) return;
  moThe(ma);
}

/**
 * **Ô chọn của một thẻ** (BAT-35, d.416 `X`): checkbox có nhãn "Chọn <MÃ>" — dấu
 * nhìn thấy **và** đọc được bằng trình đọc màn hình; bấm chuột cũng chọn được.
 */
function OChonThe({
  the,
  da_chon,
  batChon,
  moThe,
  hep,
}: {
  the: TicketDong;
  da_chon: boolean;
  batChon: (id: string) => void;
  moThe: (ma: string) => void;
  /** Khổ hẹp (≤ 375px): panel phủ kín + nền `inert` ⇒ tick không mở panel. */
  hep: boolean;
}): React.JSX.Element {
  return (
    <input
      type="checkbox"
      data-chon-the={the.ma}
      aria-label={nhanChonThe(the.ma)}
      checked={da_chon}
      /*
       * BAT-36: bấm ô tick ⇒ thẻ đó thành thẻ đang focus (cùng trạng thái `?the=`
       * mà `J`/`K` đặt), để `X` kế tiếp bật/tắt đúng thẻ vừa bấm. Ở trang này
       * "thẻ đang focus" và "panel mở" là MỘT trạng thái (`ma_the`), nên bấm ô tick
       * cũng mở panel của thẻ — đúng như `J`/`K` (cau-hoi-spec #160). `click` không
       * nổi lên làm `khiBamThe` mở lần hai (nó bỏ qua `input`). **Khổ hẹp thì
       * KHÔNG**: panel ở đó là dialog `aria-modal` phủ kín, nền `inert` — mở nó khi
       * tick làm không tick được thẻ thứ hai và thanh chọn nhiều bị `inert`; màn
       * hình cảm ứng không có phím `X` nên không mất gì.
       */
      onClick={() => {
        if (!hep) moThe(the.ma);
      }}
      onChange={() => {
        batChon(the.id);
      }}
      className="size-3.5 shrink-0"
    />
  );
}

/** Lớp của thẻ đã chọn bằng `X` — viền màu, khác hẳn dấu "đang focus". */
const LOP_DA_CHON = 'ring-1 ring-inset ring-nhan-manh';

/** Một dòng ticket trong danh sách. */
function HangTicket({
  the,
  bay_gio,
  chon,
  moThe,
  da_chon,
  batChon,
  hep,
}: {
  the: TicketDong;
  bay_gio: number;
  chon: boolean;
  moThe: (ma: string) => void;
  da_chon: boolean;
  batChon: (id: string) => void;
  hep: boolean;
}): React.JSX.Element {
  return (
    <article
      data-ticket={the.ma}
      data-trang-thai={the.trang_thai}
      data-chon={chon ? 'co' : 'khong'}
      data-da-chon={da_chon ? 'co' : 'khong'}
      onClick={(e) => khiBamThe(e, the.ma, moThe)}
      /*
       * Một dòng ~36–40px (hệ thiết kế 29/10): hover nền nhẹ, đang chọn nền lớp
       * nổi, không viền giữa các dòng, không tô nền theo trạng thái.
       */
      className={`flex min-h-9 items-center px-3 py-1.5 text-sm ${
        chon ? 'bg-nen-noi' : 'hover:bg-nen-lop'
      } ${da_chon ? LOP_DA_CHON : ''}`}
    >
      <NoiDungThe
        the={the}
        bay_gio={bay_gio}
        hien_trang_thai
        kieu="dong"
        truoc={<OChonThe the={the} da_chon={da_chon} batChon={batChon} moThe={moThe} hep={hep} />}
        sau={
          /*
           * Đường **bàn phím** của cùng cú bấm: một `onClick` trên `<article>`
           * không tới được bằng Tab. Nút này mang nhãn chữ, nên nó cũng là chỗ
           * trình đọc màn hình thấy "mở thẻ nào".
           */
          <button
            type="button"
            data-mo-the={the.ma}
            aria-label={`Mở ${the.ma}`}
            onClick={() => moThe(the.ma)}
            className="rounded px-1 text-xs text-chu-mo-hon hover:text-chu"
          >
            Mở
          </button>
        }
      />
    </article>
  );
}

/**
 * **Người đang cầm** — 19.1, **máy chủ tính**; trống thì nói trống.
 *
 * Ô tròn viết tắt (brief: "avatar/viết tắt của agent"), và `title` mang **tên
 * đầy đủ**: hai chữ `WB` một mình không nói được agent nào.
 */
function ONguoi({
  nguoi,
  ten: ten_thay,
}: {
  nguoi: TicketDong['nguoi_dang_cam'];
  /** Tên agent do chỗ gọi đưa xuống — xem `NoiDungThe.ten_nguoi_cam` (d.404). */
  ten?: string | null | undefined;
}): React.JSX.Element {
  const ten =
    ten_thay != null && ten_thay !== ''
      ? ten_thay
      : nguoi === null
        ? '—'
        : nguoi.loai === 'agent'
          ? (nguoi.agentId ?? '—')
          : NHAN_CHU;
  return (
    <span
      data-o="nguoi-cam"
      title={ten}
      aria-label={`Người đang cầm: ${ten}`}
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-nen-noi text-[10px] font-semibold text-chu-mo"
    >
      {/*
       * Viết tắt lấy từ **cái tên đang hiện**: với một tên agent thật ("W-builder")
       * hai chữ đầu phải là của tên đó, không của id. `vietTat` nhận một `TacGiaRa`,
       * nên chỗ có tên thay thì dựng một `TacGiaRa` mang tên ấy.
       */}
      {vietTat(ten_thay == null || ten_thay === '' ? nguoi : { loai: 'agent', agentId: ten_thay }, NHAN_CHU)}
    </span>
  );
}

/**
 * **Hạn — d.412**: chữ **tương đối** trên màn hình, **giờ đầy đủ** khi rê chuột.
 *
 * Mốc là `bay_gio` của thân, tức **đồng hồ máy chủ** — cùng kỷ luật đã chốt ở
 * trang Cần Chủ (`The`): `Date.now()` ở đây là một đồng hồ thứ hai, và một máy
 * lệch giờ sẽ hiện "trong 2 giờ" cho một ticket máy chủ coi là quá hạn.
 */
export function OHan({
  han_luc,
  bay_gio,
}: {
  han_luc: number | null;
  bay_gio: number;
}): React.JSX.Element | null {
  if (han_luc === null) return null;
  return (
    <time
      dateTime={new Date(han_luc).toISOString()}
      title={gioDayDu(han_luc)}
      data-o="han"
      className="text-xs text-chu-mo-hon"
    >
      Hạn {thoiGianTuongDoi(han_luc, bay_gio)}
    </time>
  );
}

/* ================================================================== *
 * 7. Kiểu xem 2 — bảng, cột là trạng thái, kéo thả (d.396)
 * ================================================================== */

/** Id vùng thả của một cột — **chính mã trạng thái**, xem `dichKeo`. */
const idCot = (t: TrangThaiTicket): string => t;

/**
 * **Một cử chỉ kéo vừa kết thúc** — d.396, cái nối `DragEndEvent` của dnd-kit với
 * `dichKeo`.
 *
 * Hàm **thuần và xuất ra** thay vì một closure trong `BangKeo`: jsdom không có
 * layout nên dnd-kit không sinh được `dragend` thật, và một closure thì không ca
 * nào gọi tới được — ba quyết định của chính cử chỉ kéo (tra thẻ theo
 * `active.id`, thả ra ngoài mọi cột, thả lại đúng cột cũ) sẽ sống nhờ nghiệm thu
 * tay. Gọi trực tiếp hàm này là cách duy nhất để chúng có lưới.
 *
 * Kiểu tham số hẹp hơn `DragEndEvent` (chỉ `active.id` và `over.id`) vì đó đúng
 * là phần hàm này đọc; `DragEndEvent` thật khớp kiểu này, nên không ai phải dựng
 * một `DragEndEvent` giả trong ca test để gọi nó.
 */
export function xongKeo(
  items: readonly TicketDong[],
  e: { active: { id: string | number }; over: { id: string | number } | null },
  keo: (b: BienKeo) => void,
): void {
  const the = items.find((t) => t.id === String(e.active.id));
  if (the === undefined) return;
  const viec = dichKeo(the, e.over === null ? null : String(e.over.id));
  if (viec !== null) keo(viec);
}

function BangKeo({
  trang,
  keo,
  chon,
  moThe,
  da_chon,
  batChon,
  hep,
  taoViec,
}: {
  trang: ManHinhDanhSach;
  keo: (b: BienKeo) => void;
  chon: string | null;
  moThe: (ma: string) => void;
  da_chon: ReadonlySet<string>;
  batChon: (id: string) => void;
  hep: boolean;
  /**
   * Mở hộp Tạo việc của vỏ (nút `+` cột Backlog / Cần làm — `COT_CO_NUT_TAO`);
   * `null` ⇒ không vẽ nút.
   */
  taoViec: MoTaoViec | null;
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  /*
   * **Sáu cột** (Backlog đầu — T-111 A, BAT-64), không bảy trạng thái —
   * `gomTheoCotChu`. `duplicate` hiện trong cột Huỷ. Đường tới **bảy** trạng thái
   * nay là **panel chi tiết** và phím `S` (d.404), không còn ô "Chuyển cột" trên
   * thẻ. Xem `spec-questions.md` #131, #137.
   */
  const nhom = useMemo(() => gomTheoCotChu(trang.items), [trang.items]);

  const khiXongKeo = (e: DragEndEvent): void => {
    xongKeo(trang.items, e, keo);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={khiXongKeo}>
      {/*
       * `overflow-x-auto`: sáu cột **không** co lại cho vừa 375px (d.411 nói bảng
       * kéo thả không bắt buộc trên điện thoại), nên chúng cuộn ngang thay vì ép
       * cả trang tràn.
       */}
      <div data-o="bang" className="flex gap-3 overflow-x-auto pb-2">
        {nhom.map((n) => (
          <CotBang
            key={n.cot}
            nhom={n}
            bay_gio={trang.bay_gio}
            chon={chon}
            moThe={moThe}
            da_chon={da_chon}
            batChon={batChon}
            hep={hep}
            taoViec={nutTaoChoCot(n.cot, taoViec)}
          />
        ))}
      </div>
    </DndContext>
  );
}

/**
 * **Cột rỗng THU HẸP, nhưng vẫn hiện tiêu đề và số 0** — d.405.
 *
 * Bề ngang bằng `rem` và chỉ có hai giá trị (`w-64` / `w-28`), không một phép
 * tính theo nội dung: cột rỗng vẫn phải là một **vùng thả** đủ to để kéo thẻ vào
 * (đó là lý do nó không bị ẩn như nhóm rỗng ở Danh sách), nhưng không chiếm chỗ
 * bằng một cột có việc.
 */
function CotBang({
  nhom,
  bay_gio,
  chon,
  moThe,
  da_chon,
  batChon,
  hep,
  taoViec,
}: {
  nhom: NhomCot;
  bay_gio: number;
  chon: string | null;
  moThe: (ma: string) => void;
  da_chon: ReadonlySet<string>;
  batChon: (id: string) => void;
  hep: boolean;
  /**
   * Có ⇒ đầu cột có nút `+` mở hộp Tạo việc của vỏ. Chỉ cột Backlog và Cần làm
   * (`COT_CO_NUT_TAO`; tuỳ chọn mở đã gắn sẵn bởi `nutTaoChoCot`).
   */
  taoViec: (() => void) | null;
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: idCot(nhom.cot) });
  const rong = nhom.items.length === 0;
  return (
    <section
      ref={setNodeRef}
      aria-label={nhom.nhan}
      data-cot={nhom.cot}
      /*
       * Mọi cột của bảng **đều** là một trong sáu cột của bảng (xem
       * `NHOM_COT_CHU`); thuộc tính giữ lại vì các ca test và phép rà tay đọc
       * nó, và vì nó là lưới cho đúng câu đó.
       */
      data-nhom-chu={laNhomChu(nhom.cot) ? 'co' : 'khong'}
      data-dang-tren={isOver ? 'co' : 'khong'}
      data-rong={rong ? 'co' : 'khong'}
      /*
       * Cột không viền, không nền màu (hệ thiết kế 29/10): chỉ khi đang có thẻ
       * kéo ngang qua thì nền lớp nổi + viền mờ — dấu "thả vào đây".
       */
      className={`flex shrink-0 flex-col gap-2 rounded-lg border p-1.5 ${rong ? 'w-28' : 'w-64'} ${
        isOver ? 'border-vien bg-nen-lop' : 'border-transparent'
      }`}
    >
      {/*
       * **Số đếm ở đầu mỗi cột** — brief BAT-6 đợt 2. Với cột Huỷ, nó là tổng
       * **cả hai** trạng thái gộp (`canceled` + `duplicate`), vì nó đếm đúng
       * thứ cột đang vẽ.
       *
       * Đầu cột: icon trạng thái + tên + số đếm xám, rồi nút `+` **chỉ ở cột
       * Backlog và Cần làm** (`COT_CO_NUT_TAO`). Cả hai mở **chính** hộp Tạo việc
       * của vỏ (`MoTaoViecContext`): cột Cần làm (BAT-62) không kèm tuỳ chọn ⇒ ô
       * Trạng thái của hộp ở **Cần làm**, mặc định khi tạo (mục 4); cột Backlog
       * (BAT-64, T-111 A) mở với **Backlog chọn sẵn** — cùng đường
       * `taoViec({ trang_thai: 'backlog' })` với `+` nhóm Backlog kiểu Danh sách
       * (BAT-63, vẫn giữ). `spec-questions.md` #179, #180.
       *
       * Bốn cột còn lại **không** có `+`: mục 4 "Trạng thái khi tạo" cấm đặt
       * chúng lúc tạo (`INVALID_INPUT`), vì mỗi cột có luật riêng mà một ticket
       * vừa tạo không thoả: Đang làm = có lượt giao đang mở hoặc chủ đang tự làm
       * (d.128, cờ 24 giờ d.140); Chờ kiểm chứng = người làm báo xong (d.129);
       * Xong phải qua cổng bằng chứng (d.136, mục 7); Huỷ bắt buộc lý do, Trùng
       * bắt buộc ticket gốc (d.138).
       *
       * **Không** có nút `…`: chưa có hành vi nào cho nó.
       *
       * Nút nằm **ngoài** `h2` (tên truy cập của tiêu đề cột không lẫn nhãn nút).
       * Cột không phải phần tử kéo được (chỉ `TheBang` là), nên bấm `+` không khởi
       * động cử chỉ kéo; `stopPropagation` để không một trình nghe bấm nào ở trên
       * (mở thẻ, chọn) nhận cú bấm này.
       */}
      <div data-dau-cot={nhom.cot} className="flex items-center gap-1">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-sm font-medium text-chu">
          <IconTrangThai trang_thai={nhom.cot} co={14} />
          <span className="truncate">{nhom.nhan}</span>{' '}
          <span data-so="cot" className="text-chu-mo-hon tabular-nums">
            {nhom.items.length}
          </span>
        </h2>
        {taoViec === null ? null : (
          <button
            type="button"
            data-nut="tao-trong-cot"
            aria-label={nhanNutTaoTrongCot(nhom.nhan)}
            title={nhanNutTaoTrongCot(nhom.nhan)}
            onClick={(e) => {
              e.stopPropagation();
              taoViec();
            }}
            className={LOP_NUT_ICON}
          >
            <IconThem />
          </button>
        )}
      </div>
      {nhom.items.map((t) => (
        <TheBang
          key={t.id}
          the={t}
          cot={nhom.cot}
          bay_gio={bay_gio}
          chon={chon === t.ma}
          moThe={moThe}
          da_chon={da_chon.has(t.id)}
          batChon={batChon}
          hep={hep}
        />
      ))}
    </section>
  );
}

/**
 * **Thẻ trên bảng — KHÔNG có ô "Chuyển cột"** (d.404).
 *
 * Đợt 2 có một `<select data-chuyen-cot>` trên **mỗi** thẻ, làm đường bàn phím
 * cho cử chỉ kéo. d.404 nay chốt ba đường đổi trạng thái: **kéo thả**, **panel
 * chi tiết**, hoặc **phím `S`** — và ô chọn trên từng thẻ không phải một trong ba.
 * Nó cũng là thứ chủ gọi là thừa: một ô chọn bảy giá trị trên mỗi thẻ của một
 * bảng 200 thẻ.
 *
 * Cả **ba** đường còn lại đều sống và đều có ca test (xem
 * `test/danh-sach-ticket.test.tsx`): `xongKeo` cho cử chỉ kéo, `data-trang-thai-panel`
 * cho panel, và phím `S` đưa con trỏ vào đúng ô ấy.
 */
function TheBang({
  the,
  cot,
  bay_gio,
  chon,
  moThe,
  da_chon,
  batChon,
  hep,
}: {
  the: TicketDong;
  /** Cột thẻ đang nằm trong — để biết có phải nhắc lại nhãn trạng thái không. */
  cot: TrangThaiTicket;
  bay_gio: number;
  chon: boolean;
  moThe: (ma: string) => void;
  da_chon: boolean;
  batChon: (id: string) => void;
  hep: boolean;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: the.id });

  return (
    <article
      ref={setNodeRef}
      data-the-ticket={the.ma}
      data-trang-thai={the.trang_thai}
      data-chon={chon ? 'co' : 'khong'}
      data-da-chon={da_chon ? 'co' : 'khong'}
      onClick={(e) => khiBamThe(e, the.ma, moThe)}
      style={
        transform === null
          ? undefined
          : { transform: `translate3d(${String(transform.x)}px, ${String(transform.y)}px, 0)` }
      }
      /*
       * Thẻ (hệ thiết kế 29/10): nền lớp nổi, bo 8px, viền mờ; đang chọn ⇒ nền
       * hover. Điều khiển (ô chọn, tay kéo, "Mở") nằm chung hàng mã ticket.
       */
      className={`flex flex-col gap-1.5 rounded-lg border p-2.5 text-sm ${
        chon ? 'border-chu-mo bg-nen-noi' : 'border-vien bg-nen-lop hover:bg-nen-noi'
      } ${da_chon ? LOP_DA_CHON : ''}`}
    >
      {/*
       * Cột đã nói trạng thái, nên thẻ trên bảng **không** nhắc lại nhãn ấy —
       * **trừ** khi thẻ không cùng trạng thái với cột: cột Huỷ gộp cả
       * `duplicate` (xem `NHOM_COT_CHU`), và một thẻ Trùng phải nhìn ra được là
       * Trùng. Nhãn đi nguyên văn từ máy chủ (d.381).
       */}
      <NoiDungThe
        the={the}
        bay_gio={bay_gio}
        hien_trang_thai={the.trang_thai !== cot}
        truoc={
          <>
            <OChonThe the={the} da_chon={da_chon} batChon={batChon} moThe={moThe} hep={hep} />
            {/*
             * Tay kéo là một **nút riêng**, không cả thẻ: cả thẻ là tay kéo thì cú
             * bấm vào link mã ticket bị cử chỉ kéo ăn mất, và chủ không mở được
             * ticket.
             */}
            <button
              type="button"
              data-tay-keo={the.ma}
              aria-label={`Kéo ${the.ma}`}
              {...attributes}
              {...listeners}
              className="cursor-grab text-xs text-chu-mo-hon hover:text-chu"
            >
              ⠿
            </button>
          </>
        }
        sau={
          <button
            type="button"
            data-mo-the={the.ma}
            aria-label={`Mở ${the.ma}`}
            onClick={() => moThe(the.ma)}
            className="rounded px-1 text-xs text-chu-mo-hon hover:text-chu"
          >
            Mở
          </button>
        }
      />
    </article>
  );
}

/* ================================================================== *
 * 8. Panel chi tiết bên phải — brief BAT-6 đợt 2, nội dung d.398–401
 * ================================================================== */

/**
 * **Panel chi tiết bên phải** — và nó đổi **ngữ nghĩa** theo khổ màn hình.
 *
 * | Khổ | Hình | Vai ARIA | Vì sao |
 * |---|---|---|---|
 * | từ `sm` | tấm bên phải ≤ 26rem | `complementary` | brief: **bảng vẫn thấy phía sau** |
 * | dưới `sm` (375px) | **phủ kín** viewport | `dialog` + `aria-modal` | d.411 |
 *
 * Ở 375px tấm này phủ kín màn hình, nên nó **là** một dialog trên thực tế. Một
 * thứ phủ kín mà không khai là dialog thì: trang dưới vẫn cuộn, `Tab` chạy xuyên
 * ra bảng **sau** tấm phủ, và trình đọc màn hình đọc cả nền. Đó đúng là lỗi đã
 * sửa cho menu trượt ở đợt 1, nên ở đây **dùng lại nếp ấy** (`App.tsx`), không
 * dựng bản thứ hai:
 *
 *   * `role="dialog"` + `aria-modal="true"`;
 *   * **khoá cuộn `body`**, trả lại **đúng giá trị cũ** khi đóng;
 *   * nền `inert` (do trang đặt, xem `TrangDanhSachTicket`) — `inert` chặn cả
 *     `Tab` và cả trình đọc màn hình, tức đúng hai vế thiếu, và nó là một thuộc
 *     tính của nền chứ không phải một bẫy focus tự viết;
 *   * **tự lấy focus** khi mở, và khi đóng thì **trả focus về nút "Mở" của thẻ
 *     đang chọn** — nếu không, con trỏ bàn phím rơi về đầu tài liệu.
 *
 * `Escape` **không** đặt ở đây: nó đã nằm ở `usePhimTheDangChon` (một listener,
 * một chỗ). Và `ThanChiTietTicket` của `trang/chi-tiet-ticket.tsx` là **cùng một
 * thân** với trang `/t/<MÃ>`, không một bản thứ hai.
 *
 * Bề ngang bằng `rem`, không `px`: `w-full` ở 375px (toàn màn hình, không một
 * panel 400px chen trong 375px), `sm:max-w-[26rem]` từ `sm`.
 */
function PanelChiTiet({
  ma,
  the,
  keo,
  dong,
  hep,
  xin_focus_trang_thai = false,
  daFocusTrangThai,
  doiUuTien,
  xin_focus_uu_tien = false,
  daFocusUuTien,
  datNhan,
  xin_focus_nhan = false,
  daFocusNhan,
}: {
  /** Gắn/bỏ nhãn (lạc quan) — phím `L` mở panel rồi focus ô "Thêm nhãn". */
  datNhan: (b: ViecNhan) => void;
  xin_focus_nhan?: boolean;
  daFocusNhan?: (() => void) | undefined;
  /** Đổi ưu tiên (lạc quan) — phím `P` mở panel rồi chọn ở ô này. */
  doiUuTien: (b: BienUuTien) => void;
  xin_focus_uu_tien?: boolean;
  daFocusUuTien?: (() => void) | undefined;
  ma: string;
  /** Thẻ của mã này trong trang đang tải — `undefined` khi nó không còn trong trang. */
  the?: TicketDong | undefined;
  keo: (b: BienKeo) => void;
  dong: () => void;
  hep: boolean;
  /** Phím `S` vừa mở panel ⇒ đưa con trỏ vào ô trạng thái (d.415). */
  xin_focus_trang_thai?: boolean;
  daFocusTrangThai?: (() => void) | undefined;
}): React.JSX.Element {
  const o = useRef<HTMLElement | null>(null);
  const o_trang_thai = useRef<HTMLSelectElement | null>(null);
  // "Đang gửi" tính **theo từng thẻ** (BAT-24): thao tác của thẻ khác không làm panel này bận.
  const id_the = the?.id ?? '';
  const dang_gui_tt =
    useIsMutating(locMutationTheoThe(KHOA_MUTATION_TRANG_THAI, id_the)) > 0 && the !== undefined;
  const dang_gui_ut =
    useIsMutating(locMutationTheoThe(KHOA_MUTATION_UU_TIEN, id_the)) > 0 && the !== undefined;

  useEffect(() => {
    if (!xin_focus_trang_thai) return;
    const el = o_trang_thai.current;
    if (el === null) return;
    el.focus();
    daFocusTrangThai?.();
  }, [xin_focus_trang_thai, daFocusTrangThai, the]);

  const o_uu_tien = useRef<HTMLSelectElement | null>(null);
  useEffect(() => {
    if (!xin_focus_uu_tien) return;
    const el = o_uu_tien.current;
    if (el === null) return;
    el.focus();
    daFocusUuTien?.();
  }, [xin_focus_uu_tien, daFocusUuTien, the]);

  const o_nhan = useRef<HTMLInputElement | null>(null);
  // Chữ đang gõ dở gắn với **mã** của thẻ: `J`/`K` sang thẻ khác thì ô trống lại,
  // không mang chữ gõ dở của thẻ trước sang.
  const [nhap_nhan, datNhapNhan] = useState({ ma, v: '' });
  const nhan_moi = nhap_nhan.ma === ma ? nhap_nhan.v : '';
  useEffect(() => {
    if (!xin_focus_nhan) return;
    const el = o_nhan.current;
    if (el === null) return;
    el.focus();
    daFocusNhan?.();
  }, [xin_focus_nhan, daFocusNhan, the]);

  useEffect(() => {
    if (!hep) return undefined;
    o.current?.focus();
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
      /*
       * Trả focus về **nút "Mở" của chính thẻ ấy**, không về đầu tài liệu. Thẻ
       * có thể đã rời màn hình (bộ ảo hoá, hoặc một bộ lọc vừa đổi) ⇒ `?.` và
       * thôi: một `focus()` ném ở đây sẽ làm đổ cả trang vì một chuyện phụ.
       */
      document.querySelector<HTMLElement>(`[data-mo-the="${ma}"]`)?.focus();
    };
  }, [hep, ma]);

  return (
    <aside
      ref={o}
      role={hep ? 'dialog' : undefined}
      aria-modal={hep ? 'true' : undefined}
      aria-label={NHAN_PANEL}
      tabIndex={hep ? -1 : undefined}
      data-o="panel-the"
      data-ma={ma}
      data-dang={hep ? 'dialog' : 'phu'}
      /*
       * Không tắt outline (THIET-KE "Bàn phím trước", BAT-67): ở khổ hẹp ngăn là
       * hộp và nhận focus khi mở. Ngăn sát mép phải/trên/dưới (và rộng hết màn ở
       * 375px), nên vòng chung offset dương nằm **ngoài** khung nhìn —
       * `focus-visible:-outline-offset-2` vẽ vòng vào **trong** khung.
       */
      className="fixed inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-vien bg-nen shadow-lg focus-visible:-outline-offset-2 sm:max-w-[26rem]"
    >
      <div
        data-hang="nut"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-vien px-4 py-2"
      >
        <Link
          to={duongTicket(ma)}
          data-nut="mo-toan-trang"
          className="text-xs text-neutral-600 underline"
        >
          {NHAN_MO_TOAN_TRANG}
        </Link>
        <button
          type="button"
          data-nut="dong-panel"
          aria-label={NHAN_DONG_PANEL}
          onClick={dong}
          className="text-neutral-600"
        >
          <IconDong />
        </button>
      </div>

      {/*
       * **Đổi trạng thái từ panel** — một trong ba đường của d.404, và là đường
       * **bàn phím** sau khi ô "Chuyển cột" trên thẻ bị bỏ. Cùng `keo` (cùng
       * mutation, cùng cập nhật lạc quan, cùng toast nguyên văn máy chủ), và cùng
       * `dichKeo` để một lần chọn lại đúng trạng thái đang có **không** gọi máy
       * chủ.
       *
       * Chỉ dựng khi thẻ còn trong trang đang tải: panel mở được cho một mã không
       * thuộc trang (link dán vào), và lúc ấy không có `trang_thai` nào để đổi —
       * trang `/t/<MÃ>` là chỗ cho ca đó.
       */}
      {the === undefined ? null : (
        <label className="flex flex-col gap-1 border-b border-vien px-4 py-2 text-xs">
          {NHAN_TRANG_THAI_PANEL}
          <select
            ref={o_trang_thai}
            data-trang-thai-panel={the.ma}
            data-dang-gui={dang_gui_tt ? 'co' : 'khong'}
            aria-busy={dang_gui_tt}
            value={the.trang_thai}
            onChange={(e) => {
              const viec = dichKeo(the, e.target.value);
              if (viec !== null) keo(viec);
            }}
            className={LOP_O_NHAP}
          >
            {COT_BANG.map((t) => (
              <option key={t} value={t}>
                {NHAN_TRANG_THAI[t]}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
       * **Đổi ưu tiên từ panel** — đích của phím `P` (d.415), cùng khuôn ô trạng
       * thái ở trên: chọn lại đúng giá trị đang có không gọi máy chủ (`dichUuTien`).
       */}
      {the === undefined ? null : (
        <label className="flex flex-col gap-1 border-b border-vien px-4 py-2 text-xs">
          {NHAN_UU_TIEN_PANEL}
          <select
            ref={o_uu_tien}
            data-uu-tien-panel={the.ma}
            data-dang-gui={dang_gui_ut ? 'co' : 'khong'}
            aria-busy={dang_gui_ut}
            value={the.uu_tien}
            onChange={(e) => {
              const viec = dichUuTien(the, e.target.value);
              if (viec !== null) doiUuTien(viec);
            }}
            className={LOP_O_NHAP}
          >
            {UU_TIEN_THEO_THU_TU.map((u) => (
              <option key={u} value={u}>
                {NHAN_UU_TIEN[u]}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
       * **Nhãn từ panel** — đích của phím `L` (d.415). Nhãn hiện có, mỗi nhãn một
       * nút bỏ; một ô gõ nhãn mới, Enter là gắn. `dichNhan` lọc các lần bấm không
       * đáng gọi máy chủ (ô trống, gắn nhãn đã có); luật hợp lệ còn lại là của máy
       * chủ, câu từ chối ra toast nguyên văn.
       */}
      {the === undefined ? null : (
        <section
          aria-label={NHAN_NHAN_PANEL}
          data-o="nhan-panel"
          className="flex flex-col gap-1 border-b border-vien px-4 py-2 text-xs"
        >
          <span>{NHAN_NHAN_PANEL}</span>
          {the.nhan.length === 0 ? null : (
            <ul data-hang="nut" className="flex flex-wrap items-center gap-1">
              {the.nhan.map((n) => (
                <li
                  key={n}
                  data-nhan-panel={n}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${mauNhan(n)}`}
                >
                  {n}
                  <button
                    type="button"
                    data-bo-nhan={n}
                    aria-label={nhanBoNhan(n)}
                    onClick={() => {
                      const viec = dichNhan(the, n, false);
                      if (viec !== null) datNhan(viec);
                    }}
                    className="text-neutral-600"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={o_nhan}
            data-o="them-nhan"
            aria-label={NHAN_THEM_NHAN}
            placeholder={NHAN_THEM_NHAN}
            value={nhan_moi}
            onChange={(e) => {
              datNhapNhan({ ma, v: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // Enter của bộ gõ (chốt chữ có dấu) không phải Enter "gắn nhãn".
              if (dangSoanIme(e.nativeEvent)) return;
              e.preventDefault();
              const viec = dichNhan(the, nhan_moi, true);
              if (viec !== null) datNhan(viec);
              datNhapNhan({ ma, v: '' });
            }}
            className={LOP_O_NHAP}
          />
        </section>
      )}

      <ThanChiTietTicket ma={ma} hep />
    </aside>
  );
}
