/**
 * **Báo cáo** (`/bao-cao`) — SPEC mục 11 d.322–336, mục 14 d.392.
 *
 * | Vế SPEC | Ở đâu |
 * |---|---|
 * | d.322 "xem trên web" | chính trang này; mục sidebar đã có ở `vo/muc-sidebar.ts` |
 * | d.336 "lưu theo **ngày**, **xem lại được**" | ô chọn ngày + chọn sáng/tối, dựng từ `GET /v1/bao-cao` |
 * | d.336 "**xuất ra markdown được**" | nút `NHAN_SAO_MD` — chép `noi_dung_md` của máy chủ |
 * | d.323–328 sáu vế của báo cáo sáng | `VeSang` |
 * | d.331–334 bốn vế của handoff tối | `VeToi` |
 * | d.324 "chưa ghi thì để trống kèm chữ 'chưa có đề xuất'" | `CAU_CHUA_CO_DE_XUAT` |
 * | d.331 "đạt hay chưa" | `dat` của từng trọng tâm — **máy chủ dẫn xuất** |
 * | d.412 thời gian tương đối, rê chuột thấy giờ VN | `Moc` (mốc = `tao_luc`) |
 *
 * ## Trang này KHÔNG tính dẫn xuất nào, và KHÔNG dựng lại markdown
 *
 * `ngay` (múi giờ nghiệp vụ 19.12 câu 60), `dat` của mỗi trọng tâm, mọi nhãn
 * tiếng Việt, **và cả chữ markdown** tới **đã tính** từ máy chủ. Dựng lại markdown
 * ở client sẽ là một đường dựng chữ **thứ hai** cho cùng một báo cáo, nên bản chủ
 * chép đi sẽ khác bản đã lưu — xem khối "Xuất ra markdown không cần một bộ chuyển
 * đổi thứ hai" ở đầu `@baton/shared/bao-cao.ts`.
 *
 * ## Không có nút "sinh lại báo cáo"
 *
 * Báo cáo sinh bằng **Cron 07:30 / 20:00** (d.322, d.330), và một dòng `bao_cao`
 * là **bất biến** (trigger của migration 0020). Một nút "sinh lại" sẽ là một đường
 * ghi thứ hai cho cùng dữ liệu, và nó không sinh lại được gì — khoá chính của bảng
 * chặn. Sự vắng mặt đó là **nội dung**; có một ca test ghim nó.
 *
 * ## Mức làm của lượt này
 *
 * Giữ **gọn**, đúng phạm vi brief: chọn ngày, chọn sáng/tối, hiện các vế, một nút
 * "Sao markdown". Danh sách ngày phân trang keyset: nút "Xem thêm" nối trang kế
 * (`cursor_sau` của máy chủ) vào cuối danh sách, ẩn khi hết; lỗi mạng ở trang sau
 * giữ nguyên danh sách và đổi nút thành "Thử lại". **Chưa có**: cuộn vô hạn tự động.
 *
 * ## Ô ghi 3 trọng tâm + khối "hiện hành" (BAT-11, `cau-hoi-spec.md` #147)
 *
 * Báo cáo sáng là bản chụp bất biến lúc 07:30, nên bộ chủ ghi sau đó **không** vào
 * đó. Ô `OGhiTrongTam` ghi qua `POST /v1/trong-tam`; bản chụp **không đổi**. Khi
 * xem báo cáo sáng của HÔM NAY (ngày do máy chủ báo, không tính ở đây) mà bộ sống
 * khác bản chụp, `KhoiTrongTamHienHanh` hiện thêm bộ sống ngay dưới mục 2.
 */

import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ghiTrongTam,
  layBaoCao,
  layDanhSachBaoCao,
  layManHinhTicket,
  layTrongTamSong,
  LoiApi,
  type MucTrongTamSong,
  type TrongTamSong,
  type BaoCao,
  type DuLieuBaoCaoSang,
  type DuLieuBaoCaoToi,
  type HangBaoCao,
  type LoaiBaoCao,
  type MucTrongTamBaoCao,
  type ViecBaoCao,
} from '../api';
import { NHIP_LAM_MOI, useNhipLamMoi } from '../lam-moi';
import { lamMoiTheoSo } from '../ghi-lac-quan';
import { DauLamMoi } from '../vo/dau-lam-moi';
import {
  LOP_CAU_CHO,
  LOP_CAU_LOI,
  LOP_CHIP_CANH,
  LOP_CHU_MO_HON,
  LOP_CHU_PHU,
  LOP_DONG,
  LOP_DONG_NHIEU_TANG,
  LOP_DS_DONG,
  LOP_HANG_TIEU_DE,
  LOP_O_NHAP,
  LOP_THE,
  LOP_TIEU_DE_MUC,
  LOP_TIEU_DE_NHO,
  LOP_TIEU_DE_TRANG,
  LOP_VUNG_TRANG,
  NUT_MO_KHI_DISABLED,
  NUT_PHU,
} from '../vo/lop-nut';
import { useToast } from '../vo/toast';
import { Moc } from './tong-quan';
import { TrangThaiTai } from './doi-agent';

