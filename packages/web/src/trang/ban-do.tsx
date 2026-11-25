/**
 * **Trang Bản đồ dự án** (`/ban-do-du-an`) — SPEC mục 9 d.294–303, mục 14 d.392.
 *
 * | Vế SPEC | Ở đâu |
 * |---|---|
 * | d.302 bảng mọi dự án, **sáu cột** SPEC kể | `COT_BAN_DO`, `HangBanDoO` |
 * | d.301 trang "Luật chung" (danh sách cấm chung + checklist) | `KhoiLuatChung` |
 * | d.294 agent mới chỉ cần đọc trang hồ sơ | link **Hồ sơ** mỗi hàng |
 * | d.410 thay đổi do agent hiện trong 3 giây | `NHIP_LAM_MOI` (`src/lam-moi.ts`) |
 * | d.412 thời gian tương đối, rê chuột thấy giờ VN | `Moc` (mốc = `bay_gio`) |
 *
 * ## Trang này KHÔNG tính dẫn xuất nào
 *
 * `suc_song`, `so_dang_lam` (cùng nguồn với sidebar d.393 và Tổng quan d.317),
 * `cap_nhat_luc` (mốc **muộn hơn** giữa dự án và hồ sơ của nó), `nhan_trang_thai`:
 * tới **đã tính** từ `GET /v1/man-hinh-ban-do`. Một phép tính thứ hai ở đây là một
 * chỗ để hai màn hình nói hai số khác nhau về cùng một dự án.
 *
 * ## Chỉ chủ
 *
 * Cổng nằm ở **máy chủ** (`manHinhBanDo` ném `FORBIDDEN`), nên trang này không có
 * một phép kiểm quyền thứ hai — nó chỉ hiện câu của máy chủ qua `TrangThaiTai`.
 * Agent đọc hồ sơ bằng `baton profile`, không qua màn hình này.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  LoiApi,
  layManHinhBanDo,
  suaLuatChung,
  type HangBanDo,
  type LuatChung,
} from '../api';
import { NHIP_LAM_MOI, useNhipLamMoi } from '../lam-moi';
import { lamMoiTheoSo } from '../ghi-lac-quan';
import { useMotLan } from '../mot-lan';
import { cauConLai } from '../vo/cau-con-lai';
import { ChamSucSong } from '../vo/cham-suc-song';
import { DauLamMoi } from '../vo/dau-lam-moi';
import { Khoi } from '../vo/khoi';
import { duongDuAn } from '../vo/muc-sidebar';
import {
  LOP_BANG,
  LOP_CAU_CHO,
  LOP_CHU_PHU,
  LOP_DAU_COT,
  LOP_DONG_BANG,
  LOP_HANG_TIEU_DE,
  LOP_LIEN_KET,
  LOP_O_BANG,
  LOP_O_NHAP,
  LOP_THAN_BANG,
  LOP_THE,
  LOP_TIEU_DE_NHO,
  LOP_TIEU_DE_TRANG,
  LOP_VUNG_TRANG,
  NUT_CHINH,
  NUT_MO_KHI_DISABLED,
  NUT_PHU,
} from '../vo/lop-nut';
import { useToast } from '../vo/toast';
import { Markdown } from '../markdown';
import { Moc } from './tong-quan';
import { TrangThaiTai } from './doi-agent';

/** Tiêu đề trang — **cùng chữ** với nhãn sidebar của d.392. */
export const TEN_TRANG_BAN_DO = 'Bản đồ dự án';
export const CAU_DANG_TAI_BAN_DO = 'Đang tải Bản đồ…';
export const CAU_CHUA_CO_DU_AN = 'Chưa có dự án nào.';

/** **Sáu cột của d.302**, đúng thứ tự SPEC kể, cộng một cột link hồ sơ. */
export const COT_BAN_DO = [
  'Tên',
  'Agent quản lý',
  'Thư mục',
  'Đang làm',
  'Sức sống',
  'Cập nhật cuối',
] as const;

/**
 * **Bốn cột thêm** của mục 9 (SPEC 20.1, Chủ chốt T-127 = A 04/11): "trang này giữ
 * dạng bảng, thêm cột Nhóm, Ưu tiên, Đang đẩy, Duy trì". Khai riêng để ca test sáu
 * cột cắt từ d.302 vẫn đo đúng sáu cột cũ.
 */
export const COT_BAN_DO_THEM = ['Nhóm', 'Ưu tiên', 'Đang đẩy', 'Duy trì'] as const;
export const CHU_CO = 'Có';
export const CHU_KHONG = 'Không';

export const NHAN_HO_SO = 'Hồ sơ';
export const CAU_CHUA_CO_HO_SO = 'chưa có hồ sơ';
/** Ô rỗng: một dấu gạch nói "chưa có", khác hẳn một ô trắng (mất dữ liệu). */
export const O_RONG = '—';

