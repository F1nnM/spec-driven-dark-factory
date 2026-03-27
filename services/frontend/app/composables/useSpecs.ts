import type { SpecFile, SpecFulfillment } from '@spec-factory/shared'

interface SpecIndex {
  dependencies: Record<string, string[]>
  dependents: Record<string, string[]>
  related: Record<string, string[]>
}

interface FulfillmentStats {
  total: number
  fulfilled: number
  partial: number
  unfulfilled: number
}

export function useSpecs(projectId: string) {
  const specs = useState<SpecFile[]>(`specs-${projectId}`, () => [])
  const index = useState<SpecIndex>(`specs-index-${projectId}`, () => ({
    dependencies: {},
    dependents: {},
    related: {},
  }))
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchSpecs(branch = 'main') {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<{ specs: SpecFile[]; index: SpecIndex }>(
        `/api/projects/${projectId}/specs`,
        { query: { branch } },
      )
      specs.value = data.specs
      index.value = data.index
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || 'Failed to load specs'
    } finally {
      loading.value = false
    }
  }

  const specsByCategory = computed(() => {
    const grouped: Record<string, SpecFile[]> = {}
    for (const spec of specs.value) {
      const cat = spec.meta.category
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(spec)
    }
    // Sort categories alphabetically
    return Object.fromEntries(
      Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)),
    )
  })

  const fulfillmentStats = computed<FulfillmentStats>(() => {
    const stats: FulfillmentStats = { total: 0, fulfilled: 0, partial: 0, unfulfilled: 0 }
    for (const spec of specs.value) {
      stats.total++
      const f = spec.meta.fulfillment as SpecFulfillment
      if (f === 'fulfilled') stats.fulfilled++
      else if (f === 'partial') stats.partial++
      else stats.unfulfilled++
    }
    return stats
  })

  return { specs, index, loading, error, fetchSpecs, specsByCategory, fulfillmentStats }
}
