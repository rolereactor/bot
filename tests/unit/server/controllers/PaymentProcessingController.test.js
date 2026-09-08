import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockConfig = {
  corePricing: {
    packages: {
      "$10": { price: 10, totalCores: 150, rate: 15 },
    },
  },
  web3ReceiverAddress: "0xC850f03295Bb614d52038FB83f78f72ed8f7c65d",
};

const mockDbManager = {
  payments: {
    findByPaymentId: vi.fn().mockResolvedValue(null),
  },
};

const USDC_CONTRACT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const RECEIVER = mockConfig.web3ReceiverAddress;
const VALID_SENDER = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";

vi.mock("../../../../src/utils/logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("../../../../src/server/utils/responseHelpers.js", () => ({
  createSuccessResponse: (data) => ({ success: true, data }),
  createErrorResponse: (message, statusCode, detail) => ({
    statusCode,
    response: { success: false, error: { message, code: statusCode, detail } },
  }),
}));

vi.mock("../../../../src/server/utils/apiShared.js", () => ({
  logRequest: vi.fn(),
}));

vi.mock("../../../../src/utils/payments/plisio.js", () => ({
  plisioPay: { verifyWebhook: vi.fn() },
}));

vi.mock("../../../../src/config/config.js", () => ({
  config: mockConfig,
}));

vi.mock("../../../../src/utils/storage/databaseManager.js", () => ({
  getStorageManager: vi.fn().mockResolvedValue({
    payments: mockDbManager.payments,
  }),
}));

vi.mock("../../../../src/utils/storage/storageManager.js", () => ({
  getStorageManager: vi.fn().mockResolvedValue({
    payments: mockDbManager.payments,
  }),
}));

// viem — dynamic import inside the controller; hoist this mock
vi.mock("viem", () => {
  const transferAbiItem = "EVENT_TRANSFER";
  return {
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: vi.fn(),
    })),
    parseAbiItem: vi.fn(() => transferAbiItem),
    decodeEventLog: vi.fn(),
    http: vi.fn(),
  };
});

vi.mock("../../../../src/webhooks/crypto.js", () => ({
  processCryptoPayment: vi.fn().mockResolvedValue({
    success: true,
    message: "Credited",
    credits: 150,
  }),
}));

// ─── Import AFTER mocks ─────────────────────────────────────────────────────

const { apiVerifyWeb3Payment } = await import(
  "../../../../src/server/controllers/PaymentProcessingController.js"
);

