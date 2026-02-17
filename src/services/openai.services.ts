import OpenAI, { toFile } from "openai"
import { envData } from "../config/envData.js"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export class OpenaiService {
    private client: OpenAI

    constructor() {
        this.client = new OpenAI({
            apiKey: envData.OPENAI_KEY
        })
    }

    async translateAudio(audioBase64: string) {
        // base64 comes, data:image/png;base64,.....
        const splittedData = audioBase64.split(';base64,')

        const audio = splittedData[0]?.slice(5) // not getting 'data:'
        const pureBase64 = splittedData[1] ?? ''

        const buffer = Buffer.from(pureBase64, "base64")
        
        const translationData = await this.client.audio.translations.create({
            file: await toFile(buffer, 'audio.webm'),
            model: "whisper-1",
            prompt: "You are a live translator. Whatever audio you hear, immediately output the translated text in English only. Do not add commentary.",
            response_format: "json"
        })

        return translationData.text
    }
}