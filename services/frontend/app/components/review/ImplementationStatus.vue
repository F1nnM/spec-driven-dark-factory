<script setup lang="ts">
const props = defineProps<{
  revision: {
    status: string
    revisionNumber: number
  } | null
  steps: {
    stepNumber: number
    status: string
    branchName: string
    reviewLoopCount: number
    reviewSummary: string | null
  }[]
}>()

const completedSteps = computed(() =>
  props.steps.filter((s) => s.status === 'completed').length,
)

const totalSteps = computed(() => props.steps.length)

const progressPercent = computed(() => {
  if (totalSteps.value === 0) return 0
  return Math.round((completedSteps.value / totalSteps.value) * 100)
})

const currentStep = computed(() =>
  props.steps.find((s) => s.status === 'implementing' || s.status === 'reviewing'),
)

function statusBadgeClasses(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-gray-800/50 text-gray-400 border-gray-700'
    case 'implementing':
      return 'bg-blue-900/50 text-blue-300 border-blue-700'
    case 'reviewing':
      return 'bg-purple-900/50 text-purple-300 border-purple-700'
    case 'completed':
      return 'bg-green-900/50 text-green-300 border-green-700'
    case 'failed':
      return 'bg-red-900/50 text-red-300 border-red-700'
    default:
      return 'bg-gray-800/50 text-gray-400 border-gray-700'
  }
}

function revisionStatusLabel(status: string) {
  switch (status) {
    case 'drafting':
      return 'Drafting'
    case 'approved':
      return 'Approved'
    case 'implementing':
      return 'Implementing'
    case 'completed':
      return 'Completed'
    case 'interrupted':
      return 'Interrupted'
    default:
      return status
  }
}

function revisionStatusClasses(status: string) {
  switch (status) {
    case 'implementing':
      return 'bg-blue-900/50 text-blue-300 border-blue-700'
    case 'completed':
      return 'bg-green-900/50 text-green-300 border-green-700'
    case 'interrupted':
      return 'bg-red-900/50 text-red-300 border-red-700'
    default:
      return 'bg-gray-800/50 text-gray-400 border-gray-700'
  }
}
</script>

<template>
  <div v-if="revision" class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h3 class="text-lg font-semibold text-white">
          Revision {{ revision.revisionNumber }}
        </h3>
        <span
          class="text-xs px-2.5 py-1 rounded-full border font-medium"
          :class="revisionStatusClasses(revision.status)"
        >
          {{ revisionStatusLabel(revision.status) }}
        </span>
      </div>
      <span v-if="totalSteps > 0" class="text-sm text-gray-400">
        {{ completedSteps }}/{{ totalSteps }} steps complete
      </span>
    </div>

    <!-- Progress bar -->
    <div v-if="totalSteps > 0" class="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>

    <!-- Current step info -->
    <div
      v-if="currentStep"
      class="bg-gray-900 border border-gray-800 rounded-lg p-4"
    >
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <span class="text-white font-medium">Step {{ currentStep.stepNumber }}</span>
          <span
            class="text-xs px-2 py-0.5 rounded-full border"
            :class="statusBadgeClasses(currentStep.status)"
          >
            {{ currentStep.status }}
          </span>
        </div>
        <span v-if="currentStep.reviewLoopCount > 0" class="text-xs text-gray-400">
          Review loops: {{ currentStep.reviewLoopCount }}
        </span>
      </div>
      <p class="text-gray-500 font-mono text-xs">{{ currentStep.branchName }}</p>
      <p
        v-if="currentStep.reviewSummary"
        class="mt-2 text-sm text-gray-300 bg-gray-800/50 rounded px-3 py-2"
      >
        {{ currentStep.reviewSummary }}
      </p>
    </div>

    <!-- All steps list -->
    <div v-if="steps.length > 0" class="space-y-2">
      <h4 class="text-sm font-medium text-gray-400 mb-3">All Steps</h4>
      <div
        v-for="step in steps"
        :key="step.stepNumber"
        class="flex items-center gap-3 px-4 py-2.5 bg-gray-900/50 border border-gray-800/50 rounded-lg"
      >
        <div
          class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
          :class="
            step.status === 'completed'
              ? 'bg-green-900/50 text-green-400'
              : step.status === 'failed'
                ? 'bg-red-900/50 text-red-400'
                : step.status === 'implementing' || step.status === 'reviewing'
                  ? 'bg-blue-900/50 text-blue-400'
                  : 'bg-gray-800 text-gray-500'
          "
        >
          {{ step.stepNumber }}
        </div>
        <span class="text-gray-500 font-mono text-xs flex-1 truncate">{{ step.branchName }}</span>
        <span
          class="text-xs px-2 py-0.5 rounded-full border shrink-0"
          :class="statusBadgeClasses(step.status)"
        >
          {{ step.status }}
        </span>
        <span v-if="step.reviewLoopCount > 0" class="text-xs text-gray-500">
          {{ step.reviewLoopCount }} review{{ step.reviewLoopCount === 1 ? '' : 's' }}
        </span>
      </div>
    </div>

    <!-- Empty state for no steps -->
    <div v-if="steps.length === 0 && revision.status === 'implementing'" class="text-gray-500 text-center py-4">
      Planning implementation steps...
    </div>
  </div>
</template>
