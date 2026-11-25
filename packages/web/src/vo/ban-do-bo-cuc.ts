/**
 * **Bản đồ dự án trên Tổng quan — luật trình bày thuần** (SPEC 20.2–20.5; Chủ chốt
 * T-127 = A, 04/11/2026).
 *
 * Không một dòng JSX: mọi phép chọn (dự án nào lên cây, mảng nào gập mặc định, màu
 * bong bóng, làn của thẻ, vị trí trên cây, điểm trên đồi, thứ tự Cần Chủ) nằm ở
 * đây để **test được không cần DOM**. Component `ban-do-tong-quan.tsx` chỉ vẽ.
 *
 * Máy chủ đã tính mọi thứ có luật nghiệp vụ (Xong/Tổng khối, Mốc tới, cờ Cần Chủ
 * Chờ, đồng hồ WIP — `packages/api/src/doc-tong-quan.ts`); file này chỉ giữ phần
 * **trình bày** mà SPEC 20.3–20.5 đặt ra.
 *
 * **Không thư viện vẽ nào** (brief: không thêm dependency): bố cục cây tròn là
 * một phép chia góc đơn giản, đủ cho mốc 200 dự án vì mảng mặc định gập (20.6).
 */

import type { HangDuAn, KhoiLon, MucCanChuO } from '../api';

/* ------------------------------------------------------------------ *
 * Mảng = Nhóm dự án (20.1, mục 2)
 * ------------------------------------------------------------------ */

/** Dự án không có nhóm nằm ở mảng này — 20.1. */
export const TEN_MANG_KHAC = 'Khác';

/**
 * **Bảng màu cố định của mảng** (20.3 "màu mảng lấy từ bảng màu cố định theo tên
 * nhóm, không thêm trường"). Dùng lại **chữ** của sáu cặp màu nhãn (`kieu.css`,
 * `--t-nhanN-chu`): mỗi màu đã có hai giá trị chọn tay cho Sáng/Tối và đã được đo
 * tương phản trên nền nhãn. Viết sẵn thành chuỗi (Tailwind quét văn bản — xem
 * `vo/mau-the.ts`). Màu đi bằng `currentColor` cho nhánh và nhãn mảng.
 */
export const LOP_MANG: readonly string[] = [
  'text-nhan1-chu',
  'text-nhan2-chu',
  'text-nhan3-chu',
  'text-nhan4-chu',
  'text-nhan5-chu',
  'text-nhan6-chu',
];

/** Băm ổn định tên mảng → một màu (cùng phép băm của `mauNhan`). */
export function mauMang(ten: string): string {
  let h = 0;
  for (const c of ten) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return LOP_MANG[h % LOP_MANG.length] ?? LOP_MANG[0]!;
}

export function tenMang(d: Pick<HangDuAn, 'nhom'>): string {
  const n = d.nhom?.trim() ?? '';
  return n === '' ? TEN_MANG_KHAC : n;
}

/** Tên hiện trên bản đồ/thẻ: tên ngắn nếu có, không thì tên đầy đủ (20.1). */
export function tenHien(d: Pick<HangDuAn, 'ten' | 'ten_ngan'>): string {
  const n = d.ten_ngan?.trim() ?? '';
  return n === '' ? d.ten : n;
}

/** Cắt chữ cho nhãn SVG — tên đầy đủ luôn có ở tooltip. */
export function catChu(s: string, toi_da: number): string {
  const ky_tu = [...s];
  return ky_tu.length <= toi_da ? s : `${ky_tu.slice(0, toi_da - 1).join('')}…`;
}

/** 20.3: "Chỉ dự án **không** lưu trữ và **không** duy trì lên cây." */
export function lenCay(d: Pick<HangDuAn, 'trang_thai' | 'duy_tri'>): boolean {
  return d.trang_thai !== 'archived' && !d.duy_tri;
}

/** Dải "Khu vực duy trì" (20.2): dự án `duy_tri`, không lưu trữ. */
export function duAnDuyTri(ds: readonly HangDuAn[]): HangDuAn[] {
  return ds.filter((d) => d.duy_tri && d.trang_thai !== 'archived');
}

/** Ưu tiên cao trước, rồi tên — một thứ tự ổn định cho cây và cho thẻ. */
function soDuAn(a: HangDuAn, b: HangDuAn): number {
  if (a.uu_tien !== b.uu_tien) return b.uu_tien - a.uu_tien;
  return tenHien(a).localeCompare(tenHien(b), 'vi');
}

