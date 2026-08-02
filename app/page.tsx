"use client";

import type { Map as LeafletMap, Marker } from "leaflet";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LEVEL_COLOR, LEVEL_SCORE, Mood, PLACES, PlaceProfile } from "@/lib/places";

type CrowdSpot = {
  name: string;
  level: string;
  levelNum: number;
  color: string;
  message?: string;
  forecast?: Array<{
    time: string;
    level: string;
    min?: number;
    max?: number;
  }>;
};

type LocationPoint = {
  lat: number;
  lng: number;
  label: string;
};

type RankedPlace = PlaceProfile & {
  crowd: CrowdSpot;
  score: number;
  distance?: number;
};

const MOODS: Array<{ value: Mood | "전체"; icon: string; label: string }> = [
  { value: "전체", icon: "✦", label: "뭐든 좋아" },
  { value: "뛰놀기", icon: "⚡", label: "신나게 뛰기" },
  { value: "탐험하기", icon: "⌖", label: "새로운 탐험" },
  { value: "배우기", icon: "?", label: "재밌게 배우기" },
  { value: "느긋하게", icon: "☁", label: "느긋한 오후" },
];

const durationOptions = [
  { value: 2, label: "2시간", note: "가볍게" },
  { value: 4, label: "반나절", note: "딱 좋아" },
  { value: 6, label: "하루", note: "제대로" },
] as const;

const fallbackCrowd: CrowdSpot = {
  name: "",
  level: "확인 중",
  levelNum: 0,
  color: LEVEL_COLOR["확인 중"],
};

function distanceKm(a: LocationPoint, b: { lat: number; lng: number }) {
  const earth = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function computeScore(
  place: PlaceProfile,
  crowd: CrowdSpot,
  mood: Mood | "전체",
  duration: number,
  setting: "전체" | "실내 중심" | "야외 우선",
  location: LocationPoint | null,
) {
  let score = 52;
  score += (LEVEL_SCORE[crowd.level] ?? 2.5) * 8;
  if (mood === "전체" || place.moods.includes(mood)) score += 10;
  if (place.duration <= duration) score += 7;
  else score -= 8;
  if (setting === "실내 중심") {
    score += place.setting === "실내" ? 10 : place.setting === "실내+야외" ? 6 : -10;
  }
  if (setting === "야외 우선") {
    score += place.setting === "야외" ? 8 : place.setting === "실내+야외" ? 4 : -8;
  }
  if (mood === "배우기") score += place.learning * 2;
  if (mood === "뛰놀기") score += place.energy * 2;
  if (location) score -= Math.min(distanceKm(location, place) * 0.8, 14);
  return Math.max(48, Math.min(98, Math.round(score)));
}

function formatUpdate(iso: string | null) {
  if (!iso) return "데이터 연결 중";
  const date = new Date(iso);
  return `${date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} 갱신`;
}

function formatPeople(min?: number, max?: number) {
  if (!min && !max) return null;
  if (min === max && min) return `약 ${min.toLocaleString()}명`;
  return `${(min ?? 0).toLocaleString()}~${(max ?? 0).toLocaleString()}명`;
}

function MapPanel({
  places,
  selectedId,
  location,
  onSelect,
}: {
  places: RankedPlace[];
  selectedId: string | null;
  location: LocationPoint | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const homeMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: false,
        scrollWheelZoom: true,
        attributionControl: true,
      }).setView([37.555, 126.99], 11);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 50);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 150);
      return () => clearTimeout(timer);
    }

    let disposed = false;
    import("leaflet").then((L) => {
      if (disposed || !mapRef.current) return;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = places.map((place, index) => {
        const isSelected = place.id === selectedId;
        const marker = L.marker([place.lat, place.lng], {
          zIndexOffset: isSelected ? 1000 : 100 - index,
          icon: L.divIcon({
            className: "place-marker-shell",
            html: `<button class="place-marker${isSelected ? " is-selected" : ""}" style="--marker-color:${place.crowd.color}" aria-label="${place.shortName}, ${place.crowd.level}"><span>${place.emoji}</span><b>${place.score}</b></button>`,
            iconSize: [48, 48],
            iconAnchor: [24, 46],
          }),
        });
        marker.on("click", () => onSelect(place.id));
        marker.addTo(mapRef.current!);
        return marker;
      });
    });
    return () => {
      disposed = true;
    };
  }, [onSelect, places, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;
    import("leaflet").then((L) => {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = L.marker([location.lat, location.lng], {
        zIndexOffset: 1500,
        icon: L.divIcon({
          className: "home-marker-shell",
          html: '<div class="home-marker" aria-label="출발지">우리집</div>',
          iconSize: [54, 36],
          iconAnchor: [27, 34],
        }),
      }).addTo(map);
      map.flyTo([location.lat, location.lng], 12, { duration: 0.7 });
    });
  }, [location]);

  useEffect(() => {
    const place = places.find((item) => item.id === selectedId);
    if (place && mapRef.current) {
      mapRef.current.flyTo([place.lat, place.lng], 13, { duration: 0.65 });
    }
  }, [places, selectedId]);

  return <div ref={containerRef} className="map-canvas" aria-label="추천 장소 지도" />;
}

