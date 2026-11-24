/**
 * **Chi tiết ticket `/t/<MÃ>`** — SPEC mục 14 d.408–410, d.418, d.420, d.421, d.422.
 *
 * | Vế SPEC | Ở đâu trong file này |
 * |---|---|
 * | d.398 tiêu đề + mô tả, **sửa tại chỗ** | `OSuaTaiCho` |
 * | d.399 brief **8 mục gập được** | `KhoiBrief` |
 * | d.399 ticket con | `KhoiTicketCon` |
 * | d.399 **chuỗi lượt giao dạng dòng thời gian** | `DongThoiGianLuotGiao` |
 * | d.400 bằng chứng | `KhoiBangChung` |
 * | d.400 bình luận **xen lịch sử** (lịch sử thu gọn) | `KhoiBinhLuan`, `tronBinhLuanVaLichSu` |
 * | d.401 thuộc tính | `KhoiThuocTinh` |
 * | d.401 ticket liên quan **kể cả ticket điều phối** | `KhoiLienQuan` |
 * | d.401 **mục Cần Chủ liên quan** | `KhoiCanChu` (dùng lại `The` của trang Cần Chủ) |
 * | d.407 sửa hiện ngay, từ chối thì hoàn lại + toast | `useSuaTicket` |
 * | d.420 thay đổi của agent hiện trong 3 giây | `nhipLamMoi` (`src/lam-moi.ts`) |
 * | d.411 **dùng tốt ở 375px** | `lg:` cho hai cột, `data-hang="nut"` + `flex-wrap` |
 * | d.412 thời gian tương đối, rê chuột thấy giờ VN | `Luc` (mốc = `bay_gio` máy chủ) |
 *
 * ## Hai cột của d.398–401 xếp DỌC ở 375px
 *
 * d.411 kể thẳng "chi tiết ticket" trong danh sách phải dùng tốt ở 375px. Hai cột
 * cạnh nhau ở khổ đó là hai cột ~180px, tức mọi tiêu đề ticket bị cắt. Nên lưới
 * là `grid-cols-1 lg:grid-cols-3`: **một** cột trên điện thoại (trái rồi phải, đúng
 * thứ tự đọc của SPEC), ba cột từ `lg`. Cùng cách canh bằng **lớp** như trang Cần
 * Chủ (jsdom không có layout — xem ghi chú 375px ở `can-chu.tsx`).
 *
 * ## Không một dẫn xuất nào tính lại ở đây
 *
 * `nguoi_dang_cam` / `bac_nguoi_cam` / `cho_nghiem_thu` (19.1), `con_chua_ket`
 * (19.11), `la_dieu_phoi` (19.4), `khong_phan_hoi` của từng lượt (mục 5), `hash` 7
 * ký tự (d.320), `qua_han_gio` của mục Cần Chủ (19.8), mọi `nhan_*`: **đã tính** ở
 * `packages/api/src/doc-man-hinh-ticket.ts`. Ở đây chỉ vẽ.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import {
  LoiApi,
  MUC_BRIEF,
  layManHinhTicket,
  suaTicket,
  type BinhLuan,
  type DongLichSu,
  type LuotGiao,
  type ManHinhTicket,
  type TacGiaRa,
  type TicketDayDu,
} from '../api';
import { NHAN_BRIEF } from '../nhan-brief';
import { HopGiaoViec, NHAN_NUT_GIAO_VIEC } from '../vo/giao-viec';
import { nhipLamMoi, useNhipLamMoi } from '../lam-moi';
import {
  batDauGhiLacQuan,
  ketThucGhiLacQuan,
  lamMoiTheoSo,
  type VeGhiLacQuan,
} from '../ghi-lac-quan';
import { Markdown } from '../markdown';
import { DauLamMoi } from '../vo/dau-lam-moi';
import { IconTrangThai } from '../vo/icon';
import {
  LOP_CAU_CHO,
  LOP_CAU_LOI,
  LOP_CHIP,
  LOP_CHIP_CANH,
  LOP_O_NHAP,
  LOP_TIEU_DE_MUC,
  LOP_TIEU_DE_TRANG,
  NUT_CHINH,
  NUT_PHU,
} from '../vo/lop-nut';
import { useTenAgent, type TraTenAgent } from '../vo/ten-agent';
import { gioDayDu, thoiGianTuongDoi } from '../thoi-gian';
import { duongTicket } from '../vo/muc-sidebar';
import { useToast } from '../vo/toast';
import { The, NHAN_LOAI as NHAN_LOAI_CAN_CHU } from './can-chu';
import { NHAP_RONG } from './can-chu';

export const CAU_DANG_TAI_TICKET = 'Đang tải ticket…';
export const NHAN_LUU = 'Lưu';
export const NHAN_HUY = 'Huỷ';
export const NHAN_SUA = 'Sửa';
export const CAU_CHUA_CO_MO_TA = 'Chưa có mô tả.';
export const CAU_KHONG_CO_TICKET_CON = 'Không có ticket con.';
export const CAU_KHONG_CO_LUOT_GIAO = 'Chưa có lượt giao nào.';
export const CAU_KHONG_CO_BANG_CHUNG = 'Chưa có bằng chứng nào.';
export const CAU_KHONG_CO_LIEN_QUAN = 'Không có ticket liên quan.';
export const CAU_KHONG_CO_CAN_CHU = 'Không có mục Cần Chủ nào đang chờ.';
export const NHAN_CHU = 'Chủ (chủ)';
/** Nhãn công tắc cờ "ticket không code" (migration 0027, T-31). */
export const NHAN_KHONG_CODE_TICKET = 'Ticket không code';
export const CAU_DU_AN_KHONG_CODE = 'Dự án đã đặt "không code" — cổng không code áp cho mọi ticket.';

