<script setup lang="ts">
const props = defineProps<{
  fulfillment: 'unfulfilled' | 'partial' | 'fulfilled'
  explanation?: string
}>()

const config = computed(() => {
  switch (props.fulfillment) {
    case 'fulfilled':
      return { color: 'bg-green-500', textColor: 'text-green-400', label: 'Fulfilled' }
    case 'partial':
      return { color: 'bg-yellow-500', textColor: 'text-yellow-400', label: 'Partial' }
    case 'unfulfilled':
      return { color: 'bg-red-500', textColor: 'text-red-400', label: 'Unfulfilled' }
  }
})

const showTooltip = ref(false)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-xs font-medium relative"
    :class="config.textColor"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <span class="w-2 h-2 rounded-full" :class="config.color" />
    {{ config.label }}

    <div
      v-if="showTooltip && explanation"
      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 whitespace-nowrap z-50 shadow-lg"
    >
      {{ explanation }}
      <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-700" />
    </div>
  </span>
</template>
