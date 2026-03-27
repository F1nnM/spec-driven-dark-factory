declare module '#auth-utils' {
  interface User {
    id: string
    githubId: number
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
}

export {}