export interface Mang {
  ten: string;
  du_an: HangDuAn[];
  co_dang_day: boolean;
  tong_uu_tien: number;
}

/** Gom dự án **lên cây** theo mảng; mảng xếp theo tên, "Khác" cuối. */
export function gomMang(ds: readonly HangDuAn[]): Mang[] {
  const theo = new Map<string, HangDuAn[]>();
  for (const d of ds) {
    if (!lenCay(d)) continue;
    const m = tenMang(d);
    theo.set(m, [...(theo.get(m) ?? []), d]);
  }
  return [...theo.entries()]
    .sort(([a], [b]) => {
      if (a === TEN_MANG_KHAC) return 1;
      if (b === TEN_MANG_KHAC) return -1;
      return a.localeCompare(b, 'vi');
    })
    .map(([ten, du_an]) => ({
      ten,
      du_an: [...du_an].sort(soDuAn),
      co_dang_day: du_an.some((d) => d.dang_day),
      tong_uu_tien: du_an.reduce((s, d) => s + d.uu_tien, 0),
    }));
}

/**
 * Mảng gập **mặc định khi mở trang** (20.3) — và cũng là kết quả của nút "Chỉ giữ
 * dự án đang đẩy": mảng **không** có dự án đang đẩy thì gập.
 */
export function mangGapMacDinh(mang: readonly Mang[]): Set<string> {
  return new Set(mang.filter((m) => !m.co_dang_day).map((m) => m.ten));
}

/* ------------------------------------------------------------------ *
 * Bong bóng — 20.3
 * ------------------------------------------------------------------ */

export type MauBong = 'vang' | 'xam' | 'xanh';

/**
 * 20.3: "vàng = có mục Cần Chủ Chờ; xám = dự án Tạm dừng; còn lại xanh" — xét
 * **theo đúng thứ tự SPEC kể**: một dự án Tạm dừng mà có mục Chờ vẫn vàng (việc
 * chờ chủ là thứ phải thấy trước).
 */
export function mauBong(d: Pick<HangDuAn, 'co_can_chu_cho' | 'trang_thai'>): MauBong {
  if (d.co_can_chu_cho) return 'vang';
  if (d.trang_thai === 'paused') return 'xam';
  return 'xanh';
}

export const LOP_MAU_BONG: Record<MauBong, string> = {
  vang: 'fill-canh',
  /*
   * `neutral-500`, không `tt-huy`: tâm khi phóng vào mang chữ `fill-nen` trên
   * bong bóng, và `tt-huy` chỉ đạt ~3.8:1 với chữ đó (reviewer L2). `neutral-500`
   * đạt ≥ 4.5:1 ở Sáng và Tối, và vẫn là xám (thang trung tính đảo theo chế độ).
   */
  xam: 'fill-neutral-500',
  xanh: 'fill-tot',
};

export const NHAN_MAU_BONG: Record<MauBong, string> = {
  vang: 'Chờ Chủ',
  xam: 'Tạm dừng',
  xanh: 'Đang chạy',
};

/** Bán kính bong bóng theo `uu_tien` 1–5 (20.3 "kích thước theo uu_tien"). */
export function banKinhDuAn(uu_tien: number): number {
  const u = Math.min(5, Math.max(1, uu_tien));
  return 9 + u * 3;
}

/** Mảng gập: "một bong bóng to bằng tổng ưu tiên các dự án con" (20.3). */
export function banKinhMangGap(tong_uu_tien: number): number {
  return Math.min(46, 12 + Math.sqrt(Math.max(0, tong_uu_tien)) * 5);
}

export const BAN_KINH_MANG_MO = 13;
export const BAN_KINH_TAM = 30;

/* ------------------------------------------------------------------ *
 * Bố cục cây tròn — tâm → vòng 1 mảng → vòng 2 dự án
 * ------------------------------------------------------------------ */

/** Khung vẽ (viewBox) — SVG co theo bề ngang (`width:100%`), 375px vẫn vừa. */
export const KHUNG = { x: -300, y: -270, rong: 600, cao: 540 } as const;
export const R_MANG = 110;
export const R_DU_AN = 210;

export interface NutMang {
  ten: string;
  x: number;
  y: number;
  r: number;
  gap: boolean;
  /** Góc (radian, 0 = đỉnh, theo chiều kim đồng hồ). */
  goc: number;
  mang: Mang;
}

export interface NutDuAn {
  du_an: HangDuAn;
  mang: string;
  x: number;
  y: number;
  r: number;
  goc: number;
}

