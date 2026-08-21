import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

type TabId = "day1" | "day2" | "food";
type TimeDisplay = "range" | "checkin" | "checkout";

type Seat = {
  name: string;
  seat: string;
};

type Ticket = {
  train: string;
  car: string;
  seats: Seat[];
};

type Accent = "blue" | "coral" | "mint" | "sand" | "lavender";

type MapSpot = {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

type TransitMode = "walk" | "bus" | "taxi";

type TransitOption = {
  mode: TransitMode;
  label: string;
  minutes: number;
};

type TimelineItem = {
  id: string;
  timeLabel: string;
  startTime: string;
  endTime: string;
  timeDisplay?: TimeDisplay;
  emoji: string;
  title: string;
  place: string;
  maps: MapSpot[];
  memo: string;
  accent: Accent;
  highlight?: boolean;
  ticket?: Ticket;
};

type CandidateItem = {
  id: string;
  category: "카페/디저트" | "식당";
  emoji: string;
  name: string;
  address: string;
  memo: string;
};

type AppData = {
  day1: TimelineItem[];
  day2: TimelineItem[];
  candidates: CandidateItem[];
  transits: Record<string, TransitOption[]>;
};

type LegacyEdits = {
  timeline?: Record<string, Partial<TimelineItem>>;
  candidates?: Record<string, Partial<CandidateItem>>;
};

function naverMapUrl(name: string, address: string) {
  return `https://map.naver.com/p/search/${encodeURIComponent(`${name} ${address}`)}`;
}

function routePlaceName(spot: MapSpot, fallback = "") {
  return (spot.name || spot.address || fallback).trim();
}

function naverRouteUrl(from: MapSpot, to: MapSpot) {
  const sname = routePlaceName(from);
  const ename = routePlaceName(to);
  const query = [
    "menu=route",
    `sname=${encodeURIComponent(sname)}`,
    from.lng != null ? `sx=${from.lng}` : "",
    from.lat != null ? `sy=${from.lat}` : "",
    `ename=${encodeURIComponent(ename)}`,
    to.lng != null ? `ex=${to.lng}` : "",
    to.lat != null ? `ey=${to.lat}` : "",
    "pathType=1",
    "showMap=true",
  ]
    .filter(Boolean)
    .join("&");
  return `https://m.map.naver.com/route.nhn?${query}`;
}

function timeToMinutes(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

type SunKind = "sunrise" | "sunset";

type SunTimes = {
  sunrise: string;
  sunset: string;
};

const DAY_SUN: Record<"day1" | "day2", SunTimes> = {
  day1: { sunrise: "05:59", sunset: "19:14" },
  day2: { sunrise: "06:00", sunset: "19:13" },
};

function sunEventsForDay(items: TimelineItem[], sun: SunTimes) {
  const timed = items
    .map((item) => ({ item, minutes: timeToMinutes(item.startTime) }))
    .filter((entry): entry is { item: TimelineItem; minutes: number } =>
      entry.minutes != null,
    );
  if (timed.length === 0) return [];

  const first = timed[0].minutes;
  const lastItem = items[items.length - 1];
  const last =
    timeToMinutes(lastItem?.endTime ?? "") ??
    timed[timed.length - 1]?.minutes ??
    first;

  return [
    { kind: "sunrise" as const, time: sun.sunrise, minutes: timeToMinutes(sun.sunrise) ?? 0 },
    { kind: "sunset" as const, time: sun.sunset, minutes: timeToMinutes(sun.sunset) ?? 0 },
  ]
    .filter((event) => event.minutes >= first && event.minutes <= last)
    .sort((a, b) => a.minutes - b.minutes);
}

function transitKey(fromId: string, toId: string) {
  return `${fromId}__${toId}`;
}

function routeSpot(item: TimelineItem, which: "from" | "to"): MapSpot {
  const maps = item.maps.filter((spot) => spot.name || spot.address);
  const fallback = { name: item.title, address: item.place };
  if (maps.length === 0) return fallback;
  if (which === "to") return maps[0] ?? fallback;
  if (item.title.includes("→")) return maps[maps.length - 1] ?? fallback;
  const last = maps[maps.length - 1];
  if (last && /공원|광장/.test(last.name)) return last;
  return maps[0] ?? fallback;
}

const TRANSIT_ICON: Record<TransitMode, string> = {
  walk: "🚶",
  bus: "🚌",
  taxi: "🚕",
};

const FALLBACK_TRANSIT: TransitOption[] = [
  { mode: "bus", label: "시내버스", minutes: 30 },
  { mode: "taxi", label: "택시", minutes: 15 },
];

const DEFAULT_TRANSITS: Record<string, TransitOption[]> = {
  "d1-train__d1-lunch": [
    { mode: "walk", label: "도보", minutes: 18 },
    { mode: "taxi", label: "택시", minutes: 7 },
  ],
  "d1-lunch__d1-cable": [
    { mode: "bus", label: "1번 버스", minutes: 28 },
    { mode: "taxi", label: "택시", minutes: 15 },
  ],
  "d1-cable__d1-cafe": [
    { mode: "walk", label: "도보", minutes: 16 },
    { mode: "taxi", label: "택시", minutes: 6 },
  ],
  "d1-cafe__d1-checkin": [
    { mode: "bus", label: "22번 버스", minutes: 32 },
    { mode: "taxi", label: "택시", minutes: 16 },
  ],
  "d1-checkin__d1-dinner": [
    { mode: "walk", label: "도보", minutes: 12 },
    { mode: "taxi", label: "택시", minutes: 5 },
  ],
  "d2-checkout__d2-brunch": [
    { mode: "walk", label: "도보", minutes: 18 },
    { mode: "taxi", label: "택시", minutes: 8 },
  ],
  "d2-brunch__d2-romance": [
    { mode: "bus", label: "시내버스", minutes: 25 },
    { mode: "taxi", label: "택시", minutes: 12 },
  ],
  "d2-romance__d2-warehouse": [
    { mode: "bus", label: "시내버스", minutes: 25 },
    { mode: "taxi", label: "택시", minutes: 12 },
  ],
  "d2-warehouse__d2-snack": [
    { mode: "bus", label: "시내버스", minutes: 22 },
    { mode: "taxi", label: "택시", minutes: 12 },
  ],
  "d2-snack__d2-train": [
    { mode: "walk", label: "도보", minutes: 12 },
    { mode: "taxi", label: "택시", minutes: 6 },
  ],
};

const STORAGE_KEY = "mokpo-itinerary-v3";
const LEGACY_KEY_V2 = "mokpo-itinerary-v2";
const LEGACY_KEY = "mokpo-itinerary-v1";
const ACCENT_CYCLE: Accent[] = ["blue", "coral", "mint", "sand", "lavender"];

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "day1", label: "Day 1", hint: "토 · 8/22" },
  { id: "day2", label: "Day 2", hint: "일 · 8/23" },
  { id: "food", label: "맛집&카페 후보", hint: "예비 리스트" },
];

