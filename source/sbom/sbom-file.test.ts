import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { PublishSettings } from '../config/publish-settings.ts';
import type { SbomPackage } from '../published-package/published-package.ts';
import { createSbomFileBuilder, type SbomFileBuilder } from './sbom-file.ts';

type SbomSibling = Parameters<SbomFileBuilder['generate']>[1][number];

const enabledSbom: PublishSettings = { access: 'public', sbom: { enabled: true } };
const disabledSbom: PublishSettings = { access: 'public', sbom: { enabled: false } };
const defaultPublishSettings: PublishSettings = { access: 'public' };

type FactoryOverrides = {
    readonly resolveLicense?: SinonSpy;
    readonly serialize?: SinonSpy;
    readonly toolVersionProvider?: SinonSpy;
    readonly projectFolder?: string;
};
type BuilderFixture = {
    readonly builder: SbomFileBuilder;
    readonly resolveLicense: SinonSpy;
    readonly serialize: SinonSpy;
    readonly toolVersionProvider: SinonSpy;
};

function createBuilder(overrides: FactoryOverrides = {}): BuilderFixture {
    const resolveLicense = overrides.resolveLicense ?? fake.resolves('MIT');
    const serialize = overrides.serialize ?? fake.returns('{"sbom":"stub"}');
    const toolVersionProvider = overrides.toolVersionProvider ?? fake.resolves('tool-version');
    const builder = createSbomFileBuilder({
        licenseResolver: { resolveLicense },
        sbomSerializer: { serialize },
        toolVersionProvider,
        projectFolder: overrides.projectFolder ?? '/the-project'
    });
    return { builder, resolveLicense, serialize, toolVersionProvider };
}

function createSibling(name: string, license?: string): SbomSibling {
    return {
        name,
        packageJson: { name, version: '0.0.1', ...license !== undefined && { license } }
    };
}

type BundleOverrides = {
    readonly name: string;
    readonly version: string;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
};

function createBundle(overrides: BundleOverrides): SbomPackage {
    const dependencies = overrides.dependencies ?? {};
    const peerDependencies = overrides.peerDependencies ?? {};
    return {
        dependencies,
        peerDependencies,
        packageJson: { name: overrides.name, version: overrides.version, dependencies, peerDependencies }
    };
}

