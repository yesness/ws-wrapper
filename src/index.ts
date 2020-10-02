import WebSocket from 'ws';

export type SocketOptions<TMessage> = {
    errorOnClose?: boolean;
    messageHandler?: MessageHandler<TMessage>;
    closeHandler?: CloseHandler;
    errorHandler?: ErrorHandler;
    logger?: LoggerConfig;
    connectTimeout?: number;
};
export type MessageHandler<T> = (message: T) => void | Promise<void>;
export type CloseHandler = (code?: number, reason?: string) => void;
export type ErrorHandler = (error: Error) => void;
export type LoggerConfig = {
    debug?: (message: string) => void;
    wrap?: (error: Error, message: string) => Error;
};

let globalLoggerConfig: LoggerConfig | null = null;

class Socket<TPacket, TMessage> {
    private url: string | null;
    private ws: WebSocket | null;
    private errorOnClose: boolean;
    private messageHandler?: MessageHandler<TMessage>;
    private closeHandler?: CloseHandler;
    private errorHandler?: ErrorHandler;
    private loggerConfig?: LoggerConfig;
    private connectTimeout: number;
    closed: boolean;

    static setGlobalLogger(logger: LoggerConfig) {
        globalLoggerConfig = logger;
    }

    constructor(
        urlOrSocket: string | WebSocket,
        options?: SocketOptions<TMessage>
    ) {
        if (typeof urlOrSocket === 'string') {
            this.url = urlOrSocket;
            this.ws = null;
        } else {
            this.ws = urlOrSocket;
            this.url = null;
            this._setListeners(this.ws);
        }
        this.errorOnClose = options?.errorOnClose || false;
        this.messageHandler = options?.messageHandler;
        this.closeHandler = options?.closeHandler;
        this.errorHandler = options?.errorHandler;
        this.loggerConfig = options?.logger;
        this.connectTimeout = options?.connectTimeout || 10000;
        this.closed = false;
    }

    onMessage(handler: MessageHandler<TMessage>) {
        this.messageHandler = handler;
    }

    onClose(handler: CloseHandler) {
        this.closeHandler = handler;
    }

    onError(handler: ErrorHandler) {
        this.errorHandler = handler;
    }

    setLogger(logger: LoggerConfig) {
        this.loggerConfig = logger;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws !== null || this.url === null) {
                reject(
                    new Error(
                        'Only call connect() when calling constructor with URL'
                    )
                );
                return;
            }
            const ws = new WebSocket(this.url);

            let timedOut = false;
            const timeout = setTimeout(() => {
                timedOut = true;
                reject(
                    new Error(
                        `connect() timed out after ${this.connectTimeout}ms`
                    )
                );
            }, this.connectTimeout);

            ws.on('open', () => {
                if (timedOut) return;
                clearTimeout(timeout);
                this.ws = ws;
                resolve();
            });

            this._setListeners(ws);
        });
    }

    send(json: TPacket) {
        this._debugLog(`Sending to ${this.ws?.url}`, json);
        if (this.ws) {
            try {
                this.ws.send(JSON.stringify(json));
            } catch (e) {
                this._error(`Failed to send message`, e, { message: json });
            }
        } else {
            this._error('Send called but ws is null');
        }
    }

    close(code?: number, reason?: string) {
        if (this.closed) {
            return;
        }
        this.closed = true;

        if (this.closeHandler) {
            this.closeHandler(code, reason);
        }

        this.messageHandler = undefined;
        this.closeHandler = undefined;
        this.errorHandler = undefined;

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private _setListeners(ws: WebSocket) {
        ws.on('close', (code: number, reason: string) => {
            if (this.errorOnClose) {
                this._error(
                    `Connection closed with code ${code}; Reason: ${reason}`,
                    undefined,
                    undefined,
                    false
                );
            }
            this.close(code, reason);
        });

        ws.on('error', (err: Error) => {
            this._error(`Connection error`, err);
        });

        ws.on('message', (data: string) => this._onMessage(data));

        ws.on('unexpected-response', () => {
            this._error('Connnection received unexpected response');
        });
    }

    private _onMessage(data: string) {
        if (this.closed) {
            return;
        }

        let json: any = null;
        try {
            json = JSON.parse(data);
            this._debugLog(`Message from ${this.ws?.url}`, json);
        } catch (e) {
            this._debugLog(`Raw message from ${this.ws?.url}: "${data}"`);
            this._error(`Failed to parse message JSON`, e);
            return;
        }

        if (this.messageHandler) {
            const handlerError = (e: Error) =>
                this._error(`onMessageHandler failed`, e, {
                    message: json,
                });

            try {
                const handlerResult = this.messageHandler(json);
                Promise.resolve(handlerResult).catch(handlerError);
            } catch (e) {
                handlerError(e);
            }
        }
    }

    private _error(
        message: string,
        error?: Error,
        meta?: any,
        close: boolean = true
    ) {
        if (this.errorHandler) {
            if (meta) {
                message += ` | ${JSON.stringify(meta)}`;
            }
            if (error) {
                const logger = this.loggerConfig || globalLoggerConfig;
                if (logger && logger.wrap) {
                    error = logger.wrap(error, message);
                } else {
                    if (error.message) {
                        message += ` | ${error.message}`;
                    }
                    error = new Error(message);
                }
            } else {
                error = new Error(message);
            }
            this.errorHandler(error);
        }

        if (close) {
            this.close(undefined, `Error: ${error?.message}`);
        }
    }

    private _debugLog(message: string, meta?: any) {
        const logger = this.loggerConfig || globalLoggerConfig;
        if (!logger) return;
        if (meta) {
            message += ` | ${JSON.stringify(meta)}`;
        }
        logger.debug?.(message);
    }
}

export default Socket;