const DAY1: TimelineItem[] = [
  {
    id: "d1-train",
    timeLabel: "이동",
    startTime: "10:32",
    endTime: "13:11",
    emoji: "🚝",
    title: "서울역 → 목포역",
    place: "KTX 413",
    maps: [
      {
        name: "서울역",
        address: "서울 용산구 한강대로 405",
        lat: 37.5534363,
        lng: 126.9697994,
      },
      {
        name: "목포역",
        address: "전남 목포시 영산로 98",
        lat: 34.7921339,
        lng: 126.3876448,
      },
    ],
    memo: "토요일 오전, 기차에서 여행 모드 ON",
    accent: "blue",
    ticket: {
      train: "KTX 413",
      car: "10호차",
      seats: [
        { name: "선홍", seat: "1A" },
        { name: "나경", seat: "1B" },
      ],
    },
  },
  {
    id: "d1-lunch",
    timeLabel: "점심",
    startTime: "13:40",
    endTime: "15:00",
    emoji: "🦀",
    title: "목포돌게장",
    place: "점심 식사",
    maps: [
      {
        name: "목포돌게장",
        address: "전남 목포시 해안로 174",
        lat: 34.7809582,
        lng: 126.3800498,
      },
      {
        name: "황가네보리밥",
        address: "전남 목포시 노적봉길 19-4",
        lat: 34.7898507,
        lng: 126.3829788,
      },
    ],
    memo: "또는 황가네보리밥 · 도착하자마자 든든하게",
    accent: "coral",
  },
  {
    id: "d1-cable",
    timeLabel: "오후",
    startTime: "15:40",
    endTime: "16:45",
    emoji: "🚠",
    title: "목포해상케이블카",
    place: "북항승강장 탑승",
    maps: [
      {
        name: "목포해상케이블카 북항승강장",
        address: "전남 목포시 해양대학로 240",
        lat: 34.7994941,
        lng: 126.3699919,
      },
    ],
    memo: "바다 위를 가로지르는 1일차 하이라이트",
    accent: "blue",
  },
  {
    id: "d1-cafe",
    timeLabel: "카페",
    startTime: "17:05",
    endTime: "18:00",
    emoji: "☕",
    title: "SUKSAN",
    place: "1일차 오후 카페",
    maps: [
      {
        name: "SUKSAN 석산",
        address: "전남 목포시 고하대로 588",
        lat: 34.8018401,
        lng: 126.3657397,
      },
    ],
    memo: "케이블카 후 천천히 숨 고르기",
    accent: "sand",
  },
  {
    id: "d1-checkin",
    timeLabel: "체크인",
    startTime: "18:30",
    endTime: "",
    timeDisplay: "checkin",
    emoji: "🏠",
    title: "숙소 체크인",
    place: "브라운도트 목포평화광장점",
    maps: [
      {
        name: "브라운도트 목포평화광장점",
        address: "전남 목포시 통일대로 40",
        lat: 34.7995612,
        lng: 126.4308668,
      },
    ],
    memo: "비즈니스 트윈 · 짐 풀고 잠깐 쉬기",
    accent: "mint",
  },
  {
    id: "d1-dinner",
    timeLabel: "저녁",
    startTime: "19:30",
    endTime: "21:30",
    emoji: "🦪",
    title: "목포씨",
    place: "조개구이 · 저녁 식사 후 산책",
    maps: [
      {
        name: "목포씨",
        address: "전남광주통합특별시 목포시 상동 1160-9",
        lat: 34.7978,
        lng: 126.4362,
      },
      {
        name: "평화광장근린공원",
        address: "전남 목포시 평화로",
        lat: 34.7964,
        lng: 126.4375,
      },
    ],
    memo: "식사 뒤 평화광장근린공원에서 바람 쐬기",
    accent: "lavender",
  },
];

const DAY2: TimelineItem[] = [
  {
    id: "d2-checkout",
    timeLabel: "체크아웃",
    startTime: "12:00",
    endTime: "",
    timeDisplay: "checkout",
    emoji: "🏠",
    title: "숙소 체크아웃",
    place: "브라운도트 목포평화광장점",
    maps: [
      {
        name: "브라운도트 목포평화광장점",
        address: "전남 목포시 통일대로 40",
        lat: 34.7995612,
        lng: 126.4308668,
      },
    ],
    memo: "짐은 가볍게, 오후는 유달동으로",
    accent: "mint",
  },
  {
    id: "d2-brunch",
    timeLabel: "아점",
    startTime: "12:30",
    endTime: "13:45",
    emoji: "🍲",
    title: "해빔 본점",
    place: "브런치 / 점심",
    maps: [
      {
        name: "해빔 본점",
        address: "전남 목포시 미항로 83",
        lat: 34.7968881,
        lng: 126.4354783,
      },
    ],
    memo: "체크아웃 후 느긋한 한 끼",
    accent: "coral",
  },
  {
    id: "d2-romance",
    timeLabel: "카페 투어",
    startTime: "14:20",
    endTime: "15:10",
    emoji: "🍧",
    title: "유달동의로망스",
    place: "디저트 카페",
    maps: [
      {
        name: "유달동의로망스",
        address: "전남 목포시 번화로 19",
        lat: 34.7883538,
        lng: 126.3867426,
      },
    ],
    memo: "무화과 빙수!",
    accent: "sand",
  },
  {
    id: "d2-warehouse",
    timeLabel: "카페 투어",
    startTime: "15:40",
    endTime: "16:10",
    emoji: "🥧",
    title: "커피창고로",
    place: "디저트 카페",
    maps: [
      {
        name: "커피창고로",
        address: "전남 목포시 평화로 51",
        lat: 34.7978174,
        lng: 126.4356081,
      },
    ],
    memo: "에그타르트 맛집",
    accent: "sand",
  },
  {
    id: "d2-snack",
    timeLabel: "잊지 말 것",
    startTime: "16:25",
    endTime: "16:35",
    emoji: "🍡",
    title: "쑥꿀레종합분식",
    place: "포장 필수",
    maps: [
      {
        name: "쑥꿀레 본점",
        address: "전남 목포시 영산로59번길 43-1",
        lat: 34.7901139,
        lng: 126.383757,
      },
    ],
    memo: "서울 가기 전에 꼭 사가기!",
    accent: "coral",
    highlight: true,
  },
  {
    id: "d2-train",
    timeLabel: "이동",
    startTime: "16:54",
    endTime: "19:36",
    emoji: "🚝",
    title: "목포역 → 용산역",
    place: "KTX-산천 426",
    maps: [
      {
        name: "목포역",
        address: "전남 목포시 영산로 98",
        lat: 34.7921339,
        lng: 126.3876448,
      },
      {
        name: "용산역",
        address: "서울 용산구 한강대로23길 55",
        lat: 37.5290767,
        lng: 126.9658972,
      },
    ],
    memo: "일요일 저녁, 집으로 돌아가는 길",
    accent: "blue",
    ticket: {
      train: "KTX-산천 426",
      car: "8호차",
      seats: [
        { name: "선홍", seat: "11C" },
        { name: "나경", seat: "11D" },
      ],
    },
  },
];

