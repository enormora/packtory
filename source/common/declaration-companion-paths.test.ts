import assert from 'node:assert';
import { suite, test } from 'mocha';
import { declarationCompanionCandidates, isDeclarationCompanionFilePath } from './declaration-companion-paths.ts';

suite('declaration-companion-paths', function () {
    test('declarationCompanionCandidates() returns module-specific declaration candidates', function () {
        assert.deepStrictEqual(declarationCompanionCandidates('/src/index.js'), [ '/src/index.d.ts' ]);
        assert.deepStrictEqual(declarationCompanionCandidates('/src/index.mjs'), [
            '/src/index.d.mts',
            '/src/index.d.ts'
        ]);
        assert.deepStrictEqual(declarationCompanionCandidates('/src/index.cjs'), [
            '/src/index.d.cts',
            '/src/index.d.ts'
        ]);
    });

    test('declarationCompanionCandidates() returns no candidates for non-js files', function () {
        assert.deepStrictEqual(declarationCompanionCandidates('/src/data.json'), []);
    });

    test('isDeclarationCompanionFilePath() recognizes declaration companion file paths', function () {
        assert.strictEqual(isDeclarationCompanionFilePath('/src/index.d.ts'), true);
        assert.strictEqual(isDeclarationCompanionFilePath('/src/index.d.mts'), true);
        assert.strictEqual(isDeclarationCompanionFilePath('/src/index.d.cts'), true);
        assert.strictEqual(isDeclarationCompanionFilePath('/src/index.js'), false);
    });
});
