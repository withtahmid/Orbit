const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function formatMoney(amount: number | string | null | undefined): string {
    if (amount === null || amount === undefined || amount === "") return "0.00";
    const n = typeof amount === "string" ? Number(amount) : amount;
    if (!Number.isFinite(n)) return "0.00";
    return formatter.format(n);
}

export function parseMoney(input: string): number {
    const n = Number(input.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
}
