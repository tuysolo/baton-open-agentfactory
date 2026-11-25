/**
 * **Giao việc cho agent trên web** — SPEC mục 14 d.415 ("trên ticket đang chọn: …
 * `A` giao (chọn agent)"), mục 5 (tạo lượt giao), mục 3 (agent `disabled`). BAT-33.
 *
 * Hai lối vào, **một** hộp (component này):
 *   * phím `A` trên ticket đang chọn ở trang danh sách (`usePhimTheDangChon` của
 *     `trang/danh-sach-ticket.tsx` — cùng listener, cùng điều kiện với `S`/`P`/`L`);
 *   * nút "Giao việc" ở đầu chi tiết ticket (`ThanChiTietTicket` — nên có ở cả
 *     trang `/t/<MÃ>` lẫn panel bên phải của danh sách, vì hai chỗ dùng chung thân).
 *
 * ## Không lạc quan
 *
 * Lượt giao chưa có id, số lượt (19.5), hạn phản hồi cho tới khi máy chủ cấp; và
 * máy chủ còn có thể đổi trạng thái ticket (`planned → Đang làm`, mục 4 dòng 134)
 * và người đang cầm (19.1). Hiện một lượt "tạm" là đoán cả bốn thứ đó. Nên cùng
 * khuôn hộp tạo việc (`spec-questions.md` #149, #153): khoá nút "Đang giao…" trong lúc
 * gửi; thành công thì đóng hộp và **làm mới** (`lamMoiTheoSo`) để chi tiết hiện lượt
 * thật; máy chủ từ chối (`ASSIGNMENT_OPEN`, `FORBIDDEN`, `INVALID_INPUT`,
 * `PROJECT_NOT_ACCEPTING`…) thì câu **nguyên văn** ra toast (d.418), hộp **giữ
 * nguyên** — không đóng, giữ agent đã chọn và brief đã gõ — để sửa rồi gửi lại.
 * Không ghi gì vào cache ⇒ không có gì để hoàn, không có lượt giả nào trên màn hình.
 *
 * ## Một lần gửi, đích trong BIẾN
 *
 * `useMotLan` (`mot-lan.ts`, BAT-32): chốt `useRef` đồng bộ — hai lần submit trong
 * cùng một nhịp chỉ ra **một** `POST`. `ticket_id` và người nhận nằm trong biến của
 * `mutate` (BAT-29): `mutationFn` chỉ đọc từ biến, không từ closure của lần vẽ.
 *
 * ## Brief: chỉ gửi mục đã nhập
 *
 * Máy chủ: mục brief **vắng** ⇒ lấy của ticket; mục có mà rỗng ⇒ `null` (xoá mục đó
 * cho lượt). Ô để trống vì thế **không** được gửi (`thanGiaoViec`), nếu không một
 * lần giao "không sửa gì" sẽ xoá sạch brief của ticket khỏi lượt.
 *
 * ## Hộp
 *
 * Cùng khuôn `vo/tao-viec.tsx` và bảng phím `?` (`chanPhimNgoaiHop`, `vongTab`):
 * `role="dialog"` + `aria-modal`, có nhãn; focus vào ô agent khi mở; `Esc` đóng (trừ
 * lúc IME, trừ lúc đang gửi thật — lượt **tạm dừng vì mất mạng** thì Esc/Huỷ bật lại
 * và đóng hộp là **huỷ gửi**, BAT-34 việc 2, `huy-gui.ts`; hộp bị tháo lúc đó cũng
 * huỷ); Tab/Shift+Tab vòng trong hộp; phím trong hộp không
 * bọt ra listener của trang; đóng thì trả focus về phần tử đã mở hộp (nút "Giao
 * việc", hay nút "Mở" của thẻ đang chọn — `traFocus`).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MUC_BRIEF,
  cauLoi,
  giaoViec,
  layAgent,
  type AgentChon,
  type MucBrief,
  type ThanGiaoViec,
} from '../api';
import { tomTatLoiLo } from '../chon-nhieu';
import { lamMoiTheoSo } from '../ghi-lac-quan';
import {
  CAU_CHO_MANG,
  CAU_CHO_MANG_DA_THU,
  CAU_DA_HUY_GIAO,
  LoiHuyGui,
  batDauLuot,
  taoCoLuot,
  useHuyGuiKhiDong,
  type CoLuotGui,
} from '../huy-gui';
import { useMotLan } from '../mot-lan';
import { NHAN_BRIEF } from '../nhan-brief';
import { LOP_TIEU_DE_MUC, NUT_CHINH, NUT_MO_KHI_DISABLED } from './lop-nut';
import { chanPhimNgoaiHop, dangSoanIme } from './tao-viec';
import { useToast } from './toast';

/* ================================================================== *
 * Chữ của hộp
 * ================================================================== */

