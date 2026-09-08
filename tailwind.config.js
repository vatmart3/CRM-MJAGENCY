/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0B0D',
        card: '#141417',
        card2: '#1A1A1F',
        line: '#1F1F24',
        txt: '#F5F5F7',
        muted: '#8A8A93',
        brand: '#0071E3',
        brandLight: '#4DA3FF',
        ok: '#30D158',
        warn: '#FF9F0A',
        danger: '#FF453A',
        yellow: '#FFD60A',
        violet: '#BF5AF2',
      },
      borderRadius: { card: '20px', pill: '999px' },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      keyframes: {
        fadeUp: { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: { fadeUp: 'fadeUp 400ms ease-out both' },
    },
  },
  plugins: [],
}
