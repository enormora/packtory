import assert from 'node:assert';
import { suite, test } from 'mocha';
import { analyzedBundle, analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import { collectPublicModuleUsage } from './public-module-usage.ts';

suite('public-module-usage', function () {
    test('collectPublicModuleUsage() collects imported and re-exported public modules across bundles', function () {
        const packageBundle = analyzedBundle({
            name: 'package-a',
            roots: {
                main: {
                    js: {
                        sourceFilePath: '/pkg/index.js',
                        targetFilePath: 'index.js',
                        content: '',
                        isExecutable: false
                    }
                },
                feature: {
                    js: {
                        sourceFilePath: '/pkg/feature.js',
                        targetFilePath: 'feature.js',
                        content: '',
                        isExecutable: false
                    }
                },
                ignored: {
                    js: {
                        sourceFilePath: '/pkg/ignored.js',
                        targetFilePath: 'ignored.js',
                        content: '',
                        isExecutable: false
                    }
                }
            },
            contents: [
                analyzedBundleResource('/pkg/index.js', { targetFilePath: 'index.js' }),
                analyzedBundleResource('/pkg/feature.js', { targetFilePath: 'feature.js' }),
                analyzedBundleResource('/pkg/ignored.js', { targetFilePath: 'ignored.js' })
            ],
            surface: { mode: 'implicit', defaultModuleRoot: 'main' }
        });
        const extraBundle = analyzedBundle({
            name: 'Stryker was here',
            roots: {
                main: {
                    js: {
                        sourceFilePath: '/extra/index.js',
                        targetFilePath: 'index.js',
                        content: '',
                        isExecutable: false
                    }
                }
            },
            contents: [analyzedBundleResource('/extra/index.js', { targetFilePath: 'index.js' })],
            surface: { mode: 'implicit', defaultModuleRoot: 'main' }
        });
        const consumer = analyzedBundle({
            name: 'consumer',
            contents: [
                analyzedBundleResource('/consumer/index.js', {
                    content: [
                        'import packageA from "package-a";',
                        'export { feature } from "package-a/feature.js";',
                        'const requiredFeature = require("package-a/feature.js");',
                        'import "./local.js";'
                    ].join('\n')
                }),
                analyzedBundleResource('/consumer/extra.js', {
                    content: 'import "package-a";\nexport * from "package-a/feature.js";\n'
                }),
                analyzedBundleResource('/consumer/readme.md', {
                    targetFilePath: 'README.md',
                    content: 'import "package-a/ignored.js";'
                })
            ]
        });

        const result = collectPublicModuleUsage([consumer, packageBundle, extraBundle]);

        assert.deepStrictEqual(result.get('package-a'), new Set(['/pkg/index.js', '/pkg/feature.js']));
        assert.strictEqual(result.has('Stryker was here'), false);
    });

    test('collectPublicModuleUsage() ignores self-imports and unresolved package specifiers', function () {
        const selfBundle = analyzedBundle({
            name: 'package-a',
            roots: {
                main: {
                    js: {
                        sourceFilePath: '/pkg/index.js',
                        targetFilePath: 'index.js',
                        content: '',
                        isExecutable: false
                    }
                }
            },
            contents: [
                analyzedBundleResource('/pkg/index.js', {
                    content: 'import "package-a";\nimport "missing-package";\n',
                    targetFilePath: 'index.js'
                })
            ],
            surface: { mode: 'implicit', defaultModuleRoot: 'main' }
        });

        const result = collectPublicModuleUsage([selfBundle]);

        assert.deepStrictEqual(result, new Map());
    });
});
