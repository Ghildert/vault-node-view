import { svg } from "../svg";

// Original NodeVault artwork. Export name retained for upstream API compatibility.
// eslint-disable-next-line @bitwarden/components/require-theme-colors-in-svg -- currentColor inherits the active theme foreground.
const BitwardenLogo = svg`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" class="tw-text-fg-nav"><title>NodeVault</title><g transform="translate(2 3)"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 11L22 8M12 13L19 23M23 11L22 22"/><circle cx="8" cy="10" r="4"/><circle cx="26" cy="7" r="4"/><circle cx="22" cy="27" r="4"/></g></g><text x="45" y="28" fill="currentColor" font-family="sans-serif" font-size="25" font-weight="600">NodeVault</text></svg>`;
export { BitwardenLogo };
