/**
 * «Не качаются моды?» (user requests 2026-11-23, 2026-11-24): players point ar-gcp-cdn.bistudio.com at another
 * address in their hosts file, with a command in an admin PowerShell or by hand in Notepad. A strip under the header
 * on every page links to /help/mods, which shows both ways.
 */
export const MODS_HELP_PATH = "/help/mods";

/** The addresses the community passes around; either one works. Empty hides the strip and the page. */
export const MODS_HELP_IPS: readonly string[] = ["89.222.123.14", "185.76.9.27"];

export const modsHelpShown = MODS_HELP_IPS.length > 0;

export const HOSTS_FILE = "C:\\Windows\\System32\\drivers\\etc\\hosts";

export const hostsLine = (ip: string) => `${ip} ar-gcp-cdn.bistudio.com`;

/**
 * The PowerShell way. The entry starts with a line break (`r`n): Add-Content doesn't add one, so on a hosts file that
 * doesn't end with one the entry would join its last line, usually a # comment, and do nothing.
 */
export const hostsCommand = (ip: string) => `Add-Content ${HOSTS_FILE} "\`r\`n${hostsLine(ip)}"; ipconfig /flushdns`;

export const FLUSH_DNS = "ipconfig /flushdns";
