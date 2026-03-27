<script setup lang="ts">
const props = defineProps<{
  steps: {
    stepNumber: number
    status: string
    branchName: string
  }[]
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [action: 'keep_partial' | 'rollback' | 'discard', keepStepNumber?: number]
}>()

const selectedAction = ref<'keep_partial' | 'rollback' | 'discard'>('keep_partial')
const keepStepNumber = ref(0)

const completedSteps = computed(() =>
  props.steps.filter((s) => s.status === 'completed'),
)

const pendingSteps = computed(() =>
  props.steps.filter((s) => s.status !== 'completed'),
)

// Default to keeping up to the last completed step
watchEffect(() => {
  const lastCompleted = completedSteps.value.at(-1)
  keepStepNumber.value = lastCompleted?.stepNumber ?? 0
})

function confirm() {
  if (selectedAction.value === 'keep_partial') {
    emit('confirm', selectedAction.value, keepStepNumber.value)
  } else {
    emit('confirm', selectedAction.value)
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
      <h3 class="text-lg font-semibold text-white mb-4">Interrupt Implementation</h3>

      <!-- Step summary -->
      <div class="mb-5 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
        <div class="flex items-center gap-4 text-sm">
          <span class="text-green-400">
            {{ completedSteps.length }} completed
          </span>
          <span class="text-gray-400">
            {{ pendingSteps.length }} pending/in-progress
          </span>
        </div>
      </div>

      <!-- Options -->
      <div class="space-y-3 mb-6">
        <!-- Keep partial -->
        <label
          class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
          :class="selectedAction === 'keep_partial'
            ? 'border-blue-600 bg-blue-900/20'
            : 'border-gray-700 hover:border-gray-600'"
        >
          <input
            v-model="selectedAction"
            type="radio"
            value="keep_partial"
            class="mt-1 accent-blue-500"
          />
          <div>
            <p class="text-white font-medium text-sm">Keep Partial Work</p>
            <p class="text-gray-400 text-xs mt-0.5">
              Completed steps become the new baseline. Remaining specs become a new draft revision.
            </p>
            <div v-if="selectedAction === 'keep_partial' && completedSteps.length > 0" class="mt-2">
              <label class="text-xs text-gray-400 block mb-1">Keep steps up to:</label>
              <select
                v-model.number="keepStepNumber"
                class="bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded px-2 py-1"
              >
                <option v-for="step in completedSteps" :key="step.stepNumber" :value="step.stepNumber">
                  Step {{ step.stepNumber }} ({{ step.branchName }})
                </option>
              </select>
            </div>
          </div>
        </label>

        <!-- Rollback -->
        <label
          class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
          :class="selectedAction === 'rollback'
            ? 'border-yellow-600 bg-yellow-900/20'
            : 'border-gray-700 hover:border-gray-600'"
        >
          <input
            v-model="selectedAction"
            type="radio"
            value="rollback"
            class="mt-1 accent-yellow-500"
          />
          <div>
            <p class="text-white font-medium text-sm">Rollback</p>
            <p class="text-gray-400 text-xs mt-0.5">
              Revert to drafting state. The spec diff remains as an unapproved edit for further refinement.
            </p>
          </div>
        </label>

        <!-- Discard -->
        <label
          class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
          :class="selectedAction === 'discard'
            ? 'border-red-600 bg-red-900/20'
            : 'border-gray-700 hover:border-gray-600'"
        >
          <input
            v-model="selectedAction"
            type="radio"
            value="discard"
            class="mt-1 accent-red-500"
          />
          <div>
            <p class="text-white font-medium text-sm">Discard</p>
            <p class="text-gray-400 text-xs mt-0.5">
              Throw away the entire revision. All spec changes and implementation work will be deleted.
            </p>
          </div>
        </label>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-3">
        <button
          class="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          :class="{
            'bg-blue-600 hover:bg-blue-500 text-white': selectedAction === 'keep_partial',
            'bg-yellow-600 hover:bg-yellow-500 text-white': selectedAction === 'rollback',
            'bg-red-600 hover:bg-red-500 text-white': selectedAction === 'discard',
          }"
          @click="confirm"
        >
          Confirm {{ selectedAction === 'keep_partial' ? 'Keep Partial' : selectedAction === 'rollback' ? 'Rollback' : 'Discard' }}
        </button>
      </div>
    </div>
  </div>
</template>
