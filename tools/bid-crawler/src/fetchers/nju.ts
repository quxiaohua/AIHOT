/**
 * 南京大学招标办公室-货物类采购（zb.nju.edu.cn/cgxxhw/）抓取器。
 *
 * 上海瞬速 CMS，SSR HTML（UTF-8）。
 * 分页：index.chtml（第1页）、index_2.chtml（第2页）…
 *
 * 列表 DOM：
 *   <dd cid="161">
 *     <span class="date">2026-09-29</span>
 *     <a href="/cgxxhw/140561.chtml" title="南京大学xxx公开招标公告">
 *       GZH2602408南京大学xxx公开招标公告
 *     </a>
 *   </dd>
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

const BASE = "https://zb.nju.edu.cn";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pageUrl(page: number): string {
  return page <= 1
    ? `${BASE}/cgxxhw/index.chtml`
    : `${BASE}/cgxxhw/index_${page}.chtml`;
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
    let html = "";
    try {
      html = await fetchHtml(pageUrl(page));
    } catch (err) {
      console.warn(`[nju] 抓取失败 page=${page}:`, (err as Error).message);
    }
    const $ = loadHtml(html);

    // 列表项是带 cid 属性的 dd（导航里的 dd 没有 cid，必须限定）。
    $("dd[cid]").each((_, el) => {
      const $dd = $(el);
      const $a = $dd.find("a").first();
      const href = $a.attr("href")?.trim() ?? "";
      // title 属性是干净标题（a 文本里带项目编号前缀和空白）。
      const title = ($a.attr("title") || $a.text()).trim();
      const dateText = $dd.find("span.date").text().trim();
      if (!title || !href) return;

      const url = href.startsWith("http") ? href : `${BASE}${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      items.push({ title, url, publishedAt: toIso(dateText) });
    });

    if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
  }

  return {
    sourceId: "bid-nju",
    sourceName: "南京大学-采购公告(货物类)",
    items: filterByKeywords(items),
  };
}
