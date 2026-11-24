/**
 * **Bản đồ dự án trên Tổng quan** — SPEC 20.2–20.6 (Chủ chốt T-127 = A, 04/11).
 * Thay khối "1. Dự án" của mục 11; từ trên xuống:
 *
 *   1. **Thanh đầu**: đồng hồ WIP "Đang đẩy n/<giới hạn>" (đỏ khi n > giới hạn) và
 *      ô Cần Chủ gọn (trang truyền vào — ô thuộc `trang/tong-quan.tsx`).
 *   2. **Cây tròn** (trái) + **thẻ 3 làn** (phải); dưới 768px (`md`) xếp dọc.
 *   3. **Dải "Khu vực duy trì · n"**.
 *
 * Mọi phép chọn nằm ở `ban-do-bo-cuc.ts` (hàm thuần, có test); file này chỉ vẽ.
 * SVG tự dựng (`viewBox` + `w-full`), **không** thư viện vẽ (brief: không thêm
 * dependency). Không vẽ 4 kiểu nhìn phụ của mockup (20.7).
 *
 * **Bàn phím**: mỗi bong bóng bấm được là `role="button"` + `tabIndex=0`, Enter /
 * Space như bấm; focus hiện tooltip như rê chuột. **Chạm giữ** (≥ 500 ms) hiện
 * tooltip và không tính là một lần bấm (20.6 "chạm thay rê chuột").
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nhan } from '@baton/shared';
import type { HangDuAn, KhoiLon, TongQuan } from '../api';
import { ThanhCongCuDuAn, cacNhom, type SuaDuAnTrong } from './thanh-cong-cu-du-an';
import { CAU_DU_AN_KHONG_CHAY, ChamSucSong } from './cham-suc-song';
import {
  BAN_KINH_TAM,
  DOI,
  KHUNG,
  LAN,
  LOP_MAU_BONG,
  NHAN_MAU_BONG,
  benNhan,
  boCucCay,
  catChu,
  chiaLan,
  chuVi,
  diemDoi,
  duAnDuyTri,
  duongDoi,
  gomMang,
  khoiTrenDoi,
  kieuKhoi,
  lenCay,
  mangGapMacDinh,
  mauBong,
  mauMang,
  nhanDoi,
  sapKhoi,
  soKhoi,
  tenHien,
  tenMang,
  viTriKhoi,
  type KieuKhoi,
  type Mang,
} from './ban-do-bo-cuc';
import {
  LOP_CAU_CHO,
  LOP_CHIP,
  LOP_CHU_MO_HON,
  LOP_CHU_PHU,
  LOP_LIEN_KET,
  LOP_THE,
  LOP_TIEU_DE_NHO,
  NUT_PHU,
} from './lop-nut';
import { duongDuAn, duongMucCanChu, duongTicket } from './muc-sidebar';

/* ------------------------------------------------------------------ *
 * Chữ
 * ------------------------------------------------------------------ */

export const NHAN_CHI_GIU_DANG_DAY = 'Chỉ giữ dự án đang đẩy';
export const NHAN_MO_HET = 'Mở hết';
export const NHAN_THU_GON_HET = 'Thu gọn hết';
export const NHAN_BO_LOC_MANG = 'Bỏ lọc';
export const TEN_DAI_DUY_TRI = 'Khu vực duy trì';
export const CAU_CHUA_CO_DUY_TRI = 'Chưa có dự án duy trì nào.';
export const CAU_LAN_RONG = 'Không có dự án nào.';
export const CAU_CHUA_CHIA_KHOI = 'Dự án này chưa chia khối việc lớn.';
export const CAU_CHUA_LEN_CAY = 'Chưa có dự án nào trên bản đồ.';
export const O_TRONG = '—';
export const CAU_KHONG_CHO_TUY = 'Không';

export const nhanWip = (n: number, gioi_han: number): string =>
  `Đang đẩy ${String(n)}/${String(gioi_han)}`;
export const nhanDaiDuyTri = (n: number): string => `${TEN_DAI_DUY_TRI} · ${String(n)}`;

/** Bao lâu thì "chạm giữ" thành xem tooltip. */
export const GIU_MS = 500;

/* ------------------------------------------------------------------ *
 * Ghi lạc quan của thanh công cụ (20.8) vào thân Tổng quan
 * ------------------------------------------------------------------ */

/** Khoá query của Tổng quan (`trang/tong-quan.tsx`). */
export const KHOA_TONG_QUAN = ['tong-quan'] as const;

/**
 * Hàm thuần: áp một thân sửa dự án vào thân Tổng quan — dự án đổi ⇒ thẻ đổi làn,
 * bong bóng đổi, và đồng hồ WIP cộng/trừ đúng phần dự án này (đếm như máy chủ:
 * `dang_day`, không lưu trữ). Nhãn trạng thái theo bảng mã chung.
 */
