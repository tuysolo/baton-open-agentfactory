/**
 * **BAT-33 — giao việc cho agent từ web.** SPEC mục 14 d.415 (`A` giao — chọn
 * agent), d.416 (`?`), d.418 (toast lỗi nguyên văn), d.404 (tên agent, không id);
 * mục 5 (tạo lượt giao: brief lấy từ ticket, sửa riêng cho lượt; một lượt mở;
 * agent `disabled` ⇒ `FORBIDDEN`); mục 3 (agent `disabled`).
 *
 * Hai lối vào (phím `A` ở danh sách, nút "Giao việc" ở chi tiết) mở **một** hộp
 * (`vo/giao-viec.tsx`). Hộp không lạc quan: lượt mới chỉ hiện khi máy chủ trả và chi
 * tiết được làm mới.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, type JSX } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThanChiTietTicket, TrangChiTietTicket } from '../src/trang/chi-tiet-ticket';
import { TrangDanhSachTicket } from '../src/trang/danh-sach-ticket';
import {
  CAU_DANG_TAI_AGENT,
  CAU_KHONG_CO_AGENT,
  CAU_KHONG_CO_AGENT_BAT,
  GOI_Y_BRIEF,
  HopGiaoViec,
  NHAN_AGENT_DA_TAT,
  NHAN_NUT_GIAO_VIEC,
  NHAN_SUA_BRIEF,
  chonDuoc,
  thanGiaoViec,
} from '../src/vo/giao-viec';
import { MUC_BRIEF } from '../src/api';
import { CAU_DA_HUY_GIAO } from '../src/huy-gui';
import { MayChuGia, dung, type LoiGoi } from './giup';
import {
  THAN_DU_AN,
  dong,
  luotGiao,
  manHinhDanhSach,
  manHinhTicket,
  ticketDayDu,
} from './than-ticket';

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true);
  });
  vi.restoreAllMocks();
});

const doi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Danh sách agent: hai agent dùng được, một agent đã tắt (mục 3). */
const THAN_AGENT_GIAO = {
  items: [
    { id: 'ag-a', ten: 'W-builder', vai_tro: 'worker', nhan_vai_tro: 'Worker', disabled: false },
    { id: 'ag-b', ten: 'M-baton', vai_tro: 'manager', nhan_vai_tro: 'Manager', disabled: false },
    { id: 'ag-c', ten: 'R-cu', vai_tro: 'reviewer', nhan_vai_tro: 'Reviewer', disabled: true },
  ],
  cursor_sau: null,
};

const KQ_GIAO = {
  id: 'lg-moi',
  ticket_id: 'tk-SAI-1',
  so_luot: 1,
  loai: 'work',
  trang_thai: 'pending',
  nguoi_nhan_agent_id: 'ag-b',
  han_phan_hoi_luc: null,
  ticket_trang_thai: 'in_progress',
};

const DUONG_POST = '/v1/ticket/tk-SAI-1/luot-giao';

/** Thân chi tiết TRƯỚC khi giao: `todo`, chưa lượt nào, không ai cầm. */
function chiTietTruoc(ma = 'SAI-1'): ReturnType<typeof manHinhTicket> {
  return manHinhTicket(ticketDayDu({ ma, trang_thai: 'todo', nhom_trang_thai: 'planned' }));
}

/** Thân chi tiết SAU khi giao cho M-baton: Đang làm, M-baton cầm, lượt #1 Chờ nhận. */
function chiTietSau(): ReturnType<typeof manHinhTicket> {
  return manHinhTicket(
    ticketDayDu({
      ma: 'SAI-1',
      trang_thai: 'in_progress',
      nguoi_dang_cam: { loai: 'agent', agentId: 'ag-b' },
    }),
    {
      luot_giao: [
        luotGiao({
          so_luot: 1,
          id: 'lg-moi',
          trang_thai: 'pending',
          nhan_trang_thai: 'Chờ nhận',
          nguoi_nhan: { loai: 'agent', agentId: 'ag-b' },
        }),
      ],
    },
  );
}

/** Cửa treo phản hồi — để dựng ca "máy chủ CHƯA trả lời". */
function cuaTreo(): { cho: Promise<void>; mo: () => void } {
  let mo = (): void => undefined;
  const cho = new Promise<void>((r) => {
    mo = () => r();
  });
  return { cho, mo };
}

/* ------------------------------------------------------------------ *
 * Máy chủ giả cho trang CHI TIẾT
 * ------------------------------------------------------------------ */

interface KhoChiTiet {
  da_giao: boolean;
  loi: { error: string; message: string } | null;
  cho: Promise<void> | null;
}

