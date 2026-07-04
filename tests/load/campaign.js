import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

const campaignDuration = new Trend('campaign_duration');
const sendDuration = new Trend('send_duration');
const failureRate = new Rate('failure_rate');

export const options = {
  stages: [
    { duration: '60s', target: 10 },
    { duration: '120s', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    failure_rate: ['rate<0.01'],
  },
};

function randomEmail() {
  return `user${Math.random().toString(36).slice(2, 10)}@test.com`;
}

function createRecipients(count) {
  const recipients = [];
  for (let i = 0; i < count; i++) {
    recipients.push({ email: randomEmail(), name: 'Test User' });
  }
  return recipients;
}

export default function () {
  const campaignPayload = JSON.stringify({
    name: `Load Test ${Date.now()}_${__VU}_${__ITER}`,
    subject: 'Test Subject',
    body: '<p>Test body</p>',
    recipients: createRecipients(20),
  });

  const createRes = http.post(`${baseUrl}/campaigns`, campaignPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(createRes, { 'campaign created': (r) => r.status === 201 });
  campaignDuration.add(createRes.timings.duration);

  if (createRes.status !== 201) {
    failureRate.add(1);
    return;
  }

  const campaignId = JSON.parse(createRes.body).id;

  const sendRes = http.post(`${baseUrl}/campaigns/${campaignId}/send`);

  check(sendRes, { 'send queued': (r) => r.status === 200 });
  sendDuration.add(sendRes.timings.duration);

  if (sendRes.status !== 200) {
    failureRate.add(1);
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    'tests/load/results.json': JSON.stringify(data, null, 2),
  };
}
