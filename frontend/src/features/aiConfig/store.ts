import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 全局 AI 配置(本地 localStorage 优先)。
 *
 * 两种联网课程额度来源:
 *  1. 站点共享额度(默认, 无需学习者 Key): 后端内嵌 Key 经代理转发,
 *     按 IP 滑动窗口限流; 由 /api/llm/status 探活得知是否开启。
 *  2. 学习者自备 Key(进阶, 无额度限制): 前端填一次自己的 DeepSeek Key,
 *     联网任务跑沙箱时注入容器 env, 直连 DeepSeek。
 */

// DeepSeek 为默认(便宜 + OpenAI 兼容接口)
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-v4-pro'

/** 后端 /api/llm/status 返回的共享额度信息。 */
export interface LlmSharedStatus {
  enabled: boolean
  sharedModel?: string
  budgetPerIp?: number
  budgetPerRun?: number
  budgetGlobal?: number
  windowSeconds?: number
  maxDistinctIpsPerHour?: number
}

interface AiConfigState {
  /** API key(明文存 localStorage, 本地优先, 不上传) */
  apiKey: string
  /** API 接口地址（固定为 DeepSeek 官方端点） */
  baseUrl: string
  /** 模型名 */
  model: string
  /** 服务器版访问口令（邀请码）；服务器启用时必须填写。 */
  accessCode: string
  /** 是否由当前服务器启用邀请码门禁；启动时查询（404 即视为关闭），不持久化。 */
  inviteRequired: boolean
  /** 站点共享额度状态(探活得到, 不持久化)。 */
  llmShared: LlmSharedStatus | null
  /** 配置弹窗是否打开(全局可控, 任何组件能触发) */
  modalOpen: boolean
}

interface AiConfigActions {
  setConfig: (cfg: Partial<Pick<AiConfigState, 'apiKey' | 'baseUrl' | 'model' | 'accessCode'>>) => void
  setInviteRequired: (required: boolean) => void
  setLlmShared: (status: LlmSharedStatus | null) => void
  /** 重置为默认值(清空 key) */
  reset: () => void
  /** 打开/关闭配置弹窗 */
  setModalOpen: (open: boolean) => void
}

type AiConfigStore = AiConfigState & AiConfigActions

const defaultState: AiConfigState = {
  apiKey: '',
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  accessCode: '',
  inviteRequired: false,
  llmShared: null,
  modalOpen: false,
}

export const useAiConfig = create<AiConfigStore>()(
  persist(
    (set) => ({
      ...defaultState,

      setConfig: (cfg) => set((s) => ({ ...s, ...cfg })),

      setInviteRequired: (inviteRequired) => set({ inviteRequired }),

      setLlmShared: (llmShared) => set({ llmShared }),

      reset: () => set({ ...defaultState }),

      setModalOpen: (open) => set({ modalOpen: open }),
    }),
    {
      name: 'llmquest-ai-config',
      version: 1,
      // modalOpen / inviteRequired / llmShared 不持久化
      partialize: (s) => ({
        apiKey: s.apiKey,
        baseUrl: s.baseUrl,
        model: s.model,
        accessCode: s.accessCode,
      }),
    },
  ),
)

/** 便捷选择器: 是否已配置自己的 DeepSeek Key(自备额度模式)。 */
export const useHasDeepSeekConfig = () =>
  useAiConfig((s) => {
    const baseUrl = s.baseUrl.trim().replace(/\/+$/, '')
    return Boolean(s.apiKey.trim()) && baseUrl === DEFAULT_BASE_URL && s.model.trim().startsWith('deepseek-')
  })

/** 站点共享额度是否开启。 */
export const useLlmSharedEnabled = () => useAiConfig((s) => Boolean(s.llmShared?.enabled))

/** 联网课程是否可用: 共享额度开启 或 学习者自带 Key。 */
export const useHasLlmAvailable = () =>
  useAiConfig((s) => Boolean(s.llmShared?.enabled) || Boolean(s.apiKey.trim()))

/** 全站门禁: 邀请码(服务器要求时) + 联网额度来源任一满足。 */
export const useHasSystemConfig = () =>
  useAiConfig((s) => {
    const hasInvite = !s.inviteRequired || Boolean(s.accessCode.trim())
    const hasLlm = Boolean(s.llmShared?.enabled) || Boolean(s.apiKey.trim())
    return hasInvite && hasLlm
  })

export { DEFAULT_BASE_URL, DEFAULT_MODEL }
