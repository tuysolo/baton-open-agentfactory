/**
 * **BAT-51 — không để câu D1 nào trôi nổi sau khi một lệnh đọc đã ném lỗi.**
 *
 * Một nguồn I/O trôi nổi đã tìm ra: `viecCuaToi` (đường `baton tasks`, chạy cả trong DO qua
 * `choViec`) gom bốn câu đọc vào `Promise.all`. Một câu hỏng thì `Promise.all`
 * reject NGAY, ba câu anh em còn đang đọc D1 mà không ai chờ: request đã trả 500
 * (hay ca test đã kết thúc) trong khi I/O của nó vẫn bay — đúng loại việc làm pool
 * pop storage cô lập hỏng ("Isolated storage failed"). `choHet` chờ hết rồi mới ném.
 */

import { describe, expect, it } from 'vitest';
import { choHet } from '../src/cho-het.js';
import { viecCuaToi } from '../src/doc-viec.js';
import { nghi, soRequestBay, thanQuaSo } from './cho-toi.js';
import { WS, aiAgent } from './giup.js';

describe('choHet — song song mà không để việc nào trôi nổi', () => {
  it('đối chứng: `Promise.all` reject TRƯỚC khi việc anh em xong (đúng hình lỗi gốc)', async () => {
    let xong = 0;
    const cham = nghi(30).then(() => {
      xong += 1;
    });
    await expect(Promise.all([Promise.reject(new Error('hỏng')), cham])).rejects.toThrow('hỏng');
    // Lúc lỗi đã ra tới người gọi, việc anh em VẪN còn chạy.
    expect(xong).toBe(0);
    await cham;
  });

  it('một việc hỏng → chỉ ném SAU KHI mọi việc anh em đã xong, và ném đúng lỗi gốc', async () => {
    let xong = 0;
    const loi = new Error('lỗi gốc của việc hỏng');
    const p = choHet([
      nghi(30).then(() => {
        xong += 1;
      }),
      Promise.reject(loi),
      nghi(60).then(() => {
        xong += 1;
      }),
    ]);
    await expect(p).rejects.toBe(loi);
    expect(xong).toBe(2);
  });

  it('nhiều việc hỏng → ném lỗi của việc hỏng ĐẦU TIÊN theo thứ tự mảng, không nuốt', async () => {
    const a = new Error('a');
    const b = new Error('b');
    await expect(choHet([Promise.resolve(1), Promise.reject(a), Promise.reject(b)])).rejects.toBe(a);
  });

  it('khác `Promise.all` có chủ ý: việc đứng TRƯỚC trong mảng hỏng MUỘN hơn vẫn là lỗi được ném', async () => {
    const muon = new Error('đứng trước, hỏng muộn');
    const som = new Error('đứng sau, hỏng sớm');
    const dung = (): Promise<unknown>[] => [
      nghi(30).then(() => {
        throw muon;
      }),
      Promise.reject(som),
    ];
    // Đối chứng: `Promise.all` ném lỗi hỏng sớm nhất THEO THỜI GIAN.
    const ds_all = dung();
    await expect(Promise.all(ds_all)).rejects.toBe(som);
    await Promise.allSettled(ds_all);
    // `choHet` ném lỗi đứng đầu THEO THỨ TỰ MẢNG — xác định, không phụ thuộc việc nào về trước.
    await expect(choHet(dung())).rejects.toBe(muon);
  });

  it('mọi việc thành → kết quả đúng thứ tự, như `Promise.all`', async () => {
    const [x, y, z] = await choHet([nghi(20).then(() => 'x'), Promise.resolve(2), Promise.resolve(true)]);
    expect([x, y, z]).toEqual(['x', 2, true]);
    expect(await choHet([])).toEqual([]);
  });
});

/**
 * **BAT-53 — sổ `bay` chờ được CẢ THÂN một ca hết giờ.** Vitest không dừng thân ca
 * khi hết giờ; thân bắn tiếp request trong lúc pool pop storage cô lập. `caQuaSo`
 * đưa cả thân vào sổ, và `doiHet` phải chờ tới khi sổ RỖNG — kể cả việc mà thân
 * ghi thêm vào sổ SAU lúc `doiHet` bắt đầu.
 */
describe('soRequestBay + thanQuaSo — không để thân ca trôi nổi', () => {
  it('doiHet chờ thân ca chạy HẾT, kể cả các bước sau lúc bắt đầu chờ', async () => {
    const bay = soRequestBay();
    const buoc: string[] = [];
    const than = thanQuaSo(bay, async () => {
      buoc.push('1');
      await nghi(20);
      buoc.push('2');
      await nghi(20);
      buoc.push('3');
    });
    // Như Vitest khi hết giờ: không chờ thân, đi thẳng tới afterEach.
    void than();
    await bay.doiHet();
    expect(buoc).toEqual(['1', '2', '3']);
  });

  it('việc thân ghi THÊM vào sổ sau lúc doiHet bắt đầu cũng được chờ (sổ phải rỗng)', async () => {
    const bay = soRequestBay();
    let muon_xong = false;
    const than = thanQuaSo(bay, async () => {
      await nghi(10);
      // Không await: như `dang_cho = bay.theoDoi(chayCli(...))` rồi assert đỏ.
      void bay.theoDoi(
        nghi(40).then(() => {
          muon_xong = true;
        }),
      );
    });
    void than();
    await bay.doiHet();
    expect(muon_xong).toBe(true);
  });

  it('thân ném lỗi: doiHet không ném, lỗi vẫn tới người gọi thân (ca vẫn đỏ đúng lỗi)', async () => {
    const bay = soRequestBay();
    const loi = new Error('assert đỏ');
    const than = thanQuaSo(bay, () => {
      throw loi;
    });
    await expect(than()).rejects.toBe(loi);
    await expect(bay.doiHet()).resolves.toBeUndefined();
  });
});

/**
 * D1 giả: câu đọc `phien_hoat_dong hd` (câu hỏi chờ trả lời) hỏng ngay, mọi câu
 * khác trả rỗng sau 30 ms. Đếm số câu đã xong để biết lúc `viecCuaToi` ném lỗi thì
 * còn câu nào đang bay không.
 */
function d1Gia(): { db: D1Database; so_cau: () => number; so_xong: () => number } {
  let so_cau = 0;
  let so_xong = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async all() {
              so_cau += 1;
              if (sql.includes('FROM phien_hoat_dong hd')) {
                throw new Error('D1_ERROR: no such table: phien_hoat_dong (giả lập)');
              }
              await nghi(30);
              so_xong += 1;
              return { results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, so_cau: () => so_cau, so_xong: () => so_xong };
}

describe('viecCuaToi — một câu D1 hỏng thì không để ba câu kia trôi nổi', () => {
  it('lúc lỗi ra tới người gọi, MỌI câu đọc anh em đã xong', async () => {
    const gia = d1Gia();
    await expect(
      viecCuaToi(
        gia.db,
        WS,
        { loai: 'agent', ai: aiAgent('worker', { agent_id: 'ag-wk' }), token_bam: null },
        Date.now(),
      ),
    ).rejects.toThrow('no such table');
    // Bốn câu được gửi (lượt giao, câu hỏi, phiên, resolved_asks); câu hỏi hỏng,
    // ba câu còn lại phải đã xong — không câu nào còn đọc D1 sau khi lệnh đã ném.
    expect(gia.so_cau()).toBe(4);
    expect(gia.so_xong()).toBe(3);
  });
});
