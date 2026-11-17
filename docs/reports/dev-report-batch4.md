# 开发完成报告 · 批次 4（组合组件与业务组件）

- **feature 分支**：`feature/weft-mvp` · **提交**：`2d646ea` · **日期**：2026-11-16
- **结果**：类型检查、lint 通过；单元测试 55 个、story 测试 211 个全部通过（含每个 story 的 axe 无障碍检查）。Engineer 故意改坏 5 处关键行为，对应 story 都能报红。

## 交付

- **组合组件 9 个**：NavBar、TabBar、SideNav、ListItem、SectionHeader、FormRow、EmptyState、Card、Timeline。
- **业务组件 23 个**：ChatComposer、MessageBubble、DraftCard、DraftReviewSheet、PersonMatchItem、DraftFactItem、ConfidenceBadge、AnswerCard、CitationMark、CitationSheet、PathChain、PersonRow、PersonHeader、ProfileSection、RelationshipTypeTag、RelationStatusTag、FeelingRow、FactTimeline、RelationGraph（Cytoscape.js 整体使用）、GraphFilterSheet、EntryListItem、QuotaMeter、TaxonomyEditor。
- **数据约定**：草稿类型由 `apps/api/contracts/draft.schema.json` 自动生成，带新鲜度检查。

## 验收标准

| AC | 结果 | 证据（story） |
| --- | --- | --- |
| AC-9 / 10 / 12 / 17 / 18 | 通过 | EntryListItem 各状态；DraftReviewSheet 分区、需选择时确认禁用、放弃需二次确认；DraftCard 失败可重试 |
| AC-20 / 21 / 22 / 23 / 25 | 通过 | PersonRow；ProfileSection 空分区不隐藏、社会角色历史、评价与事实分开；CitationSheet |
| AC-28 | 部分 | 关系类型、状态、感受、时间线已有；认识时间 / 途径 / 介绍人 / 总结缺组件 → DESIGN.md 已新增 RelationshipOverview，放第 5 批 |
| AC-29 / 30 / 32 / 37 | 通过 | FactTimeline 排序与失效；FeelingRow 历史；自定义小类可选；回答的出处标记与抽屉 |
| AC-UI-2 / 3 / 5 / 8 | 通过 | 每个状态一个 story；空状态与骨架屏；可信度四档；长文本截断与 Tooltip |
| AC-UI-6 / 10（组件部分） | 通过 | 删除弹窗按钮等宽；草稿卡片状态原地更新（同一 DOM 节点） |

## 本轮对齐

- DESIGN.md：断联变体名改为 `estranged`、本人说改为 `self_told`（与接口一致）；禁用灰只用于禁用控件，需阅读的灰字一律用次要灰（禁用灰对比度不足 4.5:1）；确认草稿抽屉增加“画像变化”分区；新增业务组件 RelationshipOverview（共 24 个业务组件）。
- 修了基础组件里 `min-w-0` / `min-h-0` 不生效的隐患（Tailwind 默认值已清空）。

## 进行中 / 待办

- **进行中**：前后端数据约定对齐 —— 后端草稿 schema 补每条 `id`、`valid_to`、已匹配人物的显示名；后端发布回答与关系词表的 JSON Schema，前端改为从 schema 生成类型。
- **等 Docker**：第 1 批服务层与路由层。
- **之后**：第 2 批（需 DeepSeek / 千问 API key）、第 5 批（拼页面、RelationshipOverview、对接接口、BOT-1 至 BOT-13、还原度走查）。
- 已知小项：已匹配 / 新人物在草稿里不能改选（只有需选择的可以选）；确认后的人物 chip 需要第 5 批传入人物 id。
