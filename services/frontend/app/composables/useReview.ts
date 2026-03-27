import { diffSpecs, type SpecChange, type SpecFile } from '@spec-factory/shared'

interface RevisionData {
  id: string
  revisionNumber: number
  status: string
  branchName: string
  createdAt: string
  completedAt: string | null
}

interface StepData {
  id: string
  stepNumber: number
  status: string
  branchName: string
  reviewLoopCount: number
  reviewSummary: string | null
}

export function useReview(projectId: string) {
  const revision = ref<RevisionData | null>(null)
  const steps = ref<StepData[]>([])
  const changes = ref<SpecChange[]>([])
  const approving = ref(false)
  const error = ref<string | null>(null)
  const loading = ref(false)

  async function loadReview() {
    loading.value = true
    error.value = null

    try {
      // Fetch draft specs and compute diff
      const [specsData, revisionData] = await Promise.all([
        $fetch<{
          specs: SpecFile[]
          mainSpecs: SpecFile[]
          revisionNumber: number | null
        }>(`/api/projects/${projectId}/draft-specs`),
        $fetch<{
          revision: RevisionData | null
          steps: StepData[]
        }>(`/api/projects/${projectId}/revision`),
      ])

      // Compute diff between main and draft specs
      changes.value = diffSpecs(specsData.mainSpecs, specsData.specs)

      revision.value = revisionData.revision
      steps.value = revisionData.steps
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || 'Failed to load review data'
    } finally {
      loading.value = false
    }
  }

  async function approve() {
    approving.value = true
    error.value = null

    try {
      const data = await $fetch<{
        revisionNumber: number
        steps: { stepNumber: number; branchName: string }[]
      }>(`/api/projects/${projectId}/approve`, {
        method: 'POST',
      })

      // Refresh revision status after approval
      const revisionData = await $fetch<{
        revision: RevisionData | null
        steps: StepData[]
      }>(`/api/projects/${projectId}/revision`)

      revision.value = revisionData.revision
      steps.value = revisionData.steps

      return data
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || 'Failed to approve revision'
      throw e
    } finally {
      approving.value = false
    }
  }

  async function pollStatus() {
    try {
      const revisionData = await $fetch<{
        revision: RevisionData | null
        steps: StepData[]
      }>(`/api/projects/${projectId}/revision`)

      revision.value = revisionData.revision
      steps.value = revisionData.steps
    } catch {
      // Silently ignore polling errors
    }
  }

  return {
    revision,
    steps,
    changes,
    approving,
    error,
    loading,
    loadReview,
    approve,
    pollStatus,
  }
}
