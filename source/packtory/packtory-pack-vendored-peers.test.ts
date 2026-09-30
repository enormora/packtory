import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import {
    baseOptions,
    createDependencies,
    makeResolvedPackage,
    validatedConfig
} from '../test-libraries/packtory-pack-test-support.ts';
import { createRunPackValidated } from './packtory-pack.ts';

suite('packtory-pack vendored peer dependencies', function () {
    test('accepts vendored peer requirements satisfied by target package peer dependencies', async function () {
        const materializerSpy = fake.resolves(
            Result.ok({
                entries: [],
                packageNames: [ 'react-dom' ],
                peerRequirements: new Map<string, readonly string[]>([ [ 'react-dom', [ 'react' ] ] ])
            })
        );
        const { dependencies, fakes } = createDependencies({
            materializerSpy,
            versionedBundle: {
                name: 'pkg-a',
                version: '0.0.0',
                manifestFile: { content: '{}', isExecutable: false, filePath: 'package.json' },
                contents: [],
                peerDependencies: {}
            },
            resolveResult: Result.ok([
                makeResolvedPackage({
                    externalDependencyNames: [ 'react-dom' ],
                    mainPackageJson: { type: 'module', peerDependencies: { react: '^19.0.0' } },
                    sourcesFolder: '/repo/source'
                })
            ])
        });
        const runPack = createRunPackValidated(dependencies);

        const result = await runPack(
            validatedConfig,
            { ...baseOptions, vendorDependencies: true },
            fakes.resolveAndLinkAll
        );

        assert.deepStrictEqual(result.isOk ? result.value : 'errored', undefined);
        assert.strictEqual(fakes.packEmitterPack.callCount, 1);
    });
});
