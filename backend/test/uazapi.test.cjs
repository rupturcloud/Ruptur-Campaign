const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { UazapiClient, normalizeUazapiHost, normalizeUazapiStatus, encryptUazapiToken, decryptUazapiToken, extractUazapiMessage } = require('../dist/services/uazapiClient');
async function fixture(t, handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const record = { url: req.url, method: req.method, token: req.headers.token, body: body ? JSON.parse(body) : undefined };
    requests.push(record); res.setHeader('Content-Type', 'application/json'); handler(record, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { client: new UazapiClient(`http://127.0.0.1:${server.address().port}`, 'fixture-instance-token', 100), requests };
}
test('instance token header and GET status; QR/state normalization', async t => {
  const { client, requests } = await fixture(t, (_, res) => res.end(JSON.stringify({ instance: { status: 'connecting', qrcode: 'YWJj' } })));
  const status = normalizeUazapiStatus(await client.request('/instance/status'));
  assert.equal(requests[0].token, 'fixture-instance-token'); assert.equal(requests[0].method, 'GET');
  assert.equal(status.status, 'SCAN_QR_CODE'); assert.equal(status.qr, 'data:image/png;base64,YWJj');
  const connected = normalizeUazapiStatus({ instance: { status: 'connected', qrcode: 'stale', profileName: 'Diego' }, status: { connected: true, jid: { user: '5511999999999', server: 's.whatsapp.net' } } });
  assert.equal(connected.status, 'WORKING'); assert.equal(connected.qr, null); assert.equal(connected.meId, '5511999999999@s.whatsapp.net');
  assert.equal(normalizeUazapiStatus({ instance: { status: 'hibernated' } }).status, 'STOPPED');
});
test('text and all media produce documented Uazapi payloads and provider IDs', async t => {
  process.env.APP_URL = 'https://campaign.example';
  const { client, requests } = await fixture(t, (_, res) => res.end('{"messageid":"provider-message-1"}'));
  assert.deepEqual(await client.send('+55 (11) 99999-9999', { text: 'Olá' }), { id: 'provider-message-1' });
  assert.equal(requests[0].url, '/send/text'); assert.equal(requests[0].body.number, '5511999999999'); assert.equal(requests[0].body.async, false);
  for (const type of ['image', 'video', 'audio', 'document']) await client.send('5511999999999@s.whatsapp.net', { [type]: { url: '/api/uploads/file' }, caption: 'Legenda', fileName: 'arquivo.pdf' });
  for (const req of requests.slice(1)) { assert.equal(req.url, '/send/media'); assert.equal(req.body.file, 'https://campaign.example/api/uploads/file'); assert.equal(req.body.text, 'Legenda'); }
  assert.equal(requests[4].body.docName, 'arquivo.pdf');
});
test('number check distinguishes existing and missing WhatsApp accounts', async t => {
  let exists = true;
  const { client, requests } = await fixture(t, (_, res) => res.end(JSON.stringify([{ isInWhatsapp: exists, jid: '5511999999999@s.whatsapp.net' }])));
  assert.equal((await client.checkContact('5511999999999')).exists, true); exists = false;
  assert.equal((await client.checkContact('5511999999999')).exists, false);
  assert.deepEqual(requests[0].body, { numbers: ['5511999999999'] });
});
test('failures never become successful sends and never echo credentials', async t => {
  for (const response of [{ status: 401, body: '{"error":"fixture-instance-token"}' }, { status: 200, body: '{}' }, { status: 200, body: '{"success":false,"id":"no"}' }, { status: 500, body: 'bad' }]) {
    const { client, requests } = await fixture(t, (_, res) => { res.statusCode = response.status; res.end(response.body); });
    await assert.rejects(client.send('5511999999999', { text: 'test' }), e => !e.message.includes('fixture-instance-token'));
    assert.equal(requests.length, 1);
  }
});
test('timeout does not retry an ambiguous send', async t => {
  const { client, requests } = await fixture(t, () => {});
  await assert.rejects(client.send('5511999999999', { text: 'test' }), /antes de reenviar/); assert.equal(requests.length, 1);
});
test('redirects do not forward the instance credential', async t => {
  let forwarded = 0;
  const target = await fixture(t, (_, res) => { forwarded++; res.end('{}'); });
  const { client } = await fixture(t, (_, res) => { res.statusCode = 302; res.setHeader('Location', target.client.host); res.end('{}'); });
  await assert.rejects(client.request('/instance/status')); assert.equal(forwarded, 0);
});
test('encrypted token is authenticated, nondeterministic and not recoverable with another key', () => {
  process.env.JWT_SECRET = 'isolated-test-key';
  const encrypted = encryptUazapiToken('instance-secret'); assert.ok(!encrypted.includes('instance-secret'));
  assert.notEqual(encrypted, encryptUazapiToken('instance-secret')); assert.equal(decryptUazapiToken(encrypted), 'instance-secret');
  process.env.JWT_SECRET = 'wrong-key'; assert.throws(() => decryptUazapiToken(encrypted));
});
test('invalid URLs and operations are rejected before HTTP', async () => {
  for (const host of ['file:///tmp/key', 'https://token@example.com', 'https://example.com?token=x', 'invalid']) assert.throws(() => normalizeUazapiHost(host));
  const client = new UazapiClient('https://example.com', 'token'); await assert.rejects(client.request('/instance/all'));
});
test('webhook parser handles documented shapes and rejects outbound, group, LID and update events', () => {
  const message = { messageid: 'm1', sender: '5511999999999@s.whatsapp.net', text: 'Olá', fromMe: false };
  assert.equal(extractUazapiMessage({ EventType: 'messages', message }).fromNumber, '5511999999999');
  assert.equal(extractUazapiMessage({ event: 'message', data: message }).content, 'Olá');
  for (const change of [{ fromMe: true }, { wasSentByApi: true }, { isGroup: true }, { sender: '1234@lid' }]) assert.equal(extractUazapiMessage({ EventType: 'messages', message: { ...message, ...change } }), null);
  assert.equal(extractUazapiMessage({ EventType: 'messages_update', message }), null);
});
