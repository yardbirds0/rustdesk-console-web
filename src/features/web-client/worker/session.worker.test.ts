/** @jest-environment node */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

type SessionEvents = import('../core/session').SessionEvents;

let mockEvents: SessionEvents;
let mockOutput: (frame: VideoFrame) => void;
const mockPost =
  jest.fn<
    (
      message: {
        type: string;
        generation?: number;
        [key: string]: unknown;
      },
      options?: { transfer: Transferable[] },
    ) => void
  >();
const mockConnect = jest.fn();
const mockPassword = jest.fn();
const mockInput = jest.fn();
const mockClipboard = jest.fn();
const mockSendImage = jest.fn();
const mockSetClipboardEnabled = jest.fn<(enabled: boolean) => boolean>();
const mockFlushClipboard = jest.fn<() => Promise<void>>();
const mockImage = jest.fn<(value: unknown) => Promise<Uint8Array>>();
jest.mock('../clipboard/image', () => ({
  clipboardPng: (value: unknown) => mockImage(value),
}));
const mockReady = jest.fn<() => Promise<void>>();
const mockSupported = jest.fn<() => Promise<boolean>>();
const mockDecode = jest.fn();
const mockDispose = jest.fn();

jest.mock('../core/crypto', () => ({ cryptoReady: () => mockReady() }));
jest.mock('../core/session', () => ({
  RemoteSession: class {
    constructor(events: SessionEvents) {
      mockEvents = events;
    }
    connect(...args: unknown[]) {
      mockConnect(...args);
      mockEvents.state('connecting');
    }
    authenticationForFiles() {
      return undefined;
    }
    qualityMetrics() {
      return { videoBytes: 1200, delay: 42 };
    }
    setClipboardEnabled = mockSetClipboardEnabled;
    setReadOnly() {
      return true;
    }
    setViewOptions() {
      return true;
    }
    submitPassword = mockPassword;
    sendInput = mockInput;
    sendClipboard = mockClipboard;
    sendImage = mockSendImage;
    flushClipboard = mockFlushClipboard;
    acknowledgeVideo() {}
    refreshVideo() {}
    setAudio() {
      return true;
    }
    selectDisplay() {
      return true;
    }
    disconnect() {
      mockEvents.state('closed');
    }
  },
}));
jest.mock('../media/vp9-decoder', () => ({
  Vp9Decoder: class {
    static supported() {
      return mockSupported();
    }
    constructor(output: (frame: VideoFrame) => void) {
      mockOutput = output;
    }
    decode = mockDecode;
    dispose = mockDispose;
  },
}));

const savedPost = globalThis.postMessage;
const savedMessage = globalThis.onmessage;
beforeEach(() => {
  jest.clearAllMocks();
  mockReady.mockResolvedValue(undefined);
  mockSupported.mockResolvedValue(true);
  mockSetClipboardEnabled.mockReturnValue(true);
  mockFlushClipboard.mockResolvedValue(undefined);
  Object.assign(globalThis, { postMessage: mockPost, isSecureContext: true });
});
afterEach(() => {
  Object.assign(globalThis, {
    postMessage: savedPost,
    onmessage: savedMessage,
  });
});
async function boot() {
  jest.isolateModules(() => {
    require('./session.worker');
  });
  await new Promise((resolve) => setImmediate(resolve));
}
function send(message: object) {
  const handler = globalThis.onmessage as
    | ((event: MessageEvent) => void)
    | null;
  handler?.({ data: message } as MessageEvent);
}
function connect(generation: number) {
  send({ type: 'connect', generation, id: '123456789', profile: {} });
}
function frame() {
  return { close: jest.fn() } as unknown as VideoFrame;
}

