/**
 * **Nhật ký quyết định** (`/nhat-ky`) — SPEC mục 10 d.306–312, mục 14 d.392.
 *
 * | Vế SPEC | Ở đâu |
 * |---|---|
 * | d.308 sáu trường của một dòng | `Dong` (lúc · ai · dự án · quyết định · vì sao · căn cứ) |
 * | d.309 "chỉ thêm", dòng cũ hiện "đã có quyết định mới" | `CAU_DA_CO_MOI`; **không có nút sửa/xoá nào** |
 * | d.311 **gom theo ngày** | `nhom_theo_ngay` của máy chủ |
 * | d.311 **lọc theo dự án** và **theo ai** | `ThanhLoc` (ghi trên URL) |
 * | d.311 **tìm theo chữ** | ô tìm → `?tim=` |
 * | 19.12 câu 4 lớp "Chung" là dự án **rỗng** | `LOC_CHUNG`, nhãn `NHAN_CHUNG` |
 * | 19.12 câu 62 "vì sao" **không rỗng** | nút Gửi mờ tới khi có "vì sao" |
 * | d.312 cảnh báo mẫu dữ liệu nhân sự | toast từ `canh_bao` của máy chủ |
 * | d.410 thay đổi do agent hiện trong 3 giây | `NHIP_LAM_MOI_DANH_SACH` (`src/lam-moi.ts`) |
 * | d.412 thời gian tương đối, rê chuột thấy giờ VN | `Moc` (mốc = `bay_gio`) |
 *
 * ## "Tìm theo chữ" của mục 10 KHÁC `Cmd/Ctrl+K`
 *
 * 19.12 câu 8 chốt phạm vi của command menu (mã ticket, tiêu đề, T-số…) và nói
 * thẳng: *"Việc 'tìm theo chữ' của Nhật ký quyết định ở mục 10 **vẫn giữ nguyên**"*.
 * Nên ô tìm ở đây là **một luật khác**, tìm trong trường "quyết định" của máy chủ
 * (`?tim=`), và nó không được gộp vào command menu của lượt sau.
 *
 * ## Trang này KHÔNG tính dẫn xuất nào
 *
 * Ngày gom (`ngay` — đổi theo múi giờ **nghiệp vụ** của 19.12 câu 60),
 * `nhom_theo_ngay`, `da_co_quyet_dinh_moi` (d.309 là một dẫn xuất, **không** một
 * cột — bật nó bằng `UPDATE` là đúng cái d.309 cấm), `ma_can_chu` của căn cứ: tới
 * **đã tính** từ `GET /v1/man-hinh-nhat-ky`.
 *
 * ## Không có đường sửa, không có đường xoá
 *
 * d.309: "Chỉ thêm. Không sửa, không xoá, **kể cả chủ**." Nên trang này không có
 * nút nào cho hai việc đó, và `api.ts` không có hàm nào gọi chúng — máy chủ cũng
 * không có route (khoá ở trigger của migration 0014). Sự vắng mặt đó là **nội
 * dung**, không phải thiếu sót; có một ca test ghim nó.
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  LoiApi,
  ghiNhatKy,
  layDuAn,
  layAgent,
  layManHinhNhatKy,
  type DongNhatKy,
  type ManHinhNhatKy,
} from '../api';
import { NHIP_LAM_MOI_DANH_SACH, useNhipLamMoi } from '../lam-moi';
import { lamMoiTheoSo } from '../ghi-lac-quan';
import { useMotLan } from '../mot-lan';
import { DauLamMoi } from '../vo/dau-lam-moi';
import {
  LOP_CAU_CHO,
  LOP_CHIP,
  LOP_CHIP_CANH,
  LOP_CHU_PHU,
  LOP_DONG_NHIEU_TANG,
  LOP_DS_DONG,
  LOP_HANG_TIEU_DE,
  LOP_LIEN_KET,
  LOP_O_NHAP,
  LOP_THE,
  LOP_TIEU_DE_MUC,
  LOP_TIEU_DE_TRANG,
  LOP_VUNG_TRANG,
  NUT_CHINH,
  NUT_MO_KHI_DISABLED,
  NUT_PHU,
} from '../vo/lop-nut';
import { useToast } from '../vo/toast';
import { Moc } from './tong-quan';
import { TrangThaiTai, duongAgent } from './doi-agent';

/** Tiêu đề trang — **cùng chữ** với nhãn sidebar của d.392. */
export const TEN_TRANG_NHAT_KY = 'Nhật ký quyết định';
export const CAU_DANG_TAI_NHAT_KY = 'Đang tải Nhật ký…';
export const CAU_CHUA_CO_DONG = 'Chưa có dòng quyết định nào.';

