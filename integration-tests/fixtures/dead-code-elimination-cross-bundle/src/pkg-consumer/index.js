import { consumedExport } from '../pkg-producer/index.js';

export function consumerEntry() {
    return consumedExport();
}