test('events carry the current session and obsolete commands cannot act on a newer connection', async () => {
  await boot();
  connect(2);
  expect(mockPost).toHaveBeenCalledWith({
    type: 'state',
    state: 'connecting',
    generation: 2,
  });
  send({ type: 'password', generation: 1, password: 'obsolete' });
  send({ type: 'input', generation: 1, input: { keyEvent: { chr: 97 } } });
  send({ type: 'disconnect', generation: 1 });
  connect(1);
  expect(mockConnect).toHaveBeenCalledTimes(1);
  expect(mockPassword).not.toHaveBeenCalled();
  expect(mockInput).not.toHaveBeenCalled();
  send({ type: 'password', generation: 2, password: 'current' });
  expect(mockPassword).toHaveBeenCalledWith('current');
  send({ type: 'disconnect', generation: 3 });
  expect(mockPost).toHaveBeenCalledWith({
    type: 'state',
    state: 'closed',
    generation: 3,
  });
});

test('old render acknowledgements do not release frames belonging to a new session', async () => {
  await boot();
  connect(1);
  mockEvents.message({
    videoFrame: { display: 0, vp9s: { frames: [] } },
  } as Parameters<SessionEvents['message']>[0]);
  mockOutput(frame());
  send({ type: 'disconnect', generation: 2 });
  connect(3);
  mockEvents.message({
    videoFrame: { display: 0, vp9s: { frames: [] } },
  } as Parameters<SessionEvents['message']>[0]);
  mockOutput(frame());
  const pending = frame();
  mockOutput(pending);
  const count = mockPost.mock.calls.filter(([m]) => m.type === 'frame').length;
  send({ type: 'rendered', displayGeneration: 0, generation: 1 });
  expect(mockPost.mock.calls.filter(([m]) => m.type === 'frame')).toHaveLength(
    count,
  );
  send({ type: 'rendered', displayGeneration: 0, generation: 3 });
  expect(mockPost.mock.calls.filter(([m]) => m.type === 'frame')).toHaveLength(
    count + 1,
  );
  expect(mockPost.mock.calls.at(-1)?.[0].generation).toBe(3);
});

test('shutdown acknowledges closed session and decoder, then ignores further commands', async () => {
  await boot();
  connect(1);
  mockEvents.message({
    videoFrame: { display: 0, vp9s: { frames: [] } },
  } as Parameters<SessionEvents['message']>[0]);
  mockOutput(frame());
  const pending = frame();
  mockOutput(pending);
  send({ type: 'shutdown', generation: 2 });
  expect(mockDispose).toHaveBeenCalledTimes(1);
  expect(pending.close).toHaveBeenCalledTimes(1);
  expect(
    mockPost.mock.calls
      .filter(([m]) => m.type !== 'audio-reset')
      .slice(-2)
      .map(([message]) => message),
  ).toEqual([
    { type: 'state', state: 'closed', generation: 2 },
    { type: 'shutdown-complete', generation: 2 },
  ]);
  connect(3);
  send({ type: 'input', generation: 2, input: { keyEvent: { chr: 97 } } });
  expect(mockConnect).toHaveBeenCalledTimes(1);
  expect(mockInput).not.toHaveBeenCalled();
});

test('text input shares the UTF-8 byte bound and revoked clipboard data is discarded', async () => {
  await boot();
  connect(1);
  send({ type: 'text', generation: 1, text: '中'.repeat(400000) });
  expect(mockInput).not.toHaveBeenCalled();
  expect(mockPost).toHaveBeenCalledWith({
    type: 'warning',
    code: 'clipboard',
    generation: 1,
  });
  mockEvents.permissions({
    keyboard: true,
    clipboard: false,
    audio: true,
    file: true,
  });
  mockEvents.message({
    clipboard: { content: new TextEncoder().encode('private'), format: 0 },
  } as Parameters<SessionEvents['message']>[0]);
  expect(mockPost.mock.calls.some(([m]) => m.type === 'clipboard')).toBe(false);
});

