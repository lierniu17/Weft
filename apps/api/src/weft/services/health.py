from pydantic import BaseModel

from weft import __version__


class HealthReport(BaseModel):
    status: str
    version: str


def health_report() -> HealthReport:
    """Liveness only; database readiness checks come with the repositories."""
    return HealthReport(status="ok", version=__version__)
