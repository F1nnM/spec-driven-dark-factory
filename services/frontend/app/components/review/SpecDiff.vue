<script setup lang="ts">
import type { SpecChange } from '@spec-factory/shared'

defineProps<{
  changes: SpecChange[]
}>()

const expandedIds = ref<Set<string>>(new Set())

function toggleExpand(specId: string) {
  const next = new Set(expandedIds.value)
  if (next.has(specId)) {
    next.delete(specId)
  } else {
    next.add(specId)
  }
  expandedIds.value = next
}

function borderColor(type: string) {
  switch (type) {
    case 'added':
      return 'border-l-green-500'
    case 'removed':
      return 'border-l-red-500'
    case 'modified':
      return 'border-l-yellow-500'
    default:
      return 'border-l-gray-500'
  }
}

function badgeClasses(type: string) {
  switch (type) {
    case 'added':
      return 'bg-green-900/50 text-green-300 border-green-700'
    case 'removed':
      return 'bg-red-900/50 text-red-300 border-red-700'
    case 'modified':
      return 'bg-yellow-900/50 text-yellow-300 border-yellow-700'
    default:
      return 'bg-gray-800/50 text-gray-300 border-gray-700'
  }
}

function badgeLabel(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(none)'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ') || '(empty)'
  return JSON.stringify(value)
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="changes.length === 0" class="text-gray-500 text-center py-6">
      No changes detected
    </div>

    <div
      v-for="change in changes"
      :key="change.specId"
      class="bg-gray-900 border border-gray-800 border-l-4 rounded-lg overflow-hidden"
      :class="borderColor(change.type)"
    >
      <button
        class="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-800/50 transition-colors"
        @click="toggleExpand(change.specId)"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 mb-1">
            <h3
              class="font-medium truncate"
              :class="change.type === 'removed' ? 'text-gray-400 line-through' : 'text-white'"
            >
              {{ change.spec.meta.title }}
            </h3>
            <span
              class="shrink-0 text-xs px-2 py-0.5 rounded-full border"
              :class="badgeClasses(change.type)"
            >
              {{ badgeLabel(change.type) }}
            </span>
          </div>
          <span class="text-gray-500 font-mono text-xs">{{ change.specId }}</span>
        </div>

        <svg
          class="w-5 h-5 text-gray-500 shrink-0 mt-1 transition-transform"
          :class="{ 'rotate-180': expandedIds.has(change.specId) }"
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

      <div v-if="expandedIds.has(change.specId)" class="px-5 pb-4 border-t border-gray-800">
        <!-- Field changes for modified specs -->
        <div v-if="change.type === 'modified' && change.fieldChanges" class="space-y-2 pt-3">
          <div
            v-for="fc in change.fieldChanges"
            :key="fc.field"
            class="text-sm"
          >
            <span class="text-gray-400 font-mono">{{ fc.field }}:</span>
            <div v-if="fc.field === 'body'" class="mt-1 space-y-1">
              <div class="bg-red-900/20 text-red-300 px-3 py-1.5 rounded text-xs font-mono whitespace-pre-wrap line-clamp-6">- {{ formatValue(fc.oldValue) }}</div>
              <div class="bg-green-900/20 text-green-300 px-3 py-1.5 rounded text-xs font-mono whitespace-pre-wrap line-clamp-6">+ {{ formatValue(fc.newValue) }}</div>
            </div>
            <div v-else class="flex items-center gap-2 mt-0.5">
              <span class="text-red-400 text-xs line-through">{{ formatValue(fc.oldValue) }}</span>
              <span class="text-gray-600">-&gt;</span>
              <span class="text-green-400 text-xs">{{ formatValue(fc.newValue) }}</span>
            </div>
          </div>
        </div>

        <!-- Spec body for added/removed -->
        <div
          v-if="change.type !== 'modified'"
          class="pt-3 text-sm text-gray-300 whitespace-pre-wrap font-mono"
        >
          {{ change.spec.body }}
        </div>
      </div>
    </div>
  </div>
</template>
