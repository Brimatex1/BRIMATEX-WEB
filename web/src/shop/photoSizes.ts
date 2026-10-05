/**
 * The site's own photos in the size a place needs. Each shipped product photo
 * (web/public/images/products/<name>.webp, 1600–2000 px) also comes in 200,
 * 400, 800 and 1200 px wide copies (<name>-<w>.webp), and each banner photo
 * (/images/banners/<name>-photo.jpg, 1600 px) in 800 px. A 36 px thumbnail
 * used to download the 1600 px photo - a product page weighed ~1.8 MB.
 *
 * A photo uploaded from the dashboard (/uploads/...) or bundled with the code
 * has no copies and is used as it is.
 */

const PRODUCT = /^(\/images\/products\/[a-z]+(?:-layers)?)\.webp$/;
const PRODUCT_WIDTHS = [200, 400, 800, 1200];
const BANNER = /^(\/images\/banners\/[a-z]+-photo)\.jpg$/;

/** The smallest copy that stays sharp at `cssWidth` on a 2x screen; the photo itself when it has none. */
export function sizedPhoto(src: string, cssWidth: number): string {
  const m = PRODUCT.exec(src);
  if (!m) return src;
  const w = PRODUCT_WIDTHS.find((x) => x >= cssWidth * 2);
  return w ? `${m[1]}-${w}.webp` : src;
}

/**
 * src, srcSet and sizes for an <img> whose width depends on the screen: the
 * browser picks the copy. `sizes` says how wide the image shows, as in HTML.
 */
export function responsivePhoto(src: string, sizes: string): { src: string; srcSet?: string; sizes?: string } {
  const p = PRODUCT.exec(src);
  if (p) {
    return {
      src: `${p[1]}-800.webp`,
      srcSet: [...PRODUCT_WIDTHS.map((w) => `${p[1]}-${w}.webp ${w}w`), `${src} 1600w`].join(', '),
      sizes,
    };
  }
  const b = BANNER.exec(src);
  if (b) return { src: `${b[1]}-800.jpg`, srcSet: `${b[1]}-800.jpg 800w, ${src} 1600w`, sizes };
  return { src };
}
