import {
  BookOpen,
  ClipboardCheck,
  FileText,
  FolderOpen,
  LayoutGrid,
  Network,
  PenLine,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '../types/auth'

/**
 * Navigation model. `available` items have a real route; `planned` items are
 * rendered as non-interactive entries so they never look like working features.
 * `requiredPermission` filters items in the UI for role clarity while the
 * backend enforces strict RBAC on every API endpoint.
 */
export type NavItem = {
  id: string
  label: string
  icon: LucideIcon
  requiredPermission?: Permission
} & ({ status: 'available'; to: string } | { status: 'planned' })

export type NavGroup = {
  id: string
  label: string
  items: NavItem[]
}

export const navigation: NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutGrid, status: 'available', to: '/', requiredPermission: 'dashboard:view' },
      { id: 'question-bank', label: 'Question Bank', icon: BookOpen, status: 'available', to: '/questions', requiredPermission: 'questions:view' },
      { id: 'ai-generator', label: 'AI Generator', icon: Sparkles, status: 'available', to: '/questions/generate', requiredPermission: 'ai:view' },
      { id: 'source-documents', label: 'Source Documents', icon: FolderOpen, status: 'available', to: '/source-documents', requiredPermission: 'questions:view' },
      { id: 'examinations', label: 'Examinations', icon: FileText, status: 'available', to: '/examinations', requiredPermission: 'exams:view' },
      { id: 'paper-preparation', label: 'Paper Preparation', icon: PenLine, status: 'available', to: '/papers', requiredPermission: 'papers:view' },
      { id: 'approval-queue', label: 'Approval Queue', icon: ClipboardCheck, status: 'available', to: '/approvals', requiredPermission: 'submissions:view' },
    ],
  },

  {
    id: 'administration',
    label: 'Administration',
    items: [
      { id: 'academic-structure', label: 'Subjects & Structure', icon: Network, status: 'available', to: '/subjects', requiredPermission: 'subjects:view' },
      { id: 'users', label: 'Users & Memberships', icon: Users, status: 'available', to: '/users', requiredPermission: 'memberships:manage' },
      { id: 'settings', label: 'Settings', icon: Settings, status: 'planned' },
    ],
  },
]
