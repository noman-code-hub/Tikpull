const fetch = require('node-fetch');
const cheerio = require('cheerio');

const TIKTOK_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Referer: 'https://www.tiktok.com/',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
};

function isTikTokHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'tiktok.com' || host.endsWith('.tiktok.com');
}

function normalizeTikTokUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw new Error('A TikTok URL is required.');
  }

  const trimmed = inputUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch (error) {
    throw new Error('The URL is not valid.');
  }

  if (!isTikTokHost(parsed.hostname)) {
    throw new Error('Only TikTok URLs are supported.');
  }

  parsed.hash = '';
  return parsed.toString();
}

function extractVideoId(url) {
  const videoMatch = url.match(/\/video\/(\d+)/);
  if (videoMatch) {
    return videoMatch[1];
  }

  const vMatch = url.match(/\/v\/(\d+)/);
  if (vMatch) {
    return vMatch[1];
  }

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('item_id') || parsed.searchParams.get('video_id');
  } catch (error) {
    return null;
  }
}

async function resolveTikTokUrl(inputUrl) {
  const url = normalizeTikTokUrl(inputUrl);
  const response = await fetch(url, {
    method: 'GET',
    headers: TIKTOK_HEADERS,
    redirect: 'follow',
    follow: 10,
    compress: true,
  });

  if (!response.ok) {
    throw new Error(`TikTok returned HTTP ${response.status} while resolving the URL.`);
  }

  const finalUrl = response.url || url;
  const videoId = extractVideoId(finalUrl);

  if (!videoId) {
    throw new Error('Could not find a TikTok video ID in the resolved URL.');
  }

  return {
    fullUrl: finalUrl,
    videoId,
  };
}

async function fetchTikTokPage(fullUrl) {
  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: TIKTOK_HEADERS,
    redirect: 'follow',
    follow: 10,
    compress: true,
  });

  if (!response.ok) {
    throw new Error(`TikTok returned HTTP ${response.status} while fetching the video page.`);
  }

  return response.text();
}

function parseScriptJson($, selector) {
  const script = $(selector).first();
  const rawJson = script.html() || script.text();

  if (!rawJson) {
    return null;
  }

  try {
    return JSON.parse(rawJson.trim());
  } catch (error) {
    throw new Error(`Could not parse TikTok page data from ${selector}.`);
  }
}

function getPath(source, path) {
  return path.reduce((value, key) => {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
    return undefined;
  }, source);
}

function findVideoItem(source, videoId) {
  const directPaths = [
    ['__DEFAULT_SCOPE__', 'webapp.video-detail', 'itemInfo', 'itemStruct'],
    ['__DEFAULT_SCOPE__', 'webapp.share.detail', 'itemInfo', 'itemStruct'],
    ['props', 'pageProps', 'itemInfo', 'itemStruct'],
    ['props', 'pageProps', 'videoData', 'itemInfo', 'itemStruct'],
    ['itemInfo', 'itemStruct'],
  ];

  for (const path of directPaths) {
    const candidate = getPath(source, path);
    if (candidate && candidate.video && candidate.author) {
      return candidate;
    }
  }

  const itemModule = getPath(source, ['props', 'pageProps', 'itemModule']);
  if (itemModule && videoId && itemModule[videoId]) {
    return itemModule[videoId];
  }

  const queue = [source];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();

    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }

    seen.add(current);

    if (
      current.video &&
      current.author &&
      (current.stats || current.statsV2 || current.statistics)
    ) {
      if (!videoId || current.id === videoId || current.awemeId === videoId) {
        return current;
      }
    }

    if (current.itemStruct && current.itemStruct.video && current.itemStruct.author) {
      return current.itemStruct;
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function firstUrl(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = firstUrl(entry);
      if (url) {
        return url;
      }
    }
    return '';
  }

  if (typeof value === 'object') {
    const keys = [
      'UrlList',
      'urlList',
      'url_list',
      'urls',
      'PlayAddr',
      'playAddr',
      'DownloadAddr',
      'downloadAddr',
      'Cover',
      'cover',
    ];
    for (const key of keys) {
      const url = firstUrl(value[key]);
      if (url) {
        return url;
      }
    }
  }

  return '';
}

