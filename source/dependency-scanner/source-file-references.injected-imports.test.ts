import { suite, test } from 'mocha';
import type { Project } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import {
    createDirectInjectedLoaderProject,
    expectFooReference,
    expectNoReferences
} from './source-file-references.injected-imports-fixtures.test.ts';

type InjectedLoaderProjectInput = {
    readonly dependencyCallExpression: string;
    readonly injectedLoaderLines: readonly string[];
};

function createInjectedLoaderProject(input: InjectedLoaderProjectInput): Project {
    return createProject({
        withFiles: [
            {
                filePath: 'main.ts',
                content: [
                    'import { foo } from "./a";',
                    'await foo({',
                    ...input.injectedLoaderLines,
                    '});'
                ]
                    .join('\n')
            },
            {
                filePath: 'a.ts',
                content: `export async function foo(deps) { return await ${input.dependencyCallExpression}; }`
            },
            { filePath: 'foo.ts', content: '' }
        ]
    });
}

function createInjectedLoaderProjectWithReturn(loaderReturnExpression: string): Project {
    return createInjectedLoaderProject({
        dependencyCallExpression: 'deps.load("./foo")',
        injectedLoaderLines: [
            '    load(modulePath) {',
            `        return ${loaderReturnExpression};`,
            '    }'
        ]
    });
}

