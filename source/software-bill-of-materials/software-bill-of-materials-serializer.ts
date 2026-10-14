import * as cyclonedx from '@cyclonedx/cyclonedx-library';

type SerializableBillOfMaterials = Readonly<cyclonedx.Models.Bom>;

export type SoftwareBillOfMaterialsSerializer = {
    serialize: (billOfMaterials: SerializableBillOfMaterials) => string;
};

function createCycloneDxJavaScriptObjectNotationSerializer(): cyclonedx.Serialize.JsonSerializer {
    return new cyclonedx.Serialize.JsonSerializer(
        new cyclonedx.Serialize.JSON.Normalize.Factory(cyclonedx.Spec.Spec1dot6)
    );
}

function serializeBillOfMaterials(
    serializer: cyclonedx.Serialize.JsonSerializer,
    billOfMaterials: SerializableBillOfMaterials
): string {
    return String(Reflect.apply(serializer.serialize, serializer, [ billOfMaterials, { sortLists: true, space: 4 } ]));
}

export function createSoftwareBillOfMaterialsSerializer(): SoftwareBillOfMaterialsSerializer {
    const serializer = createCycloneDxJavaScriptObjectNotationSerializer();
    const serialize = function (billOfMaterials: SerializableBillOfMaterials): string {
        return serializeBillOfMaterials(serializer, billOfMaterials);
    };

    return { serialize };
}
