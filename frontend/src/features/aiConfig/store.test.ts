// @vitest-environment jsdom
/**
 * aiConfig store 刻画测试（工单 #32）——测"现在的行为"，只打公开接口。
 * 边界：localStorage 用 jsdom 真实实现；选择器经 renderHook 打公开 hook 接口。
 * 每用例重置 store + 清存储。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  useAiConfig,
  useHasDeepSeekConfig,
  useLlmSharedEnabled,
  useHasLlmAvailable,
  useHasSystemConfig,
} from './store'

beforeEach(() => {
  localStorage.clear()
  useAiConfig.getState().reset()
})

// ---------- setConfig / reset ----------
describe('配置读写', () => {
  it('setConfig 部分更新，未给字段保持原值', () => {
    useAiConfig.getState().setConfig({ apiKey: 'sk-test' })
    const s = useAiConfig.getState()
    expect(s.apiKey).toBe('sk-test')
    expect(s.baseUrl).toBe('https://api.deepseek.com')
    expect(s.model).toBe('deepseek-v4-pro')
  })

  it('reset 清空并恢复默认', () => {
    useAiConfig.getState().setConfig({ apiKey: 'sk-test', model: 'deepseek-v4-flash' })
    useAiConfig.getState().setModalOpen(true)
    useAiConfig.getState().reset()
    const s = useAiConfig.getState()
    expect(s.apiKey).toBe('')
    expect(s.model).toBe('deepseek-v4-pro')
    expect(s.modalOpen).toBe(false)
  })
})

// ---------- 持久化 ----------
describe('持久化', () => {
  it('只持久化 apiKey/baseUrl/model/accessCode 四字段', () => {
    useAiConfig.getState().setConfig({ apiKey: 'sk-test', accessCode: 'realm-1' })
    useAiConfig.getState().setModalOpen(true)
    act(() => useAiConfig.getState().setInviteRequired(true))
    act(() => useAiConfig.getState().setLlmShared({ enabled: true }))

    const raw = localStorage.getItem('llmquest-ai-config')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!).state
    expect(persisted.apiKey).toBe('sk-test')
    expect(persisted.accessCode).toBe('realm-1')
    expect(persisted.modalOpen).toBeUndefined()
    expect(persisted.inviteRequired).toBeUndefined()
    expect(persisted.llmShared).toBeUndefined()
  })
})

// ---------- 额度与门禁选择器 ----------
describe('额度与门禁', () => {
  it('useHasDeepSeekConfig：私人 Key 模式三要素齐备才算', () => {
    const { result } = renderHook(() => useHasDeepSeekConfig())
    expect(result.current).toBe(false)

    act(() => useAiConfig.getState().setConfig({ apiKey: 'sk-x' }))
    expect(result.current).toBe(true)

    act(() => useAiConfig.getState().setConfig({ model: 'gpt-4o' }))
    expect(result.current).toBe(false) // 非 DeepSeek 模型不算

    act(() => useAiConfig.getState().setConfig({ model: 'deepseek-v4-pro', baseUrl: 'https://example.com' }))
    expect(result.current).toBe(false) // 非官方端点不算
  })

  it('useHasLlmAvailable：试用额度开启 或 私人 Key 任一满足', () => {
    const { result } = renderHook(() => useHasLlmAvailable())
    expect(result.current).toBe(false) // 都无

    act(() => useAiConfig.getState().setLlmShared({ enabled: true }))
    expect(result.current).toBe(true) // 试用额度开

    act(() => useAiConfig.getState().setLlmShared(null))
    act(() => useAiConfig.getState().setConfig({ apiKey: 'sk-x' }))
    expect(result.current).toBe(true) // 私人 Key

    act(() => useAiConfig.getState().setLlmShared({ enabled: true }))
    expect(result.current).toBe(true) // 两者都有
  })

  it('useLlmSharedEnabled：null / disabled / enabled 三态', () => {
    const { result } = renderHook(() => useLlmSharedEnabled())
    expect(result.current).toBe(false)
    act(() => useAiConfig.getState().setLlmShared({ enabled: false }))
    expect(result.current).toBe(false)
    act(() => useAiConfig.getState().setLlmShared({ enabled: true }))
    expect(result.current).toBe(true)
  })

  it('useHasSystemConfig：邀请码门禁 × 额度来源的全组合', () => {
    const { result } = renderHook(() => useHasSystemConfig())
    expect(result.current).toBe(false) // 无额度

    act(() => useAiConfig.getState().setLlmShared({ enabled: true }))
    expect(result.current).toBe(true) // 本地版（无邀请码门禁）+ 有额度

    act(() => useAiConfig.getState().setInviteRequired(true))
    expect(result.current).toBe(false) // 云端要求邀请码但未填

    act(() => useAiConfig.getState().setConfig({ accessCode: 'realm-1' }))
    expect(result.current).toBe(true) // 邀请码 + 额度齐备

    act(() => useAiConfig.getState().setLlmShared(null)) // 撤掉额度
    expect(result.current).toBe(false) // 有邀请码但无额度仍不行
  })
})
