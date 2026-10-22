/** Production bundles contain no workspace connector implementation or identity transport. */
export class ReplitConnectors {
  async proxy(_provider: string, _path: string, _options: { method: string }): Promise<Response> {
    throw new Error("Workspace connections are unavailable on published hosts. Use Staff Google authorization or local folders.");
  }
}
