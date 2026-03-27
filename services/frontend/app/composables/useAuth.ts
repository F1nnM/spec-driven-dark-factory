interface AuthUser {
  id: string
  email: string
  name: string
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)

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

  async function login(email: string, password: string) {
    const data = await $fetch<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = data.user
    return data.user
  }

  async function register(email: string, password: string, name: string) {
    const data = await $fetch<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: { email, password, name },
    })
    user.value = data.user
    return data.user
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, login, register, logout, fetchUser }
}