/** Tiêu đề tám khối của d.398–401, **đúng chữ của SPEC**. */
export const TEN_KHOI = {
  brief: 'Brief',
  ticket_con: 'Ticket con',
  luot_giao: 'Chuỗi lượt giao',
  bang_chung: 'Bằng chứng',
  binh_luan: 'Bình luận',
  thuoc_tinh: 'Thuộc tính',
  lien_quan: 'Ticket liên quan',
  can_chu: 'Cần Chủ liên quan',
} as const;

/**
 * **Nhãn tám mục brief** — SPEC mục 5 (bảng brief). Bảng nằm ở `src/nhan-brief.ts`
 * (BAT-33: hộp giao việc dùng chung); xuất lại ở đây cho các chỗ đã nhập từ trang.
 */
export { NHAN_BRIEF };

/* ================================================================== *
 * 1. Trang
 * ================================================================== */

/**
 * **Trang** `/t/<MÃ>` — d.398. Vỏ mỏng quanh `ThanChiTietTicket`.
 *
 * Hai chỗ vẽ chi tiết ticket (trang này và **panel bên phải** của danh sách,
 * BAT-6 đợt 2) dùng **cùng một** thân: một bản thứ hai sẽ lệch ngay lần sửa đầu —
 * tám khối của d.398–401, ô sửa tại chỗ, brief gập được, dòng thời gian. Khác
 * nhau đúng một thứ: bề ngang (`hep`).
 */
export function TrangChiTietTicket({ ma }: { ma: string }): React.JSX.Element {
  return <ThanChiTietTicket ma={ma} />;
}

/**
 * Thân chi tiết ticket — tự tải thân của mình theo `ma`.
 *
 * `hep` = đang nằm trong một panel hẹp (≈420px) chứ không trên cả trang: lúc đó
 * **một cột**, vì `lg:grid-cols-3` đo theo **cửa sổ**, không theo panel, nên trên
 * một màn hình rộng nó sẽ xếp ba cột ~140px bên trong panel.
 *
 * Khoá truy vấn giống trang, nên mở panel rồi bấm "Mở toàn trang" **không** tải
 * lại: TanStack Query trả đúng thân đã có (d.419 — không màn hình chờ toàn trang).
 */
export function ThanChiTietTicket({
  ma,
  hep = false,
}: {
  ma: string;
  hep?: boolean;
}): React.JSX.Element {
  const khoa = useMemo(() => ['ticket', 'chi-tiet', ma] as const, [ma]);
  const qc_ct = useQueryClient();
  const q = useQuery({
    queryKey: khoa,
    queryFn: () => layManHinhTicket(ma),
    // BAT-27: nhịp tắt khi `useSuaTicket` đang ghi lạc quan vào khoá này.
    ...nhipLamMoi(qc_ct),
  });
  const { hien_dau } = useNhipLamMoi(q.isFetching, [khoa]);
  const sua = useSuaTicket();
  /*
   * BAT-33: hộp giao việc (d.415 `A` / nút "Giao việc") — `vo/giao-viec.tsx`.
   * Nhớ **mã thẻ** đã mở hộp, không một cờ trần: panel đổi thẻ (Back/Forward đổi
   * `?the=`, J/K) thì hộp **đóng** — không để hộp của thẻ cũ (agent + brief đã chọn)
   * đổi đích sang thẻ mới. Lần render đầu với `ma` mới đã ẩn hộp (`giao_ma !== t.ma`),
   * effect dưới xoá hẳn để quay lại thẻ cũ không mở lại hộp. Lượt đã gửi vẫn đi đúng
   * ticket cũ: đích nằm trong biến của `mutate`, mutation sống tiếp sau khi hộp tháo.
   */
  const [giao_ma, datGiaoMa] = useState<string | null>(null);
  const dongGiao = useCallback(() => {
    datGiaoMa(null);
  }, []);
  useEffect(() => {
    datGiaoMa(null);
  }, [ma]);

  if (q.data === undefined && q.isPending) {
    return (
      <p role="status" className={`p-4 sm:p-6 ${LOP_CAU_CHO}`}>
        {CAU_DANG_TAI_TICKET}
      </p>
    );
  }
  if (q.data === undefined) {
    return (
      <p role="alert" className={`p-4 sm:p-6 ${LOP_CAU_LOI}`}>
        {q.error instanceof LoiApi ? q.error.message : String(q.error)}
      </p>
    );
  }

  const mh = q.data;
  const t = mh.ticket;

  return (
    /*
     * **Một cột ở 375px, ba cột từ `lg`** — d.411. Cột phải đi **sau** cột trái
     * trong DOM, nên thứ tự đọc trên điện thoại đúng thứ tự SPEC kể (d.399–400
     * trước, d.401 sau).
     */
    <div
      data-o="chi-tiet-ticket"
      data-hep={hep ? 'co' : 'khong'}
      className={
        /*
         * Hệ thiết kế 29/10: cột chính để ĐỌC (tiêu đề, mô tả markdown, brief,
         * hoạt động); cột phải hẹp chứa thuộc tính dạng nhãn–giá trị, ngăn bằng
         * một viền mờ từ `lg`.
         */
        hep
          ? 'grid min-w-0 grid-cols-1 gap-6 p-4'
          : 'grid min-w-0 grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-3 lg:gap-8'
      }
    >
      <div className={hep ? 'flex flex-col gap-6' : 'flex min-w-0 flex-col gap-6 lg:col-span-2'}>
        <header className="flex flex-col gap-2">
          <div data-hang="nut" className="flex flex-wrap items-center gap-2 text-xs">
            <span data-o="ma" className="ma-ticket">
              {t.ma}
            </span>
            <span data-o="trang-thai" className={LOP_CHIP}>
              <IconTrangThai trang_thai={t.trang_thai} co={12} />
              {t.nhan_trang_thai}
            </span>
            {t.la_dieu_phoi ? (
              <span data-o="dieu-phoi" className={LOP_CHIP}>
                Ticket điều phối
              </span>
            ) : null}
            {/* 19.11 — cha ở Chờ kiểm chứng hiện "chờ N ticket con". */}
            {t.con_chua_ket === 0 ? null : (
              <span data-o="con-chua-ket" className="text-chu-mo">
                chờ {t.con_chua_ket} ticket con
              </span>
            )}
            {t.cho_nghiem_thu ? (
              <span data-o="cho-nghiem-thu" className="text-chu-mo">
                chờ nghiệm thu
              </span>
            ) : null}
            {/*
              * Dấu làm mới nằm **trong hàng đã có** (hàng mã + trạng thái), không
              * thành một hàng riêng — nếp chung, xem `trang/tong-quan.tsx`.
              */}
            <DauLamMoi hien={hien_dau} />
            {/* BAT-33 — giao việc cho agent (mục 5), cùng hộp với phím `A` của danh sách. */}
            <button
              type="button"
              data-nut="giao-viec"
              aria-haspopup="dialog"
              onClick={() => {
                datGiaoMa(t.ma);
              }}
              className={`ml-auto rounded px-2 py-0.5 text-xs ${NUT_PHU}`}
            >
              {NHAN_NUT_GIAO_VIEC}
            </button>
          </div>
          {giao_ma === t.ma ? (
            <HopGiaoViec key={t.id} ticket={{ id: t.id, ma: t.ma }} dong={dongGiao} />
          ) : null}

          {/* d.398 — tiêu đề **sửa tại chỗ**. */}
          <OSuaTaiCho
            ten="tieu-de"
            nhan="Tiêu đề"
            gia_tri={t.tieu_de}
            nhieu_dong={false}
            luu={(v) => {
              sua.mutate({ truong: 'tieu_de', gia_tri: v, ticket_id: t.id, khoa });
            }}
          />
        </header>

        {/* d.398 — mô tả **sửa tại chỗ**, hiện dạng markdown khi không sửa. */}
        <OSuaTaiCho
          ten="mo-ta"
          nhan="Mô tả"
          gia_tri={t.mo_ta ?? ''}
          nhieu_dong
          luu={(v) => {
            sua.mutate({ truong: 'mo_ta', gia_tri: v, ticket_id: t.id, khoa });
          }}
        />

        <KhoiBrief ticket={t} />
        <KhoiTicketCon ds={mh.ticket_con} />
        <DongThoiGianLuotGiao ds={mh.luot_giao} bay_gio={mh.bay_gio} />
        <KhoiBangChung ds={mh.bang_chung} />
        <KhoiBinhLuan binh_luan={mh.binh_luan} lich_su={mh.lich_su} bay_gio={mh.bay_gio} />
      </div>

      <div
        className={
          hep ? 'flex flex-col gap-6' : 'flex min-w-0 flex-col gap-6 lg:border-l lg:border-vien lg:pl-6'
        }
      >
        <KhoiThuocTinh
          ticket={t}
          bay_gio={mh.bay_gio}
          doiKhongCode={(v) => {
            sua.mutate({ truong: 'khong_code', gia_tri: v, ticket_id: t.id, khoa });
          }}
        />
        <KhoiLienQuan ticket={t} />
        <KhoiCanChu ds={mh.can_chu} bay_gio={mh.bay_gio} />
      </div>
    </div>
  );
}

