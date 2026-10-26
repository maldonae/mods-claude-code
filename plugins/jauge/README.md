# jauge

**jauge** affiche au-dessus du champ de saisie l'usage de votre session, une ligne par mesure :

```
Contexte  ███████░░░░░░░░░░░░░  35%
5h        ████░░░░░░░░░░░░░░░░  21% · reset …
7j        ██░░░░░░░░░░░░░░░░░░  12% · reset …
Récent 42k tok/tour, session $0.85
```

## Fonctionnement

- **Contexte** : part de la fenêtre de contexte utilisée.
- **5h** et **7j** : fenêtres de limite d'usage de l'abonnement Claude, avec l'heure de remise à zéro. Masquées avec une clé d'API (pas de fenêtre à afficher).
- Tokens du dernier tour et coût cumulé de la session quand Claude Code les fournit.
- Barres vertes sous 40 %, orange jusqu'à 60 %, rouges au-delà ; relecture après chaque appel d'outil et chaque tour.
- Les bandes des autres mods (fil, cap…) restent affichées en dessous.

## Utilisation

| Commande | Effet |
|---|---|
| `/jauge` | Active ou désactive la jauge (active par défaut) |

## Installation

Aucune configuration ni clé d'API. Dans une session Claude Code (terminal) :

```
/plugin marketplace add maldonae/mods-claude-code
/plugin install jauge@maldonae-mods
```

Après l'installation, fermez la session Claude Code **et** VS Code, puis rouvrez-les ; si le mod n'apparaît toujours pas, redémarrez complètement le PC.

## Données et sécurité

- Lecture seule des chiffres d'usage que Claude Code fournit à la session ; aucun appel au modèle, aucun fichier écrit, aucun réseau, aucun processus lancé.

## Développement

```powershell
claude plugin test plugins/jauge
claude plugin validate plugins/jauge
node --test plugins/jauge/tests/format.node.mts
```

## Licence

MIT, voir [LICENSE](LICENSE).
