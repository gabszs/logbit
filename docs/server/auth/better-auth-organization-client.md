# better-auth — Organization Plugin (Cliente)

Referência completa da API do cliente. Tudo que você precisa para implementar organizações no frontend.

---

## Setup

```ts
import { createAuthClient } from "better-auth/client"
import { organizationClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [
    organizationClient()
  ]
})
```

---

## Organizações

### Criar organização

```ts
const { data, error } = await authClient.organization.create({
  name: "Minha Empresa",
  slug: "minha-empresa",
  logo: "https://...",               // opcional
  metadata: { plan: "pro" },         // opcional
  keepCurrentActiveOrganization: false // opcional
})
```

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `name` | `string` | sim | Nome da organização |
| `slug` | `string` | sim | Identificador único na URL |
| `logo` | `string` | não | URL do logo |
| `metadata` | `Record<string, any>` | não | Dados extras livres |
| `keepCurrentActiveOrganization` | `boolean` | não | Mantém a org ativa atual após criar |

---

### Listar organizações do usuário

```ts
const { data: organizations } = await authClient.organization.list()
```

**Hook reativo (React/Vue/Svelte):**

```ts
// React
const { data: organizations } = authClient.useListOrganizations()

// Svelte
const organizations = authClient.useListOrganizations()
// $organizations.data

// Vue
const organizations = authClient.useListOrganizations()
// organizations.data
```

---

### Buscar organização completa

```ts
const { data } = await authClient.organization.getFullOrganization({
  organizationId: "org-id",    // opcional, usa a ativa por padrão
  organizationSlug: "meu-slug", // opcional
  membersLimit: 50              // opcional, padrão 100
})
```

---

### Atualizar organização

```ts
await authClient.organization.update({
  organizationId: "org-id",
  data: {
    name: "Novo Nome",
    slug: "novo-slug",
    logo: "https://...",
    metadata: { plan: "enterprise" }
  }
})
```

---

### Deletar organização

Somente o **owner** pode deletar.

```ts
await authClient.organization.delete({
  organizationId: "org-id"
})
```

---

### Verificar se slug está disponível

```ts
const { data } = await authClient.organization.checkSlug({
  slug: "meu-slug"
})
// data.status === true se disponível
```

---

## Organização Ativa

### Definir organização ativa

```ts
// Ativar por ID
await authClient.organization.setActive({ organizationId: "org-id" })

// Ativar por slug
await authClient.organization.setActive({ organizationSlug: "meu-slug" })

// Desativar (sem org ativa)
await authClient.organization.setActive({ organizationId: null })
```

---

### Ler organização ativa (hook reativo)

```ts
// React
const { data: activeOrg } = authClient.useActiveOrganization()
// activeOrg?.name, activeOrg?.id ...

// Svelte
const activeOrg = authClient.useActiveOrganization()
// $activeOrg.data?.name

// Vue
const activeOrg = authClient.useActiveOrganization()
// activeOrg.data?.name
```

O hook re-renderiza automaticamente quando a org ativa muda.

---

## Membros

### Listar membros

```ts
const { data } = await authClient.organization.listMembers({
  organizationId: "org-id", // opcional, usa a ativa
  limit: 20,
  offset: 0,
  sortBy: "createdAt",
  sortDirection: "desc",     // "asc" | "desc"
  filterField: "role",
  filterOperator: "eq",      // "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "not_in" | "contains" | "starts_with" | "ends_with"
  filterValue: "admin"
})
```

---

### Remover membro

```ts
await authClient.organization.removeMember({
  memberIdOrEmail: "user@exemplo.com", // aceita ID ou email
  organizationId: "org-id"             // opcional
})
```

---

### Atualizar papel de um membro

```ts
await authClient.organization.updateMemberRole({
  memberId: "member-id",
  role: "admin",              // string ou array: ["admin", "sales"]
  organizationId: "org-id"   // opcional
})
```

---

### Buscar membro atual (da org ativa)

```ts
const { data: member } = await authClient.organization.getActiveMember()
// member.id, member.role, member.userId ...
```

---

### Buscar papel do membro atual

```ts
const { data: { role } } = await authClient.organization.getActiveMemberRole()
```

---

### Sair de uma organização

```ts
await authClient.organization.leave({
  organizationId: "org-id"
})
```

---

## Convites

### Convidar membro

> O servidor precisa ter `sendInvitationEmail` configurado para os emails funcionarem.

