"""Business rules. No HTTP concepts (Request / Response / status codes) in this layer.

Tenant-scoped services take the tenant from ``require_tenant()`` (set from the login
session by the route layer), never from an argument.
"""
