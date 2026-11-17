# 开发完成报告 · 批次 1（前半，不依赖数据库）与批次 3

- **feature 分支**：`feature/weft-mvp`（worktree：`worktree/feature-weft-mvp`）
- **提交**：`1e088c2` 后端骨架与领域规则 · `931ed31` 前端工作区与基础组件
- **日期**：2026-11-16
- **说明**：本机暂无 Docker（Windows 未开启虚拟机平台，需重启后重装 Docker Desktop），因此把不依赖数据库的工作提前并行完成。第 1 批需要真实 Neo4j / Postgres 的服务层与路由层测试尚未开始。

## 批次 1 前半：后端（apps/api）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| FastAPI 四层骨架、`/api/health`、设置、Graphiti 0.31.2 锁定且遥测强制关闭 | 完成 | `test_app.py` |
| docker-compose（postgres:16、neo4j:5.26）与 `.env.example` | 已编写，未运行 | — |
| 可信度排序与冲突规则（AC-14/15/16 逻辑部分） | 完成 | `test_confidence.py` |
| 带精度的日期、不可选未来、按记录精度截断（AC-7/8 逻辑部分） | 完成 | `test_dates.py` |
| 关系词表：5 大类、34 内置小类 + 各类“其他”、同义词归类、用户自定义小类（AC-31/32 逻辑部分） | 完成 | `test_taxonomy.py` |
| 租户 group_id、租户上下文与越权防护、强制注入 group_ids 的 Graphiti 包装（ADR-0001，AC-4/39 逻辑部分） | 完成 | `test_tenancy.py` |
| 北京时间额度日界与判定（AC-40 逻辑部分） | 完成 | `test_quota.py` |
| 草稿结构 + “有需选择项不能确认”校验 + JSON Schema 契约（AC-10/11/12 逻辑部分） | 完成 | `test_draft.py`，`contracts/draft.schema.json` |
| 大模型供应商抽象（DeepSeek / 千问）与录制回放（不访问网络） | 完成 | `test_llm.py` |
| 50 条中文抽取评测样例 + 评分脚本（AC-42 数据集） | 完成，未实跑 | `test_eval_extraction.py` |

**结果**：217 个单元测试通过；ruff、mypy --strict 无问题。

## 批次 3：前端基础组件（apps/web）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| pnpm 工作区；React 19 + Vite + Tailwind v4 + Storybook 10 + Vitest 浏览器测试 | 完成 | `pnpm test:web` |
| 从 DESIGN.md 生成 token，去掉 Tailwind 默认色板与间距 | 完成 | `design-tokens.test.ts`，`pnpm tokens:check` |
| 16 个基础组件，每个变体 / 尺寸 / 状态都有 story 与交互断言 | 完成 | 17 个 story 文件 |
| AC-7 组件部分（日期选择器三种精度、不可选未来） | 通过 | `DatePicker.stories.tsx` |
| AC-16 纯函数部分 | 通过 | `lib/confidence.test.ts` |
| AC-UI-4 基础组件 token（按钮 #4F46E5 / 6px、输入框、抽屉 16px、Chip 全圆角、正文 15/22） | 通过 | `DesignTokens.stories.tsx` |
| AC-UI-9 组件无障碍（每个 story 跑 axe、焦点陷阱、Esc、可读名称） | 通过 | 全部 story |

**结果**：类型检查、lint 通过；单元测试 23 个、story 测试 69 个全部通过。

## 本轮确定的约定

- 草稿每一条有稳定 `id`；关系带可信度；事实时间可带 `valid_to` 表示时间段（已写入 spec 的草稿结构一节）。
- DESIGN.md 补充：Chip 字号为 caption；Toast 与 Tooltip 同一深色表面。

## 还没做 / 待办

- **等 Docker**：第 1 批服务层与路由层（注册登录、录入 → 草稿 → 确认写入 Neo4j、幂等、别名、冲突、级联删除、注销、两账户交叉访问的租户隔离测试、额度计数、邀请码命令行）。
- **进行中**：第 4 批组合组件与业务组件（不依赖数据库，已开工）。
- **之后**：第 2 批（问答、图查询、质量评测，需要 DeepSeek 与千问的 API key）、第 5 批（拼页面与对接）。
- 主色按钮的 hover 色在浏览器测试里无法触发 `:hover`，留到还原度走查时人工确认。
