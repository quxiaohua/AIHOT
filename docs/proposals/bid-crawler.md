# 招标信息爬虫 — 落地方案

> 来源：会话 38444707979431426（需求已确认，研发小组当时被取消，代码未写）
> 状态：方案 v2，6 个决策点已确认，待确认 industry/ 改造细节后进入开发
> 日期：2026-09-30

## 1. 需求回顾（已确认）

| 项 | 内容 | 状态 |
|---|---|---|
| 监控对象 | 招标信息，关键词**扩展**（实验台、通风柜、实验室设备等，具体词表见 §4 config） | ✅ 已确认：扩展 |
| 用途 | 商务找商机、投标跟踪、竞对分析 | ✅ |
| 信源渠道 | 第三方聚合站（不抓官方分散站点） | ✅ |
| 已验证免费源 | 采招网（bidcenter，关键词页 zbkeyw-17349，按省分站）；千里马 wap 站 | ✅ 会话中实测，无需登录 |
| 数据去向 | **进入 AIHOT**（ingest 接口），不做独立推送 | ✅ 已确认：不用推送 |
| 抓取频率 | 每天 3 次，工作日 9:00 / 14:00 / 18:00 | ✅ |
| 定时方式 | **macOS launchd**（plist + StartCalendarInterval） | ✅ 本方案选定 |
| 地区范围 | **全国都抓**，江苏条目高亮标记 | ✅ 已确认：全国 |
| 招标类型 | **全部**：招标公告、中标结果、预告、变更 | ✅ 已确认：都要 |
| 代码位置 | AIHOT 仓库 `tools/bid-crawler/` | ✅ 已确认 |
| AIHOT 行业配置 | **需要改** `industry/` 为招标行业 | ✅ 已确认：要改（细节待用户提供，见 §7） |
| 开发约定 | 代码由"工作伙伴·软件研发小组"执行 | ✅ 用户全局规则 |

## 2. 落地方式：独立爬虫 + AIHOT ingest 接口

爬虫作为独立脚本放在 `tools/bid-crawler/`，定时抓取招标列表 → 解析 → 通过 AIHOT 已有的 `POST /api/ingest/items` 推送入库。AIHOT 自动完成模型筛选、评分、归组、网站展示、RSS、MCP 输出。

- AIHOT 核心代码（`apps/`、`packages/`）**零改动**
- 爬虫可独立测试和运行
- 复用 AIHOT 已有的模型写作流水线和多端出口
- 信源自动创建、按 url 自动去重
- 不做独立推送模块（用户确认数据进 AIHOT 即可）

