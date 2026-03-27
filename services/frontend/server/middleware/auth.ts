import type { SessionUser } from '../utils/auth'
import { validateSession } from '../utils/auth'

declare module 'h3' {
  interface H3EventContext {
    user: SessionUser | null
  }
}

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'sf_session')
  if (token) {
    event.context.user = await validateSession(token)
  } else {
    event.context.user = null
  }
})
