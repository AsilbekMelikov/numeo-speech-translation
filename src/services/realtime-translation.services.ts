import WebSocket from "ws"
import { envData } from "../config/envData.js"
import type { RealtimeClientEvent } from "openai/resources/realtime/realtime.mjs"

export interface RealtimeSessionConfig {
    targetLanguage: string
    clientId: string
    onTextDelta: (text: string) => void
    onTextDone: (fullText: string) => void
    onError: (error: Error) => void
    onSessionReady: () => void
    onSessionClosed: () => void
}

export class RealtimeTranslationService {
    private ws: WebSocket | null = null
    private config: RealtimeSessionConfig
    private isConnected = false
    private intentionalClose = false
    private reconnectAttempts = 0
    private maxReconnectAttempts = 3
    private fullTextListenerCallback = (fullText: string) => {}

    constructor(config: RealtimeSessionConfig) {
        this.config = config
    }

    connect(): void {
        const url = `wss://api.openai.com/v1/realtime?model=${envData.OPENAI_REALTIME_MODEL}`

        this.ws = new WebSocket(url, {
            headers: {
                "Authorization": `Bearer ${envData.OPENAI_KEY}`,
            },
        })

        this.ws.on("open", () => {
            console.log(`client=${this.config.clientId} WebSocket OPEN`)
            this.isConnected = true
            this.reconnectAttempts = 0
            this.configureSession()
        })

        this.ws.on("message", (data) => {
            console.log("Openai, data is coming from", data)
            this.handleOpenAIMessage(data.toString())
        })

        this.ws.on("close", (code, reason) => {
            console.log(`openai realtime socket is being closed, Code is ${code}, Reason is ${reason}`)
            this.isConnected = false
            if (!this.intentionalClose) {
                this.attemptReconnect()
            } else {
                this.config.onSessionClosed()
            }
        })

        this.ws.on("error", (err) => {
            console.log(`Openai Realtime Socket error is happening, ${err.message}`)
            this.config.onError(err)
        })
    }

    fullTextListener (callback: (fullText: string) => void) {
        this.fullTextListenerCallback = callback
    }

    appendAudio(base64Audio: string): void {
        if (!this.isConnected || !this.ws) return
        console.log("base64 audio", base64Audio.slice(0, 20))
        this.ws.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64Audio,
        }))
    }

    disconnect(): void {
        this.intentionalClose = true
        if (this.ws) {
            this.ws.close()
            this.ws = null
            this.isConnected = false
        }
    }

    private buildInstructions() {
        return [
        `You are a real-time speech translator.`,
        `Your ONLY job is to translate the user's spoken words into ${this.config.targetLanguage}.`,
        `Rules:`,
        `- Output ONLY the translated text. No explanations, no commentary, no greetings.`,
        `- Preserve the original meaning, tone, and intent as closely as possible.`,
        `- If you cannot understand or translate a segment, output "[inaudible]".`,
        `- Do NOT respond conversationally. Do NOT add anything beyond the translation.`,
        `- Translate naturally and idiomatically, not word-for-word.`,
        `- If the speaker pauses mid-sentence, translate what you have so far.`,
        ].join("\n");
    }

    private configureSession(): void {
        const sessionUpdate: RealtimeClientEvent = {
            type: "session.update",
            session: {
                type: "realtime",
                output_modalities: ["text"],
                
                instructions: this.buildInstructions(),
                audio: {
                    input: {
                        noise_reduction: {
                            type: "near_field"
                        },
                        format: {
                            type: "audio/pcm",
                            rate: 24_000
                        },
                        transcription: {
                            model: "gpt-4o-transcribe"
                        },
                        turn_detection: {
                            type: "server_vad",
                            threshold: 0.3,
                            prefix_padding_ms: 500,
                            silence_duration_ms: 200,
                        },
                    }
                },
                
            },
        }

        this.ws?.send(JSON.stringify(sessionUpdate))
    }

    private handleOpenAIMessage(rawData: string): void {
        let event: any
        try {
            event = JSON.parse(rawData)
        } catch {
            console.error("[RealtimeTranslation] Failed to parse OpenAI message")
            return
        }
        console.log("event", JSON.stringify(event))


        switch (event.type) {
            case "session.created":
            case "session.updated":
                console.log(`Client=${this.config.clientId} session ready`)
                this.config.onSessionReady()
                break

            case "response.text.delta":
                console.log("text delta", event.delta)
                this.config.onTextDelta(event.delta)
                break

            case "response.output_text.delta":
                console.log("full text", event.delta)
                this.config.onTextDone(event.delta)
                this.fullTextListenerCallback(event.delta)
                break

            case "error":
                console.error(`[RealtimeTranslation] OpenAI error:`, event.error)
                this.config.onError(new Error(event.error?.message ?? "Unknown OpenAI Realtime error"))
                break
            case "conversation.item.input_audio_transcription.delta":
                console.log("converstaion item audio transcription delate")

            case "conversation.item.input_audio_transcription.completed":
                console.log("converstaion item audio transcription completed")

                break

            case "input_audio_buffer.speech_started":
                console.log(`Openai Realtime speech started`)
                break

            case "input_audio_buffer.speech_stopped":
                console.log(`Openai Realtime speech stopped`)
                break

            default:
                console.log(`Openai Realtime unhandled event: ${event.type}`)
                break
        }
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`Client=${this.config.clientId} max reconnect attempts reached`)
            this.config.onError(new Error("Max reconnection attempts reached"))
            this.config.onSessionClosed()
            return
        }

        this.reconnectAttempts++
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000)

        console.log(`Client=${this.config.clientId} reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

        setTimeout(() => {
            this.connect()
        }, delay)
    }
}
