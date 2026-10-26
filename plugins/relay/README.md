# relay

Mod Claude Code qui aide à **passer le relais** avant que le contexte sature : Claude rédige une fiche de reprise en markdown dans le dossier courant, et le mod génère un prompt concis à coller dans une nouvelle session.

## Utilisation

- Un bouton **Passer le relais** s'affiche au-dessus du prompt, à côté de la jauge.
- Quand le contexte atteint le seuil (50 % par défaut), la bande le signale et propose le relais ; **Plus tard** masque la proposition.
- Chaque relais demande une confirmation (**Confirmer** / **Annuler**).
- La fiche est écrite dans `.claude/relay/relay-YYYY-MM-DD-HHMM.md`, avec les sections : objectif global, contraintes permanentes, ce qui est déjà fait, état actuel, décisions importantes, prochaines étapes, blocages éventuels, prompt de reprise.
- Le prompt de reprise est copié dans le presse-papier et affiché dans le transcript.

## Commandes

| Commande | Effet |
| --- | --- |
| `/relay` | active ou désactive le mod |
| `/relay seuil 60` | règle le seuil (10–95 %), gardé d'une session à l'autre |
| `/relay maintenant` | passe le relais tout de suite (avec confirmation) |
| `/relay statut` | affiche l'état |

## Sécurité

- Aucun fichier existant n'est écrasé : si le nom est pris, le mod écrit `…-2.md`, `…-3.md`, etc.
- La fiche est rédigée sans outils, sur une copie de la conversation (`$.model.fork`). Claude a pour consigne de masquer les secrets, mais relisez quand même la fiche avant de la partager.
- Garde-fous dans le code : les secrets reconnaissables (`sk-…`, `ghp_…`, `AKIA…`, clés Stripe, Slack, JWT, clés privées) sont remplacés par `[masqué]` avant l'écriture, et les caractères invisibles retirés.
- Si la fiche contient une formulation d'injection (« ignore les instructions »…), elle est écrite pour relecture mais son prompt de reprise **n'est ni copié ni proposé** : une nouvelle session ne doit pas la recevoir sans que vous l'ayez relue.
- Pensez à ajouter `.claude/relay/` à votre `.gitignore` si les fiches ne doivent pas être versionnées.

## Installation

Aucune configuration ni clé d'API : relay utilise le modèle de votre session Claude Code. Dans une session Claude Code (terminal) :

```
/plugin marketplace add maldonae/mods-claude-code
/plugin install relay@maldonae-mods
```

Après l'installation, fermez la session Claude Code **et** VS Code, puis rouvrez-les ; si le mod n'apparaît toujours pas, redémarrez complètement le PC.

## Licence

MIT, voir [LICENSE](LICENSE).
