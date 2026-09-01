/**
 * 学习地图（/learn）—— 游戏化世界地图页。
 * 设计原型: tempDemo/frontend/learning-path-demo/src/GameApp.jsx（原样合并, ADR-0013）。
 * 与原型差异仅限接线: 进度走 useProgress store, 课程走 useCourse store,
 * 导航走 React Router(沿用 AppLayout 外壳, 不保留原型自带顶导)。
 *
 * 维护约束: CHAPTER_META 坐标与 RoadOverlay 路线是针对 8 章 + 插画手工调参的,
 * 章节数变化必须同步调参并可能重绘插画。
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Chapter, Course } from '@shared/types'
import { useCourse } from '@/features/course/store'
import { useProgress } from '@/features/progression/store'
import {
  chapterMapStatus,
  isChapterUnlocked,
  type ChapterMapContext,
  type ChapterStatus,
} from './chapterMapStatus'
import upgradeRouteLogo from './upgrade-route-logo.webp'
import './game-map.css'

const MAP_ART = `${import.meta.env.BASE_URL}assets/learning-map-world.webp`

const CHAPTER_META = [
  { product: '星澈助手', icon: 'chat', x: 52, y: 10.2, cardX: 65, cardY: 7.4, side: 'right' },
  { product: '提示词工作台', icon: 'chain', x: 25.8, y: 25.1, cardX: 0.6, cardY: 19.6, side: 'left' },
  { product: '黑糖资料室', icon: 'search', x: 70.5, y: 34.1, cardX: 74.6, cardY: 29.6, side: 'right' },
  { product: '工具助手', icon: 'robot', x: 28.7, y: 46.7, cardX: 2.6, cardY: 42.5, side: 'left' },
  { product: 'Agent 运行时底座', icon: 'runtime', x: 72.5, y: 56.2, cardX: 75.2, cardY: 51.6, side: 'right' },
  { product: '项目协作组', icon: 'agents', x: 29.5, y: 67.3, cardX: 2.5, cardY: 63.1, side: 'left' },
  { product: '微型 GPT 实验', icon: 'chip', x: 66.7, y: 79.1, cardX: 72, cardY: 74.8, side: 'right' },
  { product: '最终项目', icon: 'flag', x: 45.4, y: 91.1, cardX: 2.6, cardY: 86.5, side: 'left' },
] as const

const STATUS: Record<ChapterStatus, { label: string; symbol: string }> = {
  completed: { label: '已完成', symbol: '✓' },
  current: { label: '进行中', symbol: '▶' },
  locked: { label: '未解锁', symbol: '⌁' },
}

const ICONS: Record<string, React.ReactNode> = {
  chat: <><path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4a3.5 3.5 0 0 1-3.5 3.5H11l-4.2 3.4.9-3.6A3.5 3.5 0 0 1 5 10.5z" /><path d="M9 8h6M9 11h3.5" /></>,
  chain: <><path d="m9.5 14.5-1.2 1.2a3.3 3.3 0 0 1-4.7-4.7l2.8-2.8a3.3 3.3 0 0 1 4.7 0" /><path d="m14.5 9.5 1.2-1.2a3.3 3.3 0 0 1 4.7 4.7l-2.8 2.8a3.3 3.3 0 0 1-4.7 0M8.5 15.5l7-7" /></>,
  search: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H16a2 2 0 0 1 2 2v8.5" /><path d="M4 5.5V18a2 2 0 0 0 2 2h6M4 16h7" /><circle cx="16" cy="15" r="3.5" /><path d="m18.5 17.5 2.5 2.5" /></>,
  robot: <><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M9 12h.01M15 12h.01M9 15h6M12 3v4M10 3h4M2 11h3M19 11h3" /></>,
  runtime: <><path d="M4 7h11a4 4 0 0 1 0 8h-2" /><path d="m6.5 4-3 3 3 3M10 17h10M17.5 14l3 3-3 3" /></>,
  agents: <><circle cx="12" cy="5" r="2.5" /><circle cx="5.5" cy="17.5" r="2.5" /><circle cx="18.5" cy="17.5" r="2.5" /><path d="m10.8 7.2-4.1 8M13.2 7.2l4.1 8M8 17.5h8" /></>,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /><path d="M10 10h4v4h-4z" /></>,
  flag: <><path d="M6 21V4M6 5h10l-2 3 2 3H6" /><path d="M3 21h8" /></>,
}

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={down ? 'M10 3v13m-5-5 5 5 5-5' : 'M4 10h12m-4-4 4 4-4 4'} />
    </svg>
  )
}

function Logo() {
  return (
    <a className="logo" href="#top" aria-label="黑糖 LLM 学习网站首页">
      <span className="logo-cube" aria-hidden="true"><i /><i /><i /></span>
      <span><strong>黑糖 · LLM 学习网站</strong><small>BROWN SUGAR AI LAB</small></span>
    </a>
  )
}

function HeroStat({ icon, value, label, tone }: { icon: string; value: React.ReactNode; label: string; tone: string }) {
  return <div className="hero-stat"><span className={`hero-stat__icon hero-stat__icon--${tone}`}>{icon}</span><strong>{value}</strong><small>{label}</small></div>
}

function Hero({ course, onStart }: { course: Course; onStart: () => void }) {
  return (
    <section className="hero" id="top">
      <div className="hero__cloud hero__cloud--left" /><div className="hero__cloud hero__cloud--right" />
      <div className="hero__inner">
        <div className="hero__copy">
          <span className="eyebrow"><i />PROJECT-BASED LEARNING TRAIL</span>
          <span className="data-source data-source--backend"><i />学习数据已连接</span>
          <h1 className="hero-title" aria-label="升级路线">
            <img className="hero-title__logo" src={upgradeRouteLogo} alt="升级路线" />
          </h1>
          <p>{course.description}</p>
          <div className="hero__chips"><span>真实项目</span><span>逐步闯关</span><span>本地优先</span></div>
        </div>
        <div className="hero-card">
          <div className="hero-card__stats">
            <HeroStat icon="▣" value={course.chapters.length} label="Chapters" tone="blue" />
            <HeroStat icon="★" value={course.totalExp} label="总经验 EXP" tone="gold" />
            <HeroStat icon="↗" value={course.version} label="Version" tone="purple" />
          </div>
          <button type="button" className="start-button" onClick={onStart}><span className="start-button__play">▶</span>开始学习<Arrow down /></button>
        </div>
      </div>
    </section>
  )
}

function chapterStats(chapter: Chapter) {
  return {
    tasks: chapter.tasks.length,
    steps: chapter.tasks.reduce((sum, task) => sum + task.steps.length, 0),
    exp: chapter.tasks.reduce((sum, task) => sum + task.expReward, 0),
    minutes: chapter.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
  }
}

function shortTitle(title: string) { return title.replace(/^第[一二三四五六七八九十]+章\s*/, '') }