export function apTongQuan(tq: TongQuan, project_id: string, sua: SuaDuAnTrong): TongQuan {
  const cu = tq.du_an.find((x) => x.id === project_id);
  if (cu === undefined) return tq;
  const moi_tho: HangDuAn = { ...cu, ...sua(cu) };
  const moi: HangDuAn = { ...moi_tho, nhan_trang_thai: nhan('trang_thai_du_an', moi_tho.trang_thai) };
  const dem = (x: HangDuAn): number => (x.dang_day && x.trang_thai !== 'archived' ? 1 : 0);
  const n = Math.max(0, tq.ban_do.wip.dang_day - dem(cu) + dem(moi));
  return {
    ...tq,
    du_an: tq.du_an.map((x) => (x.id === project_id ? moi : x)),
    ban_do: { ...tq.ban_do, wip: { ...tq.ban_do.wip, dang_day: n, vuot: n > tq.ban_do.wip.gioi_han } },
  };
}

/** Đọc một dự án trong thân Tổng quan — cặp với `apTongQuan`. */
export const layTrongTongQuan = (tq: TongQuan, project_id: string): HangDuAn | undefined =>
  tq.du_an.find((x) => x.id === project_id);

/* ------------------------------------------------------------------ *
 * Tooltip (rê chuột / focus / chạm giữ) — 20.3
 * ------------------------------------------------------------------ */

interface GoiY {
  khoa: string;
  dong: string[];
}

/** Ba dòng của 20.3: tên đầy đủ, trạng thái, "Đang làm". */
export function goiYDuAn(d: HangDuAn): GoiY {
  return {
    khoa: `da:${d.id}`,
    dong: [
      d.ten,
      `${d.nhan_trang_thai}${d.dang_day ? ' · đang đẩy' : ''} · ưu tiên ${String(d.uu_tien)}`,
      d.viec_noi_bat === null
        ? `Đang làm: ${CAU_DU_AN_KHONG_CHAY}`
        : `Đang làm: ${d.viec_noi_bat.ma} ${d.viec_noi_bat.tieu_de}`,
    ],
  };
}

function useGoiY(): {
  goi_y: GoiY | null;
  suKien: (g: GoiY) => React.SVGProps<SVGGElement>;
  bam: (fn: () => void) => () => void;
} {
  const [goi_y, datGoiY] = useState<GoiY | null>(null);
  const hen = useRef<ReturnType<typeof setTimeout> | null>(null);
  const da_giu = useRef(false);
  const huyHen = (): void => {
    if (hen.current !== null) clearTimeout(hen.current);
    hen.current = null;
  };
  useEffect(() => huyHen, []);

  return {
    goi_y,
    suKien: (g) => ({
      onMouseEnter: () => {
        datGoiY(g);
      },
      onMouseLeave: () => {
        datGoiY((c) => (c?.khoa === g.khoa ? null : c));
      },
      onFocus: () => {
        datGoiY(g);
      },
      onBlur: () => {
        datGoiY((c) => (c?.khoa === g.khoa ? null : c));
      },
      onPointerDown: (e) => {
        if (e.pointerType !== 'touch') return;
        da_giu.current = false;
        huyHen();
        hen.current = setTimeout(() => {
          da_giu.current = true;
          datGoiY(g);
        }, GIU_MS);
      },
      onPointerUp: huyHen,
      onPointerCancel: huyHen,
    }),
    // Chạm giữ đã hiện tooltip thì cú "bấm" theo sau khi nhấc tay không tính.
    bam: (fn) => () => {
      if (da_giu.current) {
        da_giu.current = false;
        return;
      }
      fn();
    },
  };
}