## 3. 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│  macOS launchd                                               │
│  ~/Library/LaunchAgents/com.aihot.bid-crawler.plist          │
│  StartCalendarInterval: 工作日 9:00 / 14:00 / 18:00          │
└──────────────────────┬──────────────────────────────────────┘
                       │ 触发（跑完即退出，非常驻）
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  tools/bid-crawler/（独立 Node.js + TypeScript 脚本）          │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │ 采招网 fetcher │  │ 千里马 fetcher │  静态 HTML，fetch+cheerio │
│  └──────┬───────┘  └──────┬───────┘                          │
│         │                 │                                   │
│         ▼                 ▼                                   │
│  ┌─────────────────────────────┐                             │
│  │ parser：统一为 BidItem        │  标题/链接/日期/地区/类型      │
│  └──────────────┬──────────────┘                             │
│                 │                                             │
│                 ▼                                             │
│  ┌─────────────────────────────┐                             │
│  │ dedup：本地 json 去重（url）  │  避免重复推送                 │
│  └──────────────┬──────────────┘                             │
│                 │                                             │
│                 ▼                                             │
│  ┌─────────────────────────────┐                             │
│  │ region：地区识别 + 江苏高亮    │  raw 里打标记                 │
│  └──────────────┬──────────────┘                             │
│                 │                                             │
│                 ▼                                             │
│  ┌─────────────────────────────┐                             │
│  │ ingest：批量 POST 到 AIHOT    │  每批 ≤50 条                 │
│  └─────────────────────────────┘                             │
└──────────────────────┬──────────────────────────────────────┘
                       │ POST /api/ingest/items
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  AIHOT（apps/packages 零改动；industry/ 改为招标行业）          │
│  自动建信源 → 去重 → 模型预筛/评分/写作 → 归组 → 网站/RSS/MCP   │
└─────────────────────────────────────────────────────────────┘
```

### 技术选型理由

- **Node.js + TypeScript**：与 AIHOT 技术栈一致，共享 Node 24 运行时
- **fetch + cheerio**：两个源均为静态 HTML（已实测无需登录、无需 JS 渲染），不需要 Playwright/Puppeteer，最轻量
- **本地 JSON 去重**：爬虫侧先去重一次（减少无效请求），AIHOT ingest 侧按 url 再去重一次（双保险）
- **launchd 调度**：macOS 原生，支持工作日定点触发，跑完即退，无需常驻
- **爬虫不存业务数据**：只存去重状态文件；所有业务数据进 AIHOT 的 PostgreSQL

## 4. 模块划分

```
tools/bid-crawler/
├── package.json            # 独立依赖（cheerio 等），不污染 AIHOT 根
├── tsconfig.json
├── config.ts               # 关键词表、信源 URL、地区高亮配置
├── launchd/
│   └── com.aihot.bid-crawler.plist  # 定时任务配置
├── src/
│   ├── main.ts             # 入口：串联 fetch→parse→dedup→region→ingest
│   ├── types.ts            # BidItem 等类型定义
│   ├── fetchers/
│   │   ├── caizhao.ts      # 采招网列表抓取+解析
│   │   └── qianlima.ts     # 千里马 wap 列表抓取+解析
│   ├── dedup.ts            # 本地去重（json 文件，url 集合）
│   ├── region.ts           # 地区识别 + 江苏高亮标记
│   └── ingest.ts           # 批量 POST 到 AIHOT /api/ingest/items
├── data/
│   └── seen.json           # 去重状态（gitignore）
└── README.md               # 运行方式、配置说明、launchd 安装命令
```

### config.ts 关键词表（示例，开发时可调整）

```ts
export const KEYWORDS = [
  "实验台",
  "实验台通风柜",
  "实验室设备",
  "实验室家具",
  // 后续可扩展
];
```

### AIHOT ingest 接口契约（已核实）

- 端点：`POST http://127.0.0.1:3001/api/ingest/items`
- 鉴权：`.env` 中 `INGEST_TOKEN`（至少 16 位，不填则接口关闭；当前 `.env` 未配置，需新增）
- 请求体：
  ```json
  {
    "sourceId": "bid-caizhao",
    "sourceName": "采招网-招标监控",
    "items": [
      {
        "title": "XX医院实验台采购招标公告",
        "url": "https://...",
        "publishedAt": "2026-09-30T09:00:00+08:00",
        "author": "江苏",
        "raw": { "region": "江苏", "bidType": "招标公告", "highlight": true }
      }
    ]
  }
  ```
- 限制：每次最多 50 条（爬虫侧分批）；按 url 归一化后去重；未知 sourceId 自动创建为 `external` 类型信源（isolated 模式）
- 入库后自动进入 AIHOT 模型处理流水线

### launchd plist 示例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aihot.bid-crawler</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/tourse/.nvm/versions/node/v24.14.0/bin/node</string>
    <string>/Users/tourse/Documents/wxthird/AIHOT/tools/bid-crawler/dist/main.js</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer><key>Weekday</key><integer>1</integer></dict>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer><key>Weekday</key><integer>2</integer></dict>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer><key>Weekday</key><integer>3</integer></dict>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer><key>Weekday</key><integer>4</integer></dict>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer><key>Weekday</key><integer>5</integer></dict>
    <!-- 14:00、18:00 同理各 5 条，共 15 条 -->
  </array>
  <key>StandardOutPath</key>
  <string>/Users/tourse/Documents/wxthird/AIHOT/tools/bid-crawler/data/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/tourse/Documents/wxthird/AIHOT/tools/bid-crawler/data/launchd.err.log</string>
