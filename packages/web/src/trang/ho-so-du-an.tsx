/**
 * **Trang hồ sơ một dự án** (`/du-an/:id/ho-so`) — SPEC mục 9 d.294–303.
 *
 * | Vế SPEC | Ở đâu |
 * |---|---|
 * | d.296 "Là gì", thư mục, repo (chủ/tên, nhánh), stack | `MUC_HO_SO` 1–6 |
 * | d.297 "Đọc trước", cách deploy và ai chạy, danh sách cấm riêng | `MUC_HO_SO` 7–9 |
 * | d.299 **Lỗi đã gặp** (ngày, lỗi, cách tránh), **chỉ thêm** | `KhoiLoiDaGap` |
 * | d.300 cờ "dự án không code", cờ "bắt buộc review" | `Co` ở đầu trang |
 * | d.303 "mỗi lần sửa hồ sơ ghi lịch sử phiên bản" | `KhoiLichSu` |
 * | d.294 trang "đọc trước" cho agent và cho chủ | bố cục đọc trước, sửa sau |
 *
 * ## Danh sách "Lỗi đã gặp" CHỈ THÊM — và trang này không có đường nào khác
 *
 * d.299 gọi nó là một danh sách **chỉ thêm**. Nên ở đây có **một** ô thêm, và
 * **không** một nút sửa hay xoá nào cho một mục đã có; `api.ts` cũng không có hàm
 * cho hai việc đó, máy chủ không có route, và trigger của migration 0018 khoá ở
 * tầng dữ liệu. Sự vắng mặt đó là **nội dung**, không phải thiếu sót — có một ca
 * test ghim nó.
 *
 * ## Hai cờ của d.300 là của DỰ ÁN, không của hồ sơ
 *
 * Chúng sống ở `project` (mục 2) và trang này chỉ **hiện** chúng. Cho sửa ở đây
 * là nhân bản một ô nhập cho cùng một trường ở hai trang, tức hai chỗ để lệch.
 *
 * ## Ai sửa được
 *
 * Cổng nằm ở **máy chủ**: sửa hồ sơ chỉ chủ, thêm "Lỗi đã gặp" thì chủ hoặc agent
 * **được vào dự án** (đề xuất tạm `cau-hoi-spec.md` #113 — mục 9 không nói ai
 * sửa). Trang không kiểm quyền lần hai; máy chủ từ chối thì câu của máy chủ hiện
 * nguyên văn thành toast.
 *
 * ## `:id`, không `:ma`
 *
 * `GET /v1/du-an/:id/ho-so` nhận **id** dự án (`layDuAn` tra theo `id`), khác
 * `/du-an/:ma` của danh sách ticket (d.395 dùng mã). Đường tới đây luôn sinh từ
 * `duongHoSo(d.id)` của trang Bản đồ, nên không có chỗ nào gõ tay một mã vào đây.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  LoiApi,
  layDuAn,
  layHoSo,
  suaHoSo,
  themLoiDaGap,
  type BanHoSo,
  type HoSo,
  type LoiDaGap,
  type MucHoSo,
} from '../api';
import { ThanhCongCuDuAn, cacNhom, type SuaDuAnTrong } from '../vo/thanh-cong-cu-du-an';
import { NHIP_LAM_MOI, useNhipLamMoi } from '../lam-moi';
import { lamMoiTheoSo } from '../ghi-lac-quan';
import { useMotLan } from '../mot-lan';
import { DauLamMoi } from '../vo/dau-lam-moi';
import { Khoi } from '../vo/khoi';
import {
  LOP_CAU_CHO,
  LOP_CHIP_CANH,
  LOP_CHU_MO_HON,
  LOP_CHU_PHU,
  LOP_DONG,
  LOP_DONG_NHIEU_TANG,
  LOP_DS_DONG,
  LOP_HANG_TIEU_DE,
  LOP_LIEN_KET,
  LOP_O_NHAP,
  LOP_THE,
  LOP_TIEU_DE_TRANG,
  LOP_VUNG_TRANG,
  NUT_CHINH,
  NUT_MO_KHI_DISABLED,
  NUT_PHU,
} from '../vo/lop-nut';
import { duongDuAn } from '../vo/muc-sidebar';
import { useToast } from '../vo/toast';
import { Moc } from './tong-quan';
import { TrangThaiTai, duongAgent } from './doi-agent';
import { MucVan, NHAN_THOI, O_RONG } from './ban-do';

export const CAU_DANG_TAI_HO_SO = 'Đang tải hồ sơ…';
export const CAU_CHUA_CO_HO_SO_NAO = 'Dự án này chưa có hồ sơ. Bấm Sửa hồ sơ để bắt đầu điền.';

/** Khoá mục ↔ nhãn — **chín mục của d.296–298**, đúng thứ tự SPEC kể. */
export const MUC_HO_SO: readonly { khoa: keyof MucHoSo; nhan: string }[] = [
  { khoa: 'la_gi', nhan: 'Là gì' },
  { khoa: 'thu_muc', nhan: 'Thư mục hoặc nguồn' },
  { khoa: 'repo_chu_so_huu', nhan: 'Repo — chủ sở hữu' },
  { khoa: 'repo_ten', nhan: 'Repo — tên' },
  { khoa: 'repo_nhanh_mac_dinh', nhan: 'Repo — nhánh mặc định' },
  { khoa: 'stack', nhan: 'Stack' },
  { khoa: 'doc_truoc', nhan: 'Đọc trước' },
  { khoa: 'cach_deploy', nhan: 'Cách deploy và ai chạy' },
  { khoa: 'danh_sach_cam', nhan: 'Danh sách cấm riêng' },
];

