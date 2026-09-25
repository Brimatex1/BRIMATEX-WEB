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
// Worded the way Libyans search - in Arabic, with "مراتب" / "مرتبة" in them;
// Odoo's product names are English. The app sets the same titles once it
// runs (web/src/lib/pageTitle.ts), and search engines keep that one: change
// both together.
const DEFAULT_TITLE = 'بريماتكس — مراتب صناعة ليبية | الدفع عند الاستلام';
const SHOP_TITLE = 'مراتب للبيع في ليبيا — بريماتكس';
const DEFAULT_DESCRIPTION = 'مراتب بريماتكس من مصنعنا في ليبيا — الدفع عند الاستلام وتوصيل مجاني لباب بيتك.';

/** What search engines are told about the shop itself - all of it already on the site. */
const SHOP_FACTS = {
  telephone: '+218935770070',
  locality: 'طرابلس',
  sameAs: ['https://www.facebook.com/profile.php?id=100083078093248'],
};

const productTitle = (p) => `${p.name} — ${p.tier ? `مرتبة ${p.tier.name}` : 'مرتبة'} | ${SITE_NAME}`;
const tierTitle = (name) => `مراتب ${name} — ${SITE_NAME}`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const formatPrice = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** The product's picture as a full address - the one uploaded from the dashboard - or null. */
function imageOf(product, origin) {
  return product.image ? new URL(product.image, origin).href : null;
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
function describe(pathname, { products, banners, origin }, search = '') {
  const fallbackImage = banners[0] ? new URL(banners[0].imageUrl, origin).href : null;

  // A tier's page (/shop?category=premium) is its own page - its own title and
  // canonical address. With /shop as its canonical, Google would drop it as a
  // duplicate although the sitemap lists it.
  const category = /^\/shop\/?$/.test(pathname) ? new URLSearchParams(search).get('category') : null;
  const tier = category ? products.find((p) => p.tier?.key === category)?.tier : null;
  if (tier) {
    const items = products.filter((p) => p.tier?.key === tier.key);
    const path = `/shop?category=${encodeURIComponent(tier.key)}`;
    return {
      title: tierTitle(tier.name),
      heading: `مراتب ${tier.name}`,
      description: `مراتب بريماتكس من فئة ${tier.name} (${items.length}) — صناعة ليبية، الدفع عند الاستلام وتوصيل مجاني لباب بيتك.`,
      image: firstImage(items, origin) || fallbackImage,
      type: 'website',
      canonicalPath: path,
      listed: items,
      crumbs: [
        { name: SITE_NAME, path: '/' },
        { name: 'المراتب', path: '/shop' },
        { name: `مراتب ${tier.name}`, path },
      ],
    };
  }

  const productMatch = pathname.match(/^\/product\/(\d+)\/?$/);
  if (productMatch) {
    const id = Number(productMatch[1]);
    const product = products.find((p) => p.id === id || (p.variants ?? []).some((v) => v.id === id));
    if (product) {
      const from = priceFrom(product);
      const kind = product.tier ? `مرتبة ${product.tier.name}` : 'مرتبة';
      const tierPath = product.tier ? `/shop?category=${encodeURIComponent(product.tier.key)}` : '/shop';
      return {
        title: productTitle(product),
        // A size's id opens the same page; the product's own id is its one address.
        canonicalPath: `/product/${product.id}`,
        heading: product.name,
        description:
          product.description ||
          `${product.name} — ${kind} من بريماتكس، صناعة ليبية. ${product.variants ? 'يبدأ من ' : ''}${formatPrice(from)} د.ل — الدفع عند الاستلام وتوصيل مجاني.`,
        image: imageOf(product, origin) || fallbackImage,
        type: 'product',
        price: from,
        inStock: product.inStock !== false,
        product,
        // Other mattresses, the same tier first - links a crawler can follow.
        listed: [
          ...products.filter((p) => p.id !== product.id && p.tier?.key === product.tier?.key),
          ...products.filter((p) => p.id !== product.id && p.tier?.key !== product.tier?.key),
        ].slice(0, 8),
        crumbs: [
          { name: SITE_NAME, path: '/' },
          product.tier ? { name: `مراتب ${product.tier.name}`, path: tierPath } : { name: 'المراتب', path: '/shop' },
          { name: product.name, path: `/product/${product.id}` },
        ],
      };
    }
  }

  if (/^\/shop\/?$/.test(pathname)) {
    return {
      title: SHOP_TITLE,
      heading: 'مراتب بريماتكس',
      description: DEFAULT_DESCRIPTION,
      image: fallbackImage || firstImage(products, origin),
      type: 'website',
      listed: products,
      crumbs: [
        { name: SITE_NAME, path: '/' },
        { name: 'المراتب', path: '/shop' },
      ],
    };
  }

  return {
    title: DEFAULT_TITLE,
    heading: 'بريماتكس — مراتب صناعة ليبية',
    description: DEFAULT_DESCRIPTION,
    image: fallbackImage || firstImage(products, origin),
    type: 'website',
    // The home page lists everything; any other page (the quiz, an unknown
    // address) links to the shop and nothing more.
    listed: pathname === '/' ? products : [],
  };
}

/**
 * The page's text, in the HTML itself, for crawlers that run no JavaScript
 * (and Google's first look, before it runs any): a heading, the description,
 * the prices, and links to the tiers and the mattresses. React replaces it the
 * moment the app starts - createRoot empties its container - so a visitor sees
 * it only on a connection too slow to have loaded the app yet, and then it is
 * the same content, not something else.
 */
function bodyHtml(page, products) {
  const link = (path, text) => `<a href="${escapeHtml(path)}">${escapeHtml(text)}</a>`;
  const parts = [];
  if (page.crumbs) {
    parts.push(
      `<nav aria-label="مسار الصفحة">${page.crumbs
        .map((c, i) => (i === page.crumbs.length - 1 ? escapeHtml(c.name) : link(c.path, c.name)))
        .join(' › ')}</nav>`
    );
  }
  parts.push(`<h1>${escapeHtml(page.heading || page.title)}</h1>`);
  parts.push(`<p>${escapeHtml(page.description)}</p>`);

  if (page.type === 'product') {
    const p = page.product;
    const sizes = (p.variants ?? []).filter((v) => Number(v.price) > 0);
    if (sizes.length) {
      parts.push(
        `<h2>المقاسات والأسعار</h2><ul>${sizes
          .slice(0, 40)
          .map((v) => `<li>${escapeHtml(v.label)}: ${formatPrice(v.price)} د.ل${v.inStock === false ? ' (غير متوفر حالياً)' : ''}</li>`)
          .join('')}</ul>`
      );
    } else {
      parts.push(`<p>السعر: ${formatPrice(p.price)} د.ل</p>`);
    }
  }

  const tiers = [...new Map(products.filter((p) => p.tier).map((p) => [p.tier.key, p.tier])).values()].sort(
    (a, b) => a.rank - b.rank
  );
  if (tiers.length) {
    parts.push(
      `<h2>الفئات</h2><ul>${tiers
        .map((t) => `<li>${link(`/shop?category=${encodeURIComponent(t.key)}`, `مراتب ${t.name}`)}</li>`)
        .join('')}</ul>`
    );
  }
  if (page.listed?.length) {
    parts.push(
      `<h2>${page.type === 'product' ? 'مراتب أخرى' : 'المراتب'}</h2><ul>${page.listed
        .map(
          (p) =>
            `<li>${link(`/product/${p.id}`, p.name)}${p.tier ? ` — مرتبة ${escapeHtml(p.tier.name)}` : ''} — ${
              p.variants ? 'يبدأ من ' : ''
            }${formatPrice(priceFrom(p))} د.ل</li>`
        )
        .join('')}</ul>`
    );
  } else {
    parts.push(`<p>${link('/shop', 'تصفّح كل المراتب')}</p>`);
  }
  parts.push(`<p>الدفع عند الاستلام · توصيل مجاني · ضمان حتى 10 سنوات لبعض المنتجات · ${SHOP_FACTS.locality}، ليبيا</p>`);
  return `<div class="ssr-fallback">${parts.join('\n')}</div>`;
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
  const shop = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: 'Brimatex',
    url: context.origin,
    telephone: SHOP_FACTS.telephone,
    address: { '@type': 'PostalAddress', addressLocality: SHOP_FACTS.locality, addressCountry: 'LY' },
    areaServed: { '@type': 'Country', name: 'ليبيا' },
    sameAs: SHOP_FACTS.sameAs,
  };
  const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: context.origin, inLanguage: 'ar' };
  // The path Google shows instead of a bare address: بريماتكس › مراتب كومفورت › Comfort Mattress.
  const crumbs = page.crumbs
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: page.crumbs.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.name,
            item: context.origin + c.path,
          })),
        },
      ]
    : [];
  if (page.type !== 'product') return [shop, site, ...crumbs];

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
  return [shop, site, ...crumbs, product];
}

