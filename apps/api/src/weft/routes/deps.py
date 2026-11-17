"""Route plumbing: the infra, the logged-in session, and service-result -> status mapping."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, NoReturn

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from weft.domain.tenancy import TenantContext
from weft.infra import Infra
from weft.repositories.records import UserRecord
from weft.services import accounts
from weft.services.results import Err, Ok, Result
from weft.settings import Settings


class ApiError(Exception):
    def __init__(self, http_status: int, error: str, message: str, detail: dict[str, Any]) -> None:
        super().__init__(error)
        self.http_status = http_status
        self.error = error
        self.message = message
        self.detail = detail


def get_infra(request: Request) -> Infra:
    infra: Infra = request.app.state.infra
    return infra


InfraDep = Annotated[Infra, Depends(get_infra)]


@dataclass(frozen=True)
class Session:
    """The logged-in session; the only source of the tenant (ADR-0001)."""

    user: UserRecord
    token: str

    @property
    def tenant(self) -> TenantContext:
        return TenantContext.for_user(self.user.id)


async def require_session(request: Request, infra: InfraDep) -> Session:
    token = request.cookies.get(infra.settings.session_cookie_name)
    user = await accounts.resolve_session(infra, token) if token else None
    if user is None:
        raise ApiError(401, "unauthenticated", "请先登录", {})
    return Session(user=user, token=token or "")


SessionDep = Annotated[Session, Depends(require_session)]


def fail(err: Err, statuses: dict[str, int]) -> NoReturn:
    """Raise the HTTP error for a service ``Err``; unmapped reasons are server errors."""
    raise ApiError(statuses.get(err.reason, 500), err.reason, err.message, err.detail)


def unwrap[T](result: Result[T], statuses: dict[str, int]) -> T:
    if isinstance(result, Ok):
        return result.value
    fail(result, statuses)


def set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_max_age_days * 86400,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={"error": exc.error, "message": exc.message, **exc.detail},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {"loc": [str(p) for p in e.get("loc", ())], "msg": str(e.get("msg", ""))}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={"error": "validation_error", "message": "请求内容不正确", "fields": fields},
        )


__all__ = [
    "ApiError",
    "InfraDep",
    "Session",
    "SessionDep",
    "clear_session_cookie",
    "fail",
    "get_infra",
    "install_error_handlers",
    "require_session",
    "set_session_cookie",
    "unwrap",
]
