import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, type SourceFile } from 'ts-morph';
import { createExpressionPurityChecker } from '../../source/dead-code-eliminator/pure-expression.ts';
import { createSideEffectClassifier } from '../../source/dead-code-eliminator/side-effect-classifier.ts';
import { resolveRuntimeModule } from '../../source/dead-code-eliminator/runtime-module-resolution.ts';

function sourceFileWithInstalledPackages(content: string): SourceFile {
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
    return project.createSourceFile(
        path.join(process.cwd(), 'target/dead-code-elimination-zod-entry.ts'),
        content
    );
}

suite('Zod purity integration', function () {
    test('proves Zod mini schema construction pure through runtime ESM resolution', function () {
        const sourceFile = sourceFileWithInstalledPackages(
            'import { z } from "zod/mini";\nconst schema = z.object({ value: z.string() });'
        );
        const expression = sourceFile.getVariableDeclarationOrThrow('schema').getInitializerOrThrow();

        const isPure = createExpressionPurityChecker(undefined, resolveRuntimeModule);
        assert.strictEqual(isPure(expression), true);
    });

    test('classifies trusted Zod mini fluent builder calls as pure', function () {
        const classifySideEffects = createSideEffectClassifier([]);
        const sourceFile = sourceFileWithInstalledPackages(
            'import { z } from "zod/mini"; const schema = z.string().check(z.minLength(1));'
        );

        assert.deepStrictEqual(
            classifySideEffects(sourceFile, {
                enabled: true,
                pureImports: [ { from: 'zod/mini' } ]
            }),
            []
        );
    });
});