/** Tiêu đề trang — **cùng chữ** với nhãn sidebar của d.392. */
export const TEN_TRANG_BAO_CAO = 'Báo cáo';
export const CAU_DANG_TAI_BAO_CAO = 'Đang tải báo cáo…';

/**
 * Chữ hiện khi **chưa có báo cáo nào**.
 *
 * Nói thẳng *vì sao*: hai báo cáo sinh bằng Cron lúc 07:30 và 20:00 (d.322,
 * d.330), nên một workspace vừa dựng xong **chưa có gì** là bình thường — và một
 * trang trống không nói điều đó trông y như một lỗi tải.
 */
export const CAU_CHUA_CO_BAO_CAO =
  'Chưa có báo cáo nào. Baton tự sinh báo cáo sáng lúc 07:30 và handoff tối lúc 20:00.';

/** d.324 — **chữ của SPEC**, không chữ tự do. */
export const CAU_CHUA_CO_DE_XUAT = 'chưa có đề xuất';

/** Chữ hiện khi một vế không có dòng nào. */
export const CAU_KHONG_CO_GI = 'không có';

export const NHAN_SAO_MD = 'Sao markdown';
export const CAU_DA_SAO_MD = 'Đã sao markdown của báo cáo này.';
export const CAU_SAO_MD_TRUOT = 'Trình duyệt không cho sao vào bộ nhớ tạm.';

export const NHAN_XEM_THEM = 'Xem thêm';
export const NHAN_THU_LAI = 'Thử lại';
export const CAU_LOI_XEM_THEM = 'Không tải được báo cáo cũ hơn.';

/** Khoá danh sách ngày — tách khỏi `['bao-cao', ngay, loai]` của một báo cáo. */
const KHOA_DS_BAO_CAO = ['bao-cao', 'ds'] as const;

export const NHAN_CHON_NGAY = 'Ngày';
export const NHAN_CHON_LOAI = 'Báo cáo';

/** Nhãn tiếng Việt của hai loại — **đúng chữ SPEC** d.322 và d.330. */
export const NHAN_LOAI_BAO_CAO: Record<LoaiBaoCao, string> = {
  sang: 'Báo cáo sáng',
  toi: 'Handoff tối',
};

/** Tiêu đề từng vế — **chữ của SPEC** d.323–328. */
export const VE_SANG = {
  can_chu: 'Cần Chủ (đọc trước)',
  trong_tam: 'Đề xuất 3 việc trọng tâm hôm nay',
  hom_qua: 'Hôm qua đã xong',
  dang_chay: 'Đang chạy',
  rui_ro: 'Rủi ro và lệch',
  quyet_dinh: 'Quyết định mới trong Nhật ký',
} as const;

/** Tiêu đề từng vế — **chữ của SPEC** d.331–334. */
export const VE_TOI = {
  trong_tam: '3 trọng tâm hôm nay: đạt hay chưa',
  du_an: 'Trạng thái từng dự án',
  chuyen_sang_mai: 'Chuyển sang mai',
  can_chu_moi: 'Cần Chủ mới phát sinh',
} as const;

/* ================================================================== *
 * 1. Hàm thuần — chọn báo cáo nào đang xem
 * ================================================================== */

/**
 * Các ngày có trong danh sách, **giữ thứ tự máy chủ** (mới nhất trước) và bỏ
 * trùng: một ngày có tới hai dòng (sáng + tối), nhưng ô chọn ngày chỉ cần một.
 *
 * Hàm thuần, xuất ra để có test riêng: nó là chỗ một phép `Set` vô tình **mất thứ
 * tự** sẽ làm ô chọn ngày nhảy lung tung mà DOM vẫn trông bình thường.
 */
export function ngayCoBaoCao(items: readonly HangBaoCao[]): string[] {
  const ra: string[] = [];
  for (const h of items) if (!ra.includes(h.ngay)) ra.push(h.ngay);
  return ra;
}

/** Các loại báo cáo **có thật** của một ngày — một ngày có thể chỉ có báo cáo sáng. */
export function loaiCuaNgay(items: readonly HangBaoCao[], ngay: string): LoaiBaoCao[] {
  return (['sang', 'toi'] as LoaiBaoCao[]).filter((l) =>
    items.some((h) => h.ngay === ngay && h.loai === l),
  );
}

