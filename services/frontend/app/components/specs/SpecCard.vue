<script setup lang="ts">
import type { SpecFile } from '@spec-factory/shared'

const props = defineProps<{
  spec: SpecFile
}>()

const expanded = ref(false)

const statusColor = computed(() => {
  switch (props.spec.meta.status) {
    case 'approved':
      return 'bg-blue-900/50 text-blue-300 border-blue-800'
    case 'implemented':
      return 'bg-green-900/50 text-green-300 border-green-800'
    case 'deprecated':
      return 'bg-gray-800/50 text-gray-400 border-gray-700'
    case 'draft':
    default:
      return 'bg-gray-800/50 text-gray-300 border-gray-700'
  }
})
</script>

<template>
  <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
    <button
      class="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-800/50 transition-colors"
      @click="expanded = !expanded"
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 mb-1.5">
          <h3 class="text-white font-medium truncate">{{ spec.meta.title }}</h3>
          <span
            class="shrink-0 text-xs px-2 py-0.5 rounded-full border"
            :class="statusColor"
          >
            {{ spec.meta.status }}
          </span>
        </div>

        <div class="flex items-center flex-wrap gap-3 text-xs">
          <span class="text-gray-500 font-mono">{{ spec.meta.id }}</span>
          <SpecsFulfillmentBadge
            :fulfillment="spec.meta.fulfillment"
            :explanation="spec.meta.fulfillment_explanation"
          />
          <span
            v-for="tag in spec.meta.tags"
            :key="tag"
            class="px-2 py-0.5 bg-gray-800 text-gray-400 rounded"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <svg
        class="w-5 h-5 text-gray-500 shrink-0 mt-1 transition-transform"
        :class="{ 'rotate-180': expanded }"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>

    <div v-if="expanded" class="px-5 pb-4 border-t border-gray-800">
      <div
        v-if="spec.meta.depends_on.length > 0 || spec.meta.relates_to.length > 0"
        class="flex flex-wrap gap-4 py-3 text-xs"
      >
        <div v-if="spec.meta.depends_on.length > 0" class="flex items-center gap-1.5">
          <span class="text-gray-500">Depends on:</span>
          <span
            v-for="dep in spec.meta.depends_on"
            :key="dep"
            class="px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded border border-blue-800/50"
          >
            {{ dep }}
          </span>
        </div>
        <div v-if="spec.meta.relates_to.length > 0" class="flex items-center gap-1.5">
          <span class="text-gray-500">Relates to:</span>
          <span
            v-for="rel in spec.meta.relates_to"
            :key="rel"
            class="px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded border border-purple-800/50"
          >
            {{ rel }}
          </span>
        </div>
      </div>

      <div class="prose prose-invert prose-sm max-w-none pt-3 text-gray-300">
        <div v-html="renderMarkdown(spec.body)" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
function renderMarkdown(text: string): string {
  // Simple markdown rendering for spec bodies
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-white font-semibold text-base mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-white font-semibold text-lg mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-white font-bold text-xl mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-800 px-1 py-0.5 rounded text-blue-300">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/^(?!<[hlu])/gm, (match) => (match ? `<p class="mb-2">${match}` : match))
}
</script>
