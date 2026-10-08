/**
 * 北京大学招标公告列表（zwb.pku.edu.cn/zbtb/zbgg/）抓取器。
 *
 * 说明：北京大学"采购管理办公室"没有对外公开的公告列表页，公开招标公告主要
 * 由总务部网站（zwb.pku.edu.cn）统一发布。列表页是 SSR HTML（UTF-8）。
 *
 * 分页：index.htm（第1页）、index1.htm（第2页）、index2.htm（第3页）…
 * 列表 DOM：
 *   <li>
 *     <a href="da436bd2....htm">[招标公告]标题</a>
 *     <span> 2026-07-09</span>
 *   </li>
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

const BASE = "https://zwb.pku.edu.cn/zbtb/zbgg";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 第 1 页 index.htm，第 2 页 index1.htm，第 N 页 index{N-1}.htm。 */
function pageUrl(page: number): string {
  return page <= 1 ? `${BASE}/index.htm` : `${BASE}/index${page - 1}.htm`;
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
    let html = "";
    try {
      html = await fetchHtml(pageUrl(page));
    } catch (err) {
      console.warn(`[pku] 抓取失败 page=${page}:`, (err as Error).message);
    }
    const $ = loadHtml(html);

    // 列表项是同时含 <a> 和 <span>日期 的 <li>（导航 li 没有日期 span）。
    $("li").each((_, el) => {
      const $li = $(el);
      if (!$li.find("span").length || !$li.find("a").length) return;
      const $a = $li.find("a").first();
      const href = $a.attr("href")?.trim() ?? "";
      // 标题形如 "[招标公告]北京大学xxx"，剥掉前缀标签。
      const title = $a.text().replace(/^\[[^\]]*\]/, "").trim();
      const dateText = $li.find("span").first().text().trim();
      if (!title || !href) return;

      const url = href.startsWith("http") ? href : `${BASE}/${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      items.push({ title, url, publishedAt: toIso(dateText) });
    });

    if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
  }

  return {
    sourceId: "bid-pku",
    sourceName: "北京大学-招标公告",
    items: filterByKeywords(items),
  };
}
