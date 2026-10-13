import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createNodeEngineCompatibilityRule } from '../checks/rules/node-engine-compatibility.ts';
import { analyzedBundle, versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import { validConfigWithoutRegistryFixture } from '../test-libraries/config-fixtures.ts';
import { engineFileManager } from '../test-libraries/node-engine-fixtures.ts';
import { createResolveOptions } from '../test-libraries/package-processor-test-support.ts';
import { buildChecksResult } from './resolved-package.ts';

suite('Node engine check preparation', function () {
    test('builds the manifest and supplies the effective source folder when only the engine check is enabled', async function () {
        const rule = createNodeEngineCompatibilityRule({
            fileManager: engineFileManager(
                {
                    '/workspace/node_modules/direct': { version: '1.0.0', engines: { node: '>=24' } }
                },
                {},
                Array.of<string>()
            )
        });
        const result = await buildChecksResult(
            {
                runChecks: rule.run,
                versionManager: {
                    addVersion(options) {
                        return {
                            ...versionedBundleWithManifest({ name: options.bundle.name }),
                            packageJson: {
                                name: options.bundle.name,
                                version: options.version,
                                engines: { node: '>=22' },
                                dependencies: { direct: '*' }
                            }
                        };
                    }
                }
            },
            validConfigWithoutRegistryFixture({
                checks: { nodeEngineCompatibility: { enabled: true } },
                packages: [ { name: 'root', roots: {} } ]
            }),
            [ {
                name: 'root',
                analyzedBundle: analyzedBundle({ name: 'root' }),
                resolveOptions: { ...createResolveOptions(), sourcesFolder: '/workspace/src' }
            } ]
        );
        if (result.isOk) {
            assert.fail('Expected an engine compatibility failure');
        }
        assert.deepStrictEqual(result.error, {
            type: 'checks',
            issues: [
                'Package "root" failed Node engine compatibility via root -> direct@1.0.0: ' +
                'engines.node ">=22" is not a subset of ">=24"'
            ]
        });
    });
});
