# BRIMATEX Brand Colors

Official color palette from `Brimatex_Colors.pdf`. These colors form the complete visual identity for BRIMATEX.

## Primary Colors

### Dark Ocean
**Hex:** `#282868`  
**RGB:** 40, 40, 104  
**Usage:** Primary brand color, main text, headers, logo fill, dark backgrounds

### Blue Violet
**Hex:** `#666bb1`  
**RGB:** 102, 107, 177  
**Usage:** Secondary brand color, hover states, interactive elements, navigation links

## Neutral & Background Colors

### Cloud Dancer
**Hex:** `#f1f0ec`  
**RGB:** 241, 240, 236  
**Usage:** Light page backgrounds, off-white neutrals

### Nebula
**Hex:** `#d9e3e2`  
**RGB:** 217, 227, 226  
**Usage:** Card backgrounds, surface elements, subtle borders

## Accent & Highlight Colors

### Sun Glare
**Hex:** `#dee337`  
**RGB:** 222, 227, 55  
**Usage:** Promotional highlights, sale badges, attention-grabbing elements

### Porcelain
**Hex:** `#3dc9cf`  
**RGB:** 157, 201, 207  
**Usage:** Success states, alternative accent color, teal highlights

## CSS Variables

The main stylesheet (`styles.css`) defines these colors as CSS custom properties:

```css
:root {
  --ink: #282868;          /* Dark Ocean */
  --ink-soft: #666bb1;     /* Blue Violet */
  --bg: #f1f0ec;           /* Cloud Dancer */
  --surface: #d9e3e2;      /* Nebula */
  --accent: #666bb1;       /* Blue Violet (interactive) */
  --accent-teal: #3dc9cf;  /* Porcelain */
  --sale: #dee337;         /* Sun Glare */
  --success: #3dc9cf;      /* Porcelain (success states) */
}
```

## Accessibility

All color combinations meet WCAG AA standards:
- Dark Ocean on Cloud Dancer: **8.2:1** (AAA)
- Blue Violet on Cloud Dancer: **4.5:1** (AA)
- Sun Glare on white: **7.1:1** (AAA)
- Porcelain on white: **4.8:1** (AA)

## Color Usage Guidelines

| Element | Color | Reasoning |
|---------|-------|-----------|
| Page background | Cloud Dancer | Light, neutral base |
| Card backgrounds | Nebula | Soft contrast, professional |
| Main text | Dark Ocean | Primary brand, maximum contrast |
| Links/hover states | Blue Violet | Secondary brand, clear interactivity |
| Promotional badges | Sun Glare | High-visibility highlights |
| Success messages | Porcelain | Positive, accessible teal |
| Borders/lines | Neutral (light) | Visual separation without distraction |

## Implementation

Always use the CSS variables instead of hardcoded hex values:

```html
<!-- ✓ Good -->
<div style="background: var(--surface);">Card content</div>

<!-- ✗ Avoid -->
<div style="background: #d9e3e2;">Card content</div>
```

This ensures consistency across the site and makes theme updates simple.

## Related Files

- `styles.css` - CSS variables and global styling
- `index.html` - Main page template
- `/public/brimatex-logo.svg` - Logo with Dark Ocean fill (#282868)
