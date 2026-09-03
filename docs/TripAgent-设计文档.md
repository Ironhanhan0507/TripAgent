# TripAgent — AI 智能旅行规划 Agent · 设计文档

> 版本：v0.1（设计阶段）｜状态：待确认
> 技术栈：Vue 3 / TypeScript / Vite / Pinia / Vue Router / Tailwind / Element Plus · NestJS / Prisma / PostgreSQL / Redis / SSE · LLM Tool Calling + Structured Output
> 页面风格参考：`http://8.163.59.196/`（Summer Checkin AI，现代 AI 产品落地页 + 工作台式界面）

***

## 0. 需求冲突与部署方案（先读）

**冲突**：需求同时指定「IGA Pages 部署」与「NestJS + PostgreSQL + Redis + Docker 全栈后端」。

**事实**：IGA Pages 只支持托管**静态前端框架**（Vue/Vite 等）+ **无状态 Serverless Functions**（文件路由 / Express / Koa），无法运行 NestJS 常驻服务、PostgreSQL、Redis、Docker。

**推荐方案 A：双轨部署（核心架构不变）**

- **后端**：完整 NestJS + Prisma + PostgreSQL + Redis + SSE，用 Docker Compose 部署在自有服务器 —— 保留全部核心能力（长连接 SSE、状态、数据库）。

- **前端**：Vue 3 SPA 静态构建，两种方式均可：

  - 生产主路径：Docker（nginx）随 Compose 一起部署；

  - IGA Pages 演示路径：`vite build` 后部署到 IGA Pages，API 基址指向后端公网地址（CORS 已放开、SSE 支持跨域）。

- 前端 `VITE_API_BASE` / `VITE_SSE_BASE` 通过环境变量切换，代码无需改动。

**方案 B（备选，不推荐为主）**：IGA Pages 全托管 —— 用 Pages Functions（Express 形态）替代 NestJS、Volcengine Supabase 替代 PostgreSQL、Redis 降级为内存。会偏离指定技术栈，且 Serverless 下 SSE 长连接与长时间 Agent 任务受限，仅作后期演示选项。

> **已确认采用方案 A**（2026-09-04）：后端 Docker Compose 部署 + 前端可发布 IGA Pages。
> 其余确认项：① 完整注册登录（非访客）；② 真实地图（Leaflet + OSM 瓦片，免费免 Key）；③ Mock 目的地支持多城市（≥5 个）。

***

## 1. 产品功能架构

```
交互层        AI 旅行对话 ｜ 行程可视化（Timeline / Day Plan / Map / Budget）｜ 行程编辑 ｜ 行程保存
   │
Agent 对话层  Main Agent Orchestrator ｜ Agent 状态事件流（SSE）｜ 需求澄清/补全
   │
规划引擎层    Requirement Parser → Planner → Validator → Replanner（循环，最多 3 次）
   │
工具层        search_places / get_place_detail / calculate_distance / calculate_route
              / check_opening_hours / estimate_cost / validate_itinerary / replan_itinerary / save_itinerary
   │
数据服务层    Places Provider ｜ Routing Provider ｜ Map Provider（均可插拔：Mock ⇄ 真实 API）｜ Budget Service
   │
数据存储层    PostgreSQL（持久化） ｜ Redis（SSE 事件、缓存、限流）
```

12 个核心产品模块与功能点：

| #  | 模块      | 功能点                                                       |
| -- | ------- | --------------------------------------------------------- |
| 1  | AI 旅行对话 | 多轮对话、SSE 流式、Agent 状态指示、建议 prompt、消息历史                     |
| 2  | 旅行需求结构化 | 自然语言 → 结构化 JSON，缺省字段补全，信息不足时交互式澄清                         |
| 3  | AI 行程规划 | 按日生成行程（Day + Activity 序列），全部基于 Tool 返回的真实数据               |
| 4  | 景点搜索    | `search_places`（关键词/城市/分类）、`get_place_detail`（营业时间/费用/位置） |
| 5  | 时间冲突检测  | 活动时间重叠、营业时间覆盖、交通时间衔接校验                                    |
| 6  | 路线与距离   | `calculate_route`（起终点、交通方式、耗时）、`calculate_distance`       |
| 7  | 预算估算    | `estimate_cost` 按日/分类估算（门票/餐饮/交通/住宿/购物），对比用户总预算           |
| 8  | 行程验证    | Validator 执行 10 项校验，输出 `ValidationIssue[]`                |
| 9  | 自动重新规划  | Plan → Validate → Replan，最多 3 次，超限回馈用户而非无限循环              |
| 10 | 行程可视化   | Timeline / Day Plan / Map / Budget 四种视图，可切换               |
| 11 | 用户修改反馈  | 编辑活动、调整顺序/时间、修改预算 → 触发增量重新规划                              |
| 12 | 行程保存    | 保存 / 列表 / 详情 / 编辑 / 删除，历史行程可再次打开对话                        |

