"""Docker 沙箱执行器(subprocess 调 docker run, stdin 传代码, 避开路径映射)。

安全隔离(唯一规格见 _SECURITY_ARGS, run/run_pytest 两通道共用):
- network=none(除非 needs_network)
- read-only 根文件系统 + 临时可写 /workspace
- cap_drop=ALL, no-new-privileges
- 非 root 用户, 内存 256m, CPU 0.5 核, 进程数 64
- 超时 kill
"""
from __future__ import annotations

import asyncio
import base64
import subprocess
import time
import uuid
from urllib.parse import urlparse

from fastapi import HTTPException

from app.config import settings
from app.models.sandbox import SandboxRunRequest, SandboxRunResponse
from app.services import cloud_guards


DEEPSEEK_BASE_URL = "https://api.deepseek.com"


class SandboxConfigurationError(ValueError):
    """学习者的联网沙箱配置不满足课程要求。"""


def _normalize_deepseek_base_url(value: str) -> str:
    """只接受 DeepSeek 官方 API 端点，避免联网容器被导向任意地址。"""
    normalized = value.strip().rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme != "https" or parsed.netloc != "api.deepseek.com" or parsed.path not in ("", "/v1"):
        raise SandboxConfigurationError("联网课程只能使用 DeepSeek 官方接口 https://api.deepseek.com")
    return DEEPSEEK_BASE_URL


# 沙箱容器安全规格 —— 全仓唯一一份, run / run_pytest 两个入口 adapter 共用。
# Some SDKs (notably CrewAI) consult HOME/XDG rather than cwd;
# keep their runtime state inside writable tmpfs, never the image layer.
_SECURITY_ARGS = [
    "--memory=256m",
    "--cpus=0.5",
    "--read-only",
    "--tmpfs=/tmp:rw,size=32m",
    "--tmpfs=/workspace:rw,size=32m,mode=1777",
    "--workdir=/workspace",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--user=runner",
    "--pids-limit=64",
    "-e", "HOME=/workspace",
    "-e", "XDG_CACHE_HOME=/tmp",
    "-e", "XDG_CONFIG_HOME=/tmp",
]

# 联网课程的镜像内程序: 用 compile 指定文件名 'main.py', 让 traceback 行号
# 与前端编辑器的 main.py 对应, 而不是指向无法定位的 <string>。
_RUN_PROGRAM = ["python", "-c", "import sys; exec(compile(sys.stdin.read(), 'main.py', 'exec'))"]

# 行为测试通道: 学习者代码与服务端信任测试经 base64 env 传入(防 shell 插值),
# 在隔离的 /workspace 落盘后跑 pytest。
_PYTEST_PROGRAM = [
    "python", "-c",
    "import base64, pathlib, pytest; "
    "pathlib.Path('student_submission.py').write_bytes(base64.b64decode(__import__('os').environ['LEARNER_CODE_B64'])); "
    "pathlib.Path('step_test.py').write_bytes(base64.b64decode(__import__('os').environ['STEP_TEST_B64'])); "
    "raise SystemExit(pytest.main(['-q', 'step_test.py']))",
]


