/**
 * 验证规则引擎刻画测试（工单 #12）——测"现在的行为"，只打公开接口。
 * 断言值全部来自手写代码片段与手写预期（独立已知值），不复述实现。
 * 刻画中发现的疑似 bug 见 issue #20（非法正则抛异常）/ #21（== 误判 assign），
 * 本文件锁定的是现状，不是期望态。
 */
import { describe, expect, it } from 'vitest'
import type { SandboxOutput, Step, ValidationRule } from '@shared/types'
import { checkRule, validateStep, stepNeedsSandboxRun } from './index'
import { parsePythonLite } from './astLite'

function makeStep(validation: ValidationRule[]): Step {
  return {
    id: 't01-s1', taskId: 't01', order: 1, title: 't', instruction: '',
    starterCode: '', solutionCode: '', hints: [], todoItems: [],
    codeSamples: [], terms: [], techStack: [], validation,
  }
}

const OUT: SandboxOutput = { stdout: '答案: 42\n', stderr: '', exitCode: 0, durationMs: 3, timedOut: false }

// ---------- api_call_exists ----------
describe('api_call_exists', () => {
  it('统计目标 API 出现次数并比较 minCount', () => {
    // 'OpenAI' 共出现 3 次：import 行 1 次 + 两次构造调用
    const code = 'from openai import OpenAI\nclient = OpenAI()\nclient2 = OpenAI()'
    expect(checkRule({ type: 'api_call_exists', api: 'OpenAI', minCount: 3, message: 'm' }, { code, step: makeStep([]) }).passed).toBe(true)
    expect(checkRule({ type: 'api_call_exists', api: 'OpenAI', minCount: 4, message: 'm' }, { code, step: makeStep([]) }).passed).toBe(false)
  })

  it('api 名含正则特殊字符时按字面量匹配', () => {
    const code = 'x = openai.chat.completions.create()'
    expect(checkRule({ type: 'api_call_exists', api: 'openai.chat.completions.create', message: 'm' }, { code, step: makeStep([]) }).passed).toBe(true)
    // 若未转义，'.' 会匹配任意字符导致误命中
    expect(checkRule({ type: 'api_call_exists', api: 'openaiXchatXcompletionsXcreate', message: 'm' }, { code, step: makeStep([]) }).passed).toBe(false)
  })
})

// ---------- placeholder_filled ----------
describe('placeholder_filled', () => {
  const ph = '# TODO'
  it('TODO 后紧跟有效代码 → 已填', () => {
    const code = '# TODO: 创建客户端\nclient = OpenAI()'
    expect(checkRule({ type: 'placeholder_filled', placeholder: ph, message: 'm' }, { code, step: makeStep([]) }).passed).toBe(true)
  })

  it('TODO 后是空行/注释直到文件尾 → 未填', () => {
    const code = '# TODO: 创建客户端\n\n# 注释不算填写'
    expect(checkRule({ type: 'placeholder_filled', placeholder: ph, message: 'm' }, { code, step: makeStep([]) }).passed).toBe(false)
  })

  it('TODO 后是纯占位符（pass / ... / None / 空串字面量）→ 未填', () => {
    for (const filler of ['pass', '...', 'None', "''"]) {
      const code = `# TODO: 补全\n${filler}`
      expect(checkRule({ type: 'placeholder_filled', placeholder: ph, message: 'm' }, { code, step: makeStep([]) }).passed).toBe(false)
    }
  })

  it('多个 TODO 中有一个未填 → 整体未填', () => {
    const code = '# TODO: 一\nx = 1\n# TODO: 二\npass'
    expect(checkRule({ type: 'placeholder_filled', placeholder: ph, message: 'm' }, { code, step: makeStep([]) }).passed).toBe(false)
  })

  it('代码不含 placeholder 标记 → 直接通过', () => {
    expect(checkRule({ type: 'placeholder_filled', placeholder: ph, message: 'm' }, { code: 'x = 1', step: makeStep([]) }).passed).toBe(true)
  })
})

// ---------- regex_in_code ----------
describe('regex_in_code', () => {
  it('按 pattern 匹配代码，flags 生效', () => {
    const code = 'MODEL = "deepseek-v4-pro"'
    expect(checkRule({ type: 'regex_in_code', pattern: 'deepseek', message: 'm' }, { code, step: makeStep([]) }).passed).toBe(true)
    expect(checkRule({ type: 'regex_in_code', pattern: 'DEEPSEEK', message: 'm' }, { code, step: makeStep([]) }).passed).toBe(false)
    expect(checkRule({ type: 'regex_in_code', pattern: 'DEEPSEEK', flags: 'i', message: 'm' }, { code, step: makeStep([]) }).passed).toBe(true)
  })

  it('现状刻画：非法 pattern 直接抛异常（疑似 bug，见 issue #20）', () => {
    expect(() =>
      checkRule({ type: 'regex_in_code', pattern: '[', message: 'm' }, { code: 'x', step: makeStep([]) }),
    ).toThrow()
  })
})

