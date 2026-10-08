/**
 * 剑鱼标讯（www.jianyu360.cn）最新招标公告抓取器。
 *
 * 【可行性】列表详情页 /list/stype/ZBGG.html 是前端 JS 渲染的空壳（3.6KB），
 * 但其官网首页是服务端渲染，多个“招标公告/中标公告”卡片里直接带未登录可见的条目，
 * 详情链接前缀为 /nologin/content/（即未登录可读列表），无需登录、不碰付费详情正文。
 * 结构：
 *   <li class="cms-card-list-item">
 *     <a class="cms-card-list-item-left" title="标题" href="/nologin/content/XXX.html">标题</a>
 *     <span class="cms-card-list-item-right">09-30</span>
 *   </li>
 * 日期只给 MM-DD（无年份），由 mmddToIso 按当前年份补全（跨年则回退到去年）。
 *
 * 【关键词过滤】只抓首页最新公告卡片，再按 KEYWORDS 过滤标题（不绕过付费墙抓全文）。
 */
import * as cheerio from "cheerio";
import { KEYWORDS } from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import { fetchHtml, mmddToIso } from "./http.js";

const SITE = "https://www.jianyu360.cn";

export async function fetchBids(): Promise<FetchResult> {
  let html = "";
  try {
    html = await fetchHtml(SITE, { Referer: SITE });
  } catch (err) {
    console.warn(`[jianyu] 抓取失败:`, (err as Error).message);
  }

  const $ = cheerio.load(html);
  const items: BidItem[] = [];
  const seen = new Set<string>();

  $(`li.cms-card-list-item a[href^="/nologin/content/"]`).each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href")?.trim() ?? "";
    if (!href) return;
    const title = ($a.attr("title") || $a.text()).replace(/\s+/g, " ").trim();
    if (!title) return;
    if (!KEYWORDS.some((k) => title.includes(k))) return;
    // 日期在同 li 的右侧 span。
    const mmdd = $a.siblings(".cms-card-list-item-right").first().text().trim();
    const detailUrl = href.startsWith("http") ? href : `${SITE}${href}`;
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);
    items.push({
      title,
      url: detailUrl,
      publishedAt: mmddToIso(mmdd),
    });
  });

  return { sourceId: "bid-jianyu", sourceName: "剑鱼标讯", items };
}
