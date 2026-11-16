import { createFactory } from '@enormora/objectory';

type ToolComponent = {
    readonly name: string;
    readonly version: string;
};

type SoftwareBillOfMaterialsFixtureFields = {
    readonly packtoryVersion: string;
};

type SoftwareBillOfMaterialsFixtureOverrides = Partial<SoftwareBillOfMaterialsFixtureFields> & {
    readonly dependencyComponents?: readonly ToolComponent[];
};

const softwareBillOfMaterialsFixtureFactory = createFactory<SoftwareBillOfMaterialsFixtureFields>(function () {
    return { packtoryVersion: '1.0.0' };
});

export function buildSoftwareBillOfMaterialsFixtureContent(
    overrides: SoftwareBillOfMaterialsFixtureOverrides = {}
): string {
    const { dependencyComponents = [], ...fixtureOverrides } = overrides;
    const fields = softwareBillOfMaterialsFixtureFactory.build(fixtureOverrides);
    const softwareBillOfMaterials: Record<string, unknown> = {
        metadata: { tools: { components: [ { name: 'packtory', version: fields.packtoryVersion } ] } }
    };
    if (dependencyComponents.length > 0) {
        softwareBillOfMaterials.components = dependencyComponents;
    }
    return JSON.stringify(softwareBillOfMaterials);
}
