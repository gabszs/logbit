import type { TestHelpers } from "better-auth/plugins";
import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { truncateAllTables } from "../../setup/db";
import { isolateTestSettings } from "../../setup/settings";

isolateTestSettings();

const { app } = await import("@/index");
const { auth } = await import("@/lib/auth");

type OrgResult = { id: string; name: string; slug: string };
type InvitationResult = { id: string; email: string; status: string };

describe("POST /v1/auth/organization/create", () => {
	let auth_client: TestHelpers;

	beforeAll(async () => {
		const ctx = await auth.$context;
		auth_client = ctx.test;
	});

	afterEach(async () => {
		await truncateAllTables();
	});

	it("admin pode criar uma organização", async () => {
		const admin = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		await auth_client.saveUser(admin);
		const adminHeaders = await auth_client.getAuthHeaders({ userId: admin.id });

		const org = (await auth.api.createOrganization({
			body: { name: "Test Corp", slug: "test-corp", metadata: undefined },
			headers: adminHeaders,
		})) as OrgResult;

		expect(org.name).toBe("Test Corp");
	});

	it("usuário sem role admin não pode criar organização", async () => {
		const member = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "member@example.com",
			role: "user",
		});
		await auth_client.saveUser(member);
		const memberHeaders = await auth_client.getAuthHeaders({
			userId: member.id,
		});

		const res = await app.request("/v1/auth/organization/create", {
			method: "POST",
			headers: { "content-type": "application/json", ...memberHeaders },
			body: JSON.stringify({ name: "Forbidden Corp", slug: "forbidden-corp" }),
		});
		expect(res.status).toBe(401);
	});
});

describe("Convites de membros", () => {
	let auth_client: TestHelpers;

	beforeAll(async () => {
		const ctx = await auth.$context;
		auth_client = ctx.test;
	});

	afterEach(async () => {
		await truncateAllTables();
	});

	it("admin pode convidar membro para uma organização", async () => {
		const admin = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		await auth_client.saveUser(admin);
		const adminHeaders = await auth_client.getAuthHeaders({ userId: admin.id });

		const org = (await auth.api.createOrganization({
			body: {
				name: "Test Corp",
				slug: "test-corp-invites",
				metadata: undefined,
			},
			headers: adminHeaders,
		})) as OrgResult;

		const invResult = (await auth.api.createInvitation({
			body: {
				organizationId: org.id,
				email: "newmember@example.com",
				role: "member",
			},
			headers: adminHeaders,
		})) as { invitation: InvitationResult } | InvitationResult;

		const inv: InvitationResult =
			"invitation" in invResult ? invResult.invitation : invResult;
		expect(inv.email).toBe("newmember@example.com");
		expect(inv.status).toBe("pending");
	});

	it("membro pode aceitar um convite", async () => {
		const admin = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		await auth_client.saveUser(admin);
		const adminHeaders = await auth_client.getAuthHeaders({ userId: admin.id });

		const org = (await auth.api.createOrganization({
			body: {
				name: "Test Corp",
				slug: "test-corp-accept",
				metadata: undefined,
			},
			headers: adminHeaders,
		})) as OrgResult;

		const invResult = (await auth.api.createInvitation({
			body: {
				organizationId: org.id,
				email: "joiner@example.com",
				role: "member",
			},
			headers: adminHeaders,
		})) as { invitation: InvitationResult } | InvitationResult;
		const invId =
			"invitation" in invResult ? invResult.invitation.id : invResult.id;

		const joiner = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "joiner@example.com",
		});
		await auth_client.saveUser(joiner);
		const joinerHeaders = await auth_client.getAuthHeaders({
			userId: joiner.id,
		});

		await expect(
			auth.api.acceptInvitation({
				body: { invitationId: invId },
				headers: joinerHeaders,
			}),
		).resolves.toBeDefined();
	});
});

describe("Gerenciamento de membros", () => {
	let auth_client: TestHelpers;

	beforeAll(async () => {
		const ctx = await auth.$context;
		auth_client = ctx.test;
	});

	afterEach(async () => {
		await truncateAllTables();
	});

	it("admin pode remover membro de uma organização", async () => {
		const admin = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		const member = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "member@example.com",
		});
		await auth_client.saveUser(admin);
		await auth_client.saveUser(member);
		const adminHeaders = await auth_client.getAuthHeaders({ userId: admin.id });

		const org = (await auth.api.createOrganization({
			body: {
				name: "Test Corp",
				slug: "test-corp-remove",
				metadata: undefined,
			},
			headers: adminHeaders,
		})) as OrgResult;

		await auth_client.addMember({
			userId: member.id,
			organizationId: org.id,
			role: "member",
		});

		await expect(
			auth.api.removeMember({
				body: { organizationId: org.id, memberIdOrEmail: member.email },
				headers: adminHeaders,
			}),
		).resolves.toBeDefined();
	});

	it("admin pode atualizar o role de um membro", async () => {
		const admin = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		const member = auth_client.createUser({
			id: Bun.randomUUIDv7(),
			email: "member@example.com",
		});
		await auth_client.saveUser(admin);
		await auth_client.saveUser(member);
		const adminHeaders = await auth_client.getAuthHeaders({ userId: admin.id });

		const org = (await auth.api.createOrganization({
			body: { name: "Test Corp", slug: "test-corp-role", metadata: undefined },
			headers: adminHeaders,
		})) as OrgResult;

		const memberEntry = await auth_client.addMember({
			userId: member.id,
			organizationId: org.id,
			role: "member",
		});

		expect(
			auth.api.updateMemberRole({
				body: {
					organizationId: org.id,
					memberId: memberEntry.id,
					role: "admin",
				},
				headers: adminHeaders,
			}),
		).resolves.toBeDefined();
	});
});