/** Hai cờ của d.300 — đúng chữ của SPEC. */
export const NHAN_KHONG_CODE = 'Dự án không code';
export const NHAN_BAT_BUOC_REVIEW = 'Bắt buộc review';

export const NHAN_SUA_HO_SO = 'Sửa hồ sơ';
export const NHAN_LUU_HO_SO = 'Lưu hồ sơ';
// `NHAN_THOI` dùng chung với khối Luật chung — khai một chỗ (`ban-do.tsx`).
export { NHAN_THOI };

export const TEN_KHOI_LOI_DA_GAP = 'Lỗi đã gặp';
export const CAU_CHUA_CO_LOI = 'Chưa có lỗi nào được ghi.';
export const NHAN_THEM_LOI = 'Thêm một lỗi';
export const NHAN_LOI = 'Lỗi';
export const NHAN_CACH_TRANH = 'Cách tránh';
export const NHAN_GUI_LOI = 'Ghi vào Lỗi đã gặp';
/** Lý do nút Gửi đang mờ — nói trước điều kiện, không dịch lỗi máy chủ. */
export const CAU_CAN_LOI = 'Phải nói lỗi là gì.';

export const TEN_KHOI_LICH_SU = 'Lịch sử phiên bản';
export const CAU_CHUA_CO_BAN = 'Chưa có bản nào trước bản hiện tại.';
export const NHAN_CHU = 'Chủ';

/** Hàm thuần: mục "Lỗi đã gặp" đã đủ để ghi chưa — d.299 đòi "lỗi". */
export function coTheGhiLoi(loi: string): boolean {
  return loi.trim() !== '';
}

/**
 * Hàm thuần: **chỉ những mục thật sự đổi** đi vào thân `PATCH`.
 *
 * Gửi cả chín mục mỗi lần lưu sẽ làm máy chủ chụp một phiên bản (d.303) cho một
 * lần "lưu mà không đổi gì" — tức lịch sử đầy những bản y hệt nhau. Chuỗi rỗng
 * hoá `null`: d.296 nói mục là markdown, và "rỗng" của một mục là **chưa có**.
 */
export function thanSuaHoSo(
  cu: MucHoSo,
  nhap: Record<string, string>,
): Partial<MucHoSo> {
  const than: Partial<MucHoSo> = {};
  for (const { khoa } of MUC_HO_SO) {
    const v = nhap[khoa];
    if (v === undefined) continue;
    const moi = v.trim() === '' ? null : v;
    if (moi !== cu[khoa]) than[khoa] = moi;
  }
  return than;
}

/** Hàm thuần: áp thân sửa dự án (thanh công cụ 20.8) vào thân hồ sơ — ghi lạc quan. */
export function apHoSo(hs: HoSo, project_id: string, sua: SuaDuAnTrong): HoSo {
  if (hs.du_an.id !== project_id) return hs;
  return { ...hs, du_an: { ...hs.du_an, ...sua(hs.du_an) } };
}

