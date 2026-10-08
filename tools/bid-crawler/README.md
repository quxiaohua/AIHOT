# 招标信息爬虫

抓取全国招标信息（实验台/实验室设备相关关键词），通过 AIHOT ingest 接口入库，由 AIHOT 完成模型筛选、评分、归组和多端展示。

## 信源总览

共 24 个 fetcher，分 4 批并发执行（每批 6 个）。

### 商业聚合源（原有 + 新增）

| 信源 | sourceId | 域名 | 方式 | 状态 |
|---|---|---|---|---|
| 采招网 | bid-caizhao | bidcenter.com.cn | 后端搜索 API（AES-128-CBC 解密） | ✅ |
| 千里马 | bid-qianlima | wap.qianlima.com | 静态 JSP（GBK 编码） | ✅ |
| 剑鱼标讯 | bid-jianyu | jianyu360.cn | 首页 SSR 卡片（列表页为 JS 壳） | ✅ 有限 |
| 中国采购与招标网 | bid-chinabidding | chinabidding.com.cn | 首页 SSR notice-list | ✅ 有限 |
| 比地招标网 | — | bidizhaobiao.com | JS 反爬挑战页，无 SSR 内容 | ❌ 不可行 |
| 标事通 | — | biaoshitong.com | Nuxt SPA，列表需登录 | ❌ 不可行 |

### 官方源

| 信源 | sourceId | 域名 | 方式 | 状态 |
|---|---|---|---|---|
| 中国政府采购网 | bid-ccgp | ccgp.gov.cn | SSR 搜索结果页（有 IP 限流） | ✅ 有限流 |
| 江苏省公共资源交易中心 | bid-jsggzy | jsggzy.jszwfw.gov.cn | TRS 全文检索 API | ✅ |
| 浙江省公共资源交易服务平台 | bid-zjggzy | ggzy.zj.gov.cn | TRS 全文检索 API（同江苏） | ✅ |
| 湖北省公共资源交易中心 | bid-hbggzy | hbggzy.cn | TRS 全文检索 API（同江苏） | ✅ |
| 上海市公共资源交易中心 | bid-shggzy | shggzy.com | SSR 多分类页聚合（无关键词搜索） | ✅ 低召回 |
| 全国公共资源交易平台 | — | ggzy.gov.cn | WAF/TLS 指纹拦截 + 验证码 | ❌ 不可行 |
| 中国招标投标公共服务平台 | — | cebpubservice.com | 搜索接口未逆向 | ⏸ 未实现 |
| 广东省公共资源交易中心 | — | 多平台分散，TRS 索引为空 | ❌ 不可行 |
| 北京市公共资源交易服务平台 | — | bjggzyfw.gov.cn | 连接超时 | ❌ 不可行 |
| 山东省公共资源交易中心 | — | 域名不可达 | ❌ 不可行 |
| 四川省公共资源交易中心 | — | scggzy.com | Cloudflare 人机挑战 | ❌ 不可行 |

### 高校 / 教育装备源

| 信源 | sourceId | 域名 | 方式 | 状态 |
|---|---|---|---|---|
| 中国教育装备采购网 | bid-edu-equipment | caigou.com.cn | SSR HTML（cheerio） | ✅ |
| 清华大学 | bid-thu | sbcgczxxfb.sysc.tsinghua.edu.cn | 思必得 sfw_cms POST API | ✅ |
| 北京大学 | bid-pku | zwb.pku.edu.cn | SSR HTML（总务部招标公告） | ✅ |
| 浙江大学 | bid-zju | zupc.zju.edu.cn | 思必得 sfw_cms POST API | ✅ |
| 上海交通大学 | bid-sjtu | pboffice.sjtu.edu.cn | 思必得 sfw_cms POST API | ✅ |
| 复旦大学 | bid-fudan | czzx.fudan.edu.cn | SSR HTML（博达 VSB CMS） | ✅ |
| 南京大学 | bid-nju | zb.nju.edu.cn | SSR HTML（上海瞬速 CMS） | ✅ |
| 中国科学技术大学 | bid-ustc | cggl.ustc.edu.cn | 思必得 sfw_cms POST API | ✅ |
| 华中科技大学 | bid-hust | cgzx.hust.edu.cn | SSR HTML（上海瞬速 CMS） | ✅ |
| 武汉大学 | bid-whu | zb.whu.edu.cn | SSR HTML（日期分段显示） | ✅ |
| 中山大学 | bid-sysu | bidding.sysu.edu.cn | SSR HTML（Drupal，列表无日期） | ✅ |

