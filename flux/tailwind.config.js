/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        panel: v('panel'),
        card: v('card'),
        card2: v('card2'),
        line: v('line'),
        txt: v('txt'),
        muted: v('muted'),
        accent: v('accent'),
        ink: v('accent-ink'),
        deep: v('accent-deep'),
        expense: v('expense'),
        warn: v('warn'),
        danger: v('danger'),
        ok: v('ok'),
      },
      borderRadius: { card: '22px', pill: '999px' },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)',
        lift: '0 2px 6px rgb(0 0 0 / 0.08), 0 24px 48px -20px rgb(0 0 0 / 0.35)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.25), 0 10px 30px -8px rgb(var(--accent) / 0.45)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        sheetUp: { '0%': { opacity: 0, transform: 'translateY(24px) scale(0.98)' }, '100%': { opacity: 1, transform: 'translateY(0) scale(1)' } },
        pop: { '0%': { transform: 'scale(0.6)', opacity: 0 }, '60%': { transform: 'scale(1.08)', opacity: 1 }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        fadeUp: 'fadeUp 420ms cubic-bezier(.2,.8,.2,1) both',
        fadeIn: 'fadeIn 240ms ease-out both',
        sheetUp: 'sheetUp 320ms cubic-bezier(.2,.8,.2,1) both',
        pop: 'pop 420ms cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
}
