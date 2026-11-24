/**
 * **Trang Cài đặt** — SPEC mục 14 d.394 ("Dưới cùng: Cài đặt"), mục 15 d.429. BAT-8.
 *
 * Hai vế: nút **"Xuất dữ liệu (JSON)"** (d.429) và mục **"Bản sao lưu"** — danh sách
 * 14 bản kèm ngày, dung lượng, nút tải (19.12 câu 7; BAT-10). Khối **"Thông báo
 * Telegram"** (BAT-16, mục 12 d.348): mỗi loại tin một công tắc, tin bảo mật khoá.
 *
 * Khu **"Tài khoản"** (BAT-11, mục 15 d.425): các phiên đang mở, "Đăng xuất mọi
 * nơi" qua một bước xác nhận, và đổi mật khẩu (đủ hai lớp).
 *
 * Nút gọi `GET /v1/xuat` bằng cookie phiên (`taiBanXuat`), rồi đưa thân cho trình
 * duyệt **tải về** qua một link `blob:` tạm. Cổng "chỉ chủ" là của **máy chủ**;
 * giao diện không tự kiểm gì — lỗi đi nguyên văn ra toast (nếp `api.ts`).
 */

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAT_KHAU_DAI_TOI_DA,
  MAT_KHAU_DAI_TOI_THIEU,
  cauLoi,
  datCongTacThongBao,
  doiMatKhau,
  layCaiDatThongBao,
  layPhienDangNhap,
  laySaoLuu,
  taiBanSaoLuu,
  taiBanXuat,
  type CongTacThongBao,
  type PhienDangNhap,
} from '../api';
import { gioDayDu, thoiGianTuongDoi } from '../thoi-gian';
import { useMotLan } from '../mot-lan';
import { useToast } from '../vo/toast';
import { batDauGhiLacQuan, ketThucGhiLacQuan, lamMoiTheoSo } from '../ghi-lac-quan';
import {
  LOP_CAU_CHO,
  LOP_CAU_LOI,
  LOP_CHIP,
  LOP_CHU_MO_HON,
  LOP_CHU_PHU,
  LOP_DONG,
  LOP_DONG_NHIEU_TANG,
  LOP_DS_DONG,
  LOP_O_NHAP,
  LOP_THE,
  LOP_TIEU_DE_NHO,
  LOP_TIEU_DE_TRANG,
  LOP_VUNG_TRANG,
  NUT_CHINH,
  NUT_MO_KHI_DISABLED,
  NUT_PHU,
} from '../vo/lop-nut';
import { Khoi } from '../vo/khoi';
import { NHAN_DANG_XUAT_MOI_NOI } from '../vo/sidebar';
import {
  CAU_HOI_DANG_XUAT_MOI_NOI,
  NHAN_HUY,
  NHAN_XAC_NHAN_DANG_XUAT,
  XacNhanDangXuatMoiNoi,
  useDangXuat,
} from '../vo/xac-nhan-dang-xuat';

/**
 * Vỏ của một mục Cài đặt: các mục ngăn nhau bằng **viền mờ trên**, không thẻ
 * nổi — trang cài đặt là một cột chữ đọc từ trên xuống (THIET-KE "Trang"). Bên
 * trong là khối chung `vo/khoi` (BAT-68: `section[aria-label][data-khoi]`, đầu
 * khối `LOP_DAU_KHOI` + `h2`), nên Cài đặt cùng một dáng đầu khối với mọi trang.
 */
const LOP_MUC_CAI_DAT = 'min-w-0 border-t border-vien pt-5';

function MucCaiDat({
  ten,
  ma,
  children,
}: {
  ten: string;
  ma: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div data-muc-cai-dat={ma} className={LOP_MUC_CAI_DAT}>
      <Khoi ten={ten} ma={ma}>
        {children}
      </Khoi>
    </div>
  );
}
/** Câu giải thích dưới tiêu đề mục: chữ phụ 13px. */
const LOP_GIAI_THICH = 'text-sm text-chu-mo';

