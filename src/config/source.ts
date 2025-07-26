export interface ConfigurationSource {
  load(): Promise<Record<string, unknown>>;
}
