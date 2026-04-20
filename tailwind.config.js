/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        'oq-black': '#1A1A2E',
        'oq-text': '#333333',
        'oq-muted': '#888888',
        'oq-border': '#E5E5E5',
        'oq-bg': '#F7F7F7',
        'oq-white': '#FFFFFF',
        'oq-orange': '#FF6B35',
        'oq-orange-dark': '#E55A25',
        'oq-green': '#22C55E',
        'oq-green-soft': '#DCFCE7',
        'oq-red': '#EF4444',
        'oq-red-soft': '#FEE2E2',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        badge: '100px',
        photo: '10px',
      },
      boxShadow: {
        hover: '0 2px 8px rgba(0, 0, 0, 0.08)',
      },
      maxWidth: {
        container: '1200px',
      },
    },
  },
  plugins: [],
};
