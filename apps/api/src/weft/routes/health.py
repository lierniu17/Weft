from fastapi import APIRouter, Request

from weft.services.health import HealthReport, health_report
from weft.settings import Settings

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthReport)
def get_health(request: Request) -> HealthReport:
    settings: Settings = request.app.state.settings
    return health_report(settings)
