/**
 * 千里马招标网 移动端（wap.qianlima.com）招标信源抓取器。
 *
 * 说明：任务里写的 m.qianlima.com 当前解析到的节点从本机网络 TCP 不可达，
 * 而 PC 站（www.qianlima.com）会把手机浏览器 302 到真正的移动站 wap.qianlima.com。
 * 该站是 JSP 渲染的静态 HTML（search.jsp），无需登录、无需 JS 执行。
 *
 * 搜索 URL：https://wap.qianlima.com/search.jsp?q=<gbk 编码的关键词>&p=<页码>
 *   - 站点是 GBK 编码，关键词必须按 GBK 百分号编码（用 iconv-lite 编码）；
 *   - 响应体也是 GBK 字节，需 iconv.decode(buf, 'gbk') 后再交给 cheerio。
 *   - 第 1 页不带 p 也行，统一用 p=1..N 翻页；每页约 20 条。
 *
 * 列表 DOM（ul.list-container > li 内的 <a>）：
 *   <a href="https://wap.qianlima.com/zb/detail/20260930_635774706.html">
 *     <div class="item-inner">
 *       <div class="item-title">标题( 关键词 在正文中 )</div>
 *       <div class="item-details-icon">
 *         <span class="location-info"><i><img></i>&nbsp;<span>广东-广州</span></span>
 *         <span class="zhongbiao-info"><i><img></i>&nbsp;<span>公告</span></span>
 *         <span class="time-info"><i><img></i>&nbsp;<span>2026-09-30</span></span>
 *       </div>
 *     </div>
 *   </a>
 * 其中 location-info / zhongbiao-info / time-info 的内层 <span> 才是文本值。
 */

import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import {
  FETCH_RETRY,
  FETCH_TIMEOUT_MS,
  KEYWORDS,
  MAX_PAGES_PER_SOURCE,
  PAGE_INTERVAL_MS,
  RETRY_BASE_MS,
  SOURCE_QIANLIMA_ID,
  SOURCE_QIANLIMA_NAME,
} from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";

const BASE = "https://wap.qianlima.com/search.jsp";

/** 移动端 UA：wap 站对桌面 UA 也返回同构 HTML，用 iPhone UA 最贴近真实。 */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  "Referer": "https://wap.qianlima.com/",
};

/** 列表里 zhongbiao-info 的短文案 -> 规范招标类型。 */
const BID_TYPE_MAP: Record<string, string> = {
  "公告": "招标公告",
  "结果": "中标结果",
  "变更": "变更",
  "预告": "预告",
};

/** 把 UTF-8 关键词按 GBK 字节做百分号编码（站点只认 GBK query）。 */
function gbkEncodeURI(s: string): string {
  const bytes = iconv.encode(s, "gbk");
  return [...bytes].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 带超时 + 指数退避重试抓取一页，返回解码后的 HTML 字符串。 */
async function fetchPage(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return iconv.decode(buf, "gbk");
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < FETCH_RETRY) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/** "2026-09-30" -> ISO8601（站点只给日期，补东八区零点）。 */
function toIso(dateStr: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`;
}

/** 标题尾部会带 “( 关键词 在正文中 )” 这类命中提示，去掉。 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\(\s*[^)]*在正文[^)]*\)\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
      const url = `${BASE}?q=${gbkEncodeURI(keyword)}&p=${page}`;

      let html = "";
      try {
        html = await fetchPage(url);
      } catch (err) {
        console.warn(`[qianlima] 抓取失败 keyword=${keyword} page=${page}:`, (err as Error).message);
      }

      const $ = cheerio.load(html);

      // 列表容器 ul.list-container，每条是一个含 /zb/detail/ 详情链接的 <a>。
      $(`ul.list-container a[href*="/zb/detail/"]`).each((_, el) => {
        const $a = $(el);
        const href = $a.attr("href")?.trim() ?? "";
        const title = cleanTitle($a.find(".item-title").text());
        if (!title || !href) {
          // 选择器没匹配到关键字段，跳过这一条，不抛错。
          return;
        }
        const detailUrl = href.startsWith("http") ? href : `https://wap.qianlima.com${href}`;

        // location-info 的内层 span 是直接子元素："广东-广州" 或 "山西"；region 取省份部分。
        const locRaw = $a.find(".location-info > span").first().text().trim();
        const region = locRaw ? locRaw.split("-")[0] : undefined;

        // zhongbiao-info 内层 span：公告/结果/变更/其他。
        const typeRaw = $a.find(".zhongbiao-info > span").first().text().trim();
        const bidType = BID_TYPE_MAP[typeRaw];

        // time-info 内层 span：2026-09-30。
        const dateRaw = $a.find(".time-info > span").first().text().trim();

        if (seenUrls.has(detailUrl)) return;
        seenUrls.add(detailUrl);
        items.push({
          title,
          url: detailUrl,
          publishedAt: toIso(dateRaw),
          region: region || undefined,
          bidType,
        });
      });

      if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
    }
  }

  return { sourceId: SOURCE_QIANLIMA_ID, sourceName: SOURCE_QIANLIMA_NAME, items };
}
