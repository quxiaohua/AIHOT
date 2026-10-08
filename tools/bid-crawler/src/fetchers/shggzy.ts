/**
 * 上海公共资源交易中心（www.shggzy.com）招标信源抓取器。
 *
 * 列表是服务端渲染：每个分类落地页 <div id="allList"> 下的 <li> 直接带标题/编号/日期，
 * 无需执行 JS。每条 <li onclick="window.open('/xxx/12345?cExt=...')">。
 *
 * 限制与对策：
 * - 站点不提供公开的关键词搜索（搜索走登录/CA），因此按任务约定抓最新列表、本地按 KEYWORDS 过滤标题。
 * - 分页用 JWT(cExt) 里的 pageNo 控制，签名密钥不在前端，无法自行翻页；每个分类页只渲染约 10 条最新。
 *   为提升召回，这里聚合多个与实验室家具相关的分类落地页（物资采购 jyxxwzcg、采购类 jyxxzc、
 *   工程 jyxxgc、汇总 jyxx.jhtml），每页 10 条，合计每天约 40 条候选。
 * - 详情链接里的 cExt 是带 exp 的 JWT 会过期；实测去掉 query 后详情页（/xxx/<id>）仍可访问（HTTP 200），
 *   所以只保留干净路径。
 */

import * as cheerio from "cheerio";
import {
  FETCH_RETRY,
  FETCH_TIMEOUT_MS,
  KEYWORDS,
  PAGE_INTERVAL_MS,
  RETRY_BASE_MS,
} from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";

const BASE = "https://www.shggzy.com";

/**
 * 要抓取的分类落地页路径。
 * - /jyxx.jhtml   公告信息汇总
 * - /jyxxwzcg     物资采购（厨房设备/软装等货物类，最可能出现实验室家具）
 * - /jyxxzc       采购类（框架协议/货物）
 * - /jyxxgc       工程建设（装修装饰等，偶有实验室装修）
 */
const LIST_PATHS = ["/jyxx.jhtml", "/jyxxwzcg", "/jyxxzc", "/jyxxgc"];

/** 桌面 UA：政务站对 UA 无强校验，保持真实浏览器头。 */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: BASE + "/",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 带超时 + 指数退避重试抓取一个列表页 HTML。 */
async function fetchList(path: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(BASE + path, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < FETCH_RETRY) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/** "2026-09-30" -> ISO8601（站点只给日期，补东八区零点）。 */
function toIso(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`;
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < LIST_PATHS.length; i++) {
    const path = LIST_PATHS[i];
    let html = "";
    try {
      html = await fetchList(path);
    } catch (err) {
      // 单个分类页失败只警告，继续其他分类。
      console.warn(`[shggzy] 抓取失败 path=${path}:`, (err as Error).message);
      continue;
    }

    const $ = cheerio.load(html);
    // #allList 下每条 <li onclick="window.open('/path?cExt=...')">
    $('#allList li[onclick*="window.open"]').each((_, el) => {
      const $li = $(el);
      const onclick = $li.attr("onclick") ?? "";
      const m = /window\.open\('([^']+)'\)/.exec(onclick);
      if (!m) return;
      // 去掉 cExt 查询参数，只保留干净路径（详情页无需 token 也可访问）。
      const detailPath = m[1].split("?")[0];
      if (!detailPath.startsWith("/")) return;
      const url = BASE + detailPath;

      const title = $li.find(".cs-span2").text().replace(/\s+/g, " ").trim();
      if (!title) return;

      // 本地关键词过滤：站点不支持关键词搜索，只保留标题命中 KEYWORDS 的条目。
      if (!KEYWORDS.some((kw) => title.includes(kw))) return;

      // 日期是含 2026-09-30 的那个 span。
      const dateText = $li
        .find("span")
        .filter((_, s) => /\d{4}-\d{2}-\d{2}/.test($(s).text()))
        .last()
        .text()
        .trim();

      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      items.push({ title, url, publishedAt: toIso(dateText) || undefined, region: "上海" });
    });

    // 分类页之间请求间隔，最后一页不等候。
    if (i < LIST_PATHS.length - 1) await sleep(PAGE_INTERVAL_MS);
  }

  return { sourceId: "bid-shggzy", sourceName: "上海公共资源交易中心", items };
}
