import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['nuxt-auth-utils', '@nuxtjs/apollo'],

  apollo: {
    clients: {
      default: {
        httpEndpoint: 'http://localhost:8080/v1/graphql',
        wsEndpoint: 'ws://localhost:8080/v1/graphql',
      },
    },
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
    baseUrl: 'http://localhost:3000',
    agentUrl: 'http://agent:3001',
    allowedUsers: '',
    oauth: {
      github: {
        clientId: '',
        clientSecret: '',
      },
    },
    public: {},
  },

  compatibilityDate: '2026-03-27',
})
