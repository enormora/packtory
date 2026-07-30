import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, stub, type SinonSpy, type SinonStub } from 'sinon';
import { checkPublishedPackage } from '../../test-libraries/check-fixtures.ts';
import {
    createPackageResolutionAnalyzer,
    type PackageResolutionAnalyzer,
    type PackageResolutionDependencies,
    type PackageResolutionReport
} from './type-script-package-resolution.ts';

type FakeAnalysis = {
    readonly types: unknown;
    readonly entrypoints: Readonly<Record<string, unknown>>;
    readonly problems: readonly { readonly kind: string; }[];
};

type Overrides = {
    readonly TypesPackage?: SinonStub;
    readonly checkPackage?: SinonSpy;
    readonly problemAffectsResolutionKind?: SinonSpy;
    readonly problemAffectsEntrypointResolution?: SinonSpy;
};

const problemKindInfo = {
    CJSResolvesToESM: { shortDescription: 'Missing `export =`' }
};

function analyzerFor(overrides: Overrides = {}): PackageResolutionAnalyzer {
    const {
        TypesPackage = stub().returns({ isTypesPackage: true }),
        checkPackage = fake.resolves({ types: false }),
        problemAffectsResolutionKind = fake.returns(true),
        problemAffectsEntrypointResolution = fake.returns(true)
    } = overrides;
    const fakeDependencies = {
        Package: TypesPackage,
        checkPackage,
        problemKindInfo,
        problemAffectsResolutionKind,
        problemAffectsEntrypointResolution
    } as unknown as PackageResolutionDependencies;

    return createPackageResolutionAnalyzer(fakeDependencies);
}

function analysis(overrides: Partial<FakeAnalysis> = {}): FakeAnalysis {
    return {
        types: { kind: 'included' },
        entrypoints: { '.': {}, './feature': {} },
        problems: [],
        ...overrides
    };
}

async function analyzeWith(overrides: Overrides): Promise<PackageResolutionReport> {
    return await analyzerFor(overrides)(
        checkPublishedPackage('pkg', '{"name":"pkg"}', { 'index.d.ts': 'export declare const value: number;' }),
        [ 'node16-esm', 'bundler' ]
    );
}

suite('type-script-package-resolution', function () {
    test('checks an in-memory package built from the manifest and every packaged file', async function () {
        const TypesPackage = stub().returns({ isTypesPackage: true });
        const checkPackage = fake.resolves({ types: false });

        await analyzeWith({ TypesPackage, checkPackage });

        assert.strictEqual(TypesPackage.calledWithNew(), true);
        assert.deepStrictEqual(TypesPackage.args, [ [
            {
                '/node_modules/pkg/package.json': '{"name":"pkg"}',
                '/node_modules/pkg/index.d.ts': 'export declare const value: number;'
            },
            'pkg',
            '0.0.0'
        ] ]);
        assert.deepStrictEqual(checkPackage.args, [ [ { isTypesPackage: true } ] ]);
    });

    test('reports missing declarations when the package exposes no types', async function () {
        const report = await analyzeWith({ checkPackage: fake.resolves({ types: false }) });

        assert.deepStrictEqual(report, { kind: 'missing-declarations' });
    });

    test('reports the declared entrypoints and no problems for a package without problems', async function () {
        const report = await analyzeWith({ checkPackage: fake.resolves(analysis()) });

        assert.deepStrictEqual(report, { kind: 'analyzed', entrypoints: [ '.', './feature' ], problems: [] });
    });

    test('reports the resolution kinds and entrypoints a problem affects', async function () {
        const report = await analyzeWith({
            checkPackage: fake.resolves(analysis({ problems: [ { kind: 'CJSResolvesToESM' } ] })),
            problemAffectsResolutionKind: fake(function (_problem: unknown, resolutionKind: string) {
                return resolutionKind === 'bundler';
            }),
            problemAffectsEntrypointResolution: fake(function (_problem: unknown, entrypoint: string) {
                return entrypoint === './feature';
            })
        });

        assert.deepStrictEqual(report, {
            kind: 'analyzed',
            entrypoints: [ '.', './feature' ],
            problems: [
                {
                    kind: 'CJSResolvesToESM',
                    shortDescription: 'Missing `export =`',
                    affectedResolutionKinds: [ 'bundler' ],
                    affectedEntrypoints: [ './feature' ]
                }
            ]
        });
    });

    test('asks the checker about every requested resolution kind and entrypoint', async function () {
        const problem = { kind: 'CJSResolvesToESM' };
        const resolutionAnalysis = analysis({ problems: [ problem ] });
        const problemAffectsResolutionKind = fake.returns(false);
        const problemAffectsEntrypointResolution = fake.returns(false);

        await analyzeWith({
            checkPackage: fake.resolves(resolutionAnalysis),
            problemAffectsResolutionKind,
            problemAffectsEntrypointResolution
        });

        assert.deepStrictEqual(problemAffectsResolutionKind.args, [
            [ problem, 'node16-esm', resolutionAnalysis ],
            [ problem, 'bundler', resolutionAnalysis ]
        ]);
        assert.deepStrictEqual(problemAffectsEntrypointResolution.args, [
            [ problem, '.', 'node16-esm', resolutionAnalysis ],
            [ problem, '.', 'bundler', resolutionAnalysis ],
            [ problem, './feature', 'node16-esm', resolutionAnalysis ],
            [ problem, './feature', 'bundler', resolutionAnalysis ]
        ]);
    });
});
