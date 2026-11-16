import type { Config } from 'tailwindcss';

// Skala "blue" dipetakan ke biru MaintHub supaya seluruh halaman lama otomatis ikut bermerek baru.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
      colors: {
        ink: { 950: '#070d1a', 900: '#0b1426', 800: '#111d35', 700: '#1b2a47' },
        blue: { 50: '#eef5ff', 100: '#d9e8ff', 200: '#b9d4ff', 300: '#8bb8fb', 400: '#5a97f5', 500: '#2f7cf0', 600: '#1f66d6', 700: '#1a54b0', 800: '#1b478f', 900: '#1b3d73' },
      },
      boxShadow: { card: '0 1px 2px rgba(11,20,38,.05), 0 4px 16px -6px rgba(11,20,38,.08)', glow: '0 0 0 1px rgba(47,124,240,.35), 0 8px 30px -8px rgba(24,209,196,.35)' },
    },
  },
  plugins: [],
} satisfies Config;