export const NHAN_HOP_GIAO_VIEC = 'Giao việc';
export const NHAN_NUT_GIAO_VIEC = 'Giao việc';
export const NHAN_O_AGENT = 'Giao cho agent';
export const NHAN_CHUA_CHON_AGENT = '— Chọn agent —';
export const NHAN_AGENT_DA_TAT = 'đã tắt';
export const NHAN_SUA_BRIEF = 'Sửa brief riêng cho lượt này';
export const GOI_Y_BRIEF = 'Để trống: dùng brief của ticket';
export const NHAN_NUT_GUI_GIAO = 'Giao việc';
export const NHAN_NUT_DANG_GIAO = 'Đang giao…';
export const NHAN_NUT_HUY_GIAO = 'Huỷ';
export const NHAN_DONG_HOP_GIAO_NGOAI = 'Đóng hộp giao việc (bấm ra ngoài)';
export const CAU_THIEU_AGENT = 'Chọn một agent.';
export const CAU_DANG_TAI_AGENT = 'Đang tải danh sách agent…';
export const CAU_KHONG_CO_AGENT = 'Chưa có agent nào.';
export const CAU_KHONG_CO_AGENT_BAT = 'Không có agent nào đang bật.';

/** Bộ chọn của hộp trên DOM — listener phím của trang thoát sớm khi nó mở. */
export const CHON_HOP_GIAO_VIEC = '[data-o="hop-giao-viec"]';

export function hopGiaoViecDangMo(): boolean {
  return document.querySelector(CHON_HOP_GIAO_VIEC) !== null;
}

/* ================================================================== *
 * Hàm thuần
 * ================================================================== */

/** Brief đang gõ trong hộp — mục nào chưa gõ thì vắng. */
export type NhapBrief = Partial<Record<MucBrief, string>>;

/**
 * Thân `POST /v1/ticket/:id/luot-giao`: người nhận + **chỉ** các mục brief có chữ
 * (sau khi cắt khoảng trắng). Giá trị gửi đi là chữ chủ gõ (máy chủ tự cắt).
 */
export function thanGiaoViec(nguoi_nhan_agent_id: string, brief: NhapBrief): ThanGiaoViec {
  const than: ThanGiaoViec = { nguoi_nhan_agent_id };
  for (const m of MUC_BRIEF) {
    const v = brief[m];
    if (v !== undefined && v.trim() !== '') than[m] = v;
  }
  return than;
}

/** Agent chọn được: chưa bị tắt (SPEC mục 5 — giao cho agent `disabled` là `FORBIDDEN`). */
export function chonDuoc(a: Pick<AgentChon, 'disabled'>): boolean {
  return a.disabled !== true;
}

/* ================================================================== *
 * Hộp
 * ================================================================== */

/** Đích của lần giao — **cả** id (cho máy chủ) và mã (cho khoá chi tiết). */
export interface TicketGiao {
  id: string;
  ma: string;
}

interface BienGiao {
  /** Đích — chụp lúc bấm. Một thẻ, hoặc (BAT-35) mọi thẻ đã chọn. */
  dich: readonly TicketGiao[];
  /** `true` = lượt nhiều thẻ: lỗi từng thẻ được gom, không ném. */
  nhieu: boolean;
  than: ThanGiaoViec;
  /** Cờ huỷ của ĐÚNG lượt này — BAT-34 việc 2, `huy-gui.ts`. */
  co: CoLuotGui;
}

