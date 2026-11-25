/**
 * **Sao lưu tự động hằng ngày lên R2, giữ 14 bản** — SPEC mục 15 d.429, 19.12 câu 7
 * ("đặt ở nơi lưu trữ khác DB chính (R2)"; "v0.1 không có nút phục hồi"). BAT-8.
 *
 * ## Mốc: 02:00 giờ chủ = 19:00 UTC, cửa sổ 60 phút
 *
 * SPEC chỉ nói "hằng ngày", không nói giờ (`spec-questions.md`). 02:00 giờ chủ: ngoài
 * giờ làm, xa hai mốc báo cáo (07:30, 20:00), và **trước** báo cáo sáng — nên báo
 * cáo sáng nói được "bản sao lưu đêm qua có chưa". Không thêm cron mới (giới hạn 5
 * cron/tài khoản — khối chú thích `[triggers]` của `wrangler.toml`): đây là một ô
 * `sao_luu` của `viecCuaCron`, bật trong cửa sổ `[19:00, 19:00 + 60 phút]` UTC — cùng
 * nếp chịu nhịp **trễ** và **lặp** của `cron-bao-cao.ts`.
 *
 * ## Idempotent
 *
 * Trong cửa sổ, mỗi nhịp hỏi R2 `head(khoá của ngày)` trước — **rẻ**, không đọc D1.
 * Đã có ⇒ không làm gì. Nên nhịp lặp hay 60 nhịp trong cửa sổ vẫn ra **đúng một**
 * object mỗi ngày. Hai nhịp chồng nhau có thể cùng thấy "chưa có" và cùng `put` —
 * cùng khoá, nên kết quả vẫn là một object (bản sau đè bản trước, cùng ngày).
 *
 * ## Xoay vòng: giữ 14 bản MỚI NHẤT
 *
 * **Chỉ sau một lần `put` thành công**: `list` tiền tố `sao-luu/`, lọc đúng mẫu tên
 * `sao-luu/baton-YYYY-MM-DD.json` (`MAU_KHOA_SAO_LUU`), xếp theo tên (ngày ISO ⇒
 * xếp chữ = xếp ngày), giữ 14 bản cuối, xoá phần cũ hơn. Object **không** khớp mẫu
 * (ai đó tự để vào bucket) **không bao giờ** bị đụng. `put` lỗi ⇒ **không xoá gì**:
 * xoá bản cũ khi bản mới chưa có là đúng cách để còn 13 bản rồi 12…
 *
 * ## Lỗi R2 không làm hỏng cron
 *
 * Mọi lần gọi R2 bọc `try/catch` riêng; lỗi thành `console.error` + `loi` trong kết
 * quả, **không ném**. `chayCron` gọi việc này **sau cùng**, nên kể cả một lỗi lọt
 * ra cũng không chặn việc nào xếp trước.
 *
 * ## Workspace nào
 *
 * Khoá không mang `workspace_id` (`sao-luu/baton-<ngày>.json`, đúng brief) nên một
 * ngày có **một** object, của **workspace duy nhất** mà v0.1 có (mục 1 — cùng phép
 * `workspaceDuyNhat` mà đăng nhập của chủ dùng). Nhiều workspace là việc của mục 18;
 * ghi ở `spec-questions.md`.
 */

import { BatonError, MUI_GIO_CHU_PHUT, ngayDiaPhuong, type AiGoi } from '@baton/shared';
import type { Env } from './moi-truong.js';
import { locChuoiAnToan } from './loc-chuoi.js';
import { phutUtcCuaGioChu, trongCuaSoTuMoc } from './moc-cron.js';
import { workspaceDuyNhat } from './xac-thuc.js';
import { dungBanXuat } from './xuat-du-lieu.js';

/** Giờ **trên tường của chủ** chạy sao lưu — 02:00. */
export const GIO_CHU_SAO_LUU = 2;

/** **Phút trong ngày UTC** của nhịp sao lưu — 02:00 giờ chủ ⇒ 1140 = 19:00 UTC. */
export const PHUT_UTC_SAO_LUU = phutUtcCuaGioChu(GIO_CHU_SAO_LUU, 0);

/** Trễ tối đa còn chấp nhận, phút — cùng con số và cùng lý lẽ `TRE_TOI_DA_PHUT`. */
export const TRE_SAO_LUU_PHUT = 60;

