# TripAgent · AI 智能旅行规划 Agent

和 AI 对话，说出目的地、天数、预算与偏好，TripAgent 自动检索真实信息、生成多日行程、校验冲突并自动重规划，直至你满意。

## 功能特性

- **自然语言规划**：口语化输入 → 结构化 `TravelRequirement`（目的地 / 天数 / 预算 / 偏好 / 节奏）
- **Agent 工具调用**：景点检索、营业时间查询、交通衔接计算、预算估算 —— 数据全部来自 Provider，不凭空编造
- **10 项行程校验**：时间冲突、营业时间、交通衔接、预算、偏好匹配等，冲突自动触发重规划（≤3 次）
- **实时进度**：SSE 流式推送 Agent 状态 / 工具调用 / 行程生成过程
- **四视图呈现**：Timeline / Day Plan / Map（Leaflet + OSM 真实地图）/ Budget
- **行程管理**：保存、列表、详情、编辑（改活动 / 顺序 / 时间 → 增量重规划）、单活动编辑、手动校验、版本管理
- **认证**：注册 / 登录，JWT + Refresh Token

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 · TypeScript · Vite · Element Plus · Tailwind CSS · Leaflet |
| 后端 | NestJS · Prisma · PostgreSQL · Redis（可选） |
| AI | OpenAI 兼容接口（硅基流动 / DeepSeek / 智谱），`LLM_PROVIDER=mock` 可离线跑通 |
| 部署 | Docker Compose（后端 + 数据库）；前端静态构建可发布 IGA Pages |

## 架构

```
┌────────────────────────────┐     ┌──────────────────────────────┐
│  Frontend (Vue 3 SPA)       │     │  Backend (NestJS)            │
│  /chat  /trips  /trips/:id  │     │  ├ Agent Orchestrator        │
│  /trips/:id/edit  /login …  │────▶│  ├ Requirement Parser (LLM)  │
│  SSE 事件流 + REST /api/v1  │     │  ├ Planner ──▶ PlacesProvider│
└────────────────────────────┘     │  │  ├ Validator (10 项规则)   │
                                   │  │  ├ Replanner               │
                                   │  │  ├ Auth (JWT + Refresh)    │
                                   │  │  └ PostgreSQL (Prisma)     │
                                   └──────────────────────────────┘
```

数据来源均为可插拔 Provider：`LLM_PROVIDER`（mock ⇄ OpenAI 兼容）、`PLACES_PROVIDER`（内置离线目录 ⇄ 真实服务），随时切换。

## 快速启动

### 方式一：Docker Compose（推荐）

```bash
cp backend/.env.example backend/.env   # 按需填写 LLM_API_KEY；留空则用 mock
docker compose up --build
# 前端 http://localhost:8080 · 后端 http://localhost:3000/api/v1
```

### 方式二：本地开发

前置：Node.js ≥ 22、PostgreSQL、Redis（Redis 可禁用 `REDIS_ENABLED=false`）。

```bash
# 后端
cd backend
cp .env.example .env                    # 修改 DATABASE_URL 等
npm install
npx prisma migrate deploy
npm run start:dev                       # http://localhost:3000/api/v1

# 前端
cd ../frontend
npm install
npm run dev                             # http://localhost:5173（/api 代理到 3000）
```

## 环境变量

见各目录 `.env.example`。关键项：

- `LLM_PROVIDER`：`mock`（离线规则解析）或任意值走 OpenAI 兼容接口
- `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`：LLM 服务配置
- `PLACES_PROVIDER`：`mock`（内置 7 城离线目录：成都 / 北京 / 上海 / 东京 / 巴黎 / 曼谷 / 悉尼）
- `DATABASE_URL` / `REDIS_URL` / `REDIS_ENABLED`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`：生产必换强随机值
- 前端 `VITE_API_BASE`：留空为同源；IGA Pages 部署时填后端公网地址

## 部署

### Docker Compose 主路径

`docker-compose.yml` 已编排 postgres / redis / backend / frontend（nginx 托管 SPA 并反向代理 `/api`，已开启 SSE 长连接支持）。

### IGA Pages 演示路径（可选）

前端为纯静态 SPA，可独立发布：

```bash
cd frontend
VITE_API_BASE=https://your-backend.example.com npm run build   # dist/ 即为静态产物
```

## 目录结构

```
TripAgent/
├─ backend/                 # NestJS 后端
│  └─ src/
│     ├─ agent/             # Orchestrator + 需求解析 + SSE 事件
│     ├─ chat/              # /agent/plan /agent/replan 接口
│     ├─ conversations/     # 会话 CRUD
│     ├─ itineraries/       # 行程 CRUD / 单活动编辑 / 校验
│     ├─ planner/           # Planner + Validator + PlacesProvider
│     ├─ llm/               # LLM Provider（mock / OpenAI 兼容）
│     └─ auth/              # 注册登录 + JWT
├─ frontend/                # Vue 3 SPA
│  └─ src/
│     ├─ views/             # Home / Chat / Trips / TripDetail / TripEdit / Login / Register
│     ├─ components/plan/   # PlanTimeline / PlanMap / PlanBudget
│     └─ api/               # axios 封装 + token 刷新
└─ docs/TripAgent-设计文档.md
```

## 开发阶段

P0 工程骨架 → P1 对话 + 需求结构化 → P2 规划 + 验证 + 重规划 → P3 行程可视化 → P4 地图 + 编辑 + 反馈 → **P5 打磨 + 部署**。

详情见 [docs/TripAgent-设计文档.md](docs/TripAgent-设计文档.md)。
