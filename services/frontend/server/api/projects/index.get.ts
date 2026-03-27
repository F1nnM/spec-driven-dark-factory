import { eq, sql } from 'drizzle-orm'
import { projects, projectMembers } from '../../database/schema'
import { requireAuth } from '../../utils/auth'
import { db } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      gitUrl: projects.gitUrl,
      specsPath: projects.specsPath,
      currentRevision: projects.currentRevision,
      createdAt: projects.createdAt,
      memberCount: sql<number>`count(${projectMembers.userId})::int`,
    })
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(
      sql`${projects.id} IN (
        SELECT ${projectMembers.projectId} FROM ${projectMembers}
        WHERE ${projectMembers.userId} = ${userId}
      )`,
    )
    .groupBy(projects.id)

  return { projects: rows }
})
