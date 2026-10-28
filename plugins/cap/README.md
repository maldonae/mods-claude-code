<img src="icon.png" alt="" width="128" height="128">

# cap

Après chaque réponse de Claude, **cap** propose 3 actions suivantes sous forme de boutons, au-dessus du champ de saisie. Choisir un bouton **remplit le champ sans l'envoyer** : vous relisez, modifiez si besoin, puis validez avec Entrée.

```
cap › [ Lancer les tests ] [ Documenter le mod ] [ ⚠ Nettoyer le dépôt ] ×
```

## Fonctionnement

- À la fin de chaque tour principal, cap demande à un petit modèle (Haiku, effort bas) 3 actions utiles, à partir de votre demande et de la fin de la réponse.
- Si la réponse se termine par une question, les 3 boutons proposent plutôt des réponses possibles.
- Si le champ contient déjà un brouillon, la suggestion s'ajoute à la ligne suivante au lieu de l'écraser.
- Une action destructrice ou sensible (`rm -rf`, `git push --force`, `reset --hard`, `DROP TABLE`, lecture d'un `.env` ou d'une clé, `curl … | sh`…) déjà présente dans la conversation est **marquée ⚠**, jamais exécutée.
- **Garde-fous anti-injection** : une suggestion est écartée si elle ressemble à une injection (« ignore les instructions »…) ou si elle apporte une URL, une adresse, un bloc encodé ou une action sensible absents de la conversation (cas d'une page web ou d'une sortie d'outil piégée). Les caractères invisibles sont retirés, à l'aller comme au retour.
- Les tours interrompus, les sous-agents et les réponses illisibles du modèle n'affichent rien.

## Utilisation

| Action | Effet |
|---|---|
| `/cap` | Active ou désactive les suggestions (désactivé par défaut ; utilise /cap pour l’activer). Le choix est conservé entre les sessions |
| Ctrl+X, puis Tab, puis Entrée | Choisit une suggestion au clavier |
| `×` | Masque la ligne jusqu'au tour suivant |

Le clic souris fonctionne sur les boutons. S'il ne réagit pas dans votre terminal, utilisez le clavier en secours.

## Installation

Aucune configuration ni clé d'API : cap utilise le modèle de votre session Claude Code. Dans une session Claude Code (terminal) :

```
/plugin marketplace add maldonae/mods-claude-code
/plugin install cap@maldonae-mods
```

Après l'installation, fermez la session Claude Code **et** VS Code, puis rouvrez-les ; si le mod n'apparaît toujours pas, redémarrez complètement le PC.

## Données et sécurité

- Le texte de la conversation est envoyé au modèle comme **donnée encadrée** : les balises sont neutralisées pour empêcher l'injection d'instructions.
- Seuls la demande (1 500 derniers caractères) et la fin de la réponse (6 000 derniers caractères) sont transmis.
- Seul l’état activé/désactivé est enregistré dans le stockage local du mod ; rien n’est envoyé ailleurs que vers le modèle de la session.
- Un appel au modèle par tour : cela consomme un peu de votre quota.

## Développement

```powershell
claude plugin test plugins/cap       # tests du harnais
claude plugin validate plugins/cap   # validation du manifeste et des hooks
node --test plugins/cap/tests/suggest.node.mts
```

## Licence

MIT, voir [LICENSE](LICENSE).
