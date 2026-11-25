/**
 * Worker API của Baton (Hono).
 *
 * Lượt 2 của phần 1: xác thực token agent (SPEC mục 3, 13, 15), **bảng quyền**
 * (mục 3), dự án (mục 2), agent và token (mục 3), và danh sách phân trang keyset
 * theo mốc 200.000 ticket.
 *
 * Quy ước chung của mọi đường:
 *   * Lệnh **GHI** đi qua cửa ghi `WorkspaceGate` (`goiLenh`). Không có đường
 *     nào ghi thẳng D1.
 *   * Lệnh **ĐỌC** đi thẳng D1 (`doc-du-an.ts`).
 *   * Lỗi ra đúng dạng `{ error, message }` + mã HTTP của SPEC mục 13.
 */

import { Hono, type Context } from 'hono';
import {
  BANG_LOI,
  BANG_MA,
  BANG_QUYEN_MAC_DINH,
  BatonError,
  PHAM_VI_QUYEN,
  VIEC_QUYEN,
  bangQuyenCuaAgent,
  cookiePhienChu,
  cookieXoaPhienChu,
  kiemMucCanChu,
  nhan,
  type NoiDungBangChung,
} from '@baton/shared';
import { choDuongTest, type Env } from './moi-truong.js';
import {
  chayCronBangChung,
  viecCuaCron,
  type KetQuaCronBangChung,
} from './cron-bang-chung.js';
import { chayCronCanhBao, type KetQuaQuetCanhBao } from './cron-canh-bao-phien.js';
import { chayCronThongBao, type KetQuaCronThongBao } from './cron-thong-bao.js';
import { chayCronBaoCao, type KetQuaCronBaoCao } from './cron-bao-cao.js';
import { chayCronSaoLuu, lietKeSaoLuu, taiSaoLuu, type KetQuaCronSaoLuu } from './sao-luu.js';
import { tenFileXuat, xuatDuLieu } from './xuat-du-lieu.js';
import { docCaiDatThongBao } from './cai-dat-thong-bao.js';
import { layBaoCao, layTrongTamSong, lietKeBaoCao } from './doc-bao-cao.js';
import { batLoi, khongTimThay, xuLyLoi } from './middleware-loi.js';
import { loaiBangChungDeLog } from './nhat-ky-loi.js';
import {
  DUONG_KHOI_TAO,
  workspaceDuyNhat,
  xacThuc,
  type MoiTruongHono,
} from './xac-thuc.js';
import { khoiTao, thanKhoiTao } from './khoi-tao.js';
import {
  goiChoCanChu,
  goiChoViec,
  goiDangNhapChu,
  goiDangXuatChu,
  goiGhiXacMinh,
  goiLenh,
  goiDatLaiTotpChu,
  goiDoiMatKhauChu,
  goiMoKhoaChu,
  goiThietLapChu,
} from './workspace-gate.js';
import { lietKePhienChu } from './chu-dang-nhap.js';
import { chamPhienChuTheoNhip } from './cham-phien-chu.js';
import { assetDungDuong, laDuongApi, phucVuSpa } from './phuc-vu-spa.js';
import { bangDaXuLy, khoiCho, layMucCanChu, manHinhCanChu } from './doc-can-chu.js';
import { nguonXacMinhCua, xacMinhTrongHan } from './xac-minh-bang-chung.js';
import { datTuyenNoiBo } from './tuyen-noi-bo.js';
import {
  CHO_DAI_TOI_DA_GIAY,
  aiKeoViecTu,
  msChoDai,
  viecCuaToi,
} from './doc-viec.js';
import type { BanDoLenh, LoaiLenh } from './lenh.js';
import {
  docCaiDatWorkspace,
  layAgent,
  layDuAnChiTiet,
  lichSuCaiDatWorkspace,
  lichSuDuAn,
  lietKeAgent,
  lietKeDuAn,
} from './doc-du-an.js';
import { tongQuan } from './doc-tong-quan.js';
import { manHinhDanhSachTicket, manHinhTicket } from './doc-man-hinh-ticket.js';
import { manHinhAgent, manHinhDoiAgent, manHinhPhien } from './doc-man-hinh-agent.js';
import { manHinhNhatKy } from './doc-man-hinh-nhat-ky.js';
import { layHoSo, layLuatChung, manHinhBanDo } from './doc-ho-so.js';
import {
  binhLuanCuaTicket,
  layTicket,
  layTicketTheoMa,
  lichSuTicket,
  lietKeTicket,
  luotGiaoCuaTicketTrongPhamVi,
  type YeuCauLietKeTicket,
} from './doc-ticket.js';
import {
  cauHoiChoTraLoi,
  hoatDongCuaPhien,
  keHoachCuaPhien,
  phienCuaLuot,
  phienCuaTicket,
  phienTheoId,
  raPhien,
} from './doc-phien.js';
import { layNhatKy, lietKeNhatKy } from './doc-nhat-ky.js';
import { timNhanh } from './doc-tim.js';

export { WorkspaceGate } from './workspace-gate.js';
export { GioiHanToken } from './gioi-han-token.js';
export type { Env } from './moi-truong.js';

const app = new Hono<MoiTruongHono>();

app.use('*', batLoi);
app.onError(xuLyLoi);
app.notFound(khongTimThay);

/**
 * **Cổng xác thực của mọi đường** (SPEC mục 13).
 *
 * Gắn cho `*`, không phải cho `/v1/*` ở giữa file: `xacThuc` tự bỏ qua danh sách
 * đóng `DUONG_CONG_KHAI` (xem `xac-thuc.ts`). Nhờ vậy "đường này công khai" là
 * một dòng phải viết ra, không còn là **hệ quả của thứ tự khai route** — trước
 * đây thêm một route phía trên dòng `app.use` là mở một đường không cần token mà
 * diff không cho ai thấy.
 */
app.use('*', xacThuc);
/** Lần dùng cuối của phiên cookie, ghi theo nhịp 1 giờ — xem `cham-phien-chu.ts` (BAT-11). */
app.use('*', chamPhienChuTheoNhip);

/* ------------------------------------------------------------------ *
 * Đường công khai (có trong `DUONG_CONG_KHAI`)
 * ------------------------------------------------------------------ */

/** Kiểm tra sống. Không cần token. */
app.get('/v1/health', (c) => c.json({ ok: true }));

/**
 * Bảng mã máy ↔ nhãn tiếng Việt (SPEC mục 0.1), bảng mã lỗi (mục 13) và **bảng
 * quyền mặc định theo vai trò** (mục 3). Web và CLI lấy ở đây để không phải chép
 * lại bảng — chép là cách chắc chắn nhất để hai bên lệch nhau.
 */
app.get('/v1/meta', (c) =>
  c.json({
    ma: BANG_MA,
    loi: Object.fromEntries(
      Object.entries(BANG_LOI).map(([ma, dn]) => [ma, { http: dn.http, message: dn.message }]),
    ),
    quyen: {
      viec: VIEC_QUYEN,
      pham_vi: PHAM_VI_QUYEN,
      mac_dinh_theo_vai_tro: BANG_QUYEN_MAC_DINH,
    },
  }),
);

/**
 * Đường tạm để kiểm chứng middleware lỗi: trả đúng mã lỗi được yêu cầu.
 *
 * **Chặn bằng cờ môi trường** `CHO_DUONG_TEST`: chỉ Miniflare lúc chạy test mới
 * bật. Deploy thật không đặt cờ, nên đường này là 404 như mọi đường không có —
 * không để một đường sinh lỗi tuỳ ý mở ra ngoài (góp ý của reviewer lượt 1).
 */
app.get('/v1/_loi/:ma', (c) => {
  if (!choDuongTest(c.env)) throw new BatonError('NOT_FOUND');
  const ma = c.req.param('ma');
  if (!(ma in BANG_LOI)) throw new BatonError('NOT_FOUND');
  throw new BatonError(ma as keyof typeof BANG_LOI, { retryAfter: 60 });
});

/**
 * **Đăng nhập của chủ** — SPEC mục 15 d.415: "mật khẩu cộng mã TOTP (2 lớp)…
 * phiên đăng nhập 30 ngày".
 *
 * Công khai (có trong `DUONG_CONG_KHAI`) vì nó là đường *dựng ra* giấy tờ. Hai
 * yếu tố trong **một** request — xem `dangNhapChu` cho lý lẽ, và
 * `spec-questions.md` cho chỗ SPEC không nói một bước hay hai.
 *
 * Phản hồi **không mang id phiên trong thân**: nó chỉ đi vào cookie `HttpOnly`.
 * Trả nó trong JSON là đưa một thứ tương đương mật khẩu vào chỗ mà JavaScript
 * của trang đọc được — tức bỏ đúng cái `HttpOnly` vừa đặt.
 */
app.post('/v1/dang-nhap', async (c) => {
  const b = await than(c);
  const workspace_id = await workspaceDuyNhat(c.env.DB);
  const kq = await goiDangNhapChu(c.env, {
    workspace_id,
    mat_khau: b['mat_khau'],
    ma_totp: b['ma_totp'],
    ua: c.req.header('user-agent'),
  });
  c.header('set-cookie', cookiePhienChu(kq.id_phien));
  return c.json({ dang_nhap: true, het_luc: kq.het_luc });
});

/* ------------------------------------------------------------------ *
 * Từ đây trở xuống: phải có token — cổng ở `app.use('*')` phía trên lo,
 * **không** phụ thuộc thứ tự khai route.
 * ------------------------------------------------------------------ */

/**
 * **Thiết lập tài khoản chủ lần đầu** — `spec-questions.md` #3.
 *
 * Canh bằng **`TOKEN_CHU`** và chỉ `TOKEN_CHU`: `wrangler` bị chặn trong môi
 * trường này nên chủ không `wrangler secret put` được một băm mật khẩu, và một
 * trang công khai "đặt mật khẩu chủ" thì ai tới trước đặt trước. `TOKEN_CHU` rỗng
 * = **không đường nào vào** (fail-closed, nếp của phần 1).
 *
 * Vì sao kiểm `qua_token_chu` chứ không chỉ `ai.loai === 'chu'`: từ lượt này một
 * **cookie phiên** cũng dựng ra `{ loai: 'chu' }`, nên điều kiện kia sẽ cho một
 * phiên web đi vào đường thiết lập — và đường đó, nếu đã có tài khoản, là nơi
 * duy nhất đặt lại mật khẩu **không cần mật khẩu cũ**.
 *
 * Trả `otpauth://…` **đúng một lần** (nó mang secret TOTP). Gọi lần hai khi đã
 * có tài khoản → `FORBIDDEN`; cả hai vế có ca test.
 *
 * **Khai thẳng: lớp `qua_token_chu` là phòng thủ tầng hai, KHÔNG có test** — đo
 * bằng đột biến ở lượt này: đổi nó thành `ai.loai !== 'chu'` thì **không ca nào
 * đỏ**. Lý do là một tính chất của lược đồ, không phải thiếu test:
 * `chu_phien.workspace_id` trỏ tới `chu_tai_khoan(workspace_id)` và D1 ép khoá
 * ngoài, nên "có cookie hợp lệ" kéo theo "tài khoản đã có", và câu chặn "đã
 * thiết lập" bên trong `thietLapChu` đã bắt mọi ca quan sát được. Giữ lại vì nó
 * là thứ duy nhất còn đúng nếu một lượt sau nới khoá ngoài đó hoặc mở một đường
 * ghi khác vào `chu_phien`. Xem ca `khoá ngoài: KHÔNG chèn được phiên…` trong
 * `test/dang-nhap-chu.test.ts`, nơi tính chất này được ghim.
 */
app.post('/v1/chu/thiet-lap', async (c) => {
  if (c.get('qua_token_chu') !== true) {
    throw new BatonError('FORBIDDEN', {
      message: 'Thiết lập tài khoản chủ chỉ đi qua token chủ của máy chủ.',
    });
  }
  const b = await than(c);
  return c.json(
    await goiThietLapChu(c.env, {
      workspace_id: c.get('workspace_id'),
      mat_khau: typeof b['mat_khau'] === 'string' ? b['mat_khau'] : '',
      ten: typeof b['ten'] === 'string' ? b['ten'] : undefined,
    }),
    201,
  );
});

/**
 * **Khởi tạo lần đầu** — một lượt gọi từ DB **rỗng ngay sau migration** tới
 * trạng thái dùng được: workspace, tài khoản chủ (mật khẩu + TOTP), dự án, agent
 * kèm token. Lý lẽ đầy đủ (gồm lỗi chặn deploy mà nó sửa) ở `khoi-tao.ts`.
 *
 * Canh bằng **`TOKEN_CHU` và chỉ `TOKEN_CHU`** — cùng cờ `qua_token_chu`, cùng lý
 * lẽ với `/v1/chu/thiet-lap` và `/v1/chu/mo-khoa`; `TOKEN_CHU` rỗng = không đường
 * nào vào (fail-closed).
 *
 * **Chạy lại được**: lần hai không tạo trùng, không đổi mật khẩu đang dùng, và
 * **không** cấp lại `otpauth` hay token nào (`null` kèm `ghi_chu`) — SPEC mục 15
 * d.417, có ca test quét cả thân phản hồi.
 *
 * `200` chứ không `201`: lượt thứ hai không tạo ra gì cả, nên một mã "đã tạo"
 * cứng trong route sẽ nói sai đúng ở ca mà lệnh này được thiết kế để chịu được.
 */
app.post(DUONG_KHOI_TAO, async (c) => {
  if (c.get('qua_token_chu') !== true) {
    throw new BatonError('FORBIDDEN', {
      message: 'Khởi tạo lần đầu chỉ đi qua token chủ của máy chủ.',
    });
  }
  return c.json(await khoiTao(c.env, thanKhoiTao(await than(c)), Date.now()));
});

/**
 * **Mở khoá tài khoản chủ** — đường thoát khi hạn mức chống dò khoá chủ ra ngoài.
 *
 * Hạn mức của `spec-questions.md` #98 khoá theo **tài khoản**, và `/v1/dang-nhap`
 * là đường công khai không qua bộ đếm 600 req/phút. Nên một kẻ **không biết mật
 * khẩu** lặp mãi một mật khẩu sai giữ được tài khoản trong trạng thái khoá vô
 * hạn: chủ không bao giờ vào được nữa. Đường này là cửa thoát.
 *
 * Canh bằng **`TOKEN_CHU`** và chỉ `TOKEN_CHU` — cùng lý lẽ, cùng cờ
 * `qua_token_chu` với `/v1/chu/thiet-lap`; `TOKEN_CHU` rỗng = không đường nào vào.
 * Một **cookie phiên** không vào được, và không phải vì dè dặt: ai còn phiên thì
 * không bị khoá ra ngoài, nên nhánh đó không cứu ai mà chỉ thêm bề mặt.
 *
 * **Không gỡ một yếu tố nào của d.415**: nó chỉ đặt `so_lan_sai` về 0 và bỏ
 * `khoa_den_luc`; mật khẩu và mã TOTP vẫn phải đúng ở lần đăng nhập tiếp theo.
 */
