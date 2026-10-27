"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_LABEL = exports.RISK_COLOR = exports.PLAN_ONLY_END = exports.KNIP_INSTALL = exports.DEFAULT_GOAL = exports.STEP_TOOL = exports.PLAN_TOOL = void 0;
exports.words = words;
exports.parseCommand = parseCommand;
exports.resolvePath = resolvePath;
exports.isInside = isInside;
exports.isForbiddenFile = isForbiddenFile;
exports.secretIn = secretIn;
exports.knipStatusOf = knipStatusOf;
exports.withoutHeredocs = withoutHeredocs;
exports.knipFixVerdict = knipFixVerdict;
exports.knipRunVerdict = knipRunVerdict;
exports.isHighRiskReason = isHighRiskReason;
exports.shellVerdict = shellVerdict;
exports.isConfirmedRemoval = isConfirmedRemoval;
exports.knipMatches = knipMatches;
exports.knipItemOf = knipItemOf;
exports.parsePlan = parsePlan;
exports.parseStepReport = parseStepReport;
exports.statusOf = statusOf;
exports.needsConfirmation = needsConfirmation;
exports.analysisPrompt = analysisPrompt;
exports.planReply = planReply;
exports.stepPrompt = stepPrompt;
exports.cleanupLabel = cleanupLabel;
exports.confirmReply = confirmReply;
exports.summaryReply = summaryReply;
exports.pausedReply = pausedReply;
exports.isGuarded = isGuarded;
exports.writeVerdict = writeVerdict;
exports.PLAN_TOOL = 'mcp__refactor__plan';
exports.STEP_TOOL = 'mcp__refactor__step';
exports.DEFAULT_GOAL = 'améliorer la lisibilité, la maintenabilité et la testabilité, sans changer le comportement';
exports.KNIP_INSTALL = ['npm install -D knip', 'npx knip init'];
/** Mots séparés par des espaces, un chemin entre guillemets restant d'un seul tenant. */
function words(args) {
    return __spreadArray([], args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g), true).map(function (m) { var _a, _b, _c; return (_c = (_b = (_a = m[1]) !== null && _a !== void 0 ? _a : m[2]) !== null && _b !== void 0 ? _b : m[3]) !== null && _c !== void 0 ? _c : ''; });
}
function parseCommand(args) {
    var all = words(args.trim());
    var isPlanOnly = all.includes('--plan-only');
    var rest = all.filter(function (w) { return w !== '--plan-only'; });
    var first = rest[0];
    if (first === undefined)
        return { kind: 'help' };
    if (rest.length === 1 && !isPlanOnly) {
        var verb = first.toLowerCase();
        if (['go', 'ok', 'valider', 'confirmer', 'reprendre'].includes(verb))
            return { kind: 'go' };
        if (['passer', 'skip'].includes(verb))
            return { kind: 'skip' };
        if (['stop', 'annuler', 'arreter', 'arrêter'].includes(verb))
            return { kind: 'stop' };
        if (['statut', 'status'].includes(verb))
            return { kind: 'status' };
        if (['aide', 'help', '--help'].includes(verb))
            return { kind: 'help' };
    }
    return { kind: 'start', target: first, goal: rest.slice(1).join(' '), isPlanOnly: isPlanOnly };
}
// ——— Chemins ———
var isAbsolute = function (p) { return /^([A-Za-z]:)?\//.test(p); };
/** Chemin absolu, `/` partout, sans `.`, `..` ni `/` final. */
function resolvePath(cwd, path) {
    var raw = path.replace(/\\/g, '/');
    var full = isAbsolute(raw) ? raw : "".concat(cwd.replace(/\\/g, '/'), "/").concat(raw);
    var out = [];
    for (var _i = 0, _a = full.split('/'); _i < _a.length; _i++) {
        var part = _a[_i];
        if (part === '.' || (part === '' && out.length > 0))
            continue;
        if (part === '..') {
            if (out.length > 1)
                out.pop();
            continue;
        }
        out.push(part);
    }
    return out.join('/') || '/';
}
// Windows ne distingue pas la casse : on compare en minuscules.
var key = function (p) { return p.toLowerCase(); };
function isInside(file, dir) {
    return key(file) === key(dir) || key(file).startsWith("".concat(key(dir), "/"));
}
// ——— Secrets ———
var ENV_TEMPLATE = /^\.env\.(example|sample|template|dist)$/i;
function isForbiddenFile(path) {
    var _a;
    var base = (_a = path.replace(/\\/g, '/').split('/').pop()) !== null && _a !== void 0 ? _a : path;
    if (/^\.env(\..+)?$/i.test(base))
        return !ENV_TEMPLATE.test(base);
    return /\.(key|pem|p12|pfx)$/i.test(base);
}
var SECRETS = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'clé AWS'],
    [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'jeton GitHub'],
    [/\bsk-(ant-)?[A-Za-z0-9_-]{20,}/, 'clé API (sk-…)'],
    [/\b[rs]k_live_[A-Za-z0-9]{16,}/, 'clé Stripe live'],
    [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'jeton Slack'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/, 'clé Google API'],
    [/(api[_-]?key|secret|passw(or)?d|token)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i, 'secret en clair'],
];
/** Le type du premier secret reconnu dans `text`, jamais sa valeur. */
function secretIn(text) {
    var _a, _b;
    return (_b = (_a = SECRETS.find(function (_a) {
        var re = _a[0];
        return re.test(text);
    })) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : null;
}
// ——— Knip ———
/** Knip est-il là ? D'après le package.json (dépendances) et `node_modules/.bin`. */
function knipStatusOf(packageJson, hasBin) {
    if (packageJson === null)
        return 'none';
    if (hasBin)
        return 'detected';
    try {
        var parsed = JSON.parse(packageJson);
        if (typeof parsed !== 'object' || parsed === null)
            return 'missing';
        var p_1 = parsed;
        var has = function (field) {
            var deps = p_1[field];
            return typeof deps === 'object' && deps !== null && 'knip' in deps;
        };
        return has('devDependencies') || has('dependencies') ? 'detected' : 'missing';
    }
    catch (_a) {
        return 'missing';
    }
}
// Knip sous toutes ses formes : `knip`, `npx knip`, `npm run knip`, `npm exec knip`,
// `./node_modules/.bin/knip`, `knip.cmd`, `knip@5`, entre guillemets ou non.
var KNIP = /(^|[\s/"'`=])knip(\.cmd|@[\w.^~-]+)?(?=$|[\s"'`])/;
var KNIP_FIX = /(^|[\s"'`=])--(fix|fix-type|allow-remove-files)(?=$|[\s"'`=])/;
var HEREDOC = /<<-?\s*(['"]?)(\w+)\1/;
/**
 * La commande sans le corps de ses heredocs (message de commit…), lue ligne par ligne.
 * Le reste de la ligne d'ouverture est gardé (`cat <<EOF > f` reste une écriture) ;
 * un heredoc sans délimiteur de fin est gardé tel quel.
 */
function withoutHeredocs(command) {
    var _a;
    var lines = command.split('\n');
    var out = [];
    var i = 0;
    var _loop_1 = function () {
        var line = (_a = lines[i]) !== null && _a !== void 0 ? _a : '';
        var m = HEREDOC.exec(line);
        var end = m ? lines.findIndex(function (l, j) { return j > i && l.trim() === m[2]; }) : -1;
        // Heredoc fermé : on saute son corps et son délimiteur.
        out.push(m && end >= 0 ? line.replace(HEREDOC, '<<heredoc') : line);
        i = m && end >= 0 ? end + 1 : i + 1;
    };
    while (i < lines.length) {
        _loop_1();
    }
    return out.join('\n');
}
/** Les commandes simples (entre `;`, `&`, `|` et retours à la ligne) qui lancent Knip. */
function knipRuns(command) {
    return withoutHeredocs(command)
        .split(/[;&|\n]/)
        .filter(function (part) { return KNIP.test(part); });
}
/** `knip --fix` (et `--allow-remove-files`) : jamais lancé par Claude, à tout moment. */
function knipFixVerdict(command) {
    if (!knipRuns(command).some(function (run) { return KNIP_FIX.test(run); }))
        return null;
    return 'knip --fix / --allow-remove-files modifie ou supprime des fichiers : jamais sans validation explicite (l’utilisateur peut le lancer lui-même)';
}
/** Pendant un refactor : Knip ne tourne qu'installé, et `knip init` (qui écrit une configuration) jamais. */
function knipRunVerdict(command, status) {
    if (/\b(npm|pnpm|yarn|bun)\s+(install|i|add)\b[^;&|\n]*\bknip\b/.test(withoutHeredocs(command))) {
        return "installer Knip modifie le projet : propose \u00E0 l\u2019utilisateur ".concat(exports.KNIP_INSTALL.map(function (c) { return "`".concat(c, "`"); }).join(' puis '), ", sans les ex\u00E9cuter");
    }
    var runs = knipRuns(command);
    if (runs.length === 0)
        return null;
    if (runs.some(function (run) { return /\bknip(@\S+)?["'`]?\s+["'`]?init\b/.test(run); })) {
        return '`npx knip init` écrit une configuration : propose-le à l’utilisateur sans l’exécuter';
    }
    if (status !== 'detected') {
        return "Knip n\u2019est pas install\u00E9 : propose \u00E0 l\u2019utilisateur ".concat(exports.KNIP_INSTALL.map(function (c) { return "`".concat(c, "`"); }).join(' puis '), ", sans les ex\u00E9cuter");
    }
    return null;
}
// Ce qui rend une suppression risquée : un usage par un framework, une configuration, un test,
// un script, un entry point ou un import dynamique. « non utilisé par les tests » n'en est pas un.
var HIGH_RISK = /framework|config\w*|\btests?\b|\bspec\b|\bscripts?\b|entry\s*points?|points?\s+d['’]entrée|dynami\w*|plugin|route|middleware/gi;
var NEGATION = /\b(non|pas|aucun\w*|ni|jamais|not|never|no|nor|unused)\b[^.;,]{0,25}$/i;
/** Un usage à risque élevé est nommé dans `reason`, sans négation juste avant (« ni la config »). */
function isHighRiskReason(reason) {
    return __spreadArray([], reason.matchAll(HIGH_RISK), true).some(function (m) { return !NEGATION.test(reason.slice(0, m.index)); });
}
var KNIP_ORDER = { refactor: 0, 'knip-export': 1, 'knip-dependency': 2, 'knip-file': 3 };
// ——— Commandes shell pendant un refactor ———
// Irréversibles ou publiées : jamais sans validation explicite.
var DANGEROUS = [
    [/\bgit\b[^;&|\n]*\s(commit|push)\b/, 'git commit / push'],
    [/\bgit\b[^;&|\n]*\sreset\b[^;&|\n]*--hard\b/, 'git reset --hard'],
    [/\bgit\b[^;&|\n]*\s(clean|rm|restore|stash)\b/, 'git clean / rm / restore / stash'],
    [/\bgit\b[^;&|\n]*\scheckout\b[^;&|\n]*\s--(\s|$)/, 'git checkout --'],
    [/(^|[;&|(]\s*|\s)(rm|rmdir|del|erase|rd|unlink|shred|rimraf)\s/i, 'suppression de fichier'],
    [/\bRemove-Item\b|\bri\s/i, 'suppression de fichier'],
];
// Une redirection vers un fichier, guillemets retirés d'abord (`grep "<Button>"` n'en est pas une) :
// `>`, `>>`, `1>`, `2>`, `&>` ; mais pas `2>&1`, `> /dev/null`, `=>`, `->`, `>=`.
var REDIRECT = /(^|[^=\-<>])(\d|&)?>{1,2}(?![=&>])\s*(?!\/dev\/null\b|nul\b|\$null\b)[^\s;&|)]/i;
var QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
// Écrivent sur le disque hors Edit/Write : les vérifications du mod ne les verraient pas.
var WRITES = [
    [/\b(sed|perl)\s+(-\w*\s+)*-i/, 'édition en place (sed/perl -i)'],
    [/(^|\s)--(fix|write)(\s|=|$)/, 'outil qui réécrit des fichiers (--fix, --write)'],
    // En position de commande seulement : `grep black` reste une lecture.
    [
        /(^|[;&|(]\s*|(npx|bunx|pnpm\s+(exec|dlx)|yarn(\s+dlx)?)\s+)(oxfmt|dprint\s+fmt|gofmt\s+-w|black|ruff\s+format|rustfmt)\b/,
        'formateur qui réécrit des fichiers',
    ],
    [/\b(npm|pnpm|yarn|bun)\s+(run\s+)?(format|fmt|fix|lint:fix|format:fix)\b/, 'script qui réécrit des fichiers'],
    [/writeFile|appendFile|createWriteStream|copyFile|unlinkSync|rmSync|\.write_text|\.write_bytes|open\([^)]*["'][wax]\+?["']/, 'script qui écrit ou supprime des fichiers'],
    [/(^|[;&|(]\s*|\s)(tee|mv|cp|touch|mkdir|truncate|install)\s/, 'écriture de fichier'],
    [/\bgit\b[^;&|\n]*\s(apply|am|checkout|switch|merge|rebase|cherry-pick|revert|mv)\b/, 'commande git qui modifie les fichiers'],
    [/\b(npm|pnpm|yarn|bun)\s+(install|i|add|remove|rm|uninstall|un|update|up)\b/, 'changement de dépendances'],
    [/\b(Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Rename-Item|Clear-Content)\b/i, 'écriture de fichier (PowerShell)'],
];
/** Pourquoi une commande est refusée pendant un refactor, ou null si elle peut tourner (lecture, tests, knip). */
function shellVerdict(command, knipStatus) {
    if (knipStatus === void 0) { knipStatus = 'detected'; }
    var fix = knipFixVerdict(command);
    if (fix)
        return fix;
    var knip = knipRunVerdict(command, knipStatus);
    if (knip)
        return knip;
    var danger = DANGEROUS.find(function (_a) {
        var re = _a[0];
        return re.test(command);
    });
    if (danger)
        return "".concat(danger[1], " : jamais sans validation explicite de l'utilisateur");
    var write = WRITES.find(function (_a) {
        var re = _a[0];
        return re.test(command);
    });
    if (write)
        return "".concat(write[1], " : pendant un refactor, les fichiers se modifient avec Edit ou Write uniquement");
    if (REDIRECT.test(withoutHeredocs(command).replace(QUOTED, '""'))) {
        return 'redirection vers un fichier : pendant un refactor, les fichiers se modifient avec Edit ou Write uniquement';
    }
    return null;
}
/**
 * La seule suppression permise : celle d'une étape Knip que l'utilisateur a confirmée, en une commande
 * simple qui ne nomme que les fichiers (knip-file) ou les paquets (knip-dependency) de l'étape.
 */
function isConfirmedRemoval(command, run, cwd) {
    var _a, _b;
    var step = run.steps[run.current];
    if (run.phase !== 'applying' || !step || !step.isConfirmed || /[;&|`$<>(){}\n]/.test(command))
        return false;
    var tokens = words(command.trim());
    if (step.kind === 'knip-file') {
        var args = tokens[0] === 'git' && tokens[1] === 'rm' ? tokens.slice(2) : tokens[0] === 'rm' ? tokens.slice(1) : null;
        if (args === null)
            return false;
        var paths = args.filter(function (t) { return !['-f', '-q', '--'].includes(t); });
        if (paths.length === 0 || paths.some(function (t) { return t.startsWith('-'); }))
            return false;
        var allowed_1 = new Set(step.files.map(function (f) { return key(resolvePath(cwd, f)); }));
        return paths.every(function (p) { return allowed_1.has(key(resolvePath(cwd, p))); });
    }
    if (step.kind === 'knip-dependency') {
        if (!['npm', 'pnpm', 'yarn', 'bun'].includes((_a = tokens[0]) !== null && _a !== void 0 ? _a : ''))
            return false;
        if (!['uninstall', 'remove', 'rm', 'un'].includes((_b = tokens[1]) !== null && _b !== void 0 ? _b : ''))
            return false;
        var names = tokens.slice(2).filter(function (t) { return !['-D', '--save-dev', '-w', '--workspace-root'].includes(t); });
        if (names.length === 0 || names.some(function (t) { return t.startsWith('-'); }))
            return false;
        return names.every(function (n) { return step.knip.includes(n); });
    }
    return false;
}
// ——— Ce que Claude remonte par les outils ———
var RISKS = ['faible', 'moyen', 'élevé'];
var TEST_STATES = ['OK', 'échec', 'non exécutés'];
var KINDS = ['refactor', 'knip-export', 'knip-dependency', 'knip-file'];
var KNIP_KINDS = ['fichier', 'export', 'dépendance', 'manquante'];
var isObject = function (v) { return typeof v === 'object' && v !== null && !Array.isArray(v); };
var str = function (v) { return (typeof v === 'string' ? v.trim() : ''); };
var strs = function (v) { return (Array.isArray(v) ? v.map(str).filter(function (s) { return s !== ''; }) : []); };
function riskOf(v) {
    var s = str(v).toLowerCase();
    if (s === 'eleve' || s === 'high' || s === 'élevé')
        return 'élevé';
    if (s === 'medium' || s === 'moyen')
        return 'moyen';
    if (s === 'low' || s === 'faible')
        return 'faible';
    return RISKS.includes(s) ? s : 'moyen';
}
/** Les résultats Knip qu'une référence d'étape désigne : `nom`, ou `fichier:nom` quand le nom est ambigu. */
function knipMatches(items, ref) {
    return items.filter(function (k) { return ref === k.name || ref === "".concat(k.file, ":").concat(k.name); });
}
/** Un résultat Knip ; un usage par framework, configuration, test, script, entry point ou import dynamique est toujours à risque élevé. */
function knipItemOf(raw) {
    var _a;
    var name = str(raw.name);
    if (name === '')
        return null;
    var kind = (_a = KNIP_KINDS.find(function (k) { return k === str(raw.kind).toLowerCase(); })) !== null && _a !== void 0 ? _a : 'export';
    var reason = str(raw.reason);
    var risk = isHighRiskReason(reason) ? 'élevé' : riskOf(raw.risk);
    return { kind: kind, name: name, file: str(raw.file), risk: risk, reason: reason };
}
function parsePlan(input) {
    var _a;
    if (!isObject(input))
        return 'entrée invalide : un objet est attendu';
    if (!Array.isArray(input.steps) || input.steps.length === 0)
        return '`steps` doit contenir au moins une étape';
    var knip = (Array.isArray(input.knip) ? input.knip : [])
        .filter(isObject)
        .map(knipItemOf)
        .filter(function (k) { return k !== null; });
    var steps = [];
    var lastKnip = 0;
    var _loop_2 = function (i, raw) {
        if (!isObject(raw) || str(raw.title) === '')
            return { value: "\u00E9tape ".concat(i + 1, " : `title` manquant") };
        var kind = (_a = KINDS.find(function (k) { return k === str(raw.kind); })) !== null && _a !== void 0 ? _a : 'refactor';
        if (kind !== 'refactor') {
            if (KNIP_ORDER[kind] < lastKnip) {
                return { value: "\u00E9tape ".concat(i + 1, " : les nettoyages Knip vont dans l\u2019ordre exports, puis d\u00E9pendances, puis fichiers") };
            }
            lastKnip = KNIP_ORDER[kind];
        }
        var refs = strs(raw.knip);
        var step = {
            title: str(raw.title),
            kind: kind,
            files: strs(raw.files),
            risk: riskOf(raw.risk),
            tests: strs(raw.tests),
            knip: refs,
            status: 'todo',
            testState: 'non exécutés',
            isConfirmed: kind === 'refactor',
        };
        // Un nettoyage prend le risque le plus haut de ses résultats Knip (homonymes compris).
        var itemRisks = refs.flatMap(function (r) { return knipMatches(knip, r).map(function (k) { return k.risk; }); });
        if (itemRisks.includes('élevé'))
            step.risk = 'élevé';
        else if (itemRisks.includes('moyen') && step.risk === 'faible')
            step.risk = 'moyen';
        if (kind === 'knip-file' && step.risk === 'élevé') {
            return { value: "\u00E9tape ".concat(i + 1, " : suppression d\u2019un fichier \u00E0 risque \u00E9lev\u00E9 (framework, configuration, test, script, entry point ou import dynamique) \u2014 retire-le de l\u2019\u00E9tape et laisse-le dans `knip` comme \u00AB \u00E0 analyser \u00BB") };
        }
        steps.push(step);
    };
    for (var _i = 0, _b = input.steps.entries(); _i < _b.length; _i++) {
        var _c = _b[_i], i = _c[0], raw = _c[1];
        var state_1 = _loop_2(i, raw);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    var issues = (Array.isArray(input.issues) ? input.issues : []).filter(isObject).map(function (i) { return ({
        kind: str(i.kind),
        file: str(i.file),
        detail: str(i.detail),
    }); });
    var command = str(input.testCommand);
    return { steps: steps, issues: issues, knip: knip, hasTests: input.hasTests === true, testCommand: command === '' ? null : command };
}
function parseStepReport(input) {
    var _a;
    if (!isObject(input))
        return 'entrée invalide : un objet est attendu';
    var step = typeof input.step === 'number' ? input.step : Number(input.step);
    var status = str(input.status).toLowerCase();
    if (!Number.isInteger(step) || step < 1)
        return '`step` : numéro d’étape (1, 2, …) attendu';
    if (status !== 'ok' && status !== 'échec' && status !== 'annulée')
        return '`status` : "ok", "échec" ou "annulée"';
    var tests = (_a = TEST_STATES.find(function (t) { return t.toLowerCase() === str(input.tests).toLowerCase(); })) !== null && _a !== void 0 ? _a : 'non exécutés';
    return { step: step, status: status, tests: tests, note: str(input.note) };
}
/** Statut d'une étape d'après le rapport : un « ok » avec des tests en échec reste un échec. */
function statusOf(report) {
    if (report.status === 'annulée')
        return 'reverted';
    return report.status === 'ok' && report.tests !== 'échec' ? 'done' : 'failed';
}
/** Un nettoyage Knip pas encore confirmé par l'utilisateur. */
function needsConfirmation(step) {
    return step !== undefined && step.kind !== 'refactor' && !step.isConfirmed;
}
// ——— Textes pour Claude ———
var RULES = [
    'Règles du mod refactor :',
    '- Ne touche jamais aux fichiers .env, *.key, *.pem, *.p12 ni à un fichier qui contient un secret.',
    '- Pas de git commit, git push, git reset --hard, git restore/checkout ni suppression de fichier : demande à l’utilisateur.',
    '- Jamais `npx knip --fix` ni `--allow-remove-files` : ils sont bloqués.',
    '- Modifie les fichiers avec Edit ou Write uniquement (les écritures par le shell sont bloquées).',
].join('\n');
function knipSection(status) {
    if (status === 'none')
        return ['Knip : pas de package.json, Knip ne s’applique pas.'];
    var rules = [
        'Classe chaque résultat Knip par risque :',
        '- faible : export ou dépendance clairement inutilisé ;',
        '- moyen : usage dynamique, entry point ou import indirect possible ;',
        '- élevé : fichier ou dépendance utilisé par un framework, un test, une configuration, un script ou un import dynamique. Ne propose pas sa suppression sans analyse supplémentaire.',
        'Passe-les dans `knip` (kind « fichier », « export », « dépendance » ou « manquante », name, file, risk, reason).',
        'Nettoyages : des étapes séparées de kind « knip-export », puis « knip-dependency », puis « knip-file », dans cet ordre, chacune listant ses résultats dans `knip`. Chacune sera confirmée par l’utilisateur avant d’être appliquée.',
    ];
    if (status === 'missing') {
        return [
            "Knip : non install\u00E9. Ne le lance pas. Propose \u00E0 l\u2019utilisateur, sans les ex\u00E9cuter : `".concat(exports.KNIP_INSTALL[0], "` puis `").concat(exports.KNIP_INSTALL[1], "`."),
        ];
    }
    return __spreadArray([
        'Knip : installé. Exécute `npx knip` (lecture seule, jamais `--fix`) et intègre ses résultats au plan : fichiers inutilisés, exports inutilisés, dépendances inutilisées, dépendances manquantes ou fantômes.'
    ], rules, true);
}
function analysisPrompt(run) {
    return __spreadArray(__spreadArray([
        "[refactor] Analyse de refactorisation de `".concat(run.target, "` \u2014 lecture seule."),
        "Objectif : ".concat(run.goal || exports.DEFAULT_GOAL, "."),
        "Mode : ".concat(run.isPlanOnly ? 'plan seul (--plan-only), aucune modification ; Knip ne sert qu’au rapport et au plan' : 'plan d’abord, application seulement après validation', "."),
        '',
        '1. Lis la cible (Read, Grep, Glob). Ne modifie aucun fichier : les écritures sont bloquées tant que le plan n’est pas validé.',
        '2. Repère : fonctions trop longues ou complexes, duplication, responsabilités mélangées, noms peu clairs, code mort, dépendances inutiles, manque de testabilité, risques de régression.',
        '3. Détecte les tests existants (scripts du package.json, dossiers de tests, pytest, go test…) et la commande qui les lance.'
    ], knipSection(run.knipStatus).map(function (l) { return "   ".concat(l); }), true), [
        "4. Appelle l\u2019outil ".concat(exports.PLAN_TOOL, " : \u00E9tapes petites, isol\u00E9es et v\u00E9rifiables, class\u00E9es par priorit\u00E9, chacune avec ses fichiers, son risque (faible, moyen, \u00E9lev\u00E9) et les tests \u00E0 lancer ou \u00E0 cr\u00E9er. Si aucun test n\u2019existe, mets en premier une \u00E9tape de tests de caract\u00E9risation."),
        '5. Présente ensuite le rapport dans le chat.',
        '',
        RULES,
    ], false).join('\n');
}
function planReply(run) {
    var n = run.steps.length;
    var cleanups = run.steps.filter(function (s) { return s.kind !== 'refactor'; }).length;
    var lines = ["Plan enregistr\u00E9 : ".concat(n, " \u00E9tape(s), dont ").concat(cleanups, " nettoyage(s) Knip.")];
    lines.push('Présente-le clairement dans le chat : pour chaque étape, priorité, fichiers, risque et tests à lancer après.');
    if (run.knip.length > 0) {
        lines.push('Ajoute le rapport Knip : fichiers, exports, dépendances inutilisés et dépendances manquantes, avec leur risque.');
    }
    if (run.knipStatus === 'missing') {
        lines.push("Knip n\u2019est pas install\u00E9 : propose `".concat(exports.KNIP_INSTALL[0], "` puis `").concat(exports.KNIP_INSTALL[1], "`, sans les ex\u00E9cuter."));
    }
    if (!run.hasTests) {
        lines.push('Aucun test détecté : préviens l’utilisateur et propose de créer d’abord des tests de caractérisation, avant toute refactorisation.');
    }
    if (run.isPlanOnly) {
        lines.push('Mode plan seul : ne modifie aucun fichier. Propose aussi les tests à créer ou à exécuter.', "Termine ta r\u00E9ponse exactement par : ".concat((0, exports.PLAN_ONLY_END)(run.target)));
    }
    else {
        lines.push('Puis ARRÊTE-TOI : n’applique rien. L’utilisateur valide avec le bouton « Valider le plan » ou la commande /refactor go.', 'Chaque nettoyage Knip demandera en plus sa propre confirmation au moment de l’appliquer.');
    }
    return lines.join('\n');
}
function kindInstructions(step) {
    var names = step.knip.length > 0 ? step.knip.join(', ') : 'les résultats Knip de l’étape';
    switch (step.kind) {
        case 'knip-export':
            return ["1. Retire uniquement les exports inutilis\u00E9s confirm\u00E9s (".concat(names, ") avec Edit : le mot-cl\u00E9 export, ou le code s\u2019il est mort.")];
        case 'knip-dependency':
            return [
                "1. Retire uniquement ces d\u00E9pendances : ".concat(names, ", avec `npm uninstall <noms>` (ou pnpm/yarn remove), en une commande qui ne nomme qu\u2019elles."),
            ];
        case 'knip-file':
            return ["1. Supprime uniquement ces fichiers, confirm\u00E9s : ".concat(step.files.join(', '), ", avec `git rm <fichiers>` ou `rm <fichiers>`.")];
        default:
            return ['1. Fais le plus petit changement possible, avec Edit ou Write, sur ces fichiers (ou d’autres fichiers sous la cible).'];
    }
}
function stepPrompt(run, index) {
    var step = run.steps[index];
    if (!step)
        return '';
    var tests = step.tests.length > 0 ? step.tests.join(' ; ') : 'les tests du projet';
    return __spreadArray(__spreadArray(__spreadArray(__spreadArray([
        "[refactor] Applique UNIQUEMENT l\u2019\u00E9tape ".concat(index + 1, "/").concat(run.steps.length, " : ").concat(step.title),
        "Fichiers : ".concat(step.files.length > 0 ? step.files.join(', ') : "sous ".concat(run.target)),
        "Risque : ".concat(step.risk)
    ], (step.knip.length > 0 ? ["R\u00E9sultats Knip : ".concat(step.knip.join(', '))] : []), true), [
        "Tests apr\u00E8s l\u2019\u00E9tape : ".concat(tests).concat(run.testCommand ? " (commande : ".concat(run.testCommand, ")") : ''),
        ''
    ], false), kindInstructions(step), true), [
        '2. Montre un diff clair de l’étape (`git diff -- <fichiers>` ou extraits avant/après).',
        '3. Relance les tests disponibles.',
        '4. S’ils échouent : corrige, ou annule l’étape en remettant le contenu d’origine avec Edit.',
        "5. Appelle ".concat(exports.STEP_TOOL, " avec { step: ").concat(index + 1, ", status: \"ok\" | \"\u00E9chec\" | \"annul\u00E9e\", tests: \"OK\" | \"\u00E9chec\" | \"non ex\u00E9cut\u00E9s\", note }."),
        '',
        RULES,
    ], false).join('\n');
}
/** Ce qu'un nettoyage Knip va retirer, pour la demande de confirmation. */
function cleanupLabel(step) {
    var what = step.kind === 'knip-file' ? step.files : step.knip;
    var noun = step.kind === 'knip-export' ? 'export(s)' : step.kind === 'knip-dependency' ? 'dépendance(s)' : 'fichier(s)';
    return "".concat(what.length, " ").concat(noun, " : ").concat(what.join(', ') || '—');
}
function confirmReply(run, index) {
    var step = run.steps[index];
    return [
        "L\u2019\u00E9tape ".concat(index + 1, "/").concat(run.steps.length, " est un nettoyage Knip (").concat(step ? cleanupLabel(step) : '', ") : elle attend la confirmation explicite de l\u2019utilisateur."),
        'Présente précisément ce qui sera supprimé (noms, fichiers, risque) puis ARRÊTE-TOI. Il confirme avec /refactor go, passe l’étape avec /refactor passer, ou arrête avec /refactor stop.',
    ].join('\n');
}
function summaryReply(run) {
    var done = run.steps.filter(function (s) { return s.status === 'done'; });
    var skipped = run.steps.filter(function (s) { return s.status === 'skipped'; });
    return [
        "Toutes les \u00E9tapes sont trait\u00E9es (".concat(done.length, "/").concat(run.steps.length, " faites").concat(skipped.length > 0 ? ", ".concat(skipped.length, " pass\u00E9e(s)") : '', ")."),
        'Affiche le résumé final dans le chat :',
        "- \u00E9tapes r\u00E9alis\u00E9es : ".concat(done.map(function (s) { return s.title; }).join(' ; ') || 'aucune'),
        "- fichiers modifi\u00E9s : ".concat(run.modified.join(', ') || 'aucun'),
        "- tests ex\u00E9cut\u00E9s : ".concat(run.steps.map(function (s, i) { return "".concat(i + 1, " ").concat(s.testState); }).join(', ')),
        '- risques restants (dont les résultats Knip à risque élevé non traités) et recommandations de revue (à toi de les formuler).',
        'Ne committe pas : propose à l’utilisateur de relire le diff puis de committer lui-même.',
    ].join('\n');
}
function pausedReply(run, index) {
    return [
        "\u00C9tape ".concat(index + 1, "/").concat(run.steps.length, " arr\u00EAt\u00E9e : la suite n\u2019est pas appliqu\u00E9e."),
        'Explique à l’utilisateur ce qui a échoué et ce que tu as annulé, puis arrête-toi.',
        'Il reprendra l’étape avec /refactor go, ou arrêtera avec /refactor stop.',
    ].join('\n');
}
var PLAN_ONLY_END = function (target) {
    return "Plan g\u00E9n\u00E9r\u00E9. Lance /refactor ".concat(target, " sans --plan-only pour appliquer les changements.");
};
exports.PLAN_ONLY_END = PLAN_ONLY_END;
// ——— Gardes ———
/** Phases où le mod garde les fichiers. */
function isGuarded(run) {
    return run !== null && ['analysing', 'awaiting', 'applying', 'confirming', 'paused', 'planned'].includes(run.phase);
}
/** Pourquoi une écriture sur `fileAbs` est refusée (hors secret, vérifié à part), ou null. */
function writeVerdict(run, fileAbs, cwd) {
    var _a;
    if (isForbiddenFile(fileAbs))
        return 'fichier sensible (.env, *.key, *.pem, *.p12) : jamais modifié par refactor';
    if (run.phase === 'planned')
        return 'mode --plan-only : aucun fichier ne doit être modifié';
    if (run.phase === 'analysing' || run.phase === 'awaiting') {
        return 'le plan n’est pas encore validé par l’utilisateur (/refactor go ou le bouton « Valider le plan »)';
    }
    if (run.phase === 'confirming')
        return 'nettoyage Knip pas encore confirmé par l’utilisateur (/refactor go)';
    if (run.phase === 'paused')
        return 'refactor en pause après un échec : attends que l’utilisateur relance avec /refactor go';
    var step = run.steps[run.current];
    var isPlanned = (_a = step === null || step === void 0 ? void 0 : step.files.some(function (f) { return key(resolvePath(cwd, f)) === key(fileAbs); })) !== null && _a !== void 0 ? _a : false;
    if (isPlanned || isInside(fileAbs, run.targetAbs))
        return null;
    return "fichier hors de l\u2019\u00E9tape en cours et hors de ".concat(run.target, " : demande d\u2019abord \u00E0 l\u2019utilisateur");
}
exports.RISK_COLOR = {
    faible: 'success',
    moyen: 'warning',
    élevé: 'error',
};
exports.STATUS_LABEL = {
    todo: '○ en attente',
    running: '▶ en cours',
    done: '✓ terminée',
    failed: '✖ échec',
    reverted: '↺ annulée',
    skipped: '⤼ passée',
};
