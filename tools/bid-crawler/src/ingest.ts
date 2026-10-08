/**
 * 批量推送到 AIHOT /api/ingest/items。
 *
 * 契约（已核实 apps/api/src/routes/ingest.ts）：
 * - POST INGEST_URL
 * - Header: Authorization: Bearer <INGEST_TOKEN>, Content-Type: application/json
 * - Body: { sourceId, sourceName?, items: [{ title, url, publishedAt?, author?, raw? }] }
 * - 单批最多 50 条（INGEST_BATCH_SIZE），超过自动分批
 * - 成功响应: { ok: true, created: number }
 * - 失败响应: { ok: false, error } + 非 2xx 状态码
 *
 * 字段映射：BidItem.region → author（AIHOT 侧用 author 存"来源/地区"类辅助字段）。
 */

import {
  INGEST_BATCH_SIZE,
  INGEST_TIMEOUT_MS,
  INGEST_URL,
} from "../config.ts";
import type { BidItem } from "./types.ts";

/** 单次调用的汇总结果 */
export interface IngestSummary {
  /** 实际发出的条目数（=入参 items.length） */
  sent: number;
  /** AIHOT 侧新创建的文章数（已存在的 URL 不计入） */
  created: number;
}

/** AIHOT ingest 响应的最小形状 */
interface IngestResponse {
  ok?: boolean;
  created?: number;
  error?: string;
}

/**
 * 把一个信源的一批条目推送到 AIHOT。
 * 中途任意一批失败都会抛错，由调用方（main.ts）决定是否继续其他信源。
 *
 * @throws 如果 INGEST_TOKEN 缺失、网络失败、HTTP 非 2xx、或返回 ok:false
 */
export async function ingestBatch(
  sourceId: string,
  sourceName: string,
  items: BidItem[],
): Promise<IngestSummary> {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    throw new Error(
      "INGEST_TOKEN 未设置：请在 AIHOT 根目录 .env 中配置，或通过环境变量注入",
    );
  }

  let sent = 0;
  let created = 0;

  for (let i = 0; i < items.length; i += INGEST_BATCH_SIZE) {
    const chunk = items.slice(i, i + INGEST_BATCH_SIZE);
    // 字段映射：region → author；bidType / region / highlight 放进 raw 保留原始信息
    const bodyItems = chunk.map((it) => ({
      title: it.title,
      url: it.url,
      publishedAt: it.publishedAt,
      author: it.region,
      raw: { ...it.raw, bidType: it.bidType, region: it.region },
    }));

    const res = await postJson(token, {
      sourceId,
      sourceName,
      items: bodyItems,
    });

    sent += chunk.length;
    created += res.created ?? 0;
  }

  return { sent, created };
}

/** 单次 POST，带超时。非 2xx 或 ok:false 都会 throw。 */
async function postJson(token: string, body: unknown): Promise<IngestResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS);
  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ingest HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    let json: IngestResponse = {};
    try {
      json = JSON.parse(text) as IngestResponse;
    } catch {
      // 容忍返回体不是 JSON 的情况（理论上不会发生，本地回环）
    }
    if (json.ok === false) {
      throw new Error(`ingest 业务错误: ${json.error ?? "unknown"}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}