</dict>
</plist>
```

安装：`launchctl load ~/Library/LaunchAgents/com.aihot.bid-crawler.plist`

## 5. 改动范围

| 位置 | 改动 | 说明 |
|---|---|---|
| `tools/bid-crawler/` | **新增**整个目录 | 独立爬虫，约 10 个文件 + launchd plist |
| `.env` | 新增 `INGEST_TOKEN=<随机16位以上>` | 开启 ingest 接口 |
| `industry/` | **改造**为招标行业 | 站名、分类、主题、提示词、门槛等（细节见 §7，需用户提供） |
| AIHOT 核心 `apps/` `packages/` | **不改** | 遵守项目 AGENTS.md 约定 |
| `docs/proposals/bid-crawler.md` | 新增 | 本文档 |

## 6. 开发 WBS（粗粒度，确认后细化）

### P0 基线（端到端跑通）

1. 脚手架：`tools/bid-crawler/` 目录、package.json、tsconfig、.gitignore
2. 采招网 fetcher + parser：抓列表页，解析标题/链接/日期/地区/类型（支持多关键词）
3. 千里马 fetcher + parser：同上
4. 去重模块：本地 `data/seen.json`，启动时加载、结束时写入
5. region 模块：地区识别 + 江苏高亮
6. ingest 推送模块：批量 POST 到 AIHOT，每批 ≤50 条
7. 端到端手动验证：抓一次 → 解析 → 推送 → 查 AIHOT 数据库确认入库 → 网站可见

### P1 调度与行业配置

8. launchd plist：工作日 9/14/18 点，安装并验证触发
9. `industry/` 改造为招标行业（站名、分类、主题、提示词、门槛，见 §7）
10. 日志：每次运行记录抓取数、新增数、推送数、失败数到 `data/run.log`

### P2 增强

11. 关键词表可配置（config.ts 集中管理，新增关键词不改代码）
12. 错误重试：网络失败重试 3 次，指数退避
13. 健康检查：连续失败 N 次在日志告警
14. 招标类型过滤可配置（目前全要，后续可按需关）

## 7. industry/ 改造 — 需要你提供的信息

项目 AGENTS.md 明确要求：站名、信源、什么重要/什么是噪声、分类怎么分、条款内容——**这些要你本人决定，我不替你定**。改造 `industry/` 前需要你提供：

1. **站名**：网站叫什么？（比如"招标雷达""实验台招标监控"……你定）
2. **分类/标签**：招标信息怎么分类？按行业（医疗/教育/政府/企业）？按类型（招标公告/中标/预告/变更）？按地区？
3. **什么算重要**：哪些招标值得精选上首页？（比如金额阈值？采购单位类型？江苏的优先？）
4. **什么算噪声**：哪些要过滤掉？（比如废标公告？重复公告？非实验台相关？）
5. **提示词语气**：模型写摘要时用什么风格？（商务简洁？技术细节？）
6. **条款页**：`industry/pages/` 是模板，上线前需要你确认内容（目前本机试用可以先不管）

这些信息提供后，我按 `docs/customize.md` 的顺序改造 `industry/`，门槛（`selection.ts`）会用你标注的样本重新校准，不凭感觉改数字。

## 8. 风险与约束

- **反爬**：两个源目前无需登录，但高频抓取可能被封。每天 3 次、每次几个页面，频率极低，风险可控；不做并发抓取
- **HTML 结构变动**：聚合站改版会导致解析失败。parser 需写得健壮（选择器失败时告警而非崩溃），P2 加健康检查
- **去重粒度**：按 url 去重。同一招标在多个站重复出现时会作为不同信源各入一条，AIHOT 的事件归组会自动合并
- **模型配额**：推送进 AIHOT 后会触发模型调用（预筛+评分+写作）。当前 OpenRouter 免费档每日 50 次，招标条目多时可能不够；需关注配额或充值
- **INGEST_TOKEN 安全**：token 只在 `.env` 和爬虫配置里，不提交 git
- **industry/ 改造不影响爬虫**：爬虫和 industry/ 改造可并行，爬虫 P0 不依赖行业配置
