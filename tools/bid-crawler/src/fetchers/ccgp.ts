/**
 * 中国政府采购网（www.ccgp.gov.cn）招标信源抓取器。
 *
 * 搜索接口：GET http://search.ccgp.gov.cn/bxsearch?kw=关键词&page_index=N&...
 * 服务端渲染 HTML（非 JS），直接 cheerio 解析 <ul class="vT-srch-result-list-bid"> 下的 <li>。
 *
 * 反爬：该站对搜索接口有 IP 级限流，短时间多次请求会返回「您的访问过于频繁」页面
 * （HTTP 200 但无列表）。因此：
 *   - 严格遵守 config 的 PAGE_INTERVAL_MS 请求间隔；
 *   - 检测到「频繁访问」页面时按可错误重试（指数退避），而不是当作 0 条结果。
 * 本机首次探测触发过限流，冷却约几分钟后即恢复，低频（每天 3 次）抓取不会持续触发。
 *
 * 每条 <li> 结构：
 *   <a href="...htm">标题(<font color=red>关键词</font>)</a>
 *   <span>2026.09.30 15:43:58 | 采购人：... | <strong>中标公告</strong></span>
 * 标题里的 <font color=red> 高亮标签需去掉；日期取 span 第一个 token。
 */

import * as cheerio from "cheerio";
import {
  FETCH_RETRY,
  FETCH_TIMEOUT_MS,
  KEYWORDS,
  MAX_PAGES_PER_SOURCE,
  PAGE_INTERVAL_MS,
  RETRY_BASE_MS,
} from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";

const BASE = "http://www.ccgp.gov.cn";
const SEARCH = "http://search.ccgp.gov.cn/bxsearch";

/** 桌面 UA + Referer：不带 Referer 更易被限流。 */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: `${BASE}/`,
};

/** 滚动抓取最近多少天。政府采购公告量大，30 天窗口配合关键词检索足够覆盖新条目。 */
const LOOKBACK_DAYS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 把 Date 格式化成 bxsearch 需要的 "YYYY:MM:DD"。 */
function fmtCcgpDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())}`;
}

/** 抓取一页 HTML；命中限流页时抛错触发重试。 */
async function fetchPage(keyword: string, page: number): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY; attempt++) {
    const end = new Date();
    const start = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
    const params = new URLSearchParams({
      searchtype: "1",
      page_index: String(page),
      bidSort: "0",
      buyerName: "",
      projectId: "",
      pinMu: "0",
      bidType: "0",
      dbselect: "bidx",
      kw: keyword,
      start_time: fmtCcgpDate(start),
      end_time: fmtCcgpDate(end),
      timeType: "6",
      displayZone: "",
      zoneId: "",
      pppStatus: "0",
      agentName: "",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${SEARCH}?${params}`, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      // 限流页是 HTTP 200 但标题为「频繁访问」，识别后当作失败重试。
      if (html.includes("频繁访问")) throw new Error("触发限流(频繁访问)");
      return html;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < FETCH_RETRY) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/** "2026.09.30 15:43:58" -> ISO8601。 */
function toIso(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = /^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})/.exec(dateStr.trim());
  if (!m) {
    const d = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(dateStr.trim());
    if (!d) return undefined;
    return `${d[1]}-${d[2]}-${d[3]}T00:00:00+08:00`;
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`;
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
      let html = "";
      try {
        html = await fetchPage(keyword, page);
      } catch (err) {
        console.warn(`[ccgp] 抓取失败 kw=${keyword} page=${page}:`, (err as Error).message);
      }

      if (html) {
        const $ = cheerio.load(html);
        $("ul.vT-srch-result-list-bid > li").each((_, el) => {
          const $li = $(el);
          const $a = $li.find("a[href]").first();
          const url = $a.attr("href")?.trim() ?? "";
          // 标题去掉 <font color=red> 高亮标签后取纯文本。
          const title = $a.text().replace(/\s+/g, " ").trim();
          if (!title || !url) return;

          const meta = $li.find("span").first().text();
          // span 开头是 "2026.09.30 15:43:58 | ..."
          const dateMatch = /^\s*(\d{4}\.\d{2}\.\d{2}[ \d:]*)/.exec(meta);
          // 招标类型在 <strong> 里，如「中标公告」「采购公告」。
          const bidType = $li.find("strong").first().text().trim() || undefined;

          if (seenUrls.has(url)) return;
          seenUrls.add(url);
          items.push({
            title,
            url: url.startsWith("http") ? url : BASE + url,
            publishedAt: toIso(dateMatch?.[1]),
            bidType,
          });
        });
      }

      if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
    }
  }

  return { sourceId: "bid-ccgp", sourceName: "中国政府采购网", items };
}