function mayChiTiet(): { m: MayChuGia; kho: KhoChiTiet } {
  const kho: KhoChiTiet = { da_giao: false, loi: null, cho: null };
  const m = new MayChuGia()
    .dat('GET /v1/agent', { than: THAN_AGENT_GIAO })
    .dat('GET /v1/man-hinh-ticket/ma/SAI-1', () => ({
      than: kho.da_giao ? chiTietSau() : chiTietTruoc(),
    }))
    .dat('GET /v1/man-hinh-ticket/ma/SAI-2', { than: chiTietTruoc('SAI-2') })
    .dat(`POST ${DUONG_POST}`, () => {
      if (kho.loi !== null) {
        return kho.cho === null ? { loi: kho.loi, http: 409 } : { loi: kho.loi, http: 409, cho: kho.cho };
      }
      kho.da_giao = true;
      return kho.cho === null ? { than: KQ_GIAO, http: 201 } : { than: KQ_GIAO, http: 201, cho: kho.cho };
    })
    .dat('POST /v1/ticket/tk-SAI-2/luot-giao', { than: { ...KQ_GIAO, ticket_id: 'tk-SAI-2' } })
    .gan();
  return { m, kho };
}

function hop(): HTMLElement {
  const h = document.querySelector<HTMLElement>('[data-o="hop-giao-viec"]');
  expect(h).not.toBeNull();
  return h!;
}

const coHop = (): boolean => document.querySelector('[data-o="hop-giao-viec"]') !== null;
const oAgent = (): HTMLSelectElement => hop().querySelector<HTMLSelectElement>('[data-nhap="agent"]')!;
const soPost = (m: { da_goi: LoiGoi[] }, duong = DUONG_POST): number =>
  m.da_goi.filter((l) => l.method === 'POST' && l.duong === duong).length;
const cauToast = (): string[] =>
  [...document.querySelectorAll('[data-toast="loi"] span')].map((e) => e.textContent ?? '');

async function moChiTiet(): Promise<{ m: MayChuGia; kho: KhoChiTiet }> {
  const r = mayChiTiet();
  dung(<TrangChiTietTicket ma="SAI-1" />, '/t/SAI-1');
  await screen.findByRole('button', { name: NHAN_NUT_GIAO_VIEC });
  return r;
}

async function moHopBangNut(): Promise<HTMLButtonElement> {
  const nut = screen.getByRole('button', { name: NHAN_NUT_GIAO_VIEC });
  await userEvent.click(nut);
  await waitFor(() => {
    expect(coHop()).toBe(true);
  });
  // Danh sách agent đã về (ô chọn có đủ ba agent).
  await waitFor(() => {
    expect(oAgent().options.length).toBe(1 + THAN_AGENT_GIAO.items.length);
  });
  return nut as HTMLButtonElement;
}

/* ================================================================== *
 * 1. Hàm thuần
 * ================================================================== */

describe('thanGiaoViec — chỉ mục brief ĐÃ NHẬP (mục 5: brief lấy từ ticket nếu không sửa)', () => {
  it('không gõ gì ⇒ chỉ người nhận (không mục brief nào, không loai_luot, không hạn)', () => {
    expect(thanGiaoViec('ag-a', {})).toEqual({ nguoi_nhan_agent_id: 'ag-a' });
  });

  it('ô rỗng hay chỉ khoảng trắng ⇒ KHÔNG gửi (gửi rỗng là máy chủ xoá mục đó khỏi lượt)', () => {
    const than = thanGiaoViec('ag-a', { muc_tieu: 'Làm X', boi_canh: '', pham_vi: '   \n ' });
    expect(than).toEqual({ nguoi_nhan_agent_id: 'ag-a', muc_tieu: 'Làm X' });
    expect(Object.keys(than)).not.toContain('boi_canh');
    expect(Object.keys(than)).not.toContain('pham_vi');
  });

  it('đủ tám mục có chữ ⇒ gửi đủ tám, đúng tên trường của máy chủ', () => {
    const brief = Object.fromEntries(MUC_BRIEF.map((m) => [m, `chữ ${m}`]));
    expect(thanGiaoViec('ag-b', brief)).toEqual({ nguoi_nhan_agent_id: 'ag-b', ...brief });
  });

  it('agent đã tắt không chọn được (mục 3, mục 5)', () => {
    expect(chonDuoc({ disabled: true })).toBe(false);
    expect(chonDuoc({ disabled: false })).toBe(true);
    expect(chonDuoc({})).toBe(true);
  });
});

/* ================================================================== *
 * 2. Chi tiết ticket — nút "Giao việc"
 * ================================================================== */

