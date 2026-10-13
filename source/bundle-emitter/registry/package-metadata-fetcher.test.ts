import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { RegistrySettings } from '../../configuration/registry-settings.ts';
import { fakeNpmFetch, registryTarballBytes } from '../../test-libraries/registry-fetch-fixtures.ts';
import {
    fetchLatestPackageReleaseMetadata,
    fetchLatestPackageVersion,
    fetchPackageVersionReleaseMetadata,
    fetchStagedPackageVersions,
    type NpmFetch
} from './package-metadata-fetcher.ts';
import type { TarballIntegrity } from './tarball-integrity.ts';

const settings: RegistrySettings = { authentication: { type: 'bearer-token', token: 'tok' } };
const latestVersion = '1.2.3';
const targetVersion = '1.2.4';
const tarballAddress = 'https://registry.npmjs.org/package-a/-/package-a-1.2.3.tgz';
const targetTarballAddress = 'https://registry.npmjs.org/package-a/-/package-a-1.2.4.tgz';
const matchingIntegrity = `sha512-${createHash('sha512').update(registryTarballBytes).digest('base64')}`;
const matchingShasum = [ '9ef2570c89e65b9f', 'e47687b0b49e122e', '59354bef' ].join('');
const emptyTarballIntegrity = { integrity: undefined, shasum: undefined } as const;

function latestPackageResponse(time?: string, dist: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        name: 'package-a',
        'dist-tags': { latest: latestVersion },
        ...time === undefined ? {} : { time: { [latestVersion]: time } },
        versions: { [latestVersion]: { dist: { tarball: tarballAddress, ...dist } } }
    };
}

function expectedVersionDetails(tarballIntegrity: TarballIntegrity = emptyTarballIntegrity): Record<string, unknown> {
    return {
        version: latestVersion,
        tarballAddress,
        tarballIntegrity,
        gitHead: undefined
    };
}

function expectedReleaseMetadata(
    publishedAt: Date | undefined,
    tarballIntegrity: TarballIntegrity = emptyTarballIntegrity
): Record<string, unknown> {
    return {
        version: latestVersion,
        tarballAddress,
        tarballIntegrity,
        publishedAt,
        gitHead: undefined
    };
}

function fakeJavaScriptObjectNotationSequence(...responses: readonly (Error | Record<string, unknown>)[]): SinonSpy {
    let callIndex = 0;

    return fake(async function () {
        const response = responses[callIndex];
        callIndex += 1;
        if (response === undefined) {
            throw new Error('Unexpected extra stage lookup');
        }
        if (response instanceof Error) {
            throw response;
        }
        return response;
    });
}

