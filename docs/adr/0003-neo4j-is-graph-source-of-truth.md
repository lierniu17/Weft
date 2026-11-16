# 图谱以 Neo4j 为准，Postgres 存其余数据

图谱数据（人物、事实、关系、感受，以及 Graphiti 的 episode）只在 Neo4j 中维护，并以 Neo4j 为准；Postgres 存用户、邀请码、记录原文和草稿等非图谱数据。

## Considered Options

- 以 Postgres 为准，把每次确认后的变更集存进 Postgres，Neo4j 只作为可重放重建的投影。这样删除、迁移和审计更有保障，但会多维护一套变更集格式和重放逻辑。第一版不做。

## Consequences

- 没有变更集可重放，Graphiti 升级或建模调整只能做原地数据迁移，必须先备份 Neo4j。
- 删除人物或注销账户时，必须在 Neo4j 中按 `group_id` 和人物做级联删除，并有测试覆盖“删干净”。
- 记录（Postgres）与 episode（Neo4j）通过同一个 ID 关联，二者之间没有数据库层面的一致性保证，写入时要先写 Neo4j，成功后再把草稿标为已确认。
