CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_ref" text NOT NULL,
	"target_label" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anticheat_alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"detection_type" text NOT NULL,
	"severity" text NOT NULL,
	"details" text,
	"location_x" real,
	"location_y" real,
	"location_z" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automod_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"player_id" uuid,
	"triggered_at" timestamp with time zone NOT NULL,
	"action_taken" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automod_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"action" text NOT NULL,
	"player_message" text,
	"mute_duration_seconds" integer,
	"cooldown_scope" text DEFAULT 'none' NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ban_server_scopes" (
	"tenant_id" text NOT NULL,
	"ban_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ban_server_scopes_pkey" PRIMARY KEY("ban_id","server_id")
);
--> statement-breakpoint
CREATE TABLE "bans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"ban_type" text NOT NULL,
	"steam_id" text,
	"ip_cidr" "inet",
	"tenant_wide" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"parent_ban_id" uuid,
	"author_user_id" text,
	"banned_by_player_id" uuid,
	"reason_category" text,
	"reason_detail" text,
	"expires_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by_user_id" text,
	"lifted_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bans_identity_shape" CHECK ((
          ("bans"."ban_type" = 'player' AND "bans"."steam_id" IS NOT NULL
            AND "bans"."ip_cidr" IS NULL)
          OR ("bans"."ban_type" = 'ip' AND "bans"."ip_cidr" IS NOT NULL
            AND "bans"."steam_id" IS NULL)
          OR ("bans"."ban_type" = 'hybrid' AND "bans"."steam_id" IS NOT NULL
            AND "bans"."ip_cidr" IS NULL)
        )),
	CONSTRAINT "bans_auto_has_parent" CHECK (("bans"."source" <> 'auto' OR "bans"."parent_ban_id" IS NOT NULL)),
	CONSTRAINT "bans_lift_order" CHECK (("bans"."lifted_at" IS NULL
          OR "bans"."lifted_at" >= "bans"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "death_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"victim_player_id" uuid NOT NULL,
	"killer_player_id" uuid,
	"killer_npc_type" text,
	"source" text NOT NULL,
	"cause" text NOT NULL,
	"victim_x" real NOT NULL,
	"victim_y" real NOT NULL,
	"victim_z" real NOT NULL,
	"killer_x" real,
	"killer_y" real,
	"killer_z" real,
	"weapon_item_id" text,
	"weapon_name" text,
	"weapon_ammo_type" text,
	"weapon_attachments" jsonb,
	"hit_zone" text,
	"hit_distance_meters" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_ban_list_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"list_id" uuid NOT NULL,
	"steam_id" text NOT NULL,
	"reason" text,
	"evidence_url" text,
	"added_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_ban_list_entries_list_steam_unique" UNIQUE("list_id","steam_id")
);
--> statement-breakpoint
CREATE TABLE "external_ban_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sync_interval_seconds" integer DEFAULT 21600 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_ban_lists_tenant_url_unique" UNIQUE("tenant_id","url")
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_risk_cache" (
	"ip" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"risk" jsonb NOT NULL,
	"verdict" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "player_flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"player_id" uuid NOT NULL,
	"flag_type" text NOT NULL,
	"severity" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_flags_player_type_unique" UNIQUE("player_id","flag_type")
);
--> statement-breakpoint
CREATE TABLE "player_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"player_id" uuid NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"end_reason" text,
	"join_display_name" text NOT NULL,
	"join_ip" text NOT NULL,
	"join_ping_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_steam_cache" (
	"steam_id" text PRIMARY KEY NOT NULL,
	"persona_name" text,
	"avatar_url" text,
	"profile_visibility" text,
	"account_created_at" timestamp with time zone,
	"country_code" text,
	"vac_banned" boolean DEFAULT false NOT NULL,
	"vac_ban_count" integer DEFAULT 0 NOT NULL,
	"game_ban_count" integer DEFAULT 0 NOT NULL,
	"community_banned" boolean DEFAULT false NOT NULL,
	"economy_ban_status" text NOT NULL,
	"last_ban_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"steam_id" text NOT NULL,
	"display_name" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_tenant_steam_id_unique" UNIQUE("tenant_id","steam_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_task_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_task_servers" (
	"tenant_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_task_servers_pkey" PRIMARY KEY("task_id","server_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"task_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"cron_expression" text NOT NULL,
	"tenant_wide" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_reason" text,
	"paused_by_user_id" text,
	"last_ran_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"steam_id" text NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_admins_server_steam_unique" UNIQUE("server_id","steam_id")
);
--> statement-breakpoint
CREATE TABLE "server_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"player_count" integer NOT NULL,
	"connection_state" text NOT NULL,
	"latency_ms" integer,
	"tick_rate_hz" real,
	"memory_mb" integer,
	"avg_frame_ms" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_permissions_server_user_unique" UNIQUE("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "server_runtime" (
	"server_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"connection_state" text NOT NULL,
	"player_count" integer,
	"latency_ms" integer,
	"last_connected_at" timestamp with time zone,
	"last_disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"region" text,
	"rcon_host" text NOT NULL,
	"rcon_port" integer NOT NULL,
	"rcon_password_encrypted" text NOT NULL,
	"game_ip" text,
	"game_port" integer,
	"server_name_reported" text,
	"game_version" text,
	"rcon_protocol_version" text,
	"seed" text,
	"max_players" integer,
	"save_interval_seconds" integer,
	"server_started_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servers_tenant_handle_unique" UNIQUE("tenant_id","handle")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"status" text NOT NULL,
	"response_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"url_encrypted" text NOT NULL,
	"secret_encrypted" text,
	"subscribed_events" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_reason" text,
	"paused_by_user_id" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitelist_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"steam_id" text NOT NULL,
	"note" text,
	"source" text NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whitelist_entries_server_steam_unique" UNIQUE("server_id","steam_id")
);
--> statement-breakpoint
CREATE TABLE "wipe_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"wipe_schedule_id" uuid,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"author_user_id" text,
	"target_steam_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"wiped_at" timestamp with time zone,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wipe_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"server_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"cron_expression" text NOT NULL,
	"wipe_type" text NOT NULL,
	"kick_before_wipe" boolean DEFAULT true NOT NULL,
	"force_save_before_wipe" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_alerts" ADD CONSTRAINT "anticheat_alerts_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_alerts" ADD CONSTRAINT "anticheat_alerts_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_alerts" ADD CONSTRAINT "anticheat_alerts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automod_executions" ADD CONSTRAINT "automod_executions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automod_executions" ADD CONSTRAINT "automod_executions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automod_executions" ADD CONSTRAINT "automod_executions_rule_id_automod_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automod_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automod_executions" ADD CONSTRAINT "automod_executions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automod_rules" ADD CONSTRAINT "automod_rules_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automod_rules" ADD CONSTRAINT "automod_rules_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automod_rules" ADD CONSTRAINT "automod_rules_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ban_server_scopes" ADD CONSTRAINT "ban_server_scopes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ban_server_scopes" ADD CONSTRAINT "ban_server_scopes_ban_id_bans_id_fk" FOREIGN KEY ("ban_id") REFERENCES "public"."bans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ban_server_scopes" ADD CONSTRAINT "ban_server_scopes_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_parent_ban_id_bans_id_fk" FOREIGN KEY ("parent_ban_id") REFERENCES "public"."bans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_banned_by_player_id_players_id_fk" FOREIGN KEY ("banned_by_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_lifted_by_user_id_user_id_fk" FOREIGN KEY ("lifted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "death_events" ADD CONSTRAINT "death_events_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "death_events" ADD CONSTRAINT "death_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "death_events" ADD CONSTRAINT "death_events_victim_player_id_players_id_fk" FOREIGN KEY ("victim_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "death_events" ADD CONSTRAINT "death_events_killer_player_id_players_id_fk" FOREIGN KEY ("killer_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_outbox" ADD CONSTRAINT "event_outbox_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_ban_list_entries" ADD CONSTRAINT "external_ban_list_entries_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_ban_list_entries" ADD CONSTRAINT "external_ban_list_entries_list_id_external_ban_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."external_ban_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_ban_lists" ADD CONSTRAINT "external_ban_lists_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_flags" ADD CONSTRAINT "player_flags_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_flags" ADD CONSTRAINT "player_flags_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_notes" ADD CONSTRAINT "player_notes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_notes" ADD CONSTRAINT "player_notes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_notes" ADD CONSTRAINT "player_notes_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_executions" ADD CONSTRAINT "scheduled_task_executions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_executions" ADD CONSTRAINT "scheduled_task_executions_task_id_scheduled_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."scheduled_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_executions" ADD CONSTRAINT "scheduled_task_executions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_servers" ADD CONSTRAINT "scheduled_task_servers_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_servers" ADD CONSTRAINT "scheduled_task_servers_task_id_scheduled_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."scheduled_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_servers" ADD CONSTRAINT "scheduled_task_servers_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_paused_by_user_id_user_id_fk" FOREIGN KEY ("paused_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_admins" ADD CONSTRAINT "server_admins_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_admins" ADD CONSTRAINT "server_admins_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_admins" ADD CONSTRAINT "server_admins_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_metrics" ADD CONSTRAINT "server_metrics_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_metrics" ADD CONSTRAINT "server_metrics_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_permissions" ADD CONSTRAINT "server_permissions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_permissions" ADD CONSTRAINT "server_permissions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_permissions" ADD CONSTRAINT "server_permissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_runtime" ADD CONSTRAINT "server_runtime_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_runtime" ADD CONSTRAINT "server_runtime_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_paused_by_user_id_user_id_fk" FOREIGN KEY ("paused_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whitelist_entries" ADD CONSTRAINT "whitelist_entries_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whitelist_entries" ADD CONSTRAINT "whitelist_entries_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whitelist_entries" ADD CONSTRAINT "whitelist_entries_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wipe_runs" ADD CONSTRAINT "wipe_runs_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wipe_runs" ADD CONSTRAINT "wipe_runs_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wipe_runs" ADD CONSTRAINT "wipe_runs_wipe_schedule_id_wipe_schedules_id_fk" FOREIGN KEY ("wipe_schedule_id") REFERENCES "public"."wipe_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wipe_runs" ADD CONSTRAINT "wipe_runs_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wipe_schedules" ADD CONSTRAINT "wipe_schedules_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wipe_schedules" ADD CONSTRAINT "wipe_schedules_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_tenant_created_idx" ON "activity_log" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_log_tenant_server_created_idx" ON "activity_log" USING btree ("tenant_id","server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_log_tenant_actor_created_idx" ON "activity_log" USING btree ("tenant_id","actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "anticheat_alerts_tenant_server_created_idx" ON "anticheat_alerts" USING btree ("tenant_id","server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "anticheat_alerts_tenant_player_created_idx" ON "anticheat_alerts" USING btree ("tenant_id","player_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automod_executions_tenant_rule_triggered_idx" ON "automod_executions" USING btree ("tenant_id","rule_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automod_executions_tenant_server_triggered_idx" ON "automod_executions" USING btree ("tenant_id","server_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automod_executions_tenant_player_triggered_idx" ON "automod_executions" USING btree ("tenant_id","player_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automod_rules_tenant_server_idx" ON "automod_rules" USING btree ("tenant_id","server_id");--> statement-breakpoint
CREATE INDEX "automod_rules_runnable_idx" ON "automod_rules" USING btree ("tenant_id","server_id") WHERE "automod_rules"."enabled" = true;--> statement-breakpoint
CREATE INDEX "ban_server_scopes_tenant_server_idx" ON "ban_server_scopes" USING btree ("tenant_id","server_id");--> statement-breakpoint
CREATE INDEX "bans_tenant_created_idx" ON "bans" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bans_active_player_idx" ON "bans" USING btree ("tenant_id","steam_id") WHERE "bans"."lifted_at" IS NULL
          AND "bans"."ban_type" IN ('player', 'hybrid');--> statement-breakpoint
CREATE INDEX "bans_active_ip_idx" ON "bans" USING btree ("ip_cidr") WHERE "bans"."lifted_at" IS NULL
          AND "bans"."ban_type" = 'ip';--> statement-breakpoint
CREATE INDEX "bans_expiry_idx" ON "bans" USING btree ("expires_at") WHERE "bans"."expires_at" IS NOT NULL
          AND "bans"."lifted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "bans_parent_idx" ON "bans" USING btree ("parent_ban_id");--> statement-breakpoint
CREATE INDEX "chat_messages_tenant_server_created_idx" ON "chat_messages" USING btree ("tenant_id","server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_messages_tenant_player_created_idx" ON "chat_messages" USING btree ("tenant_id","player_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "death_events_tenant_server_created_idx" ON "death_events" USING btree ("tenant_id","server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "death_events_tenant_killer_created_idx" ON "death_events" USING btree ("tenant_id","killer_player_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "death_events_tenant_victim_created_idx" ON "death_events" USING btree ("tenant_id","victim_player_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "event_outbox_pending_idx" ON "event_outbox" USING btree ("tenant_id","available_at","created_at") WHERE "event_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "event_outbox_stuck_idx" ON "event_outbox" USING btree ("locked_at") WHERE "event_outbox"."status" = 'processing';--> statement-breakpoint
CREATE INDEX "event_outbox_retention_idx" ON "event_outbox" USING btree ("processed_at") WHERE "event_outbox"."status" = 'delivered';--> statement-breakpoint
CREATE INDEX "event_outbox_dead_idx" ON "event_outbox" USING btree ("tenant_id","processed_at" DESC NULLS LAST) WHERE "event_outbox"."status" = 'dead';--> statement-breakpoint
CREATE INDEX "external_ban_list_entries_tenant_steam_idx" ON "external_ban_list_entries" USING btree ("tenant_id","steam_id");--> statement-breakpoint
CREATE INDEX "game_events_tenant_server_created_idx" ON "game_events" USING btree ("tenant_id","server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "game_events_tenant_server_type_created_idx" ON "game_events" USING btree ("tenant_id","server_id","type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ip_risk_cache_expires_idx" ON "ip_risk_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "player_flags_tenant_created_idx" ON "player_flags" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_notes_player_created_idx" ON "player_notes" USING btree ("player_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_sessions_tenant_server_joined_idx" ON "player_sessions" USING btree ("tenant_id","server_id","joined_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_sessions_tenant_player_joined_idx" ON "player_sessions" USING btree ("tenant_id","player_id","joined_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "player_sessions_open_session_unique" ON "player_sessions" USING btree ("server_id","player_id") WHERE "player_sessions"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "player_steam_cache_expires_idx" ON "player_steam_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "players_tenant_last_seen_idx" ON "players" USING btree ("tenant_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scheduled_task_executions_tenant_task_ran_idx" ON "scheduled_task_executions" USING btree ("tenant_id","task_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scheduled_task_executions_tenant_server_ran_idx" ON "scheduled_task_executions" USING btree ("tenant_id","server_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scheduled_task_servers_tenant_server_idx" ON "scheduled_task_servers" USING btree ("tenant_id","server_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_tenant_idx" ON "scheduled_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_runnable_idx" ON "scheduled_tasks" USING btree ("tenant_id") WHERE "scheduled_tasks"."enabled" = true
          AND "scheduled_tasks"."paused_at" IS NULL;--> statement-breakpoint
CREATE INDEX "server_metrics_tenant_server_created_idx" ON "server_metrics" USING btree ("tenant_id","server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_created_idx" ON "webhook_deliveries" USING btree ("endpoint_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_deliveries_tenant_failed_idx" ON "webhook_deliveries" USING btree ("tenant_id","created_at" DESC NULLS LAST) WHERE "webhook_deliveries"."status" = 'failed';--> statement-breakpoint
CREATE INDEX "webhook_endpoints_tenant_server_idx" ON "webhook_endpoints" USING btree ("tenant_id","server_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_runnable_idx" ON "webhook_endpoints" USING btree ("tenant_id","server_id") WHERE "webhook_endpoints"."enabled" = true
          AND "webhook_endpoints"."paused_at" IS NULL;--> statement-breakpoint
CREATE INDEX "wipe_runs_tenant_server_started_idx" ON "wipe_runs" USING btree ("tenant_id","server_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wipe_runs_open_wipe_unique" ON "wipe_runs" USING btree ("server_id") WHERE "wipe_runs"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "wipe_schedules_tenant_server_idx" ON "wipe_schedules" USING btree ("tenant_id","server_id");