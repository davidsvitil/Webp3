# Parfumeur – koncept nového e-shopu

Statický frontend (HTML + CSS + vanilla JS, bez buildu) pro parfemy-parfumeur.cz, vizuálně inspirovaný patike.ch – stejný designový jazyk jako předchozí koncepty (tmavý rám, zaoblené plochy, plovoucí pill menu, obří „ghost“ nápisy, carousel s flakony, pozadí se přebarvuje podle vůně).

**Jde o neoficiální návrh** – stránka má trvalý pruh „KONCEPT“, vodoznak a `noindex`.

## Co umí
- **Katalog** – 647 produktů: dámské, pánské a unisex parfémy podle značek, parfémy podle značek (Xerjoff, Fragonard, Almah…), kosmetika a interiérové vůně. Velké podkategorie omezené na 60 produktů.

## Spuštění lokálně
```bash
cd parfumeur && python3 -m http.server 8000
```

## Nasazení
Settings → Pages → Source: **GitHub Actions**, pak Actions → Run workflow. Kořenový `index.html` přesměruje do `parfumeur/`.

## Co ještě chybí do ostrého provozu
- Platby, sklad a objednávky v reálném čase – ceny jsou snímek z 20. 11. 2026, objednávka zatím odchází e-mailem (mailto).
