<script setup lang="ts">
const props = defineProps<{
  score: number
}>()

const emit = defineEmits<{
  restructure: []
}>()

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
    <div class="flex-1 min-w-0">
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
    </div>
    <button
      class="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
      @click="emit('restructure')"
    >
      Restructure
    </button>
  </div>
</template>
