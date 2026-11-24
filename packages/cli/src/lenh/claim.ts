/**
 * `baton claim <lượt>` — SPEC mục 13 d.361: "Nhận lượt giao, mở phiên, in brief,
 * hồ sơ dự án và lỗi đã gặp".
 *
 * Năm vế, và chúng **không** cùng ở một chỗ:
 *   1. **Nhận lượt giao** — `POST /v1/luot-giao/:id/nhan`.
 *   2. **Mở phiên** — cùng lệnh đó mở (mục 6 d.180); id phiên về trong `phien_id`.
 *   3. **Brief** — 8 trường của mục 4, lấy từ `GET /v1/tasks` (lượt vừa nhận là
 *      `in_progress` của mình, nên nó có trong danh sách, kèm `brief`). Dùng
 *      `tasks` **trước** thay vì `GET /v1/ticket/:id/luot-giao` vì nó tốn một
 *      request và trả đúng lượt của mình, không cả chuỗi lượt của người khác.
 *
 *      **Có đường lui, và nó cần thật.** `luotGiaoCuaToi` có `LIMIT 200`
 *      (`api/src/doc-viec.ts`), nên một agent giữ hơn 200 lượt mở sẽ **không**
 *      thấy lượt vừa nhận trong `tasks`. Bản đầu của lượt 4 im lặng in "(brief
 *      trống)" ở ca đó — tức **giấu** một vế của d.361, ngược hẳn nếp
 *      `DONG_LOI_DA_GAP_CHUA_CO` ngay dưới đây. Nay: không thấy thì hỏi
 *      `GET /v1/ticket/:id/luot-giao` (cả chuỗi lượt của ticket, không giới hạn
 *      200 của riêng agent); vẫn không thấy thì **nói thẳng là không tra được**
 *      (`DONG_BRIEF_KHONG_TRA_DUOC` + `brief: null`), không bao giờ im.
 *   4. **Hồ sơ dự án** — `GET /v1/du-an/:id/ho-so` (mục 9 d.294–303), chín mục
 *      của d.296–298 cộng hai cờ của d.300. Chữ dựng ở `ho-so-md.ts`, **dùng
 *      chung** với `baton profile`: một agent đọc hồ sơ qua `claim` và một agent
 *      đọc qua `profile` phải thấy cùng một hồ sơ.
 *   5. **"Lỗi đã gặp"** — một mục **của hồ sơ dự án** (mục 9 d.299), nên nó về
 *      trong **cùng** lượt gọi ở vế 4, không một request thứ hai.
 */

import { batonFetch } from '@baton/client';
import { NHAN_TRUONG_BRIEF, TRUONG_BRIEF } from '@baton/shared';
import type {
  DuAnRa,
  HoSoRa,
  LuotGiaoDayDuRa,
  NhanLuotGiaoRa,
  TicketRa,
  ViecCuaToiRa,
} from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { dongHoSo, dongLoiDaGap } from '../ho-so-md.js';

/**
 * Dòng khi **cả hai** đường đọc brief đều không thấy lượt vừa nhận. Lượt **đã
 * nhận thành công** rồi, nên đây không phải lỗi — nhưng vế "in brief" của d.361
 * không làm được, và CLI phải nói ra.
 */
export const DONG_BRIEF_KHONG_TRA_DUOC =
  '  (KHÔNG tra được brief: lượt vừa nhận không có trong /v1/tasks lẫn chuỗi lượt của ticket)';

export const LENH_CLAIM: LenhCli = {
  khai: { ten: 'claim', vi_tri: ['lượt'], co: {} },

  chay: async ({ cauHinh }, ts) => {
    const luot_id = ts.vi_tri[0] ?? '';

    const nhan_ve = await batonFetch<NhanLuotGiaoRa>(cauHinh, {
      method: 'POST',
      path: `/v1/luot-giao/${encodeURIComponent(luot_id)}/nhan`,
    });

    const viec = await batonFetch<ViecCuaToiRa>(cauHinh, { method: 'GET', path: '/v1/tasks' });
    let luot: LuotGiaoDayDuRa | null = viec.luot_giao.find((l) => l.id === nhan_ve.id) ?? null;

    // Đường lui của `LIMIT 200` — xem khối chú thích đầu file.
    if (luot === null) {
      const chuoi = await batonFetch<{ ticket_id: string; items: LuotGiaoDayDuRa[] }>(cauHinh, {
        method: 'GET',
        path: `/v1/ticket/${encodeURIComponent(nhan_ve.ticket_id)}/luot-giao`,
      });
      luot = chuoi.items.find((l) => l.id === nhan_ve.id) ?? null;
    }

    const ticket = await batonFetch<TicketRa>(cauHinh, {
      method: 'GET',
      path: `/v1/ticket/${encodeURIComponent(nhan_ve.ticket_id)}`,
    });
    const du_an = await batonFetch<DuAnRa>(cauHinh, {
      method: 'GET',
      path: `/v1/du-an/${encodeURIComponent(ticket.project_id)}`,
    });
    /*
     * **Hồ sơ dự án và "Lỗi đã gặp"** — hai vế cuối của d.361, và từ lượt này
     * chúng có đường thật (mục 9 d.294–303). Một lượt gọi mang **cả hai**: "Lỗi
     * đã gặp" là một mục *của* hồ sơ (d.299), không một tài nguyên rời.
     */
    const ho_so = await batonFetch<HoSoRa>(cauHinh, {
      method: 'GET',
      path: `/v1/du-an/${encodeURIComponent(ticket.project_id)}/ho-so`,
    });

    const dong: string[] = [
      `Đã nhận lượt ${nhan_ve.id} — ${nhan_ve.trang_thai}.`,
      `Phiên đã mở: ${nhan_ve.phien_id}`,
      `Ticket: ${ticket.ma} — ${ticket.tieu_de}`,
    ];
    if (nhan_ve.qua_han_phan_hoi) {
      // Mục 5: quá hạn phản hồi **không** chặn nhận, chỉ là một lời khai.
      dong.push('Lưu ý: lượt này đã quá hạn phản hồi (vẫn nhận được).');
    }

    dong.push('', 'Brief:');
    if (luot === null) {
      // **Không tra được** khác hẳn **trống** — hai câu khác nhau, không gộp.
      dong.push(DONG_BRIEF_KHONG_TRA_DUOC);
    } else {
      let co_brief = false;
      for (const t of TRUONG_BRIEF) {
        const v = luot.brief[t];
        if (v === null || v === undefined || v === '') continue;
        co_brief = true;
        dong.push(`  ${NHAN_TRUONG_BRIEF[t]}: ${v}`);
      }
      if (!co_brief) dong.push('  (brief trống)');
    }

    dong.push(
      '',
      `Dự án: ${du_an.ma} — ${du_an.ten}`,
      `  Trạng thái: ${du_an.nhan_trang_thai} (${du_an.trang_thai})`,
      // Hồ sơ (d.296–300) và "Lỗi đã gặp" (d.299) — thụt vào dưới mục Dự án.
      ...dongHoSo(ho_so, '  '),
      ...dongLoiDaGap(ho_so.loi_da_gap, '  '),
    );

    return {
      json: {
        ...nhan_ve,
        ticket,
        brief: luot === null ? null : luot.brief,
        du_an,
        ho_so,
        loi_da_gap: ho_so.loi_da_gap,
      },
      dong,
    };
  },
};
