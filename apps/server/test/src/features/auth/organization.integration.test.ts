import { describe, expect, it } from "bun:test";
import {
	getAuthTestClient,
	getAuthTestRuntime,
	setupAuthTestLifecycle,
} from "./helpers";

setupAuthTestLifecycle({
	disableRedis: true,
});

type OrgResult = { id: string; name: string; slug: string };
type InvitationResult = { id: string; email: string; status: string };

describe("POST /v1/auth/organization/create", () => {
	it("admin pode criar uma organização", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const admin = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		await authClient.saveUser(admin);
		const adminHeaders = await authClient.getAuthHeaders({ userId: admin.id });

		const org = (await runtime.auth.api.createOrganization({
			body: { name: "Test Corp", slug: "test-corp", metadata: undefined },
			headers: adminHeaders,
		})) as OrgResult;

		expect(org.name).toBe("Test Corp");
	});

	it("usuário sem role admin não pode criar organização", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const member = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "member@example.com",
			role: "user",
		});
		await authClient.saveUser(member);
		const memberHeaders = await authClient.getAuthHeaders({
			userId: member.id,
		});

		const res = await runtime.app.request("/v1/auth/organization/create", {
			method: "POST",
			headers: { "content-type": "application/json", ...memberHeaders },
			body: JSON.stringify({ name: "Forbidden Corp", slug: "forbidden-corp" }),
		});
		expect(res.status).toBe(401);
	});
});

describe("Convites de membros", () => {
	it("admin pode convidar membro para uma organização", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const admin = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		await authClient.saveUser(admin);
		const adminHeaders = await authClient.getAuthHeaders({ userId: admin.id });

		const org = (await runtime.auth.api.createOrganization({
			body: {
				name: "Test Corp",
				slug: "test-corp-invites",
				metadata: undefined,
			},
			headers: adminHeaders,
		})) as OrgResult;

		const invResult = (await runtime.auth.api.createInvitation({
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
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const admin = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		await authClient.saveUser(admin);
		const adminHeaders = await authClient.getAuthHeaders({ userId: admin.id });

		const org = (await runtime.auth.api.createOrganization({
			body: {
				name: "Test Corp",
				slug: "test-corp-accept",
				metadata: undefined,
			},
			headers: adminHeaders,
		})) as OrgResult;

		const invResult = (await runtime.auth.api.createInvitation({
			body: {
				organizationId: org.id,
				email: "joiner@example.com",
				role: "member",
			},
			headers: adminHeaders,
		})) as { invitation: InvitationResult } | InvitationResult;
		const invId =
			"invitation" in invResult ? invResult.invitation.id : invResult.id;

		const joiner = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "joiner@example.com",
		});
		await authClient.saveUser(joiner);
		const joinerHeaders = await authClient.getAuthHeaders({
			userId: joiner.id,
		});

		await expect(
			runtime.auth.api.acceptInvitation({
				body: { invitationId: invId },
				headers: joinerHeaders,
			}),
		).resolves.toBeDefined();
	});
});

describe("Gerenciamento de membros", () => {
	it("admin pode remover membro de uma organização", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const admin = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		const member = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "member@example.com",
		});
		await authClient.saveUser(admin);
		await authClient.saveUser(member);
		const adminHeaders = await authClient.getAuthHeaders({ userId: admin.id });

		const org = (await runtime.auth.api.createOrganization({
			body: {
				name: "Test Corp",
				slug: "test-corp-remove",
				metadata: undefined,
			},
			headers: adminHeaders,
		})) as OrgResult;

		await authClient.addMember({
			userId: member.id,
			organizationId: org.id,
			role: "member",
		});

		await expect(
			runtime.auth.api.removeMember({
				body: { organizationId: org.id, memberIdOrEmail: member.email },
				headers: adminHeaders,
			}),
		).resolves.toBeDefined();
	});

	it("admin pode atualizar o role de um membro", async () => {
		const authClient = getAuthTestClient();
		const runtime = getAuthTestRuntime();
		const admin = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "admin@example.com",
			role: "admin",
		});
		const member = authClient.createUser({
			id: Bun.randomUUIDv7(),
			email: "member@example.com",
		});
		await authClient.saveUser(admin);
		await authClient.saveUser(member);
		const adminHeaders = await authClient.getAuthHeaders({ userId: admin.id });

		const org = (await runtime.auth.api.createOrganization({
			body: { name: "Test Corp", slug: "test-corp-role", metadata: undefined },
			headers: adminHeaders,
		})) as OrgResult;

		const memberEntry = await authClient.addMember({
			userId: member.id,
			organizationId: org.id,
			role: "member",
		});

		expect(
			runtime.auth.api.updateMemberRole({
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
