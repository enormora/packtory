import { sharedValue } from '../shared/utilities.js';

export function packageCValue(value) {
    return sharedValue(value);
}