describe('chi tiết ticket: nút "Giao việc" mở hộp chọn agent', () => {
  it('mở hộp: dialog có nhãn, focus ở ô agent, chỉ TÊN agent (không id), agent đã tắt không chọn được', async () => {
    await moChiTiet();
    await moHopBangNut();
    const h = hop();
    expect(h.getAttribute('role')).toBe('dialog');
    expect(h.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('dialog', { name: /Giao việc SAI-1/ })).toBe(h);
    expect(document.activeElement).toBe(oAgent());

    const opts = [...oAgent().options];
    expect(opts.map((o) => o.textContent)).toEqual([
      '— Chọn agent —',
      'W-builder · Worker',
      'M-baton · Manager',
      `R-cu · Reviewer (${NHAN_AGENT_DA_TAT})`,
    ]);
    expect(opts.find((o) => o.value === 'ag-c')?.disabled).toBe(true);
    expect(opts.find((o) => o.value === 'ag-a')?.disabled).toBe(false);
    // d.404: không một id nào lên màn hình.
    expect(h.textContent).not.toMatch(/ag-[abc]/);
  });

  it('chọn agent, KHÔNG sửa brief, gửi ⇒ đúng MỘT POST, thân chỉ có người nhận', async () => {
    const { m } = await moChiTiet();
    await moHopBangNut();
    await userEvent.selectOptions(oAgent(), 'ag-b');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
    await waitFor(() => {
      expect(soPost(m)).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({ nguoi_nhan_agent_id: 'ag-b' });
    await doi(30);
    expect(soPost(m)).toBe(1);
  });

  it('có sửa brief (một mục có chữ, một mục chỉ khoảng trắng) ⇒ thân chỉ mang mục có chữ', async () => {
    const { m } = await moChiTiet();
    await moHopBangNut();
    await userEvent.selectOptions(oAgent(), 'ag-a');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_SUA_BRIEF }));
    const o = (muc: string): HTMLTextAreaElement =>
      hop().querySelector<HTMLTextAreaElement>(`[data-nhap-brief="${muc}"]`)!;
    expect(hop().querySelectorAll('[data-nhap-brief]')).toHaveLength(8);
    expect(o('muc_tieu').placeholder).toBe(GOI_Y_BRIEF);
    await userEvent.type(o('muc_tieu'), 'Làm phần giao việc');
    fireEvent.change(o('dieu_cam'), { target: { value: '   ' } });
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
    await waitFor(() => {
      expect(soPost(m)).toBe(1);
    });
    expect(m.da_goi.find((l) => l.method === 'POST')?.than).toEqual({
      nguoi_nhan_agent_id: 'ag-a',
      muc_tieu: 'Làm phần giao việc',
    });
  });

  it('chưa chọn agent mà bấm gửi ⇒ không gọi máy chủ, báo thiếu, focus về ô agent', async () => {
    const { m } = await moChiTiet();
    await moHopBangNut();
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
    expect(hop().querySelector('[data-loi="agent"]')).not.toBeNull();
    expect(document.activeElement).toBe(oAgent());
    await doi(30);
    expect(soPost(m)).toBe(0);
  });

  it('gửi ĐÚP đồng bộ (hai submit, hai click trong cùng một nhịp) ⇒ vẫn MỘT POST', async () => {
    const { m, kho } = await moChiTiet();
    const treo = cuaTreo();
    kho.cho = treo.cho;
    await moHopBangNut();
    fireEvent.change(oAgent(), { target: { value: 'ag-b' } });
    const form = hop().querySelector('form')!;
    const nut = hop().querySelector<HTMLButtonElement>('[data-nut="gui-giao"]')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.click(nut);
    fireEvent.click(nut);
    await waitFor(() => {
      expect(soPost(m)).toBe(1);
    });
    await doi(30);
    expect(soPost(m)).toBe(1);
    treo.mo();
    await waitFor(() => {
      expect(coHop()).toBe(false);
    });
    expect(soPost(m)).toBe(1);
  });

  it('thành công ⇒ hộp đóng, chi tiết hiện lượt mới (TÊN agent, trạng thái), người cầm + trạng thái mới — không tải lại trang', async () => {
    const { m } = await moChiTiet();
    expect(document.querySelector('[data-so="luot-giao"]')?.textContent).toBe('0');
    const truoc_tt = document.querySelector('header [data-o="trang-thai"]')?.textContent;
    const nut = await moHopBangNut();
    await userEvent.selectOptions(oAgent(), 'ag-b');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));

    // Làm mới NGAY sau khi máy chủ nhận — không chờ nhịp 2 giây.
    await waitFor(
      () => {
        expect(m.soLan('GET', '/v1/man-hinh-ticket/ma/SAI-1')).toBe(2);
      },
      { timeout: 500 },
    );
    await waitFor(() => {
      expect(document.querySelector('[data-so="luot-giao"]')?.textContent).toBe('1');
    });
    expect(coHop()).toBe(false);
    expect(document.activeElement).toBe(nut);

    const luot = document.querySelector<HTMLElement>('[data-luot="1"]')!;
    expect(luot.querySelector('[data-o="giao-nhan"]')?.textContent).toBe('Chủ (chủ) → M-baton');
    expect(luot.querySelector('[data-o="trang-thai"]')?.textContent).toBe('Chờ nhận');
    expect(
      document.querySelector('[data-thuoc-tinh="nguoi-dang-cam"] dd')?.textContent,
    ).toBe('M-baton');
    const sau_tt = document.querySelector('header [data-o="trang-thai"]')?.textContent;
    expect(sau_tt).toBe(chiTietSau().ticket.nhan_trang_thai);
    expect(sau_tt).not.toBe(truoc_tt);
    // d.404: id agent không lên màn hình.
    expect(document.querySelector('[data-o="chi-tiet-ticket"]')?.textContent).not.toMatch(/ag-b/);
  });

  for (const [ma_loi, cau] of [
    ['ASSIGNMENT_OPEN', 'Ticket đã có một lượt giao đang mở (SPEC mục 5).'],
    ['FORBIDDEN', 'Người nhận không được vào dự án của ticket này.'],
    ['INVALID_INPUT', 'muc_tieu tối đa 20000 ký tự.'],
  ] as const) {
    it(`máy chủ từ chối (${ma_loi}) ⇒ toast NGUYÊN VĂN, hộp còn mở + giữ lựa chọn, không lượt mới, ticket không đổi`, async () => {
      const { m, kho } = await moChiTiet();
      kho.loi = { error: ma_loi, message: cau };
      const truoc_tt = document.querySelector('header [data-o="trang-thai"]')?.textContent;
      await moHopBangNut();
      await userEvent.selectOptions(oAgent(), 'ag-b');
      await userEvent.click(within(hop()).getByRole('button', { name: NHAN_SUA_BRIEF }));
      await userEvent.type(
        hop().querySelector<HTMLTextAreaElement>('[data-nhap-brief="muc_tieu"]')!,
        'Giữ chữ này',
      );
      await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
      await waitFor(() => {
        expect(cauToast()).toContain(cau);
      });
      expect(soPost(m)).toBe(1);
      // Hộp giữ nguyên: còn mở, agent còn chọn, brief còn chữ, nút gửi lại bấm được.
      expect(coHop()).toBe(true);
      expect(oAgent().value).toBe('ag-b');
      expect(
        hop().querySelector<HTMLTextAreaElement>('[data-nhap-brief="muc_tieu"]')!.value,
      ).toBe('Giữ chữ này');
      await waitFor(() => {
        expect(hop().querySelector<HTMLButtonElement>('[data-nut="gui-giao"]')!.disabled).toBe(false);
      });
      // Không giả thành công: không lượt mới, trạng thái ticket như cũ, không ai cầm.
      expect(document.querySelector('[data-so="luot-giao"]')?.textContent).toBe('0');
      expect(document.querySelector('[data-luot]')).toBeNull();
      expect(document.querySelector('header [data-o="trang-thai"]')?.textContent).toBe(truoc_tt);
      expect(document.querySelector('[data-thuoc-tinh="nguoi-dang-cam"] dd')?.textContent).toBe('—');

      // Gửi lại được (chốt `useMotLan` đã thả ở nhánh lỗi).
      kho.loi = null;
      await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
      await waitFor(() => {
        expect(soPost(m)).toBe(2);
      });
    });
  }
});