/** Enter / Space trên một `role="button"` của SVG — như bấm chuột. */
function phimBam(fn: () => void): (e: React.KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

/* ------------------------------------------------------------------ *
 * Khối chính
 * ------------------------------------------------------------------ */

type CheDo = 'mac_dinh' | 'mo_het' | 'gap_het';

export function BanDoDuAn({
  d,
  o_can_chu,
}: {
  d: TongQuan;
  o_can_chu: React.ReactNode;
}): React.JSX.Element {
  const mang = useMemo(() => gomMang(d.du_an), [d.du_an]);

  /*
   * Trạng thái gập = **chế độ** (mặc định / mở hết / gập hết — ba nút nhanh) cộng
   * **ghi đè từng mảng** (bấm mảng). Không lưu một tập cố định: thân làm mới mỗi
   * 2 giây (d.410), một mảng mới xuất hiện phải theo chế độ đang chọn — mặc định
   * là luật 20.3 "mảng không có dự án đang đẩy thì gập".
   */
  const [che_do, datCheDo] = useState<CheDo>('mac_dinh');
  const [ghi_de, datGhiDe] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [loc_dat, datLoc] = useState<string | null>(null);
  const [phong_dat, datPhong] = useState<string | null>(null);

  const mac_dinh = mangGapMacDinh(mang);
  const gap = new Set(
    mang
      .filter((m) => {
        const g = ghi_de.get(m.ten);
        if (g !== undefined) return g;
        if (che_do === 'mo_het') return false;
        if (che_do === 'gap_het') return true;
        return mac_dinh.has(m.ten);
      })
      .map((m) => m.ten),
  );
  // Mảng / dự án đã biến mất khỏi thân mới ⇒ bỏ lọc / thôi phóng, không giữ một id chết.
  const loc = loc_dat !== null && mang.some((m) => m.ten === loc_dat) ? loc_dat : null;
  const phong = d.du_an.find((x) => x.id === phong_dat && lenCay(x)) ?? null;

  const nutNhanh = (c: CheDo): void => {
    datCheDo(c);
    datGhiDe(new Map());
  };

  const bamMang = (ten: string): void => {
    // 20.3: bấm mảng **vừa** gập/mở **vừa** lọc thẻ (bấm lại để bỏ lọc).
    datGhiDe((cu) => new Map(cu).set(ten, !gap.has(ten)));
    /*
     * Lọc xét theo **lọc đang hiện trên màn hình** (`loc`), không theo cờ cũ: sau
     * "Bỏ lọc" (hoặc mảng đã biến mất) bấm mảng là BẬT lọc lại — đang lọc đúng mảng
     * này thì bỏ. Gập/mở vẫn bật tắt độc lập như trên.
     */
    datLoc(loc === ten ? null : ten);
  };

  return (
    <div data-ban-do-du-an="co" className="flex min-w-0 flex-col gap-4">
      {/* 1. Thanh đầu — 20.2 */}
      <div data-o="thanh-dau" className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start">
        <DongHoWip wip={d.ban_do.wip} />
        {o_can_chu}
      </div>

      {/* 2. Bản đồ (trái) + thẻ (phải); dưới 768px bản đồ trên, thẻ dưới — 20.2 */}
      <div data-o="ban-do-va-the" className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start">
        <div data-o="vung-ban-do" className={`flex min-w-0 flex-col gap-2 p-3 md:w-1/2 md:shrink-0 ${LOP_THE}`}>
          {phong === null ? (
            <>
              <div role="group" aria-label="Thu gọn hoặc mở mảng" className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-nut="chi-giu-dang-day"
                  onClick={() => {
                    nutNhanh('mac_dinh');
                  }}
                  className={`rounded px-2 py-0.5 text-xs ${NUT_PHU}`}
                >
                  {NHAN_CHI_GIU_DANG_DAY}
                </button>
                <button
                  type="button"
                  data-nut="mo-het"
                  onClick={() => {
                    nutNhanh('mo_het');
                  }}
                  className={`rounded px-2 py-0.5 text-xs ${NUT_PHU}`}
                >
                  {NHAN_MO_HET}
                </button>
                <button
                  type="button"
                  data-nut="thu-gon-het"
                  onClick={() => {
                    nutNhanh('gap_het');
                  }}
                  className={`rounded px-2 py-0.5 text-xs ${NUT_PHU}`}
                >
                  {NHAN_THU_GON_HET}
                </button>
              </div>
              <CayTron
                mang={mang}
                gap={gap}
                loc={loc}
                ten_chu={d.ban_do.ten_chu}
                onBamMang={bamMang}
                onPhong={(id) => {
                  datPhong(id);
                }}
              />
            </>
          ) : (
            <PhongDuAn
              d={phong}
              onQuayLai={() => {
                datPhong(null);
              }}
            />
          )}
        </div>

        <TheBaLan
          ds={d.du_an}
          ten_chu={d.ban_do.ten_chu}
          bay_gio={d.bay_gio}
          loc={loc}
          onBoLoc={() => {
            datLoc(null);
          }}
        />
      </div>

      {/* 3. Dải duy trì — 20.2 */}
      <DaiDuyTri ds={duAnDuyTri(d.du_an)} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Đồng hồ WIP — 20.2
 * ------------------------------------------------------------------ */

/** Số ô vẽ tối đa của thanh ô — con số bằng chữ luôn đủ. */
const TRAN_O_WIP = 12;

export function DongHoWip({
  wip,
}: {
  wip: { dang_day: number; gioi_han: number; vuot: boolean };
}): React.JSX.Element {
  const so_o = Math.min(TRAN_O_WIP, Math.max(wip.gioi_han, wip.dang_day));
  return (
    <div
      data-wip="co"
      data-vuot={wip.vuot ? 'co' : 'khong'}
      className={`flex shrink-0 items-center gap-3 px-3 py-2 ${LOP_THE}`}
    >
      <span aria-hidden="true" className="flex gap-1">
        {Array.from({ length: so_o }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-4 rounded-sm ${
              i < wip.dang_day ? (i >= wip.gioi_han ? 'bg-loi' : 'bg-nhan-manh') : 'bg-neutral-200'
            }`}
          />
        ))}
      </span>
      {/* Đỏ khi n > giới hạn — bằng thì không (20.2). Chữ mang số, không chỉ màu. */}
      <span
        data-o="wip-chu"
        className={`text-sm font-medium tabular-nums ${wip.vuot ? 'text-loi' : 'text-chu'}`}
      >
        {nhanWip(wip.dang_day, wip.gioi_han)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cây tròn — 20.3
 * ------------------------------------------------------------------ */

function CayTron({
  mang,
  gap,
  loc,
  ten_chu,
  onBamMang,
  onPhong,
}: {
  mang: Mang[];
  gap: ReadonlySet<string>;
  loc: string | null;
  ten_chu: string;
  onBamMang: (ten: string) => void;
  onPhong: (id: string) => void;
}): React.JSX.Element {
  const { goi_y, suKien, bam } = useGoiY();
  const bc = boCucCay(mang, gap);
  const vi_tri_mang = new Map(bc.mang.map((m) => [m.ten, m]));

  if (mang.length === 0) return <p className={LOP_CAU_CHO}>{CAU_CHUA_LEN_CAY}</p>;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <svg
        data-ban-do="cay"
        role="group"
        aria-label="Cây tròn dự án"
        viewBox={`${String(KHUNG.x)} ${String(KHUNG.y)} ${String(KHUNG.rong)} ${String(KHUNG.cao)}`}
        className="block h-auto w-full max-w-full"
      >
        {/* Nhánh tâm → mảng → dự án: màu mảng qua `currentColor`. */}
        {bc.mang.map((m) => (
          <path
            key={`nh-${m.ten}`}
            className={mauMang(m.ten)}
            d={`M0,0 L${m.x.toFixed(1)},${m.y.toFixed(1)}`}
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeWidth={5}
            strokeLinecap="round"
            fill="none"
          />
        ))}
        {bc.du_an.map((n) => {
          const m = vi_tri_mang.get(n.mang);
          if (m === undefined) return null;
          return (
            <path
              key={`nh-${n.du_an.id}`}
              className={mauMang(n.mang)}
              d={`M${m.x.toFixed(1)},${m.y.toFixed(1)} L${n.x.toFixed(1)},${n.y.toFixed(1)}`}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
            />
          );
        })}

        {/* Tâm = tên chủ. */}
        <g data-nut="tam" role="img" aria-label={`Chủ: ${ten_chu}`}>
          <circle r={BAN_KINH_TAM} className="fill-nhan-manh" />
          <text textAnchor="middle" dy="0.35em" fontSize={12} fontWeight={700} className="fill-tren-nhan-manh">
            {catChu(ten_chu, 10)}
          </text>
        </g>

        {/* Vòng 1 — mảng. */}
        {bc.mang.map((m) => {
          const so = m.mang.du_an.length;
          const ben = benNhan(m.goc);
          const g: GoiY = {
            khoa: `mg:${m.ten}`,
            dong: [m.ten, `${String(so)} dự án${m.gap ? ' · đang gập' : ''}`],
          };
          const bamDay = bam(() => {
            onBamMang(m.ten);
          });
          return (
            <g
              key={`mg-${m.ten}`}
              data-nut-mang={m.ten}
              data-gap={m.gap ? 'co' : 'khong'}
              data-loc={loc === m.ten ? 'co' : 'khong'}
              data-r={m.r.toFixed(1)}
              role="button"
              tabIndex={0}
              aria-expanded={!m.gap}
              aria-pressed={loc === m.ten}
              aria-label={`Mảng ${m.ten}, ${String(so)} dự án${m.gap ? ', đang gập' : ''}`}
              transform={`translate(${m.x.toFixed(1)},${m.y.toFixed(1)})`}
              className={`cursor-pointer ${mauMang(m.ten)}`}
              onClick={bamDay}
              onKeyDown={phimBam(bamDay)}
              {...suKien(g)}
            >
              <circle r={m.r} fill="currentColor" strokeWidth={loc === m.ten ? 3 : 0} className="stroke-chu" />
              <text textAnchor="middle" dy="0.35em" fontSize={m.gap ? 12 : 10} fontWeight={700} className="fill-nen">
                {m.gap ? `+${String(so)}` : String(so)}
              </text>
              <text
                x={ben * (m.r + 6)}
                dy="0.35em"
                textAnchor={ben > 0 ? 'start' : 'end'}
                fontSize={12}
                fontWeight={700}
                fill="currentColor"
              >
                {catChu(m.ten, 16)}
              </text>
              <title>{g.dong.join(' — ')}</title>
            </g>
          );
        })}

        {/* Vòng 2 — dự án (chỉ của mảng đang mở). */}
        {bc.du_an.map((n) => {
          const da = n.du_an;
          const mau = mauBong(da);
          const ben = benNhan(n.goc);
          const co_khoi = da.khoi_tong > 0;
          const r_vong = n.r + 5;
          const cv = chuVi(r_vong);
          const ti_le = co_khoi ? da.khoi_xong / da.khoi_tong : 0;
          const g = goiYDuAn(da);
          const bamDay = bam(() => {
            onPhong(da.id);
          });
          return (
            <g
              key={`da-${da.id}`}
              data-nut-du-an={da.ma}
              data-mau={mau}
              data-dang-day={da.dang_day ? 'co' : 'khong'}
              data-r={n.r.toFixed(1)}
              role="button"
              tabIndex={0}
              aria-label={`${da.ten}, ${NHAN_MAU_BONG[mau]}, ưu tiên ${String(da.uu_tien)}${
                da.dang_day ? ', đang đẩy' : ''
              } — phóng vào`}
              transform={`translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`}
              // 20.3: dự án không `dang_day` mờ đi (hàng chờ).
              opacity={da.dang_day ? 1 : 0.5}
              className="cursor-pointer"
              onClick={bamDay}
              onKeyDown={phimBam(bamDay)}
              {...suKien(g)}
            >
              {co_khoi ? (
                <>
                  <circle r={r_vong} fill="none" strokeWidth={2} className="stroke-neutral-300" />
                  <circle
                    data-vong-tien-do={`${String(da.khoi_xong)}/${String(da.khoi_tong)}`}
                    r={r_vong}
                    fill="none"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray={`${(ti_le * cv).toFixed(1)} ${cv.toFixed(1)}`}
                    transform="rotate(-90)"
                    className="stroke-tot"
                  />
                </>
              ) : null}
              <circle
                data-bong="co"
                r={n.r}
                // 20.3: `dang_day` viền đậm.
                strokeWidth={da.dang_day ? 3 : 0}
                className={`${LOP_MAU_BONG[mau]} stroke-chu`}
              />
              <text
                x={ben * (r_vong + 5)}
                dy="0.35em"
                textAnchor={ben > 0 ? 'start' : 'end'}
                fontSize={11}
                fontWeight={da.dang_day ? 700 : 400}
                className={da.trang_thai === 'paused' ? 'fill-chu-mo' : 'fill-chu'}
              >
                <tspan>{catChu(tenHien(da), 16)}</tspan>
                {co_khoi ? (
                  <tspan
                    data-tien-do-khoi={`${String(da.khoi_xong)}/${String(da.khoi_tong)}`}
                    x={ben * (r_vong + 5)}
                    dy="1.25em"
                    fontSize={9.5}
                    className="fill-chu-mo"
                  >
                    {`${String(da.khoi_xong)}/${String(da.khoi_tong)}`}
                  </tspan>
                ) : null}
              </text>
              <title>{g.dong.join(' — ')}</title>
            </g>
          );
        })}
      </svg>
      <GoiYO goi_y={goi_y} />
    </div>
  );
}

function GoiYO({ goi_y }: { goi_y: GoiY | null }): React.JSX.Element {
  // Ô luôn giữ chỗ (min-h) để rê chuột không đẩy thẻ bên dưới xô lệch.
  return (
    <div role="tooltip" data-goi-y={goi_y === null ? 'an' : 'hien'} className={`min-h-10 ${LOP_CHU_PHU}`}>
      {goi_y === null
        ? null
        : goi_y.dong.map((d, i) => (
            <p key={i} className={i === 0 ? 'font-medium text-chu' : undefined}>
              {d}
            </p>
          ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Phóng vào dự án — 20.3 (không bao giờ ba tầng cùng lúc)
 * ------------------------------------------------------------------ */

const LOP_KHOI: Record<KieuKhoi, string> = {
  xong: 'fill-tot',
  dang_lam: 'fill-canh stroke-chu',
  chua_toi: 'fill-none stroke-tt-huy',
};

const NHAN_KIEU_KHOI: Record<KieuKhoi, string> = {
  xong: 'Xong',
  dang_lam: 'Đang làm',
  chua_toi: 'Chưa tới',
};

function PhongDuAn({ d, onQuayLai }: { d: HangDuAn; onQuayLai: () => void }): React.JSX.Element {
  const { goi_y, suKien, bam } = useGoiY();
  const khoi = sapKhoi(d.khoi_lon);
  const mau = mauBong(d);
  const R_TAM = 52;
  const cv = chuVi(R_TAM + 7);
  const ti_le = d.khoi_tong > 0 ? d.khoi_xong / d.khoi_tong : 0;
  const quayLai = bam(onQuayLai);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className={LOP_CHU_PHU}>Đang phóng vào {d.ten}. Bấm tâm để quay lại bản đồ.</p>
      <svg
        data-ban-do="phong"
        role="group"
        aria-label={`Khối lớn của ${d.ten}`}
        viewBox={`${String(KHUNG.x)} ${String(KHUNG.y)} ${String(KHUNG.rong)} ${String(KHUNG.cao)}`}
        className="block h-auto w-full max-w-full"
      >
        {khoi.map((k, i) => {
          const p = viTriKhoi(i, khoi.length);
          const kieu = kieuKhoi(k.trang_thai);
          return (
            <path
              key={`nh-${k.id}`}
              className={mauMang(tenMang(d))}
              d={`M0,0 L${p.x.toFixed(1)},${p.y.toFixed(1)}`}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeWidth={kieu === 'chua_toi' ? 2 : 5}
              strokeDasharray={kieu === 'chua_toi' ? '4 6' : undefined}
              strokeLinecap="round"
              fill="none"
            />
          );
        })}

        <g
          data-nut="tam-du-an"
          role="button"
          tabIndex={0}
          aria-label={`${d.ten} — quay lại bản đồ`}
          className="cursor-pointer"
          onClick={quayLai}
          onKeyDown={phimBam(quayLai)}
          {...suKien(goiYDuAn(d))}
        >
          <circle r={R_TAM + 7} fill="none" strokeWidth={2} className="stroke-neutral-300" />
          <circle
            r={R_TAM + 7}
            fill="none"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${(ti_le * cv).toFixed(1)} ${cv.toFixed(1)}`}
            transform="rotate(-90)"
            className="stroke-tot"
          />
          <circle r={R_TAM} strokeWidth={d.dang_day ? 3 : 0} className={`${LOP_MAU_BONG[mau]} stroke-chu`} />
          <text textAnchor="middle" y={-4} fontSize={12} fontWeight={700} className="fill-nen">
            {catChu(tenHien(d), 14)}
          </text>
          <text textAnchor="middle" y={13} fontSize={10} className="fill-nen">
            {d.khoi_tong > 0 ? `${String(d.khoi_xong)}/${String(d.khoi_tong)} khối xong` : 'chưa chia khối'}
          </text>
          <title>Bấm để quay lại bản đồ</title>
        </g>

        {khoi.map((k, i) => (
          <NutKhoi key={k.id} k={k} i={i} n={khoi.length} suKien={suKien} />
        ))}

        {khoi.length === 0 ? (
          <text y={110} textAnchor="middle" fontSize={12} className="fill-chu-mo">
            {CAU_CHUA_CHIA_KHOI}
          </text>
        ) : null}
      </svg>
      <GoiYO goi_y={goi_y} />
    </div>
  );
}

function NutKhoi({
  k,
  i,
  n,
  suKien,
}: {
  k: KhoiLon;
  i: number;
  n: number;
  suKien: (g: GoiY) => React.SVGProps<SVGGElement>;
}): React.JSX.Element {
  const p = viTriKhoi(i, n);
  const kieu = kieuKhoi(k.trang_thai);
  const r = kieu === 'dang_lam' ? 26 : 21;
  const ben = benNhan(p.goc);
  const g: GoiY = {
    khoa: `kh:${k.id}`,
    dong: [`${soKhoi(k.khoi_lon)} · ${k.tieu_de}`, `${k.ma} · ${k.nhan_trang_thai}`],
  };
  return (
    <g
      data-khoi-lon={k.ma}
      data-so-khoi={soKhoi(k.khoi_lon)}
      data-kieu={kieu}
      role="img"
      tabIndex={0}
      aria-label={`Khối ${soKhoi(k.khoi_lon)}: ${k.tieu_de}, ${k.nhan_trang_thai}`}
      transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
      {...suKien(g)}
    >
      <circle
        r={r}
        // 20.3: Đang làm/Chờ kiểm chứng viền đậm; còn lại (chưa tới) nét đứt.
        strokeWidth={kieu === 'dang_lam' ? 3 : kieu === 'chua_toi' ? 2 : 0}
        strokeDasharray={kieu === 'chua_toi' ? '4 3' : undefined}
        className={LOP_KHOI[kieu]}
      />
      <text
        textAnchor="middle"
        dy="0.35em"
        fontSize={12}
        fontWeight={700}
        className={kieu === 'chua_toi' ? 'fill-chu-mo' : 'fill-nen'}
      >
        {soKhoi(k.khoi_lon)}
      </text>
      <text x={ben * (r + 7)} textAnchor={ben > 0 ? 'start' : 'end'} fontSize={11} className="fill-chu">
        <tspan x={ben * (r + 7)} y={-2} fontWeight={kieu === 'dang_lam' ? 700 : 500}>
          {catChu(k.tieu_de, 24)}
        </tspan>
        <tspan x={ben * (r + 7)} y={12} fontSize={9.5} className="fill-chu-mo">
          {NHAN_KIEU_KHOI[kieu]}
          {kieu === 'dang_lam' && k.doi !== null ? ` · ${nhanDoi(k.doi)}` : ''}
        </tspan>
      </text>
      <title>{g.dong.join(' — ')}</title>
    </g>
  );
}

/* ------------------------------------------------------------------ *
 * Thẻ 3 làn — 20.4
 * ------------------------------------------------------------------ */

function TheBaLan({
  ds,
  ten_chu,
  bay_gio,
  loc,
  onBoLoc,
}: {
  ds: HangDuAn[];
  ten_chu: string;
  bay_gio: number;
  loc: string | null;
  onBoLoc: () => void;
}): React.JSX.Element {
  const lan = chiaLan(ds, loc);
  const nhom_goi_y = useMemo(() => cacNhom(ds), [ds]);
  return (
    <div data-o="the-ba-lan" className="flex min-w-0 flex-1 flex-col gap-3">
      {loc === null ? null : (
        <div data-o="dang-loc" className="flex flex-wrap items-center gap-2">
          <span className={LOP_CHU_PHU}>
            Đang lọc mảng: <span className="font-medium text-chu">{loc}</span>
          </span>
          <button type="button" data-nut="bo-loc-mang" onClick={onBoLoc} className={`rounded px-2 py-0.5 text-xs ${NUT_PHU}`}>
            {NHAN_BO_LOC_MANG}
          </button>
        </div>
      )}
      {LAN.map((l) => (
        <section key={l.ma} data-lan={l.ma} aria-label={l.nhan} className="flex min-w-0 flex-col gap-2">
          <h3 className={LOP_TIEU_DE_NHO}>
            {l.nhan} · <span data-so-the="co">{lan[l.ma].length}</span>
          </h3>
          {lan[l.ma].length === 0 ? (
            <p className={LOP_CAU_CHO}>{CAU_LAN_RONG}</p>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-2">
              {lan[l.ma].map((d) => (
                <TheDuAn key={d.id} d={d} ten_chu={ten_chu} bay_gio={bay_gio} nhom_goi_y={nhom_goi_y} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function TheDuAn({
  d,
  ten_chu,
  bay_gio,
  nhom_goi_y,
}: {
  d: HangDuAn;
  ten_chu: string;
  bay_gio: number;
  nhom_goi_y: readonly string[];
}): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <article
      // `data-du-an` giữ khoá cũ của khối Dự án (d.317) cho các ca nghiệm thu đọc chấm sức sống.
      data-du-an={d.ma}
      data-dang-day={d.dang_day ? 'co' : 'khong'}
      onClick={(e) => {
        // Bấm thẻ ⇒ bảng việc của dự án (20.4); link bên trong giữ đích riêng.
        if ((e.target as Element).closest('a, button') !== null) return;
        void navigate(duongDuAn(d.ma));
      }}
      className={`flex min-w-0 cursor-pointer flex-col gap-2 p-3 text-sm ${LOP_THE}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChamSucSong suc_song={d.suc_song} />
        <Link to={duongDuAn(d.ma)} title={d.ten} data-o="ten" className="min-w-0 truncate font-medium text-chu hover:underline">
          {tenHien(d)}
        </Link>
        <span data-o="uu-tien" className={`ml-auto shrink-0 ${LOP_CHU_PHU}`}>
          Ưu tiên {d.uu_tien}
        </span>
      </div>
      <dl className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
        <dt className={LOP_CHU_PHU}>Người cầm</dt>
        <dd data-o="nguoi-cam" className="min-w-0 truncate text-chu">
          {d.quan_ly_ten ?? ten_chu}
        </dd>

        <dt className={LOP_CHU_PHU}>Đang làm</dt>
        <dd data-o="dang-lam" className="flex min-w-0 items-center gap-1.5">
          {d.viec_noi_bat !== null ? (
            <>
              <Link to={duongTicket(d.viec_noi_bat.ma)} className="ma-ticket shrink-0 hover:text-chu">
                {d.viec_noi_bat.ma}
              </Link>
              <span data-noi-bat={d.viec_noi_bat.ma} className="truncate text-chu">
                {d.viec_noi_bat.tieu_de}
              </span>
            </>
          ) : d.suc_song === 'trang' ? (
            // Mục 2 d.74: ⚪ hiện chữ "Dự án không chạy".
            <span data-khong-chay="co" className={LOP_CHU_PHU}>
              {CAU_DU_AN_KHONG_CHAY}
            </span>
          ) : (
            <span className="text-chu-mo">{O_TRONG}</span>
          )}
        </dd>

        <dt className={LOP_CHU_PHU}>Chờ Chủ</dt>
        <dd data-o="cho-chu" className="min-w-0 truncate">
          {d.can_chu_cho_moi_nhat === null ? (
            <span className="text-chu-mo">{CAU_KHONG_CHO_TUY}</span>
          ) : (
            <Link
              to={duongMucCanChu(d.can_chu_cho_moi_nhat.ma)}
              data-muc-cho={d.can_chu_cho_moi_nhat.ma}
              className={LOP_LIEN_KET}
            >
              {d.can_chu_cho_moi_nhat.tieu_de}
            </Link>
          )}
        </dd>

        <dt className={LOP_CHU_PHU}>Mốc tới</dt>
        <dd data-o="moc-toi" className="min-w-0 truncate text-chu">
          {d.moc_toi === null ? (
            <span className="text-chu-mo">{O_TRONG}</span>
          ) : (
            <>
              <span className="ma-ticket">{soKhoi(d.moc_toi.khoi_lon)}</span> {d.moc_toi.tieu_de}
            </>
          )}
        </dd>
      </dl>
      {d.khoi_tong > 0 ? <HillChart d={d} /> : null}
      {/* Thanh công cụ (20.8): đổi ưu tiên / trạng thái / nhóm ngay trên thẻ. */}
      <ThanhCongCuDuAn<TongQuan>
        project_id={d.id}
        ten={d.ten}
        du_an={d}
        dat_boi={d.dat_boi}
        bay_gio={bay_gio}
        khoa={KHOA_TONG_QUAN}
        lay={layTrongTongQuan}
        ap={apTongQuan}
        nhom_goi_y={nhom_goi_y}
      />
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Hill Chart — 20.4
 * ------------------------------------------------------------------ */

export function HillChart({ d }: { d: HangDuAn }): React.JSX.Element {
  const cham = khoiTrenDoi(d.khoi_lon);
  return (
    <div data-hill="co" className="flex min-w-0 flex-col gap-1">
      <svg
        viewBox={`0 0 ${String(DOI.rong)} ${String(DOI.cao)}`}
        role="img"
        aria-label={`Hill Chart của ${d.ten}`}
        className="block h-auto w-full max-w-full"
      >
        <line x1={DOI.rong / 2} y1={8} x2={DOI.rong / 2} y2={54} strokeDasharray="2 3" className="stroke-neutral-300" />
        <path d={duongDoi()} fill="none" strokeWidth={1.5} className="stroke-neutral-400" />
        {cham.map((k) => {
          const p = diemDoi(k.doi);
          return (
            <circle
              key={k.id}
              data-cham-doi={k.ma}
              data-doi={String(k.doi)}
              cx={p.x.toFixed(1)}
              cy={p.y.toFixed(1)}
              r={5}
              strokeWidth={2}
              className="fill-canh stroke-nen"
            >
              <title>{`${soKhoi(k.khoi_lon)} · ${k.tieu_de} · ${nhanDoi(k.doi)}`}</title>
            </circle>
          );
        })}
      </svg>
      {cham.length === 0 ? null : (
        <ul data-ds="nhan-doi" className="flex min-w-0 flex-col">
          {cham.map((k) => (
            <li key={k.id} data-nhan-doi={k.ma} className={`truncate ${LOP_CHU_PHU}`}>
              <span className="ma-ticket">{soKhoi(k.khoi_lon)}</span> {k.tieu_de} ·{' '}
              <span data-o="nhan-doi">{nhanDoi(k.doi)}</span>
            </li>
          ))}
        </ul>
      )}
      <p data-o="tien-do-khoi" className={LOP_CHU_MO_HON}>
        {d.khoi_xong}/{d.khoi_tong} khối xong
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dải "Khu vực duy trì · n" — 20.2
 * ------------------------------------------------------------------ */

function DaiDuyTri({ ds }: { ds: HangDuAn[] }): React.JSX.Element {
  return (
    <div data-dai-duy-tri="co" role="group" aria-label={nhanDaiDuyTri(ds.length)} className="flex min-w-0 flex-col gap-2">
      <h3 className={LOP_TIEU_DE_NHO}>{nhanDaiDuyTri(ds.length)}</h3>
      {ds.length === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_CHUA_CO_DUY_TRI}</p>
      ) : (
        <ul className="flex min-w-0 flex-wrap gap-2">
          {ds.map((d) => (
            <li key={d.id} className="min-w-0 max-w-full">
              <Link
                to={duongDuAn(d.ma)}
                data-chip-duy-tri={d.ma}
                title={d.ten}
                className={`max-w-full hover:text-chu ${LOP_CHIP}`}
              >
                {/* 20.2: chấm xanh bình thường, vàng khi có Cần Chủ Chờ. */}
                <span
                  aria-hidden="true"
                  data-cham={d.co_can_chu_cho ? 'vang' : 'xanh'}
                  className={`inline-block size-2 shrink-0 rounded-full ${d.co_can_chu_cho ? 'bg-canh' : 'bg-tot'}`}
                />
                <span className="truncate">{tenHien(d)}</span>
                {d.co_can_chu_cho ? <span className="sr-only">(có mục Cần Chủ Chờ)</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