/** Đọc dự án trong thân hồ sơ — cặp với `apHoSo`. */
export const layTrongHoSo = (hs: HoSo, project_id: string): HoSo['du_an'] | undefined =>
  hs.du_an.id === project_id ? hs.du_an : undefined;

/* ================================================================== *
 * 1. Trang
 * ================================================================== */

export function TrangHoSoDuAn({ id }: { id: string }): React.JSX.Element {
  const khoa = ['ho-so', id] as const;
  const q = useQuery({
    queryKey: khoa,
    queryFn: () => layHoSo(id),
    // d.410: agent **ghi được** "Lỗi đã gặp" (d.299), nên lớp này đổi do agent.
    ...NHIP_LAM_MOI,
  });
  const { hien_dau } = useNhipLamMoi(q.isFetching, [khoa]);
  /*
   * Gợi ý ô Nhóm (20.8) đọc **cache** `['du-an']` của sidebar, không gọi thêm:
   * `enabled: false` (nếp `thanh-tren.tsx`). Chưa có thì gợi ý rỗng, ô vẫn gõ được.
   */
  const ds_du_an = useQuery({ queryKey: ['du-an'], queryFn: layDuAn, enabled: false });
  const nhom_goi_y = cacNhom(ds_du_an.data?.items ?? []);

  if (q.data === undefined) {
    return (
      <div className={LOP_VUNG_TRANG}>
        <TrangThaiTai q={q} cau_dang_tai={CAU_DANG_TAI_HO_SO} />
      </div>
    );
  }

  const hs: HoSo = q.data;

  return (
    <div data-o="trang-ho-so" className={LOP_VUNG_TRANG}>
      <header className="flex flex-col gap-2">
        <div className={LOP_HANG_TIEU_DE}>
          <h1 className={LOP_TIEU_DE_TRANG}>{hs.du_an.ten}</h1>
          <DauLamMoi hien={hien_dau} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link to={duongDuAn(hs.du_an.ma)} data-o="ma-du-an" className="ma-ticket hover:text-chu">
            {hs.du_an.ma}
          </Link>
          {/* Hai cờ của d.300 — chỉ hiện khi **bật**, và hiện đúng chữ SPEC. */}
          {hs.khong_code ? <Co ma="khong-code" nhan={NHAN_KHONG_CODE} /> : null}
          {hs.bat_buoc_review ? <Co ma="bat-buoc-review" nhan={NHAN_BAT_BUOC_REVIEW} /> : null}
          <span data-o="phien-ban" className="text-chu-mo">
            {hs.phien_ban === 0 ? CAU_CHUA_CO_HO_SO_NAO_NGAN : `bản ${String(hs.phien_ban)}`}
          </span>
          {hs.cap_nhat_luc === null ? null : (
            <Moc luc={hs.cap_nhat_luc} bay_gio={hs.bay_gio} />
          )}
        </div>
        {hs.du_an.quan_ly_agent_id === null ? null : (
          <p className={LOP_CHU_PHU}>
            Agent quản lý:{' '}
            <Link to={duongAgent(hs.du_an.quan_ly_agent_id)} data-o="quan-ly" className={LOP_LIEN_KET}>
              {/*
               * **Tên** agent, không id: id là chuỗi của máy, còn Bản đồ đã hiện
               * tên ở cột "agent quản lý" (d.302) — hai trang nói hai thứ khác
               * nhau về cùng một agent là một trang nói sai.
               */}
              {hs.du_an.quan_ly_agent_ten ?? hs.du_an.quan_ly_agent_id}
            </Link>
          </p>
        )}
        {/* Thanh công cụ ở đầu trang dự án — SPEC 20.8. */}
        <ThanhCongCuDuAn<HoSo>
          project_id={hs.du_an.id}
          ten={hs.du_an.ten}
          du_an={hs.du_an}
          dat_boi={hs.du_an.dat_boi}
          bay_gio={hs.bay_gio}
          khoa={khoa}
          lay={layTrongHoSo}
          ap={apHoSo}
          nhom_goi_y={nhom_goi_y}
        />
      </header>

      {/*
       * BAT-30: `key` theo dự án. Route `/du-an/:id/ho-so` giữ nguyên instance khi
       * `:id` đổi (cùng phần tử, cùng vị trí), nên state bản nháp (`sua`/`nhap`,
       * `mo`/`loi`/`cach_tranh`) của dự án A sẽ mang sang B — Lưu ở B ghi nội dung
       * gõ cho A vào B. Và `onSuccess` của một lần Lưu A (treo vì mất mạng) về sau
       * sẽ xoá bản nháp đang gõ ở B. Có `key`, mỗi dự án có state riêng; `onSuccess`
       * của A chỉ chạm instance của A (đã tháo), còn `lamMoiTheoSo` vẫn làm mới
       * khoá của A vì khoá nằm trong biến `b.khoa`.
       */}
      <KhoiMuc key={`muc-${id}`} hs={hs} khoa={khoa} />
      <KhoiLoiDaGap key={`loi-${id}`} id={id} ds={hs.loi_da_gap} khoa={khoa} />
      <KhoiLichSu ds={hs.lich_su_ban} bay_gio={hs.bay_gio} />
    </div>
  );
}