/* ================================================================== *
 * 2. Trang
 * ================================================================== */

export function TrangBaoCao(): React.JSX.Element {
  const ds = useInfiniteQuery({
    // Khoá riêng `['bao-cao', 'ds']`: dữ liệu là `InfiniteData`, khác hình với
    // `['bao-cao', ngay, loai]` của một báo cáo, nên không được dùng chung khoá.
    queryKey: KHOA_DS_BAO_CAO,
    queryFn: ({ pageParam }) => layDanhSachBaoCao(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (trang) => trang.cursor_sau ?? undefined,
    // d.410: hai báo cáo sinh bằng Cron (tức **không do chủ**), nên danh sách đổi
    // mà không có cú bấm nào — đúng ca mà chu kỳ làm mới tồn tại để phủ.
    ...NHIP_LAM_MOI,
  });
  /*
   * **Chỉ** khoá danh sách ngày. Query chi tiết một báo cáo (`MotBaoCao`) cố ý
   * không có nhịp — một dòng `bao_cao` là **bất biến** — nên nó cũng không được
   * làm mới khi chủ quay lại tab: xem khối ghi chú ở `MotBaoCao` dưới.
   */
  const { hien_dau } = useNhipLamMoi(ds.isFetching, [KHOA_DS_BAO_CAO]);

  const [ngay, datNgay] = useState<string | null>(null);
  const [loai, datLoai] = useState<LoaiBaoCao | null>(null);

  const items = ds.data?.pages.flatMap((p) => p.items) ?? [];
  const ngay_co = ngayCoBaoCao(items);

  /*
   * Chọn mặc định **báo cáo mới nhất** khi danh sách vừa về, và chỉ khi chủ chưa
   * chọn gì. Không đặt trong `queryFn` hay trong thân component: một `setState`
   * thẳng trong thân là một vòng render vô hạn.
   */
  useEffect(() => {
    if (ngay !== null || items.length === 0) return;
    const dau = items[0];
    if (dau === undefined) return;
    datNgay(dau.ngay);
    datLoai(dau.loai);
  }, [items, ngay]);

  const loai_co = ngay === null ? [] : loaiCuaNgay(items, ngay);
  const loai_xem = loai !== null && loai_co.includes(loai) ? loai : (loai_co[0] ?? null);

  return (
    <div className={LOP_VUNG_TRANG}>
      {/* Dấu làm mới **trong** hàng tiêu đề — nếp chung, xem `trang/tong-quan.tsx`. */}
      <div className={LOP_HANG_TIEU_DE}>
        <h1 className={LOP_TIEU_DE_TRANG}>{TEN_TRANG_BAO_CAO}</h1>
        <DauLamMoi hien={hien_dau} />
      </div>

      <OGhiTrongTam />

      {ds.data === undefined ? (
        <TrangThaiTai q={ds} cau_dang_tai={CAU_DANG_TAI_BAO_CAO} />
      ) : items.length === 0 ? (
        <p data-o="chua-co" className={LOP_CAU_CHO}>
          {CAU_CHUA_CO_BAO_CAO}
        </p>
      ) : (
        <>
          <ThanhChon
            ngay_co={ngay_co}
            loai_co={loai_co}
            ngay={ngay}
            loai={loai_xem}
            datNgay={(v) => {
              datNgay(v);
              // Đổi ngày thì **giữ loại đang xem** nếu ngày mới có nó; `loai_xem`
              // ở trên tự rơi về loại có thật, nên không cần đoán ở đây.
              datLoai(loai_xem);
            }}
            datLoai={datLoai}
          />
          {ds.hasNextPage ? (
            <div data-o="xem-them" className="flex flex-wrap items-center gap-2 text-sm">
              {ds.isFetchNextPageError ? (
                <p role="alert" className={LOP_CAU_LOI}>
                  {CAU_LOI_XEM_THEM}
                </p>
              ) : null}
              <button
                type="button"
                data-nut={ds.isFetchNextPageError ? 'thu-lai-xem-them' : 'xem-them'}
                disabled={ds.isFetchingNextPage}
                onClick={() => {
                  void ds.fetchNextPage();
                }}
                className={`rounded px-3 py-1 ${NUT_PHU} ${NUT_MO_KHI_DISABLED}`}
              >
                {ds.isFetchNextPageError ? NHAN_THU_LAI : NHAN_XEM_THEM}
              </button>
            </div>
          ) : null}
          {ngay === null || loai_xem === null ? null : (
            <MotBaoCao ngay={ngay} loai={loai_xem} />
          )}
        </>
      )}
    </div>
  );
}

/* ================================================================== *
 * 2b. Ô ghi 3 việc trọng tâm + khối "hiện hành" — d.324, #147
 * ================================================================== */

export const TIEU_DE_O_TRONG_TAM = '3 việc trọng tâm hôm nay';
export const NHAN_LUU_TRONG_TAM = 'Lưu';
export const NHAN_XOA_HET_TRONG_TAM = 'Xoá hết';
export const CAU_DA_LUU_TRONG_TAM = 'Đã lưu 3 việc trọng tâm hôm nay.';
export const CAU_DA_XOA_TRONG_TAM = 'Đã bỏ đề xuất trọng tâm hôm nay.';
export const TIEU_DE_KHOI_HIEN_HANH =
  'Trọng tâm hiện hành (sửa sau khi báo cáo sinh lúc 07:30)';

const KHOA_TRONG_TAM = ['trong-tam'] as const;

/** Một dòng đang gõ: mã ticket (`BAT-12`) + ghi chú. */
export interface DongGoTrongTam {
  ma: string;
  ghi_chu: string;
}

/** Bộ sống → đúng 3 dòng gõ (dòng thiếu để rỗng). */
export function dongGoTuBoSong(muc: readonly MucTrongTamSong[]): DongGoTrongTam[] {
  return [0, 1, 2].map((i) => ({ ma: muc[i]?.ma ?? '', ghi_chu: muc[i]?.ghi_chu ?? '' }));
}

/**
 * Bộ sống có KHÁC bản chụp không — so `ma` + `ghi_chu` theo thứ tự. Hàm thuần;
 * không so tiêu đề/trạng thái (đó là dữ liệu của ticket, không của bộ trọng tâm).
 */
export function boTrongTamKhac(
  chup: readonly { ma: string; ghi_chu: string | null }[],
  song: readonly { ma: string; ghi_chu: string | null }[],
): boolean {
  if (chup.length !== song.length) return true;
  return chup.some((c, i) => c.ma !== song[i]?.ma || (c.ghi_chu ?? null) !== (song[i]?.ghi_chu ?? null));
}

function OGhiTrongTam(): React.JSX.Element {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: KHOA_TRONG_TAM, queryFn: layTrongTamSong });
  // `null` = chưa sửa gì ⇒ hiện đúng bộ của máy chủ. Lưu xong HOẶC bị từ chối thì
  // về `null`: "hoàn lại" (d.418) là bỏ bản gõ và hiện lại bộ máy chủ đang giữ.
  const [ban_go, datBanGo] = useState<DongGoTrongTam[] | null>(null);
  const dong = ban_go ?? dongGoTuBoSong(q.data?.muc ?? []);

  const ghi = useMutation({
    mutationFn: async (ds: DongGoTrongTam[]) => {
      const muc: { ticket_id: string; ghi_chu?: string }[] = [];
      for (const d of ds) {
        const ma = d.ma.trim().toUpperCase();
        if (ma === '') continue;
        // Mã chưa đổi so với bộ máy chủ giữ ⇒ dùng lại id, khỏi tra.
        const co = q.data?.muc.find((m) => m.ma === ma);
        const ticket_id = co !== undefined ? co.ticket_id : (await layManHinhTicket(ma)).ticket.id;
        const ghi_chu = d.ghi_chu.trim();
        muc.push(ghi_chu === '' ? { ticket_id } : { ticket_id, ghi_chu });
      }
      await ghiTrongTam(muc);
      return muc.length;
    },
    onSuccess: async (so) => {
      datBanGo(null);
      await lamMoiTheoSo(qc, { queryKey: KHOA_TRONG_TAM });
      toast.bao(so === 0 ? CAU_DA_XOA_TRONG_TAM : CAU_DA_LUU_TRONG_TAM);
    },
    onError: (loi: unknown) => {
      datBanGo(null);
      toast.bao(loi instanceof LoiApi ? loi.message : String((loi as Error).message));
    },
  });

  function sua(i: number, v: Partial<DongGoTrongTam>): void {
    datBanGo(dong.map((d, j) => (j === i ? { ...d, ...v } : d)));
  }

  return (
    <section
      data-o="o-trong-tam"
      aria-label={TIEU_DE_O_TRONG_TAM}
      className={`flex flex-col gap-2 p-3 ${LOP_THE}`}
    >
      <h2 className={LOP_TIEU_DE_MUC}>{TIEU_DE_O_TRONG_TAM}</h2>
      {q.data === undefined ? (
        <TrangThaiTai q={q} cau_dang_tai={CAU_DANG_TAI_BAO_CAO} />
      ) : (
        <>
          {dong.map((d, i) => (
            <div key={i} className="flex flex-col gap-1 sm:flex-row">
              <input
                data-o={`tt-ma-${String(i + 1)}`}
                aria-label={`Mã ticket trọng tâm ${String(i + 1)}`}
                placeholder="Mã ticket, vd BAT-12"
                value={d.ma}
                onChange={(e) => {
                  sua(i, { ma: e.target.value });
                }}
                className={`font-mono sm:w-40 ${LOP_O_NHAP}`}
              />
              <input
                data-o={`tt-ghi-chu-${String(i + 1)}`}
                aria-label={`Ghi chú trọng tâm ${String(i + 1)}`}
                placeholder="Ghi chú (không bắt buộc)"
                value={d.ghi_chu}
                onChange={(e) => {
                  sua(i, { ghi_chu: e.target.value });
                }}
                className={`min-w-0 flex-1 ${LOP_O_NHAP}`}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-nut="luu-trong-tam"
              disabled={ghi.isPending}
              onClick={() => {
                ghi.mutate(dong);
              }}
              className={`rounded px-3 py-1 text-sm ${NUT_PHU} ${NUT_MO_KHI_DISABLED}`}
            >
              {NHAN_LUU_TRONG_TAM}
            </button>
            <button
              type="button"
              data-nut="xoa-het-trong-tam"
              disabled={ghi.isPending}
              onClick={() => {
                ghi.mutate([]);
              }}
              className={`rounded px-3 py-1 text-sm ${NUT_PHU} ${NUT_MO_KHI_DISABLED}`}
            >
              {NHAN_XOA_HET_TRONG_TAM}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Khối "hiện hành" dưới mục 2 của báo cáo sáng. Chỉ hiện khi (1) báo cáo là của
 * HÔM NAY — `ngay` của máy chủ trả trong `GET /v1/trong-tam`, không tính ở client —
 * và (2) bộ sống khác bản chụp. Bản chụp ở trên giữ nguyên.
 */
function KhoiTrongTamHienHanh({
  ngay,
  chup,
}: {
  ngay: string;
  chup: readonly MucTrongTamBaoCao[];
}): React.JSX.Element | null {
  const q = useQuery({ queryKey: KHOA_TRONG_TAM, queryFn: layTrongTamSong });
  const song: TrongTamSong | undefined = q.data;
  if (song === undefined || song.ngay !== ngay || !boTrongTamKhac(chup, song.muc)) return null;
  return (
    <Ve ten={TIEU_DE_KHOI_HIEN_HANH} rong={song.muc.length === 0} cau_rong={CAU_CHUA_CO_DE_XUAT}>
      <ol data-ds="trong-tam-hien-hanh" className={LOP_DS_DONG}>
        {song.muc.map((m) => (
          <li key={m.thu_tu} data-trong-tam-hien-hanh={m.ma} className={`flex-wrap ${LOP_DONG}`}>
            <span className="ma-ticket shrink-0">{m.ma}</span>{' '}
            <span className="min-w-0 break-words text-chu">{m.tieu_de}</span>
            {m.ghi_chu === null ? null : (
              <span className={`min-w-0 break-words ${LOP_CHU_PHU}`}> — {m.ghi_chu}</span>
            )}
          </li>
        ))}
      </ol>
    </Ve>
  );
}

/* ================================================================== *
 * 3. Chọn ngày và loại — d.336 "xem lại được"
 * ================================================================== */

function ThanhChon({
  ngay_co,
  loai_co,
  ngay,
  loai,
  datNgay,
  datLoai,
}: {
  ngay_co: readonly string[];
  loai_co: readonly LoaiBaoCao[];
  ngay: string | null;
  loai: LoaiBaoCao | null;
  datNgay: (v: string) => void;
  datLoai: (v: LoaiBaoCao) => void;
}): React.JSX.Element {
  return (
    <section aria-label="Chọn báo cáo" className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className={LOP_CHU_PHU}>{NHAN_CHON_NGAY}</span>
        <select
          data-chon="ngay"
          value={ngay ?? ''}
          onChange={(e) => {
            datNgay(e.target.value);
          }}
          className={LOP_O_NHAP}
        >
          {ngay_co.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LOP_CHU_PHU}>{NHAN_CHON_LOAI}</span>
        <select
          data-chon="loai"
          value={loai ?? ''}
          onChange={(e) => {
            datLoai(e.target.value as LoaiBaoCao);
          }}
          className={LOP_O_NHAP}
        >
          {loai_co.map((l) => (
            <option key={l} value={l}>
              {NHAN_LOAI_BAO_CAO[l]}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

/* ================================================================== *
 * 4. Một báo cáo
 * ================================================================== */

function MotBaoCao({ ngay, loai }: { ngay: string; loai: LoaiBaoCao }): React.JSX.Element {
  const q = useQuery({
    queryKey: ['bao-cao', ngay, loai],
    queryFn: () => layBaoCao(ngay, loai),
    /*
     * **Không** `refetchInterval`: một dòng `bao_cao` là **bất biến** (trigger của
     * migration 0020), nên tải lại nó mỗi chu kỳ là một lượt gọi không bao giờ đổi
     * kết quả. Danh sách ngày thì có `refetchInterval` — đó là thứ thật sự đổi.
     */
  });

  if (q.data === undefined) {
    return <TrangThaiTai q={q} cau_dang_tai={CAU_DANG_TAI_BAO_CAO} />;
  }
  return <Than bc={q.data} />;
}

function Than({ bc }: { bc: BaoCao }): React.JSX.Element {
  return (
    <article data-bao-cao={`${bc.ngay}/${bc.loai}`} className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3 border-b border-vien pb-3">
        <h2 className={LOP_TIEU_DE_MUC}>
          {bc.nhan_loai} — <span data-o="ngay">{bc.ngay}</span>
        </h2>
        <span className="text-xs">
          <Moc luc={bc.tao_luc} bay_gio={Date.now()} />
        </span>
        <NutSaoMd md={bc.noi_dung_md} />
      </header>

      {bc.du_lieu === null ? (
        /*
         * `du_lieu` không phân tích được (một dòng cũ, một bản lưu hỏng) thì vẫn
         * **xem lại được** qua chính chữ markdown — vế chính của d.336. Để trang
         * trắng ở đây là biến một lỗi dữ liệu thành một báo cáo đã mất.
         */
        <pre data-o="md-tho" className={`overflow-x-auto p-3 text-xs text-chu ${LOP_THE}`}>
          {bc.noi_dung_md}
        </pre>
      ) : bc.loai === 'sang' ? (
        <VeSang d={bc.du_lieu as DuLieuBaoCaoSang} />
      ) : (
        <VeToi d={bc.du_lieu as DuLieuBaoCaoToi} />
      )}
    </article>
  );
}

/**
 * **d.336 — "xuất ra markdown được".**
 *
 * Chép đúng `noi_dung_md` của máy chủ, không dựng lại gì. `navigator.clipboard`
 * không có (trình duyệt cũ, ngữ cảnh không an toàn) hoặc từ chối ⇒ một toast nói
 * thẳng, **không** một lỗi im lặng: chủ bấm nút rồi dán ra một thứ cũ là ca tệ
 * nhất ở đây.
 */
function NutSaoMd({ md }: { md: string }): React.JSX.Element {
  const toast = useToast();
  return (
    <button
      type="button"
      data-nut="sao-md"
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(md);
            toast.bao(CAU_DA_SAO_MD);
          } catch {
            toast.bao(CAU_SAO_MD_TRUOT);
          }
        })();
      }}
      className={`ml-auto rounded px-3 py-1 text-sm ${NUT_PHU}`}
    >
      {NHAN_SAO_MD}
    </button>
  );
}

/* ================================================================== *
 * 5. Các vế
 * ================================================================== */

/*
 * **Trình bày các vế (BAT-67, THIET-KE "Bảng và danh sách").** Mỗi danh sách là
 * `LOP_DS_DONG` (khung bo 8px, dòng ngăn viền mờ), mỗi dòng `LOP_DONG` +
 * `flex-wrap`: mã (`ma-ticket`) → tiêu đề chữ chính (`min-w-0 break-words`) →
 * phần phụ chữ phụ. Ở 375px phần dài xuống hàng thay vì tràn ngang. Chữ trong
 * dòng **giữ nguyên từng ký tự** (kể cả ngoặc, dấu `—`): chỉ bọc thêm `span`.
 *
 * **Không `IconTrangThai` trước mã:** thân báo cáo (`ViecBaoCao`,
 * `MucTrongTamBaoCao`) chỉ mang **nhãn** `nhan_trang_thai` của bản chụp, không mã
 * trạng thái — suy mã từ nhãn ở client là một phép dẫn xuất thứ hai mà đầu file
 * cấm. Có mã trong thân thì mới có icon.
 */

function Ve({
  ten,
  rong,
  cau_rong = CAU_KHONG_CO_GI,
  children,
}: {
  ten: string;
  rong: boolean;
  cau_rong?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section data-ve={ten} className="flex flex-col gap-2">
      <h3 className={LOP_TIEU_DE_NHO}>{ten}</h3>
      {rong ? <p className={LOP_CAU_CHO}>{cau_rong}</p> : children}
    </section>
  );
}

/** Lớp của một dòng vế: `LOP_DONG` biết xuống hàng (375px). */
const LOP_DONG_VE = `flex-wrap ${LOP_DONG}`;
/** Tiêu đề / nội dung dài trong dòng: co được, chuỗi liền thì ngắt. */
const LOP_CHU_DAI = 'min-w-0 break-words text-chu';

function DongViec({ v }: { v: ViecBaoCao }): React.JSX.Element {
  return (
    <li data-viec={v.ma} className={LOP_DONG_VE}>
      <span className="ma-ticket shrink-0">{v.ma}</span>{' '}
      <span className={LOP_CHU_DAI}>{v.tieu_de}</span>{' '}
      <span className={LOP_CHU_PHU}>({v.nhan_trang_thai})</span>
    </li>
  );
}

/** d.331 — "đạt hay chưa"; `dat` là **dẫn xuất của máy chủ**, không tính ở đây. */
function DsTrongTam({ ds }: { ds: readonly MucTrongTamBaoCao[] }): React.JSX.Element {
  return (
    <ol data-ds="trong-tam" className={LOP_DS_DONG}>
      {ds.map((m) => (
        <li key={m.thu_tu} data-trong-tam={m.ma} data-dat={m.dat ? 'co' : 'khong'} className={LOP_DONG_VE}>
          <span aria-hidden="true" className="shrink-0">
            {m.dat ? '☑' : '☐'}{' '}
          </span>
          <span className="ma-ticket shrink-0">{m.ma}</span>{' '}
          <span className={LOP_CHU_DAI}>{m.tieu_de}</span>{' '}
          <span className={LOP_CHU_PHU}>({m.nhan_trang_thai})</span>
          {m.ghi_chu === null ? null : (
            <span className={`min-w-0 break-words ${LOP_CHU_PHU}`}> — {m.ghi_chu}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Sáu vế của d.323–328, **đúng thứ tự SPEC**. */
function VeSang({ d }: { d: DuLieuBaoCaoSang }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <Ve ten={VE_SANG.can_chu} rong={false}>
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            Đang chờ: <span data-o="so-cho" className="tabular-nums">{d.can_chu.so_cho}</span> mục
          </p>
          {/* Không mục nào ⇒ không dựng khung rỗng (một khung viền không dòng nào). */}
          {d.can_chu.gap_nhat.length === 0 ? null : (
            <ul data-ds="can-chu-gap-nhat" className={LOP_DS_DONG}>
              {d.can_chu.gap_nhat.map((m) => (
                <li key={m.ma} data-muc={m.ma} className={LOP_DONG_VE}>
                  <span className={`shrink-0 ${LOP_CHU_PHU}`}>{m.nhan_muc}</span>{' '}
                  <span className="ma-ticket shrink-0">{m.ma}</span>{' '}
                  <span className={LOP_CHU_DAI}>{m.tieu_de}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Ve>

      {/* d.324 — rỗng thì để trống **kèm chữ "chưa có đề xuất"**. */}
      <Ve ten={VE_SANG.trong_tam} rong={d.trong_tam.length === 0} cau_rong={CAU_CHUA_CO_DE_XUAT}>
        <DsTrongTam ds={d.trong_tam} />
      </Ve>
      <KhoiTrongTamHienHanh ngay={d.ngay} chup={d.trong_tam} />

      <Ve ten={VE_SANG.hom_qua} rong={d.hom_qua.viec.length === 0}>
        <div className="flex flex-col gap-1">
          {/* Ngày hôm qua hiện ra: "hôm qua" là một **ngày dương lịch**, không
              một cửa sổ trượt 24 giờ (xem `doc-bao-cao.ts`, #118). */}
          <p data-o="ngay-hom-qua" className={LOP_CHU_MO_HON}>
            {d.hom_qua.ngay}
          </p>
          <ul data-ds="hom-qua" className={LOP_DS_DONG}>
            {d.hom_qua.viec.map((v) => (
              <DongViec key={v.ma} v={v} />
            ))}
          </ul>
        </div>
      </Ve>

      <Ve ten={VE_SANG.dang_chay} rong={d.dang_chay.length === 0}>
        <ul data-ds="dang-chay" className={LOP_DS_DONG}>
          {d.dang_chay.map((v) => (
            <li key={`${v.ma}-${v.agent_id ?? 'khong'}`} data-viec={v.ma} className={LOP_DONG_VE}>
              <span className="ma-ticket shrink-0">{v.ma}</span>{' '}
              <span className={LOP_CHU_DAI}>{v.tieu_de}</span>{' '}
              <span className={`min-w-0 break-words ${LOP_CHU_PHU}`}>
                ({v.nhan_trang_thai}) — {v.agent_id ?? 'không ai cầm'}
              </span>
            </li>
          ))}
        </ul>
      </Ve>

      {/*
       * Nhãn loại rủi ro là **chip cảnh báo** (`LOP_CHIP_CANH`, cùng họ lý do Cần
       * chú ý — THIET-KE "Chip"), không chữ `canh` trần. Dấu `:` giữ nguyên, dính
       * ngay sau chip (cùng một `span` không khoảng cách).
       */}
      <Ve ten={VE_SANG.rui_ro} rong={d.rui_ro_va_lech.length === 0}>
        <ul data-ds="rui-ro" className={LOP_DS_DONG}>
          {d.rui_ro_va_lech.map((x, i) => (
            <li key={`${x.nhan_loai}-${String(i)}`} data-rui-ro={x.nhan_loai} className={LOP_DONG_VE}>
              <span className="inline-flex shrink-0 items-center">
                <span data-o="loai-rui-ro" className={LOP_CHIP_CANH}>
                  {x.nhan_loai}
                </span>
                :
              </span>{' '}
              <span className={LOP_CHU_DAI}>{x.chi_tiet}</span>
            </li>
          ))}
        </ul>
      </Ve>

      {/* Dòng nhiều tầng (như Nhật ký): người ở hàng trên chữ phụ, quyết định ở dưới. */}
      <Ve ten={VE_SANG.quyet_dinh} rong={d.quyet_dinh_moi.length === 0}>
        <ul data-ds="quyet-dinh" className={LOP_DS_DONG}>
          {d.quyet_dinh_moi.map((q, i) => (
            <li key={`${q.nguoi}-${String(i)}`} data-quyet-dinh={String(i)} className={LOP_DONG_NHIEU_TANG}>
              <span className={LOP_CHU_PHU}>{q.nguoi}</span>{' '}
              <span className="break-words text-chu">
                {q.quyet_dinh}
                <span className="text-chu-mo"> — vì sao: {q.vi_sao}</span>
              </span>
            </li>
          ))}
        </ul>
      </Ve>
    </div>
  );
}

/** Bốn vế của d.331–334, **đúng thứ tự SPEC**. */
function VeToi({ d }: { d: DuLieuBaoCaoToi }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <Ve ten={VE_TOI.trong_tam} rong={d.trong_tam.length === 0} cau_rong={CAU_CHUA_CO_DE_XUAT}>
        <DsTrongTam ds={d.trong_tam} />
      </Ve>

      <Ve ten={VE_TOI.du_an} rong={d.du_an.length === 0}>
        <ul data-ds="du-an" className={LOP_DS_DONG}>
          {d.du_an.map((x) => (
            <li key={x.ma} data-du-an={x.ma} className={LOP_DONG_VE}>
              <span className="ma-ticket shrink-0">{x.ma}</span>{' '}
              <span className={LOP_CHU_DAI}>{x.ten}</span>{' '}
              <span className={`min-w-0 break-words ${LOP_CHU_PHU}`}>
                — {x.nhan_suc_song}; Đang làm <span className="tabular-nums">{x.so_dang_lam}</span>, Chờ kiểm chứng{' '}
                <span className="tabular-nums">{x.so_cho_kiem_chung}</span>, Xong 24 giờ qua{' '}
                <span className="tabular-nums">{x.so_xong_24h}</span>
              </span>
            </li>
          ))}
        </ul>
      </Ve>

      <Ve ten={VE_TOI.chuyen_sang_mai} rong={d.chuyen_sang_mai.length === 0}>
        <ul data-ds="chuyen-sang-mai" className={LOP_DS_DONG}>
          {d.chuyen_sang_mai.map((v) => (
            <DongViec key={v.ma} v={v} />
          ))}
        </ul>
      </Ve>

      <Ve ten={VE_TOI.can_chu_moi} rong={d.can_chu_moi.length === 0}>
        <ul data-ds="can-chu-moi" className={LOP_DS_DONG}>
          {d.can_chu_moi.map((m) => (
            <li key={m.ma} data-muc={m.ma} className={LOP_DONG_VE}>
              <span className={`shrink-0 ${LOP_CHU_PHU}`}>{m.nhan_muc}</span>{' '}
              <span className="ma-ticket shrink-0">{m.ma}</span>{' '}
              <span className={LOP_CHU_DAI}>{m.tieu_de}</span>
            </li>
          ))}
        </ul>
      </Ve>
    </div>
  );
}
