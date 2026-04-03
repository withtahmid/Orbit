export const stripAnsi = (str: string | null | undefined): string | null => {
    if (!str) return null;
    return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();
};
