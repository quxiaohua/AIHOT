/**
 * 地区识别 + 江苏高亮。
 *
 * 规则：
 * - 如果 fetcher 已经填了 item.region，直接用它。
 * - 否则从标题里正则匹配 34 个省级行政区简称，命中就写回 item.region。
 * - 识别出的地区（无论是原本就有的还是新匹配的）落在 HIGHLIGHT_REGIONS
 *   （当前配置为 ["江苏"]）里时，把 item.raw.highlight = true，方便 AIHOT 侧筛选。
 * - 其他字段一律不动。
 */

import { HIGHLIGHT_REGIONS } from "../config.ts";
import type { BidItem } from "./types.ts";

/**
 * 全国 34 个省级行政区的简称。
 * 顺序不影响匹配（正则交替按字符精确匹配），长名（内蒙古/黑龙江/广西/西藏/宁夏/新疆）
 * 放一起便于阅读。
 */
const PROVINCES = [
  // 直辖市
  "北京", "天津", "上海", "重庆",
  // 华北/东北/华东/华中/华南
  "河北", "山西", "辽宁", "吉林", "黑龙江",
  "江苏", "浙江", "安徽", "福建", "江西", "山东",
  "河南", "湖北", "湖南", "广东", "海南",
  // 西南/西北
  "四川", "贵州", "云南", "陕西", "甘肃", "青海", "台湾",
  // 自治区
  "内蒙古", "广西", "西藏", "宁夏", "新疆",
  // 特别行政区
  "香港", "澳门",
] as const;

/** 匹配"江苏省 / 北京市 / 广西壮族自治区 / 内蒙古"等写法里的省份简称 */
const PROVINCE_RE = new RegExp(`(${PROVINCES.join("|")})`);

/**
 * 给一条招标标注地区；命中高亮地区时打上 highlight 标记。
 * 直接在入参上就地修改（调用方不再使用原对象时是安全的），并返回该对象以支持链式调用。
 */
export function annotateRegion(item: BidItem): BidItem {
  const region = item.region ?? matchProvince(item.title);
  if (!region) return item; // 识别不出来就原样返回，不写 region 也不打 highlight

  // fetcher 没填 region 但从标题匹配到了——补回去
  if (!item.region) item.region = region;

  // 高亮命中：region 字符串里包含任一 HIGHLIGHT_REGIONS 关键词
  const hit = HIGHLIGHT_REGIONS.some((h) => region.includes(h));
  if (hit) {
    // 保留 raw 里已有的其他字段，只追加 highlight
    item.raw = { ...(item.raw ?? {}), highlight: true };
  }
  return item;
}

/** 从标题里抽第一个命中的省份简称，找不到返回 undefined。 */
function matchProvince(title: string): string | undefined {
  const m = PROVINCE_RE.exec(title);
  return m ? m[1] : undefined;
}
