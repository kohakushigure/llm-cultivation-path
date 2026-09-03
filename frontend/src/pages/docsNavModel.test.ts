import { describe, it, expect } from 'vitest'
import {
  PAGES,
  JOURNEY,
  SECTION_LABELS,
  WIKI_NEXT_STEP,
  wikiSections,
  secLabel,
  tocAnchorsFor,
} from './docsNavModel'

describe('docsNavModel / 页表', () => {
  it('首页是新手村零基础概念扫盲, 随后是快速开始两页', () => {
    expect(PAGES[0].id).toBe('wiki:beginner')
    expect(PAGES[1].id).toBe('wiki:office-tools')
    expect(PAGES[2].id).toBe('wiki:coding-tools')
    expect(PAGES[3].id).toBe('start:install')
    expect(PAGES[4].id).toBe('start:path')
  })

  it('FAQ 是最后一页', () => {
    expect(PAGES[PAGES.length - 1].id).toBe('help:faq')
  })

  it('技术条目页数量 = techKB 全部条目(43)', () => {
    expect(PAGES.filter((p) => p.kind === 'tech')).toHaveLength(43)
  })

  it('JOURNEY 里登记的技术分组都能在 techKB 找到(防分组名打错导致页面丢失)', () => {
    const techPages = new Set(PAGES.filter((p) => p.kind === 'tech').map((p) => p.group))
    for (const j of JOURNEY) {
      for (const g of j.groups) {
        if (['新手村', '快速开始', 'FAQ'].includes(g)) continue
        expect(techPages.has(g), `分组「${g}」没有任何页面`).toBe(true)
      }
    }
  })

  it('页 id 全局唯一', () => {
    const ids = PAGES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('docsNavModel / wiki 小节', () => {
  it('零基础概念扫盲派生出 6 个小节, 且不含「下一步」', () => {
    expect(wikiSections('wiki:beginner')).toEqual([
      'LLM（大语言模型）是什么',
      'Token 与上下文窗口',
      'Prompt（提示词）：怎么说话 AI 才听得懂',
      'Agent / Skill / Harness',
      'API Key 是什么',
      'Vibe Coding（氛围编程）',
    ])
    expect(wikiSections('wiki:beginner')).not.toContain(WIKI_NEXT_STEP)
  })

  it('未知 wiki 页返回空数组', () => {
    expect(wikiSections('wiki:not-exist')).toEqual([])
  })
})

describe('docsNavModel / 短标题', () => {
  it('六个登记小节映射为短标题', () => {
    expect(secLabel('LLM（大语言模型）是什么')).toBe('LLM 大语言模型')
    expect(secLabel('Token 与上下文窗口')).toBe('Token 与 上下文')
    expect(secLabel('Prompt（提示词）：怎么说话 AI 才听得懂')).toBe('Prompt 提示词')
    expect(secLabel('Agent / Skill / Harness')).toBe('Agent/Skill/Harness')
    expect(secLabel('API Key 是什么')).toBe('API Key')
    expect(secLabel('Vibe Coding（氛围编程）')).toBe('Vibe Coding')
    expect(Object.keys(SECTION_LABELS)).toHaveLength(6)
  })

  it('未登记的节名原样返回', () => {
    expect(secLabel('别的什么节')).toBe('别的什么节')
  })
})

describe('docsNavModel / 页内目录', () => {
  it('wiki 页 TOC = 小节列表', () => {
    const page = PAGES[0]
    expect(tocAnchorsFor(page)).toEqual(wikiSections(page.id))
  })

  it('技术页 TOC 为固定五节', () => {
    const tech = PAGES.find((p) => p.kind === 'tech')
    expect(tech && tocAnchorsFor(tech)).toEqual(['介绍', 'API 要点', '安装', '官方文档', '用到的地方'])
  })

  it('起步页与 FAQ 页', () => {
    const install = PAGES.find((p) => p.kind === 'install')
    const path = PAGES.find((p) => p.kind === 'path')
    const faq = PAGES.find((p) => p.kind === 'faq')
    expect(install && tocAnchorsFor(install)).toEqual(['环境要求', '安装步骤', '启动'])
    expect(path && tocAnchorsFor(path)).toEqual(['八站一览'])
    expect(faq && tocAnchorsFor(faq)).toEqual([])
  })
})
