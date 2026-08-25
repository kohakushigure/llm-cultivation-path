"""云端能力单一接缝。

云端专属模块(access_guard / llm_proxy 及其 router)在公开库(本地版)中被
sync 剔除。本模块是全仓唯一感知"云端模块可能不存在"的地方:
- 私有库/云端: 挂真实现
- 公开库/本地: 挂 no-op adapter(全部放行 / 额度关闭)

调用方只 import 本模块, 不再各自写 try/ImportError 桩。
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import Request
    from fastapi.routing import APIRouter

    from app.models.sandbox import SandboxRunRequest, SandboxRunResponse

try:
    from app.services import access_guard as _access_guard
except ImportError:
    _access_guard = None

try:
    from app.services import llm_proxy as _llm_proxy
except ImportError:
    _llm_proxy = None


# === 访问防护(邀请码 / 限流 / 留痕) ===


def check_access(request: Request) -> None:
    """邀请码校验; 无云端模块时(公开库/本地版)直通。"""
    if _access_guard is not None:
        _access_guard.check_access(request)


def check_rate_limit(request: Request) -> None:
    """按 IP 限流; 无云端模块时直通。"""
    if _access_guard is not None:
        _access_guard.check_rate_limit(request)


def client_ip(request: Request) -> str:
    """取真实客户端 IP; 无云端模块时返回 unknown。"""
    if _access_guard is not None:
        return _access_guard.client_ip(request)
    return "unknown"


def log_run(request: Request, req: SandboxRunRequest, resp: SandboxRunResponse) -> None:
    """沙箱运行留痕; 无云端模块时不留。"""
    if _access_guard is not None:
        _access_guard.log_run(request, req, resp)


# === 试用 Key 代理 ===


def trial_quota_enabled() -> bool:
    """试用额度是否可用(云端模块存在且已启用)。"""
    return _llm_proxy is not None and _llm_proxy.enabled()


def issue_trial_env(ip: str) -> dict[str, str]:
    """签发试用额度临时令牌 env。调用前必须先确认 trial_quota_enabled()。"""
    if _llm_proxy is None:
        raise RuntimeError("试用 Key 代理模块不存在(公开库形态)")
    return _llm_proxy.issue_shared_env(ip)


# === 路由挂载 ===


def extra_routers() -> list[APIRouter]:
    """云端专属 router 列表(存在才返回); main.py 逐个挂载, 不关心剔除。"""
    routers: list[APIRouter] = []
    try:
        from app.routers import access

        routers.append(access.router)
    except ImportError:
        pass
    try:
        from app.routers import llm

        routers.append(llm.router)
    except ImportError:
        pass
    return routers
