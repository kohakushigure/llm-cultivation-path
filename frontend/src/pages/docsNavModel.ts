/**
 * /docs 导航数据模型 —— 从 Docs.tsx 抽出的纯逻辑模块(可测, 见 docsNavModel.test.ts)。
 * 旅程式分类(ADR-0012)、页表、wiki 小节派生、短标题映射都在此。
 */
import { TECH_GROUPS, type TechInfo } from '@/data/techKB'
import beginnerMd from '@/content/wiki/beginner-basics.md?raw'
import officeToolsMd from '@/content/wiki/office-tools.md?raw'
import codingToolsMd from '@/content/wiki/coding-tools.md?raw'

export const WIKI_MD: Record<string, string> = {
  beginner: beginnerMd,
  'office-tools': officeToolsMd,
  'coding-tools': codingToolsMd,
}

export const WIKI_PAGES = [
  { id: 'wiki:beginner', group: '新手村', title: '零基础概念扫盲' },
  { id: 'wiki:office-tools', group: '新手村', title: 'AI 办公工具推荐' },
  { id: 'wiki:coding-tools', group: '新手村', title: 'AI 编程工具推荐' },
]

export const FAQS: [string, string][] = [
  ['需要什么基础?', '会 Python 基础语法即可。修炼之路从第一次 LLM API 调用开始,循序渐进到 Agent、RAG、甚至自建小模型。'],
  ['需要配置什么?', '一个 OpenAI 兼容 API key(支持 DeepSeek/通义/Moonshot 等)。代码执行沙箱需要 Docker(可选,没有则部分任务降级为前端验证)。'],
  ['前端后端端口分别是多少?', '前端 3200、后端 4200。在 vite.config.ts(server.port+proxy) 与 backend/app/config.py(backend_port) 配置,.env 可覆盖。'],
  ['进度会丢失吗?', '不会。进度存在浏览器 localStorage,无需登录。个人中心页支持导出/导入进度 JSON,方便迁移设备。'],
  ['代码会在哪运行?', '默认前端智能验证(检查代码结构/API 调用),关键任务可点「运行」调后端 Docker 沙箱真实执行,看真实 stdout/stderr。沙箱隔离网络/只读/资源限制,安全。'],
  ['「完整代码参考」为什么点不开?', '参考代码默认锁定,先点一次「运行」或「验证」后解锁——鼓励先自己动手写,再对照参考。'],
  ['能换别的模型吗?', '能。接口完全兼容 OpenAI SDK,改导航栏 ⚙️ 的 base_url + model 即可切换 DeepSeek/通义/Moonshot/OpenAI。默认 deepseek-v4-pro。'],
  ['报错 401 / 429 / 5xx 是什么意思?', '401 = Key 失效或填错(回 ⚙️ 检查是否复制完整/过期);429 = 请求过密被限流或额度用尽(去控制台充值);5xx = 服务端自身出错/过载,重试最有效;连接失败/超时 = 网络不通或 BASE_URL 打错。'],
]

export type Page =
  | { id: string; journey: string; group: string; title: string; kind: 'wiki' }
  | { id: string; journey: string; group: string; title: string; kind: 'install' | 'path' | 'faq' }
  | { id: string; journey: string; group: string; title: string; kind: 'tech'; tech: TechInfo }

/** 旅程式分类(ADR-0012): 起步 → 核心概念 → SDK 与模型 → 框架 → RAG → Agent → 工程化 → 帮助 */
export const JOURNEY: { label: string; groups: string[] }[] = [
  { label: '起步', groups: ['新手村', '快速开始'] },
  { label: '核心概念', groups: ['额外知识点'] },
  { label: 'SDK 与模型', groups: ['LLM SDK 与模型调用'] },
  { label: '框架', groups: ['LLM 应用框架'] },
  { label: 'RAG', groups: ['向量检索与 RAG'] },
  { label: 'Agent', groups: ['Agent 与多 Agent 编排'] },
  { label: '工程化', groups: ['工程化与可观测', '部署与上线', '数据计算与可视化', 'Python 标准库', '其他工具'] },
  { label: '帮助', groups: ['FAQ'] },
]

function buildPages(): Page[] {
  const pages: Page[] = []
  for (const w of WIKI_PAGES) pages.push({ ...w, journey: '起步', kind: 'wiki' })
  pages.push({ id: 'start:install', journey: '起步', group: '快速开始', title: '安装与配置', kind: 'install' })
  pages.push({ id: 'start:path', journey: '起步', group: '快速开始', title: '学习路径', kind: 'path' })
  for (const j of JOURNEY.slice(1)) {
    for (const gtitle of j.groups) {
      if (gtitle === 'FAQ') {
        pages.push({ id: 'help:faq', journey: '帮助', group: 'FAQ', title: 'FAQ 常见问题', kind: 'faq' })
        continue
      }
      const g = TECH_GROUPS.find((x) => x.title === gtitle)
      for (const t of g?.techs ?? []) {
        pages.push({ id: `tech:${gtitle}:${t.name}`, journey: j.label, group: gtitle, title: t.name, kind: 'tech', tech: t })
      }
    }
  }
  return pages
}

/** 全部页面(上一页/下一页顺序) */
export const PAGES = buildPages()

/** 四级导航/TOC 短标题(只改导航显示, 正文标题不动) */
export const SECTION_LABELS: Record<string, string> = {
  'LLM（大语言模型）是什么': 'LLM 大语言模型',
  'Token 与上下文窗口': 'Token 与 上下文',
  'Prompt（提示词）：怎么说话 AI 才听得懂': 'Prompt 提示词',
  'Agent / Skill / Harness': 'Agent/Skill/Harness',
  'API Key 是什么': 'API Key',
  'Vibe Coding（氛围编程）': 'Vibe Coding',
}

/** 「下一步」小节渲染为提醒框, 不进导航/TOC */
export const WIKI_NEXT_STEP = '下一步'

/** wiki 页的四级小节(从 md 的 h2 派生, 不硬编码; 剔除「下一步」) */
export function wikiSections(pageId: string): string[] {
  return (WIKI_MD[pageId.replace('wiki:', '')] ?? '')
    .split(/^## /m)
    .slice(1)
    .map((p) => p.slice(0, p.indexOf('\n')).trim())
    .filter((t) => t !== WIKI_NEXT_STEP)
}

/** 导航/TOC 显示用短标题; 未登记的节名原样返回 */
export function secLabel(section: string): string {
  return SECTION_LABELS[section] ?? section
}

/** 页内目录锚点: wiki 页取 md 小节; 技术页/起步页取固定节 */
export function tocAnchorsFor(page: Page): string[] {
  if (page.kind === 'wiki') return wikiSections(page.id)
  if (page.kind === 'tech') return ['介绍', 'API 要点', '安装', '官方文档', '用到的地方']
  if (page.kind === 'install') return ['环境要求', '安装步骤', '启动']
  if (page.kind === 'path') return ['八站一览']
  return []
}
