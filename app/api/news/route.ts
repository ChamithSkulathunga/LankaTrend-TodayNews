
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

const feeds = [
  { name: "BBC Sinhala", url: "https://feeds.bbci.co.uk/sinhala/rss.xml" },
  { name: "Lankadeepa", url: "https://www.lankadeepa.lk/rss" },
  { name: "Ada Derana", url: "https://www.ada.lk/rss" },
  { name: "Lanka Truth", url: "https://lankatruth.com/si/?feed=rss2" },
  { name: "Dinamina", url: "https://www.dinamina.lk/feed/" },
  { name: "Divaina", url: "https://divaina.lk/feed/" },
  { name: "Mawbima", url: "https://mawbima.lk/feed/" },
  { name: "ITN News", url: "https://www.itnnews.lk/feed/" },
  { name: "Gossip Lanka", url: "https://gossiplankahotnews.com/feed/" },
  { name: "Neth News", url: "https://nethnews.lk/feed/" },
  { name: "Hiru News", url: "https://www.hirunews.lk/rss/sinhala.xml" },
  { name: "Newsfirst Sinhala", url: "https://www.newsfirst.lk/sinhala/feed/" },
];

type MediaValue = {
  $?: { url?: string };
  url?: string;
};

type FeedItem = {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  enclosure?: { url?: string; type?: string };
  mediaContent?: MediaValue | MediaValue[];
  mediaThumbnail?: MediaValue | MediaValue[];
  contentEncoded?: string;
};

type Article = {
  title: string;
  link: string;
  image: string | null;
  publishedAt: string | null;
  source: string;
};

function isSinhala(text: string) {
  return /[\u0D80-\u0DFF]/.test(text);
}

function resolveUrl(url?: string, baseUrl?: string): string | null {
  if (!url || !baseUrl) return null;

  try {
    const resolved = new URL(url.trim(), baseUrl);

    if (resolved.protocol === "http:" || resolved.protocol === "https:") {
      return resolved.href;
    }

    return null;
  } catch {
    return null;
  }
}

function getMediaUrl(media?: MediaValue | MediaValue[]): string | null {
  if (!media) return null;

  const items = Array.isArray(media) ? media : [media];

  for (const item of items) {
    const url = item?.$?.url || item?.url;

    if (url) return url;
  }

  return null;
}

function extractImage(item: FeedItem, articleUrl: string): string | null {
  // 1. RSS enclosure image
  if (
    item.enclosure?.url &&
    (!item.enclosure.type || item.enclosure.type.startsWith("image/"))
  ) {
    const image = resolveUrl(item.enclosure.url, articleUrl);
    if (image) return image;
  }

  // 2. Media RSS image
  const mediaUrl =
    getMediaUrl(item.mediaContent) ||
    getMediaUrl(item.mediaThumbnail);

  const mediaImage = resolveUrl(mediaUrl ?? undefined, articleUrl);
  if (mediaImage) return mediaImage;

  // 3. Image inside RSS article content
  const html =
    item.contentEncoded ||
    item.content ||
    item.contentSnippet ||
    "";

  const imageMatch = html.match(
    /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i
  );

  if (imageMatch?.[1]) {
    const image = resolveUrl(imageMatch[1], articleUrl);
    if (image) return image;
  }

  // 4. Open Graph or Twitter image metadata inside RSS content
  const metaImageMatch = html.match(
    /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*content\s*=\s*["']([^"']+)["']/i
  );

  if (metaImageMatch?.[1]) {
    const image = resolveUrl(metaImageMatch[1], articleUrl);
    if (image) return image;
  }

  return null;
}

// When RSS contains no image, look for the image on the article webpage.
async function fetchArticleImage(articleUrl: string): Promise<string | null> {
  try {
    const response = await fetch(articleUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LankaTrend/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    // Read only part of the HTML to reduce processing.
    const reader = response.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let html = "";
    let totalBytes = 0;

    try {
      while (totalBytes < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;

        const remaining = 200_000 - totalBytes;
        const chunk = value.slice(0, remaining);

        html += decoder.decode(chunk, { stream: true });
        totalBytes += chunk.length;

        if (totalBytes >= 200_000) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    // Search Open Graph and Twitter image metadata.
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];

    for (const tag of metaTags) {
      const property = tag.match(
        /\b(?:property|name)\s*=\s*["']([^"']+)["']/i
      )?.[1]?.toLowerCase();

      if (property !== "og:image" && property !== "twitter:image") {
        continue;
      }

      const content = tag.match(
        /\bcontent\s*=\s*["']([^"']+)["']/i
      )?.[1];

      const image = resolveUrl(content, articleUrl);
      if (image) return image;
    }

    // Last attempt: find an image inside article content.
    const articleHtml =
      html.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] || html;

    const imageTags = articleHtml.match(/<img\b[^>]*>/gi) || [];

    for (const tag of imageTags) {
      const src =
        tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1] ||
        tag.match(/\bdata-lazy-src\s*=\s*["']([^"']+)["']/i)?.[1] ||
        tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];

      const image = resolveUrl(src, articleUrl);

      if (
        image &&
        !/(logo|icon|avatar|emoji|pixel|placeholder)/i.test(image)
      ) {
        return image;
      }
    }

    return null;
  } catch {
    // Some news sites block automated requests.
    return null;
  }
}

async function fetchFeed(feed: (typeof feeds)[number]) {
  try {
    const response = await fetch(feed.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LankaTrend/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const parsed = await parser.parseString(xml);

    const items = (parsed.items || []) as FeedItem[];

    const articles: Article[] = items
      .filter(
        (item) =>
          item.title?.trim() &&
          item.link?.trim() &&
          isSinhala(item.title)
      )
      .map((item) => {
        const link = item.link!.trim();

        return {
          title: item.title!.trim(),
          link,
          image: extractImage(item, link),
          publishedAt: item.isoDate || item.pubDate || null,
          source: feed.name,
        };
      });

    return {
      name: feed.name,
      success: true,
      count: articles.length,
      articles,
    };
  } catch (error) {
    console.error(
      `RSS error [${feed.name}]:`,
      error instanceof Error ? error.message : error
    );

    return {
      name: feed.name,
      success: false,
      count: 0,
      articles: [] as Article[],
      error: error instanceof Error ? error.message : "Unknown feed error",
    };
  }
}

export async function GET() {
  const results = await Promise.all(feeds.map(fetchFeed));

  const allArticles = results.flatMap((result) => result.articles);

  // Remove duplicate links.
  const uniqueArticles = Array.from(
    new Map(
      allArticles.map((article) => [article.link, article])
    ).values()
  );

  uniqueArticles.sort((a, b) => {
    const dateA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const dateB = b.publishedAt ? Date.parse(b.publishedAt) : 0;

    return (
      (Number.isFinite(dateB) ? dateB : 0) -
      (Number.isFinite(dateA) ? dateA : 0)
    );
  });

  // Try webpage image extraction only for the first 4 articles
  // from each feed that do not already have an RSS image.
  const candidates = uniqueArticles
    .filter((article) => !article.image)
    .slice(0, 40);

  await Promise.all(
    candidates.map(async (article) => {
      const image = await fetchArticleImage(article.link);
      if (image) article.image = image;
    })
  );

  return Response.json(
    {
      success: uniqueArticles.length > 0,
      count: uniqueArticles.length,
      articles: uniqueArticles,
      sources: results.map(({ articles, ...source }) => source),
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