async function expectError(npmFetch: NpmFetch, expectedMessage: string): Promise<void> {
    try {
        await fetchLatestPackageVersion(npmFetch, 'package-a', settings);
        assert.fail('Expected fetchLatestPackageVersion() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('package-metadata-fetcher', function () {
    suite('latest package version', function () {
        test('fetchLatestPackageVersion returns the latest version details when the registry response is valid', async function () {
            const result = await fetchLatestPackageVersion(
                fakeNpmFetch(
                    fake.resolves({
                        name: 'package-a',
                        'dist-tags': { latest: latestVersion },
                        versions: { [latestVersion]: { dist: { tarball: tarballAddress } } }
                    })
                ),
                'package-a',
                settings
            );

            assert.deepStrictEqual(
                result.unwrapOr({
                    version: '',
                    tarballAddress: '',
                    tarballIntegrity: emptyTarballIntegrity,
                    gitHead: undefined
                }),
                expectedVersionDetails()
            );
        });

        test('fetchLatestPackageVersion returns latest tarball digest metadata', async function () {
            const result = await fetchLatestPackageVersion(
                fakeNpmFetch(fake.resolves(latestPackageResponse(undefined, {
                    integrity: matchingIntegrity,
                    shasum: matchingShasum
                }))),
                'package-a',
                settings
            );

            assert.deepStrictEqual(
                result.unwrapOr({
                    version: '',
                    tarballAddress: '',
                    tarballIntegrity: emptyTarballIntegrity,
                    gitHead: undefined
                }),
                expectedVersionDetails({ integrity: matchingIntegrity, shasum: matchingShasum })
            );
        });

        test('fetchLatestPackageVersion ignores malformed digest metadata on non-latest versions', async function () {
            const result = await fetchLatestPackageVersion(
                fakeNpmFetch(
                    fake.resolves({
                        name: 'package-a',
                        'dist-tags': { latest: latestVersion },
                        versions: {
                            [latestVersion]: { dist: { tarball: tarballAddress, integrity: matchingIntegrity } },
                            '0.0.1': {
                                dist: {
                                    tarball: 'https://registry.npmjs.org/package-a/-/package-a-0.0.1.tgz',
                                    integrity: 42
                                }
                            }
                        }
                    })
                ),
                'package-a',
                settings
            );

            assert.deepStrictEqual(
                result.unwrapOr({
                    version: '',
                    tarballAddress: '',
                    tarballIntegrity: emptyTarballIntegrity,
                    gitHead: undefined
                }),
                expectedVersionDetails({ integrity: matchingIntegrity, shasum: undefined })
            );
        });

        test('fetchLatestPackageVersion throws when latest digest metadata is not a string', async function () {
            await expectError(
                fakeNpmFetch(fake.resolves(latestPackageResponse(undefined, { integrity: { length: 1 } }))),
                'Registry returned invalid dist.integrity for package "package-a" version "1.2.3"'
            );
            await expectError(
                fakeNpmFetch(fake.resolves(latestPackageResponse(undefined, { shasum: { length: 1 } }))),
                'Registry returned invalid dist.shasum for package "package-a" version "1.2.3"'
            );
        });

        test('fetchLatestPackageVersion throws when latest digest metadata is empty', async function () {
            await expectError(
                fakeNpmFetch(fake.resolves(latestPackageResponse(undefined, { integrity: '' }))),
                'Registry returned invalid dist.integrity for package "package-a" version "1.2.3"'
            );
            await expectError(
                fakeNpmFetch(fake.resolves(latestPackageResponse(undefined, { shasum: '' }))),
                'Registry returned invalid dist.shasum for package "package-a" version "1.2.3"'
            );
        });

        test('fetchLatestPackageVersion returns Nothing when the registry has no latest dist-tag', async function () {
            const result = await fetchLatestPackageVersion(
                fakeNpmFetch(fake.resolves({ name: 'package-a', 'dist-tags': {}, versions: {} })),
                'package-a',
                settings
            );

            assert.strictEqual(result.isNothing, true);
        });

        test('fetchLatestPackageVersion returns Nothing when the registry responds with 404', async function () {
            const result = await fetchLatestPackageVersion(
                fakeNpmFetch(fake.rejects(Object.assign(new Error('status 404'), { statusCode: 404 }))),
                'package-a',
                settings
            );

            assert.strictEqual(result.isNothing, true);
        });

        test('fetchLatestPackageVersion rethrows 403 instead of treating the package as unpublished', async function () {
            await assert.rejects(async function () {
                await fetchLatestPackageVersion(
                    fakeNpmFetch(fake.rejects(Object.assign(new Error('status 403'), { statusCode: 403 }))),
                    'package-a',
                    settings
                );
            }, /status 403/u);
        });

        test('fetchLatestPackageVersion throws when the registry response shape is invalid', async function () {
            await expectError(
                fakeNpmFetch(fake.resolves({ name: 'package-a' })),
                'Got an invalid response from registry API'
            );
        });

        test('fetchLatestPackageVersion throws when the version listed under dist-tags.latest has no entry', async function () {
            await expectError(
                fakeNpmFetch(fake.resolves({ name: 'package-a', 'dist-tags': { latest: '1.2.3' }, versions: {} })),
                'Version "1.2.3" for package "package-a" has no entry in the registry response'
            );
        });
    });

    suite('latest package release metadata', function () {
        test('fetchLatestPackageReleaseMetadata returns the latest version details with publishedAt when the registry response is valid', async function () {
            const result = await fetchLatestPackageReleaseMetadata(
                fakeNpmFetch(fake.resolves(latestPackageResponse('2026-05-19T10:00:00.000Z'))),
                'package-a',
                settings
            );

            assert.deepStrictEqual(
                result.unwrapOr({
                    version: '',
                    tarballAddress: '',
                    tarballIntegrity: emptyTarballIntegrity,
                    publishedAt: undefined,
                    gitHead: undefined
                }),
                expectedReleaseMetadata(new Date('2026-05-19T10:00:00.000Z'))
            );
        });

        test('fetchLatestPackageReleaseMetadata returns latest tarball digest metadata', async function () {
            const result = await fetchLatestPackageReleaseMetadata(
                fakeNpmFetch(fake.resolves(latestPackageResponse('2026-05-19T10:00:00.000Z', {
                    integrity: matchingIntegrity,
                    shasum: matchingShasum
                }))),
                'package-a',
                settings
            );

            assert.deepStrictEqual(
                result.unwrapOr({
                    version: '',
                    tarballAddress: '',
                    tarballIntegrity: emptyTarballIntegrity,
                    publishedAt: undefined,
                    gitHead: undefined
                }),
                expectedReleaseMetadata(
                    new Date('2026-05-19T10:00:00.000Z'),
                    { integrity: matchingIntegrity, shasum: matchingShasum }
                )
            );
        });

        test('fetchLatestPackageReleaseMetadata returns gitHead from the latest version entry', async function () {
            const result = await fetchLatestPackageReleaseMetadata(
                fakeNpmFetch(
                    fake.resolves({
                        name: 'package-a',
                        'dist-tags': { latest: latestVersion },
                        versions: { [latestVersion]: { dist: { tarball: tarballAddress }, gitHead: 'abcdef123456' } }
                    })
                ),
                'package-a',
                settings
            );

            const fallback = {
                version: '',
                tarballAddress: '',
                tarballIntegrity: emptyTarballIntegrity,
                publishedAt: undefined,
                gitHead: undefined
            };
            assert.strictEqual(result.unwrapOr(fallback).gitHead, 'abcdef123456');
        });

        test('fetchLatestPackageReleaseMetadata returns undefined publishedAt when the registry omits the time entry', async function () {
            const result = await fetchLatestPackageReleaseMetadata(
                fakeNpmFetch(fake.resolves(latestPackageResponse())),
                'package-a',
                settings
            );

            assert.deepStrictEqual(
                result.unwrapOr({
                    version: '',
                    tarballAddress: '',
                    tarballIntegrity: emptyTarballIntegrity,
                    publishedAt: undefined,
                    gitHead: undefined
                }),
                expectedReleaseMetadata(undefined)
            );
        });

        test('fetchLatestPackageReleaseMetadata returns Nothing when the package is missing from the registry', async function () {
            const result = await fetchLatestPackageReleaseMetadata(
                fakeNpmFetch(fake.rejects(Object.assign(new Error('status 404'), { statusCode: 404 }))),
                'package-a',
                settings
            );

            assert.strictEqual(result.isNothing, true);
        });

        test('fetchLatestPackageReleaseMetadata returns Nothing when the full metadata has no latest dist-tag', async function () {
            const result = await fetchLatestPackageReleaseMetadata(
                fakeNpmFetch(fake.resolves({ name: 'package-a', 'dist-tags': {}, versions: {} })),
                'package-a',
                settings
            );

            assert.strictEqual(result.isNothing, true);
        });

        test('fetchLatestPackageReleaseMetadata throws when the publish time is invalid', async function () {
            try {
                await fetchLatestPackageReleaseMetadata(
                    fakeNpmFetch(fake.resolves(latestPackageResponse('not-a-date'))),
                    'package-a',
                    settings
                );
                assert.fail('Expected fetchLatestPackageReleaseMetadata() to throw but it did not');
            } catch (error: unknown) {
                assert.strictEqual(
                    (error as Error).message,
                    'Version publish time "not-a-date" is not a valid timestamp'
                );
            }
        });
    });

    suite('exact package release metadata', function () {
        test('fetchPackageVersionReleaseMetadata returns metadata for a non-latest version', async function () {
            const result = await fetchPackageVersionReleaseMetadata(
                fakeNpmFetch(
                    fake.resolves({
                        name: 'package-a',
                        'dist-tags': { latest: latestVersion },
                        time: { [targetVersion]: '2026-05-20T10:00:00.000Z' },
                        versions: {
                            [latestVersion]: { dist: { tarball: tarballAddress } },
                            [targetVersion]: {
                                dist: {
                                    tarball: targetTarballAddress,
                                    integrity: matchingIntegrity,
                                    shasum: matchingShasum
                                },
                                gitHead: 'abcdef123456'
                            }
                        }
                    })
                ),
                'package-a',
                targetVersion,
                settings
            );

            assert.deepStrictEqual(
                result.unwrapOr({
                    version: '',
                    tarballAddress: '',
                    tarballIntegrity: emptyTarballIntegrity,
                    publishedAt: undefined,
                    gitHead: undefined,
                    latestVersion: undefined
                }),
                {
                    version: targetVersion,
                    tarballAddress: targetTarballAddress,
                    tarballIntegrity: { integrity: matchingIntegrity, shasum: matchingShasum },
                    publishedAt: new Date('2026-05-20T10:00:00.000Z'),
                    gitHead: 'abcdef123456',
                    latestVersion
                }
            );
        });

        test('fetchPackageVersionReleaseMetadata returns Nothing when the exact version is missing', async function () {
            const result = await fetchPackageVersionReleaseMetadata(
                fakeNpmFetch(fake.resolves(latestPackageResponse())),
                'package-a',
                targetVersion,
                settings
            );

            assert.strictEqual(result.isNothing, true);
        });

        test('fetchPackageVersionReleaseMetadata returns Nothing when the package is missing', async function () {
            const result = await fetchPackageVersionReleaseMetadata(
                fakeNpmFetch(fake.rejects(Object.assign(new Error('status 404'), { statusCode: 404 }))),
                'package-a',
                targetVersion,
                settings
            );

            assert.strictEqual(result.isNothing, true);
        });

        test('fetchPackageVersionReleaseMetadata throws when exact version digest metadata is invalid', async function () {
            await assert.rejects(async function () {
                await fetchPackageVersionReleaseMetadata(
                    fakeNpmFetch(
                        fake.resolves({
                            name: 'package-a',
                            'dist-tags': { latest: latestVersion },
                            versions: {
                                [targetVersion]: {
                                    dist: {
                                        tarball: targetTarballAddress,
                                        integrity: 42
                                    }
                                }
                            }
                        })
                    ),
                    'package-a',
                    targetVersion,
                    settings
                );
            }, { message: 'Registry returned invalid dist.integrity for package "package-a" version "1.2.4"' });
        });

        test('fetchPackageVersionReleaseMetadata throws when exact version publish time is invalid', async function () {
            await assert.rejects(async function () {
                await fetchPackageVersionReleaseMetadata(
                    fakeNpmFetch(
                        fake.resolves({
                            name: 'package-a',
                            'dist-tags': { latest: latestVersion },
                            time: { [targetVersion]: 'not-a-date' },
                            versions: { [targetVersion]: { dist: { tarball: targetTarballAddress } } }
                        })
                    ),
                    'package-a',
                    targetVersion,
                    settings
                );
            }, { message: 'Version publish time "not-a-date" is not a valid timestamp' });
        });
    });

    suite('staged package versions', function () {
        test('fetchStagedPackageVersions returns staged versions across pages and stops when it reaches the total', async function () {
            const javaScriptObjectNotation = fakeJavaScriptObjectNotationSequence(
                { items: [ { version: '1.2.4' } ], total: 2 },
                { items: [ { version: '1.2.5' } ], total: 2 },
                new Error('Unexpected extra stage lookup')
            );

            const result = await fetchStagedPackageVersions(
                fakeNpmFetch(javaScriptObjectNotation),
                'package-a',
                settings
            );

            assert.deepStrictEqual(result, [ '1.2.4', '1.2.5' ]);
            assert.strictEqual(javaScriptObjectNotation.callCount, 2);
        });

        test('fetchStagedPackageVersions stops when a later page is empty even if the total is larger', async function () {
            const javaScriptObjectNotation = fakeJavaScriptObjectNotationSequence(
                { items: [ { version: '1.2.4' } ], total: 3 },
                { items: [], total: 3 },
                new Error('Unexpected extra stage lookup')
            );

            const result = await fetchStagedPackageVersions(
                fakeNpmFetch(javaScriptObjectNotation),
                'package-a',
                settings
            );

            assert.deepStrictEqual(result, [ '1.2.4' ]);
            assert.strictEqual(javaScriptObjectNotation.callCount, 2);
        });

        test('fetchStagedPackageVersions returns an empty list when the first page is empty', async function () {
            const javaScriptObjectNotation = fakeJavaScriptObjectNotationSequence(
                { items: [], total: 0 },
                new Error('Unexpected extra stage lookup')
            );

            const result = await fetchStagedPackageVersions(
                fakeNpmFetch(javaScriptObjectNotation),
                'package-a',
                settings
            );

            assert.deepStrictEqual(result, []);
            assert.strictEqual(javaScriptObjectNotation.callCount, 1);
        });

        test('fetchStagedPackageVersions throws when staged results exceed the page budget', async function () {
            const javaScriptObjectNotation = fake(async function () {
                return { items: [ { version: '1.2.4' } ], total: 100_001 };
            });

            await assert.rejects(
                fetchStagedPackageVersions(fakeNpmFetch(javaScriptObjectNotation), 'package-a', settings),
                /^Error: Staged package listing exceeded 1000 pages$/u
            );
            assert.strictEqual(javaScriptObjectNotation.callCount, 1000);
        });
    });
});