/** Câu nói ra phần bị trần cắt — chữ ở `vo/cau-con-lai.ts` (dùng chung với Tổng quan). */
export { cauConLai };

export const TEN_KHOI_LUAT_CHUNG = 'Luật chung';
export const NHAN_DANH_SACH_CAM_CHUNG = 'Danh sách cấm chung';
export const NHAN_CHECKLIST = 'Checklist trước khi giao';
export const CAU_CHUA_SOAN_LUAT_CHUNG = 'Chưa soạn Luật chung.';
export const NHAN_SUA_LUAT_CHUNG = 'Sửa Luật chung';
export const NHAN_LUU_LUAT_CHUNG = 'Lưu Luật chung';
export const NHAN_THOI = 'Thôi';

/**
 * Đường trang hồ sơ của một dự án. SPEC **không** chốt đường này — đề xuất tạm
 * `spec-questions.md` #114 (một vế hẹp của #101). Tham số là **id** dự án, không
 * mã: `GET /v1/du-an/:id/ho-so` tra theo id.
 */
export const duongHoSo = (project_id: string): string =>
  `/du-an/${encodeURIComponent(project_id)}/ho-so`;

export function TrangBanDo(): React.JSX.Element {
  const q = useQuery({
    queryKey: ['ban-do'],
    queryFn: layManHinhBanDo,
    /*
     * d.410: "Đang làm", sức sống và "cập nhật cuối" đổi **do agent** (agent
     * nhận ticket, lên tiếng, sửa hồ sơ) — không chừa màn hình nào.
     */
    ...NHIP_LAM_MOI,
  });
  const { hien_dau } = useNhipLamMoi(q.isFetching, [['ban-do']]);

  return (
    <div className={LOP_VUNG_TRANG}>
      {/* Dấu làm mới **trong** hàng tiêu đề — nếp chung, xem `trang/tong-quan.tsx`. */}
      <div className={LOP_HANG_TIEU_DE}>
        <h1 className={LOP_TIEU_DE_TRANG}>{TEN_TRANG_BAN_DO}</h1>
        <DauLamMoi hien={hien_dau} />
      </div>

      {q.data === undefined ? (
        <TrangThaiTai q={q} cau_dang_tai={CAU_DANG_TAI_BAN_DO} />
      ) : (
        <>
          <Bang ds={q.data.du_an} bay_gio={q.data.bay_gio} />
          {/*
           * Trần của một lượt gọi **nói ra**, không im lặng: d.302 nói "bảng
           * **mọi** dự án", nên một dự án bị cắt mà màn hình không hé răng là
           * màn hình nói dối. Xem `so_con_lai` ở `doc-ho-so.ts`.
           */}
          {q.data.so_con_lai > 0 ? (
            <p data-o="con-lai" className="text-sm text-canh">
              {cauConLai(q.data.so_con_lai)}
            </p>
          ) : null}
          <KhoiLuatChung lc={q.data.luat_chung} bay_gio={q.data.bay_gio} />
        </>
      )}
    </div>
  );
}

/* ================================================================== *
 * Bảng mọi dự án — d.302
 * ================================================================== */

