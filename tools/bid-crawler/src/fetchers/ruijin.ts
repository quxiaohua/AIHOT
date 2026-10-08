/**
 * 上海瑞金医院（www.rjh.com.cn）采购公告抓取器。
 *
 * 【为什么从首页抓】瑞金的“资产管理处 > 资讯之窗”列表页是 JS 渲染、返回空列表，
 * 其招标信息查询栏目（zbxxcx）长期停留在 2022 年。真正新鲜的遴选/采购公告
 * 直接出现在官网首页的“通知公告”区，且是服务端渲染：
 *   <a href="/2018RJPortal/doc/2026/09/29/74578.shtml" title="...">
 *     无菌物品品质量信息化追溯系统维保项目结果公告
 *   </a>
 * 同一详情链接在首页会以“短日期 + 标题 + 空锚点”出现多次，按 URL 去重、取最长锚点文本当标题。
 * 发布日期直接取自 URL 路径 /doc/YYYY/MM/DD/（站点列表不另给日期列）。
 *
 * 【关键词过滤】首页混有门诊安排/院务新闻，按 KEYWORDS 过滤标题。
 */
import * as cheerio from "cheerio";
import { KEYWORDS } from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import { fetchHtml } from "./http.js";

const SITE = "https://www.rjh.com.cn";
const HOME = `${SITE}/`;
const REGION = "上海";

/** 从 /2018RJPortal/doc/2026/09/29/74578.shtml 提取 2026-09-29。 */
function dateFromPath(href: string): string | undefined {
  const m = /\/doc\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(href);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`;
}

export async function fetchBids(): Promise<FetchResult> {
  let html = "";
  try {
    html = await fetchHtml(HOME, { Referer: SITE });
  } catch (err) {
    console.warn(`[ruijin] 抓取失败:`, (err as Error).message);
  }

  const $ = cheerio.load(html);
  // href 含 /2018RJPortal/doc/ 的锚点都收进来，按 URL 聚合最长标题文本。
  const byUrl = new Map<string, string>();
  $(`a[href*="/2018RJPortal/doc/"]`).each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href")?.trim() ?? "";
    if (!href || !/\/doc\/\d{4}\/\d{2}\/\d{2}\//.test(href)) return;
    const title = $a.text().replace(/\s+/g, " ").trim();
    if (!title) return;
    const prev = byUrl.get(href) ?? "";
    if (title.length > prev.length) byUrl.set(href, title);
  });

  const items: BidItem[] = [];
  for (const [href, title] of byUrl) {
    if (!KEYWORDS.some((k) => title.includes(k))) continue;
    items.push({
      title,
      url: href.startsWith("http") ? href : `${SITE}${href}`,
      publishedAt: dateFromPath(href),
      region: REGION,
    });
  }

  return { sourceId: "bid-ruijin", sourceName: "瑞金医院-采购公告", items };
}