/* ================================================================== *
 * 3. Hộp: Esc, Tab vòng, focus trả về
 * ================================================================== */

describe('hộp giao việc: Esc đóng, Tab vòng trong hộp, đóng thì trả focus', () => {
  it('Esc đóng hộp và trả focus về nút "Giao việc"; không gọi máy chủ', async () => {
    const { m } = await moChiTiet();
    const nut = await moHopBangNut();
    await userEvent.keyboard('{Escape}');
    expect(coHop()).toBe(false);
    expect(document.activeElement).toBe(nut);
    expect(soPost(m)).toBe(0);
  });

  it('Esc khi đang soạn IME ⇒ KHÔNG đóng', async () => {
    await moChiTiet();
    await moHopBangNut();
    fireEvent.keyDown(oAgent(), { key: 'Escape', isComposing: true });
    expect(coHop()).toBe(true);
  });

  it('Esc lúc đang gửi ⇒ KHÔNG đóng (chờ máy chủ trả lời)', async () => {
    const { kho } = await moChiTiet();
    const treo = cuaTreo();
    kho.cho = treo.cho;
    await moHopBangNut();
    fireEvent.change(oAgent(), { target: { value: 'ag-b' } });
    fireEvent.submit(hop().querySelector('form')!);
    await waitFor(() => {
      expect(hop().querySelector<HTMLButtonElement>('[data-nut="gui-giao"]')!.disabled).toBe(true);
    });
    fireEvent.keyDown(hop(), { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(coHop()).toBe(true);
    treo.mo();
    await waitFor(() => {
      expect(coHop()).toBe(false);
    });
  });

  it('nút Huỷ đóng hộp, trả focus về nút mở', async () => {
    await moChiTiet();
    const nut = await moHopBangNut();
    await userEvent.click(within(hop()).getByRole('button', { name: 'Huỷ' }));
    expect(coHop()).toBe(false);
    expect(document.activeElement).toBe(nut);
  });

  it('Tab từ phần tử cuối về ô agent; Shift+Tab từ ô agent về phần tử cuối; nhiều lần Tab không thoát hộp', async () => {
    await moChiTiet();
    await moHopBangNut();
    const h = hop();
    const cuoi = h.querySelector<HTMLButtonElement>('[data-nut="gui-giao"]')!;
    cuoi.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(oAgent());
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(cuoi);
    for (let i = 0; i < 8; i++) {
      await userEvent.tab();
      expect(h.contains(document.activeElement), `Tab lần ${String(i + 1)}`).toBe(true);
    }
    // Focus ra ngoài (body) rồi Tab ⇒ vào lại hộp.
    (document.activeElement as HTMLElement).blur();
    await userEvent.tab();
    expect(h.contains(document.activeElement)).toBe(true);
  });

  it('phím trong hộp không lọt ra trang: `J`/`Esc` của danh sách không chạy khi hộp mở', async () => {
    mayDanhSach();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choThe('SAI-1');
    await userEvent.keyboard('a');
    await waitFor(() => {
      expect(coHop()).toBe(true);
    });
    await userEvent.keyboard('j');
    // Panel vẫn ở thẻ cũ (J không đổi thẻ), hộp vẫn của SAI-1.
    expect(document.querySelector('[data-o="panel-the"]')?.getAttribute('data-ma')).toBe('SAI-1');
    await userEvent.keyboard('{Escape}');
    expect(coHop()).toBe(false);
    // Esc đầu đóng HỘP, không đóng panel phía sau.
    expect(document.querySelector('[data-o="panel-the"]')).not.toBeNull();
  });
});

/* ================================================================== *
 * 4. Đích trong BIẾN của mutate (BAT-29)
 * ================================================================== */

function VoDoi({ ve }: { ve: (ma: string) => JSX.Element }): JSX.Element {
  const [ma, datMa] = useState('SAI-1');
  return (
    <>
      <button type="button" onClick={() => datMa('SAI-2')}>
        sang thẻ B
      </button>
      <button type="button" onClick={() => datMa('SAI-1')}>
        về thẻ A
      </button>
      {ve(ma)}
    </>
  );
}

const SAI_1 = { id: 'tk-SAI-1', ma: 'SAI-1' };
const SAI_2 = { id: 'tk-SAI-2', ma: 'SAI-2' };

describe('panel đổi thẻ khi hộp Giao việc đang mở (Back/Forward đổi `?the=`)', () => {
  async function dungVoDoi(): Promise<MayChuGia> {
    const { m } = mayChiTiet();
    const { qc } = dung(<VoDoi ve={(ma) => <ThanChiTietTicket ma={ma} />} />, '/t/SAI-1');
    // Thẻ B có sẵn trong cache: đổi sang B không qua màn "Đang tải" — hộp chỉ đóng
    // nếu mã thật sự đóng nó, không vì thân bị tháo.
    qc.setQueryData(['ticket', 'chi-tiet', 'SAI-2'], chiTietTruoc('SAI-2'));
    await screen.findByRole('button', { name: NHAN_NUT_GIAO_VIEC });
    return m;
  }

  it('mở ở SAI-1, chọn agent + gõ brief, đổi sang SAI-2 ⇒ hộp ĐÓNG; mở lại ở SAI-2 ⇒ hộp trống; không POST nào', async () => {
    const m = await dungVoDoi();
    await moHopBangNut();
    await userEvent.selectOptions(oAgent(), 'ag-b');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_SUA_BRIEF }));
    await userEvent.type(
      hop().querySelector<HTMLTextAreaElement>('[data-nhap-brief="muc_tieu"]')!,
      'Của thẻ A',
    );

    fireEvent.click(screen.getByRole('button', { name: 'sang thẻ B' }));
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-2');
    });
    expect(coHop()).toBe(false);

    // Về lại A: hộp KHÔNG tự mở lại.
    fireEvent.click(screen.getByRole('button', { name: 'về thẻ A' }));
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-1');
    });
    expect(coHop()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'sang thẻ B' }));
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-2');
    });

    // Mở ở B: hộp của B, trống — agent chưa chọn, brief đóng; bấm gửi ⇒ không POST.
    await moHopBangNut();
    expect(hop().getAttribute('data-ma')).toBe('SAI-2');
    expect(oAgent().value).toBe('');
    expect(hop().querySelector('[data-nhap-brief]')).toBeNull();
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
    await doi(30);
    expect(m.da_goi.filter((l) => l.method === 'POST')).toHaveLength(0);
  });

  /*
   * BAT-34 việc 2 ĐỔI hành vi có chủ ý: trước đây lượt đang chờ mạng vẫn bay vào
   * tk-SAI-1 sau khi hộp tháo; nay hộp tháo lúc lượt còn chờ mạng = HUỶ GỬI. Nguyên
   * tắc "không đổi đích ngầm" vẫn giữ: không gì vào SAI-2.
   */
  it('giao ở SAI-1 khi mất mạng (đang chờ), đổi sang SAI-2 ⇒ hộp đóng = HUỶ; có mạng lại ⇒ 0 POST (cả tk-SAI-1 lẫn SAI-2) + toast huỷ', async () => {
    const m = await dungVoDoi();
    await moHopBangNut();
    fireEvent.change(oAgent(), { target: { value: 'ag-b' } });
    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.submit(hop().querySelector('form')!);
    await doi(20);
    expect(soPost(m)).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'sang thẻ B' }));
    await waitFor(() => {
      expect(document.querySelector('[data-o="ma"]')?.textContent).toBe('SAI-2');
    });
    expect(coHop()).toBe(false);

    act(() => {
      onlineManager.setOnline(true);
    });
    await doi(50);
    expect(soPost(m)).toBe(0);
    expect(soPost(m, '/v1/ticket/tk-SAI-2/luot-giao')).toBe(0);
    expect([...document.querySelectorAll('[data-toast="tin"] span')].map((e) => e.textContent)).toEqual([
      CAU_DA_HUY_GIAO,
    ]);
    expect(cauToast()).toEqual([]);
  });
});

