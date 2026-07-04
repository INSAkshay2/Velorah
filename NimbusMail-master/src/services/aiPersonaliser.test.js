import { jest } from "@jest/globals";

process.env.AI_PERSONALISATION_ENABLED = "true";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

// ── ioredis mock ──
class MockRedis {
  constructor() {
    this.data = new Map();
  }
  on() { return this; }
  async get(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }
  async set(key, value, ...args) {
    this.data.set(key, value);
    return "OK";
  }
  async del(key) {
    this.data.delete(key);
    return 1;
  }
  async quit() {
    this.data.clear();
    return "OK";
  }
}

jest.unstable_mockModule("ioredis", () => ({ default: MockRedis }));

// ── Helpers ──
function mockFetchResponse(data, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
  });
}

const originalFetch = globalThis.fetch;
const aiPersonaliser = await import("./aiPersonaliser.js");

// ── Tests ──

describe("aiPersonaliser – personalise", () => {
  beforeAll(() => {
    globalThis.fetch = jest.fn();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await aiPersonaliser.closeAiPersonaliser();
  });

  const baseData = Object.freeze({
    recipientName: "Alice",
    recipientEmail: "alice@example.com",
    campaignTopic: "Summer Sale",
    baseSubject: "Check out our sale",
  });

  // ── Happy path ──

  test("returns subject from Anthropic API", async () => {
    globalThis.fetch.mockReturnValue(
      mockFetchResponse({
        content: [{ text: '{"subject":"Alice, 50% off!","reasoning":"Name match"}' }],
      }),
    );

    const subject = await aiPersonaliser.personalise({ ...baseData });
    expect(subject).toBe("Alice, 50% off!");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("returns cached subject on repeat call with same data", async () => {
    globalThis.fetch.mockReturnValue(
      mockFetchResponse({
        content: [{ text: '{"subject":"Welcome back!","reasoning":"test"}' }],
      }),
    );

    const first = await aiPersonaliser.personalise({ ...baseData });
    expect(first).toBe("Welcome back!");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Reset fetch — second call must NOT call the API
    globalThis.fetch.mockClear();

    const second = await aiPersonaliser.personalise({ ...baseData });
    expect(second).toBe("Welcome back!");
    expect(globalThis.fetch).toHaveBeenCalledTimes(0);
  });

  test("uses different cache keys for different recipients", async () => {
    globalThis.fetch.mockReturnValue(
      mockFetchResponse({
        content: [{ text: '{"subject":"Alice special","reasoning":"..."}' }],
      }),
    );
    const dataA = { ...baseData, recipientEmail: "alice@x.com" };
    const s1 = await aiPersonaliser.personalise(dataA);
    expect(s1).toBe("Alice special");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    globalThis.fetch.mockClear();

    globalThis.fetch.mockReturnValue(
      mockFetchResponse({
        content: [{ text: '{"subject":"Bob special","reasoning":"..."}' }],
      }),
    );
    const dataB = { ...baseData, recipientEmail: "bob@x.com" };
    const s2 = await aiPersonaliser.personalise(dataB);
    expect(s2).toBe("Bob special");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // ── Fallback paths ──

  test("falls back to baseSubject when fetch throws", async () => {
    globalThis.fetch.mockReturnValue(Promise.reject(new Error("Network error")));

    const subject = await aiPersonaliser.personalise({
      ...baseData,
      recipientEmail: "fallback1@x.com",
    });
    expect(subject).toBe(baseData.baseSubject);
  });

  test("falls back to baseSubject when API returns error status", async () => {
    globalThis.fetch.mockReturnValue(
      mockFetchResponse(null, false, 401),
    );

    const subject = await aiPersonaliser.personalise({
      ...baseData,
      recipientEmail: "fallback2@x.com",
    });
    expect(subject).toBe(baseData.baseSubject);
  });

  test("falls back to baseSubject when JSON is malformed", async () => {
    globalThis.fetch.mockReturnValue(
      mockFetchResponse({
        content: [{ text: "not valid json" }],
      }),
    );

    const subject = await aiPersonaliser.personalise({
      ...baseData,
      recipientEmail: "fallback3@x.com",
    });
    expect(subject).toBe(baseData.baseSubject);
  });

  test("falls back to baseSubject when response lacks subject field", async () => {
    globalThis.fetch.mockReturnValue(
      mockFetchResponse({
        content: [{ text: '{"reasoning":"missing subject field"}' }],
      }),
    );

    const subject = await aiPersonaliser.personalise({
      ...baseData,
      recipientEmail: "fallback4@x.com",
    });
    expect(subject).toBe(baseData.baseSubject);
  });

  test("falls back to baseSubject when content array is empty", async () => {
    globalThis.fetch.mockReturnValue(
      mockFetchResponse({ content: [] }),
    );

    const subject = await aiPersonaliser.personalise({
      ...baseData,
      recipientEmail: "fallback5@x.com",
    });
    expect(subject).toBe(baseData.baseSubject);
  });
});

describe("aiPersonaliser – exports", () => {
  test("exports personalise and closeAiPersonaliser", () => {
    expect(typeof aiPersonaliser.personalise).toBe("function");
    expect(typeof aiPersonaliser.closeAiPersonaliser).toBe("function");
  });

  test("closeAiPersonaliser resolves without error", async () => {
    await expect(aiPersonaliser.closeAiPersonaliser()).resolves.toBeUndefined();
  });
});