/* ================================================================== *
 * 2. Sửa tại chỗ — d.398 + d.407
 * ================================================================== */

/**
 * Biến của một lần sửa — mang **cả đích** (BAT-29): `ticket_id` của thẻ đang vẽ
 * lúc bấm Lưu, và khoá chi tiết của thẻ ấy. Xem `useSuaTicket` vì sao đích không
 * được đọc từ closure.
 */
type BienSua = (
  | { truong: 'tieu_de' | 'mo_ta'; gia_tri: string }
  /** Cờ "ticket không code" (migration 0027, T-31) — chỉ chủ; web là màn hình của chủ. */
  | { truong: 'khong_code'; gia_tri: boolean }
) & {
  ticket_id: string;
  khoa: readonly unknown[];
};

interface NguCanhSua {
  anh: ManHinhTicket | undefined;
  /** Vé sổ ghi lạc quan (BAT-27) — trả ở `onSettled`. */
  ghi: VeGhiLacQuan;
  /** Khoá đã ghi lạc quan, chụp ở dòng đầu `onMutate` (BAT-28). */
  khoa: readonly unknown[];
}

/**
 * **Hiện ngay, từ chối thì hoàn lại + toast ghi rõ lý do** — d.407.
 *
 * Cùng khuôn `useGuiTraLoi` của trang Cần Chủ và `useDoiTrangThai` của trang danh
 * sách: huỷ các lần tải đang bay, chụp ảnh, sửa cache; lỗi thì đặt lại **ảnh
 * chụp** (không "ghi lại giá trị cũ" — một phản hồi khác về giữa lúc đó có thể đã
 * sửa chỗ khác của thân) và đẩy `message` nguyên văn của máy chủ ra toast.
 *
 * BAT-27: cộng/trừ sổ ghi lạc quan (`ghi-lac-quan.ts`) để nhịp và cổng quay lại
 * tab không đưa GET cũ đè tiêu đề/mô tả vừa sửa khi máy chủ chưa trả lời.
 *
 * **Đích nằm trong BIẾN, không trong closure** (BAT-29). TanStack đẩy `setOptions`
 * vào mutation đang treo, nên `mutationFn` — chạy **sau** `onMutate` (có `await
 * cancelQueries`), hay sau một lần treo vì mất mạng — là hàm của lần vẽ **mới
 * nhất**. Bản cũ đọc thẻ từ khoá của closure: đổi thẻ trong panel giữa chừng thì
 * tiêu đề của thẻ A **ghi sang thẻ B**. Nên hook không nhận khoá nào; `mutate`
 * mang `ticket_id` + `khoa` của thẻ lúc bấm, và mọi hàm chỉ đọc từ đó.
 */
