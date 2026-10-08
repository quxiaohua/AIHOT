/**
 * 医院采购平台 / 商业聚合站共用的 HTTP 小工具。
 *
 * 这些站都是 UTF-8 静态 HTML（与千里马的 GBK 不同），统一用 fetch + AbortController
 * 做超时、按 FETCH_RETRY 做指数退避重试。与 caizhao/qianlima 里的同名逻辑保持一致，
 * 抽到这里避免每个 fetcher 复制一份。
 */
import { FETCH_RETRY, FETCH_TIMEOUT_MS, RETRY_BASE_MS } from "../../config.js";

/** 桌面 Chrome UA：医院官网与聚合站对桌面 UA 返回完整列表 HTML。 */
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 抓取一个 URL 并按 UTF-8 解码为 HTML 字符串。
 * 失败重试 FETCH_RETRY 次，退避 base * 2^(n-1)；全部失败后抛错，由调用方单条降级。
 */
export async function fetchHtml(url: string, headers?: Record<string, string>): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, ...headers },
        signal: controller.signal,
      });
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

/** "2026-09-30" / "2026.09.30" / "2026/09/30" -> ISO8601（补东八区零点）。解析不到返回 undefined。 */
export function toIso(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = /(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/.exec(dateStr.trim());
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00+08:00`;
}

/** 把 "MM-DD" 补成年份：月份比当前月还大则视为去年（跨年公告不会跑到下一年）。 */
export function mmddToIso(mmdd: string): string | undefined {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd.trim());
  if (!m) return undefined;
  const now = new Date();
  let year = now.getFullYear();
  const month = Number(m[1]);
  if (month > now.getMonth() + 1) year -= 1;
  return `${year}-${m[1]}-${m[2]}T00:00:00+08:00`;
}
