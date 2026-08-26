/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ground: '#F5F6F9',
        ink: {
          900: '#0C1424', 800: '#131C2E', 700: '#1D2739',
          500: '#475467', 400: '#667085', 300: '#98A2B3', 200: '#D5D9E2',
        },
        brand: {
          50: '#EFEFFD', 100: '#E0E0FB', 200: '#C3C2F6', 300: '#9E9CEF',
          400: '#7975E5', 500: '#5B55D9', 600: '#4A43C4', 700: '#3E38A6',
          800: '#332E85', 900: '#252268',
        },
        saffron: { 100: '#FDF0D5', 500: '#D9950B', 700: '#B26B05' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.05)',
        pop: '0 12px 32px -8px rgba(16,24,40,.18), 0 2px 6px rgba(16,24,40,.06)',
      },
      borderRadius: { xl: '12px', '2xl': '16px' },
    },
  },
  plugins: [],
};
