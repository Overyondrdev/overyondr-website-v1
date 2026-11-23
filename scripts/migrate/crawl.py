#!/usr/bin/env python3
"""Snapshot the live Squarespace site (www.overyondr.com) for migration.

Writes raw HTML/XML into SNAPSHOT_DIR (default .migrate/snapshot, git-ignored):
  pages/<key>.html   one file per URL
  manifest.json      [{url, path, key, kind}]
Run:  python3 scripts/migrate/crawl.py [SNAPSHOT_DIR]
"""
import json, os, re, sys, time, urllib.error, urllib.request

SITE = 'https://www.overyondr.com'
UA = {'User-Agent': 'Mozilla/5.0 (overyondr site migration)'}
OUT = sys.argv[1] if len(sys.argv) > 1 else '.migrate/snapshot'
QUERY_PAGE = re.compile(r'href="((?:https://www\.overyondr\.com)?/(?:blog|blog-sandbox)(?:\?(?:author|offset|format|category|tag)=[^"#]*|/(?:tag|category)/[^"#?]*))"')


def key_for(path):
    if path == '/':
        return 'index'
    if '?' in path or '/tag/' in path or '/category/' in path:
        return '__q/' + re.sub(r'[^A-Za-z0-9._-]+', '_', path.strip('/'))
    return path.strip('/')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def fetch(path, follow=True):
    req = urllib.request.Request(SITE + path, headers=UA)
    try:
        r = (urllib.request.urlopen if follow else _opener.open)(req, timeout=40)
        return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.headers.get('Location', '') if 300 <= e.code < 400 else e.read())


def search_api_paths():
    """Pages hidden from the sitemap still show up in Squarespace's site search."""
    found = set()
    states = ('alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois '
              'indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri '
              'montana nebraska nevada hampshire jersey mexico york carolina dakota ohio oklahoma oregon pennsylvania rhode '
              'tennessee texas utah vermont virginia washington wisconsin wyoming').split()
    terms = states + ['the', 'a', 'e', 'o', 'i', 'phone', 'phone-free', 'yondr', 'school', 'schools', 'policy', 'state', 'law',
                      'legislation', 'event', 'gallery', 'resources', 'contact', 'uk', 'ireland', 'report', 'study', 'guide']
    for q in terms:
        for page in range(20):
            st, body = fetch(f'/api/search/GeneralSearch?q={q}&p={page}')
            try:
                items = json.loads(body).get('items', []) if st == 200 else []
            except ValueError:
                items = []
            for it in items:
                u = it.get('itemUrl') or it.get('fullUrl')
                if u and u.startswith('/'):
                    found.add(u)
            if len(items) < 20:
                break
            time.sleep(0.2)
    return found


INTERNAL_LINK = re.compile(r'href="(?:https?://(?:www\.)?overyondr\.com)?(/[A-Za-z0-9][^"#?]*)"')
SKIP = re.compile(r'^/(s|static|universal|api|cart|account|commerce|config|search)(/|$)|\.[a-z0-9]{2,5}$', re.I)


def main():
    os.makedirs(f'{OUT}/pages', exist_ok=True)
    _, sm = fetch('/sitemap.xml')
    open(f'{OUT}/sitemap.xml', 'wb').write(sm)
    _, rb = fetch('/robots.txt')
    open(f'{OUT}/robots.txt', 'wb').write(rb)
    paths = ['/'] + [re.sub(r'^https://www\.overyondr\.com', '', u) for u in re.findall(r'<loc>([^<]+)</loc>', sm.decode())]
    paths += sorted(search_api_paths())
    paths += ['/blog?format=rss', '/blog-sandbox?format=rss']
    manifest, seen, queue = [], set(), list(dict.fromkeys(paths))
    redirects = {}
    while queue:
        path = queue.pop(0)
        if path in seen:
            continue
        seen.add(path)
        status, body = fetch(path, follow=False)
        if 300 <= status < 400:
            redirects[path] = (status, body)
            continue
        if status != 200:
            print('skip', status, path)
            continue
        key = key_for(path)
        kind = 'rss' if 'format=rss' in path else 'html'
        fn = f'{OUT}/pages/{key}.{"xml" if kind == "rss" else "html"}'
        os.makedirs(os.path.dirname(fn), exist_ok=True)
        open(fn, 'wb').write(body)
        manifest.append({'url': SITE + path, 'path': path, 'key': key, 'kind': kind})
        if kind == 'html':
            for m in QUERY_PAGE.findall(body.decode('utf8', 'ignore')):
                p = re.sub(r'^https://www\.overyondr\.com', '', m).replace('&amp;', '&')
                if p not in seen:
                    queue.append(p)
            for m in INTERNAL_LINK.findall(body.decode('utf8', 'ignore')):
                p = m.rstrip('/') or '/'
                if not SKIP.search(p) and p not in seen and p not in queue:
                    queue.append(p)
        time.sleep(0.3)
    status, body = fetch('/this-page-does-not-exist-404-check')
    open(f'{OUT}/pages/404.html', 'wb').write(body)
    manifest.append({'url': None, 'path': None, 'key': '404', 'kind': 'html'})
    json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=1)
    json.dump(redirects, open(f'{OUT}/redirects.json', 'w'), indent=1)
    print('redirects on live site:', redirects)
    print(len(manifest), 'documents saved to', OUT)


if __name__ == '__main__':
    main()
