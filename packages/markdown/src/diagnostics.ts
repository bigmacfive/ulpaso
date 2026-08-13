let diagnosticsEnabled = false;

function setMarkdownDiagnostics(enabled: boolean): void {
  diagnosticsEnabled = enabled;
}

function warnMissingHandler(message: string): void {
  if (diagnosticsEnabled) console.warn(message);
}

export { setMarkdownDiagnostics, warnMissingHandler };
