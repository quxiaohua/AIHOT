/**
 * 武汉大学采购与招投标管理中心-货物政府采购公告（zb.whu.edu.cn/cggg/hw/）抓取器。
 *
 * SSR HTML（UTF-8）。
 * 分页：zfcggg.htm（第1页）、zfcggg/47.htm（第2页）…
 *   （该 CMS 页码是倒序：第 2 页=47，第 3 页=46；我们只抓前 2 页，写死第 2 页 URL。）
 *
 * 列表 DOM：
 *   <li class="clearfix">
 *     <div class="list_date2">
 *       <p>30</p><div>2026-09</div>
 *     </div>
 *     <div class="list_right2">
 *       <a href="../../info/1025/143841.htm"><h2>标题</h2></a>
 *     </div>
 *   </li>
 * 日期拆成"日"和"年-月"两段，需要拼成 2026-09-30。
 */

import { PAGE_INTERVAL_MS } from "../../config.js";
import type { BidItem, FetchResult } from "../types.js";
import {
  fetchHtml,
  filterByKeywords,
  loadHtml,
  toIso,
} from "./_html-helper.js";

const BASE = "https://zb.whu.edu.cn";
/** 第 1 页 URL。 */
const PAGE1_URL = `${BASE}/cggg/hw/zfcggg.htm`;
/** 第 2 页 URL（从页面"下页"链接读到的 zfcggg/47.htm）。 */
const PAGE2_URL = `${BASE}/cggg/hw/zfcggg/47.htm`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchBids(): Promise<FetchResult> {
  const items: BidItem[] = [];
  const seen = new Set<string>();
  const urls = [PAGE1_URL, PAGE2_URL];

  for (let i = 0; i < urls.length; i++) {
    let html = "";
    try {
      html = await fetchHtml(urls[i]);
    } catch (err) {
      console.warn(`[whu] 抓取失败 url=${urls[i]}:`, (err as Error).message);
    }
    const $ = loadHtml(html);

    $("ul li.clearfix").each((_, el) => {
      const $li = $(el);
      const $a = $li.find(".list_right2 a").first();
      const href = $a.attr("href")?.trim() ?? "";
      const title = $a.find("h2").text().trim();
      if (!title || !href) return;

      // 拼详情链接：href 是 ../../info/... 相对 /cggg/hw/，规范化后即 /info/...
      const url = new URL(href, `${BASE}/cggg/hw/`).toString();

      // 日期：<p>日</p><div>年-月</div>
      const day = $li.find(".list_date2 p").text().trim();
      const ym = $li.find(".list_date2 div").text().trim();
      const dateText = day && ym ? `${ym}-${day.padStart(2, "0")}` : "";

      if (seen.has(url)) return;
      seen.add(url);

      items.push({ title, url, publishedAt: toIso(dateText) });
    });

    if (i < urls.length - 1) await sleep(PAGE_INTERVAL_MS);
  }

  return {
    sourceId: "bid-whu",
    sourceName: "武汉大学-政府采购公告(货物)",
    items: filterByKeywords(items),
  };
}
