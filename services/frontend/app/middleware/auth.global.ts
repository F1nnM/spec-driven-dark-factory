export default defineNuxtRouteMiddleware(async (to) => {
  const publicRoutes = ['/login', '/auth/github']

  if (publicRoutes.some(route => to.path.startsWith(route))) {
    return
  }

  const { user, fetchUser } = useAuth()

  if (!user.value) {
    await fetchUser()
  }

  if (!user.value) {
    return navigateTo('/login')
  }
})
