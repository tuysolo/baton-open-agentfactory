/**
 * **Đội agent** (`/doi-agent`) và **trang một agent** (`/agent/:id`) — SPEC mục 3
 * d.80–105, mục 14 d.392.
 *
 * | Vế SPEC | Ở đâu |
 * |---|---|
 * | d.80 "đội mình có ai" | `TrangDoiAgent` — một hàng mỗi agent |
 * | d.80 "mỗi agent đang làm gì" | `trang_thai` + khối phiên đang mở |
 * | d.80 "được phép làm gì" | `BangQuyen` (9 hàng của d.86–96) |
 * | d.80 "lần cuối lên tiếng lúc nào" | `Moc` trên `len_tieng_luc` (19.12 câu 23) |
 * | d.104 "phiên đang mở" | `KhoiPhien` |
 * | d.104 "lịch sử lượt giao (dạng bảng)" | `BangLuotGiao` |
 * | d.104 "tỉ lệ nộp lại đạt review" | `cauTiLe` (19.5) |
 * | d.410 thay đổi của agent hiện trong 3 giây | `NHIP_LAM_MOI` (`src/lam-moi.ts`) |
 * | d.412 thời gian tương đối, rê chuột thấy giờ VN | `Moc` (mốc = `bay_gio` máy chủ) |
 *
 * ## Trang này KHÔNG tính luật nào
 *
 * Trạng thái agent (d.98–103 + ánh xạ 7→5 của 19.12 câu 43), trạng thái dẫn xuất
 * của phiên (d.184, d.194), bảng quyền hiện hành (gồm cả ô chủ đã chỉnh riêng),
 * tỉ lệ đạt lần đầu (19.5), mọi `nhan_*` tiếng Việt (d.381): tới **đã tính** từ
 * `GET /v1/man-hinh-agent*`. Lý lẽ đầy đủ ở đầu
 * `packages/api/src/doc-man-hinh-agent.ts`.
 *
 * ## Token
 *
 * Màn hình hiện **4 ký tự cuối** (mục 3 d.83) và không gì hơn: thân API không có
 * trường nào mang token hay băm token (mục 3 d.83; cùng tinh thần mục 15 d.427;
 * có ca ghim ở tầng API).
 * Hai nút "Tạo lại token" / "Thu hồi token" (cũng d.83) nằm ở trang **một agent**
 * và sống trong `trang/token-agent.tsx` — token mới chỉ có trong state của hộp.
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LoiApi,
  layManHinhAgent,
  layManHinhDoiAgent,
  type AgentDong,
  type HangQuyen,
  type LuotGiaoCuaAgent,
  type ManHinhAgent,
  type PhienDong,
  type TiLeDatLanDau,
} from '../api';
import { NHIP_LAM_MOI, useNhipLamMoi } from '../lam-moi';
import { DauLamMoi } from '../vo/dau-lam-moi';
import { ChamTrangThaiAgent } from '../vo/icon';
import { Khoi } from '../vo/khoi';
import {
  LOP_BANG,
  LOP_CAU_CHO,
  LOP_CAU_LOI,
  LOP_CHIP,
  LOP_CHIP_CANH,
  LOP_CHIP_LOI,
  LOP_CHU_MO_HON,
  LOP_CHU_PHU,
  LOP_DAU_COT,
  LOP_DONG,
  LOP_DONG_BANG,
  LOP_DS_DONG,
  LOP_HANG_TIEU_DE,
  LOP_LIEN_KET,
  LOP_O_BANG,
  LOP_THAN_BANG,
  LOP_THE,
  LOP_TIEU_DE_TRANG,
  LOP_VUNG_TRANG,
} from '../vo/lop-nut';
import { duongTicket } from '../vo/muc-sidebar';
import { Moc } from './tong-quan';
import { NutToken } from './token-agent';

/** Tiêu đề trang — **cùng chữ** với nhãn sidebar của d.392 ("Đội agent"). */
export const TEN_TRANG_DOI_AGENT = 'Đội agent';
export const CAU_DANG_TAI_DOI_AGENT = 'Đang tải Đội agent…';
export const CAU_DANG_TAI_AGENT = 'Đang tải agent…';
export const CAU_CHUA_CO_AGENT = 'Chưa có agent nào.';
export const CAU_CHUA_LEN_TIENG = 'Chưa lên tiếng lần nào';
export const CAU_KHONG_CO_PHIEN_MO = 'Không có phiên nào đang mở.';
export const CAU_CHUA_CO_LUOT_GIAO = 'Chưa có lượt giao nào.';
export const CAU_VAO_MOI_DU_AN = 'Vào mọi dự án';
export const CAU_CHUA_VAO_DU_AN_NAO = 'Chưa được vào dự án nào.';
export const NHAN_DA_TAT = 'Đã tắt';

