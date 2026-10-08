/**
 * 招标信息爬虫 — 集中配置
 *
 * 改关键词、信源、频率都在这里，不需要动代码。
 */

import { resolve } from "node:path";

/** 爬虫根目录：以进程 CWD 为锚点（launchd 设了 WorkingDirectory，npm 脚本也在包目录运行）。
 *  不用 import.meta.url 是因为编译后 dist/ 多一层目录，相对路径会偏移。 */
const CRAWLER_ROOT = process.cwd();

// ===== 关键词 =====
// 监控的招标关键词。采招网和千里马都用这些词搜索。
// 新增关键词直接加进数组即可，不需要改其他文件。
export const KEYWORDS = [
  "实验台",
  "实验台通风柜",
  "实验室设备",
  "实验室家具",
] as const;

// ===== 地区高亮 =====
// 命中这些地区关键词的条目，raw.highlight = true，方便在 AIHOT 里筛选。
// 用户确认：全国都抓，江苏条目高亮。
export const HIGHLIGHT_REGIONS = ["江苏"] as const;

// ===== 抓取参数 =====
/** 单次 HTTP 请求超时（毫秒）。静态页面通常 1-3 秒返回，10 秒留出充足余量。 */
export const FETCH_TIMEOUT_MS = 10_000;

/** 每个信源最多翻几页。每天 3 次低频抓取，前 2 页足够覆盖新条目。 */
export const MAX_PAGES_PER_SOURCE = 2;

/** 两次页面请求之间的间隔（毫秒）。每天仅 3 次、每次几页，1.5 秒间隔对目标站无压力。 */
export const PAGE_INTERVAL_MS = 1_500;

/** 网络失败重试次数。3 次重试覆盖临时抖动，再多也无意义（目标站宕机时应等下次定时）。 */
export const FETCH_RETRY = 3;

/** 重试退避基数（毫秒），第 n 次重试等待 base * 2^(n-1)。 */
export const RETRY_BASE_MS = 2_000;

// ===== AIHOT ingest =====
/** ingest 端点。AIHOT api 默认监听 3001 端口。 */
export const INGEST_URL = "http://127.0.0.1:3001/api/ingest/items";

/** 每批最多推送条数。AIHOT 接口硬限制 50，爬虫侧分批。 */
export const INGEST_BATCH_SIZE = 50;

/** ingest 请求超时（毫秒）。本地回环，5 秒足够。 */
export const INGEST_TIMEOUT_MS = 5_000;

/** 两个信源推送之间的间隔（毫秒）。24 个源集中推送会触发 AIHOT API 限流（429），
 *  每源间隔 1.5 秒平滑请求速率，本地回环不影响总耗时。 */
export const INGEST_INTERVAL_MS = 1_500;

// ===== 信源 ID（对应 AIHOT sources 表） =====
export const SOURCE_CAIZHAO_ID = "bid-caizhao";
export const SOURCE_CAIZHAO_NAME = "采招网-招标监控";
export const SOURCE_QIANLIMA_ID = "bid-qianlima";
export const SOURCE_QIANLIMA_NAME = "千里马-招标监控";

// ===== 路径 =====
/** 去重状态文件 */
export const SEEN_FILE = resolve(CRAWLER_ROOT, "data/seen.json");
/** 运行日志文件 */
export const RUN_LOG = resolve(CRAWLER_ROOT, "data/run.log");
/** AIHOT 根目录的 .env（取 INGEST_TOKEN） */
export const AIHOT_ENV_FILE = resolve(CRAWLER_ROOT, "../../.env");
