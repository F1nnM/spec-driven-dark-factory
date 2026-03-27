export type SpecFulfillment = 'unfulfilled' | 'partial' | 'fulfilled'
export type SpecStatus = 'draft' | 'approved' | 'implemented' | 'deprecated'
export type RevisionStatus = 'drafting' | 'approved' | 'implementing' | 'completed' | 'interrupted'
export type EvolutionStepStatus = 'pending' | 'implementing' | 'reviewing' | 'completed' | 'failed'

export interface SpecMeta {
  id: string
  title: string
  category: string
  status: SpecStatus
  fulfillment: SpecFulfillment
  fulfillment_explanation: string
  depends_on: string[]
  relates_to: string[]
  tags: string[]
  created: string
  updated: string
}

export interface SpecFile {
  path: string
  meta: SpecMeta
  body: string
}

export interface Revision {
  id: string
  projectId: string
  revisionNumber: number
  status: RevisionStatus
  branchName: string
  createdAt: Date
  completedAt: Date | null
}

export interface EvolutionStep {
  id: string
  revisionId: string
  stepNumber: number
  status: EvolutionStepStatus
  branchName: string
  specCommitHash: string
  reviewLoopCount: number
  reviewSummary: string | null
}