/** d.309 — chữ hiện trên **dòng cũ** khi đã có dòng mới trỏ về nó. */
export const CAU_DA_CO_MOI = 'đã có quyết định mới';

/** 19.12 câu 4 — nhãn hiển thị của **giá trị rỗng** ở trường dự án. */
export const NHAN_CHUNG = 'Chung';

/** Giá trị `?project_id=` nghĩa là "chỉ dòng Chung" — đúng quy ước máy chủ. */
export const LOC_CHUNG = 'chung';
/** Giá trị `?ai=` nghĩa là "dòng của chủ" — đúng quy ước máy chủ. */
export const LOC_AI_CHU = 'chu';

export const NHAN_CHU = 'Chủ';

/** Khoá bộ lọc **trên URL** — cùng nếp d.397 của danh sách ticket. */
export const KHOA_LOC_NHAT_KY = { du_an: 'du_an', ai: 'ai', tim: 'tim' } as const;

export const NHAN_LOC = {
  du_an: 'Dự án',
  ai: 'Ai',
  tim: 'Tìm theo chữ',
} as const;

export const NHAN_TAT_CA = 'Tất cả';
export const NHAN_GHI_DONG = 'Ghi một dòng';
export const NHAN_GUI_DONG = 'Ghi vào Nhật ký';
export const NHAN_QUYET_DINH = 'Quyết định';
export const NHAN_VI_SAO = 'Vì sao';

/**
 * **19.12 câu 62** — câu nói rõ vì sao nút Gửi đang mờ.
 *
 * Một nút mờ không có lời giải thích là một màn hình chủ không biết phải làm gì.
 * Câu này **không** phải một bản dịch mã lỗi của máy chủ (máy chủ vẫn là tầng
 * quyết định, cùng với ràng buộc DB): nó chỉ nói trước điều kiện.
 */
export const CAU_CAN_VI_SAO = 'Mọi dòng Nhật ký phải có "vì sao".';

/** Hàm thuần: dòng đã đủ để ghi chưa — câu 62 (vì sao **không rỗng**). */
export function coTheGhi(quyet_dinh: string, vi_sao: string): boolean {
  return quyet_dinh.trim() !== '' && vi_sao.trim() !== '';
}

/* ================================================================== *
 * 1. Trang
 * ================================================================== */

export function TrangNhatKy(): React.JSX.Element {
  const [sp, datSp] = useSearchParams();
  const loc = {
    project_id: sp.get(KHOA_LOC_NHAT_KY.du_an) ?? undefined,
    ai: sp.get(KHOA_LOC_NHAT_KY.ai) ?? undefined,
    tim: sp.get(KHOA_LOC_NHAT_KY.tim) ?? undefined,
  };
  const khoa = ['nhat-ky', loc.project_id ?? '', loc.ai ?? '', loc.tim ?? ''] as const;

  const q = useQuery({
    queryKey: khoa,
    queryFn: () => layManHinhNhatKy(loc),
    // d.410: `coordinator` và `manager` ghi Nhật ký được (d.310), nên lớp dòng này
    // đổi **do agent** — không chừa màn hình nào.
    //
    // Bản `_DANH_SACH` (giữ dữ liệu cũ khi khoá đổi): khoá ở đây **mang bộ lọc**,
    // nên đổi dự án/agent/chữ tìm là một khoá mới chưa có cache — không giữ bản cũ
    // thì danh sách trống trắng một nhịp mỗi lần chủ gõ vào ô tìm.
    ...NHIP_LAM_MOI_DANH_SACH,
  });
  const { hien_dau } = useNhipLamMoi(q.isFetching, [khoa]);

  return (
    <div className={LOP_VUNG_TRANG}>
      {/* Dấu làm mới **trong** hàng tiêu đề — nếp chung, xem `trang/tong-quan.tsx`. */}
      <div className={LOP_HANG_TIEU_DE}>
        <h1 className={LOP_TIEU_DE_TRANG}>{TEN_TRANG_NHAT_KY}</h1>
        <DauLamMoi hien={hien_dau} />
      </div>

      <ThanhLoc sp={sp} datSp={datSp} />
      <OGhiDong khoa={khoa} />

      {q.data === undefined ? (
        <TrangThaiTai q={q} cau_dang_tai={CAU_DANG_TAI_NHAT_KY} />
      ) : (
        <Than mh={q.data} />
      )}
    </div>
  );
}

