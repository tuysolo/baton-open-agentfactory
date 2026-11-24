/**
 * **Dựng chữ cho hồ sơ dự án và "Lỗi đã gặp"** — SPEC mục 9 d.294–303.
 *
 * Hai lệnh cần đúng thứ này: `baton profile <DỰ ÁN>` (d.378 "In hồ sơ dự án") và
 * `baton claim <lượt>` (d.361 "… in brief, **hồ sơ dự án và lỗi đã gặp**"). Khai
 * **một chỗ** để hai lệnh không trôi xa nhau: một agent đọc hồ sơ qua `claim` và
 * một agent đọc qua `profile` phải thấy cùng một hồ sơ.
 *
 * ## Vì sao CLI quan trọng hơn trông thấy
 *
 * d.294: "Agent mới vào dự án **chỉ cần đọc trang này**". Agent không có trình
 * duyệt — CLI (và MCP) là **đường duy nhất** để nó đọc. Một hồ sơ chỉ có ở web là
 * một hồ sơ mà người đọc nó nhiều nhất không đọc được.
 *
 * ## Mục chưa soạn thì BỎ, nhưng hồ sơ trống thì NÓI
 *
 * Một hồ sơ đã soạn 3/9 mục mà in đủ 9 dòng, 6 dòng "(chưa có)", là 6 dòng ồn.
 * Nhưng một dự án **chưa có hồ sơ nào** (`phien_ban === 0`) thì phải nói thẳng —
 * im lặng ở đó là để agent tưởng dự án không có luật gì.
 */

import type { HoSoRa, LoiDaGapRa, LuatChungRa } from './kieu-api.js';

/** Dự án chưa soạn hồ sơ. **Khác** "hồ sơ rỗng", xem khối trên. */
export const DONG_CHUA_SOAN_HO_SO =
  'Hồ sơ: (chưa soạn — chủ điền ở trang Bản đồ dự án, hoặc `PATCH /v1/du-an/<id>/ho-so`)';

export const DONG_CHUA_CO_LOI_DA_GAP = 'Lỗi đã gặp: (chưa có mục nào)';

export const DONG_CHUA_SOAN_LUAT_CHUNG = 'Luật chung: (chưa soạn)';

/** Nhãn của chín mục d.296–298, **đúng thứ tự SPEC kể**. */
export const NHAN_MUC_HO_SO: readonly [keyof HoSoRa, string][] = [
  ['la_gi', 'Là gì'],
  ['thu_muc', 'Thư mục hoặc nguồn'],
  ['repo_chu_so_huu', 'Repo — chủ sở hữu'],
  ['repo_ten', 'Repo — tên'],
  ['repo_nhanh_mac_dinh', 'Repo — nhánh mặc định'],
  ['stack', 'Stack'],
  ['doc_truoc', 'Đọc trước'],
  ['cach_deploy', 'Cách deploy và ai chạy'],
  ['danh_sach_cam', 'Danh sách cấm riêng'],
];

/**
 * Chín mục của d.296–298 cộng hai cờ của d.300.
 *
 * `thut` để `claim` lồng hồ sơ dưới mục "Dự án" mà `profile` vẫn in sát lề.
 */
export function dongHoSo(hs: HoSoRa, thut = ''): string[] {
  const dong: string[] = [];
  // Hai cờ của d.300 **luôn** in: "không" cũng là một câu trả lời, và một agent
  // cần biết "bắt buộc review" tắt hay bật trước khi nộp.
  dong.push(
    `${thut}Dự án không code: ${hs.khong_code ? 'có' : 'không'}`,
    `${thut}Bắt buộc review: ${hs.bat_buoc_review ? 'có' : 'không'}`,
  );

  if (hs.phien_ban === 0) {
    dong.push(`${thut}${DONG_CHUA_SOAN_HO_SO}`);
    return dong;
  }

  dong.push(`${thut}Hồ sơ (bản ${String(hs.phien_ban)}):`);
  for (const [khoa, nhan] of NHAN_MUC_HO_SO) {
    const v = hs[khoa];
    if (typeof v !== 'string' || v === '') continue;
    /*
     * Mục nhiều dòng (markdown của d.296) in xuống dòng và thụt vào, không nhồi
     * vào một dòng: "Đọc trước" là một **danh sách link**, và một danh sách bị
     * nối liền là một danh sách không đọc được.
     */
    if (v.includes('\n')) {
      dong.push(`${thut}  ${nhan}:`);
      for (const d of v.split('\n')) dong.push(`${thut}    ${d}`);
    } else {
      dong.push(`${thut}  ${nhan}: ${v}`);
    }
  }
  return dong;
}

/** "Lỗi đã gặp" — d.299: ngày, lỗi, cách tránh. */
export function dongLoiDaGap(ds: LoiDaGapRa[], thut = ''): string[] {
  if (ds.length === 0) return [`${thut}${DONG_CHUA_CO_LOI_DA_GAP}`];
  const dong = [`${thut}Lỗi đã gặp (${String(ds.length)}):`];
  for (const l of ds) {
    dong.push(`${thut}  ${l.ngay} — ${l.loi}`);
    if (l.cach_tranh !== null && l.cach_tranh !== '') {
      dong.push(`${thut}    Cách tránh: ${l.cach_tranh}`);
    }
  }
  return dong;
}

/** Trang "Luật chung" của workspace — d.301. */
export function dongLuatChung(lc: LuatChungRa, thut = ''): string[] {
  if (lc.danh_sach_cam === null && lc.checklist === null) {
    return [`${thut}${DONG_CHUA_SOAN_LUAT_CHUNG}`];
  }
  const dong = [`${thut}Luật chung:`];
  for (const [v, nhan] of [
    [lc.danh_sach_cam, 'Danh sách cấm chung'],
    [lc.checklist, 'Checklist trước khi giao'],
  ] as const) {
    if (v === null || v === '') continue;
    dong.push(`${thut}  ${nhan}:`);
    for (const d of v.split('\n')) dong.push(`${thut}    ${d}`);
  }
  return dong;
}
