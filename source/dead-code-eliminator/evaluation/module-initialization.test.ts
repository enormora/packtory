import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';
import { moduleDependenciesInitialize, moduleInitializesBinding } from './module-initialization.ts';

type InitializationCase = {
    readonly name: string;
    readonly source: string;
    readonly modules: Readonly<Record<string, string>>;
    readonly expected: boolean;
};

const cases: readonly InitializationCase[] = [
    ...[
        'import {value} from "./other.js";',
        'import value from "./other.js";',
        'import * as value from "./other.js";'
    ]
        .map(function (declaration) {
            return {
                name: `initialized import read ${declaration}`,
                source: `${declaration}const before=value;export const resultType={};`,
                modules: { 'other.js': 'export const value=42;export default 42;' },
                expected: true
            };
        }),
    {
        name: 'selected declaration initializer',
        source: 'export const resultType=unknown();',
        modules: {},
        expected: false
    },
    {
        name: 'abrupt module prefix',
        source: 'throw new Error("stop");export const resultType={};',
        modules: {},
        expected: false
    },
    {
        name: 'literal',
        source: 'export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'primitive prefix',
        source: 'const before=1+2;export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'uninitialized variable',
        source: 'var before;let other;export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'inert function',
        source: 'function later(){console.log("not called");}export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'local evaluated call',
        source: 'function add(a,b){return a+b;}const before=add(1,2);export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'function-valued field',
        source: 'const before={later:()=>missing()};export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'pure expression',
        source: '1+2;export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'pure default export',
        source: 'export default 3;export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'local export specifier',
        source: 'const before=1;export {before};export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'unknown call',
        source: 'unknown();export const resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'unknown default export',
        source: 'export default unknown();export const resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'dynamic import',
        source: 'import("./other.js");export const resultType={config:"key"};',
        modules: {
            'other.js': 'const before=1;'
        },
        expected: false
    },
    {
        name: 'top-level await',
        source: 'await 1;export const resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'destructured getter',
        source: 'const {value}={get value(){unknown();}};export const resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'destructured iterator',
        source: 'const [value]=[1];export const resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'resource declaration',
        source: 'using resource={};export const resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'acyclic import',
        source: 'import "./other.js";export const resultType={config:"key"};',
        modules: {
            'other.js': 'const before=1;'
        },
        expected: true
    },
    {
        name: 'transitive reexport',
        source: 'export * from "./other.js";export const resultType={config:"key"};',
        modules: {
            'other.js': 'export * from "./leaf.js";',
            'leaf.js': 'export const value=1;'
        },
        expected: true
    },
    {
        name: 'diamond dependencies',
        source: 'import "./a.js";import "./b.js";export const resultType={config:"key"};',
        modules: {
            'a.js': 'import "./leaf.js";',
            'b.js': 'export * from "./leaf.js";',
            'leaf.js': 'export const value=1;'
        },
        expected: true
    },
    {
        name: 'cycle',
        source: 'import "./other.js";export const resultType={config:"key"};',
        modules: {
            'other.js': 'import "./index.js";'
        },
        expected: false
    },
    {
        name: 'transitive cycle',
        source: 'export * from "./other.js";export const resultType={config:"key"};',
        modules: {
            'other.js': 'export * from "./leaf.js";',
            'leaf.js': 'import "./index.js";'
        },
        expected: false
    },
    {
        name: 'missing import',
        source: 'import "./missing.js";export const resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'missing reexport',
        source: 'export * from "./missing.js";export const resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'dependency effect',
        source: 'import "./other.js";export const resultType={config:"key"};',
        modules: {
            'other.js': 'const before=1;unknown();'
        },
        expected: false
    },
    {
        name: 'builtin module',
        source: 'import "node:path";export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'type-only edges',
        source:
            'import type {X} from "./missing.js";export type {Y} from "./missing.js";export const resultType={config:"key"};',
        modules: {},
        expected: true
    },
    {
        name: 'later effect',
        source: 'export const resultType={config:"key"};unknown();',
        modules: {},
        expected: true
    },
    {
        name: 'later declarator',
        source: 'export const resultType={config:"key"},later=unknown();',
        modules: {},
        expected: true
    },
    {
        name: 'earlier declarator',
        source: 'export const earlier=unknown(),resultType={config:"key"};',
        modules: {},
        expected: false
    },
    {
        name: 'late textual import is hoisted',
        source: 'export const resultType={config:"key"};import "./other.js";',
        modules: {
            'other.js': 'import "./index.js";'
        },
        expected: false
    }
];

