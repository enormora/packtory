import { sharedValue } from '../shared/utilities.js';

export function packageAValue(value) {
    return sharedValue(value);
}
