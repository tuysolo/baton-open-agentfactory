/**
 * **Thanh công cụ dự án** — SPEC 20.8 (Chủ chốt 04/11/2026, T-131).
 *
 * Ba ô: **Ưu tiên** 1–5, **Trạng thái** (Đang đẩy / Hàng chờ / Tạm dừng / Duy
 * trì — bảng 20.8, suy từ `trang_thai` + `dang_day` + `duy_tri`), **Nhóm** (web là
 * giao diện của chủ ⇒ luôn hiện). Dưới ba ô là dòng "Đặt bởi <tên> · <thời gian>"
 * của lần đổi cuối (máy chủ tính, `dat_boi`).
 *
 * Gắn ở ba chỗ: thẻ dự án trên bản đồ Tổng quan (20.4), đầu trang bảng việc của
 * dự án (`/du-an/<MÃ>`) và đầu trang hồ sơ. Mỗi chỗ đưa **khoá query** của mình và
 * hai hàm thuần `lay`/`ap` đọc/áp dự án trong dữ liệu của khoá đó.
 *
 * **Lạc quan** (mục 14 d.418, nếp `cai-dat.tsx` / `ghi-lac-quan.ts`): đổi là ghi
 * ngay vào cache của khoá (thẻ đổi làn, đồng hồ WIP, bong bóng… cùng đổi), rồi
 * `PATCH`. Máy chủ từ chối ⇒ hoàn lại ảnh chụp + toast câu lỗi nguyên văn. Xong
 * (được hay không) ⇒ làm mới khoá (để `dat_boi` đúng) và `['du-an']` (sidebar).
 *
 * **Không phá thẻ bấm được**: thẻ của Tổng quan là một `<article onClick>` đi tới
 * bảng việc. Vùng thanh chặn lan `click` và phím, nên chọn một ô không điều hướng
 * và gõ trong ô Nhóm không chạm phím tắt nào ở trên.
 *
 * Lưu trữ (`archived`) không nằm trong ô Trạng thái (20.8): ô bị khoá và ghi "Lưu
 * trữ"; mở lại lưu trữ vẫn ở chỗ cũ.
 */

import { useId, useState } from 'react';
import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import {
  GHI_TRANG_THAI_BAN_DO,
  NHAN_TRANG_THAI_BAN_DO,
  TRANG_THAI_BAN_DO,
  suyTrangThaiBanDo,
} from '@baton/shared';
import {
  cauLoi,
  layDuAn,
  layDuAnChiTiet,
  suaDuAn,
  type DatBoi,
  type DuAnChiTiet,
  type ThanSuaDuAn,
  type TrangThaiBanDo,
} from '../api';
import { batDauGhiLacQuan, ketThucGhiLacQuan, lamMoiTheoSo } from '../ghi-lac-quan';
import { gioDayDu, thoiGianTuongDoi } from '../thoi-gian';
import { LOP_CHU_PHU, LOP_O_NHAP, NUT_PHU } from './lop-nut';
import { useToast } from './toast';

/* ------------------------------------------------------------------ *
 * Chữ
 * ------------------------------------------------------------------ */

export const NHAN_UU_TIEN = 'Ưu tiên';
export const NHAN_TRANG_THAI = 'Trạng thái';
export const NHAN_NHOM = 'Nhóm';
export const NHAN_LUU_TRU = 'Lưu trữ';
export const NHAN_BO_NHOM = 'Bỏ nhóm';
export const GOI_Y_NHOM = 'Không nhóm';
export const MUC_UU_TIEN = [5, 4, 3, 2, 1] as const;

export const cauDatBoi = (d: DatBoi, bay_gio: number): string =>
  `Đặt bởi ${d.ten} · ${thoiGianTuongDoi(d.luc, bay_gio)}`;

export const cauVuotWip = (n: number, gioi_han: number): string =>
  `Đang đẩy ${String(n)}/${String(gioi_han)} — vượt giới hạn WIP (vẫn lưu).`;

/* ------------------------------------------------------------------ *
 * Hàm thuần: áp một thân sửa vào một dự án (dùng cho cache lạc quan)
 * ------------------------------------------------------------------ */

export interface GiaTriDuAnCongCu {
  trang_thai: string;
  uu_tien: number;
  dang_day: boolean;
  duy_tri: boolean;
  nhom: string | null;
}