function CrowdPill({ crowd }: { crowd: CrowdSpot }) {
  return (
    <span className="crowd-pill" style={{ "--crowd": crowd.color } as React.CSSProperties}>
      <i />
      지금 {crowd.level}
    </span>
  );
}

export default function Home() {
  const [crowdByName, setCrowdByName] = useState<Record<string, CrowdSpot>>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [source, setSource] = useState("loading");
  const [mood, setMood] = useState<Mood | "전체">("탐험하기");
  const [duration, setDuration] = useState(4);
  const [setting, setSetting] = useState<"전체" | "실내 중심" | "야외 우선">("전체");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CrowdSpot | null>(null);
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [address, setAddress] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  const loadCrowd = useCallback(async () => {
    try {
      const response = await fetch("/api/crowd");
      const data = (await response.json()) as {
        spots: CrowdSpot[];
        updatedAt: string;
        source: string;
      };
      setCrowdByName(
        Object.fromEntries(data.spots.map((spot) => [spot.name, spot])),
      );
      setUpdatedAt(data.updatedAt);
      setSource(data.source);
    } catch {
      setSource("offline");
      setUpdatedAt(new Date().toISOString());
    }
  }, []);

  useEffect(() => {
    loadCrowd();
    const saved = window.localStorage.getItem("son-day-favorites");
    if (saved) {
      try {
        setFavorites(JSON.parse(saved) as string[]);
      } catch {
        setFavorites([]);
      }
    }
    const timer = window.setInterval(loadCrowd, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadCrowd]);

  const rankedPlaces = useMemo(() => {
    return PLACES.map((place) => {
      const crowd = crowdByName[place.dataName] ?? {
        ...fallbackCrowd,
        name: place.dataName,
      };
      const distance = location ? distanceKm(location, place) : undefined;
      return {
        ...place,
        crowd,
        distance,
        score: computeScore(place, crowd, mood, duration, setting, location),
      };
    })
      .filter((place) => {
        const text = query.trim().toLowerCase();
        if (
          text &&
          !`${place.name} ${place.district} ${place.tagline} ${place.moods.join(" ")}`
            .toLowerCase()
            .includes(text)
        ) {
          return false;
        }
        if (favoritesOnly && !favorites.includes(place.id)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score || (a.distance ?? 999) - (b.distance ?? 999));
  }, [
    crowdByName,
    duration,
    favorites,
    favoritesOnly,
    location,
    mood,
    query,
    setting,
  ]);

  const topPick = rankedPlaces[0] ?? null;
  const selected = useMemo(
    () =>
      rankedPlaces.find((place) => place.id === selectedId) ??
      PLACES.map((place) => ({
        ...place,
        crowd: crowdByName[place.dataName] ?? {
          ...fallbackCrowd,
          name: place.dataName,
        },
        score: computeScore(place, crowdByName[place.dataName] ?? fallbackCrowd, mood, duration, setting, location),
        distance: location ? distanceKm(location, place) : undefined,
      })).find((place) => place.id === selectedId) ??
      null,
    [crowdByName, duration, location, mood, rankedPlaces, selectedId, setting],
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setDetail(null);
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    fetch(`/api/crowd?spot=${encodeURIComponent(selected.dataName)}`)
      .then((response) => response.json())
      .then((raw) => {
        const data = raw as { spot?: CrowdSpot };
        if (active && data.spot) setDetail(data.spot);
      })
      .catch(() => {
        if (active) setDetail(selected.crowd);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      window.localStorage.setItem("son-day-favorites", JSON.stringify(next));
      return next;
    });
  }

  function useMyLocation() {
    setLocationStatus("");
    setIsLocating(true);
    if (!navigator.geolocation) {
      setLocationStatus("이 기기에서는 위치를 사용할 수 없어요.");
      setIsLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "현재 위치",
        });
        setLocationStatus("현재 위치에서 가까운 순서를 반영했어요.");
        setIsLocating(false);
      },
      () => {
        setLocationStatus("위치 권한을 허용하거나 주소를 입력해 주세요.");
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  async function searchAddress(event: FormEvent) {
    event.preventDefault();
    if (address.trim().length < 2) return;
    setIsLocating(true);
    setLocationStatus("주소를 찾는 중…");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      const data = (await response.json()) as {
        lat?: number;
        lng?: number;
        label?: string;
        error?: string;
      };
      if (!response.ok || !data.lat || !data.lng) {
        throw new Error(data.error ?? "주소를 찾지 못했어요.");
      }
      setLocation({ lat: data.lat, lng: data.lng, label: address });
      setLocationStatus(`${address} 기준으로 거리를 계산했어요.`);
    } catch (error) {
      setLocationStatus(error instanceof Error ? error.message : "주소를 찾지 못했어요.");
    } finally {
      setIsLocating(false);
    }
  }

  const sourceLabel =
    source === "offline"
      ? "장소 정보 모드"
      : source === "loading"
        ? "실시간 연결 중"
        : "서울시 실시간 데이터";

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="오늘, 아들과 홈">
          <span className="brand-mark">父子</span>
          <span>
            <strong>오늘, 아들과</strong>
            <small>초4 맞춤 서울 나들이 레이더</small>
          </span>
        </a>
        <nav>
          <a href="#recommend">추천</a>
          <a href="#places">장소</a>
          <button
            className={favoritesOnly ? "saved-toggle active" : "saved-toggle"}
            onClick={() => {
              setFavoritesOnly((value) => !value);
              document.querySelector("#places")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            ♥ 저장 {favorites.length || ""}
          </button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> DAD × SON FIELD GUIDE · SEOUL</p>
          <h1>
            검색은 그만.
            <br />
            <em>오늘의 모험</em>만 고르자.
          </h1>
          <p className="hero-description">
            서울의 실시간 혼잡도와 4학년 아이의 재미를 함께 계산했어요.
            아빠가 출발 전에 필요한 판단만, 10초 안에.
          </p>
          <div className="live-line">
            <span className={source === "offline" ? "status-dot offline" : "status-dot"} />
            <strong>{sourceLabel}</strong>
            <span>{formatUpdate(updatedAt)}</span>
            <button onClick={loadCrowd} aria-label="혼잡도 새로고침">↻</button>
          </div>
        </div>
        <figure className="hero-visual" aria-label="아빠와 아들의 서울 나들이">
          <img
            src="/hero-father-son.jpg"
            alt="서울 지도를 바라보는 배낭을 멘 아빠와 초등학생 아들"
            width="800"
            height="1000"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <span className="hero-visual-index">SEOUL · 04</span>
          <figcaption className="hero-visual-caption">
            <span><b>20곳</b> 초4 추천</span>
            <span><b>5분</b> 혼잡 갱신</span>
          </figcaption>
        </figure>
      </section>

      <section className="planner" id="recommend">
        <div className="section-kicker">01 · 오늘의 조건</div>
        <div className="planner-grid">
          <div className="control-block">
            <span className="control-label">오늘 아이 텐션은?</span>
            <div className="mood-options">
              {MOODS.map((option) => (
                <button
                  key={option.value}
                  className={mood === option.value ? "choice active" : "choice"}
                  onClick={() => setMood(option.value)}
                >
                  <i>{option.icon}</i>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="control-block compact">
            <span className="control-label">우리에게 있는 시간</span>
            <div className="duration-options">
              {durationOptions.map((option) => (
                <button
                  key={option.value}
                  className={duration === option.value ? "duration active" : "duration"}
                  onClick={() => setDuration(option.value)}
                >
                  <b>{option.label}</b>
                  <span>{option.note}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="control-block compact">
            <span className="control-label">공간 취향</span>
            <div className="segmented">
              {(["전체", "실내 중심", "야외 우선"] as const).map((option) => (
                <button
                  key={option}
                  className={setting === option ? "active" : ""}
                  onClick={() => setSetting(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {topPick && (
        <section className="top-pick">
          <div className="top-pick-main">
            <div className="top-pick-label">
              <span>지금 1순위</span>
              <i>선택한 조건 + 실시간 혼잡도</i>
            </div>
            <div className="top-pick-title">
              <span className="big-emoji">{topPick.emoji}</span>
              <div>
                <p>{topPick.district} · {topPick.setting}</p>
                <h2>{topPick.name}</h2>
                <span>{topPick.tagline}</span>
              </div>
            </div>
            <div className="top-pick-tags">
              <CrowdPill crowd={topPick.crowd} />
              <span>⏱ {topPick.duration === 6 ? "반나절+" : `약 ${topPick.duration}시간`}</span>
              <span>₩ {topPick.cost}</span>
              {topPick.distance !== undefined && <span>⌖ {topPick.distance.toFixed(1)}km</span>}
            </div>
          </div>
          <div className="score-panel">
            <div className="score-ring" style={{ "--score": `${topPick.score * 3.6}deg` } as React.CSSProperties}>
              <strong>{topPick.score}</strong>
              <span>오늘 궁합</span>
            </div>
            <button onClick={() => handleSelect(topPick.id)}>
              출발 전 브리핑 <span>→</span>
            </button>
          </div>
          <div className="mission-strip">
            <b>TODAY&apos;S MISSION</b>
            <p>{topPick.mission}</p>
          </div>
        </section>
      )}

      <section className="location-bar">
        <div>
          <strong>우리 집에서 가까운 곳부터 볼까요?</strong>
          <span>주소는 거리 계산에만 쓰고 저장하지 않아요.</span>
        </div>
        <form onSubmit={searchAddress}>
          <label className="address-input">
            <span>⌕</span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="동네나 주소 입력 (예: 목동, 세종대로 110)"
              aria-label="출발 주소"
            />
          </label>
          <button type="submit" disabled={isLocating}>거리 계산</button>
          <button type="button" className="location-button" onClick={useMyLocation} disabled={isLocating}>
            ◎ 내 위치
          </button>
        </form>
        {locationStatus && <p className="location-status">{locationStatus}</p>}
      </section>

      <section className="places-section" id="places">
        <div className="places-toolbar">
          <div>
            <div className="section-kicker">02 · 후보 지도</div>
            <h2>{favoritesOnly ? "우리가 저장한 곳" : "오늘 갈 만한 곳"}</h2>
          </div>
          <label className="place-search">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="장소·동네·분위기 검색"
              aria-label="장소 검색"
            />
          </label>
        </div>

        <div className="places-layout">
          <div className="place-list">
            <div className="list-summary">
              <span><b>{rankedPlaces.length}</b>곳을 오늘 궁합순으로 정렬했어요.</span>
              {location && <span>출발지: {location.label}</span>}
            </div>
            {rankedPlaces.length ? (
              rankedPlaces.map((place, index) => (
                <article
                  className={index === 0 ? "place-card best" : "place-card"}
                  key={place.id}
                  onClick={() => handleSelect(place.id)}
                >
                  <div className="place-rank">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <i>{place.emoji}</i>
                  </div>
                  <div className="place-card-body">
                    <div className="place-heading">
                      <div>
                        <p>{place.district} · {place.setting}</p>
                        <h3>{place.name}</h3>
                      </div>
                      <button
                        className={favorites.includes(place.id) ? "heart active" : "heart"}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(place.id);
                        }}
                        aria-label={`${place.name} 저장`}
                      >
                        {favorites.includes(place.id) ? "♥" : "♡"}
                      </button>
                    </div>
                    <p className="tagline">{place.tagline}</p>
                    <div className="place-meta">
                      <CrowdPill crowd={place.crowd} />
                      <span>{place.duration}시간</span>
                      <span>{place.cost}</span>
                      {place.distance !== undefined && <span>{place.distance.toFixed(1)}km</span>}
                    </div>
                    <div className="mini-bars">
                      <span>활동성 <i><b style={{ width: `${place.energy * 33.33}%` }} /></i></span>
                      <span>배움 <i><b style={{ width: `${place.learning * 33.33}%` }} /></i></span>
                    </div>
                  </div>
                  <div className="card-score">
                    <strong>{place.score}</strong>
                    <span>궁합</span>
                    <i>→</i>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <span>🧭</span>
                <h3>조건에 맞는 장소가 없어요.</h3>
                <p>검색어나 저장 필터를 풀어보세요.</p>
                <button onClick={() => { setQuery(""); setFavoritesOnly(false); }}>전체 다시 보기</button>
              </div>
            )}
          </div>
          <div className="map-panel">
            <MapPanel
              places={rankedPlaces}
              selectedId={selectedId}
              location={location}
              onSelect={handleSelect}
            />
            <div className="map-legend">
              {["여유", "보통", "약간 붐빔", "붐빔"].map((level) => (
                <span key={level}><i style={{ background: LEVEL_COLOR[level] }} />{level}</span>
              ))}
            </div>
            <p className="map-note">숫자는 오늘 궁합 점수예요.</p>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="section-kicker">03 · 추천 원칙</div>
        <div className="principles">
          <div><span>01</span><h3>초4의 재미</h3><p>너무 유아적이지 않고, 몸과 머리를 함께 쓰는 장소를 골랐어요.</p></div>
          <div><span>02</span><h3>아빠의 현실</h3><p>시간·비용·실내외·거리까지 실제 출발 전에 필요한 것만 봅니다.</p></div>
          <div><span>03</span><h3>지금의 혼잡</h3><p>서울시 주요 장소의 실시간 혼잡도를 더해 실패 확률을 낮춥니다.</p></div>
          <div><span>04</span><h3>함께할 미션</h3><p>구경으로 끝나지 않도록 장소마다 대화가 생기는 미션을 넣었어요.</p></div>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark">父子</span>
          <span><strong>오늘, 아들과</strong><small>같이 보낸 시간이 결국 남으니까.</small></span>
        </div>
        <div className="footer-notes">
          <p>
            혼잡도: <a href="https://data.seoul.go.kr/SeoulRtd/" target="_blank" rel="noreferrer">서울 실시간 도시데이터</a>
            {" · "}지도·주소: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
          </p>
          <p>공공데이터 기반 참고 정보이며, 운영시간·휴관·행사는 출발 전 공식 채널에서 확인해 주세요.</p>
        </div>
      </footer>

      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelectedId(null)}>
          <aside className="detail-drawer" onClick={(event) => event.stopPropagation()} aria-label={`${selected.name} 출발 전 브리핑`}>
            <button className="drawer-close" onClick={() => setSelectedId(null)} aria-label="닫기">×</button>
            <div className="drawer-hero">
              <span>{selected.emoji}</span>
              <div>
                <p>{selected.district} · 초등 4학년 추천</p>
                <h2>{selected.name}</h2>
                <CrowdPill crowd={detail ?? selected.crowd} />
              </div>
              <div className="drawer-score"><b>{selected.score}</b><small>오늘 궁합</small></div>
            </div>
            <p className="drawer-tagline">{selected.tagline}</p>
            <div className="quick-facts">
              <div><span>권장 시간</span><b>약 {selected.duration}시간</b></div>
              <div><span>비용</span><b>{selected.cost}</b></div>
              <div><span>공간</span><b>{selected.setting}</b></div>
              {selected.distance !== undefined && <div><span>직선 거리</span><b>{selected.distance.toFixed(1)}km</b></div>}
            </div>

            <div className="brief-card mission-card">
              <span>TODAY&apos;S MISSION</span>
              <h3>{selected.mission}</h3>
            </div>
            <div className="brief-card dad-card">
              <span>DAD&apos;S NOTE</span>
              <p>{selected.dadTip}</p>
            </div>

            <div className="forecast-block">
              <div className="drawer-section-title">
                <h3>앞으로의 혼잡</h3>
                <span>{detail?.forecast?.length ? "서울시 예측" : "정보 확인 중"}</span>
              </div>
              {detail?.message && <p className="crowd-message">{detail.message}</p>}
              {detail?.forecast?.length ? (
                <div className="forecast-row">
                  {detail.forecast.slice(0, 5).map((item, index) => (
                    <div key={`${item.time}-${index}`}>
                      <span>{item.time.replace(/^\d{4}-\d{2}-\d{2}\s*/, "").replace("시", ":00")}</span>
                      <i style={{ background: LEVEL_COLOR[item.level] ?? LEVEL_COLOR["확인 중"] }} />
                      <b>{item.level}</b>
                      <small>{formatPeople(item.min, item.max)}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="forecast-loading">실시간 예측을 불러오고 있어요…</div>
              )}
            </div>

            <div className="drawer-actions">
              <button
                className="save-action"
                onClick={() => toggleFavorite(selected.id)}
              >
                {favorites.includes(selected.id) ? "♥ 저장됨" : "♡ 저장하기"}
              </button>
              <a
                href={`https://map.naver.com/p/search/${encodeURIComponent(selected.name)}`}
                target="_blank"
                rel="noreferrer"
              >
                길찾기 열기 <span>↗</span>
              </a>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
