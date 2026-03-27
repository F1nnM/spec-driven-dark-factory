import { requestAbort } from '../agents/pipeline-runner.js'

export async function handleInterrupt(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    // Set the abort flag for the running pipeline
    requestAbort(projectId)

    return Response.json({ interrupted: true, projectId })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}
