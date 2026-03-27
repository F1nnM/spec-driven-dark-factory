<script setup lang="ts">
const route = useRoute()
const projectId = route.params.id as string
const { messages, draftSpecs, mainSpecs, sending, revisionNumber, error, loadChat, sendMessage, loadDraftSpecs } =
  useChat(projectId)

const restructureScore = ref(0)

function handleRestructure() {
  // Placeholder: restructuring will use the same drafting flow
}

onMounted(async () => {
  await Promise.all([loadChat(), loadDraftSpecs()])
})
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-8rem)]">
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
