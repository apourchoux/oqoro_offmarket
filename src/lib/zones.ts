// Référentiel géographique français (régions → départements) pour le ciblage
// des campagnes email. Module pur (aucun accès env) : importable depuis les
// pages Astro, les islands React ET la background function Netlify.
//
// Unité canonique de stockage : le code département ('69', '2A', '971'...).
// Une région sélectionnée dans l'UI est développée en ses départements.

export interface Region {
  code: string;
  name: string;
  departements: string[];
}

export const REGIONS: Region[] = [
  { code: 'ARA', name: 'Auvergne-Rhône-Alpes', departements: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'] },
  { code: 'BFC', name: 'Bourgogne-Franche-Comté', departements: ['21', '25', '39', '58', '70', '71', '89', '90'] },
  { code: 'BRE', name: 'Bretagne', departements: ['22', '29', '35', '56'] },
  { code: 'CVL', name: 'Centre-Val de Loire', departements: ['18', '28', '36', '37', '41', '45'] },
  { code: 'COR', name: 'Corse', departements: ['2A', '2B'] },
  { code: 'GES', name: 'Grand Est', departements: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'] },
  { code: 'HDF', name: 'Hauts-de-France', departements: ['02', '59', '60', '62', '80'] },
  { code: 'IDF', name: 'Île-de-France', departements: ['75', '77', '78', '91', '92', '93', '94', '95'] },
  { code: 'NOR', name: 'Normandie', departements: ['14', '27', '50', '61', '76'] },
  { code: 'NAQ', name: 'Nouvelle-Aquitaine', departements: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'] },
  { code: 'OCC', name: 'Occitanie', departements: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'] },
  { code: 'PDL', name: 'Pays de la Loire', departements: ['44', '49', '53', '72', '85'] },
  { code: 'PAC', name: "Provence-Alpes-Côte d'Azur", departements: ['04', '05', '06', '13', '83', '84'] },
  { code: 'DROM', name: 'Outre-mer', departements: ['971', '972', '973', '974', '976'] },
];

export const DEPARTEMENTS: Record<string, string> = {
  '01': 'Ain',
  '02': 'Aisne',
  '03': 'Allier',
  '04': 'Alpes-de-Haute-Provence',
  '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes',
  '07': 'Ardèche',
  '08': 'Ardennes',
  '09': 'Ariège',
  '10': 'Aube',
  '11': 'Aude',
  '12': 'Aveyron',
  '13': 'Bouches-du-Rhône',
  '14': 'Calvados',
  '15': 'Cantal',
  '16': 'Charente',
  '17': 'Charente-Maritime',
  '18': 'Cher',
  '19': 'Corrèze',
  '2A': 'Corse-du-Sud',
  '2B': 'Haute-Corse',
  '21': "Côte-d'Or",
  '22': "Côtes-d'Armor",
  '23': 'Creuse',
  '24': 'Dordogne',
  '25': 'Doubs',
  '26': 'Drôme',
  '27': 'Eure',
  '28': 'Eure-et-Loir',
  '29': 'Finistère',
  '30': 'Gard',
  '31': 'Haute-Garonne',
  '32': 'Gers',
  '33': 'Gironde',
  '34': 'Hérault',
  '35': 'Ille-et-Vilaine',
  '36': 'Indre',
  '37': 'Indre-et-Loire',
  '38': 'Isère',
  '39': 'Jura',
  '40': 'Landes',
  '41': 'Loir-et-Cher',
  '42': 'Loire',
  '43': 'Haute-Loire',
  '44': 'Loire-Atlantique',
  '45': 'Loiret',
  '46': 'Lot',
  '47': 'Lot-et-Garonne',
  '48': 'Lozère',
  '49': 'Maine-et-Loire',
  '50': 'Manche',
  '51': 'Marne',
  '52': 'Haute-Marne',
  '53': 'Mayenne',
  '54': 'Meurthe-et-Moselle',
  '55': 'Meuse',
  '56': 'Morbihan',
  '57': 'Moselle',
  '58': 'Nièvre',
  '59': 'Nord',
  '60': 'Oise',
  '61': 'Orne',
  '62': 'Pas-de-Calais',
  '63': 'Puy-de-Dôme',
  '64': 'Pyrénées-Atlantiques',
  '65': 'Hautes-Pyrénées',
  '66': 'Pyrénées-Orientales',
  '67': 'Bas-Rhin',
  '68': 'Haut-Rhin',
  '69': 'Rhône',
  '70': 'Haute-Saône',
  '71': 'Saône-et-Loire',
  '72': 'Sarthe',
  '73': 'Savoie',
  '74': 'Haute-Savoie',
  '75': 'Paris',
  '76': 'Seine-Maritime',
  '77': 'Seine-et-Marne',
  '78': 'Yvelines',
  '79': 'Deux-Sèvres',
  '80': 'Somme',
  '81': 'Tarn',
  '82': 'Tarn-et-Garonne',
  '83': 'Var',
  '84': 'Vaucluse',
  '85': 'Vendée',
  '86': 'Vienne',
  '87': 'Haute-Vienne',
  '88': 'Vosges',
  '89': 'Yonne',
  '90': 'Territoire de Belfort',
  '91': 'Essonne',
  '92': 'Hauts-de-Seine',
  '93': 'Seine-Saint-Denis',
  '94': 'Val-de-Marne',
  '95': "Val-d'Oise",
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '976': 'Mayotte',
};

export function isValidDepartement(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEPARTEMENTS, code);
}

export function departementLabel(code: string): string {
  const name = DEPARTEMENTS[code];
  return name ? `${name} (${code})` : code;
}

/**
 * Résumé compact d'une liste de codes département pour les badges :
 * les régions entièrement couvertes sont repliées en leur nom, le reste
 * est listé département par département. Tableau vide = « Toute la France ».
 */
export function zonesSummary(codes: string[] | null | undefined): string {
  if (!codes || codes.length === 0) return 'Toute la France';
  const remaining = new Set(codes);
  const parts: string[] = [];
  for (const region of REGIONS) {
    if (region.departements.every((d) => remaining.has(d))) {
      parts.push(region.name);
      region.departements.forEach((d) => remaining.delete(d));
    }
  }
  for (const code of codes) {
    if (remaining.has(code)) {
      parts.push(departementLabel(code));
      remaining.delete(code);
    }
  }
  return parts.join(' + ');
}
