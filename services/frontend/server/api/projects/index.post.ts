import { createError, readBody } from 'h3'
import { getDecryptedGithubToken } from '../../utils/github'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const name = body?.name?.trim()
  const gitUrl = body?.gitUrl?.trim()
  const specsPath = body?.specsPath?.trim() || '/specs'

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Project name is required' })
  }
  if (!gitUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Git URL is required' })
  }

  // Get the user's GitHub token for cloning
  const githubToken = await getDecryptedGithubToken(user.id)

  const [project] = await db
    .insert(projects)
    .values({
      name,
      gitUrl,
      gitTokenUserId: user.id,
      specsPath,
    })
    .returning()

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: user.id,
  })

  // Trigger clone on the agent service using the GitHub token
  const config = useRuntimeConfig()
  const agentUrl = config.agentUrl

  // Convert git URL to HTTPS with token for cloning
  // e.g. https://github.com/owner/repo or git@github.com:owner/repo.git
  let cloneUrl = gitUrl
  const sshMatch = gitUrl.match(/git@github\.com:(.+?)(?:\.git)?$/)
  if (sshMatch) {
    cloneUrl = `https://github.com/${sshMatch[1]}.git`
  }
  const authenticatedCloneUrl = cloneUrl.replace(
    'https://github.com/',
    `https://x-access-token:${githubToken}@github.com/`,
  )

  try {
    await $fetch(`${agentUrl}/api/projects/clone`, {
      method: 'POST',
      body: {
        gitUrl: authenticatedCloneUrl,
        projectId: project.id,
      },
      timeout: 60_000,
    })
  } catch (err: any) {
    // Log but don't fail project creation
    console.error(`Agent clone failed for project ${project.id}:`, err.message ?? err)
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      gitUrl: project.gitUrl,
      specsPath: project.specsPath,
      currentRevision: project.currentRevision,
      createdAt: project.createdAt,
    },
  }
})
