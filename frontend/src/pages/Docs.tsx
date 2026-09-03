/**
 * /docs 文档页(2026-09-01 扶正, ADR-0012 三栏版式; 旧版保留在 /docs-old)。
 * 三栏: 左旅程导航树 / 中内容(面包屑+正文+上一页/下一页) / 右页内 TOC。
 * wiki 页带四级小节导航(可折叠、短标题、阅读高亮 scroll-spy, 机制沿用旧版 Docs)。
 * 逻辑模块在 ./docsNavModel(可测)。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge, CodeBlock } from '@/components/ui'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useCourse } from '@/features/course/store'
import { useTheme } from '@/features/theme/store'
import type { TechInfo } from '@/data/techKB'
import {
  FAQS, JOURNEY, PAGES, WIKI_MD, WIKI_NEXT_STEP,
  secLabel, tocAnchorsFor, wikiSections,
} from './docsNavModel'

/* ================= 内容渲染 ================= */

const WIKI_IMG_SIZE: Record<string, [number, number]> = {
  'ai-concepts.png': [4096, 2304],
  'agent-arch.png': [4096, 2304],
  'workbuddy.png': [1920, 1020],
  'kimicode-start.png': [1336, 404],
  'kimicode-run.png': [1479, 760],
}

function MdImg({ src, alt }: { src?: string; alt?: string }) {
  const base = import.meta.env.BASE_URL
  const file = String(src).split('/').pop() ?? ''
  const size = WIKI_IMG_SIZE[file]
  return (
    <img
      src={`${base}${String(src).replace(/^\//, '')}`}
      alt={alt}
      width={size?.[0]}
      height={size?.[1]}
      className="h-auto max-w-full rounded-lg border border-slate-200 dark:border-slate-700"
    />
  )
}

/** wiki 页: markdown 全文渲染, h2 小节带锚点供 TOC + 四级导航; 正在阅读的小节高亮(沿用原版 Docs 机制)。 */
function WikiContent({ id, activeAnchor }: { id: string; activeAnchor: string }) {
  const md = WIKI_MD[id.replace('wiki:', '')] ?? ''
  const parts = md.split(/^## /m)
  return (
    <div className="markdown-body max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: MdImg }}>{parts[0]}</ReactMarkdown>
      {parts.slice(1).map((p) => {
        const nl = p.indexOf('\n')
        const title = p.slice(0, nl).trim()
        const body = p.slice(nl + 1)
        if (title === WIKI_NEXT_STEP) {
          return (
            <div key={title} className="mt-8 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-400/30 dark:bg-amber-500/10">
              <span className="text-2xl leading-none" aria-hidden>😊</span>
              <div className="markdown-body max-w-none text-[15px] font-medium text-amber-900 dark:text-amber-100">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </div>
            </div>
          )
        }
        const highlighted = activeAnchor === title
        return (
          <div
            key={title}
            id={`sec-${title}`}
            data-anchor-id={title}
            className={`mb-8 scroll-mt-28 rounded-lg p-5 transition-colors duration-300 ${highlighted ? 'bg-brand-50/60 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-400/40' : ''}`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: MdImg }}>{`## ${p}`}</ReactMarkdown>
          </div>
        )
      })}
    </div>
  )
}

