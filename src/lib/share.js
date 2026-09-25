/**
 * What a link shows when it is shared - on Facebook, in WhatsApp, in an ad.
 *
 * Those crawlers read the page's HTML and run no JavaScript, so the React app
 * setting document.title is invisible to them: every link used to preview as
 * the same bare "بريماتكس" with no picture. The server now writes the title,
 * description and picture into the page itself (Open Graph and Twitter tags),
 * per address - a product link previews as that mattress, its price and its
 * photo.
 */
'use strict';

const SITE_NAME = 'بريماتكس';
const DEFAULT_TITLE = 'بريماتكس — متجر المراتب الفاخرة';
const DEFAULT_DESCRIPTION = 'مراتب بريماتكس من مصنعنا في ليبيا — الدفع عند الاستلام وتوصيل مجاني لباب بيتك.';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const formatPrice = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** The product's picture as a full address, or null: an admin upload first, then Odoo's. */
function imageOf(product, origin) {
  if (product.image) return new URL(product.image, origin).href;
  if (product.hasImage) return `${origin}/api/products/${product.id}/image`;
  return null;
}

/** The lowest price a product sells at - what "يبدأ من" means on its card. */
function priceFrom(product) {
  const prices = (product.variants ?? [product]).map((v) => Number(v.price)).filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : Number(product.price);
}

/**
 * The page's title, description, picture and type for an address.
 * `products` is the public catalogue; `banners` the home banners.
 */
function describe(pathname, { products, banners, origin }) {
  const fallbackImage = banners[0] ? new URL(banners[0].imageUrl, origin).href : null;

  const productMatch = pathname.match(/^\/product\/(\d+)\/?$/);
  if (productMatch) {
    const id = Number(productMatch[1]);
    const product = products.find((p) => p.id === id || (p.variants ?? []).some((v) => v.id === id));
    if (product) {
      const from = priceFrom(product);
      const tier = product.tier ? `فئة ${product.tier.name} · ` : '';
      return {
        title: `${product.name} — ${SITE_NAME}`,
        description:
          product.description ||
          `${tier}${product.variants ? 'يبدأ من ' : ''}${formatPrice(from)} د.ل — الدفع عند الاستلام وتوصيل مجاني.`,
        image: imageOf(product, origin) || fallbackImage,
        type: 'product',
        price: from,
        inStock: product.inStock !== false,
        product,
      };
    }
  }

  if (/^\/shop\/?$/.test(pathname)) {
    return {
      title: `المراتب — ${SITE_NAME}`,
      description: DEFAULT_DESCRIPTION,
      image: fallbackImage || firstImage(products, origin),
      type: 'website',
    };
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    image: fallbackImage || firstImage(products, origin),
    type: 'website',
  };
}

function firstImage(products, origin) {
  for (const p of products) {
    const image = imageOf(p, origin);
    if (image) return image;
  }
  return null;
}

/**
 * JSON for a <script> data block: a "</script>" inside a value must not end
 * the block, so every "<" is written as its escape (still the same JSON).
 */
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const availabilityOf = (inStock) => `https://schema.org/${inStock === false ? 'OutOfStock' : 'InStock'}`;

/**
 * schema.org data for search engines - Google shows the price, the stock and
 * the stars under the result. A product page gets a Product (with every
 * size's price, and the rating once there are reviews); every page names the
 * shop. Dinars: this is what a person sees, unlike Meta's dollars.
 */
function structuredData(page, context, url) {
  const shop = { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: context.origin };
  if (page.type !== 'product') return [shop];

  const p = page.product;
  const sizes = p.variants ?? [{ id: p.id, price: p.price, inStock: p.inStock }];
  const prices = sizes.map((v) => Number(v.price)).filter((n) => n > 0);
  const offers =
    sizes.length > 1
      ? {
          '@type': 'AggregateOffer',
          priceCurrency: 'LYD',
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: sizes.length,
          availability: availabilityOf(sizes.some((v) => v.inStock !== false)),
          url,
        }
      : {
          '@type': 'Offer',
          priceCurrency: 'LYD',
          price: prices[0] ?? Number(p.price),
          availability: availabilityOf(p.inStock),
          itemCondition: 'https://schema.org/NewCondition',
          url,
        };

  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: page.description,
    brand: { '@type': 'Brand', name: 'Brimatex' },
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.tier ? { category: p.tier.name } : {}),
    ...(page.image ? { image: [page.image] } : {}),
    offers,
  };

  const reviews = context.reviews;
  if (reviews && reviews.count > 0 && reviews.average !== null) {
    product.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: reviews.average,
      reviewCount: reviews.count,
      bestRating: 5,
      worstRating: 1,
    };
    product.review = reviews.reviews.slice(0, 5).map((r) => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      author: { '@type': 'Person', name: r.name },
      datePublished: String(r.createdAt).slice(0, 10),
      ...(r.comment ? { reviewBody: r.comment } : {}),
    }));
  }
  return [shop, product];
}

/**
 * The shell with this address's tags: its <title> and description replaced,
 * the Open Graph / Twitter tags added before </head>.
 */
function render(shell, pathname, search, context) {
  const page = describe(pathname, context);
  const url = context.origin + pathname + (search || '');
  const tags = [
    `<link rel="canonical" href="${escapeHtml(context.origin + pathname)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="ar_LY" />`,
    `<meta property="og:type" content="${page.type}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    page.image ? `<meta property="og:image" content="${escapeHtml(page.image)}" />` : '',
    `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    page.image ? `<meta name="twitter:image" content="${escapeHtml(page.image)}" />` : '',
    // Read by Facebook for product links; dinars here - this is what a person sees.
    page.type === 'product' ? `<meta property="product:price:amount" content="${page.price}" />` : '',
    page.type === 'product' ? `<meta property="product:price:currency" content="LYD" />` : '',
    page.type === 'product'
      ? `<meta property="product:availability" content="${page.inStock ? 'in stock' : 'out of stock'}" />`
      : '',
  ].filter(Boolean);
  for (const data of structuredData(page, context, url)) {
    tags.push(`<script type="application/ld+json">${jsonForScript(data)}</script>`);
  }

  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtml(page.description)}" />`
    )
    .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
}

module.exports = { render, describe, imageOf, priceFrom, escapeHtml, structuredData, jsonForScript };
