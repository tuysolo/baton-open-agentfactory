/**
 * **Đọc danh sách mục sidebar ra TỪ `SPEC.md`.**
 *
 * Đây là lớp chống tautology của `sidebar.test.tsx`. Cách hiển nhiên để test một
 * sidebar là gõ lại sáu nhãn trong ca test rồi so với sáu nhãn trong mã — và ca
 * đó **xanh kể cả khi cả hai sai so với SPEC**, hoặc khi ai đó sửa cả hai chỗ
 * cùng lúc. Nó chỉ canh "hai bản chép khớp nhau", không canh "khớp với SPEC".
 *
 * Nên bảng mong đợi được **cắt ra từ chính SPEC** — nguồn sự thật duy nhất
 * (`CLAUDE.md`). Thêm một mục vào d.391 mà quên sửa `muc-sidebar.ts` ⇒ đỏ. Bỏ một
 * mục khỏi `muc-sidebar.ts` ⇒ đỏ. Đổi một nhãn ở một trong hai chỗ ⇒ đỏ.
 *
 * Giá phải trả, khai thẳng: bộ test giờ phụ thuộc **hình chữ** của d.391–394
 * (một danh sách phẩy, một dòng "Dưới cùng: …"). Viết lại ba dòng đó trong SPEC
 * có thể làm parser vô nghĩa — nên `docMucSidebarTuSpec` **ném** khi cắt ra một
 * danh sách rỗng hoặc thiếu, thay vì trả `[]` và để mọi ca xanh.
 */

/*
 * `SPEC.md` nhập bằng `?raw` của Vite, **không** bằng `node:fs`.
 *
 * Hai lý do, và cả hai là lý do thật: (1) `packages/web` không có `@types/node`
 * và không nên có — nó là mã chạy trong trình duyệt, thêm kiểu Node vào đây là mở
 * đường cho một `import('node:fs')` lọt vào `src/`; (2) `?raw` đi qua đúng đường
 * mà Vite đã giải — không có một đường dẫn tương đối nào tự tính, nên không có
 * chỗ nào để lệch khi thư mục đổi.
 */
import SPEC_VAN from '../../../docs/vi/SPEC.md?raw';

export interface MucSidebarTuSpec {
  /** Sáu nhãn của d.391–392, theo thứ tự SPEC. */
  chinh: string[];
  /** Nhãn của d.394 ("Dưới cùng: …"). */
  cuoi: string;
}

/** Thân của một mục `## <so>. …` trong SPEC, tới mục kế tiếp. */
export function mucSpec(van: string, so: number): string {
  const dau = van.indexOf(`\n## ${String(so)}. `);
  if (dau === -1) throw new Error(`SPEC.md không có mục ${String(so)}`);
  const sau = van.indexOf('\n## ', dau + 1);
  return van.slice(dau, sau === -1 ? undefined : sau);
}

export function docMucSidebarTuSpec(): MucSidebarTuSpec {
  const muc14 = mucSpec(SPEC_VAN, 14);

  const dong = muc14.split('\n');
  const i = dong.findIndex((d) => d.trim().startsWith('- **Sidebar:**'));
  if (i === -1) throw new Error('Mục 14 không còn khối `- **Sidebar:**`');

  // Các dòng con của khối Sidebar: thụt sâu hơn, tới mục `- ` cùng cấp kế tiếp.
  const con: string[] = [];
  for (const d of dong.slice(i + 1)) {
    if (/^\s*- /.test(d) && !/^\s\s+- /.test(d)) break;
    if (/^\s\s+- /.test(d)) con.push(d.trim().replace(/^- /, ''));
  }

  const dong_chinh = con[0];
  if (dong_chinh === undefined) throw new Error('Khối Sidebar không còn dòng liệt kê mục');

  const chinh = dong_chinh
    .replace(/\.$/, '')
    .split(',')
    // Bỏ ghi chú trong ngoặc ("(huy hiệu)") và dấu đậm của markdown.
    .map((s) => s.replace(/\([^)]*\)/g, '').replace(/\*\*/g, '').trim())
    .filter((s) => s !== '');

  const dong_cuoi = con.find((d) => d.startsWith('Dưới cùng:'));
  if (dong_cuoi === undefined) throw new Error('Khối Sidebar không còn dòng "Dưới cùng:"');
  const cuoi = dong_cuoi.slice('Dưới cùng:'.length).replace(/\*\*/g, '').replace(/\.$/, '').trim();

  if (chinh.length < 2) throw new Error(`Cắt ra quá ít mục: ${JSON.stringify(chinh)}`);
  if (cuoi === '') throw new Error('Cắt ra nhãn "Dưới cùng" rỗng');

  return { chinh, cuoi };
}

/* ------------------------------------------------------------------ *
 * Trang Tổng quan — mục 11 d.315–320, mục 2 d.74, mục 14 d.412
 * ------------------------------------------------------------------ */

/**
 * **Năm khối của Tổng quan, cắt ra từ d.316–320** — tên khối theo đúng thứ tự
 * "từ trên xuống" mà d.315 nói.
 *
 * Cùng lý lẽ chống tautology với `docMucSidebarTuSpec`: gõ lại năm tên trong ca
 * test rồi so với năm tên trong mã là canh hai bản chép khớp nhau, không canh
 * khớp với SPEC. Thêm một khối vào d.315–320 mà quên sửa trang ⇒ đỏ; đổi thứ tự
 * ⇒ đỏ.
 *
 * Hình chữ mà parser phụ thuộc: một danh sách số `1.` … `5.`, mỗi dòng mở đầu
 * bằng `**<Tên khối>:**`. **Ném** khi cắt ra không đủ, thay vì trả danh sách
 * ngắn và để mọi ca xanh một cách vô nghĩa.
 */
export function khoiTongQuanTuSpec(): string[] {
  const muc11 = mucSpec(SPEC_VAN, 11);
  const dau = muc11.indexOf('**Tổng quan**');
  if (dau === -1) throw new Error('Mục 11 không còn khối `**Tổng quan**`');

  // Tới khối kế tiếp của mục 11 ("**Báo cáo sáng**").
  const het = muc11.indexOf('**Báo cáo sáng**', dau);
  const than = muc11.slice(dau, het === -1 ? undefined : het);

  const ten: string[] = [];
  for (const d of than.split('\n')) {
    const khop = /^\s*\d+\.\s+\*\*([^*:]+):?\*\*/.exec(d);
    if (khop !== null && khop[1] !== undefined) ten.push(khop[1].replace(/:$/, '').trim());
  }
  if (ten.length < 2) throw new Error(`Cắt ra quá ít khối Tổng quan: ${JSON.stringify(ten)}`);
  return ten;
}

/**
 * **Đúng chữ của ⚪** — mục 2 d.74: `Hiện chữ "Dự án không chạy"`.
 *
 * Cắt ra từ SPEC, không gõ lại: đây là một chuỗi mà SPEC chốt từng chữ, và một
 * ca so mã với một bản chép của mã sẽ xanh kể cả khi cả hai sai.
 */
export function cauDuAnKhongChayTuSpec(): string {
  const muc2 = mucSpec(SPEC_VAN, 2);
  const dong = muc2.split('\n').find((d) => d.includes('⚪'));
  if (dong === undefined) throw new Error('Mục 2 không còn dòng ⚪ của d.74');
  const khop = /[“"]([^”"]+)[”"]/.exec(dong);
  if (khop?.[1] === undefined || khop[1].trim() === '') {
    throw new Error(`Không cắt được chữ trong ngoặc kép của d.74: ${dong}`);
  }
  return khop[1].trim();
}