/** Số bản giữ lại — d.429 "giữ 14 bản". */
export const SO_BAN_GIU = 14;

/** Tiền tố khoá trên R2. */
export const TIEN_TO_SAO_LUU = 'sao-luu/';

/** Mẫu tên **của chính Baton** — chỉ object khớp mẫu này mới bị xoay vòng. */
export const MAU_KHOA_SAO_LUU = /^sao-luu\/baton-\d{4}-\d{2}-\d{2}\.json$/;

/** Khoá object của một ngày (giờ chủ). */
export function khoaSaoLuu(ngay: string): string {
  return `${TIEN_TO_SAO_LUU}baton-${ngay}.json`;
}

/** Nhịp này có nằm trong cửa sổ sao lưu không — ô `sao_luu` của `viecCuaCron`. */
export function laNhipSaoLuu(moc_nhip: number): boolean {
  return trongCuaSoTuMoc(moc_nhip, PHUT_UTC_SAO_LUU, TRE_SAO_LUU_PHUT);
}

/**
 * **Ngày (giờ chủ) của lượt sao lưu gần nhất mà cửa sổ đã ĐÓNG trước `bay_gio`** —
 * tức bản đáng lẽ đã phải có.
 *
 * Lượt của ngày D chạy từ D 02:00 tới D 03:00 giờ chủ. Lùi `bay_gio` đúng 3 giờ rồi
 * lấy ngày: 07:30 hay 20:00 ngày 16 ⇒ ngày 16 (bản đêm qua); 02:30 ngày 16 (cửa sổ
 * còn mở) ⇒ ngày 15.
 */
export function ngaySaoLuuGanNhat(bay_gio: number): string {
  return ngayDiaPhuong(bay_gio - (GIO_CHU_SAO_LUU * 60 + TRE_SAO_LUU_PHUT) * 60_000, MUI_GIO_CHU_PHUT);
}

/** Lời của dòng cảnh báo trong báo cáo — xuất ra để test so đúng chữ. */
export const CAU_SAO_LUU = {
  thieu: (ngay: string): string => `⚠️ Sao lưu ${ngay} chưa có (bản sao lưu tự động không thấy trên R2).`,
  loi: (ngay: string): string => `⚠️ Sao lưu ${ngay}: không kiểm được — R2 lỗi.`,
  chua_bat: '⚠️ Sao lưu tự động chưa bật (chưa gắn R2 `SAO_LUU`).',
} as const;

/**
 * **Dòng cảnh báo sao lưu cho báo cáo sáng/tối**, hoặc `null` khi bản gần nhất có.
 *
 * **Không bao giờ ném**: một R2 hỏng phải thành **chính dòng cảnh báo**, không thành
 * một báo cáo không sinh được.
 *
 * Thiếu binding ⇒ **có** một dòng (chọn hướng an toàn): một Baton không gắn R2 là một
 * Baton **không có bản sao lưu nào**, và đó đúng là điều chủ phải biết mỗi sáng.
 */
export async function canhBaoSaoLuu(env: Env, bay_gio: number): Promise<string | null> {
  const r2 = env.SAO_LUU;
  if (r2 === undefined) return CAU_SAO_LUU.chua_bat;
  const ngay = ngaySaoLuuGanNhat(bay_gio);
  try {
    const co = await r2.head(khoaSaoLuu(ngay));
    return co === null ? CAU_SAO_LUU.thieu(ngay) : null;
  } catch (e) {
    console.error('Sao lưu: không kiểm được bản gần nhất trên R2.', locChuoiAnToan(String(e)));
    return CAU_SAO_LUU.loi(ngay);
  }
}

/** Chặng nào của R2 (hoặc của chặng đọc) đã lỗi — chỉ mã, không thông điệp thô. */
export type ChangLoiSaoLuu = 'head' | 'doc' | 'put' | 'list' | 'delete';

export interface KetQuaCronSaoLuu {
  /** Nhịp này có phải nhịp sao lưu không. */
  chay: boolean;
  /** Không có binding `SAO_LUU` — bỏ qua, không lỗi. */
  thieu_binding: boolean;
  khoa: string | null;
  /** Vừa ghi một object mới. */
  da_ghi: boolean;
  /** Ngày đó đã có object — không ghi lại. */
  da_co: boolean;
  /** Số object cũ vừa xoá khi xoay vòng. */
  so_xoa: number;
  loi: ChangLoiSaoLuu | null;
}

