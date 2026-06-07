import { warnIfSupabasePublicEnvMissing } from "@nebula/shared";

/** Warn once at web startup when public Supabase env is incomplete. */
warnIfSupabasePublicEnvMissing(process.env);
