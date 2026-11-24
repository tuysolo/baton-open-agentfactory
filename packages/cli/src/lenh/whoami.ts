/**
 * `baton whoami` — SPEC mục 13 d.359: "In agent là ai, vai trò, dự án được vào,
 * luật chung".
 *
 * **Vế "luật chung" là trang của SPEC mục 9 d.301** ("Chung toàn workspace: trang
 * 'Luật chung', gồm danh sách cấm chung và checklist trước khi giao. Agent đọc
 * được qua CLI hoặc MCP"). Từ lượt này nó có đường thật — `GET /v1/luat-chung` —
 * nên lệnh in **nội dung**, không còn một dòng "chưa có". Chữ dựng ở
 * `ho-so-md.ts`, dùng chung với `baton rules` và `baton profile`.
 */

import { batonFetch } from '@baton/client';
import type { LuatChungRa, WhoamiRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { dongLuatChung } from '../ho-so-md.js';

export const LENH_WHOAMI: LenhCli = {
  khai: { ten: 'whoami', vi_tri: [], co: {} },

  chay: async ({ cauHinh }) => {
    /*
     * **Hai lượt gọi NỐI TIẾP, không `Promise.all`.**
     *
     * `Promise.all` **bỏ rơi** lượt gọi còn lại khi một lượt ném: với một token
     * sai, `/v1/whoami` trả 401 ngay, `Promise.all` ném, và lượt gọi
     * `/v1/luat-chung` vẫn đang bay — nó chạm D1 **sau khi** lệnh đã kết thúc.
     * Đó là một request không ai đọc kết quả, và trong test nó làm
     * `vitest-pool-workers` không gỡ được kho D1 ("Failed to pop isolated
     * storage stack frame"). Nối tiếp cũng đúng về nghiệp vụ: token sai thì
     * không có lý gì đi hỏi Luật chung.
     */
    const d = await batonFetch<WhoamiRa>(cauHinh, { method: 'GET', path: '/v1/whoami' });
    // Vế "luật chung" của d.359 — mục 9 d.301, agent đọc được.
    const luat_chung = await batonFetch<LuatChungRa>(cauHinh, {
      method: 'GET',
      path: '/v1/luat-chung',
    });

    const dong: string[] = [];
    if (d.loai === 'chu') {
      dong.push('Tôi là: chủ workspace');
    } else {
      dong.push(`Tôi là: agent ${d.agent_id ?? '(không rõ)'}`);
      // Mã tiếng Anh **và** nhãn tiếng Việt — SPEC d.381.
      dong.push(`Vai trò: ${d.nhan_vai_tro ?? '(không rõ)'} (${d.vai_tro ?? '-'})`);
    }
    dong.push(`Workspace: ${d.workspace_id}`);

    const vao_het = d.vao_tat_ca_du_an === true;
    const duoc_vao = d.du_an_duoc_vao ?? [];
    dong.push(
      `Dự án được vào: ${vao_het ? 'tất cả dự án' : duoc_vao.length === 0 ? '(chưa được vào dự án nào)' : duoc_vao.join(', ')}`,
    );
    const quan_ly = d.du_an_minh_quan_ly ?? [];
    if (quan_ly.length > 0) dong.push(`Dự án tôi quản lý: ${quan_ly.join(', ')}`);
    dong.push(...dongLuatChung(luat_chung));

    return { json: { ...d, luat_chung }, dong };
  },
};
