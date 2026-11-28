import type { Bom } from '@cyclonedx/cyclonedx-library/Models';
import { JsonSerializer, JSON as javaScriptObjectNotationSerialization } from '@cyclonedx/cyclonedx-library/Serialize';
import { Spec1dot6 } from '@cyclonedx/cyclonedx-library/Spec';

type SerializableBillOfMaterials = Readonly<Bom>;

export type SoftwareBillOfMaterialsSerializer = {
    serialize: (billOfMaterials: SerializableBillOfMaterials) => string;
};

function createCycloneDxJavaScriptObjectNotationSerializer(): JsonSerializer {
    return new JsonSerializer(
        new javaScriptObjectNotationSerialization.Normalize.Factory(Spec1dot6)
    );
}

function serializeBillOfMaterials(
    serializer: JsonSerializer,
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
