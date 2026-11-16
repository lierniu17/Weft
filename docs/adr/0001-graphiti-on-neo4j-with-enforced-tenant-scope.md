# 图谱层用 Python + Graphiti + Neo4j，租户隔离由服务端强制

Weft 是多用户 SaaS，每个用户的图谱必须互相隔离。我们选择 Python 后端 + Graphiti（graphiti-core）+ Neo4j 来承载图谱，以复用 Graphiti 的抽取、实体消歧、时序边与混合检索能力；没有选 Postgres 单库（RLS 隔离更强，但图能力要全部自建），也没有沿用模板的 TypeScript + D1。

代价：Graphiti 在 Neo4j 上的 `group_id` 只是查询过滤条件，`search(group_ids=None)` 会跨租户检索，其自带的 MCP/REST 服务器也没有鉴权。因此：

- 每个用户对应一个 `group_id`，由服务端根据登录会话注入，任何调用 Graphiti 的代码路径都不得接受调用方传入的 `group_id`；
- 不允许大模型生成原始 Cypher，问答只能调用固定的、已注入租户范围的查询工具；
- 不部署 Graphiti 自带的 MCP/REST 服务器；
- 关闭 Graphiti 默认开启的匿名遥测。

## Consequences

- 开发流程模板里的 `backend-slice` 与 `tdd` 默认是 TypeScript + D1，需要换成 FastAPI 四层（models → repository → service → route）+ pytest，部署由 wrangler 改为 Docker Compose。
- Graphiti 的分步抽取函数（`extract_nodes` / `resolve_extracted_nodes` 等）不是稳定 API，升级版本时要回归测试草稿流程。
