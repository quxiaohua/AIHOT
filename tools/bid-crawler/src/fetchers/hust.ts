/**
 * 华中科技大学采购与招标中心-集中采购公告（cgzx.hust.edu.cn/cgjzcg/）抓取器。
 *
 * 上海瞬速 CMS，SSR HTML（UTF-8），与南大同构。
 * 分页：index.chtml（第1页）、index_2.chtml（第2页）…
 *
 * 列表 DOM：
 *   <dd cid="9" rdate="2026-09-29">
 *     <span class="date">2026-09-29</span>
 *     <a title="[HW20260487]华中科技大学xxx询比公告" href="/cgjzcg/48981.chtml">
 *       [HW20260487]...
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

const BASE = "http://cgzx.hust.edu.cn";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pageUrl(page: number): string {
  return page <= 1
    ? `${BASE}/cgjzcg/index.chtml`
    : `${BASE}/cgjzcg/index_${page}.chtml`;
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
    let html = "";
    try {
      html = await fetchHtml(pageUrl(page));
    } catch (err) {
      console.warn(`[hust] 抓取失败 page=${page}:`, (err as Error).message);
    }
    const $ = loadHtml(html);

    // 列表项是带 cid 属性的 dd（导航里的 dd 没有 cid，必须限定）。
    $("dd[cid]").each((_, el) => {
      const $dd = $(el);
      const $a = $dd.find("a").first();
      const href = $a.attr("href")?.trim() ?? "";
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
    sourceId: "bid-hust",
    sourceName: "华中科技大学-集中采购公告",
    items: filterByKeywords(items),
  };
}