// ---------- output_contains / output_matches / output_equals ----------
describe('output_* 系列', () => {
  it('无沙箱输出时失败并提示需先运行', () => {
    const r = checkRule({ type: 'output_contains', text: '42', message: 'm' }, { code: '', step: makeStep([]) })
    expect(r.passed).toBe(false)
  })

  it('output_contains 默认大小写敏感，可关闭', () => {
    const ctx = { code: '', step: makeStep([]), sandboxOutput: OUT }
    expect(checkRule({ type: 'output_contains', text: '答案', message: 'm' }, ctx).passed).toBe(true)
    expect(checkRule({ type: 'output_contains', text: '答案: 42', message: 'm' }, ctx).passed).toBe(true)
    expect(checkRule({ type: 'output_contains', text: '答案: 43', message: 'm' }, ctx).passed).toBe(false)
    // caseSensitive: false → 双方转小写后比较
    expect(
      checkRule({ type: 'output_contains', text: 'ANSWER', caseSensitive: false, message: 'm' },
        { code: '', step: makeStep([]), sandboxOutput: { ...OUT, stdout: 'answer ok' } }).passed,
    ).toBe(true)
  })

  it('output_matches 按正则匹配 stdout', () => {
    const ctx = { code: '', step: makeStep([]), sandboxOutput: OUT }
    expect(checkRule({ type: 'output_matches', pattern: '答案: \\d+', message: 'm' }, ctx).passed).toBe(true)
    expect(checkRule({ type: 'output_matches', pattern: '^答案$', message: 'm' }, ctx).passed).toBe(false)
  })

  it('output_equals 默认 trim 后精确比较', () => {
    const ctx = { code: '', step: makeStep([]), sandboxOutput: { ...OUT, stdout: '  hello \n' } }
    expect(checkRule({ type: 'output_equals', expected: 'hello', message: 'm' }, ctx).passed).toBe(true)
    expect(checkRule({ type: 'output_equals', expected: ' hello ', trim: false, message: 'm' }, ctx).passed).toBe(false)
    expect(checkRule({ type: 'output_equals', expected: 'HELLO', ignoreCase: true, message: 'm' }, ctx).passed).toBe(true)
  })
})

// ---------- unit_test ----------
describe('unit_test', () => {
  it('退出码 0 通过，非 0 失败，无输出失败', () => {
    const ctx = { code: '', step: makeStep([]) }
    expect(checkRule({ type: 'unit_test', testCode: 'def test_x(): pass', message: 'm' }, { ...ctx, sandboxOutput: OUT }).passed).toBe(true)
    expect(checkRule({ type: 'unit_test', testCode: 'def test_x(): pass', message: 'm' }, { ...ctx, sandboxOutput: { ...OUT, exitCode: 1 } }).passed).toBe(false)
    expect(checkRule({ type: 'unit_test', testCode: 'def test_x(): pass', message: 'm' }, ctx).passed).toBe(false)
  })
})

// ---------- sandbox_run ----------
describe('sandbox_run', () => {
  const ctx = { code: '', step: makeStep([]), sandboxOutput: OUT }
  it('无附加条件时跑通即过', () => {
    expect(checkRule({ type: 'sandbox_run', message: 'm' }, ctx).passed).toBe(true)
  })

  it('stderrMustBeEmpty / expectedExitCode 各自独立判定并汇总 details', () => {
    const dirty = { ...OUT, stderr: 'warn', exitCode: 2 }
    const r = checkRule(
      { type: 'sandbox_run', stderrMustBeEmpty: true, expectedExitCode: 0, message: 'm' },
      { code: '', step: makeStep([]), sandboxOutput: dirty },
    )
    expect(r.passed).toBe(false)
    expect(r.details).toBe('stderr 非空; 退出码 2, 期望 0')
  })

  it('expectedStdout 按正则匹配', () => {
    expect(checkRule({ type: 'sandbox_run', expectedStdout: '答案.*', message: 'm' }, ctx).passed).toBe(true)
    expect(checkRule({ type: 'sandbox_run', expectedStdout: '错误.*', message: 'm' }, ctx).passed).toBe(false)
  })

  it('expectedStdout 为非法正则时回退精确比较', () => {
    const exact = { ...OUT, stdout: '[not regex]\n' }
    expect(
      checkRule({ type: 'sandbox_run', expectedStdout: '[not regex]', message: 'm' }, { code: '', step: makeStep([]), sandboxOutput: exact }).passed,
    ).toBe(true)
  })
})