/** 技术条目页: 介绍/API 要点/安装/官方文档/用到的地方(真实聚合课程树)。 */
function TechContent({ tech }: { tech: TechInfo }) {
  const course = useCourse((s) => s.course)
  const loadCourse = useCourse((s) => s.loadCourse)
  const usedIn = useMemo(() => {
    if (!course) { loadCourse(); return [] }
    const keys = tech.matchKeys.map((k) => k.toLowerCase())
    const hits: { taskId: string; taskTitle: string }[] = []
    for (const ch of course.chapters)
      for (const t of ch.tasks)
        if (t.steps.some((s) => s.techStack.some((x) => keys.includes(x.name.toLowerCase()))))
          hits.push({ taskId: t.id, taskTitle: t.title })
    return hits
  }, [course, loadCourse, tech])
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">{tech.name}</h1>
      <div className="mt-3"><Badge color="blue">{tech.category}</Badge></div>
      <h2 id="sec-介绍" data-anchor-id="介绍" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">介绍</h2>
      <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">{tech.description}</p>
      <h2 id="sec-API 要点" data-anchor-id="API 要点" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">API 要点</h2>
      <div className="mt-3"><CodeBlock language="python" code={tech.apiPoints} /></div>
      <h2 id="sec-安装" data-anchor-id="安装" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">安装</h2>
      <div className="mt-3"><CodeBlock language="bash" code={tech.installHint} /></div>
      <h2 id="sec-官方文档" data-anchor-id="官方文档" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">官方文档</h2>
      <p className="mt-3">
        <a href={tech.officialUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-bold text-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-slate-800">
          {tech.officialUrl} ↗
        </a>
      </p>
      <h2 id="sec-用到的地方" data-anchor-id="用到的地方" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">修炼之路中用到的地方</h2>
      {usedIn.length ? (
        <ul className="mt-3 space-y-1.5">
          {usedIn.map((h) => (
            <li key={h.taskId} className="text-sm text-slate-600 dark:text-slate-300">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-400 align-middle" />
              {h.taskTitle} <span className="text-xs text-slate-400">({h.taskId})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">（课程树加载后聚合展示）</p>
      )}
    </div>
  )
}

function InstallContent() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">安装与配置</h1>
      <h2 id="sec-环境要求" data-anchor-id="环境要求" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">环境要求</h2>
      <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">Node.js 20+（pnpm 经 corepack）、Python 3.12+；Docker 可选（沙箱真实运行用）。</p>
      <h2 id="sec-安装步骤" data-anchor-id="安装步骤" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">安装步骤</h2>
      <div className="mt-3"><CodeBlock language="bash" code={'corepack pnpm install\ncd backend && pip install -e ".[dev]"\ncp .env.example .env  # 填入你自己的 DeepSeek Key'} /></div>
      <h2 id="sec-启动" data-anchor-id="启动" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">启动</h2>
      <div className="mt-3"><CodeBlock language="bash" code={'cd frontend && corepack pnpm dev            # 前端 3200\ncd backend && uvicorn app.main:app --port 4200  # 后端 4200'} /></div>
    </div>
  )
}

function PathContent() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">学习路径</h1>
      <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">八个章节组成一条升级路线，从第一次 API 调用到自建小模型。建议按顺序推进，每章都有明确的项目产出。</p>
      <h2 id="sec-八站一览" data-anchor-id="八站一览" className="mt-8 scroll-mt-24 border-t border-slate-200 pt-6 text-xl font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100">八站一览</h2>
      <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">01 项目起步 · LLM 基础 → 02 LangChain 架构 → 03 RAG 检索增强 → 04 Agent 智能体 → 05 Harness 工程 → 06 多 Agent 协作 → 07 自建小模型 → 08 毕业设计。</p>
    </div>
  )
}

