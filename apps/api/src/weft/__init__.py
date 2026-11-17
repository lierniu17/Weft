"""Weft backend.

Importing this package forces Graphiti's anonymous telemetry off (ADR-0001). Graphiti
reads ``GRAPHITI_TELEMETRY_ENABLED`` from the environment, so it is set here, before
anything can import ``graphiti_core``; a deployment cannot turn it back on.
"""

import os

os.environ["GRAPHITI_TELEMETRY_ENABLED"] = "false"

__version__ = "0.1.0"
