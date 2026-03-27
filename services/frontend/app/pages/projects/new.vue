<script setup lang="ts">
const { createProject } = useProjects()

const name = ref('')
const gitUrl = ref('')
const sshPrivateKey = ref('')
const specsPath = ref('/specs')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    const project = await createProject({
      name: name.value,
      gitUrl: gitUrl.value,
      sshPrivateKey: sshPrivateKey.value,
      specsPath: specsPath.value || undefined,
    })
    await navigateTo(`/projects/${project.id}`)
  } catch (e: any) {
    error.value = e?.data?.message || e?.statusMessage || 'Failed to create project'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white p-8">
    <div class="max-w-xl mx-auto">
      <h1 class="text-3xl font-bold mb-8">New Project</h1>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <div>
          <label for="name" class="block text-sm font-medium text-gray-300 mb-1">Project Name</label>
          <input
            id="name"
            v-model="name"
            type="text"
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="My Project"
          />
        </div>

        <div>
          <label for="gitUrl" class="block text-sm font-medium text-gray-300 mb-1">Git URL</label>
          <input
            id="gitUrl"
            v-model="gitUrl"
            type="text"
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            placeholder="git@github.com:org/repo.git"
          />
        </div>

        <div>
          <label for="sshKey" class="block text-sm font-medium text-gray-300 mb-1">SSH Private Key</label>
          <textarea
            id="sshKey"
            v-model="sshPrivateKey"
            required
            rows="6"
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs"
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          />
        </div>

        <div>
          <label for="specsPath" class="block text-sm font-medium text-gray-300 mb-1">
            Specs Path
            <span class="text-gray-500 font-normal">(optional, default /specs)</span>
          </label>
          <input
            id="specsPath"
            v-model="specsPath"
            type="text"
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            placeholder="/specs"
          />
        </div>

        <div v-if="error" class="text-red-400 text-sm">{{ error }}</div>

        <div class="flex gap-4">
          <button
            type="submit"
            :disabled="loading"
            class="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {{ loading ? 'Creating...' : 'Create Project' }}
          </button>
          <NuxtLink
            to="/projects"
            class="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
          >
            Cancel
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
