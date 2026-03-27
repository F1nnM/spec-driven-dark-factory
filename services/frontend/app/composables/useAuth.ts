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
      const data = await $fetch<{ user: AuthUser }>('/api/auth/me')
      user.value = data.user
      return data.user
    } catch {
      user.value = null
      return null
    }
  }

  return { user, loginWithGithub, logout, fetchUser }
}
