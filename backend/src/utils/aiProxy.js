// ─── AI proxy (OpenAI-совместимый) для распознавания заказов по фото ─────────
// Прокси: api.proxyapi.ru/openai/v1 (или любой OpenAI-совместимый). Vision-модель gpt-4o.
// Ключи в .env: AI_PROXY_BASE, AI_PROXY_KEY, AI_VISION_MODEL.

const https = require('https');
const { URL } = require('url');
const config = require('../config');

function isConfigured() {
  return Boolean(config.aiProxy.key);
}

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.aiProxy.base.replace(/\/+$/, '') + path);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.aiProxy.key}`,
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 90_000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch { /* keep text */ }
          resolve({ status: res.statusCode, json, text: data });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('AI proxy timeout')));
    req.write(payload);
    req.end();
  });
}

const SYSTEM_PROMPT =
  'Ты — парсер заказов интернет-магазина БАДов. На вход даётся скриншот карточки заказа. ' +
  'Извлеки строго состав заказа и данные получателя. Верни ТОЛЬКО JSON без markdown. ' +
  'Формат: {"items":[{"name":string,"quantity":number,"price":number|null}],' +
  '"recipient":string|null,"phone":string|null,"city":string|null,"pvz_address":string|null,' +
  '"address":string|null,"delivery":string|null,"total":number|null,"order_number":string|null,"track":string|null}. ' +
  'name — точное наименование позиции как на скрине (включая "60 капсул", "набор 120 капсул"). ' +
  'quantity — число из "× N" (если не указано — 1). ' +
  'recipient — ФИО получателя. Ищи строку «Получатель: …» (обычно внизу карточки); ' +
  'верни только само ФИО, без пометок вроде "(ФИО)". Если строки нет — возьми имя из шапки заказа. ' +
  'phone — телефон получателя: строка «Контакты: …» или телефон в шапке заказа (например "+7 (960) 005-41-63"). ' +
  'Верни его как на скрине. recipient и phone почти всегда есть на скрине — ищи внимательно, null только если их реально нет. ' +
  'city — ТОЛЬКО название населённого пункта получателя (например "Москва"), без слов "СДЭК", "пункт выдачи", улиц. ' +
  'pvz_address — улица и дом пункта выдачи (например "ул. Цимлянская, 20"). ' +
  'address — полный адрес доставки как на скрине. Не придумывай позиции, которых нет.';

// Распознать заказ по изображению. imageDataUrl — "data:image/...;base64,....".
async function parseOrderScreenshot(imageDataUrl) {
  if (!isConfigured()) throw new Error('AI-прокси не настроен (нет AI_PROXY_KEY)');
  const res = await postJson('/chat/completions', {
    model: config.aiProxy.visionModel,
    temperature: 0,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Распознай состав этого заказа и данные получателя. Верни JSON.' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });

  if (res.status !== 200) {
    const msg = res.json?.error?.message || res.text?.slice(0, 300) || `HTTP ${res.status}`;
    throw new Error(`AI proxy error (${res.status}): ${msg}`);
  }
  const content = res.json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI вернул пустой ответ');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // На случай, если модель обернула в ```json
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI вернул не-JSON: ' + content.slice(0, 200));
    parsed = JSON.parse(m[0]);
  }
  if (!Array.isArray(parsed.items)) parsed.items = [];
  return parsed;
}

module.exports = { isConfigured, parseOrderScreenshot };
