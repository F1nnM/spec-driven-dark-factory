import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },

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
    sessionPassword: '',
    agentUrl: 'http://agent:3001',
    public: {
      hasuraHttpEndpoint: '',
      hasuraWsEndpoint: '',
    },
  },

  compatibilityDate: '2026-03-27',
})
