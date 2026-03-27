<script setup lang="ts">
definePageMeta({ layout: false })

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const { register } = useAuth()

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    await register(email.value, password.value, name.value)
    await navigateTo('/projects')
  } catch (e: any) {
    error.value = e?.data?.message || e?.statusMessage || 'Registration failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-8">
        <h1 class="text-2xl font-bold text-white mb-6 text-center">Create Account</h1>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label for="name" class="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input
              id="name"
              v-model="name"
              type="text"
              required
              autocomplete="name"
              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Your name"
            />
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Min. 8 characters"
            />
          </div>

          <div v-if="error" class="text-red-400 text-sm">{{ error }}</div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {{ loading ? 'Creating account...' : 'Create Account' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-400">
          Already have an account?
          <NuxtLink to="/login" class="text-blue-400 hover:text-blue-300">Sign in</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