### 医院源

| 信源 | sourceId | 域名 | 方式 | 状态 |
|---|---|---|---|---|
| 北京协和医院 | bid-xiehe | pumch.cn | SSR 公告列表 | ✅ |
| 四川大学华西医院 | bid-huaxi | wchscu.cn | SSR 招标列表 | ✅ |
| 上海瑞金医院 | bid-ruijin | rjh.com.cn | 首页 SSR 锚点（URL 含日期） | ✅ 有限 |
| 中山一院 | bid-zhongshanyi | fahsysu.org.cn | SSR Drupal Views | ✅ |

> **关于"0 条命中"**：高校/医院/商业站抓的是最新公告列表，再用窄关键词（实验台/实验室设备等）过滤。多数日期的最新公告里没有实验室相关项目，这是正常现象。fetcher 本身已验证可正确解析列表（如上海交大曾命中"氚分离实验台采购邀请"）。低频定时运行时一旦出现匹配条目即会入库。

## 安装与构建

```bash
cd tools/bid-crawler
npm install
npm run build        # tsc 编译到 dist/
```

> 需要 Node.js ≥ 24（本机路径 `$HOME/.nvm/versions/node/v24.14.0/bin/node`）。

## 运行

### 手动运行

```bash
cd tools/bid-crawler
npm start            # = node dist/src/main.js
```

运行结束后输出一行摘要，例如：
```
[2026-09-30T04:33:43.882Z] 抓取238条 新增238条 推送238条(创建238) 失败0条
```

### 定时运行（launchd）

工作日 9:00 / 14:00 / 18:00 自动触发，跑完即退出。

```bash
# 安装（复制到 LaunchAgents 并加载）
cp launchd/com.aihot.bid-crawler.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.aihot.bid-crawler.plist

# 查看状态
launchctl list | grep bid-crawler

# 卸载
launchctl unload ~/Library/LaunchAgents/com.aihot.bid-crawler.plist
rm ~/Library/LaunchAgents/com.aihot.bid-crawler.plist

# 立即触发一次（不等定时）
launchctl start com.aihot.bid-crawler
```

> 前提：AIHOT API 正在运行（`npm run dev:api`），ingest 接口监听 3001 端口。

## 配置

所有配置集中在 `config.ts`，改完重新 `npm run build`。

### 添加关键词

编辑 `config.ts` 中的 `KEYWORDS` 数组：

```ts
export const KEYWORDS = [
  "实验台",
  "实验台通风柜",
  "实验室设备",
  "实验室家具",
  // 新增关键词直接加在这里
] as const;
```

两个信源都会遍历所有关键词搜索，结果按 URL 去重合并。高校/医院/商业站不支持关键词搜索的，抓最新列表后在本地用 KEYWORDS 过滤标题。

### 调整抓取频率

launchd 定时：编辑 `launchd/com.aihot.bid-crawler.plist` 中的 `StartCalendarInterval`，然后 `launchctl unload && load`。

抓取深度：`config.ts` 中的 `MAX_PAGES_PER_SOURCE`（每个关键词每源翻几页，默认 2）。

### 地区高亮

`config.ts` 中的 `HIGHLIGHT_REGIONS`（默认 `["江苏"]`）。命中地区的条目 `raw.highlight = true`，可在 AIHOT 中筛选。

### 其他参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `FETCH_TIMEOUT_MS` | 10000 | 单次请求超时 |
| `FETCH_RETRY` | 3 | 失败重试次数（指数退避） |
| `PAGE_INTERVAL_MS` | 1500 | 翻页间隔，对目标站友好 |
| `INGEST_BATCH_SIZE` | 50 | 每批推送条数（AIHOT 硬限制） |
| `INGEST_INTERVAL_MS` | 1500 | 信源间推送间隔，避免 AIHOT API 429 限流 |
| `MAX_PAGES_PER_SOURCE` | 2 | 每个关键词每源翻几页 |

## 数据流向

