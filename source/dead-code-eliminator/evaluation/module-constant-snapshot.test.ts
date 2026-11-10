import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createModuleConstantSnapshot } from './module-constant-snapshot.ts';

suite('module constant snapshots', function () {
    for (const content of [ 'export default class{}', 'export default function(){}' ]) {
        test(`keeps callable default exports outside primitive snapshots for ${content}`, function () {
            const sourceFile = createProject().createSourceFile('/source/index.js', content);
            const snapshot = createModuleConstantSnapshot([ {
                sourceFile,
                targetFilePath: 'index.js',
                moduleReferences: []
            } ], function () {
                return undefined;
            });
            assert.deepStrictEqual(snapshot.modules.get(sourceFile)?.exports, new Map());
        });
    }
});
