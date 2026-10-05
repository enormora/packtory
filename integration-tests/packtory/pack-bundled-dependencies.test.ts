import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { suite, test } from 'mocha';
import { z } from 'zod/mini';
import { createFileManager } from '../../source/file-manager/file-manager.ts';
import {
    packPackage,
    resolveAndLinkAll,
    type PacktoryConfig
} from '../../source/packages/packtory/packtory.entry-point.ts';

const fileManager = createFileManager({ hostFileSystem: fs.promises });
const readArtifactText = fileManager.readFile;

async function readManifest(packageFolder: string): Promise<Record<string, unknown>> {
    const content = await readArtifactText(path.join(packageFolder, 'package.json'));
    return z.record(z.string(), z.unknown()).parse(JSON.parse(content));
}

async function sharedPrivateConfig(projectFolder: string, allowList: readonly string[]): Promise<PacktoryConfig> {
    const sourcesFolder = path.join(projectFolder, 'source');
    await fileManager.writeFile(
        path.join(sourcesFolder, 'a.js'),
        'export { answer } from "./shared.js";\nexport { marker } from "./b.js";\n'
    );
    await fileManager.writeFile(
        path.join(sourcesFolder, 'b.js'),
        'export { answer } from "./shared.js";\nexport const marker = "bundled";\n'
    );
    await fileManager.writeFile(path.join(sourcesFolder, 'shared.js'), 'export function answer() { return 42; }\n');
    await fileManager.writeFile(path.join(sourcesFolder, 'shared.d.ts'), 'export declare function answer(): number;\n');
    await fileManager.writeFile(path.join(sourcesFolder, 'a.d.ts'), 'export { answer } from "./shared.js";\n');
    await fileManager.writeFile(path.join(sourcesFolder, 'b.d.ts'), 'export { answer } from "./shared.js";\n');
    return {
        commonPackageSettings: {
            sourcesFolder,
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' },
            deadCodeElimination: { enabled: false }
        },
        checks: { noDuplicatedFiles: { enabled: true, allowList } },
        packages: [
            {
                name: 'pkg-a',
                roots: {
                    main: {
                        js: path.join(sourcesFolder, 'a.js'),
                        declarationFile: path.join(sourcesFolder, 'a.d.ts')
                    }
                },
                bundleDependencies: [ 'pkg-b' ]
            },
            {
                name: 'pkg-b',
                roots: {
                    main: {
                        js: path.join(sourcesFolder, 'b.js'),
                        declarationFile: path.join(sourcesFolder, 'b.d.ts')
                    }
                }
            }
        ]
    };
}

async function importConsumerArtifact(artifactFolder: string): Promise<string> {
    const consumerFolder = await fs.promises.mkdtemp(path.join(tmpdir(), 'packtory-consumer-'));
    try {
        await fs.promises.cp(artifactFolder, path.join(consumerFolder, 'node_modules/pkg-a'), { recursive: true });
        return await new Promise<string>(function (resolve, reject) {
            execFile(
                process.execPath,
                [
                    '--input-type=module',
                    '-e',
                    'const { answer, marker } = await import("pkg-a"); console.log(JSON.stringify([answer(), marker]));'
                ],
                { cwd: consumerFolder, env: { NODE_PATH: '' }, timeout: 10_000 },
                function (error, stdout) {
                    if (error instanceof Error) {
                        reject(error);
                        return;
                    }
                    resolve(stdout.trim());
                }
            );
        });
    } finally {
        await fs.promises.rm(consumerFolder, { recursive: true, force: true });
    }
}

async function verifySharedPrivateArtifact(config: PacktoryConfig, projectFolder: string): Promise<void> {
    const outputPath = path.join(projectFolder, 'artifact');
    const outcome = await packPackage({
        ...config,
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [
                    path.join(projectFolder, 'source/shared.js'),
                    path.join(projectFolder, 'source/shared.d.ts')
                ]
            }
        }
    }, { packageName: 'pkg-a', format: 'folder', outputPath, version: '1.2.3', vendorDependencies: true });
    assert.deepStrictEqual(outcome.result.isOk ? outcome.result.value : outcome.result.error, undefined);
    assert.strictEqual(
        await readArtifactText(path.join(outputPath, 'a.js')),
        'export { answer } from "./shared.js";\nexport { marker } from "pkg-b";\n'
    );
    assert.strictEqual(
        await readArtifactText(path.join(outputPath, 'shared.d.ts')),
        'export declare function answer(): number;\n'
    );
    const manifest = await readManifest(path.join(outputPath, 'node_modules/pkg-b'));
    assert.deepStrictEqual(manifest.exports, { '.': { import: './b.js', types: './b.d.ts' } });
    assert.strictEqual(await importConsumerArtifact(outputPath), '[42,"bundled"]');
}

async function verifyDuplicationConsent(projectFolder: string): Promise<void> {
    const config = await sharedPrivateConfig(projectFolder, []);
    const rejected = await resolveAndLinkAll(config);
    assert.strictEqual(rejected.result.isErr, true);
    assert.partialDeepStrictEqual(rejected.result.error, { type: 'checks' });
    await verifySharedPrivateArtifact(config, projectFolder);
}

suite('pack bundled dependencies', function () {
    test('retains shared private authoring files and honors duplication consent', async function () {
        const projectFolder = await fs.promises.mkdtemp(path.join(tmpdir(), 'packtory-authoring-'));
        try {
            await verifyDuplicationConsent(projectFolder);
        } finally {
            await fs.promises.rm(projectFolder, { recursive: true, force: true });
        }
    });
});
