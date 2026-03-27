<script setup lang="ts">
import type { SpecFile } from '@spec-factory/shared'

const props = defineProps<{
  specs: SpecFile[]
  mainSpecs: SpecFile[]
}>()

const collapsedCategories = ref<Set<string>>(new Set())

function toggleCategory(category: string) {
  if (collapsedCategories.value.has(category)) {
    collapsedCategories.value.delete(category)
  } else {
    collapsedCategories.value.add(category)
  }
}

const mainSpecIds = computed(() => new Set(props.mainSpecs.map((s) => s.meta.id)))

function specChangeType(spec: SpecFile): 'new' | 'modified' | 'unchanged' {
  if (!mainSpecIds.value.has(spec.meta.id)) return 'new'
  const mainSpec = props.mainSpecs.find((s) => s.meta.id === spec.meta.id)
  if (!mainSpec) return 'new'
  // Compare body content to detect modifications
  if (mainSpec.body !== spec.body) return 'modified'
  // Compare key frontmatter fields
  if (
    mainSpec.meta.title !== spec.meta.title ||
    mainSpec.meta.status !== spec.meta.status ||
    mainSpec.meta.category !== spec.meta.category ||
    JSON.stringify(mainSpec.meta.depends_on) !== JSON.stringify(spec.meta.depends_on) ||
    JSON.stringify(mainSpec.meta.relates_to) !== JSON.stringify(spec.meta.relates_to) ||
    JSON.stringify(mainSpec.meta.tags) !== JSON.stringify(spec.meta.tags)
  ) {
    return 'modified'
  }
  return 'unchanged'
}

const specsByCategory = computed(() => {
  const grouped: Record<string, SpecFile[]> = {}
  for (const spec of props.specs) {
    const cat = spec.meta.category
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(spec)
  }
  return Object.fromEntries(
    Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)),
  )
})
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <!-- Empty state -->
    <div
      v-if="specs.length === 0"
      class="flex items-center justify-center h-full text-gray-500"
    >
      <div class="text-center">
        <p class="text-lg mb-2">No draft specs yet</p>
        <p class="text-sm">
          Start chatting to draft spec changes.
        </p>
      </div>
    </div>

    <!-- Categories -->
    <div v-else class="space-y-5">
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
          <div
            v-for="spec in categorySpecs"
            :key="spec.meta.id"
            class="relative"
          >
            <!-- Change badge -->
            <span
              v-if="specChangeType(spec) === 'new'"
              class="absolute -top-2 -right-2 z-10 text-xs px-2 py-0.5 rounded-full bg-green-900/70 text-green-300 border border-green-700"
            >
              New
            </span>
            <span
              v-else-if="specChangeType(spec) === 'modified'"
              class="absolute -top-2 -right-2 z-10 text-xs px-2 py-0.5 rounded-full bg-yellow-900/70 text-yellow-300 border border-yellow-700"
            >
              Modified
            </span>

            <SpecsSpecCard :spec="spec" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
