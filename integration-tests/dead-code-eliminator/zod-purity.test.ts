import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, type SourceFile } from 'ts-morph';
import { createExpressionPurityChecker } from '../../source/dead-code-eliminator/expression-purity.ts';
import { establishEvaluationEnvironment } from '../../source/dead-code-eliminator/evaluation/evaluation-environment-establishment.ts';
import { createSideEffectClassifier } from '../../source/dead-code-eliminator/side-effect-classifier.ts';
import { resolveRuntimeModule } from '../../source/dead-code-eliminator/runtime-module-resolution.ts';
import type { DeadCodeEliminationSettings } from '../../source/configuration/dead-code-elimination-settings.ts';

function sourceFileWithInstalledPackages(
    content: string,
    settings: DeadCodeEliminationSettings | undefined
): SourceFile {
    const project = new Project({
        compilerOptions: {
            allowJs: true,
            esModuleInterop: true,
            module: ModuleKind.Node16,
            moduleResolution: ModuleResolutionKind.Node16,
            target: ScriptTarget.ES2022,
            noLib: true,
            types: []
        },
        skipLoadingLibFiles: true
    });
    const sourceFile = project.createSourceFile(
        path.join(process.cwd(), 'target/dead-code-elimination-zod-entry.ts'),
        content
    );
    establishEvaluationEnvironment([ sourceFile ], settings, resolveRuntimeModule);
    return sourceFile;
}

suite('Zod purity integration', function () {
    test('proves typed namespace aliases through runtime ESM declarations', function () {
        const sourceFile = sourceFileWithInstalledPackages(
            'import * as mini from "zod/mini"; const z = mini.z; const make = z.object; const schema = make({ value: z.string() });',
            undefined
        );
        const expression = sourceFile.getVariableDeclarationOrThrow('schema').getInitializerOrThrow();
        assert.strictEqual(createExpressionPurityChecker()(expression), true);
    });

    test('proves Zod mini schema construction pure through runtime ESM resolution', function () {
        const sourceFile = sourceFileWithInstalledPackages(
            'import { z } from "zod/mini";\nconst schema = z.object({ value: z.string() });',
            undefined
        );
        const expression = sourceFile.getVariableDeclarationOrThrow('schema').getInitializerOrThrow();

        const isPure = createExpressionPurityChecker();
        assert.strictEqual(isPure(expression), true);
    });

    test('classifies trusted Zod mini fluent builder calls as pure', function () {
        const classifySideEffects = createSideEffectClassifier();
        const sourceFile = sourceFileWithInstalledPackages(
            'import { z } from "zod/mini"; const schema = z.string().check(z.minLength(1));',
            { enabled: true, pureImports: [ { from: 'zod/mini' } ] }
        );

        assert.deepStrictEqual(classifySideEffects(sourceFile), []);
    });
});
