/**
 * **Sidebar** — SPEC mục 14 d.391–394, cộng phần khung kiểu Linear mà chủ yêu
 * cầu trong brief (BAT-6 đợt 1).
 *
 *   d.391  Tổng quan, Cần Chủ (huy hiệu), Báo cáo, Nhật ký quyết định,
 *          Bản đồ dự án, Đội agent.
 *   d.393  Rồi danh sách dự án **theo nhóm**, mỗi dự án có **chấm sức sống**.
 *   d.394  Dưới cùng: Cài đặt.
 *
 * Thứ tự và nhãn lấy từ `muc-sidebar.ts` (một sổ tra), không gõ rải trong JSX.
 *
 * ## Những thứ KHÔNG có trong SPEC (brief của chủ) — và cách chúng không phá SPEC
 *
 * Đầu sidebar có tên workspace, nút tìm, nút tạo việc; có thêm mục "Việc của
 * tôi"; nhóm Dự án và nhóm Đội agent thu gọn được. **Không mục nào trong số đó
 * mang `data-muc`**: ca test của d.391–394 đếm đúng các phần tử `data-muc`
 * (sáu `chinh`, các `du-an`, rồi `Cài đặt`), nên chen một mục ngoài SPEC vào
 * cùng thuộc tính sẽ làm ca ấy **sai mà vẫn xanh**. Mục ngoài SPEC dùng
 * `data-muc-them`.
 *
 * ## Dự án `archived` không hiện
 *
 * Mục 2 d.70 nói thẳng "ẩn khỏi sidebar". Máy chủ đã lọc (`lietKeDuAn` thêm
 * `trang_thai <> 'archived'` khi không có `?gom_luu_tru=co`), và ở đây lọc **lần
 * nữa**: đó không phải cài hai lần cùng một luật cho vui — một lượt sau thêm
 * `?gom_luu_tru=co` vào đúng lời gọi này để dựng màn hình Cài đặt sẽ làm dự án
 * lưu trữ mọc lại trong sidebar mà không ai thấy. Luật là "sidebar không có dự
 * án lưu trữ", nên nó được canh **ở sidebar**.
 *
 * ## Nhóm Đội agent gọi thêm MỘT đường đã có
 *
 * `GET /v1/man-hinh-agent` — đường của trang Đội agent, không một đường mới
 * (brief chặn đổi API). Nó **không** mang nhịp làm mới: một chấm "đang làm /
 * rảnh" ở mép màn hình không đáng một request mỗi hai giây. Thân chưa về ⇒
 * nhóm **không dựng**, không dựng một nhóm rỗng nói sai là "không có agent".
 */

import { useCallback, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  layDuAn,
  layHuyHieuCanChu,
  layManHinhDoiAgent,
  type AgentDong,
  type DuAnSidebar,
} from '../api';
import { NHIP_LAM_MOI, useNhipLamMoi } from '../lam-moi';
import { ChamSucSong } from './cham-suc-song';
import {
  ChamTrangThaiAgent,
  IconBaoCao,
  IconCaiDat,
  IconChevronXuong,
  IconDanhSach,
  IconDoiAgent,
  IconHopThu,
  IconMui,
  IconNhatKy,
  IconThem,
  IconTim,
  IconTongQuan,
} from './icon';
import { LOP_MUC_MENU, LOP_TAM_NOI } from './lop-nut';
import {
  DUONG_BAN_DO,
  MUC_CHINH,
  MUC_CUOI,
  NHAN_BAN_DO,
  NHOM_KHONG_TEN,
  duongDuAn,
  duongHoSoDuAn,
  type MucSidebar,
} from './muc-sidebar';
import {
  NHOM_DOI_AGENT,
  NHOM_DU_AN,
  dangMo,
  daoThuGon,
  docThuGon,
  khoaDuAn,
  luuThuGon,
} from './thu-gon';
import { XacNhanDangXuatMoiNoi, useDangXuat } from './xac-nhan-dang-xuat';

/** Khoá query huy hiệu — hằng ngoài component: một khoá, không một mảng mới mỗi render. */
const KHOA_HUY_HIEU = ['can-chu', 'huy-hieu'] as const;
const KHOA_NHIP_SIDEBAR = [KHOA_HUY_HIEU] as const;