/**
 * The product's details as Meta's Pixel reads them from the page. A catalogue
 * whose data source is the Pixel builds each item from these: the Pixel's
 * ViewContent names the id, and the tags on the page supply the rest. So the
 * id is the one the Pixel reports (the card's), and the price is in dollars at
 * the dashboard's rate, like the Pixel and the feed (src/lib/metaFeed.js) -
 * Meta does not accept dinars. With no rate set, dinars are written as they are.
 * The app writes the same tags when a visitor moves to another product
 * (web/src/lib/pixel.ts): keep the two in step.
 */
function productTags(page, lydPerUsd) {
  const p = page.product;
  const usd = lydPerUsd > 0;
  const amount = usd ? (page.price / lydPerUsd).toFixed(2) : String(page.price);
  return [
    `<meta property="product:retailer_item_id" content="${p.id}" />`,
    p.variants ? `<meta property="product:item_group_id" content="${p.id}" />` : '',
    `<meta property="product:brand" content="Brimatex" />`,
    `<meta property="product:condition" content="new" />`,
    `<meta property="product:price:amount" content="${amount}" />`,
    `<meta property="product:price:currency" content="${usd ? 'USD' : 'LYD'}" />`,
    `<meta property="product:availability" content="${page.inStock ? 'in stock' : 'out of stock'}" />`,
    p.tier ? `<meta property="product:category" content="${escapeHtml(`مراتب > ${p.tier.name}`)}" />` : '',
  ];
}

/**
 * The shell with this address's tags: its <title> and description replaced,
 * the Open Graph / Twitter tags added before </head>.
 */
function render(shell, pathname, search, context) {
  const page = describe(pathname, context, search);
  // The page's one address - also og:url and the offer's url, so an ad's
  // ?fbclid=... or a size's id does not make Facebook count a second page.
  const url = context.origin + (page.canonicalPath || pathname);
  const tags = [
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
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
    ...(page.type === 'product' ? productTags(page, context.lydPerUsd) : []),
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
    .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${bodyHtml(page, context.products)}</div>`);
}

module.exports = { render, describe, imageOf, priceFrom, escapeHtml, structuredData, jsonForScript };
