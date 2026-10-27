"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
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
exports.register = void 0;
var claude_code_1 = require("claude-code");
var plan_1 = require("./plan");
var PANE = 'refactor';
// Changer le tag quand les champs de Run changent : une valeur d'une version antérieure est écartée.
var run = (0, claude_code_1.atom)({ plugin: 'refactor', key: 'run' }, null, { shape: 'run-2' });
var cwd = (0, claude_code_1.atom)({ plugin: 'refactor', key: 'cwd' }, '');
var isBandHidden = (0, claude_code_1.atom)({ plugin: 'refactor', key: 'isBandHidden' }, false);
var HELP = [
    '/refactor <fichier-ou-dossier> [objectif] [--plan-only] — analyse puis plan de refactorisation',
    '/refactor go — valide le plan, confirme un nettoyage Knip ou reprend après un échec',
    '/refactor passer — saute le nettoyage Knip en attente de confirmation',
    '/refactor stop — arrête le refactor en cours',
    '/refactor statut — où en est le refactor',
].join('\n');
var PLAN_SCHEMA = {
    type: 'object',
    properties: {
        steps: {
            type: 'array',
            description: 'Étapes classées par priorité, petites, isolées et vérifiables.',
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Ex. « Extraction de la validation JWT »' },
                    kind: {
                        type: 'string',
                        enum: ['refactor', 'knip-export', 'knip-dependency', 'knip-file'],
                        description: 'refactor par défaut ; nettoyages Knip dans l’ordre exports, dépendances, fichiers',
                    },
                    files: { type: 'array', items: { type: 'string' }, description: 'Fichiers concernés' },
                    risk: { type: 'string', enum: ['faible', 'moyen', 'élevé'] },
                    tests: { type: 'array', items: { type: 'string' }, description: 'Tests à lancer ou à créer après l’étape' },
                    knip: { type: 'array', items: { type: 'string' }, description: 'Résultats Knip traités : leur nom, ou « fichier:nom » si deux résultats portent le même nom' },
                },
                required: ['title', 'files', 'risk', 'tests'],
            },
        },
        knip: {
            type: 'array',
            description: 'Résultats de `npx knip`, classés par risque.',
            items: {
                type: 'object',
                properties: {
                    kind: { type: 'string', enum: ['fichier', 'export', 'dépendance', 'manquante'] },
                    name: { type: 'string' },
                    file: { type: 'string' },
                    risk: { type: 'string', enum: ['faible', 'moyen', 'élevé'] },
                    reason: { type: 'string', description: 'Pourquoi ce risque (usage dynamique, entry point, framework, configuration, test…)' },
                },
                required: ['kind', 'name', 'risk'],
            },
        },
        issues: {
            type: 'array',
            description: 'Problèmes repérés à l’analyse.',
            items: {
                type: 'object',
                properties: {
                    kind: { type: 'string', description: 'complexité, duplication, responsabilités, nommage, code mort, dépendance, testabilité, régression' },
                    file: { type: 'string' },
                    detail: { type: 'string' },
                },
            },
        },
        hasTests: { type: 'boolean', description: 'Des tests automatisés existent-ils pour la cible ?' },
        testCommand: { type: 'string', description: 'Commande qui lance les tests, ex. « pnpm test »' },
    },
    required: ['steps', 'hasTests'],
};
var STEP_SCHEMA = {
    type: 'object',
    properties: {
        step: { type: 'integer', description: 'Numéro de l’étape (1, 2, …)' },
        status: { type: 'string', enum: ['ok', 'échec', 'annulée'] },
        tests: { type: 'string', enum: ['OK', 'échec', 'non exécutés'] },
        note: { type: 'string', description: 'Ce qui a été fait, ou pourquoi l’étape a échoué' },
    },
    required: ['step', 'status', 'tests'],
};
// Un hook command.run ne peut pas soumettre de prompt (il attendrait le tour qu'il tient) : on soumet juste après.
function submitSoon($, text) {
    $.clock.after(0, function () { return void $.prompt.submit({ text: text }); });
}
var deny = function (why) { return ({
    deny: "refactor : ".concat(why, ". Demande \u00E0 l'utilisateur : il peut le faire lui-m\u00EAme ou terminer le refactor (/refactor stop)."),
}); };
// Refus d'une écriture : chemin interdit, phase, fichier hors étape, secret écrit ou déjà présent.
function writeDenial($, path, text) {
    return __awaiter(this, void 0, void 0, function () {
        var current, base, abs, why, written, _a, existing, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    current = _c.sent();
                    if (!(0, plan_1.isGuarded)(current))
                        return [2 /*return*/, null];
                    return [4 /*yield*/, (0, claude_code_1.read)($, cwd)];
                case 2:
                    base = _c.sent();
                    abs = (0, plan_1.resolvePath)(base, path);
                    why = (0, plan_1.writeVerdict)(current, abs, base);
                    if (why)
                        return [2 /*return*/, deny(why)];
                    written = (0, plan_1.secretIn)(text);
                    if (written)
                        return [2 /*return*/, deny("le contenu \u00E0 \u00E9crire contient un secret (".concat(written, ")"))];
                    _a = !(0, plan_1.isForbiddenFile)(abs);
                    if (!_a) return [3 /*break*/, 4];
                    return [4 /*yield*/, $.fs.exists(abs)];
                case 3:
                    _a = (_c.sent());
                    _c.label = 4;
                case 4:
                    if (!_a) return [3 /*break*/, 6];
                    _b = plan_1.secretIn;
                    return [4 /*yield*/, $.fs.read(abs).catch(function () { return ''; })];
                case 5:
                    existing = _b.apply(void 0, [_c.sent()]);
                    if (existing)
                        return [2 /*return*/, deny("".concat(path, " contient un secret (").concat(existing, ") : fichier jamais modifi\u00E9 par refactor"))];
                    _c.label = 6;
                case 6: return [2 /*return*/, null];
            }
        });
    });
}
// `knip --fix` est refusé à tout moment ; le reste ne l'est que pendant un refactor,
// sauf la suppression qu'un nettoyage Knip confirmé a nommée.
function shellDenial($, command) {
    return __awaiter(this, void 0, void 0, function () {
        var fix, current, _a, _b, why;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    fix = (0, plan_1.knipFixVerdict)(command);
                    if (fix)
                        return [2 /*return*/, { deny: "refactor : ".concat(fix, ".") }];
                    return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    current = _c.sent();
                    if (!(0, plan_1.isGuarded)(current))
                        return [2 /*return*/, null];
                    _a = plan_1.isConfirmedRemoval;
                    _b = [command, current];
                    return [4 /*yield*/, (0, claude_code_1.read)($, cwd)];
                case 2:
                    if (_a.apply(void 0, _b.concat([_c.sent()])))
                        return [2 /*return*/, null];
                    why = (0, plan_1.shellVerdict)(command, current.knipStatus);
                    return [2 /*return*/, why ? deny(why) : null];
            }
        });
    });
}
function noteModified($, path) {
    return __awaiter(this, void 0, void 0, function () {
        var abs, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = plan_1.resolvePath;
                    return [4 /*yield*/, (0, claude_code_1.read)($, cwd)];
                case 1:
                    abs = _a.apply(void 0, [_b.sent(), path]);
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function (r) {
                            return r && r.phase === 'applying' && !r.modified.includes(abs) ? __assign(__assign({}, r), { modified: __spreadArray(__spreadArray([], r.modified, true), [abs], false) }) : r;
                        })];
                case 2:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function detectKnip($, base) {
    return __awaiter(this, void 0, void 0, function () {
        var pkg, json, _a, bin, hasBin, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    pkg = "".concat(base, "/package.json");
                    return [4 /*yield*/, $.fs.exists(pkg)];
                case 1:
                    if (!(_d.sent())) return [3 /*break*/, 3];
                    return [4 /*yield*/, $.fs.read(pkg).catch(function () { return '{}'; })];
                case 2:
                    _a = _d.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = null;
                    _d.label = 4;
                case 4:
                    json = _a;
                    bin = "".concat(base, "/node_modules/.bin/knip");
                    _b = json !== null;
                    if (!_b) return [3 /*break*/, 8];
                    return [4 /*yield*/, $.fs.exists(bin)];
                case 5:
                    _c = (_d.sent());
                    if (_c) return [3 /*break*/, 7];
                    return [4 /*yield*/, $.fs.exists("".concat(bin, ".cmd"))];
                case 6:
                    _c = (_d.sent());
                    _d.label = 7;
                case 7:
                    _b = (_c);
                    _d.label = 8;
                case 8:
                    hasBin = _b;
                    return [2 /*return*/, (0, plan_1.knipStatusOf)(json, hasBin)];
            }
        });
    });
}
/** L'étape `index` devient l'étape en cours : appliquée, ou en attente de confirmation si c'est un nettoyage Knip. */
function enter(current, steps, index) {
    if (index >= steps.length)
        return __assign(__assign({}, current), { steps: steps, phase: 'done', current: steps.length - 1 });
    var step = steps[index];
    var phase = (0, plan_1.needsConfirmation)(step) ? 'confirming' : 'applying';
    return __assign(__assign({}, current), { phase: phase, current: index, steps: steps.map(function (s, i) { return (i === index ? __assign(__assign({}, s), { status: phase === 'applying' ? 'running' : 'todo', testState: 'non exécutés' }) : s); }) });
}
/** Ce que Claude doit faire une fois dans `next` : l'étape, la confirmation à attendre, ou le résumé. */
function replyFor(next) {
    if (next.phase === 'done')
        return (0, plan_1.summaryReply)(next);
    if (next.phase === 'confirming')
        return (0, plan_1.confirmReply)(next, next.current);
    return (0, plan_1.stepPrompt)(next, next.current);
}
function approve($) {
    return __awaiter(this, void 0, void 0, function () {
        var current, index, steps, next, step, what;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    current = _a.sent();
                    if (current === null)
                        return [2 /*return*/, 'Aucun refactor en cours. Lance /refactor <chemin>.'];
                    if (current.isPlanOnly)
                        return [2 /*return*/, "Mode plan seul : relance /refactor ".concat(current.target, " sans --plan-only pour appliquer.")];
                    if (current.phase !== 'awaiting' && current.phase !== 'paused' && current.phase !== 'confirming') {
                        return [2 /*return*/, "Rien \u00E0 valider (phase : ".concat(current.phase, ").")];
                    }
                    index = current.phase === 'awaiting' ? 0 : Math.max(0, current.current);
                    steps = current.steps.map(function (s, i) { return (i === index && current.phase === 'confirming' ? __assign(__assign({}, s), { isConfirmed: true }) : s); });
                    next = enter(current, steps, index);
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function () { return next; })];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, isBandHidden, function () { return false; })];
                case 3:
                    _a.sent();
                    step = next.steps[index];
                    if (next.phase === 'confirming' && step) {
                        return [2 /*return*/, "Plan valid\u00E9. L'\u00E9tape ".concat(index + 1, " est un nettoyage Knip (").concat((0, plan_1.cleanupLabel)(step), ") : confirme-la avec /refactor go ou le bouton \u00AB Confirmer \u00BB.")];
                    }
                    submitSoon($, (0, plan_1.stepPrompt)(next, index));
                    what = current.phase === 'confirming' ? 'Nettoyage confirmé' : current.phase === 'paused' ? 'Reprise' : 'Plan validé';
                    return [2 /*return*/, "".concat(what, " : application de l'\u00E9tape ").concat(index + 1, "/").concat(next.steps.length, ".")];
            }
        });
    });
}
function skip($) {
    return __awaiter(this, void 0, void 0, function () {
        var current, index, steps, next;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    current = _a.sent();
                    if (current === null || current.phase !== 'confirming')
                        return [2 /*return*/, 'Aucun nettoyage Knip en attente de confirmation.'];
                    index = current.current;
                    steps = current.steps.map(function (s, i) { return (i === index ? __assign(__assign({}, s), { status: 'skipped' }) : s); });
                    next = enter(current, steps, index + 1);
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function () { return next; })];
                case 2:
                    _a.sent();
                    if (next.phase !== 'confirming')
                        submitSoon($, "[refactor] \u00C9tape ".concat(index + 1, " pass\u00E9e par l\u2019utilisateur (rien supprim\u00E9).\n\n").concat(replyFor(next)));
                    return [2 /*return*/, "\u00C9tape ".concat(index + 1, " pass\u00E9e : rien n'a \u00E9t\u00E9 supprim\u00E9.")];
            }
        });
    });
}
function cancel($) {
    return __awaiter(this, void 0, void 0, function () {
        var current;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    current = _a.sent();
                    if (!(0, plan_1.isGuarded)(current))
                        return [2 /*return*/, 'Aucun refactor en cours.'];
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function (r) { return (r ? __assign(__assign({}, r), { phase: 'cancelled' }) : r); })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, 'Refactor arrêté. Les étapes déjà appliquées restent en place (non committées).'];
            }
        });
    });
}
function statusText(r) {
    if (r === null)
        return 'Aucun refactor dans cette session.';
    var done = r.steps.filter(function (s) { return s.status === 'done'; }).length;
    return "refactor ".concat(r.target, " \u2014 phase ").concat(r.phase, " \u2014 ").concat(done, "/").concat(r.steps.length, " \u00E9tape(s) faites").concat(r.isPlanOnly ? ' (plan seul)' : '');
}
var KNIP_LABEL = {
    detected: 'installé',
    missing: 'non installé (npm install -D knip, puis npx knip init)',
    none: 'sans objet (pas de package.json)',
};
var TEST_COLOR = {
    OK: 'success',
    échec: 'error',
    'non exécutés': undefined,
};
var register = function (on) {
    // Tour du modèle lancé pendant un refactor, avec la phase d'alors : sa fin sans rapport arrête
    // cette phase-là seulement (un plan validé pendant le tour d'analyse n'est pas mis en pause).
    var watched = null;
    on('session.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.update)($, cwd, function () { return e.cwd; })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, $.command.register({
                            name: 'refactor',
                            description: 'Refactorisation guidée : plan validé avant toute modification, puis étape par étape avec tests',
                            argumentHint: '<chemin> [objectif] [--plan-only] | go | stop | statut',
                        })];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, $.tool.register({
                            name: 'plan',
                            description: 'Enregistre le plan de refactorisation demandé par /refactor (étapes classées, fichiers, risque, tests). À appeler une fois l’analyse faite, avant toute modification.',
                            inputSchema: PLAN_SCHEMA,
                            isDeferred: false,
                        })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, $.tool.register({
                            name: 'step',
                            description: 'Rend compte d’une étape de refactor appliquée (statut et tests). Répond avec la suite à faire.',
                            inputSchema: STEP_SCHEMA,
                            isDeferred: false,
                        })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('command.run', { command: 'refactor' }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var cmd, _a, _b, _c, _d, current, base, targetAbs, fresh;
        var _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    cmd = (0, plan_1.parseCommand)(e.args);
                    if (!(cmd.kind === 'help')) return [3 /*break*/, 2];
                    _e = {};
                    _b = (_a = "".concat(HELP, "\n\n")).concat;
                    _c = statusText;
                    return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1: return [2 /*return*/, (_e.text = _b.apply(_a, [_c.apply(void 0, [_l.sent()])]), _e)];
                case 2:
                    if (!(cmd.kind === 'status')) return [3 /*break*/, 4];
                    _f = {};
                    _d = statusText;
                    return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 3: return [2 /*return*/, (_f.text = _d.apply(void 0, [_l.sent()]), _f)];
                case 4:
                    if (!(cmd.kind === 'go')) return [3 /*break*/, 6];
                    _g = {};
                    return [4 /*yield*/, approve($)];
                case 5: return [2 /*return*/, (_g.text = _l.sent(), _g)];
                case 6:
                    if (!(cmd.kind === 'skip')) return [3 /*break*/, 8];
                    _h = {};
                    return [4 /*yield*/, skip($)];
                case 7: return [2 /*return*/, (_h.text = _l.sent(), _h)];
                case 8:
                    if (!(cmd.kind === 'stop')) return [3 /*break*/, 10];
                    _j = {};
                    return [4 /*yield*/, cancel($)];
                case 9: return [2 /*return*/, (_j.text = _l.sent(), _j)];
                case 10: return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 11:
                    current = _l.sent();
                    if ((0, plan_1.isGuarded)(current) && current.phase !== 'planned') {
                        return [2 /*return*/, { text: "Un refactor est d\u00E9j\u00E0 en cours sur ".concat(current.target, " (phase ").concat(current.phase, "). /refactor stop d'abord.") }];
                    }
                    return [4 /*yield*/, (0, claude_code_1.read)($, cwd)];
                case 12:
                    base = _l.sent();
                    targetAbs = (0, plan_1.resolvePath)(base, cmd.target);
                    return [4 /*yield*/, $.fs.exists(targetAbs)];
                case 13:
                    if (!(_l.sent()))
                        return [2 /*return*/, { text: "Introuvable : ".concat(cmd.target) }];
                    if ((0, plan_1.isForbiddenFile)(targetAbs))
                        return [2 /*return*/, { text: "".concat(cmd.target, " est un fichier sensible : refactor ne le touche pas.") }];
                    _k = {
                        target: cmd.target,
                        targetAbs: targetAbs,
                        goal: cmd.goal,
                        isPlanOnly: cmd.isPlanOnly,
                        phase: 'analysing',
                        steps: [],
                        current: -1,
                        hasTests: null,
                        testCommand: null,
                        issues: []
                    };
                    return [4 /*yield*/, detectKnip($, base)];
                case 14:
                    fresh = (_k.knipStatus = _l.sent(),
                        _k.knip = [],
                        _k.modified = [],
                        _k);
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function () { return fresh; })];
                case 15:
                    _l.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, isBandHidden, function () { return false; })];
                case 16:
                    _l.sent();
                    void $.ui.open({ id: PANE, title: "Refactor \u2014 ".concat(cmd.target) });
                    submitSoon($, (0, plan_1.analysisPrompt)(fresh));
                    return [2 /*return*/, {
                            text: "refactor : analyse de ".concat(cmd.target, " lanc\u00E9e").concat(cmd.isPlanOnly ? ' (plan seul)' : '', ". Objectif : ").concat(cmd.goal || plan_1.DEFAULT_GOAL, ". Aucun fichier ne sera modifi\u00E9 avant ta validation."),
                        }];
            }
        });
    }); });
    on('tool.call', { tool: 'mcp__refactor__plan' }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var current, plan, next;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    current = _a.sent();
                    if (current === null || current.phase !== 'analysing') {
                        return [2 /*return*/, { result: 'Aucune analyse /refactor en attente de plan : rien enregistré.' }];
                    }
                    plan = (0, plan_1.parsePlan)(e);
                    if (typeof plan === 'string')
                        return [2 /*return*/, { result: "Plan refus\u00E9 : ".concat(plan, ". Corrige et rappelle mcp__refactor__plan.") }];
                    next = __assign(__assign(__assign({}, current), plan), { phase: current.isPlanOnly ? 'planned' : 'awaiting' });
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function () { return next; })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { result: (0, plan_1.planReply)(next) }];
            }
        });
    }); });
    on('tool.call', { tool: 'mcp__refactor__step' }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var current, report, index, status, steps, paused_1, advanced;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    current = _a.sent();
                    if (current === null || current.phase !== 'applying') {
                        return [2 /*return*/, { result: 'Aucune étape de refactor en cours : arrête-toi et attends l’utilisateur.' }];
                    }
                    report = (0, plan_1.parseStepReport)(e);
                    if (typeof report === 'string')
                        return [2 /*return*/, { result: "Rapport refus\u00E9 : ".concat(report, ".") }];
                    index = report.step - 1;
                    if (index !== current.current) {
                        return [2 /*return*/, { result: "L\u2019\u00E9tape en cours est la ".concat(current.current + 1, ", pas la ").concat(report.step, ". Termine-la d\u2019abord.") }];
                    }
                    status = (0, plan_1.statusOf)(report);
                    steps = current.steps.map(function (s, i) { return (i === index ? __assign(__assign({}, s), { status: status, testState: report.tests }) : s); });
                    if (!(status !== 'done')) return [3 /*break*/, 3];
                    paused_1 = __assign(__assign({}, current), { steps: steps, phase: 'paused' });
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function () { return paused_1; })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { result: (0, plan_1.pausedReply)(paused_1, index) }];
                case 3:
                    advanced = enter(current, steps, index + 1);
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function () { return advanced; })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { result: "\u00C9tape ".concat(report.step, " valid\u00E9e (tests : ").concat(report.tests, ").\n\n").concat(replyFor(advanced)) }];
            }
        });
    }); });
    on('tool.call', { tool: 'Edit' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var refused, ran;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, writeDenial($, e.file_path, e.new_string)];
                case 1:
                    refused = _a.sent();
                    if (refused)
                        return [2 /*return*/, refused];
                    return [4 /*yield*/, next(e)];
                case 2:
                    ran = _a.sent();
                    if (!(ran.deny === undefined && ran.isError !== true)) return [3 /*break*/, 4];
                    return [4 /*yield*/, noteModified($, e.file_path)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/, ran];
            }
        });
    }); }).catch(function ($, e, next) { return (next.called ? next(e) : deny('la vérification a échoué, écriture refusée')); });
    on('tool.call', { tool: 'Write' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var refused, ran;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, writeDenial($, e.file_path, e.content)];
                case 1:
                    refused = _a.sent();
                    if (refused)
                        return [2 /*return*/, refused];
                    return [4 /*yield*/, next(e)];
                case 2:
                    ran = _a.sent();
                    if (!(ran.deny === undefined && ran.isError !== true)) return [3 /*break*/, 4];
                    return [4 /*yield*/, noteModified($, e.file_path)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/, ran];
            }
        });
    }); }).catch(function ($, e, next) { return (next.called ? next(e) : deny('la vérification a échoué, écriture refusée')); });
    on('tool.call', { tool: 'NotebookEdit' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var refused, ran;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, writeDenial($, e.notebook_path, e.new_source)];
                case 1:
                    refused = _a.sent();
                    if (refused)
                        return [2 /*return*/, refused];
                    return [4 /*yield*/, next(e)];
                case 2:
                    ran = _a.sent();
                    if (!(ran.deny === undefined && ran.isError !== true)) return [3 /*break*/, 4];
                    return [4 /*yield*/, noteModified($, e.notebook_path)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/, ran];
            }
        });
    }); }).catch(function ($, e, next) { return (next.called ? next(e) : deny('la vérification a échoué, écriture refusée')); });
    on('tool.call', { tool: 'Bash' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var refused;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, shellDenial($, e.command)];
                case 1:
                    refused = _a.sent();
                    return [2 /*return*/, refused !== null && refused !== void 0 ? refused : next(e)];
            }
        });
    }); }).catch(function ($, e, next) { return (next.called ? next(e) : deny('la vérification a échoué, commande refusée')); });
    on('tool.call', { tool: 'PowerShell' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var refused;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, shellDenial($, e.command)];
                case 1:
                    refused = _a.sent();
                    return [2 /*return*/, refused !== null && refused !== void 0 ? refused : next(e)];
            }
        });
    }); }).catch(function ($, e, next) { return (next.called ? next(e) : deny('la vérification a échoué, commande refusée')); });
    on('turn.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var current;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    current = _a.sent();
                    if (e.agentId === undefined && (0, plan_1.isGuarded)(current))
                        watched = { turnId: e.turnId, phase: current.phase };
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('turn.complete', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var startedIn_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(e.agentId === undefined && e.turnId === (watched === null || watched === void 0 ? void 0 : watched.turnId))) return [3 /*break*/, 2];
                    startedIn_1 = watched.phase;
                    watched = null;
                    return [4 /*yield*/, (0, claude_code_1.update)($, run, function (r) {
                            if (r === null)
                                return r;
                            if (r.phase === 'analysing' && startedIn_1 === 'analysing')
                                return __assign(__assign({}, r), { phase: 'failed' });
                            if (r.phase === 'applying' && startedIn_1 === 'applying')
                                return __assign(__assign({}, r), { phase: 'paused' });
                            // Plan seul livré : la garde s'arrête avec le tour qui l'a présenté.
                            if (r.phase === 'planned')
                                return __assign(__assign({}, r), { phase: 'done' });
                            return r;
                        })];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('ui.render', { component: 'AbovePrompt' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var below, r, _a, _b, Box, Button, Text, n, step, close, pane, mine, done;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, next(e)];
                case 1:
                    below = _d.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 2:
                    r = _d.sent();
                    _a = e.props.hasSurvey || r === null || r.phase === 'cancelled';
                    if (_a) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, claude_code_1.read)($, isBandHidden)];
                case 3:
                    _a = (_d.sent());
                    _d.label = 4;
                case 4:
                    if (_a)
                        return [2 /*return*/, below];
                    _b = $.ui.resolve(e), Box = _b.Box, Button = _b.Button, Text = _b.Text;
                    n = r.steps.length;
                    step = r.steps[r.current];
                    close = (<Button key="refactor-close" label="×" plain dimColor role="dismiss" onPress={function () { return (0, claude_code_1.update)($, isBandHidden, function () { return true; }); }}/>);
                    pane = (<Button key="refactor-pane" label="Plan" plain dimColor onPress={function () { return $.ui.open({ id: PANE, title: "Refactor \u2014 ".concat(r.target) }); }}/>);
                    if (r.phase === 'analysing') {
                        mine = <Text key="refactor" dimColor>refactor › Analyse — {r.target}{r.isPlanOnly ? ' (plan seul)' : ''}…</Text>;
                    }
                    else if (r.phase === 'awaiting') {
                        mine = (<Box key="refactor" flexDirection="column">
          <Box flexDirection="row">
            <Text color="warning">refactor › Analyse — plan prêt : {n} étape(s), en attente de validation </Text>
            <Button key="refactor-go" label="Valider le plan" variant="primary" onPress={function () { return approve($); }}/>
            <Button key="refactor-stop" label="Annuler" onPress={function () { return cancel($); }}/>
            {pane}
          </Box>
          {r.hasTests === false && (<Text color="error">  ⚠ aucun test détecté : commence par des tests de caractérisation</Text>)}
        </Box>);
                    }
                    else if (r.phase === 'applying' && step) {
                        mine = (<Box key="refactor" flexDirection="row">
          <Text>refactor › Application — Refactor {r.current + 1}/{n} — {step.title} · </Text>
          <Text color={plan_1.RISK_COLOR[step.risk]}>risque {step.risk}</Text>
          <Text> · tests : </Text>
          <Text color={TEST_COLOR[step.testState]} dimColor={step.testState === 'non exécutés'}>{step.testState}</Text>
          <Text> </Text>
          {pane}
        </Box>);
                    }
                    else if (r.phase === 'confirming' && step) {
                        mine = (<Box key="refactor" flexDirection="row">
          <Text color="warning">refactor › Confirmation requise — Refactor {r.current + 1}/{n} — supprimer {(0, plan_1.cleanupLabel)(step)} · </Text>
          <Text color={plan_1.RISK_COLOR[step.risk]}>risque {step.risk} </Text>
          <Button key="refactor-go" label="Confirmer" variant="primary" onPress={function () { return approve($); }}/>
          <Button key="refactor-skip" label="Passer" onPress={function () { return skip($); }}/>
          <Button key="refactor-stop" label="Arrêter" onPress={function () { return cancel($); }}/>
          {pane}
        </Box>);
                    }
                    else if (r.phase === 'paused') {
                        mine = (<Box key="refactor" flexDirection="row">
          <Text color="error">
            refactor › En pause — étape {r.current + 1}/{n} {step ? "\u00AB ".concat(step.title, " \u00BB") : ''} · tests : {(_c = step === null || step === void 0 ? void 0 : step.testState) !== null && _c !== void 0 ? _c : '—'}{' '}
          </Text>
          <Button key="refactor-go" label="Reprendre" onPress={function () { return approve($); }}/>
          <Button key="refactor-stop" label="Arrêter" onPress={function () { return cancel($); }}/>
          {pane}
        </Box>);
                    }
                    else if (r.phase === 'planned' || (r.phase === 'done' && r.isPlanOnly)) {
                        mine = (<Box key="refactor" flexDirection="row">
          <Text color="success">refactor › Plan seul : {n} étape(s) générée(s), aucun fichier modifié </Text>
          {pane}
          {close}
        </Box>);
                    }
                    else if (r.phase === 'done') {
                        done = r.steps.filter(function (s) { return s.status === 'done'; }).length;
                        mine = (<Box key="refactor" flexDirection="row">
          <Text color="success">refactor › Terminé : {done}/{n} étape(s), {r.modified.length} fichier(s) modifié(s) — à relire avant commit </Text>
          {pane}
          {close}
        </Box>);
                    }
                    else {
                        mine = (<Box key="refactor" flexDirection="row">
          <Text color="error">refactor › Aucun plan reçu pour {r.target} : relance /refactor </Text>
          {close}
        </Box>);
                    }
                    // Les bandes des autres mods restent dessinées dessous.
                    return [2 /*return*/, (<Box flexDirection="column">
        {mine}
        {below}
      </Box>)];
            }
        });
    }); });
    on('ui.render', { component: 'Pane', requestId: PANE }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var _a, Box, Text, r, itemsOf, unplaced;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = $.ui.resolve(e), Box = _a.Box, Text = _a.Text;
                    return [4 /*yield*/, (0, claude_code_1.read)($, run)];
                case 1:
                    r = _b.sent();
                    if (r === null)
                        return [2 /*return*/, <Text dimColor>Aucun refactor. Lance /refactor &lt;chemin&gt;.</Text>];
                    itemsOf = function (s) { return r.knip.filter(function (k) { return s.knip.some(function (ref) { return (0, plan_1.knipMatches)([k], ref).length > 0; }); }); };
                    unplaced = r.knip.filter(function (k) { return !r.steps.some(function (s) { return itemsOf(s).includes(k); }); });
                    return [2 /*return*/, (<Box flexDirection="column">
        <Text bold>{r.target}</Text>
        <Text dimColor>
          {r.isPlanOnly ? 'Plan seul' : 'Plan + application'} · phase {r.phase} · tests{' '}
          {r.hasTests === null ? '?' : r.hasTests ? "d\u00E9tect\u00E9s".concat(r.testCommand ? " (".concat(r.testCommand, ")") : '') : 'absents'}
        </Text>
        <Text dimColor>Knip : {KNIP_LABEL[r.knipStatus]}{r.knip.length > 0 ? " \u00B7 ".concat(r.knip.length, " r\u00E9sultat(s)") : ''}</Text>
        {r.issues.length > 0 && <Text dimColor>{r.issues.length} problème(s) repéré(s)</Text>}
        {r.steps.length === 0 && <Text dimColor>Analyse en cours…</Text>}
        {r.steps.map(function (s, i) { return (<Box key={"step-".concat(i)} flexDirection="column">
            <Box flexDirection="row">
              <Text bold={i === r.current}>
                {i + 1}. {s.title}{' '}
              </Text>
              <Text color={plan_1.RISK_COLOR[s.risk]}>[{s.risk}] </Text>
              <Text dimColor={s.status === 'todo'} color={s.status === 'failed' ? 'error' : s.status === 'done' ? 'success' : undefined}>
                {plan_1.STATUS_LABEL[s.status]}
                {s.kind !== 'refactor' && s.status === 'todo' && !s.isConfirmed ? ' (confirmation requise)' : ''}
              </Text>
              {s.status !== 'todo' && <Text dimColor> · tests : {s.testState}</Text>}
            </Box>
            {s.files.length > 0 && <Text dimColor>{'   '}{s.files.join(', ')}</Text>}
            {itemsOf(s).map(function (k, j) { return (<Text key={"knip-".concat(i, "-").concat(j)} color={plan_1.RISK_COLOR[k.risk]}>
                  {'   '}knip · {k.kind} {k.name}
                  {k.file && k.file !== k.name ? " (".concat(k.file, ")") : ''} — {k.risk}
                </Text>); })}
          </Box>); })}
        {unplaced.length > 0 && <Text bold>À analyser (Knip, non traités)</Text>}
        {unplaced.map(function (k, j) { return (<Text key={"knip-rest-".concat(j)} color={plan_1.RISK_COLOR[k.risk]}>
            {'   '}{k.kind} {k.name} — {k.risk}{k.reason ? " : ".concat(k.reason) : ''}
          </Text>); })}
      </Box>)];
            }
        });
    }); });
};
exports.register = register;