export const CRON_SAO_LUU_RONG: KetQuaCronSaoLuu = {
  chay: false,
  thieu_binding: false,
  khoa: null,
  da_ghi: false,
  da_co: false,
  so_xoa: 0,
  loi: null,
};

/** Mọi khoá dưới tiền tố, đi hết các trang của `list`. */
async function moiKhoa(r2: R2Bucket): Promise<string[]> {
  const ra: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const trang = await r2.list({ prefix: TIEN_TO_SAO_LUU, ...(cursor === undefined ? {} : { cursor }) });
    for (const o of trang.objects) ra.push(o.key);
    if (!trang.truncated) return ra;
    cursor = trang.cursor;
  }
}

/**
 * **Khoá cần xoá** để còn đúng `giu` bản mới nhất — hàm thuần, có test riêng. Chỉ
 * xét khoá khớp `MAU_KHOA_SAO_LUU`; khoá lạ không bao giờ vào danh sách xoá.
 */
export function khoaCanXoa(khoa: readonly string[], giu = SO_BAN_GIU): string[] {
  const cua_minh = khoa.filter((k) => MAU_KHOA_SAO_LUU.test(k)).sort();
  return cua_minh.slice(0, Math.max(0, cua_minh.length - giu));
}

function ghiLoi(chang: ChangLoiSaoLuu, e: unknown): void {
  console.error(`Sao lưu: chặng ${chang} lỗi.`, locChuoiAnToan(String(e)));
}

/**
 * Một lượt sao lưu. `moc_nhip` = `controller.scheduledTime` — ngày của khoá tính từ
 * **mốc nhịp**, không từ đồng hồ lúc chạy, để một nhịp trễ vẫn ghi đúng ngày của nó.
 *
 * Không bao giờ ném — xem khối đầu file.
 */
export async function chayCronSaoLuu(
  env: Env,
  moc_nhip: number,
  viec: { sao_luu: boolean },
): Promise<KetQuaCronSaoLuu> {
  if (!viec.sao_luu) return CRON_SAO_LUU_RONG;
  const r2 = env.SAO_LUU;
  if (r2 === undefined) {
    console.warn('Sao lưu: chưa gắn R2 `SAO_LUU` — bỏ qua nhịp sao lưu.');
    return { ...CRON_SAO_LUU_RONG, chay: true, thieu_binding: true };
  }

  const khoa = khoaSaoLuu(ngayDiaPhuong(moc_nhip));
  const kq: KetQuaCronSaoLuu = { ...CRON_SAO_LUU_RONG, chay: true, khoa };

  // 1. Đã có bản của ngày này chưa — chặn sớm, rẻ.
  try {
    if ((await r2.head(khoa)) !== null) return { ...kq, da_co: true };
  } catch (e) {
    ghiLoi('head', e);
    return { ...kq, loi: 'head' };
  }

  // 2. Dựng bản xuất — cùng hàm với `GET /v1/xuat`.
  let than: string;
  try {
    const ws = await workspaceDuyNhat(env.DB);
    than = JSON.stringify(await dungBanXuat(env.DB, ws, Date.now()));
  } catch (e) {
    ghiLoi('doc', e);
    return { ...kq, loi: 'doc' };
  }

  // 3. Ghi. Lỗi ⇒ dừng ở đây, **không xoá gì**.
  try {
    await r2.put(khoa, than, { httpMetadata: { contentType: 'application/json' } });
  } catch (e) {
    ghiLoi('put', e);
    return { ...kq, loi: 'put' };
  }
  kq.da_ghi = true;

  // 4. Xoay vòng — chỉ sau khi ghi thành công.
  let xoa: string[];
  try {
    xoa = khoaCanXoa(await moiKhoa(r2));
  } catch (e) {
    ghiLoi('list', e);
    return { ...kq, loi: 'list' };
  }
  if (xoa.length > 0) {
    try {
      await r2.delete(xoa);
      kq.so_xoa = xoa.length;
    } catch (e) {
      ghiLoi('delete', e);
      return { ...kq, loi: 'delete' };
    }
  }
  return kq;
}

