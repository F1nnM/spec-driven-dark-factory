<script setup lang="ts">
const route = useRoute()
const projectId = route.params.id as string
const { specs, loading, error, fetchSpecs, specsByCategory, fulfillmentStats } =
  useSpecs(projectId)

const showGraph = ref(false)
const collapsedCategories = ref<Set<string>>(new Set())

function toggleCategory(category: string) {
  if (collapsedCategories.value.has(category)) {
    collapsedCategories.value.delete(category)
  } else {
    collapsedCategories.value.add(category)
  }
}

onMounted(() => {
  fetchSpecs()
})
</script>

<template>
  <div>
    <!-- Loading state -->
    <div v-if="loading" class="text-gray-400 py-8 text-center">
      <div class="inline-flex items-center gap-2">
        <svg
          class="animate-spin h-5 w-5 text-blue-500"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading specs...
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-red-400 py-8 text-center">
      <p class="mb-2">{{ error }}</p>
      <button
        class="text-sm text-blue-400 hover:text-blue-300"
        @click="fetchSpecs()"
      >
        Retry
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="specs.length === 0"
      class="text-gray-400 py-12 text-center"
    >
      <p class="text-lg mb-2">No specs found</p>
      <p class="text-sm text-gray-500">
        Add markdown spec files to your repository's specs directory.
      </p>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Summary stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div class="text-2xl font-bold text-white">
            {{ fulfillmentStats.total }}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">Total Specs</div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div class="text-2xl font-bold text-green-400">
            {{ fulfillmentStats.fulfilled }}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">Fulfilled</div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div class="text-2xl font-bold text-yellow-400">
            {{ fulfillmentStats.partial }}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">Partial</div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div class="text-2xl font-bold text-red-400">
            {{ fulfillmentStats.unfulfilled }}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">Unfulfilled</div>
        </div>
      </div>

      <!-- Graph toggle -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-white">
          Specs by Category
        </h2>
        <button
          class="text-sm px-3 py-1.5 rounded-lg border transition-colors"
          :class="
            showGraph
              ? 'bg-blue-900/30 border-blue-800 text-blue-400'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
          "
          @click="showGraph = !showGraph"
        >
          {{ showGraph ? 'Hide Graph' : 'Show Dependency Graph' }}
        </button>
      </div>

      <!-- Graph visualization -->
      <div v-if="showGraph" class="mb-8">
        <SpecsSpecGraph :specs="specs" />
      </div>

      <!-- Categories -->
      <div class="space-y-6">
        <div
          v-for="(categorySpecs, category) in specsByCategory"
          :key="category"
        >
          <button
            class="w-full flex items-center gap-3 mb-3 group"
            @click="toggleCategory(category as string)"
          >
            <svg
              class="w-4 h-4 text-gray-500 transition-transform"
              :class="{ '-rotate-90': collapsedCategories.has(category as string) }"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clip-rule="evenodd"
              />
            </svg>
            <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wider group-hover:text-white transition-colors">
              {{ category }}
            </h3>
            <span class="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">
              {{ categorySpecs.length }}
            </span>
          </button>

          <div
            v-if="!collapsedCategories.has(category as string)"
            class="space-y-3 ml-7"
          >
            <SpecsSpecCard
              v-for="spec in categorySpecs"
              :key="spec.meta.id"
              :spec="spec"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