test('failed cryptographic initialization reports unsupported readiness instead of hanging', async () => {
  mockReady.mockRejectedValue(new Error('Initialization failed'));
  await boot();
  expect(mockPost).toHaveBeenCalledWith({
    type: 'ready',
    secureContext: true,
    videoDecoder: false,
    generation: 0,
  });
});

test('verified session security events carry generation without publishing peer identity or secrets', async () => {
  await boot();
  connect(2);
  mockEvents.security(0);
  expect(mockPost).toHaveBeenLastCalledWith({
    type: 'security',
    kxVersion: 0,
    generation: 2,
  });
  mockEvents.security(undefined);
  expect(mockPost).toHaveBeenLastCalledWith({
    type: 'security',
    kxVersion: undefined,
    generation: 2,
  });
  connect(3);
  mockEvents.security(1);
  expect(mockPost).toHaveBeenLastCalledWith({
    type: 'security',
    kxVersion: 1,
    generation: 3,
  });
});

test('多屏切换丢弃旧屏包、旧解码回调和旧绘制 ACK', async () => {
  await boot();
  connect(1);
  const message = (value: object) =>
    mockEvents.message(value as Parameters<SessionEvents['message']>[0]);
  message({
    loginResponse: {
      peerInfo: {
        displays: [
          { width: 800, height: 600 },
          { x: -1024, width: 1024, height: 768 },
        ],
      },
    },
  });
  message({ videoFrame: { display: 0, vp9s: { frames: [] } } });
  const oldOutput = mockOutput;
  send({ type: 'select-display', index: 1, generation: 1 });
  const oldFrame = frame();
  oldOutput(oldFrame);
  expect(oldFrame.close).toHaveBeenCalled();
  const n = mockDecode.mock.calls.length;
  message({ videoFrame: { display: 0, vp9s: { frames: [] } } });
  message({ videoFrame: { display: 1, vp9s: { frames: [] } } });
  expect(mockDecode).toHaveBeenCalledTimes(n);
  message({
    misc: { switchDisplay: { display: 1, x: -1024, width: 1024, height: 768 } },
  });
  message({ videoFrame: { display: 1, vp9s: { frames: [] } } });
  mockOutput(frame());
  mockOutput(frame());
  const count = mockPost.mock.calls.filter(([m]) => m.type === 'frame').length;
  send({ type: 'rendered', generation: 1, displayGeneration: 0 });
  expect(mockPost.mock.calls.filter(([m]) => m.type === 'frame')).toHaveLength(
    count,
  );
  send({ type: 'rendered', generation: 1, displayGeneration: 2 });
  expect(mockPost.mock.calls.filter(([m]) => m.type === 'frame')).toHaveLength(
    count + 1,
  );
  send({ type: 'disconnect', generation: 2 });
});

test('图片转换期间撤权或更换会话，不发布迟到图片', async () => {
  await boot();
  connect(1);
  let resolve: (value: Uint8Array) => void = () => {};
  mockImage.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mockEvents.message({
    multiClipboards: {
      clipboards: [{ format: 22, content: new Uint8Array([1]) }],
    },
  } as Parameters<SessionEvents['message']>[0]);
  mockEvents.permissions({
    keyboard: true,
    clipboard: false,
    audio: true,
    file: true,
  });
  resolve(new Uint8Array([1, 2]));
  await new Promise((done) => setImmediate(done));
  expect(
    mockPost.mock.calls.some(([message]) => message.type === 'image'),
  ).toBe(false);
  send({ type: 'disconnect', generation: 2 });
});

