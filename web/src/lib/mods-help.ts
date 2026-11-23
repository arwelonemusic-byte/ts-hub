/**
 * «Не качаются моды?» (user request 2026-11-23): the command players run in an admin PowerShell when the game can't
 * download mods. A strip under the header on every page links to /help/mods, which shows it with the steps.
 * null hides the strip and the page. The entry starts with a line break (`r`n): Add-Content doesn't add one, so on a
 * hosts file that doesn't end with one the entry would join its last line, usually a # comment, and do nothing.
 */
export const MODS_HELP_COMMAND: string | null =
  'Add-Content C:\\Windows\\System32\\drivers\\etc\\hosts "`r`n89.222.123.14 ar-gcp-cdn.bistudio.com"; ipconfig /flushdns';

export const MODS_HELP_PATH = "/help/mods";
