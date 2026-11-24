/**
 * **BAT-36 — ô tick và "đang gõ".**
 *
 * (1) `trongONhap` không coi `<input>` không nhận chữ (checkbox, radio, button,
 * submit, reset, image) là "đang gõ"; mọi ô nhập khác vẫn là "đang gõ".
 * (2) Hệ quả: focus ở ô tick thì phím vỏ (`?`, `C`) và phím trang Cần Chủ vẫn chạy.
 * (Bấm chuột ô tick ⇒ thẻ thành thẻ đang focus: `chon-nhieu.test.tsx`.)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { App } from '../src/App';
import { TrangCanChu } from '../src/trang/can-chu';
import { trongONhap } from '../src/vo/tao-viec';
import { MayChuGia, TOI_CHU, datKhoGia, dung } from './giup';
import { agentDong, doiAgent } from './than-agent';
import { DU_AN_RONG, manHinh, the } from './than-can-chu';

beforeEach(() => {
  datKhoGia();
});

afterEach(() => {
  act(() => {
    onlineManager.setOnline(true);
  });
  vi.restoreAllMocks();
});

/* ================================================================== *
 * 1. `trongONhap` — từng loại
 * ================================================================== */

function input(type?: string): HTMLInputElement {
  const e = document.createElement('input');
  if (type !== undefined) e.setAttribute('type', type);
  return e;
}

describe('trongONhap — loại phần tử nào là "đang gõ"', () => {
  it.each(['checkbox', 'radio', 'button', 'submit', 'reset', 'image'])(
    '<input type=%s> KHÔNG phải đang gõ',
    (kieu) => {
      expect(trongONhap(input(kieu))).toBe(false);
    },
  );

  it('chữ hoa/thường của type không đổi kết quả (DOM chuẩn hoá)', () => {
    expect(trongONhap(input('CHECKBOX'))).toBe(false);
    expect(trongONhap(input('Radio'))).toBe(false);
    expect(trongONhap(input('TEXT'))).toBe(true);
  });

  it.each([
    'text',
    'search',
    'email',
    'number',
    'password',
    'date',
    'range',
    'color',
    'file',
    'url',
    'tel',
    'time',
    'datetime-local',
    'month',
    'week',
    'hidden',
    'kieu-la-khong-co',
  ])('<input type=%s> là đang gõ', (kieu) => {
    expect(trongONhap(input(kieu))).toBe(true);
  });

  it('<input> không có type ⇒ đang gõ', () => {
    expect(trongONhap(input())).toBe(true);
  });

  it('textarea, select ⇒ đang gõ', () => {
    expect(trongONhap(document.createElement('textarea'))).toBe(true);
    expect(trongONhap(document.createElement('select'))).toBe(true);
  });

  it('contenteditable và phần tử con của nó ⇒ đang gõ; contenteditable="false" ⇒ không', () => {
    const vung = document.createElement('div');
    vung.setAttribute('contenteditable', 'true');
    const con = document.createElement('span');
    const chau = document.createElement('b');
    con.appendChild(chau);
    vung.appendChild(con);
    document.body.appendChild(vung);
    try {
      expect(trongONhap(vung)).toBe(true);
      expect(trongONhap(con)).toBe(true);
      expect(trongONhap(chau)).toBe(true);
    } finally {
      vung.remove();
    }
    const dat_rong = document.createElement('div');
    dat_rong.setAttribute('contenteditable', '');
    const con2 = document.createElement('span');
    dat_rong.appendChild(con2);
    document.body.appendChild(dat_rong);
    try {
      expect(trongONhap(con2)).toBe(true);
    } finally {
      dat_rong.remove();
    }
    const tat = document.createElement('div');
    tat.setAttribute('contenteditable', 'false');
    const con3 = document.createElement('span');
    tat.appendChild(con3);
    document.body.appendChild(tat);
    try {
      expect(trongONhap(tat)).toBe(false);
      expect(trongONhap(con3)).toBe(false);
    } finally {
      tat.remove();
    }
  });

  it('div, button, null, EventTarget không phải HTMLElement ⇒ không phải đang gõ', () => {
    expect(trongONhap(document.createElement('div'))).toBe(false);
    expect(trongONhap(document.createElement('button'))).toBe(false);
    expect(trongONhap(null)).toBe(false);
    expect(trongONhap(window)).toBe(false);
  });
});