/**
 * Hợp đồng của chính hộp: `ticket` (prop) đổi trong lúc lượt gửi đang dừng ⇒ lượt đó
 * vẫn mang đích LÚC BẤM (BAT-29). Trang không còn đổi `ticket` của một hộp đang mở
 * (hộp đóng khi thẻ đổi), nên ca này dựng hộp trực tiếp.
 */
function VoHop(): JSX.Element {
  const [t, datT] = useState(SAI_1);
  return (
    <>
      <button type="button" onClick={() => datT(SAI_2)}>
        sang thẻ B
      </button>
      <HopGiaoViec ticket={t} dong={() => undefined} />
    </>
  );
}

describe('đích trong BIẾN: hộp gửi ở thẻ A khi mất mạng, prop ticket đổi sang B, có mạng lại', () => {
  it('⇒ POST vào ticket A (không B)', async () => {
    const { m } = mayChiTiet();
    dung(<VoHop />, '/t/SAI-1');
    await waitFor(() => {
      expect(oAgent().options.length).toBe(1 + THAN_AGENT_GIAO.items.length);
    });
    fireEvent.change(oAgent(), { target: { value: 'ag-b' } });
    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.submit(hop().querySelector('form')!);
    await doi(20);
    expect(soPost(m)).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'sang thẻ B' }));
    await waitFor(() => {
      expect(hop().getAttribute('data-ma')).toBe('SAI-2');
    });
    act(() => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => {
      expect(soPost(m)).toBe(1);
    });
    await doi(30);
    expect(soPost(m, '/v1/ticket/tk-SAI-2/luot-giao')).toBe(0);
  });
});

