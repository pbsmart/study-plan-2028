import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { curriculumPlugin } from './src/curriculum/vite-plugin'

export default defineConfig(({ command, isPreview }) => ({ plugins: [vue(), curriculumPlugin()], build: { manifest: true }, base: process.env.VITE_BASE_PATH || (command === 'build' || isPreview ? '/study-plan-2028/' : '/') }))
