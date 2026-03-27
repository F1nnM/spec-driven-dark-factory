export async function updateStepStatus(
  hasuraEndpoint: string,
  adminSecret: string,
  stepId: string,
  status: string,
  reviewLoopCount?: number,
  reviewSummary?: string,
): Promise<void> {
  const setFields: Record<string, unknown> = { status }
  if (reviewLoopCount !== undefined) {
    setFields.review_loop_count = reviewLoopCount
  }
  if (reviewSummary !== undefined) {
    setFields.review_summary = reviewSummary
  }

  const mutation = `
    mutation UpdateStepStatus($stepId: uuid!, $set: evolution_steps_set_input!) {
      update_evolution_steps_by_pk(pk_columns: { id: $stepId }, _set: $set) {
        id
        status
      }
    }
  `

  const response = await fetch(hasuraEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hasura-Admin-Secret': adminSecret,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        stepId,
        set: setFields,
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to update step status: ${response.status} ${text}`)
  }

  const result = (await response.json()) as { errors?: { message: string }[] }
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL error updating step status: ${result.errors[0]!.message}`)
  }
}

export async function updateRevisionStatus(
  hasuraEndpoint: string,
  adminSecret: string,
  revisionId: string,
  status: string,
  completedAt?: string,
): Promise<void> {
  const setFields: Record<string, unknown> = { status }
  if (completedAt !== undefined) {
    setFields.completed_at = completedAt
  }

  const mutation = `
    mutation UpdateRevisionStatus($revisionId: uuid!, $set: revisions_set_input!) {
      update_revisions_by_pk(pk_columns: { id: $revisionId }, _set: $set) {
        id
        status
      }
    }
  `

  const response = await fetch(hasuraEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hasura-Admin-Secret': adminSecret,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        revisionId,
        set: setFields,
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to update revision status: ${response.status} ${text}`)
  }

  const result = (await response.json()) as { errors?: { message: string }[] }
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL error updating revision status: ${result.errors[0]!.message}`)
  }
}
