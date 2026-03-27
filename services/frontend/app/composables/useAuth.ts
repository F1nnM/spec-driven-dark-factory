interface AuthUser {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)

  function loginWithGithub() {
    navigateTo('/auth/github', { external: true })
  }

  async function logout() {
    await $fetch('/auth/logout', { method: 'POST' })
    user.value = null
    navigateTo('/login')
  }

  async function fetchUser(): Promise<AuthUser | null> {
    try {
      // Forward cookies during SSR so the session cookie reaches the API
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
      const data = await $fetch<{ user: AuthUser }>('/api/auth/me', { headers })
      user.value = data.user
      return data.user
    } catch {
      user.value = null
      return null
    }
  }

  return { user, loginWithGithub, logout, fetchUser }
}