```
24 个信源（分 4 批并发）
    │  fetch + 解析（SSR HTML / API / GBK）
    ▼
BidItem[]（标题/链接/日期/地区/类型）
    │  本地去重（data/seen.json，按 URL）
    ▼
地区标注 + 江苏高亮（raw.highlight）
    │  逐信源分批 POST（每批 ≤50，源间间隔 1.5s）
    ▼
AIHOT POST /api/ingest/items
    │  自动建信源、按 URL 去重
    ▼
AIHOT 模型流水线（预筛/评分/写作/归组）
    ▼
网站 / RSS / API / MCP
```

## 查看日志

- **运行日志**：`data/run.log`，每次运行追加一行：`[时间] 抓取X条 新增Y条 推送Z条(创建W) 失败N条`
- **launchd 输出**：`data/launchd.out.log`（stdout）、`data/launchd.err.log`（stderr）
- **去重状态**：`data/seen.json`，已推送过的 URL 集合

```bash
# 最近运行记录
tail -20 data/run.log

# launchd 错误
tail -50 data/launchd.err.log
```

## 文件结构

```
tools/bid-crawler/
├── package.json
├── tsconfig.json
├── config.ts                  # 关键词、信源、超时、路径等集中配置
├── launchd/
│   └── com.aihot.bid-crawler.plist
├── src/
│   ├── main.ts                # 入口：分批并发抓取 → 去重 → 标注 → 推送
│   ├── types.ts               # BidItem / FetchResult / Fetcher 类型
│   ├── dedup.ts               # 本地 seen.json 去重
│   ├── region.ts              # 地区识别 + 江苏高亮
│   ├── ingest.ts              # 批量 POST 到 AIHOT
│   └── fetchers/
│       ├── caizhao.ts         # 采招网（AES 解密 API）
│       ├── qianlima.ts        # 千里马 wap（GBK HTML）
│       ├── ccgp.ts            # 中国政府采购网（SSR 搜索）
│       ├── jsggzy.ts          # 江苏公共资源（TRS API）
│       ├── hbggzy.ts          # 湖北公共资源（TRS API）
│       ├── zjggzy.ts          # 浙江公共资源（TRS API）
│       ├── shggzy.ts          # 上海公共资源（SSR 多分类）
│       ├── caigou-edu.ts      # 中国教育装备采购网
│       ├── thu.ts             # 清华大学（思必得 API）
│       ├── pku.ts             # 北京大学（SSR）
│       ├── zju.ts             # 浙江大学（思必得 API）
│       ├── sjtu.ts            # 上海交大（思必得 API）
│       ├── fudan.ts           # 复旦大学（SSR）
│       ├── nju.ts             # 南京大学（SSR）
│       ├── ustc.ts            # 中科大（思必得 API）
│       ├── hust.ts            # 华中科大（SSR）
│       ├── whu.ts             # 武汉大学（SSR）
│       ├── sysu.ts            # 中山大学（SSR）
│       ├── xiehe.ts           # 协和医院（SSR）
│       ├── huaxi.ts           # 华西医院（SSR）
│       ├── ruijin.ts          # 瑞金医院（首页 SSR）
│       ├── zhongshanyi.ts     # 中山一院（SSR）
│       ├── jianyu.ts          # 剑鱼标讯（首页 SSR）
│       ├── chinabidding.ts    # 中国采购与招标网（首页 SSR）
│       ├── _trs-helper.ts     # 共享：TRS 全文检索 API（苏/鄂/浙）
│       ├── _university-helper.ts  # 共享：思必得 sfw_cms API（4 高校）
│       ├── _html-helper.ts    # 共享：SSR HTML 抓取 + 关键词过滤
│       └── http.ts            # 共享：HTTP 抓取 + 日期工具（医院/商业）
├── data/                      # 运行时数据（gitignore）
│   ├── seen.json
│   └── run.log
└── README.md
```

## 注意事项

- `INGEST_TOKEN` 从 AIHOT 根目录 `.env` 读取（爬虫启动时自动加载），不需要在爬虫目录单独配置。
- `data/` 目录已 gitignore，不会提交。
- 不修改 AIHOT 的 `apps/`、`packages/`、`industry/`。
- 爬虫只存去重状态，所有业务数据进 AIHOT 的 PostgreSQL。