function collectUrls(value, urls = []) {
  if (!value) {
    return urls;
  }

  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) {
      urls.push(value);
    }
    return urls;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectUrls(entry, urls);
    }
    return urls;
  }

  if (typeof value === 'object') {
    for (const entry of Object.values(value)) {
      collectUrls(entry, urls);
    }
  }

  return urls;
}

function isAwemePlayUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.tiktok.com' && parsed.pathname.includes('/aweme/v1/play/');
  } catch (error) {
    return false;
  }
}

function preferredVideoUrl(value) {
  const urls = collectUrls(value);
  return urls.find(isAwemePlayUrl) || urls[0] || '';
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickBitrateUrl(video, direction) {
  const bitrateInfo = Array.isArray(video.bitrateInfo) ? video.bitrateInfo : [];
  const sorted = bitrateInfo
    .slice()
    .sort((left, right) => {
      if (direction === 'asc') {
        return numberValue(left.Bitrate) - numberValue(right.Bitrate);
      }

      return numberValue(right.Bitrate) - numberValue(left.Bitrate);
    });

  for (const entry of sorted) {
    const url = preferredVideoUrl(entry.PlayAddr);
    if (url) {
      return url;
    }
  }

  return '';
}

function formatAuthor(author) {
  if (author.uniqueId) {
    return `@${author.uniqueId}`;
  }

  if (author.nickname) {
    return author.nickname;
  }

  return '';
}

function buildResult(item, videoId, fullUrl) {
  const video = item.video || {};
  const author = item.author || {};
  const stats = item.stats || item.statsV2 || item.statistics || {};
  const music = item.music || {};
  const videoHd =
    pickBitrateUrl(video, 'desc') ||
    preferredVideoUrl(video.PlayAddrStruct) ||
    preferredVideoUrl(video.playAddr) ||
    preferredVideoUrl(video.downloadAddr);
  const downloadCandidate = preferredVideoUrl(video.downloadAddr);
  const videoSd =
    (isAwemePlayUrl(downloadCandidate) && downloadCandidate) ||
    pickBitrateUrl(video, 'asc') ||
    downloadCandidate ||
    videoHd;

  if (!videoHd && !videoSd) {
    throw new Error('TikTok video URLs were not present in the page data.');
  }

  return {
    success: true,
    video_hd: videoHd,
    video_sd: videoSd,
    audio: firstUrl(music.playUrl),
    thumbnail: firstUrl(video.cover) || firstUrl(video.originCover) || firstUrl(video.dynamicCover),
    title: item.desc || '',
    author: formatAuthor(author),
    likes: numberValue(stats.diggCount || stats.digg_count),
    views: numberValue(stats.playCount || stats.play_count),
    video_id: videoId,
    canonical_url: fullUrl,
  };
}

async function scrapeTikTokVideo(inputUrl) {
  const { fullUrl, videoId } = await resolveTikTokUrl(inputUrl);
  const html = await fetchTikTokPage(fullUrl);
  const $ = cheerio.load(html);
  const universalData = parseScriptJson($, '#__UNIVERSAL_DATA_FOR_REHYDRATION__');
  const pageData = universalData || parseScriptJson($, '#__NEXT_DATA__');

  if (!pageData) {
    throw new Error('Could not find TikTok page data in the HTML response.');
  }

  const item = findVideoItem(pageData, videoId);
  if (!item) {
    throw new Error('Could not extract video details from TikTok page data.');
  }

  return buildResult(item, videoId, fullUrl);
}

module.exports = {
  scrapeTikTokVideo,
  TIKTOK_HEADERS,
  normalizeTikTokUrl,
  extractVideoId,
};