/** Áp thân vào một dự án — bảng 20.8 là **cùng** bảng của máy chủ (`GHI_TRANG_THAI_BAN_DO`). */
export function apThanDuAn<T extends GiaTriDuAnCongCu>(d: T, than: ThanSuaDuAn): T {
  let moi: T = { ...d };
  if (than.uu_tien !== undefined) moi = { ...moi, uu_tien: than.uu_tien };
  if (than.nhom !== undefined) moi = { ...moi, nhom: than.nhom };
  if (than.trang_thai_ban_do !== undefined) moi = { ...moi, ...GHI_TRANG_THAI_BAN_DO[than.trang_thai_ban_do] };
  return moi;
}

/* ------------------------------------------------------------------ *
 * Hoàn lại theo TRƯỜNG khi hai lần đổi chồng nhau (lượt sửa sau review)
 * ------------------------------------------------------------------ *
 *
 * Hoàn bằng ảnh chụp cả thân là sai khi đổi nhanh hai lần: A lỗi trước trong lúc
 * B còn bay thì ảnh của A xoá luôn giá trị lạc quan của B; B lỗi sau thì ảnh của
 * B đặt cache về giá trị lạc quan của A (đã bị từ chối). Nên mỗi lần đổi chỉ
 * mang **nhóm trường nó đổi** (ưu tiên / nhóm / trạng thái = ba trường của bảng
 * 20.8), cùng giá trị cũ và giá trị lạc quan của nhóm đó:
 *
 *   * Hoàn lại chỉ nhóm của mình, và chỉ khi giá trị trong cache **vẫn là** giá
 *     trị lạc quan của mình (một lần đổi sau đã đè thì để yên).
 *   * Lỗi ⇒ mọi lần đổi **sau** còn bay trên cùng nhóm mà "giá trị cũ" chính là
 *     giá trị lạc quan vừa hỏng được chuyển "giá trị cũ" về giá trị cũ của mình —
 *     để lần sau đó, nếu cũng lỗi, về giá trị thật chứ không về giá trị đã hỏng.
 *
 * Sổ theo `QueryClient` + khoá + dự án (`WeakMap`, nếp `ghi-lac-quan.ts`), không
 * theo component: thẻ đổi làn là thẻ dựng lại, mà hai lần đổi vẫn phải thấy nhau.
 */

type NhomTruong = 'uu_tien' | 'nhom' | 'trang_thai';

function giaTriNhom(d: GiaTriDuAnCongCu, n: NhomTruong): Partial<GiaTriDuAnCongCu> {
  if (n === 'uu_tien') return { uu_tien: d.uu_tien };
  if (n === 'nhom') return { nhom: d.nhom };
  return { trang_thai: d.trang_thai, dang_day: d.dang_day, duy_tri: d.duy_tri };
}

const bang = (x: Partial<GiaTriDuAnCongCu>, y: Partial<GiaTriDuAnCongCu>): boolean =>
  JSON.stringify(x) === JSON.stringify(y);

export function nhomCuaThan(than: ThanSuaDuAn): NhomTruong[] {
  const ra: NhomTruong[] = [];
  if (than.uu_tien !== undefined) ra.push('uu_tien');
  if (than.nhom !== undefined) ra.push('nhom');
  if (than.trang_thai_ban_do !== undefined) ra.push('trang_thai');
  return ra;
}

/** Một lần đổi đang bay: mỗi nhóm trường một cặp giá trị cũ / giá trị lạc quan. */
export interface LanDoi {
  nhom: NhomTruong[];
  cu: Partial<Record<NhomTruong, Partial<GiaTriDuAnCongCu>>>;
  moi: Partial<Record<NhomTruong, Partial<GiaTriDuAnCongCu>>>;
}

export function taoLanDoi(truoc: GiaTriDuAnCongCu, than: ThanSuaDuAn): LanDoi {
  const sau = apThanDuAn(truoc, than);
  const nhom = nhomCuaThan(than);
  const l: LanDoi = { nhom, cu: {}, moi: {} };
  for (const n of nhom) {
    l.cu[n] = giaTriNhom(truoc, n);
    l.moi[n] = giaTriNhom(sau, n);
  }
  return l;
}

/** Hàm thuần: hoàn đúng nhóm của `l`, chỉ nhóm còn mang giá trị lạc quan của `l`. */
export function hoanLanDoi<D extends GiaTriDuAnCongCu>(d: D, l: LanDoi): D {
  let ra: D = d;
  for (const n of l.nhom) {
    const moi = l.moi[n];
    const cu = l.cu[n];
    if (moi !== undefined && cu !== undefined && bang(giaTriNhom(ra, n), moi)) ra = { ...ra, ...cu };
  }
  return ra;
}

