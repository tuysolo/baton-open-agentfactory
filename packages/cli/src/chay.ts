/**
 * Đường chạy của CLI: tham số → lệnh → API → in → **mã thoát**.
 *
 * Mã thoát — SPEC mục 13 d.380 ("0 là xong; 1 là lỗi nghiệp vụ (in mã lỗi); 2 là
 * lỗi xác thực hoặc mạng; 3 là nhận tín hiệu `STOP`") + 19.9 d.543 ("Bảng mã
 * thoát ở mục 13 được bổ sung: 4 = hết thời gian chờ").
 *
 * Mã **3** đã có đường thật **từ lượt 4**: `baton tasks` và `baton heartbeat` đọc
 * trường `tin_hieu` của thân phản hồi, và `STOP` trong đó thành mã 3 (xem
 * `tin-hieu.ts`). Nó **không** đi đường ngoại lệ — `STOP` không phải lỗi, lệnh
 * vẫn in đủ kết quả — nên nó về qua `DuLieuRa.ma_thoat`.
 *
 * Mã **4** có đường thật **từ lượt 6**: 19.9 d.543 gắn nó vào đúng một lệnh,
 * `baton result --wait`, và đúng một điều kiện — chờ hết giờ mà mục Cần Chủ vẫn
 * chưa rời `open` (xem `lenh/result.ts`). Nó cũng về qua `DuLieuRa.ma_thoat`,
 * cùng đường với mã 3: hết giờ chờ **không phải lỗi**, lệnh vẫn in đủ trạng thái
 * của mục.
 *
 * Hai lệnh chờ khác **không** ra mã 4, và đó là chủ ý:
 *   * `baton tasks --wait` hết giờ → `het_gio: true` và mã **0**, vì "không có
 *     việc mới" là một câu trả lời đúng của mô hình kéo việc (d.352).
 *   * `baton evidence` hết 10 giây mà xác minh còn `pending` → mã **0** (mục 7
 *     d.220, `spec-questions.md` #87).
 *
 * Hàm này **không ném**: mọi ngoại lệ thành một dòng lỗi + một mã thoát.
 */

import { BatonError, MA_THOAT, type MaThoat } from '@baton/shared';
import { inKetQua, inLoi } from './in-ra.js';
import { doiNgoaiLe } from './loi-cli.js';
import {
  docCauHinh,
  docFileChu,
  ghiFileChu,
  luotTuMoiTruong,
  type MoiTruongCli,
} from './moi-truong.js';
import { cachDung, phanTich } from './phan-tich.js';
import { SO_LENH } from './lenh.js';

export function dongTroGiup(): string[] {
  return [
    'baton — nói chuyện với Baton từ dòng lệnh (SPEC mục 13).',
    `Lệnh: ${Object.keys(SO_LENH).sort().join(', ')}`,
    'Mọi lệnh có --json. Biến môi trường: BATON_URL, BATON_TOKEN.',
    // BAT-56 (#83): agent chạy nhiều lượt song song chọn phiên bằng cờ hoặc biến.
    'heartbeat, log, plan: nhiều phiên mở thì chỉ rõ lượt bằng --luot <lượt> hoặc biến BATON_LUOT (cờ thắng biến).',
    'cancel <lượt> --reason "<lý do>": người giao (hoặc chủ) huỷ một lượt giao.',
    // BAT-8 — lệnh duy nhất **không** dành cho agent; nói thẳng ở trợ giúp chung.
    'export <file>: xuất toàn bộ dữ liệu ra JSON — chỉ chạy được với TOKEN_CHU làm BATON_TOKEN.',
  ];
}

export async function chayCli(doi_so: readonly string[], mt: MoiTruongCli): Promise<MaThoat> {
  /*
   * `--json` được đọc **trước** khi biết lệnh nào: một lỗi xảy ra trước lúc phân
   * tích xong (vd tên lệnh lạ) vẫn phải ra JSON nếu người gọi xin JSON — nếu
   * không, vòng lặp của agent gặp một dòng chữ ở chỗ nó chờ JSON.
   */
  const xin_json = doi_so.includes('--json');

  /*
   * `--help` được nhận ở **mọi vị trí**, không chỉ ở đầu. Bản đầu chỉ xét
   * `doi_so[0]`, nên `baton show --help` ra `INVALID_INPUT` (mã thoát 1) — không
   * ai gõ `--help` để mong một lỗi. SPEC im lặng chỗ này; chọn hướng **lành**.
   *
   * Hệ quả đã biết, nhận cho rõ: một lệnh ghi ở lượt sau nhận nội dung tự do
   * (`baton comment <MÃ> "..."`) sẽ không truyền được đúng chữ `--help` làm nội
   * dung. Bộ phân tích vốn đã coi **mọi** `--x` là tuỳ chọn, nên đó là nếp cũ của
   * nó, không phải một ràng buộc mới của dòng này.
   */
  const xin_giup = doi_so.includes('--help') || doi_so.includes('-h');

  try {
    const ten = doi_so[0];
    const lenh = ten === undefined ? undefined : SO_LENH[ten];

    // Không có tên lệnh, hoặc xin trợ giúp mà tên lệnh không nhận ra → trợ giúp chung.
    if (ten === undefined || (xin_giup && lenh === undefined)) {
      inKetQua(mt, { json: { lenh: Object.keys(SO_LENH).sort() }, dong: dongTroGiup() }, xin_json);
      return MA_THOAT.xong;
    }

    if (lenh === undefined) {
      throw new BatonError('INVALID_INPUT', {
        message: `Không có lệnh "${ten}". Lệnh đang có: ${Object.keys(SO_LENH).sort().join(', ')}.`,
      });
    }

    // `baton <lệnh> --help` → cách dùng của **chính lệnh đó**, không phải bảng chung.
    if (xin_giup) {
      const cach = cachDung(lenh.khai);
      inKetQua(mt, { json: { lenh: lenh.khai.ten, cach_dung: cach }, dong: [cach] }, xin_json);
      return MA_THOAT.xong;
    }

    const ts = phanTich(lenh.khai, doi_so.slice(1));
    const cauHinh = docCauHinh(mt);
    const kq = await lenh.chay(
      {
        cauHinh,
        docFile: async (duong) => await docFileChu(mt, duong),
        ghiFile: async (duong, noi_dung) => await ghiFileChu(mt, duong, noi_dung),
        // `undefined` khi môi trường không có `git` — không lệnh nào trượt vì
        // thiếu nó (xem `git-cuc-bo.ts`).
        chayGit: mt.chayGit,
        // BAT-56: lượt mặc định của `heartbeat`/`log`/`plan` (cờ `--luot` thắng).
        luotMacDinh: luotTuMoiTruong(mt),
      },
      ts,
    );
    inKetQua(mt, kq, ts.json);
    return kq.ma_thoat ?? MA_THOAT.xong;
  } catch (e: unknown) {
    const { dong, ma_thoat } = doiNgoaiLe(e);
    inLoi(mt, dong, BatonError.la(e) ? e.ma : null, xin_json);
    return ma_thoat;
  }
}
