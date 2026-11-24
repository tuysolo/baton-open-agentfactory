/**
 * `baton profile <DỰ ÁN>` — SPEC mục 13 d.378: "In hồ sơ dự án".
 *
 * **Hồ sơ thật, từ `GET /v1/du-an/:id/ho-so`** (mục 9 d.294–303). Trước lượt này
 * lệnh in một dòng "API chưa có hồ sơ dự án" vì tầng API chưa có bảng nào; nay có,
 * nên dòng đó đi khỏi đây.
 *
 * Lệnh in cả **"Lỗi đã gặp"** (d.299) và **"Luật chung"** của workspace (d.301
 * "Agent đọc được qua CLI hoặc MCP") — đúng điều d.294 hứa: *"Agent mới vào dự án
 * **chỉ cần đọc trang này**"*. Nếu Luật chung phải gõ một lệnh thứ hai thì câu đó
 * không đúng nữa.
 *
 * **Ba request, không một.** Hồ sơ đã mang hai cờ của d.300, tên và mã dự án,
 * nhưng vẫn cần `duAnTheoMa` để đổi **mã người gõ** thành id (đường hồ sơ nhận
 * id), và Luật chung là một tài nguyên của workspace, không của dự án.
 */

import { batonFetch } from '@baton/client';
import type { HoSoRa, LuatChungRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { dongHoSo, dongLoiDaGap, dongLuatChung } from '../ho-so-md.js';
import { duAnTheoMa } from '../tra-ma.js';

export const LENH_PROFILE: LenhCli = {
  khai: { ten: 'profile', vi_tri: ['DỰ ÁN'], co: {} },

  chay: async ({ cauHinh }, ts) => {
    const d = await duAnTheoMa(cauHinh, ts.vi_tri[0] ?? '');

    /*
     * **Nối tiếp, không `Promise.all`** — cùng lý do đã ghi ở `whoami.ts`:
     * `Promise.all` bỏ rơi lượt gọi còn lại khi một lượt ném, và một request
     * không ai đọc kết quả vẫn chạm D1 sau khi lệnh đã kết thúc.
     */
    const ho_so = await batonFetch<HoSoRa>(cauHinh, {
      method: 'GET',
      path: `/v1/du-an/${encodeURIComponent(d.id)}/ho-so`,
    });
    const luat_chung = await batonFetch<LuatChungRa>(cauHinh, {
      method: 'GET',
      path: '/v1/luat-chung',
    });

    const dong: string[] = [
      `${d.ma} — ${d.ten}`,
      `Trạng thái: ${d.nhan_trang_thai} (${d.trang_thai})`,
      `Nhóm: ${d.nhom ?? '(không có)'}`,
      // Tên agent quản lý, không id — cùng vế mà d.302 gọi "agent quản lý".
      `Agent quản lý: ${ho_so.du_an.quan_ly_agent_ten ?? d.quan_ly_agent_id ?? '(chưa có)'}`,
    ];
    if (d.mo_ta !== null && d.mo_ta !== '') dong.push('', d.mo_ta);

    dong.push('', ...dongHoSo(ho_so), '', ...dongLoiDaGap(ho_so.loi_da_gap));
    dong.push('', ...dongLuatChung(luat_chung));

    return { json: { du_an: d, ho_so, luat_chung }, dong };
  },
};
