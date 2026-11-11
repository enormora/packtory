import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type SourceFile } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { createBundleConstantEvaluator } from './bundle-constant-evaluation.ts';
import type { ModuleValue } from './module-export-value.ts';
import type { ModuleConstantSnapshot } from './module-constant-snapshot.ts';

type SnapshotFixture = {
    readonly importer: SourceFile;
    readonly outside: SourceFile;
    readonly modules: Pick<ModuleConstantSnapshot['modules'], 'get' | 'has'>;
    readonly resolveModule: RuntimeModuleResolver;
};

function snapshotFixture(content: string): SnapshotFixture {
    const project = createProject();
    const importer = project.createSourceFile('index.ts', content);
    const provider = project.createSourceFile('provider.ts', 'export {};');
    const outside = project.createSourceFile('outside.ts', 'import * as ns from "./provider.js";ns.value;');
    const exports = new Map<string, ModuleValue>([
        [ 'value', { kind: 'constant', value: { value: 42 } } ],
        [ 'make', { kind: 'namespace', source: provider } ],
        [ 'outside', { kind: 'namespace', source: outside } ]
    ]);
    const modules = new Map([
        [ importer, { initialized: true, exports: new Map() } ],
        [ provider, { initialized: true, exports } ]
    ]);
    return {
        importer,
        outside,
        modules: {
            get(source) {
                return modules.get(source);
            },
            has(source) {
                assert.notStrictEqual(source, undefined);
                return modules.has(source);
            }
        },
        resolveModule(specifier: string) {
            return specifier === './provider.js' ? provider : undefined;
        }
    };
}

suite('bundle constant snapshot queries', function () {
    for (
        const [ content, expected ] of [
            [ 'import * as ns from "./provider.js";ns.value;', { value: 42 } ],
            [ 'import * as ns from "./provider.js";ns.make().value;', undefined ],
            [ 'import * as ns from "./provider.js";ns.outside.value;', undefined ],
            [ 'import * as ns from "./missing.js";ns.value;', undefined ]
        ] as const
    ) {
        test(`projects only initialized primitive paths in ${content}`, function () {
            const fixture = snapshotFixture(content);
            const evaluate = createBundleConstantEvaluator(fixture, function () {
                return undefined;
            });
            const expression = fixture
                .importer
                .getFirstDescendantByKindOrThrow(SyntaxKind.ExpressionStatement)
                .getExpression();
            assert.deepStrictEqual(evaluate(expression), expected);
        });
    }

    test('rejects reads from importers outside the prepared snapshot', function () {
        const fixture = snapshotFixture('export {};');
        const evaluate = createBundleConstantEvaluator(fixture, function () {
            return undefined;
        });
        const expression = fixture
            .outside
            .getFirstDescendantByKindOrThrow(SyntaxKind.ExpressionStatement)
            .getExpression();
        assert.strictEqual(evaluate(expression), undefined);
    });
});