/** Kết quả một lượt giao: thẻ đã giao xong và thẻ máy chủ từ chối (kèm lỗi). */
interface KetQuaLuotGiao {
  xong: TicketGiao[];
  loi: { the: TicketGiao; loi: unknown }[];
}

/** Tiêu đề hộp nhiều thẻ — "Giao N thẻ". */
export const nhanGiaoNhieu = (n: number): string => `Giao ${String(n)} thẻ`;

const O_NHAP = 'rounded border border-vien bg-nen px-2 py-1 text-sm text-chu';
/**
 * Một thẻ: `ticket`. Nhiều thẻ (BAT-35, d.416 "áp một phím cho nhiều ticket"):
 * `nhieu` — hộp mở **một lần**, chủ chọn agent + brief **một lần**, rồi `giaoViec`
 * **từng thẻ, tuần tự** (mỗi thẻ là một lượt giao có kiểm riêng ở máy chủ: lượt mở,
 * quyền dự án…; tuần tự để không dồn máy chủ và để thứ tự lỗi đọc được). Vẫn
 * **không lạc quan**. Xong: thẻ thành công làm mới như một thẻ và được báo lên
 * (`daGiaoLo` — trang bỏ chọn chúng); có thẻ lỗi ⇒ một toast tóm tắt (câu máy chủ
 * nguyên văn) và hộp **giữ mở** với đúng các thẻ lỗi (trang thu `nhieu` lại), giữ
 * agent + brief để gửi lại; không lỗi ⇒ đóng. Một `useMotLan` cho cả lượt.
 */
