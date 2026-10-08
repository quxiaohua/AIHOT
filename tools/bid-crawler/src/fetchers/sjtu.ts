/**
 * 上海交通大学数字化采购平台（pboffice.sjtu.edu.cn）抓取器。
 *
 * 思必得 sfw_cms 平台。与清华/浙大不同：上交记录的 syncId 为 null，
 * contentHtml 字段直接是外链（ebidding.sjtu.edu.cn/ProjectMgr/ZBGG?ggid=...），
 * helper 已处理这种情况（contentHtml 是 http 开头时直接用作详情链接）。
 */

import { KEYWORDS } from "../../config.js";
import type { FetchResult } from "../types.js";
import { fetchSfwBids } from "./_university-helper.js";

export async function fetchBids(): Promise<FetchResult> {
  const all = await fetchSfwBids({
    apiUrl: "https://pboffice.sjtu.edu.cn/sfw_cms/e",
    referer:
      "https://pboffice.sjtu.edu.cn/sfw_cms/e?page=cms.psms.gglist&typeDetail=GS",
    typeCodes: ["ZCXQ", "YQXQ", "BYXQ", "CSXQ"],
    // syncId 为 null 时用不到此前缀，留空即可。
    detailPrefix: "https://pboffice.sjtu.edu.cn/provider/#/publish/",
  });

  const items = all.filter((it) => KEYWORDS.some((k) => it.title.includes(k)));
  return {
    sourceId: "bid-sjtu",
    sourceName: "上海交通大学-采购公告",
    items,
  };
}
