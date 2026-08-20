#!/usr/bin/env node
/* Builds feed.json from the RSS sources declared in index.html.
   Runs on GitHub Actions (Node 20+, no dependencies). Fetching server-side means
   no CORS relays: we hit the publishers' feeds directly. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'feed.json');

const PER_SOURCE = 6;     // articles kept per source
const TOTAL_CAP = 120;    // articles kept overall
const MAX_AGE_DAYS = 120; // skip evergreen/archive items some feeds republish
const UA = 'Mozilla/5.0 (compatible; EmeraldReaderBot/1.0; +https://github.com/Zhen-Miao/emerald-reader)';

/* ---------- read SOURCES + NW_RE out of index.html (single source of truth) ---------- */
function extractSources(html){
  const decl = html.match(/\bconst\s+SOURCES\s*=\s*\[/);
  if(!decl) throw new Error('SOURCES array not found in index.html');
  const open = decl.index + decl[0].length - 1;
  let depth = 0, end = -1;
  for(let i = open; i < html.length; i++){
    const c = html[i];
    if(c === '[') depth++;
    else if(c === ']'){ depth--; if(depth === 0){ end = i; break; } }
  }
  if(end < 0) throw new Error('unterminated SOURCES array');
  return new Function('return ' + html.slice(open, end + 1))();
}
function extractNwRe(html){
  const m = html.match(/const NW_RE=(\/[^\n]+\/[a-z]*);/);
  return m ? new Function('return ' + m[1])() : /washington|seattle|northwest/i;
}

/* ---------- tiny XML/HTML helpers (no DOMParser in Node) ---------- */
const ENTITIES = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', ndash:'–', mdash:'—',
                   lsquo:'‘', rsquo:'’', ldquo:'“', rdquo:'”', hellip:'…', '#39':"'" };
