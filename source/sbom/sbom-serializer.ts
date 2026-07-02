import * as cdx from '@cyclonedx/cyclonedx-library';

type SerializableBom = Readonly<cdx.Models.Bom>;

export type SbomSerializer = {
    serialize: (bom: SerializableBom) => string;
};

function createCycloneDxJsonSerializer(): cdx.Serialize.JsonSerializer {
    return new cdx.Serialize.JsonSerializer(new cdx.Serialize.JSON.Normalize.Factory(cdx.Spec.Spec1dot6));
}

function serializeBom(serializer: cdx.Serialize.JsonSerializer, bom: SerializableBom): string {
    return String(Reflect.apply(serializer.serialize, serializer, [ bom, { sortLists: true, space: 4 } ]));
}

export function createSbomSerializer(): SbomSerializer {
    const serializer = createCycloneDxJsonSerializer();
    const serialize = function (bom: SerializableBom): string {
        return serializeBom(serializer, bom);
    };

    return { serialize };
}
