/**
 * **Công tắc từng loại thông báo** — SPEC mục 12 d.348 ("Tắt từng loại trong Cài
 * đặt"), BAT-16, migration 0026 (bảng `cai_dat_thong_bao`).
 *
 * Ba thứ ở đây:
 *   * `congTacDangTat` — tập công tắc **đang tắt** của một workspace (cron gửi và
 *     cửa ghi cùng đọc);
 *   * `docCaiDatThongBao` — `GET /v1/cai-dat/thong-bao`, **chỉ chủ**;
 *   * `handlerDatCongTacThongBao` — lệnh ghi `dat_cong_tac_thong_bao`, **chỉ chủ**,
 *     đi qua cửa ghi như mọi lệnh ghi khác (`BanDoLenh`).
 *
 * **Không có dòng = BẬT.** Mặc định tất cả bật, và một workspace chưa từng mở
 * trang Cài đặt có hành vi y hệt trước BAT-16.
 *
 * **Tin bảo mật tài khoản không tắt được:** lệnh trả `FORBIDDEN` khi cố tắt, và
 * CHECK của bảng không nhận mã `bao_mat_tai_khoan` (không có chỗ để ghi nó).
 */

import {
  BatonError,
  CONG_TAC_BAO_MAT,
  CONG_TAC_THONG_BAO,
  LY_DO_KHOA_BAO_MAT,
  NHAN_CONG_TAC,
  laCongTacThongBao,
  type AiGoi,
  type MaCongTac,
} from '@baton/shared';
import { batBuocLaChu, type BoiCanhLenh, type KetQuaHandler, type LenhChung } from './lenh-khung.js';

/** Các công tắc **đang tắt** (`bat = 0`) của một workspace. */
export async function congTacDangTat(db: D1Database, workspace_id: string): Promise<Set<string>> {
  const { results } = await db
    .prepare('SELECT cong_tac FROM cai_dat_thong_bao WHERE workspace_id = ? AND bat = 0')
    .bind(workspace_id)
    .all<{ cong_tac: string }>();
  return new Set(results.map((r) => r.cong_tac));
}

/** Một công tắc như trang Cài đặt cần. */
export interface CongTacRa {
  cong_tac: MaCongTac;
  /** Nhãn tiếng Việt (mục 0.1). */
  nhan: string;
  bat: boolean;
  /** `true` = không tắt được (tin bảo mật tài khoản). */
  khoa: boolean;
  /** Câu giải thích khi `khoa`; `null` khi không. */
  ly_do_khoa: string | null;
}

/**
 * `GET /v1/cai-dat/thong-bao` — mọi công tắc, đúng thứ tự hiện, công tắc bảo mật
 * (khoá) đứng cuối.
 *
 * **Chỉ chủ**: agent nhận `FORBIDDEN` (hướng an toàn — cài đặt thông báo là việc
 * riêng của chủ, không agent nào cần đọc).
 */
export async function docCaiDatThongBao(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
): Promise<{ items: CongTacRa[] }> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: 'Chỉ chủ xem được cài đặt thông báo.' });
  }
  const tat = await congTacDangTat(db, workspace_id);
  const items: CongTacRa[] = CONG_TAC_THONG_BAO.map((m) => ({
    cong_tac: m,
    nhan: NHAN_CONG_TAC[m],
    bat: !tat.has(m),
    khoa: false,
    ly_do_khoa: null,
  }));
  items.push({
    cong_tac: CONG_TAC_BAO_MAT,
    nhan: NHAN_CONG_TAC[CONG_TAC_BAO_MAT],
    bat: true,
    khoa: true,
    ly_do_khoa: LY_DO_KHOA_BAO_MAT,
  });
  return { items };
}

export interface LenhDatCongTacThongBao extends LenhChung {
  loai: 'dat_cong_tac_thong_bao';
  cong_tac?: unknown;
  bat?: unknown;
}

export interface KetQuaDatCongTacThongBao {
  cong_tac: MaCongTac;
  bat: boolean;
}

/**
 * Bật/tắt **một** công tắc. `INSERT … ON CONFLICT DO UPDATE` (nếp `sua_luat_chung`):
 * một câu, không đọc-rồi-ghi.
 *
 * Thứ tự kiểm: **chủ** trước (agent luôn `FORBIDDEN`, kể cả với mã rác — không
 * kênh dò nào), rồi hình dạng, rồi luật "tin bảo mật không tắt được".
 */
export function handlerDatCongTacThongBao(
  lenh: LenhDatCongTacThongBao,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaDatCongTacThongBao>> {
  batBuocLaChu(lenh.ai, 'đổi được cài đặt thông báo');

  if (typeof lenh.bat !== 'boolean') {
    throw new BatonError('INVALID_INPUT', { message: 'Trường "bat" phải là true hoặc false.' });
  }
  const bat = lenh.bat;

  if (lenh.cong_tac === CONG_TAC_BAO_MAT) {
    if (!bat) {
      throw new BatonError('FORBIDDEN', {
        message:
          'Không tắt được tin bảo mật tài khoản: đổi mật khẩu, đăng xuất mọi nơi, đặt lại mã ' +
          'xác thực và nhập sai liên tiếp luôn được gửi.',
      });
    }
    // Bật một công tắc vốn luôn bật: không có gì để ghi.
    return Promise.resolve({ cau_lenh: [], ket_qua: { cong_tac: CONG_TAC_BAO_MAT, bat: true } });
  }

  if (!laCongTacThongBao(lenh.cong_tac)) {
    throw new BatonError('INVALID_INPUT', { message: 'Không có loại thông báo này.' });
  }
  const cong_tac = lenh.cong_tac;

  return Promise.resolve({
    cau_lenh: [
      db
        .prepare(
          `INSERT INTO cai_dat_thong_bao (workspace_id, cong_tac, bat, cap_nhat_luc)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (workspace_id, cong_tac)
             DO UPDATE SET bat = excluded.bat, cap_nhat_luc = excluded.cap_nhat_luc`,
        )
        .bind(lenh.workspace_id, cong_tac, bat ? 1 : 0, bay_gio),
    ],
    ket_qua: { cong_tac, bat },
  });
}
