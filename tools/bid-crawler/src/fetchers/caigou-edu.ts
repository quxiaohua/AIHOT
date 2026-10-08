/**
 * 中国教育装备采购网（www.caigou.com.cn）政府采购列表抓取器。
 *
 * 该站是教育装备行业门户，"政府采购"栏目聚合了全国各地教育系统的采购公告。
 * 列表页是 SSR HTML（UTF-8），无需 JS。分页 URL：
 *   第 1 页 /zfcg_all.shtml
 *   第 N 页 /zfcg_all_pgN.shtml   （N>=2）
 *
 * 列表 DOM（div.newslist > li）：
 *   <li>
 *     <a href="/zfcg_t2.shtml">中标</a>          <!-- 第1个 a：类型 -->
 *     <a href="/zfcg_ci27.shtml">[陕西]</a>       <!-- 第2个 a：地区 -->
 *     <a href="/zfcg_ca538.shtml">信息化</a>      <!-- 第3个 a：品类 -->
 *     <a href="https://www.caigou.com.cn/zfcg/2026092011.shtml">
 *       <h3>标题</h3>
 *     </a>                                          <!-- 第4个 a：详情链接 -->
 *     <span>97万</span><span>基教</span>
 *     <span>2026-09-20</span>                      <!-- 最后一个 span：日期 -->
 *   </li>
 *
 * 该站无关键词搜索，抓前 MAX_PAGES_PER_SOURCE 页后本地按 KEYWORDS 过滤标题。
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

const BASE = "https://www.caigou.com.cn";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 拼第 page 页 URL：第 1 页是 zfcg_all.shtml，其余是 zfcg_all_pgN.shtml。 */
function pageUrl(page: number): string {
  return page <= 1
    ? `${BASE}/zfcg_all.shtml`
    : `${BASE}/zfcg_all_pg${page}.shtml`;
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
    let html = "";
    try {
      html = await fetchHtml(pageUrl(page));
    } catch (err) {
      console.warn(`[caigou-edu] 抓取失败 page=${page}:`, (err as Error).message);
    }
    const $ = loadHtml(html);

    $("div.newslist li").each((_, el) => {
      const $li = $(el);
      // 详情链接是包含 <h3> 的那个 <a>。
      const $detail = $li.find("a").has("h3").first();
      const href = $detail.attr("href")?.trim() ?? "";
      const title = $detail.find("h3").text().trim();
      if (!title || !href) return;

      // 第 1 个 <a> 文本是"招标"/"中标"等短类型。
      const bidType = $li.find("a").first().text().trim() || undefined;
      // 倒数第 1 个 <span> 是日期；地区是第 2 个 <a>（形如 [陕西]）。
      const spans = $li.find("span");
      const dateText = spans.last().text().trim();
      const regionRaw = $li.find("a").eq(1).text().trim(); // [陕西]
      const region = regionRaw.replace(/^\[|\]$/g, "");

      const url = href.startsWith("http") ? href : `${BASE}${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      items.push({
        title,
        url,
        publishedAt: toIso(dateText),
        region: region || undefined,
        bidType,
      });
    });

    if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
  }

  return {
    sourceId: "bid-edu-equipment",
    sourceName: "中国教育装备采购网-政府采购",
    items: filterByKeywords(items),
  };
}
