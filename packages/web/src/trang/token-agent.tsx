/**
 * **Nút "Tạo lại token" và "Thu hồi token"** của trang agent — SPEC mục 3 d.83:
 * "Có nút tạo lại token (token cũ hết hiệu lực ngay) và nút thu hồi."
 *
 * API đã có từ phần 1 (`POST /v1/agent/:id/token`, `POST /v1/agent/:id/token/thu-hoi`);
 * file này chỉ là hai nút, một hộp xác nhận và một hộp hiện token mới.
 *
 * ## Token thô sống ở đâu — và chỉ ở đó
 *
 * Token mới là thứ duy nhất trên cả giao diện không được lưu lại: mục 3 d.83 (hiện
 * **một lần duy nhất**, server chỉ lưu băm). Mục 15 Bảo mật (d.424–430) không có
 * câu riêng cho token agent — d.427 nói token GitHub/Telegram "không bao giờ trả
 * ra API hay UI"; ở đây áp cùng tinh thần. Nên:
 *
 *   * gọi `taoLaiToken` **thẳng** trong trình xử lý nút, **không** qua
 *     `useMutation`: một mutation giữ `data` trong `MutationCache` cho tới hết
 *     `gcTime` (mặc định 5 phút) kể cả sau `reset()` của observer — tức token nằm
 *     trong bộ nhớ của `QueryClient` lâu hơn hộp. Gọi thẳng thì không có bản nào
 *     ngoài `useState` của hộp;
 *   * không `setQueryData` với thân trả về; sau thành công chỉ `invalidate` để
 *     máy chủ trả lại `token_bon_cuoi` mới qua đường đọc thường (không mang token);
 *   * không `localStorage` / `sessionStorage` / `console.*`;
 *   * đóng hộp ⇒ state về `null` **và** hộp tháo khỏi cây.
 *
 * `test/doi-agent.test.tsx` ghim cả bốn vế bằng cách duyệt chính cache và kho.
 *
 * ## Hộp
 *
 * Cùng khuôn với hộp `?` (`vo/phim-vo.tsx`) và hộp tạo việc: `aria-modal`, focus
 * vào hộp khi mở và **trả về nút đã bấm** khi đóng, `Esc` đóng (trừ lúc IME), Tab
 * vòng trong hộp, phím ngoài hộp không tới trang. Một hộp duy nhất đi qua hai pha
 * (xác nhận → token) để focus trả về đúng nút ban đầu.
 *
 * Lúc **đang gọi** máy chủ, hộp **không đóng được** (Esc, Huỷ, nền đều bị chặn):
 * đóng giữa chừng một lượt tạo lại là token cũ đã chết mà token mới không ai thấy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cauLoi, taoLaiToken, thuHoiToken, type AgentDong } from '../api';
import { chanPhimNgoaiHop, dangSoanIme } from '../vo/tao-viec';
import {
  LOP_CAU_LOI,
  LOP_CHIP_LOI,
  LOP_TAM_NOI,
  LOP_TIEU_DE_MUC,
  NUT_CHINH,
  NUT_MO_KHI_DISABLED,
  NUT_PHU,
} from '../vo/lop-nut';
import { useToast } from '../vo/toast';
import { lamMoiTheoSo } from '../ghi-lac-quan';

export const NHAN_TAO_LAI_TOKEN = 'Tạo lại token';
export const NHAN_THU_HOI_TOKEN = 'Thu hồi token';
export const NHAN_XAC_NHAN_TAO_LAI = 'Xác nhận tạo lại';
export const NHAN_XAC_NHAN_THU_HOI = 'Xác nhận thu hồi';
export const NHAN_HUY_TOKEN = 'Huỷ';
export const NHAN_SAO_CHEP_TOKEN = 'Sao chép';
export const NHAN_DONG_HOP_TOKEN = 'Đóng';
export const NHAN_DONG_HOP_TOKEN_NGOAI = 'Đóng hộp token';
export const NHAN_TOKEN_DA_THU_HOI = 'Token đã thu hồi';

export const CAU_DA_SAO_CHEP = 'Đã sao chép token.';
export const CAU_KHONG_SAO_CHEP_DUOC =
  'Không sao chép được tự động. Hãy bôi đen token ở trên và chép tay.';
export const CAU_DONG_LA_MAT =
  'Token chỉ hiện MỘT lần. Đóng hộp này là mất — sao chép và đặt vào agent ngay.';

export const cauHoiTaoLai = (ten: string): string =>
  `Token hiện tại của ${ten} sẽ hết hiệu lực ngay. Agent đang chạy bằng token đó sẽ bị máy chủ từ chối cho tới khi được đặt token mới.`;
export const cauHoiThuHoi = (ten: string): string =>
  `Token hiện tại của ${ten} sẽ hết hiệu lực ngay. Agent đang chạy bằng token đó sẽ bị máy chủ từ chối. ${ten} không có token nào cho tới khi bạn tạo lại.`;
export const cauDaThuHoi = (ten: string): string => `Đã thu hồi token của ${ten}.`;

type Viec = 'tao_lai' | 'thu_hoi';

/**
 * Hai nút của một agent. `onDaDoi` không có — trang tự đọc lại qua `invalidate`
 * hai khoá `['agent', id]` (trang agent) và `['doi-agent']` (danh sách).
 */