/* ================================================================== *
 * Liệt kê và tải bản sao lưu — SPEC 19.12 câu 7, mục 15 d.429 (BAT-10)
 * ================================================================== */

/** Một bản sao lưu trong danh sách của Cài đặt. */
export interface BanSaoLuu {
  /** `YYYY-MM-DD` — ngày của khoá. */
  ngay: string;
  khoa: string;
  /** Byte. */
  kich_thuoc: number;
  /** Lúc object được ghi lên R2, epoch mili-giây. */
  tao_luc: number;
}

export interface DanhSachSaoLuu {
  /** `false` ⇒ chưa gắn R2 `SAO_LUU`: sao lưu tự động chưa bật. */
  bat: boolean;
  items: BanSaoLuu[];
}

const MAU_NGAY_SAO_LUU = /^\d{4}-\d{2}-\d{2}$/;

function chiChu(ai: AiGoi): void {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: 'Bản sao lưu chỉ dành cho chủ (SPEC mục 15).' });
  }
}

/**
 * `GET /v1/sao-luu` — **chỉ chủ** (cổng nằm trong hàm). Tối đa `SO_BAN_GIU` bản mới
 * nhất, chỉ khoá khớp `MAU_KHOA_SAO_LUU`. Thiếu binding ⇒ `{ bat: false }`, không lỗi.
 * R2 lỗi ⇒ `INTERNAL` (thông điệp chuẩn, không lộ chữ lỗi thô; chi tiết vào log).
 */
export async function lietKeSaoLuu(r2: R2Bucket | undefined, ai: AiGoi): Promise<DanhSachSaoLuu> {
  chiChu(ai);
  if (r2 === undefined) return { bat: false, items: [] };

  const ra: BanSaoLuu[] = [];
  try {
    let cursor: string | undefined;
    for (;;) {
      const trang = await r2.list({
        prefix: TIEN_TO_SAO_LUU,
        ...(cursor === undefined ? {} : { cursor }),
      });
      for (const o of trang.objects) {
        if (!MAU_KHOA_SAO_LUU.test(o.key)) continue;
        ra.push({
          ngay: o.key.slice(TIEN_TO_SAO_LUU.length + 'baton-'.length, -'.json'.length),
          khoa: o.key,
          kich_thuoc: o.size,
          tao_luc: o.uploaded.getTime(),
        });
      }
      if (!trang.truncated) break;
      cursor = trang.cursor;
    }
  } catch (e) {
    ghiLoi('list', e);
    throw new BatonError('INTERNAL');
  }
  ra.sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : 0));
  return { bat: true, items: ra.slice(0, SO_BAN_GIU) };
}

/**
 * `GET /v1/sao-luu/<ngay>` — **chỉ chủ**. `ngay` phải đúng `\d{4}-\d{2}-\d{2}` (chặn
 * path traversal: khoá R2 chỉ dựng từ `khoaSaoLuu(ngay)` đã qua mẫu). Sai dạng ⇒
 * `INVALID_INPUT`; không có bản ⇒ `NOT_FOUND`; thiếu binding ⇒ `NOT_FOUND` kèm câu
 * "chưa bật" (không phải lỗi máy chủ).
 */
export async function taiSaoLuu(
  r2: R2Bucket | undefined,
  ai: AiGoi,
  ngay: string,
): Promise<{ noi_dung: string; ten_file: string }> {
  chiChu(ai);
  if (!MAU_NGAY_SAO_LUU.test(ngay)) {
    throw new BatonError('INVALID_INPUT', { message: 'Ngày phải có dạng YYYY-MM-DD.' });
  }
  if (r2 === undefined) {
    throw new BatonError('NOT_FOUND', { message: 'Sao lưu tự động chưa bật.' });
  }
  let noi_dung: string | null;
  try {
    const o = await r2.get(khoaSaoLuu(ngay));
    noi_dung = o === null ? null : await o.text();
  } catch (e) {
    ghiLoi('doc', e);
    throw new BatonError('INTERNAL');
  }
  if (noi_dung === null) {
    throw new BatonError('NOT_FOUND', { message: `Không có bản sao lưu ngày ${ngay}.` });
  }
  return { noi_dung, ten_file: `baton-${ngay}.json` };
}