/** Hàm thuần: `hong` vừa lỗi ⇒ sửa "giá trị cũ" của các lần đổi sau nó (`sau`). */
export function chuyenGocSauLoi(hong: LanDoi, sau: readonly LanDoi[]): void {
  for (const l of sau) {
    for (const n of l.nhom) {
      const moi_hong = hong.moi[n];
      const cu_hong = hong.cu[n];
      const cu_l = l.cu[n];
      if (moi_hong !== undefined && cu_hong !== undefined && cu_l !== undefined && bang(cu_l, moi_hong)) {
        l.cu[n] = cu_hong;
      }
    }
  }
}

const SO_LAN_DOI = new WeakMap<QueryClient, Map<string, LanDoi[]>>();

function soLanDoi(qc: QueryClient, khoa: QueryKey, project_id: string): LanDoi[] {
  let m = SO_LAN_DOI.get(qc);
  if (m === undefined) {
    m = new Map();
    SO_LAN_DOI.set(qc, m);
  }
  const h = `${hashKey(khoa)}|${project_id}`;
  let ds = m.get(h);
  if (ds === undefined) {
    ds = [];
    m.set(h, ds);
  }
  return ds;
}

function boKhoiSo(ds: LanDoi[], l: LanDoi): void {
  const i = ds.indexOf(l);
  if (i >= 0) ds.splice(i, 1);
}

/* ------------------------------------------------------------------ *
 * Thành phần
 * ------------------------------------------------------------------ */

interface BienDoi {
  project_id: string;
  than: ThanSuaDuAn;
  khoa: QueryKey;
}

/** Biến đổi một dự án trong dữ liệu của khoá — hàm thuần mà mỗi chỗ gắn tự cài. */
export type SuaDuAnTrong = (d: GiaTriDuAnCongCu) => GiaTriDuAnCongCu;