/* ================================================================== *
 * 2. Phím vỏ khi focus ở ô tick
 * ================================================================== */

const AGENT = [agentDong({ id: 'ag-1', ten: 'W-builder', trang_thai: 'idle', nhan_trang_thai: 'Rảnh' })];

function mayVo(): void {
  new MayChuGia()
    .dat('GET /v1/toi', { than: TOI_CHU })
    .dat('GET /v1/du-an?limit=200', { than: { items: [], cursor_sau: null } })
    .dat('GET /v1/can-chu', { than: { huy_hieu: { so_cho: 0, muc_cao_nhat: null } } })
    .dat('GET /v1/man-hinh-agent', { than: doiAgent(AGENT) })
    .gan();
}

/** Thêm một ô vào `document.body`, focus nó, trả về để bắn phím vào. */
function oNgoai(kieu: string): HTMLInputElement {
  const o = input(kieu);
  document.body.appendChild(o);
  o.focus();
  return o;
}

describe('phím của vỏ (`?`, `C`) khi focus ở ô tick', () => {
  it('focus ở checkbox ⇒ `?` mở bảng phím', async () => {
    mayVo();
    dung(<App />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    const o = oNgoai('checkbox');
    try {
      fireEvent.keyDown(o, { key: '?' });
      await waitFor(() => {
        expect(document.querySelector('[data-o="bang-phim"]')).not.toBeNull();
      });
    } finally {
      o.remove();
    }
  });

  it('focus ở checkbox / radio ⇒ `C` mở hộp tạo việc', async () => {
    for (const kieu of ['checkbox', 'radio']) {
      mayVo();
      const { unmount } = dung(<App />);
      await screen.findByRole('navigation', { name: 'Điều hướng chính' });
      const o = oNgoai(kieu);
      try {
        fireEvent.keyDown(o, { key: 'c' });
        await waitFor(() => {
          expect(document.querySelector('[data-o="hop-tao-viec"]')).not.toBeNull();
        });
      } finally {
        o.remove();
        unmount();
      }
    }
  });

  it('focus ở ô text ⇒ `?` và `C` vẫn bị chặn', async () => {
    mayVo();
    dung(<App />);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    const o = oNgoai('text');
    try {
      fireEvent.keyDown(o, { key: '?' });
      fireEvent.keyDown(o, { key: 'c' });
      await new Promise((r) => setTimeout(r, 30));
      expect(document.querySelector('[data-o="bang-phim"]')).toBeNull();
      expect(document.querySelector('[data-o="hop-tao-viec"]')).toBeNull();
    } finally {
      o.remove();
    }
  });
});

/* ================================================================== *
 * 3. Phím trang Cần Chủ khi focus ở ô tick
 * ================================================================== */

describe('phím của trang Cần Chủ khi focus ở ô tick', () => {
  async function moCanChu(): Promise<() => string | null> {
    new MayChuGia()
      .dat('GET /v1/can-chu', {
        than: manHinh({ urgent: [the({ ma: 'T-124' }), the({ ma: 'T-125' })] }),
      })
      .dat('GET /v1/can-chu/da-xu-ly', { than: { items: [], cursor_sau: null } })
      .dat('GET /v1/du-an?limit=200', { than: DU_AN_RONG })
      .gan();
    dung(<TrangCanChu />, '/can-chu');
    await waitFor(() => {
      expect(document.querySelector('[data-the="T-124"]')).not.toBeNull();
    });
    return () => document.querySelector('[data-dang-chon="co"]')?.getAttribute('data-the') ?? null;
  }

  it('focus ở checkbox ⇒ `J` vẫn đi thẻ kế', async () => {
    const dang = await moCanChu();
    const o = oNgoai('checkbox');
    try {
      fireEvent.keyDown(o, { key: 'j' });
      expect(dang()).toBe('T-124');
      fireEvent.keyDown(o, { key: 'j' });
      expect(dang()).toBe('T-125');
    } finally {
      o.remove();
    }
  });

  it('focus ở ô text ⇒ `J` bị chặn', async () => {
    const dang = await moCanChu();
    const o = oNgoai('text');
    try {
      fireEvent.keyDown(o, { key: 'j' });
      expect(dang()).toBeNull();
    } finally {
      o.remove();
    }
  });
});

