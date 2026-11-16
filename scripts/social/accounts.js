/**
 * @file accounts.js
 * @description Parse and validate social account handles, build profile URLs and
 * normalize the `accounts` list from config/social.json. Pure: no fs, no config.
 */

import { serviceById } from './catalog.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const DOMAIN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const GITHUB = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const MASTODON_USER = /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?$/;
const LINKEDIN_SLUG = /^[A-Za-z0-9_%-]+$/;
const YOUTUBE = /^@[A-Za-z0-9._-]+$/;

/**
 * If `s` is a pasted URL on `host` (optional `https?://` and `www.`, optional trailing
 * slash), return the path after the host; otherwise null. Bare handles never match.
 */
const urlPath = (s, host) => {
  const m = s.match(new RegExp(`^(?:https?://)?(?:www\\.)?${host.replace(/\./g, '\\.')}/(.+?)/*$`, 'i'));
  return m ? m[1] : null;
};

const fail = (error) => ({ error });

/** @param {string} v */
function isHttpsUrl(v) {
  if (!/^https:\/\//i.test(v)) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Turn what a person typed (or pasted) into the stored handle.
 * @param {string} service
 * @param {string} input
 * @returns {{ handle: string } | { error: string }}
 */
export function parseHandle(service, input) {
  if (typeof input !== 'string') return fail('Enter a handle');
  const raw = input.trim();
  if (!raw) return fail('Enter a handle');

  switch (service) {
    case 'bluesky': {
      const m = (urlPath(raw, 'bsky.app') || '').match(/^profile\/([^/]+)$/i);
      const handle = (m ? m[1] : raw).replace(/^@/, '').toLowerCase();
      return DOMAIN.test(handle) ? { handle } : fail('Bluesky handles look like name.bsky.social');
    }
    case 'mastodon': {
      const s = raw;
      const m = s.match(/^(?:https?:\/\/)?([^/@\s]+)\/@([^/@]+)\/*$/i);
      let user;
      let instance;
      if (m) {
        [, instance, user] = m;
      } else {
        const parts = s.replace(/^@/, '').split('@');
        if (parts.length !== 2) return fail('Mastodon handles look like @user@instance');
        [user, instance] = parts;
      }
      instance = instance.toLowerCase();
      if (!MASTODON_USER.test(user) || !DOMAIN.test(instance)) return fail('Mastodon handles look like @user@instance');
      return { handle: `@${user}@${instance}` };
    }
    case 'github': {
      const p = urlPath(raw, 'github.com');
      const handle = (p && !p.includes('/') ? p : raw).replace(/^@/, '');
      return GITHUB.test(handle) ? { handle } : fail('GitHub usernames are 1 to 39 letters, digits or single hyphens');
    }
    case 'linkedin': {
      const m = (urlPath(raw, 'linkedin.com') || '').match(/^in\/([^/]+)$/i) || raw.match(/^in\/([^/]+?)\/*$/i);
      const slug = m ? m[1] : raw;
      return LINKEDIN_SLUG.test(slug) ? { handle: slug } : fail('Use the part after linkedin.com/in/');
    }
    case 'youtube': {
      const p = urlPath(raw, 'youtube.com');
      const handle = p && !p.includes('/') ? p : raw;
      return YOUTUBE.test(handle) ? { handle } : fail('YouTube handles look like @name');
    }
    case 'link':
      return isHttpsUrl(raw) ? { handle: raw } : fail('Links must start with https://');
    default:
      return fail(`Unknown service "${service}"`);
  }
}

/**
 * The public profile URL for an account, or null when it can't be built.
 * @param {{ service?: string, handle?: string, url?: string } | null | undefined} account
 * @returns {string | null}
 */
export function profileUrl(account) {
  if (!isObj(account)) return null;
  const { service, handle, url } = account;
  if (service === 'link') return typeof url === 'string' && isHttpsUrl(url) ? url : null;
  if (typeof handle !== 'string' || !handle) return null;
  switch (service) {
    case 'bluesky': return `https://bsky.app/profile/${handle}`;
    case 'mastodon': {
      const m = handle.match(/^@([^@]+)@([^@]+)$/);
      return m ? `https://${m[2]}/@${m[1]}` : null;
    }
    case 'github': return `https://github.com/${handle}`;
    case 'linkedin': return `https://www.linkedin.com/in/${handle}`;
    case 'youtube': return `https://www.youtube.com/${handle}`;
    default: return null;
  }
}

/**
 * Validate the raw contents of config/social.json. A bad entry is skipped with a
 * warning; the rest still build.
 * @param {unknown} raw
 * @returns {{ all: object[], visible: object[], warnings: string[] }}
 */
export function normalizeAccounts(raw) {
  const warnings = [];
  const all = [];
  const list = isObj(raw) ? raw.accounts : undefined;
  if (list !== undefined && !Array.isArray(list)) warnings.push('accounts must be an array; ignoring it');

  (Array.isArray(list) ? list : []).forEach((entry, i) => {
    const at = `accounts[${i}]`;
    if (!isObj(entry)) return void warnings.push(`${at}: not an object; skipped`);
    const svc = typeof entry.service === 'string' ? serviceById(entry.service) : undefined;
    if (!svc) return void warnings.push(`${at}: unknown service ${JSON.stringify(entry.service)}; skipped`);

    const hidden = entry.hidden === true;
    if (svc.id === 'link') {
      const label = typeof entry.label === 'string' ? entry.label.trim() : '';
      const url = typeof entry.url === 'string' ? entry.url.trim() : '';
      if (!label) return void warnings.push(`${at}: link needs a label; skipped`);
      if (!isHttpsUrl(url)) return void warnings.push(`${at}: link url must be https:; skipped`);
      all.push({ service: 'link', handle: '', url, name: label, icon: 'link', hidden });
      return;
    }

    const parsed = parseHandle(svc.id, entry.handle);
    if ('error' in parsed) return void warnings.push(`${at}: ${svc.id} handle ${JSON.stringify(entry.handle)}: ${parsed.error}; skipped`);
    const account = {
      service: svc.id,
      handle: parsed.handle,
      url: profileUrl({ service: svc.id, handle: parsed.handle }),
      name: svc.name,
      icon: svc.id,
      hidden,
    };
    if (svc.id === 'bluesky' && typeof entry.did === 'string' && entry.did.startsWith('did:')) account.did = entry.did;
    all.push(account);
  });

  return { all, visible: all.filter((a) => !a.hidden), warnings };
}

