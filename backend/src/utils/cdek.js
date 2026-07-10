// ─── CDEK API v2 client ──────────────────────────────────────────────────────
// Docs: https://apidoc.cdek.ru/  |  База: https://api.cdek.ru (prod), https://api.edu.cdek.ru (test)
// Авторизация — OAuth2 client_credentials. Токен живёт 1 час, кэшируем в памяти.
// Креды в .env: CDEK_CLIENT_ID (Account), CDEK_CLIENT_SECRET (Secure password), CDEK_API_BASE.

const https = require('https');
const { URL } = require('url');

const API_BASE = process.env.CDEK_API_BASE || 'https://api.cdek.ru';
const CLIENT_ID = process.env.CDEK_CLIENT_ID || '';
const CLIENT_SECRET = process.env.CDEK_CLIENT_SECRET || '';

let tokenCache = { access_token: null, expires_at: 0 };

function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

// Низкоуровневый запрос. body: string | object | null. Возвращает {status, json|text}.
function request(method, path, { body = null, token = null, form = false } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : API_BASE + path);
    const headers = { Accept: 'application/json' };
    let payload = null;

    if (body != null) {
      if (form) {
        payload = typeof body === 'string' ? body : new URLSearchParams(body).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        payload = typeof body === 'string' ? body : JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch { /* not json */ }
          resolve({ status: res.statusCode, json, text: data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Получить (или переиспользовать из кэша) access_token.
async function getToken() {
  if (!isConfigured()) throw new Error('CDEK API не настроен (нет CDEK_CLIENT_ID / CDEK_CLIENT_SECRET)');
  const now = Date.now();
  if (tokenCache.access_token && tokenCache.expires_at > now + 60_000) {
    return tokenCache.access_token;
  }
  const res = await request('POST', '/v2/oauth/token', {
    form: true,
    body: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
  });
  if (res.status !== 200 || !res.json?.access_token) {
    throw new Error(`CDEK OAuth failed (${res.status}): ${res.text?.slice(0, 200)}`);
  }
  const ttl = (res.json.expires_in || 3600) * 1000;
  tokenCache = { access_token: res.json.access_token, expires_at: now + ttl };
  return tokenCache.access_token;
}

// Бинарный GET (для PDF этикеток/квитанций) с Bearer-токеном.
function requestBinary(fullUrl, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(fullUrl.startsWith('http') ? fullUrl : API_BASE + fullUrl);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Скачать PDF по ссылке СДЭК с авторизацией (автоповтор при 401).
async function getPdf(fullUrl) {
  let token = await getToken();
  let r = await requestBinary(fullUrl, token);
  if (r.status === 401) {
    tokenCache = { access_token: null, expires_at: 0 };
    token = await getToken();
    r = await requestBinary(fullUrl, token);
  }
  return r;
}

// Авторизованный вызов API с автоповтором при 401 (протух токен).
async function call(method, path, body = null) {
  let token = await getToken();
  let res = await request(method, path, { body, token });
  if (res.status === 401) {
    tokenCache = { access_token: null, expires_at: 0 };
    token = await getToken();
    res = await request(method, path, { body, token });
  }
  return res;
}

// ─── Высокоуровневые методы ──────────────────────────────────────────────────

// Расчёт доступных тарифов/стоимости. POST /v2/calculator/tarifflist
const calcTariffList = (payload) => call('POST', '/v2/calculator/tarifflist', payload);

// Список ПВЗ/постаматов. GET /v2/deliverypoints?city_code=...&type=PVZ
const deliveryPoints = (query = {}) =>
  call('GET', '/v2/deliverypoints?' + new URLSearchParams(query).toString());

// Поиск кода населённого пункта. GET /v2/location/cities?city=Москва
const cities = (query = {}) =>
  call('GET', '/v2/location/cities?' + new URLSearchParams(query).toString());

// Создание заказа. POST /v2/orders → HTTP 202 + { entity: { uuid } } (асинхронно).
const createOrder = (payload) => call('POST', '/v2/orders', payload);

// Отмена заказа. DELETE /v2/orders/{uuid}
const deleteOrder = (uuid) => call('DELETE', `/v2/orders/${uuid}`);

// Инфо о заказе (статусы, номер СДЭК). GET /v2/orders/{uuid} или ?cdek_number= / ?im_number=
const getOrder = (uuid) => call('GET', `/v2/orders/${uuid}`);
const getOrderByCdekNumber = (n) => call('GET', `/v2/orders?cdek_number=${encodeURIComponent(n)}`);
const getOrderByImNumber = (n) => call('GET', `/v2/orders?im_number=${encodeURIComponent(n)}`);

// Печать: запросить формирование квитанции / ШК, затем скачать PDF по ссылке из ответа.
// POST /v2/print/orders { orders:[{order_uuid}], copy_count, type }  → { entity:{ uuid, url } }
const printReceipt = (payload) => call('POST', '/v2/print/orders', payload);
// POST /v2/print/barcodes { orders:[{order_uuid}], format:'A6'|'A5'... } → { entity:{ uuid, url } }
const printBarcode = (payload) => call('POST', '/v2/print/barcodes', payload);
const getPrintReceipt = (uuid) => call('GET', `/v2/print/orders/${uuid}`);
const getPrintBarcode = (uuid) => call('GET', `/v2/print/barcodes/${uuid}`);

module.exports = {
  isConfigured,
  getToken,
  call,
  getPdf,
  calcTariffList,
  deliveryPoints,
  cities,
  createOrder,
  deleteOrder,
  getOrder,
  getOrderByCdekNumber,
  getOrderByImNumber,
  printReceipt,
  printBarcode,
  getPrintReceipt,
  getPrintBarcode,
};
