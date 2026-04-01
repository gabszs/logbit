import { index, pgTable, text, timestamp, uuid, enum  } from "drizzle-orm/pg-core";
import { users } from "./authModels";

export const userSettings = pgTable(
    "opamp_agents",
    {
        id: uuid("id")
            .primaryKey()
            .$defaultFn(() => Bun.randomUUIDv7()),
        userId: uuid("user_id")
            .notNull()
            .unique()
            .references(() => users.id, { onDelete: "cascade" }),
        instanceUid: text("instance_uid").notNull(),
        status: enum("status", ["UNSET", "APPLIED", "APPLYING", "FAILED"]).notNull(),
        sequenceNum: text("sequence_num").notNull(),
        agentDescription: text("agent_description"),
        capabilities: text("capabilities").notNull(),
        effectiveConfig: text("effective_config"),
        remoteConfigStatus: text("remote_config_status"),
        lastSeen: timestamp("last_seen").notNull(),
        currentConfigHash: text("current_config_hash"),
        
        createdAt: timestamp("created_at").notNull(),
        updatedAt: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index("opamp_agents_userId_idx").on(table.userId)],
);

// export interface Agent {
//   instanceUid: Buffer;
//   sequenceNum: number;
//   agentDescription?: AgentDescription;
//   capabilities: number;
//   effectiveConfig?: EffectiveConfig;
//   remoteConfigStatus?: RemoteConfigStatus;
//   lastSeen: Date;
//   currentConfigHash?: Buffer;
// }