const { createPublicClient, decodeEventLog, parseAbiItem } = await import(
  "viem"
);
const { processCryptoPayment } = await import("../../../../src/webhooks/crypto.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockRes() {
  return {
    statusCode: null,
    body: null,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function makeReq(overrides = {}) {
  return {
    body: {
      txHash: "0xabc123",
      packageId: "$10",
      chainId: 1,
      discordId: "123456",
      senderAddress: VALID_SENDER,
      email: "test@test.com",
      username: "tester",
      ...overrides,
    },
    ip: "127.0.0.1",
    get: vi.fn(() => "vitest-agent"),
  };
}

function mockSuccessfulReceipt({
  from = VALID_SENDER,
  to = RECEIVER,
  value = 10000000n,
  status = "success",
  logs,
} = {}) {
  const receipt = {
    status,
    logs: logs ?? [
      {
        address: USDC_CONTRACT,
        data: "0xmock",
        topics: ["0xmock"],
      },
    ],
  };

  createPublicClient.mockReturnValue({
    waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt),
  });

  if (logs === undefined) {
    decodeEventLog.mockReturnValue({
      eventName: "Transfer",
      args: { from, to, value },
    });
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("apiVerifyWeb3Payment", () => {
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    res = createMockRes();
    mockDbManager.payments.findByPaymentId.mockResolvedValue(null);
    parseAbiItem.mockReturnValue("EVENT_TRANSFER");
  });

  it("returns 400 when required fields are missing", async () => {
    const req = makeReq({ txHash: undefined });
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it("returns 400 when senderAddress is missing", async () => {
    const req = makeReq({ senderAddress: undefined });
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it("returns 400 for invalid packageId", async () => {
    const req = makeReq({ packageId: "$999" });
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ message: "Invalid package" }),
      })
    );
  });

  it("returns 400 for unsupported network", async () => {
    const req = makeReq({ chainId: 99999 });
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ message: "Unsupported network" }),
      })
    );
  });

  it("blocks Sepolia testnet payments in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.ALLOW_TESTNET = undefined;

    const req = makeReq({ chainId: 11155111 });
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: "Testnet payments are disabled in production",
        }),
      })
    );

    process.env.NODE_ENV = original;
  });

  it("returns 400 when txHash already processed (dedupe)", async () => {
    mockDbManager.payments.findByPaymentId.mockResolvedValue({
      paymentId: "0xabc123",
      status: "completed",
    });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: "Transaction already processed",
        }),
      })
    );
    expect(processCryptoPayment).not.toHaveBeenCalled();
  });

  it("returns 404 when transaction not found on chain", async () => {
    createPublicClient.mockReturnValue({
      waitForTransactionReceipt: vi.fn().mockResolvedValue(null),
    });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ message: "Transaction not found" }),
      })
    );
  });

  it("returns 400 when transaction failed on chain", async () => {
    mockSuccessfulReceipt({ status: "reverted" });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: "Transaction failed on chain",
        }),
      })
    );
  });

  it("returns 400 when transfer goes to wrong address", async () => {
    mockSuccessfulReceipt({
      to: "0x0000000000000000000000000000000000000000",
      value: 10000000n,
    });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining("Invalid transaction"),
        }),
      })
    );
  });

  it("returns 400 when transfer sender does not match connected wallet", async () => {
    // Transfer goes TO the correct receiver, but FROM a different address
    mockSuccessfulReceipt({
      from: "0xSomeoneElse0000000000000000000000000000000",
      to: RECEIVER,
      value: 10000000n,
    });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining("sender mismatch"),
        }),
      })
    );
    expect(processCryptoPayment).not.toHaveBeenCalled();
  });

  it("returns 400 when transfer amount is insufficient", async () => {
    mockSuccessfulReceipt({
      from: VALID_SENDER,
      to: RECEIVER,
      value: 999999n, // Less than 10 USDC (10000000n)
    });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining("Invalid transaction"),
        }),
      })
    );
  });

  it("succeeds: valid payment grants Cores and returns 200", async () => {
    mockSuccessfulReceipt({
      from: VALID_SENDER,
      to: RECEIVER,
      value: 10000000n, // 10 USDC with 6 decimals
    });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
    expect(processCryptoPayment).toHaveBeenCalledWith(
      "123456",       // discordId
      "0xabc123",     // txHash
      "10",           // expectedUsdAmount as string
      "10",           // fiatAmount
      "USDC",         // stablecoin symbol
      "USD",          // sourceCurrency
      "test@test.com", // email
      expect.objectContaining({ discordId: "123456", username: "tester" })
    );
  });

  it("passes confirmations: 3 to waitForTransactionReceipt", async () => {
    const mockReceipt = {
      status: "success",
      logs: [
        {
          address: USDC_CONTRACT,
          data: "0xmock",
          topics: ["0xmock"],
        },
      ],
    };
    const mockClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
    };
    createPublicClient.mockReturnValue(mockClient);
    decodeEventLog.mockReturnValue({
      eventName: "Transfer",
      args: { from: VALID_SENDER, to: RECEIVER, value: 10000000n },
    });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(mockClient.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "0xabc123",
        confirmations: 3,
        timeout: 45000,
      })
    );
  });

  it("uses BigInt math for amount — rejects underpayment exactly", async () => {
    // 9.99 USDC = 9990000n — should fail against expected 10 USDC (10000000n)
    mockSuccessfulReceipt({
      from: VALID_SENDER,
      to: RECEIVER,
      value: 9990000n,
    });

    const req = makeReq();
    await apiVerifyWeb3Payment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(processCryptoPayment).not.toHaveBeenCalled();
  });
});
