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


def fetch(path):
    req = urllib.request.Request(SITE + path, headers=UA)
    try:
        r = urllib.request.urlopen(req, timeout=40)
        return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    os.makedirs(f'{OUT}/pages', exist_ok=True)
    _, sm = fetch('/sitemap.xml')
    open(f'{OUT}/sitemap.xml', 'wb').write(sm)
    _, rb = fetch('/robots.txt')
    open(f'{OUT}/robots.txt', 'wb').write(rb)
    paths = ['/'] + [re.sub(r'^https://www\.overyondr\.com', '', u) for u in re.findall(r'<loc>([^<]+)</loc>', sm.decode())]
    paths += ['/blog?format=rss', '/blog-sandbox?format=rss']
    manifest, seen, queue = [], set(), list(dict.fromkeys(paths))
    while queue:
        path = queue.pop(0)
        if path in seen:
            continue
        seen.add(path)
        status, body = fetch(path)
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
        time.sleep(0.3)
    status, body = fetch('/this-page-does-not-exist-404-check')
    open(f'{OUT}/pages/404.html', 'wb').write(body)
    manifest.append({'url': None, 'path': None, 'key': '404', 'kind': 'html'})
    json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=1)
    print(len(manifest), 'documents saved to', OUT)


if __name__ == '__main__':
    main()
