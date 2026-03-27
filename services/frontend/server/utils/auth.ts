import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import * as arctic from 'arctic'
import { eq, and, gt } from 'drizzle-orm'
import { sessions, users } from '../database/schema'

const SESSION_EXPIRY_DAYS = 30

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export function useGitHubClient(): arctic.GitHub {
  const config = useRuntimeConfig()
  const callbackUrl = `${config.baseUrl}/auth/github/callback`
  return new arctic.GitHub(config.githubClientId, config.githubClientSecret, callbackUrl)
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  await db.insert(sessions).values({
    id: token,
    userId,
    expiresAt,
  })

  return token
}

export interface SessionUser {
  id: string
  githubId: number
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export async function validateSession(token: string): Promise<SessionUser | null> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      githubId: users.githubId,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
    .limit(1)

  if (rows.length === 0) return null

  const row = rows[0]
  return {
    id: row.userId,
    githubId: row.githubId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
  }
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token))
}

export async function requireAuth(event: H3Event): Promise<SessionUser> {
  const token = getCookie(event, 'sf_session')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  const user = await validateSession(token)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid session' })
  }
  return user
}
