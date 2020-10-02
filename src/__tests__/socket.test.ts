import WS from 'jest-websocket-mock';
import WebSocket from 'ws';
import Socket from '../';

const TEST_URL = 'ws://localhost:1234';

function tests(useUrl: boolean) {
    let server: WS;
    let client: Socket<any, any>;
    let messages: any[] = [];
    let errors: string[] = [];
    let closes: Array<{ code?: number; reason?: string }> = [];
    beforeEach(async () => {
        messages = [];
        errors = [];
        closes = [];
        server = new WS(TEST_URL, { jsonProtocol: true });

        if (useUrl) {
            client = new Socket(TEST_URL);
        } else {
            client = new Socket(new WebSocket(TEST_URL));
        }

        client.onMessage(async (msg) => {
            messages.push(msg);
        });
        client.onClose((code, reason) => closes.push({ code, reason }));
        client.onError((e) => errors.push(e.message));
        if (useUrl) {
            await client.connect();
        }
        await server.connected;
    });

    afterEach(() => {
        WS.clean();
    });

    const suffix = useUrl ? ' URL' : ' WS';

    test('connect error', async () => {
        if (!useUrl) {
            expect(client.connect()).rejects.toThrow('connect()');
        }
    });

    test('sendAndReceive' + suffix, async () => {
        let payload: any = {
            hello: 'there',
        };

        client.send(payload);
        await expect(server).toReceiveMessage(payload);

        payload = {
            goodbye: 'where',
        };
        server.send(payload);
        expect(messages).toEqual([payload]);
        expect(errors).toEqual([]);
    });

    test('server close' + suffix, () => {
        server.close({
            code: 31415,
            reason: 'super reason',
            wasClean: true,
        });

        expect(closes).toEqual([{ code: 31415, reason: 'super reason' }]);
        client.close(1, 'a');
        expect(closes).toEqual([{ code: 31415, reason: 'super reason' }]);
    });

    test('error' + suffix, () => {
        expect(client.closed).toBeFalsy();
        server.error();

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Connection error');
        expect(closes).toEqual([{ reason: 'Error: Connection error' }]);
        expect(messages).toEqual([]);
        expect(client.closed).toBeTruthy();

        server.send({ a: 'message' });
        expect(messages).toEqual([]);
        expect(errors).toHaveLength(1);
    });

    test('client close' + suffix, async () => {
        expect(client.closed).toBeFalsy();
        client.close(5, 'hello');
        await server.closed;
        expect(client.closed).toBeTruthy();

        expect(closes).toEqual([{ code: 5, reason: 'hello' }]);
    });
}

describe('url tests', () => tests(true));

describe('socket tests', () => tests(false));

describe('general tests', () => {
    let server: WS;
    let closes: any[] = [];
    let errors: string[] = [];
    const config = {
        closeHandler: (code?: number, reason?: string) =>
            closes.push({ code, reason }),
        errorHandler: (error: Error) => errors.push(error.message),
    };
    beforeEach(() => {
        closes = [];
        errors = [];
        server = new WS(TEST_URL, { jsonProtocol: true });
    });

    afterEach(() => {
        WS.clean();
    });

    test('error on close', async () => {
        const client = new Socket(TEST_URL, {
            errorOnClose: true,
            ...config,
        });
        await client.connect();
        await server.connected;

        expect(closes).toHaveLength(0);
        expect(errors).toHaveLength(0);
        expect(client.closed).toBeFalsy();

        server.close();

        expect(closes).toEqual([
            {
                code: 1000,
                reason: '',
            },
        ]);
        expect(errors).toEqual(['Connection closed with code 1000; Reason: ']);
        expect(client.closed).toBeTruthy();
    });

    test('connect timeout', async () => {
        server.close();

        const client = new Socket(TEST_URL, {
            connectTimeout: 500,
            ...config,
        });
        expect(client.connect()).rejects.toThrow(
            'connect() timed out after 500ms'
        );
        expect(closes).toHaveLength(0);
        expect(errors).toHaveLength(0);
    });
});