/** Tiêu đề bốn khối của trang agent — đúng bốn vế mà d.104 kể. */
export const TEN_KHOI_AGENT = {
  quyen: 'Quyền',
  phien: 'Phiên đang mở',
  luot_giao: 'Lịch sử lượt giao',
  du_an: 'Dự án được vào',
} as const;

/** Năm cột của bảng lịch sử lượt giao (d.104 "dạng bảng"). */
export const COT_LUOT_GIAO = ['Lượt', 'Ticket', 'Loại', 'Trạng thái', 'Giao lúc'] as const;

/**
 * "**Tỉ lệ nộp lại đạt review**" của d.104, định nghĩa chính xác ở 19.5.
 *
 * Mẫu số 0 ⇒ **không có tỉ lệ**, không phải 0%: một agent chưa nộp lần nào mà
 * hiện "0%" là nói sai về nó. Máy chủ đã trả `ti_le === null` cho đúng ca đó, và
 * hàm này tôn trọng vế ấy thay vì `?? 0`.
 */
export function cauTiLe(t: TiLeDatLanDau): string {
  if (t.ti_le === null) return 'chưa có số liệu';
  return `${String(Math.round(t.ti_le * 100))}% (${String(t.dat)}/${String(t.da_nop)})`;
}

/* ================================================================== *
 * 1. Đội agent — d.392
 * ================================================================== */