/* ================================================================== *
 * 4b. Danh sách agent: đang tải / lỗi tải / rỗng
 * ================================================================== */

describe('ô agent: ba nhánh không có agent để chọn ⇒ nói rõ, nút Giao khoá', () => {
  const nutGui = (): HTMLButtonElement => hop().querySelector<HTMLButtonElement>('[data-nut="gui-giao"]')!;

  it('đang tải ⇒ "Đang tải danh sách agent…", nút Giao khoá', () => {
    new MayChuGia().dat('GET /v1/agent', { than: THAN_AGENT_GIAO, cho: new Promise(() => undefined) }).gan();
    dung(<HopGiaoViec ticket={SAI_1} dong={() => undefined} />);
    expect(hop().querySelector('[data-o="agent-dang-tai"]')?.textContent).toBe(CAU_DANG_TAI_AGENT);
    expect(nutGui().disabled).toBe(true);
    expect(hop().querySelector('[data-o="agent-rong"]')).toBeNull();
  });

  it('lỗi tải ⇒ câu lỗi NGUYÊN VĂN của máy chủ (cauLoi), nút Giao khoá', async () => {
    const LOI = 'Phiên đăng nhập đã hết hạn.';
    new MayChuGia().dat('GET /v1/agent', { loi: { error: 'INVALID_TOKEN', message: LOI }, http: 401 }).gan();
    dung(<HopGiaoViec ticket={SAI_1} dong={() => undefined} />);
    await waitFor(() => {
      expect(hop().querySelector('[data-loi="agent-tai"]')?.textContent).toBe(LOI);
    });
    expect(nutGui().disabled).toBe(true);
    expect(hop().querySelector('[data-o="agent-dang-tai"]')).toBeNull();
  });

  it('danh sách rỗng ⇒ "Chưa có agent nào.", nút Giao khoá, bấm không gửi gì', async () => {
    const m = new MayChuGia().dat('GET /v1/agent', { than: { items: [], cursor_sau: null } }).gan();
    dung(<HopGiaoViec ticket={SAI_1} dong={() => undefined} />);
    await waitFor(() => {
      expect(hop().querySelector('[data-o="agent-rong"]')?.textContent).toBe(CAU_KHONG_CO_AGENT);
    });
    expect(nutGui().disabled).toBe(true);
    fireEvent.click(nutGui());
    await doi(20);
    expect(m.da_goi.filter((l) => l.method === 'POST')).toHaveLength(0);
  });

  it('chỉ có agent đã tắt ⇒ "Không có agent nào đang bật.", nút Giao khoá', async () => {
    new MayChuGia()
      .dat('GET /v1/agent', { than: { items: [THAN_AGENT_GIAO.items[2]], cursor_sau: null } })
      .gan();
    dung(<HopGiaoViec ticket={SAI_1} dong={() => undefined} />);
    await waitFor(() => {
      expect(hop().querySelector('[data-o="agent-rong"]')?.textContent).toBe(CAU_KHONG_CO_AGENT_BAT);
    });
    expect(nutGui().disabled).toBe(true);
  });

  it('đối chứng: có agent đang bật ⇒ không câu nào trong ba câu trên, nút Giao bật', async () => {
    new MayChuGia().dat('GET /v1/agent', { than: THAN_AGENT_GIAO }).gan();
    dung(<HopGiaoViec ticket={SAI_1} dong={() => undefined} />);
    await waitFor(() => {
      expect(oAgent().options.length).toBe(1 + THAN_AGENT_GIAO.items.length);
    });
    expect(nutGui().disabled).toBe(false);
    expect(hop().querySelector('[data-o="agent-rong"], [data-o="agent-dang-tai"], [data-loi="agent-tai"]')).toBeNull();
  });
});