suite('sbom-file', function () {
    suite('enablement and output', function () {
        test('generate() returns a single sbom.cdx.json FileDescription when SBOM is enabled', async function () {
            const { builder } = createBuilder();
            const result = await builder.generate(createBundle({ name: 'pkg', version: '1.0.0' }), [], enabledSbom);

            assert.deepStrictEqual(result, [
                { filePath: 'sbom.cdx.json', content: '{"sbom":"stub"}', isExecutable: false }
            ]);
        });

        test('generate() defaults to enabled when publish settings do not specify sbom', async function () {
            const { builder } = createBuilder();
            const result = await builder.generate(
                createBundle({ name: 'pkg', version: '1.0.0' }),
                [],
                defaultPublishSettings
            );

            assert.notStrictEqual(result, undefined);
        });

        test('generate() does not invoke the toolVersion provider when SBOM is disabled', async function () {
            const toolVersionProvider = fake.resolves('tool-version');
            const { builder } = createBuilder({ toolVersionProvider });
            const result = await builder.generate(createBundle({ name: 'pkg', version: '1.0.0' }), [], disabledSbom);

            assert.strictEqual(result, undefined);
            assert.strictEqual(toolVersionProvider.callCount, 0);
        });

        test('generate() invokes the toolVersion provider when SBOM is enabled', async function () {
            const toolVersionProvider = fake.resolves('tool-version');
            const { builder } = createBuilder({ toolVersionProvider });
            await builder.generate(createBundle({ name: 'pkg', version: '1.0.0' }), [], enabledSbom);

            assert.strictEqual(toolVersionProvider.callCount, 1);
        });
    });

    suite('dependency licenses', function () {
        test('generate() looks up licenses for external dependencies via the license resolver', async function () {
            const resolveLicense = fake.resolves('MIT');
            const { builder } = createBuilder({ resolveLicense });
            await builder.generate(
                createBundle({ name: 'pkg', version: '1.0.0', dependencies: { 'left-pad': '^1.0.0' } }),
                [],
                enabledSbom
            );

            assert.deepStrictEqual(resolveLicense.firstCall.args, [
                { projectFolder: '/the-project', dependencyName: 'left-pad' }
            ]);
        });

        test('generate() reuses the sibling bundle’s license instead of calling the resolver for bundle dependencies', async function () {
            const resolveLicense = fake.resolves('MIT');
            const { builder } = createBuilder({ resolveLicense });
            await builder.generate(
                createBundle({ name: 'pkg', version: '1.0.0', dependencies: { 'bundle-sibling': '0.0.1' } }),
                [ createSibling('bundle-sibling', 'BSD-3-Clause') ],
                enabledSbom
            );

            assert.strictEqual(resolveLicense.callCount, 0);
        });

        async function captureSiblingLicenseCount(siblingLicense: string | undefined): Promise<number> {
            const serialize = fake.returns('{"sbom":"stub"}');
            const { builder } = createBuilder({ serialize });
            await builder.generate(
                createBundle({ name: 'pkg', version: '1.0.0', dependencies: { 'bundle-sibling': '0.0.1' } }),
                [ createSibling('bundle-sibling', siblingLicense) ],
                enabledSbom
            );
            const bom = serialize.firstCall.args[0] as {
                readonly components: Iterable<{ readonly name: string; readonly licenses: Iterable<unknown>; }>;
            };
            for (const component of bom.components) {
                if (component.name === 'bundle-sibling') {
                    return Array.from(component.licenses).length;
                }
            }
            return -1;
        }

        test('generate() emits the sibling’s license as the bundle dependency component license', async function () {
            assert.strictEqual(await captureSiblingLicenseCount('BSD-3-Clause'), 1);
        });

        test('generate() leaves the sibling component without a license when the sibling has no license field', async function () {
            assert.strictEqual(await captureSiblingLicenseCount(undefined), 0);
        });
    });

    suite('dependency scopes', function () {
        test('generate() looks up licenses for peer dependencies as well', async function () {
            const resolveLicense = fake.resolves('Apache-2.0');
            const { builder } = createBuilder({ resolveLicense });
            await builder.generate(
                createBundle({ name: 'pkg', version: '1.0.0', peerDependencies: { react: '>=18' } }),
                [],
                enabledSbom
            );

            assert.deepStrictEqual(resolveLicense.firstCall.args, [
                { projectFolder: '/the-project', dependencyName: 'react' }
            ]);
        });

        async function captureScopeFor(
            name: string,
            dependenciesShape: Pick<SbomPackage, 'dependencies' | 'peerDependencies'>
        ): Promise<string | undefined> {
            const serialize = fake.returns('{"sbom":"stub"}');
            const { builder } = createBuilder({ serialize });
            await builder.generate(
                { ...createBundle({ name: 'pkg', version: '1.0.0' }), ...dependenciesShape },
                [],
                enabledSbom
            );
            const bom = serialize.firstCall.args[0] as {
                readonly components: Iterable<{ readonly name: string; readonly scope?: string; }>;
            };
            for (const component of bom.components) {
                if (component.name === name) {
                    return component.scope;
                }
            }
            return undefined;
        }

        test('generate() emits required scope for runtime dependencies', async function () {
            const scope = await captureScopeFor('left-pad', {
                dependencies: { 'left-pad': '^1.0.0' },
                peerDependencies: {}
            });
            assert.strictEqual(scope, 'required');
        });

        test('generate() emits optional scope for peer dependencies', async function () {
            const scope = await captureScopeFor('react', { dependencies: {}, peerDependencies: { react: '>=18' } });
            assert.strictEqual(scope, 'optional');
        });
    });

    test('generate() places the published bundle name and version on the SBOM root component', async function () {
        const serialize = fake.returns('{"sbom":"stub"}');
        const { builder } = createBuilder({ serialize });
        await builder.generate(createBundle({ name: 'my-pkg', version: '4.5.6' }), [], enabledSbom);

        const bom = serialize.firstCall.args[0] as {
            readonly metadata: { readonly component: { readonly name: string; readonly version: string; }; };
        };
        assert.strictEqual(bom.metadata.component.name, 'my-pkg');
        assert.strictEqual(bom.metadata.component.version, '4.5.6');
    });
});
