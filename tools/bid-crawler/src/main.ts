/**
 * 爬虫入口：
 *   加载 AIHOT .env
 *   → 并行抓取所有信源（采招网/千里马/政府采购/公共资源/高校/医院/商业聚合）
 *   → 本地去重（seen.json）
 *   → 逐条做地区标注 + 江苏高亮
 *   → 按 sourceId 分组推送到 AIHOT /api/ingest/items
 *   → 把成功推送的 URL 写回 seen.json
 *   → 追加写一行运行日志到 data/run.log
 *
 * 容错原则：
 * - 单个 fetcher 抛错不影响其他；
 * - 单个 sourceId 推送失败不影响其他 sourceId；
 * - 只有真正成功推送的 URL 才写回 seen，失败的下次还会重试。
 *
 * 并发策略：24 个 fetcher 分 4 批（每批 6 个）执行，避免同时打 24 个连接。
 * 批内并行，批间串行；每个 fetcher 内部还有 PAGE_INTERVAL_MS 翻页间隔。
 *
 * 退出码：全部成功 0；有任何抓取或推送失败 1。
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { AIHOT_ENV_FILE, INGEST_INTERVAL_MS, RUN_LOG } from "../config.ts";
import { filterNew, loadSeen, saveSeen } from "./dedup.ts";
import { annotateRegion } from "./region.ts";
import { ingestBatch } from "./ingest.ts";
import type { BidItem, FetchResult, Fetcher } from "./types.ts";

// ===== 现有商业聚合源 =====
import { fetchBids as fetchCaizhao } from "./fetchers/caizhao.ts";
import { fetchBids as fetchQianlima } from "./fetchers/qianlima.ts";

// ===== 官方源 =====
import { fetchBids as fetchCcgp } from "./fetchers/ccgp.ts";
import { fetchBids as fetchJsggzy } from "./fetchers/jsggzy.ts";
import { fetchBids as fetchHbggzy } from "./fetchers/hbggzy.ts";
import { fetchBids as fetchZjggzy } from "./fetchers/zjggzy.ts";
import { fetchBids as fetchShggzy } from "./fetchers/shggzy.ts";

// ===== 高校 / 教育装备源 =====
import { fetchBids as fetchEduEquip } from "./fetchers/caigou-edu.ts";
import { fetchBids as fetchThu } from "./fetchers/thu.ts";
import { fetchBids as fetchPku } from "./fetchers/pku.ts";
import { fetchBids as fetchZju } from "./fetchers/zju.ts";
import { fetchBids as fetchSjtu } from "./fetchers/sjtu.ts";
import { fetchBids as fetchFudan } from "./fetchers/fudan.ts";
import { fetchBids as fetchNju } from "./fetchers/nju.ts";
import { fetchBids as fetchUstc } from "./fetchers/ustc.ts";
import { fetchBids as fetchHust } from "./fetchers/hust.ts";
import { fetchBids as fetchWhu } from "./fetchers/whu.ts";
import { fetchBids as fetchSysu } from "./fetchers/sysu.ts";

// ===== 医院源 =====
import { fetchBids as fetchXiehe } from "./fetchers/xiehe.ts";
import { fetchBids as fetchHuaxi } from "./fetchers/huaxi.ts";
import { fetchBids as fetchRuijin } from "./fetchers/ruijin.ts";
import { fetchBids as fetchZhongshanyi } from "./fetchers/zhongshanyi.ts";

// ===== 商业聚合源（新增） =====
import { fetchBids as fetchJianyu } from "./fetchers/jianyu.ts";
import { fetchBids as fetchChinabidding } from "./fetchers/chinabidding.ts";

/** 所有 fetcher 列表，分 4 批执行（每批最多 6 个并发）。 */
const FETCHER_BATCHES: Fetcher[][] = [
  // 第 1 批：原有商业源 + 政府采购 + 江苏（请求量较大的源先跑）
  [fetchCaizhao, fetchQianlima, fetchCcgp, fetchJsggzy, fetchHbggzy, fetchZjggzy],
  // 第 2 批：上海 + 教育装备 + 前 5 高校
  [fetchShggzy, fetchEduEquip, fetchThu, fetchPku, fetchZju, fetchSjtu],
  // 第 3 批：后 5 高校
  [fetchFudan, fetchNju, fetchUstc, fetchHust, fetchWhu, fetchSysu],
  // 第 4 批：4 医院 + 2 商业
  [fetchXiehe, fetchHuaxi, fetchRuijin, fetchZhongshanyi, fetchJianyu, fetchChinabidding],
];

