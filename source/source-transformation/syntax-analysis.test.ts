import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createSyntaxAnalysis } from './syntax-analysis.ts';

suite('syntax analysis snapshots', function () {
    test('reuses analysis until the compiler source changes', function () {
        const source = createProject().createSourceFile('input.js', 'const value = 1;');
        let analyses = 0;
        const analyze = createSyntaxAnalysis(function (current) {
            analyses += 1;
            return current.getFullText();
        });

        assert.strictEqual(analyze(source), 'const value = 1;');
        assert.strictEqual(analyze(source), 'const value = 1;');
        assert.strictEqual(analyses, 1);
        source.replaceWithText('const value = 2;');
        assert.strictEqual(analyze(source), 'const value = 2;');
        assert.strictEqual(analyses, 2);
    });

    test('keeps identical text in different projects separate and reuses undefined results', function () {
        const first = createProject().createSourceFile('input.js', 'const value = 1;');
        const second = createProject().createSourceFile('input.js', 'const value = 1;');
        let analyses = 0;
        const analyze = createSyntaxAnalysis<undefined>(function () {
            analyses += 1;
            return undefined;
        });

        analyze(first);
        analyze(first);
        assert.strictEqual(analyses, 1);
        analyze(second);
        assert.strictEqual(analyses, 2);
    });
});