suite('source-file-references injected dynamic imports', function () {
    suite('container loaders', function () {
        test('returns array with dynamic imports resolved through an injected loader', function () {
            expectFooReference(createInjectedLoaderProjectWithReturn('import(modulePath)'));
        });

        test('supports function-expression injected loaders', function () {
            expectFooReference(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [
                    '    load: function (modulePath) {',
                    '        return import(modulePath);',
                    '    }'
                ]
            }));
        });

        test('supports arrow-function injected loaders', function () {
            expectFooReference(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [ '    load: (modulePath) => import(modulePath)' ]
            }));
        });

        test('supports loaders with additional calls before the import', function () {
            expectFooReference(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [
                    '    load(modulePath) {',
                    '        track(modulePath);',
                    '        return import(modulePath);',
                    '    }'
                ]
            }));
        });

        test('supports loaders with sibling object properties', function () {
            expectFooReference(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [
                    '    ignored: true,',
                    '    load(modulePath) {',
                    '        return import(modulePath);',
                    '    }'
                ]
            }));
        });

        test('supports loaders with spread sibling object properties', function () {
            expectFooReference(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [
                    '    ...extra,',
                    '    load(modulePath) {',
                    '        return import(modulePath);',
                    '    }'
                ]
            }));
        });

        test('supports shorthand loader properties', function () {
            const project = createProject({
                withFiles: [
                    {
                        filePath: 'main.ts',
                        content: [
                            'import { foo } from "./a";',
                            'const load = (modulePath) => import(modulePath);',
                            'await foo({ load });'
                        ]
                            .join('\n')
                    },
                    {
                        filePath: 'a.ts',
                        content: 'export async function foo(deps) { return await deps.load("./foo"); }'
                    },
                    { filePath: 'foo.ts', content: '' }
                ]
            });

            expectFooReference(project);
        });

        test('ignores non-imported string arguments', function () {
            expectFooReference(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo", "./bar")',
                injectedLoaderLines: [
                    '    load(modulePath) {',
                    '        return import(modulePath);',
                    '    }'
                ]
            }));
        });
    });

    suite('ignored loader bodies', function () {
        test('ignores injected loaders that do not import the passed module path', function () {
            expectNoReferences(createInjectedLoaderProjectWithReturn('resolve(modulePath)'));
        });

        test('ignores injected loaders that import another value', function () {
            expectNoReferences(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [
                    '    load(modulePath) {',
                    '        const otherPath = "./foo";',
                    '        return import(otherPath);',
                    '    }'
                ]
            }));
        });

        suite('ignored object properties', function () {
            test('ignores object literals that provide a different property', function () {
                expectNoReferences(createInjectedLoaderProject({
                    dependencyCallExpression: 'deps.load("./foo")',
                    injectedLoaderLines: [
                        '    resolve(modulePath) {',
                        '        return import(modulePath);',
                        '    }'
                    ]
                }));
            });

            test('ignores object literal property assignments with a different property name', function () {
                expectNoReferences(createInjectedLoaderProject({
                    dependencyCallExpression: 'deps.load("./foo")',
                    injectedLoaderLines: [ '    resolve: (modulePath) => import(modulePath)' ]
                }));
            });

            test('ignores shorthand object literal properties with a different property name', function () {
                const project = createProject({
                    withFiles: [
                        {
                            filePath: 'main.ts',
                            content: [
                                'import { foo } from "./a";',
                                'const resolve = (modulePath) => import(modulePath);',
                                'await foo({ resolve });'
                            ]
                                .join('\n')
                        },
                        {
                            filePath: 'a.ts',
                            content: 'export async function foo(deps) { return await deps.load("./foo"); }'
                        },
                        { filePath: 'foo.ts', content: '' }
                    ]
                });

                expectNoReferences(project);
            });

            test('ignores shorthand object literal properties that do not import', function () {
                const project = createProject({
                    withFiles: [
                        {
                            filePath: 'main.ts',
                            content: [
                                'import { foo } from "./a";',
                                'const load = (modulePath) => resolve(modulePath);',
                                'await foo({ load });'
                            ]
                                .join('\n')
                        },
                        {
                            filePath: 'a.ts',
                            content: 'export async function foo(deps) { return await deps.load("./foo"); }'
                        },
                        { filePath: 'foo.ts', content: '' }
                    ]
                });

                expectNoReferences(project);
            });

            test('ignores object literals without a direct loader property', function () {
                expectNoReferences(createInjectedLoaderProject({
                    dependencyCallExpression: 'deps.load("./foo")',
                    injectedLoaderLines: [ '    ...extra' ]
                }));
            });
        });

        test('ignores loaders that do not accept the imported argument', function () {
            expectNoReferences(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [
                    '    load() {',
                    '        return import("./foo");',
                    '    }'
                ]
            }));
        });

        test('ignores injected loaders that import a literal directly', function () {
            expectNoReferences(createInjectedLoaderProjectWithReturn('import("./foo")'));
        });

        suite('ignored direct loader returns', function () {
            test('ignores injected loaders that do not return the dynamic import', function () {
                expectNoReferences(createDirectInjectedLoaderProject({
                    callSiteLoaderExpression: 'function (modulePath) { import(modulePath); }',
                    dependencyCallExpression: 'load("./foo")'
                }));
            });

            test('ignores directly injected loaders that return another function', function () {
                expectNoReferences(createDirectInjectedLoaderProject({
                    callSiteLoaderExpression: [
                        'function (modulePath) {',
                        '    return function () { return import(modulePath); };',
                        '}'
                    ]
                        .join('\n'),
                    dependencyCallExpression: 'load("./foo")'
                }));
            });

            test('ignores directly injected arrow loaders without an expression body', function () {
                expectNoReferences(createDirectInjectedLoaderProject({
                    callSiteLoaderExpression: '(modulePath) => { import(modulePath); }',
                    dependencyCallExpression: 'load("./foo")'
                }));
            });
        });

        test('ignores non-function property values', function () {
            expectNoReferences(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [ '    load: "not a loader"' ]
            }));
        });

        test('ignores injected dynamic import calls without an argument', function () {
            expectNoReferences(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load("./foo")',
                injectedLoaderLines: [
                    '    load(modulePath) {',
                    '        return import();',
                    '    }'
                ]
            }));
        });
    });

    suite('ignored call shapes', function () {
        test('ignores call sites without an object literal argument', function () {
            expectNoReferences(createProject({
                withFiles: [
                    { filePath: 'main.ts', content: 'import { foo } from "./a";\nawait foo();' },
                    {
                        filePath: 'a.ts',
                        content: 'export async function foo(deps) { return await deps.load("./foo"); }'
                    },
                    { filePath: 'foo.ts', content: '' }
                ]
            }));
        });

        test('ignores object literal arguments passed to other functions', function () {
            expectNoReferences(createProject({
                withFiles: [
                    {
                        filePath: 'main.ts',
                        content: [
                            'function bar(deps) { return deps; }',
                            'bar({',
                            '    load(modulePath) {',
                            '        return import(modulePath);',
                            '    }',
                            '});'
                        ]
                            .join('\n')
                    },
                    {
                        filePath: 'a.ts',
                        content: 'export async function foo(deps) { return await deps.load("./foo"); }'
                    },
                    { filePath: 'foo.ts', content: '' }
                ]
            }));
        });

        test('ignores dependency calls outside exported functions', function () {
            expectNoReferences(createProject({
                withFiles: [
                    {
                        filePath: 'main.ts',
                        content: [
                            'import { foo } from "./a";',
                            'foo.run({',
                            '    load(modulePath) {',
                            '        return import(modulePath);',
                            '    }',
                            '});'
                        ]
                            .join('\n')
                    },
                    {
                        filePath: 'a.ts',
                        content: 'export const foo = { run(deps) { return deps.load("./foo"); } };'
                    },
                    { filePath: 'foo.ts', content: '' }
                ]
            }));
        });

        test('ignores dependency calls with no literal module path', function () {
            expectNoReferences(createInjectedLoaderProject({
                dependencyCallExpression: 'deps.load(modulePath)',
                injectedLoaderLines: [
                    '    load(modulePath) {',
                    '        return import(modulePath);',
                    '    }'
                ]
            }));
        });
    });
});