function decode(s){
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}
function safeChar(code){
  try { return String.fromCodePoint(code); } catch(e){ return ''; }
}
function blocks(xml, tag){
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'gi');
  const out = [];
  let m;
  while((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function tagText(xml, tag){
  const m = xml.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? decode(m[1]).trim() : '';
}
function attrOf(xml, tagPattern, attr){
  const m = xml.match(new RegExp('<' + tagPattern + '[^>]*\\s' + attr + '=["\']([^"\']+)["\']', 'i'));
  return m ? decode(m[1]).trim() : '';
}

/* Mirrors stripHTML() in index.html: paragraphs of real prose, no boilerplate. */
function stripHTML(html){
  let h = decode(html || '');
  h = h.replace(/<(script|style|figure|figcaption|noscript|form|aside)[\s\S]*?<\/\1>/gi, ' ')
       .replace(/<(img|br|hr)[^>]*>/gi, ' ');
  let paras = (h.match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi) || [])
    .map(p => decode(p.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter(t => t.length > 40);
  if(!paras.length){
    const t = decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if(t){
      paras = t.split(/(?<=[.!?])\s+(?=[A-Z“"])/).reduce((acc, s) => {
        if(!acc.length || acc[acc.length - 1].split('. ').length >= 3) acc.push(s);
        else acc[acc.length - 1] += ' ' + s;
        return acc;
      }, []);
      paras = paras.filter(t => t.length > 40);
    }
  }
  return paras.slice(0, 40);
}

function isoDate(raw){
  const d = new Date(raw || '');
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function todayKey(){
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}
function idFor(srcKey, link){
  return 'f-' + srcKey + '-' + link.replace(/[^a-z0-9]/gi, '').slice(-40);
}

async function get(url, ms = 15000){
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(ms),
      headers: { 'user-agent': UA, 'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }
    });
    if(!r.ok) return null;
    const t = await r.text();
    return t && t.length > 200 ? t : null;
  } catch(e){ return null; }
}

/* ---------- feed parsing (mirrors parseFeed() in index.html) ---------- */
function parseFeed(xml, src, NW_RE){
  let entries = blocks(xml, 'item');
  if(!entries.length) entries = blocks(xml, 'entry');
  if(!entries.length) return null;

  const out = [];
  for(const it of entries.slice(0, 10)){
    const title = tagText(it, 'title');
    let link = tagText(it, 'link');
    if(!link || !/^https?:\/\//.test(link)){
      link = attrOf(it, 'link[^>]*rel=["\']alternate["\']', 'href') || attrOf(it, 'link', 'href') || link;
    }
    if(!title || !/^https?:\/\//.test(link)) continue;

    const desc = tagText(it, 'description') || tagText(it, 'summary');
    if(src.nwOnly && !NW_RE.test(title + ' ' + desc)) continue;

    const date = isoDate(tagText(it, 'pubDate') || tagText(it, 'published') ||
                         tagText(it, 'updated') || tagText(it, 'dc:date'));

    let content = tagText(it, 'content:encoded');
    if(!content){
      const c = tagText(it, 'content');
      if(c && c.length > 200) content = c;
    }

    let img = attrOf(it, 'media:content', 'url') || attrOf(it, 'media:thumbnail', 'url') ||
              attrOf(it, 'enclosure[^>]*type=["\']image', 'url') || attrOf(it, 'enclosure', 'url') || '';
    if(!img) img = attrOf(content || desc, 'img', 'src') || '';
    if(!/^https?:\/\//.test(img)) img = '';

    const fullText = !!(content && content.length > Math.max(500, (desc || '').length));
    const paras = stripHTML(fullText ? content : (desc || ''));
    if(!paras.length) continue;
    if(src.nwOnly && !NW_RE.test(title + ' ' + paras.slice(0, 3).join(' '))) continue;

    out.push({
      id: idFor(src.key, link), srcKey: src.key, cat: src.cat, title,
      author: tagText(it, 'dc:creator') || tagText(it, 'author') || '',
      date: date || todayKey(), url: link, paras, img,
      fetched: true, fullText, annos: null
    });
  }
  return out;
}

/* Last-resort route for feed-less or bot-protected sites, same as the browser's. */
function gnewsUrl(src){
  const host = new URL(src.home).hostname.replace(/^www\./, '');
  let q = 'site:' + host;
  if(src.nwOnly) q += ' (washington OR seattle OR northwest)';
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en';
}
function cleanGnewsTitle(t){
  const i = t.lastIndexOf(' - ');
  return (i > 10 && t.length - i < 60) ? t.slice(0, i).trim() : t.trim();
}
function parseGnews(xml, src){
  const out = [];
  for(const it of blocks(xml, 'item').slice(0, 6)){
    const title = cleanGnewsTitle(tagText(it, 'title'));
    const link = tagText(it, 'link');
    if(!title || !/^https?:\/\//.test(link)) continue;
    let snippet = decode(tagText(it, 'description').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    snippet = cleanGnewsTitle(snippet);
    const paras = [(snippet && snippet.length > 25 && snippet !== title)
      ? snippet
      : ('“' + title + '” — open the full story at ' + src.name + ' with the link above.')];
    out.push({
      id: idFor(src.key, link), srcKey: src.key, cat: src.cat, title, author: '',
      date: isoDate(tagText(it, 'pubDate')) || todayKey(), url: link, paras, img: '',
      fetched: true, fullText: false, gnews: true, annos: null
    });
  }
  return out;
}

function isFresh(a){
  if(!a.date) return true;
  const age = (Date.now() - new Date(a.date + 'T12:00:00Z').getTime()) / 86400000;
  return age <= MAX_AGE_DAYS;
}

async function collect(src, NW_RE){
  for(const feed of src.feeds){
    const xml = await get(feed);
    if(!xml) continue;
    const items = parseFeed(xml, src, NW_RE);
    if(items && items.length) return { items, via: 'feed' };
  }
  const g = await get(gnewsUrl(src));
  if(g){
    const items = parseGnews(g, src);
    if(items.length) return { items, via: 'google-news' };
  }
  return { items: [], via: 'none' };
}

async function runLimited(tasks, limit){
  let i = 0;
  const worker = async () => { while(i < tasks.length){ await tasks[i++](); } };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

(async () => {
  const html = fs.readFileSync(HTML, 'utf8');
  const SOURCES = extractSources(html);
  const NW_RE = extractNwRe(html);
  console.log('sources: ' + SOURCES.length);

  const articles = [];
  const report = [];
  await runLimited(SOURCES.map(src => async () => {
    const { items, via } = await collect(src, NW_RE);
    const kept = items.filter(isFresh).slice(0, PER_SOURCE);
    articles.push(...kept);
    report.push({ source: src.key, count: kept.length, via });
    console.log(`${src.name}: ${kept.length} article(s) via ${via}`);
  }), 4);

  // newest first, deduped by url, capped
  const seen = new Set();
  const merged = articles
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .filter(a => !seen.has(a.url) && seen.add(a.url))
    .slice(0, TOTAL_CAP);

  if(!merged.length){
    console.error('No articles fetched from any source — keeping the previous feed.json.');
    process.exit(1);
  }

  const payload = {
    builtAt: new Date().toISOString(),
    builtFor: todayKey(),
    count: merged.length,
    sources: report.sort((a, b) => a.source.localeCompare(b.source)),
    articles: merged
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1) + '\n');
  console.log(`\nwrote feed.json — ${merged.length} articles from ${report.filter(r => r.count).length}/${SOURCES.length} sources`);
})();
