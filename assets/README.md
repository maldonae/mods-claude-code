# Visuels

Tous les visuels de ce dossier sont des **créations originales** d'Eric Maldonado, dessinées pour cette marketplace (formes simples en SVG, sans police, script ni ressource distante). Ils sont publiés sous la licence MIT du dépôt ([LICENSE](../LICENSE)). Aucune image tierce, aucun logo de marque, aucune attribution requise.

Famille commune : carré arrondi 512 × 512 (rayon 112), fond indigo nuit `#1E1B4B`, trait blanc de 32 px à extrémités arrondies, accent ambre `#FBBF24`. Les PNG 512 × 512 sont exportés depuis les SVG (rendu Chromium sans interface).

| Fichier | Usage | Symbole | Provenance |
|---|---|---|---|
| `marketplace/maldonae-mods-icon.svg` / `.png` | Icône de la marketplace, en tête du README | Grille de 4 tuiles, une en ambre | Création originale |
| `plugins/cap/cap-icon.svg` / `.png` | Icône de cap | Flèche de cap et 3 points (les 3 suggestions) | Création originale, reprend le symbole de la première icône de cap |
| `plugins/fil/fil-icon.svg` / `.png` | Icône de fil | 3 barres de progression | Création originale |
| `plugins/jauge/jauge-icon.svg` / `.png` | Icône de jauge | Cadran et aiguille | Création originale |
| `plugins/pen/pen-icon.svg` / `.png` | Icône de pen | Crayon et étincelles | Création originale, reprend le symbole de la première icône de pen |
| `plugins/relay/relay-icon.svg` / `.png` | Icône de relay | Fiche et flèche de passage | Création originale |

Chaque plugin embarque aussi une copie de son PNG (par exemple `plugins/pen/icon.png`), désignée par le champ `icon` de son `plugin.json`. D'après la documentation de Claude Code, ce champ sert à la fiche du plugin dans l'annuaire d'Anthropic et n'est pas lu par Claude Code : l'icône n'apparaît pas dans l'interface `/plugin`.

## Mettre à jour une icône

1. Modifier le SVG (garder palette, épaisseur de trait et marges).
2. Réexporter le PNG 512 × 512, par exemple pour pen, depuis la racine du dépôt :
   `chrome --headless=new --default-background-color=00000000 --window-size=512,512 --screenshot=assets/plugins/pen/pen-icon.png "file:///$PWD/assets/plugins/pen/pen-icon.svg"`
3. Copier ce PNG dans `plugins/pen/icon.png`, puis augmenter la `version` du `plugin.json` de pen.
