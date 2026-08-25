"""cloud_guards 云端接缝刻画测试（工单 #19）——测"现在的行为"。

边界处理：该接缝的全部意义就是「云端模块存在与否」这个边界。
- 防护/额度函数：monkeypatch 切换模块引用模拟两种形态
- extra_routers：import 在调用时发生，用 sys.modules 置 None 模拟公开库缺席

本文件进公开库：私有形态用例在云端模块缺席时 skip（本地版只跑公开形态）。
"""
from __future__ import annotations

import importlib.util
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.config import settings
from app.services import cloud_guards

_REQ = SimpleNamespace(headers={"x-access-code": "nope"}, client=SimpleNamespace(host="1.2.3.4"))

# 云端模块是否在场（公开库 sync 剔除后不在）
_HAS_CLOUD = importlib.util.find_spec("app.services.access_guard") is not None
needs_cloud = pytest.mark.skipif(not _HAS_CLOUD, reason="云端专属模块缺席（公开库形态）")


@pytest.fixture(autouse=True)
def _tmp_ledger(monkeypatch, tmp_path):
    """账本重定向到临时库，不污染真实开发数据（公开库无账本模块则跳过）。"""
    if not _HAS_CLOUD:
        return
    from app.services import usage_store

    monkeypatch.setattr(usage_store, "_DB", tmp_path / "usage.db")


@needs_cloud
class TestPrivateForm:
    """私有库/云端形态：模块存在，透传真实现。"""

    def test_check_access_delegates(self, monkeypatch):
        monkeypatch.setattr(settings, "invite_codes_path", "/nonexistent/x.json")
        monkeypatch.setattr(settings, "access_codes", "realm-1")
        with pytest.raises(HTTPException) as e:
            cloud_guards.check_access(_REQ)
        assert e.value.status_code == 403

    def test_rate_limit_delegates(self, monkeypatch):
        monkeypatch.setattr(settings, "sandbox_rate_limit", 1)
        monkeypatch.setattr(settings, "access_codes", "")
        from app.services import access_guard

        access_guard._buckets.clear()
        cloud_guards.check_rate_limit(_REQ)
        with pytest.raises(HTTPException) as e:
            cloud_guards.check_rate_limit(_REQ)
        assert e.value.status_code == 429

    def test_client_ip_delegates(self):
        assert cloud_guards.client_ip(_REQ) == "1.2.3.4"

    def test_log_run_delegates(self, tmp_path):
        import sqlite3

        from app.models.sandbox import SandboxRunRequest, SandboxRunResponse

        cloud_guards.log_run(
            _REQ,
            SandboxRunRequest(code="print(1)"),
            SandboxRunResponse(stdout="", stderr="", exit_code=0, duration_ms=1, timed_out=False),
        )
        with sqlite3.connect(tmp_path / "usage.db") as conn:
            rows = conn.execute("SELECT ip, action, result FROM invite_usage").fetchall()
        assert rows == [("1.2.3.4", "run", "ok")]

    def test_trial_quota_delegates(self, monkeypatch):
        monkeypatch.setattr(settings, "llm_proxy_enabled", True)
        monkeypatch.setattr(settings, "llm_shared_api_key", "sk-real")
        assert cloud_guards.trial_quota_enabled() is True
        env = cloud_guards.issue_trial_env("1.2.3.4")
        assert env["OPENAI_BASE_URL"] == settings.llm_proxy_container_url
        assert env["OPENAI_API_KEY"] != "sk-real"

    def test_extra_routers_present(self):
        prefixes = [r.prefix for r in cloud_guards.extra_routers()]
        assert "/api/access" in prefixes and "/api/llm" in prefixes


class TestPublicForm:
    """公开库（本地版）形态：云端模块缺席，全部 no-op。"""

    @pytest.fixture(autouse=True)
    def _absent(self, monkeypatch):
        monkeypatch.setattr(cloud_guards, "_access_guard", None)
        monkeypatch.setattr(cloud_guards, "_llm_proxy", None)

    def test_guards_noop(self):
        cloud_guards.check_access(_REQ)  # 不拦
        cloud_guards.check_rate_limit(_REQ)  # 不限
        assert cloud_guards.client_ip(_REQ) == "unknown"

    def test_log_run_noop(self, tmp_path):
        from app.models.sandbox import SandboxRunRequest, SandboxRunResponse

        cloud_guards.log_run(
            _REQ,
            SandboxRunRequest(code="print(1)"),
            SandboxRunResponse(stdout="", stderr="", exit_code=0, duration_ms=1, timed_out=False),
        )
        assert not (tmp_path / "usage.db").exists()  # 不留痕

    def test_trial_quota_off(self):
        assert cloud_guards.trial_quota_enabled() is False
        with pytest.raises(RuntimeError):
            cloud_guards.issue_trial_env("1.2.3.4")

    def test_extra_routers_empty(self, monkeypatch):
        """公开库形态：云端 router 缺席 → 空列表（sys.modules 置 None + 清父包属性，让 import 抛 ImportError）。"""
        import app.routers

        monkeypatch.delattr(app.routers, "access", raising=False)
        monkeypatch.delattr(app.routers, "llm", raising=False)
        monkeypatch.setitem(sys.modules, "app.routers.access", None)
        monkeypatch.setitem(sys.modules, "app.routers.llm", None)
        assert cloud_guards.extra_routers() == []
