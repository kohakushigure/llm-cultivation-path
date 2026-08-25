"""CurriculumCache 刻画测试（工单 #13）——测"现在的行为"，只打公开接口。

边界处理（tdd 纪律）：文件系统用 tmp_path 真实 JSON fixture，不 mock FS。
断言值全部来自手造 fixture（独立已知值）。CurriculumCache 是类级单例，
每个用例自行 load 覆盖，顺序无关。
"""
from __future__ import annotations

import json

import pytest

from app.services.curriculum_loader import CurriculumCache


def _step(step_id: str, task_id: str) -> dict:
    return {
        "id": step_id, "taskId": task_id, "order": 1, "title": "步骤",
        "instruction": "i", "starterCode": "a", "solutionCode": "b",
    }


def _task(task_id: str, chapter_id: str, step_ids: list[str]) -> dict:
    return {
        "id": task_id, "chapterId": chapter_id, "order": 1, "title": "任务",
        "scenario": "s", "learningGoal": "g", "difficulty": "easy",
        "expReward": 10, "estimatedMinutes": 5,
        "steps": [_step(s, task_id) for s in step_ids],
    }


def _course(chapter_map: dict[str, dict[str, list[str]]]) -> dict:
    """chapter_map: {chapter_id: {task_id: [step_ids]}}"""
    return {
        "id": "course", "title": "课程", "description": "d", "version": "1.0.0",
        "totalExp": 10,
        "chapters": [
            {
                "id": ch_id, "courseId": "course", "order": 1, "title": "章",
                "description": "d", "theme": "x", "unlock": {},
                "tasks": [_task(t_id, ch_id, steps) for t_id, steps in tasks.items()],
            }
            for ch_id, tasks in chapter_map.items()
        ],
    }


def _write_course(tmp_path, data: dict) -> None:
    (tmp_path / "curriculum.json").write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )


FIXTURE = {"ch01": {"t01": ["t01-s1", "t01-s2"], "t02": ["t02-s1"]}, "ch02": {"t03": ["t03-s1"]}}


def test_load_indexes_all_levels(tmp_path):
    _write_course(tmp_path, _course(FIXTURE))
    CurriculumCache.load(tmp_path)

    assert CurriculumCache.is_loaded() is True
    assert CurriculumCache.get_course().id == "course"
    assert CurriculumCache.get_chapter("ch01").id == "ch01"
    assert CurriculumCache.get_chapter("ch02").id == "ch02"
    assert CurriculumCache.get_task("t02").chapter_id == "ch01"
    assert CurriculumCache.get_step("t02-s1").task_id == "t02"


def test_missing_ids_return_none(tmp_path):
    _write_course(tmp_path, _course(FIXTURE))
    CurriculumCache.load(tmp_path)

    assert CurriculumCache.get_chapter("nope") is None
    assert CurriculumCache.get_task("nope") is None
    assert CurriculumCache.get_step("nope") is None


def test_missing_curriculum_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError, match="课程数据不存在"):
        CurriculumCache.load(tmp_path)


def test_reload_replaces_indexes_without_residue(tmp_path):
    _write_course(tmp_path, _course(FIXTURE))
    CurriculumCache.load(tmp_path)
    assert CurriculumCache.get_task("t01") is not None

    _write_course(tmp_path, _course({"ch09": {"t99": ["t99-s1"]}}))
    CurriculumCache.load(tmp_path)

    assert CurriculumCache.get_task("t01") is None
    assert CurriculumCache.get_step("t01-s1") is None
    assert CurriculumCache.get_task("t99") is not None
    assert len(CurriculumCache.get_course().chapters) == 1
