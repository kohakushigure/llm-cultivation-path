import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Landing } from '@/pages/Landing'
import { About } from '@/pages/About'
import { Docs } from '@/pages/Docs'
import { NotFound } from '@/pages/NotFound'
import { Profile } from '@/pages/Profile'
import { Achievements } from '@/pages/Achievements'
import { LearningMap } from '@/pages/learn/LearningMap'
import { ChapterView } from '@/pages/learn/ChapterView'
import { TaskWorkspace } from '@/pages/learn/workspace/TaskWorkspace'

/** 路由表(M4: 工作区核心已接入)。
 *  basename 跟随 vite base: 子路径部署(云端 /llm-cultivation-path/)时路由自动带前缀。 */
export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Landing /> },
        { path: 'about', element: <About /> },
        { path: 'docs', element: <Docs /> },
        { path: 'learn', element: <LearningMap /> },
        { path: 'learn/:chapterId', element: <ChapterView /> },
        { path: 'learn/:chapterId/:taskId', element: <TaskWorkspace /> },
        { path: 'profile', element: <Profile /> },
        { path: 'achievements', element: <Achievements /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
