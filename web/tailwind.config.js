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
        // Iwanzaza covers Arabic only — Latin/digit glyphs it lacks fall
        // through to Cormorant automatically, per-character.
        heading: ['Iwanzaza', 'Cormorant', 'Georgia', 'serif'],
        sans: ['Montserrat', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      colors: {
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
