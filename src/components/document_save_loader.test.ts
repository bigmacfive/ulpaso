// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createDocumentSaveLoader } from "./document_save_loader";

afterEach(() => {
  document.body.replaceChildren();
});

describe("document save loader", () => {
  it("renders and unmounts the slower 18px domino inline loader", () => {
    const host = document.createElement("span");
    document.body.append(host);

    const loader = createDocumentSaveLoader(host);
    const indicator = host.querySelector<HTMLElement>('.il-loader[data-variant="domino"]');
    expect(indicator).not.toBeNull();
    expect(indicator?.style.getPropertyValue("--il-size")).toBe("18px");
    expect(indicator?.getAttribute("data-speed")).toBe("0.78");
    expect(indicator?.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelectorAll(".il-domino > i")).toHaveLength(5);

    loader.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
