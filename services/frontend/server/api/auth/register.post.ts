import { eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { users } from '../../database/schema'
import { getSession, hashPassword } from '../../utils/auth'
import { db } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const email = body?.email?.trim()?.toLowerCase()
  const password = body?.password
  const name = body?.name?.trim()

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Email is required' })
  }
  if (!password || password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' })
  }
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  // Check if email already exists
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered' })
  }

  const passwordHash = await hashPassword(password)

  const [user] = await db.insert(users).values({
    email,
    passwordHash,
    name,
  }).returning({
    id: users.id,
    email: users.email,
    name: users.name,
  })

  const session = await getSession(event)
  await session.update({ userId: user.id })

  return { user }
})
