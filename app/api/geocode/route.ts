import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2 || query.length > 100) {
    return NextResponse.json({ error: "주소를 두 글자 이상 입력해 주세요." }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "kr");
  url.searchParams.set("accept-language", "ko");
  url.searchParams.set("q", query.includes("서울") ? query : `서울 ${query}`);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TodayWithSon/1.0 (personal family outing planner)",
      },
    });
    if (!response.ok) throw new Error(`Geocoder ${response.status}`);
    const rows = (await response.json()) as Array<Record<string, string>>;
    const first = rows[0];
    if (!first) {
      return NextResponse.json({ error: "서울 안에서 주소를 찾지 못했어요." }, { status: 404 });
    }

    return NextResponse.json(
      {
        lat: Number(first.lat),
        lng: Number(first.lon),
        label: first.display_name,
      },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
    );
  } catch {
    return NextResponse.json(
      { error: "지금은 주소 검색이 잠시 쉬고 있어요. 내 위치를 사용해 보세요." },
      { status: 503 },
    );
  }
}
