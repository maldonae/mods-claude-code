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
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = void 0;
var claude_code_1 = require("claude-code");
var guard_1 = require("./guard");
var rewrite_1 = require("./rewrite");
var isEnabled = (0, claude_code_1.atom)({ plugin: 'pen', key: 'isEnabled' }, true);
var phase = (0, claude_code_1.atom)({ plugin: 'pen', key: 'phase' }, 'idle');
// Le choix de /pen survit aux sessions, comme celui de /fil.
var STORE_ENABLED = 'enabled';
function improve($) {
    return __awaiter(this, void 0, void 0, function () {
        var box, check, visible, injected, r, reply, verdict, text, filled, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, phase)];
                case 1:
                    if ((_b.sent()) === 'busy')
                        return [2 /*return*/];
                    return [4 /*yield*/, $.prompt.read()];
                case 2:
                    box = _b.sent();
                    check = (0, rewrite_1.checkDraft)(box.text);
                    if (!check.ok) {
                        $.ui.toast(check.reason === 'empty'
                            ? 'pen : écris d’abord une demande dans le champ.'
                            : "pen : brouillon trop long (plus de ".concat(rewrite_1.MAX_DRAFT, " caract\u00E8res)."));
                        return [2 /*return*/];
                    }
                    visible = (0, guard_1.stripInvisible)(check.draft);
                    injected = (0, guard_1.findInjection)(visible.text);
                    if (injected !== undefined) {
                        $.ui.toast("pen : le brouillon contient une consigne suspecte (\u00AB ".concat(injected, " \u00BB), r\u00E9\u00E9criture refus\u00E9e."));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, (0, claude_code_1.update)($, phase, function () { return 'busy'; })];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    _b.trys.push([4, 8, 9, 11]);
                    return [4 /*yield*/, $.model.complete({
                            model: 'sonnet',
                            system: rewrite_1.SYSTEM,
                            prompt: (0, rewrite_1.buildPrompt)(visible.text),
                            maxTokens: 2000,
                            effort: 'low',
                            timeoutMs: 45000,
                        })];
                case 5:
                    r = _b.sent();
                    reply = r.isAnswered ? (0, rewrite_1.cleanReply)(r.text) : '';
                    if (reply === '') {
                        $.ui.toast('pen : réécriture impossible, brouillon inchangé.');
                        return [2 /*return*/];
                    }
                    verdict = (0, guard_1.guardRewrite)(visible.text, reply);
                    if (!verdict.ok) {
                        $.ui.toast("pen : r\u00E9\u00E9criture rejet\u00E9e (".concat(verdict.reason, "), brouillon inchang\u00E9."));
                        return [2 /*return*/];
                    }
                    text = verdict.text;
                    return [4 /*yield*/, $.prompt.read()];
                case 6:
                    // Pendant l'appel, l'utilisateur a pu continuer à taper : on n'écrase pas son texte.
                    if ((_b.sent()).text !== check.draft) {
                        $.ui.toast('pen : le champ a changé pendant la réécriture, brouillon gardé.');
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, $.prompt.fill({ text: text, mode: 'replace' })];
                case 7:
                    filled = _b.sent();
                    if (!filled.isFilled)
                        $.ui.toast('pen : champ de saisie indisponible');
                    else if (visible.removed > 0)
                        $.ui.toast("pen : ".concat(visible.removed, " caract\u00E8re(s) invisible(s) retir\u00E9(s) du brouillon."));
                    return [3 /*break*/, 11];
                case 8:
                    _a = _b.sent();
                    $.ui.toast('pen : réécriture impossible, brouillon inchangé.');
                    return [3 /*break*/, 11];
                case 9: return [4 /*yield*/, (0, claude_code_1.update)($, phase, function () { return 'idle'; })];
                case 10:
                    _b.sent();
                    return [7 /*endfinally*/];
                case 11: return [2 /*return*/];
            }
        });
    });
}
var register = function (on) {
    on('session.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var stored;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, $.command.register({
                        name: 'pen',
                        description: 'Active ou désactive le bouton « Améliorer le prompt »',
                    })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, $.store.get(STORE_ENABLED)];
                case 2:
                    stored = _a.sent();
                    if (!(typeof stored === 'boolean')) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, claude_code_1.update)($, isEnabled, function () { return stored; })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('command.run', { command: 'pen' }, function ($) { return __awaiter(void 0, void 0, void 0, function () {
        var now;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.update)($, isEnabled, function (v) { return !v; })];
                case 1:
                    now = _a.sent();
                    return [4 /*yield*/, $.store.set(STORE_ENABLED, now)];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { text: now ? 'pen activé : bouton « Améliorer le prompt » affiché.' : 'pen désactivé.' }];
            }
        });
    }); });
    on('ui.render', { component: 'AbovePrompt' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var below, _a, _b, Box, Button, Text, mine;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, next(e)];
                case 1:
                    below = _c.sent();
                    _a = e.props.hasSurvey;
                    if (_a) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, claude_code_1.read)($, isEnabled)];
                case 2:
                    _a = !(_c.sent());
                    _c.label = 3;
                case 3:
                    if (_a)
                        return [2 /*return*/, below];
                    _b = $.ui.resolve(e), Box = _b.Box, Button = _b.Button, Text = _b.Text;
                    return [4 /*yield*/, (0, claude_code_1.read)($, phase)];
                case 4:
                    mine = (_c.sent()) === 'busy' ? (<Text key="pen" dimColor>pen › réécriture du prompt…</Text>) : (<Box key="pen" flexDirection="row">
          <Text dimColor>pen › </Text>
          <Button key="pen-go" label="Améliorer le prompt" onPress={function () { return improve($); }}/>
        </Box>);
                    // Les bandes des autres mods (cap, jauge, fil) restent dessinées sous pen.
                    return [2 /*return*/, (<Box flexDirection="column">
        {mine}
        {below}
      </Box>)];
            }
        });
    }); });
};
exports.register = register;
