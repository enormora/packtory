export function isExecutableFileMode(mode) {
    return (mode & 0o111) !== 0;
}

export function unusedPermissionMode() {
    return false;
}

//# sourceMappingURL=permissions.js.map