/**
 * **Tên workspace** — brief đòi hiện ở đầu sidebar, nhưng `GET /v1/toi` chỉ trả
 * `workspace_id` (một id, không một cái tên), và SPEC không có đường nào trả tên
 * workspace: `cau-hoi-spec.md` #128. Đề xuất tạm đang dùng: tên sản phẩm.
 */
export const TEN_WORKSPACE = 'Baton';

export const NHAN_NUT_TIM = 'Tìm';
export const NHAN_NUT_TAO = 'Tạo việc';
export const NHAN_NHOM_DU_AN = 'Dự án';
/** Nhãn nhóm agent — **cùng chữ** với mục d.392 để chủ không phải học hai tên. */
export const NHAN_NHOM_DOI_AGENT = 'Đội agent';

/**
 * Nút "Tạo việc" mở **hộp tạo việc** của vỏ (`vo/tao-viec.tsx`, BAT-22) — cùng
 * hộp mà phím `C` mở (SPEC mục 14 d.413). Title nhắc phím tắt.
 *
 * Hộp sống ở **vỏ** (`Vo` của `App.tsx`), không ở sidebar: sidebar được dựng hai
 * bản (thường trú và menu trượt 375px), một hộp mỗi bản là hai hộp. Vỏ truyền
 * `onTaoViec` xuống; một sidebar dựng **không có vỏ** (không `onTaoViec`) thì
 * nút **mờ** — không có hộp nào để mở, và một nút bấm không làm gì là nói sai.
 */
export const TIP_NUT_TAO = 'Tạo việc (phím C)';

/** Title nút Tìm — nhắc phím tắt d.414. */
export const TIP_NUT_TIM = 'Tìm nhanh (Cmd/Ctrl+K)';