test('同屏 PeerInfo 热更新无需等待原生重复 SwitchDisplay 就能恢复首帧', async () => {
  await boot();
  connect(1);
  const message = (value: object) =>
    mockEvents.message(value as Parameters<SessionEvents['message']>[0]);
  const peer = { currentDisplay: 0, displays: [{ width: 800, height: 600 }] };
  message({ loginResponse: { peerInfo: peer } });
  message({ peerInfo: peer });
  expect(mockPost).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'display',
      displayGeneration: 1,
      display: { display: 0, width: 800, height: 600 },
    }),
  );
  message({ videoFrame: { display: 0, vp9s: { frames: [] } } });
  expect(mockDecode).toHaveBeenCalledTimes(1);
  mockOutput(frame());
  expect(mockPost).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'frame',
      displayGeneration: 1,
    }),
    expect.anything(),
  );
  send({
    type: 'input',
    generation: 1,
    displayGeneration: 1,
    input: { keyEvent: { chr: 97, down: true } },
  });
  expect(mockInput).toHaveBeenCalledTimes(1);
  send({ type: 'disconnect', generation: 2 });
});

test('直接粘贴需要有效画面及剪贴板和键盘权限，切屏或新输入会取消排队快捷键', async () => {
  await boot();
  jest.useFakeTimers();
  try {
    mockClipboard.mockReturnValue(true);
    mockInput.mockReturnValue(true);
    connect(1);
    const paste = () =>
      send({
        type: 'paste',
        generation: 1,
        displayGeneration: 0,
        content: { text: 'clipboard' },
      });
    paste();
    expect(mockClipboard).not.toHaveBeenCalled();
    mockEvents.state('connected');
    mockEvents.message({
      loginResponse: {
        peerInfo: {
          platform: 'Mac OS',
          currentDisplay: 0,
          displays: [
            { width: 800, height: 600 },
            { width: 800, height: 600 },
          ],
        },
      },
    });
    mockEvents.message({ videoFrame: { display: 0, vp9s: { frames: [] } } });
    mockOutput(frame());
    paste();
    expect(mockClipboard).toHaveBeenCalledTimes(1);
    send({
      type: 'input',
      generation: 1,
      displayGeneration: 0,
      input: { mouseEvent: { mask: 9 } },
    });
    jest.runOnlyPendingTimers();
    expect(mockInput).toHaveBeenCalledTimes(1);
    mockEvents.permissions({
      keyboard: true,
      clipboard: false,
      audio: true,
      file: true,
    });
    paste();
    expect(mockClipboard).toHaveBeenCalledTimes(1);
    mockEvents.permissions({
      keyboard: true,
      clipboard: true,
      audio: true,
      file: true,
    });
    paste();
    send({ type: 'select-display', generation: 1, index: 1 });
    jest.runOnlyPendingTimers();
    expect(mockInput).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('剪贴板上下文只接受当前会话递增代次，旧PNG转换不跨失焦恢复', async () => {
  await boot();
  connect(1);
  let finish!: (bytes: Uint8Array) => void;
  mockImage.mockImplementationOnce(
    () =>
      new Promise<Uint8Array>((resolve) => {
        finish = resolve;
      }),
  );
  send({ type: 'clipboard-context', generation: 1, clipboardGeneration: 2 });
  mockEvents.message({
    multiClipboards: {
      clipboards: [{ format: 22, content: new Uint8Array([1]) }],
    },
  } as never);
  send({ type: 'clipboard-context', generation: 1, clipboardGeneration: 3 });
  finish(new Uint8Array([1]));
  await Promise.resolve();
  await Promise.resolve();
  expect(
    mockPost.mock.calls.some(([message]) => message.type === 'image'),
  ).toBe(false);
  send({ type: 'clipboard-context', generation: 0, clipboardGeneration: 99 });
  send({ type: 'clipboard-context', generation: 1, clipboardGeneration: 1 });
  send({ type: 'clipboard-context', generation: 1, clipboardGeneration: NaN });
  mockEvents.message({
    clipboard: { content: new TextEncoder().encode('fresh'), format: 0 },
  } as never);
  expect(mockPost).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'clipboard',
      text: 'fresh',
      clipboardGeneration: 3,
    }),
  );
  mockImage.mockImplementationOnce(
    () =>
      new Promise<Uint8Array>((resolve) => {
        finish = resolve;
      }),
  );
  mockEvents.message({
    multiClipboards: {
      clipboards: [{ format: 22, content: new Uint8Array([1]) }],
    },
  } as never);
  for (const invalid of [3, 3.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 1])
    send({
      type: 'clipboard-context',
      generation: 1,
      clipboardGeneration: invalid,
    });
  finish(new Uint8Array([2]));
  await Promise.resolve();
  await Promise.resolve();
  expect(mockPost).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'image',
      bytes: new Uint8Array([2]),
      clipboardGeneration: 3,
    }),
  );
});