/* ================================================================== *
 * 2. Bộ lọc — d.311, ghi trên URL
 * ================================================================== */

function ThanhLoc({
  sp,
  datSp,
}: {
  sp: URLSearchParams;
  datSp: (v: URLSearchParams) => void;
}): React.JSX.Element {
  /*
   * Hai danh sách lựa chọn (dự án, agent) **không** có `refetchInterval`: chúng
   * đổi theo **chủ**, không theo agent, nên d.410 không áp. Cùng cách cân nhắc
   * đã ghi ở `danh-sach-ticket.tsx`.
   */
  const du_an = useQuery({ queryKey: ['du-an'], queryFn: layDuAn });
  const agent = useQuery({ queryKey: ['agent'], queryFn: layAgent });

  const dat = (khoa: string, gia_tri: string): void => {
    const moi = new URLSearchParams(sp);
    if (gia_tri === '') moi.delete(khoa);
    else moi.set(khoa, gia_tri);
    datSp(moi);
  };

  return (
    /*
     * BAT-68: ô lọc là `LOP_O_NHAP` (vòng `:focus-visible` chung, không tắt
     * outline). 375px: hàng `flex-wrap`; mỗi ô `min-w-0 max-w-full` để tên dự án
     * / agent dài trong `<select>` không đẩy trang cuộn ngang.
     */
    <section aria-label="Bộ lọc" className="flex min-w-0 flex-wrap items-end gap-3 text-sm">
      <label className="flex min-w-0 max-w-full flex-col gap-1">
        <span className={LOP_CHU_PHU}>{NHAN_LOC.du_an}</span>
        <select
          data-loc="du_an"
          value={sp.get(KHOA_LOC_NHAT_KY.du_an) ?? ''}
          onChange={(e) => {
            dat(KHOA_LOC_NHAT_KY.du_an, e.target.value);
          }}
          className={`max-w-full ${LOP_O_NHAP}`}
        >
          <option value="">{NHAN_TAT_CA}</option>
          {/* 19.12 câu 4: bộ lọc dự án có một lựa chọn **"Chung"**. */}
          <option value={LOC_CHUNG}>{NHAN_CHUNG}</option>
          {(du_an.data?.items ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.ten}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 max-w-full flex-col gap-1">
        <span className={LOP_CHU_PHU}>{NHAN_LOC.ai}</span>
        <select
          data-loc="ai"
          value={sp.get(KHOA_LOC_NHAT_KY.ai) ?? ''}
          onChange={(e) => {
            dat(KHOA_LOC_NHAT_KY.ai, e.target.value);
          }}
          className={`max-w-full ${LOP_O_NHAP}`}
        >
          <option value="">{NHAN_TAT_CA}</option>
          <option value={LOC_AI_CHU}>{NHAN_CHU}</option>
          {(agent.data?.items ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.ten}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-48 max-w-full flex-1 flex-col gap-1">
        <span className={LOP_CHU_PHU}>{NHAN_LOC.tim}</span>
        <input
          data-loc="tim"
          type="search"
          defaultValue={sp.get(KHOA_LOC_NHAT_KY.tim) ?? ''}
          onBlur={(e) => {
            dat(KHOA_LOC_NHAT_KY.tim, e.target.value.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') dat(KHOA_LOC_NHAT_KY.tim, e.currentTarget.value.trim());
          }}
          className={LOP_O_NHAP}
        />
      </label>
    </section>
  );
}

/* ================================================================== *
 * 3. Ô ghi một dòng — d.310 + 19.12 câu 62
 * ================================================================== */

function OGhiDong({ khoa }: { khoa: readonly unknown[] }): React.JSX.Element {
  const [mo, datMo] = useState(false);
  const [quyet_dinh, datQuyetDinh] = useState('');
  const [vi_sao, datViSao] = useState('');
  const [du_an, datDuAn] = useState('');
  const qc: QueryClient = useQueryClient();
  const toast = useToast();
  const du_an_q = useQuery({ queryKey: ['du-an'], queryFn: layDuAn });

  /*
   * BAT-29: thân (kể cả `project_id` đích) và khoá đi trong BIẾN, chụp lúc bấm
   * Ghi. `mutationFn` của mutation đang treo (vd mất mạng) là hàm của lần vẽ
   * **mới nhất**: đọc ô chọn dự án từ closure thì đổi ô giữa chừng là ghi dòng
   * vào **dự án khác** với dự án lúc bấm.
   */
  const mot = useMotLan();
  const ghi = useMutation({
    mutationFn: (b: { than: Parameters<typeof ghiNhatKy>[0]; khoa: readonly unknown[] }) =>
      ghiNhatKy(b.than),
    onSuccess: (kq, b) => {
      /*
       * BAT-30: mỗi ô chỉ về rỗng khi còn TRÙNG đúng nội dung đã gửi (`b.than`).
       * Mất mạng, bấm Ghi, gõ tiếp, có mạng ⇒ phần vừa gõ thêm không bị xoá. Xét
       * từng ô riêng, bằng updater hàm để đọc giá trị SỐNG chứ không closure.
       */
      datQuyetDinh((hien) => (hien === b.than.quyet_dinh ? '' : hien));
      datViSao((hien) => (hien === b.than.vi_sao ? '' : hien));
      /*
       * d.312 — "**chỉ cảnh báo, không chặn**". Dòng **đã được ghi**; cảnh báo đi
       * ra kết quả của lệnh, nên nó hiện thành toast chứ không chặn gì. Câu là
       * câu của máy chủ, không một bản dịch thứ hai ở client.
       */
      for (const c of kq.canh_bao) toast.bao(c.message);
      void lamMoiTheoSo(qc, { queryKey: b.khoa });
    },
    onError: (loi: Error) => {
      toast.bao(loi instanceof LoiApi ? loi.message : String(loi.message));
    },
  });

  if (!mo) {
    return (
      <div>
        <button
          type="button"
          data-nut="mo-ghi"
          onClick={() => {
            datMo(true);
          }}
          className={`rounded px-3 py-1 text-sm ${NUT_PHU}`}
        >
          {NHAN_GHI_DONG}
        </button>
      </div>
    );
  }

  const du = coTheGhi(quyet_dinh, vi_sao);

  return (
    <section aria-label={NHAN_GHI_DONG} className={`flex flex-col gap-2 p-3 ${LOP_THE}`}>
      <label className="flex flex-col gap-1 text-sm">
        <span className={LOP_CHU_PHU}>{NHAN_QUYET_DINH}</span>
        <textarea
          data-nhap="quyet-dinh"
          value={quyet_dinh}
          onChange={(e) => {
            datQuyetDinh(e.target.value);
          }}
          rows={2}
          className={LOP_O_NHAP}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className={LOP_CHU_PHU}>{NHAN_VI_SAO}</span>
        <textarea
          data-nhap="vi-sao"
          value={vi_sao}
          onChange={(e) => {
            datViSao(e.target.value);
          }}
          rows={2}
          className={LOP_O_NHAP}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className={LOP_CHU_PHU}>{NHAN_LOC.du_an}</span>
        <select
          data-nhap="du-an"
          value={du_an}
          onChange={(e) => {
            datDuAn(e.target.value);
          }}
          className={LOP_O_NHAP}
        >
          {/* Rỗng = **Chung** (19.12 câu 4). */}
          <option value="">{NHAN_CHUNG}</option>
          {(du_an_q.data?.items ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.ten}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-nut="gui-dong"
          disabled={!du || ghi.isPending}
          onClick={() => {
            // BAT-32: chốt ref đồng bộ — hai lần bấm liền chỉ gửi một lệnh.
            mot((tha) => {
              ghi.mutate(
                {
                  than: {
                    quyet_dinh,
                    vi_sao,
                    // 19.12 câu 4: Chung là trường dự án **rỗng**, không một mã riêng.
                    project_id: du_an === '' ? null : du_an,
                  },
                  khoa,
                },
                { onSettled: tha },
              );
            });
          }}
          className={`rounded px-3 py-1 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
        >
          {NHAN_GUI_DONG}
        </button>
        {du ? null : (
          <span data-o="can-vi-sao" className={LOP_CHU_PHU}>
            {CAU_CAN_VI_SAO}
          </span>
        )}
      </div>
    </section>
  );
}

/* ================================================================== *
 * 4. Thân: gom theo ngày — d.311
 * ================================================================== */

function Than({ mh }: { mh: ManHinhNhatKy }): React.JSX.Element {
  if (mh.items.length === 0) {
    return <p className={LOP_CAU_CHO}>{CAU_CHUA_CO_DONG}</p>;
  }

  /*
   * **Gom theo `nhom_theo_ngay` của máy chủ**, không gom lại ở đây: ngày là một
   * dẫn xuất theo múi giờ nghiệp vụ (19.12 câu 60), và một phép gom thứ hai ở
   * client sẽ lệch đúng ở hai mốc quanh nửa đêm. Dòng đã sắp `luc DESC`, nên các
   * dòng cùng ngày liền nhau và một con trỏ chạy là đủ.
   */
  let i = 0;
  const nhom = mh.nhom_theo_ngay.map((n) => {
    const dong = mh.items.slice(i, i + n.so_dong);
    i += n.so_dong;
    return { ...n, dong };
  });

  return (
    <div data-ds="nhat-ky" className="flex flex-col gap-4">
      {nhom.map((n) => (
        <section key={n.ngay} aria-label={n.ngay} data-ngay={n.ngay} className="flex flex-col gap-2">
          {/* Đầu nhóm như danh sách ticket: tên nhóm + số đếm xám. */}
          <h2 className={`flex items-center gap-2 ${LOP_TIEU_DE_MUC}`}>
            {n.ngay}{' '}
            <span data-so="dong" className="font-normal text-chu-mo-hon tabular-nums">
              {n.so_dong}
            </span>
          </h2>
          <ul className={LOP_DS_DONG}>
            {n.dong.map((d) => (
              <Dong key={d.id} d={d} bay_gio={mh.bay_gio} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Một dòng — **sáu trường** của d.308, không thiếu vế nào. */
function Dong({ d, bay_gio }: { d: DongNhatKy; bay_gio: number }): React.JSX.Element {
  return (
    <li data-dong={d.id} className={LOP_DONG_NHIEU_TANG}>
      {/* Hàng trên chữ phụ: mốc · ai · dự án (THIET-KE "Dòng nhiều tầng"). */}
      <div className={`flex min-w-0 flex-wrap items-center gap-2 ${LOP_CHU_PHU}`}>
        <Moc luc={d.luc} bay_gio={bay_gio} />
        {/* "ai" — chủ hoặc một agent (d.308). */}
        {d.agent_id === null ? (
          <span data-o="ai">{NHAN_CHU}</span>
        ) : (
          <Link to={duongAgent(d.agent_id)} data-o="ai" className={`min-w-0 break-all ${LOP_LIEN_KET}`}>
            {d.agent_id}
          </Link>
        )}
        {/* 19.12 câu 4: `project_id` rỗng hiện nhãn "Chung". */}
        <span
          data-o="du-an"
          data-chung={d.project_id === null ? 'co' : 'khong'}
          className="min-w-0 break-all"
        >
          {d.project_id === null ? NHAN_CHUNG : d.project_id}
        </span>
        {/*
         * d.309 — dòng cũ hiện chữ này; **không** có nút sửa nào cạnh nó. Chip
         * cảnh báo `LOP_CHIP_CANH` (BAT-68): viền mờ, chữ `canh`, không tô nền —
         * không còn chữ `canh` trần giữa hàng chữ phụ.
         */}
        {d.da_co_quyet_dinh_moi ? (
          <span data-o="da-co-moi" className={LOP_CHIP_CANH}>
            {CAU_DA_CO_MOI}
          </span>
        ) : null}
      </div>

      <p data-o="quyet-dinh" className="min-w-0 whitespace-pre-wrap break-words text-chu">
        {d.quyet_dinh}
      </p>
      {/* 19.12 câu 62 — "vì sao" không bao giờ rỗng, nên luôn có một dòng này. */}
      <p data-o="vi-sao" className="min-w-0 break-words text-chu-mo">
        <span className={LOP_CHU_PHU}>{NHAN_VI_SAO}: </span>
        {d.vi_sao}
      </p>

      {d.can_cu.length === 0 ? null : (
        <ul data-ds="can-cu" className="flex min-w-0 flex-wrap gap-2 text-xs">
          {d.can_cu.map((c) => (
            <li key={`${c.loai}-${c.id}`} data-can-cu={c.loai} className="min-w-0 max-w-full">
              {/*
               * Căn cứ `ticket` là một mã ticket → link `/t/<MÃ>` (d.398). Hai
               * loại kia (`ask`, `dong_cu`) chưa có trang riêng ở lượt này, nên
               * chúng hiện thành chữ: một link trỏ vào đường chưa có là một cú
               * bấm chết.
               */}
              {c.ma_can_chu === null ? (
                <span className={`max-w-full break-all font-mono ${LOP_CHIP}`}>{c.id}</span>
              ) : (
                <Link to="/can-chu" className={`max-w-full break-all font-mono hover:text-chu ${LOP_CHIP}`}>
                  {c.ma_can_chu}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
