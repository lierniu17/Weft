"""Test package. Imported before ``tests/conftest.py`` and anything from ``weft``."""

import os

# The environment before any import could load apps/api/.env (see tests/conftest.py).
PRE_IMPORT_ENV = frozenset(os.environ)