function useSuaTicket(): UseMutationResult<unknown, Error, BienSua, NguCanhSua> {
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  return useMutation<unknown, Error, BienSua, NguCanhSua>({
    mutationFn: (b) =>
      suaTicket(
        b.ticket_id,
        b.truong === 'khong_code' ? { khong_code: b.gia_tri } : { [b.truong]: b.gia_tri },
      ),
    onMutate: async (b) => {
      // BAT-28/29: khoá của biến — `onError`/`onSettled` là của lần vẽ mới nhất (thẻ khác).
      const k = b.khoa;
      // BAT-27: trước mọi `await` — đóng nhịp + cổng quay-lại-tab cho khoá này.
      const ghi = batDauGhiLacQuan(qc, [k]);
      try {
        await qc.cancelQueries({ queryKey: k });
        const anh = qc.getQueryData<ManHinhTicket>(k);
        if (anh !== undefined) {
          qc.setQueryData<ManHinhTicket>(k, {
            ...anh,
            ticket: { ...anh.ticket, [b.truong]: b.gia_tri },
          });
        }
        return { anh, ghi, khoa: k };
      } catch (e) {
        ketThucGhiLacQuan(qc, ghi);
        throw e;
      }
    },
    onError: (loi, _b, nc) => {
      // Hoàn vào khoá ĐÃ GHI (ngữ cảnh), không khoá của thẻ đang mở lúc này.
      if (nc !== undefined && nc.anh !== undefined) qc.setQueryData(nc.khoa, nc.anh);
      toast.bao(loi instanceof LoiApi ? loi.message : String(loi.message));
    },
    onSettled: (_d, _l, b, nc) => {
      ketThucGhiLacQuan(qc, nc?.ghi);
      // BAT-28: bỏ qua (hoãn) khoá còn bị mutation lạc quan khác ghi. Ngữ cảnh
      // `undefined` (`onMutate` ném) ⇒ khoá của biến, không của closure (BAT-29).
      void lamMoiTheoSo(qc, { queryKey: nc?.khoa ?? b.khoa });
    },
  });
}

/**
 * Một ô **sửa tại chỗ** — d.398. Xem thì là chữ (markdown với ô nhiều dòng), bấm
 * "Sửa" thì thành ô nhập ngay tại chỗ đó.
 *
 * `key={gia_tri}` cho ô nhập: khi bản của máy chủ về và khác bản đang gõ, ô phải
 * nhận giá trị mới — nếu không, một lần hoàn lại của d.407 sẽ sửa cache mà ô vẫn
 * giữ chữ đã bị từ chối.
 */
export function OSuaTaiCho({
  ten,
  nhan,
  gia_tri,
  nhieu_dong,
  luu,
}: {
  ten: string;
  nhan: string;
  gia_tri: string;
  nhieu_dong: boolean;
  luu: (v: string) => void;
}): React.JSX.Element {
  const [mo, datMo] = useState(false);
  const [nhap, datNhap] = useState(gia_tri);

  if (!mo) {
    return (
      <section data-o={ten} data-dang-sua="khong" className="flex flex-col gap-1">
        {nhieu_dong ? (
          gia_tri.trim() === '' ? (
            <p className="text-sm text-chu-mo">{CAU_CHUA_CO_MO_TA}</p>
          ) : (
            <Markdown van={gia_tri} />
          )
        ) : (
          <h1 className={LOP_TIEU_DE_TRANG}>{gia_tri}</h1>
        )}
        <button
          type="button"
          data-nut={`sua-${ten}`}
          aria-label={`${NHAN_SUA} ${nhan}`}
          onClick={() => {
            datNhap(gia_tri);
            datMo(true);
          }}
          className="self-start text-xs text-chu-mo-hon hover:text-chu"
        >
          {NHAN_SUA}
        </button>
      </section>
    );
  }

  return (
    <section data-o={ten} data-dang-sua="co" className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs">
        {nhan}
        {nhieu_dong ? (
          <textarea
            data-o-nhap={ten}
            rows={6}
            value={nhap}
            onChange={(e) => datNhap(e.target.value)}
            className={`w-full ${LOP_O_NHAP}`}
          />
        ) : (
          <input
            data-o-nhap={ten}
            value={nhap}
            onChange={(e) => datNhap(e.target.value)}
            className={`w-full ${LOP_O_NHAP}`}
          />
        )}
      </label>
      <div data-hang="nut" className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-nut={`luu-${ten}`}
          onClick={() => {
            datMo(false);
            luu(nhap);
          }}
          className={`rounded px-3 py-1 text-sm ${NUT_CHINH}`}
        >
          {NHAN_LUU}
        </button>
        <button
          type="button"
          data-nut={`huy-${ten}`}
          onClick={() => datMo(false)}
          className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
        >
          {NHAN_HUY}
        </button>
      </div>
    </section>
  );
}

/* ================================================================== *
 * 3. Brief 8 mục GẬP ĐƯỢC — d.399
 * ================================================================== */

/**
 * **Gập được**, và **mặc định gập**: tám mục brief là phần dài nhất của trang, và
 * thứ chủ mở ticket để xem là trạng thái + chuỗi lượt giao. Mục rỗng vẫn hiện tên
 * (với chữ "—"): một mục brief **thiếu** là một dữ kiện (mục 5 — brief thiếu mục
 * là brief chưa xong), nên ẩn nó đi là xoá đúng dữ kiện đó.
 */
