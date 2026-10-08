/**
 * 采招网（www.bidcenter.com.cn）招标信源抓取器。
 *
 * 【为什么不是直接抓 HTML 列表页】
 * 采招网的搜索结果页（search.bidcenter.com.cn/search?keywords=...）是前端 JS 渲染的：
 * 服务端只返回一个空壳 HTML，列表数据通过 POST 它自家的搜索接口
 *   https://interface.bidcenter.com.cn/search/GetSearchProHandler.ashx
 * 拉取，响应体是 AES-128-CBC 加密后的 base64（页面脚本里硬编码了 key/iv）。
 * 所谓 zbkeyw-<id>.html 是 SEO 关键词聚合页，每个关键词对应一个内部数字 id，
 * 但 id 没有公开、稳定的查表入口（自动补全接口不返回 id），无法遍历 KEYWORDS 自动解析。
 * 因此这里直接复用站点自己的后端搜索接口（未登录也返回前 800 条免费结果），
 * 这是任务允许的“URL 模式不对就换替代路径”。解密用 Node 内置 crypto，无新增依赖。
 *
 * 解密出的 JSON 结构（other2.listData[]）字段：
 *   news_title_show   标题
 *   news_url          详情链接，形如 //www.bidcenter.com.cn/news-445358974-4.html
 *   news_star_time_show 发布日期 YYYY-MM-DD
 *   news_diqustr      省份，如 江苏
 *   news_type_des     类型文案，如 招标公告 / 招标预告 / 中标结果 / 招标变更
 */

import { createDecipheriv } from "node:crypto";
import {
  FETCH_RETRY,
  FETCH_TIMEOUT_MS,
  KEYWORDS,
  MAX_PAGES_PER_SOURCE,
  PAGE_INTERVAL_MS,
  RETRY_BASE_MS,
  SOURCE_CAIZHAO_ID,
  SOURCE_CAIZHAO_NAME,
} from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";

/** 搜索接口地址（页面 searchv17.js 中 interfaceConfig.serverURL + /search/GetSearchProHandler.ashx） */
const API_URL = "https://interface.bidcenter.com.cn/search/GetSearchProHandler.ashx";

/** 加密 key / iv，取自页面脚本 baseVariate/searchv17 中的 CryptoJS WordArray。
 *  WordArray 的 4 个大端 word 还原后正好是下面这 16 字节 ASCII。 */
const AES_KEY = Buffer.from("3zKzyf6eEfuDjAG3", "utf8");
const AES_IV = Buffer.from("fyUANZ0qSNZhhNCV", "utf8");

/** 站点来源标识，取自 config.js from/location=6137/6138，未登录免费查询够用。 */
const FROM = 6137;
const LOCATION = 6138;

/** 请求 UA / Referer：不带 Referer 会被人机验证拦截，与浏览器行为保持一致。 */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Referer": "https://search.bidcenter.com.cn/",
  "Content-Type": "application/x-www-form-urlencoded",
};

/** 接口返回的单条记录（只列我们用到的字段）。 */
interface CaizhaoRecord {
  news_id: number;
  news_title_show: string;
  news_url: string;
  news_star_time_show?: string;
  news_diqustr?: string;
  news_type_des?: string;
}

/** 解密并解析响应体。ZeroPadding：手动去掉尾部补 0 / 空格。 */
function decryptResponse(body: string): { listData?: CaizhaoRecord[]; realInfoCount?: number } {
  const decipher = createDecipheriv("aes-128-cbc", AES_KEY, AES_IV);
  decipher.setAutoPadding(false); // 站点用 ZeroPadding，不靠 PKCS#7 去尾
  const enc = Buffer.from(body.trim(), "base64");
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  const jsonStr = dec.toString("utf8").replace(/[\s\x00]+$/u, "");
  const data = JSON.parse(jsonStr);
  return data.other2 ?? {};
}

/** 带超时 + 指数退避重试的 POST，返回解密后的 other2。失败重试 FETCH_RETRY 次后抛错。 */
async function postSearch(params: URLSearchParams): Promise<{ listData?: CaizhaoRecord[] }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: HEADERS,
        body: params,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return decryptResponse(text);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < FETCH_RETRY) {
        await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** "2026-09-30" -> "2026-09-30T00:00:00+08:00"（站点只给日期，补东八区零点）。 */
function toIso(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`;
}

/** 把接口记录转成 BidItem；缺标题/链接时返回 null 由调用方跳过。 */
function toBidItem(rec: CaizhaoRecord): BidItem | null {
  const title = (rec.news_title_show ?? "").trim();
  const url = (rec.news_url ?? "").trim();
  if (!title || !url) return null;
  return {
    title,
    url: url.startsWith("//") ? `https:${url}` : url,
    publishedAt: toIso(rec.news_star_time_show),
    region: rec.news_diqustr?.trim() || undefined,
    bidType: rec.news_type_des?.trim() || undefined,
  };
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
      const params = new URLSearchParams({
        from: String(FROM),
        location: String(LOCATION),
        guid: String(Date.now()),
        token: "",
        keywords: keyword,
        mod: "0",
        page: String(page),
        pagesize: "20",
        deftag: "1",
        sort: "0",
        time: "0",
        dtrange: "4",
        type: "",
        diqu: "",
        areacode: "",
        diquArea: "",
        paichutag: "-1",
        tag: "-1",
        vtime: String(Date.now()),
      });

      let records: CaizhaoRecord[] = [];
      try {
        const { listData } = await postSearch(params);
        records = listData ?? [];
      } catch (err) {
        // 单关键词/单页失败只警告，不中断整体抓取。
        console.warn(`[caizhao] 搜索失败 keyword=${keyword} page=${page}:`, (err as Error).message);
      }

      for (const rec of records) {
        const item = toBidItem(rec);
        if (!item) continue;
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        items.push(item);
      }

      // 页间隔，最后一页不需要再等。
      if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
    }
  }

  return { sourceId: SOURCE_CAIZHAO_ID, sourceName: SOURCE_CAIZHAO_NAME, items };
}
