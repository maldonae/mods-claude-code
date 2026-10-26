<img src="icon.png" alt="" width="128" height="128">

# pen

**pen** ajoute un bouton **Améliorer le prompt** au-dessus du champ de saisie. Un clic réécrit votre brouillon en prompt clair, structuré et actionnable, puis **remplace le texte du champ sans l'envoyer** : vous relisez, ajustez si besoin, puis validez avec Entrée.

```
pen › [ Améliorer le prompt ]
```

## Fonctionnement

- Le brouillon est réécrit par le modèle Sonnet de votre session (effort bas), en conservant exactement votre intention : rien n'est ajouté que vous n'ayez exprimé.
- Le prompt est structuré, seulement avec les rubriques pertinentes : objectif, contexte, contraintes, livrables attendus, étapes, critères de réussite. Une demande courte et claire reste courte.
- Une information manquante n'est jamais inventée : le prompt peut se terminer par une ligne « À préciser : … ».
- Noms, chemins, commandes, code, URLs et chiffres sont gardés tels quels, dans la langue du brouillon.
- Champ vide : un message discret demande d'écrire d'abord une demande, sans appel au modèle.
- Si vous tapez pendant la réécriture, votre texte n'est pas écrasé.

## Utilisation

| Action | Effet |
|---|---|
| `/pen` | Active ou désactive le bouton (actif par défaut ; le choix est gardé d'une session à l'autre) |
| Tab jusqu'au bouton, puis Entrée | Améliore le brouillon au clavier |

Le clic souris fonctionne sur le bouton. S'il ne réagit pas dans votre terminal, utilisez le clavier en secours.

## Installation

Aucune configuration ni clé d'API : pen utilise le modèle de votre session Claude Code. Dans une session Claude Code (terminal) :

```
/plugin marketplace add maldonae/mods-claude-code
/plugin install pen@maldonae-mods
```

Après l'installation, fermez la session Claude Code **et** VS Code, puis rouvrez-les ; si le mod n'apparaît toujours pas, redémarrez complètement le PC.

## Données et sécurité

- Le brouillon est envoyé au modèle comme **donnée encadrée** : la balise est neutralisée pour empêcher l'injection d'instructions, et le modèle ne fait que réécrire.
- pen ne fabrique jamais de prompt d'injection ; des garde-fous dans le code (pas seulement dans la consigne) :
  - **caractères invisibles** (zéro-largeur, bidi, tags Unicode) retirés avant l'envoi au modèle, et signalés ;
  - **brouillon contenant une consigne suspecte** (« ignore les instructions », « tu es maintenant… », `--dangerously-skip-permissions`…) : pas de réécriture, pour ne pas la rendre plus convaincante ;
  - **réécriture rejetée** si elle ajoute une URL, une adresse e-mail ou IP, un bloc encodé, une action sensible (`rm -rf`, `curl … | sh`, `.env`, clés SSH…) absente du brouillon, une formulation d'injection, ou si elle est anormalement longue. Ce que vous avez écrit vous-même reste permis.
- Au-delà de 12 000 caractères, le brouillon est refusé plutôt que tronqué.
- Rien n'est écrit sur disque ni envoyé ailleurs que vers le modèle de la session. Seul l'état activé/désactivé est mémorisé.
- Un appel au modèle par clic : cela consomme un peu de votre quota.

## Développement

```powershell
claude plugin test plugins/pen       # tests du harnais
claude plugin validate plugins/pen   # validation du manifeste et des hooks
node --test plugins/pen/tests/remark.eval.mts   # vrai modèle (6 appels, consomme du quota ; CLAUDE_BIN pour désigner l'exécutable claude)
```

## Licence

MIT, voir [LICENSE](LICENSE).