***

## 2. 系统架构

```
┌─────────────────────────────┐      ┌──────────────────────────────────────────────┐
│  前端 Vue 3 SPA (Vite)       │      │  后端 NestJS                                  │
│  ├─ Pinia / Vue Router       │      │  ├─ Auth / Users                             │
│  ├─ Tailwind + Element Plus  │ HTTP │  ├─ Conversations / Chat (SSE)               │
│  ├─ Chat 左 + Plan 右        │ +SSE │  ├─ Agent Orchestrator + Pipeline            │
│  ├─ Timeline/DayPlan/Map/…   │◄────►│  ├─ Tools（9 个）/ Schemas / Events          │
│  └─ IGA Pages / nginx 部署   │      │  ├─ Places / Routing / Budget                │
└─────────────────────────────┘      │  └─ Itineraries / Validation                 │
                                      └───────┬────────────────────────┬────────────┘
                                              │ Prisma                  │ ioredis
                                      ┌───────▼────────┐        ┌──────▼───────┐
                                      │  PostgreSQL    │        │    Redis     │
                                      │  User/行程/…   │        │ SSE pub/sub  │
                                      │  持久化        │        │ 会话/缓存     │
                                      └────────────────┘        └──────────────┘
                                      ┌────────────────────────────────────────────┐
                                      │  外部 Provider（可插拔，面向接口）           │
                                      │  Places API / Routing API / Map API        │
                                      │  MockProvider ───────► 真实 API 无缝替换    │
                                      └────────────────────────────────────────────┘
                                      ┌────────────────────────────────────────────┐
                                      │  LLM API：Tool Calling + Structured Output  │
                                      └────────────────────────────────────────────┘
```

关键决策：

- **前后端严格分离**，通信仅走 REST + SSE；前端不直连数据库。

- **SSE 事件**：`POST /agent/plan` 发起，响应为 `text/event-stream`；MVP 单实例用 Node 内部 `EventEmitter`，多实例可切换为 Redis pub/sub（接口已抽象）。

- **Provider 抽象**：`IPlacesProvider` / `IRoutingProvider` / `IMapProvider` 三个接口，Mock 与真实实现可整体替换；Agent 与业务层只依赖接口。

- **真实地图**：前端用 Leaflet + OpenStreetMap 瓦片（免费、无需 API Key）渲染真实地图与景点标记；`IMapProvider` 仍保留，未来可切换高德/Google。景点/路线**数据**仍来自 `PlacesProvider` / `RoutingProvider`（Mock 或真实），与地图渲染解耦。

- **AI 输出约束**：所有 LLM 输出使用 Structured Output（JSON Schema 强约束），禁止自由文本解析。

- **错误统一处理**：全局 `HttpExceptionFilter` + 统一错误码 + 结构化响应；Agent 内部错误降级为可见事件推送。

- **日志**：关键操作（工具调用、规划、验证、重规划、保存）写结构化日志（console + 可选文件/DB）。

***

## 3. Agent 架构

采用 **单一 Main Agent Orchestrator**，Parser / Planner / Validator / Replanner 作为\*\*逻辑模块（Service）\*\*而非独立 Agent —— 避免为体现 Agent 而无意义拆分。