function KhoiBrief({ ticket }: { ticket: TicketDayDu }): React.JSX.Element {
  const [mo, datMo] = useState(false);
  const so_co = MUC_BRIEF.filter((m) => (ticket[m] ?? '').trim() !== '').length;

  return (
    <section aria-label={TEN_KHOI.brief} data-khoi="brief" className="flex flex-col gap-2">
      <button
        type="button"
        data-nut="gap-brief"
        aria-expanded={mo}
        onClick={() => datMo(!mo)}
        className="flex items-center gap-2 self-start text-sm font-semibold text-chu"
      >
        {TEN_KHOI.brief}{' '}
        <span data-so="brief" className="text-xs font-normal text-chu-mo-hon tabular-nums">
          {so_co}/{MUC_BRIEF.length}
        </span>
        <span aria-hidden="true" className="text-xs">
          {mo ? '▾' : '▸'}
        </span>
      </button>
      {mo ? (
        <dl data-o="brief-mo" className="flex flex-col gap-2">
          {MUC_BRIEF.map((m) => (
            <div key={m} data-muc-brief={m} className="flex flex-col gap-1">
              <dt className="text-xs font-semibold text-neutral-600">{NHAN_BRIEF[m]}</dt>
              <dd className="text-sm">
                {(ticket[m] ?? '').trim() === '' ? (
                  <span className="text-neutral-400">—</span>
                ) : (
                  <Markdown van={ticket[m] ?? ''} />
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/* ================================================================== *
 * 4. Ticket con — d.399
 * ================================================================== */

function KhoiTicketCon({ ds }: { ds: ManHinhTicket['ticket_con'] }): React.JSX.Element {
  return (
    <section aria-label={TEN_KHOI.ticket_con} data-khoi="ticket-con" className="flex flex-col gap-2">
      <h2 className={LOP_TIEU_DE_MUC}>
        {TEN_KHOI.ticket_con} <span data-so="ticket-con">{ds.length}</span>
      </h2>
      {ds.length === 0 ? (
        <p className="text-sm text-neutral-500">{CAU_KHONG_CO_TICKET_CON}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ds.map((c) => (
            <li key={c.id} data-ticket-con={c.ma} className="flex flex-wrap items-center gap-2 text-sm">
              <Link to={duongTicket(c.ma)} className="ma-ticket hover:text-chu hover:underline">
                {c.ma}
              </Link>
              <IconTrangThai trang_thai={c.trang_thai} co={14} />
              <span className="min-w-0 flex-1 truncate">{c.tieu_de}</span>
              <span className="text-xs text-chu-mo">{c.nhan_trang_thai}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== *
 * 5. Chuỗi lượt giao dạng DÒNG THỜI GIAN — d.399
 * ================================================================== */

/**
 * **Dòng thời gian**, theo `so_luot` tăng — thứ tự máy chủ trả về
 * (`luotGiaoCuaTicket` đã `ORDER BY so_luot`), không sắp lại ở đây.
 *
 * Mỗi mốc có đủ bốn vế mà d.399 kể: **người giao → người nhận**, **trạng thái**,
 * **báo cáo nộp**, **nghiệm thu** (lý do khi trả lại / huỷ).
 */
function DongThoiGianLuotGiao({
  ds,
  bay_gio,
}: {
  ds: readonly LuotGiao[];
  bay_gio: number;
}): React.JSX.Element {
  // d.404 — tên agent, không id. Xem `vo/ten-agent.ts`.
  const ten = useTenAgent();
  return (
    <section aria-label={TEN_KHOI.luot_giao} data-khoi="luot-giao" className="flex flex-col gap-2">
      <h2 className={LOP_TIEU_DE_MUC}>
        {TEN_KHOI.luot_giao} <span data-so="luot-giao">{ds.length}</span>
      </h2>
      {ds.length === 0 ? (
        <p className="text-sm text-neutral-500">{CAU_KHONG_CO_LUOT_GIAO}</p>
      ) : (
        <ol data-o="dong-thoi-gian" className="flex flex-col gap-3 border-l border-vien pl-4">
          {ds.map((l) => (
            <li key={l.id} data-luot={l.so_luot} className="flex flex-col gap-1 text-sm">
              <div data-hang="nut" className="flex flex-wrap items-center gap-2 text-xs">
                <span data-o="so-luot" className="font-mono text-neutral-500">
                  #{l.so_luot}
                </span>
                <span data-o="loai">{l.nhan_loai}</span>
                {/* d.399 "người giao → người nhận". */}
                <span data-o="giao-nhan">
                  {tenTacGia(l.nguoi_giao, ten)} → {tenTacGia(l.nguoi_nhan, ten)}
                </span>
                <span data-o="trang-thai" className={LOP_CHIP}>
                  {l.nhan_trang_thai}
                </span>
                {/* Dẫn xuất của mục 5 — **máy chủ tính**. */}
                {l.khong_phan_hoi ? (
                  <span data-o="khong-phan-hoi" className="font-semibold text-loi">
                    Không phản hồi
                  </span>
                ) : null}
                <Luc nhan="giao" luc={l.tao_luc} bay_gio={bay_gio} />
              </div>

              {/* d.399 "báo cáo nộp". */}
              {l.bao_cao === null ? null : (
                <div data-o="bao-cao" className="rounded-lg border border-vien bg-nen-lop p-2 text-xs text-chu">
                  <span data-o="ket-qua" className="font-semibold">
                    {l.bao_cao.nhan_ket_qua}
                  </span>
                  {l.nop_luc === null ? null : <Luc nhan="nộp" luc={l.nop_luc} bay_gio={bay_gio} />}
                </div>
              )}

              {/* d.399 "nghiệm thu" — lý do bắt buộc khi trả lại (mục 5). */}
              {l.ly_do === null || l.ly_do === '' ? null : (
                <p data-o="ly-do" className="text-xs text-neutral-700">
                  Lý do: {l.ly_do}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * **Tên người cho màn hình — TÊN agent, không bao giờ id** (d.404).
 *
 * `tra` là bảng tra `agentId → tên` của `vo/ten-agent.ts` (hook `useTenAgent`).
 * Tra không ra (danh sách chưa về, agent đã rời bảng) ⇒ **`'agent'`**, không rơi
 * về id: d.404 cấm id lên màn hình, và một `agentId` dạng UUID không nói với chủ
 * được gì hơn chữ "agent". Trước đợt 3 hàm này trả thẳng `agentId` — đó đúng là
 * chỗ chủ thấy UUID trên bản live.
 */
export function tenTacGia(ai: TacGiaRa | null, tra?: TraTenAgent): string {
  if (ai === null) return '—';
  if (ai.loai === 'agent') return tra?.(ai.agentId) ?? 'agent';
  if (ai.loai === 'owner') return NHAN_CHU;
  return ai.loai;
}

/* ================================================================== *
 * 6. Bằng chứng — d.400
 * ================================================================== */

function KhoiBangChung({ ds }: { ds: ManHinhTicket['bang_chung'] }): React.JSX.Element {
  return (
    <section aria-label={TEN_KHOI.bang_chung} data-khoi="bang-chung" className="flex flex-col gap-2">
      <h2 className={LOP_TIEU_DE_MUC}>
        {TEN_KHOI.bang_chung} <span data-so="bang-chung">{ds.length}</span>
      </h2>
      {ds.length === 0 ? (
        <p className="text-sm text-neutral-500">{CAU_KHONG_CO_BANG_CHUNG}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {ds.map((b) => (
            <li key={b.id} data-bang-chung={b.id} data-hang="nut" className="flex flex-wrap items-center gap-2">
              <span data-o="loai" className="text-xs text-neutral-600">
                {b.nhan_loai}
              </span>
              {/* Hash **máy chủ đã cắt 7 ký tự** (d.320) — không cắt lại ở đây. */}
              {b.hash === null ? null : (
                <span data-o="hash" className="font-mono text-xs">
                  {b.hash}
                </span>
              )}
              {b.repo === null ? null : (
                <span data-o="repo" className="text-xs text-neutral-600">
                  {b.repo}
                </span>
              )}
              {b.url === null ? null : (
                <span data-o="url" className="break-all text-xs text-neutral-600">
                  {b.url}
                </span>
              )}
              {b.ma_phien_ban === null ? null : (
                <span data-o="ma-phien-ban" className="font-mono text-xs">
                  {b.ma_phien_ban}
                </span>
              )}
              <span data-o="xac-minh" className={LOP_CHIP}>
                {b.nhan_xac_minh}
              </span>
              {/*
               * **Nguồn phải hiện cạnh kết luận** (migration 0022): một `merged`
               * chỉ dựa vào lời khai cục bộ, và một `review` do manager ghi thay,
               * không được nhìn giống nguồn mạnh hơn thực tế.
               */}
              {b.nhan_nguon_xac_minh === null ? null : (
                <span data-o="nguon-xac-minh" className={LOP_CHIP}>
                  {b.nhan_nguon_xac_minh}
                </span>
              )}
              {b.nhan_review_nguon === null ? null : (
                <span data-o="nguon-review" className={LOP_CHIP}>
                  {b.nhan_review_nguon}
                </span>
              )}
              {b.review_bao_cao === null ? null : (
                <span data-o="review-bao-cao" className="break-all text-xs text-neutral-600">
                  {b.review_bao_cao}
                </span>
              )}
              {/* Bằng chứng Báo cáo (`bao_cao`, T-31): người ký, đường dẫn, nội dung. */}
              {b.nhan_bao_cao_nguon === null ? null : (
                <span data-o="nguon-bao-cao" className={LOP_CHIP}>
                  {b.nhan_bao_cao_nguon}
                </span>
              )}
              {b.bao_cao_duong_dan === null ? null : (
                <span data-o="bao-cao-duong-dan" className="break-all text-xs text-neutral-600">
                  {b.bao_cao_duong_dan}
                </span>
              )}
              {b.bao_cao_reviewer === null ? null : (
                <span data-o="bao-cao-reviewer" className="break-all text-xs text-neutral-600">
                  {b.bao_cao_reviewer}
                </span>
              )}
              {b.bao_cao_noi_dung === null ? null : (
                <div data-o="bao-cao-noi-dung" className="w-full text-sm">
                  <Markdown van={b.bao_cao_noi_dung} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== *
 * 7. Bình luận XEN lịch sử — d.400
 * ================================================================== */

/** Một mốc của dòng bình luận–lịch sử trộn. */
export type MocTron =
  | { loai: 'binh_luan'; luc: number; binh_luan: BinhLuan }
  | { loai: 'lich_su'; luc: number; lich_su: DongLichSu };

/**
 * **Trộn bình luận và lịch sử thành MỘT dòng, mới nhất trước** — d.400 ("bình
 * luận xen lịch sử").
 *
 * Hàm thuần, vì "xen" là một luật về **thứ tự** và nó phải test được không cần
 * DOM. Hai nguồn đều đã được máy chủ sắp giảm dần theo mốc, nên đây là một phép
 * trộn — nhưng vẫn `sort` tường minh: dựa vào "hai mảng đã sắp" là dựa vào một
 * bất biến của một file khác.
 *
 * Phá vỡ hoà: **bình luận trước lịch sử** ở cùng một mili-giây. Một bình luận và
 * dòng lịch sử nó sinh ra (ví dụ đổi trạng thái kèm bình luận) cùng mốc, và thứ
 * chủ cần đọc là câu chữ.
 */
export function tronBinhLuanVaLichSu(
  binh_luan: readonly BinhLuan[],
  lich_su: readonly DongLichSu[],
): MocTron[] {
  const ra: MocTron[] = [
    ...binh_luan.map((b): MocTron => ({ loai: 'binh_luan', luc: b.tao_luc, binh_luan: b })),
    ...lich_su.map((h): MocTron => ({ loai: 'lich_su', luc: h.luc, lich_su: h })),
  ];
  return ra.sort((a, b) =>
    b.luc - a.luc !== 0 ? b.luc - a.luc : (a.loai === 'binh_luan' ? -1 : 0) - (b.loai === 'binh_luan' ? -1 : 0),
  );
}

/**
 * **Lịch sử THU GỌN** — d.400. Mỗi dòng lịch sử là một dòng chữ nhỏ một hàng
 * (`truong: cũ → mới`), không một khối như bình luận: nó là nền thời gian, không
 * phải nội dung.
 */
function KhoiBinhLuan({
  binh_luan,
  lich_su,
  bay_gio,
}: {
  binh_luan: readonly BinhLuan[];
  lich_su: readonly DongLichSu[];
  bay_gio: number;
}): React.JSX.Element {
  const moc = useMemo(() => tronBinhLuanVaLichSu(binh_luan, lich_su), [binh_luan, lich_su]);
  // d.404 — tác giả của từng bình luận / dòng lịch sử hiện **tên**, không id.
  const ten = useTenAgent();

  return (
    <section aria-label={TEN_KHOI.binh_luan} data-khoi="binh-luan" className="flex flex-col gap-2">
      <h2 className={LOP_TIEU_DE_MUC}>
        {TEN_KHOI.binh_luan} <span data-so="binh-luan">{binh_luan.length}</span>
      </h2>
      <ol data-o="dong-tron" className="flex flex-col gap-2">
        {moc.map((m) =>
          m.loai === 'binh_luan' ? (
            <li
              key={`bl-${m.binh_luan.id}`}
              data-moc="binh-luan"
              className="flex flex-col gap-1 rounded-lg border border-vien bg-nen-lop p-3 text-sm text-chu"
            >
              <div data-hang="nut" className="flex flex-wrap items-center gap-2 text-xs text-chu-mo">
                <span data-o="tac-gia">{tenTacGia(m.binh_luan.tac_gia, ten)}</span>
                <Luc luc={m.binh_luan.tao_luc} bay_gio={bay_gio} />
                {m.binh_luan.da_sua ? <span data-o="da-sua">(đã sửa)</span> : null}
              </div>
              <Markdown van={m.binh_luan.noi_dung} />
            </li>
          ) : (
            <li
              key={`ls-${m.lich_su.id}`}
              data-moc="lich-su"
              className="flex flex-wrap items-center gap-2 pl-3 text-xs text-chu-mo-hon"
            >
              <span data-o="tac-gia">{tenTacGia(m.lich_su.tac_gia, ten)}</span>
              <span data-o="truong">{m.lich_su.truong}</span>
              <span data-o="doi">
                {m.lich_su.gia_tri_cu ?? '—'} → {m.lich_su.gia_tri_moi ?? '—'}
              </span>
              <Luc luc={m.lich_su.luc} bay_gio={bay_gio} />
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

/* ================================================================== *
 * 8. Cột phải — thuộc tính, liên quan, Cần Chủ (d.401)
 * ================================================================== */

function KhoiThuocTinh({
  ticket,
  bay_gio,
  doiKhongCode,
}: {
  ticket: TicketDayDu;
  bay_gio: number;
  /** Bật/tắt cờ "ticket không code" — lạc quan, máy chủ từ chối thì hoàn + toast. */
  doiKhongCode: (v: boolean) => void;
}): React.JSX.Element {
  const hang = (nhan: string, ten: string, noi: React.ReactNode): React.JSX.Element => (
    <div data-thuoc-tinh={ten} className="flex flex-wrap items-baseline gap-2 py-1">
      <dt className="w-28 shrink-0 text-xs text-chu-mo">{nhan}</dt>
      <dd className="min-w-0 flex-1 text-sm text-chu">{noi}</dd>
    </div>
  );
  // d.404 — ba hàng người của khối này hiện **tên** agent, không id.
  const ten_agent = useTenAgent();

  return (
    <section aria-label={TEN_KHOI.thuoc_tinh} data-khoi="thuoc-tinh" className="flex flex-col gap-2">
      <h2 className={LOP_TIEU_DE_MUC}>{TEN_KHOI.thuoc_tinh}</h2>
      <dl className="flex flex-col">
        {hang(
          'Trạng thái',
          'trang-thai',
          <span className="inline-flex items-center gap-1.5">
            <IconTrangThai trang_thai={ticket.trang_thai} co={14} />
            {ticket.nhan_trang_thai}
          </span>,
        )}
        {hang('Ưu tiên', 'uu-tien', ticket.nhan_uu_tien)}
        {hang('Chịu trách nhiệm', 'chiu-trach-nhiem', tenTacGia(ticket.chiu_trach_nhiem, ten_agent))}
        {hang('Người đang cầm', 'nguoi-dang-cam', tenTacGia(ticket.nguoi_dang_cam, ten_agent))}
        {hang(
          'Hạn',
          'han',
          ticket.han_luc === null ? '—' : <Luc luc={ticket.han_luc} bay_gio={bay_gio} />,
        )}
        {hang('Người tạo', 'nguoi-tao', tenTacGia(ticket.nguoi_tao, ten_agent))}
        {hang('Tạo lúc', 'tao-luc', <Luc luc={ticket.tao_luc} bay_gio={bay_gio} />)}
        {hang(
          'Nhãn',
          'nhan',
          ticket.nhan.length === 0 ? (
            '—'
          ) : (
            <span className="flex flex-wrap gap-1">
              {ticket.nhan.map((n) => (
                <span key={n} data-nhan={n} className={LOP_CHIP}>
                  {n}
                </span>
              ))}
            </span>
          ),
        )}
        {/* Bốn cờ hệ thống của mục 4 d.139 — chỉ hiện cờ đang bật. */}
        {hang(
          'Cờ',
          'co',
          <span data-o="co" className="flex flex-wrap gap-1 text-xs">
            {Object.entries(ticket.co)
              .filter(([, v]) => v)
              .map(([k]) => (
                // Chip cảnh báo viền mờ, không tô nền (THIET-KE "Chip", BAT-67).
                <span key={k} data-co={k} className={LOP_CHIP_CANH}>
                  {k}
                </span>
              ))}
            {Object.values(ticket.co).every((v) => !v) ? '—' : null}
          </span>,
        )}
        {/*
          * Cờ "ticket không code" (migration 0027, T-31 câu 3.4 A). Chỉ chủ đổi
          * được — web là màn hình của chủ; máy chủ vẫn kiểm (`handlerSuaTicket`).
          * Bật cờ thì cổng Xong của ticket này đổi luật: một `bao_cao` hợp lệ là
          * đủ, hoặc `file`/`note` + chủ xác nhận. Không cần hộp xác nhận.
          */}
        {hang(
          NHAN_KHONG_CODE_TICKET,
          'khong-code',
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                role="switch"
                data-o="khong-code"
                aria-checked={ticket.khong_code}
                checked={ticket.khong_code}
                onChange={(e) => {
                  doiKhongCode(e.target.checked);
                }}
              />
              {ticket.khong_code ? 'Bật' : 'Tắt'}
            </label>
            {ticket.du_an_khong_code ? (
              <span data-o="du-an-khong-code" className="text-neutral-500">
                {CAU_DU_AN_KHONG_CODE}
              </span>
            ) : null}
          </span>,
        )}
      </dl>
    </section>
  );
}

/**
 * **Ticket liên quan, KỂ CẢ ticket điều phối** — d.401.
 *
 * Lấy **mọi** liên kết trừ `parent` xuôi (đã có khối "Ticket con" riêng ở cột
 * trái): `related`, `blocks`, `dieu_phoi`, và cả `parent` **ngược** (ticket cha).
 * Loại nào cũng hiện `nhan_loai` của máy chủ, nên `dieu_phoi` không lẫn vào
 * `related` — 19.4 đòi "xem ticket nào cũng thấy ticket kia", và biết **quan hệ
 * gì** là một nửa của câu đó.
 */
function KhoiLienQuan({ ticket }: { ticket: TicketDayDu }): React.JSX.Element {
  const ds = ticket.lien_ket.filter((l) => !(l.loai === 'parent' && !l.nguoc));

  return (
    <section aria-label={TEN_KHOI.lien_quan} data-khoi="lien-quan" className="flex flex-col gap-2">
      <h2 className={LOP_TIEU_DE_MUC}>
        {TEN_KHOI.lien_quan} <span data-so="lien-quan">{ds.length}</span>
      </h2>
      {ds.length === 0 ? (
        <p className="text-sm text-neutral-500">{CAU_KHONG_CO_LIEN_QUAN}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {ds.map((l) => (
            <li
              key={`${l.loai}-${l.ticket_id}-${l.nguoc ? 'n' : 'x'}`}
              data-lien-ket={l.ma}
              data-loai={l.loai}
              className="flex flex-wrap items-center gap-2"
            >
              <span data-o="loai" className="text-xs text-neutral-500">
                {l.nhan_loai}
                {l.nguoc ? ' (ngược)' : ''}
              </span>
              <Link to={duongTicket(l.ma)} className="ma-ticket hover:text-chu hover:underline">
                {l.ma}
              </Link>
              <IconTrangThai trang_thai={l.trang_thai} co={14} />
              <span className="min-w-0 flex-1 truncate">{l.tieu_de}</span>
              <span className="text-xs text-chu-mo">{l.nhan_trang_thai}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * **Mục Cần Chủ liên quan** — d.401, vẽ bằng **chính** component `The` của trang
 * Cần Chủ (d.250).
 *
 * Một hình thẻ thứ hai ở đây sẽ là một màn hình thứ hai để giữ đồng bộ với d.250
 * (bối cảnh gập 6 dòng, nút Copy lệnh, ghi chú TTY, nhãn "Đề xuất"…). `The` đòi
 * `bay_gio` **bắt buộc**, và nó nhận `bay_gio` của **thân này** — cùng mốc máy chủ
 * đã tính `qua_han_gio` của chính các thẻ ấy.
 *
 * Trả lời mục **không** làm ở đây: nút Gửi của d.257–262 thuộc màn hình Cần Chủ
 * (nó còn kéo theo phiên duyệt, ô hàng loạt, cập nhật huy hiệu). Nên `gui` ở đây
 * chỉ đưa chủ **sang** trang Cần Chủ, và `datNhap` là một hàm rỗng: không có ô nào
 * trên thẻ này ghi được trạng thái nhập, và một `datNhap` giả có hiệu lực sẽ là
 * một ô nhập mà bấm Gửi không gửi.
 */
function KhoiCanChu({
  ds,
  bay_gio,
}: {
  ds: ManHinhTicket['can_chu'];
  bay_gio: number;
}): React.JSX.Element {
  return (
    <section aria-label={TEN_KHOI.can_chu} data-khoi="can-chu" className="flex flex-col gap-2">
      <h2 className={LOP_TIEU_DE_MUC}>
        {TEN_KHOI.can_chu} <span data-so="can-chu">{ds.length}</span>
      </h2>
      {ds.length === 0 ? (
        <p className="text-sm text-neutral-500">{CAU_KHONG_CO_CAN_CHU}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ds.map((c) => (
            <li key={c.id} data-can-chu={c.ma} className="flex flex-col gap-1">
              <Link
                to="/can-chu"
                data-mo-can-chu={c.ma}
                className="self-start text-xs text-neutral-600 underline"
              >
                {c.ma} · {NHAN_LOAI_CAN_CHU[c.loai]} — trả lời ở trang Cần Chủ
              </Link>
              <The
                the={c}
                nhap={NHAP_RONG}
                datNhap={() => {
                  /* Thẻ ở đây **chỉ đọc** — xem ghi chú của `KhoiCanChu`. */
                }}
                gui={() => {
                  /* Trả lời đi qua trang Cần Chủ — xem ghi chú của `KhoiCanChu`. */
                }}
                bay_gio={bay_gio}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== *
 * 9. Một mốc thời gian — d.412
 * ================================================================== */

/**
 * Chữ **tương đối** trên màn hình, **giờ đầy đủ theo giờ Việt Nam** khi rê chuột
 * — d.412. Mốc là `bay_gio` của thân, tức đồng hồ **máy chủ**: xem ghi chú ở
 * `OHan` của trang danh sách và `The` của trang Cần Chủ.
 */
export function Luc({
  luc,
  bay_gio,
  nhan,
}: {
  luc: number;
  bay_gio: number;
  nhan?: string;
}): React.JSX.Element {
  return (
    <time
      dateTime={new Date(luc).toISOString()}
      title={gioDayDu(luc)}
      data-o="luc"
      className="text-xs text-chu-mo-hon"
    >
      {nhan === undefined ? '' : `${nhan} `}
      {thoiGianTuongDoi(luc, bay_gio)}
    </time>
  );
}
