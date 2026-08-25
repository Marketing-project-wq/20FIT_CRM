import { describe, it, expect } from "vitest";
import { realSendEnabled, isInternalAddress, maySendTo } from "./send-gate";

describe("send-gate — pre-launch blocking of customer sends (token not yet rotated)", () => {
  it("real sending is OFF unless CAMPAIGN_SEND_ENABLED is exactly 'true'", () => {
    // undefined, "false", and "0" must ALL mean OFF (the safe/correct pre-launch state). The var was
    // absent from Railway on the first send test — proving absence == safe is what made that correct.
    expect(realSendEnabled({} as NodeJS.ProcessEnv)).toBe(false); // undefined
    expect(realSendEnabled({ CAMPAIGN_SEND_ENABLED: undefined } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(realSendEnabled({ CAMPAIGN_SEND_ENABLED: "false" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(realSendEnabled({ CAMPAIGN_SEND_ENABLED: "0" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(realSendEnabled({ CAMPAIGN_SEND_ENABLED: "1" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(realSendEnabled({ CAMPAIGN_SEND_ENABLED: "TRUE" } as unknown as NodeJS.ProcessEnv)).toBe(false); // only lowercase 'true'
    expect(realSendEnabled({ CAMPAIGN_SEND_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("recognises internal 20fit.id addresses (case-insensitive)", () => {
    expect(isInternalAddress("zidni@20fit.id")).toBe(true);
    expect(isInternalAddress("Ops@20fit.ID")).toBe(true);
    expect(isInternalAddress("someone@gmail.com")).toBe(false);
    expect(isInternalAddress("fake@20fit.id.evil.com")).toBe(false);
  });

  it("while disabled, ONLY internal addresses may be sent to — customers are withheld", () => {
    expect(maySendTo("zidni@20fit.id", false)).toBe(true); // internal test target OK
    expect(maySendTo("customer@gmail.com", false)).toBe(false); // customer withheld
  });

  it("once enabled (token rotated + DNS set), any address may be sent to", () => {
    expect(maySendTo("customer@gmail.com", true)).toBe(true);
  });
});
