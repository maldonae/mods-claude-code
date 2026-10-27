"use strict";
// Garde-fous déterministes contre l'injection de prompt : un mod ne doit jamais fabriquer
// ni relayer une consigne cachée ou ajoutée. La consigne du modèle ne suffit pas, le code vérifie.
// Copie IDENTIQUE dans cap, pen et relay (un mod ne peut pas importer hors de son dossier) :
// modifier les trois, `node scripts/check-guard.mjs` vérifie qu'elles sont égales.
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
exports.guardRewrite = exports.maskSecrets = exports.findUnseen = exports.isRisky = exports.findInjection = exports.stripInvisible = void 0;
// Zéro-largeur, contrôles bidi, tags Unicode (« ASCII smuggling »), BOM, trait d'union
// conditionnel, contrôles C0/C1 sauf saut de ligne et tabulation : invisibles à l'écran.
var INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|\uDB40[\uDC00-\uDC7F]/g;
var stripInvisible = function (text) {
    var removed = 0;
    var clean = text.replace(INVISIBLE, function () {
        removed += 1;
        return '';
    });
    return { text: clean, removed: removed };
};
exports.stripInvisible = stripInvisible;
// Formulations typiques d'une injection.
var INJECTION = [
    /\b(ignore|oublie|disregard|forget)\b[^\n]{0,40}\b(instructions?|consignes?|règles|rules|prompts?)\b/i,
    /\b(system prompt|prompt système|invite système)\b/i,
    /\b(tu es|you are) (maintenant|désormais|now)\b/i,
    /\b(désactive|contourne|bypass|disable)\b[^\n]{0,30}\b(sécurité|garde-fous?|safety|guardrails?|confirmations?|permissions?)\b/i,
    /--dangerously-skip-permissions\b/i,
    /<\/?(system|assistant|instructions?)>/i,
];
var findInjection = function (text) {
    for (var _i = 0, INJECTION_1 = INJECTION; _i < INJECTION_1.length; _i++) {
        var r = INJECTION_1[_i];
        var m = r.exec(text);
        if (m)
            return m[0];
    }
    return undefined;
};
exports.findInjection = findInjection;
// Actions sensibles : tolérées si elles figurent déjà dans le texte de référence.
var RISKY = [
    /\brm\s+-[a-z]*[rf]/i,
    /\bpush\b[^\n]*(--force|\s-f\b)/i,
    /\breset\s+--hard\b/i,
    /\bclean\s+-[a-z]*f/i,
    /--no-verify\b/i,
    /\b(drop|truncate)\s+(table|database|schema)\b/i,
    /\bdelete\s+from\b/i,
    /\bchmod\s+(-R\s+)?777\b/i,
    /(^|[\s/'"`])\.env(\.[\w-]+)?\b/i,
    /\.(pem|key)\b/i,
    /\b(id_rsa|id_ed25519|\.ssh|\.aws|credentials|passwd|shadow)\b/i,
    /\b(curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)\b/i,
    /\|\s*(sh|bash|zsh|pwsh|powershell|iex)\b/i,
    /\b(powershell|pwsh)\b[^\n]*\s-(e|enc|encodedcommand)\b/i,
    /\b(eval|exec)\s*\(/i,
];
var isRisky = function (text) { return RISKY.some(function (r) { return r.test(text); }); };
exports.isRisky = isRisky;
// Éléments qui font sortir des données ou pointent ailleurs : comparés un à un à la référence.
var URL = /\b(?:https?|ftp|file):\/\/[^\s<>"'`)\]]+|\bwww\.[^\s<>"'`)\]]+/gi;
var EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
var IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
// Long bloc base64 ou hexadécimal : charge encodée illisible pour l'utilisateur.
var BLOB = /[A-Za-z0-9+/=]{60,}|\b[0-9a-f]{40,}\b/gi;
// Ponctuation finale retirée par une boucle (pas de regex ancrée en fin : backtracking).
var TRAILING = new Set('.,;:!?»');
var trimEnd = function (s) {
    var end = s.length;
    while (end > 0 && TRAILING.has(s.charAt(end - 1)))
        end -= 1;
    return s.slice(0, end).toLowerCase();
};
var itemsOf = function (text, r) {
    return new Set(__spreadArray([], text.matchAll(r), true).map(function (m) { return trimEnd(m[0]); }));
};
// Ce que `text` apporte que `reference` n'avait pas : URL, e-mail, IP, bloc encodé, action sensible.
var findUnseen = function (reference, text) {
    for (var _i = 0, _a = [['URL', URL], ['adresse e-mail', EMAIL], ['adresse IP', IP], ['bloc encodé', BLOB]]; _i < _a.length; _i++) {
        var _b = _a[_i], label = _b[0], r = _b[1];
        var before = itemsOf(reference, r);
        for (var _c = 0, _d = itemsOf(text, r); _c < _d.length; _c++) {
            var item = _d[_c];
            if (!before.has(item))
                return "".concat(label, " absente du contexte");
        }
    }
    for (var _e = 0, RISKY_1 = RISKY; _e < RISKY_1.length; _e++) {
        var r = RISKY_1[_e];
        if (r.test(text) && !r.test(reference))
            return 'action sensible absente du contexte';
    }
    return undefined;
};
exports.findUnseen = findUnseen;
// Secrets reconnaissables à leur forme : jamais écrits sur disque ni copiés.
var SECRETS = [
    /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
    /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
var maskSecrets = function (text) {
    var masked = 0;
    var clean = SECRETS.reduce(function (t, r) {
        return t.replace(r, function () {
            masked += 1;
            return '[masqué]';
        });
    }, text);
    return { text: clean, masked: masked };
};
exports.maskSecrets = maskSecrets;
var MAX_GROWTH = 3;
var MIN_ROOM = 1500;
// Une réécriture n'est acceptée que si elle n'apporte rien que le brouillon n'avait pas.
var guardRewrite = function (draft, rewritten) {
    var text = (0, exports.stripInvisible)(rewritten).text;
    if (text.length > Math.max(MIN_ROOM, draft.length * MAX_GROWTH)) {
        return { ok: false, reason: 'réécriture anormalement longue' };
    }
    var unseen = (0, exports.findUnseen)(draft, text);
    if (unseen !== undefined)
        return { ok: false, reason: unseen.replace('du contexte', 'du brouillon') };
    if ((0, exports.findInjection)(text) !== undefined)
        return { ok: false, reason: 'formulation d’injection' };
    return { ok: true, text: text };
};
exports.guardRewrite = guardRewrite;