export interface BoCucCay {
  mang: NutMang[];
  du_an: NutDuAn[];
}

function diem(goc: number, r: number): { x: number; y: number } {
  return { x: Math.sin(goc) * r, y: -Math.cos(goc) * r };
}

/**
 * Chia vòng tròn thành **ô góc**: mảng gập chiếm 1 ô, mảng mở chiếm một ô mỗi dự
 * án; giữa hai mảng chừa nửa ô. Dự án nằm giữa ô của nó trên vòng 2, mảng nằm ở
 * giữa các ô của nó trên vòng 1 — nhánh không cắt nhau.
 */
export function boCucCay(mang: readonly Mang[], gap: ReadonlySet<string>): BoCucCay {
  const DEM = mang.length > 1 ? 0.6 : 0;
  const o = mang.map((m) => (gap.has(m.ten) ? 1 : Math.max(1, m.du_an.length)));
  const tong = o.reduce((s, n) => s + n, 0) + DEM * mang.length;
  const don_vi = tong === 0 ? 0 : (2 * Math.PI) / tong;

  const ra: BoCucCay = { mang: [], du_an: [] };
  let con_tro = 0;
  mang.forEach((m, i) => {
    const so_o = o[i] ?? 1;
    const dau = con_tro + DEM / 2;
    const gap_m = gap.has(m.ten);
    const goc_m = (dau + so_o / 2) * don_vi;
    const p = diem(goc_m, R_MANG);
    ra.mang.push({
      ten: m.ten,
      ...p,
      r: gap_m ? banKinhMangGap(m.tong_uu_tien) : BAN_KINH_MANG_MO,
      gap: gap_m,
      goc: goc_m,
      mang: m,
    });
    if (!gap_m) {
      m.du_an.forEach((d, j) => {
        const goc = (dau + j + 0.5) * don_vi;
        ra.du_an.push({ du_an: d, mang: m.ten, ...diem(goc, R_DU_AN), r: banKinhDuAn(d.uu_tien), goc });
      });
    }
    con_tro += so_o + DEM;
  });
  return ra;
}

/** Nhãn đặt bên phải bong bóng ở nửa phải vòng, bên trái ở nửa trái. */
export function benNhan(goc: number): 1 | -1 {
  return Math.sin(goc) >= -1e-9 ? 1 : -1;
}

/** Chu vi một vòng — cho vòng tiến độ vẽ bằng `stroke-dasharray`. */
export function chuVi(r: number): number {
  return 2 * Math.PI * r;
}

/* ------------------------------------------------------------------ *
 * Khối lớn — phóng vào dự án (20.3) và Hill Chart (20.4)
 * ------------------------------------------------------------------ */

export type KieuKhoi = 'xong' | 'dang_lam' | 'chua_toi';

/** "Đang làm/Chờ kiểm chứng" — hai trạng thái của nhóm `active` (bảng 0.1). */
export function laKhoiDangLam(trang_thai: string): boolean {
  return trang_thai === 'in_progress' || trang_thai === 'verifying';
}

/** 20.3: Xong = xanh; Đang làm/Chờ kiểm chứng = vàng viền đậm; còn lại = xám nét đứt. */
export function kieuKhoi(trang_thai: string): KieuKhoi {
  if (trang_thai === 'done') return 'xong';
  if (laKhoiDangLam(trang_thai)) return 'dang_lam';
  return 'chua_toi';
}

/** Nhãn "01, 02…" theo `khoi_lon` (20.3); trùng số thì hai khối cùng nhãn (#183). */
export function soKhoi(khoi_lon: number): string {
  return String(khoi_lon).padStart(2, '0');
}

function soCuaMa(ma: string): number {
  const n = Number(ma.slice(ma.lastIndexOf('-') + 1));
  return Number.isFinite(n) ? n : 0;
}

/** Sắp khối theo `khoi_lon`, trùng số thì theo mã ticket (#183). */
export function sapKhoi(ds: readonly KhoiLon[]): KhoiLon[] {
  return [...ds].sort((a, b) => a.khoi_lon - b.khoi_lon || soCuaMa(a.ma) - soCuaMa(b.ma));
}

export const R_KHOI = 170;

/** Vị trí khối thứ `i` trên `n` khối của vòng ngoài khi phóng vào. */
export function viTriKhoi(i: number, n: number): { x: number; y: number; goc: number } {
  const goc = (i * 2 * Math.PI) / Math.max(1, n);
  return { ...diem(goc, R_KHOI), goc };
}

