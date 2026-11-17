from fastapi import APIRouter

from weft.services.health import HealthReport, health_report

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthReport)
def get_health() -> HealthReport:
    return health_report()
