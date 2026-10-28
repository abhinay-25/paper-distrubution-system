import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { OverviewPage } from '../pages/OverviewPage'
import { SubjectsPage } from '../pages/SubjectsPage'
import { SubjectDetailPage } from '../pages/SubjectDetailPage'
import { QuestionBankPage } from '../pages/QuestionBankPage'
import { QuestionEditorPage } from '../pages/QuestionEditorPage'
import { QuestionRevisionsPage } from '../pages/QuestionRevisionsPage'
import { QuestionGeneratorPage } from '../pages/QuestionGeneratorPage'
import { ExaminationsPage } from '../pages/ExaminationsPage'
import { PaperListPage } from '../pages/PaperListPage'
import { PaperBuilderPage } from '../pages/PaperBuilderPage'
import { PaperPreviewPage } from '../pages/PaperPreviewPage'
import { PaperVersionHistoryPage } from '../pages/PaperVersionHistoryPage'
import { ApprovalQueuePage } from '../pages/ApprovalQueuePage'
import { SubmissionReviewPage } from '../pages/SubmissionReviewPage'
import { UsersMembershipsPage } from '../pages/UsersMembershipsPage'
import { SourceDocumentsPage } from '../pages/SourceDocumentsPage'

/** Route table with authentication and RBAC route guards. */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute requiredPermission="dashboard:view">
            <OverviewPage />
          </ProtectedRoute>
        ),
      },

      // Academic structure
      {
        path: 'subjects',
        element: (
          <ProtectedRoute requiredPermission="subjects:view">
            <SubjectsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'subjects/:subjectId',
        element: (
          <ProtectedRoute requiredPermission="subjects:view">
            <SubjectDetailPage />
          </ProtectedRoute>
        ),
      },

      // Question bank
      {
        path: 'questions',
        element: (
          <ProtectedRoute requiredPermission="questions:view">
            <QuestionBankPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'questions/generate',
        element: (
          <ProtectedRoute requiredPermission="ai:view">
            <QuestionGeneratorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'source-documents',
        element: (
          <ProtectedRoute requiredPermission="questions:view">
            <SourceDocumentsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'questions/new',
        element: (
          <ProtectedRoute requiredPermission="questions:write">
            <QuestionEditorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'questions/:questionId/edit',
        element: (
          <ProtectedRoute requiredPermission="questions:write">
            <QuestionEditorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'questions/:questionId/revisions',
        element: (
          <ProtectedRoute requiredPermission="questions:view">
            <QuestionRevisionsPage />
          </ProtectedRoute>
        ),
      },

      // Step 8: Examination Configuration & Paper Builder
      {
        path: 'examinations',
        element: (
          <ProtectedRoute requiredPermission="exams:view">
            <ExaminationsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'papers',
        element: (
          <ProtectedRoute requiredPermission="papers:view">
            <PaperListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'papers/:paperId',
        element: (
          <ProtectedRoute requiredPermission="papers:view">
            <PaperBuilderPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'papers/:paperId/preview',
        element: (
          <ProtectedRoute requiredPermission="papers:view">
            <PaperPreviewPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'papers/:paperId/versions',
        element: (
          <ProtectedRoute requiredPermission="papers:view">
            <PaperVersionHistoryPage />
          </ProtectedRoute>
        ),
      },

      // Step 10: Independent Approval Workflow
      {
        path: 'approvals',
        element: (
          <ProtectedRoute requiredPermission="submissions:view">
            <ApprovalQueuePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'approvals/:submissionId',
        element: (
          <ProtectedRoute requiredPermission="submissions:view">
            <SubmissionReviewPage />
          </ProtectedRoute>
        ),
      },

      // Step 6: Institution Users & Memberships Management
      {
        path: 'users',
        element: (
          <ProtectedRoute requiredPermission="memberships:manage">
            <UsersMembershipsPage />
          </ProtectedRoute>
        ),
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
