/**
 * 共享 helper：TRS/拓尔思「全文检索」接口（inteligentsearch）。
 *
 * 江苏 / 湖北 / 浙江三省公共资源交易平台用的是同一套政务 CMS，
 * 列表数据都通过同一个 POST 接口拉取：
 *   POST <baseUrl>/inteligentsearch/rest/esinteligentsearch/getFullTextDataNew
 *   Content-Type: application/json;charset=utf-8
 *   body: { wd: 关键词, pn: 偏移, rn: 每页条数, ... }
 * 返回 JSON：result.records[]，每条带 title / linkurl / infodatepx / categoryname 等。
 *
 * 三省唯一差异：
 *   - baseUrl / referer 不同；
 *   - 「地区」字段名不同：江苏 zhuanzai（如"镇江市"）、湖北 xiaquname（如"荆州市"）、
 *     浙江 infod（如"省本级"）。用 regionField 配置传入。
 *
 * 关键词检索直接放在 wd 字段（全站全文），不需要先拼 categorynum 条件——
 * 实测 wd=实验台 即可跨分类命中，比拼分类更省事。
 */

import {
  FETCH_RETRY,
  FETCH_TIMEOUT_MS,
  KEYWORDS,
  MAX_PAGES_PER_SOURCE,
  PAGE_INTERVAL_MS,
  RETRY_BASE_MS,
} from "../../config.js";
import type { BidItem } from "../types.js";

/** 一个 TRS 站点的接入参数。 */
export interface TrsSourceConfig {
  /** 站点根地址，如 http://jsggzy.jszwfw.gov.cn，用于拼 linkurl 绝对 URL。 */
  baseUrl: string;
  /** 列表页地址，作为 Referer；不带 Referer 个别站会拒绝。 */
  referer: string;
  /** 记录里表示地区的字段名（江苏=zhuanzai，湖北=xiaquname，浙江=infod）。 */
  regionField: string;
}

/** 接口地址（相对 baseUrl）。三省一致。 */
const API_PATH = "/inteligentsearch/rest/esinteligentsearch/getFullTextDataNew";

/** 每页条数。首页一页约 20 条足够，翻 2 页 = 40 条候选。 */
const PAGE_SIZE = 20;

/** 桌面 UA：政务站对 UA 无强校验，但保持真实浏览器头避免被 WAF 直接拒。 */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

/** 接口返回的单条记录（只列用到的字段，其余忽略）。 */
interface TrsRecord {
  title?: string;
  titlenew?: string;
  linkurl?: string;
  infodatepx?: string;
  infodate?: string;
  webdate?: string;
  categoryname?: string;
  [region: string]: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 带超时 + 指数退避重试的 POST，返回 result.records。失败重试 FETCH_RETRY 次后抛错。 */
async function postSearch(cfg: TrsSourceConfig, wd: string, pn: number): Promise<TrsRecord[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      // 与站点页面脚本一致的最小 body：wd 关键词 + 分页；condition 留空表示不限分类。
      const body = {
        wd,
        cl: 200,
        cnum: "001",
        sort: '{"infodatepx":"0"}', // 0 = 按发布时间倒序，先拿最新
        pn,
        rn: PAGE_SIZE,
        fields: "title;categorynum;zhuanzai;webdate",
        condition: [],
        unionCondition: [],
        time: null,
        opCondition: null,
        opType: 0,
        terminal: "",
      };
      const res = await fetch(cfg.baseUrl + API_PATH, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json;charset=utf-8", Referer: cfg.referer },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { result?: { records?: TrsRecord[] } };
      return data.result?.records ?? [];
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < FETCH_RETRY) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/** "2025-06-05 18:06:00" / "2025-06-05 18:06:00.920000" -> ISO8601（补东八区）。 */
function toIso(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(dateStr.trim());
  if (!m) {
    // 只有日期时补零点
    const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
    if (!d) return undefined;
    return `${d[1]}-${d[2]}-${d[3]}T00:00:00+08:00`;
  }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`;
}

/** 记录转 BidItem；缺标题/链接返回 null。 */
function toBidItem(cfg: TrsSourceConfig, rec: TrsRecord): BidItem | null {
  const title = (rec.title ?? rec.titlenew ?? "").replace(/<\/?em[^>]*>/gi, "").trim();
  const link = (rec.linkurl ?? "").trim();
  if (!title || !link) return null;
  const regionRaw = typeof rec[cfg.regionField] === "string" ? (rec[cfg.regionField] as string).trim() : "";
  return {
    title,
    url: link.startsWith("http") ? link : cfg.baseUrl + link,
    publishedAt: toIso(rec.infodatepx ?? rec.infodate ?? rec.webdate),
    region: regionRaw || undefined,
    bidType: rec.categoryname?.trim() || undefined,
  };
}

/**
 * 遍历 KEYWORDS × MAX_PAGES_PER_SOURCE 抓取一个 TRS 站点，去重后返回条目。
 * 供江苏/湖北/浙江三个 fetcher 复用。
 */
export async function fetchTrsBids(cfg: TrsSourceConfig): Promise<BidItem[]> {
  const items: BidItem[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of KEYWORDS) {
    for (let page = 0; page < MAX_PAGES_PER_SOURCE; page++) {
      const pn = page * PAGE_SIZE; // 接口偏移量从 0 开始
      let records: TrsRecord[] = [];
      try {
        records = await postSearch(cfg, keyword, pn);
      } catch (err) {
        console.warn(`[trs:${cfg.baseUrl}] 搜索失败 kw=${keyword} page=${page + 1}:`, (err as Error).message);
      }

      for (const rec of records) {
        const item = toBidItem(cfg, rec);
        if (!item) continue;
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        items.push(item);
      }

      // 页间隔，最后一页不等候；关键词之间也自然隔开请求。
      if (page < MAX_PAGES_PER_SOURCE - 1) await sleep(PAGE_INTERVAL_MS);
    }
  }

  return items;
}