export const NHAN_NUT_XUAT = 'Xuất dữ liệu (JSON)';
export const NHAN_DANG_XUAT = 'Đang xuất…';
export const CAU_DA_XUAT = (ten: string): string => `Đã tải về ${ten}.`;
export const CAU_CANH_BAO_FILE =
  'File chứa toàn bộ dữ liệu điều phối (ticket, Cần Chủ, nhật ký…), không có mật khẩu hay token. ' +
  'Đừng commit, đừng gửi đi.';

/**
 * Chờ bao lâu rồi mới thu hồi link `blob:`, mili-giây. Thu hồi **ngay** sau
 * `a.click()` thì một số trình duyệt chưa kịp bắt đầu đọc blob và lượt tải hỏng
 * (review BAT-8); để nó sống mãi thì một bản sao dữ liệu nằm lại trong bộ nhớ trang.
 */
export const TRE_THU_HOI_BLOB_MS = 1_000;

/** Đưa một `Blob` cho trình duyệt tải về dưới tên `ten`; thu hồi link sau `TRE_THU_HOI_BLOB_MS`. */
function taiVe(blob: Blob, ten: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ten;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), TRE_THU_HOI_BLOB_MS);
}

export const CAU_SAO_LUU_CHUA_BAT = 'Sao lưu tự động chưa bật';
export const CAU_SAO_LUU_RONG = 'Chưa có bản sao lưu nào';
export const NHAN_TAI_BAN = 'Tải';

