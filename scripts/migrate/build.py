#!/usr/bin/env python3
"""Turn the Squarespace snapshot into the V1 site source.

Reads  .migrate/snapshot (from crawl.py)
Writes src/v1/pages/<key>.html + <key>.json   page body + head metadata
       public/images, public/files, public/fonts, public/s   self-hosted assets
       public/css/squarespace/*.css                         site stylesheets (URLs rewritten)
       public/__q/*.xml, public/sitemap.xml, public/robots.txt
       src/v1/routes.json                                   query-string routes for the Worker

Everything Squarespace loaded from its CDNs is downloaded once and served from
this site, so nothing breaks when the Squarespace subscription ends.
Run:  pip install -r scripts/migrate/requirements.txt
      python3 scripts/migrate/build.py [SNAPSHOT_DIR]
"""
import concurrent.futures as cf
import hashlib
import html as htmlmod
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup, Comment

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SNAP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.migrate/snapshot')
CACHE = os.path.join(os.path.dirname(SNAP), 'cache')
PUBLIC = os.path.join(ROOT, 'public')
PAGES_OUT = os.path.join(ROOT, 'src/v1/pages')
SITE = 'https://www.overyondr.com'
UA = {'User-Agent': 'Mozilla/5.0 (overyondr site migration)', 'Accept': 'image/webp,image/*,*/*;q=0.8'}

ASSET_HOSTS = r'(?:images\.squarespace-cdn\.com|static1\.squarespace\.com|file\.squarespace-cdn\.com|assets\.squarespace\.com|definitions\.sqspcdn\.com)'
ASSET_URL = re.compile(r'(?:https?:)?//' + ASSET_HOSTS + r'/[^\s"\'()<>,\\]+')
SITE_URL = re.compile(r'https?://(?:www\.)?overyondr\.com(?=[/"\'?#]|$)')
WIDTHS = (750, 1500, 2500)

# Live-site bugs fixed during migration (path -> replacement)
LINK_FIXES = {'/GET_IN_TOUCH': '/contact'}

os.makedirs(CACHE, exist_ok=True)
_lock = threading.Lock()
_url_map = {}          # (url, width) -> local path
_name_owner = {}       # local path -> content sha


def log(*a):
    print(*a, flush=True)


def download(url):
    """Fetch url (cached on disk). Returns (bytes, content_type) or (None, None)."""
    h = hashlib.sha1(url.encode()).hexdigest()
    body_f, meta_f = os.path.join(CACHE, h), os.path.join(CACHE, h + '.type')
    if os.path.exists(body_f):
        return open(body_f, 'rb').read(), open(meta_f).read()
    for attempt in range(4):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60)
            data, ctype = r.read(), r.headers.get('Content-Type', '')
            open(body_f, 'wb').write(data)
            open(meta_f, 'w').write(ctype)
            return data, ctype
        except urllib.error.HTTPError as e:
            if e.code in (403, 404, 410):
                log('  missing', e.code, url)
                return None, None
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    log('  FAILED', url)
    return None, None


