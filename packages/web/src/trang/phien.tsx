/**
 * **Chi tiết phiên** (`/phien/:id`) — SPEC mục 14 **d.402**: "Chi tiết phiên:
 * **dòng hoạt động**, **kế hoạch**, nút **Dừng**." Cộng mục 6 (d.184–196) cho
 * nghĩa của từng vế.
 *
 * | Vế SPEC | Ở đâu |
 * |---|---|
 * | d.402 dòng hoạt động | `KhoiHoatDong` (5 loại của bảng 0.1, nhãn từ máy chủ) |
 * | d.402 kế hoạch | `KhoiKeHoach` (phiên bản hiện hành — d.191) |
 * | d.402 nút **Dừng** | `NutDung` → `POST /v1/phien/:id/dung` |
 * | d.407 sửa hiện ngay, từ chối thì hoàn lại + toast | `useDungPhien` |
 * | d.410 thay đổi của agent hiện trong 3 giây | `nhipLamMoi` (`src/lam-moi.ts`) |
 * | d.412 thời gian tương đối, rê chuột thấy giờ VN | `Moc` (mốc = `bay_gio`) |
 *
 * ## Nút Dừng KHÔNG cài lại luật nào
 *
 * Mọi luật của việc dừng đã sống ở cửa ghi từ phần 2 (lệnh `dung_phien`): "chỉ
 * chủ" (19.12 câu 44), phiên sang `stopping`, tín hiệu `STOP` cho lần gọi kế tiếp
 * của agent (d.193), 10 phút không xác nhận thì phiên tự đóng (d.194), và mọi
 * lệnh ghi sau khi đóng bị `SESSION_CLOSED` (d.195). Trang này **không** kiểm
 * trước điều kiện nào — kể cả "phiên đã đóng thì ẩn nút": một bản kiểm thứ hai ở
 * client sẽ hoặc chặn một lần dừng hợp lệ, hoặc cho qua một lần máy chủ từ chối.
 * Nút **cứ bấm được**, rồi lý do từ chối đi **nguyên văn** từ `message` của máy
 * chủ ra toast (d.407). Ngoại lệ duy nhất là ca không cần hỏi máy chủ mới biết:
 * phiên **đã đóng** (`dang_mo === false`) thì nút ở trạng thái `disabled` kèm lý
 * do nhìn thấy được — xem `NutDung`.
 *
 * ## Trang này không tính dẫn xuất nào
 *
 * `stalled` (d.184), phiên `stopping` quá 10 phút đã thành `closed` (d.194),
 * `dung`, `im_lang_ms`, `cho_nguoi_giao_qua_han` (19.6), `tin_hieu`, mục tạm thời
 * **đã bị mục sau thay chỗ** (d.190), mọi `nhan_*`: tới **đã tính** từ
 * `GET /v1/man-hinh-phien/:id`.
 */

import { useMemo } from 'react';
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
  dungPhien,
  layManHinhPhien,
  type HoatDongDong,
  type KeHoachPhien,
  type ManHinhPhien,
  type TrangThaiTicket,
} from '../api';
import { nhipLamMoi, useNhipLamMoi } from '../lam-moi';
import { useMotLan } from '../mot-lan';
import {
  batDauGhiLacQuan,
  ketThucGhiLacQuan,
  lamMoiTheoSo,
  type VeGhiLacQuan,
} from '../ghi-lac-quan';
import { DauLamMoi } from '../vo/dau-lam-moi';
import { IconTrangThai } from '../vo/icon';
import { Khoi } from '../vo/khoi';
import {
  LOP_CAU_CHO,
  LOP_CHIP,
  LOP_CHIP_CANH,
  LOP_CHIP_LOI,
  LOP_CHU_MO_HON,
  LOP_CHU_PHU,
  LOP_DONG,
  LOP_DS_DONG,
  LOP_HANG_TIEU_DE,
  LOP_TIEU_DE_TRANG,
  LOP_VUNG_TRANG,
  NUT_CHINH,
  NUT_MO_KHI_DISABLED,
} from '../vo/lop-nut';
import { LOP_TRANG_THAI } from '../vo/mau-the';
import { duongTicket } from '../vo/muc-sidebar';
import { useToast } from '../vo/toast';
import { Moc } from './tong-quan';
import { TrangThaiTai, duongAgent } from './doi-agent';

export const TEN_TRANG_PHIEN = 'Chi tiết phiên';
export const CAU_DANG_TAI_PHIEN = 'Đang tải phiên…';

