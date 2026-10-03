import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        proxy: {
            '/api': 'http://localhost:8080',
            '/auth': {
                target: 'http://localhost:8080',
                rewrite: (path) => `/api${path}`,
            },
        },
    },
})
