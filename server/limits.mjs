// Keep export, restore and HTTP limits aligned so every saved workspace is restorable.
export const MAX_WORKSPACE_BYTES = 32 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_WORKSPACE_BYTES + 64 * 1024;