export function ThanhCongCuDuAn<T>({
  project_id,
  ten,
  du_an,
  dat_boi,
  bay_gio,
  khoa,
  lay,
  ap,
  nhom_goi_y,
}: {
  project_id: string;
  /** Tên dự án — cho `aria-label` của từng ô. */
  ten: string;
  du_an: GiaTriDuAnCongCu;
  dat_boi: DatBoi | null | undefined;
  bay_gio: number;
  /** Khoá query chứa dự án này — nơi ghi lạc quan. */
  khoa: QueryKey;
  /** Đọc dự án `project_id` trong dữ liệu của `khoa` (hàm thuần). */
  lay: (cu: T, project_id: string) => GiaTriDuAnCongCu | undefined;
  /** Áp một biến đổi vào dự án `project_id` trong dữ liệu của `khoa` (hàm thuần). */
  ap: (cu: T, project_id: string, sua: SuaDuAnTrong) => T;
  /** Các nhóm đã có — gợi ý của ô Nhóm. */
  nhom_goi_y: readonly string[];
}): React.JSX.Element {
  const qc = useQueryClient();
  const toast = useToast();
  const id = useId();

  /*
   * Đích, thân và khoá đi trong BIẾN (BAT-29): `mutationFn`/`onSettled` là của lần
   * vẽ mới nhất, nên đọc từ closure là ghi nhầm dự án khi thẻ đổi giữa chừng.
   */
  const doi = useMutation({
    mutationFn: (b: BienDoi) => suaDuAn(b.project_id, b.than),
    onMutate: async (b) => {
      const k = b.khoa;
      const ghi = batDauGhiLacQuan(qc, [k]);
      try {
        await qc.cancelQueries({ queryKey: k });
        const truoc = qc.getQueryData<T>(k);
        const da = truoc === undefined ? undefined : lay(truoc, b.project_id);
        let lan: LanDoi | null = null;
        if (truoc !== undefined && da !== undefined) {
          lan = taoLanDoi(da, b.than);
          soLanDoi(qc, k, b.project_id).push(lan);
          qc.setQueryData<T>(k, ap(truoc, b.project_id, (d) => apThanDuAn(d, b.than)));
        }
        return { lan, ghi, khoa: k, project_id: b.project_id };
      } catch (e) {
        ketThucGhiLacQuan(qc, ghi);
        throw e;
      }
    },
    onSuccess: (kq, _b, nc) => {
      // Giá trị của lần này là thật: bỏ khỏi sổ (lần sau nó lấy nó làm gốc là đúng).
      if (nc.lan !== null) boKhoiSo(soLanDoi(qc, nc.khoa, nc.project_id), nc.lan);
      // 20.8: đủ WIP vẫn cho — nói ra (Tổng quan còn có đồng hồ đỏ).
      if (kq.wip?.vuot === true) toast.bao(cauVuotWip(kq.wip.dang_day, kq.wip.gioi_han), 'tin');
    },
    onError: (e, _b, nc) => {
      if (nc !== undefined && nc.lan !== null) {
        const lan = nc.lan;
        const ds = soLanDoi(qc, nc.khoa, nc.project_id);
        chuyenGocSauLoi(lan, ds.slice(ds.indexOf(lan) + 1));
        boKhoiSo(ds, lan);
        qc.setQueryData<T>(nc.khoa, (cu) =>
          cu === undefined ? cu : ap(cu, nc.project_id, (d) => hoanLanDoi(d, lan)),
        );
      }
      toast.bao(cauLoi(e), 'loi');
    },
    onSettled: (_d, _l, b, nc) => {
      ketThucGhiLacQuan(qc, nc?.ghi);
      const k = nc?.khoa ?? b.khoa;
      const lam_du_an = lamMoiTheoSo(qc, { queryKey: ['du-an'] });
      // Khoá chi tiết (bảng việc) là con của `['du-an']`: đã làm mới ở trên, không gọi hai lần.
      if (k[0] === 'du-an') return lam_du_an;
      void lam_du_an;
      return lamMoiTheoSo(qc, { queryKey: k });
    },
  });

  const gui = (than: ThanSuaDuAn): void => {
    doi.mutate({ project_id, than, khoa });
  };

  const trang_thai_bd = suyTrangThaiBanDo(du_an);

  return (
    <div
      data-thanh-cong-cu={project_id}
      role="group"
      aria-label={`Thanh công cụ dự án ${ten}`}
      // Chặn lan: thẻ cha bấm được (20.4) không được điều hướng khi dùng ô.
      onClick={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
      }}
      className="flex min-w-0 flex-col gap-1"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className={`flex items-center gap-1.5 ${LOP_CHU_PHU}`}>
          {NHAN_UU_TIEN}
          <select
            data-o-chon="uu-tien"
            aria-label={`${NHAN_UU_TIEN} của ${ten}`}
            value={String(du_an.uu_tien)}
            onChange={(e) => {
              gui({ uu_tien: Number(e.target.value) });
            }}
            className={LOP_O_NHAP}
          >
            {MUC_UU_TIEN.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className={`flex items-center gap-1.5 ${LOP_CHU_PHU}`}>
          {NHAN_TRANG_THAI}
          {trang_thai_bd === null ? (
            <select
              data-o-chon="trang-thai"
              aria-label={`${NHAN_TRANG_THAI} của ${ten}`}
              value="luu_tru"
              disabled
              className={LOP_O_NHAP}
            >
              <option value="luu_tru">{NHAN_LUU_TRU}</option>
            </select>
          ) : (
            <select
              data-o-chon="trang-thai"
              aria-label={`${NHAN_TRANG_THAI} của ${ten}`}
              value={trang_thai_bd}
              onChange={(e) => {
                gui({ trang_thai_ban_do: e.target.value as TrangThaiBanDo });
              }}
              className={LOP_O_NHAP}
            >
              {TRANG_THAI_BAN_DO.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_BAN_DO[t]}
                </option>
              ))}
            </select>
          )}
        </label>

        {/* `key` theo giá trị máy chủ: đổi xong (hay hoàn lại) thì bản nháp theo. */}
        <ONhom
          key={du_an.nhom ?? ''}
          id_ds={`${id}-nhom`}
          ten={ten}
          nhom={du_an.nhom}
          goi_y={nhom_goi_y}
          onDoi={(nhom) => {
            gui({ nhom });
          }}
        />
      </div>

      {/* Thân thiếu trường (bản API cũ) cũng là "chưa ai đổi" — không vỡ trang. */}
      {dat_boi === null || dat_boi === undefined ? null : (
        <p data-o="dat-boi" title={gioDayDu(dat_boi.luc)} className={LOP_CHU_PHU}>
          {cauDatBoi(dat_boi, bay_gio)}
        </p>
      )}
    </div>
  );
}

