import WebSocket, { WebSocketServer } from "ws";
import {Server} from "http"
import { RealtimeTranslationService } from "./realtime-translation.services.js";
import { extractBase64 } from "../config/common.js";


interface WebsocketServerOptions {
    server: Server
    path: string
}

interface IClientData {
    id: string
    socket: WebSocket
    openAiSession: RealtimeTranslationService
    deviceInfo: {
        userAgent: string
    }
}

enum MessageType {
    SPEECH_TRANSLATION,
    PONG
}

type IMessageData =
    | {
        type: MessageType.SPEECH_TRANSLATION
        data: {
            metadata: {
                startTime: number
                endTime: number
            }
            audioBase64: string
        }
    }

const createClientTemplate = (data: Omit<IClientData, 'id'>) => {
    const id = `client_${Date.now().toString(36)}`

    return {
        id, 
        ...data
    }
}

const deserializeMessageData = (data: string) => {
    try {
        const response = JSON.parse(data)
        return response
    } catch (error) {
        console.log("deserializing json error")
        return undefined
    }
} 

export class WsServer {
    ws: WebSocketServer

    private clients: Map<string, IClientData>
    private heartBeatInterval?: ReturnType<typeof setInterval>

    constructor(options: WebsocketServerOptions) {
        this.ws = new WebSocketServer({
            server: options.server,
            path: options.path,
        })

        this.clients = new Map()

        this.setupSocket()
        this.startHeartBeat()
    }

    private removeClient(clientId: string) {
        const client = this.getClient(clientId)
        if (client) {
            client.openAiSession.disconnect()
            this.clients.delete(clientId)
        }
    }

    private addClient(client: IClientData) {
        const existingClient = this.getClient(client.id)
        if (existingClient && existingClient.id) return
        this.clients.set(client.id, client)
    }

    private getClient(clientId: string) {
        return this.clients.get(clientId)
    }

    private handleMessageData(clientData: IClientData, data: IMessageData) {
        switch(data.type) {
            case MessageType.SPEECH_TRANSLATION: {
                if (clientData.socket.readyState !== WebSocket.OPEN || !data) return

                const rawBase64 = extractBase64(data.data.audioBase64)
                clientData.openAiSession.appendAudio(rawBase64)
                break
            }
        }
    }

    private setupSocket() {
        this.ws.on('close', () => {
            console.log("we are closing the websocket for now....")
            clearInterval(this.heartBeatInterval)
            this.clients.forEach((client) => {
                client.openAiSession.disconnect()
            })
            this.clients.clear()
        })

        this.ws.on('connection', (socket, request) => {
            const openAiSession = new RealtimeTranslationService({
                targetLanguage: "English",
                clientId: `client_${Date.now().toString(36)}`,
                onError: (error) => {
                    console.error(`OpenAI session error: ${error.message}`)
                },
                onSessionClosed: () => {},
                onSessionReady: () => {},
                onTextDelta: (text) => {},
                onTextDone: (fullText) => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: MessageType.SPEECH_TRANSLATION,
                            data: { text: fullText }
                        }))
                    }
                }
            })

            const clientData = createClientTemplate({
                socket,
                openAiSession,
                deviceInfo: {
                    userAgent: request.headers['user-agent'] ?? ''
                }
            })

            this.addClient(clientData)
            openAiSession.connect()

            socket.on('error', (error) => {
                console.log(`Id: ${clientData.id} having an error, error: ${error.message}`)
            })

            socket.on('close', (code, reason) => {
                console.log(`ID: ${clientData.id}, closing socket, code: ${code}, reason: ${reason}`)
                this.removeClient(clientData.id)
            })

            socket.on('message', (data, isBinary) => {
                console.log("message is coming or not ", data, isBinary)
                if (!isBinary) {
                    const deserializedData = deserializeMessageData(data.toString())
                    if (deserializedData) {
                        this.handleMessageData(clientData, deserializedData)
                    }
                }
            })
            
            socket.on("pong", () => {
                console.log("connection is aliw, poing is received here")
                clientData.socket.send(JSON.stringify({
                    type: MessageType.PONG,
                    data: {
                        text: `PONG`
                    }
                }))
            })
        })
    }

    private startHeartBeat() {
        this.heartBeatInterval = setInterval(() => {
            this.clients.forEach((client) => {
                if (client.socket.readyState === WebSocket.OPEN) {
                    client.socket.ping()
                }
            })
        }, 10_000)

    }


}