export const CAU_CHUA_CO_HO_SO_NAO_NGAN = 'chưa có hồ sơ';

/**
 * Một cờ của d.300 đang bật: chip cảnh báo `LOP_CHIP_CANH` — viền mờ, chữ `canh`,
 * **không tô nền** (THIET-KE "Chip", BAT-67 bỏ `bg-canh-nen`).
 */
function Co({ ma, nhan }: { ma: string; nhan: string }): React.JSX.Element {
  return (
    <span data-co={ma} className={LOP_CHIP_CANH}>
      {nhan}
    </span>
  );
}

/*
 * Các khối dùng `Khoi` chung (`vo/khoi.tsx`, BAT-67): đầu khối `header`
 * `LOP_DAU_KHOI` — đã có `flex-wrap`, nên nút "Sửa hồ sơ" / "Thêm một lỗi" bên
 * phải xuống hàng ở 375px như đầu khối tự viết cũ.
 */

/* ================================================================== *
 * 2. Chín mục của d.296–298 — đọc, và chủ sửa được
 * ================================================================== */

export const TEN_KHOI_MUC = 'Hồ sơ';

function KhoiMuc({
  hs,
  khoa,
}: {
  hs: HoSo;
  khoa: readonly unknown[];
}): React.JSX.Element {
  const [sua, datSua] = useState(false);
  const [nhap, datNhap] = useState<Record<string, string>>({});
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  /*
   * BAT-29: đích (dự án), thân và khoá đi trong BIẾN, tính lúc bấm Lưu.
   * `mutationFn`/`onSuccess` là của lần vẽ **mới nhất** (TanStack đẩy `setOptions`
   * vào mutation đang treo — vd treo vì mất mạng): đọc `hs` của closure thì sang
   * hồ sơ dự án khác giữa chừng là ghi các mục vừa gõ vào **dự án kia**.
   */
  const mot = useMotLan();
  const luu = useMutation({
    mutationFn: (b: { project_id: string; than: Partial<MucHoSo>; khoa: readonly unknown[] }) =>
      suaHoSo(b.project_id, b.than),
    onSuccess: (_kq, b) => {
      datSua(false);
      datNhap({});
      void lamMoiTheoSo(qc, { queryKey: b.khoa });
    },
    onError: (loi: Error) => {
      toast.bao(loi instanceof LoiApi ? loi.message : String(loi.message));
    },
  });

  if (!sua) {
    const co_gi = MUC_HO_SO.some(({ khoa: k }) => hs[k] !== null && hs[k] !== '');
    return (
      <Khoi
        ten={TEN_KHOI_MUC}
        ma="muc"
        phu={
          <button
            type="button"
            data-nut="mo-sua"
            onClick={() => {
              /*
               * Nạp **giá trị hiện tại** vào ô nhập, không để rỗng: một ô rỗng
               * sẽ biến mỗi lần mở-rồi-lưu thành một lần **xoá sạch hồ sơ**.
               */
              const d: Record<string, string> = {};
              for (const { khoa: k } of MUC_HO_SO) d[k] = hs[k] ?? '';
              datNhap(d);
              datSua(true);
            }}
            className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
          >
            {NHAN_SUA_HO_SO}
          </button>
        }
      >
        {co_gi ? (
          <div className={`flex flex-col gap-3 p-3 ${LOP_THE}`}>
            {MUC_HO_SO.map(({ khoa: k, nhan }) => (
              <MucVan key={k} nhan={nhan} ma={k} van={hs[k]} />
            ))}
          </div>
        ) : (
          <p data-o="chua-co-ho-so" className={LOP_CAU_CHO}>
            {CAU_CHUA_CO_HO_SO_NAO}
          </p>
        )}
      </Khoi>
    );
  }

  return (
    <Khoi ten={TEN_KHOI_MUC} ma="muc">
      <div className="flex flex-col gap-2">
        {MUC_HO_SO.map(({ khoa: k, nhan }) => (
          <label key={k} className="flex flex-col gap-1 text-sm">
            <span className={LOP_CHU_PHU}>{nhan}</span>
            <textarea
              data-nhap={k}
              value={nhap[k] ?? ''}
              onChange={(e) => {
                datNhap((t) => ({ ...t, [k]: e.target.value }));
              }}
              rows={k === 'la_gi' || k === 'doc_truoc' || k === 'danh_sach_cam' ? 4 : 1}
              className={LOP_O_NHAP}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-nut="luu-ho-so"
          disabled={luu.isPending}
          onClick={() => {
            // BAT-32: chốt ref đồng bộ — hai lần bấm liền chỉ gửi một lệnh.
            mot((tha) => {
              luu.mutate(
                { project_id: hs.project_id, than: thanSuaHoSo(hs, nhap), khoa },
                { onSettled: tha },
              );
            });
          }}
          className={`rounded px-3 py-1 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
        >
          {NHAN_LUU_HO_SO}
        </button>
        <button
          type="button"
          data-nut="thoi"
          onClick={() => {
            datSua(false);
            datNhap({});
          }}
          className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
        >
          {NHAN_THOI}
        </button>
      </div>
    </Khoi>
  );
}

/* ================================================================== *
 * 3. Lỗi đã gặp — d.299, CHỈ THÊM
 * ================================================================== */

function KhoiLoiDaGap({
  id,
  ds,
  khoa,
}: {
  id: string;
  ds: LoiDaGap[];
  khoa: readonly unknown[];
}): React.JSX.Element {
  const [mo, datMo] = useState(false);
  const [loi, datLoi] = useState('');
  const [cach_tranh, datCachTranh] = useState('');
  const qc: QueryClient = useQueryClient();
  const toast = useToast();

  // BAT-29: đích + thân + khoá trong BIẾN (xem `luu` của `KhoiMuc`).
  const mot = useMotLan();
  const them = useMutation({
    mutationFn: (b: {
      project_id: string;
      than: { loi: string; cach_tranh: string | null };
      khoa: readonly unknown[];
    }) => themLoiDaGap(b.project_id, b.than),
    onSuccess: (_kq, b) => {
      /*
       * BAT-31: mỗi ô chỉ về rỗng khi còn TRÙNG đúng nội dung đã gửi (`b.than`),
       * như nhật ký (BAT-30). Lưu chậm, chủ gõ tiếp ⇒ phần gõ thêm không mất.
       * `cach_tranh` đã gửi là `null` khi ô trắng: so với dạng đã chuẩn hoá.
       */
      datLoi((hien) => (hien === b.than.loi ? '' : hien));
      datCachTranh((hien) =>
        (hien.trim() === '' ? null : hien) === b.than.cach_tranh ? '' : hien,
      );
      void lamMoiTheoSo(qc, { queryKey: b.khoa });
    },
    onError: (e: Error) => {
      toast.bao(e instanceof LoiApi ? e.message : String(e.message));
    },
  });

  const du = coTheGhiLoi(loi);

  return (
    <Khoi
      ten={TEN_KHOI_LOI_DA_GAP}
      ma="loi-da-gap"
      phu={
        mo ? null : (
          <button
            type="button"
            data-nut="mo-them-loi"
            onClick={() => {
              datMo(true);
            }}
            className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
          >
            {NHAN_THEM_LOI}
          </button>
        )
      }
    >
      {mo ? (
        <div className={`flex flex-col gap-2 p-3 ${LOP_THE}`}>
          <label className="flex flex-col gap-1 text-sm">
            <span className={LOP_CHU_PHU}>{NHAN_LOI}</span>
            <textarea
              data-nhap="loi"
              value={loi}
              onChange={(e) => {
                datLoi(e.target.value);
              }}
              rows={2}
              className={LOP_O_NHAP}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className={LOP_CHU_PHU}>{NHAN_CACH_TRANH}</span>
            <textarea
              data-nhap="cach-tranh"
              value={cach_tranh}
              onChange={(e) => {
                datCachTranh(e.target.value);
              }}
              rows={2}
              className={LOP_O_NHAP}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-nut="gui-loi"
              disabled={!du || them.isPending}
              onClick={() => {
                // BAT-32: chốt ref đồng bộ — hai lần bấm liền chỉ gửi một lệnh.
                mot((tha) => {
                  them.mutate(
                    {
                      project_id: id,
                      than: { loi, cach_tranh: cach_tranh.trim() === '' ? null : cach_tranh },
                      khoa,
                    },
                    { onSettled: tha },
                  );
                });
              }}
              className={`rounded px-3 py-1 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
            >
              {NHAN_GUI_LOI}
            </button>
            {du ? null : (
              <span data-o="can-loi" className={LOP_CHU_PHU}>
                {CAU_CAN_LOI}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {ds.length === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_CHUA_CO_LOI}</p>
      ) : (
        <ul data-ds="loi-da-gap" className={LOP_DS_DONG}>
          {ds.map((l) => (
            /*
             * Dòng nhiều tầng (THIET-KE "Bảng và danh sách", như Nhật ký): hàng
             * trên chữ phụ (ngày · ai ghi), dưới là nội dung chữ chính. Lỗi và
             * cách tránh là chữ tự do ⇒ `break-words` để một chuỗi liền dài (đường
             * dẫn, lệnh) xuống hàng ở 375px thay vì tràn ngang.
             */
            <li
              key={l.id}
              data-loi={l.id}
              className={LOP_DONG_NHIEU_TANG}
            >
              <div className={`flex flex-wrap items-center gap-2 ${LOP_CHU_PHU}`}>
                {/* "ngày" của d.299 — máy chủ đổi theo múi giờ nghiệp vụ. */}
                <span data-o="ngay" className={LOP_CHU_MO_HON}>
                  {l.ngay}
                </span>
                <span data-o="ghi-boi" className="min-w-0 break-all">
                  {l.ghi_boi_agent_id === null ? NHAN_CHU : l.ghi_boi_agent_id}
                </span>
              </div>
              <p data-o="loi" className="whitespace-pre-wrap break-words text-chu">
                {l.loi}
              </p>
              <p data-o="cach-tranh" className="break-words text-chu-mo">
                <span className={LOP_CHU_PHU}>{NHAN_CACH_TRANH}: </span>
                {l.cach_tranh ?? O_RONG}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Khoi>
  );
}

/* ================================================================== *
 * 4. Lịch sử phiên bản — d.303
 * ================================================================== */

function KhoiLichSu({ ds, bay_gio }: { ds: BanHoSo[]; bay_gio: number }): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI_LICH_SU} ma="lich-su">
      {ds.length === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_CHUA_CO_BAN}</p>
      ) : (
        <ul data-ds="lich-su" className={LOP_DS_DONG}>
          {ds.map((b) => (
            <li key={b.id} data-ban={String(b.phien_ban)} className={`flex-wrap ${LOP_DONG}`}>
              <span className="text-chu tabular-nums">bản {b.phien_ban}</span>
              <Moc luc={b.luc} bay_gio={bay_gio} />
              {/* Người sửa dồn phải, chữ phụ (THIET-KE "Bảng và danh sách"). */}
              <span data-o="sua-boi" className={`ml-auto min-w-0 truncate ${LOP_CHU_PHU}`} title={b.sua_boi_agent_id ?? NHAN_CHU}>
                {b.sua_boi_agent_id ?? NHAN_CHU}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Khoi>
  );
}
