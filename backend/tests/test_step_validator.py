"""step_validator 刻画测试（工单 #16）——测"现在的行为"，只打公开接口。

边界处理：课程数据与 .test.py 用 tmp_path 真实文件；执行器的系统边界
（docker subprocess）沿用既有假 subprocess 模式，不 mock 项目内部模块。
CurriculumCache 是类级单例，本文件用 fixture 在用例后恢复真实课程数据，
避免污染其他测试文件。
"""
from __future__ import annotations

import base64
import json
import subprocess

import pytest
from fastapi import HTTPException

from app.config import Settings, settings
from app.services import step_validator
from app.services.curriculum_loader import CurriculumCache
from app.services.sandbox_runner import SandboxRunner


def _step(step_id: str, task_id: str, order: int, **extra) -> dict:
    return {
        "id": step_id, "taskId": task_id, "order": order, "title": "步骤",
        "instruction": "i", "starterCode": "a", "solutionCode": "b", **extra,
    }


COURSE = {
    "id": "course", "title": "课程", "description": "d", "version": "1.0.0",
    "totalExp": 10,
    "chapters": [{
        "id": "ch01", "courseId": "course", "order": 1, "title": "章",
        "description": "d", "theme": "x", "unlock": {},
        "tasks": [
            {
                "id": "t01", "chapterId": "ch01", "order": 1, "title": "离线任务",
                "scenario": "s", "learningGoal": "g", "difficulty": "easy",
                "expReward": 10, "estimatedMinutes": 5,
                "steps": [
                    _step("t01-s1", "t01", 1),                                  # 无测试文件
                    _step("t01-s2", "t01", 2, needsNetwork=True, sandboxTimeout=77),  # 步骤级覆盖
                    _step("t01-s3", "t01", 3),                                  # 默认推导（离线 15s）
                ],
            },
            {
                "id": "t02", "chapterId": "ch01", "order": 2, "title": "联网任务",
                "scenario": "s", "learningGoal": "g", "difficulty": "easy",
                "expReward": 10, "estimatedMinutes": 5, "needsNetwork": True,
                "steps": [
                    _step("t02-s1", "t02", 1),                                  # 继承任务级联网（30s）
                    _step("t02-s2", "t02", 2, needsNetwork=False),              # 步骤级关断任务联网
                ],
            },
        ],
    }],
}

SERVER_TEST_CODE = "def test_server_owned():\n    assert True  # 来自服务端课程源文件\n"
KEY_ENV = {"OPENAI_API_KEY": "sk-user-key", "MODEL_NAME": "deepseek-v4-pro"}


@pytest.fixture
def course_env(monkeypatch, tmp_path):
    """把 data_path 与课程缓存切到 tmp fixture，用例后恢复真实课程数据。"""
    (tmp_path / "curriculum.json").write_text(
        json.dumps(COURSE, ensure_ascii=False), encoding="utf-8"
    )
    test_dir = tmp_path / "chapters" / "ch01"
    (test_dir / "t01" / "t01-s2.test.py").parent.mkdir(parents=True, exist_ok=True)
    (test_dir / "t01" / "t01-s2.test.py").write_text(SERVER_TEST_CODE, encoding="utf-8")
    (test_dir / "t01" / "t01-s3.test.py").write_text(SERVER_TEST_CODE, encoding="utf-8")
    (test_dir / "t02").mkdir(parents=True, exist_ok=True)
    (test_dir / "t02" / "t02-s1.test.py").write_text(SERVER_TEST_CODE, encoding="utf-8")
    (test_dir / "t02" / "t02-s2.test.py").write_text(SERVER_TEST_CODE, encoding="utf-8")
    monkeypatch.setattr(type(settings), "data_path", property(lambda self: tmp_path))
    CurriculumCache.load(tmp_path)
    yield tmp_path
    CurriculumCache.load(Settings().data_path)


@pytest.fixture
def fake_docker(monkeypatch):
    """假 docker：捕获命令行与 timeout kwargs；执行器镜像检查桩为就绪。"""
    captured: dict = {"cmd": [], "kwargs": {}}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = [str(c) for c in cmd]
        captured["kwargs"] = kwargs
        return subprocess.CompletedProcess(cmd, 0, stdout=b"1 passed\n", stderr=b"")

    monkeypatch.setattr("app.services.sandbox_runner.subprocess.run", fake_run)
    runner = SandboxRunner()
    runner.is_available = lambda *a, **k: True  # type: ignore[method-assign]
    monkeypatch.setattr(step_validator, "get_runner", lambda: runner)
    return captured


def test_unknown_task_or_step_404(course_env):
    with pytest.raises(HTTPException) as e1:
        step_validator.get_step_for_validation("nope", "t01-s1")
    assert e1.value.status_code == 404
    with pytest.raises(HTTPException) as e2:
        step_validator.get_step_for_validation("t01", "nope")
    assert e2.value.status_code == 404


def test_step_belonging_to_other_task_404(course_env):
    """步骤真实存在但属于别的任务 → 404（防张冠李戴）。"""
    with pytest.raises(HTTPException) as e:
        step_validator.get_step_for_validation("t02", "t01-s1")
    assert e.value.status_code == 404


def test_step_without_test_file_409(course_env):
    with pytest.raises(HTTPException) as e:
        step_validator.get_step_for_validation("t01", "t01-s1")
    assert e.value.status_code == 409


async def test_test_code_always_comes_from_server_file(course_env, fake_docker):
    """信任边界：容器里跑的测试代码 = 服务端课程源文件。"""
    resp = await step_validator.validate_step_code(
        "t01", "t01-s2", "print('学习者代码')", KEY_ENV,
    )
    assert resp.exit_code == 0
    env = [c for c in fake_docker["cmd"] if c.startswith("STEP_TEST_B64=")]
    assert len(env) == 1
    assert base64.b64decode(env[0].split("=", 1)[1]).decode("utf-8") == SERVER_TEST_CODE


async def test_step_network_and_timeout_override_task(course_env, fake_docker):
    """步骤级 needsNetwork=True + sandboxTimeout=77 覆盖任务级默认（离线任务里的联网步）。"""
    await step_validator.validate_step_code("t01", "t01-s2", "print(1)", KEY_ENV)
    assert "--network=default" in fake_docker["cmd"]
    assert fake_docker["kwargs"]["timeout"] == 77


async def test_step_inherits_task_network_and_default_timeout(course_env, fake_docker):
    """步骤未声明 → 继承任务级 needsNetwork=True，超时推导 30s。"""
    await step_validator.validate_step_code("t02", "t02-s1", "print(1)", KEY_ENV)
    assert "--network=default" in fake_docker["cmd"]
    assert fake_docker["kwargs"]["timeout"] == 30


async def test_step_can_disable_task_network(course_env, fake_docker):
    """步骤级 needsNetwork=False 关断任务级联网（覆盖而非继承）。"""
    await step_validator.validate_step_code("t02", "t02-s2", "print(1)", KEY_ENV)
    assert "--network=none" in fake_docker["cmd"]
    assert fake_docker["kwargs"]["timeout"] == 15  # 离线默认推导


async def test_offline_default_timeout(course_env, fake_docker):
    """离线步骤无步骤级超时 → 默认 15s。"""
    await step_validator.validate_step_code("t01", "t01-s3", "print(1)", None)
    assert "--network=none" in fake_docker["cmd"]
    assert fake_docker["kwargs"]["timeout"] == 15