const CANDIDATES: CandidateItem[] = [
  {
    id: "c-hwasin",
    category: "카페/디저트",
    emoji: "☕",
    name: "화신연쇄점",
    address: "전남 목포시 번화로 75",
    memo: "분위기 좋은 예비 카페 · 일정 바뀔 때 1순위",
  },
  {
    id: "c-warmcold",
    category: "카페/디저트",
    emoji: "🍦",
    name: "웜콜드아이스크림",
    address: "전남 목포시 노적봉길 7",
    memo: "더운 오후를 식혀줄 디저트 후보",
  },
  {
    id: "c-myungin",
    category: "식당",
    emoji: "🍚",
    name: "명인집 근대역사관점",
    address: "전남 목포시 해안로173번길 45",
    memo: "돌게장/보리밥 대신 들를 한식 후보",
  },
  {
    id: "c-1977",
    category: "식당",
    emoji: "🥘",
    name: "1977남도정식",
    address: "전남 목포시 영산로 38",
    memo: "남도 한상으로 마음을 바꾸면 여기",
  },
];

const ACCENT: Record<Accent, { wrap: string; ring: string; dot: string }> = {
  blue: {
    wrap: "bg-sky-100",
    ring: "ring-sky-200",
    dot: "bg-[#6BA8D9]",
  },
  coral: {
    wrap: "bg-orange-50",
    ring: "ring-orange-100",
    dot: "bg-[#E8A08A]",
  },
  mint: {
    wrap: "bg-teal-50",
    ring: "ring-teal-100",
    dot: "bg-[#7EC8B8]",
  },
  sand: {
    wrap: "bg-amber-50",
    ring: "ring-amber-100",
    dot: "bg-[#E2C07A]",
  },
  lavender: {
    wrap: "bg-indigo-50",
    ring: "ring-indigo-100",
    dot: "bg-[#A9B4E0]",
  },
};

const DEFAULT_DATA: AppData = {
  day1: DAY1,
  day2: DAY2,
  candidates: CANDIDATES,
  transits: {},
};

function mergeById<T extends { id: string }>(base: T[], extra: Record<string, Partial<T>>) {
  return base.map((item) => ({ ...item, ...extra[item.id] }));
}

function applyScheduleDefaults(items: TimelineItem[], defaults: TimelineItem[]) {
  const map = new Map(defaults.map((item) => [item.id, item]));
  const coordsByName = new Map<string, { lat: number; lng: number }>();
  for (const item of defaults) {
    for (const spot of item.maps) {
      if (spot.lat != null && spot.lng != null) {
        coordsByName.set(`${spot.name}|${spot.address}`, {
          lat: spot.lat,
          lng: spot.lng,
        });
        coordsByName.set(spot.name, { lat: spot.lat, lng: spot.lng });
      }
    }
  }
  return items.map((item) => {
    const def = map.get(item.id);
    const maps = item.maps.map((spot) => {
      if (spot.lat != null && spot.lng != null) return spot;
      const hit =
        coordsByName.get(`${spot.name}|${spot.address}`) ??
        coordsByName.get(spot.name);
      return hit ? { ...spot, ...hit } : spot;
    });
    if (!def) return { ...item, maps };
    return {
      ...item,
      maps,
      startTime:
        item.id === "d1-checkin" && item.startTime === "16:00"
          ? def.startTime
          : item.startTime || def.startTime,
      endTime: item.endTime || def.endTime,
    };
  });
}

function loadData(): AppData {
  try {
    const v3 = localStorage.getItem(STORAGE_KEY);
    if (v3) {
      const parsed = JSON.parse(v3) as AppData;
      return {
        day1: applyScheduleDefaults(
          parsed.day1?.length ? parsed.day1 : DAY1,
          DAY1,
        ),
        day2: applyScheduleDefaults(
          parsed.day2?.length ? parsed.day2 : DAY2,
          DAY2,
        ),
        candidates: parsed.candidates?.length ? parsed.candidates : CANDIDATES,
        transits: parsed.transits ?? {},
      };
    }
    const v2 = localStorage.getItem(LEGACY_KEY_V2);
    if (v2) {
      const parsed = JSON.parse(v2) as AppData;
      return {
        day1: applyScheduleDefaults(
          parsed.day1?.length ? parsed.day1 : DAY1,
          DAY1,
        ),
        day2: applyScheduleDefaults(
          parsed.day2?.length ? parsed.day2 : DAY2,
          DAY2,
        ),
        candidates: parsed.candidates?.length ? parsed.candidates : CANDIDATES,
        transits: {},
      };
    }
    const v1 = localStorage.getItem(LEGACY_KEY);
    if (v1) {
      const legacy = JSON.parse(v1) as LegacyEdits;
      return {
        day1: applyScheduleDefaults(
          mergeById(DAY1, legacy.timeline ?? {}),
          DAY1,
        ),
        day2: applyScheduleDefaults(
          mergeById(DAY2, legacy.timeline ?? {}),
          DAY2,
        ),
        candidates: mergeById(CANDIDATES, legacy.candidates ?? {}),
        transits: {},
      };
    }
  } catch {
    /* keep defaults */
  }
  return DEFAULT_DATA;
}

function createTimelineItem(index: number): TimelineItem {
  return {
    id: `custom-${Date.now()}`,
    timeLabel: "일정",
    startTime: "",
    endTime: "",
    emoji: "📍",
    title: "새 일정",
    place: "",
    maps: [{ name: "", address: "" }],
    memo: "",
    accent: ACCENT_CYCLE[index % ACCENT_CYCLE.length],
  };
}

