import type { SpecFile } from '@spec-factory/shared'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export function useChat(projectId: string) {
  const messages = useState<ChatMessage[]>(`chat-${projectId}`, () => [])
  const draftSpecs = useState<SpecFile[]>(`draft-specs-${projectId}`, () => [])
  const mainSpecs = useState<SpecFile[]>(`main-specs-${projectId}`, () => [])
  const sending = ref(false)
  const revisionNumber = ref<number | null>(null)
  const error = ref<string | null>(null)

  async function loadChat() {
    try {
      const data = await $fetch<{
        messages: ChatMessage[]
        revisionNumber: number | null
      }>(`/api/projects/${projectId}/chat`)
      messages.value = data.messages
      revisionNumber.value = data.revisionNumber
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || 'Failed to load chat'
    }
  }

  async function sendMessage(message: string) {
    if (!message.trim() || sending.value) return

    sending.value = true
    error.value = null

    // Optimistically add user message
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    }
    messages.value = [...messages.value, userMsg]

    try {
      const data = await $fetch<{
        response: string
        specs: SpecFile[]
        revisionNumber: number
      }>(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        body: { message },
      })

      // Add assistant response
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.response,
        createdAt: new Date().toISOString(),
      }
      messages.value = [...messages.value, assistantMsg]
      revisionNumber.value = data.revisionNumber

      // Update draft specs from response
      if (data.specs) {
        draftSpecs.value = data.specs
      }
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || 'Failed to send message'
      // Remove optimistic user message on failure
      messages.value = messages.value.slice(0, -1)
    } finally {
      sending.value = false
    }
  }

  async function loadDraftSpecs() {
    try {
      const data = await $fetch<{
        specs: SpecFile[]
        mainSpecs: SpecFile[]
        revisionNumber: number | null
      }>(`/api/projects/${projectId}/draft-specs`)

      draftSpecs.value = data.specs
      mainSpecs.value = data.mainSpecs
      if (data.revisionNumber != null) {
        revisionNumber.value = data.revisionNumber
      }
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || 'Failed to load draft specs'
    }
  }

  return {
    messages,
    draftSpecs,
    mainSpecs,
    sending,
    revisionNumber,
    error,
    loadChat,
    sendMessage,
    loadDraftSpecs,
  }
}