/**
 * d.412 có đúng là "dạng **tương đối**" + "rê chuột thấy **giờ đầy đủ theo giờ
 * Việt Nam**"? Hai vế, và `thoi-gian.ts` cài đúng hai vế đó.
 */
export function specDoiThoiGianTuongDoi(): { tuong_doi: boolean; gio_viet_nam: boolean } {
  const muc14 = mucSpec(SPEC_VAN, 14);
  return {
    tuong_doi: /dạng tương đối/.test(muc14),
    gio_viet_nam: /giờ đầy đủ theo giờ Việt Nam/.test(muc14),
  };
}

/** d.393 có đúng là "danh sách dự án theo nhóm, mỗi dự án có chấm sức sống"? */
export function specDoiNhomVaChamSucSong(): boolean {
  const muc14 = mucSpec(SPEC_VAN, 14);
  return /danh sách dự án theo nhóm/.test(muc14) && /chấm sức sống/.test(muc14);
}

/* ================================================================== *
 * Màn hình Cần Chủ — mục 8 d.248–275, bảng nhãn 0.1
 * ================================================================== *
 *
 * Mọi chuỗi mà SPEC chốt **từng chữ** cho màn hình này được cắt ra ở đây, không
 * gõ lại trong ca test. Lý lẽ y hệt `docMucSidebarTuSpec`: một ca so mã với một
 * bản chép của mã vẫn **xanh** khi cả hai cùng lệch khỏi SPEC — và màn hình Cần
 * Chủ là chỗ nhiều chuỗi chốt cứng nhất của cả SPEC (ba nhãn mức, bốn nút Gửi,
 * "Đề xuất", "Đạt", "Cần sửa", "Bỏ qua", "quá hạn X giờ", "chạy ở terminal
 * thật", câu tóm tắt phiên duyệt).
 *
 * **Mỗi hàm dưới đây NÉM khi cắt ra rỗng hoặc thiếu**, và mỗi hàm có một ca ghim
 * chính nó trong `can-chu.test.tsx` (số phần tử, nội dung), để một lần viết lại
 * SPEC làm parser vô nghĩa là **đỏ**, không phải "mọi ca xanh vì bảng mong đợi
 * rỗng".
 */

/** Một dòng của mục 8 chứa `khop`; ném nếu không còn dòng đó. */
function dongMuc8(khop: string | RegExp): string {
  const muc8 = mucSpec(SPEC_VAN, 8);
  const dong = muc8
    .split('\n')
    .find((d) => (typeof khop === 'string' ? d.includes(khop) : khop.test(d)));
  if (dong === undefined) throw new Error(`Mục 8 không còn dòng khớp ${String(khop)}`);
  return dong;
}

/** Chữ trong ngoặc kép đầu tiên của một dòng. */
function trongNgoacKep(dong: string): string {
  const khop = /[“"]([^”"]+)[”"]/.exec(dong);
  if (khop?.[1] === undefined || khop[1].trim() === '') {
    throw new Error(`Không cắt được chữ trong ngoặc kép: ${dong}`);
  }
  return khop[1].trim();
}

/**
 * **Ba nhãn mức, đúng thứ tự d.249** — `🔴 Gấp · 🟡 Trong ngày · ⚪ Không gấp`.
 *
 * Cắt từ **d.249** (dòng "3 khối"), không từ bảng 0.1: d.249 là câu nói về **màn
 * hình** và nó cũng là câu chốt **thứ tự ba khối**, nên một lần đổi thứ tự ở đó
 * phải làm ca test đỏ.
 */
export function nhanBaKhoiTuSpec(): string[] {
  const dong = dongMuc8('3 khối');
  const dam = /\*\*([^*]+)\*\*/.exec(dong);
  if (dam?.[1] === undefined) throw new Error(`d.249 không còn khối đậm ba mức: ${dong}`);
  const ra = dam[1]
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (ra.length !== 3) throw new Error(`Cắt ra ${String(ra.length)} nhãn mức, cần 3`);
  return ra;
}

/** `"quá hạn X giờ"` — d.249, chữ trong ngoặc kép của chính dòng đó. */
export function cauQuaHanTuSpec(): string {
  return trongNgoacKep(dongMuc8('quá hạn'));
}

/** Số dòng mà bối cảnh **gập sau** — d.250 ("mặc định gập sau 6 dòng"). */
export function soDongGapTuSpec(): number {
  const khop = /gập sau (\d+) dòng/.exec(dongMuc8('gập sau'));
  if (khop?.[1] === undefined) throw new Error('d.250 không còn "gập sau N dòng"');
  return Number(khop[1]);
}

/** `"Đề xuất"` — nhãn của phương án đề xuất, d.250. */
export function nhanDeXuatTuSpec(): string {
  return trongNgoacKep(dongMuc8('đề xuất có nhãn'));
}

/** Bốn cột của bảng "Đã xử lý" — d.251: "ngày, mã, tiêu đề ngắn, kết quả". */
export function cotDaXuLyTuSpec(): string[] {
  const dong = dongMuc8('Đã xử lý**:');
  const sau = dong.slice(dong.indexOf('Đã xử lý**:') + 'Đã xử lý**:'.length);
  const ra = sau
    .split('.')[0]!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (ra.length !== 4) throw new Error(`Cắt ra ${String(ra.length)} cột, cần 4: ${sau}`);
  return ra;
}

/** `"chạy ở terminal thật"` — d.237, ghi chú khi agent đánh dấu cần TTY. */
export function cauTerminalThatTuSpec(): string {
  return trongNgoacKep(dongMuc8('TTY'));
}

/** `"Bỏ qua"` — link nhỏ trên **mọi** thẻ, d.264. */
export function nhanBoQuaTuSpec(): string {
  return trongNgoacKep(dongMuc8('link nhỏ'));
}

/** `"Bắt đầu phiên duyệt"` — d.274. */
export function nhanPhienDuyetTuSpec(): string {
  return trongNgoacKep(dongMuc8('hiện từng thẻ'));
}

/** `"đã xử lý N, bỏ qua M, còn lại K"` — d.275, nguyên văn sau "tóm tắt:". */
export function cauTomTatPhienTuSpec(): string {
  const dong = dongMuc8('Cuối phiên');
  const sau = dong.slice(dong.indexOf('tóm tắt:') + 'tóm tắt:'.length);
  const ra = sau.replace(/\.$/, '').trim();
  if (ra === '') throw new Error(`Không cắt được câu tóm tắt: ${dong}`);
  return ra;
}

/**
 * **Bảng "Trả lời bằng nút rồi bấm Gửi"** của d.257–262, theo **mã loại**.
 *
 * `gui` là chữ **đậm** của ô "Gửi" (nút chính của loại đó); `nut_tren_the` là mọi
 * chữ đậm của ô "Trên thẻ có". Hai ô, hai nghĩa — gộp lại thì ca test không phân
 * biệt được "Gửi duyệt" (nút gửi) với "Đạt"/"Cần sửa" (hai nút chọn).
 */
export interface HangBangTraLoi {
  loai: string;
  nut_tren_the: string[];
  gui: string[];
}

