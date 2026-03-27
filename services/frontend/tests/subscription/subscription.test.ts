import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Apollo module configuration', () => {
  const configSource = readFileSync(resolve(__dirname, '../../nuxt.config.ts'), 'utf-8')

  it('nuxt config includes @nuxtjs/apollo module', () => {
    expect(configSource).toContain("'@nuxtjs/apollo'")
  })

  it('apollo config defines a default client with httpEndpoint', () => {
    expect(configSource).toContain('httpEndpoint')
  })

  it('apollo config defines a default client with wsEndpoint', () => {
    expect(configSource).toContain('wsEndpoint')
  })

  it('package.json includes @nuxtjs/apollo dependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
    expect(pkg.dependencies['@nuxtjs/apollo']).toBeDefined()
    expect(pkg.dependencies['@apollo/client']).toBeDefined()
  })

  it('URQL packages are removed', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
    expect(pkg.dependencies['@urql/vue']).toBeUndefined()
    expect(pkg.dependencies['@urql/exchange-graphcache']).toBeUndefined()
  })
})
