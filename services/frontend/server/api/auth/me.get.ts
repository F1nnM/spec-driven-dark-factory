import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const [user] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
  }).from(users).where(eq(users.id, userId)).limit(1)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'User not found' })
  }

  return { user }
})