```
用户输入（如"国庆和朋友去东京5天，预算5000…"）
   │
   ▼
┌────────────────────────── Main Agent Orchestrator ──────────────────────────┐
│  意图识别：是否需要新需求？→ 需要则交 Requirement Parser                     │
│  需求不完整（缺日期/目的地/预算）→ 向用户澄清（多轮对话，不阻塞工具执行）      │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   ▼
                 Requirement Parser（Structured Output）
                    TravelRequirement（结构化约束）
                                   ▼
                 Planner ── 按需调用 Tools ──►
                   search_places / get_place_detail
                   calculate_distance / calculate_route
                   check_opening_hours / estimate_cost
                                   ▼
                          Itinerary（草稿）
                                   ▼
                 Validator（10 项规则）
                    ├─ 通过 ────────────► 展示 + save_itinerary + 等待用户反馈
                    │
                    └─ 有问题
                        ├─ attempts < 3 ──► Replanner（携带 issues 反馈重新生成）──► Planner
                        └─ attempts ≥ 3 ──► 把问题清单反馈给用户，请用户调整（不再循环）
```

**Agent 状态机**（前端展示用，经 SSE 推送）：

```
idle → parsing → searching → routing → costing → planning
     → validating → (replanning ⇄ planning) → done
     → needs_input（需用户澄清）
```

**Main Agent 工具调用决策规则**（由 LLM 依据 Tool 描述自主选择）：

| 场景         | 触发工具                                             |
| ---------- | ------------------------------------------------ |
| 需要景点/目的地信息 | `search_places` → `get_place_detail`             |
| 需要两景点间交通   | `calculate_route` / `calculate_distance`         |
| 需要确认营业时间   | `check_opening_hours`                            |
| 需要费用评估     | `estimate_cost`                                  |
| 行程生成后      | 自动执行 `validate_itinerary`，失败则 `replan_itinerary` |
| 用户确认       | `save_itinerary`                                 |

**事件模型**（前端"过程状态"数据来源，不暴露 CoT）：

```
AgentEvent =
  | { type: 'status',        state: AgentState }
  | { type: 'tool_call',     tool: string, message: string }   // "正在搜索东京热门景点…"
  | { type: 'tool_result',   tool: string, summary: string }
  | { type: 'message',       content: string }                 // Agent 的对话回复
  | { type: 'requirement',   requirement: TravelRequirement }
  | { type: 'plan',          itinerary: Itinerary }
  | { type: 'validation',    issues: ValidationIssue[], attempt: number, maxAttempts: number }
  | { type: 'done',          itinerary: Itinerary | null }
  | { type: 'error',         message: string, code: string }
```

***

## 4. 前端页面结构

### 4.1 路由

| 路由                | 页面      | 说明             |
| ----------------- | ------- | -------------- |
| `/`               | 首页      | 落地页（仿参考站风格）    |
| `/login`          | 登录      | 邮箱 + 密码        |
| `/register`       | 注册      | 邮箱 + 密码 + 昵称   |
| `/chat`           | AI 旅行助手 | 左对话 + 右计划，左右布局 |
| `/trips`          | 我的旅行    | 已保存行程列表        |
| `/trips/:id`      | 行程详情    | 概览 + 四视图       |
| `/trips/:id/edit` | 编辑行程    | 时间线编辑、增删改活动    |

> 路由守卫：`/chat`、`/trips*` 需登录，未登录跳 `/login`。

### 4.2 首页（参考站 Landing 风格）

```
Navbar（Logo TripAgent｜我的旅行｜开始规划）
Hero：大标题 "告诉我你想去哪里，我帮你规划一次旅行。"
      + 输入框（输入目的地/日期，回车直达 /chat）+ CTA 按钮
How it works（三步）：说出需求 → AI 检索+规划 → 验证并保存
能力展示区：Agent 工具卡片（景点搜索/路线计算/预算估算/冲突检测/自动重规划）
Agent 过程演示 mockup：仿参考站 AI 伙伴窗口，展示 tool 状态流
视图预览区：Timeline / Day Plan / Map / Budget 四张卡片预览
Footer
```

### 4.3 Chat 页（核心，左右布局）

