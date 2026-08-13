interface DocumentSaveLoaderHandle {
  destroy(): void;
}

function createDocumentSaveLoader(element: HTMLElement): DocumentSaveLoaderHandle {
  const indicator = document.createElement("span");
  indicator.className = "il-loader";
  indicator.dataset.variant = "domino";
  indicator.dataset.speed = "0.78";
  indicator.style.setProperty("--il-size", "18px");
  indicator.setAttribute("aria-hidden", "true");
  const domino = document.createElement("span");
  domino.className = "il-domino";
  for (let index = 0; index < 5; index += 1) domino.append(document.createElement("i"));
  indicator.append(domino);
  element.replaceChildren(indicator);
  return { destroy: () => element.replaceChildren() };
}

export { createDocumentSaveLoader };
export type { DocumentSaveLoaderHandle };
