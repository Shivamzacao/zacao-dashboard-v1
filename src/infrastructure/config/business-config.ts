import rawConfiguration from "@/config/zacao-business-config.json";
import {
  parseBusinessConfiguration,
  type BusinessConfiguration,
} from "@/src/domain/configuration/business-config";

/**
 * The committed business configuration, validated once at module load. An
 * invalid file fails loudly at startup rather than silently changing a
 * classification or paging rule at request time.
 */
export const businessConfiguration: BusinessConfiguration =
  parseBusinessConfiguration(rawConfiguration);
