/**
 * validateStepFlow 编排测试 —— 只打公开接口，经注入的 deps 观察行为。
 *  seam 清单（用户 2026-08-25 确认）：
 *  1. 联网步骤无额度 → blocked/no-llm，不调沙箱
 *  2. 云端缺邀请码 → blocked/no-invite
 *  3. 沙箱规则步骤：代码指纹变了才重跑，没变复用上次输出
 *  4. 联网步骤沙箱退出码非 0 → 整体不通过 + 追加失败结果
 *  5. 服务端行为测试兜底：409 跳过；失败则卡关；非 409 错误卡关
 *  6. 非阻断规则失败只警告不卡关
 */
import { describe, expect, it, vi } from 'vitest'
import type { SandboxRunResponse, Step, ValidationRule } from '@shared/types'
import { strHash } from '@/utils/hash'
import { validateStepFlow, type ValidateFlowDeps, type ValidateFlowInput } from './flow'

const OK_OUTPUT: SandboxRunResponse = {
  stdout: '42\n',
  stderr: '',
  exitCode: 0,
  durationMs: 5,
  timedOut: false,
}

function makeStep(validation: ValidationRule[]): Step {
  return {
    id: 't01-s1',
    taskId: 't01',
    order: 1,
    title: '测试步骤',
    instruction: '',
    starterCode: '',
    solutionCode: '',
    hints: [],
    todoItems: [],
    codeSamples: [],
    terms: [],
    techStack: [],
    validation,
  }
}

function makeInput(overrides: Partial<ValidateFlowInput> = {}): ValidateFlowInput {
  return {
    code: "print('42')",
    step: makeStep([{ type: 'output_contains', message: '含 42', text: '42' }]),
    taskId: 't01',
    stepNeedsNetwork: false,
    llmAvailable: true,
    inviteRequired: false,
    accessCode: '',
    sandboxTimeout: 10,
    sandboxProfile: 'core',
    env: undefined,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<ValidateFlowDeps> = {}): ValidateFlowDeps {
  return {
    runSandbox: vi.fn(async () => OK_OUTPUT),
    runServerTest: vi.fn(async () => {
      throw new Error('409: 步骤尚未迁移行为测试')
    }),
    ...overrides,
  }
}

describe('validateStepFlow', () => {
  it('联网步骤无额度时拦截且不触达沙箱', async () => {
    const deps = makeDeps()
    const outcome = await validateStepFlow(
      makeInput({ stepNeedsNetwork: true, llmAvailable: false }),
      deps,
    )

    expect(outcome.kind).toBe('blocked')
    if (outcome.kind !== 'blocked') return
    expect(outcome.reason).toBe('no-llm')
    expect(deps.runSandbox).not.toHaveBeenCalled()
    expect(deps.runServerTest).not.toHaveBeenCalled()
  })

  it('云端缺邀请码时拦截', async () => {
    const deps = makeDeps()
    const outcome = await validateStepFlow(
      makeInput({ inviteRequired: true, accessCode: '  ' }),
      deps,
    )

    expect(outcome.kind).toBe('blocked')
    if (outcome.kind !== 'blocked') return
    expect(outcome.reason).toBe('no-invite')
    expect(deps.runSandbox).not.toHaveBeenCalled()
  })

  it('含沙箱规则的步骤在代码未变时复用上次输出，代码变了才重跑', async () => {
    const deps = makeDeps()
    // 第一次：无历史输出 → 必须跑
    const first = await validateStepFlow(makeInput(), deps)
    expect(deps.runSandbox).toHaveBeenCalledTimes(1)
    expect(first.kind).toBe('validated')

    // 第二次：代码指纹不变 → 不重跑
    const second = await validateStepFlow(
      makeInput({ lastOutput: OK_OUTPUT, lastRunCodeHash: strHash("print('42')") }),
      deps,
    )
    expect(deps.runSandbox).toHaveBeenCalledTimes(1)
    expect(second.kind).toBe('validated')

    // 第三次：代码变了 → 重跑
    await validateStepFlow(
      makeInput({
        code: "print('43')",
        lastOutput: OK_OUTPUT,
        lastRunCodeHash: strHash("print('42')"),
      }),
      deps,
    )
    expect(deps.runSandbox).toHaveBeenCalledTimes(2)
  })

  it('联网步骤沙箱退出码非 0 时整体不通过并追加失败结果', async () => {
    const failOutput: SandboxRunResponse = { ...OK_OUTPUT, exitCode: 1, stderr: 'boom' }
    const deps = makeDeps({ runSandbox: vi.fn(async () => failOutput) })
    const outcome = await validateStepFlow(
      makeInput({ stepNeedsNetwork: true }),
      deps,
    )

    expect(outcome.kind).toBe('validated')
    if (outcome.kind !== 'validated') return
    expect(outcome.result.allPassed).toBe(false)
    expect(outcome.result.results.some((r) => !r.passed && r.blocking !== false)).toBe(true)
  })

  it('服务端行为测试：409 未迁移不卡关，失败则卡关，非 409 错误也卡关', async () => {
    // 409 → 跳过，不卡关
    const notMigrated = await validateStepFlow(makeInput(), makeDeps())
    expect(notMigrated.kind).toBe('validated')
    if (notMigrated.kind !== 'validated') return
    expect(notMigrated.result.allPassed).toBe(true)

    // 服务端判定失败 → 卡关
    const failed = await validateStepFlow(
      makeInput(),
      makeDeps({
        runServerTest: vi.fn(async () => ({
          stepId: 't01-s1',
          passed: false,
          output: { ...OK_OUTPUT, stderr: 'assert failed' },
        })),
      }),
    )
    expect(failed.kind).toBe('validated')
    if (failed.kind !== 'validated') return
    expect(failed.result.allPassed).toBe(false)

    // 非 409 异常 → 卡关（服务不可用是阻断的）
    const broken = await validateStepFlow(
      makeInput(),
      makeDeps({
        runServerTest: vi.fn(async () => {
          throw new Error('500: 服务端错误')
        }),
      }),
    )
    expect(broken.kind).toBe('validated')
    if (broken.kind !== 'validated') return
    expect(broken.result.allPassed).toBe(false)
  })

  it('非阻断规则失败只警告不卡关', async () => {
    const step = makeStep([
      { type: 'output_contains', message: '应有 42', text: '42', blocking: false },
    ])
    const deps = makeDeps({ runSandbox: vi.fn(async () => ({ ...OK_OUTPUT, stdout: 'nothing\n' })) })
    const outcome = await validateStepFlow(makeInput({ step }), deps)

    expect(outcome.kind).toBe('validated')
    if (outcome.kind !== 'validated') return
    expect(outcome.result.allPassed).toBe(true)
    expect(outcome.result.results[0].passed).toBe(false)
  })
})
