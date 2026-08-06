import { metricDefinitionSchema, type MetricDefinition } from "../contracts";

export interface MetricRegistry {
  readonly definitions: readonly MetricDefinition[];
  get(key: string): MetricDefinition | undefined;
}

export function createMetricRegistry(input: readonly MetricDefinition[]): MetricRegistry {
  const definitions = input.map((definition) => metricDefinitionSchema.parse(definition));
  const byKey = new Map<string, MetricDefinition>();

  for (const definition of definitions) {
    if (byKey.has(definition.key)) {
      throw new Error(`Duplicate metric key: ${definition.key}`);
    }
    byKey.set(definition.key, Object.freeze({ ...definition }));
  }

  const frozenDefinitions = Object.freeze([...byKey.values()]);
  return Object.freeze({
    definitions: frozenDefinitions,
    get(key: string) {
      return byKey.get(key);
    },
  });
}

export const metricRegistry = createMetricRegistry([]);
