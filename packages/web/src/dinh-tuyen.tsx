/**
 * **Định tuyến** — một đường cho mỗi trang của SPEC mục 14.
 *
 * | Đường | Trang | SPEC |
 * |---|---|---|
 * | `/` | Tổng quan (trang mặc định) | 11 d.315–321 |
 * | `/can-chu` | Cần Chủ | 8, 14 d.391 |
 * | `/bao-cao` | Báo cáo (sáng, handoff tối, xem lại theo ngày) | 11 d.323–337 |
 * | `/nhat-ky` | Nhật ký quyết định | 10 |
 * | `/ban-do-du-an` | Bản đồ dự án — **không có mục sidebar**, vào từ một dự án | 9, 14 d.398 |
 * | `/doi-agent` | Đội agent | 3 |
 * | `/cai-dat` | Cài đặt — nút "Xuất dữ liệu (JSON)" (BAT-8); phần còn lại giữ chỗ | 12 (tắt từng loại thông báo), 15 |
 * | `/ticket` | **"Tất cả việc"** — danh sách ticket mọi dự án, kiểu Bảng | 14 d.392, d.397 |
 * | `/du-an/:ma` | Danh sách ticket của một dự án | 14 d.395 |
 * | `/du-an/:id/ho-so` | Hồ sơ một dự án (mục, Lỗi đã gặp, lịch sử bản) | 9 d.294–303 |
 * | `/t/:ma` | **Chi tiết ticket — d.398 chốt đúng dạng này** | 14 d.398–401 |
 * | `/agent/:id` | Trang một agent (phiên, lịch sử lượt giao, quyền) | 3 d.104 |
 * | `/phien/:id` | Chi tiết phiên (dòng hoạt động, kế hoạch, nút Dừng) | 14 d.402 |
 *
 * Trừ `/t/<MÃ>`, **SPEC không chốt một đường nào** — xem `cau-hoi-spec.md` #101.
 *
 * `/t/:ma` nhận **mã** (`BAT-12`), không id: d.398 viết `/t/<MÃ>`, và mã là thứ
 * chủ đọc được, gõ lại được, dán vào Telegram được (mục 12: "mỗi tin có link
 * thẳng tới đúng thẻ hoặc ticket").
 */

import { lazy, Suspense } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { TrangCanChu } from './trang/can-chu';
import { TrangChiTietTicket } from './trang/chi-tiet-ticket';
import { TrangDanhSachTicket } from './trang/danh-sach-ticket';
import { TrangGiuCho } from './trang/giu-cho';
import { TrangTongQuan } from './trang/tong-quan';
import { LOP_CAU_CHO, LOP_TIEU_DE_TRANG, LOP_VUNG_TRANG } from './vo/lop-nut';
import { DUONG_BAN_DO, MUC_CHINH, MUC_CUOI } from './vo/muc-sidebar';

/*
 * **Tách chunk (BAT-26).** Trang ít dùng nạp theo nhu cầu (`React.lazy`) để chunk
 * đầu dưới ngưỡng cảnh báo 500 kB của Vite. **Không** lazy: Tổng quan, Cần Chủ,
 * danh sách và chi tiết ticket — trang chủ dùng nhiều, lazy chỉ thêm một nhịp chờ.
 * Các trang lazy dùng chung `doi-agent`/`ban-do` nên Rollup gom phần chung vào một
 * chunk dùng chung, không chép nhiều lần.
 */
const TrangBanDo = lazy(() => import('./trang/ban-do').then((m) => ({ default: m.TrangBanDo })));
const TrangBaoCao = lazy(() => import('./trang/bao-cao').then((m) => ({ default: m.TrangBaoCao })));
const TrangHoSoDuAn = lazy(() =>
  import('./trang/ho-so-du-an').then((m) => ({ default: m.TrangHoSoDuAn })),
);
const TrangCaiDat = lazy(() => import('./trang/cai-dat').then((m) => ({ default: m.TrangCaiDat })));
const TrangAgent = lazy(() => import('./trang/doi-agent').then((m) => ({ default: m.TrangAgent })));
const TrangDoiAgent = lazy(() =>
  import('./trang/doi-agent').then((m) => ({ default: m.TrangDoiAgent })),
);
const TrangNhatKy = lazy(() => import('./trang/nhat-ky').then((m) => ({ default: m.TrangNhatKy })));
const TrangChiTietPhien = lazy(() =>
  import('./trang/phien').then((m) => ({ default: m.TrangPhien })),
);

