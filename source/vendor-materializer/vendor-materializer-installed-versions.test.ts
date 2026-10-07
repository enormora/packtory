import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'mocha';
import { createFileManager } from '../file-manager/file-manager.ts';
import { expectOk } from '../test-libraries/vendor-materializer-test-support.ts';
import { createVendorMaterializer } from './vendor-materializer.ts';

const fileManager = createFileManager({ hostFileSystem: fs.promises });

type FlushModule = { readonly default: new () => FlushInstance; };
type FlushInstance = { readonly value: number; };
type ValueModule = { readonly default: number; };

type InstalledPackage = {
    readonly directory: string;
    readonly dependencies: Readonly<Record<string, string>>;
    readonly source: string;
};

async function writeInstalledPackage(root: string, installed: InstalledPackage): Promise<void> {
    const directory = path.join(root, installed.directory);
    await fileManager.writeFile(
        path.join(directory, 'package.json'),
        JSON.stringify({
            name: path.basename(directory),
            dependencies: installed.dependencies,
            main: 'index.cjs'
        })
    );
    await fileManager.writeFile(path.join(directory, 'index.cjs'), installed.source);
}

async function withInstalledPackages(
    packages: readonly InstalledPackage[],
    action: (root: string) => Promise<void>
): Promise<void> {
    const root = await fs.promises.mkdtemp(path.join(tmpdir(), 'packtory-installed-versions-'));
    for (const installed of packages) {
        await writeInstalledPackage(root, installed);
    }
    try {
        await action(root);
    } finally {
        await fs.promises.rm(root, { recursive: true, force: true });
    }
}

async function vendorPackages(root: string, names: readonly string[]): Promise<string> {
    const result = expectOk(
        await createVendorMaterializer({ fileManager }).materializeExternals({
            projectFolder: root,
            initialDependencyNames: names
        })
    );
    const output = path.join(root, 'artifact');
    for (const entry of result.entries) {
        await fileManager.copyFile(entry.sourceAbsolutePath, path.join(output, entry.targetRelativePath));
    }
    return output;
}

async function linkInstalledPackage(root: string, name: string, sourceDirectory: string): Promise<void> {
    const linkPath = path.join(root, 'node_modules', name);
    await fs.promises.mkdir(path.dirname(linkPath), { recursive: true });
    await fs.promises.symlink(path.join(root, sourceDirectory), linkPath, 'dir');
}

async function assertFlushValue(output: string, name: string): Promise<void> {
    const { default: Flush } = await import(
        pathToFileURL(path.join(output, 'node_modules', name, 'index.cjs')).href
    ) as unknown as FlushModule;
    const flush = new Flush();
    assert.strictEqual(flush.value, 42);
}

