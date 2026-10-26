<img src="icon.png" alt="" width="128" height="128">

# qa-guardian

Mod Claude Code qui vérifie la qualité **avant chaque `git commit` lancé par Claude**, et à la demande avec `/qa`.

## Vérifications

| Vérification | Niveau |
| --- | --- |
| Script `test` du package.json en échec | ✖ bloquant |
| Fichier `.env`, `.env.*`, `*.key`, `*.pem` dans le commit (sauf `.env.example`…) | ✖ bloquant |
| Secret dans les lignes ajoutées (clé privée, AWS, GitHub, `sk-…`, Stripe live, Slack, Google, `password = "…"`) | ✖ bloquant |
| Script `lint` en échec | ⚠ avertissement |
| `TODO` / `FIXME` ajoutés | ⚠ avertissement |
| JWT ajouté (clé anon Supabase possible) | ⚠ avertissement |
| Fichiers non voulus : `node_modules/`, `dist/`, `build/`, `coverage/`, `*.log`, `.DS_Store`, temporaires, plus de 30 fichiers | ⚠ avertissement |
| Fichiers modifiés laissés hors du commit | ℹ info |

Le résultat s'affiche dans une bande au-dessus du prompt : **vert** si tout est OK, **orange** pour les avertissements, **rouge** si c'est bloquant. Un commit bloqué est refusé à Claude avec la liste des problèmes.

## Commandes

| Commande | Effet |
| --- | --- |
| `/qa` | lance les vérifications (fichiers indexés, sinon toutes les modifications) |
| `/qa --report` | idem, et écrit `qa-report.md` dans le dossier courant |
| `/qa off` / `/qa on` | désactive / réactive le garde avant commit |

## Sécurité

- Le contenu des fichiers `.env`, `*.key`, `*.pem` n'est jamais lu : ils sont exclus du diff analysé.
- Les valeurs des secrets ne sont jamais recopiées (bande, rapport, message de refus) : seulement `fichier:ligne — type`.
- Tests et lint passent par le gestionnaire détecté (pnpm, yarn, npm), sans shell, avec `CI=1`.
- Seuls les commits lancés par Claude sont vérifiés, pas ceux tapés dans votre terminal.

## Installation

Aucune configuration ni clé d'API. Il faut `git` et, pour les tests et le lint, un `package.json` avec des scripts `test` / `lint` (pnpm, yarn ou npm détecté automatiquement). Dans une session Claude Code (terminal) :

```
/plugin marketplace add maldonae/mods-claude-code
/plugin install qa-guardian@maldonae-mods
```

Depuis un shell : `claude plugin install qa-guardian@maldonae-mods`.

Après l'installation, fermez la session Claude Code **et** VS Code, puis rouvrez-les ; si le mod n'apparaît toujours pas, redémarrez complètement le PC.

## Licence

MIT, voir [LICENSE](LICENSE).
