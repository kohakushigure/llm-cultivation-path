/**
 * course store 刻画测试（工单 #33）——测"现在的行为"，只打公开接口。
 * 边界：HTTP 在 fetch 边界 stub（vi.stubGlobal），不 mock 项目内部模块。
 * 每用例重置 store 状态（course 是模块级单例）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Course } from '@shared/types'
import { useCourse } from './store'

const FIXTURE: Course = {
  id: 'course', title: '课程', description: 'd', version: '1.0.0', totalExp: 10,
  chapters: [
    {
      id: 'ch01', courseId: 'course', order: 1, title: '章节一', description: 'd', theme: 'x',
      unlock: { requiredLevel: 0, requiredExp: 0, prerequisiteTaskIds: [] },
      tasks: [
        {
          id: 't01', chapterId: 'ch01', order: 1, title: '任务一', scenario: 's',
          learningGoal: 'g', difficulty: 'easy', expReward: 10, estimatedMinutes: 5,
          needsSandbox: false, needsNetwork: false,
          steps: [{
            id: 't01-s1', taskId: 't01', order: 1, title: '步骤一', instruction: 'i',
            starterCode: 'a', solutionCode: 'b', hints: [], todoItems: [],
            codeSamples: [], terms: [], techStack: [], validation: [],
          }],
        },
        {
          id: 't02', chapterId: 'ch01', order: 2, title: '任务二', scenario: 's',
          learningGoal: 'g', difficulty: 'easy', expReward: 10, estimatedMinutes: 5,
          needsSandbox: false, needsNetwork: false,
          steps: [{
            id: 't02-s1', taskId: 't02', order: 1, title: '步骤二', instruction: 'i',
            starterCode: 'a', solutionCode: 'b', hints: [], todoItems: [],
            codeSamples: [], terms: [], techStack: [], validation: [],
          }],
        },
      ],
    },
    {
      id: 'ch02', courseId: 'course', order: 2, title: '章节二', description: 'd', theme: 'x',
      unlock: { requiredLevel: 0, requiredExp: 0, prerequisiteTaskIds: [] },
      tasks: [{
        id: 't03', chapterId: 'ch02', order: 1, title: '任务三', scenario: 's',
        learningGoal: 'g', difficulty: 'easy', expReward: 10, estimatedMinutes: 5,
        needsSandbox: false, needsNetwork: false,
        steps: [{
          id: 't03-s1', taskId: 't03', order: 1, title: '步骤三', instruction: 'i',
          starterCode: 'a', solutionCode: 'b', hints: [], todoItems: [],
          codeSamples: [], terms: [], techStack: [], validation: [],
        }],
      }],
    },
  ],
}

function stubCourseFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  // store 是模块级单例：直接复位字段（course store 无 persist，无 localStorage 边界）
  useCourse.setState({ course: null, loading: false, error: null })
})

describe('loadCourse', () => {
  it('加载成功：课程入 store，三种 id 查询命中', async () => {
    const fetchMock = stubCourseFetch(FIXTURE)
    vi.stubGlobal('fetch', fetchMock)

    await useCourse.getState().loadCourse()
    const s = useCourse.getState()
    expect(s.course?.id).toBe('course')
    expect(s.loading).toBe(false)
    expect(s.error).toBeNull()
    expect(s.getChapter('ch01')?.title).toBe('章节一')
    expect(s.getChapter('ch02')?.title).toBe('章节二')
    expect(s.getTask('t01')?.title).toBe('任务一')
    expect(s.getTask('t03')?.title).toBe('任务三')  // 跨章索引不串
    expect(s.getStep('t02-s1')?.title).toBe('步骤二')
    expect(s.getStep('t03-s1')?.title).toBe('步骤三')
  })

  it('缺失 id 返回 undefined', async () => {
    vi.stubGlobal('fetch', stubCourseFetch(FIXTURE))
    await useCourse.getState().loadCourse()
    expect(useCourse.getState().getChapter('nope')).toBeUndefined()
    expect(useCourse.getState().getTask('nope')).toBeUndefined()
    expect(useCourse.getState().getStep('nope')).toBeUndefined()
  })

  it('重复 loadCourse 不重复请求（已加载即短路）', async () => {
    const fetchMock = stubCourseFetch(FIXTURE)
    vi.stubGlobal('fetch', fetchMock)
    await useCourse.getState().loadCourse()
    await useCourse.getState().loadCourse()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('加载失败：error 记录可读信息，course 保持空', async () => {
    vi.stubGlobal('fetch', stubCourseFetch({ detail: '服务器错误' }, false))
    await useCourse.getState().loadCourse()
    const s = useCourse.getState()
    expect(s.course).toBeNull()
    expect(s.loading).toBe(false)
    expect(s.error).toBe('500: 服务器错误')
  })
})