EXT = {'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
       'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico',
       'application/pdf': '.pdf', 'font/woff2': '.woff2', 'font/woff': '.woff',
       'application/font-woff2': '.woff2', 'text/css': '.css', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3'}


def clean_name(s, maxlen=60):
    s = urllib.parse.unquote_plus(s)
    s = os.path.splitext(s)[0]
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return (s[:maxlen].rstrip('-') or 'file')


def normalize(url):
    url = htmlmod.unescape(url)
    if url.startswith('//'):
        url = 'https:' + url
    return url


def bucket(width):
    for w in WIDTHS:
        if width <= w:
            return w
    return WIDTHS[-1]


def optimize_image(data, ext, max_width):
    """Re-encode as lossy WebP (q82, alpha kept) no wider than max_width.
    Squarespace serves near-lossless WebP that is often 5-10x larger than needed."""
    import io
    from PIL import Image
    try:
        im = Image.open(io.BytesIO(data))
        if getattr(im, 'is_animated', False):
            return data, ext
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGBA' if 'A' in im.getbands() or im.mode == 'P' else 'RGB')
        if max_width and im.width > max_width:
            im = im.resize((max_width, round(im.height * max_width / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=82, method=4)
        out = buf.getvalue()
        return (out, '.webp') if len(out) < len(data) else (data, ext)
    except Exception as e:
        log('  could not optimize image:', e)
        return data, ext


def store(data, folder, base, ext):
    """Save content under public/<folder>/ with a content-hashed name; returns URL path."""
    sha = hashlib.sha1(data).hexdigest()[:8]
    rel = f'/{folder}/{base}-{sha}{ext}'
    with _lock:
        if rel not in _name_owner:
            os.makedirs(os.path.join(PUBLIC, folder), exist_ok=True)
            with open(os.path.join(PUBLIC, rel.lstrip('/')), 'wb') as f:
                f.write(data)
            _name_owner[rel] = sha
    return rel


def localize(url, width=None):
    """Download a Squarespace-hosted asset and return its local path (or None)."""
    url = normalize(url)
    p = urllib.parse.urlsplit(url)
    host, path, query = p.netloc, p.path, urllib.parse.parse_qs(p.query)
    key = (url, width)
    with _lock:
        if key in _url_map:
            return _url_map[key]
    local = None
    if host == 'images.squarespace-cdn.com':
        fmt = query.get('format', [''])[0]
        name = path.rsplit('/', 1)[-1]
        is_static = name.lower().endswith(('.gif', '.svg', '.ico'))
        if is_static:
            fetch_url, w = f'https://{host}{path}', None
        else:
            want = width or (int(fmt[:-1]) if fmt.endswith('w') and fmt[:-1].isdigit() else 1500)
            w = bucket(want)
            fetch_url = f'https://{host}{path}?format={w}w'
        data, ctype = download(fetch_url)
        if not data and not is_static:
            # Some legacy images 404 at a given size; fall back to the original upload.
            data, ctype = download(f'https://{host}{path}')
        if data:
            ext = EXT.get(ctype.split(';')[0].strip(), os.path.splitext(name)[1].lower() or '.bin')
            if not is_static:
                data, ext = optimize_image(data, ext, w)
            local = store(data, 'images', clean_name(name), ext)
    elif host in ('static1.squarespace.com', 'file.squarespace-cdn.com', 'assets.squarespace.com', 'definitions.sqspcdn.com'):
        data, ctype = download(f'https://{host}{path}')
        if data:
            name = path.rsplit('/', 1)[-1]
            ext = os.path.splitext(name)[1].lower() or EXT.get(ctype.split(';')[0].strip(), '.bin')
            folder = 'fonts' if ext in ('.woff', '.woff2', '.ttf', '.otf', '.eot') else 'files'
            local = store(data, folder, clean_name(name), ext)
    if local is None:
        # Already broken on the live site (Squarespace returns 404). Keep it broken the same way,
        # but without a dependency on Squarespace, and record it for the migration report.
        local = '/images/_missing.svg' if host == 'images.squarespace-cdn.com' else '/files/_missing/' + clean_name(path.rsplit('/', 1)[-1])
        with _lock:
            _missing.add(url.split('?')[0])
    with _lock:
        _url_map[key] = local
    return local


_missing = set()


def rewrite_srcset(value):
    out = {}
    for cand in value.split(','):
        bits = cand.strip().split()
        if not bits:
            continue
        u = bits[0]
        desc = bits[1] if len(bits) > 1 else ''
        w = int(desc[:-1]) if desc.endswith('w') and desc[:-1].isdigit() else None
        if not ASSET_URL.match(u):
            out[u] = desc
            continue
        loc = localize(u, width=w)
        if not loc:
            continue
        bw = bucket(w) if w else None
        prev = out.get(loc)
        if prev is None or (bw and prev and int(prev[:-1]) < bw):
            out[loc] = f'{bw}w' if bw else desc
    return ', '.join(f'{u} {d}'.strip() for u, d in out.items())


def rewrite_text(text):
    """Rewrite every Squarespace asset URL and absolute site link in a blob of HTML/CSS."""
    def asset(m):
        loc = localize(m.group(0))
        return loc or m.group(0)
    text = ASSET_URL.sub(asset, text)
    return text


def site_relative(url):
    if not url:
        return url
    u = SITE_URL.sub('', url)
    if u == '':
        u = '/'
    path = u.split('?')[0].split('#')[0]
    if path in LINK_FIXES:
        u = LINK_FIXES[path] + u[len(path):]
    return u


# ---------------------------------------------------------------- stylesheets
def collect_css(docs):
    """Download every stylesheet the pages use, in first-seen order, rewrite URLs inside."""
    order, seen = [], set()
    for soup in docs:
        for link in soup.head.find_all('link', rel='stylesheet'):
            href = normalize(link.get('href', ''))
            if ASSET_URL.match(href) and href not in seen:
                seen.add(href)
                order.append(href)
    comp, site = [], []
    for href in order:
        data, _ = download(href)
        if not data:
            continue
        css = data.decode('utf8', 'ignore')
        css = re.sub(r'url\(\s*([\'"]?)(//|https?://)', lambda m: f'url({m.group(1)}{m.group(2)}', css)
        css = ASSET_URL.sub(lambda m: localize(m.group(0)) or m.group(0), css)
        (comp if 'definitions.sqspcdn.com' in href else site).append((href, css))
    outdir = os.path.join(PUBLIC, 'css/squarespace')
    os.makedirs(outdir, exist_ok=True)
    files = []
    with open(os.path.join(outdir, 'components.css'), 'w') as f:
        for href, css in comp:
            f.write(css + '\n')
    files.append('/css/squarespace/components.css')
    for href, css in site:
        name = 'custom.css' if 'custom-css' in href else ('template.css' if '/vta/' in href else 'site.css')
        with open(os.path.join(outdir, name), 'w') as f:
            f.write('/* migrated from Squarespace */\n' + css + '\n')
        files.append(f'/css/squarespace/{name}')
    return files


def font_faces(soup):
    st = soup.head.find('style', attrs={'data-sqsp-font-ids': True})
    return rewrite_text(st.string) if st and st.string else ''


# ---------------------------------------------------------------- pages
KEEP_HEAD_META = re.compile(r'^(og:|twitter:|description$|name$|url$|image$|thumbnailUrl$)')


def head_meta(soup, path):
    head = soup.head
    title = head.title.get_text() if head.title else ''
    metas = []
    for m in head.find_all('meta'):
        k = m.get('property') or m.get('name') or m.get('itemprop')
        if k and KEEP_HEAD_META.match(k):
            attrs = {a: (v if isinstance(v, str) else ' '.join(v)) for a, v in m.attrs.items()}
            if 'content' in attrs:
                c = attrs['content']
                if ASSET_URL.match(c):
                    attrs['content'] = SITE + (localize(c) or '')
            metas.append(attrs)
    canonical = head.find('link', rel='canonical')
    icon = head.find('link', rel='icon')
    ld = [rewrite_text(s.string or '') for s in head.find_all('script', type='application/ld+json')]
    styles = [rewrite_text(s.string or '') for s in head.find_all('style')
              if not s.get('data-sqsp-font-ids') and 'wf-loading' not in (s.string or '')]
    return {
        'path': path,
        'title': title,
        'metas': metas,
        'canonical': canonical['href'] if canonical else None,
        'icon': localize(icon['href']) if icon else None,
        'jsonld': ld,
        'headStyles': [s for s in styles if s.strip()],
        'htmlLang': soup.html.get('lang', 'en-US'),
        'bodyId': soup.body.get('id'),
        'bodyClass': ' '.join(soup.body.get('class', [])),
    }


CONTENT_BLOCK = re.compile(r'sqs-block-(code|embed|html)')
ANALYTICS = re.compile(r'googletagmanager|gtag\(|lintrk|linkedin|hs-scripts|ahrefs|spdt|Spotify|_linkedin')


def body_html(soup):
    body = soup.body
    for c in body.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()
    for s in body.find_all('script'):
        typ = s.get('type', '')
        in_block = s.find_parent(class_=CONTENT_BLOCK) is not None
        if typ == 'application/ld+json' or (typ == 'application/json' and in_block):
            continue
        if in_block and not ANALYTICS.search((s.get('src') or '') + (s.string or '')):
            continue  # content embeds (HubSpot forms, Elfsight) keep working
        s.decompose()
    for n in body.find_all('noscript'):
        if 'linkedin' in str(n):
            n.decompose()
    # Squarespace component loaders (their CSS is bundled in components.css; the JS is replaced by /js/site.js)
    for attr in ('data-block-scripts', 'data-block-css'):
        for el in body.find_all(attrs={attr: True}):
            del el[attr]
    for el in body.find_all(attrs={'data-config-video': True}):
        native_video(soup, el)
    for el in body.find_all(True):
        for attr in ('href',):
            if el.has_attr(attr):
                el[attr] = site_relative(el[attr])
        if el.has_attr('srcset'):
            el['srcset'] = rewrite_srcset(el['srcset'])
        for attr in ('src', 'data-src', 'data-image', 'href', 'poster', 'data-thumbnail'):
            if el.has_attr(attr) and isinstance(el[attr], str) and ASSET_URL.match(normalize(el[attr])):
                w = 2500 if attr == 'data-image' else None
                el[attr] = localize(el[attr], width=w) or el[attr]
        if el.has_attr('href') and el['href'].startswith('/s/'):
            with _lock:
                _s_files.add(el['href'].split('?')[0].split('#')[0])
    parts = [str(c) for c in body.contents if getattr(c, 'name', None) or str(c).strip()]
    return rewrite_text('\n'.join(parts))


_s_files = set()
_video_lock = threading.Lock()
VIDEO_MAX_BYTES = 24 * 1024 * 1024   # Cloudflare static assets: 25 MiB per file


def _fetch_hls(base, workdir):
    """Mirror an HLS stream (best video variant + audio) to local files; returns local master path.
    Fetched in Python (not ffmpeg) so requests go through the system HTTPS proxy."""
    os.makedirs(workdir, exist_ok=True)
    def get(u):
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120)
        return r.read()
    master = get(f'{base}/playlist.m3u8').decode()
    lines = master.splitlines()
    best, best_res, audio = None, -1, None
    for i, line in enumerate(lines):
        if line.startswith('#EXT-X-STREAM-INF'):
            m = re.search(r'RESOLUTION=(\d+)x(\d+)', line)
            res = int(m.group(1)) * int(m.group(2)) if m else 0
            if res > best_res:
                best_res, best = res, lines[i + 1].strip()
        if line.startswith('#EXT-X-MEDIA') and 'TYPE=AUDIO' in line:
            audio = re.search(r'URI="([^"]+)"', line).group(1)
    def mirror(url, name):
        pl = get(url).decode()
        out, files = [], {}
        def local(remote, ext):
            remote = urllib.parse.urljoin(url, remote)
            if remote not in files:
                fn = f'{name}-{len(files):05d}{ext}'
                p = os.path.join(workdir, fn)
                if not os.path.exists(p):
                    open(p, 'wb').write(get(remote))
                files[remote] = fn
            return files[remote]
        for line in pl.splitlines():
            if line and not line.startswith('#'):
                out.append(local(line.strip(), '.ts'))
            elif line.startswith(('#EXT-X-MAP', '#EXT-X-KEY')) and 'URI="' in line:
                uri = re.search(r'URI="([^"]+)"', line).group(1)
                out.append(line.replace(uri, local(uri, '.key' if 'KEY' in line else '.mp4')))
            else:
                out.append(line)
        open(os.path.join(workdir, name + '.m3u8'), 'w').write('\n'.join(out) + '\n')
        return name + '.m3u8'
    v = mirror(best, 'video')
    a = mirror(audio, 'audio') if audio else None
    return os.path.join(workdir, v), (os.path.join(workdir, a) if a else None)


def localize_video(base):
    """Download a Squarespace-hosted (HLS) video and convert it to a self-hosted 720p MP4."""
    import subprocess
    vid = base.rstrip('/').rsplit('/', 1)[-1]
    rel = f'/videos/{vid[:8]}.mp4'
    dest = os.path.join(PUBLIC, rel.lstrip('/'))
    cached = os.path.join(CACHE, f'video-{vid}.mp4')
    with _video_lock:
        if not os.path.exists(cached):
            vpl, apl = _fetch_hls(base, os.path.join(CACHE, 'hls-' + vid))
            inputs = ['-allowed_extensions', 'ALL', '-i', vpl]
            if apl:
                inputs += ['-allowed_extensions', 'ALL', '-i', apl]
            maps = ['-map', '0:v:0'] + (['-map', '1:a:0'] if apl else ['-map', '0:a?'])
            for crf in (24, 28, 32):
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, *maps,
                                '-vf', 'scale=-2:min(720\\,ih)', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf),
                                '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', cached + '.tmp.mp4'], check=True)
                if os.path.getsize(cached + '.tmp.mp4') <= VIDEO_MAX_BYTES:
                    break
            os.replace(cached + '.tmp.mp4', cached)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(cached, 'rb') as src, open(dest, 'wb') as out:
        out.write(src.read())
    poster = None
    data, ctype = download(f'{base}/thumbnail')
    if data:
        data, ext = optimize_image(data, '.jpg', 1500)
        poster = store(data, 'images', f'video-{vid[:8]}-poster', ext)
    return rel, poster


