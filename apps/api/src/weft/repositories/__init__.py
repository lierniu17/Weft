"""Repositories: the only code that talks to Postgres and Neo4j.

Rules every repository follows (ADR-0001, spec 「租户隔离」):

* A tenant-scoped repository is constructed bound to the session's ``TenantContext`` and
  every public method is decorated with ``@tenant_scoped``; no method accepts a tenant /
  user id / ``group_id`` argument.
* Every SQL query filters by ``user_id``; every Cypher query filters by ``group_id``
  (``GraphRepository`` refuses to run a query that does not).
* "Not found" (including "belongs to another user") is ``None``, never an exception.
* Repositories return domain records (``weft.repositories.records``), never ORM rows or
  Neo4j records.

Account-level repositories (users, invite codes, sessions) are unscoped: they run before
a tenant exists (register / login) or for the admin CLI.
"""