test('Worker 只读挡住绕过 DOM 的输入、文本和粘贴，过期代次不能修改', async () => {
  await boot();
  connect(1);
  mockEvents.state('connected');
  mockEvents.message({
    videoFrame: { display: 0, vp9s: { frames: [] } },
  } as Parameters<SessionEvents['message']>[0]);
  mockOutput(frame());
  send({ type: 'read-only', generation: 1, enabled: true });
  send({
    type: 'input',
    generation: 1,
    displayGeneration: 0,
    input: { keyEvent: { seq: 'blocked', press: true } },
  });
  send({ type: 'text', generation: 1, displayGeneration: 0, text: 'blocked' });
  send({
    type: 'paste',
    generation: 1,
    displayGeneration: 0,
    content: { text: 'blocked' },
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(mockInput).not.toHaveBeenCalled();
  expect(mockClipboard).not.toHaveBeenCalled();
  send({ type: 'read-only', generation: 0, enabled: false });
  send({
    type: 'input',
    generation: 1,
    displayGeneration: 0,
    input: { keyEvent: { chr: 65, press: true } },
  });
  expect(mockInput).not.toHaveBeenCalled();
  send({ type: 'read-only', generation: 1, enabled: false });
  send({
    type: 'input',
    generation: 1,
    displayGeneration: 0,
    input: { keyEvent: { chr: 65, press: true } },
  });
  expect(mockInput).toHaveBeenCalledTimes(1);
});

test('监测按请求返回真实层级计数，过期会话请求不生效', async () => {
  await boot();
  connect(1);
  send({ type: 'metrics', generation: 0, request: 1 });
  expect(
    mockPost.mock.calls.filter(([m]) => m.type === 'metrics'),
  ).toHaveLength(0);
  send({ type: 'metrics', generation: 1, request: 2 });
  expect(mockPost).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'metrics',
      generation: 1,
      request: 2,
      decoded: 0,
      videoBytes: 1200,
      delay: 42,
      displayGeneration: 0,
    }),
  );
});

test('关闭同步取消迟到PNG、阻断双向文字和图片，开启不重放缓存', async () => {
  await boot();
  connect(1);
  let finish!: (bytes: Uint8Array) => void;
  mockImage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mockEvents.message({
    multiClipboards: {
      clipboards: [{ format: 22, content: new Uint8Array([1]) }],
    },
  } as never);
  send({
    type: 'clipboard-context',
    generation: 1,
    clipboardGeneration: 2,
    enabled: false,
  });
  finish(new Uint8Array([2]));
  await Promise.resolve();
  await Promise.resolve();
  const inbound = {
    clipboard: { content: new TextEncoder().encode('blocked'), format: 0 },
  };
  mockEvents.message(inbound as never);
  send({ type: 'clipboard', generation: 1, text: 'blocked' });
  send({ type: 'image', generation: 1, bytes: new Uint8Array([2]) });
  expect(mockClipboard).not.toHaveBeenCalled();
  expect(mockSendImage).not.toHaveBeenCalled();
  expect(
    mockPost.mock.calls.filter(
      ([m]) => m.type === 'clipboard' || m.type === 'image',
    ),
  ).toHaveLength(0);
  send({
    type: 'clipboard-context',
    generation: 1,
    clipboardGeneration: 3,
    enabled: true,
  });
  expect(
    mockPost.mock.calls.filter(
      ([m]) => m.type === 'clipboard' || m.type === 'image',
    ),
  ).toHaveLength(0);
  mockEvents.message(inbound as never);
  expect(mockPost).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'clipboard',
      clipboardGeneration: 3,
      text: 'blocked',
    }),
  );
  mockEvents.permissions({
    keyboard: true,
    clipboard: false,
    audio: true,
    file: true,
  });
  send({
    type: 'clipboard-context',
    generation: 1,
    clipboardGeneration: 4,
    enabled: true,
  });
  mockEvents.message(inbound as never);
  expect(
    mockPost.mock.calls.filter(([m]) => m.type === 'clipboard'),
  ).toHaveLength(1);
});

