import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueYoutubeOAuthState,
  verifyYoutubeOAuthState,
  YOUTUBE_OAUTH_STATE_MAX_AGE_SECONDS,
} from "./oauth";

describe("YouTube OAuth state", () => {
  const originalSecret = process.env.AUTH_SESSION_SECRET;

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET =
      "test-secret-0123456789abcdef0123456789abcdef";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T12:00:00Z"));
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
    } else {
      process.env.AUTH_SESSION_SECRET = originalSecret;
    }
    vi.useRealTimers();
  });

  it("verifies a matching signed state from the callback cookie", () => {
    const state = issueYoutubeOAuthState("user-1");

    expect(verifyYoutubeOAuthState(state, state)).toEqual({ userId: "user-1" });
  });

  it("rejects callback state that does not match the cookie", () => {
    const state = issueYoutubeOAuthState("user-1");
    const otherState = issueYoutubeOAuthState("user-1");

    expect(verifyYoutubeOAuthState(state, otherState)).toBeNull();
  });

  it("rejects tampered state payloads", () => {
    const state = issueYoutubeOAuthState("user-1");
    const [body, sig] = state.split(".");
    const tampered = `${Buffer.from(JSON.stringify({
      uid: "user-2",
      nonce: "same",
      exp: Math.floor(Date.now() / 1000) + 60,
    })).toString("base64url")}.${sig}`;

    expect(tampered).not.toBe(state);
    expect(verifyYoutubeOAuthState(tampered, tampered)).toBeNull();
    expect(body).toBeTruthy();
  });

  it("rejects expired state", () => {
    const state = issueYoutubeOAuthState("user-1");

    vi.setSystemTime(
      new Date(
        Date.now() + (YOUTUBE_OAUTH_STATE_MAX_AGE_SECONDS + 1) * 1000,
      ),
    );

    expect(verifyYoutubeOAuthState(state, state)).toBeNull();
  });
});