/* ================================================================== *
 * 5. Danh sách — phím `A` trên ticket đang chọn
 * ================================================================== */

function mayDanhSach(): { m: MayChuGia; kho: { loi: { error: string; message: string } | null } } {
  const kho = { loi: null as { error: string; message: string } | null };
  const m = new MayChuGia()
    .dat('GET /v1/du-an?limit=200', { than: THAN_DU_AN })
    .dat('GET /v1/agent', { than: THAN_AGENT_GIAO })
    .dat(`POST ${DUONG_POST}`, () => (kho.loi === null ? { than: KQ_GIAO, http: 201 } : { loi: kho.loi }))
    .gan();
  const may_fetch = globalThis.fetch;
  const trang = manHinhDanhSach([dong({ ma: 'SAI-1' }), dong({ ma: 'SAI-2' })]);
  // Đường màn hình nhận mọi chuỗi truy vấn ⇒ bọc một lớp (nếp `danh-sach-ticket.test.tsx`).
  globalThis.fetch = ((duong: string, init?: RequestInit) => {
    const ma = /^\/v1\/man-hinh-ticket\/ma\/(.+)$/.exec(duong)?.[1];
    const tra = (than: unknown): Promise<Response> => {
      m.da_goi.push({ duong, method: init?.method ?? 'GET', than: undefined });
      return Promise.resolve(
        new Response(JSON.stringify(than), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    };
    if (ma !== undefined) return tra(chiTietTruoc(decodeURIComponent(ma)));
    if (duong.startsWith('/v1/man-hinh-ticket')) return tra(trang);
    return may_fetch(duong, init);
  }) as typeof globalThis.fetch;
  return { m, kho };
}

async function choThe(ma: string): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector(`[data-mo-the="${ma}"]`)).not.toBeNull();
  });
}

const soGetDanhSach = (m: MayChuGia): number =>
  m.da_goi.filter((l) => l.method === 'GET' && /^\/v1\/man-hinh-ticket(\?|$)/.test(l.duong)).length;

