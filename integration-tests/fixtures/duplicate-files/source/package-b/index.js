import { sharedValue } from '../shared/utilities.js';

export function packageBValue(value) {
    return sharedValue(value);
}
