interface Project {
  id: string
  name: string
  gitUrl: string
  specsPath: string
  currentRevision: number | null
  createdAt: string
  memberCount?: number
}

export function useProjects() {
  const projects = useState<Project[]>('projects', () => [])

  async function fetchProjects(): Promise<Project[]> {
    const data = await $fetch<{ projects: Project[] }>('/api/projects')
    projects.value = data.projects
    return data.projects
  }

  async function createProject(input: {
    name: string
    gitUrl: string
    specsPath?: string
  }): Promise<Project> {
    const data = await $fetch<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: input,
    })
    projects.value.push(data.project)
    return data.project
  }

  async function fetchProject(id: string): Promise<Project> {
    const data = await $fetch<{ project: Project }>(`/api/projects/${id}`)
    return data.project
  }

  async function deleteProject(id: string): Promise<void> {
    await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
    projects.value = projects.value.filter(p => p.id !== id)
  }

  return { projects, fetchProjects, createProject, fetchProject, deleteProject }
}