function FaqContent() {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">FAQ 常见问题</h1>
      <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">
        {FAQS.map(([q, a]) => (
          <div key={q} className="py-4">
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{q}</h4>
            <p className="mt-1.5 leading-relaxed text-slate-600 dark:text-slate-300">{a}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================= 页面主体 ================= */

/** PROTOTYPE /docs 重做预览: 三栏(旅程导航树 + 内容 + 页内 TOC) + 面包屑 + 翻页。 */
export function Docs() {
  const [pageId, setPageId] = useState(PAGES[0].id)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [activeAnchor, setActiveAnchor] = useState('')
  const dark = useTheme((s) => s.dark)
  const idx = PAGES.findIndex((p) => p.id === pageId)
  const page = PAGES[idx]
  const asideRef = useRef<HTMLElement | null>(null)
  const scrollToken = useRef(0)

  // scroll-spy(沿用原版 Docs 机制): 判定线 = 视口顶部向下 25%, 内容块顶滚过线即视为正在阅读
  useEffect(() => {
    let ticking = false
    const compute = () => {
      const anchors = Array.from(document.querySelectorAll<HTMLElement>('[data-anchor-id]'))
      if (anchors.length === 0) return
      const threshold = Math.round(window.innerHeight * 0.25)
      let cur = anchors[0]
      for (const a of anchors) {
        if (a.getBoundingClientRect().top <= threshold) cur = a
        else break
      }
      const id = cur.dataset.anchorId
      if (id) setActiveAnchor(id)
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        compute()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    compute()
    return () => window.removeEventListener('scroll', onScroll)
  }, [pageId])

  // 左侧导航自动跟随(沿用原版): 高亮项滚出可视区时滚回
  useEffect(() => {
    const aside = asideRef.current
    if (!aside || !activeAnchor) return
    const el = aside.querySelector<HTMLElement>(`[data-anchor-nav="${CSS.escape(activeAnchor)}"]`)
    if (!el) return
    const b = el.getBoundingClientRect()
    const a = aside.getBoundingClientRect()
    if (b.top < a.top) aside.scrollTop += b.top - a.top - 4
    else if (b.bottom > a.bottom) aside.scrollTop += b.bottom - a.bottom + 4
  }, [activeAnchor])

  const toggle = (key: string) =>
    setClosed((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const go = (id: string) => {
    setPageId(id)
    setActiveAnchor('')
    window.scrollTo({ top: 0 })
  }

  // 点四级导航(wiki 小节): 选中页 + 平滑滚动到小节(沿用原版: 双 rAF + token 守卫)
  const goSection = (pid: string, section: string) => {
    const token = ++scrollToken.current
    if (pid !== pageId) {
      setPageId(pid)
      setActiveAnchor('')
    }
    const scroll = () => {
      if (scrollToken.current !== token) return
      document.getElementById(`sec-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    requestAnimationFrame(() => requestAnimationFrame(scroll))
  }

  // 四级导航折叠状态(默认展开)
  const [secClosed, setSecClosed] = useState<Set<string>>(new Set())
  const toggleSec = (pid: string) =>
    setSecClosed((s) => {
      const next = new Set(s)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })

  const tocAnchors = useMemo(() => tocAnchorsFor(page), [page])

  const prev = PAGES[idx - 1]
  const next = PAGES[idx + 1]

  return (
    <div className={`w-full min-h-[calc(100vh-3.5rem)] transition-colors duration-300 ${dark ? 'dark bg-slate-950' : ''}`}>
    <div className="mx-auto grid max-w-[1440px] grid-cols-[240px_minmax(0,1fr)_200px] gap-10 px-6 py-8 max-lg:grid-cols-[220px_minmax(0,1fr)] max-md:grid-cols-1">
      {/* 左: 旅程导航树 */}
      <nav ref={asideRef} className="sticky top-[76px] h-[calc(100vh-76px)] overflow-y-auto border-r border-slate-200 pr-3 pb-16 max-md:static max-md:h-auto max-md:border-r-0 dark:border-slate-700">
        {JOURNEY.map((j) => (
          <div key={j.label} className="mb-5">
            <div className="px-3 pb-2 text-[11px] font-extrabold tracking-[0.14em] text-slate-400 dark:text-slate-500">{j.label}</div>
            {j.groups.map((gtitle) => {
              const leaves = PAGES.filter((p) => p.journey === j.label && p.group === gtitle)
              if (!leaves.length) return null
              const key = `${j.label}:${gtitle}`
              const isClosed = closed.has(key)
              return (
                <div key={key} className="mb-1">
                  <button type="button" onClick={() => toggle(key)} className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[13px] font-bold text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-800">
                    {gtitle}
                    <span className={`ml-auto text-[9px] text-slate-400 transition-transform ${isClosed ? '-rotate-90' : ''}`}>▼</span>
                  </button>
                  {!isClosed && (
                    <div className="mb-1.5 ml-3 border-l border-slate-200 pl-2 dark:border-slate-700">
                      {leaves.map((p) => (
                        <div key={p.id}>
                          <div className="flex items-center">
                            <a onClick={() => go(p.id)} className={`block flex-1 cursor-pointer rounded-md px-3 py-1.5 text-[13px] ${p.id === pageId ? 'bg-brand-50 font-bold text-brand-700 shadow-[inset_2px_0_0] shadow-brand-500 dark:bg-slate-800 dark:text-brand-300' : 'text-slate-500 hover:bg-brand-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}>
                              {p.title}
                            </a>
                            {p.kind === 'wiki' && p.id === pageId && (
                              <button
                                type="button"
                                onClick={() => toggleSec(p.id)}
                                title={secClosed.has(p.id) ? '展开小节导航' : '折叠小节导航'}
                                className="ml-1 rounded px-1.5 py-1 text-[9px] text-slate-400 hover:bg-brand-50 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                              >
                                {secClosed.has(p.id) ? '▸' : '▾'}
                              </button>
                            )}
                          </div>
                          {/* 四级导航: 当前 wiki 页展开文内小节(短标题, 正文标题不动), 可折叠; 点击平滑滚动 + 滚动时高亮跟随 */}
                          {p.kind === 'wiki' && p.id === pageId && !secClosed.has(p.id) && (
                            <div className="ml-3 border-l border-dashed border-slate-200 pl-2 dark:border-slate-700">
                              {wikiSections(p.id).map((sec) => (
                                <a
                                  key={sec}
                                  data-anchor-nav={sec}
                                  onClick={() => goSection(p.id, sec)}
                                  className={`block cursor-pointer rounded px-2.5 py-1 text-xs transition-colors ${activeAnchor === sec ? 'font-bold text-brand-600 dark:text-brand-300' : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200'}`}
                                >
                                  {secLabel(sec)}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* 中: 面包屑 + 内容 + 翻页 */}
      <main className="min-w-0 pb-16">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{page.journey}</span><span>/</span><span>{page.group}</span><span>/</span>
          <b className="font-semibold text-brand-600 dark:text-brand-300">{page.title}</b>
          <span className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </span>
        </div>
        <article className="mt-5 max-w-[760px]">
          {page.kind === 'wiki' && <WikiContent id={page.id} activeAnchor={activeAnchor} />}
          {page.kind === 'tech' && <TechContent tech={page.tech} />}
          {page.kind === 'install' && <InstallContent />}
          {page.kind === 'path' && <PathContent />}
          {page.kind === 'faq' && <FaqContent />}
        </article>
        <nav className="mt-14 grid max-w-[760px] grid-cols-2 gap-3.5">
          {prev ? (
            <a onClick={() => go(prev.id)} className="flex cursor-pointer flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <small className="text-[11px] text-slate-400">← 上一页</small>
              <b className="text-sm font-bold text-slate-800 dark:text-slate-100">{prev.title}</b>
            </a>
          ) : <span />}
          {next && (
            <a onClick={() => go(next.id)} className="flex cursor-pointer flex-col items-end gap-1 rounded-xl border border-slate-200 bg-white p-4 text-right transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <small className="text-[11px] text-slate-400">下一页 →</small>
              <b className="text-sm font-bold text-slate-800 dark:text-slate-100">{next.title}</b>
            </a>
          )}
        </nav>
        {/* 页尾留白(沿用原版): 让最后一节锚点能滚到判定线以上; 放在翻页之后, 翻页按钮紧贴正文 */}
        {page.kind === 'wiki' && <div className="h-[55vh]" aria-hidden />}
      </main>

      {/* 右: 页内 TOC */}
      <aside className="sticky top-[76px] h-[calc(100vh-76px)] overflow-y-auto border-l border-slate-200 pl-4 pb-16 max-lg:hidden dark:border-slate-700">
        <div className="pb-2.5 text-[11px] font-extrabold tracking-[0.14em] text-slate-400 dark:text-slate-500">本页目录</div>
        {tocAnchors.map((a) => (
          <a key={a} onClick={() => goSection(page.id, a)} className={`block cursor-pointer border-l-2 py-1 pl-3 text-xs transition-colors ${activeAnchor === a ? 'border-brand-500 font-bold text-brand-600 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>
            {secLabel(a)}
          </a>
        ))}
      </aside>
    </div>
    </div>
  )
}
