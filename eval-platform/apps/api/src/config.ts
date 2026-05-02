import "dotenv/config";

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3001),
  dataDir: env.DATA_DIR ?? "./data",
  nodeEnv: env.NODE_ENV ?? "development",
  openai: {
    apiKey: (env.OPENAI_API_KEY ?? "").trim(),
    baseUrl: (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim(),
    model: (env.OPENAI_MODEL ?? "gpt-4o-mini").trim(),
  },
  ragasPython: env.RAGAS_PYTHON ?? "python",
} as const;

export const useMockJudge = !config.openai.apiKey;