function Bang({ ds, bay_gio }: { ds: HangBanDo[]; bay_gio: number }): React.JSX.Element {
  if (ds.length === 0) {
    return <p className={LOP_CAU_CHO}>{CAU_CHUA_CO_DU_AN}</p>;
  }
  return (
    <div className={`overflow-x-auto ${LOP_THE}`}>
      <table data-bang="ban-do" className={LOP_BANG}>
        <thead>
          <tr>
            {[...COT_BAN_DO, ...COT_BAN_DO_THEM].map((c) => (
              <th key={c} scope="col" className={LOP_DAU_COT}>
                {c}
              </th>
            ))}
            <th scope="col" className={LOP_DAU_COT}>
              {NHAN_HO_SO}
            </th>
          </tr>
        </thead>
        <tbody className={LOP_THAN_BANG}>
          {ds.map((d) => (
            <HangBanDoO key={d.id} d={d} bay_gio={bay_gio} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HangBanDoO({ d, bay_gio }: { d: HangBanDo; bay_gio: number }): React.JSX.Element {
  return (
    <tr data-du-an={d.id} className={LOP_DONG_BANG}>
      <td className={LOP_O_BANG}>
        {/* Tên trỏ về danh sách ticket của dự án (d.395), theo **mã**. */}
        <Link to={duongDuAn(d.ma)} data-o="ten" className="font-medium text-chu hover:underline">
          {d.ten}
        </Link>
        <span data-o="trang-thai" className={`ml-2 ${LOP_CHU_PHU}`}>
          {d.nhan_trang_thai}
        </span>
      </td>
      {/* "agent quản lý" — một **cái tên** đọc được; chưa gán thì nói thẳng. */}
      <td data-o="quan-ly" className={`${LOP_O_BANG} text-chu-mo`}>
        {d.quan_ly_agent_ten ?? O_RONG}
      </td>
      <td data-o="thu-muc" className={`${LOP_O_BANG} font-mono text-xs text-chu-mo`}>
        {d.thu_muc ?? O_RONG}
      </td>
      <td data-o="dang-lam" className={`${LOP_O_BANG} tabular-nums text-chu`}>
        {d.so_dang_lam}
      </td>
      <td data-o="suc-song" className={LOP_O_BANG}>
        <ChamSucSong suc_song={d.suc_song} />
      </td>
      <td className={LOP_O_BANG}>
        <Moc luc={d.cap_nhat_luc} bay_gio={bay_gio} />
      </td>
      {/* Bốn cột thêm của mục 9 (20.1). Không nhóm ⇒ gạch, không bịa "Khác". */}
      <td data-o="nhom" className={`${LOP_O_BANG} text-chu-mo`}>
        {d.nhom ?? O_RONG}
      </td>
      <td data-o="uu-tien" className={`${LOP_O_BANG} tabular-nums text-chu`}>
        {d.uu_tien}
      </td>
      <td data-o="dang-day" className={`${LOP_O_BANG} text-chu`}>
        {d.dang_day ? CHU_CO : CHU_KHONG}
      </td>
      <td data-o="duy-tri" className={`${LOP_O_BANG} text-chu`}>
        {d.duy_tri ? CHU_CO : CHU_KHONG}
      </td>
      <td className={LOP_O_BANG}>
        <Link to={duongHoSo(d.id)} data-o="ho-so" className={LOP_LIEN_KET}>
          {d.co_ho_so ? NHAN_HO_SO : CAU_CHUA_CO_HO_SO}
        </Link>
      </td>
    </tr>
  );
}

/* ================================================================== *
 * Luật chung của workspace — d.301
 * ================================================================== */

/**
 * Hàm thuần: **chỉ phần thật sự đổi** đi vào thân `PUT /v1/luat-chung`.
 *
 * Cùng lý lẽ với `thanSuaHoSo` của trang hồ sơ: gửi cả hai phần mỗi lần lưu là
 * một lần ghi (và một mốc `cap_nhat_luc` mới) cho một lần "lưu mà không đổi gì".
 * Chuỗi rỗng hoá `null` — "rỗng" của một phần là **chưa soạn**.
 */
export function thanSuaLuatChung(
  cu: LuatChung,
  nhap: { danh_sach_cam: string; checklist: string },
): { danh_sach_cam?: string | null; checklist?: string | null } {
  const than: { danh_sach_cam?: string | null; checklist?: string | null } = {};
  const dsc = nhap.danh_sach_cam.trim() === '' ? null : nhap.danh_sach_cam;
  const cl = nhap.checklist.trim() === '' ? null : nhap.checklist;
  if (dsc !== cu.danh_sach_cam) than.danh_sach_cam = dsc;
  if (cl !== cu.checklist) than.checklist = cl;
  return than;
}

function KhoiLuatChung({
  lc,
  bay_gio,
}: {
  lc: LuatChung;
  bay_gio: number;
}): React.JSX.Element {
  const [sua, datSua] = useState(false);
  const [nhap, datNhap] = useState({ danh_sach_cam: '', checklist: '' });
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  /*
   * BAT-29: thân tính **lúc bấm** và đi trong BIẾN. Đích là hằng (Luật chung một
   * bản cho cả workspace), nhưng `mutationFn` của mutation đang treo (vd mất mạng)
   * là hàm của lần vẽ mới nhất: tính diff trên `lc`/`nhap` của closure là gửi một
   * thân khác thân chủ đã bấm Lưu. Cùng khuôn mọi mutation khác cho đồng nhất.
   */
  const mot = useMotLan();
  const luu = useMutation({
    mutationFn: (than: ReturnType<typeof thanSuaLuatChung>) => suaLuatChung(than),
    onSuccess: () => {
      datSua(false);
      void lamMoiTheoSo(qc, { queryKey: ['ban-do'] });
    },
    onError: (e: Error) => {
      toast.bao(e instanceof LoiApi ? e.message : String(e.message));
    },
  });

  const rong = lc.danh_sach_cam === null && lc.checklist === null;

  /*
   * BAT-68: khối chung `vo/khoi` (đầu khối `header` `LOP_DAU_KHOI`, `flex-wrap`
   * ở 375px) thay `h2` tự viết — `h2` cũ chứa cả mốc và nút "Sửa Luật chung",
   * nên tên tiêu đề đọc ra lẫn chữ của nút. Mốc + nút là phần phụ bên phải; nội
   * dung và biểu mẫu sửa nằm trong thẻ lớp nổi (THIET-KE "Trang": biểu mẫu Luật
   * chung là `LOP_THE` + `p-3`), như khối Mục của Hồ sơ dự án.
   */
  return (
    <Khoi
      ten={TEN_KHOI_LUAT_CHUNG}
      ma="luat-chung"
      phu={
        <div data-o="phu-luat-chung" className="flex min-w-0 flex-wrap items-center gap-2">
          {lc.cap_nhat_luc === null ? null : <Moc luc={lc.cap_nhat_luc} bay_gio={bay_gio} />}
          {sua ? null : (
            <button
              type="button"
              data-nut="mo-sua-luat-chung"
              onClick={() => {
                /*
                 * Nạp **giá trị hiện tại** vào ô nhập, không để rỗng: một ô rỗng
                 * biến mỗi lần mở-rồi-lưu thành một lần **xoá sạch Luật chung** —
                 * tức xoá đúng danh sách cấm đang ràng mọi agent.
                 */
                datNhap({
                  danh_sach_cam: lc.danh_sach_cam ?? '',
                  checklist: lc.checklist ?? '',
                });
                datSua(true);
              }}
              className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
            >
              {NHAN_SUA_LUAT_CHUNG}
            </button>
          )}
        </div>
      }
    >
      {sua ? (
        <div data-o="sua-luat-chung" className={`flex flex-col gap-3 p-3 ${LOP_THE}`}>
          <label className="flex flex-col gap-1 text-sm">
            <span className={LOP_CHU_PHU}>{NHAN_DANH_SACH_CAM_CHUNG}</span>
            <textarea
              data-nhap="danh-sach-cam"
              value={nhap.danh_sach_cam}
              onChange={(e) => {
                datNhap((t) => ({ ...t, danh_sach_cam: e.target.value }));
              }}
              rows={4}
              className={LOP_O_NHAP}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className={LOP_CHU_PHU}>{NHAN_CHECKLIST}</span>
            <textarea
              data-nhap="checklist"
              value={nhap.checklist}
              onChange={(e) => {
                datNhap((t) => ({ ...t, checklist: e.target.value }));
              }}
              rows={4}
              className={LOP_O_NHAP}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-nut="luu-luat-chung"
              disabled={luu.isPending}
              onClick={() => {
                // BAT-32: chốt ref đồng bộ — hai lần bấm liền chỉ gửi một lệnh.
                mot((tha) => {
                  luu.mutate(thanSuaLuatChung(lc, nhap), { onSettled: tha });
                });
              }}
              className={`rounded px-3 py-1 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
            >
              {NHAN_LUU_LUAT_CHUNG}
            </button>
            <button
              type="button"
              data-nut="thoi-luat-chung"
              onClick={() => {
                datSua(false);
              }}
              className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
            >
              {NHAN_THOI}
            </button>
          </div>
        </div>
      ) : rong ? (
        <p className={LOP_CAU_CHO}>{CAU_CHUA_SOAN_LUAT_CHUNG}</p>
      ) : (
        <div data-o="noi-dung-luat-chung" className={`flex min-w-0 flex-col gap-3 p-3 ${LOP_THE}`}>
          <MucVan nhan={NHAN_DANH_SACH_CAM_CHUNG} ma="danh-sach-cam" van={lc.danh_sach_cam} />
          <MucVan nhan={NHAN_CHECKLIST} ma="checklist" van={lc.checklist} />
        </div>
      )}
    </Khoi>
  );
}

/**
 * Một mục markdown đã soạn. `null` ⇒ **không vẽ gì**: một tiêu đề trống dưới một
 * khối trống chỉ làm trang dài hơn mà không nói thêm điều gì.
 */
export function MucVan({
  nhan,
  ma,
  van,
}: {
  nhan: string;
  ma: string;
  van: string | null;
}): React.JSX.Element | null {
  if (van === null || van.trim() === '') return null;
  /*
   * BAT-68: `min-w-0 break-words` — chữ tự do dài (đường dẫn, lệnh liền) xuống
   * hàng ở 375px (THIET-KE "Chữ tự do dài trong dòng"); khối code của `Markdown`
   * tự cuộn ngang trong chính nó (`overflow-x-auto`). Tiêu đề mục `LOP_TIEU_DE_NHO`
   * (bậc `h3`). Bên trong `Markdown` dùng chung với bối cảnh Cần Chủ và bình luận
   * ticket nên không sửa ở lượt này.
   */
  return (
    <div data-muc={ma} className="flex min-w-0 flex-col gap-1 break-words">
      <h3 className={LOP_TIEU_DE_NHO}>{nhan}</h3>
      {/* d.296 "markdown từng mục" — cùng bộ dựng markdown với bình luận ticket. */}
      <Markdown van={van} />
    </div>
  );
}