// ---- 启动：加载 AIHOT 根目录的 .env（取 INGEST_TOKEN）----
process.loadEnvFile(AIHOT_ENV_FILE);

/** 按信源分组的待推送条目 */
interface Group {
  sourceId: string;
  sourceName: string;
  items: BidItem[];
}

async function main(): Promise<number> {
  const startedAt = new Date();
  const seen = await loadSeen();

  // ---- 1. 分批并行抓取，单源失败隔离 ----
  // 每批内 Promise.allSettled 并行，批间串行；避免 24 个 fetcher 同时打连接。
  const okResults: FetchResult[] = [];
  let fetchedTotal = 0;
  let fetchFailures = 0;
  for (let bi = 0; bi < FETCHER_BATCHES.length; bi++) {
    const batch = FETCHER_BATCHES[bi];
    console.log(`[crawler] 开始第 ${bi + 1}/${FETCHER_BATCHES.length} 批（${batch.length} 个源）`);
    const settled = await Promise.allSettled(batch.map((f) => f()));
    for (const r of settled) {
      if (r.status === "fulfilled") {
        okResults.push(r.value);
        fetchedTotal += r.value.items.length;
      } else {
        fetchFailures += 1;
        console.error(
          `[crawler] 抓取失败: ${(r.reason as Error)?.message ?? String(r.reason)}`,
        );
      }
    }
  }

  // ---- 2. 按信源分组：去重 + 地区标注 ----
  // 必须在分组阶段就 filterNew，因为 BidItem 本身不带 sourceId，拍平后无法回组。
  const groups: Group[] = [];
  let freshTotal = 0;
  for (const r of okResults) {
    const fresh = filterNew(r.items, seen).map(annotateRegion);
    freshTotal += fresh.length;
    groups.push({
      sourceId: r.sourceId,
      sourceName: r.sourceName,
      items: fresh,
    });
  }

  // ---- 3. 逐组推送；成功的 URL 才记入 seen ----
  // 源间加 INGEST_INTERVAL_MS 间隔，避免集中推送触发 AIHOT API 429 限流。
  let sentTotal = 0;
  let createdTotal = 0;
  let pushFailures = 0;
  const newlySeen = new Set<string>();
  let groupIndex = 0;
  for (const g of groups) {
    if (g.items.length === 0) continue;
    if (groupIndex > 0) await sleep(INGEST_INTERVAL_MS);
    groupIndex++;
    try {
      const s = await ingestBatch(g.sourceId, g.sourceName, g.items);
      sentTotal += s.sent;
      createdTotal += s.created;
      for (const it of g.items) newlySeen.add(it.url);
    } catch (e) {
      pushFailures += 1;
      console.error(
        `[crawler] 推送 ${g.sourceId} 失败: ${(e as Error)?.message ?? String(e)}`,
      );
    }
  }

  // ---- 4. 写回 seen（合并新成功的 URL）----
  for (const u of newlySeen) seen.add(u);
  try {
    await saveSeen(seen);
  } catch (e) {
    // seen 写盘失败不影响退出码判断，但要打日志
    console.error(
      `[crawler] 写回 seen.json 失败: ${(e as Error)?.message ?? String(e)}`,
    );
  }

  // ---- 5. 写运行日志 ----
  const failures = fetchFailures + pushFailures;
  const line =
    `[${startedAt.toISOString()}] 抓取${fetchedTotal}条 ` +
    `新增${freshTotal}条 推送${sentTotal}条(创建${createdTotal}) ` +
    `失败${failures}条\n`;
  await appendLog(line);
  console.log(line.trim());

  return failures === 0 ? 0 : 1;
}

/** 追加写入运行日志；目录不存在时自动建。写盘失败只打 stderr，不影响主流程。 */
async function appendLog(line: string): Promise<void> {
  try {
    await mkdir(dirname(RUN_LOG), { recursive: true });
    await appendFile(RUN_LOG, line, "utf8");
  } catch (e) {
    console.error(`[crawler] 写日志失败: ${(e as Error)?.message ?? String(e)}`);
  }
}

/** 休眠指定毫秒，用于推送间隔等节流场景。 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    // 兜底：连 main 本身都炸了
    console.error(`[crawler] 未捕获异常: ${(e as Error)?.stack ?? String(e)}`);
    process.exit(1);
  });
