<img src="icon.png" alt="" width="128" height="128">

# refactor

Mod Claude Code de **refactorisation guidée** : Claude analyse un fichier ou un dossier, propose un plan progressif classé par priorité, attend votre validation, puis applique les changements **une étape à la fois**, tests à l'appui.

## Utilisation

```
/refactor src/services/auth.ts
/refactor src/components
/refactor src/utils/date.ts réduire la complexité et améliorer la testabilité
/refactor src/services --plan-only
```

1. **Analyse** (lecture seule) : fonctions trop longues ou complexes, duplication, responsabilités mélangées, noms peu clairs, code mort, dépendances inutiles, manque de testabilité, risques de régression.
2. **Plan** : étapes petites, isolées et vérifiables, avec fichiers concernés, risque (faible, moyen, élevé) et tests à lancer après chaque étape. Claude le remonte au mod par l'outil `mcp__refactor__plan`.
3. **Validation** : bouton **Valider le plan** au-dessus du prompt, ou `/refactor go`. Rien n'est modifié avant.
4. **Application** : une étape à la fois. Claude montre le diff, lance les tests et rend compte par l'outil `mcp__refactor__step`. Si les tests échouent, l'étape est corrigée ou annulée et le refactor se met **en pause** (`/refactor go` pour reprendre, `/refactor stop` pour arrêter).
5. **Résumé** : étapes réalisées, fichiers modifiés, tests exécutés, risques restants, recommandations de revue.

Avec `--plan-only`, rien n'est modifié : analyse, plan, tests à créer ou à lancer, puis « Plan généré. Lance /refactor <chemin> sans --plan-only pour appliquer les changements. »

Si aucun test n'est détecté, Claude vous prévient et propose d'abord des tests de caractérisation.

## Knip

Si le projet a un `package.json`, le mod regarde si [Knip](https://knip.dev) est installé (dépendance ou `node_modules/.bin/knip`).

- **Installé** : pendant l'analyse, Claude lance `npx knip` (lecture seule) et intègre au plan les fichiers, exports et dépendances inutilisés, et les dépendances manquantes ou fantômes.
- **Absent** : Claude propose `npm install -D knip` puis `npx knip init`, **sans les exécuter** (le mod les bloque).

Chaque résultat est classé par risque :

| Risque | Cas |
| --- | --- |
| faible | export ou dépendance clairement inutilisé |
| moyen | usage dynamique, entry point ou import indirect possible |
| élevé | utilisé par un framework, un test, une configuration, un script ou un import dynamique |

Un résultat dont la raison évoque un framework, une configuration, un test, un script, un entry point ou un import dynamique est **forcé en risque élevé**. Le mod refuse un plan qui propose de supprimer un fichier à risque élevé : ce fichier reste listé « à analyser ».

Après validation du plan, les nettoyages Knip s'appliquent par petites étapes, dans cet ordre : **exports inutilisés**, puis **dépendances inutilisées**, puis **fichiers morts**. **Chaque nettoyage attend sa propre confirmation** (bouton **Confirmer** ou `/refactor go`, **Passer** ou `/refactor passer` pour le sauter). Une fois confirmé, seule la commande qui nomme exactement les fichiers (`git rm`, `rm`) ou les paquets (`npm uninstall`…) de l'étape passe. Les tests sont relancés après chaque étape.

`npx knip --fix` et `--allow-remove-files` sont **toujours refusés**, pendant un refactor comme en dehors : lancez-les vous-même si vous le voulez. En mode `--plan-only`, Knip ne sert qu'au rapport et au plan.

## Affichage

- **Bande au-dessus du prompt** : mode (Analyse / Application), étape en cours (« Refactor 2/6 — Extraction de la validation JWT »), risque en couleur (vert, orange, rouge), état des tests (OK, échec, non exécutés). Pour un nettoyage Knip : « Confirmation requise » avec ce qui sera supprimé.
- **Panneau** : les étapes du plan, leur statut (en attente, en cours, terminée, échec, annulée, passée), leur risque, leurs fichiers et les résultats Knip associés, plus les résultats Knip non traités « à analyser ». Bouton **Plan** dans la bande pour le rouvrir.

## Commandes

| Commande | Effet |
| --- | --- |
| `/refactor <chemin> [objectif] [--plan-only]` | lance l'analyse et le plan |
| `/refactor go` | valide le plan, confirme un nettoyage Knip, ou reprend après une pause |
| `/refactor passer` | saute le nettoyage Knip en attente (rien n'est supprimé) |
| `/refactor stop` | arrête le refactor (les étapes déjà faites restent) |
| `/refactor statut` | où en est le refactor |

## Sécurité

Pendant un refactor (de l'analyse jusqu'à la fin), le mod contrôle chaque écriture, quel que soit le mode de permission :

- **aucune écriture** (Edit, Write, NotebookEdit) avant la validation du plan, ni en mode `--plan-only`, ni pendant une pause ;
- après validation, écritures limitées aux fichiers de l'étape en cours et à la cible ;
- jamais de modification de `.env`, `*.key`, `*.pem`, `*.p12`, `*.pfx`, ni d'un fichier qui contient un secret reconnaissable, ni d'écriture d'un secret ;
- refusés par le shell : `git commit`, `git push`, `git reset --hard`, `git clean/rm/restore/stash`, suppressions de fichiers (`rm`, `del`, `Remove-Item`…), et toute écriture hors Edit/Write (`sed -i`, redirections `>`, `mv`, `cp`, installations de dépendances…). Lecture et tests restent autorisés.

Le filtrage des commandes shell est une liste de motifs : il couvre les cas courants, pas toutes les façons d'écrire un fichier. Relisez toujours le diff avant de committer vous-même.

## Installation

Aucune configuration ni clé d'API : refactor s'appuie sur le modèle de votre session Claude Code. Knip est facultatif. Dans une session Claude Code (terminal) :

```
/plugin marketplace add maldonae/mods-claude-code
/plugin install refactor@maldonae-mods
```

Depuis un shell : `claude plugin install refactor@maldonae-mods`.

Après l'installation, fermez la session Claude Code **et** VS Code, puis rouvrez-les ; si le mod n'apparaît toujours pas, redémarrez complètement le PC.

## Licence

MIT, voir [LICENSE](LICENSE).
