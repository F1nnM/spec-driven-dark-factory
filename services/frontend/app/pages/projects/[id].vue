<script setup lang="ts">
const route = useRoute()
const { fetchProject } = useProjects()

const projectId = route.params.id as string
const project = ref<{
  id: string
  name: string
  gitUrl: string
  specsPath: string
  currentRevision: number | null
  createdAt: string
  memberCount?: number
} | null>(null)
const loading = ref(true)
const error = ref('')

const tabs = [
  { label: 'Specs', to: `/projects/${projectId}/specs` },
  { label: 'Draft', to: `/projects/${projectId}/draft` },
  { label: 'Review', to: `/projects/${projectId}/review` },
]

onMounted(async () => {
  try {
    project.value = await fetchProject(projectId)
  } catch (e: any) {
    error.value = e?.data?.message || e?.statusMessage || 'Failed to load project'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white p-8">
    <div class="max-w-5xl mx-auto">
      <NuxtLink to="/projects" class="text-gray-400 hover:text-gray-300 text-sm mb-4 inline-block">
        &larr; All Projects
      </NuxtLink>

      <div v-if="loading" class="text-gray-400">Loading project...</div>
      <div v-else-if="error" class="text-red-400">{{ error }}</div>

      <template v-else-if="project">
        <div class="mb-8">
          <h1 class="text-3xl font-bold mb-2">{{ project.name }}</h1>
          <p class="text-gray-400 font-mono text-sm">{{ project.gitUrl }}</p>
          <div class="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span>{{ project.memberCount ?? 0 }} member{{ (project.memberCount ?? 0) === 1 ? '' : 's' }}</span>
            <span>Specs path: {{ project.specsPath }}</span>
            <span>Revision {{ project.currentRevision ?? 0 }}</span>
          </div>
        </div>

        <nav class="flex border-b border-gray-800 mb-8">
          <NuxtLink
            v-for="tab in tabs"
            :key="tab.to"
            :to="tab.to"
            class="px-6 py-3 text-sm font-medium border-b-2 transition-colors"
            :class="
              $route.path === tab.to
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
            "
          >
            {{ tab.label }}
          </NuxtLink>
        </nav>

        <NuxtPage />
      </template>
    </div>
  </div>
</template>
