import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createDeadCodeEliminationTraceCollector } from '../../test-libraries/dead-code-elimination-trace-fixtures.ts';
import { applyRemovalPlan } from './declaration-remover.ts';

function removeExports(content: string, names: readonly string[], exports: readonly string[] | undefined): string {
    const source = createProject().createSourceFile('index.js', content);
    applyRemovalPlan(source, {
        bundleName: 'package',
        inputFilePath: 'index.js',
        targetFilePath: 'index.js',
        survivingNames: new Set(names),
        survivingExportNames: exports === undefined ? undefined : new Set(exports),
        trace: undefined
    });
    return source.getFullText();
}

suite('export removal', function () {
    suite('named forwarding', function () {
        test('removes an unused namespace forwarding export while preserving module evaluation', function () {
            assert.strictEqual(
                removeExports('export * as unused from "./library.js";', [], []),
                'export {} from "./library.js";'
            );
        });

        test('removes dead export aliases while keeping a locally used binding', function () {
            const output = removeExports('const value=42;export {value as dead,value as live};', [ 'value' ], [
                'live'
            ]);
            const source = createProject().createSourceFile('output.js', output);
            assert.notStrictEqual(source.getVariableDeclaration('value'), undefined);
            assert.deepStrictEqual(
                source.getExportSymbols().map(function (symbol) {
                    return symbol.getName();
                }),
                [ 'live' ]
            );
        });

        test('decodes quoted export aliases before removing specifiers', function () {
            const output = removeExports(
                'const value=42;export {value as "kept-name",value as "dead-name"};',
                [ 'value' ],
                [ 'kept-name' ]
            );
            assert.ok(output.includes('"kept-name"'));
            assert.strictEqual(output.includes('dead-name'), false);
        });
    });

    for (const clause of [ '* as unused', '{unused}' ]) {
        test(`preserves module evaluation when removing ${clause}`, function () {
            const source = createProject().createSourceFile(
                'output.js',
                removeExports(`export ${clause} from "./dependency.js";`, [], [])
            );
            assert.deepStrictEqual(
                source.getExportDeclarations().map(function (declaration) {
                    return [ declaration.getModuleSpecifierValue(), declaration.getNamedExports().length ];
                }),
                [ [ './dependency.js', 0 ] ]
            );
        });
    }

    for (const kind of [ 'function', 'class' ]) {
        test(`keeps the local name of a ${kind} when its default export is dead`, function () {
            const parameters = kind === 'function' ? '()' : '';
            const output = removeExports(`export default ${kind} local${parameters} {}`, [ 'local' ], []);
            assert.ok(output.includes(`${kind} local`));
            assert.strictEqual(output.includes('default'), false);
            assert.ok(output.includes('export {};'));
        });
    }

    test('removes anonymous default declarations and preserves module status', function () {
        assert.strictEqual(removeExports('export default function() {}', [], []).trim(), 'export {};');
    });

    test('keeps an observed anonymous default class with definition-time effects', function () {
        const content = 'export default class {static {console.log(this.name);}}';
        assert.strictEqual(removeExports(content, [], [ 'default' ]), content);
    });

    test('keeps export assignments when export names are unknown', function () {
        const content = 'export default 42;';
        assert.strictEqual(removeExports(content, [], undefined), content);
    });

    test('records removed default bindings', function () {
        const source = createProject().createSourceFile('index.js', 'export default 42;');
        const trace = createDeadCodeEliminationTraceCollector();
        applyRemovalPlan(source, {
            bundleName: 'package',
            inputFilePath: 'index.js',
            targetFilePath: 'index.js',
            survivingNames: new Set<string>(),
            survivingExportNames: new Set<string>(),
            trace: { collector: trace.collector }
        });
        assert.deepStrictEqual(trace.events, [ {
            type: 'binding-removed',
            bundleName: 'package',
            inputFilePath: 'index.js',
            bindingIdentifier: 'index.js::default'
        } ]);
        assert.strictEqual(source.getFullText().trim(), 'export {};');
    });
});
