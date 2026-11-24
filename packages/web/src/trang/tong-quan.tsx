/**
 * **Trang Tổng quan** — SPEC mục 11 d.316–323, trang mặc định (`/`).
 *
 * Năm khối, **đúng thứ tự "từ trên xuống"** mà d.316 nói:
 *   1. Dự án (d.317)   2. Việc đang chạy (d.318)   3. Agent đang làm gì (d.319)
 *   4. Vừa xong (d.320)   5. Cần chú ý (d.321)
 *
 * ## Đây là màn hình QUẢN LÝ CÔNG VIỆC, không phải hộp thư của chủ
 *
 * Chủ chốt 14/10 ("dashboard chính phải là quản lý tổng quát công việc") và SPEC
 * mục 11 được viết lại theo. **Cần Chủ không còn là khối đầu trang**: nó là một
 * **ô gọn** ở thanh bên phải (d.322) — ba con số, một link tới `/can-chu`, một
 * nút "Bắt đầu phiên duyệt". Đường chính vào việc chờ chủ vẫn là mục Cần Chủ ở
 * sidebar với huy hiệu đỏ (d.324), và trang này không sửa sidebar.
 *
 * Ở **375px** (d.411) ô ấy thành một **dòng tóm tắt trên cùng**: thanh bên phải
 * không có chỗ, và thứ tự DOM đặt ô **trước** cột chính rồi `lg:flex-row-reverse`
 * đẩy nó sang phải ở khổ rộng — một thứ tự DOM, hai bố cục, không `order-*` nào
 * phải chen vào giữa các khối.
 *
 * **Từ 04/11 (SPEC mục 20, T-127 = A):** khối "1. Dự án" là **Bản đồ dự án**
 * (`vo/ban-do-tong-quan.tsx`) và ô Cần Chủ gọn nằm trong **thanh đầu** của khối
 * đó, cạnh đồng hồ WIP (20.2) — không còn là thanh bên phải của cả trang. Ô có
 * thêm danh sách mở ra (20.5).
 *
 * ## Trang này KHÔNG tính luật nào
 *
 * Mọi kết luận nghiệp vụ — sức sống dự án (mục 2 d.71–74), trạng thái agent (mục
 * 3 d.98–103), năm nguồn Cần chú ý (d.319), hash 7 ký tự (d.320), `qua_han` —
 * tới **đã tính** từ `GET /v1/tong-quan`. Một lượt gọi, một ảnh chụp: năm khối
 * không bao giờ nói về năm thời điểm khác nhau. Lý lẽ đầy đủ ở đầu
 * `packages/api/src/doc-tong-quan.ts`.
 *
 * ## Trạng thái tải — d.419
 *
 * "Sau lần tải đầu, chuyển trang **không có màn hình chờ toàn trang**". Nên:
 *   * **lần tải đầu** (`isPending`, chưa có dữ liệu nào) → một dòng "Đang tải…".
 *     Đó đúng là "lần tải đầu" mà d.419 chừa ra, và một trang trắng trông như
 *     lỗi;
 *   * **mọi lần tải lại** → khối cũ **vẫn nằm nguyên trên màn hình**, và **im
 *     lặng**. TanStack Query giữ `data` qua lượt refetch, nên điều kiện phải là
 *     `data === undefined`, **không** `isFetching`.
 *
 * Bản đầu hiện một dòng "Đang làm mới…" **mỗi** lượt refetch. Với chu kỳ 2 giây
 * đó là một dòng mọc lên rồi mất cứ hai giây, đẩy cả năm khối xuống một dòng mỗi
 * lần — chủ dùng thật báo "giao diện xô lệch liên tục". Nay dấu đi qua
 * `useNhipLamMoi` + `DauLamMoi`: ô dành sẵn chiều cao cố định, chỉ có chữ khi
 * lượt tải chậm quá ngưỡng (`src/lam-moi.ts`).
 *
 * ## Làm mới — d.420
 *
 * "Thay đổi do agent tạo hiện lên trong vòng 3 giây, không cần tải lại trang" —
 * d.420 **không chừa màn hình nào**, và cả năm khối của trang này đổi do agent
 * (agent nhận việc, gửi bằng chứng, phiên đứng, ticket xong). Nên đường đọc duy
 * nhất của trang (`GET /v1/tong-quan`) chạy theo `CHU_KY_LAM_MOI_MS` của
 * `src/hang-so.ts` — **một** hằng cho mọi trang (từ lượt 6; trước đó nó được khai
 * hai lần).
 *
 * Trang này **chỉ có một** query, nên không có đường đọc nào được chừa ra: không
 * có query "nuôi danh sách lựa chọn bộ lọc" như ở danh sách ticket (thứ đổi theo
 * chủ, không theo agent) để mà cân nhắc.
 *
 * ## Lỗi — nếp `api.ts`
 *
 * In **nguyên văn** `message` của máy chủ (SPEC mục 13 d.379 bắt mọi lỗi mang
 * câu tiếng Việt). Giao diện không dịch mã lỗi thành câu: chép bảng câu lần thứ
 * hai là cách chắc chắn nhất để web và CLI nói hai thứ khác nhau về cùng một lỗi.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  layDuAn,
  layTongQuan,
  LoiApi,
  type DongVuaXong,
  type DuAnSidebar,
  type HangDuAn,
  type NhomCanChuY,
  type TheAgent,
  type TheViecDangChay,
  type TongQuan,
} from '../api';
import { NoiDungThe } from './danh-sach-ticket';
import { NHIP_LAM_MOI, useNhipLamMoi } from '../lam-moi';
import { cauConLai } from '../vo/cau-con-lai';
import { BanDoDuAn, DongHoWip } from '../vo/ban-do-tong-quan';
import { NHAN_DANG_DAY_CAN_CHU, xepCanChu } from '../vo/ban-do-bo-cuc';
import { DauLamMoi } from '../vo/dau-lam-moi';
import { ChamMucGap, ChamTrangThaiAgent, IconTrangThai } from '../vo/icon';
import { Khoi } from '../vo/khoi';
import {
  LOP_CAU_CHO,
  LOP_CAU_LOI,
  LOP_CHIP_CANH,
  LOP_CHU_MO_HON,
  LOP_CHU_PHU,
  LOP_DONG,
  LOP_DS_DONG,
  LOP_HANG_TIEU_DE,
  LOP_LIEN_KET,
  LOP_NHAN_SO_LIEU,
  LOP_SO_LIEU,
  LOP_TAB_PILL,
  LOP_TAB_PILL_DANG_CHON,
  LOP_TAB_PILL_THUONG,
  LOP_THE,
  LOP_TIEU_DE_MUC,
  LOP_TIEU_DE_TRANG,
  LOP_VUNG_TRANG,
  NUT_CHINH,
} from '../vo/lop-nut';
import { duongMucCanChu, duongTicket } from '../vo/muc-sidebar';
import { gioDayDu, thoiGianTuongDoi } from '../thoi-gian';

/** Tiêu đề năm khối — **đúng chữ** d.317–321, theo thứ tự d.316. */
export const TEN_KHOI = {
  du_an: 'Dự án',
  viec_dang_chay: 'Việc đang chạy',
  agent: 'Agent đang làm gì',
  vua_xong: 'Vừa xong',
  can_chu_y: 'Cần chú ý',
} as const;

