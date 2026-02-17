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
    private openAiService: RealtimeTranslationService

    constructor(options: WebsocketServerOptions) {
        this.ws = new WebSocketServer({
            server: options.server,
            path: options.path,
        })

        this.clients = new Map()

        this.openAiService = new RealtimeTranslationService({
            targetLanguage: "English",
            clientId: "1",
            onError: (error) => {},
            onSessionClosed: () => {},
            onSessionReady: () => {},
            onTextDelta: (text) => {},
            onTextDone: (fullText) => {}
        })

        this.openAiService.connect()

        this.setupSocket()
        this.startHeartBeat()
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
                this.openAiService.appendAudio(rawBase64)
                break
            }
        }
    }

    private setupSocket() {
        this.ws
        this.ws.on('close', () => {
            console.log("we are closing the websocket for now....")
            clearTimeout(this.heartBeatInterval)
        })

        this.ws.on('connection', (socket, request) => {
            const clientData = createClientTemplate({
                socket,
                deviceInfo: {
                    userAgent: request.headers['user-agent'] ?? ''
                } 
            })
            this.addClient(clientData)

            this.openAiService.fullTextListener((fullText) => {
                clientData.socket.send(JSON.stringify({
                    type: MessageType.SPEECH_TRANSLATION,
                    data: {
                        text: fullText
                    }
                }))
            })
            
            socket.on('error', (error) => {
                console.log(`Id: ${clientData.id} having an error, error: ${error.message}`)
            })

            socket.on('close', (code, reason) => {
                console.log(`ID: ${clientData.id}, closing socket, code: ${code}, reason: ${reason}`)
                this.openAiService.disconnect()
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
                client.socket.ping()
            })
        }, 10_000)
        
    }


}