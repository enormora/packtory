import assert from 'node:assert';
import { suite, test } from 'mocha';

import { createNodeImportProbe } from '../../../source/build-support/canaries/package-application-programming-interface-inspection.ts';
import { withTemporaryNodeModules, writePackage } from '../../../source/test-libraries/canary-package-fixtures.ts';
import { executeNativeCanaryProcess, nativeNodePath } from './native-runtime.ts';

suite('package-import-probe-failures', function () {
    test('terminates an import probe that hangs without output', async function () {
        await withTemporaryNodeModules(async function (nodeModulesFolder) {
            await writePackage(nodeModulesFolder, 'runtime', {
                exports: './index.js',
                type: 'module'
            }, {
                'index.js': 'await new Promise(function () { setInterval(function () {}, 1000); });'
            });
            const probe = createNodeImportProbe(100, executeNativeCanaryProcess, nativeNodePath);
            await assert.rejects(
                probe(nodeModulesFolder, 'runtime'),
                /Import probe timed out after 100 ms without output/u
            );
        });
    });
});
