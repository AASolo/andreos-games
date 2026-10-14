#!/usr/bin/env python3
"""Скачивает шрифты Google Fonts, которые подключают игры, и кладёт их рядом с игрой,
чтобы надписи выглядели так же и без интернета.

Использование: localize_fonts.py <папка игры> [<папка игры> ...]
"""
import html
import os
import re
import sys
import urllib.request

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36"
KEEP = {"latin", "latin-ext", "cyrillic", "cyrillic-ext"}  # русские и английские буквы
LINK = re.compile(r'<link[^>]*href="(https://fonts\.googleapis\.com/css2?\?[^"]+)"[^>]*>')
PRECONNECT = re.compile(r'<link[^>]*rel="preconnect"[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*'
                        r'|<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*rel="preconnect"[^>]*>\s*')


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def localize(game_dir):
    index = os.path.join(game_dir, "index.html")
    page = open(index, encoding="utf-8").read()
    links = LINK.findall(page)
    if not links:
        return
    fonts_dir = os.path.join(game_dir, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    css_out = []
    for href in links:
        css = get(html.unescape(href)).decode("utf-8")
        # Блоки вида /* cyrillic */ @font-face { ... }
        for subset, block in re.findall(r"/\* ([\w-]+) \*/\s*(@font-face\s*\{[^}]*\})", css):
            if subset not in KEEP:
                continue
            url = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", block).group(1)
            name = url.split("/s/", 1)[1].replace("/", "-")
            path = os.path.join(fonts_dir, name)
            if not os.path.exists(path):
                open(path, "wb").write(get(url))
            css_out.append(f"/* {subset} */\n" + block.replace(url, name))
    open(os.path.join(fonts_dir, "fonts.css"), "w", encoding="utf-8").write("\n".join(css_out) + "\n")
    page = PRECONNECT.sub("", page)
    first = True

    def repl(_m):
        nonlocal first
        out = '<link rel="stylesheet" href="fonts/fonts.css">' if first else ""
        first = False
        return out

    page = LINK.sub(repl, page)
    open(index, "w", encoding="utf-8").write(page)
    print(f"  шрифты: {os.path.basename(game_dir)} ({len(css_out)} файлов)")


if __name__ == "__main__":
    for d in sys.argv[1:]:
        localize(d)
