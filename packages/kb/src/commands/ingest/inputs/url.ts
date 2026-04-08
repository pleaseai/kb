import type { Source } from '../types'

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export interface UrlInputOptions {
  url: string
  fetchImpl?: FetchLike
}

const SCRIPT_STYLE_RE = /<(script|style)[\s\S]*?<\/\1>/gi
const HEADING_RE = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
const BR_RE = /<br\s*\/?>/gi
const CLOSE_P_RE = /<\/p>/gi
const LI_RE = /<li[^>]*>([\s\S]*?)<\/li>/gi
const ANCHOR_RE = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
const TAG_RE = /<[^>]+>/g
const MULTI_NL_RE = /\n{3,}/g
const NON_SLUG_RE = /[^a-z0-9]+/gi
const TRIM_DASH_RE = /^-+|-+$/g

const NBSP_RE = /&nbsp;/g
const AMP_RE = /&amp;/g
const LT_RE = /&lt;/g
const GT_RE = /&gt;/g
const QUOT_RE = /&quot;/g
const APOS_RE = /&#39;/g

function stripTags(s: string): string {
  return s.replace(TAG_RE, '')
}

function decodeEntities(s: string): string {
  return s
    .replace(NBSP_RE, ' ')
    .replace(AMP_RE, '&')
    .replace(LT_RE, '<')
    .replace(GT_RE, '>')
    .replace(QUOT_RE, '"')
    .replace(APOS_RE, '\'')
}

/**
 * Very small HTML → markdown-ish conversion. This is intentionally minimal;
 * the goal is to strip markup and preserve readable text, not full fidelity.
 * Users needing high-quality conversion can post-process manually.
 */
export function htmlToMarkdown(html: string): string {
  let out = html
  out = out.replace(SCRIPT_STYLE_RE, '')
  out = out.replace(HEADING_RE, (_m, level, text) =>
    `\n\n${'#'.repeat(Number(level))} ${stripTags(text).trim()}\n\n`)
  out = out.replace(BR_RE, '\n')
  out = out.replace(CLOSE_P_RE, '\n\n')
  out = out.replace(LI_RE, (_m, text) => `- ${stripTags(text).trim()}\n`)
  out = out.replace(
    ANCHOR_RE,
    (_m, href, text) => `[${stripTags(text).trim()}](${href})`,
  )
  out = stripTags(out)
  out = decodeEntities(out)
  out = out.replace(MULTI_NL_RE, '\n\n').trim()
  return out
}

function slugify(url: string): string {
  try {
    const u = new URL(url)
    const path = `${u.hostname}${u.pathname}`.replace(NON_SLUG_RE, '-')
    return path.replace(TRIM_DASH_RE, '').slice(0, 80) || 'url'
  }
  catch {
    return 'url'
  }
}

/**
 * Fetch a URL and return a `Source`. HTML responses are converted to a
 * rough markdown rendering; other content types are stored as-is.
 */
export async function readUrlSource(
  options: UrlInputOptions,
): Promise<Source> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (!fetchImpl)
    throw new Error('No fetch implementation available')

  const res = await fetchImpl(options.url)
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${options.url}: ${res.status} ${res.statusText}`,
    )
  }
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  const content = contentType.includes('html') ? htmlToMarkdown(text) : text

  return {
    filename: `${slugify(options.url)}.md`,
    content,
    origin: options.url,
  }
}
