#!/usr/bin/env node
/**
 * Thực thi `baton-mcp` — máy chủ MCP của Baton (SPEC mục 13 d.351), vận chuyển
 * **stdio**.
 *
 * Đối xứng hoàn toàn với `bin.ts` của CLI: đây là **chỗ duy nhất** của đường MCP
 * biết tới tiến trình thật, mọi logic nằm ở `mcp/`, và phần không có test ở file
 * này là đúng một dòng gọi `noiDayMcp`.
 *
 * Token: đọc `BATON_URL`/`BATON_TOKEN` từ **biến môi trường của tiến trình**,
 * y như CLI (d.382) — client MCP đặt chúng trong cấu hình máy chủ của nó. Token
 * không bao giờ là một tham số công cụ: không công cụ nào khai nó (schema sinh
 * từ `KhaiLenh`, xem `mcp/cong-cu.ts`), nên không có đường để một client gửi
 * token vào rồi nó vọng lại trong một thông điệp lỗi.
 */

import { readFile } from 'node:fs/promises';
import { noiDayMcp, type TienTrinhMcp } from './mcp/noi-day-mcp.js';

declare const process: TienTrinhMcp;

await noiDayMcp(process, async (duong) => await readFile(duong, 'utf8'));
