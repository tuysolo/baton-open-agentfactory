/**
 * Khai **tối thiểu** của những thứ Node mà cổng kiểm bản build cần.
 *
 * Cùng lý do với `src/node-fs.d.ts` và `TienTrinhNode` ở `src/noi-day.ts`: dự án
 * **không thêm phụ thuộc mới** (`@types/node`), và chỗ này chỉ cần đúng ba việc
 * — sinh một tiến trình con, nói với stdio của nó, biết `import.meta.dirname`.
 * Khai hẹp cũng là một hàng rào: không có `exec`, không có `writeFile`, không
 * có `rm` nào trong tầm với của test (danh sách cấm CLAUDE.md mục 4).
 */

declare module 'node:child_process' {
  export interface LuongDoc {
    setEncoding(ma_hoa: 'utf8'): void;
    on(bien_co: 'data', xu_ly: (manh: string) => void): void;
  }
  export interface LuongGhi {
    write(du_lieu: string): boolean;
    end(): void;
  }
  export interface TienTrinhCon {
    readonly stdin: LuongGhi;
    readonly stdout: LuongDoc;
    readonly stderr: LuongDoc;
    /**
     * `'close'`, **không** `'exit'`: Node chỉ bảo đảm các luồng stdio đã đóng —
     * tức mọi biến cố `'data'` đã phát xong — khi `'close'` nổ. `'exit'` có thể
     * nổ trước mảnh `'data'` cuối, nên đọc stdout ngay sau nó là đỏ giả trên
     * máy đang tải. Chỉ khai `'close'` để không ai lỡ tay dùng lại `'exit'`.
     */
    on(bien_co: 'close', xu_ly: (ma: number | null, tin_hieu: string | null) => void): this;
    on(bien_co: 'error', xu_ly: (loi: Error) => void): this;
    kill(tin_hieu?: 'SIGTERM' | 'SIGKILL'): boolean;
  }
  export function spawn(
    lenh: string,
    doi_so: readonly string[],
    tuy_chon?: { readonly env?: Readonly<Record<string, string>> },
  ): TienTrinhCon;
}

interface ImportMeta {
  /** Thư mục của chính file này — Node >= 20.11 (`engines` của root). */
  readonly dirname: string;
}
