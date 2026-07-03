import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        // Marque/accent personnalisables (page /admin/apparence ou variables
        // d'environnement, voir lib/branding/) : les valeurs hex ci-dessous
        // ne servent que de repli si la variable CSS n'est jamais posée.
        brand: { DEFAULT: 'var(--color-brand, #002D74)', for: 'var(--color-brand-for, #00378F)' },
        accent: {
          DEFAULT: 'var(--color-accent, #FF7F30)',
          text: 'var(--color-accent-text, #B4590F)',
          soft: 'var(--color-accent-soft, #FFF1E7)',
          ring: 'var(--color-accent-ring, #FBDCC4)'
        },
        acsso: { DEFAULT: '#AB0093', text: '#8E1279', soft: '#F8E6F4' },
        ink: { DEFAULT: '#16203A', 2: '#5B6478', 3: '#8A93A6', 4: '#A6AEBE' },
        surface: { DEFAULT: '#F2F5FA', card: '#FFFFFF', sub: '#F7F9FC' },
        line: { DEFAULT: '#E6EAF2', field: '#DCE2EC', row: '#EEF1F6' },
        ok: { bar: '#22B26B', text: '#12805A', soft: '#E9F7EF', line: '#BDE7CE' },
        warn: { bar: '#F59E0B', text: '#B45309', soft: '#FEF3E2', line: '#F6DFB0' },
        bad: { DEFAULT: '#D14343', soft: '#FDEAEA' },
        // Boutons d'engagement (README §Boutons, valeurs de la maquette)
        engage: { DEFAULT: '#059669', dark: '#15935D', hover: '#047857' }
      },
      fontFamily: {
        // *-active bascule vers une police personnalisée si réglée en admin,
        // sinon retombe sur les polices next/font par défaut (voir css-vars.ts).
        sans: ['var(--font-sans-active)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display-active)', 'sans-serif'],
        hand: ['var(--font-hand-active)', 'cursive']
      },
      boxShadow: {
        card: '0 6px 18px -12px rgba(20,32,58,.2)',
        lift: '0 8px 22px -12px rgba(20,32,58,.3)'
      }
    }
  },
  plugins: []
};

export default config;
