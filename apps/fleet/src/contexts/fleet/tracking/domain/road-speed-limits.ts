export type RoadSpeedDefaults = {
  highwayOpenKph: number;
  highwayTownKph: number;
  mainOpenKph: number;
  mainTownKph: number;
  minorKph: number;
};

export type RoadLimit = { limitKph: number; source: "osm" | "default"; inTown: boolean | null };

// Valhalla road classes.
const HIGHWAY = new Set(["motorway", "trunk"]);
const MAIN = new Set(["primary", "secondary"]);

/** The default truck limit for a road with no posted limit. */
export function defaultLimitKph(roadClass: string, inTown: boolean, d: RoadSpeedDefaults): number {
  if (HIGHWAY.has(roadClass)) return inTown ? d.highwayTownKph : d.highwayOpenKph;
  if (MAIN.has(roadClass)) return inTown ? d.mainTownKph : d.mainOpenKph;
  return d.minorKph;
}

/** Below this no default limit can be broken, so no lookup is needed. */
export function lowestDefaultKph(d: RoadSpeedDefaults): number {
  return Math.min(d.highwayOpenKph, d.highwayTownKph, d.mainOpenKph, d.mainTownKph, d.minorKph);
}
