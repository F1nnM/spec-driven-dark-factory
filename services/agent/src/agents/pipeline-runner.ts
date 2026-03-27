import { implementStep, type StepResult } from './implementation-orchestrator.js'
import {
  execGit,
  checkoutBranch,
  mergeBranch,
  tagRevision,
} from '../git/operations.js'

export interface PipelineResult {
  revisionNumber: number
  steps: StepResult[]
  status: 'completed' | 'failed' | 'interrupted'
}

export interface PipelineStep {
  stepNumber: number
  branchName: string
  specCommitHash: string
}

// Shared abort flag registry, keyed by projectId
const abortFlags = new Map<string, boolean>()

export function requestAbort(projectId: string): void {
  abortFlags.set(projectId, true)
}

export function clearAbort(projectId: string): void {
  abortFlags.delete(projectId)
}

function isAborted(projectId: string): boolean {
  return abortFlags.get(projectId) === true
}

export async function runPipeline(
  projectId: string,
  repoPath: string,
  revisionNumber: number,
  steps: PipelineStep[],
  specsPath: string,
  onStepUpdate?: (step: StepResult) => void,
): Promise<PipelineResult> {
  const revisionBranch = `revision-${revisionNumber}`
  const completedSteps: StepResult[] = []

  // Ensure we start on the revision branch
  await checkoutBranch(repoPath, revisionBranch)

  // Clear any previous abort flag
  clearAbort(projectId)

  for (const step of steps) {
    // Check for abort between steps
    if (isAborted(projectId)) {
      return {
        revisionNumber,
        steps: completedSteps,
        status: 'interrupted',
      }
    }

    const stepResult = await implementStep(
      repoPath,
      step.branchName,
      step.specCommitHash,
      specsPath,
    )

    completedSteps.push(stepResult)
    onStepUpdate?.(stepResult)

    if (stepResult.status === 'failed') {
      return {
        revisionNumber,
        steps: completedSteps,
        status: 'failed',
      }
    }

    // Merge step branch into revision branch
    await mergeBranch(repoPath, step.branchName, revisionBranch)
  }

  // All steps completed — merge revision branch into main
  await mergeBranch(repoPath, revisionBranch, 'main')

  // Tag with revision number
  const tagName = `v${revisionNumber}`
  await tagRevision(repoPath, tagName, `Revision ${revisionNumber} completed`)

  return {
    revisionNumber,
    steps: completedSteps,
    status: 'completed',
  }
}