export function HopGiaoViec({
  ticket,
  nhieu,
  daGiaoLo,
  dong,
  traFocus,
}: {
  ticket?: TicketGiao;
  nhieu?: readonly TicketGiao[];
  daGiaoLo?: (ids_xong: readonly string[]) => void;
  dong: () => void;
  /**
   * Chỗ trả focus khi đóng, nếu lúc mở focus không ở phần tử nào cụ thể (phím `A`
   * bấm khi focus đang ở `body`): nút "Mở" của thẻ đang chọn.
   */
  traFocus?: () => HTMLElement | null;
}): React.JSX.Element {
  const la_nhieu = nhieu !== undefined;
  const dich_hien: readonly TicketGiao[] = nhieu ?? (ticket === undefined ? [] : [ticket]);
  const qc = useQueryClient();
  const toast = useToast();
  // Cùng khoá `['agent']` với ô lọc d.396 và `useTenAgent`: không thêm lượt gọi.
  const agent_q = useQuery({ queryKey: ['agent'], queryFn: layAgent });
  const ds = useMemo(() => agent_q.data?.items ?? [], [agent_q.data]);
  /*
   * Chưa có agent nào chọn được (đang tải, lỗi tải, danh sách rỗng, hoặc mọi agent
   * đã tắt) ⇒ nút Giao khoá: không có lần gửi nào có thể đúng.
   */
  const co_agent_chon_duoc = ds.some(chonDuoc);

  const [agent_id, datAgentId] = useState('');
  const [brief, datBrief] = useState<NhapBrief>({});
  const [mo_brief, datMoBrief] = useState(false);
  const [da_bam, datDaBam] = useState(false);

  const o_agent = useRef<HTMLSelectElement | null>(null);
  const khung = useRef<HTMLDivElement | null>(null);
  const mot = useMotLan();

  const [loi_lo, datLoiLo] = useState<string | null>(null);

  const giao = useMutation<KetQuaLuotGiao, Error, BienGiao>({
    // Đích CHỈ từ biến (BAT-29) — không đọc `ticket`/`nhieu` của closure. Cờ huỷ
    // kiểm TRƯỚC mọi `fetch` (BAT-34 việc 2) — một lần cho cả lượt.
    mutationFn: async (b) => {
      batDauLuot(b.co);
      const kq: KetQuaLuotGiao = { xong: [], loi: [] };
      for (const t of b.dich) {
        if (!b.nhieu) {
          // Một thẻ: lỗi NÉM (nhánh `onError` của BAT-33, hộp giữ nguyên).
          await giaoViec(t.id, b.than);
          kq.xong.push(t);
          continue;
        }
        try {
          await giaoViec(t.id, b.than);
          kq.xong.push(t);
        } catch (e) {
          kq.loi.push({ the: t, loi: e });
        }
      }
      return kq;
    },
    onSuccess: (kq, b) => {
      /*
       * `['ticket']` trùm chi tiết ticket (khối "Chuỗi lượt giao", người đang cầm,
       * trạng thái — và chi tiết ticket cha, nơi trạng thái con hiện) lẫn danh sách
       * / bảng (`['ticket','man-hinh',…]`). `['tong-quan']`: việc đang chạy, "Không
       * phản hồi". Trang agent của người nhận và Đội agent: lượt giao của agent.
       * `lamMoiTheoSo` (BAT-28/29): khoá đang bị S/P/L hay sửa lạc quan ghi thì hoãn.
       */
      if (kq.xong.length > 0) {
        void lamMoiTheoSo(qc, { queryKey: ['ticket'] });
        void lamMoiTheoSo(qc, { queryKey: ['tong-quan'] });
        void lamMoiTheoSo(qc, { queryKey: ['agent', b.than.nguoi_nhan_agent_id] });
        void lamMoiTheoSo(qc, { queryKey: ['doi-agent'] });
      }
      if (b.nhieu) daGiaoLo?.(kq.xong.map((t) => t.id));
      if (kq.loi.length > 0) {
        // BAT-35: một toast tóm tắt, câu máy chủ nguyên văn; hộp giữ mở (thẻ lỗi).
        const cau = tomTatLoiLo(
          b.dich.length,
          kq.loi.map((l) => ({ ma: l.the.ma, cau: cauLoi(l.loi) })),
        );
        toast.bao(cau);
        datLoiLo(cau);
        o_agent.current?.focus();
        return;
      }
      dong();
    },
    onError: (loi) => {
      // Huỷ vì đóng hộp lúc mất mạng: không phải lỗi máy chủ — toast huỷ đã báo lúc đóng.
      if (loi instanceof LoiHuyGui) return;
      // Câu của máy chủ NGUYÊN VĂN (d.418). Hộp giữ nguyên lựa chọn để gửi lại.
      toast.bao(cauLoi(loi));
      o_agent.current?.focus();
    },
  });
  const dang_gui = giao.isPending;
  /*
   * BAT-34 việc 2: lượt đang **tạm dừng vì mất mạng** thì Esc/Huỷ bật lại — đóng hộp
   * lúc đó là HUỶ GỬI (`huy-gui.ts`). Lượt đang bay thật thì vẫn khoá như cũ.
   *
   * `dong_duoc` chỉ để VẼ nút Huỷ; quyết định đóng thật nằm ở `huy()` qua
   * `huy_gui.huyNeuDangCho()` — đọc cờ lượt đồng bộ, vì `isPaused` render có thể cũ.
   */
  const dong_duoc = !dang_gui || (giao.isPaused && giao.failureCount === 0);
  const huy_gui = useHuyGuiKhiDong((c) => toast.bao(c, 'tin'), CAU_DA_HUY_GIAO);

  // Lúc gửi, nút vừa bấm bị khoá — giữ focus trong hộp (nếp `tao-viec.tsx`).
  useEffect(() => {
    if (!dang_gui) return;
    const h = khung.current;
    const dang = document.activeElement;
    if (h === null) return;
    const bi_khoa = dang instanceof HTMLButtonElement && dang.disabled;
    if (bi_khoa || dang === null || !h.contains(dang)) h.focus();
  }, [dang_gui]);

  // Phím có đích ngoài hộp không tới trang; `Esc` đóng; `Tab` vòng.
  useEffect(() => {
    const nghe = (e: KeyboardEvent): void => {
      const h = khung.current;
      if (h === null) return;
      chanPhimNgoaiHop(e, h, () => {
        huy_ref.current();
      });
    };
    window.addEventListener('keydown', nghe, { capture: true });
    return () => {
      window.removeEventListener('keydown', nghe, { capture: true });
    };
  }, [dong]);

  /*
   * Focus vào ô agent khi mở; đóng thì trả về phần tử đã mở hộp. `traFocus` chỉ là
   * dự phòng khi lúc mở focus đang ở `body` (phím `A` không có "nút" nào được bấm).
   */
  const tra_focus_ref = useRef(traFocus);
  tra_focus_ref.current = traFocus;
  useEffect(() => {
    const dang = document.activeElement;
    const truoc = dang instanceof HTMLElement && dang !== document.body ? dang : null;
    o_agent.current?.focus();
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
      const dich = truoc !== null && truoc.isConnected ? truoc : (tra_focus_ref.current?.() ?? null);
      dich?.focus();
    };
    // Chỉ lúc mở/đóng hộp.
  }, []);

  const thieu_agent = da_bam && agent_id === '';

  const gui = (e: React.FormEvent): void => {
    e.preventDefault();
    datDaBam(true);
    if (agent_id === '') {
      o_agent.current?.focus();
      return;
    }
    if (dich_hien.length === 0) return;
    // Đích chụp NGAY lúc bấm, vào biến — xem đầu file. Cờ huỷ mới cho lượt này.
    const bien: BienGiao = {
      dich: [...dich_hien],
      nhieu: la_nhieu,
      than: thanGiaoViec(agent_id, brief),
      co: taoCoLuot(),
    };
    mot((tha) => {
      huy_gui.ghi(bien.co);
      giao.mutate(bien, {
        onSettled: () => {
          huy_gui.xong(bien.co);
          tha();
        },
      });
    });
  };

  const huy = (): void => {
    // Lượt đã bay (kể cả khi `isPaused` của lần render trước còn `true`) ⇒ không đóng.
    if (!huy_gui.huyNeuDangCho()) return;
    dong();
  };
  const huy_ref = useRef(huy);
  huy_ref.current = huy;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-[10vh]">
      <button
        type="button"
        aria-label={NHAN_DONG_HOP_GIAO_NGOAI}
        tabIndex={-1}
        onClick={huy}
        className="absolute inset-0 bg-lop-phu"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="giao-viec-tieu-de"
        data-o="hop-giao-viec"
        data-ma={la_nhieu ? undefined : ticket?.ma}
        data-so-the={la_nhieu ? dich_hien.length : undefined}
        ref={khung}
        tabIndex={-1}
        onKeyDown={(e) => {
          // Không phím nào trong hộp được lọt ra listener của trang (J/K/S/Esc…).
          e.stopPropagation();
          if (e.key === 'Escape') {
            if (dangSoanIme(e.nativeEvent)) return;
            e.preventDefault();
            huy();
          }
        }}
        // Không tắt outline: khung nhận focus khi bị khoá ⇒ vòng `:focus-visible`
        // chung hiện khi dùng bàn phím (THIET-KE "Bàn phím trước", BAT-67).
        className="relative z-10 w-full max-w-lg rounded border border-vien bg-nen-lop p-4 text-chu shadow-lg"
      >
        <h2 id="giao-viec-tieu-de" className={`mb-3 ${LOP_TIEU_DE_MUC}`}>
          {la_nhieu ? (
            nhanGiaoNhieu(dich_hien.length)
          ) : (
            <>
              {NHAN_HOP_GIAO_VIEC} <span className="font-mono text-sm font-normal">{ticket?.ma}</span>
            </>
          )}
        </h2>
        {la_nhieu ? (
          <p data-o="the-giao" className="mb-3 font-mono text-xs text-neutral-600">
            {dich_hien.map((t) => t.ma).join(', ')}
          </p>
        ) : null}
        <form noValidate onSubmit={gui} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-neutral-600">{NHAN_O_AGENT}</span>
              <select
                ref={o_agent}
                data-nhap="agent"
                value={agent_id}
                aria-invalid={thieu_agent}
                aria-describedby={thieu_agent ? 'giao-viec-loi-agent' : undefined}
                onChange={(e) => {
                  datAgentId(e.target.value);
                }}
                className={O_NHAP}
              >
                <option value="">{NHAN_CHUA_CHON_AGENT}</option>
                {/* d.404: chỉ TÊN agent (và vai trò) trên màn hình, không bao giờ id. */}
                {ds.map((a) => (
                  <option key={a.id} value={a.id} disabled={!chonDuoc(a)}>
                    {`${a.ten} · ${a.nhan_vai_tro}${chonDuoc(a) ? '' : ` (${NHAN_AGENT_DA_TAT})`}`}
                  </option>
                ))}
              </select>
            </label>
            {thieu_agent ? (
              <span id="giao-viec-loi-agent" data-loi="agent" className="text-xs text-loi">
                {CAU_THIEU_AGENT}
              </span>
            ) : null}
            {agent_q.data === undefined && agent_q.isPending ? (
              <span data-o="agent-dang-tai" className="text-xs text-neutral-600">
                {CAU_DANG_TAI_AGENT}
              </span>
            ) : null}
            {agent_q.data === undefined && agent_q.isError ? (
              <span data-loi="agent-tai" className="text-xs text-loi">
                {cauLoi(agent_q.error)}
              </span>
            ) : null}
            {agent_q.data !== undefined && ds.length === 0 ? (
              <span data-o="agent-rong" className="text-xs text-neutral-600">
                {CAU_KHONG_CO_AGENT}
              </span>
            ) : null}
            {ds.length > 0 && !co_agent_chon_duoc ? (
              <span data-o="agent-rong" className="text-xs text-neutral-600">
                {CAU_KHONG_CO_AGENT_BAT}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-nut="mo-brief-luot"
              aria-expanded={mo_brief}
              onClick={() => {
                datMoBrief((v) => !v);
              }}
              className="self-start text-xs text-neutral-600 underline"
            >
              {NHAN_SUA_BRIEF}
            </button>
            {mo_brief ? (
              <div data-o="brief-luot" className="flex flex-col gap-2">
                {MUC_BRIEF.map((m) => (
                  <label key={m} className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-neutral-600">{NHAN_BRIEF[m]}</span>
                    <textarea
                      data-nhap-brief={m}
                      rows={2}
                      value={brief[m] ?? ''}
                      placeholder={GOI_Y_BRIEF}
                      onChange={(e) => {
                        const v = e.target.value;
                        datBrief((cu) => ({ ...cu, [m]: v }));
                      }}
                      className={O_NHAP}
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {giao.error === null || giao.error instanceof LoiHuyGui ? null : (
            <p data-loi="may-chu" className="text-sm text-loi">
              {cauLoi(giao.error)}
            </p>
          )}
          {loi_lo === null || dang_gui ? null : (
            <p data-loi="lo" className="text-sm text-loi">
              {loi_lo}
            </p>
          )}

          <div aria-live="polite">
            {giao.isPaused ? (
              <p role="status" data-o="cho-mang" className="text-sm text-neutral-600">
                {giao.failureCount > 0 ? CAU_CHO_MANG_DA_THU : CAU_CHO_MANG}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              data-nut="huy-giao"
              disabled={!dong_duoc}
              onClick={huy}
              className="rounded border border-vien px-3 py-1 text-sm text-chu hover:bg-nen-noi disabled:text-neutral-500"
            >
              {NHAN_NUT_HUY_GIAO}
            </button>
            <button
              type="submit"
              data-nut="gui-giao"
              disabled={dang_gui || !co_agent_chon_duoc}
              className={`rounded px-3 py-1 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
            >
              {dang_gui ? NHAN_NUT_DANG_GIAO : NHAN_NUT_GUI_GIAO}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
