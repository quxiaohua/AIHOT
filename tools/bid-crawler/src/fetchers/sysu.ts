/**
 * 中山大学政府采购与招投标管理中心-采购公告（bidding.sysu.edu.cn/gg/cg）抓取器。
 *
 * Drupal 站点，SSR HTML（UTF-8）。
 * 分页：?page=0（第1页，即 /gg/cg）、?page=1（第2页）…
 *
 * 列表 DOM（列表页不显示发布日期，publishedAt 留空）：
 *   <li class="list-item list-item-line">
 *     <p class="field-content">
 *       <a href="/node/17152">中大招（货）[2025]001号　｜　货物　｜　中山大学xxx采购项目</a>
 *     </p>
 *   </li>
 * 标题里用全角竖线"｜"分隔编号/类别/项目名，取最后一段作为干净标题。
 */

import { PAGE_INTERVAL_MS } from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import { fetchHtml, filterByKeywords, loadHtml } from "./_html-helper.js";

const BASE = "https://bidding.sysu.edu.cn";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 第 1 页 ?page=0，第 N 页 ?page=N-1。 */
function pageUrl(page: number): string {
  return `${BASE}/gg/cg?page=${page - 1}`;
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  // MAX_PAGES_PER_SOURCE 控制翻页数（默认 2 页）。
  for (let page = 1; page <= 2; page++) {
    let html = "";
    try {
      html = await fetchHtml(pageUrl(page));
    } catch (err) {
      console.warn(`[sysu] 抓取失败 page=${page}:`, (err as Error).message);
    }
    const $ = loadHtml(html);

    $("li.list-item").each((_, el) => {
      const $a = $(el).find("a").first();
      const href = $a.attr("href")?.trim() ?? "";
      const raw = $a.text().trim();
      if (!raw || !href) return;

      // 取最后一段｜后的项目名作为标题。
      const title = raw.split("｜").pop()?.trim() || raw;
      const url = href.startsWith("http") ? href : `${BASE}${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      items.push({ title, url });
    });

    if (page < 2) await sleep(PAGE_INTERVAL_MS);
  }

  return {
    sourceId: "bid-sysu",
    sourceName: "中山大学-采购公告",
    items: filterByKeywords(items),
  };
}
