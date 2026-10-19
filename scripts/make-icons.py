#!/usr/bin/env python3
"""Generates the PWA icons and iOS splash screens into public/ (needs Pillow). Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw, ImageFont
import os
G1, G2, AMB, PAPER, INK = (74, 27, 42), (54, 184, 188), (232, 180, 84), (74, 27, 42), (251, 242, 238)
def font(sz, bold=True, italic=False):
    base = '/usr/share/fonts/truetype/liberation/LiberationSerif-' + ('BoldItalic' if bold and italic else 'Bold' if bold else 'Italic' if italic else 'Regular') + '.ttf'
    return ImageFont.truetype(base, sz) if os.path.exists(base) else ImageFont.load_default()
def mark(draw_img, cx, cy, r, ss=4):
    """Two overlapping circles (the two learners) with a bright lens where they meet."""
    w, h = draw_img.size; L = Image.new('RGBA', (w * ss, h * ss), (0, 0, 0, 0)); d = ImageDraw.Draw(L); R = r * ss; off = int(R * 0.62)
    a = Image.new('L', L.size, 0); b = Image.new('L', L.size, 0); da, db = ImageDraw.Draw(a), ImageDraw.Draw(b)
    da.ellipse([cx * ss - off - R, cy * ss - R, cx * ss - off + R, cy * ss + R], fill=255); db.ellipse([cx * ss + off - R, cy * ss - R, cx * ss + off + R, cy * ss + R], fill=255)
    L.paste(Image.new('RGBA', L.size, G2 + (255,)), mask=a); L.paste(Image.new('RGBA', L.size, AMB + (255,)), mask=b)
    inter = Image.new('L', L.size, 0); inter.paste(a, mask=b); L.paste(Image.new('RGBA', L.size, (255, 255, 255, 235)), mask=inter)
    L = L.resize((w, h), Image.LANCZOS); draw_img.alpha_composite(L)
def icon(size, maskable=False, rounded=True):
    im = Image.new('RGBA', (size, size), G1 + (255,))
    if rounded and not maskable:
        m = Image.new('L', (size, size), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255); bg = Image.new('RGBA', (size, size), (0, 0, 0, 0)); bg.paste(im, mask=m); im = bg
    r = size * (0.17 if maskable else 0.2); mark(im, size / 2, size / 2, r); return im
for s in (48, 72, 96, 144, 192, 256, 384, 512): icon(s).save(f'public/icons/icon-{s}.png')
icon(512, maskable=True).save('public/icons/maskable-512.png'); icon(192, maskable=True).save('public/icons/maskable-192.png'); icon(180, rounded=False).convert('RGB').save('public/icons/apple-touch-icon.png'); icon(32).save('public/icons/favicon-32.png')
def splash(w, h, dark=False):
    bg = G1 if dark else PAPER; fg = INK; im = Image.new('RGBA', (w, h), bg + (255,)); u = min(w, h)
    mark(im, w / 2, h * 0.42, u * 0.11); d = ImageDraw.Draw(im); t = 'German Duo'; f = font(int(u * 0.085)); tw = d.textlength(t, font=f); d.text(((w - tw) / 2, h * 0.42 + u * 0.19), t, font=f, fill=fg)
    t2 = 'Zusammen lernen'; f2 = font(int(u * 0.04), bold=False, italic=True); tw2 = d.textlength(t2, font=f2); d.text(((w - tw2) / 2, h * 0.42 + u * 0.31), t2, font=f2, fill=(230, 203, 210))
    return im.convert('RGB')
SIZES = [(1290, 2796, 430, 932, 3), (1179, 2556, 393, 852, 3), (1284, 2778, 428, 926, 3), (1170, 2532, 390, 844, 3), (1125, 2436, 375, 812, 3), (1242, 2688, 414, 896, 3), (828, 1792, 414, 896, 2), (750, 1334, 375, 667, 2), (1242, 2208, 414, 736, 3), (1668, 2388, 834, 1194, 2), (2048, 2732, 1024, 1366, 2), (1536, 2048, 768, 1024, 2)]
links = []
for pw, ph, dw, dh, r in SIZES:
    name = f'splash-{pw}x{ph}.png'; splash(pw, ph).save('public/splash/' + name, optimize=True)
    links.append(f'    <link rel="apple-touch-startup-image" href="/splash/{name}" media="(device-width: {dw}px) and (device-height: {dh}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)" />')
splash(1200, 1200).save('public/splash/splash-square.png', optimize=True)
open('scripts/splash-links.html', 'w').write('\n'.join(links) + '\n'); print('ok', len(SIZES), 'splash screens')
