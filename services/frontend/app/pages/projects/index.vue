<script setup lang="ts">
const { projects, fetchProjects } = useProjects()
const loading = ref(true)

onMounted(async () => {
  try {
    await fetchProjects()
  } finally {
    loading.value = false
  }
})
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
        <NuxtLink
          v-for="project in projects"
          :key="project.id"
          :to="`/projects/${project.id}`"
          class="block bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-colors"
        >
          <h2 class="text-xl font-semibold mb-2">{{ project.name }}</h2>
          <p class="text-gray-400 text-sm font-mono mb-3">{{ project.gitUrl }}</p>
          <div class="flex items-center gap-4 text-sm text-gray-500">
            <span>{{ project.memberCount ?? 0 }} member{{ (project.memberCount ?? 0) === 1 ? '' : 's' }}</span>
            <span>Revision {{ project.currentRevision ?? 0 }}</span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
