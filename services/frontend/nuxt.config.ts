import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  css: ['~/assets/css/tailwind.css'],

  devServer: {
    host: '0.0.0.0',
  },

  vite: {
    plugins: [tailwindcss()],
    server: {
      hmr: {
        clientPort: 3000,
      },
    },
  },

  runtimeConfig: {
    databaseUrl: '',
    hasuraAdminSecret: '',
    hasuraInternalEndpoint: '',
    encryptionKey: '',
    githubClientId: '',
    githubClientSecret: '',
    baseUrl: 'http://localhost:3000',
    agentUrl: 'http://agent:3001',
    allowedUsers: '',
    public: {
      hasuraHttpEndpoint: '',
      hasuraWsEndpoint: '',
    },
  },

  compatibilityDate: '2026-03-27',
})
