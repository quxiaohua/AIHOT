/**
 * 四川大学华西医院（www.wchscu.cn）招标公告列表抓取器。
 *
 * 列表页 /public/notice/tender/ 为服务端渲染，无需登录。结构：
 *   <div class="x-wrap" id="datalist"><div class="list">
 *     <div class="item">
 *       <a href="/public/notice/tender/99021.html" target="_blank" class="clear">
 *         <span class="s1 wto">心脏内科-血流储备分数测量设备市场调研（第二轮）</span>
 *         <span class="s2">2026.09.30</span>
 *       </a>
 *     </div>
 *   </div></div>
 * 同目录还有“招聘”卡片链接到 /public/notice/recruit.html，用 href 是否匹配
 * /public/notice/tender/<数字>.html 来区分招标详情与导航。分页：/public/notice/tender/p/N.html。
 *
 * 【关键词过滤】该列表几乎全是设备/服务市场调研与比选，按 KEYWORDS 过滤标题。
 */
import * as cheerio from "cheerio";
import { KEYWORDS, MAX_PAGES_PER_SOURCE, PAGE_INTERVAL_MS } from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import { fetchHtml, toIso } from "./http.js";

const BASE = "https://www.wchscu.cn/public/notice/tender/";
const SITE = "https://www.wchscu.cn";
const REGION = "四川";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
    // 第 1 页是 tender/，第 N 页是 tender/p/N.html。
    const url = page === 1 ? BASE : `${BASE}p/${page}.html`;
    let html = "";
    try {
      html = await fetchHtml(url, { Referer: SITE });
    } catch (err) {
      console.warn(`[huaxi] 抓取失败 page=${page}:`, (err as Error).message);
    }

    const $ = cheerio.load(html);
    $(`#datalist .list .item a[href*="/public/notice/tender/"]`).each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href")?.trim() ?? "";
      // 只收真正的详情链接（/tender/<数字>.html），排除“招聘”等导航链接。
      if (!/\/public\/notice\/tender\/\d+\.html$/.test(href)) return;
      const title = $a.find(".s1").text().replace(/\s+/g, " ").trim();
      if (!title) return;
      if (!KEYWORDS.some((k) => title.includes(k))) return;
      const dateRaw = $a.find(".s2").text().trim();
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

  return { sourceId: "bid-huaxi", sourceName: "华西医院-采购公告", items };
}
