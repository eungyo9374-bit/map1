// 에이전트가 쓰는 도구 2개: find_spots, get_weather (Open-Meteo, 키 불필요)
// 파일명이 _ 로 시작하면 Vercel 이 API 주소로 노출하지 않는다.
const data = require('../jeju_spots_v2.json');

const AREAS = ['동쪽', '서쪽', '서귀포', '제주시'];

// Gemini 에 알려 주는 도구 설명(functionDeclarations)
const functionDeclarations = [
  {
    name: 'find_spots',
    description:
      '제주 관광지 목록에서 지역과 실내/야외 조건에 맞는 장소를 최대 8곳 찾아 이름 · 지역 · 실내 여부 · 설명을 돌려준다. ' +
      '목록 밖 장소는 없다: 결과에 없는 장소는 추천하거나 지어내지 않는다.',
    parameters: {
      type: 'object',
      properties: {
        area: { type: 'string', enum: AREAS, description: '동쪽 · 서쪽 · 서귀포 · 제주시 중 하나' },
        indoor: { type: 'boolean', description: 'true 면 실내만, false 면 야외만. 생략하면 구분하지 않는다.' },
      },
      required: ['area'],
    },
  },
  {
    name: 'get_weather',
    description:
      '제주 지역의 오늘 날씨(현재 기온 · 강수량 · 바람 · 날씨 상태, 오늘 강수확률)를 돌려준다. ' +
      '비가 오거나 바람이 강하면 실내, 맑으면 야외를 추천하는 근거로 쓴다.',
    parameters: {
      type: 'object',
      properties: {
        area: { type: 'string', enum: AREAS, description: '동쪽 · 서쪽 · 서귀포 · 제주시 중 하나' },
      },
      required: ['area'],
    },
  },
];

function find_spots({ area, indoor } = {}) {
  if (!AREAS.includes(area)) return { error: `area 는 ${AREAS.join(' · ')} 중 하나여야 합니다.` };
  const spots = data.spots
    .filter((s) => s.area === area)
    .filter((s) => typeof indoor !== 'boolean' || s.indoor === indoor)
    .slice(0, 8)
    .map((s) => ({ name: s.name, area: s.area, indoor: s.indoor, desc: s.desc, lat: s.lat, lon: s.lon }));
  return { count: spots.length, spots };
}

const CODES = {
  0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림', 45: '안개', 48: '안개',
  51: '이슬비', 53: '이슬비', 55: '이슬비', 61: '비', 63: '비', 65: '강한 비',
  71: '눈', 73: '눈', 75: '눈', 80: '소나기', 81: '소나기', 82: '강한 소나기', 95: '뇌우', 96: '뇌우', 99: '뇌우',
};

async function get_weather({ area } = {}) {
  if (!AREAS.includes(area)) return { error: `area 는 ${AREAS.join(' · ')} 중 하나여야 합니다.` };
  const [lat, lon] = data.areas[area];
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'Asia/Seoul', forecast_days: '1', wind_speed_unit: 'ms',
    current: 'temperature_2m,precipitation,weather_code,wind_speed_10m',
    daily: 'precipitation_probability_max',
  });
  const r = await fetch(url);
  if (!r.ok) return { error: `날씨 조회 실패 (${r.status})` };
  const d = await r.json();
  return {
    area,
    weather: CODES[d.current.weather_code] || '알 수 없음',
    temp_c: d.current.temperature_2m,
    precipitation_mm: d.current.precipitation,
    wind_ms: d.current.wind_speed_10m,
    rain_probability_percent: d.daily.precipitation_probability_max[0],
  };
}

const handlers = { find_spots, get_weather };

module.exports = { functionDeclarations, handlers };
