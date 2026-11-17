from pydantic import BaseModel

from weft import __version__
from weft.settings import Settings


class HealthReport(BaseModel):
    status: str
    version: str


def health_report(settings: Settings) -> HealthReport:
    """Liveness only; database readiness checks come with the repositories.

    ``version`` is the git short SHA baked into the image (``APP_VERSION``), so a deployed
    environment can be checked against what was meant to be deployed; outside an image it
    is the package version.
    """
    return HealthReport(status="ok", version=settings.app_version or __version__)