```ts
await authClient.organization.inviteMember({
  email: "usuario@exemplo.com",
  role: "member",              // "owner" | "admin" | "member" ou papel customizado
  organizationId: "org-id",   // opcional
  resend: false,               // reenviar se já convidado
  teamId: "team-id"            // opcional
})
```

---

### Aceitar convite

O usuário **precisa estar logado** para aceitar. O `invitationId` vem na URL do link enviado por email.

```ts
// Geralmente na página /aceitar-convite/[id]
await authClient.organization.acceptInvitation({
  invitationId: "invitation-id"
})
```

---

### Recusar convite

```ts
await authClient.organization.rejectInvitation({
  invitationId: "invitation-id"
})
```

---

### Cancelar convite (pelo remetente/admin)

```ts
await authClient.organization.cancelInvitation({
  invitationId: "invitation-id"
})
```

---

### Buscar dados de um convite

```ts
const { data: invitation } = await authClient.organization.getInvitation({
  id: "invitation-id"
})
```

---

### Listar convites de uma organização

```ts
const { data } = await authClient.organization.listInvitations({
  organizationId: "org-id" // opcional, usa a ativa
})
```

---

### Listar convites recebidos pelo usuário

```ts
// Lista todos os convites pendentes do usuário logado
const invitations = await authClient.organization.listUserInvitations()
```

---

## Permissões

### Verificar permissão (consulta o servidor)

Sempre confiável. Inclui papéis dinâmicos. Use este em verificações críticas.

```ts
// Verificação simples
const { data } = await authClient.organization.hasPermission({
  permissions: {
    project: ["create"]
  }
})

// Múltiplos recursos ao mesmo tempo
const { data } = await authClient.organization.hasPermission({
  permissions: {
    project: ["create", "delete"],
    member: ["update"]
  }
})
```

---

### Verificar permissão de um papel (síncrono, local)

Não faz request. Não inclui papéis dinâmicos criados em runtime.

```ts
const canDelete = authClient.organization.checkRolePermission({
  permissions: {
    organization: ["delete"]
  },
  role: "admin"
})
// retorna boolean
```

> Para papéis criados dinamicamente, use `hasPermission()` em vez disso.

---

## Times (Teams)

> Requer `teams: { enabled: true }` no setup do cliente e do servidor.

```ts
// Setup com teams habilitado
export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      teams: { enabled: true }
    })
  ]
})
```

---

### Criar time

```ts
await authClient.organization.createTeam({
  name: "Frontend",
  organizationId: "org-id" // opcional
})
```

---

### Listar times da organização

```ts
const { data: teams } = await authClient.organization.listTeams({
  organizationId: "org-id" // opcional
})
```

---

### Atualizar time

```ts
await authClient.organization.updateTeam({
  teamId: "team-id",
  data: { name: "Novo Nome do Time" }
})
```

---

### Remover time

```ts
await authClient.organization.removeTeam({
  teamId: "team-id",
  organizationId: "org-id" // opcional
})
```

---

### Definir time ativo

```ts
await authClient.organization.setActiveTeam({ teamId: "team-id" })

// Desativar
await authClient.organization.setActiveTeam({ teamId: null })
```

---

### Listar times do usuário atual

```ts
const { data: myTeams } = await authClient.organization.listUserTeams()
```

---

### Listar membros de um time

```ts
const { data } = await authClient.organization.listTeamMembers({
  teamId: "team-id" // opcional, usa o time ativo
})
```

---

### Adicionar membro a um time

```ts
await authClient.organization.addTeamMember({
  teamId: "team-id",
  userId: "user-id"
})
```

> Ao convidar um membro para a organização, você também pode especificar um `teamId` no `inviteMember()`.

---

### Remover membro de um time

```ts
await authClient.organization.removeTeamMember({
  teamId: "team-id",
  userId: "user-id"
})
```

---

## Papéis padrão

| Papel | Permissões |
|-------|-----------|
| `owner` | Controle total — pode deletar a org e transferir ownership |
| `admin` | Controle total, exceto deletar a org ou mudar o owner |
| `member` | Somente leitura — sem permissão para criar, atualizar ou deletar recursos |

> Um usuário pode ter múltiplos papéis. Papéis são armazenados separados por vírgula.

---

## Papéis e permissões customizadas

Para usar permissões customizadas, configure o `ac` no cliente:

```ts
import { createAuthClient } from "better-auth/client"
import { organizationClient } from "better-auth/client/plugins"
import { ac, owner, admin, member, myCustomRole } from "@/auth/permissions"

export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac,
      roles: { owner, admin, member, myCustomRole }
    })
  ]
})
```