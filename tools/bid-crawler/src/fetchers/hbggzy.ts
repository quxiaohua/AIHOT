/**
 * 湖北省公共资源交易中心（www.hbggzy.cn）招标信源抓取器。
 *
 * 与江苏同款 TRS 全文检索接口，复用共享 helper _trs-helper.ts。
 * 地区字段为 xiaquname（如"荆州市"）。
 */

import { fetchTrsBids } from "./_trs-helper.js";
import type { FetchResult } from "../types.js";

export async function fetchBids(): Promise<FetchResult> {
  const items = await fetchTrsBids({
    baseUrl: "https://www.hbggzy.cn",
    referer: "https://www.hbggzy.cn/",
    regionField: "xiaquname",
  });
  return { sourceId: "bid-hbggzy", sourceName: "湖北省公共资源交易中心", items };
}
