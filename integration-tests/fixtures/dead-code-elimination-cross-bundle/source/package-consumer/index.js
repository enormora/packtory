import { consumedExport } from '../package-producer/index.js';

export function consumerEntry() {
    return consumedExport();
}
