import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 文档页主题（浅色/深色）。默认浅色（全站浅色基调是拍板决策），深色仅作用于 /docs。 */
interface ThemeStore {
  dark: boolean
  toggle: () => void
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set) => ({
      dark: false,
      toggle: () => set((s) => ({ dark: !s.dark })),
    }),
    { name: 'llmquest-docs-theme' },
  ),
)