```
┌──────────────────────────────┬──────────────────────────────────────┐
│ 左侧：AI 对话                 │ 右侧：当前旅行计划                    │
│  ├ Agent 状态指示器           │  ├ 顶部：Agent 工作状态条            │
│  │  （搜索中/规划中/冲突重规划）│  │    "正在计算景点之间的交通时间…"   │
│  ├ 消息列表（气泡）           │  ├ 计划头：目的地/日期/天数/预算      │
│  ├ 建议 chips（"帮我规划东京5天"）│  ├ Tab：Timeline｜Day Plan｜Map｜Budget│
│  ├ 输入框 + 发送              │  ├ 对应视图组件                      │
│  └ 保存行程按钮               │  └ 重新规划 / 编辑 按钮              │
└──────────────────────────────┴──────────────────────────────────────┘
```

### 4.4 视图组件

- **Timeline**：纵向时间轴，按日分组，活动卡片（时间、地点、时长、费用、交通衔接）。

- **Day Plan**：每日卡片 + 时段网格（上午/下午/晚上），含营业时间与交通提示。

- **Map**：真实地图 —— Leaflet + OSM 瓦片渲染，按日/全部标记景点、活动连线、当前行程路线；无网络时降级为标记列表。数据仍来自 `PlacesProvider` / `RoutingProvider`（Mock ⇄ 真实可切换）。

- **Budget**：总预算对比 + 分类预算条（门票/餐饮/交通/住宿/购物）+ 每日预算柱状图。

### 4.5 组件树（关键）

```
components/
├─ layout/AppHeader.vue  ChatLayout.vue
├─ chat/  ChatMessageList.vue  ChatMessageItem.vue  ChatInput.vue
│         AgentStatusBar.vue  SuggestionChips.vue
├─ plan/  PlanPanel.vue  PlanTabs.vue  PlanTimeline.vue  PlanDay.vue
│         PlanActivityCard.vue  PlanMap.vue  PlanBudget.vue
├─ agent/ useAgentStream.ts（SSE hook） AgentToolBadge.vue
└─ ui/    通用组件（Badge / Card / Empty / Loading…）
```

***

## 5. 后端模块结构（NestJS）

```
backend/src/
├─ main.ts                 # bootstrap：CORS、全局管道/过滤器、SSE 配置
├─ app.module.ts
├─ common/                 # 全局 logger / HttpExceptionFilter / 响应拦截器 / 错误码
├─ config/                 # 环境配置（TypeScript 类型化，含 Provider 开关）
├─ database/               # PrismaService
├─ auth/                   # 认证：注册/登录/刷新（邮箱+密码，bcrypt + JWT，Refresh Token）
├─ users/                  # 用户信息
├─ conversations/          # 对话会话 CRUD
├─ chat/                   # SSE 流式入口：POST /agent/plan（EventSource 兼容）
├─ agent/
│  ├─ orchestrator.service.ts      # Main Agent
│  ├─ pipeline/                    # parser / planner / validator / replanner（Service）
│  ├─ tools/                       # 9 个 Tool：schema + executor
│  ├─ schemas/                     # Structured Output JSON Schema
│  ├─ events/                      # AgentEvent 类型 + 事件总线（EventEmitter 抽象）
│  └─ agent.constants.ts           # 状态机、最大重规划次数
├─ places/                 # 景点：controller/service + providers/（mock · real）
├─ routing/                # 路线/距离 + providers/
├─ budget/                 # 预算估算（本地规则引擎，非 LLM）
├─ validation/             # 10 项校验规则实现
└─ itineraries/            # 行程 CRUD + days + activities
```

模块依赖方向：`chat` → `agent` → `{places, routing, budget, validation}` → `itineraries` → `database`。

***

## 6. 数据库 ER 设计

```
User 1───N Conversation 1───N Message
  │
  │ 1
  └───N Itinerary 1───1 Requirement
                │ 1
                └───N DayPlan 1───N Activity
                              │
                              └───N── Place（景点目录，N:M 可复用）
  Itinerary 1───N ValidationLog（校验/重规划审计）
  AgentEventLog（操作日志，可独立表）
```