/** Dung lượng dễ đọc: dưới 1 KB giữ byte, dưới 1 MB là KB, còn lại MB (1 chữ số lẻ). */
export function dungLuongDeDoc(byte: number): string {
  if (byte < 1024) return `${String(byte)} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
}

/** Mục "Bản sao lưu" — 19.12 câu 7: ngày, dung lượng, nút tải từng bản. */
function MucSaoLuu(): React.JSX.Element {
  const toast = useToast();
  const ds = useQuery({ queryKey: ['sao-luu'], queryFn: laySaoLuu, retry: false });
  const [dang_tai, datDangTai] = useState<string | null>(null);

  async function tai(ngay: string): Promise<void> {
    datDangTai(ngay);
    try {
      const { blob, ten_file } = await taiBanSaoLuu(ngay);
      taiVe(blob, ten_file);
      toast.bao(CAU_DA_XUAT(ten_file), 'tin');
    } catch (e: unknown) {
      toast.bao(e instanceof Error ? e.message : String(e), 'loi');
    } finally {
      datDangTai(null);
    }
  }

  let noi_dung: React.JSX.Element;
  if (ds.isPending) {
    noi_dung = <p className={LOP_CAU_CHO}>Đang tải…</p>;
  } else if (ds.isError) {
    noi_dung = (
      <p role="alert" className={LOP_CAU_LOI}>
        {ds.error.message}
      </p>
    );
  } else if (!ds.data.bat) {
    noi_dung = <p className={LOP_CAU_CHO}>{CAU_SAO_LUU_CHUA_BAT}</p>;
  } else if (ds.data.items.length === 0) {
    noi_dung = <p className={LOP_CAU_CHO}>{CAU_SAO_LUU_RONG}</p>;
  } else {
    noi_dung = (
      <ul className={`max-w-xl ${LOP_DS_DONG}`} data-sao-luu="ds">
        {ds.data.items.map((b) => (
          <li key={b.khoa} data-ban-sao-luu={b.ngay} className={`flex-wrap ${LOP_DONG}`}>
            <span className="font-mono text-chu tabular-nums">{b.ngay}</span>
            <span className={LOP_CHU_MO_HON}>{dungLuongDeDoc(b.kich_thuoc)}</span>
            <button
              type="button"
              aria-label={`${NHAN_TAI_BAN} bản ${b.ngay}`}
              onClick={() => void tai(b.ngay)}
              disabled={dang_tai !== null}
              className={`ml-auto rounded px-2 py-0.5 text-sm ${NUT_PHU} ${NUT_MO_KHI_DISABLED}`}
            >
              {NHAN_TAI_BAN}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <MucCaiDat ten="Bản sao lưu" ma="sao-luu">
      {noi_dung}
    </MucCaiDat>
  );
}

/* ================================================================== *
 * Khu "Tài khoản" — BAT-11, SPEC mục 15 d.425
 * ================================================================== */

/** Khoá cache của danh sách phiên — đổi mật khẩu xong thì làm mới đúng khoá này. */
export const KHOA_PHIEN_DANG_NHAP = ['chu', 'phien-dang-nhap'] as const;

export const NHAN_KHONG_RO_THIET_BI = 'Không rõ thiết bị';
export const NHAN_PHIEN_NAY = 'Phiên này';
export const CAU_CHUA_GHI_DUNG = 'chưa ghi';
// Câu hỏi và nhãn của bước xác nhận sống ở component dùng chung; xuất lại để
// test và các chỗ đã nhập từ trang này không phải đổi đường nhập.
export { CAU_HOI_DANG_XUAT_MOI_NOI, NHAN_HUY, NHAN_XAC_NHAN_DANG_XUAT };

export const NHAN_MAT_KHAU_CU = 'Mật khẩu hiện tại';
export const NHAN_MA_TOTP_DOI = 'Mã xác thực (6 số)';
export const NHAN_MAT_KHAU_MOI = 'Mật khẩu mới';
export const NHAN_NHAP_LAI = 'Nhập lại mật khẩu mới';
export const NHAN_NUT_DOI = 'Đổi mật khẩu';
export const NHAN_DANG_DOI = 'Đang đổi…';
export const CAU_LUAT_DO_DAI = `Mật khẩu mới dài từ ${String(MAT_KHAU_DAI_TOI_THIEU)} tới ${String(MAT_KHAU_DAI_TOI_DA)} ký tự. Đổi xong, mọi phiên khác bị đăng xuất.`;
export const CAU_KHONG_KHOP = 'Hai ô mật khẩu mới không khớp nhau.';
/** BAT-16 (#148): mật khẩu mới trùng mật khẩu hiện tại — chặn ngay ở trang; máy chủ cũng chặn (422). */
export const CAU_TRUNG_MAT_KHAU_CU = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
export const CAU_DA_DOI = (n: number): string =>
  `Đã đổi mật khẩu; đã đăng xuất ${String(n)} phiên khác.`;

/**
 * Một mốc thời gian theo nếp d.422: chữ tương đối, rê chuột thấy giờ đầy đủ.
 * Màu `chu-mo-hon` — THIET-KE "Chữ": mốc thời gian luôn là chữ mờ hơn.
 */
function Moc({ moc, bay_gio }: { moc: number; bay_gio: number }): React.JSX.Element {
  return (
    <time
      dateTime={new Date(moc).toISOString()}
      title={gioDayDu(moc)}
      className="text-chu-mo-hon tabular-nums"
    >
      {thoiGianTuongDoi(moc, bay_gio)}
    </time>
  );
}

/**
 * Một dòng phiên. **Không** hiện id hay băm nào — máy chủ cũng không trả (d.427).
 * Chuỗi User-Agent đầy đủ nằm trong `title` của nhãn thiết bị: nhãn rút gọn đôi khi
 * không đủ để chủ nhận ra máy của mình.
 */
function DongPhien({ p, bay_gio }: { p: PhienDangNhap; bay_gio: number }): React.JSX.Element {
  return (
    <li
      data-phien={p.hien_tai ? 'hien-tai' : 'khac'}
      className={`flex-wrap ${LOP_DONG}`}
    >
      <span className="min-w-0 break-words font-medium text-chu" title={p.ua ?? undefined}>
        {p.thiet_bi ?? NHAN_KHONG_RO_THIET_BI}
      </span>
      {p.hien_tai ? (
        <span data-o="phien-nay" className={`font-medium ${LOP_CHIP}`}>
          {NHAN_PHIEN_NAY}
        </span>
      ) : null}
      <span className={LOP_CHU_PHU}>
        Đăng nhập <Moc moc={p.tao_luc} bay_gio={bay_gio} />
      </span>
      <span className={LOP_CHU_PHU}>
        Dùng gần nhất{' '}
        {p.dung_cuoi_luc === null ? CAU_CHUA_GHI_DUNG : <Moc moc={p.dung_cuoi_luc} bay_gio={bay_gio} />}
      </span>
    </li>
  );
}

/**
 * **Các phiên đang mở + nút "Đăng xuất mọi nơi"** (d.425).
 *
 * Nút đi qua **một bước xác nhận trong trang** (web chưa có nếp hộp xác nhận nào,
 * và `window.confirm` chặn cả trang lẫn test): bấm lần đầu chỉ mở câu hỏi, chỉ nút
 * "Xác nhận" mới gọi máy chủ. Hệ quả của đăng xuất mọi nơi là **chính phiên này
 * cũng mất**, nên một cú bấm nhầm là phải đăng nhập lại bằng mã TOTP.
 *
 * Xử lý cache **đúng nếp `MenuWorkspace`** (`vo/sidebar.tsx`): `onSettled` bỏ mọi
 * query trừ `['toi']`, rồi `invalidate` `['toi']` — `/v1/toi` trả 401 và vỏ đổi
 * sang trang đăng nhập. `onSettled` chứ không `onSuccess`: mạng đứt giữa chừng thì
 * máy chủ có thể đã huỷ xong, và hỏi lại `/v1/toi` là cách duy nhất để biết.
 */
function MucPhienDangMo(): React.JSX.Element {
  const ds = useQuery({ queryKey: KHOA_PHIEN_DANG_NHAP, queryFn: layPhienDangNhap, retry: false });
  const [dang_hoi, datDangHoi] = useState(false);

  /*
   * Lượt gọi trượt (mạng, 5xx): bước xác nhận **ở lại mở** và hiện câu lỗi (của
   * máy chủ nguyên văn, hoặc câu chung) — chủ biết lệnh chưa chắc đã chạy và bấm
   * lại được. Cache vẫn bị bỏ cả khi lỗi, theo nếp `useDangXuat` (lý do ở đó).
   */
  const ra = useDangXuat();

  let noi_dung: React.JSX.Element;
  if (ds.isPending) {
    noi_dung = <p className={LOP_CAU_CHO}>Đang tải…</p>;
  } else if (ds.isError) {
    noi_dung = (
      <p role="alert" className={LOP_CAU_LOI}>
        {cauLoi(ds.error)}
      </p>
    );
  } else {
    const bay_gio = ds.data.bay_gio;
    noi_dung = (
      <ul className={`max-w-xl ${LOP_DS_DONG}`} data-tai-khoan="phien">
        {/*
         * Key = **chỉ số + `tao_luc`**: API cố ý không trả id phiên (d.427), và hai
         * phiên tạo cùng mili-giây có cùng `tao_luc`/`het_luc` — key ghép từ hai số
         * ấy trùng được. Chỉ số làm nó không bao giờ trùng; `tao_luc` đi kèm để một
         * phiên mới chen lên đầu (danh sách xếp mới nhất trước) không làm React giữ
         * nhầm trạng thái của dòng cũ dưới key cũ. Dòng không có trạng thái riêng
         * nào, nên đây chỉ là chuyện đúng, không phải chuyện hiệu năng.
         */}
        {ds.data.items.map((p, i) => (
          <DongPhien key={`${String(i)}-${String(p.tao_luc)}`} p={p} bay_gio={bay_gio} />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className={LOP_TIEU_DE_NHO}>Các phiên đang mở</h3>
      {noi_dung}
      {!dang_hoi ? (
        <div>
          <button
            type="button"
            onClick={() => datDangHoi(true)}
            disabled={ra.isPending}
            className={`rounded px-3 py-1.5 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
          >
            {NHAN_DANG_XUAT_MOI_NOI}
          </button>
        </div>
      ) : (
        <div
          role="group"
          aria-label={NHAN_DANG_XUAT_MOI_NOI}
          data-o="xac-nhan-dang-xuat"
          className={`flex max-w-xl flex-col gap-2 p-3 ${LOP_THE}`}
        >
          <XacNhanDangXuatMoiNoi
            onXacNhan={() => ra.mutate(true)}
            onHuy={() => {
              ra.reset();
              datDangHoi(false);
            }}
            dang_chay={ra.isPending}
            loi={ra.error}
          />
        </div>
      )}
    </div>
  );
}

