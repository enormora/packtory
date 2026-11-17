import type { Bom } from '@cyclonedx/cyclonedx-library/Models';
import * as serialization from '@cyclonedx/cyclonedx-library/Serialize';
import { Spec1dot6 } from '@cyclonedx/cyclonedx-library/Spec';

type SerializableBillOfMaterials = Readonly<Bom>;

export type SoftwareBillOfMaterialsSerializer = {
    serialize: (billOfMaterials: SerializableBillOfMaterials) => string;
};

function createCycloneDxJavaScriptObjectNotationSerializer(): serialization.JsonSerializer {
    return new serialization.JsonSerializer(
        new serialization.JSON.Normalize.Factory(Spec1dot6)
    );
}

function serializeBillOfMaterials(
    serializer: serialization.JsonSerializer,
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
