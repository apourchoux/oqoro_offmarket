// Helpers communs aux endpoints admin (fichier préfixé `_` : pas une route).
// Les familles contacts/ et campagnes/ gardent leur _helpers.ts spécifique
// (validation métier) ; celui-ci porte les briques transverses.

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
