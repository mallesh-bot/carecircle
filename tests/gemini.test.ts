import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { explainMedicine, extractPrescription, GeminiError, geminiEnabled } = await import("@/lib/gemini");

function mockGemini(payload: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Gemini client", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is disabled without an API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(geminiEnabled()).toBe(false);
    await expect(explainMedicine({ name: "X", dosage: "", instructions: "" }, "en")).rejects.toBeInstanceOf(GeminiError);
  });

  it("sends the image with structured-output config and the key in a header", async () => {
    const fetchMock = mockGemini({
      medications: [{ name: "Metformin 500mg", dosage: "1 tab", instructions: "after food", times: ["08:00", "21:00"], durationDays: 30 }],
      notes: "",
    });
    const result = await extractPrescription("aGVsbG8=", "image/jpeg");
    expect(result.medications[0]).toMatchObject({ name: "Metformin 500mg", times: ["08:00", "21:00"], durationDays: 30 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(":generateContent");
    expect(String(url)).not.toContain("test-key");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0].parts[1].inline_data).toEqual({ mime_type: "image/jpeg", data: "aGVsbG8=" });
  });

  it("rejects malformed AI output instead of trusting it", async () => {
    mockGemini({ medications: [{ name: "Bad", times: ["8 o'clock"] }] });
    await expect(extractPrescription("x", "image/png")).rejects.toBeInstanceOf(GeminiError);
  });

  it("explains a medicine in the requested language", async () => {
    const fetchMock = mockGemini({ whatItIsFor: "Sugar control", howToTake: "After food", commonSideEffects: [], callDoctorIf: [] });
    const res = await explainMedicine({ name: "Metformin", dosage: "500mg", instructions: "" }, "te");
    expect(res.whatItIsFor).toBe("Sugar control");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text).toContain("Telugu");
  });

  it("maps rate limiting to a friendly message", async () => {
    mockGemini({}, 429);
    await expect(explainMedicine({ name: "X", dosage: "", instructions: "" }, "en")).rejects.toThrow(/busy/);
  });
});
