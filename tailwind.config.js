/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // OQORO brand
        'oq-navy': '#221A5B',
        'oq-purple': '#5B30F3',
        'oq-saumon': '#F76863',
        'oq-yellow': '#FFD500',
        'oq-cream': '#FAF9F6',
        'oq-lilas': '#F0EFFB',
        'oq-saumon-soft': '#FDE1E0',

        // Brand purple scale
        'brand-25': '#FCFAFF',
        'brand-50': '#F3F3FF',
        'brand-100': '#EAE8FF',
        'brand-200': '#D9D6FE',
        'brand-300': '#D6BBFB',
        'brand-400': '#B692F6',
        'brand-500': '#7157FB',
        'brand-600': '#5B30F3',
        'brand-700': '#5022DF',
        'brand-800': '#421CBB',
        'brand-900': '#3E1C96',

        // Legacy aliases (kept so the rest of the codebase keeps working)
        'oq-black': '#221A5B',
        'oq-text': '#333741',
        'oq-muted': '#61646C',
        'oq-border': '#EAECF0',
        'oq-border-strong': '#CECFD2',
        'oq-bg': '#FAF9F6',
        'oq-white': '#FFFFFF',
        'oq-orange': '#5B30F3',
        'oq-orange-dark': '#5022DF',
        'oq-green': '#079455',
        'oq-green-soft': '#DCFAE6',
        'oq-red': '#F76863',
        'oq-red-soft': '#FDE1E0',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '18px',
        btn: '10px',
        badge: '999px',
        photo: '14px',
      },
      boxShadow: {
        hover: '0 12px 16px -4px rgba(16,24,40,.08), 0 4px 6px -2px rgba(16,24,40,.03)',
        soft: '0 4px 8px -2px rgba(16,24,40,.10), 0 2px 4px -2px rgba(16,24,40,.06)',
        xl: '0 20px 24px -4px rgba(16,24,40,.08), 0 8px 8px -4px rgba(16,24,40,.03)',
      },
      maxWidth: {
        container: '1280px',
      },
      backgroundImage: {
        'gradient-oqoro': 'radial-gradient(116.28% 116.28% at 0% -16.28%, #634AFD 4.69%, #9A49F2 98.31%)',
      },
    },
  },
  plugins: [],
};
