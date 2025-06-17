import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Navbar } from '@/components/layout/navbar'
import { HomePage } from '@/pages/home'
import { Projects } from '@/pages/projects'
import { ProjectTasks } from '@/pages/project-tasks'
import { TaskDetailsPage } from '@/pages/task-details'
import { TaskAttemptComparePage } from '@/pages/task-attempt-compare'


function AppContent() {
  const location = useLocation()
  const showNavbar = true

  return (
    <div className="min-h-screen bg-background">
      {showNavbar && <Navbar />}
      <div className={showNavbar && location.pathname !== '/' ? "max-w-7xl mx-auto p-6 sm:p-8" : ""}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:projectId" element={<Projects />} />
          <Route path="/projects/:projectId/tasks" element={<ProjectTasks />} />
          <Route path="/projects/:projectId/tasks/:taskId" element={<TaskDetailsPage />} />
          <Route path="/projects/:projectId/tasks/:taskId/attempts/:attemptId/compare" element={<TaskAttemptComparePage />} />

        </Routes>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