/** Nhãn của ô Cần Chủ ở thanh bên phải — d.322. **Không** là một khối. */
export const TEN_O_CAN_CHU = 'Cần Chủ';

export const CAU_DANG_TAI_TONG_QUAN = 'Đang tải Tổng quan…';
/**
 * Chữ của dấu làm mới — **một hằng cho cả giao diện**, nằm ở `vo/dau-lam-moi.tsx`.
 * Xuất lại ở đây để các ca test cũ (và một lượt sau đọc trang này) không phải đi
 * tìm: trang Tổng quan không còn tự vẽ câu đó nữa.
 */
export { CAU_DANG_LAM_MOI } from '../vo/dau-lam-moi';
export const NHAN_PHIEN_DUYET = 'Bắt đầu phiên duyệt';

/* ------------------------------------------------------------------ *
 * Mốc thời gian: một thẻ cho cả trang
 * ------------------------------------------------------------------ */

/**
 * Một mốc thời gian — **d.412**: chữ tương đối, `title` là giờ đầy đủ theo giờ
 * Việt Nam.
 *
 * `bay_gio` là mốc **của máy chủ** (`TongQuan.bay_gio`), không `Date.now()` của
 * trình duyệt: mọi dẫn xuất trong thân (phiên đứng, quá 24 giờ) đã tính tại mốc
 * đó, nên "31 phút trước" phải đếm từ cùng cái đồng hồ — nếu không thì một máy
 * lệch giờ sẽ hiện "2 giờ trước" cạnh một nhãn "đứng" tính theo 31 phút.
 */
export function Moc({ luc, bay_gio }: { luc: number; bay_gio: number }): React.JSX.Element {
  return (
    <time
      dateTime={new Date(luc).toISOString()}
      title={gioDayDu(luc)}
      data-moc={String(luc)}
      className={`shrink-0 ${LOP_CHU_MO_HON}`}
    >
      {thoiGianTuongDoi(luc, bay_gio)}
    </time>
  );
}

/* ------------------------------------------------------------------ *
 * Trang
 * ------------------------------------------------------------------ */

/** Tiêu đề trang — **cùng chữ** với nhãn sidebar của d.391 ("Tổng quan"). */
export const TEN_TRANG = 'Tổng quan';

