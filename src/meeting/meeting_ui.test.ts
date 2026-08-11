// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../i18n";
import { meetingErrorDescription } from "./meeting_ui";

afterEach(() => setLocale("en"));

describe("meeting error presentation", () => {
  it("uses the active locale instead of native or model error text", () => {
    setLocale("ko");
    expect(meetingErrorDescription("microphone_unavailable")).toBe("연결된 마이크를 찾지 못했습니다. 마이크를 연결하거나 시스템 오디오만 사용해 주세요.");

    setLocale("ja");
    expect(meetingErrorDescription("worker_exception")).toBe("ローカル文字起こしサービスを開始できませんでした。しばらくしてから再試行してください。");
  });

  it("does not expose implementation names for unknown engine failures", () => {
    const message = meetingErrorDescription("future_engine_error");
    expect(message).toBe("Check microphone and system audio permissions.");
    expect(message).not.toMatch(/qwen|asr|mlx/i);
  });
});