app.post('/v1/chu/mo-khoa', async (c) => {
  if (c.get('qua_token_chu') !== true) {
    throw new BatonError('FORBIDDEN', {
      message: 'Mở khoá tài khoản chủ chỉ đi qua token chủ của máy chủ.',
    });
  }
  return c.json(await goiMoKhoaChu(c.env, { workspace_id: c.get('workspace_id') }));
});

/**
 * **Đặt lại TOTP của chủ** — đường cứu khi mất ứng dụng xác thực. Lý lẽ đầy đủ
 * (gồm vì sao đường "xoá dòng tài khoản rồi khởi tạo lại" KHÔNG chạy được) ở
 * `datLaiTotpChu` trong `chu-dang-nhap.ts`.
 *
 * Canh bằng **`TOKEN_CHU`** và chỉ `TOKEN_CHU` — cùng cờ `qua_token_chu`, cùng lý
 * lẽ với `/v1/chu/thiet-lap` và `/v1/chu/mo-khoa`. Nó **giữ nguyên mật khẩu**,
 * nên nắm `TOKEN_CHU` mà không biết mật khẩu thì vẫn không vào được — đó là điều
 * làm nó khác một đường đặt lại mật khẩu.
 *
 * Trả `otpauth://…` **đúng một lần** (nó mang secret TOTP mới), và **đá mọi phiên
 * web đang mở**.
 */
app.post('/v1/chu/dat-lai-totp', async (c) => {
  if (c.get('qua_token_chu') !== true) {
    throw new BatonError('FORBIDDEN', {
      message: 'Đặt lại TOTP của chủ chỉ đi qua token chủ của máy chủ.',
    });
  }
  const b = await than(c);
  return c.json(
    await goiDatLaiTotpChu(c.env, {
      workspace_id: c.get('workspace_id'),
      ten: typeof b['ten'] === 'string' ? b['ten'] : undefined,
      // Chỉ để rút nhãn thiết bị cho dòng Nhật ký (BAT-16); không lưu UA thô, không IP.
      ua: c.req.header('user-agent'),
    }),
  );
});

/**
 * **Phiên hiện tại còn sống không** — cho giao diện biết có phải vẽ trang đăng
 * nhập hay không.
 *
 * Nếu middleware xác thực đã cho request này vào thì câu trả lời là "còn"; phiên
 * hết hạn, đã huỷ, hay băm không có trong bảng đều đã thành **401** ở đó. Nên ở
 * đây không có phép kiểm thứ hai nào — hai chỗ kiểm cùng một luật là hai chỗ để
 * lệch.
 *
 * **Không trả** băm mật khẩu, muối, số vòng hay secret TOTP (nếp d.417) — và
 * không trả cả id phiên. Thân là đúng những gì màn hình cần: ai, workspace nào,
 * phiên hết lúc nào. Có ca test quét toàn thân, dựng sao cho các bí mật đó **nằm
 * trong** thứ sắp trả nếu lưới chắn hỏng.
 */
app.get('/v1/toi', (c) => {
  const ai = c.get('ai');
  const workspace_id = c.get('workspace_id');
  if (ai.loai !== 'chu') {
    /*
     * **d.416: agent không đăng nhập web.** Một token agent gọi đường này không
     * được nhận một thân "đã đăng nhập" nào — kể cả một thân rỗng, vì phần 6 sẽ
     * đọc nó là "có phiên". `baton whoami` là đường của agent.
     */
    throw new BatonError('FORBIDDEN', {
      message: 'Agent không đăng nhập web; dùng token và /v1/whoami.',
    });
  }
  /*
   * Hạn của phiên cookie hiện tại; `null` khi vào bằng `TOKEN_CHU` (không có
   * phiên). BAT-17: đọc phiên mà **middleware đã xác thực** (`phien_chu`), không
   * đọc lại cookie trong header. BAT-18: `het_luc` do chính lượt tra của
   * middleware mang theo (phiên không trượt hạn) nên không tra `chu_phien` lần hai.
   */
  const het_luc = c.get('phien_chu')?.het_luc ?? null;
  return c.json({ loai: 'chu', workspace_id, phien_het_luc: het_luc });
});

/** **Đăng xuất** phiên hiện tại — SPEC mục 15 d.415. */
app.post('/v1/dang-xuat', async (c) => c.json(await xuLyDangXuat(c, false)));

/**
 * **Đăng xuất mọi nơi** — d.415 ("có nút đăng xuất mọi nơi").
 *
 * Đường riêng, không một cờ trong thân của `/v1/dang-xuat`: đây là hai việc khác
 * hẳn nhau về hệ quả (một máy, hay mọi máy kể cả máy đang dùng), và một cờ trong
 * JSON là chỗ để một lần gõ sai cắt mọi phiên của chủ.
 */
app.post('/v1/dang-xuat-moi-noi', async (c) => c.json(await xuLyDangXuat(c, true)));

async function xuLyDangXuat(
  c: Context<MoiTruongHono>,
  moi_noi: boolean,
): Promise<Record<string, unknown>> {
  const ai = c.get('ai');
  if (ai.loai !== 'chu') {
    // d.416 — xem `/v1/toi`.
    throw new BatonError('FORBIDDEN', { message: 'Agent không đăng nhập web.' });
  }
  /*
   * BAT-17: phiên hiện tại và **nguồn** lấy từ **cách middleware đã xác thực
   * request này** — không từ việc header có cookie. Trình duyệt có thể còn giữ
   * một cookie chết (hoặc cookie hết hạn mức nhịp) trong khi request vào bằng
   * `TOKEN_CHU`: đọc thẳng cookie thì Nhật ký ghi "qua phiên" cho một lệnh của
   * token máy chủ, và nhánh một-phiên lại đi huỷ dòng của một cookie mà không
   * ai đã kiểm. `phien_chu` chỉ có khi nhánh cookie của `xacThuc` cho vào.
   */
  const kq = await goiDangXuatChu(c.env, {
    workspace_id: c.get('workspace_id'),
    bam: c.get('phien_chu')?.bam ?? null,
    qua_token_chu: c.get('qua_token_chu') === true,
    moi_noi,
    ua: c.req.header('user-agent'),
  });
  // Cookie bị xoá ở **cả hai** đường, kể cả khi không huỷ dòng nào: trình duyệt
  // không được giữ lại một cookie mà máy chủ vừa nói là hết hiệu lực.
  c.header('set-cookie', cookieXoaPhienChu());
  return { da_dang_xuat: true, moi_noi, ...kq };
}

/**
 * **Các phiên đăng nhập đang mở của chủ** — BAT-11, trang Cài đặt (mục 15 d.425).
 *
 * Chỉ phiên **còn sống**. Mỗi phiên: mốc tạo, hạn, lần dùng cuối (ghi theo nhịp
 * 1 giờ — `cham-phien-chu.ts`), nhãn thiết bị, và cờ `hien_tai`. **Không** `bam`,
 * không id nào (d.427) — xem `PhienChuRa`.
 *
 * Chủ vào bằng cookie hoặc `TOKEN_CHU` (đường đọc, cùng nếp `/v1/toi`); vào bằng
 * `TOKEN_CHU` thì không phiên nào là `hien_tai`. Agent → `FORBIDDEN` (d.426).
 */
app.get('/v1/chu/phien-dang-nhap', async (c) => {
  if (c.get('ai').loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: 'Agent không đăng nhập web.' });
  }
  const bay_gio = Date.now();
  const items = await lietKePhienChu(
    c.env.DB,
    c.get('workspace_id'),
    c.get('phien_chu')?.bam ?? null,
    bay_gio,
  );
  // `bay_gio` của máy chủ để giao diện đếm "x phút trước" từ cùng đồng hồ (nếp Tổng quan).
  return c.json({ bay_gio, items });
});

/**
 * **Đổi mật khẩu của chủ** — BAT-11. Thân `{ mat_khau_cu, ma_totp, mat_khau_moi }`.
 *
 * **Chỉ nhận chủ qua cookie phiên** (`phien_chu` do nhánh cookie của `xacThuc`
 * đặt). `TOKEN_CHU` không cookie → `FORBIDDEN`, agent → `FORBIDDEN`. Manager chốt
 * hai lý do: (1) đường này phải biết **phiên hiện tại** để giữ nó lại khi huỷ mọi
 * phiên khác — `TOKEN_CHU` không có phiên nào; (2) `TOKEN_CHU` đã có đường cứu
 * riêng (`/v1/chu/mo-khoa`, `/v1/chu/dat-lai-totp`), và cho nó vào đây là mở
 * thêm một đường đổi yếu tố "cái mình biết" từ một token của máy chủ.
 *
 * Hai lớp, hạn mức, thứ tự kiểm và batch ghi — xem `doiMatKhauChu`. Thân phản
 * hồi chỉ có số phiên khác vừa bị huỷ và mốc đổi; không vọng lại mật khẩu nào.
 */
app.post('/v1/chu/doi-mat-khau', async (c) => {
  const phien = c.get('phien_chu');
  if (c.get('ai').loai !== 'chu' || phien === undefined) {
    throw new BatonError('FORBIDDEN', {
      message: 'Đổi mật khẩu chỉ làm được từ một phiên đăng nhập web của chủ.',
    });
  }
  const b = await than(c);
  return c.json(
    await goiDoiMatKhauChu(c.env, {
      workspace_id: c.get('workspace_id'),
      bam_hien_tai: phien.bam,
      mat_khau_cu: b['mat_khau_cu'],
      ma_totp: b['ma_totp'],
      mat_khau_moi: b['mat_khau_moi'],
      ua: c.req.header('user-agent'),
    }),
  );
});

/**
 * `baton whoami` — SPEC mục 13 ("In agent là ai, vai trò, dự án được vào").
 * Kèm **bảng quyền hiện hành** của chính agent đó (mặc định vai trò + ô chủ đã
 * chỉnh), để agent biết mình được làm gì mà không phải thử rồi ăn `FORBIDDEN`.
 */
app.get('/v1/whoami', (c) => {
  const ai = c.get('ai');
  if (ai.loai === 'chu') {
    return c.json({ loai: 'chu', workspace_id: c.get('workspace_id') });
  }
  return c.json({
    loai: 'agent',
    workspace_id: c.get('workspace_id'),
    agent_id: ai.agent_id,
    vai_tro: ai.vai_tro,
    nhan_vai_tro: nhan('vai_tro_agent', ai.vai_tro),
    vao_tat_ca_du_an: ai.vao_tat_ca_du_an,
    du_an_duoc_vao: ai.du_an_duoc_vao,
    du_an_minh_quan_ly: ai.du_an_minh_quan_ly,
    quyen: bangQuyenCuaAgent(ai),
  });
});

/* ------------------------------------------------------------------ *
 * Dự án — SPEC mục 2
 * ------------------------------------------------------------------ */

