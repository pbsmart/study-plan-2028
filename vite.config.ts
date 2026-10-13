import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command, isPreview }) => ({ plugins: [vue()], base: process.env.VITE_BASE_PATH || (command === 'build' || isPreview ? '/study-plan-2028/' : '/') }))
