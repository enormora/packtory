import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from '../reachability/binding-extractor.ts';
import { buildModuleAnalysis } from './module-analysis.ts';

function moduleKindFor(targetFilePath: string): string {
    const analysis = buildModuleAnalysis({
        sourceFilePath: `/src/${targetFilePath}`,
        targetFilePath,
        sourceFile: undefined,
        bindings: [],
        deadCodeElimination: undefined
    });
    return analysis.kind;
}

suite('liveness module analysis', function () {
    test('moduleKindForTargetPath distinguishes runtime and declaration modules', function () {
        assert.strictEqual(moduleKindFor('index.js'), 'runtime');
        assert.strictEqual(moduleKindFor('index.d.ts'), 'declaration');
        assert.strictEqual(moduleKindFor('index.d.mts'), 'declaration');
        assert.strictEqual(moduleKindFor('index.js.map'), 'source-map');
        assert.strictEqual(moduleKindFor('styles.css'), 'asset');
        assert.strictEqual(moduleKindFor('LICENSE'), 'other');
    });

    test('buildModuleAnalysis records no effects when no source file is available', function () {
        const analysis = buildModuleAnalysis({
            sourceFilePath: '/src/LICENSE',
            targetFilePath: 'LICENSE',
            sourceFile: undefined,
            bindings: [],
            deadCodeElimination: undefined
        });

        assert.deepStrictEqual(analysis.effects, []);
    });

    test('buildModuleAnalysis records declarations and side effects', function () {
        const project = createProject({
            withFiles: [ {
                filePath: 'index.ts',
                content: 'const privateValue = 1;\nexport const publicValue = 2;\nconsole.log(publicValue);\n'
            } ]
        });
        const sourceFile = project.getSourceFileOrThrow('index.ts');
        const analysis = buildModuleAnalysis({
            sourceFilePath: '/src/index.ts',
            targetFilePath: 'index.ts',
            sourceFile,
            bindings: extractTopLevelBindings(sourceFile),
            deadCodeElimination: undefined
        });

        assert.partialDeepStrictEqual(analysis, {
            kind: 'runtime',
            declarations: [
                { name: 'privateValue', exported: false },
                { name: 'publicValue', exported: true }
            ],
            effects: [ { line: 3, kind: 'expression statement' } ]
        });
    });
});
