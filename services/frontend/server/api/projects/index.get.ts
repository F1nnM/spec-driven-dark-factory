import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

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
        WHERE ${projectMembers.userId} = ${user.id}
      )`,
    )
    .groupBy(projects.id)

  return { projects: rows }
})
