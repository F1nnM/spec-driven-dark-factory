<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  projectId: string
}>()

const { messages, sending, error, sendMessage } = useChat(props.projectId)

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

async function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  await sendMessage(text)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(html)
}

// Auto-scroll to bottom when messages change
watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  },
)
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Messages area -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto p-4 space-y-4"
    >
      <!-- Empty state -->
      <div
        v-if="messages.length === 0 && !sending"
        class="flex items-center justify-center h-full text-gray-500"
      >
        <div class="text-center">
          <p class="text-lg mb-2">Start drafting specs</p>
          <p class="text-sm">
            Describe the changes you want to make to your specifications.
          </p>
        </div>
      </div>

      <!-- Messages -->
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="flex"
        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[80%] rounded-lg px-4 py-3"
          :class="
            msg.role === 'user'
              ? 'bg-blue-900/50 border border-blue-800 text-blue-100'
              : 'bg-gray-800 border border-gray-700 text-gray-200'
          "
        >
          <div
            v-if="msg.role === 'assistant'"
            class="prose prose-invert prose-sm max-w-none"
            v-html="renderMarkdown(msg.content)"
          />
          <p v-else class="whitespace-pre-wrap text-sm">{{ msg.content }}</p>
          <div
            class="text-xs mt-2 opacity-50"
            :class="msg.role === 'user' ? 'text-right' : 'text-left'"
          >
            {{ new Date(msg.createdAt).toLocaleTimeString() }}
          </div>
        </div>
      </div>

      <!-- Sending indicator -->
      <div v-if="sending" class="flex justify-start">
        <div class="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
          <div class="flex items-center gap-2 text-gray-400">
            <svg
              class="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span class="text-sm">AI is thinking...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Error message -->
    <div
      v-if="error"
      class="px-4 py-2 bg-red-900/30 border-t border-red-800 text-red-400 text-sm"
    >
      {{ error }}
    </div>

    <!-- Input area -->
    <div class="border-t border-gray-800 p-4">
      <div class="flex gap-3">
        <textarea
          v-model="inputText"
          class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          placeholder="Describe spec changes..."
          rows="2"
          :disabled="sending"
          @keydown="handleKeydown"
        />
        <button
          class="self-end px-4 py-3 rounded-lg text-sm font-medium transition-colors"
          :class="
            sending || !inputText.trim()
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-500'
          "
          :disabled="sending || !inputText.trim()"
          @click="handleSend"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>