suite('vendor-materializer installed versions', function () {
    test('preserves incompatible nested versions and their transitive dependencies', async function () {
        await withInstalledPackages([
            {
                directory: 'node_modules/versioned-stream',
                dependencies: {},
                source: 'module.exports = { Stream: class {} };'
            },
            {
                directory: 'node_modules/flush',
                dependencies: { 'versioned-stream': '^3.0.0' },
                source: 'module.exports = class Flush extends require("versioned-stream") {};'
            },
            {
                directory: 'node_modules/flush/node_modules/versioned-stream',
                dependencies: { linked: '1.0.0' },
                source: 'module.exports = class Stream { value = require("linked"); };'
            },
            {
                directory: 'node_modules/flush/node_modules/linked',
                dependencies: {},
                source: 'module.exports = 42;'
            }
        ], async function (root) {
            const output = await vendorPackages(root, [ 'versioned-stream', 'flush' ]);
            const { default: Flush } = await import(
                pathToFileURL(path.join(output, 'node_modules/flush/index.cjs')).href
            ) as unknown as FlushModule;
            const flush = new Flush();
            assert.strictEqual(flush.value, 42);
            assert.strictEqual(
                await fileManager.readFile(
                    path.join(output, 'node_modules/flush/node_modules/linked/index.cjs')
                ),
                'module.exports = 42;'
            );
            assert.strictEqual(
                await fileManager.readFile(
                    path.join(output, 'node_modules/versioned-stream/index.cjs')
                ),
                'module.exports = { Stream: class {} };'
            );
        });
    });

    test('preserves conflicting versions behind package-manager symlinks for multiple consumers', async function () {
        await withInstalledPackages([
            {
                directory: 'node_modules/.pnpm/stream@2/node_modules/versioned-stream',
                dependencies: {},
                source: 'module.exports = { Stream: class {} };'
            },
            {
                directory: 'node_modules/.pnpm/stream@1/node_modules/versioned-stream',
                dependencies: {},
                source: 'module.exports = class Stream { value = 42; };'
            },
            {
                directory: 'node_modules/flush',
                dependencies: { 'versioned-stream': '^1.0.0' },
                source: 'module.exports = class Flush extends require("versioned-stream") {};'
            },
            {
                directory: 'node_modules/another',
                dependencies: { 'versioned-stream': '^1.0.0' },
                source: 'module.exports = class Flush extends require("versioned-stream") {};'
            }
        ], async function (root) {
            await linkInstalledPackage(
                root,
                'versioned-stream',
                'node_modules/.pnpm/stream@2/node_modules/versioned-stream'
            );
            await linkInstalledPackage(
                root,
                'flush/node_modules/versioned-stream',
                'node_modules/.pnpm/stream@1/node_modules/versioned-stream'
            );
            await linkInstalledPackage(
                root,
                'another/node_modules/versioned-stream',
                'node_modules/.pnpm/stream@1/node_modules/versioned-stream'
            );
            const output = await vendorPackages(root, [ 'versioned-stream', 'flush', 'another' ]);
            await assertFlushValue(output, 'flush');
            await assertFlushValue(output, 'another');
        });
    });

    test('retains peer requirements from every installed version', async function () {
        await withInstalledPackages([
            { directory: 'node_modules/versioned-stream', dependencies: {}, source: '' },
            { directory: 'node_modules/flush', dependencies: { 'versioned-stream': '^1.0.0' }, source: '' },
            { directory: 'node_modules/flush/node_modules/versioned-stream', dependencies: {}, source: '' }
        ], async function (root) {
            await fileManager.writeFile(
                path.join(root, 'node_modules/versioned-stream/package.json'),
                '{"peerDependencies":{"host-a":"1.0.0"}}'
            );
            await fileManager.writeFile(
                path.join(root, 'node_modules/flush/node_modules/versioned-stream/package.json'),
                '{"peerDependencies":{"host-b":"1.0.0"}}'
            );
            const result = expectOk(
                await createVendorMaterializer({ fileManager }).materializeExternals({
                    projectFolder: root,
                    initialDependencyNames: [ 'versioned-stream', 'flush' ]
                })
            );
            assert.deepStrictEqual(result.peerRequirements.get('versioned-stream'), [ 'host-a', 'host-b' ]);
        });
    });

    test('preserves dependency aliases pointing to another installed package', async function () {
        await withInstalledPackages([
            { directory: 'node_modules/physical', dependencies: {}, source: 'module.exports = 42;' }
        ], async function (root) {
            await linkInstalledPackage(root, 'alias', 'node_modules/physical');
            const output = await vendorPackages(root, [ 'alias' ]);
            const imported = await import(
                pathToFileURL(path.join(output, 'node_modules/alias/index.cjs')).href
            ) as unknown as ValueModule;
            assert.strictEqual(imported.default, 42);
        });
    });

    test('preserves shared hoisted dependencies and terminates cycles', async function () {
        await withInstalledPackages([
            {
                directory: 'node_modules/parent',
                dependencies: { shared: '1.0.0' },
                source: 'module.exports = require("shared");'
            },
            {
                directory: 'node_modules/shared',
                dependencies: { parent: '1.0.0' },
                source: 'module.exports = 42;'
            }
        ], async function (root) {
            const output = await vendorPackages(root, [ 'parent', 'shared' ]);
            const { default: value }: { readonly default: number; } = await import(
                pathToFileURL(path.join(output, 'node_modules/parent/index.cjs')).href
            ) as unknown as ValueModule;
            assert.strictEqual(value, 42);
        });
    });
});
