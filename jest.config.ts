import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // next/jest doesn't read tsconfig's "paths" itself - without this, any
  // test importing via the "@/..." alias (matching tsconfig.json) fails to
  // resolve under Jest even though it resolves fine for Next's own build.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}

export default createJestConfig(config)
