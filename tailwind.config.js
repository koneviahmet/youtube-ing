/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#0c1017',
          raised: '#141b26',
          overlay: '#1c2636',
        },
        fg: {
          DEFAULT: '#e8edf5',
          muted: '#94a3b8',
          subtle: '#64748b',
        },
        accent: {
          DEFAULT: '#38bdf8',
          dim: '#0ea5e9',
        },
        warn: '#fbbf24',
        danger: '#f87171',
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(148,163,184,0.12)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