| 表               | 关键字段                                                                                                                             | 说明                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `User`          | id, email(unique), passwordHash, name, avatar, createdAt                                                                         | 邮箱+密码注册登录                 |
| `Conversation`  | id, userId, title, status, createdAt                                                                                             | 一次规划对话                    |
| `Message`       | id, conversationId, role, type, content, meta(JSONB), createdAt                                                                  | role: user/assistant/tool |
| `Itinerary`     | id, userId, conversationId, title, destination, startDate, endDate, totalBudget, currency, status, version, itineraryData(JSONB) | 主数据冗余在 JSONB，便于快速渲染       |
| `Requirement`   | id, itineraryId, requirement(JSONB)                                                                                              | 结构化需求快照                   |
| `DayPlan`       | id, itineraryId, dayIndex, date, title, note                                                                                     | <br />                    |
| `Activity`      | id, dayPlanId, placeId, name, startTime, endTime, durationMin, cost, transportNote, orderIndex, note                             | <br />                    |
| `Place`         | id, name, city, category, address, lat, lng, rating, priceLevel, openingHours(JSONB), tags(JSONB), externalId                    | 景点目录                      |
| `ValidationLog` | id, itineraryId, attempt, passed, issues(JSONB), createdAt                                                                       | 审计                        |
| `AgentEventLog` | id, conversationId, type, payload(JSONB), createdAt                                                                              | 操作日志                      |

说明：MVP 用 JSONB 存行程结构（`itineraryData`）换取快速迭代；后续可反规范化成明细表。`Place` 独立成目录，多个行程可复用同一景点数据，避免重复检索。

***

## 7. API 设计

统一前缀 `/api/v1`，全部 JSON；错误统一 `{ code, message, details? }`。

### 7.1 认证 / 用户

| Method | Path             | 说明                                                                     |
| ------ | ---------------- | ---------------------------------------------------------------------- |
| POST   | `/auth/register` | 注册：`{ email, password, name }` → `{ accessToken, refreshToken, user }` |
| POST   | `/auth/login`    | 登录：`{ email, password }` → `{ accessToken, refreshToken, user }`       |
| POST   | `/auth/refresh`  | 刷新 token：`{ refreshToken }`                                            |
| POST   | `/auth/logout`   | 注销（吊销 refresh token）                                                   |
| GET    | `/auth/me`       | 当前用户信息（需登录）                                                            |

### 7.2 对话

| Method | Path                          | 说明                |
| ------ | ----------------------------- | ----------------- |
| POST   | `/conversations`              | 创建会话              |
| GET    | `/conversations`              | 会话列表              |
| GET    | `/conversations/:id`          | 会话详情（含消息）         |
| POST   | `/conversations/:id/messages` | 发送普通消息（非 Agent 流） |

### 7.3 Agent（核心，SSE）

| Method | Path            | 说明                                                                                      |
| ------ | --------------- | --------------------------------------------------------------------------------------- |
| POST   | `/agent/plan`   | body `{ conversationId, message? }`，返回 `text/event-stream`，推送 `AgentEvent[]`，结束推 `done` |
| POST   | `/agent/replan` | body `{ itineraryId, feedback? }`，触发重规划，同样 SSE                                          |

### 7.4 行程

| Method | Path                                                  | 说明                      |
| ------ | ----------------------------------------------------- | ----------------------- |
| POST   | `/itineraries`                                        | 保存行程（含 days/activities） |
| GET    | `/itineraries`                                        | 我的行程列表                  |
| GET    | `/itineraries/:id`                                    | 行程详情                    |
| PUT    | `/itineraries/:id`                                    | 整体更新                    |
| DELETE | `/itineraries/:id`                                    | 删除                      |
| PUT    | `/itineraries/:id/days/:dayId/activities/:activityId` | 编辑单个活动（改时间/顺序/费用）       |
| POST   | `/itineraries/:id/validate`                           | 手动触发校验（返回 issues）       |

### 7.5 数据服务（可被 Agent 内部调用，也暴露 REST 便于调试）

| Method | Path                                       | 说明                                        |
| ------ | ------------------------------------------ | ----------------------------------------- |
| GET    | `/places/search?q=&city=&category=&limit=` | 搜索景点                                      |
| GET    | `/places/:id`                              | 景点详情                                      |
| POST   | `/routes/calculate`                        | `{ from:{lat,lng}, to, mode }` → 距离+耗时    |
| POST   | `/budget/estimate`                         | `{ days, travelers, preferences }` → 分类预算 |

***

## 8. Agent Tool Schema

### 8.1 Structured Output Schema（LLM 输出强约束）

**TravelRequirement**

