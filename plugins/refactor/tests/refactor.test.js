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
Object.defineProperty(exports, "__esModule", { value: true });
var testing_1 = require("claude-code/testing");
var plan_1 = require("../hooks/plan");
var BAND = {
    plugin: 'refactor',
    component: 'AbovePrompt',
    props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 10,
        bodyColumns: 160,
        scroll: { offset: 0, bodyRows: 10 },
        view: {},
    },
};
var PANE = {
    plugin: 'refactor',
    component: 'Pane',
    requestId: 'refactor',
    props: {
        title: 'Refactor',
        isFocused: false,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
    },
};
var run = function (args) {
    return ({
        command: 'refactor',
        args: args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 160 },
    });
};
// Assemblé à l'exécution pour que ce fichier ne contienne pas lui-même de clé.
var FAKE_AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP';
var DISK = {
    '/repo/src': '',
    '/repo/src/a.ts': 'export const a = 1\n',
    '/repo/src/b.ts': 'export const b = 2\n',
    '/repo/src/secret.ts': "export const k = \"".concat(FAKE_AWS, "\"\n"),
    '/repo/.env': 'X=1\n',
};
var PLAN = {
    tool: 'mcp__refactor__plan',
    hasTests: true,
    testCommand: 'pnpm test',
    issues: [{ kind: 'complexité', file: 'src/a.ts', detail: 'fonction de 80 lignes' }],
    steps: [
        { title: 'Extraction de la validation JWT', files: ['src/a.ts'], risk: 'moyen', tests: ['pnpm test'] },
        { title: 'Renommage des helpers', files: ['src/b.ts'], risk: 'faible', tests: ['pnpm test'] },
    ],
};
var WITH_KNIP = __assign(__assign({}, DISK), { '/repo/package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { knip: '^5.0.0' } }), '/repo/src/old.ts': 'export const old = 1\n' });
var WITHOUT_KNIP = __assign(__assign({}, DISK), { '/repo/package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) });
function engine(on, disk) {
    if (disk === void 0) { disk = DISK; }
    var clock = testing_1.mock.clock(on);
    var submitted = [];
    var reached = [];
    // Le kit passe aux hooks fs.* des chemins absolus de la machine (D:\repo\… sous Windows).
    var norm = function (p) { return p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, ''); };
    on('session.start', function (_$, e) { return ({ cwd: e.cwd }); });
    on('command.register', function () { return ({ value: { command: 'refactor' } }); });
    on('tool.register', function (_$, e) { return ({ value: { tool: "mcp__refactor__".concat(e.name) } }); });
    on('ui.open', function () { return ({ value: { isPlaced: true } }); });
    on('prompt.submit', function (_$, e) {
        submitted.push(e.text);
        return { text: e.text };
    });
    on('fs.exists', function (_$, e) { return ({ value: norm(e.path) in disk }); });
    on('fs.read', function (_$, e) {
        var text = disk[norm(e.path)];
        if (text === undefined)
            throw new Error("absent : ".concat(e.path));
        return { value: text };
    });
    // Le moteur : ce qui arrive ici n'a pas été refusé par le mod.
    on('tool.call', function (_$, e) {
        reached.push(e.tool === 'Bash' ? "Bash ".concat(String(e.command)) : e.tool);
        return { result: {} };
    });
    on('ui.render', function ($, e) {
        var Text = $.ui.resolve(e).Text;
        return <Text>moteur</Text>;
    });
    return { submitted: submitted, reached: reached, clock: clock };
}
var edit = function (file_path, new_string) {
    if (new_string === void 0) { new_string = 'export const a = 2'; }
    return ({ tool: 'Edit', file_path: file_path, old_string: 'x', new_string: new_string });
};
var bash = function (command) { return ({ tool: 'Bash', command: command, description: 'test' }); };
var textOf = function (r) {
    var _a;
    var o = r;
    return (_a = o.deny) !== null && _a !== void 0 ? _a : (typeof o.result === 'string' ? o.result : '');
};
(0, testing_1.test)('arguments de /refactor', function () {
    (0, testing_1.expect)((0, plan_1.parseCommand)('src/utils/date.ts réduire la complexité')).toEqual({
        kind: 'start',
        target: 'src/utils/date.ts',
        goal: 'réduire la complexité',
        isPlanOnly: false,
    });
    (0, testing_1.expect)((0, plan_1.parseCommand)('src/services --plan-only')).toEqual({ kind: 'start', target: 'src/services', goal: '', isPlanOnly: true });
    (0, testing_1.expect)((0, plan_1.parseCommand)('"mon dossier/x.ts"')).toMatchObject({ target: 'mon dossier/x.ts' });
    (0, testing_1.expect)((0, plan_1.parseCommand)('go')).toEqual({ kind: 'go' });
    (0, testing_1.expect)((0, plan_1.resolvePath)('C:\\proj', 'src/../lib/./a.ts')).toBe('C:/proj/lib/a.ts');
});
(0, testing_1.test)('commandes shell refusées pendant un refactor, tests autorisés', function () {
    (0, testing_1.expect)((0, plan_1.shellVerdict)('git commit -m x')).toContain('git commit');
    (0, testing_1.expect)((0, plan_1.shellVerdict)('git push origin main')).toContain('push');
    (0, testing_1.expect)((0, plan_1.shellVerdict)('git reset --hard HEAD~1')).toContain('reset --hard');
    (0, testing_1.expect)((0, plan_1.shellVerdict)('rm -rf src/old')).toContain('suppression');
    (0, testing_1.expect)((0, plan_1.shellVerdict)("sed -i 's/a/b/' src/a.ts")).toContain('Edit ou Write');
    (0, testing_1.expect)((0, plan_1.shellVerdict)('echo x > src/a.ts')).toContain('redirection');
    (0, testing_1.expect)((0, plan_1.shellVerdict)('pnpm test 2>&1')).toBeNull();
    (0, testing_1.expect)((0, plan_1.shellVerdict)('git diff -- src/a.ts')).toBeNull();
    (0, testing_1.expect)((0, plan_1.shellVerdict)('node -e "[1].map(x => x)"')).toBeNull();
});
(0, testing_1.test)('/refactor génère un plan avant toute modification', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, submitted, reached, clock, started, _b, _c, planned, _d, _e, ui, _f, _g, _h;
    var _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                _a = engine(on), submitted = _a.submitted, reached = _a.reached, clock = _a.clock;
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
            case 1:
                _k.sent();
                return [4 /*yield*/, $.command.run(run('src/a.ts'))];
            case 2:
                started = _k.sent();
                return [4 /*yield*/, clock.settle()];
            case 3:
                _k.sent();
                (0, testing_1.expect)(started === null || started === void 0 ? void 0 : started.text).toContain('Aucun fichier ne sera modifié avant ta validation');
                (0, testing_1.expect)(submitted[0]).toContain('lecture seule');
                (0, testing_1.expect)(submitted[0]).toContain('mcp__refactor__plan');
                // Pendant l'analyse : aucune écriture.
                _b = testing_1.expect;
                _c = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/src/a.ts'))];
            case 4:
                // Pendant l'analyse : aucune écriture.
                _b.apply(void 0, [_c.apply(void 0, [_k.sent()])]).toContain('pas encore validé');
                return [4 /*yield*/, $.tool.call(PLAN)];
            case 5:
                planned = _k.sent();
                (0, testing_1.expect)(textOf(planned)).toContain('ARRÊTE-TOI');
                // Plan reçu mais pas validé : toujours aucune écriture.
                _d = testing_1.expect;
                _e = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/src/a.ts'))];
            case 6:
                // Plan reçu mais pas validé : toujours aucune écriture.
                _d.apply(void 0, [_e.apply(void 0, [_k.sent()])]).toContain('pas encore validé');
                (0, testing_1.expect)(reached.filter(function (t) { return t === 'Edit' || t === 'Write'; })).toEqual([]);
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 7:
                ui = _k.sent();
                _f = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /en attente de validation/ })];
            case 8:
                _f.apply(void 0, [(_j = (_k.sent())) === null || _j === void 0 ? void 0 : _j.text]).toContain('2 étape(s)');
                _g = testing_1.expect;
                return [4 /*yield*/, ui.find({ key: 'refactor-go' })];
            case 9:
                _g.apply(void 0, [_k.sent()]).toBeDefined();
                _h = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: 'moteur' })];
            case 10:
                _h.apply(void 0, [_k.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()];
            case 11:
                _k.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('--plan-only ne modifie aucun fichier', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, submitted, reached, clock, _b, _c, _d, _e, _f, _g, _h, _j, _k, _i, _l, surface, pane, _m;
    var _o;
    return __generator(this, function (_p) {
        switch (_p.label) {
            case 0:
                _a = engine(on), submitted = _a.submitted, reached = _a.reached, clock = _a.clock;
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
            case 1:
                _p.sent();
                return [4 /*yield*/, $.command.run(run('src --plan-only'))];
            case 2:
                _p.sent();
                return [4 /*yield*/, clock.settle()];
            case 3:
                _p.sent();
                (0, testing_1.expect)(submitted[0]).toContain('plan seul');
                _b = testing_1.expect;
                _c = textOf;
                return [4 /*yield*/, $.tool.call(PLAN)];
            case 4:
                _b.apply(void 0, [_c.apply(void 0, [_p.sent()])]).toContain((0, plan_1.PLAN_ONLY_END)('src'));
                _d = testing_1.expect;
                _e = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/src/a.ts'))];
            case 5:
                _d.apply(void 0, [_e.apply(void 0, [_p.sent()])]).toContain('--plan-only');
                _f = testing_1.expect;
                _g = textOf;
                return [4 /*yield*/, $.tool.call({ tool: 'Write', file_path: '/repo/src/new.ts', content: 'x' })];
            case 6:
                _f.apply(void 0, [_g.apply(void 0, [_p.sent()])]).toContain('--plan-only');
                _h = testing_1.expect;
                _j = textOf;
                return [4 /*yield*/, $.tool.call(bash("sed -i 's/1/2/' src/a.ts"))];
            case 7:
                _h.apply(void 0, [_j.apply(void 0, [_p.sent()])]).toContain('Edit ou Write');
                _k = testing_1.expect;
                return [4 /*yield*/, $.command.run(run('go'))];
            case 8:
                _k.apply(void 0, [(_o = (_p.sent())) === null || _o === void 0 ? void 0 : _o.text]).toContain('Mode plan seul');
                // Lecture et tests passent ; aucune écriture n'atteint le moteur.
                return [4 /*yield*/, $.tool.call(bash('pnpm test'))];
            case 9:
                // Lecture et tests passent ; aucune écriture n'atteint le moteur.
                _p.sent();
                (0, testing_1.expect)(reached).toEqual(['Bash pnpm test']);
                (0, testing_1.expect)(submitted).toHaveLength(1);
                _i = 0, _l = ['terminal', 'desktop'];
                _p.label = 10;
            case 10:
                if (!(_i < _l.length)) return [3 /*break*/, 15];
                surface = _l[_i];
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, PANE), { surface: surface }))];
            case 11:
                pane = _p.sent();
                _m = testing_1.expect;
                return [4 /*yield*/, pane.find({ type: 'Text', text: /Extraction de la validation JWT/ })];
            case 12:
                _m.apply(void 0, [_p.sent()]).toBeDefined();
                return [4 /*yield*/, pane.unmount()];
            case 13:
                _p.sent();
                _p.label = 14;
            case 14:
                _i++;
                return [3 /*break*/, 10];
            case 15: return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('aucun fichier modifié sans validation explicite, puis seulement dans le périmètre', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, submitted, reached, clock, _b, _c, ui, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    return __generator(this, function (_t) {
        switch (_t.label) {
            case 0:
                _a = engine(on), submitted = _a.submitted, reached = _a.reached, clock = _a.clock;
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
            case 1:
                _t.sent();
                return [4 /*yield*/, $.command.run(run('src'))];
            case 2:
                _t.sent();
                return [4 /*yield*/, clock.settle()];
            case 3:
                _t.sent();
                return [4 /*yield*/, $.tool.call(PLAN)];
            case 4:
                _t.sent();
                _b = testing_1.expect;
                _c = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/src/a.ts'))];
            case 5:
                _b.apply(void 0, [_c.apply(void 0, [_t.sent()])]).toContain('pas encore validé');
                (0, testing_1.expect)(reached).toEqual([]);
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 6:
                ui = _t.sent();
                return [4 /*yield*/, ui.press({ key: 'refactor-go' })];
            case 7:
                _t.sent();
                return [4 /*yield*/, clock.settle()];
            case 8:
                _t.sent();
                return [4 /*yield*/, ui.unmount()];
            case 9:
                _t.sent();
                (0, testing_1.expect)(submitted.at(-1)).toContain('étape 1/2');
                return [4 /*yield*/, $.tool.call(edit('/repo/src/a.ts'))];
            case 10:
                _t.sent();
                (0, testing_1.expect)(reached).toEqual(['Edit']);
                _d = testing_1.expect;
                _e = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/.env'))];
            case 11:
                _d.apply(void 0, [_e.apply(void 0, [_t.sent()])]).toContain('fichier sensible');
                _f = testing_1.expect;
                _g = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/lib/x.ts'))];
            case 12:
                _f.apply(void 0, [_g.apply(void 0, [_t.sent()])]).toContain('hors de l’étape');
                _h = testing_1.expect;
                _j = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/src/secret.ts'))];
            case 13:
                _h.apply(void 0, [_j.apply(void 0, [_t.sent()])]).toContain('contient un secret');
                _k = testing_1.expect;
                _l = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/src/a.ts', "const k = \"".concat(FAKE_AWS, "\"")))];
            case 14:
                _k.apply(void 0, [_l.apply(void 0, [_t.sent()])]).toContain('contient un secret');
                _m = testing_1.expect;
                _o = textOf;
                return [4 /*yield*/, $.tool.call(bash('git commit -am refactor'))];
            case 15:
                _m.apply(void 0, [_o.apply(void 0, [_t.sent()])]).toContain('validation explicite');
                _p = testing_1.expect;
                _q = textOf;
                return [4 /*yield*/, $.tool.call(bash('git reset --hard'))];
            case 16:
                _p.apply(void 0, [_q.apply(void 0, [_t.sent()])]).toContain('validation explicite');
                _r = testing_1.expect;
                _s = textOf;
                return [4 /*yield*/, $.tool.call(bash('rm src/b.ts'))];
            case 17:
                _r.apply(void 0, [_s.apply(void 0, [_t.sent()])]).toContain('validation explicite');
                (0, testing_1.expect)(reached).toEqual(['Edit']);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('une étape à la fois : échec = pause, reprise, résumé final', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, submitted, reached, clock, _b, first, ui, _c, _d, failed, _e, _f, _g, _h, last;
    var _j, _k, _l;
    return __generator(this, function (_m) {
        switch (_m.label) {
            case 0:
                _a = engine(on), submitted = _a.submitted, reached = _a.reached, clock = _a.clock;
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
            case 1:
                _m.sent();
                return [4 /*yield*/, $.command.run(run('src'))];
            case 2:
                _m.sent();
                return [4 /*yield*/, clock.settle()];
            case 3:
                _m.sent();
                return [4 /*yield*/, $.tool.call(PLAN)];
            case 4:
                _m.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, $.command.run(run('go'))];
            case 5:
                _b.apply(void 0, [(_j = (_m.sent())) === null || _j === void 0 ? void 0 : _j.text]).toContain('étape 1/2');
                return [4 /*yield*/, clock.settle()];
            case 6:
                _m.sent();
                return [4 /*yield*/, $.tool.call({ tool: 'mcp__refactor__step', step: 1, status: 'ok', tests: 'OK' })];
            case 7:
                first = _m.sent();
                (0, testing_1.expect)(textOf(first)).toContain('étape 2/2');
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 8:
                ui = _m.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /Refactor 2\/2 — Renommage des helpers/ })];
            case 9:
                _c.apply(void 0, [_m.sent()]).toBeDefined();
                _d = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /risque faible/ })];
            case 10:
                _d.apply(void 0, [_m.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()
                    // Tests en échec : pause, plus aucune écriture.
                ];
            case 11:
                _m.sent();
                return [4 /*yield*/, $.tool.call({ tool: 'mcp__refactor__step', step: 2, status: 'ok', tests: 'échec' })];
            case 12:
                failed = _m.sent();
                (0, testing_1.expect)(textOf(failed)).toContain('arrêtée');
                _e = testing_1.expect;
                _f = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/src/b.ts'))];
            case 13:
                _e.apply(void 0, [_f.apply(void 0, [_m.sent()])]).toContain('en pause');
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 14:
                ui = _m.sent();
                _g = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /En pause/ })];
            case 15:
                _g.apply(void 0, [(_k = (_m.sent())) === null || _k === void 0 ? void 0 : _k.text]).toContain('échec');
                return [4 /*yield*/, ui.unmount()];
            case 16:
                _m.sent();
                _h = testing_1.expect;
                return [4 /*yield*/, $.command.run(run('go'))];
            case 17:
                _h.apply(void 0, [(_l = (_m.sent())) === null || _l === void 0 ? void 0 : _l.text]).toContain('étape 2/2');
                return [4 /*yield*/, clock.settle()];
            case 18:
                _m.sent();
                (0, testing_1.expect)(submitted.at(-1)).toContain('étape 2/2');
                return [4 /*yield*/, $.tool.call(edit('/repo/src/b.ts'))];
            case 19:
                _m.sent();
                return [4 /*yield*/, $.tool.call({ tool: 'mcp__refactor__step', step: 2, status: 'ok', tests: 'OK' })];
            case 20:
                last = _m.sent();
                (0, testing_1.expect)(textOf(last)).toContain('résumé final');
                (0, testing_1.expect)(textOf(last)).toContain('/repo/src/b.ts');
                // Refactor terminé : le mod ne garde plus les fichiers.
                return [4 /*yield*/, $.tool.call(edit('/repo/lib/x.ts'))];
            case 21:
                // Refactor terminé : le mod ne garde plus les fichiers.
                _m.sent();
                (0, testing_1.expect)(reached).toEqual(['Edit', 'Edit']);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('sans tests détectés : prévient et propose des tests de caractérisation', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var clock, reply, ui, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                clock = engine(on).clock;
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
            case 1:
                _b.sent();
                return [4 /*yield*/, $.command.run(run('src/a.ts'))];
            case 2:
                _b.sent();
                return [4 /*yield*/, clock.settle()];
            case 3:
                _b.sent();
                return [4 /*yield*/, $.tool.call(__assign(__assign({}, PLAN), { hasTests: false }))];
            case 4:
                reply = _b.sent();
                (0, testing_1.expect)(textOf(reply)).toContain('tests de caractérisation');
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 5:
                ui = _b.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /aucun test détecté/ })];
            case 6:
                _a.apply(void 0, [_b.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()];
            case 7:
                _b.sent();
                return [2 /*return*/];
        }
    });
}); });
var KNIP_PLAN = {
    tool: 'mcp__refactor__plan',
    hasTests: true,
    testCommand: 'pnpm test',
    knip: [
        { kind: 'export', name: 'unusedHelper', file: 'src/a.ts', risk: 'faible', reason: 'aucun import' },
        { kind: 'fichier', name: 'src/old.ts', file: 'src/old.ts', risk: 'faible', reason: 'jamais importé' },
        { kind: 'fichier', name: 'src/page.tsx', file: 'src/page.tsx', risk: 'faible', reason: 'route du framework Next' },
    ],
    steps: [
        { title: 'Extraction de la validation JWT', files: ['src/a.ts'], risk: 'moyen', tests: ['pnpm test'] },
        { title: 'Exports inutilisés', kind: 'knip-export', files: ['src/a.ts'], risk: 'faible', tests: ['pnpm test'], knip: ['unusedHelper'] },
        { title: 'Fichiers morts', kind: 'knip-file', files: ['src/old.ts'], risk: 'faible', tests: ['pnpm test'], knip: ['src/old.ts'] },
    ],
};
var step = function (n, tests) {
    if (tests === void 0) { tests = 'OK'; }
    return ({ tool: 'mcp__refactor__step', step: n, status: 'ok', tests: tests });
};
(0, testing_1.test)('Knip n’est jamais lancé avec --fix sans validation explicite', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, submitted, reached, clock, _b, _c, _d, _e, _f, _g, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                _a = engine(on, WITH_KNIP), submitted = _a.submitted, reached = _a.reached, clock = _a.clock;
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
                    // Hors refactor aussi.
                ];
            case 1:
                _k.sent();
                // Hors refactor aussi.
                _b = testing_1.expect;
                _c = textOf;
                return [4 /*yield*/, $.tool.call(bash('npx knip --fix'))];
            case 2:
                // Hors refactor aussi.
                _b.apply(void 0, [_c.apply(void 0, [_k.sent()])]).toContain('jamais sans validation explicite');
                return [4 /*yield*/, $.command.run(run('src'))];
            case 3:
                _k.sent();
                return [4 /*yield*/, clock.settle()];
            case 4:
                _k.sent();
                (0, testing_1.expect)(submitted[0]).toContain('Exécute `npx knip`');
                (0, testing_1.expect)(submitted[0]).toContain('jamais `--fix`');
                // Analyse : knip en lecture seule passe, --fix jamais.
                return [4 /*yield*/, $.tool.call(bash('npx knip'))];
            case 5:
                // Analyse : knip en lecture seule passe, --fix jamais.
                _k.sent();
                _d = testing_1.expect;
                _e = textOf;
                return [4 /*yield*/, $.tool.call(bash('npx knip --fix --allow-remove-files'))];
            case 6:
                _d.apply(void 0, [_e.apply(void 0, [_k.sent()])]).toContain('--fix');
                _f = testing_1.expect;
                _g = textOf;
                return [4 /*yield*/, $.tool.call(bash('npx knip --fix-type exports'))];
            case 7:
                _f.apply(void 0, [_g.apply(void 0, [_k.sent()])]).toContain('--fix');
                // Même après validation du plan et confirmation d'un nettoyage.
                return [4 /*yield*/, $.tool.call(KNIP_PLAN)];
            case 8:
                // Même après validation du plan et confirmation d'un nettoyage.
                _k.sent();
                return [4 /*yield*/, $.command.run(run('go'))];
            case 9:
                _k.sent();
                return [4 /*yield*/, clock.settle()];
            case 10:
                _k.sent();
                return [4 /*yield*/, $.tool.call(step(1))];
            case 11:
                _k.sent();
                return [4 /*yield*/, $.command.run(run('go'))];
            case 12:
                _k.sent();
                return [4 /*yield*/, clock.settle()];
            case 13:
                _k.sent();
                _h = testing_1.expect;
                _j = textOf;
                return [4 /*yield*/, $.tool.call(bash('npx knip --fix'))];
            case 14:
                _h.apply(void 0, [_j.apply(void 0, [_k.sent()])]).toContain('--fix');
                (0, testing_1.expect)(reached.filter(function (t) { return t.includes('knip'); })).toEqual(['Bash npx knip']);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('Knip absent : installation proposée, jamais exécutée', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, submitted, reached, clock, _b, _c, _d, _e, _f, _g, pane, _h;
    return __generator(this, function (_j) {
        switch (_j.label) {
            case 0:
                _a = engine(on, WITHOUT_KNIP), submitted = _a.submitted, reached = _a.reached, clock = _a.clock;
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
            case 1:
                _j.sent();
                return [4 /*yield*/, $.command.run(run('src --plan-only'))];
            case 2:
                _j.sent();
                return [4 /*yield*/, clock.settle()];
            case 3:
                _j.sent();
                (0, testing_1.expect)(submitted[0]).toContain('npm install -D knip');
                (0, testing_1.expect)(submitted[0]).toContain('sans les exécuter');
                _b = testing_1.expect;
                _c = textOf;
                return [4 /*yield*/, $.tool.call(bash('npm install -D knip'))];
            case 4:
                _b.apply(void 0, [_c.apply(void 0, [_j.sent()])]).toContain('sans les exécuter');
                _d = testing_1.expect;
                _e = textOf;
                return [4 /*yield*/, $.tool.call(bash('npx knip init'))];
            case 5:
                _d.apply(void 0, [_e.apply(void 0, [_j.sent()])]).toContain('sans l’exécuter');
                _f = testing_1.expect;
                _g = textOf;
                return [4 /*yield*/, $.tool.call(bash('npx knip'))];
            case 6:
                _f.apply(void 0, [_g.apply(void 0, [_j.sent()])]).toContain('pas installé');
                (0, testing_1.expect)(reached).toEqual([]);
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, PANE), { surface: 'terminal' }))];
            case 7:
                pane = _j.sent();
                _h = testing_1.expect;
                return [4 /*yield*/, pane.find({ type: 'Text', text: /Knip : non installé/ })];
            case 8:
                _h.apply(void 0, [_j.sent()]).toBeDefined();
                return [4 /*yield*/, pane.unmount()];
            case 9:
                _j.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('nettoyages Knip : un par un, chacun confirmé, suppression limitée aux fichiers confirmés', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, submitted, reached, clock, _b, _c, _d, _e, _f, _g, ui, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, pane, _v, _w, _x;
    var _y, _z;
    return __generator(this, function (_0) {
        switch (_0.label) {
            case 0:
                _a = engine(on, WITH_KNIP), submitted = _a.submitted, reached = _a.reached, clock = _a.clock;
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
            case 1:
                _0.sent();
                return [4 /*yield*/, $.command.run(run('src'))];
            case 2:
                _0.sent();
                return [4 /*yield*/, clock.settle()];
            case 3:
                _0.sent();
                _b = testing_1.expect;
                _c = textOf;
                return [4 /*yield*/, $.tool.call(KNIP_PLAN)];
            case 4:
                _b.apply(void 0, [_c.apply(void 0, [_0.sent()])]).toContain('2 nettoyage(s) Knip');
                return [4 /*yield*/, $.command.run(run('go'))];
            case 5:
                _0.sent();
                return [4 /*yield*/, clock.settle()
                    // Étape 1 faite : l'étape 2 (exports) attend sa confirmation, rien ne s'écrit.
                ];
            case 6:
                _0.sent();
                // Étape 1 faite : l'étape 2 (exports) attend sa confirmation, rien ne s'écrit.
                _d = testing_1.expect;
                _e = textOf;
                return [4 /*yield*/, $.tool.call(step(1))];
            case 7:
                // Étape 1 faite : l'étape 2 (exports) attend sa confirmation, rien ne s'écrit.
                _d.apply(void 0, [_e.apply(void 0, [_0.sent()])]).toContain('confirmation explicite');
                _f = testing_1.expect;
                _g = textOf;
                return [4 /*yield*/, $.tool.call(edit('/repo/src/a.ts'))];
            case 8:
                _f.apply(void 0, [_g.apply(void 0, [_0.sent()])]).toContain('pas encore confirmé');
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 9:
                ui = _0.sent();
                _h = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: /Confirmation requise/ })];
            case 10:
                _h.apply(void 0, [(_y = (_0.sent())) === null || _y === void 0 ? void 0 : _y.text]).toContain('1 export(s) : unusedHelper');
                _j = testing_1.expect;
                return [4 /*yield*/, ui.find({ key: 'refactor-skip' })];
            case 11:
                _j.apply(void 0, [_0.sent()]).toBeDefined();
                return [4 /*yield*/, ui.press({ key: 'refactor-go' })];
            case 12:
                _0.sent();
                return [4 /*yield*/, clock.settle()];
            case 13:
                _0.sent();
                return [4 /*yield*/, ui.unmount()];
            case 14:
                _0.sent();
                (0, testing_1.expect)(submitted.at(-1)).toContain('étape 2/3');
                // Étape 3 (fichiers morts) : rm refusé avant confirmation, puis limité au fichier confirmé.
                _k = testing_1.expect;
                _l = textOf;
                return [4 /*yield*/, $.tool.call(step(2))];
            case 15:
                // Étape 3 (fichiers morts) : rm refusé avant confirmation, puis limité au fichier confirmé.
                _k.apply(void 0, [_l.apply(void 0, [_0.sent()])]).toContain('confirmation explicite');
                _m = testing_1.expect;
                _o = textOf;
                return [4 /*yield*/, $.tool.call(bash('rm src/old.ts'))];
            case 16:
                _m.apply(void 0, [_o.apply(void 0, [_0.sent()])]).toContain('validation explicite');
                return [4 /*yield*/, $.command.run(run('go'))];
            case 17:
                _0.sent();
                return [4 /*yield*/, clock.settle()];
            case 18:
                _0.sent();
                _p = testing_1.expect;
                _q = textOf;
                return [4 /*yield*/, $.tool.call(bash('rm src/a.ts'))];
            case 19:
                _p.apply(void 0, [_q.apply(void 0, [_0.sent()])]).toContain('validation explicite');
                _r = testing_1.expect;
                _s = textOf;
                return [4 /*yield*/, $.tool.call(bash('rm -rf src'))];
            case 20:
                _r.apply(void 0, [_s.apply(void 0, [_0.sent()])]).toContain('validation explicite');
                return [4 /*yield*/, $.tool.call(bash('git rm src/old.ts'))];
            case 21:
                _0.sent();
                (0, testing_1.expect)(reached).toEqual(['Bash git rm src/old.ts']);
                _t = testing_1.expect;
                _u = textOf;
                return [4 /*yield*/, $.tool.call(step(3))];
            case 22:
                _t.apply(void 0, [_u.apply(void 0, [_0.sent()])]).toContain('résumé final');
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, PANE), { surface: 'desktop' }))];
            case 23:
                pane = _0.sent();
                _v = testing_1.expect;
                return [4 /*yield*/, pane.find({ type: 'Text', text: /✓ terminée/ })];
            case 24:
                _v.apply(void 0, [_0.sent()]).toBeDefined();
                _w = testing_1.expect;
                return [4 /*yield*/, pane.find({ type: 'Text', text: /knip · export unusedHelper/ })];
            case 25:
                _w.apply(void 0, [_0.sent()]).toBeDefined();
                _x = testing_1.expect;
                return [4 /*yield*/, pane.find({ type: 'Text', text: /src\/page\.tsx/ })];
            case 26:
                _x.apply(void 0, [(_z = (_0.sent())) === null || _z === void 0 ? void 0 : _z.text]).toContain('élevé');
                return [4 /*yield*/, pane.unmount()];
            case 27:
                _0.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('knip --fix : visé quand Knip est lancé, pas quand il est cité', function () {
    for (var _i = 0, _a = [
        'npx knip --fix',
        'pnpm exec knip --fix-type exports',
        'cd app && npx -y knip@5 --fix --allow-remove-files',
        'bash -c "npx knip --fix"',
    ]; _i < _a.length; _i++) {
        var run_1 = _a[_i];
        (0, testing_1.expect)((0, plan_1.knipFixVerdict)(run_1)).toContain('--fix');
    }
    var commit = "git commit -q -F - <<'EOF'\nNettoyages Knip ; knip --fix toujours refusé.\nEOF";
    (0, testing_1.expect)((0, plan_1.knipFixVerdict)(commit)).toBeNull();
    (0, testing_1.expect)((0, plan_1.knipFixVerdict)('npx knip --reporter json')).toBeNull();
    (0, testing_1.expect)((0, plan_1.knipFixVerdict)('grep -r "fix" knip.json')).toBeNull();
});
(0, testing_1.test)('review : knip --fix sous toutes ses formes, écritures shell, lectures autorisées', function () {
    for (var _i = 0, _a = [
        'npm run knip -- --fix --allow-remove-files',
        'npm exec knip -- --fix',
        './node_modules/.bin/knip --fix',
        "npx knip '--fix'",
        'npx knip "--allow-remove-files"',
    ]; _i < _a.length; _i++) {
        var run_2 = _a[_i];
        (0, testing_1.expect)((0, plan_1.knipFixVerdict)(run_2)).toContain('--fix');
    }
    for (var _b = 0, _c = [
        'pnpm test 1>out.ts',
        'pnpm test &>log.txt',
        'pnpm lint --fix',
        'npx prettier --write .',
        'npx oxfmt src',
        'npm run format',
        "node -e \"require('fs').writeFileSync('a.ts', 'x')\"",
    ]; _b < _c.length; _b++) {
        var write = _c[_b];
        (0, testing_1.expect)((0, plan_1.shellVerdict)(write)).not.toBeNull();
    }
    for (var _d = 0, _e = [
        'grep -rn "<Button>" src',
        'grep -n "Promise<void>" src/a.ts',
        'grep "len >= 3" src/a.ts',
        'grep -w black src',
        'pnpm test 2>&1 | tail -5',
    ]; _d < _e.length; _d++) {
        var readOnly = _e[_d];
        (0, testing_1.expect)((0, plan_1.shellVerdict)(readOnly)).toBeNull();
    }
});
(0, testing_1.test)('review : risque élevé sans faux positif, « low », homonymes Knip', function () {
    var _a, _b, _c;
    (0, testing_1.expect)((0, plan_1.isHighRiskReason)('aucun import, non référencé par les tests ni la config')).toBe(false);
    (0, testing_1.expect)((0, plan_1.isHighRiskReason)('utilisé par le framework Next comme route')).toBe(true);
    (0, testing_1.expect)((0, plan_1.isHighRiskReason)('chargé via import dynamique')).toBe(true);
    (0, testing_1.expect)((_a = (0, plan_1.knipItemOf)({ kind: 'export', name: 'x', risk: 'low', reason: '' })) === null || _a === void 0 ? void 0 : _a.risk).toBe('faible');
    var twins = {
        hasTests: true,
        knip: [
            { kind: 'export', name: 'helper', file: 'a.ts', risk: 'faible', reason: '' },
            { kind: 'export', name: 'helper', file: 'b.ts', risk: 'élevé', reason: '' },
        ],
    };
    var precise = (0, plan_1.parsePlan)(__assign(__assign({}, twins), { steps: [{ title: 'E', kind: 'knip-export', files: ['a.ts'], risk: 'faible', tests: [], knip: ['a.ts:helper'] }] }));
    var vague = (0, plan_1.parsePlan)(__assign(__assign({}, twins), { steps: [{ title: 'E', kind: 'knip-export', files: ['a.ts'], risk: 'faible', tests: [], knip: ['helper'] }] }));
    (0, testing_1.expect)(typeof precise === 'string' ? precise : (_b = precise.steps[0]) === null || _b === void 0 ? void 0 : _b.risk).toBe('faible');
    (0, testing_1.expect)(typeof vague === 'string' ? vague : (_c = vague.steps[0]) === null || _c === void 0 ? void 0 : _c.risk).toBe('élevé');
});
(0, testing_1.test)('review : valider le plan pendant le tour d’analyse ne met pas le refactor en pause', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, reached, clock;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = engine(on), reached = _a.reached, clock = _a.clock;
                on('turn.start', function (_$, e) { return ({ turnId: e.turnId }); });
                on('turn.complete', function () { return ({ text: '' }); });
                return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
            case 1:
                _b.sent();
                return [4 /*yield*/, $.command.run(run('src'))];
            case 2:
                _b.sent();
                return [4 /*yield*/, clock.settle()];
            case 3:
                _b.sent();
                return [4 /*yield*/, $.turn.start({ text: 'analyse', turnId: 't1' })];
            case 4:
                _b.sent();
                return [4 /*yield*/, $.tool.call(PLAN)];
            case 5:
                _b.sent();
                return [4 /*yield*/, $.command.run(run('go'))];
            case 6:
                _b.sent();
                return [4 /*yield*/, clock.settle()];
            case 7:
                _b.sent();
                return [4 /*yield*/, $.turn.complete({ answer: 'plan', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })];
            case 8:
                _b.sent();
                return [4 /*yield*/, $.tool.call(edit('/repo/src/a.ts'))];
            case 9:
                _b.sent();
                (0, testing_1.expect)(reached).toEqual(['Edit']);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('Knip : risque élevé forcé, jamais de suppression d’un fichier à risque élevé, ordre des nettoyages', function () {
    var _a, _b;
    (0, testing_1.expect)((_a = (0, plan_1.knipItemOf)({ kind: 'fichier', name: 'x.ts', risk: 'faible', reason: 'import dynamique' })) === null || _a === void 0 ? void 0 : _a.risk).toBe('élevé');
    (0, testing_1.expect)((_b = (0, plan_1.knipItemOf)({ kind: 'export', name: 'y', risk: 'faible', reason: 'aucun import' })) === null || _b === void 0 ? void 0 : _b.risk).toBe('faible');
    var risky = (0, plan_1.parsePlan)({
        hasTests: true,
        knip: [{ kind: 'fichier', name: 'next.config.js', risk: 'faible', reason: 'configuration du framework' }],
        steps: [{ title: 'Fichiers morts', kind: 'knip-file', files: ['next.config.js'], risk: 'faible', tests: [], knip: ['next.config.js'] }],
    });
    (0, testing_1.expect)(risky).toContain('risque élevé');
    var disorder = (0, plan_1.parsePlan)({
        hasTests: true,
        steps: [
            { title: 'Fichiers', kind: 'knip-file', files: ['a.ts'], risk: 'faible', tests: [] },
            { title: 'Exports', kind: 'knip-export', files: ['b.ts'], risk: 'faible', tests: [] },
        ],
    });
    (0, testing_1.expect)(disorder).toContain('exports, puis dépendances, puis fichiers');
});