export function TrangTongQuan(): React.JSX.Element {
  const tq = useQuery({
    queryKey: ['tong-quan'],
    queryFn: layTongQuan,
    // d.420 — xem khối "Làm mới" ở đầu file.
    ...NHIP_LAM_MOI,
  });
  const { hien_dau } = useNhipLamMoi(tq.isFetching, [['tong-quan']]);

  /*
   * Tiêu đề trang nằm **ngoài** mọi nhánh: nó là thứ duy nhất đúng ở cả ba trạng
   * thái (đang tải, lỗi, có dữ liệu). Trả về một `<p>` trần ở nhánh tải đầu như
   * bản nháp đầu thì chủ thấy một màn hình **không có tên** trong lúc chờ, và
   * chuỗi "nhãn sidebar → tiêu đề trang" của mục 14 bị hở đúng lúc đó.
   */
  return (
    <div className={LOP_VUNG_TRANG}>
      {/*
        * Dấu làm mới nằm **trong hàng tiêu đề**, không thành một hàng riêng: một
        * hàng riêng (dù chiều cao cố định) vẫn chiếm 16px + một `gap` trống ở mọi
        * màn hình, kể cả 375px của d.411. Nếp này giống nhau ở mọi trang.
        */}
      <div className={LOP_HANG_TIEU_DE}>
        <h1 className={LOP_TIEU_DE_TRANG}>{TEN_TRANG}</h1>
        <DauLamMoi hien={hien_dau} />
      </div>
      <Than tq={tq} />
    </div>
  );
}

function Than({
  tq,
}: {
  tq: {
    data: TongQuan | undefined;
    isPending: boolean;
    error: unknown;
  };
}): React.JSX.Element {
  // Lần tải đầu — xem khối ghi chú d.419 ở đầu file.
  if (tq.data === undefined && tq.isPending) {
    return (
      <p role="status" className={LOP_CAU_CHO}>
        {CAU_DANG_TAI_TONG_QUAN}
      </p>
    );
  }

  if (tq.data === undefined) {
    return (
      <p role="alert" className={LOP_CAU_LOI}>
        {tq.error instanceof LoiApi ? tq.error.message : String(tq.error)}
      </p>
    );
  }

  const d = tq.data;
  /*
   * **SPEC 20.2 (04/11):** ô Cần Chủ gọn nay nằm trong **thanh đầu** của khối
   * "1. Dự án" (cạnh đồng hồ WIP), không còn là thanh bên phải của cả trang. Nó
   * vẫn đứng **trước** bản đồ trong DOM, nên ở 375px vẫn là dòng tóm tắt trên
   * cùng của khối đầu — thứ tự đọc đúng thứ tự thấy.
   */
  return (
    <div data-o="cot-chinh" className="flex min-w-0 flex-col gap-6">
      <KhoiDuAn d={d} />
      <KhoiViecDangChay ds={d.viec_dang_chay} bay_gio={d.bay_gio} />
      <KhoiAgent ds={d.agent} ranh_so={d.agent_ranh_so} bay_gio={d.bay_gio} />
      <KhoiVuaXong d={d} />
      <KhoiCanChuY ds={d.can_chu_y} bay_gio={d.bay_gio} />
    </div>
  );
}

function Rong({ cau }: { cau: string }): React.JSX.Element {
  return <p className={LOP_CAU_CHO}>{cau}</p>;
}

/* ------------- Ô Cần Chủ ở thanh bên phải (d.322) ------------- */

export const CAU_KHONG_CO_MUC_CHO = 'Không có mục nào đang Chờ.';
/** Chữ của link tới trang Cần Chủ — d.322 ("link tới trang Cần Chủ"). */
export const NHAN_XEM_CAN_CHU = 'Xem tất cả';
/** Nút mở/đóng danh sách của ô (SPEC 20.5 "danh sách mở ra"). */
export const nhanMoDsCanChu = (n: number): string => `Mở danh sách (${String(n)})`;
export const NHAN_DONG_DS_CAN_CHU = 'Thu danh sách';

/**
 * **Ô gọn**, không một khối: nó **không** mang `data-khoi`, nên ca test "năm
 * khối, đúng thứ tự" của d.316 đỏ ngay nếu ai đưa Cần Chủ trở lại thành khối.
 *
 * `aside` + `aria-label`: đây là một vùng **phụ** (`complementary`), đúng vai của
 * nó trong d.322 — khác với năm `section` của các khối chính.
 */