export default function App() {
  const [tab, setTab] = useState<TabId>("day1");
  const [isCableCarModalOpen, setIsCableCarModalOpen] = useState(false);
  const [data, setData] = useState<AppData>(loadData);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const patchDay = (
    day: "day1" | "day2",
    id: string,
    patch: Partial<TimelineItem>,
  ) => {
    setData((prev) => ({
      ...prev,
      [day]: prev[day].map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  };

  const replaceDay = (day: "day1" | "day2", items: TimelineItem[]) => {
    setData((prev) => ({ ...prev, [day]: items }));
  };

  const patchTransit = (fromId: string, toId: string, options: TransitOption[]) => {
    setData((prev) => ({
      ...prev,
      transits: { ...prev.transits, [transitKey(fromId, toId)]: options },
    }));
  };

  const patchCandidate = (id: string, patch: Partial<CandidateItem>) => {
    setData((prev) => ({
      ...prev,
      candidates: prev.candidates.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  };

  return (
    <div className="min-h-dvh bg-[#cfe6f4] text-slate-800">
      <div className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-x-clip bg-[#eef6fb] shadow-[0_0_60px_rgba(61,126,175,0.18)]">
        <Header />
        <TabBar tab={tab} onChange={setTab} />
        <main className="min-w-0 px-4 pb-10 pt-3">
          <div key={tab} className="min-w-0 animate-fade-up">
            {tab === "day1" && (
              <Timeline
                label="토요일"
                date="8월 22일"
                subtitle="서울에서 목포로, 바다를 만나는 날"
                items={data.day1}
                editing={false}
                transits={data.transits}
                onChange={(id, patch) => patchDay("day1", id, patch)}
                onTransitChange={patchTransit}
                onAdd={() =>
                  replaceDay("day1", [
                    ...data.day1,
                    createTimelineItem(data.day1.length),
                  ])
                }
                onMove={(id, direction) =>
                  replaceDay("day1", moveItem(data.day1, id, direction))
                }
                onRemove={(id) =>
                  replaceDay(
                    "day1",
                    data.day1.filter((item) => item.id !== id),
                  )
                }
                onOpenCableGuide={() => setIsCableCarModalOpen(true)}
                sun={DAY_SUN.day1}
              />
            )}
            {tab === "day2" && (
              <Timeline
                label="일요일"
                date="8월 23일"
                subtitle="유달동을 걷고, 쑥꿀레를 챙겨 서울로"
                items={data.day2}
                editing={false}
                transits={data.transits}
                onChange={(id, patch) => patchDay("day2", id, patch)}
                onTransitChange={patchTransit}
                onAdd={() =>
                  replaceDay("day2", [
                    ...data.day2,
                    createTimelineItem(data.day2.length),
                  ])
                }
                onMove={(id, direction) =>
                  replaceDay("day2", moveItem(data.day2, id, direction))
                }
                onRemove={(id) =>
                  replaceDay(
                    "day2",
                    data.day2.filter((item) => item.id !== id),
                  )
                }
                sun={DAY_SUN.day2}
              />
            )}
            {tab === "food" && (
              <CandidateList
                items={data.candidates}
                editing={false}
                onChange={patchCandidate}
                onAdd={(category) =>
                  setData((prev) => ({
                    ...prev,
                    candidates: [
                      ...prev.candidates,
                      {
                        id: `c-${Date.now()}`,
                        category,
                        emoji: category === "식당" ? "🍽️" : "☕",
                        name: "새 후보",
                        address: "",
                        memo: "",
                      },
                    ],
                  }))
                }
                onRemove={(id) =>
                  setData((prev) => ({
                    ...prev,
                    candidates: prev.candidates.filter((item) => item.id !== id),
                  }))
                }
              />
            )}
          </div>
        </main>
        <footer className="px-6 pb-[max(28px,env(safe-area-inset-bottom))] text-center">
          <p className="text-[12px] leading-5 text-slate-400">
            바꾼 일정은 이 폰에 자동 저장돼요
            <br />
            나경 & 선홍 목포 힐링 여행 🌊
          </p>
        </footer>
      </div>
      {isCableCarModalOpen && (
        <CableCarModal onClose={() => setIsCableCarModalOpen(false)} />
      )}
    </div>
  );
}

function moveItem<T extends { id: string }>(
  items: T[],
  id: string,
  direction: -1 | 1,
) {
  const index = items.findIndex((item) => item.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return items;
  const copy = [...items];
  const current = copy[index];
  const swapped = copy[next];
  if (!current || !swapped) return items;
  copy[index] = swapped;
  copy[next] = current;
  return copy;
}

function Header() {
  return (
    <header className="wave-mask relative overflow-hidden px-5 pb-8 pt-[max(20px,env(safe-area-inset-top))] text-white">
      <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/20 blur-2xl" />
      <div className="pointer-events-none absolute left-10 top-16 h-20 w-20 rounded-full bg-sky-100/30 blur-xl" />

      <div className="relative">
        <span className="inline-flex items-center gap-1 rounded-md bg-white/25 px-3 py-1 text-[11px] font-semibold tracking-wide shadow-[0_4px_12px_rgba(255,255,255,0.12)] backdrop-blur-sm">
          1박 2일 · 내일 출발
        </span>
        <h1 className="mt-4 text-[26px] font-extrabold leading-[1.28] tracking-tight drop-shadow-[0_2px_8px_rgba(61,126,175,0.25)]">
          나경 & 선홍
          <br />
          목포 힐링 여행 🌊
        </h1>
        <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-white/20 px-3 py-1.5 text-[13px] font-medium backdrop-blur-sm">
          <span aria-hidden>📅</span>
          2026.08.22 - 08.23
        </p>
      </div>

      <svg
        className="absolute inset-x-0 -bottom-px h-8 w-full text-[#eef6fb]"
        viewBox="0 0 430 32"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0 18c48 12 86-10 140-10 62 0 82 16 150 16 52 0 92-12 140-16v24H0V18z"
        />
      </svg>
    </header>
  );
}

const CABLE_STEPS = [
  "북항 승강장 탑승 (오후 4~5시경)",
  "유달산 통과 후 고하도 승강장 하차",
  "고하도 해상데크길 & 전망대 산책",
  "다시 탑승 후 유달산 하차 (황금빛 일몰 감상)",
  "북항으로 복귀 (총 소요 시간: 약 1시간 30분 ~ 2시간)",
];

const CABLE_TIPS = [
  "바닥이 뚫려있는 크리스탈 캐빈을 타면 훨씬 짜릿해요!",
  "하루 전 네이버 예매 시 약간 할인돼요.",
  "티켓 바코드가 있으면 북항 주차장 3시간 무료예요.",
];

const CABLE_ALT_ROUTES = [
  {
    label: "바다만 짧게 보기",
    path: "북항 ➔ 고하도 ➔ 북항 (통과)",
  },
  {
    label: "편도 이용 시",
    path: "북항 ➔ 고하도 (이후 택시 이동)",
  },
];

function CableCarModal({ onClose }: { onClose: () => void }) {
  const [altsOpen, setAltsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapZoom, setMapZoom] = useState(1.4);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mapOpen) {
        setMapOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mapOpen, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cable-modal-title"
        className="animate-modal-in relative z-10 max-h-[85vh] w-[90%] max-w-sm overflow-y-auto rounded-[24px] bg-white p-5 shadow-xl pb-safe"
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <h2
            id="cable-modal-title"
            className="text-[17px] leading-snug font-bold tracking-tight text-slate-800"
          >
            🚠 목포 해상케이블카 100% 즐기기
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[18px] font-medium text-gray-400"
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        <div className="relative mb-4 overflow-hidden rounded-xl">
          <img
            src={`${import.meta.env.BASE_URL}cablecar-map.png`}
            alt="케이블카 지도"
            draggable={false}
            className="block h-auto w-full"
          />
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className="absolute right-2 bottom-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[#3D7EAF] shadow-md"
          >
            크게 보기
          </button>
        </div>

        <section className="rounded-2xl bg-blue-50/50 p-4">
          <h3 className="text-[13px] font-bold text-[#3D7EAF]">
            📍 완벽 동선 추천
          </h3>
          <ol className="mt-3 space-y-2.5">
            {CABLE_STEPS.map((step, index) => (
              <li key={step} className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#cfe8f6] text-[11px] font-black text-[#3D7EAF]">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-[13px] leading-5 font-medium text-slate-600">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-3 rounded-2xl bg-yellow-50/50 p-4">
          <h3 className="text-[13px] font-bold text-amber-700">💡 탑승 꿀팁</h3>
          <ul className="mt-3 space-y-2">
            {CABLE_TIPS.map((tip) => (
              <li
                key={tip}
                className="flex gap-2 text-[13px] leading-5 text-slate-600"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-3">
          <button
            type="button"
            onClick={() => setAltsOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-2 py-1 text-left"
            aria-expanded={altsOpen}
          >
            <span className="text-sm font-semibold text-gray-500">
              🔄 다른 탑승 경로 요약
            </span>
            <span className="text-xs font-bold text-gray-400">
              {altsOpen ? "접기" : "보기"}
            </span>
          </button>
          {altsOpen && (
            <ul className="mt-1 space-y-1.5 px-0.5">
              {CABLE_ALT_ROUTES.map((route) => (
                <li key={route.label} className="text-sm leading-5 text-gray-500">
                  <span className="font-medium">{route.label}</span>
                  <span className="text-gray-400"> · {route.path}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {mapOpen && (
        <div className="absolute inset-0 z-20 flex flex-col bg-black/85">
          <header className="flex items-center justify-between gap-2 px-4 py-3">
            <p className="text-[13px] font-bold text-white">
              목포해상케이블카 안내 지도
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setMapZoom((value) => Math.max(1, Number((value - 0.3).toFixed(2))))
                }
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white"
                aria-label="축소"
              >
                −
              </button>
              <button
                type="button"
                onClick={() =>
                  setMapZoom((value) => Math.min(3, Number((value + 0.3).toFixed(2))))
                }
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white"
                aria-label="확대"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[18px] font-medium text-gray-500"
                aria-label="지도 닫기"
              >
                ×
              </button>
            </div>
          </header>
          <div
            className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-6"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <img
              src={`${import.meta.env.BASE_URL}cablecar-map.png`}
              alt="케이블카 지도 확대"
              draggable={false}
              className="max-w-none rounded-xl"
              style={{ width: `${mapZoom * 100}%` }}
            />
          </div>
          <p className="px-4 pb-[max(12px,env(safe-area-inset-bottom))] text-center text-[11px] text-white/70">
            손가락으로 밀어서 이동 · +/−로 확대
          </p>
        </div>
      )}
    </div>
  );
}

function TabBar({
  tab,
  onChange,
}: {
  tab: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav className="sticky top-0 z-20 -mt-1 bg-[#eef6fb]/90 px-4 pb-1 pt-1 backdrop-blur-md">
      <div className="flex gap-1 rounded-xl bg-white p-1.5 shadow-[0_10px_28px_rgba(91,140,180,0.12)]">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={[
                "min-w-0 flex-1 rounded-lg px-2 py-2.5 text-center transition-all duration-300",
                active
                  ? "animate-tab-pop bg-gradient-to-b from-[#8ec8ea] to-[#6BA8D9] text-white shadow-[0_8px_18px_rgba(107,168,217,0.38)]"
                  : "text-slate-400 hover:bg-sky-50 hover:text-slate-600",
              ].join(" ")}
            >
              <span
                className={[
                  "block truncate text-[13px] font-bold leading-tight",
                  item.id === "food" ? "tracking-tight" : "",
                ].join(" ")}
              >
                {item.label}
              </span>
              <span
                className={[
                  "mt-0.5 block text-[10px] font-medium",
                  active ? "text-white/80" : "text-slate-300",
                ].join(" ")}
              >
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function SunDivider({ kind, time }: { kind: SunKind; time: string }) {
  const isSunrise = kind === "sunrise";
  const label = isSunrise ? `🌄 일출 ${time}` : `🌅 일몰 ${time}`;
  const line = isSunrise ? "bg-amber-200" : "bg-orange-200";
  const text = isSunrise ? "text-amber-500" : "text-orange-400";

  return (
    <li className="grid min-w-0 grid-cols-[22px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center py-1">
        <span className="w-px flex-1 border-l border-dashed border-sky-200" />
        <span className="my-0.5 text-[11px]" aria-hidden>
          {isSunrise ? "🌄" : "🌅"}
        </span>
        <span className="w-px flex-1 border-l border-dashed border-sky-200" />
      </div>
      <div className="flex items-center gap-2 py-2.5" aria-label={label}>
        <span className={`h-px flex-1 ${line}`} />
        <span className={`shrink-0 text-[12px] font-bold tracking-wide ${text}`}>
          {label}
        </span>
        <span className={`h-px flex-1 ${line}`} />
      </div>
    </li>
  );
}

function Timeline({
  label,
  date,
  subtitle,
  items,
  editing,
  transits,
  onChange,
  onTransitChange,
  onAdd,
  onMove,
  onRemove,
  onOpenCableGuide,
  sun,
}: {
  label: string;
  date: string;
  subtitle: string;
  items: TimelineItem[];
  editing: boolean;
  transits: Record<string, TransitOption[]>;
  onChange: (id: string, patch: Partial<TimelineItem>) => void;
  onTransitChange: (fromId: string, toId: string, options: TransitOption[]) => void;
  onAdd: () => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onOpenCableGuide?: () => void;
  sun?: SunTimes;
}) {
  const sunEvents = sun ? sunEventsForDay(items, sun) : [];

  const sunBefore = (index: number) => {
    const prevMinutes =
      index === 0
        ? Number.NEGATIVE_INFINITY
        : (timeToMinutes(items[index - 1]?.startTime ?? "") ??
          Number.NEGATIVE_INFINITY);
    const itemMinutes =
      timeToMinutes(items[index]?.startTime ?? "") ?? Number.POSITIVE_INFINITY;
    return sunEvents.filter(
      (event) => event.minutes >= prevMinutes && event.minutes < itemMinutes,
    );
  };

  const lastStart =
    timeToMinutes(items[items.length - 1]?.startTime ?? "") ??
    Number.NEGATIVE_INFINITY;
  const sunAfterLast = sunEvents.filter((event) => event.minutes >= lastStart);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between px-1">
        <div>
          <p className="text-[12px] font-semibold text-[#6BA8D9]">{label}</p>
          <h2 className="text-[20px] font-extrabold tracking-tight text-slate-800">
            {date}
          </h2>
        </div>
        <p className="max-w-[58%] text-right text-[11px] leading-4 text-slate-400">
          {subtitle}
        </p>
      </div>

      <ol className="space-y-0">
        {items.map((item, index) => {
          const next = items[index + 1];
          const sunHere = sunBefore(index);

          return (
            <Fragment key={item.id}>
              {sunHere.map((event) => (
                <SunDivider
                  key={`${event.kind}-${event.time}`}
                  kind={event.kind}
                  time={event.time}
                />
              ))}
              <TimelineCard
                item={item}
                isLast={index === items.length - 1 && sunAfterLast.length === 0}
                editing={editing}
                onChange={(patch) => onChange(item.id, patch)}
                onMoveUp={() => onMove(item.id, -1)}
                onMoveDown={() => onMove(item.id, 1)}
                onRemove={() => onRemove(item.id)}
                canMoveUp={index > 0}
                canMoveDown={index < items.length - 1}
                onOpenGuide={
                  item.id === "d1-cable" && !editing
                    ? onOpenCableGuide
                    : undefined
                }
              />
              {next && (
                <TransitCard
                  from={item}
                  to={next}
                  options={
                    transits[transitKey(item.id, next.id)] ??
                    DEFAULT_TRANSITS[transitKey(item.id, next.id)] ??
                    FALLBACK_TRANSIT
                  }
                  editing={editing}
                  onChange={(options) =>
                    onTransitChange(item.id, next.id, options)
                  }
                />
              )}
            </Fragment>
          );
        })}
        {sunAfterLast.map((event) => (
          <SunDivider
            key={`${event.kind}-${event.time}`}
            kind={event.kind}
            time={event.time}
          />
        ))}
      </ol>

      {editing && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-1 w-full rounded-xl border border-dashed border-sky-200 bg-white py-3 text-[13px] font-bold text-[#3D7EAF] shadow-[0_8px_18px_rgba(91,140,180,0.08)]"
        >
          + 일정 추가
        </button>
      )}
    </section>
  );
}

function TransitCard({
  from,
  to,
  options,
  editing,
  onChange,
}: {
  from: TimelineItem;
  to: TimelineItem;
  options: TransitOption[];
  editing: boolean;
  onChange: (options: TransitOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const fromSpot = routeSpot(from, "from");
  const toSpot = routeSpot(to, "to");
  const fromName = routePlaceName(fromSpot, from.title);
  const toName = routePlaceName(toSpot, to.title);
  const routeUrl = naverRouteUrl(
    { ...fromSpot, name: fromName },
    { ...toSpot, name: toName },
  );
  const recommended = options[0];
  const expanded = open;

  return (
    <li className="grid min-w-0 grid-cols-[22px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center py-0.5">
        <span className="w-px flex-1 border-l border-dashed border-sky-300" />
        <span className="my-0.5 text-[12px] font-bold text-[#6BA8D9]">↓</span>
        <span className="w-px flex-1 border-l border-dashed border-sky-300" />
      </div>

      <div className="mb-3 min-w-0 overflow-hidden rounded-xl bg-white/90 shadow-[0_8px_20px_rgba(91,140,180,0.08)] ring-1 ring-sky-100">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold text-slate-400">
              네이버 지도 이동 경로
            </span>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-slate-600">
              {fromName} → {toName}
              {recommended
                ? ` · ${TRANSIT_ICON[recommended.mode]} ${recommended.minutes}분`
                : ""}
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-bold text-[#6BA8D9]">
            {expanded ? "접기" : "열기"}
          </span>
        </button>

        {expanded && (
          <div className="border-t border-sky-50 px-3 pt-2">
            <p className="mb-1.5 text-[10px] font-bold text-slate-400">
              소요 시간 · 네이버 지도 기준
            </p>
            <ul className="space-y-1.5">
              {options.map((option, index) => (
                <li
                  key={`${option.mode}-${index}`}
                  className="flex items-center gap-2 text-[13px] text-slate-600"
                >
                  <span className="text-[15px]" aria-hidden>
                    {TRANSIT_ICON[option.mode]}
                  </span>
                  {editing ? (
                    <>
                      <input
                        value={option.label}
                        onChange={(event) =>
                          onChange(
                            options.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="min-w-0 flex-1 rounded-md bg-sky-50 px-2 py-1 text-[12px] font-semibold outline-none"
                      />
                      <input
                        type="number"
                        min={1}
                        value={option.minutes}
                        onChange={(event) =>
                          onChange(
                            options.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    minutes: Number(event.target.value) || 1,
                                  }
                                : item,
                            ),
                          )
                        }
                        className="w-12 rounded-md bg-sky-50 px-1.5 py-1 text-center text-[12px] font-bold outline-none"
                      />
                      <span className="text-[11px] text-slate-400">분</span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 font-semibold">
                        {option.label} 약 {option.minutes}분
                      </span>
                      {index === 0 && (
                        <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-[#3D7EAF]">
                          추천
                        </span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="px-3 pb-3 pt-2">
          <a
            href={routeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="flex items-center justify-center gap-1 rounded-lg bg-[#cfe8f6] py-2 text-[12px] font-extrabold text-[#3D7EAF] shadow-[0_6px_12px_rgba(107,168,217,0.18)]"
          >
            📍 네이버지도 길찾기
          </a>
        </div>
      </div>
    </li>
  );
}

function TimelineCard({
  item,
  isLast,
  editing,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
  onOpenGuide,
}: {
  item: TimelineItem;
  isLast: boolean;
  editing: boolean;
  onChange: (patch: Partial<TimelineItem>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpenGuide?: () => void;
}) {
  const accent = ACCENT[item.accent];
  const timeDisplay = item.timeDisplay ?? "range";

  return (
    <li className="grid min-w-0 grid-cols-[22px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <span
          className={[
            "mt-6 h-[11px] w-[11px] rounded-full ring-4 ring-white",
            accent.dot,
            item.highlight ? "shadow-[0_0_0_6px_rgba(232,160,138,0.18)]" : "",
          ].join(" ")}
        />
        {!isLast && (
          <span className="w-px flex-1 border-l border-dashed border-sky-200" />
        )}
      </div>

      <article
        className={[
          isLast ? "mb-3" : "mb-1",
          "min-w-0 overflow-hidden rounded-xl bg-white p-4 shadow-[0_10px_28px_rgba(91,140,180,0.12)]",
          item.highlight ? "ring-2 ring-[#E8A08A]/50" : "",
          onOpenGuide
            ? "cursor-pointer ring-1 ring-[#cfe8f6] active:bg-sky-50"
            : "",
        ].join(" ")}
      >
        <div
          className="flex items-start gap-3"
          onClick={onOpenGuide}
          role={onOpenGuide ? "button" : undefined}
          aria-label={onOpenGuide ? `${item.title} 가이드 보기` : undefined}
          tabIndex={onOpenGuide ? 0 : undefined}
          onKeyDown={
            onOpenGuide
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenGuide();
                  }
                }
              : undefined
          }
        >
          {editing ? (
            <input
              value={item.emoji}
              onChange={(event) => onChange({ emoji: event.target.value })}
              className={[
                "h-12 w-12 shrink-0 rounded-lg text-center text-[22px] outline-none ring-1",
                accent.wrap,
                accent.ring,
              ].join(" ")}
              aria-label="이모지"
            />
          ) : (
            <div
              className={[
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-[22px] ring-1",
                accent.wrap,
                accent.ring,
              ].join(" ")}
            >
              <span aria-hidden>{item.emoji}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-1.5">
                <input
                  value={item.timeLabel}
                  onChange={(event) =>
                    onChange({ timeLabel: event.target.value })
                  }
                  className="w-full rounded-md bg-sky-50 px-2 py-1 text-[11px] font-bold text-[#6BA8D9] outline-none"
                  placeholder="구분 (점심, 카페 등)"
                />
                <input
                  value={item.title}
                  onChange={(event) => onChange({ title: event.target.value })}
                  className="w-full rounded-md bg-[#f6fbfe] px-2 py-1.5 text-[16px] font-extrabold text-slate-800 outline-none"
                  placeholder="장소 / 일정 이름"
                />
                <input
                  value={item.place}
                  onChange={(event) => onChange({ place: event.target.value })}
                  className="w-full rounded-md bg-[#f6fbfe] px-2 py-1 text-[12px] text-slate-500 outline-none"
                  placeholder="한 줄 설명"
                />
              </div>
            ) : (
              <>
                <p className="text-[11px] font-bold tracking-wide text-[#6BA8D9]">
                  {item.timeLabel}
                </p>
                <h3 className="mt-0.5 truncate text-[16px] font-extrabold text-slate-800">
                  {item.title}
                </h3>
                {item.place && (
                  <p className="mt-0.5 break-words text-[12px] font-medium text-slate-500">
                    {item.place}
                  </p>
                )}
                {onOpenGuide && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#cfe8f6] px-2.5 py-1 text-[11px] font-extrabold text-[#3D7EAF]">
                    가이드 보기
                    <span aria-hidden>→</span>
                  </span>
                )}
              </>
            )}
            {editing ? (
              <MapEditor
                spots={item.maps}
                onChange={(maps) => onChange({ maps })}
              />
            ) : (
              <div
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <MapLinks spots={item.maps} />
              </div>
            )}
          </div>
          {!editing && onOpenGuide && (
            <span
              className="mt-3 shrink-0 text-[18px] font-black text-[#6BA8D9]"
              aria-hidden
            >
              ›
            </span>
          )}
          {!editing && item.highlight && (
            <span className="shrink-0 rounded-md bg-orange-50 px-2 py-1 text-[10px] font-bold text-[#d4846a]">
              꼭!
            </span>
          )}
        </div>

        {editing && (
          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="flex-1 rounded-lg bg-sky-50 py-2 text-[11px] font-bold text-[#3D7EAF] disabled:opacity-30"
            >
              위로
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="flex-1 rounded-lg bg-sky-50 py-2 text-[11px] font-bold text-[#3D7EAF] disabled:opacity-30"
            >
              아래로
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="flex-1 rounded-lg bg-orange-50 py-2 text-[11px] font-bold text-[#d4846a]"
            >
              삭제
            </button>
          </div>
        )}

        <div
          className={
            timeDisplay === "range"
              ? "mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1.5"
              : "mt-3 min-w-0"
          }
        >
          {timeDisplay === "checkin" && (
            <TimeField
              value={item.startTime}
              onChange={(startTime) => onChange({ startTime })}
              label="체크인"
            />
          )}
          {timeDisplay === "checkout" && (
            <TimeField
              value={item.startTime}
              onChange={(startTime) => onChange({ startTime })}
              label="체크아웃"
            />
          )}
          {timeDisplay === "range" && (
            <>
              <TimeField
                value={item.startTime}
                onChange={(startTime) => onChange({ startTime })}
                label="시작"
              />
              <span className="self-center text-[12px] font-semibold text-slate-300">
                ~
              </span>
              <TimeField
                value={item.endTime}
                onChange={(endTime) => onChange({ endTime })}
                label="종료"
              />
            </>
          )}
        </div>

        <MemoField
          value={item.memo}
          onChange={(memo) => onChange({ memo })}
          className="mt-3"
        />

        {item.ticket && <TicketStrip ticket={item.ticket} />}
      </article>
    </li>
  );
}

function MapEditor({
  spots,
  onChange,
}: {
  spots: MapSpot[];
  onChange: (spots: MapSpot[]) => void;
}) {
  const patch = (index: number, next: Partial<MapSpot>) => {
    onChange(
      spots.map((spot, spotIndex) =>
        spotIndex === index ? { ...spot, ...next } : spot,
      ),
    );
  };

  return (
    <div className="mt-2 space-y-2">
      {spots.map((spot, index) => (
        <div key={index} className="rounded-lg bg-sky-50 p-2">
          <input
            value={spot.name}
            onChange={(event) => patch(index, { name: event.target.value })}
            placeholder="상호"
            className="mb-1 w-full bg-transparent text-[12px] font-bold text-slate-700 outline-none"
          />
          <div className="flex items-center gap-1">
            <input
              value={spot.address}
              onChange={(event) =>
                patch(index, { address: event.target.value })
              }
              placeholder="네이버 지도 주소"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[#3D7EAF] outline-none"
            />
            {spots.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange(spots.filter((_, spotIndex) => spotIndex !== index))
                }
                className="text-[10px] font-bold text-slate-400"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...spots, { name: "", address: "" }])}
        className="text-[11px] font-bold text-[#6BA8D9]"
      >
        + 위치 추가
      </button>
    </div>
  );
}

function MapLinks({ spots }: { spots: MapSpot[] }) {
  const visible = spots.filter((spot) => spot.name || spot.address);
  if (visible.length === 0) return null;

  return (
    <ul className="mt-1 space-y-1">
      {visible.map((spot) => (
        <li key={`${spot.name}-${spot.address}`}>
          <a
            href={naverMapUrl(spot.name || spot.address, spot.address || spot.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-start gap-1.5 rounded-md py-0.5 active:bg-sky-50"
          >
            <span className="mt-px text-[12px]" aria-hidden>
              📍
            </span>
            <span className="min-w-0 flex-1">
              {visible.length > 1 && spot.name && (
                <span className="block text-[12px] font-bold text-slate-600">
                  {spot.name}
                </span>
              )}
              <span className="block break-words text-[12px] leading-4 text-[#3D7EAF] underline decoration-sky-200 underline-offset-2">
                {spot.address || spot.name}
              </span>
            </span>
            <span className="mt-0.5 shrink-0 text-[10px] font-bold text-[#6BA8D9]">
              지도
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function MemoField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
      placeholder="메모를 적어 주세요"
      className={[
        "memo-field w-full resize-none overflow-hidden rounded-lg bg-[#f6fbfe] px-3 py-2 text-[13px] leading-5 text-slate-500 outline-none ring-sky-200 placeholder:text-slate-300 focus:ring-2",
        className ?? "",
      ].join(" ")}
    />
  );
}

function TimeField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="flex min-w-0 w-full flex-col gap-0.5 overflow-hidden rounded-lg bg-sky-50 px-2.5 py-1.5 ring-1 ring-sky-100 focus-within:ring-2 focus-within:ring-sky-300">
      <span className="text-[10px] font-bold text-[#6BA8D9]">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="time-input min-w-0 bg-transparent text-[13px] font-bold text-slate-700 outline-none"
      />
    </label>
  );
}

function TicketStrip({ ticket }: { ticket: Ticket }) {
  return (
    <div className="relative mt-3 overflow-hidden rounded-lg bg-gradient-to-r from-sky-50 to-indigo-50 px-3 py-3">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-[11px] font-bold text-[#3D7EAF]">
        <span className="min-w-0 truncate">🎫 {ticket.train}</span>
        <span className="shrink-0">{ticket.car}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ticket.seats.map((seat) => (
          <div
            key={seat.seat}
            className="rounded-md bg-white/80 px-3 py-2 text-center shadow-[0_4px_12px_rgba(107,168,217,0.12)]"
          >
            <p className="text-[10px] font-semibold text-slate-400">
              {seat.name}
            </p>
            <p className="text-[16px] font-black tracking-wide text-slate-800">
              {seat.seat}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateList({
  items,
  editing,
  onChange,
  onAdd,
  onRemove,
}: {
  items: CandidateItem[];
  editing: boolean;
  onChange: (id: string, patch: Partial<CandidateItem>) => void;
  onAdd: (category: CandidateItem["category"]) => void;
  onRemove: (id: string) => void;
}) {
  const groups = [
    {
      key: "카페/디저트" as const,
      caption: "달콤한 예비 코스",
      list: items.filter((item) => item.category === "카페/디저트"),
    },
    {
      key: "식당" as const,
      caption: "배고플 때 플랜 B",
      list: items.filter((item) => item.category === "식당"),
    },
  ];

  return (
    <section>
      <div className="mb-4 rounded-xl bg-white p-4 shadow-[0_10px_28px_rgba(91,140,180,0.12)]">
        <p className="text-[12px] font-bold text-[#6BA8D9]">Plan B</p>
        <h2 className="mt-1 text-[18px] font-extrabold tracking-tight">
          일정이 바뀔 때를 위한 후보
        </h2>
        <p className="mt-1 text-[12px] leading-5 text-slate-400">
          Day 1 · Day 2 코스가 밀리거나 줄 서면 여기로 유연하게 바꿔요.
        </p>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-[15px] font-extrabold text-slate-800">
              {group.key}
            </h3>
            <span className="text-[11px] font-medium text-slate-400">
              {group.caption}
            </span>
          </div>
          <ul className="space-y-3">
            {group.list.map((item) => (
              <li
                key={item.id}
                className="rounded-xl bg-white p-4 shadow-[0_10px_28px_rgba(91,140,180,0.12)]"
              >
                <div className="flex items-start gap-3">
                  {editing ? (
                    <input
                      value={item.emoji}
                      onChange={(event) =>
                        onChange(item.id, { emoji: event.target.value })
                      }
                      className="h-12 w-12 shrink-0 rounded-lg bg-sky-50 text-center text-[22px] outline-none ring-1 ring-sky-100"
                      aria-label="이모지"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-[22px] ring-1 ring-sky-100">
                      <span aria-hidden>{item.emoji}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <>
                        <input
                          value={item.name}
                          onChange={(event) =>
                            onChange(item.id, { name: event.target.value })
                          }
                          className="w-full rounded-md bg-[#f6fbfe] px-2 py-1.5 text-[15px] font-extrabold text-slate-800 outline-none"
                          placeholder="상호"
                        />
                        <input
                          value={item.address}
                          onChange={(event) =>
                            onChange(item.id, { address: event.target.value })
                          }
                          className="mt-1 w-full rounded-md bg-sky-50 px-2 py-1 text-[12px] text-[#3D7EAF] outline-none"
                          placeholder="네이버 지도 주소"
                        />
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <h4 className="truncate text-[15px] font-extrabold text-slate-800">
                            {item.name}
                          </h4>
                          <span className="shrink-0 rounded-md bg-[#eaf4fb] px-2 py-0.5 text-[10px] font-bold text-[#3D7EAF]">
                            후보
                          </span>
                        </div>
                        <MapLinks
                          spots={[
                            { name: item.name, address: item.address },
                          ]}
                        />
                      </>
                    )}
                    <MemoField
                      value={item.memo}
                      onChange={(memo) => onChange(item.id, { memo })}
                      className="mt-2"
                    />
                    {editing && (
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        className="mt-2 text-[11px] font-bold text-[#d4846a]"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {editing && (
            <button
              type="button"
              onClick={() => onAdd(group.key)}
              className="mt-3 w-full rounded-xl border border-dashed border-sky-200 bg-white py-3 text-[13px] font-bold text-[#3D7EAF]"
            >
              + {group.key} 추가
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