def native_video(soup, el):
    """Replace a Squarespace native-video player (rendered by their JS) with a plain <video>."""
    try:
        cfg = json.loads(el['data-config-video'])
        settings = json.loads(el.get('data-config-settings') or '{}')
    except ValueError:
        return
    base = (cfg.get('alexandriaUrl') or '').replace('/{variant}', '')
    if 'video.squarespace-cdn.com' not in base:
        return
    src, poster = localize_video(base)
    video = soup.new_tag('video', src=src, preload='metadata', playsinline='')
    video['style'] = 'width:100%;height:100%;display:block;object-fit:cover;'
    if poster:
        video['poster'] = poster
    if settings.get('autoPlay'):
        video['autoplay'] = ''
        video['muted'] = ''
    else:
        video['controls'] = ''
    if settings.get('loop'):
        video['loop'] = ''
    if settings.get('muted'):
        video['muted'] = ''
    player = el.find(class_='native-video-player') or el
    player.clear()
    player.append(video)
    for attr in ('data-config-video', 'data-config-settings', 'data-config-loading'):
        if el.has_attr(attr):
            del el[attr]


def fetch_s_files():
    """/s/<name> links redirect to Squarespace storage; host the files at the same URL."""
    for p in sorted(_s_files):
        data, _ = download(SITE + p)
        if data:
            dest = os.path.join(PUBLIC, urllib.parse.unquote(p).lstrip('/'))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest, 'wb').write(data)
        else:
            log('  broken /s/ link on live site:', p)