/**
 * Ô **Nhóm**: nhập chữ có gợi ý các nhóm đã có (`datalist`); ghi khi Enter hoặc
 * rời ô, chỉ khi giá trị thật sự đổi. Rỗng ⇒ bỏ nhóm (`null`); nút "Bỏ nhóm" làm
 * đúng việc đó một cú bấm.
 */
function ONhom({
  id_ds,
  ten,
  nhom,
  goi_y,
  onDoi,
}: {
  id_ds: string;
  ten: string;
  nhom: string | null;
  goi_y: readonly string[];
  onDoi: (nhom: string | null) => void;
}): React.JSX.Element {
  const [nhap, datNhap] = useState(nhom ?? '');

  const ghi = (): void => {
    const moi = nhap.trim() === '' ? null : nhap.trim();
    if (moi !== nhom) onDoi(moi);
  };

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <label className={`flex min-w-0 items-center gap-1.5 ${LOP_CHU_PHU}`}>
        {NHAN_NHOM}
        <input
          data-o-chon="nhom"
          aria-label={`${NHAN_NHOM} của ${ten}`}
          list={id_ds}
          value={nhap}
          placeholder={GOI_Y_NHOM}
          onChange={(e) => {
            datNhap(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              ghi();
            }
          }}
          onBlur={ghi}
          className={`w-32 min-w-0 ${LOP_O_NHAP}`}
        />
      </label>
      <datalist id={id_ds}>
        {goi_y.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      {nhom === null ? null : (
        <button
          type="button"
          data-nut="bo-nhom"
          aria-label={`${NHAN_BO_NHOM} của ${ten}`}
          onClick={() => {
            datNhap('');
            onDoi(null);
          }}
          className={`rounded px-1.5 py-0.5 text-xs ${NUT_PHU}`}
        >
          {NHAN_BO_NHOM}
        </button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Gắn ở đầu trang bảng việc của dự án (`/du-an/<MÃ>`)
 * ------------------------------------------------------------------ */

/** Khoá chi tiết một dự án — con của `['du-an']`, nên làm mới sidebar cũng làm mới nó. */
export const khoaDuAnChiTiet = (project_id: string): readonly ['du-an', 'chi-tiet', string] =>
  ['du-an', 'chi-tiet', project_id] as const;

const layTrongChiTiet = (d: DuAnChiTiet, project_id: string): DuAnChiTiet | undefined =>
  d.id === project_id ? d : undefined;

const apChiTiet = (d: DuAnChiTiet, project_id: string, sua: SuaDuAnTrong): DuAnChiTiet =>
  d.id === project_id ? { ...d, ...sua(d) } : d;

/**
 * Thanh công cụ ở đầu bảng việc: đọc `GET /v1/du-an/:id` (đã mang `dat_boi` và
 * `bay_gio`, một lượt gọi, không N+1). Chưa tải / lỗi ⇒ không vẽ gì: bảng việc
 * vẫn dùng được. Gợi ý ô Nhóm từ cache `['du-an']` mà trang đã tải.
 */
export function ThanhCongCuBangViec({ project_id }: { project_id: string }): React.JSX.Element | null {
  const khoa = khoaDuAnChiTiet(project_id);
  const q = useQuery({ queryKey: khoa, queryFn: () => layDuAnChiTiet(project_id) });
  const ds = useQuery({ queryKey: ['du-an'], queryFn: layDuAn, enabled: false });
  if (q.data === undefined) return null;
  const d = q.data;
  return (
    <ThanhCongCuDuAn<DuAnChiTiet>
      project_id={d.id}
      ten={d.ten}
      du_an={d}
      dat_boi={d.dat_boi}
      bay_gio={d.bay_gio}
      khoa={khoa}
      lay={layTrongChiTiet}
      ap={apChiTiet}
      nhom_goi_y={cacNhom(ds.data?.items ?? [])}
    />
  );
}

/** Các nhóm khác nhau (không rỗng), sắp theo chữ — gợi ý của ô Nhóm. */
export function cacNhom(ds: readonly { nhom: string | null }[]): string[] {
  return [...new Set(ds.map((d) => d.nhom).filter((n): n is string => n !== null && n !== ''))].sort((a, b) =>
    a.localeCompare(b, 'vi'),
  );
}
