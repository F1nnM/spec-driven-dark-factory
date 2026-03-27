import { createError, readBody } from 'h3'
import { projects, projectMembers } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)

  const name = body?.name?.trim()
  const gitUrl = body?.gitUrl?.trim()
  const sshPrivateKey = body?.sshPrivateKey?.trim()
  const specsPath = body?.specsPath?.trim() || '/specs'

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Project name is required' })
  }
  if (!gitUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Git URL is required' })
  }
  if (!sshPrivateKey) {
    throw createError({ statusCode: 400, statusMessage: 'SSH private key is required' })
  }

  const config = useRuntimeConfig()
  const sshPrivateKeyEncrypted = encrypt(sshPrivateKey, config.encryptionKey)

  const [project] = await db
    .insert(projects)
    .values({
      name,
      gitUrl,
      sshPrivateKeyEncrypted,
      specsPath,
    })
    .returning()

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId,
  })

  // Trigger clone on the agent service (fire-and-forget, log errors)
  const agentUrl = config.agentUrl
  try {
    await $fetch(`${agentUrl}/api/projects/clone`, {
      method: 'POST',
      body: {
        gitUrl,
        sshKey: sshPrivateKey,
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
