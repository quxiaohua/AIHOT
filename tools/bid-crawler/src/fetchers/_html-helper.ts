/**
 * 传统高校 CMS（博达/瞬速等 SSR 站点）共享 helper。
 *
 * 这些学校的公告列表页是服务端直出 HTML（UTF-8），无需 JS 渲染。
 * 本模块封装：
 *   - fetchHtml(url)：带超时+指数退避重试的 GET，返回 UTF-8 字符串；
 *   - filterByKeywords(items)：按 KEYWORDS 过滤标题。
 */

import * as cheerio from "cheerio";
import {
  FETCH_RETRY,
  FETCH_TIMEOUT_MS,
  KEYWORDS,
  RETRY_BASE_MS,
} from "../../config.js";
import type { BidItem } from "../types.js";

/** 浏览器 UA：与正常访问一致。 */
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 带超时+指数退避重试抓取一个 URL，返回 HTML 字符串。 */
export async function fetchHtml(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < FETCH_RETRY) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/** 用 cheerio 加载 HTML。 */
export function loadHtml(html: string): cheerio.CheerioAPI {
  return cheerio.load(html);
}

/** 按 KEYWORDS 过滤标题。 */
export function filterByKeywords(items: BidItem[]): BidItem[] {
  return items.filter((it) => KEYWORDS.some((k) => it.title.includes(k)));
}

/** "2026-09-30" / "2026-09-30 16:00" -> ISO8601 东八区。 */
export function toIso(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(
    dateStr.trim(),
  );
  if (!m) return undefined;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:00+08:00`;
}
