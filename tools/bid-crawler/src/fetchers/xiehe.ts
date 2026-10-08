/**
 * 北京协和医院（www.pumch.cn）医院公告列表抓取器。
 *
 * 【为什么抓 notice.html 而不是采购子栏目】
 * 协和的采购/比价/遴选公告都混在“医院公告”里（基建比价、设备遴选、市场调研、试剂谈判等），
 * 服务端直接 SSR 出 <div id="datalist"><ul class="list"> 列表，无需登录、无需 JS。
 * 列表项结构：
 *   <li><a href="/detail/46792.html">
 *         <span class="num">1.</span><span class="date">2026-09-28</span>
 *         北京协和医院基建处2026年9月第2次比价公告
 *       </a></li>
 * 标题是 <a> 的纯文本尾部，日期在 .date span 里。分页：/notice/p/2.html。
 *
 * 【关键词过滤】公告里大量是门诊安排/培训等噪声，按 KEYWORDS 过滤标题。
 */
import * as cheerio from "cheerio";
import { KEYWORDS, MAX_PAGES_PER_SOURCE, PAGE_INTERVAL_MS } from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import { fetchHtml, toIso } from "./http.js";

const BASE = "https://www.pumch.cn/notice.html";
const SITE = "https://www.pumch.cn";
const REGION = "北京";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
    // 第 1 页就是 notice.html，第 N 页才是 notice/p/N.html。
    const url = page === 1 ? BASE : `${SITE}/notice/p/${page}.html`;
    let html = "";
    try {
      html = await fetchHtml(url, { Referer: `${SITE}/` });
    } catch (err) {
      console.warn(`[xiehe] 抓取失败 page=${page}:`, (err as Error).message);
    }

    const $ = cheerio.load(html);
    $(`#datalist ul.list li a[href*="/detail/"]`).each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href")?.trim() ?? "";
      if (!href) return;
      // 标题 = <a> 文本去掉 .num / .date 两个 span 后剩余部分。
      const title = $a
        .clone()
        .find("span")
        .remove()
        .end()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (!title) return;
      if (!KEYWORDS.some((k) => title.includes(k))) return; // 噪声：非实验室设备类公告
      const dateRaw = $a.find(".date").text().trim();
      const detailUrl = href.startsWith("http") ? href : `${SITE}${href}`;
      if (seen.has(detailUrl)) return;
      seen.add(detailUrl);
      items.push({
        title,
        url: detailUrl,
        publishedAt: toIso(dateRaw),
        region: REGION,
      });
    });

    if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
  }

  return { sourceId: "bid-xiehe", sourceName: "协和医院-采购公告", items };
}
