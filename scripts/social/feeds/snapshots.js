/**
 * @file snapshots.js
 * @description Per-account feed snapshots at data/social-feeds/<service>-<slug>.json.
 * Node only.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const MAX_ITEMS = 100;

const slugOf = (handle) => String(handle).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');

/** @returns {string} <rootDir>/data/social-feeds/<service>-<slug>.json */
export function snapshotPath(rootDir, account) {
  return join(rootDir, 'data', 'social-feeds', `${account.service}-${slugOf(account.handle)}.json`);
}

/** @returns {object[]|null} the snapshot's items, or null when missing or unreadable */
export function readSnapshot(rootDir, account) {
  try {
    const data = JSON.parse(readFileSync(snapshotPath(rootDir, account), 'utf8'));
    return data && Array.isArray(data.items) ? data.items : null;
  } catch {
    return null;
  }
}

/** Write at most 100 items. Never throws; warns instead. */
export function writeSnapshot(rootDir, account, items) {
  try {
    const file = snapshotPath(rootDir, account);
    mkdirSync(dirname(file), { recursive: true });
    const body = { fetchedAt: new Date().toISOString(), items: items.slice(0, MAX_ITEMS) };
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  } catch (err) {
    console.warn(`[social-feed] Could not write snapshot for ${account && account.key}: ${err.message}`);
  }
}
