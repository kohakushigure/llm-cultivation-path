// @vitest-environment jsdom
/**
 * progression store 刻画测试（工单 #31）——测"现在的行为"，只打公开接口。
 * 边界：localStorage 用 jsdom 真实实现（不 mock）；每用例 reset + 清存储。
 * 断言值来自手算（等级公式 level=floor(sqrt(exp/100))+1）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useProgress } from './store'

beforeEach(() => {
  localStorage.clear()
  useProgress.getState().reset()
})

// ---------- 等级（经 store 行为验证，公式本身属 shared/types 的契约） ----------
describe('等级派生', () => {
  it('等级随经验派生：100 经验升 2 级，400 经验升 3 级', () => {
    useProgress.getState().addExp(100)
    expect(useProgress.getState().level).toBe(2)
    useProgress.getState().addExp(300)
    expect(useProgress.getState().level).toBe(3)
  })
})

// ---------- 通关记账 ----------
describe('通关记账', () => {
  it('completeStep：加经验、派生等级、记录当前位置', () => {
    useProgress.getState().completeStep('t01-s1', 't01', 10)
    const s = useProgress.getState()
    expect(s.totalExp).toBe(10)
    expect(s.level).toBe(1)
    expect(s.completedSteps).toEqual(['t01-s1'])
    expect(s.currentStepId).toBe('t01-s1')
    expect(s.currentTaskId).toBe('t01')
  })

  it('同一步骤重复通关不重复记账', () => {
    useProgress.getState().completeStep('t01-s1', 't01', 10)
    useProgress.getState().completeStep('t01-s1', 't01', 10)
    const s = useProgress.getState()
    expect(s.totalExp).toBe(10)
    expect(s.completedSteps).toEqual(['t01-s1'])
  })

  it('completeTask：任务完成数 +1，未用提示则 perfectTasks +1', () => {
    useProgress.getState().completeTask('t01', 40, false)
    let s = useProgress.getState()
    expect(s.stats.tasksCompleted).toBe(1)
    expect(s.stats.perfectTasks).toBe(1)

    useProgress.getState().completeTask('t02', 40, true)
    s = useProgress.getState()
    expect(s.stats.tasksCompleted).toBe(2)
    expect(s.stats.perfectTasks).toBe(1)
  })

  it('addExp 负增长不跌破 0', () => {
    useProgress.getState().addExp(-50)
    expect(useProgress.getState().totalExp).toBe(0)
  })
})

// ---------- 成就连锁 ----------
describe('成就连锁', () => {
  it('完成首个任务自动解锁「初出茅庐」并发放奖励经验', () => {
    useProgress.getState().completeTask('t01', 40, false)
    const s = useProgress.getState()
    expect(s.achievements).toContain('first-task')
    expect(s.totalExp).toBe(60) // 40 任务 + 20 成就
  })

  it('三次无提示完成任务解锁「独立思考」', () => {
    for (const t of ['t01', 't02', 't03']) {
      useProgress.getState().completeTask(t, 10, false)
    }
    expect(useProgress.getState().achievements).toContain('no-hints-3')
  })

  it('用了提示则不计入「独立思考」', () => {
    for (const t of ['t01', 't02', 't03']) {
      useProgress.getState().completeTask(t, 10, true)
    }
    expect(useProgress.getState().achievements).not.toContain('no-hints-3')
  })

  it('成就奖励经验可连锁触发等级成就', () => {
    // 1550 + 50(任务) = 1600 → 5 级 → 解锁 level-5（+50）→ 1650
    useProgress.getState().addExp(1550)
    useProgress.getState().completeTask('t01', 50, false)
    const s = useProgress.getState()
    expect(s.achievements).toContain('level-5')
    // 1550 + 50(任务) + 20(初出茅庐) + 50(渐入佳境) = 1670
    expect(s.totalExp).toBe(1670)
  })

  it('提示不扣经验（revealHint 只记录）', () => {
    useProgress.getState().completeStep('t01-s1', 't01', 10)
    useProgress.getState().revealHint('t01-s1', 0)
    const s = useProgress.getState()
    expect(s.totalExp).toBe(10)
    expect(s.revealedHints['t01-s1']).toEqual([0])
  })
})

// ---------- 暂存草稿 ----------
describe('暂存', () => {
  it('保存/读取/丢弃', () => {
    useProgress.getState().saveDraft('t01-s1', 'print(1)', 'hash-a')
    expect(useProgress.getState().getDraft('t01-s1')).toEqual({ code: 'print(1)', srcHash: 'hash-a' })
    useProgress.getState().discardDraft('t01-s1')
    expect(useProgress.getState().getDraft('t01-s1')).toBeUndefined()
  })
})

// ---------- 持久化 ----------
describe('持久化', () => {
  it('partialize：lastUnlocked 不写入存储', () => {
    useProgress.getState().completeTask('t01', 40, false)
    expect(useProgress.getState().lastUnlocked.length).toBeGreaterThan(0)
    const raw = localStorage.getItem('llmquest:progress:v1')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)
    expect(persisted.state.lastUnlocked).toBeUndefined()
    expect(persisted.state.totalExp).toBe(60)
  })
})
