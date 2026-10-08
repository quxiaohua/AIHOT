/**
 * 中国采购与招标网（www.chinabidding.com.cn）最新公告抓取器。
 *
 * 【可行性】其站内搜索路径 /cms/china_bidding/search/bulletin.html 已 404，
 * 但官网首页“通知公告”区是服务端渲染，未登录即可见标题+链接+日期：
 *   <div class="notice-list">
 *     <div class="notice-item">
 *       <div class="item-left" title="...">
 *         <a title="..." href="https://www.chinabidding.cn/zfcg/XXXX.html" target="_blank">标题</a>
 *       </div>
 *       <div class="item-right">2026-09-30</div>
 *     </div>
 *   </div>
 * 详情域名为 www.chinabidding.cn（/zfcg 政府采购、/zbgg 招标公告）。
 * 这里只取首页列表标题/链接/日期，不请求详情正文，不碰付费内容。
 *
 * 【关键词过滤】首页列表后按 KEYWORDS 过滤标题。
 */
import * as cheerio from "cheerio";
import { KEYWORDS } from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import { fetchHtml, toIso } from "./http.js";

const HOME = "https://www.chinabidding.com.cn/";

export async function fetchBids(): Promise<FetchResult> {
  let html = "";
  try {
    html = await fetchHtml(HOME, { Referer: HOME });
  } catch (err) {
    console.warn(`[chinabidding] 抓取失败:`, (err as Error).message);
  }

  const $ = cheerio.load(html);
  const items: BidItem[] = [];
  const seen = new Set<string>();

  $(`.notice-list .notice-item`).each((_, el) => {
    const $item = $(el);
    const $a = $item.find(`.item-left a[href*="chinabidding.cn/"]`);
    const href = $a.attr("href")?.trim() ?? "";
    // 只收详情链接（/zfcg/、/zbgg/ 这类），排除编辑推荐/政策解读类。
    if (!/chinabidding\.cn\/(zfcg|zbgg)\//.test(href)) return;
    const title = ($a.attr("title") || $a.text()).replace(/\s+/g, " ").trim();
    if (!title) return;
    if (!KEYWORDS.some((k) => title.includes(k))) return;
    const dateRaw = $item.find(".item-right").text().trim();
    if (seen.has(href)) return;
    seen.add(href);
    items.push({
      title,
      url: href,
      publishedAt: toIso(dateRaw),
    });
  });

  return { sourceId: "bid-chinabidding", sourceName: "中国采购与招标网", items };
}
