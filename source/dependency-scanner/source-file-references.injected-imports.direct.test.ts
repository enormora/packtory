import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import {
    createDirectInjectedLoaderProject,
    expectFooReference,
    expectNoReferences
} from './source-file-references.injected-imports-fixtures.test.ts';

suite('source-file-references directly injected dynamic imports', function () {
    test('supports directly injected import loaders', function () {
        expectFooReference(createDirectInjectedLoaderProject({
            callSiteLoaderExpression: '(modulePath) => import(modulePath)',
            dependencyCallExpression: 'load("./foo")'
        }));
    });

    test('supports directly injected loaders that return awaited dynamic imports', function () {
        expectFooReference(createDirectInjectedLoaderProject({
            callSiteLoaderExpression: 'async function (modulePath) { return await import(modulePath); }',
            dependencyCallExpression: 'load("./foo")'
        }));
    });

    test('supports directly injected loader variables', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: 'main.ts',
                    content: [
                        'import { foo } from "./a";',
                        'const importModule = (modulePath) => import(modulePath);',
                        'await foo(importModule);'
                    ]
                        .join('\n')
                },
                { filePath: 'a.ts', content: 'export async function foo(load) { return await load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        });
        expectFooReference(project);
    });

    test('supports directly injected loader function declarations', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: 'main.ts',
                    content: [
                        'import { foo } from "./a";',
                        'function importModule(modulePath) {',
                        '    return import(modulePath);',
                        '}',
                        'await foo(importModule);'
                    ]
                        .join('\n')
                },
                { filePath: 'a.ts', content: 'export async function foo(load) { return await load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        });
        expectFooReference(project);
    });

    test('supports directly injected loader function-expression variables', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: 'main.ts',
                    content: [
                        'import { foo } from "./a";',
                        'const importModule = function (modulePath) {',
                        '    return import(modulePath);',
                        '};',
                        'await foo(importModule);'
                    ]
                        .join('\n')
                },
                { filePath: 'a.ts', content: 'export async function foo(load) { return await load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        });
        expectFooReference(project);
    });

    test('ignores missing directly injected loaders', function () {
        expectNoReferences(createProject({
            withFiles: [
                { filePath: 'main.ts', content: 'import { foo } from "./a";\nawait foo();' },
                { filePath: 'a.ts', content: 'export async function foo(load) { return await load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        }));
    });

    test('ignores directly injected non-function variables', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: 'main.ts',
                    content: [
                        'import { foo } from "./a";',
                        'const importModule = "not a loader";',
                        'await foo(importModule);'
                    ]
                        .join('\n')
                },
                { filePath: 'a.ts', content: 'export async function foo(load) { return await load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        });
        expectNoReferences(project);
    });

    test('ignores directly injected variables without initializers', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: 'main.ts',
                    content: [
                        'import { foo } from "./a";',
                        'let importModule;',
                        'await foo(importModule);'
                    ]
                        .join('\n')
                },
                { filePath: 'a.ts', content: 'export async function foo(load) { return await load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        });
        expectNoReferences(project);
    });

    test('ignores directly injected parameters without a project-local importing function', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: 'main.ts',
                    content: [
                        'import { foo } from "./a";',
                        'function main(importModule) {',
                        '    return foo(importModule);',
                        '}',
                        'main();'
                    ]
                        .join('\n')
                },
                { filePath: 'a.ts', content: 'export async function foo(load) { return await load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        });
        expectNoReferences(project);
    });
});
