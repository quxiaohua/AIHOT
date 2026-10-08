/**
 * 中山大学附属第一医院（www.fahsysu.org.cn）采购公告列表抓取器。
 *
 * 采购公告栏目 /cat/597 是 Drupal Views 服务端渲染，无需登录。结构：
 *   <div class="list-item">
 *     <div class="list-time">2026-09-30</div>
 *     <div class="list-title"><a href=" /article/39659 " target="_blank">标题</a></div>
 *   </div>
 * 注意：href 前后带空格，需要 trim；详情域名为 https://www.fahsysu.org.cn。
 * 分页是 query 参数 ?page=N（N 从 0 开始，第 1 页即 page=0）。
 *
 * 【关键词过滤】栏目内全是院内谈判/竞价/市场调研采购公告，按 KEYWORDS 过滤标题。
 */
import * as cheerio from "cheerio";
import { KEYWORDS, MAX_PAGES_PER_SOURCE, PAGE_INTERVAL_MS } from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import { fetchHtml, toIso } from "./http.js";

const SITE = "https://www.fahsysu.org.cn";
const CAT = "/cat/597";
const REGION = "广东";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  // Views 的 page 从 0 开始；抓 MAX_PAGES_PER_SOURCE 页即 page=0..N-1。
  for (let idx = 0; idx < MAX_PAGES_PER_SOURCE; idx++) {
    const url = `${SITE}${CAT}?page=${idx}`;
    let html = "";
    try {
      html = await fetchHtml(url, { Referer: `${SITE}/` });
    } catch (err) {
      console.warn(`[zhongshanyi] 抓取失败 page=${idx}:`, (err as Error).message);
    }

    const $ = cheerio.load(html);
    $(`.list-item`).each((_, el) => {
      const $item = $(el);
      const $a = $item.find(`.list-title a`);
      const href = $a.attr("href")?.trim() ?? "";
      if (!href || !/^\/article\//.test(href)) return;
      const title = $a.text().replace(/\s+/g, " ").trim();
      if (!title) return;
      // 跳过置顶须知类条目（标题含“置顶/必读”），它不是具体采购项目。
      if (/置顶|必读/.test(title)) return;
      if (!KEYWORDS.some((k) => title.includes(k))) return;
      const dateRaw = $item.find(".list-time").text().trim();
      const detailUrl = `${SITE}${href}`;
      if (seen.has(detailUrl)) return;
      seen.add(detailUrl);
      items.push({
        title,
        url: detailUrl,
        publishedAt: toIso(dateRaw),
        region: REGION,
      });
    });

    if (idx < MAX_PAGES_PER_SOURCE - 1) await sleep(PAGE_INTERVAL_MS);
  }

  return { sourceId: "bid-zhongshanyi", sourceName: "中山一院-采购公告", items };
}
