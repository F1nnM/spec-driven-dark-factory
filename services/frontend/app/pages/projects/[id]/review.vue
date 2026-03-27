<script setup lang="ts">
const route = useRoute()
const projectId = route.params.id as string
const { revision, steps, changes, approving, error, loading, loadReview, approve, pollStatus } =
  useReview(projectId)

const diffCollapsed = ref(false)
let pollInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await loadReview()
  startPollingIfNeeded()
})

onUnmounted(() => {
  stopPolling()
})

watch(
  () => revision.value?.status,
  (status) => {
    if (status === 'implementing') {
      startPollingIfNeeded()
    } else {
      stopPolling()
    }
  },
)

function startPollingIfNeeded() {
  if (revision.value?.status === 'implementing' && !pollInterval) {
    pollInterval = setInterval(pollStatus, 5000)
  }
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

async function handleApprove() {
  try {
    await approve()
    diffCollapsed.value = true
  } catch {
    // Error already set in composable
  }
}
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="text-gray-400 py-8 text-center">
      <p class="text-lg">Loading review...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-red-400 py-8 text-center">
      <p>{{ error }}</p>
      <button
        class="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
        @click="loadReview"
      >
        Retry
      </button>
    </div>

    <!-- No active revision -->
    <div
      v-else-if="!revision && changes.length === 0"
      class="text-gray-400 py-12 text-center"
    >
      <svg class="w-12 h-12 mx-auto mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p class="text-lg font-medium mb-1">No pending changes</p>
      <p class="text-sm text-gray-500">Start a drafting session to create spec changes for review.</p>
    </div>

    <!-- Completed revision -->
    <div
      v-else-if="revision?.status === 'completed'"
      class="py-12 text-center"
    >
      <svg class="w-16 h-16 mx-auto mb-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p class="text-xl font-semibold text-green-400 mb-2">Implementation Complete</p>
      <p class="text-gray-400 text-sm">
        Revision {{ revision.revisionNumber }} has been fully implemented.
      </p>
    </div>

    <!-- Interrupted revision -->
    <div
      v-else-if="revision?.status === 'interrupted'"
      class="py-12 text-center"
    >
      <svg class="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <p class="text-xl font-semibold text-red-400 mb-2">Implementation Interrupted</p>
      <p class="text-gray-400 text-sm">
        Revision {{ revision.revisionNumber }} was interrupted during implementation.
      </p>
    </div>

    <!-- Active review content -->
    <template v-else>
      <!-- Drafting: show diff + approve -->
      <div v-if="revision?.status === 'drafting' || (!revision && changes.length > 0)">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-lg font-semibold text-white">Review Changes</h2>
            <p class="text-sm text-gray-500 mt-1">
              {{ changes.length }} spec{{ changes.length === 1 ? '' : 's' }} changed
            </p>
          </div>
          <button
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg text-sm transition-colors"
            :disabled="approving || changes.length === 0"
            @click="handleApprove"
          >
            <span v-if="approving">Approving...</span>
            <span v-else>Approve &amp; Implement</span>
          </button>
        </div>

        <ReviewSpecDiff :changes="changes" />
      </div>

      <!-- Implementing: show status + collapsed diff -->
      <div v-if="revision?.status === 'implementing' || revision?.status === 'approved'">
        <ReviewImplementationStatus :revision="revision" :steps="steps" />

        <div v-if="changes.length > 0" class="mt-8">
          <button
            class="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors mb-4"
            @click="diffCollapsed = !diffCollapsed"
          >
            <svg
              class="w-4 h-4 transition-transform"
              :class="{ '-rotate-90': diffCollapsed }"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clip-rule="evenodd"
              />
            </svg>
            Spec Changes ({{ changes.length }})
          </button>

          <ReviewSpecDiff v-if="!diffCollapsed" :changes="changes" />
        </div>
      </div>
    </template>
  </div>
</template>
