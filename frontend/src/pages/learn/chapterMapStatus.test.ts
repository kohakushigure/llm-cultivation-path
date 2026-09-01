import { describe, it, expect } from 'vitest'
import type { Chapter, Task } from '@shared/types'
import { chapterMapStatus, isChapterUnlocked } from './chapterMapStatus'

/** 最小章节 fixture：只填状态推导依赖的字段，其余留空。 */
function makeChapter(
  id: string,
  taskIds: string[],
  unlock: Partial<Chapter['unlock']> = {},
): Chapter {
  return {
    id,
    courseId: 'course',
    order: 0,
    title: id,
    description: '',
    theme: '',
    unlock: { requiredLevel: 1, requiredExp: 0, prerequisiteTaskIds: [], ...unlock },
    tasks: taskIds.map(
      (tid) =>
        ({
          id: tid,
          chapterId: id,
          order: 0,
          title: tid,
          scenario: '',
          learningGoal: '',
          difficulty: 'easy',
          expReward: 10,
          estimatedMinutes: 5,
          needsSandbox: false,
          needsNetwork: false,
          steps: [],
        }) as Task,
    ),
  }
}

const CHAPTERS = [
  makeChapter('ch01', ['t01', 't02']),
  makeChapter('ch02', ['t10']),
  makeChapter('ch03', ['t20']),
]

describe('chapterMapStatus', () => {
  it('章节全部任务完成时标记为 completed', () => {
    const status = chapterMapStatus(CHAPTERS, {
      completedTaskIds: ['t01', 't02', 't10'],
      totalExp: 0,
      testUnlockAll: true,
    })
    expect(status.get('ch01')).toBe('completed')
    expect(status.get('ch02')).toBe('completed')
  })

  it('首个未完成且已解锁的章节为 current，其后未完成的为 locked', () => {
    const status = chapterMapStatus(CHAPTERS, {
      completedTaskIds: ['t01', 't02'],
      totalExp: 0,
      testUnlockAll: true,
    })
    expect(status.get('ch01')).toBe('completed')
    expect(status.get('ch02')).toBe('current')
    expect(status.get('ch03')).toBe('locked')
  })

  it('零进度时第一章为 current，其余 locked', () => {
    const status = chapterMapStatus(CHAPTERS, {
      completedTaskIds: [],
      totalExp: 0,
      testUnlockAll: true,
    })
    expect(status.get('ch01')).toBe('current')
    expect(status.get('ch02')).toBe('locked')
    expect(status.get('ch03')).toBe('locked')
  })

  it('全部章节完成时不存在 current', () => {
    const status = chapterMapStatus(CHAPTERS, {
      completedTaskIds: ['t01', 't02', 't10', 't20'],
      totalExp: 0,
      testUnlockAll: true,
    })
    expect([...status.values()]).toEqual(['completed', 'completed', 'completed'])
  })

  it('部分完成的章节不算 completed', () => {
    const status = chapterMapStatus(CHAPTERS, {
      completedTaskIds: ['t01'],
      totalExp: 0,
      testUnlockAll: true,
    })
    expect(status.get('ch01')).toBe('current')
  })
})

describe('isChapterUnlocked（testUnlockAll=false 时按 unlock 规则）', () => {
  it('经验不足时锁定', () => {
    const ch = makeChapter('ch02', ['t10'], { requiredExp: 500 })
    expect(
      isChapterUnlocked(ch, { completedTaskIds: [], totalExp: 100, testUnlockAll: false }),
    ).toBe(false)
  })

  it('等级不足时锁定（requiredLevel 3 需要 exp>=400）', () => {
    const ch = makeChapter('ch02', ['t10'], { requiredLevel: 3 })
    expect(
      isChapterUnlocked(ch, { completedTaskIds: [], totalExp: 100, testUnlockAll: false }),
    ).toBe(false)
    expect(
      isChapterUnlocked(ch, { completedTaskIds: [], totalExp: 400, testUnlockAll: false }),
    ).toBe(true)
  })

  it('前置任务未完成时锁定', () => {
    const ch = makeChapter('ch02', ['t10'], { prerequisiteTaskIds: ['t01'] })
    expect(
      isChapterUnlocked(ch, { completedTaskIds: [], totalExp: 0, testUnlockAll: false }),
    ).toBe(false)
    expect(
      isChapterUnlocked(ch, { completedTaskIds: ['t01'], totalExp: 0, testUnlockAll: false }),
    ).toBe(true)
  })

  it('testUnlockAll=true 时忽略 unlock 规则', () => {
    const ch = makeChapter('ch02', ['t10'], {
      requiredLevel: 99,
      requiredExp: 999999,
      prerequisiteTaskIds: ['t01'],
    })
    expect(
      isChapterUnlocked(ch, { completedTaskIds: [], totalExp: 0, testUnlockAll: true }),
    ).toBe(true)
  })

  it('锁定的章节在地图上显示为 locked 而非 current', () => {
    const chapters = [
      makeChapter('ch01', ['t01']),
      makeChapter('ch02', ['t10'], { requiredExp: 999999 }),
    ]
    const status = chapterMapStatus(chapters, {
      completedTaskIds: ['t01'],
      totalExp: 0,
      testUnlockAll: false,
    })
    expect(status.get('ch01')).toBe('completed')
    expect(status.get('ch02')).toBe('locked')
  })
})