def process(entry):
    key, kind = entry['key'], entry['kind']
    src = os.path.join(SNAP, 'pages', key + ('.xml' if kind == 'rss' else '.html'))
    raw = open(src, encoding='utf8', errors='ignore').read()
    if kind == 'rss':
        xml = ASSET_URL.sub(lambda m: SITE + (localize(m.group(0)) or ''), raw)
        out = os.path.join(PUBLIC, '__q', key.split('/', 1)[1] + '.xml')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w').write(xml)
        return entry, None
    soup = BeautifulSoup(raw, 'lxml')
    meta = head_meta(soup, entry['path'])
    body = body_html(soup)
    out = os.path.join(PAGES_OUT, key)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out + '.html', 'w').write(body + '\n')
    json.dump(meta, open(out + '.json', 'w'), indent=1, ensure_ascii=False)
    return entry, soup


def main():
    import shutil
    for d in ('images', 'files', 's', 'videos', '__q', 'css/squarespace'):
        shutil.rmtree(os.path.join(PUBLIC, d), ignore_errors=True)
    shutil.rmtree(PAGES_OUT, ignore_errors=True)
    manifest = json.load(open(os.path.join(SNAP, 'manifest.json')))
    log(f'{len(manifest)} documents')
    with cf.ThreadPoolExecutor(8) as ex:
        results = list(ex.map(process, manifest))
    docs = [s for _, s in results if s is not None]
    fetch_s_files()
    css_files = collect_css(docs)
    faces = font_faces(docs[0])
    open(os.path.join(PUBLIC, 'css/squarespace/fonts.css'), 'w').write(faces)
    routes = {e['path']: '/' + e['key'] + ('.xml' if e['kind'] == 'rss' else '')
              for e in manifest if e['key'].startswith('__q/')}
    json.dump({'css': css_files, 'queryRoutes': routes}, open(os.path.join(ROOT, 'src/v1/site.json'), 'w'), indent=1)
    sm = open(os.path.join(SNAP, 'sitemap.xml')).read()
    sm = ASSET_URL.sub(lambda m: SITE + (localize(m.group(0)) or ''), sm)
    sm = re.sub(r'https://video\.squarespace-cdn\.com/content/v1/[^/]+/([0-9a-f]{8})[0-9a-f-]*/[^<\s]*',
                lambda m: f'{SITE}/videos/{m.group(1)}.mp4', sm)
    open(os.path.join(PUBLIC, 'sitemap.xml'), 'w').write(sm)
    os.makedirs(os.path.join(PUBLIC, 'images'), exist_ok=True)
    open(os.path.join(PUBLIC, 'images/_missing.svg'), 'w').write('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
    open(os.path.join(ROOT, 'scripts/migrate/missing-on-live-site.txt'), 'w').write(
        '# Assets referenced by overyondr.com that Squarespace itself returns 404 for (broken on the live site too).\n'
        + '\n'.join(sorted(_missing)) + '\n')
    log('pages:', len(docs), ' assets:', len(_name_owner), ' missing on live site:', len(_missing))


if __name__ == '__main__':
    main()
