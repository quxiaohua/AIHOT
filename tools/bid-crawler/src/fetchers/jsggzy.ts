/**
 * 江苏省公共资源交易平台（jsggzy.jszwfw.gov.cn）招标信源抓取器。
 *
 * 列表页 /jyxx/tradeInfonew.html 是 JS 渲染，数据来自 TRS 全文检索接口，
 * 复用共享 helper _trs-helper.ts。地区字段为 zhuanzai（如"镇江市"）。
 */

import { fetchTrsBids } from "./_trs-helper.js";
import type { FetchResult } from "../types.js";

export async function fetchBids(): Promise<FetchResult> {
  const items = await fetchTrsBids({
    baseUrl: "http://jsggzy.jszwfw.gov.cn",
    referer: "http://jsggzy.jszwfw.gov.cn/jyxx/tradeInfonew.html",
    regionField: "zhuanzai",
  });
  return { sourceId: "bid-jsggzy", sourceName: "江苏省公共资源交易平台", items };
}
