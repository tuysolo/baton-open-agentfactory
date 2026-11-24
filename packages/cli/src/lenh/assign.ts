/**
 * `baton assign <MÃ> <agent> [--brief f.md] [--timeout 15] [--review]` — SPEC mục 13 d.368:
 * "Tạo lượt giao".
 *
 * `<MÃ>` là **mã ticket** `MÃ-số` → `ticketTheoMaHoacId`.
 *
 * **`<agent>` là tên HOẶC ID** (BAT-47, Chủ chốt T-55 = A, 22/10 —
 * `cau-hoi-spec.md` #171). `agentTheoTenHoacId` tra trên `GET /v1/agent` (đã lọc
 * theo phạm vi người gọi): khớp đúng 1 ⇒ gửi id của agent đó; khớp > 1 ⇒
 * `INVALID_INPUT` liệt kê các ID, **không** tạo lượt; khớp 0 ⇒ đầu vào đi lên
 * `nguoi_nhan_agent_id` như cũ, và "có tồn tại / có được vào dự án không" vẫn là
 * luật của server (`nguoiNhanBatBuoc`). Khi đó server trả `NOT_FOUND` thì CLI nói
 * lại bằng **một** thông điệp cố định chỉ chứa chữ người gõ — giống hệt nhau giữa
 * "tên không tồn tại" và "tên của agent người gọi không thấy", nên không lộ gì
 * về agent ngoài quyền.
 *
 * `--timeout 15` là **hạn phản hồi tính bằng phút** (mục 5 d.156: "Có thể đặt hạn
 * phản hồi (mặc định **15 phút**)" — cùng con số SPEC viết trong ví dụ của d.368).
 * CLI chỉ chặn thứ **không phải số phút nguyên**; cận trên và mặc định là luật của
 * `kiemHanPhanHoiPhut` ở `@baton/shared`, chạy ở cửa ghi — không chép bản thứ hai.
 *
 * **Loại lượt giao: `--review` ⇒ `review`, không cờ ⇒ `work`** (BAT-43, Chủ chốt
 * T-50 = A, 22/10 — `cau-hoi-spec.md` #168; bảng lệnh mục 13 đã thêm cờ). Không cờ
 * thì **không gửi** `loai_luot` — mặc định `work` là luật của `kiemLoaiLuotGiao` ở
 * `@baton/shared`, chạy ở cửa ghi, không chép bản thứ hai. Luật "lượt review chỉ
 * manager/coordinator tạo" (19.3) cũng ở server. CLI nói thẳng nó đã tạo lượt loại
 * gì trong dòng ra.
 */

import { batonFetch } from '@baton/client';
import { BatonError, nhan } from '@baton/shared';
import { docBriefMd } from '../brief-md.js';
import type { TaoLuotGiaoRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { agentTheoTenHoacId, ticketTheoMaHoacId } from '../tra-ma.js';

/** `--timeout` → số phút. Chỉ chữ số; cận trên để server kiểm. */
export function kiemTimeout(tho: string | undefined): number | undefined {
  if (tho === undefined) return undefined;
  if (!/^\d+$/.test(tho.trim())) {
    throw new BatonError('INVALID_INPUT', {
      message: `--timeout phải là số phút nguyên dương, nhận được "${tho}".`,
    });
  }
  return Number(tho.trim());
}

/**
 * Thông điệp khi không có agent nào ứng với `<agent>` — **chỉ** chứa chữ người
 * gõ, không chứa gì máy chủ biết, nên "không tồn tại" và "ngoài quyền" giống hệt.
 *
 * Chỉ gợi ý `GET /v1/agent`: màn hình Đội agent là màn hình **của chủ** (agent
 * gọi thì `FORBIDDEN`), và CLI chưa có lệnh liệt kê agent (BAT-48).
 */
export function thongDiepKhongThayAgent(agent_go: string): string {
  return (
    `Không tìm thấy agent "${agent_go}" (tên hoặc ID) trong các agent bạn được thấy. ` +
    'Xem danh sách bằng GET /v1/agent.'
  );
}

export const LENH_ASSIGN: LenhCli = {
  khai: {
    ten: 'assign',
    vi_tri: ['MÃ', 'agent'],
    co: { brief: 'gia_tri', timeout: 'gia_tri', review: 'bat' },
  },

  chay: async ({ cauHinh, docFile }, ts) => {
    const ma_ticket = ts.vi_tri[0] ?? '';
    const agent_go = ts.vi_tri[1] ?? '';
    const han_phan_hoi_phut = kiemTimeout(ts.gia_tri['timeout']);
    const duong_brief = ts.gia_tri['brief'];

    const brief = duong_brief === undefined ? {} : docBriefMd(await docFile(duong_brief));

    const ticket = await ticketTheoMaHoacId(cauHinh, ma_ticket);

    // Rỗng thì không tra: để server trả "Thiếu người nhận" như cũ.
    const nguoi_nhan = agent_go === '' ? null : await agentTheoTenHoacId(cauHinh, agent_go);

    let kq: TaoLuotGiaoRa;
    try {
      kq = await batonFetch<TaoLuotGiaoRa>(cauHinh, {
        method: 'POST',
        path: `/v1/ticket/${encodeURIComponent(ticket.id)}/luot-giao`,
        body: {
          nguoi_nhan_agent_id: nguoi_nhan?.id ?? agent_go,
          ...(ts.bat.has('review') ? { loai_luot: 'review' } : {}),
          ...(han_phan_hoi_phut === undefined ? {} : { han_phan_hoi_phut }),
          ...brief,
        },
      });
    } catch (e) {
      /*
       * Chỉ nói lại khi **chắc** `NOT_FOUND` là của người nhận: đầu vào không khớp
       * agent nào người gọi thấy, và ticket vừa đọc **chưa** bị xoá mềm (ticket đã
       * xoá thì đường đọc vẫn trả, còn cửa ghi trả `NOT_FOUND` "Không tìm thấy
       * ticket." — giữ nguyên thông điệp đó).
       */
      if (
        nguoi_nhan === null &&
        agent_go !== '' &&
        (ticket.xoa_luc ?? null) === null &&
        BatonError.la(e) &&
        e.ma === 'NOT_FOUND'
      ) {
        throw new BatonError('NOT_FOUND', { message: thongDiepKhongThayAgent(agent_go) });
      }
      throw e;
    }

    const ten_nhan =
      nguoi_nhan === null ? kq.nguoi_nhan_agent_id : `${kq.nguoi_nhan_agent_id} (${nguoi_nhan.ten})`;

    const dong: string[] = [
      `Đã giao ${ticket.ma} cho ${ten_nhan}: lượt ${kq.id} · #${String(kq.so_luot)}.`,
      `Loại lượt: ${nhan('loai_luot_giao', kq.loai)} (${kq.loai})`,
      `Trạng thái lượt: ${nhan('trang_thai_luot_giao', kq.trang_thai)} (${kq.trang_thai})`,
      `Trạng thái ticket: ${nhan('trang_thai_ticket', kq.ticket_trang_thai)} ` +
        `(${kq.ticket_trang_thai})`,
      kq.han_phan_hoi_luc === null
        ? 'Hạn phản hồi: không đặt'
        : `Hạn phản hồi lúc: ${new Date(kq.han_phan_hoi_luc).toISOString()}`,
      `Brief: ${Object.keys(brief).length === 0 ? '(không ghi đè trường nào; lấy từ ticket nếu có)' : `${String(Object.keys(brief).length)} trường từ "${String(duong_brief)}"`}`,
    ];

    return { json: kq, dong };
  },
};
