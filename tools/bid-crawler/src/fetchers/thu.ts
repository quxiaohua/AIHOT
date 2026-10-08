/**
 * 清华大学采购信息发布平台（sbcgczxxfb.sysc.tsinghua.edu.cn）抓取器。
 *
 * 平台是思必得 sfw_cms，列表数据走 POST /sfw_cms/e（page=cms.psms.publish.query）。
 * 详见 _university-helper.ts 顶部说明。
 *
 * 采购公告类型码取页面左侧"采购公告"tab 的 data-dipid：
 *   ZCGS(招标公示) ZCXQ(采购需求) YQXQ(邀请需求) BYXQ(比选需求) CSXQ(竞争性需求)
 * 详情链接跳转到供应商服务平台 sbgysfw.sysc.tsinghua.edu.cn/#/publish/<syncId>。
 */

import { KEYWORDS } from "../../config.js";
import type { FetchResult } from "../types.js";
import { fetchSfwBids } from "./_university-helper.js";

export async function fetchBids(): Promise<FetchResult> {
  const all = await fetchSfwBids({
    apiUrl: "https://sbcgczxxfb.sysc.tsinghua.edu.cn/sfw_cms/e",
    referer:
      "https://sbcgczxxfb.sysc.tsinghua.edu.cn/sfw_cms/e?page=cms.psms.gglist&typeDetail=XQ",
    typeCodes: ["ZCGS", "ZCXQ", "YQXQ", "BYXQ", "CSXQ"],
    detailPrefix: "https://sbgysfw.sysc.tsinghua.edu.cn/#/publish/",
  });

  // 高校列表无关键词搜索，本地按 KEYWORDS 过滤标题。
  const items = all.filter((it) => KEYWORDS.some((k) => it.title.includes(k)));
  return {
    sourceId: "bid-thu",
    sourceName: "清华大学-采购公告",
    items,
  };
}
