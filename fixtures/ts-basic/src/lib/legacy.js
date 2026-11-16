/** 古い CommonJS のコード。require で .ts を読む。 */
const { formatDate } = require('./date');

module.exports = { today: () => formatDate(new Date()) };
