/** 日付の整形。どこからも import しない葉ノード。 */
export function formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}