```jsonc
{
  "type": "object",
  "required": ["destination", "startDate", "endDate", "travelers", "budget", "currency",
               "preferences", "avoidPreferences", "travelPace", "transportationPreference"],
  "properties": {
    "destination": { "type": "string", "description": "目的地城市/区域" },
    "startDate":   { "type": "string", "format": "date" },
    "endDate":     { "type": "string", "format": "date" },
    "travelers":   { "type": "integer", "minimum": 1 },
    "budget":      { "type": "number", "minimum": 0 },
    "currency":    { "type": "string", "default": "CNY" },
    "preferences":        { "type": "array", "items": { "type": "string" },
                            "description": "喜欢：动漫/美食/拍照…" },
    "avoidPreferences":   { "type": "array", "items": { "type": "string" },
                            "description": "排斥/不喜欢" },
    "travelPace":         { "type": "string", "enum": ["relaxed", "balanced", "intensive"] },
    "transportationPreference": { "type": "string",
                            "enum": ["public", "walking", "taxi", "car", "mixed"] }
  }
}
```

**Itinerary**（Planner 输出）

```jsonc
{
  "type": "object",
  "required": ["destination", "days", "notes"],
  "properties": {
    "destination": { "type": "string" },
    "days": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["dayIndex", "date", "activities"],
        "properties": {
          "dayIndex":   { "type": "integer" },
          "date":       { "type": "string", "format": "date" },
          "title":      { "type": "string" },
          "activities": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name", "placeId", "startTime", "endTime", "durationMin", "cost", "category"],
              "properties": {
                "name":          { "type": "string" },
                "placeId":       { "type": "string", "description": "来自 search_places 的真实 placeId" },
                "startTime":     { "type": "string", "pattern": "^\\d{2}:\\d{2}$" },
                "endTime":       { "type": "string", "pattern": "^\\d{2}:\\d{2}$" },
                "durationMin":   { "type": "integer", "minimum": 0 },
                "cost":          { "type": "number", "minimum": 0 },
                "category":      { "type": "string", "enum": ["sightseeing", "dining", "shopping", "transport", "hotel", "other"] },
                "transportNote": { "type": "string", "description": "衔接上一活动的交通说明（来自 calculate_route）" }
              }
            }
          }
        }
      }
    },
    "notes": { "type": "array", "items": { "type": "string" } }
  }
}
```

**ValidationResult**

```jsonc
{
  "type": "object",
  "required": ["passed", "issues"],
  "properties": {
    "passed": { "type": "boolean" },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["code", "severity", "message", "location"],
        "properties": {
          "code":     { "type": "string", "enum": [
            "TIME_CONFLICT", "OUTSIDE_OPENING_HOURS", "UNREASONABLE_TRANSIT",
            "TOO_MANY_ACTIVITIES", "DAY_TOO_LONG", "DAY_BUDGET_OVER",
            "TOTAL_BUDGET_OVER", "DETOUR_ROUTE", "MISMATCH_PREFERENCE", "AVOIDED_ACTIVITY"] },
          "severity": { "type": "string", "enum": ["error", "warning"] },
          "message":  { "type": "string" },
          "location": { "type": "string", "description": "如 Day2/Activity3" }
        }
      }
    }
  }
}
```

### 8.2 Tool 输入/输出 Schema

| Tool                  | 输入（简化）                                       | 输出                                                           |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `search_places`       | `{ query, city, category?, limit? }`         | `{ places: PlaceSummary[] }`（来自 Provider，真实数据）               |
| `get_place_detail`    | `{ placeId }`                                | `{ place: PlaceDetail }`（含 openingHours, cost, geo, address） |
| `calculate_distance`  | `{ from: {lat,lng}, to: {lat,lng}, mode? }`  | `{ distanceKm, durationMin }`                                |
| `calculate_route`     | `{ from, to, mode?, departureTime? }`        | `{ steps[], durationMin, distanceKm }`                       |
| `check_opening_hours` | `{ placeId, date }`                          | `{ open, close, isOpenOnDate, note }`                        |
| `estimate_cost`       | `{ days, travelers, preferences, currency }` | `{ perDay: { category, amount }[], total, currency }`        |
| `validate_itinerary`  | `{ itinerary }`                              | `ValidationResult`                                           |
| `replan_itinerary`    | `{ itinerary, issues[] }`                    | `{ itinerary }`（修正后的行程）                                      |
| `save_itinerary`      | `{ itinerary, requirement, title? }`         | `{ itineraryId }`                                            |