/** Dòng chờ khi một trang lazy đang nạp — nằm trong khung (sidebar vẫn hiện), không phải màn hình chờ toàn trang (d.419). */
export const CAU_DANG_TAI_TRANG = 'Đang tải trang…';

/** Mục SPEC của từng đường có mục sidebar — khớp theo `duong`. */
const MUC_SPEC: Record<string, string> = {
  '/': 'SPEC mục 11 d.315–321',
  '/can-chu': 'SPEC mục 8',
  '/bao-cao': 'SPEC mục 11 d.323–337',
  '/nhat-ky': 'SPEC mục 10',
  '/ticket': 'SPEC mục 14 d.395–397',
  '/doi-agent': 'SPEC mục 3',
  '/cai-dat': 'SPEC mục 12, 15',
};

export function DinhTuyen(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className={LOP_VUNG_TRANG}>
          <p role="status" className={LOP_CAU_CHO}>
            {CAU_DANG_TAI_TRANG}
          </p>
        </div>
      }
    >
      <Routes>
        {/*
         * Bảy đường của sidebar sinh **từ cùng một sổ tra** mà sidebar đọc. Gõ lại
         * `'/bao-cao'` ở đây là mở đường cho một mục sidebar trỏ vào một đường
         * không có route — tức một cú bấm ra trang "Không có trang này".
         */}
        {[...MUC_CHINH, MUC_CUOI].map((m) => (
          <Route
            key={m.duong}
            path={m.duong}
            element={
              /*
               * `/` có nội dung thật từ lượt 3 (Tổng quan, d.315–320), `/can-chu`
               * từ lượt 4 (mục 8 d.248–275), và `/bao-cao` từ **phần 7 việc B**
               * (mục 11 d.322–336); `/cai-dat` từ BAT-8 có nút xuất dữ liệu (mục 15
               * d.429), phần còn lại của nó vẫn là dòng giữ chỗ.
               * Rẽ **ở đây**, trong cùng vòng lặp, để danh sách
               * đường vẫn sinh từ một sổ tra duy nhất — khai một
               * `<Route path="/">` riêng phía trên là mở lại đúng cái lỗ "mục
               * sidebar trỏ vào một đường không có route".
               */
              m.duong === '/' ? (
                <TrangTongQuan />
              ) : m.duong === '/bao-cao' ? (
                <TrangBaoCao />
              ) : m.duong === '/can-chu' ? (
                <TrangCanChu />
              ) : m.duong === '/doi-agent' ? (
                <TrangDoiAgent />
              ) : m.duong === '/nhat-ky' ? (
                <TrangNhatKy />
              ) : m.duong === '/ticket' ? (
                // d.397 — "Tất cả việc": danh sách ticket **mọi dự án**, mở ở kiểu
                // Bảng (mặc định của `kieuXemTuUrl`).
                <TrangDanhSachTicket />
              ) : m.duong === '/cai-dat' ? (
                // BAT-8 — nút "Xuất dữ liệu (JSON)" của mục 15 d.429. Phần còn lại
                // của Cài đặt vẫn là dòng giữ chỗ **bên trong** trang này.
                <TrangCaiDat />
              ) : (
                <TrangGiuCho ten={m.nhan} muc={MUC_SPEC[m.duong] ?? 'SPEC mục 14'} />
              )
            }
          />
        ))}

        {/*
         * **`/ban-do-du-an` có Route RIÊNG từ đợt 3** — d.398: "Bản đồ dự án không
         * có mục riêng ở sidebar; **trang vẫn còn** và vào từ một dự án." Nó rời
         * `MUC_CHINH` (sổ tra của sidebar) nên nó cũng rời vòng lặp ở trên, và một
         * trang còn sống mà không còn route là đúng cái lỗ mà vòng lặp ấy tồn tại
         * để bịt — nên nó được khai thẳng ở đây, cạnh các đường không có mục
         * sidebar. Đường vào: mục con của mỗi dự án trong sidebar.
         */}
        <Route path={DUONG_BAN_DO} element={<TrangBanDo />} />
        {/*
         * `/du-an/:id/ho-so` — mục 9 d.294. Ba đoạn, nên nó **không** đua với
         * `/du-an/:ma` (hai đoạn); và tham số là **id** dự án, không mã, vì
         * `GET /v1/du-an/:id/ho-so` tra theo id. Xem đầu `trang/ho-so-du-an.tsx`.
         */}
        <Route path="/du-an/:id/ho-so" element={<TrangHoSo />} />
        <Route path="/du-an/:ma" element={<TrangDuAn />} />
        <Route path="/t/:ma" element={<TrangTicket />} />
        <Route path="/agent/:id" element={<TrangMotAgent />} />
        <Route path="/phien/:id" element={<TrangPhien />} />
        <Route path="*" element={<KhongCoTrang />} />
      </Routes>
    </Suspense>
  );
}

