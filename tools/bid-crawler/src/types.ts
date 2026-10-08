/**
 * 招标信息爬虫 — 共享类型
 */

/** 单条招标信息 */
export interface BidItem {
  /** 标题 */
  title: string;
  /** 原文链接（绝对 URL） */
  url: string;
  /** 发布时间，ISO 8601（如 2026-09-30T09:00:00+08:00）；解析不到时省略 */
  publishedAt?: string;
  /** 地区（省/市，如"江苏""江苏南京"）；解析不到时省略 */
  region?: string;
  /** 招标类型：招标公告 / 中标结果 / 预告 / 变更 */
  bidType?: string;
  /** 原始字段透传，region 模块会写入 highlight 标记 */
  raw?: Record<string, unknown>;
}

/** 一个信源的抓取结果 */
export interface FetchResult {
  /** 信源 ID，对应 AIHOT ingest 的 sourceId（如 bid-caizhao） */
  sourceId: string;
  /** 信源名称，对应 AIHOT ingest 的 sourceName */
  sourceName: string;
  /** 抓到的条目 */
  items: BidItem[];
}

/** fetcher 模块的统一接口 */
export interface Fetcher {
  (): Promise<FetchResult>;
}
