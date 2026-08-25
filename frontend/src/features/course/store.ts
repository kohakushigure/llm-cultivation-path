import { create } from 'zustand'
import type { Course, Chapter, Task, Step } from '@shared/types'
import { api } from '@/api/client'

/** 章/任务/步骤索引(加载时建一次, 查询 O(1), 与后端 CurriculumCache 同形) */
interface CourseIndex {
  chapterById: Map<string, Chapter>
  taskById: Map<string, Task>
  stepById: Map<string, Step>
}

function buildIndex(course: Course): CourseIndex {
  const chapterById = new Map<string, Chapter>()
  const taskById = new Map<string, Task>()
  const stepById = new Map<string, Step>()
  for (const ch of course.chapters) {
    chapterById.set(ch.id, ch)
    for (const t of ch.tasks) {
      taskById.set(t.id, t)
      for (const s of t.steps) stepById.set(s.id, s)
    }
  }
  return { chapterById, taskById, stepById }
}

const EMPTY_INDEX: CourseIndex = {
  chapterById: new Map(),
  taskById: new Map(),
  stepById: new Map(),
}

// 索引不进 zustand 状态(避免 devtools/persist 噪音), 随 course 原子替换。
let _index: CourseIndex = EMPTY_INDEX

interface CourseStore {
  course: Course | null
  loading: boolean
  error: string | null
  loadCourse: () => Promise<void>
  getChapter: (id: string) => Chapter | undefined
  getTask: (id: string) => Task | undefined
  getStep: (id: string) => Step | undefined
}

export const useCourse = create<CourseStore>((set, get) => ({
  course: null,
  loading: false,
  error: null,
  loadCourse: async () => {
    if (get().course) return
    set({ loading: true, error: null })
    try {
      const course = await api.getCourse()
      _index = buildIndex(course)
      set({ course, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },
  getChapter: (id) => _index.chapterById.get(id),
  getTask: (id) => _index.taskById.get(id),
  getStep: (id) => _index.stepById.get(id),
}))