/** Đúng chữ của d.402 cho nút. */
export const NHAN_DUNG = 'Dừng';
export const CAU_PHIEN_DA_DONG = 'Phiên đã đóng.';
export const CAU_KHONG_CO_HOAT_DONG = 'Chưa có mục hoạt động nào.';
export const CAU_CHUA_CO_KE_HOACH = 'Agent chưa gửi kế hoạch nào.';

/** Tiêu đề hai khối — đúng hai vế đầu của d.402. */
export const TEN_KHOI_PHIEN = {
  hoat_dong: 'Dòng hoạt động',
  ke_hoach: 'Kế hoạch',
} as const;

/**
 * **Bảy mã trạng thái phiên** của bảng 0.1 → nhãn tiếng Việt.
 *
 * Chỉ dùng cho **cập nhật lạc quan** của nút Dừng (d.407): lúc đó chưa có câu trả
 * lời nào của máy chủ, nên không có `nhan_trang_thai` nào để lấy — mà để nguyên
 * nhãn cũ ("Đang chạy") cạnh một trạng thái mới (`stopping`) là một màn hình nói
 * sai. Mọi lần vẽ **khác** vẫn đọc `nhan_trang_thai` của máy chủ.
 *
 * `test/doc-spec.ts` cắt hàng "Trạng thái phiên" của bảng 0.1 ra từ `SPEC.md` rồi
 * so với đúng bảng này, nên nó không tự xác nhận chính nó.
 */
export const NHAN_TRANG_THAI_PHIEN: Record<string, string> = {
  running: 'Đang chạy',
  waiting_owner: 'Chờ Chủ',
  waiting_assigner: 'Chờ người giao',
  stalled: 'Đứng',
  error: 'Lỗi',
  stopping: 'Đang dừng',
  closed: 'Đã đóng',
};

/**
 * Lớp của **chip trạng thái phiên** (THIET-KE "Chip", BAT-69): mã `error` ⇒ chip
 * lỗi `LOP_CHIP_LOI` (cùng dáng `LOP_CHIP`, chữ `loi`, không nền); mọi mã khác
 * ⇒ `LOP_CHIP` trơn. Đọc **mã** (`trang_thai`), không đọc nhãn. Không hình: trạng
 * thái phiên chưa có quy ước hình.
 */
export function lopChipTrangThaiPhien(trang_thai: string): string {
  return trang_thai === 'error' ? LOP_CHIP_LOI : LOP_CHIP;
}

/**
 * Mã trạng thái ticket của thân phiên (`ticket.trang_thai`, kiểu `string` ở
 * `api.ts`) có là một trong bảy mã của bảng 0.1 không — để vẽ `IconTrangThai`
 * trước mã ticket (THIET-KE "Icon trạng thái", BAT-67). Mã lạ ⇒ không icon, không
 * đoán: chỉ là trình bày, chữ và liên kết vẫn như cũ.
 */
function laTrangThaiTicket(t: string): t is TrangThaiTicket {
  return Object.hasOwn(LOP_TRANG_THAI, t);
}

/* ================================================================== *
 * 1. Trang
 * ================================================================== */

