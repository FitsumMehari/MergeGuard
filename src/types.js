/**
 * Public review contracts. The CLI is a wrapper around {@link review}.
 *
 * @typedef {"critical"|"high"|"medium"|"low"|"info"} Severity
 * @typedef {"correctness"|"security"|"concurrency"|"database"|"authorization"|"tenant-isolation"|"reliability"|"performance"|"api"} Category
 *
 * @typedef {object} ChangedFile
 * @property {string} path
 * @property {"added"|"modified"|"deleted"|"renamed"} status
 * @property {string} [patch]
 * @property {string} [headContent]
 * @property {string} [baseContent]
 *
 * @typedef {object} Finding
 * @property {string} id
 * @property {string} detector
 * @property {Category} category
 * @property {Severity} severity
 * @property {string} title
 * @property {string} description
 * @property {string} file
 * @property {number} [startLine]
 * @property {string[]} [evidence]
 * @property {string} [remediation]
 * @property {number} confidence
 *
 * @typedef {object} ReviewResult
 * @property {string} version
 * @property {boolean} passed
 * @property {boolean} blocking
 * @property {Finding[]} findings
 * @property {object} summary
 * @property {object} metadata
 */

export {};