test('重连接受当前剪贴板关闭设置，历史上下文不能重新开启同步', async () => {
  await boot();
  connect(1);
  send({
    type: 'clipboard-context',
    generation: 1,
    clipboardGeneration: 9,
    enabled: false,
  });
  connect(2);
  // 页面在 connect 前后重发同一代次，仍须用于初始化新会话。
  send({
    type: 'clipboard-context',
    generation: 2,
    clipboardGeneration: 9,
    enabled: false,
  });
  expect(mockSetClipboardEnabled).toHaveBeenLastCalledWith(false);
  send({ type: 'clipboard-context', generation: 2, clipboardGeneration: 10 });
  send({
    type: 'clipboard-context',
    generation: 1,
    clipboardGeneration: 99,
    enabled: true,
  });
  send({
    type: 'clipboard-context',
    generation: 2,
    clipboardGeneration: 10,
    enabled: true,
  });
  const inbound = {
    clipboard: { content: new TextEncoder().encode('fresh'), format: 0 },
  };
  mockEvents.message(inbound as never);
  send({ type: 'clipboard', generation: 2, text: 'blocked' });
  expect(mockClipboard).not.toHaveBeenCalled();
  expect(
    mockPost.mock.calls.filter(([m]) => m.type === 'clipboard'),
  ).toHaveLength(0);
  expect(mockSetClipboardEnabled).toHaveBeenLastCalledWith(false);
  send({
    type: 'clipboard-context',
    generation: 2,
    clipboardGeneration: 11,
    enabled: true,
  });
  mockEvents.message(inbound as never);
  expect(mockPost).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'clipboard',
      clipboardGeneration: 11,
      generation: 2,
    }),
  );
});

test('发送缓冲等待期间关闭再开启同步，不发送旧粘贴快捷键', async () => {
  await boot();
  jest.useFakeTimers();
  try {
    mockClipboard.mockReturnValue(true);
    mockInput.mockReturnValue(true);
    let drained: () => void = () => {};
    mockFlushClipboard.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          drained = resolve;
        }),
    );
    connect(1);
    mockEvents.state('connected');
    mockEvents.message({
      videoFrame: { display: 0, vp9s: { frames: [] } },
    } as never);
    mockOutput(frame());
    const paste = (text: string) =>
      send({
        type: 'paste',
        generation: 1,
        displayGeneration: 0,
        content: { text },
      });
    paste('old');
    send({
      type: 'clipboard-context',
      generation: 1,
      clipboardGeneration: 1,
      enabled: false,
    });
    send({
      type: 'clipboard-context',
      generation: 1,
      clipboardGeneration: 2,
      enabled: true,
    });
    drained();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    expect(mockClipboard).toHaveBeenCalledTimes(1);
    expect(mockInput).not.toHaveBeenCalled();
    paste('new');
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(300);
    expect(mockClipboard).toHaveBeenCalledTimes(2);
    expect(mockInput).toHaveBeenCalledTimes(1);
    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({
        keyEvent: expect.objectContaining({ chr: 118, press: true }),
      }),
    );
  } finally {
    jest.useRealTimers();
  }
});
