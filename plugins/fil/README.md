<img src="icon.png" alt="" width="128" height="128">

# fil

**fil** affiche des barres de progression au-dessus du champ de saisie : une pour le tour en cours, une par sous-agent, avec le temps écoulé et l'étape courante (outil appelé, fichier lu…).

## Fonctionnement

- Une barre démarre à l'envoi d'un prompt et une par sous-agent lancé ; jusqu'à 6 barres affichées, les tâches terminées restent visibles quelques secondes.
- Quand la bande au-dessus du prompt n'est pas dessinée, le résumé passe dans la ligne d'état.
- Un panneau **fil** s'ouvre à côté de la conversation si le terminal est assez large (`/fil pane` pour le demander).
- Les sessions ouvertes en parallèle partagent leur progression (stockage local du mod, effacé à la fin de chaque session).
- Fin d'une tâche longue : un court signal sonore (`powershell [console]::beep` sous Windows, `afplay` sous macOS, `paplay` sous Linux).

## Utilisation

| Commande | Effet |
|---|---|
| `/fil` | Active ou désactive les barres (actif par défaut ; le choix est gardé d'une session à l'autre) |
| `/fil on` / `/fil off` | Force l'état |
| `/fil pane` | Ouvre le panneau fil |
| `/fil status` | Affiche l'état et les compteurs d'événements |

## Installation

Aucune configuration ni clé d'API. Dans une session Claude Code (terminal) :

```
/plugin marketplace add maldonae/mods-claude-code
/plugin install fil@maldonae-mods
```

Après l'installation, fermez la session Claude Code **et** VS Code, puis rouvrez-les ; si le mod n'apparaît toujours pas, redémarrez complètement le PC.

## Données et sécurité

- Aucun appel au modèle, aucun réseau. Seuls l'état activé/désactivé et la progression des sessions en cours sont gardés dans le stockage local du mod.
- Le seul processus lancé est le signal sonore ci-dessus, sans argument venant de la conversation.

## Développement

```powershell
claude plugin test plugins/fil
claude plugin validate plugins/fil
node --test plugins/fil/tests/progress.node.mts
```

## Licence

MIT, voir [LICENSE](LICENSE).
