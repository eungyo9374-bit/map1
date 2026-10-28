// Vercel 서버리스 함수: Gemini 가 find_spots / get_weather 를 스스로 골라 호출해 추천한다.
// 키는 환경변수 GEMINI_API_KEY 에만 두고 브라우저에는 노출하지 않는다.
const { functionDeclarations, handlers } = require('./_tools');

const MODEL = 'gemini-3.5-flash-lite';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_ROUNDS = 6;

const SYSTEM =
  '너는 제주 여행 추천 도우미다. 사용자의 말에 맞게 get_weather 와 find_spots 도구를 직접 골라 호출한다. ' +
  '지역이 없으면 여러 지역의 날씨를 확인해 비교하고, 비나 강풍이면 실내, 맑으면 야외를 우선한다. ' +
  '장소는 반드시 find_spots 결과에 있는 것만 추천하고(목록 밖 장소는 없다), 날씨 근거를 한두 문장으로 설명한다. 한국어로 짧게 답한다.';

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 로 요청하세요.' });

  const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: '메시지를 입력하세요.' });

  const contents = [{ role: 'user', parts: [{ text: message }] }];
  const steps = [];  // 화면에 보여줄 도구 호출 기록
  let spots = [];    // 지도에 찍을 장소 (마지막 find_spots 결과)

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const r = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          tools: [{ functionDeclarations }],
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = r.status === 429 ? '요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.'
                  : (data.error && data.error.message) || `Gemini 오류 (${r.status})`;
        return res.status(r.status).json({ error: msg });
      }

      const content = data.candidates && data.candidates[0] && data.candidates[0].content;
      if (!content) return res.status(502).json({ error: 'Gemini 가 답을 만들지 못했습니다.' });
      contents.push(content);

      const calls = (content.parts || []).filter((p) => p.functionCall);
      if (calls.length === 0) {
        const reply = (content.parts || []).map((p) => p.text || '').join('').trim();
        return res.status(200).json({ reply, steps, spots });
      }

      const responses = [];
      for (const { functionCall } of calls) {
        const fn = handlers[functionCall.name];
        const args = functionCall.args || {};
        const out = fn ? await fn(args) : { error: `알 수 없는 도구: ${functionCall.name}` };
        if (functionCall.name === 'find_spots' && out.spots) spots = out.spots;
        steps.push(`${functionCall.name}(${JSON.stringify(args)})`);
        responses.push({ functionResponse: { name: functionCall.name, response: out } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    return res.status(200).json({ reply: '답을 만들지 못했습니다. 다시 시도해 주세요.', steps, spots });
  } catch (e) {
    return res.status(502).json({ error: 'Gemini 서버에 연결하지 못했습니다.' });
  }
};
