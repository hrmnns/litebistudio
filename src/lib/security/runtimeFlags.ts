let adminModeRuntimeActive = false;

export function setAdminModeRuntimeActive(active: boolean): void {
    adminModeRuntimeActive = active;
}

export function isAdminModeRuntimeActive(): boolean {
    return adminModeRuntimeActive;
}