function ProgressBoard({ course, statusMap }: { course: Course; statusMap: Map<string, ChapterStatus> }) {
  const progress = useProgress()
  const completedCount = course.chapters.filter((c) => statusMap.get(c.id) === 'completed').length
  const percentage = Math.round((completedCount / course.chapters.length) * 100)
  return (
    <aside className="progress-board" id="progress">
      <div className="progress-board__title"><span>⚑</span><strong>学习进度</strong><b>{percentage}%</b></div>
      <div className="progress-track"><span style={{ width: `${percentage}%` }} /></div>
      <div className="progress-board__meta"><span>已完成 <strong>{completedCount} / {course.chapters.length}</strong> 章</span><span>{progress.totalExp} EXP</span></div>
      <button type="button" onClick={() => document.getElementById('chapter-focus')?.scrollIntoView({ behavior: 'smooth' })}>查看详情 <Arrow /></button>
    </aside>
  )
}

function MapGuide() { return <button className="map-guide" type="button"><span>◇</span> 地图指引</button> }

/** 每段路的起讫: 起点 → 第 N 章节点（坐标与插画对齐, 拆自原型单条整路径）。 */
const ROAD_LEGS = [
  'M520 0 C 510 62, 500 115, 486 172',
  'M486 172 C 452 267, 385 344, 241 420',
  'M241 420 C 350 470, 505 515, 658 574',
  'M658 574 C 535 648, 372 708, 267 788',
  'M267 788 C 402 838, 555 885, 677 947',
  'M677 947 C 530 1015, 380 1080, 276 1135',
  'M276 1135 C 390 1193, 523 1254, 625 1332',
  'M625 1332 C 568 1418, 478 1482, 425 1537',
] as const

function RoadOverlay({ chapters, statusMap }: { chapters: Chapter[]; statusMap: Map<string, ChapterStatus> }) {
  return (
    <svg className="road-overlay" viewBox="0 0 934 1685" preserveAspectRatio="none" aria-hidden="true">
      <defs><filter id="blue-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      {chapters.map((chapter, i) => {
        const status = statusMap.get(chapter.id) ?? 'locked'
        // 该腿通往第 i 章: 已到站(绿) / 正前往(蓝) / 未解锁(白点线)
        const legClass = status === 'completed' ? 'road--completed' : status === 'current' ? 'road--current' : 'road--locked'
        return <path key={chapter.id} className={`road ${legClass}`} d={ROAD_LEGS[i]} />
      })}
    </svg>
  )
}

