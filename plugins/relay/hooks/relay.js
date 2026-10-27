"use strict";
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
exports.isOverThreshold = exports.finalize = exports.isComplete = exports.extractResume = exports.buildForkPrompt = exports.freePath = exports.baseName = exports.parseCommand = exports.parseThreshold = exports.SECTIONS = exports.RESUME_HEADING = exports.RELAY_DIR = exports.DEFAULT_THRESHOLD = void 0;
// Helpers purs, sans accès à `$`.
var guard_ts_1 = require("./guard.ts");
exports.DEFAULT_THRESHOLD = 50;
exports.RELAY_DIR = '.claude/relay';
exports.RESUME_HEADING = '## Prompt de reprise';
exports.SECTIONS = [
    'Objectif global',
    'Contraintes permanentes',
    'Ce qui est déjà fait',
    'État actuel',
    'Décisions importantes',
    'Prochaines étapes',
    'Blocages éventuels',
];
/** Seuil entier entre 10 et 95 %, ou undefined si illisible. */
var parseThreshold = function (raw) {
    var n = Number(raw.trim().replace(/%$/, ''));
    if (!Number.isFinite(n) || raw.trim() === '')
        return undefined;
    return Math.min(95, Math.max(10, Math.round(n)));
};
exports.parseThreshold = parseThreshold;
/** `/relay`, `/relay seuil 60`, `/relay maintenant`, `/relay statut`. */
var parseCommand = function (args) {
    var _a = args.trim().split(/\s+/), _b = _a[0], verb = _b === void 0 ? '' : _b, rest = _a.slice(1);
    switch (verb.toLowerCase()) {
        case '':
            return { kind: 'toggle' };
        case 'seuil':
        case 'threshold':
            return { kind: 'threshold', value: (0, exports.parseThreshold)(rest.join(' ')) };
        case 'maintenant':
        case 'now':
            return { kind: 'now' };
        case 'statut':
        case 'status':
            return { kind: 'status' };
        default:
            return { kind: 'help' };
    }
};
exports.parseCommand = parseCommand;
var pad = function (n) { return String(n).padStart(2, '0'); };
/** `relay-YYYY-MM-DD-HHMM`, heure locale. */
var baseName = function (ms) {
    var d = new Date(ms);
    return "relay-".concat(d.getFullYear(), "-").concat(pad(d.getMonth() + 1), "-").concat(pad(d.getDate()), "-").concat(pad(d.getHours())).concat(pad(d.getMinutes()));
};
exports.baseName = baseName;
/** Premier chemin libre : `base.md`, puis `base-2.md`, `base-3.md`… jamais un fichier existant. */
var freePath = function (base, exists) { return __awaiter(void 0, void 0, void 0, function () {
    var i, path;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                i = 1;
                _a.label = 1;
            case 1:
                if (!(i <= 99)) return [3 /*break*/, 4];
                path = "".concat(exports.RELAY_DIR, "/").concat(base).concat(i === 1 ? '' : "-".concat(i), ".md");
                return [4 /*yield*/, exists(path)];
            case 2:
                if (!(_a.sent()))
                    return [2 /*return*/, path];
                _a.label = 3;
            case 3:
                i++;
                return [3 /*break*/, 1];
            case 4: throw new Error("plus de nom libre pour ".concat(base));
        }
    });
}); };
exports.freePath = freePath;
var buildForkPrompt = function (path) {
    return __spreadArray(__spreadArray([
        'Passe le relais : la session va être reprise dans une nouvelle conversation qui ne verra rien de celle-ci.',
        "La fiche sera enregistr\u00E9e dans ".concat(path, " (dossier courant)."),
        'Rédige une fiche de reprise en markdown, en français, factuelle et concise, à partir de toute la conversation ci-dessus.',
        '',
        'Format exact, rien avant ni après :',
        '# Relais'
    ], exports.SECTIONS.map(function (s) { return "## ".concat(s); }), true), [
        exports.RESUME_HEADING,
        '',
        'Règles :',
        '- Sous chaque section : des puces courtes ; « Aucun. » si vide.',
        '- Cite les chemins de fichiers, commandes et noms exacts utiles à la reprise.',
        '- N’inclus aucun secret (clé API, token, mot de passe, contenu de .env) : écris « [masqué] » à la place.',
        "- Sous \u00AB ".concat(exports.RESUME_HEADING, " \u00BB : un seul bloc de code ```text contenant un prompt de reprise concis (10 lignes max) \u00E0 coller dans une nouvelle session ; il demande de lire ").concat(path, ", r\u00E9sume l\u2019objectif et la prochaine \u00E9tape."),
    ], false).join('\n');
};
exports.buildForkPrompt = buildForkPrompt;
/** Retire un éventuel ```markdown englobant. */
var unwrap = function (text) {
    var _a, _b;
    var t = text.trim();
    var m = /^```(?:markdown|md)?\n([\s\S]*)\n```$/.exec(t);
    return (_b = (_a = m === null || m === void 0 ? void 0 : m[1]) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : t;
};
/** Extrait le prompt de reprise du bloc de code qui suit le titre, ou le texte brut à défaut. */
var extractResume = function (doc) {
    var at = doc.indexOf(exports.RESUME_HEADING);
    if (at < 0)
        return '';
    var tail = doc.slice(at + exports.RESUME_HEADING.length);
    var open = tail.indexOf('```');
    if (open < 0)
        return tail.trim();
    var start = tail.indexOf('\n', open);
    var close = tail.indexOf('```', start + 1);
    return (close < 0 ? tail.slice(start + 1) : tail.slice(start + 1, close)).trim();
};
exports.extractResume = extractResume;
/** La fiche est utilisable si toutes les sections sont là. */
var isComplete = function (doc) {
    return exports.SECTIONS.every(function (s) { return doc.includes("## ".concat(s)); }) && doc.includes(exports.RESUME_HEADING);
};
exports.isComplete = isComplete;
/** Fiche finale, sans invisibles ni secrets ; le prompt de reprise pointe toujours vers le fichier. */
var finalize = function (reply, path) {
    var _a = (0, guard_ts_1.maskSecrets)((0, guard_ts_1.stripInvisible)(unwrap(reply)).text), doc = _a.text, masked = _a.masked;
    if (!(0, exports.isComplete)(doc))
        return undefined;
    var extracted = (0, exports.extractResume)(doc);
    var pointer = "Lis d\u2019abord ".concat(path, ".");
    var resume = extracted.includes(path) ? extracted : "".concat(pointer, "\n").concat(extracted).trim();
    return { doc: "".concat(doc, "\n"), resume: resume, masked: masked, suspect: (0, guard_ts_1.findInjection)(doc) };
};
exports.finalize = finalize;
var isOverThreshold = function (percent, threshold) {
    return percent !== null && percent >= threshold;
};
exports.isOverThreshold = isOverThreshold;
