import { Schema } from "effect";
import { SettingStruct, type Settings } from "./schemas";
import { DEFAULT_SETTINGS } from "./defaults";


const MIN_SIZE_WIDTH = 100;
const MIN_SIZE_HEIGHT = 100;
const MIN_AUTO_ARCHIVE_DAYS = 1;
const MIN_MAX_HISTORY = 10;
const MIN_RESERVE_TOKENS = 0;
const MAX_RESERVE_TOKENS = 100_000;
const MIN_PRESERVE_RECENT_TOKENS = 0;
const MAX_PRESERVE_RECENT_TOKENS = 50_000;
const MIN_TAIL_TURNS = 0;
const MAX_TAIL_TURNS = 20;


export function sanitize(input: Partial<Settings>): Settings {
  const decoded = Schema.decodeUnknownEither(SettingStruct)(input);
  const safe: Settings =
    decoded._tag === "Right"
      ? (decoded.right as Settings)
      : DEFAULT_SETTINGS;

  const mergedWindow = {
    ...DEFAULT_SETTINGS.window,
    ...(safe.window ?? {}),
    minSize: {
      ...DEFAULT_SETTINGS.window.minSize,
      ...((safe.window ?? {}).minSize ?? {}),
    },
    defaultSize: {
      ...DEFAULT_SETTINGS.window.defaultSize,
      ...((safe.window ?? {}).defaultSize ?? {}),
    },
  };

  const mergedConversations = {
    ...DEFAULT_SETTINGS.conversations,
    ...(safe.conversations ?? {}),
  };

  const rawSchemaVersion = (safe.schemaVersion ?? "1.5") as Settings["schemaVersion"];
  const rawProviders = safe.providers?.length ? safe.providers : DEFAULT_SETTINGS.providers;
  const rawUserLanguage = safe.userLanguage ?? DEFAULT_SETTINGS.userLanguage;
  const rawTheme = safe.theme ?? DEFAULT_SETTINGS.theme;
  const rawStartAtLogin = safe.startAtLogin ?? DEFAULT_SETTINGS.startAtLogin;
  const rawSystemPrompt = {
    ...DEFAULT_SETTINGS.systemPrompt,
    ...(safe.systemPrompt ?? {}),
  };

  const clampedConversations = {
    ...mergedConversations,
    autoArchiveAfterDays: Math.max(MIN_AUTO_ARCHIVE_DAYS, mergedConversations.autoArchiveAfterDays | 0),
    maxHistory: Math.max(MIN_MAX_HISTORY, mergedConversations.maxHistory | 0),
  };

  const rawSubAgents = safe.subAgents ?? DEFAULT_SETTINGS.subAgents;

  const mergedCompaction = {
    ...DEFAULT_SETTINGS.compaction,
    ...(safe.compaction ?? {}),
  };

  const clampedCompaction = {
    ...mergedCompaction,
    reserveTokens: Math.max(MIN_RESERVE_TOKENS, Math.min(MAX_RESERVE_TOKENS, mergedCompaction.reserveTokens | 0)),
    preserveRecentTokens: Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.min(MAX_PRESERVE_RECENT_TOKENS, mergedCompaction.preserveRecentTokens | 0)),
    tailTurns: Math.max(MIN_TAIL_TURNS, Math.min(MAX_TAIL_TURNS, mergedCompaction.tailTurns | 0)),
  };

  const clampedMinSize = {
    width: Math.max(MIN_SIZE_WIDTH, mergedWindow.minSize.width | 0),
    height: Math.max(MIN_SIZE_HEIGHT, mergedWindow.minSize.height | 0),
  };

  const clampedDefaultSize = {
    width: Math.max(clampedMinSize.width, mergedWindow.defaultSize.width | 0),
    height: Math.max(clampedMinSize.height, mergedWindow.defaultSize.height | 0),
  };

  return {
    schemaVersion: rawSchemaVersion,
    providers: rawProviders,
    defaultLlmProviderId: safe.defaultLlmProviderId ?? DEFAULT_SETTINGS.defaultLlmProviderId,
    userLanguage: rawUserLanguage,
    theme: rawTheme,
    startAtLogin: rawStartAtLogin,
    window: {
      ...mergedWindow,
      minSize: clampedMinSize,
      defaultSize: clampedDefaultSize,
    },
    systemPrompt: rawSystemPrompt,
    conversations: clampedConversations,
    subAgents: rawSubAgents,
    compaction: clampedCompaction,
  };
}