export function TrangPhien({ id }: { id: string }): React.JSX.Element {
  const khoa = useMemo(() => ['phien', id] as const, [id]);
  const qc_ph = useQueryClient();
  const q = useQuery({
    queryKey: khoa,
    queryFn: () => layManHinhPhien(id),
    // d.410: dòng hoạt động, kế hoạch và trạng thái phiên đều đổi **do agent**.
    // BAT-27: nhịp tắt khi nút Dừng đang ghi lạc quan vào khoá này.
    ...nhipLamMoi(qc_ph),
  });
  const { hien_dau } = useNhipLamMoi(q.isFetching, [khoa]);
  const dung = useDungPhien();

  if (q.data === undefined) {
    return (
      <div className={LOP_VUNG_TRANG}>
        <h1 className={LOP_TIEU_DE_TRANG}>{TEN_TRANG_PHIEN}</h1>
        <TrangThaiTai q={q} cau_dang_tai={CAU_DANG_TAI_PHIEN} />
      </div>
    );
  }

  const mh: ManHinhPhien = q.data;
  const p = mh.phien;

  return (
    <div data-o="trang-phien" className={LOP_VUNG_TRANG}>
      <header className="flex flex-col gap-2">
        <div className={LOP_HANG_TIEU_DE}>
          <h1 className={LOP_TIEU_DE_TRANG}>{TEN_TRANG_PHIEN}</h1>
          <DauLamMoi hien={hien_dau} />
        </div>

        {/*
         * Hàng chip của trang chi tiết (THIET-KE "Trang", "Chip"). Trạng thái phiên
         * là `LOP_CHIP` **không chấm**: THIET-KE chỉ có hình cho trạng thái ticket
         * và trạng thái agent, bảy trạng thái phiên chưa có quy ước hình nào — không
         * bịa hình mới (BAT-67). "Đứng" và "Chờ người giao quá hạn" là hai cảnh báo
         * ⇒ chip cảnh báo `LOP_CHIP_CANH` (cùng kiểu "Đứng" ở trang agent), không tô nền.
         * BAT-69: trạng thái phiên `error` ⇒ chip lỗi `LOP_CHIP_LOI` (`lopChipTrangThaiPhien`).
         */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span data-trang-thai={p.trang_thai} className={lopChipTrangThaiPhien(p.trang_thai)}>
            {p.nhan_trang_thai}
          </span>
          {p.dung ? (
            <span data-o="dung" className={LOP_CHIP_CANH}>
              Đứng
            </span>
          ) : null}
          {/* 19.6 — chờ người giao quá 60 phút thì vào "Cần chú ý". */}
          {p.cho_nguoi_giao_qua_han ? (
            <span data-o="cho-nguoi-giao" className={LOP_CHIP_CANH}>
              Chờ người giao quá hạn
            </span>
          ) : null}
          {/* d.193 — tín hiệu agent sẽ nhận ở lần gọi kế tiếp. */}
          {p.tin_hieu.map((t) => (
            <span key={t} data-tin-hieu={t} className={LOP_CHIP}>
              {t}
            </span>
          ))}
        </div>

        {/*
         * Ticket của phiên: icon trạng thái (`aria-hidden`, không nhãn — không thêm
         * chữ nào) **trước** mã, như dòng Vừa xong. Tiêu đề dài xuống hàng
         * (`min-w-0 break-words`) thay vì đẩy trang tràn ngang ở 375px.
         */}
        <div data-o="dong-ticket" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5">
            {laTrangThaiTicket(mh.ticket.trang_thai) ? (
              <IconTrangThai trang_thai={mh.ticket.trang_thai} co={14} />
            ) : null}
            <Link to={duongTicket(mh.ticket.ma)} data-o="ticket" className="ma-ticket hover:text-chu">
              {mh.ticket.ma}
            </Link>
          </span>
          <span className="min-w-0 break-words text-chu">{mh.ticket.tieu_de}</span>
          {/*
           * Tên agent trong dòng là **tên thực thể bấm được** ⇒ chữ chính, gạch
           * chân khi hover (THIET-KE "Chữ"), không màu nhấn như liên kết trong câu.
           */}
          <Link to={duongAgent(mh.agent.id)} data-o="agent" className="font-medium text-chu hover:underline">
            {mh.agent.ten}
          </Link>
          <span className={LOP_CHU_PHU}>{mh.agent.nhan_vai_tro}</span>
        </div>

        <div className={`flex flex-wrap items-center gap-3 ${LOP_CHU_PHU}`}>
          <span data-o="tin-hieu-cuoi">
            tín hiệu cuối <Moc luc={p.tin_hieu_cuoi_luc} bay_gio={mh.bay_gio} />
          </span>
          <span data-o="nguong">ngưỡng đứng {p.nguong_dung_phut} phút</span>
          <span data-o="mo-luc">
            mở <Moc luc={p.mo_luc} bay_gio={mh.bay_gio} />
          </span>
          {p.ly_do_dong === null ? null : (
            <span data-o="ly-do-dong" className="min-w-0 break-words">
              {p.ly_do_dong}
            </span>
          )}
          <NutDung dang_mo={p.dang_mo} dung={dung} bien={{ phien_id: id, khoa }} />
        </div>
      </header>

      <KhoiHoatDong ds={mh.hoat_dong} bay_gio={mh.bay_gio} />
      <KhoiKeHoach ke_hoach={mh.ke_hoach} bay_gio={mh.bay_gio} />
    </div>
  );
}

/* ================================================================== *
 * 2. Nút Dừng — d.402 + d.407
 * ================================================================== */

interface NguCanhDung {
  anh: ManHinhPhien | undefined;
  /** Vé sổ ghi lạc quan (BAT-27) — trả ở `onSettled`. */
  ghi: VeGhiLacQuan;
  /** Khoá đã ghi lạc quan, chụp ở dòng đầu `onMutate` (BAT-28). */
  khoa: readonly unknown[];
}

/** Biến của một lần Dừng — mang **đích** (BAT-29), xem `useDungPhien`. */
interface BienDung {
  phien_id: string;
  khoa: readonly unknown[];
}

/**
 * **Cập nhật lạc quan của nút Dừng** — d.407: "mọi thao tác sửa **hiện ngay**
 * trên màn hình trước khi server trả lời; server từ chối thì **hoàn lại** và báo
 * lỗi dạng **toast ghi rõ lý do**".
 *
 * Ảnh chụp trước khi sửa là thứ duy nhất làm "hoàn lại" khả thi: `onError` đặt
 * lại **nguyên** thân cũ, không dựng lại một thân "đoán là cũ".
 *
 * Câu lỗi **không** được bịa ở client: nó là `message` của máy chủ (mục 13 d.379
 * bắt mọi lỗi mang câu tiếng Việt). Một bảng câu thứ hai ở đây là cách chắc chắn
 * nhất để web và CLI nói hai thứ khác nhau về cùng một lỗi.
 *
 * BAT-27: cộng/trừ sổ ghi lạc quan (`ghi-lac-quan.ts`) để nhịp và cổng quay lại
 * tab không đưa GET cũ ("Đang chạy") đè "Đang dừng" khi máy chủ chưa trả lời.
 *
 * **Đích nằm trong BIẾN, không trong closure** (BAT-29): `mutationFn` chạy sau
 * `onMutate` (có `await cancelQueries`) là hàm của lần vẽ **mới nhất** (TanStack
 * đẩy `setOptions` vào mutation đang treo). Bản cũ `() => dungPhien(phien_id)` của
 * closure: sang `/phien/<khác>` giữa chừng thì **Dừng nhầm phiên**. Nên hook
 * không nhận id nào; `mutate` mang `phien_id` + `khoa` của phiên lúc bấm.
 */
function useDungPhien(): UseMutationResult<unknown, Error, BienDung, NguCanhDung> {
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  return useMutation<unknown, Error, BienDung, NguCanhDung>({
    mutationFn: (b) => dungPhien(b.phien_id),
    onMutate: async (b) => {
      // BAT-28/29: khoá của biến — `onError`/`onSettled` là của lần vẽ mới nhất (phiên khác).
      const k = b.khoa;
      // BAT-27: trước mọi `await` — đóng nhịp + cổng quay-lại-tab cho khoá này.
      const ghi = batDauGhiLacQuan(qc, [k]);
      try {
        await qc.cancelQueries({ queryKey: k });
        const anh = qc.getQueryData<ManHinhPhien>(k);
        if (anh !== undefined) {
          qc.setQueryData<ManHinhPhien>(k, {
            ...anh,
            phien: {
              ...anh.phien,
              trang_thai: 'stopping',
              nhan_trang_thai: NHAN_TRANG_THAI_PHIEN['stopping'] ?? anh.phien.nhan_trang_thai,
            },
          });
        }
        return { anh, ghi, khoa: k };
      } catch (e) {
        ketThucGhiLacQuan(qc, ghi);
        throw e;
      }
    },
    onError: (loi, _b, nc) => {
      // Hoàn vào khoá ĐÃ GHI (ngữ cảnh), không khoá của phiên đang mở lúc này.
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
 * Nút "Dừng" của d.402.
 *
 * Mờ **chỉ** khi phiên đã đóng — ca duy nhất mà màn hình biết chắc không cần hỏi
 * máy chủ, và ca mà một lần bấm luôn ra lỗi. Mọi ca khác (kể cả `stopping` lần
 * hai) **vẫn bấm được**: luật nằm ở cửa ghi, không ở đây.
 */
function NutDung({
  dang_mo,
  dung,
  bien,
}: {
  dang_mo: boolean;
  dung: UseMutationResult<unknown, Error, BienDung, NguCanhDung>;
  /** Đích của lần bấm — phiên đang vẽ (BAT-29). */
  bien: BienDung;
}): React.JSX.Element {
  const mot = useMotLan();
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        data-nut="dung"
        disabled={!dang_mo || dung.isPending}
        onClick={() => {
          // BAT-32: chốt ref đồng bộ — hai lần bấm liền chỉ gửi một lệnh.
          mot((tha) => {
            dung.mutate(bien, { onSettled: tha });
          });
        }}
        className={`rounded px-3 py-1 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
      >
        {NHAN_DUNG}
      </button>
      {dang_mo ? null : <span data-o="da-dong">{CAU_PHIEN_DA_DONG}</span>}
    </span>
  );
}

/* ================================================================== *
 * 3. Dòng hoạt động — d.402, mục 6 d.190
 *
 * Hai khối dùng `Khoi` chung (`vo/khoi.tsx`, BAT-67): `section[aria-label]
 * [data-khoi]` + `header` `LOP_DAU_KHOI` + `h2` — cùng dáng Tổng quan / trang agent.
 * ================================================================== */

/**
 * Dòng hoạt động — **cũ → mới**, đúng thứ tự máy chủ trả về.
 *
 * Không sắp lại ở đây: thứ tự là `thu_tu` của bảng (mục 6 d.190), và một thứ tự
 * thứ hai ở client sẽ lệch với thứ tự mà vế "mục tạm thời bị mục kế thay chỗ" đã
 * dùng để quyết mục nào bị ẩn.
 */
function KhoiHoatDong({
  ds,
  bay_gio,
}: {
  ds: HoatDongDong[];
  bay_gio: number;
}): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI_PHIEN.hoat_dong} ma="hoat-dong">
      {ds.length === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_KHONG_CO_HOAT_DONG}</p>
      ) : (
        <ol data-ds="hoat-dong" className={LOP_DS_DONG}>
          {ds.map((h) => (
            <li
              key={h.id}
              data-hoat-dong={h.loai ?? 'tra-loi'}
              className={`flex-wrap ${LOP_DONG}`}
            >
              <span data-o="loai" className={`shrink-0 ${LOP_CHIP}`}>
                {h.nhan_loai}
              </span>
              {/* Nội dung dài / một chuỗi liền (đường dẫn) xuống hàng, không tràn 375px. */}
              <span className="min-w-0 whitespace-pre-wrap break-words text-chu">{h.noi_dung}</span>
              {h.ten_thao_tac === null ? null : (
                <span data-o="thao-tac" className="min-w-0 break-all font-mono text-xs text-chu-mo">
                  {h.ten_thao_tac}
                </span>
              )}
              {/* d.190: mục tạm thời **vẫn lưu trong lịch sử**; đánh dấu cho người đọc. */}
              {h.tam_thoi ? (
                <span data-o="tam-thoi" className={LOP_CHU_MO_HON}>
                  tạm thời
                </span>
              ) : null}
              <span className="ml-auto shrink-0">
                <Moc luc={h.gui_luc} bay_gio={bay_gio} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Khoi>
  );
}

/* ================================================================== *
 * 4. Kế hoạch — d.402, mục 6 d.191
 * ================================================================== */

function KhoiKeHoach({
  ke_hoach,
  bay_gio,
}: {
  ke_hoach: KeHoachPhien;
  bay_gio: number;
}): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI_PHIEN.ke_hoach} ma="ke-hoach">
      {/*
       * `phien_ban === 0` là "agent **chưa gửi** kế hoạch nào" — khác hẳn "kế
       * hoạch rỗng" (agent gửi lại một danh sách trống, d.191 cho phép). Máy chủ
       * phân biệt hai ca đó bằng `phien_ban`, nên màn hình cũng vậy.
       */}
      {ke_hoach.phien_ban === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_CHUA_CO_KE_HOACH}</p>
      ) : (
        <>
          <p className={LOP_CHU_PHU}>
            <span data-o="phien-ban">bản {ke_hoach.phien_ban}</span>
            {ke_hoach.gui_luc === null ? null : (
              <>
                {' · '}
                <Moc luc={ke_hoach.gui_luc} bay_gio={bay_gio} />
              </>
            )}
          </p>
          <ol data-ds="buoc" className={LOP_DS_DONG}>
            {ke_hoach.buoc.map((b) => (
              /*
               * `flex-wrap` (THIET-KE "Bảng và danh sách", bài học BAT-66): cột số
               * thứ tự có bề rộng cố định `w-5`, nên dòng phải biết xuống hàng; nội
               * dung `flex-1 min-w-0` co trước, chuỗi liền dài thì `break-words`.
               */
              <li key={b.thu_tu} data-buoc={b.trang_thai} className={`flex-wrap ${LOP_DONG}`}>
                <span className={`w-5 shrink-0 ${LOP_CHU_MO_HON}`}>{b.thu_tu}</span>
                <span className="min-w-0 flex-1 break-words text-chu">{b.noi_dung}</span>
                <span data-o="trang-thai" className={`shrink-0 ${LOP_CHIP}`}>
                  {b.nhan_trang_thai}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Khoi>
  );
}
