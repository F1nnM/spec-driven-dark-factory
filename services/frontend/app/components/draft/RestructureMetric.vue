<script setup lang="ts">
const props = defineProps<{
  score: number
  reasoning?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  restructure: []
}>()

const showTooltip = ref(false)
const clampedScore = computed(() => Math.max(0, Math.min(100, props.score)))

const barColor = computed(() => {
  const s = clampedScore.value
  if (s < 33) return 'bg-green-500'
  if (s < 66) return 'bg-yellow-500'
  return 'bg-red-500'
})

const textColor = computed(() => {
  const s = clampedScore.value
  if (s < 33) return 'text-green-400'
  if (s < 66) return 'text-yellow-400'
  return 'text-red-400'
})

const label = computed(() => {
  const s = clampedScore.value
  if (s < 33) return 'Healthy'
  if (s < 66) return 'Consider Restructuring'
  return 'Restructuring Recommended'
})
</script>

<template>
  <div class="flex items-center gap-4">
    <div
      class="flex-1 min-w-0 relative"
      @mouseenter="showTooltip = true"
      @mouseleave="showTooltip = false"
    >
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-gray-400">Restructuring</span>
        <span class="text-xs font-medium" :class="textColor">
          {{ label }} ({{ clampedScore }})
        </span>
      </div>
      <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-300"
          :class="barColor"
          :style="{ width: `${clampedScore}%` }"
        />
      </div>

      <!-- Reasoning tooltip -->
      <div
        v-if="showTooltip && reasoning"
        class="absolute z-10 top-full mt-2 left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl"
      >
        <p class="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{{ reasoning }}</p>
      </div>
    </div>
    <button
      class="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-gray-600 transition-colors disabled:opacity-50"
      :disabled="loading"
      @click="emit('restructure')"
    >
      <span v-if="loading">Evaluating...</span>
      <span v-else>Restructure</span>
    </button>
  </div>
</template>
