/**
 * 浙江大学采购网（www.zupc.zju.edu.cn）抓取器。
 *
 * 思必得 sfw_cms 平台，与清华同构。注意 API contextpath 是 /cms 而非 /sfw_cms。
 * 详情链接：/provider/#/publish/<syncId>（相对本站根）。
 */

import { KEYWORDS } from "../../config.js";
import type { FetchResult } from "../types.js";
import { fetchSfwBids } from "./_university-helper.js";

export async function fetchBids(): Promise<FetchResult> {
  const all = await fetchSfwBids({
    apiUrl: "http://www.zupc.zju.edu.cn/cms/e",
    referer: "http://www.zupc.zju.edu.cn/cms/e?page=cms.psms.gglist&typeDetail=A",
    typeCodes: ["ZCXQ", "YQXQ", "BYXQ", "CSXQ"],
    detailPrefix: "http://www.zupc.zju.edu.cn/provider/#/publish/",
  });

  const items = all.filter((it) => KEYWORDS.some((k) => it.title.includes(k)));
  return {
    sourceId: "bid-zju",
    sourceName: "浙江大学-采购公告",
    items,
  };
}
