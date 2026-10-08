/**
 * 本地去重：把已经推送过的 URL 持久化到 data/seen.json。
 *
 * 作用：
 * - AIHOT 侧虽然也按 URL 归一化去重，但爬虫先过滤一遍可以减少无效请求、
 *   也避免把"已经推过但 AIHOT 那边处理中"的条目重复计入 created。
 * - seen.json 是一个简单的 URL 字符串集合，JSON 序列化，便于人工查看和调试。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { SEEN_FILE } from "../config.ts";
import type { BidItem } from "./types.ts";

/** seen.json 文件结构 */
interface SeenFileShape {
  urls: string[];
}

/**
 * 读取已见过的 URL 集合。文件不存在时返回空集（首次运行）。
 * 其他读取/解析错误直接抛出，避免静默丢失状态。
 */
export async function loadSeen(): Promise<Set<string>> {
  try {
    const raw = await readFile(SEEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<SeenFileShape>;
    const urls = Array.isArray(parsed.urls) ? parsed.urls : [];
    return new Set(urls.filter((u): u is string => typeof u === "string"));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return new Set<string>();
    throw err;
  }
}

/**
 * 把 URL 集合写回 SEEN_FILE。目录不存在时自动创建。
 * 以 2 空格缩进输出，方便人工 diff。
 */
export async function saveSeen(urls: Set<string>): Promise<void> {
  await mkdir(dirname(SEEN_FILE), { recursive: true });
  const payload: SeenFileShape = { urls: Array.from(urls).sort() };
  await writeFile(SEEN_FILE, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * 从一批条目里挑出 URL 不在 seen 中的"新"条目。
 * 纯函数，不修改入参和 seen。
 */
export function filterNew(items: BidItem[], seen: Set<string>): BidItem[] {
  return items.filter((it) => !seen.has(it.url));
}
