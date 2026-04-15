# Better Auth — Admin Client: Métodos e Contratos

> Todos os métodos via `authClient.admin.*`  
> Retorno padrão: `{ data, error }`

---

## Usuários

### `createUser`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `email` | string | ✅ |
| `password` | string | ✅ |
| `name` | string | ✅ |
| `role` | string \| string[] | — |
| `data` | Record<string, any> | — |

### `listUsers`
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `searchValue` | string | Valor a buscar |
| `searchField` | `"email"` \| `"name"` | Campo de busca |
| `searchOperator` | `"contains"` \| `"starts_with"` \| `"ends_with"` | — |
| `limit` | number | Default: 100 |
| `offset` | number | Para paginação |
| `sortBy` | string | Campo de ordenação |
| `sortDirection` | `"asc"` \| `"desc"` | — |
| `filterField` | string | Campo de filtro |
| `filterValue` | string \| number \| boolean \| string[] \| number[] | — |
| `filterOperator` | `"eq"` \| `"ne"` \| `"lt"` \| `"lte"` \| `"gt"` \| `"gte"` \| `"in"` \| `"not_in"` \| `"contains"` \| `"starts_with"` \| `"ends_with"` | — |

**Response:**
| Campo | Tipo |
|-------|------|
| `users` | User[] |
| `total` | number |
| `limit` | number \| undefined |
| `offset` | number \| undefined |

### `getUser`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `query.id` | string | ✅ |

### `updateUser`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |
| `data` | Record<string, any> | ✅ |

### `removeUser`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |

---

## Roles e Permissões

### `setRole`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |
| `role` | string \| string[] | ✅ |

### `setUserPassword`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |
| `newPassword` | string | ✅ |

### `hasPermission` *(async, consulta servidor)*
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | — |
| `permission` | Record<string, string[]> | usar este **ou** `permissions` |
| `permissions` | Record<string, string[]> | usar este **ou** `permission` |

### `checkRolePermission` *(síncrono, sem request)*
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `role` | string | ✅ |
| `permissions` | Record<string, string[]> | ✅ |

Retorna `boolean` diretamente.

---

## Ban / Unban

### `banUser`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |
| `banReason` | string | — |
| `banExpiresIn` | number (segundos) | — (omitir = permanente) |

### `unbanUser`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |

---

## Sessões

### `listUserSessions`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |

### `revokeUserSession`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `sessionToken` | string | ✅ |

### `revokeUserSessions`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |

---

## Impersonação

### `impersonateUser`
| Parâmetro | Tipo | Obrigatório |
|-----------|------|-------------|
| `userId` | string | ✅ |

### `stopImpersonating`
Sem parâmetros.

---

## Schema do usuário (campos extras)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `role` | string | Role do usuário |
| `banned` | boolean | Se está banido |
| `banReason` | string | Motivo do ban |
| `banExpires` | date | Expiração do ban |

## Schema da sessão (campos extras)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `impersonatedBy` | string | ID do admin que impersonou |