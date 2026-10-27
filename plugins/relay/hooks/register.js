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
var relay_1 = require("./relay");
var isEnabled = (0, claude_code_1.atom)({ plugin: 'relay', key: 'isEnabled' }, true);
var threshold = (0, claude_code_1.atom)({ plugin: 'relay', key: 'threshold' }, relay_1.DEFAULT_THRESHOLD);
var contextPercent = (0, claude_code_1.atom)({ plugin: 'relay', key: 'contextPercent' }, null);
var phase = (0, claude_code_1.atom)({ plugin: 'relay', key: 'phase' }, 'idle');
var isSnoozed = (0, claude_code_1.atom)({ plugin: 'relay', key: 'isSnoozed' }, false);
var outcome = (0, claude_code_1.atom)({ plugin: 'relay', key: 'outcome' }, null);
var error = (0, claude_code_1.atom)({ plugin: 'relay', key: 'error' }, null);
var HELP = [
    '/relay — active ou désactive le mod',
    '/relay seuil 60 — seuil de contexte (10–95 %, défaut 50)',
    '/relay maintenant — passer le relais tout de suite (avec confirmation)',
    '/relay statut — état actuel',
].join('\n');
function setPercent($, percent) {
    return __awaiter(this, void 0, void 0, function () {
        var before, limit, crossed, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (percent === null)
                        return [2 /*return*/];
                    return [4 /*yield*/, (0, claude_code_1.read)($, contextPercent)];
                case 1:
                    before = _c.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, contextPercent, function () { return percent; })];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, threshold)];
                case 3:
                    limit = _c.sent();
                    crossed = !(0, relay_1.isOverThreshold)(before, limit) && (0, relay_1.isOverThreshold)(percent, limit);
                    _b = crossed;
                    if (!_b) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, claude_code_1.read)($, isEnabled)];
                case 4:
                    _b = (_c.sent());
                    _c.label = 5;
                case 5:
                    _a = _b;
                    if (!_a) return [3 /*break*/, 7];
                    return [4 /*yield*/, (0, claude_code_1.read)($, isSnoozed)];
                case 6:
                    _a = !(_c.sent());
                    _c.label = 7;
                case 7:
                    if (_a) {
                        $.ui.toast("relay : contexte \u00E0 ".concat(percent, " % (seuil ").concat(limit, " %) \u2014 pensez \u00E0 passer le relais"));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function fail($, message) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.update)($, error, function () { return message; })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, phase, function () { return 'failed'; })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Claude rédige la fiche sur une copie de la conversation (sans outils) ; le mod l'écrit
