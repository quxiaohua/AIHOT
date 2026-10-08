/**
 * 中国科学技术大学采购管理办公室（cggl.ustc.edu.cn）抓取器。
 *
 * 思必得 sfw_cms 平台。详情链接：/provider/#/publish/<syncId>。
 */

import { KEYWORDS } from "../../config.js";
import type { FetchResult } from "../types.js";
import { fetchSfwBids } from "./_university-helper.js";

export async function fetchBids(): Promise<FetchResult> {
  const all = await fetchSfwBids({
    apiUrl: "https://cggl.ustc.edu.cn/sfw_cms/e",
    referer:
      "https://cggl.ustc.edu.cn/sfw_cms/e?page=cms.psms.gglist&typeDetail=XQ",
    typeCodes: ["ZCXQ", "YQXQ", "BYXQ", "CSXQ"],
    detailPrefix: "https://cggl.ustc.edu.cn/provider/#/publish/",
  });

  const items = all.filter((it) => KEYWORDS.some((k) => it.title.includes(k)));
  return {
    sourceId: "bid-ustc",
    sourceName: "中国科学技术大学-采购公告",
    items,
  };
}