/** `/du-an/:ma` — cùng trang danh sách, lọc sẵn theo **dự án của đường** (d.395). */
function TrangDuAn(): React.JSX.Element {
  const { ma } = useParams();
  return <TrangDanhSachTicket ma_du_an={ma} />;
}

/**
 * `/t/:ma` — d.398. Thiếu mã thì **không** gọi máy chủ: `/t/` không khớp route
 * này trong thực tế, nhưng một `ma === undefined` lọt qua sẽ thành một lượt gọi
 * `/v1/man-hinh-ticket/ma/undefined`, tức một 404 đội lốt lỗi dữ liệu.
 */
function TrangTicket(): React.JSX.Element {
  const { ma } = useParams();
  if (ma === undefined || ma === '') {
    return <TrangGiuCho ten="Chi tiết ticket" muc="SPEC mục 14 d.398–401" phu="Thiếu mã ticket." />;
  }
  return <TrangChiTietTicket ma={ma} />;
}

/**
 * `/agent/:id` — trang một agent (mục 3 d.104).
 *
 * Thiếu id thì **không** gọi máy chủ, cùng lý lẽ `TrangTicket`: một
 * `id === undefined` lọt qua sẽ thành `/v1/man-hinh-agent/undefined`, tức một 404
 * đội lốt lỗi dữ liệu.
 */
function TrangMotAgent(): React.JSX.Element {
  const { id } = useParams();
  if (id === undefined || id === '') {
    return <TrangGiuCho ten="Trang agent" muc="SPEC mục 3 d.104" phu="Thiếu id agent." />;
  }
  return <TrangAgent id={id} />;
}

/**
 * `/du-an/:id/ho-so` — mục 9. Thiếu id thì **không** gọi máy chủ, cùng lý lẽ
 * `TrangTicket`: một `id === undefined` lọt qua sẽ thành
 * `/v1/du-an/undefined/ho-so`, tức một 404 đội lốt lỗi dữ liệu.
 */
function TrangHoSo(): React.JSX.Element {
  const { id } = useParams();
  if (id === undefined || id === '') {
    return <TrangGiuCho ten="Hồ sơ dự án" muc="SPEC mục 9 d.294–303" phu="Thiếu id dự án." />;
  }
  return <TrangHoSoDuAn id={id} />;
}

function TrangPhien(): React.JSX.Element {
  const { id } = useParams();
  if (id === undefined || id === '') {
    return <TrangGiuCho ten="Chi tiết phiên" muc="SPEC mục 14 d.402" phu="Thiếu id phiên." />;
  }
  return <TrangChiTietPhien id={id} />;
}

export const CAU_KHONG_CO_TRANG = 'Không có trang này.';

function KhongCoTrang(): React.JSX.Element {
  return (
    <section className={LOP_VUNG_TRANG}>
      <h1 className={LOP_TIEU_DE_TRANG}>{CAU_KHONG_CO_TRANG}</h1>
    </section>
  );
}
