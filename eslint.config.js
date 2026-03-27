import antfu from '@antfu/eslint-config'
import prettier from 'eslint-config-prettier'

export default antfu(
  {
    typescript: true,
    vue: true,
    ignores: ['**/dist/**', '**/.nuxt/**', '**/.output/**', '**/node_modules/**'],
  },
  prettier,
)
