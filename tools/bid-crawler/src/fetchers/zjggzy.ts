/**
 * 浙江省公共资源交易服务平台（ggzy.zj.gov.cn）招标信源抓取器。
 *
 * 与江苏同款 TRS 全文检索接口，复用共享 helper _trs-helper.ts。
 * 地区字段为 infod（如"省本级"）。
 */

import { fetchTrsBids } from "./_trs-helper.js";
import type { FetchResult } from "../types.js";

export async function fetchBids(): Promise<FetchResult> {
  const items = await fetchTrsBids({
    baseUrl: "https://ggzy.zj.gov.cn",
    referer: "https://ggzy.zj.gov.cn/",
    regionField: "infod",
  });
  return { sourceId: "bid-zjggzy", sourceName: "浙江省公共资源交易服务平台", items };
}
