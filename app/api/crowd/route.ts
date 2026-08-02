import { NextRequest, NextResponse } from "next/server";
import { LEVEL_COLOR, PLACES } from "@/lib/places";

export const dynamic = "force-dynamic";

type Forecast = {
  time: string;
  level: string;
  min?: number;
  max?: number;
};

type CrowdSpot = {
  name: string;
  level: string;
  levelNum: number;
  color: string;
  min?: number;
  max?: number;
  message?: string;
  forecast?: Forecast[];
};

const UPSTREAM = "https://gjdong.vercel.app/api/crowd";

function levelNumber(level: string) {
  return { 여유: 1, 보통: 2, "약간 붐빔": 3, 붐빔: 4 }[level] ?? 0;
}
function offlineSpots(): CrowdSpot[] {
  return PLACES.map((place) => ({
    name: place.dataName,
    level: "확인 중",
    levelNum: 0,
    color: LEVEL_COLOR["확인 중"],
  }));
}

function officialEndpoint(key: string, name: string) {
  return `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/citydata_ppltn/1/5/${encodeURIComponent(name)}`;
}

async function fetchOfficialSpot(key: string, name: string): Promise<CrowdSpot> {
  const response = await fetch(officialEndpoint(key, name), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Seoul API ${response.status}`);

  const payload = (await response.json()) as Record<string, unknown>;
  const rows = payload["SeoulRtd.citydata_ppltn"] as
    | Array<Record<string, unknown>>
    | undefined;
  const row = rows?.[0];
  if (!row) throw new Error("No population row");

  const level = String(row.AREA_CONGEST_LVL ?? "확인 중");
  const forecastRows = Array.isArray(row.FCST_PPLTN)
    ? (row.FCST_PPLTN as Array<Record<string, unknown>>)
    : [];

  return {
    name,
    level,
    levelNum: levelNumber(level),
    color: LEVEL_COLOR[level] ?? LEVEL_COLOR["확인 중"],
    min: Number(row.AREA_PPLTN_MIN) || undefined,
    max: Number(row.AREA_PPLTN_MAX) || undefined,
    message: String(row.AREA_CONGEST_MSG ?? ""),
    forecast: forecastRows.slice(0, 6).map((item) => ({
      time: String(item.FCST_TIME ?? ""),
      level: String(item.FCST_CONGEST_LVL ?? ""),
      min: Number(item.FCST_PPLTN_MIN) || undefined,
      max: Number(item.FCST_PPLTN_MAX) || undefined,
    })),
  };
}

async function fetchOfficial(key: string) {
  const results = await Promise.allSettled(
    PLACES.map((place) => fetchOfficialSpot(key, place.dataName)),
  );
  return results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          name: PLACES[index].dataName,
          level: "확인 중",
          levelNum: 0,
          color: LEVEL_COLOR["확인 중"],
        },
  );
}

async function fetchPublicFeed(): Promise<CrowdSpot[]> {
  const response = await fetch(UPSTREAM, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Public feed ${response.status}`);

  const payload = (await response.json()) as {
    spots?: Array<Record<string, unknown>>;
  };
  const wanted = new Set(PLACES.map((place) => place.dataName));
  return (payload.spots ?? [])
    .filter((spot) => wanted.has(String(spot.name)))
    .map((spot) => {
      const level = String(spot.level ?? "확인 중");
      return {
        name: String(spot.name),
        level,
        levelNum: Number(spot.levelNum) || levelNumber(level),
        color: String(spot.color ?? LEVEL_COLOR[level] ?? LEVEL_COLOR["확인 중"]),
      };
    });
}

export async function GET(request: NextRequest) {
  const detailName = request.nextUrl.searchParams.get("spot");
  const key = process.env.SEOUL_API_KEY;

  if (detailName) {
    try {
      const spot = key
        ? await fetchOfficialSpot(key, detailName)
        : await (async () => {
            const response = await fetch(
              `${UPSTREAM}?spot=${encodeURIComponent(detailName)}`,
              { headers: { Accept: "application/json" } },
            );
            if (!response.ok) throw new Error(`Detail feed ${response.status}`);
            const data = (await response.json()) as Record<string, unknown>;
            const level = String(data.level ?? "확인 중");
            return {
              name: detailName,
              level,
              levelNum: Number(data.levelNum) || levelNumber(level),
              color: String(data.color ?? LEVEL_COLOR[level]),
              message: Array.isArray(data.message)
                ? String(data.message[0] ?? "")
                : String(data.message ?? ""),
              forecast: Array.isArray(data.series)
                ? (data.series as Array<Record<string, unknown>>)
                    .filter((item) => item.kind === "forecast")
                    .slice(0, 6)
                    .map((item) => ({
                      time: String(item.time ?? ""),
                      level: String(item.level ?? ""),
                      min: Number(item.people) || undefined,
                      max: Number(item.people) || undefined,
                    }))
                : [],
            };
          })();
      return NextResponse.json({
        spot,
        source: key ? "seoul-open-data" : "public-seoul-feed",
        updatedAt: new Date().toISOString(),
      });
    } catch {
      return NextResponse.json({
        spot: offlineSpots().find((spot) => spot.name === detailName),
        source: "offline",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  try {
    const spots = key ? await fetchOfficial(key) : await fetchPublicFeed();
    const byName = new Map(spots.map((spot) => [spot.name, spot]));
    return NextResponse.json(
      {
        spots: PLACES.map(
          (place) =>
            byName.get(place.dataName) ?? {
              name: place.dataName,
              level: "확인 중",
              levelNum: 0,
              color: LEVEL_COLOR["확인 중"],
            },
        ),
        source: key ? "seoul-open-data" : "public-seoul-feed",
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=240" } },
    );
  } catch {
    return NextResponse.json({
      spots: offlineSpots(),
      source: "offline",
      updatedAt: new Date().toISOString(),
    });
  }
}