export function bangTraLoiTuSpec(): HangBangTraLoi[] {
  const muc8 = mucSpec(SPEC_VAN, 8);
  const ra: HangBangTraLoi[] = [];
  for (const d of muc8.split('\n')) {
    const khop = /^\|\s*`(decision|run_command|review|fyi)`\s*\|(.*)\|(.*)\|\s*$/.exec(d);
    if (khop === null) continue;
    const dam = (o: string): string[] => [...o.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!);
    ra.push({ loai: khop[1]!, nut_tren_the: dam(khop[2]!), gui: dam(khop[3]!) });
  }
  if (ra.length !== 4) throw new Error(`Cắt ra ${String(ra.length)} hàng bảng d.257–262, cần 4`);
  return ra;
}

/** Nhãn hiển thị của **Loại Cần Chủ** — bảng 0.1, `mã → nhãn`. */
export function nhanLoaiCanChuTuSpec(): Record<string, string> {
  const dong = SPEC_VAN.split('\n').find((d) => d.startsWith('| Loại Cần Chủ |'));
  if (dong === undefined) throw new Error('Bảng 0.1 không còn hàng "Loại Cần Chủ"');
  const ra: Record<string, string> = {};
  for (const o of dong.split('|')[2]!.split('·')) {
    const khop = /`([a-z_]+)`\s*(.+)/.exec(o.trim());
    if (khop?.[1] !== undefined && khop[2] !== undefined) ra[khop[1]] = khop[2].trim();
  }
  if (Object.keys(ra).length !== 4) {
    throw new Error(`Cắt ra ${String(Object.keys(ra).length)} nhãn loại, cần 4`);
  }
  return ra;
}

/** d.271 có đúng ba vế của ô trả lời hàng loạt? (tách mã · xem trước · báo đỏ) */
export function specDoiOHangLoat(): { tach_ma: boolean; xem_truoc: boolean; bao_do: boolean } {
  const dong = dongMuc8('trả lời hàng loạt');
  return {
    tach_ma: /tách từng mã/.test(dong),
    xem_truoc: /cho xem trước rồi áp một lần/.test(dong),
    bao_do: /Dòng không hiểu thì báo đỏ, không áp/.test(dong),
  };
}

/** d.265: "Bấm Gửi là xong phía chủ. Thẻ chuyển **ngay** xuống Đã xử lý". */
export function specDoiChuyenNgay(): boolean {
  const dong = dongMuc8('Bấm Gửi');
  return /chuyển ngay xuống "?Đã xử lý"?/.test(dong);
}

/** d.408: "server từ chối thì **hoàn lại** và báo lỗi dạng **toast** ghi rõ lý do". */
export function specDoiToastHoanLai(): { hoan_lai: boolean; toast: boolean } {
  const muc14 = mucSpec(SPEC_VAN, 14);
  return {
    hoan_lai: /server từ chối thì hoàn lại/.test(muc14),
    toast: /báo lỗi dạng toast ghi rõ lý do/.test(muc14),
  };
}

/**
 * **Bảng phím tắt TRONG TRANG Cần Chủ** — d.270, cắt theo từng vế phân cách `;`.
 *
 * Mỗi vế là một `phim` (mọi chuỗi trong dấu nháy ngược của vế đó) và một `viec`
 * (phần chữ còn lại). Cắt ra thay vì gõ lại năm dòng: d.270 là **danh sách phím
 * duy nhất** của màn hình này, nên thêm/bỏ một phím ở SPEC mà `can-chu.tsx` không
 * đổi phải đỏ.
 *
 * Không nhập nhèm với bảng phím **toàn cục** của d.399–403 (`C`, `G`+`T`,
 * `Cmd/Ctrl+K`, …): hàm này chỉ đọc mục 8.
 */
export interface VePhimTat {
  phim: string[];
  viec: string;
}

