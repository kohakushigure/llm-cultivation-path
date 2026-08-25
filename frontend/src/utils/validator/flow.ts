/**
 * 验证编排（深模块）——「通关一个步骤」的全部判断集中在这里。
 *
 * 职责：门禁（额度/邀请码）→ 是否需要新一轮沙箱运行 → 规则引擎 →
 * 联网步骤沙箱失败追加判定 → 服务端行为测试兜底。
 * 依赖（沙箱/服务端测试）全部注入，模块不自建依赖，UI 只消费返回值。
 *
 * 注意：追加的结果行由本模块（验证模块群的一部分）产生，
 * 渲染模块禁止自行伪造验证结果行（见 ADR-0006 边界说明）。
 */
import type {
  SandboxRunRequest,
  SandboxRunResponse,
  Step,
  StepValidationResponse,
  StepValidationResult,
} from '@shared/types'
import { strHash } from '@/utils/hash'
import { validateStep, stepNeedsSandboxRun } from './index'

export interface ValidateFlowInput {
  code: string
  step: Step
  taskId: string
  stepNeedsNetwork: boolean
  /** 试用额度开启 或 已填使用者私人 Key */
  llmAvailable: boolean
  inviteRequired: boolean
  accessCode: string
  sandboxTimeout: number
  sandboxProfile: 'core' | 'ml'
  /** 联网步骤的沙箱环境变量（私人 Key 等） */
  env?: Record<string, string>
  /** 上一次沙箱输出与对应代码指纹（用于跳过重复运行） */
  lastOutput?: SandboxRunResponse
  lastRunCodeHash?: string
}

export interface ValidateFlowDeps {
  runSandbox: (req: SandboxRunRequest) => Promise<SandboxRunResponse>
  runServerTest: (
    taskId: string,
    stepId: string,
    code: string,
    env?: Record<string, string>,
  ) => Promise<StepValidationResponse>
}

export type ValidateFlowOutcome =
  | { kind: 'blocked'; reason: 'no-llm' | 'no-invite'; output: SandboxRunResponse }
  | {
      kind: 'validated'
      result: StepValidationResult
      output?: SandboxRunResponse
      ranSandbox: boolean
      runCodeHash?: string
    }

function blockedOutput(text: string): SandboxRunResponse {
  return { stdout: '', stderr: text, exitCode: -1, durationMs: 0, timedOut: false }
}

/** 验证编排入口。UI 层只负责：blocked → 弹 AI 配置；validated → 渲染结果。 */
export async function validateStepFlow(
  input: ValidateFlowInput,
  deps: ValidateFlowDeps,
): Promise<ValidateFlowOutcome> {
  // 1. 门禁
  if (input.stepNeedsNetwork && !input.llmAvailable) {
    return {
      kind: 'blocked',
      reason: 'no-llm',
      output: blockedOutput('联网课程需要 API Key 或站点共享额度。请点击右上角齿轮配置。'),
    }
  }
  if (input.inviteRequired && !input.accessCode.trim()) {
    return {
      kind: 'blocked',
      reason: 'no-invite',
      output: blockedOutput('当前服务器需要邀请码，请点击右上角齿轮填写。'),
    }
  }

  // 2. 联网步骤必须用当前代码完成一次真实运行；其他步骤按规则决定，
  //    且代码指纹未变时复用上次输出
  let sandboxOutput = input.lastOutput
  let ranSandbox = false
  let runCodeHash = input.lastRunCodeHash
  const needsCurrentRun =
    (input.stepNeedsNetwork || stepNeedsSandboxRun(input.step)) &&
    (!sandboxOutput || input.lastRunCodeHash !== strHash(input.code))
  if (needsCurrentRun) {
    ranSandbox = true
    try {
      sandboxOutput = await deps.runSandbox({
        code: input.code,
        language: 'python',
        timeout: input.sandboxTimeout,
        needsNetwork: input.stepNeedsNetwork,
        env: input.env,
        sandboxProfile: input.sandboxProfile,
      })
    } catch (e) {
      sandboxOutput = blockedOutput(String(e))
      sandboxOutput.error = String(e)
    }
    runCodeHash = strHash(input.code)
  }

  // 3. 规则引擎
  const result = await validateStep({ code: input.code, step: input.step, sandboxOutput })

  // 4. 联网步骤的沙箱运行必须成功，否则整体不通过
  if (input.stepNeedsNetwork && sandboxOutput?.exitCode !== 0) {
    result.allPassed = false
    result.results.push({
      ruleIndex: result.results.length,
      ruleType: 'sandbox_run',
      passed: false,
      blocking: true,
      message: '必须用你的 DeepSeek Key 成功完成真实联网运行',
      details: '请检查 Key、账户余额、模型名和网络后重试。',
    })
  }

  // 5. 服务端行为测试兜底：已迁移 .test.py 的步骤以服务端 pytest 为最终判定；
  //    409 = 未迁移，跳过不影响即时反馈；其余异常视为不可用并卡关
  try {
    const authoritative = await deps.runServerTest(
      input.taskId,
      input.step.id,
      input.code,
      input.env,
    )
    result.results.push({
      ruleIndex: result.results.length,
      ruleType: 'unit_test',
      passed: authoritative.passed,
      blocking: true,
      message: authoritative.passed ? '服务端行为测试通过' : '服务端行为测试未通过',
      details: authoritative.output.stdout || authoritative.output.stderr || 'pytest 未返回输出',
    })
    if (!authoritative.passed) result.allPassed = false
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('409:')) {
      result.allPassed = false
      result.results.push({
        ruleIndex: result.results.length,
        ruleType: 'unit_test',
        passed: false,
        blocking: true,
        message: '服务端行为测试暂时不可用',
        details: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { kind: 'validated', result, output: sandboxOutput, ranSandbox, runCodeHash }
}
