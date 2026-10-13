import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({ plugins: [vue()], base: process.env.VITE_BASE_PATH || (command === 'build' ? '/study-plan-2028/' : '/') }))
