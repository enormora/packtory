import { isExecutableFileMode } from './permissions.js';

export function describeFileMode(mode) {
    return isExecutableFileMode(mode) ? 'executable' : 'plain';
}

//# sourceMappingURL=file-manager.js.map
