/** @type {import('tailwindcss').Config} */
export default {
  // hover: styles apply only where a pointer really hovers - a tap on a phone
  // no longer leaves a card zoomed or a button lit.
  future: { hoverOnlyWhenSupported: true },
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
        // One font everywhere: IBM Plex Sans Arabic (as "Brimatex Plex", the
        // WOFF2 files in public/fonts) for Arabic, Latin and digits alike.
        heading: ['IBM Plex Sans Arabic', 'Brimatex Plex', 'system-ui', 'sans-serif'],
        // Google's IBM Plex Sans Arabic first: it has the 500 and 600 weights the
        // 2026 design uses; the self-hosted files cover 400 and 700 if it is slow.
        sans: ['IBM Plex Sans Arabic', 'Brimatex Plex', 'system-ui', 'sans-serif'],
        // The site's font (components/app) - IBM Plex Sans Arabic for every
        // character, digits and Latin included, exactly as in the iOS app.
        app: ['Brimatex Plex', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        // Page titles and hero headlines (the 2026 handoff): Readex Pro, with
        // Plex behind it for anything Readex lacks.
        display: ['Readex Pro', 'Brimatex Plex', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        // The storefront's content width (design/docs/DESIGN.md).
        content: '1280px',
      },
      transitionDuration: {
        instant: 'var(--dur-instant)',
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        sheet: 'var(--dur-sheet)',
        slow: 'var(--dur-slow)',
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
        // The whole site mirrors the app with these; the app is light-only,
        // so they do not follow dark mode either.
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
        // The 2026 handoff's extras (design/tokens/globals.css).
        'brand-text': 'hsl(var(--highlight))',
        'image-bg': 'hsl(var(--image-bg))',
        'text-tertiary': 'hsl(var(--text-tertiary))',
        warning: 'hsl(var(--warning))',
        info: 'hsl(var(--info))',
        discount: {
          DEFAULT: 'hsl(var(--discount))',
          underline: 'hsl(var(--discount-underline))',
        },
        overlay: 'hsl(var(--overlay))',
        // The brand palette, the same in both modes.
        'dark-ocean': '#282868',
        'blue-violet': '#666BB1',
        'sun-glare': '#DEE337',
        paper: '#F4F5F1',
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
      transitionTimingFunction: {
        'out-strong': 'var(--ease-out)',
        'in-out-strong': 'var(--ease-in-out)',
        drawer: 'var(--ease-drawer)',
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
        // The cart badge after an add (design/docs/MOTION.md).
        'badge-pulse': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.3)' },
          '70%': { transform: 'scale(.94)' },
          '100%': { transform: 'scale(1)' },
        },
        // A wrong sign-in code: the boxes shake once.
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-10px)' },
          '40%': { transform: 'translateX(9px)' },
          '60%': { transform: 'translateX(-6px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        // The favourite heart: shrinks, grows, settles.
        heart: {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(.8)' },
          '65%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.26s var(--ease-out)',
        pop: 'pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        shimmer: 'shimmer 1.6s infinite',
        'badge-pulse': 'badge-pulse 300ms var(--ease-out)',
        shake: 'shake 400ms ease',
        heart: 'heart 300ms var(--ease-out)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
