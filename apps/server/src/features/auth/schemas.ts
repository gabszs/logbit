import { createSelectSchema } from "drizzle-zod";
import type z from "zod";
import { models } from "@/db/models";

export const usersSchema = createSelectSchema(models.users);
export type UsersType = z.infer<typeof usersSchema>;

export const sessionsSchema = createSelectSchema(models.sessions);
export type SessionsType = z.infer<typeof sessionsSchema>;

export const accountsSchema = createSelectSchema(models.accounts);
export type AccountsType = z.infer<typeof accountsSchema>;

export const verificationsSchema = createSelectSchema(models.verifications);
export type VerificationsType = z.infer<typeof verificationsSchema>;

export const apikeysSchema = createSelectSchema(models.apikeys);
export type ApikeysType = z.infer<typeof apikeysSchema>;

export const organizationsSchema = createSelectSchema(models.organizations);
export type OrganizationsType = z.infer<typeof organizationsSchema>;

export const membersSchema = createSelectSchema(models.members);
export type MembersType = z.infer<typeof membersSchema>;

export const invitationsSchema = createSelectSchema(models.invitations);
export type InvitationsType = z.infer<typeof invitationsSchema>;

export const twoFactorsSchema = createSelectSchema(models.twoFactors);
export type TwoFactorsType = z.infer<typeof twoFactorsSchema>;
