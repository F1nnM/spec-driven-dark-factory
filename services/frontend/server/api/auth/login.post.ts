import { eq } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { users } from '../../database/schema'
import { getSession, verifyPassword } from '../../utils/auth'
import { db } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const email = body?.email?.trim()?.toLowerCase()
  const password = body?.password

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }

  const [user] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    passwordHash: users.passwordHash,
  }).from(users).where(eq(users.email, email)).limit(1)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  const session = await getSession(event)
  await session.update({ userId: user.id })

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  }
})
