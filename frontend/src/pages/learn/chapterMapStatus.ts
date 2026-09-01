import type { Chapter } from '@shared/types'
import { levelFromExp } from '@shared/types'

/** 测试阶段: 强制解锁所有章节(上线前改为 false)。沿用原 CourseMap 的开关语义。 */
export const TEST_UNLOCK_ALL = true

/** 章节在地图上的三态: 已完成(绿) / 进行中(蓝) / 未解锁(灰)。 */
export type ChapterStatus = 'completed' | 'current' | 'locked'

export interface ChapterMapContext {
  /** 已通关的 taskId 数组 */
  completedTaskIds: string[]
  /** 累计经验 */
  totalExp: number
  /** 覆盖模块级 TEST_UNLOCK_ALL 开关; 不传则用模块默认 */
  testUnlockAll?: boolean
}

/** 章节是否可进入(导航门禁)。testUnlockAll 打开时全部放行。 */
export function isChapterUnlocked(chapter: Chapter, ctx: ChapterMapContext): boolean {
  if (ctx.testUnlockAll ?? TEST_UNLOCK_ALL) return true
  return (
    levelFromExp(ctx.totalExp) >= chapter.unlock.requiredLevel &&
    ctx.totalExp >= chapter.unlock.requiredExp &&
    chapter.unlock.prerequisiteTaskIds.every((id) => ctx.completedTaskIds.includes(id))
  )
}

/**
 * 推导整门课的章节三态(学习地图的唯一状态来源)。
 * completed = 章节全部任务完成; current = 首个未完成且已解锁的章节; 其余 = locked。
 * 注意: 展示状态与能否进入分离——导航门禁用 isChapterUnlocked,
 * 此处只决定视觉样式(与地图设计稿一致: 同一时刻最多一个 current)。
 */
export function chapterMapStatus(
  chapters: Chapter[],
  ctx: ChapterMapContext,
): Map<string, ChapterStatus> {
  const status = new Map<string, ChapterStatus>()
  let currentAssigned = false
  for (const chapter of chapters) {
    const completed =
      chapter.tasks.length > 0 &&
      chapter.tasks.every((t) => ctx.completedTaskIds.includes(t.id))
    if (completed) {
      status.set(chapter.id, 'completed')
    } else if (!currentAssigned && isChapterUnlocked(chapter, ctx)) {
      status.set(chapter.id, 'current')
      currentAssigned = true
    } else {
      status.set(chapter.id, 'locked')
    }
  }
  return status
}
