import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { readContinuousIntegrationEnvironment } from '../../source/bundle-emitter/repository-coherence.ts';
import { buildPacktoryComposition } from '../../source/packages/packtory.composition.ts';
import { runReleaseDiffHandler } from '../../source/command-line-interface/runner/release-diff-handler.ts';
import { checkWithRegistry, type RegistryDetails } from '../registry.ts';
import {
    assertPublishSucceeded,
    createPublishConfiguration,
    fetchPublishedPackage,
    getFixturePath,
    publishFixturePackages,
    standardFixturePackages
} from './publish-fixture-support.ts';

async function inspectModifiedFixture(registryDetails: RegistryDetails): Promise<string> {
    const fixturePath = getFixturePath('multiple-packages-with-substitution-slightly-modified');
    const configuration = await createPublishConfiguration({
        fixturePath,
        registryDetails,
        packages: standardFixturePackages(fixturePath)
    });
    const { packtory } = buildPacktoryComposition({
        continuousIntegrationEnvironment: readContinuousIntegrationEnvironment({})
    });
    const output: string[] = [];
    const errors: string[] = [];
    const exitCode = await runReleaseDiffHandler({
        packtory,
        async pageOutput(content) {
            output.push(content);
        },
        log(message) {
            errors.push(message);
        },
        configurationLoader: {
            async load() {
                return configuration;
            }
        },
        spinnerRenderer: { add: fake(), updateMessage: fake(), stop: fake(), stopAll: fake() },
        flags: { packageName: 'second', filesOnly: false }
    });
    assert.strictEqual(exitCode, 0, errors.join('\n'));
    return stripVTControlCharacters(output.join('\n'));
}

suite('changes inspection', function () {
    test(
        'compares the selected package with a real latest tarball without publishing',
        checkWithRegistry(async function (registryDetails) {
            assertPublishSucceeded(
                await publishFixturePackages({
                    fixturePath: getFixturePath('multiple-packages-with-substitution'),
                    registryDetails
                })
            );
            const before = await fetchPublishedPackage('second', registryDetails);
            const output = await inspectModifiedFixture(registryDetails);
            assert.match(output, /second/u);
            assert.doesNotMatch(output, /^first\s/gmu);
            assert.match(output, /@@ /u);
            const after = await fetchPublishedPackage('second', registryDetails);
            assert.deepStrictEqual(after, before);
        })
    );
});
