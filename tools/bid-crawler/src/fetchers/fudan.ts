/**
 * 复旦大学采购与招标管理中心-货物类公告（czzx.fudan.edu.cn/xxgk/list2.htm）抓取器。
 *
 * 列表页是 SSR HTML（UTF-8，博达 VSB 风格 CMS）。
 * 分页：list2.htm（第1页）、list3.htm（第2页）、list4.htm（第3页）…
 *   （该栏目页号是递增的 listN.htm，不是 list2_N.psp。）
 *
 * 列表 DOM：
 *   <ul class="news_list list2">
 *     <li class="news">
 *       <span class="news_title">
 *         <a href='/13/91/c39571a791441/page.htm' title='标题'>标题</a>
 *       </span>
 *       <span class="news_meta">2026-09-17</span>
 *     </li>
 *   </ul>
 * 详情链接有两种：站内 /xx/yy/cxxx/page.htm，或 /_redirect?siteId=...（跳外部电子采购系统）。
 */

import {
  MAX_PAGES_PER_SOURCE,
  PAGE_INTERVAL_MS,
} from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import {
  fetchHtml,
  filterByKeywords,
  loadHtml,
  toIso,
} from "./_html-helper.js";

const BASE = "https://czzx.fudan.edu.cn";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 第 1 页 list2.htm，第 N 页 list{N+1}.htm。 */
function pageUrl(page: number): string {
  return `${BASE}/xxgk/list${page + 1}.htm`;
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
    let html = "";
    try {
      html = await fetchHtml(pageUrl(page));
    } catch (err) {
      console.warn(`[fudan] 抓取失败 page=${page}:`, (err as Error).message);
    }
    const $ = loadHtml(html);

    $("ul.news_list li.news").each((_, el) => {
      const $li = $(el);
      const $a = $li.find("span.news_title a").first();
      const href = $a.attr("href")?.trim() ?? "";
      // title 属性最干净（文本里可能带空白）。
      const title = ($a.attr("title") || $a.text()).trim();
      const dateText = $li.find("span.news_meta").text().trim();
      if (!title || !href) return;

      const url = href.startsWith("http") ? href : `${BASE}${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      items.push({ title, url, publishedAt: toIso(dateText) });
    });

    if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
  }

  return {
    sourceId: "bid-fudan",
    sourceName: "复旦大学-采购公告(货物类)",
    items: filterByKeywords(items),
  };
}
