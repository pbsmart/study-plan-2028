import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { curriculumPlugin } from './src/curriculum/vite-plugin'
export default defineConfig({ plugins: [vue(), curriculumPlugin()], test: { include: ['tests/*.test.ts'] } })