function initializationIsProven(content: string, modules: Readonly<Record<string, string>>): boolean {
    const project = createProject({
        withFiles: [
            { filePath: '/repo/package.json', content: '{"type":"module"}' },
            { filePath: '/repo/index.js', content },
            ...Object.entries(modules).map(function ([ file, source ]) {
                return { filePath: `/repo/${file}`, content: source };
            })
        ]
    });
    const declaration = project.getSourceFileOrThrow('/repo/index.js').getVariableDeclarationOrThrow('resultType');
    let resolutions = 0;
    return moduleInitializesBinding(declaration, function (specifier, source) {
        resolutions += 1;
        assert.ok(resolutions <= maximumEvaluationDepth);
        return resolveRuntimeModule(specifier, source);
    });
}

suite('module initialization proof', function () {
    test('checks dependencies before executing the root module', function () {
        const source = createProject().createSourceFile('/index.js', 'unknown();export const value=1;');
        assert.strictEqual(moduleDependenciesInitialize(source, resolveRuntimeModule), true);
        assert.strictEqual(
            moduleInitializesBinding(source.getVariableDeclarationOrThrow('value'), resolveRuntimeModule),
            false
        );
    });

    test('initializes a shared dependency once across a diamond', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/repo/package.json', content: '{"type":"module"}' },
                { filePath: '/repo/index.js', content: 'import "./a.js";import "./b.js";' },
                { filePath: '/repo/a.js', content: 'import "./leaf.js";' },
                { filePath: '/repo/b.js', content: 'import "./leaf.js";' },
                { filePath: '/repo/leaf.js', content: 'import "./base.js";' },
                { filePath: '/repo/base.js', content: 'export const value=1;' }
            ]
        });
        let baseResolutions = 0;
        assert.strictEqual(
            moduleDependenciesInitialize(project.getSourceFileOrThrow('/repo/index.js'), function (specifier, source) {
                if (specifier === './base.js') {
                    baseResolutions += 1;
                }
                return resolveRuntimeModule(specifier, source);
            }),
            true
        );
        assert.strictEqual(baseResolutions, 1);
    });

    for (const fixture of cases) {
        test(`checks ${fixture.name}`, function () {
            assert.strictEqual(initializationIsProven(fixture.source, fixture.modules), fixture.expected);
        });
    }

    for (
        const { count, expected } of [
            { count: maximumEvaluationDepth - 1, expected: true },
            { count: maximumEvaluationDepth, expected: false }
        ]
    ) {
        test(`bounds traversal through ${count} dependencies`, function () {
            const modules = Object.fromEntries(Array.from({ length: count }, function (_element, index) {
                return [
                    `chain-${index}.js`,
                    index === count - 1 ? 'export const value=1;' : `import "./chain-${index + 1}.js";`
                ];
            }));
            assert.strictEqual(
                initializationIsProven('import "./chain-0.js";export const resultType={config:"key"};', modules),
                expected
            );
        });
    }

    test('separates dependency initialization from resource acquisition', function () {
        const project = createProject({
            withFiles: [ {
                filePath: '/repo/index.js',
                content: 'using resource = acquire();'
            } ]
        });
        const source = project.getSourceFileOrThrow('/repo/index.js');
        assert.strictEqual(moduleDependenciesInitialize(source, resolveRuntimeModule), true);
        assert.strictEqual(
            moduleInitializesBinding(source.getVariableDeclarationOrThrow('resource'), resolveRuntimeModule),
            false
        );
    });

    test('rejects declaration-only initialization facts', function () {
        const project = createProject({
            withFiles: [ {
                filePath: '/repo/index.d.ts',
                content: 'export declare const resultType: { config: string };'
            } ]
        });
        const declaration = project.getSourceFileOrThrow('/repo/index.d.ts').getVariableDeclarationOrThrow(
            'resultType'
        );
        assert.strictEqual(moduleInitializesBinding(declaration, resolveRuntimeModule), false);
    });
});
