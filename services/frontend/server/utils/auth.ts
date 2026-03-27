import type { H3Event } from 'h3'
import { useSession, createError } from 'h3'

export interface SessionData {
  userId?: string
}

export async function getAppSession(event: H3Event) {
  const config = useRuntimeConfig()
  return useSession<SessionData>(event, {
    password: config.sessionPassword,
    name: 'spec-factory-session',
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
}

export async function requireAuth(event: H3Event): Promise<{ userId: string }> {
  const session = await getAppSession(event)
  const userId = session.data.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return { userId }
}
