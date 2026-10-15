// The game's UI icons: paths in a 24 x 24 box, drawn in the text's colour (filled or stroked). The phases use them
// (the phase strip, the panel's title, the help), and the help's tabs.

export const ICONS = {
  move: { stroke: ['M4 19.5Q7.5 7 19 8.5', 'M14.8 4.6l4.4 3.9-3.6 4.4'] },
  weapon: { fill: ['M1.5 8.7 6 8v3.4l-4 1.2z', 'M6 7.6h10v3.4H6z', 'M16 8.5h7V10h-7z', 'M9.4 6.2h3v1.4h-3z', 'M10.6 11H13l.8 4.6-2.2.4z', 'M7 11h1.9l-.6 3.6H6.4z'] },
  health: { fill: ['M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z'] },
  chevron: { stroke: ['M9 6l6 6-6 6'] },
  flag: { stroke: ['M5 21V4', 'M5 4h12l-2.5 4 2.5 4H5'] },
  turn: { stroke: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4v4.5h-4.5'] },
  shield: { stroke: ['M12 3l7 3v5.5c0 4.8-3.3 8-7 9.5-3.7-1.5-7-4.7-7-9.5V6z'] },
  assault: { stroke: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M5.6 5.6l2.8 2.8', 'M15.6 15.6l2.8 2.8', 'M5.6 18.4l2.8-2.8', 'M15.6 8.4l2.8-2.8'] },
  counter: { stroke: ['M3 6h18v12H3z', 'M3 6l18 12', 'M21 6 3 18'] },
  keys: { stroke: ['M3 7h18v10H3z', 'M7 11h.01', 'M11 11h.01', 'M15 11h.01', 'M8 14h8'] },
};

// An icon as markup, for text written as HTML (the help).
export function iconSvg(name, cls = '') {
  const look = ICONS[name] ?? {};
  const fill = (look.fill ?? []).map((d) => `<path d="${d}" fill="currentColor"/>`).join('');
  const stroke = (look.stroke ?? []).map((d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${fill}${stroke}</svg>`;
}
