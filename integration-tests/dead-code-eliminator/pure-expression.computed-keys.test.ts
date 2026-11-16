import assert from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import { isPureExpression } from '../../source/test-libraries/expression-purity-test-support.ts';

function createRuntimeProject(): Project {
    return new Project({
        compilerOptions: {
            allowJs: true,
            esModuleInterop: true,
            module: ModuleKind.Node16,
            moduleResolution: ModuleResolutionKind.Node16,
            target: ScriptTarget.ES2022
        },
        skipLoadingLibFiles: true
    });
}
async function writeDiskPackage(root: string): Promise<void> {
    const packageFolder = path.join(root, 'node_modules/schema-lib');
    await mkdir(packageFolder, {
        recursive: true
    });
    await writeFile(
        path.join(packageFolder, 'package.json'),
        '{"name":"schema-lib","type":"module","exports":"./index.js"}'
    );
    await writeFile(path.join(packageFolder, 'index.js'), 'export const resultType = { config: "configuration" };');
}
async function assertDiskPackageInitializerPurity(expected: boolean): Promise<void> {
    const root = await mkdtemp(path.join(temporaryDirectory(), 'packtory-pure-expression-computed-key-'));
    await writeDiskPackage(root);
    const project = createRuntimeProject();
    try {
        const sourceFile = project.createSourceFile(
            path.join(root, 'source/index.ts'),
            'import { resultType } from "schema-lib";\nconst schema = { [resultType.config]: true };',
            {
                overwrite: true
            }
        );
        const expression = sourceFile.getVariableDeclarationOrThrow('schema').getInitializerOrThrow();
        assert.strictEqual(isPureExpression(expression, undefined), expected);
    } finally {
        await rm(root, {
            recursive: true,
            force: true
        });
    }
}

suite('pure-expression computed keys', function () {
    suite('exported object reads', function () {
        test('isPureExpression keeps computed names from resolved package files', async function () {
            await assertDiskPackageInitializerPurity(false);
        });
    });
});
