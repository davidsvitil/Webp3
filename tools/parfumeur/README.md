# Aktualizace dat
```bash
python3 tools/parfumeur/fetch_pages.py urls.txt raw/pages
python3 tools/parfumeur/parse_shop.py shoptet raw/pages raw/parsed.json
python3 tools/parfumeur/build_catalog.py raw/parsed.json parfumeur tools/parfumeur/config.json
python3 tools/parfumeur/make_hero.py parfumeur <id produktu> ...
```
Potřeba: Python 3, Pillow, BeautifulSoup4, lxml, curl.