export function NutToken({ agent }: { agent: AgentDong }): React.JSX.Element {
  const [mo, datMo] = useState<Viec | null>(null);
  /*
   * "Đã thu hồi" ⇒ nút thu hồi **khoá**, không ẩn: một nút biến mất làm chủ
   * tưởng trang lỗi; một nút mờ kèm chữ "Token đã thu hồi" nói đúng trạng thái.
   * (Máy chủ vẫn nhận thu hồi lần hai — vô hại — nhưng gửi nó là một hộp xác
   * nhận nói "token sẽ hết hiệu lực" về một token đã chết: câu sai.)
   */
  const da_thu_hoi = agent.token_thu_hoi_luc !== null;
  const dong = useCallback(() => {
    datMo(null);
  }, []);

  return (
    <div data-o="nut-token" className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        data-nut="tao-lai-token"
        onClick={() => {
          datMo('tao_lai');
        }}
        className={`rounded px-2 py-1 ${NUT_PHU}`}
      >
        {NHAN_TAO_LAI_TOKEN}
      </button>
      <button
        type="button"
        data-nut="thu-hoi-token"
        disabled={da_thu_hoi}
        onClick={() => {
          datMo('thu_hoi');
        }}
        className={`rounded px-2 py-1 ${NUT_PHU} ${NUT_MO_KHI_DISABLED}`}
      >
        {NHAN_THU_HOI_TOKEN}
      </button>
      {da_thu_hoi ? (
        // Nhãn trạng thái: chip lỗi `LOP_CHIP_LOI` (cùng dáng chip agent "Đã tắt"), không chữ `loi` trần.
        <span data-o="token-da-thu-hoi" className={LOP_CHIP_LOI}>
          {NHAN_TOKEN_DA_THU_HOI}
        </span>
      ) : null}
      {mo === null ? null : <HopToken agent={agent} viec={mo} dong={dong} />}
    </div>
  );
}

type TrangThaiSao = 'chua' | 'da' | 'loi';

