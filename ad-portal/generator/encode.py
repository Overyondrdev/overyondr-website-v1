"""Encode rendered ad frames: JPEG stills and looping GIF motion ads, each under the 150 KB ad-network limit.

Called by render.mjs:  python3 encode.py <jobs.json> <out dir>
Writes <out>/still/*.jpg, <out>/motion/*.gif and <out>/manifest.json (merged when only some ads were re-rendered).
"""
import io
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

from PIL import Image, ImageFilter

LIMIT = 150_000          # bytes; ad networks cap display ads at 150 KB
TARGET = 145_000         # leave a margin
LOOPS = 1                # GIF repeats once: plays twice (2 x 13.5 s = 27 s, under the 30 s cap), stops on the end card

jobs_file, out = sys.argv[1], sys.argv[2]
spec = json.load(open(jobs_file))
c, jobs = spec['campaign'], spec['jobs']
os.makedirs(os.path.join(out, 'still'), exist_ok=True)
os.makedirs(os.path.join(out, 'motion'), exist_ok=True)


def sharp(png, w, h, percent=70):
    """Frames are rendered at 2x: downsample with Lanczos, then a light unsharp mask, for crisp photos at 1x.
    Motion uses a lighter sharpen (sharpening adds detail, and GIF bytes, to every frame)."""
    im = Image.open(png).convert('RGB')
    if im.size != (w, h):
        im = im.resize((w, h), Image.LANCZOS, reducing_gap=3.0).filter(ImageFilter.UnsharpMask(radius=0.7, percent=percent, threshold=2))
    return im


def jpeg(png, dest, w, h):
    im = sharp(png, w, h)
    for q in range(95, 40, -3):
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=q, subsampling=0 if q >= 70 else 2, optimize=True)
        if buf.tell() <= TARGET:
            break
    open(dest, 'wb').write(buf.getvalue())
    return {'bytes': buf.tell(), 'quality': q}


def gif(frames, fps, dest, w, h):
    # Merge runs of identical frames into one frame with a longer delay.
    step = 1 / fps
    uniq = []
    prev = None
    for f in frames:
        im = sharp(f, w, h, percent=45)
        data = im.tobytes()
        if data == prev:
            uniq[-1][1] += step
        else:
            out1x = f[:-4] + '.1x.png'
            im.save(out1x)
            uniq.append([out1x, step])
            prev = data
    uniq[-1][1] += 0  # the last frame holds until the loop restarts
    with tempfile.TemporaryDirectory() as tmp:
        lst = os.path.join(tmp, 'list.txt')
        with open(lst, 'w') as fh:
            for f, d in uniq:
                fh.write(f"file '{f}'\nduration {d:.3f}\n")
            fh.write(f"file '{uniq[-1][0]}'\n")  # concat demuxer needs the last file repeated
        ladders = [(256, 'sierra2_4a'), (224, 'sierra2_4a'), (192, 'sierra2_4a'), (160, 'sierra2_4a'), (128, 'sierra2_4a'), (96, 'bayer:bayer_scale=3')]
        for colors, dither in ladders:
            vf = (f"split[a][b];[a]palettegen=max_colors={colors}:stats_mode=full:reserve_transparent=0[p];"
                  f"[b][p]paletteuse=dither={dither}:diff_mode=rectangle")
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-filter_complex', vf,
                            '-fps_mode', 'passthrough', '-loop', str(LOOPS), dest], check=True)
            n = os.path.getsize(dest)
            if n <= TARGET:
                break
    return {'bytes': n, 'colors': colors, 'frames': len(uniq), 'duration': round(len(frames) / fps, 2)}


manifest_path = os.path.join(out, 'manifest.json')
old = json.load(open(manifest_path)) if spec.get('partial') and os.path.exists(manifest_path) else {'creatives': []}
creatives = {x['id']: x for x in old['creatives']}
heads = {h['id']: h for h in c['headlines']}
sizes = {s['id']: s for s in c['sizes']}
concepts = {x['id']: x for x in c['concepts']}

over = []
for j in jobs:
    s, h = sizes[j['size']], heads[j['headline']]
    if j['kind'] == 'still':
        rel = f"still/{j['name']}.jpg"
        info = jpeg(j['png'], os.path.join(out, rel), s['w'], s['h'])
        fmt = 'JPEG'
    else:
        rel = f"motion/{j['name']}.gif"
        info = gif(j['frames'], j['fps'], os.path.join(out, rel), s['w'], s['h'])
        fmt = 'GIF'
    if info['bytes'] > LIMIT:
        over.append(f"{rel} is {info['bytes']} bytes, over the {LIMIT} byte limit")
    creatives[j['name']] = {
        'id': j['name'], 'file': rel, 'format': fmt, 'kind': j['kind'],
        'size': s['id'], 'sizeName': s['name'], 'w': s['w'], 'h': s['h'],
        'headline': h['id'], 'headlineText': h['text'], 'desc': h['desc'],
        'concept': j['view'], 'conceptName': concepts[j['view']]['name'], **info,
    }
    print(f"  {rel:58s} {info['bytes'] / 1000:6.1f} KB  " + ' '.join(f'{k}={v}' for k, v in info.items() if k != 'bytes'))

# Source images (pouch cut-out and photos) so the team can make other formats.
sources = []
os.makedirs(os.path.join(out, 'source'), exist_ok=True)
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))  # website repo root (photos come from v2/)
for key, src in [('pouch', c['pouch'])] + list(c['photos'].items()):
    im = Image.open(os.path.join(repo, src['src']))
    im.thumbnail((2000, 2000))
    if key == 'pouch':
        rel = 'source/yondr-pouch.png'
        im.save(os.path.join(out, rel), optimize=True)
    else:
        rel = f'source/yondr-pouch-in-use-{key}.jpg'
        im.convert('RGB').save(os.path.join(out, rel), quality=84, optimize=True, progressive=True)
    sources.append({'file': rel, 'name': 'Pouch (cut-out PNG)' if key == 'pouch' else f'Photo: {key}', 'alt': src['alt']})

order = {k: i for i, k in enumerate(list(sizes) + list(heads) + list(concepts))}
items = sorted(creatives.values(), key=lambda x: (order[x['headline']], order[x['concept']], order[x['size']]))
manifest = {
    'id': c['id'], 'name': c['name'], 'summary': c['summary'], 'launched': c['launched'],
    'studyUrl': c['studyUrl'], 'releaseUrl': c.get('releaseUrl'), 'cta': c['cta'], 'source': c['source'],
    'longHeadline': c['longHeadline'], 'headlines': c['headlines'], 'sizes': c['sizes'], 'concepts': c['concepts'],
    'limitBytes': LIMIT, 'generated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'sources': sources,
    'creatives': items,
}
json.dump(manifest, open(manifest_path, 'w'), indent=1, ensure_ascii=False)
print(f"{len(items)} creatives in {manifest_path}; largest {max(x['bytes'] for x in items) / 1000:.1f} KB")
if over:
    sys.exit('\n'.join(over))
