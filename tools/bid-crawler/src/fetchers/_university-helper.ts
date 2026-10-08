/**
 * 思必得（sfw_cms）高校采购平台共享 helper。
 *
 * 多所高校（清华、浙大、上海交大、中科大）的采购信息发布平台用的是同一套
 * "思必得软件" CMS（页面底部"技术支持：思必得软件"）。列表页本身是空壳 HTML，
 * 数据通过 POST 到 `<context>/e`（page=cms.psms.publish.query）拉取 JSON。
 *
 * 本 helper 封装：
 *   - 带超时+指数退避重试的 POST 请求；
 *   - 从 JSON resultset 解析标题/日期/类型；
 *   - 拼详情链接（syncId 走 SPA hash 路由；上交部分记录 contentHtml 直接是外链）。
 *
 * 各学校差异仅在 base URL / Referer / 采购公告类型码 / 详情前缀，由调用方传入。
 */

import {
  FETCH_RETRY,
  FETCH_TIMEOUT_MS,
  MAX_PAGES_PER_SOURCE,
  PAGE_INTERVAL_MS,
  RETRY_BASE_MS,
} from "../../config.js";
import type { BidItem } from "../types.js";

/** 浏览器 UA：与列表页保持一致，避免被风控。 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** 思必得后台固定的 ops_uuid（所有学校列表页里都硬编码同一个值）。 */
const OPS_UUID = "333ca4c9cf2ff14aad01c547e10303a8";

/** 每页条数：沿用站点默认 limit=25，与浏览器行为一致。 */
const PAGE_SIZE = 25;

/** 一条思必得 API 返回的记录（只列用到的字段）。 */
export interface SfwPublishRecord {
  subject: string;
  beginTime: string;
  type?: string;
  shopTypeName?: string;
  syncId?: string | null;
  contentHtml?: string | null;
}

/** 调用方传入的学校配置。 */
export interface SfwSiteConfig {
  /** API 端点完整 URL，如 https://sbcgczxxfb.sysc.tsinghua.edu.cn/sfw_cms/e */
  apiUrl: string;
  /** Referer 列表页 URL（后端校验来源用）。 */
  referer: string;
  /** 采购公告类型码数组（对应页面左侧"采购公告"tab 的 data-dipid）。 */
  typeCodes: string[];
  /**
   * 详情链接前缀：syncId 非空时拼 `detailPrefix + syncId`。
   * 上交的记录 contentHtml 本身是完整外链，此时忽略此前缀。
   */
  detailPrefix: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** "2026-09-30 16:25:48" -> ISO8601 东八区。 */
function toIso(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(dateStr.trim());
  if (!m) return undefined;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:00+08:00`;
}

/** 带超时+指数退避重试 POST 一页，返回 resultset。失败重试 FETCH_RETRY 次后抛错。 */
async function fetchPage(
  cfg: SfwSiteConfig,
  page: number,
): Promise<SfwPublishRecord[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const body = new URLSearchParams({
        page: "cms.psms.publish.query",
        window_: "json",
        request_method_: "ajax",
        start: String((page - 1) * PAGE_SIZE + 1),
        limit: String(PAGE_SIZE),
        sort: "begin_time desc",
        ops_uuid: OPS_UUID,
      });
      // type 是数组，jQuery 序列化为 type[]=...；逗号分隔会被当成单值导致 count=0。
      for (const t of cfg.typeCodes) body.append("type[]", t);

      const res = await fetch(cfg.apiUrl, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: cfg.referer,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { resultset?: SfwPublishRecord[] };
      return json.resultset ?? [];
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < FETCH_RETRY) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/**
 * 抓取一个思必得平台学校的采购公告列表（MAX_PAGES_PER_SOURCE 页）。
 * 调用方负责按 KEYWORDS 过滤标题——这里只负责把条目拉全。
 */
export async function fetchSfwBids(cfg: SfwSiteConfig): Promise<BidItem[]> {
  const items: BidItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES_PER_SOURCE; page++) {
    let records: SfwPublishRecord[] = [];
    try {
      records = await fetchPage(cfg, page);
    } catch (err) {
      console.warn(
        `[sfw-helper] 抓取失败 api=${cfg.apiUrl} page=${page}:`,
        (err as Error).message,
      );
    }

    for (const r of records) {
      const title = (r.subject ?? "").trim();
      if (!title) continue;
      // 详情链接：上交记录 contentHtml 直接是外链；其余用 syncId 拼 SPA hash 路由。
      let url = "";
      if (typeof r.contentHtml === "string" && /^https?:\/\//.test(r.contentHtml)) {
        url = r.contentHtml;
      } else if (r.syncId) {
        url = cfg.detailPrefix + r.syncId;
      }
      if (!url) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      items.push({
        title,
        url,
        publishedAt: toIso(r.beginTime),
        bidType: r.shopTypeName?.trim() || undefined,
      });
    }

    if (page < MAX_PAGES_PER_SOURCE) await sleep(PAGE_INTERVAL_MS);
  }

  return items;
}