> 原则：Agent 不得凭空编造实时景点信息 —— `search_places / get_place_detail / calculate_route / check_opening_hours` 的结果**必须**来自 Provider（Mock 或真实），LLM 只能从中选择与编排。所有 Tool 的 executor 都在代码中实现，LLM 只负责"决定调用 + 填参数"。

***

## 9. 核心数据结构（TypeScript）

```ts
// ===== 需求 =====
interface TravelRequirement {
  destination: string;
  startDate: string;                 // YYYY-MM-DD
  endDate: string;
  travelers: number;
  budget: number;
  currency: string;
  preferences: string[];             // ["动漫","美食","拍照"]
  avoidPreferences: string[];        // ["太累"]
  travelPace: 'relaxed' | 'balanced' | 'intensive';
  transportationPreference: 'public' | 'walking' | 'taxi' | 'car' | 'mixed';
}

// ===== 景点（Provider 返回，真实数据） =====
interface PlaceSummary {
  placeId: string; name: string; city: string;
  category: string; rating: number; priceLevel: number;
  tags: string[]; lat: number; lng: number; address: string;
}
interface PlaceDetail extends PlaceSummary {
  openingHours: { open: string; close: string; closedDays: number[] } | null;
  ticketPrice: number | null; description: string;
}

// ===== 行程 =====
interface Activity {
  id: string; name: string; placeId: string;
  startTime: string; endTime: string;          // "HH:mm"
  durationMin: number; cost: number;
  category: 'sightseeing' | 'dining' | 'shopping' | 'transport' | 'hotel' | 'other';
  transportNote?: string; orderIndex: number; note?: string;
}
interface DayPlan { dayIndex: number; date: string; title?: string; activities: Activity[]; }
interface Itinerary {
  id?: string; destination: string; startDate: string; endDate: string;
  days: DayPlan[]; notes: string[];
  totalBudget?: number; currency?: string;
  status: 'draft' | 'confirmed' | 'saved';
}

// ===== 验证 =====
interface ValidationIssue {
  code: 'TIME_CONFLICT' | 'OUTSIDE_OPENING_HOURS' | 'UNREASONABLE_TRANSIT'
      | 'TOO_MANY_ACTIVITIES' | 'DAY_TOO_LONG' | 'DAY_BUDGET_OVER'
      | 'TOTAL_BUDGET_OVER' | 'DETOUR_ROUTE' | 'MISMATCH_PREFERENCE' | 'AVOIDED_ACTIVITY';
  severity: 'error' | 'warning';
  message: string; location: string;
}
interface ValidationResult { passed: boolean; issues: ValidationIssue[]; }

// ===== Agent 事件（SSE） =====
type AgentState =
  'idle'|'parsing'|'searching'|'routing'|'costing'|'planning'
  |'validating'|'replanning'|'done'|'needs_input';
type AgentEvent =
  | { type: 'status'; state: AgentState }
  | { type: 'tool_call'; tool: string; message: string }
  | { type: 'tool_result'; tool: string; summary: string }
  | { type: 'message'; content: string }
  | { type: 'requirement'; requirement: TravelRequirement }
  | { type: 'plan'; itinerary: Itinerary }
  | { type: 'validation'; issues: ValidationIssue[]; attempt: number; maxAttempts: number }
  | { type: 'done'; itinerary: Itinerary | null }
  | { type: 'error'; message: string; code: string };

// ===== 消息 =====
interface ChatMessage {
  id: string; conversationId: string; role: 'user'|'assistant'|'system';
  type: 'text'|'tool'|'plan';
  content: string; meta?: Record<string, unknown>; createdAt: string;
}
```

***

## 10. 项目目录结构（Monorepo）

