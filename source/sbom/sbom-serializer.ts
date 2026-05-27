import * as cdx from '@cyclonedx/cyclonedx-library';

export type SbomSerializer = {
    serialize: (bom: cdx.Models.Bom) => string;
};

function createCycloneDxJsonSerializer(): cdx.Serialize.JsonSerializer {
    return new cdx.Serialize.JsonSerializer(new cdx.Serialize.JSON.Normalize.Factory(cdx.Spec.Spec1dot6));
}

function serializeBom(serializer: cdx.Serialize.JsonSerializer, bom: cdx.Models.Bom): string {
    return serializer.serialize(bom, { sortLists: true, space: 4 });
}

export function createSbomSerializer(): SbomSerializer {
    const serializer = createCycloneDxJsonSerializer();
    const serialize = (bom: cdx.Models.Bom): string => {
        return serializeBom(serializer, bom);
    };

    return { serialize };
}
