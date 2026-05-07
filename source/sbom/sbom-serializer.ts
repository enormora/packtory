import * as cdx from '@cyclonedx/cyclonedx-library';

export type SbomSerializer = {
    serialize: (bom: cdx.Models.Bom) => string;
};

export function createSbomSerializer(): SbomSerializer {
    const factory = new cdx.Serialize.JSON.Normalize.Factory(cdx.Spec.Spec1dot6);
    const serializer = new cdx.Serialize.JsonSerializer(factory);

    return {
        serialize(bom) {
            return serializer.serialize(bom, { sortLists: true, space: 4 });
        }
    };
}