// dans un fichier neuf, jamais par-dessus un fichier existant.
function runRelay($, surface) {
    return __awaiter(this, void 0, void 0, function () {
        var exists, base, _a, path_1, reply, why, sheet_1, isCopyable_1, note, copied, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.update)($, phase, function () { return 'writing'; })];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, error, function () { return null; })];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 19, , 21]);
                    exists = function (p) { return $.fs.exists(p); };
                    _a = relay_1.baseName;
                    return [4 /*yield*/, $.clock.now()];
                case 4:
                    base = _a.apply(void 0, [_b.sent()]);
                    return [4 /*yield*/, (0, relay_1.freePath)(base, exists)];
                case 5:
                    path_1 = _b.sent();
                    return [4 /*yield*/, $.model.fork({ prompt: (0, relay_1.buildForkPrompt)(path_1) })];
                case 6:
                    reply = _b.sent();
                    if (!!reply.isAnswered) return [3 /*break*/, 8];
                    why = reply.reason === 'nothing-to-fork' ? 'aucun tour terminé à résumer' : "Claude n\u2019a pas r\u00E9pondu (".concat(reply.reason, ")");
                    return [4 /*yield*/, fail($, why)];
                case 7:
                    _b.sent();
                    return [2 /*return*/];
                case 8: return [4 /*yield*/, exists(path_1)];
                case 9:
                    if (!_b.sent()) return [3 /*break*/, 11];
                    return [4 /*yield*/, (0, relay_1.freePath)(base, exists)];
                case 10:
                    path_1 = _b.sent();
                    _b.label = 11;
                case 11:
                    sheet_1 = (0, relay_1.finalize)(reply.text, path_1);
                    if (!!sheet_1) return [3 /*break*/, 13];
                    return [4 /*yield*/, fail($, 'fiche incomplète, sections manquantes')];
                case 12:
                    _b.sent();
                    return [2 /*return*/];
                case 13: return [4 /*yield*/, $.fs.write(path_1, sheet_1.doc)
                    // Une fiche suspecte est écrite pour être relue, mais son prompt n'est pas proposé à coller.
                ];
                case 14:
                    _b.sent();
                    isCopyable_1 = sheet_1.suspect === undefined;
                    return [4 /*yield*/, (0, claude_code_1.update)($, outcome, function () { return ({ path: path_1, resume: isCopyable_1 ? sheet_1.resume : '' }); })];
                case 15:
                    _b.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, phase, function () { return 'done'; })];
                case 16:
                    _b.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, isSnoozed, function () { return true; })];
                case 17:
                    _b.sent();
                    note = sheet_1.masked > 0 ? "\n".concat(sheet_1.masked, " secret(s) remplac\u00E9(s) par [masqu\u00E9].") : '';
                    if (!isCopyable_1) {
                        $.ui.toast('relay : formulation suspecte dans la fiche, prompt non copié');
                        $.ui.log("relay \u203A fiche \u00E9crite : ".concat(path_1).concat(note, "\n\u26A0 formulation suspecte (\u00AB ").concat(sheet_1.suspect, " \u00BB) : ") +
                            'prompt de reprise non copié. Relis la fiche avant de la donner à une nouvelle session.');
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, $.ui.copy({ text: sheet_1.resume, surface: surface })];
                case 18:
                    copied = _b.sent();
                    $.ui.log("relay \u203A fiche \u00E9crite : ".concat(path_1).concat(copied.isCopied ? ' (prompt copié)' : '').concat(note, "\n\n").concat(sheet_1.resume));
                    return [3 /*break*/, 21];
                case 19:
                    err_1 = _b.sent();
                    return [4 /*yield*/, fail($, err_1 instanceof Error ? err_1.message : String(err_1))];
                case 20:
                    _b.sent();
                    return [3 /*break*/, 21];
                case 21: return [2 /*return*/];
            }
        });
    });
}
function statusText($) {
    return __awaiter(this, void 0, void 0, function () {
        var on, limit, percent, last;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, isEnabled)];
                case 1:
                    on = _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, threshold)];
                case 2:
                    limit = _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, contextPercent)];
                case 3:
                    percent = _a.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, outcome)];
                case 4:
                    last = _a.sent();
                    return [2 /*return*/, [
                            "relay ".concat(on ? 'activé' : 'désactivé', " \u00B7 seuil ").concat(limit, " % \u00B7 contexte ").concat(percent === null ? '—' : "".concat(percent, " %")),
                            last ? "Derni\u00E8re fiche : ".concat(last.path) : 'Aucune fiche dans cette session.',
                        ].join('\n')];
            }
        });
    });
}
var register = function (on) {
    on('session.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var stored, limit, _a, _b, _c;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, $.command.register({
                        name: 'relay',
                        description: 'Passer le relais : active/désactive, seuil N, maintenant, statut',
                        argumentHint: '[seuil N | maintenant | statut]',
                    })];
                case 1:
                    _e.sent();
                    return [4 /*yield*/, $.store.get('threshold')];
                case 2:
                    stored = _e.sent();
                    limit = typeof stored === 'number' ? (0, relay_1.parseThreshold)(String(stored)) : undefined;
                    if (!(limit !== undefined)) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, claude_code_1.update)($, threshold, function () { return limit; })];
                case 3:
                    _e.sent();
                    _e.label = 4;
                case 4:
                    _e.trys.push([4, 7, , 8]);
                    _a = setPercent;
                    _b = [$];
                    return [4 /*yield*/, $.session.usage()];
                case 5: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_d = (_e.sent()).context.percent) !== null && _d !== void 0 ? _d : null]))];
                case 6:
                    _e.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _c = _e.sent();
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('command.run', { command: 'relay' }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var cmd, _a, now, value_1;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    cmd = (0, relay_1.parseCommand)(e.args);
                    _a = cmd.kind;
                    switch (_a) {
                        case 'toggle': return [3 /*break*/, 1];
                        case 'threshold': return [3 /*break*/, 5];
                        case 'now': return [3 /*break*/, 9];
                        case 'status': return [3 /*break*/, 12];
                        case 'help': return [3 /*break*/, 14];
                    }
                    return [3 /*break*/, 15];
                case 1: return [4 /*yield*/, (0, claude_code_1.update)($, isEnabled, function (v) { return !v; })];
                case 2:
                    now = _c.sent();
                    if (!!now) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, claude_code_1.update)($, phase, function () { return 'idle'; })];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/, { text: now ? 'relay activé.' : 'relay désactivé.' }];
                case 5:
                    if (cmd.value === undefined)
                        return [2 /*return*/, { text: 'Seuil illisible. Exemple : /relay seuil 60' }];
                    value_1 = cmd.value;
                    return [4 /*yield*/, (0, claude_code_1.update)($, threshold, function () { return value_1; })];
                case 6:
                    _c.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, isSnoozed, function () { return false; })];
                case 7:
                    _c.sent();
                    return [4 /*yield*/, $.store.set('threshold', value_1)];
                case 8:
                    _c.sent();
                    return [2 /*return*/, { text: "Seuil de relais : ".concat(value_1, " % (enregistr\u00E9).") }];
                case 9: return [4 /*yield*/, (0, claude_code_1.update)($, isEnabled, function () { return true; })];
                case 10:
                    _c.sent();
                    return [4 /*yield*/, (0, claude_code_1.update)($, phase, function () { return 'confirm'; })];
                case 11:
                    _c.sent();
                    return [2 /*return*/, { text: 'Confirmez au-dessus du prompt pour passer le relais.' }];
                case 12:
                    _b = {};
                    return [4 /*yield*/, statusText($)];
                case 13: return [2 /*return*/, (_b.text = _c.sent(), _b)];
                case 14: return [2 /*return*/, { text: HELP }];
                case 15: return [2 /*return*/];
            }
        });
    }); });
    // Poussé par le moteur après chaque tour et quand le contexte bouge d'un point.
    on('session.measure', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, setPercent($, (_a = e.context.percent) !== null && _a !== void 0 ? _a : null)];
                case 1:
                    _b.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('ui.render', { component: 'AbovePrompt' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var below, _a, _b, Box, Button, Text, current, limit, percent, surface, toIdle, ask, close, mine, last_1, why, _c;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, next(e)];
                case 1:
                    below = _e.sent();
                    _a = e.props.hasSurvey;
                    if (_a) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, claude_code_1.read)($, isEnabled)];
                case 2:
                    _a = !(_e.sent());
                    _e.label = 3;
                case 3:
                    if (_a)
                        return [2 /*return*/, below];
                    _b = $.ui.resolve(e), Box = _b.Box, Button = _b.Button, Text = _b.Text;
                    return [4 /*yield*/, (0, claude_code_1.read)($, phase)];
                case 4:
                    current = _e.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, threshold)];
                case 5:
                    limit = _e.sent();
                    return [4 /*yield*/, (0, claude_code_1.read)($, contextPercent)];
                case 6:
                    percent = _e.sent();
                    surface = e.surface;
                    toIdle = function () { return (0, claude_code_1.update)($, phase, function () { return 'idle'; }); };
                    ask = function () { return (0, claude_code_1.update)($, phase, function () { return 'confirm'; }); };
                    close = (<Button key="relay-close" label="×" plain dimColor role="dismiss" onPress={toIdle}/>);
                    if (!(current === 'confirm')) return [3 /*break*/, 7];
                    mine = (<Box key="relay" flexDirection="row">
          <Text color="warning">relay › Écrire une fiche de relais dans {relay_1.RELAY_DIR}/ ? </Text>
          <Button key="relay-yes" label="Confirmer" variant="primary" onPress={function () { return runRelay($, surface); }}/>
          <Button key="relay-no" label="Annuler" onPress={toIdle}/>
        </Box>);
                    return [3 /*break*/, 15];
                case 7:
                    if (!(current === 'writing')) return [3 /*break*/, 8];
                    mine = <Text key="relay" dimColor>relay › Claude rédige la fiche de relais…</Text>;
                    return [3 /*break*/, 15];
                case 8:
                    if (!(current === 'done')) return [3 /*break*/, 10];
                    return [4 /*yield*/, (0, claude_code_1.read)($, outcome)];
                case 9:
                    last_1 = _e.sent();
                    mine = (<Box key="relay" flexDirection="row">
          <Text color="success">relay › ✓ {(_d = last_1 === null || last_1 === void 0 ? void 0 : last_1.path) !== null && _d !== void 0 ? _d : ''} </Text>
          {last_1 && last_1.resume !== '' && (<Button key="relay-copy" label="Copier le prompt de reprise" onPress={function () { return __awaiter(void 0, void 0, void 0, function () {
                                var r;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, $.ui.copy({ text: last_1.resume, surface: surface })];
                                        case 1:
                                            r = _a.sent();
                                            $.ui.toast(r.isCopied ? 'relay : prompt copié' : 'relay : copie impossible, voir le transcript');
                                            return [2 /*return*/];
                                    }
                                });
                            }); }}/>)}
          {close}
        </Box>);
                    return [3 /*break*/, 15];
                case 10:
                    if (!(current === 'failed')) return [3 /*break*/, 12];
                    return [4 /*yield*/, (0, claude_code_1.read)($, error)];
                case 11:
                    why = _e.sent();
                    mine = (<Box key="relay" flexDirection="row">
          <Text color="error">relay › échec : {why !== null && why !== void 0 ? why : 'inconnu'} </Text>
          <Button key="relay-retry" label="Réessayer" onPress={ask}/>
          {close}
        </Box>);
                    return [3 /*break*/, 15];
                case 12:
                    _c = (0, relay_1.isOverThreshold)(percent, limit);
                    if (!_c) return [3 /*break*/, 14];
                    return [4 /*yield*/, (0, claude_code_1.read)($, isSnoozed)];
                case 13:
                    _c = !(_e.sent());
                    _e.label = 14;
                case 14:
                    if (_c) {
                        mine = (<Box key="relay" flexDirection="row">
          <Text color="warning">
            relay › contexte {percent} % ≥ {limit} %{' '}
          </Text>
          <Button key="relay-go" label="Passer le relais" variant="primary" onPress={ask}/>
          <Button key="relay-later" label="Plus tard" plain dimColor onPress={function () { return (0, claude_code_1.update)($, isSnoozed, function () { return true; }); }}/>
        </Box>);
                    }
                    else {
                        mine = (<Box key="relay" flexDirection="row">
          <Text dimColor>relay › </Text>
          <Button key="relay-go" label="Passer le relais" onPress={ask}/>
        </Box>);
                    }
                    _e.label = 15;
                case 15: 
                // Les bandes des autres mods (jauge, fil, cap) restent dessinées sous relay.
                return [2 /*return*/, (<Box flexDirection="column">
        {mine}
        {below}
      </Box>)];
            }
        });
    }); });
};
exports.register = register;