describe('danh sách: phím `A` trên ticket đang chọn mở hộp giao việc (d.415)', () => {
  it('`A` khi có thẻ chọn ⇒ hộp của ĐÚNG thẻ đó, focus ô agent; gửi ⇒ POST ticket đó, danh sách làm mới', async () => {
    const { m } = mayDanhSach();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choThe('SAI-1');
    await userEvent.keyboard('A');
    await waitFor(() => {
      expect(coHop()).toBe(true);
    });
    const hops = document.querySelectorAll('[data-o="hop-giao-viec"]');
    expect(hops).toHaveLength(1);
    expect(hop().getAttribute('data-ma')).toBe('SAI-1');
    expect(document.activeElement).toBe(oAgent());
    // `preventDefault`: chữ `a` không rơi vào ô vừa được focus.
    expect(oAgent().value).toBe('');

    await waitFor(() => {
      expect(oAgent().options.length).toBe(4);
    });
    const truoc = soGetDanhSach(m);
    await userEvent.selectOptions(oAgent(), 'ag-a');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
    await waitFor(() => {
      expect(coHop()).toBe(false);
    });
    expect(m.da_goi.filter((l) => l.method === 'POST').map((l) => [l.duong, l.than])).toEqual([
      [DUONG_POST, { nguoi_nhan_agent_id: 'ag-a' }],
    ]);
    await waitFor(
      () => {
        expect(soGetDanhSach(m)).toBeGreaterThan(truoc);
      },
      { timeout: 500 },
    );
  });

  it('`A` mở bằng phím, Esc đóng ⇒ focus về nút "Mở" của thẻ đang chọn', async () => {
    mayDanhSach();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choThe('SAI-1');
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard('a');
    await waitFor(() => {
      expect(coHop()).toBe(true);
    });
    await userEvent.keyboard('{Escape}');
    expect(coHop()).toBe(false);
    expect(document.activeElement).toBe(document.querySelector('[data-mo-the="SAI-1"]'));
  });

  it('`A` khi CHƯA chọn thẻ ⇒ không làm gì', async () => {
    mayDanhSach();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang');
    await choThe('SAI-1');
    await userEvent.keyboard('a');
    await doi(20);
    expect(coHop()).toBe(false);
  });

  it('máy chủ từ chối ⇒ toast nguyên văn, hộp còn mở', async () => {
    const { kho } = mayDanhSach();
    const LOI = 'Không giao việc cho agent đã bị tắt.';
    kho.loi = { error: 'FORBIDDEN', message: LOI };
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choThe('SAI-1');
    await userEvent.keyboard('a');
    await waitFor(() => {
      expect(oAgent().options.length).toBe(4);
    });
    await userEvent.selectOptions(oAgent(), 'ag-b');
    await userEvent.click(within(hop()).getByRole('button', { name: NHAN_NUT_GIAO_VIEC }));
    await waitFor(() => {
      expect(cauToast()).toContain(LOI);
    });
    expect(coHop()).toBe(true);
    expect(oAgent().value).toBe('ag-b');
  });

  it('KHÔNG bắt `A`: đang gõ trong input/textarea, trong con của contenteditable, IME, phím bổ trợ', async () => {
    mayDanhSach();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choThe('SAI-1');

    const o = document.createElement('input');
    const vb = document.createElement('textarea');
    const vung = document.createElement('div');
    vung.setAttribute('contenteditable', 'true');
    const con = document.createElement('span');
    vung.appendChild(con);
    document.body.append(o, vb, vung);
    try {
      await userEvent.type(o, 'aA');
      expect(o.value).toBe('aA');
      await userEvent.type(vb, 'a');
      expect(vb.value).toBe('a');
      expect(coHop()).toBe(false);
      // `fireEvent` trả `true` khi không ai `preventDefault` — tức phím không bị bắt.
      expect(fireEvent.keyDown(con, { key: 'a' })).toBe(true);
      expect(coHop()).toBe(false);
    } finally {
      o.remove();
      vb.remove();
      vung.remove();
    }
    expect(fireEvent.keyDown(document.body, { key: 'a', isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: 'a', keyCode: 229 })).toBe(true);
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.keyboard('{Meta>}a{/Meta}');
    await userEvent.keyboard('{Alt>}a{/Alt}');
    await doi(20);
    expect(coHop()).toBe(false);

    // Đối chứng: `a` trần ngoài các ca trên thì CÓ mở hộp.
    expect(fireEvent.keyDown(document.body, { key: 'a' })).toBe(false);
    await waitFor(() => {
      expect(coHop()).toBe(true);
    });
  });

  it('KHÔNG bắt `A` khi hộp khác đang mở: hộp tạo việc, bảng phím `?`, chính hộp giao việc', async () => {
    mayDanhSach();
    dung(<TrangDanhSachTicket />, '/ticket?xem=bang&the=SAI-1');
    await choThe('SAI-1');
    for (const o of ['hop-tao-viec', 'bang-phim']) {
      const gia = document.createElement('div');
      gia.setAttribute('data-o', o);
      document.body.appendChild(gia);
      try {
        expect(fireEvent.keyDown(document.body, { key: 'a' }), o).toBe(true);
        await doi(10);
        expect(coHop(), o).toBe(false);
      } finally {
        gia.remove();
      }
    }
    // Hộp giao việc đang mở: `a` thứ hai (đích ngoài hộp) không dựng hộp thứ hai.
    fireEvent.keyDown(document.body, { key: 'a' });
    await waitFor(() => {
      expect(coHop()).toBe(true);
    });
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'a' });
    await doi(10);
    expect(document.querySelectorAll('[data-o="hop-giao-viec"]')).toHaveLength(1);
  });
});