class SandboxRunner:
    def __init__(self) -> None:
        self._sem = asyncio.Semaphore(settings.sandbox_max_concurrency)
        self._image = settings.sandbox_image

    @property
    def image(self) -> str:
        """标准沙箱镜像名(只读; ml 档镜像名走 settings.sandbox_ml_image)。"""
        return self._image

    @property
    def max_concurrency(self) -> int:
        return settings.sandbox_max_concurrency

    @property
    def concurrency(self) -> int:
        """当前正在执行的沙箱数(信号量已占用槽位)。"""
        return settings.sandbox_max_concurrency - self._sem._value

    def _image_for(self, profile: str) -> str:
        return settings.sandbox_ml_image if profile == "ml" else self._image

    def _build_network_env(self, req: SandboxRunRequest, client_ip: str) -> dict[str, str]:
        """联网课程 env 构造: 使用者私人 Key 直连 DeepSeek; 否则试用额度走代理(临时令牌)。"""
        env = dict(req.env or {})
        api_key = env.get("OPENAI_API_KEY", "").strip()
        if api_key:
            # 私人 Key 模式: 校验 + 直连 DeepSeek(花学习者自己的钱, 不限流)
            model = env.get("MODEL_NAME", "").strip() or settings.generator_model
            if not model.startswith("deepseek-"):
                raise SandboxConfigurationError("联网课程的模型名必须是 DeepSeek 模型")
            return {
                "OPENAI_API_KEY": api_key,
                "OPENAI_BASE_URL": _normalize_deepseek_base_url(
                    env.get("OPENAI_BASE_URL", DEEPSEEK_BASE_URL)
                ),
                "MODEL_NAME": model,
            }
        # 试用额度模式: 后端内嵌 Key 走代理, 注入临时令牌(学习者拿不到真 Key)
        if not cloud_guards.trial_quota_enabled():
            raise SandboxConfigurationError(
                "联网课程需要 API Key: 站点试用额度未启用, 请在 AI 配置中输入你自己的 DeepSeek API Key"
            )
        return cloud_guards.issue_trial_env(client_ip)

    async def _acquire_slot(self, profile: str) -> None:
        """镜像就绪检查 + 并发槽位排队(超时 503 沙箱繁忙, 避免公网请求无限挂起)。"""
        if not self.is_available(profile):
            raise SandboxConfigurationError(f"{profile} 教学沙箱镜像未就绪：{self._image_for(profile)}")
        try:
            await asyncio.wait_for(self._sem.acquire(), timeout=settings.sandbox_queue_timeout)
        except TimeoutError:
            raise HTTPException(503, f"沙箱繁忙: 排队超过 {settings.sandbox_queue_timeout} 秒, 请稍后重试") from None

    async def run(self, req: SandboxRunRequest, client_ip: str = "") -> SandboxRunResponse:
        """运行学习者代码(入口 adapter)。"""
        await self._acquire_slot(req.sandbox_profile)
        try:
            return await asyncio.to_thread(
                self._execute_container,
                req,
                client_ip,
                name_prefix="llmquest-sandbox",
                program=_RUN_PROGRAM,
                stdin_data=req.code.encode("utf-8"),
                timeout_msg=f"执行超时(>{req.timeout}秒, 已终止)",
            )
        finally:
            self._sem.release()

    async def run_pytest(self, req: SandboxRunRequest, test_code: str, client_ip: str = "") -> SandboxRunResponse:
        """对学习者代码跑服务端信任的 pytest(入口 adapter)。测试源码只从服务端课程目录读取。"""
        await self._acquire_slot(req.sandbox_profile)
        extra_env = {
            "LEARNER_CODE_B64": base64.b64encode(req.code.encode("utf-8")).decode("ascii"),
            "STEP_TEST_B64": base64.b64encode(test_code.encode("utf-8")).decode("ascii"),
        }
        try:
            return await asyncio.to_thread(
                self._execute_container,
                req,
                client_ip,
                name_prefix="llmquest-pytest",
                program=_PYTEST_PROGRAM,
                extra_env=extra_env,
                timeout_msg=f"验证超时(>{req.timeout}秒, 已终止)",
            )
        finally:
            self._sem.release()

    def _execute_container(
        self,
        req: SandboxRunRequest,
        client_ip: str,
        *,
        name_prefix: str,
        program: list[str],
        timeout_msg: str,
        stdin_data: bytes | None = None,
        extra_env: dict[str, str] | None = None,
    ) -> SandboxRunResponse:
        """深实现: 按唯一安全规格构造并执行容器, 统一处理超时/异常。"""
        start = time.time()
        env = self._build_network_env(req, client_ip) if req.needs_network else dict(req.env or {})
        env.update(extra_env or {})
        container_name = f"{name_prefix}-{uuid.uuid4().hex[:12]}"
        cmd = [
            "docker", "run", "--rm", "-i", "--name", container_name,
            "--network=" + ("none" if not req.needs_network else "default"),
            *_SECURITY_ARGS,
        ]
        if req.needs_network:
            # 试用额度模式经 host-gateway 回宿主机代理; 私人 Key 模式加此项也无副作用
            cmd.append("--add-host=host.docker.internal:host-gateway")
        for k, v in env.items():
            cmd.extend(["-e", f"{k}={v}"])
        cmd.extend([self._image_for(req.sandbox_profile), *program])
        try:
            proc = subprocess.run(cmd, input=stdin_data, capture_output=True, timeout=req.timeout)
            duration_ms = int((time.time() - start) * 1000)
            return SandboxRunResponse(
                stdout=proc.stdout.decode("utf-8", errors="replace"),
                stderr=proc.stderr.decode("utf-8", errors="replace"),
                exit_code=proc.returncode,
                duration_ms=duration_ms,
                timed_out=False,
            )
        except subprocess.TimeoutExpired:
            self._cleanup_container(container_name)
            duration_ms = int((time.time() - start) * 1000)
            return SandboxRunResponse(
                stdout="",
                stderr=timeout_msg,
                exit_code=-1,
                duration_ms=duration_ms,
                timed_out=True,
            )
        except Exception as e:
            duration_ms = int((time.time() - start) * 1000)
            return SandboxRunResponse(
                stdout="",
                stderr=str(e),
                exit_code=-1,
                duration_ms=duration_ms,
                timed_out=False,
                error=str(e),
            )

    def _cleanup_container(self, name: str) -> None:
        """超时后兜底停掉并移除容器(若 daemon 已停则无操作)。"""
        try:
            subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=10)
        except Exception:
            pass

    def is_available(self, profile: str = "core") -> bool:
        """检查沙箱镜像是否就绪。"""
        try:
            result = subprocess.run(
                ["docker", "image", "inspect", self._image_for(profile)],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except Exception:
            return False


_runner: SandboxRunner | None = None


def get_runner() -> SandboxRunner:
    global _runner
    if _runner is None:
        _runner = SandboxRunner()
    return _runner
