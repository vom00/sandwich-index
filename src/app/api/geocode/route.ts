import { NextResponse } from "next/server";

import { zipSchema } from "@/lib/validation";

/**
 * GET /api/geocode?zip=75019
 *
 * The manual fallback for anyone who declines the geolocation prompt. Nobody
 * gets dead-ended for saying no to a browser permission.
 *
 * Nominatim was the obvious choice — same OpenStreetMap project the store data
 * comes from — but it returns 403 for this client under the OSM Foundation's
 * usage policy, so it is not a dependency we can build on. Zippopotam is
 * purpose-built for postal-code centroids and answers in about 200ms; Photon
 * (Komoot's OSM-backed geocoder) is the fallback, which keeps an
 * OpenStreetMap-derived path in place if Zippopotam goes away.
 *
 * Only the ZIP centroid comes from here. Store locations remain Overpass/OSM.
 *
 * A ZIP centroid does not move, so the response is cached for 30 days.
 */

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_SECONDS = 60 * 60 * 24 * 30;

interface Located {
  lat: number;
  lng: number;
  label: string;
}

function userAgent(): string {
  const contact = process.env.OVERPASS_CONTACT_EMAIL ?? "unset";
  return `sandwich-index/0.1 (+https://github.com/sandwich-index; ${contact})`;
}

async function viaZippopotam(zip: string): Promise<Located | null> {
  const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    headers: { "User-Agent": userAgent() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: CACHE_SECONDS },
  });

  // 404 here means the ZIP genuinely does not exist, which is a real answer.
  if (!response.ok) return null;

  const body = (await response.json()) as {
    places?: Array<{
      latitude: string;
      longitude: string;
      "place name"?: string;
      "state abbreviation"?: string;
    }>;
  };

  const place = body.places?.[0];
  if (place === undefined) return null;

  const town = place["place name"];
  const state = place["state abbreviation"];

  return {
    lat: Number.parseFloat(place.latitude),
    lng: Number.parseFloat(place.longitude),
    label: town === undefined ? zip : `${town}${state === undefined ? "" : `, ${state}`}`,
  };
}

async function viaPhoton(zip: string): Promise<Located | null> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", `${zip} United States`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": userAgent() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) return null;

  const body = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: {
        name?: string;
        city?: string;
        state?: string;
        postcode?: string;
        countrycode?: string;
      };
    }>;
  };

  const feature = body.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties;
  if (coordinates === undefined || properties === undefined) return null;

  // Photon is a fuzzy search, not a postcode lookup, and it will answer almost
  // anything with its best guess: asked for "00000 United States" it returns a
  // residential street in Pope County, Minnesota, postcode 56316. Taking that
  // at face value would drop somebody who mistyped their ZIP into a random
  // part of the country and show them stores there. The result only counts if
  // it is actually the postcode that was asked for.
  const matchesRequestedZip =
    properties.countrycode === "US" &&
    (properties.name === zip || properties.postcode === zip);

  if (!matchesRequestedZip) return null;

  const [lng, lat] = coordinates;
  const town = properties.city ?? properties.name;

  return { lat, lng, label: town === undefined || town === zip ? zip : town };
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = zipSchema.safeParse(searchParams.get("zip") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a 5-digit ZIP code" }, { status: 400 });
  }

  const zip = parsed.data;
  const attempts: Array<[string, (zip: string) => Promise<Located | null>]> = [
    ["zippopotam", viaZippopotam],
    ["photon", viaPhoton],
  ];

  let reachedAnyProvider = false;

  for (const [name, lookup] of attempts) {
    try {
      const located = await lookup(zip);
      reachedAnyProvider = true;
      if (located !== null) {
        return NextResponse.json({ zip, ...located });
      }
    } catch (error) {
      console.error(`[api/geocode] ${name} failed`, error);
    }
  }

  // Distinguish "we could not ask" from "we asked and it does not exist" —
  // they call for different messages and different user actions.
  return reachedAnyProvider
    ? NextResponse.json({ error: `No US location found for ${zip}` }, { status: 404 })
    : NextResponse.json(
        { error: "Could not look up that ZIP code right now" },
        { status: 503 },
      );
}
