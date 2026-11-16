/** カード。ESM 形式で `.js` 拡張子を付けて .ts を import する。 */
import { formatDate } from '../lib/date.js';

export function Card() {
    return <div>{formatDate(new Date())}</div>;
}
