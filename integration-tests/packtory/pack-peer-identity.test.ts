import assert from 'node:assert';
import fileSystem from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { suite, test } from 'mocha';
import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { createFileManager } from '../../source/file-manager/file-manager.ts';
import { packAllPackages, type PacktoryConfiguration } from '../../source/packages/packtory/packtory.entry-point.ts';
import { createPackageConfiguration } from './publish-fixture-support.ts';

const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });

async function createIdentityConfiguration(
    projectFolder: string,
    deadCodeElimination: boolean
): Promise<PacktoryConfiguration> {
    const sourcesFolder = path.join(projectFolder, 'source');
    await fileManager.writeFile(path.join(sourcesFolder, 'peer.js'), 'export const token = "peer";\n');
    await fileManager.writeFile(path.join(sourcesFolder, 'peer.d.ts'), 'export declare const token: string;\n');
    await fileManager.writeFile(path.join(sourcesFolder, 'leaf.js'), 'export { token } from "./peer.js";\n');
    await fileManager.writeFile(
        path.join(sourcesFolder, 'leaf.d.ts'),
        [
            'import type { token } from "./peer.js";',
            'export { token } from "./peer.js";',
            'declare const generatorBrand: unique symbol;',
            'export interface Generator<T> { readonly [generatorBrand]: T; readonly token: typeof token; }'
        ]
            .join('\n')
    );
    await fileManager.writeFile(path.join(sourcesFolder, 'bundle.js'), 'export { token } from "./leaf.js";\n');
    await fileManager.writeFile(
        path.join(sourcesFolder, 'bundle.d.ts'),
        'export { token, type Generator } from "./leaf.js";\n'
    );
    return {
        commonPackageSettings: {
            sourcesFolder,
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' },
            deadCodeElimination: { enabled: deadCodeElimination }
        },
        packages: [
            createPackageConfiguration(projectFolder, 'identity-peer', 'peer'),
            createPackageConfiguration(projectFolder, 'identity-leaf', 'leaf', {
                bundlePeerDependencies: [ 'identity-peer' ]
            }),
            createPackageConfiguration(projectFolder, 'identity-bundle', 'bundle', {
                bundleDependencies: [ 'identity-leaf', 'identity-peer' ]
            })
        ]
    };
}

async function verifyPackedIdentity(projectFolder: string, deadCodeElimination: boolean): Promise<void> {
    const outputPath = path.join(projectFolder, 'node_modules');
    const outcome = await packAllPackages(await createIdentityConfiguration(projectFolder, deadCodeElimination), {
        outputPath,
        version: '1.2.3',
        vendorDependencies: true
    });
    assert.deepStrictEqual(outcome.result.isOk ? outcome.result.value : outcome.result.error, {
        packageNames: [ 'identity-peer', 'identity-leaf', 'identity-bundle' ]
    });
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
        compilerOptions: {
            module: ModuleKind.NodeNext,
            target: ScriptTarget.ESNext,
            strict: true,
            noEmit: true,
            types: []
        }
    });
    project.createSourceFile(
        path.join(projectFolder, 'consumer.mts'),
        [
            'import type { Generator as Leaf } from "identity-leaf";',
            'import type { Generator as Bundled } from "identity-bundle";',
            'declare const leaf: Leaf<number>;',
            'declare const bundled: Bundled<number>;',
            'const fromLeaf: Bundled<number> = leaf;',
            'const fromBundled: Leaf<number> = bundled;'
        ]
            .join('\n')
    );
    assert.deepStrictEqual(
        project.getPreEmitDiagnostics().map(function diagnosticText(diagnostic) {
            return diagnostic.getMessageText();
        }),
        []
    );
}

suite('packed peer dependency identity', function () {
    for (const deadCodeElimination of [ false, true ]) {
        test(`preserves branded peer types with dead code elimination ${deadCodeElimination}`, async function () {
            const projectFolder = await fileSystem.promises.mkdtemp(path.join(tmpdir(), 'packtory-peer-identity-'));
            try {
                await verifyPackedIdentity(projectFolder, deadCodeElimination);
            } finally {
                await fileSystem.promises.rm(projectFolder, { recursive: true, force: true });
            }
        });
    }
});
