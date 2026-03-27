import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { encrypt } from '../../utils/crypto'

export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: true,
    scope: ['read:user', 'user:email', 'repo'],
  },
  async onSuccess(event, { user: githubUser, tokens }) {
    const config = useRuntimeConfig()

    // Check allowlist
    const allowedUsers = config.allowedUsers
      ? config.allowedUsers.split(',').map((u: string) => u.trim().toLowerCase())
      : []
    if (allowedUsers.length > 0 && !allowedUsers.includes(githubUser.login.toLowerCase())) {
      return sendRedirect(event, '/login?error=not_allowed')
    }

    // Encrypt GitHub access token
    const encryptedGithubToken = encrypt(tokens.access_token, config.encryptionKey)

    // Upsert user on githubId conflict
    const [user] = await db
      .insert(users)
      .values({
        githubId: githubUser.id,
        username: githubUser.login,
        displayName: githubUser.name ?? null,
        avatarUrl: githubUser.avatar_url ?? null,
        encryptedGithubToken,
      })
      .onConflictDoUpdate({
        target: users.githubId,
        set: {
          username: githubUser.login,
          displayName: githubUser.name ?? null,
          avatarUrl: githubUser.avatar_url ?? null,
          encryptedGithubToken,
        },
      })
      .returning({ id: users.id })

    await setUserSession(event, {
      user: {
        id: user.id,
        githubId: githubUser.id,
        username: githubUser.login,
        displayName: githubUser.name ?? null,
        avatarUrl: githubUser.avatar_url ?? null,
      },
    })

    return sendRedirect(event, '/projects')
  },
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/login?error=oauth_failed')
  },
})