// ---------- ast_structure ----------
describe('ast_structure', () => {
  const code = [
    'import os.path',
    'from openai import OpenAI',
    'LIMIT = 10',
    'class Client:',
    '    def send(self):',
    '        pass',
    'def helper():',
    '    pass',
    'client = OpenAI()',
  ].join('\n')

  it('识别 import / import_from / class_def / 函数与调用', () => {
    const step = makeStep([])
    expect(checkRule({ type: 'ast_structure', astType: 'import', name: 'os', message: 'm' }, { code, step }).passed).toBe(true)
    expect(checkRule({ type: 'ast_structure', astType: 'import_from', name: 'openai', message: 'm' }, { code, step }).passed).toBe(true)
    expect(checkRule({ type: 'ast_structure', astType: 'class_def', name: 'Client', message: 'm' }, { code, step }).passed).toBe(true)
    // 类内方法计入 function_def：helper + send = 2
    expect(checkRule({ type: 'ast_structure', astType: 'function_def', minCount: 2, message: 'm' }, { code, step }).passed).toBe(true)
    expect(checkRule({ type: 'ast_structure', astType: 'function_def', minCount: 3, message: 'm' }, { code, step }).passed).toBe(false)
  })

  it('name 支持精确匹配与点号前缀匹配', () => {
    const step = makeStep([])
    expect(checkRule({ type: 'ast_structure', astType: 'call', name: 'OpenAI', message: 'm' }, { code, step }).passed).toBe(true)
    // 前缀匹配：openai 命中 openai.chat...
    const chain = 'openai.chat.completions.create()'
    expect(checkRule({ type: 'ast_structure', astType: 'call', name: 'openai.chat', message: 'm' }, { code: chain, step }).passed).toBe(true)
    // 但不允许裸前缀（opena 不得命中 openai）
    expect(checkRule({ type: 'ast_structure', astType: 'call', name: 'opena', message: 'm' }, { code: chain, step }).passed).toBe(false)
  })
})

// ---------- parsePythonLite ----------
describe('parsePythonLite', () => {
  it('跳过空行与注释行', () => {
    expect(parsePythonLite('# 注释\n\n   \n')).toEqual([])
  })

  it('async def 与 def 区分', () => {
    const nodes = parsePythonLite('async def f():\n    pass\ndef g():\n    pass')
    expect(nodes.map((n) => n.type)).toEqual(['async_function_def', 'function_def'])
  })

  it('import 取顶层包名，from import 保留完整模块路径', () => {
    const nodes = parsePythonLite('import os.path\nfrom openai import OpenAI')
    expect(nodes[0]).toMatchObject({ type: 'import', name: 'os' })
    expect(nodes[1]).toMatchObject({ type: 'import_from', name: 'openai' })
  })

  it('调用检测排除关键字（print/if 等不算 call 节点）', () => {
    const nodes = parsePythonLite('print("hi")\nif True:\n    pass')
    expect(nodes.filter((n) => n.type === 'call').map((n) => n.name)).toEqual([])
  })

  it('现状刻画：比较运算 == 被误判为 assign（疑似 bug，见 issue #21）', () => {
    const nodes = parsePythonLite('x == 1')
    expect(nodes.some((n) => n.type === 'assign' && n.name === 'x')).toBe(true)
  })
})

// ---------- validateStep 汇总 ----------
describe('validateStep', () => {
  it('全部通过才 allPassed；blocking 缺省视为阻断', async () => {
    const step = makeStep([
      { type: 'placeholder_filled', placeholder: '# TODO', message: 'a' },
      { type: 'api_call_exists', api: 'OpenAI', message: 'b' },
    ])
    const r = await validateStep({ code: 'x = OpenAI()', step })
    expect(r.allPassed).toBe(true)
  })

  it('非阻断规则失败不卡关，阻断规则失败卡关', async () => {
    const warnOnly = makeStep([
      { type: 'api_call_exists', api: 'Nope', message: 'a', blocking: false },
    ])
    expect((await validateStep({ code: 'x = 1', step: warnOnly })).allPassed).toBe(true)

    const blocking = makeStep([{ type: 'api_call_exists', api: 'Nope', message: 'a' }])
    expect((await validateStep({ code: 'x = 1', step: blocking })).allPassed).toBe(false)
  })

  it('ruleIndex 与规则顺序一致', async () => {
    const step = makeStep([
      { type: 'api_call_exists', api: 'A', message: 'a' },
      { type: 'api_call_exists', api: 'B', message: 'b' },
    ])
    const r = await validateStep({ code: 'A B', step })
    expect(r.results.map((x) => x.ruleIndex)).toEqual([0, 1])
  })
})

// ---------- stepNeedsSandboxRun ----------
describe('stepNeedsSandboxRun', () => {
  it('五类沙箱规则返回 true，其余 false', () => {
    for (const t of ['output_contains', 'output_matches', 'output_equals', 'unit_test', 'sandbox_run'] as const) {
      const rule = { type: t, message: 'm' } as ValidationRule
      expect(stepNeedsSandboxRun(makeStep([rule]))).toBe(true)
    }
    for (const t of ['api_call_exists', 'placeholder_filled', 'regex_in_code', 'ast_structure'] as const) {
      const rule = { type: t, message: 'm' } as ValidationRule
      expect(stepNeedsSandboxRun(makeStep([rule]))).toBe(false)
    }
  })
})