function OCanChu({ d }: { d: TongQuan }): React.JSX.Element {
  const navigate = useNavigate();
  const { so_theo_muc, so_cho } = d.can_chu;
  const [mo, datMo] = useState(false);
  // 20.5: mục của dự án đang đẩy lên đầu (giữ thứ tự gấp nhất trong mỗi phần).
  // `?? []`: thân của một API cũ chưa có `ds_cho` không làm vỡ ô.
  const ds = xepCanChu(d.can_chu.ds_cho ?? []);

  return (
    <aside
      aria-label={TEN_O_CAN_CHU}
      data-o-can-chu="co"
      className={`flex min-w-0 flex-col gap-3 p-3 md:w-72 md:shrink-0 ${LOP_THE}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className={LOP_TIEU_DE_MUC}>{TEN_O_CAN_CHU}</h2>
        <Link to="/can-chu" data-lien="can-chu" className={`text-xs ${LOP_LIEN_KET}`}>
          {NHAN_XEM_CAN_CHU}
        </Link>
      </div>

      {/*
       * Ba mức theo đúng thứ tự độ khẩn của mục 8 (🔴 → 🟡 → ⚪). Ở 375px ô là một
       * **dòng** tóm tắt, nên ba con số nằm ngang ở mọi khổ. Mỗi mức một ô số
       * liệu nhỏ (THIET-KE "Thẻ số liệu"): con số to, nhãn chữ phụ, chấm mức gấp.
       */}
      <ul data-ds="so-theo-muc" className="grid grid-cols-3 gap-2">
        {(['urgent', 'today', 'later'] as const).map((m) => (
          <li key={m} data-muc={m} className="flex min-w-0 flex-col gap-0.5">
            <span className={LOP_SO_LIEU}>{so_theo_muc[m]}</span>
            <span className={`flex min-w-0 items-center gap-1 ${LOP_NHAN_SO_LIEU}`}>
              <ChamMucGap muc={m} />
              <span className="truncate">{NHAN_MUC[m]}</span>
            </span>
          </li>
        ))}
      </ul>

      {so_cho === 0 ? <Rong cau={CAU_KHONG_CO_MUC_CHO} /> : null}

      {/*
       * **Danh sách mở ra** (SPEC 20.5) — đóng sẵn: ô vẫn là ô gọn của d.322,
       * chỉ khi chủ bấm mới kể mục. Mục của dự án đang đẩy lên đầu, gắn nhãn.
       */}
      {ds.length === 0 ? null : (
        <button
          type="button"
          data-nut="mo-ds-can-chu"
          aria-expanded={mo}
          onClick={() => {
            datMo((x) => !x);
          }}
          className={`self-start text-xs ${LOP_LIEN_KET}`}
        >
          {mo ? NHAN_DONG_DS_CAN_CHU : nhanMoDsCanChu(ds.length)}
        </button>
      )}
      {mo && ds.length > 0 ? (
        <ul data-ds="muc-can-chu" className="flex min-w-0 flex-col gap-1">
          {ds.map((m) => (
            <li
              key={m.id}
              data-muc-can-chu={m.ma}
              data-dang-day={m.du_an_dang_day ? 'co' : 'khong'}
              className="flex min-w-0 items-center gap-1.5 text-xs"
            >
              <ChamMucGap muc={m.muc} />
              <Link to={duongMucCanChu(m.ma)} className="ma-ticket shrink-0 hover:text-chu">
                {m.ma}
              </Link>
              <span className="min-w-0 truncate text-chu">{m.tieu_de}</span>
              {m.du_an_dang_day ? (
                <span data-o="nhan-dang-day" className="shrink-0 text-chu-mo">
                  {NHAN_DANG_DAY_CAN_CHU}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        data-nut="phien-duyet"
        // Màn hình phiên duyệt (d.274) là lượt sau; nút này đưa tới trang Cần Chủ.
        onClick={() => void navigate('/can-chu')}
        className={`rounded px-3 py-1 text-sm ${NUT_CHINH}`}
      >
        {NHAN_PHIEN_DUYET}
      </button>
    </aside>
  );
}

/** Nhãn ba mức — chữ của SPEC mục 0.1 (`MUC_CAN_CHU`). */
const NHAN_MUC = {
  urgent: '🔴 Gấp',
  today: '🟡 Trong ngày',
  later: '⚪ Không gấp',
} as const;

/* -------------------------- 1. Dự án (d.317) -------------------------- */

/**
 * **Trần dòng của khối Dự án** — bằng `TRAN_DU_AN` của
 * `packages/api/src/doc-tong-quan.ts` (máy chủ lấy một trang `lietKeDuAn` cỡ đó
 * và không trả số còn lại). Gõ lại ở đây vì giao diện không nhập từ gói API; đổi
 * một bên phải đổi bên kia. `cau-hoi-spec.md` #181, BAT-73.
 */
export const TRAN_DU_AN_TONG_QUAN = 200;

/**
 * Số dự án **không có hàng** ở khối Dự án — so theo `id` giữa danh sách đầy đủ
 * (`layDuAn`) và các hàng Tổng quan trả. Hàm thuần, có test.
 *
 * Danh sách đầy đủ chưa có (chưa tải / lỗi) hoặc **không vượt** trần ⇒ 0: dưới
 * trần thì máy chủ đã trả mọi dự án, một độ lệch lúc đó chỉ là hai lượt đọc ở hai
 * thời điểm (vừa tạo một dự án) chứ không phải bị cắt.
 */
export function soDuAnConLai(
  hang: readonly HangDuAn[],
  day_du: readonly DuAnSidebar[] | undefined,
): number {
  if (day_du === undefined || day_du.length <= TRAN_DU_AN_TONG_QUAN) return 0;
  const co_hang = new Set(hang.map((h) => h.id));
  return day_du.filter((d) => !co_hang.has(d.id)).length;
}

/**
 * Dòng "Còn N dự án chưa hiện ở lượt này." dưới khối Dự án — **cùng chữ và cùng
 * hình** với dòng của Bản đồ (`cauConLai`, `data-o="con-lai"`).
 *
 * Danh sách đầy đủ đọc từ **cùng** `queryKey` `['du-an']` của sidebar, nên thường
 * đã có sẵn trong cache. Chỉ bật khi khối đã chạm trần: dưới trần không có gì để
 * nói, và không thêm một lượt gọi nào.
 */
function DongConLaiDuAn({ ds }: { ds: HangDuAn[] }): React.JSX.Element | null {
  const day_du = useQuery({
    queryKey: ['du-an'],
    queryFn: layDuAn,
    enabled: ds.length >= TRAN_DU_AN_TONG_QUAN,
  });
  const n = ds.length >= TRAN_DU_AN_TONG_QUAN ? soDuAnConLai(ds, day_du.data?.items) : 0;
  if (n <= 0) return null;
  return (
    <p data-o="con-lai" className="text-sm text-canh">
      {cauConLai(n)}
    </p>
  );
}

/**
 * **Khối 1 — Dự án = Bản đồ dự án** (mục 11 ý 1 → SPEC 20.2): thanh đầu (đồng hồ
 * WIP + ô Cần Chủ gọn), cây tròn + thẻ 3 làn, dải "Khu vực duy trì". Phần vẽ ở
 * `vo/ban-do-tong-quan.tsx`; luật trình bày ở `vo/ban-do-bo-cuc.ts`.
 */
function KhoiDuAn({ d }: { d: TongQuan }): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI.du_an} ma="du-an">
      {d.du_an.length === 0 ? (
        <>
          <div data-o="thanh-dau" className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start">
            <DongHoWip wip={d.ban_do.wip} />
            <OCanChu d={d} />
          </div>
          <Rong cau="Chưa có dự án nào." />
        </>
      ) : (
        <BanDoDuAn d={d} o_can_chu={<OCanChu d={d} />} />
      )}
      {/*
       * Trần của máy chủ **nói ra**, không im lặng — cùng lý lẽ với Bản đồ: khối
       * cắt ở `TRAN_DU_AN` mà không hé răng là màn hình nói dối. BAT-73.
       */}
      <DongConLaiDuAn ds={d.du_an} />
    </Khoi>
  );
}

/**
 * **Thanh tiến độ xong/tổng** — d.317, "kèm số".
 *
 * `role="progressbar"` cộng `aria-valuetext`: màu một mình không nói được gì cho
 * trình đọc màn hình, và con số cũng hiện **bằng chữ** cạnh thanh nên nó không
 * bao giờ là thông tin chỉ-nằm-trong-màu (cùng kỷ luật icon ưu tiên của thẻ việc).
 *
 * Tổng 0 ⇒ thanh rỗng, **không** chia cho 0 (`0/0` là một dự án chưa có việc
 * nào, một ca thật của một dự án mới tạo).
 */
export function ThanhTienDo({
  ten,
  xong,
  tong,
}: {
  ten: string;
  xong: number;
  tong: number;
}): React.JSX.Element {
  const phan_tram = tong <= 0 ? 0 : Math.round((xong / tong) * 100);
  return (
    <span className="flex items-center gap-2">
      <span
        role="progressbar"
        aria-label={`Tiến độ ${ten}`}
        aria-valuemin={0}
        aria-valuemax={Math.max(tong, 0)}
        aria-valuenow={xong}
        aria-valuetext={`${String(xong)}/${String(tong)}`}
        data-tien-do={`${String(xong)}/${String(tong)}`}
        className="block h-1.5 w-20 shrink-0 overflow-hidden rounded bg-neutral-200"
      >
        <span
          data-o="thanh"
          data-phan-tram={String(phan_tram)}
          style={{ width: `${String(phan_tram)}%` }}
          className="block h-full rounded bg-tot"
        />
      </span>
      <span data-so="tien-do" className={`shrink-0 tabular-nums ${LOP_CHU_PHU}`}>
        <span data-gia-tri="co" className="font-medium text-chu">
          {xong}
        </span>
        <span data-gia-tri="tong">/{tong}</span>
      </span>
    </span>
  );
}

/* ------------------- 2. Việc đang chạy (d.318) ------------------- */

export const CAU_KHONG_CO_VIEC_DANG_CHAY = 'Không có việc nào đang chạy.';
/** Chữ trước mốc "đã cầm bao lâu" — d.318. */
export const NHAN_DA_CAM = 'Đã cầm';
export const CAU_CHUA_AI_CAM = 'Chưa ai cầm';

function KhoiViecDangChay({
  ds,
  bay_gio,
}: {
  ds: TheViecDangChay[];
  bay_gio: number;
}): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI.viec_dang_chay} ma="viec-dang-chay">
      {ds.length === 0 ? (
        <Rong cau={CAU_KHONG_CO_VIEC_DANG_CHAY} />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ds.map((v) => (
            <li
              key={v.the.id}
              data-the-ticket={v.the.ma}
              data-trang-thai={v.the.trang_thai}
              className={`flex w-full flex-col gap-1.5 p-2.5 text-sm sm:w-72 ${LOP_THE}`}
            >
              {/*
               * **Cùng component** thẻ việc của bảng d.403 — d.318 ("cùng kiểu
               * thẻ với bảng việc ở mục 14"). `hien_trang_thai` bật vì khối này
               * trộn `in_progress` và `verifying` trong một danh sách, nên không
               * có cột nào nói trạng thái thay nó.
               */}
              <NoiDungThe
                the={v.the}
                bay_gio={bay_gio}
                hien_trang_thai
                ten_nguoi_cam={v.nguoi_cam_ten}
              />
              <span data-o="cam-tu" className={LOP_CHU_PHU}>
                {v.cam_tu_luc === null ? (
                  CAU_CHUA_AI_CAM
                ) : (
                  <>
                    {v.nguoi_cam_ten === null ? NHAN_DA_CAM : `${v.nguoi_cam_ten} · ${NHAN_DA_CAM}`}{' '}
                    <Moc luc={v.cam_tu_luc} bay_gio={bay_gio} />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Khoi>
  );
}

/* ------------------ 3. Agent đang làm gì (d.319) ------------------ */

export const CAU_CHUA_LEN_TIENG = 'Chưa lên tiếng lần nào';
export const CAU_KHONG_AGENT_NAO_DANG_LAM = 'Không có agent nào đang làm.';
/** Dòng gom của d.319 — "Agent rảnh gom **một dòng** đếm số". */
export const nhanAgentRanh = (so: number): string => `${String(so)} agent rảnh`;

function KhoiAgent({
  ds,
  ranh_so,
  bay_gio,
}: {
  ds: TheAgent[];
  ranh_so: number;
  bay_gio: number;
}): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI.agent} ma="agent">
      {ds.length === 0 ? <Rong cau={CAU_KHONG_AGENT_NAO_DANG_LAM} /> : null}
      {/*
       * **Mỗi agent một DÒNG**, không một thẻ to như trước đợt 3: d.319 nói
       * "mỗi agent một dòng: việc đang cầm và thời gian từ tín hiệu cuối".
       */}
      {ds.length === 0 && ranh_so === 0 ? null : (
        <ul className={LOP_DS_DONG}>
          {ds.map((a) => (
            <li key={a.id} data-agent={a.id} className={`flex-wrap ${LOP_DONG}`}>
              {/*
               * Chấm trạng thái **trước tên** (THIET-KE "Chấm trạng thái agent"),
               * `aria-hidden`: chữ trạng thái ngay sau là thứ được đọc.
               *
               * Bề rộng cố định **chỉ từ `sm`**: ở khổ rộng tên (`sm:w-32`) và chữ
               * trạng thái (`sm:min-w-16`) thẳng cột như danh sách ticket; ở 375px
               * (d.411) chúng co theo chữ và dòng `flex-wrap` — việc đang cầm
               * (`basis-40`) xuống hàng thay vì bị ép còn vài pixel. Tên dài cắt
               * `…`, `title` giữ tên đầy đủ; chữ trạng thái **không** cắt.
               */}
              <ChamTrangThaiAgent trang_thai={a.trang_thai} />
              <span
                title={a.ten}
                className="min-w-0 truncate font-medium text-chu sm:w-32 sm:shrink-0"
              >
                {a.ten}
              </span>
              <span data-trang-thai={a.trang_thai} className={`shrink-0 sm:min-w-16 ${LOP_CHU_PHU}`}>
                {a.nhan_trang_thai}
              </span>
              <span
                data-ds="dang-cam"
                className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-2"
              >
                {a.ticket_dang_cam.map((t) => (
                  <span key={t.id} className="flex min-w-0 items-center gap-1.5">
                    <Link to={duongTicket(t.ma)} className="ma-ticket hover:text-chu">
                      {t.ma}
                    </Link>
                    <span className="truncate text-chu">{t.tieu_de}</span>
                  </span>
                ))}
              </span>
              <span className="ml-auto shrink-0 text-xs">
                {a.tin_hieu_cuoi_luc === null ? (
                  <span className="text-chu-mo-hon">{CAU_CHUA_LEN_TIENG}</span>
                ) : (
                  <Moc luc={a.tin_hieu_cuoi_luc} bay_gio={bay_gio} />
                )}
              </span>
            </li>
          ))}

          {ranh_so === 0 ? null : (
            <li data-agent-ranh="co" className={`px-3 py-1.5 ${LOP_CHU_PHU}`}>
              {nhanAgentRanh(ranh_so)}
            </li>
          )}
        </ul>
      )}
    </Khoi>
  );
}

/* ----------------------- 5. Cần chú ý (d.321) ------------------------- */

export const CAU_KHONG_CO_GI_CAN_CHU_Y = 'Không có gì cần chú ý.';

function KhoiCanChuY({ ds, bay_gio }: { ds: NhomCanChuY[]; bay_gio: number }): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI.can_chu_y} ma="can-chu-y">
      {ds.length === 0 ? (
        <Rong cau={CAU_KHONG_CO_GI_CAN_CHU_Y} />
      ) : (
        <ul className={LOP_DS_DONG}>
          {/*
           * **Một dòng cho mỗi ticket** — d.321. Phép gom nằm ở **máy chủ**
           * (`gomTheoTicket`), kể cả khoá của dòng: trang không được tự gom, vì
           * "mỗi ticket một dòng" là một kết luận về dữ liệu, không một chuyện
           * trình bày (và một `index` làm khoá thì mỗi lượt làm mới 2 giây là
           * một lần React dựng lại cả khối).
           */}
          {ds.map((n) => (
            <li key={n.khoa} data-can-chu-y={n.khoa} className={LOP_DONG}>
              <span data-ds="nhan-ly-do" className="flex shrink-0 flex-wrap items-center gap-1">
                {n.ly_do.map((d, i) => (
                  /*
                   * Chip cảnh báo (THIET-KE "Chip cảnh báo"): viền mờ, chữ `canh`,
                   * **không tô nền** — BAT-66 bỏ `bg-canh-nen`.
                   */
                  <span key={`${d.loai}-${String(i)}`} data-ly-do={d.loai} className={LOP_CHIP_CANH}>
                    {d.nhan_loai}
                  </span>
                ))}
              </span>

              {n.ticket === null ? null : (
                <>
                  <Link to={duongTicket(n.ticket.ma)} className="ma-ticket shrink-0 hover:text-chu">
                    {n.ticket.ma}
                  </Link>
                  <span className="truncate text-chu">{n.ticket.tieu_de}</span>
                </>
              )}

              {n.ly_do.map((d, i) => (
                <ChiTietLyDo key={`ct-${d.loai}-${String(i)}`} d={d} />
              ))}

              <span className="ml-auto shrink-0">
                <Moc luc={n.luc} bay_gio={bay_gio} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Khoi>
  );
}

/**
 * Thứ **cụ thể nhất** mà một lý do có thêm: link phiên, lý do bằng chứng trượt,
 * câu lỗi của một tin không gửi được.
 *
 * `== null` (không `=== null`) và `?.`: dữ liệu này tới qua biên HTTP/JSON, nên
 * một trường **thiếu hẳn** (`undefined`) là ca thật — một bản API cũ hơn chưa
 * biết nguồn thứ sáu vẫn trả dòng "Cần chú ý" bình thường. `=== null` để
 * `undefined` lọt qua và đọc `.ly_do` trên `undefined` làm vỡ cả trang Tổng quan.
 */
function ChiTietLyDo({ d }: { d: NhomCanChuY['ly_do'][number] }): React.JSX.Element | null {
  if (d.phien != null) {
    return (
      <Link to={`/phien/${d.phien.id}`} className={`shrink-0 text-xs ${LOP_LIEN_KET}`}>
        {d.phien.nhan_trang_thai}
      </Link>
    );
  }
  const cau = d.bang_chung?.ly_do ?? d.thong_bao?.ly_do;
  if (cau == null) return null;
  return <span className={`truncate ${LOP_CHU_PHU}`}>{cau}</span>;
}

/* ------------------------ 4. Vừa xong (d.320) ------------------------- */

export const CAU_CHUA_XONG_VIEC_NAO = 'Chưa có việc nào xong trong 24 giờ qua.';
export const CAU_CHUA_XONG_VIEC_NAO_7N = 'Chưa có việc nào xong trong 7 ngày qua.';

/** Hai cửa sổ của d.320 — **đúng hai** lựa chọn, theo thứ tự SPEC viết. */
export const CUA_SO_VUA_XONG = [
  { ma: '24h', nhan: '24 giờ' },
  { ma: '7n', nhan: '7 ngày' },
] as const;

export type MaCuaSo = (typeof CUA_SO_VUA_XONG)[number]['ma'];

/**
 * URL của bằng chứng `deploy` — **chỉ dựng `<a href>` khi scheme là `https:`**.
 *
 * Vì sao chặn **lần nữa** ở chỗ vẽ, dù đường gửi đã ép `https:`:
 * `kiemBangChungDeploy` (`shared/src/bang-chung.ts`) là cửa duy nhất của **lệnh
 * gửi**, nên hôm nay không có `javascript:` nào vào được bảng `evidence`. Nhưng
 * đó là một lời khai về **một** đường ghi, và mục 16 (nhập dữ liệu từ nơi khác)
 * chưa được viết — một đường nhập đi vòng `kiemBangChung` là đủ để biến ô này
 * thành một `javascript:` mà chủ **tự bấm**. Một cú `href` không kiểm là XSS tự
 * nguyện, nên nó được canh ở chỗ nó gây hại, không chỉ ở chỗ nó vào.
 *
 * URL không phải `https:` **vẫn hiện nguyên văn**, chỉ không thành link: ẩn nó
 * đi là che một bằng chứng đã nằm trong dữ liệu, mà đúng lúc đó chủ cần thấy nó
 * nhất.
 */
export function LienBangChung({ url }: { url: string | null }): React.JSX.Element | null {
  if (url === null) return null;

  let an_toan = false;
  try {
    an_toan = new URL(url).protocol === 'https:';
  } catch {
    // URL không đọc được ⇒ không phải link. Fail-closed, nếp của cả dự án.
    an_toan = false;
  }

  if (!an_toan) {
    return (
      <span data-url="khong-an-toan" className="break-all text-chu-mo">
        {url}
      </span>
    );
  }
  return (
    <a href={url} data-url="https" rel="noreferrer" className={`break-all ${LOP_LIEN_KET}`}>
      {url}
    </a>
  );
}

/**
 * "chọn cửa sổ **24 giờ** hoặc **7 ngày**" — d.320.
 *
 * Cả hai tập đã nằm trong **một** thân (`vua_xong_24h` + `vua_xong_7n`), nên cú
 * bấm đổi nút chỉ đổi một `useState` — **không** một query thứ hai, đúng d.420
 * ("một đường đọc duy nhất"). Và vì cả hai tập đi cùng một ảnh chụp, đổi cửa sổ
 * không bao giờ cho chủ hai mốc `bay_gio` khác nhau.
 */
function KhoiVuaXong({ d }: { d: TongQuan }): React.JSX.Element {
  const [cua_so, datCuaSo] = useState<MaCuaSo>('24h');
  const ds: DongVuaXong[] = cua_so === '24h' ? d.vua_xong_24h : d.vua_xong_7n;
  const bay_gio = d.bay_gio;

  return (
    <Khoi
      ten={TEN_KHOI.vua_xong}
      ma="vua-xong"
      phu={
        <div role="group" aria-label="Cửa sổ của Vừa xong" className="flex gap-1">
          {CUA_SO_VUA_XONG.map((c) => (
            <button
              key={c.ma}
              type="button"
              data-cua-so={c.ma}
              aria-pressed={cua_so === c.ma}
              onClick={() => {
                datCuaSo(c.ma);
              }}
              className={`${LOP_TAB_PILL} text-xs ${
                cua_so === c.ma ? LOP_TAB_PILL_DANG_CHON : LOP_TAB_PILL_THUONG
              }`}
            >
              {c.nhan}
            </button>
          ))}
        </div>
      }
    >
      {ds.length === 0 ? (
        <Rong cau={cua_so === '24h' ? CAU_CHUA_XONG_VIEC_NAO : CAU_CHUA_XONG_VIEC_NAO_7N} />
      ) : (
        <ul className={LOP_DS_DONG}>
          {ds.map((d) => (
            <li key={d.ticket.id} data-vua-xong={d.ticket.ma} className={`flex-wrap ${LOP_DONG}`}>
              {/*
               * Icon Xong (THIET-KE "Icon trạng thái"), `aria-hidden`: mọi dòng của
               * khối đều là việc đã xong, tên khối đã nói bằng chữ.
               */}
              <IconTrangThai trang_thai="done" co={14} />
              <Link to={duongTicket(d.ticket.ma)} className="ma-ticket shrink-0 hover:text-chu">
                {d.ticket.ma}
              </Link>
              <span className="min-w-0 truncate text-chu">{d.ticket.tieu_de}</span>
              <ul data-ds="bang-chung" className="flex min-w-0 flex-wrap gap-2">
                {d.bang_chung.map((b) => (
                  <li key={b.id} data-bang-chung={b.loai} className={`flex gap-1 ${LOP_CHU_PHU}`}>
                    {/* d.320: hash 7 ký tự · URL · mã phiên bản. Máy chủ đã cắt. */}
                    {b.hash === null ? null : <span data-hash="co" className="font-mono">{b.hash}</span>}
                    <LienBangChung url={b.url} />
                    {b.ma_phien_ban === null ? null : (
                      <span data-ma-phien-ban="co" className="font-mono">
                        {b.ma_phien_ban}
                      </span>
                    )}
                    {b.hash === null && b.url === null && b.ma_phien_ban === null
                      ? b.nhan_loai
                      : null}
                  </li>
                ))}
              </ul>
              <span className="ml-auto shrink-0">
                <Moc luc={d.xong_luc} bay_gio={bay_gio} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Khoi>
  );
}
