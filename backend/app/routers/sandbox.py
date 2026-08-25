"""代码执行沙箱 API。"""
from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.models.sandbox import SandboxRunRequest, SandboxRunResponse, SandboxStatus
from app.services.sandbox_runner import SandboxConfigurationError, get_runner

# 云端防护(邀请码 403 / IP 限流 429 / sandbox.log 留痕)经 cloud_guards 单一接缝:
# 公开库(本地版)无云端模块时全部 no-op 放行, 云端设了 ACCESS_CODES 才激活。
from app.services.cloud_guards import check_access, check_rate_limit, client_ip, log_run


router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])


@router.post("/run")
async def run_code(req: SandboxRunRequest, request: Request) -> SandboxRunResponse:
    """执行学习者 Python 代码(Docker 沙箱, stdin 传代码)。"""
    check_access(request)
    check_rate_limit(request)
    if not settings.sandbox_enabled:
        raise HTTPException(503, "沙箱已被配置禁用 (sandbox_enabled=False)")
    runner = get_runner()
    if not runner.is_available(req.sandbox_profile):
        command = "pnpm build:sandbox:ml" if req.sandbox_profile == "ml" else "pnpm build:sandbox"
        raise HTTPException(503, f"{req.sandbox_profile} 沙箱镜像未就绪, 请先运行 {command}")
    try:
        resp = await runner.run(req, client_ip(request))
    except SandboxConfigurationError as exc:
        raise HTTPException(400, str(exc)) from exc
    log_run(request, req, resp)
    return resp


@router.get("/status")
async def sandbox_status() -> SandboxStatus:
    """沙箱状态(镜像是否就绪, 当前并发)。"""
    runner = get_runner()
    available = runner.is_available()
    return SandboxStatus(
        available=available,
        image=runner.image,
        concurrency=runner.concurrency,
        max_concurrency=runner.max_concurrency,
    )