```
tripagent/
├─ docs/
│  └─ TripAgent-设计文档.md
├─ frontend/                          # Vue 3 + Vite + TS
│  ├─ index.html
│  ├─ vite.config.ts                  # proxy /api → backend
│  ├─ tailwind.config.ts  postcss.config.js
│  ├─ .env.example                    # VITE_API_BASE / VITE_SSE_BASE
│  ├─ src/
│  │  ├─ main.ts  App.vue
│  │  ├─ router/index.ts
│  │  ├─ stores/                      # Pinia: useAuth / useChat / useItinerary
│  │  ├─ api/                         # http client + typed API 封装
│  │  ├─ agent/useAgentStream.ts      # SSE hook（EventSource/ fetch-stream）
│  │  ├─ components/{layout,chat,plan,agent,ui}
│  │  ├─ views/{Home,Login,Register,Chat,Trips,TripDetail,TripEdit}.vue
│  │  ├─ types/index.ts               # 与后端共享类型
│  │  └─ styles/
│  └─ package.json                    # 依赖含 leaflet + @vue-leaflet/vue-leaflet
├─ backend/                           # NestJS + Prisma + TS
│  ├─ .env.example                    # DATABASE_URL / REDIS_URL / LLM_* / PROVIDER_MODE
│  ├─ prisma/schema.prisma  seed.ts
│  ├─ src/                            # 见第 5 节
│  ├─ test/
│  └─ package.json  nest-cli.json  tsconfig.json
├─ docker-compose.yml                 # postgres + redis + backend + frontend(nginx)
├─ Dockerfile.backend  Dockerfile.frontend  nginx.conf
├─ .gitignore  .prettierrc  .eslintrc
└─ README.md
```

> `frontend/src/types` 与 `backend` 共享类型：MVP 以手写副本 + 注释约束，后续可引入 `@types` 共享包或 OpenAPI 生成。

***

## 11. MVP 开发阶段划分

| 阶段                   | 内容                                                                                                                     | 产出/验收                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **P0 工程骨架**          | Monorepo 脚手架、Docker Compose（postgres/redis）、前后端可运行、ESLint/Prettier、全局错误处理与日志、**认证模块（注册/登录/JWT + /login /register 页面）** | 前后端本地起服，可注册登录，`/api/v1/health` 正常           |
| **P1 对话 + 需求结构化**    | 会话 CRUD、Chat 页面（左对话）、Agent Orchestrator 骨架、Requirement Parser（Structured Output）、澄清流程                                  | 输入自然语言 → 得到结构化 `TravelRequirement`          |
| **P2 规划 + 验证 + 重规划** | Planner、9 个 Tool（Mock Provider）、Validator（10 项）、Replanner（≤3 次）、SSE 事件流                                                | `/agent/plan` 全流程跑通，冲突可自动重规划                |
| **P3 行程可视化**         | 右侧 Plan 面板：Timeline / Day Plan / Budget 三视图、Agent 状态条、保存行程                                                             | Chat 页左右联调完整，行程可保存到 `/trips`                |
| **P4 地图 + 编辑 + 反馈**  | **真实地图（Leaflet + OSM）**、行程详情页、编辑页（改活动/顺序/时间→增量重规划）、`/trips` 列表                                                         | 7 个页面全部可用，用户可修改并触发重规划                       |
| **P5 打磨 + 部署**       | UI 打磨（参考站风格对齐）、Mock⇄真实 Provider 切换、多城市 Mock 数据补全、nginx/IGA Pages 部署、README                                             | 部署上线（Docker Compose 主路径 + IGA Pages 演示路径可选） |

> 每阶段结束均可运行验收；P1–P5 顺序保证任意阶段系统完整可运行（数据来源均为 Mock Provider，随时可切真实 API）。

***

## 已确认决策（2026-09-04）

1. **部署**：方案 A 双轨 —— 后端 NestJS+PostgreSQL+Redis 用 Docker Compose 部署；前端静态构建可发布 IGA Pages（`VITE_API_BASE` 切换）。
2. **登录**：完整注册登录（邮箱+密码，bcrypt + JWT + Refresh Token），含 `/login`、`/register` 页面与路由守卫。
3. **地图**：真实地图 Leaflet + OSM 瓦片；`IMapProvider` 抽象保留，景点/路线数据与渲染解耦。
4. **Mock 数据**：多城市支持，内置 ≥5 个城市（东京/上海/巴黎/曼谷/悉尼等），每城含景点/营业时间/费用/坐标。
5. 确认后按 **P0 → P5** 逐阶段实现。

