import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isCodeTargetPath, isDeclarationCodeTargetPath, isRuntimeCodeTargetPath } from './runtime-code.ts';

suite('code target paths', function () {
    for (
        const [ targetFilePath, runtime, declaration ] of [
            [ 'index.cjs', true, false ],
            [ 'index.cts', true, false ],
            [ 'index.js', true, false ],
            [ 'index.jsx', true, false ],
            [ 'index.mjs', true, false ],
            [ 'index.mts', true, false ],
            [ 'index.ts', true, false ],
            [ 'index.tsx', true, false ],
            [ 'index.d.ts', false, true ],
            [ 'index.d.cts', false, true ],
            [ 'index.d.mts', false, true ],
            [ 'index.js.map', false, false ],
            [ 'folder.ts/package.json', false, false ],
            [ 'index.TS', false, false ],
            [ 'index', false, false ]
        ] as const
    ) {
        test(`classifies ${targetFilePath}`, function () {
            assert.strictEqual(isRuntimeCodeTargetPath(targetFilePath), runtime);
            assert.strictEqual(isDeclarationCodeTargetPath(targetFilePath), declaration);
            assert.strictEqual(isCodeTargetPath(targetFilePath), runtime || declaration);
        });
    }
});