/**
 * **Đổi mật khẩu** — mật khẩu hiện tại + mã TOTP (đủ hai lớp d.425) + mật khẩu
 * mới nhập hai lần.
 *
 * Trang chỉ tự kiểm **một** điều: hai ô mật khẩu mới khớp nhau (không khớp thì
 * không gửi). Mọi phán quyết khác — sai mật khẩu/mã (401), sai độ dài (422), đang
 * khoá (429 kèm số giây chờ) — là của máy chủ, và câu lỗi in **nguyên văn**
 * (`cauLoi`, nếp trang đăng nhập): máy chủ cố ý trả một câu cho cả hai lớp sai.
 *
 * Thành công: xoá trắng cả bốn ô (mã TOTP vừa dùng đã chết), báo số phiên khác bị
 * đăng xuất, làm mới danh sách phiên.
 */
function MucDoiMatKhau(): React.JSX.Element {
  const qc = useQueryClient();
  const [cu, datCu] = useState('');
  const [ma, datMa] = useState('');
  const [moi, datMoi] = useState('');
  const [nhap_lai, datNhapLai] = useState('');
  const [loi_khop, datLoiKhop] = useState<string | null>(null);
  const [da_doi, datDaDoi] = useState<number | null>(null);

  const mot = useMotLan();
  const doi = useMutation({
    mutationFn: () => doiMatKhau({ mat_khau_cu: cu, ma_totp: ma, mat_khau_moi: moi }),
    onSuccess: async (kq) => {
      datCu('');
      datMa('');
      datMoi('');
      datNhapLai('');
      datDaDoi(kq.so_phien_khac_da_huy);
      await lamMoiTheoSo(qc, { queryKey: KHOA_PHIEN_DANG_NHAP });
    },
  });

  function nop(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    // BAT-32: chốt ref đồng bộ — Enter hai lần liền không gửi lần hai khi lần một chưa xong.
    mot((tha) => {
      datDaDoi(null);
      if (moi !== nhap_lai) {
        datLoiKhop(CAU_KHONG_KHOP);
        tha();
        return;
      }
      // Hai ô đều do chủ vừa gõ: so ở đây không hé ra gì. Máy chủ vẫn là người
      // phán quyết thật (so với băm đang lưu, sau hai lớp).
      if (moi === cu) {
        datLoiKhop(CAU_TRUNG_MAT_KHAU_CU);
        tha();
        return;
      }
      datLoiKhop(null);
      doi.mutate(undefined, { onSettled: tha });
    });
  }

  const o = LOP_O_NHAP;

  return (
    <div className="flex flex-col gap-2">
      <h3 className={LOP_TIEU_DE_NHO}>{NHAN_NUT_DOI}</h3>
      <p className={LOP_GIAI_THICH}>{CAU_LUAT_DO_DAI}</p>
      <form onSubmit={nop} className="flex max-w-sm flex-col gap-2" aria-label={NHAN_NUT_DOI}>
        <label className="flex flex-col gap-1 text-sm">
          {NHAN_MAT_KHAU_CU}
          <input
            type="password"
            name="mat_khau_cu"
            autoComplete="current-password"
            value={cu}
            onChange={(e) => datCu(e.target.value)}
            className={o}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {NHAN_MA_TOTP_DOI}
          <input
            type="text"
            name="ma_totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={ma}
            onChange={(e) => datMa(e.target.value)}
            className={o}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {NHAN_MAT_KHAU_MOI}
          <input
            type="password"
            name="mat_khau_moi"
            autoComplete="new-password"
            value={moi}
            onChange={(e) => datMoi(e.target.value)}
            className={o}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {NHAN_NHAP_LAI}
          <input
            type="password"
            name="nhap_lai_mat_khau_moi"
            autoComplete="new-password"
            value={nhap_lai}
            onChange={(e) => datNhapLai(e.target.value)}
            className={o}
          />
        </label>
        <div>
          <button
            type="submit"
            disabled={doi.isPending}
            className={`rounded px-3 py-1.5 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
          >
            {doi.isPending ? NHAN_DANG_DOI : NHAN_NUT_DOI}
          </button>
        </div>
      </form>
      {loi_khop !== null ? (
        <p role="alert" className={LOP_CAU_LOI}>
          {loi_khop}
        </p>
      ) : doi.isError ? (
        <p role="alert" className={LOP_CAU_LOI}>
          {cauLoi(doi.error)}
        </p>
      ) : null}
      {da_doi !== null ? (
        <p role="status" className="text-sm text-chu">
          {CAU_DA_DOI(da_doi)}
        </p>
      ) : null}
    </div>
  );
}

/* ================================================================== *
 * Khối "Thông báo Telegram" — BAT-16, SPEC mục 12 d.348
 * ================================================================== */

export const KHOA_CAI_DAT_THONG_BAO = ['cai-dat', 'thong-bao'] as const;
export const TIEU_DE_THONG_BAO = 'Thông báo Telegram';
export const CAU_GIAI_THICH_TAT =
  'Tắt một loại thì Baton không gửi Telegram cho loại đó nữa; tin vẫn ghi vào chuông trong app. ' +
  'Bật lại không gửi bù tin cũ.';

/**
 * Mỗi loại tin một công tắc, **lưu ngay** khi bấm (d.418: hiện ngay trước khi máy
 * chủ trả lời; máy chủ từ chối thì hoàn lại và báo lỗi dạng toast). Nhãn và câu
 * giải thích của công tắc khoá là của **máy chủ**, in nguyên văn.
 *
 * Công tắc **bảo mật tài khoản** hiện ra nhưng `disabled`, kèm câu giải thích —
 * máy chủ cũng từ chối tắt nó (403), nên giao diện chỉ nói trước điều đó.
 */
function MucThongBao(): React.JSX.Element {
  const qc = useQueryClient();
  const toast = useToast();
  const ds = useQuery({ queryKey: KHOA_CAI_DAT_THONG_BAO, queryFn: layCaiDatThongBao, retry: false });

  const doi = useMutation({
    mutationFn: (v: { cong_tac: string; bat: boolean }) => datCongTacThongBao(v.cong_tac, v.bat),
    onMutate: async (v) => {
      /*
       * BAT-27: khai khoá đang ghi lạc quan vào sổ chung (`ghi-lac-quan.ts`).
       * Query này hôm nay **không** có nhịp và **không** đăng ký `useNhipLamMoi`,
       * nên chưa đường làm mới tự động nào chạm tới nó; khai vẫn khai, để ngày nó
       * có nhịp thì hai cổng của `lam-moi.ts` che nó ngay, không phải nhớ thêm.
       */
      /*
       * BAT-28: khoá chụp vào ngữ cảnh như mọi mutation lạc quan. Khoá này là
       * hằng nên hôm nay không đổi được giữa chừng; giữ cùng khuôn để ngày nó
       * mang tham số (vd theo workspace) thì `onError`/`onSettled` đã đúng sẵn.
       */
      const k = KHOA_CAI_DAT_THONG_BAO;
      const ghi = batDauGhiLacQuan(qc, [k]);
      try {
        await qc.cancelQueries({ queryKey: k });
        const truoc = qc.getQueryData<{ items: CongTacThongBao[] }>(k);
        if (truoc !== undefined) {
          qc.setQueryData(k, {
            items: truoc.items.map((i) => (i.cong_tac === v.cong_tac ? { ...i, bat: v.bat } : i)),
          });
        }
        return { truoc, ghi, khoa: k };
      } catch (e) {
        ketThucGhiLacQuan(qc, ghi);
        throw e;
      }
    },
    onError: (e, _v, ngu_canh) => {
      if (ngu_canh !== undefined && ngu_canh.truoc !== undefined) {
        qc.setQueryData(ngu_canh.khoa, ngu_canh.truoc);
      }
      toast.bao(cauLoi(e), 'loi');
    },
    onSettled: (_d, _l, _v, ngu_canh) => {
      ketThucGhiLacQuan(qc, ngu_canh?.ghi);
      // BAT-28: công tắc khác còn bay ⇒ khoá này hoãn tới khi nó xong (d.418).
      return lamMoiTheoSo(qc, { queryKey: ngu_canh?.khoa ?? KHOA_CAI_DAT_THONG_BAO });
    },
  });

  let noi_dung: React.JSX.Element;
  if (ds.isPending) {
    noi_dung = <p className={LOP_CAU_CHO}>Đang tải…</p>;
  } else if (ds.isError) {
    noi_dung = (
      <p role="alert" className={LOP_CAU_LOI}>
        {cauLoi(ds.error)}
      </p>
    );
  } else {
    noi_dung = (
      <ul className={`max-w-xl ${LOP_DS_DONG}`} data-thong-bao="ds">
        {ds.data.items.map((i) => (
          <li
            key={i.cong_tac}
            data-cong-tac={i.cong_tac}
            className={LOP_DONG_NHIEU_TANG}
          >
            <label className="flex min-w-0 items-center gap-2 text-chu">
              <input
                type="checkbox"
                role="switch"
                aria-checked={i.bat}
                checked={i.bat}
                disabled={i.khoa}
                onChange={(e) => doi.mutate({ cong_tac: i.cong_tac, bat: e.target.checked })}
              />
              <span className="min-w-0 break-words">{i.nhan}</span>
            </label>
            {i.khoa && i.ly_do_khoa !== null ? (
              <span data-o="ly-do-khoa" className={`min-w-0 break-words pl-6 ${LOP_CHU_PHU}`}>
                {i.ly_do_khoa}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <MucCaiDat ten={TIEU_DE_THONG_BAO} ma="thong-bao">
      <p className={LOP_GIAI_THICH}>{CAU_GIAI_THICH_TAT}</p>
      {noi_dung}
    </MucCaiDat>
  );
}

/** Khu "Tài khoản" — không có: quên mật khẩu, đặt lại TOTP, passkey, đăng xuất từng phiên. */
function KhuTaiKhoan(): React.JSX.Element {
  return (
    <MucCaiDat ten="Tài khoản" ma="tai-khoan">
      {/* Hai mục con `h3` cách nhau 20px như trước (khối chung chỉ 8px). */}
      <div className="flex min-w-0 flex-col gap-5">
        <MucPhienDangMo />
        <MucDoiMatKhau />
      </div>
    </MucCaiDat>
  );
}

export function TrangCaiDat(): React.JSX.Element {
  const toast = useToast();
  const [dang_xuat, datDangXuat] = useState(false);

  async function xuat(): Promise<void> {
    datDangXuat(true);
    try {
      const { blob, ten_file } = await taiBanXuat();
      taiVe(blob, ten_file);
      toast.bao(CAU_DA_XUAT(ten_file), 'tin');
    } catch (e: unknown) {
      toast.bao(e instanceof Error ? e.message : String(e), 'loi');
    } finally {
      datDangXuat(false);
    }
  }

  return (
    <section className={`max-w-3xl ${LOP_VUNG_TRANG}`}>
      <h1 className={LOP_TIEU_DE_TRANG}>Cài đặt</h1>

      <MucCaiDat ten="Dữ liệu" ma="du-lieu">
        <p className={LOP_GIAI_THICH}>
          Tải toàn bộ dữ liệu của workspace về một file JSON (SPEC mục 15). Sao lưu tự động
          chạy mỗi ngày lúc 02:00 và giữ 14 bản.
        </p>
        <p className={LOP_GIAI_THICH}>{CAU_CANH_BAO_FILE}</p>
        <div>
          <button
            type="button"
            onClick={() => void xuat()}
            disabled={dang_xuat}
            className={`rounded px-3 py-1.5 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
          >
            {dang_xuat ? NHAN_DANG_XUAT : NHAN_NUT_XUAT}
          </button>
        </div>
      </MucCaiDat>

      <MucSaoLuu />

      <MucThongBao />

      <KhuTaiKhoan />
    </section>
  );
}