export function Sidebar({
  onDieuHuong,
  onTaoViec,
  onTimNhanh,
}: {
  onDieuHuong?: () => void;
  /** Mở hộp tạo việc của vỏ. Không có ⇒ nút "Tạo việc" mờ. */
  onTaoViec?: () => void;
  /** Mở command menu của vỏ (d.414). Không có ⇒ nút "Tìm" mờ. */
  onTimNhanh?: () => void;
} = {}): React.JSX.Element {
  const du_an = useQuery({ queryKey: ['du-an'], queryFn: layDuAn });
  /*
   * **Huy hiệu chạy theo nhịp chung** — d.410: một mục Cần Chủ do agent tạo phải
   * hiện lên trong 3 giây, và huy hiệu là chỗ chủ **thấy** nó trước nhất (chủ có
   * thể đang ở trang khác). Bản đầu không có nhịp nào: con số chỉ đổi khi trang
   * được dựng lại.
   *
   * Vế còn lại — **xử lý xong thì số xuống ngay** — không do nhịp này lo mà do
   * `onSettled` của mutation ở `trang/can-chu.tsx` (`invalidateQueries` với khoá
   * tiền tố `['can-chu']`, trùm cả khoá này). Chờ hết một chu kỳ 2 giây để thấy
   * huy hiệu đỏ tắt là đúng thứ chủ báo là sai.
   */
  const can_chu = useQuery({
    queryKey: KHOA_HUY_HIEU,
    queryFn: layHuyHieuCanChu,
    ...NHIP_LAM_MOI,
  });
  const doi_agent = useQuery({ queryKey: ['man-hinh-agent'], queryFn: layManHinhDoiAgent });
  /*
   * Sidebar **không** vẽ dấu "đang làm mới" (nó không có chỗ, và một huy hiệu
   * nhấp nháy ở mép màn hình thì tệ hơn im lặng), nhưng vẫn gọi hook để đăng ký
   * vế "quay lại tab thì làm mới ngay": chủ bỏ tab cả buổi rồi quay lại phải thấy
   * **ngay** là có mục mới, không chờ hết một chu kỳ.
   */
  useNhipLamMoi(false, KHOA_NHIP_SIDEBAR);
  const so_cho = can_chu.data?.huy_hieu.so_cho ?? 0;

  /*
   * Trạng thái thu gọn: đọc `localStorage` **một lần** ở `useState` khởi tạo,
   * không trong một `useEffect` — `useEffect` nghĩa là một lần vẽ "mở hết" rồi
   * đóng lại, tức nhóm nhảy ngay dưới con trỏ chủ.
   */
  const [thu_gon, datThuGon] = useState<ReadonlySet<string>>(() => docThuGon());
  const dao = useCallback((khoa: string) => {
    datThuGon((cu) => {
      const moi = daoThuGon(cu, khoa);
      luuThuGon(moi);
      return moi;
    });
  }, []);

  return (
    <nav
      aria-label="Điều hướng chính"
      /*
       * Hệ thiết kế 29/10 (`THIET-KE.md`): sidebar 240px, nền **cùng tông nền
       * trang** (`bg-nen`) — tách khỏi vùng chính bằng viền mờ của `<aside>`,
       * không bằng một mảng màu. Mục cao 28px, icon 16px + chữ.
       */
      className="flex h-full w-60 flex-col gap-2 bg-nen px-2 py-2 text-sm"
    >
      {/* Đầu sidebar: workspace (mở menu, d.401) + tìm + tạo (brief, ngoài SPEC). */}
      <div data-vung-sidebar="dau" className="flex shrink-0 items-center gap-0.5">
        <MenuWorkspace />
        {/*
         * Nút tìm **mở command menu** của d.414 (BAT-34) — cùng hộp mà
         * `Cmd/Ctrl+K` mở. Hộp sống ở vỏ (như hộp tạo việc); sidebar dựng không có
         * vỏ (không `onTimNhanh`) thì nút mờ.
         */}
        <button
          type="button"
          disabled={onTimNhanh === undefined}
          onClick={onTimNhanh}
          data-muc-them="tim"
          aria-label={NHAN_NUT_TIM}
          title={TIP_NUT_TIM}
          className={LOP_NUT_ICON_DAU}
        >
          <IconTim />
        </button>
        <button
          type="button"
          disabled={onTaoViec === undefined}
          onClick={onTaoViec}
          data-muc-them="tao"
          aria-label={NHAN_NUT_TAO}
          title={TIP_NUT_TAO}
          className={LOP_NUT_ICON_DAU}
        >
          <IconThem />
        </button>
      </div>

      {/*
       * **Vùng giữa co lại và cuộn** (BAT-12 việc 3). Cửa sổ thấp thì chỉ vùng
       * này nhường chỗ: `min-h-0` cho nó co dưới chiều cao nội dung (mặc định
       * flex con không co dưới `min-height: auto`), `overflow-y-auto` cho nó cuộn.
       * Sáu mục chính (kể cả danh sách agent mở ra dưới "Đội agent") nằm TRONG
       * vùng này cùng danh sách dự án: để chúng ngoài thì một danh sách agent dài
       * vẫn đẩy "Cài đặt" (d.394) ra khỏi màn hình. Đầu và đáy là `shrink-0`.
       */}
      <div
        data-vung-sidebar="giua"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
      >
        <ul className="flex flex-col gap-px">
          {MUC_CHINH.map((m) =>
            m.nhan === NHAN_NHOM_DOI_AGENT ? (
              /*
               * **"Đội agent" là MỘT link, và nó cũng là tiêu đề nhóm** — d.397:
               * "Tiêu đề nhóm *Đội agent* bấm được để vào trang Đội agent, và
               * **không có link thứ hai** tới cùng trang."
               *
               * Trước đợt 3 có hai thứ cùng tên: mục d.396 ở trên và một tiêu đề
               * nhóm **không bấm được** ở dưới danh sách dự án. Cách gộp: mục của
               * d.396 **là** tiêu đề nhóm, và danh sách agent nằm ngay dưới nó
               * trong cùng khối. Nhờ vậy sáu mục của d.396 vẫn liền nhau, đúng thứ
               * tự, và vẫn **đứng trước** danh sách dự án (ca d.394 đo đúng điều
               * đó) — xem `test/sidebar.test.tsx`.
               */
              <li key={m.duong}>
                <div className="flex items-center gap-0.5">
                  <Lien muc={m} so_cho={so_cho} onDieuHuong={onDieuHuong} />
                  {doi_agent.data === undefined ? null : (
                    <button
                      type="button"
                      aria-expanded={dangMo(thu_gon, NHOM_DOI_AGENT)}
                      aria-label={NHAN_NHOM_DOI_AGENT}
                      data-nut-nhom={NHOM_DOI_AGENT}
                      onClick={() => {
                        dao(NHOM_DOI_AGENT);
                      }}
                      className={LOP_NUT_MUI}
                    >
                      <IconMui mo={dangMo(thu_gon, NHOM_DOI_AGENT)} />
                    </button>
                  )}
                </div>
                {doi_agent.data === undefined || !dangMo(thu_gon, NHOM_DOI_AGENT) ? null : (
                  <ul className="flex flex-col gap-px pl-6">
                    {doi_agent.data.agent.map((a) => (
                      <li key={a.id}>
                        <NavLink
                          to={`/agent/${a.id}`}
                          data-muc-them="agent"
                          data-ma={a.id}
                          onClick={onDieuHuong}
                          className={lopMucCon}
                        >
                          <ChamAgent agent={a} />
                          <span className="truncate">{a.ten}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ) : (
              <li key={m.duong}>
                <Lien muc={m} so_cho={so_cho} onDieuHuong={onDieuHuong} />
              </li>
            ),
          )}
        </ul>

        {/* d.393 — danh sách dự án theo nhóm, mỗi dự án một chấm sức sống. */}
        <Nhom nhan={NHAN_NHOM_DU_AN} khoa={NHOM_DU_AN} mo={dangMo(thu_gon, NHOM_DU_AN)} dao={dao}>
          {theoNhom(du_an.data?.items ?? []).map(([nhom, ds]) => (
            <section key={nhom} aria-label={`Nhóm dự án: ${nhom}`}>
              <h3 className="px-2 pb-0.5 text-[11px] font-medium text-chu-mo-hon">{nhom}</h3>
              <ul className="flex flex-col gap-px">
                {ds.map((d) => (
                  <MotDuAn
                    key={d.id}
                    du_an={d}
                    mo={dangMo(thu_gon, khoaDuAn(d.ma))}
                    dao={dao}
                    onDieuHuong={onDieuHuong}
                  />
                ))}
              </ul>
            </section>
          ))}
        </Nhom>

      </div>

      {/* d.394 — dưới cùng; `shrink-0` để không bao giờ bị ép ra ngoài. */}
      <ul data-vung-sidebar="day" className="flex shrink-0 flex-col gap-px border-t border-vien pt-1.5">
        <li>
          <Lien muc={MUC_CUOI} so_cho={so_cho} onDieuHuong={onDieuHuong} />
        </li>
      </ul>
    </nav>
  );
}

/* ================================================================== *
 * Menu của tên workspace — SPEC mục 14 d.401, mục 15 d.415
 * ================================================================== */

export const NHAN_MENU_WORKSPACE = 'Menu workspace';
export const NHAN_DANG_XUAT = 'Đăng xuất';
export const NHAN_DANG_XUAT_MOI_NOI = 'Đăng xuất mọi nơi';

/**
 * **Tên workspace mở một menu chứa hai nút đăng xuất** — d.401: "Tên workspace mở
 * một menu chứa **Đăng xuất** và **Đăng xuất mọi nơi** (mục 15); hai nút này
 * **không nằm trần trên thanh trên**."
 *
 * Trước đợt 3, hai nút ấy nằm trần ở `vo/thanh-tren.tsx`. Phần **nghiệp vụ** đi
 * theo nguyên vẹn, không viết lại:
 *   * **hai đường thật** (`/v1/dang-xuat`, `/v1/dang-xuat-moi-noi`) qua một tham
 *     số `moi_noi` của `dangXuat` — mục 15 d.415 đòi đủ hai, và hai việc khác hẳn
 *     nhau về hệ quả;
 *   * `onSettled` **giữ từng dòng** (nay ở `useDangXuat`, `xac-nhan-dang-xuat.tsx`,
 *     dùng chung với `/cai-dat`): bỏ mọi query **trừ** `['toi']` rồi
 *     `invalidate` đúng `['toi']`. Lý lẽ đầy đủ ở khối ghi chú của `thanh-tren.tsx`
 *     — `clear()` xoá luôn `['toi']` và vỏ đứng nguyên tại chỗ; `invalidate` một
 *     mình thì màn hình vẫn vẽ dữ liệu của chủ sau khi chủ vừa bấm đăng xuất.
 *
 * **Menu dùng được bằng bàn phím**, theo nếp đã chốt cho menu trượt (`App.tsx`):
 * `Escape` đóng và **trả focus về nút**, và nút khai `aria-expanded` +
 * `aria-haspopup` để trình đọc màn hình biết đây là một menu. Ở 375px menu là một
 * tấm **trong luồng** ngay dưới nút (không `fixed`, không chiều rộng cứng), nên
 * nó không tràn ra ngoài 375px — d.411.
 */
function MenuWorkspace(): React.JSX.Element {
  const [mo, datMo] = useState(false);
  /*
   * **"Đăng xuất mọi nơi" hỏi xác nhận ở đây nữa** (review BAT-11): bấm mục ấy
   * chỉ đổi tấm menu thành bước xác nhận dùng chung (`XacNhanDangXuatMoiNoi`, cùng
   * component với `/cai-dat`). Chỉ nút "Xác nhận" mới gọi máy chủ; "Huỷ" và
   * `Escape` đóng hẳn menu, trả focus về nút tên workspace, không gọi gì.
   */
  const [dang_hoi, datDangHoi] = useState(false);
  const nut = useRef<HTMLButtonElement | null>(null);

  const ra = useDangXuat();

  const dong = useCallback(() => {
    datMo(false);
    datDangHoi(false);
    nut.current?.focus();
  }, []);

  const phimEscape = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dong();
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={nut}
        type="button"
        data-o="ten-workspace"
        aria-haspopup="menu"
        aria-expanded={mo}
        onClick={() => {
          datMo((v) => !v);
          datDangHoi(false);
        }}
        className="flex h-8 w-full min-w-0 items-center gap-2 rounded px-1.5 text-left font-medium text-chu hover:bg-nen-lop"
      >
        {/* Chữ đầu tên workspace — trung tính, không màu nhấn (màu nhấn không trang trí). */}
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded bg-neutral-200 text-[11px] font-semibold text-chu"
        >
          {TEN_WORKSPACE.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate">{TEN_WORKSPACE}</span>
        {/* Mũi tên xuống nhỏ xám: nút này mở một menu (THIET-KE "Bố cục vỏ"). */}
        <span data-o="chevron-workspace" className="flex shrink-0 text-chu-mo-hon">
          <IconChevronXuong />
        </span>
      </button>

      {!mo ? null : dang_hoi ? (
        /*
         * Bước xác nhận đứng **thay** tấm `role="menu"`, không nằm trong nó: một
         * `menu` chỉ được chứa `menuitem`, còn đây là một câu hỏi với hai nút.
         * Cùng chỗ, cùng khuôn (trong luồng dưới nút, không chiều rộng cứng —
         * d.411), cùng luật `Escape`. Focus vào nút "Xác nhận" nhờ `autoFocus` của
         * component dùng chung, nên `Escape` tới được `onKeyDown` dưới đây.
         */
        <div
          role="group"
          aria-label={NHAN_DANG_XUAT_MOI_NOI}
          data-o="xac-nhan-dang-xuat"
          onKeyDown={phimEscape}
          className={`absolute top-full right-0 left-0 z-20 mt-1 p-2 ${LOP_TAM_NOI}`}
        >
          <XacNhanDangXuatMoiNoi
            onXacNhan={() => {
              ra.mutate(true);
            }}
            onHuy={dong}
            dang_chay={ra.isPending}
            loi={ra.error}
          />
        </div>
      ) : (
        <div
          role="menu"
          aria-label={NHAN_MENU_WORKSPACE}
          data-o="menu-workspace"
          onKeyDown={phimEscape}
          className={`absolute top-full right-0 left-0 z-20 mt-1 flex flex-col gap-px p-1 ${LOP_TAM_NOI}`}
        >
          {[
            { nhan: NHAN_DANG_XUAT, moi_noi: false },
            { nhan: NHAN_DANG_XUAT_MOI_NOI, moi_noi: true },
          ].map((m) => (
            <button
              key={m.nhan}
              type="button"
              role="menuitem"
              /*
               * `autoFocus` cho mục đầu: menu mở bằng bàn phím phải đưa con trỏ
               * **vào** menu, nếu không `Escape` bọt lên từ `body` và không bao
               * giờ tới `onKeyDown` ở trên (đúng lỗi đã sửa cho menu trượt).
               */
              autoFocus={!m.moi_noi}
              disabled={ra.isPending}
              onClick={() => {
                if (m.moi_noi) {
                  // Chỉ mở bước xác nhận — chưa gọi máy chủ.
                  ra.reset();
                  datDangHoi(true);
                  return;
                }
                // "Đăng xuất" thường: một phiên, không hỏi (giữ nguyên).
                ra.mutate(false);
                datMo(false);
              }}
              className={`${LOP_MUC_MENU} disabled:text-neutral-500`}
            >
              {m.nhan}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Một nhóm thu gọn được: nút tiêu đề + phần thân. */
function Nhom({
  nhan,
  khoa,
  mo,
  dao,
  children,
}: {
  nhan: string;
  khoa: string;
  mo: boolean;
  dao: (khoa: string) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section data-nhom={khoa}>
      <h2>
        <button
          type="button"
          /*
           * `aria-expanded` chứ không một mũi vẽ suông: trình đọc màn hình phải
           * biết nhóm đang mở hay đóng, và ca test đọc **đúng** thuộc tính đó
           * (không đọc class, không đọc hình mũi).
           */
          aria-expanded={mo}
          data-nut-nhom={khoa}
          onClick={() => {
            dao(khoa);
          }}
          className="flex h-7 w-full items-center gap-1 rounded px-2 text-xs font-medium text-chu-mo hover:text-chu"
        >
          {nhan}
          <IconMui mo={mo} />
        </button>
      </h2>
      {mo ? <div className="flex flex-col gap-2">{children}</div> : null}
    </section>
  );
}

/**
 * Một dự án: hàng chính (chấm sức sống + tên, dẫn tới danh sách việc) và một nút
 * mở ra các đường con.
 *
 * Đường con: **Việc** (`/du-an/<MÃ>`, d.395), **Bản đồ dự án** và **Hồ sơ**
 * (`/du-an/<id>/ho-so`, mục 9 d.294).
 *
 * **Đây là đường vào Bản đồ dự án** — d.398: "Bản đồ dự án không có mục riêng ở
 * sidebar; trang vẫn còn và **vào từ một dự án**." Mục này trước đây tên "Tổng
 * quan dự án" (`cau-hoi-spec.md` #129: SPEC không có trang ấy) và trỏ vào đúng
 * đường này; nay nó mang **đúng tên trang nó mở**, vì một nhãn nói sai chỗ mình
 * dẫn tới là lý do chủ phải bấm thử mới biết.
 */
function MotDuAn({
  du_an,
  mo,
  dao,
  onDieuHuong,
}: {
  du_an: DuAnSidebar;
  mo: boolean;
  dao: (khoa: string) => void;
  onDieuHuong?: (() => void) | undefined;
}): React.JSX.Element {
  const con: readonly MucSidebar[] = [
    { nhan: 'Việc', duong: duongDuAn(du_an.ma) },
    { nhan: NHAN_BAN_DO, duong: DUONG_BAN_DO },
    { nhan: 'Hồ sơ', duong: duongHoSoDuAn(du_an.id) },
  ];
  return (
    <li>
      <div className="flex items-center gap-0.5">
        <NavLink
          to={duongDuAn(du_an.ma)}
          data-muc="du-an"
          data-ma={du_an.ma}
          onClick={onDieuHuong}
          className={lopMuc}
        >
          <ChamSucSong suc_song={du_an.suc_song} />
          <span className="truncate">{du_an.ten}</span>
        </NavLink>
        <button
          type="button"
          aria-expanded={mo}
          aria-label={`Mở rộng dự án ${du_an.ten}`}
          data-nut-du-an={du_an.ma}
          onClick={() => {
            dao(khoaDuAn(du_an.ma));
          }}
          className={LOP_NUT_MUI}
        >
          <IconMui mo={mo} />
        </button>
      </div>
      {mo ? (
        <ul className="flex flex-col gap-px pl-6">
          {con.map((c) => (
            <li key={c.nhan}>
              <NavLink
                to={c.duong}
                data-muc-them="du-an-con"
                data-ma={du_an.ma}
                onClick={onDieuHuong}
                // `end`: "Việc" (`/du-an/SPX`) không sáng khi đang ở trang con khác.
                end
                className={lopMucCon}
              >
                {c.nhan}
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * **Chấm đang làm / rảnh** của một agent (brief).
 *
 * Nhãn đi **nguyên văn `nhan_trang_thai` của máy chủ** — cùng kỷ luật `api.ts`:
 * giao diện không dịch mã trạng thái thành chữ.
 *
 * BAT-67: hình và màu là `ChamTrangThaiAgent` chung (năm hình, `LOP_TRANG_THAI_AGENT`
 * — THIET-KE "Chấm trạng thái agent"), cùng chấm của Tổng quan / Đội agent. Ở đây
 * chấm **mang nhãn** (`role="img"` + `aria-label` + `<title>` = `nhan_trang_thai`)
 * vì sidebar không có chữ trạng thái đứng cạnh. Vỏ `span` giữ `data-trang-thai-agent`
 * (ca test cũ đọc nó). BAT-69 bỏ `title` lặp trên vỏ: nhãn đã nằm trên chính chấm
 * (`aria-label`, và `<title>` của SVG cho tooltip) — một nguồn nhãn, không hai.
 */
function ChamAgent({ agent }: { agent: AgentDong }): React.JSX.Element {
  return (
    <span data-trang-thai-agent={agent.trang_thai} className="inline-flex shrink-0">
      <ChamTrangThaiAgent trang_thai={agent.trang_thai} nhan={agent.nhan_trang_thai} />
    </span>
  );
}

function Lien({
  muc,
  so_cho,
  them = false,
  onDieuHuong,
}: {
  muc: MucSidebar;
  so_cho: number;
  them?: boolean;
  onDieuHuong?: (() => void) | undefined;
}): React.JSX.Element {
  return (
    <NavLink
      to={muc.duong}
      // `end` để Tổng quan (`/`) không sáng trên mọi đường con.
      end={muc.duong === '/'}
      onClick={onDieuHuong}
      /*
       * `data-muc` để ca test gọi ra **đúng** các mục của d.391–394, tách khỏi
       * các liên kết dự án của d.393 (cũng nằm trong cùng `<nav>`) và khỏi các
       * mục ngoài SPEC (`data-muc-them`). Nhãn nằm trong một `<span data-nhan>`
       * riêng vì huy hiệu cũng là chữ: đọc `textContent` của cả liên kết sẽ ra
       * `"Cần Chủ3"`.
       */
      {...(them ? { 'data-muc-them': 'chinh' } : { 'data-muc': 'chinh' })}
      className={lopMuc}
    >
      {({ isActive }) => {
        const Icon = ICON_MUC[muc.duong];
        return (
          <>
            {Icon === undefined ? null : (
              <span className={isActive ? 'text-chu' : 'text-chu-mo'}>
                <Icon />
              </span>
            )}
            <span data-nhan="co" className="min-w-0 flex-1 truncate">
              {muc.nhan}
            </span>
            {muc.huy_hieu === true && so_cho > 0 ? (
              /*
               * Huy hiệu GIỮ đỏ đậm + chữ trắng: nó mang nghĩa "có việc chờ chủ"
               * (màu chỉ để mang nghĩa — THIET-KE.md), và đỏ đậm chữ trắng đọc
               * tốt trên cả hai nền. Chỗ `text-white` DUY NHẤT có lý do của `src/`.
               */
              <span
                data-huy-hieu="can-chu"
                aria-label={`${String(so_cho)} mục Chờ`}
                className="rounded-full bg-red-600 px-1.5 text-[11px] leading-4 font-medium text-white tabular-nums"
              >
                {so_cho}
              </span>
            ) : null}
          </>
        );
      }}
    </NavLink>
  );
}

/* ------------------------------------------------------------------ *
 * Lớp của một mục sidebar — hệ thiết kế 29/10 (THIET-KE.md)
 * ------------------------------------------------------------------ *
 * Mục cao 28px (`h-7`), bo 6px. **Đang chọn** ⇒ nền lớp nổi đậm (`nen-noi`)
 * + chữ chính; **hover** ⇒ lớp nổi nhạt (`nen-lop`) — hai bậc, để mục đang chọn
 * vẫn phân biệt được với mục đang trỏ chuột. Không màu nhấn: một cột sidebar
 * toàn vạch tím là trang trí.
 */
const LOP_MUC_CHON = 'bg-nen-noi text-chu';
const LOP_MUC_THUONG = 'text-neutral-700 hover:bg-nen-lop hover:text-chu';
const LOP_MUC_CON_THUONG = 'text-chu-mo hover:bg-nen-lop hover:text-chu';

function lopMuc({ isActive }: { isActive: boolean }): string {
  return `flex h-7 min-w-0 flex-1 items-center gap-2 rounded px-2 transition-colors ${
    isActive ? LOP_MUC_CHON : LOP_MUC_THUONG
  }`;
}

/** Mục con (agent, đường con của dự án): chữ phụ khi chưa chọn. */
function lopMucCon({ isActive }: { isActive: boolean }): string {
  return `flex h-7 min-w-0 items-center gap-2 truncate rounded px-2 transition-colors ${
    isActive ? LOP_MUC_CHON : LOP_MUC_CON_THUONG
  }`;
}

/** Nút mũi thu gọn (Đội agent, mỗi dự án). */
const LOP_NUT_MUI =
  'flex size-6 shrink-0 items-center justify-center rounded text-chu-mo-hon hover:bg-nen-lop hover:text-chu';

/** Nút icon ở đầu sidebar (Tìm, Tạo việc). */
const LOP_NUT_ICON_DAU =
  'flex size-7 shrink-0 items-center justify-center rounded text-chu-mo hover:bg-nen-lop hover:text-chu disabled:text-neutral-400 disabled:hover:bg-transparent';

/** Icon 16px của từng mục, tra theo **đường** (sổ tra `muc-sidebar.ts` giữ nhãn và đường). */
const ICON_MUC: Readonly<Record<string, () => React.JSX.Element>> = {
  '/': IconTongQuan,
  '/can-chu': IconHopThu,
  '/ticket': IconDanhSach,
  '/bao-cao': IconBaoCao,
  '/nhat-ky': IconNhatKy,
  '/doi-agent': IconDoiAgent,
  '/cai-dat': IconCaiDat,
};

/**
 * Gom dự án theo nhóm (d.393), bỏ dự án lưu trữ (d.70).
 *
 * Thứ tự nhóm: theo tên nhóm, và nhóm "chưa có nhóm" **xuống cuối** — một dự án
 * chưa được xếp nhóm không được chen lên trước những nhóm chủ đã đặt tên. Thứ tự
 * dự án trong nhóm giữ nguyên thứ tự máy chủ trả (`ORDER BY ten, id`).
 */
export function theoNhom(ds: readonly DuAnSidebar[]): [string, DuAnSidebar[]][] {
  const bang = new Map<string, DuAnSidebar[]>();
  for (const d of ds) {
    if (d.trang_thai === 'archived') continue;
    const nhom = d.nhom ?? NHOM_KHONG_TEN;
    const co = bang.get(nhom);
    if (co === undefined) bang.set(nhom, [d]);
    else co.push(d);
  }
  return [...bang.entries()].sort(([a], [b]) => {
    if (a === NHOM_KHONG_TEN) return b === NHOM_KHONG_TEN ? 0 : 1;
    if (b === NHOM_KHONG_TEN) return -1;
    return a.localeCompare(b, 'vi');
  });
}