export function phimTatCanChuTuSpec(): VePhimTat[] {
  const dong = dongMuc8('**Phím tắt**');
  const sau = dong.slice(dong.indexOf('):') + 2);
  const ra: VePhimTat[] = [];
  for (const ve of sau.split(';')) {
    const phim = [...ve.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    if (phim.length === 0) continue;
    const viec = ve
      .replace(/`[^`]+`/g, ' ')
      // Bỏ dấu nối giữa hai phím cùng vế (`1`–`5`, `J`/`K`) và dấu chấm cuối câu.
      .replace(/^[\s–/-]+|\.$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    ra.push({ phim, viec });
  }
  if (ra.length !== 5) throw new Error(`Cắt ra ${String(ra.length)} vế phím tắt d.270, cần 5`);
  return ra;
}

/**
 * **Số giây mà thay đổi do agent tạo phải hiện lên** — d.410, và vế "không cần
 * tải lại trang" của cùng dòng đó.
 */
export function hienThayDoiTuSpec(): { giay: number; khong_tai_lai: boolean } {
  const muc14 = mucSpec(SPEC_VAN, 14);
  const dong = muc14.split('\n').find((d) => d.includes('Thay đổi do agent'));
  if (dong === undefined) throw new Error('Mục 14 không còn dòng "Thay đổi do agent …"');
  const khop = /trong vòng (\d+) giây/.exec(dong);
  if (khop?.[1] === undefined) throw new Error(`d.410 không còn "trong vòng N giây": ${dong}`);
  return { giay: Number(khop[1]), khong_tai_lai: /không cần tải lại trang/.test(dong) };
}

/**
 * **Vế điện thoại của d.411** — số px, và các vế trong ngoặc mà hai lượt gần đây
 * phải phủ: "kể cả **phiên duyệt** và **ô trả lời hàng loạt**" (lượt 4) và "**chi
 * tiết ticket**" (lượt 5).
 */
export function specDoiDienThoai(): {
  px: number;
  co_can_chu: boolean;
  co_phien_duyet: boolean;
  co_hang_loat: boolean;
  co_chi_tiet_ticket: boolean;
} {
  const muc14 = mucSpec(SPEC_VAN, 14);
  const dong = muc14.split('\n').find((d) => d.includes('Điện thoại'));
  if (dong === undefined) throw new Error('Mục 14 không còn dòng "Điện thoại (…px)"');
  const khop = /\((\d+)px\)/.exec(dong);
  if (khop?.[1] === undefined) throw new Error(`d.411 không còn số px: ${dong}`);
  return {
    px: Number(khop[1]),
    co_can_chu: /Cần Chủ/.test(dong),
    co_phien_duyet: /phiên duyệt/.test(dong),
    co_hang_loat: /ô trả lời hàng loạt/.test(dong),
    co_chi_tiet_ticket: /chi tiết ticket/.test(dong),
  };
}

/* ================================================================== *
 * Danh sách / bảng / chi tiết ticket — mục 14 d.395–401, d.409
 * ================================================================== *
 *
 * Cùng lý lẽ chống tautology với mọi hàm trên: nhãn và danh sách mà SPEC chốt
 * **từng chữ** được cắt ra từ `SPEC.md`, không gõ lại trong ca test. Mỗi hàm
 * **ném** khi cắt ra rỗng/thiếu, và mỗi hàm có một ca ghim chính nó.
 */

/** Một dòng của mục 14 chứa `khop`; ném nếu không còn dòng đó. */
function dongMuc14(khop: string | RegExp): string {
  const muc14 = mucSpec(SPEC_VAN, 14);
  const dong = muc14
    .split('\n')
    .find((d) => (typeof khop === 'string' ? d.includes(khop) : khop.test(d)));
  if (dong === undefined) throw new Error(`Mục 14 không còn dòng khớp ${String(khop)}`);
  return dong;
}

/** Một ô của bảng 0.1 cắt thành `mã → nhãn` theo dấu `·`. */
function hangBang01(ten_hang: string, can: number): Record<string, string> {
  const dong = SPEC_VAN.split('\n').find((d) => d.startsWith(`| ${ten_hang} |`));
  if (dong === undefined) throw new Error(`Bảng 0.1 không còn hàng "${ten_hang}"`);
  const ra: Record<string, string> = {};
  for (const o of dong.split('|')[2]!.split('·')) {
    const khop = /`([a-z_]+)`\s*(.+)/.exec(o.trim());
    if (khop?.[1] !== undefined && khop[2] !== undefined) ra[khop[1]] = khop[2].trim();
  }
  if (Object.keys(ra).length !== can) {
    throw new Error(
      `Hàng "${ten_hang}" cắt ra ${String(Object.keys(ra).length)} mã, cần ${String(can)}`,
    );
  }
  return ra;
}

/** **Bảy trạng thái ticket** của bảng 0.1 — `mã → nhãn`, đúng thứ tự khai. */
export function nhanTrangThaiTicketTuSpec(): Record<string, string> {
  return hangBang01('Trạng thái ticket', 7);
}

/** **Năm mức ưu tiên** của bảng 0.1 — `mã → nhãn`. */
export function nhanUuTienTuSpec(): Record<string, string> {
  return hangBang01('Ưu tiên', 5);
}

/**
 * **Mọi bộ lọc của d.396** — nguyên văn sau "Lọc theo", cắt theo dấu phẩy.
 *
 * Thêm một bộ lọc vào d.396 mà trang không có ô cho nó ⇒ đỏ; bỏ một ô mà SPEC
 * vẫn kể ⇒ đỏ. Dấu ngoặc kép của ba cờ ("có cờ", "cần Chủ", …) được gỡ, nên hàm
 * trả về chữ thuần.
 */
export function locTicketTuSpec(): string[] {
  const dong = dongMuc14('Lọc theo');
  const sau = dong.slice(dong.indexOf('Lọc theo') + 'Lọc theo'.length);
  // Tới hết câu đầu (câu kế tiếp là "Bộ lọc ghi trên URL.").
  const ra = sau
    .split('.')[0]!
    .split(',')
    .map((s) => s.replace(/["“”]/g, '').trim())
    .filter((s) => s !== '');
  if (ra.length < 5) throw new Error(`Cắt ra ${String(ra.length)} bộ lọc d.396, cần ≥ 5`);
  return ra;
}

/** d.397 có đúng hai vế "**ghi trên URL**" và "**lưu thành view riêng**"? */
export function specDoiUrlVaView(): { tren_url: boolean; view_rieng: boolean } {
  const muc14 = mucSpec(SPEC_VAN, 14);
  return {
    tren_url: /Bộ lọc ghi trên URL/.test(muc14),
    view_rieng: /Lưu thành view riêng/.test(muc14),
  };
}

/**
 * **Bốn vế của d.396 về hai kiểu xem** — gom theo trạng thái, bảng cột là trạng
 * thái, kéo thả, và "kéo vào Xong mà thiếu bằng chứng thì thẻ **bật về chỗ cũ** và
 * **báo lý do**".
 */
export function specDoiHaiKieuXem(): {
  gom_theo_trang_thai: boolean;
  cot_la_trang_thai: boolean;
  keo_tha: boolean;
  bat_ve_cho_cu: boolean;
  bao_ly_do: boolean;
} {
  const dong = dongMuc14('Hai kiểu xem');
  return {
    gom_theo_trang_thai: /danh sách gom theo trạng thái/.test(dong),
    cot_la_trang_thai: /cột là trạng thái/.test(dong),
    keo_tha: /kéo thả/.test(dong),
    bat_ve_cho_cu: /bật về chỗ cũ/.test(dong),
    bao_ly_do: /báo lý do/.test(dong),
  };
}

/**
 * **Cột của Bảng và cột có nút `+`** — mục 14 (Chủ chốt T-111 = A, 29/10; BAT-64):
 * "Bảng có **sáu cột** theo thứ tự **A · B · …**" và "nút `+` ở đầu cột X (…) và
 * đầu cột Y (…)". Trả nhãn tiếng Việt đúng thứ tự SPEC.
 */
export function cotBangTuSpec(): { cot: string[]; cot_co_nut_tao: string[] } {
  const dong = dongMuc14('Hai kiểu xem');
  const cot = /Bảng có \*\*[^*]+ cột\*\* theo thứ tự \*\*([^*]+)\*\*/.exec(dong)?.[1];
  if (cot === undefined) throw new Error(`Mục 14 không còn câu "Bảng có … cột theo thứ tự …": ${dong}`);
  const nut = /nút `\+` ở đầu cột (.+?) \(.+?\) và đầu cột (.+?) \(/.exec(dong);
  if (nut?.[1] === undefined || nut[2] === undefined) {
    throw new Error(`Mục 14 không còn câu "nút + ở đầu cột … và đầu cột …": ${dong}`);
  }
  return { cot: cot.split('·').map((s) => s.trim()), cot_co_nut_tao: [nut[1].trim(), nut[2].trim()] };
}

/** **Số ticket phải cuộn mượt** — d.409 ("Danh sách 5.000 ticket cuộn mượt"). */
export function soTicketCuonMuotTuSpec(): number {
  const dong = dongMuc14('cuộn mượt');
  const khop = /Danh sách ([\d.,]+) ticket cuộn mượt/.exec(dong);
  if (khop?.[1] === undefined) throw new Error(`d.409 không còn "Danh sách N ticket cuộn mượt": ${dong}`);
  const so = Number(khop[1].replace(/[.,]/g, ''));
  if (!Number.isFinite(so) || so <= 0) throw new Error(`Cắt ra số ticket vô nghĩa: ${khop[1]}`);
  return so;
}

/**
 * **Các vế của chi tiết ticket** — d.399 (cột trái) và d.401 (cột phải), cắt theo
 * dấu phẩy ở cấp ngoài cùng.
 *
 * Hình chữ mà parser phụ thuộc: hai dòng con mở đầu bằng `Bên trái:` và
 * `Bên phải:`. Ngoặc đơn bị gỡ **cùng nội dung** (chúng là ghi chú, ví dụ "(sửa
 * tại chỗ)", "(8 mục gập được)"), nhưng dấu ngoặc của "(kể cả ticket điều phối)"
 * cũng vậy — nên hàm trả thêm cờ `co_dieu_phoi` đọc trên dòng gốc.
 */
export function veChiTietTicketTuSpec(): {
  ben_trai: string[];
  ben_phai: string[];
  co_dieu_phoi: boolean;
  co_sua_tai_cho: boolean;
  so_muc_brief: number;
  co_dong_thoi_gian: boolean;
  co_lich_su_thu_gon: boolean;
} {
  const trai = dongMuc14('Bên trái:');
  const phai = dongMuc14('Bên phải:');

  const tach = (dong: string, dau: string): string[] => {
    const sau = dong.slice(dong.indexOf(dau) + dau.length);
    const ra = sau
      // Bỏ ghi chú trong ngoặc và dấu đậm của markdown.
      .replace(/\([^)]*\)/g, '')
      .replace(/\*\*/g, '')
      .replace(/\.$/, '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (ra.length < 3) throw new Error(`Cắt ra ${String(ra.length)} vế từ "${dau}", cần ≥ 3`);
    return ra;
  };

  const khop_brief = /brief \((\d+) mục gập được\)/.exec(trai);
  if (khop_brief?.[1] === undefined) throw new Error(`d.399 không còn "brief (N mục gập được)": ${trai}`);

  return {
    ben_trai: tach(trai, 'Bên trái:'),
    ben_phai: tach(phai, 'Bên phải:'),
    co_dieu_phoi: /kể cả ticket điều phối/.test(phai),
    co_sua_tai_cho: /sửa tại chỗ/.test(trai),
    so_muc_brief: Number(khop_brief[1]),
    co_dong_thoi_gian: /dạng dòng thời gian/.test(trai),
    co_lich_su_thu_gon: /lịch sử thu gọn/.test(trai),
  };
}

/**
 * **Tám mục brief** của mục 4 — nguyên văn sau "**Brief** (có cấu trúc, tuỳ
 * chọn):", cắt theo dấu `·`.
 */
export function mucBriefTuSpec(): string[] {
  const muc4 = mucSpec(SPEC_VAN, 4);
  const dong = muc4.split('\n').find((d) => d.includes('**Brief**'));
  if (dong === undefined) throw new Error('Mục 4 không còn dòng "**Brief** …"');
  const sau = dong.slice(dong.indexOf(':') + 1);
  const ra = sau
    .replace(/\.$/, '')
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (ra.length !== 8) throw new Error(`Cắt ra ${String(ra.length)} mục brief, cần 8`);
  return ra;
}

/**
 * **Nhãn ba tab nhanh** — d.407, nguyên văn trong ngoặc đơn của câu "các **tab
 * nhanh** (Đang chạy · Backlog · Tất cả)", cắt theo dấu `·`.
 *
 * Ném khi không ra đúng ba: một parser hỏng sẽ làm ca so nhãn thành vô nghĩa mà
 * vẫn xanh (cùng lý lẽ `nhanBaKhoiTuSpec`).
 */
export function tabNhanhTuSpec(): string[] {
  const dong = dongMuc14('tab nhanh');
  const trong = /\(([^)]*·[^)]*)\)/.exec(dong);
  if (trong?.[1] === undefined) throw new Error(`d.407 không còn ngoặc ba tab: ${dong}`);
  const ra = trong[1]
    .split('·')
    .map((s) => s.replace(/\*\*/g, '').trim())
    .filter((s) => s !== '');
  if (ra.length !== 3) throw new Error(`Cắt ra ${String(ra.length)} tab nhanh d.407, cần 3`);
  return ra;
}

/**
 * **Bốn vế của d.407** (thanh lọc gom lại) và **ba vế của d.404/d.405** (thẻ và
 * cột rỗng) — những câu mà phần B của BAT-6 đợt 3 cài, mỗi vế một cờ.
 *
 * Cùng lý lẽ `specDoiHaiKieuXem`: ca test đọc **chữ của SPEC**, nên một lần viết
 * lại SPEC bỏ mất một vế là một ca đỏ, không một luật âm thầm mất người canh.
 */
export function specDoiThanhLocGon(): {
  khong_mo_san: boolean;
  co_nut_loc: boolean;
  menu_moi_o_loc: boolean;
  co_luu_view_trong_menu: boolean;
} {
  const dong = dongMuc14('Thanh lọc');
  return {
    khong_mo_san: /Thanh lọc \*\*không mở sẵn\*\*/.test(dong),
    co_nut_loc: /một nút \*\*"Lọc"\*\*/.test(dong),
    menu_moi_o_loc: /mở menu chứa mọi ô lọc/.test(dong),
    co_luu_view_trong_menu: /cùng với "Lưu thành view"/.test(dong),
  };
}

/** Ba vế của d.404 — không ô "Chuyển cột", ưu tiên "Không" không in chữ, tên agent. */
export function specDoiTheViec(): {
  khong_chuyen_cot: boolean;
  ba_duong_doi_trang_thai: boolean;
  an_uu_tien_khong: boolean;
  ten_khong_id: boolean;
} {
  const dong = dongMuc14('Chuyển cột');
  return {
    khong_chuyen_cot: /\*\*không\*\* có ô "Chuyển cột"/.test(dong),
    ba_duong_doi_trang_thai: /kéo thả, panel chi tiết, hoặc phím `S`/.test(dong),
    an_uu_tien_khong: /Ưu tiên "Không" \*\*không\*\* in chữ trên thẻ/.test(dong),
    ten_khong_id: /hiện \*\*tên agent\*\*, không bao giờ id/.test(dong),
  };
}

/** Hai vế của d.405 — cột rỗng thu hẹp (vẫn có tiêu đề và số 0), nhóm rỗng ẩn. */
export function specDoiCotNhomRong(): { cot_thu_hep: boolean; nhom_rong_an: boolean } {
  const dong = dongMuc14('rỗng');
  return {
    cot_thu_hep: /cột rỗng thu hẹp nhưng vẫn hiện tiêu đề và số 0/.test(dong),
    nhom_rong_an: /nhóm rỗng ở Danh sách thì ẩn/.test(dong),
  };
}

/**
 * Hai vế của d.397 về "Tất cả việc" — mọi dự án, và mở ở kiểu Bảng.
 *
 * Tra theo `"Tất cả việc" là` chứ không chỉ `Tất cả việc`: chữ ấy xuất hiện
 * **trước** ở d.396 (danh sách sáu mục), và `dongMuc14` trả **dòng đầu khớp** —
 * nên một khoá rộng sẽ đọc sai dòng và cả hai cờ thành `false` một cách vô nghĩa.
 */
export function specDoiTatCaViec(): { moi_du_an: boolean; kieu_bang: boolean } {
  const dong = dongMuc14('"Tất cả việc" là');
  return {
    moi_du_an: /danh sách ticket của \*\*mọi dự án\*\*/.test(dong),
    kieu_bang: /mở ở \*\*kiểu Bảng\*\*/.test(dong),
  };
}

/** d.403 — "Trang việc của **một dự án** mặc định là kiểu **Bảng**". */
export function specDoiMotDuAnKieuBang(): boolean {
  return /Trang việc của \*\*một dự án\*\* mặc định là kiểu \*\*Bảng\*\*/.test(
    dongMuc14('mặc định là kiểu'),
  );
}

/** d.401 — tên workspace mở menu chứa hai nút đăng xuất, không nằm trần thanh trên. */
export function specDoiMenuWorkspace(): { menu_o_ten: boolean; khong_nam_tran: boolean } {
  const dong = dongMuc14('Tên workspace');
  return {
    menu_o_ten: /Tên workspace mở một menu chứa \*\*Đăng xuất\*\* và \*\*Đăng xuất mọi nơi\*\*/.test(
      dong,
    ),
    khong_nam_tran: /không nằm trần trên thanh trên/.test(dong),
  };
}

/** d.397–398 — "Đội agent" một link duy nhất, và Bản đồ dự án không có mục riêng. */
export function specDoiDoiAgentVaBanDo(): {
  tieu_de_bam_duoc: boolean;
  khong_link_thu_hai: boolean;
  ban_do_khong_co_muc: boolean;
} {
  const muc14 = mucSpec(SPEC_VAN, 14);
  const doi = muc14.split('\n').find((d) => d.includes('Tiêu đề nhóm')) ?? '';
  const ban_do = muc14.split('\n').find((d) => d.includes('Bản đồ dự án')) ?? '';
  return {
    tieu_de_bam_duoc: /Tiêu đề nhóm "Đội agent" bấm được để vào trang Đội agent/.test(doi),
    khong_link_thu_hai: /không có link thứ hai tới cùng trang/.test(doi),
    ban_do_khong_co_muc: /không có mục riêng ở sidebar/.test(ban_do),
  };
}

/** d.395 có đúng chữ "Tất cả dự án" cho ca xem mọi dự án? */
export function nhanTatCaDuAnTuSpec(): string {
  return trongNgoacKep(dongMuc14('Danh sách ticket'));
}

/* ================================================================== *
 * Trang agent, Đội agent, chi tiết phiên — mục 3 d.80–105, mục 14 d.402
 * ================================================================== *
 *
 * Cùng lý lẽ chống tautology với mọi hàm trên. Mỗi hàm **ném** khi cắt ra
 * rỗng/thiếu, và mỗi hàm có một ca ghim chính nó trong `doi-agent.test.tsx`.
 */

/** Một dòng của mục 3 chứa `khop`; ném nếu không còn dòng đó. */
function dongMuc3(khop: string | RegExp): string {
  const muc3 = mucSpec(SPEC_VAN, 3);
  const dong = muc3
    .split('\n')
    .find((d) => (typeof khop === 'string' ? d.includes(khop) : khop.test(d)));
  if (dong === undefined) throw new Error(`Mục 3 không còn dòng khớp ${String(khop)}`);
  return dong;
}

/**
 * **Các vế của trang agent** — mục 3 d.104: "Trang agent: thông tin, phiên đang
 * mở, lịch sử lượt giao (dạng bảng), tỉ lệ nộp lại đạt review, lần cuối lên
 * tiếng."
 *
 * Trả danh sách vế (ngoặc đơn bị gỡ cùng nội dung — chúng là ghi chú), cộng cờ
 * `co_dang_bang` đọc trên dòng gốc vì "(dạng bảng)" là một **yêu cầu**, không
 * phải ghi chú trang trí.
 */
export function veTrangAgentTuSpec(): { ve: string[]; co_dang_bang: boolean } {
  const dong = dongMuc3('**Trang agent:**');
  const sau = dong.slice(dong.indexOf('**Trang agent:**') + '**Trang agent:**'.length);
  const ve = sau
    .replace(/\([^)]*\)/g, '')
    .replace(/\*\*/g, '')
    .replace(/\.$/, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (ve.length < 4) throw new Error(`Cắt ra ${String(ve.length)} vế của d.104, cần ≥ 4`);
  return { ve, co_dang_bang: /dạng bảng/.test(dong) };
}

/**
 * **Ba vế của d.402** — "Chi tiết phiên: dòng hoạt động, kế hoạch, nút *Dừng*".
 *
 * `nhan_dung` là chữ **trong ngoặc kép** của chính dòng đó: nhãn nút là một chuỗi
 * SPEC chốt từng chữ, nên nó không được gõ lại trong ca test.
 */
export function veChiTietPhienTuSpec(): { ve: string[]; nhan_dung: string } {
  const dong = dongMuc14('Chi tiết phiên');
  const sau = dong.slice(dong.indexOf('Chi tiết phiên:') + 'Chi tiết phiên:'.length);
  const ve = sau
    .replace(/\*\*/g, '')
    .replace(/["“”]/g, '')
    .replace(/\.$/, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (ve.length !== 3) throw new Error(`Cắt ra ${String(ve.length)} vế của d.402, cần 3`);
  return { ve, nhan_dung: trongNgoacKep(dong) };
}

/** **Bảy mã trạng thái phiên** của bảng 0.1 — `mã → nhãn`. */
export function nhanTrangThaiPhienTuSpec(): Record<string, string> {
  return hangBang01('Trạng thái phiên', 7);
}

/** **Năm mã trạng thái agent** của bảng 0.1 — `mã → nhãn`. */
export function nhanTrangThaiAgentTuSpec(): Record<string, string> {
  return hangBang01('Trạng thái agent', 5);
}

/** **Năm loại hoạt động** của bảng 0.1 — `mã → nhãn` (mục 6 d.190). */
export function nhanLoaiHoatDongTuSpec(): Record<string, string> {
  return hangBang01('Loại hoạt động', 5);
}

/**
 * **Chín hàng của bảng quyền** mục 3 — tên hàng ở cột đầu, đúng thứ tự SPEC.
 *
 * Hình chữ mà parser phụ thuộc: một bảng markdown mở đầu bằng hàng tiêu đề
 * `| Việc |`. Hàng tiêu đề và hàng gạch bị bỏ; mọi hàng còn lại là một việc.
 */
export function hangQuyenTuSpec(): string[] {
  const muc3 = mucSpec(SPEC_VAN, 3);
  const dong = muc3.split('\n');
  const dau = dong.findIndex((d) => d.startsWith('| Việc |'));
  if (dau === -1) throw new Error('Mục 3 không còn bảng quyền (hàng tiêu đề `| Việc |`)');

  const ra: string[] = [];
  for (const d of dong.slice(dau + 1)) {
    if (!d.startsWith('|')) break;
    const o = d.split('|')[1]?.trim() ?? '';
    // Hàng gạch `|---|---|` không phải một việc.
    if (o === '' || /^-+$/.test(o)) continue;
    ra.push(o.replace(/\*\*/g, '').trim());
  }
  if (ra.length !== 9) throw new Error(`Cắt ra ${String(ra.length)} hàng bảng quyền, cần 9`);
  return ra;
}

/* ================================================================== *
 * Nhật ký quyết định — mục 10 d.306–312, 19.12 câu 4, câu 62, câu 64
 * ================================================================== */

/** Một dòng của mục 10 chứa `khop`; ném nếu không còn dòng đó. */
function dongMuc10(khop: string | RegExp): string {
  const muc10 = mucSpec(SPEC_VAN, 10);
  const dong = muc10
    .split('\n')
    .find((d) => (typeof khop === 'string' ? d.includes(khop) : khop.test(d)));
  if (dong === undefined) throw new Error(`Mục 10 không còn dòng khớp ${String(khop)}`);
  return dong;
}

/**
 * **Sáu trường của một dòng Nhật ký** — d.308: "lúc (ngày giờ), ai (chủ hoặc
 * agent), dự án, quyết định, vì sao, căn cứ (…)".
 *
 * Ngoặc đơn **giữ nguyên nội dung** bị gỡ, nhưng phép tách theo dấu phẩy phải
 * chạy **sau** khi gỡ, vì trong ngoặc cũng có dấu phẩy ("chủ hoặc agent", "link
 * T-số, mã ticket, dòng cũ") — tách trước thì ra mười mấy vế.
 */
export function truongNhatKyTuSpec(): string[] {
  const dong = dongMuc10('**Dòng:**');
  const sau = dong.slice(dong.indexOf('**Dòng:**') + '**Dòng:**'.length);
  const ra = sau
    .replace(/\([^)]*\)/g, '')
    .replace(/\*\*/g, '')
    .replace(/\.$/, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (ra.length !== 6) throw new Error(`Cắt ra ${String(ra.length)} trường của d.308, cần 6`);
  return ra;
}

/** `"đã có quyết định mới"` — d.309, chữ trong ngoặc kép của chính dòng đó. */
export function cauDaCoQuyetDinhMoiTuSpec(): string {
  return trongNgoacKep(dongMuc10('dòng cũ hiện chữ'));
}

/** Bốn vế của **màn hình** mục 10 — d.311. */
export function veManHinhNhatKyTuSpec(): {
  gom_theo_ngay: boolean;
  loc_du_an: boolean;
  loc_ai: boolean;
  tim_theo_chu: boolean;
} {
  const dong = dongMuc10('**Màn hình:**');
  return {
    gom_theo_ngay: /gom theo ngày/.test(dong),
    loc_du_an: /lọc theo dự án/.test(dong),
    loc_ai: /theo ai/.test(dong),
    tim_theo_chu: /tìm theo chữ/.test(dong),
  };
}

/**
 * **Nhãn của giá trị rỗng ở trường dự án** — 19.12 câu 4: "Giao diện hiện nhãn
 * **"Chung"** cho giá trị rỗng."
 */
export function nhanChungTuSpec(): string {
  const dong = SPEC_VAN.split('\n').find((d) => d.includes('Giao diện hiện nhãn'));
  if (dong === undefined) throw new Error('19.12 câu 4 không còn dòng "Giao diện hiện nhãn …"');
  const khop = /\*\*[“"]?([^*”"]+)[”"]?\*\*/.exec(dong.slice(dong.indexOf('hiện nhãn')));
  if (khop?.[1] === undefined || khop[1].trim() === '') {
    throw new Error(`Không cắt được nhãn của giá trị rỗng: ${dong}`);
  }
  return khop[1].trim();
}

/**
 * **Công thức "vì sao" của dòng tự sinh** — 19.12 câu 64:
 * `"Trả lời mục T-x: <tiêu đề mục>"`.
 *
 * Luật này sống ở **tầng máy chủ** (đường tự sinh khi một mục Cần Chủ được xử
 * lý); parser ở đây chỉ để ca test của web ghim rằng chữ ấy **vẫn là chữ của
 * SPEC**, chứ web không được tự dựng một câu thứ hai cho cùng chỗ.
 */
export function viSaoTuSinhTuSpec(): string {
  const dong = SPEC_VAN.split('\n').find((d) => d.includes('Trả lời mục T-x'));
  if (dong === undefined) throw new Error('19.12 câu 64 không còn công thức "Trả lời mục T-x: …"');
  const khop = /`"([^`]+)"`/.exec(dong);
  if (khop?.[1] === undefined) throw new Error(`Không cắt được công thức của câu 64: ${dong}`);
  return khop[1];
}

/**
 * **Tỉ lệ đạt lần đầu** — 19.5: cửa sổ "**30 ngày** gần nhất", và công thức.
 *
 * Mục 19 nằm sau `## 19.` chứ không `## 19. ` theo cùng khuôn `mucSpec`, nên hàm
 * này tìm theo **chữ của dòng**, trên cả văn bản.
 */
export function tiLeDatLanDauTuSpec(): { ngay: number; co_cong_thuc: boolean } {
  const dong = SPEC_VAN.split('\n').find((d) => d.includes('Tỉ lệ đạt lần đầu'));
  if (dong === undefined) throw new Error('SPEC không còn dòng "Tỉ lệ đạt lần đầu" (19.5)');
  const khop = /(\d+) ngày gần nhất/.exec(dong);
  if (khop?.[1] === undefined) throw new Error(`19.5 không còn "N ngày gần nhất": ${dong}`);
  return { ngay: Number(khop[1]), co_cong_thuc: /÷/.test(dong) };
}

/* ================================================================== *
 * Hồ sơ dự án và trang Bản đồ — mục 9 d.294–303
 * ================================================================== */

/** Một dòng của mục 9 chứa `khop`; ném nếu không còn dòng đó. */
function dongMuc9(khop: string | RegExp): string {
  const muc9 = mucSpec(SPEC_VAN, 9);
  const dong = muc9
    .split('\n')
    .find((d) => (typeof khop === 'string' ? d.includes(khop) : khop.test(d)));
  if (dong === undefined) throw new Error(`Mục 9 không còn dòng khớp ${String(khop)}`);
  return dong;
}

/**
 * **Sáu cột của bảng Bản đồ** — d.302: "bảng mọi dự án: tên, agent quản lý, thư
 * mục, số ticket Đang làm, chỉ báo sức sống, cập nhật cuối".
 *
 * Cắt phần **sau dấu hai chấm cuối cùng** của câu, rồi tách theo dấu phẩy. Ném
 * khi không ra đúng sáu vế, thay vì trả một danh sách ngắn và để ca test xanh.
 */
export function cotBanDoTuSpec(): string[] {
  const dong = dongMuc9('**Trang Bản đồ:**');
  const sau = dong.slice(dong.lastIndexOf(':') + 1);
  /*
   * Chỉ **câu đầu** (tới dấu chấm đầu tiên): từ 04/11 (mục 20, T-127 = A) dòng này
   * có thêm câu thứ hai "… thêm cột Nhóm, Ưu tiên, Đang đẩy, Duy trì." — bốn cột đó
   * là việc của lượt 2 (giao diện), chưa có trên trang; ca của lượt đó sẽ đọc câu
   * thứ hai.
   */
  const ra = sau
    .replace(/\*\*/g, '')
    .split('.')[0]!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (ra.length !== 6) throw new Error(`Cắt ra ${String(ra.length)} cột của d.302, cần 6`);
  return ra;
}

/** Ba trường và tính "chỉ thêm" của **Lỗi đã gặp** — d.299. */
export function veLoiDaGapTuSpec(): { chi_them: boolean; truong: string[] } {
  const dong = dongMuc9('**Lỗi đã gặp**');
  const trong = /\(([^)]*)\)/.exec(dong);
  if (trong?.[1] === undefined) throw new Error(`d.299 không còn ngoặc mô tả: ${dong}`);
  return {
    chi_them: /chỉ thêm/.test(trong[1]),
    truong: trong[1]
      .slice(trong[1].indexOf(':') + 1)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  };
}

/** Hai cờ của d.300 — đúng chữ trong hai cặp ngoặc kép của chính dòng đó. */
export function coHoSoTuSpec(): string[] {
  const dong = dongMuc9(/Cờ ["“]/);
  const ra = [...dong.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1] ?? '');
  if (ra.length !== 2) throw new Error(`Cắt ra ${String(ra.length)} cờ của d.300, cần 2`);
  return ra;
}

/** Hai phần của trang "Luật chung" — d.301. */
export function veLuatChungTuSpec(): { danh_sach_cam: boolean; checklist: boolean } {
  const dong = dongMuc9('**Chung toàn workspace:**');
  return {
    danh_sach_cam: /danh sách cấm chung/.test(dong),
    checklist: /checklist trước khi giao/.test(dong),
  };
}

/** d.303 — "Mỗi lần sửa hồ sơ ghi **lịch sử phiên bản**." */
export function coLichSuPhienBanTuSpec(): boolean {
  return /lịch sử phiên bản/.test(dongMuc9('lịch sử phiên bản'));
}

/** d.413 — phím tắt toàn cục: "`C` tạo ticket" (BAT-22). */
export function specDoiPhimTaoTicket(): boolean {
  return /`C` tạo ticket/.test(dongMuc14('`C` tạo ticket'));
}

/**
 * d.413 — chuỗi `G` (BAT-23): trả `phím thứ hai → tên trang` cắt từ chữ SPEC
 * ("`G` rồi `T` tới Cần Chủ; …").
 */
export function specChuoiG(): Record<string, string> {
  const dong = dongMuc14('`G` rồi');
  const ra: Record<string, string> = {};
  for (const m of dong.matchAll(/`G` rồi `([A-Z])` tới ([^;.]+)/g)) {
    ra[m[1] ?? ''] = (m[2] ?? '').trim();
  }
  return ra;
}

/** d.416 — "`?` hiện bảng phím" (BAT-23). */
export function specDoiBangPhim(): boolean {
  return /`\?` hiện bảng phím/.test(dongMuc14('bảng phím'));
}

/**
 * Mục 14 gạch "Chọn nhiều và áp cho nhiều thẻ" (BAT-39, #164): ô của thanh chọn
 * nhiều **chỉ đặt giá trị chờ**; `Enter`/mũi tên/Space/gõ chữ không gửi request;
 * **chỉ nút "Áp"** mới áp. Trả từng vế để ca test ghim đủ.
 */
export function specDoiChiNutApChonNhieu(): {
  chi_gia_tri_cho: boolean;
  enter_khong_gui: boolean;
  chi_nut_ap: boolean;
} {
  const dong = dongMuc14('Chọn nhiều và áp cho nhiều thẻ');
  return {
    chi_gia_tri_cho: /Ô trạng thái, ưu tiên, nhãn của thanh chọn nhiều \*\*chỉ đặt giá trị chờ\*\*/.test(dong),
    enter_khong_gui: /`Enter`, mũi tên, Space, gõ chữ trong ô không gửi request/.test(dong),
    chi_nut_ap: /\*\*chỉ nút "Áp"\*\* cạnh mỗi ô mới áp/.test(dong),
  };
}

/**
 * Mục 14 gạch "Có bản mới" (BAT-39 việc 2): tab chạy bản cũ sau deploy hiện dòng
 * "Có bản mới — tải lại trang"; **không bao giờ tự tải lại**.
 */
export function specDoiCoBanMoi(): { co_dong: boolean; khong_tu_tai_lai: boolean } {
  const dong = dongMuc14('Có bản mới — tải lại trang');
  return {
    co_dong: /"Có bản mới — tải lại trang"/.test(dong),
    khong_tu_tai_lai: /\*\*không bao giờ tự tải lại\*\*/.test(dong),
  };
}

/** Mục 4 — "**Ưu tiên:** … Mặc định `Không`." Trả **nhãn** mặc định. */
export function uuTienMacDinhTuSpec(): string {
  const khop = /\*\*Ưu tiên:\*\*.*Mặc định `([^`]+)`/.exec(mucSpec(SPEC_VAN, 4));
  const nhan = khop?.[1];
  if (nhan === undefined) throw new Error('Mục 4 không còn câu "Mặc định `…`" của ưu tiên');
  return nhan;
}

/**
 * Mục 14 gạch "Chế độ màu" (d.406, sửa 29/10 theo T-106 A): ba lựa chọn
 * "**Sáng / Tối / Theo máy**" và "mặc định **…**". Trả nhãn ba lựa chọn theo thứ
 * tự SPEC và nhãn mặc định. Không cắt được ⇒ ném (không để ca xanh vì rỗng).
 */
export function cheDoMauTuSpec(): { lua_chon: string[]; mac_dinh: string } {
  const dong = dongMuc14('**Chế độ màu:**');
  const ba = /ba lựa chọn \*\*([^*]+)\*\*/.exec(dong)?.[1];
  const mac_dinh = /mặc định \*\*([^*]+)\*\*/.exec(dong)?.[1];
  if (ba === undefined || mac_dinh === undefined) {
    throw new Error('Mục 14 gạch "Chế độ màu" không còn "ba lựa chọn **…**" / "mặc định **…**"');
  }
  return { lua_chon: ba.split('/').map((s) => s.trim()), mac_dinh: mac_dinh.trim() };
}

/**
 * Mục 4 bảng trạng thái: nhãn của **dòng** mang "(mặc định khi tạo)" (d.127 —
 * "Cần làm"). Không đúng một dòng ⇒ ném.
 */
export function trangThaiMacDinhKhiTaoTuSpec(): string {
  const dong = mucSpec(SPEC_VAN, 4)
    .split('\n')
    .filter((d) => d.startsWith('|') && d.includes('(mặc định khi tạo)'));
  const nhan = dong.length === 1 ? dong[0]?.split('|')[1]?.trim() : undefined;
  if (nhan === undefined || nhan === '') {
    throw new Error('Mục 4 không còn đúng một dòng trạng thái "(mặc định khi tạo)"');
  }
  return nhan;
}

/**
 * Mục 4 câu "**Trạng thái khi tạo:** mặc định **…**; người tạo được chọn **…**.
 * Mọi trạng thái khác không đặt được lúc tạo (`INVALID_INPUT`)…" (Chủ chốt T-108 =
 * B, BAT-63). Trả nhãn mặc định, các nhãn chọn thêm được, và có câu cấm phần còn
 * lại kèm `INVALID_INPUT` không. Không cắt được ⇒ ném.
 */
export function trangThaiKhiTaoTuSpec(): {
  mac_dinh: string;
  chon_them: string[];
  cam_con_lai: boolean;
} {
  const dong = mucSpec(SPEC_VAN, 4)
    .split('\n')
    .filter((d) => d.startsWith('**Trạng thái khi tạo:**'));
  const cau = dong.length === 1 ? dong[0] : undefined;
  const mac_dinh = cau === undefined ? undefined : /mặc định \*\*([^*]+)\*\*/.exec(cau)?.[1];
  const them = cau === undefined ? undefined : /được chọn ((?:\*\*[^*]+\*\*(?:, | hoặc )?)+)/.exec(cau)?.[1];
  if (cau === undefined || mac_dinh === undefined || them === undefined) {
    throw new Error(
      'Mục 4 không còn đúng một câu "**Trạng thái khi tạo:** mặc định **…**; người tạo được chọn **…**"',
    );
  }
  return {
    mac_dinh: mac_dinh.trim(),
    chon_them: [...them.matchAll(/\*\*([^*]+)\*\*/g)].map((k) => (k[1] ?? '').trim()),
    cam_con_lai: /Mọi trạng thái khác không đặt được lúc tạo \(`INVALID_INPUT`\)/.test(cau),
  };
}

/** Mục 4 — hai trường bắt buộc khi tạo: tiêu đề "(bắt buộc, … sau khi cắt khoảng trắng)". */
export function specDoiTieuDeBatBuoc(): { bat_buoc: boolean; cat_khoang_trang: boolean } {
  const muc4 = mucSpec(SPEC_VAN, 4);
  return {
    bat_buoc: /tiêu đề \(bắt buộc/.test(muc4),
    cat_khoang_trang: /sau khi cắt khoảng trắng/.test(muc4),
  };
}