/** Khung Hill Chart. */
export const DOI = { rong: 200, cao: 60 } as const;

/** Đường đồi: một nửa sóng sin, đỉnh ở giữa (`doi` = 50). */
export function yDoi(x: number): number {
  return 52 - 40 * Math.sin((Math.PI * x) / DOI.rong);
}

/** Điểm trên đồi của `doi` 0–100 (20.4 "một chấm tại `doi`"). */
export function diemDoi(doi: number): { x: number; y: number } {
  const d = Math.min(100, Math.max(0, doi));
  const x = 4 + (d / 100) * (DOI.rong - 8);
  return { x, y: yDoi(x) };
}

/** Đường `d` của đồi (SVG path). */
export function duongDoi(): string {
  const p: string[] = [];
  for (let x = 0; x <= DOI.rong; x += 5) p.push(`${x === 0 ? 'M' : 'L'}${String(x)},${yDoi(x).toFixed(1)}`);
  return p.join(' ');
}

/** 20.4: chấm cho mỗi khối **Đang làm/Chờ kiểm chứng** có `doi`; không `doi` ⇒ không chấm. */
export function khoiTrenDoi(ds: readonly KhoiLon[]): (KhoiLon & { doi: number })[] {
  return sapKhoi(ds).filter(
    (k): k is KhoiLon & { doi: number } => laKhoiDangLam(k.trang_thai) && k.doi !== null,
  );
}

export const NHAN_DOI_TRAI = 'chưa rõ cách làm';
export const NHAN_DOI_PHAI = 'đã rõ cách, đang làm';

/** 20.4: "Dưới 50 ghi 'chưa rõ cách làm', từ 50 trở lên ghi 'đã rõ cách, đang làm'". */
export function nhanDoi(doi: number): string {
  return doi < 50 ? NHAN_DOI_TRAI : NHAN_DOI_PHAI;
}

/* ------------------------------------------------------------------ *
 * Thẻ — ba làn (20.4)
 * ------------------------------------------------------------------ */

export type Lan = 'dang_day' | 'hang_cho' | 'tam_dung';

export const LAN: readonly { ma: Lan; nhan: string }[] = [
  { ma: 'dang_day', nhan: 'Đang đẩy' },
  { ma: 'hang_cho', nhan: 'Hàng chờ' },
  { ma: 'tam_dung', nhan: 'Tạm dừng' },
];

/**
 * 20.4: Đang đẩy (`dang_day`) · Hàng chờ (còn lại, đang chạy) · Tạm dừng. Dự án
 * vừa `dang_day` vừa Tạm dừng ⇒ làn Đang đẩy (chữ SPEC "dự án `dang_day`" xét
 * trước) — `spec-questions.md` #193.
 */
export function lanCua(d: Pick<HangDuAn, 'dang_day' | 'trang_thai'>): Lan {
  if (d.dang_day) return 'dang_day';
  if (d.trang_thai === 'paused') return 'tam_dung';
  return 'hang_cho';
}

/**
 * Chia thẻ vào ba làn. Thẻ là dự án **lên cây** (không lưu trữ, không duy trì):
 * dự án duy trì đã có chỗ ở dải "Khu vực duy trì" (#193). `mang` khác `null` ⇒
 * chỉ thẻ của mảng đó (20.3 "bấm mảng cũng lọc thẻ").
 */
export function chiaLan(ds: readonly HangDuAn[], mang: string | null): Record<Lan, HangDuAn[]> {
  const ra: Record<Lan, HangDuAn[]> = { dang_day: [], hang_cho: [], tam_dung: [] };
  for (const d of [...ds].sort(soDuAn)) {
    if (!lenCay(d)) continue;
    if (mang !== null && tenMang(d) !== mang) continue;
    ra[lanCua(d)].push(d);
  }
  return ra;
}

/* ------------------------------------------------------------------ *
 * Ô Cần Chủ — 20.5
 * ------------------------------------------------------------------ */

/**
 * 20.5: "mục của dự án đang đẩy lên đầu". Phép chia **ổn định**: trong mỗi phần
 * giữ nguyên thứ tự máy chủ (mức → hạn → lúc tạo).
 */
export function xepCanChu(ds: readonly MucCanChuO[]): MucCanChuO[] {
  return [...ds.filter((m) => m.du_an_dang_day), ...ds.filter((m) => !m.du_an_dang_day)];
}

/** Nhãn gắn sau mục của dự án đang đẩy — đúng chữ 20.5. */
export const NHAN_DANG_DAY_CAN_CHU = '· đang đẩy';
