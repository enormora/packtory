import { createFactory } from '@enormora/objectory';

type ToolComponent = {
    readonly name: string;
    readonly version: string;
};

type SbomFixtureFields = {
    readonly packtoryVersion: string;
};

type SbomFixtureOverrides = Partial<SbomFixtureFields> & {
    readonly dependencyComponents?: readonly ToolComponent[];
};

const sbomFixtureFactory = createFactory<SbomFixtureFields>(() => {
    return { packtoryVersion: '1.0.0' };
});

export function buildSbomFixtureContent(overrides: SbomFixtureOverrides = {}): string {
    const { dependencyComponents = [], ...fixtureOverrides } = overrides;
    const fields = sbomFixtureFactory.build(fixtureOverrides);
    const sbom: Record<string, unknown> = {
        metadata: { tools: { components: [{ name: 'packtory', version: fields.packtoryVersion }] } }
    };
    if (dependencyComponents.length > 0) {
        sbom.components = dependencyComponents;
    }
    return JSON.stringify(sbom);
}
