import type { Api } from "./types";
import { demoApi } from "./demo";
import { isSupabaseConfigured, supabaseApi } from "./supabase";

/** Real Supabase when configured, otherwise the in-browser demo store. */
export const api: Api = isSupabaseConfigured ? supabaseApi : demoApi;
export const isDemo = !isSupabaseConfigured;
export type { Api } from "./types";
export * from "./types";
