

import express from "express"
import http from "http"
import { WsServer } from "./services/websocket.services.js"


const startServer = () => {

    const app = express()

    const server = http.createServer(app)

    new WsServer({server, path: "/ws"})

    server.listen(8080, () => {
        console.log("server is working ")
        console.log("websocket is working")
    })
    
}

startServer()