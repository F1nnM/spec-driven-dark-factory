<script setup lang="ts">
const { projects, fetchProjects, deleteProject } = useProjects()
const loading = ref(true)

onMounted(async () => {
  try {
    await fetchProjects()
  } finally {
    loading.value = false
  }
})

async function handleDelete(projectId: string, projectName: string) {
  if (!confirm(`Delete project "${projectName}"? This cannot be undone.`)) return
  await deleteProject(projectId)
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white p-8">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-8">
        <h1 class="text-3xl font-bold">Projects</h1>
        <NuxtLink
          to="/projects/new"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
        >
          New Project
        </NuxtLink>
      </div>

      <div v-if="loading" class="text-gray-400">Loading projects...</div>

      <div v-else-if="projects.length === 0" class="text-gray-400 text-center py-16">
        <p class="text-lg mb-4">No projects yet</p>
        <NuxtLink
          to="/projects/new"
          class="text-blue-400 hover:text-blue-300"
        >
          Create your first project
        </NuxtLink>
      </div>

      <div v-else class="grid gap-4">
        <div
          v-for="project in projects"
          :key="project.id"
          class="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-colors flex items-start justify-between"
        >
          <NuxtLink :to="`/projects/${project.id}`" class="flex-1 min-w-0">
            <h2 class="text-xl font-semibold mb-2">{{ project.name }}</h2>
            <p class="text-gray-400 text-sm font-mono mb-3 truncate">{{ project.gitUrl }}</p>
            <div class="flex items-center gap-4 text-sm text-gray-500">
              <span>{{ project.memberCount ?? 0 }} member{{ (project.memberCount ?? 0) === 1 ? '' : 's' }}</span>
              <span>Revision {{ project.currentRevision ?? 0 }}</span>
            </div>
          </NuxtLink>
          <button
            class="ml-4 p-2 text-gray-500 hover:text-red-400 transition-colors shrink-0"
            title="Delete project"
            @click.prevent="handleDelete(project.id, project.name)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
