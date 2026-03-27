import { createClient, type Client } from 'graphql-ws'

export function useGraphqlSubscription<T>(
  query: string,
  variables: Record<string, unknown>,
) {
  const data = ref<T | null>(null)
  const config = useRuntimeConfig()

  let client: Client | null = null
  let unsubscribe: (() => void) | null = null

  function connect() {
    const wsEndpoint = config.public.hasuraWsEndpoint
    if (!wsEndpoint) {
      // No WebSocket endpoint configured, subscription will not work
      return
    }

    client = createClient({
      url: wsEndpoint,
      connectionParams: () => {
        // The session cookie is sent automatically for same-origin WS connections.
        // For Hasura, we rely on the forwarded auth headers.
        return {}
      },
      shouldRetry: () => true,
      retryAttempts: Infinity,
      retryWait: async (retries) => {
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, retries), 30000)
        await new Promise((resolve) => setTimeout(resolve, delay))
      },
    })

    const iterable = client.iterate<T>({
      query,
      variables,
    })

    // Async iteration in background
    ;(async () => {
      try {
        for await (const result of iterable) {
          if (result.data) {
            data.value = result.data as T
          }
        }
      } catch {
        // Connection closed or error, will be retried by graphql-ws
      }
    })()

    unsubscribe = () => {
      iterable.return?.(undefined)
    }
  }

  // Only connect on the client side
  if (import.meta.client) {
    onMounted(() => {
      connect()
    })
  }

  function close() {
    unsubscribe?.()
    client?.dispose()
    client = null
    unsubscribe = null
  }

  onUnmounted(() => {
    close()
  })

  return { data, close }
}