/** Thân JSON của request; không phải object → `INVALID_INPUT`. */
async function than(c: Context<MoiTruongHono>): Promise<Record<string, unknown>> {
  let gia_tri: unknown;
  try {
    gia_tri = await c.req.json();
  } catch {
    throw new BatonError('INVALID_INPUT', { message: 'Thân request phải là JSON.' });
  }
  if (typeof gia_tri !== 'object' || gia_tri === null || Array.isArray(gia_tri)) {
    throw new BatonError('INVALID_INPUT', { message: 'Thân request phải là một object JSON.' });
  }
  return gia_tri as Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Dựng lệnh ghi từ thân request — CÓ WHITELIST
 * ------------------------------------------------------------------ */

/**
 * Trường nào của mỗi lệnh được **client gửi lên**.
 *
 * Phần còn lại của lệnh (`loai`, `workspace_id`, `ai`) do server dựng, và những
 * trường server tự tra (vd `project_id` lấy từ đường dẫn) được truyền riêng.
 *
 * Vì sao phải có bảng này thay vì spread cả thân request: spread nghĩa là **mọi**
 * trường client gửi đều đi thẳng vào lệnh của cửa ghi. Lượt trước làm vậy và tạo
 * ra một lỗ leo quyền thật — client gửi `{"ticket_cua_luot_minh": true}` là tự
 * khai mình thoả ô phạm vi của bảng quyền SPEC mục 3, nên một agent `worker` sửa
 * được **mọi** ticket trong dự án nó được vào.
 *
 * Kiểu `Exclude<keyof …, 'loai' | 'workspace_id' | 'ai'>[]` làm chuyện này khó
 * sai về sau: tên trường không có trong kiểu lệnh là **lỗi biên dịch**, và ba
 * trường của server thì không khai vào đây được. Cùng với việc các cờ phạm vi
 * quyền **không nằm trong kiểu lệnh nào cả** (xem `phamViLuotGiao`), không có
 * đường nào để client chạm tới chúng.
 */
type TruongClient<K extends LoaiLenh> = readonly Exclude<
  keyof BanDoLenh[K]['lenh'],
  'loai' | 'workspace_id' | 'ai'
>[];

export const TRUONG_CLIENT: { [K in LoaiLenh]: TruongClient<K> } = {
  tao_du_an: ['ten', 'ma', 'mo_ta', 'mau', 'nhom', 'quan_ly_agent_id', 'khong_code', 'bat_buoc_review'],

  /*
   * Hồ sơ dự án — mục 9. `project_id` **có** trong danh sách vì route là nơi
   * ghi đè nó (`{ ...than(c), project_id: c.req.param('id') }`) **sau** khi lọc
   * — y như `sua_du_an`. Bỏ nó khỏi danh sách thì whitelist vứt luôn giá trị
   * route vừa đặt và handler nhận `undefined`; giá trị trong thân request
   * không ăn, vì route ghi đè sau.
   */
  sua_ho_so_du_an: [
    'project_id',
    'la_gi',
    'thu_muc',
    'repo_chu_so_huu',
    'repo_ten',
    'repo_nhanh_mac_dinh',
    'stack',
    'doc_truoc',
    'cach_deploy',
    'danh_sach_cam',
  ],
  them_loi_da_gap: ['project_id', 'loi', 'cach_tranh'],
  sua_luat_chung: ['danh_sach_cam', 'checklist'],
  // `ma` nằm trong danh sách để handler **từ chối tường minh** "mã không đổi
  // được sau khi tạo" (SPEC mục 2), thay vì âm thầm bỏ qua rồi báo thành công.
  sua_du_an: [
    'project_id',
    'ten',
    'mo_ta',
    'mau',
    'nhom',
    'trang_thai',
    'quan_ly_agent_id',
    'khong_code',
    'bat_buoc_review',
    // Ngưỡng đứng **theo dự án** — SPEC mục 6 dòng 189 (5–1440 phút, `null` = bỏ).
    'nguong_dung_phut',
    // Bốn trường Bản đồ — SPEC 20.1 (chủ và `coordinator`; handler kiểm quyền).
    'uu_tien',
    'dang_day',
    'duy_tri',
    'ten_ngan',
    // Ô "Trạng thái bản đồ" — SPEC 20.8 (chủ, `coordinator`, `manager` của dự án).
    'trang_thai_ban_do',
    'ma',
  ],
  // Giới hạn WIP — SPEC 20.1, chỉ chủ (handler kiểm).
  sua_cai_dat_workspace: ['gioi_han_wip'],

  tao_agent: ['ten', 'vai_tro', 'model', 'mo_ta', 'du_an_duoc_vao', 'vao_tat_ca_du_an'],
  sua_agent: [
    'agent_id',
    'ten',
    'vai_tro',
    'model',
    'mo_ta',
    'disabled',
    'du_an_duoc_vao',
    'vao_tat_ca_du_an',
    // Ngưỡng đứng **theo agent** — SPEC mục 6 dòng 189.
    'nguong_dung_phut',
  ],
  tao_lai_token: ['agent_id'],
  thu_hoi_token: ['agent_id'],
  dat_quyen: ['agent_id', 'viec', 'cho_phep', 'pham_vi'],

  tao_ticket: [
    'project_id',
    'tieu_de',
    'mo_ta',
    'uu_tien',
    'ticket_cha_id',
    'nhan',
    'han_luc',
    'chiu_trach_nhiem_loai',
    'chiu_trach_nhiem_agent_id',
    // Trạng thái ban đầu: chỉ `todo`/`backlog` (mục 4 "Trạng thái khi tạo", T-108 = B,
    // BAT-63) — handler kiểm bằng `kiemTrangThaiKhiTao`, không phải whitelist.
    'trang_thai',
    // 8 trường brief — SPEC mục 4.
    'muc_tieu',
    'boi_canh',
    'pham_vi',
    'file_va_nguon',
    'dieu_cam',
    'xong_la_gi',
    'cach_kiem_chung',
    'nop_lai',
  ],
  doi_tieu_de: ['ticket_id', 'tieu_de'],
  sua_ticket: [
    'ticket_id',
    'tieu_de',
    'mo_ta',
    'uu_tien',
    'han_luc',
    'chiu_trach_nhiem_loai',
    'chiu_trach_nhiem_agent_id',
    'muc_tieu',
    'boi_canh',
    'pham_vi',
    'file_va_nguon',
    'dieu_cam',
    'xong_la_gi',
    'cach_kiem_chung',
    'nop_lai',
    // Cờ "ticket không code" (0027, T-31) — client gửi được, nhưng handler chỉ
    // nhận của **chủ** (agent ⇒ `FORBIDDEN`), không lọc im lặng ở đây.
    'khong_code',
    // Khối lớn và vị trí trên đồi — SPEC 20.1 (chủ, coordinator, manager của dự án).
    'khoi_lon',
    'doi',
  ],
  dat_nhan: ['ticket_id', 'nhan', 'gan'],
  noi_ticket: ['tu_ticket_id', 'den_ticket_id', 'loai_lien_ket'],
  xoa_ticket: ['ticket_id'],
  khoi_phuc_ticket: ['ticket_id'],
  cap_so_ticket: ['project_id'],
  cap_so_can_chu: [],

  // `ep` là cờ "chủ ép Xong" (SPEC mục 7). Nó **được** client gửi: ép là một
  // hành động của chủ, không phải một kết luận của server về phạm vi quyền. Luật
  // "chỉ chủ ép được" nằm trong module luật trạng thái, không ở whitelist.
  doi_trang_thai: ['ticket_id', 'trang_thai', 'ly_do', 'ticket_goc_id', 'ep'],
  chu_tu_lam: ['ticket_id', 'bat'],

  // `loai_luot` và `han_phan_hoi_phut` là dữ liệu của lệnh (SPEC mục 5: loại lượt,
  // "hạn phản hồi, mặc định 15 phút"), **không** phải kết luận của server về
  // phạm vi quyền — nên client gửi được. Các cờ phạm vi vẫn không nằm trong kiểu
  // lệnh nào, xem `phamViLuotGiao`.
  tao_luot_giao: [
    'ticket_id',
    'nguoi_nhan_agent_id',
    'loai_luot',
    'han_phan_hoi_phut',
    'muc_tieu',
    'boi_canh',
    'pham_vi',
    'file_va_nguon',
    'dieu_cam',
    'xong_la_gi',
    'cach_kiem_chung',
    'nop_lai',
  ],
  nhan_luot_giao: ['luot_giao_id'],

  // Báo cáo nộp (SPEC mục 5): `ket_qua` + 5 mục. Đây là **dữ liệu của báo cáo**,
  // client phải gửi được; không cờ phạm vi quyền nào nằm trong kiểu lệnh này.
  nop_bao_cao: [
    'luot_giao_id',
    'ket_qua',
    'da_lam',
    'kiem_chung',
    'nhanh_va_commit',
    'rui_ro',
    'viec_phat_sinh',
  ],
  nghiem_thu: ['luot_giao_id', 'ket_qua', 'ly_do'],
  huy_luot: ['luot_giao_id', 'ly_do'],
  tao_ticket_viec_phat_sinh: ['luot_giao_id', 'tieu_de'],

  // Phiên — SPEC mục 6, mục 13 (`baton heartbeat [ghi chú]`), mục 14 (nút Dừng).
  // `luot_giao_id` và `phien_id` tới từ đường dẫn, nên chỉ `ghi_chu` là của client.
  //
  // `heartbeat` giữ `luot_giao_id` trong danh sách **có chủ ý**: route gửi nó kèm
  // thân, nên nếu bỏ ra thì whitelist lọc mất chính khoá của lệnh.
  heartbeat: ['luot_giao_id', 'ghi_chu'],
  /*
   * `phien_id` **phải** ở đây dù nó tới từ đường dẫn: `locTruongClient` lọc **mọi**
   * trường, kể cả trường route tự gắn, nên bỏ nó ra là lệnh mất chính khoá của
   * mình (xem ghi chú "Trường nào được client gửi lên" ở trên — câu "những trường
   * server tự tra được truyền riêng" nói về *đường đi*, không về *bộ lọc*).
   * Không có lỗ quyền nào ở đây: client gửi `phien_id` khác cũng bị route ghi đè
   * sau (`{ ...than, phien_id: param }`), và handler vẫn kiểm chủ.
   */
  dung_phien: ['phien_id'],

  // Dòng hoạt động, kế hoạch, trả lời — SPEC mục 6 d.190, d.191, 19.6, 19.12 câu 2.
  gui_hoat_dong: [
    'phien_id',
    // Tên trường của **loại mục** là `loai_hoat_dong`, không `loai`: `loai` của
    // mọi lệnh ghi là **tên lệnh** (xem `LenhChung`). Route đổi tên giúp client
    // (thân gửi `loai`, như SPEC mục 6 gọi nó).
    'loai_hoat_dong',
    'noi_dung',
    'ten_thao_tac',
    'tham_so',
    'ket_qua_thao_tac',
    'tam_thoi',
  ],
  dat_ke_hoach: ['phien_id', 'buoc'],
  tra_loi_cau_hoi: ['luot_giao_id', 'noi_dung', 'hoat_dong_id'],

  /*
   * **Bằng chứng** — SPEC mục 7 d.204–211. Mọi trường ở đây là **nội dung bằng
   * chứng**, tức đúng thứ client phải gửi được; `kiemNoiDungBangChung` kiểm từng
   * trường theo loại.
   *
   * Những thứ **không** có trong danh sách và không bao giờ được thêm vào:
   * `xac_minh`, `ma_http`, `so_lan_thu`, `thu_lai_luc`, `theo_doi_den_luc`,
   * `gui_luc`. Chúng là **kết luận của server** — ai khai được `xac_minh` thì tự
   * khai được "commit của tôi đã merged", tức mở thẳng cổng Xong (d.206, d.214).
   * Đường duy nhất ghi chúng là `WorkspaceGate.ghiXacMinh`, không có route nào.
   */
  gui_bang_chung: [
    'ticket_id',
    'loai_bang_chung',
    'commit_hash',
    'repo',
    /*
     * `merged_cuc_bo` và `duong_dan_bao_cao` **là nội dung bằng chứng**, tức đúng
     * thứ client phải gửi được (migration 0022):
     *   * `merged_cuc_bo` — **lời khai** của người gửi ("CLI đã kiểm `git
     *     merge-base --is-ancestor` trong repo"). Nó **không** là kết luận: server
     *     vẫn hỏi GitHub trước, và chỉ dựa vào lời khai khi GitHub không biết
     *     commit đó. Cột `nguon_xac_minh` (kết luận của server) thì **không** có
     *     trong danh sách này và không bao giờ được thêm vào — xem khối trên.
     *   * `duong_dan_bao_cao` — đường dẫn báo cáo của reviewer độc lập, bắt buộc
     *     khi người gửi là `manager`.
     */
    'merged_cuc_bo',
    'duong_dan_bao_cao',
    'url',
    'ma_phien_ban',
    'ket_luan',
    'ghi_chu',
    'tom_tat',
    'dat',
    'duong_dan',
    'noi_dung',
  ],
  rut_bang_chung: ['bang_chung_id', 'ly_do'],

  /*
   * **Cần Chủ** — SPEC mục 8. Mọi trường ở đây là **nội dung mục**, tức đúng thứ
   * agent phải gửi được; `kiemNoiDungCanChu` của `@baton/shared` kiểm từng trường
   * theo loại.
   *
   * Những thứ **không** có trong danh sách và không bao giờ được thêm vào:
   * `ma_so`, `trang_thai`, `trung_voi_can_chu_id`. Cả ba là **kết luận của
   * server**: ai khai được `ma_so` thì ghi trùng `T-số` (mục 8 đòi số không tái
   * dùng), và ai khai được `trang_thai` thì tạo được một mục đã `resolved` — tức
   * tự quyết một mục Cần Chủ, đúng hàng "**không bao giờ**" của bảng quyền mục 3.
   *
   * `loai_can_chu` chứ không `loai`: `loai` của mọi lệnh ghi là **tên lệnh** (xem
   * `LenhChung`). Route đổi tên giúp client — thân gửi `loai`, như SPEC mục 8 gọi
   * nó. Cùng lý do, `lenh_chay` chứ không `lenh`.
   */
  tao_can_chu: [
    'tieu_de',
    'muc',
    'loai_can_chu',
    'project_id',
    'boi_canh',
    'han_luc',
    'ticket_lien_quan',
    'phuong_an',
    'ly_do_de_xuat',
    'lenh_chay',
    'can_tty',
    'file_hoac_link',
    'phien_lien_quan',
  ],

  /*
   * **Xử lý một mục Cần Chủ** — mục 8 d.243–246, 19.9. Ba lệnh, và cả ba chỉ
   * nhận đúng thứ chủ gõ trên thẻ (mục 8 d.258–262): nhãn phương án, ghi thêm,
   * Đạt/Cần sửa, lý do bỏ qua.
   *
   * Những thứ **không** có trong danh sách và không bao giờ được thêm vào:
   * `trang_thai`, `ket_qua`, `xu_ly_luc`, `phuong_an_da_chon_id`, `mo_lai_lan`.
   * Cả năm là **kết luận của server**. `ket_qua` là quan trọng nhất: nó đi
   * nguyên văn vào một dòng `nhat_ky` **không sửa, không xoá** (d.309), nên nó
   * phải do `kiemKetQuaXuLy` dựng từ nhãn phương án và mặc định của 19.9, không
   * do client đặt.
   */
  xu_ly_can_chu: ['can_chu_id', 'phuong_an', 'ghi_them', 'ket_luan', 'vi_sao'],
  bo_qua_can_chu: ['can_chu_id', 'ly_do', 'vi_sao'],
  mo_lai_can_chu: ['can_chu_id', 'vi_sao'],

  /*
   * **Nhật ký quyết định** — SPEC mục 10. Ba trường, đúng những gì d.308 gọi là
   * nội dung của dòng.
   *
   * Những thứ **không** có trong danh sách và không bao giờ được thêm vào:
   * `nguoi_loai`, `agent_id`, `luc`. Cả ba là **kết luận của server**. Cái đầu
   * tiên là quan trọng nhất: d.310 nói "riêng dòng **'chủ quyết'** chỉ sinh từ
   * Cần Chủ hoặc do chủ tự ghi", nên một agent khai được `nguoi_loai: 'chu'` là
   * một agent giả mạo được chữ ký của chủ trên một bảng **không sửa, không
   * xoá** (d.309) — tức một lời nói dối vĩnh viễn. Chúng cũng không nằm trong
   * kiểu `LenhGhiNhatKy`, nên đây là lớp thứ hai, không phải lớp duy nhất.
   */
  ghi_nhat_ky: ['quyet_dinh', 'vi_sao', 'project_id', 'can_cu'],

  /*
   * **3 việc trọng tâm hôm nay** — mục 11 d.324. Đúng **một** trường: cả bộ 3.
   *
   * Thứ **không** có trong danh sách và không bao giờ được thêm vào: `ngay` và
   * `agent_id`. Cả hai là **kết luận của server**. `ngay` là quan trọng nhất —
   * d.324 nói "trọng tâm **hôm nay**", nên ai khai được nó thì ghi lại được trọng
   * tâm của một ngày đã qua, tức sửa căn cứ của một handoff tối **đã gửi cho chủ**.
   * Chúng cũng không nằm trong kiểu `LenhGhiTrongTam`, nên đây là lớp thứ hai.
   */
  ghi_trong_tam: ['muc'],

  // Cài đặt thông báo — mục 12 d.348 (BAT-16). `cong_tac` tới từ đường dẫn và được
  // route ghi đè sau khi lọc (nếp `sua_du_an`), nên nó phải có trong danh sách.
  dat_cong_tac_thong_bao: ['cong_tac', 'bat'],

  them_binh_luan: ['ticket_id', 'noi_dung'],
  sua_binh_luan: ['comment_id', 'noi_dung'],
  xoa_binh_luan: ['comment_id'],
};

/**
 * Dựng một lệnh ghi: **chỉ chép những trường có trong whitelist**.
 *
 * Trường ngoài whitelist bị **loại bỏ**, không trả lỗi. Chọn loại bỏ vì:
 *   * Kiểu lệnh là hợp đồng duy nhất; trường lạ không tới được cửa ghi, nên
 *     quyết định quyền rơi về **mặc định an toàn** và ra `FORBIDDEN` đúng lý do
 *     nghiệp vụ, thay vì một `INVALID_INPUT` nói về trường nội bộ.
 *   * Trả lỗi kèm tên trường là một kênh **dò tên trường nội bộ** của server.
 *
 * `loai`, `workspace_id`, `ai` đặt sau cùng nên thân request không ghi đè được:
 * client không tự khai mình là chủ hay nhảy workspace khác.
 */
export function locTruongClient(
  loai: LoaiLenh,
  phan: Record<string, unknown>,
): { loc: Record<string, unknown>; bo_qua: string[] } {
  const cho_phep = TRUONG_CLIENT[loai] as readonly string[];
  const loc: Record<string, unknown> = {};
  const bo_qua: string[] = [];

  for (const truong of Object.keys(phan)) {
    if (cho_phep.includes(truong)) loc[truong] = phan[truong];
    else bo_qua.push(truong);
  }
  return { loc, bo_qua };
}

function lenhTu<K extends LoaiLenh>(
  c: Context<MoiTruongHono>,
  loai: K,
  phan: Record<string, unknown>,
): { lenh: BanDoLenh[K]['lenh']; bo_qua: string[] } {
  const { loc, bo_qua } = locTruongClient(loai, phan);
  return {
    lenh: {
      ...loc,
      loai,
      workspace_id: c.get('workspace_id'),
      ai: c.get('ai'),
    } as BanDoLenh[K]['lenh'],
    bo_qua,
  };
}

/**
 * Gọi một lệnh ghi và trả thân phản hồi.
 *
 * Phản hồi của lệnh **sửa** mang thêm `bo_qua`: tên những trường **client vừa
 * gửi** mà whitelist đã bỏ. Không có nó thì "sửa thành công một nửa" im lặng —
 * client gõ sai tên một trường và nhận `200 OK` với `da_doi: []` mà không hiểu
 * vì sao. `bo_qua` chỉ chứa tên do chính client gửi, nên **không lộ tên trường
 * nội bộ** nào của server (lý do whitelist loại bỏ thay vì báo lỗi).
 */
async function chayLenh<K extends LoaiLenh>(
  c: Context<MoiTruongHono>,
  loai: K,
  phan: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { lenh, bo_qua } = lenhTu(c, loai, phan);
  const ket_qua = (await goiLenh(c.env, lenh)) as Record<string, unknown>;
  return bo_qua.length === 0 ? ket_qua : { ...ket_qua, bo_qua };
}

app.get('/v1/du-an', async (c) => {
  const q = c.req.query();
  return c.json(
    await lietKeDuAn(c.env.DB, c.get('ai'), c.get('workspace_id'), {
      cursor: q['cursor'],
      limit: q['limit'],
      trang_thai: q['trang_thai'],
      // `?gom_luu_tru=co` để lấy cả dự án lưu trữ (mặc định ẩn — SPEC mục 2).
      gom_luu_tru: q['gom_luu_tru'] === 'co',
    }),
  );
});

app.get('/v1/du-an/:id', async (c) =>
  c.json(await layDuAnChiTiet(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'))),
);

/**
 * Lịch sử các trường Bản đồ (+ `nhom`) của một dự án — SPEC 20.1 ("ghi Lịch sử
 * như trường khác", mục 4). Phạm vi như `GET /v1/du-an/:id`: ngoài phạm vi ⇒ 404.
 */
app.get('/v1/du-an/:id/lich-su', async (c) => {
  const q = c.req.query();
  return c.json(
    await lichSuDuAn(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'), {
      cursor: q['cursor'],
      limit: q['limit'],
    }),
  );
});

/* ------------------------------------------------------------------ *
 * Tổng quan — SPEC mục 11 d.315–320
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/tong-quan` — **năm khối** của d.316–320 trong một lượt gọi.
 *
 * Một đường, không sáu: ba khối là **kết luận nghiệp vụ** (sức sống dự án mục 2
 * d.71–74, trạng thái agent mục 3 d.98–103, năm nguồn *Cần chú ý* d.319), nên
 * chúng phải sống ở một chỗ có test — không trong component. Lý lẽ đầy đủ ở đầu
 * `doc-tong-quan.ts`.
 *
 * **Chỉ chủ** — cổng nằm **trong** `tongQuan`, không ở route này: một đường HTTP
 * thứ hai trỏ vào cùng dữ liệu sẽ không vô tình mở cửa. Agent nhận
 * `FORBIDDEN`/403, cùng nếp `GET /v1/toi` (d.416).
 *
 * Lệnh **ĐỌC**: đi thẳng D1, không chạm cửa ghi, không nhích mốc nào (19.12 câu
 * 53) — và đặc biệt **không** bắn cảnh báo phiên đứng: việc đó là của Cron 5
 * phút (19.12 câu 46), xem khối ghi chú "KHÔNG có route quét cảnh báo phiên".
 */
app.get('/v1/tong-quan', async (c) =>
  c.json(await tongQuan(c.env.DB, c.get('ai'), c.get('workspace_id'), Date.now())),
);

/* ------------------------------------------------------------------ *
 * Xuất dữ liệu — SPEC mục 15 d.429 (BAT-8)
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/xuat` — **toàn bộ dữ liệu nghiệp vụ** của workspace ra một file JSON
 * (nút "Xuất dữ liệu (JSON)" ở trang Cài đặt, và `baton export <file>`).
 *
 * **Chỉ chủ** — cổng nằm **trong** `xuatDuLieu`, không ở route (nếp `tongQuan`).
 * Danh sách trắng bảng/cột và những gì **không bao giờ** ra file: `xuat-du-lieu.ts`.
 *
 * `content-disposition: attachment` để trình duyệt **tải về** chứ không mở; và
 * `cache-control: no-store` vì thân là dữ liệu điều phối của chủ — không một tầng
 * cache nào được giữ lại một bản.
 */
app.get('/v1/xuat', async (c) => {
  const bay_gio = Date.now();
  const ban = await xuatDuLieu(c.env.DB, c.get('ai'), c.get('workspace_id'), bay_gio);
  c.header('content-disposition', `attachment; filename="${tenFileXuat(bay_gio)}"`);
  c.header('cache-control', 'no-store');
  return c.json(ban);
});

/**
 * `GET /v1/sao-luu` và `GET /v1/sao-luu/:ngay` — liệt kê / tải bản sao lưu trên R2
 * (SPEC 19.12 câu 7, BAT-10). **Chỉ chủ**; cổng nằm trong `lietKeSaoLuu`/`taiSaoLuu`.
 * Không có lệnh CLI/MCP tương ứng — agent không có lý do gì dùng.
 */
app.get('/v1/sao-luu', async (c) => {
  const kq = await lietKeSaoLuu(c.env.SAO_LUU, c.get('ai'));
  c.header('cache-control', 'no-store');
  return c.json(kq);
});

app.get('/v1/sao-luu/:ngay', async (c) => {
  const { noi_dung, ten_file } = await taiSaoLuu(c.env.SAO_LUU, c.get('ai'), c.req.param('ngay'));
  c.header('content-disposition', `attachment; filename="${ten_file}"`);
  c.header('cache-control', 'no-store');
  c.header('content-type', 'application/json; charset=UTF-8');
  return c.body(noi_dung);
});

/* ------------------------------------------------------------------ *
 * Hồ sơ dự án, Luật chung, trang Bản đồ — SPEC mục 9 d.294–303
 * ------------------------------------------------------------------ */

/**
 * `baton profile <DỰ ÁN>` (mục 13 d.378) và trang hồ sơ của mục 9.
 *
 * **Agent đọc được** — d.294: "Agent mới vào dự án chỉ cần đọc trang này". Phạm
 * vi dự án nằm trong `layHoSo` (qua `layDuAn`), nên ngoài phạm vi → `NOT_FOUND`.
 */
app.get('/v1/du-an/:id/ho-so', async (c) =>
  c.json(
    await layHoSo(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'), Date.now()),
  ),
);

/** Sửa hồ sơ — d.296–298, và **chụp một phiên bản** (d.303). Chỉ chủ (#113a). */
app.patch('/v1/du-an/:id/ho-so', async (c) =>
  c.json(
    await chayLenh(c, 'sua_ho_so_du_an', {
      ...(await than(c)),
      project_id: c.req.param('id'),
    }),
  ),
);

/**
 * Thêm một mục **"Lỗi đã gặp"** — d.299, danh sách **chỉ thêm**.
 *
 * `POST`, và **không có** `PATCH` hay đường xoá nào cho nó: "chỉ thêm" là nội
 * dung của d.299, và nó được khoá ở trigger của migration 0018.
 */
app.post('/v1/du-an/:id/loi-da-gap', async (c) =>
  c.json(
    await chayLenh(c, 'them_loi_da_gap', {
      ...(await than(c)),
      project_id: c.req.param('id'),
    }),
    201,
  ),
);

/** Trang **Luật chung** của workspace — d.301. Agent đọc được, chỉ chủ ghi. */
/* ------------------------------------------------------------------ *
 * Cài đặt thông báo — SPEC mục 12 d.348 (BAT-16)
 * ------------------------------------------------------------------ */

/** Mọi công tắc + công tắc bảo mật (khoá). Chỉ chủ — agent `FORBIDDEN`. */
app.get('/v1/cai-dat/thong-bao', async (c) =>
  c.json(await docCaiDatThongBao(c.env.DB, c.get('ai'), c.get('workspace_id'))),
);

/**
 * Bật/tắt **một** công tắc: thân `{ bat: boolean }`. Chỉ chủ (agent `FORBIDDEN`);
 * cố tắt tin bảo mật → `FORBIDDEN`. "Tắt" = không gửi Telegram, tin vẫn vào chuông.
 */
app.put('/v1/cai-dat/thong-bao/:cong_tac', async (c) =>
  c.json(
    await chayLenh(c, 'dat_cong_tac_thong_bao', {
      ...(await than(c)),
      cong_tac: c.req.param('cong_tac'),
    }),
  ),
);

/* ------------------------------------------------------------------ *
 * Cài đặt workspace: giới hạn WIP — SPEC 20.1 (chỉ chủ)
 * ------------------------------------------------------------------ */

/** Giới hạn WIP + đồng hồ "Đang đẩy n/<giới hạn>". Chỉ chủ — agent `FORBIDDEN`. */
app.get('/v1/cai-dat/workspace', async (c) =>
  c.json(await docCaiDatWorkspace(c.env.DB, c.get('ai'), c.get('workspace_id'))),
);

/**
 * Lịch sử giới hạn WIP (dòng `project_history` có `project_id` NULL) — chỉ chủ,
 * agent ⇒ `FORBIDDEN`. Phân trang keyset như `/v1/du-an/:id/lich-su`.
 */
app.get('/v1/cai-dat/workspace/lich-su', async (c) => {
  const q = c.req.query();
  return c.json(
    await lichSuCaiDatWorkspace(c.env.DB, c.get('ai'), c.get('workspace_id'), {
      cursor: q['cursor'],
      limit: q['limit'],
    }),
  );
});

/** Thân `{ gioi_han_wip: 1–10 }`. Chỉ chủ; sai khoảng ⇒ `INVALID_INPUT` kèm khoảng. */
app.put('/v1/cai-dat/workspace', async (c) =>
  c.json(await chayLenh(c, 'sua_cai_dat_workspace', await than(c))),
);

app.get('/v1/luat-chung', async (c) => c.json(await layLuatChung(c.env.DB, c.get('workspace_id'))));

app.put('/v1/luat-chung', async (c) =>
  c.json(await chayLenh(c, 'sua_luat_chung', await than(c))),
);

/**
 * **Trang Bản đồ** — d.302, bảng mọi dự án cộng trang Luật chung, một lượt gọi.
 * Cổng "chỉ chủ" nằm **trong** `manHinhBanDo`, không ở route.
 */
app.get('/v1/man-hinh-ban-do', async (c) =>
  c.json(await manHinhBanDo(c.env.DB, c.get('ai'), c.get('workspace_id'), Date.now())),
);

app.post('/v1/du-an', async (c) => c.json(await chayLenh(c, 'tao_du_an', await than(c)), 201));

app.patch('/v1/du-an/:id', async (c) =>
  c.json(await chayLenh(c, 'sua_du_an', { ...(await than(c)), project_id: c.req.param('id') })),
);

/* ------------------------------------------------------------------ *
 * Agent, token, quyền — SPEC mục 3, 15
 * ------------------------------------------------------------------ */

app.get('/v1/agent', async (c) => {
  const q = c.req.query();
  return c.json(
    await lietKeAgent(c.env.DB, c.get('ai'), c.get('workspace_id'), {
      cursor: q['cursor'],
      limit: q['limit'],
    }),
  );
});

app.get('/v1/agent/:id', async (c) =>
  c.json(await layAgent(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'))),
);

/* ------------------------------------------------------------------ *
 * Màn hình Đội agent / trang agent / chi tiết phiên — mục 14 d.392, d.402
 * ------------------------------------------------------------------ *
 * Cùng dữ liệu với `/v1/agent*` và `/v1/phien/:id`, cộng ba thứ của **màn hình**:
 * mốc `bay_gio` cho chữ tương đối của d.412, các khối của d.104 trong **một** lượt
 * gọi, và cổng "chỉ chủ" (mục 14 là giao diện web của chủ). Cổng nằm **trong** các
 * hàm `manHinh*`, không ở route — nếp của `/v1/tong-quan` và `/v1/man-hinh-ticket`.
 *
 * Mốc đọc **trước** truy vấn: một mốc lấy sau khi đã đọc dữ liệu là một mốc muộn
 * hơn chính dữ liệu.
 */

app.get('/v1/man-hinh-agent', async (c) => {
  const q = c.req.query();
  return c.json(
    await manHinhDoiAgent(c.env.DB, c.get('ai'), c.get('workspace_id'), Date.now(), {
      cursor: q['cursor'],
      limit: q['limit'],
    }),
  );
});

app.get('/v1/man-hinh-agent/:id', async (c) =>
  c.json(
    await manHinhAgent(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'), Date.now()),
  ),
);

app.get('/v1/man-hinh-phien/:id', async (c) =>
  c.json(
    await manHinhPhien(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'), Date.now()),
  ),
);

/**
 * Tạo agent. Phản hồi mang **token thô — lần duy nhất** (SPEC mục 3).
 * Mọi đường khác chỉ trả `token_bon_cuoi`.
 */
app.post('/v1/agent', async (c) => c.json(await chayLenh(c, 'tao_agent', await than(c)), 201));

app.patch('/v1/agent/:id', async (c) =>
  c.json(await chayLenh(c, 'sua_agent', { ...(await than(c)), agent_id: c.req.param('id') })),
);

/** Tạo lại token — token cũ **hết hiệu lực ngay** (SPEC mục 3). */
app.post('/v1/agent/:id/token', async (c) =>
  c.json(await chayLenh(c, 'tao_lai_token', { agent_id: c.req.param('id') })),
);

/**
 * Thu hồi token (SPEC mục 3).
 *
 * Dùng `POST .../token/thu-hoi`, **không** dùng `DELETE`: bảng quyền của SPEC có
 * hàng "Xoá bất cứ thứ gì — không bao giờ", nên API của Baton không có động từ
 * `DELETE` nào cho agent gọi. Đây cũng không phải xoá: dòng agent vẫn còn, chỉ
 * token hết hiệu lực.
 */
app.post('/v1/agent/:id/token/thu-hoi', async (c) =>
  c.json(await chayLenh(c, 'thu_hoi_token', { agent_id: c.req.param('id') })),
);

/** Chủ chỉnh **một ô** bảng quyền của một agent — SPEC mục 3. */
app.put('/v1/agent/:id/quyen/:viec', async (c) => {
  const b = await than(c);
  return c.json(
    await chayLenh(c, 'dat_quyen', {
      pham_vi: b['pham_vi'],
      // Thiếu `cho_phep` = **bỏ ghi đè**, trả ô về mặc định của vai trò.
      cho_phep: b['cho_phep'] ?? null,
      agent_id: c.req.param('id'),
      viec: c.req.param('viec'),
    }),
  );
});

/* ------------------------------------------------------------------ *
 * Ticket — SPEC mục 4, 13, 14 (+ 19.1, 19.2, 19.4, 19.10, 19.11)
 * ------------------------------------------------------------------ */

/**
 * `baton list` — SPEC mục 13; danh sách ticket của mục 14 (lọc + keyset).
 *
 * **Chín bộ lọc của d.396** đều ở đây: dự án, trạng thái, ưu tiên, người chịu
 * trách nhiệm, **người đang cầm**, nhãn, "có cờ", "cần Chủ", "xong không bằng
 * chứng". Cả chín lọc **trong SQL** (xem `cauLenhDanhSachTicket`), không sau truy
 * vấn: lọc sau thì một trang keyset có thể còn 0 dòng và giao diện kết luận "hết
 * ticket" trong khi còn hàng trăm nghìn dòng chưa xét (19.12 câu 1).
 *
 * **Không** có `bay_gio` ở đây, có chủ ý: đây cũng là thân mà `baton list --json`
 * in ra (mục 13), và một mốc đổi theo từng lần gọi làm đầu ra của CLI không còn
 * so lại được (`test/cli.test.ts` so hai lần chạy với nhau — và nó đã bắt đúng
 * chuyện này). Mốc của d.412 nằm ở `GET /v1/man-hinh-ticket`, đường của **màn
 * hình**.
 */
app.get('/v1/ticket', async (c) => {
  const q = c.req.query();
  return c.json(await lietKeTicket(c.env.DB, c.get('ai'), c.get('workspace_id'), docLocTicket(q)));
});

/**
 * **Bộ lọc d.396 đọc từ query** — một chỗ, dùng cho cả `GET /v1/ticket` (CLI) và
 * `GET /v1/man-hinh-ticket` (giao diện). Hai bảng đọc tham số là hai chỗ để lệch,
 * và lệch ở đây nghĩa là `baton list --project X` và màn hình lọc dự án X cho hai
 * tập ticket khác nhau.
 */
function docLocTicket(q: Record<string, string>): YeuCauLietKeTicket {
  return {
    cursor: q['cursor'],
    limit: q['limit'],
    project_id: locKhongRong(q['project_id'], 'project_id'),
    trang_thai: q['trang_thai'],
    uu_tien: q['uu_tien'],
    chiu_trach_nhiem: locKhongRong(q['chiu_trach_nhiem'], 'chiu_trach_nhiem'),
    nguoi_dang_cam: locKhongRong(q['nguoi_dang_cam'], 'nguoi_dang_cam'),
    nhan: locKhongRong(q['nhan'], 'nhan'),
    co_co: q['co_co'] === 'co',
    can_chu: q['can_chu'] === 'co',
    xong_khong_bang_chung: q['xong_khong_bang_chung'] === 'co',
  };
}

/**
 * **Một bộ lọc chữ: có mặt thì phải có nội dung** — SPEC mục 13, nếp mã lỗi.
 *
 * `?nguoi_dang_cam=` (hoặc `project_id`, `chiu_trach_nhiem`, `nhan` để trống) đi
 * thẳng tới SQL thành `agent_id = ''` và trả **một trang rỗng** — câu trả lời của
 * "không agent nào tên chuỗi rỗng", đúng về mặt SQL nhưng là một lời khai sai với
 * người gọi: họ đã gửi một bộ lọc **vô nghĩa** và nhận lại một kết quả trông như
 * dữ liệu thật. Mục 13 có nếp cho đúng chuyện này (`INVALID_INPUT` + một câu
 * tiếng Việt), nên dùng nó.
 *
 * `trang_thai` và `uu_tien` **không** qua đây: chúng đã có cửa riêng
 * (`kiemTrangThaiTicket`, `kiemUuTien`) và chuỗi rỗng không nằm trong danh sách
 * mã hợp lệ, nên đã là `INVALID_INPUT` kèm câu liệt kê các giá trị đúng — một câu
 * **nói nhiều hơn** "không được để trống". `limit=` cũng vậy (`kiemLimit`).
 *
 * Giao diện đã bỏ bộ lọc rỗng ngay ở `locTuUrl`, nên cửa này chỉ chạm người gọi
 * API thủ công và CLI — đúng chỗ nó cần đứng: một cửa ở client là một cửa cho
 * **một** client.
 */
function locKhongRong(gia_tri: string | undefined, ten: string): string | undefined {
  if (gia_tri === undefined) return undefined;
  if (gia_tri.trim().length === 0) {
    throw new BatonError('INVALID_INPUT', {
      message: `Bộ lọc \`${ten}\` không được để trống. Bỏ hẳn tham số nếu không muốn lọc.`,
    });
  }
  return gia_tri;
}

/**
 * **Màn hình danh sách ticket** — SPEC mục 14 d.395–397.
 *
 * Cùng dữ liệu với `GET /v1/ticket`, cộng hai thứ của **màn hình**: mốc `bay_gio`
 * cho chữ tương đối của d.412, và cổng "chỉ chủ" (mục 14 là giao diện web của
 * chủ). Mốc đọc **trước** truy vấn: một mốc lấy sau khi đã đọc dữ liệu là một mốc
 * muộn hơn chính dữ liệu, và một hạn vừa tới sẽ hiện "0 giây **trước**" thay vì
 * "trong 0 giây".
 */
app.get('/v1/man-hinh-ticket', async (c) =>
  c.json(
    await manHinhDanhSachTicket(
      c.env.DB,
      c.get('ai'),
      c.get('workspace_id'),
      docLocTicket(c.req.query()),
      Date.now(),
    ),
  ),
);

/**
 * `GET /v1/tim?q=…&limit=…` — **command menu `Cmd/Ctrl+K`** (SPEC mục 14 d.414,
 * 19.12 câu 8): ticket (mã, tiêu đề, mã cũ) + mục Cần Chủ (T-số, tiêu đề), chuỗi
 * con. Lệnh **ĐỌC**: đi thẳng D1, không chạm cửa ghi. Phạm vi = đúng cửa của
 * `GET /v1/ticket` và `GET /v1/can-chu` — xem `doc-tim.ts`.
 */
app.get('/v1/tim', async (c) =>
  c.json(
    await timNhanh(c.env.DB, c.get('ai'), c.get('workspace_id'), {
      q: c.req.query('q'),
      limit: c.req.query('limit'),
    }),
  ),
);

/**
 * **Màn hình chi tiết ticket** `/t/<MÃ>` — SPEC mục 14 d.398–401, một lượt gọi.
 *
 * Đường theo **mã**, không id: d.398 chốt `/t/<MÃ>`, nên giao diện có mã trong
 * tay và một lần đổi mã → id ở client là một lượt đi-về nữa cho mỗi lần mở ticket.
 *
 * Khai dưới `/v1/ticket/...` và **không** nằm trong cây đó: `man-hinh-ticket` là
 * một màn hình (một tập hợp dữ liệu của mục 14), không một tài nguyên con của
 * ticket — cùng nếp `/v1/tong-quan` và `/v1/can-chu`.
 *
 * Cổng "chỉ chủ" nằm **trong** `manHinhTicket`, không ở đây.
 */
app.get('/v1/man-hinh-ticket/ma/:ma', async (c) =>
  c.json(
    await manHinhTicket(
      c.env.DB,
      c.get('ai'),
      c.get('workspace_id'),
      c.req.param('ma'),
      Date.now(),
    ),
  ),
);

/**
 * `baton show <MÃ>` — tra ticket theo **mã hiển thị** `MÃ-số` (SPEC mục 13 d.372).
 *
 * Khai trước `/v1/ticket/:id` cho người đọc thấy ngay; định tuyến không nhập
 * nhằng vì `/v1/ticket/ma/:ma` có **bốn** đoạn, `/v1/ticket/:id` có ba.
 *
 * Cùng cửa quyền, cùng `NOT_FOUND` (cả mã lẫn thân) với đường theo `id`, và
 * cùng việc **cho đọc ticket đã xoá mềm** — xem `layTicketTheoMa`.
 */
app.get('/v1/ticket/ma/:ma', async (c) =>
  c.json(await layTicketTheoMa(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('ma'))),
);

/** `baton show` — SPEC mục 13 (ticket + liên kết + 10 bình luận cuối). */
app.get('/v1/ticket/:id', async (c) =>
  c.json(await layTicket(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'))),
);

/** Lịch sử một ticket — SPEC mục 4 (chỉ thêm; keyset theo `(luc, id)`). */
app.get('/v1/ticket/:id/lich-su', async (c) => {
  const q = c.req.query();
  // Đọc qua `layTicket` trước để phạm vi và `NOT_FOUND` áp đúng một chỗ.
  const ticket = await layTicket(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'));
  return c.json(
    await lichSuTicket(c.env.DB, c.get('workspace_id'), ticket.id, {
      cursor: q['cursor'],
      limit: q['limit'],
    }),
  );
});

/** Bình luận một ticket — SPEC mục 4 (keyset theo `(tao_luc, id)`). */
app.get('/v1/ticket/:id/binh-luan', async (c) => {
  const q = c.req.query();
  const ticket = await layTicket(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'));
  return c.json(
    await binhLuanCuaTicket(c.env.DB, c.get('workspace_id'), ticket.id, {
      cursor: q['cursor'],
      limit: q['limit'],
    }),
  );
});

app.post('/v1/ticket', async (c) => c.json(await chayLenh(c, 'tao_ticket', await than(c)), 201));

/** Sửa trường của ticket — SPEC mục 4 (trạng thái đi đường riêng bên dưới). */
app.patch('/v1/ticket/:id', async (c) =>
  c.json(await chayLenh(c, 'sua_ticket', { ...(await than(c)), ticket_id: c.req.param('id') })),
);

/**
 * `baton status` — SPEC mục 13, luật mục 4 + 19.2.
 *
 * Đường riêng, không gộp vào `PATCH`: đổi trạng thái có luật riêng (cổng bằng
 * chứng, ticket con, lý do, ticket gốc) và có ca **vừa đổi dữ liệu vừa trả lỗi**.
 * Gộp vào `PATCH` thì một lệnh sửa tiêu đề và một lệnh đổi trạng thái lại chia
 * nhau cùng một đường mã, và luật nào cũng phải tự kiểm "có đổi trạng thái không".
 */
app.post('/v1/ticket/:id/trang-thai', async (c) =>
  c.json(await chayLenh(c, 'doi_trang_thai', { ...(await than(c)), ticket_id: c.req.param('id') })),
);

/** Chủ bấm "Tôi làm" — SPEC 19.10 (bậc 4 của 19.1). */
app.post('/v1/ticket/:id/toi-lam', async (c) =>
  c.json(await chayLenh(c, 'chu_tu_lam', { ...(await than(c)), ticket_id: c.req.param('id') })),
);

/** Gắn hoặc bỏ một nhãn — SPEC mục 4, 14. */
app.post('/v1/ticket/:id/nhan', async (c) =>
  c.json(await chayLenh(c, 'dat_nhan', { ...(await than(c)), ticket_id: c.req.param('id') })),
);

/** Nối hai ticket: `related`, `blocks`, `dieu_phoi` — SPEC mục 4, 19.4. */
app.post('/v1/ticket/:id/lien-ket', async (c) =>
  c.json(await chayLenh(c, 'noi_ticket', { ...(await than(c)), tu_ticket_id: c.req.param('id') })),
);

/**
 * Xoá ticket — **chỉ chủ**, xoá **mềm**, khôi phục trong 30 ngày (SPEC mục 4).
 *
 * `POST .../xoa` chứ không phải `DELETE`: bảng quyền SPEC mục 3 có hàng "Xoá bất
 * cứ thứ gì — không bao giờ" cho agent, nên API của Baton không mở động từ
 * `DELETE` nào (cùng lý do với thu hồi token ở trên).
 */
app.post('/v1/ticket/:id/xoa', async (c) =>
  c.json(await chayLenh(c, 'xoa_ticket', { ticket_id: c.req.param('id') })),
);

app.post('/v1/ticket/:id/khoi-phuc', async (c) =>
  c.json(await chayLenh(c, 'khoi_phuc_ticket', { ticket_id: c.req.param('id') })),
);

/* ------------------------------------------------------------------ *
 * Lượt giao — SPEC mục 5 (+ 19.1, 19.3, 19.5)
 * ------------------------------------------------------------------ */

/**
 * **Chuỗi lượt giao của một ticket** — SPEC mục 5 ("thấy cả chuỗi"), mục 14
 * (dòng thời gian). Sắp theo `so_luot`.
 */
app.get('/v1/ticket/:id/luot-giao', async (c) =>
  c.json(
    await luotGiaoCuaTicketTrongPhamVi(
      c.env.DB,
      c.get('ai'),
      c.get('workspace_id'),
      c.req.param('id'),
      Date.now(),
    ),
  ),
);

/** `baton assign` — SPEC mục 5, mục 13. */
app.post('/v1/ticket/:id/luot-giao', async (c) =>
  c.json(
    await chayLenh(c, 'tao_luot_giao', { ...(await than(c)), ticket_id: c.req.param('id') }),
    201,
  ),
);

/** `baton claim` — SPEC mục 5 ("Nhận việc"), mục 13. Phiên là lượt sau. */
app.post('/v1/luot-giao/:id/nhan', async (c) =>
  c.json(await chayLenh(c, 'nhan_luot_giao', { luot_giao_id: c.req.param('id') })),
);

/**
 * `baton submit` — **nộp báo cáo** (SPEC mục 5, 19.2, 19.3).
 * Chỉ người nhận; lượt phải đang `in_progress`.
 */
app.post('/v1/luot-giao/:id/nop', async (c) =>
  c.json(await chayLenh(c, 'nop_bao_cao', { ...(await than(c)), luot_giao_id: c.req.param('id') })),
);

/**
 * **Nghiệm thu** — `accepted` hoặc `returned` (SPEC mục 5, 19.2, 19.5).
 * Chỉ người giao; lượt phải đang `submitted`. `returned` bắt buộc có lý do.
 */
app.post('/v1/luot-giao/:id/nghiem-thu', async (c) =>
  c.json(await chayLenh(c, 'nghiem_thu', { ...(await than(c)), luot_giao_id: c.req.param('id') })),
);

/**
 * **Huỷ lượt** (SPEC mục 5 `canceled`, 19.2, 19.11). Người giao hoặc chủ.
 *
 * `POST .../huy`, không phải `DELETE`: huỷ là đổi trạng thái của lượt, không
 * phải xoá — bảng quyền mục 3 có hàng "Xoá bất cứ thứ gì — không bao giờ", nên
 * API của Baton không mở động từ `DELETE` nào.
 */
app.post('/v1/luot-giao/:id/huy', async (c) =>
  c.json(await chayLenh(c, 'huy_luot', { ...(await than(c)), luot_giao_id: c.req.param('id') })),
);

/**
 * **"Tạo ticket từ việc phát sinh"** (SPEC mục 5) — đường API của cái nút mà
 * phần 6 sẽ vẽ cho người giao.
 */
app.post('/v1/luot-giao/:id/viec-phat-sinh/ticket', async (c) =>
  c.json(
    await chayLenh(c, 'tao_ticket_viec_phat_sinh', {
      ...(await than(c)),
      luot_giao_id: c.req.param('id'),
    }),
    201,
  ),
);

/* ------------------------------------------------------------------ *
 * Kéo việc — SPEC mục 13 d.352 (`baton tasks [--wait 60]`), d.387
 * ------------------------------------------------------------------ */

/**
 * `baton tasks [--wait 60]` — SPEC mục 13 d.352: "**Mô hình kéo việc**… agent tự
 * gọi "việc của tôi" hoặc "chờ việc". Có chế độ chờ dài tới 60 giây; có việc mới
 * hoặc tín hiệu mới thì trả về ngay."
 *
 * Là lệnh **ĐỌC**: không ghi gì, nên không phải một "tín hiệu" của phiên (mục 6
 * d.188 — "Lệnh đọc không tính"), và một agent treo trên `--wait` vẫn bị tính
 * **đứng** đúng như SPEC muốn. Muốn giữ phiên sống thì gửi `baton heartbeat`.
 *
 * Hai nhánh:
 *   * **`wait` thiếu hoặc 0** → đọc thẳng D1, không chạm Durable Object (nếp "lệnh
 *     đọc đi thẳng D1").
 *   * **`wait > 0`** → đọc thử một lần ở đây trước; có việc thì trả **ngay** mà
 *     không mất một chặng DO nào. Chưa có gì mới đi vào cửa ghi để treo, vì đó là
 *     nơi duy nhất nhận được khoá đánh thức của các lệnh ghi (`choViec`).
 *
 * **d.387 "Lệnh chờ dài tính 1 request"**: bộ đếm 600/phút chạy ở middleware
 * `xacThuc`, đúng một lần cho request này; cả hai nhánh dưới đây không đếm lại.
 */
app.get('/v1/tasks', async (c) => {
  const ai = aiKeoViecTu(c.get('ai'), c.get('khoa_dem') ?? null);
  const workspace_id = c.get('workspace_id');
  const han_ms = msChoDai(c.req.query('wait'));

  const viec = await viecCuaToi(c.env.DB, workspace_id, ai, Date.now());
  if (han_ms === 0 || viec.co_viec) {
    return c.json({ ...viec, het_gio: false, da_cho_ms: 0, cho_toi_da_giay: CHO_DAI_TOI_DA_GIAY });
  }
  return c.json(await goiChoViec(c.env, { workspace_id, ai, han_ms }));
});

/* ------------------------------------------------------------------ *
 * Phiên và nhịp tim — SPEC mục 6 (+ 19.6), mục 13, mục 14
 * ------------------------------------------------------------------ */

/**
 * `baton heartbeat [ghi chú]` — SPEC mục 13: "Nhịp tim; **trả về tín hiệu nếu
 * có** (`STOP`, kết quả Cần Chủ mới)".
 *
 * Là lệnh **GHI** (nó là một tín hiệu của phiên — mục 6 d.188), nên đi qua cửa
 * ghi như mọi lệnh ghi khác. `tin_hieu: ["STOP"]` trong phản hồi là thứ CLI dịch
 * thành **mã thoát 3** (mục 13, nghiệm thu 17.8).
 */
app.post('/v1/luot-giao/:id/heartbeat', async (c) =>
  c.json(await chayLenh(c, 'heartbeat', { ...(await than(c)), luot_giao_id: c.req.param('id') })),
);

/** Phiên của một lượt giao — SPEC mục 6, mục 14 ("Chi tiết phiên"). */
app.get('/v1/luot-giao/:id/phien', async (c) => {
  /*
   * Phạm vi đi qua ticket của phiên, **ngay trong câu tra** (BAT-57): ngoài phạm
   * vi → cùng dòng `throw` với lượt không có (SPEC mục 13, 19.12 câu 15). Trước
   * BAT-57 đường này tra phiên rồi gọi `layTicket`, nên ngoài phạm vi ra "Không
   * tìm thấy ticket." còn id bịa ra "Lượt giao này chưa có phiên nào." — cùng 404
   * nhưng khác thân, vẫn là máy dò.
   */
  const d = await phienCuaLuot(c.env.DB, c.get('workspace_id'), c.req.param('id'), c.get('ai'));
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Lượt giao này chưa có phiên nào.' });
  return c.json(raPhien(d, Date.now()));
});

/** Một phiên theo mã — SPEC mục 14 ("Chi tiết phiên: dòng hoạt động, kế hoạch, nút Dừng"). */
app.get('/v1/phien/:id', async (c) => {
  // Lọc phạm vi trong câu tra — cùng lý do với đường trên (BAT-57).
  const d = await phienTheoId(c.env.DB, c.get('workspace_id'), c.req.param('id'), c.get('ai'));
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy phiên.' });
  return c.json(raPhien(d, Date.now()));
});

/** Các phiên của một ticket — SPEC mục 14, 19.6 (chỉ báo sức sống). */
app.get('/v1/ticket/:id/phien', async (c) => {
  const ticket = await layTicket(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'));
  return c.json(await phienCuaTicket(c.env.DB, c.get('workspace_id'), ticket.id, Date.now()));
});

/**
 * Chủ bấm **"Dừng"** — SPEC mục 6 d.192–193, mục 14 d.400.
 *
 * `POST .../dung`, không phải `DELETE`: dừng là đổi trạng thái của phiên sang
 * `stopping`, không phải xoá — và bảng quyền mục 3 có hàng "Xoá bất cứ thứ gì —
 * không bao giờ", nên API của Baton không mở động từ `DELETE` nào.
 */
app.post('/v1/phien/:id/dung', async (c) =>
  c.json(await chayLenh(c, 'dung_phien', { phien_id: c.req.param('id') })),
);

/* ------------------------------------------------------------------ *
 * Dòng hoạt động và kế hoạch của phiên — SPEC mục 6 d.190, d.191, mục 14
 * ------------------------------------------------------------------ */

/**
 * Agent gửi một mục vào **dòng hoạt động** — SPEC mục 6 d.190.
 *
 * Thân request gọi trường là `loai` (như SPEC), server đổi tên thành
 * `loai_hoat_dong` vì `loai` của mọi lệnh ghi là **tên lệnh** (xem `LenhChung`).
 */
app.post('/v1/phien/:id/hoat-dong', async (c) => {
  const b = await than(c);
  return c.json(
    await chayLenh(c, 'gui_hoat_dong', {
      ...b,
      loai_hoat_dong: b['loai'],
      phien_id: c.req.param('id'),
    }),
    201,
  );
});

/**
 * Dòng hoạt động của một phiên — SPEC mục 6 d.190, mục 14 ("Chi tiết phiên").
 *
 * Mặc định ẩn mục **tạm thời đã bị mục sau thay chỗ**; `?gom_tam_thoi=co` lấy đủ
 * lịch sử ("vẫn lưu trong lịch sử" — d.190).
 */
app.get('/v1/phien/:id/hoat-dong', async (c) => {
  // Lọc phạm vi trong câu tra (BAT-57): ngoài phạm vi = cùng 404, cùng thân với id bịa.
  const d = await phienTheoId(c.env.DB, c.get('workspace_id'), c.req.param('id'), c.get('ai'));
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy phiên.' });
  return c.json(
    await hoatDongCuaPhien(c.env.DB, c.get('workspace_id'), d.id, {
      gom_tam_thoi: c.req.query('gom_tam_thoi') === 'co',
      limit: Number(c.req.query('limit') ?? 200),
    }),
  );
});

/** Agent gửi lại **toàn bộ** kế hoạch — SPEC mục 6 d.191. */
app.put('/v1/phien/:id/ke-hoach', async (c) =>
  c.json(await chayLenh(c, 'dat_ke_hoach', { ...(await than(c)), phien_id: c.req.param('id') })),
);

/** Kế hoạch **hiện hành** của một phiên — SPEC mục 6 d.191, mục 14. */
app.get('/v1/phien/:id/ke-hoach', async (c) => {
  // Lọc phạm vi trong câu tra (BAT-57): ngoài phạm vi = cùng 404, cùng thân với id bịa.
  const d = await phienTheoId(c.env.DB, c.get('workspace_id'), c.req.param('id'), c.get('ai'));
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy phiên.' });
  return c.json(await keHoachCuaPhien(c.env.DB, c.get('workspace_id'), d.id));
});

/* ------------------------------------------------------------------ *
 * Hỏi người giao và trả lời — SPEC 19.6, 19.12 câu 2
 * ------------------------------------------------------------------ */

/**
 * `baton reply <lượt> "<nội dung>"` — SPEC **19.12 câu 2**.
 * Chỉ người giao của lượt đó; chủ trả lời từ web, **hành vi giống hệt**.
 * (Lệnh CLI là phần 5; đây là đường API.)
 */
app.post('/v1/luot-giao/:id/tra-loi', async (c) =>
  c.json(
    await chayLenh(c, 'tra_loi_cau_hoi', { ...(await than(c)), luot_giao_id: c.req.param('id') }),
    201,
  ),
);

/**
 * **Câu hỏi đang chờ tôi trả lời** — SPEC 19.6: "Người giao là agent: câu hỏi hiện
 * trong `baton tasks` của người giao."
 *
 * Đường riêng, **không** phải `baton tasks`: `tasks` (mục 13) chưa được viết ở
 * lượt nào, và nó là một danh sách **việc** (lượt giao `pending`), không chỉ câu
 * hỏi. Khi `tasks` được làm, nó gọi đúng hàm `cauHoiChoTraLoi` này — nguồn dữ
 * liệu một chỗ, không hai đường.
 */
app.get('/v1/cau-hoi', async (c) => {
  const ai = c.get('ai');
  return c.json(
    await cauHoiChoTraLoi(
      c.env.DB,
      c.get('workspace_id'),
      ai.loai === 'chu' ? { loai: 'chu' } : { loai: 'agent', agent_id: ai.agent_id },
      Date.now(),
    ),
  );
});

/*
 * **KHÔNG có route "quét cảnh báo phiên".** Lượt 4 của phần 2 có
 * `POST /v1/phien/canh-bao/quet` để Tổng quan gọi khi mở; 19.12 câu 46 chốt ngược
 * lại ("Cron Trigger quét mỗi 5 phút, **không** dựa vào việc có ai mở Tổng quan"),
 * nên route, lệnh `quet_canh_bao` và ô quyền của nó đã được gỡ. Đừng thêm lại: một
 * đường HTTP ghi mốc là đường thứ hai bắn tin, và nó làm việc phát hiện phụ thuộc
 * người mở màn hình — xem đầu `cron-canh-bao-phien.ts`.
 */

/* ------------------------------------------------------------------ *
 * Bằng chứng — SPEC mục 7, mục 13 d.364 (`baton evidence`)
 * ------------------------------------------------------------------ */

/**
 * `baton evidence <MÃ> <type> <giá trị>` — SPEC mục 13 d.364: "Gửi bằng chứng;
 * **chờ xác minh tối đa 10 giây** rồi in kết quả". Cùng luật: mục 7 d.219.
 *
 * **Ba chặng, và chặng gọi mạng KHÔNG nằm trong cửa ghi.** Lý do đầy đủ ở đầu
 * `xac-minh-bang-chung.ts`; ngắn gọn: `WorkspaceGate` là **một** Durable Object
 * cho mỗi workspace và chạy đơn luồng, nên một lần `fetch` tới GitHub bên trong
 * nó treo hàng đợi ghi của **cả workspace** — mọi agent đứng lại vì một lần gọi
 * mạng chậm của một bằng chứng.
 *
 *   1. `gui_bang_chung`  → cửa ghi: quyền, kiểm nội dung, chèn dòng `pending`.
 *   2. `xacMinhTrongHan` → **ở đây, trong Worker**: gọi GitHub / gọi URL deploy.
 *   3. `goiGhiXacMinh`   → cửa ghi lần hai: ghi kết luận.
 *
 * Chặng 1 đã đặt `thu_lai_luc` (d.220), nên nếu chặng 2 hay 3 không chạy tới
 * (Worker chết, client ngắt) thì bằng chứng vẫn nằm trong tầm quét của Cron ở
 * lượt 3, không mắc `pending` vĩnh viễn.
 */
app.post('/v1/ticket/:id/bang-chung', async (c) => {
  const phan = await than(c);
  // Chỉ cho dòng log `loi_internal` (BAT-65) — không đổi hành vi; xem `nhat-ky-loi.ts`.
  const loai_log = loaiBangChungDeLog(phan['loai_bang_chung']);
  if (loai_log !== null) c.set('loai_bang_chung', loai_log);

  const ket = await chayLenh(c, 'gui_bang_chung', {
    ...phan,
    ticket_id: c.req.param('id'),
  });

  // Bốn loại không có bước xác minh (d.209–211 + d.208) dừng ở đây.
  if (ket['can_xac_minh'] !== true) return c.json(ket, 201);

  /*
   * **Chặng 2 hoặc 3 NÉM thì vẫn trả 201 + `pending`, không 500.**
   *
   * Dòng `evidence` đã chèn xong ở chặng 1, với `xac_minh = 'pending'` và
   * `thu_lai_luc` đã đặt — **không mất dữ liệu**, và Cron của lượt 3 sẽ nhặt nó
   * lên. Một 500 ở đây nói sai sự thật với agent ("gửi thất bại") cho một bằng
   * chứng đã nằm trong bảng, và agent sẽ gửi lại, thành hai dòng cho một việc.
   * d.219 hứa "**trả kết quả** trong tối đa 10 giây", không hứa "thành công" —
   * `pending` kèm lý do **là** một kết quả hợp lệ của d.220.
   *
   * Không nuốt im lặng: vẫn log stderr như `middleware-loi.ts`. Và lỗi gốc
   * **không** ra thân phản hồi (SPEC mục 15): nó có thể mang URL đầy đủ hoặc
   * nội dung một secret.
   */
  try {
    const kq = await xacMinhTrongHan(
      ket['noi_dung'] as NoiDungBangChung,
      nguonXacMinhCua(c.env),
    );
    const sau = await goiGhiXacMinh(c.env, {
      workspace_id: c.get('workspace_id'),
      bang_chung_id: ket['id'] as string,
      // Chặng chạy **ngay khi gửi** (d.219) — không phải một lần "thử lại", nên
      // `so_lan_thu` không nhích ở lượt ghi này. Xem `NguonGhiXacMinh`.
      nguon: 'gui',
      ket_qua: kq,
    });

    return c.json(
      {
        ...ket,
        // Trạng thái **sau** xác minh ghi đè trạng thái lúc chèn: agent đọc một
        // trường, không phải đoán giữa hai trường.
        xac_minh: sau.xac_minh ?? ket['xac_minh'],
        ly_do: sau.ly_do,
        ma_http: kq.ma_http,
        /*
         * **Nguồn của kết luận** — `github` hay `local` (migration 0022 khối A).
         * Lấy từ `sau` (lượt ghi), không từ `kq`: nếu lượt ghi bỏ qua (dòng đã có
         * kết luận khác, hoặc đã bị rút trong lúc chờ mạng) thì nguồn phải là
         * nguồn **đã lưu**, không phải nguồn mà lượt này định ghi.
         */
        nguon_xac_minh: sau.nguon_xac_minh,
        thu_lai_luc: sau.thu_lai_luc,
        da_ghi_xac_minh: sau.da_ghi,
      },
      201,
    );
  } catch (err) {
    console.error('Lỗi khi xác minh bằng chứng:', err);
    return c.json(
      {
        ...ket,
        xac_minh: 'pending',
        ly_do: 'Chưa xác minh được bằng chứng này (lỗi phía server); sẽ tự thử lại.',
        ma_http: null,
        // `thu_lai_luc` giữ **nguyên giá trị của chặng 1** (`...ket`): nó đã được
        // đặt lúc chèn, và nó là bằng chứng rằng Cron sẽ nhặt dòng này lên.
        da_ghi_xac_minh: false,
      },
      201,
    );
  }
});

/**
 * **Rút lại** một bằng chứng — SPEC mục 7 d.222: "Bằng chứng không sửa, **không
 * xoá**. Chỉ có thể 'rút lại' **kèm lý do** (người gửi hoặc chủ)."
 *
 * `POST .../rut`, **không** `DELETE`: đường này không xoá gì, và một method
 * `DELETE` trên bằng chứng là lời mời đúng cái việc d.222 cấm.
 */
app.post('/v1/bang-chung/:id/rut', async (c) =>
  c.json(
    await chayLenh(c, 'rut_bang_chung', {
      ...(await than(c)),
      bang_chung_id: c.req.param('id'),
    }),
  ),
);

/* ------------------------------------------------------------------ *
 * Cần Chủ — SPEC mục 8, 19.8; 19.12 câu 4, 18
 * ------------------------------------------------------------------ */

/**
 * `POST /v1/can-chu` — tạo một mục Cần Chủ (mục 8 d.229: agent `coordinator` hoặc
 * `manager` qua CLI/MCP/API, hoặc chủ tự tạo). Đây là đường sau `baton ask` của
 * bảng lệnh mục 13.
 *
 * Thân nhận `loai` và `lenh` theo đúng tên SPEC gọi chúng, rồi đổi sang
 * `loai_can_chu` / `lenh_chay` trước khi vào whitelist: `loai` của **mọi** lệnh
 * ghi là tên lệnh (`LenhChung`), nên để client gửi `loai` vào thẳng thân lệnh là
 * mở đường ghi đè loại lệnh. Cùng cách route `gui_hoat_dong` đã làm với `loai`.
 *
 * Đường **đọc một mục** (`baton result T-x`) là `GET /v1/can-chu/:id` dưới đây.
 * Đường đọc **màn hình** Cần Chủ (3 khối, bảng Đã xử lý — d.248–252) là lượt 3b;
 * nó dùng chung `COT_MUC` / `locPhamViCanChu` của `doc-can-chu.ts`.
 */
app.post('/v1/can-chu', async (c) => {
  const { loai, lenh, ...con_lai } = await than(c);
  return c.json(
    await chayLenh(c, 'tao_can_chu', {
      ...con_lai,
      ...(loai === undefined ? {} : { loai_can_chu: loai }),
      ...(lenh === undefined ? {} : { lenh_chay: lenh }),
    }),
    201,
  );
});

/**
 * Ba đường **xử lý** một mục — mục 8 d.243–246, 19.9.
 *
 * `:id` nhận **id** hoặc **`T-số`** (`/v1/can-chu/T-18/xu-ly`): mục 13 gọi mục
 * bằng `T-số` ở mọi chỗ (`baton result T-x`), còn web gọi bằng id. Một chỗ dịch
 * duy nhất, ở `canChuBatBuoc`.
 *
 * **Không có route nào cho agent đi qua** — cả ba lệnh kiểm ô "Quyết mục Cần
 * Chủ" (hàng *không bao giờ* của bảng mục 3) ngay dòng đầu handler, nên một
 * agent gọi ba đường này luôn nhận 403. Chúng là `POST … /xu-ly` chứ không
 * `PATCH /v1/can-chu/:id`: một `PATCH` chung sẽ phải nhận `trang_thai` từ thân
 * request, tức mở đúng cái cửa mà whitelist ở trên đóng lại.
 */
app.post('/v1/can-chu/:id/xu-ly', async (c) =>
  c.json(
    await chayLenh(c, 'xu_ly_can_chu', { ...(await than(c)), can_chu_id: c.req.param('id') }),
  ),
);

app.post('/v1/can-chu/:id/bo-qua', async (c) =>
  c.json(
    await chayLenh(c, 'bo_qua_can_chu', { ...(await than(c)), can_chu_id: c.req.param('id') }),
  ),
);

/**
 * `GET /v1/can-chu` — **màn hình Cần Chủ**: huy hiệu đếm (d.248) + **ba khối**
 * 🔴 · 🟡 · ⚪ (d.249), mỗi thẻ đủ các vế của d.250.
 *
 * Lọc theo **dự án** và theo **loại** — d.252. `project_id=chung` lấy mục **Chung**
 * (19.12 câu 4), cùng khoá mà `GET /v1/nhat-ky` đã dùng.
 *
 * Phân trang: `cursor` + `limit` áp cho **cả ba** khối cùng lúc — một cursor của
 * một khối không dùng được cho khối khác (khoá mang `han_luc` của mục). Cuộn một
 * khối riêng thì dùng `GET /v1/can-chu/khoi/:muc`.
 *
 * Lệnh **ĐỌC**: không nhích mốc nào (19.12 câu 53), không chạm cửa ghi.
 */
app.get('/v1/can-chu', async (c) => {
  const q = c.req.query();
  return c.json(
    await manHinhCanChu(c.env.DB, c.get('ai'), c.get('workspace_id'), Date.now(), {
      project_id: q['project_id'],
      loai: q['loai'],
      limit: q['limit'],
    }),
  );
});

/**
 * `GET /v1/can-chu/khoi/:muc` — **một** khối của d.249, để cuộn tiếp bằng `cursor`.
 *
 * `:muc` là một trong `urgent` · `today` · `later`; mã lạ → `INVALID_INPUT` qua
 * `kiemMucCanChu` (cùng cửa kiểm mà đường tạo dùng, nên không có bản thứ hai).
 *
 * Đặt **trước** `GET /v1/can-chu/:id`: Hono khớp route theo **thứ tự khai**, nên
 * `/v1/can-chu/khoi/...` phải đăng ký trước, nếu không `:id` nuốt nó.
 */
app.get('/v1/can-chu/khoi/:muc', async (c) => {
  const q = c.req.query();
  return c.json(
    await khoiCho(
      c.env.DB,
      c.get('ai'),
      c.get('workspace_id'),
      kiemMucCanChu(c.req.param('muc')),
      Date.now(),
      { project_id: q['project_id'], loai: q['loai'], cursor: q['cursor'], limit: q['limit'] },
    ),
  );
});

/**
 * `GET /v1/can-chu/da-xu-ly` — bảng **"Đã xử lý"** ở cuối màn hình (d.251): "ngày,
 * mã, tiêu đề ngắn, kết quả. Lọc được theo **dự án** và theo **khoảng ngày**".
 *
 * `tu_ngay` / `den_ngay` là `YYYY-MM-DD` **giờ trên tường** (UTC+7 — 19.12 câu 60),
 * và `den_ngay` bao **trọn** ngày đó. Sai dạng → `INVALID_INPUT`, không âm thầm bỏ
 * bộ lọc: một bảng im lặng trả **mọi** ngày là một bảng người dùng tưởng đã lọc.
 *
 * Cũng đặt **trước** `/v1/can-chu/:id` — xem route trên.
 *
 * Thân mang `bay_gio` (mốc máy chủ) như `GET /v1/can-chu`: bảng này ở **cùng**
 * màn hình Cần Chủ, nên ô thời gian của nó cũng theo mục 14 d.412 — chữ tương
 * đối, đếm từ đúng một đồng hồ, là đồng hồ ở đây.
 */
app.get('/v1/can-chu/da-xu-ly', async (c) => {
  const q = c.req.query();
  return c.json(
    await bangDaXuLy(c.env.DB, c.get('ai'), c.get('workspace_id'), Date.now(), {
      project_id: q['project_id'],
      loai: q['loai'],
      tu_ngay: q['tu_ngay'],
      den_ngay: q['den_ngay'],
      cursor: q['cursor'],
      limit: q['limit'],
    }),
  );
});

/**
 * `baton result T-<số> [--wait 60]` — SPEC mục 13 d.376: "in **trạng thái** và
 * **kết quả** của mục; `--wait` thì chờ tới khi xử lý xong"; mục 8 d.267 ("nhận
 * kết quả **trong vòng 3 giây** sau khi chủ bấm Gửi"); 19.9 d.543 (hết giờ mà mục
 * chưa xử lý → CLI in "chưa xử lý", thoát **mã 4**).
 *
 * `:id` nhận **`T-số`** hoặc **id**, cùng một chỗ dịch với ba đường ghi ở trên.
 *
 * Là lệnh **ĐỌC** (19.12 câu 53): không ghi gì, nên không nhích "lần cuối lên
 * tiếng" của agent và không là một tín hiệu của phiên.
 *
 * Hai nhánh, **đúng hình** `GET /v1/tasks`:
 *   * **`wait` thiếu hoặc 0** → đọc thẳng D1, **không chạm Durable Object**.
 *   * **`wait > 0`** → đọc thử một lần ở đây; mục đã rời `open` thì trả **ngay**,
 *     không mất một chặng DO nào. Chưa xử lý thì mới vào cửa ghi để treo, vì đó
 *     là nơi duy nhất nhận khoá `can_chu_ma:T-x` mà ba lệnh xử lý phát ra.
 *
 * `het_gio` của nhánh đọc thẳng luôn `false`: không chờ thì không hết giờ.
 */
app.get('/v1/can-chu/:id', async (c) => {
  const workspace_id = c.get('workspace_id');
  const ma_hoac_id = c.req.param('id');
  const han_ms = msChoDai(c.req.query('wait'));

  const muc = await layMucCanChu(c.env.DB, c.get('ai'), workspace_id, ma_hoac_id);
  if (han_ms === 0 || muc.da_xu_ly) {
    return c.json({ ...muc, het_gio: false, da_cho_ms: 0, cho_toi_da_giay: CHO_DAI_TOI_DA_GIAY });
  }
  return c.json(
    await goiChoCanChu(c.env, {
      workspace_id,
      ai: aiKeoViecTu(c.get('ai'), c.get('khoa_dem') ?? null),
      // Chuỗi thô đi tiếp, nhưng DO tra lại qua **cùng** cửa tầm nhìn trước khi
      // dựng chủ đề nghe — xem `WorkspaceGate.choCanChu`.
      ma_hoac_id,
      han_ms,
    }),
  );
});

app.post('/v1/can-chu/:id/mo-lai', async (c) =>
  c.json(
    await chayLenh(c, 'mo_lai_can_chu', { ...(await than(c)), can_chu_id: c.req.param('id') }),
  ),
);

/* ------------------------------------------------------------------ *
 * Nhật ký quyết định — SPEC mục 10; 19.12 câu 4
 * ------------------------------------------------------------------ */

/**
 * `POST /v1/nhat-ky` — ghi **một dòng** Nhật ký (mục 10 d.310: chủ,
 * `coordinator`, `manager`). Đây là đường sau `baton decision` của bảng lệnh
 * mục 13 d.377; **lệnh CLI là phần 5**, không làm ở lượt này.
 *
 * **Không có `PATCH` và không có đường xoá nào cho `/v1/nhat-ky/:id`** — d.309:
 * "Chỉ thêm. Không sửa, không xoá, **kể cả chủ**." Sự vắng mặt đó là cố ý và
 * được khoá ở tầng DB (trigger của migration 0014), không chỉ ở đây.
 */
app.post('/v1/nhat-ky', async (c) =>
  c.json(await chayLenh(c, 'ghi_nhat_ky', await than(c)), 201),
);

/**
 * `GET /v1/nhat-ky` — màn hình mục 10 d.311: **gom theo ngày**, **lọc theo dự
 * án** (`?project_id=`, giá trị `chung` cho dòng không dự án — 19.12 câu 4),
 * **lọc theo ai** (`?ai=chu` hoặc `?ai=<agent_id>`), **tìm theo chữ**
 * (`?tim=`). Phân trang keyset như mọi danh sách của Baton.
 */
app.get('/v1/nhat-ky', async (c) => {
  const q = c.req.query();
  return c.json(
    await lietKeNhatKy(c.env.DB, c.get('ai'), c.get('workspace_id'), {
      cursor: q['cursor'],
      limit: q['limit'],
      project_id: q['project_id'],
      // `ai` trên query string, `ai_loc` trong kiểu: `ai` trong mã của Baton
      // luôn là **người gọi** (`AiGoi`), nên hai nghĩa không được trùng tên.
      ai_loc: q['ai'],
      tim: q['tim'],
    }),
  );
});

/**
 * **Màn hình Nhật ký** của mục 14 — cùng dữ liệu với `GET /v1/nhat-ky`, cộng mốc
 * `bay_gio` của d.412 và cổng "chỉ chủ". Khai **trước** `/v1/nhat-ky/:id` cho
 * người đọc thấy ngay; định tuyến không nhập nhằng vì hai đường khác tên.
 */
app.get('/v1/man-hinh-nhat-ky', async (c) => {
  const q = c.req.query();
  return c.json(
    await manHinhNhatKy(
      c.env.DB,
      c.get('ai'),
      c.get('workspace_id'),
      {
        cursor: q['cursor'],
        limit: q['limit'],
        project_id: q['project_id'],
        ai_loc: q['ai'],
        tim: q['tim'],
      },
      Date.now(),
    ),
  );
});

app.get('/v1/nhat-ky/:id', async (c) =>
  c.json(await layNhatKy(c.env.DB, c.get('ai'), c.get('workspace_id'), c.req.param('id'))),
);

/* ------------------------------------------------------------------ *
 * Báo cáo — SPEC mục 11 d.322–336, mục 14 d.392
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/bao-cao` — **danh sách ngày đã có báo cáo** (d.336 "xem lại được").
 *
 * Phân trang keyset theo `(ngay, loai)` giảm dần, **không `OFFSET`** — nếp đã chốt
 * (`@baton/shared/trang.ts`).
 *
 * **Chỉ chủ** — cổng nằm **trong** `lietKeBaoCao`, không ở route này: cùng nếp
 * `GET /v1/tong-quan`, nên một đường HTTP thứ hai trỏ vào cùng dữ liệu không vô
 * tình mở cửa. Mục 11 nằm trong mục 14 ("Giao diện web **của chủ**").
 */
app.get('/v1/bao-cao', async (c) => {
  const q = c.req.query();
  return c.json(
    await lietKeBaoCao(c.env.DB, c.get('ai'), c.get('workspace_id'), {
      cursor: q['cursor'],
      limit: q['limit'],
    }),
  );
});

/**
 * `POST /v1/trong-tam` — ghi **3 việc trọng tâm hôm nay** (d.324).
 *
 * Ai gọi được: **chủ, hoặc agent `coordinator`** — kiểm **danh tính** bên trong cửa
 * ghi, không qua một hàng nào của bảng quyền mục 3 (`spec-questions.md` #117, nếp
 * 19.12 câu 13 / câu 37). Xem `lenh-bao-cao.ts`.
 *
 * Ba trọng tâm của một ngày **đã chụp** nằm trong chính báo cáo (vế 2 của d.324,
 * vế 1 của d.331). `GET /v1/trong-tam` (dưới) là đường đọc **sống** bộ của hôm nay,
 * vì báo cáo sáng là bản chụp bất biến lúc 07:30 và bộ ghi sau đó không vào đó
 * (`spec-questions.md` #147). Nó **không** tính "đạt hay chưa" — vế đó chỉ ở báo cáo.
 */
app.get('/v1/trong-tam', async (c) =>
  c.json(await layTrongTamSong(c.env.DB, c.get('ai'), c.get('workspace_id'), Date.now())),
);

app.post('/v1/trong-tam', async (c) =>
  c.json(await chayLenh(c, 'ghi_trong_tam', await than(c)), 201),
);

/**
 * `GET /v1/bao-cao/:ngay/:loai` — **một báo cáo** (d.336).
 *
 * Trả cả `du_lieu` (JSON, để trang web vẽ từng vế) và `noi_dung_md` (vế "xuất ra
 * markdown được"). Khai **sau** `/v1/bao-cao` nhưng hai đường khác số đoạn nên
 * định tuyến không nhập nhằng.
 *
 * `loai` sai dạng ⇒ **404**, không `INVALID_INPUT`: nó là một đoạn **đường dẫn**,
 * và một đoạn không hợp lệ là một đường không tồn tại. Xem `layBaoCao`.
 */
app.get('/v1/bao-cao/:ngay/:loai', async (c) =>
  c.json(
    await layBaoCao(
      c.env.DB,
      c.get('ai'),
      c.get('workspace_id'),
      c.req.param('ngay'),
      c.req.param('loai'),
    ),
  ),
);

/* ------------------------------------------------------------------ *
 * Bình luận — SPEC mục 4
 * ------------------------------------------------------------------ */

app.post('/v1/ticket/:id/binh-luan', async (c) =>
  c.json(
    await chayLenh(c, 'them_binh_luan', { ...(await than(c)), ticket_id: c.req.param('id') }),
    201,
  ),
);

app.patch('/v1/binh-luan/:id', async (c) =>
  c.json(await chayLenh(c, 'sua_binh_luan', { ...(await than(c)), comment_id: c.req.param('id') })),
);

app.post('/v1/binh-luan/:id/xoa', async (c) =>
  c.json(await chayLenh(c, 'xoa_binh_luan', { comment_id: c.req.param('id') })),
);

/* ------------------------------------------------------------------ *
 * Cron Triggers — SPEC mục 7 d.220, d.221, 19.7; mục 6 d.196 + 19.12 câu 46
 * ------------------------------------------------------------------ */

/**
 * **Việc nền.** **MỘT** biểu thức cron (`* * * * *`, khai trong `wrangler.toml`
 * `[triggers]` và trong `CRON_THU_LAI`), và năm việc phân nhánh theo
 * `controller.scheduledTime` trong `viecCuaCron`:
 *   * mỗi phút    → thử lại bằng chứng `pending` đến hạn (d.220, 5 phút/3 lần),
 *                   **và** gửi thông báo ra kênh ngoài + nhắc 🔴 sau 2 giờ (mục 12,
 *                   mục 8 d.283) — hai việc ở cùng nhịp, chạy tuần tự
 *   * phút ⋮ 5    → **cảnh báo phiên đứng hoặc lỗi** (mục 6 d.196; 19.12 câu 46
 *                   chốt đúng nhịp **5 phút** này, và chốt rằng việc phát hiện
 *                   **không** dựa vào việc có ai mở Tổng quan)
 *   * phút ⋮ 10   → kiểm lại commit `pushed` + dừng theo dõi sau 7 ngày
 *                   (d.221 "mỗi 10 phút trong 7 ngày", 19.7)
 *   * từ 00:30 UTC → **báo cáo sáng** (mục 11 d.322 "tự sinh lúc 07:30" — 00:30 UTC
 *                   **là** 07:30 UTC+7, 19.12 câu 60)
 *   * từ 13:00 UTC → **handoff tối** (mục 11 d.330 "tự sinh lúc 20:00")
 *   * từ 19:00 UTC → **sao lưu R2, giữ 14 bản** (mục 15 d.429; 19:00 UTC = 02:00
 *                   giờ chủ) — BAT-8, `sao-luu.ts`
 *
 * **Vì sao một cron, không năm:** gói Workers Free cho **5 cron trigger mỗi tài
 * khoản**; deploy 07/10 bị từ chối (`code 10072`) vì tài khoản còn Worker khác dùng
 * 2 nhịp, và hậu quả là hai nhịp báo cáo của mục 11 **không chạy** trên production.
 * Lý lẽ đầy đủ ở `viecCuaCron`; cửa sổ chịu nhịp trễ ở `cron-bao-cao.ts`.
 *
 * Hai nhịp báo cáo **không gọi mạng**: chúng ghi một dòng `bao_cao` và một tin vào
 * **kho thông báo trong app**. Đưa tin ấy ra Telegram (d.346) là việc của nhịp mỗi
 * phút — hai chặng rời nhau, nên giờ yên lặng của d.347 áp cho tin báo cáo bằng
 * đúng một bộ luật (`quyetDinhGuiTin`), và một Telegram đang hỏng không làm mất
 * một báo cáo nào.
 *
 * `viecCuaCron` là **sổ tra duy nhất** cho việc nào chạy ở nhịp nào.
 *
 * **Chặng gọi mạng nằm ở đây, trong Worker — không trong Durable Object cửa ghi.**
 * Lý do đầy đủ ở đầu `cron-bang-chung.ts`; ngắn gọn: `WorkspaceGate` đơn luồng, nên
 * một lượt quét 100 lần `fetch` bên trong nó treo hàng đợi ghi của cả workspace 100
 * lần liền nhau.
 *
 * `scheduled` **không ném**: một lỗi ném ra ở đây chỉ vào log của Cloudflare và
 * không ai đọc. Bắt, log, và để lượt sau thử lại — mọi dòng chưa xử lý vẫn còn mốc
 * của nó trong DB nên không mất gì.
 *
 * Cron **chưa được áp lên thật**: deploy nằm trong danh sách cấm của `CLAUDE.md`, và
 * `wrangler` bị chặn trong phiên làm việc này. Test gọi thẳng handler này.
 */
export interface KetQuaCron extends KetQuaCronBangChung {
  /** Lượt quét cảnh báo phiên — rỗng ở mọi nhịp khác `CRON_CANH_BAO`. */
  canh_bao: KetQuaQuetCanhBao;
  /** Lượt gửi thông báo + nhắc 🔴 — rỗng ở mọi nhịp khác `CRON_THONG_BAO`. */
  thong_bao: KetQuaCronThongBao;
  /** Lượt sinh báo cáo — rỗng ở mọi nhịp khác hai nhịp báo cáo của mục 11. */
  bao_cao: KetQuaCronBaoCao;
  /** Lượt sao lưu R2 (mục 15 d.429, BAT-8) — rỗng ngoài cửa sổ 19:00 UTC. */
  sao_luu: KetQuaCronSaoLuu;
}

/**
 * Phần của `ScheduledController` mà `chayCron` thật sự đọc.
 *
 * `cron` là **tuỳ chọn** và **không được đọc**: từ 10/10 chỉ có một biểu thức, nên
 * nó không mang tin gì, và phân nhánh theo nó là cách để một nhịp trễ hay một nhịp
 * thứ hai không khớp chuỗi nào rơi vào im lặng. Ô này ở lại trong kiểu để
 * `controller` thật của Cloudflare gán vào được mà không phải bóc tách.
 */
export interface NhipCron {
  scheduledTime: number;
  cron?: string;
}

async function chayCron(controller: NhipCron, env: Env): Promise<KetQuaCron> {
  const viec = viecCuaCron(controller.scheduledTime);
  const bay_gio = Date.now();
  try {
    /*
     * Tuần tự, không `Promise.all`: nhịp thường bật hai việc, nhịp dày nhất (00:30
     * UTC) bật bốn, nên song song không mua được gì, và tuần tự giữ thứ tự xác định
     * cho test. Thứ tự này **có nghĩa**: `thong_bao` chạy **trước** `bao_cao`, nên
     * tin báo cáo vừa sinh ra kênh ở nhịp **sau**, không trong cùng nhịp.
     */
    const bang_chung = await chayCronBangChung(env, bay_gio, viec);
    const canh_bao = await chayCronCanhBao(env, bay_gio, viec.canh_bao);
    const thong_bao = await chayCronThongBao(env, bay_gio, viec);
    const bao_cao = await chayCronBaoCao(env, bay_gio, viec);
    /*
     * Sao lưu chạy **sau cùng** và `chayCronSaoLuu` **không bao giờ ném** (mỗi lần gọi
     * R2 bọc `try/catch` riêng): một R2 hỏng không thể chặn việc nào xếp trước nó.
     * Ngày của khoá tính từ **mốc nhịp**, không từ `bay_gio` — xem `sao-luu.ts`.
     */
    const sao_luu = await chayCronSaoLuu(env, controller.scheduledTime, viec);
    return { ...bang_chung, canh_bao, thong_bao, bao_cao, sao_luu };
  } catch (err) {
    console.error(
      'Lỗi khi chạy cron, nhịp:',
      new Date(controller.scheduledTime).toISOString(),
      err,
    );
    throw err;
  }
}

/**
 * Worker export. **Không** `export default app` nữa: Worker giờ có cả `fetch` và
 * `scheduled`, và một `Hono` không mang được handler thứ hai.
 *
 * `fetch` chia đường **trước khi** Hono thấy request: `/v1/*` vào Hono, mọi đường
 * khác ra SPA. Chia ở đây, không bằng `app.notFound`, vì cổng xác thực là
 * `app.use('*', xacThuc)` — một đường như `/t/BAT-12` sẽ ăn **401** ở cổng đó và
 * không bao giờ tới `notFound`. Tức chủ tải lại trang ở giữa ứng dụng sẽ nhận một
 * cục JSON `INVALID_TOKEN`. Lý lẽ đầy đủ ở `phuc-vu-spa.ts`.
 */
function phucVuRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Response | Promise<Response> {
  return laDuongApi(new URL(request.url).pathname)
    ? app.fetch(request, env, ctx)
    : phucVuSpa(request, env);
}

/**
 * **Đăng ký đường phục vụ của chính Worker** cho việc kiểm một URL deploy trỏ vào
 * chính Baton (SPEC mục 7 d.207).
 *
 * Chạy khi nạp module, một lần. Lý lẽ đầy đủ — gồm nguyên nhân thật của lỗi "gọi
 * chính mình trả 404" ngày 13/10 và bốn hàng rào giữ nó khỏi thành cửa lách — ở
 * `tuyen-noi-bo.ts`. **Không** truyền `ctx`: một lần kiểm bằng chứng không được
 * dựng ra việc `waitUntil` nào.
 *
 * **KHÔNG phải `phucVuRequest`, và đó là điểm chính** (siết sau review 13/10):
 * nhánh SPA của `phucVuRequest` rơi về `index.html` cho **mọi** đường không khớp
 * file nào, nên đi qua nó thì một URL deploy trỏ tới **bất kỳ** đường nào trên host
 * Baton cũng nhận 200 — mở được cổng Xong mà không chứng minh gì. Đường nội bộ vì
 * vậy chỉ nhận mã từ **route thật**: `/v1/*` vào Hono, còn lại hỏi asset **đúng
 * đường** (`assetDungDuong`, không có bước rơi về `index.html`).
 */
datTuyenNoiBo(async (request, env) =>
  laDuongApi(new URL(request.url).pathname)
    ? await app.fetch(request, env)
    : await assetDungDuong(request, env),
);

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> =>
    phucVuRequest(request, env, ctx),

  /**
   * Trả `void` cho runtime, nhưng hàm trong nó trả số liệu để **test đọc được**:
   * `chayCron` là chỗ duy nhất test gọi, và một handler không trả gì thì ca test chỉ
   * còn cách đọc DB mò.
   */
  scheduled: async (
    controller: NhipCron,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> => {
    await chayCron(controller, env);
  },
};

/** **Chỉ test.** Gọi một lượt cron và lấy số liệu — xem `chayCron`. */
export { chayCron };

/**
 * Ứng dụng Hono trần, xuất riêng cho test gọi `app.fetch(request, env)` với một
 * `env` dựng tay (vd `CHO_DUONG_TEST: undefined`, tức hình dạng lúc deploy thật).
 * Export mặc định giờ là đối tượng Worker (có cả `scheduled`) nên không còn làm
 * được việc đó.
 */
export { app };
