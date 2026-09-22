/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      // A flat 1.5rem costs 48px of a 375px screen; scale it with the viewport.
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1200px' },
    },
    extend: {
      fontFamily: {
        // Arabic in IBM Plex Sans Arabic, Latin and digits in Cormorant. The
        // @font-face rules in index.css carry an Arabic-only unicode-range,
        // so the browser falls through per character — the split headings
        // had under Iwanzaza, which only ever had Arabic glyphs.
        heading: ['IBM Plex Sans Arabic', 'Cormorant', 'Georgia', 'serif'],
        sans: ['Montserrat', 'Segoe UI', 'Tahoma', 'sans-serif'],
        // The phone layout (components/mobile) - IBM Plex Sans Arabic for every
        // character, digits and Latin included, exactly as in the iOS app.
        app: ['Brimatex Plex', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // The iOS app's shadows (brimatex-ios/src/theme/index.ts): faint, and
        // tinted with Dark Ocean rather than a dead grey.
        'app-card': '0 4px 14px rgb(40 40 104 / 0.05)',
        'app-raised': '0 8px 20px rgb(40 40 104 / 0.10)',
        'app-bar': '0 -4px 16px rgb(40 40 104 / 0.08)',
      },
      colors: {
        // The iOS app's palette, one-to-one with brimatex-ios/src/theme/index.ts.
        // Used by the phone layout only, which mirrors the app; the app is
        // light-only, so these do not follow dark mode either.
        app: {
          ocean: '#282868',
          'ocean-dark': '#1d1d4d',
          tint: '#dfe3f6',
          'tint-soft': '#f1f3fb',
          sun: '#dee337',
          porcelain: '#9dc9cf',
          nebula: '#d9e3e2',
          bg: '#f4f5f4',
          input: '#f5f6f8',
          border: '#ebedec',
          divider: '#f1f2f1',
          text: '#1f2937',
          muted: '#8a9199',
          success: '#17803d',
          'success-bg': '#e8f5ec',
          danger: '#b42318',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // Brand scale — use these only when a semantic token doesn't fit.
        ocean: {
          50: 'hsl(var(--ocean-50))',
          100: 'hsl(var(--ocean-100))',
          200: 'hsl(var(--ocean-200))',
          300: 'hsl(var(--ocean-300))',
          400: 'hsl(var(--ocean-400))',
          500: 'hsl(var(--ocean-500))',
          600: 'hsl(var(--ocean-600))',
          700: 'hsl(var(--ocean-700))',
          800: 'hsl(var(--ocean-800))',
          900: 'hsl(var(--ocean-900))',
          950: 'hsl(var(--ocean-950))',
          DEFAULT: 'hsl(var(--brand-ocean))',
        },
        violet: { DEFAULT: 'hsl(var(--brand-violet))' },
        sun: { DEFAULT: 'hsl(var(--brand-sun))' },
        porcelain: { DEFAULT: 'hsl(var(--brand-porcelain))' },
        nebula: { DEFAULT: 'hsl(var(--brand-nebula))' },
        cloud: { DEFAULT: 'hsl(var(--brand-cloud))' },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        // Accent-coloured *text*. Sun Glare fails contrast as ink, so this
        // resolves to dark Blue Violet in light mode and Sun Glare in dark.
        highlight: 'hsl(var(--highlight))',
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        /* نبضة على عدّاد السلة عند الإضافة */
        pop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.28)' },
          '100%': { transform: 'scale(1)' },
        },
        /* لمعة تمرّ على الهياكل العظمية أثناء التحميل */
        shimmer: {
          '100%': { transform: 'translateX(-200%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.26s cubic-bezier(0.4, 0, 0.2, 1)',
        pop: 'pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