export function TrangDoiAgent(): React.JSX.Element {
  const q = useQuery({
    queryKey: ['doi-agent'],
    queryFn: layManHinhDoiAgent,
    // d.410: trạng thái agent và "lần cuối lên tiếng" đổi do **chính agent**.
    ...NHIP_LAM_MOI,
  });
  const { hien_dau } = useNhipLamMoi(q.isFetching, [['doi-agent']]);

  return (
    <div className={LOP_VUNG_TRANG}>
      {/* Dấu làm mới **trong** hàng tiêu đề — nếp chung, xem `trang/tong-quan.tsx`. */}
      <div className={LOP_HANG_TIEU_DE}>
        <h1 className={LOP_TIEU_DE_TRANG}>{TEN_TRANG_DOI_AGENT}</h1>
        <DauLamMoi hien={hien_dau} />
      </div>
      {q.data === undefined ? (
        <TrangThaiTai q={q} cau_dang_tai={CAU_DANG_TAI_DOI_AGENT} />
      ) : q.data.agent.length === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_CHUA_CO_AGENT}</p>
      ) : (
        <ul data-ds="agent" className={LOP_DS_DONG}>
          {q.data.agent.map((a) => (
            <HangAgent key={a.id} a={a} bay_gio={q.data.bay_gio} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Đường trang một agent. SPEC **không** chốt đường này — `spec-questions.md` #101. */
export const duongAgent = (id: string): string => `/agent/${id}`;

function HangAgent({ a, bay_gio }: { a: AgentDong; bay_gio: number }): React.JSX.Element {
  return (
    /*
     * Một dòng gọn (THIET-KE "Bảng và danh sách"): chấm trạng thái → tên (cột bề
     * rộng cố định, cắt `…`) → vai trò chữ phụ → chip trạng thái → model chữ mờ
     * hơn, "lên tiếng" dồn phải. `flex-wrap` để 375px không tràn.
     */
    <li data-agent={a.id} className={`flex-wrap ${LOP_DONG}`}>
      {/* `aria-hidden`: chữ trạng thái trong chip là thứ được đọc. */}
      <ChamTrangThaiAgent trang_thai={a.trang_thai} />
      <Link
        to={duongAgent(a.id)}
        title={a.ten}
        className="w-40 shrink-0 truncate font-medium text-chu hover:underline"
      >
        {a.ten}
      </Link>
      <span data-o="vai-tro" className={LOP_CHU_PHU}>
        {a.nhan_vai_tro}
      </span>
      <span data-trang-thai={a.trang_thai} className={LOP_CHIP}>
        {a.nhan_trang_thai}
      </span>
      {a.model === null || a.model === '' ? null : (
        <span data-o="model" className={LOP_CHU_MO_HON}>
          {a.model}
        </span>
      )}
      <span data-o="len-tieng" className="ml-auto shrink-0 text-xs">
        {a.len_tieng_luc === null ? (
          <span className="text-chu-mo-hon">{CAU_CHUA_LEN_TIENG}</span>
        ) : (
          <Moc luc={a.len_tieng_luc} bay_gio={bay_gio} />
        )}
      </span>
    </li>
  );
}

/* ================================================================== *
 * 2. Trang một agent — d.104
 * ================================================================== */

export function TrangAgent({ id }: { id: string }): React.JSX.Element {
  const q = useQuery({
    queryKey: ['agent', id],
    queryFn: () => layManHinhAgent(id),
    ...NHIP_LAM_MOI,
  });
  const { hien_dau } = useNhipLamMoi(q.isFetching, [['agent', id]]);

  if (q.data === undefined) {
    return (
      <div className={LOP_VUNG_TRANG}>
        <TrangThaiTai q={q} cau_dang_tai={CAU_DANG_TAI_AGENT} />
      </div>
    );
  }

  const mh: ManHinhAgent = q.data;
  const a = mh.agent;

  return (
    <div data-o="trang-agent" className={LOP_VUNG_TRANG}>
      <header className="flex flex-col gap-2">
        <div className={LOP_HANG_TIEU_DE}>
          <h1 className={LOP_TIEU_DE_TRANG}>{a.ten}</h1>
          <DauLamMoi hien={hien_dau} />
        </div>
        {/*
         * Hàng chip của trang chi tiết (THIET-KE "Trang"): trạng thái (chấm trước
         * chữ, chấm `aria-hidden`) và vai trò đều là `LOP_CHIP`; "Đã tắt" giữ
         * nghĩa lỗi bằng chữ `loi`, cùng dáng chip, không tô nền.
         */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span data-trang-thai={a.trang_thai} className={LOP_CHIP}>
            <ChamTrangThaiAgent trang_thai={a.trang_thai} />
            {a.nhan_trang_thai}
          </span>
          <span data-o="vai-tro" className={LOP_CHIP}>
            {a.nhan_vai_tro}
          </span>
          {a.disabled ? (
            <span data-o="disabled" className={LOP_CHIP_LOI}>
              {NHAN_DA_TAT}
            </span>
          ) : null}
          {/* Mục 3 d.83 — **4 ký tự cuối**, không bao giờ là token. */}
          {a.token_bon_cuoi === null ? null : (
            <span data-o="token-bon-cuoi" className="font-mono text-chu-mo-hon">
              ••••{a.token_bon_cuoi}
            </span>
          )}
        </div>
        {a.mo_ta === null || a.mo_ta === '' ? null : (
          <p data-o="mo-ta" className="text-sm text-chu-mo">
            {a.mo_ta}
          </p>
        )}
        <dl className={`flex flex-wrap gap-4 ${LOP_CHU_PHU}`}>
          <div>
            <dt className="inline">Lần cuối lên tiếng: </dt>
            <dd data-o="len-tieng" className="inline">
              {a.len_tieng_luc === null ? (
                CAU_CHUA_LEN_TIENG
              ) : (
                <Moc luc={a.len_tieng_luc} bay_gio={mh.bay_gio} />
              )}
            </dd>
          </div>
          <div>
            <dt className="inline">Tỉ lệ đạt lần đầu (30 ngày): </dt>
            <dd data-o="ti-le" className="inline font-medium text-chu tabular-nums">
              {cauTiLe(mh.ti_le_dat_lan_dau)}
            </dd>
          </div>
        </dl>
        {/* Mục 3 d.83 — tạo lại / thu hồi token. Token thô không ra khỏi hộp. */}
        <NutToken agent={a} />
      </header>

      <KhoiDuAn mh={mh} />
      <KhoiPhien ds={mh.phien_dang_mo} bay_gio={mh.bay_gio} />
      <BangLuotGiao ds={mh.luot_giao} bay_gio={mh.bay_gio} />
      <BangQuyen ds={mh.bang_quyen} />
    </div>
  );
}

function KhoiDuAn({ mh }: { mh: ManHinhAgent }): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI_AGENT.du_an} ma="du-an">
      {/*
       * Cờ "tất cả dự án" (mục 3 d.82) làm danh sách `agent_project` **rỗng** mà
       * agent vẫn vào mọi dự án. Vẽ "Chưa được vào dự án nào" ở ca đó là nói
       * ngược hẳn sự thật, nên cờ được hiện **trước** và thay cho danh sách.
       */}
      {mh.agent.vao_tat_ca_du_an ? (
        <p data-o="moi-du-an" className="text-sm font-medium text-chu">
          {CAU_VAO_MOI_DU_AN}
        </p>
      ) : mh.du_an.length === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_CHUA_VAO_DU_AN_NAO}</p>
      ) : (
        <ul data-ds="du-an" className="flex flex-wrap gap-2">
          {mh.du_an.map((d) => (
            <li key={d.id} data-du-an={d.ma} className={LOP_CHIP}>
              {d.ten}
              {d.quan_ly ? (
                <span data-o="quan-ly" className="text-chu-mo">
                  quản lý
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Khoi>
  );
}

/** Đường chi tiết phiên — d.402. SPEC không chốt đường, xem #101. */
export const duongPhien = (id: string): string => `/phien/${id}`;

function KhoiPhien({ ds, bay_gio }: { ds: PhienDong[]; bay_gio: number }): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI_AGENT.phien} ma="phien">
      {ds.length === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_KHONG_CO_PHIEN_MO}</p>
      ) : (
        <ul data-ds="phien" className={LOP_DS_DONG}>
          {ds.map((p) => (
            <li key={p.id} data-phien={p.id} className={`flex-wrap ${LOP_DONG}`}>
              <Link to={duongPhien(p.id)} className={LOP_LIEN_KET}>
                {p.nhan_trang_thai}
              </Link>
              {/* Mục 6 d.184 — **máy chủ** quyết phiên có đứng hay không. */}
              {p.dung ? (
                <span data-o="dung" className={LOP_CHIP_CANH}>
                  Đứng
                </span>
              ) : null}
              <span className={LOP_CHU_PHU}>
                tín hiệu cuối <Moc luc={p.tin_hieu_cuoi_luc} bay_gio={bay_gio} />
              </span>
              <span data-o="nguong" className="ml-auto text-xs text-chu-mo-hon">
                ngưỡng {p.nguong_dung_phut} phút
              </span>
            </li>
          ))}
        </ul>
      )}
    </Khoi>
  );
}

function BangLuotGiao({
  ds,
  bay_gio,
}: {
  ds: LuotGiaoCuaAgent[];
  bay_gio: number;
}): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI_AGENT.luot_giao} ma="luot-giao">
      {ds.length === 0 ? (
        <p className={LOP_CAU_CHO}>{CAU_CHUA_CO_LUOT_GIAO}</p>
      ) : (
        /* Khung cuộn ngang: d.411 — một bảng 5 cột không vừa 375px. */
        <div className={`overflow-x-auto ${LOP_THE}`}>
          <table data-bang="luot-giao" className={`min-w-full ${LOP_BANG}`}>
            <thead>
              <tr>
                {COT_LUOT_GIAO.map((c) => (
                  <th key={c} scope="col" className={LOP_DAU_COT}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={LOP_THAN_BANG}>
              {ds.map((l) => (
                <tr key={l.id} data-luot={l.id} className={LOP_DONG_BANG}>
                  <td className={`${LOP_O_BANG} tabular-nums text-chu-mo`}>{l.so_luot}</td>
                  <td className={LOP_O_BANG}>
                    <Link to={duongTicket(l.ticket_ma)} className="ma-ticket hover:text-chu">
                      {l.ticket_ma}
                    </Link>{' '}
                    <span className="text-chu">{l.ticket_tieu_de}</span>
                  </td>
                  <td data-o="loai" className={`${LOP_O_BANG} text-chu-mo`}>
                    {l.nhan_loai}
                  </td>
                  <td data-o="trang-thai" className={LOP_O_BANG}>
                    {l.nhan_trang_thai}
                    {/* Dẫn xuất của mục 5 — máy chủ tính tại `bay_gio` của thân. */}
                    {l.khong_phan_hoi ? (
                      <span data-o="khong-phan-hoi" className="ml-1 font-medium text-loi">
                        Không phản hồi
                      </span>
                    ) : null}
                  </td>
                  <td className={LOP_O_BANG}>
                    <Moc luc={l.tao_luc} bay_gio={bay_gio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Khoi>
  );
}

/**
 * Bảng quyền — d.80 ("được phép làm gì"), 9 hàng của d.86–96.
 *
 * Nhãn hàng và nhãn phạm vi tới **từ máy chủ** (`VIEC_QUYEN` / `PHAM_VI_QUYEN`
 * của `@baton/shared`, nơi bảng SPEC đã được chép **một** lần và có test từng
 * ô). Gõ lại chín tên hàng ở đây là mở đường cho web nói khác CLI về cùng một ô.
 */
function BangQuyen({ ds }: { ds: HangQuyen[] }): React.JSX.Element {
  return (
    <Khoi ten={TEN_KHOI_AGENT.quyen} ma="quyen">
      <div className={`overflow-x-auto ${LOP_THE}`}>
        <table data-bang="quyen" className={`min-w-full ${LOP_BANG}`}>
          <tbody className={LOP_THAN_BANG}>
            {ds.map((h) => (
              <tr key={h.viec} data-quyen={h.viec} className={LOP_DONG_BANG}>
                <th scope="row" className={`${LOP_O_BANG} font-normal text-chu-mo`}>
                  {h.nhan_viec}
                </th>
                <td data-pham-vi={h.pham_vi} className={`${LOP_O_BANG} text-chu`}>
                  {h.nhan_pham_vi}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Khoi>
  );
}

/* ================================================================== *
 * 3. Trạng thái tải — d.408
 * ================================================================== */

/**
 * "Sau lần tải đầu, chuyển trang **không có màn hình chờ toàn trang**" (d.408).
 *
 * Nên chỉ **lần tải đầu** (`data === undefined && isPending`) mới có dòng "Đang
 * tải…"; mọi lần tải lại giữ nguyên khối cũ trên màn hình (TanStack Query giữ
 * `data` qua lượt refetch, nên điều kiện phải là `data === undefined`, **không**
 * `isFetching`). Component này chỉ được gọi ở nhánh `data === undefined`.
 */
export function TrangThaiTai({
  q,
  cau_dang_tai,
}: {
  q: { isPending: boolean; error: unknown };
  cau_dang_tai: string;
}): React.JSX.Element {
  if (q.isPending) {
    return (
      <p role="status" className={LOP_CAU_CHO}>
        {cau_dang_tai}
      </p>
    );
  }
  return (
    <p role="alert" className={LOP_CAU_LOI}>
      {q.error instanceof LoiApi ? q.error.message : String(q.error)}
    </p>
  );
}