function ChapterNode({ chapter, index, status, selected, onSelect }: { chapter: Chapter; index: number; status: ChapterStatus; selected: boolean; onSelect: (id: string) => void }) {
  const meta = CHAPTER_META[index]
  return (
    <button className={`chapter-node chapter-node--${status}${selected ? ' is-selected' : ''}`} style={{ left: `${meta.x}%`, top: `${meta.y}%` }} type="button" onClick={() => onSelect(chapter.id)} aria-label={`第 ${chapter.order} 章，${shortTitle(chapter.title)}，${STATUS[status].label}`} aria-pressed={selected}>
      <span className="chapter-node__pulse" /><span className="chapter-node__number">{String(chapter.order).padStart(2, '0')}</span><span className="chapter-node__state">{STATUS[status].symbol}</span>
    </button>
  )
}

function MapChapterCard({ chapter, index, status, selected, onSelect }: { chapter: Chapter; index: number; status: ChapterStatus; selected: boolean; onSelect: (id: string) => void }) {
  const meta = CHAPTER_META[index]
  const stats = chapterStats(chapter)
  return (
    <button type="button" className={`map-chapter-card map-chapter-card--${meta.side} map-chapter-card--${status}${selected ? ' is-selected' : ''}`} style={{ left: `${meta.cardX}%`, top: `${meta.cardY}%` }} onClick={() => onSelect(chapter.id)}>
      <span className="map-chapter-card__top"><i>第{chapter.order}章</i><b>{STATUS[status].label}</b></span>
      <strong>{shortTitle(chapter.title)}</strong><em>{meta.product}</em>
      <span className="map-chapter-card__bottom"><small>{stats.tasks} tasks</small><span><Icon name={meta.icon} size={17} /></span></span>
    </button>
  )
}

function WorldMap({ course, statusMap, selectedId, onSelect }: { course: Course; statusMap: Map<string, ChapterStatus>; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <section className="world-shell" id="map">
      <div className="world-map">
        <img className="world-map__art" src={MAP_ART} alt="八个 LLM Agent 学习站点组成的天空校园冒险地图" />
        <div className="world-map__shade" aria-hidden="true" /><ProgressBoard course={course} statusMap={statusMap} /><MapGuide /><RoadOverlay chapters={course.chapters} statusMap={statusMap} />
        {course.chapters.map((chapter, index) => <ChapterNode key={chapter.id} chapter={chapter} index={index} status={statusMap.get(chapter.id) ?? 'locked'} selected={selectedId === chapter.id} onSelect={onSelect} />)}
        {course.chapters.map((chapter, index) => <MapChapterCard key={chapter.id} chapter={chapter} index={index} status={statusMap.get(chapter.id) ?? 'locked'} selected={selectedId === chapter.id} onSelect={onSelect} />)}
        <div className="map-finish"><span>✦</span> 完成所有章节，解锁「高级挑战」与专属证书（Coming Soon） <span>✦</span></div>
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: ChapterStatus }) { return <span className={`status-badge status-badge--${status}`}>{STATUS[status].symbol} {STATUS[status].label}</span> }

function ChapterFocus({ chapter, index, status, canEnter }: { chapter: Chapter; index: number; status: ChapterStatus; canEnter: boolean }) {
  const stats = chapterStats(chapter)
  const meta = CHAPTER_META[index]
  const actionClass = `chapter-focus__action chapter-focus__action--${status}`
  const actionLabel = status === 'completed' ? '回顾章节' : status === 'current' ? '继续学习' : '查看项目章节'
  return (
    <section className="chapter-focus" id="chapter-focus">
      <div className="chapter-focus__icon"><Icon name={meta.icon} size={34} /></div>
      <div className="chapter-focus__copy"><span className="chapter-focus__eyebrow">CHAPTER {String(chapter.order).padStart(2, '0')} · {meta.product}</span><h2>{shortTitle(chapter.title)}</h2><p>{chapter.description}</p></div>
      <div className="chapter-focus__status"><StatusBadge status={status} /><span>Lv.{chapter.unlock.requiredLevel} · {chapter.unlock.requiredExp} EXP 解锁</span></div>
      <div className="chapter-focus__metrics">
        <div><small>项目任务</small><strong>{stats.tasks}</strong></div><div><small>练习步骤</small><strong>{stats.steps}</strong></div><div><small>章节经验</small><strong>{stats.exp}</strong></div><div><small>预计用时</small><strong>{stats.minutes}<i> min</i></strong></div>
      </div>
      {canEnter
        ? <Link to={`/learn/${chapter.id}`} className={actionClass}>{actionLabel} <Arrow /></Link>
        : <span className={actionClass} aria-disabled="true">{actionLabel} <Arrow /></span>}
    </section>
  )
}