function HopToken({
  agent,
  viec,
  dong,
}: {
  agent: AgentDong;
  viec: Viec;
  dong: () => void;
}): React.JSX.Element {
  const qc = useQueryClient();
  const { bao } = useToast();
  const khung = useRef<HTMLDivElement | null>(null);
  const nut_huy = useRef<HTMLButtonElement | null>(null);
  const nut_sao = useRef<HTMLButtonElement | null>(null);
  const [dang_chay, datDangChay] = useState(false);
  const dang_chay_ref = useRef(false);
  /** Token thô — **chỉ** ở đây. Xem đầu file. */
  const [token, datToken] = useState<string | null>(null);
  const [sao, datSao] = useState<TrangThaiSao>('chua');

  const dongHop = useCallback(() => {
    if (dang_chay_ref.current) return;
    datToken(null);
    dong();
  }, [dong]);

  useEffect(() => {
    const nghe = (e: KeyboardEvent): void => {
      const h = khung.current;
      if (h !== null) chanPhimNgoaiHop(e, h, dongHop);
    };
    window.addEventListener('keydown', nghe, { capture: true });
    return () => {
      window.removeEventListener('keydown', nghe, { capture: true });
    };
  }, [dongHop]);

  useEffect(() => {
    const truoc = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus vào "Huỷ": thao tác này làm agent đang chạy bị từ chối, Enter vô ý
    // không được là "xác nhận".
    nut_huy.current?.focus();
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
      if (truoc !== null && truoc.isConnected) truoc.focus();
    };
  }, []);

  /*
   * Sang pha token, nút "Huỷ" đang giữ focus biến mất — focus rơi về `body`. Đưa
   * nó vào nút "Sao chép": việc kế tiếp của chủ, và giữ focus trong hộp.
   */
  const co_token = token !== null;
  useEffect(() => {
    if (co_token) nut_sao.current?.focus();
  }, [co_token]);

  const lamMoi = (): void => {
    void lamMoiTheoSo(qc, { queryKey: ['agent', agent.id] });
    void lamMoiTheoSo(qc, { queryKey: ['doi-agent'] });
  };

  const xacNhan = async (): Promise<void> => {
    if (dang_chay_ref.current) return;
    dang_chay_ref.current = true;
    datDangChay(true);
    try {
      if (viec === 'tao_lai') {
        const kq = await taoLaiToken(agent.id);
        datToken(kq.token);
      } else {
        await thuHoiToken(agent.id);
        bao(cauDaThuHoi(agent.ten), 'tin');
        dong();
      }
    } catch (loi) {
      // Câu của máy chủ nguyên văn (mục 13 d.379); không hộp token, không đổi gì.
      bao(cauLoi(loi), 'loi');
      dong();
    } finally {
      dang_chay_ref.current = false;
      datDangChay(false);
      /*
       * Làm mới **cả khi lỗi**: mạng đứt lúc máy chủ trả lời thì máy chủ có thể
       * đã đổi token — đọc lại là cách duy nhất để `••••` trên trang nói đúng.
       */
      lamMoi();
    }
  };

  const saoChep = async (): Promise<void> => {
    if (token === null) return;
    /*
     * `navigator.clipboard` không có ở mọi môi trường (http không bảo mật,
     * jsdom) và có thể bị trình duyệt từ chối — cả hai ca báo cho chủ biết để
     * chép tay, không ném.
     */
    const cb: Clipboard | undefined = navigator.clipboard;
    try {
      if (cb === undefined) throw new Error('không có clipboard');
      await cb.writeText(token);
      datSao('da');
    } catch {
      datSao('loi');
    }
  };

  const tieu_de = viec === 'tao_lai' ? NHAN_TAO_LAI_TOKEN : NHAN_THU_HOI_TOKEN;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-[10vh]">
      <button
        type="button"
        aria-label={NHAN_DONG_HOP_TOKEN_NGOAI}
        tabIndex={-1}
        onClick={() => {
          // Bấm nền ở pha token **không** đóng: một cú trượt chuột là mất token.
          if (token === null) dongHop();
        }}
        /*
         * Lớp phủ `bg-lop-phu` — quy ước chung của MỌI hộp nổi (THIET-KE "Hộp
         * nổi"; token từ BAT-69): đen 50% ở cả hai chế độ, nên làm tối trang ở cả
         * tối lẫn sáng; `neutral-950` thì đảo thành gần trắng ở chế độ tối.
         */
        className="absolute inset-0 bg-lop-phu"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hop-token-tieu-de"
        data-o="hop-token"
        data-viec={viec}
        ref={khung}
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            if (dangSoanIme(e.nativeEvent)) return;
            e.preventDefault();
            dongHop();
          }
        }}
        // Không tắt outline (THIET-KE "Bàn phím trước", BAT-67): vòng focus chung.
        className={`relative z-10 flex w-full max-w-md flex-col gap-3 p-4 ${LOP_TAM_NOI}`}
      >
        <h2 id="hop-token-tieu-de" className={LOP_TIEU_DE_MUC}>
          {tieu_de} — {agent.ten}
        </h2>

        {token === null ? (
          <>
            <p data-o="cau-hoi-token" className="text-sm">
              {viec === 'tao_lai' ? cauHoiTaoLai(agent.ten) : cauHoiThuHoi(agent.ten)}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-nut="xac-nhan-token"
                disabled={dang_chay}
                onClick={() => {
                  void xacNhan();
                }}
                className={`rounded px-3 py-1.5 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
              >
                {viec === 'tao_lai' ? NHAN_XAC_NHAN_TAO_LAI : NHAN_XAC_NHAN_THU_HOI}
              </button>
              <button
                type="button"
                ref={nut_huy}
                disabled={dang_chay}
                onClick={dongHop}
                className={`rounded px-3 py-1.5 text-sm ${NUT_PHU} ${NUT_MO_KHI_DISABLED}`}
              >
                {NHAN_HUY_TOKEN}
              </button>
            </div>
          </>
        ) : (
          <>
            <p data-o="dong-la-mat" className={`font-medium ${LOP_CAU_LOI}`}>
              {CAU_DONG_LA_MAT}
            </p>
            {/*
             * BAT-68: ô token là token ngữ nghĩa — nền lớp hover `nen-noi` (một
             * nấc trên tấm `nen-lop` của hộp) + viền mờ + chữ chính `chu`, thay
             * thang tương phản `neutral-100/900`. Hai chế độ đều qua lưới tương
             * phản (`chu` trên `nen-noi`). `break-all`: token liền không tràn hộp.
             */}
            <code
              data-o="token-moi"
              className="block rounded border border-vien bg-nen-noi p-2 font-mono text-xs break-all text-chu select-all"
            >
              {token}
            </code>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                ref={nut_sao}
                data-nut="sao-chep-token"
                onClick={() => {
                  void saoChep();
                }}
                className={`rounded px-3 py-1.5 text-sm ${NUT_PHU}`}
              >
                {NHAN_SAO_CHEP_TOKEN}
              </button>
              <button
                type="button"
                data-nut="dong-hop-token"
                onClick={dongHop}
                className={`rounded px-3 py-1.5 text-sm ${NUT_CHINH}`}
              >
                {NHAN_DONG_HOP_TOKEN}
              </button>
            </div>
            {sao === 'chua' ? null : (
              <p
                role={sao === 'loi' ? 'alert' : 'status'}
                data-o="ket-qua-sao-chep"
                className={sao === 'loi' ? LOP_CAU_LOI : 'text-sm text-chu'}
              >
                {sao === 'loi' ? CAU_KHONG_SAO_CHEP_DUOC : CAU_DA_SAO_CHEP}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
