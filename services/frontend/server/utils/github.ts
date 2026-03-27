import { eq } from 'drizzle-orm'
import { users } from '../database/schema'
import { decrypt } from './crypto'

export async function getDecryptedGithubToken(userId: string): Promise<string> {
  const [user] = await db
    .select({ encryptedGithubToken: users.encryptedGithubToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user || !user.encryptedGithubToken) {
    throw createError({ statusCode: 400, statusMessage: 'User has no GitHub token' })
  }

  const config = useRuntimeConfig()
  return decrypt(user.encryptedGithubToken, config.encryptionKey)
}
