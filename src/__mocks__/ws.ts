import { WebSocket } from 'mock-socket';

WebSocket.prototype.on = function (event: string, handler: Function) {
    const t: any = this;

    t[`on${event}`] = (arg: any) => {
        if (event === 'message') {
            handler(arg.data);
        } else if (event === 'close') {
            handler(arg.code, arg.reason);
        } else {
            handler(arg);
        }
    };
};

export default WebSocket;
