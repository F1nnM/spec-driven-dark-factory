<script setup lang="ts">
const route = useRoute()
const projectId = route.params.id as string
const { messages, draftSpecs, mainSpecs, sending, revisionNumber, error, loadChat, sendMessage, loadDraftSpecs } =
  useChat(projectId)

const restructureScore = ref(0)
const restructureReasoning = ref('')
const restructureLoading = ref(false)
const implementingRevision = ref<{ revisionNumber: number } | null>(null)

// Check if there's a currently implementing revision
async function checkImplementingRevision() {
  try {
    const data = await $fetch<{
      revision: { revisionNumber: number; status: string } | null
    }>(`/api/projects/${projectId}/revision`)

    if (data.revision && (data.revision.status === 'implementing' || data.revision.status === 'approved')) {
      implementingRevision.value = { revisionNumber: data.revision.revisionNumber }
    } else {
      implementingRevision.value = null
    }
  } catch {
    // Ignore errors
  }
}

async function handleRestructure() {
  restructureLoading.value = true
  try {
    const result = await $fetch<{ score: number; reasoning: string }>(
      `/api/projects/${projectId}/restructure`,
      {
        method: 'POST',
        body: { action: 'evaluate' },
      },
    )
    restructureScore.value = result.score
    restructureReasoning.value = result.reasoning
  } catch (e: any) {
    error.value = e?.data?.message || e?.statusMessage || 'Failed to evaluate restructuring'
  } finally {
    restructureLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadChat(), loadDraftSpecs(), checkImplementingRevision()])
})
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-8rem)]">
    <!-- Concurrent implementation banner -->
    <div
      v-if="implementingRevision"
      class="mb-3 px-4 py-2.5 bg-blue-900/30 border border-blue-700/50 rounded-lg flex items-center gap-3"
    >
      <svg class="w-5 h-5 text-blue-400 shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <p class="text-sm text-blue-300">
        Revision {{ implementingRevision.revisionNumber }} is being implemented.
        <span v-if="revisionNumber">You're drafting revision {{ revisionNumber }}.</span>
      </p>
    </div>

    <!-- Top bar -->
    <div class="flex items-center justify-between gap-4 mb-4 px-1">
      <div class="flex items-center gap-4">
        <h2 class="text-lg font-semibold text-white">Spec Drafting</h2>
        <span
          v-if="revisionNumber != null"
          class="text-xs px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-300 font-mono"
        >
          Revision {{ revisionNumber }}
        </span>
      </div>
      <div class="w-80">
        <DraftRestructureMetric
          :score="restructureScore"
          :reasoning="restructureReasoning"
          :loading="restructureLoading"
          @restructure="handleRestructure"
        />
      </div>
    </div>

    <!-- Two-column layout -->
    <div class="flex-1 flex gap-4 min-h-0">
      <!-- Left column: Chat (60%) -->
      <div class="w-[60%] bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
        <DraftChatPanel :project-id="projectId" />
      </div>

      <!-- Right column: Draft specs (40%) -->
      <div class="w-[40%] bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <DraftSpecDraftPanel
          :specs="draftSpecs"
          :main-specs="mainSpecs"
        />
      </div>
    </div>
  </div>
</template>