function ChapterStrip({ course, statusMap, selectedId, onSelect }: { course: Course; statusMap: Map<string, ChapterStatus>; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <section className="chapter-strip" id="chapters">
      <div className="section-heading"><span>ALL CHAPTERS</span><h2>八站成长路线</h2><p>点击章节快速查看学习目标与解锁进度</p></div>
      <div className="chapter-strip__list">
        {course.chapters.map((chapter, index) => {
          const status = statusMap.get(chapter.id) ?? 'locked'
          return <button key={chapter.id} type="button" className={`chapter-strip__item chapter-strip__item--${status}${selectedId === chapter.id ? ' is-selected' : ''}`} onClick={() => onSelect(chapter.id)}><span>{String(chapter.order).padStart(2, '0')}</span><i><Icon name={CHAPTER_META[index].icon} size={21} /></i><strong>{shortTitle(chapter.title)}</strong><small>{STATUS[status].label}</small></button>
        })}
      </div>
    </section>
  )
}

function Loading({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <main className="loading">
      <Logo />
      <span className="loading__spinner">{error ? '!' : ''}</span>
      <h1>{error ? '学习地图加载失败' : '正在展开学习地图'}</h1>
      <p>{error ?? '正在连接项目后端…'}</p>
      {error && <button type="button" className="loading__retry" onClick={onRetry}>重新加载</button>}
    </main>
  )
}

/** 学习之路: 游戏化章节地图, 展示三态进度并联动章节详情。 */
export function LearningMap() {
  const course = useCourse((s) => s.course)
  const courseLoading = useCourse((s) => s.loading)
  const courseError = useCourse((s) => s.error)
  const loadCourse = useCourse((s) => s.loadCourse)
  const progress = useProgress()

  useEffect(() => {
    if (!course && !courseLoading) loadCourse()
  }, [course, courseLoading, loadCourse])

  const ctx: ChapterMapContext = useMemo(
    () => ({ completedTaskIds: progress.completedTasks, totalExp: progress.totalExp }),
    [progress.completedTasks, progress.totalExp],
  )
  const statusMap = useMemo(
    () => (course ? chapterMapStatus(course.chapters, ctx) : null),
    [course, ctx],
  )
  const currentChapterId = useMemo(
    () => course?.chapters.find((c) => statusMap?.get(c.id) === 'current')?.id ?? course?.chapters[0]?.id,
    [course, statusMap],
  )
  const [pickedId, setPickedId] = useState<string | null>(null)
  const selectedId = pickedId ?? currentChapterId ?? ''

  const selectedIndex = useMemo(
    () => Math.max(0, course?.chapters.findIndex((chapter) => chapter.id === selectedId) ?? 0),
    [course, selectedId],
  )
  // 点地图章节节点/卡片: 选中并立即下滑, 让章节引导卡停在视口中上 25% 处(issue #55)
  const handleSelect = (id: string) => {
    setPickedId(id)
    const el = document.getElementById('chapter-focus')
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.25
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }
  const handleStart = () => {
    if (currentChapterId) setPickedId(currentChapterId)
    document.getElementById('map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!course || !statusMap) {
    return (
      <div className="learn-map">
        <Loading error={courseError} onRetry={() => void loadCourse()} />
      </div>
    )
  }

  const selectedChapter = course.chapters[selectedIndex]
  return (
    <div className="learn-map">
      <main>
        <Hero course={course} onStart={handleStart} />
        <WorldMap course={course} statusMap={statusMap} selectedId={selectedId} onSelect={handleSelect} />
        <ChapterFocus
          chapter={selectedChapter}
          index={selectedIndex}
          status={statusMap.get(selectedChapter.id) ?? 'locked'}
          canEnter={isChapterUnlocked(selectedChapter, ctx)}
        />
        <ChapterStrip course={course} statusMap={statusMap} selectedId={selectedId} onSelect={setPickedId} />
        <section className="resources" id="resources">
          <span>黑糖资料室</span>
          <h2>边学边查，知识不掉线</h2>
          <p>术语、示例和技术参考会跟随当前章节整理在资料室中。</p>
          <Link to="/docs">打开项目资料页 <Arrow /></Link>
        </section>
      </main>
      <footer>
        <Logo />
        <p>项目制打怪升级 · 从 API 调用到自建小模型</p>
        <Link to="/achievements">查看成就</Link>
        <span>LEARNING MAP V{course.version}</span>
      </footer>
    </div>
  )
}
