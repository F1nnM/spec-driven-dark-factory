import { Octokit } from 'octokit'
import { eq } from 'drizzle-orm'
import { useGitHubClient, createSession, sessionCookieOptions } from '../../../utils/auth'
import { encrypt } from '../../../utils/crypto'
import { users } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string | undefined
  const state = query.state as string | undefined
  const storedState = getCookie(event, 'github_oauth_state')

  if (!code || !state || !storedState || state !== storedState) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth callback' })
  }

  // Clear the state cookie
  deleteCookie(event, 'github_oauth_state')

  const github = useGitHubClient()
  const tokens = await github.validateAuthorizationCode(code)
  const accessToken = tokens.accessToken()

  // Fetch GitHub user profile
  const octokit = new Octokit({ auth: accessToken })
  const { data: ghUser } = await octokit.rest.users.getAuthenticated()

  // Check allowed users list
  const config = useRuntimeConfig()
  if (config.allowedUsers) {
    const allowedList = config.allowedUsers.split(',').map((u: string) => u.trim().toLowerCase())
    if (!allowedList.includes(ghUser.login.toLowerCase())) {
      throw createError({ statusCode: 403, statusMessage: 'Your GitHub account is not authorized to use this application' })
    }
  }

  // Encrypt the access token
  const encryptedToken = encrypt(accessToken, config.encryptionKey)

  // Upsert user on githubId conflict
  const [user] = await db
    .insert(users)
    .values({
      githubId: ghUser.id,
      username: ghUser.login,
      displayName: ghUser.name ?? null,
      avatarUrl: ghUser.avatar_url ?? null,
      encryptedGithubToken: encryptedToken,
    })
    .onConflictDoUpdate({
      target: users.githubId,
      set: {
        username: ghUser.login,
        displayName: ghUser.name ?? null,
        avatarUrl: ghUser.avatar_url ?? null,
        encryptedGithubToken: encryptedToken,
      },
    })
    .returning({ id: users.id })

  // Create session
  const sessionToken = await createSession(user.id)

  setCookie(event, 'sf_session', sessionToken, {
    ...sessionCookieOptions(),
    maxAge: 30 * 24 * 60 * 60, // 30 days
  })

  return sendRedirect(event, '/projects')
})
