
import dotenv from "dotenv"

dotenv.config()

export const envData = {
    OPENAI_KEY: process.env.OPENAI_KEY ?? '',
    OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
} as const

